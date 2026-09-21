/* ============================================================
   converter.js — 内置转换器
   古登堡原始文件（HTML / TXT）→ 结构化章节，全程浏览器内完成。
   HTML 用 Range 跨容器切片（生成版 HTML 章节结构再怪也能切）；
   TXT 做编码探测、剥壳、中英文章节识别与段落重建。
   ============================================================ */

import { proxifyImg } from './api.js';

/* ---------- 编码探测：UTF-8 严格模式失败则回退 Windows-1252 ---------- */
function decodeBuffer(buf) {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), enc: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(buf), enc: 'windows-1252' };
  }
}

const isHTMLSource = (url) => /\.html?(\.|$)/i.test(url) || /text\/html/i.test(url);

/* ============================================================
   HTML 管线
   ============================================================ */
const START_RE = /START OF (?:TH[IS]|THE) PROJECT GUTENBERG/i;
const END_RE = /END OF (?:TH[IS]|THE) PROJECT GUTENBERG/i;

const KEEP = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'BR', 'EM', 'I', 'STRONG', 'B',
  'U', 'S', 'BLOCKQUOTE', 'Q', 'CITE', 'IMG', 'FIGURE', 'FIGCAPTION', 'HR', 'UL', 'OL', 'LI',
  'SUP', 'SUB', 'SMALL', 'SPAN', 'DIV', 'ABBR', 'TABLE', 'TR', 'TD', 'TH', 'CAPTION']);
const DROP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'IFRAME', 'OBJECT', 'SVG', 'NAV',
  'ASIDE', 'BUTTON', 'INPUT', 'FORM', 'AUDIO', 'VIDEO', 'SOURCE']);

function findMarker(root, re) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (re.test(n.nodeValue)) {
      // 回溯到 root 的直接子级
      let el = n.parentElement;
      while (el && el.parentElement !== root) el = el.parentElement;
      return el || n.parentElement;
    }
  }
  return null;
}

function sanitize(frag, baseUrl) {
  const out = document.createElement('div');
  out.appendChild(frag);

  // 预处理：装饰性首字母图（短 alt）直接还原为文字，避免 TreeWalker 中的顺序问题
  for (const img of [...out.querySelectorAll('img')]) {
    const alt = (img.getAttribute('alt') || '').trim();
    if (alt && alt.length <= 3) img.replaceWith(document.createTextNode(alt));
  }

  const kill = [];
  const walk = document.createTreeWalker(out, NodeFilter.SHOW_ELEMENT);
  let el;
  while ((el = walk.nextNode())) {
    // 古登堡的页码锚（<span class="pagenum">{37}</span>）整棵去掉
    if (/\bpagenum\b/.test(el.getAttribute('class') || '')) { kill.push(el); continue; }
    if (DROP.has(el.tagName)) { kill.push(el); continue; }
    if (!KEEP.has(el.tagName)) continue; // 之后 unwrap
    // 清属性
    for (const a of [...el.attributes]) {
      if (el.tagName === 'IMG' && (a.name === 'src' || a.name === 'alt')) continue;
      el.removeAttribute(a.name);
    }
    if (el.tagName === 'IMG') {
      const s = el.getAttribute('src');
      if (!s) { kill.push(el); continue; }
      el.setAttribute('loading', 'lazy');
      el.setAttribute('src', proxifyImg(s, baseUrl));
      el.addEventListener('error', () => el.remove(), { once: true });
    }
  }
  for (const k of kill) k.remove();
  // unwrap 非白名单容器
  let again = true;
  while (again) {
    again = false;
    for (const el of [...out.querySelectorAll('*')]) {
      if (!KEEP.has(el.tagName)) {
        el.replaceWith(...el.childNodes);
        again = true;
      }
    }
  }
  // 空段落清理 + 残留页码文本 {37}
  const tw = document.createTreeWalker(out, NodeFilter.SHOW_TEXT);
  const texts = [];
  let tn;
  while ((tn = tw.nextNode())) if (/\{\d{1,4}\}/.test(tn.nodeValue)) texts.push(tn);
  for (const tn of texts) tn.nodeValue = tn.nodeValue.replace(/\s*\{\d{1,4}\}\s*/g, ' ');
  for (const p of [...out.querySelectorAll('p')]) {
    if (!p.textContent.trim() && !p.querySelector('img,hr')) p.remove();
  }
  return out;
}

