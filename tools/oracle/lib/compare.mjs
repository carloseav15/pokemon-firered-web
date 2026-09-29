// Runs one spec against the C/wasm instance and each TS implementation.
// The harness only reports MATCH_OBSERVED or NEEDS_TRIAGE; verdicts are applied
// afterwards from verdicts.json so the raw evidence is never rewritten.
import { instantiate, wrapTo, readTyped } from "./cwasm.mjs";
import { boundaries, combos, fuzz, typeRange, rng } from "./inputs.mjs";

const MAX_EXAMPLES = 4;

export function callC(inst, spec, args) {
  try {
    const r = inst.exports[spec.c.name](...args);
    return { v: spec.ret === "void" ? undefined : wrapTo(spec.ret, r) };
  } catch (e) {
    return { trap: String(e.message ?? e) };
  }
}

export function callTs(fn, args) {
  try {
    let r = fn(...args);
    if (typeof r === "boolean") return { v: r ? 1 : 0, bool: true }; // representation mapping: bool8/bool32 -> 0/1
    return { v: r };
  } catch (e) {
    return { threw: String(e.message ?? e) };
  }
}

export function sameValue(c, t) {
  if (c.trap !== undefined || t.threw !== undefined) return c.trap !== undefined && t.threw !== undefined;
  // A TS boolean stands for a C bool8/bool32 that callers only test for truthiness: C `x & mask` may yield 2, TS true.
  if (t.bool && c.v !== 0 && c.v !== 1) return t.v === 1;
  return typeof t.v === "number" && c.v === t.v;
}

/** Automatic, non-binding cause hint. It is NOT a verdict. */
export function hint(spec, c, t) {
  if (c.trap !== undefined) return "c-trap";
  if (t.threw !== undefined) return "ts-threw";
  if (typeof t.v !== "number" || !Number.isFinite(t.v)) return "ts-non-finite";
  if (!Number.isInteger(t.v)) return "ts-non-integer";
  const ret = spec.ret;
  if (ret !== "void") {
    if (wrapTo(ret, t.v) === c.v) return `missing-truncation-to-${ret}`;
    const alt = ret.startsWith("s") ? ret.replace("s", "u") : ret.replace("u", "s");
    if (alt !== ret && wrapTo(alt, t.v) === wrapTo(alt, c.v)) return `sign-or-width-mismatch-${ret}`;
    if ((t.v | 0) === (c.v | 0)) return "missing-32bit-wrap";
  }
  return "value-differs";
}

// Domains: type = every value of each C type (may hit UB); structural = type range for data values but the
// realistic range for structural params (table indices, sizes) so out-of-bounds UB does not drown value semantics;
// realistic = game-derived ranges (evidence in the spec); call = TS callers passing unnormalised numbers (C converts
// them to the parameter type at the call boundary, TS receives them raw).
export function makeCases(spec, domain, opts) {
  const ps = spec.params;
  if (domain !== "type" && !ps.length) return null;
  if (domain === "structural" && !ps.some((p) => p.structural)) return null;
  const useReal = (p) => domain === "realistic" || (domain === "structural" && p.structural);
  const isSet = (p) => useReal(p) && p.realisticSet;
  const ranges = ps.map((p) => {
    if (useReal(p)) return p.realisticSet ? [0, p.realisticSet.length - 1] : p.realistic; // set -> index into the set
    if (domain === "call") return [-(2 ** 31), 2 ** 31 - 1];
    return domain === "type" && p.typeCap ? p.typeCap : typeRange(p.t); // typeCap keeps UB that would corrupt the oracle out of the run
  });
  if (ranges.some((r) => !r)) return null;
  const sets = ps.map((p, i) => {
    if (isSet(p)) return [...new Set(p.realisticSet)];
    if (domain === "call") {
      const [lo, hi] = typeRange(p.t);
      return boundaries(ranges[i][0], ranges[i][1], [hi + 1, lo - 1, hi * 2 + 1, 2 ** 16, -(2 ** 16)]);
    }
    return boundaries(ranges[i][0], ranges[i][1], useReal(p) ? p.realisticExtra ?? [] : p.extra ?? []);
  });
  const det = combos(sets, opts.cap, opts.seed).map((a) => ({ args: a, src: "boundary" }));
  const seedOff = { type: 1, realistic: 2, structural: 3, call: 4 }[domain];
  const fz = fuzz(ranges, opts.fuzz, opts.seed + seedOff)
    .map((a) => ({ args: a.map((v, i) => (isSet(ps[i]) ? ps[i].realisticSet[v] : v)), src: "fuzz" }));
  return [...det, ...fz];
}

