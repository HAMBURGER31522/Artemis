/* ============================================================
   app.js — 入口与路由
   #/          书城
   #/shelf     书架
   #/read/:id  阅读器（全屏层，不换底）
   ============================================================ */
import { mountBrowse, unmountBrowse } from './views/browse.js';
import { mountShelf } from './views/shelfview.js';
import { bindDetailGlobal, closeDetail } from './views/detail.js';
import { openReader, closeReader } from './views/reader.js';
import { shelfCount, loadProgressIndex } from './shelf.js';
import { bump, REDUCED } from './motion.js';

const view = document.getElementById('view');
let currentView = null;
let pendingSearch = ''; // 从书架等视图发起搜索时暂存
let appReady = false;

/* ---------- 冷开场：撕开封纸（首次加载；reduced-motion 直接跳过） ---------- */
function playColdOpen() {
  const co = document.getElementById('cold-open');
  if (!co || REDUCED) {
    document.body.classList.add('entered');
    co?.remove();
    return;
  }
  // 印章亮相 0.55s → 裂屏（上半右滑、下半左滑，0.52s expo-in）→ hero 文字升入
  requestAnimationFrame(() => requestAnimationFrame(() => {
    setTimeout(() => co.classList.add('go'), 550);
  }));
  setTimeout(() => document.body.classList.add('entered'), 880); // 裂至大半时文字开始入场
  setTimeout(() => co.remove(), 1250);
}
playColdOpen();

async function updateBadge() {
  const n = await shelfCount();
  document.getElementById('shelf-count').textContent = n;
}

async function route() {
  const hash = location.hash || '#/';
  const readMatch = hash.match(/^#\/read\/(\d+)/);

  if (readMatch) {
    // 阅读器是全屏层；底视图保持书城/书架
    if (!currentView) await renderBase('#/');
    openReader(Number(readMatch[1]));
    return;
  }

  // 离开阅读器
  if (document.getElementById('reader')?.classList.contains('open')) closeReaderSilent();
  closeDetail();

  await renderBase(hash);
}

async function renderBase(hash) {
  unmountBrowse();
  if (hash.startsWith('#/shelf')) {
    currentView = 'shelf';
    await mountShelf(view);
  } else {
    currentView = 'browse';
    const search = pendingSearch;
    pendingSearch = '';
    await mountBrowse(view, { reset: true, search });
    window.scrollTo(0, 0);
  }
}

function closeReaderSilent() {
  // 静默收起阅读器层（进度已实时保存）
  import('./views/reader.js').then((m) => m.closeReader());
}

/* ---------- 搜索（必须先于首屏异步加载绑定） ---------- */
async function submitSearch(e) {
  e.preventDefault();
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;

  // 首屏还在取书时也要拦截 Enter；等首屏结束后再消费这次搜索。
  pendingSearch = q;
  if (!appReady) return;

  if (location.hash !== '#/' && location.hash !== '') {
    location.hash = '#/';
    return;
  }

  pendingSearch = '';
  await mountBrowse(view, { reset: true, search: q });
  window.scrollTo(0, 0);
}

document.getElementById('search-form').addEventListener('submit', submitSearch);

/* ---------- 启动 ---------- */
bindDetailGlobal();
await loadProgressIndex().catch(() => {});
await updateBadge();

window.addEventListener('hashchange', route);
await route();
appReady = true;

// 用户可能在首屏请求尚未结束时已经提交搜索，首屏完成后补跑一次。
if (pendingSearch) {
  const q = pendingSearch;
  pendingSearch = '';
  if (location.hash !== '#/' && location.hash !== '') {
    pendingSearch = q;
    location.hash = '#/';
  } else {
    await mountBrowse(view, { reset: true, search: q });
    window.scrollTo(0, 0);
  }
}

/* 书架变化 → 徽标 */
document.addEventListener('shelf-changed', async () => {
  const before = document.getElementById('shelf-count').textContent;
  await loadProgressIndex().catch(() => {});
  await updateBadge();
  if (document.getElementById('shelf-count').textContent !== before) {
    bump(document.getElementById('shelf-count'));
  }
  if (currentView === 'shelf') mountShelf(view);
});
