// battle_anim_ghost.c: Confuse Ray balls, Night Shade / Nightmare / Spite
// clones, Shadow Ball, Lick, Destiny Bond shadows, the Curse black background
// and nail, ghost status sprites, Grudge flames, the Marowak ghost "Get out"
// scary face and the circular mon movement.

import * as C from "../../generated/constants";
import { incbin, incbin16 } from "../../hw/assets";
import { CopyBgTilemapBufferToVram, CopyToBgTilemapBufferRect_ChangePalette } from "../../hw/bg";
import { ClearGpuRegBits, SetGpuReg, SetGpuRegBits } from "../../hw/gpu";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalette, FillPalette, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette,
  OBJ_PLTT_ID, PLTT_SIZE_4BPP, RGB, RGB_BLACK,
} from "../../hw/palette";
import { BLDALPHA_BLEND } from "../../hw/ppu";
import { gScanlineEffect, ScanlineEffect_InitWave } from "../../hw/scanline";
import {
  AllocSpritePalette, CreateSprite, DestroySprite, FreeSpritePaletteByTag, gSprites, MAX_SPRITES, SpriteCallbackDummy,
  ST_OAM_HFLIP, ST_OAM_OBJ_BLEND, ST_OAM_OBJ_NORMAL, type Sprite,
} from "../../hw/sprite";
import { Cos, gSineTable, Sin } from "../../hw/trig";
import {
  ANIM_ATTACKER, ANIM_TARGET, animState, AnimLoadCompressedBgGfx, AnimTranslateLinear, CloneBattlerSpriteWithBlend, DestroyAnimSprite,
  DestroyAnimSpriteAndDisableBlend, DestroyAnimVisualTask, DestroySpriteAndMatrix, DestroySpriteWithActiveSheet,
  GetAnimBattlerSpriteId, GetBattleAnimBgData, GetBattlePalettesMask, GetBattlerSpriteBGPriority, GetBattlerSpriteBGPriorityRank,
  GetBattlerSpriteCoord, GetBattlerSpriteCoordAttr, GetBattlerSpriteSubpriority, GetBattlerYCoordWithElevation,
  InitAnimLinearTranslationWithSpeed, InitBattleAnimBg, InitSpritePosToAnimAttacker, InitSpritePosToAnimTarget,
  IsBattlerSpriteVisible, PrepareBattlerSpriteForRotScale, RelocateBattleBgPal, ResetSpriteRotScale, SetSpriteRotScale,
  StoreSpriteCallbackInData6, TranslateSpriteLinearFixedPoint, WaitAnimForDuration,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { G, gBattlerSpriteIds, gBattleSpritesDataPtr } from "../globals";
import { BG_ANIM_CHAR_BASE_BLOCK, BG_ANIM_PRIORITY, BG_ANIM_SCREEN_SIZE, SetAnimBgAttribute } from "../intro";
import { GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, PlaySE, PlaySE12WithPanning, s16 } from "./common";

const WIN_RANGE = (a: number, b: number) => ((a << 8) | b) & 0xffff;
const BLDALPHA_BLEND2 = (target1: number, target2: number) => target1 | (target2 << 8);
const WININ_ALL = C.WININ_WIN0_BG_ALL | C.WININ_WIN0_OBJ | C.WININ_WIN0_CLR | C.WININ_WIN1_BG_ALL | C.WININ_WIN1_OBJ | C.WININ_WIN1_CLR;

// Unused
function AnimConfuseRayBallBounce(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[1] = sprite.x;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  InitAnimLinearTranslationWithSpeed(sprite);
  sprite.callback = AnimConfuseRayBallBounce_Step1;
  sprite.data[6] = 16;
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, sprite.data[6]);
}

function AnimConfuseRayBallBounce_Step1(sprite: Sprite): void {
  UpdateConfuseRayBallBlend(sprite);
  if (AnimTranslateLinear(sprite)) {
    sprite.callback = AnimConfuseRayBallBounce_Step2;
    return;
  }
  sprite.x2 += Sin(sprite.data[5], 10);
  sprite.y2 += Cos(sprite.data[5], 15);
  const r2 = sprite.data[5];
  sprite.data[5] = (sprite.data[5] + 5) & 0xff;
  const r0 = sprite.data[5];
  if (r2 !== 0 && r2 <= 196) return;
  if (r0 <= 0) return;
  PlaySE12WithPanning(C.SE_M_CONFUSE_RAY, animState.gAnimCustomPanning);
}

function AnimConfuseRayBallBounce_Step2(sprite: Sprite): void {
  sprite.data[0] = 1;
  AnimTranslateLinear(sprite);
  sprite.x2 += Sin(sprite.data[5], 10);
  sprite.y2 += Cos(sprite.data[5], 15);
  const r2 = sprite.data[5];
  sprite.data[5] = (sprite.data[5] + 5) & 0xff;
  const r0 = sprite.data[5];
  if ((r2 === 0 || r2 > 196) && r0 > 0) PlaySE(C.SE_M_CONFUSE_RAY);
  if (sprite.data[6] === 0) {
    sprite.invisible = true;
    sprite.callback = DestroyAnimSpriteAndDisableBlend;
  } else {
    UpdateConfuseRayBallBlend(sprite);
  }
}

