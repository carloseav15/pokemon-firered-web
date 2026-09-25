// battle_anim_dragon.c: Outrage / Dragon Rage / Dragon Breath flames, the Dragon
// Dance orbs and scanline waver, and Overheat flames.

import * as C from "../../generated/constants";
import { REG_OFFSET_BG1HOFS, REG_OFFSET_BG2HOFS } from "../../hw/ppu";
import { gScanlineEffect, gScanlineEffectRegBuffers, SCANLINE_EFFECT_DMACNT_16BIT, ScanlineEffect_SetParams } from "../../hw/scanline";
import { StartSpriteAffineAnim, StartSpriteAnim, type Sprite } from "../../hw/sprite";
import { Cos, gSineTable, Sin } from "../../hw/trig";
import { type Task } from "../../gba/tasks";
import {
  animState, DestroyAnimSprite, DestroyAnimVisualTask, DestroySpriteAndMatrix, GetBattlerSpriteBGPriorityRank, GetBattlerSpriteCoord,
  GetBattlerSpriteCoordAttr, GetBattlerYCoordWithElevation, RunStoredCallbackWhenAnimEnds, SetAnimSpriteInitialXOffset,
  SetSpriteCoordsToAnimAttackerCoords, StartAnimLinearTranslation, StoreSpriteCallbackInData6, TranslateSpriteLinearAndFlicker,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { G } from "../globals";
import { GetBattlerSide } from "../util";
import { gBattleAnimArgs, gTasks } from "./common";

const sUnusedOverheatData = new Uint16Array(7);

function AnimOutrageFlame(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.x -= gBattleAnimArgs[0];
    gBattleAnimArgs[3] = -gBattleAnimArgs[3];
    gBattleAnimArgs[4] = -gBattleAnimArgs[4];
  } else {
    sprite.x += gBattleAnimArgs[0];
  }
  sprite.y += gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[1] = gBattleAnimArgs[3];
  sprite.data[3] = gBattleAnimArgs[4];
  sprite.data[5] = gBattleAnimArgs[5];
  sprite.invisible = true;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = TranslateSpriteLinearAndFlicker;
}

function StartDragonFireTranslation(sprite: Sprite): void {
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.x -= gBattleAnimArgs[1];
    sprite.y += gBattleAnimArgs[1];
    sprite.data[2] -= gBattleAnimArgs[2];
    sprite.data[4] += gBattleAnimArgs[3];
  } else {
    sprite.x += gBattleAnimArgs[0];
    sprite.y += gBattleAnimArgs[1];
    sprite.data[2] += gBattleAnimArgs[2];
    sprite.data[4] += gBattleAnimArgs[3];
    StartSpriteAnim(sprite, 1);
  }
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
}

function AnimDragonRageFirePlume(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X);
  sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y);
  SetAnimSpriteInitialXOffset(sprite, gBattleAnimArgs[1]);
  sprite.y += gBattleAnimArgs[2];
  sprite.callback = RunStoredCallbackWhenAnimEnds;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
}

// For Dragon Breath and Dragon Rage
function AnimDragonFireToTarget(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) StartSpriteAffineAnim(sprite, 1);
  StartDragonFireTranslation(sprite);
}

function AnimDragonDanceOrb(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[4] = 0;
  sprite.data[5] = 1;
  sprite.data[6] = gBattleAnimArgs[0];
  // Uses gBattlerAttacker (not gBattleAnimAttacker), as in the C.
  const r5 = GetBattlerSpriteCoordAttr(G.gBattlerAttacker, C.BATTLER_COORD_ATTR_HEIGHT) & 0xffff;
  const r0 = GetBattlerSpriteCoordAttr(G.gBattlerAttacker, C.BATTLER_COORD_ATTR_WIDTH) & 0xffff;
  if (r5 > r0) sprite.data[7] = r5 >> 1;
  else sprite.data[7] = r0 >> 1;
  sprite.x2 = Cos(sprite.data[6], sprite.data[7]);
  sprite.y2 = Sin(sprite.data[6], sprite.data[7]);
  sprite.callback = AnimDragonDanceOrb_Step;
}

