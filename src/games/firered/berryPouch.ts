// berry_pouch.c: the BERRY POUCH on the hardware layer (berry list with the
// wobbling pouch sprite and item icons, USE/GIVE/TOSS context menu, and the
// party-give, PC-give and sell flows). Item effects and the party screens are
// supplied through BerryPouchHandlers, like the bag's handlers.

import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { expandPlaceholders, intToDecimal, stringVars, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "./gba/charmap";
import { FONT_NORMAL, FONT_NORMAL_COPY_1, FONT_SMALL, GetStringWidth } from "./gba/font";
import { joy, A_BUTTON, B_BUTTON, SELECT_BUTTON } from "./gba/input";
import { tasks, type TaskFunc } from "./gba/tasks";
import { getTextSpeedSetting, textFlags } from "./gba/textPrinter";
import { incbin, incbin16, loadCData, preloadPacks } from "./hw/assets";
import { InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg } from "./hw/bg";
import { SetGpuReg } from "./hw/gpu";
import {
  AddScrollIndicatorArrowPairParameterized, DestroyListMenuTask, LIST_NO_MULTIPLE_SCROLL, ListMenu_ProcessInput, ListMenuGetScrollAndRow,
  ListMenuGetYCoordForPrintingArrowCursor, ListMenuInit, listMenuTemplate, RemoveScrollIndicatorArrowPair, type ListMenuItem, type ListMenuTemplate,
} from "./hw/listMenu";
import {
  ClearDialogWindowAndFrameToTransparent, ClearStdWindowAndFrameToTransparent, DrawStdFrameWithCustomTileAndPalette, FONTATTR_LETTER_SPACING,
  FONTATTR_MAX_LETTER_HEIGHT, GetFontAttribute, GetMenuCursorDimensionByFont, LoadMenuMessageWindowGfx, LoadStdWindowGfx, LoadUserWindowGfx,
  MENU_B_PRESSED, MENU_NOTHING_CHOSEN, Menu_InitCursor, Menu_ProcessInputNoWrapAround,
} from "./hw/menu";
import {
  AddItemMenuActionTextPrinters, AdjustQuantityAccordingToDPadInput, ClearScheduledBgCopiesToVram, CopyItemName, CreateYesNoMenuWithCallbacks,
  DisplayMessageAndContinueTask, DoScheduledBgTilemapCopiesToVram, GetDialogBoxFontId, PrintMoneyAmount, PrintMoneyAmountInMoneyBox,
  PrintMoneyAmountInMoneyBoxWithBorder, ResetAllBgsCoordinatesAndBgCntRegs, ScheduleBgCopyTilemapToVram, SetBgTilemapPalette, type MenuAction,
  type YesNoFuncTable,
} from "./hw/menuHelpers";
import { BeginNormalPaletteFade, BG_PLTT_ID, BlendPalettes, gPaletteFade, LoadPalette, PALETTES_ALL, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade } from "./hw/palette";
import { DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, REG_OFFSET_BLDCNT, REG_OFFSET_DISPCNT } from "./hw/ppu";
import { gMain, SetHBlankCallback, SetMainCallback2, SetVBlankCallback, SetMainCallback2WhenLoaded } from "./hw/runtime";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, FreeAllSpritePalettes, gSprites, LoadOam, LoadSpritePalette, LoadSpriteSheet, oamData,
  ProcessSpriteCopyRequests, ResetSpriteData, SpriteCallbackDummy, StartSpriteAffineAnim, ANIMCMD_END, ANIMCMD_FRAME, AFFINEANIMCMD_END,
  AFFINEANIMCMD_FRAME, type Sprite, type SpriteTemplate,
} from "./hw/sprite";
import { AddTextPrinterParameterized4, DeactivateAllTextPrinters } from "./hw/text";
import {
  AddWindow, ClearWindowTilemap, COPYWIN_GFX, CopyWindowToVram, FillWindowPixelBuffer, FillWindowPixelRect, FreeAllWindowBuffers, InitWindows, PIXEL_FILL,
  PutWindowTilemap, RemoveWindow, type WindowTemplate,
} from "./hw/window";
import { bagResult, CreateBerryPouchItemIcon, DestroyItemMenuIcon, ResetItemMenuIconState, type BagTaskContext } from "./bagMenu";
import { ItemIdToBerryType } from "./pokemon/berry";
import { addMoney, itemInfo, pocketList, removeBagItem } from "./pokemon/items";
import { b64, rom } from "./rom";
import { save } from "./save";

export type BerryPouchHandlers = {
  fieldUse?(itemId: number, ctx: BagTaskContext): void;
  battleUse?(itemId: number, ctx: BagTaskContext): void;
  /** CB2_ChooseMonToGiveItem */
  giveToMon?(itemId: number): void;
  /** CB2_GiveHoldItem (BERRYPOUCH_FROMPARTYGIVE) */
  giveParty?(itemId: number): void;
  /** CB2_ReturnToPokeStorage (BERRYPOUCH_FROMPOKEMONSTORAGEPC) */
  givePc?(itemId: number): void;
};

const BP_ACTION_USE = 0, BP_ACTION_TOSS = 1, BP_ACTION_GIVE = 2, BP_ACTION_EXIT = 3, BP_ACTION_DUMMY = 4;
const sOptions_UseGiveTossExit = [BP_ACTION_USE, BP_ACTION_GIVE, BP_ACTION_TOSS, BP_ACTION_EXIT];
const sOptions_UseToss_Exit = [BP_ACTION_USE, BP_ACTION_TOSS, BP_ACTION_EXIT, BP_ACTION_DUMMY];
const sTextColors = [[0, 1, 2], [0, 2, 3], [0, 3, 2]];
const TAG_POUCH = 100;

