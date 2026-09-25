// item_pc.c: the player's item PC screen (withdraw list with the PC-on/off
// effect, swap mode, withdraw quantity, "Give" to a party mon).
// Adaptations:
//  - ItemPc_Init loads its data (preloadItemPc) before running the setup.
//  - The PC item list is save.pcItems, an array without empty slots, so
//    ItemPcCompaction is a no-op and nItems is its length.
//  - MainCallbacks handed to SetMainCallback2 by this screen are plain
//    functions that must run once (see runOnce), as in party_menu.
//  - ItemUse_SetQuestLogEvent (Quest Log) and SetHelpContext (help system) are out of scope.
//  - Sprite scroll pointers (&sListMenuState.scroll) are getters.
// Needs a HwScene host (menus/fieldMenus.ts fieldMenu).

import { sound } from "./audio/sound";
import { expandPlaceholders, intToDecimal, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN, stringVars } from "./gba/charmap";
import { FONT_NORMAL, FONT_SMALL } from "./gba/font";
import { A_BUTTON, B_BUTTON, JOY_NEW, SELECT_BUTTON } from "./gba/input";
import { tasks } from "./gba/tasks";
import { getTextSpeedSetting } from "./gba/textPrinter";
import * as C from "./generated/constants";
import { cdata, incbin, incbin16, loadCData, preloadPacks } from "./hw/assets";
import {
  InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate,
} from "./hw/bg";
import { SetGpuReg } from "./hw/gpu";
import {
  DestroyListMenuTask, ListMenu_ProcessInput, ListMenuGetScrollAndRow, ListMenuGetYCoordForPrintingArrowCursor, ListMenuInit, ListMenuSetTemplateField,
  AddScrollIndicatorArrowPairParameterized, RemoveScrollIndicatorArrowPair, type ListMenu, type ListMenuItem, type ListMenuTemplate,
} from "./hw/listMenu";
import {
  ClearDialogWindowAndFrameToTransparent, ClearStdWindowAndFrameToTransparent, DrawStdFrameWithCustomTileAndPalette, FONTATTR_MAX_LETTER_HEIGHT,
  FONTATTR_MAX_LETTER_WIDTH, GetFontAttribute, GetTextWindowPalette, LoadMenuMessageWindowGfx, LoadStdWindowGfx, LoadUserWindowGfx, Menu_InitCursor,
  Menu_ProcessInputNoWrapAround, PrintTextArray,
} from "./hw/menu";
import {
  AdjustQuantityAccordingToDPadInput, ClearScheduledBgCopiesToVram, DisplayMessageAndContinueTask, DoScheduledBgTilemapCopiesToVram, CopyItemName,
  MenuHelpers_IsLinkActive, ResetAllBgsCoordinatesAndBgCntRegs, ScheduleBgCopyTilemapToVram, SetBgTilemapPalette,
} from "./hw/menuHelpers";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalettes, gPaletteFade, LoadPalette, PALETTES_ALL, PLTT_SIZE_4BPP, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer,
  UpdatePaletteFade,
} from "./hw/palette";
import { DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, REG_OFFSET_BLDCNT, REG_OFFSET_DISPCNT } from "./hw/ppu";
import { gMain, SetHBlankCallback, SetMainCallback2, SetVBlankCallback, type MainCallback } from "./hw/runtime";
import { ScanlineEffect_Stop } from "./hw/scanline";
import { AnimateSprites, BuildOamBuffer, FreeAllSpritePalettes, LoadOam, ProcessSpriteCopyRequests, ResetSpriteData } from "./hw/sprite";
import { AddTextPrinterParameterized, AddTextPrinterParameterized4, DeactivateAllTextPrinters } from "./hw/text";
import {
  AddWindow, ClearWindowTilemap, FillWindowPixelBuffer, FillWindowPixelRect, FreeAllWindowBuffers, InitWindows, PIXEL_FILL, PutWindowTilemap,
  RemoveWindow, type WindowTemplate,
} from "./hw/window";
import {
  CreateItemMenuIcon, CreateSwapLine, DestroyItemMenuIcon, ItemId_GetDescription, LoadBagSwapSpritePalette, LoadBagSwapSpriteSheet, MoveItemSlotInList,
  ResetItemMenuIconState, SetSwapLineInvisibility, UpdateSwapLinePos,
} from "./bagMenu";
import {
  BeginPCScreenEffect_TurnOff, BeginPCScreenEffect_TurnOn, IsPCScreenEffectRunning_TurnOff, IsPCScreenEffectRunning_TurnOn,
} from "./pcScreenEffect";
import { gPartyMenu, InitPartyMenu, Task_HandleChooseMonInput } from "./partyMenu";
import { tmhmMove } from "./menus/monProgress";
import { addBagItem, itemInfo, itemName, removePCItem } from "./pokemon/items";
import { CalculatePlayerPartyCount } from "./pokemon/mon";
import { rom } from "./rom";
import { save } from "./save";

