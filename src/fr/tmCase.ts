// tm_case.c: the TM CASE on the hardware layer (TM/HM list with move info,
// the disc sprite tinted by move type, context menu, give and sell flows).
// What USE and GIVE lead to (the party screens) is supplied through
// TmCaseHandlers, the way the source hands off to CB2_ShowPartyMenuForItemUse
// / CB2_ChooseMonToGiveItem / CB2_GiveHoldItem / CB2_ReturnToPokeStorage.

import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { expandPlaceholders, intToDecimal, stringVars, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "./gba/charmap";
import { FONT_NORMAL, FONT_NORMAL_COPY_1, FONT_NORMAL_COPY_2, FONT_SMALL, stringWidth } from "./gba/font";
import { joy, A_BUTTON, B_BUTTON, SELECT_BUTTON } from "./gba/input";
import { tasks, type TaskFunc } from "./gba/tasks";
import { getTextSpeedSetting, textFlags } from "./gba/textPrinter";
import { incbin, incbin16, loadCData, preloadPacks } from "./hw/assets";
import { GetBgTilemapBuffer, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg } from "./hw/bg";
import { SetGpuReg } from "./hw/gpu";
import {
  AddScrollIndicatorArrowPairParameterized, BlitMenuInfoIcon, DestroyListMenuTask, LIST_CANCEL, LIST_NO_MULTIPLE_SCROLL, LIST_NOTHING_CHOSEN,
  ListMenu_ProcessInput, ListMenuGetScrollAndRow, ListMenuGetYCoordForPrintingArrowCursor, ListMenuInit, ListMenuLoadStdPalAt, listMenuTemplate,
  RemoveScrollIndicatorArrowPair, SCROLL_ARROW_UP, type ListMenuItem, type ListMenuTemplate,
} from "./hw/listMenu";
import {
  ClearDialogWindowAndFrameToTransparent, ClearStdWindowAndFrameToTransparent, DrawStdFrameWithCustomTileAndPalette, FONTATTR_MAX_LETTER_HEIGHT,
  GetFontAttribute, GetMenuCursorDimensionByFont, LoadMenuMessageWindowGfx, LoadStdWindowGfx, LoadUserWindowGfx, MENU_B_PRESSED, MENU_NOTHING_CHOSEN,
  Menu_InitCursor, Menu_ProcessInputNoWrapAround,
} from "./hw/menu";
import {
  AddItemMenuActionTextPrinters, AdjustQuantityAccordingToDPadInput, ClearScheduledBgCopiesToVram, CopyItemName, CreateYesNoMenuWithCallbacks,
  DisplayMessageAndContinueTask, DoScheduledBgTilemapCopiesToVram, GetDialogBoxFontId, PrintMoneyAmount, PrintMoneyAmountInMoneyBox,
  PrintMoneyAmountInMoneyBoxWithBorder, ResetAllBgsCoordinatesAndBgCntRegs, ScheduleBgCopyTilemapToVram, SetBgTilemapPalette, type MenuAction,
  type YesNoFuncTable,
} from "./hw/menuHelpers";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalettes, gPaletteFade, LoadPalette, OBJ_PLTT_OFFSET, PALETTES_ALL, PLTT_ID, ResetPaletteFade, RGB_BLACK,
  TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import { DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, REG_OFFSET_BLDCNT, REG_OFFSET_DISPCNT } from "./hw/ppu";
import { gMain, SetHBlankCallback, SetMainCallback2, SetVBlankCallback, SetMainCallback2WhenLoaded } from "./hw/runtime";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, FreeAllSpritePalettes, gDummySpriteAffineAnimTable, gSprites, IndexOfSpritePaletteTag, LoadOam,
  LoadSpritePalette, LoadSpriteSheet, oamData, ProcessSpriteCopyRequests, ResetSpriteData, SpriteCallbackDummy, StartSpriteAnim, ANIMCMD_END,
  ANIMCMD_FRAME, type Sprite, type SpriteTemplate,
} from "./hw/sprite";
import { AddTextPrinterParameterized3, AddTextPrinterParameterized4, DeactivateAllTextPrinters } from "./hw/text";
import {
  AddWindow, BlitBitmapToWindow, ClearWindowTilemap, COPYWIN_GFX, CopyWindowToVram, FillWindowPixelBuffer, FillWindowPixelRect, FreeAllWindowBuffers,
  InitWindows, PutWindowTilemap, RemoveWindow, WINDOW_NONE, type WindowTemplate,
} from "./hw/window";
import { bagResult } from "./bagMenu";
import { tmhmMove } from "./menus/monProgress";
import { addBagItem, addMoney, BagPocketCompaction, itemInfo, pocketList, removeBagItem } from "./pokemon/items";
import { b64, rom } from "./rom";
import { save } from "./save";

export type TmCaseHandlers = {
  /** ACTION_USE: gItemUseCB = ItemUseCB_TMHM; CB2_ShowPartyMenuForItemUse. */
  useOnMon?(itemId: number): void;
  /** ACTION_GIVE in the field: CB2_ChooseMonToGiveItem. */
  giveToMon?(itemId: number): void;
  /** TMCASE_GIVE_PARTY: CB2_GiveHoldItem. */
  giveParty?(itemId: number): void;
  /** TMCASE_GIVE_PC: CB2_ReturnToPokeStorage. */
  givePc?(itemId: number): void;
};

const WIN_LIST = 0, WIN_DESCRIPTION = 1, WIN_SELECTED_MSG = 2, WIN_TITLE = 3, WIN_MOVE_INFO_LABELS = 4, WIN_MOVE_INFO = 5, WIN_MESSAGE = 6,
  WIN_SELL_QUANTITY = 7, WIN_MONEY = 8;
const WIN_USE_GIVE_EXIT = 0, WIN_GIVE_EXIT = 1;
const ACTION_USE = 0, ACTION_GIVE = 1, ACTION_EXIT = 2;
const COLOR_LIGHT = 0, COLOR_DARK = 1, COLOR_CURSOR_SELECTED = 2, COLOR_MOVE_INFO = 3, COLOR_CURSOR_ERASE = 0xff;
const DISC_BASE_X = 41, DISC_BASE_Y = 46, DISC_CASE_DISTANCE = 20, DISC_Y_MOVE = 10;
const TAG_DISC = 400, TAG_SCROLL_ARROW = 110, DISC_HIDDEN = 0xff;
const ANIM_TM = 0, ANIM_HM = 1;
const TASK_NONE = 0xff;
const NUM_DISC_COLORS = (18 - 1) * 16;

const IS_HM = (itemId: number): boolean => (itemInfo(itemId)?.importance ?? 0) !== 0;
const text = (name: string): Uint8Array => rom.text(name);
const u8str = (bytes: ArrayLike<number>): number[] => { const o: number[] = []; for (let i = 0; i < bytes.length && bytes[i] !== 0xff; i++) o.push(bytes[i]); return o; };
const cat = (...parts: ArrayLike<number>[]): Uint8Array => Uint8Array.from([...parts.flatMap(u8str), 0xff]);
const tmSlots = () => pocketList(C.POCKET_TM_CASE);
const BagGetItemIdByPocketPosition = (idx: number): number => tmSlots()[idx]?.item ?? C.ITEM_NONE;
const BagGetQuantityByPocketPosition = (idx: number): number => tmSlots()[idx]?.quantity ?? 0;
const moveOf = (itemId: number) => rom.moves[tmhmMove(itemId)];

