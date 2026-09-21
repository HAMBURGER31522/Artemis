/* ============================================================
   reader.js — 阅读器
   分页：CSS multi-column 把一章切成横向列，每列一页；
   翻页：拖拽跟手（直接跟）→ 松手按位移+速度决定翻/回，
   落页走下阻尼弹簧（§1，落而有重）；滚轮走 momentum guard（§3）。
   进度按字符权重精确到全书的百分比。
   ============================================================ */
import { getBook, getProgress, saveProgress } from '../shelf.js';
import { spring, clamp, onFrame, REDUCED } from '../motion.js';
import { esc } from '../ui.js';

const el = () => document.getElementById('reader');
const track = () => document.getElementById('pager-track');
const pager = () => document.getElementById('pager');

const S = {
  book: null, cum: [], total: 1,
  chapter: 0, page: 0, pages: 1,
  x: 0, dragging: false, open: false,
  settings: { fs: 19, lh: 1.85, theme: 'paper' },
  saveTimer: null,
};

/* ---------- 打开 ---------- */
export async function openReader(id) {
  const book = await getBook(id);
  if (!book) return;
  S.book = book;
  S.open = true;

  // 字符权重表
  S.cum = [0];
  let acc = 0;
  for (const c of book.chapters) {
    acc += c.html.replace(/<[^>]*>/g, '').length;
    S.cum.push(acc);
  }
  S.total = Math.max(1, acc);

  // 恢复设置与进度
  try { Object.assign(S.settings, JSON.parse(localStorage.getItem('inkshelf-reader') || '{}')); } catch {}
  const prog = await getProgress(id);
  S.chapter = prog?.chapter ?? 0;
  S.page = prog?.page ?? 0;

  const R = el();
  R.classList.add('open');
  R.style.setProperty('--rd-fs', S.settings.fs + 'px');
  R.style.setProperty('--rd-lh', S.settings.lh);
  document.body.dataset.readerTheme = S.settings.theme;
  document.getElementById('rc-title').innerHTML =
    `${esc(book.title)}<small>${esc(book.authors[0] || '')} · ${book.chapters.length} 章</small>`;
  renderToc();
  showLoading(`正在翻开《${book.title.slice(0, 18)}》`);
  loadChapter(S.chapter, S.page, true);
  bindOnce();
}

function showLoading(t) {
  const L = document.getElementById('reader-loading');
  document.getElementById('loading-title').textContent = t;
  L.classList.remove('gone');
}
function hideLoading() { document.getElementById('reader-loading').classList.add('gone'); }

/* ---------- 章节装载与分页 ---------- */
function loadChapter(ci, targetPage = 0, instant = false) {
  S.chapter = clamp(ci, 0, S.book.chapters.length - 1);
  const chap = S.book.chapters[S.chapter];
  const flow = document.createElement('div');
  flow.className = 'page-flow';
  flow.innerHTML = `<h2>${esc(chap.title)}</h2>${chap.html}`;
  const t = track();
  t.style.transition = 'none';
  t.style.opacity = '1'; // 清掉上次会话遗留的换章淡出
  t.replaceChildren(flow);

  // 同步分页：读 scrollWidth 会强制布局，不依赖 rAF（后台标签也能正确初始化）
  paginate();
  S.page = clamp(targetPage, 0, S.pages - 1);
  applyX(instant || REDUCED);
  updateHud();
  hideLoading();

  // 插图加载会改变内容高度 → 加载完重新分页并保持位置
  flow.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', () => reflowKeep(), { once: true });
  });
}

function metrics() {
  const flow = track().firstElementChild;
  if (!flow) return { W: 1, G: 1, pages: 1 };
  const W = flow.clientWidth, G = parseFloat(getComputedStyle(flow).columnGap) || 0;
  return { W, G, pages: S.pages };
}

/* 分页：多列的溢出列是 ink overflow，不占布局 ——
   页数用「内容自然总高 ÷ 列高」计算（height:auto 测一次再还原） */
function paginate() {
  const flow = track().firstElementChild;
  if (!flow) return (S.pages = 1);
  const cs = getComputedStyle(flow);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const colH = Math.max(1, flow.clientHeight - padY);
  const prevH = flow.style.height;
  flow.style.height = 'auto';
  const totalH = flow.scrollHeight - padY;
  flow.style.height = prevH;
  S.pages = Math.max(1, Math.ceil(totalH / colH - 0.02)); // 浮点容差
  return S.pages;
}

function applyX(instant = false) {
  const { W, G } = metrics();
  S.x = -S.page * (W + G);
  if (instant || REDUCED) track().style.transform = `translateX(${S.x}px)`;
  else animateXTo(S.x);
}

/* ---------- 弹簧落页 ---------- */
let animStop = null;
function animateXTo(target) {
  animStop?.();
  if (REDUCED) { track().style.transform = `translateX(${target}px)`; return; }
  const sp = spring(120, 0.85);
  sp.x = S.x;
  sp.target = target;
  animStop = onFrame((dt) => {
    const nx = sp.step(dt);
    if (Math.abs(nx - sp.target) < 0.4 && Math.abs(sp.v) < 8) {
      S.x = sp.target;
      track().style.transform = `translateX(${S.x}px)`;
      animStop?.(); animStop = null;
      return;
    }
    S.x = nx;
    track().style.transform = `translateX(${nx}px)`;
  });
}

