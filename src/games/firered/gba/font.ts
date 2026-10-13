// Latin fonts from graphics/fonts with the glyph width tables, keypad icons
// and GetStringWidth from text.c.

import { b64, rom } from "../rom";
import { cdata, incbin16 } from "../hw/assets";
import { DynamicPlaceholderTextUtil_GetPlaceholderPtr } from "../dynamicPlaceholderTextUtil";
import * as C from "../generated/constants";
import { CHAR_EXTRA_SYMBOL, CHAR_KEYPAD_ICON, CHAR_NEWLINE, CHAR_PROMPT_CLEAR, CHAR_PROMPT_SCROLL, EOS, EXT_CTRL_CODE_BEGIN, PLACEHOLDER_BEGIN } from "./charmap";
import { stringVars } from "./stringBuffers";

export const FONT_SMALL = 0;
export const FONT_NORMAL_COPY_1 = 1;
export const FONT_NORMAL = 2;
export const FONT_NORMAL_COPY_2 = 3;
export const FONT_MALE = 4;
export const FONT_FEMALE = 5;
export const FONT_BRAILLE = 6;
export const FONT_BOLD = 7;

export type FontInfo = { maxLetterWidth: number; maxLetterHeight: number; letterSpacing: number; lineSpacing: number; fgColor: number; bgColor: number; shadowColor: number };

// gFontInfos from new_menu_helpers.c (fontFunction lives in textPrinter.ts,
// which owns the TextPrinter type).
export const FONT_INFOS: FontInfo[] = [
  { maxLetterWidth: 8, maxLetterHeight: 13, letterSpacing: 0, lineSpacing: 0, fgColor: 2, bgColor: 1, shadowColor: 3 },
  { maxLetterWidth: 8, maxLetterHeight: 14, letterSpacing: 0, lineSpacing: 0, fgColor: 2, bgColor: 1, shadowColor: 3 },
  { maxLetterWidth: 10, maxLetterHeight: 14, letterSpacing: 1, lineSpacing: 0, fgColor: 2, bgColor: 1, shadowColor: 3 },
  { maxLetterWidth: 10, maxLetterHeight: 14, letterSpacing: 1, lineSpacing: 0, fgColor: 2, bgColor: 1, shadowColor: 3 },
  { maxLetterWidth: 10, maxLetterHeight: 14, letterSpacing: 0, lineSpacing: 0, fgColor: 2, bgColor: 1, shadowColor: 3 },
  { maxLetterWidth: 10, maxLetterHeight: 14, letterSpacing: 0, lineSpacing: 0, fgColor: 2, bgColor: 1, shadowColor: 3 },
  { maxLetterWidth: 8, maxLetterHeight: 16, letterSpacing: 0, lineSpacing: 2, fgColor: 2, bgColor: 1, shadowColor: 3 },
  { maxLetterWidth: 8, maxLetterHeight: 8, letterSpacing: 0, lineSpacing: 0, fgColor: 1, bgColor: 2, shadowColor: 15 },
];

type FontSheet = { width: number; pixels: Uint8Array; widths: number[]; cell: number; height: number };

const sheets = new Map<string, FontSheet>();

function sheet(name: string): FontSheet {
  let s = sheets.get(name);
  if (!s) {
    const raw = rom.fonts[name];
    s = { width: raw.width, pixels: b64(raw.pixels), widths: raw.widths ?? [], cell: 16, height: raw.height };
    sheets.set(name, s);
  }
  return s;
}

function sheetFor(fontId: number): { s: FontSheet; height: number; cellW?: number } {
  switch (fontId) {
    // DecompressGlyph_Small: 8x16 glyphs, laid out as 8-pixel-wide cells in the exported sheet.
    case FONT_SMALL: return { s: sheet("small"), height: 13, cellW: 8 };
    case FONT_MALE: return { s: sheet("male"), height: 14 };
    case FONT_FEMALE: return { s: sheet("female"), height: 14 };
    default: return { s: sheet("normal"), height: 14 };
  }
}

export type Glyph = { width: number; height: number; pixels: Uint8Array };

const glyphPixels = new Uint8Array(16 * 16);

// ---------------------------------------------------------------- braille_text.c

