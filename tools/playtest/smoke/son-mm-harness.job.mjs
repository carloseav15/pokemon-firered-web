import { readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { prelude } from "./lib.mjs";
import { helpers, runJob, stopCheckpoint, assertOk, failed, DriverFailure } from "./son-mm-lib.mjs";

// Bounded tests of the Mt. Moon continuation machinery from the Route 4 Center (mtmoon-prepared).
// No cave, no story progress, nothing prepared: load + control wait, helper smoke, driver-failure propagation,
// job budget/cancel, blocked SAVE (menu open) without export, SAVE + export to a NEW path, record only after
// export, reload with real movement, and no overwrite (same name / same destination).
// Destination: $SON_MM_HARNESS_DIR or /tmp/son-mm-harness-<timestamp>. Run with PW_TIMEOUT_MS=600000.
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const dir = process.env.SON_MM_HARNESS_DIR ?? `/tmp/son-mm-harness-${stamp}`;
const mustThrow = async (label, fn) => { try { await fn(); } catch (e) { return e; } throw new Error(`${label}: expected a failure, got success`); };

export default async function run(ctx) {
  mkdirSync(dir, { recursive: true });
  const base = process.env.PW_BASE ?? "http://localhost:5173/";
  const entryName = "mtmoon-prepared", entry = JSON.parse(readFileSync(`tools/playtest/saves/${entryName}.json`, "utf8"));
  const evidence = { checkpoints: [] }, results = {};
  const prefix = `${prelude}${helpers}`;

  // 1. Load + real control (Quest Log playback included).
  const ready = assertOk("ready", await ctx.loadSave(entryName));
  if (ready.phase !== "field" || !ready.fieldFree || ready.map !== "MAP_ROUTE4_POKEMON_CENTER_1F" || ready.x !== 7 || ready.y !== 5) throw new Error("entry not at the Center with free control: " + JSON.stringify(ready));
  results.load = { phase: ready.phase, map: ready.map, x: ready.x, y: ready.y, frames: ready.frames, observed: ready.observed };
  const live = await ctx.runEval(`return H.saveSnapshot();`);
  const fileParty = entry.party.filter(m => m.species).map(m => [m.species, m.personality, m.otId, m.level, m.hp, [...m.moves], [...m.pp]]);
  const liveParty = live.party.map(m => [m.species, m.personality, m.otId, m.level, m.hp, m.moves, m.pp]);
  if (JSON.stringify(fileParty) !== JSON.stringify(liveParty) || live.money !== entry.money || JSON.stringify(live.bag) !== JSON.stringify(entry.bag))
    throw new Error("loaded state differs from the entry file: " + JSON.stringify({ live, entry: { money: entry.money } }));
  results.entryMatchesFile = true;

  // 2. Page helpers load and read state (no walking).
  results.helpers = await ctx.runEval(`${prefix} H.battleDefaults = { mode: "auto", slot: 0 }; const s = status(); if (!s.st.free || s.res.party.length !== 2) throw new Error("helper status wrong"); return { map: s.st.map, party: s.res.party.length, lowSupplies: lowSupplies() };`);

  // 3. Driver failures propagate through runJob/assertOk.
  const blocked = await runJob(ctx, `return await H.goto(0, 0);`, { prefix }); // unreachable tile: driver failure
  if (!failed(blocked)) throw new Error("unreachable goto not reported as failure: " + JSON.stringify(blocked));
  const err1 = await mustThrow("assertOk(goto)", () => assertOk("goto (0,0)", blocked));
  if (!(err1 instanceof DriverFailure) || !err1.result) throw new Error("DriverFailure lost the driver result");
  const budget = await runJob(ctx, `await H.wait(100); return { ok: true };`, { maxFrames: 8, prefix });
  if (budget?.reason !== "frame-budget") throw new Error("frame budget not enforced: " + JSON.stringify(budget));
  const cancelled = await runJob(ctx, `await H.wait(100000); return { ok: true };`, { maxFrames: 1000000, timeoutMs: 600000, deadlineMs: 1500, prefix });
  if (cancelled?.reason !== "cancelled") throw new Error("Node-side deadline did not cancel the job: " + JSON.stringify(cancelled));
  const held = await ctx.runEval(`const f = H.jobStatus().frames; await new Promise(r => setTimeout(r, 40)); return { frames: f, after: H.jobStatus().frames, held: frDebug.joy.held, free: H.fieldFree() };`);
  if (held.frames !== held.after || held.held || !held.free) throw new Error("cancelled job kept running or left input held: " + JSON.stringify(held));
  results.failures = { goto: { reason: blocked.reason, note: blocked.note }, budget: budget.reason, cancelled: cancelled.reason, held };

  // 4. SAVE refused while the START menu is open: no export, nothing recorded.
  await ctx.runEval(`await H.tap(8, 60); if (!await H.until(() => H.hasTask("startInput"), null, 120)) throw new Error("START did not open"); return true;`);
  const directSave = await ctx.runEval(`const raw = localStorage.getItem("pokemon-gba-web-lab.firered.v2"); const r = await H.saveGame({ checkpointName: "son-harness-menu-${stamp}" }); return { r, unchanged: raw === localStorage.getItem("pokemon-gba-web-lab.firered.v2"), cp: H.checkpoints().includes("son-harness-menu-${stamp}") };`);
  if (directSave.r.reason !== "field-not-free" || directSave.r.ok || !directSave.unchanged || directSave.cp) throw new Error("SAVE was not refused cleanly with the menu open: " + JSON.stringify(directSave));
  const err2 = await mustThrow("stopCheckpoint with menu open", () => stopCheckpoint(ctx, { name: `son-harness-menu-${stamp}`, dir, evidence, base, prefix }));
  if (evidence.checkpoints.length || readdirSync(dir).length) throw new Error("a checkpoint was recorded/exported although SAVE was refused");
  await ctx.runEval(`await H.tap(2, 30); if (!await H.until(() => H.fieldFree(), null, 120)) throw new Error("START menu did not close"); return true;`);
  results.refusedWhileMenuOpen = { directSave: directSave.r.reason, error: String(err2.message).slice(0, 160), result: err2.result?.reason ?? null };

  // 5. Real step + SAVE + exclusive export + record + continue + movement.
  const name = `son-harness-${stamp}`;
  const cp = await stopCheckpoint(ctx, { name, dir, evidence, base, prefix, provenance: { job: "son-mm-harness", entry: entryName } });
  const file = `${dir}/${name}.json`, meta = `${dir}/${name}.provenance.json`;
  if (!existsSync(file) || !existsSync(meta) || cp.sha256 !== createHash("sha256").update(readFileSync(file)).digest("hex")) throw new Error("export missing or hash differs");
  if (evidence.checkpoints.length !== 1 || !cp.verified?.continued) throw new Error("checkpoint not recorded/verified");
  const bytes0 = readFileSync(file, "utf8");
  results.checkpoint = { path: cp.path, sha256: cp.sha256, savedCounter: cp.savedCounter, verified: cp.verified };

  // 6. No overwrite: same name (saveGame refuses) and a new name aimed at the same destination (export refuses).
  const err3 = await mustThrow("duplicate name", () => stopCheckpoint(ctx, { name, dir, evidence, base, prefix }));
  const err4 = await mustThrow("duplicate destination", () => stopCheckpoint(ctx, { name: `${name}-b`, path: file, evidence, base, prefix }));
  if (readFileSync(file, "utf8") !== bytes0 || evidence.checkpoints.length !== 1) throw new Error("existing checkpoint overwritten or extra checkpoint recorded");
  if (existsSync(`${dir}/${name}-b.json`) || existsSync(`${dir}/${name}-b.provenance.json`)) throw new Error("failed export left files behind");
  results.noOverwrite = { sameName: err3.result?.reason ?? String(err3.message).slice(0, 120), sameDestination: String(err4.message).slice(0, 120) };

  if (ctx.errors().length) throw new Error("browser errors: " + ctx.errors().join("; "));
  return { dir, ...results, checkpoints: evidence.checkpoints.map(c => ({ name: c.name, sha256: c.sha256 })) };
}
