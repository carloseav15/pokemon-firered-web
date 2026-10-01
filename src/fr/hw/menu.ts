// menu.c / text_window.c / new_menu_helpers.c helpers on the GBA hardware layer:
// standard window frames, the single-column cursor menu (sMenu) and the YES/NO menu.

import { sound } from "../audio/sound";
import { A_BUTTON, B_BUTTON, DPAD_ANY, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, joy, JOY_NEW, L_BUTTON, R_BUTTON } from "../gba/input";
import { FONT_INFOS, FONT_NORMAL, FONT_NORMAL_COPY_1, FONT_SMALL, GetStringWidth } from "../gba/font";
import { expandPlaceholders, stringVars } from "../gba/charmap";
import { tasks } from "../gba/tasks";
import { cdata, incbin, incbin16 } from "./assets";
import { ChangeBgX, ChangeBgY, FillBgTilemapBufferRect, LoadBgTiles } from "./bg";
import { LoadPalette } from "./palette";
import { AddTextPrinter, AddTextPrinterParameterized, AddTextPrinterParameterized3, AddTextPrinterParameterized4, AddTextPrinterParameterized5, DeactivateAllTextPrinters } from "./text";
import { save } from "../save";
import { CommitQuestLogWindow1, gQuestLogState } from "../questLogState";
import * as C from "../generated/constants";
import { SetGpuReg } from "./gpu";
import { REG_OFFSET_BLDALPHA } from "./ppu";
import {
  CreateSprite, DestroySprite, FreeSpritePaletteByTag, FreeSpriteTilesByTag, gDummySpriteAffineAnimTable, gDummySpriteAnimTable, gSprites, LoadSpritePalette,
  LoadSpriteSheet, oamData, SPRITE_SHAPE, SPRITE_SIZE, type Sprite, type SpriteTemplate,
} from "./sprite";
import {
  AddWindow, CallWindowFunction, InitWindows, ClearWindowTilemap, CopyWindowToVram, COPYWIN_FULL, COPYWIN_GFX, FillWindowPixelBuffer, FillWindowPixelRect, GetWindowAttribute,
  PIXEL_FILL, PutWindowTilemap, RemoveWindow, WINDOW_BG, WINDOW_PALETTE_NUM, type WindowTemplate,
} from "./window";

export const MENU_NOTHING_CHOSEN = -2;
export const MENU_B_PRESSED = -1;
const SE_SELECT = 5;

/** gMenuCursorDimensions [width, height] by font id. */
const MENU_CURSOR_DIMENSIONS = [[8, 13], [8, 14], [8, 14], [8, 14], [8, 14], [8, 14], [8, 16], [0, 0]];

export function GetMenuCursorDimensionByFont(fontId: number, which: number): number {
  return MENU_CURSOR_DIMENSIONS[fontId][which];
}

const strings = (name: string) => cdata<number[]>("strings", name);

// menu2.c: text layout used by international player-name placeholders.
export function Menu_PrintFormatIntlPlayerName(windowId: number, src: ArrayLike<number>, x: number, y: number): void {
  let playerNameLength = 0;
  while (playerNameLength < save.playerName.length && save.playerName[playerNameLength] !== 0xff) playerNameLength++;
  stringVars.var4 = expandPlaceholders(src);
  if (playerNameLength !== 5) {
    AddTextPrinterParameterized(windowId, FONT_NORMAL, stringVars.var4, x, y, 0xff, null);
  } else {
    AddTextPrinterParameterized5(windowId, FONT_NORMAL, stringVars.var4, x, y, 0xff, null, 0, 0);
  }
}

// menu2.c: the C task stores each value in signed 16-bit task data slots.
const Task_SmoothBlendLayers = (taskId: number): void => {
  const data = tasks.data(taskId);
  const s16 = (value: number) => (value << 16) >> 16;
  if (data[8] !== 0) {
    if (data[6] === 0) {
      data[0] = s16(data[0] + data[4]);
      data[6] = 1;
    } else {
      data[8] = s16(data[8] - 1);
      if (data[8] !== 0) data[1] = s16(data[1] + data[5]);
      else {
        data[0] = s16(data[2] << 8);
        data[1] = s16(data[3] << 8);
      }
      data[6] = 0;
    }
    SetGpuReg(REG_OFFSET_BLDALPHA, ((data[1] & ~0xff) | ((data[0] & 0xffff) >>> 8)) & 0xffff);
    if (data[8] === 0) tasks.destroy(taskId);
  }
};

export function StartBlendTask(evaStart: number, evbStart: number, evaEnd: number, evbEnd: number, evStep: number, priority: number): void {
  const taskId = tasks.create(Task_SmoothBlendLayers, priority);
  const data = tasks.data(taskId);
  const s16 = (value: number) => (value << 16) >> 16;
  data[0] = s16(evaStart << 8);
  data[1] = s16(evbStart << 8);
  data[2] = s16(evaEnd);
  data[3] = s16(evbEnd);
  data[4] = s16(Math.trunc(((evaEnd - evaStart) * 256) / evStep));
  data[5] = s16(Math.trunc(((evbEnd - evbStart) * 256) / evStep));
  data[8] = s16(evStep);
  SetGpuReg(REG_OFFSET_BLDALPHA, ((evbStart << 8) | evaStart) & 0xffff);
}

export function IsBlendTaskActive(): boolean {
  return tasks.isActive(Task_SmoothBlendLayers);
}

// ---------------------------------------------------------------- text_window.c

/** GetTextWindowPalette: 16 colors of gTextWindowPalettes[id] (id 4+ -> 4). */
export function GetTextWindowPalette(id: number): Uint8Array {
  const all = incbin("gTextWindowPalettes");
  const paletteId = id & 0xff;
  const i = paletteId < 4 ? paletteId : 4;
  return all.subarray(i * 32, i * 32 + 32);
}

export function LoadStdWindowGfx(windowId: number, destOffset: number, palOffset: number): void {
  LoadStdWindowGfxOnBg(GetWindowAttribute(windowId, WINDOW_BG), destOffset, palOffset);
}

export function LoadStdWindowGfxOnBg(bgId: number, destOffset: number, palOffset: number): void {
  LoadBgTiles(bgId, incbin("gStdTextWindow_Gfx"), 0x120, destOffset);
  LoadPalette(GetTextWindowPalette(3), palOffset, 32);
}