/**
 * text_printer.c DecompressGlyphTile for one 8x8 tile: each u16 holds a row, high
 * byte first; sFontHalfRowOffsets turns a byte into a lookup index i*27+j*9+k*3+l whose
 * entry packs colors[i] in the lowest nibble (the leftmost pixel), then j, k, l
 * (GenerateFontHalfRowLookupTable, colors = {bg, fg, shadow} → 0/1/2 here).
 */
export function DecompressGlyphTile(src: Uint16Array, srcOffset: number, dest: Uint8Array, destX: number, destY: number): void {
  const offsets = cdata<number[]>("text_printer", "sFontHalfRowOffsets");
  for (let i = 0; i < 16; i++) {
    const word = src[srcOffset + (i >> 1)]!;
    const offsetIndex = i & 1 ? word & 0xff : word >> 8;
    const lut = offsets[offsetIndex]!;
    const row = destY + (i >> 1);
    const col = destX + (i & 1) * 4;
    dest[row * 16 + col] = Math.trunc(lut / 27) % 3;
    dest[row * 16 + col + 1] = Math.trunc(lut / 9) % 3;
    dest[row * 16 + col + 2] = Math.trunc(lut / 3) % 3;
    dest[row * 16 + col + 3] = lut % 3;
  }
}

/** braille_text.c DecompressGlyph_Braille: four 8x8 tiles from sBrailleGlyphs, always 16x16. */
function DecompressGlyph_Braille(code: number): Glyph {
  const glyphs = incbin16("sBrailleGlyphs");
  const base = 0x100 * Math.trunc(code / 8) + 0x10 * (code % 8);
  glyphPixels.fill(0);
  DecompressGlyphTile(glyphs, base, glyphPixels, 0, 0);
  DecompressGlyphTile(glyphs, base + 0x8, glyphPixels, 8, 0);
  DecompressGlyphTile(glyphs, base + 0x80, glyphPixels, 0, 8);
  DecompressGlyphTile(glyphs, base + 0x88, glyphPixels, 8, 8);
  return { width: 16, height: 16, pixels: glyphPixels };
}

/** DecompressGlyph_*: returns 2bpp-style values 0=bg 1=fg 2=shadow. */
export function glyph(fontId: number, code: number): Glyph {
  if (fontId === FONT_BRAILLE) return DecompressGlyph_Braille(code);
  const { s, height, cellW = 16 } = sheetFor(fontId);
  const cols = s.width / cellW;
  const x0 = (code % cols) * cellW;
  const y0 = Math.floor(code / cols) * 16;
  glyphPixels.fill(0);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < cellW; x++) {
      const v = s.pixels[(y0 + y) * s.width + x0 + x] ?? 0;
      glyphPixels[y * 16 + x] = v === 3 ? 0 : v;
    }
  }
  return { width: s.widths[code] ?? 8, height, pixels: glyphPixels };
}

export function glyphWidth(fontId: number, code: number): number {
  if (fontId === FONT_BRAILLE) return GetGlyphWidth_Braille(fontId, false);
  return sheetFor(fontId).s.widths[code] ?? 8;
}

/** GetGlyphWidth_Braille (braille_text.c); both arguments are ignored by C. */
export function GetGlyphWidth_Braille(_fontType: number, _isJapanese: boolean): number {
  return 16;
}

// ---------------------------------------------------------------- text.c keypad icons

let keypadPixels: Uint8Array | undefined;
let keypadWidth = 0;
/** text.c gKeypadIconTiles sheet ({ pixels: one palette index per byte, width }). */
export function GetKeypadIconSheet(): { pixels: Uint8Array; width: number } {
  if (!keypadPixels) {
    const raw = rom.fonts.keypad_icons;
    keypadPixels = b64(raw.pixels);
    keypadWidth = raw.width;
  }
  return { pixels: keypadPixels, width: keypadWidth };
}

/** text.c sKeypadIcons: [tileOffset, width, height]. */
export const KEYPAD_ICONS: Record<number, [number, number, number]> = {
  0x00: [0x0, 8, 12], 0x01: [0x1, 8, 12], 0x02: [0x2, 16, 12], 0x03: [0x4, 16, 12], 0x04: [0x6, 24, 12], 0x05: [0x9, 24, 12],
  0x06: [0xc, 8, 12], 0x07: [0xd, 8, 12], 0x08: [0xe, 8, 12], 0x09: [0xf, 8, 12], 0x0a: [0x20, 8, 12], 0x0b: [0x21, 8, 12], 0x0c: [0x22, 8, 12],
};

