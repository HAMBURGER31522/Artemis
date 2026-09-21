/* ============================================================
   api.js — Gutendex 客户端（经本地代理，服务器有缓存）
   ============================================================ */

export async function fetchBooks(opts = {}) {
  try {
    return await fetchBooksOnce(opts);
  } catch (e) {
    // 一次重试：冷启动/瞬时抖动
    await new Promise((r) => setTimeout(r, 600));
    return fetchBooksOnce(opts);
  }
}

async function fetchBooksOnce({ page = 1, search = '', topic = '', languages = '', sort = 'popular' } = {}) {
  const q = new URLSearchParams();
  if (page > 1) q.set('page', page);
  if (search) q.set('search', search);
  if (topic) q.set('topic', topic);
  if (languages) q.set('languages', languages);
  if (sort && sort !== 'popular') q.set('sort', sort);
  const r = await fetch('/api/gutendex/books?' + q.toString());
  if (!r.ok) throw new Error('gutendex ' + r.status);
  return r.json();
}

export async function fetchBook(id) {
  const r = await fetch('/api/gutendex/books/' + id);
  if (!r.ok) throw new Error('book ' + id + ' not found');
  return r.json();
}

export function coverUrl(book) {
  return book?.formats?.['image/jpeg'] || null;
}

/* 下载源优先级：带图 HTML > 纯 HTML > UTF-8 TXT > 任意 TXT
   HTML 版保留章节结构与斜体，转换质量最高。 */
export function pickSource(formats) {
  const keys = Object.keys(formats || {});
  const find = (pre) => keys.find((k) => k.startsWith(pre) && !k.includes('zip'));
  return (
    formats[find('text/html; charset=utf-8')] ||
    formats[find('text/html')] ||
    formats[find('text/plain; charset=utf-8')] ||
    formats[find('text/plain')] ||
    null
  );
}

/* 经代理下载原始文件（ArrayBuffer） */
export async function downloadRaw(url, onProgress) {
  const proxied = '/api/content?url=' + encodeURIComponent(url);
  const r = await fetch(proxied);
  if (!r.ok) throw new Error('下载失败 (' + r.status + ')');
  if (onProgress && r.body) {
    const reader = r.body.getReader();
    const chunks = [];
    let got = 0;
    const total = Number(r.headers.get('content-length')) || 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      onProgress(total ? got / total : Math.min(0.9, got / 900000));
    }
    const ab = new Uint8Array(got);
    let off = 0;
    for (const c of chunks) { ab.set(c, off); off += c.length; }
    return ab.buffer;
  }
  return r.arrayBuffer();
}

/* 正文内嵌图片也走代理（HTML 版插图） */
export function proxifyImg(src, baseUrl) {
  try {
    return '/api/content?url=' + encodeURIComponent(new URL(src, baseUrl).href);
  } catch { return src; }
}
