import { prelude } from "./lib.mjs";

// Lose a wild battle in Viridian Forest with the 7/33 HP lead (using Growl only, so it
// cannot win) and check the whiteout: Pokémon Center 1F, facing north, party healed, less money.
export default async function run(ctx) {
  const initial = await ctx.loadSave("forest-sammy");
  if (initial.map !== "MAP_VIRIDIAN_FOREST") throw new Error(`unexpected checkpoint: ${JSON.stringify(initial)}`);
  const result = await ctx.runEval(`${prelude}
    const C = await H.mod("/src/fr/generated/constants.ts");
    const money0 = sv.money, hp0 = sv.party[0].hp, max = sv.party[0].stats[0];
    const GROWL = sv.party[0].moves.indexOf(C.MOVE_GROWL);
    if (GROWL < 0 || hp0 >= max) throw new Error("fixture changed: " + JSON.stringify({ moves: sv.party[0].moves, hp0, max }));
    H.battleDefaults = { mode: "fight", slot: GROWL };
    H.log.length = 0;
    for (let i = 0; i < 40 && H.st().map === "MAP_VIRIDIAN_FOREST"; i++) {
      await H.goto(6, i % 2 ? 22 : 21);   // two grass tiles
      if (H.inBattle()) await H.battle("fight", GROWL, 3000);
      if (sv.money < money0) break;
    }
    const fights = H.log.filter(r => r.battle);
    if (fights.at(-1)?.outcome !== C.B_OUTCOME_LOST) throw new Error("the battle was not lost: " + JSON.stringify(fights));
    await frDebug.wait(600);
    const end = await H.idle(3000, true);
    const heal = sv.party.every(p => p.hp === p.stats[0]);
    if (!/POKEMON_CENTER_1F$/.test(end.map)) throw new Error("did not whiteout to a Pokémon Center: " + JSON.stringify({ end, fights }));
    if (end.facing !== 2) throw new Error("not facing north after whiteout: " + JSON.stringify(end));
    if (!heal || sv.money >= money0) throw new Error("party not healed or money not reduced: " + JSON.stringify({ party: H.party(), money0, money: sv.money }));
    return { fights: fights.length, outcome: fights.at(-1)?.outcome, map: end.map, x: end.x, y: end.y, facing: end.facing, party: H.party(), money0, money: sv.money };`);
  if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);
  return result;
}