function UpdateConfuseRayBallBlend(sprite: Sprite): void {
  if (sprite.data[6] > 0xff) {
    if (++sprite.data[6] === 0x10d) sprite.data[6] = 0;
    return;
  }
  const r0 = sprite.data[7];
  ++sprite.data[7];
  if ((r0 & 0xff) === 0) {
    sprite.data[7] &= 0xff00;
    if ((sprite.data[7] & 0x100) !== 0) ++sprite.data[6];
    else --sprite.data[6];
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[6], 16 - sprite.data[6]));
    if (sprite.data[6] === 0 || sprite.data[6] === 16) sprite.data[7] ^= 0x100;
    if (sprite.data[6] === 0) sprite.data[6] = 0x100;
  }
}

function AnimConfuseRayBallSpiral(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, true);
  sprite.callback = AnimConfuseRayBallSpiral_Step;
  sprite.callback(sprite);
}

function AnimConfuseRayBallSpiral_Step(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[0], 32);
  sprite.y2 = Cos(sprite.data[0], 8);
  const temp1 = (sprite.data[0] - 65) & 0xffff;
  if (temp1 <= 130) sprite.oam.priority = 2;
  else sprite.oam.priority = 1;
  sprite.data[0] = (sprite.data[0] + 19) & 0xff;
  sprite.data[2] += 80;
  sprite.y2 += sprite.data[2] >> 8;
  sprite.data[7] += 1;
  if (sprite.data[7] === 61) DestroyAnimSprite(sprite);
}

// Creates a large transparent clone of the attacker centered on their position which shrinks to original size
function AnimTask_NightShadeClone(taskId: number): void {
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 0x10));
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  PrepareBattlerSpriteForRotScale(spriteId, ST_OAM_OBJ_BLEND);
  SetSpriteRotScale(spriteId, 128, 128, 0);
  gSprites[spriteId].invisible = false;
  const d = gTasks[taskId].data;
  d[0] = 128;
  d[1] = gBattleAnimArgs[0];
  d[2] = 0;
  d[3] = 16;
  gTasks[taskId].func = AnimTask_NightShadeClone_Step1;
}

function AnimTask_NightShadeClone_Step1(taskId: number): void {
  const d = gTasks[taskId].data;
  d[10] += 1;
  if (d[10] === 3) {
    d[10] = 0;
    d[2] += 1;
    d[3] -= 1;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[2], d[3]));
    if (d[2] !== 9) return;
    gTasks[taskId].func = AnimTask_NightShadeClone_Step2;
  }
}

function AnimTask_NightShadeClone_Step2(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[1] > 0) {
    d[1] -= 1;
    return;
  }
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  d[0] += 8;
  if (d[0] <= 0xff) {
    SetSpriteRotScale(spriteId, d[0], d[0], 0);
  } else {
    ResetSpriteRotScale(spriteId);
    DestroyAnimVisualTask(taskId);
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
  }
}

// Spins a sprite towards the target, pausing in the middle.
// Used in Shadow Ball.
function AnimShadowBall(sprite: Sprite): void {
  const oldPosX = sprite.x;
  const oldPosY = sprite.y;
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[0] = 0;
  sprite.data[1] = gBattleAnimArgs[0];
  sprite.data[2] = gBattleAnimArgs[1];
  sprite.data[3] = gBattleAnimArgs[2];
  sprite.data[4] = sprite.x << 4;
  sprite.data[5] = sprite.y << 4;
  sprite.data[6] = Math.trunc(((oldPosX - sprite.x) << 4) / (gBattleAnimArgs[0] << 1));
  sprite.data[7] = Math.trunc(((oldPosY - sprite.y) << 4) / (gBattleAnimArgs[0] << 1));
  sprite.callback = AnimShadowBall_Step;
}

function AnimShadowBall_Step(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      sprite.data[4] += sprite.data[6];
      sprite.data[5] += sprite.data[7];
      sprite.x = sprite.data[4] >> 4;
      sprite.y = sprite.data[5] >> 4;
      sprite.data[1] -= 1;
      if (sprite.data[1] > 0) break;
      sprite.data[0] += 1;
      break;
    case 1:
      sprite.data[2] -= 1;
      if (sprite.data[2] > 0) break;
      sprite.data[1] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
      sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
      sprite.data[4] = sprite.x << 4;
      sprite.data[5] = sprite.y << 4;
      sprite.data[6] = Math.trunc(((sprite.data[1] - sprite.x) << 4) / sprite.data[3]);
      sprite.data[7] = Math.trunc(((sprite.data[2] - sprite.y) << 4) / sprite.data[3]);
      sprite.data[0] += 1;
      break;
    case 2:
      sprite.data[4] += sprite.data[6];
      sprite.data[5] += sprite.data[7];
      sprite.x = sprite.data[4] >> 4;
      sprite.y = sprite.data[5] >> 4;
      sprite.data[3] -= 1;
      if (sprite.data[3] > 0) break;
      sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
      sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
      sprite.data[0] += 1;
      break;
    case 3:
      DestroySpriteAndMatrix(sprite);
      break;
  }
}

