const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const db                = require('./db');
const assignmentWatcher = require('./services/assignmentWatcher');
const gradeWatcher      = require('./services/gradeWatcher');
const scheduler         = require('./services/scheduler');

const notifStmts = {
  list:     db.prepare(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`),
  unread:   db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE read = 0`),
  markOne:  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`),
  markAll:  db.prepare(`UPDATE notifications SET read = 1`)
};

const TOKEN = process.env.CANVAS_TOKEN || '11003~C4QCTAWmJQRWnrDPBk8XGTYveyYaCerfYUVXuMGBkZcCcr6hMHy3RFKmVUTzL4wK';
const DOMAIN = 'canvas.colum.edu';
const PORT = process.env.PORT || 3001;

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

  // Notification routes
  if (req.method === 'GET' && req.url === '/api/notifications') {
    const notifications = notifStmts.list.all();
    const { count: unread } = notifStmts.unread.get();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ notifications, unread }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/notifications/read') {
    try {
      const body = await readBody(req);
      if (body.all) notifStmts.markAll.run();
      else if (body.id != null) notifStmts.markOne.run(body.id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400); res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Assignment diff engine — browser POSTs normalized assignments after each load
  if (req.method === 'POST' && req.url === '/api/sync') {
    try {
      const { assignments } = await readBody(req);
      const gradeNotifications = gradeWatcher.check(assignments);    // read old grades first
      const newNotifications   = assignmentWatcher.sync(assignments); // then write new state
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

  // Proxy Canvas API requests
  if (req.url.startsWith('/proxy')) {
    const canvasPath = req.url.replace(/^\/proxy/, '');
    const options = {
      hostname: DOMAIN,
      path: canvasPath,
      method: 'GET',
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }
    };

    const proxy = https.request(options, (canvasRes) => {
      res.writeHead(canvasRes.statusCode, { 'Content-Type': 'application/json' });
      canvasRes.pipe(res);
    });
    proxy.on('error', (err) => { res.writeHead(502); res.end(JSON.stringify({ error: err.message })); });
    proxy.end();
    return;
  }

  // Serve static files
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

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  scheduler.start();
});
