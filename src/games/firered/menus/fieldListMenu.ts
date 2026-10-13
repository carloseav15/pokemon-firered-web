// list_menu.c / menu_indicators.c on the field (Canvas) layer: a ListSurface
// over a field Window and the red scroll indicator arrows as field sprites.
// The list logic itself is the shared port in hw/listMenu.ts.

import { spriteSheet } from "../field/gfx4bpp";
import { Sprite } from "../gba/sprite";
import { printText } from "../gba/textPrinter";
import type { Window } from "../gba/window";
import { incbin, incbin16 } from "../hw/assets";
import { type ListSurface, SCROLL_ARROW_UP } from "../hw/listMenu";
import { gSineTable } from "../hw/trig";
import type { Overworld } from "../field/overworld";

export function fieldListSurface(win: Window): ListSurface {
  return {
    get left() { return win.x; },
    get top() { return win.y; },
    get width() { return win.width; },
    get height() { return win.height; },
    fill: (v) => win.fill(v & 0xf),
    fillRect: (v, x, y, w, h) => win.fillRect(v & 0xf, x, y, w, h),
    scroll: (direction, distance, v) => {
      if (direction === 0) { win.scroll(distance, v); return; }
      const w = win.pixelWidth;
      win.pixels.copyWithin(distance * w, 0, (win.pixelHeight - distance) * w);
      win.pixels.fill(v & 0xf, 0, distance * w);
      win.markDirty();
    },
    print: (fontId, x, y, letterSpacing, colors, str) => printText(win, fontId, str, x, y, { bg: colors[0], fg: colors[1], shadow: colors[2] }, letterSpacing),
    copy: () => win.markDirty(),
  };
}

let arrowSheet: HTMLCanvasElement | null = null;

/**
 * AddScrollIndicatorArrowPairParameterized for field menus: two bouncing red
 * arrows (sScrollIndicatorTemplates: multiplier 2, frequency ±8) hidden at the
 * ends of the list. Returns the remover.
 */
export function addFieldScrollArrows(ow: Overworld, arrowType: number, commonPos: number, firstPos: number, secondPos: number,
  fullyDownThreshold: number, scrollOffset: () => number): () => void {
  arrowSheet ??= spriteSheet(incbin("sRedArrowOtherGfx"), incbin16("sRedArrowPal"), 16, 16, 2);
  const vertical = arrowType === SCROLL_ARROW_UP || arrowType === SCROLL_ARROW_UP + 1;
  const make = (first: boolean): Sprite => {
    const s = new Sprite();
    s.width = 16; s.height = 16;
    s.x = vertical ? commonPos : first ? firstPos : secondPos;
    s.y = vertical ? first ? firstPos : secondPos : commonPos;
    s.centerToCornerVecX = -8; s.centerToCornerVecY = -8;
    s.coordOffsetEnabled = false; s.priority = 0; s.aboveWindows = true;
    const frequency = first ? 8 : -8;
    let pos = 0;
    s.callback = () => {
      const offset = Math.trunc((gSineTable[pos & 0xff] * 2) / 256);
      if (vertical) s.y2 = offset; else s.x2 = offset;
      pos = (pos + frequency) << 16 >> 16;
      const cur = scrollOffset();
      s.invisible = first ? cur === 0 : cur === fullyDownThreshold;
    };
    s.draw = (ctx, dx, dy) => {
      if (s.invisible) return;
      ctx.save();
      const flip = !first;
      ctx.translate(dx + (flip && !vertical ? 16 : 0), dy + (flip && vertical ? 16 : 0));
      ctx.scale(flip && !vertical ? -1 : 1, flip && vertical ? -1 : 1);
      ctx.drawImage(arrowSheet!, 0, vertical ? 16 : 0, 16, 16, 0, 0, 16, 16);
      ctx.restore();
    };
    s.callback(s);
    ow.sprites.add(s);
    return s;
  };
  const top = make(true), bottom = make(false);
  return () => { ow.sprites.destroy(top); ow.sprites.destroy(bottom); };
}
