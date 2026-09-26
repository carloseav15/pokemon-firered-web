// shop.c: the Poké Mart (and decoration shop) menus — BUY / SELL / QUIT, the
// buy screen with the map view of the counter, item list with prices, item
// icon and description, quantity dialog and purchase.
// Adaptations:
//  - The BUY/SELL/QUIT window and the "Anything else I can help you with?"
//    message are drawn over the Canvas2D field (like menus/playerPc.ts); BUY
//    runs CB2_InitBuyMenu and SELL runs the bag as a hardware scene hosted by
//    fieldMenu. Their exit (CB2_ReturnToField + MapPostLoadHook_ReturnToShopMenu)
//    closes that scene and shows the menu again.
//  - CreatePokemartMenu reads the u16 item list from its ROM pointer.
//  - The buy screen draws the map from the FieldMap tilesets: the port has no
//    map tiles in hardware VRAM, so BuyMenuLoadMapTilesets copies the two
//    tilesets and their palettes there first (the C finds them already loaded).
//  - Shop event summaries enter the browser save; Quest Log scene recording
//    and playback remain unimplemented. The help system is out of scope.
//  - Alloc'd tilemap buffers are Uint16Arrays; the four Alloc failure paths cannot happen.
// Needs preloadShop() before BUY.

import { sound } from "./audio/sound";
import { expandPlaceholders, intToDecimal, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN, stringVars, concat } from "./gba/charmap";
import { FONT_FEMALE, FONT_MALE, FONT_NORMAL, FONT_SMALL } from "./gba/font";
import { A_BUTTON, B_BUTTON, JOY_NEW } from "./gba/input";
import { tasks } from "./gba/tasks";
import * as C from "./generated/constants";
import { SetQuestLogEvent } from "./questLogEvents";
import { cdata, incbin, incbin16, loadCData, preloadPacks } from "./hw/assets";
import {
  FillBgTilemapBufferRect_Palette0, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate,
} from "./hw/bg";
import { SetGpuReg } from "./hw/gpu";
import {
  AddScrollIndicatorArrowPairParameterized, DestroyListMenuTask, LIST_CANCEL, LIST_NOTHING_CHOSEN, ListMenu_ProcessInput, ListMenuGetScrollAndRow,
  ListMenuGetYCoordForPrintingArrowCursor, ListMenuInit, RemoveScrollIndicatorArrowPair, SCROLL_ARROW_UP, type ListMenu, type ListMenuItem, type ListMenuTemplate,
} from "./hw/listMenu";
import {
  ClearDialogWindowAndFrameToTransparent, ClearStdWindowAndFrameToTransparent, FONTATTR_COLOR_FOREGROUND, FONTATTR_COLOR_SHADOW, FONTATTR_MAX_LETTER_HEIGHT,
  FONTATTR_MAX_LETTER_WIDTH, GetFontAttribute,
} from "./hw/menu";
import {
  AdjustQuantityAccordingToDPadInput, ClearScheduledBgCopiesToVram, CopyItemName, DoScheduledBgTilemapCopiesToVram, menuHelperHooks, PrintMoneyAmount,
  PrintMoneyAmountInMoneyBox, ScheduleBgCopyTilemapToVram, SetBgTilemapPalette, type YesNoFuncTable,
} from "./hw/menuHelpers";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalettes, gPaletteFade, LoadPalette, PALETTES_ALL, PLTT_SIZE_4BPP, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer,
  UpdatePaletteFade,
} from "./hw/palette";
import {
  DISPCNT_MODE_0, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BG1HOFS, REG_OFFSET_BG1VOFS, REG_OFFSET_BG2HOFS,
  REG_OFFSET_BG2VOFS, REG_OFFSET_BG3HOFS, REG_OFFSET_BG3VOFS, REG_OFFSET_BLDCNT, REG_OFFSET_DISPCNT,
} from "./hw/ppu";
import { gMain, SetHBlankCallback, SetMainCallback2, SetVBlankCallback } from "./hw/runtime";
import { ScanlineEffect_Stop } from "./hw/scanline";
import {
  AnimateSprites, BuildOamBuffer, FreeAllSpritePalettes, LoadOam, MAX_SPRITES, gSprites, ProcessSpriteCopyRequests, ResetSpriteData, SpriteCallbackDummy,
  StartSpriteAnim,
} from "./hw/sprite";
import { FillWindowPixelBuffer, FillWindowPixelRect, CopyWindowToVram, COPYWIN_GFX, ClearWindowTilemap, PIXEL_FILL, PutWindowTilemap, FreeAllWindowBuffers, type WindowTemplate } from "./hw/window";
import {
  BuyMenuConfirmPurchase, BuyMenuDisplayMessage, BuyMenuDrawMoneyBox, BuyMenuInitWindows, BuyMenuPrint, BuyMenuQuantityBoxNormalBorder,
  BuyMenuQuantityBoxThinBorder,
} from "./buyMenuHelpers";
import { CreateItemMenuIcon, DestroyItemMenuIcon, GoToBagMenu, ItemId_GetDescription, ResetItemMenuIconState } from "./bagMenu";
import { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST, DIRECTION_VECTORS } from "./field/objectEvents";
import { METATILE_ATTRIBUTE_LAYER_TYPE, NUM_METATILES_IN_PRIMARY } from "./field/fieldmap";
import { CopyMapTilesetsToHw } from "./field/hwTilesets";
import type { Game } from "./game";
import { fieldMenu } from "./menus/fieldMenus";
import { Menu, MENU_B_PRESSED, MENU_NOTHING_CHOSEN } from "./menus/menu";
import { tmhmMove } from "./menus/monProgress";
import { CreateObjectGraphicsSprite, GetObjectEventGraphicsInfo } from "./objectEventGraphics";
import { addBagItem, bagItemQuantity, itemInfo, removeMoney } from "./pokemon/items";
import { printText } from "./gba/textPrinter";
import { rom } from "./rom";
import { incrementGameStat, save } from "./save";

