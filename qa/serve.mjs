// Tiny static server for QA that behaves like a real static host: brotli/gzip for text assets,
// Content-Length on everything, optional long-lived caching for hashed files.
// node qa/serve.mjs [port=4174] [root=dist]
import http from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import zlib from 'node:zlib';

const port = Number(process.argv[2] || 4174);
const root = normalize(process.argv[3] || 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
};
const TEXT = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);
const cache = new Map();

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  let st; try { st = statSync(file); } catch { res.writeHead(404).end('not found'); return; }
  if (!st.isFile()) { res.writeHead(404).end(); return; }
  const ext = extname(file);
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': /-[A-Za-z0-9_-]{8}\./.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache' };
  let body = readFileSync(file);
  const ae = String(req.headers['accept-encoding'] || '');
  if (TEXT.has(ext) && body.length > 1024) {
    const enc = ae.includes('br') ? 'br' : ae.includes('gzip') ? 'gzip' : null;
    if (enc) {
      const key = file + ':' + enc + ':' + st.mtimeMs;
      if (!cache.has(key)) cache.set(key, enc === 'br' ? zlib.brotliCompressSync(body) : zlib.gzipSync(body, { level: 9 }));
      body = cache.get(key); headers['Content-Encoding'] = enc; headers['Vary'] = 'Accept-Encoding';
    }
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
