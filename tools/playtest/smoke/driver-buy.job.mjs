// H.buyItem through the real Pewter Mart clerk menu (save "mart": Pewter Mart, no PREPARED values). Cases: refusal when the
// money is short (nothing changes), a purchase of Potions x3 (first not-first list entry, quantity > 1) checked by the item
// data price and bag count, and that the field is free again. Money and items change only through the shop UI.
export default async function(ctx) {
  const initial = await ctx.loadSave("mart");
  if (initial.map !== "MAP_PEWTER_CITY_MART") throw new Error("wrong checkpoint: " + JSON.stringify(initial));
  const result = await ctx.runEval(`
    const C = H.C, POTION = C.ITEM_POTION;
    const m0 = H.resources().money, p0 = H.countItem(POTION);
    const broke = await H.buyItem(POTION, 99);
    if (broke.ok !== false || broke.reason !== "not-enough-money" || H.resources().money !== m0 || H.countItem(POTION) !== p0) throw new Error("short-money case: " + JSON.stringify(broke));
    let bad = null; try { await H.buyItem(POTION, 0); } catch (e) { bad = String(e.message); }
    if (!bad) throw new Error("quantity 0 accepted");
    const bought = await H.buyItem(POTION, 3);
    if (!bought.ok || bought.gained !== 3 || bought.paid !== bought.price * 3 || H.resources().money !== m0 - bought.paid || !H.fieldFree()) throw new Error("purchase: " + JSON.stringify(bought));
    return { price: bought.price, paid: bought.paid, gained: bought.gained, money: [m0, H.resources().money], potions: [p0, H.countItem(POTION)], free: H.fieldFree(), brokeReason: broke.reason };
  `);
  if (ctx.errors().length) throw new Error(ctx.errors().join("; "));
  return result;
}
