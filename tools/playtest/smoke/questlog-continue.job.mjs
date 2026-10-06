import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Load exact persisted bytes, not a prepared final state. QL_SAVE_PATH can point
// to a menu-written reproduction; the default fixture has no recorded scenes.
export default async function run(ctx) {
  const path = process.env.QL_SAVE_PATH ?? "tools/playtest/saves/pewter-pc.json";
  const raw = readFileSync(path, "utf8"), expected = JSON.parse(raw);
  const key = "pokemon-gba-web-lab.firered.v2";
  const base = process.env.PW_BASE ?? "http://localhost:5173/";
  await ctx.page.goto(base, { waitUntil: "load" });
  await ctx.page.evaluate(({ raw, key }) => localStorage.setItem(key, raw), { raw, key });
  await ctx.page.goto(`${base}?fr=continue`, { waitUntil: "load" });
  await ctx.page.waitForTimeout(1000);
  const result = await ctx.runEval(`
    const { H } = await import("/tools/playtest/driver.js"); window.H = H;
    await H.ready();
    const Q = await H.mod("/src/fr/questLogEvents.ts");
    const playback = () => Q.gQuestLogState === H.C.QL_STATE_PLAYBACK || Q.gQuestLogState === H.C.QL_STATE_PLAYBACK_LAST;
    const observed = [];
    for (let f = 0; f < 18000; f += 20) {
      if (!observed.includes(Q.gQuestLogState)) observed.push(Q.gQuestLogState);
      if (!playback() && H.fieldFree()) break;
      await frDebug.wait(20);
    }
    if (playback() || !H.fieldFree()) throw new Error("playback did not finish: " + JSON.stringify({observed, state:H.st()}));
    const sv = frDebug.save.save;
    const snapshot = { location: {mapGroup:sv.location.mapGroup,mapNum:sv.location.mapNum}, pos: {...sv.pos}, money: sv.money,
      party: sv.party.filter(m=>m.species).map(m=>({species:m.species,personality:m.personality,otId:m.otId,level:m.level,hp:m.hp,status:m.status,moves:[...m.moves],pp:[...m.pp],heldItem:m.heldItem})),
      bag: JSON.parse(JSON.stringify(sv.bag)), heal: sv.lastHealLocation, escape: sv.escapeWarp,
      saved: sv.gameStats[H.C.GAME_STAT_SAVED_GAME] };
    const st = H.st(), ow = window.frGame.overworld;
    if (st.map !== ow.mapIdForWarp(sv.location) || st.x !== sv.pos.x || st.y !== sv.pos.y) throw new Error("field does not match restored save");
    if (!ow.player.object?.active || ow.objects.objects[ow.player.objectEventId] !== ow.player.object) throw new Error("restored player is not registered");
    return { observed, snapshot, state:st, savedIndex:H.C.GAME_STAT_SAVED_GAME, storageUnchanged:localStorage.getItem(${JSON.stringify(key)})===${JSON.stringify(raw)} };
  `);
  if (expected.questLogScenes?.some(scene => scene.startType)
      && !result.observed.includes(2)) throw new Error("recorded scenes were not played");
  // Continue normalizes location warp metadata; map identity and saved pos must agree.
  const wanted = { location: {mapGroup:expected.location.mapGroup,mapNum:expected.location.mapNum}, pos: expected.pos, money: expected.money,
    party: expected.party.filter(m=>m.species).map(m=>({species:m.species,personality:m.personality,otId:m.otId,level:m.level,hp:m.hp,status:m.status,moves:m.moves,pp:m.pp,heldItem:m.heldItem})),
    bag: expected.bag, heal: expected.lastHealLocation, escape: expected.escapeWarp,
    saved: expected.gameStats[result.savedIndex] };
  if (JSON.stringify(result.snapshot) !== JSON.stringify(wanted)) throw new Error("continued state differs: " + JSON.stringify({wanted,actual:result.snapshot}));
  if (!result.storageUnchanged || ctx.errors().length) throw new Error("continue changed persisted bytes or raised browser errors: " + ctx.errors().join(";"));
  const moved = await ctx.runEval(`
    const before = H.st();
    const after = await H.goto(before.x, before.y + 1);
    if (after.note || after.x !== before.x || after.y !== before.y + 1) throw new Error("movement after continue failed: " + JSON.stringify(after));
    return {before,after};
  `);
  if (ctx.errors().length) throw new Error(ctx.errors().join(";"));
  return { moved, source:path, sha256:createHash("sha256").update(raw).digest("hex"), scenes:expected.questLogScenes?.length??0, ...result };
}
