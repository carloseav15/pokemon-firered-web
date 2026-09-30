// start_menu.c: start-menu list construction and the shared list helper used
// by party_menu.c.

import type { Game } from "./game";
import * as C from "./generated/constants";
import { IsWeatherNotFadingIn, PlayRainStoppingSoundEffect } from "./field/weather";
import { GetNationalPokedexCount } from "./pokemon/pokemon";
import { flagGet, IncrementGameStat, save } from "./save";
import { GetSafariZoneFlag, SafariZoneRetirePrompt } from "./field/safariZone";
import { intToDecimal, expandPlaceholders, stringVars, STR_CONV_MODE_RIGHT_ALIGN } from "./gba/charmap";
import { rom } from "./rom";
import { FONT_NORMAL } from "./gba/font";
import { tasks } from "./gba/tasks";
import { printText } from "./gba/textPrinter";
import { Window } from "./gba/window";
import { joy, JOY_NEW, A_BUTTON, START_BUTTON } from "./gba/input";
import { Menu, MENU_B_PRESSED, MENU_NOTHING_CHOSEN } from "./menus/menu";
import { paletteFade, FADE_FROM_BLACK, FADE_TO_BLACK, RGB_BLACK } from "./gba/fade";
import { StopPokemonLeagueLightingEffectTask } from "./field/leagueLighting";
import { FONT_SMALL, GetStringWidth } from "./gba/font";
import { SaveStatToString } from "./saveMenuUtil";

enum StartMenuOption {
  STARTMENU_POKEDEX = 0,
  STARTMENU_POKEMON,
  STARTMENU_BAG,
  STARTMENU_PLAYER,
  STARTMENU_SAVE,
  STARTMENU_OPTION,
  STARTMENU_EXIT,
  STARTMENU_RETIRE,
  STARTMENU_PLAYER2,
}

export interface StartMenuList {
  order: number[];
  numItems: number;
}

export interface StartMenuSetupState extends StartMenuList {
  pokedexObtained: boolean;
  pokemonObtained: boolean;
  linkStateActive: boolean;
  inUnionRoom: boolean;
  inSafariZone: boolean;
}

export interface StartMenuItem {
  text: Uint8Array;
  desc: string;
  action: () => void;
  canChoose?: () => boolean;
  fadeWhenChosen?: boolean;
}

export interface StartMenuDrawState {
  state: [number, number];
  items: StartMenuItem[];
  window: Window;
  safari: boolean;
  createWindow: () => void;
  drawSafariStats: () => void;
  onDrawComplete: () => void;
}

export interface StartMenuInputState {
  initialized: boolean;
  game: Game;
  menu: Menu;
  items: StartMenuItem[];
  printDescription: () => void;
  pendingAction?: () => void;
  waitForFade?: boolean;
}

/** AppendToList (start_menu.c): `cursor` models the C u8 position pointer. */
export function AppendToList(list: number[], cursor: { value: number }, newEntry: number): void {
  const position = cursor.value & 0xff;
  list[position] = newEntry & 0xff;
  cursor.value = (position + 1) & 0xff;
}

/** AppendToStartMenuItems (start_menu.c). */
export function AppendToStartMenuItems(state: StartMenuList, newEntry: number): void {
  const cursor = { value: state.numItems };
  AppendToList(state.order, cursor, newEntry);
  state.numItems = cursor.value;
}

/** SetUpStartMenu_NormalField (start_menu.c). */
export function SetUpStartMenu_NormalField(state: StartMenuSetupState): void {
  if (state.pokedexObtained) AppendToStartMenuItems(state, StartMenuOption.STARTMENU_POKEDEX);
  if (state.pokemonObtained) AppendToStartMenuItems(state, StartMenuOption.STARTMENU_POKEMON);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_BAG);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_PLAYER);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_SAVE);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_OPTION);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_EXIT);
}

/** SetUpStartMenu_SafariZone (start_menu.c). */
export function SetUpStartMenu_SafariZone(state: StartMenuSetupState): void {
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_RETIRE);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_POKEDEX);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_POKEMON);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_BAG);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_PLAYER);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_OPTION);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_EXIT);
}