const sWindowTemplates_Main: WindowTemplate[] = [
  { bg: 0, tilemapLeft: 11, tilemapTop: 1, width: 18, height: 14, paletteNum: 15, baseBlock: 0x027 },
  { bg: 0, tilemapLeft: 5, tilemapTop: 16, width: 25, height: 4, paletteNum: 15, baseBlock: 0x123 },
  { bg: 2, tilemapLeft: 1, tilemapTop: 1, width: 9, height: 2, paletteNum: 15, baseBlock: 0x187 },
  { bg: 0xff, tilemapLeft: 0, tilemapTop: 0, width: 0, height: 0, paletteNum: 0, baseBlock: 0 },
];
const sWindowTemplates_Variable: WindowTemplate[] = [
  { bg: 2, tilemapLeft: 24, tilemapTop: 15, width: 5, height: 4, paletteNum: 15, baseBlock: 0x1d1 },
  { bg: 2, tilemapLeft: 17, tilemapTop: 9, width: 12, height: 4, paletteNum: 15, baseBlock: 0x1d1 },
  { bg: 2, tilemapLeft: 1, tilemapTop: 1, width: 8, height: 3, paletteNum: 12, baseBlock: 0x201 },
  { bg: 2, tilemapLeft: 23, tilemapTop: 15, width: 6, height: 4, paletteNum: 15, baseBlock: 0x219 },
  { bg: 2, tilemapLeft: 21, tilemapTop: 9, width: 6, height: 4, paletteNum: 15, baseBlock: 0x219 },
  { bg: 2, tilemapLeft: 2, tilemapTop: 15, width: 26, height: 4, paletteNum: 15, baseBlock: 0x231 },
  { bg: 2, tilemapLeft: 6, tilemapTop: 15, width: 14, height: 4, paletteNum: 12, baseBlock: 0x231 },
  { bg: 2, tilemapLeft: 6, tilemapTop: 15, width: 15, height: 4, paletteNum: 12, baseBlock: 0x269 },
  { bg: 2, tilemapLeft: 6, tilemapTop: 15, width: 16, height: 4, paletteNum: 12, baseBlock: 0x2a5 },
  { bg: 2, tilemapLeft: 6, tilemapTop: 15, width: 23, height: 4, paletteNum: 12, baseBlock: 0x2e5 },
  { bg: 2, tilemapLeft: 22, tilemapTop: 17, width: 7, height: 2, paletteNum: 15, baseBlock: 0x199 },
  { bg: 2, tilemapLeft: 22, tilemapTop: 15, width: 7, height: 4, paletteNum: 15, baseBlock: 0x199 },
  { bg: 2, tilemapLeft: 22, tilemapTop: 13, width: 7, height: 6, paletteNum: 15, baseBlock: 0x199 },
  { bg: 2, tilemapLeft: 22, tilemapTop: 11, width: 7, height: 8, paletteNum: 15, baseBlock: 0x199 },
];
const sSpriteTemplate_BerryPouch: SpriteTemplate = {
  tileTag: TAG_POUCH, paletteTag: TAG_POUCH, oam: oamData({ affineMode: 1, shape: 0, size: 3, priority: 1 }),
  anims: [[ANIMCMD_FRAME(0, 0), ANIMCMD_END]], images: null,
  affineAnims: [
    [AFFINEANIMCMD_FRAME(0x100, 0x100, 0, 0), AFFINEANIMCMD_END],
    [AFFINEANIMCMD_FRAME(0, 0, -2, 2), AFFINEANIMCMD_FRAME(0, 0, 2, 4), AFFINEANIMCMD_FRAME(0, 0, -2, 4), AFFINEANIMCMD_FRAME(0, 0, 2, 2), AFFINEANIMCMD_END],
  ],
  callback: SpriteCallbackDummy,
};

const text = (name: string): Uint8Array => rom.text(name);
const u8str = (bytes: ArrayLike<number>): number[] => { const o: number[] = []; for (let i = 0; i < bytes.length && bytes[i] !== 0xff; i++) o.push(bytes[i]); return o; };
const cat = (...parts: ArrayLike<number>[]): Uint8Array => Uint8Array.from([...parts.flatMap(u8str), 0xff]);
const berrySlots = () => pocketList(C.POCKET_BERRY_POUCH);
const BagGetItemIdByPocketPosition = (idx: number): number => berrySlots()[idx]?.item ?? C.ITEM_NONE;
const BagGetQuantityByPocketPosition = (idx: number): number => berrySlots()[idx]?.quantity ?? 0;
const ItemId_GetPrice = (id: number): number => itemInfo(id)?.price ?? 0;

// ---------------------------------------------------------------- resources

/** sStaticCnt: kept across openings. */
const sStaticCnt = { savedCallback: null as (() => void) | null, type: C.BERRYPOUCH_FROMFIELD, allowSelect: false, listMenuSelectedRow: 0, listMenuScrollOffset: 0 };
type Resources = {
  exitCallback: (() => void) | null; indicatorOffset: number; indicatorTaskId: number; listMenuNumItems: number; listMenuMaxShowed: number;
  itemMenuIconId: number; bg1TilemapBuffer: Uint16Array; data0: number;
};
let sResources: Resources | null = null;
const res = (): Resources => sResources!;
let sListMenuItems: ListMenuItem[] = [];
let sListMenuStrings: Uint8Array[] = [];
let sListMenuStrbuf = new Uint8Array(0);
let gMultiuseListMenuTemplate: ListMenuTemplate | null = null;
let sContextMenuOptions: number[] = [];
let sContextMenuNumOptions = 0;
let sVariableWindowIds: number[] = new Array(14).fill(0xff);
let sBerryPouchSpriteId = 0;
let sHandlers: BerryPouchHandlers = {};
let sContextMenuActions: MenuAction[] = [];

type TaskData = { listTaskId: number; itemIndex: number; quantity: number; count: { value: number } };
const taskData = new Map<number, TaskData>();
const td = (taskId: number): TaskData => {
  let d = taskData.get(taskId);
  if (!d) { d = { listTaskId: 0, itemIndex: 0, quantity: 0, count: { value: 0 } }; taskData.set(taskId, d); }
  return d;
};

/** InitBerryPouch(type, savedCallback, allowSelect). Runs under gMain in an HwScene. */
export function InitBerryPouch(type: number, savedCallback: (() => void) | null, allowSelect: number, handlers?: BerryPouchHandlers): void {
  if (handlers) sHandlers = handlers;
  SetMainCallback2WhenLoaded(Promise.all([
    loadCData("strings", "text_window_graphics", "item_menu_icons"),
    preloadPacks(["graphics_berry_pouch", "graphics_interface", "graphics_items", "graphics_text_window", "graphics_fonts"]),
  ]), () => {
    if (type !== C.BERRYPOUCH_NA) sStaticCnt.type = type;
    if (allowSelect !== 0xff) sStaticCnt.allowSelect = !!allowSelect;
    if (savedCallback) sStaticCnt.savedCallback = savedCallback;
    sResources = {
      exitCallback: null, indicatorOffset: 0, indicatorTaskId: 0xff, listMenuNumItems: 0, listMenuMaxShowed: 0, itemMenuIconId: 0,
      bg1TilemapBuffer: new Uint16Array(0x400), data0: 0,
    };
    sContextMenuActions = [
      { text: text("gOtherText_Use") }, { text: text("gOtherText_Toss") }, { text: text("gOtherText_Give") }, { text: text("gOtherText_Exit") },
      { text: text("gString_Dummy") },
    ];
    textFlags.autoScroll = false;
    bagResult.itemId = C.ITEM_NONE;
    gMain.state = 0;
    SetMainCallback2(CB2_InitBerryPouch);
  });
}

function CB2_BerryPouchIdle(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  DoScheduledBgTilemapCopiesToVram();
  UpdatePaletteFade();
}

