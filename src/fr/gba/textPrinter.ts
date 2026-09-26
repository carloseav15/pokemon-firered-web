// Port of text.c RenderText / text_printer.c for the latin fonts.

import { sound } from "../audio/sound";
import { CHAR_EXTRA_SYMBOL, CHAR_KEYPAD_ICON, CHAR_NEWLINE, CHAR_PROMPT_CLEAR, CHAR_PROMPT_SCROLL, EOS, EXT_CTRL_CODE_BEGIN, PLACEHOLDER_BEGIN } from "./charmap";
import { FONT_BRAILLE, FONT_INFOS, FONT_NORMAL, glyph, type FontInfo } from "./font";
import { A_BUTTON, B_BUTTON, JOY_HELD, JOY_NEW } from "./input";
import { b64, rom } from "../rom";
import type { Window } from "./window";

/** Anything a text printer can draw on (overworld windows, GBA window tile buffers). */
export type TextSurface = Pick<Window, "pixelWidth" | "pixelHeight" | "fill" | "fillRect" | "setPixel" | "blit" | "scroll">;

export const TEXT_COLOR_TRANSPARENT = 0;
export const TEXT_COLOR_WHITE = 1;
export const TEXT_COLOR_DARK_GRAY = 2;
export const TEXT_COLOR_LIGHT_GRAY = 3;
export const TEXT_COLOR_RED = 4;
export const TEXT_COLOR_LIGHT_RED = 5;
export const TEXT_COLOR_GREEN = 6;
export const TEXT_COLOR_LIGHT_GREEN = 7;
export const TEXT_COLOR_BLUE = 8;
export const TEXT_COLOR_LIGHT_BLUE = 9;

export const TEXT_SKIP_DRAW = 0xff;

const RENDER_PRINT = 0;
const RENDER_FINISH = 1;
const RENDER_REPEAT = 2;
const RENDER_UPDATE = 3;

const enum State { HandleChar, Wait, Clear, ScrollStart, Scroll, WaitSe, Pause }

const DOWN_ARROW_X = [0, 16, 32, 16];
const SCROLL_SPEEDS = [1, 2, 4];

export const textFlags = { canABSpeedUpPrint: false, useAlternateDownArrow: false, autoScroll: false, forceMidTextSpeed: false };

let gFonts: FontInfo[] | null = null;
let sLastTextBgColor = 0;
let sLastTextFgColor = 0;
let sLastTextShadowColor = 0;
export const sFontHalfRowLookupTable = new Uint16Array(0x51);
export const gGlyphInfo: { pixels: Uint8Array; width: number; height: number } = { pixels: new Uint8Array(16 * 16), width: 0, height: 0 };

/** text_printer.c SetFontsPointer. */
export function SetFontsPointer(fonts: FontInfo[] | null = FONT_INFOS): void { gFonts = fonts; }

/** text_printer.c GenerateFontHalfRowLookupTable. */
export function GenerateFontHalfRowLookupTable(fgColor: number, bgColor: number, shadowColor: number): void {
  sLastTextBgColor = bgColor & 0xff;
  sLastTextFgColor = fgColor & 0xff;
  sLastTextShadowColor = shadowColor & 0xff;
  const colors = [sLastTextBgColor, sLastTextFgColor, sLastTextShadowColor];
  let index = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++)
    sFontHalfRowLookupTable[index++] = (colors[l] << 12) | (colors[k] << 8) | (colors[j] << 4) | colors[i];
}

/** text_printer.c SaveTextColors. */
export function SaveTextColors(): { fgColor: number; bgColor: number; shadowColor: number } {
  return { bgColor: sLastTextBgColor, fgColor: sLastTextFgColor, shadowColor: sLastTextShadowColor };
}

/** text_printer.c RestoreTextColors. */
export function RestoreTextColors(fgColor: number, bgColor: number, shadowColor: number): void {
  GenerateFontHalfRowLookupTable(fgColor, bgColor, shadowColor);
}

