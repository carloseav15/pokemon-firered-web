// sprite.c: the GBA sprite engine (templates, OAM buffer, animation and
// affine animation commands, subsprites, tile/palette tag allocation).

import { LoadPalette, OBJ_PLTT_OFFSET, PLTT_ID, PLTT_SIZE_4BPP } from "./palette";
import { OBJ_VRAM0, ppu } from "./ppu";
import { gSineTable } from "./trig";

export const MAX_SPRITES = 64;
export const SPRITE_NONE = 0xff;
export const TAG_NONE = 0xffff;
export const NO_ANCHOR = 0x800;
export const TOTAL_OBJ_TILE_COUNT = 1024;
export const TILE_SIZE_4BPP = 32;
export const OAM_MATRIX_COUNT = 32;

export const ST_OAM_AFFINE_OFF = 0;
export const ST_OAM_AFFINE_NORMAL = 1;
export const ST_OAM_AFFINE_ERASE = 2;
export const ST_OAM_AFFINE_DOUBLE = 3;
export const ST_OAM_AFFINE_ON_MASK = 1;
export const ST_OAM_AFFINE_DOUBLE_MASK = 2;
export const ST_OAM_OBJ_NORMAL = 0;
export const ST_OAM_OBJ_BLEND = 1;
export const ST_OAM_OBJ_WINDOW = 2;
export const ST_OAM_4BPP = 0;
export const ST_OAM_8BPP = 1;
export const ST_OAM_SQUARE = 0;
export const ST_OAM_H_RECTANGLE = 1;
export const ST_OAM_V_RECTANGLE = 2;
export const ST_OAM_SIZE_0 = 0;
export const ST_OAM_SIZE_1 = 1;
export const ST_OAM_SIZE_2 = 2;
export const ST_OAM_SIZE_3 = 3;
export const ST_OAM_HFLIP = 0x08;
export const ST_OAM_VFLIP = 0x10;
export const ST_OAM_MNUM_FLIP_MASK = 0x18;

export const SUBSPRITES_OFF = 0;
export const SUBSPRITES_ON = 1;
export const SUBSPRITES_IGNORE_PRIORITY = 2;

// SPRITE_SHAPE / SPRITE_SIZE for NxM
const SHAPE_SIZE: Record<string, [number, number]> = {
  "8x8": [0, 0], "16x16": [0, 1], "32x32": [0, 2], "64x64": [0, 3],
  "16x8": [1, 0], "32x8": [1, 1], "32x16": [1, 2], "64x32": [1, 3],
  "8x16": [2, 0], "8x32": [2, 1], "16x32": [2, 2], "32x64": [2, 3],
};
export const SPRITE_SHAPE = (dims: string) => SHAPE_SIZE[dims][0];
export const SPRITE_SIZE = (dims: string) => SHAPE_SIZE[dims][1];

export type OamData = {
  y: number; affineMode: number; objMode: number; mosaic: number; bpp: number; shape: number;
  x: number; matrixNum: number; size: number; tileNum: number; priority: number; paletteNum: number; affineParam: number;
};

export function oamData(partial: Partial<OamData> = {}): OamData {
  return { y: 0, affineMode: 0, objMode: 0, mosaic: 0, bpp: 0, shape: 0, x: 0, matrixNum: 0, size: 0, tileNum: 0, priority: 0, paletteNum: 0, affineParam: 0, ...partial };
}

/** Normalized union AnimCmd: type is the frame imageValue (>= 0) or -1 end, -2 jump, -3 loop. */
export type AnimCmd = { type: number; imageValue: number; duration: number; hFlip: number; vFlip: number; count: number; target: number };
/** Normalized union AffineAnimCmd: type is xScale for frames, or 0x7FFD loop, 0x7FFE jump, 0x7FFF end. */
export type AffineAnimCmd = { type: number; xScale: number; yScale: number; rotation: number; duration: number; count: number; target: number; val: number };

export const ANIMCMD_FRAME = (imageValue: number, duration: number, hFlip = 0, vFlip = 0): AnimCmd => ({ type: imageValue, imageValue, duration, hFlip: hFlip ? 1 : 0, vFlip: vFlip ? 1 : 0, count: 0, target: 0 });
export const ANIMCMD_LOOP = (count: number): AnimCmd => ({ type: -3, imageValue: 0, duration: 0, hFlip: 0, vFlip: 0, count, target: 0 });
export const ANIMCMD_JUMP = (target: number): AnimCmd => ({ type: -2, imageValue: 0, duration: 0, hFlip: 0, vFlip: 0, count: 0, target });
export const ANIMCMD_END: AnimCmd = { type: -1, imageValue: 0, duration: 0, hFlip: 0, vFlip: 0, count: 0, target: 0 };
export const AFFINEANIMCMD_FRAME = (xScale: number, yScale: number, rotation: number, duration: number): AffineAnimCmd => ({ type: s16(xScale), xScale: s16(xScale), yScale: s16(yScale), rotation: rotation & 0xff, duration: duration & 0xff, count: 0, target: 0, val: 0 });
export const AFFINEANIMCMD_LOOP = (count: number): AffineAnimCmd => ({ type: 0x7ffd, xScale: 0, yScale: 0, rotation: 0, duration: 0, count, target: 0, val: 0 });
export const AFFINEANIMCMD_JUMP = (target: number): AffineAnimCmd => ({ type: 0x7ffe, xScale: 0, yScale: 0, rotation: 0, duration: 0, count: 0, target, val: 0 });
export const AFFINEANIMCMD_END: AffineAnimCmd = { type: 0x7fff, xScale: 0, yScale: 0, rotation: 0, duration: 0, count: 0, target: 0, val: 0 };
export const AFFINEANIMCMD_END_ALT = (val: number): AffineAnimCmd => ({ ...AFFINEANIMCMD_END, val });

