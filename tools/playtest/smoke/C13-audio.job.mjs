export default async function run(ctx) {
  const initial = await ctx.loadSave("pewter");
  await ctx.page.locator("canvas").click({ position: { x: 120, y: 80 } });
  const audio = await ctx.runEval(`
    const { sound } = await H.mod("/src/fr/audio/sound.ts");
    await sound.backend.ctx.resume();
    await frDebug.wait(60);
    return { map: H.st().map, song: sound.currentBGM, playing: sound.backend.isPlaying("bgm"), context: sound.backend.ctx.state };
  `);
  if (!audio.playing || audio.context !== "running" || audio.song === 0)
    throw new Error(`map music did not start: ${JSON.stringify(audio)}`);
  return { manual: `Map BGM verified (${audio.song}, WebAudio ${audio.context}); battle music, sound effects, cries, and human listening remain unverified.` };
}
