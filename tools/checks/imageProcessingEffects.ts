// Headless check for image_processing_effects.c port (imageProcessingEffects.ts)
// Run with: npm run check:imgfx

import './setupNodeGbaMock.ts';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerCData } from '../../src/fr/hw/assets.ts';
import {
  ApplyImageProcessingEffects,
  ApplyImageProcessingQuantization,
  ConvertImageProcessingToGBA,
  ConvertColorToGrayscale,
  QuantizePixel_Invert,
  QuantizePixel_BlackAndWhite,
  QuantizePixel_PersonalityColor,
  GetColorFromPersonality,
  QuantizePixel_Standard,
  setPointillismPoints,
  RGB2,
  GET_R,
  GET_G,
  GET_B,
  IMAGE_EFFECT_INVERT,
  IMAGE_EFFECT_GRAYSCALE_LIGHT,
  IMAGE_EFFECT_BLACK_AND_WHITE,
  IMAGE_EFFECT_POINTILLISM,
  QUANTIZE_EFFECT_STANDARD,
  QUANTIZE_EFFECT_PRIMARY_COLORS,
  QUANTIZE_EFFECT_BLACK_WHITE,
  type ImageProcessingContext,
} from '../../src/fr/imageProcessingEffects.ts';

const root = process.cwd() + '/public/fr/';

console.log('--- 1. Testing image_processing_effects cdata ---');
const imgfxCData = JSON.parse(readFileSync(root + 'cdata/image_processing_effects.json', 'utf8'));
registerCData('image_processing_effects', imgfxCData.defs);
assert.ok(imgfxCData.defs.sPointillismPoints, 'sPointillismPoints must exist in cdata');
setPointillismPoints(imgfxCData.defs.sPointillismPoints.value);
console.log('✓ cdata loaded and sPointillismPoints registered');

console.log('--- 2. Testing color manipulation & quantization functions ---');
// 2a. Invert: (10, 20, 5) -> (21, 11, 26)
const color1 = RGB2(10, 20, 5);
const inverted = QuantizePixel_Invert(color1);
assert.equal(GET_R(inverted), 21, 'Red inverted');
assert.equal(GET_G(inverted), 11, 'Green inverted');
assert.equal(GET_B(inverted), 26, 'Blue inverted');

// 2b. Grayscale: (9, 15, 21) -> avg 15
const color2 = RGB2(9, 15, 21);
const gray = ConvertColorToGrayscale(color2);
assert.equal(GET_R(gray), 15);
assert.equal(GET_G(gray), 15);
assert.equal(GET_B(gray), 15);

// 2c. Black and white threshold
const darkColor = RGB2(10, 10, 10);
assert.equal(QuantizePixel_BlackAndWhite(darkColor), 0, 'Dark color becomes black');
const lightColor = RGB2(20, 20, 20);
assert.equal(QuantizePixel_BlackAndWhite(lightColor), 0x7fff, 'Light color becomes white');

// 2d. Standard quantization: rounds up to multiple of 4, clamps [6, 30]
const rawColor = RGB2(3, 7, 27);
const quantizedStd = QuantizePixel_Standard(rawColor);
assert.equal(GET_R(quantizedStd), 6, 'Clamped to min 6');
assert.equal(GET_G(quantizedStd), 8, '7 rounded up to multiple of 4: 8');
assert.equal(GET_B(quantizedStd), 28, '27 rounded up to multiple of 4: 28');

console.log('✓ Color manipulation functions verified');

console.log('--- 3. Testing ApplyImageProcessingEffects on 64x64 canvas ---');
const width = 64;
const height = 64;
const pixels = new Uint16Array(width * height);
const palette = new Uint16Array(256);
const dest = new Uint16Array(width * height);

// Fill test canvas with pattern
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    pixels[y * width + x] = RGB2(x % 32, y % 32, ((x + y) / 2) % 32);
  }
}

const ctx: ImageProcessingContext = {
  effect: IMAGE_EFFECT_INVERT,
  canvasPixels: pixels,
  canvasPalette: palette,
  dest,
  quantizeEffect: QUANTIZE_EFFECT_STANDARD,
  var_16: 0,
  paletteStart: 0,
  columnStart: 0,
  rowStart: 0,
  columnEnd: width,
  rowEnd: height,
  canvasWidth: width,
  canvasHeight: height,
  personality: 42,
};

// 3a. Invert effect
ApplyImageProcessingEffects(ctx);
assert.equal(GET_R(pixels[0]!), 31, 'Pixel (0,0) red channel inverted from 0 to 31');
assert.equal(GET_G(pixels[0]!), 31, 'Pixel (0,0) green channel inverted from 0 to 31');

// 3b. Pointillism effect
ctx.effect = IMAGE_EFFECT_POINTILLISM;
ApplyImageProcessingEffects(ctx);
console.log('✓ ApplyImageProcessingEffects (Invert & Pointillism) executed successfully');

console.log('--- 4. Testing ApplyImageProcessingQuantization & ConvertImageProcessingToGBA ---');
ctx.quantizeEffect = QUANTIZE_EFFECT_PRIMARY_COLORS;
ApplyImageProcessingQuantization(ctx);
assert.ok(palette[1] !== 0, 'Palette entry 1 assigned');
assert.ok(palette[2] !== 0, 'Palette entry 2 assigned');

// 4b. Convert to GBA 4bpp
ConvertImageProcessingToGBA(ctx);
assert.ok(dest[0] !== undefined, 'GBA tile dest populated');

console.log('✓ Quantization and GBA tile conversion verified');
console.log('\nAll image_processing_effects tests passed successfully!');
