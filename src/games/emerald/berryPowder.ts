// pokeemerald berry_powder.c: the specials of the Slateport powder vendor.
// ADAPTATION: the web save keeps the amount in plaintext (SaveData.berryPowder, as the FireRed port does), so
// DecryptBerryPowder / SetBerryPowder do not XOR with the encryption key. The window is a Canvas field window.
import { intToDecimal, STR_CONV_MODE_RIGHT_ALIGN } from "@core/gba/charmap";
import { FONT_NORMAL } from "@core/gba/font";
import { printText } from "@core/gba/textPrinter";
import { Window } from "@core/gba/window";
import { rom } from "@core/rom";
import type { ScriptRunner } from "@core/script/context";
import { save, SV, varGet } from "@game/save";

/** berry_powder.c GetBerryPowder */
export function GetBerryPowder(): number { return (save.berryPowder ?? 0) >>> 0; }

function SetBerryPowder(amount: number): void { save.berryPowder = amount >>> 0; }

/** berry_powder.c HasEnoughBerryPowder: the cost is gSpecialVar_0x8004. */
export function HasEnoughBerryPowder(): number {
  return GetBerryPowder() < varGet(SV.x8004) ? 0 : 1;
}

/** berry_powder.c TakeBerryPowder */
export function TakeBerryPowder(): number {
  if (GetBerryPowder() < varGet(SV.x8004)) return 0;
  SetBerryPowder(GetBerryPowder() - varGet(SV.x8004));
  return 1;
}

let sBerryPowderVendorWindow: Window | undefined;

/** berry_powder.c PrintBerryPowderAmount */
function PrintBerryPowderAmount(window: Window, amount: number, x: number, y: number): void {
  printText(window, FONT_NORMAL, intToDecimal(amount, STR_CONV_MODE_RIGHT_ALIGN, 5), x, y);
}

/** berry_powder.c DisplayBerryPowderVendorMenu / DrawPlayerPowderAmount */
export function DisplayBerryPowderVendorMenu(ctx: ScriptRunner): void {
  const window = new Window(1 + 1, 1 + 1, 7, 4);
  window.frame = "std";
  window.frameType = save.options.frameType;
  window.fill(1);
  ctx.ow.windows.add(window);
  printText(window, FONT_NORMAL, rom.text("gText_Powder"), 0, 1);
  PrintBerryPowderAmount(window, GetBerryPowder(), 26, 17);
  sBerryPowderVendorWindow = window;
}

/** berry_powder.c PrintPlayerBerryPowderAmount */
export function PrintPlayerBerryPowderAmount(): void {
  if (sBerryPowderVendorWindow) PrintBerryPowderAmount(sBerryPowderVendorWindow, GetBerryPowder(), 26, 17);
}

/** berry_powder.c RemoveBerryPowderVendorMenu */
export function RemoveBerryPowderVendorMenu(ctx: ScriptRunner): void {
  if (sBerryPowderVendorWindow) ctx.ow.windows.remove(sBerryPowderVendorWindow);
  sBerryPowderVendorWindow = undefined;
}
