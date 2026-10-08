// Vermilion -> S.S. Anne (ticket check, rival in the 2F corridor, Captain's HM01 Cut) -> back to Vermilion, by real inputs.
// Data: pokefirered/data/maps/{VermilionCity,SSAnne_Exterior,SSAnne_1F_Corridor,SSAnne_2F_Corridor,SSAnne_CaptainsOffice}/map.json
// (ticket coord events (22..23,33); warps; rival coord events (30..32,6); Captain object (5,4)).
// Importing an existing checkpoint prepares the entry, not its historical provenance.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadCheckpointPath } from "../checkpoint-entry.mjs";
import { prelude } from "./lib.mjs";
import { routeHelpers, runJob, stopCheckpoint, writeEvidence } from "./route2-lib.mjs";
import { warpHelpers } from "./warp-lib.mjs";

const shipHelpers = `
  const SS = {
    flags: () => ({ ticket: flag("FLAG_GOT_SS_TICKET"), hm01Flag: flag("FLAG_GOT_HM01"), hm01: bagCount(C.ITEM_HM01),
      rival: ["TRAINER_RIVAL_SS_ANNE_SQUIRTLE","TRAINER_RIVAL_SS_ANNE_BULBASAUR","TRAINER_RIVAL_SS_ANNE_CHARMANDER"].map(trainer),
      rivalGone: flag("FLAG_HIDE_SS_ANNE_RIVAL"), shipGone: flag("FLAG_HIDE_SS_ANNE"), scene: vr("VAR_MAP_SCENE_VERMILION_CITY") }),
  };
  const snap = () => ({ status: status(), ss: SS.flags() });
  const reachedShip = () => { const s = SS.flags(); return s.hm01Flag && s.hm01 >= 1 && s.rival.some(Boolean); };
  ${warpHelpers}
  window.__alsoArrived = () => reachedShip() && H.st().map === "MAP_VERMILION_CITY";
  window.__shipStep = async () => {
    const s = H.st(), m = s.map, f = SS.flags(), opts = { recovery: false };
    window.__from = m;
    let action, r;
    if (m === "MAP_VERMILION_CITY") {
      if (reachedShip()) return { action: "done", done: true, ...snap() };
      if (vr("VAR_VERMILION_CITY_TICKET_CHECK_TRIGGER") === 1) { action = "pier (23,34) -> ship"; r = await takeWarp(23, 34, "MAP_SSANNE_EXTERIOR", opts); }
      else { action = "ticket check (23,33)"; r = await walk(23, 33, opts); if (!r.note) r = await settle(); }
    } else if (m === "MAP_SSANNE_EXTERIOR") {
      action = reachedShip() ? "exterior -> Vermilion" : "exterior -> 1F";
      r = reachedShip() ? await takeWarp(31, 5, "MAP_VERMILION_CITY", opts) : await takeWarp(32, 14, "MAP_SSANNE_1F_CORRIDOR", opts);
    } else if (m === "MAP_SSANNE_1F_CORRIDOR") {
      action = reachedShip() ? "1F -> exterior" : "1F -> 2F stairs";
      r = reachedShip() ? await takeWarp(19, 1, "MAP_SSANNE_EXTERIOR", opts) : await takeWarp(3, 8, "MAP_SSANNE_2F_CORRIDOR", opts);
    } else if (m === "MAP_SSANNE_2F_CORRIDOR") {
      if (!f.rival.some(Boolean)) { action = "rival trigger (31,6)"; r = await walk(31, 6, opts); if (!r.note) r = await settle(); }
      else if (!reachedShip()) { action = "2F -> Captain's office"; r = await takeWarp(30, 2, "MAP_SSANNE_CAPTAINS_OFFICE", opts); }
      else { action = "2F -> 1F stairs"; r = await takeWarp(2, 2, "MAP_SSANNE_1F_CORRIDOR", opts); }
    } else if (m === "MAP_SSANNE_CAPTAINS_OFFICE") {
      if (!reachedShip()) { action = "Captain (5,4)"; r = await talkSettle(5, 4); }
      else { action = "office -> 2F"; r = await takeWarp(3, 7, "MAP_SSANNE_2F_CORRIDOR", opts); }
    } else return { action: "unknown map", bad: "unexpected map " + m, ...snap() };
    const note = r?.note && r.note !== "map changed" ? r.note : null;
    return { action, bad: note, battleResult: r?.battleResult ? { stop: r.battleResult.stop, outcome: r.battleResult.outcome } : undefined,
      ...snap(), battles: newBattles(), stuck: note ? { observe: H.observe(), objects: H.objects() } : undefined };
  };
`;

