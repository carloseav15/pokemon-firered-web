// PREPARED input: lead hurt (HP 12) with Potions in the bag, in a real wild battle at the action menu. battleDecision(incoming)
// must heal when the Potion restores more than the foe took last turn (incoming 5) and must not when it restores no more
// (incoming 25). Only the decision is asked; the battle is then left by running. No outcome or result is prepared.
export default async function(ctx) {
  await ctx.loadSave("route2-north");
  const result = await ctx.runEval(`
    const C = H.C, sv = frDebug.save.save;
    sv.party[0].hp = 12;
    const p = sv.bag.items.find(e => e.item === C.ITEM_POTION);
    if (p) p.quantity = 3; else sv.bag.items.push({ item: C.ITEM_POTION, quantity: 3 });
    for (let i = 0; i < 160 && !H.inBattle(); i++) await frDebug.walk(i % 2 ? "D" : "U", 1);
    if (!H.inBattle()) throw new Error("no encounter");
    if (!await H.until(() => H.G.gBattlerControllerFuncs[0]?.name === "HandleInputChooseAction", "A", 600)) throw new Error("no action menu");
    H.G.gBattleMons[0].hp = 12;
    const heal5 = H.battleDecision(5), heal25 = H.battleDecision(25), first = H.battleDecision(0);
    if (heal5.action !== "item" || heal5.item !== C.ITEM_POTION) throw new Error("incoming 5 should heal: " + JSON.stringify(heal5));
    if (first.action !== "item") throw new Error("incoming 0 should heal: " + JSON.stringify(first));
    if (heal25.action === "item") throw new Error("incoming 25 healed with a Potion (restores 20): " + JSON.stringify(heal25));
    const out = await H.battle("run", 0, 1000);
    return { heal5: heal5.action, heal25: heal25.action, first: first.action, left: !H.inBattle() || out.stuck === false };
  `);
  if (ctx.errors().length) throw new Error(ctx.errors().join("; "));
  return result;
}
