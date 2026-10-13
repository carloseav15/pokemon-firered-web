// battle_anim_mon_movement.c: tasks and dummy-sprite callbacks that move,
// shake, sway, scale and rotate the battlers' own sprites during move
// animations. Task data is s16 in the C; values that can overflow are wrapped.

import * as C from "../../generated/constants";
import { gSprites, type Sprite } from "../../hw/sprite";
import { Cos, Sin } from "../../hw/trig";
import {
  ANIM_ATK_PARTNER, ANIM_ATTACKER, ANIM_DEF_PARTNER, ANIM_TARGET, animState, DestroyAnimSprite, DestroyAnimVisualTask,
  GetAnimBattlerSpriteId, InitSpriteDataForLinearTranslation, IsBattlerSpriteVisible, PrepareBattlerSpriteForRotScale,
  ResetSpriteRotScale, SetBattlerSpriteYOffsetFromRotation, SetSpriteRotScale, StoreSpriteCallbackInData6,
  TranslateSpriteLinearById, TranslateSpriteLinearByIdFixedPoint,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { gBattlerSpriteIds } from "../globals";
import { GetBattlerAtPosition, GetBattlerSide } from "../util";
import { gBattleAnimArgs, gTasks, IsContest, s16 } from "./common";

const DISPLAY_WIDTH = 240;
const BIT_FLANK = 2;
const SPRITE_NONE = 0xff;
const abs = (x: number) => (x < 0 ? -x : x);

// Task to facilitate simple shaking of a pokemon's picture in battle.
// The shaking alternates between the original position and the target position.
// arg 0: anim battler
// arg 1: x pixel offset
// arg 2: y pixel offset
// arg 3: num times to shake
// arg 4: frame delay
export function AnimTask_ShakeMon(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[0]);
  if (spriteId === SPRITE_NONE) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  const d = gTasks[taskId].data;
  gSprites[spriteId].x2 = gBattleAnimArgs[1];
  gSprites[spriteId].y2 = gBattleAnimArgs[2];
  d[0] = spriteId;
  d[1] = gBattleAnimArgs[3];
  d[2] = gBattleAnimArgs[4];
  d[3] = gBattleAnimArgs[4];
  d[4] = gBattleAnimArgs[1];
  d[5] = gBattleAnimArgs[2];
  gTasks[taskId].func = AnimTask_ShakeMon_Step;
  gTasks[taskId].func(taskId);
}

function AnimTask_ShakeMon_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[3] === 0) {
    const sprite = gSprites[d[0]];
    if (sprite.x2 === 0) sprite.x2 = d[4];
    else sprite.x2 = 0;
    if (sprite.y2 === 0) sprite.y2 = d[5];
    else sprite.y2 = 0;
    d[3] = d[2];
    if (--d[1] === 0) {
      sprite.x2 = 0;
      sprite.y2 = 0;
      DestroyAnimVisualTask(taskId);
    }
  } else {
    d[3]--;
  }
}

// Task to facilitate simple shaking of a pokemon's picture in battle.
// The shaking alternates between the positive and negative versions of the specified pixel offsets.
// arg 0: anim battler
// arg 1: x pixel offset
// arg 2: y pixel offset
// arg 3: num times to shake
// arg 4: frame delay
export function AnimTask_ShakeMon2(taskId: number): void {
  let abort = false;
  let spriteId: number;
  if (gBattleAnimArgs[0] < C.MAX_BATTLERS_COUNT) {
    spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[0]);
    if (spriteId === SPRITE_NONE) abort = true;
  } else if (gBattleAnimArgs[0] !== 8) {
    let battlerId: number;
    switch (gBattleAnimArgs[0]) {
      case 4: battlerId = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT); break;
      case 5: battlerId = GetBattlerAtPosition(C.B_POSITION_PLAYER_RIGHT); break;
      case 6: battlerId = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT); break;
      default: battlerId = GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT); break;
    }
    if (!IsBattlerSpriteVisible(battlerId)) abort = true;
    spriteId = gBattlerSpriteIds[battlerId];
  } else {
    spriteId = gBattlerSpriteIds[animState.gBattleAnimAttacker];
  }
  if (abort) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  const d = gTasks[taskId].data;
  gSprites[spriteId].x2 = gBattleAnimArgs[1];
  gSprites[spriteId].y2 = gBattleAnimArgs[2];
  d[0] = spriteId;
  d[1] = gBattleAnimArgs[3];
  d[2] = gBattleAnimArgs[4];
  d[3] = gBattleAnimArgs[4];
  d[4] = gBattleAnimArgs[1];
  d[5] = gBattleAnimArgs[2];
  gTasks[taskId].func = AnimTask_ShakeMon2Step;
  gTasks[taskId].func(taskId);
}

