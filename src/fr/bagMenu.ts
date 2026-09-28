// item_menu.c (the BAG screen: pockets, item list, context menu, toss,
// register, move, sell and deposit flows), bag.c (its windows) and
// item_menu_icons.c (bag sprite, swap line and item icons) on the hardware
// layer. What an item *does* (ItemId_GetFieldFunc / GetBattleFunc, giving it
// to a Pokémon, the TM case and berry pouch) is supplied by the caller
// through BagHandlers, which receive a context standing in for the bag task
// (DisplayItemMessageInBag / ItemMenu_SetExitCallback).

import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { expandPlaceholders, intToDecimal, stringVars, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "./gba/charmap";
import { FONT_NORMAL, FONT_NORMAL_COPY_1, FONT_SMALL, stringWidth } from "./gba/font";
import { joy, A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, SELECT_BUTTON } from "./gba/input";
import { tasks, type TaskFunc } from "./gba/tasks";
import { getTextSpeedSetting, textFlags } from "./gba/textPrinter";
import { cdata, incbin, incbin16, loadCData, preloadPacks, symName, type SymRef } from "./hw/assets";
import {
  CopyToBgTilemapBufferRect, FillBgTilemapBufferRect_Palette0, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags,
  SetBgTilemapBuffer, ShowBg,
} from "./hw/bg";
import { affineAnimsFrom, animsFrom, oamFrom } from "./hw/cdataSprite";
import { SetGpuReg } from "./hw/gpu";
import {
  DestroyListMenuTask, LIST_CANCEL, LIST_NO_MULTIPLE_SCROLL, LIST_NOTHING_CHOSEN, ListMenu_ProcessInput, ListMenuGetScrollAndRow,
  ListMenuGetYCoordForPrintingArrowCursor, ListMenuInit, listMenuTemplate, ListMenuSetTemplateField, AddScrollIndicatorArrowPair,
  AddScrollIndicatorArrowPairParameterized, RemoveScrollIndicatorArrowPair, SCROLL_ARROW_UP, type ListMenuItem, type ListMenuTemplate, type ScrollArrowsTemplate,
} from "./hw/listMenu";
import {
  ClearDialogWindowAndFrameToTransparent, ClearStdWindowAndFrameToTransparent, DrawStdFrameWithCustomTileAndPalette, FONTATTR_LETTER_SPACING,
  FONTATTR_MAX_LETTER_HEIGHT, GetFontAttribute, GetMenuCursorDimensionByFont, LoadMenuMessageWindowGfx, LoadStdWindowGfx, LoadUserWindowGfx, MENU_B_PRESSED,
  MENU_NOTHING_CHOSEN, Menu_InitCursor, Menu_MoveCursorNoWrapAround, Menu_ProcessInputNoWrapAround,
} from "./hw/menu";
import {
  AddItemMenuActionTextPrinters, AdjustQuantityAccordingToDPadInput, ClearScheduledBgCopiesToVram, CopyItemName, CreateYesNoMenuWithCallbacks,
  DisplayMessageAndContinueTask, DoScheduledBgTilemapCopiesToVram, DrawTextBorderOuter, FuncIsActiveTask, GetDialogBoxFontId, GetLRKeysPressed,
  IsWritingMailAllowed, MENU_L_PRESSED, MENU_R_PRESSED, PrintMoneyAmount, PrintMoneyAmountInMoneyBox, PrintMoneyAmountInMoneyBoxWithBorder,
  ResetAllBgsCoordinatesAndBgCntRegs, ScheduleBgCopyTilemapToVram, SetBgTilemapPalette, SetTaskFuncWithFollowupFunc, SwitchTaskToFollowupFunc,
  type MenuAction, type YesNoFuncTable,
} from "./hw/menuHelpers";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalettes, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, PALETTES_ALL, ResetPaletteFade,
  RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import {
  DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, REG_OFFSET_BLDCNT, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT,
  WIN_RANGE, WININ_WIN0_BG_ALL, WININ_WIN0_CLR, WININ_WIN0_OBJ,
} from "./hw/ppu";
import { gMain, SetHBlankCallback, SetMainCallback2, SetVBlankCallback, SetMainCallback2WhenLoaded } from "./hw/runtime";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, DestroySpriteAndFreeResources, FreeAllSpritePalettes, FreeSpritePaletteByTag, FreeSpriteTilesByTag,
  gDummySpriteAffineAnimTable, gSprites, LoadOam, LoadSpritePalette, LoadSpriteSheet, MAX_SPRITES, ProcessSpriteCopyRequests, ResetSpriteData,
  SpriteCallbackDummy, StartSpriteAffineAnim, StartSpriteAnim, type Sprite, type SpriteTemplate,
} from "./hw/sprite";
import { AddTextPrinterParameterized, AddTextPrinterParameterized3, AddTextPrinterParameterized4, DeactivateAllTextPrinters } from "./hw/text";
import {
  AddWindow, BlitBitmapToWindow, ClearWindowTilemap, COPYWIN_MAP, CopyWindowToVram, FillWindowPixelBuffer, FillWindowPixelRect, FreeAllWindowBuffers,
  InitWindows, PIXEL_FILL, PutWindowTilemap, RemoveWindow, type WindowTemplate,
} from "./hw/window";
import { addBagItem, addMoney, addPCItem, BagPocketCompaction, ItemId_GetFieldFunc, ItemId_GetPocket, itemInfo, pocketList, removeBagItem } from "./pokemon/items";
import { b64, rom } from "./rom";
import { Pokedude_InitTMCase, InitTMCase } from "./tmCase";
import { InitBerryPouch } from "./berryPouch";
import { save } from "./save";

// ---------------------------------------------------------------- public state and hooks

/** gBagMenuState */
export const gBagMenuState = {
  location: C.ITEMMENULOCATION_FIELD, pocket: 0, bagOpen: false,
  cursorPos: [0, 0, 0], itemsAbove: [0, 0, 0],
  bagCallback: null as (() => void) | null,
};

/** gSpecialVar_ItemId as the bag leaves it. */
export const bagResult = { itemId: 0 };

/** RemoveUsedItem (item_use.c): consume the selected item and prepare gStringVar4. */
export function RemoveUsedItem(itemId: number): Uint8Array {
  removeBagItem(itemId, 1);
  const pocketId = ItemId_GetPocket(itemId);
  // The C helper passes ItemId_GetPocket directly to these zero-based bag-menu
  // routines. Its call is only meaningful while the bag display still exists.
  if (sBagMenuDisplay && pocketId < NUM_BAG_POCKETS_NO_CASES) {
    Pocket_CalculateNItemsAndMaxShowed(pocketId);
    PocketCalculateInitialCursorPosAndItemsAbove(pocketId);
  }
  stringVars.var2 = CopyItemName(itemId);
  return expandPlaceholders(text("gText_PlayerUsedVar2"));
}

/** Stands in for the bag task when an item's field or battle function runs. */
export type BagTaskContext = {
  taskId: number;
  /** DisplayItemMessageInBag(..., followUpFunc), defaulting to the bag's normal return task. */
  message(str: ArrayLike<number>, fontId?: number, followUpFunc?: TaskFunc): void;
  /** ItemMenu_SetExitCallback(cb) + ItemMenu_StartFadeToExitCallback */
  exit(cb: () => void, closeWindow?: boolean): void;
};

export type BagHandlers = {
  /** ItemId_GetFieldFunc(item)(taskId); resolve with ctx.message or ctx.exit. */
  fieldUse?(itemId: number, ctx: BagTaskContext): void;
  /** ItemId_GetBattleFunc(item)(taskId). */
  battleUse?(itemId: number, ctx: BagTaskContext): void;
  /** CB2_ChooseMonToGiveItem after the bag faded out. */
  giveToMon?(itemId: number): void;
  /** GoToTMCase_* / GoToBerryPouch_* for the PARTY, PCBOX and SHOP locations. */
  openCase?(itemId: number, location: number): void;
  /** TestPlayerAvatarFlags(ACRO | MACH): the Bicycle shows WALK. */
  isOnBike?(): boolean;
};

let sHandlers: BagHandlers = {};

// ---------------------------------------------------------------- data

const NUM_BAG_POCKETS_NO_CASES = 3;
const ITEMMENUACTION_USE = 0, ITEMMENUACTION_TOSS = 1, ITEMMENUACTION_REGISTER = 2, ITEMMENUACTION_GIVE = 3, ITEMMENUACTION_CANCEL = 4,
  ITEMMENUACTION_BATTLE_USE = 5, ITEMMENUACTION_CHECK = 6, ITEMMENUACTION_OPEN = 7, ITEMMENUACTION_OPEN_BERRIES = 8, ITEMMENUACTION_WALK = 9,
  ITEMMENUACTION_DESELECT = 10, ITEMMENUACTION_DUMMY = 11;
const LIST_TILES_WIDTH = 18, LIST_TILES_HEIGHT = 12;
const TAG_BAG = 100, TAG_SWAP_LINE = 101, TAG_ITEM_ICON = 102;
const NUM_SWAP_LINE_SPRITES = 9;
const SPR_BAG = 0, SPR_SWAP_LINE_START = 1, SPR_ITEM_ICON = SPR_SWAP_LINE_START + NUM_SWAP_LINE_SPRITES, SPR_COUNT = SPR_ITEM_ICON + 2;
const SPRITE_NONE = 0xff, TASK_NONE = 0xff;
const SHRT_MAX = 0x7fff;

const rd = <T>(file: string, name: string): T => cdata<T>(file, name);
const text = (name: string): Uint8Array => rom.text(name);
const sym = (name: string): SymRef => ({ $sym: name });

const SPOCKET_NAMES = ["gText_Items2", "gText_KeyItems2", "gText_PokeBalls2"];
const ACTION_TEXTS = ["gOtherText_Use", "gOtherText_Toss", "gOtherText_Register", "gOtherText_Give", "gFameCheckerText_Cancel", "gOtherText_Use",
  "gOtherText_Check", "gOtherText_Open", "gOtherText_Open", "gOtherText_Walk", "gOtherText_Deselect", "gString_Dummy"];
let sItemMenuContextActions: MenuAction[] = [];
const sContextMenuItems_Field = [
  [ITEMMENUACTION_USE, ITEMMENUACTION_GIVE, ITEMMENUACTION_TOSS, ITEMMENUACTION_CANCEL],
  [ITEMMENUACTION_USE, ITEMMENUACTION_REGISTER, ITEMMENUACTION_CANCEL, ITEMMENUACTION_DUMMY],
  [ITEMMENUACTION_GIVE, ITEMMENUACTION_TOSS, ITEMMENUACTION_CANCEL, ITEMMENUACTION_DUMMY],
];
const sContextMenuItems_CheckGiveTossCancel = [ITEMMENUACTION_CHECK, ITEMMENUACTION_GIVE, ITEMMENUACTION_TOSS, ITEMMENUACTION_CANCEL];
const sContextMenuItems_BattleUse = [ITEMMENUACTION_BATTLE_USE, ITEMMENUACTION_CANCEL];
const sContextMenuItems_Cancel = [ITEMMENUACTION_CANCEL, ITEMMENUACTION_DUMMY];

// ---------------------------------------------------------------- item data helpers

const pocketSlots = (pocket: number) => pocketList(pocket);
const BagGetItemIdByPocketPosition = (pocket: number, idx: number): number => pocketSlots(pocket)[idx]?.item ?? C.ITEM_NONE;
const BagGetQuantityByPocketPosition = (pocket: number, idx: number): number => pocketSlots(pocket)[idx]?.quantity ?? 0;
const ItemId_GetImportance = (id: number): number => itemInfo(id)?.importance ?? 0;
const ItemId_GetPrice = (id: number): number => itemInfo(id)?.price ?? 0;
const ItemId_GetBattleUsage = (id: number): number => itemInfo(id)?.battleUsage ?? 0;
const ItemId_GetType = (id: number): number => {
  const type = itemInfo(id)?.type ?? 0;
  return typeof type === "number" ? type : rom.constants[type] ?? 0;
};
export const ItemId_GetDescription = (id: number): Uint8Array => b64(itemInfo(id)?.description ?? itemInfo(0)!.description);
const ItemIsMail = (id: number): boolean => id >= C.ITEM_ORANGE_MAIL && id <= C.ITEM_RETRO_MAIL;
const u8str = (bytes: ArrayLike<number>): number[] => { const o: number[] = []; for (let i = 0; i < bytes.length && bytes[i] !== 0xff; i++) o.push(bytes[i]); return o; };
const cat = (...parts: ArrayLike<number>[]): Uint8Array => Uint8Array.from([...parts.flatMap(u8str), 0xff]);