/** SetUpStartMenu_Link (start_menu.c). */
export function SetUpStartMenu_Link(state: StartMenuSetupState): void {
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_POKEMON);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_BAG);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_PLAYER2);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_OPTION);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_EXIT);
}

/** SetUpStartMenu_UnionRoom (start_menu.c). */
export function SetUpStartMenu_UnionRoom(state: StartMenuSetupState): void {
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_POKEMON);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_BAG);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_PLAYER);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_OPTION);
  AppendToStartMenuItems(state, StartMenuOption.STARTMENU_EXIT);
}

/** SetUpStartMenu (start_menu.c). */
export function SetUpStartMenu(state: StartMenuSetupState): void {
  state.numItems = 0;
  state.order.length = 0;
  if (state.linkStateActive) SetUpStartMenu_Link(state);
  else if (state.inUnionRoom) SetUpStartMenu_UnionRoom(state);
  else if (state.inSafariZone) SetUpStartMenu_SafariZone(state);
  else SetUpStartMenu_NormalField(state);
}

/** ShowStartMenu (start_menu.c); the Game method owns the active Canvas task and menu state. */
export function ShowStartMenu(game: Game): void { game.showStartMenu(); }

/** SetUpReturnToStartMenu (start_menu.c); return through the source fade-in and input-task sequence. */
export function SetUpReturnToStartMenu(game: Game): void { game.showStartMenu(false, true); }

/** FieldCB2_DrawStartMenu (start_menu.c): finish drawing before the return fade starts. */
export function FieldCB2_DrawStartMenu(draw: StartMenuDrawState, game: Game, startInput: (taskId: number) => void): boolean {
  if (!DoDrawStartMenu(draw)) return false;
  FadeTransition_FadeInOnReturnToStartMenu(game, startInput);
  return true;
}

/** Task_WaitFadeAndCreateStartMenuTask (field_fadetransition.c). */
export function Task_WaitFadeAndCreateStartMenuTask(taskId: number, game: Game, startInput: (taskId: number) => void): void {
  if (!IsWeatherNotFadingIn() || !game.overworld.mapPreview.ForestMapPreviewScreenIsRunning()) return;
  tasks.destroy(taskId);
  tasks.create(startInput, 80);
}

/** FadeTransition_FadeInOnReturnToStartMenu (field_fadetransition.c). */
export function FadeTransition_FadeInOnReturnToStartMenu(game: Game, startInput: (taskId: number) => void): void {
  paletteFade.fill(RGB_BLACK);
  paletteFade.fadeScreen(FADE_FROM_BLACK, 0);
  paletteFade.fill(RGB_BLACK);
  tasks.create((taskId) => Task_WaitFadeAndCreateStartMenuTask(taskId, game, startInput), 80);
  game.overworld.controlsLocked = true;
}

/** FieldCB_ReturnToFieldOpenStartMenu (field_fadetransition.c). */
export function FieldCB_ReturnToFieldOpenStartMenu(game: Game): false {
  SetUpReturnToStartMenu(game);
  return false;
}

/** CloseStartMenu (start_menu.c); release and cleanup live on the field Game. */
export function CloseStartMenu(game: Game): void { game.closeStartMenu(); }

/** DrawSafariZoneStatsWindow (start_menu.c). */
export function DrawSafariZoneStatsWindow(game: Game): Window {
  const stats = new Window(2, 2, 10, 4);
  stats.frame = "std";
  stats.frameType = save.options.frameType;
  stats.fill(1);
  stringVars.var1 = intToDecimal(game.safariSteps ?? 0, STR_CONV_MODE_RIGHT_ALIGN, 3);
  stringVars.var2 = intToDecimal(600, STR_CONV_MODE_RIGHT_ALIGN, 3);
  stringVars.var3 = intToDecimal(game.safariBalls, STR_CONV_MODE_RIGHT_ALIGN, 2);
  printText(stats, FONT_NORMAL, expandPlaceholders(rom.text("gText_MenuSafariStats")), 4, 3);
  game.overworld.windows.add(stats);
  return stats;
}

