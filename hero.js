// web/hero.js — the Library of Babel backdrop: columns of falling glyphs, like the
// library writing itself. Candlelit brass on espresso. Cheap canvas 2D (WebGL upgrade later).
export function startHero(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const GL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$@#%&*?!';
  let W, H, cols, drops, fs, dpr;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fs = Math.max(14, Math.round(W / 90));
    cols = Math.ceil(W / fs);
    drops = Array.from({ length: cols }, () => Math.random() * -H);
  }
  resize();
  addEventListener('resize', resize);

  function frame() {
    // fade toward espresso for trails
    ctx.fillStyle = 'rgba(20,16,11,0.14)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = `${fs}px "Special Elite", monospace`;
    for (let i = 0; i < cols; i++) {
      const x = i * fs, y = drops[i];
      const ch = GL[(Math.random() * GL.length) | 0];
      // leading glyph bright brass, trail dim
      ctx.fillStyle = 'rgba(231,200,119,0.85)';
      ctx.fillText(ch, x, y);
      ctx.fillStyle = 'rgba(201,162,74,0.10)';
      ctx.fillText(GL[(Math.random() * GL.length) | 0], x, y - fs);
      drops[i] += fs * (0.35 + Math.random() * 0.5);
      if (drops[i] > H && Math.random() > 0.975) drops[i] = Math.random() * -60;
    }
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  let raf;
  if (reduce) {
    // draw one static scatter
    ctx.fillStyle = 'rgba(20,16,11,1)'; ctx.fillRect(0, 0, W, H);
    ctx.font = `${fs}px "Special Elite", monospace`;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < H / fs; j += 3) {
        ctx.fillStyle = `rgba(201,162,74,${0.05 + Math.random() * 0.12})`;
        ctx.fillText(GL[(Math.random() * GL.length) | 0], i * fs, j * fs + (Math.random() * fs));
      }
  } else frame();
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
}
