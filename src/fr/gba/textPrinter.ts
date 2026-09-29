// Port of text.c and text_printer.c: the printer state machine, its font
// functions and the glyph decompression shared by every latin font.

import { sound } from "../audio/sound";
import * as C from "../generated/constants";
import { CHAR_EXTRA_SYMBOL, CHAR_KEYPAD_ICON, CHAR_NEWLINE, CHAR_PROMPT_CLEAR, CHAR_PROMPT_SCROLL, EOS, EXT_CTRL_CODE_BEGIN, PLACEHOLDER_BEGIN } from "./charmap";
import { FONT_BRAILLE, FONT_FEMALE, FONT_INFOS, FONT_MALE, FONT_NORMAL, FONT_NORMAL_COPY_1, FONT_NORMAL_COPY_2, FONT_SMALL, DecompressGlyphTile, GetGlyphWidth_Female, GetGlyphWidth_Male, GetGlyphWidth_Normal, GetGlyphWidth_NormalCopy1, GetGlyphWidth_NormalCopy2, GetGlyphWidth_Small, GetKeypadIconSheet, KEYPAD_ICONS, glyph, type FontInfo } from "./font";
import { A_BUTTON, B_BUTTON, JOY_HELD, JOY_NEW } from "./input";
import { b64, rom } from "../rom";
import { gQuestLogState } from "../questLogState";
import { incbin16 } from "../hw/assets";
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

const CURSOR_DELAY = 8;
// text.c DARK_DOWN_ARROW_OFFSET is 256 bytes (8 tiles of sDownArrowTiles); the
// exported down_arrows sheet is 16 tiles wide, so that is x=64 pixels.
const DARK_DOWN_ARROW_X = 64;
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
  state = State.HandleChar;
  pos = 0;
  delayCounter = 0;
  scrollDistance = 0;
  textSpeed: number;
  sped = false;
  downArrowDelay = 0;
  downArrowIndex = 0;
  autoScrollDelay = 0;
  minLetterSpacing = 0;
  glyphId = 0;
  hasGlyphIdBeenSet = false;
  japanese = false;
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
      for (let j = 0; j < 0x400; j++) if (RenderFont(this) === RENDER_FINISH) break;
      this.active = false;
    }
    this.onUpdate = options.onUpdate;
  }

  private onUpdate?: (printer: TextPrinter, cmd: number) => void;

  /** RunTextPrinters for this printer (one call per frame). */
  run(): void {
    if (!this.active) return;
    const cmd = RenderFont(this);
    if (cmd === RENDER_FINISH) this.active = false;
    else this.onUpdate?.(this, cmd);
  }

  /** The next string byte (text_printer.c printerTemplate.currentChar++). */
  next(): number { return this.str[this.pos++] ?? EOS; }

  /** One gFonts[fontId].fontFunction call, before RenderFont's repeat loop. */
  renderFrame(): number { return fontFunctionFor(this.fontId)(this); }
  /** text_printer.c RenderFont's repeat-until-non-RENDER_REPEAT loop. */
  renderUntilUpdate(): number { return RenderFont(this); }
  /** Draw the most recently decompressed glyph into this printer's window. */
  copyCurrentGlyph(): void { CopyGlyphToWindow(this); }
}

// ---------------------------------------------------------------- text.c FontFunc_*

/** gFontInfos[].fontFunction (new_menu_helpers.c); FONT_BOLD is NULL in C. */
function fontFunctionFor(fontId: number): (printer: TextPrinter) => number {
  switch (fontId) {
    case FONT_SMALL: return FontFunc_Small;
    case FONT_NORMAL_COPY_1: return FontFunc_NormalCopy1;
    case FONT_NORMAL: return FontFunc_Normal;
    case FONT_NORMAL_COPY_2: return FontFunc_NormalCopy2;
    case FONT_MALE: return FontFunc_Male;
    case FONT_FEMALE: return FontFunc_Female;
    case FONT_BRAILLE: return FontFunc_Braille;
    default: throw new Error(`gFontInfos[${fontId}].fontFunction is NULL`);
  }
}

/** text.c FontFunc_Small. */
export function FontFunc_Small(printer: TextPrinter): number {
  if (!printer.hasGlyphIdBeenSet) {
    printer.glyphId = FONT_SMALL;
    printer.hasGlyphIdBeenSet = true;
  }
  return RenderText(printer);
}

