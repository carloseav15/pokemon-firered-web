// ByteStruct adapter (generic part). A C global struct (array) lives in wasm memory; the TS ByteStruct owns the
// same bytes layout, so the initial state is copied as RAW BYTES to both sides and the WHOLE struct is compared
// afterwards. Nothing here knows about a particular struct: layout comes from clang's record dump (C) and from
// poking the TS setters (TS), so a layout mismatch is reported as a finding, never patched over.
import { spawnSync } from "node:child_process";
import { instantiate, readTyped } from "./cwasm.mjs";
import { rng } from "./inputs.mjs";
import { makeCases, newRecord, recordMismatch, callC, callTs, sameValue, hint, tsFn } from "./compare.mjs";

/** C layout of `struct <name>` from `clang -fdump-record-layouts` on the preprocessed unit. */
export function cLayout(tc, ppPath, structName) {
  const r = spawnSync(tc.clang, ["--target=wasm32", "-funsigned-char", "-w", "-Xclang", "-fdump-record-layouts-complete", "-fsyntax-only", ppPath],
    { encoding: "utf8", maxBuffer: 1 << 28 });
  const lines = r.stdout.split("\n");
  const start = lines.findIndex((l) => l.trim().endsWith(`| struct ${structName}`));
  if (start < 0) throw new Error(`struct ${structName} not found in the layout dump of ${ppPath}`);
  const fields = [];
  let size = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    const sz = l.match(/\[sizeof=(\d+)/);
    if (sz) { size = Number(sz[1]); break; }
    const m = l.match(/^\s*(\d+)(?::(\d+)-(\d+))?\s*\|(\s+)(.+)$/);
    if (!m || m[4].length !== 3) continue; // only first-level members
    const bit = m[2] === undefined ? null : [Number(m[2]), Number(m[3])];
    const nm = m[5].match(/(\w+)$/);
    fields.push({ name: nm[1], type: m[5], byte: Number(m[1]), bits: bit });
  }
  const SCALAR = { u8: 1, s8: 1, bool8: 1, u16: 2, s16: 2, u32: 4, s32: 4, bool32: 4, int: 4, "unsigned int": 4 };
  fields.forEach((f, i) => { // scalar/array members: size from the type; others: distance to the next member (includes padding)
    if (f.bits) { f.bytes = null; return; }
    const t = f.type.replace(/\s+\w+$/, "").trim(); // drop the member name
    const arr = t.match(/^(.+?)((?:\[\d+\])+)$/);
    const base = arr ? arr[1] : t;
    const count = arr ? [...arr[2].matchAll(/\[(\d+)\]/g)].reduce((n, m) => n * Number(m[1]), 1) : 1;
    if (SCALAR[base]) { f.bytes = SCALAR[base] * count; return; }
    const next = fields.slice(i + 1).find((g) => g.byte > f.byte);
    f.bytes = (next ? next.byte : size) - f.byte;
  });
  return { name: structName, size, fields };
}

/** Bit ranges [lo, hi] (absolute, inclusive) each C member occupies. */
function expectedBits(f) {
  return f.bits ? [f.byte * 8 + f.bits[0], f.byte * 8 + f.bits[1]] : [f.byte * 8, (f.byte + f.bytes) * 8 - 1];
}

