/*
 * Απόλλων — 零依赖开发服务器
 * - 静态服务 public/
 * - /api/gutendex/*  → gutendex.com（元数据，带内存缓存）
 * - /api/content?url= → www.gutenberg.org（正文文件，白名单域，解决浏览器 CORS）
 *
 * 运行: node server.mjs  →  http://localhost:3311
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = process.env.PORT ? Number(process.env.PORT) : 3311;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// ---------- gutendex 缓存 ----------
const metaCache = new Map(); // key -> {t, body}
const META_TTL = 10 * 60 * 1000;

// ---------- 内容缓存（内存 LRU，按字节预算） ----------
const contentCache = new Map(); // url -> {t, buf, type}
const CONTENT_TTL = 24 * 60 * 60 * 1000;
const CONTENT_BUDGET = 256 * 1024 * 1024; // 256MB 上限
let contentBytes = 0;
function cacheContent(url, buf, type) {
  if (buf.length > 40 * 1024 * 1024) return; // 单文件超 40MB 不缓存
  while (contentBytes + buf.length > CONTENT_BUDGET && contentCache.size) {
    const oldest = contentCache.keys().next().value;
    const o = contentCache.get(oldest);
    contentBytes -= o.buf.length;
    contentCache.delete(oldest);
  }
  contentCache.set(url, { t: Date.now(), buf, type });
  contentBytes += buf.length;
}

const ALLOWED_HOSTS = new Set(['www.gutenberg.org', 'gutenberg.org']);

function send(res, status, body, headers = {}) {
  const h = { 'X-Content-Type-Options': 'nosniff', ...headers };
  if (typeof body === 'string') h['Content-Type'] ??= 'text/plain; charset=utf-8';
  res.writeHead(status, h);
  res.end(body);
}

const UA = {
  'User-Agent': 'Artemis/1.0 (personal reader)',
  Accept: 'application/json, text/plain, */*',
  connection: 'close',
};

function requestUpstream(url, timeoutMs, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: UA }, (upstreamResponse) => {
      const status = upstreamResponse.statusCode || 502;
      const location = upstreamResponse.headers.location;
      if (status >= 300 && status < 400 && location) {
        upstreamResponse.resume();
        if (redirects >= 5) {
          reject(new Error('too many upstream redirects'));
          return;
        }
        requestUpstream(new URL(location, url).href, timeoutMs, redirects + 1).then(resolve, reject);
        return;
      }

      const chunks = [];
      upstreamResponse.on('data', (chunk) => chunks.push(chunk));
      upstreamResponse.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: status >= 200 && status < 300,
          status,
          headers: {
            get(name) {
              const value = upstreamResponse.headers[name.toLowerCase()];
              return Array.isArray(value) ? value[0] || null : value || null;
            },
          },
          text: async () => body.toString('utf8'),
          arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('upstream request timed out')));
    request.on('error', reject);
  });
}

async function upstream(url, timeoutMs = 30000) {
  // native https 规避 undici TLS 指纹被上游挑战；仍保留一次有限重试。
  try {
    return await requestUpstream(url, timeoutMs);
  } catch (e) {
    return requestUpstream(url, timeoutMs);
  }
}

function handleContent(req, res, url) {
  const target = new URL(url.searchParams.get('url') || '');
  if (!ALLOWED_HOSTS.has(target.hostname) || target.protocol !== 'https:') {
    return send(res, 403, 'host not allowed');
  }
  const cached = contentCache.get(target.href);
  if (cached && Date.now() - cached.t < CONTENT_TTL) {
    return send(res, 200, cached.buf, { 'Content-Type': cached.type, 'X-Cache': 'hit' });
  }
  upstream(target, 120000).then((r) => {
    if (!r.ok) return send(res, r.status, `upstream ${r.status}`);
    const type = r.headers.get('content-type') || 'application/octet-stream';
    r.arrayBuffer().then((ab) => {
      const buf = Buffer.from(ab);
      cacheContent(target.href, buf, type);
      send(res, 200, buf, { 'Content-Type': type, 'X-Cache': 'miss' });
    });
  }).catch((e) => send(res, 502, 'fetch failed: ' + e.message));
}

function handleMeta(req, res, url) {
  // /api/gutendex/books?… → https://gutendex.com/books?…
  const sub = url.pathname.replace(/^\/api\/gutendex/, '') || '/books';
  const key = sub + url.search;
  const cached = metaCache.get(key);
  if (cached && Date.now() - cached.t < META_TTL) {
    return send(res, 200, cached.body, { 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'hit' });
  }
  upstream('https://gutendex.com' + sub + (url.search || '?'))
    .then(async (r) => {
      const body = await r.text();
      if (r.ok) metaCache.set(key, { t: Date.now(), body });
      send(res, r.status, body, { 'Content-Type': 'application/json; charset=utf-8' });
    })
    .catch((e) => send(res, 502, JSON.stringify({ detail: 'gutendex unreachable: ' + e.message }), { 'Content-Type': 'application/json' }));
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/api/gutendex' || url.pathname.startsWith('/api/gutendex/')) {
      return handleMeta(req, res, url);
    }
    if (url.pathname === '/api/content') {
      return handleContent(req, res, url);
    }
    if (url.pathname === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, cacheMB: Math.round(contentBytes / 1048576) }), { 'Content-Type': 'application/json' });
    }

    // 静态文件（含 SPA 兜底到 index.html）
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(PUBLIC, 'index.html');
    }
    const ext = path.extname(file).toLowerCase();
    const stream = fs.createReadStream(file);
    stream.on('open', () => {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      stream.pipe(res);
    });
    stream.on('error', () => send(res, 404, 'not found'));
  });
}

export function startServer({ host = '127.0.0.1', port = PORT } = {}) {
  const server = createServer();
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      console.log(`\n  Απόλλων · 古登堡公版书城  →  http://${host}:${actualPort}\n`);
      resolve({ server, host, port: actualPort });
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

const isCliEntry = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isCliEntry) {
  startServer().catch((error) => {
    console.error('Unable to start Artemis server:', error);
    process.exitCode = 1;
  });
}
