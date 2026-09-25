// menu_helpers.c, money.c, the scheduled-copy and tilemap helpers of
// new_menu_helpers.c, the followup helpers of task.c and item.c CopyItemName:
// the shared plumbing of the bag, party, PC and shop screens.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { expandPlaceholders, intToDecimal, stringVars, STR_CONV_MODE_LEFT_ALIGN } from "../gba/charmap";
import { FONT_FEMALE, FONT_MALE, FONT_NORMAL, FONT_SMALL, stringWidth } from "../gba/font";
import { joy, DPAD_ANY, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, L_BUTTON, R_BUTTON } from "../gba/input";
import { tasks, type TaskFunc } from "../gba/tasks";
import { textFlags } from "../gba/textPrinter";
import { rom } from "../rom";
import { save } from "../save";
import { itemName } from "../pokemon/items";
import { BG_COORD_SET, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, FillBgTilemapBufferRect, GetBgTilemapBuffer } from "./bg";
import { SetGpuReg } from "./gpu";
import {
  CreateYesNoMenu, DrawDialogFrameWithCustomTileAndPalette, DrawStdFrameWithCustomTileAndPalette, FONTATTR_COLOR_BACKGROUND, FONTATTR_COLOR_FOREGROUND,
  FONTATTR_COLOR_SHADOW, FONTATTR_LINE_SPACING, GetFontAttribute, MENU_B_PRESSED, Menu_ProcessInputNoWrapClearOnChoose,
} from "./menu";
import { REG_OFFSET_DISPCNT } from "./ppu";
import { AddTextPrinter, AddTextPrinterParameterized, AddTextPrinterParameterized2, IsTextPrinterActive, RunTextPrinters } from "./text";
import { GetWindowAttribute, WINDOW_BG, WINDOW_HEIGHT, WINDOW_TILEMAP_LEFT, WINDOW_TILEMAP_TOP, WINDOW_WIDTH, type WindowTemplate } from "./window";

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

/** No link or Union Room in the browser: holding and mail writing are always allowed. */
export function IsHoldingItemAllowed(_itemId: number): boolean { return true; }
export function IsWritingMailAllowed(_itemId: number): boolean { return true; }
export function MenuHelpers_IsLinkActive(): boolean { return false; }

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