/** text.c GetKeypadIconTileOffset. */
export function GetKeypadIconTileOffset(keypadIconId: number): number {
  return KEYPAD_ICONS[keypadIconId]?.[0] ?? 0;
}

/** text.c GetKeypadIconWidth. */
export function GetKeypadIconWidth(keypadIconId: number): number {
  return KEYPAD_ICONS[keypadIconId]?.[1] ?? 0;
}

/** text.c GetKeypadIconHeight. */
export function GetKeypadIconHeight(keypadIconId: number): number {
  return KEYPAD_ICONS[keypadIconId]?.[2] ?? 0;
}

// ---------------------------------------------------------------- text.c glyph widths

const widthTables = new Map<string, number[]>();

/** The sFont*GlyphWidths byte tables of text.c (cdata "text"), cached. */
function widthTable(name: string): number[] {
  let table = widthTables.get(name);
  if (!table) {
    table = cdata<number[]>("text", name);
    widthTables.set(name, table);
  }
  return table;
}

/** text.c GetGlyphWidth_Small. */
export function GetGlyphWidth_Small(glyphId: number, isJapanese: boolean): number {
  if (isJapanese === true) return 8;
  return widthTable("sFontSmallLatinGlyphWidths")[glyphId] ?? 0;
}

/** text.c GetGlyphWidth_NormalCopy1. */
export function GetGlyphWidth_NormalCopy1(glyphId: number, isJapanese: boolean): number {
  if (isJapanese === true) return 8;
  return widthTable("sFontNormalCopy1LatinGlyphWidths")[glyphId] ?? 0;
}

/** text.c GetGlyphWidth_Normal. */
export function GetGlyphWidth_Normal(glyphId: number, isJapanese: boolean): number {
  if (isJapanese === true) {
    if (glyphId === 0) return 10;
    return widthTable("sFontNormalJapaneseGlyphWidths")[glyphId] ?? 0;
  }
  return widthTable("sFontNormalLatinGlyphWidths")[glyphId] ?? 0;
}

/** text.c GetGlyphWidth_NormalCopy2. */
export function GetGlyphWidth_NormalCopy2(glyphId: number, isJapanese: boolean): number {
  if (isJapanese === true) return 10;
  return widthTable("sFontNormalLatinGlyphWidths")[glyphId] ?? 0;
}

/** text.c GetGlyphWidth_Male. */
export function GetGlyphWidth_Male(glyphId: number, isJapanese: boolean): number {
  if (isJapanese === true) {
    if (glyphId === 0) return 10;
    return widthTable("sFontMaleJapaneseGlyphWidths")[glyphId] ?? 0;
  }
  return widthTable("sFontMaleLatinGlyphWidths")[glyphId] ?? 0;
}

/** text.c GetGlyphWidth_Female. */
export function GetGlyphWidth_Female(glyphId: number, isJapanese: boolean): number {
  if (isJapanese === true) {
    if (glyphId === 0) return 10;
    return widthTable("sFontFemaleJapaneseGlyphWidths")[glyphId] ?? 0;
  }
  return widthTable("sFontFemaleLatinGlyphWidths")[glyphId] ?? 0;
}

// text.c sGlyphWidthFuncs (FONT_BOLD has no entry).
const sGlyphWidthFuncs: { fontId: number; func: (glyphId: number, isJapanese: boolean) => number }[] = [
  { fontId: FONT_SMALL, func: GetGlyphWidth_Small },
  { fontId: FONT_NORMAL_COPY_1, func: GetGlyphWidth_NormalCopy1 },
  { fontId: FONT_NORMAL, func: GetGlyphWidth_Normal },
  { fontId: FONT_NORMAL_COPY_2, func: GetGlyphWidth_NormalCopy2 },
  { fontId: FONT_MALE, func: GetGlyphWidth_Male },
  { fontId: FONT_FEMALE, func: GetGlyphWidth_Female },
  { fontId: FONT_BRAILLE, func: GetGlyphWidth_Braille },
];

