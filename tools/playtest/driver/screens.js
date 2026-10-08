// Screen catalog of the playtest driver. recognize(H) reads the live game (active callbacks, tasks, battle
// controller and script command, script mode, menu cursors) and names the screen the player is looking at.
// A state that matches no rule is "unknown" with a dump of that state: callers must stop there, never press A.
// Rules are ordered; the first match wins. Each returns the details object (or null for "not this screen").
// Sources: the C functions named in each rule exist in src/fr (checked when the catalog was written).

/** Every screen name recognize() can return, except "unknown". The catalog job reports coverage against it. */
export const CATALOG = [
  "quest-log", "battle-transition", "text-wait", "evolution", "evolution-yesno", "summary-forget-move", "summary-view", "naming-screen",
  "shop-menu", "shop-loading", "shop-list", "shop-quantity", "shop-confirm", "shop-message",
  "bag-context", "bag-menu", "item-use-animation", "party-menu", "options-menu", "loading-screen",
  "battle-action", "battle-move", "battle-target", "battle-learn-yesno", "battle-yesno", "battle-nickname-yesno", "battle-levelup-box", "battle-busy",
  "yes-no", "multichoice", "pc-menu", "save-prompt", "save-busy", "start-menu",
  "dialog-wait", "dialog", "field-free", "field-busy", "map-loading",
];

// Text printer states that wait for A/B (gba/textPrinter.ts: Wait, Clear, ScrollStart use TextPrinterWait*): RENDER_STATE_WAIT 1, CLEAR 2, SCROLL_START 3.
const BUTTON_STATES = [1, 2, 3];
const has = (d, name) => d.tasks.includes(name);
const hasAny = (d, re) => d.tasks.some(n => re.test(n));

/** Raw readings shared by the rules. Cheap: no game state is changed. */
export function read(H) {
  const game = window.frGame, dbg = window.frDebug;
  const st = H.st(), scene = game?.scene?.constructor?.name ?? null;
  const tasks = H.T?.tasks.tasks.filter(t => t.isActive).map(t => t.func.name) ?? [];
  const cb1 = scene === "HwScene" ? H.R?.gMain.callback1?.name : game?.callback1?.name;
  const cb2 = H.cb2();
  const script = game?.overworld.script.global;
  const questLog = H.Q?.gQuestLogState;
  const playback = !!H.C && [H.C.QL_STATE_PLAYBACK, H.C.QL_STATE_PLAYBACK_LAST].includes(questLog);
  const inBattle = scene === "BattleTransitionScene" || scene === "HwScene" &&
    (!!H.R?.gMain.inBattle || cb1 === "BattleMainCB1" || /Battle/.test(cb2 ?? ""));
  const controller = inBattle ? H.G?.gBattlerControllerFuncs[0]?.name ?? null : null;
  // Any text printer (battle, party, shop... windows) waiting for A/B: hw/text.ts keeps one printer per window id.
  let textWait = null;
  try { for (let id = 0; id < 32 && !textWait; id++) { const p = H.TXT?.textPrinterOf(id); if (p?.active && BUTTON_STATES.includes(p.state)) textWait = { window: id, state: p.state, pos: p.pos }; } } catch { /* printers not ready */ }
  return { st, scene, textWait, tasks, cb1: cb1 ?? null, cb2: cb2 ?? null, script, questLog, playback, inBattle, controller,
    saveCallback: game?.activeSaveDialog?.saveDialogCB.name ?? null,
    standing: !!game?.overworld.player.object && game.overworld.player.isStandingStill(),
    dialog: !!game?.overworld.messageBox.printer?.active, printerState: game?.overworld.messageBox.printer?.state ?? null, hasGame: !!game, hasDebug: !!dbg };
}

/** Name of the battle script command the battle is executing (Cmd_*), or null outside a script. */
function battleCommand(H) {
  try {
    const addr = H.G.G.gBattlescriptCurrInstr;
    if (!addr) return null;
    const fn = H.CMDS.gBattleScriptingCommandsTable[H.BS.r8(addr)];
    return fn?.name ?? null;
  } catch { return null; }
}

