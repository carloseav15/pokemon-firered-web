// battle_anim_electric.c: Thunder / Thunderbolt / Thunder Wave bolts and sparks,
// charging particles (Charge, Shock Wave), Zap Cannon, Volt Tackle orbs and bolts
// and the Shock Wave progressing bolt / lightning tasks.

import * as C from "../../generated/constants";
import { type Task } from "../../gba/tasks";
import { cdata } from "../../hw/assets";
import {
  CreateSprite, DestroySprite, FreeOamMatrix, gOamMatrices, gSprites, MAX_SPRITES, ST_OAM_HFLIP, ST_OAM_VFLIP,
  StartSpriteAffineAnim, StartSpriteAnim, type Sprite,
} from "../../hw/sprite";
import { Cos, gSineTable, Sin } from "../../hw/trig";
import {
  ANIM_ATK_PARTNER, ANIM_ATTACKER, ANIM_DEF_PARTNER, ANIM_TARGET, animState, AnimTranslateLinear, DestroyAnimSprite,
  DestroyAnimVisualTask, DestroySpriteAndMatrix, GetAnimBattlerSpriteId, GetBattlerSpriteBGPriority, GetBattlerSpriteCoord,
  GetBattlerSpriteSubpriority, InitAnimLinearTranslation, InitSpritePosToAnimAttacker, InitSpritePosToAnimTarget,
  IsBattlerSpriteVisible, RunStoredCallbackWhenAffineAnimEnds, RunStoredCallbackWhenAnimEnds, StoreSpriteCallbackInData6,
  TranslateSpriteInCircle, WaitAnimForDuration,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { BattleAnimAdjustPanning } from "../animScript";
import { BATTLE_PARTNER } from "../macros";
import { GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, PlaySE12WithPanning, s16 } from "./common";
import { DestroyAnimSpriteAfterTimer } from "./flying";

// SPRITE_SHAPE()/SPRITE_SIZE() for the two bolt segment sizes.
const SHAPE_8x16 = 2;
const SIZE_8x16 = 0;
const SHAPE_16x16 = 0;
const SIZE_16x16 = 1;

function AnimLightning(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x -= gBattleAnimArgs[0];
  else sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  sprite.callback = AnimLightning_Step;
}

function AnimLightning_Step(sprite: Sprite): void {
  if (sprite.animEnded) DestroyAnimSprite(sprite);
}

function AnimUnusedSpinningFist(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x -= gBattleAnimArgs[0];
  else sprite.x += gBattleAnimArgs[0];
  sprite.callback = AnimUnusedSpinningFist_Step;
}

function AnimUnusedSpinningFist_Step(sprite: Sprite): void {
  if (sprite.affineAnimEnded) DestroySpriteAndMatrix(sprite);
}

function AnimUnusedCirclingShock(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.x -= gBattleAnimArgs[0];
    sprite.y -= gBattleAnimArgs[1];
  } else {
    sprite.x += gBattleAnimArgs[0];
    sprite.y += gBattleAnimArgs[1];
  }
  sprite.data[0] = 0;
  sprite.data[1] = gBattleAnimArgs[2];
  sprite.data[2] = gBattleAnimArgs[3];
  sprite.data[3] = gBattleAnimArgs[4];
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = TranslateSpriteInCircle;
}

