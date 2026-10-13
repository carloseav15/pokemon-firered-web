// battle_anim_fire.c: fire move sprite callbacks (Ember, Fire Punch, Fire Blast,
// Sunny Day, Eruption, Will-O-Wisp, Heat Wave) and their visual tasks.
// Templates, anims and affine anims come from cdata/battle_anim_fire.json.

import * as C from "../../generated/constants";
import { BG_PLTT_ID, BlendPalette } from "../../hw/palette";
import { CreateSprite, DestroySprite, gSprites, MAX_SPRITES, ST_OAM_OBJ_NORMAL, StartSpriteAnim, type Sprite } from "../../hw/sprite";
import { Cos, Sin } from "../../hw/trig";
import {
  ANIM_ATTACKER, ANIM_DEF_PARTNER, ANIM_TARGET, animState, AnimTranslateLinear, AnimTravelDiagonally, BattleAnimHelper_RunSpriteSquash,
  BattleAnimHelper_SetSpriteSquashParams, DestroyAnimSprite, DestroyAnimVisualTask, DestroySpriteAndMatrix, GetAnimBattlerSpriteId,
  GetBattleAnimBg1Data, GetBattlerSpriteBGPriority, GetBattlerSpriteCoord, InitAnimLinearTranslation, InitAnimLinearTranslationWithSpeed,
  InitSpritePosToAnimAttacker, IsBattlerSpriteVisible, PrepareBattlerSpriteForRotScale, ResetSpriteRotScale, SetAnimSpriteInitialXOffset,
  SetBattlerSpriteYOffsetFromYScale, SetSpriteCoordsToAnimAttackerCoords, StartAnimLinearTranslation, StoreSpriteCallbackInData6,
  TranslateSpriteInGrowingCircle, TranslateSpriteLinear, TranslateSpriteLinearFixedPoint, WaitAnimForDuration,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { gBattlerSpriteIds } from "../globals";
import { GetBattlerAtPosition, GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, PlaySE12WithPanning } from "./common";

const DISPLAY_WIDTH = 240;
const BIT_FLANK = 2;

const sEruptionLaunchRockSpeeds: [number, number][] = [
  [-2, -5], [-1, -1], [3, -6], [4, -2], [2, -8], [-5, -5], [4, -7],
];

// Directions for shaking up/down or left/right in AnimTask_ShakeTargetInPattern
// Only first 10 values are ever accessed.
// First pattern results in larger shakes, second results in faster oscillation
const sShakeDirsPattern0 = [-1, -1, 0, 1, 1, 0, 0, -1, -1, 1, 1, 0, 0, -1, 0, 1];
const sShakeDirsPattern1 = [-1, 0, 1, 0, -1, 1, 0, -1, 0, 1, 0, -1, 0, 1, 0, 1];

// For the first stage of Fire Punch
function AnimFireSpiralInward(sprite: Sprite): void {
  sprite.data[0] = gBattleAnimArgs[0];
  sprite.data[1] = 0x3c;
  sprite.data[2] = 0x9;
  sprite.data[3] = 0x1e;
  sprite.data[4] = 0xfe00;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = TranslateSpriteInGrowingCircle;
  sprite.callback(sprite);
}

// For the impact spread of fire sprites for moves like Blaze Kick or Fire Punch
function AnimFireSpread(sprite: Sprite): void {
  SetAnimSpriteInitialXOffset(sprite, gBattleAnimArgs[0]);
  sprite.y += gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[1] = gBattleAnimArgs[2];
  sprite.data[2] = gBattleAnimArgs[3];
  sprite.callback = TranslateSpriteLinearFixedPoint;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimFirePlume(sprite: Sprite): void {
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.x -= gBattleAnimArgs[0];
    sprite.y += gBattleAnimArgs[1];
    sprite.data[2] = -gBattleAnimArgs[4];
  } else {
    sprite.x += gBattleAnimArgs[0];
    sprite.y += gBattleAnimArgs[1];
    sprite.data[2] = gBattleAnimArgs[4];
  }
  sprite.data[1] = gBattleAnimArgs[2];
  sprite.data[4] = gBattleAnimArgs[3];
  sprite.data[3] = gBattleAnimArgs[5];
  sprite.callback = AnimLargeFlame_Step;
}

function AnimLargeFlame(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.x -= gBattleAnimArgs[0];
    sprite.y += gBattleAnimArgs[1];
    sprite.data[2] = gBattleAnimArgs[4];
  } else {
    sprite.x += gBattleAnimArgs[0];
    sprite.y += gBattleAnimArgs[1];
    sprite.data[2] = -gBattleAnimArgs[4];
  }
  sprite.data[1] = gBattleAnimArgs[2];
  sprite.data[4] = gBattleAnimArgs[3];
  sprite.data[3] = gBattleAnimArgs[5];
  sprite.callback = AnimLargeFlame_Step;
}

