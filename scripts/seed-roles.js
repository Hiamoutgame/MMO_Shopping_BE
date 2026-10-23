// Seed only role records; never create accounts or change account permissions.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const environment = process.env.NODE_ENV ?? 'development';
for (const file of [
  `.env.${environment}.local`,
  `.env.${environment}`,
  '.env',
]) {
  const location = path.join(root, file);
  if (fs.existsSync(location)) {
    dotenv.config({ path: location, quiet: true });
  }
}

const roles = [
  { code: 'USER', name: 'User', description: 'Regular user' },
  { code: 'ADMIN', name: 'Admin', description: 'System administrator' },
];

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check')) {
    throw new Error('Usage: node scripts/seed-roles.js [--check]');
  }
  const checkOnly = args.includes('--check');
  const client = new Client({
    ...(process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT || 5432),
          user: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_DATABASE,
        }),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
    statement_timeout: 10000,
  });

  try {
    await client.connect();
    await client.query(checkOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    try {
      const before = await client.query(
        'SELECT code, name, deleted_at FROM roles ORDER BY code',
      );
      const missing = roles.filter(
        (role) => !before.rows.some((row) => row.code === role.code),
      );
      const deleted = before.rows.filter(
        (row) => row.deleted_at && roles.some((role) => role.code === row.code),
      );
      console.log(
        JSON.stringify({
          mode: checkOnly ? 'check' : 'seed',
          before: before.rows,
          missing: missing.map((role) => role.code),
          softDeleted: deleted.map((role) => role.code),
        }),
      );
      if (deleted.length && !checkOnly) {
        throw new Error(
          'Required roles are soft-deleted; review before restoring them.',
        );
      }
      const inserted = [];
      if (!checkOnly) {
        for (const role of roles) {
          const result = await client.query(
            `INSERT INTO roles (code, name, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (code) DO NOTHING
             RETURNING code`,
            [role.code, role.name, role.description],
          );
          inserted.push(...result.rows.map((row) => row.code));
        }
      }
      const after = await client.query(
        'SELECT code, name, deleted_at FROM roles ORDER BY code',
      );
      if (
        !checkOnly &&
        roles.some(
          (role) =>
            !after.rows.some(
              (row) => row.code === role.code && !row.deleted_at,
            ),
        )
      ) {
        throw new Error('Required active roles could not be verified.');
      }
      await client.query('COMMIT');
      console.log(JSON.stringify({ inserted, roles: after.rows }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  // Do not print connection strings, credentials, or raw database errors.
  console.error(
    JSON.stringify({
      status: 'failed',
      code: error.code,
      message: /^(Usage:|Required roles|Required active roles)/.test(
        error.message,
      )
        ? error.message
        : 'Role seed failed; check database connectivity and configuration.',
    }),
  );
  process.exitCode = 1;
});
