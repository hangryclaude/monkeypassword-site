// web/recovery.js — the Recovery Bench (desktop only). Launches the real crackers via
// window.cracker (preload IPC) and drives the monkey theater with genuine rate/progress.
// Wallet files run through btcrecover's own parsers; raw hashes run on hashcat (GPU).
// Recover your OWN wallets & passwords, locally, at $0.

const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v; else n.setAttribute(k, v);
  }
  (Array.isArray(kids) ? kids : [kids]).forEach(c => c && n.append(c));
  return n;
};

const MODES = {
  demo: {
    label: '▶  Demo — recover a sample lost wallet.dat', engine: 'btcrecover', demo: true,
    hint: 'A real encrypted Bitcoin Core wallet.dat ships inside this app. Watch btcrecover find its password amongst a list of decoys, live on every CPU core — no setup.',
  },
  walletdat: {
    label: 'Bitcoin Core wallet.dat', engine: 'btcrecover', file: true,
    hint: 'Your wallet.dat. btcrecover reads it directly and tries your candidate passwords across every CPU core.',
  },
  ethereum: {
    label: 'Ethereum keystore (geth / MyEtherWallet / MetaMask)', engine: 'btcrecover', file: true,
    hint: 'A UTC/JSON keystore file. btcrecover decrypts it with your candidate passwords across every CPU core. (Verified path.)',
  },
  wallet_auto: {
    label: 'Any wallet file — auto-detect', engine: 'btcrecover', file: true,
    hint: 'Drop in almost any wallet: Electrum, blockchain.info, MultiBit, MetaMask, Exodus, Ethereum keystore, Coinomi, Dogecoin/Litecoin Core… btcrecover identifies the format itself.',
  },
  lockedfile: {
    label: 'Any locked file or vault — ZIP · RAR · 7z · PDF · Office · SSH · GPG · DMG · KeePass · 1Password · LastPass', engine: 'johnfile', file: true,
    hint: 'Load any password-protected file — or a KeePass .kdbx, a 1Password .opvault/.agilekeychain folder, or your LastPass data folder. It pulls the hash, auto-detects the format, and tries your candidates across every core.',
  },
  generic: {
    label: 'Any password hash (paste it) · hashcat GPU', engine: 'hashcat', hashLine: true,
    hint: 'Paste a raw hash. The GPU runs the wordlist (with mutations) or a brute-force mask — optimized kernels, max workload.',
    modeChoices: [
      { v: 0, t: 'MD5' }, { v: 100, t: 'SHA-1' }, { v: 1400, t: 'SHA-256' },
      { v: 1700, t: 'SHA-512' }, { v: 1000, t: 'NTLM' }, { v: 3200, t: 'bcrypt' }, { v: 1800, t: 'sha512crypt' },
      { v: 1600, t: 'md5apr1 (Apache)' }, { v: 400, t: 'phpass (WordPress/phpBB)' },
      { v: 111, t: 'LDAP SSHA' }, { v: 101, t: 'LDAP SHA' }, { v: 10000, t: 'Django PBKDF2' }, { v: 124, t: 'Django SHA1' },
    ],
  },
  seed: {
    label: 'BIP39 seed phrase (missing / wrong word / passphrase)', engine: 'btcrecover', script: 'seedrecover', seed: true,
    hint: 'Recover a mistyped/missing word — and/or a forgotten passphrase (25th word) — using the seed checksum + a receive address it generated.',
  },
  brainwallet: {
    label: 'Brainwallet (passphrase → address)', engine: 'btcrecover', brainwallet: true, addr: true,
    hint: 'A brainwallet address is generated from a passphrase (SHA-256). Give the address plus a list of phrases you might have used.',
  },
  rawkey: {
    label: 'Raw private key (partial WIF)', engine: 'btcrecover', rawkey: true,
    hint: 'You have most of a WIF private key. Paste the address plus candidate keys (one per line) — btcrecover checks each against the address.',
  },
  advanced: {
    label: 'Advanced · btcrecover (BIP38, brainwallet, raw args)', engine: 'btcrecover', advanced: true,
    hint: 'Pass btcrecover arguments directly — tokenlists, typos, wildcards, the full toolbox.',
  },
};

