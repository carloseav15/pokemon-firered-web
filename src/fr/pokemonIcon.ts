// pokemon_icon.c: the small animated party/box icons. Icons are sprites
// without a sheet (TAG_NONE): UpdateMonIconFrame copies the current frame of
// the species' two-frame image into the sprite's tiles, so the sprite keeps
// the icon bytes beside it (the C stores them in sprite->images).

import * as C from "./generated/constants";
import { cdata, incbin, symName, type SymRef } from "./hw/assets";
import { affineAnimsFrom, animsFrom, oamFrom } from "./hw/cdataSprite";
import { LoadPalette } from "./hw/palette";
import {
  CreateSprite, DestroySprite, FreeSpritePaletteByTag, gSprites, IndexOfSpritePaletteTag, LoadSpritePalette, RequestSpriteCopy, TAG_NONE, type Sprite,
  type SpriteCallback, type SpriteTemplate,
} from "./hw/sprite";
import { symPalette } from "./pokemon/pics";

export const POKE_ICON_BASE_PAL_TAG = 56000;
const OBJ_VRAM0 = 0x10000;
const TILE_SIZE_4BPP = 32;

/** The icon bytes of each icon sprite (sprite->images in the C). */
const iconImages = new WeakMap<Sprite, Uint8Array>();

const sym = (name: string): SymRef => ({ $sym: name });
const rd = <T>(name: string): T => cdata<T>("pokemon_icon", name);
const imageSize = (sprite: Sprite): number => rd<number[][]>("sSpriteImageSizes")[sprite.oam.shape][sprite.oam.size];

type IconPalette = { data: unknown; tag: number };
const paletteTable = (): Array<{ data: Uint16Array; tag: number }> =>
  rd<IconPalette[]>("gMonIconPaletteTable").map((p) => ({ data: symPalette(p.data), tag: p.tag }));
const paletteIndices = (): number[] => rd<number[]>("gMonIconPaletteIndices");

export function GetUnownLetterByPersonality(personality: number): number {
  if (!personality) return 0;
  return ((((personality & 0x3000000) >>> 18) | ((personality & 0x30000) >>> 12) | ((personality & 0x300) >>> 6) | (personality & 0x3)) >>> 0) % 0x1c;
}

export function GetIconSpecies(species: number, personality: number): number {
  if (species === C.SPECIES_UNOWN) {
    const letter = GetUnownLetterByPersonality(personality);
    return letter === 0 ? C.SPECIES_UNOWN : letter + (C.SPECIES_UNOWN_B - 1);
  }
  return species > C.NUM_SPECIES ? C.SPECIES_NONE : species;
}

export function GetMonIconTiles(species: number, extra: boolean | number): Uint8Array {
  const table = rd<SymRef[]>("gMonIconTable");
  const bytes = incbin(symName(table[species] ?? table[0])!);
  return species === C.SPECIES_DEOXYS && extra ? bytes.subarray(0x400) : bytes;
}

export function GetMonIconPtr(species: number, personality: number, extra: boolean | number): Uint8Array {
  return GetMonIconTiles(GetIconSpecies(species, personality), extra);
}

/** CreateMonIcon(species, callback, x, y, subpriority, personality, extra) */
export function CreateMonIcon(species: number, callback: SpriteCallback, x: number, y: number, subpriority: number, personality: number, extra: boolean | number): number {
  const paletteTag = species > C.NUM_SPECIES ? POKE_ICON_BASE_PAL_TAG : POKE_ICON_BASE_PAL_TAG + (paletteIndices()[species] ?? 0);
  const spriteId = CreateMonIconSprite(GetMonIconPtr(species, personality, extra), paletteTag, callback, x, y, subpriority);
  UpdateMonIconFrame(gSprites[spriteId]);
  return spriteId;
}

/** CreateMonIcon_HandleDeoxys */
export function CreateMonIcon_HandleDeoxys(species: number, callback: SpriteCallback, x: number, y: number, subpriority: number, extra: boolean | number): number {
  const paletteTag = POKE_ICON_BASE_PAL_TAG + (paletteIndices()[species] ?? 0);
  const spriteId = CreateMonIconSprite(GetMonIconTiles(species, extra), paletteTag, callback, x, y, subpriority);
  UpdateMonIconFrame(gSprites[spriteId]);
  return spriteId;
}

