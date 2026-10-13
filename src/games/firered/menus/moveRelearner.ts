// Port of learn_move.c: the Move Relearner interface (Two Island) and move learning.
// MoveRelearnerLoadBgGfx / MoveRelearnerInitListMenuBuffersEtc / MoveRelearnerStateMachine
// Uses the exported C templates, window definitions, and graphics.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { expandPlaceholders, intToDecimal, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "../gba/charmap";
import { FONT_NORMAL, FONT_NORMAL_COPY_2 } from "../gba/font";
import { TEXT_SKIP_DRAW } from "../gba/textPrinter";
import { incbin, incbin16, cdata, loadCData, preloadPacks, symName } from "../hw/assets";
import { CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer, FillBgTilemapBufferRect, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate } from "../hw/bg";
import { InitGpuRegManager, SetGpuReg } from "../hw/gpu";
import { DestroyListMenuTask, ListMenu_ProcessInput, ListMenuInit, ListMenuLoadStdPalAt, BlitMenuInfoIcon, listMenuTemplate, LIST_CANCEL, LIST_NO_MULTIPLE_SCROLL, SCROLL_ARROW_UP, AddScrollIndicatorArrowPairParameterized, ListMenuGetScrollAndRow, RemoveScrollIndicatorArrowPair, StepScrollIndicatorArrowPair, type ListMenuItem, type ListMenu } from "../hw/listMenu";
import { DrawStdFrameWithCustomTileAndPalette, FONTATTR_MAX_LETTER_HEIGHT, GetFontAttribute, LoadUserWindowGfx } from "../hw/menu";
import { BG_PLTT_ID, LoadPalette, ResetPaletteFade, TransferPlttBuffer } from "../hw/palette";
import { DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_DISPCNT } from "../hw/ppu";
import { gMain, SetMainCallback1, SetMainCallback2, SetHBlankCallback, SetVBlankCallback } from "../hw/runtime";
import { AnimateSprites, BuildOamBuffer, gSprites, LoadOam, ProcessSpriteCopyRequests, type Sprite } from "../hw/sprite";
import { AddTextPrinterParameterized3, DeactivateAllTextPrinters } from "../hw/text";
import { COPYWIN_FULL, COPYWIN_GFX, COPYWIN_MAP, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PutWindowTilemap, type WindowTemplate } from "../hw/window";
import { rom } from "../rom";
import { openHardwareMessageYesNo } from "./hardwareChoice";
import { joy, JOY_NEW, A_BUTTON, B_BUTTON } from "../gba/input";

const ARROW_TAG = 0x5a25;
const COLOR_LABEL = [0, 2, 3];
const COLOR_VALUE = [1, 2, 3];

export interface LearnMoveGfxResources {
  state: number;
  selectedPartyMember: number;
  selectedIndex: number;
  selectedMoveSlot: number;
  numLearnableMoves: number;
  scheduleMoveInfoUpdate: boolean;
  listMenuTaskId: number;
  listMenuScrollPos: number;
  listMenuScrollRow: number;
  scrollPositionMaybe: number;
  spriteIds: number[];
  learnableMoves: number[];
  listMenuItems: ListMenuItem[];
  scrollArrowId: number | null;
}

export let sMoveRelearner: LearnMoveGfxResources | null = null;

/** The C uses this window template for every YesNoMenu in learn_move.c. */
export function askMoveRelearnerQuestion(message: ArrayLike<number>, done: (yes: boolean) => void): void {
  openHardwareMessageYesNo(message, cdata<WindowTemplate>("learn_move", "sMoveRelearnerYesNoMenuTemplate"), done);
}

