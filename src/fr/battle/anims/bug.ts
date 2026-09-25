// battle_anim_bug.c: Megahorn, Leech Life, String Shot / Spider Web, Twineedle /
// Pin Missile stingers and Tail Glow sprite callbacks.

import * as C from "../../generated/constants";
import { SetGpuReg } from "../../hw/gpu";
import { BLDALPHA_BLEND } from "../../hw/ppu";
import { StartSpriteAffineAnim, type Sprite } from "../../hw/sprite";
import { Sin } from "../../hw/trig";
import {
  ANIM_ATTACKER, animState, AnimTranslateLinear, ArcTan2Neg, DestroyAnimSprite, DestroySpriteAndMatrix, GetBattlerSpriteCoord,
  GetBattlerSpriteCoord2, InitAnimArcTranslation, InitAnimLinearTranslationWithSpeed, InitSpritePosToAnimAttacker,
  RunStoredCallbackWhenAffineAnimEnds, SetAverageBattlerPositions, StartAnimLinearTranslation, StoreSpriteCallbackInData6,
  TranslateAnimHorizontalArc, TrySetSpriteRotScale,
} from "../anim";
import { registerAnimSpriteCallbacks } from "../animRegistry";
import { GetBattlerPosition, GetBattlerSide } from "../util";
import { gBattleAnimArgs, IsContest } from "./common";

function AnimMegahornHorn(sprite: Sprite): void {
  const target = animState.gBattleAnimTarget;
  if (IsContest()) {
    StartSpriteAffineAnim(sprite, 2);
    gBattleAnimArgs[2] = -gBattleAnimArgs[2];
    gBattleAnimArgs[0] = -gBattleAnimArgs[0];
  } else if (GetBattlerSide(target) === C.B_SIDE_PLAYER) {
    StartSpriteAffineAnim(sprite, 1);
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
    gBattleAnimArgs[2] = -gBattleAnimArgs[2];
    gBattleAnimArgs[3] = -gBattleAnimArgs[3];
    gBattleAnimArgs[0] = -gBattleAnimArgs[0];
  }
  sprite.x = GetBattlerSpriteCoord2(target, C.BATTLER_COORD_X_2) + gBattleAnimArgs[0];
  sprite.y = GetBattlerSpriteCoord2(target, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[2] = GetBattlerSpriteCoord(target, C.BATTLER_COORD_X_2) + gBattleAnimArgs[2];
  sprite.data[4] = GetBattlerSpriteCoord(target, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[3];
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimLeechLifeNeedle(sprite: Sprite): void {
  const target = animState.gBattleAnimTarget;
  if (IsContest()) {
    gBattleAnimArgs[0] = -gBattleAnimArgs[0];
    StartSpriteAffineAnim(sprite, 2);
  } else if (GetBattlerSide(target) === C.B_SIDE_PLAYER) {
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
    gBattleAnimArgs[0] = -gBattleAnimArgs[0];
  }
  sprite.x = GetBattlerSpriteCoord2(target, C.BATTLER_COORD_X_2) + gBattleAnimArgs[0];
  sprite.y = GetBattlerSpriteCoord2(target, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[2] = GetBattlerSpriteCoord(target, C.BATTLER_COORD_X_2);
  sprite.data[4] = GetBattlerSpriteCoord(target, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Creates a single web thread that travels from attacker to target.
// Used by MOVE_STRING_SHOT and MOVE_SPIDER_WEB in their first move phase.
// arg 0: x
// arg 1: y
// arg 2: controls the left-to-right movement
// arg 3: amplitude
// arg 4: if targets both opponents
function AnimTranslateWebThread(sprite: Sprite): void {
  if (IsContest()) gBattleAnimArgs[2] = Math.trunc(gBattleAnimArgs[2] / 2);
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[1] = sprite.x;
  sprite.data[3] = sprite.y;
  if (!gBattleAnimArgs[4]) {
    sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
    sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  } else {
    const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, true);
    sprite.data[2] = pos.x;
    sprite.data[4] = pos.y;
  }
  InitAnimLinearTranslationWithSpeed(sprite);
  sprite.data[5] = gBattleAnimArgs[3];
  sprite.callback = AnimTranslateWebThread_Step;
}

function AnimTranslateWebThread_Step(sprite: Sprite): void {
  if (AnimTranslateLinear(sprite)) {
    DestroyAnimSprite(sprite);
    return;
  }
  sprite.x2 += Sin(sprite.data[6], sprite.data[5]);
  sprite.data[6] = (sprite.data[6] + 13) & 0xff;
}

function AnimStringWrap(sprite: Sprite): void {
  const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, false);
  sprite.x = pos.x;
  sprite.y = pos.y;
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x -= gBattleAnimArgs[0];
  else sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) sprite.y += 8;
  sprite.callback = AnimStringWrap_Step;
}

function AnimStringWrap_Step(sprite: Sprite): void {
  if (++sprite.data[0] === 3) {
    sprite.data[0] = 0;
    sprite.invisible = !sprite.invisible;
  }
  if (++sprite.data[1] === 51) DestroyAnimSprite(sprite);
}

function AnimSpiderWeb(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16, 0));
  sprite.data[0] = 16;
  sprite.callback = AnimSpiderWeb_Step;
}

function AnimSpiderWeb_Step(sprite: Sprite): void {
  if (sprite.data[2] < 20) {
    ++sprite.data[2];
  } else if (sprite.data[1]++ & 1) {
    --sprite.data[0];
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[0], 16 - sprite.data[0]));
    if (sprite.data[0] === 0) {
      sprite.invisible = true;
      sprite.callback = AnimSpiderWeb_End;
    }
  }
}

