// Port of decompress.c. INCBIN assets exported by the decomp pipeline have
// already passed through LZ77; the browser routines therefore copy their bytes.

import { symBytes, gMonFrontPicTable, gMonBackPicTable, DecompressPicFromTable, LoadSpecialPokePic, DrawSpindaSpots } from "./pokemon/pics";
import { LoadSpritePalette, LoadSpriteSheet } from "./hw/sprite";
import * as C from "./generated/constants";

type CompressedSpriteSheet = { data: unknown; size: number; tag: number };
type CompressedSpritePalette = { data: unknown; tag: number };

function bytesOf(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  return symBytes(data);
}

function copyDecompressed(src: unknown, dest: Uint8Array): void {
  const bytes = bytesOf(src);
  dest.set(bytes.subarray(0, dest.length));
}

/** decompress.c LZDecompressWram (assets have been decompressed by the exporter). */
export function LZDecompressWram(src: unknown, dest: Uint8Array): void { copyDecompressed(src, dest); }

/** decompress.c LZDecompressVram; the PPU layer receives the same decompressed bytes. */
export function LZDecompressVram(src: unknown, dest: Uint8Array): void { copyDecompressed(src, dest); }

/** decompress.c LoadCompressedSpriteSheet. */
export function LoadCompressedSpriteSheet(src: CompressedSpriteSheet): number {
  const data = bytesOf(src.data);
  return LoadSpriteSheet({ data, size: src.size, tag: src.tag });
}

/** decompress.c LoadCompressedSpriteSheetOverrideBuffer. */
export function LoadCompressedSpriteSheetOverrideBuffer(src: CompressedSpriteSheet, buffer: Uint8Array): void {
  copyDecompressed(src.data, buffer);
  LoadSpriteSheet({ data: buffer, size: src.size, tag: src.tag });
}

/** decompress.c LoadCompressedSpritePalette. */
export function LoadCompressedSpritePalette(src: CompressedSpritePalette): void {
  LoadSpritePalette({ data: bytesOf(src.data), tag: src.tag });
}

/** decompress.c LoadCompressedSpritePaletteOverrideBuffer. */
export function LoadCompressedSpritePaletteOverrideBuffer(src: CompressedSpritePalette, buffer: Uint8Array): void {
  copyDecompressed(src.data, buffer);
  LoadSpritePalette({ data: buffer, tag: src.tag });
}

/** decompress.c HandleLoadSpecialPokePic determines front/back from the source table pointer. */
export function HandleLoadSpecialPokePic(src: CompressedSpriteSheet, dest: Uint8Array, species: number, personality: number): void {
  const isFrontPic = src === gMonFrontPicTable()[species];
  LoadSpecialPokePic(isFrontPic, dest, species, personality);
}

/** decompress.c Unused_LZDecompressWramIndirect (pointer-to-pointer adapter). */
export function Unused_LZDecompressWramIndirect(src: { current: unknown }, dest: Uint8Array): void {
  LZDecompressWram(src.current, dest);
}

/**
 * decompress.c StitchObjectsOn8x8Canvas. Input is a compact row-major sequence
 * of 4bpp tiles; output is the centered 8x8-tile object canvas used by link sprites.
 */
