// Vermilion: teach HM01 Cut through the TM Case, cut the tree in front of the gym, open the electric locks by searching
// the trash cans (15 cans, first switch random, second one adjacent; a wrong second guess resets), beat Lt. Surge.
// Data: pokefirered/data/maps/{VermilionCity,VermilionCity_Gym}/map.json, VermilionCity_Gym/scripts.inc, field_specials.c
// SetVermilionTrashCans (second switch = a grid neighbour of the first in a 3x5 grid), data/scripts/field_moves.inc EventScript_CutTree.
// Importing an existing checkpoint prepares the entry, not its historical provenance.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadCheckpointPath } from "../checkpoint-entry.mjs";
import { prelude } from "./lib.mjs";
import { routeHelpers, runJob, stopCheckpoint, writeEvidence } from "./route2-lib.mjs";
import { warpHelpers } from "./warp-lib.mjs";

const surgeHelpers = `
  const GS = { flags: () => ({ badge: flag("FLAG_BADGE03_GET"), defeated: flag("FLAG_DEFEATED_LT_SURGE"), tm34Flag: flag("FLAG_GOT_TM34_FROM_SURGE"),
    tm34: bagCount(C.ITEM_TM34), surge: trainer("TRAINER_LEADER_LT_SURGE"), switches: flag("FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES"),
    firstSwitch: flag("FLAG_TEMP_1"), cut: H.dbgParty().some(m => m.moves.includes(C.MOVE_CUT)), hm01: bagCount(C.ITEM_HM01) }) };
  const snap = () => ({ status: status(), gs: GS.flags() });
  const reachedSurge = () => { const f = GS.flags(); return f.badge && f.defeated && f.surge && f.tm34Flag && f.tm34 >= 1; };
  ${warpHelpers}
  window.__alsoArrived = () => false;
  // 15 cans in a 3x5 grid, ids 1..15 row by row (VermilionCity_Gym map.json bg events at x=1,3,..,9 / y=10,12,14).
  const CAN = (id) => [1 + 2 * ((id - 1) % 5), 10 + 2 * Math.floor((id - 1) / 5)];
  const NEIGHBOURS = (id) => { const r = Math.floor((id - 1) / 5), c = (id - 1) % 5, out = [];
    if (c > 0) out.push(id - 1); if (c < 4) out.push(id + 1); if (r > 0) out.push(id - 5); if (r < 2) out.push(id + 5); return out; };
  window.__cans ??= { next: 1, first: null, queue: [], log: [] };
  const talkCan = async (id) => { const [x, y] = CAN(id); return talkSettle(x, y); };
  window.__surgeStep = async () => {
    const m = H.st().map, f = GS.flags(), opts = {};
    window.__from = m;
    let action, r, extra;
    if (m === "MAP_VERMILION_CITY") {
      if (reachedSurge()) return { action: "done", done: true, ...snap() };
      if (!f.cut) {
        const slot = H.dbgParty().findIndex(p => p.species === 2);
        const growl = slot < 0 ? -1 : H.dbgParty()[slot].moves.indexOf(C.MOVE_GROWL);
        if (slot < 0 || growl < 0) return { action: "teach Cut", bad: "no Ivysaur with Growl to replace", ...snap() };
        action = "teach HM01 Cut to slot " + slot + " (forget Growl)";
        r = noted(await H.teachMove(C.ITEM_HM01, slot, { forgetSlot: growl })); extra = { teach: r.moves };
      } else if (H.bfs(14 + 7, 26 + 7) === null) {
        action = "cut the tree (19,24)"; r = await talkYes(19, 24);
      } else { action = "city -> gym door (14,25)"; r = await takeWarp(14, 25, "MAP_VERMILION_CITY_GYM", opts); }
    } else if (m === "MAP_VERMILION_CITY_GYM") {
      if (reachedSurge()) {
        const mat = frGame.overworld.loaded.header.warps.find(w => w.destMap === "MAP_VERMILION_CITY" && frGame.overworld.map.behaviorAt(w.x + 7, w.y + 7) === C.MB_SOUTH_ARROW_WARP);
        action = "gym -> city"; r = mat ? await takeWarp(mat.x, mat.y, "MAP_VERMILION_CITY", opts) : { ...H.st(), note: "no triggering gym warp" };
      } else if (!f.switches) {
        const cans = window.__cans;
        if (f.firstSwitch && cans.first === null) { cans.first = cans.last; cans.queue = NEIGHBOURS(cans.first); }
        if (!f.firstSwitch && cans.first !== null) { cans.first = null; cans.queue = []; }   // the locks were reset
        const id = cans.first !== null ? cans.queue.shift() : cans.next;
        if (id === undefined) return { action: "trash cans", bad: "no second-switch candidates left", cans, ...snap() };
        if (cans.first === null) cans.next = cans.next % 15 + 1;
        cans.last = id;
        action = "trash can " + id + (cans.first !== null ? " (second switch, first " + cans.first + ")" : " (first switch)");
        r = await talkCan(id); cans.log.push([id, flag("FLAG_TEMP_1"), flag("FLAG_FOUND_BOTH_VERMILION_GYM_SWITCHES")]);
        extra = { cans: { first: cans.first, log: cans.log.slice(-4) } };
      } else {
        action = "Lt. Surge (5,2)";
        if (!window.__assessed) { window.__assessed = await H.assessTrainer(C.TRAINER_LEADER_LT_SURGE);
          if (window.__assessed.verdict !== "favorable" && !window.__forceSurge) return { action, bad: "assessment " + window.__assessed.verdict, assessment: window.__assessed, ...snap() }; }
        r = await talkSettle(5, 2);
      }
    } else return { action: "unknown map", bad: "unexpected map " + m, ...snap() };
    const note = r?.note && r.note !== "map changed" ? r.note : null;
    return { action, bad: note, extra, assessment: window.__assessed ? { verdict: window.__assessed.verdict, hpLeft: window.__assessed.hpLeft } : undefined,
      battleResult: r?.battleResult ? { stop: r.battleResult.stop, outcome: r.battleResult.outcome } : undefined,
      ...snap(), battles: newBattles(), stuck: note ? { observe: H.observe(), objects: H.objects() } : undefined };
  };
`;