function AnimTask_ShakeMon2Step(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[3] === 0) {
    const sprite = gSprites[d[0]];
    if (sprite.x2 === d[4]) sprite.x2 = -d[4];
    else sprite.x2 = d[4];
    if (sprite.y2 === d[5]) sprite.y2 = -d[5];
    else sprite.y2 = d[5];
    d[3] = d[2];
    if (--d[1] === 0) {
      sprite.x2 = 0;
      sprite.y2 = 0;
      DestroyAnimVisualTask(taskId);
    }
  } else {
    d[3]--;
  }
}

// Task to facilitate simple shaking of a pokemon's picture in battle.
// The shaking alternates between the positive and negative versions of the specified pixel offsets
// with respect to the current location of the mon's picture.
// arg 0: battler
// arg 1: x offset
// arg 2: y offset
// arg 3: num shakes
// arg 4: delay
export function AnimTask_ShakeMonInPlace(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[0]);
  if (spriteId === SPRITE_NONE) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  const d = gTasks[taskId].data;
  gSprites[spriteId].x2 += gBattleAnimArgs[1];
  gSprites[spriteId].y2 += gBattleAnimArgs[2];
  d[0] = spriteId;
  d[1] = 0;
  d[2] = gBattleAnimArgs[3];
  d[3] = 0;
  d[4] = gBattleAnimArgs[4];
  d[5] = s16(gBattleAnimArgs[1] * 2);
  d[6] = s16(gBattleAnimArgs[2] * 2);
  gTasks[taskId].func = AnimTask_ShakeMonInPlace_Step;
  gTasks[taskId].func(taskId);
}

function AnimTask_ShakeMonInPlace_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[3] === 0) {
    const sprite = gSprites[d[0]];
    if (d[1] & 1) {
      sprite.x2 += d[5];
      sprite.y2 += d[6];
    } else {
      sprite.x2 -= d[5];
      sprite.y2 -= d[6];
    }
    d[3] = d[4];
    if (++d[1] >= d[2]) {
      if (d[1] & 1) {
        sprite.x2 += Math.trunc(d[5] / 2);
        sprite.y2 += Math.trunc(d[6] / 2);
      } else {
        sprite.x2 -= Math.trunc(d[5] / 2);
        sprite.y2 -= Math.trunc(d[6] / 2);
      }
      DestroyAnimVisualTask(taskId);
    }
  } else {
    d[3]--;
  }
}

// Shakes a mon bg horizontally and moves it downward linearly.
// arg 0: battler
// arg 1: x offset
// arg 2: frame delay between each movement
// arg 3: downward speed (subpixel)
// arg 4: duration
export function AnimTask_ShakeAndSinkMon(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[0]);
  const d = gTasks[taskId].data;
  gSprites[spriteId].x2 = gBattleAnimArgs[1];
  d[0] = spriteId;
  d[1] = gBattleAnimArgs[1];
  d[2] = gBattleAnimArgs[2];
  d[3] = gBattleAnimArgs[3];
  d[4] = gBattleAnimArgs[4];
  gTasks[taskId].func = AnimTask_ShakeAndSinkMon_Step;
  gTasks[taskId].func(taskId);
}

function AnimTask_ShakeAndSinkMon_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  const spriteId = d[0] & 0xff;
  let x = d[1];
  if (d[2] === d[8]++) {
    d[8] = 0;
    if (gSprites[spriteId].x2 === x) x = -x;
    gSprites[spriteId].x2 += x;
  }
  d[1] = x;
  d[9] = s16(d[9] + d[3]);
  gSprites[spriteId].y2 = d[9] >> 8;
  if (--d[4] === 0) DestroyAnimVisualTask(taskId);
}

