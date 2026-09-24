// Latin fonts from graphics/fonts with the glyph width tables from text.c.

import { b64, rom } from "../rom";

export const FONT_SMALL = 0;
export const FONT_NORMAL_COPY_1 = 1;
export const FONT_NORMAL = 2;
export const FONT_NORMAL_COPY_2 = 3;
export const FONT_MALE = 4;
export const FONT_FEMALE = 5;
export const FONT_BRAILLE = 6;
export const FONT_BOLD = 7;

export type FontInfo = { maxLetterWidth: number; maxLetterHeight: number; letterSpacing: number; lineSpacing: number; fgColor: number; bgColor: number; shadowColor: number };

// gFontInfos from new_menu_helpers.c
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

/** DecompressGlyph_*: returns 2bpp-style values 0=bg 1=fg 2=shadow. */
export function glyph(fontId: number, code: number): Glyph {
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
  return sheetFor(fontId).s.widths[code] ?? 8;
}

/** GetStringWidth from text.c (ignores control codes, handles letter spacing). */
export function stringWidth(fontId: number, str: ArrayLike<number>, letterSpacing = -1): number {
  const spacing = letterSpacing < 0 ? FONT_INFOS[fontId].letterSpacing : letterSpacing;
  let width = 0;
  let lineWidth = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === 0xff) break;
    if (c === 0xfe || c === 0xfa || c === 0xfb) {
      width = Math.max(width, lineWidth);
      lineWidth = 0;
      continue;
    }
    if (c === 0xfd) { i++; continue; }
    if (c === 0xfc) {
      const code = str[++i];
      if (code === 0x04) i += 3;
      else if (code === 0x0b || code === 0x10) i += 2;
      else if ([1, 2, 3, 5, 6, 8, 0x0c, 0x0d, 0x0e, 0x11, 0x12, 0x13, 0x14].includes(code)) i += 1;
      continue;
    }
    if (c === 0xf8) { i++; lineWidth += 8; continue; }
    if (c === 0xf9) { i++; lineWidth += glyphWidth(fontId, str[i] | 0x100) + spacing; continue; }
    lineWidth += glyphWidth(fontId, c);
    if (fontId !== FONT_SMALL) lineWidth += 0;
  }
  return Math.max(width, lineWidth);
}
