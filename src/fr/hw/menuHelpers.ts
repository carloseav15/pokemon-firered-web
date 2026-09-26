// menu_helpers.c, money.c, the scheduled-copy and tilemap helpers of
// new_menu_helpers.c, the followup helpers of task.c and item.c CopyItemName:
// the shared plumbing of the bag, party, PC and shop screens.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { expandPlaceholders, intToDecimal, stringVars, STR_CONV_MODE_LEFT_ALIGN } from "../gba/charmap";
import { FONT_FEMALE, FONT_INFOS, FONT_MALE, FONT_NORMAL, FONT_SMALL, stringWidth } from "../gba/font";
import { joy, DPAD_ANY, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, L_BUTTON, R_BUTTON } from "../gba/input";
import { tasks, type TaskFunc } from "../gba/tasks";
import { SetFontsPointer, textFlags } from "../gba/textPrinter";
import { rom } from "../rom";
import { save } from "../save";
import { itemName } from "../pokemon/items";
import { ItemIsMail } from "../pokemon/mail";
import { BG_COORD_SET, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, FillBgTilemapBufferRect, GetBgTilemapBuffer, LoadBgTiles, LoadBgTilemap } from "./bg";
import { BG_PLTT_ID, LoadPalette } from "./palette";
import { incbin16 } from "./assets";
import { SetGpuReg } from "./gpu";
import {
  ClearStdWindowAndFrameToTransparent, CreateYesNoMenu, DrawDialogFrameWithCustomTileAndPalette, DrawStdFrameWithCustomTileAndPalette, FONTATTR_COLOR_BACKGROUND, FONTATTR_COLOR_FOREGROUND,
  FONTATTR_COLOR_SHADOW, FONTATTR_LINE_SPACING, GetFontAttribute, MENU_B_PRESSED, Menu_ProcessInputNoWrapClearOnChoose,
  LoadStdWindowGfx, LoadStdWindowFrameGfx, LoadSignpostWindowGfx, LoadUserWindowGfx,
} from "./menu";
import { OAM_SIZE, PLTT_SIZE, REG_OFFSET_DISPCNT, ppu, VRAM_SIZE } from "./ppu";
import { SetHBlankCallback, SetVBlankCallback } from "./runtime";
import { AddTextPrinter, AddTextPrinterParameterized, AddTextPrinterParameterized2, DeactivateAllTextPrinters, IsTextPrinterActive, RunTextPrinters } from "./text";
import { AddWindow, ClearWindowTilemap, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, GetWindowAttribute, PutWindowTilemap, RemoveWindow, WINDOW_BG, WINDOW_HEIGHT, WINDOW_TILEMAP_LEFT, WINDOW_TILEMAP_TOP, WINDOW_WIDTH, COPYWIN_GFX, type WindowTemplate } from "./window";

export const MENU_L_PRESSED = 1, MENU_R_PRESSED = 2;
const REG_OFFSET_BG0CNT = 0x08;

export type YesNoFuncTable = { yesFunc: TaskFunc; noFunc: TaskFunc };
export type MenuAction = { text: ArrayLike<number> };

const u8str = (bytes: ArrayLike<number>): number[] => {
  const out: number[] = [];
  for (let i = 0; i < bytes.length && bytes[i] !== 0xff; i++) out.push(bytes[i]);
  return out;
};

/** Hooks the field layer provides (ContextNpcGetTextColor lives with the field message box). */
export const menuHelperHooks = { contextNpcGetTextColor: (): number => C.NPC_TEXT_COLOR_NEUTRAL };

// ---------------------------------------------------------------- menu_helpers.c

let sYesNo: YesNoFuncTable | null = null;
let sMessageNextTask: TaskFunc | null = null;
let sMessageWindowId = 0;

export function DisplayMessageAndContinueTask(taskId: number, windowId: number, tileNum: number, paletteNum: number, fontId: number, textSpeed: number, string: ArrayLike<number>, taskFunc: TaskFunc): void {
  sMessageWindowId = windowId;
  DrawDialogFrameWithCustomTileAndPalette(windowId, true, tileNum, paletteNum);
  if (string !== stringVars.var4) stringVars.var4 = expandPlaceholders(string);
  textFlags.canABSpeedUpPrint = true;
  AddTextPrinterParameterized2(windowId, fontId, stringVars.var4, textSpeed, null, 2, 1, 3);
  sMessageNextTask = taskFunc;
  tasks.setFunc(taskId, Task_ContinueTaskAfterMessagePrints);
}

