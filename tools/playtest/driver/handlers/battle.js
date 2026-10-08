// Battle screens: action menu, move menu, the Yes/No prompts of battle_script_commands.c, the level-up box and the
// party menu opened from battle. The decisions come from the Policy; ctx.state.battle holds the per-battle bookkeeping
// (H.battle() creates it). Cursor positions are read from the game (gActionSelectionCursor, gMoveSelectionCursor,
// gBattleCommunication[CURSOR_POSITION], gPartyMenu.slotId) and every press states its postcondition.
import { DriverStop } from "../loop.js";
import { hpItem } from "../../strategy.js";

// Cells of the 2x2 action/move menus: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
export const gridStep = (cur, want) => ({ button: (cur & 1) < (want & 1) ? "R" : (cur & 1) > (want & 1) ? "L" : (cur >> 1) < (want >> 1) ? "D" : "U" });
const ACTION = { fight: 0, bag: 1, pokemon: 2, run: 3 };

export const battleHandlers = {
  "battle-action": async (ctx, rec) => {
    const H = ctx.H, G = H.G, b = ctx.state.battle, mons = G.gBattleMons;
    if (b.decision?.action === "switch" && mons[0].personality === b.decision.personality) b.decision = null;
    if (b.mode === "auto" && !b.decision) {
      const active = G.gBattlerPartyIndexes[0];
      const key = JSON.stringify([active, mons[1].species, mons[1].hp, mons[1].status1]);
      b.unchanged = key === b.lastKey ? b.unchanged + 1 : 0;
      b.incoming = b.lastHp?.active === active ? Math.max(0, b.lastHp.hp - mons[0].hp) : 0;
      b.lastHp = { active, hp: mons[0].hp }; b.lastKey = key;
      const o = ctx.policy.options;
      if (++b.decisions > o.maxDecisions || b.unchanged >= o.maxUnchanged) return { stop: "decision budget" };
      b.decision = H.battleDecision(b.incoming);
      const d = b.decision;
      ctx.trace.push({ ...d, remainingPP: d.pp, active, hp: mons[0].hp, foe: mons[1].species, foeHp: mons[1].hp, pp: [...mons[0].pp] });
      if (d.action === "stop") return { stop: d.reason };
      if (d.action === "item") {
        const personality = d.personality ?? mons[0].personality, otId = d.otId ?? mons[0].otId;
        const fieldSlot = H.policyMons().find(m => m.personality === personality && m.otId === otId)?.slot ?? -1;
        const used = await H.useItem(d.item, fieldSlot, { battle: true });
        ctx.trace.at(-1).used = used;
        // Measure damage from HP after the healing effect, not from pre-item HP.
        // Otherwise a Potion that merely offsets a hit looks like zero incoming
        // damage and the policy repeats ineffective healing until its budget ends.
        const beforeActive = used.before?.party.find(m => m.slot === active);
        if (used.ok && beforeActive) {
          const restored = fieldSlot === active ? hpItem(beforeActive, [{ item: d.item, quantity: 1 }], H.C)?.restores ?? 0 : 0;
          b.lastHp = { active, hp: beforeActive.hp + restored };
        }
        b.decision = null;
        if (!used.ok) return { stop: used.note ?? used.reason };
        return;
      }
    }
    // mode "switch": the lead comes out, then shift to party slot 1 so both share the experience.
    const wantSwitch = b.mode === "switch" && G.gBattlerPartyIndexes?.[0] === 0 && H.policyMons().find(m => m.slot === 1)?.hp > 0;
    const want = b.mode === "run" || b.decision?.action === "run" ? ACTION.run : wantSwitch || b.decision?.action === "switch" ? ACTION.pokemon : ACTION.fight;
    await ctx.cursorTo(want, () => G.gActionSelectionCursor[0], gridStep);
    await ctx.input("A", { expect: (r) => r.screen !== "battle-action", within: 300, label: `battle action ${want}` }); // input: battle-action
    if (b.decision?.action === "run") b.decision = null;
  },

  "battle-move": async (ctx, rec) => {
    const H = ctx.H, G = H.G, b = ctx.state.battle;
    const pp = G.gBattleMons?.[0]?.pp;
    // `slot` may be a function of the active species: { 16: 2, 2: 3 }[species].
    let want = b.mode === "auto" ? H.bestMoves()[0]?.slot : typeof b.slot === "function" ? b.slot(G.gBattleMons?.[0]?.species) : b.slot;
    if (b.mode === "auto" && want === undefined) return { stop: "no usable attack" };
    // With 0 PP the game prints "There's no PP left..." and returns here: pick a slot that has PP.
    if (pp && pp[want] === 0) for (let i = 0; i < 4; i++) if (pp[i] > 0) { want = i; break; }
    await ctx.cursorTo(want, () => G.gMoveSelectionCursor[0], gridStep);
    await ctx.input("A", { expect: (r) => r.screen !== "battle-move", within: 300, label: `battle move ${want}` }); // input: battle-move
    b.decision = null;
  },

  // Cmd_yesnoboxlearnmove ("Make it forget a move?") and Cmd_yesnoboxstoplearningmove ("Stop learning?").
  "battle-learn-yesno": async (ctx, rec) => {
    const H = ctx.H, G = H.G, b = ctx.state.battle, cursor = () => G.gBattleCommunication[H.C.CURSOR_POSITION];
    if (rec.details.command === "Cmd_yesnoboxlearnmove") {
      const monId = G.gBattleStruct.expGetterMonId, mon = H.dbgParty()[monId], move = G.G.gMoveToLearn;
      const slot = ctx.policy.forgetMove({ moves: mon.moves, move, types: H.rom.species[mon.species].types }, H.policyDeps());
      if (slot < 0) {
        ctx.trace.push({ action: "decline replacement", move });
        await ctx.input("B", { expect: (r) => r.details.command !== "Cmd_yesnoboxlearnmove" || r.screen !== "battle-learn-yesno", label: "decline learning" }); // input: battle-learn-yesno
        return;
      }
      await ctx.cursorTo(0, cursor, () => ({ button: "U" }));
      b.learn = { monId, species: mon.species, move, slot, forgotten: mon.moves[slot], chosen: false, checked: false, waits: 0 };
      ctx.trace.push({ action: "replace move", ...b.learn });
      await ctx.input("A", { expect: (r) => r.screen !== "battle-learn-yesno", within: 600, label: "YES: forget a move" }); // input: battle-learn-yesno
      return;
    }
    // "Stop learning?": the policy answers (YES by default, as the old driver did).
    const yes = ctx.policy.battleYesNo("Cmd_yesnoboxstoplearningmove") !== false;
    await ctx.cursorTo(yes ? 0 : 1, cursor, (cur, want) => ({ button: want < cur ? "U" : "D" }));
    await ctx.input("A", { expect: (r) => r.screen !== "battle-learn-yesno", within: 600, label: "stop learning" }); // input: battle-learn-yesno
  },

  // Cmd_yesnobox ("Will you switch Pokemon?" before the foe's next one): the policy answers, NO by default.
  "battle-yesno": async (ctx, rec) => {
    const H = ctx.H, cursor = () => H.G.gBattleCommunication[H.C.CURSOR_POSITION];
    const yes = ctx.policy.battleYesNo("Cmd_yesnobox") === true;
    ctx.trace.push({ action: "battle yes/no", command: "Cmd_yesnobox", answer: yes });
    await ctx.cursorTo(yes ? 0 : 1, cursor, (cur, want) => ({ button: want < cur ? "U" : "D" }));
    await ctx.input("A", { expect: (r) => r.screen !== "battle-yesno", within: 600, label: "switch prompt" }); // input: battle-yesno
  },

  // Cmd_trygivecaughtmonnick: never reached unless catching is enabled; the policy never nicknames.
  "battle-nickname-yesno": async (ctx, rec) => {
    const H = ctx.H, cursor = () => H.G.gBattleCommunication[H.C.CURSOR_POSITION];
    const yes = ctx.policy.nickname();
    await ctx.cursorTo(yes ? 0 : 1, cursor, (cur, want) => ({ button: want < cur ? "U" : "D" }));
    await ctx.input("A", { expect: (r) => r.screen !== "battle-nickname-yesno", within: 600, label: "nickname prompt" }); // input: battle-nickname-yesno
  },

  // Cmd_drawlvlupbox: state 6 shows page 1, 8 page 2; any new key advances (gMain.newKeys != 0). A is the key sent.
  "battle-levelup-box": async (ctx, rec) => {
    await ctx.input("A", { expect: (r) => r.screen !== "battle-levelup-box" || r.details.page !== rec.details.page, within: 300, label: "level-up box page" }); // input: battle-levelup-box
  },

  "battle-target": async () => ({ stop: "target selection (double battle) is not supported" }),
};