const rd = <T>(name: string) => cdata<T>("shop", name);
const txt = (name: string) => rom.text(name);

const tItemCount = 1, tItemId = 5, tListTaskId = 7;

// mart types
const MART_TYPE_REGULAR = 0;
const MART_TYPE_TMHM = 1;
const MART_TYPE_DECOR = 2;
const MART_TYPE_DECOR2 = 3;

// shop view window NPC info
const OBJECT_EVENT_ID = 0, X_COORD = 1, Y_COORD = 2, ANIM_NUM = 3;
const OBJECT_EVENTS_COUNT = 16;

const INDEX_CANCEL = -2;

type ShopData = {
  callback: (() => void) | null;
  itemList: number[];
  itemPrice: number;
  selectedRow: number;
  scrollOffset: number;
  itemCount: number;
  itemsShowed: number;
  maxQuantity: number;
  martType: number;
  fontId: number;
  itemSlot: number;
  unk16_11: number;
  unk18: number;
};

type QuestLogEvent_Shop = { logEventId: number; lastItemId: number; itemQuantity: number; totalMoney: number; hasMultipleTransactions: boolean; mapSec: number };

let sViewportObjectEvents: number[][] = [];
let sShopData: ShopData = { callback: null, itemList: [], itemPrice: 0, selectedRow: 0, scrollOffset: 0, itemCount: 0, itemsShowed: 0, maxQuantity: 0, martType: 0, fontId: 0, itemSlot: 0, unk16_11: 0, unk18: 0 };
let sShopMenuWindow: { window: ReturnType<Game["scriptMenu"]["createFramedWindow"]>; menu: Menu } | null = null;
export let gShopTilemapBuffer1: Uint16Array | null = null;
export let gShopTilemapBuffer2: Uint16Array | null = null;
export let gShopTilemapBuffer3: Uint16Array | null = null;
export let gShopTilemapBuffer4: Uint16Array | null = null;
let sShopMenuListMenu: ListMenuItem[] = [];
let gMultiuseListMenuTemplate: ListMenuTemplate = null!;
export const sHistory: QuestLogEvent_Shop[] = [
  { logEventId: 0, lastItemId: 0, itemQuantity: 0, totalMoney: 0, hasMultipleTransactions: false, mapSec: 0 },
  { logEventId: 0, lastItemId: 0, itemQuantity: 0, totalMoney: 0, hasMultipleTransactions: false, mapSec: 0 },
];

// The field side of the adapter.
let sGame: Game = null!;
/** Leaves the hardware scene of BUY/SELL (CB2_ReturnToField). */
let sCloseScene: (() => void) | null = null;
const sShopTransitionCallbacks = new Map<number, () => void>();

const sShopMenuActions_BuySellQuit = () => [
  { text: txt("gText_ShopBuy"), func: (taskId: number) => Task_HandleShopMenuBuy(taskId) },
  { text: txt("gText_ShopSell"), func: (taskId: number) => Task_HandleShopMenuSell(taskId) },
  { text: txt("gText_ShopQuit"), func: (taskId: number) => Task_HandleShopMenuQuit(taskId) },
];

const sShopMenuActions_BuyQuit: YesNoFuncTable = {
  yesFunc: (taskId) => BuyMenuTryMakePurchase(taskId),
  noFunc: (taskId) => BuyMenuReturnToItemList(taskId),
};

const sShopMenuWindowTemplate = () => rd<WindowTemplate>("sShopMenuWindowTemplate");
const sShopBuyMenuBgTemplates = () => rd<BgTemplate[]>("sShopBuyMenuBgTemplates");

/** Loads the data the buy screen reads. */
export function preloadShop(): Promise<unknown> {
  return Promise.all([
    loadCData("shop", "buy_menu_helpers", "event_object_movement", "item_menu_icons", "strings", "text_window_graphics"),
    preloadPacks(["graphics_shop_menu", "graphics_items", "graphics_interface", "graphics_text_window", "graphics_fonts", "graphics_object_events"]),
  ]);
}

// Functions
function CreateShopMenu(martType: number): number {
  sShopData.martType = GetMartTypeFromItemList(martType);
  sShopData.selectedRow = 0;
  if (menuHelperHooks.contextNpcGetTextColor() === C.NPC_TEXT_COLOR_MALE) sShopData.fontId = FONT_MALE;
  else sShopData.fontId = FONT_FEMALE;

  // AddWindow + SetStdWindowBorderStyle + PrintTextArray + Menu_InitCursor, on the field's windows.
  const t = sShopMenuWindowTemplate();
  const window = sGame.scriptMenu.createFramedWindow(t.tilemapLeft, t.tilemapTop, t.width, t.height);
  sShopMenuActions_BuySellQuit().forEach((a, i) => printText(window, FONT_NORMAL, a.text, 8, i * 16 + 2));
  sShopMenuWindow = { window, menu: new Menu(window, FONT_NORMAL, 0, 2, 16, 3, 0) };
  return tasks.create(Task_ShopMenu, 8);
}

function GetMartTypeFromItemList(martType: number): number {
  if (martType !== MART_TYPE_REGULAR) return martType;

  for (let i = 0; i < sShopData.itemCount && sShopData.itemList[i] !== 0; i++) {
    if (itemInfo(sShopData.itemList[i])?.pocket === C.POCKET_TM_CASE) return MART_TYPE_TMHM;
  }
  return MART_TYPE_REGULAR;
}

function SetShopItemsForSale(items: number): void {
  // The list is a u16 array in ROM terminated by ITEM_NONE.
  sShopData.itemList = [];
  sShopData.itemCount = 0;
  for (let i = 0; ; i++) {
    const item = rom.u16(items + i * 2);
    if (item === 0) break;
    sShopData.itemList.push(item);
  }
  sShopData.itemCount = sShopData.itemList.length;
}