/** text.c FontFunc_NormalCopy1. */
export function FontFunc_NormalCopy1(printer: TextPrinter): number {
  if (!printer.hasGlyphIdBeenSet) {
    printer.glyphId = FONT_NORMAL_COPY_1;
    printer.hasGlyphIdBeenSet = true;
  }
  return RenderText(printer);
}

/** text.c FontFunc_Normal. */
export function FontFunc_Normal(printer: TextPrinter): number {
  if (!printer.hasGlyphIdBeenSet) {
    printer.glyphId = FONT_NORMAL;
    printer.hasGlyphIdBeenSet = true;
  }
  return RenderText(printer);
}

/** text.c FontFunc_NormalCopy2. */
export function FontFunc_NormalCopy2(printer: TextPrinter): number {
  if (!printer.hasGlyphIdBeenSet) {
    printer.glyphId = FONT_NORMAL_COPY_2;
    printer.hasGlyphIdBeenSet = true;
  }
  return RenderText(printer);
}

/** text.c FontFunc_Male. */
export function FontFunc_Male(printer: TextPrinter): number {
  if (!printer.hasGlyphIdBeenSet) {
    printer.glyphId = FONT_MALE;
    printer.hasGlyphIdBeenSet = true;
  }
  return RenderText(printer);
}

/** text.c FontFunc_Female. */
export function FontFunc_Female(printer: TextPrinter): number {
  if (!printer.hasGlyphIdBeenSet) {
    printer.glyphId = FONT_FEMALE;
    printer.hasGlyphIdBeenSet = true;
  }
  return RenderText(printer);
}

// ---------------------------------------------------------------- text.c down arrow

/** text.c TextPrinterInitDownArrowCounters. */
export function TextPrinterInitDownArrowCounters(printer: TextPrinter): void {
  if (textFlags.autoScroll) {
    printer.autoScrollDelay = 0;
  } else {
    printer.downArrowIndex = 0;
    printer.downArrowDelay = 0;
  }
}

/** text.c TextPrinterDrawDownArrow (the delay branch only decrements the counter). */
export function TextPrinterDrawDownArrow(printer: TextPrinter): void {
  if (textFlags.autoScroll) return;
  if (printer.downArrowDelay !== 0) {
    printer.downArrowDelay--;
    return;
  }
  printer.window.fillRect(printer.bg, printer.currentX, printer.currentY, 10, 12);
  const arrow = downArrow();
  const srcX = (textFlags.useAlternateDownArrow ? DARK_DOWN_ARROW_X : 0) + DOWN_ARROW_X[printer.downArrowIndex & 3];
  printer.window.blit(arrow.pixels, arrow.width, srcX, 0, printer.currentX, printer.currentY, 10, 12, true);
  printer.downArrowDelay = CURSOR_DELAY;
  printer.downArrowIndex = (printer.downArrowIndex + 1) & 3;
}

/** text.c TextPrinterClearDownArrow. */
export function TextPrinterClearDownArrow(printer: TextPrinter): void {
  printer.window.fillRect(printer.bg, printer.currentX, printer.currentY, 10, 12);
}

/** text.c TextPrinterWaitAutoMode: 50 frames during quest log playback, else 120. */
export function TextPrinterWaitAutoMode(printer: TextPrinter): boolean {
  const delay = gQuestLogState === C.QL_STATE_PLAYBACK ? 50 : 120;
  if (printer.autoScrollDelay === delay) return true;
  printer.autoScrollDelay++;
  return false;
}

/** text.c TextPrinterWaitWithDownArrow. */
export function TextPrinterWaitWithDownArrow(printer: TextPrinter): boolean {
  if (textFlags.autoScroll) return TextPrinterWaitAutoMode(printer);
  TextPrinterDrawDownArrow(printer);
  if (JOY_NEW(A_BUTTON | B_BUTTON)) {
    sound.playSE(sound.SE_SELECT);
    return true;
  }
  return false;
}

/** text.c TextPrinterWait. */
export function TextPrinterWait(printer: TextPrinter): boolean {
  if (textFlags.autoScroll) return TextPrinterWaitAutoMode(printer);
  if (JOY_NEW(A_BUTTON | B_BUTTON)) {
    sound.playSE(sound.SE_SELECT);
    return true;
  }
  return false;
}

