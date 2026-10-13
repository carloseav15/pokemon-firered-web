// battle_anim_dark.c: Faint Attack fades, Bite, Fake Tears, Memento shadows
// (scanline effects), claw slashes, Metal Claw shine and greyscale palettes.

import * as C from "../../generated/constants";
import { type Task } from "../../gba/tasks";
import { incbin } from "../../hw/assets";
import { GetGpuReg, SetGpuReg, SetGpuRegBits } from "../../hw/gpu";
import { BG_PLTT_ID, BlendPalette, FillPalette, LoadPalette, PLTT_ID, PLTT_SIZE_4BPP, RGB_BLACK } from "../../hw/palette";
import { BLDALPHA_BLEND, REG_OFFSET_BG1VOFS, REG_OFFSET_BG2VOFS } from "../../hw/ppu";
import { gScanlineEffect, gScanlineEffectRegBuffers, SCANLINE_EFFECT_DMACNT_16BIT, ScanlineEffect_SetParams } from "../../hw/scanline";
import { DestroySprite, gSprites, StartSpriteAffineAnim, StartSpriteAnim, type Sprite } from "../../hw/sprite";
import { Sin } from "../../hw/trig";
import { GetMonData, gEnemyParty, playerMon } from "../../pokemon/mon";
import {
  ANIM_ATK_PARTNER, ANIM_ATTACKER, ANIM_DEF_PARTNER, ANIM_TARGET, animState, AnimLoadCompressedBgGfx, AnimLoadCompressedBgTilemap,
  CreateInvisibleSpriteCopy, DestroyAnimSprite, DestroyAnimVisualTask, DestroySpriteAndMatrix, GetAnimBattlerSpriteId,
  GetBattleAnimBg1Data, GetBattlerSpriteBGPriorityRank, GetBattlerSpriteCoord, GetBattlerSpriteCoordAttr, InitAnimArcTranslation,
  InitBattleAnimBg, InitSpriteDataForLinearTranslation, IsBattlerSpriteVisible, MoveBattlerSpriteToBG, ResetBattleAnimBg,
  RunStoredCallbackWhenAnimEnds, SetGreyscaleOrOriginalPalette, StoreSpriteCallbackInData6, TranslateAnimHorizontalArc,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { G, gBattlerPartyIndexes, gBattlerSpriteIds } from "../globals";
import { BG_ANIM_CHAR_BASE_BLOCK, BG_ANIM_PRIORITY, BG_ANIM_SCREEN_SIZE, SetAnimBgAttribute } from "../intro";
import { BATTLE_PARTNER } from "../macros";
import { GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide } from "../util";
import { gBattleAnimArgs, gTasks, IsContest, s16 } from "./common";

const DISPLAY_WIDTH = 240;
const DISPLAY_HEIGHT = 160;
const SPRITE_NONE = 0xff;
const ARG_RET_ID = 7;

const WININ_ALL = C.WININ_WIN0_BG_ALL | C.WININ_WIN0_OBJ | C.WININ_WIN0_CLR | C.WININ_WIN1_BG_ALL | C.WININ_WIN1_OBJ | C.WININ_WIN1_CLR;
const WINOUT_OBJ_ALL = C.WINOUT_WINOBJ_BG_ALL | C.WINOUT_WINOBJ_OBJ | C.WINOUT_WINOBJ_CLR;
const WINOUT_01_ALL = C.WINOUT_WIN01_BG_ALL | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR;

function IsDoubleBattle(): boolean {
  return (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) !== 0;
}

// Unused
function AnimTask_AttackerFadeToInvisible(taskId: number): void {
  const d = gTasks[taskId].data;
  d[0] = gBattleAnimArgs[0];
  const battler = animState.gBattleAnimAttacker;
  d[1] = 16;
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16, 0));
  if (GetBattlerSpriteBGPriorityRank(battler) === 1) SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG1);
  else SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG2);
  gTasks[taskId].func = AnimTask_AttackerFadeToInvisible_Step;
}