/* 章节标题清洗：剥掉标题里的装饰图与插图题词，只留文字 */
function headingTitle(h) {
  const clone = h.cloneNode(true);
  clone.querySelectorAll('img').forEach((i) => i.remove());
  clone.querySelectorAll('.caption, figcaption').forEach((i) => i.remove());
  let t = clone.textContent.replace(/\s+/g, ' ').trim();
  if (!t) t = h.textContent.replace(/\s+/g, ' ').trim();
  return t;
}

function convertHTML(buf, baseUrl, meta) {
  const { text } = decodeBuffer(buf);
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const body = doc.body;

  // 剥古登堡壳：START 标记之前的兄弟全删，END 之后的兄弟全删
  const startEl = findMarker(body, START_RE);
  if (startEl) {
    let n = startEl;
    while (n) { const prev = n.previousElementSibling; n.remove(); n = prev; }
  }
  const endEl = findMarker(body, END_RE);
  if (endEl) {
    let n = endEl;
    while (n) { const next = n.nextElementSibling; n.remove(); n = next; }
  }

  // 收集标题锚点（选数量最多的层级，>=3 才切章）
  const heads = [...body.querySelectorAll('h1,h2,h3,h4')];
  const byTag = {};
  for (const h of heads) (byTag[h.tagName] ??= []).push(h);
  const best = Object.entries(byTag).sort((a, b) => b[1].length - a[1].length)[0];
  const anchors = best && best[1].length >= 3 ? best[1] : null;

  const chapters = [];
  const push = (title, frag) => {
    const clean = sanitize(frag, baseUrl);
    const html = clean.innerHTML.trim();
    if (html.replace(/<[^>]*>/g, '').trim().length < 40 && !html.includes('<img')) return;
    chapters.push({ title: (title || '').replace(/\s+/g, ' ').trim().slice(0, 90) || `第 ${chapters.length + 1} 节`, html });
  };

  if (!anchors) {
    // 单章：全文
    const r = document.createRange();
    r.selectNodeContents(body);
    push(meta.title, r.cloneContents());
  } else {
    // 开篇（书名页之前有实质内容才保留）
    const first = anchors[0];
    const pre = document.createRange();
    pre.setStart(body, 0);
    pre.setEndBefore(first);
    const preText = pre.cloneContents().textContent.trim();
    if (preText.length > 120) push('卷首', pre.cloneContents());

    for (let i = 0; i < anchors.length; i++) {
      const r = document.createRange();
      r.setStartAfter(anchors[i]);
      if (i < anchors.length - 1) r.setEndBefore(anchors[i + 1]);
      else r.setEnd(body, body.childNodes.length); // 末章到 body 结尾
      push(headingTitle(anchors[i]), r.cloneContents());
    }
  }

  return finish(chapters, meta, 'html');
}

/* ============================================================
   TXT 管线
   ============================================================ */
const CH_LINE = [
  /^\s{0,6}(?:CHAPTER|Chapter)\s+([IVXLCivxlc\d]+|[A-Za-z]+)?\s*[.．—\-–:]?\s*.{0,48}$/,
  /^\s{0,6}第\s*[一二三四五六七八九十百千零〇两0-9]+\s*[回章节卷部篇集][^\n。！？]{0,26}$/,
  /^\s{0,6}(?:PROLOGUE|EPILOGUE|PREFACE|INTRODUCTION|PART\s+[IVXLC\d]+|CANTO\s+\S+|STAVE\s+\S+|ACT\s+\S+|SCENE\s+\S+|BOOK\s+[A-Z0-9]+)\b.{0,36}\s*$/i,
  /^\s{0,6}(?:序|楔子|引子|前言|凡例|后记|尾声|跋)\s*$/,
];
function isChapterLine(line) {
  if (!line || line.length > 64) return false;
  if (/[.。!！?？,，;；]$/.test(line.trim())) return false;
  return CH_LINE.some((re) => re.test(line));
}

const cjk = (s) => /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/.test(s);