/** text.c DrawDownArrow; the C's windowId and u8* counters are adapted to a surface and counter records. */
export function DrawDownArrow(window: TextSurface, x: number, y: number, bgColor: number, drawArrow: boolean, counter: { value: number }, yCoordIndex: { value: number }): void {
  if (counter.value !== 0) {
    counter.value--;
    return;
  }
  window.fillRect(bgColor, x, y, 10, 12);
  if (!drawArrow) {
    const arrow = downArrow();
    const srcX = (textFlags.useAlternateDownArrow ? DARK_DOWN_ARROW_X : 0) + DOWN_ARROW_X[yCoordIndex.value & 3];
    window.blit(arrow.pixels, arrow.width, srcX, 0, x, y, 10, 12, true);
    counter.value = CURSOR_DELAY;
    yCoordIndex.value++;
  }
}

// ---------------------------------------------------------------- text.c RenderText

/** text.c RenderText: the printer state machine behind gFonts[fontId].fontFunction. */
export function RenderText(printer: TextPrinter): number {
  switch (printer.state) {
    case State.HandleChar: {
      if (JOY_HELD(A_BUTTON | B_BUTTON) && printer.sped) printer.delayCounter = 0;
      if (printer.delayCounter && printer.textSpeed) {
        printer.delayCounter--;
        if (textFlags.canABSpeedUpPrint && JOY_NEW(A_BUTTON | B_BUTTON)) {
          printer.sped = true;
          printer.delayCounter = 0;
        }
        return RENDER_UPDATE;
      }
      printer.delayCounter = textFlags.autoScroll ? 1 : printer.textSpeed;
      let currChar = printer.next();
      switch (currChar) {
        case CHAR_NEWLINE:
          printer.currentX = printer.x;
          printer.currentY += (gFonts ?? FONT_INFOS)[printer.fontId].maxLetterHeight + printer.lineSpacing;
          return RENDER_REPEAT;
        case PLACEHOLDER_BEGIN:
          printer.pos++;
          return RENDER_REPEAT;
        case EXT_CTRL_CODE_BEGIN: {
          const code = printer.next();
          switch (code) {
            case C.EXT_CTRL_CODE_COLOR:
              printer.fg = printer.next();
              GenerateFontHalfRowLookupTable(printer.fg, printer.bg, printer.shadow);
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_HIGHLIGHT:
              printer.bg = printer.next();
              GenerateFontHalfRowLookupTable(printer.fg, printer.bg, printer.shadow);
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_SHADOW:
              printer.shadow = printer.next();
              GenerateFontHalfRowLookupTable(printer.fg, printer.bg, printer.shadow);
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_COLOR_HIGHLIGHT_SHADOW:
              printer.fg = printer.next();
              printer.bg = printer.next();
              printer.shadow = printer.next();
              GenerateFontHalfRowLookupTable(printer.fg, printer.bg, printer.shadow);
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_PALETTE:
              printer.pos++;
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_FONT:
              printer.glyphId = printer.next();
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_RESET_FONT:
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_PAUSE:
              printer.delayCounter = printer.next();
              printer.state = State.Pause;
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_PAUSE_UNTIL_PRESS:
              printer.state = State.Wait;
              if (textFlags.autoScroll) printer.autoScrollDelay = 0;
              return RENDER_UPDATE;
            case C.EXT_CTRL_CODE_WAIT_SE:
              printer.state = State.WaitSe;
              return RENDER_UPDATE;
            case C.EXT_CTRL_CODE_PLAY_BGM: {
              const song = printer.next() | (printer.next() << 8);
              if (gQuestLogState !== C.QL_STATE_PLAYBACK) sound.playBGM(song);
              return RENDER_REPEAT;
            }
            case C.EXT_CTRL_CODE_PLAY_SE:
              sound.playSE(printer.next() | (printer.next() << 8));
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_ESCAPE:
              printer.pos++;
              currChar = printer.next();
              break;
            case C.EXT_CTRL_CODE_SHIFT_RIGHT:
              printer.currentX = printer.x + printer.next();
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_SHIFT_DOWN:
              printer.currentY = printer.y + printer.next();
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_FILL_WINDOW:
              printer.window.fill(printer.bg);
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_PAUSE_MUSIC:
              sound.pauseBGM();
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_RESUME_MUSIC:
              sound.resumeBGM();
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_CLEAR: {
              const width = printer.next();
              if (width > 0) {
                ClearTextSpan(printer, width);
                printer.currentX += width;
                return RENDER_PRINT;
              }
              return RENDER_REPEAT;
            }
            case C.EXT_CTRL_CODE_SKIP:
              printer.currentX = printer.next() + printer.x;
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_CLEAR_TO: {
              const widthHelper = printer.next() + printer.x;
              const width = widthHelper - printer.currentX;
              if (width > 0) {
                ClearTextSpan(printer, width);
                printer.currentX += width;
                return RENDER_PRINT;
              }
              return RENDER_REPEAT;
            }
            case C.EXT_CTRL_CODE_MIN_LETTER_SPACING:
              printer.minLetterSpacing = printer.next();
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_JPN:
              printer.japanese = true;
              return RENDER_REPEAT;
            case C.EXT_CTRL_CODE_ENG:
              printer.japanese = false;
              return RENDER_REPEAT;
          }
          break;
        }
        case CHAR_PROMPT_CLEAR:
          printer.state = State.Clear;
          TextPrinterInitDownArrowCounters(printer);
          return RENDER_UPDATE;
        case CHAR_PROMPT_SCROLL:
          printer.state = State.ScrollStart;
          TextPrinterInitDownArrowCounters(printer);
          return RENDER_UPDATE;
        case CHAR_EXTRA_SYMBOL:
          currChar = printer.next() | 0x100;
          break;
        case CHAR_KEYPAD_ICON: {
          const keypadIconId = printer.next();
          gGlyphInfo.width = DrawKeypadIcon(printer.window, keypadIconId, printer.currentX, printer.currentY);
          printer.currentX += gGlyphInfo.width + printer.letterSpacing;
          return RENDER_PRINT;
        }
        case EOS:
          return RENDER_FINISH;
      }

      switch (printer.glyphId) {
        case FONT_SMALL:
          DecompressGlyph_Small(currChar, printer.japanese);
          break;
        case FONT_NORMAL_COPY_1:
          DecompressGlyph_NormalCopy1(currChar, printer.japanese);
          break;
        case FONT_NORMAL:
          DecompressGlyph_Normal(currChar, printer.japanese);
          break;
        case FONT_NORMAL_COPY_2:
          DecompressGlyph_NormalCopy2(currChar, printer.japanese);
          break;
        case FONT_MALE:
          DecompressGlyph_Male(currChar, printer.japanese);
          break;
        case FONT_FEMALE:
          DecompressGlyph_Female(currChar, printer.japanese);
          break;
      }

      CopyGlyphToWindow(printer);

      if (printer.minLetterSpacing) {
        printer.currentX += gGlyphInfo.width;
        const width = printer.minLetterSpacing - gGlyphInfo.width;
        if (width > 0) {
          ClearTextSpan(printer, width);
          printer.currentX += width;
        }
      } else if (printer.japanese) {
        printer.currentX += gGlyphInfo.width + printer.letterSpacing;
      } else {
        printer.currentX += gGlyphInfo.width;
      }
      return RENDER_PRINT;
    }
    case State.Wait:
      if (TextPrinterWait(printer)) printer.state = State.HandleChar;
      return RENDER_UPDATE;
    case State.Clear:
      if (TextPrinterWaitWithDownArrow(printer)) {
        printer.window.fill(printer.bg);
        printer.currentX = printer.x;
        printer.currentY = printer.y;
        printer.state = State.HandleChar;
      }
      return RENDER_UPDATE;
    case State.ScrollStart:
      if (TextPrinterWaitWithDownArrow(printer)) {
        TextPrinterClearDownArrow(printer);
        printer.scrollDistance = (gFonts ?? FONT_INFOS)[printer.fontId].maxLetterHeight + printer.lineSpacing;
        printer.currentX = printer.x;
        printer.state = State.Scroll;
      }
      return RENDER_UPDATE;
    case State.Scroll:
      if (printer.scrollDistance) {
        const speed = SCROLL_SPEEDS[textOptions.speed] ?? 2;
        const step = Math.min(printer.scrollDistance, speed);
        printer.window.scroll(step, printer.bg);
        printer.scrollDistance -= step;
      } else {
        printer.state = State.HandleChar;
      }
      return RENDER_UPDATE;
    case State.WaitSe:
      if (!sound.isSEPlaying()) printer.state = State.HandleChar;
      return RENDER_UPDATE;
    case State.Pause:
      if (printer.delayCounter !== 0) printer.delayCounter--;
      else printer.state = State.HandleChar;
      return RENDER_UPDATE;
  }
  return RENDER_FINISH;
}