export type SpriteFrameImage = { data: Uint8Array; size: number };
export type SpriteCallback = (sprite: Sprite) => void;
export type Subsprite = { x: number; y: number; shape: number; size: number; tileOffset: number; priority: number };
export type SubspriteTable = { subspriteCount: number; subsprites: Subsprite[] | null };

export type SpriteTemplate = {
  tileTag: number;
  paletteTag: number;
  oam: OamData;
  anims: AnimCmd[][];
  images: SpriteFrameImage[] | null;
  affineAnims: AffineAnimCmd[][];
  callback: SpriteCallback;
};

export type SpriteSheet = { data: ArrayLike<number>; size: number; tag: number };
export type SpritePalette = { data: ArrayLike<number>; tag: number };

function s16(v: number): number {
  return (v << 16) >> 16;
}

export const SpriteCallbackDummy: SpriteCallback = () => {};

export const gDummyOamData: OamData = oamData({ y: 160, x: 304, priority: 3 });
export const gDummySpriteAnimTable: AnimCmd[][] = [[ANIMCMD_END]];
export const gDummySpriteAffineAnimTable: AffineAnimCmd[][] = [[AFFINEANIMCMD_END]];
export const gDummySpriteTemplate: SpriteTemplate = {
  tileTag: 0, paletteTag: TAG_NONE, oam: gDummyOamData, anims: gDummySpriteAnimTable, images: null, affineAnims: gDummySpriteAffineAnimTable, callback: SpriteCallbackDummy,
};

const CENTER_TO_CORNER: number[][][] = [
  [[-4, -4], [-8, -8], [-16, -16], [-32, -32]],
  [[-8, -4], [-16, -4], [-16, -8], [-32, -16]],
  [[-4, -8], [-4, -16], [-8, -16], [-16, -32]],
];

export const OAM_DIMENSIONS: number[][][] = [
  [[8, 8], [16, 16], [32, 32], [64, 64]],
  [[16, 8], [32, 8], [32, 16], [64, 32]],
  [[8, 16], [8, 32], [16, 32], [32, 64]],
];

export class Sprite {
  oam: OamData = { ...gDummyOamData };
  anims: AnimCmd[][] = gDummySpriteAnimTable;
  images: SpriteFrameImage[] | null = null;
  affineAnims: AffineAnimCmd[][] = gDummySpriteAffineAnimTable;
  template: SpriteTemplate = gDummySpriteTemplate;
  subspriteTables: SubspriteTable[] | null = null;
  callback: SpriteCallback = SpriteCallbackDummy;
  private _x = 304;
  private _y = 160;
  private _x2 = 0;
  private _y2 = 0;
  centerToCornerVecX = 0;
  centerToCornerVecY = 0;
  animNum = 0;
  animCmdIndex = 0;
  animDelayCounter = 0;
  animPaused = false;
  affineAnimPaused = false;
  animLoopCounter = 0;
  readonly data = new Int16Array(8);
  inUse = false;
  coordOffsetEnabled = false;
  invisible = false;
  flags_3 = false;
  flags_4 = false;
  flags_5 = false;
  flags_6 = false;
  flags_7 = false;
  hFlip = 0;
  vFlip = 0;
  animBeginning = false;
  affineAnimBeginning = false;
  animEnded = false;
  affineAnimEnded = false;
  usingSheet = false;
  anchored = false;
  sheetTileStart = 0;
  subspriteTableNum = 0;
  subspriteMode = 0;
  subpriority = 0xff;
  /** Index into gSprites. */
  constructor(readonly id: number) {}

  // s16 fields
  get x(): number { return this._x; }
  set x(v: number) { this._x = s16(v); }
  get y(): number { return this._y; }
  set y(v: number) { this._y = s16(v); }
  get x2(): number { return this._x2; }
  set x2(v: number) { this._x2 = s16(v); }
  get y2(): number { return this._y2; }
  set y2(v: number) { this._y2 = s16(v); }

  reset(): void {
    this.oam = { ...gDummyOamData };
    this.anims = gDummySpriteAnimTable;
    this.images = null;
    this.affineAnims = gDummySpriteAffineAnimTable;
    this.template = gDummySpriteTemplate;
    this.subspriteTables = null;
    this.callback = SpriteCallbackDummy;
    this._x = 240 + 64;
    this._y = 160;
    this._x2 = this._y2 = 0;
    this.centerToCornerVecX = this.centerToCornerVecY = 0;
    this.animNum = this.animCmdIndex = this.animDelayCounter = this.animLoopCounter = 0;
    this.animPaused = this.affineAnimPaused = false;
    this.data.fill(0);
    this.inUse = this.coordOffsetEnabled = this.invisible = false;
    this.flags_3 = this.flags_4 = this.flags_5 = this.flags_6 = this.flags_7 = false;
    this.hFlip = this.vFlip = 0;
    this.animBeginning = this.affineAnimBeginning = this.animEnded = this.affineAnimEnded = false;
    this.usingSheet = this.anchored = false;
    this.sheetTileStart = 0;
    this.subspriteTableNum = this.subspriteMode = 0;
    this.subpriority = 0xff;
  }
}

export const gSprites: Sprite[] = Array.from({ length: MAX_SPRITES + 1 }, (_, i) => new Sprite(i));
const gSpritePriorities = new Uint16Array(MAX_SPRITES);
const gSpriteOrder = new Uint8Array(MAX_SPRITES);
export const gOamBuffer: OamData[] = Array.from({ length: 128 }, () => ({ ...gDummyOamData }));
export const gOamMatrices = Array.from({ length: OAM_MATRIX_COUNT }, () => ({ a: 0x100, b: 0, c: 0, d: 0x100 }));
const sAffineAnimStates = Array.from({ length: OAM_MATRIX_COUNT }, () => ({ animNum: 0, animCmdIndex: 0, delayCounter: 0, loopCounter: 0, xScale: 0x100, yScale: 0x100, rotation: 0 }));
const sSpriteTileRangeTags = new Uint16Array(MAX_SPRITES).fill(TAG_NONE);
const sSpriteTileRanges: Array<[number, number]> = Array.from({ length: MAX_SPRITES }, () => [0, 0]);
const sSpritePaletteTags = new Uint16Array(16).fill(TAG_NONE);
const gSpriteTileAllocBitmap = new Uint8Array(128);
let copyRequests: Array<{ src: Uint8Array; dest: number; size: number }> = [];
let shouldProcessCopyRequests = false;