export function RunTextPrinters_CheckActive(textPrinterId: number): boolean {
  RunTextPrinters();
  return IsTextPrinterActive(textPrinterId);
}

function Task_ContinueTaskAfterMessagePrints(taskId: number): void {
  if (!RunTextPrinters_CheckActive(sMessageWindowId)) sMessageNextTask?.(taskId);
}

function Task_CallYesOrNoCallback(taskId: number): void {
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case 0: sound.playSE(C.SE_SELECT); tasks.setFunc(taskId, sYesNo!.yesFunc); break;
    case 1:
    case MENU_B_PRESSED: sound.playSE(C.SE_SELECT); tasks.setFunc(taskId, sYesNo!.noFunc); break;
  }
}

export function CreateYesNoMenuWithCallbacks(taskId: number, template: WindowTemplate, fontId: number, left: number, top: number, tileStart: number, palette: number, yesNo: YesNoFuncTable): void {
  CreateYesNoMenu(template, fontId, left, top, tileStart, palette, 0);
  sYesNo = yesNo;
  tasks.setFunc(taskId, Task_CallYesOrNoCallback);
}

export function GetLRKeysPressed(): number {
  if (save.options.buttonMode === C.OPTIONS_BUTTON_MODE_LR) {
    if (joy.newKeys & L_BUTTON) return MENU_L_PRESSED;
    if (joy.newKeys & R_BUTTON) return MENU_R_PRESSED;
  }
  return 0;
}

export function GetLRKeysPressedAndHeld(): number {
  if (save.options.buttonMode === C.OPTIONS_BUTTON_MODE_LR) {
    if (joy.repeated & L_BUTTON) return MENU_L_PRESSED;
    if (joy.repeated & R_BUTTON) return MENU_R_PRESSED;
  }
  return 0;
}

/** IsHoldingItemAllowed (menu_helpers.c); InUnionRoom is absent in this port. */
export function IsHoldingItemAllowed(itemId: number): boolean {
  const tradeCenter = rom.c("MAP_TRADE_CENTER");
  const inTradeCenter = save.location.mapGroup === (tradeCenter >>> 8)
    && save.location.mapNum === (tradeCenter & 0xff);
  return itemId !== C.ITEM_ENIGMA_BERRY || !inTradeCenter;
}

/** IsWritingMailAllowed (menu_helpers.c), with link-state helpers always idle. */
export function IsWritingMailAllowed(itemId: number): boolean {
  return !MenuHelpers_IsLinkActive() || !ItemIsMail(itemId);
}
export function MenuHelpers_IsLinkActive(): boolean { return false; }

/** SetVBlankHBlankCallbacksToNull (menu_helpers.c). */
export function SetVBlankHBlankCallbacksToNull(): void {
  SetVBlankCallback(null);
  SetHBlankCallback(null);
}

/** ResetVramOamAndBgCntRegs (menu_helpers.c), with GBA byte sizes. */
export function ResetVramOamAndBgCntRegs(): void {
  ResetAllBgsCoordinatesAndBgCntRegs();
  ppu.vram.fill(0, 0, VRAM_SIZE);
  ppu.oam.fill(0, 0, OAM_SIZE / 2);
  ppu.pltt.fill(0, 0, PLTT_SIZE / 2);
}

export function ResetAllBgsCoordinatesAndBgCntRegs(): void {
  SetGpuReg(REG_OFFSET_DISPCNT, 0);
  for (let bg = 3; bg >= 0; bg--) SetGpuReg(REG_OFFSET_BG0CNT + bg * 2, 0);
  for (let bg = 0; bg < 4; bg++) { ChangeBgX(bg, 0, BG_COORD_SET); ChangeBgY(bg, 0, BG_COORD_SET); }
}