// Moves a mon bg picture along an elliptical path that begins
// and ends at the mon's origin location.
// arg 0: battler
// arg 1: ellipse width
// arg 2: ellipse height
// arg 3: num loops
// arg 4: speed (valid values are 0-5)
export function AnimTask_TranslateMonElliptical(taskId: number): void {
  let wavePeriod = 1;
  const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[0]);
  if (gBattleAnimArgs[4] > 5) gBattleAnimArgs[4] = 5;
  for (let i = 0; i < gBattleAnimArgs[4]; i++) wavePeriod = (wavePeriod * 2) & 0xff;
  const d = gTasks[taskId].data;
  d[0] = spriteId;
  d[1] = gBattleAnimArgs[1];
  d[2] = gBattleAnimArgs[2];
  d[3] = gBattleAnimArgs[3];
  d[4] = wavePeriod;
  gTasks[taskId].func = AnimTask_TranslateMonElliptical_Step;
  gTasks[taskId].func(taskId);
}

function AnimTask_TranslateMonElliptical_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  const spriteId = d[0] & 0xff;
  gSprites[spriteId].x2 = Sin(d[5], d[1]);
  gSprites[spriteId].y2 = -Cos(d[5], d[2]);
  gSprites[spriteId].y2 += d[2];
  d[5] += d[4];
  d[5] &= 0xff;
  if (d[5] === 0) d[3]--;
  if (d[3] === 0) {
    gSprites[spriteId].x2 = 0;
    gSprites[spriteId].y2 = 0;
    DestroyAnimVisualTask(taskId);
  }
}

// Moves a mon bg picture along an elliptical path that begins
// and ends at the mon's origin location. Reverses the direction
// of the path if it's not on the player's side of the battle.
export function AnimTask_TranslateMonEllipticalRespectSide(taskId: number): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[1] = -gBattleAnimArgs[1];
  AnimTask_TranslateMonElliptical(taskId);
}

// Performs a simple horizontal lunge, where the mon moves
// horizontally, and then moves back in the opposite direction.
// arg 0: duration of single lunge direction
// arg 1: x pixel delta that is applied each frame
function DoHorizontalLunge(sprite: Sprite): void {
  sprite.invisible = true;
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.data[1] = -gBattleAnimArgs[1];
  else sprite.data[1] = gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[0];
  sprite.data[2] = 0;
  sprite.data[3] = gBattlerSpriteIds[animState.gBattleAnimAttacker];
  sprite.data[4] = gBattleAnimArgs[0];
  StoreSpriteCallbackInData6(sprite, ReverseHorizontalLungeDirection);
  sprite.callback = TranslateSpriteLinearById;
}

function ReverseHorizontalLungeDirection(sprite: Sprite): void {
  sprite.data[0] = sprite.data[4];
  sprite.data[1] = -sprite.data[1];
  sprite.callback = TranslateSpriteLinearById;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Performs a simple vertical dipping motion, where moves vertically, and then
// moves back in the opposite direction.
// arg 0: duration of single dip direction
// arg 1: y pixel delta that is applied each frame
// arg 2: battler
function DoVerticalDip(sprite: Sprite): void {
  sprite.invisible = true;
  const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[2]);
  sprite.data[0] = gBattleAnimArgs[0];
  sprite.data[1] = 0;
  sprite.data[2] = gBattleAnimArgs[1];
  sprite.data[3] = spriteId;
  sprite.data[4] = gBattleAnimArgs[0];
  StoreSpriteCallbackInData6(sprite, ReverseVerticalDipDirection);
  sprite.callback = TranslateSpriteLinearById;
}