export const spriteState = {
  gOamLimit: 64,
  gReservedSpriteTileCount: 0,
  gSpriteCoordOffsetX: 0,
  gSpriteCoordOffsetY: 0,
  gAffineAnimsDisabled: false,
  gOamMatrixAllocBitmap: 0,
  gReservedSpritePaletteCount: 0,
  oamLoadDisabled: false,
};

const isAlloc = (n: number) => (gSpriteTileAllocBitmap[n >> 3] >> (n & 7)) & 1;
const allocTile = (n: number) => { gSpriteTileAllocBitmap[n >> 3] |= 1 << (n & 7); };
const freeTile = (n: number) => { gSpriteTileAllocBitmap[n >> 3] &= ~(1 << (n & 7)); };

export function ResetSpriteData(): void {
  ResetOamRange(0, 128);
  resetAllSprites();
  ClearSpriteCopyRequests();
  ResetAffineAnimData();
  FreeSpriteTileRanges();
  spriteState.gOamLimit = 64;
  spriteState.gReservedSpriteTileCount = 0;
  AllocSpriteTiles(0);
  spriteState.gSpriteCoordOffsetX = 0;
  spriteState.gSpriteCoordOffsetY = 0;
}

export function AnimateSprites(): void {
  for (let i = 0; i < MAX_SPRITES; i++) {
    const sprite = gSprites[i];
    if (sprite.inUse) {
      sprite.callback(sprite);
      if (sprite.inUse) AnimateSprite(sprite);
    }
  }
}

export function BuildOamBuffer(): void {
  updateOamCoords();
  buildSpritePriorities();
  sortSprites();
  const temp = spriteState.oamLoadDisabled;
  spriteState.oamLoadDisabled = true;
  addSpritesToOamBuffer();
  copyMatricesToOamBuffer();
  spriteState.oamLoadDisabled = temp;
  shouldProcessCopyRequests = true;
}

function updateOamCoords(): void {
  for (let i = 0; i < MAX_SPRITES; i++) {
    const s = gSprites[i];
    if (s.inUse && !s.invisible) {
      if (s.coordOffsetEnabled) {
        s.oam.x = (s.x + s.x2 + s.centerToCornerVecX + spriteState.gSpriteCoordOffsetX) & 0x1ff;
        s.oam.y = (s.y + s.y2 + s.centerToCornerVecY + spriteState.gSpriteCoordOffsetY) & 0xff;
      } else {
        s.oam.x = (s.x + s.x2 + s.centerToCornerVecX) & 0x1ff;
        s.oam.y = (s.y + s.y2 + s.centerToCornerVecY) & 0xff;
      }
    }
  }
}

function buildSpritePriorities(): void {
  for (let i = 0; i < MAX_SPRITES; i++) gSpritePriorities[i] = (gSprites[i].subpriority & 0xff) | (gSprites[i].oam.priority << 8);
}

function sortY(s: Sprite): number {
  let y = s.oam.y;
  if (y >= 160) y -= 256;
  if (s.oam.affineMode === ST_OAM_AFFINE_DOUBLE && s.oam.size === 3 && (s.oam.shape === ST_OAM_SQUARE || s.oam.shape === ST_OAM_V_RECTANGLE) && y > 128) y -= 256;
  return y;
}

function sortSprites(): void {
  for (let i = 1; i < MAX_SPRITES; i++) {
    let j = i;
    while (j > 0) {
      const a = gSpriteOrder[j - 1];
      const b = gSpriteOrder[j];
      const pa = gSpritePriorities[a];
      const pb = gSpritePriorities[b];
      if (pa > pb || (pa === pb && sortY(gSprites[a]) < sortY(gSprites[b]))) {
        gSpriteOrder[j] = a;
        gSpriteOrder[j - 1] = b;
        j--;
      } else {
        break;
      }
    }
  }
}

function copyMatricesToOamBuffer(): void {
  for (let i = 0; i < OAM_MATRIX_COUNT; i++) {
    const base = 4 * i;
    gOamBuffer[base].affineParam = gOamMatrices[i].a;
    gOamBuffer[base + 1].affineParam = gOamMatrices[i].b;
    gOamBuffer[base + 2].affineParam = gOamMatrices[i].c;
    gOamBuffer[base + 3].affineParam = gOamMatrices[i].d;
  }
}

function addSpritesToOamBuffer(): void {
  const index = { value: 0 };
  for (let i = 0; i < MAX_SPRITES; i++) {
    const s = gSprites[gSpriteOrder[i]];
    if (s.inUse && !s.invisible && AddSpriteToOamBuffer(s, index)) return;
  }
  while (index.value < spriteState.gOamLimit) {
    Object.assign(gOamBuffer[index.value], gDummyOamData);
    index.value++;
  }
}

export function CreateSprite(template: SpriteTemplate, x: number, y: number, subpriority: number): number {
  for (let i = 0; i < MAX_SPRITES; i++) if (!gSprites[i].inUse) return createSpriteAt(i, template, x, y, subpriority);
  return MAX_SPRITES;
}

export function CreateSpriteAtEnd(template: SpriteTemplate, x: number, y: number, subpriority: number): number {
  for (let i = MAX_SPRITES - 1; i > -1; i--) if (!gSprites[i].inUse) return createSpriteAt(i, template, x, y, subpriority);
  return MAX_SPRITES;
}