function VBlankCB_BerryPouchIdle(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function CB2_InitBerryPouch(): void {
  while (!RunBerryPouchInit()) { /* one frame, as the source loop */ }
}

function RunBerryPouchInit(): boolean {
  switch (gMain.state) {
    case 0: SetVBlankCallback(null); SetHBlankCallback(null); ClearScheduledBgCopiesToVram(); gMain.state++; break;
    case 1: gMain.state++; break;
    case 2: FreeAllSpritePalettes(); gMain.state++; break;
    case 3: ResetPaletteFade(); gMain.state++; break;
    case 4: ResetSpriteData(); gMain.state++; break;
    case 5: ResetItemMenuIconState(); gMain.state++; break;
    case 6: tasks.reset(); taskData.clear(); gMain.state++; break;
    case 7: BerryPouchInitBgs(); res().data0 = 0; gMain.state++; break;
    case 8: if (BerryPouchLoadGfx()) gMain.state++; break;
    case 9: BerryPouchInitWindows(); gMain.state++; break;
    case 10: SortAndCountBerries(); SanitizeListMenuSelectionParams(); UpdateListMenuScrollOffset(); gMain.state++; break;
    case 11:
      if (!AllocateListMenuBuffers()) {
        AbortBerryPouchLoading();
        return true;
      }
      gMain.state++;
      break;
    case 12: SetUpListMenuTemplate(); gMain.state++; break;
    case 13: PrintBerryPouchHeaderCentered(); gMain.state++; break;
    case 14: {
      const taskId = tasks.create(Task_BerryPouchMain, 0);
      td(taskId).listTaskId = ListMenuInit(gMultiuseListMenuTemplate!, sStaticCnt.listMenuScrollOffset, sStaticCnt.listMenuSelectedRow);
      td(taskId).count.value = 0;
      gMain.state++;
      break;
    }
    case 15: CreateBerryPouchSprite(); gMain.state++; break;
    case 16: CreateScrollIndicatorArrows_BerryPouchList(); gMain.state++; break;
    case 17: BlendPalettes(PALETTES_ALL, 16, RGB_BLACK); gMain.state++; break;
    case 18: BeginNormalPaletteFade(PALETTES_ALL, -2, 16, 0, RGB_BLACK); gMain.state++; break;
    default:
      SetVBlankCallback(VBlankCB_BerryPouchIdle);
      SetMainCallback2(CB2_BerryPouchIdle);
      return true;
  }
  return false;
}

function BerryPouchInitBgs(): void {
  ResetAllBgsCoordinatesAndBgCntRegs();
  res().bg1TilemapBuffer.fill(0);
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, [
    { bg: 0, charBaseIndex: 0, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 1, baseTile: 0 },
    { bg: 1, charBaseIndex: 3, mapBaseIndex: 30, screenSize: 0, paletteMode: 0, priority: 2, baseTile: 0 },
    { bg: 2, charBaseIndex: 0, mapBaseIndex: 29, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0 },
  ]);
  SetBgTilemapBuffer(1, res().bg1TilemapBuffer);
  ScheduleBgCopyTilemapToVram(1);
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
  ShowBg(0);
  ShowBg(1);
  ShowBg(2);
}

function BerryPouchLoadGfx(): boolean {
  const r = res();
  switch (r.data0) {
    case 0: { const gfx = incbin("gBerryPouchBgGfx"); LoadBgTiles(1, gfx, gfx.length, 0); r.data0++; break; }
    case 1: r.bg1TilemapBuffer.set(incbin16("gBerryPouchBg1Tilemap").subarray(0, 0x400)); r.data0++; break;
    case 2:
      LoadPalette(incbin("gBerryPouchBgPals"), BG_PLTT_ID(0), 3 * 32);
      if (save.playerGender !== C.MALE) LoadPalette(incbin("gBerryPouchBgPal0FemaleOverride"), BG_PLTT_ID(0), 32);
      r.data0++;
      break;
    case 3: LoadSpriteSheet({ data: incbin("gBerryPouchSpriteTiles"), size: 0x800, tag: TAG_POUCH }); r.data0++; break;
    default:
      LoadSpritePalette({ data: incbin("gBerryPouchSpritePalette"), tag: TAG_POUCH });
      r.data0 = 0;
      return true;
  }
  return false;
}

function SetUpListMenuTemplate(): void {
  const r = res();
  for (let i = 0; i < r.listMenuNumItems; i++) {
    const label = GetBerryNameAndIndexForMenu(berrySlots()[i].item);
    const strbuf = sListMenuStrbuf.subarray(i * 27, (i + 1) * 27);
    strbuf.fill(0);
    strbuf.set(label.subarray(0, strbuf.length));
    sListMenuStrings[i] = strbuf;
    sListMenuItems[i] = { label: sListMenuStrings[i], index: i };
  }
  if (sStaticCnt.type !== C.BERRYPOUCH_FROMBERRYCRUSH)
    sListMenuItems[r.listMenuNumItems] = { label: text("gText_Close"), index: r.listMenuNumItems };
  gMultiuseListMenuTemplate = listMenuTemplate({
    items: sListMenuItems, totalItems: sStaticCnt.type !== C.BERRYPOUCH_FROMBERRYCRUSH ? r.listMenuNumItems + 1 : r.listMenuNumItems, windowId: 0, header_X: 0,
    item_X: 9, cursor_X: 1, lettersSpacing: 0, itemVerticalPadding: 2, upText_Y: 2, maxShowed: r.listMenuMaxShowed, fontId: FONT_NORMAL,
    cursorPal: 2, fillValue: 0, cursorShadowPal: 3, moveCursorFunc: BerryPouchMoveCursorFunc, itemPrintFunc: BerryPouchItemPrintFunc, cursorKind: 0,
    scrollMultiple: LIST_NO_MULTIPLE_SCROLL,
  });
}

function AllocateListMenuBuffers(): boolean {
  try {
    sListMenuItems = new Array<ListMenuItem>(C.NUM_BERRIES);
    sListMenuStrbuf = new Uint8Array(res().listMenuNumItems * 27);
    sListMenuStrings = new Array<Uint8Array>(res().listMenuNumItems);
    return true;
  } catch {
    return false;
  }
}

function CopySelectedListMenuItemName(itemIdx: number): Uint8Array {
  const selected = sListMenuStrbuf.subarray(itemIdx * 27, (itemIdx + 1) * 27);
  const eos = selected.indexOf(0xff);
  return selected.slice(0, eos < 0 ? selected.length : eos + 1);
}

function GetBerryNameAndIndexForMenu(itemId: number): Uint8Array {
  return cat(text("gText_FontSmall"), text("gText_NumberClear01"), intToDecimal(ItemIdToBerryType(itemId), STR_CONV_MODE_LEADING_ZEROS, 2),
    Uint8Array.of(0x00, 0xff), text("gText_FontNormal"), CopyItemName(itemId));
}

function BerryPouchMoveCursorFunc(itemIndex: number, onInit: boolean): void {
  const r = res();
  if (!onInit) {
    sound.playSE(C.SE_BAG_CURSOR);
    StartBerryPouchSpriteWobbleAnim();
  }
  DestroyItemMenuIcon(r.itemMenuIconId ^ 1);
  CreateBerryPouchItemIcon(r.listMenuNumItems !== itemIndex ? BagGetItemIdByPocketPosition(itemIndex) : C.ITEMS_COUNT, r.itemMenuIconId);
  r.itemMenuIconId ^= 1;
  PrintSelectedBerryDescription(itemIndex);
}