// ---------------------------------------------------------------- bag.c windows

let sOpenWindows: number[] = new Array(11).fill(0xff);
let sTextColors: number[][] = [];
let sWindowTemplates: WindowTemplate[] = [];

function InitBagWindows(): void {
  InitWindows(rd<WindowTemplate[]>("bag", gBagMenuState.location !== C.ITEMMENULOCATION_ITEMPC ? "sDefaultBagWindowsStd" : "sDefaultBagWindowsDeposit"));
  DeactivateAllTextPrinters();
  LoadUserWindowGfx(0, 0x64, BG_PLTT_ID(14), save.options.frameType);
  LoadMenuMessageWindowGfx(0, 0x6d, BG_PLTT_ID(13));
  LoadStdWindowGfx(0, 0x81, BG_PLTT_ID(12));
  LoadPalette(incbin("sBagWindowPalF"), BG_PLTT_ID(15), 32);
  for (let i = 0; i < 3; i++) { FillWindowPixelBuffer(i, 0x00); PutWindowTilemap(i); }
  ScheduleBgCopyTilemapToVram(0);
  sOpenWindows = new Array(11).fill(0xff);
}

function BagPrintTextOnWindow(windowId: number, fontId: number, str: ArrayLike<number>, x: number, y: number, letterSpacing: number, lineSpacing: number, speed: number, colorIdx: number): void {
  AddTextPrinterParameterized4(windowId, fontId, x, y, letterSpacing, lineSpacing, sTextColors[colorIdx], speed, str);
}

function BagPrintTextOnWin1CenteredColor0(str: ArrayLike<number>): void {
  const x = 0x48 - stringWidth(FONT_NORMAL_COPY_1, str, 0);
  AddTextPrinterParameterized3(2, FONT_NORMAL_COPY_1, Math.floor(x / 2), 1, sTextColors[0], 0, str);
}

function BagDrawDepositItemTextBox(): void {
  DrawStdFrameWithCustomTileAndPalette(2, false, 0x081, 12);
  const str = text("gText_DepositItem");
  const x = 0x40 - stringWidth(FONT_SMALL, str, 0);
  AddTextPrinterParameterized(2, FONT_SMALL, str, Math.floor(x / 2), 1, 0, null);
}

function ShowBagWindow(whichWindow: number, nItems: number): number {
  if (sOpenWindows[whichWindow] === 0xff) {
    sOpenWindows[whichWindow] = AddWindow(sWindowTemplates[whichWindow + nItems]);
    if (whichWindow !== 6) DrawStdFrameWithCustomTileAndPalette(sOpenWindows[whichWindow], false, 0x064, 14);
    else DrawStdFrameWithCustomTileAndPalette(sOpenWindows[whichWindow], false, 0x081, 12);
    ScheduleBgCopyTilemapToVram(0);
  }
  return sOpenWindows[whichWindow];
}

function HideBagWindow(whichWindow: number): void {
  if (sOpenWindows[whichWindow] === 0xff) return;
  ClearStdWindowAndFrameToTransparent(sOpenWindows[whichWindow], false);
  ClearWindowTilemap(sOpenWindows[whichWindow]);
  RemoveWindow(sOpenWindows[whichWindow]);
  ScheduleBgCopyTilemapToVram(0);
  sOpenWindows[whichWindow] = 0xff;
}

function OpenBagWindow(whichWindow: number): number {
  if (sOpenWindows[whichWindow] === 0xff) sOpenWindows[whichWindow] = AddWindow(sWindowTemplates[whichWindow]);
  return sOpenWindows[whichWindow];
}

function CloseBagWindow(whichWindow: number): void {
  if (sOpenWindows[whichWindow] === 0xff) return;
  ClearDialogWindowAndFrameToTransparent(sOpenWindows[whichWindow], false);
  ClearWindowTilemap(sOpenWindows[whichWindow]);
  RemoveWindow(sOpenWindows[whichWindow]);
  PutWindowTilemap(1);
  ScheduleBgCopyTilemapToVram(0);
  sOpenWindows[whichWindow] = 0xff;
}

const GetBagWindow = (whichWindow: number): number => sOpenWindows[whichWindow];

function BagCreateYesNoMenuBottomRight(taskId: number, ptrs: YesNoFuncTable): void {
  CreateYesNoMenuWithCallbacks(taskId, sWindowTemplates[3], FONT_NORMAL, 0, 2, 0x064, 14, ptrs);
}

function BagCreateYesNoMenuTopRight(taskId: number, ptrs: YesNoFuncTable): void {
  CreateYesNoMenuWithCallbacks(taskId, sWindowTemplates[4], FONT_NORMAL, 0, 2, 0x064, 14, ptrs);
}

function BagPrintMoneyAmount(): void {
  PrintMoneyAmountInMoneyBoxWithBorder(ShowBagWindow(2, 0), 0x081, 0x0c, save.money);
}

function BagDrawTextBoxOnWindow(windowId: number): void {
  DrawTextBorderOuter(windowId, 0x064, 14);
}

// ---------------------------------------------------------------- item_menu_icons.c

const sItemMenuIconSpriteIds = new Array(SPR_COUNT).fill(SPRITE_NONE);

export function ResetItemMenuIconState(): void { sItemMenuIconSpriteIds.fill(SPRITE_NONE); }

function template(tileTag: number, palTag: number, oam: string, anims: string, affine: string | null): SpriteTemplate {
  return {
    tileTag, paletteTag: palTag, oam: oamFrom(sym(oam)), anims: animsFrom(sym(anims)), images: null,
    affineAnims: affine ? affineAnimsFrom(sym(affine)) : gDummySpriteAffineAnimTable, callback: SpriteCallbackDummy,
  };
}

function CreateBagSprite(animNum: number): void {
  sItemMenuIconSpriteIds[SPR_BAG] = CreateSprite(template(TAG_BAG, TAG_BAG, "sOamData_Bag", "sAnims_Bag", "sAffineAnimTable_Bag"), 40, 68, 0);
  SetBagVisualPocketId(animNum);
}

function SetBagVisualPocketId(animNum: number): void {
  const sprite = gSprites[sItemMenuIconSpriteIds[SPR_BAG]];
  sprite.y2 = -5;
  sprite.callback = SpriteCB_BagVisualSwitchingPockets;
  StartSpriteAnim(sprite, animNum);
}

function SpriteCB_BagVisualSwitchingPockets(sprite: Sprite): void {
  if (sprite.y2 !== 0) sprite.y2++;
  else sprite.callback = SpriteCallbackDummy;
}

function ShakeBagSprite(): void {
  const sprite = gSprites[sItemMenuIconSpriteIds[SPR_BAG]];
  if (sprite.affineAnimEnded) {
    StartSpriteAffineAnim(sprite, 1);
    sprite.callback = SpriteCB_ShakeBagSprite;
  }
}

function SpriteCB_ShakeBagSprite(sprite: Sprite): void {
  if (sprite.affineAnimEnded) {
    StartSpriteAffineAnim(sprite, 0);
    sprite.callback = SpriteCallbackDummy;
  }
}

/** LoadCompressedSpriteSheet(&gBagSwapSpriteSheet) (item_menu_icons.c). */
export function LoadBagSwapSpriteSheet(): void {
  LoadSpriteSheet({ data: incbin("gSwapLine_Gfx"), size: 0x100, tag: TAG_SWAP_LINE });
}

/** LoadCompressedSpritePalette(&gBagSwapSpritePalette). */
export function LoadBagSwapSpritePalette(): void {
  LoadSpritePalette({ data: incbin("gSwapLine_Pal"), tag: TAG_SWAP_LINE });
}

export function CreateSwapLine(): void {
  for (let i = 0; i < NUM_SWAP_LINE_SPRITES; i++) {
    const id = CreateSprite(template(TAG_SWAP_LINE, TAG_SWAP_LINE, "sOamData_SwapLine", "sAnims_SwapLine", null), i * 16 + 96, 7, 0);
    sItemMenuIconSpriteIds[SPR_SWAP_LINE_START + i] = id;
    if (i === NUM_SWAP_LINE_SPRITES - 1) StartSpriteAnim(gSprites[id], 2);
    else if (i !== 0) StartSpriteAnim(gSprites[id], 1);
    gSprites[id].invisible = true;
  }
}

export function SetSwapLineInvisibility(invisible: boolean): void {
  for (let i = 0; i < NUM_SWAP_LINE_SPRITES; i++) gSprites[sItemMenuIconSpriteIds[SPR_SWAP_LINE_START + i]].invisible = invisible;
}

export function UpdateSwapLinePos(x: number, y: number): void {
  for (let i = 0; i < NUM_SWAP_LINE_SPRITES; i++) {
    const s = gSprites[sItemMenuIconSpriteIds[SPR_SWAP_LINE_START + i]];
    s.x2 = x;
    s.y = y + 7;
  }
}

/** GetItemIconGfxPtr */
export function itemIconSymbols(itemId: number): [string, string] {
  const table = rd<SymRef[][]>("item_menu_icons", "sItemIconTable");
  const item = itemId & 0xffff;
  const entry = table[item > C.ITEMS_COUNT ? C.ITEM_NONE : item] ?? table[0];
  return [symName(entry[0])!, symName(entry[1])!];
}

let sItemIconTilesBuffer: Uint8Array | null = null;
let sItemIconTilesBufferPadded: Uint8Array | null = null;

/** item_menu_icons.c TryAllocItemIconTilesBuffers; JS owns these temporary buffers until sprite data is copied. */
function TryAllocItemIconTilesBuffers(): boolean {
  try {
    sItemIconTilesBuffer = new Uint8Array(0x120);
    sItemIconTilesBufferPadded = new Uint8Array(0x200);
    return true;
  } catch {
    sItemIconTilesBuffer = null;
    sItemIconTilesBufferPadded = null;
    return false;
  }
}

/** item_menu_icons.c CopyItemIconPicTo4x4Buffer: copy three 0x60-byte rows into the 4x4-tile stride. */
export function CopyItemIconPicTo4x4Buffer(src: Uint8Array, dest: Uint8Array): void {
  for (let i = 0; i < 3; i++) dest.set(src.subarray(0x60 * i, 0x60 * (i + 1)), 0x80 * i);
}

/** item_menu_icons.c GetItemIconGfxPtr; incbin data is already decompressed by the exporter. */
export function GetItemIconGfxPtr(itemId: number, attrId: number): Uint8Array {
  const symbols = itemIconSymbols(itemId);
  return incbin(symbols[attrId === 0 ? 0 : 1]);
}

function addItemIconObject(origTemplate: SpriteTemplate, tilesTag: number, paletteTag: number, itemId: number): number {
  if (!TryAllocItemIconTilesBuffers()) return MAX_SPRITES;
  const tiles = sItemIconTilesBuffer!;
  const padded = sItemIconTilesBufferPadded!;
  try {
    tiles.set(GetItemIconGfxPtr(itemId, 0).subarray(0, 0x120));
    CopyItemIconPicTo4x4Buffer(tiles, padded);
    LoadSpriteSheet({ data: padded, size: 0x200, tag: tilesTag });
    LoadSpritePalette({ data: GetItemIconGfxPtr(itemId, 1), tag: paletteTag });
    return CreateSprite({ ...origTemplate, tileTag: tilesTag, paletteTag }, 0, 0, 0);
  } finally {
    sItemIconTilesBuffer = null;
    sItemIconTilesBufferPadded = null;
  }
}

/** AddItemIconObject: the standard C item icon template, padded to 32x32 tiles. */
export function AddItemIconObject(tilesTag: number, paletteTag: number, itemId: number): number {
  return addItemIconObject(template(tilesTag, paletteTag, "sOamData_ItemIcon", "sAnims_ItemIcon", null), tilesTag, paletteTag, itemId);
}

/** item_menu_icons.c AddItemIconObjectWithCustomObjectTemplate. */
export function AddItemIconObjectWithCustomObjectTemplate(origTemplate: SpriteTemplate, tilesTag: number, paletteTag: number, itemId: number): number {
  return addItemIconObject(origTemplate, tilesTag, paletteTag, itemId);
}

export function CreateItemMenuIcon(itemId: number, idx: number): void {
  CreateItemMenuIconAt(itemId, idx, 140);
}

/** item_menu_icons.c CreateBerryPouchItemIcon: same icon setup with the berry-pouch vertical offset. */
export function CreateBerryPouchItemIcon(itemId: number, idx: number): void {
  CreateItemMenuIconAt(itemId, idx, 147);
}