export function CreateInvisibleSprite(callback: SpriteCallback): number {
  const index = CreateSprite(gDummySpriteTemplate, 0, 0, 31);
  if (index === MAX_SPRITES) return MAX_SPRITES;
  gSprites[index].invisible = true;
  gSprites[index].callback = callback;
  return index;
}

function createSpriteAt(index: number, template: SpriteTemplate, x: number, y: number, subpriority: number): number {
  const s = gSprites[index];
  s.reset();
  s.inUse = true;
  s.animBeginning = true;
  s.affineAnimBeginning = true;
  s.usingSheet = true;
  s.subpriority = subpriority & 0xff;
  s.oam = { ...template.oam };
  s.anims = template.anims;
  s.affineAnims = template.affineAnims;
  s.template = template;
  s.callback = template.callback;
  s.x = x;
  s.y = y;
  CalcCenterToCornerVec(s, s.oam.shape, s.oam.size, s.oam.affineMode);
  if (template.tileTag === TAG_NONE) {
    s.images = template.images;
    const tileNum = AllocSpriteTiles(((s.images?.[0]?.size ?? 0) / TILE_SIZE_4BPP) & 0xff);
    if (tileNum === -1) {
      s.reset();
      return MAX_SPRITES;
    }
    s.oam.tileNum = tileNum;
    s.usingSheet = false;
    s.sheetTileStart = 0;
  } else {
    s.sheetTileStart = GetSpriteTileStartByTag(template.tileTag);
    SetSpriteSheetFrameTileNum(s);
  }
  if (s.oam.affineMode & ST_OAM_AFFINE_ON_MASK) InitSpriteAffineAnim(s);
  if (template.paletteTag !== TAG_NONE) s.oam.paletteNum = IndexOfSpritePaletteTag(template.paletteTag) & 0xf;
  return index;
}

export function CreateSpriteAndAnimate(template: SpriteTemplate, x: number, y: number, subpriority: number): number {
  for (let i = 0; i < MAX_SPRITES; i++) {
    if (!gSprites[i].inUse) {
      const index = createSpriteAt(i, template, x, y, subpriority);
      if (index === MAX_SPRITES) return MAX_SPRITES;
      gSprites[i].callback(gSprites[i]);
      if (gSprites[i].inUse) AnimateSprite(gSprites[i]);
      return index;
    }
  }
  return MAX_SPRITES;
}

export function DestroySprite(sprite: Sprite): void {
  if (!sprite.inUse) return;
  if (!sprite.usingSheet) {
    const end = ((sprite.images?.[0]?.size ?? 0) / TILE_SIZE_4BPP) + sprite.oam.tileNum;
    for (let i = sprite.oam.tileNum; i < end; i++) freeTile(i);
  }
  sprite.reset();
}

export function ResetOamRange(a: number, b: number): void {
  for (let i = a; i < b; i++) Object.assign(gOamBuffer[i], gDummyOamData);
}

/** LoadOam: copy the OAM buffer into OAM (VBlank). */
export function LoadOam(): void {
  if (spriteState.oamLoadDisabled) return;
  const oam = ppu.oam;
  for (let i = 0; i < 128; i++) {
    const o = gOamBuffer[i];
    oam[i * 4] = (o.y & 0xff) | ((o.affineMode & 3) << 8) | ((o.objMode & 3) << 10) | ((o.mosaic & 1) << 12) | ((o.bpp & 1) << 13) | ((o.shape & 3) << 14);
    oam[i * 4 + 1] = (o.x & 0x1ff) | ((o.matrixNum & 0x1f) << 9) | ((o.size & 3) << 14);
    oam[i * 4 + 2] = (o.tileNum & 0x3ff) | ((o.priority & 3) << 10) | ((o.paletteNum & 0xf) << 12);
    oam[i * 4 + 3] = o.affineParam & 0xffff;
  }
}

export function ClearSpriteCopyRequests(): void {
  shouldProcessCopyRequests = false;
  copyRequests = [];
}

function resetOamMatrices(): void {
  for (const m of gOamMatrices) {
    m.a = 0x100; m.b = 0; m.c = 0; m.d = 0x100;
  }
}

export function SetOamMatrix(matrixNum: number, a: number, b: number, c: number, d: number): void {
  const m = gOamMatrices[matrixNum];
  m.a = s16(a); m.b = s16(b); m.c = s16(c); m.d = s16(d);
}

export function CalcCenterToCornerVec(sprite: Sprite, shape: number, size: number, affineMode: number): void {
  let [x, y] = CENTER_TO_CORNER[shape]?.[size] ?? [0, 0];
  if (affineMode & ST_OAM_AFFINE_DOUBLE_MASK) {
    x *= 2;
    y *= 2;
  }
  sprite.centerToCornerVecX = x;
  sprite.centerToCornerVecY = y;
}

export function AllocSpriteTiles(tileCount: number): number {
  if (tileCount === 0) {
    for (let i = spriteState.gReservedSpriteTileCount; i < TOTAL_OBJ_TILE_COUNT; i++) freeTile(i);
    return 0;
  }
  let i = spriteState.gReservedSpriteTileCount;
  let start = 0;
  for (;;) {
    while (isAlloc(i)) {
      i++;
      if (i === TOTAL_OBJ_TILE_COUNT) return -1;
    }
    start = i;
    let found = 1;
    while (found !== tileCount) {
      i++;
      if (i === TOTAL_OBJ_TILE_COUNT) return -1;
      if (!isAlloc(i)) found++;
      else break;
    }
    if (found === tileCount) break;
  }
  for (let t = start; t < start + tileCount; t++) allocTile(t);
  return start;
}

export function SpriteTileAllocBitmapOp(bit: number, op: number): number {
  const index = bit >> 3;
  const shift = bit & 7;
  if (op === 0) gSpriteTileAllocBitmap[index] &= ~(1 << shift);
  else if (op === 1) gSpriteTileAllocBitmap[index] |= 1 << shift;
  else return (1 << shift) & gSpriteTileAllocBitmap[index];
  return 0;
}