/** DestroySafariZoneStatsWindow (start_menu.c). */
export function DestroySafariZoneStatsWindow(game: Game, window: Window | null): void {
  if (!GetSafariZoneFlag() || !window) return;
  game.overworld.windows.remove(window);
}

/** PrintStartMenuItems (start_menu.c): print at most nitems and keep the signed cursor. */
export function PrintStartMenuItems(draw: StartMenuDrawState, nitems: number): boolean {
  let i = draw.state[1];
  do {
    const item = draw.items[i]!;
    printText(draw.window, FONT_NORMAL, item.text, 8, i * 15);
    i++;
    if (i >= draw.items.length) {
      draw.state[1] = i;
      return true;
    }
  } while (--nitems !== 0);
  draw.state[1] = i;
  return false;
}

/** DoDrawStartMenu (start_menu.c): retain the six C drawing states and two rows per frame. */
export function DoDrawStartMenu(draw: StartMenuDrawState): boolean {
  switch (draw.state[0]) {
    case 0:
      draw.state[0]++;
      break;
    case 1:
      // SetUpStartMenu has already built the item order before the Canvas window is allocated.
      draw.state[0]++;
      break;
    case 2:
      draw.createWindow();
      draw.state[0]++;
      break;
    case 3:
      if (draw.safari) draw.drawSafariStats();
      draw.state[0]++;
      break;
    case 4:
      if (PrintStartMenuItems(draw, 2)) draw.state[0]++;
      break;
    case 5:
      draw.onDrawComplete();
      return true;
  }
  return false;
}

/** DrawStartMenuInOneGo (start_menu.c): reset the state and run each draw state synchronously. */
export function DrawStartMenuInOneGo(draw: StartMenuDrawState): void {
  draw.state[0] = 0;
  draw.state[1] = 0;
  while (!DoDrawStartMenu(draw)) { /* C busy-loops until state 5. */ }
}

/** task50_startmenu (start_menu.c): switch this task to the caller's follow-up once drawing ends. */
export function task50_startmenu(taskId: number, draw: StartMenuDrawState, followup: (taskId: number) => void): void {
  if (DoDrawStartMenu(draw)) tasks.setFunc(taskId, followup);
}

/** OpenStartMenuWithFollowupFunc (start_menu.c). */
export function OpenStartMenuWithFollowupFunc(draw: StartMenuDrawState, followup: (taskId: number) => void): number {
  draw.state[0] = 0;
  draw.state[1] = 0;
  return tasks.create((taskId) => task50_startmenu(taskId, draw, followup), 80);
}

/** StartCB_HandleInput (start_menu.c), using the menu cursor and action table bound to this field scene. */
export function StartCB_HandleInput(state: StartMenuInputState): boolean {
  const { game, menu, items } = state;
  const before = menu.cursorPos;
  const input = menu.processInput();
  if (menu.cursorPos !== before) state.printDescription();
  if (input === MENU_NOTHING_CHOSEN) {
    if (JOY_NEW(START_BUTTON)) { CloseStartMenu(game); return true; }
    return false;
  }
  if (input === MENU_B_PRESSED) { CloseStartMenu(game); return true; }
  if (items[input].canChoose?.() === false) return false;
  game.startMenuCursor = input;
  state.pendingAction = items[input].action;
  state.waitForFade = items[input].fadeWhenChosen !== false;
  StartMenu_FadeScreenIfLeavingOverworld(game, state.waitForFade);
  return false;
}

/** StartMenu_FadeScreenIfLeavingOverworld (start_menu.c). */
export function StartMenu_FadeScreenIfLeavingOverworld(game: Game, shouldFade: boolean): void {
  if (!shouldFade) return;
  StopPokemonLeagueLightingEffectTask();
  paletteFade.fadeScreen(FADE_TO_BLACK, 0);
}

