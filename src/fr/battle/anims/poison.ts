// battle_anim_poison.c: Sludge / Acid projectiles, Sludge Bomb particles, acid
// droplets and the rising bubble after-effect.

import * as C from "../../generated/constants";
import { StartSpriteAnim, type Sprite } from "../../hw/sprite";
import { Sin } from "../../hw/trig";
import {
  animState, DestroyAnimSprite, GetBattlerSpriteCoord, InitAnimArcTranslation, InitSpriteDataForLinearTranslation,
  InitSpritePosToAnimAttacker, InitSpritePosToAnimTarget, SetAverageBattlerPositions, StartAnimLinearTranslation,
  StoreSpriteCallbackInData6, TranslateAnimHorizontalArc, TranslateSpriteLinearFixedPoint,
} from "../anim";
import { registerAnimSpriteCallbacks } from "../animRegistry";
import { GetBattlerSide } from "../util";
import { gBattleAnimArgs } from "./common";

function AnimSludgeProjectile(sprite: Sprite): void {
  if (!gBattleAnimArgs[3]) StartSpriteAnim(sprite, 2);
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[5] = -30;
  InitAnimArcTranslation(sprite);
  sprite.callback = AnimSludgeProjectile_Step;
}

function AnimSludgeProjectile_Step(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) DestroyAnimSprite(sprite);
}

function AnimAcidPoisonBubble(sprite: Sprite): void {
  if (!gBattleAnimArgs[3]) StartSpriteAnim(sprite, 2);
  InitSpritePosToAnimAttacker(sprite, true);
  const { x: l1, y: l2 } = SetAverageBattlerPositions(animState.gBattleAnimTarget, true);
  if (GetBattlerSide(animState.gBattleAnimAttacker)) gBattleAnimArgs[4] = -gBattleAnimArgs[4];
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[2] = l1 + gBattleAnimArgs[4];
  sprite.data[4] = l2 + gBattleAnimArgs[5];
  sprite.data[5] = -30;
  InitAnimArcTranslation(sprite);
  sprite.callback = AnimAcidPoisonBubble_Step;
}

function AnimAcidPoisonBubble_Step(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) DestroyAnimSprite(sprite);
}

function AnimSludgeBombHitParticle(sprite: Sprite): void {
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[1] = sprite.x;
  sprite.data[2] = sprite.x + gBattleAnimArgs[0];
  sprite.data[3] = sprite.y;
  sprite.data[4] = sprite.y + gBattleAnimArgs[1];
  InitSpriteDataForLinearTranslation(sprite);
  sprite.data[5] = Math.trunc(sprite.data[1] / gBattleAnimArgs[2]);
  sprite.data[6] = Math.trunc(sprite.data[2] / gBattleAnimArgs[2]);
  sprite.callback = AnimSludgeBombHitParticle_Step;
}

function AnimSludgeBombHitParticle_Step(sprite: Sprite): void {
  TranslateSpriteLinearFixedPoint(sprite);
  sprite.data[1] -= sprite.data[5];
  sprite.data[2] -= sprite.data[6];
  if (!sprite.data[0]) DestroyAnimSprite(sprite);
}

function AnimAcidPoisonDroplet(sprite: Sprite): void {
  const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, true);
  sprite.x = pos.x;
  sprite.y = pos.y;
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[0] = -gBattleAnimArgs[0];
  sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[2] = sprite.x + gBattleAnimArgs[2];
  sprite.data[4] = sprite.y + sprite.data[0];
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Animates a bubble by rising upward, swaying side to side, and
// enlarging the sprite. This is used as an after-effect by poison-type
// moves, along with MOVE_BUBBLE, and MOVE_BUBBLEBEAM.
// arg 0: initial x pixel offset
// arg 1: initial y pixel offset
// arg 2: 0 = single-target, 1 = multi-target
export function AnimBubbleEffect(sprite: Sprite): void {
  if (!gBattleAnimArgs[2]) {
    InitSpritePosToAnimTarget(sprite, true);
  } else {
    const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, true);
    sprite.x = pos.x;
    sprite.y = pos.y;
    if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[0] = -gBattleAnimArgs[0];
    sprite.x += gBattleAnimArgs[0];
    sprite.y += gBattleAnimArgs[1];
  }
  sprite.callback = AnimBubbleEffect_Step;
}

function AnimBubbleEffect_Step(sprite: Sprite): void {
  sprite.data[0] = (sprite.data[0] + 0xb) & 0xff;
  sprite.x2 = Sin(sprite.data[0], 4);
  sprite.data[1] += 0x30;
  sprite.y2 = -(sprite.data[1] >> 8);
  if (sprite.affineAnimEnded) DestroyAnimSprite(sprite);
}

registerAnimSpriteCallbacks({
  AnimSludgeProjectile, AnimAcidPoisonBubble, AnimSludgeBombHitParticle, AnimAcidPoisonDroplet, AnimBubbleEffect,
});
