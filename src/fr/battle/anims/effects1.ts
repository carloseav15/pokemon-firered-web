// battle_anim_effects_1.c: sprite callbacks and tasks shared by many move
// animations (powders, Solar Beam, leaves, roots, item steal, Present, Knock
// Off, Mimic, Sing notes, Lock-On, Bide/Detect/Protect, Metronome finger,
// Minimize, Splash, Swagger, Sketch, Nature Power, and so on).

import * as C from "../../generated/constants";
import { random } from "../../random";
import { cdata } from "../../hw/assets";
import { ClearGpuRegBits, SetGpuReg, SetGpuRegBits } from "../../hw/gpu";
import {
  BeginNormalPaletteFade, BlendPalette, BlendPalettes, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, OBJ_PLTT_ID, RGB,
  RGB_BLACK, RGB_WHITE,
} from "../../hw/palette";
import { BLDALPHA_BLEND } from "../../hw/ppu";
import {
  AllocSpritePalette, ChangeSpriteAffineAnim, CreateSprite, CreateSpriteAndAnimate, DestroySprite, FreeSpritePaletteByTag, gSprites,
  IndexOfSpritePaletteTag, MAX_SPRITES, StartSpriteAffineAnim, StartSpriteAnim, ST_OAM_HFLIP, ST_OAM_OBJ_BLEND, ST_OAM_OBJ_NORMAL,
  ST_OAM_VFLIP, type Sprite,
} from "../../hw/sprite";
import { Cos, gSineTable, Sin } from "../../hw/trig";
import {
  ANIM_ATTACKER, ANIM_TARGET, animState, AnimFastTranslateLinear, AnimTranslateLinear, ArcTan2Neg, CloneBattlerSpriteWithBlend,
  DestroyAnimSprite, DestroyAnimSpriteAndDisableBlend, DestroyAnimVisualTask, DestroySpriteAndMatrix, DestroySpriteWithActiveSheet,
  GetAnimBattlerSpriteId, GetBattleMonSpritePalettesMask, GetBattlePalettesMask, GetBattlerSpriteBGPriority,
  GetBattlerSpriteBGPriorityRank, GetBattlerSpriteCoord, GetBattlerSpriteCoord2, GetBattlerSpriteCoordAttr, GetBattlerSpriteSubpriority,
  InitAndRunAnimFastLinearTranslation, InitAnimArcTranslation, InitAnimFastLinearTranslationWithSpeed, InitAnimLinearTranslation,
  InitSpritePosToAnimAttacker, InitSpritePosToAnimTarget, IsBattlerSpriteVisible, PrepareBattlerSpriteForRotScale, ResetSpriteRotScale,
  RunStoredCallbackWhenAffineAnimEnds, RunStoredCallbackWhenAnimEnds, SetAnimSpriteInitialXOffset, SetAverageBattlerPositions,
  SetBattlerSpriteYOffsetFromRotation, SetBattlerSpriteYOffsetFromYScale, SetSpriteCoordsToAnimAttackerCoords, SetSpriteRotScale,
  StartAnimLinearTranslation, StoreSpriteCallbackInData6, TranslateAnimHorizontalArc, TranslateSpriteLinear, TranslateSpriteLinearById,
  TranslateSpriteLinearAndFlicker, TranslateSpriteLinearFixedPoint, TrySetSpriteRotScale, WaitAnimForDuration,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { BattleAnimAdjustPanning } from "../animScript";
import { G, gBattlerSpriteIds, gHealthboxSpriteIds } from "../globals";
import { SetHealthboxSpriteInvisible, SetHealthboxSpriteVisible } from "../interface";
import { BG_ANIM_PRIORITY, SetAnimBgAttribute } from "../intro";
import { GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, PlaySE12WithPanning, s16 } from "./common";

const u16 = (v: number) => v & 0xffff;
const IsDoubleBattle = () => !!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE);
const BATTLE_PARTNER = (id: number) => id ^ 2;

// Debug? Written to but never read.
const sFrenzyPlantRootData = { startX: 0, startY: 0, targetX: 0, targetY: 0 };

// Animates the falling particles that horizontally wave back and forth.
// Used by Sleep Powder, Stun Spore, and Poison Powder.
function AnimMovePowderParticle(sprite: Sprite): void {
  sprite.x += gBattleAnimArgs[0]!;
  sprite.y += gBattleAnimArgs[1]!;
  sprite.data[0] = gBattleAnimArgs[2]!;
  sprite.data[1] = gBattleAnimArgs[3]!;
  if (GetBattlerSide(animState.gBattleAnimAttacker)) sprite.data[3] = -gBattleAnimArgs[4]!;
  else sprite.data[3] = gBattleAnimArgs[4]!;
  sprite.data[4] = gBattleAnimArgs[5]!;
  sprite.callback = AnimMovePowderParticle_Step;
}

function AnimMovePowderParticle_Step(sprite: Sprite): void {
  if (sprite.data[0]! > 0) {
    sprite.data[0]!--;
    sprite.y2 = sprite.data[2]! >> 8;
    sprite.data[2]! += sprite.data[1]!;
    sprite.x2 = Sin(sprite.data[5]!, sprite.data[3]!);
    sprite.data[5] = (sprite.data[5]! + sprite.data[4]!) & 0xff;
  } else {
    DestroyAnimSprite(sprite);
  }
}

// Moves an energy orb towards the center of the mon.
function AnimPowerAbsorptionOrb(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[2]!;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
}

// Moves an orb in a straight line towards the target mon.
function AnimSolarBeamBigOrb(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  StartSpriteAnim(sprite, gBattleAnimArgs[3]!);
  sprite.data[0] = gBattleAnimArgs[2]!;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Moves a small orb in a wavy pattern towards the target mon.
function AnimSolarBeamSmallOrb(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[2]!;
  sprite.data[1] = sprite.x;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  InitAnimLinearTranslation(sprite);
  sprite.data[5] = gBattleAnimArgs[3]!;
  sprite.callback = AnimSolarBeamSmallOrb_Step;
  sprite.callback(sprite);
}

function AnimSolarBeamSmallOrb_Step(sprite: Sprite): void {
  if (AnimTranslateLinear(sprite)) {
    DestroySprite(sprite);
  } else {
    if (sprite.data[5]! > 0x7f) sprite.subpriority = (GetBattlerSpriteSubpriority(animState.gBattleAnimTarget) + 1) & 0xff;
    else sprite.subpriority = (GetBattlerSpriteSubpriority(animState.gBattleAnimTarget) + 6) & 0xff;
    sprite.x2 += Sin(sprite.data[5]!, 5);
    sprite.y2 += Cos(sprite.data[5]!, 14);
    sprite.data[5] = (sprite.data[5]! + 15) & 0xff;
  }
}

// Creates 15 small secondary orbs used in the solarbeam anim effect.
// There is a 7-frame delay between each of them.
export function AnimTask_CreateSmallSolarBeamOrbs(taskId: number): void {
  const t = gTasks[taskId]!;
  t.data[0] = s16(t.data[0]! - 1);
  if (t.data[0] === -1) {
    t.data[1]!++;
    t.data[0] = 6;
    gBattleAnimArgs[0] = 15;
    gBattleAnimArgs[1] = 0;
    gBattleAnimArgs[2] = 80;
    gBattleAnimArgs[3] = 0;
    CreateSpriteAndAnimate(animTemplate("gSolarBeamSmallOrbSpriteTemplate"), 0, 0, (GetBattlerSpriteSubpriority(animState.gBattleAnimTarget) + 1) & 0xff);
  }
  if (t.data[1] === 15) DestroyAnimVisualTask(taskId);
}

// Moves an orb from the target mon to the attacking mon in an arc-like fashion.
function AnimAbsorptionOrb(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, true);
  sprite.data[0] = gBattleAnimArgs[3]!;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[5] = gBattleAnimArgs[2]!;
  InitAnimArcTranslation(sprite);
  sprite.callback = AnimAbsorptionOrb_Step;
}

function AnimAbsorptionOrb_Step(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) DestroyAnimSprite(sprite);
}

// Moves an orb in a wave-like fashion towards the target mon. The wave's
// properties and the sprite anim are randomly determined.
function AnimHyperBeamOrb(sprite: Sprite): void {
  const animNum = random();
  StartSpriteAnim(sprite, animNum % 8);
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x -= 20;
  else sprite.x += 20;

  const speed = random();
  sprite.data[0] = (speed & 31) + 64;
  sprite.data[1] = sprite.x;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  InitAnimFastLinearTranslationWithSpeed(sprite);
  sprite.data[5] = random() & 0xff;
  sprite.data[6] = sprite.subpriority;
  sprite.callback = AnimHyperBeamOrb_Step;
  sprite.callback(sprite);
}

function AnimHyperBeamOrb_Step(sprite: Sprite): void {
  if (AnimFastTranslateLinear(sprite)) {
    DestroyAnimSprite(sprite);
  } else {
    sprite.y2 += Cos(sprite.data[5]!, 12);
    if (sprite.data[5]! < 0x7f) sprite.subpriority = sprite.data[6]! & 0xff;
    else sprite.subpriority = (sprite.data[6]! + 1) & 0xff;
    sprite.data[5]! += 24;
    sprite.data[5]! &= 0xff;
  }
}

// seed (sprouts a sapling from a seed.)
// Used by Leech Seed.
function AnimLeechSeed(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[2] = -gBattleAnimArgs[2]!;
  sprite.data[0] = gBattleAnimArgs[4]!;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X) + gBattleAnimArgs[2]!;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y) + gBattleAnimArgs[3]!;
  sprite.data[5] = gBattleAnimArgs[5]!;
  InitAnimArcTranslation(sprite);
  sprite.callback = AnimLeechSeed_Step;
}

function AnimLeechSeed_Step(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) {
    sprite.invisible = true;
    sprite.data[0] = 10;
    sprite.callback = WaitAnimForDuration;
    StoreSpriteCallbackInData6(sprite, AnimLeechSeedSprouts);
  }
}

function AnimLeechSeedSprouts(sprite: Sprite): void {
  sprite.invisible = false;
  StartSpriteAnim(sprite, 1);
  sprite.data[0] = 60;
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Moves a spore particle in a halo around the target mon.
function AnimSporeParticle(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, true);
  StartSpriteAnim(sprite, gBattleAnimArgs[4]!);
  if (gBattleAnimArgs[4] === 1) sprite.oam.objMode = ST_OAM_OBJ_BLEND;
  sprite.data[0] = gBattleAnimArgs[3]!;
  sprite.data[1] = gBattleAnimArgs[2]!;
  sprite.callback = AnimSporeParticle_Step;
  sprite.callback(sprite);
}

function AnimSporeParticle_Step(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[1]!, 32);
  sprite.data[2]! += 24;
  sprite.y2 = Cos(sprite.data[1]!, -3) + (sprite.data[2]! >> 8);
  if (u16(sprite.data[1]! - 0x40) < 0x80) {
    sprite.oam.priority = GetBattlerSpriteBGPriority(animState.gBattleAnimTarget);
  } else {
    let priority = (GetBattlerSpriteBGPriority(animState.gBattleAnimTarget) + 1) & 0xff;
    if (priority > 3) priority = 3;
    sprite.oam.priority = priority;
  }
  sprite.data[1]! += 2;
  sprite.data[1]! &= 0xff;
  if (--sprite.data[0]! === -1) DestroyAnimSprite(sprite);
}

// In a double battle, Updates the mon sprite background priorities to allow
// the circling effect controlled by AnimSporeParticle.
export function AnimTask_SporeDoubleBattle(taskId: number): void {
  if (IsContest() || !IsDoubleBattle()) {
    DestroyAnimVisualTask(taskId);
  } else {
    if (GetBattlerSpriteBGPriorityRank(animState.gBattleAnimTarget) === 1) SetAnimBgAttribute(2, BG_ANIM_PRIORITY, 3);
    else SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
    DestroyAnimVisualTask(taskId);
  }
}

// Rotates a big flower around the attacking mon, and slowly floats downward.
function AnimPetalDanceBigFlower(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, false);
  sprite.data[0] = gBattleAnimArgs[3]!;
  sprite.data[1] = sprite.x;
  sprite.data[2] = sprite.x;
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[2]!;
  InitAnimLinearTranslation(sprite);
  sprite.data[5] = 0x40;
  sprite.callback = AnimPetalDanceBigFlower_Step;
  sprite.callback(sprite);
}

function AnimPetalDanceBigFlower_Step(sprite: Sprite): void {
  if (!AnimTranslateLinear(sprite)) {
    sprite.x2 += Sin(sprite.data[5]!, 32);
    sprite.y2 += Cos(sprite.data[5]!, -5);
    if (u16(sprite.data[5]! - 0x40) < 0x80) sprite.subpriority = (GetBattlerSpriteSubpriority(animState.gBattleAnimAttacker) - 1) & 0xff;
    else sprite.subpriority = (GetBattlerSpriteSubpriority(animState.gBattleAnimAttacker) + 1) & 0xff;
    sprite.data[5] = (sprite.data[5]! + 5) & 0xff;
  } else {
    DestroyAnimSprite(sprite);
  }
}

