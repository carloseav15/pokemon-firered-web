#!/usr/bin/env node
// Detector check for the RNG and buffer adapters: deliberately wrong TS variants MUST be flagged.
// Needs the wasm built by `node tools/oracle/run.mjs --group C` first. Not part of any npm script.
import { runRng, runBuffer } from "../lib/compare.mjs";
import { OUT } from "../lib/cwasm.mjs";
import path from "node:path";

const rngImpl = (mut) => {
  let seed = 0;
  return {
    seedRng: (v) => { seed = v & 0xffff; },
    random: () => {
      seed = (Math.imul(seed, 1103515245) + (mut === "wrong-increment" ? 24690 : 24691)) >>> 0;
      return mut === "wrong-shift" ? (seed >>> 15) & 0xffff : seed >>> 16;
    },
    state: { get: () => seed },
  };
};
const crc = (init, data, len) => {
  let c = init;
  for (let i = 0; i < len; i++) { c = (c ^ data[i]) & 0xffff; for (let b = 0; b < 8; b++) c = c & 1 ? (c >>> 1) ^ 0x8408 : c >>> 1; }
  return ~c & 0xffff;
};

const results = [];
for (const [mut, expect] of [["none", "MATCH_OBSERVED"], ["wrong-increment", "NEEDS_TRIAGE"], ["wrong-shift", "NEEDS_TRIAGE"]]) {
  const m = rngImpl(mut);
  const ctx = { wasm: path.join(OUT, "random.oracle.wasm"), abs: () => "m", ns: { mods: { m: { __o_seedRng: m.seedRng, __o_random: m.random, __o_state_seed: m.state } } } };
  const spec = { name: "Random", c: { name: "Random", seedFn: "SeedRng", callFn: "Random", stateSymbol: "gRngValue" },
    impls: [{ label: `rng-${mut}`, file: "x", seedName: "seedRng", callName: "random", stateAlias: "seed" }] };
  results.push([`RNG ${mut}`, expect, runRng(ctx, spec, { seed: 1, fuzz: 50 })[0].result]);
}
for (const [mut, init, modifies, expect] of [["none", 0x1121, false, "MATCH_OBSERVED"], ["wrong-init", 0x1120, false, "NEEDS_TRIAGE"], ["modifies-input", 0x1121, true, "NEEDS_TRIAGE"]]) {
  const fn = (d, l) => { const r = crc(init, d, l); if (modifies && l > 0) d[0] ^= 1; return r; };
  const ctx = { wasm: path.join(OUT, "util.oracle.wasm"), abs: () => "m", ns: { mods: { m: { __o_CalcCRC16: fn } } } };
  const spec = { name: "CalcCRC16", ret: "u16", c: { name: "CalcCRC16" }, impls: [{ label: `crc-${mut}`, file: "x", name: "CalcCRC16" }] };
  results.push([`CRC ${mut}`, expect, runBuffer(ctx, spec, { seed: 1 })[0].result]);
}
let bad = 0;
for (const [name, expect, got] of results) { console.log(`${name.padEnd(24)} expected ${expect.padEnd(15)} got ${got}`); if (expect !== got) bad++; }
console.log(bad ? `${bad} UNEXPECTED` : "adapter detectors behave as expected");
process.exit(bad ? 1 : 0);