function ReverseVerticalDipDirection(sprite: Sprite): void {
  sprite.data[0] = sprite.data[4];
  sprite.data[2] = -sprite.data[2];
  sprite.callback = TranslateSpriteLinearById;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Linearly slides a mon's bg picture back to its original sprite position.
// The sprite parameter is a dummy sprite used for facilitating the movement with its callback.
// arg 0: 1 = target or 0 = attacker
// arg 1: direction (0 = horizontal and vertical, 1 = horizontal only, 2 = vertical only)
// arg 2: duration
function SlideMonToOriginalPos(sprite: Sprite): void {
  const spriteId = gBattleAnimArgs[0] === 0 ? gBattlerSpriteIds[animState.gBattleAnimAttacker] : gBattlerSpriteIds[animState.gBattleAnimTarget];
  const mon = gSprites[spriteId];
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[1] = mon.x + mon.x2;
  sprite.data[2] = mon.x;
  sprite.data[3] = mon.y + mon.y2;
  sprite.data[4] = mon.y;
  InitSpriteDataForLinearTranslation(sprite);
  sprite.data[3] = 0;
  sprite.data[4] = 0;
  sprite.data[5] = mon.x2;
  sprite.data[6] = mon.y2;
  sprite.invisible = true;
  if (gBattleAnimArgs[1] === 1) sprite.data[2] = 0;
  else if (gBattleAnimArgs[1] === 2) sprite.data[1] = 0;
  sprite.data[7] = gBattleAnimArgs[1];
  sprite.data[7] |= spriteId << 8;
  sprite.callback = SlideMonToOriginalPos_Step;
}

function SlideMonToOriginalPos_Step(sprite: Sprite): void {
  const data7 = sprite.data[7] & 0xff;
  const monSprite = gSprites[(sprite.data[7] >> 8) & 0xff];
  if (sprite.data[0] === 0) {
    if (data7 === 1 || data7 === 0) monSprite.x2 = 0;
    if (data7 === 2 || data7 === 0) monSprite.y2 = 0;
    DestroyAnimSprite(sprite);
  } else {
    sprite.data[0]--;
    sprite.data[3] += sprite.data[1];
    sprite.data[4] += sprite.data[2];
    monSprite.x2 = (sprite.data[3] >> 8) + sprite.data[5];
    monSprite.y2 = (sprite.data[4] >> 8) + sprite.data[6];
  }
}

// Linearly translates a mon to a target offset. The horizontal offset
// is mirrored for the opponent's pokemon, and the vertical offset
// is only mirrored if arg 3 is set to 1.
// arg 0: 0 = attacker, 1 = target
// arg 1: target x pixel offset
// arg 2: target y pixel offset
// arg 3: mirror vertical translation for opposite battle side
// arg 4: duration
function SlideMonToOffset(sprite: Sprite): void {
  const battlerId = gBattleAnimArgs[0] === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  const monSpriteId = gBattlerSpriteIds[battlerId];
  if (GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER) {
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
    if (gBattleAnimArgs[3] === 1) gBattleAnimArgs[2] = -gBattleAnimArgs[2];
  }
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[1] = gSprites[monSpriteId].x;
  sprite.data[2] = gSprites[monSpriteId].x + gBattleAnimArgs[1];
  sprite.data[3] = gSprites[monSpriteId].y;
  sprite.data[4] = gSprites[monSpriteId].y + gBattleAnimArgs[2];
  InitSpriteDataForLinearTranslation(sprite);
  sprite.data[3] = 0;
  sprite.data[4] = 0;
  sprite.data[5] = monSpriteId;
  sprite.invisible = true;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = TranslateSpriteLinearByIdFixedPoint;
}

function SlideMonToOffsetAndBack(sprite: Sprite): void {
  sprite.invisible = true;
  const battlerId = gBattleAnimArgs[0] === ANIM_ATTACKER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  const spriteId = gBattlerSpriteIds[battlerId];
  if (GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER) {
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
    if (gBattleAnimArgs[3] === 1) gBattleAnimArgs[2] = -gBattleAnimArgs[2];
  }
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[1] = gSprites[spriteId].x + gSprites[spriteId].x2;
  sprite.data[2] = sprite.data[1] + gBattleAnimArgs[1];
  sprite.data[3] = gSprites[spriteId].y + gSprites[spriteId].y2;
  sprite.data[4] = sprite.data[3] + gBattleAnimArgs[2];
  InitSpriteDataForLinearTranslation(sprite);
  sprite.data[3] = gSprites[spriteId].x2 << 8;
  sprite.data[4] = gSprites[spriteId].y2 << 8;
  sprite.data[5] = spriteId;
  sprite.data[6] = gBattleAnimArgs[5];
  if (gBattleAnimArgs[5] === 0) StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  else StoreSpriteCallbackInData6(sprite, SlideMonToOffsetAndBack_End);
  sprite.callback = TranslateSpriteLinearByIdFixedPoint;
}

function SlideMonToOffsetAndBack_End(sprite: Sprite): void {
  gSprites[sprite.data[5]].x2 = 0;
  gSprites[sprite.data[5]].y2 = 0;
  DestroyAnimSprite(sprite);
}

// Task to facilitate a two-part translation animation, in which the sprite
// is first translated in an arc to one position. Then, it "lunges" to a target
// x offset. Used in TAKE_DOWN, for example.
// arg 0: anim bank
// arg 1: horizontal speed (subpixel)
// arg 2: wave amplitude
// arg 3: first duration
// arg 4: delay before starting lunge
// arg 5: target x offset for lunge
// arg 6: lunge duration
export function AnimTask_WindUpLunge(taskId: number): void {
  const wavePeriod = Math.trunc(0x8000 / gBattleAnimArgs[3]) & 0xffff;
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
    gBattleAnimArgs[5] = -gBattleAnimArgs[5];
  }
  const d = gTasks[taskId].data;
  d[0] = GetAnimBattlerSpriteId(gBattleAnimArgs[0]);
  d[1] = s16(Math.trunc(gBattleAnimArgs[1] * 256 / gBattleAnimArgs[3]));
  d[2] = gBattleAnimArgs[2];
  d[3] = gBattleAnimArgs[3];
  d[4] = gBattleAnimArgs[4];
  d[5] = s16(Math.trunc(gBattleAnimArgs[5] * 256 / gBattleAnimArgs[6]));
  d[6] = gBattleAnimArgs[6];
  d[7] = s16(wavePeriod);
  gTasks[taskId].func = AnimTask_WindUpLunge_Step1;
}

