// Port of image_processing_effects.c: image filters, pointillism, quantization,
// outline and color transformation effects for paintings and portraits.

import { cdata, loadCData } from "./hw/assets";

export const MAX_DIMENSION = 64;

export const IMAGE_EFFECT_POINTILLISM = 2;
export const IMAGE_EFFECT_GRAYSCALE_LIGHT = 6;
export const IMAGE_EFFECT_BLUR = 8;
export const IMAGE_EFFECT_OUTLINE_COLORED = 9;
export const IMAGE_EFFECT_INVERT_BLACK_WHITE = 10;
export const IMAGE_EFFECT_THICK_BLACK_WHITE = 11;
export const IMAGE_EFFECT_SHIMMER = 13;
export const IMAGE_EFFECT_OUTLINE = 30;
export const IMAGE_EFFECT_INVERT = 31;
export const IMAGE_EFFECT_BLUR_RIGHT = 32;
export const IMAGE_EFFECT_BLUR_DOWN = 33;
export const IMAGE_EFFECT_CHARCOAL = 36;

export const QUANTIZE_EFFECT_STANDARD = 0;
export const QUANTIZE_EFFECT_STANDARD_LIMITED_COLORS = 1;
export const QUANTIZE_EFFECT_PRIMARY_COLORS = 2;
export const QUANTIZE_EFFECT_GRAYSCALE = 3;
export const QUANTIZE_EFFECT_GRAYSCALE_SMALL = 4;
export const QUANTIZE_EFFECT_BLACK_WHITE = 5;

export interface ImageProcessingContext {
  effect: number;
  canvasPixels: Uint16Array;
  canvasPalette: Uint16Array;
  dest: Uint16Array;
  quantizeEffect: number;
  var_16: number;
  paletteStart: number;
  columnStart: number;
  rowStart: number;
  columnEnd: number;
  rowEnd: number;
  canvasWidth: number;
  canvasHeight: number;
  personality: number;
}

export let gCanvasColumnStart = 0;
export let gCanvasPixels: Uint16Array | null = null;
export let gCanvasRowEnd = 0;
export let gCanvasHeight = 0;
export let gCanvasColumnEnd = 0;
export let gCanvasRowStart = 0;
export let gCanvasMonPersonality = 0;
export let gCanvasWidth = 0;
export let gCanvasPalette: Uint16Array | null = null;
export let gCanvasPaletteStart = 0;

export const RGB_ALPHA = 0x8000;
export const RGB_BLACK = 0;
export const RGB_WHITE = 0x7fff;
export const RGB_RED = 0x1f;

export const IS_ALPHA = (pixel: number): boolean => (pixel & RGB_ALPHA) !== 0;
export const RGB2 = (r: number, g: number, b: number): number => (r & 0x1f) | ((g & 0x1f) << 5) | ((b & 0x1f) << 10);
export const GET_R = (pixel: number): number => pixel & 0x1f;
export const GET_G = (pixel: number): number => (pixel >> 5) & 0x1f;
export const GET_B = (pixel: number): number => (pixel >> 10) & 0x1f;

const GET_POINT_OFFSET_DL = (bits: number): number => (bits >>> 0) & 1;
const GET_POINT_COLOR_TYPE = (bits: number): number => (bits >>> 1) & 3;
const GET_POINT_DELTA = (bits: number): number => (bits >>> 3) & 7;

let sPointillismPointsData: Array<[number, number, number]> | null = null;

export function setPointillismPoints(points: Array<[number, number, number]>): void {
  sPointillismPointsData = points;
}

export async function ensurePointillismPointsLoaded(): Promise<Array<[number, number, number]>> {
  if (!sPointillismPointsData) {
    await loadCData("image_processing_effects");
    sPointillismPointsData = cdata("image_processing_effects", "sPointillismPoints");
  }
  return sPointillismPointsData ?? [];
}

