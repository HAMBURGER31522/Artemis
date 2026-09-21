/* ============================================================
   shelfview.js — 我的书架
   ============================================================ */
import { listBooks, removeBook, peekProgress } from '../shelf.js';
import { esc } from '../ui.js';

export async function mountShelf(root) {
  const books = await listBooks();

  root.innerHTML = `
  <div class="wrap shelf-view">
    <div class="section-head" style="margin-bottom:8px">
      <span class="no">藏</span><h2>我的书架</h2>
      <span class="rule"></span>
      <span class="more">${books.length} 本 · 存在本机，离线可读</span>
    </div>
    ${books.length ? gridHTML(books) : emptyHTML()}
  </div>`;

  root.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      e.stopPropagation();
      const id = Number(rm.dataset.remove);
      await removeBook(id);
      document.dispatchEvent(new CustomEvent('shelf-changed'));
      mountShelf(root); // 重渲染
      return;
    }
    const card = e.target.closest('[data-read]');
    if (card) location.hash = '#/read/' + card.dataset.read;
  });
}

function gridHTML(books) {
  return `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(176px,1fr))">
    ${books.map((b) => {
      const cover = b.cover || fallbackCover(b);
      const p = peekProgress(b.id);
      return `
      <div class="book-card onshelf shelf-card" style="perspective:none">
        <div class="tilt" style="transform:none">
          <button data-read="${b.id}" style="display:block;text-align:left;width:100%" type="button" aria-label="阅读 ${esc(b.title)}">
            <div class="cover-box">
              <img src="${esc(cover)}" alt="" loading="lazy">
              <span class="ribbon"></span>
              <span class="band">
                <span class="bt">${p ? '继续阅读' : '点击开读'}</span>
                <span class="bp">${p ? `读到 ${Math.round(p.pct * 100)}% · ${esc((b.chapters[p.chapter] || b.chapters[0] || {}).title || '').slice(0, 14)}` : `约 ${b.minutes} 分钟 · ${b.chapters.length} 章`}</span>
              </span>
              ${p ? `<div style="position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(0,0,0,.28)"><i style="display:block;height:100%;width:${Math.round(p.pct * 100)}%;background:var(--accent)"></i></div>` : ''}
            </div>
          </button>
          <div class="meta">
            <div class="t">${esc(b.title)}</div>
            <div class="a">${esc(b.authors[0] || '佚名')}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
              <span class="fact" style="font-family:var(--mono);font-size:10.5px;color:var(--ink-faint)">${p ? `读到 ${Math.round(p.pct * 100)}%` : `约 ${b.minutes} 分钟`}</span>
              <button data-remove="${b.id}" class="toc-item" style="width:auto;padding:2px 8px;font-size:11px;margin-left:auto;border:1px solid var(--line);border-radius:999px;color:var(--ink-faint)" type="button">移出</button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function fallbackCover(b) {
  // 书架里的书一定转好过；封面丢失时用生成图
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(genShelfCover(b))}`;
}
function genShelfCover(b) {
  const t = esc(b.title).slice(0, 40);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#2e3b26"/><text x="30" y="140" font-family="Georgia,serif" font-size="30" fill="#e7e0c9">${t}</text><rect x="0" y="0" width="9" height="450" fill="#a4b06a"/></svg>`;
}

const emptyHTML = () => `
  <div class="shelf-empty">
    <div class="big">书架还空着。</div>
    <p>回<a href="#/" style="color:var(--accent);text-decoration:underline">书城</a>挑一本，点「一键入架 · 开始阅读」——<br>转换和收藏都在你的浏览器里完成。</p>
  </div>`;