function AnimLick(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, true);
  sprite.callback = AnimLick_Step;
}

function AnimLick_Step(sprite: Sprite): void {
  let r5 = false;
  let r6 = false;
  if (sprite.animEnded) {
    if (!sprite.invisible) sprite.invisible = true;
    switch (sprite.data[0]) {
      default:
        r6 = true;
        break;
      case 0:
        if (sprite.data[1] === 2) r5 = true;
        break;
      case 1:
        if (sprite.data[1] === 4) r5 = true;
        break;
    }
    if (r5) {
      sprite.invisible = !sprite.invisible;
      ++sprite.data[2];
      sprite.data[1] = 0;
      if (sprite.data[2] === 5) {
        sprite.data[2] = 0;
        ++sprite.data[0];
      }
    } else if (r6) {
      DestroyAnimSprite(sprite);
    } else {
      ++sprite.data[1];
    }
  }
}

// Creates a transparent clone of the target which drifts up and away to the side
function AnimTask_NightmareClone(taskId: number): void {
  const d = gTasks[taskId].data;
  d[0] = CloneBattlerSpriteWithBlend(ANIM_TARGET);
  if (d[0] < 0) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  d[1] = 0;
  d[2] = 15;
  d[3] = 2;
  d[4] = 0;
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[2], d[3]));
  const clone = gSprites[d[0]];
  clone.data[0] = 80;
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) {
    clone.data[1] = -144;
    clone.data[2] = 112;
  } else {
    clone.data[1] = 144;
    clone.data[2] = -112;
  }
  clone.data[3] = 0;
  clone.data[4] = 0;
  StoreSpriteCallbackInData6(clone, SpriteCallbackDummy);
  clone.callback = TranslateSpriteLinearFixedPoint;
  gTasks[taskId].func = AnimTask_NightmareClone_Step;
}

function AnimTask_NightmareClone_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[4]) {
    case 0:
      d[1] += 1;
      d[5] = d[1] & 3;
      if (d[5] === 1) if (d[2] > 0) d[2] -= 1;
      if (d[5] === 3) if (d[3] <= 15) d[3] += 1;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[2], d[3]));
      if (d[3] !== 16 || d[2] !== 0) break;
      if (d[1] <= 80) break;
      DestroySpriteWithActiveSheet(gSprites[d[0]]);
      d[4] = 1;
      break;
    case 1:
      if (++d[6] <= 1) break;
      SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      d[4] += 1;
      break;
    case 2:
      DestroyAnimVisualTask(taskId);
      break;
  }
}

// Creates a blended copy of the target that wavers in front of them
function AnimTask_SpiteTargetShadow(taskId: number): void {
  gTasks[taskId].data[15] = 0;
  gTasks[taskId].func = AnimTask_SpiteTargetShadow_Step1;
  gTasks[taskId].func(taskId);
}

function AnimTask_SpiteTargetShadow_Step1(taskId: number): void {
  const d = gTasks[taskId].data;
  const position = GetBattlerSpriteBGPriorityRank(animState.gBattleAnimTarget);
  switch (d[15]) {
    case 0:
      d[14] = AllocSpritePalette(C.ANIM_TAG_BENT_SPOON);
      if (d[14] === 0xff || d[14] === 0xf) {
        DestroyAnimVisualTask(taskId);
      } else {
        d[0] = CloneBattlerSpriteWithBlend(1);
        if (d[0] < 0) {
          FreeSpritePaletteByTag(C.ANIM_TAG_BENT_SPOON);
          DestroyAnimVisualTask(taskId);
        } else {
          const clone = gSprites[d[0]];
          clone.oam.paletteNum = d[14];
          clone.oam.objMode = ST_OAM_OBJ_NORMAL;
          clone.oam.priority = 3;
          clone.invisible = !!gBattleSpritesDataPtr.battlerData[animState.gBattleAnimTarget].invisible;
          d[1] = 0;
          d[2] = 0;
          d[3] = 16;
          d[13] = GetAnimBattlerSpriteId(ANIM_TARGET);
          d[4] = OBJ_PLTT_ID(gSprites[d[13]].oam.paletteNum);
          const mask2 = position === 1 ? C.DISPCNT_BG1_ON : C.DISPCNT_BG2_ON;
          ClearGpuRegBits(C.REG_OFFSET_DISPCNT, mask2);
          ++d[15];
        }
      }
      break;
    case 1:
      d[14] = OBJ_PLTT_ID(d[14]);
      gPlttBufferFaded.set(gPlttBufferUnfaded.subarray(d[4], d[4] + 16), d[14]);
      BlendPalette(d[4], 16, 10, RGB(13, 0, 15));
      ++d[15];
      break;
    case 2: {
      let startLine = s16(gSprites[d[13]].y + gSprites[d[13]].y2 - 32);
      if (startLine < 0) startLine = 0;
      if (position === 1) d[10] = ScanlineEffect_InitWave(startLine, startLine + 64, 2, 6, 0, 4, 1);
      else d[10] = ScanlineEffect_InitWave(startLine, startLine + 64, 2, 6, 0, 8, 1);
      ++d[15];
      break;
    }
    case 3:
      if (position === 1) SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL | C.BLDCNT_TGT1_BG1);
      else SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL | C.BLDCNT_TGT1_BG2);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 0x10));
      ++d[15];
      break;
    case 4:
      if (position === 1) SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG1_ON);
      else SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG2_ON);
      gTasks[taskId].func = AnimTask_SpiteTargetShadow_Step2;
      ++d[15];
      break;
    default:
      ++d[15];
      break;
  }
}