function AnimLargeFlame_Step(sprite: Sprite): void {
  if (++sprite.data[0] < sprite.data[4]) {
    sprite.x2 += sprite.data[2];
    sprite.y2 += sprite.data[3];
  }
  if (sprite.data[0] === sprite.data[1]) DestroySpriteAndMatrix(sprite);
}

function AnimUnusedSmallEmber(sprite: Sprite): void {
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.x -= gBattleAnimArgs[0];
  } else {
    sprite.x += gBattleAnimArgs[0];
    sprite.subpriority = 8;
  }
  sprite.y += gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[1] = gBattleAnimArgs[3];
  sprite.data[2] = gBattleAnimArgs[4];
  sprite.data[3] = gBattleAnimArgs[5];
  sprite.data[4] = gBattleAnimArgs[6];
  sprite.data[5] = 0;
  sprite.callback = AnimUnusedSmallEmber_Step;
}

function AnimUnusedSmallEmber_Step(sprite: Sprite): void {
  if (sprite.data[3]) {
    if (sprite.data[5] > 10000) sprite.subpriority = 1;
    sprite.x2 = Sin(sprite.data[0], sprite.data[1] + (sprite.data[5] >> 8));
    sprite.y2 = Cos(sprite.data[0], sprite.data[1] + (sprite.data[5] >> 8));
    sprite.data[0] += sprite.data[2];
    sprite.data[5] += sprite.data[4];
    if (sprite.data[0] > 255) sprite.data[0] -= 256;
    else if (sprite.data[0] < 0) sprite.data[0] += 256;
    --sprite.data[3];
  } else {
    DestroySpriteAndMatrix(sprite);
  }
}

// Sunlight from Sunny Day / sunny weather
function AnimSunlight(sprite: Sprite): void {
  sprite.x = 0;
  sprite.y = 0;
  sprite.data[0] = 60;
  sprite.data[2] = 140;
  sprite.data[4] = 80;
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Animates the secondary effect of MOVE_EMBER, where the flames grow and slide
// horizontally a bit.
function AnimEmberFlare(sprite: Sprite): void {
  const { gBattleAnimAttacker, gBattleAnimTarget } = animState;
  if (GetBattlerSide(gBattleAnimAttacker) === GetBattlerSide(gBattleAnimTarget)
    && (gBattleAnimAttacker === GetBattlerAtPosition(C.B_POSITION_PLAYER_RIGHT)
      || gBattleAnimAttacker === GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT)))
    gBattleAnimArgs[2] = -gBattleAnimArgs[2];
  sprite.callback = AnimTravelDiagonally;
  sprite.callback(sprite);
}

function AnimBurnFlame(sprite: Sprite): void {
  gBattleAnimArgs[0] = -gBattleAnimArgs[0];
  gBattleAnimArgs[2] = -gBattleAnimArgs[2];
  sprite.callback = AnimTravelDiagonally;
}

// Animates the a fire sprite in the first-half of the MOVE_FIRE_BLAST
// animation. The fire sprite first moves in a circle around the mon,
// and then it is translated towards the target mon, while still rotating.
// Lastly, it moves in a circle around the target mon.
function AnimFireRing(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[7] = gBattleAnimArgs[2];
  sprite.data[0] = 0;
  sprite.callback = AnimFireRing_Step1;
}