/* ---------- 翻页 ---------- */
function turn(dir) {
  if (!S.open) return;
  const { W, G } = metrics();
  if (dir > 0) {
    if (S.page < S.pages - 1) { S.page++; animateXTo(-S.page * (W + G)); }
    else if (S.chapter < S.book.chapters.length - 1) crossChapter(S.chapter + 1, 0, 1);
    else { nudge(dir); return; }
  } else {
    if (S.page > 0) { S.page--; animateXTo(-S.page * (W + G)); }
    else if (S.chapter > 0) crossChapter(S.chapter - 1, Infinity, -1);
    else { nudge(dir); return; }
  }
  updateHud(); queueSave();
}
/* 章边界轻推：到头了打个手感提示 */
let nudgeSp = null, nudging = false;
function nudge(dir) {
  if (REDUCED || nudging) return;
  nudging = true;
  nudgeSp = spring(160, 0.8);
  nudgeSp.x = 0; nudgeSp.target = dir * -14;
  let t = 0;
  cancelAnimationFrame(nudge._raf);
  const step = () => {
    t += 1 / 60;
    const v = nudgeSp.step(1 / 60);
    const decay = t < 0.1 ? 1 : Math.max(0, 1 - (t - 0.1) * 5);
    track().style.transform = `translateX(${S.x + v * decay}px)`;
    if (t < 0.28) nudge._raf = requestAnimationFrame(step);
    else { track().style.transform = `translateX(${S.x}px)`; nudging = false; }
  };
  nudge._raf = requestAnimationFrame(step);
}

/* 换章：短促墨闪，保住翻页节奏 */
function crossChapter(ci, page, dir) {
  const t = track();
  t.style.transition = `opacity ${REDUCED ? 0 : 90}ms ease-in`;
  t.style.opacity = '0.25';
  setTimeout(() => {
    t.style.transition = 'none';
    loadChapter(ci, page === Infinity ? 9999 : page);
    updateHud();
    requestAnimationFrame(() => {
      t.style.transition = `opacity ${REDUCED ? 0 : 240}ms ease-out`;
      t.style.opacity = '1';
    });
  }, REDUCED ? 0 : 90);
}

/* ---------- HUD / 进度 ---------- */
function updateHud() {
  const chap = S.book.chapters[S.chapter];
  document.getElementById('rf-chap').textContent = chap.title;
  const inChap = (S.page + 1) / S.pages;
  const pct = (S.cum[S.chapter] + inChap * (S.cum[S.chapter + 1] - S.cum[S.chapter])) / S.total;
  const pctText = Math.min(100, Math.round(pct * 100));
  document.getElementById('rf-pct').textContent = pctText + '%';
  document.getElementById('rf-bar').style.width = pctText + '%';
  document.querySelectorAll('.toc-item').forEach((n, i) => n.classList.toggle('cur', i === S.chapter));
}

function queueSave() {
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(() => {
    const inChap = (S.page + 1) / S.pages;
    const pct = (S.cum[S.chapter] + inChap * (S.cum[S.chapter + 1] - S.cum[S.chapter])) / S.total;
    saveProgress(S.book.id, { chapter: S.chapter, page: S.page, pages: S.pages, pct });
  }, 350);
}

/* ---------- 目录 ---------- */
function renderToc() {
  const list = document.getElementById('toc-list');
  document.getElementById('toc-count').textContent = `${S.book.chapters.length} 章`;
  list.innerHTML = S.book.chapters.map((c, i) =>
    `<button class="toc-item" data-ch="${i}" type="button">${esc(c.title)}</button>`).join('');
  list.onclick = (e) => {
    const b = e.target.closest('[data-ch]');
    if (!b) return;
    document.getElementById('reader-toc').classList.remove('open');
    crossChapter(Number(b.dataset.ch), 0, 1);
  };
}

/* ---------- 设置 ---------- */
function persistSettings() {
  localStorage.setItem('inkshelf-reader', JSON.stringify(S.settings));
}
/* 重排并按比例保持位置（字号变更 / 图片加载 / 窗口缩放共用） */
function reflowKeep() {
  const ratio = S.pages > 1 ? (S.page + 0.5) / S.pages : 0;
  paginate();
  S.page = clamp(Math.floor(ratio * S.pages), 0, S.pages - 1);
  applyX(true);
  updateHud();
}

function reflow() {
  const R = el();
  R.style.setProperty('--rd-fs', S.settings.fs + 'px');
  R.style.setProperty('--rd-lh', S.settings.lh);
  document.body.dataset.readerTheme = S.settings.theme;
  reflowKeep();
}

