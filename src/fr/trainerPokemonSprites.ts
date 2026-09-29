// trainer_pokemon_sprites.c: Pokémon and trainer pictures as standalone sprites
// (up to PICS_COUNT at once) or blitted into a window's pixel buffer.
// Adaptations: the exported pics are already decompressed, so DecompressPic copies
// bytes (pokemon/pics.ts); Alloc/Free become plain typed arrays.

import * as C from "./generated/constants";
import { FacilityClassToPicIndex } from "./generated/cdataTableAccessors";
import { cdata } from "./hw/assets";
import { animsFrom } from "./hw/cdataSprite";
import { BG_PLTT_ID, LoadPalette, OBJ_PLTT_ID, PLTT_SIZE_4BPP } from "./hw/palette";
import {
  CreateSprite, DestroySprite, FreeSpritePaletteByTag, gDummySpriteAffineAnimTable, GetSpritePaletteTagByPaletteNum, gSprites,
  LoadSpritePalette, oamData, SPRITE_SHAPE, SPRITE_SIZE, TAG_NONE, type AnimCmd, type Sprite, type SpriteFrameImage, type SpriteTemplate,
} from "./hw/sprite";
import { BlitBitmapRectToWindow, gWindows } from "./hw/window";
import {
  DecompressPicFromTable, GetMonSpritePalFromSpeciesAndPersonality, gTrainerBackPicTable,
  gTrainerFrontPicPaletteTable, gTrainerFrontPicTable, LoadSpecialPokePic, LoadSpecialPokePic_DontHandleDeoxys, symPalette,
} from "./pokemon/pics";
import { GetMonData, IsShinyOtIdPersonality, type Mon } from "./pokemon/mon";

type PicData = { frames: Uint8Array | null; images: SpriteFrameImage[] | null; paletteTag: number; spriteId: number; active: boolean };

const PICS_COUNT = 8;
const MALE = 0;

const sDummyPicData = (): PicData => ({ frames: null, images: null, paletteTag: 0, spriteId: 0, active: false });
const sSpritePics: PicData[] = Array.from({ length: PICS_COUNT }, sDummyPicData);

const sOamData_Normal = () => oamData({ shape: SPRITE_SHAPE("64x64"), size: SPRITE_SIZE("64x64") });

let sCreatingSpriteTemplate: SpriteTemplate = {
  tileTag: 0, paletteTag: 0, oam: sOamData_Normal(), anims: [], images: null, affineAnims: gDummySpriteAffineAnimTable, callback: DummyPicSpriteCallback,
};

let gAnims_MonPic: AnimCmd[][] | undefined;

export function DummyPicSpriteCallback(_sprite: Sprite): void {
}

export function ResetAllPicSprites(): boolean {
  for (let i = 0; i < PICS_COUNT; i++) sSpritePics[i] = sDummyPicData();
  return false;
}

function DecompressPic(species: number, personality: number, isFrontPic: boolean, dest: Uint8Array, isTrainer: boolean, ignoreDeoxys: boolean): boolean {
  if (!isTrainer) {
    if (isFrontPic) {
      if (!ignoreDeoxys) LoadSpecialPokePic(true, dest, species, personality);
      else LoadSpecialPokePic_DontHandleDeoxys(true, dest, species, personality);
    } else {
      if (!ignoreDeoxys) LoadSpecialPokePic(false, dest, species, personality);
      else LoadSpecialPokePic_DontHandleDeoxys(false, dest, species, personality);
    }
  } else {
    if (isFrontPic) DecompressPicFromTable(gTrainerFrontPicTable()[species], dest, species);
    else DecompressPicFromTable(gTrainerBackPicTable()[species], dest, species);
  }
  return false;
}

function DecompressPic_HandleDeoxys(species: number, personality: number, isFrontPic: boolean, dest: Uint8Array, isTrainer: boolean): boolean {
  return DecompressPic(species, personality, isFrontPic, dest, isTrainer, false);
}

/** GetMonSpritePalStructFromOtIdPersonality (pokemon.c) */
export function GetMonSpritePalStructFromOtIdPersonality(species: number, otId: number, personality: number): { data: Uint16Array; tag: number } {
  const table = cdata<Array<{ data: unknown; tag: number }>>("data", IsShinyOtIdPersonality(otId, personality) ? "gMonShinyPaletteTable" : "gMonPaletteTable");
  const pal = table[species];
  return { data: symPalette(pal.data), tag: pal.tag };
}