export function FreeSpriteTilesIfNotUsingSheet(sprite: Sprite): void {
  if (!sprite.usingSheet) {
    const end = ((sprite.images?.[0]?.size ?? 0) / TILE_SIZE_4BPP) + sprite.oam.tileNum;
    for (let i = sprite.oam.tileNum; i < end; i++) freeTile(i);
  }
}

export function ProcessSpriteCopyRequests(): void {
  if (!shouldProcessCopyRequests) return;
  for (const r of copyRequests) {
    const n = Math.min(r.size, r.src.length);
    ppu.vram.set(r.src.subarray(0, n), r.dest);
  }
  copyRequests = [];
  shouldProcessCopyRequests = false;
}

function requestSpriteFrameImageCopy(index: number, tileNum: number, images: SpriteFrameImage[] | null): void {
  const img = images?.[index];
  if (!img || copyRequests.length >= 64) return;
  copyRequests.push({ src: img.data, dest: OBJ_VRAM0 + TILE_SIZE_4BPP * tileNum, size: img.size });
}

/** RequestSpriteCopy(src, dest (byte offset into VRAM), size) */
export function RequestSpriteCopy(src: Uint8Array, dest: number, size: number): void {
  if (copyRequests.length < 64) copyRequests.push({ src, dest, size });
}

function resetAllSprites(): void {
  for (let i = 0; i < MAX_SPRITES; i++) {
    gSprites[i].reset();
    gSpriteOrder[i] = i;
  }
  gSprites[MAX_SPRITES].reset();
}

export function FreeSpriteTiles(sprite: Sprite): void {
  if (sprite.template.tileTag !== TAG_NONE) FreeSpriteTilesByTag(sprite.template.tileTag);
}

export function FreeSpritePalette(sprite: Sprite): void {
  FreeSpritePaletteByTag(sprite.template.paletteTag);
}

export function FreeSpriteOamMatrix(sprite: Sprite): void {
  if (sprite.oam.affineMode & ST_OAM_AFFINE_ON_MASK) {
    FreeOamMatrix(sprite.oam.matrixNum);
    sprite.oam.affineMode = ST_OAM_AFFINE_OFF;
  }
}

export function DestroySpriteAndFreeResources(sprite: Sprite): void {
  FreeSpriteTiles(sprite);
  FreeSpritePalette(sprite);
  FreeSpriteOamMatrix(sprite);
  DestroySprite(sprite);
}

export function AnimateSprite(sprite: Sprite): void {
  if (sprite.animBeginning) beginAnim(sprite);
  else continueAnim(sprite);
  if (!spriteState.gAffineAnimsDisabled) {
    if (sprite.affineAnimBeginning) beginAffineAnim(sprite);
    else continueAffineAnim(sprite);
  }
}

function cmdAt(sprite: Sprite): AnimCmd {
  return sprite.anims[sprite.animNum]?.[sprite.animCmdIndex] ?? ANIMCMD_END;
}

function applyFrame(sprite: Sprite, cmd: AnimCmd): void {
  let duration = cmd.duration & 0x3f;
  if (duration) duration--;
  sprite.animDelayCounter = duration;
  if (!(sprite.oam.affineMode & ST_OAM_AFFINE_ON_MASK)) setSpriteOamFlipBits(sprite, cmd.hFlip, cmd.vFlip);
  if (sprite.usingSheet) sprite.oam.tileNum = (sprite.sheetTileStart + cmd.imageValue) & 0x3ff;
  else requestSpriteFrameImageCopy(cmd.imageValue, sprite.oam.tileNum, sprite.images);
}

function beginAnim(sprite: Sprite): void {
  sprite.animCmdIndex = 0;
  sprite.animEnded = false;
  sprite.animLoopCounter = 0;
  const cmd = cmdAt(sprite);
  if (cmd.type !== -1) {
    sprite.animBeginning = false;
    applyFrame(sprite, cmd);
  }
}

function continueAnim(sprite: Sprite): void {
  if (sprite.animDelayCounter) {
    if (!sprite.animPaused) sprite.animDelayCounter--;
    const cmd = cmdAt(sprite);
    if (!(sprite.oam.affineMode & ST_OAM_AFFINE_ON_MASK)) setSpriteOamFlipBits(sprite, cmd.hFlip, cmd.vFlip);
  } else if (!sprite.animPaused) {
    sprite.animCmdIndex++;
    const type = cmdAt(sprite).type;
    if (type >= 0) applyFrame(sprite, cmdAt(sprite));
    else if (type === -1) {
      sprite.animCmdIndex--;
      sprite.animEnded = true;
    } else if (type === -2) {
      sprite.animCmdIndex = cmdAt(sprite).target;
      applyFrame(sprite, cmdAt(sprite));
    } else if (type === -3) {
      if (sprite.animLoopCounter) {
        sprite.animLoopCounter--;
      } else {
        sprite.animLoopCounter = cmdAt(sprite).count;
      }
      jumpToTopOfAnimLoop(sprite);
      continueAnim(sprite);
    }
  }
}

function jumpToTopOfAnimLoop(sprite: Sprite): void {
  if (sprite.animLoopCounter) {
    sprite.animCmdIndex--;
    while (sprite.anims[sprite.animNum][sprite.animCmdIndex - 1]?.type !== -3) {
      if (sprite.animCmdIndex === 0) break;
      sprite.animCmdIndex--;
    }
    sprite.animCmdIndex--;
  }
}

function affineCmd(sprite: Sprite, matrixNum: number): AffineAnimCmd {
  const st = sAffineAnimStates[matrixNum];
  return sprite.affineAnims[st.animNum]?.[st.animCmdIndex] ?? AFFINEANIMCMD_END;
}