/**
 * braille_text.c FontFunc_Braille: the same printer states as RenderText, with
 * Braille-specific character handling and glyph data.
 */
export function FontFunc_Braille(printer: TextPrinter): number {
  switch (printer.state) {
    case State.HandleChar:
      return FontFunc_Braille_HandleChar(printer);
    case State.Wait:
      if (TextPrinterWait(printer)) printer.state = State.HandleChar;
      return RENDER_UPDATE;
    case State.Clear:
      if (TextPrinterWaitWithDownArrow(printer)) {
        printer.window.fill(printer.bg);
        printer.currentX = printer.x;
        printer.currentY = printer.y;
        printer.state = State.HandleChar;
      }
      return RENDER_UPDATE;
    case State.ScrollStart:
      if (TextPrinterWaitWithDownArrow(printer)) {
        TextPrinterClearDownArrow(printer);
        printer.scrollDistance = (gFonts ?? FONT_INFOS)[printer.fontId].maxLetterHeight + printer.lineSpacing;
        printer.currentX = printer.x;
        printer.state = State.Scroll;
      }
      return RENDER_UPDATE;
    case State.Scroll:
      if (printer.scrollDistance) {
        const speed = SCROLL_SPEEDS[textOptions.speed] ?? 2;
        const step = Math.min(printer.scrollDistance, speed);
        printer.window.scroll(step, printer.bg);
        printer.scrollDistance -= step;
      } else {
        printer.state = State.HandleChar;
      }
      return RENDER_UPDATE;
    case State.WaitSe:
      if (!sound.isSEPlaying()) printer.state = State.HandleChar;
      return RENDER_UPDATE;
    case State.Pause:
      if (printer.delayCounter !== 0) printer.delayCounter--;
      else printer.state = State.HandleChar;
      return RENDER_UPDATE;
  }
  return RENDER_FINISH;
}

