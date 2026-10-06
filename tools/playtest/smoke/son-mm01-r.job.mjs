import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { prelude } from "./lib.mjs";

// SON-MM01-R: Mt. Moon bounded route from mtmoon-prepared (Route 4 Center, nurse-healed, 8 Potions/3 Antidotes).
// Route (decomp map.json/scripts.inc):
//   Route4 warp(19,5) -> 1F(18,37); 1F warp(5,6) -> B1F(3,3); B1F warp(22,18) -> B2F(25,21);
//   B2F coord event (14,11) MtMoon_B2F_EventScript_MiguelTrigger; Dome Fossil object (13,7);
//   B2F warp(5,10) -> B1F(39,4); B1F warp(45,4) -> Route4(32,5); Route4 east connection -> Cerulean City.
// No Pokemon, items, money, flags or battle results are written by code. Battles use H.battle("auto").
// Each step stops at the first unexpected note (no path, resources, lost battle...) and keeps evidence; it never retries.
const SAVE_KEY = "pokemon-gba-web-lab.firered.v2";
const out = process.env.SON_MM_OUT ?? "/tmp/pw/son-mm01r";

const helpers = `
  window.__logMark ??= 0;
  const S = await H.mod("/src/fr/save.ts"), C = H.C;
  const flag = (n) => S.FlagGet(C[n]);
  const status = () => ({
    st: { map: H.st().map, x: H.st().x, y: H.st().y, free: H.fieldFree() },
    res: H.resources(),
    miguel: S.FlagGet(C.TRAINER_FLAGS_START + C.TRAINER_SUPER_NERD_MIGUEL), scene: S.VarGet(C.VAR_MAP_SCENE_MT_MOON_B2F),
    gotDome: flag("FLAG_GOT_DOME_FOSSIL"), gotHelix: flag("FLAG_GOT_HELIX_FOSSIL"), gotMoon: flag("FLAG_GOT_FOSSIL_FROM_MT_MOON"),
    hideDome: flag("FLAG_HIDE_DOME_FOSSIL"), hideHelix: flag("FLAG_HIDE_HELIX_FOSSIL"),
    domeItem: bagCount(C.ITEM_DOME_FOSSIL), helixItem: bagCount(C.ITEM_HELIX_FOSSIL),
  });
  const newBattles = () => { const l = H.log.slice(window.__logMark); window.__logMark = H.log.length;
    return l.map(b => b.battle ? { mode: b.battle, start: b.start, end: b.end, outcome: b.outcome, stop: b.stop, stuck: b.stuck, decisions: b.decisions, n: b.n, trace: (b.trace ?? []).slice(0, 60) } : b.medicine ? { medicine: { item: b.medicine.item, target: b.medicine.target, ok: b.medicine.ok } } : { other: Object.keys(b) }); };
  // Own walking loop = H.goto plus a supply check; retreat mode (recovery) skips the policy checks.
  const lowSupplies = () => { if (flag("FLAG_GOT_FOSSIL_FROM_MT_MOON")) return null; const r = H.resources(); const m = r.party.find(m => m.attackPP < 5); return m ? "attack PP low in slot " + m.slot + " (" + m.attackPP + ")" : null; };
  const walk = async (x, y, opts = {}) => {
    const map0 = H.st().map;
    for (let g = 0; g < 1500; g++) {
      if (H.inBattle()) { const b = await H.battle("auto", 0); const n = H.battleStop(b); if (n) return { ...H.st(), note: n, battleResult: b }; continue; }
      const s = H.st();
      if (s.map !== map0) return { ...s, note: "map changed" };
      if (!H.fieldFree()) { const r = await H.idle(4000); if (r.timeout) return { ...r, note: "script stuck" }; continue; }
      if (s.x === x && s.y === y) return s;
      if (!opts.recovery) {
        const h = await H.prepareStep(); if (!h.ok) return { ...H.st(), note: h.note, resources: h.resources };
        const low = lowSupplies(); if (low) return { ...H.st(), note: "return to center: " + low };
      }
      const steps = H.bfs(x + 7, y + 7);
      if (!steps) return { ...s, note: "no path" };
      if (!steps.length) return s;
      await frDebug.walk(steps[0], 1);
    }
    return { ...H.st(), note: "guard" };
  };
  const warpLeg = async (x, y, opts = {}) => {
    const map0 = H.st().map;
    let r = await walk(x, y, opts);
    if (r.note && r.note !== "map changed") return r;
    if (H.st().map === map0 && !r.note) {
      for (const d of ["U", "D", "L", "R"]) { r = await H.exit(d, 1, opts); if (r.note && r.note !== "no exit") return r; if (H.st().map !== map0) break; }
    }
    await H.idle(600, false);
    return H.st();
  };
  // Shared helper observes the offer and verifies HP/PP/status and identities.
  const nurse = async () => {
    const r = await H.heal({ leave: false });
    if (!r.ok) return { ...r, note: r.note ?? "nurse failed" };
    window.__nurseRuns = (window.__nurseRuns ?? 0) + 1;
    return r;
  };
  const step = async () => {
    const s = H.st(), m = s.map, f = status(), retreat = !!window.__retreat;
    const east = s.x >= 30;
    let action, r = null;
    const opt = retreat ? { recovery: true } : {};
    if (m === "MAP_CERULEAN_CITY") return { action: "arrived", ...f };
    if (m === "MAP_ROUTE4_POKEMON_CENTER_1F") {
      if (retreat) { action = "nurse"; r = await nurse(); if (!r.note) { window.__retreat = false; r = null; } }
      else action = "leave center";
      if (!r) { const a = await walk(7, 7, { recovery: true }); r = a.note ? a : await H.exit("D", 3, { recovery: true }); }
    } else if (m === "MAP_ROUTE4") {
      if (f.gotMoon) {
        action = "route4 east -> Cerulean";
        // Pick the target from live reachability (collision + ledges, as the driver's BFS): the east edge if reachable,
        // otherwise the reachable tile farthest east. Reports the best tiles so a dead end is documented, not guessed.
        const cand = [];
        for (let x = 107; x >= 60; x--) { for (const y of [4, 3, 6, 7, 8, 10, 11, 12, 13, 5, 9, 14, 15, 16, 17, 2]) { if (H.bfs(x + 7, y + 7) !== null) cand.push([x, y]); } if (cand.length && x < 107 - 1 && cand.length > 0) break; }
        window.__reach = cand.slice(0, 12);
        if (!cand.length) r = { ...H.st(), note: "no reachable tile at x>=60" };
        else { const [tx, ty] = cand[0]; r = await walk(tx, ty, opt); if (!r.note && tx === 107) r = await H.exit("R", 4, opt); else if (!r.note) r = { ...H.st(), note: "farthest reachable east tile is (" + tx + "," + ty + "), not the Cerulean edge" }; }
      }
      else if (retreat) { action = "route4 -> center"; r = await walk(12, 6, opt); if (!r.note) r = await H.exit("U", 1, opt); }
      else { action = "route4 -> 1F"; r = await walk(19, 6, opt); if (!r.note) r = await H.exit("U", 1, opt); }
    } else if (m === "MAP_MT_MOON_1F") {
      if (retreat) { action = "1F -> route4"; r = await walk(18, 37, opt); if (!r.note) r = await H.exit("D", 2, opt); }
      else { action = "1F -> B1F"; r = await warpLeg(5, 6, opt); }
    } else if (m === "MAP_MT_MOON_B1F") {
      if (f.gotMoon) { action = "B1F east exit"; r = await warpLeg(45, 4, opt); }
      else if (retreat) { action = "B1F -> 1F"; r = await warpLeg(3, 3, opt); }
      else { action = "B1F -> B2F"; r = await warpLeg(22, 18, opt); }
    } else if (m === "MAP_MT_MOON_B2F") {
      if (f.gotMoon) { action = "B2F -> B1F east part"; r = await warpLeg(5, 10, opt); }
      else if (retreat) { action = "B2F -> B1F west part"; r = await warpLeg(25, 21, opt); }
      else if (!f.miguel) { action = "Miguel trigger (14,11)"; r = await walk(14, 11, opt); if (!r.note) { await H.idle(4000, true); r = null; } }
      else { action = "Dome Fossil (13,7)"; r = await H.talk(13, 7); if (!r?.note) { await H.idle(5000, true); r = null; } }
    } else { return { action: "unknown map", bad: "unexpected map " + m, ...f }; }
    let note = r?.note && r.note !== "map changed" ? r.note : null, bad = null;
    if (note && /^return to center/.test(note) && !f.gotMoon && !retreat) { window.__retreat = true; window.__retreats = (window.__retreats ?? 0) + 1; note = null; action += " [retreat start: " + r.note + "]"; }
    else if (note) bad = note;
    const f2 = status();
    const rec = { action, bad, note: r?.note ?? null, retreat: !!window.__retreat, retreats: window.__retreats ?? 0, battleResult: r?.battleResult ? { stop: r.battleResult.stop, outcome: r.battleResult.outcome } : undefined, ...f2, battles: newBattles() };
    if (bad) rec.stuck = { tasks: names(), cb2: H.cb2(), cb1: H.R.gMain.callback1?.name, controller: H.G.gBattlerControllerFuncs[0]?.name, inBattle: H.inBattle(), player: H.st(), objects: H.objects() };
    return rec;
  };
  window.__step = step; window.__status = status;
`;