/** CreateItemMenuIcon (y2 140) / CreateBerryPouchItemIcon (y2 147). */
export function CreateItemMenuIconAt(itemId: number, idx: number, y2: number): void {
  if (sItemMenuIconSpriteIds[SPR_ITEM_ICON + idx] !== SPRITE_NONE) return;
  FreeSpriteTilesByTag(TAG_ITEM_ICON + idx);
  FreeSpritePaletteByTag(TAG_ITEM_ICON + idx);
  const spriteId = AddItemIconObject(TAG_ITEM_ICON + idx, TAG_ITEM_ICON + idx, itemId);
  if (spriteId !== MAX_SPRITES) {
    sItemMenuIconSpriteIds[SPR_ITEM_ICON + idx] = spriteId;
    gSprites[spriteId].x2 = 24;
    gSprites[spriteId].y2 = y2;
  }
}

export function DestroyItemMenuIcon(idx: number): void {
  const id = sItemMenuIconSpriteIds[SPR_ITEM_ICON + idx];
  if (id !== SPRITE_NONE) {
    DestroySpriteAndFreeResources(gSprites[id]);
    sItemMenuIconSpriteIds[SPR_ITEM_ICON + idx] = SPRITE_NONE;
  }
}

// ---------------------------------------------------------------- item_menu.c

type BagMenuDisplay = {
  exitCB: (() => void) | null; itemOriginalLocation: number; pocketSwitchMode: number; itemMenuIcon: number; inhibitItemDescriptionPrint: boolean;
  contextMenuSelectedItem: number; pocketScrollArrowsTask: number; pocketSwitchArrowsTask: number; nItems: number[]; maxShowed: number[]; data0: number;
};
let sBagMenuDisplay: BagMenuDisplay | null = null;
const disp = (): BagMenuDisplay => sBagMenuDisplay!;
let sBagBgTilemapBuffer: Uint16Array | null = null;
let gMultiuseListMenuTemplate: ListMenuTemplate | null = null;
let sContextMenuItemsPtr: number[] = [];
let sContextMenuNumItems = 0;
let sItemListTilemap: Uint16Array = new Uint16Array(0);

/** Per task data of the bag input task (the C keeps them in gTasks[].data). */
type BagTaskData = { listTaskId: number; itemIndex: number; quantity: number; data3: number; count: { value: number }; data10: number; switchDir: number; switchCounter: number; switchState: number; tutorialFrame: number };
const taskData = new Map<number, BagTaskData>();
const td = (taskId: number): BagTaskData => {
  let d = taskData.get(taskId);
  if (!d) { d = { listTaskId: 0, itemIndex: 0, quantity: 0, data3: 0, count: { value: 0 }, data10: 0, switchDir: 0, switchCounter: 0, switchState: 0, tutorialFrame: 0 }; taskData.set(taskId, d); }
  return d;
};

/** NullBagMenuBufferPtrs (item_menu.c): clear bag-owned allocation references before a fresh GoToBagMenu. */
function NullBagMenuBufferPtrs(): void {
  sBagMenuDisplay = null;
  sBagBgTilemapBuffer = null;
  gMultiuseListMenuTemplate = null;
}

/**
 * GoToBagMenu(location, pocket, bagCallback). Runs under gMain; `bagCallback`
 * is called once the bag has faded out and freed its resources.
 */
export function GoToBagMenu(location: number, pocket: number, bagCallback: (() => void) | null, handlers?: BagHandlers): void {
  NullBagMenuBufferPtrs();
  if (handlers) sHandlers = handlers;
  SetMainCallback2WhenLoaded(Promise.all([
    loadCData("item_menu", "bag", "item_menu_icons", "strings", "text_window_graphics"),
    preloadPacks(["graphics_item_menu", "graphics_interface", "graphics_items", "graphics_text_window", "graphics_fonts"]),
  ]), () => {
    sTextColors = rd<number[][]>("bag", "sTextColors");
    sWindowTemplates = rd<WindowTemplate[]>("bag", "sWindowTemplates");
    sItemMenuContextActions = ACTION_TEXTS.map((name) => ({ text: rom.strings[name] ? text(name) : Uint8Array.of(0xff) }));
    sItemListTilemap = incbin16("sItemListTilemap");
    sBagMenuDisplay = {
      exitCB: null, itemOriginalLocation: 0xff, pocketSwitchMode: 0, itemMenuIcon: 0, inhibitItemDescriptionPrint: false, contextMenuSelectedItem: 0,
      pocketScrollArrowsTask: TASK_NONE, pocketSwitchArrowsTask: TASK_NONE, nItems: [0, 0, 0], maxShowed: [0, 0, 0], data0: 0,
    };
    if (location !== C.ITEMMENULOCATION_LAST) gBagMenuState.location = location;
    if (bagCallback) gBagMenuState.bagCallback = bagCallback;
    if (location === C.ITEMMENULOCATION_ITEMPC) disp().pocketSwitchMode = 1;
    else if (location === C.ITEMMENULOCATION_OLD_MAN) disp().pocketSwitchMode = 2;
    if (pocket === C.OPEN_BAG_ITEMS || pocket === C.OPEN_BAG_KEYITEMS || pocket === C.OPEN_BAG_POKEBALLS) gBagMenuState.pocket = pocket;
    textFlags.autoScroll = false;
    bagResult.itemId = C.ITEM_NONE;
    gMain.state = 0;
    SetMainCallback2(CB2_OpenBagMenu);
  });
}

function CB2_BagMenuRun(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  DoScheduledBgTilemapCopiesToVram();
  UpdatePaletteFade();
}

function VBlankCB_BagMenuRun(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function CB2_OpenBagMenu(): void {
  while (!LoadBagMenuGraphics()) { /* runs every step in one frame, as the source loop does */ }
}

function LoadBagMenuGraphics(): boolean {
  switch (gMain.state) {
    case 0: SetVBlankCallback(null); SetHBlankCallback(null); ClearScheduledBgCopiesToVram(); gMain.state++; break;
    case 1: gMain.state++; break; // ScanlineEffect_Stop
    case 2: FreeAllSpritePalettes(); gMain.state++; break;
    case 3: ResetPaletteFade(); gPaletteFade.bufferTransferDisabled = true; gMain.state++; break;
    case 4: ResetSpriteData(); gMain.state++; break;
    case 5: ResetItemMenuIconState(); gMain.state++; break;
    case 6: tasks.reset(); taskData.clear(); gMain.state++; break;
    case 7: BagMenuInitBgsAndAllocTilemapBuffer(); disp().data0 = 0; gMain.state++; break;
    case 8: if (DoLoadBagGraphics()) gMain.state++; break;
    case 9: InitBagWindows(); gMain.state++; break;
    case 10: All_CalculateNItemsAndMaxShowed(); CalculateInitialCursorPosAndItemsAbove(); UpdatePocketScrollPositions(); gMain.state++; break;
    case 11: gMain.state++; break; // TryAllocListMenuBuffers
    case 12: Bag_BuildListMenuTemplate(gBagMenuState.pocket); gMain.state++; break;
    case 13:
      if (gBagMenuState.location !== C.ITEMMENULOCATION_ITEMPC) PrintBagPocketName();
      else BagDrawDepositItemTextBox();
      gMain.state++;
      break;
    case 14: {
      const taskId = CreateBagInputHandlerTask(gBagMenuState.location);
      td(taskId).listTaskId = ListMenuInit(gMultiuseListMenuTemplate!, gBagMenuState.cursorPos[gBagMenuState.pocket], gBagMenuState.itemsAbove[gBagMenuState.pocket]);
      td(taskId).data3 = 0;
      td(taskId).count.value = 0;
      gMain.state++;
      break;
    }
    case 15: CreateBagSprite(gBagMenuState.pocket); gMain.state++; break;
    case 16: CreatePocketScrollArrowPair(); CreatePocketSwitchArrowPair(); gMain.state++; break;
    case 17: CreateSwapLine(); gMain.state++; break;
    case 18: ShowBagOrBeginWin0OpenTask(); gMain.state++; break;
    case 19: gPaletteFade.bufferTransferDisabled = false; gMain.state++; break;
    default:
      SetVBlankCallback(VBlankCB_BagMenuRun);
      SetMainCallback2(CB2_BagMenuRun);
      return true;
  }
  return false;
}

function BagMenuInitBgsAndAllocTilemapBuffer(): void {
  ResetAllBgsCoordinatesAndBgCntRegs();
  sBagBgTilemapBuffer = new Uint16Array(0x400);
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, rd("item_menu", "sBgTemplates"));
  SetBgTilemapBuffer(1, sBagBgTilemapBuffer);
  ScheduleBgCopyTilemapToVram(1);
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON | 0x2000); // WIN0_ON
  ShowBg(0);
  ShowBg(1);
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
}

function DoLoadBagGraphics(): boolean {
  const d = disp();
  const female = save.playerGender !== C.MALE && !BagIsTutorial();
  switch (d.data0) {
    case 0: { const gfx = incbin("gBagBg_Gfx"); LoadBgTiles(1, gfx, gfx.length, 0); d.data0++; break; }
    case 1: sBagBgTilemapBuffer!.set(incbin16(gBagMenuState.location !== C.ITEMMENULOCATION_ITEMPC ? "gBagBg_Tilemap" : "gBagBg_ItemPC_Tilemap").subarray(0, 0x400)); d.data0++; break;
    case 2:
      LoadPalette(incbin("gBagBgPalette"), BG_PLTT_ID(0), 3 * 32);
      if (female) LoadPalette(incbin("gBagBgPalette_FemaleOverride"), BG_PLTT_ID(0), 32);
      d.data0++;
      break;
    case 3: LoadSpriteSheet({ data: incbin(female ? "gBagFemale_Gfx" : "gBagMale_Gfx"), size: 0x2000, tag: TAG_BAG }); d.data0++; break;
    case 4: LoadSpritePalette({ data: incbin("gBag_Pal"), tag: TAG_BAG }); d.data0++; break;
    case 5: LoadSpriteSheet({ data: incbin("gSwapLine_Gfx"), size: 0x100, tag: TAG_SWAP_LINE }); d.data0++; break;
    default:
      LoadSpritePalette({ data: incbin("gSwapLine_Pal"), tag: TAG_SWAP_LINE });
      d.data0 = 0;
      return true;
  }
  return false;
}

function CreateBagInputHandlerTask(_location: number): number {
  const handler = gBagMenuState.location === C.ITEMMENULOCATION_OLD_MAN ? Task_Bag_OldManTutorial
    : gBagMenuState.location === C.ITEMMENULOCATION_TTVSCR_REGISTER ? Task_Bag_TeachyTvRegister
      : gBagMenuState.location === C.ITEMMENULOCATION_TTVSCR_TMS ? Task_Bag_TeachyTvTMs
      : Task_BagMenu_HandleInput;
  return tasks.create(handler, 0);
}

type BagBackup = {
  items: typeof save.bag.items; keyItems: typeof save.bag.keyItems; pokeBalls: typeof save.bag.pokeBalls;
  registeredItem: number; pocket: number; itemsAbove: number[]; cursorPos: number[];
};

/** item_menu.c BackUpPlayerBag: preserve state, clear physical bag pockets, and reset cursors. */
export function BackUpPlayerBag(): BagBackup {
  const backup: BagBackup = {
    items: save.bag.items.map((slot) => ({ ...slot })), keyItems: save.bag.keyItems.map((slot) => ({ ...slot })),
    pokeBalls: save.bag.pokeBalls.map((slot) => ({ ...slot })), registeredItem: save.registeredItem,
    pocket: gBagMenuState.pocket, itemsAbove: [...gBagMenuState.itemsAbove], cursorPos: [...gBagMenuState.cursorPos],
  };
  save.bag.items = []; save.bag.keyItems = []; save.bag.pokeBalls = [];
  save.registeredItem = C.ITEM_NONE;
  ResetBagCursorPositions();
  return backup;
}

/** item_menu.c RestorePlayerBag */
export function RestorePlayerBag(backup: BagBackup): void {
  save.bag.items = backup.items; save.bag.keyItems = backup.keyItems; save.bag.pokeBalls = backup.pokeBalls;
  save.registeredItem = backup.registeredItem;
  gBagMenuState.pocket = backup.pocket;
  gBagMenuState.itemsAbove = backup.itemsAbove;
  gBagMenuState.cursorPos = backup.cursorPos;
}

/** InitPokedudeBag for the Teachy TV registration lesson (TTVSCR_REGISTER). */
export function InitPokedudeBagRegister(done: () => void): void {
  InitPokedudeBag(C.ITEMMENULOCATION_TTVSCR_REGISTER, done);
}