/**
 * FontFunc_Braille's RENDER_STATE_HANDLE_CHAR behavior. Differences from
 * normal text: sounds are skipped, keypad icons draw nothing, unknown
 * control codes print as glyphs, and every glyph is 16 px wide.
 */
function FontFunc_Braille_HandleChar(printer: TextPrinter): number {
  if (JOY_HELD(A_BUTTON | B_BUTTON) && printer.sped) printer.delayCounter = 0;
  if (printer.delayCounter && printer.textSpeed) {
    printer.delayCounter--;
    if (textFlags.canABSpeedUpPrint && JOY_NEW(A_BUTTON | B_BUTTON)) {
      printer.sped = true;
      printer.delayCounter = 0;
    }
    return RENDER_UPDATE;
  }
  printer.delayCounter = textFlags.autoScroll ? 1 : printer.textSpeed;
  let c = printer.next();
  switch (c) {
    case EOS:
      return RENDER_FINISH;
    case CHAR_NEWLINE:
      printer.currentX = printer.x;
      printer.currentY += (gFonts ?? FONT_INFOS)[printer.fontId].maxLetterHeight + printer.lineSpacing;
      return RENDER_REPEAT;
    case PLACEHOLDER_BEGIN:
      printer.pos++;
      return RENDER_REPEAT;
    case EXT_CTRL_CODE_BEGIN:
      c = printer.next();
      switch (c) {
        case 0x01: printer.fg = printer.next(); GenerateFontHalfRowLookupTable(printer.fg, printer.bg, printer.shadow); return RENDER_REPEAT;
        case 0x02: printer.bg = printer.next(); GenerateFontHalfRowLookupTable(printer.fg, printer.bg, printer.shadow); return RENDER_REPEAT;
        case 0x03: printer.shadow = printer.next(); GenerateFontHalfRowLookupTable(printer.fg, printer.bg, printer.shadow); return RENDER_REPEAT;
        case 0x04: printer.fg = printer.next(); printer.bg = printer.next(); printer.shadow = printer.next(); GenerateFontHalfRowLookupTable(printer.fg, printer.bg, printer.shadow); return RENDER_REPEAT;
        case 0x05: printer.pos++; return RENDER_REPEAT;
        case 0x06: printer.pos++; return RENDER_REPEAT; // sub->glyphId = font; unused by the braille font
        case 0x07: return RENDER_REPEAT;
        case 0x08: printer.delayCounter = printer.next(); printer.state = State.Pause; return RENDER_REPEAT;
        case 0x09:
          printer.state = State.Wait;
          if (textFlags.autoScroll) printer.autoScrollDelay = 0;
          return RENDER_UPDATE;
        case 0x0a: printer.state = State.WaitSe; return RENDER_UPDATE;
        case 0x0b: case 0x10: printer.pos += 2; return RENDER_REPEAT;
        case 0x0c: c = printer.next(); break;
        case 0x0d: printer.currentX = printer.x + printer.next(); return RENDER_REPEAT;
        case 0x0e: printer.currentY = printer.y + printer.next(); return RENDER_REPEAT;
        case 0x0f: printer.window.fill(printer.bg); return RENDER_REPEAT;
      }
      break;
    case CHAR_PROMPT_CLEAR:
      printer.state = State.Clear;
      TextPrinterInitDownArrowCounters(printer);
      return RENDER_UPDATE;
    case CHAR_PROMPT_SCROLL:
      printer.state = State.ScrollStart;
      TextPrinterInitDownArrowCounters(printer);
      return RENDER_UPDATE;
    case CHAR_EXTRA_SYMBOL:
      c = printer.next() | 0x100;
      break;
    case CHAR_KEYPAD_ICON:
      printer.pos++;
      return RENDER_PRINT;
  }
  const g = glyph(FONT_BRAILLE, c);
  gGlyphInfo.pixels = g.pixels;
  gGlyphInfo.width = g.width;
  gGlyphInfo.height = g.height;
  CopyGlyphToWindow(printer);
  printer.currentX += g.width + printer.letterSpacing;
  return RENDER_PRINT;
}