// Slowly floats a small flower downard, while swaying from right to left.
function AnimPetalDanceSmallFlower(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[3]!;
  sprite.data[1] = sprite.x;
  sprite.data[2] = sprite.x;
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[2]!;
  InitAnimLinearTranslation(sprite);
  sprite.data[5] = 0x40;
  sprite.callback = AnimPetalDanceSmallFlower_Step;
  sprite.callback(sprite);
}

function AnimPetalDanceSmallFlower_Step(sprite: Sprite): void {
  if (!AnimTranslateLinear(sprite)) {
    sprite.x2 += Sin(sprite.data[5]!, 8);
    if (u16(sprite.data[5]! - 59) < 5 || u16(sprite.data[5]! - 187) < 5) sprite.oam.matrixNum ^= ST_OAM_HFLIP;
    sprite.data[5]! += 5;
    sprite.data[5]! &= 0xff;
  } else {
    DestroyAnimSprite(sprite);
  }
}

// Shoots a leaf upward, then floats it downward while swaying back and forth.
function AnimRazorLeafParticle(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[0] = gBattleAnimArgs[0]!;
  sprite.data[1] = gBattleAnimArgs[1]!;
  sprite.data[2] = gBattleAnimArgs[2]!;
  sprite.callback = AnimRazorLeafParticle_Step1;
}

function AnimRazorLeafParticle_Step1(sprite: Sprite): void {
  if (!sprite.data[2]) {
    if (sprite.data[1]! & 1) {
      sprite.data[0] = 0x80;
      sprite.data[1] = 0;
      sprite.data[2] = 0;
    } else {
      sprite.data[0] = 0;
      sprite.data[1] = 0;
      sprite.data[2] = 0;
    }
    sprite.callback = AnimRazorLeafParticle_Step2;
  } else {
    sprite.data[2]!--;
    sprite.x += sprite.data[0]!;
    sprite.y += sprite.data[1]!;
  }
}

function AnimRazorLeafParticle_Step2(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker)) sprite.x2 = -Sin(sprite.data[0]!, 25);
  else sprite.x2 = Sin(sprite.data[0]!, 25);
  sprite.data[0]! += 2;
  sprite.data[0]! &= 0xff;
  sprite.data[1]!++;
  if (!(sprite.data[1]! & 1)) sprite.y2++;
  if (sprite.data[1]! > 80) DestroyAnimSprite(sprite);
}

// Animates a sprite that moves linearly from one location to another, with a
// single-cycle sine wave added to the y position along the way.
// Used by Razor Leaf and Magical Leaf.
function AnimTranslateLinearSingleSineWave(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[2] = -gBattleAnimArgs[2]!;
  sprite.data[0] = gBattleAnimArgs[4]!;
  if (!gBattleAnimArgs[6]) {
    sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + gBattleAnimArgs[2]!;
    sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[3]!;
  } else {
    const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, true);
    sprite.data[2] = pos.x + gBattleAnimArgs[2]!;
    sprite.data[4] = pos.y + gBattleAnimArgs[3]!;
  }
  sprite.data[5] = gBattleAnimArgs[5]!;
  InitAnimArcTranslation(sprite);
  if (GetBattlerSide(animState.gBattleAnimAttacker) === GetBattlerSide(animState.gBattleAnimTarget)) sprite.data[0] = 1;
  else sprite.data[0] = 0;
  sprite.callback = AnimTranslateLinearSingleSineWave_Step;
}

function AnimTranslateLinearSingleSineWave_Step(sprite: Sprite): void {
  let destroy = false;
  const a = sprite.data[0]!;
  const b = sprite.data[7]!;

  sprite.data[0] = 1;
  TranslateAnimHorizontalArc(sprite);
  const r0 = sprite.data[7]!;
  sprite.data[0] = a;
  if (b > 200 && r0 < 56 && sprite.oam.affineParam === 0) sprite.oam.affineParam++;

  if (sprite.oam.affineParam !== 0 && sprite.data[0] !== 0) {
    sprite.invisible = !sprite.invisible;
    sprite.oam.affineParam++;
    if (sprite.oam.affineParam === 30) destroy = true;
  }

  if (sprite.x + sprite.x2 > C.DISPLAY_WIDTH + 16
   || sprite.x + sprite.x2 < -16
   || sprite.y + sprite.y2 > C.DISPLAY_HEIGHT
   || sprite.y + sprite.y2 < -16)
    destroy = true;

  if (destroy) DestroyAnimSprite(sprite);
}

// Animates particles in the Twister move animation.
export function AnimMoveTwisterParticle(sprite: Sprite): void {
  if (!IsContest() && IsDoubleBattle()) {
    const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, true);
    sprite.x = pos.x;
    sprite.y = pos.y;
  }
  sprite.y += 32;
  sprite.data[0] = gBattleAnimArgs[0]!;
  sprite.data[1] = gBattleAnimArgs[1]!;
  sprite.data[2] = gBattleAnimArgs[2]!;
  sprite.data[3] = gBattleAnimArgs[3]!;
  sprite.data[4] = gBattleAnimArgs[4]!;
  sprite.callback = AnimMoveTwisterParticle_Step;
}

function AnimMoveTwisterParticle_Step(sprite: Sprite): void {
  if (sprite.data[1] === 0xff) {
    sprite.y -= 2;
  } else if (sprite.data[1]! > 0) {
    sprite.y -= 2;
    sprite.data[1]! -= 2;
  }

  sprite.data[5]! += sprite.data[2]!;
  if (sprite.data[0]! < sprite.data[4]!) sprite.data[5]! += sprite.data[2]!;

  sprite.data[5]! &= 0xff;
  sprite.x2 = Cos(sprite.data[5]!, sprite.data[3]!);
  sprite.y2 = Sin(sprite.data[5]!, 5);
  if (sprite.data[5]! < 0x80) sprite.oam.priority = (GetBattlerSpriteBGPriority(animState.gBattleAnimTarget) - 1) & 3;
  else sprite.oam.priority = (GetBattlerSpriteBGPriority(animState.gBattleAnimTarget) + 1) & 3;

  if (--sprite.data[0]! === 0) DestroyAnimSprite(sprite);
}

// Squeezes a constricting "rope" several times via affine animations.
function AnimConstrictBinding(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, false);
  sprite.affineAnimPaused = true;
  StartSpriteAffineAnim(sprite, gBattleAnimArgs[2]!);
  sprite.data[6] = gBattleAnimArgs[2]!;
  sprite.data[7] = gBattleAnimArgs[3]!;
  sprite.callback = AnimConstrictBinding_Step1;
}

function AnimConstrictBinding_Step1(sprite: Sprite): void {
  if (u16(gBattleAnimArgs[7]!) === 0xffff) {
    sprite.affineAnimPaused = false;
    GetAnimBattlerSpriteId(ANIM_TARGET);
    sprite.data[0] = 0x100;
    sprite.callback = AnimConstrictBinding_Step2;
  }
}

function AnimConstrictBinding_Step2(sprite: Sprite): void {
  GetAnimBattlerSpriteId(ANIM_TARGET);
  if (!sprite.data[2]) sprite.data[0]! += 11;
  else sprite.data[0]! -= 11;

  if (++sprite.data[1]! === 6) {
    sprite.data[1] = 0;
    sprite.data[2]! ^= 1;
  }

  if (sprite.affineAnimEnded) {
    if (--sprite.data[7]! > 0) StartSpriteAffineAnim(sprite, sprite.data[6]!);
    else DestroyAnimSprite(sprite);
  }
}

export function AnimTask_ShrinkTargetCopy(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(ANIM_TARGET);
  if (gSprites[spriteId]!.invisible) {
    DestroyAnimVisualTask(taskId);
  } else {
    PrepareBattlerSpriteForRotScale(spriteId, ST_OAM_OBJ_BLEND);
    const t = gTasks[taskId]!;
    t.data[0] = gBattleAnimArgs[0]!;
    t.data[1] = gBattleAnimArgs[1]!;
    t.data[11] = 0x100;
    t.func = AnimTask_DuplicateAndShrinkToPos_Step1;
  }
}

function AnimTask_DuplicateAndShrinkToPos_Step1(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(ANIM_TARGET);
  const t = gTasks[taskId]!;
  t.data[10] = s16(t.data[10]! + t.data[0]!);
  gSprites[spriteId]!.x2 = t.data[10]! >> 8;
  if (GetBattlerSide(animState.gBattleAnimTarget) !== C.B_SIDE_PLAYER) gSprites[spriteId]!.x2 = -gSprites[spriteId]!.x2;

  t.data[11]! += 16;
  SetSpriteRotScale(spriteId, t.data[11]!, t.data[11]!, 0);
  SetBattlerSpriteYOffsetFromYScale(spriteId);
  if (--t.data[1]! === 0) {
    t.data[0] = 0;
    t.func = AnimTask_DuplicateAndShrinkToPos_Step2;
  }
}

function AnimTask_DuplicateAndShrinkToPos_Step2(taskId: number): void {
  const t = gTasks[taskId]!;
  if (u16(gBattleAnimArgs[7]!) === 0xffff) {
    if (t.data[0] === 0) {
      const spriteId = GetAnimBattlerSpriteId(ANIM_TARGET);
      ResetSpriteRotScale(spriteId);
      gSprites[spriteId]!.y2 = gSprites[spriteId]!.x2 = 0;
      t.data[0]!++;
      return;
    }
  } else {
    if (t.data[0] === 0) return;
  }
  t.data[0]!++;
  if (t.data[0] === 3) DestroyAnimVisualTask(taskId);
}

// Moves an orb from the target mon to the attacking mon.
function AnimMimicOrb(sprite: Sprite): void {
  switch (sprite.data[0]) {
  case 0:
    if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) gBattleAnimArgs[0] = gBattleAnimArgs[0]! * -1;
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X) + gBattleAnimArgs[0]!;
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y) + gBattleAnimArgs[1]!;
    sprite.invisible = true;
    sprite.data[0]!++;
    break;
  case 1:
    sprite.invisible = false;
    if (sprite.affineAnimEnded) {
      ChangeSpriteAffineAnim(sprite, 1);
      sprite.data[0] = 25;
      sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
      sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
      sprite.callback = InitAndRunAnimFastLinearTranslation;
      StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
      break;
    }
  }
}

// Animates a root that flickers away after some time.
function AnimIngrainRoot(sprite: Sprite): void {
  if (!sprite.data[0]) {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y);
    sprite.x2 = gBattleAnimArgs[0]!;
    sprite.y2 = gBattleAnimArgs[1]!;
    sprite.subpriority = (gBattleAnimArgs[2]! + 30) & 0xff;
    StartSpriteAnim(sprite, gBattleAnimArgs[3]!);
    sprite.data[2] = gBattleAnimArgs[4]!;
    sprite.data[0]!++;
    if (sprite.y + sprite.y2 > 120) sprite.y += sprite.y2 + sprite.y - 120;
  }
  sprite.callback = AnimRootFlickerOut;
}

// Places a root on the path to the target mon that flickers away after some time.
function AnimFrenzyPlantRoot(sprite: Sprite): void {
  const attackerX = s16(GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2));
  const attackerY = s16(GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET));
  let targetX = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2));
  let targetY = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET));

  targetX = s16(targetX - attackerX);
  targetY = s16(targetY - attackerY);
  sprite.x = attackerX + Math.trunc(targetX * gBattleAnimArgs[0]! / 100);
  sprite.y = attackerY + Math.trunc(targetY * gBattleAnimArgs[0]! / 100);
  sprite.x2 = gBattleAnimArgs[1]!;
  sprite.y2 = gBattleAnimArgs[2]!;
  sprite.subpriority = (gBattleAnimArgs[3]! + 30) & 0xff;
  StartSpriteAnim(sprite, gBattleAnimArgs[4]!);
  sprite.data[2] = gBattleAnimArgs[5]!;
  sprite.callback = AnimRootFlickerOut;
  sFrenzyPlantRootData.startX = sprite.x;
  sFrenzyPlantRootData.startY = sprite.y;
  sFrenzyPlantRootData.targetX = targetX;
  sFrenzyPlantRootData.targetY = targetY;
}

function AnimRootFlickerOut(sprite: Sprite): void {
  if (++sprite.data[0]! > sprite.data[2]! - 10) sprite.invisible = !!(sprite.data[0]! % 2);
  if (sprite.data[0]! > sprite.data[2]!) DestroyAnimSprite(sprite);
}

// Moves an orb in a fast wavy path.
function AnimIngrainOrb(sprite: Sprite): void {
  if (!sprite.data[0]) {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2) + gBattleAnimArgs[0]!;
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y) + gBattleAnimArgs[1]!;
    sprite.data[1] = gBattleAnimArgs[2]!;
    sprite.data[2] = gBattleAnimArgs[3]!;
    sprite.data[3] = gBattleAnimArgs[4]!;
  }
  sprite.data[0]!++;
  sprite.x2 = sprite.data[1]! * sprite.data[0]!;
  sprite.y2 = Sin((sprite.data[0]! * 20) & 0xff, sprite.data[2]!);
  if (sprite.data[0]! > sprite.data[3]!) DestroyAnimSprite(sprite);
}