function AnimSparkElectricity(sprite: Sprite): void {
  const { gBattleAnimAttacker, gBattleAnimTarget } = animState;
  let battler: number;
  switch (gBattleAnimArgs[4]) {
    case ANIM_ATTACKER:
      battler = gBattleAnimAttacker;
      break;
    case ANIM_TARGET:
    default:
      battler = gBattleAnimTarget;
      break;
    case ANIM_ATK_PARTNER:
      battler = !IsBattlerSpriteVisible(BATTLE_PARTNER(gBattleAnimAttacker)) ? gBattleAnimAttacker : BATTLE_PARTNER(gBattleAnimAttacker);
      break;
    case ANIM_DEF_PARTNER:
      battler = IsBattlerSpriteVisible(BATTLE_PARTNER(gBattleAnimAttacker)) ? BATTLE_PARTNER(gBattleAnimTarget) : gBattleAnimTarget;
      break;
  }
  if (gBattleAnimArgs[5] === 0) {
    sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X);
    sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y);
  } else {
    sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2);
    sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET);
  }
  sprite.x2 = (gSineTable[gBattleAnimArgs[0]] * gBattleAnimArgs[1]) >> 8;
  sprite.y2 = (gSineTable[gBattleAnimArgs[0] + 64] * gBattleAnimArgs[1]) >> 8;
  if (gBattleAnimArgs[6] & 1) sprite.oam.priority = GetBattlerSpriteBGPriority(battler) + 1;
  const matrixNum = sprite.oam.matrixNum;
  const sineVal = gSineTable[gBattleAnimArgs[2]];
  gOamMatrices[matrixNum].a = gOamMatrices[matrixNum].d = gSineTable[gBattleAnimArgs[2] + 64];
  gOamMatrices[matrixNum].b = sineVal;
  gOamMatrices[matrixNum].c = s16(-sineVal);
  sprite.data[0] = gBattleAnimArgs[3];
  sprite.callback = DestroyAnimSpriteAfterTimer;
}

function AnimZapCannonSpark(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[3];
  sprite.data[1] = sprite.x;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  InitAnimLinearTranslation(sprite);
  sprite.data[5] = gBattleAnimArgs[2];
  sprite.data[6] = gBattleAnimArgs[5];
  sprite.data[7] = gBattleAnimArgs[4];
  sprite.oam.tileNum += gBattleAnimArgs[6] * 4;
  sprite.callback = AnimZapCannonSpark_Step;
  sprite.callback(sprite);
}

function AnimZapCannonSpark_Step(sprite: Sprite): void {
  if (!AnimTranslateLinear(sprite)) {
    sprite.x2 += Sin(sprite.data[7], sprite.data[5]);
    sprite.y2 += Cos(sprite.data[7], sprite.data[5]);
    sprite.data[7] = (sprite.data[7] + sprite.data[6]) & 0xff;
    if (!(sprite.data[7] % 3)) sprite.invisible = !sprite.invisible;
  } else {
    DestroyAnimSprite(sprite);
  }
}

function AnimThunderboltOrb_Step(sprite: Sprite): void {
  if (--sprite.data[5] === -1) {
    sprite.invisible = !sprite.invisible;
    sprite.data[5] = sprite.data[4];
  }
  if (sprite.data[3]-- <= 0) DestroyAnimSprite(sprite);
}

function AnimThunderboltOrb(sprite: Sprite): void {
  if (IsContest() || GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) gBattleAnimArgs[1] = -gBattleAnimArgs[1];
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + gBattleAnimArgs[1];
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[2];
  sprite.data[3] = gBattleAnimArgs[0];
  sprite.data[4] = gBattleAnimArgs[3];
  sprite.data[5] = gBattleAnimArgs[3];
  sprite.callback = AnimThunderboltOrb_Step;
}

function AnimSparkElectricityFlashing(sprite: Sprite): void {
  sprite.data[0] = gBattleAnimArgs[3];
  const battler = gBattleAnimArgs[7] & 0x8000 ? animState.gBattleAnimTarget : animState.gBattleAnimAttacker;
  if (IsContest() || GetBattlerSide(battler) === C.B_SIDE_PLAYER) gBattleAnimArgs[0] = -gBattleAnimArgs[0];
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2) + gBattleAnimArgs[0];
  sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[1];
  sprite.data[4] = gBattleAnimArgs[7] & 0x7fff;
  sprite.data[5] = gBattleAnimArgs[2];
  sprite.data[6] = gBattleAnimArgs[5];
  sprite.data[7] = gBattleAnimArgs[4];
  sprite.oam.tileNum += gBattleAnimArgs[6] * 4;
  sprite.callback = AnimSparkElectricityFlashing_Step;
  sprite.callback(sprite);
}

