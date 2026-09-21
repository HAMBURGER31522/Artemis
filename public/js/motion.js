/* ============================================================
   motion.js — 动效引擎（motion-web handfeel 配方的 vanilla 实现）
   §1 下阻尼弹簧（落而有重） / §2 速度耦合（lean into movement）
   §7.1 帧率无关指数跟随 / Verlet 绳（书帘）
   只动 transform / opacity —— 预算纪律
   ============================================================ */

export const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 统一 rAF 驱动：所有循环任务注册在这里，页面隐藏时暂停 */
const tickers = new Set();
let running = false;
let last = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30); // clamp：后台回来不炸
  last = now;
  for (const fn of tickers) fn(dt, now);
  if (tickers.size) requestAnimationFrame(frame);
  else running = false;
}

export function onFrame(fn) {
  tickers.add(fn);
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  return () => tickers.delete(fn);
}

/* ---------- §1 下阻尼弹簧 ----------
   stiffness 60–90，damping 0.86 玩趣 / 0.90 果冻 / 0.93 沉稳 */
export function spring(stiffness = 90, damping = 0.88) {
  const s = { x: 0, v: 0, target: 0 };
  s.step = (dt) => {
    s.v += (s.target - s.x) * stiffness * dt;
    s.v *= Math.pow(damping, dt * 60); // 帧率无关化
    s.x += s.v * dt;
    return s.x;
  };
  return s;
}

/* ---------- §7.1 指数跟随（不回弹的"跟"） ---------- */
export function follower(k = 8) {
  const f = { x: 0, target: 0 };
  f.step = (dt) => { f.x += (f.target - f.x) * (1 - Math.exp(-k * dt)); return f.x; };
  return f;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- 视口内时才跑（性能地板 §7） ---------- */
export function whenVisible(el, fn, off) {
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (e.isIntersecting) { fn(); off ? io.unobserve(el) : 0; }
      else { /* 保持注册，由调用方自行决定 */ }
    }
  }, { threshold: 0.05 });
  io.observe(el);
  return io;
}

/* ============================================================
   卡片 3D 倾斜 + 光照跟随（handfeel §1 + §2 + §5）
   倾斜读"加速度"而非指针位置，带惯性，松手弹簧回正。
   ============================================================ */
export function makeTilt(card, { maxTilt = 10, maxLean = 14 } = {}) {
  if (REDUCED) return { destroy() {} };
  const tiltEl = card.querySelector('.tilt');
  if (!tiltEl) return { destroy() {} };

  const rx = spring(80, 0.86), ry = spring(80, 0.86), rz = spring(70, 0.88);
  let inside = false;
  const stop = onFrame(() => {
    const a = rx.step(0.016), b = ry.step(0.016), c = rz.step(0.016);
    if (Math.abs(a) < 0.01 && Math.abs(b) < 0.01 && Math.abs(c) < 0.01 && !inside) return;
    tiltEl.style.transform =
      `rotateX(${a.toFixed(2)}deg) rotateY(${b.toFixed(2)}deg) rotateZ(${c.toFixed(2)}deg)`;
  });

  function onMove(e) {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    // 目标 = 指针偏移映射的倾角；速度耦合体现在弹簧追踪中
    ry.target = (px - 0.5) * 2 * maxTilt;
    rx.target = -(py - 0.5) * 2 * maxTilt;
    // 速度倾斜（§2）：指针横向速度 → 微转向
    rz.target = clamp(ry.v * 0.9, -maxLean * 0.25, maxLean * 0.25);
  }
  function onEnter() { inside = true; rx.target = 0; ry.target = 0; }
  function onLeave() {
    inside = false;
    rx.target = 0; ry.target = 0; rz.target = 0;
  }
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerenter', onEnter);
  card.addEventListener('pointerleave', onLeave);
  return { destroy() { stop(); card.removeEventListener('pointermove', onMove); card.removeEventListener('pointerenter', onEnter); card.removeEventListener('pointerleave', onLeave); } };
}

/* ============================================================
   Verlet 书帘 —— hero 的招牌机制
   每张书封挂在一根绳上（钉在顶部横杆），指针掠过被推开，
   Verlet 积分 + 距离约束让它摆回时带着真实的钟摆重量。
   ============================================================ */
