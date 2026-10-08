// Bag, party menu, summary screen and the item-use animation. The goal { kind: "use-item", item, target, battle } makes
// them run BAG > item > USE > party member for a medicine; without a goal they only back out (or stop when input is required).
import { DriverStop } from "../loop.js";
import { battlePartyMenu, gridStep } from "./battle.js";

const OPEN_POCKET_ITEMS = (H) => H.C.OPEN_BAG_ITEMS;

export const menuHandlers = {
  "bag-menu": async (ctx, rec) => {
    const H = ctx.H, g = ctx.goal, B = H.B, st = B.gBagMenuState;
    if (g?.kind === "teach-move" && !g.consumed) {
      // HMs/TMs are used through the TM Case, a key item (item_menu.c ItemUseOutOfBattle_TMCase).
      if (st.pocket !== H.C.OPEN_BAG_KEYITEMS) {
        const p0 = st.pocket;
        await ctx.input(p0 > H.C.OPEN_BAG_KEYITEMS ? "L" : "R", { expect: () => st.pocket !== p0, within: 200, retry: 2, label: "key items pocket" }); // input: bag-menu
        return;
      }
      const index = window.frDebug.save.save.bag.keyItems.filter(e => e.quantity > 0).findIndex(e => e.item === H.C.ITEM_TM_CASE);
      if (index < 0) return { stop: "tm-case-not-in-bag" };
      const cursor = () => st.cursorPos[st.pocket] + st.itemsAbove[st.pocket];
      await ctx.cursorTo(index, cursor, (cur, want) => ({ button: cur < want ? "D" : "U" }), { limit: 20 });
      await ctx.input("A", { expect: (r) => r.screen === "bag-context", within: 200, retry: 1, label: "select TM Case" }); // input: bag-menu
      return;
    }
    if (g?.kind !== "use-item" || g.consumed) {
      if (!ctx.state.exitMenus && !g?.consumed) return { stop: "input-required" };
      await ctx.input("B", { expect: (r) => r.screen !== "bag-menu", within: 300, retry: 2, label: "close bag" }); // input: bag-menu
      return;
    }
    if (st.pocket !== OPEN_POCKET_ITEMS(H)) {
      const p0 = st.pocket;
      await ctx.input("L", { expect: () => st.pocket !== p0, within: 200, retry: 2, label: "previous pocket" }); // input: bag-menu
      return;
    }
    const index = window.frDebug.save.save.bag.items.findIndex(e => e.item === g.item && e.quantity > 0);
    if (index < 0) return { stop: "item-not-in-bag", info: { item: g.item } };
    const cursor = () => st.cursorPos[0] + st.itemsAbove[0];
    await ctx.cursorTo(index, cursor, (cur, want) => ({ button: cur < want ? "D" : "U" }), { limit: 60 });
    await ctx.input("A", { expect: (r) => r.screen === "bag-context", fail: () => null, within: 200, retry: 1, label: "select item" }); // input: bag-menu
    if (B.bagResult.itemId !== g.item) return { stop: "wrong-item-selected", info: { selected: B.bagResult.itemId, wanted: g.item } };
  },

  "bag-context": async (ctx) => {
    const g = ctx.goal;
    if (g?.kind === "teach-move" && !g.consumed) {
      const transient = ["bag-context", "bag-menu", "tm-case-list", "tm-case-closing", "loading-screen", "map-loading", "unknown"];
      await ctx.input("A", { expect: (r) => r.screen === "tm-case-list", fail: (r) => !transient.includes(r.screen) ? "wrong-screen-after-tm-case" : null, within: 600, retry: 1, label: "USE TM Case" }); // input: bag-context
      return;
    }
    if (g?.kind !== "use-item" || g.consumed) {
      await ctx.input("B", { expect: (r) => r.screen !== "bag-context", within: 200, retry: 2, label: "close item menu" }); // input: bag-context
      return;
    }
    // The field/battle item menu lists USE first (item menu actions); the effect is checked: the party menu in USE_ITEM mode.
    await ctx.input("A", { expect: (r) => r.screen === "party-menu" && r.details.action === ctx.H.C.PARTY_ACTION_USE_ITEM, within: 400, retry: 1, label: "USE" }); // input: bag-context
  },

  "party-menu": async (ctx, rec) => {
    const H = ctx.H, g = ctx.goal, d = rec.details, PM = H.PM;
    if (g?.kind === "teach-move" && !g.consumed) {
      // Choose the member (Task_HandleChooseMonInput); afterwards the messages/prompts run as their own screens.
      if (g.targetChosen) { await ctx.wait(4); return; }
      const slot = H.dbgParty().findIndex(m => m.personality === g.personality && m.otId === g.otId);
      if (slot < 0) return { stop: "teach-target-missing" };
      await ctx.cursorTo(slot, () => PM.gPartyMenu.slotId, () => ({ button: "D" }), { limit: 14 });
      await ctx.input("A", { expect: (r) => r.screen !== "party-menu" || r.details.tasks.join() !== d.tasks.join(), within: 300, retry: 1, label: "choose member to teach" }); // input: party-menu
      g.targetChosen = true;
      return;
    }
    if (g?.kind === "use-item" && !g.consumed) {
      // After the target was chosen the animation and the party refresh (Task_SetSacredAshCB etc.) run before the bag count drops.
      if (g.targetChosen) { await ctx.wait(4); return; }
      if (d.action !== H.C.PARTY_ACTION_USE_ITEM) return { stop: "unexpected-party-action", info: { action: d.action } };
      const slot = H.dbgParty().findIndex(m => m.personality === g.personality && m.otId === g.otId);
      if (slot < 0) return { stop: "medicine-target-missing" };
      await ctx.cursorTo(slot, () => PM.gPartyMenu.slotId, () => ({ button: "D" }), { limit: 14 });
      await ctx.input("A", { expect: (r) => r.screen !== "party-menu" || H.countItem(g.item) < g.count0, within: 300, retry: 1, label: "choose medicine target" }); // input: party-menu
      g.targetChosen = true;
      return;
    }
    // A medicine turn can end with the foe knocking the active out. Hand the forced
    // replacement back to the outer battle loop; B cannot cancel SEND_OUT.
    if (g?.consumed && d.inBattle && d.action === H.C.PARTY_ACTION_SEND_OUT && d.controller === "WaitForMonSelection")
      return { done: "medicine-turn-ended-with-forced-replacement" };
    if (g?.consumed) { // the result message is shown over the party menu: B acknowledges without selecting another member
      await ctx.input("B", { expect: (r) => r.screen !== "party-menu" || r.details.tasks.join() !== d.tasks.join(), within: 300, retry: 1, label: "acknowledge medicine" }); // input: party-menu
      return;
    }
    if (d.inBattle) return battlePartyMenu(ctx, rec);
    if (!ctx.state.exitMenus) return { stop: "input-required" };
    if (d.submenu) { await ctx.input("B", { expect: (r) => !r.details.submenu, within: 200, retry: 1, label: "close member menu" }); return; } // input: party-menu
    await ctx.input("B", { expect: (r) => r.screen !== "party-menu", within: 400, retry: 2, label: "close party menu" }); // input: party-menu
  },

  // TM Case list: put the cursor on the goal's TM/HM and open its USE/GIVE/EXIT menu; otherwise back out.
  "tm-case-list": async (ctx, rec) => {
    const g = ctx.goal;
    if (g?.kind !== "teach-move" || g.consumed) {
      if (!ctx.state.exitMenus && !g?.consumed) return { stop: "input-required" };
      await ctx.input("B", { expect: (r) => r.screen !== "tm-case-list", within: 400, retry: 2, label: "close TM Case" }); // input: tm-case-list
      return;
    }
    const want = rec.details.items.indexOf(g.item);
    if (want < 0) return { stop: "tm-not-in-case", info: { item: g.item, items: rec.details.items } };
    if (rec.details.row === null) { await ctx.wait(4); return; }
    await ctx.cursorTo(want, () => ctx.H.recognize().details.row, (cur, w) => ({ button: cur < w ? "D" : "U" }), { limit: 40 });
    await ctx.input("A", { expect: (r) => r.screen === "tm-case-context", within: 200, retry: 1, label: "select TM/HM" }); // input: tm-case-list
  },
  // USE is the first entry; the party menu in the learn mode must follow.
  "tm-case-context": async (ctx) => {
    const g = ctx.goal;
    if (g?.kind !== "teach-move" || g.consumed) {
      await ctx.input("B", { expect: (r) => r.screen !== "tm-case-context", within: 200, retry: 2, label: "close TM menu" }); // input: tm-case-context
      return;
    }
    const transient = ["tm-case-context", "tm-case-list", "tm-case-closing", "party-menu", "loading-screen", "map-loading", "unknown", "text-wait"];
    await ctx.input("A", { expect: (r) => r.screen === "party-menu", fail: (r) => !transient.includes(r.screen) ? "wrong-screen-after-tm-use" : null, within: 400, retry: 1, label: "USE TM/HM" }); // input: tm-case-context
  },
  // "Make it forget another move?" (Task_HandleReplaceMoveYesNoInput): YES leads to the forget-move summary screen.
  "party-yesno": async (ctx) => {
    const g = ctx.goal;
    if (g?.kind !== "teach-move") return { stop: "unexpected-party-yesno" };
    const yes = g.forgetSlot >= 0;
    if (!yes) await ctx.unobserved("D", "Yes/No cursor opens on YES; NO is the second entry", 12);
    await ctx.input(yes ? "A" : "B", { expect: (r) => r.screen !== "party-yesno", within: 120, retry: 1, label: yes ? "YES: forget a move" : "NO: do not learn" }); // input: party-yesno
    if (yes) ctx.state.forget = { slot: g.forgetSlot, move: g.move, chosen: false };
  },

  // Summary screen opened by START > POKEMON > SUMMARY (read-only): wait while loading, then B.
  "summary-view": async (ctx, rec) => {
    if (rec.details.loading) { await ctx.wait(4); return; }
    if (!ctx.state.exitMenus) { await ctx.wait(4); return; }
    await ctx.input("B", { expect: (r) => r.screen !== "summary-view", within: 400, retry: 2, label: "close summary" }); // input: summary-view
  },

  // Summary screen in forget-move mode (ShowSelectMovePokemonSummaryScreen). The plan comes from the learn prompt that
  // opened it: { slot, move } in ctx.state.forget or ctx.state.battle.learn; slot -1 declines with B.
  "summary-forget-move": async (ctx, rec) => {
    const H = ctx.H, plan = ctx.state.forget ?? ctx.state.battle?.learn;
    if (!plan) return { stop: "forget-move-without-plan" };
    if (plan.chosen) { await ctx.wait(4); return; }
    // The input handler ignores input while it fades in (Task_InputHandler_SelectOrForgetMove states 0-1).
    await ctx.wait(60);
    if (plan.slot < 0) {
      ctx.trace.push({ action: "decline replacement", move: plan.move });
      await ctx.input("B", { expect: (r) => r.screen !== "summary-forget-move", within: 400, label: "decline forgetting" }); // input: summary-forget-move
      plan.chosen = true;
      return;
    }
    // The cursor starts on the first move (sMoveSelectionCursorPos = 0 at setup) and is private to the screen: the
    // selected slot is verified after A through GetMoveSlotToReplace().
    for (let i = 0; i < plan.slot; i++) await ctx.unobserved("D", "summary cursor is private; starts at slot 0");
    await ctx.input("A", { expect: () => H.SUM.GetMoveSlotToReplace() === plan.slot, fail: () => H.SUM.GetMoveSlotToReplace() !== plan.slot && H.SUM.GetMoveSlotToReplace() < 4 ? "wrong-forget-slot" : null, within: 60, label: "forget slot" }); // input: summary-forget-move
    plan.chosen = true; plan.replaceSlotSeen = H.SUM.GetMoveSlotToReplace();
  },
};

/** Battle action menu for the goal "use-item": BAG is the top-right cell; the screen must change. */
export const battleItemMenu = async (ctx) => {
  const G = ctx.H.G;
  await ctx.cursorTo(1, () => G.gActionSelectionCursor[0], gridStep);
  await ctx.input("A", { expect: (r) => r.screen !== "battle-action", within: 300, retry: 1, label: "BAG" }); // input: battle-action
};