function AnimTask_AttackerFadeToInvisible_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  let blendA = (d[1] >> 8) & 0xff;
  let blendB = d[1] & 0xff;
  if (d[2] === (d[0] & 0xff)) {
    ++blendA;
    --blendB;
    d[1] = BLDALPHA_BLEND(blendB & 0xff, blendA & 0xff);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, d[1]);
    d[2] = 0;
    if ((blendA & 0xff) === 16) {
      gSprites[gBattlerSpriteIds[animState.gBattleAnimAttacker]].invisible = true;
      DestroyAnimVisualTask(taskId);
    }
  } else {
    ++d[2];
  }
}

function AnimTask_AttackerFadeFromInvisible(taskId: number): void {
  const d = gTasks[taskId].data;
  d[0] = gBattleAnimArgs[0];
  d[1] = BLDALPHA_BLEND(0, 16);
  gTasks[taskId].func = AnimTask_AttackerFadeFromInvisible_Step;
  SetGpuReg(C.REG_OFFSET_BLDALPHA, d[1]);
}

function AnimTask_AttackerFadeFromInvisible_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  let blendA = (d[1] >> 8) & 0xff;
  let blendB = d[1] & 0xff;
  if (d[2] === (d[0] & 0xff)) {
    blendA = (blendA - 1) & 0xff;
    blendB = (blendB + 1) & 0xff;
    d[1] = (blendA << 8) | blendB;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, d[1]);
    d[2] = 0;
    if (blendA === 0) {
      SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      DestroyAnimVisualTask(taskId);
    }
  } else {
    ++d[2];
  }
}

function AnimTask_InitAttackerFadeFromInvisible(taskId: number): void {
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
  if (GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker) === 1)
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG1);
  else
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG2);
  DestroyAnimVisualTask(taskId);
}

function AnimUnusedBagSteal(sprite: Sprite): void {
  sprite.data[1] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.data[3] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[0] = 0x7e;
  InitSpriteDataForLinearTranslation(sprite);
  sprite.data[3] = -sprite.data[1];
  sprite.data[4] = -sprite.data[2];
  sprite.data[6] = 0xffd8;
  sprite.callback = AnimUnusedBagSteal_Step;
  sprite.callback(sprite);
}

function AnimUnusedBagSteal_Step(sprite: Sprite): void {
  sprite.data[3] += sprite.data[1];
  sprite.data[4] += sprite.data[2];
  sprite.x2 = sprite.data[3] >> 8;
  sprite.y2 = sprite.data[4] >> 8;
  if (sprite.data[7] === 0) {
    sprite.data[3] += sprite.data[1];
    sprite.data[4] += sprite.data[2];
    sprite.x2 = sprite.data[3] >> 8;
    sprite.y2 = sprite.data[4] >> 8;
    --sprite.data[0];
  }
  sprite.y2 += Sin(sprite.data[5], sprite.data[6]);
  sprite.data[5] = (sprite.data[5] + 3) & 0xff;
  if (sprite.data[5] > 0x7f) {
    sprite.data[5] = 0;
    sprite.data[6] += 20;
    ++sprite.data[7];
  }
  if (--sprite.data[0] === 0) DestroyAnimSprite(sprite);
}

// Move sprite inward for Bite/Crunch and Clamp
function AnimBite(sprite: Sprite): void {
  sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  StartSpriteAffineAnim(sprite, gBattleAnimArgs[2]);
  sprite.data[0] = gBattleAnimArgs[3];
  sprite.data[1] = gBattleAnimArgs[4];
  sprite.data[2] = gBattleAnimArgs[5];
  sprite.callback = AnimBite_Step1;
}

function AnimBite_Step1(sprite: Sprite): void {
  sprite.data[4] += sprite.data[0];
  sprite.data[5] += sprite.data[1];
  sprite.x2 = sprite.data[4] >> 8;
  sprite.y2 = sprite.data[5] >> 8;
  if (++sprite.data[3] === sprite.data[2]) sprite.callback = AnimBite_Step2;
}

