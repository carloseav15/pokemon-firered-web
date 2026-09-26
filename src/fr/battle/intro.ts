// battle_intro.c: the terrain slide-in at battle start, plus the BGxCNT helpers used by battle animations.

import * as C from "../generated/constants";
import { tasks } from "../gba/tasks";
import { BG_ATTR_CHARBASEINDEX, BG_SCREEN_SIZE, LoadBgTilemap, LoadBgTiles, SetBgAttribute } from "../hw/bg";
import { GetGpuReg, SetGpuReg } from "../hw/gpu";
import {
  BGCNT_16COLOR, BGCNT_CHARBASE, BGCNT_PRIORITY, BGCNT_SCREENBASE, BGCNT_TXT256x512, BGCNT_TXT512x256, BLDALPHA_BLEND, BLDCNT_EFFECT_BLEND,
  BLDCNT_TGT1_BG1, BLDCNT_TGT2_BG3, BLDCNT_TGT2_OBJ, ppu, REG_OFFSET_BG0CNT, REG_OFFSET_BG1CNT, REG_OFFSET_BG2CNT, REG_OFFSET_BG3CNT,
  REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_WININ, REG_OFFSET_WINOUT, WININ_WIN0_BG_ALL, WININ_WIN0_CLR,
  WININ_WIN0_OBJ, WININ_WIN1_BG_ALL, WININ_WIN1_CLR, WININ_WIN1_OBJ, WINOUT_WIN01_BG1, WINOUT_WIN01_BG2, WINOUT_WIN01_BG_ALL, WINOUT_WIN01_CLR,
  WINOUT_WIN01_OBJ, WINOUT_WINOBJ_BG_ALL, WINOUT_WINOBJ_CLR, WINOUT_WINOBJ_OBJ,
} from "../hw/ppu";
import { gScanlineEffect, gScanlineEffectRegBuffers } from "../hw/scanline";
import { gSprites, ST_OAM_OBJ_WINDOW } from "../hw/sprite";
import { Cos2 } from "../hw/trig";
import { G, gBattleMonForms, gBattleStruct, gMonSpritesGfxPtr } from "./globals";
import { GetBattlerAtPosition } from "./util";

export const BG_ANIM_SCREEN_SIZE = 0;
export const BG_ANIM_AREA_OVERFLOW_MODE = 1;
export const BG_ANIM_MOSAIC = 2;
export const BG_ANIM_CHAR_BASE_BLOCK = 3;
export const BG_ANIM_PRIORITY = 4;
export const BG_ANIM_PALETTES_MODE = 5;
export const BG_ANIM_SCREEN_BASE_BLOCK = 6;

const gBattleAnimRegOffsBgCnt = [REG_OFFSET_BG0CNT, REG_OFFSET_BG1CNT, REG_OFFSET_BG2CNT, REG_OFFSET_BG3CNT];
const gBattleIntroRegOffsBgCnt = gBattleAnimRegOffsBgCnt;
const BG_SCREEN_ADDR = (n: number) => n * BG_SCREEN_SIZE;

// struct BgCnt bit layout: priority:2 charBaseBlock:2 dummy:2 mosaic:1 palettes:1 screenBaseBlock:5 areaOverflowMode:1 screenSize:2
const BGCNT_FIELDS: Record<number, [number, number]> = {
  [BG_ANIM_PRIORITY]: [0, 2],
  [BG_ANIM_CHAR_BASE_BLOCK]: [2, 2],
  [BG_ANIM_MOSAIC]: [6, 1],
  [BG_ANIM_PALETTES_MODE]: [7, 1],
  [BG_ANIM_SCREEN_BASE_BLOCK]: [8, 5],
  [BG_ANIM_AREA_OVERFLOW_MODE]: [13, 1],
  [BG_ANIM_SCREEN_SIZE]: [14, 2],
};

export function SetAnimBgAttribute(bgId: number, attributeId: number, value: number): void {
  if (bgId >= 4) return;
  let bgCnt = GetGpuReg(gBattleAnimRegOffsBgCnt[bgId]);
  const field = BGCNT_FIELDS[attributeId];
  if (field) {
    const [shift, bits] = field;
    const mask = ((1 << bits) - 1) << shift;
    bgCnt = (bgCnt & ~mask) | ((value << shift) & mask);
  }
  SetGpuReg(gBattleAnimRegOffsBgCnt[bgId], bgCnt);
}