/** text_printer.c GetLastTextColor. */
export function GetLastTextColor(colorType: number): number {
  switch (colorType) {
    case 0: return sLastTextFgColor;
    case 2: return sLastTextBgColor;
    case 1: return sLastTextShadowColor;
    default: return 0;
  }
}

/** gSaveBlock2Ptr->optionsTextSpeed: 0 slow, 1 mid, 2 fast. */
export const textOptions = { speed: 1 };
const TEXT_SPEED_FRAME_DELAYS = [8, 4, 1];

export function getTextSpeedSetting(): number {
  if (textFlags.forceMidTextSpeed) return TEXT_SPEED_FRAME_DELAYS[1];
  return TEXT_SPEED_FRAME_DELAYS[textOptions.speed] ?? 4;
}

let downArrowPixels: Uint8Array | undefined;
let downArrowWidth = 0;
function downArrow(): { pixels: Uint8Array; width: number } {
  if (!downArrowPixels) {
    const raw = rom.fonts.down_arrows;
    downArrowPixels = b64(raw.pixels);
    downArrowWidth = raw.width;
  }
  return { pixels: downArrowPixels, width: downArrowWidth };
}

let keypadPixels: Uint8Array | undefined;
let keypadWidth = 0;
const KEYPAD_ICONS: Record<number, [number, number, number]> = {
  0x00: [0x0, 8, 12], 0x01: [0x1, 8, 12], 0x02: [0x2, 16, 12], 0x03: [0x4, 16, 12], 0x04: [0x6, 24, 12], 0x05: [0x9, 24, 12],
  0x06: [0xc, 8, 12], 0x07: [0xd, 8, 12], 0x08: [0xe, 8, 12], 0x09: [0xf, 8, 12], 0x0a: [0x20, 8, 12], 0x0b: [0x21, 8, 12], 0x0c: [0x22, 8, 12],
};

export type PrinterOptions = {
  x?: number;
  y?: number;
  speed?: number;
  fg?: number;
  bg?: number;
  shadow?: number;
  letterSpacing?: number;
  lineSpacing?: number;
  onUpdate?: (printer: TextPrinter, cmd: number) => void;
};

export class TextPrinter {
  active = true;
  private state = State.HandleChar;
  private pos = 0;
  private delayCounter = 0;
  private scrollDistance = 0;
  private textSpeed: number;
  private sped = false;
  private downArrowDelay = 0;
  private downArrowIndex = 0;
  private minLetterSpacing = 0;
  fontId: number;
  x: number;
  y: number;
  currentX: number;
  currentY: number;
  fg: number;
  bg: number;
  shadow: number;
  letterSpacing: number;
  lineSpacing: number;

  constructor(readonly window: TextSurface, fontId: number, readonly str: ArrayLike<number>, options: PrinterOptions = {}) {
    const fonts = gFonts ?? FONT_INFOS;
    const info = fonts[fontId] ?? fonts[FONT_NORMAL];
    this.fontId = fontId;
    this.x = this.currentX = options.x ?? 0;
    this.y = this.currentY = options.y ?? 1;
    this.fg = options.fg ?? info.fgColor;
    this.bg = options.bg ?? info.bgColor;
    this.shadow = options.shadow ?? info.shadowColor;
    this.letterSpacing = options.letterSpacing ?? info.letterSpacing;
    this.lineSpacing = options.lineSpacing ?? info.lineSpacing;
    GenerateFontHalfRowLookupTable(this.fg, this.bg, this.shadow);
    const speed = options.speed ?? 0;
    if (speed !== TEXT_SKIP_DRAW && speed !== 0) {
      this.textSpeed = speed - 1;
    } else {
      this.textSpeed = 0;
      for (let j = 0; j < 0x400; j++) if (this.renderFont() === RENDER_FINISH) break;
      this.active = false;
    }
    this.onUpdate = options.onUpdate;
  }

  private onUpdate?: (printer: TextPrinter, cmd: number) => void;

