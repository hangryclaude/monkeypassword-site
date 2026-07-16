// core/crack-math.js
// Honest password / wallet crack-time arithmetic.
// All large quantities are handled in log10 space so nothing overflows Number.
//
// Sources (hashcat v6.2.6, single RTX 4090 — Chick3nman gist + hashcat.net 8x forum bench):
//   MD5 164 GH/s · NTLM 288 GH/s · SHA-256 22 GH/s · bcrypt(cost5) 184 kH/s
//   PBKDF2-HMAC-SHA256 8.9 MH/s · scrypt 7,126 H/s · Bitcoin Core wallet.dat (m11300) 34,064 H/s
//   8x-4090 rig on wallet.dat ≈ 254 kH/s. Cloud: 4090 ≈ $0.34/hr, 8x rig ≈ $5.8/hr, H100 ≈ $2/hr.

export const HASHRATE = Object.freeze({
  md5:        164e9,
  ntlm:       288e9,
  sha256:      22e9,
  bcrypt5:    184e3,
  pbkdf2:      8.9e6,
  scrypt:      7126,
  walletdat:  34064,     // single RTX 4090, Bitcoin Core wallet.dat
  walletdat8: 254e3,     // 8x-4090 rig
});

// GPU rental economics (USD / hour) for the "$ to crack" line.
export const GPU_COST = Object.freeze({ rtx4090: 0.34, rig8x: 5.8, h100: 2.0 });

// Attacker tiers for the generic-password ledger. Hash-agnostic guesses/sec,
// the honest way to talk about "how fast can someone guess" (mirrors zxcvbn's scenarios).
export const TIERS = Object.freeze([
  { id:'throttled', who:'A careful login form (rate-limited)',        rate: 10 },
  { id:'online',    who:'An online service with no throttle',         rate: 1e3 },
  { id:'slow',      who:'Offline, slow KDF (bcrypt / scrypt)',         rate: 1e4 },
  { id:'gpu',       who:'Offline, fast hash — one RTX 4090',          rate: 164e9 },
  { id:'rig',       who:'An 8× RTX 4090 rig, fast hash',              rate: 1.3e12 },
  { id:'nation',    who:'A nation-state GPU farm',                     rate: 1e14 },
]);

// Wallet-specific tiers, for the recovery framing (these use the real wallet.dat KDF rate).
export const WALLET_TIERS = Object.freeze([
  { id:'w1', who:'One RTX 4090 (Bitcoin Core wallet.dat)',            rate: HASHRATE.walletdat  },
  { id:'w8', who:'An 8× RTX 4090 rig (wallet.dat)',                   rate: HASHRATE.walletdat8 },
  { id:'wf', who:'A 1,000-GPU recovery cluster (wallet.dat)',         rate: HASHRATE.walletdat * 1000 },
]);

const LOG10 = Math.log10, LOG2 = Math.log2, L2 = Math.log10(2);

// Which character classes appear -> the naive brute-force pool size.
export function charPool(pw){
  let pool = 0; const classes = [];
  if (/[a-z]/.test(pw))            { pool += 26; classes.push('lowercase'); }
  if (/[A-Z]/.test(pw))            { pool += 26; classes.push('uppercase'); }
  if (/[0-9]/.test(pw))            { pool += 10; classes.push('digits'); }
  if (/[ ]/.test(pw))              { pool += 1;  classes.push('space'); }
  if (/[^a-zA-Z0-9 ]/.test(pw))    { pool += 32; classes.push('symbols'); }
  return { pool, classes };
}

// Core analysis. `realisticGuesses` (optional) is zxcvbn's estimate — the number
// a real attacker actually needs, which for human passwords is far below pool^length.
export function analyze(pw, realisticGuesses = null){
  const { pool, classes } = charPool(pw);
  const len = pw.length;
  const naiveLog10  = len * LOG10(pool || 1);          // log10(pool^len)
  const bits        = len * LOG2(pool || 1);
  const realLog10   = realisticGuesses != null && realisticGuesses > 0
      ? LOG10(realisticGuesses) : naiveLog10;
  const realBits    = realLog10 / L2 * LOG10(2) * LOG2(10); // == realLog10 * log2(10)
  return {
    pw, len, pool, classes, bits,
    naiveLog10,                         // theoretical keyspace, log10
    realLog10,                          // realistic guesses (zxcvbn), log10
    realBits: realLog10 * 3.321928,     // log10 -> bits
  };
}