/** Poke every TS field on a zeroed instance and see which bits move. */
export function probeTsLayout(Class, layout) {
  const findings = [];
  const tsSize = Class.SIZE;
  const stride = (tsSize + 3) & ~3;
  if (layout.size !== tsSize && layout.size !== stride) findings.push({ kind: "size-differs", c: layout.size, ts: tsSize });
  for (const f of layout.fields) {
    const [lo, hi] = expectedBits(f);
    let desc; // closest definition along the prototype chain (subclasses may override single members)
    for (let p = Class.prototype; p && !desc; p = Object.getPrototypeOf(p)) desc = Object.getOwnPropertyDescriptor(p, f.name);
    if (!desc) { findings.push({ kind: "field-missing-in-ts", field: f.name, expected: [lo, hi] }); continue; }
    const bytes = new Uint8Array(tsSize);
    const inst = new Class(bytes);
    try {
      if (desc.set) inst[f.name] = 0xffffffff;
      else if (ArrayBuffer.isView(inst[f.name])) inst[f.name].fill(-1); // -1 fills every byte of any element width
      else { findings.push({ kind: "field-unpokeable", field: f.name }); continue; }
    } catch (e) { findings.push({ kind: "field-out-of-bounds", field: f.name, error: String(e.message) }); continue; }
    const set = [];
    for (let b = 0; b < tsSize * 8; b++) if (bytes[b >> 3] & (1 << (b & 7))) set.push(b);
    const want = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    // scalar members wider than the setter mask (e.g. s16 -1) still fill their own bytes; compare exact ranges
    if (set.length !== want.length || set.some((b, i) => b !== want[i])) {
      findings.push({ kind: "field-layout-differs", field: f.name, c: { bits: [lo, hi] }, ts: { bits: set.length ? [set[0], set[set.length - 1]] : [], count: set.length } });
    }
  }
  return findings;
}

/** Record of the layout comparison, in the same shape as every other result. */
export function layoutRecord(spec, s, layout, findings) {
  const rec = newRecord(spec, { label: `layout:${s.ctype}` }, "type");
  rec.cases.boundary = layout.fields.length + 1;
  for (const f of findings) recordMismatch(rec, spec, f.kind, f);
  return rec;
}

const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

function fieldAt(layout, off) { // members whose bytes include `off`; bitfields sharing a byte are listed together
  const covering = layout.fields.filter((g) => off >= g.byte && off < g.byte + (g.bytes ?? 1));
  return covering.map((g) => g.name).join("|") || "(padding)";
}

function stateSets(domain, layout, total, r, n) {
  const covered = new Uint8Array(layout.size);
  for (const f of layout.fields) { const [lo, hi] = expectedBits(f); for (let b = lo; b <= hi; b++) covered[b >> 3] = 1; }
  const realistic = (bytes) => { // padding bytes are never written by the game (assumed)
    for (let i = 0; i < bytes.length; i++) if (!covered[i % layout.size]) bytes[i] = 0;
    return bytes;
  };
  const states = [{ desc: "zero", bytes: new Uint8Array(total) }, { desc: "all-ones", bytes: new Uint8Array(total).fill(0xff) }];
  for (let b = 0; b < total * 8; b++) { // walking single bit: proves every bit is read/written where the C says
    const s = new Uint8Array(total); s[b >> 3] = 1 << (b & 7); states.push({ desc: `bit ${b}`, bytes: s });
  }
  for (let i = 0; i < n; i++) {
    const dense = i % 2 === 0;
    states.push({ desc: `${dense ? "random" : "sparse"} #${i}`, bytes: Uint8Array.from({ length: total }, () => {
      if (dense) return Math.floor(r() * 256);
      let v = 0; for (let k = 0; k < 8; k++) if (r() < 0.125) v |= 1 << k; return v; }) });
  }
  return domain === "realistic" ? states.map((s) => ({ ...s, bytes: realistic(s.bytes) })) : states;
}

const CBYTES = { u8: 1, s8: 1, bool8: 1, u16: 2, s16: 2, u32: 4, s32: 4, bool32: 4 };
const cType = (t) => (t === "bool8" ? "u8" : t === "bool32" ? "u32" : t);
function cWrite(mem, addr, type, v) {
  const dv = new DataView(mem.buffer);
  const n = CBYTES[type];
  if (n === 1) dv.setUint8(addr, v & 0xff); else if (n === 2) dv.setUint16(addr, v & 0xffff, true); else dv.setUint32(addr, v >>> 0, true);
}