function BerryPouchItemPrintFunc(windowId: number, itemId: number, y: number): void {
  if (itemId !== -2 && res().listMenuNumItems !== itemId) {
    stringVars.var1 = intToDecimal(BagGetQuantityByPocketPosition(itemId), STR_CONV_MODE_RIGHT_ALIGN, 3);
    stringVars.var4 = expandPlaceholders(text("gText_TimesStrVar1"));
    BerryPouchPrint(windowId, FONT_SMALL, stringVars.var4, 110, y, 0, 0, 0xff, 1);
  }
}

function BerryPouchSetArrowCursorFromListMenu(listTaskId: number, colorIdx: number): void {
  BerryPouchSetArrowCursorAt(ListMenuGetYCoordForPrintingArrowCursor(listTaskId), colorIdx);
}

function BerryPouchSetArrowCursorAt(y: number, colorIdx: number): void {
  if (colorIdx === 0xff) {
    FillWindowPixelRect(0, 0, 1, y, GetMenuCursorDimensionByFont(FONT_NORMAL, 0), GetMenuCursorDimensionByFont(FONT_NORMAL, 1));
    CopyWindowToVram(0, COPYWIN_GFX);
  } else {
    BerryPouchPrint(0, FONT_NORMAL, text("gText_SelectorArrow2"), 1, y, 0, 0, 0, colorIdx);
  }
}

function PrintSelectedBerryDescription(itemIdx: number): void {
  const str = itemIdx !== res().listMenuNumItems ? b64(itemInfo(BagGetItemIdByPocketPosition(itemIdx))!.description) : text("gText_TheBerryPouchWillBePutAway");
  FillWindowPixelBuffer(1, PIXEL_FILL(0));
  BerryPouchPrint(1, FONT_NORMAL, str, 0, 2, 2, 0, 0, 0);
}

function SetDescriptionWindowBorderPalette(pal: number): void {
  SetBgTilemapPalette(1, 0, 16, 30, 4, pal + 1);
  ScheduleBgCopyTilemapToVram(1);
}

function CreateScrollIndicatorArrows_BerryPouchList(): void {
  const r = res();
  const threshold = sStaticCnt.type !== C.BERRYPOUCH_FROMBERRYCRUSH ? r.listMenuNumItems - r.listMenuMaxShowed + 1 : r.listMenuNumItems - r.listMenuMaxShowed;
  r.indicatorTaskId = AddScrollIndicatorArrowPairParameterized(2, 160, 8, 120, threshold, 110, 110, () => sStaticCnt.listMenuScrollOffset);
}

function CreateScrollIndicatorArrows_TossQuantity(): void {
  const r = res();
  r.indicatorOffset = 1;
  r.indicatorTaskId = AddScrollIndicatorArrowPairParameterized(2, 212, 120, 152, 2, 110, 110, () => r.indicatorOffset);
}

function CreateScrollIndicatorArrows_SellQuantity(): void {
  const r = res();
  r.indicatorOffset = 1;
  r.indicatorTaskId = AddScrollIndicatorArrowPairParameterized(2, 152, 72, 104, 2, 110, 110, () => r.indicatorOffset);
}

function DestroyScrollIndicatorArrows(): void {
  const r = res();
  if (r.indicatorTaskId !== 0xff) {
    RemoveScrollIndicatorArrowPair(r.indicatorTaskId);
    r.indicatorTaskId = 0xff;
  }
}

function PrintBerryPouchHeaderCentered(): void {
  const title = text("gText_BerryPouch");
  const slack = 72 - GetStringWidth(FONT_NORMAL_COPY_1, title, 0);
  BerryPouchPrint(2, FONT_NORMAL_COPY_1, title, Math.floor(slack / 2), 1, 0, 0, 0, 0);
}

export function BerryPouch_CursorResetToTop(): void {
  sStaticCnt.listMenuSelectedRow = 0;
  sStaticCnt.listMenuScrollOffset = 0;
}

function SanitizeListMenuSelectionParams(): void {
  const r = res();
  const r2 = sStaticCnt.type !== C.BERRYPOUCH_FROMBERRYCRUSH ? r.listMenuNumItems + 1 : r.listMenuNumItems;
  if (sStaticCnt.listMenuScrollOffset !== 0 && sStaticCnt.listMenuScrollOffset + r.listMenuMaxShowed > r2) sStaticCnt.listMenuScrollOffset = r2 - r.listMenuMaxShowed;
  if (sStaticCnt.listMenuScrollOffset + sStaticCnt.listMenuSelectedRow >= r2) sStaticCnt.listMenuSelectedRow = r2 === 0 || r2 === 1 ? 0 : r2 - 1;
}

function UpdateListMenuScrollOffset(): void {
  const r = res();
  const lim = sStaticCnt.type !== C.BERRYPOUCH_FROMBERRYCRUSH ? r.listMenuNumItems + 1 : r.listMenuNumItems;
  if (sStaticCnt.listMenuSelectedRow > 4) {
    for (let i = 0; i <= sStaticCnt.listMenuSelectedRow - 4; sStaticCnt.listMenuSelectedRow--, sStaticCnt.listMenuScrollOffset++, i++) {
      if (sStaticCnt.listMenuScrollOffset + r.listMenuMaxShowed === lim) break;
    }
  }
}

function BerryPouch_DestroyResources(): void {
  sResources = null;
  gMultiuseListMenuTemplate = null;
  sListMenuItems = [];
  sListMenuStrings = [];
  sListMenuStrbuf = new Uint8Array(0);
  FreeAllWindowBuffers();
}

/** AbortBerryPouchLoading (berry_pouch.c): begin the failure fade, then return through the saved callback. */
function AbortBerryPouchLoading(): void {
  BeginNormalPaletteFade(PALETTES_ALL, -2, 0, 16, RGB_BLACK);
  tasks.create(Task_AbortBerryPouchLoading_WaitFade, 0);
  SetVBlankCallback(VBlankCB_BerryPouchIdle);
  SetMainCallback2(CB2_BerryPouchIdle);
}

/** Task_AbortBerryPouchLoading_WaitFade (berry_pouch.c). */
function Task_AbortBerryPouchLoading_WaitFade(taskId: number): void {
  if (gPaletteFade.active) return;
  SetMainCallback2(sStaticCnt.savedCallback);
  BerryPouch_DestroyResources();
  tasks.destroy(taskId);
  taskData.delete(taskId);
}

function BerryPouch_StartFadeToExitCallback(taskId: number): void {
  BeginNormalPaletteFade(PALETTES_ALL, -2, 0, 16, RGB_BLACK);
  tasks.setFunc(taskId, Task_BerryPouchFadeToExitCallback);
}

function Task_BerryPouchFadeToExitCallback(taskId: number): void {
  if (gPaletteFade.active) return;
  const pos = DestroyListMenuTask(td(taskId).listTaskId);
  sStaticCnt.listMenuScrollOffset = pos.cursorPos;
  sStaticCnt.listMenuSelectedRow = pos.itemsAbove;
  const cb = res().exitCallback ?? sStaticCnt.savedCallback;
  DestroyScrollIndicatorArrows();
  BerryPouch_DestroyResources();
  tasks.destroy(taskId);
  taskData.delete(taskId);
  SetVBlankCallback(null);
  SetMainCallback2(null);
  cb?.();
}