/** InitPokedudeBag (item_menu.c), for the Teachy TV bag modes connected by this runtime. */
export function InitPokedudeBag(location: number, done: () => void, onSkip?: () => void, onReshow?: () => void): void {
  if (location !== C.ITEMMENULOCATION_TTVSCR_REGISTER && location !== C.ITEMMENULOCATION_TTVSCR_TMS)
    throw new RangeError(`InitPokedudeBag: unsupported active bag lesson ${location}`);
  const backup = BackUpPlayerBag();
  addBagItem(C.ITEM_POTION, 1); addBagItem(C.ITEM_ANTIDOTE, 1); addBagItem(C.ITEM_TEACHY_TV, 1);
  addBagItem(C.ITEM_TM_CASE, 1); addBagItem(C.ITEM_POKE_BALL, 5); addBagItem(C.ITEM_GREAT_BALL, 1); addBagItem(C.ITEM_NEST_BALL, 1);
  if (location === C.ITEMMENULOCATION_TTVSCR_REGISTER) {
    GoToBagMenu(location, C.OPEN_BAG_ITEMS, () => { RestorePlayerBag(backup); done(); });
    return;
  }
  if (location === C.ITEMMENULOCATION_TTVSCR_TMS) {
    GoToBagMenu(location, C.OPEN_BAG_ITEMS, () => {
      RestorePlayerBag(backup);
      Pokedude_InitTMCase(done, onSkip, onReshow ?? CB2_SetUpReshowBattleScreenAfterMenu);
    });
    return;
  }
}

/** InitPokedudeBag for the Teachy TV TM lesson: item_menu.c Task_Bag_TeachyTvTMs. */
export function InitPokedudeBagTMs(done: () => void, onSkip?: () => void, onReshow?: () => void): void {
  InitPokedudeBag(C.ITEMMENULOCATION_TTVSCR_TMS, done, onSkip, onReshow);
}

/** Task_Pokedude_FadeFromBag (item_menu.c). */
function Task_Pokedude_FadeFromBag(taskId: number): void {
  BeginNormalPaletteFade(PALETTES_ALL, -2, 0, 16, RGB_BLACK);
  tasks.setFunc(taskId, Task_Pokedude_WaitFadeAndExitBag);
}

/** Task_Pokedude_WaitFadeAndExitBag (item_menu.c); cleanup includes the Canvas list-menu adapter. */
function Task_Pokedude_WaitFadeAndExitBag(taskId: number): void {
  Task_ItemMenu_WaitFadeAndSwitchToExitCallback(taskId);
}

/** item_menu.c Task_Bag_TeachyTvRegister: scripted registration demonstration. */
function Task_Bag_TeachyTvRegister(taskId: number): void {
  if (gPaletteFade.active) return;
  const data = td(taskId);
  if (joy.newKeys & B_BUTTON) {
    Bag_BeginCloseWin0Animation();
    tasks.setFunc(taskId, Task_Pokedude_FadeFromBag);
    return;
  }
  switch (data.tutorialFrame) {
    case 102:
      sound.playSE(C.SE_BAG_POCKET);
      SwitchPockets(taskId, 1, false);
      break;
    case 204:
      sound.playSE(C.SE_SELECT);
      bag_menu_print_cursor_(data.listTaskId, 2);
      Bag_FillMessageBoxWithPalette(1);
      bagResult.itemId = C.ITEM_TEACHY_TV;
      OpenContextMenu(taskId);
      break;
    case 306:
      sound.playSE(C.SE_SELECT);
      Menu_MoveCursorNoWrapAround(1);
      break;
    case 408: {
      sound.playSE(C.SE_SELECT);
      save.registeredItem = bagResult.itemId;
      HideBagWindow(10); HideBagWindow(6); PutWindowTilemap(0); PutWindowTilemap(1);
      const pos = DestroyListMenuTask(data.listTaskId);
      gBagMenuState.cursorPos[gBagMenuState.pocket] = pos.cursorPos;
      gBagMenuState.itemsAbove[gBagMenuState.pocket] = pos.itemsAbove;
      Bag_BuildListMenuTemplate(gBagMenuState.pocket);
      data.listTaskId = ListMenuInit(gMultiuseListMenuTemplate!, pos.cursorPos, pos.itemsAbove);
      Bag_FillMessageBoxWithPalette(0);
      bag_menu_print_cursor_(data.listTaskId, 1);
      CopyWindowToVram(0, COPYWIN_MAP);
      break;
    }
    case 510:
    case 612: {
      const oldNew = joy.newKeys, oldRepeated = joy.repeated;
      joy.newKeys = 0; joy.repeated = DPAD_DOWN;
      ListMenu_ProcessInput(data.listTaskId);
      joy.newKeys = oldNew; joy.repeated = oldRepeated;
      break;
    }
    case 714:
      sound.playSE(C.SE_SELECT);
      HideBagWindow(10); HideBagWindow(6); PutWindowTilemap(0); PutWindowTilemap(1);
      CopyWindowToVram(0, COPYWIN_MAP);
      Bag_BeginCloseWin0Animation();
      tasks.setFunc(taskId, Task_Pokedude_FadeFromBag);
      return;
  }
  data.tutorialFrame++;
}

/** item_menu.c Task_Bag_TeachyTvTMs: scroll to TM Case and open it after the lesson prompt. */
function Task_Bag_TeachyTvTMs(taskId: number): void {
  if (gPaletteFade.active) return;
  const data = td(taskId);
  if (joy.newKeys & B_BUTTON) {
    Bag_BeginCloseWin0Animation();
    tasks.setFunc(taskId, Task_Pokedude_FadeFromBag);
    return;
  }
  switch (data.tutorialFrame) {
    case 102:
      sound.playSE(C.SE_BAG_POCKET);
      SwitchPockets(taskId, 1, false);
      break;
    case 204: {
      const oldNew = joy.newKeys, oldRepeated = joy.repeated;
      joy.newKeys = 0; joy.repeated = DPAD_DOWN;
      ListMenu_ProcessInput(data.listTaskId);
      joy.newKeys = oldNew; joy.repeated = oldRepeated;
      break;
    }
    case 306:
      sound.playSE(C.SE_SELECT);
      bag_menu_print_cursor_(data.listTaskId, 2);
      Bag_FillMessageBoxWithPalette(1);
      bagResult.itemId = C.ITEM_TM_CASE;
      OpenContextMenu(taskId);
      break;
    case 408:
      sound.playSE(C.SE_SELECT);
      HideBagWindow(10); HideBagWindow(6); PutWindowTilemap(0); PutWindowTilemap(1);
      CopyWindowToVram(0, COPYWIN_MAP);
      Bag_BeginCloseWin0Animation();
      tasks.setFunc(taskId, Task_Pokedude_FadeFromBag);
      return;
  }
  data.tutorialFrame++;
}

/** item_menu.c Task_Bag_OldManTutorial: scripted pocket switches and timed ball prompt. */
function Task_Bag_OldManTutorial(taskId: number): void {
  if (gPaletteFade.active) return;
  const data = td(taskId);
  switch (data.tutorialFrame) {
    case 102:
    case 204:
      sound.playSE(C.SE_BAG_POCKET);
      SwitchPockets(taskId, 1, false);
      break;
    case 306:
      sound.playSE(C.SE_SELECT);
      bag_menu_print_cursor_(data.listTaskId, 2);
      Bag_FillMessageBoxWithPalette(1);
      bagResult.itemId = C.ITEM_POKE_BALL;
      OpenContextMenu(taskId);
      break;
    case 408:
      sound.playSE(C.SE_SELECT);
      HideBagWindow(10);
      HideBagWindow(6);
      PutWindowTilemap(0);
      PutWindowTilemap(1);
      CopyWindowToVram(0, COPYWIN_MAP);
      Bag_BeginCloseWin0Animation();
      tasks.setFunc(taskId, Task_Pokedude_FadeFromBag);
      return;
  }
  data.tutorialFrame++;
}

function Bag_BuildListMenuTemplate(pocket: number): void {
  const d = disp();
  const items: ListMenuItem[] = [];
  const slots = pocketSlots(pocket + 1);
  for (let i = 0; i < d.nItems[pocket]; i++) items.push({ label: BagListMenuGetItemNameColored(slots[i].item), index: i });
  items.push({ label: cat(rd<number[]>("item_menu", "sListItemTextColor_RegularItem"), text("gFameCheckerText_Cancel")), index: items.length });
  gMultiuseListMenuTemplate = listMenuTemplate({
    items, totalItems: d.nItems[pocket] + 1, windowId: 0, header_X: 0, item_X: 9, cursor_X: 1, lettersSpacing: 0, itemVerticalPadding: 2, upText_Y: 2,
    maxShowed: d.maxShowed[pocket], fontId: FONT_NORMAL, cursorPal: 2, fillValue: 0, cursorShadowPal: 3,
    moveCursorFunc: BagListMenuMoveCursorFunc, itemPrintFunc: BagListMenuItemPrintFunc, cursorKind: 0, scrollMultiple: LIST_NO_MULTIPLE_SCROLL,
  });
}

function BagListMenuGetItemNameColored(itemId: number): Uint8Array {
  const color = rd<number[]>("item_menu", itemId === C.ITEM_TM_CASE || itemId === C.ITEM_BERRY_POUCH ? "sListItemTextColor_TmCase_BerryPouch" : "sListItemTextColor_RegularItem");
  return cat(color, CopyItemName(itemId));
}

function BagListMenuMoveCursorFunc(itemIndex: number, onInit: boolean): void {
  const d = disp();
  if (!onInit) {
    sound.playSE(C.SE_BAG_CURSOR);
    ShakeBagSprite();
  }
  if (d.itemOriginalLocation === 0xff) {
    DestroyItemMenuIcon(d.itemMenuIcon ^ 1);
    if (d.nItems[gBagMenuState.pocket] !== itemIndex) CreateItemMenuIcon(BagGetItemIdByPocketPosition(gBagMenuState.pocket + 1, itemIndex), d.itemMenuIcon);
    else CreateItemMenuIcon(C.ITEMS_COUNT, d.itemMenuIcon);
    d.itemMenuIcon ^= 1;
    if (!d.inhibitItemDescriptionPrint) PrintItemDescriptionOnMessageWindow(itemIndex);
  }
}

function BagListMenuItemPrintFunc(windowId: number, itemId: number, y: number): void {
  const d = disp();
  if (d.itemOriginalLocation !== 0xff) {
    if (d.itemOriginalLocation === (itemId & 0xff)) bag_menu_print_cursor(y, 2);
    else bag_menu_print_cursor(y, 0xff);
  }
  if (itemId !== -2 && d.nItems[gBagMenuState.pocket] !== itemId) {
    const bagItemId = BagGetItemIdByPocketPosition(gBagMenuState.pocket + 1, itemId);
    const bagItemQuantity = BagGetQuantityByPocketPosition(gBagMenuState.pocket + 1, itemId);
    if (gBagMenuState.pocket !== C.POCKET_KEY_ITEMS - 1 && ItemId_GetImportance(bagItemId) === 0) {
      stringVars.var1 = intToDecimal(bagItemQuantity, STR_CONV_MODE_RIGHT_ALIGN, 3);
      stringVars.var4 = expandPlaceholders(text("gText_TimesStrVar1"));
      BagPrintTextOnWindow(windowId, FONT_SMALL, stringVars.var4, 0x6e, y, 0, 0, 0xff, 1);
    } else if (save.registeredItem !== C.ITEM_NONE && save.registeredItem === bagItemId) {
      BlitBitmapToWindow(windowId, selectButtonBitmap(), 0x70, y, 0x18, 0x10);
    }
  }
}

let sSelectButtonBitmap: Uint8Array | null = null;
/** sBlit_SelectButton as the 4bpp bitmap BlitBitmapToWindow expects (3x2 tiles). */
function selectButtonBitmap(): Uint8Array {
  return (sSelectButtonBitmap ??= incbin("sBlit_SelectButton"));
}

function bag_menu_print_cursor_(listTaskId: number, colorIdx: number): void {
  bag_menu_print_cursor(ListMenuGetYCoordForPrintingArrowCursor(listTaskId), colorIdx);
}

function bag_menu_print_cursor(y: number, colorIdx: number): void {
  if (colorIdx === 0xff) FillWindowPixelRect(0, PIXEL_FILL(0), 1, y, GetMenuCursorDimensionByFont(FONT_NORMAL, 0), GetMenuCursorDimensionByFont(FONT_NORMAL, 1));
  else BagPrintTextOnWindow(0, FONT_NORMAL, text("gText_SelectorArrow2"), 1, y, 0, 0, 0, colorIdx);
}

function PrintBagPocketName(): void {
  FillWindowPixelBuffer(2, PIXEL_FILL(0));
  BagPrintTextOnWin1CenteredColor0(text(SPOCKET_NAMES[gBagMenuState.pocket]));
}

