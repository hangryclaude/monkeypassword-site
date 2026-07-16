// web/app.js — wires the console -> crack-math + zxcvbn -> the Reading Room swarm -> the ledger.
import { report, fmtPow, fmtDollars, humanTime, secondsLog10 } from './core/crack-math.js';
import { babelCoords, shelfBooks } from './core/babel.js';
import { ReadingRoom } from './swarm.js';
import { startHero } from './hero.js';
import { initRecovery } from './recovery.js';

const $ = s => document.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

// ---- the specialist agents; each commands a battalion of monkeys ----
const AGENT_DEFS = [
  { id:'caps',  name:'The Capitalizers',  strategy:'every casing of every letter',      color:'#d8b45f', base: 420_000 },
  { id:'nums',  name:'The Numerists',     strategy:'digits, years & dates, fore & aft',  color:'#c9a24a', base: 260_000 },
  { id:'leet',  name:'The Leet Scribes',  strategy:'a→@ · e→3 · o→0 · s→$ · i→1',         color:'#cf9b52', base: 180_000 },
  { id:'lex',   name:'The Lexicographers',strategy:'the great dictionary & its kin',      color:'#b98d3c', base: 900_000 },
  { id:'walk',  name:'The Keywalkers',    strategy:'qwerty paths & finger-runs',          color:'#c98f3e', base:  90_000 },
  { id:'babel', name:'The Babelians',     strategy:'pure chance — every glyph, forever',  color:'#d6482f', base: 3_500_000 },
];
function assignMonkeys(pw) {
  const len = pw.length || 1;
  return AGENT_DEFS.map((a, i) => ({
    ...a,
    monkeys: Math.max(9000, Math.round(a.base * (0.7 + len * 0.34) * (0.85 + ((cyr(pw, i) % 40) / 100)))),
  }));
}
function cyr(s, seed) { let h = 0x811c9dc5 ^ seed; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

// ---- zxcvbn (realistic guess estimate); degrade gracefully if it can't load ----
let zxcvbnReady = loadZxcvbn();
function loadZxcvbn() {
  return new Promise(res => {
    if (window.zxcvbn) return res(window.zxcvbn);
    // local vendored copy first (offline / desktop), then CDN fallback (browser)
    const tryLoad = (src, next) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res(window.zxcvbn);
      s.onerror = next;
      document.head.appendChild(s);
    };
    tryLoad('../vendor/zxcvbn.js', () =>
      tryLoad('https://cdnjs.cloudflare.com/ajax/libs/zxcvbn/4.4.2/zxcvbn.js', () => res(null)));
  });
}

// ---- typewriter clack (WebAudio, user-gesture only) ----
let audioOn = true, actx = null;
function clack() {
  if (!audioOn || reduce) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(170 + Math.random() * 130, t);
    g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0006, t + 0.06);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.07);
  } catch (e) {}
}
$('#mute').addEventListener('click', e => { audioOn = !audioOn; e.target.textContent = '♪ typewriter clacks: ' + (audioOn ? 'on' : 'off'); });

// ---- the Reading Room ----
const room = new ReadingRoom($('#room-canvas'));
let slotNodes = [];

room.onLock = (i) => {
  const s = slotNodes[i];
  if (s) { s.textContent = room.target[i] === ' ' ? '␣' : room.target[i]; s.classList.add('locked'); }
  clack();
};
room.onUpdate = ({ attempts, found, total, elapsed }) => {
  $('#cAttempts').textContent = Math.round(attempts).toLocaleString();
  $('#cLocked').textContent = `${found} / ${total}`;
  $('#cTime').textContent = elapsed.toFixed(1) + 's';
};
room.onDone = () => finish();

let currentPw = '', currentReport = null;

async function launch() {
  const pw = $('#pw').value;
  if (!pw) { const c = $('#console'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); $('#pw').focus(); return; }
  currentPw = pw;
  $('#go').disabled = true; $('#go').textContent = 'cracking…';
  if (audioOn) { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume && actx.resume(); } catch (e) {} }

  // build target slots
  const slots = $('#slots'); slots.innerHTML = '';
  [...pw].forEach(() => { const d = document.createElement('div'); d.className = 'slot'; d.textContent = '·'; slots.appendChild(d); });
  slotNodes = [...slots.children];
  $('#stamp').classList.remove('show');

  // agents + monkeys
  const agents = assignMonkeys(pw);
  room.setAgents(agents);
  $('#cMonkeys').textContent = agents.reduce((s, a) => s + a.monkeys, 0).toLocaleString();

  // compute the honest report (with zxcvbn if available)
  const zx = await zxcvbnReady;
  const guesses = zx ? zx(pw).guesses : null;
  currentReport = report(pw, guesses);

  $('#theater').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  room.start(pw);
}