/** AdjustQuantityAccordingToDPadInput on `quantity.value` (the C s16 pointer). */
export function AdjustQuantityAccordingToDPadInput(quantity: { value: number }, qmax: number): boolean {
  const valBefore = quantity.value;
  const dpad = joy.repeated & DPAD_ANY;
  if (dpad === DPAD_UP) {
    quantity.value++;
    if (quantity.value > qmax) quantity.value = 1;
  } else if (dpad === DPAD_DOWN) {
    quantity.value--;
    if (quantity.value <= 0) quantity.value = qmax;
  } else if (dpad === DPAD_RIGHT) {
    quantity.value += 10;
    if (quantity.value > qmax) quantity.value = qmax;
  } else if (dpad === DPAD_LEFT) {
    quantity.value -= 10;
    if (quantity.value <= 0) quantity.value = 1;
  } else {
    return false;
  }
  if (quantity.value === valBefore) return false;
  sound.playSE(C.SE_SELECT);
  return true;
}

export function GetDialogBoxFontId(): number {
  return menuHelperHooks.contextNpcGetTextColor() === C.NPC_TEXT_COLOR_MALE ? FONT_MALE : FONT_FEMALE;
}

// ---------------------------------------------------------------- money.c

let sMoneyBoxWindowId = 0;

function moneyString(amount: number): Uint8Array {
  stringVars.var1 = intToDecimal(amount, STR_CONV_MODE_LEFT_ALIGN, 6);
  const pad = 6 - u8str(stringVars.var1).length;
  const out = [...new Array(Math.max(0, pad)).fill(0x00), ...u8str(expandPlaceholders(rom.text("gText_PokedollarVar1"))), 0xff];
  stringVars.var4 = Uint8Array.from(out);
  return stringVars.var4;
}

export function PrintMoneyAmountInMoneyBox(windowId: number, amount: number, speed: number): void {
  const str = moneyString(amount);
  AddTextPrinterParameterized(windowId, FONT_SMALL, str, 64 - stringWidth(FONT_SMALL, str, 0), 0xc, speed, null);
}

export function PrintMoneyAmount(windowId: number, x: number, y: number, amount: number, speed: number): void {
  AddTextPrinterParameterized(windowId, FONT_SMALL, moneyString(amount), x, y, speed, null);
}

export function PrintMoneyAmountInMoneyBoxWithBorder(windowId: number, tileStart: number, paletteNum: number, amount: number): void {
  DrawStdFrameWithCustomTileAndPalette(windowId, false, tileStart, paletteNum);
  AddTextPrinterParameterized(windowId, FONT_NORMAL, rom.text("gText_TrainerCardMoney"), 0, 0, 0xff, null);
  PrintMoneyAmountInMoneyBox(windowId, amount, 0);
}

/** ChangeAmountInMoneyBox (money.c). */
export function ChangeAmountInMoneyBox(amount: number): void {
  PrintMoneyAmountInMoneyBox(sMoneyBoxWindowId, amount, 0);
}

/** DrawMoneyBox (money.c): 8x3 window at the requested tilemap position. */
export function DrawMoneyBox(amount: number, x: number, y: number): void {
  const template: WindowTemplate = { bg: 0, tilemapLeft: x + 1, tilemapTop: y + 1, width: 8, height: 3, paletteNum: 15, baseBlock: 8 };
  sMoneyBoxWindowId = AddWindow(template);
  FillWindowPixelBuffer(sMoneyBoxWindowId, 0);
  PutWindowTilemap(sMoneyBoxWindowId);
  LoadStdWindowGfx(sMoneyBoxWindowId, 0x21d, BG_PLTT_ID(13));
  PrintMoneyAmountInMoneyBoxWithBorder(sMoneyBoxWindowId, 0x21d, 13, amount);
}

/** HideMoneyBox (money.c). */
export function HideMoneyBox(): void {
  ClearStdWindowAndFrameToTransparent(sMoneyBoxWindowId, false);
  CopyWindowToVram(sMoneyBoxWindowId, COPYWIN_GFX);
  RemoveWindow(sMoneyBoxWindowId);
}

// ---------------------------------------------------------------- coins.c

let sCoinsWindowId = 0;

function coinsString(amount: number): Uint8Array {
  stringVars.var1 = intToDecimal(amount & 0xffffffff, C.STR_CONV_MODE_RIGHT_ALIGN, 4);
  return expandPlaceholders(rom.text("gText_Coins"));
}