function AnimTask_WindUpLunge_Step1(taskId: number): void {
  const d = gTasks[taskId].data;
  const spriteId = d[0] & 0xff;
  d[11] = s16(d[11] + d[1]);
  gSprites[spriteId].x2 = d[11] >> 8;
  gSprites[spriteId].y2 = Sin((d[10] >> 8) & 0xff, d[2]);
  d[10] = s16(d[10] + d[7]);
  if (--d[3] === 0) gTasks[taskId].func = AnimTask_WindUpLunge_Step2;
}

function AnimTask_WindUpLunge_Step2(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[4] > 0) {
    d[4]--;
  } else {
    const spriteId = d[0] & 0xff;
    d[12] = s16(d[12] + d[5]);
    gSprites[spriteId].x2 = (d[12] >> 8) + (d[11] >> 8);
    if (--d[6] === 0) DestroyAnimVisualTask(taskId);
  }
}

// To move a mon off-screen when pushed out by Roar/Whirlwind
export function AnimTask_SlideOffScreen(taskId: number): void {
  let spriteId: number;
  switch (gBattleAnimArgs[0]) {
    case ANIM_ATTACKER:
    case ANIM_TARGET:
      spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[0]);
      break;
    case ANIM_ATK_PARTNER:
      if (!IsBattlerSpriteVisible(animState.gBattleAnimAttacker ^ BIT_FLANK)) {
        DestroyAnimVisualTask(taskId);
        return;
      }
      spriteId = gBattlerSpriteIds[animState.gBattleAnimAttacker ^ BIT_FLANK];
      break;
    case ANIM_DEF_PARTNER:
      if (!IsBattlerSpriteVisible(animState.gBattleAnimTarget ^ BIT_FLANK)) {
        DestroyAnimVisualTask(taskId);
        return;
      }
      spriteId = gBattlerSpriteIds[animState.gBattleAnimTarget ^ BIT_FLANK];
      break;
    default:
      DestroyAnimVisualTask(taskId);
      return;
  }
  const d = gTasks[taskId].data;
  d[0] = spriteId;
  if (GetBattlerSide(animState.gBattleAnimTarget) !== C.B_SIDE_PLAYER) d[1] = gBattleAnimArgs[1];
  else d[1] = -gBattleAnimArgs[1];
  gTasks[taskId].func = AnimTask_SlideOffScreen_Step;
}

function AnimTask_SlideOffScreen_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  const sprite = gSprites[d[0] & 0xff];
  sprite.x2 += d[1];
  if (sprite.x2 + sprite.x < -32 || sprite.x2 + sprite.x > DISPLAY_WIDTH + 32) DestroyAnimVisualTask(taskId);
}