function finish() {
  $('#go').disabled = false; $('#go').textContent = 'Unleash the monkeys';
  $('#stamp').classList.add('show');
  const r = currentReport;

  // ledger
  $('#verdict').classList.remove('hidden');
  $('#library').classList.remove('hidden');
  $('#fNaive').textContent = fmtPow(r.naiveLog10);
  $('#fReal').textContent = fmtPow(r.realLog10) + ' guesses';
  $('#fBits').textContent = r.len ? Math.round(r.bits) + ' bits' : '0';
  $('#fLen').textContent = `${r.len} · pool of ${r.pool}`;
  $('#fDollars').textContent = fmtDollars(r.dollars);
  $('#fMonkeys').textContent = r.len ? fmtPow(r.realLog10 - Math.log10(2)) : '0';

  const grade = $('#grade');
  grade.firstChild.textContent = r.verdict.grade;
  $('#gradeSub').textContent = 'against one RTX 4090';
  $('#gradeNote').innerHTML = r.verdict.note + ' <b>Either way it is crackable — the only question the monkeys ask is <i>how long</i>.</b>';

  fillTable('#ttBody', r.tiers);
  fillTable('#wtBody', r.walletTiers);
  if (window.cracker && window.cracker.benchmark) setupBenchmark();

  // library of babel
  const c = babelCoords(currentPw);
  $('#cHex').textContent = c.hex;
  $('#cShelf').textContent = `Wall ${c.wall} · Shelf ${c.shelf}`;
  $('#cVol').textContent = `№ ${c.vol}`;
  $('#cPage').textContent = `p. ${c.page} · line ${c.line}`;
  const shelf = $('#shelf'); shelf.innerHTML = '';
  shelfBooks(currentPw).forEach(b => {
    const el = document.createElement('div'); el.className = 'book';
    el.style.background = b.bg; el.style.width = b.w + 'px'; el.style.height = b.h + '%';
    shelf.appendChild(el);
  });
}

function fmtRate(r) {
  if (r >= 1e9) return (r / 1e9).toFixed(2) + ' GH/s';
  if (r >= 1e6) return (r / 1e6).toFixed(2) + ' MH/s';
  if (r >= 1e3) return (r / 1e3).toFixed(2) + ' kH/s';
  return Math.round(r) + ' H/s';
}
// desktop only: measure THIS Mac's real GPU speed and show the exact time to crack this secret
function setupBenchmark() {
  let box = document.getElementById('benchmark-box');
  if (!box) {
    box = document.createElement('div'); box.id = 'benchmark-box'; box.style.marginTop = '20px';
    const btn = document.createElement('button'); btn.className = 'btn-ghost'; btn.id = 'bench-btn';
    btn.textContent = '⏱ Benchmark THIS Mac — measure the exact time';
    const out = document.createElement('div'); out.id = 'bench-out'; out.className = 'found-line'; out.style.marginTop = '10px';
    box.append(btn, out);
    $('#verdict').appendChild(box);
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'benchmarking your GPU…'; out.textContent = '';
      try {
        const { rate } = await window.cracker.benchmark(0);   // MD5 = fast-hash reference on this GPU
        if (!rate) throw new Error('no speed returned');
        const log10sec = secondsLog10(currentReport.realLog10, rate);
        out.className = 'found-line';
        out.innerHTML = `Your GPU measured <b>${fmtRate(rate)}</b> (MD5). Exact time for a fast-hash attacker on <b>this</b> Mac to crack <b>${currentPw}</b>: <b>${humanTime(log10sec)}</b>.`;
      } catch (e) { out.className = 'found-line no'; out.textContent = 'benchmark failed: ' + e.message; }
      btn.disabled = false; btn.textContent = '⏱ Re-benchmark THIS Mac';
    };
  }
}

function fillTable(sel, rows) {
  const body = $(sel); body.innerHTML = '';
  rows.forEach(t => {
    const tr = document.createElement('tr');
    if (t.timeLog10 < 0.4) tr.className = 'instant';
    tr.innerHTML = `<th>${t.who}</th><td class="rate">${t.rate.toLocaleString('en-US')}</td><td class="time">${t.time}</td>`;
    body.appendChild(tr);
  });
}

