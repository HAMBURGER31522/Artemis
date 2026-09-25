/* ============================================================
   detail.js — 「书籍出匣」（Slipcase Pull-out）
   不弹窗：选中书 FLIP 放大移到中央偏左（带书脊/书口的实体书），
   右侧从书匣抽出导读折页（撕边羊皮纸）。
   入架：折页收回 → 书合上飞入书架 → 进阅读器。
   ============================================================ */
import { fetchBook, coverUrl } from '../api.js';
import { coverFor } from '../covers.js';
import { esc, fmtNum, authorName, toast } from '../ui.js';
import { convertBook } from '../converter.js';
import { addBook, hasBook, removeBook, peekProgress } from '../shelf.js';
import { bump, REDUCED } from '../motion.js';

const overlay = () => document.getElementById('detail-overlay');
const panel = () => document.getElementById('detail-panel');
let current = null;      // { id, meta, sourceEl }
let exiting = false;     // 出匣动画进行中，阻止重复点击

export async function openDetail(id, sourceEl, prefetchedMeta = null) {
  exiting = false;
  overlay().classList.add('open');
  panel().innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;color:var(--paper);font-family:var(--serif);font-style:italic;font-size:18px">取书去了…</div>`;
  try {
    const meta = prefetchedMeta || await fetchBook(id);
    current = { id, meta, sourceEl };
    if (overlay().classList.contains('open')) render(meta);
  } catch (e) {
    panel().innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;color:var(--paper)">没取到这本书：${esc(e.message)}</div>`;
  }
}

export function closeDetail() {
  if (!overlay().classList.contains('open')) return;
  const src = current?.sourceEl?.isConnected ? current.sourceEl : null;
  current = null;
  playExit({ flyToSource: src, thenRemove: true });
}