function AnimFireRing_Step1(sprite: Sprite): void {
  UpdateFireRingCircleOffset(sprite);
  if (++sprite.data[0] === 0x12) {
    sprite.data[0] = 0x19;
    sprite.data[1] = sprite.x;
    sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
    sprite.data[3] = sprite.y;
    sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
    InitAnimLinearTranslation(sprite);
    sprite.callback = AnimFireRing_Step2;
  }
}

function AnimFireRing_Step2(sprite: Sprite): void {
  if (AnimTranslateLinear(sprite)) {
    sprite.data[0] = 0;
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
    sprite.x2 = sprite.y2 = 0;
    sprite.callback = AnimFireRing_Step3;
    sprite.callback(sprite);
  } else {
    sprite.x2 += Sin(sprite.data[7], 28);
    sprite.y2 += Cos(sprite.data[7], 28);
    sprite.data[7] = (sprite.data[7] + 20) & 0xff;
  }
}

function AnimFireRing_Step3(sprite: Sprite): void {
  UpdateFireRingCircleOffset(sprite);
  if (++sprite.data[0] === 0x1f) DestroyAnimSprite(sprite);
}

function UpdateFireRingCircleOffset(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[7], 28);
  sprite.y2 = Cos(sprite.data[7], 28);
  sprite.data[7] = (sprite.data[7] + 20) & 0xff;
}

function AnimFireCross(sprite: Sprite): void {
  sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[1] = gBattleAnimArgs[3];
  sprite.data[2] = gBattleAnimArgs[4];
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = TranslateSpriteLinear;
}

function AnimFireSpiralOutward(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[1] = gBattleAnimArgs[2];
  sprite.data[0] = gBattleAnimArgs[3];
  sprite.invisible = true;
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, AnimFireSpiralOutward_Step1);
}

function AnimFireSpiralOutward_Step1(sprite: Sprite): void {
  sprite.invisible = false;
  sprite.data[0] = sprite.data[1];
  sprite.data[1] = 0;
  sprite.callback = AnimFireSpiralOutward_Step2;
  sprite.callback(sprite);
}

function AnimFireSpiralOutward_Step2(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[1], sprite.data[2] >> 8);
  sprite.y2 = Cos(sprite.data[1], sprite.data[2] >> 8);
  sprite.data[1] = (sprite.data[1] + 10) & 0xff;
  sprite.data[2] += 0xd0;
  if (--sprite.data[0] === -1) DestroyAnimSprite(sprite);
}

const IDX_ACTIVE_SPRITES = 6; // Used by the sprite callback to modify the number of active sprites

// task data
const tState = 0;
const tTimer1 = 1;
const tTimer2 = 2;
const tTimer3 = 3;
const tAttackerY = 4;
const tAttackerSide = 5;
const tActiveSprites = IDX_ACTIVE_SPRITES;
// data[8]-data[15] used by BattleAnimHelper_SetSpriteSquashParams / BattleAnimHelper_RunSpriteSquash
const tAttackerSpriteId = 15;

// sprite data
const sSpeedDelay = 0;
const sLaunchStage = 1;
const sX = 2;
const sY = 3;
const sSpeedX = 4;
const sSpeedY = 5;
const sTaskId = 6;
const sActiveSpritesIdx = 7;

// Animates first stage of Eruption where the attacker squishes and launches rocks away from themself
function AnimTask_EruptionLaunchRocks(taskId: number): void {
  const task = gTasks[taskId];
  task.data[tAttackerSpriteId] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.data[tState] = 0;
  task.data[tTimer1] = 0;
  task.data[tTimer2] = 0;
  task.data[tTimer3] = 0;
  task.data[tAttackerY] = gSprites[task.data[tAttackerSpriteId]].y;
  task.data[tAttackerSide] = GetBattlerSide(animState.gBattleAnimAttacker);
  task.data[tActiveSprites] = 0;
  PrepareBattlerSpriteForRotScale(task.data[15], ST_OAM_OBJ_NORMAL);
  task.func = AnimTask_EruptionLaunchRocks_Step;
}