/** GetMonSpritePalStruct (pokemon.c) */
export function GetMonSpritePalStruct(mon: Mon): { data: Uint16Array; tag: number } {
  const species = GetMonData(mon, C.MON_DATA_SPECIES);
  const otId = GetMonData(mon, C.MON_DATA_OT_ID);
  const personality = GetMonData(mon, C.MON_DATA_PERSONALITY);
  return GetMonSpritePalStructFromOtIdPersonality(species, otId, personality);
}

export function LoadPicPaletteByTagOrSlot(species: number, otId: number, personality: number, paletteSlot: number, paletteTag: number, isTrainer: boolean): void {
  if (!isTrainer) {
    if (paletteTag === TAG_NONE) {
      sCreatingSpriteTemplate.paletteTag = TAG_NONE;
      LoadPalette(GetMonSpritePalFromSpeciesAndPersonality(species, otId, personality), OBJ_PLTT_ID(paletteSlot), PLTT_SIZE_4BPP);
    } else {
      sCreatingSpriteTemplate.paletteTag = paletteTag;
      LoadSpritePalette(GetMonSpritePalStructFromOtIdPersonality(species, otId, personality));
    }
  } else {
    const pal = gTrainerFrontPicPaletteTable()[species];
    if (paletteTag === TAG_NONE) {
      sCreatingSpriteTemplate.paletteTag = TAG_NONE;
      LoadPalette(symPalette(pal.data), OBJ_PLTT_ID(paletteSlot), PLTT_SIZE_4BPP);
    } else {
      sCreatingSpriteTemplate.paletteTag = paletteTag;
      LoadSpritePalette({ data: symPalette(pal.data), tag: pal.tag });
    }
  }
}

export function LoadPicPaletteBySlot(species: number, otId: number, personality: number, paletteSlot: number, isTrainer: boolean): void {
  if (!isTrainer) LoadPalette(GetMonSpritePalFromSpeciesAndPersonality(species, otId, personality), BG_PLTT_ID(paletteSlot), PLTT_SIZE_4BPP);
  else LoadPalette(symPalette(gTrainerFrontPicPaletteTable()[species].data), BG_PLTT_ID(paletteSlot), PLTT_SIZE_4BPP);
}

export function AssignSpriteAnimsTable(isTrainer: boolean): void {
  if (!isTrainer) sCreatingSpriteTemplate.anims = (gAnims_MonPic ??= animsFrom({ $sym: "gAnims_MonPic" }));
  else sCreatingSpriteTemplate.anims = animsFrom(cdata<unknown[]>("data", "gTrainerFrontAnimsPtrTable")[0]);
}

export function CreatePicSprite(species: number, otId: number, personality: number, isFrontPic: boolean, x: number, y: number, paletteSlot: number, paletteTag: number, isTrainer: boolean, ignoreDeoxys: boolean): number {
  let i: number;
  for (i = 0; i < PICS_COUNT; i++) {
    if (!sSpritePics[i].active) break;
  }
  if (i === PICS_COUNT) return 0xffff;

  const framePics = new Uint8Array(4 * 0x800);
  const images: SpriteFrameImage[] = [];
  if (DecompressPic(species, personality, isFrontPic, framePics, isTrainer, ignoreDeoxys)) return 0xffff;
  for (let j = 0; j < 4; j++) images.push({ data: framePics.subarray(0x800 * j, 0x800 * (j + 1)), size: 0x800 });
  sCreatingSpriteTemplate = { ...sCreatingSpriteTemplate, tileTag: TAG_NONE, oam: sOamData_Normal() };
  AssignSpriteAnimsTable(isTrainer);
  sCreatingSpriteTemplate.images = images;
  sCreatingSpriteTemplate.affineAnims = gDummySpriteAffineAnimTable;
  sCreatingSpriteTemplate.callback = DummyPicSpriteCallback;
  LoadPicPaletteByTagOrSlot(species, otId, personality, paletteSlot, paletteTag, isTrainer);
  const spriteId = CreateSprite(sCreatingSpriteTemplate, x, y, 0);
  if (paletteTag === TAG_NONE) gSprites[spriteId].oam.paletteNum = paletteSlot;
  sSpritePics[i] = { frames: framePics, images, paletteTag, spriteId, active: true };
  return spriteId;
}

export function CreatePicSprite_HandleDeoxys(species: number, otId: number, personality: number, isFrontPic: boolean, x: number, y: number, paletteSlot: number, paletteTag: number, isTrainer: boolean): number {
  return CreatePicSprite(species, otId, personality, isFrontPic, x, y, paletteSlot, paletteTag, isTrainer, false);
}