/* ---------- 事件绑定（一次） ---------- */
let boundOnce = false;
function bindOnce() {
  if (boundOnce) return;
  boundOnce = true;
  const P = pager(), R = el();

  /* 拖拽翻页：按下记录，跟手直移，松手按位移+速度落页 */
  let drag = null;
  P.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.hotzone')) return;
    drag = { x0: e.clientX, dx: 0, t0: performance.now(), v: 0, lx: e.clientX, lt: performance.now(), moved: false };
    animStop?.(); animStop = null;
    P.setPointerCapture(e.pointerId);
  });
  P.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.dx = e.clientX - drag.x0;
    drag.v = (e.clientX - drag.lx) / Math.max(1, performance.now() - drag.lt);
    drag.lx = e.clientX; drag.lt = performance.now();
    if (Math.abs(drag.dx) > 5) drag.moved = true;
    if (!REDUCED) track().style.transform = `translateX(${S.x + drag.dx}px)`;
  });
  P.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    const { W, G } = metrics();
    const fling = Math.abs(d.v) > 0.45;
    const far = Math.abs(d.dx) > W * 0.22;
    if (!d.moved) { toggleChrome(); return; }
    if ((far || fling)) {
      const back = d.dx > 0;
      if (back) turn(-1);
      else if (S.page < S.pages - 1) { S.page++; animateXTo(-S.page * (W + G)); updateHud(); queueSave(); }
      else if (S.chapter < S.book.chapters.length - 1) crossChapter(S.chapter + 1, 0, 1);
      else animateXTo(S.x);
    } else animateXTo(S.x); // 回弹
  });
  P.addEventListener('pointercancel', () => { if (drag) { drag = null; animateXTo(S.x); } });

  /* 热区点击翻页 */
  document.getElementById('hz-left').addEventListener('click', () => turn(-1));
  document.getElementById('hz-right').addEventListener('click', () => turn(1));

  /* 滚轮：momentum guard（§3）——一gesture只走一页 */
  let acc = 0, lockedUntil = 0;
  P.addEventListener('wheel', (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now < lockedUntil) return;
    if (Math.sign(e.deltaY) !== Math.sign(acc)) acc = 0;
    acc += e.deltaY;
    if (Math.abs(acc) >= 90) { turn(Math.sign(acc)); acc = 0; lockedUntil = now + 600; }
  }, { passive: false });

  /* 键盘 */
  document.addEventListener('keydown', onKey);

  /* chrome / 工具 */
  document.getElementById('rc-back').addEventListener('click', closeReader);
  document.getElementById('rc-toc').addEventListener('click', () => {
    document.getElementById('reader-toc').classList.toggle('open');
    document.getElementById('reader-settings').classList.remove('open');
  });
  document.getElementById('rc-settings').addEventListener('click', () => {
    document.getElementById('reader-settings').classList.toggle('open');
    document.getElementById('reader-toc').classList.remove('open');
  });
  document.getElementById('rc-theme').addEventListener('click', () => {
    const order = ['paper', 'sepia', 'night'];
    S.settings.theme = order[(order.indexOf(S.settings.theme) + 1) % order.length];
    document.body.dataset.readerTheme = S.settings.theme;
    syncSettingBtns(); persistSettings();
  });

  /* 设置面板 */
  document.getElementById('fs-plus').addEventListener('click', () => { S.settings.fs = clamp(S.settings.fs + 1, 15, 26); persistSettings(); reflow(); });
  document.getElementById('fs-minus').addEventListener('click', () => { S.settings.fs = clamp(S.settings.fs - 1, 15, 26); persistSettings(); reflow(); });
  document.querySelectorAll('[data-lh]').forEach((b) => b.addEventListener('click', () => {
    S.settings.lh = parseFloat(b.dataset.lh); persistSettings(); reflow(); syncSettingBtns();
  }));
  document.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
    S.settings.theme = b.dataset.theme; persistSettings(); reflow(); syncSettingBtns();
  }));

  window.addEventListener('resize', onResize);
}

function syncSettingBtns() {
  document.querySelectorAll('[data-lh]').forEach((b) => b.classList.toggle('on', parseFloat(b.dataset.lh) === S.settings.lh));
  document.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('on', b.dataset.theme === S.settings.theme));
}

function onKey(e) {
  if (!S.open) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') turn(1);
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') turn(-1);
  else if (e.key === 'Escape') {
    if (document.getElementById('reader-toc').classList.contains('open')) document.getElementById('reader-toc').classList.remove('open');
    else if (document.getElementById('reader-settings').classList.contains('open')) document.getElementById('reader-settings').classList.remove('open');
    else closeReader();
  }
}

function toggleChrome() { el().classList.toggle('chrome-on'); }

/* ---------- 关闭 ---------- */
export function closeReader() {
  if (!S.open) return;
  queueSave(); // 立刻存
  S.open = false;
  el().classList.remove('open', 'chrome-on');
  document.getElementById('reader-toc').classList.remove('open');
  document.getElementById('reader-settings').classList.remove('open');
  location.hash = '#/shelf';
  document.dispatchEvent(new CustomEvent('shelf-changed'));
}

let resizeTimer;
function onResize() {
  if (!S.open) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(reflowKeep, 200);
}
