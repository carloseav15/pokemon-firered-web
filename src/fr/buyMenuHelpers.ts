// buy_menu_helpers.c: windows, money box, text and confirm dialog helpers of
// the Poké Mart buy screen (shop.c). Direct port; GetMartFontId comes from shop.ts
// (a call-time import cycle, as in the C).
// Needs loadCData("buy_menu_helpers", "strings", "text_window_graphics").

import { FONT_NORMAL } from "./gba/font";
import { getTextSpeedSetting } from "./gba/textPrinter";
import type { TaskFunc } from "./gba/tasks";
import { cdata } from "./hw/assets";
import {
  DrawStdFrameWithCustomTileAndPalette, LoadMenuMessageWindowGfx, LoadStdWindowGfx, LoadUserWindowGfx,
} from "./hw/menu";
import {
  CreateYesNoMenuWithCallbacks, DisplayMessageAndContinueTask, PrintMoneyAmountInMoneyBoxWithBorder, ScheduleBgCopyTilemapToVram, type YesNoFuncTable,
} from "./hw/menuHelpers";
import { BG_PLTT_ID } from "./hw/palette";
import { AddTextPrinterParameterized4, DeactivateAllTextPrinters } from "./hw/text";
import { InitWindows, PutWindowTilemap, type WindowTemplate } from "./hw/window";
import { save } from "./save";
import { GetMartFontId } from "./shop";

const rd = <T>(name: string) => cdata<T>("buy_menu_helpers", name);

/** BuyMenuInitWindows */
export function BuyMenuInitWindows(isSellingTM: boolean): void {
  if (isSellingTM !== true) InitWindows(rd<WindowTemplate[]>("sShopBuyMenuWindowTemplatesNormal"));
  else InitWindows(rd<WindowTemplate[]>("sShopBuyMenuWindowTemplatesTM"));
  DeactivateAllTextPrinters();
  LoadUserWindowGfx(0, 0x1, BG_PLTT_ID(13));
  LoadMenuMessageWindowGfx(0, 0x13, BG_PLTT_ID(14));
  LoadStdWindowGfx(0, 0xa, BG_PLTT_ID(15));
  PutWindowTilemap(0);
  PutWindowTilemap(4);
  PutWindowTilemap(5);
  if (isSellingTM === true) PutWindowTilemap(6);
}

/** BuyMenuDrawMoneyBox */
export function BuyMenuDrawMoneyBox(): void {
  PrintMoneyAmountInMoneyBoxWithBorder(0, 0xa, 0xf, save.money);
}

/** BuyMenuPrint */
export function BuyMenuPrint(windowId: number, font: number, text: ArrayLike<number>, x: number, y: number, letterSpacing: number, lineSpacing: number, speed: number, color: number): void {
  AddTextPrinterParameterized4(windowId, font, x, y, letterSpacing, lineSpacing, rd<number[][]>("sShopBuyMenuTextColors")[color], speed, text);
}

/** BuyMenuDisplayMessage */
export function BuyMenuDisplayMessage(taskId: number, text: ArrayLike<number>, callback: TaskFunc): void {
  DisplayMessageAndContinueTask(taskId, 2, 0x13, 0xe, GetMartFontId(), getTextSpeedSetting(), text, callback);
  ScheduleBgCopyTilemapToVram(0);
}

/** BuyMenuQuantityBoxNormalBorder */
export function BuyMenuQuantityBoxNormalBorder(windowId: number, copyToVram: boolean): void {
  DrawStdFrameWithCustomTileAndPalette(windowId, copyToVram, 0x1, 13);
}

/** BuyMenuQuantityBoxThinBorder */
export function BuyMenuQuantityBoxThinBorder(windowId: number, copyToVram: boolean): void {
  DrawStdFrameWithCustomTileAndPalette(windowId, copyToVram, 0xa, 15);
}

/** BuyMenuConfirmPurchase */
export function BuyMenuConfirmPurchase(taskId: number, yesNo: YesNoFuncTable): void {
  CreateYesNoMenuWithCallbacks(taskId, rd<WindowTemplate>("sShopBuyMenuYesNoWindowTemplate"), FONT_NORMAL, 0, 2, 1, 13, yesNo);
}