function AnimTask_SpiteTargetShadow_Step2(taskId: number): void {
  const d = gTasks[taskId].data;
  ++d[1];
  d[5] = d[1] & 1;
  if (d[5] === 0) d[2] = Math.trunc(gSineTable[d[1]] / 18);
  if (d[5] === 1) d[3] = 16 - Math.trunc(gSineTable[d[1]] / 18);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[2], d[3]));
  if (d[1] === 128) {
    d[15] = 0;
    gTasks[taskId].func = AnimTask_SpiteTargetShadow_Step3;
    gTasks[taskId].func(taskId);
  }
}

function AnimTask_SpiteTargetShadow_Step3(taskId: number): void {
  const d = gTasks[taskId].data;
  const rank = GetBattlerSpriteBGPriorityRank(animState.gBattleAnimTarget);
  switch (d[15]) {
    case 0:
      gScanlineEffect.state = 3;
      d[14] = GetAnimBattlerSpriteId(ANIM_TARGET);
      if (rank === 1) ClearGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG1_ON);
      else ClearGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG2_ON);
      break;
    case 1:
      BlendPalette(d[4], 16, 0, RGB(13, 0, 15));
      break;
    case 2:
      gSprites[d[14]].invisible = true;
      DestroySpriteWithActiveSheet(gSprites[d[0]]);
      FreeSpritePaletteByTag(C.ANIM_TAG_BENT_SPOON);
      SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      if (rank === 1) SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG1_ON);
      else SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG2_ON);
      DestroyAnimVisualTask(taskId);
      break;
  }
  ++d[15];
}

function AnimDestinyBondWhiteShadow(sprite: Sprite): void {
  let battler1X: number, battler1Y: number, battler2X: number, battler2Y: number;
  const { gBattleAnimAttacker, gBattleAnimTarget } = animState;
  if (gBattleAnimArgs[0] === 0) {
    battler1X = GetBattlerSpriteCoord(gBattleAnimAttacker, C.BATTLER_COORD_X);
    battler1Y = GetBattlerSpriteCoord(gBattleAnimAttacker, C.BATTLER_COORD_Y) + 28;
    battler2X = GetBattlerSpriteCoord(gBattleAnimTarget, C.BATTLER_COORD_X);
    battler2Y = GetBattlerSpriteCoord(gBattleAnimTarget, C.BATTLER_COORD_Y) + 28;
  } else {
    battler1X = GetBattlerSpriteCoord(gBattleAnimTarget, C.BATTLER_COORD_X);
    battler1Y = GetBattlerSpriteCoord(gBattleAnimTarget, C.BATTLER_COORD_Y) + 28;
    battler2X = GetBattlerSpriteCoord(gBattleAnimAttacker, C.BATTLER_COORD_X);
    battler2Y = GetBattlerSpriteCoord(gBattleAnimAttacker, C.BATTLER_COORD_Y) + 28;
  }
  const yDiff = s16(battler2Y - battler1Y);
  sprite.data[0] = battler1X * 16;
  sprite.data[1] = battler1Y * 16;
  sprite.data[2] = Math.trunc(((battler2X - battler1X) * 16) / gBattleAnimArgs[1]);
  sprite.data[3] = Math.trunc((yDiff * 16) / gBattleAnimArgs[1]);
  sprite.data[4] = gBattleAnimArgs[1];
  sprite.data[5] = battler2X;
  sprite.data[6] = battler2Y;
  sprite.data[7] = Math.trunc(sprite.data[4] / 2);
  sprite.oam.priority = 2;
  sprite.x = battler1X;
  sprite.y = battler1Y;
  sprite.callback = AnimDestinyBondWhiteShadow_Step;
  sprite.invisible = true;
}

function AnimDestinyBondWhiteShadow_Step(sprite: Sprite): void {
  if (sprite.data[4]) {
    sprite.data[0] += sprite.data[2];
    sprite.data[1] += sprite.data[3];
    sprite.x = sprite.data[0] >> 4;
    sprite.y = sprite.data[1] >> 4;
    if (--sprite.data[4] === 0) sprite.data[0] = 0;
  }
}