function beginAffineAnim(sprite: Sprite): void {
  if ((sprite.oam.affineMode & ST_OAM_AFFINE_ON_MASK) && sprite.affineAnims[0]?.[0]?.type !== 0x7fff) {
    const matrixNum = getSpriteMatrixNum(sprite);
    const st = sAffineAnimStates[matrixNum];
    st.animCmdIndex = 0;
    st.delayCounter = 0;
    st.loopCounter = 0;
    const frame = { ...affineCmd(sprite, matrixNum) };
    sprite.affineAnimBeginning = false;
    sprite.affineAnimEnded = false;
    applyAffineAnimFrame(matrixNum, frame);
    st.delayCounter = frame.duration;
    if (sprite.anchored) updateSpriteMatrixAnchorPos(sprite, sprite.data[6], sprite.data[7]);
  }
}

function continueAffineAnim(sprite: Sprite): void {
  if (!(sprite.oam.affineMode & ST_OAM_AFFINE_ON_MASK)) return;
  const matrixNum = getSpriteMatrixNum(sprite);
  const st = sAffineAnimStates[matrixNum];
  if (st.delayCounter) {
    if (!sprite.affineAnimPaused) --st.delayCounter;
    if (!sprite.affineAnimPaused) applyAffineAnimFrameRelativeAndUpdateMatrix(matrixNum, affineCmd(sprite, matrixNum));
  } else if (sprite.affineAnimPaused) {
    return;
  } else {
    st.animCmdIndex++;
    const cmd = affineCmd(sprite, matrixNum);
    const type = cmd.type;
    if (type === 0x7ffd) {
      if (st.loopCounter) st.loopCounter--;
      else st.loopCounter = cmd.count;
      if (st.loopCounter) {
        st.animCmdIndex--;
        while (sprite.affineAnims[st.animNum][st.animCmdIndex - 1]?.type !== 0x7ffd) {
          if (st.animCmdIndex === 0) break;
          st.animCmdIndex--;
        }
        st.animCmdIndex--;
      }
      continueAffineAnim(sprite);
    } else if (type === 0x7ffe) {
      st.animCmdIndex = cmd.target;
      const frame = { ...affineCmd(sprite, matrixNum) };
      applyAffineAnimFrame(matrixNum, frame);
      st.delayCounter = frame.duration;
    } else if (type === 0x7fff) {
      sprite.affineAnimEnded = true;
      st.animCmdIndex--;
      applyAffineAnimFrameRelativeAndUpdateMatrix(matrixNum, AFFINEANIMCMD_FRAME(0, 0, 0, 0));
    } else {
      const frame = { ...cmd };
      applyAffineAnimFrame(matrixNum, frame);
      st.delayCounter = frame.duration;
    }
  }
  if (sprite.anchored) updateSpriteMatrixAnchorPos(sprite, sprite.data[6], sprite.data[7]);
}

function getSpriteMatrixNum(sprite: Sprite): number {
  return sprite.oam.affineMode & ST_OAM_AFFINE_ON_MASK ? sprite.oam.matrixNum : 0;
}

export function SetSpriteMatrixAnchor(sprite: Sprite, x: number, y: number): void {
  sprite.data[6] = x;
  sprite.data[7] = y;
  sprite.anchored = true;
}

function getAnchorCoord(baseDim: number, xformed: number, modifier: number): number {
  const sub = xformed - baseDim;
  const shift = sub < 0 ? -sub >> 9 : -(sub >> 9);
  return modifier - (Math.floor(((modifier * xformed) >>> 0) / (baseDim >>> 0)) + shift);
}

function updateSpriteMatrixAnchorPos(sprite: Sprite, x: number, y: number): void {
  const m = gOamMatrices[sprite.oam.matrixNum & 0x1f];
  if (x !== NO_ANCHOR) {
    const dim = OAM_DIMENSIONS[sprite.oam.shape][sprite.oam.size][0];
    sprite.x2 = getAnchorCoord(dim << 8, Math.trunc((dim << 16) / m.a), x);
  }
  if (y !== NO_ANCHOR) {
    const dim = OAM_DIMENSIONS[sprite.oam.shape][sprite.oam.size][1];
    sprite.y2 = getAnchorCoord(dim << 8, Math.trunc((dim << 16) / m.d), y);
  }
}

function setSpriteOamFlipBits(sprite: Sprite, hFlip: number, vFlip: number): void {
  sprite.oam.matrixNum &= 0x7;
  sprite.oam.matrixNum |= ((hFlip ^ sprite.hFlip) & 1) << 3;
  sprite.oam.matrixNum |= ((vFlip ^ sprite.vFlip) & 1) << 4;
}

function affineAnimStateReset(matrixNum: number): void {
  Object.assign(sAffineAnimStates[matrixNum], { animNum: 0, animCmdIndex: 0, delayCounter: 0, loopCounter: 0, xScale: 0x100, yScale: 0x100, rotation: 0 });
}

function applyAffineAnimFrameRelativeAndUpdateMatrix(matrixNum: number, frame: AffineAnimCmd): void {
  const st = sAffineAnimStates[matrixNum];
  st.xScale = s16(st.xScale + frame.xScale);
  st.yScale = s16(st.yScale + frame.yScale);
  st.rotation = (st.rotation + (frame.rotation << 8)) & 0xff00;
  const m = objAffineSet(convertScaleParam(st.xScale), convertScaleParam(st.yScale), st.rotation);
  Object.assign(gOamMatrices[matrixNum], m);
}

function convertScaleParam(scale: number): number {
  return scale === 0 ? 0 : s16(Math.trunc(0x10000 / scale));
}

/** BIOS ObjAffineSet (one matrix). */
export function objAffineSet(xScale: number, yScale: number, rotation: number): { a: number; b: number; c: number; d: number } {
  const theta = (rotation >> 8) & 0xff;
  const sin = gSineTable[theta];
  const cos = gSineTable[(theta + 64) & 0xff];
  return {
    a: s16((xScale * cos) >> 8),
    b: s16((-xScale * sin) >> 8),
    c: s16((yScale * sin) >> 8),
    d: s16((yScale * cos) >> 8),
  };
}

