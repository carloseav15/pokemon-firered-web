// battle_anim_mons.c: the remaining sprite callbacks and the attacker-punch trace
// task. The shared coordinate/translation helpers of this file live in
// battle/anim.ts; this module ports what was left and registers every callback
// and task of the file that animation scripts reference by name.

import * as C from "../../generated/constants";
import { tasks, type Task } from "../../gba/tasks";
import { BlendPalette, gPlttBufferFaded, gPlttBufferUnfaded, OBJ_PLTT_ID, PaletteStruct_ResetById } from "../../hw/palette";
import { AllocSpritePalette, FreeSpritePaletteByTag, gSprites, StartSpriteAnim, type Sprite } from "../../hw/sprite";
import { ArcTan2, Cos, Sin } from "../../hw/trig";
import { UpdateMonIconFrame } from "../../pokemonIcon";
import {
  ANIM_ATTACKER, animState, AnimSpriteOnMonPos, AnimTask_AlphaFadeIn, AnimTask_BlendMonInAndOut, AnimTask_BlendPalInAndOutByTag,
  AnimThrowProjectile, AnimTravelDiagonally, CloneBattlerSpriteWithBlend, ConvertPosDataToTranslateLinearData, DestroyAnimSprite,
  DestroyAnimVisualTask, DestroySpriteAndMatrix, DestroySpriteWithActiveSheet, GetAnimBattlerSpriteId, GetBattlerSpriteCoord,
  GetBattlerSpriteSubpriority, InitSpriteDataForLinearTranslation, IsBattlerSpriteVisible, RunStoredCallbackWhenAnimEnds,
  SetCallbackToStoredInData6, SetSpriteCoordsToAnimAttackerCoords, StartAnimLinearTranslation, StoreSpriteCallbackInData6,
  TranslateAnimSpriteToTargetMonLocation, TranslateSpriteLinear, TranslateSpriteLinearAndFlicker,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { gBattlerSpriteIds } from "../globals";
import { BATTLE_PARTNER } from "../macros";
import { GetBattlerAtPosition, GetBattlerSide } from "../util";

import { gBattleAnimArgs } from "../animArgs";
const gTasks = tasks.tasks;

// Unused
// x = ampl * sin(alpha0 + dalpha * t)
// y = ampl * cos(beta0 + dbeta * t)
export function TranslateSpriteInLissajousCurve(sprite: Sprite): void {
  const d = sprite.data;
  if (d[0]) {
    sprite.x2 = Sin(d[1], d[3]);
    sprite.y2 = Cos(d[4], d[3]);
    d[1] += d[2];
    d[4] += d[5];
    if (d[1] >= 0x100) d[1] -= 0x100;
    else if (d[1] < 0) d[1] += 0x100;
    if (d[4] >= 0x100) d[4] -= 0x100;
    else if (d[4] < 0) d[4] += 0x100;
    d[0]--;
  } else {
    SetCallbackToStoredInData6(sprite);
  }
}

export function AnimPosToTranslateLinear(sprite: Sprite): void {
  ConvertPosDataToTranslateLinearData(sprite);
  sprite.callback = TranslateSpriteLinear;
  sprite.callback(sprite);
}

export function TranslateSpriteLinearFixedPointIconFrame(sprite: Sprite): void {
  const d = sprite.data;
  if (d[0] > 0) {
    --d[0];
    d[3] += d[1];
    d[4] += d[2];
    sprite.x2 = d[3] >> 8;
    sprite.y2 = d[4] >> 8;
  } else {
    SetCallbackToStoredInData6(sprite);
  }
  UpdateMonIconFrame(sprite);
}

export function TranslateSpriteToBattleTargetPos(sprite: Sprite): void {
  sprite.data[1] = sprite.x + sprite.x2;
  sprite.data[3] = sprite.y + sprite.y2;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.callback = AnimPosToTranslateLinear;
}

export function SetupAndStartSpriteLinearTranslationToAttacker(sprite: Sprite): void {
  sprite.data[1] = sprite.x + sprite.x2;
  sprite.data[3] = sprite.y + sprite.y2;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.callback = AnimPosToTranslateLinear;
}

export function Trade_MoveSelectedMonToTarget(sprite: Sprite): void {
  sprite.data[1] = sprite.x;
  sprite.data[3] = sprite.y;
  InitSpriteDataForLinearTranslation(sprite);
  sprite.callback = TranslateSpriteLinearFixedPointIconFrame;
  sprite.callback(sprite);
}

export function ArcTan2_(a: number, b: number): number {
  return ArcTan2(a, b);
}

/** battle_anim_mons.c EndUnkPaletteAnim; this callback is unused by FireRed scripts. */
export function EndUnkPaletteAnim(sprite: Sprite): void {
  PaletteStruct_ResetById(sprite.data[5]);
  DestroySpriteAndMatrix(sprite);
}

export function GetSpritePalIdxByPosition(position: number): number {
  return GetBattlerAtPosition(position);
}

export function SetPriorityForVisibleBattlers(priority: number): void {
  const { gBattleAnimTarget, gBattleAnimAttacker } = animState;
  if (IsBattlerSpriteVisible(gBattleAnimTarget)) gSprites[gBattlerSpriteIds[gBattleAnimTarget]].oam.priority = priority;
  if (IsBattlerSpriteVisible(gBattleAnimAttacker)) gSprites[gBattlerSpriteIds[gBattleAnimAttacker]].oam.priority = priority;
  if (IsBattlerSpriteVisible(BATTLE_PARTNER(gBattleAnimTarget))) gSprites[gBattlerSpriteIds[BATTLE_PARTNER(gBattleAnimTarget)]].oam.priority = priority;
  if (IsBattlerSpriteVisible(BATTLE_PARTNER(gBattleAnimAttacker))) gSprites[gBattlerSpriteIds[BATTLE_PARTNER(gBattleAnimAttacker)]].oam.priority = priority;
}

export function AnimTranslateLinearAndFlicker_Flipped(sprite: Sprite): void {
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.x -= gBattleAnimArgs[0];
    gBattleAnimArgs[3] = -gBattleAnimArgs[3];
    sprite.hFlip = 1;
  } else {
    sprite.x += gBattleAnimArgs[0];
  }
  sprite.y += gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[1] = gBattleAnimArgs[3];
  sprite.data[3] = gBattleAnimArgs[4];
  sprite.data[5] = gBattleAnimArgs[5];
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = TranslateSpriteLinearAndFlicker;
}