function InitItemBagData(sprite: Sprite, c: number): void {
  const a = (sprite.x << 8) | sprite.y;
  const b = (sprite.data[6]! << 8) | sprite.data[7]!;
  c = s16(c << 8);
  sprite.data[5] = a;
  sprite.data[6] = b;
  sprite.data[7] = c;
}

export function MoveAlongLinearPath(sprite: Sprite): boolean {
  const xStartPos = (sprite.data[5]! >> 8) & 0xff;
  const yStartPos = sprite.data[5]! & 0xff;
  let xEndPos = (sprite.data[6]! >> 8) & 0xff;
  const yEndPos = sprite.data[6]! & 0xff;
  const totalTime = s16(sprite.data[7]! >> 8);
  let currentTime = s16(sprite.data[7]! & 0xff);

  if (xEndPos === 0) xEndPos = -32;
  else if (xEndPos === 255) xEndPos = C.DISPLAY_WIDTH + 32;

  const yEndPos_2 = s16(yEndPos - yStartPos);
  const r0 = s16(xEndPos - xStartPos);
  const var1 = Math.trunc(r0 * currentTime / totalTime);
  const vaxEndPos = Math.trunc(yEndPos_2 * currentTime / totalTime);
  sprite.x = var1 + xStartPos;
  sprite.y = vaxEndPos + yStartPos;
  if (++currentTime === totalTime) return true;

  sprite.data[7] = (totalTime << 8) | currentTime;
  return false;
}

function AnimItemSteal_Step2(sprite: Sprite): void {
  if (sprite.data[0] === 10) StartSpriteAffineAnim(sprite, 1);
  sprite.data[0]!++;
  if (sprite.data[0]! > 50) DestroyAnimSprite(sprite);
}

function AnimItemSteal_Step1(sprite: Sprite): void {
  sprite.data[0]! += Math.trunc(sprite.data[3]! * 128 / sprite.data[4]!);
  if (sprite.data[0]! >= 128) {
    sprite.data[1]!++;
    sprite.data[0] = 0;
  }
  sprite.y2 = Sin(sprite.data[0]! + 128, 30 - sprite.data[1]! * 8);
  if (MoveAlongLinearPath(sprite)) {
    sprite.y2 = 0;
    sprite.data[0] = 0;
    sprite.callback = AnimItemSteal_Step2;
  }
}

function AnimPresent(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, false);
  const targetX = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X));
  const targetY = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y));
  if (BATTLE_PARTNER(animState.gBattleAnimAttacker) === animState.gBattleAnimTarget) {
    sprite.data[6] = targetX;
    sprite.data[7] = targetY + 10;
    InitItemBagData(sprite, 60);
    sprite.data[3] = 1;
  } else {
    sprite.data[6] = targetX;
    sprite.data[7] = targetY + 10;
    InitItemBagData(sprite, 60);
    sprite.data[3] = 3;
  }
  sprite.data[4] = 60;
  sprite.callback = AnimItemSteal_Step1;
}

function AnimKnockOffOpponentsItem(sprite: Sprite): void {
  sprite.data[0]! += Math.trunc((sprite.data[3]! * 128) / sprite.data[4]!);
  if (sprite.data[0]! > 0x7f) {
    sprite.data[1]!++;
    sprite.data[0] = 0;
  }
  sprite.y2 = Sin(sprite.data[0]! + 0x80, 30 - sprite.data[1]! * 8);
  if (MoveAlongLinearPath(sprite)) {
    sprite.y2 = 0;
    sprite.data[0] = 0;
    DestroyAnimSprite(sprite);
  }
}

function AnimKnockOffItem(sprite: Sprite): void {
  const targetY = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y));
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) {
    sprite.data[6] = 0;
    sprite.data[7] = targetY + 10;
    InitItemBagData(sprite, 40);
    sprite.data[3] = 3;
    sprite.data[4] = 60;
    sprite.callback = AnimItemSteal_Step1;
  } else {
    sprite.data[6] = 255;
    sprite.data[7] = targetY + 10;
    if (IsContest()) sprite.data[6] = 0;
    InitItemBagData(sprite, 40);
    sprite.data[3] = 3;
    sprite.data[4] = 60;
    sprite.callback = AnimKnockOffOpponentsItem;
  }
}

// Animates a heal particle upward.
function AnimPresentHealParticle(sprite: Sprite): void {
  if (!sprite.data[0]) {
    InitSpritePosToAnimTarget(sprite, false);
    sprite.data[1] = gBattleAnimArgs[2]!;
  }
  sprite.data[0]!++;
  sprite.y2 = sprite.data[1]! * sprite.data[0]!;
  if (sprite.animEnded) DestroyAnimSprite(sprite);
}

function AnimItemSteal(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, false);
  const attackerX = s16(GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X));
  const attackerY = s16(GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y));
  if (BATTLE_PARTNER(animState.gBattleAnimTarget) === animState.gBattleAnimAttacker) {
    sprite.data[6] = attackerX;
    sprite.data[7] = attackerY + 10;
    InitItemBagData(sprite, 60);
    sprite.data[3] = 1;
  } else {
    sprite.data[6] = attackerX;
    sprite.data[7] = attackerY + 10;
    InitItemBagData(sprite, 60);
    sprite.data[3] = 3;
  }
  sprite.data[4] = 60;
  sprite.callback = AnimItemSteal_Step3;
}

function AnimItemSteal_Step3(sprite: Sprite): void {
  sprite.data[0]! += Math.trunc((sprite.data[3]! * 128) / sprite.data[4]!);
  if (sprite.data[0]! > 127) {
    sprite.data[1]!++;
    sprite.data[0] = 0;
  }
  sprite.y2 = Sin(sprite.data[0]! + 0x80, 30 - sprite.data[1]! * 8);
  if (sprite.y2 === 0) PlaySE12WithPanning(C.SE_M_BUBBLE2, BattleAnimAdjustPanning(C.SOUND_PAN_TARGET));

  if (MoveAlongLinearPath(sprite)) {
    sprite.y2 = 0;
    sprite.data[0] = 0;
    sprite.callback = AnimItemSteal_Step2;
    PlaySE12WithPanning(C.SE_M_BUBBLE2, BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER));
  }
}

// Moves a bag in a circular motion.
function AnimTrickBag(sprite: Sprite): void {
  if (!sprite.data[0]) {
    if (!IsContest()) {
      sprite.data[1] = gBattleAnimArgs[1]!;
      sprite.x = 120;
    } else {
      const a = gBattleAnimArgs[1]! - 32;
      const b = a < 0 ? gBattleAnimArgs[1]! + 0xdf : a;
      sprite.data[1] = a - ((b >> 8) << 8);
      sprite.x = 70;
    }
    sprite.y = gBattleAnimArgs[0]!;
    sprite.data[2] = gBattleAnimArgs[0]!;
    sprite.data[4] = 20;
    sprite.x2 = Cos(sprite.data[1]!, 60);
    sprite.y2 = Sin(sprite.data[1]!, 20);
    sprite.callback = AnimTrickBag_Step1;
    if (sprite.data[1]! > 0 && sprite.data[1]! < 192) sprite.subpriority = 31;
    else sprite.subpriority = 29;
  }
}

function AnimTrickBag_Step1(sprite: Sprite): void {
  switch (sprite.data[3]) {
  case 0:
    if (sprite.data[2]! > 78) {
      sprite.data[3] = 1;
      StartSpriteAffineAnim(sprite, 1);
    } else {
      sprite.data[2]! += Math.trunc(sprite.data[4]! / 10);
      sprite.data[4]! += 3;
      sprite.y = sprite.data[2]!;
    }
    break;
  case 1:
    if (sprite.data[3] && sprite.affineAnimEnded) {
      sprite.data[0] = 0;
      sprite.data[2] = 0;
      sprite.callback = AnimTrickBag_Step2;
    }
    break;
  }
}

const gTrickBagCoordinates = () => cdata<number[][]>("battle_anim_effects_1", "gTrickBagCoordinates");

function AnimTrickBag_Step2(sprite: Sprite): void {
  const coords = gTrickBagCoordinates()[sprite.data[0]!]!;
  if (sprite.data[2] === coords[1]) {
    if (coords[2] === 127) {
      sprite.data[0] = 0;
      sprite.callback = AnimTrickBag_Step3;
    }
    sprite.data[2] = 0;
    sprite.data[0]!++;
  } else {
    sprite.data[2]!++;
    sprite.data[1] = (coords[0]! * coords[2]! + sprite.data[1]!) & 0xff;
    if (!IsContest()) {
      if (u16(sprite.data[1]! - 1) < 191) sprite.subpriority = 31;
      else sprite.subpriority = 29;
    }
    sprite.x2 = Cos(sprite.data[1]!, 60);
    sprite.y2 = Sin(sprite.data[1]!, 20);
  }
}

function AnimTrickBag_Step3(sprite: Sprite): void {
  if (sprite.data[0]! > 20) DestroyAnimSprite(sprite);
  sprite.invisible = !!(sprite.data[0]! % 2);
  sprite.data[0]!++;
}

export function AnimTask_LeafBlade(taskId: number): void {
  const task = gTasks[taskId]!;
  const target = animState.gBattleAnimTarget;
  task.data[4] = (GetBattlerSpriteSubpriority(target) - 1) & 0xff;
  task.data[6] = GetBattlerSpriteCoord(target, C.BATTLER_COORD_X_2);
  task.data[7] = GetBattlerSpriteCoord(target, C.BATTLER_COORD_Y_PIC_OFFSET);
  task.data[10] = GetBattlerSpriteCoordAttr(target, C.BATTLER_COORD_ATTR_WIDTH);
  task.data[11] = GetBattlerSpriteCoordAttr(target, C.BATTLER_COORD_ATTR_HEIGHT);
  task.data[5] = GetBattlerSide(target) === C.B_SIDE_OPPONENT ? 1 : -1;
  task.data[9] = 56 - task.data[5]! * 64;
  task.data[8] = task.data[7]! - task.data[9]! + task.data[6]!;
  task.data[2] = CreateSprite(animTemplate("gLeafBladeSpriteTemplate"), task.data[8]!, task.data[9]!, task.data[4]!);
  if (task.data[2] === MAX_SPRITES) DestroyAnimVisualTask(taskId);

  const sprite = gSprites[task.data[2]!]!;
  sprite.data[0] = 10;
  sprite.data[1] = task.data[8]!;
  sprite.data[2] = task.data[6]! - (Math.trunc(task.data[10]! / 2) + 10) * task.data[5]!;
  sprite.data[3] = task.data[9]!;
  sprite.data[4] = task.data[7]! + (Math.trunc(task.data[11]! / 2) + 10) * task.data[5]!;
  sprite.data[5] = LeafBladeGetPosFactor(sprite);
  InitAnimArcTranslation(sprite);
  task.func = AnimTask_LeafBlade_Step;
}

function leafBladeRetarget(task: { data: number[] }, sprite: Sprite, destX: number, destY: number): void {
  sprite.x += sprite.x2;
  sprite.y += sprite.y2;
  sprite.x2 = 0;
  sprite.y2 = 0;
  sprite.data[0] = 10;
  sprite.data[1] = sprite.x;
  sprite.data[2] = destX;
  sprite.data[3] = sprite.y;
  sprite.data[4] = destY;
  sprite.data[5] = LeafBladeGetPosFactor(sprite);
}

function AnimTask_LeafBlade_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  const sprite = gSprites[task.data[2]!]!;
  const a = task.data[0]!;
  const halfW = Math.trunc(task.data[10]! / 2) + 10;
  const halfH = Math.trunc(task.data[11]! / 2) + 10;

  const flyTo = (next: number) => {
    AnimTask_LeafBlade_Step2(task, taskId);
    if (TranslateAnimHorizontalArc(sprite)) {
      task.data[15] = next;
      task.data[0] = 0xff;
    }
  };
  const turn = (destX: number, destY: number, subDelta: number, anim: number) => {
    leafBladeRetarget(task, sprite, destX, destY);
    task.data[4]! += subDelta;
    task.data[3] = anim;
    sprite.subpriority = task.data[4]! & 0xff;
    StartSpriteAnim(sprite, task.data[3]!);
    InitAnimArcTranslation(sprite);
    task.data[0]!++;
  };

  switch (a) {
  case 4: flyTo(5); break;
  case 8: flyTo(9); break;
  case 0: flyTo(1); break;
  case 1: turn(task.data[6]!, task.data[7]!, 2, a); break;
  case 2: flyTo(3); break;
  case 3: turn(task.data[6]! - halfW * task.data[5]!, task.data[7]! - halfH * task.data[5]!, 0, 2); break;
  case 5: turn(task.data[6]! + halfW * task.data[5]!, task.data[7]! + halfH * task.data[5]!, -2, 3); break;
  case 6: flyTo(7); break;
  case 7: turn(task.data[6]!, task.data[7]!, 2, 4); break;
  case 9: turn(task.data[6]! - halfW * task.data[5]!, task.data[7]! + halfH * task.data[5]!, 0, 5); break;
  case 10: flyTo(11); break;
  case 11: turn(task.data[8]!, task.data[9]!, -2, 6); break;
  case 12:
    AnimTask_LeafBlade_Step2(task, taskId);
    if (TranslateAnimHorizontalArc(sprite)) {
      DestroySprite(sprite);
      task.data[0]!++;
    }
    break;
  case 13:
    if (task.data[12] === 0) DestroyAnimVisualTask(taskId);
    break;
  case 0xff:
    if (++task.data[1]! > 5) {
      task.data[1] = 0;
      task.data[0] = task.data[15]!;
    }
    break;
  }
}