export function GetAnimBgAttribute(bgId: number, attributeId: number): number {
  if (bgId >= 4) return 0;
  const bgCnt = GetGpuReg(gBattleIntroRegOffsBgCnt[bgId]);
  const field = BGCNT_FIELDS[attributeId];
  if (!field) return 0;
  const [shift, bits] = field;
  return (bgCnt >> shift) & ((1 << bits) - 1);
}

const sBattleIntroSlideFuncs = [
  BattleIntroSlide1, // BATTLE_TERRAIN_GRASS
  BattleIntroSlide1, // BATTLE_TERRAIN_LONG_GRASS
  BattleIntroSlide2, // BATTLE_TERRAIN_SAND
  BattleIntroSlide2, // BATTLE_TERRAIN_UNDERWATER
  BattleIntroSlide2, // BATTLE_TERRAIN_WATER
  BattleIntroSlide1, // BATTLE_TERRAIN_POND
  BattleIntroSlide1, // BATTLE_TERRAIN_MOUNTAIN
  BattleIntroSlide1, // BATTLE_TERRAIN_CAVE
  BattleIntroSlide3, // BATTLE_TERRAIN_BUILDING
  BattleIntroSlide3, // BATTLE_TERRAIN_PLAIN
];

export function HandleIntroSlide(terrain: number): void {
  let taskId: number;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) {
    taskId = tasks.create(BattleIntroSlideLink, 0);
  } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_KYOGRE_GROUDON) {
    // gGameVersion != VERSION_RUBY is always true in FireRed
    terrain = C.BATTLE_TERRAIN_UNDERWATER;
    taskId = tasks.create(BattleIntroSlide2, 0);
  } else {
    taskId = tasks.create(sBattleIntroSlideFuncs[terrain], 0);
  }
  const d = tasks.tasks[taskId].data;
  d[0] = 0;
  d[1] = terrain;
  d[2] = d[3] = d[4] = d[5] = d[6] = 0;
}

export function BattleIntroSlideEnd(taskId: number): void {
  tasks.destroy(taskId);
  G.gBattle_BG1_X = 0;
  G.gBattle_BG1_Y = 0;
  G.gBattle_BG2_X = 0;
  G.gBattle_BG2_Y = 0;
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  SetGpuReg(REG_OFFSET_BLDALPHA, 0);
  SetGpuReg(REG_OFFSET_BLDY, 0);
  SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_BG_ALL | WININ_WIN0_OBJ | WININ_WIN0_CLR | WININ_WIN1_BG_ALL | WININ_WIN1_OBJ | WININ_WIN1_CLR);
  SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG_ALL | WINOUT_WIN01_OBJ | WINOUT_WIN01_CLR | WINOUT_WINOBJ_BG_ALL | WINOUT_WINOBJ_OBJ | WINOUT_WINOBJ_CLR);
}

const u16 = (v: number) => v & 0xffff;
const s16 = (v: number) => (v << 16) >> 16;

/** Common "open the window and split the background" steps shared by all slides. */
function slideScanlines(d: number[]): void {
  const buf = gScanlineEffectRegBuffers[gScanlineEffect.srcBuffer];
  let i = 0;
  for (; i < 80; i++) buf[i] = d[2];
  while (i < 160) buf[i++] = -d[2];
}

function finishSlide(d: number[], clearScreen28: boolean): void {
  gScanlineEffect.state = 3;
  d[0]++;
  if (clearScreen28) ppu.vram.fill(0, BG_SCREEN_ADDR(28), BG_SCREEN_ADDR(28) + BG_SCREEN_SIZE);
  SetBgAttribute(1, BG_ATTR_CHARBASEINDEX, 0);
  SetBgAttribute(2, BG_ATTR_CHARBASEINDEX, 0);
  SetGpuReg(REG_OFFSET_BG1CNT, BGCNT_PRIORITY(0) | BGCNT_CHARBASE(0) | BGCNT_16COLOR | BGCNT_SCREENBASE(28) | BGCNT_TXT256x512);
  SetGpuReg(REG_OFFSET_BG2CNT, BGCNT_PRIORITY(0) | BGCNT_CHARBASE(0) | BGCNT_16COLOR | BGCNT_SCREENBASE(30) | BGCNT_TXT512x256);
}

