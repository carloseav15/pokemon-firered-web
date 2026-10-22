// pokeemerald src/scrcmd.c: complete braille message / CloseBrailleWindow family.
// Window/Vram transfers use the shared Window renderer; source geometry and text
// decoding remain regional. FireRed's window-0 command has a different contract.
import { type ScriptRunner } from '@core/script/context';
import type { Overworld } from '@core/field/overworld';
import { save } from '@game/save';
import { rom } from '@core/rom';
import { CHAR_NEWLINE, EOS, expandPlaceholders, stringVars } from '@core/gba/charmap';
import { FONT_BRAILLE, GetStringWidth } from '@core/gba/font';
import { Window, stdPalette } from '@core/gba/window';
import { TextPrinter, TEXT_SKIP_DRAW } from '@core/gba/textPrinter';

const windows = new WeakMap<Overworld, Window>();

/** ScrCmd_braillemessage (Emerald): the six brailleformat bytes are unused. */
export function ScrCmd_braillemessage(ctx: ScriptRunner): boolean {
  const ptr = ctx.ScriptReadWord();
  stringVars.var4 = expandPlaceholders(rom.stringAt(ptr + 6));
  let width = (Math.trunc(GetStringWidth(FONT_BRAILLE, stringVars.var4, -1) / 8) & 0xff);
  if (width > 28) width = 28;
  let height = 4;
  for (let i = 0; i < stringVars.var4.length && stringVars.var4[i] !== EOS; i++) {
    if (stringVars.var4[i] === CHAR_NEWLINE) height = (height + 3) & 0xff;
  }
  if (height > 18) height = 18;
  let temp = width + 2;
  let xWindow = Math.trunc((30 - temp) / 2);
  temp = height + 2;
  let yText = Math.trunc((20 - temp) / 2);
  let xText = xWindow;
  xWindow++;
  const yWindow = yText;
  yText += 2;
  xText = (xWindow - xText - 1) * 8 + 3;
  yText = (yText - yWindow - 1) * 8;
  const window = new Window(xWindow, yWindow + 1, width, height, stdPalette(0));
  windows.set(ctx.ow, window);
  ctx.ow.windows.add(window);
  window.frame = 'std';
  window.frameType = save.options.frameType;
  // The shared renderer selects the user's border; BG palette slot 14 is
  // represented by the window palette, not index 14 of the asset palette list.
  window.fill(1);
  new TextPrinter(window, FONT_BRAILLE, stringVars.var4, { x: xText, y: yText, speed: TEXT_SKIP_DRAW });
  return false;
}

/** CloseBrailleWindow: remove only the braille window, leaving window 0 alone. */
export function CloseBrailleWindow(ow: Overworld): void {
  const window = windows.get(ow);
  if (window) { window.fill(0); window.frame = 'none'; ow.windows.remove(window); windows.delete(ow); }
}

export function ScrCmd_closebraillemessage(ctx: ScriptRunner): boolean {
  CloseBrailleWindow(ctx.ow);
  return false;
}