function LeafBladeGetPosFactor(sprite: Sprite): number {
  let v = 8;
  if (sprite.data[4]! < sprite.y) v = -v;
  return v;
}

function AnimTask_LeafBlade_Step2(task: { data: number[] }, taskId: number): void {
  task.data[14]!++;
  if (task.data[14]! > 0) {
    task.data[14] = 0;
    const spriteX = s16(gSprites[task.data[2]!]!.x + gSprites[task.data[2]!]!.x2);
    const spriteY = s16(gSprites[task.data[2]!]!.y + gSprites[task.data[2]!]!.y2);
    const spriteId = CreateSprite(animTemplate("gLeafBladeSpriteTemplate"), spriteX, spriteY, task.data[4]! & 0xff);
    if (spriteId !== MAX_SPRITES) {
      gSprites[spriteId]!.data[6] = taskId;
      gSprites[spriteId]!.data[7] = 12;
      gTasks[taskId]!.data[12]!++;
      gSprites[spriteId]!.data[0] = task.data[13]! & 1;
      gTasks[taskId]!.data[13]!++;
      StartSpriteAnim(gSprites[spriteId]!, task.data[3]!);
      gSprites[spriteId]!.subpriority = task.data[4]! & 0xff;
      gSprites[spriteId]!.callback = AnimTask_LeafBlade_Step2_Callback;
    }
  }
}

function AnimTask_LeafBlade_Step2_Callback(sprite: Sprite): void {
  sprite.data[0]!++;
  if (sprite.data[0]! > 1) {
    sprite.data[0] = 0;
    sprite.invisible = !sprite.invisible;
    sprite.data[1]!++;
    if (sprite.data[1]! > 8) {
      gTasks[sprite.data[6]!]!.data[sprite.data[7]!]!--;
      DestroySprite(sprite);
    }
  }
}

function AnimFlyingParticle(sprite: Sprite): void {
  const battler = !gBattleAnimArgs[6] ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  if (GetBattlerSide(battler) !== C.B_SIDE_PLAYER) {
    sprite.data[4] = 0;
    sprite.data[2] = gBattleAnimArgs[3]!;
    sprite.x = s16(0xfff0);
  } else {
    sprite.data[4] = 1;
    sprite.data[2] = -gBattleAnimArgs[3]!;
    sprite.x = 0x100;
  }

  sprite.data[1] = gBattleAnimArgs[1]!;
  sprite.data[0] = gBattleAnimArgs[2]!;
  sprite.data[3] = gBattleAnimArgs[4]!;
  switch (gBattleAnimArgs[5]) {
  case 0:
    sprite.y = gBattleAnimArgs[0]!;
    sprite.oam.priority = GetBattlerSpriteBGPriority(battler);
    break;
  case 1:
    sprite.y = gBattleAnimArgs[0]!;
    sprite.oam.priority = (GetBattlerSpriteBGPriority(battler) + 1) & 3;
    break;
  case 2:
    sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[0]!;
    sprite.oam.priority = GetBattlerSpriteBGPriority(battler);
    break;
  case 3:
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[0]!;
    GetAnimBattlerSpriteId(ANIM_TARGET);
    sprite.oam.priority = (GetBattlerSpriteBGPriority(battler) + 1) & 3;
    break;
  }
  sprite.callback = AnimFlyingParticle_Step;
}

function AnimFlyingParticle_Step(sprite: Sprite): void {
  const a = sprite.data[7]!;
  sprite.data[7]!++;
  sprite.y2 = (sprite.data[1]! * gSineTable[sprite.data[0]!]!) >> 8;
  sprite.x2 = sprite.data[2]! * a;
  sprite.data[0] = (sprite.data[3]! * a) & 0xff;
  if (!sprite.data[4]) {
    if (sprite.x2 + sprite.x <= 0xf7) return;
  } else {
    if (sprite.x2 + sprite.x > -16) return;
  }
  DestroySpriteAndMatrix(sprite);
}

const sMagicalLeafBlendColors = () => cdata<number[]>("battle_anim_effects_1", "sMagicalLeafBlendColors");

export function AnimTask_CycleMagicalLeafPal(taskId: number): void {
  const task = gTasks[taskId]!;
  switch (task.data[0]) {
  case 0:
    task.data[8] = OBJ_PLTT_ID(IndexOfSpritePaletteTag(C.ANIM_TAG_LEAF));
    task.data[12] = OBJ_PLTT_ID(IndexOfSpritePaletteTag(C.ANIM_TAG_RAZOR_LEAF));
    task.data[0]!++;
    break;
  case 1:
    if (++task.data[9]! >= 0) {
      task.data[9] = 0;
      BlendPalette(task.data[8]!, 16, task.data[10]!, sMagicalLeafBlendColors()[task.data[11]!]!);
      BlendPalette(task.data[12]!, 16, task.data[10]!, sMagicalLeafBlendColors()[task.data[11]!]!);
      if (++task.data[10]! === 17) {
        task.data[10] = 0;
        if (++task.data[11]! === 7) task.data[11] = 0;
      }
    }
    break;
  }
  if (gBattleAnimArgs[7] === -1) DestroyAnimVisualTask(taskId);
}

function AnimNeedleArmSpike(sprite: Sprite): void {
  if (gBattleAnimArgs[4] === 0) {
    DestroyAnimSprite(sprite);
  } else {
    let a: number;
    let b: number;
    if (gBattleAnimArgs[0] === 0) {
      a = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2) & 0xff;
      b = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET) & 0xff;
    } else {
      a = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) & 0xff;
      b = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) & 0xff;
    }

    sprite.data[0] = gBattleAnimArgs[4]!;
    if (gBattleAnimArgs[1] === 0) {
      sprite.x = gBattleAnimArgs[2]! + a;
      sprite.y = gBattleAnimArgs[3]! + b;
      sprite.data[5] = a;
      sprite.data[6] = b;
    } else {
      sprite.x = a;
      sprite.y = b;
      sprite.data[5] = gBattleAnimArgs[2]! + a;
      sprite.data[6] = gBattleAnimArgs[3]! + b;
    }

    const x = u16(sprite.x);
    sprite.data[1] = x * 16;
    const y = u16(sprite.y);
    sprite.data[2] = y * 16;
    sprite.data[3] = Math.trunc((sprite.data[5]! - sprite.x) * 16 / gBattleAnimArgs[4]!);
    sprite.data[4] = Math.trunc((sprite.data[6]! - sprite.y) * 16 / gBattleAnimArgs[4]!);
    let c = u16(ArcTan2Neg(s16(sprite.data[5]! - x), s16(sprite.data[6]! - y)));
    if (IsContest()) c = u16(c - 0x8000);
    TrySetSpriteRotScale(sprite, false, 0x100, 0x100, c);
    sprite.callback = AnimNeedleArmSpike_Step;
  }
}

function AnimNeedleArmSpike_Step(sprite: Sprite): void {
  if (sprite.data[0]) {
    sprite.data[1]! += sprite.data[3]!;
    sprite.data[2]! += sprite.data[4]!;
    sprite.x = sprite.data[1]! >> 4;
    sprite.y = sprite.data[2]! >> 4;
    sprite.data[0]!--;
  } else {
    DestroySpriteAndMatrix(sprite);
  }
}

function AnimWhipHit_WaitEnd(sprite: Sprite): void {
  if (sprite.animEnded) DestroyAnimSprite(sprite);
}

function AnimSlidingHit(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.x -= gBattleAnimArgs[0]!;
    sprite.y += gBattleAnimArgs[1]!;
  } else {
    sprite.x += gBattleAnimArgs[0]!;
    sprite.y += gBattleAnimArgs[1]!;
  }
  sprite.callback = RunStoredCallbackWhenAnimEnds;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimWhipHit(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) StartSpriteAnim(sprite, 1);
  sprite.callback = AnimWhipHit_WaitEnd;
  SetAnimSpriteInitialXOffset(sprite, gBattleAnimArgs[0]!);
  sprite.y += gBattleAnimArgs[1]!;
}

function AnimFlickeringPunch(sprite: Sprite): void {
  sprite.x += gBattleAnimArgs[0]!;
  sprite.y += gBattleAnimArgs[1]!;
  sprite.data[0] = gBattleAnimArgs[2]!;
  sprite.data[1] = gBattleAnimArgs[3]!;
  sprite.data[3] = gBattleAnimArgs[4]!;
  sprite.data[5] = gBattleAnimArgs[5]!;
  StartSpriteAffineAnim(sprite, gBattleAnimArgs[6]!);
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = TranslateSpriteLinearAndFlicker;
}

// Moves the sprite in a diagonally slashing motion across the target mon.
// Used by moves such as MOVE_CUT and MOVE_AERIAL_ACE.
function AnimCuttingSlice(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y);
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) sprite.y += 8;
  sliceInit(sprite);
}

function sliceInit(sprite: Sprite): void {
  sprite.callback = AnimSlice_Step;
  if (gBattleAnimArgs[2] === 0) {
    sprite.x += gBattleAnimArgs[0]!;
  } else {
    sprite.x -= gBattleAnimArgs[0]!;
    sprite.hFlip = 1;
  }
  sprite.y += gBattleAnimArgs[1]!;
  sprite.data[1]! -= 0x400;
  sprite.data[2]! += 0x400;
  sprite.data[5] = gBattleAnimArgs[2]!;
  if (sprite.data[5] === 1) sprite.data[1] = -sprite.data[1]!;
}

function AnimAirCutterSlice(sprite: Sprite): void {
  const target = animState.gBattleAnimTarget;
  let a: number;
  let b: number;
  switch (gBattleAnimArgs[3]) {
  case 1:
    a = GetBattlerSpriteCoord(BATTLE_PARTNER(target), C.BATTLER_COORD_X) & 0xff;
    b = GetBattlerSpriteCoord(BATTLE_PARTNER(target), C.BATTLER_COORD_Y) & 0xff;
    break;
  case 2:
    a = GetBattlerSpriteCoord(target, C.BATTLER_COORD_X) & 0xff;
    b = GetBattlerSpriteCoord(target, C.BATTLER_COORD_Y) & 0xff;
    if (IsBattlerSpriteVisible(BATTLE_PARTNER(target))) {
      a = Math.trunc((GetBattlerSpriteCoord(BATTLE_PARTNER(target), C.BATTLER_COORD_X) + a) / 2) & 0xff;
      b = Math.trunc((GetBattlerSpriteCoord(BATTLE_PARTNER(target), C.BATTLER_COORD_Y) + b) / 2) & 0xff;
    }
    break;
  case 0:
  default:
    a = GetBattlerSpriteCoord(target, C.BATTLER_COORD_X) & 0xff;
    b = GetBattlerSpriteCoord(target, C.BATTLER_COORD_Y) & 0xff;
    break;
  }
  sprite.x = a;
  sprite.y = b;
  if (GetBattlerSide(target) === C.B_SIDE_PLAYER) sprite.y += 8;
  sliceInit(sprite);
}

function AnimSlice_Step(sprite: Sprite): void {
  sprite.data[3]! += sprite.data[1]!;
  sprite.data[4]! += sprite.data[2]!;
  if (sprite.data[5] === 0) sprite.data[1]! += 0x18;
  else sprite.data[1]! -= 0x18;
  sprite.data[2]! -= 0x18;
  sprite.x2 = sprite.data[3]! >> 8;
  sprite.y2 = sprite.data[4]! >> 8;
  sprite.data[0]!++;
  if (sprite.data[0] === 20) {
    StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
    sprite.data[0] = 3;
    sprite.callback = WaitAnimForDuration;
  }
}

export function UnusedFlickerAnim(sprite: Sprite): void {
  if (sprite.data[2]! > 1) {
    if (sprite.data[3]! & 1) {
      sprite.invisible = false;
      gSprites[sprite.data[0]!]!.invisible = false;
      gSprites[sprite.data[1]!]!.invisible = false;
    } else {
      sprite.invisible = true;
      gSprites[sprite.data[0]!]!.invisible = true;
      gSprites[sprite.data[1]!]!.invisible = true;
    }
    sprite.data[2] = 0;
    sprite.data[3]!++;
  } else {
    sprite.data[2]!++;
  }
  if (sprite.data[3] === 10) {
    DestroySprite(gSprites[sprite.data[0]!]!);
    DestroySprite(gSprites[sprite.data[1]!]!);
    DestroyAnimSprite(sprite);
  }
}

function AnimCirclingMusicNote(sprite: Sprite): void {
  sprite.data[0] = gBattleAnimArgs[2]!;
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x -= gBattleAnimArgs[0]!;
  else sprite.x += gBattleAnimArgs[0]!;
  StartSpriteAnim(sprite, gBattleAnimArgs[5]!);
  sprite.data[1] = -gBattleAnimArgs[3]!;
  sprite.y += gBattleAnimArgs[1]!;
  sprite.data[3] = gBattleAnimArgs[4]!;
  sprite.callback = AnimCirclingMusicNote_Step;
  sprite.callback(sprite);
}

