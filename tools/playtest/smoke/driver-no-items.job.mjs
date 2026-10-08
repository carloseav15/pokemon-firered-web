// Policy option "noItems" applies to every driver route (driver/policy.js): the field preparation (prepareStep),
// H.useItem itself, and the battle decisions including the injured-reserve recovery (recoverReplacement), which used to
// ignore the option. PREPARED input on the mtmoon-1f checkpoint (bag, PP and HP values); each case has a control with
// items allowed that must use a Potion, so the zero-use result for noItems cannot come from an unreachable setup.
const prep = (extra) => `
  const C = H.C, sv = frDebug.save.save;
  sv.bag.items = [{ item: C.ITEM_POTION, quantity: 5 }]; // PREPARED
  ${extra}
`;
export default async function run(ctx) {
  const out = {};
  // Field: lead at ~30% HP with Potions in the bag.
  for (const noItems of [false, true]) {
    await ctx.loadSave("mtmoon-1f");
    out["field-" + (noItems ? "noItems" : "control")] = await ctx.runEval(prep(`
      sv.party[0].hp = Math.ceil(sv.party[0].stats[0] * 0.3); // PREPARED
      H.policy.set({ noItems: ${noItems} });
      const p0 = H.countItem(C.ITEM_POTION);
      const prepared = await H.prepareStep();
      const direct = await H.useItem(C.ITEM_POTION, 0);
      return { potions: [p0, H.countItem(C.ITEM_POTION)], prepared: { ok: prepared.ok, note: prepared.note ?? null }, direct: { ok: direct.ok, reason: direct.reason ?? null } };`));
  }
  // Battle: the lead has no PP; the second member is hurt and a Potion would make it a usable reserve.
  for (const noItems of [false, true]) {
    await ctx.loadSave("mtmoon-1f");
    out["battle-" + (noItems ? "noItems" : "control")] = await ctx.runEval(prep(`
      sv.party[0].pp = [0, 0, 0, 0]; // PREPARED
      const r = sv.party[1]; r.hp = Math.max(1, Math.ceil(0.6 * r.stats[0]) - 20); // PREPARED
      H.policy.set({ noItems: ${noItems} });
      const p0 = H.countItem(C.ITEM_POTION);
      for (let i = 0; i < 300 && !H.inBattle(); i++) await H.walk(i % 2 ? "D" : "U", 1);
      if (!H.inBattle()) throw new Error("no encounter");
      const b = await H.battle("auto", 0, 3000);
      const actions = b.trace.map(t => t.action);
      return { potions: [p0, H.countItem(C.ITEM_POTION)], actions, stop: b.stop, outcome: b.outcome };`));
  }
  const f = out["field-control"], fn = out["field-noItems"], bc = out["battle-control"], bn = out["battle-noItems"];
  if (!(f.potions[1] < f.potions[0])) throw new Error("field control did not use a Potion: " + JSON.stringify(f));
  if (fn.potions[0] !== fn.potions[1] || fn.prepared.ok || !/return to center/.test(fn.prepared.note) || fn.direct.ok || fn.direct.reason !== "items-disabled")
    throw new Error("field noItems used or allowed items: " + JSON.stringify(fn));
  if (!bc.actions.includes("item") || !(bc.potions[1] < bc.potions[0])) throw new Error("battle control did not recover the reserve with a Potion: " + JSON.stringify(bc));
  if (bn.actions.includes("item") || bn.potions[0] !== bn.potions[1]) throw new Error("battle noItems used an item: " + JSON.stringify(bn));
  if (ctx.errors().length) throw new Error(ctx.errors().join("; "));
  return out;
}
