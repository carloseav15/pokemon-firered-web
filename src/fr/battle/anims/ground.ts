// battle_anim_ground.c: Bonemerang / Bone Club, Sand Attack dirt, Mud Sport,
// Dig (scanline hole effect), Fissure and the Earthquake horizontal shakes.
// AnimTask_IsPowerOver99 writes gBattleAnimArgs[15], past the 8 args (the C
// relies on the EWRAM after the array; animState keeps 16 slots for it).

import * as C from "../../generated/constants";
import { tasks, type Task } from "../../gba/tasks";
import { REG_OFFSET_BG1HOFS, REG_OFFSET_BG2HOFS } from "../../hw/ppu";
import { gScanlineEffect, gScanlineEffectRegBuffers, SCANLINE_EFFECT_DMACNT_16BIT, ScanlineEffect_SetParams } from "../../hw/scanline";
import { gSprites, type Sprite } from "../../hw/sprite";
import { gSineTable } from "../../hw/trig";
import { random } from "../../random";
import {
  ANIM_ATTACKER, animState, DestroyAnimSprite, DestroyAnimVisualTask, DestroySpriteAndMatrix, GetAnimBattlerSpriteId,
  GetBattlerSpriteBGPriorityRank, GetBattlerSpriteCoord, GetBattlerSpriteCoord2, GetBattlerYCoordWithElevation,
  InitAnimArcTranslation, InitSpritePosToAnimAttacker, InitSpritePosToAnimTarget, IsBattlerSpriteVisible,
  StartAnimLinearTranslation, StoreSpriteCallbackInData6, TranslateAnimHorizontalArc, WaitAnimForDuration,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { G, gBattlerSpriteIds } from "../globals";
import { GetBattlerSide } from "../util";
import { gBattleAnimArgs, gTasks, s16 } from "./common";

const DISPLAY_HEIGHT = 160;
const SPRITE_NONE = 0xff;
const BIT_FLANK = 2;

// Moves a bone projectile towards the target mon, which moves like
// a boomerang. After hitting the target mon, it comes back to the user.
function AnimBonemerangProjectile(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[0] = 20;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[5] = -40;
  InitAnimArcTranslation(sprite);
  sprite.callback = AnimBonemerangProjectile_Step;
}

function AnimBonemerangProjectile_Step(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) {
    sprite.x += sprite.x2;
    sprite.y += sprite.y2;
    sprite.y2 = 0;
    sprite.x2 = 0;
    sprite.data[0] = 20;
    sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
    sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
    sprite.data[5] = 40;
    InitAnimArcTranslation(sprite);
    sprite.callback = AnimBonemerangProjectile_End;
  }
}

function AnimBonemerangProjectile_End(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) DestroyAnimSprite(sprite);
}

// Moves a bone projectile towards the target mon, starting right next to
// the target mon.
function AnimBoneHitProjectile(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, true);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[2] = -gBattleAnimArgs[2];
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + gBattleAnimArgs[2];
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[3];
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Moves a small dirt projectile towards the target mon.
function AnimDirtScatter(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  const targetXPos = GetBattlerSpriteCoord2(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) & 0xff;
  const targetYPos = GetBattlerSpriteCoord2(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) & 0xff;
  let xOffset = random() & 0x1f;
  let yOffset = random() & 0x1f;
  if (xOffset > 16) xOffset = 16 - xOffset;
  if (yOffset > 16) yOffset = 16 - yOffset;
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[2] = targetXPos + xOffset;
  sprite.data[4] = targetYPos + yOffset;
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
}

// Moves a particle of dirt in the Mud Sport animation.
// The dirt can either be rising upward, or falling down.
function AnimMudSportDirt(sprite: Sprite): void {
  ++sprite.oam.tileNum;
  if (gBattleAnimArgs[0] === 0) {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2) + gBattleAnimArgs[1];
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[2];
    sprite.data[0] = gBattleAnimArgs[1] > 0 ? 1 : -1;
    sprite.callback = AnimMudSportDirtRising;
  } else {
    sprite.x = gBattleAnimArgs[1];
    sprite.y = gBattleAnimArgs[2];
    sprite.y2 = -gBattleAnimArgs[2];
    sprite.callback = AnimMudSportDirtFalling;
  }
}

function AnimMudSportDirtRising(sprite: Sprite): void {
  if (++sprite.data[1] > 1) {
    sprite.data[1] = 0;
    sprite.x += sprite.data[0];
  }
  sprite.y -= 4;
  if (sprite.y < -4) DestroyAnimSprite(sprite);
}