/** VBlankCB_MoveRelearner: learn_move.c */
export function VBlankCB_MoveRelearner(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

/** PrintTextOnWindow: learn_move.c */
export function PrintTextOnWindow(windowId: number, str: Uint8Array, x: number, y: number, speed: number, colorIdx: number): void {
  const color = colorIdx === 1 ? COLOR_VALUE : COLOR_LABEL;
  AddTextPrinterParameterized3(windowId, FONT_NORMAL_COPY_2, x, y, color, speed, str);
}

/** StringExpandPlaceholdersAndPrintTextOnWindow7Color2: learn_move.c */
export function StringExpandPlaceholdersAndPrintTextOnWindow7Color2(str: Uint8Array): void {
  const expanded = expandPlaceholders(str);
  PrintTextOnWindow(7, expanded, 0, 2, 0, 2);
}

/** InitMoveRelearnerStateVariables: learn_move.c */
export function InitMoveRelearnerStateVariables(): void {
  sMoveRelearner = {
    state: 0,
    selectedPartyMember: 0,
    selectedIndex: 0,
    selectedMoveSlot: 0,
    numLearnableMoves: 0,
    scheduleMoveInfoUpdate: false,
    listMenuTaskId: 0,
    listMenuScrollPos: 0,
    listMenuScrollRow: 0,
    scrollPositionMaybe: 0,
    spriteIds: [0, 0],
    learnableMoves: new Array(20).fill(0),
    listMenuItems: [],
    scrollArrowId: null,
  };
}

/** DrawTextBorderOnWindows6and7: learn_move.c */
export function DrawTextBorderOnWindows6and7(): void {
  DrawStdFrameWithCustomTileAndPalette(6, false, 1, 14);
  DrawStdFrameWithCustomTileAndPalette(7, false, 1, 14);
}

/** PrintTeachWhichMoveToStrVar1: learn_move.c */
export function PrintTeachWhichMoveToStrVar1(onInit: boolean): void {
  if (!onInit) {
    const text = expandPlaceholders(rom.text("gText_TeachWhichMoveToMon"));
    PrintTextOnWindow(7, text, 0, 2, 0, 2);
    PutWindowTilemap(7);
    CopyWindowToVram(7, COPYWIN_FULL);
  }
}

/** SpriteCB_ListMenuScrollIndicators: learn_move.c */
export function SpriteCB_ListMenuScrollIndicators(sprite: Sprite): void {
  const abcissa = ((sprite.data[1] ?? 0) * 10) & 0xff;
  if (sprite.data[0] === 1) {
    sprite.x2 = Math.sin((abcissa * Math.PI) / 128) * 3 * (sprite.data[2] ?? 1);
  } else if (sprite.data[0] === 2) {
    sprite.y2 = Math.sin((abcissa * Math.PI) / 128) * 1 * (sprite.data[2] ?? 1);
  }
  sprite.data[1] = (sprite.data[1] ?? 0) + 1;
}

/** SpawnListMenuScrollIndicatorSprites: learn_move.c */
export function SpawnListMenuScrollIndicatorSprites(): void {
  const state = sMoveRelearner;
  if (!state || state.listMenuItems.length <= 6 || state.scrollArrowId !== null) return;
  const listTaskId = state.listMenuTaskId;
  const listHeight = GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT);
  state.scrollArrowId = AddScrollIndicatorArrowPairParameterized(
    SCROLL_ARROW_UP,
    120,
    4 * 8 - 4,
    4 * 8 + 7 * (listHeight + 2) + 4,
    Math.max(0, state.listMenuItems.length - 7),
    ARROW_TAG,
    ARROW_TAG,
    () => ListMenuGetScrollAndRow(listTaskId).itemsAbove,
  );
}

/** LoadMoveInfoUI: learn_move.c */
export function LoadMoveInfoUI(): void {
  BlitMenuInfoIcon(0, C.MENU_INFO_ICON_TYPE, 1, 4);
  BlitMenuInfoIcon(1, C.MENU_INFO_ICON_POWER, 0, 4);
  BlitMenuInfoIcon(1, C.MENU_INFO_ICON_ACCURACY, 0, 19);
  BlitMenuInfoIcon(0, C.MENU_INFO_ICON_PP, 1, 19);
  BlitMenuInfoIcon(0, C.MENU_INFO_ICON_EFFECT, 1, 34);
  for (const id of [0, 1, 2, 3, 4, 5, 7]) PutWindowTilemap(id);
  CopyWindowToVram(0, COPYWIN_GFX);
  CopyWindowToVram(1, COPYWIN_GFX);
}