// ---------------------------------------------------------------- text.c glyph decompression

const glyphTables = new Map<string, Uint16Array>();

/** The u16 INCBIN glyph data of text.c (sFont*Glyphs), cached. */
function glyphTable(name: string): Uint16Array {
  let table = glyphTables.get(name);
  if (!table) {
    table = incbin16(name);
    glyphTables.set(name, table);
  }
  return table;
}

/**
 * The text.c `if (glyphId == 0)` branches fill every pixel of gGlyphInfo with
 * GetLastTextColor(2), the background color: role 0 is the bg color when the
 * glyph is copied into a window.
 */
function fillGlyphInfo(width: number, height: number): void {
  gGlyphInfo.pixels.fill(0);
  gGlyphInfo.width = width;
  gGlyphInfo.height = height;
}

/** text.c DecompressGlyph_Small. */
export function DecompressGlyph_Small(glyphId: number, isJapanese: boolean): void {
  if (isJapanese === true) {
    const glyphs = glyphTable("sFontSmallJapaneseGlyphs");
    const base = 0x100 * (glyphId >> 4) + 0x8 * (glyphId & 0xF);
    DecompressGlyphTile(glyphs, base, gGlyphInfo.pixels, 0, 0);
    DecompressGlyphTile(glyphs, base + 0x80, gGlyphInfo.pixels, 0, 8);
    gGlyphInfo.width = 8;
    gGlyphInfo.height = 12;
  } else {
    const glyphs = glyphTable("sFontSmallLatinGlyphs");
    const base = 0x10 * glyphId;
    DecompressGlyphTile(glyphs, base, gGlyphInfo.pixels, 0, 0);
    DecompressGlyphTile(glyphs, base + 0x8, gGlyphInfo.pixels, 0, 8);
    gGlyphInfo.width = GetGlyphWidth_Small(glyphId, false);
    gGlyphInfo.height = 13;
  }
}

/** text.c DecompressGlyph_NormalCopy1. */
export function DecompressGlyph_NormalCopy1(glyphId: number, isJapanese: boolean): void {
  if (isJapanese === true) {
    const glyphs = glyphTable("sFontTallJapaneseGlyphs");
    const base = 0x100 * (glyphId >> 4) + 0x8 * (glyphId & 0xF);
    DecompressGlyphTile(glyphs, base, gGlyphInfo.pixels, 0, 0);
    DecompressGlyphTile(glyphs, base + 0x80, gGlyphInfo.pixels, 0, 8);
    gGlyphInfo.width = 8;
    gGlyphInfo.height = 16;
  } else {
    const glyphs = glyphTable("sFontNormalCopy1LatinGlyphs");
    const base = 0x20 * glyphId;
    DecompressGlyphTile(glyphs, base, gGlyphInfo.pixels, 0, 0);
    DecompressGlyphTile(glyphs, base + 0x8, gGlyphInfo.pixels, 8, 0);
    DecompressGlyphTile(glyphs, base + 0x10, gGlyphInfo.pixels, 0, 8);
    DecompressGlyphTile(glyphs, base + 0x18, gGlyphInfo.pixels, 8, 8);
    gGlyphInfo.width = GetGlyphWidth_NormalCopy1(glyphId, false);
    gGlyphInfo.height = 14;
  }
}