function SetShopMenuCallback(callback: (() => void) | null): void {
  sShopData.callback = callback;
}

function Task_ShopMenu(taskId: number): void {
  const input = sShopMenuWindow!.menu.processInputNoWrap();

  switch (input) {
    case MENU_NOTHING_CHOSEN:
      break;
    case MENU_B_PRESSED:
      sound.playSE(C.SE_SELECT);
      Task_HandleShopMenuQuit(taskId);
      break;
    default:
      sShopMenuActions_BuySellQuit()[sShopMenuWindow!.menu.cursorPos].func(taskId);
      break;
  }
}

function Task_HandleShopMenuBuy(taskId: number): void {
  sShopTransitionCallbacks.set(taskId, CB2_InitBuyMenu);
  tasks.setFunc(taskId, Task_GoToBuyOrSellMenu);
}

function Task_HandleShopMenuSell(taskId: number): void {
  sShopTransitionCallbacks.set(taskId, CB2_GoToSellMenu);
  tasks.setFunc(taskId, Task_GoToBuyOrSellMenu);
}

/** Task_GoToBuyOrSellMenu; fieldMenu owns the fade/scene handoff in the web port. */
function Task_GoToBuyOrSellMenu(taskId: number): void {
  const callback = sShopTransitionCallbacks.get(taskId);
  sShopTransitionCallbacks.delete(taskId);
  if (!callback) {
    tasks.destroy(taskId);
    return;
  }
  ClearShopMenuWindow();
  tasks.destroy(taskId);
  void preloadShop().then(() => {
    fieldMenu(sGame, (close) => {
      sCloseScene = close;
      callback();
    }, false);
  });
}

function CB2_GoToSellMenu(): void {
  // fieldMenu is already active in Task_GoToBuyOrSellMenu.
  GoToBagMenu(C.ITEMMENULOCATION_SHOP, C.OPEN_BAG_LAST, CB2_ReturnToField, {});
}

function Task_HandleShopMenuQuit(taskId: number): void {
  ClearShopMenuWindow();
  RecordTransactionForQuestLog();
  tasks.destroy(taskId);
  if (sShopData.callback !== null) sShopData.callback();
}

function ClearShopMenuWindow(): void {
  if (!sShopMenuWindow) return;
  sGame.scriptMenu.removeWindow(sShopMenuWindow.window);
  sShopMenuWindow = null;
}

/** CB2_ReturnToField + MapPostLoadHook_ReturnToShopMenu */
function CB2_ReturnToField(): void {
  SetHBlankCallback(null);
  SetVBlankCallback(null);
  SetMainCallback2(null);
  const close = sCloseScene;
  sCloseScene = null;
  close?.();
  MapPostLoadHook_ReturnToShopMenu();
}

/** SetShopExitCallback: the field return adapter runs MapPostLoadHook on entry. */
function SetShopExitCallback(): void {
  SetMainCallback2(CB2_ReturnToField);
}

function MapPostLoadHook_ReturnToShopMenu(): void {
  // FadeInFromBlack(); CreateTask(Task_ReturnToShopMenu, 8)
  Task_ReturnToShopMenu(tasks.create(Task_ReturnToShopMenu, 8));
}

function Task_ReturnToShopMenu(taskId: number): void {
  const ow = sGame.overworld;
  // DisplayItemMessageOnField(taskId, GetMartFontId(), gText_AnythingElseICanHelp, ShowShopMenuAfterExitingBuyOrSellMenu)
  ow.control.MsgSetNotSignpost();
  ow.messageBox.show(txt("gText_AnythingElseICanHelp"));
  tasks.setFunc(taskId, (id) => {
    if (!ow.messageBox.isHidden()) return;
    ShowShopMenuAfterExitingBuyOrSellMenu(id);
  });
}

function ShowShopMenuAfterExitingBuyOrSellMenu(taskId: number): void {
  CreateShopMenu(sShopData.martType);
  tasks.destroy(taskId);
}

function CB2_BuyMenu(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
  DoScheduledBgTilemapCopiesToVram();
}

function VBlankCB_BuyMenu(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function CB2_InitBuyMenu(): void {
  switch (gMain.state) {
    case 0:
      SetVBlankCallback(null);
      SetHBlankCallback(null); // SetVBlankHBlankCallbacksToNull
      ppu.oam.fill(0); // CpuFastFill(0, OAM, 0x400)
      ScanlineEffect_Stop();
      // ResetTempTileDataBuffers(): no temp tile buffers in the port.
      FreeAllSpritePalettes();
      ResetPaletteFade();
      ResetSpriteData();
      tasks.reset();
      ClearScheduledBgCopiesToVram();
      ResetItemMenuIconState();
      if (!InitShopData() || !BuyMenuBuildListMenuTemplate()) {
        BuyMenuFreeMemory();
        SetShopExitCallback();
        return;
      }
      BuyMenuInitBgs();
      FillBgTilemapBufferRect_Palette0(0, 0, 0, 0, 0x20, 0x20);
      FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 0x20, 0x20);
      FillBgTilemapBufferRect_Palette0(2, 0, 0, 0, 0x20, 0x20);
      FillBgTilemapBufferRect_Palette0(3, 0, 0, 0, 0x20, 0x20);
      BuyMenuLoadMapTilesets();
      BuyMenuInitWindows(sShopData.martType === MART_TYPE_TMHM);
      BuyMenuDecompressBgGraphics();
      gMain.state++;
      break;
    case 1:
      // FreeTempTileDataBuffersIfPossible() is FALSE: nothing pending.
      gMain.state++;
      break;
    default: {
      sShopData.selectedRow = 0;
      sShopData.scrollOffset = 0;
      BuyMenuDrawGraphics();
      BuyMenuAddScrollIndicatorArrows();
      const taskId = tasks.create(Task_BuyMenu, 8);
      tasks.tasks[taskId].data[tListTaskId] = ListMenuInit(gMultiuseListMenuTemplate, 0, 0);
      BlendPalettes(PALETTES_ALL, 0x10, RGB_BLACK);
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0x10, 0, RGB_BLACK);
      SetVBlankCallback(VBlankCB_BuyMenu);
      SetMainCallback2(CB2_BuyMenu);
      break;
    }
  }
}