export default async function run(ctx) {
  const out = resolve(process.argv[3] ?? "tools/playtest/runs/ssanne");
  const base = process.env.PW_BASE ?? "http://localhost:5197/";
  const saves = join(out, "saves"), file = join(out, "evidence.json");
  mkdirSync(saves, { recursive: true });
  let entry = process.env.SSANNE_ENTRY_PATH;
  if (!entry && existsSync(file)) {
    const prior = JSON.parse(readFileSync(file, "utf8"));
    entry = [...(prior.checkpoints ?? [])].reverse().find(cp => cp.verified?.continued)?.path;
  }
  entry ??= "tools/playtest/saves/vermilion-arrival-20261008190519.json";
  const evidence = { status: "running", entry, legs: [], checkpoints: [] };
  const prefix = prelude + routeHelpers + shipHelpers;
  const persist = () => writeEvidence(out, evidence);
  persist();
  try {
    evidence.loaded = await loadCheckpointPath(ctx, entry, base);
    evidence.before = await ctx.runEval(`${prefix} return snap();`);
    if (!evidence.before.ss.ticket) throw Error("entry lacks the S.S. Ticket");
    for (let i = 0; i < 40; i++) {
      const leg = await runJob(ctx, `return await window.__shipStep();`, { prefix, maxFrames: 400000, timeoutMs: 280000 });
      evidence.legs.push(leg); persist();
      if (!leg || leg.ok === false || leg.bad) throw Error("S.S. Anne stopped: " + JSON.stringify(leg).slice(0, 1800));
      if (leg.done) break;
    }
    const end = await ctx.runEval(`${prefix} return snap();`);
    if (end.status.st.map !== "MAP_VERMILION_CITY" || !end.ss.hm01Flag || end.ss.hm01 < 1 || !end.ss.rival.some(Boolean)) throw Error("S.S. Anne milestones not reached: " + JSON.stringify(end.ss));
    evidence.healing = await ctx.runEval("return await H.healAtCenter();");
    if (!evidence.healing.ok) throw Error("healing failed: " + JSON.stringify(evidence.healing));
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    evidence.checkpoint = await stopCheckpoint(ctx, { name: `ssanne-hm01-${stamp}`, dir: saves, base, prefix, evidence, movementOptions: { recovery: true },
      kind: "S.S. Anne rival defeated, HM01 Cut received, back in Vermilion; Cut/Surge not tested",
      provenance: { origin: evidence.loaded.path, originSha256: evidence.loaded.sha256, job: "tools/playtest/smoke/ssanne-progress.job.mjs",
        aids: "imported entry only; travel, battles, dialogs and healing by UI" } });
    evidence.checkpoints.push(evidence.checkpoint);
    evidence.final = await ctx.runEval(`${prefix} return snap();`);
    if (!evidence.final.ss.hm01Flag || evidence.final.ss.hm01 < 1 || !evidence.final.status.st.free) throw Error("milestones lost after continue");
    if (ctx.errors().length) throw Error(ctx.errors().join("; "));
    evidence.status = "passed"; persist(); return evidence;
  } catch (error) {
    evidence.status = "blocked"; evidence.error = String(error.stack ?? error);
    try {
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      evidence.stopCheckpoint = await stopCheckpoint(ctx, { name: `ssanne-stop-${stamp}`, dir: saves, base, prefix, evidence, movementOptions: { recovery: true },
        provenance: { origin: entry, job: "tools/playtest/smoke/ssanne-progress.job.mjs", stop: evidence.error.slice(0, 500) } });
    } catch (stopError) { evidence.checkpointError = String(stopError); }
    persist(); throw error;
  }
}
