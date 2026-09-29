// Pokémon / trainer picture and palette loading: decompress.c (LoadSpecialPokePic, DecompressPicFromTable)
// and pokemon.c (GetMonSpritePalFromSpeciesAndPersonality, DrawSpindaSpots). The exported
// graphics are already decompressed, so LZ77UnCompWram is a plain copy.

import * as C from "../generated/constants";
import { cdata, incbin, symName } from "../hw/assets";
import { rom } from "../rom";
import { gMonSpritesGfxPtr } from "../battle/globals";
import { GetMonData, IsShinyOtIdPersonality, type Mon } from "./mon";

type CSheet = { data: unknown; size: number; tag: number };
type CPalette = { data: unknown; tag: number };
export type MonCoords = { size: number; y_offset: number };

const table = <T>(name: string) => cdata<T[]>("data", name);

export const gMonFrontPicTable = () => table<CSheet>("gMonFrontPicTable");
export const gMonBackPicTable = () => table<CSheet>("gMonBackPicTable");
export const gTrainerFrontPicTable = () => table<CSheet>("gTrainerFrontPicTable");
export const gTrainerBackPicTable = () => table<CSheet>("gTrainerBackPicTable");
export const gTrainerFrontPicPaletteTable = () => table<CPalette>("gTrainerFrontPicPaletteTable");
export const gTrainerBackPicPaletteTable = () => table<CPalette>("gTrainerBackPicPaletteTable");

/** Bytes of a symbol reference (optionally with an offset), as the C pointer would address them. */
export function symBytes(ref: unknown): Uint8Array {
  const name = symName(ref);
  if (!name) return new Uint8Array(0);
  const bytes = incbin(name);
  const offset = (ref as { offset?: number }).offset ?? 0;
  return offset ? bytes.subarray(offset) : bytes;
}

/** A palette symbol as u16 colors. */
export function symPalette(ref: unknown): Uint16Array {
  const b = symBytes(ref);
  return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.length & ~1)));
}

export function sheetBytes(sheet: CSheet): Uint8Array {
  return symBytes(sheet.data);
}

/** LZ77UnCompWram equivalent: copies the (already decompressed) picture into dest. */
function uncomp(src: Uint8Array, dest: Uint8Array): void {
  dest.set(src.subarray(0, Math.min(src.length, dest.length)));
}

function unownIndex(personality: number): number {
  const i = ((((personality & 0x3000000) >>> 18) | ((personality & 0x30000) >>> 12) | ((personality & 0x300) >>> 6) | (personality & 3)) >>> 0) % 0x1c;
  return i === 0 ? C.SPECIES_UNOWN : i + C.SPECIES_UNOWN_B - 1;
}

function DuplicateDeoxysTiles(dest: Uint8Array, species: number): void {
  if (species === C.SPECIES_DEOXYS) dest.copyWithin(0, 0x800, 0x1000);
}

export function LoadSpecialPokePic(isFrontPic: boolean, dest: Uint8Array, species: number, personality: number, handleDeoxys = true): void {
  if (species === C.SPECIES_UNOWN) {
    const i = unownIndex(personality);
    uncomp(sheetBytes(isFrontPic ? gMonFrontPicTable()[i] : gMonBackPicTable()[i]), dest);
  } else if (species > C.NUM_SPECIES) {
    uncomp(sheetBytes(gMonFrontPicTable()[0]), dest);
  } else {
    uncomp(sheetBytes(isFrontPic ? gMonFrontPicTable()[species] : gMonBackPicTable()[species]), dest);
  }
  if (handleDeoxys) DuplicateDeoxysTiles(dest, species);
  DrawSpindaSpots(species, personality, dest, isFrontPic);
}

/** LoadSpecialPokePic_DontHandleDeoxys */
export function LoadSpecialPokePic_DontHandleDeoxys(isFrontPic: boolean, dest: Uint8Array, species: number, personality: number): void {
  LoadSpecialPokePic(isFrontPic, dest, species, personality, false);
}

export function DecompressPicFromTable(sheet: CSheet, dest: Uint8Array, species: number): void {
  if (species > C.NUM_SPECIES) uncomp(sheetBytes(gMonFrontPicTable()[0]), dest);
  else uncomp(sheetBytes(sheet), dest);
  DuplicateDeoxysTiles(dest, species);
}

export function GetMonSpritePalFromSpeciesAndPersonality(species: number, otId: number, personality: number): Uint16Array {
  if (species > C.SPECIES_EGG) return symPalette(table<CPalette>("gMonPaletteTable")[0].data);
  if (IsShinyOtIdPersonality(otId, personality)) return symPalette(table<CPalette>("gMonShinyPaletteTable")[species].data);
  return symPalette(table<CPalette>("gMonPaletteTable")[species].data);
}

