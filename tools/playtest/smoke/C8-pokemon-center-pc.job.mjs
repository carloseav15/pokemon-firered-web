export default async function run(ctx) {
  try {
    const initial = await ctx.loadSave("pewter-pc");
    if (initial.map !== "MAP_PEWTER_CITY_POKEMON_CENTER_1F") throw new Error(`wrong checkpoint: ${JSON.stringify(initial)}`);
    const before = await ctx.runEval(`return { state: frDebug.state(), money: frDebug.save.save.money, party: frDebug.save.save.party.map(p => [p.species, p.hp]), boxes: frDebug.save.save.boxes.map(b => b.filter(p => p && p.species !== 0).length), flags: [...frDebug.save.save.flags] }`);

    // EventScript_PC first shows the boot message, then asks which PC to access.
    // Choose Someone's PC, dismiss its access message and the storage notice,
    // then choose WITHDRAW POKEMON to enter the actual box screen.
    for (let i = 0; i < 6; i++) {
      await ctx.press("A");
      await ctx.wait(120);
    }

    const after = await ctx.runEval(`
      const T = await H.mod("/src/fr/gba/tasks.ts");
      const M = await H.mod("/src/fr/storageSystemInternal.ts");
      return {
        state: frDebug.state(), callback: H.R.gMain.callback2?.name,
        storageActive: !!M.stState.gStorage,
        storageTask: T.tasks.tasks.filter(t => t.isActive).some(t => t.func?.name === "Task_PokeStorageMain"),
        money: frDebug.save.save.money,
        party: frDebug.save.save.party.map(p => [p.species, p.hp]),
        boxes: frDebug.save.save.boxes.map(b => b.filter(p => p && p.species !== 0).length),
        flags: [...frDebug.save.save.flags],
      };
    `);
    const stateBefore = { map: before.state.map, x: before.state.x, y: before.state.y };
    const stateAfter = { map: after.state.map, x: after.state.x, y: after.state.y };
    if (after.callback !== "CB2_PokeStorage" || !after.storageActive || !after.storageTask) {
      await ctx.shot("C8-pc-stuck");
      throw new Error(`PC script did not enter the box-storage screen: ${JSON.stringify(after)}`);
    }
    if (JSON.stringify(stateAfter) !== JSON.stringify(stateBefore) || after.money !== before.money
      || JSON.stringify(after.party) !== JSON.stringify(before.party)
      || JSON.stringify(after.boxes) !== JSON.stringify(before.boxes)
      || JSON.stringify(after.flags) !== JSON.stringify(before.flags))
      throw new Error(`Opening the PC unexpectedly changed saved field state: ${JSON.stringify({ before, after })}`);
    if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);
    return { initial, before, after };
  } catch (error) {
    if (!String(error).includes("C8-pc-stuck")) await ctx.shot("C8-failure");
    throw error;
  }
}