export function newRecord(spec, impl, domain) {
  return { fn: spec.name, impl: impl.label, domain, cases: { boundary: 0, fuzz: 0 }, mismatches: 0, traps: { c: 0, ts: 0 }, clusters: {}, result: "MATCH_OBSERVED" };
}

export function recordMismatch(rec, spec, cluster, example) {
  rec.mismatches++;
  rec.result = "NEEDS_TRIAGE";
  const cl = (rec.clusters[cluster] ??= { count: 0, examples: [], envelope: null });
  cl.count++;
  if (cl.examples.length < MAX_EXAMPLES) cl.examples.push(example);
  for (const d of example.byteDiffs ?? []) { cl.fields ??= {}; cl.fields[d.field] = (cl.fields[d.field] ?? 0) + 1; } // which members differ
  if (Array.isArray(example.args)) {
    const mag = example.args.reduce((n, v) => n + Math.abs(v), 0);
    if (cl.smallest === undefined || mag < cl.smallestMag) { cl.smallest = example; cl.smallestMag = mag; } // per-parameter min/max over ALL mismatching cases, to reason about domains
    cl.envelope ??= example.args.map((v) => [v, v]);
    example.args.forEach((v, i) => { cl.envelope[i][0] = Math.min(cl.envelope[i][0], v); cl.envelope[i][1] = Math.max(cl.envelope[i][1], v); });
  }
}

export function tsFn(ctx, impl) {
  if (impl.build) return { fn: impl.build(ctx) }; // deliberately wrong variants (detector checks)
  if (impl.mjs) { // hand-loaded module (controls); not part of src/fr
    const mod = ctx.loaded[impl.mjs];
    if (impl.makeName) return { fresh: () => mod[impl.makeName]() };
    return { fn: mod[impl.name] };
  }
  const mod = ctx.ns.mods[ctx.abs(impl.file)];
  const fn = mod[`__o_${impl.name}`];
  if (!fn) throw new Error(`TS symbol ${impl.file}:${impl.name} was not exposed`);
  return { fn };
}

export function runPure(ctx, spec, opts) {
  const out = [];
  for (const impl of spec.impls) {
    const { fn } = tsFn(ctx, impl);
    for (const domain of opts.domains) {
      const inst = instantiate(ctx.wasm); // fresh C state (static locals) for every implementation and domain
      const cases = opts.onlyCase ? [{ args: opts.onlyCase, src: "repro" }] : makeCases(spec, domain, opts);
      if (!cases) continue;
      const rec = newRecord(spec, impl, domain);
      for (const cs of cases) {
        rec.cases[cs.src === "fuzz" ? "fuzz" : "boundary"]++;
        const cArgs = domain === "call" ? cs.args.map((v, i) => wrapTo(spec.params[i].t, v)) : cs.args;
        const c = callC(inst, spec, cArgs);
        const t = callTs(fn, cs.args);
        if (c.trap !== undefined) rec.traps.c++;
        if (t.threw !== undefined) rec.traps.ts++;
        if (opts.onlyCase) rec.repro = { args: cs.args, c, ts: t }; // single-case runs always show both outputs
        if (!sameValue(c, t)) {
          const h = hint(spec, c, t);
          recordMismatch(rec, spec, h, { args: cs.args, src: cs.src, c, ts: t });
        }
      }
      out.push(rec);
    }
  }
  if (spec.pairCompare && spec.impls.length === 2) out.push(...pairTally(ctx, spec, opts, instantiate(ctx.wasm)));
  return out;
}

