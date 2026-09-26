// Port of util.c: sprite shape copying, scalar helpers, CRC and byte sums.

import { BgAffineSet } from "./hw/bg";
import { CreateSprite, gDummySpriteTemplate, gSprites, type SpriteCallback } from "./hw/sprite";

const SPRITE_DIMENSIONS = [
  [[1, 1], [2, 2], [4, 4], [8, 8]],
  [[2, 1], [4, 1], [4, 2], [8, 4]],
  [[1, 2], [1, 4], [2, 4], [4, 8]],
] as const;

export type BgAffineSrcData = { texX: number; texY: number; scrX: number; scrY: number; sx: number; sy: number; alpha: number };

/** CreateInvisibleSpriteWithCallback. */
export function CreateInvisibleSpriteWithCallback(callback: SpriteCallback): number {
  const id = CreateSprite(gDummySpriteTemplate, 248, 168, 14);
  const sprite = gSprites[id];
  if (sprite) { sprite.invisible = true; sprite.callback = callback; }
  return id;
}

/** StoreWordInTwoHalfwords, low word first as in C. */
export function StoreWordInTwoHalfwords(halfwords: Uint16Array, word: number): void {
  const value = word >>> 0;
  halfwords[0] = value & 0xffff;
  halfwords[1] = value >>> 16;
}

/** LoadWordFromTwoHalfwords, including the source's signed high-halfword promotion. */
export function LoadWordFromTwoHalfwords(halfwords: ArrayLike<number>): number {
  return ((halfwords[0] ?? 0) | (((halfwords[1] ?? 0) << 16))) >>> 0;
}

/** SetBgAffineStruct. */
export function SetBgAffineStruct(src: BgAffineSrcData, texX: number, texY: number, scrX: number, scrY: number, sx: number, sy: number, alpha: number): void {
  src.texX = texX >>> 0; src.texY = texY >>> 0;
  src.scrX = (scrX << 16) >> 16; src.scrY = (scrY << 16) >> 16;
  src.sx = (sx << 16) >> 16; src.sy = (sy << 16) >> 16; src.alpha = alpha & 0xffff;
}

/** DoBgAffineSet. */
export function DoBgAffineSet(dest: object, texX: number, texY: number, scrX: number, scrY: number, sx: number, sy: number, alpha: number): void {
  const src: BgAffineSrcData = { texX, texY, scrX, scrY, sx, sy, alpha };
  Object.assign(dest, BgAffineSet(src.texX, src.texY, src.scrX, src.scrY, src.sx, src.sy, src.alpha));
}

/** CopySpriteTiles, preserving the shape/size tile-grid and 0x400/0x800 flips. */
export function CopySpriteTiles(shape: number, size: number, tiles: Uint8Array, tilemap: ArrayLike<number>, output: Uint8Array): void {
  const dimensions = SPRITE_DIMENSIONS[shape]?.[size];
  if (!dimensions) return;
  const [width, height] = dimensions;
  let mapIndex = 0, outOffset = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const entry = tilemap[mapIndex++] ?? 0;
      const tileOffset = (entry & 0x3ff) * 32;
      const xFlip = !!(entry & 0x400), yFlip = !!(entry & 0x800);
      for (let row = 0; row < 8; row++) {
        const sourceRow = yFlip ? 7 - row : row;
        for (let byte = 0; byte < 4; byte++) {
          const sourceByte = tiles[tileOffset + sourceRow * 4 + (xFlip ? 3 - byte : byte)] ?? 0;
          output[outOffset + row * 4 + byte] = xFlip ? ((sourceByte & 0x0f) << 4) | (sourceByte >>> 4) : sourceByte;
        }
      }
      outOffset += 32;
    }
    mapIndex += 32 - width;
  }
}

/** CountTrailingZeroBits; C returns 0 for zero. */
export function CountTrailingZeroBits(value: number): number {
  let bits = value >>> 0;
  for (let i = 0; i < 32; i++) {
    if (bits & 1) return i;
    bits >>>= 1;
  }
  return 0;
}

const CRC16_TABLE = Uint16Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  return crc & 0xffff;
});

/** CalcCRC16. */
export function CalcCRC16(data: ArrayLike<number>, length: number): number {
  let crc = 0x1121;
  for (let i = 0; i < length; i++) {
    crc = (crc ^ (data[i] ?? 0)) & 0xffff;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  return (~crc) & 0xffff;
}

/** CalcCRC16WithTable; generated lookup entries equal gCrc16Table in util.c. */
export function CalcCRC16WithTable(data: ArrayLike<number>, length: number): number {
  let crc = 0x1121;
  for (let i = 0; i < length; i++) {
    const high = crc >>> 8;
    crc ^= data[i] ?? 0;
    crc = (high ^ CRC16_TABLE[crc & 0xff]) & 0xffff;
  }
  return (~crc) & 0xffff;
}

/** CalcByteArraySum, wrapping to the C u32 result. */
export function CalcByteArraySum(array: ArrayLike<number>, size: number): number {
  let result = 0;
  for (let i = 0; i < size; i++) result = (result + (array[i] ?? 0)) >>> 0;
  return result;
}
