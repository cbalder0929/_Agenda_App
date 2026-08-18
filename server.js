require('dotenv').config();
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const db                = require('./db');
const assignmentWatcher = require('./services/assignmentWatcher');
const gradeWatcher      = require('./services/gradeWatcher');
const scheduler         = require('./services/scheduler');
const googleAuth        = require('./services/googleAuth');
const calendarSync      = require('./services/calendarSync');

const TOKEN = process.env.CANVAS_TOKEN || "";
const DOMAIN = 'canvas.colum.edu';
const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT) || 3001;

process.on('uncaughtException', (error) => {
  console.error('[startup] Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('[startup] Unhandled rejection:', error);
});

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/api/notifications') {
    try {
      const { rows: notifications } = await db.query(
        `SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`
      );
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS count FROM notifications WHERE read = 0`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ notifications, unread: rows[0].count }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/notifications/read') {
    try {
      const body = await readBody(req);
      if (body.all) await db.query(`UPDATE notifications SET read = 1`);
      else if (body.id != null) await db.query(`UPDATE notifications SET read = 1 WHERE id = $1`, [body.id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400); res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/auth/google') {
    res.writeHead(302, { Location: googleAuth.getAuthUrl() });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/auth/google/callback')) {
    try {
      const code = new URL(req.url, `http://${req.headers.host}`).searchParams.get('code');
      if (!code) throw new Error('Missing authorization code');
      await googleAuth.handleCallback(code);
      res.writeHead(302, { Location: '/' });
      res.end();
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Google authorization failed: ' + err.message);
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/api/calendar/status') {
    try {
      const connected = await googleAuth.isConnected();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ connected }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/calendar/sync') {
    try {
      const result = await calendarSync.syncDueDates();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/sync') {
    try {
      const { assignments } = await readBody(req);
      const gradeNotifications = await gradeWatcher.check(assignments);
      const newNotifications   = await assignmentWatcher.sync(assignments);
      const notifications = [...gradeNotifications, ...newNotifications];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ newCount: notifications.length, notifications }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

  if (req.url.startsWith('/proxy')) {
    const canvasPath = req.url.replace(/^\/proxy/, '');
    const options = {
      hostname: DOMAIN,
      path: canvasPath,
      method: 'GET',
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', 'User-Agent': 'Agendi/1.0' }
    };

    const proxy = https.request(options, (canvasRes) => {
      res.writeHead(canvasRes.statusCode, { 'Content-Type': 'application/json' });
      canvasRes.pipe(res);
    });
    proxy.on('error', (err) => { res.writeHead(502); res.end(JSON.stringify({ error: err.message })); });
    proxy.end();
    return;
  }

  let safeUrl = req.url === '/' ? '/canvas-assignments.html' : req.url;
  safeUrl = safeUrl.split('?')[0];
  const filePath = path.join(__dirname, safeUrl);

  if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }

  const contentType = MIME_TYPES[String(path.extname(filePath)).toLowerCase()] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500);
      res.end(error.code === 'ENOENT' ? 'File not found' : 'Server error: ' + error.code);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.on('error', (error) => {
  console.error('[startup] Server failed to start:', error);
});

(async () => {
  try {
    await db.init();
  } catch (error) {
    console.error('[startup] Database init failed:', error.message);
    process.exit(1);
  }

  server.listen(PORT, HOST, () => {
    console.log(`[startup] Server running at http://${HOST}:${PORT}`);
    scheduler.start();
  });
})();
