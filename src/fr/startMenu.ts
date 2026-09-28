// start_menu.c: start-menu list construction and the shared list helper used
// by party_menu.c.

import type { Game } from "./game";
import * as C from "./generated/constants";
import { PlayRainStoppingSoundEffect } from "./field/weather";
import { GetNationalPokedexCount } from "./pokemon/pokemon";
import { IncrementGameStat, save } from "./save";
import { GetSafariZoneFlag, SafariZoneRetirePrompt } from "./field/safariZone";
import { intToDecimal, expandPlaceholders, stringVars, STR_CONV_MODE_RIGHT_ALIGN } from "./gba/charmap";
import { rom } from "./rom";
import { FONT_NORMAL } from "./gba/font";
import { tasks } from "./gba/tasks";
import { printText } from "./gba/textPrinter";
import { Window } from "./gba/window";
import { joy, JOY_NEW, START_BUTTON } from "./gba/input";
import { Menu, MENU_B_PRESSED, MENU_NOTHING_CHOSEN } from "./menus/menu";
import { paletteFade, FADE_TO_BLACK } from "./gba/fade";
import { StopPokemonLeagueLightingEffectTask } from "./field/leagueLighting";

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

/** SetUpReturnToStartMenu (start_menu.c); returning screens use the same active start-menu entry. */
export function SetUpReturnToStartMenu(game: Game): void { game.showStartMenu(); }

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

/** StartMenuSafariZoneRetireCallback (start_menu.c). */
export function StartMenuSafariZoneRetireCallback(game: Game): void {
  CloseStartMenu(game);
  SafariZoneRetirePrompt((script) => game.overworld.script.ScriptContext_SetupScript(script));
}