/** PrintMoveInfo: learn_move.c */
export function PrintMoveInfo(moveId: number): void {
  for (const id of [2, 3, 4, 5]) FillWindowPixelBuffer(id, 0);
  if (moveId > 0 && moveId < rom.moves.length) {
    const move = rom.moves[moveId];
    BlitMenuInfoIcon(2, move.type + 1, 1, 4);
    const dashes = rom.text("gText_ThreeHyphens");
    AddTextPrinterParameterized3(3, FONT_NORMAL_COPY_2, 1, 4, COLOR_VALUE, TEXT_SKIP_DRAW,
      move.power < 2 ? dashes : intToDecimal(move.power, STR_CONV_MODE_RIGHT_ALIGN, 3));
    AddTextPrinterParameterized3(3, FONT_NORMAL_COPY_2, 1, 18, COLOR_VALUE, TEXT_SKIP_DRAW,
      move.accuracy === 0 ? dashes : intToDecimal(move.accuracy, STR_CONV_MODE_RIGHT_ALIGN, 3));
    AddTextPrinterParameterized3(4, FONT_NORMAL_COPY_2, 2, 2, COLOR_VALUE, TEXT_SKIP_DRAW,
      intToDecimal(move.pp, STR_CONV_MODE_LEFT_ALIGN, 2));

    const descriptionPointers = cdata<unknown[]>("move_descriptions", "gMoveDescriptionPointers");
    const descName = symName(descriptionPointers[moveId - 1]);
    if (descName) AddTextPrinterParameterized3(5, FONT_NORMAL_COPY_2, 1, 0, COLOR_LABEL, TEXT_SKIP_DRAW, rom.text(descName));
  }
  for (const id of [2, 3, 4, 5]) { PutWindowTilemap(id); CopyWindowToVram(id, COPYWIN_GFX); }
}

/** PrintMoveInfoHandleCancel_CopyToVram: learn_move.c */
export function PrintMoveInfoHandleCancel_CopyToVram(): void {
  if (sMoveRelearner && sMoveRelearner.selectedIndex !== 0xfe) {
    PrintMoveInfo(sMoveRelearner.learnableMoves[sMoveRelearner.selectedIndex] ?? 0);
  } else {
    for (const id of [2, 3, 4, 5]) {
      FillWindowPixelBuffer(id, 0);
      PutWindowTilemap(id);
      CopyWindowToVram(id, COPYWIN_GFX);
    }
  }
}

/** MoveRelearnerMenu_MoveCursorFunc: learn_move.c */
export function MoveRelearnerMenu_MoveCursorFunc(itemIndex: number, onInit: boolean, _list?: ListMenu): void {
  if (!onInit) sound.playSE(C.SE_SELECT);
  if (sMoveRelearner) {
    sMoveRelearner.selectedIndex = itemIndex;
    sMoveRelearner.scheduleMoveInfoUpdate = true;
  }
}

/** MoveRelearnerInitListMenuBuffersEtc: learn_move.c */
export function MoveRelearnerInitListMenuBuffersEtc(moves: readonly number[] = []): void {
  const state = sMoveRelearner;
  if (!state) return;
  const learnableMoves = moves.slice(0, 20);
  state.learnableMoves.fill(0);
  state.learnableMoves.splice(0, learnableMoves.length, ...learnableMoves);
  state.numLearnableMoves = learnableMoves.length + 1;
  state.selectedIndex = 0;
  state.listMenuItems = learnableMoves.map((move, index) => ({ label: rom.moveName(move), index }));
  state.listMenuItems.push({ label: rom.text("gFameCheckerText_Cancel"), index: LIST_CANCEL });
}

