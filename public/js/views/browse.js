/* ============================================================
   browse.js — 书城首页
   hero：赫尔墨斯手撕纸拼贴（入场随冷开场揭幕）
   → 书帘带（Verlet 荡入）→ 速度感应跑马灯 → 热榜 → 网格
   ============================================================ */
import { fetchBooks } from '../api.js';
import { miniCoverHTML, cardHTML, esc, fmtNum, authorName, CATEGORIES, LANGS } from '../ui.js';
import { makeCurtain, makeVelocityMarquee, makeTilt, REDUCED } from '../motion.js';
import { peekProgress } from '../shelf.js';
import { openDetail } from './detail.js';

const state = {
  page: 1, next: null, count: 0, loading: false,
  search: '', topic: '', lang: '',
  books: [], feed: [],
};

let curtainCtl = null, marqueeCtl = null;

/* 撕纸图版素材：作者肖像（本地，公有领域，署名见页脚） */
const SCRAPS = [
  { cls: 's1', src: '/img/author-austen.jpg', tape: true },
  { cls: 's2', src: '/img/author-twain.jpg' },
  { cls: 's3', src: '/img/author-poe.jpg' },
  { cls: 's4', src: '/img/author-tolstoy.jpg', tape: true },
  { cls: 's5', src: '/img/author-dickens.jpg' },
  { cls: 's6', src: '/img/author-luxun.jpg', tape: true },
  { cls: 's7', src: '/img/author-shelley.jpg' },
  { cls: 's8', src: '/img/author-dickinson.jpg' },
  { cls: 's9', src: '/img/author-doyle.png' },
];

export async function mountBrowse(root, opts = {}) {
  if (opts.reset !== false) {
    Object.assign(state, {
      page: 1, next: null, count: 0, books: [],
      search: opts.search ?? '', topic: opts.topic ?? '', lang: opts.lang ?? '',
    });
  } else {
    Object.assign(state, { search: opts.search ?? state.search, topic: opts.topic ?? state.topic, lang: opts.lang ?? state.lang });
  }

  root.innerHTML = `
  <header class="hero" id="hero" aria-label="作者肖像拼贴">
    ${SCRAPS.map((s) => `
    <figure class="scrap ${s.cls}" ${s.tape ? 'data-tape' : ''}>
      <div class="paper"><img src="${s.src}" alt="" loading="eager" decoding="async"></div>
    </figure>`).join('')}
  </header>

  <div class="marquee-band" aria-label="分类">
    <div class="marquee" id="marquee"></div>
  </div>

  <div class="wrap">
    <div id="filters" class="section" style="padding-top:26px"></div>

    <section class="section" id="rank-section" hidden>
      <div class="section-head">
        <span class="no">01</span><h2 id="rank-title">此刻最热</h2>
        <span class="rule"></span>
        <span class="more" id="rank-dl-note"></span>
      </div>
      <div class="rank-list" id="rank-list"></div>
    </section>

    <section class="section">
      <div class="section-head">
        <span class="no">02</span><h2 id="grid-title">书堆</h2>
        <span class="rule"></span>
        <span class="more" id="grid-count"></span>
      </div>
      <div class="grid" id="grid"></div>
      <button class="load-more" id="load-more">再搬一摞来</button>
    </section>

    <section class="section curtain-band">
      <div class="section-head">
        <span class="no">03</span><h2>书帘</h2>
        <span class="rule"></span>
        <span class="more">掠过它们 · 每本都真的挂着</span>
      </div>
      <div class="curtain" id="curtain" aria-hidden="true"></div>
    </section>
  </div>`;

  bindEvents(root);
  renderFilters(root);
  renderMarquee(root);

  /* 首屏数据：热榜 + 帘 + 第一页网格，共用一次请求 */
  await loadFeed(root, opts.keepFeed !== true);
}

/* ---------- 首屏：一次请求喂三处 ---------- */
async function loadFeed(root, reload) {
  const grid = root.querySelector('#grid');
  if (reload) {
    grid.innerHTML = skeletons(12);
    try {
      const j = await fetchBooks({ page: 1, search: state.search, topic: state.topic, languages: state.lang });
      state.feed = j.results;
      state.count = j.count;
      state.next = j.next; state.page = 1;
    } catch (e) {
      grid.innerHTML = failHTML(String(e));
      return;
    }
  }
  if (!state.feed.length) { grid.innerHTML = failHTML('没有找到书，换个关键词试试'); return; }

  renderCurtain(root);
  renderRank(root);
  renderGridStart(root);
}