/** PrintCoinsString_Parameterized (coins.c). */
function PrintCoinsString_Parameterized(windowId: number, amount: number, x: number, y: number, speed: number): void {
  AddTextPrinterParameterized(windowId, FONT_SMALL, coinsString(amount), x, y, speed, null);
}

/** ShowCoinsWindow_Parameterized (coins.c, unused by the original game). */
function ShowCoinsWindow_Parameterized(windowId: number, tileStart: number, palette: number, amount: number): void {
  DrawStdFrameWithCustomTileAndPalette(windowId, false, tileStart, palette);
  AddTextPrinterParameterized(windowId, FONT_NORMAL, rom.text("gText_Coins_2"), 0, 0, 0xff, null);
  PrintCoinsString_Parameterized(windowId, amount, 0x10, 0x0c, 0);
}

/** PrintCoinsString (coins.c), right aligned within the 64 pixel window. */
export function PrintCoinsString(amount: number): void {
  const string = coinsString(amount);
  const width = stringWidth(FONT_SMALL, string, 0);
  AddTextPrinterParameterized(sCoinsWindowId, FONT_SMALL, string, 64 - width, 0x0c, 0, null);
}

/** ShowCoinsWindow (coins.c): frame, label, and four digit balance. */
export function ShowCoinsWindow(amount: number, x: number, y: number): void {
  const template: WindowTemplate = { bg: 0, tilemapLeft: x + 1, tilemapTop: y + 1, width: 8, height: 3, paletteNum: 0x0f, baseBlock: 0x20 };
  sCoinsWindowId = AddWindow(template);
  FillWindowPixelBuffer(sCoinsWindowId, 0);
  PutWindowTilemap(sCoinsWindowId);
  LoadStdWindowGfx(sCoinsWindowId, 0x21d, BG_PLTT_ID(13));
  DrawStdFrameWithCustomTileAndPalette(sCoinsWindowId, false, 0x21d, 13);
  AddTextPrinterParameterized(sCoinsWindowId, FONT_NORMAL, rom.text("gText_Coins_2"), 0, 0, 0xff, null);
  PrintCoinsString(amount);
}

/** HideCoinsWindow (coins.c). */
export function HideCoinsWindow(): void {
  ClearWindowTilemap(sCoinsWindowId);
  ClearStdWindowAndFrameToTransparent(sCoinsWindowId, true);
  RemoveWindow(sCoinsWindowId);
}


// ---------------------------------------------------------------- text_window.c / new_menu_helpers.c

export function DrawTextBorderOuter(windowId: number, tileNum: number, palNum: number): void {
  const bg = GetWindowAttribute(windowId, WINDOW_BG);
  const left = GetWindowAttribute(windowId, WINDOW_TILEMAP_LEFT);
  const top = GetWindowAttribute(windowId, WINDOW_TILEMAP_TOP);
  const width = GetWindowAttribute(windowId, WINDOW_WIDTH);
  const height = GetWindowAttribute(windowId, WINDOW_HEIGHT);
  FillBgTilemapBufferRect(bg, tileNum + 0, left - 1, top - 1, 1, 1, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 1, left, top - 1, width, 1, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 2, left + width, top - 1, 1, 1, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 3, left - 1, top, 1, height, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 5, left + width, top, 1, height, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 6, left - 1, top + height, 1, 1, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 7, left, top + height, width, 1, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 8, left + width, top + height, 1, 1, palNum);
}

/** DrawTextBorderInner (text_window.c): draw an eight-tile border inside the window bounds. */
export function DrawTextBorderInner(windowId: number, tileNum: number, palNum: number): void {
  const bg = GetWindowAttribute(windowId, WINDOW_BG);
  const left = GetWindowAttribute(windowId, WINDOW_TILEMAP_LEFT);
  const top = GetWindowAttribute(windowId, WINDOW_TILEMAP_TOP);
  const width = GetWindowAttribute(windowId, WINDOW_WIDTH);
  const height = GetWindowAttribute(windowId, WINDOW_HEIGHT);
  FillBgTilemapBufferRect(bg, tileNum, left, top, 1, 1, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 1, left + 1, top, width - 2, 1, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 2, left + width - 1, top, 1, 1, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 3, left, top + 1, 1, height - 2, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 5, left + width - 1, top + 1, 1, height - 2, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 6, left, top + height - 1, 1, 1, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 7, left + 1, top + height - 1, width - 2, 1, palNum);
  FillBgTilemapBufferRect(bg, tileNum + 8, left + width - 1, top + height - 1, 1, 1, palNum);
}

