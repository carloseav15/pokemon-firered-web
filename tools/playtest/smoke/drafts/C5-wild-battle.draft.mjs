// DRAFT, not run by run.mjs (task C5 in TAREAS-FINALES.md §3.0). Fight and run stages pass.
// 1.16 verdict: DRIVER bug, game is correct. The old navigation (Lx3, R) landed on the
// Key Items pocket (OPEN_BAG_POKEBALLS is 2, not 1), so A opened the Bicycle's
// Cancel-only context menu and the next A returned to the bag with balls intact.
// With pocket 2 the ball is thrown (USE path verified: ball count drops, throw anim runs).
import { prelude } from "../lib.mjs";

// Route 2 grass with Poké Balls in the bag: win a wild battle with FIGHT, escape one with
// RUN, and capture one through BAG > Poké Ball. The captured Pokémon must reach the party
// or a box and the ball count must drop.
const helpers = `${prelude}
  const C = await H.mod("/src/fr/generated/constants.ts");
  const B = await H.mod("/src/fr/bagMenu.ts");
  const ctl = () => H.G.gBattlerControllerFuncs[0]?.name;
  const fail = (m, extra = {}) => { throw new Error(m + " " + JSON.stringify({ ctl: ctl(), cb2: H.cb2(), tasks: names(), ...extra })); };
  const boxMons = () => sv.boxes.flat(2).filter(m => m && m.species).length;
  // Walk the two grass tiles until a wild battle starts, then wait for the action menu.
  const encounter = async () => {
    for (let i = 0; i < 200 && !H.inBattle(); i++) await frDebug.walk(i % 2 ? "D" : "U", 1);
    if (!H.inBattle()) fail("no wild battle in 200 steps");
    for (let i = 0; i < 800 && H.inBattle() && ctl() !== "HandleInputChooseAction"; i++) await frDebug.press("A", 4);
    if (ctl() !== "HandleInputChooseAction") fail("battle never reached the action menu");
    return { species: H.G.gBattleMons[1].species, level: H.G.gBattleMons[1].level, hp: H.G.gBattleMons[1].hp };
  };
`;

export default async function run(ctx) {
  const initial = await ctx.loadSave("route2-north");
  if (initial.map !== "MAP_ROUTE2") throw new Error(`unexpected checkpoint: ${JSON.stringify(initial)}`);
  const result = await ctx.runEval(`${helpers}
    const res = {};
    const WHIP = sv.party[0].moves.indexOf(C.MOVE_VINE_WHIP);
    if (WHIP < 0) fail("fixture lead has no Vine Whip", { moves: sv.party[0].moves });
    // FIGHT: Vine Whip until the battle ends; the wild Pokémon is gone (won) and the lead gained experience.
    const exp0 = sv.party[0].exp;
    window.__c5 = "fight"; res.fight = { foe: await encounter() };
    const r1 = await H.battle("fight", WHIP, 3000);
    if (r1.stuck || r1.outcome !== C.B_OUTCOME_WON) fail("FIGHT did not win", { r1 });
    if (sv.party[0].exp <= exp0) fail("no experience gained", { exp0, exp: sv.party[0].exp });
    res.fight.outcome = r1.outcome;
    await H.idle(2000, true);

    // RUN: the battle ends with the player escaping.
    window.__c5 = "run"; res.run = { foe: await encounter() };
    const r2 = await H.battle("run", 0, 3000);
    if (r2.stuck || r2.outcome !== C.B_OUTCOME_RAN) fail("RUN did not escape", { r2 });
    res.run.outcome = r2.outcome;
    await H.idle(2000, true);

    // CAPTURE: BAG > Poké Ball pocket > first ball > USE, repeat until caught.
    const balls0 = bagCount(C.ITEM_POKE_BALL), party0 = sv.party.length, box0 = boxMons();
    window.__c5 = "capture"; res.capture = { foe: await encounter() };
    let thrown = 0;
    for (let guard = 0; thrown < balls0 && guard < 600; guard++) {
      if (!H.inBattle()) break;
      if (ctl() === "HandleInputChooseAction") {
        // Pockets navigate as Items(0)/KeyItems(1)/Balls(2) also in battle:
        // OPEN_BAG_POKEBALLS is 2, not 1. Steer to pocket 2 from any start.
        await tap("R", 12);                       // BAG
        if (!await until(() => H.cb2() === "CB2_BagMenuRun", "A", 60)) fail("bag did not open in battle");
        await frDebug.wait(150);
        for (let i = 0; i < 4 && B.gBagMenuState.pocket !== 2; i++) await tap("R", 40);
        if (B.gBagMenuState.pocket !== 2) fail("not on the Poké Balls pocket", { pocket: B.gBagMenuState.pocket });
        await tap("A", 40); await tap("A", 60);   // select the ball, USE
        thrown++;
      }
      // Dismiss text; decline the nickname prompt with B.
      await frDebug.press(H.G.gBattleOutcome === C.B_OUTCOME_CAUGHT || sv.party.length + boxMons() > party0 + box0 ? "B" : "A", 8);
    }
    for (let i = 0; i < 200 && H.inBattle(); i++) await frDebug.press("B", 8);
    await H.idle(2000, false);
    const gained = sv.party.length + boxMons() - party0 - box0;
    if (gained !== 1) fail("capture did not add exactly one Pokémon", { gained, thrown, balls: bagCount(C.ITEM_POKE_BALL) });
    if (bagCount(C.ITEM_POKE_BALL) !== balls0 - thrown) fail("ball count does not match throws", { balls0, thrown, now: bagCount(C.ITEM_POKE_BALL) });
    res.capture.thrown = thrown;
    res.capture.where = sv.party.length > party0 ? "party" : "box";
    return res;`);
  if (ctx.errors().length) throw new Error(`browser errors: ${ctx.errors().join("; ")}`);
  return result;
}
