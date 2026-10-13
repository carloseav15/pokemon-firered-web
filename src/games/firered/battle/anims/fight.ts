// battle_anim_fight.c: fists and feet (punches, kicks, Cross Chop, Stomp),
// Dizzy Punch, Brick Break walls, Superpower orb/rocks/fireball, Arm Thrust,
// Revenge, Focus Punch and the Sky Uppercut background.

import * as C from "../../generated/constants";
import { SetGpuReg } from "../../hw/gpu";
import {
  CreateSprite, DestroySprite, FreeOamMatrix, gSprites, MAX_SPRITES, SpriteCallbackDummy, ST_OAM_HFLIP, ST_OAM_VFLIP,
  StartSpriteAffineAnim, StartSpriteAnim, type Sprite,
} from "../../hw/sprite";
import { Sin } from "../../hw/trig";
import { random } from "../../random";
import {
  ANIM_ATTACKER, animState, AnimTranslateLinear, AnimTranslateLinear_WithFollowup, AnimTravelDiagonally, DestroyAnimSprite,
  DestroyAnimVisualTask, DestroySpriteAndMatrix, GetBattlerSpriteBGPriority, GetBattlerSpriteCoord, GetBattlerSpriteCoordAttr,
  InitAnimLinearTranslation, InitSpritePosToAnimAttacker, InitSpritePosToAnimTarget, RunStoredCallbackWhenAnimEnds,
  SetAnimSpriteInitialXOffset, StartAnimLinearTranslation, StoreSpriteCallbackInData6, ToggleBg3Mode, WaitAnimForDuration,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { G, gBattlerPositions } from "../globals";
import { BATTLE_PARTNER } from "../macros";
import { GetBattlerPosition, GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, s16 } from "./common";

const BIT_SIDE = 1;

// Blaze Kick / Meteor Mash
function AnimUnusedHumanoidFoot(sprite: Sprite): void {
  SetAnimSpriteInitialXOffset(sprite, gBattleAnimArgs[0]);
  sprite.y += gBattleAnimArgs[1];
  sprite.data[0] = 15;
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimSlideHandOrFootToTarget(sprite: Sprite): void {
  if (gBattleAnimArgs[7] === 1 && GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
    gBattleAnimArgs[3] = -gBattleAnimArgs[3];
  }
  StartSpriteAnim(sprite, gBattleAnimArgs[6]);
  gBattleAnimArgs[6] = 0;
  AnimTravelDiagonally(sprite);
}

function AnimJumpKick(sprite: Sprite): void {
  if (IsContest()) {
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
    gBattleAnimArgs[3] = -gBattleAnimArgs[3];
  }
  AnimSlideHandOrFootToTarget(sprite);
}

// Displays a basic fist or foot sprite for a given duration.
// Used by many fighting moves (and elemental "punch" moves).
function AnimBasicFistOrFoot(sprite: Sprite): void {
  StartSpriteAnim(sprite, gBattleAnimArgs[4]);
  if (gBattleAnimArgs[3] === 0) InitSpritePosToAnimAttacker(sprite, true);
  else InitSpritePosToAnimTarget(sprite, true);
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimFistOrFootRandomPos(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  if (gBattleAnimArgs[2] < 0) gBattleAnimArgs[2] = random() % 5;
  StartSpriteAnim(sprite, gBattleAnimArgs[2]);
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET);
  const xMod = s16(Math.trunc(GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_WIDTH) / 2));
  const yMod = s16(Math.trunc(GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_HEIGHT) / 4));
  let x = s16(random() % xMod);
  let y = s16(random() % yMod);
  if (random() & 1) x *= -1;
  if (random() & 1) y *= -1;
  if ((gBattlerPositions[battler] & BIT_SIDE) === C.B_SIDE_PLAYER) y = s16(y + 0xfff0);
  sprite.x += x;
  sprite.y += y;
  sprite.data[0] = gBattleAnimArgs[1];
  sprite.data[7] = CreateSprite(animTemplate("gBasicHitSplatSpriteTemplate"), sprite.x, sprite.y, sprite.subpriority + 1);
  if (sprite.data[7] !== MAX_SPRITES) {
    StartSpriteAffineAnim(gSprites[sprite.data[7]], 0);
    gSprites[sprite.data[7]].callback = SpriteCallbackDummy;
  }
  sprite.callback = AnimFistOrFootRandomPos_Step;
}