/** MoveLearnerInitListMenu: learn_move.c */
export function MoveLearnerInitListMenu(): void {
  const state = sMoveRelearner;
  if (!state) return;
  const listItems = state.listMenuItems;
  const listMenu = listMenuTemplate({
    items: listItems, totalItems: listItems.length, maxShowed: 7, windowId: 6,
    header_X: 0, item_X: 8, cursor_X: 0, upText_Y: 0, cursorPal: 2,
    fillValue: 1, cursorShadowPal: 3, lettersSpacing: 1, itemVerticalPadding: 0,
    scrollMultiple: LIST_NO_MULTIPLE_SCROLL, fontId: FONT_NORMAL, cursorKind: 0,
    moveCursorFunc: (itemIndex, onInit) => {
      MoveRelearnerMenu_MoveCursorFunc(itemIndex, onInit);
      PrintMoveInfo(itemIndex === LIST_CANCEL ? 0 : state.learnableMoves[itemIndex] ?? 0);
    },
  });
  state.listMenuTaskId = ListMenuInit(listMenu, state.listMenuScrollPos, state.listMenuScrollRow);
  CopyWindowToVram(6, COPYWIN_MAP);
}

/** MoveRelearnerMenuHandleInput: learn_move.c */
export function MoveRelearnerMenuHandleInput(): void {
  if (!sMoveRelearner) return;
  const selection = ListMenu_ProcessInput(sMoveRelearner.listMenuTaskId);
  if (JOY_NEW(A_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    if (sMoveRelearner.selectedIndex !== 0xfe) {
      sMoveRelearner.state = 8;
    } else {
      sMoveRelearner.state = 12;
    }
  } else if (JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    sMoveRelearner.state = 12;
  }
}

/** YesNoMenuProcessInput: learn_move.c */
export function YesNoMenuProcessInput(): number {
  if (JOY_NEW(A_BUTTON)) return 0;
  if (JOY_NEW(B_BUTTON)) return 1;
  return -1;
}

/** MoveRelearnerLoadBgGfx: learn_move.c */
export function MoveRelearnerLoadBgGfx(): void {
  ResetBgsAndClearDma3BusyFlags(false);
  const bgTemplates = cdata<BgTemplate[]>("learn_move", "sBgTemplates");
  InitBgsFromTemplates(0, bgTemplates);
  SetBgTilemapBuffer(1, new Uint16Array(1024));
  const gfx = incbin("gMoveRelearner_Gfx");
  LoadBgTiles(1, gfx, gfx.length, 0);
  CopyToBgTilemapBuffer(1, incbin16("gMoveRelearner_Tilemap"), 0, 0);
  CopyBgTilemapBufferToVram(1);

  const templates = cdata<WindowTemplate[]>("learn_move", "sWindowTemplates").slice(0, 8);
  InitWindows(templates);
  FillBgTilemapBufferRect(0, 0, 0, 0, 30, 20, 15);
  LoadUserWindowGfx(0, 1, BG_PLTT_ID(14));
  ListMenuLoadStdPalAt(BG_PLTT_ID(13), 1);
  LoadPalette(incbin("gMoveRelearner_Pal"), BG_PLTT_ID(0), 32);
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_ON | DISPCNT_OBJ_1D_MAP);
  ShowBg(0); ShowBg(1);
}

/** MoveRelearnerStateMachine: learn_move.c */
export function MoveRelearnerStateMachine(): void {
  if (!sMoveRelearner) return;
  switch (sMoveRelearner.state) {
    case 0:
      ShowBg(0); ShowBg(1);
      LoadMoveInfoUI();
      DrawTextBorderOnWindows6and7();
      PrintTeachWhichMoveToStrVar1(false);
      sMoveRelearner.state = 4;
      break;
    case 4:
      MoveRelearnerMenuHandleInput();
      break;
    default:
      break;
  }
}

