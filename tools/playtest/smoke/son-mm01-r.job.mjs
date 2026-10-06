import { readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { prelude } from "./lib.mjs";
import { helpers, runJob, stopCheckpoint, assertOk, writeEvidence } from "./son-mm-lib.mjs";

// SON-MM01-R / DRV-07: Mt. Moon bounded continuation toward Cerulean City, built on the DRV-03/05 driver API.
// Route (decomp map.json/scripts.inc):
//   Route4 warp(19,5) -> 1F(18,37); 1F warp(5,6) -> B1F(3,3); B1F warp(22,18) -> B2F(25,21);
//   B2F coord event (14,11) MtMoon_B2F_EventScript_MiguelTrigger; Dome Fossil object (13,7);
//   B2F warp(5,10) -> B1F(39,4); B1F warp(45,4) -> Route4(32,5); Route4 east connection -> Cerulean City.
// No Pokemon, items, money, flags or battle results are written by code. Battles use H.battle("auto").
//
// Entry: SON_MM_ENTRY (default mtmoon-prepared) = a name in tools/playtest/saves; the game is loaded by the normal
// continue path and H.ready() waits for real field control (Quest Log included). Entering is not a route result.
// Every step runs as an H.job with frame/time budgets. A driver failure, budget stop, lost battle or unexpected note
// STOPS the route; if the field is free the game is saved through START>SAVE, exported to a NEW path (never
// overwritten), recorded only after the export verified the bytes, reloaded and checked (stopCheckpoint).
// SON_MM_DRYRUN=1 performs entry + stop checkpoint immediately, without walking (used from the Center).
// The runner budget must cover the whole route: PW_TIMEOUT_MS=1800000.
const out = process.env.SON_MM_OUT ?? "/tmp/pw/son-mm01r";
const exportDir = process.env.SON_MM_EXPORT_DIR ?? "tools/playtest/saves";
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

export default async function run(ctx) {
  mkdirSync(out, { recursive: true });
  const entryName = process.env.SON_MM_ENTRY ?? "mtmoon-prepared";
  const entryPath = `tools/playtest/saves/${entryName}.json`;
  const entryBytes = readFileSync(entryPath), entry = JSON.parse(entryBytes.toString("utf8"));
  const base = process.env.PW_BASE ?? "http://localhost:5173/";
  const evidence = { entry: { name: entryName, sha256: createHash("sha256").update(entryBytes).digest("hex"), money: entry.money,
    bag: entry.bag.items, party: entry.party.filter(m => m.species).map(m => [m.species, m.level, m.hp, [...m.moves], [...m.pp]]), saved: entry.gameStats[0] }, legs: [], checkpoints: [] };

  evidence.entryReady = assertOk("entry ready", await ctx.loadSave(entryName));
  evidence.entryCheck = await ctx.runEval(`${prelude}${helpers}
    H.battleDefaults = { mode: "auto", slot: 0 };
    window.__logMark = H.log.length;
    const e = ${JSON.stringify(evidence.entry)};
    const live = H.resources();
    const liveParty = live.party.map(m => [m.species, m.level, m.hp, m.moves, m.pp]);
    if (JSON.stringify(liveParty) !== JSON.stringify(e.party) || live.money !== e.money || JSON.stringify(live.items) !== JSON.stringify(e.bag)) throw new Error("entry differs from file: " + JSON.stringify({ live, e }));
    return { savedCounter: sv.gameStats[C.GAME_STAT_SAVED_GAME], ...status() };`);
  writeEvidence(out, evidence);

  let stopError = null;
  try {
    if (process.env.SON_MM_DRYRUN === "1") throw new Error("DRYRUN: stop requested before walking");
    let last = null, same = 0;
    for (let i = 0; i < 70; i++) {
      const r = await runJob(ctx, `H.battleDefaults = { mode: "auto", slot: 0 }; return await window.__step();`, { prefix: `${prelude}${helpers}`, timeoutMs: 300000 }); // 110 s ended the Miguel step in a battle at 47k of 150k frames (attempt 3)
      if (r && r.ok === false) { evidence.legs.push({ action: "job", bad: r.reason ?? r.status, driver: r }); writeEvidence(out, evidence); throw new Error(`STOP: job ${r.reason ?? r.status}`); }
      evidence.legs.push(r);
      writeEvidence(out, evidence);
      if (r.bad) throw new Error(`STOP at "${r.action}": ${r.bad}; map ${r.st.map} (${r.st.x},${r.st.y}); party ${JSON.stringify(r.res.party.map(m => [m.species, m.level, m.hp + "/" + m.maxHP, m.pp]))}`);
      if (r.action === "arrived") break;
      const key = JSON.stringify([r.action, r.st, r.res.party.map(m => m.hp)]);
      same = key === last ? same + 1 : 0; last = key;
      if (same >= 2) throw new Error(`no progress at "${r.action}" ${JSON.stringify(r.st)}`);
      if (r.retreats > 4) throw new Error("more than 4 retreats");
    }
    const fin = evidence.legs.at(-1);
    if (fin.action !== "arrived") throw new Error("did not reach Cerulean in 70 steps");
    if (!(fin.miguel && fin.scene === 1 && fin.domeItem === 1 && fin.gotDome && fin.gotMoon && !fin.gotHelix && fin.helixItem === 0 && fin.hideDome && fin.hideHelix && fin.st.free))
      throw new Error(`final flags wrong: ${JSON.stringify({ miguel: fin.miguel, scene: fin.scene, dome: fin.domeItem, gotDome: fin.gotDome, gotMoon: fin.gotMoon, helix: fin.gotHelix, hide: [fin.hideDome, fin.hideHelix] })}`);
  } catch (e) { stopError = e; }

  const provenance = { origin: entryPath, originSha256: evidence.entry.sha256, job: "tools/playtest/smoke/son-mm01-r.job.mjs", aids: "none: no Pokemon/items/money/flags written by code; auto battle policy" };
  const prefix = `${prelude}${helpers}`;
  if (stopError) {
    // Intermediate checkpoint only through the game's own SAVE; its failure never hides the route stop.
    evidence.stop = { message: String(stopError.message), checkpoint: null };
    try {
      const cp = await stopCheckpoint(ctx, { name: `mtmoon-route-stop-${stamp}`, dir: exportDir, provenance: { ...provenance, stopReason: String(stopError.message).slice(0, 300) }, evidence, base, prefix });
      evidence.stop.checkpoint = cp.path;
    } catch (e2) { evidence.stop.checkpointError = String(e2.message ?? e2).slice(0, 500); evidence.stop.checkpointFailure = e2.result ?? null; }
    writeEvidence(out, evidence);
    throw new Error(`${stopError.message}; checkpoint: ${evidence.stop.checkpoint ?? "NOT exported (" + (evidence.stop.checkpointError ?? "?") + ")"}; evidence in ${out}`);
  }

  // Cerulean arrival: same flow, destination cerulean-arrival (exclusive: an existing file makes the job fail).
  const cp = await stopCheckpoint(ctx, { name: "cerulean-arrival", dir: exportDir, kind: "Cerulean arrival checkpoint", evidence, base, prefix,
    provenance: { ...provenance, method: "walk Route4 -> Mt. Moon 1F/B1F/B2F, Miguel battle, Dome Fossil by dialogue, B2F(5,10) -> B1F(45,4) -> Route4(32,5) -> Cerulean; START>SAVE" } });
  const a = await ctx.runEval(`${prelude}${helpers} return status();`);
  if (!(a.gotDome && a.gotMoon && a.domeItem === 1 && a.miguel && a.st.map === "MAP_CERULEAN_CITY")) throw new Error("persistence lost fossil/Miguel/map: " + JSON.stringify(a));
  evidence.afterContinue = a;
  writeEvidence(out, evidence);
  return { legs: evidence.legs.map(l => [l.action, l.st.map, l.st.x, l.st.y, l.battles.length]), checkpoint: cp };
}