function AnimCirclingMusicNote_Step(sprite: Sprite): void {
  sprite.x2 = Cos(sprite.data[0]!, 100);
  sprite.y2 = Sin(sprite.data[0]!, 20);
  if (sprite.data[0]! < 128) sprite.subpriority = 0;
  else sprite.subpriority = 14;
  sprite.data[0] = (sprite.data[0]! + sprite.data[1]!) & 0xff;
  sprite.data[5]! += 0x82;
  sprite.y2 += sprite.data[5]! >> 8;
  sprite.data[2]!++;
  if (sprite.data[2] === sprite.data[3]) DestroyAnimSprite(sprite);
}

function AnimProtect(sprite: Sprite): void {
  if (IsContest()) gBattleAnimArgs[1] = gBattleAnimArgs[1]! + 8;
  sprite.x = GetBattlerSpriteCoord2(animState.gBattleAnimAttacker, C.BATTLER_COORD_X) + gBattleAnimArgs[0]!;
  sprite.y = GetBattlerSpriteCoord2(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y) + gBattleAnimArgs[1]!;
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER || IsContest())
    sprite.oam.priority = (GetBattlerSpriteBGPriority(animState.gBattleAnimAttacker) + 1) & 3;
  else
    sprite.oam.priority = GetBattlerSpriteBGPriority(animState.gBattleAnimAttacker);
  sprite.data[0] = gBattleAnimArgs[2]!;
  sprite.data[2] = OBJ_PLTT_ID(IndexOfSpritePaletteTag(C.ANIM_TAG_PROTECT));
  sprite.data[7] = 16;
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16 - sprite.data[7]!, sprite.data[7]!));
  sprite.callback = AnimProtect_Step;
}

function AnimProtect_Step(sprite: Sprite): void {
  sprite.data[5]! += 96;
  sprite.x2 = -(sprite.data[5]! >> 8);
  if (++sprite.data[1]! > 1) {
    sprite.data[1] = 0;
    const savedPal = gPlttBufferFaded[sprite.data[2]! + 1]!;
    let i = 0;
    while (i < 6) {
      const id = sprite.data[2]! + ++i;
      gPlttBufferFaded[id] = gPlttBufferFaded[id + 1]!;
    }
    gPlttBufferFaded[sprite.data[2]! + 7] = savedPal;
  }

  if (sprite.data[7]! > 6 && sprite.data[0]! > 0 && ++sprite.data[6]! > 1) {
    sprite.data[6] = 0;
    sprite.data[7]! -= 1;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16 - sprite.data[7]!, sprite.data[7]!));
  }

  if (sprite.data[0]! > 0) {
    sprite.data[0]! -= 1;
  } else if (++sprite.data[6]! > 1) {
    sprite.data[6] = 0;
    sprite.data[7]!++;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16 - sprite.data[7]!, sprite.data[7]!));
    if (sprite.data[7] === 16) {
      sprite.invisible = true;
      sprite.callback = DestroyAnimSpriteAndDisableBlend;
    }
  }
}

function AnimMilkBottle(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.y = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + 0xffe8);
  sprite.data[0] = 0;
  sprite.data[1] = 0;
  sprite.data[2] = 0;
  sprite.data[3] = 0;
  sprite.data[4] = 0;
  sprite.data[6] = 0;
  sprite.data[7] = 16;
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[6]!, sprite.data[7]!));
  sprite.callback = AnimMilkBottle_Step1;
}

function AnimMilkBottle_Step1(sprite: Sprite): void {
  switch (sprite.data[0]) {
  case 0:
    if (++sprite.data[2]! > 0) {
      sprite.data[2] = 0;
      if ((++sprite.data[1]! & 1) !== 0) {
        if (sprite.data[6]! <= 15) sprite.data[6]!++;
      } else if (sprite.data[7]! > 0) {
        sprite.data[7]!--;
      }
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[6]!, sprite.data[7]!));
      if (sprite.data[6] === 16 && sprite.data[7] === 0) {
        sprite.data[1] = 0;
        sprite.data[0]!++;
      }
    }
    break;
  case 1:
    if (++sprite.data[1]! > 8) {
      sprite.data[1] = 0;
      StartSpriteAffineAnim(sprite, 1);
      sprite.data[0]!++;
    }
    break;
  case 2:
    AnimMilkBottle_Step2(sprite, 16, 4);
    if (++sprite.data[1]! > 2) {
      sprite.data[1] = 0;
      sprite.y++;
    }
    if (++sprite.data[2]! <= 29) break;
    if (sprite.data[2]! & 1) {
      if (sprite.data[6]! > 0) sprite.data[6]!--;
    } else if (sprite.data[7]! <= 15) {
      sprite.data[7]!++;
    }
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[6]!, sprite.data[7]!));
    if (sprite.data[6] === 0 && sprite.data[7] === 16) {
      sprite.data[1] = 0;
      sprite.data[2] = 0;
      sprite.data[0]!++;
    }
    break;
  case 3:
    sprite.invisible = true;
    sprite.data[0]!++;
    break;
  case 4:
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 0));
    DestroyAnimSprite(sprite);
    break;
  }
}

function AnimMilkBottle_Step2(sprite: Sprite, _unk1: number, _unk2: number): void {
  if (sprite.data[3]! <= 11) sprite.data[4]! += 2;
  if (u16(sprite.data[3]! - 0x12) <= 0x17) sprite.data[4]! -= 2;
  if (sprite.data[3]! > 0x2f) sprite.data[4]! += 2;
  sprite.x2 = Math.trunc(sprite.data[4]! / 9);
  sprite.y2 = Math.trunc(sprite.data[4]! / 14);
  if (sprite.y2 < 0) sprite.y2 *= -1;
  sprite.data[3]!++;
  if (sprite.data[3]! > 0x3b) sprite.data[3] = 0;
}

function AnimGrantingStars(sprite: Sprite): void {
  if (!gBattleAnimArgs[2]) SetSpriteCoordsToAnimAttackerCoords(sprite);
  SetAnimSpriteInitialXOffset(sprite, gBattleAnimArgs[0]!);
  sprite.y += gBattleAnimArgs[1]!;
  sprite.data[0] = gBattleAnimArgs[5]!;
  sprite.data[1] = gBattleAnimArgs[3]!;
  sprite.data[2] = gBattleAnimArgs[4]!;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = TranslateSpriteLinearFixedPoint;
}

function AnimSparklingStars(sprite: Sprite): void {
  const battler = !gBattleAnimArgs[2] ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  if (IsDoubleBattle() && IsBattlerSpriteVisible(BATTLE_PARTNER(battler))) {
    const pos = SetAverageBattlerPositions(battler, !!gBattleAnimArgs[6]);
    sprite.x = pos.x;
    sprite.y = pos.y;
    SetAnimSpriteInitialXOffset(sprite, gBattleAnimArgs[0]!);
    sprite.y += gBattleAnimArgs[1]!;
  } else {
    if (!gBattleAnimArgs[6]) {
      sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X);
      sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y) + gBattleAnimArgs[1]!;
    } else {
      sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2);
      sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[1]!;
    }
    SetAnimSpriteInitialXOffset(sprite, gBattleAnimArgs[0]!);
  }
  sprite.data[0] = gBattleAnimArgs[5]!;
  sprite.data[1] = gBattleAnimArgs[3]!;
  sprite.data[2] = gBattleAnimArgs[4]!;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = TranslateSpriteLinearFixedPoint;
}

function AnimBubbleBurst(sprite: Sprite): void {
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
    sprite.x += gBattleAnimArgs[0]!;
    sprite.y += gBattleAnimArgs[1]!;
  } else {
    sprite.x -= gBattleAnimArgs[0]!;
    sprite.y += gBattleAnimArgs[1]!;
    StartSpriteAnim(sprite, 1);
  }
  sprite.callback = AnimBubbleBurst_Step;
}

function AnimBubbleBurst_Step(sprite: Sprite): void {
  if (++sprite.data[0]! > 30) {
    sprite.y2 = Math.trunc((30 - sprite.data[0]!) / 3);
    sprite.x2 = Sin(sprite.data[1]! * 4, 3);
    sprite.data[1]!++;
  }
  if (sprite.animEnded) DestroyAnimSprite(sprite);
}

function AnimSleepLetterZ(sprite: Sprite): void {
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
    sprite.x += gBattleAnimArgs[0]!;
    sprite.y += gBattleAnimArgs[1]!;
    sprite.data[3] = 1;
  } else {
    sprite.x -= gBattleAnimArgs[0]!;
    sprite.y += gBattleAnimArgs[1]!;
    sprite.data[3] = -1;
    StartSpriteAffineAnim(sprite, 1);
  }
  sprite.callback = AnimSleepLetterZ_Step;
}

function AnimSleepLetterZ_Step(sprite: Sprite): void {
  sprite.y2 = -Math.trunc(sprite.data[0]! / 0x28);
  sprite.x2 = Math.trunc(sprite.data[4]! / 10);
  sprite.data[4]! += sprite.data[3]! * 2;
  sprite.data[0]! += sprite.data[1]!;
  if (++sprite.data[1]! > 60) DestroySpriteAndMatrix(sprite);
}

function AnimLockOnTarget(sprite: Sprite): void {
  sprite.x -= 32;
  sprite.y -= 32;
  sprite.data[0] = 20;
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, AnimLockOnTarget_Step1);
}

const sInclineMonCoordTable = () => cdata<number[][]>("battle_anim_effects_1", "sInclineMonCoordTable");

function AnimLockOnTarget_Step1(sprite: Sprite): void {
  switch (sprite.data[5]! & 1) {
  case 0:
    sprite.data[0] = 1;
    sprite.callback = WaitAnimForDuration;
    StoreSpriteCallbackInData6(sprite, AnimLockOnTarget_Step1);
    break;
  case 1: {
    sprite.x += sprite.x2;
    sprite.y += sprite.y2;
    sprite.y2 = 0;
    sprite.x2 = 0;
    sprite.data[0] = 8;
    const coords = sInclineMonCoordTable()[sprite.data[5]! >> 8]!;
    sprite.data[2] = sprite.x + coords[0]!;
    sprite.data[4] = sprite.y + coords[1]!;
    sprite.callback = StartAnimLinearTranslation;
    StoreSpriteCallbackInData6(sprite, AnimLockOnTarget_Step2);
    sprite.data[5]! += 0x100;
    PlaySE12WithPanning(C.SE_M_LOCK_ON, BattleAnimAdjustPanning(C.SOUND_PAN_TARGET));
    break;
  }
  }
  sprite.data[5]! ^= 1;
}

function AnimLockOnTarget_Step2(sprite: Sprite): void {
  if (sprite.data[5]! >> 8 === 4) {
    sprite.data[0] = 10;
    sprite.callback = WaitAnimForDuration;
    StoreSpriteCallbackInData6(sprite, AnimLockOnTarget_Step3);
  } else {
    sprite.callback = AnimLockOnTarget_Step1;
  }
}

function AnimLockOnTarget_Step3(sprite: Sprite): void {
  if (sprite.oam.affineParam === 0) {
    sprite.data[0] = 3;
    sprite.data[1] = 0;
    sprite.data[2] = 0;
    sprite.callback = WaitAnimForDuration;
    StoreSpriteCallbackInData6(sprite, AnimLockOnTarget_Step4);
  } else {
    let a: number;
    let b: number;
    switch (sprite.oam.affineParam) {
    case 1: a = -8; b = -8; break;
    case 2: a = -8; b = 8; break;
    case 3: a = 8; b = -8; break;
    default: a = 8; b = 8; break;
    }
    sprite.x += sprite.x2;
    sprite.y += sprite.y2;
    sprite.y2 = 0;
    sprite.x2 = 0;
    sprite.data[0] = 6;
    sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + a;
    sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + b;
    sprite.callback = StartAnimLinearTranslation;
    StoreSpriteCallbackInData6(sprite, AnimLockOnTarget_Step5);
  }
}

function AnimLockOnTarget_Step4(sprite: Sprite): void {
  if (sprite.data[2] === 0) {
    if ((sprite.data[1]! += 3) > 16) sprite.data[1] = 16;
  } else if ((sprite.data[1]! -= 3) < 0) {
    sprite.data[1] = 0;
  }

  BlendPalettes(GetBattlePalettesMask(true, true, true, true, true, false, false), sprite.data[1]!, RGB_WHITE);
  if (sprite.data[1] === 16) {
    sprite.data[2]!++;
    const pal = sprite.oam.paletteNum;
    const src = OBJ_PLTT_ID(pal) + 8;
    LoadPalette(gPlttBufferUnfaded.slice(src, src + 2), OBJ_PLTT_ID(pal) + 1, 2 * 2);
    PlaySE12WithPanning(C.SE_M_LEER, BattleAnimAdjustPanning(C.SOUND_PAN_TARGET));
  } else if (sprite.data[1] === 0) {
    sprite.callback = AnimLockOnTarget_Step5;
  }
}