function AnimSparkElectricityFlashing_Step(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[7], sprite.data[5]);
  sprite.y2 = Cos(sprite.data[7], sprite.data[5]);
  sprite.data[7] = (sprite.data[7] + sprite.data[6]) & 0xff;
  if (sprite.data[7] % sprite.data[4] === 0) sprite.invisible = !sprite.invisible;
  if (sprite.data[0]-- <= 0) DestroyAnimSprite(sprite);
}

// Electricity arcs around the target. Used for Paralysis and various electric move hits
function AnimElectricity(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, false);
  sprite.oam.tileNum += gBattleAnimArgs[3] * 4;
  if (gBattleAnimArgs[3] === 1) sprite.oam.matrixNum = ST_OAM_HFLIP;
  else if (gBattleAnimArgs[3] === 2) sprite.oam.matrixNum = ST_OAM_VFLIP;
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// The vertical falling thunder bolt used in Thunder Wave/Shock/Bolt
function AnimTask_ElectricBolt(taskId: number): void {
  const d = gTasks[taskId].data;
  d[0] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X) + gBattleAnimArgs[0];
  d[1] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y) + gBattleAnimArgs[1];
  d[2] = gBattleAnimArgs[2];
  gTasks[taskId].func = AnimTask_ElectricBolt_Step;
}

function AnimTask_ElectricBolt_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  let r8: number;
  let r2: number;
  let r12: number;
  let spriteId = 0;
  let r7 = 0;
  const sp = d[2] & 0xff;
  const x = d[0];
  const y = d[1];
  if (!d[2]) {
    r8 = 0;
    r2 = 1;
    r12 = 16;
  } else {
    r12 = 16;
    r8 = 8;
    r2 = 4;
  }
  const template = animTemplate("sElectricBoltSegmentSpriteTemplate");
  switch (d[10]) {
    case 0:
      r12 *= 1;
      spriteId = CreateSprite(template, x, y + r12, 2);
      ++r7;
      break;
    case 2:
      r12 *= 2;
      r8 += r2;
      spriteId = CreateSprite(template, x, y + r12, 2);
      ++r7;
      break;
    case 4:
      r12 *= 3;
      r8 += r2 * 2;
      spriteId = CreateSprite(template, x, y + r12, 2);
      ++r7;
      break;
    case 6:
      r12 *= 4;
      r8 += r2 * 3;
      spriteId = CreateSprite(template, x, y + r12, 2);
      ++r7;
      break;
    case 8:
      r12 *= 5;
      spriteId = CreateSprite(template, x, y + r12, 2);
      ++r7;
      break;
    case 10:
      DestroyAnimVisualTask(taskId);
      return;
  }
  if (r7) {
    gSprites[spriteId].oam.tileNum += r8;
    gSprites[spriteId].data[0] = sp;
    gSprites[spriteId].callback(gSprites[spriteId]);
  }
  ++d[10];
}

function AnimElectricBoltSegment(sprite: Sprite): void {
  if (!sprite.data[0]) {
    sprite.oam.shape = SHAPE_8x16;
    sprite.oam.size = SIZE_8x16;
  } else {
    sprite.oam.shape = SHAPE_16x16;
    sprite.oam.size = SIZE_16x16;
  }
  if (++sprite.data[1] === 15) DestroySprite(sprite);
}

// The horizontal bands of electricity used in Thunder Wave
function AnimThunderWave(sprite: Sprite): void {
  sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  const spriteId = CreateSprite(animTemplate("gThunderWaveSpriteTemplate"), sprite.x + 32, sprite.y, sprite.subpriority);
  gSprites[spriteId].oam.tileNum += 8;
  ++animState.gAnimVisualTaskCount;
  gSprites[spriteId].callback = AnimThunderWave_Step;
  sprite.callback = AnimThunderWave_Step;
}

function AnimThunderWave_Step(sprite: Sprite): void {
  if (++sprite.data[0] === 3) {
    sprite.data[0] = 0;
    sprite.invisible = !sprite.invisible;
  }
  if (++sprite.data[1] === 51) DestroyAnimSprite(sprite);
}