/** Task_StartMenuHandleInput (start_menu.c): initialize once, then run the active callback each frame. */
export function Task_StartMenuHandleInput(taskId: number, state: StartMenuInputState): void {
  if (!state.initialized) {
    state.initialized = true;
    return;
  }
  if (state.pendingAction) {
    if (state.waitForFade && paletteFade.active) return;
    const action = state.pendingAction;
    state.pendingAction = undefined;
    state.waitForFade = false;
    action();
    tasks.destroy(taskId);
    return;
  }
  if (StartCB_HandleInput(state)) tasks.destroy(taskId);
}

/** PrintSaveStats (start_menu.c). */
export function PrintSaveStats(game: Game): Window {
  const ow = game.overworld;
  const stats = new Window(1, 1, 14, 9);
  stats.frame = "std";
  stats.frameType = save.options.frameType;
  stats.fill(1);

  const location = SaveStatToString(C.SAVE_STAT_LOCATION, 8, ow.header.regionMapSection);
  printText(stats, FONT_NORMAL, location, (112 - GetStringWidth(FONT_NORMAL, location)) >> 1, 0);
  const label = (y: number, name: string) => printText(stats, FONT_SMALL, rom.text(name), 2, y);
  const value = (y: number, text: ArrayLike<number>) => printText(stats, FONT_SMALL, text, 60, y);
  label(14, "gSaveStatName_Player");
  value(14, SaveStatToString(C.SAVE_STAT_NAME, 2));
  label(28, "gSaveStatName_Badges");
  value(28, SaveStatToString(C.SAVE_STAT_BADGES, 2));

  let y = 42;
  if (flagGet(C.FLAG_SYS_POKEDEX_GET)) {
    label(y, "gSaveStatName_Pokedex");
    value(y, SaveStatToString(C.SAVE_STAT_POKEDEX, 2));
    y += 14;
  }
  label(y, "gSaveStatName_Time");
  value(y, SaveStatToString(C.SAVE_STAT_TIME, 2));
  ow.windows.add(stats);
  return stats;
}

/** CloseSaveStatsWindow (start_menu.c): remove the current save summary window. */
export function CloseSaveStatsWindow(game: Game, window: Window): void {
  game.overworld.windows.remove(window);
}

/** CloseSaveStatsWindow_ (start_menu.c): C's small wrapper around the window cleanup. */
export function CloseSaveStatsWindow_(game: Game, window: Window): void { CloseSaveStatsWindow(game, window); }

/** CloseSaveMessageWindow (start_menu.c), adapted to the active message box. */
export function CloseSaveMessageWindow(game: Game): void { game.overworld.messageBox.hide(); }

/** StartMenuPokedexSanityCheck (start_menu.c). */
export function StartMenuPokedexSanityCheck(): boolean {
  return GetNationalPokedexCount(0) !== 0;
}

/** StartMenuPokedexCallback (start_menu.c): the Canvas screen performs the fade and field cleanup. */
export function StartMenuPokedexCallback(game: Game): boolean {
  IncrementGameStat(C.GAME_STAT_CHECKED_POKEDEX);
  PlayRainStoppingSoundEffect();
  game.openPokedex();
  return true;
}

/** StartMenuPokemonCallback (start_menu.c): fieldMenu owns the screen transition and cleanup. */
export function StartMenuPokemonCallback(game: Game): void {
  PlayRainStoppingSoundEffect();
  game.openPartyMenu();
}

/** StartMenuBagCallback (start_menu.c): the bag adapter owns the field handoff. */
export function StartMenuBagCallback(game: Game): void {
  PlayRainStoppingSoundEffect();
  game.openBag();
}

/** StartMenuPlayerCallback (start_menu.c): ShowPlayerTrainerCard supplies the screen callback. */
export function StartMenuPlayerCallback(game: Game): void {
  PlayRainStoppingSoundEffect();
  game.openTrainerCard();
}

/** StartMenuSaveCallback (start_menu.c). */
export function StartMenuSaveCallback(game: Game): void { game.startMenuSave(); }