function AnimBite_Step2(sprite: Sprite): void {
  sprite.data[4] -= sprite.data[0];
  sprite.data[5] -= sprite.data[1];
  sprite.x2 = sprite.data[4] >> 8;
  sprite.y2 = sprite.data[5] >> 8;
  if (--sprite.data[3] === 0) DestroySpriteAndMatrix(sprite);
}

// Launches a tear drop away from the battler. Used by Fake Tears
function AnimTearDrop(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === ANIM_ATTACKER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  let xOffset = 20;
  sprite.oam.tileNum += 4;
  switch (gBattleAnimArgs[1]) {
    case 0:
      sprite.x = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_RIGHT) - 8;
      sprite.y = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_TOP) + 8;
      break;
    case 1:
      sprite.x = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_RIGHT) - 14;
      sprite.y = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_TOP) + 16;
      break;
    case 2:
      sprite.x = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_LEFT) + 8;
      sprite.y = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_TOP) + 8;
      StartSpriteAffineAnim(sprite, 1);
      xOffset = -20;
      break;
    case 3:
      sprite.x = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_LEFT) + 14;
      sprite.y = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_TOP) + 16;
      StartSpriteAffineAnim(sprite, 1);
      xOffset = -20;
      break;
  }
  sprite.data[0] = 32;
  sprite.data[2] = sprite.x + xOffset;
  sprite.data[4] = sprite.y + 12;
  sprite.data[5] = -12;
  InitAnimArcTranslation(sprite);
  sprite.callback = AnimTearDrop_Step;
}

function AnimTearDrop_Step(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) DestroySpriteAndMatrix(sprite);
}

function AnimTask_MoveAttackerMementoShadow(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  const attacker = animState.gBattleAnimAttacker;
  d[7] = GetBattlerSpriteCoord(attacker, C.BATTLER_COORD_Y) + 31;
  d[6] = GetBattlerSpriteCoordAttr(attacker, C.BATTLER_COORD_ATTR_TOP) - 7;
  d[5] = d[7];
  d[4] = d[6];
  d[13] = s16((d[7] - d[6]) << 8);
  const pos = GetBattlerSpriteCoord(attacker, C.BATTLER_COORD_X) & 0xff;
  d[14] = pos - 32;
  d[15] = pos + 32;
  if (GetBattlerSide(attacker) === C.B_SIDE_PLAYER) d[8] = -12;
  else d[8] = -64;
  d[3] = GetBattlerSpriteBGPriorityRank(attacker);
  let dmaDest: number;
  let var0: number;
  if (d[3] === 1) {
    const animBg = GetBattleAnimBg1Data();
    d[10] = G.gBattle_BG1_Y;
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG1);
    FillPalette(RGB_BLACK, BG_PLTT_ID(animBg.paletteId), PLTT_SIZE_4BPP);
    dmaDest = REG_OFFSET_BG1VOFS;
    var0 = C.WINOUT_WIN01_BG1;
    if (!IsContest()) G.gBattle_BG2_X += DISPLAY_WIDTH;
  } else {
    d[10] = G.gBattle_BG2_Y;
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG2);
    FillPalette(RGB_BLACK, BG_PLTT_ID(9), PLTT_SIZE_4BPP);
    dmaDest = REG_OFFSET_BG2VOFS;
    var0 = C.WINOUT_WIN01_BG2;
    if (!IsContest()) G.gBattle_BG1_X += DISPLAY_WIDTH;
  }
  d[11] = 0;
  d[12] = 16;
  d[0] = 0;
  d[1] = 0;
  d[2] = 0;
  SetAllBattlersSpritePriority(3);
  for (let i = 0; i < 112; ++i) {
    gScanlineEffectRegBuffers[0][i] = d[10];
    gScanlineEffectRegBuffers[1][i] = d[10];
  }
  ScanlineEffect_SetParams({ dmaDest, dmaControl: SCANLINE_EFFECT_DMACNT_16BIT, initState: 1, unused9: 0 });
  SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_OBJ_ALL | (var0 ^ WINOUT_01_ALL));
  SetGpuReg(C.REG_OFFSET_WININ, WININ_ALL);
  G.gBattle_WIN0H = (d[14] << 8) | d[15];
  G.gBattle_WIN0V = DISPLAY_HEIGHT;
  task.func = AnimTask_MoveAttackerMementoShadow_Step;
}