const sTextColors = [[0, 1, 2], [0, 2, 3], [0, 3, 6], [0, 14, 10]];
const sPal3Override = Uint16Array.of(8 | (8 << 5) | (8 << 10), 30 | (16 << 5) | (6 << 10));
const sWindowTemplates: WindowTemplate[] = [
  { bg: 0, tilemapLeft: 10, tilemapTop: 1, width: 19, height: 10, paletteNum: 15, baseBlock: 0x081 },
  { bg: 0, tilemapLeft: 12, tilemapTop: 12, width: 18, height: 8, paletteNum: 10, baseBlock: 0x13f },
  { bg: 1, tilemapLeft: 5, tilemapTop: 15, width: 15, height: 4, paletteNum: 13, baseBlock: 0x1f9 },
  { bg: 0, tilemapLeft: 0, tilemapTop: 1, width: 10, height: 2, paletteNum: 15, baseBlock: 0x235 },
  { bg: 0, tilemapLeft: 1, tilemapTop: 13, width: 5, height: 6, paletteNum: 12, baseBlock: 0x249 },
  { bg: 0, tilemapLeft: 7, tilemapTop: 13, width: 5, height: 6, paletteNum: 12, baseBlock: 0x267 },
  { bg: 1, tilemapLeft: 2, tilemapTop: 15, width: 26, height: 4, paletteNum: 11, baseBlock: 0x285 },
  { bg: 1, tilemapLeft: 17, tilemapTop: 9, width: 12, height: 4, paletteNum: 15, baseBlock: 0x2ed },
  { bg: 1, tilemapLeft: 1, tilemapTop: 1, width: 8, height: 3, paletteNum: 13, baseBlock: 0x31d },
  { bg: 0xff, tilemapLeft: 0, tilemapTop: 0, width: 0, height: 0, paletteNum: 0, baseBlock: 0 },
];
const sYesNoWindowTemplate: WindowTemplate = { bg: 1, tilemapLeft: 21, tilemapTop: 9, width: 6, height: 4, paletteNum: 15, baseBlock: 0x335 };
const sWindowTemplates_ContextMenu: WindowTemplate[] = [
  { bg: 1, tilemapLeft: 22, tilemapTop: 13, width: 7, height: 6, paletteNum: 15, baseBlock: 0x1cf },
  { bg: 1, tilemapLeft: 22, tilemapTop: 15, width: 7, height: 4, paletteNum: 15, baseBlock: 0x1cf },
];
const sMenuActionIndices_Field = [ACTION_USE, ACTION_GIVE, ACTION_EXIT];
const sTMSpritePaletteOffsetByType = [0x000, 0x090, 0x080, 0x0c0, 0x060, 0x050, 0x0b0, 0x0a0, 0x0e0, 0x000, 0x010, 0x020, 0x030, 0x040, 0x0d0, 0x070, 0x100, 0x0f0];
const sSpriteTemplate_Disc: SpriteTemplate = {
  tileTag: TAG_DISC, paletteTag: TAG_DISC, oam: oamData({ size: 2, priority: 2 }),
  anims: [[ANIMCMD_FRAME(0, 0), ANIMCMD_END], [ANIMCMD_FRAME(16, 0), ANIMCMD_END]], images: null,
  affineAnims: gDummySpriteAffineAnimTable, callback: SpriteCallbackDummy,
};

// ---------------------------------------------------------------- resources

/** sTMCaseStaticResources: kept across openings (the selected row survives). */
const sStatic = { exitCallback: null as (() => void) | null, menuType: C.TMCASE_FIELD, allowSelectClose: false, selectedRow: 0, scrollOffset: 0 };
type Dynamic = {
  nextScreenCallback: (() => void) | null; discSpriteId: number; maxTMsShown: number; numTMs: number; contextMenuWindowId: number;
  scrollArrowsTaskId: number; currItem: number; menuActionIndices: number[]; numMenuActions: number; seqId: number;
};
let sDyn: Dynamic | null = null;
const dyn = (): Dynamic => sDyn!;
let sTilemapBuffer: Uint16Array | null = null;
let sTMSpritePaletteBuffer: Uint16Array | null = null;
let sListMenuItemsBuffer: ListMenuItem[] | null = null;
let sListMenuStringsBuffer: Uint8Array[] | null = null;
let gMultiuseListMenuTemplate: ListMenuTemplate | null = null;
let sHandlers: TmCaseHandlers = {};
let sMenuActions: MenuAction[] = [];

type TaskData = { listTaskId: number; selection: number; quantityOwned: number; quantitySelected: { value: number } };
const taskData = new Map<number, TaskData>();
const td = (taskId: number): TaskData => {
  let d = taskData.get(taskId);
  if (!d) { d = { listTaskId: 0, selection: 0, quantityOwned: 0, quantitySelected: { value: 0 } }; taskData.set(taskId, d); }
  return d;
};

/** InitTMCase(type, exitCallback, allowSelectClose). Runs under gMain in an HwScene. */
export function InitTMCase(type: number, exitCallback: (() => void) | null, allowSelectClose: boolean | number, handlers?: TmCaseHandlers): void {
  if (handlers) sHandlers = handlers;
  SetMainCallback2WhenLoaded(Promise.all([
    loadCData("strings", "text_window_graphics"),
    preloadPacks(["graphics_tm_case", "graphics_interface", "graphics_text_window", "graphics_fonts"]),
  ]), () => {
    ResetBufferPointers_NoFree();
    sDyn = {
      nextScreenCallback: null, discSpriteId: 0, maxTMsShown: 0, numTMs: 0, contextMenuWindowId: WINDOW_NONE, scrollArrowsTaskId: TASK_NONE,
      currItem: 0, menuActionIndices: [], numMenuActions: 0, seqId: 0,
    };
    if (type !== C.TMCASE_REOPENING) sStatic.menuType = type;
    if (exitCallback) sStatic.exitCallback = exitCallback;
    if (allowSelectClose !== C.TMCASE_KEEP_PREV) sStatic.allowSelectClose = !!allowSelectClose;
    textFlags.autoScroll = false;
    sMenuActions = [{ text: text("gOtherText_Use") }, { text: text("gOtherText_Give") }, { text: text("gOtherText_Exit") }];
    gMain.state = 0;
    SetMainCallback2(CB2_SetUpTMCaseUI_Blocking);
  });
}

function CB2_Idle(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  DoScheduledBgTilemapCopiesToVram();
  UpdatePaletteFade();
}