function InitShopData(): boolean {
  gShopTilemapBuffer1 = new Uint16Array(0x400);
  gShopTilemapBuffer2 = new Uint16Array(0x400);
  gShopTilemapBuffer3 = new Uint16Array(0x400);
  gShopTilemapBuffer4 = new Uint16Array(0x400);
  return true;
}

function BuyMenuInitBgs(): void {
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, sShopBuyMenuBgTemplates());
  SetBgTilemapBuffer(1, gShopTilemapBuffer2!);
  SetBgTilemapBuffer(2, gShopTilemapBuffer4!);
  SetBgTilemapBuffer(3, gShopTilemapBuffer3!);
  SetGpuReg(REG_OFFSET_BG0HOFS, DISPCNT_MODE_0);
  SetGpuReg(REG_OFFSET_BG0VOFS, DISPCNT_MODE_0);
  SetGpuReg(REG_OFFSET_BG1HOFS, DISPCNT_MODE_0);
  SetGpuReg(REG_OFFSET_BG1VOFS, DISPCNT_MODE_0);
  SetGpuReg(REG_OFFSET_BG2HOFS, DISPCNT_MODE_0);
  SetGpuReg(REG_OFFSET_BG2VOFS, DISPCNT_MODE_0);
  SetGpuReg(REG_OFFSET_BG3HOFS, DISPCNT_MODE_0);
  SetGpuReg(REG_OFFSET_BG3VOFS, DISPCNT_MODE_0);
  SetGpuReg(REG_OFFSET_BLDCNT, DISPCNT_MODE_0);
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_ON | DISPCNT_OBJ_1D_MAP);
  ShowBg(0);
  ShowBg(1);
  ShowBg(2);
  ShowBg(3);
}

/**
 * Copies the map's tilesets and palettes into hardware VRAM/palette RAM (the C
 * finds them already there from the field): primary tiles at tile 0, secondary
 * at NUM_TILES_IN_PRIMARY, primary palettes 0-6, secondary 7-12.
 */
function BuyMenuLoadMapTilesets(): void {
  const { primary, secondary } = sGame.overworld.map.loaded;
  CopyMapTilesetsToHw(primary, secondary);
}

function BuyMenuDecompressBgGraphics(): void {
  LoadBgTiles(1, incbin("gBuyMenuFrame_Gfx"), 0x480, 0x3dc);
  const tilemap = sShopData.martType !== MART_TYPE_TMHM ? incbin16("gBuyMenuFrame_Tilemap") : incbin16("gBuyMenuFrame_TmHmTilemap");
  gShopTilemapBuffer1!.set(tilemap.subarray(0, gShopTilemapBuffer1!.length));

  const pal = incbin16("gBuyMenuFrame_Pal");
  LoadPalette(pal.subarray(0 * 16, 1 * 16), BG_PLTT_ID(11), PLTT_SIZE_4BPP);
  LoadPalette(pal.subarray(1 * 16, 2 * 16), BG_PLTT_ID(6), PLTT_SIZE_4BPP);
}

function RecolorItemDescriptionBox(a0: boolean): void {
  let paletteNum: number;

  if (a0 === false) paletteNum = 0xb;
  else paletteNum = 0x6;

  if (sShopData.martType !== MART_TYPE_TMHM) SetBgTilemapPalette(1, 0, 14, 30, 6, paletteNum);
  else SetBgTilemapPalette(1, 0, 12, 30, 8, paletteNum);

  ScheduleBgCopyTilemapToVram(1);
}

function BuyMenuDrawGraphics(): void {
  BuyMenuDrawMapView();
  BuyMenuCopyTilemapData();
  BuyMenuDrawMoneyBox();
  ScheduleBgCopyTilemapToVram(0);
  ScheduleBgCopyTilemapToVram(1);
  ScheduleBgCopyTilemapToVram(2);
  ScheduleBgCopyTilemapToVram(3);
}

function BuyMenuBuildListMenuTemplate(): boolean {
  let i: number;

  sShopMenuListMenu = new Array(sShopData.itemCount + 1);
  for (i = 0; i < sShopData.itemCount; i++) {
    PokeMartWriteNameAndIdAt(sShopMenuListMenu, i, sShopData.itemList[i]);
  }
  sShopMenuListMenu[i] = { label: txt("gFameCheckerText_Cancel"), index: -2 };

  gMultiuseListMenuTemplate = {
    items: sShopMenuListMenu,
    totalItems: sShopData.itemCount + 1,
    windowId: 4,
    header_X: 0,
    item_X: 9,
    cursor_X: 1,
    lettersSpacing: 0,
    itemVerticalPadding: 2,
    upText_Y: 2,
    fontId: 2,
    fillValue: 0,
    cursorPal: GetFontAttribute(FONT_NORMAL, FONTATTR_COLOR_FOREGROUND),
    cursorShadowPal: GetFontAttribute(FONT_NORMAL, FONTATTR_COLOR_SHADOW),
    moveCursorFunc: BuyMenuPrintItemDescriptionAndShowItemIcon,
    itemPrintFunc: BuyMenuPrintPriceInList,
    scrollMultiple: 0,
    cursorKind: 0,
    maxShowed: 0,
  };

  const v = sShopData.martType === MART_TYPE_TMHM ? 5 : 6;

  if (sShopData.itemCount + 1 > v) gMultiuseListMenuTemplate.maxShowed = v;
  else gMultiuseListMenuTemplate.maxShowed = sShopData.itemCount + 1;

  sShopData.itemsShowed = gMultiuseListMenuTemplate.maxShowed;
  return true;
}

