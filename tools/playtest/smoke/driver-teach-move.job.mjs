// H.teachMove through the real menus (START > BAG > TM Case > HM01 > USE > party > "forget a move?" > summary), from the
// S.S. Anne checkpoint (HM01 in the TM Case; Ivysaur knows four moves). Controls: refusals that must not touch the game.
// Asserts: Cut replaces exactly the requested slot, the other three moves and the other member are unchanged, the HM is kept, field free.
import { loadCheckpointPath } from "../checkpoint-entry.mjs";
export default async function(ctx) {
  await loadCheckpointPath(ctx, "tools/playtest/saves/ssanne-hm01-20261008193359.json", process.env.PW_BASE ?? "http://localhost:5197/");
  const result = await ctx.runEval(`
    const C = H.C, party = () => frDebug.save.save.party.map(m => ({ moves: [...m.moves], hp: m.hp, level: m.level }));
    const p0 = party(), hm0 = H.countItem(C.ITEM_HM01), out = {};
    out.noSlot = await H.teachMove(C.ITEM_HM01, 1);                       // four moves: needs a slot to forget
    out.badTarget = await H.teachMove(C.ITEM_HM01, 5, { forgetSlot: 0 });  // empty party slot
    out.notOwned = await H.teachMove(C.ITEM_HM02, 1, { forgetSlot: 0 });   // HM02 not in the case
    for (const k of ["noSlot", "badTarget", "notOwned"]) if (out[k].ok || out[k].status !== "blocked") throw new Error(k + " should be blocked: " + JSON.stringify(out[k]).slice(0, 300));
    if (JSON.stringify(party()) !== JSON.stringify(p0) || !H.fieldFree()) throw new Error("refusals changed the game");
    const r = await H.teachMove(C.ITEM_HM01, 1, { forgetSlot: 1 });
    if (!r.ok) throw new Error("teach failed: " + JSON.stringify({ note: r.note, driver: r.driver }).slice(0, 800));
    const p1 = party();
    if (JSON.stringify(p1[0]) !== JSON.stringify(p0[0])) throw new Error("other member changed");
    const want = [...p0[1].moves]; want[1] = C.MOVE_CUT;
    if (JSON.stringify(p1[1].moves) !== JSON.stringify(want)) throw new Error("moves " + JSON.stringify(p1[1].moves) + " != " + JSON.stringify(want));
    if (H.countItem(C.ITEM_HM01) !== hm0) throw new Error("HM01 was consumed");
    if (!H.fieldFree()) throw new Error("field not free after teaching");
    const again = await H.teachMove(C.ITEM_HM01, 1, { forgetSlot: 0 });
    if (again.ok || again.reason !== "already-known") throw new Error("second teach should be refused: " + JSON.stringify(again).slice(0, 300));
    return { moves: p1[1].moves, hm: hm0 };`);
  if (ctx.errors().length) throw new Error(ctx.errors().join("; "));
  return result;
}
