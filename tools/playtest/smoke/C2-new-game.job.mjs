export default async function run(ctx) {
  const base = process.env.PW_BASE ?? "http://localhost:5174/";
  await ctx.page.goto(base, { waitUntil: "load" });
  await ctx.page.waitForTimeout(3000);
  await ctx.runEval(`
    frStartup.render = () => {};
    for (let i = 0; i < 300 && frStartup.stage !== "menu"; i++) {
      frStartupStep(frStartup.stage === "title" ? 1 : 30, frStartup.stage === "title" ? 8 : 0);
      await new Promise(r => setTimeout(r, 2));
    }
    if (frStartup.stage !== "menu" || !frStartup.romReady) throw new Error("title flow did not reach the ready main menu: " + frStartup.stage);
    // With no save file, the main menu contains only NEW GAME.
    for (let i = 0; i < 200 && !window.frGame; i++) {
      frStartupStep(4, i % 3 === 0 ? 1 : 0);
      await new Promise(r => setTimeout(r, 2));
    }
  `);
  await ctx.page.waitForTimeout(1500);
  const launched = await ctx.runEval(`return { ready: !!window.frDebug?.state, stage: frStartup.stage, oakDone: frStartup.oakSpeech.done, game: !!window.frGame }`);
  if (!launched.ready) return { manual: `Title and NEW GAME reached ${launched.stage}; Oak's opening sequence did not reach the field engine in this smoke run, so story progression remains unverified (${JSON.stringify(launched)}).` };
  await ctx.runEval(`const { H } = await import("/tools/playtest/driver.js"); window.H = H; await H.ready()`);
  await ctx.page.locator("canvas").click({ position: { x: 120, y: 80 } });
  await ctx.runEval(`const S = await H.mod("/src/fr/audio/sound.ts"); await S.sound.backend.ctx.resume()`);
  const result = await ctx.runEval(`const { H } = await import("/tools/playtest/driver.js"); window.H = H; await H.ready();
    const initial = H.st();
    if (initial.map !== "MAP_PALLET_TOWN_PLAYERS_HOUSE_2F" || initial.x !== 6 || initial.y !== 6
      || frDebug.save.save.money !== 3000 || frDebug.save.save.party.length !== 0)
      throw new Error("new game did not start at the expected Pallet bedroom state: " + JSON.stringify(initial));
    const warps = H.warps();
    const upstairs = await H.goto(11, 2);
    if (upstairs.note) throw new Error("cannot reach upstairs warp: " + JSON.stringify(upstairs));
    const stair = await frDebug.walk("L", 2);
    const firstFloor = await H.idle(1200, false);
    if (firstFloor.map !== "MAP_PALLET_TOWN_PLAYERS_HOUSE_1F")
      throw new Error("upstairs warp failed: " + JSON.stringify({ stair, firstFloor }));
    const doorApproach = await H.goto(4, 7);
    // Keep SOUTH held briefly after landing on the SOUTH_ARROW_WARP tile.
    // The driver releases as soon as the step starts; C checks the arrow warp
    // again while the direction remains held.
    const exitStep = await frDebug.walk("D", 1);
    await frDebug.wait(12, 0x80);
    const outside = await H.idle(1200, false);
    if (doorApproach.note) throw new Error("cannot reach the house exit: " + JSON.stringify({ doorApproach, outside }));
    if (outside.map !== "MAP_PALLET_TOWN") throw new Error("1F exit warp failed: " + JSON.stringify({ doorApproach, exitStep, outside }));
    return { initial, warps, upstairs, stair, firstFloor, doorApproach, exitStep, outside,
      money: frDebug.save.save.money, party: frDebug.save.save.party.map(p => [p.species, p.level, p.hp]),
      flags: [...frDebug.save.save.flags], cb2: H.cb2() }`);
  return result;
}