function AnimTask_MoveAttackerMementoShadow_Step(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[0]) {
    case 0:
      if (++d[1] > 1) {
        d[1] = 0;
        if (++d[2] & 1) {
          if (d[11] !== 12) ++d[11];
        } else if (d[12] !== 8) {
          --d[12];
        }
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[11], d[12]));
        if (d[11] === 12 && d[12] === 8) ++d[0];
      }
      break;
    case 1:
      d[4] -= 8;
      DoMementoShadowEffect(task);
      if (d[4] < d[8]) ++d[0];
      break;
    case 2:
      d[4] -= 8;
      DoMementoShadowEffect(task);
      d[14] += 4;
      d[15] -= 4;
      if (d[14] >= d[15]) d[14] = d[15];
      G.gBattle_WIN0H = (d[14] << 8) | d[15];
      if (d[14] === d[15]) ++d[0];
      break;
    case 3:
      gScanlineEffect.state = 3;
      ++d[0];
      break;
    case 4:
      DestroyAnimVisualTask(taskId);
      break;
  }
}

function AnimTask_MoveTargetMementoShadow(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  const target = animState.gBattleAnimTarget;
  switch (d[0]) {
    case 0:
      if (IsContest()) {
        G.gBattle_WIN0H = 0;
        G.gBattle_WIN0V = 0;
        SetGpuReg(C.REG_OFFSET_WININ, WININ_ALL);
        SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_OBJ_ALL | WINOUT_01_ALL);
        DestroyAnimVisualTask(taskId);
      } else {
        d[3] = GetBattlerSpriteBGPriorityRank(target);
        if (d[3] === 1) {
          SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG1);
          G.gBattle_BG2_X += DISPLAY_WIDTH;
        } else {
          SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG2);
          G.gBattle_BG1_X += DISPLAY_WIDTH;
        }
        ++d[0];
      }
      break;
    case 1:
      if (d[3] === 1) {
        const animBg = GetBattleAnimBg1Data();
        d[10] = G.gBattle_BG1_Y;
        FillPalette(RGB_BLACK, BG_PLTT_ID(animBg.paletteId), PLTT_SIZE_4BPP);
      } else {
        d[10] = G.gBattle_BG2_Y;
        FillPalette(RGB_BLACK, BG_PLTT_ID(9), PLTT_SIZE_4BPP);
      }
      SetAllBattlersSpritePriority(3);
      ++d[0];
      break;
    case 2: {
      d[7] = GetBattlerSpriteCoord(target, C.BATTLER_COORD_Y) + 31;
      d[6] = GetBattlerSpriteCoordAttr(target, C.BATTLER_COORD_ATTR_TOP) - 7;
      d[13] = s16((d[7] - d[6]) << 8);
      const x = GetBattlerSpriteCoord(target, C.BATTLER_COORD_X) & 0xff;
      d[14] = x - 4;
      d[15] = x + 4;
      if (GetBattlerSide(target) === C.B_SIDE_PLAYER) d[8] = -12;
      else d[8] = -64;
      d[4] = d[8];
      d[5] = d[8];
      d[11] = 12;
      d[12] = 8;
      ++d[0];
      break;
    }
    case 3: {
      const dmaDest = d[3] === 1 ? REG_OFFSET_BG1VOFS : REG_OFFSET_BG2VOFS;
      for (let i = 0; i < 112; ++i) {
        gScanlineEffectRegBuffers[0][i] = d[10] + (159 - i);
        gScanlineEffectRegBuffers[1][i] = d[10] + (159 - i);
      }
      ScanlineEffect_SetParams({ dmaDest, dmaControl: SCANLINE_EFFECT_DMACNT_16BIT, initState: 1, unused9: 0 });
      ++d[0];
      break;
    }
    case 4:
      if (d[3] === 1)
        SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_OBJ_ALL | C.WINOUT_WIN01_BG0 | C.WINOUT_WIN01_BG2 | C.WINOUT_WIN01_BG3 | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR);
      else
        SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_OBJ_ALL | C.WINOUT_WIN01_BG0 | C.WINOUT_WIN01_BG1 | C.WINOUT_WIN01_BG3 | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR);
      SetGpuReg(C.REG_OFFSET_WININ, WININ_ALL);
      G.gBattle_WIN0H = (d[14] << 8) | d[15];
      G.gBattle_WIN0V = DISPLAY_HEIGHT;
      d[0] = 0;
      d[1] = 0;
      d[2] = 0;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(12, 8));
      task.func = AnimTask_MoveTargetMementoShadow_Step;
      break;
  }
}

