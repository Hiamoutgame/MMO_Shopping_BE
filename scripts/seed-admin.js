require('dotenv').config({ quiet: true });

const bcrypt = require('bcryptjs');
const { Client } = require('pg');

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

async function main() {
  const email = requireEnv('SEED_ADMIN_EMAIL').toLowerCase();
  const password = requireEnv('SEED_ADMIN_PASSWORD');
  const displayName = requireEnv('SEED_ADMIN_NAME');

  const client = new Client({
    host: requireEnv('DB_HOST'),
    port: Number(requireEnv('DB_PORT')),
    user: requireEnv('DB_USERNAME'),
    password: requireEnv('DB_PASSWORD'),
    database: requireEnv('DB_DATABASE'),
  });

  await client.connect();
  await client.query('BEGIN');

  try {
    const roleResult = await client.query(
      `INSERT INTO roles (code, name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           description = COALESCE(roles.description, EXCLUDED.description),
           updated_at = now(),
           deleted_at = NULL
       RETURNING id`,
      ['ADMIN', 'Admin', 'Administrator role'],
    );
    const roleId = roleResult.rows[0].id;
    const passwordHash = await bcrypt.hash(password, 10);

    const accountResult = await client.query(
      `INSERT INTO accounts (email, password_hash, name, role_id, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           name = EXCLUDED.name,
           role_id = EXCLUDED.role_id,
           status = 'ACTIVE',
           deleted_at = NULL,
           updated_at = now()
       RETURNING id, email`,
      [email, passwordHash, displayName, roleId],
    );
    const account = accountResult.rows[0];

    await client.query(
      `INSERT INTO carts (account_id)
       VALUES ($1)
       ON CONFLICT (account_id) DO NOTHING`,
      [account.id],
    );

    await client.query(
      `INSERT INTO wallets (account_id, currency, balance)
       VALUES ($1, 'VND', 0)
       ON CONFLICT (account_id) DO NOTHING`,
      [account.id],
    );

    await client.query('COMMIT');
    console.log(
      JSON.stringify({ id: account.id, email: account.email, role: 'ADMIN' }),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
