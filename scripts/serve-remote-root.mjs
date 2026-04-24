import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.bin': 'application/octet-stream',
  '.br': 'application/octet-stream',
  '.gz': 'application/gzip',
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function parsePort(argv) {
  const i = argv.indexOf('--port');
  if (i !== -1 && argv[i + 1]) return Number(argv[i + 1]);
  const env = Number(process.env.PORT);
  return Number.isFinite(env) && env > 0 ? env : 8787;
}

function parseRoot(argv) {
  const i = argv.indexOf('--root');
  if (i !== -1 && argv[i + 1]) return path.resolve(argv[i + 1]);
  return path.resolve(__dirname, '..', 'remote-root');
}

function isPathInsideRoot(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null;
  const part = rangeHeader.slice('bytes='.length);
  const [startStr, endStr] = part.split('-', 2);
  if (!startStr) return null;
  const start = Number(startStr);
  if (!Number.isFinite(start) || start < 0 || start >= size) return null;
  const end = endStr ? Number(endStr) : size - 1;
  if (!Number.isFinite(end) || end < start || end >= size) return null;
  return { start, end };
}

function cacheControlForUrlPath(urlPath) {
  const p = urlPath.toLowerCase();
  // 不缓存：manifest/config/import 索引类
  if (p.endsWith('/manifest.json') || p.endsWith('/config.json')) return 'no-cache';
  if (p.includes('/import/')) return 'no-cache';
  if (p.endsWith('/publish-meta.json')) return 'no-cache';

  // 强缓存：index.<hash>.js
  if (/\/index\.[a-z0-9_-]+\.js$/.test(p)) return 'public, max-age=31536000, immutable';

  // 默认：短缓存
  return 'public, max-age=60';
}

async function sendFile(req, res, filePath, method, urlPathname) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const size = stat.size;
  const type = contentType(filePath);
  const cacheControl = cacheControlForUrlPath(urlPathname);

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': cacheControl,
  };

  if (method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (method === 'HEAD') {
    res.writeHead(200, { ...cors, 'Content-Type': type, 'Content-Length': String(size) });
    res.end();
    return;
  }

  if (method !== 'GET') {
    res.writeHead(405, { ...cors, Allow: 'GET, HEAD, OPTIONS' });
    res.end('Method Not Allowed');
    return;
  }

  const range = parseRange(req.headers.range, size);
  if (range) {
    const { start, end } = range;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      ...cors,
      'Content-Type': type,
      'Content-Length': String(chunkSize),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    ...cors,
    'Content-Type': type,
    'Content-Length': String(size),
    'Accept-Ranges': 'bytes',
  });
  fs.createReadStream(filePath).pipe(res);
}

const rootDir = parseRoot(process.argv.slice(2));
const port = parsePort(process.argv.slice(2));

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }

    const safePath = path.normalize(path.join(rootDir, pathname));
    if (!isPathInsideRoot(rootDir, safePath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    await sendFile(req, res, safePath, req.method ?? 'GET', pathname);
  } catch (e) {
    if ((e && e.code) === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stderr.write(`remote-root static server\n`);
  process.stderr.write(`root: ${rootDir}\n`);
  process.stderr.write(`url:  http://127.0.0.1:${port}/\n`);
});
