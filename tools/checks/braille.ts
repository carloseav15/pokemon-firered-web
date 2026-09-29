// Headless check for braille_text.c: decodes every FONT_BRAILLE glyph from the
// exported sBrailleGlyphs (fwjpnfont) through DecompressGlyphTile and compares
// it pixel by pixel with ../pokefirered/graphics/fonts/braille.png, the image
// the decomp builds that font from. Also prints a braille message.
// Run with: npm run check:braille

import './setupNodeGbaMock.ts';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
import * as C from '../../src/fr/generated/constants.ts';
import { registerCData, registerIncbinIndex, registerPack } from '../../src/fr/hw/assets.ts';
import { FONT_BRAILLE, glyph, GetStringWidth } from '../../src/fr/gba/font.ts';
import { TextPrinter } from '../../src/fr/gba/textPrinter.ts';

const root = process.cwd() + '/public/fr/';
const decomp = process.env.POKEFIRERED ?? process.cwd() + '/pokefirered';

// Load the incbin pack and the text_printer cdata the way loadCData/preloadPacks do.
const index = JSON.parse(readFileSync(root + 'incbin/index.json', 'utf8'));
registerIncbinIndex(index);
registerPack('graphics_fonts', new Uint8Array(readFileSync(root + 'incbin/graphics_fonts.bin')));
registerCData('text_printer', JSON.parse(readFileSync(root + 'cdata/text_printer.json', 'utf8')).defs);

function readIndexedPng(path: string): { width: number; height: number; px: Uint8Array } {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0, height = 0, depth = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; assert.equal(data[9], 3, 'indexed PNG'); }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = Math.ceil(width * depth / 8);
  const px = new Uint8Array(width * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i > 0 ? line[i - 1] : 0, b = prev[i], c = i > 0 ? prev[i - 1] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    for (let x = 0; x < width; x++) {
      const bit = x * depth;
      px[y * width + x] = (line[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    }
    prev = line;
  }
  return { width, height, px };
}

const png = readIndexedPng(decomp + '/graphics/fonts/braille.png');
const glyphsPerRow = png.width / 16;
const rows = png.height / 16;
const mapping = new Map<number, number>();
let compared = 0;
let inked = 0;
for (let code = 0; code < glyphsPerRow * rows; code++) {
  const g = glyph(FONT_BRAILLE, code);
  assert.equal(g.width, 16);
  const gx = (code % glyphsPerRow) * 16, gy = Math.floor(code / glyphsPerRow) * 16;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const src = png.px[(gy + y) * png.width + gx + x];
    const got = g.pixels[y * 16 + x];
    const want = mapping.get(src);
    if (want === undefined) mapping.set(src, got);
    else assert.equal(got, want, `glyph ${code} (${x},${y}): PNG index ${src} decoded as ${got}, expected ${want}`);
    if (got !== 0) inked++;
    compared++;
  }
}
assert.ok(inked > 0, 'glyphs have ink');

// A braille message: "ABC" + newline + "D", encoded as preproc's .braille does.
const pixels = new Uint8Array(208 * 32).fill(1);
const surface: any = {
  pixelWidth: 208, pixelHeight: 32,
  fill: (c: number) => pixels.fill(c),
  fillRect: () => {}, blit: () => {}, scroll: () => {},
  setPixel: (x: number, y: number, c: number) => { pixels[y * 208 + x] = c; },
};
const msg = [C.BRAILLE_CHAR_A, C.BRAILLE_CHAR_B, C.BRAILLE_CHAR_C, 0xfe, C.BRAILLE_CHAR_D, 0xff];
new TextPrinter(surface, FONT_BRAILLE, msg, { x: 0, y: 1, speed: 0 });
assert.equal(GetStringWidth(FONT_BRAILLE, msg), 48);
assert.ok(pixels.some((v) => v !== 1));
console.log(`PASS: ${compared} braille pixels match braille.png (${glyphsPerRow * rows} glyphs, index map ${JSON.stringify([...mapping])}); message printed, width 48.`);
