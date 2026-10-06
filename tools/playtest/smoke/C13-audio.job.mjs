export default async function run(ctx) {
  const initial = await ctx.loadSave("pewter");
  await ctx.page.locator("canvas").click({ position: { x: 120, y: 80 } });
  const audio = await ctx.runEval(`
    const { sound } = await H.mod("/src/fr/audio/sound.ts");
    const C = await H.mod("/src/fr/generated/constants.ts");
    await sound.backend.ctx.resume();
    await frDebug.wait(60);
    return { map: H.st().map, song: sound.currentBGM, playing: sound.backend.isPlaying("bgm"), context: sound.backend.ctx.state,
      MUS_VS_WILD: C.MUS_VS_WILD, SE_SELECT: C.SE_SELECT };
  `);
  if (!audio.playing || audio.context !== "running" || audio.song === 0)
    throw new Error(`map music did not start: ${JSON.stringify(audio)}`);
  const out = { mapBGM: audio.song };

  // Sound effect and cry by engine state (no human listening here).
  const fx = await ctx.runEval(`
    const { sound } = await H.mod("/src/fr/audio/sound.ts");
    sound.playSE(${audio.SE_SELECT});
    await frDebug.wait(10);
    const se = sound.isSEPlaying();
    sound.playCry(25, 0);
    await frDebug.wait(10);
    const cry = sound.isCryPlaying();
    await frDebug.wait(120);
    return { se, cry };
  `);
  if (!fx.se) throw new Error(`sound effect did not register as playing: ${JSON.stringify(fx)}`);
  if (!fx.cry) throw new Error(`pokemon cry did not register as playing: ${JSON.stringify(fx)}`);
  out.fx = fx;

  // Battle music on a real wild encounter (route2-north grass).
  const second = await ctx.loadSave("route2-north");
  if (second.map !== "MAP_ROUTE2") throw new Error(`unexpected checkpoint: ${JSON.stringify(second)}`);
  await ctx.page.locator("canvas").click({ position: { x: 120, y: 80 } });
  const battle = await ctx.runEval(`
    const { sound } = await H.mod("/src/fr/audio/sound.ts");
    const C = await H.mod("/src/fr/generated/constants.ts");
    await sound.backend.ctx.resume();
    for (let i = 0; i < 200 && !H.inBattle(); i++) await frDebug.walk(i % 2 ? "D" : "U", 1);
    if (!H.inBattle()) throw new Error("no wild battle in 200 steps");
    await frDebug.wait(120);
    return { song: sound.currentBGM, playing: sound.backend.isPlaying("bgm"), wild: C.MUS_VS_WILD };
  `);
  if (!battle.playing || battle.song !== battle.wild)
    throw new Error(`battle music did not switch to wild battle: ${JSON.stringify(battle)}`);
  out.battleBGM = battle.song;
  if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);
  return { ...out, manual: `Map BGM (${audio.song}), battle BGM (${battle.song}), SE and cry states verified; human listening remains unverified.` };
}