function AnimTask_EruptionLaunchRocks_Step(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  const attacker = () => gSprites[d[tAttackerSpriteId]];
  switch (d[tState]) {
    case 0:
      BattleAnimHelper_SetSpriteSquashParams(task, d[tAttackerSpriteId], 0x100, 0x100, 0xe0, 0x200, 32);
      d[tState]++;
    // fallthrough
    case 1:
      if (++d[tTimer1] > 1) {
        d[tTimer1] = 0;
        if (++d[tTimer2] & 1) attacker().x2 = 3;
        else attacker().x2 = -3;
      }
      if (d[tAttackerSide] !== C.B_SIDE_PLAYER) {
        if (++d[tTimer3] > 4) {
          d[tTimer3] = 0;
          attacker().y++;
        }
      }
      if (!BattleAnimHelper_RunSpriteSquash(task)) {
        SetBattlerSpriteYOffsetFromYScale(d[tAttackerSpriteId]);
        attacker().x2 = 0;
        d[tTimer1] = 0;
        d[tTimer2] = 0;
        d[tTimer3] = 0;
        d[tState]++;
      }
      break;
    case 2:
      if (++d[tTimer1] > 4) {
        if (d[tAttackerSide] !== C.B_SIDE_PLAYER)
          BattleAnimHelper_SetSpriteSquashParams(task, d[tAttackerSpriteId], 0xe0, 0x200, 0x180, 0xf0, 6);
        else
          BattleAnimHelper_SetSpriteSquashParams(task, d[tAttackerSpriteId], 0xe0, 0x200, 0x180, 0xc0, 6);
        d[tTimer1] = 0;
        d[tState]++;
      }
      break;
    case 3:
      if (!BattleAnimHelper_RunSpriteSquash(task)) {
        CreateEruptionLaunchRocks(d[tAttackerSpriteId], taskId, IDX_ACTIVE_SPRITES);
        d[tState]++;
      }
      break;
    case 4:
      if (++d[tTimer1] > 1) {
        d[tTimer1] = 0;
        if (++d[tTimer2] & 1) attacker().y2 += 3;
        else attacker().y2 -= 3;
      }
      if (++d[tTimer3] > 24) {
        if (d[tAttackerSide] !== C.B_SIDE_PLAYER)
          BattleAnimHelper_SetSpriteSquashParams(task, d[tAttackerSpriteId], 0x180, 0xf0, 0x100, 0x100, 8);
        else
          BattleAnimHelper_SetSpriteSquashParams(task, d[tAttackerSpriteId], 0x180, 0xc0, 0x100, 0x100, 8);
        if (d[tTimer2] & 1) attacker().y2 -= 3;
        d[tTimer1] = 0;
        d[tTimer2] = 0;
        d[tTimer3] = 0;
        d[tState]++;
      }
      break;
    case 5:
      if (d[tAttackerSide] !== C.B_SIDE_PLAYER) attacker().y--;
      if (!BattleAnimHelper_RunSpriteSquash(task)) {
        attacker().y = d[tAttackerY];
        ResetSpriteRotScale(d[tAttackerSpriteId]);
        d[tTimer2] = 0;
        d[tState]++;
      }
      break;
    case 6:
      if (d[tActiveSprites] === 0) DestroyAnimVisualTask(taskId);
      break;
    default:
      break;
  }
}

function CreateEruptionLaunchRocks(spriteId: number, taskId: number, activeSpritesIdx: number): void {
  const y = GetEruptionLaunchRockInitialYPos(spriteId);
  let x = gSprites[spriteId].x & 0xffff;
  let sign: number;
  if (!GetBattlerSide(animState.gBattleAnimAttacker)) {
    x = (x - 12) & 0xffff;
    sign = 1;
  } else {
    x = (x + 16) & 0xffff;
    sign = -1;
  }
  for (let i = 0, j = 0; i <= 6; i++) {
    const newSpriteId = CreateSprite(animTemplate("gEruptionLaunchRockSpriteTemplate"), (x << 16) >> 16, (y << 16) >> 16, 2);
    if (newSpriteId !== MAX_SPRITES) {
      gSprites[newSpriteId].oam.tileNum += j * 4 + 0x40;
      if (++j >= 5) j = 0;
      InitEruptionLaunchRockCoordData(gSprites[newSpriteId], sEruptionLaunchRockSpeeds[i][0] * sign, sEruptionLaunchRockSpeeds[i][1]);
      gSprites[newSpriteId].data[sTaskId] = taskId;
      gSprites[newSpriteId].data[sActiveSpritesIdx] = activeSpritesIdx;
      gTasks[taskId].data[activeSpritesIdx]++;
    }
  }
}