function AnimFistOrFootRandomPos_Step(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    if (sprite.data[7] !== MAX_SPRITES) {
      FreeOamMatrix(gSprites[sprite.data[7]].oam.matrixNum);
      DestroySprite(gSprites[sprite.data[7]]);
    }
    DestroyAnimSprite(sprite);
  } else {
    --sprite.data[0];
  }
}

function AnimCrossChopHand(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, true);
  sprite.data[0] = 30;
  if (gBattleAnimArgs[2] === 0) {
    sprite.data[2] = sprite.x - 20;
  } else {
    sprite.data[2] = sprite.x + 20;
    sprite.hFlip = 1;
  }
  sprite.data[4] = sprite.y - 20;
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, AnimCrossChopHand_Step);
}

function AnimCrossChopHand_Step(sprite: Sprite): void {
  if (++sprite.data[5] === 11) {
    sprite.data[2] = sprite.x - sprite.x2;
    sprite.data[4] = sprite.y - sprite.y2;
    sprite.data[0] = 8;
    sprite.x += sprite.x2;
    sprite.y += sprite.y2;
    sprite.y2 = 0;
    sprite.x2 = 0;
    sprite.callback = StartAnimLinearTranslation;
    StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  }
}

// Rolling Kick / Low Kick
function AnimSlidingKick(sprite: Sprite): void {
  if (BATTLE_PARTNER(animState.gBattleAnimAttacker) === animState.gBattleAnimTarget && GetBattlerPosition(animState.gBattleAnimTarget) < C.B_POSITION_PLAYER_RIGHT)
    gBattleAnimArgs[0] *= -1;
  InitSpritePosToAnimTarget(sprite, true);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[2] = -gBattleAnimArgs[2];
  sprite.data[0] = gBattleAnimArgs[3];
  sprite.data[1] = sprite.x;
  sprite.data[2] = sprite.x + gBattleAnimArgs[2];
  sprite.data[3] = sprite.y;
  sprite.data[4] = sprite.y;
  InitAnimLinearTranslation(sprite);
  sprite.data[5] = gBattleAnimArgs[5];
  sprite.data[6] = gBattleAnimArgs[4];
  sprite.data[7] = 0;
  sprite.callback = AnimSlidingKick_Step;
}

function AnimSlidingKick_Step(sprite: Sprite): void {
  if (!AnimTranslateLinear(sprite)) {
    sprite.y2 += Sin(sprite.data[7] >> 8, sprite.data[5]);
    sprite.data[7] += sprite.data[6];
  } else {
    DestroyAnimSprite(sprite);
  }
}

// Animates the spinning, shrinking kick or punch, which then
// reappears at full size. Used by moves such as MOVE_MEGA_PUNCH and MOVE_MEGA_KICK.
function AnimSpinningKickOrPunch(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, true);
  StartSpriteAnim(sprite, gBattleAnimArgs[2]);
  sprite.data[0] = gBattleAnimArgs[3];
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, AnimSpinningKickOrPunchFinish);
}

function AnimSpinningKickOrPunchFinish(sprite: Sprite): void {
  StartSpriteAffineAnim(sprite, 0);
  sprite.affineAnimPaused = true;
  sprite.data[0] = 20;
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Animates MOVE_STOMP's foot that slides downward.
function AnimStompFoot(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, true);
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.callback = AnimStompFootStep;
}