/** text.c GetFontWidthFunc: the width function of a glyphId, or NULL. */
export function GetFontWidthFunc(glyphId: number): ((glyphId: number, isJapanese: boolean) => number) | null {
  for (const entry of sGlyphWidthFuncs) {
    if (glyphId === entry.fontId) return entry.func;
  }
  return null;
}

/** text.c GetStringWidth: measures a string without drawing it. */
export function GetStringWidth(fontId: number, str: ArrayLike<number>, letterSpacing = -1): number {
  let isJapanese = false;
  let minGlyphWidth = 0;
  let func = GetFontWidthFunc(fontId);
  if (!func) return 0;
  const info = FONT_INFOS[fontId];
  let localLetterSpacing = letterSpacing === -1 ? (info ? info.letterSpacing : 0) : letterSpacing;
  let width = 0;
  let lineWidth = 0;
  let bufferPointer: ArrayLike<number> | null = null;
  let pos = 0;

  // CHAR_DYNAMIC measures bufferPointer (text.c falls through from PLACEHOLDER_BEGIN).
  const measureBuffer = (): void => {
    if (bufferPointer) {
      for (let i = 0; (bufferPointer[i] ?? EOS) !== EOS; i++) {
        const glyphWidth = func!(bufferPointer[i]!, isJapanese);
        if (minGlyphWidth > 0) lineWidth += Math.max(minGlyphWidth, glyphWidth);
        else lineWidth += isJapanese ? glyphWidth + localLetterSpacing : glyphWidth;
      }
    }
    bufferPointer = null;
  };

  while ((str[pos] ?? EOS) !== EOS) {
    const currChar = str[pos]!;
    switch (currChar) {
      case CHAR_NEWLINE:
        if (lineWidth > width) width = lineWidth;
        lineWidth = 0;
        break;
      case PLACEHOLDER_BEGIN: {
        pos++; // *++str
        switch (str[pos] ?? EOS) {
          case C.PLACEHOLDER_ID_STRING_VAR_1: bufferPointer = stringVars.var1; break;
          case C.PLACEHOLDER_ID_STRING_VAR_2: bufferPointer = stringVars.var2; break;
          case C.PLACEHOLDER_ID_STRING_VAR_3: bufferPointer = stringVars.var3; break;
          default: return 0;
        }
        measureBuffer();
        break;
      }
      case C.CHAR_DYNAMIC: {
        if (bufferPointer === null) {
          pos++; // *++str
          bufferPointer = DynamicPlaceholderTextUtil_GetPlaceholderPtr(str[pos] ?? 0) ?? null;
        }
        measureBuffer();
        break;
      }
      case CHAR_PROMPT_SCROLL:
      case CHAR_PROMPT_CLEAR:
        break;
      case EXT_CTRL_CODE_BEGIN: {
        pos++; // *++str: the control code
        const code = str[pos] ?? 0;
        switch (code) {
          case C.EXT_CTRL_CODE_FONT: {
            pos++;
            const next = GetFontWidthFunc(str[pos] ?? 0);
            if (!next) return 0;
            func = next;
            if (letterSpacing === -1) {
              const nextInfo = FONT_INFOS[str[pos]!];
              localLetterSpacing = nextInfo ? nextInfo.letterSpacing : 0;
            }
            break;
          }
          case C.EXT_CTRL_CODE_CLEAR: pos++; lineWidth += str[pos] ?? 0; break;
          case C.EXT_CTRL_CODE_SKIP: pos++; lineWidth = str[pos] ?? 0; break;
          case C.EXT_CTRL_CODE_CLEAR_TO: pos++; if ((str[pos] ?? 0) > lineWidth) lineWidth = str[pos]!; break;
          case C.EXT_CTRL_CODE_MIN_LETTER_SPACING: pos++; minGlyphWidth = str[pos] ?? 0; break;
          case C.EXT_CTRL_CODE_JPN: isJapanese = true; break;
          case C.EXT_CTRL_CODE_ENG: isJapanese = false; break;
          case C.EXT_CTRL_CODE_COLOR_HIGHLIGHT_SHADOW: pos += 3; break;
          case C.EXT_CTRL_CODE_PLAY_BGM:
          case C.EXT_CTRL_CODE_PLAY_SE: pos += 2; break;
          case C.EXT_CTRL_CODE_COLOR:
          case C.EXT_CTRL_CODE_HIGHLIGHT:
          case C.EXT_CTRL_CODE_SHADOW:
          case C.EXT_CTRL_CODE_PALETTE:
          case C.EXT_CTRL_CODE_PAUSE:
          case C.EXT_CTRL_CODE_ESCAPE:
          case C.EXT_CTRL_CODE_SHIFT_RIGHT:
          case C.EXT_CTRL_CODE_SHIFT_DOWN:
            pos += 1;
            break;
          default:
            break;
        }
        break;
      }
      case CHAR_KEYPAD_ICON:
      case CHAR_EXTRA_SYMBOL: {
        pos++;
        const glyphWidth = currChar === CHAR_EXTRA_SYMBOL
          ? func((str[pos] ?? 0) | 0x100, isJapanese)
          : GetKeypadIconWidth(str[pos] ?? 0);
        if (minGlyphWidth > 0) lineWidth += Math.max(minGlyphWidth, glyphWidth);
        else lineWidth += isJapanese ? glyphWidth + localLetterSpacing : glyphWidth;
        break;
      }
      default: {
        let glyphWidth = func(currChar, isJapanese);
        if (minGlyphWidth > 0) {
          if (glyphWidth < minGlyphWidth) glyphWidth = minGlyphWidth;
          lineWidth += glyphWidth;
        } else {
          if (fontId !== FONT_BRAILLE && isJapanese) glyphWidth += localLetterSpacing;
          lineWidth += glyphWidth;
        }
        break;
      }
    }
    pos++;
  }

  if (lineWidth > width) return lineWidth;
  return width;
}