/** StartMenuOptionCallback (start_menu.c): fieldMenu owns the screen transition and cleanup. */
export function StartMenuOptionCallback(game: Game): void {
  PlayRainStoppingSoundEffect();
  game.openOptions();
}

/** StartMenuExitCallback (start_menu.c). */
export function StartMenuExitCallback(game: Game): void { CloseStartMenu(game); }

export const SAVECB_RETURN_CONTINUE = 0;
export const SAVECB_RETURN_OKAY = 1;
export const SAVECB_RETURN_CANCEL = 2;
export const SAVECB_RETURN_ERROR = 3;

/** Runtime bridge for the active Start Menu save-dialog callback chain. */
export interface SaveDialogRuntime {
  saveDialogCB: (dialog: SaveDialogRuntime) => number;
  saveDialogDelay: number;
  saveSucceeded: boolean;
  differentSaveFile: boolean;
  messageIsHidden(): boolean;
  showMessage(text: Uint8Array): void;
  hideMessage(): void;
  showYesNo(defaultNo?: boolean): void;
  processInput(): number;
  hasUsableSave(): boolean;
  printSaveStats(): void;
  saveGame(): boolean;
  setDifferentSaveFile(value: boolean): void;
  playSuccessSE(): void;
  playErrorSE(): void;
  playSelectSE(): void;
  isSEPlaying(): boolean;
  closeStatsWindow(): void;
  finish(result: typeof SAVECB_RETURN_OKAY | typeof SAVECB_RETURN_CANCEL | typeof SAVECB_RETURN_ERROR): void;
  prepareForSave(): void;
  beginSaveHelpContext(): void;
}

/** StartMenu_PrepareForSave (start_menu.c). */
export function StartMenu_PrepareForSave(dialog: SaveDialogRuntime): void {
  dialog.prepareForSave();
  dialog.saveDialogCB = SaveDialogCB_PrintAskSaveText;
}

/** StartCB_Save1 (start_menu.c). */
export function StartCB_Save1(dialog: SaveDialogRuntime): false {
  dialog.beginSaveHelpContext();
  StartMenu_PrepareForSave(dialog);
  return false;
}

/** StartCB_Save2 (start_menu.c): dispatch the save callback and restore the start-menu flow. */
export function StartCB_Save2(dialog: SaveDialogRuntime): boolean {
  const result = RunSaveDialogCB(dialog);
  if (result === SAVECB_RETURN_OKAY || result === SAVECB_RETURN_ERROR || result === SAVECB_RETURN_CANCEL) {
    dialog.finish(result);
    return result !== SAVECB_RETURN_CANCEL;
  }
  return false;
}

/** RunSaveDialogCB (start_menu.c): invoke the current source callback. */
export function RunSaveDialogCB(dialog: SaveDialogRuntime): number {
  return dialog.saveDialogCB(dialog);
}

/** PrintSaveTextWithFollowupFunc (start_menu.c). */
export function PrintSaveTextWithFollowupFunc(
  dialog: SaveDialogRuntime,
  text: string,
  followup: SaveDialogRuntime["saveDialogCB"],
): void {
  dialog.showMessage(rom.text(text));
  dialog.saveDialogCB = followup;
}

/** SaveDialogCB_PrintAskSaveText (start_menu.c). */
export function SaveDialogCB_PrintAskSaveText(dialog: SaveDialogRuntime): number {
  dialog.printSaveStats();
  PrintSaveTextWithFollowupFunc(dialog, "gText_WouldYouLikeToSaveTheGame", SaveDialogCB_AskSavePrintYesNoMenu);
  return SAVECB_RETURN_CONTINUE;
}

/** SaveDialogCB_AskSavePrintYesNoMenu (start_menu.c). */
export function SaveDialogCB_AskSavePrintYesNoMenu(dialog: SaveDialogRuntime): number {
  if (!dialog.messageIsHidden()) return SAVECB_RETURN_CONTINUE;
  dialog.showYesNo();
  dialog.saveDialogCB = SaveDialogCB_AskSaveHandleInput;
  return SAVECB_RETURN_CONTINUE;
}