const REAL_AGENTS = [
  { id: 'l1', name: 'Metal Legion I', strategy: 'GPU shard · candidates', color: '#d8b45f', monkeys: 6000 },
  { id: 'l2', name: 'Metal Legion II', strategy: 'GPU shard · candidates', color: '#c9a24a', monkeys: 6000 },
  { id: 'l3', name: 'Metal Legion III', strategy: 'GPU shard · candidates', color: '#cf9b52', monkeys: 6000 },
  { id: 'l4', name: 'Metal Legion IV', strategy: 'GPU shard · candidates', color: '#b98d3c', monkeys: 6000 },
  { id: 'l5', name: 'Metal Legion V', strategy: 'GPU shard · candidates', color: '#c98f3e', monkeys: 6000 },
  { id: 'l6', name: 'The Overseer', strategy: 'verifies each hit', color: '#d6482f', monkeys: 4000 },
];

// hashcat mode guessed from a pasted hash's shape
function identifyHash(h) {
  h = (h || '').trim();
  if (/^\$apr1\$/.test(h)) return { m: 1600, t: 'md5apr1 (Apache)' };
  if (/^\{SSHA\}/i.test(h)) return { m: 111, t: 'LDAP SSHA' };
  if (/^\{SHA\}/i.test(h)) return { m: 101, t: 'LDAP SHA' };
  if (/^\$P\$|^\$H\$/.test(h)) return { m: 400, t: 'phpass (WordPress/phpBB)' };
  if (/^pbkdf2_sha256\$/.test(h)) return { m: 10000, t: 'Django PBKDF2-SHA256' };
  if (/^sha1\$/.test(h)) return { m: 124, t: 'Django SHA1' };
  if (/^\$2[aby]\$/.test(h)) return { m: 3200, t: 'bcrypt' };
  if (/^\$6\$/.test(h)) return { m: 1800, t: 'sha512crypt' };
  if (/^\$5\$/.test(h)) return { m: 7400, t: 'sha256crypt' };
  if (/^\$1\$/.test(h)) return { m: 500, t: 'md5crypt' };
  if (/^[0-9a-f]{32}$/i.test(h)) return { m: 0, t: 'MD5 (or NTLM)' };
  if (/^[0-9a-f]{40}$/i.test(h)) return { m: 100, t: 'SHA-1' };
  if (/^[0-9a-f]{64}$/i.test(h)) return { m: 1400, t: 'SHA-256' };
  if (/^[0-9a-f]{128}$/i.test(h)) return { m: 1700, t: 'SHA-512' };
  return null;
}
const MASK_PRESETS = [
  { v: '', t: 'Custom…' },
  { v: '?d?d?d?d', t: '4-digit PIN' },
  { v: '?d?d?d?d?d?d', t: '6-digit PIN' },
  { v: '?d?d?d?d?d?d?d?d', t: '8 digits / date' },
  { v: '?d?d?d?d?d?d?d?d?d?d', t: '10-digit phone' },
  { v: '?l?l?l?l?l?l', t: '6 lowercase letters' },
  { v: '?u?l?l?l?l?l', t: 'Capitalized 6-letter word' },
  { v: '?u?l?l?l?l?l?d?d', t: 'Capitalized word + 2 digits' },
  { v: '?u?l?l?l?l?l?d?d?d?d', t: 'Capitalized word + year' },
  { v: '?u?l?l?l?l?l?l?d?d?s', t: 'Word + digits + symbol' },
  { v: '?u?u?u?d?d?d?d', t: 'License plate (ABC1234)' },
  { v: '?a?a?a?a?a?a', t: 'Any 6 characters' },
];

let theater = null, toolInfo = null;
const state = { mode: 'demo', attack: 'auto', wallet: null, wordlist: 'builtin', rules: 'rockyou' };

export function initRecovery(theaterApi) {
  theater = theaterApi;
  const api = window.cracker;
  if (!api || !api.isDesktop) return;              // plain browser: bench hidden, sim only

  $('#bench').classList.remove('hidden');
  api.onEvent(handleEvent);
  api.detectTools().then(t => { toolInfo = t; renderToolStatus(t); buildForm(); }).catch(() => buildForm());

  const st = new URLSearchParams(location.search).get('selftest');
  if (st === 'demo') setTimeout(() => { $('#rec-mode').value = 'demo'; state.mode = 'demo'; renderDynamic(); launch(); }, 900);
  else if (st) setTimeout(() => { $('#rec-mode').value = 'generic'; state.mode = 'generic'; renderDynamic();
    const h = $('#rec-hash'); if (h) h.value = st; launch(); }, 900);
}

function renderToolStatus(t) {
  const dot = (ok, name) => el('span', { class: ok ? 'ok' : 'no' }, [`${ok ? '✓' : '✗'} ${name}`]);
  const s = $('#tool-status'); s.innerHTML = '';
  s.append(
    el('span', {}, ['Engines on this machine: ']),
    dot(t.hashcat.ok, 'hashcat'),
    dot(t.john.ok, 'John'),
    dot(t.btcrecover.ok, 'btcrecover'),
    el('span', { class: 'ok' }, [` · GPU: ${t.gpu}`]),
    el('span', { class: 'cost' }, [' · $0 — no cloud, no models, all on your hardware']),
  );
}