type ItemPcResources = {
  savedCallback: MainCallback;
  moveModeOrigPos: number;
  itemMenuIconSlot: number;
  maxShowed: number;
  nItems: number;
  scrollIndicatorArrowPairId: number;
  withdrawQuantitySubmenuCursorPos: number;
  data: number[];
};

type ItemPcStaticResources = { savedCallback: MainCallback; scroll: number; row: number; initialized: number };

let sStateDataPtr: ItemPcResources = null!;
let sBg1TilemapBuffer: Uint16Array | null = null;
let sListMenuItems: ListMenuItem[] = [];
let sListMenuState: ItemPcStaticResources = { savedCallback: null, scroll: 0, row: 0, initialized: 0 };
const sSubmenuWindowIds = [0xff, 0xff, 0xff];
let gMultiuseListMenuTemplate: ListMenuTemplate = null!;

const rd = <T>(name: string) => cdata<T>("item_pc", name);
const txt = (name: string) => rom.text(name);
const sBgTemplates = () => rd<Partial<BgTemplate>[]>("sBgTemplates").map((t) => ({ screenSize: 0, paletteMode: 0, baseTile: 0, ...t }) as BgTemplate);
const sWindowTemplates = () => rd<WindowTemplate[]>("sWindowTemplates");
const sSubwindowTemplates = () => rd<WindowTemplate[]>("sSubwindowTemplates");
const sTextColors = () => rd<number[][]>("sTextColors");

const sItemPcSubmenuOptions = [
  { text: () => txt("gText_Withdraw"), func: (taskId: number) => Task_ItemPcWithdraw(taskId) },
  { text: () => txt("gOtherText_Give"), func: (taskId: number) => Task_ItemPcGive(taskId) },
  { text: () => txt("gFameCheckerText_Cancel"), func: (taskId: number) => Task_ItemPcCancel(taskId) },
];

/** Loads the data this screen reads. */
export function preloadItemPc(): Promise<unknown> {
  return Promise.all([
    loadCData("item_pc", "item_menu_icons", "strings", "text_window_graphics"),
    preloadPacks(["graphics_item_pc", "graphics_interface", "graphics_items", "graphics_text_window", "graphics_fonts"]),
  ]);
}

/** SetMainCallback2(cb) for a callback that installs the next screen: run once with the main callback cleared. */
function runOnce(cb: MainCallback): void {
  SetMainCallback2(null);
  cb?.();
}

/** ItemPc_Init */
export function ItemPc_Init(kind: number, callback: MainCallback): void {
  if (kind >= 2) {
    runOnce(callback);
    return;
  }
  void preloadItemPc().then(() => {
    sStateDataPtr = {
      savedCallback: null, moveModeOrigPos: 0xff, itemMenuIconSlot: 0, maxShowed: 0, nItems: 0, scrollIndicatorArrowPairId: 0xff,
      withdrawQuantitySubmenuCursorPos: 0, data: [0, 0, 0],
    };
    if (kind !== 1) {
      sListMenuState.savedCallback = callback;
      sListMenuState.scroll = sListMenuState.row = 0;
    }
    SetMainCallback2(ItemPc_RunSetup);
  });
}

function ItemPc_MainCB(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  DoScheduledBgTilemapCopiesToVram();
  UpdatePaletteFade();
}