function PrintItemDescriptionOnMessageWindow(itemIndex: number): void {
  const description = itemIndex !== disp().nItems[gBagMenuState.pocket]
    ? ItemId_GetDescription(BagGetItemIdByPocketPosition(gBagMenuState.pocket + 1, itemIndex))
    : text("gText_CloseBag");
  FillWindowPixelBuffer(1, PIXEL_FILL(0));
  BagPrintTextOnWindow(1, FONT_NORMAL, description, 0, 3, 2, 0, 0, 0);
}

function CreatePocketScrollArrowPair(): void {
  const d = disp();
  const pocket = gBagMenuState.pocket;
  d.pocketScrollArrowsTask = AddScrollIndicatorArrowPairParameterized(SCROLL_ARROW_UP, 160, 8, 104, d.nItems[pocket] - d.maxShowed[pocket] + 1, 110, 110,
    () => gBagMenuState.cursorPos[pocket]);
}

function CreatePocketSwitchArrowPair(): void {
  if (disp().pocketSwitchMode !== 1) {
    disp().pocketSwitchArrowsTask = AddScrollIndicatorArrowPair(rd<ScrollArrowsTemplate>("item_menu", "sPocketSwitchArrowPairTemplate"), () => gBagMenuState.pocket);
  }
}

function CreatePocketScrollArrowPair_SellQuantity(): void {
  const d = disp();
  d.contextMenuSelectedItem = 1;
  d.pocketScrollArrowsTask = AddScrollIndicatorArrowPairParameterized(SCROLL_ARROW_UP, 152, 72, 104, 2, 110, 110, () => d.contextMenuSelectedItem);
}

function CreateArrowPair_QuantitySelect(): void {
  const d = disp();
  d.contextMenuSelectedItem = 1;
  d.pocketScrollArrowsTask = AddScrollIndicatorArrowPairParameterized(SCROLL_ARROW_UP, 212, 120, 152, 2, 110, 110, () => d.contextMenuSelectedItem);
}

function BagDestroyPocketScrollArrowPair(): void {
  const d = disp();
  if (d.pocketScrollArrowsTask !== 0xff) {
    RemoveScrollIndicatorArrowPair(d.pocketScrollArrowsTask);
    d.pocketScrollArrowsTask = 0xff;
  }
  BagDestroyPocketSwitchArrowPair();
}

function BagDestroyPocketSwitchArrowPair(): void {
  const d = disp();
  if (d.pocketSwitchArrowsTask !== 0xff) {
    RemoveScrollIndicatorArrowPair(d.pocketSwitchArrowsTask);
    d.pocketSwitchArrowsTask = 0xff;
  }
}

export function ResetBagCursorPositions(): void {
  gBagMenuState.pocket = C.POCKET_ITEMS - 1;
  gBagMenuState.bagOpen = false;
  gBagMenuState.itemsAbove.fill(0);
  gBagMenuState.cursorPos.fill(0);
}

function PocketCalculateInitialCursorPosAndItemsAbove(pocketId: number): void {
  const d = disp();
  if (gBagMenuState.cursorPos[pocketId] !== 0 && gBagMenuState.cursorPos[pocketId] + d.maxShowed[pocketId] > d.nItems[pocketId] + 1) {
    gBagMenuState.cursorPos[pocketId] = d.nItems[pocketId] + 1 - d.maxShowed[pocketId];
  }
  if (gBagMenuState.cursorPos[pocketId] + gBagMenuState.itemsAbove[pocketId] >= d.nItems[pocketId] + 1) {
    gBagMenuState.itemsAbove[pocketId] = d.nItems[pocketId] + 1 < 2 ? 0 : d.nItems[pocketId];
  }
}

function CalculateInitialCursorPosAndItemsAbove(): void {
  for (let i = 0; i < NUM_BAG_POCKETS_NO_CASES; i++) PocketCalculateInitialCursorPosAndItemsAbove(i);
}

function UpdatePocketScrollPositions(): void {
  const d = disp();
  for (let i = 0; i < NUM_BAG_POCKETS_NO_CASES; i++) {
    if (gBagMenuState.itemsAbove[i] > 3) {
      for (let j = 0; j <= gBagMenuState.itemsAbove[i] - 3; gBagMenuState.itemsAbove[i]--, gBagMenuState.cursorPos[i]++, j++) {
        if (gBagMenuState.cursorPos[i] + d.maxShowed[i] === d.nItems[i] + 1) break;
      }
    }
  }
}

function DestroyBagMenuResources(): void {
  sBagMenuDisplay = null;
  sBagBgTilemapBuffer = null;
  gMultiuseListMenuTemplate = null;
  FreeAllWindowBuffers();
}

function ItemMenu_StartFadeToExitCallback(taskId: number): void {
  BeginNormalPaletteFade(PALETTES_ALL, -2, 0, 16, RGB_BLACK);
  tasks.setFunc(taskId, Task_ItemMenu_WaitFadeAndSwitchToExitCallback);
}

function Task_ItemMenu_WaitFadeAndSwitchToExitCallback(taskId: number): void {
  if (!gPaletteFade.active && !FuncIsActiveTask(Task_AnimateWin0v)) {
    const pos = DestroyListMenuTask(td(taskId).listTaskId);
    gBagMenuState.cursorPos[gBagMenuState.pocket] = pos.cursorPos;
    gBagMenuState.itemsAbove[gBagMenuState.pocket] = pos.itemsAbove;
    const cb = disp().exitCB ?? gBagMenuState.bagCallback;
    BagDestroyPocketScrollArrowPair();
    DestroyBagMenuResources();
    tasks.destroy(taskId);
    taskData.delete(taskId);
    SetVBlankCallback(null);
    SetMainCallback2(null);
    cb?.();
  }
}

function ShowBagOrBeginWin0OpenTask(): void {
  gPlttBufferUnfaded[0] = RGB_BLACK;
  gPlttBufferFaded[0] = RGB_BLACK;
  SetGpuReg(REG_OFFSET_WININ, 0);
  SetGpuReg(REG_OFFSET_WINOUT, WININ_WIN0_BG_ALL | WININ_WIN0_OBJ | WININ_WIN0_CLR);
  BlendPalettes(PALETTES_ALL, 16, RGB_BLACK);
  BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
  if (gBagMenuState.bagOpen) {
    SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, 240));
    SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(0, 0));
  } else {
    SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, 240));
    SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(0, 160));
    const taskId = tasks.create(Task_AnimateWin0v, 0);
    tasks.tasks[taskId].data[0] = 192;
    tasks.tasks[taskId].data[1] = -16;
    gBagMenuState.bagOpen = true;
  }
}

function Bag_BeginCloseWin0Animation(): void {
  const taskId = tasks.create(Task_AnimateWin0v, 0);
  tasks.tasks[taskId].data[0] = -16;
  tasks.tasks[taskId].data[1] = 16;
  gBagMenuState.bagOpen = false;
}

/** CB2_SetUpReshowBattleScreenAfterMenu: the next bag opening animates again. */
export function CB2_SetUpReshowBattleScreenAfterMenu(): void {
  gBagMenuState.bagOpen = false;
}

function Task_AnimateWin0v(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  data[0] = ((data[0] + data[1]) << 16) >> 16;
  // The source writes the raw value when <= 160: a WIN_RANGE(0, n) with top 0.
  SetGpuReg(REG_OFFSET_WIN0V, data[0] > 160 ? WIN_RANGE(0, 160) : data[0] & 0xffff);
  if ((data[1] === 16 && data[0] === 160) || (data[1] === -16 && data[0] === 0)) tasks.destroy(taskId);
}

/** MoveItemSlotInList */
export function MoveItemSlotInList(slots: Array<{ item: number; quantity: number }>, from: number, to: number): void {
  if (from === to) return;
  const first = slots[from];
  if (to > from) {
    to--;
    for (let i = from; i < to; i++) slots[i] = slots[i + 1];
  } else {
    for (let i = from; i > to; i--) slots[i] = slots[i - 1];
  }
  slots[to] = first;
}

function Pocket_CalculateNItemsAndMaxShowed(pocketId: number): void {
  const d = disp();
  const slots = pocketSlots(pocketId + 1);
  BagPocketCompaction(slots);
  const firstEmpty = slots.findIndex((slot) => slot.item === C.ITEM_NONE);
  d.nItems[pocketId] = firstEmpty === -1 ? slots.length : firstEmpty;
  d.maxShowed[pocketId] = d.nItems[pocketId] + 1 > 6 ? 6 : d.nItems[pocketId] + 1;
}

function All_CalculateNItemsAndMaxShowed(): void {
  for (let i = 0; i < NUM_BAG_POCKETS_NO_CASES; i++) Pocket_CalculateNItemsAndMaxShowed(i);
}

/** DisplayItemMessageInBag */
export function DisplayItemMessageInBag(taskId: number, fontId: number, string: ArrayLike<number>, followUpFunc: TaskFunc): void {
  const d = td(taskId);
  d.data10 = OpenBagWindow(5);
  FillWindowPixelBuffer(d.data10, PIXEL_FILL(1));
  DisplayMessageAndContinueTask(taskId, d.data10, 0x06d, 0x0d, fontId, getTextSpeedSetting(), string, followUpFunc);
  ScheduleBgCopyTilemapToVram(0);
}

function ItemMenu_SetExitCallback(cb: () => void): void {
  disp().exitCB = cb;
}

/** GoToTMCase_* / GoToBerryPouch_*: the case screen for a give/sell/PC bag, which returns to this bag. */
function GoToTMCase_Give(done: () => void): void {
  InitTMCase(C.TMCASE_GIVE_PARTY, ReturnToBagMenuFromSubmenu_Give, false, { giveParty: done });
}

function GoToBerryPouch_Give(done: () => void): void {
  InitBerryPouch(C.BERRYPOUCH_FROMPARTYGIVE, ReturnToBagMenuFromSubmenu_Give, 0, { giveParty: done });
}

function ReturnToBagMenuFromSubmenu_Give(): void {
  GoToBagMenu(C.ITEMMENULOCATION_PARTY, C.OPEN_BAG_LAST, null);
}

function GoToTMCase_PCBox(done: () => void): void {
  InitTMCase(C.TMCASE_GIVE_PC, ReturnToBagMenuFromSubmenu_PCBox, false, { givePc: done });
}

function GoToBerryPouch_PCBox(done: () => void): void {
  InitBerryPouch(C.BERRYPOUCH_FROMPOKEMONSTORAGEPC, ReturnToBagMenuFromSubmenu_PCBox, 0, { givePc: done });
}

function ReturnToBagMenuFromSubmenu_PCBox(): void {
  GoToBagMenu(C.ITEMMENULOCATION_PCBOX, C.OPEN_BAG_LAST, null);
}

function GoToTMCase_Sell(): void {
  InitTMCase(C.TMCASE_SELL, ReturnToBagMenuFromSubmenu_Sell, false, {});
}

function GoToBerryPouch_Sell(): void {
  InitBerryPouch(C.BERRYPOUCH_FROMMARTSELL, ReturnToBagMenuFromSubmenu_Sell, 0, {});
}

function ReturnToBagMenuFromSubmenu_Sell(): void {
  GoToBagMenu(C.ITEMMENULOCATION_SHOP, C.OPEN_BAG_LAST, null);
}

function openCaseOrReturn(itemId: number, location: number): () => void {
  return () => {
    if (sHandlers.openCase) { sHandlers.openCase(itemId, location); return; }
    const done = (): void => gBagMenuState.bagCallback?.();
    const give = location === C.ITEMMENULOCATION_PARTY;
    const sell = location === C.ITEMMENULOCATION_SHOP;
    if (itemId === C.ITEM_TM_CASE) {
      if (give) GoToTMCase_Give(done);
      else if (sell) GoToTMCase_Sell();
      else GoToTMCase_PCBox(done);
      return;
    }
    if (itemId === C.ITEM_BERRY_POUCH) {
      if (give) GoToBerryPouch_Give(done);
      else if (sell) GoToBerryPouch_Sell();
      else GoToBerryPouch_PCBox(done);
      return;
    }
    bagResult.itemId = C.ITEM_NONE;
    gBagMenuState.bagCallback?.();
  };
}

function contextFor(taskId: number): BagTaskContext {
  return {
    taskId,
    message: (str, fontId = FONT_NORMAL, followUpFunc = Task_ReturnToBagFromContextMenu) => DisplayItemMessageInBag(taskId, fontId, str, followUpFunc),
    exit: (cb, closeWindow = false) => {
      if (closeWindow) Bag_BeginCloseWin0Animation();
      ItemMenu_SetExitCallback(cb);
      ItemMenu_StartFadeToExitCallback(taskId);
    },
  };
}