/** LoadHelpMessageWindowGfxOnBg (text_window.c). */
function LoadHelpMessageWindowGfxOnBg(bgId: number, destOffset: number, palOffset: number): void {
  LoadBgTiles(bgId, incbin("gHelpMessageWindow_Gfx"), 0x280, destOffset);
  LoadPalette(GetTextWindowPalette(2), palOffset, 32);
}

/** LoadMenuMessageWindowGfxOnBg (text_window.c). */
function LoadMenuMessageWindowGfxOnBg(bgId: number, destOffset: number, palOffset: number): void {
  LoadBgTiles(bgId, incbin("gMenuMessageWindow_Gfx"), 0x280, destOffset);
  LoadPalette(GetTextWindowPalette(0), palOffset, 32);
}

/** LoadSignpostWindowGfxOnBg (text_window.c). */
function LoadSignpostWindowGfxOnBg(bgId: number, destOffset: number, palOffset: number): void {
  LoadBgTiles(bgId, incbin("gSignpostWindow_Gfx"), 0x260, destOffset);
  LoadPalette(GetTextWindowPalette(1), palOffset, 32);
}

/** LoadQuestLogWindowTilesOnBg (text_window.c). */
function LoadQuestLogWindowTilesOnBg(bgId: number, destOffset: number): void {
  LoadBgTiles(bgId, incbin("gQuestLogWindow_Gfx"), 0x280, destOffset);
}

/** LoadUserWindowGfxByFrameOnBg (text_window.c). */
function LoadUserWindowGfxByFrameOnBg(bgId: number, frameType: number, destOffset: number, palOffset: number): void {
  const gfx = GetUserWindowGraphics(frameType);
  LoadBgTiles(bgId, gfx.tiles, 0x120, destOffset);
  LoadPalette(gfx.palette, palOffset, 32);
}

/** LoadSignpostWindowGfx (text_window.c). */
export function LoadSignpostWindowGfx(windowId: number, destOffset: number, palOffset: number): void {
  LoadSignpostWindowGfxOnBg(GetWindowAttribute(windowId, WINDOW_BG), destOffset, palOffset);
}

/** LoadHelpMessageWindowGfx (text_window.c). */
export function LoadHelpMessageWindowGfx(windowId: number, destOffset: number, palOffset: number): void {
  LoadHelpMessageWindowGfxOnBg(GetWindowAttribute(windowId, WINDOW_BG), destOffset, palOffset);
}

/** LoadStdWindowTiles (text_window.c), tiles only. */
export function LoadStdWindowTiles(windowId: number, destOffset: number): void {
  LoadBgTiles(GetWindowAttribute(windowId, WINDOW_BG), incbin("gStdTextWindow_Gfx"), 0x120, destOffset);
}

/** LoadQuestLogWindowTiles (text_window.c), tiles only. */
export function LoadQuestLogWindowTiles(windowId: number, destOffset: number): void {
  LoadQuestLogWindowTilesOnBg(GetWindowAttribute(windowId, WINDOW_BG), destOffset);
}

// ---------------------------------------------------------------- frames

let sTileNum = 0;
let sPaletteNum = 0;

export function DrawStdFrameWithCustomTileAndPalette(windowId: number, copyToVram: boolean, baseTileNum: number, paletteNum: number): void {
  sTileNum = baseTileNum;
  sPaletteNum = paletteNum;
  CallWindowFunction(windowId, WindowFunc_DrawStdFrameWithCustomTileAndPalette);
  FillWindowPixelBuffer(windowId, PIXEL_FILL(1));
  PutWindowTilemap(windowId);
  if (copyToVram) CopyWindowToVram(windowId, COPYWIN_FULL);
}

export function ClearStdWindowAndFrameToTransparent(windowId: number, copyToVram: boolean): void {
  CallWindowFunction(windowId, WindowFunc_ClearStdWindowAndFrameToTransparent);
  FillWindowPixelBuffer(windowId, PIXEL_FILL(0));
  ClearWindowTilemap(windowId);
  if (copyToVram) CopyWindowToVram(windowId, COPYWIN_FULL);
}

const BG_TILE_V_FLIP = (n: number) => n | 0x800;

export function DrawDialogFrameWithCustomTileAndPalette(windowId: number, copyToVram: boolean, tileNum: number, paletteNum: number): void {
  sTileNum = tileNum;
  sPaletteNum = paletteNum;
  CallWindowFunction(windowId, WindowFunc_DrawDialogFrameWithCustomTileAndPalette);
  FillWindowPixelBuffer(windowId, PIXEL_FILL(1));
  PutWindowTilemap(windowId);
  if (copyToVram) CopyWindowToVram(windowId, COPYWIN_FULL);
}

export function ClearDialogWindowAndFrameToTransparent(windowId: number, copyToVram: boolean): void {
  CallWindowFunction(windowId, WindowFunc_ClearDialogWindowAndFrameNullPalette);
  FillWindowPixelBuffer(windowId, PIXEL_FILL(0));
  ClearWindowTilemap(windowId);
  if (copyToVram) CopyWindowToVram(windowId, COPYWIN_FULL);
}

/** menu.c DrawDialogFrameWithCustomTile (window palette supplies the palette). */
export function DrawDialogFrameWithCustomTile(windowId: number, copyToVram: boolean, tileNum: number): void {
  DrawDialogFrameWithCustomTileAndPalette(windowId, copyToVram, tileNum, GetWindowAttribute(windowId, WINDOW_PALETTE_NUM));
}