function ItemPc_VBlankCB(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function ItemPc_RunSetup(): void {
  while (true) {
    if (ItemPc_DoGfxSetup() === true) break;
    if (MenuHelpers_IsLinkActive() === true) break;
  }
}

function ItemPc_DoGfxSetup(): boolean {
  let taskId: number;
  switch (gMain.state) {
    case 0:
      SetVBlankCallback(null);
      SetHBlankCallback(null); // SetVBlankHBlankCallbacksToNull
      ClearScheduledBgCopiesToVram();
      gMain.state++;
      break;
    case 1:
      ScanlineEffect_Stop();
      gMain.state++;
      break;
    case 2:
      FreeAllSpritePalettes();
      gMain.state++;
      break;
    case 3:
      ResetPaletteFade();
      gMain.state++;
      break;
    case 4:
      ResetSpriteData();
      gMain.state++;
      break;
    case 5:
      ResetItemMenuIconState();
      gMain.state++;
      break;
    case 6:
      tasks.reset();
      gMain.state++;
      break;
    case 7:
      if (ItemPc_InitBgs()) {
        sStateDataPtr.data[0] = 0;
        gMain.state++;
      } else {
        ItemPc_FadeAndBail();
        return true;
      }
      break;
    case 8:
      if (ItemPc_LoadGraphics() === true) gMain.state++;
      break;
    case 9:
      ItemPc_InitWindows();
      gMain.state++;
      break;
    case 10:
      ItemPc_CountPcItems();
      ItemPc_SetCursorPosition();
      ItemPc_SetScrollPosition();
      gMain.state++;
      break;
    case 11:
      if (ItemPc_AllocateResourcesForListMenu()) {
        gMain.state++;
      } else {
        ItemPc_FadeAndBail();
        return true;
      }
      break;
    case 12:
      ItemPc_BuildListMenuTemplate();
      gMain.state++;
      break;
    case 13:
      ItemPc_PrintWithdrawItem();
      gMain.state++;
      break;
    case 14:
      CreateSwapLine();
      gMain.state++;
      break;
    case 15:
      taskId = tasks.create(Task_ItemPcMain, 0);
      tasks.tasks[taskId].data[0] = ListMenuInit(gMultiuseListMenuTemplate, sListMenuState.scroll, sListMenuState.row);
      gMain.state++;
      break;
    case 16:
      ItemPc_PlaceTopMenuScrollIndicatorArrows();
      gMain.state++;
      break;
    case 17:
      // SetHelpContext(HELPCONTEXT_PLAYERS_PC_ITEMS): the help system is out of scope.
      gMain.state++;
      break;
    case 18:
      if (sListMenuState.initialized === 1) BlendPalettes(PALETTES_ALL, 16, RGB_BLACK);
      gMain.state++;
      break;
    case 19:
      if (sListMenuState.initialized === 1) {
        BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
      } else {
        BeginPCScreenEffect_TurnOn(0, 0, 0);
        ItemPc_SetInitializedFlag(true);
        sound.playSE(C.SE_PC_LOGIN);
      }
      gMain.state++;
      break;
    case 20:
      gMain.state++; // IsActiveOverworldLinkBusy() is never TRUE
      break;
    default:
      SetVBlankCallback(ItemPc_VBlankCB);
      SetMainCallback2(ItemPc_MainCB);
      return true;
  }
  return false;
}

function ItemPc_FadeAndBail(): void {
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
  tasks.create(Task_ItemPcWaitFadeAndBail, 0);
  SetVBlankCallback(ItemPc_VBlankCB);
  SetMainCallback2(ItemPc_MainCB);
}

function Task_ItemPcWaitFadeAndBail(taskId: number): void {
  if (!gPaletteFade.active) {
    const cb = sListMenuState.savedCallback;
    ItemPc_FreeResources();
    tasks.destroy(taskId);
    runOnce(cb);
  }
}

function ItemPc_InitBgs(): boolean {
  ResetAllBgsCoordinatesAndBgCntRegs();
  sBg1TilemapBuffer = new Uint16Array(0x800 / 2);
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, sBgTemplates());
  SetBgTilemapBuffer(1, sBg1TilemapBuffer);
  ScheduleBgCopyTilemapToVram(1);
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  ShowBg(0);
  ShowBg(1);
  return true;
}

function ItemPc_LoadGraphics(): boolean {
  switch (sStateDataPtr.data[0]) {
    case 0: {
      // ResetTempTileDataBuffers(); DecompressAndCopyTileDataToVram(1, gItemPcTiles, 0, 0, 0)
      const tiles = incbin("gItemPcTiles");
      LoadBgTiles(1, tiles, tiles.length, 0);
      sStateDataPtr.data[0]++;
      break;
    }
    case 1:
      // FreeTempTileDataBuffersIfPossible() is never TRUE here: LZDecompressWram(gItemPcTilemap, sBg1TilemapBuffer)
      sBg1TilemapBuffer!.set(incbin16("gItemPcTilemap").subarray(0, sBg1TilemapBuffer!.length));
      sStateDataPtr.data[0]++;
      break;
    case 2:
      LoadPalette(incbin16("gItemPcBgPals"), BG_PLTT_ID(0), 3 * PLTT_SIZE_4BPP);
      sStateDataPtr.data[0]++;
      break;
    case 3:
      LoadBagSwapSpriteSheet();
      sStateDataPtr.data[0]++;
      break;
    default:
      LoadBagSwapSpritePalette();
      sStateDataPtr.data[0] = 0;
      return true;
  }
  return false;
}

function ItemPc_AllocateResourcesForListMenu(): boolean {
  sListMenuItems = new Array(C.PC_ITEMS_COUNT + 1);
  return true;
}

function ItemPc_BuildListMenuTemplate(): void {
  let i: number;
  for (i = 0; i < sStateDataPtr.nItems; i++) {
    sListMenuItems[i] = { label: itemName(save.pcItems[i].item), index: i };
  }
  sListMenuItems[i] = { label: txt("gFameCheckerText_Cancel"), index: -2 };

  gMultiuseListMenuTemplate = {
    items: sListMenuItems,
    totalItems: sStateDataPtr.nItems + 1,
    windowId: 0,
    header_X: 0,
    item_X: 9,
    cursor_X: 1,
    lettersSpacing: 1,
    itemVerticalPadding: 2,
    upText_Y: 2,
    maxShowed: sStateDataPtr.maxShowed,
    fontId: FONT_NORMAL,
    cursorPal: 2,
    fillValue: 0,
    cursorShadowPal: 3,
    moveCursorFunc: ItemPc_MoveCursorFunc,
    itemPrintFunc: ItemPc_ItemPrintFunc,
    scrollMultiple: 0,
    cursorKind: 0,
  };
}