/** ApplyImageProcessingEffects: image_processing_effects.c */
export function ApplyImageProcessingEffects(context: ImageProcessingContext): void {
  gCanvasPixels = context.canvasPixels;
  gCanvasMonPersonality = context.personality;
  gCanvasColumnStart = context.columnStart;
  gCanvasRowStart = context.rowStart;
  gCanvasColumnEnd = context.columnEnd;
  gCanvasRowEnd = context.rowEnd;
  gCanvasWidth = context.canvasWidth;
  gCanvasHeight = context.canvasHeight;

  switch (context.effect) {
    case IMAGE_EFFECT_POINTILLISM:
      ApplyImageEffect_Pointillism();
      break;
    case IMAGE_EFFECT_BLUR:
      ApplyImageEffect_Blur();
      break;
    case IMAGE_EFFECT_OUTLINE_COLORED:
      ApplyImageEffect_BlackOutline();
      ApplyImageEffect_PersonalityColor(gCanvasMonPersonality);
      break;
    case IMAGE_EFFECT_INVERT_BLACK_WHITE:
      ApplyImageEffect_BlackOutline();
      ApplyImageEffect_Invert();
      ApplyImageEffect_BlackAndWhite();
      break;
    case IMAGE_EFFECT_INVERT:
      ApplyImageEffect_Invert();
      break;
    case IMAGE_EFFECT_THICK_BLACK_WHITE:
      ApplyImageEffect_BlackOutline();
      ApplyImageEffect_BlurRight();
      ApplyImageEffect_BlurRight();
      ApplyImageEffect_BlurDown();
      ApplyImageEffect_BlackAndWhite();
      break;
    case IMAGE_EFFECT_SHIMMER:
      ApplyImageEffect_Shimmer();
      break;
    case IMAGE_EFFECT_OUTLINE:
      ApplyImageEffect_BlackOutline();
      break;
    case IMAGE_EFFECT_BLUR_RIGHT:
      ApplyImageEffect_BlurRight();
      break;
    case IMAGE_EFFECT_BLUR_DOWN:
      ApplyImageEffect_BlurDown();
      break;
    case IMAGE_EFFECT_GRAYSCALE_LIGHT:
      ApplyImageEffect_Grayscale();
      ApplyImageEffect_RedChannelGrayscale(3);
      break;
    case IMAGE_EFFECT_CHARCOAL:
      ApplyImageEffect_BlackOutline();
      ApplyImageEffect_BlurRight();
      ApplyImageEffect_BlurDown();
      ApplyImageEffect_BlackAndWhite();
      ApplyImageEffect_Blur();
      ApplyImageEffect_Blur();
      ApplyImageEffect_RedChannelGrayscale(2);
      ApplyImageEffect_RedChannelGrayscaleHighlight(4);
      break;
  }
}

/** ApplyImageEffect_RedChannelGrayscale: image_processing_effects.c */
export function ApplyImageEffect_RedChannelGrayscale(delta: number): void {
  if (!gCanvasPixels) return;
  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    for (let i = 0; i < gCanvasColumnEnd; i++) {
      const idx = rowOffset + gCanvasColumnStart + i;
      const pixel = gCanvasPixels[idx]!;
      if (!IS_ALPHA(pixel)) {
        let grayValue = pixel & RGB_RED;
        grayValue += delta;
        if (grayValue > 31) grayValue = 31;
        gCanvasPixels[idx] = RGB2(grayValue, grayValue, grayValue);
      }
    }
  }
}

/** ApplyImageEffect_RedChannelGrayscaleHighlight: image_processing_effects.c */
export function ApplyImageEffect_RedChannelGrayscaleHighlight(highlight: number): void {
  if (!gCanvasPixels) return;
  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    for (let i = 0; i < gCanvasColumnEnd; i++) {
      const idx = rowOffset + gCanvasColumnStart + i;
      const pixel = gCanvasPixels[idx]!;
      if (!IS_ALPHA(pixel)) {
        let grayValue = pixel & RGB_RED;
        if (grayValue > 31 - highlight) grayValue = 31 - (highlight >> 1);
        gCanvasPixels[idx] = RGB2(grayValue, grayValue, grayValue);
      }
    }
  }
}

/** ApplyImageEffect_Pointillism: image_processing_effects.c */
export function ApplyImageEffect_Pointillism(): void {
  const points = sPointillismPointsData;
  if (!points) return;
  for (let i = 0; i < points.length; i++) AddPointillismPoints(i);
}

/** ApplyImageEffect_Grayscale: image_processing_effects.c */
export function ApplyImageEffect_Grayscale(): void {
  if (!gCanvasPixels) return;
  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    for (let i = 0; i < gCanvasColumnEnd; i++) {
      const idx = rowOffset + gCanvasColumnStart + i;
      const pixel = gCanvasPixels[idx]!;
      if (!IS_ALPHA(pixel)) gCanvasPixels[idx] = ConvertColorToGrayscale(pixel);
    }
  }
}

/** ApplyImageEffect_Blur: image_processing_effects.c */
export function ApplyImageEffect_Blur(): void {
  if (!gCanvasPixels) return;
  for (let i = 0; i < gCanvasColumnEnd; i++) {
    let pixelIdx = gCanvasRowStart * gCanvasWidth + gCanvasColumnStart + i;
    let prevPixel = gCanvasPixels[pixelIdx]!;

    let j = 1;
    pixelIdx += gCanvasWidth;
    while (j < gCanvasRowEnd - 1) {
      const curPixel = gCanvasPixels[pixelIdx]!;
      if (!IS_ALPHA(curPixel)) {
        const nextPixel = gCanvasPixels[pixelIdx + gCanvasWidth]!;
        gCanvasPixels[pixelIdx] = QuantizePixel_Blur(prevPixel, curPixel, nextPixel);
        prevPixel = gCanvasPixels[pixelIdx]!;
      }
      j++;
      pixelIdx += gCanvasWidth;
    }
  }
}