function skeletons(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += `<div class="book-card skeleton"><div class="tilt"><div class="cover-box"></div><div class="meta"><div class="t">　</div><div class="a">　</div></div></div></div>`;
  return s;
}
const failHTML = (msg) => `<div class="shelf-empty"><div class="big">书运不进来。</div>${esc(msg)} — 检查一下网络，或稍后再试。</div>`;

/* ---------- 书帘（带销毁，避免语言切换时叠加） ---------- */
function renderCurtain(root) {
  const box = root.querySelector('#curtain');
  if (!box) return;
  curtainCtl?.destroy(); curtainCtl = null;
  if (REDUCED) {
    box.innerHTML = state.feed.slice(0, 10).map((b) =>
      `<div class="rope-book" style="position:relative;display:inline-block;margin:6px"><div class="cover">${miniCoverHTML(b)}</div></div>`).join('');
    box.style.cssText = 'position:static;display:flex;flex-wrap:wrap;justify-content:center;padding:40px 16px;pointer-events:none;opacity:.92';
    return;
  }
  box.style.cssText = '';
  const withCover = state.feed.filter((b) => b.formats?.['image/jpeg']).slice(0, 16);
  const books = (withCover.length >= 8 ? withCover : state.feed.slice(0, 16))
    .map((b) => ({ coverHTML: miniCoverHTML(b) }));
  curtainCtl = makeCurtain(box, books);
}

/* ---------- 热榜（编辑式列表 + 行级联入场） ---------- */
function renderRank(root) {
  const sec = root.querySelector('#rank-section');
  const list = root.querySelector('#rank-list');
  if (!sec || !list) return;
  const top = state.feed.slice(0, 7);
  sec.hidden = false;
  root.querySelector('#rank-dl-note').textContent = `按下载量 · 共 ${state.count.toLocaleString()} 本在册`;
  list.classList.remove('in', 'busy');
  list.innerHTML = top.map((b, i) => `
    <button class="rank-row" data-book="${b.id}" type="button" style="--i:${i}">
      <span class="idx">${String(i + 1).padStart(2, '0')}</span>
      <span class="mini">${miniCoverHTML(b)}</span>
      <span class="ttl">
        <span class="t">${esc(b.title)}</span>
        <span class="a">${esc(authorName(b))} · ${esc((b.languages || ['?']).join('/').toUpperCase())}</span>
      </span>
      <span class="dl">↓ ${fmtNum(b.download_count)}${peekProgress(b.id) ? '<span class="inshelf">在架上</span>' : ''}</span>
    </button>`).join('');
  staggerIn(list);
}

function staggerIn(listEl) {
  if (REDUCED) { listEl.classList.add('in'); return; }
  const io = new IntersectionObserver((es) => {
    if (es[0].isIntersecting) { listEl.classList.add('in'); io.disconnect(); }
  }, { threshold: 0.12 });
  io.observe(listEl);
}

/* ---------- 跑马灯：词条两份拼接（速度感应版） ---------- */
function renderMarquee(root) {
  const track = root.querySelector('#marquee');
  const chips = CATEGORIES.map((c) =>
    `<button class="marquee-chip ${state.topic === c.en ? 'active' : ''}" data-topic="${esc(c.en)}" type="button">${c.zh}<span class="n">${c.en}</span></button>`).join('');
  track.innerHTML = chips + chips;
  marqueeCtl?.destroy(); marqueeCtl = null;
  marqueeCtl = makeVelocityMarquee(track, { base: 26 });
}

/* ---------- 筛选行：语言 + 搜索态（只重绘，事件绑在 bindEvents） ---------- */
function renderFilters(root) {
  const box = root.querySelector('#filters');
  if (!box) return;
  const langs = LANGS.map((l) =>
    `<button class="marquee-chip ${state.lang === l.code ? 'active' : ''}" data-lang="${l.code}" type="button" style="margin:0 8px 8px 0">${l.zh}</button>`).join('');
  const searching = state.search ? `<span style="font-size:13px;color:var(--ink-soft)">搜索「<b>${esc(state.search)}</b>」的结果 · <button id="clear-search" style="text-decoration:underline;color:var(--accent)">清除</button></span>` : '';
  box.innerHTML = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">${searching}${langs}</div>`;
}

/* ---------- 网格 ---------- */
function renderGridStart(root) {
  const grid = root.querySelector('#grid');
  if (!grid) return;
  grid.classList.remove('in');
  grid.innerHTML = state.feed.map((b) => cardHTML(b, { onshelf: !!peekProgress(b.id) })).join('');
  enhanceCards(grid);
  staggerGrid(grid);
  const count = root.querySelector('#grid-count');
  count.textContent = `共 ${state.count.toLocaleString()} 本 · ${filterNote()}`;
  root.querySelector('#load-more').hidden = !state.next;
  root.querySelector('#rank-title').textContent =
    (state.search ? `「${state.search}」的头牌` : state.topic ? `${CATEGORIES.find((c) => c.en === state.topic)?.zh || state.topic}的头牌` : '此刻最热')
    + (state.lang ? ` · ${LANGS.find((l) => l.code === state.lang)?.zh || state.lang}` : '');
  root.querySelector('#grid-title').textContent = state.search || state.topic || state.lang ? '全部结果' : '书堆';
}