function AnimEruptionLaunchRock(sprite: Sprite): void {
  UpdateEruptionLaunchRockPos(sprite);
  if (sprite.invisible) {
    gTasks[sprite.data[sTaskId]].data[sprite.data[sActiveSpritesIdx]]--;
    DestroySprite(sprite);
  }
}

function GetEruptionLaunchRockInitialYPos(spriteId: number): number {
  let y = (gSprites[spriteId].y + gSprites[spriteId].y2 + gSprites[spriteId].centerToCornerVecY) << 16 >> 16;
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) y += 74;
  else y += 44;
  return y & 0xffff;
}

function InitEruptionLaunchRockCoordData(sprite: Sprite, speedX: number, speedY: number): void {
  sprite.data[sSpeedDelay] = 0;
  sprite.data[sLaunchStage] = 0;
  sprite.data[sX] = (sprite.x & 0xffff) * 8;
  sprite.data[sY] = (sprite.y & 0xffff) * 8;
  sprite.data[sSpeedX] = speedX * 8;
  sprite.data[sSpeedY] = speedY * 8;
}

function UpdateEruptionLaunchRockPos(sprite: Sprite): void {
  if (++sprite.data[sSpeedDelay] > 2) {
    sprite.data[sSpeedDelay] = 0;
    ++sprite.data[sLaunchStage];
    const stage = sprite.data[sLaunchStage] & 0xffff;
    sprite.data[sY] += stage * stage;
  }
  sprite.data[sX] += sprite.data[sSpeedX];
  sprite.x = sprite.data[sX] >> 3;
  sprite.data[sY] += sprite.data[sSpeedY];
  sprite.y = sprite.data[sY] >> 3;
  if (sprite.x < -8 || sprite.x > DISPLAY_WIDTH + 8 || sprite.y < -8 || sprite.y > 120) sprite.invisible = true;
}

// AnimEruptionFallingRock sprite data
const sState = 0;
const sBounceTimer = 1;
const sBounceDir = 2;
const sEndTimer = 3;
const sFallDelay = 6;
const sTargetY = 7;

function AnimEruptionFallingRock(sprite: Sprite): void {
  sprite.x = gBattleAnimArgs[0];
  sprite.y = gBattleAnimArgs[1];
  sprite.data[sState] = 0;
  sprite.data[sBounceTimer] = 0;
  sprite.data[sBounceDir] = 0;
  sprite.data[sFallDelay] = gBattleAnimArgs[2];
  sprite.data[sTargetY] = gBattleAnimArgs[3];
  sprite.oam.tileNum += gBattleAnimArgs[4] * 16;
  sprite.callback = AnimEruptionFallingRock_Step;
}

function AnimEruptionFallingRock_Step(sprite: Sprite): void {
  switch (sprite.data[sState]) {
    case 0:
      // Wait to begin falling
      if (sprite.data[sFallDelay] !== 0) {
        sprite.data[sFallDelay]--;
        return;
      }
      sprite.data[sState]++;
    // fallthrough
    case 1:
      // Rock is falling
      sprite.y += 8;
      if (sprite.y >= sprite.data[sTargetY]) {
        sprite.y = sprite.data[sTargetY];
        sprite.data[sState]++;
      }
      break;
    case 2:
      // Bounce up and down on landing spot
      if (++sprite.data[sBounceTimer] > 1) {
        sprite.data[sBounceTimer] = 0;
        if ((++sprite.data[sBounceDir] & 1) !== 0) sprite.y2 = -3;
        else sprite.y2 = 3;
      }
      if (++sprite.data[sEndTimer] > 16) DestroyAnimSprite(sprite);
      break;
  }
}

