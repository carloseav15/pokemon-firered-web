// menu.c / text_window.c / new_menu_helpers.c helpers on the GBA hardware layer:
// standard window frames, the single-column cursor menu (sMenu) and the YES/NO menu.

import { sound } from "../audio/sound";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, joy, JOY_NEW } from "../gba/input";
import { FONT_INFOS, FONT_NORMAL_COPY_1, FONT_SMALL, stringWidth } from "../gba/font";
import { cdata, incbin, incbin16 } from "./assets";
import { ChangeBgX, ChangeBgY, FillBgTilemapBufferRect, LoadBgTiles } from "./bg";
import { LoadPalette } from "./palette";
import { AddTextPrinter, AddTextPrinterParameterized, AddTextPrinterParameterized3, AddTextPrinterParameterized4, DeactivateAllTextPrinters } from "./text";
import { save } from "../save";
import {
  CreateSprite, DestroySprite, FreeSpritePaletteByTag, FreeSpriteTilesByTag, gDummySpriteAffineAnimTable, gDummySpriteAnimTable, gSprites, LoadSpritePalette,
  LoadSpriteSheet, oamData, SPRITE_SHAPE, SPRITE_SIZE, type Sprite, type SpriteTemplate,
} from "./sprite";
import {
  AddWindow, CallWindowFunction, InitWindows, ClearWindowTilemap, CopyWindowToVram, COPYWIN_FULL, COPYWIN_GFX, FillWindowPixelBuffer, FillWindowPixelRect, GetWindowAttribute,
  PIXEL_FILL, PutWindowTilemap, RemoveWindow, WINDOW_BG, type WindowTemplate,
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

// ---------------------------------------------------------------- text_window.c

/** GetTextWindowPalette: 16 colors of gTextWindowPalettes[id] (id 4+ -> 4). */
export function GetTextWindowPalette(id: number): Uint8Array {
  const all = incbin("gTextWindowPalettes");
  const paletteId = id & 0xff;
  const i = paletteId < 4 ? paletteId : 4;
  return all.subarray(i * 32, i * 32 + 32);
}

export function LoadStdWindowGfx(windowId: number, destOffset: number, palOffset: number): void {
  LoadBgTiles(GetWindowAttribute(windowId, WINDOW_BG), incbin("gStdTextWindow_Gfx"), 0x120, destOffset);
  LoadPalette(GetTextWindowPalette(3), palOffset, 32);
}

export function LoadStdWindowGfxOnBg(bgId: number, destOffset: number, palOffset: number): void {
  LoadBgTiles(bgId, incbin("gStdTextWindow_Gfx"), 0x120, destOffset);
  LoadPalette(GetTextWindowPalette(3), palOffset, 32);
}

/** LoadSignpostWindowGfx (text_window.c). */
export function LoadSignpostWindowGfx(windowId: number, destOffset: number, palOffset: number): void {
  LoadBgTiles(GetWindowAttribute(windowId, WINDOW_BG), incbin("gSignpostWindow_Gfx"), 0x260, destOffset);
  LoadPalette(GetTextWindowPalette(1), palOffset, 32);
}

/** LoadHelpMessageWindowGfx (text_window.c). */
export function LoadHelpMessageWindowGfx(windowId: number, destOffset: number, palOffset: number): void {
  LoadBgTiles(GetWindowAttribute(windowId, WINDOW_BG), incbin("gHelpMessageWindow_Gfx"), 0x280, destOffset);
  LoadPalette(GetTextWindowPalette(2), palOffset, 32);
}

/** LoadStdWindowTiles (text_window.c), tiles only. */
export function LoadStdWindowTiles(windowId: number, destOffset: number): void {
  LoadBgTiles(GetWindowAttribute(windowId, WINDOW_BG), incbin("gStdTextWindow_Gfx"), 0x120, destOffset);
}

/** LoadQuestLogWindowTiles (text_window.c), tiles only. */
export function LoadQuestLogWindowTiles(windowId: number, destOffset: number): void {
  LoadBgTiles(GetWindowAttribute(windowId, WINDOW_BG), incbin("gQuestLogWindow_Gfx"), 0x280, destOffset);
}

// ---------------------------------------------------------------- frames

let sTileNum = 0;
let sPaletteNum = 0;

export function DrawStdFrameWithCustomTileAndPalette(windowId: number, copyToVram: boolean, baseTileNum: number, paletteNum: number): void {
  sTileNum = baseTileNum;
  sPaletteNum = paletteNum;
  CallWindowFunction(windowId, (bg, left, top, width, height) => {
    const F = (tile: number, x: number, y: number, w: number, h: number) => FillBgTilemapBufferRect(bg, tile, x, y, w, h, sPaletteNum);
    F(sTileNum, left - 1, top - 1, 1, 1);
    F(sTileNum + 1, left, top - 1, width, 1);
    F(sTileNum + 2, left + width, top - 1, 1, 1);
    F(sTileNum + 3, left - 1, top, 1, height);
    F(sTileNum + 5, left + width, top, 1, height);
    F(sTileNum + 6, left - 1, top + height, 1, 1);
    F(sTileNum + 7, left, top + height, width, 1);
    F(sTileNum + 8, left + width, top + height, 1, 1);
  });
  FillWindowPixelBuffer(windowId, PIXEL_FILL(1));
  PutWindowTilemap(windowId);
  if (copyToVram) CopyWindowToVram(windowId, COPYWIN_FULL);
}

export function ClearStdWindowAndFrameToTransparent(windowId: number, copyToVram: boolean): void {
  CallWindowFunction(windowId, (bg, left, top, width, height) => FillBgTilemapBufferRect(bg, 0, left - 1, top - 1, width + 2, height + 2, 0));
  FillWindowPixelBuffer(windowId, PIXEL_FILL(0));
  ClearWindowTilemap(windowId);
  if (copyToVram) CopyWindowToVram(windowId, COPYWIN_FULL);
}

const BG_TILE_V_FLIP = (n: number) => n | 0x800;

export function DrawDialogFrameWithCustomTileAndPalette(windowId: number, copyToVram: boolean, tileNum: number, paletteNum: number): void {
  sTileNum = tileNum;
  sPaletteNum = paletteNum;
  CallWindowFunction(windowId, (bg, left, top, width) => {
    const F = (tile: number, x: number, y: number, w: number) => FillBgTilemapBufferRect(bg, tile, x, y, w, 1, sPaletteNum);
    const t = sTileNum;
    F(t, left - 2, top - 1, 1);
    F(t + 1, left - 1, top - 1, 1);
    F(t + 2, left, top - 1, width);
    F(t + 3, left + width, top - 1, 1);
    F(t + 4, left + width + 1, top - 1, 1);
    F(t + 5, left - 2, top, 1);
    F(t + 6, left - 1, top, 1);
    F(t + 8, left + width, top, 1);
    F(t + 9, left + width + 1, top, 1);
    F(t + 10, left - 2, top + 1, 1);
    F(t + 11, left - 1, top + 1, 1);
    F(t + 12, left + width, top + 1, 1);
    F(t + 13, left + width + 1, top + 1, 1);
    F(BG_TILE_V_FLIP(t + 10), left - 2, top + 2, 1);
    F(BG_TILE_V_FLIP(t + 11), left - 1, top + 2, 1);
    F(BG_TILE_V_FLIP(t + 12), left + width, top + 2, 1);
    F(BG_TILE_V_FLIP(t + 13), left + width + 1, top + 2, 1);
    F(BG_TILE_V_FLIP(t + 5), left - 2, top + 3, 1);
    F(BG_TILE_V_FLIP(t + 6), left - 1, top + 3, 1);
    F(BG_TILE_V_FLIP(t + 8), left + width, top + 3, 1);
    F(BG_TILE_V_FLIP(t + 9), left + width + 1, top + 3, 1);
    F(BG_TILE_V_FLIP(t), left - 2, top + 4, 1);
    F(BG_TILE_V_FLIP(t + 1), left - 1, top + 4, 1);
    F(BG_TILE_V_FLIP(t + 2), left, top + 4, width);
    F(BG_TILE_V_FLIP(t + 3), left + width, top + 4, 1);
    F(BG_TILE_V_FLIP(t + 4), left + width + 1, top + 4, 1);
  });
  FillWindowPixelBuffer(windowId, PIXEL_FILL(1));
  PutWindowTilemap(windowId);
  if (copyToVram) CopyWindowToVram(windowId, COPYWIN_FULL);
}

export function ClearDialogWindowAndFrameToTransparent(windowId: number, copyToVram: boolean): void {
  CallWindowFunction(windowId, (bg, left, top, width, height) => FillBgTilemapBufferRect(bg, 0, left - 2, top - 1, width + 4, height + 2, 0));
  FillWindowPixelBuffer(windowId, PIXEL_FILL(0));
  ClearWindowTilemap(windowId);
  if (copyToVram) CopyWindowToVram(windowId, COPYWIN_FULL);
}

// ---------------------------------------------------------------- sMenu

const sMenu = { left: 0, top: 0, cursorPos: 0, minCursorPos: 0, maxCursorPos: 0, windowId: 0, fontId: 0, optionHeight: 0, APressMuted: false };

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
  LoadBgTiles(GetWindowAttribute(windowId, WINDOW_BG), incbin("gMenuMessageWindow_Gfx"), 0x280, destOffset);
  LoadPalette(GetTextWindowPalette(0), palOffset, 32);
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

/** LoadUserWindowGfx: the frame chosen in the options (optionsWindowFrameType, default frame 1). */
export function LoadUserWindowGfx(windowId: number, destOffset: number, palOffset: number, frameType = save.options.frameType): void {
  const gfx = GetUserWindowGraphics(frameType);
  LoadBgTiles(GetWindowAttribute(windowId, WINDOW_BG), gfx.tiles, 0x120, destOffset);
  LoadPalette(gfx.palette, palOffset, 32);
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
  const width = stringWidth(FONT_SMALL, str, 0);
  AddTextPrinterParameterized3(sTopBarWindowId, FONT_SMALL, (-20 - width) & 0xff, 1, sTopBarWindowTextColors, 0, str);
  if (copyToVram) CopyWindowToVram(sTopBarWindowId, COPYWIN_FULL);
}

export function TopBarWindowPrintTwoStrings(str: ArrayLike<number>, str2: ArrayLike<number> | null, fgColorChooser: boolean, _unused: number, copyToVram: boolean): void {
  if (sTopBarWindowId === 0xff) return;
  const color = fgColorChooser ? [0, 1, 2] : [15, 1, 2];
  PutWindowTilemap(sTopBarWindowId);
  FillWindowPixelBuffer(sTopBarWindowId, PIXEL_FILL(15));
  if (str2) {
    const width = stringWidth(FONT_SMALL, str2, 0);
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
