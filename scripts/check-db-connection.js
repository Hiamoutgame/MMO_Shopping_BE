// Read-only diagnosis: never print the connection URL, credentials, or user data.
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const net = require('node:net');
const dotenv = require('dotenv');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const environment = process.env.NODE_ENV ?? 'development';
const env = { ...process.env };
for (const file of [
  `.env.${environment}.local`,
  `.env.${environment}`,
  '.env',
]) {
  const location = path.join(root, file);
  if (!fs.existsSync(location)) continue;
  for (const [key, value] of Object.entries(
    dotenv.parse(fs.readFileSync(location)),
  )) {
    if (env[key] === undefined) env[key] = value;
  }
}

function safeError(error) {
  return {
    name: error.name,
    code: error.code,
    syscall: error.syscall,
    addressFamily: error.address ? net.isIP(error.address) : undefined,
    port: error.port,
    errors: Array.isArray(error.errors)
      ? error.errors.map(safeError)
      : undefined,
    cause: error.cause instanceof Error ? safeError(error.cause) : undefined,
  };
}

function probe(host, port, family) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port, family });
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      socket.destroy();
      console.log(
        JSON.stringify({
          step: 'TCP',
          family,
          ms: Date.now() - started,
          ...result,
        }),
      );
      resolve();
    };
    const deadline = setTimeout(
      () => finish({ status: 'probe-timeout-5000ms' }),
      5000,
    );
    socket.once('connect', () => finish({ status: 'connected' }));
    socket.once('error', (error) =>
      finish({ status: 'failed', ...safeError(error) }),
    );
  });
}

async function main() {
  // Same selection as src/config/database.config.ts; UNPOOLED is for migrations.
  const connectionString = env.DATABASE_URL || undefined;
  let host = env.DB_HOST;
  let port = Number(env.DB_PORT || 5432);
  if (connectionString) {
    let url;
    try {
      url = new URL(connectionString);
      if (!['postgres:', 'postgresql:'].includes(url.protocol))
        throw new Error();
    } catch {
      console.log(
        JSON.stringify({ step: 'config', status: 'invalid-database-url' }),
      );
      process.exitCode = 1;
      return;
    }
    host = url.hostname;
    port = Number(url.port || 5432);
  }
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.log(
      JSON.stringify({
        step: 'config',
        status: 'missing-or-invalid-host-port',
      }),
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    JSON.stringify({
      step: 'config',
      node: process.version,
      environment,
      source: connectionString ? 'DATABASE_URL' : 'DB_*',
      port,
      autoSelectFamily: net.getDefaultAutoSelectFamily(),
      attemptTimeoutMs: net.getDefaultAutoSelectFamilyAttemptTimeout(),
    }),
  );
  try {
    const addresses = await dns.lookup(host, { all: true });
    console.log(
      JSON.stringify({
        step: 'DNS',
        status: 'resolved',
        families: addresses.map((item) => item.family),
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({ step: 'DNS', status: 'failed', ...safeError(error) }),
    );
    process.exitCode = 1;
    return;
  }
  // Sequential attempts keep the output easy to compare; 0 uses Node's default.
  for (const family of [0, 4, 6]) await probe(host, port, family);
  const client = new Client({
    ...(connectionString
      ? { connectionString }
      : {
          host,
          port,
          user: env.DB_USERNAME,
          password: env.DB_PASSWORD,
          database: env.DB_DATABASE,
        }),
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1 AS ok');
    console.log(JSON.stringify({ step: 'PostgreSQL SELECT 1', status: 'ok' }));
  } catch (error) {
    console.log(
      JSON.stringify({
        step: 'PostgreSQL SELECT 1',
        status: 'failed',
        ...safeError(error),
      }),
    );
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

// Absolute bound also covers a DNS lookup that does not return promptly.
const watchdog = setTimeout(() => {
  console.log(
    JSON.stringify({ step: 'diagnosis', status: 'deadline-30000ms' }),
  );
  process.exit(1);
}, 30000);
main()
  .catch((error) => {
    console.log(
      JSON.stringify({
        step: 'diagnosis',
        status: 'failed',
        ...safeError(error),
      }),
    );
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(watchdog));