function AnimTask_DestinyBondWhiteShadow(taskId: number): void {
  const d = gTasks[taskId].data;
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 0x10));
  d[5] = 0;
  d[6] = 0;
  d[7] = 0;
  d[8] = 0;
  d[9] = 16;
  d[10] = gBattleAnimArgs[0];
  const attacker = animState.gBattleAnimAttacker;
  const baseX = s16(GetBattlerSpriteCoord(attacker, C.BATTLER_COORD_X_2));
  const baseY = s16(GetBattlerSpriteCoordAttr(attacker, C.BATTLER_COORD_ATTR_BOTTOM));
  const setup = (spriteId: number, x: number, y: number) => {
    const s = gSprites[spriteId];
    s.data[0] = baseX << 4;
    s.data[1] = baseY << 4;
    s.data[2] = Math.trunc(((x - baseX) << 4) / gBattleAnimArgs[1]);
    s.data[3] = Math.trunc(((y - baseY) << 4) / gBattleAnimArgs[1]);
    s.data[4] = gBattleAnimArgs[1];
    s.data[5] = x;
    s.data[6] = y;
    s.callback = AnimDestinyBondWhiteShadow_Step;
  };
  if (!IsContest()) {
    for (let battler = 0; battler < C.MAX_BATTLERS_COUNT; ++battler) {
      if (battler !== attacker && battler !== (attacker ^ 2) && IsBattlerSpriteVisible(battler)) {
        const spriteId = CreateSprite(animTemplate("gDestinyBondWhiteShadowSpriteTemplate"), baseX, baseY, 55);
        if (spriteId !== MAX_SPRITES) {
          const x = s16(GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2));
          const y = s16(GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_BOTTOM));
          setup(spriteId, x, y);
          d[d[12] + 13] = spriteId;
          ++d[12];
        }
      }
    }
  } else {
    const spriteId = CreateSprite(animTemplate("gDestinyBondWhiteShadowSpriteTemplate"), baseX, baseY, 55);
    if (spriteId !== MAX_SPRITES) {
      setup(spriteId, 48, 40);
      d[13] = spriteId;
      d[12] = 1;
    }
  }
  gTasks[taskId].func = AnimTask_DestinyBondWhiteShadow_Step;
}

function AnimTask_DestinyBondWhiteShadow_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0:
      if (d[6] === 0) {
        if (++d[5] > 1) {
          d[5] = 0;
          ++d[7];
          if (d[7] & 1) {
            if (d[8] < 16) ++d[8];
          } else if (d[9]) {
            --d[9];
          }
          SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[8], d[9]));
          if (d[7] >= 24) {
            d[7] = 0;
            d[6] = 1;
          }
        }
      }
      if (d[10]) --d[10];
      else if (d[6]) ++d[0];
      break;
    case 1:
      if (++d[5] > 1) {
        d[5] = 0;
        ++d[7];
        if (d[7] & 1) {
          if (d[8]) --d[8];
        } else if (d[9] < 16) {
          ++d[9];
        }
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[8], d[9]));
        if (d[8] === 0 && d[9] === 16) {
          for (let i = 0; i < d[12]; ++i) DestroySprite(gSprites[d[i + 13]]);
          ++d[0];
        }
      }
      break;
    case 2:
      if (++d[5] > 0) ++d[0];
      break;
    case 3:
      SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      DestroyAnimVisualTask(taskId);
      break;
  }
}

function AnimTask_CurseStretchingBlackBg(taskId: number): void {
  G.gBattle_WIN0H = 0;
  G.gBattle_WIN0V = 0;
  SetGpuReg(C.REG_OFFSET_WININ, WININ_ALL);
  SetGpuReg(C.REG_OFFSET_WINOUT, C.WINOUT_WIN01_BG_ALL | C.WINOUT_WIN01_OBJ | C.WINOUT_WINOBJ_BG_ALL | C.WINOUT_WINOBJ_OBJ | C.WINOUT_WINOBJ_CLR);
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG3 | C.BLDCNT_EFFECT_DARKEN);
  SetGpuReg(C.REG_OFFSET_BLDY, 16);
  const startX = GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER || IsContest() ? 40 : 200;
  G.gBattle_WIN0H = WIN_RANGE(startX, startX);
  const startY = 40;
  G.gBattle_WIN0V = WIN_RANGE(startY, startY);
  const d = gTasks[taskId].data;
  d[1] = startX; // leftDistance
  d[2] = 240 - startX; // rightDistance
  d[3] = startY; // topDistance
  d[4] = 72; // bottomDistance
  d[5] = startX;
  d[6] = startY;
  gTasks[taskId].func = AnimTask_CurseStretchingBlackBg_Step1;
}

function AnimTask_CurseStretchingBlackBg_Step1(taskId: number): void {
  const d = gTasks[taskId].data;
  const step = d[0];
  ++d[0];
  const leftDistance = d[1];
  const rightDistance = d[2];
  const topDistance = d[3];
  const bottomDistance = d[4];
  const startX = d[5];
  const startY = d[6];
  let left: number, right: number, top: number, bottom: number;
  if (step < 16) {
    left = Math.trunc(startX - leftDistance * 0.0625 * step) & 0xffff;
    right = Math.trunc(startX + rightDistance * 0.0625 * step) & 0xffff;
    top = Math.trunc(startY - topDistance * 0.0625 * step) & 0xffff;
    bottom = Math.trunc(startY + bottomDistance * 0.0625 * step) & 0xffff;
  } else {
    left = 0;
    right = 240;
    top = 0;
    bottom = 112;
    const selectedPalettes = GetBattlePalettesMask(true, false, false, false, false, false, false) & 0xffff;
    BeginNormalPaletteFade(selectedPalettes, 0, 16, 16, RGB(0, 0, 0));
    gTasks[taskId].func = AnimTask_CurseStretchingBlackBg_Step2;
  }
  G.gBattle_WIN0H = WIN_RANGE(left, right);
  G.gBattle_WIN0V = WIN_RANGE(top, bottom);
}