  /** RunTextPrinters for this printer (one call per frame). */
  run(): void {
    if (!this.active) return;
    const cmd = this.renderFont();
    if (cmd === RENDER_FINISH) this.active = false;
    else this.onUpdate?.(this, cmd);
  }

  /** One gFonts[fontId].fontFunction call, before RenderFont's repeat loop. */
  renderFrame(): number { return this.render(); }
  /** text_printer.c RenderFont's repeat-until-non-RENDER_REPEAT loop. */
  renderUntilUpdate(): number { return this.renderFont(); }
  /** Draw the most recently decompressed glyph into this printer's window. */
  copyCurrentGlyph(): void { this.copyGlyph(gGlyphInfo.pixels, gGlyphInfo.width, gGlyphInfo.height); }

  private renderFont(): number {
    for (;;) {
      const ret = this.render();
      if (ret !== RENDER_REPEAT) return ret;
    }
  }

  private next(): number {
    return this.str[this.pos++] ?? EOS;
  }

  private render(): number {
    switch (this.state) {
      case State.HandleChar: {
        if (this.fontId === FONT_BRAILLE) return this.FontFunc_Braille_HandleChar();
        if (JOY_HELD(A_BUTTON | B_BUTTON) && this.sped) this.delayCounter = 0;
        if (this.delayCounter && this.textSpeed) {
          this.delayCounter--;
          if (textFlags.canABSpeedUpPrint && JOY_NEW(A_BUTTON | B_BUTTON)) {
            this.sped = true;
            this.delayCounter = 0;
          }
          return RENDER_UPDATE;
        }
        this.delayCounter = textFlags.autoScroll ? 1 : this.textSpeed;
        let c = this.next();
        switch (c) {
          case CHAR_NEWLINE:
            this.currentX = this.x;
            this.currentY += (gFonts ?? FONT_INFOS)[this.fontId].maxLetterHeight + this.lineSpacing;
            return RENDER_REPEAT;
          case PLACEHOLDER_BEGIN:
            this.pos++;
            return RENDER_REPEAT;
          case EXT_CTRL_CODE_BEGIN: {
            const code = this.next();
            switch (code) {
              case 0x01: this.fg = this.next(); return RENDER_REPEAT;
              case 0x02: this.bg = this.next(); return RENDER_REPEAT;
              case 0x03: this.shadow = this.next(); return RENDER_REPEAT;
              case 0x04: this.fg = this.next(); this.bg = this.next(); this.shadow = this.next(); return RENDER_REPEAT;
              case 0x05: this.pos++; return RENDER_REPEAT;
              case 0x06: this.fontId = this.next(); return RENDER_REPEAT;
              case 0x07: return RENDER_REPEAT;
              case 0x08: this.delayCounter = this.next(); this.state = State.Pause; return RENDER_REPEAT;
              case 0x09: this.state = State.Wait; return RENDER_UPDATE;
              case 0x0a: this.state = State.WaitSe; return RENDER_UPDATE;
              case 0x0b: { const song = this.next() | (this.next() << 8); sound.playBGM(song); return RENDER_REPEAT; }
              case 0x0c: c = this.next(); break;
              case 0x0d: this.currentX = this.x + this.next(); return RENDER_REPEAT;
              case 0x0e: this.currentY = this.y + this.next(); return RENDER_REPEAT;
              case 0x0f: this.window.fill(this.bg); return RENDER_REPEAT;
              case 0x10: { const se = this.next() | (this.next() << 8); sound.playSE(se); return RENDER_REPEAT; }
              case 0x11: {
                const width = this.next();
                if (width > 0) { this.clearSpan(width); this.currentX += width; return RENDER_PRINT; }
                return RENDER_REPEAT;
              }
              case 0x12: this.currentX = this.next() + this.x; return RENDER_REPEAT;
              case 0x13: {
                const width = this.next() + this.x - this.currentX;
                if (width > 0) { this.clearSpan(width); this.currentX += width; return RENDER_PRINT; }
                return RENDER_REPEAT;
              }
              case 0x14: this.minLetterSpacing = this.next(); return RENDER_REPEAT;
              case 0x15: case 0x16: return RENDER_REPEAT;
              case 0x17: sound.pauseBGM(); return RENDER_REPEAT;
              case 0x18: sound.resumeBGM(); return RENDER_REPEAT;
              default: return RENDER_REPEAT;
            }
            break;
          }
          case CHAR_PROMPT_CLEAR:
            this.state = State.Clear;
            this.downArrowDelay = 0;
            this.downArrowIndex = 0;
            return RENDER_UPDATE;
          case CHAR_PROMPT_SCROLL:
            this.state = State.ScrollStart;
            this.downArrowDelay = 0;
            this.downArrowIndex = 0;
            return RENDER_UPDATE;
          case CHAR_EXTRA_SYMBOL:
            c = this.next() | 0x100;
            break;
          case CHAR_KEYPAD_ICON: {
            const icon = this.next();
            const width = this.drawKeypadIcon(icon);
            this.currentX += width + this.letterSpacing;
            return RENDER_PRINT;
          }
          case EOS:
            return RENDER_FINISH;
        }
        const g = glyph(this.fontId, c);
        gGlyphInfo.pixels = g.pixels;
        gGlyphInfo.width = g.width;
        gGlyphInfo.height = g.height;
        this.copyGlyph(g.pixels, g.width, g.height);
        if (this.minLetterSpacing) {
          this.currentX += g.width;
          const width = this.minLetterSpacing - g.width;
          if (width > 0) { this.clearSpan(width); this.currentX += width; }
        } else {
          this.currentX += g.width;
        }
        return RENDER_PRINT;
      }
      case State.Wait:
        if (this.waitForButton()) this.state = State.HandleChar;
        return RENDER_UPDATE;
      case State.Clear:
        if (this.waitWithDownArrow()) {
          this.window.fill(this.bg);
          this.currentX = this.x;
          this.currentY = this.y;
          this.state = State.HandleChar;
        }
        return RENDER_UPDATE;
      case State.ScrollStart:
        if (this.waitWithDownArrow()) {
          this.window.fillRect(this.bg, this.currentX, this.currentY, 10, 12);
          this.scrollDistance = (gFonts ?? FONT_INFOS)[this.fontId].maxLetterHeight + this.lineSpacing;
          this.currentX = this.x;
          this.state = State.Scroll;
        }
        return RENDER_UPDATE;
      case State.Scroll:
        if (this.scrollDistance) {
          const speed = SCROLL_SPEEDS[textOptions.speed] ?? 2;
          const step = Math.min(this.scrollDistance, speed);
          this.window.scroll(step, this.bg);
          this.scrollDistance -= step;
        } else {
          this.state = State.HandleChar;
        }
        return RENDER_UPDATE;
      case State.WaitSe:
        if (!sound.isSEPlaying()) this.state = State.HandleChar;
        return RENDER_UPDATE;
      case State.Pause:
        if (this.delayCounter !== 0) this.delayCounter--;
        else this.state = State.HandleChar;
        return RENDER_UPDATE;
    }
    return RENDER_FINISH;
  }

