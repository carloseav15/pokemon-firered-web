// H.buyItem at the Cerulean Mart, from the route 2 entry (cerulean-arrival): walk to the Mart door (29,28) with the normal
// walker and buy 8 Potions through the clerk menu (Potion is the third list entry here; route 2 run 3 bought 13 Poke Balls
// with an earlier version). Asserts price*8 paid, +8 Potions, Poke Balls and everything else unchanged, field free.
export default async function(ctx) {
  await ctx.loadSave("cerulean-arrival");
  const result = await ctx.runEval(`
    const C = H.C, before = H.resources(), balls0 = H.countItem(C.ITEM_POKE_BALL), p0 = H.countItem(C.ITEM_POTION);
    const e = await H.enter(29, 28, "D");
    if (e.note || H.st().map !== "MAP_CERULEAN_CITY_MART") throw new Error("did not enter the Mart: " + JSON.stringify(e));
    const r = await H.buyItem(C.ITEM_POTION, 8);
    const after = H.resources();
    if (!r.ok || r.paid !== r.price * 8 || r.gained !== 8) throw new Error("purchase: " + JSON.stringify(r));
    if (H.countItem(C.ITEM_POKE_BALL) !== balls0 || H.countItem(C.ITEM_POTION) !== p0 + 8 || after.money !== before.money - r.paid) throw new Error("bag/money mismatch: " + JSON.stringify({ balls: H.countItem(C.ITEM_POKE_BALL), balls0, potions: H.countItem(C.ITEM_POTION), money: after.money }));
    if (!H.fieldFree()) throw new Error("field not free after buying");
    return { price: r.price, paid: r.paid, money: [before.money, after.money], potions: [p0, H.countItem(C.ITEM_POTION)], balls: [balls0, H.countItem(C.ITEM_POKE_BALL)] };
  `);
  if (ctx.errors().length) throw new Error(ctx.errors().join("; "));
  return result;
}
