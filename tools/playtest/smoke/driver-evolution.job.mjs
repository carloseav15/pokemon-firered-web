// Evolution after a wild battle through the driver (evolution_scene.c). PREPARED input on route2-north, one point of
// experience below the evolution level; a real wild battle with H.battle("auto") then levels it up. The evolution
// is never cancelled (B) and must end with the field free and a real step.
// - "plain": the lead Bulbasaur L15 evolves into Ivysaur at 16 (no new move).
// - "learn": the lead becomes Abra L15 with [Tackle, Growl, Tail Whip, Leer]; Kadabra learns Confusion at 16
//   (level_up_learnsets.h sKadabraLevelUpLearnset), so the scene asks to delete a move: chooseMoveToForget picks
//   Growl (slot 1, the first move with no attack value) and the party data must show Confusion there.
const body = (learnCase) => `
  const C = H.C, sv = frDebug.save.save, mon = sv.party[0];
  const P = await H.mod("/src/fr/pokemon/pokemon.ts");
  ${learnCase ? `
  if (!H.rom.species[C.SPECIES_KADABRA].learnset.some(([l, m]) => l === 16 && m === C.MOVE_CONFUSION)) throw new Error("no Confusion at 16 for Kadabra");
  mon.species = C.SPECIES_ABRA; // PREPARED
  mon.moves = [C.MOVE_TACKLE, C.MOVE_GROWL, C.MOVE_TAIL_WHIP, C.MOVE_LEER]; mon.pp = mon.moves.map(id => H.rom.moves[id].pp);` : ""}
  mon.exp = P.expForLevel(mon.species, 16) - 1; // PREPARED
  mon.hp = 0; mon.stats = [0, 0, 0, 0, 0, 0]; P.calculateStats(mon);
  const before = { species: mon.species, moves: [...mon.moves] };
  for (let i = 0; i < 200 && !H.inBattle(); i++) await frDebug.walk(i % 2 ? "D" : "U", 1);
  if (!H.inBattle()) throw new Error("no encounter");
  const b = await H.battle("auto", 0, 6000);
  const phases = [];
  for (let i = 0; i < 40 && !H.fieldFree(); i++) { const s = await H.idle(1500, true); phases.push(s.phase + ":" + (s.reason ?? "")); if (s.ok === false && s.reason !== "idle-timeout") break; }
  const st = H.st();
  let step = null;
  if (H.fieldFree()) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    if (H.bfs(st.x + dx + 7, st.y + dy + 7) === null) continue;
    const g = await H.goto(st.x + dx, st.y + dy);
    if (!g.note && g.x === st.x + dx && g.y === st.y + dy) { step = { x: g.x, y: g.y }; break; }
  }
  return { before, species: mon.species, moves: [...mon.moves], level: mon.level, battle: { stop: b.stop, outcome: b.outcome },
    want: { ivysaur: C.SPECIES_IVYSAUR, kadabra: C.SPECIES_KADABRA, confusion: C.MOVE_CONFUSION },
    phases: phases.slice(0, 12), evoLog: H.log.filter(e => e.evolution).map(e => e.evolution), field: H.fieldFree(), step };
`;

export default async function run(ctx) {
  const out = {};
  await ctx.loadSave("route2-north");
  const a = await ctx.runEval(body(false));
  if (a.species !== a.want.ivysaur || a.level !== 16 || !a.field || !a.step || a.evoLog.length !== 1 || !a.evoLog[0].evolved.length || a.moves.join() !== a.before.moves.join())
    throw new Error("plain evolution failed: " + JSON.stringify(a));
  out.plain = a;

  await ctx.loadSave("route2-north");
  const b = await ctx.runEval(body(true));
  const learned = b.evoLog[0]?.trace.find(t => t.action === "replace move");
  if (b.species !== b.want.kadabra || b.level !== 16 || !b.field || !b.step || !learned || learned.slot !== 1
      || b.moves[1] !== b.want.confusion || [0, 2, 3].some(i => b.moves[i] !== b.before.moves[i]))
    throw new Error("evolution learn-move failed: " + JSON.stringify(b));
  out.learn = b;

  if (ctx.errors().length) throw new Error(ctx.errors().join("; "));
  return out;
}