function SortAndCountBerries(): void {
  const r = res();
  const slots = berrySlots();
  for (let i = slots.length - 1; i >= 0; i--) if (!slots[i].item || slots[i].quantity <= 0) slots.splice(i, 1);
  slots.sort((a, b) => a.item - b.item);
  r.listMenuNumItems = slots.length;
  const r2 = sStaticCnt.type !== C.BERRYPOUCH_FROMBERRYCRUSH ? r.listMenuNumItems + 1 : r.listMenuNumItems;
  r.listMenuMaxShowed = r2 > 7 ? 7 : r2;
}

function InitTossQuantitySelectUI(taskId: number, str: ArrayLike<number>): void {
  const windowId = GetOrCreateVariableWindow(8);
  stringVars.var1 = CopySelectedListMenuItemName(td(taskId).itemIndex);
  stringVars.var4 = expandPlaceholders(str);
  BerryPouchPrint(windowId, FONT_NORMAL, stringVars.var4, 0, 2, 1, 2, 0, 1);
  const windowId2 = GetOrCreateVariableWindow(0);
  stringVars.var1 = intToDecimal(1, STR_CONV_MODE_LEADING_ZEROS, 3);
  stringVars.var4 = expandPlaceholders(text("gText_TimesStrVar1"));
  BerryPouchPrint(windowId2, FONT_SMALL, stringVars.var4, 4, 10, 1, 0, 0, 1);
}

function PrintxQuantityOnWindow(whichWindow: number, quantity: number, ndigits: number): void {
  const windowId = sVariableWindowIds[whichWindow];
  FillWindowPixelBuffer(windowId, PIXEL_FILL(1));
  stringVars.var1 = intToDecimal(quantity, STR_CONV_MODE_LEADING_ZEROS, ndigits);
  stringVars.var4 = expandPlaceholders(text("gText_TimesStrVar1"));
  BerryPouchPrint(windowId, FONT_SMALL, stringVars.var4, 4, 10, 1, 0, 0, 1);
}

function Task_BerryPouchMain(taskId: number): void {
  const data = td(taskId);
  if (gPaletteFade.active) return;
  const menuInput = ListMenu_ProcessInput(data.listTaskId);
  const pos = ListMenuGetScrollAndRow(data.listTaskId);
  sStaticCnt.listMenuScrollOffset = pos.cursorPos;
  sStaticCnt.listMenuSelectedRow = pos.itemsAbove;
  if (joy.newKeys & SELECT_BUTTON && sStaticCnt.allowSelect) {
    sound.playSE(C.SE_SELECT);
    bagResult.itemId = 0;
    BerryPouch_StartFadeToExitCallback(taskId);
    return;
  }
  switch (menuInput) {
    case -1: return;
    case -2:
      if (sStaticCnt.type !== C.BERRYPOUCH_FROMBERRYCRUSH) {
        sound.playSE(C.SE_SELECT);
        bagResult.itemId = 0;
        BerryPouch_StartFadeToExitCallback(taskId);
      }
      break;
    default:
      sound.playSE(C.SE_SELECT);
      if (sStaticCnt.type === C.BERRYPOUCH_FROMBERRYCRUSH) {
        bagResult.itemId = BagGetItemIdByPocketPosition(menuInput);
        BerryPouch_StartFadeToExitCallback(taskId);
      } else if (menuInput === res().listMenuNumItems) {
        bagResult.itemId = 0;
        BerryPouch_StartFadeToExitCallback(taskId);
      } else {
        DestroyScrollIndicatorArrows();
        SetDescriptionWindowBorderPalette(1);
        BerryPouchSetArrowCursorFromListMenu(data.listTaskId, 2);
        data.itemIndex = menuInput;
        data.quantity = BagGetQuantityByPocketPosition(menuInput);
        bagResult.itemId = BagGetItemIdByPocketPosition(menuInput);
        switch (sStaticCnt.type) {
          case C.BERRYPOUCH_FROMPARTYGIVE: tasks.setFunc(taskId, Task_ContextMenu_FromPartyGiveMenu); break;
          case C.BERRYPOUCH_FROMMARTSELL: tasks.setFunc(taskId, Task_ContextMenu_Sell); break;
          case C.BERRYPOUCH_FROMPOKEMONSTORAGEPC: tasks.setFunc(taskId, Task_ContextMenu_FromPokemonPC); break;
          default: tasks.setFunc(taskId, Task_NormalContextMenu); break;
        }
      }
      break;
  }
}

function Task_CleanUpAndReturnToMain(taskId: number): void {
  SetDescriptionWindowBorderPalette(0);
  CreateScrollIndicatorArrows_BerryPouchList();
  tasks.setFunc(taskId, Task_BerryPouchMain);
}

function CreateNormalContextMenu(taskId: number): void {
  if (sStaticCnt.type === C.BERRYPOUCH_FROMBATTLE) { sContextMenuOptions = sOptions_UseToss_Exit; sContextMenuNumOptions = 3; }
  else { sContextMenuOptions = sOptions_UseGiveTossExit; sContextMenuNumOptions = 4; }
  const windowId = GetOrCreateVariableWindow(sContextMenuNumOptions + 9);
  AddItemMenuActionTextPrinters(windowId, FONT_NORMAL, GetMenuCursorDimensionByFont(FONT_NORMAL, 0), 2, GetFontAttribute(FONT_NORMAL, FONTATTR_LETTER_SPACING),
    GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT) + 2, sContextMenuNumOptions, sContextMenuActions, sContextMenuOptions);
  Menu_InitCursor(windowId, FONT_NORMAL, 0, 2, GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT) + 2, sContextMenuNumOptions, 0);
  const windowId2 = GetOrCreateVariableWindow(6);
  stringVars.var1 = CopySelectedListMenuItemName(td(taskId).itemIndex);
  stringVars.var4 = expandPlaceholders(text("gText_Var1IsSelected"));
  BerryPouchPrint(windowId2, FONT_NORMAL, stringVars.var4, 0, 2, 1, 2, 0, 1);
}

function Task_NormalContextMenu(taskId: number): void {
  CreateNormalContextMenu(taskId);
  tasks.setFunc(taskId, Task_NormalContextMenu_HandleInput);
}

function runAction(action: number, taskId: number): void {
  switch (action) {
    case BP_ACTION_USE: Task_BerryPouch_Use(taskId); break;
    case BP_ACTION_TOSS: Task_BerryPouch_Toss(taskId); break;
    case BP_ACTION_GIVE: Task_BerryPouch_Give(taskId); break;
    case BP_ACTION_EXIT: Task_BerryPouch_Exit(taskId); break;
  }
}

