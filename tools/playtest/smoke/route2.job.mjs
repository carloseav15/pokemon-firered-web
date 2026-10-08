import { readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { prelude } from "./lib.mjs";
import { routeHelpers, MILESTONES, runJob, stopCheckpoint, assertOk, writeEvidence } from "./route2-lib.mjs";
import { loadCheckpointPath } from "../checkpoint-entry.mjs";

// Route segment 2: Cerulean City -> Bill (SS Ticket) -> Misty -> stolen-house Rocket -> Route 5, on the DRV-03/05 driver API.
// Milestones (checkpoint at each, field free, verified by reload): rival, bridge, bill, misty, rocket; final route5-arrival.
// Names: route2-<milestone>-<stamp>; the arrival is route5-arrival (exclusive: an existing file makes the job fail).
// No Pokemon, items, money, flags, variables or battle results are written by code; battles use H.battle("auto").
//
// Entry: ROUTE2_ENTRY (default cerulean-arrival) = a name in tools/playtest/saves; every run starts from the last verified
// milestone, never from the beginning once one exists. A milestone already true at entry is not saved again.
// Modes: ROUTE2_DRYRUN=1 = entry + stop checkpoint without walking; ROUTE2_HEALTEST=1 = walk to the Cerulean Center,
// H.heal, leave (no checkpoint). The runner budget must cover the route: PW_TIMEOUT_MS=2400000.
const out = process.env.ROUTE2_OUT ?? "/tmp/pw/route2";
const exportDir = process.env.ROUTE2_EXPORT_DIR ?? "tools/playtest/saves";
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

export default async function run(ctx) {
  mkdirSync(out, { recursive: true });
  const entryName = process.env.ROUTE2_ENTRY ?? "cerulean-arrival";
  const entryPath = process.env.ROUTE2_ENTRY_PATH ?? `tools/playtest/saves/${entryName}.json`;
  const entryBytes = readFileSync(entryPath), entry = JSON.parse(entryBytes.toString("utf8"));
  const base = process.env.PW_BASE ?? "http://localhost:5173/";
  const prefix = `${prelude}${routeHelpers}`;
  const evidence = { entry: { name: entryName, sha256: createHash("sha256").update(entryBytes).digest("hex"), money: entry.money,
    bag: entry.bag.items, party: entry.party.filter(m => m.species).map(m => [m.species, m.level, m.hp, [...m.moves], [...m.pp]]), saved: entry.gameStats[0] }, legs: [], checkpoints: [] };

  const loaded = process.env.ROUTE2_ENTRY_PATH ? (await loadCheckpointPath(ctx, entryPath, base)).ready : await ctx.loadSave(entryName);
  evidence.entryReady = assertOk("entry ready", loaded);
  evidence.entryCheck = await ctx.runEval(`${prefix}
    H.battleDefaults = { mode: "auto", slot: 0 };
    window.__logMark = H.log.length;
    const e = ${JSON.stringify(evidence.entry)};
    const live = H.resources();
    const liveParty = live.party.map(m => [m.species, m.level, m.hp, m.moves, m.pp]);
    if (JSON.stringify(liveParty) !== JSON.stringify(e.party) || live.money !== e.money || JSON.stringify(live.items) !== JSON.stringify(e.bag)) throw new Error("entry differs from file: " + JSON.stringify({ live, e }));
    return { savedCounter: sv.gameStats[C.GAME_STAT_SAVED_GAME], ...status() };`);
  writeEvidence(out, evidence);

  const provenance = { origin: entryPath, originSha256: evidence.entry.sha256, job: "tools/playtest/smoke/route2.job.mjs", aids: "none: no Pokemon/items/money/flags written by code; auto battle policy; potions and Center healing by the game's own menus" };
  const entryReached = await ctx.runEval(`${prefix} return reached(status());`);
  const done = new Set(Object.entries(entryReached).filter(([, v]) => v).map(([k]) => k));
  evidence.milestones = [];
  // A stop inside a battle or menu cannot be saved, so each milestone reached with a free field is saved at once.
  const milestoneCheckpoint = async (r) => {
    if (r.retreat || !r.st.free) return;
    const hits = await ctx.runEval(`${prefix} return reached(status());`);
    for (const key of MILESTONES) {
      if (!hits[key] || done.has(key)) continue;
      done.add(key);
      try {
        const cp = await stopCheckpoint(ctx, { name: `route2-${key}-${stamp}`, dir: exportDir, movementOptions: { recovery: true }, kind: `route segment 2 milestone checkpoint (${key}); route not PASS`,
          provenance: { ...provenance, milestone: key }, evidence, base, prefix });
        evidence.milestones.push({ key, path: cp.path, state: cp.state });
      } catch (e) { evidence.milestones.push({ key, error: String(e.message ?? e).slice(0, 400) }); }
      writeEvidence(out, evidence);
    }
  };

  if (process.env.ROUTE2_HEALTEST === "1") {
    const legs = [];
    for (let i = 0; i < 6; i++) {
      const r = await runJob(ctx, `window.__retreat = true; return await window.__step();`, { prefix, timeoutMs: 300000 });
      legs.push(r?.ok === false ? r : { action: r.action, bad: r.bad, st: r.st });
      writeEvidence(out, { ...evidence, legs });
      if (r?.ok === false || r.bad) throw new Error("HEALTEST stop: " + JSON.stringify(legs.at(-1)).slice(0, 600));
      if (/nurse/.test(r.action)) break;
    }
    const after = await ctx.runEval(`${prefix} return { ...status(), nurseRuns: window.__nurseRuns ?? 0 };`);
    if (!after.nurseRuns) throw new Error("heal test: no nurse run " + JSON.stringify(legs));
    const full = after.res.party.every(m => m.hp === m.maxHP && !m.status);
    if (!full) throw new Error("heal test: party not full " + JSON.stringify(after.res.party));
    return { legs, after: { st: after.st, party: after.res.party.map(m => [m.species, m.level, m.hp + "/" + m.maxHP, m.pp]), nurseRuns: after.nurseRuns } };
  }

  let stopError = null;
  try {
    if (process.env.ROUTE2_DRYRUN === "1") throw new Error("DRYRUN: stop requested before walking");
    let last = null, same = 0;
    for (let i = 0; i < 160; i++) {
      const r = await runJob(ctx, `H.battleDefaults = { mode: "auto", slot: 0 }; return await window.__step();`, { prefix, timeoutMs: 300000 });
      if (r && r.ok === false) { evidence.legs.push({ action: "job", bad: r.reason ?? r.status, driver: r }); writeEvidence(out, evidence); throw new Error(`STOP: job ${r.reason ?? r.status}`); }
      evidence.legs.push(r);
      writeEvidence(out, evidence);
      if (r.bad) throw new Error(`STOP at "${r.action}": ${r.bad}; map ${r.st.map} (${r.st.x},${r.st.y}); party ${JSON.stringify(r.res.party.map(m => [m.species, m.level, m.hp + "/" + m.maxHP, m.pp]))}`);
      if (r.action === "arrived") break;
      await milestoneCheckpoint(r);
      const key = JSON.stringify([r.action, r.st, r.res.party.map(m => m.hp)]);
      same = key === last ? same + 1 : 0; last = key;
      if (same >= 2) throw new Error(`no progress at "${r.action}" ${JSON.stringify(r.st)}`);
      if (r.retreats > 8) throw new Error("more than 8 retreats");
    }
    const fin = evidence.legs.at(-1);
    if (fin.action !== "arrived") throw new Error("did not reach Route 5 in 160 steps");
  } catch (e) { stopError = e; }

  if (stopError) {
    // Intermediate checkpoint only through the game's own SAVE; its failure never hides the route stop.
    evidence.stop = { message: String(stopError.message), checkpoint: null };
    try {
      const cp = await stopCheckpoint(ctx, { name: `route2-stop-${stamp}`, dir: exportDir, movementOptions: { recovery: true }, provenance: { ...provenance, stopReason: String(stopError.message).slice(0, 300) }, evidence, base, prefix });
      evidence.stop.checkpoint = cp.path;
    } catch (e2) { evidence.stop.checkpointError = String(e2.message ?? e2).slice(0, 500); evidence.stop.checkpointFailure = e2.result ?? null; }
    writeEvidence(out, evidence);
    if (process.env.ROUTE2_DRYRUN === "1" && evidence.stop.checkpoint) return { dryrun: true, checkpoint: evidence.stop.checkpoint, checkpoints: evidence.checkpoints };
    throw new Error(`${stopError.message}; checkpoint: ${evidence.stop.checkpoint ?? "NOT exported (" + (evidence.stop.checkpointError ?? "?") + ")"}; evidence in ${out}`);
  }

  // Route 5 arrival: same flow, destination route5-arrival (exclusive).
  const cp = await stopCheckpoint(ctx, { name: "route5-arrival", dir: exportDir, movementOptions: { recovery: true }, kind: "Route 5 arrival checkpoint", evidence, base, prefix,
    provenance: { ...provenance, method: "Cerulean: rival, Nugget Bridge + Rocket, Route 25, Bill (Yes/No, PC, SS Ticket), Misty, stolen-house Rocket, south exit to Route 5; START>SAVE" } });
  const a = await ctx.runEval(`${prefix} return { ...status(), reached: reached(status()) };`);
  if (!(a.st.map === "MAP_ROUTE5" && MILESTONES.every(k => a.reached[k]))) throw new Error("persistence lost milestone/map: " + JSON.stringify(a.reached) + " " + a.st.map);
  evidence.afterContinue = a;
  writeEvidence(out, evidence);
  return { legs: evidence.legs.map(l => [l.action, l.st.map, l.st.x, l.st.y, (l.battles ?? []).length]), milestones: evidence.milestones, checkpoint: cp };
}