function PokeMartWriteNameAndIdAt(list: ListMenuItem[], slot: number, index: number): void {
  list[slot] = { label: CopyItemName(index), index };
}

function BuyMenuPrintItemDescriptionAndShowItemIcon(item: number, onInit: boolean, _list: ListMenu): void {
  let description: ArrayLike<number>;

  if (onInit !== true) sound.playSE(C.SE_SELECT);

  if (item !== INDEX_CANCEL) description = ItemId_GetDescription(item);
  else description = txt("gText_QuitShopping");

  FillWindowPixelBuffer(5, PIXEL_FILL(0));
  if (sShopData.martType !== MART_TYPE_TMHM) {
    DestroyItemMenuIcon(sShopData.itemSlot ^ 1);
    if (item !== INDEX_CANCEL) CreateItemMenuIcon(item, sShopData.itemSlot);
    else CreateItemMenuIcon(C.ITEMS_COUNT, sShopData.itemSlot);

    sShopData.itemSlot ^= 1;
    BuyMenuPrint(5, FONT_NORMAL, description, 0, 3, 2, 1, 0, 0);
  } else { // TM Mart
    FillWindowPixelBuffer(6, PIXEL_FILL(0));
    LoadTmHmNameInMart(item);
    BuyMenuPrint(5, FONT_NORMAL, description, 2, 3, 1, 0, 0, 0);
  }
}

function BuyMenuPrintPriceInList(windowId: number, item: number, y: number): void {
  if (item !== INDEX_CANCEL) {
    stringVars.var1 = intToDecimal(itemInfo(item)?.price ?? 0, 0, 4);
    let x = 4 - countChars(stringVars.var1);
    const pad: number[] = [];
    while (x-- !== 0) pad.push(0);
    stringVars.var4 = concat(pad, expandPlaceholders(txt("gText_PokedollarVar1")));
    BuyMenuPrint(windowId, FONT_SMALL, stringVars.var4, 0x69, y, 0, 0, 0xff, 1);
  }
}

function countChars(s: ArrayLike<number>): number {
  let n = 0;
  while (n < s.length && s[n] !== 0xff) n++;
  return n;
}

function LoadTmHmNameInMart(item: number): void {
  if (item !== INDEX_CANCEL) {
    stringVars.var1 = intToDecimal(item - C.ITEM_DEVON_SCOPE, 2, 2);
    stringVars.var4 = concat(txt("gText_NumberClear01"), stringVars.var1);
    BuyMenuPrint(6, FONT_SMALL, stringVars.var4, 0, 0, 0, 0, 0xff, 1);
    stringVars.var4 = concat(rom.moveName(tmhmMove(item)));
    BuyMenuPrint(6, FONT_NORMAL, stringVars.var4, 0, 0x10, 0, 0, 0, 1);
  } else {
    BuyMenuPrint(6, FONT_SMALL, txt("gText_ThreeHyphens"), 0, 0, 0, 0, 0xff, 1);
    BuyMenuPrint(6, FONT_NORMAL, txt("gText_SevenHyphens"), 0, 0x10, 0, 0, 0, 1);
  }
}

/** GetMartFontId */
export function GetMartFontId(): number {
  return sShopData.fontId;
}

function BuyMenuPrintCursor(listTaskId: number, a1: number): void {
  BuyMenuPrintCursorAtYPosition(ListMenuGetYCoordForPrintingArrowCursor(listTaskId), a1);
}

function BuyMenuPrintCursorAtYPosition(y: number, a1: number): void {
  if (a1 === 0xff) {
    FillWindowPixelRect(4, 0, 1, y, GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_WIDTH), GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT));
    CopyWindowToVram(4, COPYWIN_GFX);
  } else {
    BuyMenuPrint(4, FONT_NORMAL, txt("gText_SelectorArrow2"), 1, y, 0, 0, 0, a1);
  }
}

function BuyMenuFreeMemory(): void {
  gShopTilemapBuffer1 = null;
  gShopTilemapBuffer2 = null;
  gShopTilemapBuffer3 = null;
  gShopTilemapBuffer4 = null;
  sShopMenuListMenu = [];
  FreeAllWindowBuffers();
}

function BuyMenuAddScrollIndicatorArrows(): void {
  if (sShopData.martType !== MART_TYPE_TMHM) {
    sShopData.unk16_11 = AddScrollIndicatorArrowPairParameterized(SCROLL_ARROW_UP, 160, 8, 104,
      (sShopData.itemCount - sShopData.itemsShowed) + 1, 110, 110, () => sShopData.scrollOffset);
  } else {
    sShopData.unk16_11 = AddScrollIndicatorArrowPairParameterized(SCROLL_ARROW_UP, 160, 8, 88,
      (sShopData.itemCount - sShopData.itemsShowed) + 1, 110, 110, () => sShopData.scrollOffset);
  }
}

function BuyQuantityAddScrollIndicatorArrows(): void {
  sShopData.unk18 = 1;
  sShopData.unk16_11 = AddScrollIndicatorArrowPairParameterized(SCROLL_ARROW_UP, 0x98, 0x48, 0x68, 2, 0x6e, 0x6e, () => sShopData.unk18);
}

function BuyMenuRemoveScrollIndicatorArrows(): void {
  if (sShopData.unk16_11 === 0x1f) return;

  RemoveScrollIndicatorArrowPair(sShopData.unk16_11);
  sShopData.unk16_11 = 0x1f;
}