function Task_BagMenu_HandleInput(taskId: number): void {
  const data = td(taskId);
  if (gPaletteFade.active) return;
  if (FuncIsActiveTask(Task_AnimateWin0v)) return;
  switch (ProcessPocketSwitchInput(taskId, gBagMenuState.pocket)) {
    case 1: SwitchPockets(taskId, -1, false); return;
    case 2: SwitchPockets(taskId, 1, false); return;
    default:
      if (joy.newKeys & SELECT_BUTTON && gBagMenuState.location === C.ITEMMENULOCATION_FIELD) {
        const { cursorPos, itemsAbove } = ListMenuGetScrollAndRow(data.listTaskId);
        if (cursorPos + itemsAbove !== disp().nItems[gBagMenuState.pocket]) {
          sound.playSE(C.SE_SELECT);
          BeginMovingItemInPocket(taskId, cursorPos + itemsAbove);
          return;
        }
      }
      break;
  }
  const input = ListMenu_ProcessInput(data.listTaskId);
  const pos = ListMenuGetScrollAndRow(data.listTaskId);
  gBagMenuState.cursorPos[gBagMenuState.pocket] = pos.cursorPos;
  gBagMenuState.itemsAbove[gBagMenuState.pocket] = pos.itemsAbove;
  switch (input) {
    case LIST_NOTHING_CHOSEN: return;
    case LIST_CANCEL:
      sound.playSE(C.SE_SELECT);
      bagResult.itemId = C.ITEM_NONE;
      Bag_BeginCloseWin0Animation();
      tasks.setFunc(taskId, ItemMenu_StartFadeToExitCallback);
      break;
    default:
      sound.playSE(C.SE_SELECT);
      if (input === disp().nItems[gBagMenuState.pocket]) {
        bagResult.itemId = C.ITEM_NONE;
        Bag_BeginCloseWin0Animation();
        tasks.setFunc(taskId, ItemMenu_StartFadeToExitCallback);
      } else {
        BagDestroyPocketScrollArrowPair();
        bag_menu_print_cursor_(data.listTaskId, 2);
        data.itemIndex = input;
        data.quantity = BagGetQuantityByPocketPosition(gBagMenuState.pocket + 1, input);
        bagResult.itemId = BagGetItemIdByPocketPosition(gBagMenuState.pocket + 1, input);
        tasks.setFunc(taskId, Task_ItemContextMenuByLocation);
      }
      break;
  }
}

function Task_ItemContextMenuByLocation(taskId: number): void {
  Bag_FillMessageBoxWithPalette(1);
  switch (gBagMenuState.location) {
    case C.ITEMMENULOCATION_FIELD:
    case C.ITEMMENULOCATION_BATTLE: Task_ItemContext_FieldOrBattle(taskId); break;
    case C.ITEMMENULOCATION_PARTY: Task_ItemContext_FieldGive(taskId); break;
    case C.ITEMMENULOCATION_SHOP: Task_ItemContext_Sell(taskId); break;
    case C.ITEMMENULOCATION_ITEMPC: Task_ItemContext_Deposit(taskId); break;
    case C.ITEMMENULOCATION_PCBOX: Task_ItemContext_PcBoxGive(taskId); break;
  }
}

function Task_RedrawArrowsAndReturnToBagMenuSelect(taskId: number): void {
  Bag_FillMessageBoxWithPalette(0);
  CreatePocketScrollArrowPair();
  CreatePocketSwitchArrowPair();
  tasks.setFunc(taskId, Task_BagMenu_HandleInput);
}

function Bag_FillMessageBoxWithPalette(a0: number): void {
  SetBgTilemapPalette(1, 0, 14, 30, 6, a0 + 1);
  ScheduleBgCopyTilemapToVram(1);
}

function ProcessPocketSwitchInput(_taskId: number, pocketId: number): number {
  if (disp().pocketSwitchMode !== 0) return 0;
  const lrState = GetLRKeysPressed();
  if (joy.newKeys & DPAD_LEFT || lrState === MENU_L_PRESSED) {
    if (pocketId === C.POCKET_ITEMS - 1) return 0;
    sound.playSE(C.SE_BAG_POCKET);
    return 1;
  }
  if (joy.newKeys & DPAD_RIGHT || lrState === MENU_R_PRESSED) {
    if (pocketId >= C.POCKET_POKE_BALLS - 1) return 0;
    sound.playSE(C.SE_BAG_POCKET);
    return 2;
  }
  return 0;
}

function SwitchPockets(taskId: number, direction: number, skipCleanup: boolean): void {
  const data = td(taskId);
  data.switchState = 0;
  data.switchCounter = 0;
  data.switchDir = direction;
  if (!skipCleanup) {
    ClearWindowTilemap(0);
    ClearWindowTilemap(1);
    ClearWindowTilemap(2);
    const pos = DestroyListMenuTask(data.listTaskId);
    gBagMenuState.cursorPos[gBagMenuState.pocket] = pos.cursorPos;
    gBagMenuState.itemsAbove[gBagMenuState.pocket] = pos.itemsAbove;
    ScheduleBgCopyTilemapToVram(0);
    DestroyItemMenuIcon(disp().itemMenuIcon ^ 1);
    BagDestroyPocketScrollArrowPair();
  }
  FillBgTilemapBufferRect_Palette0(1, 0x02d, 11, 1, 18, 12);
  ScheduleBgCopyTilemapToVram(1);
  SetBagVisualPocketId(gBagMenuState.pocket + direction);
  SetTaskFuncWithFollowupFunc(taskId, Task_AnimateSwitchPockets, tasks.tasks[taskId].func);
}

function Task_AnimateSwitchPockets(taskId: number): void {
  const data = td(taskId);
  if (!BagIsTutorial()) {
    switch (ProcessPocketSwitchInput(taskId, gBagMenuState.pocket + data.switchDir)) {
      case 1:
        gBagMenuState.pocket += data.switchDir;
        SwitchTaskToFollowupFunc(taskId);
        SwitchPockets(taskId, -1, true);
        return;
      case 2:
        gBagMenuState.pocket += data.switchDir;
        SwitchTaskToFollowupFunc(taskId);
        SwitchPockets(taskId, 1, true);
        return;
    }
  }
  switch (data.switchState) {
    case 0:
      // The item list is revealed from the bottom row up.
      if (data.switchCounter !== SHRT_MAX) {
        data.switchCounter++;
        DrawItemListRow(data.switchCounter);
        if (data.switchCounter === LIST_TILES_HEIGHT) data.switchCounter = SHRT_MAX;
      }
      if (data.switchCounter === SHRT_MAX) data.switchState++;
      break;
    case 1:
      gBagMenuState.pocket += data.switchDir;
      PrintBagPocketName();
      Bag_BuildListMenuTemplate(gBagMenuState.pocket);
      data.listTaskId = ListMenuInit(gMultiuseListMenuTemplate!, gBagMenuState.cursorPos[gBagMenuState.pocket], gBagMenuState.itemsAbove[gBagMenuState.pocket]);
      PutWindowTilemap(1);
      PutWindowTilemap(2);
      ScheduleBgCopyTilemapToVram(0);
      CreatePocketScrollArrowPair();
      CreatePocketSwitchArrowPair();
      SwitchTaskToFollowupFunc(taskId);
      break;
  }
}

function reinitList(taskId: number): void {
  const data = td(taskId);
  Bag_BuildListMenuTemplate(gBagMenuState.pocket);
  data.listTaskId = ListMenuInit(gMultiuseListMenuTemplate!, gBagMenuState.cursorPos[gBagMenuState.pocket], gBagMenuState.itemsAbove[gBagMenuState.pocket]);
}

function destroyList(taskId: number): void {
  const pos = DestroyListMenuTask(td(taskId).listTaskId);
  gBagMenuState.cursorPos[gBagMenuState.pocket] = pos.cursorPos;
  gBagMenuState.itemsAbove[gBagMenuState.pocket] = pos.itemsAbove;
}

function BeginMovingItemInPocket(taskId: number, itemIndex: number): void {
  const data = td(taskId);
  ListMenuSetTemplateField(data.listTaskId, "cursorKind", 1 as never);
  data.itemIndex = itemIndex;
  disp().itemOriginalLocation = itemIndex;
  stringVars.var1 = CopyItemName(BagGetItemIdByPocketPosition(gBagMenuState.pocket + 1, data.itemIndex));
  stringVars.var4 = expandPlaceholders(text("gOtherText_WhereShouldTheStrVar1BePlaced"));
  FillWindowPixelBuffer(1, PIXEL_FILL(0));
  BagPrintTextOnWindow(1, FONT_NORMAL, stringVars.var4, 0, 3, 2, 0, 0, 0);
  UpdateSwapLinePos(0, ListMenuGetYCoordForPrintingArrowCursor(data.listTaskId));
  SetSwapLineInvisibility(false);
  BagDestroyPocketSwitchArrowPair();
  bag_menu_print_cursor_(data.listTaskId, 2);
  tasks.setFunc(taskId, Task_MoveItemInPocket_HandleInput);
}

function Task_MoveItemInPocket_HandleInput(taskId: number): void {
  const data = td(taskId);
  const input = ListMenu_ProcessInput(data.listTaskId);
  const pos = ListMenuGetScrollAndRow(data.listTaskId);
  gBagMenuState.cursorPos[gBagMenuState.pocket] = pos.cursorPos;
  gBagMenuState.itemsAbove[gBagMenuState.pocket] = pos.itemsAbove;
  UpdateSwapLinePos(0, ListMenuGetYCoordForPrintingArrowCursor(data.listTaskId));
  if (joy.newKeys & SELECT_BUTTON) {
    sound.playSE(C.SE_SELECT);
    disp().itemOriginalLocation = 0xff;
    ExecuteMoveItemInPocket(taskId, pos.cursorPos + pos.itemsAbove);
    return;
  }
  switch (input) {
    case LIST_NOTHING_CHOSEN: return;
    case LIST_CANCEL:
      sound.playSE(C.SE_SELECT);
      disp().itemOriginalLocation = 0xff;
      AbortMovingItemInPocket(taskId, pos.cursorPos + pos.itemsAbove);
      break;
    default:
      sound.playSE(C.SE_SELECT);
      disp().itemOriginalLocation = 0xff;
      ExecuteMoveItemInPocket(taskId, input);
      break;
  }
}

function ExecuteMoveItemInPocket(taskId: number, itemIndex: number): void {
  const data = td(taskId);
  if (data.itemIndex === itemIndex || data.itemIndex === itemIndex - 1) {
    AbortMovingItemInPocket(taskId, itemIndex);
    return;
  }
  MoveItemSlotInList(pocketSlots(gBagMenuState.pocket + 1), data.itemIndex, itemIndex);
  destroyList(taskId);
  if (data.itemIndex < itemIndex) gBagMenuState.itemsAbove[gBagMenuState.pocket]--;
  reinitList(taskId);
  SetSwapLineInvisibility(true);
  CreatePocketSwitchArrowPair();
  tasks.setFunc(taskId, Task_BagMenu_HandleInput);
}

function AbortMovingItemInPocket(taskId: number, itemIndex: number): void {
  const data = td(taskId);
  destroyList(taskId);
  if (data.itemIndex < itemIndex) gBagMenuState.itemsAbove[gBagMenuState.pocket]--;
  reinitList(taskId);
  SetSwapLineInvisibility(true);
  CreatePocketSwitchArrowPair();
  tasks.setFunc(taskId, Task_BagMenu_HandleInput);
}

function InitQuantityToTossOrDeposit(cursorPos: number, str: ArrayLike<number>): void {
  const r5 = ShowBagWindow(6, 2);
  stringVars.var1 = CopyItemName(BagGetItemIdByPocketPosition(gBagMenuState.pocket + 1, cursorPos));
  stringVars.var4 = expandPlaceholders(str);
  BagPrintTextOnWindow(r5, FONT_NORMAL, stringVars.var4, 0, 2, 1, 0, 0, 1);
  const r4 = ShowBagWindow(0, 0);
  stringVars.var1 = intToDecimal(1, STR_CONV_MODE_LEADING_ZEROS, 3);
  stringVars.var4 = expandPlaceholders(text("gText_TimesStrVar1"));
  BagPrintTextOnWindow(r4, FONT_SMALL, stringVars.var4, 4, 10, 1, 0, 0, 1);
  CreateArrowPair_QuantitySelect();
}

function UpdateQuantityToTossOrDeposit(value: number, ndigits: number): void {
  const r6 = GetBagWindow(0);
  FillWindowPixelBuffer(r6, PIXEL_FILL(1));
  stringVars.var1 = intToDecimal(value, STR_CONV_MODE_LEADING_ZEROS, ndigits);
  stringVars.var4 = expandPlaceholders(text("gText_TimesStrVar1"));
  BagPrintTextOnWindow(r6, FONT_SMALL, stringVars.var4, 4, 10, 1, 0, 0, 1);
}