function AnimStompFootStep(sprite: Sprite): void {
  if (--sprite.data[0] === -1) {
    sprite.data[0] = 6;
    sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
    sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
    sprite.callback = StartAnimLinearTranslation;
    StoreSpriteCallbackInData6(sprite, AnimStompFootEnd);
  }
}

function AnimStompFootEnd(sprite: Sprite): void {
  sprite.data[0] = 15;
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimDizzyPunchDuck(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    InitSpritePosToAnimTarget(sprite, true);
    sprite.data[1] = gBattleAnimArgs[2];
    sprite.data[2] = gBattleAnimArgs[3];
    ++sprite.data[0];
  } else {
    sprite.data[4] += sprite.data[1];
    sprite.x2 = sprite.data[4] >> 8;
    sprite.y2 = Sin(sprite.data[3], sprite.data[2]);
    sprite.data[3] = (sprite.data[3] + 3) & 0xff;
    if (sprite.data[3] > 100) sprite.invisible = (sprite.data[3] % 2) !== 0;
    if (sprite.data[3] > 120) DestroyAnimSprite(sprite);
  }
}

// The wall that appears when Brick Break is going to shatter the target's defensive wall
function AnimBrickBreakWall(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X);
  sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y);
  sprite.x += gBattleAnimArgs[1];
  sprite.y += gBattleAnimArgs[2];
  sprite.data[0] = 0;
  sprite.data[1] = gBattleAnimArgs[3];
  sprite.data[2] = gBattleAnimArgs[4];
  sprite.data[3] = 0;
  sprite.callback = AnimBrickBreakWall_Step;
}

function AnimBrickBreakWall_Step(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      if (--sprite.data[1] === 0) {
        if (sprite.data[2] === 0) DestroyAnimSprite(sprite);
        else ++sprite.data[0];
      }
      break;
    case 1:
      if (++sprite.data[1] > 1) {
        sprite.data[1] = 0;
        ++sprite.data[3];
        if (sprite.data[3] & 1) sprite.x2 = 2;
        else sprite.x2 = -2;
      }
      if (--sprite.data[2] === 0) DestroyAnimSprite(sprite);
      break;
  }
}

// Piece of shattered defensive wall flies off. Used by Brick Break when the target has a defensive wall
function AnimBrickBreakWallShard(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === ANIM_ATTACKER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X) + gBattleAnimArgs[2];
  sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y) + gBattleAnimArgs[3];
  sprite.oam.tileNum += gBattleAnimArgs[1] * 16;
  sprite.data[0] = 0;
  switch (gBattleAnimArgs[1]) {
    case 0: sprite.data[6] = -3; sprite.data[7] = -3; break;
    case 1: sprite.data[6] = 3; sprite.data[7] = -3; break;
    case 2: sprite.data[6] = -3; sprite.data[7] = 3; break;
    case 3: sprite.data[6] = 3; sprite.data[7] = 3; break;
    default:
      DestroyAnimSprite(sprite);
      return;
  }
  sprite.callback = AnimBrickBreakWallShard_Step;
}

function AnimBrickBreakWallShard_Step(sprite: Sprite): void {
  sprite.x += sprite.data[6];
  sprite.y += sprite.data[7];
  if (++sprite.data[0] > 40) DestroyAnimSprite(sprite);
}