/** CB2_MoveRelearner: learn_move.c */
export function CB2_MoveRelearner(): void {
  MoveRelearnerStateMachine();
  if (sMoveRelearner?.scheduleMoveInfoUpdate) {
    PrintMoveInfoHandleCancel_CopyToVram();
    sMoveRelearner.scheduleMoveInfoUpdate = false;
  }
  AnimateSprites();
  BuildOamBuffer();
}

/** CB2_MoveRelearner_Init: learn_move.c */
export function CB2_MoveRelearner_Init(): void {
  InitMoveRelearnerStateVariables();
  MoveRelearnerInitListMenuBuffersEtc();
  SetVBlankCallback(VBlankCB_MoveRelearner);
  MoveRelearnerLoadBgGfx();
  SetMainCallback2(CB2_MoveRelearner);
}

/** CB2_MoveRelearner_Resume: learn_move.c */
export function CB2_MoveRelearner_Resume(): void {
  SetVBlankCallback(VBlankCB_MoveRelearner);
  MoveRelearnerLoadBgGfx();
  SetMainCallback2(CB2_MoveRelearner);
}

/** Task_InitMoveRelearnerMenu: learn_move.c */
export function Task_InitMoveRelearnerMenu(): void {
  CB2_MoveRelearner_Init();
}

/** TeachMoveRelearnerMove: learn_move.c entry point */
export function TeachMoveRelearnerMove(): void {
  Task_InitMoveRelearnerMenu();
}

/** The original list and its selected move's type, stats and description. */
export async function openMoveRelearnerList(moves: number[], done: (index: number | null) => void): Promise<void> {
  const callback1 = gMain.callback1;
  SetMainCallback1(null);
  SetMainCallback2(() => {});
  await Promise.all([
    loadCData("learn_move", "move_descriptions", "text_window_graphics"),
    preloadPacks(["graphics_interface", "graphics_learn_move", "graphics_text_window", "graphics_fonts"]),
  ]);

  SetVBlankCallback(null); SetHBlankCallback(null);
  DeactivateAllTextPrinters();
  InitGpuRegManager(); FreeAllWindowBuffers(); ResetPaletteFade();
  ppu.vram.fill(0); ppu.oam.fill(0);
  MoveRelearnerLoadBgGfx();

  const hidden = gSprites.filter((sp) => sp.inUse && !sp.invisible);
  for (const sp of hidden) sp.invisible = true;
  for (const id of [0, 1, 2, 3, 4, 5, 6, 7]) FillWindowPixelBuffer(id, 0);
  FillWindowPixelBuffer(7, 1);
  DrawTextBorderOnWindows6and7();

  LoadMoveInfoUI();

  InitMoveRelearnerStateVariables();
  MoveRelearnerInitListMenuBuffersEtc(moves);
  MoveLearnerInitListMenu();
  SpawnListMenuScrollIndicatorSprites();
  const state = sMoveRelearner!;
  PrintTeachWhichMoveToStrVar1(false);

  const listTaskId = state.listMenuTaskId;
  const finish = (index: number | null): void => {
    if (state.scrollArrowId !== null) RemoveScrollIndicatorArrowPair(state.scrollArrowId);
    state.scrollArrowId = null;
    DestroyListMenuTask(listTaskId);
    for (const sp of hidden) if (sp.inUse) sp.invisible = false;
    FreeAllWindowBuffers(); SetVBlankCallback(null); SetMainCallback1(callback1); SetMainCallback2(null);
    done(index);
  };
  SetVBlankCallback(() => { LoadOam(); ProcessSpriteCopyRequests(); TransferPlttBuffer(); });
  SetMainCallback2(() => {
    const selection = ListMenu_ProcessInput(listTaskId);
    if (selection === LIST_CANCEL) { sound.playSE(C.SE_SELECT); finish(null); return; }
    if (selection >= 0) { sound.playSE(C.SE_SELECT); finish(selection); return; }
    if (state.scrollArrowId !== null) StepScrollIndicatorArrowPair(state.scrollArrowId);
    AnimateSprites();
    BuildOamBuffer();
  });
}