export function makeCurtain(container, books) {
  const N = books.length;
  if (!N) return { destroy() {} };
  const pendulums = [];
  let W = 0, H = 0;

  for (let i = 0; i < N; i++) {
    const el = document.createElement('div');
    el.className = 'rope-book';
    el.innerHTML = `<div class="cover">${books[i].coverHTML}</div>`;
    el.style.zIndex = String(1 + (i % 3));
    container.appendChild(el);
    pendulums.push({
      el, pin: { x: 0, y: 0 }, b: { x: 0, y: 0, px: 0, py: 0 },
      L: 80, bookW: 90, bookH: 135,
      phase: Math.random() * Math.PI * 2,
      hz: 0.5 + Math.random() * 0.7,   // idle 微风频率，各不相同（§6）
      amp: 0.6 + Math.random() * 0.8,
    });
  }

  function layout() {
    W = container.clientWidth; H = container.clientHeight;
    const gap = clamp(W / N, 46, 170);
    const startX = (W - gap * (N - 1)) / 2;
    const bookH = clamp(H * 0.24, 96, 148);
    const bookW = bookH * (2 / 3);
    pendulums.forEach((p, i) => {
      p.pin.x = startX + i * gap; p.pin.y = 2;
      // 参差绳长：长短交错 + 每绳微差，帘才有垂坠的节奏
      p.L = (i % 2 ? 92 : 26) + (i % 3) * 14;
      p.bookW = bookW; p.bookH = bookH;
      if (!p.init) {
        // 入场：摆到高位（弧上），揭幕后钟摆式荡入
        const th = (i % 2 ? -1 : 1) * (1.75 + Math.random() * 0.45);
        p.b.x = p.pin.x + Math.sin(th) * p.L;
        p.b.y = p.pin.y + Math.cos(th) * p.L;
        p.b.px = p.b.x; p.b.py = p.b.y;
        p.init = true;
      }
      p.el.style.width = bookW + 'px';
      p.el.style.height = bookH + 'px';
      p.el.style.setProperty('--rope', p.L + 'px');
    });
  }
  layout();
  window.addEventListener('resize', layout);

  let pointer = { x: -9999, y: -9999, vx: 0, vy: 0 };
  container.addEventListener('pointermove', (e) => {
    const r = container.getBoundingClientRect();
    pointer.vx = (e.clientX - r.left) - pointer.x;
    pointer.vy = (e.clientY - r.top) - pointer.y;
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
  });
  container.addEventListener('pointerleave', () => { pointer.x = -9999; pointer.y = -9999; });

  let t = 0;
  const stop = onFrame((dt) => {
    if (!W) return;
    const dts = Math.min(dt, 1 / 30);
    t += dts;

    for (const p of pendulums) {
      const b = p.b;
      // Verlet 积分：重力 + 各自相位的微风（idle breathing）
      const wind = Math.sin(t * p.hz + p.phase) * p.amp;
      const vx = (b.x - b.px) * 0.985, vy = (b.y - b.py) * 0.985;
      b.px = b.x; b.py = b.y;
      b.x += vx + wind * dts * 26;
      b.y += vy + 1400 * dts * dts * 0.5;

      // 指针推开：各向异性（横向为主），并带动一点指针速度
      const dx = b.x - pointer.x, dy = b.y - pointer.y;
      const R = p.bookH * 1.05;
      if (dx * dx + dy * dy < R * R) {
        const d = Math.hypot(dx, dy) || 1;
        const f = 1 - d / R;
        b.x += Math.sign(dx || 1) * f * f * 34 + pointer.vx * f * 0.42;
        b.y += f * f * 10 + pointer.vy * f * 0.18;
      }

      // 距离约束：投影回以钉点为圆心的弧（切向速度自动保留）
      let rdx = b.x - p.pin.x, rdy = b.y - p.pin.y;
      const d = Math.hypot(rdx, rdy) || 0.001;
      b.x = p.pin.x + (rdx / d) * p.L;
      b.y = p.pin.y + (rdy / d) * p.L;

      // 写 DOM：书顶中心挂在 b，绕书顶摆动
      const swing = Math.atan2(b.x - p.pin.x, b.y - p.pin.y);
      p.el.style.transform =
        `translate(${(b.x - p.bookW / 2).toFixed(1)}px, ${b.y.toFixed(1)}px) rotate(${(swing * 57.2958).toFixed(2)}deg)`;
    }
  });

  return { destroy() { stop(); window.removeEventListener('resize', layout); container.innerHTML = ''; } };
}