function slideStart(d: number[]): void {
  d[2] = G.gBattleTypeFlags & C.BATTLE_TYPE_LINK ? 16 : 1;
  d[0]++;
}

function slideOpenWindow(d: number[]): void {
  if (--d[2] === 0) {
    d[0]++;
    SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_BG_ALL | WININ_WIN0_OBJ | WININ_WIN0_CLR);
  }
}

/** Returns true when the window has fully opened (case 2). */
function slideGrowWindow(d: number[]): boolean {
  G.gBattle_WIN0V = u16(G.gBattle_WIN0V - 0xff);
  if ((G.gBattle_WIN0V & 0xff00) === 0x3000) {
    d[0]++;
    d[2] = 240;
    d[3] = 32;
    G.gIntroSlideFlags &= ~1;
    return true;
  }
  return false;
}

function slideShrinkWindowAndSplit(d: number[]): void {
  if (G.gBattle_WIN0V & 0xff00) G.gBattle_WIN0V = u16(G.gBattle_WIN0V - 0x3fc);
  if (d[2]) d[2] -= 2;
  slideScanlines(d);
}

function BattleIntroSlide1(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  G.gBattle_BG1_X = u16(G.gBattle_BG1_X + 6);
  switch (d[0]) {
    case 0: slideStart(d); break;
    case 1: slideOpenWindow(d); break;
    case 2: slideGrowWindow(d); break;
    case 3:
      if (d[3]) {
        d[3]--;
      } else if (d[1] === 1) {
        if (G.gBattle_BG1_Y !== 0xffb0) G.gBattle_BG1_Y = u16(G.gBattle_BG1_Y - 2);
      } else if (G.gBattle_BG1_Y !== 0xffc8) {
        G.gBattle_BG1_Y = u16(G.gBattle_BG1_Y - 1);
      }
      slideShrinkWindowAndSplit(d);
      if (!d[2]) finishSlide(d, true);
      break;
    case 4:
      BattleIntroSlideEnd(taskId);
      break;
  }
}

function BattleIntroSlide2(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  switch (d[1]) {
    case 2:
    case 4:
      G.gBattle_BG1_X = u16(G.gBattle_BG1_X + 8);
      break;
    case 3:
      G.gBattle_BG1_X = u16(G.gBattle_BG1_X + 6);
      break;
  }
  if (d[1] === 4) {
    G.gBattle_BG1_Y = u16(Math.trunc(Cos2(d[6]) / 512) - 8);
    if (d[6] < 180) d[6] += 4;
    else d[6] += 6;
    if (d[6] === 360) d[6] = 0;
  }
  switch (d[0]) {
    case 0:
      d[4] = 16;
      slideStart(d);
      break;
    case 1: slideOpenWindow(d); break;
    case 2:
      if (slideGrowWindow(d)) d[5] = 1;
      break;
    case 3:
      if (d[3]) {
        if (--d[3] === 0) {
          SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG1 | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_BG3 | BLDCNT_TGT2_OBJ);
          SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(15, 0));
          SetGpuReg(REG_OFFSET_BLDY, 0);
        }
      } else if (d[4] & 0x1f && --d[5] === 0) {
        d[4] = s16(d[4] + 0xff);
        d[5] = 4;
      }
      slideShrinkWindowAndSplit(d);
      if (!d[2]) finishSlide(d, true);
      break;
    case 4:
      BattleIntroSlideEnd(taskId);
      break;
  }
  if (d[0] !== 4) SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[4], 0));
}

function BattleIntroSlide3(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  G.gBattle_BG1_X = u16(G.gBattle_BG1_X + 8);
  switch (d[0]) {
    case 0:
      SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG1 | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_BG3 | BLDCNT_TGT2_OBJ);
      SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(8, 8));
      SetGpuReg(REG_OFFSET_BLDY, 0);
      d[4] = BLDALPHA_BLEND(8, 8);
      slideStart(d);
      break;
    case 1: slideOpenWindow(d); break;
    case 2:
      if (slideGrowWindow(d)) d[5] = 1;
      break;
    case 3:
      if (d[3]) {
        d[3]--;
      } else if (d[4] & 0xf && --d[5] === 0) {
        d[4] = s16(d[4] + 0xff);
        d[5] = 6;
      }
      slideShrinkWindowAndSplit(d);
      if (!d[2]) finishSlide(d, true);
      break;
    case 4:
      BattleIntroSlideEnd(taskId);
      break;
  }
  if (d[0] !== 4) SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[4], 0));
}