// Task that facilitates translating the mon bg picture back and forth
// in a swaying motion (uses Sine wave). It can sway either horizontally
// or vertically, but not both.
// arg 0: direction (0 = horizontal, 1 = vertical)
// arg 1: wave amplitude
// arg 2: wave period
// arg 3: num sways
// arg 4: which mon (0 = attacker, 1 = target)
export function AnimTask_SwayMon(taskId: number): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[1] = -gBattleAnimArgs[1];
  const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[4]);
  const d = gTasks[taskId].data;
  d[0] = gBattleAnimArgs[0];
  d[1] = gBattleAnimArgs[1];
  d[2] = gBattleAnimArgs[2];
  d[3] = gBattleAnimArgs[3];
  d[4] = spriteId;
  if (gBattleAnimArgs[4] === 0) d[5] = animState.gBattleAnimAttacker;
  else d[5] = animState.gBattleAnimTarget;
  d[12] = 1;
  gTasks[taskId].func = AnimTask_SwayMon_Step;
}

function AnimTask_SwayMon_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  const spriteId = d[4] & 0xff;
  const sineIndex = (d[10] + d[2]) & 0xffff;
  d[10] = s16(sineIndex);
  const waveIndex = sineIndex >>> 8;
  const sineValue = Sin(waveIndex, d[1]);
  if (d[0] === 0) gSprites[spriteId].x2 = sineValue;
  else if (GetBattlerSide(d[5]) === C.B_SIDE_PLAYER) gSprites[spriteId].y2 = abs(sineValue);
  else gSprites[spriteId].y2 = -abs(sineValue);

  if ((waveIndex > 0x7f && d[11] === 0 && d[12] === 1) || (waveIndex < 0x7f && d[11] === 1 && d[12] === 0)) {
    d[11] ^= 1;
    d[12] ^= 1;
    if (--d[3] === 0) {
      gSprites[spriteId].x2 = 0;
      gSprites[spriteId].y2 = 0;
      DestroyAnimVisualTask(taskId);
    }
  }
}

// Scales a mon's sprite, and then scales back to its original dimensions.
// arg 0: x scale delta
// arg 1: y scale delta
// arg 2: duration
// arg 3: anim bank
// arg 4: sprite object mode
export function AnimTask_ScaleMonAndRestore(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[3]);
  PrepareBattlerSpriteForRotScale(spriteId, gBattleAnimArgs[4]);
  const d = gTasks[taskId].data;
  d[0] = gBattleAnimArgs[0];
  d[1] = gBattleAnimArgs[1];
  d[2] = gBattleAnimArgs[2];
  d[3] = gBattleAnimArgs[2];
  d[4] = spriteId;
  d[10] = 0x100;
  d[11] = 0x100;
  gTasks[taskId].func = AnimTask_ScaleMonAndRestore_Step;
}

function AnimTask_ScaleMonAndRestore_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  d[10] = s16(d[10] + d[0]);
  d[11] = s16(d[11] + d[1]);
  const spriteId = d[4] & 0xff;
  SetSpriteRotScale(spriteId, d[10], d[11], 0);
  if (--d[2] === 0) {
    if (d[3] > 0) {
      d[0] = -d[0];
      d[1] = -d[1];
      d[2] = d[3];
      d[3] = 0;
    } else {
      ResetSpriteRotScale(spriteId);
      DestroyAnimVisualTask(taskId);
    }
  }
}

export function AnimTask_RotateMonSpriteToSide(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[2]);
  PrepareBattlerSpriteForRotScale(spriteId, 0);
  const d = gTasks[taskId].data;
  d[1] = 0;
  d[2] = gBattleAnimArgs[0];
  if (gBattleAnimArgs[3] !== 1) d[3] = 0;
  else d[3] = s16(gBattleAnimArgs[0] * gBattleAnimArgs[1]);
  d[4] = gBattleAnimArgs[1];
  d[5] = spriteId;
  d[6] = gBattleAnimArgs[3];
  if (IsContest()) {
    d[7] = 1;
  } else if (gBattleAnimArgs[2] === ANIM_ATTACKER) {
    d[7] = GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER ? 1 : 0;
  } else {
    d[7] = GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER ? 1 : 0;
  }
  if (d[7] && !IsContest()) {
    d[3] = s16(-d[3]);
    d[4] = s16(-d[4]);
  }
  gTasks[taskId].func = AnimTask_RotateMonSpriteToSide_Step;
}