/** text.c DecompressGlyph_Normal. */
export function DecompressGlyph_Normal(glyphId: number, isJapanese: boolean): void {
  if (isJapanese === true) {
    if (glyphId === 0) {
      fillGlyphInfo(10, 12);
      return;
    }
    const glyphs = glyphTable("sFontNormalJapaneseGlyphs");
    const base = 0x100 * (glyphId >> 3) + 0x10 * (glyphId & 0x7);
    DecompressGlyphTile(glyphs, base, gGlyphInfo.pixels, 0, 0);
    DecompressGlyphTile(glyphs, base + 0x8, gGlyphInfo.pixels, 8, 0);
    DecompressGlyphTile(glyphs, base + 0x80, gGlyphInfo.pixels, 0, 8);
    DecompressGlyphTile(glyphs, base + 0x88, gGlyphInfo.pixels, 8, 8);
    gGlyphInfo.width = GetGlyphWidth_Normal(glyphId, true);
    gGlyphInfo.height = 12;
  } else {
    if (glyphId === 0) {
      fillGlyphInfo(GetGlyphWidth_Normal(0, false), 14);
      return;
    }
    const glyphs = glyphTable("sFontNormalLatinGlyphs");
    const base = 0x20 * glyphId;
    DecompressGlyphTile(glyphs, base, gGlyphInfo.pixels, 0, 0);
    DecompressGlyphTile(glyphs, base + 0x8, gGlyphInfo.pixels, 8, 0);
    DecompressGlyphTile(glyphs, base + 0x10, gGlyphInfo.pixels, 0, 8);
    DecompressGlyphTile(glyphs, base + 0x18, gGlyphInfo.pixels, 8, 8);
    gGlyphInfo.width = GetGlyphWidth_Normal(glyphId, false);
    gGlyphInfo.height = 14;
  }
}

/** text.c DecompressGlyph_NormalCopy2. */
export function DecompressGlyph_NormalCopy2(glyphId: number, isJapanese: boolean): void {
  if (isJapanese === true) {
    if (glyphId === 0) {
      fillGlyphInfo(10, 12);
      return;
    }
    const glyphs = glyphTable("sFontNormalJapaneseGlyphs");
    const base = 0x100 * (glyphId >> 3) + 0x10 * (glyphId & 0x7);
    DecompressGlyphTile(glyphs, base, gGlyphInfo.pixels, 0, 0);
    DecompressGlyphTile(glyphs, base + 0x8, gGlyphInfo.pixels, 8, 0);
    DecompressGlyphTile(glyphs, base + 0x80, gGlyphInfo.pixels, 0, 8);
    DecompressGlyphTile(glyphs, base + 0x88, gGlyphInfo.pixels, 8, 8);
    gGlyphInfo.width = GetGlyphWidth_NormalCopy2(glyphId, true);
    gGlyphInfo.height = 12;
  } else {
    DecompressGlyph_Normal(glyphId, isJapanese);
  }
}

/** text.c DecompressGlyph_Male. */
export function DecompressGlyph_Male(glyphId: number, isJapanese: boolean): void {
  if (isJapanese === true) {
    if (glyphId === 0) {
      fillGlyphInfo(10, 12);
      return;
    }
    const glyphs = glyphTable("sFontMaleJapaneseGlyphs");
    const base = 0x100 * (glyphId >> 3) + 0x10 * (glyphId & 0x7);
    DecompressGlyphTile(glyphs, base, gGlyphInfo.pixels, 0, 0);
    DecompressGlyphTile(glyphs, base + 0x8, gGlyphInfo.pixels, 8, 0);
    DecompressGlyphTile(glyphs, base + 0x80, gGlyphInfo.pixels, 0, 8);
    DecompressGlyphTile(glyphs, base + 0x88, gGlyphInfo.pixels, 8, 8);
    gGlyphInfo.width = GetGlyphWidth_Male(glyphId, true);
    gGlyphInfo.height = 12;
  } else {
    if (glyphId === 0) {
      fillGlyphInfo(GetGlyphWidth_Male(0, false), 14);
      return;
    }
    const glyphs = glyphTable("sFontMaleLatinGlyphs");
    const base = 0x20 * glyphId;
    DecompressGlyphTile(glyphs, base, gGlyphInfo.pixels, 0, 0);
    DecompressGlyphTile(glyphs, base + 0x8, gGlyphInfo.pixels, 8, 0);
    DecompressGlyphTile(glyphs, base + 0x10, gGlyphInfo.pixels, 0, 8);
    DecompressGlyphTile(glyphs, base + 0x18, gGlyphInfo.pixels, 8, 8);
    gGlyphInfo.width = GetGlyphWidth_Male(glyphId, false);
    gGlyphInfo.height = 14;
  }
}