  /**
   * braille_text.c FontFunc_Braille, RENDER_STATE_HANDLE_CHAR. The other states are
   * identical to the normal font's. Differences: sounds are skipped, keypad icons draw
   * nothing, unknown control codes print as glyphs, and every glyph is 16 px wide.
   */
  private FontFunc_Braille_HandleChar(): number {
    if (JOY_HELD(A_BUTTON | B_BUTTON) && this.sped) this.delayCounter = 0;
    if (this.delayCounter && this.textSpeed) {
      this.delayCounter--;
      if (textFlags.canABSpeedUpPrint && JOY_NEW(A_BUTTON | B_BUTTON)) {
        this.sped = true;
        this.delayCounter = 0;
      }
      return RENDER_UPDATE;
    }
    this.delayCounter = textFlags.autoScroll ? 1 : this.textSpeed;
    let c = this.next();
    switch (c) {
      case EOS:
        return RENDER_FINISH;
      case CHAR_NEWLINE:
        this.currentX = this.x;
        this.currentY += (gFonts ?? FONT_INFOS)[this.fontId].maxLetterHeight + this.lineSpacing;
        return RENDER_REPEAT;
      case PLACEHOLDER_BEGIN:
        this.pos++;
        return RENDER_REPEAT;
      case EXT_CTRL_CODE_BEGIN:
        c = this.next();
        switch (c) {
          case 0x01: this.fg = this.next(); return RENDER_REPEAT;
          case 0x02: this.bg = this.next(); return RENDER_REPEAT;
          case 0x03: this.shadow = this.next(); return RENDER_REPEAT;
          case 0x04: this.fg = this.next(); this.bg = this.next(); this.shadow = this.next(); return RENDER_REPEAT;
          case 0x05: this.pos++; return RENDER_REPEAT;
          case 0x06: this.pos++; return RENDER_REPEAT; // sub->glyphId = font; unused by the braille font
          case 0x07: return RENDER_REPEAT;
          case 0x08: this.delayCounter = this.next(); this.state = State.Pause; return RENDER_REPEAT;
          case 0x09:
            this.state = State.Wait;
            if (textFlags.autoScroll) this.autoScrollDelay = 0;
            return RENDER_UPDATE;
          case 0x0a: this.state = State.WaitSe; return RENDER_UPDATE;
          case 0x0b: case 0x10: this.pos += 2; return RENDER_REPEAT;
          case 0x0c: this.pos++; c = this.str[this.pos] ?? EOS; break;
          case 0x0d: this.currentX = this.x + this.next(); return RENDER_REPEAT;
          case 0x0e: this.currentY = this.y + this.next(); return RENDER_REPEAT;
          case 0x0f: this.window.fill(this.bg); return RENDER_REPEAT;
        }
        break;
      case CHAR_PROMPT_CLEAR:
        this.state = State.Clear;
        this.downArrowDelay = 0;
        this.downArrowIndex = 0;
        return RENDER_UPDATE;
      case CHAR_PROMPT_SCROLL:
        this.state = State.ScrollStart;
        this.downArrowDelay = 0;
        this.downArrowIndex = 0;
        return RENDER_UPDATE;
      case CHAR_EXTRA_SYMBOL:
        c = this.next() | 0x100;
        break;
      case CHAR_KEYPAD_ICON:
        this.pos++;
        return RENDER_PRINT;
    }
    const g = glyph(FONT_BRAILLE, c);
    gGlyphInfo.pixels = g.pixels;
    gGlyphInfo.width = g.width;
    gGlyphInfo.height = g.height;
    this.copyGlyph(g.pixels, g.width, g.height);
    this.currentX += g.width + this.letterSpacing;
    return RENDER_PRINT;
  }