function AnimDragonDanceOrb_Step(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      sprite.data[6] = (sprite.data[6] - sprite.data[5]) & 0xff;
      sprite.x2 = Cos(sprite.data[6], sprite.data[7]);
      sprite.y2 = Sin(sprite.data[6], sprite.data[7]);
      if (++sprite.data[4] > 5) {
        sprite.data[4] = 0;
        if (sprite.data[5] <= 15 && ++sprite.data[5] > 15) sprite.data[5] = 16;
      }
      if (++sprite.data[3] > 0x3c) {
        sprite.data[3] = 0;
        ++sprite.data[0];
      }
      break;
    case 1:
      sprite.data[6] = (sprite.data[6] - sprite.data[5]) & 0xff;
      if (sprite.data[7] <= 0x95 && (sprite.data[7] += 8) > 0x95) sprite.data[7] = 0x96;
      sprite.x2 = Cos(sprite.data[6], sprite.data[7]);
      sprite.y2 = Sin(sprite.data[6], sprite.data[7]);
      if (++sprite.data[4] > 5) {
        sprite.data[4] = 0;
        if (sprite.data[5] <= 15 && ++sprite.data[5] > 15) sprite.data[5] = 16;
      }
      if (++sprite.data[3] > 20) DestroyAnimSprite(sprite);
      break;
  }
}

// Wavers the attacker back and forth. Progressing vertical wave of scanline shifts
// Used by Dragon Dance
function AnimTask_DragonDanceWaver(taskId: number): void {
  const task = gTasks[taskId];
  let dmaDest: number;
  if (GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker) === 1) {
    dmaDest = REG_OFFSET_BG1HOFS;
    task.data[2] = G.gBattle_BG1_X;
  } else {
    dmaDest = REG_OFFSET_BG2HOFS;
    task.data[2] = G.gBattle_BG2_X;
  }
  const r1 = GetBattlerYCoordWithElevation(animState.gBattleAnimAttacker) & 0xff;
  task.data[3] = r1 - 32;
  task.data[4] = r1 + 32;
  if (task.data[3] < 0) task.data[3] = 0;
  for (let i = task.data[3]; i <= task.data[4]; ++i) {
    gScanlineEffectRegBuffers[0][i] = task.data[2];
    gScanlineEffectRegBuffers[1][i] = task.data[2];
  }
  ScanlineEffect_SetParams({ dmaDest, dmaControl: SCANLINE_EFFECT_DMACNT_16BIT, initState: 1, unused9: 0 });
  task.func = AnimTask_DragonDanceWaver_Step;
}

function AnimTask_DragonDanceWaver_Step(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[0]) {
    case 0:
      if (++d[7] > 1) {
        d[7] = 0;
        if (++d[6] === 3) ++d[0];
      }
      UpdateDragonDanceScanlineEffect(task);
      break;
    case 1:
      if (++d[1] > 0x3c) ++d[0];
      UpdateDragonDanceScanlineEffect(task);
      break;
    case 2:
      if (++d[7] > 1) {
        d[7] = 0;
        if (--d[6] === 0) ++d[0];
      }
      UpdateDragonDanceScanlineEffect(task);
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

function UpdateDragonDanceScanlineEffect(task: Task): void {
  const d = task.data;
  let r3 = d[5] & 0xffff;
  for (let i = d[3] & 0xffff; i <= d[4]; ++i) {
    gScanlineEffectRegBuffers[gScanlineEffect.srcBuffer][i] = ((gSineTable[r3] * d[6]) >> 7) + d[2];
    r3 = (r3 + 8) & 0xff;
  }
  d[5] = (d[5] + 9) & 0xff;
}

function AnimOverheatFlame(sprite: Sprite): void {
  const yAmplitude = Math.trunc((gBattleAnimArgs[2] * 3) / 5);
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[4];
  sprite.data[1] = Cos(gBattleAnimArgs[1], gBattleAnimArgs[2]);
  sprite.data[2] = Sin(gBattleAnimArgs[1], yAmplitude);
  sprite.x += sprite.data[1] * gBattleAnimArgs[0];
  sprite.y += sprite.data[2] * gBattleAnimArgs[0];
  sprite.data[3] = gBattleAnimArgs[3];
  sprite.callback = AnimOverheatFlame_Step;
  for (let i = 0; i < 7; ++i) sUnusedOverheatData[i] = sprite.data[i];
}

function AnimOverheatFlame_Step(sprite: Sprite): void {
  sprite.data[4] += sprite.data[1];
  sprite.data[5] += sprite.data[2];
  sprite.x2 = Math.trunc(sprite.data[4] / 10);
  sprite.y2 = Math.trunc(sprite.data[5] / 10);
  if (++sprite.data[0] > sprite.data[3]) DestroyAnimSprite(sprite);
}

registerAnimSpriteCallbacks({
  AnimOutrageFlame, AnimDragonRageFirePlume, AnimDragonFireToTarget, AnimDragonDanceOrb, AnimOverheatFlame,
});

registerAnimTasks({ AnimTask_DragonDanceWaver });
