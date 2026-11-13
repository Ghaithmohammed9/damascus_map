/* سيرفر محلي مع ضغط gzip:
     node tools/serve.js                 -> 127.0.0.1:4173
     node tools/serve.js --port 5000
     node tools/serve.js --host 0.0.0.0  -> متاح على شبكة الواي فاي (للموبايل)
*/
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const PORT = +arg('--port', process.env.PORT || 4173);
const HOST = arg('--host', process.env.HOST || '127.0.0.1');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.geojson': 'application/geo+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.geojson']);

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400).end('bad request');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ما في هالملف: ' + urlPath);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
      'Vary': 'Accept-Encoding',
    };
    if (process.argv.includes('--cors')) headers['Access-Control-Allow-Origin'] = '*';

    const acceptsGzip = /gzip/.test(req.headers['accept-encoding'] || '');
    if (acceptsGzip && COMPRESSIBLE.has(ext) && stat.size > 1024) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })).pipe(res);
      return;
    }

    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`المنفذ ${PORT} مشغول — جرّب: node tools/serve.js --port ${PORT + 1}`);
  else console.error(e.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('\n  Kharait Al-Sham');
  console.log(`  -> http://127.0.0.1:${PORT}`);
  if (HOST === '0.0.0.0' || HOST === '::') {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const net of list || []) {
        if (net.family === 'IPv4' && !net.internal) console.log(`  -> http://${net.address}:${PORT}   (phone / same Wi-Fi)`);
      }
    }
  }
  console.log('\n  Ctrl+C to stop\n');
});