function AnimMudSportDirtFalling(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      sprite.y2 += 4;
      if (sprite.y2 >= 0) {
        sprite.y2 = 0;
        ++sprite.data[0];
      }
      break;
    case 1:
      if (++sprite.data[1] > 0) {
        sprite.data[1] = 0;
        sprite.invisible = !sprite.invisible;
        if (++sprite.data[2] === 10) DestroyAnimSprite(sprite);
      }
      break;
  }
}

function AnimTask_DigDownMovement(taskId: number): void {
  const task = gTasks[taskId];
  if (gBattleAnimArgs[0] === 0) task.func = AnimTask_DigBounceMovement;
  else task.func = AnimTask_DigDisappear;
  task.func(taskId);
}

function AnimTask_DigBounceMovement(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[0]) {
    case 0: {
      d[10] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
      d[11] = GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker);
      if (d[11] === 1) {
        d[12] = s16(G.gBattle_BG1_X);
        d[13] = s16(G.gBattle_BG1_Y);
      } else {
        d[12] = s16(G.gBattle_BG2_X);
        d[13] = s16(G.gBattle_BG2_Y);
      }
      const var0 = GetBattlerYCoordWithElevation(animState.gBattleAnimAttacker) & 0xff;
      d[14] = var0 - 32;
      d[15] = var0 + 32;
      if (d[14] < 0) d[14] = 0;
      gSprites[d[10]].invisible = true;
      ++d[0];
      break;
    }
    case 1:
      SetDigScanlineEffect(d[11], d[14], d[15]);
      ++d[0];
      break;
    case 2:
      d[2] = (d[2] + 6) & 0x7f;
      if (++d[4] > 2) {
        d[4] = 0;
        ++d[3];
      }
      d[5] = d[3] + (gSineTable[d[2]] >> 4);
      if (d[11] === 1) G.gBattle_BG1_Y = d[13] - d[5];
      else G.gBattle_BG2_Y = d[13] - d[5];
      if (d[5] > 63) {
        d[5] = 120 - d[14];
        if (d[11] === 1) G.gBattle_BG1_Y = d[13] - d[5];
        else G.gBattle_BG2_Y = d[13] - d[5];
        gSprites[d[10]].x2 = 272 - gSprites[d[10]].x;
        ++d[0];
      }
      break;
    case 3:
      gScanlineEffect.state = 3;
      ++d[0];
      break;
    case 4:
      DestroyAnimVisualTask(taskId);
      gSprites[d[10]].invisible = true;
      break;
  }
}

function AnimTask_DigDisappear(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  gSprites[spriteId].invisible = true;
  gSprites[spriteId].x2 = 0;
  gSprites[spriteId].y2 = 0;
  if (GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker) === 1) G.gBattle_BG1_Y = 0;
  else G.gBattle_BG2_Y = 0;
  DestroyAnimVisualTask(taskId);
}

function AnimTask_DigUpMovement(taskId: number): void {
  const task = gTasks[taskId];
  if (gBattleAnimArgs[0] === 0) task.func = AnimTask_DigSetVisibleUnderground;
  else task.func = AnimTask_DigRiseUpFromHole;
  task.func(taskId);
}

function AnimTask_DigSetVisibleUnderground(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0:
      d[10] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
      gSprites[d[10]].invisible = false;
      gSprites[d[10]].x2 = 0;
      gSprites[d[10]].y2 = DISPLAY_HEIGHT - gSprites[d[10]].y;
      ++d[0];
      break;
    case 1:
      DestroyAnimVisualTask(taskId);
  }
}

function AnimTask_DigRiseUpFromHole(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0: {
      d[10] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
      d[11] = GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker);
      if (d[11] === 1) d[12] = s16(G.gBattle_BG1_X);
      else d[12] = s16(G.gBattle_BG2_X);
      const var0 = GetBattlerYCoordWithElevation(animState.gBattleAnimAttacker) & 0xff;
      d[14] = var0 - 32;
      d[15] = var0 + 32;
      ++d[0];
      break;
    }
    case 1:
      SetDigScanlineEffect(d[11], 0, d[15]);
      ++d[0];
      break;
    case 2:
      gSprites[d[10]].y2 = 96;
      ++d[0];
      break;
    case 3:
      gSprites[d[10]].y2 -= 8;
      if (gSprites[d[10]].y2 === 0) {
        gScanlineEffect.state = 3;
        ++d[0];
      }
      break;
    case 4:
      DestroyAnimVisualTask(taskId);
      break;
  }
}