function ItemPc_MoveCursorFunc(itemIndex: number, onInit: boolean, _list: ListMenu): void {
  let itemId: number;
  let desc: ArrayLike<number>;
  if (onInit !== true) sound.playSE(C.SE_SELECT);

  if (sStateDataPtr.moveModeOrigPos === 0xff) {
    DestroyItemMenuIcon(sStateDataPtr.itemMenuIconSlot ^ 1);
    if (itemIndex !== -2) {
      itemId = ItemPc_GetItemIdBySlotId(itemIndex);
      CreateItemMenuIcon(itemId, sStateDataPtr.itemMenuIconSlot);
      if (itemInfo(itemId)?.pocket === C.POCKET_TM_CASE) desc = rom.moveName(tmhmMove(itemId));
      else desc = ItemId_GetDescription(itemId);
    } else {
      CreateItemMenuIcon(C.ITEMS_COUNT, sStateDataPtr.itemMenuIconSlot);
      desc = txt("gText_ReturnToPC");
    }
    sStateDataPtr.itemMenuIconSlot ^= 1;
    FillWindowPixelBuffer(1, 0);
    ItemPc_AddTextPrinterParameterized(1, FONT_NORMAL, desc, 0, 3, 2, 0, 0, 3);
  }
}

function ItemPc_ItemPrintFunc(windowId: number, itemId: number, y: number): void {
  if (sStateDataPtr.moveModeOrigPos !== 0xff) {
    if (sStateDataPtr.moveModeOrigPos === (itemId & 0xff)) ItemPc_PrintOrRemoveCursorAt(y, 2);
    else ItemPc_PrintOrRemoveCursorAt(y, 0xff);
  }
  if (itemId !== -2) {
    const quantity = ItemPc_GetItemQuantityBySlotId(itemId);
    stringVars.var1 = intToDecimal(quantity, STR_CONV_MODE_RIGHT_ALIGN, 3);
    stringVars.var4 = expandPlaceholders(txt("gText_TimesStrVar1"));
    ItemPc_AddTextPrinterParameterized(windowId, FONT_SMALL, stringVars.var4, 110, y, 0, 0, 0xff, 1);
  }
}

function ItemPc_PrintOrRemoveCursor(listMenuId: number, colorIdx: number): void {
  ItemPc_PrintOrRemoveCursorAt(ListMenuGetYCoordForPrintingArrowCursor(listMenuId), colorIdx);
}

function ItemPc_PrintOrRemoveCursorAt(y: number, colorIdx: number): void {
  if (colorIdx === 0xff) {
    const maxWidth = GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_WIDTH);
    const maxHeight = GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT);
    FillWindowPixelRect(0, 0, 0, y, maxWidth, maxHeight);
  } else {
    ItemPc_AddTextPrinterParameterized(0, FONT_NORMAL, txt("gText_SelectorArrow2"), 0, y, 0, 0, 0, colorIdx);
  }
}

function ItemPc_PrintWithdrawItem(): void {
  ItemPc_AddTextPrinterParameterized(2, FONT_SMALL, txt("gText_WithdrawItem"), 0, 1, 0, 1, 0, 0);
}

function ItemPc_PlaceTopMenuScrollIndicatorArrows(): void {
  sStateDataPtr.scrollIndicatorArrowPairId = AddScrollIndicatorArrowPairParameterized(2, 128, 8, 104, sStateDataPtr.nItems - sStateDataPtr.maxShowed + 1, 110, 110, () => sListMenuState.scroll);
}

function ItemPc_PlaceWithdrawQuantityScrollIndicatorArrows(): void {
  sStateDataPtr.withdrawQuantitySubmenuCursorPos = 1;
  sStateDataPtr.scrollIndicatorArrowPairId = AddScrollIndicatorArrowPairParameterized(2, 212, 120, 152, 2, 110, 110, () => sStateDataPtr.withdrawQuantitySubmenuCursorPos);
}

function ItemPc_RemoveScrollIndicatorArrowPair(): void {
  if (sStateDataPtr.scrollIndicatorArrowPairId !== 0xff) {
    RemoveScrollIndicatorArrowPair(sStateDataPtr.scrollIndicatorArrowPairId);
    sStateDataPtr.scrollIndicatorArrowPairId = 0xff;
  }
}

function ItemPc_SetCursorPosition(): void {
  if (sListMenuState.scroll !== 0 && sListMenuState.scroll + sStateDataPtr.maxShowed > sStateDataPtr.nItems + 1) {
    sListMenuState.scroll = (sStateDataPtr.nItems + 1) - sStateDataPtr.maxShowed;
  }
  if (sListMenuState.scroll + sListMenuState.row >= sStateDataPtr.nItems + 1) {
    if (sStateDataPtr.nItems + 1 < 2) sListMenuState.row = 0;
    else sListMenuState.row = sStateDataPtr.nItems;
  }
}