/** menu.c WindowFunc_DrawDialogFrameWithCustomTileAndPalette. */
export function WindowFunc_DrawDialogFrameWithCustomTileAndPalette(bg: number, left: number, top: number, width: number, _height: number, _palette: number): void {
  const f = (tile: number, x: number, y: number, w: number, h = 1) => FillBgTilemapBufferRect(bg, tile, x, y, w, h, sPaletteNum);
  const t = sTileNum;
  f(t, left - 2, top - 1, 1); f(t + 1, left - 1, top - 1, 1); f(t + 2, left, top - 1, width);
  f(t + 3, left + width, top - 1, 1); f(t + 4, left + width + 1, top - 1, 1);
  f(t + 5, left - 2, top, 1); f(t + 6, left - 1, top, 1); f(t + 8, left + width, top, 1); f(t + 9, left + width + 1, top, 1);
  f(t + 10, left - 2, top + 1, 1); f(t + 11, left - 1, top + 1, 1); f(t + 12, left + width, top + 1, 1); f(t + 13, left + width + 1, top + 1, 1);
  f(BG_TILE_V_FLIP(t + 10), left - 2, top + 2, 1); f(BG_TILE_V_FLIP(t + 11), left - 1, top + 2, 1);
  f(BG_TILE_V_FLIP(t + 12), left + width, top + 2, 1); f(BG_TILE_V_FLIP(t + 13), left + width + 1, top + 2, 1);
  f(BG_TILE_V_FLIP(t + 5), left - 2, top + 3, 1); f(BG_TILE_V_FLIP(t + 6), left - 1, top + 3, 1);
  f(BG_TILE_V_FLIP(t + 8), left + width, top + 3, 1); f(BG_TILE_V_FLIP(t + 9), left + width + 1, top + 3, 1);
  f(BG_TILE_V_FLIP(t), left - 2, top + 4, 1); f(BG_TILE_V_FLIP(t + 1), left - 1, top + 4, 1);
  f(BG_TILE_V_FLIP(t + 2), left, top + 4, width); f(BG_TILE_V_FLIP(t + 3), left + width, top + 4, 1);
  f(BG_TILE_V_FLIP(t + 4), left + width + 1, top + 4, 1);
}

/** menu.c WindowFunc_ClearDialogWindowAndFrameNullPalette. */
export function WindowFunc_ClearDialogWindowAndFrameNullPalette(bg: number, left: number, top: number, width: number, height: number, _palette: number): void {
  FillBgTilemapBufferRect(bg, 0, left - 2, top - 1, width + 4, height + 2, 0);
}

/** menu.c DrawStdFrameWithCustomTile (window palette supplies the palette). */
export function DrawStdFrameWithCustomTile(windowId: number, copyToVram: boolean, baseTileNum: number): void {
  DrawStdFrameWithCustomTileAndPalette(windowId, copyToVram, baseTileNum, GetWindowAttribute(windowId, WINDOW_PALETTE_NUM));
}

/** menu.c WindowFunc_DrawStdFrameWithCustomTileAndPalette. */
export function WindowFunc_DrawStdFrameWithCustomTileAndPalette(bg: number, left: number, top: number, width: number, height: number, _palette: number): void {
  const f = (tile: number, x: number, y: number, w: number, h: number) => FillBgTilemapBufferRect(bg, tile, x, y, w, h, sPaletteNum);
  f(sTileNum, left - 1, top - 1, 1, 1); f(sTileNum + 1, left, top - 1, width, 1); f(sTileNum + 2, left + width, top - 1, 1, 1);
  f(sTileNum + 3, left - 1, top, 1, height); f(sTileNum + 5, left + width, top, 1, height);
  f(sTileNum + 6, left - 1, top + height, 1, 1); f(sTileNum + 7, left, top + height, width, 1); f(sTileNum + 8, left + width, top + height, 1, 1);
}

/** menu.c WindowFunc_ClearStdWindowAndFrameToTransparent. */
export function WindowFunc_ClearStdWindowAndFrameToTransparent(bg: number, left: number, top: number, width: number, height: number, _palette: number): void {
  FillBgTilemapBufferRect(bg, 0, left - 1, top - 1, width + 2, height + 2, 0);
}

// ---------------------------------------------------------------- sMenu

const sMenu = { left: 0, top: 0, cursorPos: 0, minCursorPos: 0, maxCursorPos: 0, windowId: 0, fontId: 0, optionHeight: 0, optionWidth: 0, columns: 1, rows: 1, APressMuted: false };

/** menu.c InitMenuDefaultCursorHeight. */
export function InitMenuDefaultCursorHeight(windowId: number, fontId: number, left: number, top: number, numChoices: number, initialCursorPos: number): number {
  return Menu_InitCursor(windowId, fontId, left, top, GetMenuCursorDimensionByFont(fontId, 1), numChoices, initialCursorPos);
}

/** menu.c MultichoiceList_PrintItems. */
export function MultichoiceList_PrintItems(windowId: number, fontId: number, left: number, top: number, lineHeight: number, itemCount: number,
  strs: MenuAction[], letterSpacing: number, lineSpacing: number): void {
  for (let i = 0; i < itemCount; i++) AddTextPrinterParameterized5(windowId, fontId, strs[i].text, left, lineHeight * i + top, 0xff, null, letterSpacing, lineSpacing);
  CopyWindowToVram(windowId, COPYWIN_GFX);
}

/** menu.c PrintMenuTable. */
export function PrintMenuTable(windowId: number, fontId: number, lineHeight: number, itemCount: number, strs: MenuAction[]): void {
  PrintTextArray(windowId, fontId, GetMenuCursorDimensionByFont(fontId, 0), 0, lineHeight, itemCount, strs);
}

/** menu.c PrintMenuActionTextsAtTopById. */
export function PrintMenuActionTextsAtTopById(windowId: number, fontId: number, lineHeight: number, itemCount: number,
  strs: MenuAction[], orderArray: ArrayLike<number>): void {
  const x = GetFontAttribute(fontId, FONTATTR_MAX_LETTER_WIDTH);
  const letterSpacing = GetFontAttribute(fontId, FONTATTR_LETTER_SPACING);
  const lineSpacing = GetFontAttribute(fontId, FONTATTR_LINE_SPACING);
  for (let i = 0; i < itemCount; i++) {
    AddTextPrinterParameterized5(windowId, fontId, strs[orderArray[i]].text, x, lineHeight * i, 0xff, null, letterSpacing, lineSpacing);
  }
  CopyWindowToVram(windowId, COPYWIN_GFX);
}

/** menu.c SetWindowTemplateFields. */
export function SetWindowTemplateFields(bg: number, left: number, top: number, width: number, height: number, paletteNum: number, baseBlock: number): WindowTemplate {
  return { bg, tilemapLeft: left, tilemapTop: top, width, height, paletteNum, baseBlock };
}

/** menu.c CreateWindowTemplate. */
export function CreateWindowTemplate(bg: number, left: number, top: number, width: number, height: number, paletteNum: number, baseBlock: number): number {
  return AddWindow(SetWindowTemplateFields(bg, left, top, width, height, paletteNum, baseBlock));
}

