/* ============================================================
   covers.js — 生成式封面
   古登堡不少书没有封面图；与其放灰占位，不如按书的 id
   生成一张有版式的书封（色板 hash 自 id，衬线排版）。
   ============================================================ */

const PALETTES = [
  ['#1d3a2f', '#e8dfc8', '#c8a24a'], // 墨绿 / 米 / 金
  ['#3b2430', '#e9dcc6', '#c8744a'], // 茄紫褐 / 米 / 橘
  ['#22394d', '#e4e3d3', '#8fa8b8'], // 藏蓝 / 灰米 / 雾蓝
  ['#4a2c1e', '#ecdfc7', '#d19a5b'], // 赭褐 / 米 / 琥珀
  ['#2e3b26', '#e7e0c9', '#a4b06a'], // 苔绿 / 米 / 橄榄
  ['#402020', '#ead9c0', '#b5442a'], // 深红 / 米 / 朱砂
];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 生成一张 2:3 的 SVG 书封（data URL 或可直接内联的字符串） */
export function genCover(title, author = '', seed = '') {
  const h = hash(seed + title);
  const [bg, paper, accent] = PALETTES[h % PALETTES.length];
  const W = 300, H = 450;

  // 标题折行（每行 ~16 字符）
  const words = (title || 'Untitled').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 17 && cur) { lines.push(cur.trim()); cur = w; }
    else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  const maxLines = 6;
  const shown = lines.slice(0, maxLines);
  const fs = shown.length > 4 ? 26 : shown.length > 3 ? 30 : 34;

  const motif = h % 3; // 三种纹样：圆环 / 细线场 / 菱形
  let motifSVG = '';
  if (motif === 0) {
    motifSVG = `<circle cx="${W - 62}" cy="66" r="34" fill="none" stroke="${accent}" stroke-width="2"/>
      <circle cx="${W - 62}" cy="66" r="22" fill="none" stroke="${accent}" stroke-width="1" opacity="0.6"/>`;
  } else if (motif === 1) {
    let ls = '';
    for (let i = 0; i < 7; i++) ls += `<line x1="36" y1="${46 + i * 9}" x2="${36 + 60 + (i % 3) * 18}" y2="${46 + i * 9}" stroke="${accent}" stroke-width="1.6" opacity="${0.85 - i * 0.1}"/>`;
    motifSVG = ls;
  } else {
    motifSVG = `<rect x="218" y="40" width="52" height="52" transform="rotate(45 244 66)" fill="none" stroke="${accent}" stroke-width="1.8"/>`;
  }

  const titleTspans = shown.map((l, i) =>
    `<tspan x="36" dy="${i === 0 ? 0 : fs * 1.16}">${esc(l)}</tspan>`).join('');
  const authorLine = author ? esc(author.slice(0, 26)) : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="${paper}" stroke-opacity="0.28" stroke-width="1"/>
  ${motifSVG}
  <text x="36" y="${110 + fs}" font-family="Georgia, 'Times New Roman', serif" font-size="${fs}" fill="${paper}" letter-spacing="0.4">${titleTspans}</text>
  <line x1="36" y1="${H - 92}" x2="${W - 36}" y2="${H - 92}" stroke="${accent}" stroke-width="2"/>
  <text x="36" y="${H - 60}" font-family="Georgia, serif" font-style="italic" font-size="17" fill="${paper}" opacity="0.85">${authorLine}</text>
  <rect x="0" y="0" width="9" height="${H}" fill="${accent}" opacity="0.9"/>
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* 统一取封面：真图 > 生成图 */
export function coverFor(book) {
  return coverImage(book) || genCover(book.title, book.authors?.[0]?.name, String(book.id));
}
export function coverImage(book) {
  return book?.formats?.['image/jpeg'] || null;
}