function AnimTask_MoveTargetMementoShadow_Step(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[0]) {
    case 0:
      d[5] += 8;
      if (d[5] >= d[7]) d[5] = d[7];
      DoMementoShadowEffect(task);
      if (d[5] === d[7]) ++d[0];
      break;
    case 1:
      if (d[15] - d[14] < 0x40) {
        d[14] -= 4;
        d[15] += 4;
      } else {
        d[1] = 1;
      }
      G.gBattle_WIN0H = (d[14] << 8) | d[15];
      d[4] += 8;
      if (d[4] >= d[6]) d[4] = d[6];
      DoMementoShadowEffect(task);
      if (d[4] === d[6] && d[1]) {
        d[1] = 0;
        ++d[0];
      }
      break;
    case 2:
      if (++d[1] > 1) {
        d[1] = 0;
        ++d[2];
        if (d[2] & 1) {
          if (d[11]) --d[11];
        } else if (d[12] < 16) {
          ++d[12];
        }
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[11], d[12]));
        if (d[11] === 0 && d[12] === 16) ++d[0];
      }
      break;
    case 3:
      gScanlineEffect.state = 3;
      ++d[0];
      break;
    case 4:
      G.gBattle_WIN0H = 0;
      G.gBattle_WIN0V = 0;
      SetGpuReg(C.REG_OFFSET_WININ, WININ_ALL);
      SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_OBJ_ALL | WINOUT_01_ALL);
      DestroyAnimVisualTask(taskId);
      break;
  }
}

function DoMementoShadowEffect(task: Task): void {
  const d = task.data;
  const buf = gScanlineEffectRegBuffers[gScanlineEffect.srcBuffer];
  const var2 = s16(d[5] - d[4]);
  if (var2 !== 0) {
    const var0 = Math.trunc(d[13] / var2);
    let var1 = d[6] << 8;
    let i: number;
    for (i = 0; i < d[4]; ++i) buf[i] = d[10] - (i - 159);
    for (i = d[4]; i <= d[5]; ++i) {
      if (i >= 0) {
        const var3 = s16((var1 >> 8) - i);
        buf[i] = var3 + d[10];
      }
      var1 += var0;
    }
    let var4 = d[10] - (i - 159);
    for (; i < d[7]; ++i) if (i >= 0) buf[i] = var4--;
  } else {
    let var4 = d[10] + 159;
    for (let i = 0; i < 112; ++i) {
      gScanlineEffectRegBuffers[0][i] = var4;
      gScanlineEffectRegBuffers[1][i] = var4;
      --var4;
    }
  }
}

function SetAllBattlersSpritePriority(priority: number): void {
  for (let i = 0; i < C.MAX_BATTLERS_COUNT; ++i) {
    const spriteId = GetAnimBattlerSpriteId(i);
    if (spriteId !== SPRITE_NONE) gSprites[spriteId].oam.priority = priority;
  }
}

