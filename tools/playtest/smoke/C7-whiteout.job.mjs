export default async function run(ctx) {
  const state = await ctx.loadSave("forest-sammy");
  const party = await ctx.runEval(`return frDebug.save.save.party.map(p => ({ species: p.species, hp: p.hp, maxHp: p.stats[0] }))`);
  if (state.map !== "MAP_VIRIDIAN_FOREST" || party[0]?.hp !== 7)
    throw new Error(`unexpected whiteout checkpoint: ${JSON.stringify({ state, party })}`);
  return { manual: "Needs a real losing battle; forest-sammy starts outside battle at 7/33 HP, and the available deterministic field route does not start a battle without changing the encounter state." };
}
