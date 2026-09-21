/* ============================================================
   shelf.js — 我的书架（IndexedDB）
   books：转换后的章节全文；progress：阅读进度。离线可读。
   ============================================================ */

const DB_NAME = 'inkshelf';
const DB_VER = 1;
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('books')) d.createObjectStore('books', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('progress')) d.createObjectStore('progress', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out?.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
  }));
}

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/* ---------- 书籍 ---------- */
export async function addBook(meta, converted) {
  const rec = {
    id: meta.id,
    title: meta.title,
    authors: meta.authors?.map((a) => a.name) || [],
    language: meta.languages?.[0] || 'en',
    cover: meta._cover || null,
    chapters: converted.chapters,
    kind: converted.kind,
    chars: converted.chars,
    minutes: converted.minutes,
    addedAt: Date.now(),
  };
  await tx('books', 'readwrite', (s) => s.put(rec));
  return rec;
}
export const getBook = (id) => tx('books', 'readonly', (s) => req(s.get(id)));
export const hasBook = async (id) => !!(await getBook(id));
/* 移出时连同阅读进度一起清掉 */
export function removeBook(id) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(['books', 'progress'], 'readwrite');
    t.objectStore('books').delete(id);
    t.objectStore('progress').delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  }));
}
export const listBooks = async () => {
  const all = await tx('books', 'readonly', (s) => req(s.getAll()));
  return all.sort((a, b) => (progressMap.get(b.id)?.updatedAt || b.addedAt) - (progressMap.get(a.id)?.updatedAt || a.addedAt));
};

/* ---------- 进度 ---------- */
export const saveProgress = (id, p) => tx('progress', 'readwrite', (s) => s.put({ id, ...p, updatedAt: Date.now() }));
export const getProgress = (id) => tx('progress', 'readonly', (s) => req(s.get(id)));

const progressMap = new Map();
export async function loadProgressIndex() {
  const all = await tx('progress', 'readonly', (s) => req(s.getAll()));
  progressMap.clear();
  for (const p of all) progressMap.set(p.id, p);
  return progressMap;
}
export const peekProgress = (id) => progressMap.get(id) || null;

/* ---------- 角标 ---------- */
export async function shelfCount() {
  return tx('books', 'readonly', (s) => req(s.count()));
}
