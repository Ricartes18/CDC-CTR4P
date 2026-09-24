import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 8080;
const CSV_FILE_PATH = path.join(__dirname, 'participants.csv');

// Helper to get local network IPv4 addresses
function getLocalNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      const isIPv4 = net.family === 'IPv4' || net.family === 4;
      if (isIPv4 && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Create HTTP Server with CSV Persistence Endpoints
const server = http.createServer((req, res) => {
  // CORS Headers for flexible cross-device local networking
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Endpoint: GET /api/load or GET /participants.csv -> Reads participants.csv from disk
  if (req.method === 'GET' && (pathname === '/api/load' || pathname === '/participants.csv')) {
    if (fs.existsSync(CSV_FILE_PATH)) {
      const csvData = fs.readFileSync(CSV_FILE_PATH, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
      res.end(csvData);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'participants.csv not found on server disk' }));
    }
    return;
  }

  // Endpoint: POST /api/save -> Saves updated participant CSV directly to folder on disk
  if (req.method === 'POST' && (pathname === '/api/save' || pathname === '/api/save-csv')) {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        let csvContent = '';
        if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
          const payload = JSON.parse(body);
          if (payload.csv) {
            csvContent = payload.csv;
          } else if (Array.isArray(payload.participants)) {
            // Convert participants JSON array to CSV format
            const headers = ['Plate Number', 'Name', 'Distance', 'Jersey Size', 'Group / Team', 'Prepared Status', 'Prepared At', 'Claim Status', 'Claimed At'];
            const rows = payload.participants.map(p => [
              `"${String(p.plate || '').replace(/"/g, '""')}"`,
              `"${String(p.name || '').replace(/"/g, '""')}"`,
              `"${String(p.dist || '').replace(/"/g, '""')}"`,
              `"${String(p.size || '').replace(/"/g, '""')}"`,
              `"${String(p.team || '').replace(/"/g, '""')}"`,
              p.prepared ? 'Prepared' : 'Pending',
              `"${String(p.preparedAt || '').replace(/"/g, '""')}"`,
              p.claimed ? 'Claimed' : 'Pending',
              `"${String(p.claimedAt || '').replace(/"/g, '""')}"`
            ]);
            csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
          }
        } else {
          csvContent = body;
        }

        if (csvContent) {
          fs.writeFileSync(CSV_FILE_PATH, csvContent, 'utf-8');
          console.log(`[CSV Server] Updated participants.csv on disk (${fs.statSync(CSV_FILE_PATH).size} bytes)`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Saved to participants.csv on server disk' }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Empty CSV payload' }));
        }
      } catch (err) {
        console.error('[CSV Server Error]', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalNetworkIPs();
  console.log(`\n=======================================================`);
  console.log(`🚀 Clark Tourism Ride 4 Kit Pickup Server Running!`);
  console.log(`📍 Local URL:   http://localhost:${PORT}/`);
  if (ips.length > 0) {
    ips.forEach(ip => {
      console.log(`🌐 Network URL: http://${ip}:${PORT}/ (Open on mobile/other devices)`);
    });
  } else {
    console.log(`🌐 Network URL: http://0.0.0.0:${PORT}/`);
  }
  console.log(`📁 CSV File:    ${CSV_FILE_PATH}`);
  console.log(`=======================================================\n`);
});