function SetDigScanlineEffect(useBG1: number, y: number, endY: number): void {
  let bgX: number;
  let dmaDest: number;
  if (useBG1 === 1) {
    bgX = s16(G.gBattle_BG1_X);
    dmaDest = REG_OFFSET_BG1HOFS;
  } else {
    bgX = s16(G.gBattle_BG2_X);
    dmaDest = REG_OFFSET_BG2HOFS;
  }
  if (y < 0) y = 0;
  while (y < endY) {
    gScanlineEffectRegBuffers[0][y] = bgX;
    gScanlineEffectRegBuffers[1][y] = bgX;
    ++y;
  }
  while (y < 160) {
    gScanlineEffectRegBuffers[0][y] = bgX + 240;
    gScanlineEffectRegBuffers[1][y] = bgX + 240;
    ++y;
  }
  ScanlineEffect_SetParams({ dmaDest, dmaControl: SCANLINE_EFFECT_DMACNT_16BIT, initState: 1, unused9: 0 });
}

// Moves a particle of dirt in a plume of dirt. Used in Fissure and Dig.
function AnimDirtPlumeParticle(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  let xOffset = 24;
  if (gBattleAnimArgs[1] === 1) {
    xOffset *= -1;
    gBattleAnimArgs[2] *= -1;
  }
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2) + xOffset;
  sprite.y = GetBattlerYCoordWithElevation(battler) + 30;
  sprite.data[0] = gBattleAnimArgs[5];
  sprite.data[2] = sprite.x + gBattleAnimArgs[2];
  sprite.data[4] = sprite.y + gBattleAnimArgs[3];
  sprite.data[5] = gBattleAnimArgs[4];
  InitAnimArcTranslation(sprite);
  sprite.callback = AnimDirtPlumeParticle_Step;
}

function AnimDirtPlumeParticle_Step(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) DestroyAnimSprite(sprite);
}

// Displays the dirt mound seen in the move Dig for set duration.
// The dirt mound image is too large for a single sprite, so two
// sprites are lined up next to each other.
function AnimDigDirtMound(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X) - 16 + gBattleAnimArgs[1] * 32;
  sprite.y = GetBattlerYCoordWithElevation(battler) + 32;
  sprite.oam.tileNum += gBattleAnimArgs[1] * 8;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.callback = WaitAnimForDuration;
}

// Task data for AnimTask_HorizontalShake
const tState = 0;
const tDelay = 1;
const tTimer = 2;
const tMaxTime = 3;
const tbattlerSpriteIds = (i: number) => 9 + i;
const tNumBattlers = 13; // AnimTask_ShakeBattlers
const tInitialX = 13; // AnimTask_ShakeTerrain
const tHorizOffset = 14;
const tInitHorizOffset = 15;

// Shakes battler(s) or the battle terrain back and forth horizontally. Used by e.g. Earthquake, Eruption
// arg0: What to shake. 0-3 for any specific battler, MAX_BATTLERS_COUNT for all battlers, MAX_BATTLERS_COUNT + 1 for the terrain
// arg1: Shake intensity, used to calculate horizontal pixel offset (if 0, use move power instead)
// arg2: Length of time to shake for
export function AnimTask_HorizontalShake(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  if (gBattleAnimArgs[1] !== 0) d[tHorizOffset] = d[tInitHorizOffset] = gBattleAnimArgs[1] + 3;
  else d[tHorizOffset] = d[tInitHorizOffset] = Math.trunc(animState.gAnimMovePower / 10) + 3;
  d[tMaxTime] = gBattleAnimArgs[2];
  switch (gBattleAnimArgs[0]) {
    case C.MAX_BATTLERS_COUNT + 1: // Shake terrain
      d[tInitialX] = s16(G.gBattle_BG3_X);
      task.func = AnimTask_ShakeTerrain;
      break;
    case C.MAX_BATTLERS_COUNT: // Shake all battlers
      d[tNumBattlers] = 0;
      for (let i = 0; i < C.MAX_BATTLERS_COUNT; i++) {
        if (IsBattlerSpriteVisible(i)) {
          d[tbattlerSpriteIds(d[tNumBattlers])] = gBattlerSpriteIds[i];
          d[tNumBattlers]++;
        }
      }
      task.func = AnimTask_ShakeBattlers;
      break;
    default: // Shake specific battler
      d[tbattlerSpriteIds(0)] = GetAnimBattlerSpriteId(gBattleAnimArgs[0]);
      if (d[tbattlerSpriteIds(0)] === SPRITE_NONE) {
        DestroyAnimVisualTask(taskId);
      } else {
        d[tNumBattlers] = 1;
        task.func = AnimTask_ShakeBattlers;
      }
      break;
  }
}