function buildForm() {
  const body = $('#bench-body'); body.innerHTML = '';
  const modeSel = el('select', { id: 'rec-mode' },
    Object.entries(MODES).map(([k, m]) => el('option', { value: k }, [m.label])));
  modeSel.value = state.mode;
  modeSel.onchange = () => { state.mode = modeSel.value; state.wallet = null; renderDynamic(); };
  body.append(el('div', { class: 'row' }, [el('label', {}, ['What did you lock yourself out of?']), modeSel]));
  body.append(el('div', { id: 'rec-dynamic' }));
  body.append(el('p', { class: 'hint', id: 'rec-hint' }));

  const start = el('button', { class: 'crack', id: 'rec-start' }, ['Release the real swarm']);
  start.onclick = launch;
  const halt = el('button', { class: 'btn-ghost', id: 'rec-halt' }, ['Halt']);
  halt.onclick = () => window.cracker.cancel();
  body.append(el('div', { class: 'bench-actions' }, [start, halt]), el('div', { class: 'found-line', id: 'rec-found' }));
  renderDynamic();
}

function renderDynamic() {
  const m = MODES[state.mode];
  $('#rec-hint').textContent = m.hint;
  const d = $('#rec-dynamic'); d.innerHTML = '';

  if (m.demo) {
    d.append(el('p', { class: 'demo-note', html: 'Target: <b>app/samples/lost-wallet.dat</b> (a genuine encrypted Bitcoin Core wallet). Candidate list: 12 decoy passwords with the real one hidden inside. Hit the button.' }));
  } else if (m.hashLine) {
    const ta = el('textarea', { id: 'rec-hash', placeholder: '$…  (paste the hash to crack — type is auto-detected)' });
    d.append(row('Hash', ta));
    d.append(row('Hash type', selectOf('rec-hashmode', m.modeChoices.map(c => ({ value: c.v, label: `${c.t}  (-m ${c.v})` })))));
    const det = el('p', { class: 'hint', id: 'rec-detect', style: 'margin-left:216px' });
    d.append(det);
    ta.oninput = () => {
      const g = identifyHash(ta.value);
      if (!g) { det.textContent = ''; return; }
      const sel = $('#rec-hashmode');
      if ([...sel.options].some(o => Number(o.value) === g.m)) { sel.value = String(g.m); det.textContent = `↳ looks like ${g.t} — set to -m ${g.m}`; }
    };
    attackControls(d);
  } else if (m.file) {
    d.append(row('Wallet file', filePick()));
    d.append(row('Passwords to try', wordlistPicker()));
  } else if (m.seed) {
    d.append(row('Known words', el('textarea', { id: 'rec-seedwords', placeholder: 'the words you DO remember, in order; leave unknown ones blank' })));
    d.append(row('Your address', el('input', { type: 'text', id: 'rec-addr', placeholder: 'a receive address this seed generated (bc1… / 1… / 3… / 0x…)' })));
    d.append(row('Coin', selectOf('rec-coin', [{ value: 'bitcoin', label: 'Bitcoin' }, { value: 'ethereum', label: 'Ethereum' }])));
    d.append(row('Passphrase guesses', el('textarea', { id: 'rec-passphrases', placeholder: 'optional — forgotten 25th-word passphrase(s), one per line' })));
  } else if (m.brainwallet) {
    d.append(row('Your address', el('input', { type: 'text', id: 'rec-addr', placeholder: 'the brainwallet address (1… / bc1…)' })));
    d.append(row('Phrases to try', wordlistPicker()));
  } else if (m.rawkey) {
    d.append(row('Your address', el('input', { type: 'text', id: 'rec-addr', placeholder: 'an address this key controls (1… / 3… / bc1…)' })));
    d.append(row('Candidate keys', el('textarea', { id: 'rec-keylist', placeholder: 'WIF private keys to try, one per line (e.g. L…/K…/5…)' })));
  } else if (m.advanced) {
    d.append(row('Wallet file (optional)', filePick()));
    d.append(row('btcrecover args', el('textarea', { id: 'rec-args', placeholder: '--wallet <file> --tokenlist tokens.txt --typos 2 …' })));
  }
}

