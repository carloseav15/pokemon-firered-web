export default async function run(ctx) {
  await ctx.page.goto(process.env.PW_BASE ?? "http://localhost:5174/", { waitUntil: "load" });
  await ctx.page.waitForTimeout(3000);
  const result = await ctx.runEval(`
    if (!window.frStartupStep || !window.frStartup) throw new Error("startup flow did not initialize");
    // Advance the real callbacks while skipping software PPU drawing; C1 checks
    // stage progression and input handoff, not rendered pixels.
    frStartup.render = () => {};
    const seen = [];
    for (let i = 0; i < 300 && frStartup.stage !== "menu"; i++) {
      if (!seen.includes(frStartup.stage)) seen.push(frStartup.stage);
      frStartupStep(frStartup.stage === "title" ? 1 : 30, frStartup.stage === "title" ? 8 : 0);
      await new Promise(r => setTimeout(r, 2));
    }
    return { stage: frStartup.stage, seen, titleDone: frStartup.titleScreen.done, romReady: frStartup.romReady,
      introIndex: frStartup.introIndex, logoDone: frStartup.gameFreak.done };
  `);
  if (result.stage !== "menu" || result.introIndex < 1 || !result.seen.includes("logo")
    || !result.seen.includes("grass") || !result.seen.includes("forest") || !result.seen.includes("scene3")
    || !result.seen.includes("title") || !result.titleDone || !result.romReady)
    throw new Error(`startup did not reach the main menu through all intro stages: ${JSON.stringify(result)}`);
  if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);
  return result;
}