// Animates small electric orbs moving from around the battler inward. For Charge/Shock Wave
function AnimTask_ElectricChargingParticles(taskId: number): void {
  const d = gTasks[taskId].data;
  const battler = !gBattleAnimArgs[0] ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  d[14] = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2);
  d[15] = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET);
  d[6] = gBattleAnimArgs[1];
  d[7] = 0;
  d[8] = 0;
  d[9] = 0;
  d[10] = 0;
  d[11] = gBattleAnimArgs[3];
  d[12] = 0;
  d[13] = gBattleAnimArgs[2];
  gTasks[taskId].func = AnimTask_ElectricChargingParticles_Step;
}

function AnimTask_ElectricChargingParticles_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[6]) {
    if (++d[12] > d[13]) {
      d[12] = 0;
      const spriteId = CreateSprite(animTemplate("gElectricChargingParticlesSpriteTemplate"), d[14], d[15], 2);
      if (spriteId !== MAX_SPRITES) {
        const offsets = cdata<number[][]>("battle_anim_electric", "sElectricChargingParticleCoordOffsets");
        const sprite = gSprites[spriteId];
        sprite.x += offsets[d[9]][0];
        sprite.y += offsets[d[9]][1];
        sprite.data[0] = 40 - d[8] * 5;
        sprite.data[1] = sprite.x;
        sprite.data[2] = d[14];
        sprite.data[3] = sprite.y;
        sprite.data[4] = d[15];
        sprite.data[5] = taskId;
        InitAnimLinearTranslation(sprite);
        StoreSpriteCallbackInData6(sprite, AnimElectricChargingParticles);
        sprite.callback = RunStoredCallbackWhenAnimEnds;
        if (++d[9] > 15) d[9] = 0;
        if (++d[10] >= d[11]) {
          d[10] = 0;
          if (d[8] <= 5) ++d[8];
        }
        ++d[7];
        --d[6];
      }
    }
  } else if (d[7] === 0) {
    DestroyAnimVisualTask(taskId);
  }
}

function AnimElectricChargingParticles_Step(sprite: Sprite): void {
  if (AnimTranslateLinear(sprite)) {
    --gTasks[sprite.data[5]].data[7];
    DestroySprite(sprite);
  }
}

function AnimElectricChargingParticles(sprite: Sprite): void {
  StartSpriteAnim(sprite, 1);
  sprite.callback = AnimElectricChargingParticles_Step;
}

function AnimGrowingChargeOrb(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === ANIM_ATTACKER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET);
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
}

// The quick electric burst at the end of Charge / during the Volt Tackle hit
function AnimElectricPuff(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === ANIM_ATTACKER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.x2 = gBattleAnimArgs[1];
  sprite.y2 = gBattleAnimArgs[2];
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = RunStoredCallbackWhenAnimEnds;
}

// Creates an orb of electricity that grows then slides off-screen. The attacker slides with it
function AnimVoltTackleOrbSlide(sprite: Sprite): void {
  StartSpriteAffineAnim(sprite, 1);
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[6] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  sprite.data[7] = 16;
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_OPPONENT) sprite.data[7] *= -1;
  sprite.callback = AnimVoltTackleOrbSlide_Step;
}

function AnimVoltTackleOrbSlide_Step(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      if (++sprite.data[1] > 40) ++sprite.data[0];
      break;
    case 1:
      sprite.x += sprite.data[7];
      gSprites[sprite.data[6]].x2 += sprite.data[7];
      if (((sprite.x + 80) & 0xffff) > 400) DestroySpriteAndMatrix(sprite);
      break;
  }
}

function AnimTask_VoltTackleAttackerReappear(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0:
      d[15] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
      d[14] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
      if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
        d[14] = -32;
        d[13] = 2;
      } else {
        d[14] = 32;
        d[13] = -2;
      }
      gSprites[d[15]].x2 = d[14];
      ++d[0];
      break;
    case 1:
      if (++d[1] > 1) {
        d[1] = 0;
        gSprites[d[15]].invisible = !gSprites[d[15]].invisible;
        if (d[14]) {
          d[14] += d[13];
          gSprites[d[15]].x2 = d[14];
        } else {
          ++d[0];
        }
      }
      break;
    case 2:
      if (++d[1] > 1) {
        d[1] = 0;
        gSprites[d[15]].invisible = !gSprites[d[15]].invisible;
        if (++d[2] === 8) ++d[0];
      }
      break;
    case 3:
      gSprites[d[15]].invisible = false;
      DestroyAnimVisualTask(taskId);
      break;
  }
}