/** DrawItemListRow: row 0 is the bottom row of the list, up to LIST_TILES_HEIGHT at the top. */
function DrawItemListRow(row: number): void {
  CopyToBgTilemapBufferRect(1, sItemListTilemap.subarray((LIST_TILES_HEIGHT - row) * LIST_TILES_WIDTH), 11, 1 + LIST_TILES_HEIGHT - row, LIST_TILES_WIDTH, 1);
  ScheduleBgCopyTilemapToVram(1);
}

function OpenContextMenu(_taskId: number): void {
  const item = bagResult.itemId;
  switch (gBagMenuState.location) {
    case C.ITEMMENULOCATION_BATTLE:
    case C.ITEMMENULOCATION_TTVSCR_STATUS:
      if (item === C.ITEM_BERRY_POUCH) { sContextMenuItemsPtr = [ITEMMENUACTION_OPEN_BERRIES, ITEMMENUACTION_CANCEL]; sContextMenuNumItems = 2; }
      else if (ItemId_GetBattleUsage(item)) { sContextMenuItemsPtr = sContextMenuItems_BattleUse; sContextMenuNumItems = 2; }
      else { sContextMenuItemsPtr = sContextMenuItems_Cancel; sContextMenuNumItems = 1; }
      break;
    case C.ITEMMENULOCATION_OLD_MAN:
    case C.ITEMMENULOCATION_TTVSCR_CATCHING:
      sContextMenuItemsPtr = sContextMenuItems_BattleUse;
      sContextMenuNumItems = 2;
      break;
    default:
      switch (gBagMenuState.pocket) {
        case C.OPEN_BAG_ITEMS:
          sContextMenuNumItems = 4;
          sContextMenuItemsPtr = ItemIsMail(item) ? sContextMenuItems_CheckGiveTossCancel : sContextMenuItems_Field[gBagMenuState.pocket];
          break;
        case C.OPEN_BAG_KEYITEMS: {
          const buffer = [0, 0, ITEMMENUACTION_CANCEL];
          buffer[1] = save.registeredItem === item ? ITEMMENUACTION_DESELECT : ITEMMENUACTION_REGISTER;
          if (item === C.ITEM_TM_CASE || item === C.ITEM_BERRY_POUCH) buffer[0] = ITEMMENUACTION_OPEN;
          else if (item === C.ITEM_BICYCLE && sHandlers.isOnBike?.()) buffer[0] = ITEMMENUACTION_WALK;
          else buffer[0] = ITEMMENUACTION_USE;
          sContextMenuItemsPtr = buffer;
          sContextMenuNumItems = 3;
          break;
        }
        case C.OPEN_BAG_POKEBALLS:
          sContextMenuItemsPtr = sContextMenuItems_Field[gBagMenuState.pocket];
          sContextMenuNumItems = 3;
          break;
      }
  }
  const r6 = ShowBagWindow(10, sContextMenuNumItems - 1);
  AddItemMenuActionTextPrinters(r6, FONT_NORMAL, GetMenuCursorDimensionByFont(FONT_NORMAL, 0), 2, GetFontAttribute(FONT_NORMAL, FONTATTR_LETTER_SPACING),
    GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT) + 2, sContextMenuNumItems, sItemMenuContextActions, sContextMenuItemsPtr);
  Menu_InitCursor(r6, FONT_NORMAL, 0, 2, GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT) + 2, sContextMenuNumItems, 0);
  const r4 = ShowBagWindow(6, 0);
  stringVars.var1 = CopyItemName(item);
  stringVars.var4 = expandPlaceholders(text("gText_Var1IsSelected"));
  BagPrintTextOnWindow(r4, FONT_NORMAL, stringVars.var4, 0, 2, 1, 0, 0, 1);
}

function Task_ItemContext_FieldOrBattle(taskId: number): void {
  OpenContextMenu(taskId);
  tasks.setFunc(taskId, Task_FieldItemContextMenuHandleInput);
}

function runAction(action: number, taskId: number): void {
  switch (action) {
    case ITEMMENUACTION_USE: case ITEMMENUACTION_CHECK: case ITEMMENUACTION_OPEN: case ITEMMENUACTION_WALK: Task_ItemMenuAction_Use(taskId); break;
    case ITEMMENUACTION_TOSS: Task_ItemMenuAction_Toss(taskId); break;
    case ITEMMENUACTION_REGISTER: case ITEMMENUACTION_DESELECT: Task_ItemMenuAction_ToggleSelect(taskId); break;
    case ITEMMENUACTION_GIVE: Task_ItemMenuAction_Give(taskId); break;
    case ITEMMENUACTION_CANCEL: Task_ItemMenuAction_Cancel(taskId); break;
    case ITEMMENUACTION_BATTLE_USE: case ITEMMENUACTION_OPEN_BERRIES: Task_ItemMenuAction_BattleUse(taskId); break;
  }
}

function Task_FieldItemContextMenuHandleInput(taskId: number): void {
  const input = Menu_ProcessInputNoWrapAround();
  switch (input) {
    case MENU_B_PRESSED: sound.playSE(C.SE_SELECT); runAction(ITEMMENUACTION_CANCEL, taskId); break;
    case MENU_NOTHING_CHOSEN: break;
    default: sound.playSE(C.SE_SELECT); runAction(sContextMenuItemsPtr[input], taskId); break;
  }
}

function hideContextWindows(): void {
  HideBagWindow(10);
  HideBagWindow(6);
  PutWindowTilemap(0);
  PutWindowTilemap(1);
}

function Task_ItemMenuAction_Use(taskId: number): void {
  const item = bagResult.itemId;
  if (!sHandlers.fieldUse || ItemId_GetFieldFunc(item) === "NULL") return;
  hideContextWindows();
  ScheduleBgCopyTilemapToVram(0);
  if (save.party.length === 0 && ItemId_GetType(item) === C.ITEM_TYPE_PARTY_MENU) Task_PrintThereIsNoPokemon(taskId);
  else sHandlers.fieldUse(item, contextFor(taskId));
}

function Task_ItemMenuAction_Toss(taskId: number): void {
  const data = td(taskId);
  ClearWindowTilemap(GetBagWindow(10));
  ClearWindowTilemap(GetBagWindow(6));
  HideBagWindow(10);
  HideBagWindow(6);
  PutWindowTilemap(0);
  data.count.value = 1;
  if (data.quantity === 1) {
    Task_ConfirmTossItems(taskId);
  } else {
    InitQuantityToTossOrDeposit(data.itemIndex, text("gText_TossOutHowManyStrVar1s"));
    tasks.setFunc(taskId, Task_SelectQuantityToToss);
  }
}

const sYesNoMenu_Toss: YesNoFuncTable = { yesFunc: (t) => Task_TossItem_Yes(t), noFunc: (t) => Task_TossItem_No(t) };
const sYesNoMenu_Sell: YesNoFuncTable = { yesFunc: (t) => Task_SellItem_Yes(t), noFunc: (t) => Task_SellItem_No(t) };

function Task_ConfirmTossItems(taskId: number): void {
  stringVars.var2 = intToDecimal(td(taskId).count.value, STR_CONV_MODE_LEFT_ALIGN, 3);
  stringVars.var4 = expandPlaceholders(text("gText_ThrowAwayStrVar2OfThisItemQM"));
  BagPrintTextOnWindow(ShowBagWindow(6, 1), FONT_NORMAL, stringVars.var4, 0, 2, 1, 0, 0, 1);
  BagCreateYesNoMenuBottomRight(taskId, sYesNoMenu_Toss);
}

function Task_TossItem_No(taskId: number): void {
  HideBagWindow(6);
  PutWindowTilemap(1);
  ScheduleBgCopyTilemapToVram(0);
  bag_menu_print_cursor_(td(taskId).listTaskId, 1);
  Task_RedrawArrowsAndReturnToBagMenuSelect(taskId);
}

function Task_SelectQuantityToToss(taskId: number): void {
  const data = td(taskId);
  if (AdjustQuantityAccordingToDPadInput(data.count, data.quantity)) {
    UpdateQuantityToTossOrDeposit(data.count.value, 3);
  } else if (joy.newKeys & A_BUTTON) {
    sound.playSE(C.SE_SELECT);
    ClearWindowTilemap(GetBagWindow(6));
    HideBagWindow(6);
    HideBagWindow(0);
    ScheduleBgCopyTilemapToVram(0);
    BagDestroyPocketScrollArrowPair();
    Task_ConfirmTossItems(taskId);
  } else if (joy.newKeys & B_BUTTON) {
    sound.playSE(C.SE_SELECT);
    HideBagWindow(6);
    HideBagWindow(0);
    PutWindowTilemap(0);
    PutWindowTilemap(1);
    ScheduleBgCopyTilemapToVram(0);
    bag_menu_print_cursor_(data.listTaskId, 1);
    BagDestroyPocketScrollArrowPair();
    Task_RedrawArrowsAndReturnToBagMenuSelect(taskId);
  }
}

function Task_TossItem_Yes(taskId: number): void {
  const data = td(taskId);
  HideBagWindow(6);
  stringVars.var1 = CopyItemName(BagGetItemIdByPocketPosition(gBagMenuState.pocket + 1, data.itemIndex));
  stringVars.var2 = intToDecimal(data.count.value, STR_CONV_MODE_LEFT_ALIGN, 3);
  stringVars.var4 = expandPlaceholders(text("gText_ThrewAwayStrVar2StrVar1s"));
  BagPrintTextOnWindow(ShowBagWindow(6, 3), FONT_NORMAL, stringVars.var4, 0, 2, 1, 0, 0, 1);
  tasks.setFunc(taskId, Task_WaitAB_RedrawAndReturnToBag);
}