function wordlistPicker() {
  const opts = [{ value: 'builtin', label: 'Built-in common list' }];
  if (toolInfo && toolInfo.wordlists && toolInfo.wordlists.rockyou)
    opts.push({ value: 'rockyou', label: 'rockyou.txt — 14M real leaked passwords' });
  opts.push({ value: 'demo', label: 'Demo decoy list' }, { value: 'custom', label: 'Choose my own wordlist…' });
  const sel = selectOf('rec-wordlist', opts);
  sel.value = state.wordlist === 'builtin' || state.wordlist === 'demo' ? state.wordlist : 'builtin';
  sel.onchange = async (e) => {
    if (e.target.value === 'custom') {
      const p = await window.cracker.openFile([{ name: 'Wordlists', extensions: ['txt', 'lst', 'dic'] }, { name: 'All', extensions: ['*'] }]);
      if (p) { e.target.append(el('option', { value: p }, [p.split('/').pop()])); e.target.value = p; state.wordlist = p; }
      else e.target.value = 'builtin';
    } else state.wordlist = e.target.value;
  };
  return sel;
}

function attackControls(d) {
  const seg = el('div', { class: 'seg' }, [segBtn('auto', 'Auto-escalate ▸'), segBtn('wordlist', 'Wordlist + mutations'), segBtn('mask', 'Brute-force mask')]);
  d.append(row('Attack', seg));
  const wlRow = row('Wordlist', wordlistPicker()); wlRow.id = 'rec-wl-row';
  const mutOpts = [
    { value: 'none', label: 'None — words as-is' },
    { value: 'best66', label: 'Common (best66) — ~66 tweaks/word' },
  ];
  if (toolInfo && toolInfo.rules && toolInfo.rules.onerule)
    mutOpts.push({ value: 'onerule', label: 'OneRule — 52,014 real-world tweaks/word' });
  mutOpts.push(
    { value: 'rockyou', label: 'Heavy (rockyou-30k) — 30,000 tweaks/word' },
    { value: 'dive', label: 'Insane (dive) — 98,676 tweaks/word' });
  const mutRow = row('Mutations', selectOf('rec-rules', mutOpts)); mutRow.id = 'rec-mut-row';
  const presetSel = selectOf('rec-mask-preset', MASK_PRESETS.map(p => ({ value: p.v, label: p.t })));
  const presetRow = row('Pattern', presetSel); presetRow.id = 'rec-preset-row';
  const maskInput = el('input', { type: 'text', id: 'rec-mask', value: '?d?d?d?d', placeholder: '?a any · ?d digit · ?l lower · ?u upper' });
  const maskRow = row('Mask', maskInput); maskRow.id = 'rec-mask-row';
  presetSel.value = '?d?d?d?d';
  presetSel.onchange = e => { if (e.target.value) maskInput.value = e.target.value; };
  d.append(wlRow, mutRow, presetRow, maskRow);
  const mutSel = mutRow.querySelector('select'); mutSel.value = 'rockyou'; state.rules = 'rockyou';
  mutSel.onchange = e => { state.rules = e.target.value; };
  syncAttack();
}
function segBtn(val, label) {
  const b = el('button', { type: 'button' }, [label]);
  if (state.attack === val) b.classList.add('on');
  b.onclick = () => { state.attack = val; document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); syncAttack(); };
  return b;
}
function syncAttack() {
  const wl = $('#rec-wl-row'), mut = $('#rec-mut-row'), mk = $('#rec-mask-row'), pr = $('#rec-preset-row');
  const word = state.attack === 'wordlist', mask = state.attack === 'mask';
  if (wl) wl.style.display = word ? '' : 'none';
  if (mut) mut.style.display = word ? '' : 'none';
  if (mk) mk.style.display = mask ? '' : 'none';
  if (pr) pr.style.display = mask ? '' : 'none';
}

function row(label, control) { return el('div', { class: 'row' }, [el('label', {}, [label]), control]); }
function selectOf(id, opts) { return el('select', { id }, opts.map(o => el('option', { value: o.value }, [o.label]))); }
function filePick() {
  const name = el('span', { class: 'fp-name', id: 'rec-file-name' }, ['no file chosen']);
  const btn = el('button', { class: 'btn-ghost', type: 'button' }, ['Choose file…']);
  btn.onclick = async () => {
    const p = await window.cracker.openFile([{ name: 'Wallets', extensions: ['dat', 'json', 'wallet', 'db', '*'] }]);
    if (!p) return; state.wallet = p; name.textContent = p.split('/').pop() + ' ✓';
  };
  return el('div', { class: 'filepick' }, [btn, name]);
}

