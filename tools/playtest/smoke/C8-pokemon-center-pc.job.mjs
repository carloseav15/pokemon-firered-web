export default async function run(ctx) {
  try {
    const initial = await ctx.loadSave("pewter-pc");
    if (initial.map !== "MAP_PEWTER_CITY_POKEMON_CENTER_1F") throw new Error(`wrong checkpoint: ${JSON.stringify(initial)}`);
    const before = await ctx.runEval(`return { party: frDebug.save.save.party.map(p => [p.species, p.hp]), boxes: frDebug.save.save.boxes.map(b => b.filter(Boolean).length) }`);
    await ctx.press("A");
    await ctx.wait(120);
    const after = await ctx.runEval(`return { state: frDebug.state(), scene: frGame.scene?.constructor?.name, locked: frGame.overworld.controlsLocked, party: frDebug.save.save.party.map(p => [p.species, p.hp]), boxes: frDebug.save.save.boxes.map(b => b.filter(Boolean).length) }`);
    if (after.state.script && after.locked && JSON.stringify(after.party) === JSON.stringify(before.party) && JSON.stringify(after.boxes) === JSON.stringify(before.boxes)) {
      await ctx.shot("C8-pc-stuck");
      throw new Error(`PC interaction remained script-locked without opening storage after 120 frames: ${JSON.stringify(after)}`);
    }
    if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);
    return { initial, before, after };
  } catch (error) {
    if (!String(error).includes("C8-pc-stuck")) await ctx.shot("C8-failure");
    throw error;
  }
}
