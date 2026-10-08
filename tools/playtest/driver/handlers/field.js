// Field screens: dialog text, script Yes/No and menus, START menu, options, PC, save prompts.
// Dialog: A is sent only while the text printer is waiting for a button (RENDER_STATE_WAIT / RENDER_STATE_CLEAR) or the
// script sits in WaitForAorBPress, and the effect (printer/script moved on) is verified.
import { DriverStop } from "../loop.js";

const printerMoved = (r, before, changed) => changed;

export const fieldHandlers = {
  // After a lost battle the whiteout text (Task_RushInjuredPokemonToCenter) waits for A at its \p prompt; the printer must move on.
  "whiteout-message": async (ctx, rec) => {
    await ctx.input("A", { expect: (r) => r.screen !== "whiteout-message" || r.details.state !== rec.details.state || r.details.pos !== rec.details.pos, within: 240, label: "whiteout text" }); // input: whiteout-message
  },
  // A text printer (battle, party, shop... window) sits in a wait state (RENDER_STATE_WAIT / CLEAR / SCROLL_START): A moves it on.
  "text-wait": async (ctx, rec) => {
    await ctx.input("A", { expect: (r) => r.screen !== "text-wait" || r.details.state !== rec.details.state || r.details.pos !== rec.details.pos || r.details.window !== rec.details.window, within: 240, label: "advance text" }); // input: text-wait
  },

  "dialog": async (ctx, rec) => {
    if (!rec.details.waitingButton) { await ctx.wait(2); return; }
    await ctx.input("A", { expect: printerMoved, within: 240, label: "advance text" }); // input: dialog
  },
  "dialog-wait": async (ctx) => {
    await ctx.input("A", { expect: printerMoved, within: 240, label: "waitbuttonpress" }); // input: dialog-wait
  },

  // Script Yes/No: the answer is declared by the route for that script label (policy.answers); undeclared stops.
  "yes-no": async (ctx, rec) => {
    const H = ctx.H, entry = rec.details.entry, yes = ctx.policy.scriptYesNo(entry);
    if (yes === undefined) return { stop: "unanswered-yes-no", info: { entry } };
    ctx.trace.push({ action: "yes/no", entry, answer: yes });
    // The task ignores input for its first frames, hence the retry of the same verified press.
    await ctx.input(yes ? "A" : "B", { expect: (r) => r.screen !== "yes-no", within: 60, retry: 2, label: `answer ${yes ? "YES" : "NO"} (${entry})` }); // input: yes-no
  },

  // The Pokemon Center nurse offer (Task_MultichoiceMenu_HandleInput, YES first) when the drive's goal is healing.
  "multichoice": async (ctx, rec) => {
    const H = ctx.H, entry = rec.details.entry ?? "";
    if (ctx.goal?.kind === "heal" && /Nurse/.test(entry)) {
      await ctx.cursorTo(0, () => H.MENU.Menu_GetCursorPos(), () => ({ button: "U" }));
      ctx.goal.offered = true;
      await ctx.input("A", { expect: (r) => r.screen !== "multichoice", within: 90, retry: 2, label: "nurse: YES" }); // input: multichoice
      return;
    }
    if (ctx.state.exitMenus) {
      // B closes a list that allows it; script YES/NO offers (nurse, PC) ignore B, so fall back to the last entry (NO / EXIT),
      // found by moving the (observable) cursor down until it stops.
      try { await ctx.input("B", { expect: (r) => r.screen !== "multichoice", within: 60, retry: 1, label: "leave menu" }); return; } // input: multichoice
      catch (e) { if (!(e instanceof DriverStop) || e.reason !== "no-effect") throw e; }
      const pos = () => H.MENU.Menu_GetCursorPos();
      for (let i = 0; i < 12; i++) { const p0 = pos(); await ctx.unobserved("D", "cursor is read from Menu_GetCursorPos; moving to the last entry"); if (pos() === p0) break; }
      ctx.trace.push({ action: "multichoice last entry", entry, cursor: pos() });
      await ctx.input("A", { expect: (r) => r.screen !== "multichoice", within: 120, retry: 1, label: "last entry (NO / EXIT)" }); // input: multichoice
      return;
    }
    return { stop: "unhandled-multichoice", info: { entry } };
  },

  "pc-menu": async (ctx) => {
    if (!ctx.state.exitMenus) return { stop: "input-required" };
    await ctx.input("B", { expect: (r) => r.screen !== "pc-menu", within: 300, retry: 2, label: "leave PC" }); // input: pc-menu
  },

  // Full-screen read-only menus reached from START: leave with B when the drive is allowed to exit menus.
  "trainer-card": async (ctx) => {
    if (!ctx.state.exitMenus) return { stop: "input-required" };
    await ctx.input("B", { expect: (r) => r.screen !== "trainer-card", within: 400, retry: 2, label: "leave trainer card" }); // input: trainer-card
  },
  "pokedex": async (ctx, rec) => {
    if (!ctx.state.exitMenus) return { stop: "input-required" };
    await ctx.input("B", { expect: (r) => r.screen !== "pokedex" || r.details.cb2 !== rec.details.cb2, within: 400, retry: 2, label: "leave pokedex" }); // input: pokedex
  },

  "options-menu": async (ctx) => {
    if (!ctx.state.exitMenus) return { stop: "input-required" };
    await ctx.input("B", { expect: (r) => r.screen !== "options-menu", within: 300, retry: 2, label: "leave options" }); // input: options-menu
  },

  "start-menu": async (ctx, rec) => {
    const H = ctx.H, g = ctx.goal, game = window.frGame;
    const want = g?.kind === "use-item" || g?.kind === "teach-move" ? 2 : g?.kind === "save" ? 4 : g?.kind === "tour" ? g.entry : null; // start_menu.c STARTMENU_BAG / STARTMENU_SAVE / any entry of a menu tour
    if (want !== null && !g.menuUsed) {
      const S = await H.mod("/src/fr/save.ts"), SM = await H.mod("/src/fr/startMenu.ts");
      const menu = { order: [], numItems: 0, pokedexObtained: S.FlagGet(H.C.FLAG_SYS_POKEDEX_GET), pokemonObtained: S.FlagGet(H.C.FLAG_SYS_POKEMON_GET),
        linkStateActive: false, inUnionRoom: false, inSafariZone: false };
      SM.SetUpStartMenu(menu);
      const index = menu.order.indexOf(want);
      if (index < 0) return { stop: "start-menu-entry-missing", info: { want } };
      // The menu keeps its cursor in a private object: it opens on game.startMenuCursor (start_menu.c), D moves one entry
      // down (wrapping), and the chosen entry is verified by the screen A leads to.
      const presses = (index - game.startMenuCursor + menu.numItems) % menu.numItems;
      for (let i = 0; i < presses; i++) await ctx.unobserved("D", "start menu cursor is private; opens on startMenuCursor", 12);
      g.menuUsed = true;
      const tour = g.kind === "tour";
      const target = g.kind === "save" ? ["save-prompt", "save-busy"] : ["bag-menu"];
      const transient = ["start-menu", "loading-screen", "field-busy", "map-loading", "dialog"];
      await ctx.input("A", { expect: (r) => tour ? r.screen !== "start-menu" : target.includes(r.screen), fail: (r) => !tour && !target.includes(r.screen) && !transient.includes(r.screen) ? "wrong-start-menu-entry" : null, within: 300, retry: 1, label: "start menu entry" }); // input: start-menu
      return;
    }
    // The entry was chosen: the menu task is only closing (fade) while the chosen screen loads; the loop's watchdog bounds this.
    if (g?.menuUsed && !g.consumed && g.kind !== "tour") { await ctx.wait(2); return; }
    if (!ctx.state.exitMenus && !g?.consumed && g) return { stop: "input-required" };
    if (!ctx.state.exitMenus && !g) return { stop: "input-required" };
    await ctx.input("B", { expect: (r) => r.screen !== "start-menu", within: 300, retry: 2, label: "close START" }); // input: start-menu
  },

  "save-prompt": async (ctx, rec) => {
    const H = ctx.H, g = ctx.goal;
    if (g?.kind !== "save") {
      if (!ctx.state.exitMenus) return { stop: "input-required" };
      await ctx.input("B", { expect: (r) => r.screen !== "save-prompt", within: 300, label: "cancel save" }); // input: save-prompt
      return;
    }
    if (++g.prompts > 2) return { stop: "unexpected additional save prompt", info: { prompts: g.prompts } };
    g.promptLog.push({ frame: window.frGame.frameCount, callback: rec.details.callback });
    // The save dialog's Yes/No keeps its cursor in a private Menu. start_menu.c opens it on YES, except the "different game
    // file" prompt (DisplayYesNoMenuDefaultNo): one UP press reaches YES there. The result is verified: the dialog must move on
    // to saving (a NO would cancel back to the field / START menu).
    const defaultNo = /Overwrite|Replace/.test(rec.details.callback) && !!window.frGame.activeSaveDialog?.differentSaveFile;
    if (defaultNo) await ctx.unobserved("U", "save Yes/No cursor is private; this prompt opens on NO", 12);
    await ctx.input("A", { expect: (r) => r.screen !== "save-prompt" || r.details.callback !== rec.details.callback, fail: (r) => r.screen === "field-free" || r.screen === "start-menu" ? "save-cancelled" : null, within: 300, label: "save: YES" }); // input: save-prompt
  },

  "field-free": async (ctx) => {
    const g = ctx.goal;
    if ((g?.kind === "use-item" || g?.kind === "teach-move") && g.consumed) { await ctx.wait(4); return; } // the drive's until() decides when the field has stayed free
    if (g?.kind === "tour") {
      if (g.started) return { done: "tour-over" };
      g.started = true;
      await ctx.input("START", { expect: (r) => r.screen === "start-menu", within: 120, retry: 2, label: "open START" }); // input: field-free
      return;
    }
    if (g && !g.consumed && (g.kind === "use-item" || g.kind === "teach-move") || g?.kind === "save") {
      if (g.started) return { stop: g.kind === "save" ? "save-menu-closed" : "item-menu-closed", info: { goal: g.kind } };
      g.started = true;
      await ctx.input("START", { expect: (r) => r.screen === "start-menu", within: 120, retry: 2, label: "open START" }); // input: field-free
      return;
    }
    return { done: "field-free" };
  },
};
