// C6: combate de entrenador con gym-camper: hablar a Brock, avanzar el intro,
// ganar con pulsaciones reales y comprobar medalla y dinero.
import { prelude } from "./lib.mjs";

const helpers = `${prelude}
  const C = await H.mod("/src/fr/generated/constants.ts");
  const fail = (m, extra = {}) => { throw new Error(m + " " + JSON.stringify({ cb2: H.cb2(), tasks: names(), ...extra })); };
`;

export default async function run(ctx) {
  const initial = await ctx.loadSave("gym-camper");
  if (initial.map !== "MAP_PEWTER_CITY_GYM") throw new Error(`wrong Gym checkpoint: ${JSON.stringify(initial)}`);
  const result = await ctx.runEval(`${helpers}
    const res = { start: { x: H.st().x, y: H.st().y } };
    const money0 = sv.money;
    const WHIP = sv.party[0].moves.indexOf(C.MOVE_VINE_WHIP);
    if (WHIP < 0) fail("fixture lead has no Vine Whip", { moves: sv.party[0].moves });
    // Hablar a Brock (6,5) y avanzar el texto de intro hasta que arranque el combate.
    const r = await H.talk(6, 5);
    if (r.note) fail("could not reach Brock", { r });
    for (let i = 0; i < 120 && !H.inBattle(); i++) { await frDebug.press("A", 4); await frDebug.wait(20); }
    if (!H.inBattle()) fail("Brock battle never started", { st: H.st() });
    res.intro = "battle started";
    const b = await H.battle("fight", WHIP, 6000);
    if (b.stuck || b.outcome !== C.B_OUTCOME_WON) fail("Brock battle not won", { b });
    res.outcome = b.outcome;
    await H.idle(3000, true);
    const fl = sv.flags;
    const bit = (n) => (fl[n >> 3] >> (n & 7)) & 1;
    res.badge = bit(C.FLAG_BADGE01_GET);
    res.money = [money0, sv.money];
    if (!res.badge) fail("no Boulder Badge after victory", res);
    if (sv.money <= money0) fail("no prize money after victory", res);
    if (H.inBattle()) fail("still in battle after victory", res);
    return res;`);
  if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);
  return result;
}