function CreateMonIconSprite(image: Uint8Array, paletteTag: number, callback: SpriteCallback, x: number, y: number, subpriority: number): number {
  const oam = oamFrom(sym("sMonIconOamData"));
  const size = rd<number[][]>("sSpriteImageSizes")[oam.shape][oam.size];
  const template: SpriteTemplate = {
    tileTag: TAG_NONE, paletteTag, oam, anims: animsFrom(sym("sMonIconAnims")),
    // One frame's worth of tiles is allocated; UpdateMonIconFrame fills them.
    images: [{ data: image.subarray(0, size), size }],
    affineAnims: affineAnimsFrom(sym("sMonIconAffineAnims")), callback,
  };
  const spriteId = CreateSprite(template, x, y, subpriority);
  const sprite = gSprites[spriteId];
  sprite.animPaused = true;
  sprite.animBeginning = false;
  iconImages.set(sprite, image);
  return spriteId;
}

export function DestroyMonIcon(sprite: Sprite): void {
  iconImages.delete(sprite);
  DestroySprite(sprite);
}

export function LoadMonIconPalettes(): void {
  for (const p of paletteTable()) LoadSpritePalette(p);
}

export function SafeLoadMonIconPalette(species: number): void {
  if (species > C.NUM_SPECIES) species = C.SPECIES_NONE;
  const p = paletteTable()[paletteIndices()[species]];
  if (IndexOfSpritePaletteTag(p.tag) === 0xff) LoadSpritePalette(p);
}

export function LoadMonIconPalette(species: number): void {
  const p = paletteTable()[paletteIndices()[species]];
  if (IndexOfSpritePaletteTag(p.tag) === 0xff) LoadSpritePalette(p);
}

export function FreeMonIconPalettes(): void {
  for (const p of paletteTable()) FreeSpritePaletteByTag(p.tag);
}

export function SafeFreeMonIconPalette(species: number): void {
  if (species > C.NUM_SPECIES) species = C.SPECIES_NONE;
  FreeSpritePaletteByTag(paletteTable()[paletteIndices()[species]].tag);
}

export function FreeMonIconPalette(species: number): void {
  FreeSpritePaletteByTag(paletteTable()[paletteIndices()[species]].tag);
}

export const SpriteCB_MonIcon: SpriteCallback = (sprite) => { UpdateMonIconFrame(sprite); };

export function LoadMonIconPalettesAt(offset: number): void {
  const table = paletteTable();
  if (offset <= (16 - table.length) * 16) {
    for (const p of table) { LoadPalette(p.data, offset, 32); offset += 16; }
  }
}

export function GetValidMonIconPalettePtr(species: number): Uint16Array {
  if (species > C.NUM_SPECIES) species = C.SPECIES_NONE;
  return paletteTable()[paletteIndices()[species]].data;
}

export function GetValidMonIconPalIndex(species: number): number {
  if (species > C.NUM_SPECIES) species = C.SPECIES_NONE;
  return paletteIndices()[species];
}

export function GetMonIconPaletteIndexFromSpecies(species: number): number {
  return paletteIndices()[species];
}

/** UpdateMonIconFrame: copies the current frame and steps the (paused) animation by hand. */
export function UpdateMonIconFrame(sprite: Sprite): number {
  let result = 0;
  if (sprite.animDelayCounter === 0) {
    const cmd = sprite.anims[sprite.animNum][sprite.animCmdIndex];
    const frame = cmd.type;
    if (frame === -1) {
      // ANIMCMD_END
    } else if (frame === -2) {
      sprite.animCmdIndex = 0;
    } else {
      const size = imageSize(sprite);
      const image = iconImages.get(sprite);
      if (image) RequestSpriteCopy(image.subarray(size * cmd.imageValue, size * (cmd.imageValue + 1)), OBJ_VRAM0 + sprite.oam.tileNum * TILE_SIZE_4BPP, size);
      sprite.animDelayCounter = cmd.duration & 0xff;
      sprite.animCmdIndex++;
      result = sprite.animCmdIndex;
    }
  } else {
    sprite.animDelayCounter--;
  }
  return result;
}

/** SetPartyHPBarSprite */
export function SetPartyHPBarSprite(sprite: Sprite, animNum: number): void {
  sprite.animNum = animNum;
  sprite.animDelayCounter = 0;
  sprite.animCmdIndex = 0;
}