/** menu.c CreateYesNoMenu2, retaining the original argument order. */
export function CreateYesNoMenu2(window: WindowTemplate, fontId: number, baseTileNum: number, initialCursorPos: number): void {
  CreateYesNoMenu(window, fontId, 0, 0, baseTileNum, initialCursorPos, 0);
}

/** menu.c MultichoiceGrid_PrintItems. */
export function MultichoiceGrid_PrintItems(windowId: number, fontId: number, itemWidth: number, itemHeight: number, cols: number, rows: number, strs: MenuAction[]): void {
  const width = GetFontAttribute(fontId, FONTATTR_MAX_LETTER_WIDTH);
  const yOffset = (16 - GetFontAttribute(fontId, FONTATTR_MAX_LETTER_HEIGHT)) / 2;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    AddTextPrinterParameterized(windowId, fontId, strs[i * cols + j].text, itemWidth * j + width, yOffset + itemHeight * i, 0xff, null);
  }
  CopyWindowToVram(windowId, COPYWIN_GFX);
}

/** menu.c MultichoiceGrid_PrintItemsCustomOrder. */
export function MultichoiceGrid_PrintItemsCustomOrder(windowId: number, fontId: number, itemWidth: number, itemHeight: number,
  cols: number, rows: number, strs: MenuAction[], orderArray: ArrayLike<number>): void {
  const width = GetFontAttribute(fontId, FONTATTR_MAX_LETTER_WIDTH);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    AddTextPrinterParameterized(windowId, fontId, strs[orderArray[i * cols + j]].text, itemWidth * j + width, itemHeight * i, 0xff, null);
  }
  CopyWindowToVram(windowId, COPYWIN_GFX);
}

/** menu.c MultichoiceGrid_InitCursorInternal. */
export function MultichoiceGrid_InitCursorInternal(windowId: number, fontId: number, left: number, top: number, optionWidth: number,
  cursorHeight: number, cols: number, rows: number, numChoices: number, cursorPos: number): number {
  Object.assign(sMenu, { left, top, minCursorPos: 0, maxCursorPos: (numChoices - 1) & 0xff, windowId, fontId, optionWidth, optionHeight: cursorHeight, columns: cols & 0xff, rows: rows & 0xff });
  const pos = (cursorPos << 24) >> 24;
  sMenu.cursorPos = pos < 0 || pos > sMenu.maxCursorPos ? 0 : pos;
  MultichoiceGrid_MoveCursor(0, 0);
  return sMenu.cursorPos;
}

/** menu.c MultichoiceGrid_InitCursor. */
export function MultichoiceGrid_InitCursor(windowId: number, fontId: number, left: number, top: number, optionWidth: number,
  cols: number, rows: number, cursorPos: number): number {
  return MultichoiceGrid_InitCursorInternal(windowId, fontId, left, top, optionWidth, 16, cols, rows, (cols * rows) & 0xff, cursorPos);
}

function MultichoiceGrid_RedrawCursor(oldCursorPos: number, newCursorPos: number): void {
  const cursorWidth = GetMenuCursorDimensionByFont(sMenu.fontId, 0);
  const cursorHeight = GetMenuCursorDimensionByFont(sMenu.fontId, 1);
  const oldX = ((oldCursorPos % sMenu.columns) * sMenu.optionWidth + sMenu.left) & 0xff;
  const oldY = (Math.floor(oldCursorPos / sMenu.columns) * sMenu.optionHeight + sMenu.top) & 0xff;
  const newX = ((newCursorPos % sMenu.columns) * sMenu.optionWidth + sMenu.left) & 0xff;
  const newY = (Math.floor(newCursorPos / sMenu.columns) * sMenu.optionHeight + sMenu.top) & 0xff;
  FillWindowPixelRect(sMenu.windowId, PIXEL_FILL(1), oldX, oldY, cursorWidth, cursorHeight);
  AddTextPrinterParameterized(sMenu.windowId, sMenu.fontId, strings("gText_SelectorArrow2"), newX, newY, 0, null);
}

/** menu.c MultichoiceGrid_MoveCursor. */
export function MultichoiceGrid_MoveCursor(deltaX: number, deltaY: number): number {
  const oldPos = sMenu.cursorPos;
  if (deltaX) {
    const x = (sMenu.cursorPos % sMenu.columns) + deltaX;
    if (x < 0) sMenu.cursorPos += sMenu.columns - 1;
    else if (x >= sMenu.columns) sMenu.cursorPos = Math.floor(sMenu.cursorPos / sMenu.columns) * sMenu.columns;
    else sMenu.cursorPos += deltaX;
    sMenu.cursorPos &= 0xff;
  }
  if (deltaY) {
    const y = Math.floor(sMenu.cursorPos / sMenu.columns) + deltaY;
    if (y < 0) sMenu.cursorPos += sMenu.columns * (sMenu.rows - 1);
    else if (y >= sMenu.rows) sMenu.cursorPos -= sMenu.columns * (sMenu.rows - 1);
    else sMenu.cursorPos += sMenu.columns * deltaY;
    sMenu.cursorPos &= 0xff;
  }
  if (sMenu.cursorPos > sMenu.maxCursorPos) sMenu.cursorPos = oldPos;
  else MultichoiceGrid_RedrawCursor(oldPos, sMenu.cursorPos);
  return sMenu.cursorPos;
}

/** menu.c MultichoiceGrid_MoveCursorIfValid. */
export function MultichoiceGrid_MoveCursorIfValid(deltaX: number, deltaY: number): number {
  const oldPos = sMenu.cursorPos;
  if (deltaX) {
    const x = (sMenu.cursorPos % sMenu.columns) + deltaX;
    if (x >= 0 && x < sMenu.columns) sMenu.cursorPos += deltaX;
  }
  if (deltaY) {
    const y = Math.floor(sMenu.cursorPos / sMenu.columns) + deltaY;
    if (y >= 0 && y < sMenu.rows) sMenu.cursorPos += sMenu.columns * deltaY;
  }
  sMenu.cursorPos &= 0xff;
  if (sMenu.cursorPos > sMenu.maxCursorPos) sMenu.cursorPos = oldPos;
  MultichoiceGrid_RedrawCursor(oldPos, sMenu.cursorPos);
  return sMenu.cursorPos;
}

function menuLRKeysPressed(): number {
  if (save.options.buttonMode !== C.OPTIONS_BUTTON_MODE_LR) return 0;
  if (joy.newKeys & L_BUTTON) return 1;
  if (joy.newKeys & R_BUTTON) return 2;
  return 0;
}