/** text.c GetStringWidthFixedWidthFont (unused in the C source). */
export function GetStringWidthFixedWidthFont(str: ArrayLike<number>, fontId: number, letterSpacing: number): number {
  const lineWidths = new Uint8Array(8);
  let width = 0;
  let line = 0;
  let pos = 0;
  let temp = 0;

  do {
    temp = str[pos++] ?? EOS;
    switch (temp) {
      case CHAR_NEWLINE:
      case EOS:
        if (line < lineWidths.length) lineWidths[line] = width;
        width = 0;
        line = (line + 1) & 0xff;
        break;
      case EXT_CTRL_CODE_BEGIN: {
        const code = str[pos++] ?? 0;
        switch (code) {
          case C.EXT_CTRL_CODE_COLOR_HIGHLIGHT_SHADOW: pos += 3; break;
          case C.EXT_CTRL_CODE_PLAY_BGM:
          case C.EXT_CTRL_CODE_PLAY_SE: pos += 2; break;
          case C.EXT_CTRL_CODE_COLOR:
          case C.EXT_CTRL_CODE_HIGHLIGHT:
          case C.EXT_CTRL_CODE_SHADOW:
          case C.EXT_CTRL_CODE_PALETTE:
          case C.EXT_CTRL_CODE_FONT:
          case C.EXT_CTRL_CODE_PAUSE:
          case C.EXT_CTRL_CODE_ESCAPE:
          case C.EXT_CTRL_CODE_SHIFT_RIGHT:
          case C.EXT_CTRL_CODE_SHIFT_DOWN:
          case C.EXT_CTRL_CODE_CLEAR:
          case C.EXT_CTRL_CODE_SKIP:
          case C.EXT_CTRL_CODE_CLEAR_TO:
          case C.EXT_CTRL_CODE_MIN_LETTER_SPACING:
            pos += 1;
            break;
          default:
            break;
        }
        break;
      }
      case C.CHAR_DYNAMIC:
      case PLACEHOLDER_BEGIN:
        pos += 1;
        break;
      case CHAR_PROMPT_SCROLL:
      case CHAR_PROMPT_CLEAR:
        break;
      case CHAR_KEYPAD_ICON:
      case CHAR_EXTRA_SYMBOL:
        pos += 1;
        width = (width + 1) & 0xff;
        break;
      default:
        width = (width + 1) & 0xff;
        break;
    }
  } while (temp !== EOS);

  let maxWidth = 0;
  for (const lineWidth of lineWidths) if (lineWidth > maxWidth) maxWidth = lineWidth;
  const info = FONT_INFOS[fontId];
  return (((info ? info.maxLetterWidth : 0) + letterSpacing) & 0xff) * maxWidth;
}
