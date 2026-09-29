#!/usr/bin/env node
// Freezes the evidence for one function so a later re-run cannot overwrite it:
//   node tools/oracle/evidence.mjs <fn> <impl> <label> <domain> '<json args>' ['<json args>' ...]
// Writes tools/oracle/results/evidence/<fn>.<label>.json with, per case, the C/wasm and TS outputs, the automatic
// cause hint, the verdict from verdicts.json and the exact reproduction command; also the current clusters of
// results/latest.json (which is a snapshot at call time, so call this BEFORE re-generating results).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const [fn, impl, label, domain, ...cases] = process.argv.slice(2);
if (!fn || !cases.length) { console.error("usage: evidence.mjs <fn> <impl> <label> <domain> '<args json>'..."); process.exit(1); }

const out = { function: fn, impl, label, domain, capturedAt: new Date().toISOString(), cases: [] };
for (const c of cases) {
  const cmd = ["tools/oracle/run.mjs", "--fn", fn, "--impl", impl, "--case", c, "--domain", domain, "--no-write"];
  const text = execFileSync("node", cmd, { encoding: "utf8", cwd: path.join(here, "../..") });
  const m = text.match(/first example: (\{.*\})/) ?? text.match(/repro values \[[^\]]*\]: (\{.*\})/);
  const hint = text.match(/cluster=(\S+)/)?.[1] ?? null;
  const result = text.match(/(MATCH_OBSERVED|NEEDS_TRIAGE(?:\([A-Z_,]+\))?)\s*$/m)?.[1] ?? null;
  const verdict = text.match(/verdict: ([A-Z_]+)/)?.[1] ?? null;
  const ex = m ? JSON.parse(m[1]) : null;
  out.cases.push({ args: JSON.parse(c), result, hint, verdict, c_wasm: ex?.c ?? null, ts: ex?.ts ?? null,
    reproduce: `node ${cmd.slice(0, -1).map((a) => (/[\s\[]/.test(a) ? `'${a}'` : a)).join(" ")}` });
}
const latest = JSON.parse(readFileSync(path.join(here, "results/latest.json"), "utf8"));
out.clustersInLatest = latest.records.filter((r) => r.fn === fn && r.impl === impl).map((r) => ({
  domain: r.domain, boundary: r.cases.boundary, fuzz: r.cases.fuzz, result: r.result, mismatches: r.mismatches,
  clusters: Object.fromEntries(Object.entries(r.clusters).map(([k, v]) => [k, { count: v.count, verdict: r.verdicts[k]?.verdict ?? null }])),
}));
mkdirSync(path.join(here, "results/evidence"), { recursive: true });
const file = path.join(here, "results/evidence", `${fn}.${label}.json`);
writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log(`wrote ${path.relative(process.cwd(), file)}`);
for (const c of out.cases) console.log(`${JSON.stringify(c.args)} -> C=${JSON.stringify(c.c_wasm)} TS=${JSON.stringify(c.ts)} result=${c.result} hint=${c.hint} verdict=${c.verdict}`);