/* ============================================================
   飞行封面 —— 「一键入架」的仪式
   从封面起，经抛物线，弹簧落进书架按钮。
   ============================================================ */
export function flyToShelf(fromEl, toEl, imgSrc) {
  if (REDUCED) return Promise.resolve();
  const f = fromEl.getBoundingClientRect();
  const t = toEl.getBoundingClientRect();
  const w = 64, h = 96;
  const flyer = document.createElement('div');
  flyer.className = 'fly-cover';
  flyer.style.cssText += `left:${f.left + f.width / 2 - w / 2}px; top:${f.top + f.height / 2 - h / 2}px; width:${w}px; height:${h}px;`;
  flyer.innerHTML = imgSrc ? `<img src="${imgSrc}" alt="">` : '';
  document.body.appendChild(flyer);

  return new Promise((resolve) => {
    const sx = f.left + f.width / 2 - w / 2, sy = f.top + f.height / 2 - h / 2;
    const ex = t.left + t.width / 2 - w / 2, ey = t.top + t.height / 2 - h / 2;
    const arc = -Math.max(120, Math.abs(ex - sx) * 0.35); // 抛物线高度
    const dur = 0.72;
    let p = 0;
    const stop = onFrame((dt) => {
      p = Math.min(1, p + dt / dur);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      const x = sx + (ex - sx) * e;
      const y = sy + (ey - sy) * e + arc * 4 * e * (1 - e);
      const scale = 1 - 0.42 * e;
      const rot = (ex > sx ? 1 : -1) * 14 * e * (1 - e * 0.5);
      flyer.style.transform = `translate(0,0) scale(${scale}) rotate(${rot}deg)`;
      flyer.style.left = x + 'px'; flyer.style.top = y + 'px';
      flyer.style.opacity = String(1 - Math.max(0, p - 0.86) / 0.14);
      if (p >= 1) { flyer.remove(); stop(); resolve(); }
    });
  });
}

/* ---------- 跑马灯 v2：滚动速度感应 ----------
   基础漂移恒走；滚动速度注入（快滚加速、上滚倒转），
   整条轨道 skew 随速度倾斜（§2 速度耦合），悬停目标速归零。 */
export function makeVelocityMarquee(track, { base = 26, gain = 0.55 } = {}) {
  if (REDUCED) return { destroy() {} };
  let vel = 0;            // 平滑后的滚动速度 px/s
  let lastY = window.scrollY, lastT = performance.now();
  const onScroll = () => {
    const now = performance.now();
    const dt = Math.max(16, now - lastT);
    const v = ((window.scrollY - lastY) / dt) * 1000;
    vel = vel * 0.55 + v * 0.45;
    lastY = window.scrollY; lastT = now;
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  let x = 0, half = 0, hover = false, hoverEase = 1;
  const measure = () => { half = track.scrollWidth / 2; };
  measure();
  window.addEventListener('resize', measure);
  track.addEventListener('pointerenter', () => { hover = true; });
  track.addEventListener('pointerleave', () => { hover = false; });

  let sk = 0; // skew 平滑值
  const stop = onFrame((dt) => {
    vel *= Math.exp(-2.6 * dt); // 松手后速度衰减
    if (!half) return;
    hoverEase += ((hover ? 0 : 1) - hoverEase) * (1 - Math.exp(-8 * dt));
    const dir = vel < -60 ? -1 : 1; // 上滚倒转（带回滞）
    const speed = (base * dir + Math.abs(vel) * gain * dir) * hoverEase;
    x -= speed * dt;
    if (x <= -half) x += half;
    if (x > 0) x -= half;
    const skTarget = clamp(-vel * -0.0075, -8, 8);
    sk += (skTarget - sk) * (1 - Math.exp(-10 * dt));
    track.style.transform = `translateX(${x.toFixed(1)}px) skewX(${sk.toFixed(2)}deg)`;
  });
  return { destroy() { stop(); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', measure); } };
}

/* ---------- 数字滚动（书架角标等） ---------- */
export function bump(el) {
  el.classList.remove('bump');
  void el.offsetWidth; // 重启动画
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 380);
}