/** ApplyImageEffect_PersonalityColor: image_processing_effects.c */
export function ApplyImageEffect_PersonalityColor(personality: number): void {
  if (!gCanvasPixels) return;
  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    for (let i = 0; i < gCanvasColumnEnd; i++) {
      const idx = rowOffset + gCanvasColumnStart + i;
      const pixel = gCanvasPixels[idx]!;
      if (!IS_ALPHA(pixel)) gCanvasPixels[idx] = QuantizePixel_PersonalityColor(pixel, personality);
    }
  }
}

/** ApplyImageEffect_BlackAndWhite: image_processing_effects.c */
export function ApplyImageEffect_BlackAndWhite(): void {
  if (!gCanvasPixels) return;
  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    for (let i = 0; i < gCanvasColumnEnd; i++) {
      const idx = rowOffset + gCanvasColumnStart + i;
      const pixel = gCanvasPixels[idx]!;
      if (!IS_ALPHA(pixel)) gCanvasPixels[idx] = QuantizePixel_BlackAndWhite(pixel);
    }
  }
}

/** ApplyImageEffect_BlackOutline: image_processing_effects.c */
export function ApplyImageEffect_BlackOutline(): void {
  if (!gCanvasPixels) return;
  // Handle top row of pixels first
  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    let pixelIdx = rowOffset + gCanvasColumnStart;
    gCanvasPixels[pixelIdx] = QuantizePixel_BlackOutline(gCanvasPixels[pixelIdx]!, gCanvasPixels[pixelIdx + 1]!);
    for (let i = 1; i < gCanvasColumnEnd - 1; i++) {
      pixelIdx++;
      gCanvasPixels[pixelIdx] = QuantizePixel_BlackOutline(gCanvasPixels[pixelIdx]!, gCanvasPixels[pixelIdx + 1]!);
      gCanvasPixels[pixelIdx] = QuantizePixel_BlackOutline(gCanvasPixels[pixelIdx]!, gCanvasPixels[pixelIdx - 1]!);
    }
    pixelIdx++;
    gCanvasPixels[pixelIdx] = QuantizePixel_BlackOutline(gCanvasPixels[pixelIdx]!, gCanvasPixels[pixelIdx - 1]!);
  }

  // Handle each column from left to right
  for (let i = 0; i < gCanvasColumnEnd; i++) {
    let pixelIdx = gCanvasRowStart * gCanvasWidth + gCanvasColumnStart + i;
    gCanvasPixels[pixelIdx] = QuantizePixel_BlackOutline(gCanvasPixels[pixelIdx]!, gCanvasPixels[pixelIdx + gCanvasWidth]!);
    for (let j = 1; j < gCanvasRowEnd - 1; j++) {
      pixelIdx += gCanvasWidth;
      gCanvasPixels[pixelIdx] = QuantizePixel_BlackOutline(gCanvasPixels[pixelIdx]!, gCanvasPixels[pixelIdx + gCanvasWidth]!);
      gCanvasPixels[pixelIdx] = QuantizePixel_BlackOutline(gCanvasPixels[pixelIdx]!, gCanvasPixels[pixelIdx - gCanvasWidth]!);
    }
    pixelIdx += gCanvasWidth;
    gCanvasPixels[pixelIdx] = QuantizePixel_BlackOutline(gCanvasPixels[pixelIdx]!, gCanvasPixels[pixelIdx - gCanvasWidth]!);
  }
}

/** ApplyImageEffect_Invert: image_processing_effects.c */
export function ApplyImageEffect_Invert(): void {
  if (!gCanvasPixels) return;
  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    for (let i = 0; i < gCanvasColumnEnd; i++) {
      const idx = rowOffset + gCanvasColumnStart + i;
      const pixel = gCanvasPixels[idx]!;
      if (!IS_ALPHA(pixel)) gCanvasPixels[idx] = QuantizePixel_Invert(pixel);
    }
  }
}