function VBlankCB_Idle(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function CB2_SetUpTMCaseUI_Blocking(): void {
  while (!DoSetUpTMCaseUI()) { /* one frame, as the source loop */ }
}

/** ResetBufferPointers_NoFree: discard handles without freeing ownership elsewhere. */
function ResetBufferPointers_NoFree(): void {
  sDyn = null;
  sTilemapBuffer = null;
  sListMenuItemsBuffer = null;
  sListMenuStringsBuffer = null;
  sTMSpritePaletteBuffer = null;
  gMultiuseListMenuTemplate = null;
}

function DoSetUpTMCaseUI(): boolean {
  switch (gMain.state) {
    case 0: SetVBlankCallback(null); SetHBlankCallback(null); ClearScheduledBgCopiesToVram(); gMain.state++; break;
    case 1: gMain.state++; break;
    case 2: FreeAllSpritePalettes(); gMain.state++; break;
    case 3: ResetPaletteFade(); gMain.state++; break;
    case 4: ResetSpriteData(); gMain.state++; break;
    case 5: tasks.reset(); taskData.clear(); gMain.state++; break;
    case 6: LoadBGTemplates(); dyn().seqId = 0; gMain.state++; break;
    case 7: InitWindowTemplatesAndPals(); gMain.state++; break;
    case 8: if (HandleLoadTMCaseGraphicsAndPalettes()) gMain.state++; break;
    case 9: SortPocketAndPlaceHMsFirst(); gMain.state++; break;
    case 10: TMCaseSetup_GetTMCount(); TMCaseSetup_InitListMenuPositions(); TMCaseSetup_UpdateVisualMenuOffset(); gMain.state++; break;
    case 11: DrawMoveInfoLabels(); gMain.state++; break;
    case 12: CreateTMCaseListMenuBuffers(); InitTMCaseListMenuItems(); gMain.state++; break;
    case 13: PrintTitle(); gMain.state++; break;
    case 14: {
      const taskId = tasks.create(Task_HandleListInput, 0);
      td(taskId).listTaskId = ListMenuInit(gMultiuseListMenuTemplate!, sStatic.scrollOffset, sStatic.selectedRow);
      gMain.state++;
      break;
    }
    case 15: CreateListScrollArrows(); gMain.state++; break;
    case 16: dyn().discSpriteId = CreateDiscSprite(BagGetItemIdByPocketPosition(sStatic.scrollOffset + sStatic.selectedRow)); gMain.state++; break;
    case 17: BlendPalettes(PALETTES_ALL, 16, 0); gMain.state++; break;
    case 18: BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK); gMain.state++; break;
    default:
      SetVBlankCallback(VBlankCB_Idle);
      SetMainCallback2(CB2_Idle);
      return true;
  }
  return false;
}

function LoadBGTemplates(): void {
  ResetAllBgsCoordinatesAndBgCntRegs();
  sTilemapBuffer = new Uint16Array(0x400);
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, [
    { bg: 0, charBaseIndex: 0, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 1, baseTile: 0 },
    { bg: 1, charBaseIndex: 0, mapBaseIndex: 30, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0 },
    { bg: 2, charBaseIndex: 0, mapBaseIndex: 29, screenSize: 0, paletteMode: 0, priority: 2, baseTile: 0 },
  ]);
  SetBgTilemapBuffer(2, sTilemapBuffer);
  ScheduleBgCopyTilemapToVram(1);
  ScheduleBgCopyTilemapToVram(2);
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  ShowBg(0);
  ShowBg(1);
  ShowBg(2);
}

function HandleLoadTMCaseGraphicsAndPalettes(): boolean {
  const d = dyn();
  switch (d.seqId) {
    case 0: { const gfx = incbin("gTMCase_Gfx"); LoadBgTiles(1, gfx, gfx.length, 0); d.seqId++; break; }
    case 1: sTilemapBuffer!.set(incbin16("gTMCaseMenu_Tilemap").subarray(0, 0x400)); d.seqId++; break;
    case 2: GetBgTilemapBuffer(1)?.set(incbin16("gTMCase_Tilemap").subarray(0, 0x400)); d.seqId++; break;
    case 3: LoadPalette(incbin(save.playerGender === C.MALE ? "gTMCaseMenu_Male_Pal" : "gTMCaseMenu_Female_Pal"), BG_PLTT_ID(0), 4 * 32); d.seqId++; break;
    case 4: LoadSpriteSheet({ data: incbin("gTMCaseDisc_Gfx"), size: 0x400, tag: TAG_DISC }); d.seqId++; break;
    default:
      LoadDiscTypePalettes();
      d.seqId = 0;
      return true;
  }
  return false;
}

/** item.c SortPocketAndPlaceHMsFirst: sort by item id, then move the HMs to the front. */
function SortPocketAndPlaceHMsFirst(): void {
  const slots = tmSlots();
  for (let i = slots.length - 1; i >= 0; i--) if (!slots[i].item || slots[i].quantity <= 0) slots.splice(i, 1);
  slots.sort((a, b) => a.item - b.item);
  const hms = slots.filter((s) => s.item >= C.ITEM_HM01);
  const tms = slots.filter((s) => s.item < C.ITEM_HM01);
  slots.splice(0, slots.length, ...hms, ...tms);
}

/** CreateTMCaseListMenuBuffers: JS arrays replace the C heap allocations. */
function CreateTMCaseListMenuBuffers(): void {
  sListMenuItemsBuffer = new Array<ListMenuItem>(dyn().numTMs + 1);
  sListMenuStringsBuffer = new Array<Uint8Array>(dyn().numTMs);
}

function InitTMCaseListMenuItems(): void {
  const d = dyn();
  const items = sListMenuItemsBuffer!;
  for (let i = 0; i < d.numTMs; i++) {
    const label = GetTMNumberAndMoveString(tmSlots()[i].item);
    sListMenuStringsBuffer![i] = label;
    items[i] = { label, index: i };
  }
  items[d.numTMs] = { label: text("gText_Close"), index: LIST_CANCEL };
  gMultiuseListMenuTemplate = listMenuTemplate({
    items, totalItems: d.numTMs + 1, windowId: WIN_LIST, header_X: 0, item_X: 8, cursor_X: 0, lettersSpacing: 0, itemVerticalPadding: 2, upText_Y: 2,
    maxShowed: d.maxTMsShown, fontId: FONT_NORMAL, cursorPal: 2, fillValue: 0, cursorShadowPal: 3, moveCursorFunc: List_MoveCursorFunc,
    itemPrintFunc: List_ItemPrintFunc, cursorKind: 0, scrollMultiple: LIST_NO_MULTIPLE_SCROLL,
  });
}

/** GetTMNumberAndMoveString: "No.01 MOVE" (HMs indented with a CLEAR_TO 18). */
function GetTMNumberAndMoveString(itemId: number): Uint8Array {
  const clearTo18 = [0xfc, 0x13, 18];
  const parts: ArrayLike<number>[] = [text("gText_FontSmall")];
  if (itemId >= C.ITEM_HM01) {
    parts.push(Uint8Array.from([...clearTo18, 0xff]), text("gText_NumberClear01"), intToDecimal(itemId - C.ITEM_HM01 + 1, STR_CONV_MODE_LEADING_ZEROS, 1));
  } else {
    parts.push(text("gText_NumberClear01"), intToDecimal(itemId - C.ITEM_TM01 + 1, STR_CONV_MODE_LEADING_ZEROS, 2));
  }
  parts.push(Uint8Array.of(0x00, 0xff), text("gText_FontNormal"), rom.moveName(tmhmMove(itemId)));
  return cat(...parts);
}

