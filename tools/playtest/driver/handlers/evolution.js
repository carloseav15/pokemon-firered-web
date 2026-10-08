// Evolution scene (evolution_scene.c). It runs by itself; the only inputs are the learn-move Yes/No prompts and the
// forget-move summary screen. B would cancel the evolution and is never sent from here (no handler sends it).
// Plan: ctx.state.evolution = { before, forget: { monId, move, slot } } filled when the "forget a move?" prompt appears.
export const evolutionHandlers = {
  // First sight of the scene (species not changed yet): hand over to H.handleEvolution, which records the party before it
  // and runs its own drive with this screen waiting.
  "evolution": async (ctx) => {
    const r = await ctx.H.handleEvolution();
    if (!r.ok) return { stop: r.reason };
  },

  "evolution-yesno": async (ctx, rec) => {
    const H = ctx.H, party = H.dbgParty(), ev = ctx.state.evolution;
    if (!ev) return { stop: "evolution-prompt-outside-handleEvolution" };
    let yes;
    if (rec.details.forget) {
      // "Make it forget a move?": the move is the evolved species' learnset entry at its level; the policy picks the slot.
      const idx = party.findIndex((m, i) => m.species && m.species !== ev.before[i]);
      const mon = party[idx];
      const move = mon ? (H.rom.species[mon.species].learnset.find(([lvl, mv]) => lvl === mon.level && !mon.moves.includes(mv)) ?? [])[1] : undefined;
      const slot = move ? ctx.policy.forgetMove({ moves: mon.moves, move, types: H.rom.species[mon.species].types }, H.policyDeps()) : -1;
      ctx.state.forget = { monId: idx, species: mon?.species, move: move ?? null, slot, forgotten: slot >= 0 ? mon.moves[slot] : null, chosen: false };
      ev.trace.push({ action: slot >= 0 ? "replace move" : "decline replacement", ...ctx.state.forget });
      yes = slot >= 0;
    } else {
      yes = ctx.policy.battleYesNo("Cmd_yesnoboxstoplearningmove") !== false; // "Stop learning?"
    }
    // The prompt's cursor (sEvoCursorPos) is private and starts on YES: NO is one DOWN press; the state change is verified.
    if (!yes) await ctx.unobserved("D", "evolution prompt cursor is private; starts on YES");
    await ctx.input("A", { expect: (r) => r.screen !== "evolution-yesno", within: 600, label: yes ? "YES" : "NO" }); // input: evolution-yesno
  },
};