const RULES = [
  ["quest-log", d => d.playback ? { state: d.questLog } : null],
  ["battle-transition", d => d.scene === "BattleTransitionScene" ? {} : null],
  // evolution_scene.c keeps its state in the Task_EvolutionScene task: data[0] EvoState, data[6] MoveState,
  // data[7] the state a YES leads to (MVSTATE_SHOW_MOVE_SELECT = "forget a move?", otherwise "stop learning?").
  ["text-wait", d => d.textWait ? { ...d.textWait } : null],
  ["evolution-yesno", (d, H) => /EvolutionScene/.test(d.cb2 ?? "") && evoTask(H)?.data[6] === EVO_MVSTATE_HANDLE_YES_NO
    ? { forget: evoTask(H).data[7] === EVO_MVSTATE_SHOW_MOVE_SELECT, state: evoTask(H).data[0] } : null],
  ["evolution", (d, H) => /EvolutionScene/.test(d.cb2 ?? "") ? { cb2: d.cb2, state: evoTask(H)?.data[0] ?? null, learn: evoTask(H)?.data[6] ?? null } : null],
  // The summary screen loads behind an anonymous placeholder callback; its input task identifies the forget-move mode.
  ["summary-forget-move", (d, H) => has(d, "Task_InputHandler_SelectOrForgetMove")
    ? { cursor: H.SUM?.GetMoveSlotToReplace?.() ?? null } : null],
  ["summary-view", d => /^CB2_(SetUpPSS|RunPokemonSummaryScreen)$/.test(d.cb2 ?? "") || /PokemonSummary/.test(d.cb2 ?? "")
    ? { cb2: d.cb2, loading: d.cb2 === "CB2_SetUpPSS" } : null],
  ["naming-screen", d => /Naming/.test(d.cb2 ?? "") ? { cb2: d.cb2 } : null],
  // Shop: the clerk menu (field), then the buy screen (CB2_InitBuyMenu / CB2_BuyMenu, its own HwScene) with the
  // buy list, quantity prompt, YES/NO confirmation (Task_CallYesOrNoCallback, then yesFunc) and message tasks.
  ["shop-loading", d => d.cb2 === "CB2_InitBuyMenu" ? {} : null],
  ["shop-quantity", (d, H) => d.cb2 === "CB2_BuyMenu" && has(d, "Task_BuyHowManyDialogueHandleInput") ? shopQuantity(H) : null],
  ["shop-confirm", d => d.cb2 === "CB2_BuyMenu" && has(d, "Task_CallYesOrNoCallback") ? {} : null],
  ["shop-message", d => d.cb2 === "CB2_BuyMenu" && hasAny(d, /^(Task_ReturnToItemListAfterItemPurchase|Task_ContinueTaskAfterMessagePrints|Task_ExitBuyMenu|yesFunc)$/)
    ? { tasks: d.tasks, waitingButton: has(d, "Task_ReturnToItemListAfterItemPurchase") } : null],
  ["shop-list", (d, H) => d.cb2 === "CB2_BuyMenu" && has(d, "Task_BuyMenu") ? shopList(H) : null],
  ["shop-menu", d => has(d, "Task_ShopMenu") ? {} : null],
  // Bag: a context menu (USE/GIVE/TOSS/CANCEL) over the list, or the list itself with its pocket and cursor.
  ["bag-context", (d, H) => d.cb2 === "CB2_BagMenuRun" && hasAny(d, /^Task_(FieldItemContextMenuHandleInput|ItemContext|ItemMenuAction)/) ? bagState(H, d) : null],
  ["bag-menu", (d, H) => d.cb2 === "CB2_BagMenuRun" ? bagState(H, d) : null],
  // Item-use animation over the party (HP bar fill / effect message): runs by itself, accepts no input.
  // pokemon_special_anim.c Task_UseItem_Normal: state 12 waits for A/B ("press a button to leave"); before it, A/B HELD cancels.
  ["item-use-animation", (d, H) => d.cb2 === "CB2_PSA" || hasAny(d, /^Task_(UseItem_|DoUseItemAnim|PartyMenuModifyHP|DisplayHPRestored)/) && d.scene
    ? psaState(H, d) : null],
  ["party-menu", (d, H) => d.cb2 === "CB2_UpdatePartyMenu" ? partyState(H, d) : null],
  ["options-menu", d => has(d, "Task_OptionMenu") || /^CB2_OptionMenu$/.test(d.cb2 ?? "") ? {} : null],
  // Battle: only controller / script states that accept input are named; everything else is "battle-busy" (no input).
  ["battle-action", (d, H) => d.inBattle && d.controller === "HandleInputChooseAction" ? { cursor: H.G.gActionSelectionCursor[0] } : null],
  ["battle-move", (d, H) => d.inBattle && d.controller === "HandleInputChooseMove" ? { cursor: H.G.gMoveSelectionCursor[0], pp: [...H.G.gBattleMons[0].pp] } : null],
  ["battle-target", d => d.inBattle && d.controller === "HandleInputChooseTarget" ? {} : null],
  ["battle-learn-yesno", (d, H) => d.inBattle && H.G.gBattleScripting.learnMoveState === 1 &&
    /^Cmd_yesnoboxlearnmove$|^Cmd_yesnoboxstoplearningmove$/.test(battleCommand(H) ?? "")
    ? { command: battleCommand(H), cursor: H.G.gBattleCommunication[H.C.CURSOR_POSITION] } : null],
  ["battle-nickname-yesno", (d, H) => d.inBattle && battleCommand(H) === "Cmd_trygivecaughtmonnick" && H.G.gBattleCommunication[H.C.MULTIUSE_STATE] === 1
    ? { cursor: H.G.gBattleCommunication[H.C.CURSOR_POSITION] } : null],
  ["battle-yesno", (d, H) => d.inBattle && battleCommand(H) === "Cmd_yesnobox" && H.G.gBattleCommunication[0] === 1
    ? { cursor: H.G.gBattleCommunication[H.C.CURSOR_POSITION] } : null],
  ["battle-levelup-box", (d, H) => d.inBattle && battleCommand(H) === "Cmd_drawlvlupbox" && [6, 8].includes(H.G.gBattleScripting.drawlvlupboxState)
    ? { page: H.G.gBattleScripting.drawlvlupboxState === 6 ? 1 : 2 } : null],
  ["battle-busy", (d, H) => d.inBattle ? { controller: d.controller, command: battleCommand(H), cb2: d.cb2 } : null],
  // Script-driven menus.
  ["yes-no", d => has(d, "Task_YesNoMenu_HandleInput") ? { entry: d.script?.entry ?? null } : null],
  ["multichoice", d => has(d, "Task_MultichoiceMenu_HandleInput") ? { entry: d.script?.entry ?? null } : null],
  ["pc-menu", d => has(d, "Task_PCMainMenu") ? {} : null],
  ["save-prompt", d => ["SaveDialogCB_AskSaveHandleInput", "SaveDialogCB_AskOverwriteOrReplacePreviousFileHandleInput"].includes(d.saveCallback) ? { callback: d.saveCallback } : null],
  // A save message waiting for a button (printer WAIT/CLEAR) is a dialog; otherwise the save dialog is working by itself.
  ["save-busy", d => (has(d, "saveInput") || d.saveCallback) && !(d.dialog && BUTTON_STATES.includes(d.printerState)) ? { callback: d.saveCallback } : null],
  ["start-menu", (d, H) => has(d, "startInput") ? { cursor: window.frGame.startMenuCursor } : null],
  // A scene other than the field without a rule above: an anonymous callback is a screen still loading.
  ["loading-screen", d => d.scene && (d.cb2 === "" || d.cb2 === null || /^CB2_(Init|Setup|SetUp|Return|Begin|Open|Go)/.test(d.cb2)) ? { scene: d.scene, cb2: d.cb2 } : null],
  ["map-loading", d => !d.hasGame || !d.scene && (!d.st.map || !window.frGame?.callback1) ? { cb1: d.cb1 } : null],
  ["dialog-wait", (d, H) => d.st.script && d.script?.mode === H.SC?.SCRIPT_MODE_NATIVE && d.script?.nativePtr?.name === "bound WaitForAorBPress" ? {} : null],
  ["dialog", d => d.dialog ? { script: !!d.st.script, printerState: d.printerState, waitingButton: BUTTON_STATES.includes(d.printerState) } : null],
  ["field-free", d => d.standing && !d.scene && !d.st.script && !d.st.locked ? {} : null],
  ["field-busy", d => !d.scene ? { script: !!d.st.script, locked: !!d.st.locked, standing: d.standing } : null],
];