// ---- controls ----
const SAMPLES = ['hunter2', 'Tr0ub4dor&3', 'correcthorsebatterystaple', 'P@ssw0rd!', 'summer2024', 'satoshi'];
$('#go').addEventListener('click', launch);
$('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') launch(); });
$('#try').addEventListener('click', () => { $('#pw').value = SAMPLES[Math.floor(Math.random() * SAMPLES.length)]; launch(); });
$('#again').addEventListener('click', e => { e.preventDefault(); $('#pw').select(); $('#pw').focus(); document.querySelector('.hero').scrollIntoView({ behavior: 'smooth' }); });

// ---- hero backdrop ----
startHero($('#hero-canvas'));
$('#pw').focus();

// ---- desktop recovery bench: drive the SAME theater from real cracker events ----
const labels = [...document.querySelectorAll('.counters .counter .k')];
function setLabels(arr) { arr.forEach((t, i) => { if (labels[i]) labels[i].textContent = t; }); }

export const theater = {
  reset() { $('#stamp').classList.remove('show'); $('#stamp').textContent = 'Cracked'; $('#slots').innerHTML = ''; slotNodes = []; },
  setSlots(n) {
    const s = $('#slots'); s.innerHTML = '';
    for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'slot'; d.textContent = '·'; s.appendChild(d); }
    slotNodes = [...s.children];
  },
  churn(agents) {
    this.reset();
    $('#theater').classList.remove('hidden');
    setLabels(['Candidates tried', 'Guesses / sec (real)', 'Keyspace searched', 'Est. time left']);
    $('#cAttempts').textContent = '0'; $('#cMonkeys').textContent = '0'; $('#cLocked').textContent = '—'; $('#cTime').textContent = '—';
    room.churn(agents);
    $('#theater').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  },
  // rescale the visual battalions to the engine's real guess-rate
  rate(totalRate) {
    if (!room.agents.length) return;
    const per = Math.max(1200, Math.round(totalRate / room.agents.length));
    room.agents.forEach((a, i) => { a.monkeys = per + (i * 137 % 400); a.rate = Math.round(totalRate / room.agents.length); });
    $('#cMonkeys').textContent = Math.round(totalRate).toLocaleString();
  },
  counters({ tried, progress, etaSec }) {
    if (tried != null) $('#cAttempts').textContent = Math.round(tried).toLocaleString();
    if (progress != null) $('#cLocked').textContent = (progress * 100).toFixed(progress < 0.01 ? 4 : 2) + '%';
    if (etaSec != null) $('#cTime').textContent = humanShort(etaSec);
  },
  // REAL candidate strings the engine is testing right now -> onto the monkeys' papers
  feed(arr) { room.feedCandidates(arr); },
  // real telemetry -> the in-hall HUD (measured rate, hashcat's exact ETA, progress)
  eta(o) {
    const total = o.total || (o.progress > 0 ? Math.round(o.tried / o.progress) : null);
    room.setEta({ rate: o.rate, etaSec: o.etaSec, progress: o.progress, tried: o.tried, total });
  },
  reveal(text) {
    room.celebrate();               // the whole hall erupts on a real recovery
    this.setSlots(text.length);
    [...text].forEach((ch, i) => setTimeout(() => {
      const s = slotNodes[i]; if (!s) return;
      s.textContent = ch === ' ' ? '␣' : ch; s.classList.add('locked'); clack();
    }, reduce ? 0 : i * 90));
    setTimeout(() => { const st = $('#stamp'); st.textContent = 'Recovered'; st.classList.add('show'); }, reduce ? 0 : text.length * 90 + 150);
    setTimeout(() => room.stop(), reduce ? 0 : text.length * 90 + 1800);   // let the eureka play before freezing
  },
  notFound() { const st = $('#stamp'); st.textContent = 'Exhausted'; st.classList.add('show'); room.stop(); },
};
function humanShort(s) {
  if (s == null) return '—';
  if (s < 90) return Math.round(s) + 's';
  if (s < 5400) return Math.round(s / 60) + 'm';
  if (s < 172800) return (s / 3600).toFixed(1) + 'h';
  if (s < 3.15e9) return (s / 86400).toFixed(1) + 'd';
  return (s / 3.156e7).toExponential(1) + ' yr';
}

// wire up the bench (no-op in a plain browser without window.cracker)
initRecovery(theater);
