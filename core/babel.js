// core/babel.js — deterministic "Library of Babel" catalogue coordinates for any string.
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function babelCoords(pw) {
  const h = cyrb53(pw), h2 = cyrb53(pw, 99);
  const hex = (h.toString(36) + h2.toString(36)).slice(0, 26).toUpperCase();
  return {
    hex,
    wall: 1 + (h % 4),
    shelf: 1 + (Math.floor(h / 4) % 5),
    vol: 1 + (Math.floor(h / 20) % 32),
    page: 1 + (h2 % 410),
    line: 1 + (Math.floor(h2 / 410) % 40),
  };
}

// spine specs for a decorative shelf keyed to the string
export function shelfBooks(pw, n = 34) {
  const h = cyrb53(pw), out = [];
  for (let i = 0; i < n; i++) {
    const s = (h + i * 2654435761) >>> 0;
    out.push({
      bg: `hsl(${20 + (s % 30)} ${28 + ((s >> 16) % 20)}% ${14 + ((s >> 4) % 22)}%)`,
      w: 8 + ((s >> 8) % 20),
      h: 70 + ((s >> 12) % 30),
    });
  }
  return out;
}