function psaState(H, d) {
  let state = null;
  try { state = H.PSA.GetPSAStruct()?.state ?? null; } catch { /* no animation struct yet */ }
  return { cb2: d.cb2, tasks: d.tasks, state, waitingButton: has(d, "Task_UseItem_Normal") && state === 12 };
}
const EVO_MVSTATE_HANDLE_YES_NO = 4, EVO_MVSTATE_SHOW_MOVE_SELECT = 5; // enum MoveState in evolutionScene.ts
const evoTask = (H) => H.T.tasks.tasks.find(t => t.isActive && t.func.name === "Task_EvolutionScene");
/** Buy list: the task's ListMenu says which row the cursor is on and which item ids are listed (shop.ts tListTaskId = data[7]). */
function shopList(H) {
  const t = H.T.tasks.tasks.find(x => x.isActive && x.func.name === "Task_BuyMenu");
  const list = H.LM.listMenuOf(t.data[7]);
  const items = list.template.items.map(i => i.index);
  return { cursor: list.cursorPos + list.itemsAbove, items, selected: items[list.cursorPos + list.itemsAbove] ?? null };
}
function shopQuantity(H) {
  const t = H.T.tasks.tasks.find(x => x.isActive && x.func.name === "Task_BuyHowManyDialogueHandleInput");
  return { item: t?.data[5] ?? null, quantity: t?.data[1] ?? null };
}
function bagState(H, d) {
  const s = H.B.gBagMenuState, pocket = s.pocket;
  return { pocket, cursor: s.cursorPos[pocket] + s.itemsAbove[pocket], location: s.location, tasks: d.tasks.filter(n => /^Task_/.test(n)) };
}
function partyState(H, d) {
  const p = H.PM.gPartyMenu;
  const submenu = has(d, "Task_HandleSelectionMenuInput");
  return { action: p.action, menuType: p.menuType, slot: p.slotId, submenu, menuCursor: submenu ? H.MENU.Menu_GetCursorPos() : null,
    inBattle: d.inBattle, controller: d.controller, tasks: d.tasks.filter(n => /^Task_/.test(n)) };
}

/** { screen, details }. "unknown" carries the raw state so a stop can be diagnosed on the spot. */
export function recognize(H) {
  if (!H.C || !H.T) return { screen: "map-loading", details: { reason: "driver not initialised" }, raw: null };
  const d = read(H);
  for (const [screen, rule] of RULES) {
    const details = rule(d, H);
    if (details) return { screen, details, raw: d };
  }
  return { screen: "unknown", details: dump(H, d), raw: d };
}

export function dump(H, d = read(H)) {
  return { scene: d.scene, cb1: d.cb1, cb2: d.cb2, tasks: d.tasks, controller: d.controller, inBattle: d.inBattle,
    script: d.st.script, scriptMode: d.script?.mode ?? null, native: d.script?.nativePtr?.name ?? null, locked: d.st.locked,
    map: d.st.map, standing: d.standing, dialog: d.dialog, saveCallback: d.saveCallback, command: d.inBattle ? battleCommand(H) : null };
}