function convertTXT(buf, meta) {
  const { text } = decodeBuffer(buf);

  // 剥壳
  let body = text;
  const sIdx = body.search(START_RE);
  if (sIdx > -1) body = body.slice(body.indexOf('\n', sIdx) + 1);
  const eIdx = body.search(END_RE);
  if (eIdx > -1) body = body.slice(0, body.lastIndexOf('\n', eIdx));

  const lines = body.split(/\r\n|\r|\n/);

  // 章节锚点
  const anchors = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (isChapterLine(l) && l.length > 1) anchors.push({ i, title: l });
  }
  // 锚点太密（误伤，比如目录页）→ 只保留相互间隔 > 400 行的
  const spaced = anchors.filter((a, i) =>
    i === 0 || (a.i - anchors[i - 1].i > 120 && a.i > 8) || a.i - anchors[i - 1].i === 0);
  const use = spaced.length >= 3 ? spaced : [];

  const paraHTML = (lineGroup) => {
    // 连续非空行合并为段；CJK 邻接直接连接，否则空格
    const paras = [];
    let cur = [];
    for (const raw of lineGroup) {
      const l = raw.trim();
      if (!l) { if (cur.length) { paras.push(cur); cur = []; } continue; }
      cur.push(l);
    }
    if (cur.length) paras.push(cur);
    return paras.map((ls) => {
      let t = '';
      for (let k = 0; k < ls.length; k++) {
        if (k === 0) t = ls[0];
        else {
          const prev = ls[k - 1], nxt = ls[k];
          t += (cjk(prev.slice(-1)) && cjk(nxt.slice(0, 1))) ? '' : ' ';
          t += nxt;
        }
      }
      t = t.replace(/\s{2,}/g, ' ').trim();
      return t ? `<p>${escHTML(t)}</p>` : '';
    }).join('\n');
  };

  const chapters = [];
  const push = (title, ls) => {
    const html = paraHTML(ls);
    if (html.replace(/<[^>]*>/g, '').trim().length < 40) return;
    chapters.push({ title: (title || `第 ${chapters.length + 1} 节`).slice(0, 80), html });
  };

  if (!use.length) {
    push(meta.title, lines);
  } else {
    // 开篇
    const pre = lines.slice(0, use[0].i);
    const preHTML = paraHTML(pre);
    if (preHTML.replace(/<[^>]*>/g, '').trim().length > 120) chapters.push({ title: '卷首', html: preHTML });
    for (let i = 0; i < use.length; i++) {
      const end = i + 1 < use.length ? use[i + 1].i : lines.length;
      push(use[i].title, lines.slice(use[i].i + 1, end));
    }
  }
  return finish(chapters, meta, 'txt');
}

const escHTML = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- 收尾：统计 ---------- */
function finish(chapters, meta, kind) {
  if (!chapters.length) throw new Error('这本书没能解析出正文，换一本试试');
  let chars = 0, cjkChars = 0;
  for (const c of chapters) {
    const plain = c.html.replace(/<[^>]*>/g, '').trim();
    chars += plain.length;
    for (const ch of plain.slice(0, 4000)) if (cjk(ch)) cjkChars++;
  }
  const perMin = cjkChars / Math.min(chars, 4000) > 0.25 ? 520 : 1150; // 中文≈520字/分，英文≈1150字符/分
  return {
    chapters,
    kind,
    chars,
    minutes: Math.max(1, Math.round(chars / perMin)),
    convertedAt: Date.now(),
  };
}

/* ---------- 对外入口 ---------- */
export async function convertBook(meta, onStep) {
  const { downloadRaw, pickSource } = await import('./api.js');
  const url = pickSource(meta.formats);
  if (!url) throw new Error('这本书没有可转换的文本格式');
  onStep?.('下载原书');
  const buf = await downloadRaw(url, (p) => onStep?.(`下载 ${Math.round(p * 100)}%`));
  onStep?.('解析与分章');
  await new Promise((r) => setTimeout(r, 30)); // 让 UI 喘口气
  const m = { title: meta.title };
  const result = isHTMLSource(url)
    ? convertHTML(buf, url, m)
    : convertTXT(buf, m);
  result.sourceUrl = url;
  return result;
}
