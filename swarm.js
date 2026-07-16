// web/swarm.js — THE RECOVERY CONSOLE.
// A refined control-room instrument rendered on a single 2D canvas. No crowd of monkeys.
//
//   ┌──────────────────────────────────────────────────────────────────┐
//   │  THE RECOVERY CONSOLE                              ● live · engine │
//   │  ┌ TARGET MANUSCRIPT ────────────────────────────────────────┐    │
//   │  │  [h][u][n][t][e][r][2]   ← assembles letter-by-letter      │    │
//   │  └────────────────────────────────────────────────────────────┘   │
//   │  ┌ LIVE CANDIDATE STREAM ──────────┐  ┌ TELEMETRY ─────────────┐   │
//   │  │  › passw0rd                      │  │  4.2 h    ◜◝ 12.4%     │   │
//   │  │  › hunter1                       │  │  est.left ◟◞           │   │
//   │  │  › ▮ hunter2 ▌  (bright cursor)  │  │  8.10 GH/s             │   │
//   │  └──────────────────────────────────┘  ├ AGENT CHANNELS ───────┤   │
//   │                                        │ Capitalizers ▁▃▅▂ 42k │   │
//   │                                        │ Numerists    ▂▄▆▃ 26k │   │
//   │                                        └────────────────────────┘   │
//   └──────────────────────────────────────────────────────────────────┘
//
// The two things that matter are the loudest: (1) the LIVE stream of the REAL candidate
// keys the engine is testing right now (feedCandidates), a fast, legible, fading cascade;
// and (2) the TARGET manuscript assembling in brass, one satisfying lock-in at a time.
// Strategies are elegant labelled channels with a live sparkline + rate bar. A prominent
// telemetry panel reads measured guesses/sec, hashcat's exact ETA, radial + linear progress,
// and tried/total. Candlelight flicker, throughput-reactive cascade, choreographed bursts.
//
// Vanilla ES module. Canvas 2D only. No external libraries (runs in Electron, offline).

// candlelit antique palette
const C = {
  bg: '#1b1610', surface: '#241d15', surface2: '#2c241a', text: '#efe3cc',
  muted: '#a8977a', faint: '#6f6350', border: '#3d3123',
  brass: '#c9a24a', brassBright: '#e7c877', ember: '#d6482f', ink: '#14100b',
};