function AnimSpiderWeb_End(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
  DestroyAnimSprite(sprite);
}

// Translates a stinger sprite linearly to a destination location. The sprite is
// initially rotated so that it appears to be traveling in a straight line.
// arg 0: initial x pixel offset
// arg 1: initial y pixel offset
// arg 2: target x pixel offset
// arg 3: target y pixel offset
// arg 4: duration
function AnimTranslateStinger(sprite: Sprite): void {
  const { gBattleAnimAttacker, gBattleAnimTarget } = animState;
  if (IsContest()) {
    gBattleAnimArgs[2] = -gBattleAnimArgs[2];
  } else if (GetBattlerSide(gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    gBattleAnimArgs[2] = -gBattleAnimArgs[2];
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
    gBattleAnimArgs[3] = -gBattleAnimArgs[3];
  }
  if (!IsContest() && GetBattlerSide(gBattleAnimAttacker) === GetBattlerSide(gBattleAnimTarget)) {
    if (GetBattlerPosition(gBattleAnimTarget) === C.B_POSITION_PLAYER_LEFT || GetBattlerPosition(gBattleAnimTarget) === C.B_POSITION_OPPONENT_LEFT) {
      gBattleAnimArgs[2] = -gBattleAnimArgs[2];
      gBattleAnimArgs[0] = -gBattleAnimArgs[0];
    }
  }
  InitSpritePosToAnimAttacker(sprite, true);
  const lVarX = ((GetBattlerSpriteCoord(gBattleAnimTarget, C.BATTLER_COORD_X_2) + gBattleAnimArgs[2]) << 16) >> 16;
  const lVarY = ((GetBattlerSpriteCoord(gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[3]) << 16) >> 16;
  let rot = ArcTan2Neg(lVarX - sprite.x, lVarY - sprite.y);
  rot = (rot + 0xc000) & 0xffff;
  TrySetSpriteRotScale(sprite, false, 0x100, 0x100, rot);
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[2] = lVarX;
  sprite.data[4] = lVarY;
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Rotates sprite and moves it in an arc, so that it appears like a missle or arrow traveling.
// arg 0: initial x pixel offset
// arg 1: initial y pixel offset
// arg 2: target x pixel offset
// arg 3: target y pixel offset
// arg 4: duration
// arg 5: wave amplitude
function AnimMissileArc(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[2] = -gBattleAnimArgs[2];
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + gBattleAnimArgs[2];
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[3];
  sprite.data[5] = gBattleAnimArgs[5];
  InitAnimArcTranslation(sprite);
  sprite.callback = AnimMissileArc_Step;
  sprite.invisible = true;
}

function AnimMissileArc_Step(sprite: Sprite): void {
  sprite.invisible = false;
  if (TranslateAnimHorizontalArc(sprite)) {
    DestroyAnimSprite(sprite);
  } else {
    const tempData = Int16Array.from(sprite.data);
    const x1 = sprite.x & 0xffff;
    let x2 = sprite.x2;
    const y1 = sprite.y & 0xffff;
    let y2 = sprite.y2;
    x2 = ((x2 + x1) << 16) >> 16;
    y2 = ((y2 + y1) << 16) >> 16;
    if (!TranslateAnimHorizontalArc(sprite)) {
      let rotation = ArcTan2Neg(sprite.x + sprite.x2 - x2, sprite.y + sprite.y2 - y2);
      rotation = (rotation + 0xc000) & 0xffff;
      TrySetSpriteRotScale(sprite, false, 0x100, 0x100, rotation);
      sprite.data.set(tempData);
    }
  }
}

function AnimTailGlowOrb(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === ANIM_ATTACKER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET) + 18;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
}

registerAnimSpriteCallbacks({
  AnimMegahornHorn, AnimLeechLifeNeedle, AnimTranslateWebThread, AnimStringWrap, AnimSpiderWeb, AnimTranslateStinger,
  AnimMissileArc, AnimTailGlowOrb,
});