function menuLRKeysRepeated(): number {
  if (save.options.buttonMode !== C.OPTIONS_BUTTON_MODE_LR) return 0;
  if (joy.repeated & L_BUTTON) return 1;
  if (joy.repeated & R_BUTTON) return 2;
  return 0;
}

/** menu.c Menu_ProcessInputGridLayout. */
export function Menu_ProcessInputGridLayout(): number {
  const oldPos = sMenu.cursorPos;
  if (JOY_NEW(A_BUTTON)) { sound.playSE(SE_SELECT); return sMenu.cursorPos; }
  if (JOY_NEW(B_BUTTON)) return MENU_B_PRESSED;
  if (JOY_NEW(DPAD_UP)) { if (oldPos !== MultichoiceGrid_MoveCursorIfValid(0, -1)) sound.playSE(SE_SELECT); return MENU_NOTHING_CHOSEN; }
  if (JOY_NEW(DPAD_DOWN)) { if (oldPos !== MultichoiceGrid_MoveCursorIfValid(0, 1)) sound.playSE(SE_SELECT); return MENU_NOTHING_CHOSEN; }
  if (JOY_NEW(DPAD_LEFT) || menuLRKeysPressed() === 1) { if (oldPos !== MultichoiceGrid_MoveCursorIfValid(-1, 0)) sound.playSE(SE_SELECT); return MENU_NOTHING_CHOSEN; }
  if (JOY_NEW(DPAD_RIGHT) || menuLRKeysPressed() === 2) { if (oldPos !== MultichoiceGrid_MoveCursorIfValid(1, 0)) sound.playSE(SE_SELECT); return MENU_NOTHING_CHOSEN; }
  return MENU_NOTHING_CHOSEN;
}

/** menu.c Menu_ProcessGridInput_NoSoundLimit. */
export function Menu_ProcessGridInput_NoSoundLimit(): number {
  if (JOY_NEW(A_BUTTON)) { sound.playSE(SE_SELECT); return sMenu.cursorPos; }
  if (JOY_NEW(B_BUTTON)) return MENU_B_PRESSED;
  if (JOY_NEW(DPAD_UP)) { sound.playSE(SE_SELECT); MultichoiceGrid_MoveCursor(0, -1); }
  else if (JOY_NEW(DPAD_DOWN)) { sound.playSE(SE_SELECT); MultichoiceGrid_MoveCursor(0, 1); }
  else if (JOY_NEW(DPAD_LEFT) || menuLRKeysPressed() === 1) { sound.playSE(SE_SELECT); MultichoiceGrid_MoveCursor(-1, 0); }
  else if (JOY_NEW(DPAD_RIGHT) || menuLRKeysPressed() === 2) { sound.playSE(SE_SELECT); MultichoiceGrid_MoveCursor(1, 0); }
  return MENU_NOTHING_CHOSEN;
}

/** menu.c Menu_ProcessGridInputRepeat_NoSoundLimit. */
export function Menu_ProcessGridInputRepeat_NoSoundLimit(): number {
  const dpad = joy.repeated & DPAD_ANY;
  if (JOY_NEW(A_BUTTON)) { sound.playSE(SE_SELECT); return sMenu.cursorPos; }
  if (JOY_NEW(B_BUTTON)) return MENU_B_PRESSED;
  if (dpad === DPAD_UP) { sound.playSE(SE_SELECT); MultichoiceGrid_MoveCursor(0, -1); }
  else if (dpad === DPAD_DOWN) { sound.playSE(SE_SELECT); MultichoiceGrid_MoveCursor(0, 1); }
  else if (dpad === DPAD_LEFT || menuLRKeysRepeated() === 1) { sound.playSE(SE_SELECT); MultichoiceGrid_MoveCursor(-1, 0); }
  else if (dpad === DPAD_RIGHT || menuLRKeysRepeated() === 2) { sound.playSE(SE_SELECT); MultichoiceGrid_MoveCursor(1, 0); }
  return MENU_NOTHING_CHOSEN;
}

/** menu.c Menu_ProcessGridInputRepeat. */
export function Menu_ProcessGridInputRepeat(): number {
  const oldPos = sMenu.cursorPos;
  const dpad = joy.repeated & DPAD_ANY;
  if (JOY_NEW(A_BUTTON)) { sound.playSE(SE_SELECT); return sMenu.cursorPos; }
  if (JOY_NEW(B_BUTTON)) return MENU_B_PRESSED;
  if (dpad === DPAD_UP) { if (oldPos !== MultichoiceGrid_MoveCursorIfValid(0, -1)) sound.playSE(SE_SELECT); }
  else if (dpad === DPAD_DOWN) { if (oldPos !== MultichoiceGrid_MoveCursorIfValid(0, 1)) sound.playSE(SE_SELECT); }
  else if (dpad === DPAD_LEFT || menuLRKeysRepeated() === 1) { if (oldPos !== MultichoiceGrid_MoveCursorIfValid(-1, 0)) sound.playSE(SE_SELECT); }
  else if (dpad === DPAD_RIGHT || menuLRKeysRepeated() === 2) { if (oldPos !== MultichoiceGrid_MoveCursorIfValid(1, 0)) sound.playSE(SE_SELECT); }
  return MENU_NOTHING_CHOSEN;
}

export function Menu_InitCursorInternal(windowId: number, fontId: number, left: number, top: number, cursorHeight: number, numChoices: number,
  initialCursorPos: number, APressMuted: boolean): number {
  Object.assign(sMenu, { left, top, minCursorPos: 0, maxCursorPos: numChoices - 1, windowId, fontId, optionHeight: cursorHeight, APressMuted });
  const pos = (initialCursorPos << 24) >> 24;
  sMenu.cursorPos = pos < 0 || pos > sMenu.maxCursorPos ? 0 : pos;
  Menu_MoveCursor(0);
  return sMenu.cursorPos;
}

export function Menu_InitCursor(windowId: number, fontId: number, left: number, top: number, cursorHeight: number, numChoices: number, initialCursorPos: number): number {
  return Menu_InitCursorInternal(windowId, fontId, left, top, cursorHeight, numChoices, initialCursorPos, false);
}