function ItemPc_FreeResources(): void {
  sStateDataPtr = null!;
  sBg1TilemapBuffer = null;
  sListMenuItems = [];
  FreeAllWindowBuffers();
}

function Task_ItemPcTurnOff1(taskId: number): void {
  if (sListMenuState.initialized === 1) {
    BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
  } else {
    BeginPCScreenEffect_TurnOff(0, 0, 0);
    sound.playSE(C.SE_PC_OFF);
  }
  tasks.tasks[taskId].func = Task_ItemPcTurnOff2;
}

function Task_ItemPcTurnOff2(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  if (!gPaletteFade.active && !IsPCScreenEffectRunning_TurnOff()) {
    const pos = DestroyListMenuTask(data[0]);
    sListMenuState.scroll = pos.cursorPos;
    sListMenuState.row = pos.itemsAbove;
    const cb = sStateDataPtr.savedCallback !== null ? sStateDataPtr.savedCallback : sListMenuState.savedCallback;
    ItemPc_RemoveScrollIndicatorArrowPair();
    ItemPc_FreeResources();
    tasks.destroy(taskId);
    // SetMainCallback2(cb): the port runs the callback once.
    runOnce(cb);
  }
}

function ItemPc_GetCursorPosition(): number {
  return (sListMenuState.scroll + sListMenuState.row) & 0xff;
}

function ItemPc_GetItemIdBySlotId(idx: number): number {
  return save.pcItems[idx]?.item ?? C.ITEM_NONE;
}

function ItemPc_GetItemQuantityBySlotId(idx: number): number {
  return save.pcItems[idx]?.quantity ?? 0;
}

function ItemPc_CountPcItems(): void {
  // ItemPcCompaction(): save.pcItems never has empty slots.
  sStateDataPtr.nItems = Math.min(save.pcItems.length, C.PC_ITEMS_COUNT);
  sStateDataPtr.maxShowed = sStateDataPtr.nItems + 1 <= 6 ? sStateDataPtr.nItems + 1 : 6;
}

function ItemPc_SetScrollPosition(): void {
  if (sListMenuState.row > 3) {
    for (let i = 0; i <= sListMenuState.row - 3; sListMenuState.row--, sListMenuState.scroll++, i++) {
      if (sListMenuState.scroll + sStateDataPtr.maxShowed === sStateDataPtr.nItems + 1) break;
    }
  }
}

function ItemPc_SetMessageWindowPalette(palIdx: number): void {
  SetBgTilemapPalette(1, 0, 14, 30, 6, palIdx + 1);
  ScheduleBgCopyTilemapToVram(1);
}

/** ItemPc_SetInitializedFlag */
export function ItemPc_SetInitializedFlag(flag: boolean): void {
  sListMenuState.initialized = flag ? 1 : 0;
}

function Task_ItemPcMain(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  if (!gPaletteFade.active && !IsPCScreenEffectRunning_TurnOn()) {
    if (JOY_NEW(SELECT_BUTTON)) {
      const { cursorPos: scroll, itemsAbove: row } = ListMenuGetScrollAndRow(data[0]);
      if (scroll + row !== sStateDataPtr.nItems) {
        sound.playSE(C.SE_SELECT);
        ItemPc_MoveItemModeInit(taskId, scroll + row);
        return;
      }
    }
    const input = ListMenu_ProcessInput(data[0]);
    const pos = ListMenuGetScrollAndRow(data[0]);
    sListMenuState.scroll = pos.cursorPos;
    sListMenuState.row = pos.itemsAbove;
    switch (input) {
      case -1:
        break;
      case -2:
        sound.playSE(C.SE_SELECT);
        ItemPc_SetInitializedFlag(false);
        tasks.tasks[taskId].func = Task_ItemPcTurnOff1;
        break;
      default:
        sound.playSE(C.SE_SELECT);
        ItemPc_SetMessageWindowPalette(1);
        ItemPc_RemoveScrollIndicatorArrowPair();
        data[1] = input;
        data[2] = ItemPc_GetItemQuantityBySlotId(input);
        ItemPc_PrintOrRemoveCursor(data[0], 2);
        tasks.tasks[taskId].func = Task_ItemPcSubmenuInit;
        break;
    }
  }
}

function ItemPc_ReturnFromSubmenu(taskId: number): void {
  ItemPc_SetMessageWindowPalette(0);
  ItemPc_PlaceTopMenuScrollIndicatorArrows();
  tasks.tasks[taskId].func = Task_ItemPcMain;
}