// Used by three different unused battle anim sprite templates.
export function AnimTranslateLinearAndFlicker(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.x -= gBattleAnimArgs[0];
    gBattleAnimArgs[3] *= -1;
  } else {
    sprite.x += gBattleAnimArgs[0];
  }
  sprite.y += gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[1] = gBattleAnimArgs[3];
  sprite.data[3] = gBattleAnimArgs[4];
  sprite.data[5] = gBattleAnimArgs[5];
  StartSpriteAnim(sprite, gBattleAnimArgs[6]);
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = TranslateSpriteLinearAndFlicker;
}

// Used by Detect/Disable
export function AnimSpinningSparkle(sprite: Sprite): void {
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x -= gBattleAnimArgs[0];
  else sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  sprite.callback = RunStoredCallbackWhenAnimEnds;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Task and sprite data for AnimTask_AttackerPunchWithTrace
const tBattlerSpriteId = 0;
const tMoveSpeed = 1;
const tState = 2;
const tCounter = 3;
const tPaletteNum = 4;
const tNumTracesActive = 5;
const tPriority = 6;

const sActiveTime = 0;
const sTaskId = 1;
const sSpriteId = 2;

export function AnimTask_AttackerPunchWithTrace(taskId: number): void {
  const task = gTasks[taskId];
  task.data[tBattlerSpriteId] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.data[tMoveSpeed] = GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER ? -8 : 8;
  task.data[tState] = 0;
  task.data[tCounter] = 0;
  gSprites[task.data[tBattlerSpriteId]].x2 -= task.data[tBattlerSpriteId];
  task.data[tPaletteNum] = AllocSpritePalette(C.ANIM_TAG_BENT_SPOON);
  task.data[tNumTracesActive] = 0;

  const dest = OBJ_PLTT_ID(task.data[tPaletteNum]);
  const src = OBJ_PLTT_ID(gSprites[task.data[tBattlerSpriteId]].oam.paletteNum);

  // Set trace's priority based on battler's subpriority
  task.data[tPriority] = GetBattlerSpriteSubpriority(animState.gBattleAnimAttacker);
  if (task.data[tPriority] === 20 || task.data[tPriority] === 40) task.data[tPriority] = 2;
  else task.data[tPriority] = 3;

  gPlttBufferFaded.set(gPlttBufferUnfaded.subarray(src, src + 16), dest);
  BlendPalette(dest, 16, gBattleAnimArgs[1], gBattleAnimArgs[0]);
  task.func = AnimTask_AttackerPunchWithTrace_Step;
}

function AnimTask_AttackerPunchWithTrace_Step(taskId: number): void {
  const task = gTasks[taskId];
  switch (task.data[tState]) {
    case 0:
      // Move forward
      CreateBattlerTrace(task, taskId);
      gSprites[task.data[tBattlerSpriteId]].x2 += task.data[tMoveSpeed];
      if (++task.data[tCounter] === 5) {
        task.data[tCounter]--;
        task.data[tState]++;
      }
      break;
    case 1:
      // Move back (do same number of traces as before)
      CreateBattlerTrace(task, taskId);
      gSprites[task.data[tBattlerSpriteId]].x2 -= task.data[tMoveSpeed];
      if (--task.data[tCounter] === 0) {
        gSprites[task.data[tBattlerSpriteId]].x2 = 0;
        task.data[tState]++;
      }
      break;
    case 2:
      if (task.data[tNumTracesActive] === 0) {
        FreeSpritePaletteByTag(C.ANIM_TAG_BENT_SPOON);
        DestroyAnimVisualTask(taskId);
      }
      break;
  }
}

function CreateBattlerTrace(task: Task, taskId: number): void {
  const spriteId = CloneBattlerSpriteWithBlend(0);
  if (spriteId >= 0) {
    const sprite = gSprites[spriteId];
    sprite.oam.priority = task.data[tPriority];
    sprite.oam.paletteNum = task.data[tPaletteNum];
    sprite.data[sActiveTime] = 8;
    sprite.data[sTaskId] = taskId;
    sprite.data[sSpriteId] = spriteId;
    sprite.x2 = gSprites[task.data[tBattlerSpriteId]].x2;
    sprite.callback = AnimBattlerTrace;
    task.data[tNumTracesActive]++;
  }
}

// Just waits until destroyed
function AnimBattlerTrace(sprite: Sprite): void {
  if (--sprite.data[sActiveTime] === 0) {
    gTasks[sprite.data[sTaskId]].data[tNumTracesActive]--;
    DestroySpriteWithActiveSheet(sprite);
  }
}

export function AnimWeatherBallUp(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) sprite.data[0] = 5;
  else sprite.data[0] = -10;
  sprite.data[1] = -40;
  sprite.callback = AnimWeatherBallUp_Step;
}