// The horizontal bolts of electricity for Volt Tackle
function AnimTask_VoltTackleBolt(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[0]) {
    case 0:
      d[1] = GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER ? 1 : -1;
      switch (gBattleAnimArgs[0]) {
        case 0:
          d[3] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
          d[5] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
          d[4] = d[1] * 128 + 120;
          break;
        case 4:
          d[3] = 120 - d[1] * 128;
          d[5] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
          d[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) - d[1] * 32;
          break;
        default:
          if ((gBattleAnimArgs[0] & 1) !== 0) {
            d[3] = 256;
            d[4] = -16;
          } else {
            d[3] = -16;
            d[4] = 256;
          }
          if (d[1] === 1) {
            d[5] = 80 - gBattleAnimArgs[0] * 10;
          } else {
            d[5] = gBattleAnimArgs[0] * 10 + 40;
            const temp = d[3] & 0xffff;
            d[3] = d[4];
            d[4] = s16(temp);
          }
      }
      if (d[3] < d[4]) {
        d[1] = 1;
        d[6] = 0;
      } else {
        d[1] = -1;
        d[6] = 3;
      }
      ++d[0];
      break;
    case 1:
      if (++d[2] > 0) {
        d[2] = 0;
        if (CreateVoltTackleBolt(task, taskId) || CreateVoltTackleBolt(task, taskId)) ++d[0];
      }
      break;
    case 2:
      if (d[7] === 0) DestroyAnimVisualTask(taskId);
      break;
  }
}

function CreateVoltTackleBolt(task: Task, taskId: number): boolean {
  const d = task.data;
  const spriteId = CreateSprite(animTemplate("gVoltTackleBoltSpriteTemplate"), d[3], d[5], 35);
  if (spriteId !== MAX_SPRITES) {
    gSprites[spriteId].data[6] = taskId;
    gSprites[spriteId].data[7] = 7;
    ++d[7];
  }
  d[6] += d[1];
  if (d[6] < 0) d[6] = 3;
  if (d[6] > 3) d[6] = 0;
  d[3] += d[1] * 16;
  return (d[1] === 1 && d[3] >= d[4]) || (d[1] === -1 && d[3] <= d[4]);
}

function AnimVoltTackleBolt(sprite: Sprite): void {
  if (++sprite.data[0] > 12) {
    --gTasks[sprite.data[6]].data[sprite.data[7]];
    FreeOamMatrix(sprite.oam.matrixNum);
    DestroySprite(sprite);
  }
}

function AnimGrowingShockWaveOrb(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
      sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
      StartSpriteAffineAnim(sprite, 2);
      ++sprite.data[0];
      break;
    case 1:
      if (sprite.affineAnimEnded) DestroySpriteAndMatrix(sprite);
      break;
  }
}

function AnimTask_ShockWaveProgressingBolt(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[0]) {
    case 0:
      d[6] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
      d[7] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
      d[8] = 4;
      d[10] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
      d[9] = Math.trunc((d[10] - d[6]) / 5);
      d[4] = 7;
      d[5] = -1;
      d[11] = 12;
      d[12] = BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER);
      d[13] = BattleAnimAdjustPanning(C.SOUND_PAN_TARGET);
      d[14] = d[12];
      d[15] = Math.trunc((d[13] - d[12]) / 3);
      ++d[0];
      break;
    case 1:
      if (++d[1] > 0) {
        d[1] = 0;
        if (CreateShockWaveBoltSprite(task, taskId)) {
          if (d[2] === 5) d[0] = 3;
          else ++d[0];
        }
      }
      if (d[11]) --d[11];
      break;
    case 2:
      if (d[11]) --d[11];
      if (++d[1] > 4) {
        d[1] = 0;
        if (d[2] & 1) {
          d[7] = 4;
          d[8] = 68;
          d[4] = 0;
          d[5] = 1;
        } else {
          d[7] = 68;
          d[8] = 4;
          d[4] = 7;
          d[5] = -1;
        }
        if (d[11]) d[0] = 4;
        else d[0] = 1;
      }
      break;
    case 3:
      if (d[3] === 0) DestroyAnimVisualTask(taskId);
      break;
    case 4:
      if (d[11]) --d[11];
      else d[0] = 1;
      break;
  }
}