/** Scalar C global <-> TS accessor. TS side is reached through the bundle (`state` expression or an exposed array). */
function scalarGlobals(ctx, inst, spec) {
  const out = [];
  for (const g of spec.globals ?? []) {
    const n = g.count ?? 1;
    const mod = ctx.ns.mods[ctx.abs(g.ts.file)];
    const acc = g.ts.expr ? mod[`__o_state_${g.name}`] : null;
    const arr = g.ts.expr ? null : mod[`__o_${g.ts.name}`];
    const base = inst.exports[g.name].value;
    for (let i = 0; i < n; i++) {
      out.push({ ...g, label: n > 1 ? `${g.name}[${i}]` : g.name, addr: base + i * CBYTES[g.type],
        tsGet: acc ? () => acc.get() : () => arr[i], tsSet: acc ? (v) => acc.set(v) : (v) => { arr[i] = v; } });
    }
  }
  return out;
}

/** Runs a function whose state is C struct globals (mirrored by TS ByteStructs) and/or scalar C globals. */
export function runStruct(ctx, spec, opts) {
  const out = [];
  const inst = instantiate(ctx.wasm);
  if (inst.exports.__oracle_init) inst.exports.__oracle_init();
  const structs = (spec.structs ?? []).map((s) => {
    const addr = (s.pointer ? inst.exports[`__oracle_${s.name}_storage`] : inst.exports[s.name]).value;
    const tsArr = [].concat(ctx.ns.mods[ctx.abs(s.tsFile)][`__o_${s.name}`]);
    return { ...s, addr, tsArr, csize: s.layout.size, total: s.layout.size * tsArr.length };
  });
  const gl = scalarGlobals(ctx, inst, spec);
  const nP = spec.params.length;
  const pseudo = { ...spec, params: [...spec.params, ...gl.map((g) => ({ n: g.label, t: g.type, realistic: g.realistic, realisticSet: g.realisticSet,
    structural: g.structural, extra: g.extra, realisticExtra: g.realisticExtra, typeCap: g.typeCap }))] };
  const cBytes = (s) => new Uint8Array(inst.mem.buffer, s.addr, s.total);
  const setState = (s, bytes) => {
    cBytes(s).set(bytes);
    s.tsArr.forEach((el, i) => el.bytes.set(bytes.subarray(i * s.csize, i * s.csize + el.bytes.length))); // raw byte copy
  };
  const tsBytes = (s) => { // TS elements concatenated at the C stride; unmapped padding takes the C value (not observed)
    const cb = cBytes(s); const o = new Uint8Array(s.total);
    o.set(cb); s.tsArr.forEach((el, i) => o.set(el.bytes, i * s.csize)); return o;
  };
  const readC = () => gl.map((g) => readTyped(inst.mem, g.addr, cType(g.type)));
  const readTs = () => gl.map((g) => g.tsGet());
  for (const impl of spec.impls) {
    const { fn } = tsFn(ctx, impl);
    for (const domain of opts.domains) {
      const withG = gl.length > 0;
      let argSets = [];
      let vecs = null;
      if (withG) { vecs = opts.onlyCase ? [{ args: opts.onlyCase, src: "repro" }] : makeCases(pseudo, domain, opts); if (!vecs) continue; }
      else {
        argSets = opts.onlyCase ? [opts.onlyCase] : (makeCases(spec, domain, { ...opts, fuzz: 0, cap: 64 }) ?? []).map((c) => c.args);
        if (!argSets.length && spec.params.length) continue;
        if (!argSets.length) argSets.push([]);
      }
      const r = rng(opts.seed + 7);
      const states = opts.onlyCase
        ? structs.map((s, i) => [{ desc: "given", bytes: i === 0 && opts.onlyState !== undefined ? unhex(opts.onlyState) : new Uint8Array(s.total) }])
        : structs.map((s) => stateSets(domain, s.layout, s.total, r, opts.fuzz));
      const rec = newRecord(spec, impl, domain);
      const cases = [];
      if (withG) {
        vecs.forEach((v, k) => cases.push({ args: v.args.slice(0, nP), gv: v.args.slice(nP), src: v.src,
          st: structs.map((s, i) => states[i][opts.onlyCase ? 0 : k % states[i].length]) }));
      } else if (opts.onlyCase) cases.push({ args: opts.onlyCase, gv: [], st: states.map((x) => x[0]), src: "repro" });
      else {
        const main = states[0]; // the first struct drives the state space; any further struct starts zeroed
        main.forEach((st, k) => {
          const isWalk = st.desc.startsWith("bit ") || st.desc === "zero" || st.desc === "all-ones";
          const list = isWalk && argSets.length * main.length > opts.cap ? [argSets[k % argSets.length]] : (isWalk ? argSets : [argSets[k % argSets.length]]);
          for (const a of list) cases.push({ args: a, gv: [], st: [st, ...states.slice(1).map((x) => x[0])], src: isWalk ? "boundary" : "fuzz" });
        });
      }
      for (const cs of cases) {
        rec.cases[cs.src === "fuzz" ? "fuzz" : "boundary"]++;
        structs.forEach((s, i) => setState(s, cs.st[i].bytes.length === s.total ? cs.st[i].bytes : new Uint8Array(s.total)));
        gl.forEach((g, i) => { cWrite(inst.mem, g.addr, g.type, cs.gv[i]); g.tsSet(readTyped(inst.mem, g.addr, cType(g.type))); }); // same value, C-typed
        const before = structs.map((s) => cBytes(s).slice());
        const gInit = readC();
        const c = callC(inst, spec, cs.args);
        const t = callTs(fn, cs.args);
        if (c.trap !== undefined) rec.traps.c++;
        if (t.threw !== undefined) rec.traps.ts++;
        if (spec.ret !== "void" && c.v !== undefined) { rec.retHist ??= {}; const k = String(c.v === 0 ? 0 : "nonzero"); rec.retHist[k] = (rec.retHist[k] ?? 0) + 1; } // how often each branch outcome was reached
        const gC = readC(), gT = readTs();
        if (opts.onlyCase) rec.repro = { args: cs.args, c, ts: t, globals: gl.map((g, i) => ({ name: g.label, initial: gInit[i], c: gC[i], ts: gT[i] })) };
        const diffs = [];
        structs.forEach((s) => {
          const cb = cBytes(s), tb = tsBytes(s);
          for (let i = 0; i < s.total; i++) if (cb[i] !== tb[i]) {
            diffs.push({ struct: s.name, element: Math.floor(i / s.csize), offset: i % s.csize, field: fieldAt(s.layout, i % s.csize), c: cb[i], ts: tb[i] });
          }
        });
        if (opts.onlyCase && diffs.length) rec.repro.byteDiffs = diffs.slice(0, 8);
        const gDiffs = gl.map((g, i) => ({ name: g.label, initial: gInit[i], c: gC[i], ts: gT[i] })).filter((d) => d.c !== d.ts);
        const retOk = spec.ret === "void" || sameValue(c, t);
        if (retOk && !diffs.length && !gDiffs.length) continue;
        const example = { args: cs.args, initialGlobals: Object.fromEntries(gl.map((g, i) => [g.label, gInit[i]])), state: cs.st[0]?.desc,
          initial: before[0] ? hex(before[0].subarray(0, 256)) : undefined, c, ts: t, globalDiffs: gDiffs.slice(0, 4), byteDiffs: diffs.slice(0, 4), byteDiffCount: diffs.length };
        recordMismatch(rec, spec, !retOk ? hint(spec, c, t) : gDiffs.length ? `global-differs:${gDiffs[0].name}` : "bytes-differ", example);
      }
      out.push(rec);
    }
  }
  return out;
}