// average guesses to hit = keyspace / 2  ->  log10 form
export const avgGuessLog10 = spaceLog10 => spaceLog10 - L2;

// Seconds to crack, in log10, given a keyspace(log10) and a guesses/sec rate.
export function secondsLog10(spaceLog10, rate){
  return avgGuessLog10(spaceLog10) - LOG10(rate);
}

// $ to crack at a given rate + GPU $/hr (log10 dollars).
export function dollarsLog10(spaceLog10, rate, usdPerHour){
  // gpu-hours = (keyspace/2 / rate) / 3600 ; $ = gpu-hours * usdPerHour
  return secondsLog10(spaceLog10, rate) - LOG10(3600) + LOG10(usdPerHour);
}

// ---- formatters ----
export function fmtPow(log10){
  if (!isFinite(log10)) return '∞';
  if (log10 < 0) return '0';
  if (log10 < 6) return Math.round(Math.pow(10, log10)).toLocaleString('en-US');
  const exp = Math.floor(log10), mant = Math.pow(10, log10 - exp);
  return `${mant.toFixed(2)} × 10^${exp}`;
}

export function fmtDollars(log10){
  if (log10 < 0) return '< $1';
  if (log10 < 6) return '$' + Math.round(Math.pow(10, log10)).toLocaleString('en-US');
  return '$' + fmtPow(log10);
}

const UNIVERSE_LOG10_YEARS = 10.14; // 1.38e10 years

export function humanTime(log10sec){
  if (log10sec < -0.6) return 'instantly';
  if (log10sec <  0.4) return 'about a second';
  const val = u => Math.round(Math.pow(10, log10sec) / u).toLocaleString('en-US');
  if (log10sec < 1.78)  return val(1) + ' seconds';
  if (log10sec < 3.556) return val(60) + ' minutes';
  if (log10sec < 4.936) return val(3600) + ' hours';
  if (log10sec < 7.499) return val(86400) + ' days';
  const ly = log10sec - 7.499;                          // log10(years)
  if (ly < 3)  return Math.round(Math.pow(10, ly)).toLocaleString('en-US') + ' years';
  if (ly <= UNIVERSE_LOG10_YEARS) return fmtPow(ly) + ' years';
  return `${fmtPow(ly)} years — ${fmtPow(ly - UNIVERSE_LOG10_YEARS)}× the age of the universe`;
}

// Verdict tier from the fast-GPU (single 4090) crack time.
export function verdict(gpuSecLog10){
  if (gpuSecLog10 < 0)    return { grade:'Trivial',  note:'A single monkey would stumble onto this before its coffee break. This is not a password; it is a formality.' };
  if (gpuSecLog10 < 4)    return { grade:'Flimsy',   note:'Hours, at most. The troupe barely warms its knuckles.' };
  if (gpuSecLog10 < 7.5)  return { grade:'Weak',     note:'Days of grinding — inconvenient for a thief, hardly a wall.' };
  if (gpuSecLog10 < 10.5) return { grade:'Sturdy',   note:'Centuries against a serious rig. Respectable. Still finite. Still, one day, found.' };
  return { grade:'Fortress', note:'Longer than the universe has existed. And yet the monkeys are patient, and infinity is a very long time.' };
}

// One call that produces everything the ledger renders.
export function report(pw, realisticGuesses = null){
  const a = analyze(pw, realisticGuesses);
  const tiers = TIERS.map(t => ({ ...t, timeLog10: secondsLog10(a.realLog10, t.rate),
                                  time: humanTime(secondsLog10(a.realLog10, t.rate)) }));
  const walletTiers = WALLET_TIERS.map(t => ({ ...t,
                                  timeLog10: secondsLog10(a.realLog10, t.rate),
                                  time: humanTime(secondsLog10(a.realLog10, t.rate)) }));
  const dollarsGpu = dollarsLog10(a.realLog10, HASHRATE.md5, GPU_COST.rtx4090);
  const gpuSec = secondsLog10(a.realLog10, HASHRATE.md5);
  return { ...a, tiers, walletTiers, dollars: dollarsGpu, verdict: verdict(gpuSec) };
}
