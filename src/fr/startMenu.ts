// start_menu.c: start-menu list construction and the shared list helper used
// by party_menu.c.

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