function AnimTask_CurseStretchingBlackBg_Step2(taskId: number): void {
  if (!gPaletteFade.active) {
    G.gBattle_WIN0H = 0;
    G.gBattle_WIN0V = 0;
    SetGpuReg(C.REG_OFFSET_WININ, WININ_ALL);
    SetGpuReg(C.REG_OFFSET_WINOUT, C.WINOUT_WIN01_BG_ALL | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR | C.WINOUT_WINOBJ_BG_ALL | C.WINOUT_WINOBJ_OBJ | C.WINOUT_WINOBJ_CLR);
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    SetGpuReg(C.REG_OFFSET_BLDY, 0);
    DestroyAnimVisualTask(taskId);
  }
}

function AnimCurseNail(sprite: Sprite): void {
  let xDelta: number, xDelta2: number;
  InitSpritePosToAnimAttacker(sprite, true);
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
    xDelta = 24;
    xDelta2 = -2;
    sprite.oam.matrixNum = ST_OAM_HFLIP;
  } else {
    xDelta = -24;
    xDelta2 = 2;
  }
  sprite.x += xDelta;
  sprite.data[1] = xDelta2;
  sprite.data[0] = 60;
  sprite.callback = AnimCurseNail_Step1;
}

function AnimCurseNail_Step1(sprite: Sprite): void {
  if (sprite.data[0] > 0) {
    --sprite.data[0];
  } else {
    sprite.x2 += sprite.data[1];
    const var0 = (sprite.x2 + 7) & 0xffff;
    if (var0 > 14) {
      sprite.x += sprite.x2;
      sprite.x2 = 0;
      sprite.oam.tileNum += 8;
      if (++sprite.data[2] === 3) {
        sprite.data[0] = 30;
        sprite.callback = WaitAnimForDuration;
        StoreSpriteCallbackInData6(sprite, AnimCurseNail_Step2);
      } else {
        sprite.data[0] = 40;
      }
    }
  }
}

function AnimCurseNail_Step2(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16, 0));
    ++sprite.data[0];
    sprite.data[1] = 0;
    sprite.data[2] = 0;
  } else if (sprite.data[1] < 2) {
    ++sprite.data[1];
  } else {
    sprite.data[1] = 0;
    ++sprite.data[2];
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND2(16 - sprite.data[2], sprite.data[2]));
    if (sprite.data[2] === 16) {
      sprite.invisible = true;
      sprite.callback = AnimCurseNail_End;
    }
  }
}

function AnimCurseNail_End(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
  G.gBattle_WIN0H = 0;
  G.gBattle_WIN0V = 0;
  DestroyAnimSprite(sprite);
}

function AnimGhostStatusSprite(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[0], 12);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x2 = -sprite.x2;
  sprite.data[0] = (sprite.data[0] + 6) & 0xff;
  sprite.data[1] += 0x100;
  sprite.y2 = -(sprite.data[1] >> 8);
  ++sprite.data[7];
  if (sprite.data[7] === 1) {
    sprite.data[6] = 0x050b;
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, sprite.data[6]);
  } else if (sprite.data[7] > 30) {
    ++sprite.data[2];
    let coeffB = (sprite.data[6] >> 8) & 0xffff;
    let coeffA = sprite.data[6] & 0xff;
    if (++coeffB > 16) coeffB = 16;
    coeffA = (coeffA - 1) & 0xffff;
    if (s16(coeffA) < 0) coeffA = 0;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(coeffA, coeffB));
    sprite.data[6] = BLDALPHA_BLEND(coeffA, coeffB);
    if (coeffB === 16 && coeffA === 0) {
      sprite.invisible = true;
      sprite.callback = AnimGhostStatusSprite_End;
    }
  }
}

function AnimGhostStatusSprite_End(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
  DestroyAnimSprite(sprite);
}

function AnimTask_GrudgeFlames(taskId: number): void {
  const d = gTasks[taskId].data;
  const attacker = animState.gBattleAnimAttacker;
  d[0] = 0;
  d[1] = 16;
  d[9] = GetBattlerSpriteCoord(attacker, C.BATTLER_COORD_X_2);
  d[10] = GetBattlerYCoordWithElevation(attacker);
  d[11] = Math.trunc(GetBattlerSpriteCoordAttr(attacker, C.BATTLER_COORD_ATTR_WIDTH) / 2) + 8;
  d[7] = 0;
  d[5] = GetBattlerSpriteBGPriority(attacker);
  d[6] = GetBattlerSpriteSubpriority(attacker) - 2;
  d[3] = 0;
  d[4] = 16;
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 0x10));
  d[8] = 0;
  gTasks[taskId].func = AnimTask_GrudgeFlames_Step;
}