function staggerGrid(grid) {
  grid.querySelectorAll('.book-card').forEach((c, i) => c.style.setProperty('--i', Math.min(i, 24)));
  if (REDUCED) { grid.classList.add('in'); return; }
  const io = new IntersectionObserver((es) => {
    if (es[0].isIntersecting) { grid.classList.add('in'); io.disconnect(); }
  }, { threshold: 0.05 });
  io.observe(grid);
}

const filterNote = () =>
  [state.search && `“${state.search}”`, CATEGORIES.find((c) => c.en === state.topic)?.zh, LANGS.find((l) => l.code === state.lang)?.zh && `语言：${LANGS.find((l) => l.code === state.lang).zh}`]
    .filter(Boolean).join(' · ') || '热门优先';

function enhanceCards(scope) {
  scope.querySelectorAll('.book-card:not(.skeleton)').forEach((c) => makeTilt(c, { maxTilt: 9 }));
}

async function loadMore(root) {
  if (!state.next || state.loading) return;
  state.loading = true;
  const btn = root.querySelector('#load-more');
  btn.disabled = true; btn.textContent = '搬运中…';
  try {
    const url = new URL(state.next);
    const j = await fetchBooks({
      page: Number(url.searchParams.get('page')),
      search: url.searchParams.get('search') || '',
      topic: url.searchParams.get('topic') || '',
      languages: url.searchParams.get('languages') || '',
    });
    state.next = j.next; state.page++; state.count = j.count;
    const grid = root.querySelector('#grid');
    state.feed.push(...j.results);
    grid.insertAdjacentHTML('beforeend', j.results.map((b) => cardHTML(b, { onshelf: !!peekProgress(b.id) })).join(''));
    enhanceCards(grid);
    root.querySelector('#grid-count').textContent = `共 ${j.count.toLocaleString()} 本 · ${filterNote()}`;
  } catch (e) {
    import('../ui.js').then(({ toast }) => toast('加载失败：' + e.message, true));
  }
  btn.disabled = false; btn.textContent = '再搬一摞来';
  state.loading = false;
}

/* ---------- 换筛选：整页重载（热榜/帘/网格跟随） ---------- */
async function reloadGrid(root, patch) {
  Object.assign(state, patch, { page: 1, next: null, books: [] });
  const grid = root.querySelector('#grid');
  const rankList = root.querySelector('#rank-list');
  grid.classList.remove('in');
  grid.innerHTML = skeletons(12);
  rankList?.classList.add('busy');
  renderFilters(root);
  try {
    const j = await fetchBooks({ page: 1, search: state.search, topic: state.topic, languages: state.lang });
    state.next = j.next; state.page = 1; state.count = j.count;
    state.feed = j.results;
    renderCurtain(root);
    renderRank(root);
    renderGridStart(root);
    rankList?.classList.remove('busy');
    root.querySelector('#rank-section')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  } catch (e) {
    grid.innerHTML = failHTML(String(e));
    rankList?.classList.remove('busy');
  }
}

/* ---------- 事件（每次 mount 绑一次，view 容器同一实例） ---------- */
function bindEvents(root) {
  root.querySelector('#load-more')?.addEventListener('click', () => loadMore(root));

  root.removeEventListener('click', onRootClick); // 搜索路径会二次 mount，防重复绑定
  root.addEventListener('click', onRootClick);
}

function onRootClick(e) {
  const card = e.target.closest('[data-book]');
  if (card) {
    const id = Number(card.dataset.book);
    openDetail(id, card, state.feed.find((book) => book.id === id));
    return;
  }
  const lang = e.target.closest('[data-lang]');
  if (lang) { reloadGrid(viewRoot(), { lang: lang.dataset.lang }); return; }
  const topic = e.target.closest('[data-topic]');
  if (topic) { reloadGrid(viewRoot(), { topic: state.topic === topic.dataset.topic ? '' : topic.dataset.topic }); return; }
  if (e.target.id === 'clear-search') reloadGrid(viewRoot(), { search: '' });
}
const viewRoot = () => document.getElementById('view');

export function unmountBrowse() {
  curtainCtl?.destroy(); curtainCtl = null;
  marqueeCtl?.destroy(); marqueeCtl = null;
  const view = viewRoot();
  view?.removeEventListener('click', onRootClick);
}