function BuyMenuDrawMapView(): void {
  BuyMenuCollectObjectEventData();
  BuyMenuDrawObjectEvents();
  BuyMenuDrawMapBg();
}

/** GetXYCoordsOneStepInFrontOfPlayer */
function GetXYCoordsOneStepInFrontOfPlayer(): { x: number; y: number } {
  const player = sGame.overworld.objects.player()!;
  const [dx, dy] = DIRECTION_VECTORS[player.facingDirection];
  return { x: player.currentCoords.x + dx, y: player.currentCoords.y + dy };
}

function BuyMenuDrawMapBg(): void {
  const map = sGame.overworld.map;
  const front = GetXYCoordsOneStepInFrontOfPlayer();
  const x = front.x - 2;
  const y = front.y - 3;

  for (let j = 0; j < 10; j++) {
    for (let i = 0; i < 5; i++) {
      const metatile = map.metatileIdAt(x + i, y + j);
      const metatileLayerType = map.attributeAt(x + i, y + j, METATILE_ATTRIBUTE_LAYER_TYPE);

      if (metatile < NUM_METATILES_IN_PRIMARY) {
        BuyMenuDrawMapMetatile(i, j, map.loaded.primary.metatiles.subarray(metatile * 8, metatile * 8 + 8), metatileLayerType);
      } else {
        const local = (metatile - NUM_METATILES_IN_PRIMARY) * 8;
        BuyMenuDrawMapMetatile(i, j, map.loaded.secondary.metatiles.subarray(local, local + 8), metatileLayerType);
      }
    }
  }
}

const METATILE_LAYER_TYPE_NORMAL = 0;
const METATILE_LAYER_TYPE_COVERED = 1;
const METATILE_LAYER_TYPE_SPLIT = 2;

function BuyMenuDrawMapMetatile(x: number, y: number, src: Uint16Array, metatileLayerType: number): void {
  const offset1 = x * 2;
  const offset2 = y * 64 + 64;

  switch (metatileLayerType) {
    case METATILE_LAYER_TYPE_NORMAL:
      BuyMenuDrawMapMetatileLayer(gShopTilemapBuffer4!, offset1, offset2, src, 0);
      BuyMenuDrawMapMetatileLayer(gShopTilemapBuffer2!, offset1, offset2, src, 4);
      break;
    case METATILE_LAYER_TYPE_COVERED:
      BuyMenuDrawMapMetatileLayer(gShopTilemapBuffer3!, offset1, offset2, src, 0);
      BuyMenuDrawMapMetatileLayer(gShopTilemapBuffer4!, offset1, offset2, src, 4);
      break;
    case METATILE_LAYER_TYPE_SPLIT:
      BuyMenuDrawMapMetatileLayer(gShopTilemapBuffer3!, offset1, offset2, src, 0);
      BuyMenuDrawMapMetatileLayer(gShopTilemapBuffer2!, offset1, offset2, src, 4);
      break;
  }
}

function BuyMenuDrawMapMetatileLayer(dest: Uint16Array, offset1: number, offset2: number, src: Uint16Array, srcOffset: number): void {
  dest[offset1 + offset2] = src[srcOffset]; // top left
  dest[offset1 + offset2 + 1] = src[srcOffset + 1]; // top right
  dest[offset1 + offset2 + 32] = src[srcOffset + 2]; // bottom left
  dest[offset1 + offset2 + 33] = src[srcOffset + 3]; // bottom right
}

function BuyMenuCollectObjectEventData(): void {
  const ow = sGame.overworld;
  const front = GetXYCoordsOneStepInFrontOfPlayer();
  const elevation = ow.objects.player()!.currentElevation;
  let num = 0;

  sViewportObjectEvents = Array.from({ length: OBJECT_EVENTS_COUNT }, () => [OBJECT_EVENTS_COUNT, 0, 0, 0]);

  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 7; x++) {
      const object = ow.objects.objectAtXYZ(front.x - 3 + x, front.y - 2 + y, elevation);
      if (object !== undefined && num < OBJECT_EVENTS_COUNT) {
        sViewportObjectEvents[num][OBJECT_EVENT_ID] = ow.objects.indexOf(object);
        sViewportObjectEvents[num][X_COORD] = x;
        sViewportObjectEvents[num][Y_COORD] = y;

        switch (object.facingDirection) {
          case DIR_SOUTH:
            sViewportObjectEvents[num][ANIM_NUM] = 0;
            break;
          case DIR_NORTH:
            sViewportObjectEvents[num][ANIM_NUM] = 1;
            break;
          case DIR_WEST:
            sViewportObjectEvents[num][ANIM_NUM] = 2;
            break;
          case DIR_EAST:
          default:
            sViewportObjectEvents[num][ANIM_NUM] = 3;
            break;
        }
        num++;
      }
    }
  }
}

function BuyMenuDrawObjectEvents(): void {
  const ow = sGame.overworld;
  for (let i = 0; i < OBJECT_EVENTS_COUNT; i++) {
    if (sViewportObjectEvents[i][OBJECT_EVENT_ID] === OBJECT_EVENTS_COUNT) continue;

    const object = ow.objects.objects[sViewportObjectEvents[i][OBJECT_EVENT_ID]]!;
    const graphicsInfo = GetObjectEventGraphicsInfo(object.graphicsId);
    const spriteId = CreateObjectGraphicsSprite(
      object.graphicsId,
      SpriteCallbackDummy,
      (sViewportObjectEvents[i][X_COORD] * 16 - 8) & 0xffff,
      (sViewportObjectEvents[i][Y_COORD] * 16 + 48 - Math.trunc(graphicsInfo.height / 2)) & 0xffff,
      2);
    if (spriteId !== MAX_SPRITES) StartSpriteAnim(gSprites[spriteId], sViewportObjectEvents[i][ANIM_NUM]);
  }
}

