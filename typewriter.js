// typewriter.js — a candlelit typewriter that types real lines from the infinite-monkey
// theorem's history, one key at a time (with the odd monkey-mistype), then moves on.
// Replaces the cheesy hero clip. Only runs on-screen; static first line for reduced-motion.
'use strict';
(function () {
  const text = document.getElementById('tw-text');
  const cite = document.getElementById('tw-cite');
  if (!text) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LINES = [
    { t: 'If an army of monkeys were strumming on typewriters, they might write all the books in the British Museum.', c: 'Arthur Eddington · 1928' },
    { t: 'A million monkeys, typing ten hours a day, would almost surely type every book in the richest libraries. Almost.', c: 'Émile Borel · 1913' },
    { t: 'Paignton Zoo, 2003: six macaques typed five pages — mostly the letter S — then beat the keyboard with a stone.', c: 'a real experiment' },
    { t: 'banana, on a 50-key typewriter: one chance in 15,625,000,000 per six keystrokes.', c: 'the arithmetic' },
    { t: "VALENTINE. Cease toIdor:eFLP0FRjWK78aXzVOwm)-';8.t", c: 'after 42,162,500,000 billion billion monkey-years · The New Yorker, 2004' },
    { t: 'Strictly speaking, one immortal monkey would suffice.', c: 'Jorge Luis Borges' },
  ];

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const GLYPH = 'abcdefghijklmnopqrstuvwxyz .,';
  let running = false, alive = true, i = 0;

  async function type(line) {
    text.textContent = '';
    for (let k = 0; k < line.length && alive; k++) {
      // occasional monkey mistake: a wrong key, a pause, a backspace
      if (line[k] !== ' ' && Math.random() < 0.06) {
        text.textContent += GLYPH[(Math.random() * GLYPH.length) | 0];
        await sleep(rnd(90, 170)); if (!alive) return;
        text.textContent = text.textContent.slice(0, -1);
        await sleep(rnd(60, 120));
      }
      text.textContent += line[k];
      await sleep(rnd(38, 95));
      while (!running && alive) await sleep(120);   // pause while off-screen
    }
  }
  async function erase() {
    while (text.textContent.length && alive) {
      text.textContent = text.textContent.slice(0, -1);
      await sleep(rnd(12, 28));
    }
  }
  async function loop() {
    while (alive) {
      const line = LINES[i % LINES.length];
      if (cite) cite.textContent = '';
      await type(line.t); if (!alive) return;
      if (cite) cite.textContent = '— ' + line.c;
      await sleep(2600); if (!alive) return;
      await erase();
      await sleep(500);
      i++;
    }
  }

  if (reduce) { text.textContent = LINES[0].t; if (cite) cite.textContent = '— ' + LINES[0].c; return; }

  const host = text.closest('.typewriter') || text;
  new IntersectionObserver((es) => { running = es[0].isIntersecting; }, { threshold: 0.2 }).observe(host);
  loop();
})();
