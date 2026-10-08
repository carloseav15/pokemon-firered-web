// Driver regression gate (DRV-06): run the focused driver jobs and the route checkpoint verification in sequence,
// one fresh browser each, and fail when any of them fails. Run it after changing tools/playtest/driver.js or
// strategy.js, before using the driver on a route. Never edit the driver while it runs: Vite reloads the page.
// Usage: PW_BASE=http://127.0.0.1:<port>/ node tools/playtest/gate.mjs [job-name ...]
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const JOBS = [
  ["driver-control", 300000], ["driver-save", 300000], ["driver-navigation", 300000],
  ["driver-strategy", 300000], ["driver-auto-battle", 300000], ["driver-switch", 300000], ["driver-recovery", 300000],
  ["driver-futile-heal", 300000], ["driver-no-items", 600000], ["driver-yesno", 300000], ["driver-buy", 300000], ["driver-buy-cerulean", 300000],
  ["screen-catalog", 1500000], ["driver-learn-move", 600000], ["driver-evolution", 600000], ["driver-assess", 300000],
  ["driver-medicine-faint", 300000],
  ["mtmoon-checkpoints", 600000, { MTMOON_STAMP: "20261006233746" }],
];
// Static checks first: no generic "press A" in the driver, policy and strategy cases.
for (const c of ["driver.check.mjs", "policy.check.mjs", "strategy.check.mjs"]) {
  const r = spawnSync("node", [`tools/playtest/${c}`], { encoding: "utf8" });
  console.log(`${r.status === 0 ? "PASS" : "FAIL"} ${c}`);
  if (r.status !== 0) { console.log(`${r.stdout}${r.stderr}`.slice(-600)); process.exit(1); }
}
const only = process.argv.slice(2);
const selected = only.length ? JOBS.filter(([name]) => only.includes(name)) : JOBS;
const base = process.env.PW_BASE ?? "http://localhost:5173/";
let failed = 0;
mkdirSync("/tmp/pw/gate", { recursive: true });
for (const [name, timeout, extra = {}] of selected) {
  const t0 = Date.now();
  const r = spawnSync("node", ["tools/playtest/pw.mjs", resolve("tools/playtest/smoke", `${name}.job.mjs`), `/tmp/pw/gate/${name}`], {
    env: { ...process.env, PW_BASE: base, PW_TIMEOUT_MS: String(timeout), ...extra }, encoding: "utf8", timeout: timeout + 60000,
  });
  writeFileSync(`/tmp/pw/gate/${name}.log`, `${r.stdout ?? ""}${r.stderr ?? ""}`);
  const line = `${r.stdout ?? ""}`.split(/\r?\n/).reverse().find(l => l.trim().startsWith("{"));
  let payload; try { payload = JSON.parse(line); } catch { payload = { ok: false, error: (r.stderr || r.stdout || String(r.error)).slice(-400) }; }
  const ok = payload.ok && r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name} (${Math.round((Date.now() - t0) / 1000)} s)${ok ? "" : " — " + String(payload.error).replace(/\s+/g, " ").slice(0, 300)}`);
}
console.log(`${selected.length - failed}/${selected.length} pass`);
process.exitCode = failed ? 1 : 0;