function applyAffineAnimFrame(matrixNum: number, frame: AffineAnimCmd): void {
  if (frame.duration) {
    frame.duration--;
    applyAffineAnimFrameRelativeAndUpdateMatrix(matrixNum, frame);
  } else {
    const st = sAffineAnimStates[matrixNum];
    st.xScale = frame.xScale;
    st.yScale = frame.yScale;
    st.rotation = (frame.rotation << 8) & 0xffff;
    applyAffineAnimFrameRelativeAndUpdateMatrix(matrixNum, AFFINEANIMCMD_FRAME(0, 0, 0, 0));
  }
}

export function StartSpriteAnim(sprite: Sprite, animNum: number): void {
  sprite.animNum = animNum;
  sprite.animBeginning = true;
  sprite.animEnded = false;
}

export function StartSpriteAnimIfDifferent(sprite: Sprite, animNum: number): void {
  if (sprite.animNum !== animNum) StartSpriteAnim(sprite, animNum);
}

export function SeekSpriteAnim(sprite: Sprite, animCmdIndex: number): void {
  const temp = sprite.animPaused;
  sprite.animCmdIndex = animCmdIndex - 1;
  sprite.animDelayCounter = 0;
  sprite.animBeginning = false;
  sprite.animEnded = false;
  sprite.animPaused = false;
  continueAnim(sprite);
  if (sprite.animDelayCounter) sprite.animDelayCounter++;
  sprite.animPaused = temp;
}

export function StartSpriteAffineAnim(sprite: Sprite, animNum: number): void {
  const m = getSpriteMatrixNum(sprite);
  affineAnimStateReset(m);
  sAffineAnimStates[m].animNum = animNum;
  sprite.affineAnimBeginning = true;
  sprite.affineAnimEnded = false;
}

export function StartSpriteAffineAnimIfDifferent(sprite: Sprite, animNum: number): void {
  if (sAffineAnimStates[getSpriteMatrixNum(sprite)].animNum !== animNum) StartSpriteAffineAnim(sprite, animNum);
}

export function ChangeSpriteAffineAnim(sprite: Sprite, animNum: number): void {
  sAffineAnimStates[getSpriteMatrixNum(sprite)].animNum = animNum;
  sprite.affineAnimBeginning = true;
  sprite.affineAnimEnded = false;
}

export function ChangeSpriteAffineAnimIfDifferent(sprite: Sprite, animNum: number): void {
  if (sAffineAnimStates[getSpriteMatrixNum(sprite)].animNum !== animNum) ChangeSpriteAffineAnim(sprite, animNum);
}

export function SetSpriteSheetFrameTileNum(sprite: Sprite): void {
  if (sprite.usingSheet) {
    let offset = cmdAt(sprite).imageValue;
    if (cmdAt(sprite).type < 0) offset = 0;
    sprite.oam.tileNum = (sprite.sheetTileStart + offset) & 0x3ff;
  }
}

export function ResetAffineAnimData(): void {
  spriteState.gAffineAnimsDisabled = false;
  spriteState.gOamMatrixAllocBitmap = 0;
  resetOamMatrices();
  for (let i = 0; i < OAM_MATRIX_COUNT; i++) affineAnimStateReset(i);
}

export function AllocOamMatrix(): number {
  for (let i = 0; i < OAM_MATRIX_COUNT; i++) {
    const bit = 1 << i;
    if (!(spriteState.gOamMatrixAllocBitmap & bit)) {
      spriteState.gOamMatrixAllocBitmap |= bit;
      return i;
    }
  }
  return 0xff;
}

export function FreeOamMatrix(matrixNum: number): void {
  spriteState.gOamMatrixAllocBitmap &= ~(1 << (matrixNum & 0x1f));
  SetOamMatrix(matrixNum & 0x1f, 0x100, 0, 0, 0x100);
}

export function InitSpriteAffineAnim(sprite: Sprite): void {
  const m = AllocOamMatrix();
  if (m !== 0xff) {
    CalcCenterToCornerVec(sprite, sprite.oam.shape, sprite.oam.size, sprite.oam.affineMode);
    sprite.oam.matrixNum = m;
    sprite.affineAnimBeginning = true;
    affineAnimStateReset(m);
  }
}

export function SetOamMatrixRotationScaling(matrixNum: number, xScale: number, yScale: number, rotation: number): void {
  Object.assign(gOamMatrices[matrixNum], objAffineSet(convertScaleParam(xScale), convertScaleParam(yScale), rotation & 0xffff));
}

export function LoadSpriteSheet(sheet: SpriteSheet): number {
  const start = AllocSpriteTiles(sheet.size / TILE_SIZE_4BPP);
  if (start < 0) return 0;
  AllocSpriteTileRange(sheet.tag, start, sheet.size / TILE_SIZE_4BPP);
  const n = Math.min(sheet.size, sheet.data.length);
  const dest = OBJ_VRAM0 + TILE_SIZE_4BPP * start;
  for (let i = 0; i < n && dest + i < ppu.vram.length; i++) ppu.vram[dest + i] = sheet.data[i];
  return start;
}

export const LoadCompressedSpriteSheet = LoadSpriteSheet;

export function LoadSpriteSheets(sheets: SpriteSheet[]): void {
  for (const sheet of sheets) {
    if (!sheet.data) break;
    LoadSpriteSheet(sheet);
  }
}

export function AllocTilesForSpriteSheet(sheet: SpriteSheet): number {
  const start = AllocSpriteTiles(sheet.size / TILE_SIZE_4BPP);
  if (start < 0) return 0;
  AllocSpriteTileRange(sheet.tag, start, sheet.size / TILE_SIZE_4BPP);
  return start;
}

export function FreeSpriteTilesByTag(tag: number): void {
  const index = indexOfSpriteTileTag(tag);
  if (index !== 0xff) {
    const [start, count] = sSpriteTileRanges[index];
    for (let i = start; i < start + count; i++) freeTile(i);
    sSpriteTileRangeTags[index] = TAG_NONE;
  }
}