/** ApplyImageEffect_Shimmer: image_processing_effects.c */
export function ApplyImageEffect_Shimmer(): void {
  if (!gCanvasPixels) return;
  // First invert all colors
  for (let i = 0; i < MAX_DIMENSION * MAX_DIMENSION; i++) {
    const pixel = gCanvasPixels[i]!;
    if (!IS_ALPHA(pixel)) gCanvasPixels[i] = QuantizePixel_Invert(pixel);
  }

  // Blur the pixels twice
  for (let j = 0; j < MAX_DIMENSION; j++) {
    let pixelIdx = j;
    let prevPixel = gCanvasPixels[pixelIdx]!;
    gCanvasPixels[pixelIdx] = RGB_ALPHA;
    for (let i = 1; i < MAX_DIMENSION - 1; i++) {
      pixelIdx += MAX_DIMENSION;
      const curPixel = gCanvasPixels[pixelIdx]!;
      if (!IS_ALPHA(curPixel)) {
        gCanvasPixels[pixelIdx] = QuantizePixel_BlurHard(prevPixel, curPixel, gCanvasPixels[pixelIdx + MAX_DIMENSION]!);
        prevPixel = gCanvasPixels[pixelIdx]!;
      }
    }
    gCanvasPixels[pixelIdx + MAX_DIMENSION] = RGB_ALPHA;

    pixelIdx = j;
    prevPixel = gCanvasPixels[pixelIdx]!;
    gCanvasPixels[pixelIdx] = RGB_ALPHA;
    for (let i = 1; i < MAX_DIMENSION - 1; i++) {
      pixelIdx += MAX_DIMENSION;
      const curPixel = gCanvasPixels[pixelIdx]!;
      if (!IS_ALPHA(curPixel)) {
        gCanvasPixels[pixelIdx] = QuantizePixel_BlurHard(prevPixel, curPixel, gCanvasPixels[pixelIdx + MAX_DIMENSION]!);
        prevPixel = gCanvasPixels[pixelIdx]!;
      }
    }
    gCanvasPixels[pixelIdx + MAX_DIMENSION] = RGB_ALPHA;
  }

  // Finally invert colors back
  for (let i = 0; i < MAX_DIMENSION * MAX_DIMENSION; i++) {
    const pixel = gCanvasPixels[i]!;
    if (!IS_ALPHA(pixel)) gCanvasPixels[i] = QuantizePixel_Invert(pixel);
  }
}

/** ApplyImageEffect_BlurRight: image_processing_effects.c */
export function ApplyImageEffect_BlurRight(): void {
  if (!gCanvasPixels) return;
  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    let pixelIdx = rowOffset + gCanvasColumnStart;
    let prevPixel = gCanvasPixels[pixelIdx]!;
    for (let i = 1; i < gCanvasColumnEnd - 1; i++) {
      pixelIdx++;
      const curPixel = gCanvasPixels[pixelIdx]!;
      if (!IS_ALPHA(curPixel)) {
        gCanvasPixels[pixelIdx] = QuantizePixel_MotionBlur(prevPixel, curPixel);
        prevPixel = gCanvasPixels[pixelIdx]!;
      }
    }
  }
}

/** ApplyImageEffect_BlurDown: image_processing_effects.c */
export function ApplyImageEffect_BlurDown(): void {
  if (!gCanvasPixels) return;
  for (let i = 0; i < gCanvasColumnEnd; i++) {
    let pixelIdx = gCanvasRowStart * gCanvasWidth + gCanvasColumnStart + i;
    let prevPixel = gCanvasPixels[pixelIdx]!;
    for (let j = 1; j < gCanvasRowEnd - 1; j++) {
      pixelIdx += gCanvasWidth;
      const curPixel = gCanvasPixels[pixelIdx]!;
      if (!IS_ALPHA(curPixel)) {
        gCanvasPixels[pixelIdx] = QuantizePixel_MotionBlur(prevPixel, curPixel);
        prevPixel = gCanvasPixels[pixelIdx]!;
      }
    }
  }
}

interface PointillismPoint {
  column: number;
  row: number;
  delta: number;
}

/** AddPointillismPoints: image_processing_effects.c */
export function AddPointillismPoints(point: number): void {
  if (!gCanvasPixels || !sPointillismPointsData) return;
  const p = sPointillismPointsData[point]!;
  const colorType = GET_POINT_COLOR_TYPE(p[2]);
  const offsetDownLeft = GET_POINT_OFFSET_DL(p[2]) !== 0;

  const points: PointillismPoint[] = [
    { column: p[0], row: p[1], delta: GET_POINT_DELTA(p[2]) },
  ];

  let initialDelta = points[0]!.delta;
  for (let i = 1; i < initialDelta; i++) {
    const col = !offsetDownLeft ? points[0]!.column - i : points[0]!.column + 1;
    const row = !offsetDownLeft ? points[0]!.row + i : points[0]!.row - 1;

    if (col >= MAX_DIMENSION || row >= MAX_DIMENSION || col < 0 || row < 0) {
      initialDelta = i - 1;
      points[0]!.delta = initialDelta;
      break;
    }

    points.push({ column: col, row, delta: initialDelta - i });
  }

  for (let i = 0; i < initialDelta; i++) {
    const pt = points[i]!;
    const pixelIdx = pt.row * MAX_DIMENSION + pt.column;
    const pixel = gCanvasPixels[pixelIdx]!;

    if (!IS_ALPHA(pixel)) {
      let red = GET_R(pixel);
      let green = GET_G(pixel);
      let blue = GET_B(pixel);

      switch (colorType) {
        case 0:
        case 1:
          switch (GET_POINT_DELTA(p[2]) % 3) {
            case 0:
              red = red >= pt.delta ? red - pt.delta : 0;
              break;
            case 1:
              green = green >= pt.delta ? green - pt.delta : 0;
              break;
            case 2:
              blue = blue >= pt.delta ? blue - pt.delta : 0;
              break;
          }
          break;
        case 2:
        case 3:
          red = Math.min(31, red + pt.delta);
          green = Math.min(31, green + pt.delta);
          blue = Math.min(31, blue + pt.delta);
          break;
      }

      gCanvasPixels[pixelIdx] = RGB2(red, green, blue);
    }
  }
}