function AnimSuperpowerOrb(sprite: Sprite): void {
  if (gBattleAnimArgs[0] === 0) {
    // Uses gBattlerAttacker for the position, as in the C.
    sprite.x = GetBattlerSpriteCoord(G.gBattlerAttacker, C.BATTLER_COORD_X_2);
    sprite.y = GetBattlerSpriteCoord(G.gBattlerAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
    sprite.oam.priority = GetBattlerSpriteBGPriority(animState.gBattleAnimAttacker);
    sprite.data[7] = animState.gBattleAnimTarget;
  } else {
    sprite.oam.priority = GetBattlerSpriteBGPriority(animState.gBattleAnimTarget);
    sprite.data[7] = animState.gBattleAnimAttacker;
  }
  sprite.data[0] = 0;
  sprite.data[1] = 12;
  sprite.data[2] = 8;
  sprite.callback = AnimSuperpowerOrb_Step;
}

function AnimSuperpowerOrb_Step(sprite: Sprite): void {
  if (++sprite.data[0] === 180) {
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    sprite.data[0] = 16;
    sprite.data[1] = sprite.x;
    sprite.data[2] = GetBattlerSpriteCoord(sprite.data[7], C.BATTLER_COORD_X_2);
    sprite.data[3] = sprite.y;
    sprite.data[4] = GetBattlerSpriteCoord(sprite.data[7], C.BATTLER_COORD_Y_PIC_OFFSET);
    InitAnimLinearTranslation(sprite);
    StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
    sprite.callback = AnimTranslateLinear_WithFollowup;
  }
}

// battle_anim_mons.c StorePointerInVars / LoadPointerFromVars: a u32 split over two s16.
function StorePointerInVars(sprite: Sprite, lo: number, hi: number, value: number): void {
  sprite.data[lo] = value & 0xffff;
  sprite.data[hi] = (value >>> 16) & 0xffff;
}
function LoadPointerFromVars(sprite: Sprite, lo: number, hi: number): number {
  return ((sprite.data[lo] & 0xffff) | ((sprite.data[hi] & 0xffff) << 16)) >>> 0;
}

// Floating rock that flies off to hit the target. Used by Superpower
function AnimSuperpowerRock(sprite: Sprite): void {
  sprite.x = gBattleAnimArgs[0];
  sprite.y = 120;
  sprite.data[0] = gBattleAnimArgs[3];
  StorePointerInVars(sprite, 4, 5, sprite.y << 8);
  sprite.data[6] = gBattleAnimArgs[1];
  sprite.oam.tileNum += gBattleAnimArgs[2] * 4;
  sprite.callback = AnimSuperpowerRock_Step1;
}

function AnimSuperpowerRock_Step1(sprite: Sprite): void {
  if (sprite.data[0] !== 0) {
    let var0 = LoadPointerFromVars(sprite, 4, 5);
    var0 = (var0 - sprite.data[6]) >>> 0;
    StorePointerInVars(sprite, 4, 5, var0);
    sprite.y = (var0 | 0) >> 8;
    if (sprite.y < -8) DestroyAnimSprite(sprite);
    else --sprite.data[0];
  } else {
    const pos0 = s16(GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2));
    const pos1 = s16(GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET));
    const pos2 = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2));
    const pos3 = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET));
    sprite.data[0] = pos2 - pos0;
    sprite.data[1] = pos3 - pos1;
    sprite.data[2] = sprite.x << 4;
    sprite.data[3] = sprite.y << 4;
    sprite.callback = AnimSuperpowerRock_Step2;
  }
}

function AnimSuperpowerRock_Step2(sprite: Sprite): void {
  sprite.data[2] += sprite.data[0];
  sprite.data[3] += sprite.data[1];
  sprite.x = sprite.data[2] >> 4;
  sprite.y = sprite.data[3] >> 4;
  const edgeX = (sprite.x + 8) & 0xffff;
  if (edgeX > 256 || sprite.y < -8 || sprite.y > 120) DestroyAnimSprite(sprite);
}

function AnimSuperpowerFireball(sprite: Sprite): void {
  let battler: number;
  if (gBattleAnimArgs[0] === ANIM_ATTACKER) {
    sprite.x = GetBattlerSpriteCoord(G.gBattlerAttacker, C.BATTLER_COORD_X_2);
    sprite.y = GetBattlerSpriteCoord(G.gBattlerAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
    battler = animState.gBattleAnimTarget;
    sprite.oam.priority = GetBattlerSpriteBGPriority(animState.gBattleAnimAttacker);
  } else {
    battler = animState.gBattleAnimAttacker;
    sprite.oam.priority = GetBattlerSpriteBGPriority(animState.gBattleAnimTarget);
  }
  if (IsContest()) sprite.oam.matrixNum |= ST_OAM_HFLIP;
  else if (GetBattlerSide(battler) === C.B_SIDE_PLAYER) sprite.oam.matrixNum |= ST_OAM_HFLIP | ST_OAM_VFLIP;
  sprite.data[0] = 16;
  sprite.data[1] = sprite.x;
  sprite.data[2] = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2);
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET);
  InitAnimLinearTranslation(sprite);
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = AnimTranslateLinear_WithFollowup;
}