/** rbox_fill_rectangle (text_window.c): clear the window and its one-tile margin. */
export function rbox_fill_rectangle(windowId: number): void {
  const bg = GetWindowAttribute(windowId, WINDOW_BG);
  const left = GetWindowAttribute(windowId, WINDOW_TILEMAP_LEFT);
  const top = GetWindowAttribute(windowId, WINDOW_TILEMAP_TOP);
  const width = GetWindowAttribute(windowId, WINDOW_WIDTH);
  const height = GetWindowAttribute(windowId, WINDOW_HEIGHT);
  FillBgTilemapBufferRect(bg, 0, left - 1, top - 1, width + 2, height + 2, 17);
}

export function SetBgTilemapPalette(bgId: number, left: number, top: number, width: number, height: number, palette: number): void {
  const ptr = GetBgTilemapBuffer(bgId);
  if (!ptr) return;
  for (let i = top; i < top + height; i++) {
    for (let j = left; j < left + width; j++) ptr[i * 32 + j] = (ptr[i * 32 + j] & 0xfff) | (palette << 12);
  }
}

const sScheduledBgCopiesToVram = [false, false, false, false];

export function ClearScheduledBgCopiesToVram(): void { sScheduledBgCopiesToVram.fill(false); }
export function ScheduleBgCopyTilemapToVram(bgId: number): void { sScheduledBgCopiesToVram[bgId] = true; }

export function DoScheduledBgTilemapCopiesToVram(): void {
  for (let bg = 0; bg < 4; bg++) {
    if (sScheduledBgCopiesToVram[bg]) { CopyBgTilemapBufferToVram(bg); sScheduledBgCopiesToVram[bg] = false; }
  }
}

/** new_menu_helpers.c CopyToBufferFromBgTilemap: row-major copy from the 32-tile-wide BG buffer. */
export function CopyToBufferFromBgTilemap(bgId: number, dest: number[] | Uint16Array, left: number, top: number, width: number, height: number): void {
  const source = GetBgTilemapBuffer(bgId);
  if (!source) return;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) dest[y * width + x] = source[(y + top) * 32 + x + left];
}

/** new_menu_helpers.c ResetBgPositions. */
export function ResetBgPositions(): void {
  for (let bg = 0; bg < 4; bg++) { ChangeBgX(bg, 0, BG_COORD_SET); ChangeBgY(bg, 0, BG_COORD_SET); }
}

/** new_menu_helpers.c InitTextBoxGfxAndPrinters. */
export function InitTextBoxGfxAndPrinters(): void {
  ResetBgPositions();
  DeactivateAllTextPrinters();
  LoadStdWindowFrameGfx();
}

/** new_menu_helpers.c FreeAllOverworldWindowBuffers. */
export function FreeAllOverworldWindowBuffers(): void { FreeAllWindowBuffers(); }

/** new_menu_helpers.c RunTextPrinters_CheckPrinter0Active. */
export function RunTextPrinters_CheckPrinter0Active(): number {
  RunTextPrinters();
  return IsTextPrinterActive(0) ? 1 : 0;
}

/** new_menu_helpers.c AddTextPrinterForMessage. */
export function AddTextPrinterForMessage(allowSkippingDelayWithButtonPress: boolean): void {
  textFlags.canABSpeedUpPrint = allowSkippingDelayWithButtonPress;
  AddTextPrinterParameterized2(0, FONT_NORMAL, stringVars.var4, GetTextSpeedSetting(), null, 2, 1, 3);
}

/** new_menu_helpers.c AddTextPrinterWithCustomSpeedForMessage. */
export function AddTextPrinterWithCustomSpeedForMessage(allowSkippingDelayWithButtonPress: boolean, speed: number): void {
  textFlags.canABSpeedUpPrint = allowSkippingDelayWithButtonPress;
  AddTextPrinterParameterized2(0, FONT_NORMAL, stringVars.var4, speed & 0xff, null, 2, 1, 3);
}

