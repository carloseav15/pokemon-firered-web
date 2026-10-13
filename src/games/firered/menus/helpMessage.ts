// help_message.c: the bottom help bar used by the START menu descriptions.
// Browser adaptation: the window lives on the canvas field layer (gba/window.ts)
// instead of BG0, so the tiles of gHelpMessageWindow_Gfx are copied into the
// window's pixel buffer (what CopyToWindowPixelBuffer does in the C).

import { FONT_NORMAL } from "../gba/font";
import { printText } from "../gba/textPrinter";
import { stdPalette, Window, type WindowLayer } from "../gba/window";
import { incbin } from "../hw/assets";

const TEXT_COLOR_TRANSPARENT = 0;
const TEXT_DYNAMIC_COLOR_1 = 10;
const TEXT_COLOR_DARK_GRAY = 2;
let sHelpMessageWindow: Window | undefined;

/** sHelpMessageWindowTemplate: {bg 0, left 0, top 15, width 30, height 5}; LoadHelpMessageWindowGfx uses GetTextWindowPalette(2). */
export function CreateHelpMessageWindow(windows: WindowLayer): Window {
  if (!sHelpMessageWindow) sHelpMessageWindow = windows.add(new Window(0, 15, 30, 5, stdPalette(2)));
  return sHelpMessageWindow;
}

/** new_menu_helpers.c DrawHelpMessageWindowWithText, adapted to the Canvas field window layer. */
export function DrawHelpMessageWindowWithText(windows: WindowLayer, text: ArrayLike<number>): Window {
  const window = CreateHelpMessageWindow(windows);
  PrintTextOnHelpMessageWindow(window, text);
  return window;
}

/** MapNamePopupWindowIdSetDummy: mark the singleton window handle unused. */
export function MapNamePopupWindowIdSetDummy(): void {
  sHelpMessageWindow = undefined;
}

/** DestroyHelpMessageWindow: clear and release the active window; Canvas draws immediately, so `mode` needs no VRAM copy. */
export function DestroyHelpMessageWindow(windows: WindowLayer, _mode: number): void {
  if (!sHelpMessageWindow) return;
  sHelpMessageWindow.fill(0);
  windows.remove(sHelpMessageWindow);
  sHelpMessageWindow = undefined;
}

/** DrawHelpMessageWindowTilesById: tile 0 on the top row, 14 on the bottom row, 5 in between. */
export function DrawHelpMessageWindowTilesById(window: Window): void {
  const gfx = incbin("gHelpMessageWindow_Gfx");
  for (let i = 0; i < window.height; i++) {
    const tileId = i === 0 ? 0 : i === window.height - 1 ? 14 : 5;
    for (let j = 0; j < window.width; j++) {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const byte = gfx[tileId * 32 + y * 4 + (x >> 1)];
          window.setPixel(j * 8 + x, i * 8 + y, x & 1 ? byte >> 4 : byte & 0xf);
        }
      }
    }
  }
}

/** DrawHelpMessageWindowTiles: draw through the C module's active window handle. */
export function DrawHelpMessageWindowTiles(): void {
  if (sHelpMessageWindow) DrawHelpMessageWindowTilesById(sHelpMessageWindow);
}

/** PrintHelpMessageText: use the original font and colors on the active window. */
export function PrintHelpMessageText(text: ArrayLike<number>): void {
  if (!sHelpMessageWindow) return;
  printText(sHelpMessageWindow, FONT_NORMAL, text, 2, 5, { bg: TEXT_COLOR_TRANSPARENT, fg: TEXT_DYNAMIC_COLOR_1, shadow: TEXT_COLOR_DARK_GRAY }, 1, 1);
}

/** PrintTextOnHelpMessageWindow: redraw the tiles, then PrintHelpMessageText (x 2, y 5, letter/line spacing 1). */
export function PrintTextOnHelpMessageWindow(window: Window, text: ArrayLike<number>): void {
  if (window === sHelpMessageWindow) {
    DrawHelpMessageWindowTiles();
    PrintHelpMessageText(text);
  } else {
    DrawHelpMessageWindowTilesById(window);
    printText(window, FONT_NORMAL, text, 2, 5, { bg: TEXT_COLOR_TRANSPARENT, fg: TEXT_DYNAMIC_COLOR_1, shadow: TEXT_COLOR_DARK_GRAY }, 1, 1);
  }
}
