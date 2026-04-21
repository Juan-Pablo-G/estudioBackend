const { Pool } = require('pg')

let pool

function getPool() {
  if (pool) return pool

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('Falta DATABASE_URL en las variables de entorno')
  }

  const useSsl =
    process.env.PGSSL === 'true' ||
    process.env.NODE_ENV === 'production'

  pool = new Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  })

  return pool
}

async function query(text, params = []) {
  return getPool().query(text, params)
}

async function initializeDatabase() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS posts (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      title TEXT NOT NULL,
      description TEXT,
      image_url TEXT NOT NULL,
      image_public_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
    CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts (user_id);
    CREATE INDEX IF NOT EXISTS idx_posts_is_public_created_at ON posts (is_public, created_at DESC);
  `)
}

module.exports = {
  getPool,
  query,
  initializeDatabase,
}