function List_MoveCursorFunc(itemIndex: number, onInit: boolean): void {
  const itemId = itemIndex === LIST_CANCEL ? C.ITEM_NONE : BagGetItemIdByPocketPosition(itemIndex);
  if (!onInit) {
    sound.playSE(C.SE_SELECT);
    SwapDisc(dyn().discSpriteId, itemId);
  }
  PrintDescription(itemIndex);
  PrintMoveInfo(itemId);
}

function List_ItemPrintFunc(windowId: number, itemIndex: number, y: number): void {
  if (itemIndex === LIST_CANCEL) return;
  if (!IS_HM(BagGetItemIdByPocketPosition(itemIndex))) {
    stringVars.var1 = intToDecimal(BagGetQuantityByPocketPosition(itemIndex), STR_CONV_MODE_RIGHT_ALIGN, 3);
    stringVars.var4 = expandPlaceholders(text("gText_TimesStrVar1"));
    TMCase_Print(windowId, FONT_SMALL, stringVars.var4, 126, y, 0, 0, 0xff, COLOR_DARK);
  } else {
    PlaceHMTileInWindow(windowId, 8, y);
  }
}

function PrintDescription(itemIndex: number): void {
  const str = itemIndex !== LIST_CANCEL ? b64(itemInfo(BagGetItemIdByPocketPosition(itemIndex))!.description) : text("gText_TMCaseWillBePutAway");
  FillWindowPixelBuffer(WIN_DESCRIPTION, 0);
  TMCase_Print(WIN_DESCRIPTION, FONT_NORMAL, str, 2, 3, 1, 0, 0, COLOR_LIGHT);
}

function SetDescriptionWindowShade(shade: number): void {
  SetBgTilemapPalette(2, 0, 12, 30, 8, 2 * shade + 1);
  ScheduleBgCopyTilemapToVram(2);
}

function PrintListCursor(listTaskId: number, colorIdx: number): void {
  PrintListCursorAtRow(ListMenuGetYCoordForPrintingArrowCursor(listTaskId), colorIdx);
}

function PrintListCursorAtRow(y: number, colorIdx: number): void {
  if (colorIdx === COLOR_CURSOR_ERASE) {
    FillWindowPixelRect(WIN_LIST, 0, 0, y, GetMenuCursorDimensionByFont(FONT_NORMAL, 0), GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT));
    CopyWindowToVram(WIN_LIST, COPYWIN_GFX);
  } else {
    TMCase_Print(WIN_LIST, FONT_NORMAL, text("gText_SelectorArrow2"), 0, y, 0, 0, 0, colorIdx);
  }
}

function CreateListScrollArrows(): void {
  const d = dyn();
  d.scrollArrowsTaskId = AddScrollIndicatorArrowPairParameterized(SCROLL_ARROW_UP, 160, 8, 88, d.numTMs - d.maxTMsShown + 1, TAG_SCROLL_ARROW, TAG_SCROLL_ARROW,
    () => sStatic.scrollOffset);
}

function CreateQuantityScrollArrows(): void {
  const d = dyn();
  d.currItem = 1;
  d.scrollArrowsTaskId = AddScrollIndicatorArrowPairParameterized(SCROLL_ARROW_UP, 152, 72, 104, 2, TAG_SCROLL_ARROW, TAG_SCROLL_ARROW, () => d.currItem);
}

function RemoveScrollArrows(): void {
  const d = dyn();
  if (d.scrollArrowsTaskId !== TASK_NONE) {
    RemoveScrollIndicatorArrowPair(d.scrollArrowsTaskId);
    d.scrollArrowsTaskId = TASK_NONE;
  }
}

export function ResetTMCaseCursorPos(): void {
  sStatic.selectedRow = 0;
  sStatic.scrollOffset = 0;
}

/**
 * Adapted tm_case.c Pokedude_InitTMCase: expose its four temporary sample TMs,
 * then restore the player's TM/key-item pockets when the case returns.
 * The source's timed narration/forced cursor tour is still not emulated.
 */
export function Pokedude_InitTMCase(done: () => void): void {
  const tmBackup = save.bag.tmCase.map((slot) => ({ ...slot }));
  const keyItemsBackup = save.bag.keyItems.map((slot) => ({ ...slot }));
  const selectedRow = sStatic.selectedRow, scrollOffset = sStatic.scrollOffset;
  save.bag.tmCase = [];
  save.bag.keyItems = [];
  ResetTMCaseCursorPos();
  addBagItem(C.ITEM_TM01, 1);
  addBagItem(C.ITEM_TM03, 1);
  addBagItem(C.ITEM_TM09, 1);
  addBagItem(C.ITEM_TM35, 1);
  InitTMCase(C.TMCASE_POKEDUDE, () => {
    save.bag.tmCase = tmBackup;
    save.bag.keyItems = keyItemsBackup;
    sStatic.selectedRow = selectedRow;
    sStatic.scrollOffset = scrollOffset;
    done();
  }, false);
}

function TMCaseSetup_GetTMCount(): void {
  const slots = tmSlots();
  BagPocketCompaction(slots);
  const firstEmpty = slots.findIndex((slot) => slot.item === C.ITEM_NONE);
  dyn().numTMs = firstEmpty === -1 ? slots.length : firstEmpty;
  dyn().maxTMsShown = Math.min(dyn().numTMs + 1, 5);
}

function TMCaseSetup_InitListMenuPositions(): void {
  const d = dyn();
  if (sStatic.scrollOffset !== 0 && sStatic.scrollOffset + d.maxTMsShown > d.numTMs + 1) sStatic.scrollOffset = d.numTMs + 1 - d.maxTMsShown;
  if (sStatic.scrollOffset + sStatic.selectedRow >= d.numTMs + 1) sStatic.selectedRow = d.numTMs + 1 < 2 ? 0 : d.numTMs;
}

function TMCaseSetup_UpdateVisualMenuOffset(): void {
  const d = dyn();
  if (sStatic.selectedRow > 3) {
    for (let i = 0; i <= sStatic.selectedRow - 3 && sStatic.scrollOffset + d.maxTMsShown !== d.numTMs + 1; i++) {
      sStatic.selectedRow--;
      sStatic.scrollOffset++;
    }
  }
}

function DestroyTMCaseBuffers(): void {
  sDyn = null;
  sTilemapBuffer = null;
  sListMenuItemsBuffer = null;
  sListMenuStringsBuffer = null;
  sTMSpritePaletteBuffer = null;
  gMultiuseListMenuTemplate = null;
  FreeAllWindowBuffers();
}

function Task_BeginFadeOutFromTMCase(taskId: number): void {
  BeginNormalPaletteFade(PALETTES_ALL, -2, 0, 16, RGB_BLACK);
  tasks.setFunc(taskId, Task_FadeOutAndCloseTMCase);
}