export default async function run(ctx) {
  mkdirSync(out, { recursive: true });
  const prepared = JSON.parse(readFileSync("tools/playtest/saves/mtmoon-prepared.json", "utf8"));
  const evidence = { entry: { sha256: createHash("sha256").update(readFileSync("tools/playtest/saves/mtmoon-prepared.json")).digest("hex"), money: prepared.money,
    bag: prepared.bag.items, party: prepared.party.filter(m => m.species).map(m => [m.species, m.level, m.hp, [...m.moves], [...m.pp]]), saved: prepared.gameStats[0] }, legs: [] };
  await ctx.loadSave("mtmoon-prepared");
  // loadSave only waits for a map: the recorded Quest Log plays back first. Wait for its end and free control.
  evidence.entryWait = await ctx.runEval(`${prelude}
    const Q = await H.mod("/src/fr/questLogEvents.ts");
    const playback = () => Q.gQuestLogState === H.C.QL_STATE_PLAYBACK || Q.gQuestLogState === H.C.QL_STATE_PLAYBACK_LAST;
    const observed = []; let f = 0;
    for (; f < 24000; f += 20) { if (!observed.includes(Q.gQuestLogState)) observed.push(Q.gQuestLogState); if (f > 0 && !playback() && H.fieldFree()) break; await frDebug.wait(20); }
    if (playback() || !H.fieldFree()) throw new Error("entry Quest Log did not finish: " + JSON.stringify({ observed, st: H.st() }));
    return { observed, frames: f, st: H.st() };`);
  const initial = evidence.entryWait.st;
  if (initial.map !== "MAP_ROUTE4_POKEMON_CENTER_1F" || initial.x !== 7 || initial.y !== 5) throw new Error(`wrong entry: ${JSON.stringify(initial)}`);
  evidence.entryCheck = await ctx.runEval(`${prelude}${helpers}
    H.battleDefaults = { mode: "auto", slot: 0 };
    window.__logMark = H.log.length;
    const e = ${JSON.stringify(evidence.entry)};
    const live = H.resources();
    const liveParty = live.party.map(m => [m.species, m.level, m.hp, m.moves, m.pp]);
    if (JSON.stringify(liveParty) !== JSON.stringify(e.party) || live.money !== e.money || JSON.stringify(live.items) !== JSON.stringify(e.bag)) throw new Error("entry differs from file: " + JSON.stringify({ live, e }));
    if (live.party.some(m => m.hp !== m.maxHP || m.status)) throw new Error("entry team not healthy");
    if (bagCount(C.ITEM_POTION) < 8 || bagCount(C.ITEM_ANTIDOTE) < 3) throw new Error("entry provision missing");
    if (flag("FLAG_GOT_DOME_FOSSIL") || flag("FLAG_GOT_FOSSIL_FROM_MT_MOON") || bagCount(C.ITEM_DOME_FOSSIL)) throw new Error("fossil already obtained at entry");
    return { savedCounter: sv.gameStats[C.GAME_STAT_SAVED_GAME], ...status() };`);

  // ---- helpers for the checkpoint flow (also used when the route stops) ----
  const base = process.env.PW_BASE ?? "http://localhost:5173/";
  const errors = [];
  ctx.page.on("pageerror", e => errors.push(String(e).slice(0, 400)));
  const saveByMenu = () => ctx.runEval(`${prelude}${helpers}
    const SAVED = C.GAME_STAT_SAVED_GAME, KEY = ${JSON.stringify(SAVE_KEY)};
    if (H.inBattle() || !H.fieldFree()) throw new Error("cannot SAVE: battle or field not free");
    const snap = () => ({ st: { map: H.st().map, x: H.st().x, y: H.st().y }, money: sv.money,
      party: sv.party.filter(p => p.species).map(p => [p.species, p.personality, p.otId, p.level, p.hp, [...p.moves], [...p.pp], p.status]),
      bag: JSON.parse(JSON.stringify(sv.bag)), heal: sv.lastHealLocation, escape: sv.escapeWarp });
    const pre = snap(), savedBefore = sv.gameStats[SAVED], rawBefore = localStorage.getItem(KEY);
    await frDebug.wait(90);
    await openStart(4); // POKEDEX, POKEMON, BAG, PLAYER, SAVE
    for (let i = 0; i < 14 && sv.gameStats[SAVED] === savedBefore; i++) { await frDebug.wait(150); await tap("A", 30); }
    await frDebug.wait(200);
    const written = { counter: sv.gameStats[SAVED], changed: localStorage.getItem(KEY) !== rawBefore };
    await until(() => H.fieldFree(), "A", 120);
    const post = snap(), raw = localStorage.getItem(KEY);
    if (written.counter !== savedBefore + 1 || !written.changed || !raw) throw new Error("SAVE did not update counter/localStorage: " + JSON.stringify({ savedBefore, written }));
    if (JSON.stringify(pre) !== JSON.stringify(post)) throw new Error("state changed while saving");
    return { savedBefore, savedAfter: written.counter, rawLength: raw.length, pre, post, flags: status() };`);
  const reloadCompare = async (save, raw, expectMap, back) => {
    await ctx.page.goto(`${base}?fr=continue`, { waitUntil: "load" });
    await ctx.page.waitForTimeout(2000);
    const c = await ctx.page.evaluate(`(async () => {
      try {
        const { H } = await import("/tools/playtest/driver.js"); window.H = H; await H.ready(600);
        const Q = await H.mod("/src/fr/questLogEvents.ts");
        const playback = () => Q.gQuestLogState === H.C.QL_STATE_PLAYBACK || Q.gQuestLogState === H.C.QL_STATE_PLAYBACK_LAST;
        const observed = []; let frames = 0;
        for (; frames < 24000; frames += 20) {
          if (!observed.includes(Q.gQuestLogState)) observed.push(Q.gQuestLogState);
          if (frames > 0 && !playback() && H.fieldFree()) break;
          await frDebug.wait(20);
        }
        const finished = !playback() && H.fieldFree();
        const sv = frDebug.save.save;
        return { ok: finished, error: finished ? null : "Quest Log playback/control did not finish within " + frames + " frames", observed, frames,
          st: { map: H.st().map, x: H.st().x, y: H.st().y }, money: sv.money,
          party: sv.party.filter(p => p.species).map(p => [p.species, p.personality, p.otId, p.level, p.hp, [...p.moves], [...p.pp], p.status]),
          bag: JSON.parse(JSON.stringify(sv.bag)), heal: sv.lastHealLocation, escape: sv.escapeWarp, saved: sv.gameStats[H.C.GAME_STAT_SAVED_GAME], free: H.fieldFree() };
      } catch (e) { return { ok: false, error: String(e?.stack ?? e).slice(0, 500) }; } })()`);
    const r = { continue: c, errors: [...errors] };
    if (!c.ok || errors.length) throw new Error(`FAIL at continue: ${c.error ?? "page errors"}; ${errors[0] ?? ""}`);
    const pre = save.post;
    const wanted = { st: pre.st, money: pre.money, party: pre.party, bag: pre.bag, heal: pre.heal, escape: pre.escape, saved: save.savedAfter };
    const actual = { st: c.st, money: c.money, party: c.party, bag: c.bag, heal: c.heal, escape: c.escape, saved: c.saved };
    if (JSON.stringify(wanted) !== JSON.stringify(actual)) throw new Error("continued state differs from the saved state: " + JSON.stringify({ wanted, actual }));
    r.afterContinue = await ctx.runEval(`${prelude}${helpers} return status();`);
    const a = r.afterContinue;
    if (!(a.gotDome === save.flags.gotDome && a.gotMoon === save.flags.gotMoon && a.domeItem === save.flags.domeItem && a.miguel === save.flags.miguel && a.st.map === expectMap)) throw new Error("persistence lost flags/map: " + JSON.stringify(a));
    if ((await ctx.runEval(`return localStorage.getItem(${JSON.stringify(SAVE_KEY)});`)) !== raw) throw new Error("continue rewrote the persisted bytes");
    // A free-control boolean alone does not establish restored movement: walk back to the tile traversed before SAVE.
    r.continueMovement = await ctx.runEval(`
      const target = ${JSON.stringify(back)};
      const before = H.st(), r = await H.goto(target.x, target.y);
      if (r.note || r.map !== ${JSON.stringify(expectMap)} || r.x !== target.x || r.y !== target.y || !H.fieldFree()) throw new Error("continue movement failed: " + JSON.stringify(r));
      return { before: { map: before.map, x: before.x, y: before.y }, after: { map: r.map, x: r.x, y: r.y } };`);
    if (ctx.errors().length) throw new Error("browser errors: " + ctx.errors().join("; "));
    return r;
  };
  // Real step on the field (any neighbouring tile) so a restored game can be shown to move.
  const probeMove = () => ctx.runEval(`${prelude}${helpers}
    const b = H.st();
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (H.bfs(b.x + dx + 7, b.y + dy + 7) === null) continue;
      const r = await H.goto(b.x + dx, b.y + dy);
      if (!r.note && r.x === b.x + dx && r.y === b.y + dy) return { before: { x: b.x, y: b.y }, after: { x: r.x, y: r.y }, ...status() };
    }
    throw new Error("no real movement possible");`);
  const exportCheckpoint = (name, raw, sha, evidenceKey, extra) => {
    writeFileSync(`tools/playtest/saves/${name}.json`, raw);
    writeFileSync(`tools/playtest/saves/${name}.provenance.json`, JSON.stringify({
      origin: "tools/playtest/saves/mtmoon-prepared.json", originSha256: evidence.entry.sha256, job: "tools/playtest/smoke/son-mm01-r.job.mjs",
      sha256: sha, bytes: raw.length, gameStatSavedGame: evidence[evidenceKey].savedAfter, aids: "none: no Pokemon/items/money/flags written by code; auto battle policy", ...extra,
    }, null, 1) + "\n");
  };

  // State machine: each iteration is one navigation step decided from map + progress flags (no fixed teleports).
  // Policy: retreat to the Center (recovery:true, nurse by UI) when supplies run low before the fossil;
  // on any other note, lost battle or exhausted trainer battle the route STOPS, but if the field is free the
  // game is saved by menu, reloaded and verified so the progress survives (exported as an intermediate checkpoint).
  let last = null, same = 0, stopError = null;
  try {
    for (let i = 0; i < 70; i++) {
      const r = await ctx.runEval(`${prelude}${helpers}
        H.battleDefaults = { mode: "auto", slot: 0 };
        return await window.__step();`);
      evidence.legs.push(r);
      writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 1));
      if (r.bad) throw new Error(`STOP at "${r.action}": ${r.bad}; map ${r.st.map} (${r.st.x},${r.st.y}); party ${JSON.stringify(r.res.party.map(m => [m.species, m.level, m.hp + "/" + m.maxHP, m.pp]))}`);
      if (r.action === "arrived") break;
      const key = JSON.stringify([r.action, r.st, r.res.party.map(m => m.hp)]);
      same = key === last ? same + 1 : 0; last = key;
      if (same >= 2) throw new Error(`no progress at "${r.action}" ${JSON.stringify(r.st)}`);
      if (r.retreats > 4) throw new Error(`more than 4 retreats`);
    }
    const fin = evidence.legs.at(-1);
    if (fin.action !== "arrived") throw new Error(`did not reach Cerulean in 70 steps`);
    if (!(fin.miguel && fin.scene === 1 && fin.domeItem === 1 && fin.gotDome && fin.gotMoon && !fin.gotHelix && fin.helixItem === 0 && fin.hideDome && fin.hideHelix && fin.st.free))
      throw new Error(`final flags wrong: ${JSON.stringify({ miguel: fin.miguel, scene: fin.scene, dome: fin.domeItem, gotDome: fin.gotDome, gotMoon: fin.gotMoon, helix: fin.gotHelix, hide: [fin.hideDome, fin.hideHelix] })}`);
  } catch (e) { stopError = e; }

  if (stopError) {
    // Intermediate checkpoint: only the game's own menu SAVE; never named cerulean-arrival, never a PASS.
    evidence.reach = await ctx.runEval(`return window.__reach ?? null;`).catch(() => null);
    evidence.stop = { message: String(stopError.message), checkpoint: null };
    try {
      evidence.stop.move = await probeMove();
      evidence.stopSave = await saveByMenu();
      const rawStop = await ctx.runEval(`return localStorage.getItem(${JSON.stringify(SAVE_KEY)});`);
      writeFileSync(`${out}/written-save-stop.json`, rawStop);
      const expectMap = evidence.stopSave.post.st.map;
      const rc = await reloadCompare(evidence.stopSave, rawStop, expectMap, evidence.stop.move.before);
      Object.assign(evidence.stop, { reloaded: rc });
      const sha = createHash("sha256").update(rawStop).digest("hex");
      evidence.stop.sha256 = sha; evidence.stop.checkpoint = "tools/playtest/saves/mtmoon-route-checkpoint.json";
      if (process.env.SON_MM_EXPORT !== "0") exportCheckpoint("mtmoon-route-checkpoint", rawStop, sha, "stopSave", { kind: "INTERMEDIATE checkpoint at a route stop (not Cerulean arrival, route not PASS)", stopReason: String(stopError.message).slice(0, 300), flags: evidence.stopSave.flags });
    } catch (e2) { evidence.stop.saveError = String(e2.message ?? e2).slice(0, 500); }
    writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 1));
    throw new Error(`${stopError.message}; checkpoint: ${evidence.stop.checkpoint ?? "NOT saved (" + (evidence.stop.saveError ?? "?") + ")"}; evidence in ${out}`);
  }

  // ---- Cerulean: real movement, menu SAVE, reload, compare, export ----
  evidence.freeControl = await probeMove();
  evidence.save = await saveByMenu();
  const raw = await ctx.runEval(`return localStorage.getItem(${JSON.stringify(SAVE_KEY)});`);
  writeFileSync(`${out}/written-save.json`, raw);
  evidence.writtenBytes = raw.length;
  const rc = await reloadCompare(evidence.save, raw, "MAP_CERULEAN_CITY", evidence.freeControl.before);
  Object.assign(evidence, rc);
  await ctx.shot("son-mm01r-continue");
  const a = evidence.afterContinue;
  if (!(a.gotDome && a.gotMoon && a.domeItem === 1 && a.miguel)) throw new Error("persistence lost fossil/Miguel: " + JSON.stringify(a));
  const sha = createHash("sha256").update(raw).digest("hex");
  evidence.writtenSha256 = sha;
  if (process.env.SON_MM_EXPORT !== "0")
    exportCheckpoint("cerulean-arrival", raw, sha, "save", { method: "walk Route4 -> Mt. Moon 1F/B1F/B2F, Miguel battle, Dome Fossil by dialogue, B2F(5,10) -> B1F(45,4) -> Route4(32,5) -> Cerulean; START>SAVE; bytes copied from localStorage" });
  writeFileSync(`${out}/evidence.json`, JSON.stringify(evidence, null, 1));
  return { legs: evidence.legs.map(l => [l.action, l.st.map, l.st.x, l.st.y, l.battles.length]), sha, saved: evidence.save.savedAfter };
}