function AnimArmThrustHit_Step(sprite: Sprite): void {
  if (sprite.data[0] === sprite.data[4]) DestroyAnimSprite(sprite);
  ++sprite.data[0];
}

function AnimArmThrustHit(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[1] = gBattleAnimArgs[3];
  sprite.data[2] = gBattleAnimArgs[0];
  sprite.data[3] = gBattleAnimArgs[1];
  sprite.data[4] = gBattleAnimArgs[2];
  let turn = animState.gAnimMoveTurn & 0xff;
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) turn = (turn + 1) & 0xff;
  if (turn & 1) {
    sprite.data[2] = -sprite.data[2];
    ++sprite.data[1];
  }
  StartSpriteAnim(sprite, sprite.data[1]);
  sprite.x2 = sprite.data[2];
  sprite.y2 = sprite.data[3];
  sprite.callback = AnimArmThrustHit_Step;
}

function AnimRevengeScratch(sprite: Sprite): void {
  if (gBattleAnimArgs[2] === ANIM_ATTACKER) InitSpritePosToAnimAttacker(sprite, false);
  else InitSpritePosToAnimTarget(sprite, false);
  if (IsContest()) StartSpriteAnim(sprite, 2);
  else if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) StartSpriteAnim(sprite, 1);
  sprite.callback = RunStoredCallbackWhenAnimEnds;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Fist shrinks toward target and shakes
function AnimFocusPunchFist(sprite: Sprite): void {
  if (sprite.affineAnimEnded) {
    sprite.data[1] = (sprite.data[1] + 40) & 0xff;
    sprite.x2 = Sin(sprite.data[1], 2);
    if (++sprite.data[0] > 40) DestroyAnimSprite(sprite);
  }
}

function AnimTask_MoveSkyUppercutBg(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0:
      ToggleBg3Mode(false);
      d[8] = gBattleAnimArgs[0];
      ++d[0];
      break;
    case 1:
      if (--d[8] === -1) ++d[0];
      break;
    case 2:
    default:
      d[9] = s16(d[9] + 1280);
      break;
  }
  d[10] = s16(d[10] + 2816);
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) G.gBattle_BG3_X += d[9] >> 8;
  else G.gBattle_BG3_X -= d[9] >> 8;
  G.gBattle_BG3_Y += d[10] >> 8;
  d[9] &= 0xff;
  d[10] &= 0xff;
  if (gBattleAnimArgs[7] === -1) {
    G.gBattle_BG3_X = 0;
    G.gBattle_BG3_Y = 0;
    ToggleBg3Mode(true);
    DestroyAnimVisualTask(taskId);
  }
}

registerAnimSpriteCallbacks({
  AnimUnusedHumanoidFoot, AnimSlideHandOrFootToTarget, AnimJumpKick, AnimBasicFistOrFoot, AnimFistOrFootRandomPos,
  AnimCrossChopHand, AnimSlidingKick, AnimSpinningKickOrPunch, AnimStompFoot, AnimDizzyPunchDuck, AnimBrickBreakWall,
  AnimBrickBreakWallShard, AnimSuperpowerOrb, AnimSuperpowerRock, AnimSuperpowerFireball, AnimArmThrustHit, AnimRevengeScratch,
  AnimFocusPunchFist,
});

registerAnimTasks({ AnimTask_MoveSkyUppercutBg });