function Task_FadeOutAndCloseTMCase(taskId: number): void {
  if (gPaletteFade.active) return;
  const pos = DestroyListMenuTask(td(taskId).listTaskId);
  sStatic.scrollOffset = pos.cursorPos;
  sStatic.selectedRow = pos.itemsAbove;
  const cb = dyn().nextScreenCallback ?? sStatic.exitCallback;
  RemoveScrollArrows();
  DestroyTMCaseBuffers();
  tasks.destroy(taskId);
  taskData.delete(taskId);
  SetVBlankCallback(null);
  SetMainCallback2(null);
  cb?.();
}

function Task_HandleListInput(taskId: number): void {
  const data = td(taskId);
  if (gPaletteFade.active) return;
  const input = ListMenu_ProcessInput(data.listTaskId);
  const pos = ListMenuGetScrollAndRow(data.listTaskId);
  sStatic.scrollOffset = pos.cursorPos;
  sStatic.selectedRow = pos.itemsAbove;
  if (joy.newKeys & SELECT_BUTTON && sStatic.allowSelectClose) {
    sound.playSE(C.SE_SELECT);
    bagResult.itemId = C.ITEM_NONE;
    Task_BeginFadeOutFromTMCase(taskId);
    return;
  }
  switch (input) {
    case LIST_NOTHING_CHOSEN: break;
    case LIST_CANCEL:
      sound.playSE(C.SE_SELECT);
      bagResult.itemId = C.ITEM_NONE;
      Task_BeginFadeOutFromTMCase(taskId);
      break;
    default:
      sound.playSE(C.SE_SELECT);
      SetDescriptionWindowShade(1);
      RemoveScrollArrows();
      PrintListCursor(data.listTaskId, COLOR_CURSOR_SELECTED);
      data.selection = input;
      data.quantityOwned = BagGetQuantityByPocketPosition(input);
      bagResult.itemId = BagGetItemIdByPocketPosition(input);
      switch (sStatic.menuType) {
        case C.TMCASE_GIVE_PARTY: tasks.setFunc(taskId, Task_SelectedTMHM_GiveParty); break;
        case C.TMCASE_SELL: tasks.setFunc(taskId, Task_SelectedTMHM_Sell); break;
        case C.TMCASE_GIVE_PC: tasks.setFunc(taskId, Task_SelectedTMHM_GivePC); break;
        default: tasks.setFunc(taskId, Task_SelectedTMHM_Field); break;
      }
      break;
  }
}

function ReturnToList(taskId: number): void {
  SetDescriptionWindowShade(0);
  CreateListScrollArrows();
  tasks.setFunc(taskId, Task_HandleListInput);
}

function Task_SelectedTMHM_Field(taskId: number): void {
  const d = dyn();
  TMCase_SetWindowBorder2(WIN_SELECTED_MSG);
  d.contextMenuWindowId = AddContextMenu(d.contextMenuWindowId, WIN_USE_GIVE_EXIT);
  d.menuActionIndices = sMenuActionIndices_Field;
  d.numMenuActions = sMenuActionIndices_Field.length;
  AddItemMenuActionTextPrinters(d.contextMenuWindowId, FONT_NORMAL, GetMenuCursorDimensionByFont(FONT_NORMAL, 0), 2, 0,
    GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT) + 2, d.numMenuActions, sMenuActions, d.menuActionIndices);
  Menu_InitCursor(d.contextMenuWindowId, FONT_NORMAL, 0, 2, GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT) + 2, d.numMenuActions, 0);
  // Label: the TM string plus gText_Var1IsSelected without its leading {STR_VAR_1}.
  const selected = text("gText_Var1IsSelected");
  const strbuf = cat(GetTMNumberAndMoveString(bagResult.itemId), selected.subarray(2));
  TMCase_Print(WIN_SELECTED_MSG, FONT_NORMAL, strbuf, 0, 2, 1, 0, 0, COLOR_DARK);
  if (IS_HM(bagResult.itemId)) {
    PlaceHMTileInWindow(WIN_SELECTED_MSG, 0, 2);
    CopyWindowToVram(WIN_SELECTED_MSG, COPYWIN_GFX);
  }
  ScheduleBgCopyTilemapToVram(0);
  ScheduleBgCopyTilemapToVram(1);
  tasks.setFunc(taskId, Task_ContextMenu_HandleInput);
}

function runAction(action: number, taskId: number): void {
  if (action === ACTION_USE) Action_Use(taskId);
  else if (action === ACTION_GIVE) Action_Give(taskId);
  else Action_Exit(taskId);
}

function Task_ContextMenu_HandleInput(taskId: number): void {
  const d = dyn();
  const input = Menu_ProcessInputNoWrapAround();
  switch (input) {
    case MENU_B_PRESSED: sound.playSE(C.SE_SELECT); runAction(d.menuActionIndices[d.numMenuActions - 1], taskId); break;
    case MENU_NOTHING_CHOSEN: break;
    default: sound.playSE(C.SE_SELECT); runAction(d.menuActionIndices[input], taskId); break;
  }
}

function closeSelectedMsg(): void {
  const d = dyn();
  d.contextMenuWindowId = RemoveContextMenu(d.contextMenuWindowId);
  ClearStdWindowAndFrameToTransparent(WIN_SELECTED_MSG, false);
  ClearWindowTilemap(WIN_SELECTED_MSG);
}

function Action_Use(taskId: number): void {
  closeSelectedMsg();
  PutWindowTilemap(WIN_LIST);
  ScheduleBgCopyTilemapToVram(0);
  ScheduleBgCopyTilemapToVram(1);
  if (save.party.length === 0) {
    PrintError_ThereIsNoPokemon(taskId);
  } else {
    const item = bagResult.itemId;
    dyn().nextScreenCallback = () => sHandlers.useOnMon ? sHandlers.useOnMon(item) : sStatic.exitCallback?.();
    Task_BeginFadeOutFromTMCase(taskId);
  }
}

function Action_Give(taskId: number): void {
  const itemId = BagGetItemIdByPocketPosition(td(taskId).selection);
  closeSelectedMsg();
  PutWindowTilemap(WIN_DESCRIPTION);
  PutWindowTilemap(WIN_MOVE_INFO_LABELS);
  PutWindowTilemap(WIN_MOVE_INFO);
  ScheduleBgCopyTilemapToVram(0);
  ScheduleBgCopyTilemapToVram(1);
  if (IS_HM(itemId)) { PrintError_ItemCantBeHeld(taskId); return; }
  if (save.party.length === 0) { PrintError_ThereIsNoPokemon(taskId); return; }
  dyn().nextScreenCallback = () => sHandlers.giveToMon ? sHandlers.giveToMon(itemId) : sStatic.exitCallback?.();
  Task_BeginFadeOutFromTMCase(taskId);
}

function PrintError_ThereIsNoPokemon(taskId: number): void {
  PrintMessageWithFollowupTask(taskId, FONT_NORMAL, text("gText_ThereIsNoPokemon"), Task_WaitButtonAfterErrorPrint);
}