export function GetMonFrontSpritePal(mon: Mon): Uint16Array {
  return GetMonSpritePalFromSpeciesAndPersonality(
    GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG), GetMonData(mon, C.MON_DATA_OT_ID), GetMonData(mon, C.MON_DATA_PERSONALITY));
}

export const gMonFrontPicCoords = () => table<MonCoordsRaw>("gMonFrontPicCoords");
export const gMonBackPicCoords = () => table<MonCoordsRaw>("gMonBackPicCoords");
export const gTrainerFrontPicCoords = () => table<MonCoords>("gTrainerFrontPicCoords");
export const gTrainerBackPicCoords = () => table<MonCoords>("gTrainerBackPicCoords");
type MonCoordsRaw = { size: unknown; y_offset: number };

/** gEnemyMonElevation[species] (sparse initializer: missing entries are 0). */
export function gEnemyMonElevation(species: number): number {
  return table<number | null>("gEnemyMonElevation")[species] ?? 0;
}

// ---------------------------------------------------------------- Spinda spots

const SPINDA_SPOT_WIDTH = 16;
const SPINDA_SPOT_HEIGHT = 16;
const FIRST_SPOT_COLOR = 1;
const LAST_SPOT_COLOR = 3;
const SPOT_COLOR_ADJUSTMENT = 4;
const sSpindaSpotGraphics = [
  { x: 16, y: 7, image: [112, 508, 1022, 2046, 2047, 4095, 4095, 4095, 2046, 2046, 1020, 480, 0, 0, 0, 0] },
  { x: 40, y: 8, image: [480, 1016, 2044, 4094, 4094, 8191, 8191, 8191, 4094, 4094, 2044, 2040, 224, 0, 0, 0] },
  { x: 22, y: 25, image: [28, 62, 127, 127, 127, 127, 127, 62, 28, 0, 0, 0, 0, 0, 0, 0] },
  { x: 34, y: 26, image: [60, 126, 255, 255, 255, 255, 255, 126, 60, 0, 0, 0, 0, 0, 0, 0] },
];

function drawSpindaSpots(personality: number, dest: Uint8Array): void {
  let p = personality >>> 0;
  for (const spot of sSpindaSpotGraphics) {
    const x = (spot.x + ((p & 0x0f) - 8)) & 0xff;
    let y = (spot.y + (((p & 0xf0) >> 4) - 8)) & 0xff;
    for (let row = 0; row < SPINDA_SPOT_HEIGHT; row++) {
      let spotPixelRow = spot.image[row];
      for (let column = x; column < x + SPINDA_SPOT_WIDTH; column++) {
        const idx = ((column >> 3) * 32) + ((column % 8) >> 1) + ((y >> 3) * 32 * 8) + ((y % 8) * 4);
        if (spotPixelRow & 1) {
          if (column & 1) {
            if ((((dest[idx] & 0xf0) - (FIRST_SPOT_COLOR << 4)) & 0xff) <= ((LAST_SPOT_COLOR - FIRST_SPOT_COLOR) << 4)) dest[idx] = (dest[idx] + (SPOT_COLOR_ADJUSTMENT << 4)) & 0xff;
          } else if ((((dest[idx] & 0xf) - FIRST_SPOT_COLOR) & 0xff) <= LAST_SPOT_COLOR - FIRST_SPOT_COLOR) {
            dest[idx] = (dest[idx] + SPOT_COLOR_ADJUSTMENT) & 0xff;
          }
        }
        spotPixelRow >>= 1;
      }
      y = (y + 1) & 0xff;
    }
    p >>>= 8;
  }
}

export function DrawSpindaSpots(species: number, personality: number, dest: Uint8Array, isFrontPic: boolean): void {
  if (species !== C.SPECIES_SPINDA || !isFrontPic) return;
  drawSpindaSpots(personality, dest);
}

/** DrawSpindaSpotsUnused (pokemon.c): same drawing, but decides for itself whether dest is the
 *  back pic by comparing it with the battler buffers instead of taking an isFrontPic flag. */
export function DrawSpindaSpotsUnused(species: number, personality: number, dest: Uint8Array): void {
  if (species !== C.SPECIES_SPINDA) return;
  if (dest === gMonSpritesGfxPtr.sprites[C.B_POSITION_PLAYER_LEFT]) return;
  if (dest === gMonSpritesGfxPtr.sprites[C.B_POSITION_PLAYER_RIGHT]) return;
  drawSpindaSpots(personality, dest);
}

/** IsMonSpriteNotFlipped (pokemon.c) */
export function IsMonSpriteNotFlipped(species: number): boolean {
  return !!rom.species[species]?.noFlip;
}