/** new_menu_helpers.c EraseFieldMessageBox. */
export function EraseFieldMessageBox(copyToVram: boolean): void {
  FillBgTilemapBufferRect(0, 0, 0, 0, 32, 32, 17);
  if (copyToVram) CopyBgTilemapBufferToVram(0);
}

let sStartMenuWindowId = 0xff;
/** new_menu_helpers.c CreateStartMenuWindow: preserve the original tilemap geometry and singleton lifetime. */
export function CreateStartMenuWindow(height: number): number {
  if (sStartMenuWindowId === 0xff) {
    const template: WindowTemplate = { bg: 0, tilemapLeft: 0x16, tilemapTop: 1, width: 7, height: (height * 2 - 1) & 0xff, paletteNum: 15, baseBlock: 0x13d };
    sStartMenuWindowId = AddWindow(template);
    PutWindowTilemap(sStartMenuWindowId);
  }
  return sStartMenuWindowId;
}

export function GetStartMenuWindowId(): number { return sStartMenuWindowId; }

/** new_menu_helpers.c RemoveStartMenuWindow. */
export function RemoveStartMenuWindow(): void {
  if (sStartMenuWindowId !== 0xff) { RemoveWindow(sStartMenuWindowId); sStartMenuWindowId = 0xff; }
}

/** new_menu_helpers.c GetTextSpeedSetting uses the original frame-delay table. */
export function GetTextSpeedSetting(): number {
  if (save.options.textSpeed > C.OPTIONS_TEXT_SPEED_FAST) save.options.textSpeed = C.OPTIONS_TEXT_SPEED_MID;
  return [8, 4, 1][save.options.textSpeed];
}

/** new_menu_helpers.c MallocAndDecompress: INCBIN bytes have already been decompressed by tools/decomp. */
export function MallocAndDecompress(src: ArrayLike<number>): Uint8Array {
  return Uint8Array.from(src, (byte) => byte & 0xff);
}

/** new_menu_helpers.c CopyDecompressedTileDataToVram, with the browser BG loader as the DMA destination. */
export function CopyDecompressedTileDataToVram(bgId: number, src: ArrayLike<number>, size: number, offset: number, mode: number): number {
  return mode === 1 ? LoadBgTilemap(bgId, src, size, offset) : LoadBgTiles(bgId, src, size, offset);
}

/** new_menu_helpers.c DecompressAndCopyTileDataToVram2. */
export function DecompressAndCopyTileDataToVram2(bgId: number, src: ArrayLike<number>, size: number, offset: number, mode: number): Uint8Array | null {
  const bytes = MallocAndDecompress(src);
  const count = Math.min(bytes.length, size >>> 0);
  if (!count) return bytes;
  CopyDecompressedTileDataToVram(bgId, bytes, count, offset, mode);
  return bytes;
}

/** new_menu_helpers.c DecompressAndLoadBgGfxUsingHeap: DMA completes synchronously in this PPU. */
export function DecompressAndLoadBgGfxUsingHeap(bgId: number, src: ArrayLike<number>, size: number, offset: number, mode: number): void {
  const bytes = MallocAndDecompress(src);
  CopyDecompressedTileDataToVram(bgId, bytes, size === 0 ? bytes.length : size, offset, mode);
}

/** new_menu_helpers.c DecompressAndLoadBgGfxUsingHeap2. */
export function DecompressAndLoadBgGfxUsingHeap2(bgId: number, src: ArrayLike<number>, size: number, offset: number, mode: number): void {
  const bytes = MallocAndDecompress(src);
  CopyDecompressedTileDataToVram(bgId, bytes, Math.min(bytes.length, size >>> 0), offset, mode);
}

/** new_menu_helpers.c WindowFunc_DrawStandardFrame. */
export function WindowFunc_DrawStandardFrame(bg: number, left: number, top: number, width: number, height: number, _paletteNum: number): void {
  const f = (tile: number, x: number, y: number, w: number, h: number) => FillBgTilemapBufferRect(bg, tile, x, y, w, h, 14);
  f(0x214, left - 1, top - 1, 1, 1); f(0x215, left, top - 1, width, 1); f(0x216, left + width, top - 1, 1, 1);
  f(0x217, left - 1, top, 1, height); f(0x219, left + width, top, 1, height);
  f(0x21a, left - 1, top + height, 1, 1); f(0x21b, left, top + height, width, 1); f(0x21c, left + width, top + height, 1, 1);
}

