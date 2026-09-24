// text_printer.c / menu.c printer helpers for GBA windows: one printer per
// window, run once per frame by RunTextPrinters.

import { FONT_INFOS } from "../gba/font";
import { TEXT_SKIP_DRAW, TextPrinter } from "../gba/textPrinter";
import { COPYWIN_GFX, CopyWindowToVram, WindowSurface } from "./window";

export type PrinterCallback = (printer: TextPrinter, cmd: number) => void;

const printers: Array<TextPrinter | null> = new Array(32).fill(null);

export type TextPrinterTemplate = {
  windowId: number;
  fontId: number;
  x: number;
  y: number;
  currentX?: number;
  currentY?: number;
  letterSpacing: number;
  lineSpacing: number;
  fgColor: number;
  bgColor: number;
  shadowColor: number;
};

export function AddTextPrinter(t: TextPrinterTemplate, str: ArrayLike<number>, speed: number, callback?: PrinterCallback | null): boolean {
  speed &= 0xff; // u8 in C: -1 is TEXT_SKIP_DRAW
  const printer = new TextPrinter(new WindowSurface(t.windowId), t.fontId, str, {
    x: t.x, y: t.y, speed: speed === TEXT_SKIP_DRAW ? 0 : speed, fg: t.fgColor, bg: t.bgColor, shadow: t.shadowColor,
    letterSpacing: t.letterSpacing, lineSpacing: t.lineSpacing,
    onUpdate: callback ?? undefined,
  });
  if (speed !== TEXT_SKIP_DRAW && speed !== 0) {
    printers[t.windowId] = printer;
  } else {
    if (speed !== TEXT_SKIP_DRAW) CopyWindowToVram(t.windowId, COPYWIN_GFX);
    printers[t.windowId] = null;
  }
  return true;
}

export function AddTextPrinterParameterized(windowId: number, fontId: number, str: ArrayLike<number>, x: number, y: number, speed: number, callback?: PrinterCallback | null): boolean {
  const f = FONT_INFOS[fontId];
  return AddTextPrinter({ windowId, fontId, x, y, letterSpacing: f.letterSpacing, lineSpacing: f.lineSpacing, fgColor: f.fgColor, bgColor: f.bgColor, shadowColor: f.shadowColor }, str, speed, callback);
}

/** new_menu_helpers.c */
export function AddTextPrinterParameterized2(windowId: number, fontId: number, str: ArrayLike<number>, speed: number, callback: PrinterCallback | null, fgColor: number, bgColor: number, shadowColor: number): boolean {
  const f = FONT_INFOS[fontId];
  return AddTextPrinter({ windowId, fontId, x: 0, y: 1, letterSpacing: 1, lineSpacing: 1, fgColor, bgColor, shadowColor }, str, speed, callback ?? null) && f !== undefined;
}

/** menu.c: color = [bg, fg, shadow] */
export function AddTextPrinterParameterized3(windowId: number, fontId: number, x: number, y: number, color: ArrayLike<number>, speed: number, str: ArrayLike<number>): boolean {
  const f = FONT_INFOS[fontId];
  return AddTextPrinter({ windowId, fontId, x, y, letterSpacing: f.letterSpacing, lineSpacing: f.lineSpacing, bgColor: color[0], fgColor: color[1], shadowColor: color[2] }, str, speed);
}

export function AddTextPrinterParameterized4(windowId: number, fontId: number, x: number, y: number, letterSpacing: number, lineSpacing: number, color: ArrayLike<number>, speed: number, str: ArrayLike<number>): boolean {
  return AddTextPrinter({ windowId, fontId, x, y, letterSpacing, lineSpacing, bgColor: color[0], fgColor: color[1], shadowColor: color[2] }, str, speed);
}

export function AddTextPrinterParameterized5(windowId: number, fontId: number, str: ArrayLike<number>, x: number, y: number, speed: number, callback: PrinterCallback | null, letterSpacing: number, lineSpacing: number): boolean {
  const f = FONT_INFOS[fontId];
  return AddTextPrinter({ windowId, fontId, x, y, letterSpacing, lineSpacing, fgColor: f.fgColor, bgColor: f.bgColor, shadowColor: f.shadowColor }, str, speed, callback);
}

export function RunTextPrinters(): void {
  for (let i = 0; i < printers.length; i++) {
    const p = printers[i];
    if (!p) continue;
    if (!p.active) {
      printers[i] = null;
      continue;
    }
    p.run();
    CopyWindowToVram(i, COPYWIN_GFX);
    if (!p.active) printers[i] = null;
  }
}

export function IsTextPrinterActive(id: number): boolean {
  return !!printers[id]?.active;
}

export function DeactivateAllTextPrinters(): void {
  printers.fill(null);
}

export function textPrinterOf(id: number): TextPrinter | null {
  return printers[id];
}