function PrintError_ItemCantBeHeld(taskId: number): void {
  stringVars.var1 = CopyItemName(bagResult.itemId);
  stringVars.var4 = expandPlaceholders(text("gText_ItemCantBeHeld"));
  PrintMessageWithFollowupTask(taskId, FONT_NORMAL, stringVars.var4, Task_WaitButtonAfterErrorPrint);
}

function Task_WaitButtonAfterErrorPrint(taskId: number): void {
  if (joy.newKeys & A_BUTTON) {
    sound.playSE(C.SE_SELECT);
    CloseMessageAndReturnToList(taskId);
  }
}

function CloseMessageAndReturnToList(taskId: number): void {
  const data = td(taskId);
  const pos = DestroyListMenuTask(data.listTaskId);
  sStatic.scrollOffset = pos.cursorPos;
  sStatic.selectedRow = pos.itemsAbove;
  data.listTaskId = ListMenuInit(gMultiuseListMenuTemplate!, sStatic.scrollOffset, sStatic.selectedRow);
  PrintListCursor(data.listTaskId, COLOR_DARK);
  ClearDialogWindowAndFrameToTransparent(WIN_MESSAGE, false);
  ClearWindowTilemap(WIN_MESSAGE);
  PutWindowTilemap(WIN_DESCRIPTION);
  PutWindowTilemap(WIN_MOVE_INFO_LABELS);
  PutWindowTilemap(WIN_MOVE_INFO);
  ScheduleBgCopyTilemapToVram(0);
  ScheduleBgCopyTilemapToVram(1);
  ReturnToList(taskId);
}

function Action_Exit(taskId: number): void {
  closeSelectedMsg();
  PutWindowTilemap(WIN_LIST);
  PrintListCursor(td(taskId).listTaskId, COLOR_DARK);
  PutWindowTilemap(WIN_DESCRIPTION);
  PutWindowTilemap(WIN_MOVE_INFO_LABELS);
  PutWindowTilemap(WIN_MOVE_INFO);
  ScheduleBgCopyTilemapToVram(0);
  ScheduleBgCopyTilemapToVram(1);
  ReturnToList(taskId);
}

function Task_SelectedTMHM_GiveParty(taskId: number): void {
  const itemId = BagGetItemIdByPocketPosition(td(taskId).selection);
  if (IS_HM(itemId)) { PrintError_ItemCantBeHeld(taskId); return; }
  dyn().nextScreenCallback = () => sHandlers.giveParty ? sHandlers.giveParty(itemId) : sStatic.exitCallback?.();
  Task_BeginFadeOutFromTMCase(taskId);
}

function Task_SelectedTMHM_GivePC(taskId: number): void {
  const itemId = BagGetItemIdByPocketPosition(td(taskId).selection);
  if (IS_HM(itemId)) { PrintError_ItemCantBeHeld(taskId); return; }
  dyn().nextScreenCallback = () => sHandlers.givePc ? sHandlers.givePc(itemId) : sStatic.exitCallback?.();
  Task_BeginFadeOutFromTMCase(taskId);
}

const salePrice = (taskId: number): number =>
  Math.floor((itemInfo(BagGetItemIdByPocketPosition(td(taskId).selection))?.price ?? 0) / 2) * td(taskId).quantitySelected.value;

function Task_SelectedTMHM_Sell(taskId: number): void {
  const data = td(taskId);
  if ((itemInfo(bagResult.itemId)?.price ?? 0) === 0) {
    stringVars.var1 = CopyItemName(bagResult.itemId);
    stringVars.var4 = expandPlaceholders(text("gText_OhNoICantBuyThat"));
    PrintMessageWithFollowupTask(taskId, GetDialogBoxFontId(), stringVars.var4, CloseMessageAndReturnToList);
    return;
  }
  data.quantitySelected.value = 1;
  if (data.quantityOwned === 1) {
    PrintPlayersMoney();
    Task_AskConfirmSaleWithAmount(taskId);
  } else {
    if (data.quantityOwned > 99) data.quantityOwned = 99;
    stringVars.var1 = CopyItemName(bagResult.itemId);
    stringVars.var4 = expandPlaceholders(text("gText_HowManyWouldYouLikeToSell"));
    PrintMessageWithFollowupTask(taskId, GetDialogBoxFontId(), stringVars.var4, Task_InitQuantitySelectUI);
  }
}

const sYesNoFuncTable: YesNoFuncTable = { yesFunc: (t) => Task_PrintSaleConfirmedText(t), noFunc: (t) => Task_SaleOfTMsCanceled(t) };

function Task_AskConfirmSaleWithAmount(taskId: number): void {
  stringVars.var3 = intToDecimal(salePrice(taskId), STR_CONV_MODE_LEFT_ALIGN, 6);
  stringVars.var4 = expandPlaceholders(text("gText_ICanPayThisMuch_WouldThatBeOkay"));
  PrintMessageWithFollowupTask(taskId, GetDialogBoxFontId(), stringVars.var4, Task_PlaceYesNoBox);
}

function Task_PlaceYesNoBox(taskId: number): void {
  HandleCreateYesNoMenu(taskId, sYesNoFuncTable);
}

function HandleCreateYesNoMenu(taskId: number, callbacks: YesNoFuncTable): void {
  CreateYesNoMenuWithCallbacks(taskId, sYesNoWindowTemplate, FONT_NORMAL, 0, 2, 91, 14, callbacks);
}

function Task_SaleOfTMsCanceled(taskId: number): void {
  ClearStdWindowAndFrameToTransparent(WIN_MONEY, false);
  ClearDialogWindowAndFrameToTransparent(WIN_MESSAGE, false);
  for (const w of [WIN_LIST, WIN_DESCRIPTION, WIN_TITLE, WIN_MOVE_INFO_LABELS, WIN_MOVE_INFO]) PutWindowTilemap(w);
  ScheduleBgCopyTilemapToVram(0);
  ScheduleBgCopyTilemapToVram(1);
  PrintListCursor(td(taskId).listTaskId, COLOR_DARK);
  ReturnToList(taskId);
}

function Task_InitQuantitySelectUI(taskId: number): void {
  TMCase_SetWindowBorder1(WIN_SELL_QUANTITY);
  stringVars.var1 = intToDecimal(1, STR_CONV_MODE_LEADING_ZEROS, 2);
  stringVars.var4 = expandPlaceholders(text("gText_TimesStrVar1"));
  TMCase_Print(WIN_SELL_QUANTITY, FONT_SMALL, stringVars.var4, 4, 10, 1, 0, 0, COLOR_DARK);
  SellTM_PrintQuantityAndSalePrice(1, salePrice(taskId));
  PrintPlayersMoney();
  CreateQuantityScrollArrows();
  ScheduleBgCopyTilemapToVram(0);
  ScheduleBgCopyTilemapToVram(1);
  tasks.setFunc(taskId, Task_QuantitySelect_HandleInput);
}