function Task_NormalContextMenu_HandleInput(taskId: number): void {
  const input = Menu_ProcessInputNoWrapAround();
  switch (input) {
    case MENU_NOTHING_CHOSEN: break;
    case MENU_B_PRESSED: sound.playSE(C.SE_SELECT); runAction(BP_ACTION_EXIT, taskId); break;
    default: sound.playSE(C.SE_SELECT); runAction(sContextMenuOptions[input], taskId); break;
  }
}

function closeContextWindows(): void {
  DestroyVariableWindow(sContextMenuNumOptions + 9);
  DestroyVariableWindow(6);
  PutWindowTilemap(0);
  PutWindowTilemap(1);
  ScheduleBgCopyTilemapToVram(0);
  ScheduleBgCopyTilemapToVram(2);
}

/** Context for a field/battle item function run from the pouch (DisplayItemMessageInBerryPouch / BerryPouch_SetExitCallback). */
function contextFor(taskId: number): BagTaskContext {
  return {
    taskId,
    message: (str, fontId = FONT_NORMAL) => DisplayItemMessageInBerryPouch(taskId, fontId, str, Task_BerryPouch_DestroyDialogueWindowAndRefreshListMenu),
    exit: (cb) => { BerryPouch_SetExitCallback(cb); BerryPouch_StartFadeToExitCallback(taskId); },
  };
}

function Task_BerryPouch_Use(taskId: number): void {
  closeContextWindows();
  const item = bagResult.itemId;
  if (sStaticCnt.type === C.BERRYPOUCH_FROMBATTLE) {
    if (sHandlers.battleUse) sHandlers.battleUse(item, contextFor(taskId));
    else Task_BerryPouch_DestroyDialogueWindowAndRefreshListMenu(taskId);
  } else if (save.party.length === 0 && itemInfo(item)?.type === "ITEM_TYPE_PARTY_MENU") {
    Task_Give_PrintThereIsNoPokemon(taskId);
  } else if (sHandlers.fieldUse) {
    sHandlers.fieldUse(item, contextFor(taskId));
  } else {
    Task_BerryPouch_DestroyDialogueWindowAndRefreshListMenu(taskId);
  }
}

function Task_BerryPouch_Toss(taskId: number): void {
  const data = td(taskId);
  ClearWindowTilemap(sVariableWindowIds[sContextMenuNumOptions + 9]);
  ClearWindowTilemap(sVariableWindowIds[6]);
  DestroyVariableWindow(sContextMenuNumOptions + 9);
  DestroyVariableWindow(6);
  PutWindowTilemap(0);
  data.count.value = 1;
  if (data.quantity === 1) {
    Task_AskTossMultiple(taskId);
  } else {
    InitTossQuantitySelectUI(taskId, text("gText_TossOutHowManyStrVar1s"));
    CreateScrollIndicatorArrows_TossQuantity();
    tasks.setFunc(taskId, Task_Toss_SelectMultiple);
  }
}

const sYesNoFuncs_Toss: YesNoFuncTable = { yesFunc: (t) => Task_TossYes(t), noFunc: (t) => Task_TossNo(t) };
const sYesNoFuncs_Sell: YesNoFuncTable = { yesFunc: (t) => Task_SellYes(t), noFunc: (t) => Task_SellNo(t) };

function Task_AskTossMultiple(taskId: number): void {
  stringVars.var2 = intToDecimal(td(taskId).count.value, STR_CONV_MODE_LEFT_ALIGN, 3);
  stringVars.var4 = expandPlaceholders(text("gText_ThrowAwayStrVar2OfThisItemQM"));
  BerryPouchPrint(GetOrCreateVariableWindow(7), FONT_NORMAL, stringVars.var4, 0, 2, 1, 2, 0, 1);
  CreateYesNoMenuWin3(taskId, sYesNoFuncs_Toss);
}

function Task_TossNo(taskId: number): void {
  DestroyVariableWindow(7);
  PutWindowTilemap(1);
  PutWindowTilemap(0);
  ScheduleBgCopyTilemapToVram(0);
  ScheduleBgCopyTilemapToVram(2);
  BerryPouchSetArrowCursorFromListMenu(td(taskId).listTaskId, 1);
  Task_CleanUpAndReturnToMain(taskId);
}

function Task_Toss_SelectMultiple(taskId: number): void {
  const data = td(taskId);
  if (AdjustQuantityAccordingToDPadInput(data.count, data.quantity)) {
    PrintxQuantityOnWindow(0, data.count.value, 3);
  } else if (joy.newKeys & A_BUTTON) {
    sound.playSE(C.SE_SELECT);
    ClearWindowTilemap(sVariableWindowIds[8]);
    DestroyVariableWindow(8);
    DestroyVariableWindow(0);
    ScheduleBgCopyTilemapToVram(0);
    ScheduleBgCopyTilemapToVram(2);
    DestroyScrollIndicatorArrows();
    Task_AskTossMultiple(taskId);
  } else if (joy.newKeys & B_BUTTON) {
    sound.playSE(C.SE_SELECT);
    DestroyVariableWindow(8);
    DestroyVariableWindow(0);
    PutWindowTilemap(0);
    PutWindowTilemap(1);
    ScheduleBgCopyTilemapToVram(0);
    ScheduleBgCopyTilemapToVram(2);
    BerryPouchSetArrowCursorFromListMenu(data.listTaskId, 1);
    DestroyScrollIndicatorArrows();
    Task_CleanUpAndReturnToMain(taskId);
  }
}

function Task_TossYes(taskId: number): void {
  const data = td(taskId);
  DestroyVariableWindow(7);
  stringVars.var1 = CopySelectedListMenuItemName(data.itemIndex);
  stringVars.var2 = intToDecimal(data.count.value, STR_CONV_MODE_LEFT_ALIGN, 3);
  stringVars.var4 = expandPlaceholders(text("gText_ThrewAwayStrVar2StrVar1s"));
  BerryPouchPrint(GetOrCreateVariableWindow(9), FONT_NORMAL, stringVars.var4, 0, 2, 1, 2, 0, 1);
  tasks.setFunc(taskId, Task_WaitButtonThenTossBerries);
}

function refreshList(taskId: number): void {
  const data = td(taskId);
  const pos = DestroyListMenuTask(data.listTaskId);
  sStaticCnt.listMenuScrollOffset = pos.cursorPos;
  sStaticCnt.listMenuSelectedRow = pos.itemsAbove;
  SortAndCountBerries();
  SanitizeListMenuSelectionParams();
  SetUpListMenuTemplate();
  data.listTaskId = ListMenuInit(gMultiuseListMenuTemplate!, sStaticCnt.listMenuScrollOffset, sStaticCnt.listMenuSelectedRow);
}

function Task_WaitButtonThenTossBerries(taskId: number): void {
  if (!(joy.newKeys & (A_BUTTON | B_BUTTON))) return;
  sound.playSE(C.SE_SELECT);
  removeBagItem(bagResult.itemId, td(taskId).count.value);
  DestroyVariableWindow(9);
  refreshList(taskId);
  PutWindowTilemap(1);
  ScheduleBgCopyTilemapToVram(0);
  BerryPouchSetArrowCursorFromListMenu(td(taskId).listTaskId, 1);
  Task_CleanUpAndReturnToMain(taskId);
}

