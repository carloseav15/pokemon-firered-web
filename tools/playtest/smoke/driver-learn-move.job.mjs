// H.battle("auto") with a full moveset (Cmd_yesnoboxlearnmove, battle_script_commands.c). PREPARED input on
// route2-north: the lead Bulbasaur gets experience one point below level 20, where its learnset adds Razor Leaf;
// a real wild battle then levels it up. Case "replace": its moves [Sleep Powder, Growl, Leech Seed, Vine Whip]
// make chooseMoveToForget pick slot 0, chosen on the summary screen by input; the party data must show Razor Leaf
// there and the other three unchanged. Case "decline": PREPARED moves that all outrank Razor Leaf; the driver must
// refuse with B, confirm stopping, and keep the moves. Nothing else is prepared; outcomes are read from the game.
const body = (moves) => `
  const C = H.C, sv = frDebug.save.save, mon = sv.party[0];
  const P = await H.mod("/src/fr/pokemon/pokemon.ts");
  const learnset = H.rom.species[mon.species].learnset;
  if (!learnset.some(([lvl, mv]) => lvl === 20 && mv === C.MOVE_RAZOR_LEAF)) throw new Error("learnset has no Razor Leaf at 20: " + JSON.stringify(learnset));
  const between = learnset.filter(([lvl]) => lvl > mon.level && lvl < 20);
  ${moves ? `mon.moves = ${moves}.map(n => C[n]); mon.pp = mon.moves.map(id => H.rom.moves[id].pp);` : ""}
  mon.exp = P.expForLevel(mon.species, 20) - 1; // PREPARED
  const before = [...mon.moves];
  for (let i = 0; i < 200 && !H.inBattle(); i++) await frDebug.walk(i % 2 ? "D" : "U", 1);
  if (!H.inBattle()) throw new Error("no encounter");
  const r = await H.battle("auto", 0, 6000);
  await H.idle(3000, true);
  const learnTrace = r.trace.filter(t => /replace|learn/.test(t.action ?? ""));
  return { razor: C.MOVE_RAZOR_LEAF, stop: r.stop, outcome: r.outcome, level: mon.level, before, after: [...mon.moves], between, learnTrace, field: H.fieldFree() };
`;

export default async function run(ctx) {
  const out = {};
  await ctx.loadSave("route2-north");
  const a = await ctx.runEval(body(null));
  if (a.stop || a.level < 20) throw new Error("replace case did not level up cleanly: " + JSON.stringify(a));
  if (a.after[0] !== a.razor || a.after.slice(1).join() !== a.before.slice(1).join()) throw new Error("replace case moves wrong: " + JSON.stringify(a));
  if (!a.learnTrace.some(t => t.action === "learned move")) throw new Error("replace case has no verified learn: " + JSON.stringify(a.learnTrace));
  out.replace = a;

  await ctx.loadSave("route2-north");
  const b = await ctx.runEval(body(`["MOVE_DOUBLE_EDGE", "MOVE_SOLAR_BEAM", "MOVE_BODY_SLAM", "MOVE_EARTHQUAKE"]`));
  if (b.stop || b.level < 20) throw new Error("decline case did not level up cleanly: " + JSON.stringify(b));
  if (b.after.join() !== b.before.join()) throw new Error("decline case changed moves: " + JSON.stringify(b));
  if (!b.learnTrace.some(t => t.action === "decline replacement")) throw new Error("decline case did not decline: " + JSON.stringify(b.learnTrace));
  out.decline = b;

  if (ctx.errors().length) throw new Error(ctx.errors().join("; "));
  return out;
}