function Menu_RedrawCursor(oldPos: number, newPos: number): void {
  const width = GetMenuCursorDimensionByFont(sMenu.fontId, 0);
  const height = GetMenuCursorDimensionByFont(sMenu.fontId, 1);
  FillWindowPixelRect(sMenu.windowId, 1, sMenu.left, sMenu.optionHeight * oldPos + sMenu.top, width, height);
  AddTextPrinterParameterized(sMenu.windowId, sMenu.fontId, strings("gText_SelectorArrow2"), sMenu.left, sMenu.optionHeight * newPos + sMenu.top, 0, null);
}

export function Menu_MoveCursor(delta: number): number {
  const oldPos = sMenu.cursorPos;
  const newPos = sMenu.cursorPos + delta;
  if (newPos < sMenu.minCursorPos) sMenu.cursorPos = sMenu.maxCursorPos;
  else if (newPos > sMenu.maxCursorPos) sMenu.cursorPos = sMenu.minCursorPos;
  else sMenu.cursorPos += delta;
  Menu_RedrawCursor(oldPos, sMenu.cursorPos);
  return sMenu.cursorPos;
}

export function Menu_MoveCursorNoWrapAround(delta: number): number {
  const oldPos = sMenu.cursorPos;
  const newPos = sMenu.cursorPos + delta;
  if (newPos < sMenu.minCursorPos) sMenu.cursorPos = sMenu.minCursorPos;
  else if (newPos > sMenu.maxCursorPos) sMenu.cursorPos = sMenu.maxCursorPos;
  else sMenu.cursorPos += delta;
  Menu_RedrawCursor(oldPos, sMenu.cursorPos);
  return sMenu.cursorPos;
}

export function Menu_GetCursorPos(): number {
  return sMenu.cursorPos;
}

export function Menu_ProcessInput(): number {
  if (JOY_NEW(A_BUTTON)) {
    if (!sMenu.APressMuted) sound.playSE(SE_SELECT);
    return sMenu.cursorPos;
  }
  if (JOY_NEW(B_BUTTON)) return MENU_B_PRESSED;
  if (JOY_NEW(DPAD_UP)) {
    sound.playSE(SE_SELECT);
    Menu_MoveCursor(-1);
  } else if (JOY_NEW(DPAD_DOWN)) {
    sound.playSE(SE_SELECT);
    Menu_MoveCursor(1);
  }
  return MENU_NOTHING_CHOSEN;
}

export function Menu_ProcessInputNoWrapAround(): number {
  const oldPos = sMenu.cursorPos;
  if (JOY_NEW(A_BUTTON)) {
    if (!sMenu.APressMuted) sound.playSE(SE_SELECT);
    return sMenu.cursorPos;
  }
  if (JOY_NEW(B_BUTTON)) return MENU_B_PRESSED;
  if (JOY_NEW(DPAD_UP)) {
    if (oldPos !== Menu_MoveCursorNoWrapAround(-1)) sound.playSE(SE_SELECT);
  } else if (JOY_NEW(DPAD_DOWN)) {
    if (oldPos !== Menu_MoveCursorNoWrapAround(1)) sound.playSE(SE_SELECT);
  }
  return MENU_NOTHING_CHOSEN;
}

/** Menu_ProcessInput_other: like Menu_ProcessInput but the D-pad repeats. */
export function Menu_ProcessInput_other(): number {
  if (JOY_NEW(A_BUTTON)) {
    if (!sMenu.APressMuted) sound.playSE(SE_SELECT);
    return sMenu.cursorPos;
  }
  if (JOY_NEW(B_BUTTON)) return MENU_B_PRESSED;
  const dpad = joy.repeated & (DPAD_UP | DPAD_DOWN | DPAD_LEFT | DPAD_RIGHT);
  if (dpad === DPAD_UP) { sound.playSE(SE_SELECT); Menu_MoveCursor(-1); }
  else if (dpad === DPAD_DOWN) { sound.playSE(SE_SELECT); Menu_MoveCursor(1); }
  return MENU_NOTHING_CHOSEN;
}

/** Menu_ProcessInputNoWrapAround_other */
export function Menu_ProcessInputNoWrapAround_other(): number {
  const oldPos = sMenu.cursorPos;
  if (JOY_NEW(A_BUTTON)) {
    if (!sMenu.APressMuted) sound.playSE(SE_SELECT);
    return sMenu.cursorPos;
  }
  if (JOY_NEW(B_BUTTON)) return MENU_B_PRESSED;
  const dpad = joy.repeated & (DPAD_UP | DPAD_DOWN | DPAD_LEFT | DPAD_RIGHT);
  if (dpad === DPAD_UP) { if (oldPos !== Menu_MoveCursorNoWrapAround(-1)) sound.playSE(SE_SELECT); }
  else if (dpad === DPAD_DOWN) { if (oldPos !== Menu_MoveCursorNoWrapAround(1)) sound.playSE(SE_SELECT); }
  return MENU_NOTHING_CHOSEN;
}

// ---------------------------------------------------------------- YES/NO

let sYesNoWindowId = 0xff;

export function CreateYesNoMenu(window: WindowTemplate, fontId: number, left: number, top: number, baseTileNum: number, paletteNum: number, initialCursorPos: number): void {
  sYesNoWindowId = AddWindow(window);
  DrawStdFrameWithCustomTileAndPalette(sYesNoWindowId, true, baseTileNum, paletteNum);
  const f = FONT_INFOS[fontId];
  const x = GetMenuCursorDimensionByFont(fontId, 0) + left;
  AddTextPrinter({ windowId: sYesNoWindowId, fontId, x, y: top, letterSpacing: f.letterSpacing, lineSpacing: f.lineSpacing, fgColor: f.fgColor,
    bgColor: f.bgColor, shadowColor: f.shadowColor }, strings("gText_YesNo"), 0xff, null);
  Menu_InitCursor(sYesNoWindowId, fontId, left, top, f.maxLetterHeight + f.lineSpacing, 2, initialCursorPos);
}

export function DestroyYesNoMenu(): void {
  if (sYesNoWindowId === 0xff) return;
  ClearStdWindowAndFrameToTransparent(sYesNoWindowId, true);
  RemoveWindow(sYesNoWindowId);
  sYesNoWindowId = 0xff;
}

export function Menu_ProcessInputNoWrapClearOnChoose(): number {
  const result = Menu_ProcessInputNoWrapAround();
  if (result !== MENU_NOTHING_CHOSEN) DestroyYesNoMenu();
  return result;
}

