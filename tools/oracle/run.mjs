#!/usr/bin/env node
// Differential oracle PoC: pokefirered C (clang/wasm32) vs the real src/fr TypeScript.
// Opt-in tool. Not wired to check:port, npm test or CI. See tools/oracle/README.md.
//
//   node tools/oracle/run.mjs [--group A|B|C|controls|all] [--fn Name] [--seed N] [--fuzz N] [--cap N]
//                             [--domain type|structural|realistic|call|both|all] [--impl label] [--case '[1,2]'] [--no-write]
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import esbuild from "esbuild";
import { findToolchain } from "./lib/toolchain.mjs";
import { ROOT, OUT, compileC, instantiate, CFLAGS, LDFLAGS } from "./lib/cwasm.mjs";
import { bundleTs } from "./lib/tsbundle.mjs";
import { runPure, runSeq, runRng, runBuffer, runDataChecks } from "./lib/compare.mjs";
import { runStruct, cLayout, probeTsLayout, layoutRecord } from "./lib/structs.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);

function parseArgs(argv) {
  const o = { group: "all", seed: 20260928, fuzz: 2000, cap: 20000, domain: "both", write: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-write") o.write = false;
    else if (a.startsWith("--")) o[a.slice(2)] = argv[++i];
  }
  o.seed = Number(o.seed); o.fuzz = Number(o.fuzz); o.cap = Number(o.cap);
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const tc = findToolchain();
if (!tc.ok) {
  console.error("oracle: cannot run, missing dependencies:\n  - " + tc.missing.join("\n  - "));
  console.error("This tool is opt-in and does not affect the rest of the project.");
  process.exit(2);
}

// ---- load and filter specs
const specFiles = readdirSync(path.join(here, "specs")).filter((f) => f.endsWith(".mjs")).sort();
let specs = [];
for (const f of specFiles) specs.push(...(await import(pathToFileURL(path.join(here, "specs", f)).href)).default);
if (opts.group !== "all") specs = specs.filter((s) => opts.group.split(",").includes(s.group));
if (opts.fn) specs = specs.filter((s) => opts.fn.split(",").includes(s.name));
if (!specs.length) { console.error("oracle: no spec selected"); process.exit(1); }
if (opts.impl) for (const s of specs) s.impls = s.impls.filter((i) => i.label === opts.impl);
const onlyCase = opts.case ? JSON.parse(opts.case) : null;
const domains = opts.domain === "both" ? ["type", "structural", "realistic"] : opts.domain === "all" ? ["type", "structural", "realistic", "call"] : opts.domain.split(",");

// ---- C side: one wasm per translation unit
const metrics = { c: {}, ts: {}, toolchain: { clang: tc.version, wasmLd: tc.ldVersion }, cflags: CFLAGS, ldflags: LDFLAGS };
const units = new Map();
for (const s of specs) {
  const key = s.c.srcPath ?? s.c.stem;
  const u = units.get(key) ?? { stem: s.c.stem, srcPath: s.c.srcPath && path.join(ROOT, s.c.srcPath), unstatic: new Set(), appendC: new Set(), specs: [] };
  (s.c.unstatic ?? []).forEach((n) => u.unstatic.add(n));
  if (s.c.appendC) u.appendC.add(s.c.appendC);
  for (const g of s.globals ?? []) { // scalar C globals the unit only declares `extern`
    u.appendC.add(`${g.type} ${g.name}${g.count > 1 ? `[${g.count}]` : ""};`);
  }
  for (const st of s.structs ?? []) { // define the C global the unit only declares `extern` (address 0 otherwise)
    u.appendC.add(st.pointer
      ? `${st.ctype} __oracle_${st.name}_storage;\n${st.ctype} *${st.name};\nvoid __oracle_init(void) { ${st.name} = &__oracle_${st.name}_storage; }`
      : `${st.ctype} ${st.name}[${st.count}];`);
  }
  u.specs.push(s);
  units.set(key, u);
}
for (const [key, u] of units) {
  const r = compileC(tc, u.stem, { unstaticNames: [...u.unstatic], appendC: [...new Set([...u.appendC].join("\n").split("\n"))].join("\n"), srcPath: u.srcPath });
  const inst = instantiate(r.wasm);
  const undef = r.undefinedSyms;
  u.wasm = r.wasm;
  metrics.c[key] = { compileMs: r.compileMs, wasmBytes: r.wasmBytes, imports: inst.imports.length,
    libcProvided: inst.libcProvided, stubbed: inst.stubbed.length, undefinedSymbols: undef.length,
    exportedFunctions: Object.values(inst.exports).filter((v) => typeof v === "function").length,
    undefinedDataSymbols: undef.filter((n) => !inst.imports.includes(n)).length };
  console.log(`[C] ${key}: ${r.wasmBytes} B wasm, ${inst.imports.length} imports (${inst.libcProvided.length} libc, ${inst.stubbed.length} stubbed), ${undef.length} undefined symbols, ${r.compileMs} ms`);
}

// ---- controls: TS from the generator BEFORE the INT work (frozen baseline), from the CURRENT generator, and hand-fixed TS
const loaded = {};
if (specs.some((s) => s.group === "controls")) {
  mkdirSync(OUT, { recursive: true });
  execFileSync(tc.python, [path.join(here, "controls/gen_controls.py"), path.join(OUT, "controls_generated")], { cwd: ROOT });
  for (const label of ["old", "new"]) {
    const ts = readFileSync(path.join(OUT, `controls_generated_${label}.ts`), "utf8");
    const mjs = path.join(OUT, `controls_generated_${label}.mjs`);
    writeFileSync(mjs, esbuild.transformSync(ts, { loader: "ts", format: "esm" }).code);
    loaded[`controls_generated_${label}`] = await import(pathToFileURL(mjs).href);
  }
  loaded.controls_fixed = await import(pathToFileURL(path.join(here, "controls/fixed.mjs")).href);
}
if (specs.some((s) => s.group === "real")) { // real pokefirered functions from both generators (see controls/gen_real.py)
  execFileSync(tc.python, [path.join(here, "controls/gen_real.py"), path.join(OUT, "real_generated")], { cwd: ROOT });
  for (const label of ["old", "new"]) {
    const ts = readFileSync(path.join(OUT, `real_generated_${label}.ts`), "utf8");
    const mjs = path.join(OUT, `real_generated_${label}.mjs`);
    writeFileSync(mjs, esbuild.transformSync(ts, { loader: "ts", format: "esm" }).code);
    loaded[`real_generated_${label}`] = await import(pathToFileURL(mjs).href);
  }
}

const rejected = [];
for (const s of specs) { // a generator variant that rejected a function has no TS for it: not compared
  s.impls = s.impls.filter((i) => { const ok = !i.mjs || i.name in loaded[i.mjs]; if (!ok) rejected.push(`${s.name} (${i.label})`); return ok; });
}
if (rejected.length) console.log(`[gen] not generated, skipped: ${rejected.join(", ")}`);

// ---- TS side: one esbuild bundle of the real src/fr modules
for (const s of specs) {
  s.tsTargets = s.impls.filter((i) => i.file).flatMap((i) =>
    [i.name, i.seedName, i.callName, ...(s.extraExpose ?? [])].filter(Boolean).map((n) => ({ file: i.file, name: n, state: i.state }))).concat(s.tsExtra ?? [], (s.globals ?? []).map((g) => (g.ts.expr ? { file: g.ts.file, state: { [g.name]: g.ts.expr } } : { file: g.ts.file, name: g.ts.name })));
}
const needsTs = specs.some((s) => s.tsTargets.length);
let ns = null;
if (needsTs) {
  const b = await bundleTs(specs);
  ns = b.ns;
  metrics.ts = { bundleMs: b.bundleMs, modules: Object.keys(ns.mods).length };
  console.log(`[TS] bundled ${metrics.ts.modules} modules in ${b.bundleMs} ms`);
}

// ---- run
const verdicts = existsSync(path.join(here, "verdicts.json")) ? JSON.parse(readFileSync(path.join(here, "verdicts.json"), "utf8")) : [];
const records = [];
const layoutDone = new Set();
const runOpts = { seed: opts.seed, fuzz: opts.fuzz, cap: opts.cap, domains, onlyCase, onlyState: opts.state };
const t0 = Date.now();
for (const [key, u] of units) {
  for (const spec of u.specs) {
    const ctx = { wasm: u.wasm, ns, loaded, abs: (f) => path.join(ROOT, f), rom: ns?.rom, assets: ns?.assets, ROOT };
    if (spec.setup) await spec.setup(ctx);
    for (const st of spec.structs ?? []) { // layout first: C record layout vs the TS ByteStruct, reported, never adapted
      if (!st.layout) st.layout = cLayout(tc, path.join(OUT, `${u.stem}.oracle.c`), st.structName);
      if (layoutDone.has(st.ctype)) continue;
      layoutDone.add(st.ctype);
      const findings = probeTsLayout(ns.mods[ctx.abs(st.tsClassFile)][`__o_${st.structName}`], st.layout);
      const lr = layoutRecord(spec, st, st.layout, findings);
      lr.group = spec.group; lr.kind = "layout"; lr.observed = `sizeof=${st.layout.size} and every member's bit range (${st.layout.fields.length} members)`;
      lr.adapters = ["clang record-layout dump", "TS setter poke"]; lr.verdicts = {}; lr.unresolved = Object.keys(lr.clusters); lr.layout = { size: st.layout.size, fields: st.layout.fields.length };
      records.push(lr);
    }
    const run = { pure: runPure, seq: runSeq, rng: runRng, buffer: runBuffer, struct: runStruct }[spec.kind];
    const so = { ...runOpts, domains: [...new Set([...domains, ...(spec.extraDomains ?? [])])] };
    const recs = [...run(ctx, spec, so), ...runDataChecks(ctx, spec)];
    for (const r of recs) {
      r.group = spec.group; r.kind = spec.kind; r.paramNames = spec.params?.map((p) => p.n); r.observed = spec.observed ?? "return value";
      r.adapters = spec.cost?.adapters ?? []; r.cost = spec.cost; r.realistic = spec.realisticEvidence;
      const impl0 = spec.impls.find((i) => i.label === r.impl); r.expect = impl0?.expect; r.expectOnly = impl0?.expectOnly;
      const vs = verdicts.filter((v) => v.fn === r.fn && v.impl === r.impl && (!v.domain || v.domain === r.domain));
      r.verdicts = {};
      for (const c of Object.keys(r.clusters)) {
        const v = vs.find((x) => x.cluster === c);
        if (v) r.verdicts[c] = { verdict: v.verdict, reason: v.reason };
      }
      r.unresolved = Object.keys(r.clusters).filter((c) => !r.verdicts[c]);
      records.push(r);
    }
  }
}
metrics.runMs = Date.now() - t0;

// ---- output
const pad = (s, n) => String(s).padEnd(n);
console.log("\n" + pad("function", 36) + pad("impl", 22) + pad("domain", 10) + pad("bnd", 7) + pad("fuzz", 7) + pad("mism", 7) + "result");
for (const r of records) {
  const tag = r.result === "NEEDS_TRIAGE" ? (r.unresolved.length ? "NEEDS_TRIAGE" : "NEEDS_TRIAGE(" + [...new Set(Object.values(r.verdicts).map((v) => v.verdict))].join(",") + ")") : r.result;
  console.log(pad(r.fn, 36) + pad(r.impl, 22) + pad(r.domain, 10) + pad(r.cases.boundary, 7) + pad(r.cases.fuzz, 7) + pad(r.mismatches, 7) + tag);
}
for (const r of records.filter((x) => x.repro)) console.log(`repro values [${r.impl}]: ${JSON.stringify(r.repro)}`);
for (const r of records.filter((x) => x.tally)) console.log(`\n${r.fn} ${r.impl} [${r.domain}] vs C: ${JSON.stringify(r.tally)}`);
const detector = records.filter((r) => r.expect);
if (detector.length) {
  const bad = detector.filter((r) => r.expect !== r.result || (r.expectOnly && Object.keys(r.clusters).some((c) => !r.expectOnly.includes(c))));
  console.log(`\nDetector validity (controls): ${detector.length - bad.length}/${detector.length} as expected` + (bad.length ? "  UNEXPECTED: " + bad.map((r) => `${r.fn}/${r.impl}=${r.result}`).join(", ") : ""));
}
for (const r of records.filter((x) => x.result === "NEEDS_TRIAGE" && !x.expect)) {
  for (const [cl, info] of Object.entries(r.clusters)) {
    const e = info.examples[0];
    console.log(`\nFunction: ${r.fn} [${r.impl}] domain=${r.domain.toUpperCase()}_DOMAIN cluster=${cl} (${info.count} cases)`);
    console.log(`  first example: ${JSON.stringify(e)}`);
    if (info.envelope) console.log(`  envelope of mismatching args: ${info.envelope.map((rg, i) => `${r.paramNames?.[i] ?? i}[${rg[0]}..${rg[1]}]`).join(" ")}`);
    for (const d of e.globalDiffs ?? []) console.log(`  Global mismatch: ${d.name}  initial: ${d.initial}  C after: ${d.c}  TS after: ${d.ts}`);
    if (info.smallest && info.smallest !== e) console.log(`  smallest-magnitude example: ${JSON.stringify(info.smallest)}`);
    console.log(`  reproduce: node tools/oracle/run.mjs --fn ${r.fn} --impl '${r.impl}' --case '${JSON.stringify(e.args ?? [])}' --domain ${r.domain}`);
    if (r.verdicts[cl]) console.log(`  verdict: ${r.verdicts[cl].verdict} (${r.verdicts[cl].reason})`);
  }
}

if (opts.write && !onlyCase && opts.group === "all" && !opts.fn) {
  mkdirSync(path.join(here, "results"), { recursive: true });
  writeFileSync(path.join(here, "results/latest.json"), JSON.stringify({ seed: opts.seed, fuzz: opts.fuzz, cap: opts.cap, metrics, records }, null, 1) + "\n");
  console.log("\nwrote tools/oracle/results/latest.json");
}