function AnimTask_ShakeTerrain(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[tState]) {
    case 0:
      if (++d[tDelay] > 1) {
        d[tDelay] = 0;
        if ((d[tTimer] & 1) === 0) G.gBattle_BG3_X = d[tInitialX] + d[tInitHorizOffset];
        else G.gBattle_BG3_X = d[tInitialX] - d[tInitHorizOffset];
        if (++d[tTimer] === d[tMaxTime]) {
          d[tTimer] = 0;
          d[tHorizOffset]--;
          d[tState]++;
        }
      }
      break;
    case 1:
      if (++d[tDelay] > 1) {
        d[tDelay] = 0;
        if ((d[tTimer] & 1) === 0) G.gBattle_BG3_X = d[tInitialX] + d[tHorizOffset];
        else G.gBattle_BG3_X = d[tInitialX] - d[tHorizOffset];
        if (++d[tTimer] === 4) {
          d[tTimer] = 0;
          if (--d[tHorizOffset] === 0) d[tState]++;
        }
      }
      break;
    case 2:
      G.gBattle_BG3_X = d[tInitialX];
      DestroyAnimVisualTask(taskId);
      break;
  }
}

function AnimTask_ShakeBattlers(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[tState]) {
    case 0:
      if (++d[tDelay] > 1) {
        d[tDelay] = 0;
        SetBattlersXOffsetForShake(task);
        if (++d[tTimer] === d[tMaxTime]) {
          d[tTimer] = 0;
          d[tHorizOffset]--;
          d[tState]++;
        }
      }
      break;
    case 1:
      if (++d[tDelay] > 1) {
        d[tDelay] = 0;
        SetBattlersXOffsetForShake(task);
        if (++d[tTimer] === 4) {
          d[tTimer] = 0;
          if (--d[tHorizOffset] === 0) d[tState]++;
        }
      }
      break;
    case 2:
      for (let i = 0; i < d[tNumBattlers]; i++) gSprites[d[tbattlerSpriteIds(i)]].x2 = 0;
      DestroyAnimVisualTask(taskId);
      break;
  }
}

function SetBattlersXOffsetForShake(task: Task): void {
  const d = task.data;
  let xOffset: number;
  if ((d[tTimer] & 1) === 0) xOffset = Math.trunc(d[tHorizOffset] / 2) + (d[tHorizOffset] & 1);
  else xOffset = -Math.trunc(d[tHorizOffset] / 2);
  for (let i = 0; i < d[tNumBattlers]; i++) gSprites[d[tbattlerSpriteIds(i)]].x2 = xOffset;
}

function AnimTask_IsPowerOver99(taskId: number): void {
  gBattleAnimArgs[15] = animState.gAnimMovePower > 99 ? 1 : 0;
  DestroyAnimVisualTask(taskId);
}

function AnimTask_PositionFissureBgOnBattler(taskId: number): void {
  let battler = gBattleAnimArgs[0] & 1 ? animState.gBattleAnimTarget : animState.gBattleAnimAttacker;
  if (gBattleAnimArgs[0] > 1) battler ^= BIT_FLANK;
  const newTask = gTasks[tasks.create(WaitForFissureCompletion, gBattleAnimArgs[1])];
  newTask.data[1] = (32 - GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2)) & 0x1ff;
  newTask.data[2] = (64 - GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET)) & 0xff;
  G.gBattle_BG3_X = newTask.data[1];
  G.gBattle_BG3_Y = newTask.data[2];
  newTask.data[3] = gBattleAnimArgs[2];
  DestroyAnimVisualTask(taskId);
}

function WaitForFissureCompletion(taskId: number): void {
  const task = gTasks[taskId];
  // Holds the BG3 offsets until gBattleAnimArgs[7]
  // is set to a special terminator value.
  if (gBattleAnimArgs[7] === task.data[3]) {
    G.gBattle_BG3_X = 0;
    G.gBattle_BG3_Y = 0;
    tasks.destroy(taskId);
  } else {
    G.gBattle_BG3_X = task.data[1];
    G.gBattle_BG3_Y = task.data[2];
  }
}

registerAnimSpriteCallbacks({
  AnimBonemerangProjectile, AnimBoneHitProjectile, AnimDirtScatter, AnimMudSportDirt, AnimDirtPlumeParticle, AnimDigDirtMound,
});

registerAnimTasks({
  AnimTask_DigDownMovement, AnimTask_DigUpMovement, AnimTask_HorizontalShake, AnimTask_IsPowerOver99,
  AnimTask_PositionFissureBgOnBattler,
});