function SellTM_PrintQuantityAndSalePrice(quantity: number, amount: number): void {
  FillWindowPixelBuffer(WIN_SELL_QUANTITY, 0x11);
  stringVars.var1 = intToDecimal(quantity, STR_CONV_MODE_LEADING_ZEROS, 2);
  stringVars.var4 = expandPlaceholders(text("gText_TimesStrVar1"));
  TMCase_Print(WIN_SELL_QUANTITY, FONT_SMALL, stringVars.var4, 4, 10, 1, 0, 0, COLOR_DARK);
  PrintMoneyAmount(WIN_SELL_QUANTITY, 0x38, 0x0a, amount, 0);
}

function Task_QuantitySelect_HandleInput(taskId: number): void {
  const data = td(taskId);
  if (AdjustQuantityAccordingToDPadInput(data.quantitySelected, data.quantityOwned)) {
    SellTM_PrintQuantityAndSalePrice(data.quantitySelected.value, salePrice(taskId));
  } else if (joy.newKeys & A_BUTTON) {
    sound.playSE(C.SE_SELECT);
    ClearStdWindowAndFrameToTransparent(WIN_SELL_QUANTITY, false);
    ScheduleBgCopyTilemapToVram(0);
    ScheduleBgCopyTilemapToVram(1);
    RemoveScrollArrows();
    Task_AskConfirmSaleWithAmount(taskId);
  } else if (joy.newKeys & B_BUTTON) {
    sound.playSE(C.SE_SELECT);
    ClearStdWindowAndFrameToTransparent(WIN_SELL_QUANTITY, false);
    ClearStdWindowAndFrameToTransparent(WIN_MONEY, false);
    ClearDialogWindowAndFrameToTransparent(WIN_MESSAGE, false);
    PutWindowTilemap(WIN_TITLE);
    PutWindowTilemap(WIN_LIST);
    PutWindowTilemap(WIN_DESCRIPTION);
    ScheduleBgCopyTilemapToVram(0);
    ScheduleBgCopyTilemapToVram(1);
    RemoveScrollArrows();
    PrintListCursor(data.listTaskId, COLOR_DARK);
    ReturnToList(taskId);
  }
}

function Task_PrintSaleConfirmedText(taskId: number): void {
  PutWindowTilemap(WIN_LIST);
  ScheduleBgCopyTilemapToVram(0);
  stringVars.var1 = CopyItemName(bagResult.itemId);
  stringVars.var3 = intToDecimal(salePrice(taskId), STR_CONV_MODE_LEFT_ALIGN, 6);
  stringVars.var4 = expandPlaceholders(text("gText_TurnedOverItemsWorthYen"));
  PrintMessageWithFollowupTask(taskId, FONT_NORMAL, stringVars.var4, Task_DoSaleOfTMs);
}

function Task_DoSaleOfTMs(taskId: number): void {
  const data = td(taskId);
  sound.playSE(C.SE_SHOP);
  const price = Math.floor((itemInfo(bagResult.itemId)?.price ?? 0) / 2) * data.quantitySelected.value;
  removeBagItem(bagResult.itemId, data.quantitySelected.value);
  addMoney(price);
  const pos = DestroyListMenuTask(data.listTaskId);
  sStatic.scrollOffset = pos.cursorPos;
  sStatic.selectedRow = pos.itemsAbove;
  TMCaseSetup_GetTMCount();
  TMCaseSetup_InitListMenuPositions();
  InitTMCaseListMenuItems();
  data.listTaskId = ListMenuInit(gMultiuseListMenuTemplate!, sStatic.scrollOffset, sStatic.selectedRow);
  PrintListCursor(data.listTaskId, COLOR_CURSOR_SELECTED);
  PrintMoneyAmountInMoneyBox(WIN_MONEY, save.money, 0);
  tasks.setFunc(taskId, Task_AfterSale_ReturnToList);
}

