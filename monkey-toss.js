// monkey-toss.js — an ambient candlelit frieze: brass monkeys tossing "codes" to each
// other in lamplit arcs. Pure Canvas 2D, mobile-light, honors reduced-motion, and only
// animates while on-screen. Auto-inits on #toss-canvas. Matches the theater's palette.
'use strict';

const BRASS = '#c9a24a', BRASS_HI = '#e7c877', PARCH = '#efe3cc', EMBER = '#d6482f';
const CANDLE = '246,210,140';
const CODES = ['k7$Rq2!v', '$keepass$', '0xF3A9', 'hunter2', '••••••', '1A2b#9Z',
  'secp256k1', 'a3f9c1', 'bR@ss', 'SHA-256', 'pa$$w0rd', '████', 'R@nd0m!', '5eedphrase'];

function init(canvas) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, monkeys = [], tokens = [], t0 = 0, raf = 0, visible = true;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];

  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 3 monkeys on a phone, up to 5 on a wide desk — seated along the baseline
    const n = W < 560 ? 3 : W < 900 ? 4 : 5;
    const baseY = H - H * 0.16;
    monkeys = Array.from({ length: n }, (_, i) => ({
      x: W * (i + 1) / (n + 1),
      y: baseY,
      s: rnd(0.9, 1.15) * Math.min(1, H / 200),
      arm: 0,            // 0 rest … 1 raised (toss/catch)
      face: rnd(0, 6.28),
      flash: 0,
    }));
    tokens = [];
    if (reduce) { // one static frame: a couple of tokens frozen mid-arc
      for (let k = 0; k < 2 && monkeys.length > 1; k++) spawnToss(0.5);
      draw(0);
    }
  }

  function spawnToss(fixedT) {
    if (monkeys.length < 2) return;
    let a = (Math.random() * monkeys.length) | 0, b = a;
    while (b === a) b = (Math.random() * monkeys.length) | 0;
    const cracks = Math.random() < 0.25;
    tokens.push({
      from: a, to: b, t: fixedT ?? 0, speed: rnd(0.28, 0.5),
      arc: rnd(58, 104), text: pick(CODES), cracks, done: false,
      trail: [], spin: rnd(-0.5, 0.5),
    });
    monkeys[a].arm = 1;
  }

  // parabolic hand-to-hand position
  function tokenPos(tk) {
    const A = monkeys[tk.from], B = monkeys[tk.to];
    const hx = (m) => m.x, hy = (m) => m.y - 34 * m.s;   // "hands" above the lap
    const x = hx(A) + (hx(B) - hx(A)) * tk.t;
    const y = hy(A) + (hy(B) - hy(A)) * tk.t - Math.sin(tk.t * Math.PI) * tk.arc;
    return { x, y };
  }

  function drawMonkey(m) {
    const s = m.s, x = m.x, y = m.y;
    // candle glow behind
    const g = ctx.createRadialGradient(x, y - 40 * s, 4, x, y - 40 * s, 90 * s);
    g.addColorStop(0, `rgba(${CANDLE},${0.10 + m.flash * 0.25})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 95 * s, y - 130 * s, 190 * s, 170 * s);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineWidth = 2.2; ctx.strokeStyle = BRASS; ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(28,22,16,0.9)';
    // tail
    ctx.beginPath(); ctx.moveTo(-14, 6); ctx.quadraticCurveTo(-40, 14, -34, -18);
    ctx.quadraticCurveTo(-30, -30, -20, -24); ctx.stroke();
    // body
    ctx.beginPath(); ctx.moveTo(-18, 8); ctx.quadraticCurveTo(-22, -34, 0, -40);
    ctx.quadraticCurveTo(22, -34, 18, 8); ctx.quadraticCurveTo(0, 16, -18, 8);
    ctx.fill(); ctx.stroke();
    // arms — lift toward the toss
    const lift = m.arm;
    ctx.beginPath();
    ctx.moveTo(-14, -18);
    ctx.quadraticCurveTo(-26, -18 - 22 * lift, -12, -34 - 14 * lift);
    ctx.moveTo(14, -18);
    ctx.quadraticCurveTo(26, -18 - 22 * lift, 12, -34 - 14 * lift);
    ctx.stroke();
    // head
    ctx.beginPath(); ctx.arc(0, -52, 15, 0, 6.283); ctx.fill(); ctx.stroke();
    // ears
    ctx.beginPath(); ctx.arc(-14, -54, 5, 0, 6.283); ctx.arc(14, -54, 5, 0, 6.283); ctx.fill(); ctx.stroke();
    // face
    ctx.fillStyle = `rgba(${CANDLE},0.9)`;
    ctx.beginPath(); ctx.ellipse(0, -49, 8, 9, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#1b1610';
    ctx.beginPath(); ctx.arc(-4, -51, 1.4, 0, 6.283); ctx.arc(4, -51, 1.4, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  function drawToken(tk) {
    const p = tokenPos(tk);
    // ember trail
    for (let i = 0; i < tk.trail.length; i++) {
      const tr = tk.trail[i], a = (i / tk.trail.length) * 0.5;
      ctx.fillStyle = `rgba(${CANDLE},${a})`;
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 2.4 * a + 0.6, 0, 6.283); ctx.fill();
    }
    // the little parchment code-card
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(tk.t * 6 + tk.spin) * 0.18);
    ctx.font = '600 12px "Special Elite","Courier New",monospace';
    const w = ctx.measureText(tk.text).width + 14;
    ctx.shadowColor = `rgba(${CANDLE},0.6)`; ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(36,29,21,0.95)';
    ctx.strokeStyle = tk.cracks ? BRASS_HI : BRASS; ctx.lineWidth = 1;
    roundRect(-w / 2, -10, w, 20, 4); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = tk.cracks ? BRASS_HI : PARCH;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tk.text, 0, 1);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    // faint baseline (a library shelf/table edge)
    ctx.strokeStyle = 'rgba(201,162,74,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, monkeys[0]?.y + 12 || H); ctx.lineTo(W, monkeys[0]?.y + 12 || H); ctx.stroke();

    for (const tk of tokens) {
      if (!reduce) {
        tk.t += tk.speed * dt;
        const p = tokenPos(tk);
        tk.trail.push({ x: p.x, y: p.y }); if (tk.trail.length > 10) tk.trail.shift();
        if (tk.t >= 1) { // caught
          tk.done = true;
          const b = monkeys[tk.to]; if (b) { b.arm = 1; b.flash = 1; }
        }
      }
      drawToken(tk);
    }
    tokens = tokens.filter(tk => !tk.done);

    for (const m of monkeys) {
      if (!reduce) {
        m.arm += ((tokens.some(tk => tk.from === monkeys.indexOf(m)) ? 1 : 0) - m.arm) * Math.min(1, dt * 6);
        m.flash *= Math.max(0, 1 - dt * 3);
      }
      drawMonkey(m);
    }
  }

  let acc = 0;
  function loop(ts) {
    if (!visible) { raf = 0; return; }
    const dt = Math.min(0.05, (ts - t0) / 1000 || 0); t0 = ts;
    acc += dt;
    if (acc > rnd(0.9, 1.8) && tokens.length < monkeys.length) { spawnToss(); acc = 0; }
    draw(dt);
    raf = requestAnimationFrame(loop);
  }

  layout();
  addEventListener('resize', layout, { passive: true });
  if (reduce) return;   // static frame already drawn

  // only run while the frieze is on-screen (battery + perf on phones)
  new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    if (visible && !raf) { t0 = performance.now(); raf = requestAnimationFrame(loop); }
  }, { threshold: 0.01 }).observe(canvas);
}

function boot() {
  const c = document.getElementById('toss-canvas');
  if (c) init(c);
}
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