/** text.c DecompressGlyph_Female. */
export function DecompressGlyph_Female(glyphId: number, isJapanese: boolean): void {
  if (isJapanese === true) {
    if (glyphId === 0) {
      fillGlyphInfo(10, 12);
      return;
    }
    const glyphs = glyphTable("sFontFemaleJapaneseGlyphs");
    const base = 0x100 * (glyphId >> 3) + 0x10 * (glyphId & 0x7);
    DecompressGlyphTile(glyphs, base, gGlyphInfo.pixels, 0, 0);
    DecompressGlyphTile(glyphs, base + 0x8, gGlyphInfo.pixels, 8, 0);
    DecompressGlyphTile(glyphs, base + 0x80, gGlyphInfo.pixels, 0, 8);
    DecompressGlyphTile(glyphs, base + 0x88, gGlyphInfo.pixels, 8, 8);
    gGlyphInfo.width = GetGlyphWidth_Female(glyphId, true);
    gGlyphInfo.height = 12;
  } else {
    if (glyphId === 0) {
      fillGlyphInfo(GetGlyphWidth_Female(0, false), 14);
      return;
    }
    const glyphs = glyphTable("sFontFemaleLatinGlyphs");
    const base = 0x20 * glyphId;
    DecompressGlyphTile(glyphs, base, gGlyphInfo.pixels, 0, 0);
    DecompressGlyphTile(glyphs, base + 0x8, gGlyphInfo.pixels, 8, 0);
    DecompressGlyphTile(glyphs, base + 0x10, gGlyphInfo.pixels, 0, 8);
    DecompressGlyphTile(glyphs, base + 0x18, gGlyphInfo.pixels, 8, 8);
    gGlyphInfo.width = GetGlyphWidth_Female(glyphId, false);
    gGlyphInfo.height = 14;
  }
}

/** text.c DecompressGlyph_Bold (only RenderTextHandleBold uses it in C). */
export function DecompressGlyph_Bold(glyphId: number): void {
  const glyphs = glyphTable("sFontBoldJapaneseGlyphs");
  const base = 0x100 * (glyphId >> 4) + 0x8 * (glyphId & 0xF);
  DecompressGlyphTile(glyphs, base, gGlyphInfo.pixels, 0, 0);
  DecompressGlyphTile(glyphs, base + 0x80, gGlyphInfo.pixels, 0, 8);
  gGlyphInfo.width = 8;
  gGlyphInfo.height = 12;
}

// ---------------------------------------------------------------- text.c keypad icons

/** text.c DrawKeypadIcon: blits sKeypadIcons[id] and returns its width. */
export function DrawKeypadIcon(window: TextSurface, keypadIconId: number, x: number, y: number): number {
  const info = KEYPAD_ICONS[keypadIconId];
  if (!info) return 0;
  const sheet = GetKeypadIconSheet();
  const [tile, width, height] = info;
  const cols = sheet.width / 8;
  const sx = (tile % cols) * 8;
  const sy = Math.floor(tile / cols) * 8;
  window.blit(sheet.pixels, sheet.width, sx, sy, x, y, width, height, true);
  return width;
}

// ---------------------------------------------------------------- text_printer.c entry points

/** text_printer.c RenderFont. */
export function RenderFont(printer: TextPrinter): number {
  for (;;) {
    const ret = fontFunctionFor(printer.fontId)(printer);
    if (ret !== RENDER_REPEAT) return ret;
  }
}

/** text_printer.c CopyGlyphToWindow, adapted to the current window surface. */
export function CopyGlyphToWindow(printer: TextPrinter): void {
  const colors = [printer.bg, printer.fg, printer.shadow];
  const pixels = gGlyphInfo.pixels;
  const maxW = Math.min(gGlyphInfo.width, printer.window.pixelWidth - printer.currentX);
  const maxH = Math.min(gGlyphInfo.height, printer.window.pixelHeight - printer.currentY);
  for (let y = 0; y < maxH; y++) {
    for (let x = 0; x < maxW; x++) {
      // GLYPH_COPY: pixels whose final color is 0 leave the window untouched.
      const color = colors[pixels[y * 16 + x]] ?? printer.bg;
      if (color !== 0) printer.window.setPixel(printer.currentX + x, printer.currentY + y, color);
    }
  }
}

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