function AnimTask_GrudgeFlames_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0:
      for (let i = 0; i < 6; ++i) {
        const spriteId = CreateSprite(animTemplate("gGrudgeFlameSpriteTemplate"), d[9], d[10], d[6] & 0xff);
        if (spriteId !== MAX_SPRITES) {
          const s = gSprites[spriteId];
          s.data[0] = taskId;
          s.data[1] = GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER ? 1 : 0;
          s.data[2] = (i * 42) & 0xff;
          s.data[3] = d[11];
          s.data[5] = i * 6;
          ++d[7];
        }
      }
      ++d[0];
      break;
    case 1:
      if (++d[1] & 1) {
        if (d[3] < 14) ++d[3];
      } else if (d[4] > 4) {
        --d[4];
      }
      if (d[3] === 14 && d[4] === 4) {
        d[1] = 0;
        ++d[0];
      }
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[3], d[4]));
      break;
    case 2:
      if (++d[1] > 30) {
        d[1] = 0;
        ++d[0];
      }
      break;
    case 3:
      if (++d[1] & 1) {
        if (d[3] > 0) --d[3];
      } else if (d[4] < 16) {
        ++d[4];
      }
      if (d[3] === 0 && d[4] === 16) {
        d[8] = 1;
        ++d[0];
      }
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[3], d[4]));
      break;
    case 4:
      if (d[7] === 0) ++d[0];
      break;
    case 5:
      SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      DestroyAnimVisualTask(taskId);
      break;
  }
}

function AnimGrudgeFlame(sprite: Sprite): void {
  if (sprite.data[1] === 0) sprite.data[2] += 2;
  else sprite.data[2] -= 2;
  sprite.data[2] &= 0xff;
  sprite.x2 = Sin(sprite.data[2], sprite.data[3]);
  const index = (sprite.data[2] - 65) & 0xffff;
  if (index < 127) sprite.oam.priority = gTasks[sprite.data[0]].data[5] + 1;
  else sprite.oam.priority = gTasks[sprite.data[0]].data[5];
  ++sprite.data[5];
  sprite.data[6] = (sprite.data[5] * 8) & 0xff;
  sprite.y2 = Sin(sprite.data[6], 7);
  if (gTasks[sprite.data[0]].data[8]) {
    --gTasks[sprite.data[0]].data[7];
    DestroySprite(sprite);
  }
}

// Used by the ghost Marowak when it hasn't been revealed by the Silph Scope.
// Animates a shimmering copy of the attacker (the ghost) accompanied by the 'Scary Face' graphics
function AnimTask_GhostGetOut(taskId: number): void {
  gTasks[taskId].data[15] = 0;
  gTasks[taskId].func = AnimTask_GhostGetOut_Step1;
  gTasks[taskId].func(taskId);
}

function AnimTask_GhostGetOut_Step1(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  const rank = GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker);
  switch (d[15]) {
    case 0:
      SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 2);
      SetAnimBgAttribute(2, BG_ANIM_PRIORITY, 1);
      d[1] = 0;
      d[2] = 0;
      d[3] = 16;
      d[4] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
      d[5] = gSprites[d[4]].oam.priority;
      d[6] = OBJ_PLTT_ID(gSprites[d[4]].oam.paletteNum);
      gSprites[d[4]].oam.objMode = ST_OAM_OBJ_BLEND;
      gSprites[d[4]].oam.priority = 3;
      d[7] = BG_PLTT_ID(8);
      break;
    case 1:
      ++d[1];
      if (d[1] & 1) return;
      BlendPalette(d[6], 0x10, d[2], RGB(0, 23, 25));
      BlendPalette(d[7], 0x10, d[2], RGB(0, 23, 25));
      if (d[2] <= 11) {
        ++d[2];
        return;
      }
      d[1] = 0;
      d[2] = 0;
      SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG2 | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 0x10));
      break;
    case 2: {
      SetAnimBgAttribute(2, BG_ANIM_CHAR_BASE_BLOCK, 1);
      SetAnimBgAttribute(2, BG_ANIM_SCREEN_SIZE, 0);
      G.gBattle_BG2_X = 0;
      G.gBattle_BG2_Y = 0;
      SetGpuReg(C.REG_OFFSET_BG2HOFS, G.gBattle_BG2_X);
      SetGpuReg(C.REG_OFFSET_BG2VOFS, G.gBattle_BG2_Y);
      const animBgData = GetBattleAnimBgData(2);
      AnimLoadCompressedBgGfx(animBgData.bgId, incbin("gBattleAnim_ScaryFaceGfx"), animBgData.tilesOffset);
      LoadPalette(incbin("gBattleAnim_ScaryFacePal"), BG_PLTT_ID(animBgData.paletteId), PLTT_SIZE_4BPP);
      break;
    }
    case 3: {
      const animBgData = GetBattleAnimBgData(2);
      // gMonSpritesGfxPtr->multiUseBuffer holds the decompressed tilemap for this step only.
      const buffer = new Uint16Array(0x1000);
      buffer.set(incbin16("gBattleAnimBgTilemap_ScaryFacePlayer").subarray(0, 0x1000));
      RelocateBattleBgPal(animBgData.paletteId, buffer, 256, false);
      CopyToBgTilemapBufferRect_ChangePalette(animBgData.bgId, buffer, 0, 0, 0x20, 0x20, 0x11);
      CopyBgTilemapBufferToVram(2);
      break;
    }
    case 4:
      ++d[1];
      if (d[1] & 1) return;
      ++d[2];
      --d[3];
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[2], d[3]));
      if (d[3]) return;
      d[1] = 0;
      d[2] = 0;
      d[3] = 16;
      SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG1 | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 0x10));
      SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
      SetAnimBgAttribute(2, BG_ANIM_PRIORITY, 2);
      break;
    case 5:
      if (rank === 1) ClearGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG1_ON);
      else ClearGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG2_ON);
      break;
    case 6: {
      let y = s16(gSprites[d[4]].y + gSprites[d[4]].y2 - 0x20);
      if (y < 0) y = 0;
      if (rank === 1) d[10] = ScanlineEffect_InitWave(y, y + 0x40, 4, 8, 0, 4, 1);
      else d[10] = ScanlineEffect_InitWave(y, y + 0x40, 4, 8, 0, 8, 1);
      break;
    }
    case 7:
      BlendPalette(d[7], 0x10, 0xc, RGB(31, 31, 29));
      if (rank === 1) SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG1_ON);
      else SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG2_ON);
      task.func = AnimTask_GhostGetOut_Step2;
      d[15] = 0;
      break;
  }
  ++d[15];
}

