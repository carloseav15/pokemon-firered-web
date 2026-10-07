// H.assessTrainer against outcomes already observed in real battles (no battle is fought here, nothing is written):
// - cerulean-arrival vs TRAINER_RIVAL_CERULEAN_CHARMANDER: the route 2 runs lost or ran out of resources there
//   (party Pidgey L16, Ivysaur L18 against Pidgeotto 17, Abra 16, Rattata 15, Charmander 18), so the estimate must
//   not be "favorable" and must report how many levels would make it favorable.
// - gym-camper vs TRAINER_LEADER_BROCK: C6 won this battle from this checkpoint, so the estimate must be a win.
// createMon gets fixed personality, IV and OT, so the estimate draws no random numbers.
export default async function run(ctx) {
  const out = {};
  await ctx.loadSave("cerulean-arrival");
  out.rival = await ctx.runEval(`return await H.assessTrainer(H.C.TRAINER_RIVAL_CERULEAN_CHARMANDER);`);
  await ctx.loadSave("gym-camper");
  out.brock = await ctx.runEval(`return await H.assessTrainer(H.C.TRAINER_LEADER_BROCK);`);
  if (ctx.errors().length) throw new Error(ctx.errors().join("; "));
  if (!out.rival.ok || out.rival.verdict === "favorable" || !(out.rival.levelsNeeded > 0)) throw new Error("rival estimate disagrees with the observed losses: " + JSON.stringify(out.rival));
  if (!out.brock.ok || !out.brock.win) throw new Error("Brock estimate disagrees with the observed win: " + JSON.stringify(out.brock));
  return out;
}