function ItemPc_MoveItemModeInit(taskId: number, pos: number): void {
  const data = tasks.tasks[taskId].data;

  ListMenuSetTemplateField(data[0], "cursorKind", 1 as never);
  data[1] = pos;
  sStateDataPtr.moveModeOrigPos = pos;
  stringVars.var1 = itemName(ItemPc_GetItemIdBySlotId(data[1]));
  stringVars.var4 = expandPlaceholders(txt("gOtherText_WhereShouldTheStrVar1BePlaced"));
  FillWindowPixelBuffer(1, 0x00);
  ItemPc_AddTextPrinterParameterized(1, FONT_NORMAL, stringVars.var4, 0, 3, 2, 3, 0, 0);
  UpdateSwapLinePos(-32, ListMenuGetYCoordForPrintingArrowCursor(data[0]));
  SetSwapLineInvisibility(false);
  ItemPc_PrintOrRemoveCursor(data[0], 2);
  tasks.tasks[taskId].func = Task_ItemPcMoveItemModeRun;
}

function Task_ItemPcMoveItemModeRun(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  ListMenu_ProcessInput(data[0]);
  const pos = ListMenuGetScrollAndRow(data[0]);
  sListMenuState.scroll = pos.cursorPos;
  sListMenuState.row = pos.itemsAbove;
  UpdateSwapLinePos(-32, ListMenuGetYCoordForPrintingArrowCursor(data[0]));
  if (JOY_NEW(A_BUTTON | SELECT_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    sStateDataPtr.moveModeOrigPos = 0xff;
    ItemPc_InsertItemIntoNewSlot(taskId, sListMenuState.scroll + sListMenuState.row);
  } else if (JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    sStateDataPtr.moveModeOrigPos = 0xff;
    ItemPc_MoveItemModeCancel(taskId, sListMenuState.scroll + sListMenuState.row);
  }
}

function ItemPc_InsertItemIntoNewSlot(taskId: number, pos: number): void {
  const data = tasks.tasks[taskId].data;
  if (data[1] === pos || data[1] === pos - 1) {
    ItemPc_MoveItemModeCancel(taskId, pos);
  } else {
    MoveItemSlotInList(save.pcItems, data[1], pos);
    const p = DestroyListMenuTask(data[0]);
    sListMenuState.scroll = p.cursorPos;
    sListMenuState.row = p.itemsAbove;
    if (data[1] < pos) sListMenuState.row--;
    ItemPc_BuildListMenuTemplate();
    data[0] = ListMenuInit(gMultiuseListMenuTemplate, sListMenuState.scroll, sListMenuState.row);
    SetSwapLineInvisibility(true);
    tasks.tasks[taskId].func = Task_ItemPcMain;
  }
}

function ItemPc_MoveItemModeCancel(taskId: number, pos: number): void {
  const data = tasks.tasks[taskId].data;

  const p = DestroyListMenuTask(data[0]);
  sListMenuState.scroll = p.cursorPos;
  sListMenuState.row = p.itemsAbove;
  if (data[1] < pos) sListMenuState.row--;
  ItemPc_BuildListMenuTemplate();
  data[0] = ListMenuInit(gMultiuseListMenuTemplate, sListMenuState.scroll, sListMenuState.row);
  SetSwapLineInvisibility(true);
  tasks.tasks[taskId].func = Task_ItemPcMain;
}

function Task_ItemPcSubmenuInit(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  ItemPc_SetBorderStyleOnWindow(4);
  const windowId = ItemPc_GetOrCreateSubwindow(0);
  PrintTextArray(4, FONT_NORMAL, 8, 2, GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT) + 2, 3, sItemPcSubmenuOptions.map((o) => ({ text: o.text() })));
  Menu_InitCursor(4, FONT_NORMAL, 0, 2, GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT) + 2, 3, 0);
  stringVars.var1 = CopyItemName(ItemPc_GetItemIdBySlotId(data[1]));
  stringVars.var4 = expandPlaceholders(txt("gText_Var1IsSelected"));
  ItemPc_AddTextPrinterParameterized(windowId, FONT_NORMAL, stringVars.var4, 0, 2, 1, 0, 0, 1);
  ScheduleBgCopyTilemapToVram(0);
  tasks.tasks[taskId].func = Task_ItemPcSubmenuRun;
}

function Task_ItemPcSubmenuRun(taskId: number): void {
  const input = Menu_ProcessInputNoWrapAround();
  switch (input) {
    case -1:
      sound.playSE(C.SE_SELECT);
      Task_ItemPcCancel(taskId);
      break;
    case -2:
      break;
    default:
      sound.playSE(C.SE_SELECT);
      sItemPcSubmenuOptions[input].func(taskId);
  }
}

function Task_ItemPcWithdraw(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  ClearStdWindowAndFrameToTransparent(4, false);
  ItemPc_DestroySubwindow(0);
  ClearWindowTilemap(4);
  data[8] = 1;
  if (ItemPc_GetItemQuantityBySlotId(data[1]) === 1) {
    PutWindowTilemap(0);
    ScheduleBgCopyTilemapToVram(0);
    ItemPc_DoWithdraw(taskId);
  } else {
    PutWindowTilemap(0);
    ItemPc_WithdrawMultipleInitWindow(data[1]);
    ItemPc_PlaceWithdrawQuantityScrollIndicatorArrows();
    tasks.tasks[taskId].func = Task_ItemPcHandleWithdrawMultiple;
  }
}