function Task_BerryPouch_Give(taskId: number): void {
  closeContextWindows();
  if (save.party.length === 0) { Task_Give_PrintThereIsNoPokemon(taskId); return; }
  const item = bagResult.itemId;
  BerryPouch_SetExitCallback(() => sHandlers.giveToMon ? sHandlers.giveToMon(item) : sStaticCnt.savedCallback?.());
  tasks.setFunc(taskId, BerryPouch_StartFadeToExitCallback);
}

function Task_Give_PrintThereIsNoPokemon(taskId: number): void {
  DisplayItemMessageInBerryPouch(taskId, FONT_NORMAL, text("gText_ThereIsNoPokemon"), Task_WaitButtonBeforeDialogueWindowDestruction);
}

function Task_WaitButtonBeforeDialogueWindowDestruction(taskId: number): void {
  if (joy.newKeys & A_BUTTON) {
    sound.playSE(C.SE_SELECT);
    Task_BerryPouch_DestroyDialogueWindowAndRefreshListMenu(taskId);
  }
}

export function Task_BerryPouch_DestroyDialogueWindowAndRefreshListMenu(taskId: number): void {
  TryDestroyVariableWindow(5);
  refreshList(taskId);
  ScheduleBgCopyTilemapToVram(0);
  BerryPouchSetArrowCursorFromListMenu(td(taskId).listTaskId, 1);
  Task_CleanUpAndReturnToMain(taskId);
}

function Task_BerryPouch_Exit(taskId: number): void {
  closeContextWindows();
  BerryPouchSetArrowCursorFromListMenu(td(taskId).listTaskId, 1);
  Task_CleanUpAndReturnToMain(taskId);
}

function Task_ContextMenu_FromPartyGiveMenu(taskId: number): void {
  const item = BagGetItemIdByPocketPosition(td(taskId).itemIndex);
  BerryPouch_SetExitCallback(() => sHandlers.giveParty ? sHandlers.giveParty(item) : sStaticCnt.savedCallback?.());
  tasks.setFunc(taskId, BerryPouch_StartFadeToExitCallback);
}

function Task_ContextMenu_FromPokemonPC(taskId: number): void {
  const item = bagResult.itemId;
  BerryPouch_SetExitCallback(() => sHandlers.givePc ? sHandlers.givePc(item) : sStaticCnt.savedCallback?.());
  tasks.setFunc(taskId, BerryPouch_StartFadeToExitCallback);
}

const salePrice = (taskId: number): number => Math.floor(ItemId_GetPrice(BagGetItemIdByPocketPosition(td(taskId).itemIndex)) / 2) * td(taskId).count.value;

function Task_ContextMenu_Sell(taskId: number): void {
  const data = td(taskId);
  if (ItemId_GetPrice(bagResult.itemId) === 0) {
    stringVars.var1 = CopyItemName(bagResult.itemId);
    stringVars.var4 = expandPlaceholders(text("gText_OhNoICantBuyThat"));
    DisplayItemMessageInBerryPouch(taskId, GetDialogBoxFontId(), stringVars.var4, Task_BerryPouch_DestroyDialogueWindowAndRefreshListMenu);
    return;
  }
  data.count.value = 1;
  if (data.quantity === 1) {
    PrintMoneyInWin2();
    Task_AskSellMultiple(taskId);
  } else {
    if (data.quantity > 99) data.quantity = 99;
    stringVars.var1 = CopyItemName(bagResult.itemId);
    stringVars.var4 = expandPlaceholders(text("gText_HowManyWouldYouLikeToSell"));
    DisplayItemMessageInBerryPouch(taskId, GetDialogBoxFontId(), stringVars.var4, Task_Sell_PrintSelectMultipleUI);
  }
}

function Task_AskSellMultiple(taskId: number): void {
  stringVars.var3 = intToDecimal(salePrice(taskId), STR_CONV_MODE_LEFT_ALIGN, 6);
  stringVars.var4 = expandPlaceholders(text("gText_ICanPayThisMuch_WouldThatBeOkay"));
  DisplayItemMessageInBerryPouch(taskId, GetDialogBoxFontId(), stringVars.var4,
    (t) => Task_SellMultiple_CreateYesNoMenu(t));
}

function Task_SellMultiple_CreateYesNoMenu(taskId: number): void {
  CreateYesNoMenuWin4(taskId, sYesNoFuncs_Sell);
}

function Task_SellNo(taskId: number): void {
  DestroyVariableWindow(2);
  TryDestroyVariableWindow(5);
  PutWindowTilemap(2);
  PutWindowTilemap(0);
  PutWindowTilemap(1);
  ScheduleBgCopyTilemapToVram(0);
  BerryPouchSetArrowCursorFromListMenu(td(taskId).listTaskId, 1);
  Task_CleanUpAndReturnToMain(taskId);
}

function Task_Sell_PrintSelectMultipleUI(taskId: number): void {
  const windowId = GetOrCreateVariableWindow(1);
  stringVars.var1 = intToDecimal(1, STR_CONV_MODE_LEADING_ZEROS, 2);
  stringVars.var4 = expandPlaceholders(text("gText_TimesStrVar1"));
  BerryPouchPrint(windowId, FONT_SMALL, stringVars.var4, 4, 10, 1, 0, 0xff, 1);
  SellMultiple_UpdateSellPriceDisplay(salePrice(taskId));
  PrintMoneyInWin2();
  CreateScrollIndicatorArrows_SellQuantity();
  tasks.setFunc(taskId, Task_Sell_SelectMultiple);
}

function Task_Sell_SelectMultiple(taskId: number): void {
  const data = td(taskId);
  if (AdjustQuantityAccordingToDPadInput(data.count, data.quantity)) {
    PrintxQuantityOnWindow(1, data.count.value, 2);
    SellMultiple_UpdateSellPriceDisplay(salePrice(taskId));
  } else if (joy.newKeys & A_BUTTON) {
    sound.playSE(C.SE_SELECT);
    DestroyVariableWindow(1);
    PutWindowTilemap(0);
    ScheduleBgCopyTilemapToVram(0);
    DestroyScrollIndicatorArrows();
    Task_AskSellMultiple(taskId);
  } else if (joy.newKeys & B_BUTTON) {
    sound.playSE(C.SE_SELECT);
    DestroyVariableWindow(1);
    DestroyVariableWindow(2);
    TryDestroyVariableWindow(5);
    PutWindowTilemap(2);
    PutWindowTilemap(0);
    PutWindowTilemap(1);
    ScheduleBgCopyTilemapToVram(0);
    DestroyScrollIndicatorArrows();
    BerryPouchSetArrowCursorFromListMenu(data.listTaskId, 1);
    Task_CleanUpAndReturnToMain(taskId);
  }
}