export function StitchObjectsOn8x8Canvas(objectSize: number, objectCount: number, srcTiles: Uint8Array, destTiles: Uint8Array): void {
  let src = 0;
  let dest = 0;
  if (objectSize & 1) {
    const bottomOffset = (objectSize >> 1) + 4;
    for (let object = 0; object < objectCount; object++) {
      for (let row = 0; row < 8 - objectSize; row++) for (let tile = 0; tile < 8; tile++) for (let byte = 0; byte < 16; byte++) {
        if ((row & 1) === 0) {
          destTiles[dest + byte + (tile << 5) + ((row >> 1) << 8)] = 0;
          destTiles[dest + (bottomOffset << 8) + byte + (tile << 5) + 16 + ((row >> 1) << 8)] = 0;
        } else {
          destTiles[dest + byte + (tile << 5) + 16 + ((row >> 1) << 8)] = 0;
          destTiles[dest + (bottomOffset << 8) + byte + (tile << 5) + 256 + ((row >> 1) << 8)] = 0;
        }
      }
      for (let band = 0; band < 2; band++) for (let row = 0; row < 8; row++) for (let byte = 0; byte < 32; byte++) {
        destTiles[dest + byte + (row << 8) + (band << 5)] = 0;
        destTiles[dest + byte + (row << 8) + (band << 5) + 192] = 0;
      }
      if (objectSize === 5) dest += 0x120;
      for (let row = 0; row < objectSize; row++) {
        for (let column = 0; column < objectSize; column++) {
          for (let lane = 0; lane < 4; lane++) {
            const s = src + (lane << 2), d = dest + (lane << 2);
            destTiles[d + 18] = srcTiles[s] ?? 0; destTiles[d + 19] = srcTiles[s + 1] ?? 0;
            destTiles[d + 48] = srcTiles[s + 2] ?? 0; destTiles[d + 49] = srcTiles[s + 3] ?? 0;
            destTiles[d + 258] = srcTiles[s + 16] ?? 0; destTiles[d + 259] = srcTiles[s + 17] ?? 0;
            destTiles[d + 288] = srcTiles[s + 18] ?? 0; destTiles[d + 289] = srcTiles[s + 19] ?? 0;
          }
          src += 32; dest += 32;
        }
        if (objectSize === 7) dest += 0x20;
        else if (objectSize === 5) dest += 0x60;
      }
      if (objectSize === 7) dest += 0x100;
      else if (objectSize === 5) dest += 0x1e0;
    }
    return;
  }
  for (let object = 0; object < objectCount; object++) {
    if (objectSize === 6) {
      destTiles.fill(0, dest, dest + 256); dest += 256;
    }
    for (let row = 0; row < objectSize; row++) {
      if (objectSize === 6) { destTiles.fill(0, dest, dest + 32); dest += 32; }
      const length = 32 * objectSize;
      destTiles.set(srcTiles.subarray(src, src + length), dest);
      src += length; dest += length;
      if (objectSize === 6) { destTiles.fill(0, dest, dest + 32); dest += 32; }
    }
    if (objectSize === 6) { destTiles.fill(0, dest, dest + 256); dest += 256; }
  }
}

/** decompress.c GetDecompressedDataSize: the LZ header stores a 24-bit size. */
export function GetDecompressedDataSize(src: ArrayLike<number>): number {
  return ((src[1] ?? 0) | ((src[2] ?? 0) << 8) | ((src[3] ?? 0) << 16)) >>> 0;
}

/** decompress.c DecompressPicFromTable_DontHandleDeoxys. */
export function DecompressPicFromTable_DontHandleDeoxys(src: CompressedSpriteSheet, buffer: Uint8Array, species: number): void {
  if (species > C.NUM_SPECIES) copyDecompressed(gMonFrontPicTable()[0].data, buffer);
  else copyDecompressed(src.data, buffer);
}

/** decompress.c HandleLoadSpecialPokePic_DontHandleDeoxys. */
export function HandleLoadSpecialPokePic_DontHandleDeoxys(src: CompressedSpriteSheet, dest: Uint8Array, species: number, personality: number): void {
  const isFrontPic = src === gMonFrontPicTable()[species];
  LoadSpecialPokePic_DontHandleDeoxys(src, dest, species, personality, isFrontPic);
}

/** decompress.c LoadSpecialPokePic_DontHandleDeoxys. */
export function LoadSpecialPokePic_DontHandleDeoxys(src: CompressedSpriteSheet, dest: Uint8Array, species: number, personality: number, isFrontPic: boolean): void {
  if (species === C.SPECIES_UNOWN) {
    const index = (((personality & 0x3000000) >>> 18) | ((personality & 0x30000) >>> 12) | ((personality & 0x300) >>> 6) | (personality & 3)) % 0x1c;
    const unown = index === 0 ? C.SPECIES_UNOWN : index + C.SPECIES_UNOWN_B - 1;
    copyDecompressed((isFrontPic ? gMonFrontPicTable() : gMonBackPicTable())[unown].data, dest);
  } else if (species > C.NUM_SPECIES) copyDecompressed(gMonFrontPicTable()[0].data, dest);
  else copyDecompressed(src.data, dest);
  DrawSpindaSpots(species, personality, dest, isFrontPic);
}