function BuyMenuCopyTilemapData(): void {
  const dst = gShopTilemapBuffer2!;
  const src = gShopTilemapBuffer1!;

  for (let i = 0; i < 0x400; i++) {
    if (src[i] === 0) continue;
    dst[i] = (src[i] + 0xb3dc) & 0xffff;
  }
}

function BuyMenuPrintItemQuantityAndPrice(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  FillWindowPixelBuffer(3, PIXEL_FILL(1));
  PrintMoneyAmount(3, 0x36, 0xa, sShopData.itemPrice, 0xff);
  stringVars.var1 = intToDecimal(data[tItemCount], STR_CONV_MODE_LEADING_ZEROS, 2);
  stringVars.var4 = expandPlaceholders(txt("gText_TimesStrVar1"));
  BuyMenuPrint(3, FONT_SMALL, stringVars.var4, 2, 0xa, 0, 0, 0, 1);
}

function Task_BuyMenu(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  if (!gPaletteFade.active) {
    const itemId = ListMenu_ProcessInput(data[tListTaskId]);
    const pos = ListMenuGetScrollAndRow(data[tListTaskId]);
    sShopData.scrollOffset = pos.cursorPos;
    sShopData.selectedRow = pos.itemsAbove;
    switch (itemId) {
      case LIST_NOTHING_CHOSEN:
        break;
      case LIST_CANCEL:
        sound.playSE(C.SE_SELECT);
        ExitBuyMenu(taskId);
        break;
      default:
        sound.playSE(C.SE_SELECT);
        data[tItemId] = itemId;
        ClearWindowTilemap(5);
        BuyMenuRemoveScrollIndicatorArrows();
        BuyMenuPrintCursor(data[tListTaskId], 2);
        RecolorItemDescriptionBox(true);
        sShopData.itemPrice = itemInfo(itemId)?.price ?? 0;
        if (!(save.money >= sShopData.itemPrice)) { // IsEnoughMoney
          BuyMenuDisplayMessage(taskId, txt("gText_YouDontHaveMoney"), BuyMenuReturnToItemList);
        } else {
          stringVars.var1 = CopyItemName(itemId);
          BuyMenuDisplayMessage(taskId, txt("gText_Var1CertainlyHowMany"), Task_BuyHowManyDialogueInit);
        }
        break;
    }
  }
}

function Task_BuyHowManyDialogueInit(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const quantityInBag = bagItemQuantity(data[tItemId]);

  BuyMenuQuantityBoxThinBorder(1, false);
  stringVars.var1 = intToDecimal(quantityInBag, STR_CONV_MODE_RIGHT_ALIGN, 3);
  stringVars.var4 = expandPlaceholders(txt("gText_InBagVar1"));
  BuyMenuPrint(1, FONT_NORMAL, stringVars.var4, 0, 2, 0, 0, 0, 1);
  data[tItemCount] = 1;
  BuyMenuQuantityBoxNormalBorder(3, false);
  BuyMenuPrintItemQuantityAndPrice(taskId);
  ScheduleBgCopyTilemapToVram(0);
  const maxQuantity = Math.trunc(save.money / (itemInfo(data[tItemId])?.price ?? 1));
  if (maxQuantity > 99) sShopData.maxQuantity = 99;
  else sShopData.maxQuantity = maxQuantity & 0xff;

  if (maxQuantity !== 1) BuyQuantityAddScrollIndicatorArrows();

  tasks.tasks[taskId].func = Task_BuyHowManyDialogueHandleInput;
}

function Task_BuyHowManyDialogueHandleInput(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const quantity = { value: data[tItemCount] };

  if (AdjustQuantityAccordingToDPadInput(quantity, sShopData.maxQuantity) === true) {
    data[tItemCount] = quantity.value;
    sShopData.itemPrice = (itemInfo(data[tItemId])?.price ?? 0) * data[tItemCount];
    BuyMenuPrintItemQuantityAndPrice(taskId);
  } else {
    if (JOY_NEW(A_BUTTON)) {
      sound.playSE(C.SE_SELECT);
      BuyMenuRemoveScrollIndicatorArrows();
      ClearStdWindowAndFrameToTransparent(3, false);
      ClearStdWindowAndFrameToTransparent(1, false);
      ClearWindowTilemap(3);
      ClearWindowTilemap(1);
      PutWindowTilemap(4);
      stringVars.var1 = CopyItemName(data[tItemId]);
      stringVars.var2 = intToDecimal(data[tItemCount], STR_CONV_MODE_LEFT_ALIGN, 2);
      stringVars.var3 = intToDecimal(sShopData.itemPrice, STR_CONV_MODE_LEFT_ALIGN, 8);
      BuyMenuDisplayMessage(taskId, txt("gText_Var1AndYouWantedVar2"), CreateBuyMenuConfirmPurchaseWindow);
    } else if (JOY_NEW(B_BUTTON)) {
      sound.playSE(C.SE_SELECT);
      BuyMenuRemoveScrollIndicatorArrows();
      ClearStdWindowAndFrameToTransparent(3, false);
      ClearStdWindowAndFrameToTransparent(1, false);
      ClearWindowTilemap(3);
      ClearWindowTilemap(1);
      BuyMenuReturnToItemList(taskId);
    }
  }
}

function CreateBuyMenuConfirmPurchaseWindow(taskId: number): void {
  BuyMenuConfirmPurchase(taskId, sShopMenuActions_BuyQuit);
}