function AnimWillOWispOrb(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      InitSpritePosToAnimAttacker(sprite, false);
      StartSpriteAnim(sprite, gBattleAnimArgs[2]);
      sprite.data[7] = gBattleAnimArgs[2];
      if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.data[4] = 4;
      else sprite.data[4] = -4;
      sprite.oam.priority = GetBattlerSpriteBGPriority(animState.gBattleAnimTarget);
      ++sprite.data[0];
      break;
    case 1:
      sprite.data[1] += 192;
      if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.y2 = -(sprite.data[1] >> 8);
      else sprite.y2 = sprite.data[1] >> 8;
      sprite.x2 = Sin(sprite.data[2], sprite.data[4]);
      sprite.data[2] = (sprite.data[2] + 4) & 0xff;
      if (++sprite.data[3] === 1) {
        sprite.data[3] = 0;
        ++sprite.data[0];
      }
      break;
    case 2:
      sprite.x2 = Sin(sprite.data[2], sprite.data[4]);
      sprite.data[2] = (sprite.data[2] + 4) & 0xff;
      if (++sprite.data[3] === 31) {
        sprite.x += sprite.x2;
        sprite.y += sprite.y2;
        sprite.x2 = sprite.y2 = 0;
        sprite.data[0] = 256;
        sprite.data[1] = sprite.x;
        sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
        sprite.data[3] = sprite.y;
        sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
        InitAnimLinearTranslationWithSpeed(sprite);
        sprite.callback = AnimWillOWispOrb_Step;
      }
      break;
  }
}

function AnimWillOWispOrb_Step(sprite: Sprite): void {
  if (!AnimTranslateLinear(sprite)) {
    sprite.x2 += Sin(sprite.data[5], 16);
    const initialData5 = sprite.data[5];
    sprite.data[5] = (sprite.data[5] + 4) & 0xff;
    const newData5 = sprite.data[5];
    if ((initialData5 === 0 || initialData5 > 196) && newData5 > 0 && sprite.data[7] === 0)
      PlaySE12WithPanning(C.SE_M_FLAME_WHEEL, animState.gAnimCustomPanning);
  } else {
    DestroyAnimSprite(sprite);
  }
}

function AnimWillOWispFire(sprite: Sprite): void {
  if (!sprite.data[0]) {
    sprite.data[1] = gBattleAnimArgs[0];
    ++sprite.data[0];
  }
  sprite.data[3] += 0xc0 * 2;
  sprite.data[4] += 0xa0;
  sprite.x2 = Sin(sprite.data[1], sprite.data[3] >> 8);
  sprite.y2 = Cos(sprite.data[1], sprite.data[4] >> 8);
  sprite.data[1] = (sprite.data[1] + 7) & 0xff;
  if (!IsContest()) {
    if (sprite.data[1] < 64 || sprite.data[1] > 195) sprite.oam.priority = GetBattlerSpriteBGPriority(animState.gBattleAnimTarget);
    else sprite.oam.priority = GetBattlerSpriteBGPriority(animState.gBattleAnimTarget) + 1;
  } else {
    if (sprite.data[1] < 64 || sprite.data[1] > 195) sprite.subpriority = 0x1d;
    else sprite.subpriority = 0x1f;
  }
  if (++sprite.data[2] > 0x14) sprite.invisible = !sprite.invisible;
  if (sprite.data[2] === 0x1e) DestroyAnimSprite(sprite);
}

function AnimTask_MoveHeatWaveTargets(taskId: number): void {
  const task = gTasks[taskId];
  task.data[12] = GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER ? 1 : -1;
  task.data[13] = (IsBattlerSpriteVisible(animState.gBattleAnimTarget ^ BIT_FLANK) ? 1 : 0) + 1;
  task.data[14] = GetAnimBattlerSpriteId(ANIM_TARGET);
  task.data[15] = GetAnimBattlerSpriteId(ANIM_DEF_PARTNER);
  task.func = AnimTask_MoveHeatWaveTargets_Step;
}

