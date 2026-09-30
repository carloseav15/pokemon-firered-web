// script_menu.c: yes/no boxes, multichoice lists, money/coins boxes and the
// picture box used by showmonpic.

import { sound } from "../audio/sound";
import { encode, expandPlaceholders, intToDecimal, stringVars, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "../gba/charmap";
import { FONT_NORMAL, FONT_NORMAL_COPY_1, FONT_SMALL, GetStringWidth } from "../gba/font";
import { paletteFade } from "../gba/fade";
import { Sprite } from "../gba/sprite";
import { tasks } from "../gba/tasks";
import { printText } from "../gba/textPrinter";
import { Window } from "../gba/window";
import { DATA_ROOT, rom } from "../rom";
import { cdata, incbin, incbin16, symName, type SymRef } from "../hw/assets";
import { flagGet, save, SV, varGet, varSet } from "../save";
import { joy, DPAD_DOWN, DPAD_UP } from "../gba/input";
import { GridMenu, Menu, MENU_B_PRESSED, MENU_NOTHING_CHOSEN } from "./menu";
import {
  DestroyListMenuTask, LIST_CANCEL, LIST_NO_MULTIPLE_SCROLL, LIST_NOTHING_CHOSEN, ListMenu_ProcessInput, ListMenuGetScrollAndRow, ListMenuInitOnSurface,
  listMenuTemplate, SCROLL_ARROW_UP,
} from "../hw/listMenu";
import { addFieldScrollArrows, fieldListSurface } from "./fieldListMenu";
import type { Overworld } from "../field/overworld";
import { GetCoins } from "../pokemon/items";
import {
  LISTMENU_BADGES, LISTMENU_SILPHCO_FLOORS, LISTMENU_ROCKET_HIDEOUT_FLOORS, LISTMENU_DEPT_STORE_FLOORS,
  LISTMENU_WIRELESS_LECTURE_HEADERS, LISTMENU_BERRY_POWDER, LISTMENU_TRAINER_TOWER_FLOORS,
  MULTICHOICE_TRADE_CENTER_COLOSSEUM, MULTICHOICE_TRADE_COLOSSEUM_CRUSH, MULTICHOICE_TRADE_COLOSSEUM_2,
  MULTICHOICE_NONE, MULTICHOICE_GAME_CORNER_TMPRIZES, MULTICHOICE_BIKE_SHOP, MULTICHOICE_GAME_CORNER_BATTLE_ITEM_PRIZES,
  SEAGALLOP_VERMILION_CITY, SEAGALLOP_FOUR_ISLAND, SEAGALLOP_FIVE_ISLAND, SEAGALLOP_SIX_ISLAND, SEAGALLOP_SEVEN_ISLAND, SEAGALLOP_MORE,
} from "../generated/constants";
import * as C from "../generated/constants";
import { spriteSheet } from "../field/gfx4bpp";
import { QL_AvoidDisplay } from "../questLogEvents";

export const SCR_MENU_UNSET = 0xff;
export const SCR_MENU_CANCEL = 127;

const MC_HEIGHTS = [1, 2, 4, 6, 7, 9, 11, 13, 14];

let sActiveScriptMenu: ScriptMenu | null = null;
let sDelay = 0;

export function setActiveScriptMenu(menu: ScriptMenu | null): void {
  sActiveScriptMenu = menu;
}

export function getActiveScriptMenu(): ScriptMenu | null {
  return sActiveScriptMenu;
}

const sSeagallopDestStrings = [
  "gText_Vermilion",
  "gText_OneIsland",
  "gText_TwoIsland",
  "gText_ThreeIsland",
  "gText_FourIsland",
  "gText_FiveIsland",
  "gText_SixIsland",
  "gText_SevenIsland",
];

const sDescriptionPtrs_CableClub_TradeBattleCancel = [
  "Trade POKéMON with another player\nusing a GBA Game Link cable.",
  "You may battle another TRAINER\nusing a GBA Game Link cable.",
  "Cancels the selected MENU item.",
];

const sDescriptionPtrs_WirelessCenter_TradeBattleCrushCancel = [
  "You may trade your POKéMON here\nwith another TRAINER.",
  "You may battle with your friends\nhere.",
  "Two to five TRAINERS can make\nBERRY POWDER together.",
  "Cancels the selected MENU item.",
];

const sDescriptionPtrs_WirelessCenter_TradeBattleCancel = [
  "You may trade your POKéMON here\nwith another TRAINER.",
  "You may battle with your friends\nhere.",
  "Cancels the selected MENU item.",
];

// Map from windowId (0..N) to Window object
const sWindows = new Map<number, Window>();
let sNextWindowId = 1;

export function GetStringTilesWide(str: Uint8Array | string): number {
  const bytes = typeof str === "string" ? expandPlaceholders(rom.text(str)) : str;
  return Math.floor((GetStringWidth(FONT_NORMAL_COPY_1, bytes, 0) + 7) / 8);
}

export function GetMenuWidthFromList(items: (Uint8Array | string)[], count?: number): number {
  const n = count ?? items.length;
  if (n <= 0) return 0;
  let width = GetStringTilesWide(items[0]);
  for (let i = 1; i < n; i++) {
    const tmp = GetStringTilesWide(items[i]);
    if (width < tmp) width = tmp;
  }
  return width;
}

export function CreateWindowFromRect(left: number, top: number, width: number, height: number): number {
  const window = new Window(left + 1, top + 1, width, height);
  const sm = sActiveScriptMenu;
  if (sm) {
    window.frame = "std";
    window.frameType = sm.frameType();
    window.fill(1);
    sm.getOverworld().windows.add(window);
  }
  const id = sNextWindowId++;
  sWindows.set(id, window);
  return id;
}

export function DestroyScriptMenuWindow(windowOrId: Window | number | undefined): void {
  if (windowOrId === undefined) return;
  let window: Window | undefined;
  if (typeof windowOrId === "number") {
    window = sWindows.get(windowOrId);
    sWindows.delete(windowOrId);
  } else {
    window = windowOrId;
    for (const [id, w] of sWindows.entries()) {
      if (w === window) {
        sWindows.delete(id);
        break;
      }
    }
  }
  if (!window) return;
  window.fill(0);
  window.markDirty();
  sActiveScriptMenu?.getOverworld().windows.remove(window);
}

export function GetMCWindowHeight(count: number): number {
  return MC_HEIGHTS[count] ?? 1;
}

type MCState = {
  windowId: number;
  menu: Menu;
  ignoreB: boolean;
  wrap: boolean;
  mcId: number;
};
const sMCState = new Map<number, MCState>();

export function CreateMCMenuInputHandlerTask(ignoreBpress: boolean | number, count: number, windowId: number, mcId: number): number {
  if (
    mcId === MULTICHOICE_TRADE_CENTER_COLOSSEUM ||
    mcId === MULTICHOICE_TRADE_COLOSSEUM_CRUSH ||
    mcId === MULTICHOICE_TRADE_COLOSSEUM_2
  ) {
    sDelay = 12;
  } else {
    sDelay = 0;
  }

  const taskId = tasks.create(Task_MultichoiceMenu_HandleInput, 80);
  const window = sWindows.get(windowId);
  const menu = window ? new Menu(window, FONT_NORMAL, 0, 2, 14, count, 0) : new Menu(new Window(0, 0, 1, 1), FONT_NORMAL, 0, 0, 0, 0, 0);
  sMCState.set(taskId, {
    windowId,
    menu,
    ignoreB: Boolean(ignoreBpress),
    wrap: count > 3,
    mcId,
  });
  MultiChoicePrintHelpDescription(mcId);
  return taskId;
}

export function Task_MultichoiceMenu_HandleInput(taskId: number): void {
  const state = sMCState.get(taskId);
  if (!state) {
    tasks.destroy(taskId);
    return;
  }
  if (!paletteFade.active) {
    if (sDelay !== 0) {
      sDelay--;
    } else {
      const input = state.wrap ? state.menu.processInput() : state.menu.processInputNoWrap();
      if ((joy.newKeys & (DPAD_UP | DPAD_DOWN)) !== 0) {
        MultiChoicePrintHelpDescription(state.mcId);
      }
      switch (input) {
        case MENU_NOTHING_CHOSEN:
          return;
        case MENU_B_PRESSED:
          if (state.ignoreB) return;
          sound.playSE(sound.SE_SELECT);
          varSet(SV.RESULT, SCR_MENU_CANCEL);
          break;
        default:
          varSet(SV.RESULT, input);
          break;
      }
      DestroyScriptMenuWindow(state.windowId);
      sMCState.delete(taskId);
      tasks.destroy(taskId);
      sActiveScriptMenu?.getOverworld().script.ScriptContext_Enable();
    }
  }
}

export function MultiChoicePrintHelpDescription(mcId: number): void {
  const sm = sActiveScriptMenu;
  if (!sm) return;
  let text = "";
  if (mcId === MULTICHOICE_TRADE_CENTER_COLOSSEUM) {
    text = sDescriptionPtrs_CableClub_TradeBattleCancel[0] ?? "";
  } else if (mcId === MULTICHOICE_TRADE_COLOSSEUM_CRUSH) {
    text = sDescriptionPtrs_WirelessCenter_TradeBattleCrushCancel[0] ?? "";
  } else if (mcId === MULTICHOICE_TRADE_COLOSSEUM_2) {
    text = sDescriptionPtrs_WirelessCenter_TradeBattleCancel[0] ?? "";
  }
  if (text) {
    sm.getOverworld().messageBox.show(encode(text));
  }
}

export function DrawVerticalMultichoiceMenu(left: number, top: number, mcId: number, ignoreBpress: boolean | number, initPos: number): void {
  const sm = sActiveScriptMenu;
  if (!sm) return;
  if (!(Number(ignoreBpress) & 2) && QL_AvoidDisplay(sm.getOverworld(), QL_DestroyAbortedDisplay)) return;
  const list = (rom.scriptMenu.multichoice[String(mcId)] ?? []) as string[];
  const count = list.length;
  const texts = list.map((sym) => expandPlaceholders(rom.text(sym)));
  let strWidth = 0;
  for (const t of texts) {
    const w = GetStringWidth(FONT_NORMAL, t, 0);
    if (w > strWidth) strWidth = w;
  }
  const width = Math.floor((strWidth + 9) / 8) + 1;
  if (left + width > 28) left = 28 - width;
  const height = GetMCWindowHeight(count);
  const windowId = CreateWindowFromRect(left, top, width, height);
  const window = sWindows.get(windowId)!;
  texts.forEach((t, i) => printText(window, FONT_NORMAL, t, 8, 2 + i * 14));
  const menu = new Menu(window, FONT_NORMAL, 0, 2, 14, count, initPos);
  const taskId = tasks.create(Task_MultichoiceMenu_HandleInput, 80);
  sMCState.set(taskId, {
    windowId,
    menu,
    ignoreB: Boolean(Number(ignoreBpress) & 1),
    wrap: count > 3,
    mcId,
  });
  MultiChoicePrintHelpDescription(mcId);
}

export function ScriptMenu_Multichoice(left: number, top: number, mcId: number, ignoreBpress: boolean | number): boolean {
  if (tasks.isActive(Task_MultichoiceMenu_HandleInput)) return false;
  varSet(SV.RESULT, SCR_MENU_UNSET);
  DrawVerticalMultichoiceMenu(left, top, mcId, ignoreBpress, 0);
  return true;
}

export function ScriptMenu_MultichoiceWithDefault(left: number, top: number, mcId: number, ignoreBpress: boolean | number, cursorPos: number): boolean {
  if (tasks.isActive(Task_MultichoiceMenu_HandleInput)) return false;
  varSet(SV.RESULT, SCR_MENU_UNSET);
  DrawVerticalMultichoiceMenu(left, top, mcId, ignoreBpress, cursorPos);
  return true;
}

type YesNoState = {
  windowId: number;
  menu: Menu;
  timer: number;
};
const sYesNoState = new Map<number, YesNoState>();

export function IsScriptActive(): boolean {
  return varGet(SV.RESULT) !== SCR_MENU_UNSET;
}

export function ScriptMenu_YesNo(_unused = 0, _stuff = 0, defaultChoice = 0): boolean {
  if (tasks.isActive(Task_YesNoMenu_HandleInput)) return false;
  if (sActiveScriptMenu && QL_AvoidDisplay(sActiveScriptMenu.getOverworld(), QL_DestroyAbortedDisplay)) return true;
  varSet(SV.RESULT, SCR_MENU_UNSET);
  const windowId = CreateWindowFromRect(20, 8, 6, 4);
  const window = sWindows.get(windowId);
  if (!window) return false;
  printText(window, FONT_NORMAL, rom.text("gText_YesNo"), 10, 2);
  const menu = new Menu(window, FONT_NORMAL, 0, 2, 14, 2, defaultChoice);
  const taskId = tasks.create(Task_YesNoMenu_HandleInput, 80);
  sYesNoState.set(taskId, { windowId, menu, timer: 0 });
  return true;
}

export function Task_YesNoMenu_HandleInput(taskId: number): void {
  const state = sYesNoState.get(taskId);
  if (!state) {
    tasks.destroy(taskId);
    return;
  }
  if (state.timer < 5) {
    state.timer++;
    return;
  }
  const input = state.menu.processInputNoWrap();
  switch (input) {
    case MENU_NOTHING_CHOSEN:
      return;
    case MENU_B_PRESSED:
    case 1: // NO
      sound.playSE(sound.SE_SELECT);
      varSet(SV.RESULT, 0);
      break;
    case 0: // YES
      varSet(SV.RESULT, 1);
      break;
  }
  DestroyScriptMenuWindow(state.windowId);
  sYesNoState.delete(taskId);
  tasks.destroy(taskId);
  sActiveScriptMenu?.getOverworld().script.ScriptContext_Enable();
}

type GridState = {
  windowId: number;
  menu: GridMenu;
  ignoreB: boolean;
};
const sGridState = new Map<number, GridState>();

export function ScriptMenu_MultichoiceGrid(left: number, top: number, multichoiceId: number, ignoreBpress: boolean | number, columnCount: number): boolean {
  if (tasks.isActive(Hask_MultichoiceGridMenu_HandleInput)) return false;
  if (sActiveScriptMenu && QL_AvoidDisplay(sActiveScriptMenu.getOverworld(), QL_DestroyAbortedDisplay)) return true;
  varSet(SV.RESULT, SCR_MENU_UNSET);
  const list = (rom.scriptMenu.multichoice[String(multichoiceId)] ?? []) as string[];
  const count = list.length;
  const texts = list.map((sym) => expandPlaceholders(rom.text(sym)));
  const width = GetMenuWidthFromList(texts, count) + 1;
  const rowCount = Math.floor(count / columnCount);
  const windowId = CreateWindowFromRect(left, top, width * columnCount, rowCount * 2);
  const window = sWindows.get(windowId)!;
  texts.forEach((t, i) =>
    printText(window, FONT_NORMAL_COPY_1, t, (i % columnCount) * width * 8 + 8, Math.floor(i / columnCount) * 16 + 1)
  );
  const menu = new GridMenu(window, FONT_NORMAL_COPY_1, 0, 1, width * 8, 16, columnCount, rowCount);
  const taskId = tasks.create(Hask_MultichoiceGridMenu_HandleInput, 80);
  sGridState.set(taskId, { windowId, menu, ignoreB: Boolean(ignoreBpress) });
  return true;
}

export function Hask_MultichoiceGridMenu_HandleInput(taskId: number): void {
  const state = sGridState.get(taskId);
  if (!state) {
    tasks.destroy(taskId);
    return;
  }
  const input = state.menu.processInput();
  switch (input) {
    case MENU_NOTHING_CHOSEN:
      return;
    case MENU_B_PRESSED:
      if (state.ignoreB) return;
      sound.playSE(sound.SE_SELECT);
      varSet(SV.RESULT, SCR_MENU_CANCEL);
      break;
    default:
      varSet(SV.RESULT, input);
      break;
  }
  DestroyScriptMenuWindow(state.windowId);
  sGridState.delete(taskId);
  tasks.destroy(taskId);
  sActiveScriptMenu?.getOverworld().script.ScriptContext_Enable();
}

export function CreatePCMenu(): boolean {
  if (tasks.isActive(Task_MultichoiceMenu_HandleInput)) return false;
  varSet(SV.RESULT, SCR_MENU_UNSET);
  CreatePCMenuWindow();
  return true;
}

export function CreatePCMenuWindow(): void {
  const k = rom.constants;
  const dex = flagGet(k.FLAG_SYS_POKEDEX_GET);
  const clear = flagGet(k.FLAG_SYS_GAME_CLEAR);
  const numItems = clear ? 5 : dex ? 4 : 3;
  const pcTextTiles = GetStringTilesWide(expandPlaceholders(rom.text("gText_SPc")));
  const width = pcTextTiles === 9 || pcTextTiles === 10 || dex ? 14 : 13;
  const windowId = CreateWindowFromRect(0, 0, width, clear ? 10 : numItems * 2);
  const window = sWindows.get(windowId)!;
  printText(window, FONT_NORMAL, rom.text(flagGet(k.FLAG_SYS_NOT_SOMEONES_PC) ? "gText_BillSPc" : "gText_SomeoneSPc"), 8, 2);
  printText(window, FONT_NORMAL, expandPlaceholders(rom.text("gText_SPc")), 8, 18);
  if (clear) {
    printText(window, FONT_NORMAL, rom.text("gText_ProfOakSPc"), 8, 34);
    printText(window, FONT_NORMAL, rom.text("gText_HallOfFame_2"), 8, 50);
    printText(window, FONT_NORMAL, rom.text("gText_LogOff"), 8, 66);
  } else {
    if (dex) printText(window, FONT_NORMAL, rom.text("gText_ProfOakSPc"), 8, 34);
    printText(window, FONT_NORMAL, rom.text("gText_LogOff"), 8, 2 + 16 * (numItems - 1));
  }
  const menu = new Menu(window, FONT_NORMAL, 0, 2, 16, numItems, 0);
  const taskId = tasks.create(Task_MultichoiceMenu_HandleInput, 80);
  sMCState.set(taskId, {
    windowId,
    menu,
    ignoreB: false,
    wrap: numItems > 3,
    mcId: MULTICHOICE_NONE,
  });
}

export function ScriptMenu_DisplayPCStartupPrompt(): void {
  sActiveScriptMenu?.getOverworld().messageBox.show(rom.text("Text_AccessWhichPC"));
}

type MonPicState = {
  windowId: number;
  sprite: Sprite;
  state: number;
  species: number;
};
let sMonPicState: MonPicState | null = null;
let sMonPicTaskId = -1;

export function Task_ScriptShowMonPic(taskId: number): void {
  const pic = sMonPicState;
  if (!pic) {
    tasks.destroy(taskId);
    return;
  }
  switch (pic.state) {
    case 0:
      pic.state++;
      break;
    case 1:
      break;
    case 2:
      sActiveScriptMenu?.getOverworld().sprites.destroy(pic.sprite);
      pic.state++;
      break;
    case 3:
      DestroyScriptMenuWindow(pic.windowId);
      tasks.destroy(taskId);
      sMonPicState = null;
      sMonPicTaskId = -1;
      break;
  }
}

export function ScriptMenu_ShowPokemonPic(species: number, x: number, y: number): boolean {
  if (sMonPicTaskId >= 0 && tasks.tasks[sMonPicTaskId]?.isActive) return false;
  const sm = sActiveScriptMenu;
  if (!sm) return false;
  if (QL_AvoidDisplay(sm.getOverworld(), QL_DestroyAbortedDisplay)) return true;
  const windowId = CreateWindowFromRect(x, y, 8, 8);
  const sprite = new Sprite();
  sprite.frameImages = [{ url: `${DATA_ROOT}/gfx/pokemon/front/${species}.png`, index: 0, width: 64, height: 64 }];
  sprite.width = 64;
  sprite.height = 64;
  sprite.centerToCornerVecX = -32;
  sprite.centerToCornerVecY = -32;
  sprite.x = 8 * x + 40;
  sprite.y = 8 * y + 40;
  sprite.coordOffsetEnabled = false;
  sprite.priority = 0;
  sprite.aboveWindows = true;
  sm.getOverworld().sprites.add(sprite);
  sMonPicTaskId = tasks.create(Task_ScriptShowMonPic, 80);
  sMonPicState = {
    windowId,
    sprite,
    state: 0,
    species,
  };
  return true;
}

export function PicboxWait(): boolean {
  return sMonPicTaskId < 0 || !tasks.tasks[sMonPicTaskId]?.isActive;
}

export function ScriptMenu_HidePokemonPic(): (() => boolean) | null {
  if (sMonPicTaskId < 0 || !tasks.tasks[sMonPicTaskId]?.isActive || !sMonPicState) return null;
  sMonPicState.state++;
  return PicboxWait;
}

export function PicboxCancel(): void {
  if (sMonPicTaskId < 0 || !tasks.tasks[sMonPicTaskId]?.isActive || !sMonPicState) return;
  if (sMonPicState.state < 3) {
    sActiveScriptMenu?.getOverworld().sprites.destroy(sMonPicState.sprite);
  }
  DestroyScriptMenuWindow(sMonPicState.windowId);
  tasks.destroy(sMonPicTaskId);
  sMonPicState = null;
  sMonPicTaskId = -1;
}

type MuseumFossilState = {
  windowId: number;
  sprite: Sprite;
  state: number;
};
let sMuseumFossilState: MuseumFossilState | null = null;
let sMuseumFossilTaskId = -1;

export function Task_WaitMuseumFossilPic(taskId: number): void {
  const pic = sMuseumFossilState;
  if (!pic) {
    tasks.destroy(taskId);
    return;
  }
  switch (pic.state) {
    case 0:
      pic.state++;
      break;
    case 1:
      break;
    case 2:
      sActiveScriptMenu?.getOverworld().sprites.destroy(pic.sprite);
      pic.state++;
      break;
    case 3:
      DestroyScriptMenuWindow(pic.windowId);
      tasks.destroy(taskId);
      sMuseumFossilState = null;
      sMuseumFossilTaskId = -1;
      break;
  }
}

export function OpenMuseumFossilPic(): boolean {
  if (sMuseumFossilTaskId >= 0 && tasks.tasks[sMuseumFossilTaskId]?.isActive) return false;
  const sm = sActiveScriptMenu;
  if (!sm) return false;
  if (QL_AvoidDisplay(sm.getOverworld(), QL_DestroyAbortedDisplay)) return true;
  const species = varGet(SV.x8004);
  if (species !== C.SPECIES_KABUTOPS && species !== C.SPECIES_AERODACTYL) return false;
  const name = species === C.SPECIES_KABUTOPS ? "Kabutops" : "Aerodactyl";
  const x = varGet(SV.x8005);
  const y = varGet(SV.x8006);
  const windowId = CreateWindowFromRect(x, y, 8, 8);
  const tiles = incbin(`sMuseum${name}SprTiles`);
  const pal = incbin16(`sMuseum${name}SprPalette`);
  const image = spriteSheet(tiles, pal, 64, 64);
  const sprite = new Sprite();
  sprite.width = 64;
  sprite.height = 64;
  sprite.centerToCornerVecX = -32;
  sprite.centerToCornerVecY = -32;
  sprite.x = x * 8 + 40;
  sprite.y = y * 8 + 40;
  sprite.coordOffsetEnabled = false;
  sprite.priority = 0;
  sprite.aboveWindows = true;
  sprite.draw = (c, dx, dy) => c.drawImage(image, dx, dy);
  sm.getOverworld().sprites.add(sprite);
  sMuseumFossilTaskId = tasks.create(Task_WaitMuseumFossilPic, 80);
  sMuseumFossilState = {
    windowId,
    sprite,
    state: 0,
  };
  return true;
}

export function CloseMuseumFossilPic(): boolean {
  if (sMuseumFossilTaskId < 0 || !sMuseumFossilState) return false;
  sMuseumFossilState.state++;
  return true;
}

export function QL_DestroyAbortedDisplay(): void {
  sActiveScriptMenu?.getOverworld().script.ScriptContext_SetupScript(rom.label("EventScript_ReleaseEnd"));
  PicboxCancel();
  if (sMuseumFossilState && sMuseumFossilTaskId >= 0) {
    if (sMuseumFossilState.state < 2) {
      sActiveScriptMenu?.getOverworld().sprites.destroy(sMuseumFossilState.sprite);
    }
    DestroyScriptMenuWindow(sMuseumFossilState.windowId);
    tasks.destroy(sMuseumFossilTaskId);
    sMuseumFossilState = null;
    sMuseumFossilTaskId = -1;
  }
}

export function DrawSeagallopDestinationMenu(): void {
  const origin = varGet(SV.x8004);
  const page = varGet(SV.x8005);
  let destinationId: number;
  let numItems: number;
  let top: number;
  varSet(SV.RESULT, SCR_MENU_UNSET);
  if (sActiveScriptMenu && QL_AvoidDisplay(sActiveScriptMenu.getOverworld(), QL_DestroyAbortedDisplay)) return;

  if (page === 1) {
    if (origin < SEAGALLOP_FIVE_ISLAND) destinationId = SEAGALLOP_FIVE_ISLAND;
    else destinationId = SEAGALLOP_FOUR_ISLAND;
    numItems = 5;
    top = 2;
  } else {
    destinationId = SEAGALLOP_VERMILION_CITY;
    numItems = 6;
    top = 0;
  }

  const windowId = CreateWindowFromRect(17, top, 11, numItems * 2);
  const window = sWindows.get(windowId)!;
  let slot = 0;
  for (let i = 0; i < numItems - 2; i++) {
    if (destinationId !== origin) {
      printText(window, FONT_NORMAL, rom.text(sSeagallopDestStrings[destinationId]), 8, slot * 16 + 2);
      slot++;
    } else {
      i--;
    }
    destinationId++;
    if (destinationId === SEAGALLOP_SEVEN_ISLAND + 1) destinationId = SEAGALLOP_VERMILION_CITY;
  }
  printText(window, FONT_NORMAL, rom.text("gText_Other"), 8, slot * 16 + 2);
  slot++;
  printText(window, FONT_NORMAL, rom.text("gOtherText_Exit"), 8, slot * 16 + 2);

  const menu = new Menu(window, FONT_NORMAL, 0, 2, 16, numItems, 0);
  const taskId = tasks.create(Task_MultichoiceMenu_HandleInput, 80);
  sMCState.set(taskId, {
    windowId,
    menu,
    ignoreB: false,
    wrap: numItems > 3,
    mcId: MULTICHOICE_NONE,
  });
}

export function GetSelectedSeagallopDestination(): number {
  const res = varGet(SV.RESULT);
  const origin = varGet(SV.x8004);
  const page = varGet(SV.x8005);
  if (res === SCR_MENU_CANCEL) return SCR_MENU_CANCEL;
  if (page === 1) {
    if (res === 3) return SEAGALLOP_MORE;
    if (res === 4) return SCR_MENU_CANCEL;
    if (res === 0) return origin > SEAGALLOP_FOUR_ISLAND ? SEAGALLOP_FOUR_ISLAND : SEAGALLOP_FIVE_ISLAND;
    if (res === 1) return origin > SEAGALLOP_FIVE_ISLAND ? SEAGALLOP_FIVE_ISLAND : SEAGALLOP_SIX_ISLAND;
    if (res === 2) return origin > SEAGALLOP_SIX_ISLAND ? SEAGALLOP_SIX_ISLAND : SEAGALLOP_SEVEN_ISLAND;
  } else {
    if (res === 4) return SEAGALLOP_MORE;
    if (res === 5) return SCR_MENU_CANCEL;
    if (res >= origin) return res + 1;
    return res;
  }
  return SEAGALLOP_VERMILION_CITY;
}

export class ScriptMenu {
  private moneyWindow?: Window;
  private coinsWindow?: Window;

  constructor(private readonly getOw: () => Overworld) {
    setActiveScriptMenu(this);
  }

  getOverworld(): Overworld {
    return this.getOw();
  }

  frameType(): number {
    return save.options.frameType ?? 0;
  }

  CreateWindowFromRect(left: number, top: number, width: number, height: number): Window {
    const id = CreateWindowFromRect(left, top, width, height);
    return sWindows.get(id)!;
  }

  createFramedWindow(left: number, top: number, width: number, height: number): Window {
    return this.CreateWindowFromRect(left, top, width, height);
  }

  removeWindow(window: Window | undefined): void {
    if (!window) return;
    this.getOverworld().windows.remove(window);
  }

  DestroyScriptMenuWindow(window: Window | number | undefined): void {
    DestroyScriptMenuWindow(window);
  }

  ScriptMenu_YesNo(left: number, top: number, defaultChoice = 0): boolean {
    return ScriptMenu_YesNo(left, top, defaultChoice);
  }

  ScriptMenu_Multichoice(left: number, top: number, id: number, ignoreB: boolean): boolean {
    return ScriptMenu_Multichoice(left, top, id, ignoreB);
  }

  ScriptMenu_MultichoiceWithDefault(left: number, top: number, id: number, ignoreB: boolean, initPos: number): boolean {
    return ScriptMenu_MultichoiceWithDefault(left, top, id, ignoreB, initPos);
  }

  customChoice(symbols: string[], left: number, top: number, width: number, height: number): void {
    varSet(SV.RESULT, SCR_MENU_UNSET);
    const window = this.createFramedWindow(left, top, width, height);
    symbols.forEach((sym, i) => printText(window, FONT_NORMAL, expandPlaceholders(rom.text(sym)), 8, i * 16 + 2));
    const menu = new Menu(window, FONT_NORMAL, 0, 2, 16, symbols.length, 0);
    const windowId = [...sWindows.entries()].find(([, w]) => w === window)?.[0] ?? 0;
    const taskId = tasks.create(Task_MultichoiceMenu_HandleInput, 80);
    sMCState.set(taskId, {
      windowId,
      menu,
      ignoreB: false,
      wrap: symbols.length > 3,
      mcId: MULTICHOICE_NONE,
    });
  }

  ScriptMenu_MultichoiceGrid(left: number, top: number, id: number, ignoreB: boolean, columns: number): boolean {
    return ScriptMenu_MultichoiceGrid(left, top, id, ignoreB, columns);
  }

  showMoneyBox(x: number, y: number): void {
    if (QL_AvoidDisplay(this.getOverworld(), QL_DestroyAbortedDisplay)) return;
    this.hideMoneyBox();
    const window = new Window(x + 1, y + 1, 8, 3);
    window.frame = "stdwin";
    this.moneyWindow = window;
    this.getOverworld().windows.add(window);
    this.updateMoneyBox();
  }

  updateMoneyBox(): void {
    const window = this.moneyWindow;
    if (!window) return;
    window.fill(1);
    printText(window, FONT_NORMAL, rom.text("gText_TrainerCardMoney"), 0, 0);
    stringVars.var1 = intToDecimal(save.money, STR_CONV_MODE_LEFT_ALIGN, 6);
    const text = expandPlaceholders(rom.text("gText_PokedollarVar1"));
    printText(window, FONT_SMALL, text, 64 - GetStringWidth(FONT_SMALL, text, 0), 12);
  }

  hideMoneyBox(): void {
    this.removeWindow(this.moneyWindow);
    this.moneyWindow = undefined;
  }

  showCoinsBox(x: number, y: number): void {
    if (QL_AvoidDisplay(this.getOverworld(), QL_DestroyAbortedDisplay)) return;
    this.hideCoinsBox();
    const window = new Window(x + 1, y + 1, 8, 3);
    window.frame = "stdwin";
    this.coinsWindow = window;
    this.getOverworld().windows.add(window);
    this.updateCoinsBox();
  }

  updateCoinsBox(): void {
    const window = this.coinsWindow;
    if (!window) return;
    window.fill(1);
    printText(window, FONT_NORMAL, rom.text("gText_Coins_2"), 0, 0);
    stringVars.var1 = intToDecimal(GetCoins(), STR_CONV_MODE_RIGHT_ALIGN, 4);
    const text = expandPlaceholders(rom.text("gText_Coins"));
    printText(window, FONT_SMALL, text, 64 - GetStringWidth(FONT_SMALL, text, 0), 12);
  }

  hideCoinsBox(): void {
    this.removeWindow(this.coinsWindow);
    this.coinsWindow = undefined;
  }

  ScriptMenu_ShowPokemonPic(species: number, x: number, y: number): boolean {
    return ScriptMenu_ShowPokemonPic(species, x, y);
  }

  ScriptMenu_HidePokemonPic(): (() => boolean) | null {
    return ScriptMenu_HidePokemonPic();
  }

  PicboxCancel(): void {
    PicboxCancel();
  }

  // ---------------------------------------------------------------- field_specials.c ListMenu

  elevatorScroll = 0;
  elevatorCursorPos = 0;
  private scriptListState = new Map<number, { which: number; window?: Window; listTaskId: number; removeArrows?: () => void; scroll: number }>();
  private suspendedListTaskId = -1;

  ListMenu(): void {
    if (QL_AvoidDisplay(this.getOverworld(), QL_DestroyAbortedDisplay)) return;
    const which = varGet(SV.x8004);
    const layouts: Record<number, number[]> = {
      [LISTMENU_BADGES]: [4, 9, 1, 1, 12, 7, 1],
      [LISTMENU_SILPHCO_FLOORS]: [7, 12, 1, 1, 8, 12, 0],
      [LISTMENU_ROCKET_HIDEOUT_FLOORS]: [4, 4, 1, 1, 8, 8, 0],
      [LISTMENU_DEPT_STORE_FLOORS]: [4, 6, 1, 1, 8, 8, 0],
      [LISTMENU_WIRELESS_LECTURE_HEADERS]: [4, 4, 1, 1, 17, 8, 1],
      [LISTMENU_BERRY_POWDER]: [7, 12, 16, 1, 17, 12, 0],
      [LISTMENU_TRAINER_TOWER_FLOORS]: [3, 3, 1, 1, 8, 6, 0],
    };
    const layout = layouts[which];
    if (!layout) {
      if (which !== 99) { varSet(SV.RESULT, SCR_MENU_CANCEL); this.getOverworld().script.ScriptContext_Enable(); }
      return;
    }
    const id = tasks.create((taskId) => this.Task_CreateScriptListMenu(taskId), 8);
    const data = tasks.data(id);
    data.splice(0, 7, ...layout);
    data[15] = id;
    if (which === LISTMENU_SILPHCO_FLOORS) { data[7] = this.elevatorScroll; data[8] = this.elevatorCursorPos; }
    this.scriptListState.set(id, { which, listTaskId: -1, scroll: 0 });
  }

  private CreateScriptListMenu(items: { label: Uint8Array; index: number }[], maxShowed: number, windowId: number, window: Window, moveCursorFunc: () => void) {
    return listMenuTemplate({ items, windowId, surface: fieldListSurface(window), totalItems: items.length, maxShowed,
      item_X: 8, cursor_X: 0, upText_Y: 0, cursorPal: 2, fillValue: 1, cursorShadowPal: 3, lettersSpacing: 1, itemVerticalPadding: 0,
      scrollMultiple: LIST_NO_MULTIPLE_SCROLL, fontId: FONT_NORMAL, cursorKind: 0, moveCursorFunc });
  }

  private Task_CreateScriptListMenu(taskId: number): void {
    const data = tasks.data(taskId), state = this.scriptListState.get(taskId);
    if (!state) return;
    this.getOverworld().controlsLocked = true;
    state.scroll = state.which === LISTMENU_SILPHCO_FLOORS ? this.elevatorScroll : 0;
    const labels = cdata<SymRef[][]>("field_specials", "sListMenuLabels")[state.which] ?? [];
    const items = labels.slice(0, data[1]).map((ref, index) => ({ label: expandPlaceholders(rom.text(symName(ref)!)), index }));
    let maxWidth = 0;
    for (const item of items) maxWidth = Math.max(maxWidth, GetStringWidth(FONT_NORMAL, item.label, 0));
    data[4] = Math.floor((maxWidth + 9) / 8) + 1;
    if (data[2] + data[4] > 29) data[2] = 29 - data[4];
    const window = new Window(data[2], data[3], data[4], data[5]);
    window.frame = "std"; window.frameType = this.frameType();
    this.getOverworld().windows.add(window); state.window = window;
    const template = this.CreateScriptListMenu(items, data[0], 0, window, () => this.ScriptListMenuMoveCursorFunction(taskId));
    state.listTaskId = ListMenuInitOnSurface(template, data[7], data[8]);
    this.Task_CreateMenuRemoveScrollIndicatorArrowPair(taskId);
    tasks.setFunc(taskId, this.Task_ListMenuHandleInput);
  }

  private Task_ListMenuHandleInput = (taskId: number): void => {
    const state = this.scriptListState.get(taskId);
    if (!state) return;
    const input = ListMenu_ProcessInput(state.listTaskId);
    if (input === LIST_NOTHING_CHOSEN) return;
    sound.playSE(sound.SE_SELECT);
    if (input === LIST_CANCEL) { varSet(SV.RESULT, SCR_MENU_CANCEL); this.Task_DestroyListMenu(taskId); return; }
    varSet(SV.RESULT, input);
    const data = tasks.data(taskId);
    if (data[6] === 0 || input === data[1] - 1) this.Task_DestroyListMenu(taskId);
    else {
      this.Task_ListMenuRemoveScrollIndicatorArrowPair(taskId);
      this.suspendedListTaskId = taskId;
      tasks.setFunc(taskId, this.Task_SuspendListMenu);
      this.getOverworld().script.ScriptContext_Enable();
    }
  };

  private Task_DestroyListMenu(taskId: number): void {
    const state = this.scriptListState.get(taskId);
    if (state) {
      this.Task_ListMenuRemoveScrollIndicatorArrowPair(taskId);
      DestroyListMenuTask(state.listTaskId);
      if (state.window) { state.window.fill(0); state.window.markDirty(); this.removeWindow(state.window); }
      this.scriptListState.delete(taskId);
    }
    if (this.suspendedListTaskId === taskId) this.suspendedListTaskId = -1;
    tasks.destroy(taskId);
    this.getOverworld().script.ScriptContext_Enable();
  }

  private Task_SuspendListMenu = (taskId: number): void => {
    const data = tasks.data(taskId);
    if (data[6] === 2) { data[6] = 1; tasks.setFunc(taskId, this.Task_RedrawScrollArrowsAndWaitInput); }
  };

  returnToListMenu(): void {
    const taskId = this.suspendedListTaskId;
    if (taskId < 0 || !tasks.tasks[taskId]?.isActive) { this.getOverworld().script.ScriptContext_Enable(); return; }
    tasks.data(taskId)[6]++;
  }

  private Task_RedrawScrollArrowsAndWaitInput = (taskId: number): void => {
    this.getOverworld().controlsLocked = true;
    const state = this.scriptListState.get(taskId);
    if (!state) return;
    this.Task_CreateMenuRemoveScrollIndicatorArrowPair(taskId);
    tasks.setFunc(taskId, this.Task_ListMenuHandleInput);
  };

  private Task_CreateMenuRemoveScrollIndicatorArrowPair(taskId: number): void {
    const data = tasks.data(taskId), state = this.scriptListState.get(taskId);
    if (data[0] === data[1] || !state?.window) return;
    const x = 4 * data[4] + 8 * data[2];
    state.removeArrows = addFieldScrollArrows(this.getOverworld(), SCROLL_ARROW_UP, x, 8, 8 * data[5] + 10, data[1] - data[0], () => state.scroll);
  }

  private Task_ListMenuRemoveScrollIndicatorArrowPair(taskId: number): void {
    const state = this.scriptListState.get(taskId);
    state?.removeArrows?.();
    if (state) state.removeArrows = undefined;
  }

  private ScriptListMenuMoveCursorFunction(taskId: number): void {
    sound.playSE(sound.SE_SELECT);
    const listTaskId = this.scriptListState.get(taskId)?.listTaskId ?? -1;
    if (listTaskId < 0) return;
    const above = ListMenuGetScrollAndRow(listTaskId).itemsAbove;
    const state = this.scriptListState.get(taskId);
    if (state) state.scroll = above;
  }

  private brailleSprite?: Sprite;

  brailleCursor(x: number, y: number, create: boolean): void {
    if (this.brailleSprite) { this.getOverworld().sprites.destroy(this.brailleSprite); this.brailleSprite = undefined; }
    if (!create) return;
    const s = new Sprite();
    s.width = 8; s.height = 16; s.x = x; s.y = y; s.coordOffsetEnabled = false; s.priority = 0; s.aboveWindows = true;
    let t = 0;
    s.draw = (ctx, dx, dy) => { if ((t >> 4) & 1) return; ctx.fillStyle = "#606060"; ctx.fillRect(dx, dy + 12, 8, 2); };
    s.callback = () => { t++; };
    this.brailleSprite = s;
    this.getOverworld().sprites.add(s);
  }

  CreatePCMenu(): boolean {
    return CreatePCMenu();
  }

  ScriptMenu_DisplayPCStartupPrompt(): void {
    ScriptMenu_DisplayPCStartupPrompt();
  }
}
