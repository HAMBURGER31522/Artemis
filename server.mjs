/*
 * Απόλλων — 零依赖开发服务器
 * - 静态服务 public/
 * - /api/gutendex/*  → gutendex.com（元数据，带内存缓存）
 * - /api/content?url= → www.gutenberg.org（正文文件，白名单域，解决浏览器 CORS）
 *
 * 运行: node server.mjs  →  http://localhost:3311
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const UA = { 'User-Agent': 'Apollon/1.0 (personal reader)', connection: 'close' };

async function upstream(url, timeoutMs = 30000) {
  // connection: close 规避 keep-alive 连接被远端关闭后复用失败的问题
  try {
    return await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    // 一次重试（瞬时网络抖动 / 半关闭连接）
    return await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
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
  upstream('https://gutendex.com' + sub + url.search)
    .then(async (r) => {
      const body = await r.text();
      if (r.ok) metaCache.set(key, { t: Date.now(), body });
      send(res, r.status, body, { 'Content-Type': 'application/json; charset=utf-8' });
    })
    .catch((e) => send(res, 502, JSON.stringify({ detail: 'gutendex unreachable: ' + e.message }), { 'Content-Type': 'application/json' }));
}

const server = http.createServer((req, res) => {
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

server.listen(PORT, () => {
  console.log(`\n  Απόλλων · 古登堡公版书城  →  http://localhost:${PORT}\n`);
});
