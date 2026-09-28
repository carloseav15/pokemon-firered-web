// start_menu.c: start-menu list construction and the shared list helper used
// by party_menu.c.

import type { Game } from "./game";
import * as C from "./generated/constants";
import { PlayRainStoppingSoundEffect } from "./field/weather";
import { GetNationalPokedexCount } from "./pokemon/pokemon";
import { IncrementGameStat } from "./save";
import { SafariZoneRetirePrompt } from "./field/safariZone";

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
export function StartMenuExitCallback(game: Game): void { game.closeStartMenu(); }

/** StartMenuSafariZoneRetireCallback (start_menu.c). */
export function StartMenuSafariZoneRetireCallback(game: Game): void {
  game.closeStartMenu();
  SafariZoneRetirePrompt((script) => game.overworld.script.ScriptContext_SetupScript(script));
}