function Task_SellYes(taskId: number): void {
  PutWindowTilemap(0);
  ScheduleBgCopyTilemapToVram(0);
  stringVars.var1 = CopyItemName(bagResult.itemId);
  stringVars.var3 = intToDecimal(salePrice(taskId), STR_CONV_MODE_LEFT_ALIGN, 6);
  stringVars.var4 = expandPlaceholders(text("gText_TurnedOverItemsWorthYen"));
  DisplayItemMessageInBerryPouch(taskId, FONT_NORMAL, stringVars.var4, Task_SellBerries_PlaySfxAndRemoveBerries);
}

function Task_SellBerries_PlaySfxAndRemoveBerries(taskId: number): void {
  const data = td(taskId);
  sound.playSE(C.SE_SHOP);
  const earned = Math.floor(ItemId_GetPrice(bagResult.itemId) / 2) * data.count.value;
  removeBagItem(bagResult.itemId, data.count.value);
  addMoney(earned);
  refreshList(taskId);
  BerryPouchSetArrowCursorFromListMenu(data.listTaskId, 2);
  PrintMoneyAmountInMoneyBox(sVariableWindowIds[2], save.money, 0);
  tasks.setFunc(taskId, Task_SellBerries_WaitButton);
}

function Task_SellBerries_WaitButton(taskId: number): void {
  if (joy.newKeys & (A_BUTTON | B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    DestroyVariableWindow(2);
    PutWindowTilemap(2);
    Task_BerryPouch_DestroyDialogueWindowAndRefreshListMenu(taskId);
  }
}

function BerryPouchInitWindows(): void {
  InitWindows(sWindowTemplates_Main);
  DeactivateAllTextPrinters();
  LoadUserWindowGfx(0, 0x001, BG_PLTT_ID(14), save.options.frameType);
  LoadMenuMessageWindowGfx(0, 0x013, BG_PLTT_ID(13));
  LoadStdWindowGfx(0, 0x00a, BG_PLTT_ID(12));
  LoadPalette(incbin("gStandardMenuPalette"), BG_PLTT_ID(15), 32);
  for (let i = 0; i < 3; i++) FillWindowPixelBuffer(i, PIXEL_FILL(0));
  PutWindowTilemap(0);
  PutWindowTilemap(1);
  PutWindowTilemap(2);
  ScheduleBgCopyTilemapToVram(0);
  ScheduleBgCopyTilemapToVram(2);
  sVariableWindowIds = new Array(14).fill(0xff);
}

function BerryPouchPrint(windowId: number, fontId: number, str: ArrayLike<number>, x: number, y: number, letterSpacing: number, lineSpacing: number, speed: number, colorIdx: number): void {
  AddTextPrinterParameterized4(windowId, fontId, x, y, letterSpacing, lineSpacing, sTextColors[colorIdx], speed, str);
}

function GetOrCreateVariableWindow(winIdx: number): number {
  if (sVariableWindowIds[winIdx] === 0xff) {
    sVariableWindowIds[winIdx] = AddWindow(sWindowTemplates_Variable[winIdx]);
    if (winIdx === 2 || winIdx === 6 || winIdx === 7 || winIdx === 8 || winIdx === 9) DrawStdFrameWithCustomTileAndPalette(sVariableWindowIds[winIdx], false, 0x00a, 12);
    else VariableWindowSetAltFrameTileAndPalette(winIdx);
    ScheduleBgCopyTilemapToVram(2);
  }
  return sVariableWindowIds[winIdx];
}

function GetVariableWindowId(winIdx: number): number {
  return sVariableWindowIds[winIdx];
}

function VariableWindowSetAltFrameTileAndPalette(winIdx: number): void {
  DrawStdFrameWithCustomTileAndPalette(sVariableWindowIds[winIdx], false, 0x001, 14);
}

function DestroyVariableWindow(winIdx: number): void {
  if (sVariableWindowIds[winIdx] === 0xff) return;
  ClearStdWindowAndFrameToTransparent(sVariableWindowIds[winIdx], false);
  ClearWindowTilemap(sVariableWindowIds[winIdx]);
  RemoveWindow(sVariableWindowIds[winIdx]);
  ScheduleBgCopyTilemapToVram(2);
  sVariableWindowIds[winIdx] = 0xff;
}

function TryDestroyVariableWindow(winIdx: number): void {
  if (sVariableWindowIds[winIdx] === 0xff) return;
  ClearDialogWindowAndFrameToTransparent(sVariableWindowIds[winIdx], false);
  ClearWindowTilemap(sVariableWindowIds[winIdx]);
  RemoveWindow(sVariableWindowIds[winIdx]);
  PutWindowTilemap(1);
  ScheduleBgCopyTilemapToVram(0);
  ScheduleBgCopyTilemapToVram(2);
  sVariableWindowIds[winIdx] = 0xff;
}

/** DisplayItemMessageInBerryPouch */
export function DisplayItemMessageInBerryPouch(taskId: number, fontId: number, str: ArrayLike<number>, followUpFunc: TaskFunc): void {
  if (sVariableWindowIds[5] === 0xff) sVariableWindowIds[5] = AddWindow(sWindowTemplates_Variable[5]);
  DisplayMessageAndContinueTask(taskId, sVariableWindowIds[5], 0x013, 0x0d, fontId, getTextSpeedSetting(), str, followUpFunc);
  ScheduleBgCopyTilemapToVram(2);
}

function PrintMoneyInWin2(): void {
  PrintMoneyAmountInMoneyBoxWithBorder(GetOrCreateVariableWindow(2), 0x00a, 0x0c, save.money);
}

function CreateYesNoMenuWin3(taskId: number, funcs: YesNoFuncTable): void {
  CreateYesNoMenuWithCallbacks(taskId, sWindowTemplates_Variable[3], FONT_NORMAL, 0, 2, 0x001, 14, funcs);
}

function CreateYesNoMenuWin4(taskId: number, funcs: YesNoFuncTable): void {
  CreateYesNoMenuWithCallbacks(taskId, sWindowTemplates_Variable[4], FONT_NORMAL, 0, 2, 0x001, 14, funcs);
}

function CreateBerryPouchSprite(): void {
  sBerryPouchSpriteId = CreateSprite(sSpriteTemplate_BerryPouch, 40, 76, 0);
}

function SellMultiple_UpdateSellPriceDisplay(price: number): void {
  PrintMoneyAmount(GetVariableWindowId(1), 56, 10, price, 0);
}

export function BerryPouch_SetExitCallback(callback: (() => void) | null): void {
  res().exitCallback = callback;
}

function StartBerryPouchSpriteWobbleAnim(): void {
  const sprite = gSprites[sBerryPouchSpriteId];
  if (sprite.affineAnimEnded) {
    StartSpriteAffineAnim(sprite, 1);
    sprite.callback = SpriteCB_BerryPouchWaitWobbleAnim;
  }
}

function SpriteCB_BerryPouchWaitWobbleAnim(sprite: Sprite): void {
  if (sprite.affineAnimEnded) {
    StartSpriteAffineAnim(sprite, 0);
    sprite.callback = SpriteCallbackDummy;
  }
}