export default async function run(ctx) {
  const out = resolve(process.argv[3] ?? "tools/playtest/runs/surge");
  const base = process.env.PW_BASE ?? "http://localhost:5197/";
  const saves = join(out, "saves"), file = join(out, "evidence.json");
  mkdirSync(saves, { recursive: true });
  let entry = process.env.SURGE_ENTRY_PATH;
  if (!entry && existsSync(file)) {
    const prior = JSON.parse(readFileSync(file, "utf8"));
    entry = [...(prior.checkpoints ?? [])].reverse().find(cp => cp.verified?.continued)?.path;
  }
  entry ??= "tools/playtest/saves/ssanne-hm01-20261008193359.json";
  const evidence = { status: "running", entry, legs: [], checkpoints: [] };
  const prefix = prelude + routeHelpers + surgeHelpers;
  const persist = () => writeEvidence(out, evidence);
  persist();
  try {
    evidence.loaded = await loadCheckpointPath(ctx, entry, base);
    evidence.before = await ctx.runEval(`${prefix} return snap();`);
    if (evidence.before.gs.hm01 < 1 && !evidence.before.gs.cut) throw Error("entry lacks HM01 Cut");
    if (process.env.SURGE_FORCE) await ctx.runEval(`window.__forceSurge = true; return true;`);
    for (let i = 0; i < 120; i++) {
      const leg = await runJob(ctx, `return await window.__surgeStep();`, { prefix, maxFrames: 500000, timeoutMs: 280000 });
      evidence.legs.push(leg); persist();
      if (!leg || leg.ok === false || leg.bad) throw Error("Surge segment stopped: " + JSON.stringify(leg).slice(0, 1800));
      if (leg.done) break;
    }
    const end = await ctx.runEval(`${prefix} return snap();`);
    if (end.status.st.map !== "MAP_VERMILION_CITY" || !end.gs.badge || !end.gs.defeated || end.gs.tm34 < 1) throw Error("Surge milestones not reached: " + JSON.stringify(end.gs));
    evidence.healing = await ctx.runEval("return await H.healAtCenter();");
    if (!evidence.healing.ok) throw Error("healing failed: " + JSON.stringify(evidence.healing));
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    evidence.checkpoint = await stopCheckpoint(ctx, { name: `surge-badge-${stamp}`, dir: saves, base, prefix, evidence, movementOptions: { recovery: true },
      kind: "Lt. Surge defeated (Thunder Badge, TM34), Cut learnt and used; Rock Tunnel and later not tested",
      provenance: { origin: evidence.loaded.path, originSha256: evidence.loaded.sha256, job: "tools/playtest/smoke/surge-progress.job.mjs",
        aids: "imported entry only; HM teaching, tree, trash cans, battles and healing by UI" } });
    evidence.checkpoints.push(evidence.checkpoint);
    evidence.final = await ctx.runEval(`${prefix} return snap();`);
    if (!evidence.final.gs.badge || evidence.final.gs.tm34 < 1 || !evidence.final.status.st.free) throw Error("milestones lost after continue");
    if (ctx.errors().length) throw Error(ctx.errors().join("; "));
    evidence.status = "passed"; persist(); return evidence;
  } catch (error) {
    evidence.status = "blocked"; evidence.error = String(error.stack ?? error);
    try {
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      evidence.stopCheckpoint = await stopCheckpoint(ctx, { name: `surge-stop-${stamp}`, dir: saves, base, prefix, evidence, movementOptions: { recovery: true },
        provenance: { origin: entry, job: "tools/playtest/smoke/surge-progress.job.mjs", stop: evidence.error.slice(0, 500) } });
    } catch (stopError) { evidence.checkpointError = String(stopError); }
    persist(); throw error;
  }
}