/** new_menu_helpers.c WindowFunc_ClearStdWindowAndFrame. */
export function WindowFunc_ClearStdWindowAndFrame(bg: number, left: number, top: number, width: number, height: number, _paletteNum: number): void {
  FillBgTilemapBufferRect(bg, 0, left - 1, top - 1, width + 2, height + 2, 14);
}

/** new_menu_helpers.c WindowFunc_ClearDialogWindowAndFrame. */
export function WindowFunc_ClearDialogWindowAndFrame(bg: number, left: number, top: number, width: number, height: number, _paletteNum: number): void {
  FillBgTilemapBufferRect(bg, 0, left - 2, top - 1, width + 4, height + 2, 14);
}

/** new_menu_helpers.c GetStdPalColor (the value is in exported original palette data). */
export function GetStdPalColor(colorNum: number): number {
  const colors = incbin16("gStandardMenuPalette");
  return colors[colorNum > 15 ? 0 : colorNum] ?? 0;
}

/** new_menu_helpers.c GetDlgWindowBaseTileNum. */
export function GetDlgWindowBaseTileNum(): number { return 0x200; }

/** new_menu_helpers.c LoadSignpostWindowFrameGfx. */
export function LoadSignpostWindowFrameGfx(): void {
  LoadPalette(incbin16("gStandardMenuPalette"), BG_PLTT_ID(14), 10 * 2);
  LoadSignpostWindowGfx(0, 0x200, BG_PLTT_ID(15));
  LoadUserWindowGfx(0, 0x214, BG_PLTT_ID(14));
}

/** new_menu_helpers.c SetDefaultFontsPointer. */
export function SetDefaultFontsPointer(): void { SetFontsPointer(FONT_INFOS); }

/** menu.c AddItemMenuActionTextPrinters: the actions of `orderArray`, one per line. */
export function AddItemMenuActionTextPrinters(windowId: number, fontId: number, left: number, top: number, letterSpacing: number, lineHeight: number,
  itemCount: number, strs: MenuAction[], orderArray: ArrayLike<number>): void {
  for (let i = 0; i < itemCount; i++) {
    AddTextPrinter({
      windowId, fontId, x: left, y: lineHeight * i + top, letterSpacing, lineSpacing: GetFontAttribute(fontId, FONTATTR_LINE_SPACING),
      fgColor: GetFontAttribute(fontId, FONTATTR_COLOR_FOREGROUND), bgColor: GetFontAttribute(fontId, FONTATTR_COLOR_BACKGROUND),
      shadowColor: GetFontAttribute(fontId, FONTATTR_COLOR_SHADOW),
    }, strs[orderArray[i]].text, 0xff, null);
  }
}

// ---------------------------------------------------------------- task.c

export function SetTaskFuncWithFollowupFunc(taskId: number, func: TaskFunc, followupFunc: TaskFunc): void {
  tasks.tasks[taskId].followup = followupFunc;
  tasks.setFunc(taskId, func);
}

export function SwitchTaskToFollowupFunc(taskId: number): void {
  const followup = tasks.tasks[taskId].followup;
  if (followup) tasks.setFunc(taskId, followup);
}

export function FuncIsActiveTask(func: TaskFunc): boolean {
  return tasks.tasks.some((t) => t.isActive && t.func === func);
}

export function FindTaskIdByFunc(func: TaskFunc): number {
  return tasks.findByFunc(func);
}

export function GetTaskCount(): number {
  return tasks.count();
}

export function SetWordTaskArg(taskId: number, dataElem: number, value: number): void {
  tasks.setWordArg(taskId, dataElem, value);
}

export function GetWordTaskArg(taskId: number, dataElem: number): number {
  return tasks.getWordArg(taskId, dataElem);
}

// ---------------------------------------------------------------- item.c

/** CopyItemName (the Enigma Berry name comes from the e-Reader berry, which the port never receives). */
export function CopyItemName(itemId: number): Uint8Array {
  return Uint8Array.from([...u8str(itemName(itemId)), 0xff]);
}