/** Party menu opened from a battle: choose the replacement (forced after a faint, or the policy's switch) or cancel an optional one. */
export async function battlePartyMenu(ctx, rec) {
  const H = ctx.H, G = H.G, PM = H.PM, b = ctx.state.battle, d = rec.details;
  const party = H.dbgParty();
  if (!b.sawPartyMenu) {
    ctx.trace.push({ action: "party selection", menuAction: d.action, liveHp: G.gBattleMons[0].hp, activePersonality: G.gBattleMons[0].personality, party: H.resources().party });
    b.sawPartyMenu = true;
  }
  // The action list of an IN_BATTLE menu is [SHIFT | SEND OUT, SUMMARY, CANCEL] (party_menu.h sPartyMenuAction_*).
  if (d.submenu) {
    if (d.menuCursor !== 0) await ctx.cursorTo(0, () => H.MENU.Menu_GetCursorPos(), () => ({ button: "U" }));
    await ctx.input("A", { expect: (r) => !r.details.submenu && r.screen !== "party-menu", within: 300, retry: 2, fail: (r) => r.screen === "summary-view" ? "wrong-party-action" : null, label: "SHIFT / SEND OUT" }); // input: party-menu
    b.sawPartyMenu = false; b.decision = null;
    return;
  }
  const active = G.gBattlerPartyIndexes?.[0];
  const target = b.decision?.action === "switch" ? party.findIndex(m => m.personality === b.decision.personality)
    : b.mode === "auto" ? H.bestReplacement() : b.mode === "switch" && active === 0 && party[1]?.hp > 0 ? 1
    : party.findIndex((m, i) => i !== active && m.species && !m.isEgg && m.hp > 0);
  if (target < 0) {
    // party_menu.c rejects B only for SEND_OUT (forced replacement); an optional CHOOSE_MON is declined through the UI.
    if (b.mode === "auto" && d.action !== H.C.PARTY_ACTION_SEND_OUT) {
      ctx.trace.push({ action: "cancel optional switch", menuAction: d.action, liveHp: G.gBattleMons[0].hp, party: H.resources().party });
      await ctx.input("B", { expect: (r) => r.screen !== "party-menu", within: 200, retry: 3, label: "cancel optional switch" }); // input: party-menu
      b.decision = null; b.sawPartyMenu = false;
      return;
    }
    ctx.trace.push({ action: "replacement unavailable", menuAction: d.action, liveHp: G.gBattleMons[0].hp, party: H.resources().party });
    return { stop: "no able replacement" };
  }
  await ctx.cursorTo(target, () => PM.gPartyMenu.slotId, (cur, want) => ({ button: "D" }), { limit: 14 });
  await ctx.input("A", { expect: (r) => r.details.submenu || r.screen !== "party-menu", within: 200, retry: 3, label: "select party member" }); // input: party-menu
}