function AnimTask_InitMementoShadow(taskId: number): void {
  const toBG2 = (GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker) ^ 1) !== 0;
  MoveBattlerSpriteToBG(animState.gBattleAnimAttacker, toBG2);
  gSprites[gBattlerSpriteIds[animState.gBattleAnimAttacker]].invisible = false;
  if (IsBattlerSpriteVisible(BATTLE_PARTNER(animState.gBattleAnimAttacker))) {
    MoveBattlerSpriteToBG(animState.gBattleAnimAttacker ^ 2, !toBG2);
    gSprites[gBattlerSpriteIds[animState.gBattleAnimAttacker ^ 2]].invisible = false;
  }
  DestroyAnimVisualTask(taskId);
}

function AnimTask_MementoHandleBg(taskId: number): void {
  const toBG2 = (GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker) ^ 1) !== 0;
  ResetBattleAnimBg(toBG2);
  if (IsBattlerSpriteVisible(BATTLE_PARTNER(animState.gBattleAnimAttacker))) ResetBattleAnimBg(!toBG2);
  DestroyAnimVisualTask(taskId);
}

// Animates a deep slash from a claw. Used by Metal Claw, Dragon Claw, and Crush Claw
function AnimClawSlash(sprite: Sprite): void {
  sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  StartSpriteAnim(sprite, gBattleAnimArgs[2]);
  sprite.callback = RunStoredCallbackWhenAnimEnds;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Makes the attacker metallic and shining.
// Used by MOVE_HARDEN and MOVE_IRON_DEFENSE.
// arg0: if true won't change battler's palette back
// arg1: if true, use custom color
// arg2: custom color
function AnimTask_MetallicShine(taskId: number): void {
  const attacker = animState.gBattleAnimAttacker;
  let priorityChanged = false;
  G.gBattle_WIN0H = 0;
  G.gBattle_WIN0V = 0;
  SetGpuReg(C.REG_OFFSET_WININ, WININ_ALL);
  SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_OBJ_ALL | C.WINOUT_WIN01_BG0 | C.WINOUT_WIN01_BG2 | C.WINOUT_WIN01_BG3 | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR);
  SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_OBJWIN_ON);
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG1);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(8, 12));
  SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 0);
  SetAnimBgAttribute(1, BG_ANIM_SCREEN_SIZE, 0);
  if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 1);
  if (IsDoubleBattle() && !IsContest()) {
    const pos = GetBattlerPosition(attacker);
    if (pos === C.B_POSITION_OPPONENT_RIGHT || pos === C.B_POSITION_PLAYER_LEFT) {
      if (IsBattlerSpriteVisible(BATTLE_PARTNER(attacker))) {
        gSprites[gBattlerSpriteIds[BATTLE_PARTNER(attacker)]].oam.priority--;
        SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
        priorityChanged = true;
      }
    }
  }
  const species = GetBattlerSide(attacker) !== C.B_SIDE_PLAYER
    ? GetMonData(gEnemyParty[gBattlerPartyIndexes[attacker]], C.MON_DATA_SPECIES)
    : GetMonData(playerMon(gBattlerPartyIndexes[attacker]), C.MON_DATA_SPECIES);
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  const newSpriteId = CreateInvisibleSpriteCopy(attacker, spriteId, species);
  const animBg = GetBattleAnimBg1Data();
  AnimLoadCompressedBgTilemap(animBg.bgId, incbin("gMetalShineTilemap"));
  AnimLoadCompressedBgGfx(animBg.bgId, incbin("gMetalShineGfx"), animBg.tilesOffset);
  LoadPalette(incbin("gMetalShinePalette"), BG_PLTT_ID(animBg.paletteId), PLTT_SIZE_4BPP);
  G.gBattle_BG1_X = -gSprites[spriteId].x + 96;
  G.gBattle_BG1_Y = -gSprites[spriteId].y + 32;
  const paletteNum = 16 + gSprites[spriteId].oam.paletteNum;
  if (gBattleAnimArgs[1] === 0) SetGreyscaleOrOriginalPalette(paletteNum, false);
  else BlendPalette(PLTT_ID(paletteNum), 16, 11, gBattleAnimArgs[2] & 0xffff);
  const d = gTasks[taskId].data;
  d[0] = newSpriteId;
  d[1] = gBattleAnimArgs[0];
  d[2] = gBattleAnimArgs[1];
  d[3] = gBattleAnimArgs[2];
  d[6] = priorityChanged ? 1 : 0;
  gTasks[taskId].func = AnimTask_MetallicShine_Step;
}

