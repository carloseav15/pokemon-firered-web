import { prelude } from "./lib.mjs";

// Buy one of the first item, sell one Potion, then leave: money and bag must change by a
// whole price each time, and the field must be free again at the end.
export default async function run(ctx) {
  const initial = await ctx.loadSave("mart");
  if (initial.map !== "MAP_PEWTER_CITY_MART") throw new Error(`wrong checkpoint: ${JSON.stringify(initial)}`);
  const result = await ctx.runEval(`${prelude}
    if (!H.objects().some(o => o[0] === 3 && o[1] === 2 && o[2] === 3)) throw new Error("Pewter Mart clerk did not spawn");
    const POTION = 13;
    const money0 = sv.money, potions0 = bagCount(POTION);
    const fail = (m) => { throw new Error(m + " " + JSON.stringify({ tasks: names(), cb2: H.cb2(), money: sv.money, money0 })); };
    await H.counter(2, 3);
    frDebug.run(1, 1); frDebug.run(1, 0);
    if (!await until(() => has("Task_ShopMenu"), null, 400)) fail("shop menu did not open");

    // BUY: first list entry, quantity 1 (the default), confirm with YES.
    await tap("A", 10);
    if (!await until(() => has("Task_BuyMenu"), null, 600)) fail("buy screen did not open");
    const balls0 = bagCount(4), bag0 = JSON.stringify(sv.bag);
    await tap("A", 30);
    if (!await until(() => has("Task_BuyHowManyDialogueHandleInput"), "A", 200)) fail("quantity prompt missing");
    await tap("A", 30);
    if (!await until(() => has("Task_CallYesOrNoCallback"), "A", 200)) fail("confirmation prompt missing");
    await tap("A", 30);
    if (!await until(() => has("Task_BuyMenu") && !has("Task_ContinueTaskAfterMessagePrints"), "A", 300)) fail("did not return to the list after buying");
    const bought = money0 - sv.money;
    if (bought <= 0 || JSON.stringify(sv.bag) === bag0) fail("purchase changed neither money nor bag");
    // Leave the buy screen back to the clerk's menu.
    if (!await until(() => has("Task_ShopMenu"), "B", 400)) fail("buy screen did not return to the shop menu");

    // SELL: first Potion through the bag, quantity 1.
    const money1 = sv.money;
    await tap("D"); await tap("A", 10);
    if (!await until(() => has("Task_BagMenu_HandleInput"), null, 600)) fail("sell bag did not open");
    await tap("A", 30);
    if (!await until(() => has("Task_SelectQuantityToSell"), "A", 200)) fail("sell quantity prompt missing");
    await tap("A", 30);
    if (!await until(() => has("Task_CallYesOrNoCallback"), "A", 200)) fail("sell confirmation missing");
    await tap("A", 30);
    if (!await until(() => has("Task_WaitPressAB_AfterSell"), "A", 200)) fail("sale did not finish");
    const sold = sv.money - money1;
    if (sold <= 0 || bagCount(POTION) !== potions0 - 1) fail("sale did not pay or remove one Potion: sold=" + sold);
    await until(() => has("Task_BagMenu_HandleInput"), "A", 200);
    if (!await until(() => has("Task_ShopMenu"), "B", 600)) fail("bag did not return to the shop menu");

    // QUIT: B closes the clerk's menu and releases the player.
    await tap("B", 10);
    const end = await H.idle(1500, true);
    if (end.script || end.locked) fail("shop did not release the player: " + JSON.stringify(end));
    return { bought, sold, ballsDelta: bagCount(4) - balls0, potionsDelta: bagCount(POTION) - potions0, moneyEnd: sv.money };`);
  if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);
  return result;
}