// ---------------------------------------------------------------- new_menu_helpers.c: standard text box and dialogue frame

export const DLG_WINDOW_PALETTE_NUM = 15;
export const DLG_WINDOW_BASE_TILE_NUM = 0x200;
export const STD_WINDOW_PALETTE_NUM = 14;
export const STD_WINDOW_BASE_TILE_NUM = 0x214;

const sStandardTextBox_WindowTemplates: WindowTemplate[] = [
  { bg: 0, tilemapLeft: 2, tilemapTop: 15, width: 26, height: 4, paletteNum: DLG_WINDOW_PALETTE_NUM, baseBlock: 0x198 },
  { bg: 0xff, tilemapLeft: 0, tilemapTop: 0, width: 0, height: 0, paletteNum: 0, baseBlock: 0 },
];

export function InitStandardTextBoxWindows(): void {
  InitWindows(sStandardTextBox_WindowTemplates);
}

export function InitTextBoxGfxAndPrinters(): void {
  ChangeBgX(0, 0, 0);
  ChangeBgY(0, 0, 0);
  DeactivateAllTextPrinters();
  LoadStdWindowFrameGfx();
}

function pal16(bytes: Uint8Array): Uint16Array {
  return new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + (bytes.length & ~1)));
}

export type MenuAction = { text: ArrayLike<number> };

/** PrintTextArray */
export function PrintTextArray(windowId: number, fontId: number, left: number, top: number, lineHeight: number, itemCount: number, strs: MenuAction[]): void {
  for (let i = 0; i < itemCount; i++) AddTextPrinterParameterized(windowId, fontId, strs[i].text, left, lineHeight * i + top, 0xff, null);
  CopyWindowToVram(windowId, COPYWIN_GFX);
}

export function Menu_LoadStdPal(): void {
  LoadPalette(pal16(incbin("gStandardMenuPalette")), STD_WINDOW_PALETTE_NUM * 16, 20);
}

export function Menu_LoadStdPalAt(offset: number): void {
  LoadPalette(pal16(incbin("gStandardMenuPalette")), offset, 20);
}

export function LoadMenuMessageWindowGfx(windowId: number, destOffset: number, palOffset: number): void {
  LoadMenuMessageWindowGfxOnBg(GetWindowAttribute(windowId, WINDOW_BG), destOffset, palOffset);
}

/** GetUserWindowGraphics: returns tiles and palette for user's frame type. */
export function GetUserWindowGraphics(frameType = 0): { tiles: Uint8Array; palette: Uint16Array } {
  const frames = cdata<Array<{ tiles: { $sym: string }; palette: { $sym: string } }>>("text_window_graphics", "gUserFrames");
  const i = frameType >= frames.length ? 0 : frameType;
  const frame = frames[i];
  return {
    tiles: incbin(frame.tiles.$sym),
    palette: incbin16(frame.palette.$sym),
  };
}

/** LoadUserWindowGfxByFrameOnBg's window-backed counterpart (text_window.c). */
function LoadUserWindowGfxByFrame(windowId: number, frameType: number, destOffset: number, palOffset: number): void {
  LoadUserWindowGfxByFrameOnBg(GetWindowAttribute(windowId, WINDOW_BG), frameType, destOffset, palOffset);
}

/** LoadUserWindowGfx: the frame chosen in the options (optionsWindowFrameType, default frame 1). */
export function LoadUserWindowGfx(windowId: number, destOffset: number, palOffset: number, frameType = save.options.frameType): void {
  LoadUserWindowGfxByFrame(windowId, frameType, destOffset, palOffset);
}

/** LoadUserWindowGfx2 is the C alias for LoadUserWindowGfx. */
export function LoadUserWindowGfx2(windowId: number, destOffset: number, palOffset: number): void {
  LoadUserWindowGfx(windowId, destOffset, palOffset, save.options.frameType);
}

export function LoadStdWindowFrameGfx(): void {
  Menu_LoadStdPal();
  LoadMenuMessageWindowGfx(0, DLG_WINDOW_BASE_TILE_NUM, DLG_WINDOW_PALETTE_NUM * 16);
  LoadUserWindowGfx(0, STD_WINDOW_BASE_TILE_NUM, STD_WINDOW_PALETTE_NUM * 16);
}

export function GetStdWindowBaseTileNum(): number {
  return STD_WINDOW_BASE_TILE_NUM;
}

/** DrawDialogueFrame (non-signpost frame). */
export function DrawDialogueFrame(windowId: number, copyToVram: boolean): void {
  DrawDialogFrameWithCustomTileAndPalette(windowId, false, DLG_WINDOW_BASE_TILE_NUM, DLG_WINDOW_PALETTE_NUM);
  if (copyToVram) CopyWindowToVram(windowId, COPYWIN_FULL);
}

export function DrawStdWindowFrame(windowId: number, copyToVram: boolean): void {
  DrawStdFrameWithCustomTileAndPalette(windowId, copyToVram, STD_WINDOW_BASE_TILE_NUM, STD_WINDOW_PALETTE_NUM);
}

export function ClearDialogWindowAndFrame(windowId: number, copyToVram: boolean): void {
  CallWindowFunction(windowId, (bg, left, top, width, height) => FillBgTilemapBufferRect(bg, 0, left - 2, top - 1, width + 4, height + 2, STD_WINDOW_PALETTE_NUM));
  FillWindowPixelBuffer(windowId, PIXEL_FILL(1));
  ClearWindowTilemap(windowId);
  if (copyToVram) CopyWindowToVram(windowId, COPYWIN_FULL);
  if (gQuestLogState === C.QL_STATE_PLAYBACK) CommitQuestLogWindow1();
}

export function ClearStdWindowAndFrame(windowId: number, copyToVram: boolean): void {
  CallWindowFunction(windowId, (bg, left, top, width, height) => FillBgTilemapBufferRect(bg, 0, left - 1, top - 1, width + 2, height + 2, STD_WINDOW_PALETTE_NUM));
  FillWindowPixelBuffer(windowId, PIXEL_FILL(1));
  ClearWindowTilemap(windowId);
  if (copyToVram) CopyWindowToVram(windowId, COPYWIN_FULL);
}