// ---- launch ----
async function launch() {
  const m = MODES[state.mode];
  $('#rec-found').textContent = '';
  const payload = { engine: m.engine };

  if (m.demo) {
    payload.walletFile = 'sample'; payload.wordlist = 'demo';
  } else if (m.hashLine) {
    const h = ($('#rec-hash').value || '').trim();
    if (!h) return flash('paste a hash first');
    payload.hashLine = h; payload.mode = Number($('#rec-hashmode').value);
    if (state.attack === 'auto') payload.engine = 'pipeline';
    else fillAttack(payload);
  } else if (m.file) {
    if (!state.wallet) return flash('choose a file first');
    if (m.engine === 'johnfile') payload.filePath = state.wallet;
    else payload.walletFile = state.wallet;
    payload.wordlist = state.wordlist || 'builtin';
  } else if (m.seed) {
    const words = ($('#rec-seedwords').value || '').trim(), addr = ($('#rec-addr').value || '').trim();
    if (!words || !addr) return flash('enter the words you remember and one address');
    payload.script = 'seedrecover';
    payload.args = ['--mnemonic', words, '--addrs', addr, '--addr-limit', '10', '--dsw',
      '--wallet-type', $('#rec-coin').value === 'ethereum' ? 'ethereum' : 'bip39'];
    if ($('#rec-coin').value !== 'ethereum') payload.args.push('--language', 'en');
    const pp = ($('#rec-passphrases').value || '').trim();
    if (pp) payload.passphrases = pp;
  } else if (m.brainwallet) {
    const addr = ($('#rec-addr').value || '').trim();
    if (!addr) return flash('enter the brainwallet address');
    payload.brainwallet = true; payload.addrs = addr; payload.wordlist = state.wordlist || 'builtin';
  } else if (m.rawkey) {
    const addr = ($('#rec-addr').value || '').trim();
    const keys = ($('#rec-keylist').value || '').trim();
    if (!addr || !keys) return flash('enter the address and at least one candidate key');
    payload.rawkey = true; payload.addrs = addr; payload.keylist = keys;
  } else if (m.advanced) {
    const raw = ($('#rec-args').value || '').trim();
    if (!raw) return flash('enter btcrecover arguments');
    payload.args = raw.match(/(?:[^\s"]+|"[^"]*")+/g).map(s => s.replace(/^"|"$/g, ''));
    if (state.wallet && !raw.includes('--wallet')) payload.args.unshift('--wallet', state.wallet);
  }

  $('#rec-start').disabled = true; $('#rec-start').textContent = 'swarm at work…';
  theater.churn(REAL_AGENTS.map(a => ({ ...a })));
  await window.cracker.startRecovery(payload);
}
function fillAttack(p) {
  p.attack = state.attack;
  if (state.attack === 'mask') p.mask = ($('#rec-mask').value || '').trim() || '?a?a?a?a?a?a';
  else { p.wordlist = state.wordlist || 'builtin'; p.rules = state.rules || 'none'; }
}
function flash(msg) { const f = $('#rec-found'); f.className = 'found-line no'; f.textContent = '⚠ ' + msg; }

// ---- real events -> theater ----
let recentLogs = [];
const ERR_RE = /(no such file|not found|token length|separator unmatched|no hashes loaded|permission denied|error|failed|cannot|traceback)/i;

function handleEvent(e) {
  switch (e.type) {
    case 'start': recentLogs = []; break;
    case 'stage': { const f = $('#rec-found'); f.className = 'found-line'; f.textContent = `▶ Attack ${e.index}/${e.total}: ${e.label}…`; break; }
    case 'log': recentLogs.push(e.line); if (recentLogs.length > 10) recentLogs.shift(); break;
    case 'candidates':                    // the REAL strings the engine is testing -> monkeys' papers
      theater.feed(e.candidates);
      break;
    case 'status':
      if (e.rate) theater.rate(e.rate);
      theater.counters({ tried: e.tried, progress: e.progress, etaSec: e.etaSec });
      theater.eta(e);                     // real measured rate + hashcat's exact ETA -> in-hall HUD
      break;
    case 'cracked':
      theater.reveal(e.plaintext);
      { const f = $('#rec-found'); f.className = 'found-line'; f.textContent = `✓ Recovered: ${e.plaintext}`; }
      break;
    case 'done': {
      $('#rec-start').disabled = false; $('#rec-start').textContent = 'Release the real swarm';
      if (e.found) break;
      const err = recentLogs.filter(l => ERR_RE.test(l)).pop();
      theater.notFound();
      const f = $('#rec-found'); if (!f.textContent) { f.className = 'found-line no';
        f.textContent = err ? 'engine error — ' + err : '— not found in this space. Widen the wordlist / mask and try again.'; }
      break;
    }
    case 'error':
      $('#rec-start').disabled = false; $('#rec-start').textContent = 'Release the real swarm';
      flash(e.message); break;
  }
}
