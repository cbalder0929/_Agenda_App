const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[startup] DATABASE_URL is not set. Point it at your Postgres connection string (e.g. from Neon).');
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

pool.on('error', (error) => {
  console.error('[db] Idle client error:', error.message);
});

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('[startup] Postgres schema ready');
}

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query, init };