function Task_AfterSale_ReturnToList(taskId: number): void {
  if (joy.newKeys & (A_BUTTON | B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    ClearStdWindowAndFrameToTransparent(WIN_MONEY, false);
    ClearDialogWindowAndFrameToTransparent(WIN_MESSAGE, false);
    PutWindowTilemap(WIN_DESCRIPTION);
    PutWindowTilemap(WIN_TITLE);
    PutWindowTilemap(WIN_MOVE_INFO_LABELS);
    PutWindowTilemap(WIN_MOVE_INFO);
    CloseMessageAndReturnToList(taskId);
  }
}

function InitWindowTemplatesAndPals(): void {
  InitWindows(sWindowTemplates);
  DeactivateAllTextPrinters();
  LoadUserWindowGfx(0, 0x5b, BG_PLTT_ID(14), save.options.frameType);
  LoadMenuMessageWindowGfx(0, 0x64, BG_PLTT_ID(11));
  LoadStdWindowGfx(0, 0x78, BG_PLTT_ID(13));
  LoadPalette(incbin("gStandardMenuPalette"), BG_PLTT_ID(15), 32);
  LoadPalette(incbin("gStandardMenuPalette"), BG_PLTT_ID(10), 32);
  LoadPalette(sPal3Override, BG_PLTT_ID(15) + 6, 4);
  LoadPalette(sPal3Override, BG_PLTT_ID(13) + 6, 4);
  ListMenuLoadStdPalAt(BG_PLTT_ID(12), 1);
  for (let i = 0; i < sWindowTemplates.length - 1; i++) FillWindowPixelBuffer(i, 0x00);
  for (const w of [WIN_LIST, WIN_DESCRIPTION, WIN_TITLE, WIN_MOVE_INFO_LABELS, WIN_MOVE_INFO]) PutWindowTilemap(w);
  ScheduleBgCopyTilemapToVram(0);
}

function TMCase_Print(windowId: number, fontId: number, str: ArrayLike<number>, x: number, y: number, letterSpacing: number, lineSpacing: number, speed: number, colorIdx: number): void {
  AddTextPrinterParameterized4(windowId, fontId, x, y, letterSpacing, lineSpacing, sTextColors[colorIdx], speed, str);
}

function TMCase_SetWindowBorder1(windowId: number): void { DrawStdFrameWithCustomTileAndPalette(windowId, false, 0x5b, 14); }
function TMCase_SetWindowBorder2(windowId: number): void { DrawStdFrameWithCustomTileAndPalette(windowId, false, 0x78, 13); }

function PrintMessageWithFollowupTask(taskId: number, fontId: number, str: ArrayLike<number>, func: TaskFunc): void {
  DisplayMessageAndContinueTask(taskId, WIN_MESSAGE, 0x64, 0x0b, fontId, getTextSpeedSetting(), str, func);
  ScheduleBgCopyTilemapToVram(1);
}

function PrintTitle(): void {
  const title = text("gText_TMCase");
  const distance = 72 - stringWidth(FONT_NORMAL_COPY_1, title, 0);
  AddTextPrinterParameterized3(WIN_TITLE, FONT_NORMAL_COPY_1, Math.floor(distance / 2), 1, sTextColors[COLOR_LIGHT], 0, title);
}

function DrawMoveInfoLabels(): void {
  BlitMenuInfoIcon(WIN_MOVE_INFO_LABELS, C.MENU_INFO_ICON_TYPE, 0, 0);
  BlitMenuInfoIcon(WIN_MOVE_INFO_LABELS, C.MENU_INFO_ICON_POWER, 0, 12);
  BlitMenuInfoIcon(WIN_MOVE_INFO_LABELS, C.MENU_INFO_ICON_ACCURACY, 0, 24);
  BlitMenuInfoIcon(WIN_MOVE_INFO_LABELS, C.MENU_INFO_ICON_PP, 0, 36);
  CopyWindowToVram(WIN_MOVE_INFO_LABELS, COPYWIN_GFX);
}

function PrintMoveInfo(itemId: number): void {
  FillWindowPixelRect(WIN_MOVE_INFO, 0, 0, 0, 40, 48);
  const hyphens = text("gText_ThreeHyphens");
  if (itemId === C.ITEM_NONE) {
    for (let i = 0; i < 4; i++) TMCase_Print(WIN_MOVE_INFO, FONT_NORMAL_COPY_2, hyphens, 7, 12 * i, 0, 0, 0xff, COLOR_MOVE_INFO);
    CopyWindowToVram(WIN_MOVE_INFO, COPYWIN_GFX);
    return;
  }
  const move = moveOf(itemId);
  BlitMenuInfoIcon(WIN_MOVE_INFO, move.type + 1, 0, 0);
  TMCase_Print(WIN_MOVE_INFO, FONT_NORMAL_COPY_2, move.power < 2 ? hyphens : intToDecimal(move.power, STR_CONV_MODE_RIGHT_ALIGN, 3), 7, 12, 0, 0, 0xff, COLOR_MOVE_INFO);
  TMCase_Print(WIN_MOVE_INFO, FONT_NORMAL_COPY_2, move.accuracy === 0 ? hyphens : intToDecimal(move.accuracy, STR_CONV_MODE_RIGHT_ALIGN, 3), 7, 24, 0, 0, 0xff, COLOR_MOVE_INFO);
  TMCase_Print(WIN_MOVE_INFO, FONT_NORMAL_COPY_2, intToDecimal(move.pp, STR_CONV_MODE_RIGHT_ALIGN, 3), 7, 36, 0, 0, 0xff, COLOR_MOVE_INFO);
  CopyWindowToVram(WIN_MOVE_INFO, COPYWIN_GFX);
}

function PlaceHMTileInWindow(windowId: number, x: number, y: number): void {
  BlitBitmapToWindow(windowId, incbin("gTMCaseHM_Gfx"), x, y, 16, 12);
}

function PrintPlayersMoney(): void {
  PrintMoneyAmountInMoneyBoxWithBorder(WIN_MONEY, 120, 13, save.money);
}

function AddContextMenu(windowId: number, windowIndex: number): number {
  if (windowId === WINDOW_NONE) {
    windowId = AddWindow(sWindowTemplates_ContextMenu[windowIndex]);
    TMCase_SetWindowBorder1(windowId);
    ScheduleBgCopyTilemapToVram(0);
  }
  return windowId;
}

function RemoveContextMenu(windowId: number): number {
  ClearStdWindowAndFrameToTransparent(windowId, false);
  ClearWindowTilemap(windowId);
  RemoveWindow(windowId);
  ScheduleBgCopyTilemapToVram(0);
  return WINDOW_NONE;
}

function CreateDiscSprite(itemId: number): number {
  const spriteId = CreateSprite(sSpriteTemplate_Disc, DISC_BASE_X, DISC_BASE_Y, 0);
  if (itemId === C.ITEM_NONE) {
    SetDiscSpritePosition(gSprites[spriteId], DISC_HIDDEN);
    return spriteId;
  }
  const tmIdx = itemId - C.ITEM_TM01;
  SetDiscSpriteAnim(gSprites[spriteId], tmIdx);
  TintDiscpriteByType(moveOf(itemId).type);
  SetDiscSpritePosition(gSprites[spriteId], tmIdx);
  return spriteId;
}

function SetDiscSpriteAnim(sprite: Sprite, tmIdx: number): void {
  StartSpriteAnim(sprite, tmIdx >= C.NUM_TECHNICAL_MACHINES ? ANIM_HM : ANIM_TM);
}

function TintDiscpriteByType(type: number): void {
  const palOffset = PLTT_ID(IndexOfSpritePaletteTag(TAG_DISC));
  const offset = sTMSpritePaletteOffsetByType[type] ?? 0;
  LoadPalette(sTMSpritePaletteBuffer!.subarray(offset, offset + 16), OBJ_PLTT_OFFSET + palOffset, 32);
}

function SetDiscSpritePosition(sprite: Sprite, tmIdx: number): void {
  let x: number, y: number;
  if (tmIdx === DISC_HIDDEN) {
    x = 27;
    y = 54;
    sprite.y2 = DISC_CASE_DISTANCE;
  } else {
    if (tmIdx >= C.NUM_TECHNICAL_MACHINES) tmIdx -= C.NUM_TECHNICAL_MACHINES;
    else tmIdx += C.NUM_HIDDEN_MACHINES;
    const total = C.NUM_TECHNICAL_MACHINES + C.NUM_HIDDEN_MACHINES;
    x = DISC_BASE_X - (Math.trunc(((14 * tmIdx) << 8) / total) >> 8);
    y = DISC_BASE_Y + (Math.trunc(((8 * tmIdx) << 8) / total) >> 8);
  }
  sprite.x = x;
  sprite.y = y;
}

function SwapDisc(spriteId: number, itemId: number): void {
  const s = gSprites[spriteId];
  s.data[0] = itemId;
  s.data[1] = 0;
  s.callback = SpriteCB_SwapDisc;
}

function SpriteCB_SwapDisc(sprite: Sprite): void {
  switch (sprite.data[1]) {
    case 0:
      // Lower the old disc back into the case, then set up the new one.
      if (sprite.y2 >= DISC_CASE_DISTANCE) {
        if (sprite.data[0] !== C.ITEM_NONE) {
          sprite.data[1]++;
          TintDiscpriteByType(moveOf(sprite.data[0]).type);
          sprite.data[0] -= C.ITEM_TM01;
          SetDiscSpriteAnim(sprite, sprite.data[0]);
          SetDiscSpritePosition(sprite, sprite.data[0]);
        } else {
          sprite.callback = SpriteCallbackDummy;
        }
      } else {
        sprite.y2 += DISC_Y_MOVE;
      }
      break;
    case 1:
      // Raise the new disc out of the case.
      if (sprite.y2 <= 0) sprite.callback = SpriteCallbackDummy;
      else sprite.y2 -= DISC_Y_MOVE;
      break;
  }
}

function LoadDiscTypePalettes(): void {
  sTMSpritePaletteBuffer = new Uint16Array(NUM_DISC_COLORS + 16);
  sTMSpritePaletteBuffer.set(incbin16("gTMCaseDiscTypes1_Pal").subarray(0, 0x100));
  sTMSpritePaletteBuffer.set(incbin16("gTMCaseDiscTypes2_Pal").subarray(0, 16), 0x100);
  // The source loads the 16 colors just past the table (never initialized); the first tint replaces them.
  LoadSpritePalette({ data: sTMSpritePaletteBuffer.subarray(NUM_DISC_COLORS, NUM_DISC_COLORS + 16), tag: TAG_DISC });
}