const GLYPHS = (() => { let s = ''; for (let i = 33; i <= 126; i++) s += String.fromCharCode(i); return s; })();
const rnd = n => Math.floor(Math.random() * n);
const rglyph = () => GLYPHS[rnd(GLYPHS.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const clamp01 = v => (v == null || isNaN(v)) ? 0 : (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- number formatting ----------
function fmtRate(r) {
  if (r == null || !isFinite(r) || r <= 0) return '—';
  if (r >= 1e12) return (r / 1e12).toFixed(2) + ' TH/s';
  if (r >= 1e9) return (r / 1e9).toFixed(2) + ' GH/s';
  if (r >= 1e6) return (r / 1e6).toFixed(2) + ' MH/s';
  if (r >= 1e3) return (r / 1e3).toFixed(1) + ' kH/s';
  return Math.round(r).toLocaleString() + ' H/s';
}
function fmtBig(n) {
  if (n == null || !isFinite(n)) return '—';
  if (n < 1000) return String(Math.round(n));
  const u = ['', 'k', 'M', 'B', 'T', 'Q', 'E']; let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return (n < 10 ? n.toFixed(1) : Math.round(n)) + u[i];
}
function fmtEta(s) {
  if (s == null || !isFinite(s)) return '—';
  if (s < 1) return '<1s';
  if (s < 90) return Math.round(s) + 's';
  if (s < 5400) return Math.round(s / 60) + 'm';
  if (s < 172800) return (s / 3600).toFixed(1) + 'h';
  if (s < 3.156e9) return (s / 86400).toFixed(1) + 'd';
  if (s < 3.156e11) return (s / 3.156e7).toFixed(1) + ' yr';
  return (s / 3.156e7).toExponential(1) + ' yr';
}
function fmtRateShort(r) {
  if (r == null || !isFinite(r) || r <= 0) return '—';
  if (r >= 1e12) return (r / 1e12).toFixed(1) + 'T';
  if (r >= 1e9) return (r / 1e9).toFixed(1) + 'G';
  if (r >= 1e6) return (r / 1e6).toFixed(1) + 'M';
  if (r >= 1e3) return (r / 1e3).toFixed(0) + 'k';
  return String(Math.round(r));
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  if (r < 0) r = 0;
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// =====================================================================================
//  READING ROOM  →  THE RECOVERY CONSOLE
// =====================================================================================
export class ReadingRoom {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

    this.agents = [];
    this.target = [];
    this.locked = [];
    this.lockAt = [];
    this.running = false;
    this._churning = false;
    this.t0 = 0;
    this.attempts = 0;

    this.onLock = () => {};
    this.onUpdate = () => {};
    this.onDone = () => {};

    // candidate stream
    this._queue = [];              // pending candidate strings
    this._stream = [];             // visible ring (oldest..newest)
    this._realFeed = false;        // true when fed real engine candidates
    this._emitAnim = 1;            // 0 just-emitted → 1 settled (smooth scroll)
    this._lastPump = 0;
    this._streamCount = 0;

    // telemetry / channels
    this._eta = null;
    this._ch = [];                 // per-agent runtime: { hist:[], flashUntil }
    this._lastSample = 0;

    // atmosphere / fx
    this._candles = [];
    this._motes = [];
    this._particles = [];
    this._flashUntil = 0;

    this._raf = 0;
    this._lastNow = performance.now();
    this._drawAt = 0;
    this._tickAt = 0;
    this._tick = 0;
    this._totalTicks = 1;

    this._resize();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(canvas);
    this._draw(performance.now());   // paint an idle frame immediately
  }

  // ------------------------------------------------------------------ required API
  setAgents(agents) {
    this.agents = (agents || []).map(a => ({ ...a, rate: 0, found: 0 }));
    this._ch = this.agents.map(() => ({ hist: [], flashUntil: 0 }));
    this._layout();
  }

  // SIM mode — assemble the target letter-by-letter over ~3.4s (a dramatization).
  start(target) {
    this.target = [...(target || '')];
    this.locked = this.target.map(() => false);
    this.lockAt = this.target.map(() => 0);
    this.running = true;
    this._churning = false;
    this._eta = null;
    this._realFeed = false;
    this.t0 = performance.now();
    this.attempts = 0;
    if (!this.agents.length) this.setAgents([{ id: 'a', name: 'Agent', strategy: '', color: C.brass, monkeys: 1000 }]);
    this._resetStream();
    this._totalTicks = this.reduce ? 1 : Math.max(16, Math.min(60, this.target.length * 4));
    this._tick = 0;
    this._tickAt = performance.now();
    this._layout();
    this._start();
  }

  // REAL-recovery mode — run continuously; nothing auto-locks.
  churn(agents) {
    this.setAgents(agents);
    this.target = [];
    this.locked = [];
    this.lockAt = [];
    this.running = false;
    this._churning = true;
    this._eta = null;
    this._realFeed = false;
    this.t0 = performance.now();
    this.attempts = 0;
    this._resetStream();
    this._layout();
    this._start();
  }

  stop() {
    this.running = false;
    this._churning = false;
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._draw(performance.now());
  }

  // arr = the REAL candidate strings the engine is testing right now.
  feedCandidates(arr) {
    if (!Array.isArray(arr) || !arr.length) return;
    this._realFeed = true;
    for (const s of arr) {
      if (s == null) continue;
      const str = String(s);
      if (str.length) this._queue.push(str);
    }
    // keep the queue fresh — freshest candidates matter most
    if (this._queue.length > 240) this._queue.splice(0, this._queue.length - 240);
  }

  // real measured guesses/sec, hashcat's exact ETA, progress 0..1, tried/total.
  setEta(o) {
    if (!o) return;
    this._eta = {
      rate: +o.rate || 0,
      etaSec: (o.etaSec == null ? null : +o.etaSec),
      progress: clamp01(o.progress),
      tried: (o.tried == null ? null : +o.tried),
      total: (o.total == null ? null : +o.total),
      at: performance.now(),
    };
  }

  // triumphant burst on a real crack (whole console) or on a specific channel.
  celebrate(agentIndex = null, n = 1) {
    const now = performance.now();
    if (agentIndex == null) {
      this._flashUntil = now + 1000;
      if (!this.reduce && this.L) this._burst(this.L.manuscript.cx, this.L.manuscript.cy, C.brassBright, 64);
    } else {
      const ch = this._ch[agentIndex];
      if (ch) ch.flashUntil = now + 720;
      if (!this.reduce && this.L && this.L.channels && this.L.channels.rows[agentIndex]) {
        const r = this.L.channels.rows[agentIndex];
        const col = (this.agents[agentIndex] && this.agents[agentIndex].color) || C.brass;
        this._burst(r.fx, r.fy, col, 6 + n * 2);
      }
    }
  }

  // ------------------------------------------------------------------ internals
  _start() {
    cancelAnimationFrame(this._raf);
    this._lastPump = performance.now();
    this._loop();
  }

  _resetStream() {
    this._queue = [];
    this._stream = [];
    this._emitAnim = 1;
    this._streamCount = 0;
  }

  _resize() {
    const r = this.cv.getBoundingClientRect();
    this.W = Math.max(320, r.width);
    this.H = Math.max(360, r.height);
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this._candles = [
      { x: this.W * 0.16, y: this.H * 0.10, r: this.W * 0.30, s: 0.0 },
      { x: this.W * 0.86, y: this.H * 0.16, r: this.W * 0.26, s: 1.7 },
      { x: this.W * 0.10, y: this.H * 0.86, r: this.W * 0.28, s: 3.1 },
      { x: this.W * 0.90, y: this.H * 0.90, r: this.W * 0.30, s: 4.6 },
    ];
    const vg = this.ctx.createRadialGradient(this.W / 2, this.H * 0.44, this.H * 0.12, this.W / 2, this.H * 0.55, this.H * 1.0);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.68, 'rgba(0,0,0,.16)');
    vg.addColorStop(1, 'rgba(0,0,0,.58)');
    this._vignette = vg;

    this._motes = Array.from({ length: 14 }, () => ({
      x: Math.random() * this.W, y: Math.random() * this.H,
      vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 6,
      r: 0.6 + Math.random() * 1.4, a: 0.05 + Math.random() * 0.10,
    }));

    this._layout();
    if (!this._raf) this._draw(performance.now());
  }

  // compute all panel geometry once per resize / mode change
  _layout() {
    const W = this.W, H = this.H;
    const pad = 16;
    const narrow = W < 720;
    const L = { pad, narrow };

    // header strip
    L.header = { x: pad, y: 12, w: W - pad * 2, h: 26 };

    // --- target manuscript ---
    const len = this.target.length;
    const budgetH = clamp(H * 0.185, 54, 104);
    const availW = W - pad * 2 - 24;
    let slot, gap = 8, n = len || 8;
    slot = Math.min(72, Math.floor((availW - gap * (n - 1)) / n), Math.floor(budgetH / 1.32));
    if (slot < 12) { gap = 4; slot = Math.min(72, Math.floor((availW - gap * (n - 1)) / n)); }
    slot = clamp(slot, 8, 72);
    const slotH = Math.min(slot * 1.32, budgetH);
    const totalW = n * slot + (n - 1) * gap;
    const mY = L.header.y + L.header.h + 12;
    const mRegionH = slotH + 22;                 // + caption
    const startX = (W - totalW) / 2;
    const slotY = mY + 18;
    const slotX = [];
    for (let i = 0; i < n; i++) slotX.push(startX + i * (slot + gap));
    L.manuscript = {
      x: pad, y: mY, w: W - pad * 2, h: mRegionH,
      slot, slotH, gap, n, startX, slotY, slotX,
      cx: W / 2, cy: slotY + slotH / 2, placeholder: len === 0,
    };

    // --- content region ---
    const contentTop = mY + mRegionH + 12;
    const contentBottom = H - pad;
    const gapX = 14, gapY = 12;

    if (narrow) {
      // stack: compact telemetry, then stream (channels omitted for space)
      const teleH = 92;
      L.telemetry = { x: pad, y: contentTop, w: W - pad * 2, h: teleH, compact: true };
      L.stream = { x: pad, y: contentTop + teleH + gapY, w: W - pad * 2, h: contentBottom - (contentTop + teleH + gapY) };
      L.channels = null;
    } else {
      const rightW = clamp(W * 0.4, 288, 430);
      const leftW = W - pad * 2 - rightW - gapX;
      L.stream = { x: pad, y: contentTop, w: leftW, h: contentBottom - contentTop };
      const rx = pad + leftW + gapX;
      const contentH = contentBottom - contentTop;
      const teleH = clamp(contentH * 0.46, 172, 236);
      L.telemetry = { x: rx, y: contentTop, w: rightW, h: teleH, compact: false };
      L.channels = { x: rx, y: contentTop + teleH + gapY, w: rightW, h: contentBottom - (contentTop + teleH + gapY), rows: [] };
    }

    // stream typography
    const sInner = L.stream.w - 32;
    L.stream.font = clamp(Math.round(L.stream.w / 26), 12, 19);
    L.stream.lineH = Math.round(L.stream.font * 1.5);
    L.stream.listTop = L.stream.y + 36;
    L.stream.listBottom = L.stream.y + L.stream.h - 12;
    L.stream.maxLines = Math.max(3, Math.floor((L.stream.listBottom - L.stream.listTop) / L.stream.lineH));
    L.stream.inner = sInner;

    // channel rows
    if (L.channels) {
      const nA = this.agents.length || 1;
      const areaTop = L.channels.y + 30;
      const areaH = L.channels.y + L.channels.h - areaTop - 6;
      const rowH = Math.min(66, Math.floor(areaH / nA));
      L.channels.rowH = rowH;
      L.channels.areaTop = areaTop;
      L.channels.compact = rowH < 46;
      L.channels.rows = this.agents.map((a, i) => {
        const y = areaTop + i * rowH;
        return { x: L.channels.x + 14, y, w: L.channels.w - 28, h: rowH, fx: L.channels.x + L.channels.w - 24, fy: y + rowH / 2 };
      });
    }

    this.L = L;
  }

  _activity() {
    let tot = 0;
    if (this._eta && this._eta.rate) tot = this._eta.rate;
    else tot = this.agents.reduce((s, a) => s + (a.rate || 0), 0);
    if (tot <= 0) return this._churning ? 0.5 : (this.running ? 0.55 : 0.28);
    return clamp((Math.log10(tot) + 1) / 12, 0.12, 1);
  }

  // synthesize a "converging" guess for the SIM dramatization
  _genSim(count) {
    const len = this.target.length || 8;
    for (let k = 0; k < count; k++) {
      const full = Math.random() < 0.14;
      let s = '';
      for (let i = 0; i < len; i++) s += (!full && this.locked[i]) ? this.target[i] : rglyph();
      this._queue.push(s);
    }
  }

  _pushLine(text) {
    this._stream.push(text);
    this._streamCount++;
    const cap = (this.L ? this.L.stream.maxLines : 12) + 3;
    if (this._stream.length > cap) this._stream.splice(0, this._stream.length - cap);
  }

  _pumpStream(now) {
    const dt = now - (this._lastPump || now);
    this._lastPump = now;

    // keep the SIM cascade alive only WHILE running (not forever after the target is solved)
    if (!this._realFeed && this.running && this._queue.length < 6) this._genSim(5);

    if (this.reduce) {
      // no smooth scroll: snap a couple of lines forward
      let budget = 2;
      while (budget-- > 0 && this._queue.length) this._pushLine(this._queue.shift());
      this._emitAnim = 1;
      return;
    }

    const act = this._activity();
    const interval = lerp(120, 32, act);          // ms per line — faster with throughput
    this._emitAnim += dt / Math.max(16, interval);
    let guard = 8;                                 // avoid huge catch-up bursts in one frame
    while (this._emitAnim >= 1 && this._queue.length && guard-- > 0) {
      this._emitAnim -= 1;
      this._pushLine(this._queue.shift());
    }
    if (this._emitAnim > 1) this._emitAnim = 1;     // queue drained → hold settled
  }

  _sampleRates(now) {
    if (now - this._lastSample < 110) return;
    this._lastSample = now;
    this.agents.forEach((a, i) => {
      const ch = this._ch[i]; if (!ch) return;
      ch.hist.push(a.rate || 0);
      if (ch.hist.length > 48) ch.hist.shift();
    });
  }

  // ---- SIM tick: progressively lock target letters ----
  _advance(now) {
    const remaining = this.locked.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
    const target = Math.ceil(this.target.length * (this._tick / this._totalTicks) * (0.5 + Math.random() * 0.7));
    let n = Math.max(0, Math.min(remaining.length, target - (this.target.length - remaining.length)));
    if (n === 0 && remaining.length && Math.random() < 0.6) n = 1;
    if (this.reduce) n = remaining.length;
    for (let k = 0; k < n; k++) {
      const pick = remaining.splice(rnd(remaining.length), 1)[0];
      this.locked[pick] = true;
      this.lockAt[pick] = now;
      const ai = rnd(this.agents.length);
      const a = this.agents[ai];
      if (a) a.found++;
      this.celebrate(ai, 1);
      if (this.L && this.L.manuscript.slotX[pick] != null && !this.reduce) {
        this._burst(this.L.manuscript.slotX[pick] + this.L.manuscript.slot / 2, this.L.manuscript.slotY + this.L.manuscript.slotH / 2, C.brassBright, 7);
      }
      this.onLock(pick, this.target[pick], a);
    }
    const per = this.target.length * 400 + 200;
    this.attempts += per + rnd(per);
    this.agents.forEach(a => { a.rate = Math.round((a.monkeys || 1000) * (140 + rnd(90))); });
    const found = this.locked.filter(Boolean).length;
    this.onUpdate({ attempts: this.attempts, found, total: this.target.length, elapsed: (now - this.t0) / 1000, agents: this.agents });
    if (found >= this.target.length) { this.running = false; this._flashUntil = now + 1100; this.onDone(); }
  }

  _loop() {
    const now = performance.now();
    this._lastNow = now;
    this._pumpStream(now);
    this._sampleRates(now);
    if (this.running && now - this._tickAt > (this.reduce ? 200 : Math.max(70, 3400 / this._totalTicks))) {
      this._tickAt = now; this._tick++; this._advance(now);
    }
    if (!this.reduce || now - this._drawAt > 420) { this._drawAt = now; this._draw(now); }
    // keep animating only while there's something live; once idle (sim solved + celebration
    // done, or stopped), paint one final frame and let the rAF loop end — no perpetual churn.
    if (this.running || this._churning || now < this._flashUntil) {
      this._raf = requestAnimationFrame(() => this._loop());
    } else {
      this._draw(now); this._raf = 0;
    }
  }

  _flicker(seed, now) {
    if (this.reduce) return 0.85;
    const t = now * 0.001;
    return 0.72 + 0.16 * Math.sin(t * 5.3 + seed) + 0.07 * Math.sin(t * 11.7 + seed * 2.1) + 0.05 * Math.sin(t * 23.1 + seed);
  }

  // ---- particles ----
  _burst(x, y, color, count) {
    if (this.reduce) return;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 190;
      this._particles.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40,
        life: 0, max: 0.5 + Math.random() * 0.8, r: 1 + Math.random() * 2, color,
      });
    }
    if (this._particles.length > 200) this._particles.splice(0, this._particles.length - 200);
  }

  // =================================================================== DRAW
  _draw(now) {
    const g = this.ctx, W = this.W, H = this.H, L = this.L;
    g.clearRect(0, 0, W, H);

    // background wash
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#20190f'); bg.addColorStop(0.5, '#191309'); bg.addColorStop(1, '#120c06');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    // candle glows
    g.globalCompositeOperation = 'lighter';
    for (const cd of this._candles) {
      const f = this._flicker(cd.s, now);
      const rg = g.createRadialGradient(cd.x, cd.y, 0, cd.x, cd.y, cd.r * (0.9 + f * 0.14));
      rg.addColorStop(0, `rgba(246,210,140,${0.10 * f})`);
      rg.addColorStop(0.4, `rgba(214,150,60,${0.04 * f})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(cd.x, cd.y, cd.r, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over';

    if (!L) { this._drawVignette(g, W, H); return; }

    this._drawHeader(g, L, now);
    this._drawManuscript(g, L, now);
    this._drawStream(g, L, now);
    this._drawTelemetry(g, L, now);
    if (L.channels) this._drawChannels(g, L, now);

    // particles
    if (this._particles.length && !this.reduce) this._drawParticles(g, now);

    // console-wide triumphant bloom
    if (now < this._flashUntil && !this.reduce) {
      const k = (this._flashUntil - now) / 1000;
      g.globalCompositeOperation = 'lighter';
      const bl = g.createRadialGradient(L.manuscript.cx, L.manuscript.cy, 0, L.manuscript.cx, L.manuscript.cy, W * 0.5);
      bl.addColorStop(0, `rgba(231,200,119,${0.16 * k})`);
      bl.addColorStop(1, 'rgba(231,200,119,0)');
      g.fillStyle = bl; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }

    // dust motes
    if (!this.reduce) {
      const dt = 1 / 60;
      g.fillStyle = 'rgba(246,210,140,1)';
      for (const p of this._motes) {
        p.x += p.vx * dt * 8; p.y += p.vy * dt * 8;
        if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; }
        if (p.x < -4) p.x = W + 4; else if (p.x > W + 4) p.x = -4;
        g.globalAlpha = p.a; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }

    this._drawVignette(g, W, H);
  }

  _drawVignette(g, W, H) {
    g.fillStyle = this._vignette; g.fillRect(0, 0, W, H);
  }

  // ---- header strip ----
  _drawHeader(g, L, now) {
    const h = L.header, glow = this._flicker(0, now);
    this._typewriterMark(g, h.x + 8, h.y + h.h / 2, 15);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = '400 17px "IM Fell English", Georgia, serif';
    g.fillStyle = `rgba(231,200,119,${0.82 + glow * 0.18})`;
    g.fillText('The Recovery Console', h.x + 30, h.y + h.h / 2 + 1);

    // mode / status (right)
    const live = !!this._eta;
    const mode = live ? 'LIVE · REAL ENGINE' : this.running ? 'REHEARSAL' : this._churning ? 'ENGAGING' : 'STANDBY';
    g.textAlign = 'right';
    g.font = '10px "Special Elite", monospace';
    g.fillStyle = C.muted;
    g.fillText(mode, h.x + h.w - 14, h.y + h.h / 2 + 1);
    const dotBlink = this.reduce ? 0.7 : (0.5 + 0.5 * Math.sin(now * 0.006));
    g.fillStyle = live ? `rgba(214,72,47,${dotBlink})` : `rgba(201,162,74,${0.4 + dotBlink * 0.3})`;
    g.beginPath(); g.arc(h.x + h.w - 6, h.y + h.h / 2, 3.2, 0, 7); g.fill();

    // hairline under header
    g.strokeStyle = 'rgba(201,162,74,.28)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(h.x, h.y + h.h + 3); g.lineTo(h.x + h.w, h.y + h.h + 3); g.stroke();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }

  _typewriterMark(g, cx, cy, s) {
    g.save();
    g.translate(cx, cy);
    g.strokeStyle = 'rgba(201,162,74,.7)'; g.lineWidth = 1.1; g.lineJoin = 'round';
    // body
    g.beginPath();
    g.moveTo(-s * 0.5, s * 0.36); g.lineTo(s * 0.5, s * 0.36);
    g.lineTo(s * 0.34, -s * 0.02); g.lineTo(-s * 0.34, -s * 0.02); g.closePath(); g.stroke();
    // platen + paper
    g.beginPath(); g.moveTo(-s * 0.26, -s * 0.02); g.lineTo(-s * 0.16, -s * 0.34);
    g.lineTo(s * 0.16, -s * 0.34); g.lineTo(s * 0.26, -s * 0.02); g.stroke();
    g.strokeStyle = 'rgba(231,200,119,.6)';
    g.beginPath(); g.moveTo(-s * 0.02, -s * 0.34); g.lineTo(-s * 0.02, -s * 0.5); g.stroke();
    // keys
    g.fillStyle = 'rgba(201,162,74,.6)';
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(i * s * 0.2, s * 0.2, s * 0.05, 0, 7); g.fill(); }
    g.restore();
  }

  // ---- target manuscript ----
  _drawManuscript(g, L, now) {
    const m = L.manuscript;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '10px "Special Elite", monospace';
    g.fillStyle = C.muted;
    g.fillText(m.placeholder ? 'TARGET MANUSCRIPT · sealed until recovered' : 'TARGET MANUSCRIPT', m.x + 2, m.y + 12);

    if (m.placeholder) {
      // decorative sealed slots
      const sh = m.slotH;
      for (let i = 0; i < m.n; i++) {
        const x = m.slotX[i];
        this._emptySlot(g, x, m.slotY, m.slot, sh, now, i, 0.5);
      }
      g.textAlign = 'center'; g.fillStyle = C.faint;
      g.font = 'italic 13px "EB Garamond", Georgia, serif';
      g.fillText('awaiting recovery', m.cx, m.slotY + sh + 12);
      g.textAlign = 'left';
      return;
    }

    for (let i = 0; i < m.n; i++) {
      const x = m.slotX[i], ch = this.target[i];
      if (this.locked[i]) this._lockedSlot(g, x, m.slotY, m.slot, m.slotH, ch, this.lockAt[i], now);
      else this._emptySlot(g, x, m.slotY, m.slot, m.slotH, now, i, 1);
    }
  }

  _emptySlot(g, x, y, w, h, now, seed, alpha) {
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, '#211a12'); grd.addColorStop(1, '#150f08');
    g.globalAlpha = alpha; g.fillStyle = grd;
    roundRect(g, x, y, w, h, 2); g.fill();
    g.strokeStyle = C.border; g.lineWidth = 1; roundRect(g, x, y, w, h, 2); g.stroke();
    // faint scrambling glyph (the search), stepped so it isn't jitter
    if (!this.reduce && w >= 16) {
      const step = Math.floor(now / 70) + seed * 7;
      const gl = GLYPHS[((step % GLYPHS.length) + GLYPHS.length) % GLYPHS.length];
      g.fillStyle = 'rgba(201,162,74,.16)';
      g.font = `${Math.round(h * 0.5)}px "Special Elite", monospace`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(gl, x + w / 2, y + h / 2 + 1);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    }
    g.globalAlpha = 1;
  }

  _lockedSlot(g, x, y, w, h, ch, lockAt, now) {
    const k = clamp01(1 - (now - lockAt) / 380);       // lock-in flash 1→0
    const cx = x + w / 2, cy = y + h / 2;
    g.save();
    if (k > 0 && !this.reduce) {
      const sc = 1 + k * 0.14;
      g.translate(cx, cy); g.scale(sc, sc); g.translate(-cx, -cy);
    }
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, C.brassBright); grd.addColorStop(1, C.brass);
    g.fillStyle = grd; roundRect(g, x, y, w, h, 2); g.fill();
    // letterpress top highlight + bottom shadow
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x + 1, y + 1, w - 2, Math.max(1, h * 0.08));
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x + 1, y + h - Math.max(2, h * 0.1), w - 2, Math.max(1, h * 0.08));
    g.strokeStyle = '#8a6d24'; g.lineWidth = 1; roundRect(g, x, y, w, h, 2); g.stroke();
    // the letter
    const disp = ch === ' ' ? '␣' : ch;
    g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(h * 0.5)}px "Special Elite", monospace`;
    g.fillText(disp, cx, cy + 1);
    g.restore();
    // flash bloom
    if (k > 0 && !this.reduce) {
      g.globalCompositeOperation = 'lighter';
      const bl = g.createRadialGradient(cx, cy, 0, cx, cy, w * (0.8 + k));
      bl.addColorStop(0, `rgba(231,200,119,${0.45 * k})`); bl.addColorStop(1, 'rgba(231,200,119,0)');
      g.fillStyle = bl; g.beginPath(); g.arc(cx, cy, w * (0.8 + k), 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }

  // ---- panel chrome ----
  _panel(g, r, title, accent) {
    g.fillStyle = 'rgba(32,25,17,.72)';
    roundRect(g, r.x, r.y, r.w, r.h, 3); g.fill();
    g.strokeStyle = C.border; g.lineWidth = 1; roundRect(g, r.x, r.y, r.w, r.h, 3); g.stroke();
    g.fillStyle = accent || C.brass; g.fillRect(r.x, r.y, r.w, 2);
    if (title) {
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = '10px "Special Elite", monospace'; g.fillStyle = C.muted;
      g.fillText(title, r.x + 14, r.y + 20);
    }
  }

  // ---- live candidate stream ----
  _drawStream(g, L, now) {
    const s = L.stream;
    this._panel(g, s, null, C.brass);

    // header with live activity ticks
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '10px "Special Elite", monospace'; g.fillStyle = C.muted;
    g.fillText('LIVE CANDIDATE STREAM', s.x + 14, s.y + 20);
    if (!this.reduce) {
      const beats = 3;
      for (let i = 0; i < beats; i++) {
        const a = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(now * 0.012 - i * 0.9));
        g.fillStyle = `rgba(201,162,74,${a})`;
        g.fillRect(s.x + s.w - 14 - i * 6, s.y + 14, 3, 6);
      }
    }
    // hairline under title
    g.strokeStyle = 'rgba(201,162,74,.16)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(s.x + 12, s.y + 28); g.lineTo(s.x + s.w - 12, s.y + 28); g.stroke();

    const lineH = s.lineH, font = s.font;
    const ix = s.x + 16, iw = s.inner;
    const bottomY = s.listBottom - 4;
    const rise = this.reduce ? 0 : (1 - this._emitAnim) * lineH;
    const nLines = this._stream.length;
    const maxLines = s.maxLines;

    g.save();
    g.beginPath();
    g.rect(s.x + 6, s.listTop - 2, s.w - 12, s.listBottom - s.listTop + 4);
    g.clip();
    g.font = `${font}px "Special Elite", monospace`;
    g.textBaseline = 'alphabetic';

    for (let i = 0; i <= maxLines + 1; i++) {
      const idx = nLines - 1 - i;
      if (idx < 0) break;
      const y = bottomY - i * lineH + rise;
      if (y < s.listTop - lineH || y > s.listBottom + lineH) continue;
      let a = clamp01(1 - i * (0.88 / maxLines));
      if (i === 0 && !this.reduce) a *= (0.35 + 0.65 * this._emitAnim);
      const text = this._stream[idx];
      // prompt
      g.textAlign = 'left';
      g.fillStyle = i === 0 ? `rgba(231,200,119,${a})` : `rgba(201,162,74,${a * 0.5})`;
      g.fillText('›', ix, y);
      // candidate
      const t = this._fit(g, text, iw - 18);
      if (i === 0) {
        g.font = `600 ${font}px "Special Elite", monospace`;
        g.fillStyle = `rgba(231,200,119,${a})`;
        g.fillText(t, ix + 14, y);
        // blinking cursor
        if (this.reduce || (Math.floor(now / 480) % 2 === 0)) {
          const tw = g.measureText(t).width;
          g.fillStyle = `rgba(231,200,119,${a})`;
          g.fillRect(ix + 16 + tw + 2, y - font + 2, font * 0.5, font);
        }
        g.font = `${font}px "Special Elite", monospace`;
      } else {
        g.fillStyle = `rgba(239,227,204,${a * 0.72})`;
        g.fillText(t, ix + 14, y);
      }
    }
    g.restore();

    // empty state
    if (nLines === 0) {
      g.textAlign = 'center'; g.fillStyle = C.faint;
      g.font = 'italic 13px "EB Garamond", Georgia, serif';
      g.fillText('awaiting the first candidates…', s.x + s.w / 2, s.y + s.h / 2);
      g.textAlign = 'left';
    }
  }

  // ---- telemetry ----
  _tele() {
    if (this._eta) return { rate: this._eta.rate, etaSec: this._eta.etaSec, progress: this._eta.progress, tried: this._eta.tried, total: this._eta.total, live: true };
    const rate = this.agents.reduce((s, a) => s + (a.rate || 0), 0);
    if (this.target.length) {
      const found = this.locked.filter(Boolean).length;
      return { rate, etaSec: null, progress: this.target.length ? found / this.target.length : 0, tried: this.attempts, total: null, live: false };
    }
    return { rate, etaSec: null, progress: 0, tried: this.attempts || null, total: null, live: false };
  }

  _drawTelemetry(g, L, now) {
    const t = L.telemetry, d = this._tele();
    this._panel(g, t, null, d.live ? C.ember : C.brass);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '10px "Special Elite", monospace'; g.fillStyle = C.muted;
    g.fillText('TELEMETRY', t.x + 14, t.y + 20);
    const blink = this.reduce ? 0.7 : (0.5 + 0.5 * Math.sin(now * 0.006));
    g.textAlign = 'right';
    g.fillStyle = d.live ? `rgba(214,72,47,${blink})` : C.faint;
    g.fillText(d.live ? 'measured' : 'dramatized', t.x + t.w - 22, t.y + 20);
    g.fillStyle = d.live ? `rgba(214,72,47,${blink})` : `rgba(201,162,74,${0.4})`;
    g.beginPath(); g.arc(t.x + t.w - 12, t.y + 16, 3, 0, 7); g.fill();
    g.textAlign = 'left';

    if (t.compact) {
      // narrow: single row — ETA · rate · progress bar
      g.font = '600 22px "Special Elite", monospace'; g.fillStyle = C.brassBright;
      g.fillText(fmtEta(d.etaSec), t.x + 14, t.y + 52);
      g.font = '9px "Special Elite", monospace'; g.fillStyle = C.faint;
      g.fillText('est. time left', t.x + 14, t.y + 64);
      g.textAlign = 'right';
      g.font = '600 16px "Special Elite", monospace'; g.fillStyle = C.brass;
      g.fillText(fmtRate(d.rate), t.x + t.w - 14, t.y + 40);
      g.font = '9px "Special Elite", monospace'; g.fillStyle = C.faint;
      g.fillText(`${(d.progress * 100).toFixed(d.progress < 0.01 ? 3 : 2)}%`, t.x + t.w - 14, t.y + 64);
      g.textAlign = 'left';
      this._progressBar(g, t.x + 14, t.y + t.h - 14, t.w - 28, 6, d.progress);
      return;
    }

    // big ETA
    g.font = '600 30px "Special Elite", monospace'; g.fillStyle = C.brassBright;
    g.fillText(fmtEta(d.etaSec), t.x + 16, t.y + 62);
    g.font = '9px "Special Elite", monospace'; g.fillStyle = C.faint;
    g.fillText('ESTIMATED TIME REMAINING', t.x + 16, t.y + 76);

    // guesses / sec
    g.font = '600 17px "Special Elite", monospace'; g.fillStyle = C.brass;
    g.fillText(fmtRate(d.rate), t.x + 16, t.y + 104);
    g.font = '9px "Special Elite", monospace'; g.fillStyle = C.faint;
    g.fillText('guesses / second', t.x + 16, t.y + 118);

    // radial progress (top-right of panel)
    const rr = clamp(Math.min(t.w * 0.16, t.h * 0.26), 30, 46);
    const rcx = t.x + t.w - rr - 22, rcy = t.y + 40 + rr;
    this._radial(g, rcx, rcy, rr, d.progress, now, d.live);

    // tried / total + keyspace bar (bottom)
    const by = t.y + t.h - 30;
    g.font = '10px "Special Elite", monospace';
    g.textAlign = 'left'; g.fillStyle = C.muted;
    if (d.tried != null) {
      const tt = d.total != null ? `${fmtBig(d.tried)} / ${fmtBig(d.total)}` : `${fmtBig(d.tried)} tried`;
      g.fillText(tt, t.x + 16, by);
    } else {
      g.fillText('keyspace', t.x + 16, by);
    }
    g.textAlign = 'right'; g.fillStyle = C.faint;
    g.fillText(`${(d.progress * 100).toFixed(d.progress < 0.01 ? 4 : 2)}%`, t.x + t.w - 16, by);
    g.textAlign = 'left';
    this._progressBar(g, t.x + 16, t.y + t.h - 16, t.w - 32, 6, d.progress);
  }

  _progressBar(g, x, y, w, h, p) {
    g.fillStyle = 'rgba(0,0,0,.5)'; roundRect(g, x, y, w, h, 3); g.fill();
    const bar = g.createLinearGradient(x, 0, x + w, 0);
    bar.addColorStop(0, C.brass); bar.addColorStop(1, C.brassBright);
    g.fillStyle = bar; roundRect(g, x, y, Math.max(2, w * clamp01(p)), h, 3); g.fill();
    g.strokeStyle = 'rgba(201,162,74,.3)'; g.lineWidth = 1; roundRect(g, x, y, w, h, 3); g.stroke();
  }

  _radial(g, cx, cy, r, p, now, live) {
    p = clamp01(p);
    g.lineCap = 'round';
    // track
    g.strokeStyle = 'rgba(201,162,74,.14)'; g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    // progress arc
    const a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 * Math.max(p, p > 0 ? 0.004 : 0);
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = live ? C.brassBright : C.brass; g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
    // leading spark
    if (!this.reduce && p > 0) {
      const lx = cx + Math.cos(a1) * r, ly = cy + Math.sin(a1) * r;
      const sp = g.createRadialGradient(lx, ly, 0, lx, ly, 6);
      sp.addColorStop(0, 'rgba(231,200,119,.9)'); sp.addColorStop(1, 'rgba(231,200,119,0)');
      g.fillStyle = sp; g.beginPath(); g.arc(lx, ly, 6, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // center %
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${Math.round(r * 0.42)}px "Special Elite", monospace`;
    g.fillStyle = C.text;
    const pct = p * 100;
    g.fillText(pct < 0.01 && pct > 0 ? '<0.1' : pct >= 10 ? pct.toFixed(0) + '%' : pct.toFixed(1) + '%', cx, cy - 1);
    g.font = '8px "Special Elite", monospace'; g.fillStyle = C.faint;
    g.fillText('keyspace', cx, cy + r * 0.5);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }

  // ---- agent / strategy channels ----
  _drawChannels(g, L, now) {
    const c = L.channels;
    this._panel(g, c, null, C.brass);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '10px "Special Elite", monospace'; g.fillStyle = C.muted;
    g.fillText('STRATEGY CHANNELS', c.x + 14, c.y + 20);
    g.textAlign = 'right'; g.fillStyle = C.faint;
    g.fillText(`${this.agents.length} lanes`, c.x + c.w - 14, c.y + 20);
    g.textAlign = 'left';
    g.strokeStyle = 'rgba(201,162,74,.16)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(c.x + 12, c.y + 28); g.lineTo(c.x + c.w - 12, c.y + 28); g.stroke();

    const maxRate = Math.max(1, ...this.agents.map(a => a.rate || 0));
    const rowH = c.rowH, compact = c.compact;

    this.agents.forEach((a, i) => {
      const row = c.rows[i]; if (!row) return;
      const ch = this._ch[i] || { hist: [], flashUntil: 0 };
      const rx = row.x, ry = row.y, rw = row.w;
      const flash = clamp01((ch.flashUntil - now) / 720);
      const leader = (a.rate || 0) >= maxRate && maxRate > 1;

      // flash glow behind the row
      if (flash > 0 && !this.reduce) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = this._rgba(a.color || C.brass, 0.14 * flash);
        roundRect(g, rx - 6, ry + 2, rw + 12, rowH - 4, 3); g.fill();
        g.globalCompositeOperation = 'source-over';
      }

      // color chip
      g.fillStyle = a.color || C.brass;
      g.fillRect(rx, ry + rowH / 2 - 7, 3, 14);

      // name + rate
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = '600 12px "Special Elite", monospace';
      g.fillStyle = leader ? C.brassBright : C.text;
      const nameMax = compact ? rw * 0.42 : rw * 0.5;
      g.fillText(this._fit(g, a.name, nameMax), rx + 10, ry + (compact ? rowH / 2 + 4 : 15));
      g.textAlign = 'right';
      g.font = '600 12px "Special Elite", monospace'; g.fillStyle = C.brassBright;
      g.fillText(`${fmtRateShort(a.rate || 0)}/s`, rx + rw, ry + (compact ? rowH / 2 + 4 : 15));

      if (!compact) {
        // strategy line
        g.textAlign = 'left';
        g.font = '9px "Special Elite", monospace'; g.fillStyle = C.faint;
        g.fillText(this._fit(g, a.strategy || '', rw * 0.55), rx + 10, ry + 27);
        // workers
        g.textAlign = 'right'; g.fillStyle = C.muted;
        g.font = '9px "Special Elite", monospace';
        g.fillText(`${fmtBig(a.monkeys || 0)} workers`, rx + rw, ry + 27);
        g.textAlign = 'left';
        // sparkline (left) + rate bar (below)
        const sparkW = rw * 0.52, sparkX = rx + 10, sparkY = ry + 32, sparkH = rowH - 40;
        this._sparkline(g, sparkX, sparkY, sparkW, Math.max(8, sparkH), ch.hist, a.color || C.brass, flash);
        const barX = rx + rw * 0.58, barW = rw * 0.42;
        this._rateBar(g, barX, ry + rowH - 12, barW, 5, (a.rate || 0) / maxRate, a.color || C.brass, flash);
      } else {
        // compact: just a rate bar spanning under the name
        this._rateBar(g, rx + 10, ry + rowH - 8, rw - 20, 4, (a.rate || 0) / maxRate, a.color || C.brass, flash);
      }
    });
  }

  _sparkline(g, x, y, w, h, hist, color, flash) {
    if (!hist || hist.length < 2) {
      g.strokeStyle = 'rgba(201,162,74,.14)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w, y + h); g.stroke();
      return;
    }
    const n = hist.length, max = Math.max(1, ...hist);
    const dx = w / (n - 1);
    g.save();
    // faint area
    g.beginPath();
    g.moveTo(x, y + h);
    for (let i = 0; i < n; i++) g.lineTo(x + i * dx, y + h - (hist[i] / max) * h);
    g.lineTo(x + w, y + h); g.closePath();
    g.fillStyle = this._rgba(color, 0.08 + flash * 0.06); g.fill();
    // line
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x + i * dx, py = y + h - (hist[i] / max) * h;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokeStyle = this._rgba(color, 0.7 + flash * 0.3); g.lineWidth = 1.3; g.lineJoin = 'round';
    g.stroke();
    // head dot
    const hx = x + w, hy = y + h - (hist[n - 1] / max) * h;
    g.fillStyle = C.brassBright; g.beginPath(); g.arc(hx, hy, 1.6, 0, 7); g.fill();
    g.restore();
  }

  _rateBar(g, x, y, w, h, frac, color, flash) {
    frac = clamp01(frac);
    g.fillStyle = 'rgba(0,0,0,.45)'; roundRect(g, x, y, w, h, 2); g.fill();
    const grd = g.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, this._rgba(color, 0.55)); grd.addColorStop(1, this._rgba(color, 0.95 + flash * 0.05));
    g.fillStyle = grd; roundRect(g, x, y, Math.max(2, w * frac), h, 2); g.fill();
  }

  _drawParticles(g, now) {
    const dt = Math.min(0.05, (now - (this._pLast || now)) / 1000);
    this._pLast = now;
    g.globalCompositeOperation = 'lighter';
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.life += dt;
      if (p.life >= p.max) { this._particles.splice(i, 1); continue; }
      p.vy += 60 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.life / p.max;
      g.fillStyle = this._rgba(p.color, a);
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ---- utils ----
  _rgba(hex, a) {
    let h = (hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    let r = parseInt(h.slice(0, 2), 16), gg = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    if (isNaN(r)) r = 201; if (isNaN(gg)) gg = 162; if (isNaN(b)) b = 74;   // NaN-guard, not || (a 0 channel is valid)
    return `rgba(${r},${gg},${b},${a})`;
  }

  _fit(g, str, maxW) {
    str = String(str == null ? '' : str);
    if (g.measureText(str).width <= maxW) return str;
    let s = str;
    while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
}