/* ---------- 渲染 ---------- */
function render(meta) {
  const img = coverFor(meta);
  const summary = meta.summaries?.[0]?.replace(/\s+/g, ' ').slice(0, 520) || '古登堡没有为这本书留下简介——也许这正是一本该亲自翻开的书。';
  const authors = meta.authors.map((a) => {
    const yr = a.birth_year || a.death_year ? `（${a.birth_year ?? '?'}–${a.death_year ?? '?'}）` : '';
    return esc(a.name) + yr;
  }).join('；');
  const inShelf = !!peekProgress(meta.id) || (current._inShelf === true);
  const prog = peekProgress(meta.id);
  const kind = Object.keys(meta.formats).some((k) => k.includes('html')) ? 'HTML 源' : 'TXT 源';

  panel().innerHTML = `
  <div class="slipcase">
    <button class="close" id="d-close" aria-label="合上放回">✕</button>
    <div class="slip-book">
      <div class="slip-cover" id="slip-cover"><img src="${esc(img)}" alt=""></div>
    </div>
    <div class="slip-fold out" id="slip-fold">
      <div class="fold-paper"></div>
      <div class="fold-inner">
        <div class="kicker">Gutenberg #${meta.id} · ${esc((meta.languages || []).join(' / ').toUpperCase())}</div>
        <h2>${esc(meta.title)}</h2>
        <div class="author">${authors || '佚名'}</div>
        <div class="facts">
          <span class="fact">↓ ${fmtNum(meta.download_count)} 次下载</span>
          <span class="fact">${meta.copyright === false || meta.copyright === null ? '公版 · 无版权限制' : '注意版权'}</span>
          <span class="fact">${kind}</span>
        </div>
        <div class="summary">${esc(summary)}</div>
        <div class="subjects">${(meta.bookshelves || []).slice(0, 4).map((s) => `<span>#${esc(s)}</span>`).join('')}</div>
        <div class="cta-row">
          <button class="seal-btn" id="d-read" type="button" aria-label="入架并开始阅读">
            <span class="seal-ring" id="d-ring"></span>
            <span class="seal-face" id="d-face">${inShelf ? '开读' : '入架'}</span>
          </button>
          <div class="seal-note">
            <div class="lab" id="d-read-label">${inShelf ? '已在你的书架上' : '下载 · 浏览器内转换 · 离线可读'}</div>
            <div class="sub">${inShelf && prog ? `上次读到 ${Math.round(prog.pct * 100)}%` : '点击火漆，一步完成'}</div>
            ${inShelf ? `<button class="linkish" id="d-remove" type="button">移出书架</button>` : ''}
          </div>
        </div>
      </div>
    </div>
  </div>`;

  panel().querySelector('#d-close').addEventListener('click', closeDetail);
  panel().querySelector('#d-read').addEventListener('click', () => startRead(meta));
  const rm = panel().querySelector('#d-remove');
  if (rm) rm.addEventListener('click', async () => {
    await removeBook(meta.id);
    toast('已移出书架');
    document.dispatchEvent(new CustomEvent('shelf-changed'));
    current = null;
    playExit({ fadeOnly: true, thenRemove: true });
  });

  enterStage();
}

/* ---------- 入场：书 FLIP 放大 + 折页抽出 ---------- */
function enterStage() {
  const cov = panel().querySelector('#slip-cover');
  const fold = panel().querySelector('#slip-fold');
  if (!cov || !fold) return;

  if (REDUCED) { fold.classList.remove('out'); return; }

  // FLIP：从来源卡片位置放大到舞台
  const srcImg = current?.sourceEl?.querySelector?.('img');
  if (srcImg && srcImg.isConnected) {
    const s = srcImg.getBoundingClientRect();
    const d = cov.getBoundingClientRect();
    const dx = (s.left + s.width / 2) - (d.left + d.width / 2);
    const dy = (s.top + s.height / 2) - (d.top + d.height / 2);
    const sc = s.width / d.width;
    cov.style.transition = 'none';
    cov.style.transform = `translate(${dx}px, ${dy}px) scale(${sc})`;
    void cov.offsetWidth; // 强制布局，锚定起始态
    cov.style.transition = 'transform 0.68s var(--spring-soft)';
    cov.style.transform = 'rotateY(-7deg)';
  }

  // 折页随后从书匣里抽出
  requestAnimationFrame(() => requestAnimationFrame(() => fold.classList.remove('out')));
}

/* ---------- 出场 ----------
   flyToSource：飞回来源卡片（普通关闭）
   flyToShelf：飞向书架按钮（入架仪式）
   fadeOnly：直接淡出 */
function playExit({ flyToSource = null, flyToShelf = false, fadeOnly = false, thenRemove = false }) {
  const cov = panel().querySelector('#slip-cover');
  const fold = panel().querySelector('#slip-fold');
  exiting = true;

  const finish = () => {
    overlay().classList.remove('open');
    if (thenRemove) setTimeout(() => { if (!overlay().classList.contains('open')) panel().innerHTML = ''; }, 320);
  };

  if (REDUCED || fadeOnly || !cov) {
    if (fold) fold.classList.add('out');
    finish();
    return;
  }

  // 折页收回书匣
  if (fold) {
    fold.style.transition = 'transform 0.3s var(--e-in-expo), opacity 0.22s ease';
    fold.classList.add('out');
  }

  // 目标矩形
  let target = null;
  if (flyToShelf) target = document.getElementById('btn-shelf')?.getBoundingClientRect();
  else if (flyToSource) {
    const img = flyToSource.querySelector?.('img');
    if (img && img.isConnected) target = img.getBoundingClientRect();
  }

  cov.style.transition = 'transform 0.62s var(--e-in-out-quart), opacity 0.4s ease 0.3s';
  if (target) {
    const d = cov.getBoundingClientRect();
    const dx = (target.left + target.width / 2) - (d.left + d.width / 2);
    const dy = (target.top + target.height / 2) - (d.top + d.height / 2);
    const sc = Math.max(0.12, target.width / d.width);
    cov.style.transform = `translate(${dx}px, ${dy}px) scale(${sc}) rotate(${flyToShelf ? 10 : 0}deg)`;
  } else {
    cov.style.transform = 'rotateY(-16deg) scale(0.9)';
  }
  cov.style.opacity = '0';
  setTimeout(finish, 660);
}

/* ---------- 入架 → 开读 ---------- */
async function startRead(meta) {
  if (exiting) return;
  const btn = panel().querySelector('#d-read');
  const ring = panel().querySelector('#d-ring');
  const face = panel().querySelector('#d-face');
  const label = panel().querySelector('#d-read-label');
  btn.disabled = true;

  try {
    if (!(await hasBook(meta.id))) {
      face.textContent = '入架';
      label.textContent = '正在下载原书…';
      ring.style.setProperty('--p', 2);
      const converted = await convertBook(meta, (step) => {
        const m = step.match(/(\d+)%/);
        if (m) { ring.style.setProperty('--p', m[1]); label.textContent = `下载 ${m[1]}%`; }
        else if (step === '解析与分章') { ring.style.setProperty('--p', 100); label.textContent = '正在分章…'; }
        else label.textContent = step;
      });
      ring.style.setProperty('--p', 100);
      label.textContent = `转换完成 · ${converted.chapters.length} 章`;
      meta._cover = coverUrl(meta);
      await addBook(meta, converted);
      document.dispatchEvent(new CustomEvent('shelf-changed'));
    }
    // 仪式：折页收回、书合上飞进书架，然后开读
    current = null;
    playExit({ flyToShelf: true });
    bump(document.getElementById('shelf-count'));
    setTimeout(() => { location.hash = '#/read/' + meta.id; }, REDUCED ? 0 : 560);
  } catch (e) {
    face.textContent = '入架';
    label.textContent = '下载 · 浏览器内转换 · 离线可读';
    ring.style.setProperty('--p', 0);
    btn.disabled = false;
    toast(e.message, true);
  }
}

/* ---------- 全局绑定（一次） ---------- */
let bound = false;
export function bindDetailGlobal() {
  if (bound) return;
  bound = true;
  overlay().addEventListener('click', (e) => { if (e.target === overlay()) closeDetail(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay().classList.contains('open')) closeDetail(); });
}