function BattleIntroSlideLink(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  if (d[0] > 1 && !d[4]) {
    const var0 = G.gBattle_BG1_X & 0x8000;
    if (var0 || G.gBattle_BG1_X < 80) {
      G.gBattle_BG1_X = u16(G.gBattle_BG1_X + 3);
      G.gBattle_BG2_X = u16(G.gBattle_BG2_X - 3);
    } else {
      ppu.vram.fill(0, BG_SCREEN_ADDR(28), BG_SCREEN_ADDR(28) + BG_SCREEN_SIZE);
      ppu.vram.fill(0, BG_SCREEN_ADDR(30), BG_SCREEN_ADDR(30) + BG_SCREEN_SIZE);
      d[4] = 1;
    }
  }
  switch (d[0]) {
    case 0:
      d[2] = 32;
      d[0]++;
      break;
    case 1:
      if (--d[2] === 0) {
        d[0]++;
        // Link "VS" letters (not used outside link battles).
        for (const id of [gBattleStruct.linkBattleVsSpriteId_V, gBattleStruct.linkBattleVsSpriteId_S]) gSprites[id].oam.objMode = ST_OAM_OBJ_WINDOW;
        SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_BG_ALL | WININ_WIN0_OBJ | WININ_WIN0_CLR);
        SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WINOBJ_BG_ALL | WINOUT_WINOBJ_OBJ | WINOUT_WINOBJ_CLR | WINOUT_WIN01_BG1 | WINOUT_WIN01_BG2);
      }
      break;
    case 2:
      slideGrowWindow(d);
      break;
    case 3:
      slideShrinkWindowAndSplit(d);
      if (!d[2]) finishSlide(d, false);
      break;
    case 4:
      BattleIntroSlideEnd(taskId);
      break;
  }
}

/** Copies a battler's current sprite frame into a BG (tiles + an 8x8 tilemap block). */
export function CopyBattlerSpriteToBg(bgId: number, x: number, y: number, battlerPosition: number, palno: number, tilesDest: Uint8Array, tilemapDest: Uint16Array, tilesOffset: number): void {
  const battler = GetBattlerAtPosition(battlerPosition);
  let offset = tilesOffset;
  const src = gMonSpritesGfxPtr.sprites[battlerPosition];
  const start = BG_SCREEN_SIZE * gBattleMonForms[battler];
  tilesDest.set(src.subarray(start, start + BG_SCREEN_SIZE));
  LoadBgTiles(bgId, tilesDest, 0x1000, tilesOffset);
  for (let i = y; i < y + 8; i++) for (let j = x; j < x + 8; j++) tilemapDest[i * 32 + j] = (offset++ | (palno << 12)) & 0xffff;
  LoadBgTilemap(bgId, tilemapDest, BG_SCREEN_SIZE, 0);
}

/** battle_intro.c DrawBattlerOnBgDMA (unused in FireRed): copy one form's 8x8 tiles and map entries directly into VRAM. */
export function DrawBattlerOnBgDMA(arg0: number, arg1: number, battlerPosition: number, arg3: number, arg4: number, arg5: number, arg6: number, arg7: number): void {
  const source = gMonSpritesGfxPtr.sprites[battlerPosition]!;
  const sourceOffset = BG_SCREEN_SIZE * arg3;
  ppu.vram.set(source.subarray(sourceOffset, sourceOffset + BG_SCREEN_SIZE), arg5);

  let offset = (arg5 >> 5) - (arg7 << 9);
  const bgVram = new Uint16Array(ppu.vram.buffer);
  for (let i = arg1; i < arg1 + 8; i++) {
    for (let j = arg0; j < arg0 + 8; j++) {
      bgVram[i * 32 + j + (arg6 << 10)] = (offset++ | (arg4 << 12)) & 0xffff;
    }
  }
}