/** ConvertColorToGrayscale: image_processing_effects.c */
export function ConvertColorToGrayscale(color: number): number {
  const red = GET_R(color);
  const green = GET_G(color);
  const blue = GET_B(color);
  const gray = Math.trunc((red + green + blue) / 3);
  return RGB2(gray, gray, gray);
}

/** QuantizePixel_PersonalityColor: image_processing_effects.c */
export function QuantizePixel_PersonalityColor(color: number, personality: number): number {
  const red = GET_R(color);
  const green = GET_G(color);
  const blue = GET_B(color);

  if (red < 17 && green < 17 && blue < 17) return GetColorFromPersonality(personality);
  return RGB_WHITE;
}

/** GetColorFromPersonality: image_processing_effects.c */
export function GetColorFromPersonality(personality: number): number {
  let red = 0, green = 0, blue = 0;
  const strength = Math.trunc(personality / 6) % 3;
  const colorType = personality % 6;

  switch (colorType) {
    case 0: // Teal
      green = 21 - strength;
      blue = green;
      red = 0;
      break;
    case 1: // Yellow
      blue = 0;
      red = 21 - strength;
      green = red;
      break;
    case 2: // Purple
      blue = 21 - strength;
      green = 0;
      red = blue;
      break;
    case 3: // Red
      blue = 0;
      green = 0;
      red = 23 - strength;
      break;
    case 4: // Blue
      blue = 23 - strength;
      green = 0;
      red = 0;
      break;
    case 5: // Green
      blue = 0;
      green = 23 - strength;
      red = 0;
      break;
  }

  return RGB2(red, green, blue);
}

/** QuantizePixel_BlackAndWhite: image_processing_effects.c */
export function QuantizePixel_BlackAndWhite(color: number): number {
  const red = GET_R(color);
  const green = GET_G(color);
  const blue = GET_B(color);

  if (red < 17 && green < 17 && blue < 17) return RGB_BLACK;
  return RGB_WHITE;
}

/** QuantizePixel_BlackOutline: image_processing_effects.c */
export function QuantizePixel_BlackOutline(pixelA: number, pixelB: number): number {
  if (pixelA !== RGB_BLACK) {
    if (IS_ALPHA(pixelA)) return RGB_ALPHA;
    if (IS_ALPHA(pixelB)) return RGB_BLACK;
    return pixelA;
  }
  return RGB_BLACK;
}

/** QuantizePixel_Invert: image_processing_effects.c */
export function QuantizePixel_Invert(color: number): number {
  const red = 31 - GET_R(color);
  const green = 31 - GET_G(color);
  const blue = 31 - GET_B(color);
  return RGB2(red, green, blue);
}

/** QuantizePixel_MotionBlur: image_processing_effects.c */
export function QuantizePixel_MotionBlur(prevPixel: number, curPixel: number): number {
  if (prevPixel === curPixel) return curPixel;

  const pr = GET_R(prevPixel), pg = GET_G(prevPixel), pb = GET_B(prevPixel);
  const cr = GET_R(curPixel), cg = GET_G(curPixel), cb = GET_B(curPixel);

  if (pr > 25 && pg > 25 && pb > 25) return curPixel;
  if (cr > 25 && cg > 25 && cb > 25) return curPixel;

  const dr = Math.abs(pr - cr);
  const dg = Math.abs(pg - cg);
  const db = Math.abs(pb - cb);

  const largestDiff = Math.max(dr, dg, db);
  const factor = 31 - Math.trunc(largestDiff / 2);

  const red = Math.trunc((cr * factor) / 31);
  const green = Math.trunc((cg * factor) / 31);
  const blue = Math.trunc((cb * factor) / 31);
  return RGB2(red, green, blue);
}