/** SaveDialogCB_AskSaveHandleInput (start_menu.c). */
export function SaveDialogCB_AskSaveHandleInput(dialog: SaveDialogRuntime): number {
  const input = dialog.processInput();
  if (input === -2) return SAVECB_RETURN_CONTINUE;
  if (input === 1 || input === -1) {
    dialog.closeStatsWindow();
    dialog.hideMessage();
    return SAVECB_RETURN_CANCEL;
  }
  if (input === 0) {
    dialog.hideMessage();
    if (dialog.hasUsableSave() || !dialog.differentSaveFile) dialog.saveDialogCB = SaveDialogCB_PrintAskOverwriteText;
    else dialog.saveDialogCB = SaveDialogCB_PrintSavingDontTurnOffPower;
  }
  return SAVECB_RETURN_CONTINUE;
}

/** SaveDialogCB_PrintAskOverwriteText (start_menu.c). */
export function SaveDialogCB_PrintAskOverwriteText(dialog: SaveDialogRuntime): number {
  PrintSaveTextWithFollowupFunc(
    dialog,
    dialog.differentSaveFile ? "gText_DifferentGameFile" : "gText_AlreadySaveFile_WouldLikeToOverwrite",
    dialog.differentSaveFile ? SaveDialogCB_AskReplacePreviousFilePrintYesNoMenu : SaveDialogCB_AskOverwritePrintYesNoMenu,
  );
  return SAVECB_RETURN_CONTINUE;
}

/** SaveDialogCB_AskOverwritePrintYesNoMenu (start_menu.c). */
export function SaveDialogCB_AskOverwritePrintYesNoMenu(dialog: SaveDialogRuntime): number {
  if (!dialog.messageIsHidden()) return SAVECB_RETURN_CONTINUE;
  dialog.showYesNo();
  dialog.saveDialogCB = SaveDialogCB_AskOverwriteOrReplacePreviousFileHandleInput;
  return SAVECB_RETURN_CONTINUE;
}

/** SaveDialogCB_AskReplacePreviousFilePrintYesNoMenu (start_menu.c). */
export function SaveDialogCB_AskReplacePreviousFilePrintYesNoMenu(dialog: SaveDialogRuntime): number {
  if (!dialog.messageIsHidden()) return SAVECB_RETURN_CONTINUE;
  dialog.showYesNo(true);
  dialog.saveDialogCB = SaveDialogCB_AskOverwriteOrReplacePreviousFileHandleInput;
  return SAVECB_RETURN_CONTINUE;
}

/** SaveDialogCB_AskOverwriteOrReplacePreviousFileHandleInput (start_menu.c). */
export function SaveDialogCB_AskOverwriteOrReplacePreviousFileHandleInput(dialog: SaveDialogRuntime): number {
  const input = dialog.processInput();
  if (input === -2) return SAVECB_RETURN_CONTINUE;
  if (input === 0) dialog.saveDialogCB = SaveDialogCB_PrintSavingDontTurnOffPower;
  else {
    dialog.closeStatsWindow();
    dialog.hideMessage();
    return SAVECB_RETURN_CANCEL;
  }
  return SAVECB_RETURN_CONTINUE;
}

/** SaveDialogCB_PrintSavingDontTurnOffPower (start_menu.c). */
export function SaveDialogCB_PrintSavingDontTurnOffPower(dialog: SaveDialogRuntime): number {
  PrintSaveTextWithFollowupFunc(dialog, "gText_SavingDontTurnOffThePower", SaveDialogCB_DoSave);
  return SAVECB_RETURN_CONTINUE;
}

/** SaveDialogCB_DoSave (start_menu.c). */
export function SaveDialogCB_DoSave(dialog: SaveDialogRuntime): number {
  if (!dialog.messageIsHidden()) return SAVECB_RETURN_CONTINUE;
  dialog.saveSucceeded = dialog.saveGame();
  dialog.setDifferentSaveFile(false);
  dialog.saveDialogCB = SaveDialogCB_PrintSaveResult;
  return SAVECB_RETURN_CONTINUE;
}