  private waitForButton(): boolean {
    if (textFlags.autoScroll) return this.autoWait();
    if (JOY_NEW(A_BUTTON | B_BUTTON)) {
      sound.playSE(sound.SE_SELECT);
      return true;
    }
    return false;
  }

  private autoScrollDelay = 0;
  private autoWait(): boolean {
    if (this.autoScrollDelay === 120) return true;
    this.autoScrollDelay++;
    return false;
  }

  private waitWithDownArrow(): boolean {
    if (textFlags.autoScroll) return this.autoWait();
    this.drawDownArrow();
    if (JOY_NEW(A_BUTTON | B_BUTTON)) {
      sound.playSE(sound.SE_SELECT);
      return true;
    }
    return false;
  }

  private drawDownArrow(): void {
    if (this.downArrowDelay !== 0) {
      this.downArrowDelay--;
      return;
    }
    this.window.fillRect(this.bg, this.currentX, this.currentY, 10, 12);
    const arrow = downArrow();
    // text.c: DARK_DOWN_ARROW_OFFSET is 256 bytes (8 tiles), i.e. x=64
    // in the exported 128-pixel-wide, row-major image, not a second row.
    const srcX = (textFlags.useAlternateDownArrow ? 64 : 0) + DOWN_ARROW_X[this.downArrowIndex & 3];
    this.window.blit(arrow.pixels, arrow.width, srcX, 0, this.currentX, this.currentY, 10, 12, true);
    this.downArrowDelay = 8;
    this.downArrowIndex = (this.downArrowIndex + 1) & 3;
  }