/** QuantizePixel_Blur: image_processing_effects.c */
export function QuantizePixel_Blur(prevPixel: number, curPixel: number, nextPixel: number): number {
  if (prevPixel === curPixel && nextPixel === curPixel) return curPixel;

  const cr = GET_R(curPixel), cg = GET_G(curPixel), cb = GET_B(curPixel);

  const prevAvg = Math.trunc((GET_R(prevPixel) + GET_G(prevPixel) + GET_B(prevPixel)) / 3);
  const curAvg = Math.trunc((cr + cg + cb) / 3);
  const nextAvg = Math.trunc((GET_R(nextPixel) + GET_G(nextPixel) + GET_B(nextPixel)) / 3);

  if (prevAvg === curAvg && nextAvg === curAvg) return curPixel;

  const prevDiff = Math.abs(prevAvg - curAvg);
  const nextDiff = Math.abs(nextAvg - curAvg);
  const diff = Math.max(prevDiff, nextDiff);

  const factor = 31 - Math.trunc(diff / 2);
  const red = Math.trunc((cr * factor) / 31);
  const green = Math.trunc((cg * factor) / 31);
  const blue = Math.trunc((cb * factor) / 31);
  return RGB2(red, green, blue);
}

/** QuantizePixel_BlurHard: image_processing_effects.c */
export function QuantizePixel_BlurHard(prevPixel: number, curPixel: number, nextPixel: number): number {
  if (prevPixel === curPixel && nextPixel === curPixel) return curPixel;

  const cr = GET_R(curPixel), cg = GET_G(curPixel), cb = GET_B(curPixel);

  const prevAvg = Math.trunc((GET_R(prevPixel) + GET_G(prevPixel) + GET_B(prevPixel)) / 3);
  const curAvg = Math.trunc((cr + cg + cb) / 3);
  const nextAvg = Math.trunc((GET_R(nextPixel) + GET_G(nextPixel) + GET_B(nextPixel)) / 3);

  if (prevAvg === curAvg && nextAvg === curAvg) return curPixel;

  const prevDiff = Math.abs(prevAvg - curAvg);
  const nextDiff = Math.abs(nextAvg - curAvg);
  const diff = Math.max(prevDiff, nextDiff);

  const factor = Math.max(0, 31 - diff);
  const red = Math.trunc((cr * factor) / 31);
  const green = Math.trunc((cg * factor) / 31);
  const blue = Math.trunc((cb * factor) / 31);
  return RGB2(red, green, blue);
}

/** ConvertImageProcessingToGBA: image_processing_effects.c */
export function ConvertImageProcessingToGBA(context: ImageProcessingContext): void {
  const width = context.canvasWidth >> 3;
  const height = context.canvasHeight >> 3;
  const src = context.canvasPixels;
  const dest = context.dest;

  if (context.var_16 === 2) {
    // 8bpp
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        for (let k = 0; k < 8; k++) {
          const destOffset = ((i * width + j) << 5) + (k << 2);
          const srcOffset = (((i << 3) + k) << 3) * width + (j << 3);

          dest[destOffset] = (src[srcOffset]! & 0xff) | ((src[srcOffset + 1]! & 0xff) << 8);
          dest[destOffset + 1] = (src[srcOffset + 2]! & 0xff) | ((src[srcOffset + 3]! & 0xff) << 8);
          dest[destOffset + 2] = (src[srcOffset + 4]! & 0xff) | ((src[srcOffset + 5]! & 0xff) << 8);
          dest[destOffset + 3] = (src[srcOffset + 6]! & 0xff) | ((src[srcOffset + 7]! & 0xff) << 8);
        }
      }
    }
  } else {
    // 4bpp
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        for (let k = 0; k < 8; k++) {
          const destOffset = ((i * width + j) << 4) + (k << 1);
          const srcOffset = (((i << 3) + k) << 3) * width + (j << 3);

          dest[destOffset] = (src[srcOffset]! & 0xf) | ((src[srcOffset + 1]! & 0xf) << 4) | ((src[srcOffset + 2]! & 0xf) << 8) | ((src[srcOffset + 3]! & 0xf) << 12);
          dest[destOffset + 1] = (src[srcOffset + 4]! & 0xf) | ((src[srcOffset + 5]! & 0xf) << 4) | ((src[srcOffset + 6]! & 0xf) << 8) | ((src[srcOffset + 7]! & 0xf) << 12);
        }
      }
    }
  }
}

/** ApplyImageProcessingQuantization: image_processing_effects.c */
export function ApplyImageProcessingQuantization(context: ImageProcessingContext): void {
  gCanvasPixels = context.canvasPixels;
  gCanvasPalette = context.canvasPalette;
  gCanvasPaletteStart = context.paletteStart;
  gCanvasColumnStart = context.columnStart;
  gCanvasRowStart = context.rowStart;
  gCanvasColumnEnd = context.columnEnd;
  gCanvasRowEnd = context.rowEnd;
  gCanvasWidth = context.canvasWidth;
  gCanvasHeight = context.canvasHeight;

  switch (context.quantizeEffect) {
    case QUANTIZE_EFFECT_STANDARD:
      QuantizePalette_Standard(false);
      break;
    case QUANTIZE_EFFECT_STANDARD_LIMITED_COLORS:
      QuantizePalette_Standard(true);
      break;
    case QUANTIZE_EFFECT_PRIMARY_COLORS:
      SetPresetPalette_PrimaryColors();
      QuantizePalette_PrimaryColors();
      break;
    case QUANTIZE_EFFECT_GRAYSCALE:
      SetPresetPalette_Grayscale();
      QuantizePalette_Grayscale();
      break;
    case QUANTIZE_EFFECT_GRAYSCALE_SMALL:
      SetPresetPalette_GrayscaleSmall();
      QuantizePalette_GrayscaleSmall();
      break;
    case QUANTIZE_EFFECT_BLACK_WHITE:
      SetPresetPalette_BlackAndWhite();
      QuantizePalette_BlackAndWhite();
      break;
  }
}

