const SAVE_KEY = "pokemon-gba-web-lab.firered.v2";
const updown = async (ctx, bits) => {
  await ctx.runEval(`await frDebug.wait(2, ${bits})`);
  await ctx.wait(4);
};

export default async function run(ctx) {
  try {
    const initial = await ctx.loadSave("pewter");
    const before = await ctx.runEval(`return {
      money: frDebug.save.save.money,
      pos: { ...frDebug.save.save.pos },
      party: frDebug.save.save.party.map(p => [p.species, p.level, p.hp]),
      saveStat: frDebug.save.save.gameStats[${(await import("../../../src/fr/generated/constants.ts")).GAME_STAT_SAVED_GAME}],
    }`);

    // Pewter has Pokédex, Pokémon, Bag, Trainer, Save in that order.
    await ctx.press("START");
    await ctx.wait(16);
    for (let i = 0; i < 4; i++) await updown(ctx, 0x80);
    await ctx.press("A");
    await ctx.wait(120);
    // Confirm save, overwrite the imported checkpoint, and dismiss the result.
    for (let i = 0; i < 4; i++) {
      await ctx.press("A");
      await ctx.wait(i === 3 ? 100 : 100);
    }
    const written = await ctx.runEval(`return {
      money: frDebug.save.save.money,
      pos: { ...frDebug.save.save.pos },
      party: frDebug.save.save.party.map(p => [p.species, p.level, p.hp]),
      saveStat: frDebug.save.save.gameStats[${(await import("../../../src/fr/generated/constants.ts")).GAME_STAT_SAVED_GAME}],
      raw: localStorage.getItem("${SAVE_KEY}"),
    }`);
    if (!written.raw || written.saveStat <= before.saveStat) throw new Error("in-game save did not update storage/save statistic");

    const base = process.env.PW_BASE ?? "http://localhost:5173/";
    await ctx.page.goto(`${base}?fr=continue`, { waitUntil: "load" });
    await ctx.page.waitForTimeout(1500);
    const continued = await ctx.runEval(`const { H } = await import("/tools/playtest/driver.js"); window.H = H; await H.ready(); return {
      state: H.st(),
      money: frDebug.save.save.money,
      pos: { ...frDebug.save.save.pos },
      party: frDebug.save.save.party.map(p => [p.species, p.level, p.hp]),
    }`);
    if (continued.state.map !== initial.map || continued.state.x !== initial.x || continued.state.y !== initial.y)
      throw new Error(`continue position differs: ${JSON.stringify(continued)}`);
    if (continued.money !== before.money || JSON.stringify(continued.party) !== JSON.stringify(before.party))
      throw new Error(`continue money/party differs: ${JSON.stringify(continued)}`);
    if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);
    return { save: { map: initial.map, x: initial.x, y: initial.y, money: before.money, party: before.party }, continued };
  } catch (error) {
    await ctx.shot("C3-failure");
    throw error;
  }
}