function AnimTask_GhostGetOut_Step2(taskId: number): void {
  const d = gTasks[taskId].data;
  ++d[1];
  d[8] = d[1] & 1;
  if (!d[8]) d[2] = Math.trunc(gSineTable[d[1]] / 18);
  if (d[8] === 1) d[3] = 16 - Math.trunc(gSineTable[d[1]] / 18);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[2], d[3]));
  if (d[1] === 128) {
    d[15] = 0;
    gTasks[taskId].func = AnimTask_GhostGetOut_Step3;
    gTasks[taskId].func(taskId);
  }
}

function AnimTask_GhostGetOut_Step3(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[15]) {
    case 0:
      gScanlineEffect.state = 3;
      BlendPalette(d[7], 0x10, 0xc, RGB(0, 23, 25));
      break;
    case 1:
      SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG2 | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0x10, 0));
      d[2] = 16;
      d[3] = 0;
      break;
    case 2:
      --d[2];
      ++d[3];
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[2], d[3]));
      if (d[3] <= 15) return;
      SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 2);
      SetAnimBgAttribute(2, BG_ANIM_PRIORITY, 2);
      break;
    case 3:
      InitBattleAnimBg(2);
      FillPalette(RGB_BLACK, BG_PLTT_ID(9), PLTT_SIZE_4BPP);
      SetAnimBgAttribute(2, BG_ANIM_CHAR_BASE_BLOCK, 0);
      d[1] = 12;
      break;
    case 4:
      BlendPalette(d[6], 0x10, d[1], RGB(0, 23, 25));
      BlendPalette(d[7], 0x10, d[1], RGB(0, 23, 25));
      if (d[1]) {
        --d[1];
        return;
      }
      d[1] = 0;
      SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG2 | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 0x10));
      break;
    case 5:
      gSprites[d[4]].oam.priority = d[5];
      gSprites[d[4]].oam.objMode = ST_OAM_OBJ_NORMAL;
      SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
      SetAnimBgAttribute(2, BG_ANIM_PRIORITY, 1);
      SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_NONE);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      DestroyAnimVisualTask(taskId);
      break;
  }
  ++d[15];
}

function AnimMonMoveCircular(sprite: Sprite): void {
  sprite.invisible = true;
  sprite.data[5] = gBattlerSpriteIds[animState.gBattleAnimAttacker];
  sprite.data[0] = 128;
  sprite.data[1] = 10;
  sprite.data[2] = gBattleAnimArgs[0];
  sprite.data[3] = gBattleAnimArgs[1];
  sprite.callback = AnimMonMoveCircular_Step;
  gSprites[sprite.data[5]].y += 8;
}

function AnimMonMoveCircular_Step(sprite: Sprite): void {
  const mon = gSprites[sprite.data[5]];
  if (sprite.data[3]) {
    --sprite.data[3];
    mon.x2 = Sin(sprite.data[0], sprite.data[1]);
    mon.y2 = Cos(sprite.data[0], sprite.data[1]);
    sprite.data[0] += sprite.data[2];
    if (sprite.data[0] > 255) sprite.data[0] -= 256;
  } else {
    mon.x2 = 0;
    mon.y2 = 0;
    mon.y -= 8;
    sprite.callback = DestroySpriteAndMatrix;
  }
}

registerAnimSpriteCallbacks({
  AnimConfuseRayBallBounce, AnimConfuseRayBallSpiral, AnimShadowBall, AnimLick, AnimDestinyBondWhiteShadow, AnimCurseNail,
  AnimGhostStatusSprite, AnimGrudgeFlame, AnimMonMoveCircular,
});

registerAnimTasks({
  AnimTask_NightShadeClone, AnimTask_NightmareClone, AnimTask_SpiteTargetShadow, AnimTask_DestinyBondWhiteShadow,
  AnimTask_CurseStretchingBlackBg, AnimTask_GrudgeFlames, AnimTask_GhostGetOut,
});