// Rotates mon to side and back to original position. For Peck and when a held item activates
export function AnimTask_RotateMonToSideAndRestore(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[2]);
  PrepareBattlerSpriteForRotScale(spriteId, 0);
  const d = gTasks[taskId].data;
  d[1] = 0;
  d[2] = gBattleAnimArgs[0];
  if (gBattleAnimArgs[2] === ANIM_ATTACKER) {
    if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[1] = -gBattleAnimArgs[1];
  } else if (GetBattlerSide(animState.gBattleAnimTarget) !== C.B_SIDE_PLAYER) {
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
  }
  if (gBattleAnimArgs[3] !== 1) d[3] = 0;
  else d[3] = s16(gBattleAnimArgs[0] * gBattleAnimArgs[1]);
  d[4] = gBattleAnimArgs[1];
  d[5] = spriteId;
  d[6] = gBattleAnimArgs[3];
  d[7] = 1;
  if (d[7]) {
    d[3] = s16(-d[3]);
    d[4] = s16(-d[4]);
  }
  gTasks[taskId].func = AnimTask_RotateMonSpriteToSide_Step;
}

function AnimTask_RotateMonSpriteToSide_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  d[3] = s16(d[3] + d[4]);
  SetSpriteRotScale(d[5], 0x100, 0x100, d[3] & 0xffff);
  if (d[7]) SetBattlerSpriteYOffsetFromRotation(d[5]);
  if (++d[1] >= d[2]) {
    switch (d[6]) {
      case 1:
        ResetSpriteRotScale(d[5]);
      // fallthrough
      case 0:
      default:
        DestroyAnimVisualTask(taskId);
        break;
      case 2:
        d[1] = 0;
        d[4] *= -1;
        d[6] = 1;
        break;
    }
  }
}

export function AnimTask_ShakeTargetBasedOnMovePowerOrDmg(taskId: number): void {
  const d = gTasks[taskId].data;
  if (gBattleAnimArgs[0] === 0) {
    d[15] = s16(Math.trunc(animState.gAnimMovePower / 12));
    if (d[15] < 1) d[15] = 1;
    if (d[15] > 16) d[15] = 16;
  } else {
    d[15] = s16(Math.trunc(animState.gAnimMoveDmg / 12));
    if (d[15] < 1) d[15] = 1;
    if (d[15] > 16) d[15] = 16;
  }
  d[14] = Math.trunc(d[15] / 2);
  d[13] = d[14] + (d[15] & 1);
  d[12] = 0;
  d[10] = gBattleAnimArgs[3];
  d[11] = gBattleAnimArgs[4];
  d[7] = GetAnimBattlerSpriteId(ANIM_TARGET);
  d[8] = gSprites[d[7]].x2;
  d[9] = gSprites[d[7]].y2;
  d[0] = 0;
  d[1] = gBattleAnimArgs[1];
  d[2] = gBattleAnimArgs[2];
  gTasks[taskId].func = AnimTask_ShakeTargetBasedOnMovePowerOrDmg_Step;
}

function AnimTask_ShakeTargetBasedOnMovePowerOrDmg_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  if (++d[0] > d[1]) {
    d[0] = 0;
    d[12] = (d[12] + 1) & 1;
    if (d[10]) {
      if (d[12]) gSprites[d[7]].x2 = d[8] + d[13];
      else gSprites[d[7]].x2 = d[8] - d[14];
    }
    if (d[11]) {
      if (d[12]) gSprites[d[7]].y2 = d[15];
      else gSprites[d[7]].y2 = 0;
    }
    if (!--d[2]) {
      gSprites[d[7]].x2 = 0;
      gSprites[d[7]].y2 = 0;
      DestroyAnimVisualTask(taskId);
    }
  }
}

registerAnimSpriteCallbacks({
  DoHorizontalLunge, DoVerticalDip, SlideMonToOriginalPos, SlideMonToOffset, SlideMonToOffsetAndBack,
});

registerAnimTasks({
  AnimTask_ShakeMon, AnimTask_ShakeMon2, AnimTask_ShakeMonInPlace, AnimTask_ShakeAndSinkMon, AnimTask_TranslateMonElliptical,
  AnimTask_TranslateMonEllipticalRespectSide, AnimTask_WindUpLunge, AnimTask_SlideOffScreen, AnimTask_SwayMon,
  AnimTask_ScaleMonAndRestore, AnimTask_RotateMonSpriteToSide, AnimTask_RotateMonToSideAndRestore,
  AnimTask_ShakeTargetBasedOnMovePowerOrDmg,
});