export function FreeSpriteTileRanges(): void {
  for (let i = 0; i < MAX_SPRITES; i++) {
    sSpriteTileRangeTags[i] = TAG_NONE;
    sSpriteTileRanges[i] = [0, 0];
  }
}

export function GetSpriteTileStartByTag(tag: number): number {
  const index = indexOfSpriteTileTag(tag);
  return index === 0xff ? TAG_NONE : sSpriteTileRanges[index][0];
}

function indexOfSpriteTileTag(tag: number): number {
  for (let i = 0; i < MAX_SPRITES; i++) if (sSpriteTileRangeTags[i] === tag) return i;
  return 0xff;
}

export function GetSpriteTileTagByTileStart(start: number): number {
  for (let i = 0; i < MAX_SPRITES; i++) if (sSpriteTileRangeTags[i] !== TAG_NONE && sSpriteTileRanges[i][0] === start) return sSpriteTileRangeTags[i];
  return TAG_NONE;
}

function AllocSpriteTileRange(tag: number, start: number, count: number): void {
  const free = indexOfSpriteTileTag(TAG_NONE);
  if (free === 0xff) return;
  sSpriteTileRangeTags[free] = tag;
  sSpriteTileRanges[free] = [start, count];
}

export function FreeAllSpritePalettes(): void {
  spriteState.gReservedSpritePaletteCount = 0;
  sSpritePaletteTags.fill(TAG_NONE);
}

export function LoadSpritePalette(palette: SpritePalette): number {
  let index = IndexOfSpritePaletteTag(palette.tag);
  if (index !== 0xff) return index;
  index = IndexOfSpritePaletteTag(TAG_NONE);
  if (index === 0xff) return 0xff;
  sSpritePaletteTags[index] = palette.tag;
  DoLoadSpritePalette(palette.data, PLTT_ID(index));
  return index;
}

// sprite.c: DoLoadSpritePalette. C receives the palette number as a BG-relative
// color offset; LoadPalette writes the 16-color sprite palette after OBJ_PLTT_OFFSET.
export function DoLoadSpritePalette(src: ArrayLike<number>, paletteOffset: number): void {
  LoadPalette(src, paletteOffset + OBJ_PLTT_OFFSET, PLTT_SIZE_4BPP);
}

export const LoadCompressedSpritePalette = LoadSpritePalette;

export function LoadSpritePalettes(palettes: SpritePalette[]): void {
  for (const p of palettes) {
    if (!p.data) break;
    if (LoadSpritePalette(p) === 0xff) break;
  }
}

export function AllocSpritePalette(tag: number): number {
  const index = IndexOfSpritePaletteTag(TAG_NONE);
  if (index === 0xff) return 0xff;
  sSpritePaletteTags[index] = tag;
  return index;
}

export function IndexOfSpritePaletteTag(tag: number): number {
  for (let i = spriteState.gReservedSpritePaletteCount; i < 16; i++) if (sSpritePaletteTags[i] === tag) return i;
  return 0xff;
}

export function GetSpritePaletteTagByPaletteNum(paletteNum: number): number {
  return sSpritePaletteTags[paletteNum];
}

export function FreeSpritePaletteByTag(tag: number): void {
  const index = IndexOfSpritePaletteTag(tag);
  if (index !== 0xff) sSpritePaletteTags[index] = TAG_NONE;
}

export function SetSubspriteTables(sprite: Sprite, tables: SubspriteTable[]): void {
  sprite.subspriteTables = tables;
  sprite.subspriteTableNum = 0;
  sprite.subspriteMode = SUBSPRITES_ON;
}

export function AddSpriteToOamBuffer(sprite: Sprite, oamIndex: { value: number }): boolean {
  if (oamIndex.value >= spriteState.gOamLimit) return true;
  if (!sprite.subspriteTables || sprite.subspriteMode === SUBSPRITES_OFF) {
    Object.assign(gOamBuffer[oamIndex.value], sprite.oam);
    oamIndex.value++;
    return false;
  }
  return addSubspritesToOamBuffer(sprite, oamIndex);
}

function addSubspritesToOamBuffer(sprite: Sprite, oamIndex: { value: number }): boolean {
  if (oamIndex.value >= spriteState.gOamLimit) return true;
  const table = sprite.subspriteTables?.[sprite.subspriteTableNum];
  const oam = sprite.oam;
  if (!table || !table.subsprites) {
    Object.assign(gOamBuffer[oamIndex.value], oam);
    oamIndex.value++;
    return false;
  }
  const hFlip = (oam.matrixNum >> 3) & 1;
  const vFlip = (oam.matrixNum >> 4) & 1;
  const baseX = (oam.x - sprite.centerToCornerVecX) & 0xffff;
  const baseY = (oam.y - sprite.centerToCornerVecY) & 0xffff;
  for (let i = 0; i < table.subspriteCount; i++, oamIndex.value++) {
    if (oamIndex.value >= spriteState.gOamLimit) return true;
    const sub = table.subsprites[i];
    let x = sub.x & 0xffff;
    let y = sub.y & 0xffff;
    if (hFlip) x = (-(s16(sub.x) + OAM_DIMENSIONS[sub.shape][sub.size][0])) & 0xffff;
    if (vFlip) y = (-(s16(sub.y) + OAM_DIMENSIONS[sub.shape][sub.size][1])) & 0xffff;
    const dest = gOamBuffer[oamIndex.value];
    Object.assign(dest, oam);
    dest.shape = sub.shape;
    dest.size = sub.size;
    dest.x = (s16(baseX) + s16(x)) & 0x1ff;
    dest.y = (baseY + y) & 0xff;
    dest.tileNum = (oam.tileNum + sub.tileOffset) & 0x3ff;
    if (sprite.subspriteMode !== SUBSPRITES_IGNORE_PRIORITY) dest.priority = sub.priority;
  }
  return false;
}