/** Three-way comparison C vs TS impl A vs TS impl B for specs that have duplicate TS implementations. */
function pairTally(ctx, spec, opts, inst) {
  const [ia, ib] = spec.impls;
  const fa = tsFn(ctx, ia).fn, fb = tsFn(ctx, ib).fn;
  const out = [];
  for (const domain of opts.domains) {
    const cases = makeCases(spec, domain, opts);
    if (!cases) continue;
    const rec = newRecord(spec, { label: `pair(${ia.label} vs ${ib.label})` }, domain);
    const tally = { bothMatchC: 0, onlyAMatchesC: 0, onlyBMatchesC: 0, neitherMatchesC: 0, cTrap: 0 };
    for (const cs of cases) {
      rec.cases[cs.src === "fuzz" ? "fuzz" : "boundary"]++;
      const cArgs = domain === "call" ? cs.args.map((v, i) => wrapTo(spec.params[i].t, v)) : cs.args;
      const c = callC(inst, spec, cArgs);
      const a = callTs(fa, cs.args), b = callTs(fb, cs.args);
      if (c.trap !== undefined) { tally.cTrap++; }
      const am = sameValue(c, a), bm = sameValue(c, b);
      if (am && bm) tally.bothMatchC++; else if (am) tally.onlyAMatchesC++; else if (bm) tally.onlyBMatchesC++; else tally.neitherMatchesC++;
      if (!(a.v === b.v && a.threw === b.threw)) recordMismatch(rec, spec, "A-differs-from-B", { args: cs.args, c, a, b });
    }
    rec.tally = tally;
    out.push(rec);
  }
  return out;
}

/** Call sequences on a fresh C instance and a fresh TS function per sequence (static-local style state). */
export function runSeq(ctx, spec, opts) {
  const out = [];
  for (const impl of spec.impls) {
    const t = tsFn(ctx, impl);
    for (const domain of opts.domains) {
      const cases = makeCases(spec, domain, opts);
      if (!cases) continue;
      const rec = newRecord(spec, impl, domain);
      for (const cs of cases) {
        rec.cases[cs.src === "fuzz" ? "fuzz" : "boundary"]++;
        const inst = instantiate(ctx.wasm);
        const fn = t.fresh ? t.fresh() : t.fn;
        for (let k = 0; k < spec.calls; k++) {
          const c = callC(inst, spec, cs.args);
          const tt = callTs(fn, cs.args);
          if (!sameValue(c, tt)) {
            recordMismatch(rec, spec, `call-${k + 1}:${hint(spec, c, tt)}`, { args: cs.args, call: k + 1, c, ts: tt });
            break;
          }
        }
      }
      out.push(rec);
    }
  }
  return out;
}

/** RNG adapter: same seed on both sides, compare each return value AND the internal state after every call. */
export function runRng(ctx, spec, opts) {
  const out = [];
  const seeds = boundaries(0, 0xffff, [0x1234, 0xbeef, 0x8000]).concat(fuzz([[0, 0xffff]], opts.fuzz, opts.seed).map((a) => a[0]));
  for (const impl of spec.impls) {
    const rec = newRecord(spec, impl, "type");
    const inst = instantiate(ctx.wasm);
    const stateAddr = inst.exports[spec.c.stateSymbol].value;
    const modOf = (f) => ctx.ns.mods[ctx.abs(f ?? impl.file)];
    const seedTs = modOf(impl.seedFile)[`__o_${impl.seedName}`];
    const callTsRng = modOf(impl.file)[`__o_${impl.callName}`];
    const state = modOf(impl.stateFile)[`__o_state_${impl.stateAlias}`];
    for (const [i, seed] of seeds.entries()) {
      const nCalls = i === 0 ? 1000 : 8;
      rec.cases[i < 20 ? "boundary" : "fuzz"]++;
      inst.exports[spec.c.seedFn](seed);
      seedTs(seed);
      for (let k = 0; k < nCalls; k++) {
        const cv = wrapTo("u16", inst.exports[spec.c.callFn]());
        const cs = readTyped(inst.mem, stateAddr, "u32");
        const tv = callTs(callTsRng, []);
        const ts = state.get() >>> 0;
        if (cv !== tv.v || cs !== ts) {
          recordMismatch(rec, spec, cv !== tv.v ? "return-differs" : "state-differs",
            { seed, call: k + 1, c: { v: cv, state: cs }, ts: { v: tv.v, state: ts } });
          break;
        }
      }
    }
    out.push(rec);
  }
  return out;
}

