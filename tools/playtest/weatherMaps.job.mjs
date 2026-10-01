// Validate FireRed's actually-used fog/shade map headers in Chromium.
// Run with: node tools/playtest/pw.mjs "$PWD/tools/playtest/weatherMaps.job.mjs" /tmp/pw
function pixelMean(frame) {
  let sum = 0;
  for (let i = 0; i < frame.data.length; i += 4)
    sum += (frame.data[i] + frame.data[i + 1] + frame.data[i + 2]) / 3;
  return sum / (frame.w * frame.h);
}

function pixelDiffRatio(a, b) {
  let n = 0, changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    n++;
    if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 30) changed++;
  }
  return changed / n;
}

async function warp(ctx, group, num, x, y, expected) {
  await ctx.runEval(`
    const ow = window.frGame.overworld;
    ow.SetWarpDestination(${group}, ${num}, -1, ${x}, ${y});
    ow.WarpIntoMap();
  `);
  let state;
  for (let i = 0; i < 80; i++) {
    await ctx.wait(20);
    state = await ctx.state();
    if (state.map === expected && !state.locked && !state.script) return state;
  }
  throw new Error(`warp to ${expected} timed out: ${JSON.stringify(state)}`);
}

export default async function run(ctx) {
  const out = {};
  await ctx.loadSave("pewter");

  // Pokémon Tower 3F is a real WEATHER_FOG_HORIZONTAL map (header weather 6).
  const fogState = await warp(ctx, 1, 90, 4, 10, "MAP_POKEMON_TOWER_3F");
  await ctx.wait(180);
  const fog1 = await ctx.canvas();
  await ctx.wait(40);
  const fog2 = await ctx.canvas();
  out.fog = { map: fogState.map, headerWeather: await ctx.runEval(`return {id:window.frGame.overworld.header?.id, weather:window.frGame.overworld.header?.weather};`), movingPixelRatio: pixelDiffRatio(fog1, fog2) };
  await ctx.shot("weather-real-fog-tower3f");

  // Viridian Forest's real header uses WEATHER_SHADE (11).
  const shadeState = await warp(ctx, 1, 0, 15, 15, "MAP_VIRIDIAN_FOREST");
  await ctx.wait(180);
  const shade = await ctx.canvas();
  out.shade = { map: shadeState.map, headerWeather: await ctx.runEval(`return {id:window.frGame.overworld.header?.id, weather:window.frGame.overworld.header?.weather};`), meanBrightness: pixelMean(shade) };
  await ctx.shot("weather-real-shade-forest");
  out.errors = ctx.errors();
  if (out.fog.movingPixelRatio <= 0.01) throw new Error("fog overlay did not move in Pokémon Tower 3F");
  if (out.fog.headerWeather?.weather !== 6) throw new Error(`Pokémon Tower 3F header weather is ${out.fog.headerWeather?.weather}, expected 6`);
  if (out.shade.headerWeather?.weather !== 11) throw new Error(`Viridian Forest header weather is ${out.shade.headerWeather?.weather}, expected 11`);
  if (out.shade.meanBrightness >= 150) throw new Error("Viridian Forest shade failed to darken the map");
  if (out.errors.length) throw new Error("browser errors: " + out.errors.join(" | "));
  return out;
}