function AnimTask_MetallicShine_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  d[10] += 4;
  G.gBattle_BG1_X -= 4;
  if (d[10] === 128) {
    d[10] = 0;
    G.gBattle_BG1_X += 128;
    d[11]++;
    if (d[11] === 2) {
      const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
      const paletteNum = 16 + gSprites[spriteId].oam.paletteNum;
      if (d[1] === 0) SetGreyscaleOrOriginalPalette(paletteNum, true);
      DestroySprite(gSprites[d[0]]);
      const animBg = GetBattleAnimBg1Data();
      InitBattleAnimBg(animBg.bgId);
      if (d[6] === 1) gSprites[gBattlerSpriteIds[BATTLE_PARTNER(animState.gBattleAnimAttacker)]].oam.priority++;
    } else if (d[11] === 3) {
      G.gBattle_WIN0H = 0;
      G.gBattle_WIN0V = 0;
      SetGpuReg(C.REG_OFFSET_WININ, WININ_ALL);
      SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_OBJ_ALL | WINOUT_01_ALL);
      if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 0);
      SetGpuReg(C.REG_OFFSET_DISPCNT, GetGpuReg(C.REG_OFFSET_DISPCNT) ^ C.DISPCNT_OBJWIN_ON);
      SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      DestroyAnimVisualTask(taskId);
    }
  }
}

// Changes battler's palette to either greyscale or original.
// arg0: which battler
// arg1: 0 grayscale, 1 original
function AnimTask_SetGrayscaleOrOriginalPal(taskId: number): void {
  let spriteId = SPRITE_NONE;
  let calcSpriteId = false;
  let position = C.B_POSITION_PLAYER_LEFT;
  switch (gBattleAnimArgs[0]) {
    case ANIM_ATTACKER:
    case ANIM_TARGET:
    case ANIM_ATK_PARTNER:
    case ANIM_DEF_PARTNER:
      spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[0]);
      break;
    case 4: position = C.B_POSITION_PLAYER_LEFT; calcSpriteId = true; break;
    case 5: position = C.B_POSITION_PLAYER_RIGHT; calcSpriteId = true; break;
    case 6: position = C.B_POSITION_OPPONENT_LEFT; calcSpriteId = true; break;
    case 7: position = C.B_POSITION_OPPONENT_RIGHT; calcSpriteId = true; break;
    default: spriteId = SPRITE_NONE; break;
  }
  if (calcSpriteId) {
    const battler = GetBattlerAtPosition(position);
    spriteId = IsBattlerSpriteVisible(battler) ? gBattlerSpriteIds[battler] : SPRITE_NONE;
  }
  if (spriteId !== SPRITE_NONE) SetGreyscaleOrOriginalPalette(gSprites[spriteId].oam.paletteNum + 16, gBattleAnimArgs[1] !== 0);
  DestroyAnimVisualTask(taskId);
}

function GetIsDoomDesireHitTurn(taskId: number): void {
  if (animState.gAnimMoveTurn < 2) gBattleAnimArgs[ARG_RET_ID] = 0;
  if (animState.gAnimMoveTurn === 2) gBattleAnimArgs[ARG_RET_ID] = 1;
  DestroyAnimVisualTask(taskId);
}

registerAnimSpriteCallbacks({ AnimUnusedBagSteal, AnimBite, AnimTearDrop, AnimClawSlash });

registerAnimTasks({
  AnimTask_AttackerFadeToInvisible, AnimTask_AttackerFadeFromInvisible, AnimTask_InitAttackerFadeFromInvisible,
  AnimTask_MoveAttackerMementoShadow, AnimTask_MoveTargetMementoShadow, AnimTask_InitMementoShadow, AnimTask_MementoHandleBg,
  AnimTask_MetallicShine, AnimTask_SetGrayscaleOrOriginalPal, GetIsDoomDesireHitTurn,
});