/** SetPresetPalette_PrimaryColors: image_processing_effects.c */
export function SetPresetPalette_PrimaryColors(): void {
  if (!gCanvasPalette) return;
  gCanvasPalette[0] = RGB2(0, 0, 0);
  gCanvasPalette[1] = RGB2(5, 5, 5);
  gCanvasPalette[2] = RGB2(29, 29, 29);
  gCanvasPalette[3] = RGB2(19, 19, 19);
  gCanvasPalette[4] = RGB2(27, 8, 8);
  gCanvasPalette[5] = RGB2(8, 27, 8);
  gCanvasPalette[6] = RGB2(8, 8, 27);
  gCanvasPalette[7] = RGB2(27, 27, 8);
  gCanvasPalette[8] = RGB2(27, 8, 27);
  gCanvasPalette[9] = RGB2(8, 27, 27);
  gCanvasPalette[10] = RGB2(27, 16, 8);
  gCanvasPalette[11] = RGB2(16, 27, 8);
  gCanvasPalette[12] = RGB2(8, 16, 27);
  gCanvasPalette[13] = RGB2(27, 8, 16);
  gCanvasPalette[14] = RGB2(8, 27, 16);
  gCanvasPalette[15] = RGB2(16, 8, 27);
}

/** SetPresetPalette_BlackAndWhite: image_processing_effects.c */
export function SetPresetPalette_BlackAndWhite(): void {
  if (!gCanvasPalette) return;
  gCanvasPalette[0] = RGB2(0, 0, 0);
  gCanvasPalette[1] = RGB2(4, 4, 4);
  gCanvasPalette[2] = RGB2(28, 28, 28);
}

/** SetPresetPalette_GrayscaleSmall: image_processing_effects.c */
export function SetPresetPalette_GrayscaleSmall(): void {
  if (!gCanvasPalette) return;
  gCanvasPalette[0] = RGB2(0, 0, 0);
  for (let i = 1; i < 16; i++) {
    const val = i * 2;
    gCanvasPalette[i] = RGB2(val, val, val);
  }
}

/** SetPresetPalette_Grayscale: image_processing_effects.c */
export function SetPresetPalette_Grayscale(): void {
  if (!gCanvasPalette) return;
  gCanvasPalette[0] = RGB2(0, 0, 0);
  for (let i = 1; i < 32; i++) {
    gCanvasPalette[i] = RGB2(i, i, i);
  }
}

/** QuantizePalette_Standard: image_processing_effects.c */
export function QuantizePalette_Standard(useLimitedPalette: boolean): void {
  if (!gCanvasPixels || !gCanvasPalette) return;
  const maxIndex = useLimitedPalette ? 16 : 256;

  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    for (let i = 0; i < gCanvasColumnEnd; i++) {
      const idx = rowOffset + gCanvasColumnStart + i;
      const pixel = gCanvasPixels[idx]!;

      if (IS_ALPHA(pixel)) {
        gCanvasPixels[idx] = gCanvasPaletteStart;
      } else {
        const quantizedColor = QuantizePixel_Standard(pixel);
        let curIndex = 1;
        while (curIndex < maxIndex) {
          if (gCanvasPalette[curIndex] === RGB_BLACK || gCanvasPalette[curIndex] === quantizedColor) {
            gCanvasPalette[curIndex] = quantizedColor;
            gCanvasPixels[idx] = gCanvasPaletteStart + curIndex;
            break;
          }
          curIndex++;
        }
        if (curIndex >= maxIndex) {
          gCanvasPixels[idx] = maxIndex;
        }
      }
    }
  }
}

/** QuantizePalette_BlackAndWhite: image_processing_effects.c */
export function QuantizePalette_BlackAndWhite(): void {
  if (!gCanvasPixels) return;
  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    for (let i = 0; i < gCanvasColumnEnd; i++) {
      const idx = rowOffset + gCanvasColumnStart + i;
      const pixel = gCanvasPixels[idx]!;
      if (IS_ALPHA(pixel)) {
        gCanvasPixels[idx] = gCanvasPaletteStart;
      } else {
        if (QuantizePixel_BlackAndWhite(pixel) === RGB_BLACK) {
          gCanvasPixels[idx] = gCanvasPaletteStart + 1;
        } else {
          gCanvasPixels[idx] = gCanvasPaletteStart + 2;
        }
      }
    }
  }
}