function ItemPc_DoWithdraw(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const itemId = ItemPc_GetItemIdBySlotId(data[1]);

  if (addBagItem(itemId, data[8]) === true) {
    // ItemUse_SetQuestLogEvent(QL_EVENT_WITHDREW_ITEM_PC, ...): Quest Log is out of scope.
    stringVars.var1 = CopyItemName(itemId);
    stringVars.var2 = intToDecimal(data[8], STR_CONV_MODE_LEFT_ALIGN, 3);
    stringVars.var4 = expandPlaceholders(txt("gText_WithdrewQuantItem"));
    const windowId = ItemPc_GetOrCreateSubwindow(2);
    AddTextPrinterParameterized(windowId, FONT_NORMAL, stringVars.var4, 0, 2, 0, null);
    tasks.tasks[taskId].func = Task_ItemPcWaitButtonAndFinishWithdrawMultiple;
  } else {
    const windowId = ItemPc_GetOrCreateSubwindow(2);
    AddTextPrinterParameterized(windowId, FONT_NORMAL, txt("gText_NoMoreRoomInBag"), 0, 2, 0, null);
    tasks.tasks[taskId].func = Task_ItemPcWaitButtonWithdrawMultipleFailed;
  }
}

function Task_ItemPcWaitButtonAndFinishWithdrawMultiple(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  if (JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    const itemId = ItemPc_GetItemIdBySlotId(data[1]);
    removePCItem(itemId, data[8]);
    // ItemPcCompaction(): not needed.
    Task_ItemPcCleanUpWithdraw(taskId);
  }
}

function Task_ItemPcWaitButtonWithdrawMultipleFailed(taskId: number): void {
  if (JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    Task_ItemPcCleanUpWithdraw(taskId);
  }
}

function Task_ItemPcCleanUpWithdraw(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  ItemPc_DestroySubwindow(2);
  PutWindowTilemap(1);
  const p = DestroyListMenuTask(data[0]);
  sListMenuState.scroll = p.cursorPos;
  sListMenuState.row = p.itemsAbove;
  ItemPc_CountPcItems();
  ItemPc_SetCursorPosition();
  ItemPc_BuildListMenuTemplate();
  data[0] = ListMenuInit(gMultiuseListMenuTemplate, sListMenuState.scroll, sListMenuState.row);
  ScheduleBgCopyTilemapToVram(0);
  ItemPc_ReturnFromSubmenu(taskId);
}

function ItemPc_WithdrawMultipleInitWindow(slotId: number): void {
  const itemId = ItemPc_GetItemIdBySlotId(slotId);

  stringVars.var1 = CopyItemName(itemId);
  stringVars.var4 = expandPlaceholders(txt("gText_WithdrawHowMany"));
  AddTextPrinterParameterized(ItemPc_GetOrCreateSubwindow(1), FONT_NORMAL, stringVars.var4, 0, 2, 0, null);
  stringVars.var1 = intToDecimal(1, STR_CONV_MODE_LEADING_ZEROS, 3);
  stringVars.var4 = expandPlaceholders(txt("gText_TimesStrVar1"));
  ItemPc_SetBorderStyleOnWindow(3);
  ItemPc_AddTextPrinterParameterized(3, FONT_SMALL, stringVars.var4, 8, 10, 1, 0, 0, 1);
  ScheduleBgCopyTilemapToVram(0);
}

function UpdateWithdrawQuantityDisplay(quantity: number): void {
  FillWindowPixelRect(3, PIXEL_FILL(1), 10, 10, 28, 12);
  stringVars.var1 = intToDecimal(quantity, STR_CONV_MODE_LEADING_ZEROS, 3);
  stringVars.var4 = expandPlaceholders(txt("gText_TimesStrVar1"));
  ItemPc_AddTextPrinterParameterized(3, FONT_SMALL, stringVars.var4, 8, 10, 1, 0, 0, 1);
}

