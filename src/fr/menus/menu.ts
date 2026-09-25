// menu.c: the vertical cursor menu used by scripts, the start menu and
// most list-less menus.

import { sound } from "../audio/sound";
import { encode } from "../gba/charmap";
import { FONT_NORMAL } from "../gba/font";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, JOY_NEW } from "../gba/input";
import { printText } from "../gba/textPrinter";
import { GetMenuCursorDimensionByFont } from "../hw/menu";
import type { Window } from "../gba/window";
import { rom } from "../rom";

export const MENU_NOTHING_CHOSEN = -2;
export const MENU_B_PRESSED = -1;

let arrow: Uint8Array | undefined;
export function selectorArrow(): Uint8Array {
  if (!arrow) arrow = rom.text("gText_SelectorArrow2");
  return arrow;
}
void encode;

export class Menu {
  cursorPos = 0;
  constructor(
    readonly window: Window,
    readonly fontId: number,
    readonly left: number,
    readonly top: number,
    readonly optionHeight: number,
    readonly numChoices: number,
    initialPos = 0,
    readonly aPressMuted = false,
  ) {
    this.cursorPos = initialPos < 0 || initialPos > numChoices - 1 ? 0 : initialPos;
    this.redraw(this.cursorPos, this.cursorPos);
  }

  /** Menu_RedrawCursor: erases gMenuCursorDimensions (8 px wide for every
   * font), not maxLetterWidth, so options printed at x = 8 keep their first
   * column. */
  redraw(oldPos: number, newPos: number): void {
    const fontId = this.fontId >= 0 && this.fontId <= 6 ? this.fontId : FONT_NORMAL;
    const width = GetMenuCursorDimensionByFont(fontId, 0);
    const height = GetMenuCursorDimensionByFont(fontId, 1);
    this.window.fillRect(1, this.left, this.optionHeight * oldPos + this.top, width, height);
    printText(this.window, this.fontId, selectorArrow(), this.left, this.optionHeight * newPos + this.top);
  }

  move(delta: number, wrap: boolean): number {
    const old = this.cursorPos;
    let next = this.cursorPos + delta;
    if (next < 0) next = wrap ? this.numChoices - 1 : 0;
    else if (next > this.numChoices - 1) next = wrap ? 0 : this.numChoices - 1;
    this.cursorPos = next;
    this.redraw(old, next);
    return next;
  }

  /** Menu_ProcessInput */
  processInput(): number {
    if (JOY_NEW(A_BUTTON)) {
      if (!this.aPressMuted) sound.playSE(sound.SE_SELECT);
      return this.cursorPos;
    }
    if (JOY_NEW(B_BUTTON)) return MENU_B_PRESSED;
    if (JOY_NEW(DPAD_UP)) { sound.playSE(sound.SE_SELECT); this.move(-1, true); return MENU_NOTHING_CHOSEN; }
    if (JOY_NEW(DPAD_DOWN)) { sound.playSE(sound.SE_SELECT); this.move(1, true); return MENU_NOTHING_CHOSEN; }
    return MENU_NOTHING_CHOSEN;
  }

  /** Menu_ProcessInputNoWrapAround */
  processInputNoWrap(): number {
    const old = this.cursorPos;
    if (JOY_NEW(A_BUTTON)) {
      if (!this.aPressMuted) sound.playSE(sound.SE_SELECT);
      return this.cursorPos;
    }
    if (JOY_NEW(B_BUTTON)) return MENU_B_PRESSED;
    if (JOY_NEW(DPAD_UP)) { if (old !== this.move(-1, false)) sound.playSE(sound.SE_SELECT); return MENU_NOTHING_CHOSEN; }
    if (JOY_NEW(DPAD_DOWN)) { if (old !== this.move(1, false)) sound.playSE(sound.SE_SELECT); return MENU_NOTHING_CHOSEN; }
    return MENU_NOTHING_CHOSEN;
  }
}

/** Grid menu (Menu_ProcessInputGridLayout). */
export class GridMenu {
  cursorPos = 0;
  constructor(readonly window: Window, readonly fontId: number, readonly left: number, readonly top: number, readonly columnWidth: number, readonly rowHeight: number, readonly columns: number, readonly rows: number) {
    this.redraw(0, 0);
  }

  private pos(i: number): [number, number] {
    return [this.left + (i % this.columns) * this.columnWidth, this.top + Math.floor(i / this.columns) * this.rowHeight];
  }

  redraw(oldPos: number, newPos: number): void {
    const [ox, oy] = this.pos(oldPos);
    // MultichoiceGrid_RedrawCursor: same gMenuCursorDimensions erase as Menu_RedrawCursor.
    const fontId = this.fontId >= 0 && this.fontId <= 6 ? this.fontId : FONT_NORMAL;
    this.window.fillRect(1, ox, oy, GetMenuCursorDimensionByFont(fontId, 0), GetMenuCursorDimensionByFont(fontId, 1));
    const [nx, ny] = this.pos(newPos);
    printText(this.window, this.fontId, selectorArrow(), nx, ny);
  }

  processInput(): number {
    const old = this.cursorPos;
    const count = this.columns * this.rows;
    if (JOY_NEW(A_BUTTON)) { sound.playSE(sound.SE_SELECT); return this.cursorPos; }
    if (JOY_NEW(B_BUTTON)) return MENU_B_PRESSED;
    let next = old;
    if (JOY_NEW(DPAD_UP) && old >= this.columns) next = old - this.columns;
    else if (JOY_NEW(DPAD_DOWN) && old + this.columns < count) next = old + this.columns;
    else if (JOY_NEW(DPAD_LEFT) && old % this.columns > 0) next = old - 1;
    else if (JOY_NEW(DPAD_RIGHT) && old % this.columns < this.columns - 1 && old + 1 < count) next = old + 1;
    if (next !== old) {
      sound.playSE(sound.SE_SELECT);
      this.cursorPos = next;
      this.redraw(old, next);
    }
    return MENU_NOTHING_CHOSEN;
  }
}