function BuyMenuTryMakePurchase(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  PutWindowTilemap(4);
  if (addBagItem(data[tItemId], data[tItemCount]) === true) {
    BuyMenuDisplayMessage(taskId, txt("gText_HereYouGoThankYou"), BuyMenuSubtractMoney);
    DebugFunc_PrintPurchaseDetails(taskId);
    RecordItemTransaction(data[tItemId], data[tItemCount], 1); // QL_EVENT_BOUGHT_ITEM - QL_EVENT_USED_POKEMART
  } else {
    BuyMenuDisplayMessage(taskId, txt("gText_NoMoreRoomForThis"), BuyMenuReturnToItemList);
  }
}

/** DebugFunc_PrintPurchaseDetails (shop.c): intentionally empty in the decomp. */
function DebugFunc_PrintPurchaseDetails(_taskId: number): void {}

function BuyMenuSubtractMoney(taskId: number): void {
  incrementGameStat(C.GAME_STAT_SHOPPED);
  removeMoney(sShopData.itemPrice);
  sound.playSE(C.SE_SHOP);
  PrintMoneyAmountInMoneyBox(0, save.money, 0);
  tasks.tasks[taskId].func = Task_ReturnToItemListAfterItemPurchase;
}

function Task_ReturnToItemListAfterItemPurchase(taskId: number): void {
  if (JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    BuyMenuReturnToItemList(taskId);
  }
}

function BuyMenuReturnToItemList(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  ClearDialogWindowAndFrameToTransparent(2, false);
  BuyMenuPrintCursor(data[tListTaskId], 1);
  RecolorItemDescriptionBox(false);
  PutWindowTilemap(4);
  PutWindowTilemap(5);
  if (sShopData.martType === MART_TYPE_TMHM) PutWindowTilemap(6);

  ScheduleBgCopyTilemapToVram(0);
  BuyMenuAddScrollIndicatorArrows();
  tasks.tasks[taskId].func = Task_BuyMenu;
}

function ExitBuyMenu(taskId: number): void {
  // gFieldCallback = MapPostLoadHook_ReturnToShopMenu
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
  tasks.tasks[taskId].func = Task_ExitBuyMenu;
}

function Task_ExitBuyMenu(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  if (!gPaletteFade.active) {
    DestroyListMenuTask(data[tListTaskId]);
    BuyMenuFreeMemory();
    tasks.destroy(taskId);
    CB2_ReturnToField();
  }
}

// Records a transaction during a single shopping session.
// This is for the Quest Log to save information about the player's purchases/sales when they finish.
export function RecordItemTransaction(itemId: number, quantity: number, logEventId: number): void {
  let history: QuestLogEvent_Shop;

  // There should only be a single entry for buying/selling respectively,
  // so if one has already been created then get it first.
  if (sHistory[0].logEventId === logEventId) {
    history = sHistory[0];
  } else if (sHistory[1].logEventId === logEventId) {
    history = sHistory[1];
  } else {
    // First transaction of this type, save it in an empty slot
    if (sHistory[0].logEventId === 0) history = sHistory[0];
    else history = sHistory[1];
    history.logEventId = logEventId;
  }

  // Set flag if this isn't the first time we've bought/sold in this session
  if (history.lastItemId !== C.ITEM_NONE) history.hasMultipleTransactions = true;

  history.lastItemId = itemId;

  // Add to number of items bought/sold
  if (history.itemQuantity < 999) {
    history.itemQuantity += quantity;
    if (history.itemQuantity > 999) history.itemQuantity = 999;
  }

  // Add to amount of money spent buying or earned selling
  if (history.totalMoney < 999999) {
    // logEventId will either be 1 (bought) or 2 (sold)
    // so for buying it will add the full price and selling will add half price
    history.totalMoney += ((itemInfo(itemId)?.price ?? 0) >> (logEventId - 1)) * quantity;
    if (history.totalMoney > 999999) history.totalMoney = 999999;
  }
}

/** RecordTransactionForQuestLog (shop.c): submit bought/sold summaries on exit. */
function RecordTransactionForQuestLog(): void {
  for (const history of sHistory) {
    if (history.logEventId === 0) continue;
    SetQuestLogEvent(history.logEventId + C.QL_EVENT_USED_POKEMART, {
      totalMoney: history.totalMoney,
      lastItemId: history.lastItemId,
      itemQuantity: history.itemQuantity,
      mapSec: history.mapSec,
      hasMultipleTransactions: history.hasMultipleTransactions,
      logEventId: history.logEventId,
    });
  }
}

/** CreatePokemartMenu (itemsForSale: ROM pointer to the u16 list) */
export function CreatePokemartMenu(game: Game, itemsForSale: number): void {
  sGame = game;
  SetShopItemsForSale(itemsForSale);
  CreateShopMenu(MART_TYPE_REGULAR);
  SetShopMenuCallback(() => game.overworld.script.ScriptContext_Enable()); // ScriptContext_Enable
  DebugFunc_PrintShopMenuHistoryBeforeClearMaybe();
  for (const h of sHistory) Object.assign(h, { logEventId: 0, lastItemId: 0, itemQuantity: 0, totalMoney: 0, hasMultipleTransactions: false, mapSec: 0 });
}

/** DebugFunc_PrintShopMenuHistoryBeforeClearMaybe (shop.c): intentionally empty. */
function DebugFunc_PrintShopMenuHistoryBeforeClearMaybe(): void {}

/** CreateDecorationShop1Menu */
export function CreateDecorationShop1Menu(game: Game, itemsForSale: number): void {
  sGame = game;
  SetShopItemsForSale(itemsForSale);
  CreateShopMenu(MART_TYPE_DECOR);
  SetShopMenuCallback(() => game.overworld.script.ScriptContext_Enable());
}

/** CreateDecorationShop2Menu */
export function CreateDecorationShop2Menu(game: Game, itemsForSale: number): void {
  sGame = game;
  SetShopItemsForSale(itemsForSale);
  CreateShopMenu(MART_TYPE_DECOR2);
  SetShopMenuCallback(() => game.overworld.script.ScriptContext_Enable());
}