function AnimLockOnTarget_Step5(sprite: Sprite): void {
  if (u16(gBattleAnimArgs[7]!) === 0xffff) {
    sprite.data[1] = 0;
    sprite.data[0] = 0;
    sprite.callback = AnimLockOnTarget_Step6;
  }
}

function AnimLockOnTarget_Step6(sprite: Sprite): void {
  if (sprite.data[0]! % 3 === 0) {
    sprite.data[1]!++;
    sprite.invisible = !sprite.invisible;
  }
  sprite.data[0]!++;
  if (sprite.data[1] === 8) DestroyAnimSprite(sprite);
}

function AnimLockOnMoveTarget(sprite: Sprite): void {
  sprite.oam.affineParam = u16(gBattleAnimArgs[0]!);
  const p = s16(sprite.oam.affineParam);
  if (p === 1) {
    sprite.x -= 0x18;
    sprite.y -= 0x18;
  } else if (p === 2) {
    sprite.x -= 0x18;
    sprite.y += 0x18;
    sprite.oam.matrixNum = ST_OAM_VFLIP;
  } else if (p === 3) {
    sprite.x += 0x18;
    sprite.y -= 0x18;
    sprite.oam.matrixNum = ST_OAM_HFLIP;
  } else {
    sprite.x += 0x18;
    sprite.y += 0x18;
    sprite.oam.matrixNum = ST_OAM_HFLIP | ST_OAM_VFLIP;
  }
  sprite.oam.tileNum = (sprite.oam.tileNum + 16) & 0x3ff;
  sprite.callback = AnimLockOnTarget;
  sprite.callback(sprite);
}

function AnimBowMon(sprite: Sprite): void {
  sprite.invisible = true;
  sprite.data[0] = 0;
  switch (gBattleAnimArgs[0]) {
  case 0: sprite.callback = AnimBowMon_Step1; break;
  case 1: sprite.callback = AnimBowMon_Step2; break;
  case 2: sprite.callback = AnimBowMon_Step3; break;
  default: sprite.callback = AnimBowMon_Step4; break;
  }
}

function AnimBowMon_Step1(sprite: Sprite): void {
  sprite.data[0] = 6;
  sprite.data[1] = GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER ? 2 : -2;
  sprite.data[2] = 0;
  sprite.data[3] = gBattlerSpriteIds[animState.gBattleAnimAttacker]!;
  StoreSpriteCallbackInData6(sprite, AnimBowMon_Step1_Callback);
  sprite.callback = TranslateSpriteLinearById;
}

function AnimBowMon_Step1_Callback(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    sprite.data[3] = gBattlerSpriteIds[animState.gBattleAnimAttacker]!;
    PrepareBattlerSpriteForRotScale(sprite.data[3]!, ST_OAM_OBJ_NORMAL);
    sprite.data[6] = GetBattlerSide(animState.gBattleAnimAttacker);
    sprite.data[4] = sprite.data[6] ? 0x300 : -0x300;
    sprite.data[5] = 0;
  }
  sprite.data[5]! += sprite.data[4]!;
  SetSpriteRotScale(sprite.data[3]!, 0x100, 0x100, u16(sprite.data[5]!));
  SetBattlerSpriteYOffsetFromRotation(sprite.data[3]!);
  if (++sprite.data[0]! > 3) {
    sprite.data[0] = 0;
    sprite.callback = AnimBowMon_Step4;
  }
}

function AnimBowMon_Step2(sprite: Sprite): void {
  sprite.data[0] = 4;
  sprite.data[1] = GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER ? -3 : 3;
  sprite.data[2] = 0;
  sprite.data[3] = gBattlerSpriteIds[animState.gBattleAnimAttacker]!;
  StoreSpriteCallbackInData6(sprite, AnimBowMon_Step4);
  sprite.callback = TranslateSpriteLinearById;
}

function AnimBowMon_Step3(sprite: Sprite): void {
  if (++sprite.data[0]! > 8) {
    sprite.data[0] = 0;
    sprite.callback = AnimBowMon_Step3_Callback;
  }
}

function AnimBowMon_Step3_Callback(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    sprite.data[3] = gBattlerSpriteIds[animState.gBattleAnimAttacker]!;
    sprite.data[6] = GetBattlerSide(animState.gBattleAnimAttacker);
    if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
      sprite.data[4] = s16(0xfc00);
      sprite.data[5] = 0xc00;
    } else {
      sprite.data[4] = 0x400;
      sprite.data[5] = s16(0xf400);
    }
  }
  sprite.data[5]! += sprite.data[4]!;
  SetSpriteRotScale(sprite.data[3]!, 0x100, 0x100, u16(sprite.data[5]!));
  SetBattlerSpriteYOffsetFromRotation(sprite.data[3]!);
  if (++sprite.data[0]! > 2) {
    ResetSpriteRotScale(sprite.data[3]!);
    sprite.callback = AnimBowMon_Step4;
  }
}

function AnimBowMon_Step4(sprite: Sprite): void {
  DestroyAnimSprite(sprite);
}

function AnimTipMon(sprite: Sprite): void {
  sprite.data[0] = 0;
  sprite.callback = AnimTipMon_Step;
}

function AnimTipMon_Step(sprite: Sprite): void {
  switch (sprite.data[0]) {
  case 0:
    sprite.data[1] = 0;
    sprite.data[2] = gBattlerSpriteIds[animState.gBattleAnimAttacker]!;
    sprite.data[3] = GetBattlerSide(animState.gBattleAnimAttacker);
    sprite.data[4] = sprite.data[3] !== C.B_SIDE_PLAYER ? 0x200 : -0x200;
    sprite.data[5] = 0;
    PrepareBattlerSpriteForRotScale(sprite.data[2]!, ST_OAM_OBJ_NORMAL);
    sprite.data[0]!++;
    // fall through
  case 1:
    sprite.data[5]! += sprite.data[4]!;
    SetSpriteRotScale(sprite.data[2]!, 0x100, 0x100, u16(sprite.data[5]!));
    SetBattlerSpriteYOffsetFromRotation(sprite.data[2]!);
    if (++sprite.data[1]! > 3) {
      sprite.data[1] = 0;
      sprite.data[4]! *= -1;
      sprite.data[0]!++;
    }
    break;
  case 2:
    sprite.data[5]! += sprite.data[4]!;
    SetSpriteRotScale(sprite.data[2]!, 0x100, 0x100, u16(sprite.data[5]!));
    SetBattlerSpriteYOffsetFromRotation(sprite.data[2]!);
    if (++sprite.data[1]! > 3) {
      ResetSpriteRotScale(sprite.data[2]!);
      DestroyAnimSprite(sprite);
    }
    break;
  }
}

export function AnimTask_SkullBashPosition(taskId: number): void {
  const t = gTasks[taskId]!;
  t.data[0] = gBattlerSpriteIds[animState.gBattleAnimAttacker]!;
  const side = GetBattlerSide(animState.gBattleAnimAttacker);
  t.data[1] = side;
  t.data[2] = 0;
  switch (gBattleAnimArgs[0]) {
  default:
    DestroyAnimVisualTask(taskId);
    break;
  case 0:
    t.data[2] = 0;
    t.data[3] = 8;
    t.data[4] = 0;
    t.data[5] = 3;
    if (side === C.B_SIDE_PLAYER) t.data[5]! *= -1;
    t.func = AnimTask_SkullBashPositionSet;
    break;
  case 1:
    t.data[3] = 8;
    t.data[4] = 0x600;
    t.data[5] = 0xc0;
    if (side === C.B_SIDE_PLAYER) {
      t.data[4] = -t.data[4]!;
      t.data[5] = -t.data[5]!;
    }
    t.func = AnimTask_SkullBashPositionReset;
    break;
  }
}

function AnimTask_SkullBashPositionSet(taskId: number): void {
  const task = gTasks[taskId]!;
  const mon = gSprites[task.data[0]!]!;
  switch (task.data[2]) {
  case 0:
    if (task.data[3]) {
      task.data[4] = s16(task.data[4]! + task.data[5]!);
      mon.x2 = task.data[4]!;
      task.data[3]!--;
    } else {
      task.data[3] = 8;
      task.data[4] = 0;
      task.data[5] = task.data[1] === 0 ? -0xc0 : 0xc0;
      PrepareBattlerSpriteForRotScale(task.data[0]!, ST_OAM_OBJ_NORMAL);
      task.data[2]!++;
    }
    break;
  case 1:
    if (task.data[3]) {
      task.data[4] = s16(task.data[4]! + task.data[5]!);
      SetSpriteRotScale(task.data[0]!, 0x100, 0x100, u16(task.data[4]!));
      SetBattlerSpriteYOffsetFromRotation(task.data[0]!);
      task.data[3]!--;
    } else {
      task.data[3] = 8;
      task.data[4] = mon.x2;
      task.data[5] = task.data[1] === 0 ? 0x2 : -0x2;
      task.data[6] = 1;
      task.data[2]!++;
    }
    break;
  case 2:
    if (task.data[3]) {
      if (task.data[6]) {
        task.data[6]!--;
      } else {
        if (task.data[3]! & 1) mon.x2 = task.data[4]! + task.data[5]!;
        else mon.x2 = task.data[4]! - task.data[5]!;
        task.data[6] = 1;
        task.data[3]!--;
      }
    } else {
      mon.x2 = task.data[4]!;
      task.data[3] = 12;
      task.data[2]!++;
    }
    break;
  case 3:
    if (task.data[3]) {
      task.data[3]!--;
    } else {
      task.data[3] = 3;
      task.data[4] = mon.x2;
      task.data[5] = task.data[1] === 0 ? 8 : -8;
      task.data[2]!++;
    }
    break;
  case 4:
    if (task.data[3]) {
      task.data[4] = s16(task.data[4]! + task.data[5]!);
      mon.x2 = task.data[4]!;
      task.data[3]!--;
    } else {
      DestroyAnimVisualTask(taskId);
    }
    break;
  }
}

function AnimTask_SkullBashPositionReset(taskId: number): void {
  const task = gTasks[taskId]!;
  if (task.data[3]) {
    task.data[4] = s16(task.data[4]! - task.data[5]!);
    SetSpriteRotScale(task.data[0]!, 0x100, 0x100, u16(task.data[4]!));
    SetBattlerSpriteYOffsetFromRotation(task.data[0]!);
    task.data[3]!--;
  } else {
    ResetSpriteRotScale(task.data[0]!);
    DestroyAnimVisualTask(taskId);
  }
}

function AnimSlashSlice(sprite: Sprite): void {
  if (gBattleAnimArgs[0] === 0) {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2) + gBattleAnimArgs[1]!;
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[2]!;
  } else {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + gBattleAnimArgs[1]!;
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[2]!;
  }
  sprite.data[0] = 0;
  sprite.data[1] = 0;
  StoreSpriteCallbackInData6(sprite, AnimFalseSwipeSlice_Step3);
  sprite.callback = RunStoredCallbackWhenAnimEnds;
}

function AnimFalseSwipeSlice(sprite: Sprite): void {
  sprite.x = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + 0xffd0);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  StoreSpriteCallbackInData6(sprite, AnimFalseSwipeSlice_Step1);
  sprite.callback = RunStoredCallbackWhenAnimEnds;
}

function AnimFalseSwipePositionedSlice(sprite: Sprite): void {
  sprite.x = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + 0xffd0 + gBattleAnimArgs[0]!);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  StartSpriteAnim(sprite, 1);
  sprite.data[0] = 0;
  sprite.data[1] = 0;
  sprite.callback = AnimFalseSwipeSlice_Step3;
}

function AnimFalseSwipeSlice_Step1(sprite: Sprite): void {
  if (++sprite.data[0]! > 8) {
    sprite.data[0] = 12;
    sprite.data[1] = 8;
    sprite.data[2] = 0;
    StoreSpriteCallbackInData6(sprite, AnimFalseSwipeSlice_Step2);
    sprite.callback = TranslateSpriteLinear;
  }
}

function AnimFalseSwipeSlice_Step2(sprite: Sprite): void {
  sprite.data[0] = 0;
  sprite.data[1] = 0;
  sprite.callback = AnimFalseSwipeSlice_Step3;
}

function AnimFalseSwipeSlice_Step3(sprite: Sprite): void {
  if (++sprite.data[0]! > 1) {
    sprite.data[0] = 0;
    sprite.invisible = !sprite.invisible;
    if (++sprite.data[1]! > 8) DestroyAnimSprite(sprite);
  }
}

function AnimEndureEnergy(sprite: Sprite): void {
  if (gBattleAnimArgs[0] === 0) {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X) + gBattleAnimArgs[1]!;
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y) + gBattleAnimArgs[2]!;
  } else {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X) + gBattleAnimArgs[1]!;
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y) + gBattleAnimArgs[2]!;
  }
  sprite.data[0] = 0;
  sprite.data[1] = gBattleAnimArgs[3]!;
  sprite.callback = AnimEndureEnergy_Step;
}

function AnimEndureEnergy_Step(sprite: Sprite): void {
  if (++sprite.data[0]! > sprite.data[1]!) {
    sprite.data[0] = 0;
    sprite.y--;
  }
  sprite.y -= sprite.data[0]!;
  if (sprite.animEnded) DestroyAnimSprite(sprite);
}

