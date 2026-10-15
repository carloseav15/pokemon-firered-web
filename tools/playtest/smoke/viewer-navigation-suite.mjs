// One command for every viewer navigation smoke job. Needs the dev server (PW_BASE, default :5173).
// Usage: PW_CHARACTER=red|leaf node tools/playtest/smoke/viewer-navigation-suite.mjs [--doors] [name-filter]
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const jobs = [
  "viewer-startup", "viewer-movement", "viewer-navigation", "viewer-avatar", "viewer-depth", "viewer-occlusion",
  "viewer-reflections", "viewer-reflection-terrains", "viewer-shadow-terrains", "viewer-effects", "viewer-terrain-effects", "viewer-tracks", "viewer-interior-navigation",
  "viewer-stair-navigation", "viewer-teleport-navigation", "viewer-fall-navigation", "viewer-forced-navigation",
  "viewer-escalator", "viewer-bike-stairs", "viewer-bridge-walk", "viewer-cave-levels", "viewer-saffron-gates",
  "viewer-door-navigation", "viewer-door-large", "viewer-elevator",
];
// Jobs known to fail for a reason that predates the current work; none at the moment.
const known = {};
const args = process.argv.slice(2);
const withDoors = args.includes("--doors");
const filter = args.find(a => !a.startsWith("--"));
const character = process.env.PW_CHARACTER ?? "red";
const base = process.env.PW_BASE ?? "http://localhost:5173/";
const out = process.env.TMPDIR ?? "/tmp";
let failed = 0, ran = 0;
for (const name of jobs.filter(n => !filter || n.includes(filter))) {
  const started = Date.now();
  const r = spawnSync("node", ["tools/playtest/pw.mjs", resolve(`tools/playtest/smoke/${name}.job.mjs`), resolve(out, `pw-suite-${character}-${name}`)],
    { env: { ...process.env, PW_BASE: base, PW_CHARACTER: character }, encoding: "utf8", timeout: 300000, maxBuffer: 64e6 });
  const text = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  let payload; try { payload = JSON.parse(text.slice(text.lastIndexOf('{"ok"'))); } catch { payload = { ok: false, error: text.slice(-300) }; }
  ran++; const expected = !payload.ok && known[name]; if (!payload.ok && !expected) failed++;
  if (expected) { console.log(`CONOCIDO ${name} — ${known[name]}`); continue; }
  console.log(`${payload.ok ? "OK   " : "FALLO"} ${name} (${((Date.now() - started) / 1000).toFixed(0)}s)${payload.ok ? "" : " — " + String(payload.error).replace(/\s+/g, " ").slice(0, 240)}`);
}
if (withDoors) {
  const r = spawnSync("node", ["tools/playtest/smoke/viewer-door-types.mjs"], { env: { ...process.env, PW_BASE: base, PW_CHARACTER: character }, encoding: "utf8", timeout: 3600000, maxBuffer: 64e6, stdio: ["ignore", "inherit", "inherit"] });
  if (r.status) failed++;
}
const knownFailing = jobs.filter(n => known[n] && (!filter || n.includes(filter))).length;
console.log(`${ran - failed - knownFailing}/${ran} jobs OK, ${knownFailing} fallo(s) conocido(s) (${character})`);
if (failed) process.exitCode = 1;