function AnimTask_MoveHeatWaveTargets_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  const shake = (): void => {
    for (d[3] = 0; d[3] < d[13]; d[3]++) gSprites[d[d[3] + 14]].x2 = d[10] + d[11];
  };
  switch (d[0]) {
    case 0:
      d[10] += d[12] * 2;
      if (++d[1] >= 2) {
        d[1] = 0;
        ++d[2];
        d[11] = d[2] & 1 ? 2 : -2;
      }
      shake();
      if (++d[9] === 16) {
        d[9] = 0;
        ++d[0];
      }
      break;
    case 1:
      if (++d[1] >= 5) {
        d[1] = 0;
        ++d[2];
        d[11] = d[2] & 1 ? 2 : -2;
      }
      shake();
      if (++d[9] === 96) {
        d[9] = 0;
        ++d[0];
      }
      break;
    case 2:
      d[10] -= d[12] * 2;
      if (++d[1] >= 2) {
        d[1] = 0;
        ++d[2];
        d[11] = d[2] & 1 ? 2 : -2;
      }
      shake();
      if (++d[9] === 16) ++d[0];
      break;
    case 3:
      for (d[3] = 0; d[3] < d[13]; d[3]++) gSprites[d[d[3] + 14]].x2 = 0;
      DestroyAnimVisualTask(taskId);
      break;
  }
}

// Used to add a color mask to the battle background.
// arg 0: opacity
// arg 1: color code
function AnimTask_BlendBackground(taskId: number): void {
  const animBg = GetBattleAnimBg1Data();
  BlendPalette(BG_PLTT_ID(animBg.paletteId), 16, gBattleAnimArgs[0], gBattleAnimArgs[1]);
  DestroyAnimVisualTask(taskId);
}

// AnimTask_ShakeTargetInPattern task data
const tShakeNum = 0;
const tMaxShakes = 1;
const tShakeOffset = 2; // Never read, gBattleAnimArgs[1] is used directly instead
const tVertical = 3;
const tPatternId = 4;

// Shakes target horizontally or vertically tMaxShakes times, following a set pattern of alternations
function AnimTask_ShakeTargetInPattern(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[tShakeNum] === 0) {
    d[tMaxShakes] = gBattleAnimArgs[0];
    d[tShakeOffset] = gBattleAnimArgs[1];
    d[tVertical] = gBattleAnimArgs[2];
    d[tPatternId] = gBattleAnimArgs[3];
  }
  d[tShakeNum]++;
  const spriteId = gBattlerSpriteIds[animState.gBattleAnimTarget];
  const dir = d[tPatternId] === 0 ? sShakeDirsPattern0[d[tShakeNum] % 10] : sShakeDirsPattern1[d[tShakeNum] % 10];
  if (d[tVertical] === 1)
    gSprites[spriteId].y2 = gBattleAnimArgs[1] * dir < 0 ? -(gBattleAnimArgs[1] * dir) : gBattleAnimArgs[1] * dir;
  else
    gSprites[spriteId].x2 = gBattleAnimArgs[1] * dir;
  if (d[tShakeNum] === d[tMaxShakes]) {
    gSprites[spriteId].x2 = 0;
    gSprites[spriteId].y2 = 0;
    DestroyAnimVisualTask(taskId);
  }
}

registerAnimSpriteCallbacks({
  AnimFireSpiralInward, AnimFireSpread, AnimLargeFlame, AnimFirePlume, AnimUnusedSmallEmber, AnimSunlight, AnimEmberFlare,
  AnimBurnFlame, AnimFireRing, AnimFireCross, AnimFireSpiralOutward, AnimEruptionLaunchRock, AnimEruptionFallingRock,
  AnimWillOWispOrb, AnimWillOWispFire,
});

registerAnimTasks({
  AnimTask_EruptionLaunchRocks, AnimTask_MoveHeatWaveTargets, AnimTask_BlendBackground, AnimTask_ShakeTargetInPattern,
});