function AnimSharpenSphere(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET) - 12;
  sprite.data[0] = 0;
  sprite.data[1] = 2;
  sprite.data[2] = 0;
  sprite.data[3] = 0;
  sprite.data[4] = 0;
  sprite.data[5] = BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER);
  sprite.callback = AnimSharpenSphere_Step;
}

function AnimSharpenSphere_Step(sprite: Sprite): void {
  if (++sprite.data[0]! >= sprite.data[1]!) {
    sprite.invisible = !sprite.invisible;
    if (!sprite.invisible) {
      sprite.data[4]!++;
      if (!(sprite.data[4]! & 1)) PlaySE12WithPanning(C.SE_M_SWAGGER2, sprite.data[5]!);
    }
    sprite.data[0] = 0;
    if (++sprite.data[2]! > 1) {
      sprite.data[2] = 0;
      sprite.data[1]!++;
    }
  }
  if (sprite.animEnded && sprite.data[1]! > 16 && sprite.invisible) DestroyAnimSprite(sprite);
}

function AnimConversion(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X) + gBattleAnimArgs[0]!;
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y) + gBattleAnimArgs[1]!;
    if (IsContest()) sprite.y += 10;
    sprite.data[0]!++;
  }
  if (u16(gBattleAnimArgs[7]!) === 0xffff) DestroyAnimSprite(sprite);
}

export function AnimTask_ConversionAlphaBlend(taskId: number): void {
  const t = gTasks[taskId]!;
  if (t.data[2] === 1) {
    gBattleAnimArgs[7] = -1;
    t.data[2]!++;
  } else if (t.data[2] === 2) {
    DestroyAnimVisualTask(taskId);
  } else {
    if (++t.data[0]! === 4) {
      t.data[0] = 0;
      t.data[1]!++;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16 - t.data[1]!, t.data[1]!));
      if (t.data[1] === 16) t.data[2]!++;
    }
  }
}

function AnimConversion2(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, false);
  sprite.animPaused = true;
  sprite.data[0] = gBattleAnimArgs[2]!;
  sprite.callback = AnimConversion2_Step;
}

function AnimConversion2_Step(sprite: Sprite): void {
  if (sprite.data[0]) {
    sprite.data[0]!--;
  } else {
    sprite.animPaused = false;
    sprite.data[0] = 30;
    sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
    sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
    sprite.callback = StartAnimLinearTranslation;
    StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  }
}

export function AnimTask_Conversion2AlphaBlend(taskId: number): void {
  const t = gTasks[taskId]!;
  if (++t.data[0]! === 4) {
    t.data[0] = 0;
    t.data[1]!++;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(t.data[1]!, 16 - t.data[1]!));
    if (t.data[1] === 16) DestroyAnimVisualTask(taskId);
  }
}

// Unused
export function AnimTask_HideBattlersHealthbox(taskId: number): void {
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (gBattleAnimArgs[0] === 1 && GetBattlerSide(i) === C.B_SIDE_PLAYER) SetHealthboxSpriteInvisible(gHealthboxSpriteIds[i]!);
    if (gBattleAnimArgs[1] === 1 && GetBattlerSide(i) === C.B_SIDE_OPPONENT) SetHealthboxSpriteInvisible(gHealthboxSpriteIds[i]!);
  }
  DestroyAnimVisualTask(taskId);
}

// Unused
export function AnimTask_ShowBattlersHealthbox(taskId: number): void {
  for (let i = 0; i < G.gBattlersCount; i++) SetHealthboxSpriteVisible(gHealthboxSpriteIds[i]!);
  DestroyAnimVisualTask(taskId);
}

function AnimMoon(sprite: Sprite): void {
  if (IsContest()) {
    sprite.x = 48;
    sprite.y = 40;
  } else {
    sprite.x = gBattleAnimArgs[0]!;
    sprite.y = gBattleAnimArgs[1]!;
  }
  sprite.oam.shape = 0; // SPRITE_SHAPE(8x8)
  sprite.oam.size = 3; // SPRITE_SIZE(64x32)
  sprite.data[0] = 0;
  sprite.callback = AnimMoon_Step;
}

function AnimMoon_Step(sprite: Sprite): void {
  if (sprite.data[0]) DestroyAnimSprite(sprite);
}

function AnimMoonlightSparkle(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2) + gBattleAnimArgs[0]!;
  sprite.y = gBattleAnimArgs[1]!;
  sprite.data[0] = 0;
  sprite.data[1] = 0;
  sprite.data[2] = 0;
  sprite.data[3] = 0;
  sprite.data[4] = 1;
  sprite.callback = AnimMoonlightSparkle_Step;
}

function AnimMoonlightSparkle_Step(sprite: Sprite): void {
  if (++sprite.data[1]! > 1) {
    sprite.data[1] = 0;
    if (sprite.data[2]! < 120) {
      sprite.y++;
      sprite.data[2]!++;
    }
  }
  if (sprite.data[0]) DestroyAnimSprite(sprite);
}

export function AnimTask_MoonlightEndFade(taskId: number): void {
  const a = GetBattlePalettesMask(true, false, false, false, false, false, false) & 0xffff;
  const t = gTasks[taskId]!;
  t.data[0] = 0;
  t.data[1] = 0;
  t.data[2] = 0;
  t.data[3] = s16(a);
  t.data[4] = 0;
  t.data[5] = 0;
  t.data[6] = 0;
  t.data[7] = 13;
  t.data[8] = 14;
  t.data[9] = 15;
  let b = GetBattleMonSpritePalettesMask(true, true, true, true);
  const c = (a | b) >>> 0;
  // StorePointerInVars
  t.data[14] = s16(c);
  t.data[15] = s16(c >>> 16);
  b = (b | (0x10000 << IndexOfSpritePaletteTag(C.ANIM_TAG_MOON))) >>> 0;
  const d = IndexOfSpritePaletteTag(C.ANIM_TAG_GREEN_SPARKLE);
  BeginNormalPaletteFade(((0x10000 << d) | b) >>> 0, 0, 0, 16, RGB(27, 29, 31));
  t.func = AnimTask_MoonlightEndFade_Step;
  t.func(taskId);
}

export function AnimTask_MoonlightEndFade_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  switch (task.data[0]) {
  case 0:
    if (++task.data[1]! > 0) {
      let color: number;
      task.data[1] = 0;
      if (++task.data[2]! <= 15) {
        task.data[4]! += task.data[7]!;
        task.data[5]! += task.data[8]!;
        task.data[6]! += task.data[9]!;
        const red = u16(task.data[4]!) >> 3;
        const green = u16(task.data[5]!) >> 3;
        const blue = u16(task.data[6]!) >> 3;
        color = RGB(red, green, blue);
      } else {
        color = RGB(27, 29, 31);
        task.data[0]!++;
      }
      let bitmask = 1;
      let r3 = 0;
      for (let i = 0; i <= 15; i++) {
        if (task.data[3]! & bitmask) {
          for (let j = 1; j <= 15; j++) gPlttBufferFaded[r3 + j] = color;
        }
        bitmask = (bitmask << 1) & 0xffff;
        r3 += 16;
      }
    }
    break;
  case 1:
    if (!gPaletteFade.active) {
      const moon = animTemplate("gMoonSpriteTemplate");
      const sparkle = animTemplate("gMoonlightSparkleSpriteTemplate");
      for (let spriteId = 0; spriteId < MAX_SPRITES; spriteId++) {
        if (gSprites[spriteId]!.template === moon || gSprites[spriteId]!.template === sparkle) gSprites[spriteId]!.data[0] = 1;
      }
      task.data[1] = 0;
      task.data[0]!++;
    }
    break;
  case 2:
    if (++task.data[1]! > 30) {
      // LoadPointerFromVars
      BeginNormalPaletteFade((u16(task.data[14]!) | (u16(task.data[15]!) << 16)) >>> 0, 0, 16, 0, RGB(27, 29, 31));
      task.data[0]!++;
    }
    break;
  case 3:
    if (!gPaletteFade.active) DestroyAnimVisualTask(taskId);
    break;
  }
}

function AnimHornHit(sprite: Sprite): void {
  if (gBattleAnimArgs[2]! < 2) gBattleAnimArgs[2] = 2;
  if (gBattleAnimArgs[2]! > 0x7f) gBattleAnimArgs[2] = 0x7f;

  sprite.data[0] = 0;
  sprite.data[1] = gBattleAnimArgs[2]!;
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + gBattleAnimArgs[0]!;
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[1]!;
  sprite.data[6] = sprite.x;
  sprite.data[7] = sprite.y;
  if (IsContest()) {
    sprite.oam.matrixNum = ST_OAM_HFLIP;
    sprite.x += 40;
    sprite.y += 20;
    sprite.data[2] = sprite.x << 7;
    sprite.data[3] = Math.trunc(-0x1400 / sprite.data[1]!);
    sprite.data[4] = sprite.y << 7;
    sprite.data[5] = Math.trunc(-0xa00 / sprite.data[1]!);
  } else if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
    sprite.x -= 40;
    sprite.y += 20;
    sprite.data[2] = sprite.x << 7;
    sprite.data[3] = Math.trunc(0x1400 / sprite.data[1]!);
    sprite.data[4] = sprite.y << 7;
    sprite.data[5] = Math.trunc(-0xa00 / sprite.data[1]!);
  } else {
    sprite.x += 40;
    sprite.y -= 20;
    sprite.data[2] = sprite.x << 7;
    sprite.data[3] = Math.trunc(-0x1400 / sprite.data[1]!);
    sprite.data[4] = sprite.y << 7;
    sprite.data[5] = Math.trunc(0xa00 / sprite.data[1]!);
    sprite.oam.matrixNum = ST_OAM_HFLIP | ST_OAM_VFLIP;
  }
  sprite.callback = AnimHornHit_Step;
}

function AnimHornHit_Step(sprite: Sprite): void {
  sprite.data[2]! += sprite.data[3]!;
  sprite.data[4]! += sprite.data[5]!;
  sprite.x = sprite.data[2]! >> 7;
  sprite.y = sprite.data[4]! >> 7;
  if (--sprite.data[1]! === 1) {
    sprite.x = sprite.data[6]!;
    sprite.y = sprite.data[7]!;
  }
  if (sprite.data[1] === 0) DestroyAnimSprite(sprite);
}

export function AnimTask_DoubleTeam(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[0] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.data[1] = AllocSpritePalette(C.ANIM_TAG_BENT_SPOON);
  const r3 = OBJ_PLTT_ID(task.data[1]!) & 0xffff;
  const r4 = OBJ_PLTT_ID(gSprites[task.data[0]!]!.oam.paletteNum) & 0xffff;
  for (let i = 1; i < 16; i++) gPlttBufferUnfaded[r3 + i] = gPlttBufferUnfaded[r4 + i]!;

  BlendPalette(r3, 16, 11, RGB_BLACK);
  task.data[3] = 0;
  let i = 0;
  let obj: number;
  while (i < 2 && (obj = CloneBattlerSpriteWithBlend(0)) >= 0) {
    gSprites[obj]!.oam.paletteNum = task.data[1]!;
    gSprites[obj]!.data[0] = 0;
    gSprites[obj]!.data[1] = i << 7;
    gSprites[obj]!.data[2] = taskId;
    gSprites[obj]!.callback = AnimDoubleTeam;
    task.data[3]!++;
    i++;
  }

  task.func = AnimTask_DoubleTeam_Step;
  if (GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker) === 1) ClearGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG1_ON);
  else ClearGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG2_ON);
}

function AnimTask_DoubleTeam_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  if (!task.data[3]) {
    if (GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker) === 1) SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG1_ON);
    else SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_BG2_ON);
    FreeSpritePaletteByTag(C.ANIM_TAG_BENT_SPOON);
    DestroyAnimVisualTask(taskId);
  }
}

function AnimDoubleTeam(sprite: Sprite): void {
  if (++sprite.data[3]! > 1) {
    sprite.data[3] = 0;
    sprite.data[0]!++;
  }
  if (sprite.data[0]! > 64) {
    gTasks[sprite.data[2]!]!.data[3]!--;
    DestroySpriteWithActiveSheet(sprite);
  } else {
    sprite.data[4] = Math.trunc(gSineTable[sprite.data[0]!]! / 6);
    sprite.data[5] = Math.trunc(gSineTable[sprite.data[0]!]! / 13);
    sprite.data[1] = (sprite.data[1]! + sprite.data[5]!) & 0xff;
    sprite.x2 = Sin(sprite.data[1]!, sprite.data[4]!);
  }
}

function AnimSuperFang(sprite: Sprite): void {
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = RunStoredCallbackWhenAnimEnds;
}

const sParticlesColorBlendTable = () => cdata<number[][]>("battle_anim_effects_1", "sParticlesColorBlendTable");

export function AnimTask_MusicNotesRainbowBlend(taskId: number): void {
  const table = sParticlesColorBlendTable();
  let index = IndexOfSpritePaletteTag(table[0]![0]!) & 0xffff;
  if (index !== 0xff) {
    index = OBJ_PLTT_ID(index);
    for (let i = 1; i < table[0]!.length; i++) gPlttBufferFaded[index + i] = table[0]![i]!;
  }
  for (let j = 1; j < table.length; j++) {
    index = AllocSpritePalette(table[j]![0]!) & 0xffff;
    if (index !== 0xff) {
      index = OBJ_PLTT_ID(index);
      for (let i = 1; i < table[0]!.length; i++) gPlttBufferFaded[index + i] = table[j]![i]!;
    }
  }
  DestroyAnimVisualTask(taskId);
}