function CreateShockWaveBoltSprite(task: Task, taskId: number): boolean {
  const d = task.data;
  const spriteId = CreateSprite(animTemplate("sShockWaveProgressingBoltSpriteTemplate"), d[6], d[7], 35);
  if (spriteId !== MAX_SPRITES) {
    gSprites[spriteId].oam.tileNum += d[4];
    d[4] += d[5];
    if (d[4] < 0) d[4] = 7;
    if (d[4] > 7) d[4] = 0;
    gSprites[spriteId].data[6] = taskId;
    gSprites[spriteId].data[7] = 3;
    ++d[3];
  }
  if (d[4] === 0 && d[5] > 0) {
    d[14] += d[15];
    PlaySE12WithPanning(C.SE_M_THUNDERBOLT, d[14]);
  }
  if ((d[5] < 0 && d[7] <= d[8]) || (d[5] > 0 && d[7] >= d[8])) {
    ++d[2];
    d[6] += d[9];
    return true;
  }
  d[7] += d[5] * 8;
  return false;
}

// Just runs timer for sprite. See AnimTask_ShockWaveProgressingBolt
function AnimShockWaveProgressingBolt(sprite: Sprite): void {
  if (++sprite.data[0] > 12) {
    --gTasks[sprite.data[6]].data[sprite.data[7]];
    DestroySprite(sprite);
  }
}

function AnimTask_ShockWaveLightning(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[0]) {
    case 0:
      d[15] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y) + 32;
      d[14] = d[15];
      while (d[14] > 16) d[14] -= 32;
      d[13] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
      d[12] = GetBattlerSpriteSubpriority(animState.gBattleAnimTarget) - 2;
      ++d[0];
      break;
    case 1:
      if (++d[1] > 1) {
        d[1] = 0;
        if (CreateShockWaveLightningSprite(task, taskId)) ++d[0];
      }
      break;
    case 2:
      if (d[10] === 0) DestroyAnimVisualTask(taskId);
      break;
  }
}

function CreateShockWaveLightningSprite(task: Task, taskId: number): boolean {
  const d = task.data;
  const spriteId = CreateSprite(animTemplate("gLightningSpriteTemplate"), d[13], d[14], d[12] & 0xff);
  if (spriteId !== MAX_SPRITES) {
    gSprites[spriteId].callback = AnimShockWaveLightning;
    gSprites[spriteId].data[6] = taskId;
    gSprites[spriteId].data[7] = 10;
    ++d[10];
  }
  if (d[14] >= d[15]) return true;
  d[14] += 32;
  return false;
}

function AnimShockWaveLightning(sprite: Sprite): void {
  if (sprite.animEnded) {
    --gTasks[sprite.data[6]].data[sprite.data[7]];
    DestroySprite(sprite);
  }
}

registerAnimSpriteCallbacks({
  AnimLightning, AnimUnusedSpinningFist, AnimUnusedCirclingShock, AnimSparkElectricity, AnimZapCannonSpark, AnimThunderboltOrb,
  AnimSparkElectricityFlashing, AnimElectricity, AnimElectricBoltSegment, AnimThunderWave, AnimElectricChargingParticles,
  AnimGrowingChargeOrb, AnimElectricPuff, AnimVoltTackleOrbSlide, AnimVoltTackleBolt, AnimGrowingShockWaveOrb,
  AnimShockWaveProgressingBolt,
});

registerAnimTasks({
  AnimTask_ElectricBolt, AnimTask_ElectricChargingParticles, AnimTask_VoltTackleAttackerReappear, AnimTask_VoltTackleBolt,
  AnimTask_ShockWaveProgressingBolt, AnimTask_ShockWaveLightning,
});