  private clearSpan(_width: number): void {
    ClearTextSpan(this, _width);
  }

  private copyGlyph(pixels: Uint8Array, width: number, height: number): void {
    const colors = [this.bg, this.fg, this.shadow];
    const maxW = Math.min(width, this.window.pixelWidth - this.currentX);
    const maxH = Math.min(height, this.window.pixelHeight - this.currentY);
    for (let y = 0; y < maxH; y++) {
      for (let x = 0; x < maxW; x++) {
        // GLYPH_COPY: pixels whose final color is 0 leave the window untouched.
        const color = colors[pixels[y * 16 + x]] ?? this.bg;
        if (color !== 0) this.window.setPixel(this.currentX + x, this.currentY + y, color);
      }
    }
  }

  private drawKeypadIcon(icon: number): number {
    const info = KEYPAD_ICONS[icon];
    if (!info) return 0;
    if (!keypadPixels) {
      const raw = rom.fonts.keypad_icons;
      keypadPixels = b64(raw.pixels);
      keypadWidth = raw.width;
    }
    const [tile, w, h] = info;
    const cols = keypadWidth / 8;
    const sx = (tile % cols) * 8;
    const sy = Math.floor(tile / cols) * 8;
    this.window.blit(keypadPixels, keypadWidth, sx, sy, this.currentX, this.currentY, w, h, true);
    return w;
  }
}

/** text_printer.c RenderFont. */
export function RenderFont(printer: TextPrinter): number { return printer.renderUntilUpdate(); }

/** text_printer.c CopyGlyphToWindow, adapted to the current window surface. */
export function CopyGlyphToWindow(printer: TextPrinter): void { printer.copyCurrentGlyph(); }

/** text_printer.c CopyGlyphToWindow_Parameterized, writing 4bpp tile bytes. */
export function CopyGlyphToWindow_Parameterized(tileData: Uint8Array, currentX: number, currentY: number, width: number, height: number): void {
  const glyphWidth = Math.max(0, Math.min(gGlyphInfo.width, width - currentX));
  const glyphHeight = Math.max(0, Math.min(gGlyphInfo.height, height - currentY));
  const sizeX = (width + (width & 7)) >> 3;
  const colors = [sLastTextBgColor, sLastTextFgColor, sLastTextShadowColor];
  for (let y = 0; y < glyphHeight; y++) for (let x = 0; x < glyphWidth; x++) {
    const pixel = gGlyphInfo.pixels[y * 16 + x] ?? 0;
    if (pixel === 0) continue;
    const px = currentX + x;
    const py = currentY + y;
    const index = ((px >> 1) & 3) + ((px >> 3) << 5) + (((py >> 3) * sizeX) << 5) + ((py & 7) << 2);
    const shift = (px & 1) * 4;
    const nibble = (colors[pixel] ?? 0) & 0xf;
    tileData[index] = (tileData[index] & (0xf0 >> shift)) | (nibble << shift);
  }
}

/** text_printer.c ClearTextSpan is deliberately empty in the FireRed source. */
export function ClearTextSpan(_printer: TextPrinter, _width: number): void {}

/** Convenience: print a string instantly (AddTextPrinterParameterized with speed 0). */
export function printText(window: TextSurface, fontId: number, str: ArrayLike<number>, x: number, y: number, colors?: { fg: number; bg: number; shadow: number }, letterSpacing?: number, lineSpacing?: number): void {
  new TextPrinter(window, fontId, str, { x, y, speed: 0, fg: colors?.fg, bg: colors?.bg, shadow: colors?.shadow, letterSpacing, lineSpacing });
}