function patterns(seed) {
  const r = rng(seed);
  const lens = [0, 1, 2, 3, 7, 8, 9, 15, 16, 17, 31, 32, 33, 255, 256, 257, 1000, 4095, 4096];
  const cases = [];
  for (const n of lens) {
    cases.push({ name: `zeros-${n}`, bytes: new Uint8Array(n) });
    cases.push({ name: `ff-${n}`, bytes: new Uint8Array(n).fill(0xff) });
    cases.push({ name: `inc-${n}`, bytes: Uint8Array.from({ length: n }, (_, i) => i & 0xff) });
    cases.push({ name: `prng-${n}`, bytes: Uint8Array.from({ length: n }, () => Math.floor(r() * 256)) });
  }
  return cases;
}

/** Buffer adapter: TS Uint8Array <-> wasm linear memory. Also checks the input buffer is not modified. */
export function runBuffer(ctx, spec, opts) {
  const out = [];
  const inst = instantiate(ctx.wasm);
  const heap = inst.exports.__heap_base.value;
  for (const impl of spec.impls) {
    const { fn } = tsFn(ctx, impl);
    const rec = newRecord(spec, impl, "type");
    for (const cs of patterns(opts.seed)) {
      rec.cases.boundary++;
      new Uint8Array(inst.mem.buffer, heap, cs.bytes.length).set(cs.bytes);
      let c;
      try { c = { v: wrapTo(spec.ret, inst.exports[spec.c.name](heap, cs.bytes.length)) }; } catch (e) { c = { trap: String(e.message) }; }
      const copy = cs.bytes.slice();
      const t = callTs(fn, [copy, copy.length]);
      const cAfter = new Uint8Array(inst.mem.buffer, heap, cs.bytes.length);
      const cMod = cs.bytes.some((b, i) => b !== cAfter[i]);
      const tMod = cs.bytes.some((b, i) => b !== copy[i]);
      if (!sameValue(c, t) || cMod !== tMod) {
        recordMismatch(rec, spec, !sameValue(c, t) ? hint(spec, c, t) : "input-modified-differs",
          { name: cs.name, length: cs.bytes.length, c, ts: t, cMod, tMod });
      }
    }
    out.push(rec);
  }
  return out;
}

/** Compare a C table against the TS table it should mirror. Differences are candidate DATA_MISMATCH. */
export function runDataChecks(ctx, spec) {
  const out = [];
  if (!spec.dataChecks) return out;
  const inst = instantiate(ctx.wasm);
  for (const d of spec.dataChecks) {
    const base = inst.exports[d.cSymbol].value;
    const stride = d.strideFn ? inst.exports[d.strideFn]() : d.stride;
    const offset = (d.offsetFn ? inst.exports[d.offsetFn]() : d.offset ?? 0) + (d.offsetPlus ?? 0);
    const tsVals = d.ts(ctx);
    const rec = { fn: spec.name, impl: `data:${d.label}`, domain: "type", cases: { boundary: tsVals.length, fuzz: 0 }, mismatches: 0, traps: { c: 0, ts: 0 }, clusters: {}, result: "MATCH_OBSERVED" };
    for (let i = 0; i < tsVals.length; i++) {
      const cv = readTyped(inst.mem, base + i * stride + offset, d.type);
      if (cv !== tsVals[i]) recordMismatch(rec, spec, "table-differs", { index: i, c: { v: cv }, ts: { v: tsVals[i] } });
    }
    out.push(rec);
  }
  return out;
}
