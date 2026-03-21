const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.CANVAS_TOKEN || '11003~C4QCTAWmJQRWnrDPBk8XGTYveyYaCerfYUVXuMGBkZcCcr6hMHy3RFKmVUTzL4wK';
const DOMAIN = 'canvas.colum.edu';
const PORT = process.env.PORT || 3001;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

  // Proxy the Canvas API requests
  if (req.url.startsWith('/proxy')) {
    const canvasPath = req.url.replace(/^\/proxy/, '');
    const options = {
      hostname: DOMAIN,
      path: canvasPath,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/json'
      }
    };

    const proxy = https.request(options, (canvasRes) => {
      res.writeHead(canvasRes.statusCode, {
        'Content-Type': 'application/json'
      });
      canvasRes.pipe(res);
    });

    proxy.on('error', (err) => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: err.message }));
    });

    proxy.end();
    return;
  }

  // Serve static files (HTML, CSS, JS) from the root directory
  let safeUrl = req.url === '/' ? '/canvas-assignments.html' : req.url;
  safeUrl = safeUrl.split('?')[0]; // remove query strings
  const filePath = path.join(__dirname, safeUrl);

  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error: ' + error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});