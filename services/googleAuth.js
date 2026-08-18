const { google } = require('googleapis');
const db = require('../db');

const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

function getAuthUrl() {
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

async function saveTokens(tokens) {
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO google_tokens (id, access_token, refresh_token, expiry_date, scope, updated_at)
     VALUES (1, $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       access_token  = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, google_tokens.refresh_token),
       expiry_date   = EXCLUDED.expiry_date,
       scope         = EXCLUDED.scope,
       updated_at    = EXCLUDED.updated_at`,
    [tokens.access_token, tokens.refresh_token || null, tokens.expiry_date || null, tokens.scope || null, now]
  );
}

async function loadTokens() {
  const { rows } = await db.query('SELECT * FROM google_tokens WHERE id = 1');
  return rows[0] || null;
}

async function handleCallback(code) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  await saveTokens(tokens);
  return tokens;
}

async function getAuthorizedClient() {
  const stored = await loadTokens();
  if (!stored) return null;

  const client = createOAuthClient();
  client.setCredentials({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    expiry_date: stored.expiry_date != null ? Number(stored.expiry_date) : undefined,
    scope: stored.scope,
  });

  client.on('tokens', (tokens) => {
    saveTokens(tokens).catch(err => console.error('[google] failed to persist refreshed tokens:', err.message));
  });

  return client;
}

async function isConnected() {
  return (await loadTokens()) != null;
}

module.exports = { getAuthUrl, handleCallback, getAuthorizedClient, isConnected };