function Task_WaitAB_RedrawAndReturnToBag(taskId: number): void {
  const data = td(taskId);
  if (joy.newKeys & (A_BUTTON | B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    removeBagItem(bagResult.itemId, data.count.value);
    HideBagWindow(6);
    destroyList(taskId);
    Pocket_CalculateNItemsAndMaxShowed(gBagMenuState.pocket);
    PocketCalculateInitialCursorPosAndItemsAbove(gBagMenuState.pocket);
    reinitList(taskId);
    PutWindowTilemap(1);
    ScheduleBgCopyTilemapToVram(0);
    bag_menu_print_cursor_(data.listTaskId, 1);
    Task_RedrawArrowsAndReturnToBagMenuSelect(taskId);
  }
}

function Task_ItemMenuAction_ToggleSelect(taskId: number): void {
  const itemId = BagGetItemIdByPocketPosition(gBagMenuState.pocket + 1, td(taskId).itemIndex);
  save.registeredItem = save.registeredItem === itemId ? C.ITEM_NONE : itemId;
  destroyList(taskId);
  reinitList(taskId);
  CopyWindowToVram(0, COPYWIN_MAP);
  Task_ItemMenuAction_Cancel(taskId);
}

function Task_ItemMenuAction_Give(taskId: number): void {
  const itemId = BagGetItemIdByPocketPosition(gBagMenuState.pocket + 1, td(taskId).itemIndex);
  hideContextWindows();
  CopyWindowToVram(0, COPYWIN_MAP);
  if (!IsWritingMailAllowed(itemId)) {
    DisplayItemMessageInBag(taskId, FONT_NORMAL, text("gText_CantWriteMailHere"), Task_WaitAButtonAndCloseContextMenu);
  } else if (ItemId_GetImportance(itemId) === 0) {
    if (save.party.length === 0) Task_PrintThereIsNoPokemon(taskId);
    else {
      disp().exitCB = () => sHandlers.giveToMon?.(itemId);
      tasks.setFunc(taskId, ItemMenu_StartFadeToExitCallback);
    }
  } else {
    Task_PrintItemCantBeHeld(taskId);
  }
}

function Task_PrintThereIsNoPokemon(taskId: number): void {
  DisplayItemMessageInBag(taskId, FONT_NORMAL, text("gText_ThereIsNoPokemon"), Task_WaitAButtonAndCloseContextMenu);
}

function Task_PrintItemCantBeHeld(taskId: number): void {
  stringVars.var1 = CopyItemName(bagResult.itemId);
  stringVars.var4 = expandPlaceholders(text("gText_ItemCantBeHeld"));
  DisplayItemMessageInBag(taskId, FONT_NORMAL, stringVars.var4, Task_WaitAButtonAndCloseContextMenu);
}

function Task_WaitAButtonAndCloseContextMenu(taskId: number): void {
  if (joy.newKeys & A_BUTTON) {
    sound.playSE(C.SE_SELECT);
    Task_ReturnToBagFromContextMenu(taskId);
  }
}

/** Task_ReturnToBagFromContextMenu */
export function Task_ReturnToBagFromContextMenu(taskId: number): void {
  CloseBagWindow(5);
  destroyList(taskId);
  Pocket_CalculateNItemsAndMaxShowed(gBagMenuState.pocket);
  PocketCalculateInitialCursorPosAndItemsAbove(gBagMenuState.pocket);
  reinitList(taskId);
  ScheduleBgCopyTilemapToVram(0);
  bag_menu_print_cursor_(td(taskId).listTaskId, 1);
  Task_RedrawArrowsAndReturnToBagMenuSelect(taskId);
}

function Task_ItemMenuAction_Cancel(taskId: number): void {
  hideContextWindows();
  ScheduleBgCopyTilemapToVram(0);
  bag_menu_print_cursor_(td(taskId).listTaskId, 1);
  Task_RedrawArrowsAndReturnToBagMenuSelect(taskId);
}

function Task_ItemMenuAction_BattleUse(taskId: number): void {
  if (!sHandlers.battleUse) return;
  hideContextWindows();
  CopyWindowToVram(0, COPYWIN_MAP);
  sHandlers.battleUse(bagResult.itemId, contextFor(taskId));
}

function Task_ItemContext_FieldGive(taskId: number): void {
  const itemId = BagGetItemIdByPocketPosition(gBagMenuState.pocket + 1, td(taskId).itemIndex);
  if (!IsWritingMailAllowed(itemId)) {
    DisplayItemMessageInBag(taskId, FONT_NORMAL, text("gText_CantWriteMailHere"), Task_WaitAButtonAndCloseContextMenu);
  } else if (itemId === C.ITEM_TM_CASE || itemId === C.ITEM_BERRY_POUCH) {
    ItemMenu_SetExitCallback(openCaseOrReturn(itemId, C.ITEMMENULOCATION_PARTY));
    ItemMenu_StartFadeToExitCallback(taskId);
  } else if (gBagMenuState.pocket !== C.POCKET_KEY_ITEMS - 1 && ItemId_GetImportance(itemId) === 0) {
    Bag_BeginCloseWin0Animation();
    tasks.setFunc(taskId, ItemMenu_StartFadeToExitCallback);
  } else {
    Task_PrintItemCantBeHeld(taskId);
  }
}

function Task_ItemContext_PcBoxGive(taskId: number): void {
  const itemId = BagGetItemIdByPocketPosition(gBagMenuState.pocket + 1, td(taskId).itemIndex);
  if (ItemIsMail(itemId)) {
    DisplayItemMessageInBag(taskId, FONT_NORMAL, text("gText_CantWriteMailHere"), Task_WaitAButtonAndCloseContextMenu);
  } else if (itemId === C.ITEM_TM_CASE || itemId === C.ITEM_BERRY_POUCH) {
    ItemMenu_SetExitCallback(openCaseOrReturn(itemId, C.ITEMMENULOCATION_PCBOX));
    ItemMenu_StartFadeToExitCallback(taskId);
  } else if (gBagMenuState.pocket !== C.POCKET_KEY_ITEMS - 1 && ItemId_GetImportance(itemId) === 0) {
    Bag_BeginCloseWin0Animation();
    tasks.setFunc(taskId, ItemMenu_StartFadeToExitCallback);
  } else {
    Task_PrintItemCantBeHeld(taskId);
  }
}

function Task_ItemContext_Sell(taskId: number): void {
  const data = td(taskId);
  const item = bagResult.itemId;
  if (item === C.ITEM_TM_CASE || item === C.ITEM_BERRY_POUCH) {
    ItemMenu_SetExitCallback(openCaseOrReturn(item, C.ITEMMENULOCATION_SHOP));
    ItemMenu_StartFadeToExitCallback(taskId);
  } else if (ItemId_GetPrice(item) === 0) {
    stringVars.var1 = CopyItemName(item);
    stringVars.var4 = expandPlaceholders(text("gText_OhNoICantBuyThat"));
    DisplayItemMessageInBag(taskId, GetDialogBoxFontId(), stringVars.var4, Task_ReturnToBagFromContextMenu);
  } else {
    data.count.value = 1;
    if (data.quantity === 1) {
      BagPrintMoneyAmount();
      Task_PrintSaleConfirmationText(taskId);
    } else {
      if (data.quantity > 99) data.quantity = 99;
      stringVars.var1 = CopyItemName(item);
      stringVars.var4 = expandPlaceholders(text("gText_HowManyWouldYouLikeToSell"));
      DisplayItemMessageInBag(taskId, GetDialogBoxFontId(), stringVars.var4, Task_InitSaleQuantitySelectInterface);
    }
  }
}

const salePrice = (taskId: number): number =>
  Math.floor(ItemId_GetPrice(BagGetItemIdByPocketPosition(gBagMenuState.pocket + 1, td(taskId).itemIndex)) / 2) * td(taskId).count.value;

function Task_PrintSaleConfirmationText(taskId: number): void {
  stringVars.var3 = intToDecimal(salePrice(taskId), STR_CONV_MODE_LEFT_ALIGN, 6);
  stringVars.var4 = expandPlaceholders(text("gText_ICanPayThisMuch_WouldThatBeOkay"));
  DisplayItemMessageInBag(taskId, GetDialogBoxFontId(), stringVars.var4, Task_ShowSellYesNoMenu);
}

function Task_ShowSellYesNoMenu(taskId: number): void {
  BagCreateYesNoMenuTopRight(taskId, sYesNoMenu_Sell);
}

function Task_SellItem_No(taskId: number): void {
  HideBagWindow(2);
  CloseBagWindow(5);
  PutWindowTilemap(2);
  PutWindowTilemap(0);
  PutWindowTilemap(1);
  ScheduleBgCopyTilemapToVram(0);
  bag_menu_print_cursor_(td(taskId).listTaskId, 1);
  Task_RedrawArrowsAndReturnToBagMenuSelect(taskId);
}

function Task_InitSaleQuantitySelectInterface(taskId: number): void {
  const r4 = ShowBagWindow(0, 1);
  stringVars.var1 = intToDecimal(1, STR_CONV_MODE_LEADING_ZEROS, 2);
  stringVars.var4 = expandPlaceholders(text("gText_TimesStrVar1"));
  BagPrintTextOnWindow(r4, FONT_SMALL, stringVars.var4, 4, 10, 1, 0, 0xff, 1);
  UpdateSalePriceDisplay(salePrice(taskId));
  BagPrintMoneyAmount();
  CreatePocketScrollArrowPair_SellQuantity();
  tasks.setFunc(taskId, Task_SelectQuantityToSell);
}

function UpdateSalePriceDisplay(amount: number): void {
  PrintMoneyAmount(GetBagWindow(0), 56, 10, amount, 0);
}

function Task_SelectQuantityToSell(taskId: number): void {
  const data = td(taskId);
  if (AdjustQuantityAccordingToDPadInput(data.count, data.quantity)) {
    UpdateQuantityToTossOrDeposit(data.count.value, 2);
    UpdateSalePriceDisplay(salePrice(taskId));
  } else if (joy.newKeys & A_BUTTON) {
    sound.playSE(C.SE_SELECT);
    HideBagWindow(0);
    PutWindowTilemap(0);
    ScheduleBgCopyTilemapToVram(0);
    BagDestroyPocketScrollArrowPair();
    Task_PrintSaleConfirmationText(taskId);
  } else if (joy.newKeys & B_BUTTON) {
    sound.playSE(C.SE_SELECT);
    HideBagWindow(0);
    HideBagWindow(2);
    CloseBagWindow(5);
    PutWindowTilemap(2);
    PutWindowTilemap(0);
    PutWindowTilemap(1);
    ScheduleBgCopyTilemapToVram(0);
    BagDestroyPocketScrollArrowPair();
    bag_menu_print_cursor_(data.listTaskId, 1);
    Task_RedrawArrowsAndReturnToBagMenuSelect(taskId);
  }
}

function Task_SellItem_Yes(taskId: number): void {
  PutWindowTilemap(0);
  ScheduleBgCopyTilemapToVram(0);
  stringVars.var1 = CopyItemName(bagResult.itemId);
  stringVars.var3 = intToDecimal(salePrice(taskId), STR_CONV_MODE_LEFT_ALIGN, 6);
  stringVars.var4 = expandPlaceholders(text("gText_TurnedOverItemsWorthYen"));
  DisplayItemMessageInBag(taskId, FONT_NORMAL, stringVars.var4, Task_FinalizeSaleToShop);
}

function Task_FinalizeSaleToShop(taskId: number): void {
  const data = td(taskId);
  sound.playSE(C.SE_SHOP);
  removeBagItem(bagResult.itemId, data.count.value);
  addMoney(Math.floor(ItemId_GetPrice(bagResult.itemId) / 2) * data.count.value);
  destroyList(taskId);
  Pocket_CalculateNItemsAndMaxShowed(gBagMenuState.pocket);
  PocketCalculateInitialCursorPosAndItemsAbove(gBagMenuState.pocket);
  disp().inhibitItemDescriptionPrint = true;
  reinitList(taskId);
  bag_menu_print_cursor_(data.listTaskId, 2);
  BagDrawTextBoxOnWindow(GetBagWindow(2));
  PrintMoneyAmountInMoneyBox(GetBagWindow(2), save.money, 0);
  tasks.setFunc(taskId, Task_WaitPressAB_AfterSell);
}

function Task_WaitPressAB_AfterSell(taskId: number): void {
  if (joy.newKeys & (A_BUTTON | B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    HideBagWindow(2);
    PutWindowTilemap(2);
    disp().inhibitItemDescriptionPrint = false;
    Task_ReturnToBagFromContextMenu(taskId);
  }
}

function Task_ItemContext_Deposit(taskId: number): void {
  const data = td(taskId);
  data.count.value = 1;
  if (data.quantity === 1) {
    Task_TryDoItemDeposit(taskId);
  } else {
    InitQuantityToTossOrDeposit(data.itemIndex, text("gText_DepositHowManyStrVars1"));
    tasks.setFunc(taskId, Task_SelectQuantityToDeposit);
  }
}

function Task_SelectQuantityToDeposit(taskId: number): void {
  const data = td(taskId);
  if (AdjustQuantityAccordingToDPadInput(data.count, data.quantity)) {
    UpdateQuantityToTossOrDeposit(data.count.value, 3);
  } else if (joy.newKeys & A_BUTTON) {
    sound.playSE(C.SE_SELECT);
    ClearWindowTilemap(GetBagWindow(6));
    HideBagWindow(6);
    HideBagWindow(0);
    ScheduleBgCopyTilemapToVram(0);
    BagDestroyPocketScrollArrowPair();
    Task_TryDoItemDeposit(taskId);
  } else if (joy.newKeys & B_BUTTON) {
    sound.playSE(C.SE_SELECT);
    HideBagWindow(6);
    HideBagWindow(0);
    PutWindowTilemap(1);
    ScheduleBgCopyTilemapToVram(0);
    bag_menu_print_cursor_(data.listTaskId, 1);
    BagDestroyPocketScrollArrowPair();
    Task_RedrawArrowsAndReturnToBagMenuSelect(taskId);
  }
}

function Task_TryDoItemDeposit(taskId: number): void {
  const data = td(taskId);
  if (addPCItem(bagResult.itemId, data.count.value)) {
    stringVars.var1 = CopyItemName(bagResult.itemId);
    stringVars.var2 = intToDecimal(data.count.value, STR_CONV_MODE_LEFT_ALIGN, 3);
    stringVars.var4 = expandPlaceholders(text("gText_DepositedStrVar2StrVar1s"));
    BagPrintTextOnWindow(ShowBagWindow(6, 3), FONT_NORMAL, stringVars.var4, 0, 2, 1, 0, 0, 1);
    tasks.setFunc(taskId, Task_WaitAB_RedrawAndReturnToBag);
  } else {
    DisplayItemMessageInBag(taskId, FONT_NORMAL, text("gText_NoRoomToStoreItems"), Task_WaitAButtonAndCloseContextMenu);
  }
}

function BagIsTutorial(): boolean {
  const l = gBagMenuState.location;
  return l === C.ITEMMENULOCATION_OLD_MAN || l === C.ITEMMENULOCATION_TTVSCR_CATCHING || l === C.ITEMMENULOCATION_TTVSCR_STATUS
    || l === C.ITEMMENULOCATION_TTVSCR_REGISTER || l === C.ITEMMENULOCATION_TTVSCR_TMS;
}