export function FreeAndDestroyPicSpriteInternal(spriteId: number): number {
  let i: number;
  for (i = 0; i < PICS_COUNT; i++) {
    if (sSpritePics[i].spriteId === spriteId) break;
  }
  if (i === PICS_COUNT) return 0xffff;

  if (sSpritePics[i].paletteTag !== TAG_NONE) FreeSpritePaletteByTag(GetSpritePaletteTagByPaletteNum(gSprites[spriteId].oam.paletteNum));
  DestroySprite(gSprites[spriteId]);
  sSpritePics[i] = sDummyPicData();
  return 0;
}

function LoadPicSpriteInWindow(species: number, otId: number, personality: number, isFrontPic: boolean, paletteSlot: number, windowId: number, isTrainer: boolean): number {
  // GetWindowAttribute(windowId, WINDOW_TILE_DATA) returns the pixel buffer pointer in C.
  const tileData = gWindows[windowId].tileData;
  if (!tileData || DecompressPic_HandleDeoxys(species, personality, isFrontPic, tileData, false)) return 0xffff;
  LoadPicPaletteBySlot(species, otId, personality, paletteSlot, isTrainer);
  return 0;
}

export function CreateTrainerCardSprite(species: number, otId: number, personality: number, isFrontPic: boolean, destX: number, destY: number, paletteSlot: number, windowId: number, isTrainer: boolean): number {
  const framePics = new Uint8Array(4 * 0x800);
  if (!DecompressPic_HandleDeoxys(species, personality, isFrontPic, framePics, isTrainer)) {
    BlitBitmapRectToWindow(windowId, framePics, 0, 0, 0x40, 0x40, destX, destY, 0x40, 0x40);
    LoadPicPaletteBySlot(species, otId, personality, paletteSlot, isTrainer);
    return 0;
  }
  return 0xffff;
}

export function CreateMonPicSprite(species: number, otId: number, personality: number, isFrontPic: boolean, x: number, y: number, paletteSlot: number, paletteTag: number, ignoreDeoxys: boolean): number {
  return CreatePicSprite(species, otId, personality, isFrontPic, x, y, paletteSlot, paletteTag, false, ignoreDeoxys);
}

export function CreateMonPicSprite_HandleDeoxys(species: number, otId: number, personality: number, isFrontPic: boolean, x: number, y: number, paletteSlot: number, paletteTag: number): number {
  return CreateMonPicSprite(species, otId, personality, isFrontPic, x, y, paletteSlot, paletteTag, false);
}

export function FreeAndDestroyMonPicSprite(spriteId: number): number {
  return FreeAndDestroyPicSpriteInternal(spriteId);
}

export function LoadMonPicInWindow(species: number, otId: number, personality: number, isFrontPic: boolean, paletteSlot: number, windowId: number): number {
  return CreateTrainerCardSprite(species, otId, personality, isFrontPic, 0, 0, paletteSlot, windowId, false);
}

export function CreateTrainerCardMonIconSprite(species: number, otId: number, personality: number, isFrontPic: boolean, destX: number, destY: number, paletteSlot: number, windowId: number): number {
  return CreateTrainerCardSprite(species, otId, personality, isFrontPic, destX, destY, paletteSlot, windowId, false);
}

export function CreateTrainerPicSprite(species: number, isFrontPic: boolean, x: number, y: number, paletteSlot: number, paletteTag: number): number {
  return CreatePicSprite_HandleDeoxys(species, 0, 0, isFrontPic, x, y, paletteSlot, paletteTag, true);
}

export function FreeAndDestroyTrainerPicSprite(spriteId: number): number {
  return FreeAndDestroyPicSpriteInternal(spriteId);
}

export function LoadTrainerPicInWindow(species: number, isFrontPic: boolean, paletteSlot: number, windowId: number): number {
  return LoadPicSpriteInWindow(species, 0, 0, isFrontPic, paletteSlot, windowId, true);
}

export function CreateTrainerCardTrainerPicSprite(species: number, isFrontPic: boolean, destX: number, destY: number, paletteSlot: number, windowId: number): number {
  return CreateTrainerCardSprite(species, 0, 0, isFrontPic, destX, destY, paletteSlot, windowId, true);
}

export function PlayerGenderToFrontTrainerPicId(gender: number, getClass: boolean): number {
  if (getClass === true) {
    if (gender !== MALE) return FacilityClassToPicIndex(C.FACILITY_CLASS_LEAF);
    return FacilityClassToPicIndex(C.FACILITY_CLASS_RED);
  }
  return gender;
}
