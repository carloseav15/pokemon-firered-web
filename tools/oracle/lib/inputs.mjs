// Deterministic input generation from C types: boundaries + seeded fuzz.
import { ctype } from "./cwasm.mjs";

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function typeRange(t) {
  const [bits, signed] = ctype(t);
  if (bits === 32) return signed ? [-2147483648, 2147483647] : [0, 4294967295];
  return signed ? [-(2 ** (bits - 1)), 2 ** (bits - 1) - 1] : [0, 2 ** bits - 1];
}

/** Boundary values inside [lo, hi]: 0, 1, -1, MIN, MIN+1, MAX-1, MAX, plus sign/width edges and `extra`. */
export function boundaries(lo, hi, extra = []) {
  const set = new Set();
  const add = (v) => { if (Number.isInteger(v) && v >= lo && v <= hi) set.add(v); };
  [0, 1, -1, lo, lo + 1, hi - 1, hi, ...extra].forEach(add);
  for (const b of [7, 8, 15, 16, 31]) {
    const p = 2 ** b;
    [p - 1, p, p + 1, -p, -p + 1, -p - 1].forEach(add);
  }
  return [...set].sort((a, b) => a - b);
}

/** All combinations if few, else a deterministic sample of `cap` distinct combinations. */
export function combos(sets, cap, seed) {
  const total = sets.reduce((n, s) => n * s.length, 1);
  const pick = (idx) => {
    const out = [];
    for (let i = sets.length - 1; i >= 0; i--) { out[i] = sets[i][idx % sets[i].length]; idx = Math.floor(idx / sets[i].length); }
    return out;
  };
  if (total <= cap) return Array.from({ length: total }, (_, i) => pick(i));
  const r = rng(seed);
  const seen = new Set();
  const res = [];
  while (res.length < cap) {
    const i = Math.floor(r() * total);
    if (seen.has(i)) continue;
    seen.add(i);
    res.push(pick(i));
  }
  return res;
}

export function fuzz(ranges, n, seed) {
  const r = rng(seed);
  return Array.from({ length: n }, () => ranges.map(([lo, hi]) => lo + Math.floor(r() * (hi - lo + 1))));
}