/** QuantizePalette_GrayscaleSmall: image_processing_effects.c */
export function QuantizePalette_GrayscaleSmall(): void {
  if (!gCanvasPixels) return;
  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    for (let i = 0; i < gCanvasColumnEnd; i++) {
      const idx = rowOffset + gCanvasColumnStart + i;
      const pixel = gCanvasPixels[idx]!;
      if (IS_ALPHA(pixel)) {
        gCanvasPixels[idx] = gCanvasPaletteStart;
      } else {
        gCanvasPixels[idx] = QuantizePixel_GrayscaleSmall(pixel) + gCanvasPaletteStart;
      }
    }
  }
}

/** QuantizePalette_Grayscale: image_processing_effects.c */
export function QuantizePalette_Grayscale(): void {
  if (!gCanvasPixels) return;
  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    for (let i = 0; i < gCanvasColumnEnd; i++) {
      const idx = rowOffset + gCanvasColumnStart + i;
      const pixel = gCanvasPixels[idx]!;
      if (IS_ALPHA(pixel)) {
        gCanvasPixels[idx] = gCanvasPaletteStart;
      } else {
        gCanvasPixels[idx] = QuantizePixel_Grayscale(pixel) + gCanvasPaletteStart;
      }
    }
  }
}

/** QuantizePalette_PrimaryColors: image_processing_effects.c */
export function QuantizePalette_PrimaryColors(): void {
  if (!gCanvasPixels) return;
  for (let j = 0; j < gCanvasRowEnd; j++) {
    const rowOffset = (gCanvasRowStart + j) * gCanvasWidth;
    for (let i = 0; i < gCanvasColumnEnd; i++) {
      const idx = rowOffset + gCanvasColumnStart + i;
      const pixel = gCanvasPixels[idx]!;
      if (IS_ALPHA(pixel)) {
        gCanvasPixels[idx] = gCanvasPaletteStart;
      } else {
        gCanvasPixels[idx] = QuantizePixel_PrimaryColors(pixel) + gCanvasPaletteStart;
      }
    }
  }
}

/** QuantizePixel_Standard: image_processing_effects.c */
export function QuantizePixel_Standard(pixel: number): number {
  let red = GET_R(pixel);
  let green = GET_G(pixel);
  let blue = GET_B(pixel);

  if (red & 3) red = (red & 0x1c) + 4;
  if (green & 3) green = (green & 0x1c) + 4;
  if (blue & 3) blue = (blue & 0x1c) + 4;

  if (red < 6) red = 6;
  if (red > 30) red = 30;
  if (green < 6) green = 6;
  if (green > 30) green = 30;
  if (blue < 6) blue = 6;
  if (blue > 30) blue = 30;

  return RGB2(red, green, blue);
}

/** QuantizePixel_PrimaryColors: image_processing_effects.c */
export function QuantizePixel_PrimaryColors(color: number): number {
  const red = GET_R(color);
  const green = GET_G(color);
  const blue = GET_B(color);

  if (red < 12 && green < 11 && blue < 11) return 1;
  if (red > 19 && green > 19 && blue > 19) return 2;

  if (red > 19) {
    if (green > 19) {
      if (blue > 14) return 2;
      return 7;
    } else if (blue > 19) {
      if (green > 14) return 2;
      return 8;
    }
  }

  if (green > 19 && blue > 19) {
    if (red > 14) return 2;
    return 9;
  }

  if (red > 19) {
    if (green > 11) {
      if (blue > 11) {
        if (green < blue) return 8;
        return 7;
      }
      return 10;
    } else if (blue > 11) {
      return 13;
    } else {
      return 4;
    }
  }

  if (green > 19) {
    if (red > 11) {
      if (blue > 11) {
        if (red < blue) return 9;
        return 7;
      }
      return 11;
    } else {
      if (blue > 11) return 14;
      return 5;
    }
  }

  if (blue > 19) {
    if (red > 11) {
      if (green > 11) {
        if (red < green) return 9;
        return 8;
      }
    } else if (green > 11) {
      return 12;
    }

    if (blue > 11) return 15;
    return 6;
  }

  return 3;
}

/** QuantizePixel_GrayscaleSmall: image_processing_effects.c */
export function QuantizePixel_GrayscaleSmall(color: number): number {
  const red = GET_R(color);
  const green = GET_G(color);
  const blue = GET_B(color);
  const average = Math.trunc((red + green + blue) / 3) & 0x1e;
  if (average === 0) return 1;
  return Math.trunc(average / 2);
}

/** QuantizePixel_Grayscale: image_processing_effects.c */
export function QuantizePixel_Grayscale(color: number): number {
  const red = GET_R(color);
  const green = GET_G(color);
  const blue = GET_B(color);
  const average = Math.trunc((red + green + blue) / 3);
  return average + 1;
}
