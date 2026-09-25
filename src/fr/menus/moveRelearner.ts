// learn_move.c MoveRelearnerLoadBgGfx / MoveRelearnerInitListMenuBuffersEtc /
// MoveRelearnerMenu_MoveCursorFunc. Uses the exported C templates and graphics.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { expandPlaceholders, intToDecimal, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "../gba/charmap";
import { FONT_NORMAL, FONT_NORMAL_COPY_2 } from "../gba/font";
import { TEXT_SKIP_DRAW } from "../gba/textPrinter";
import { incbin, incbin16, cdata, loadCData, preloadPacks, symName } from "../hw/assets";
import { CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer, FillBgTilemapBufferRect, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate } from "../hw/bg";
import { InitGpuRegManager, SetGpuReg } from "../hw/gpu";
import { DestroyListMenuTask, ListMenu_ProcessInput, ListMenuInit, ListMenuLoadStdPalAt, BlitMenuInfoIcon, listMenuTemplate, LIST_CANCEL, LIST_NO_MULTIPLE_SCROLL, SCROLL_ARROW_UP, AddScrollIndicatorArrowPairParameterized, ListMenuGetScrollAndRow, RemoveScrollIndicatorArrowPair, StepScrollIndicatorArrowPair, type ListMenuItem } from "../hw/listMenu";
import { DrawStdFrameWithCustomTileAndPalette, FONTATTR_MAX_LETTER_HEIGHT, GetFontAttribute, LoadUserWindowGfx } from "../hw/menu";
import { BG_PLTT_ID, LoadPalette, ResetPaletteFade, TransferPlttBuffer } from "../hw/palette";
import { DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_DISPCNT } from "../hw/ppu";
import { gMain, SetMainCallback1, SetMainCallback2, SetHBlankCallback, SetVBlankCallback } from "../hw/runtime";
import { AnimateSprites, BuildOamBuffer, gSprites, LoadOam, ProcessSpriteCopyRequests } from "../hw/sprite";
import { AddTextPrinterParameterized3, DeactivateAllTextPrinters } from "../hw/text";
import { COPYWIN_FULL, COPYWIN_GFX, COPYWIN_MAP, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PutWindowTilemap, type WindowTemplate } from "../hw/window";
import { rom } from "../rom";
import { openHardwareMessageYesNo } from "./hardwareChoice";

const ARROW_TAG = 0x5a25;
const COLOR_LABEL = [0, 2, 3];
const COLOR_VALUE = [1, 2, 3];

/** The C uses this window template for every YesNoMenu in learn_move.c. */
export function askMoveRelearnerQuestion(message: ArrayLike<number>, done: (yes: boolean) => void): void {
  openHardwareMessageYesNo(message, cdata<WindowTemplate>("learn_move", "sMoveRelearnerYesNoMenuTemplate"), done);
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

  const hidden = gSprites.filter((sp) => sp.inUse && !sp.invisible);
  for (const sp of hidden) sp.invisible = true;
  for (const id of [0, 1, 2, 3, 4, 5, 6, 7]) FillWindowPixelBuffer(id, 0);
  FillWindowPixelBuffer(7, 1);
  DrawStdFrameWithCustomTileAndPalette(6, false, 1, 14);
  DrawStdFrameWithCustomTileAndPalette(7, false, 1, 14);

  // Static field labels use the same menu-info icon sheet as learn_move.c.
  BlitMenuInfoIcon(0, C.MENU_INFO_ICON_TYPE, 1, 4);
  BlitMenuInfoIcon(1, C.MENU_INFO_ICON_POWER, 0, 4);
  BlitMenuInfoIcon(1, C.MENU_INFO_ICON_ACCURACY, 0, 19);
  BlitMenuInfoIcon(0, C.MENU_INFO_ICON_PP, 1, 19);
  BlitMenuInfoIcon(0, C.MENU_INFO_ICON_EFFECT, 1, 34);
  for (const id of [0, 1, 4]) { PutWindowTilemap(id); CopyWindowToVram(id, COPYWIN_GFX); }

  const descriptionPointers = cdata<unknown[]>("move_descriptions", "gMoveDescriptionPointers");
  const drawMoveInfo = (moveId: number): void => {
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
      const descName = symName(descriptionPointers[moveId - 1]);
      if (descName) AddTextPrinterParameterized3(5, FONT_NORMAL_COPY_2, 1, 0, COLOR_LABEL, TEXT_SKIP_DRAW, rom.text(descName));
    }
    for (const id of [2, 3, 4, 5]) { PutWindowTilemap(id); CopyWindowToVram(id, COPYWIN_GFX); }
  };

  const cancel = rom.text("gFameCheckerText_Cancel");
  const rows = [...moves.map((moveId, index) => ({ label: rom.moveName(moveId), index })), { label: cancel, index: LIST_CANCEL }];
  const listItems: ListMenuItem[] = rows.map((row) => ({ label: row.label, index: row.index }));
  AddTextPrinterParameterized3(7, FONT_NORMAL, 0, 2, COLOR_LABEL, TEXT_SKIP_DRAW,
    expandPlaceholders(rom.text("gText_TeachWhichMoveToMon")));
  PutWindowTilemap(7); CopyWindowToVram(7, COPYWIN_FULL);

  let listTaskId = 0;
  const template = listMenuTemplate({
    items: listItems, totalItems: listItems.length, maxShowed: 7, windowId: 6, header_X: 0, item_X: 8, cursor_X: 0,
    upText_Y: 0, cursorPal: 2, fillValue: 1, cursorShadowPal: 3, lettersSpacing: 1, itemVerticalPadding: 0,
    scrollMultiple: LIST_NO_MULTIPLE_SCROLL, fontId: FONT_NORMAL, cursorKind: 0,
    moveCursorFunc: (index, onInit) => {
      if (!onInit) sound.playSE(C.SE_SELECT);
      drawMoveInfo(index === LIST_CANCEL ? 0 : moves[index]);
    },
  });
  listTaskId = ListMenuInit(template, 0, 0);
  CopyWindowToVram(6, COPYWIN_MAP);
  const listHeight = GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT);
  const arrows = listItems.length > 6
    ? AddScrollIndicatorArrowPairParameterized(SCROLL_ARROW_UP, 120, 4 * 8 - 4, 4 * 8 + 7 * (listHeight + 2) + 4,
      Math.max(0, listItems.length - 7), ARROW_TAG, ARROW_TAG, () => ListMenuGetScrollAndRow(listTaskId).cursorPos)
    : null;
  const finish = (index: number | null): void => {
    if (arrows !== null) RemoveScrollIndicatorArrowPair(arrows);
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
    if (arrows !== null) StepScrollIndicatorArrowPair(arrows);
    AnimateSprites();
    BuildOamBuffer();
  });
}