// clears the rainbow effect for musical notes.
export function AnimTask_MusicNotesClearRainbowBlend(taskId: number): void {
  const table = sParticlesColorBlendTable();
  for (let i = 1; i < table.length; i++) FreeSpritePaletteByTag(table[i]![0]!);
  DestroyAnimVisualTask(taskId);
}

// sMoveTimer data[0], sBlendTableIdx data[1], sBlendTimer data[2], sBlendCycleTime data[3],
// sX data[4], sY data[5], sVelocX data[6], sVelocY data[7]
function AnimWavyMusicNotes(sprite: Sprite): void {
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  StartSpriteAnim(sprite, gBattleAnimArgs[0]!);
  const index = IndexOfSpritePaletteTag(sParticlesColorBlendTable()[gBattleAnimArgs[1]!]![0]!) & 0xff;
  if (index !== 0xff) sprite.oam.paletteNum = index;

  sprite.data[1] = gBattleAnimArgs[1]!;
  sprite.data[2] = 0;
  sprite.data[3] = gBattleAnimArgs[2]!;
  let x: number;
  let y: number;
  if (IsContest()) {
    x = 48;
    y = 40;
  } else {
    x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) & 0xff;
    y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) & 0xff;
  }
  sprite.data[4] = sprite.x << 4;
  sprite.data[5] = sprite.y << 4;
  const v = AnimWavyMusicNotes_CalcVelocity(s16(x - sprite.x), s16(y - sprite.y), 40);
  sprite.data[6] = v.velocX;
  sprite.data[7] = v.velocY;
  sprite.callback = AnimWavyMusicNotes_Step;
}

function AnimWavyMusicNotes_CalcVelocity(x: number, y: number, xSpeedFactor: number): { velocX: number; velocY: number } {
  if (x < 0) xSpeedFactor = (-xSpeedFactor << 24) >> 24;
  const x2 = x * 256;
  let time = Math.trunc(x2 / xSpeedFactor);
  if (time === 0) time = 1;
  return { velocX: s16(Math.trunc(x2 / time)), velocY: s16(Math.trunc((y * 256) / time)) };
}

function AnimWavyMusicNotes_Step(sprite: Sprite): void {
  sprite.data[0]!++;
  const trigIdx = s16(sprite.data[0]! * 5 - ((Math.trunc(sprite.data[0]! * 5 / 256)) << 8));
  sprite.data[4]! += sprite.data[6]!;
  sprite.data[5]! += sprite.data[7]!;
  sprite.x = sprite.data[4]! >> 4;
  sprite.y = sprite.data[5]! >> 4;
  sprite.y2 = Sin(trigIdx, 15);

  const y = s16(sprite.y);
  if (sprite.x < -16 || sprite.x > C.DISPLAY_WIDTH + 16 || y < -16 || y > C.DISPLAY_HEIGHT - 32) {
    DestroySpriteAndMatrix(sprite);
  } else {
    if (sprite.data[3] && ++sprite.data[2]! > sprite.data[3]!) {
      sprite.data[2] = 0;
      if (++sprite.data[1]! > 3) sprite.data[1] = 0;
      const index = IndexOfSpritePaletteTag(sParticlesColorBlendTable()[sprite.data[1]!]![0]!) & 0xff;
      if (index !== 0xff) sprite.oam.paletteNum = index;
    }
  }
}

function AnimFlyingMusicNotes(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_OPPONENT) gBattleAnimArgs[1] = gBattleAnimArgs[1]! * -1;
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2) + gBattleAnimArgs[1]!;
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[2]!;
  StartSpriteAnim(sprite, gBattleAnimArgs[0]!);
  sprite.data[2] = 0;
  sprite.data[3] = 0;
  sprite.data[4] = sprite.x << 4;
  sprite.data[5] = sprite.y << 4;
  sprite.data[6] = Math.trunc((gBattleAnimArgs[1]! << 4) / 5);
  sprite.data[7] = Math.trunc((gBattleAnimArgs[2]! << 7) / 5);
  sprite.callback = AnimFlyingMusicNotes_Step;
}

function AnimFlyingMusicNotes_Step(sprite: Sprite): void {
  sprite.data[4]! += sprite.data[6]!;
  sprite.data[5]! += sprite.data[7]!;
  sprite.x = sprite.data[4]! >> 4;
  sprite.y = sprite.data[5]! >> 4;
  if (sprite.data[0]! > 5 && sprite.data[3] === 0) {
    sprite.data[2] = (sprite.data[2]! + 16) & 0xff;
    sprite.x2 = Cos(sprite.data[2]!, 18);
    sprite.y2 = Sin(sprite.data[2]!, 18);
    if (sprite.data[2] === 0) sprite.data[3] = 1;
  }
  if (++sprite.data[0]! === 48) DestroySpriteAndMatrix(sprite);
}

function AnimBellyDrumHand(sprite: Sprite): void {
  let a: number;
  if (gBattleAnimArgs[0] === 1) {
    sprite.oam.matrixNum = ST_OAM_HFLIP;
    a = 16;
  } else {
    a = -16;
  }
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2) + a;
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET) + 8;
  sprite.data[0] = 8;
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimSlowFlyingMusicNotes(sprite: Sprite): void {
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  sprite.y += 8;
  StartSpriteAnim(sprite, gBattleAnimArgs[1]!);
  const index = IndexOfSpritePaletteTag(sParticlesColorBlendTable()[gBattleAnimArgs[2]!]![0]!) & 0xff;
  if (index !== 0xff) sprite.oam.paletteNum = index;

  const xDiff = gBattleAnimArgs[0] === 0 ? -32 : 32;
  sprite.data[0] = 40;
  sprite.data[1] = sprite.x;
  sprite.data[2] = xDiff + sprite.data[1]!;
  sprite.data[3] = sprite.y;
  sprite.data[4] = sprite.data[3]! - 40;
  InitAnimLinearTranslation(sprite);
  sprite.data[5] = gBattleAnimArgs[3]!;
  sprite.callback = AnimSlowFlyingMusicNotes_Step;
}

function AnimSlowFlyingMusicNotes_Step(sprite: Sprite): void {
  if (!AnimTranslateLinear(sprite)) {
    let xDiff = Sin(sprite.data[5]!, 8);
    if (sprite.x2 < 0) xDiff = -xDiff;
    sprite.x2 += xDiff;
    sprite.y2 += Sin(sprite.data[5]!, 4);
    sprite.data[5] = (sprite.data[5]! + 8) & 0xff;
  } else {
    DestroyAnimSprite(sprite);
  }
}

export function SetSpriteNextToMonHead(battler: number, sprite: Sprite): void {
  if (GetBattlerSide(battler) === C.B_SIDE_PLAYER) sprite.x = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_RIGHT) + 8;
  else sprite.x = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_LEFT) - 8;
  sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET) - Math.trunc(s16(GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_HEIGHT)) / 4);
}

function AnimThoughtBubble(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  SetSpriteNextToMonHead(battler, sprite);
  const animNum = GetBattlerSide(battler) === C.B_SIDE_PLAYER ? 0 : 1;
  sprite.data[0] = gBattleAnimArgs[1]!;
  sprite.data[1] = animNum + 2;
  StartSpriteAnim(sprite, animNum);
  StoreSpriteCallbackInData6(sprite, AnimThoughtBubble_Step);
  sprite.callback = RunStoredCallbackWhenAnimEnds;
}

function AnimThoughtBubble_Step(sprite: Sprite): void {
  if (--sprite.data[0]! === 0) {
    StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
    StartSpriteAnim(sprite, sprite.data[1]!);
    sprite.callback = RunStoredCallbackWhenAnimEnds;
  }
}

function AnimMetronomeFinger(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  SetSpriteNextToMonHead(battler, sprite);
  sprite.data[0] = 0;
  StoreSpriteCallbackInData6(sprite, AnimMetronomeFinger_Step);
  sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
}

function AnimMetronomeFinger_Step(sprite: Sprite): void {
  if (++sprite.data[0]! > 16) {
    StartSpriteAffineAnim(sprite, 1);
    StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
    sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
  }
}

function AnimFollowMeFinger(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X);
  sprite.y = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_TOP);
  if (sprite.y <= 9) sprite.y = 10;
  sprite.data[0] = 1;
  sprite.data[1] = 0;
  sprite.data[2] = sprite.subpriority;
  sprite.data[3] = sprite.subpriority + 4;
  sprite.data[4] = 0;
  StoreSpriteCallbackInData6(sprite, AnimFollowMeFinger_Step1);
  sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
}

function AnimFollowMeFinger_Step1(sprite: Sprite): void {
  if (++sprite.data[4]! > 12) sprite.callback = AnimFollowMeFinger_Step2;
}

function AnimFollowMeFinger_Step2(sprite: Sprite): void {
  sprite.data[1]! += 4;
  if (sprite.data[1]! > 254) {
    if (--sprite.data[0]! === 0) {
      sprite.x2 = 0;
      sprite.callback = AnimMetronomeFinger_Step;
      return;
    } else {
      sprite.data[1]! &= 0xff;
    }
  }
  if (sprite.data[1]! > 0x4f) sprite.subpriority = sprite.data[3]! & 0xff;
  if (sprite.data[1]! > 0x9f) sprite.subpriority = sprite.data[2]! & 0xff;
  const x1 = gSineTable[sprite.data[1]!]!;
  const x2 = x1 >> 3;
  sprite.x2 = (x1 >> 3) + (x2 >> 1);
}

function AnimTauntFinger(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === 0 ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  SetSpriteNextToMonHead(battler, sprite);
  if (GetBattlerSide(battler) === C.B_SIDE_PLAYER) {
    StartSpriteAnim(sprite, 0);
    sprite.data[0] = 2;
  } else {
    StartSpriteAnim(sprite, 1);
    sprite.data[0] = 3;
  }
  sprite.callback = AnimTauntFinger_Step1;
}

function AnimTauntFinger_Step1(sprite: Sprite): void {
  if (++sprite.data[1]! > 10) {
    sprite.data[1] = 0;
    StartSpriteAnim(sprite, sprite.data[0]!);
    StoreSpriteCallbackInData6(sprite, AnimTauntFinger_Step2);
    sprite.callback = RunStoredCallbackWhenAnimEnds;
  }
}

function AnimTauntFinger_Step2(sprite: Sprite): void {
  if (++sprite.data[1]! > 5) DestroyAnimSprite(sprite);
}

registerAnimSpriteCallbacks({
  AnimAbsorptionOrb, AnimAirCutterSlice, AnimBellyDrumHand, AnimBowMon, AnimBubbleBurst, AnimCirclingMusicNote,
  AnimConstrictBinding, AnimConversion, AnimConversion2, AnimCuttingSlice, AnimEndureEnergy,
  AnimFalseSwipePositionedSlice, AnimFalseSwipeSlice, AnimFlickeringPunch, AnimFlyingMusicNotes, AnimFlyingParticle,
  AnimFollowMeFinger, AnimFrenzyPlantRoot, AnimGrantingStars, AnimHornHit, AnimHyperBeamOrb, AnimIngrainOrb,
  AnimIngrainRoot, AnimItemSteal, AnimKnockOffItem, AnimLeechSeed, AnimLockOnMoveTarget, AnimLockOnTarget,
  AnimMetronomeFinger, AnimMilkBottle, AnimMimicOrb, AnimMoon, AnimMoonlightSparkle, AnimMovePowderParticle,
  AnimMoveTwisterParticle, AnimNeedleArmSpike, AnimPetalDanceBigFlower, AnimPetalDanceSmallFlower,
  AnimPowerAbsorptionOrb, AnimPresent, AnimPresentHealParticle, AnimProtect, AnimRazorLeafParticle, AnimSharpenSphere,
  AnimSlashSlice, AnimSleepLetterZ, AnimSlidingHit, AnimSlowFlyingMusicNotes, AnimSolarBeamBigOrb,
  AnimSolarBeamSmallOrb, AnimSparklingStars, AnimSporeParticle, AnimSuperFang, AnimTauntFinger, AnimThoughtBubble,
  AnimTipMon, AnimTranslateLinearSingleSineWave, AnimTrickBag, AnimWavyMusicNotes, AnimWhipHit, UnusedFlickerAnim,
});
registerAnimTasks({
  AnimTask_Conversion2AlphaBlend, AnimTask_ConversionAlphaBlend, AnimTask_CreateSmallSolarBeamOrbs,
  AnimTask_CycleMagicalLeafPal, AnimTask_DoubleTeam, AnimTask_LeafBlade, AnimTask_MoonlightEndFade,
  AnimTask_MusicNotesClearRainbowBlend, AnimTask_MusicNotesRainbowBlend, AnimTask_ShrinkTargetCopy,
  AnimTask_SkullBashPosition, AnimTask_SporeDoubleBattle, AnimTask_HideBattlersHealthbox, AnimTask_ShowBattlersHealthbox,
});
