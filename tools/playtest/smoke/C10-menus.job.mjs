import { prelude } from "./lib.mjs";

// Start-menu screens driven with button taps: Pokédex, Pokémon (summary, switch, give item),
// Bag (Potion on a hurt Pokémon), Trainer Card and Options (persisted on exit).
const helpers = `${prelude}
  const fail = (m, extra = {}) => { throw new Error(m + " " + JSON.stringify({ cb2: H.cb2(), tasks: names(), ...extra })); };
  const waitCb2 = async (name, btn = null, max = 300) => { if (!await until(() => H.cb2() === name, btn, max)) fail("expected " + name); await frDebug.wait(120); };
  // Back out of any screen with B until the START menu list is showing, then close it.
  const backToField = async () => {
    if (!await until(() => has("startInput"), "B", 200)) fail("never returned to the START menu");
    if (!await until(() => !has("startInput") && !H.st().locked && !H.st().script && !window.frGame.scene, "B", 200)) fail("START menu did not close");
  };`;

export default async function run(ctx) {
  const out = {};
  await ctx.loadSave("mart");
  out.hurt = await ctx.runEval(`${helpers}
    const res = {};
    // POKéDEX: opens (needs seen Pokémon), shows the numerical list, B returns to the menu.
    await openStart(0);
    await waitCb2("CB2_PokedexScreen");
    await tap("A", 40);
    if (!await until(() => has("Task_DexScreen_NumericalOrder"), null, 200)) fail("Pokédex list did not open");
    await tap("B", 40);
    if (!await until(() => has("Task_PokedexScreen"), "B", 100)) fail("Pokédex did not return to its main screen");
    await backToField();

    // POKéMON: summary, page flips, back.
    await openStart(1);
    await waitCb2("CB2_UpdatePartyMenu");
    await tap("A", 40);
    await tap("A", 40);
    await waitCb2("CB2_RunPokemonSummaryScreen", null, 200);
    const page0 = canvasHash();
    await tap("R", 60); const page1 = canvasHash(); await tap("R", 60); const page2 = canvasHash();
    if (H.cb2() !== "CB2_RunPokemonSummaryScreen" || page1 === page0 || page2 === page1) fail("summary pages did not change", { page0, page1, page2 });
    await tap("B", 40);
    await waitCb2("CB2_UpdatePartyMenu", "B", 100);
    await backToField();

    // BAG: Potion on the hurt lead heals it and consumes one Potion.
    const hp0 = sv.party[0].hp, max = sv.party[0].stats[0], potions0 = bagCount(13);
    if (hp0 >= max) fail("fixture lead is not hurt", { hp0, max });
    await openStart(2);
    await waitCb2("CB2_BagMenuRun");
    await tap("A", 40);
    if (!await until(() => has("Task_FieldItemContextMenuHandleInput"), null, 100)) fail("bag item menu missing");
    await tap("A", 40);
    await waitCb2("CB2_UpdatePartyMenu", null, 200);
    await tap("A", 40);
    if (!await until(() => sv.party[0].hp > hp0, "A", 300)) fail("Potion did not heal", { hp0, hp: sv.party[0].hp });
    if (bagCount(13) !== potions0 - 1) fail("Potion not consumed", { potions0, now: bagCount(13) });
    res.potion = { hp0, hp: sv.party[0].hp, potions0, potions: bagCount(13) };
    await backToField();

    // TRAINER CARD: flip with A, leave with B.
    await openStart(3);
    await waitCb2("CB2_TrainerCard");
    await tap("A", 40);
    await backToField();

    // OPTIONS: change TEXT SPEED and BATTLE SCENE, leave, and the save must hold them.
    const before = { ...sv.options };
    await openStart(5);
    await waitCb2("CB2_InitOptionMenu");
    await tap("R", 20); await tap("D", 20); await tap("L", 20);
    await backToField();
    if (sv.options.textSpeed === before.textSpeed || sv.options.battleScene === before.battleScene)
      fail("options were not stored", { before, after: { ...sv.options } });
    res.options = { before, after: { ...sv.options } };
    return res;`);

  await ctx.loadSave("pewter-pc");
  out.pair = await ctx.runEval(`${helpers}
    const order0 = sv.party.map(p => p.species).join(",");
    await openStart(1);
    await waitCb2("CB2_UpdatePartyMenu");
    // SWITCH: first Pokémon, then the second slot.
    await tap("A", 40);
    await tap("D", 20); await tap("A", 40);
    await tap("D", 20); await tap("A", 60);
    if (!await until(() => sv.party.map(p => p.species).join(",") !== order0, null, 200)) fail("party order did not change", { order0 });
    const order1 = sv.party.map(p => p.species).join(",");
    // ITEM > GIVE: Potion to the Pokémon in slot 2.
    const potions0 = bagCount(13);
    await tap("A", 40);
    await tap("D", 20); await tap("D", 20); await tap("A", 40);
    await tap("A", 40);
    await waitCb2("CB2_BagMenuRun", null, 200);
    await tap("A", 40);
    if (!await until(() => sv.party[1].heldItem === 13, "A", 300)) fail("item was not given", { held: sv.party.map(p => p.heldItem) });
    if (bagCount(13) !== potions0 - 1) fail("bag count did not drop after giving", { potions0, now: bagCount(13) });
    await backToField();
    return { order0, order1, held: sv.party.map(p => p.heldItem), potions0, potions: bagCount(13) };`);
  if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);
  return out;
}