function AnimWeatherBallUp_Step(sprite: Sprite): void {
  sprite.data[2] += sprite.data[0];
  sprite.data[3] += sprite.data[1];
  sprite.x2 = Math.trunc(sprite.data[2] / 10);
  sprite.y2 = Math.trunc(sprite.data[3] / 10);
  if (sprite.data[1] < -20) ++sprite.data[1];
  if (sprite.y + sprite.y2 < -32) DestroyAnimSprite(sprite);
}

export function AnimWeatherBallDown(sprite: Sprite): void {
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[2] = sprite.x + gBattleAnimArgs[4];
  sprite.data[4] = sprite.y + gBattleAnimArgs[5];
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) {
    const x = (gBattleAnimArgs[4] & 0xffff) + 30;
    sprite.x += x;
    sprite.y = gBattleAnimArgs[5] - 20;
  } else {
    const x = (gBattleAnimArgs[4] & 0xffff) - 30;
    sprite.x += x;
    sprite.y = gBattleAnimArgs[5] - 80;
  }
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

registerAnimSpriteCallbacks({
  TranslateAnimSpriteToTargetMonLocation, AnimSpriteOnMonPos, AnimSpinningSparkle, AnimThrowProjectile, AnimTravelDiagonally,
  AnimWeatherBallUp, AnimWeatherBallDown, AnimTranslateLinearAndFlicker, AnimTranslateLinearAndFlicker_Flipped,
});

export function AnimTask_GetFrustrationPowerLevel(taskId: number): void {
  let powerLevel: number;
  const friendship = animState.gAnimFriendship;
  if (friendship <= 30) powerLevel = 0;
  else if (friendship <= 100) powerLevel = 1;
  else if (friendship <= 200) powerLevel = 2;
  else powerLevel = 3;
  gBattleAnimArgs[C.ARG_RET_ID] = powerLevel;
  DestroyAnimVisualTask(taskId);
}

registerAnimTasks({
  AnimTask_GetFrustrationPowerLevel,
  AnimTask_AttackerPunchWithTrace, AnimTask_AlphaFadeIn, AnimTask_BlendMonInAndOut, AnimTask_BlendPalInAndOutByTag,
});