export const FONTATTR_MAX_LETTER_WIDTH = 0;
export const FONTATTR_MAX_LETTER_HEIGHT = 1;
export const FONTATTR_LETTER_SPACING = 2;
export const FONTATTR_LINE_SPACING = 3;
export const FONTATTR_COLOR_FOREGROUND = 5;
export const FONTATTR_COLOR_BACKGROUND = 6;
export const FONTATTR_COLOR_SHADOW = 7;

export function GetFontAttribute(fontId: number, attributeId: number): number {
  const f = FONT_INFOS[fontId];
  switch (attributeId) {
    case FONTATTR_MAX_LETTER_WIDTH: return f.maxLetterWidth;
    case FONTATTR_MAX_LETTER_HEIGHT: return f.maxLetterHeight;
    case FONTATTR_LETTER_SPACING: return f.letterSpacing;
    case FONTATTR_LINE_SPACING: return f.lineSpacing;
    case FONTATTR_COLOR_FOREGROUND: return f.fgColor;
    case FONTATTR_COLOR_BACKGROUND: return f.bgColor;
    case FONTATTR_COLOR_SHADOW: return f.shadowColor;
    default: return 0;
  }
}

// ---------------------------------------------------------------- menu.c: top bar window

let sTopBarWindowId = 0xff;
const sTopBarWindowTextColors = [15, 1, 2];

export function CreateTopBarWindowLoadPalette(bg: number, width: number, yPos: number, palette: number, baseTile: number): number {
  const window: WindowTemplate = { bg: bg > 3 ? 0 : bg, tilemapLeft: 0x1e - width, tilemapTop: yPos, width, height: 2, paletteNum: palette, baseBlock: baseTile };
  sTopBarWindowId = AddWindow(window);
  LoadPalette(GetTextWindowPalette(2), (palette > 15 ? 15 : palette) * 16, 32);
  return sTopBarWindowId;
}

export function TopBarWindowPrintString(str: ArrayLike<number>, _unused: number, copyToVram: boolean): void {
  if (sTopBarWindowId === 0xff) return;
  PutWindowTilemap(sTopBarWindowId);
  FillWindowPixelBuffer(sTopBarWindowId, PIXEL_FILL(15));
  const width = GetStringWidth(FONT_SMALL, str, 0);
  AddTextPrinterParameterized3(sTopBarWindowId, FONT_SMALL, (-20 - width) & 0xff, 1, sTopBarWindowTextColors, 0, str);
  if (copyToVram) CopyWindowToVram(sTopBarWindowId, COPYWIN_FULL);
}

export function TopBarWindowPrintTwoStrings(str: ArrayLike<number>, str2: ArrayLike<number> | null, fgColorChooser: boolean, _unused: number, copyToVram: boolean): void {
  if (sTopBarWindowId === 0xff) return;
  const color = fgColorChooser ? [0, 1, 2] : [15, 1, 2];
  PutWindowTilemap(sTopBarWindowId);
  FillWindowPixelBuffer(sTopBarWindowId, PIXEL_FILL(15));
  if (str2) {
    const width = GetStringWidth(FONT_SMALL, str2, 0);
    AddTextPrinterParameterized3(sTopBarWindowId, FONT_SMALL, (-20 - width) & 0xff, 1, color, 0, str2);
  }
  AddTextPrinterParameterized4(sTopBarWindowId, FONT_NORMAL_COPY_1, 4, 1, 0, 0, color, 0, str);
  if (copyToVram) CopyWindowToVram(sTopBarWindowId, COPYWIN_FULL);
}

export function ClearTopBarWindow(): void {
  if (sTopBarWindowId === 0xff) return;
  FillWindowPixelBuffer(sTopBarWindowId, PIXEL_FILL(15));
  CopyWindowToVram(sTopBarWindowId, COPYWIN_FULL);
}

/** menu.c CopyTopBarWindowToVram. */
export function CopyTopBarWindowToVram(): void {
  if (sTopBarWindowId !== 0xff) CopyWindowToVram(sTopBarWindowId, COPYWIN_FULL);
}

export function DestroyTopBarWindow(): void {
  if (sTopBarWindowId === 0xff) return;
  FillWindowPixelBuffer(sTopBarWindowId, PIXEL_FILL(0));
  ClearWindowTilemap(sTopBarWindowId);
  CopyWindowToVram(sTopBarWindowId, COPYWIN_FULL);
  RemoveWindow(sTopBarWindowId);
  sTopBarWindowId = 0xff;
}

// ---------------------------------------------------------------- text.c: text cursor sprite

const TAG_CURSOR = 0x8000;
const CURSOR_DELAY = 8;

function SpriteCB_TextCursor(sprite: Sprite): void {
  if (sprite.data[0]) {
    sprite.data[0]--;
    return;
  }
  sprite.data[0] = CURSOR_DELAY;
  switch (sprite.data[1]) {
    case 0: sprite.y2 = 0; break;
    case 1: sprite.y2 = 1; break;
    case 2: sprite.y2 = 2; break;
    case 3:
      sprite.y2 = 1;
      sprite.data[1] = 0;
      return;
  }
  sprite.data[1]++;
}

const sSpriteTemplate_TextCursor: SpriteTemplate = {
  tileTag: TAG_CURSOR, paletteTag: TAG_CURSOR, oam: oamData({ shape: SPRITE_SHAPE("16x16"), size: SPRITE_SIZE("16x16") }),
  anims: gDummySpriteAnimTable, images: null, affineAnims: gDummySpriteAffineAnimTable, callback: SpriteCB_TextCursor,
};

export function CreateTextCursorSprite(sheetId: number, x: number, y: number, priority: number, subpriority: number): number {
  const tiles = incbin(sheetId & 1 ? "sDoubleArrowTiles2" : "sDoubleArrowTiles1");
  LoadSpriteSheet({ data: tiles, size: tiles.length, tag: TAG_CURSOR });
  LoadSpritePalette({ data: pal16(incbin("gStandardMenuPalette")), tag: TAG_CURSOR });
  const spriteId = CreateSprite(sSpriteTemplate_TextCursor, x + 3, y + 4, subpriority);
  gSprites[spriteId].oam.priority = priority & 3;
  gSprites[spriteId].oam.matrixNum = 0;
  gSprites[spriteId].data[0] = CURSOR_DELAY;
  return spriteId;
}

export function DestroyTextCursorSprite(spriteId: number): void {
  DestroySprite(gSprites[spriteId]);
  FreeSpriteTilesByTag(TAG_CURSOR);
  FreeSpritePaletteByTag(TAG_CURSOR);
}