/** SaveDialogCB_PrintSaveResult (start_menu.c). */
export function SaveDialogCB_PrintSaveResult(dialog: SaveDialogRuntime): number {
  stringVars.var1 = Uint8Array.from(save.playerName);
  SetSaveDialogDelayTo60Frames(dialog);
  PrintSaveTextWithFollowupFunc(
    dialog,
    dialog.saveSucceeded ? "gText_PlayerSavedTheGame" : "gText_SaveError_PleaseExchangeBackupMemory",
    dialog.saveSucceeded ? SaveDialogCB_WaitPrintSuccessAndPlaySE : SaveDialogCB_WaitPrintErrorAndPlaySE,
  );
  return SAVECB_RETURN_CONTINUE;
}

/** SaveDialogCB_WaitPrintSuccessAndPlaySE (start_menu.c). */
export function SaveDialogCB_WaitPrintSuccessAndPlaySE(dialog: SaveDialogRuntime): number {
  if (dialog.messageIsHidden()) {
    dialog.playSuccessSE();
    dialog.saveDialogCB = SaveDialogCB_ReturnSuccess;
  }
  return SAVECB_RETURN_CONTINUE;
}

/** SaveDialogCB_ReturnSuccess (start_menu.c). */
export function SaveDialogCB_ReturnSuccess(dialog: SaveDialogRuntime): number {
  if (dialog.isSEPlaying() || !SaveDialog_Wait60FramesOrAButtonHeld(dialog)) return SAVECB_RETURN_CONTINUE;
  dialog.closeStatsWindow();
  dialog.hideMessage();
  return SAVECB_RETURN_OKAY;
}

/** SaveDialogCB_WaitPrintErrorAndPlaySE (start_menu.c). */
export function SaveDialogCB_WaitPrintErrorAndPlaySE(dialog: SaveDialogRuntime): number {
  if (dialog.messageIsHidden()) {
    dialog.playErrorSE();
    dialog.saveDialogCB = SaveDialogCB_ReturnError;
  }
  return SAVECB_RETURN_CONTINUE;
}

/** SaveDialogCB_ReturnError (start_menu.c). */
export function SaveDialogCB_ReturnError(dialog: SaveDialogRuntime): number {
  if (!SaveDialog_Wait60FramesThenCheckAButtonHeld(dialog)) return SAVECB_RETURN_CONTINUE;
  dialog.closeStatsWindow();
  dialog.hideMessage();
  return SAVECB_RETURN_ERROR;
}

/** SetSaveDialogDelayTo60Frames (start_menu.c): sSaveDialogDelay is u8. */
export function SetSaveDialogDelayTo60Frames(dialog: SaveDialogRuntime): void { dialog.saveDialogDelay = 60; }

/** SaveDialog_Wait60FramesOrAButtonHeld (start_menu.c): decrement with u8 wrap. */
export function SaveDialog_Wait60FramesOrAButtonHeld(dialog: SaveDialogRuntime): boolean {
  dialog.saveDialogDelay = (dialog.saveDialogDelay - 1) & 0xff;
  if (joy.held & A_BUTTON) { dialog.playSelectSE(); return true; }
  return dialog.saveDialogDelay === 0;
}

/** SaveDialog_Wait60FramesThenCheckAButtonHeld (start_menu.c). */
export function SaveDialog_Wait60FramesThenCheckAButtonHeld(dialog: SaveDialogRuntime): boolean {
  if (dialog.saveDialogDelay === 0) return (joy.held & A_BUTTON) !== 0;
  dialog.saveDialogDelay = (dialog.saveDialogDelay - 1) & 0xff;
  return false;
}

/** StartMenuSafariZoneRetireCallback (start_menu.c). */
export function StartMenuSafariZoneRetireCallback(game: Game): void {
  CloseStartMenu(game);
  SafariZoneRetirePrompt((script) => game.overworld.script.ScriptContext_SetupScript(script));
}
