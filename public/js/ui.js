/* ============================================================
   ui.js — 视图共用小件（转义、格式化、书卡模板）
   ============================================================ */
import { coverFor } from './covers.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtNum = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n ?? 0));

export function authorName(book) {
  const a = book.authors?.[0];
  if (!a) return '佚名';
  let n = a.name.replace(/,\s*\d+\s*-\s*\d*\s*$/, '');
  // 「Last, First」→「First Last」（仅西文）
  if (/,.+/.test(n) && !/[\u3400-\u9fff]/.test(n)) {
    const [l, f] = n.split(/,\s*/);
    if (f) n = `${f} ${l}`;
  }
  return n;
}

export function cardHTML(book, { onshelf = false } = {}) {
  const img = coverFor(book);
  return `
  <button class="book-card ${onshelf ? 'onshelf' : ''}" data-book="${book.id}" type="button"
          aria-label="${esc(book.title)}">
    <span class="shelf-flag">在架</span>
    <div class="tilt">
      <div class="cover-box">
        <img src="${esc(img)}" alt="" loading="lazy" decoding="async"
             onerror="this.onerror=null;this.src=this.dataset.fallback"
             data-fallback="${esc(coverFor({ ...book, formats: null }))}">
        <span class="ribbon"></span>
      </div>
      <div class="meta">
        <div class="t">${esc(book.title)}</div>
        <div class="a">${esc(authorName(book))}</div>
      </div>
    </div>
  </button>`;
}

/* 帘上小封面（hero 用） */
export function miniCoverHTML(book) {
  const img = coverFor(book);
  return `<img src="${esc(img)}" alt="" loading="eager" decoding="async"
    onerror="this.onerror=null;this.src=this.dataset.fallback"
    data-fallback="${esc(coverFor({ ...book, formats: null }))}">`;
}

export function toast(msg, err = false) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

/* 分类：Gutenberg bookshelves 常用 topic */
export const CATEGORIES = [
  { zh: '小说', en: 'fiction' }, { zh: '冒险', en: 'adventure' },
  { zh: '推理', en: 'detective' }, { zh: '科幻', en: 'science fiction' },
  { zh: '爱情', en: 'love' }, { zh: '诗歌', en: 'poetry' },
  { zh: '短篇', en: 'short stories' }, { zh: '历史', en: 'history' },
  { zh: '哲学', en: 'philosophy' }, { zh: '童书', en: 'children' },
  { zh: '戏剧', en: 'drama' }, { zh: '恐怖', en: 'horror' },
  { zh: '童话', en: 'fairy tales' }, { zh: '传记', en: 'biography' },
];
export const LANGS = [
  { code: '', zh: '全部语言' }, { code: 'zh', zh: '中文' }, { code: 'en', zh: '英语' },
  { code: 'fr', zh: '法语' }, { code: 'de', zh: '德语' }, { code: 'ja', zh: '日语' },
  { code: 'es', zh: '西班牙' }, { code: 'ru', zh: '俄语' }, { code: 'it', zh: '意大利' },
];