function Task_ItemPcHandleWithdrawMultiple(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const quantity = { value: data[8] };

  if (AdjustQuantityAccordingToDPadInput(quantity, data[2]) === true) {
    data[8] = quantity.value;
    UpdateWithdrawQuantityDisplay(data[8]);
  } else if (JOY_NEW(A_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    ItemPc_DestroySubwindow(1);
    ClearWindowTilemap(3);
    PutWindowTilemap(0);
    ItemPc_PrintOrRemoveCursor(data[0], 1);
    ScheduleBgCopyTilemapToVram(0);
    ItemPc_RemoveScrollIndicatorArrowPair();
    ItemPc_DoWithdraw(taskId);
  } else if (JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    ClearStdWindowAndFrameToTransparent(3, false);
    ItemPc_DestroySubwindow(1);
    ClearWindowTilemap(3);
    PutWindowTilemap(0);
    PutWindowTilemap(1);
    ItemPc_PrintOrRemoveCursor(data[0], 1);
    ScheduleBgCopyTilemapToVram(0);
    ItemPc_RemoveScrollIndicatorArrowPair();
    ItemPc_ReturnFromSubmenu(taskId);
  }
}

function Task_ItemPcGive(taskId: number): void {
  if (CalculatePlayerPartyCount() === 0) {
    ClearStdWindowAndFrameToTransparent(4, false);
    ItemPc_DestroySubwindow(0);
    ClearWindowTilemap(4);
    PutWindowTilemap(0);
    ItemPc_PrintOnWindow5WithContinueTask(taskId, txt("gText_ThereIsNoPokemon"), gTask_ItemPcWaitButtonAndExitSubmenu);
  } else {
    sStateDataPtr.savedCallback = ItemPc_CB2_SwitchToPartyMenu;
    Task_ItemPcTurnOff1(taskId);
  }
}

function ItemPc_CB2_SwitchToPartyMenu(): void {
  InitPartyMenu(0, 0, 6, false, 6, Task_HandleChooseMonInput, ItemPc_CB2_ReturnFromPartyMenu);
  gPartyMenu.bagItem = ItemPc_GetItemIdBySlotId(ItemPc_GetCursorPosition());
}

function ItemPc_CB2_ReturnFromPartyMenu(): void {
  ItemPc_Init(1, null);
}

function gTask_ItemPcWaitButtonAndExitSubmenu(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  if (JOY_NEW(A_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    ClearDialogWindowAndFrameToTransparent(5, false);
    ClearWindowTilemap(5);
    PutWindowTilemap(1);
    ItemPc_PrintOrRemoveCursor(data[0], 1);
    ScheduleBgCopyTilemapToVram(0);
    ItemPc_ReturnFromSubmenu(taskId);
  }
}

function Task_ItemPcCancel(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  ClearStdWindowAndFrameToTransparent(4, false);
  ItemPc_DestroySubwindow(0);
  ClearWindowTilemap(4);
  PutWindowTilemap(0);
  PutWindowTilemap(1);
  ItemPc_PrintOrRemoveCursor(data[0], 1);
  ScheduleBgCopyTilemapToVram(0);
  ItemPc_ReturnFromSubmenu(taskId);
}

function ItemPc_InitWindows(): void {
  InitWindows(sWindowTemplates());
  DeactivateAllTextPrinters();
  LoadUserWindowGfx(0, 0x3c0, BG_PLTT_ID(14));
  LoadStdWindowGfx(0, 0x3a3, BG_PLTT_ID(12));
  LoadMenuMessageWindowGfx(0, 0x3ac, BG_PLTT_ID(11));
  LoadPalette(GetTextWindowPalette(2), BG_PLTT_ID(13), PLTT_SIZE_4BPP);
  LoadPalette(incbin16("gStandardMenuPalette"), BG_PLTT_ID(15), PLTT_SIZE_4BPP);
  for (let i = 0; i < 3; i++) {
    FillWindowPixelBuffer(i, 0x00);
    PutWindowTilemap(i);
  }
  ScheduleBgCopyTilemapToVram(0);
  for (let i = 0; i < 3; i++) sSubmenuWindowIds[i] = 0xff;
}

function ItemPc_AddTextPrinterParameterized(windowId: number, fontId: number, str: ArrayLike<number>, x: number, y: number, letterSpacing: number, lineSpacing: number, speed: number, colorIdx: number): void {
  AddTextPrinterParameterized4(windowId, fontId, x, y, letterSpacing, lineSpacing, sTextColors()[colorIdx], speed, str);
}

function ItemPc_SetBorderStyleOnWindow(windowId: number): void {
  DrawStdFrameWithCustomTileAndPalette(windowId, false, 0x3c0, 14);
}

function ItemPc_GetOrCreateSubwindow(idx: number): number {
  if (sSubmenuWindowIds[idx] === 0xff) {
    sSubmenuWindowIds[idx] = AddWindow(sSubwindowTemplates()[idx]);
    DrawStdFrameWithCustomTileAndPalette(sSubmenuWindowIds[idx], true, 0x3a3, 12);
  }

  return sSubmenuWindowIds[idx];
}

function ItemPc_DestroySubwindow(idx: number): void {
  ClearStdWindowAndFrameToTransparent(sSubmenuWindowIds[idx], false);
  ClearWindowTilemap(sSubmenuWindowIds[idx]); // redundant
  RemoveWindow(sSubmenuWindowIds[idx]);
  sSubmenuWindowIds[idx] = 0xff;
}

function ItemPc_PrintOnWindow5WithContinueTask(taskId: number, str: ArrayLike<number>, taskFunc: (taskId: number) => void): void {
  DisplayMessageAndContinueTask(taskId, 5, 0x3ac, 0x0b, FONT_NORMAL, getTextSpeedSetting(), str, taskFunc);
  ScheduleBgCopyTilemapToVram(0);
}
