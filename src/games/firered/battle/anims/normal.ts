// battle_anim_normal.c: generic palette blends, hit splats, screen/terrain
// shakes and the color-cycle tasks shared by many move animations.
// AnimShakeMonOrBattleTerrain stores a pointer to a u16 global in data[6..7];
// here data[6] indexes a table of accessors for those globals instead.

import { gSprites, spriteState, StartSpriteAffineAnim, IndexOfSpritePaletteTag, type Sprite } from "../../hw/sprite";
import { Cos, Sin } from "../../hw/trig";
import { BeginNormalPaletteFade, BlendPalettes, gPaletteFade, InvertPlttBuffer, RGB, TintPlttBuffer, UnfadePlttBuffer } from "../../hw/palette";
import { random } from "../../random";
import {
  ANIM_ATTACKER, animState, DestroyAnimSprite, DestroyAnimVisualTask, DestroySpriteAndMatrix, GetAnimBattlerSpriteId,
  GetBattlePalettesMask, InitSpritePosToAnimAttacker, InitSpritePosToAnimTarget, RunStoredCallbackWhenAffineAnimEnds,
  StoreSpriteCallbackInData6, TranslateSpriteInGrowingCircle, WaitAnimForDuration,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { G, gBattlerSpriteIds, gHealthboxSpriteIds } from "../globals";
import { GetBattlerSide } from "../util";
import * as C from "../../generated/constants";
import { gBattleAnimArgs, gTasks, IsContest } from "./common";
import { DestroyAnimSpriteAfterTimer } from "./flying";

// Unused
// Moves a spinning duck around the mon's head.
// arg 0: initial x pixel offset
// arg 1: initial y pixel offset
// arg 2: initial wave offset
// arg 3: wave period (higher means faster wave)
// arg 4: duration
function AnimConfusionDuck(sprite: Sprite): void {
  sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[2];
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.data[1] = -gBattleAnimArgs[3];
    sprite.data[4] = 1;
  } else {
    sprite.data[1] = gBattleAnimArgs[3];
    sprite.data[4] = 0;
  }
  sprite.data[3] = gBattleAnimArgs[4];
  sprite.callback = AnimConfusionDuck_Step;
  sprite.callback(sprite);
}

function AnimConfusionDuck_Step(sprite: Sprite): void {
  sprite.x2 = Cos(sprite.data[0], 30);
  sprite.y2 = Sin(sprite.data[0], 10);
  if ((sprite.data[0] & 0xffff) < 128) sprite.oam.priority = 1;
  else sprite.oam.priority = 3;
  sprite.data[0] = (sprite.data[0] + sprite.data[1]) & 0xff;
  if (++sprite.data[2] === sprite.data[3]) DestroyAnimSprite(sprite);
}

// Performs a simple color blend on a specified sprite.
// arg 0: palette selector
// arg 1: delay
// arg 2: start blend amount
// arg 3: end blend amount
// arg 4: blend color
function AnimSimplePaletteBlend(sprite: Sprite): void {
  const selectedPalettes = UnpackSelectedBattlePalettes(gBattleAnimArgs[0]);
  BeginNormalPaletteFade(selectedPalettes, gBattleAnimArgs[1], gBattleAnimArgs[2], gBattleAnimArgs[3], gBattleAnimArgs[4] & 0xffff);
  sprite.invisible = true;
  sprite.callback = AnimSimplePaletteBlend_Step;
}

// Unpacks a bitfield and returns a bitmask of its selected palettes.
// Bits 0-6 of the selector parameter result in the following palettes being selected:
//   0: F_PAL_BG, battle background palettes (BG palettes 1, 2, and 3)
//   1: F_PAL_ATTACKER, gBattleAnimAttacker OBJ palette
//   2: F_PAL_TARGET, gBattleAnimTarget OBJ palette
//   3: F_PAL_ATK_PARTNER, gBattleAnimAttacker partner OBJ palette
//   4: F_PAL_DEF_PARTNER, gBattleAnimTarget partner OBJ palette
//   5: F_PAL_ANIM_1, BG palette 8
//   6: F_PAL_ANIM_2, BG palette 9
export function UnpackSelectedBattlePalettes(selector: number): number {
  const battleBackground = (selector & 1) !== 0;
  const attacker = ((selector >> 1) & 1) !== 0;
  const target = ((selector >> 2) & 1) !== 0;
  const attackerPartner = ((selector >> 3) & 1) !== 0;
  const targetPartner = ((selector >> 4) & 1) !== 0;
  const anim1 = ((selector >> 5) & 1) !== 0;
  const anim2 = ((selector >> 6) & 1) !== 0;
  return GetBattlePalettesMask(battleBackground, attacker, target, attackerPartner, targetPartner, anim1, anim2);
}

function AnimSimplePaletteBlend_Step(sprite: Sprite): void {
  if (!gPaletteFade.active) DestroySpriteAndMatrix(sprite);
}

function AnimComplexPaletteBlend(sprite: Sprite): void {
  sprite.data[0] = gBattleAnimArgs[1];
  sprite.data[1] = gBattleAnimArgs[1];
  sprite.data[2] = gBattleAnimArgs[2];
  sprite.data[3] = gBattleAnimArgs[3];
  sprite.data[4] = gBattleAnimArgs[4];
  sprite.data[5] = gBattleAnimArgs[5];
  sprite.data[6] = gBattleAnimArgs[6];
  sprite.data[7] = gBattleAnimArgs[0];
  const selectedPalettes = UnpackSelectedBattlePalettes(sprite.data[7]);
  BlendPalettes(selectedPalettes, gBattleAnimArgs[4], gBattleAnimArgs[3] & 0xffff);
  sprite.invisible = true;
  sprite.callback = AnimComplexPaletteBlend_Step1;
}

function AnimComplexPaletteBlend_Step1(sprite: Sprite): void {
  if (sprite.data[0] > 0) {
    --sprite.data[0];
    return;
  }
  if (gPaletteFade.active) return;
  if (sprite.data[2] === 0) {
    sprite.callback = AnimComplexPaletteBlend_Step2;
    return;
  }
  const selectedPalettes = UnpackSelectedBattlePalettes(sprite.data[7]);
  if (sprite.data[1] & 0x100) BlendPalettes(selectedPalettes, sprite.data[4], sprite.data[3] & 0xffff);
  else BlendPalettes(selectedPalettes, sprite.data[6], sprite.data[5] & 0xffff);
  sprite.data[1] ^= 0x100;
  sprite.data[0] = sprite.data[1] & 0xff;
  --sprite.data[2];
}

function AnimComplexPaletteBlend_Step2(sprite: Sprite): void {
  if (!gPaletteFade.active) {
    const selectedPalettes = UnpackSelectedBattlePalettes(sprite.data[7]);
    BlendPalettes(selectedPalettes, 0, 0);
    DestroyAnimSprite(sprite);
  }
}

function AnimCirclingSparkle(sprite: Sprite): void {
  sprite.x += gBattleAnimArgs[0];
  sprite.y += gBattleAnimArgs[1];
  sprite.data[0] = 0;
  sprite.data[1] = 10;
  sprite.data[2] = 8;
  sprite.data[3] = 40;
  sprite.data[4] = 112;
  sprite.data[5] = 0;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = TranslateSpriteInGrowingCircle;
  sprite.callback(sprite);
}

// Task data for AnimTask_BlendColorCycle, AnimTask_BlendColorCycleExclude, and AnimTask_BlendColorCycleByTag
const tPalSelector = 0; // AnimTask_BlendColorCycle
const tPalTag = 0; // AnimTask_BlendColorCycleByTag
const tDelay = 1;
const tNumBlends = 2;
const tInitialBlendY = 3;
const tTargetBlendY = 4;
const tBlendColor = 5;
const tRestoreBlend = 8;
const tPalSelectorHi = 9;
const tPalSelectorLo = 10;

// Blends mon/screen to designated color or back alternately tNumBlends times
// Many uses of this task only set a tNumBlends of 2, which has the effect of blending to a color and back once
export function AnimTask_BlendColorCycle(taskId: number): void {
  const d = gTasks[taskId].data;
  d[tPalSelector] = gBattleAnimArgs[0];
  d[tDelay] = gBattleAnimArgs[1];
  d[tNumBlends] = gBattleAnimArgs[2];
  d[tInitialBlendY] = gBattleAnimArgs[3];
  d[tTargetBlendY] = gBattleAnimArgs[4];
  d[tBlendColor] = gBattleAnimArgs[5];
  d[tRestoreBlend] = 0;
  gTasks[taskId].func = AnimTask_BlendColorCycleLoop;
}

function BlendColorCycle(taskId: number, startBlendAmount: number, targetBlendAmount: number): void {
  const d = gTasks[taskId].data;
  const selectedPalettes = UnpackSelectedBattlePalettes(d[tPalSelector]);
  BeginNormalPaletteFade(selectedPalettes, d[tDelay], startBlendAmount, targetBlendAmount, d[tBlendColor] & 0xffff);
  d[tNumBlends]--;
  d[tRestoreBlend] ^= 1;
}

/** Shared loop body of the three color-cycle tasks (same code thrice in the C). */
function colorCycleLoop(taskId: number, blend: (taskId: number, start: number, target: number) => void): void {
  const d = gTasks[taskId].data;
  if (!gPaletteFade.active) {
    if (d[tNumBlends] > 0) {
      let startBlendAmount: number;
      let targetBlendAmount: number;
      if (!d[tRestoreBlend]) {
        // Blend to designated color
        startBlendAmount = d[tInitialBlendY] & 0xff;
        targetBlendAmount = d[tTargetBlendY] & 0xff;
      } else {
        // Blend back to original color
        startBlendAmount = d[tTargetBlendY] & 0xff;
        targetBlendAmount = d[tInitialBlendY] & 0xff;
      }
      if (d[tNumBlends] === 1) targetBlendAmount = 0;
      blend(taskId, startBlendAmount, targetBlendAmount);
    } else {
      DestroyAnimVisualTask(taskId);
    }
  }
}

function AnimTask_BlendColorCycleLoop(taskId: number): void {
  colorCycleLoop(taskId, BlendColorCycle);
}

// See AnimTask_BlendColorCycle. Same, but excludes Attacker and Target
export function AnimTask_BlendColorCycleExclude(taskId: number): void {
  const d = gTasks[taskId].data;
  let selectedPalettes = 0;
  d[0] = gBattleAnimArgs[0];
  d[tDelay] = gBattleAnimArgs[1];
  d[tNumBlends] = gBattleAnimArgs[2];
  d[tInitialBlendY] = gBattleAnimArgs[3];
  d[tTargetBlendY] = gBattleAnimArgs[4];
  d[tBlendColor] = gBattleAnimArgs[5];
  d[tRestoreBlend] = 0;
  for (let battler = 0; battler < G.gBattlersCount; battler++) {
    if (battler !== animState.gBattleAnimAttacker && battler !== animState.gBattleAnimTarget) selectedPalettes |= 1 << (battler + 16);
  }
  if (gBattleAnimArgs[0] === 1) selectedPalettes |= 0xe;
  d[tPalSelectorHi] = (selectedPalettes >>> 16) << 16 >> 16;
  d[tPalSelectorLo] = selectedPalettes & 0xff;
  gTasks[taskId].func = AnimTask_BlendColorCycleExcludeLoop;
}

function BlendColorCycleExclude(taskId: number, startBlendAmount: number, targetBlendAmount: number): void {
  const d = gTasks[taskId].data;
  const selectedPalettes = (((d[tPalSelectorHi] & 0xffff) << 16) | (d[tPalSelectorLo] & 0xffff)) >>> 0;
  BeginNormalPaletteFade(selectedPalettes, d[tDelay], startBlendAmount, targetBlendAmount, d[tBlendColor] & 0xffff);
  d[tNumBlends]--;
  d[tRestoreBlend] ^= 1;
}

function AnimTask_BlendColorCycleExcludeLoop(taskId: number): void {
  colorCycleLoop(taskId, BlendColorCycleExclude);
}

// See AnimTask_BlendColorCycle. Same, but selects palette by ANIM_TAG_*
export function AnimTask_BlendColorCycleByTag(taskId: number): void {
  const d = gTasks[taskId].data;
  d[tPalTag] = gBattleAnimArgs[0];
  d[tDelay] = gBattleAnimArgs[1];
  d[tNumBlends] = gBattleAnimArgs[2];
  d[tInitialBlendY] = gBattleAnimArgs[3];
  d[tTargetBlendY] = gBattleAnimArgs[4];
  d[tBlendColor] = gBattleAnimArgs[5];
  d[tRestoreBlend] = 0;
  gTasks[taskId].func = AnimTask_BlendColorCycleByTagLoop;
}

function BlendColorCycleByTag(taskId: number, startBlendAmount: number, targetBlendAmount: number): void {
  const d = gTasks[taskId].data;
  const paletteIndex = IndexOfSpritePaletteTag(d[tPalTag] & 0xffff);
  BeginNormalPaletteFade((1 << (paletteIndex + 16)) >>> 0, d[tDelay], startBlendAmount, targetBlendAmount, d[tBlendColor] & 0xffff);
  d[tNumBlends]--;
  d[tRestoreBlend] ^= 1;
}

function AnimTask_BlendColorCycleByTagLoop(taskId: number): void {
  colorCycleLoop(taskId, BlendColorCycleByTag);
}

// Flashes the specified anim tag with given color. Used e.g. to flash the particles red in Hyper Beam
export function AnimTask_FlashAnimTagWithColor(taskId: number): void {
  const d = gTasks[taskId].data;
  d[0] = gBattleAnimArgs[1];
  d[1] = gBattleAnimArgs[1];
  d[2] = gBattleAnimArgs[2];
  d[3] = gBattleAnimArgs[3];
  d[4] = gBattleAnimArgs[4];
  d[5] = gBattleAnimArgs[5];
  d[6] = gBattleAnimArgs[6];
  d[7] = gBattleAnimArgs[0];
  const paletteIndex = IndexOfSpritePaletteTag(gBattleAnimArgs[0] & 0xffff);
  BeginNormalPaletteFade((1 << (paletteIndex + 16)) >>> 0, 0, gBattleAnimArgs[4], gBattleAnimArgs[4], gBattleAnimArgs[3] & 0xffff);
  gTasks[taskId].func = AnimTask_FlashAnimTagWithColor_Step1;
}

function AnimTask_FlashAnimTagWithColor_Step1(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[0] > 0) {
    --d[0];
    return;
  }
  if (gPaletteFade.active) return;
  if (d[2] === 0) {
    gTasks[taskId].func = AnimTask_FlashAnimTagWithColor_Step2;
    return;
  }
  const selectedPalettes = (1 << (IndexOfSpritePaletteTag(d[7] & 0xffff) + 16)) >>> 0;
  if (d[1] & 0x100) BeginNormalPaletteFade(selectedPalettes, 0, d[4], d[4], d[3] & 0xffff);
  else BeginNormalPaletteFade(selectedPalettes, 0, d[6], d[6], d[5] & 0xffff);
  d[1] ^= 0x100;
  d[0] = d[1] & 0xff;
  --d[2];
}

function AnimTask_FlashAnimTagWithColor_Step2(taskId: number): void {
  const d = gTasks[taskId].data;
  if (!gPaletteFade.active) {
    const selectedPalettes = (1 << (IndexOfSpritePaletteTag(d[7] & 0xffff) + 16)) >>> 0;
    BeginNormalPaletteFade(selectedPalettes, 0, 0, 0, RGB(0, 0, 0));
    DestroyAnimVisualTask(taskId);
  }
}

export function AnimTask_InvertScreenColor(taskId: number): void {
  let selectedPalettes = 0;
  const attackerBattler = animState.gBattleAnimAttacker;
  const targetBattler = animState.gBattleAnimTarget;
  if (gBattleAnimArgs[0] & 0x100) selectedPalettes = GetBattlePalettesMask(true, false, false, false, false, false, false);
  if (gBattleAnimArgs[1] & 0x100) selectedPalettes |= 0x10000 << attackerBattler;
  if (gBattleAnimArgs[2] & 0x100) selectedPalettes |= 0x10000 << targetBattler;
  InvertPlttBuffer(selectedPalettes >>> 0);
  DestroyAnimVisualTask(taskId);
}

// Unused
export function AnimTask_TintPalettes(taskId: number): void {
  const d = gTasks[taskId].data;
  let selectedPalettes = 0;
  if (d[0] === 0) {
    d[2] = gBattleAnimArgs[0];
    d[3] = gBattleAnimArgs[1];
    d[4] = gBattleAnimArgs[2];
    d[1] = gBattleAnimArgs[3];
    d[5] = gBattleAnimArgs[4];
    d[6] = gBattleAnimArgs[5];
    d[7] = gBattleAnimArgs[6];
  }
  ++d[0];
  const attackerBattler = animState.gBattleAnimAttacker;
  const targetBattler = animState.gBattleAnimTarget;
  if (d[2] & 0x100) selectedPalettes = 0x0000ffff;
  if (d[2] & 0x1) {
    const paletteIndex = IndexOfSpritePaletteTag(gSprites[gHealthboxSpriteIds[attackerBattler]].template.paletteTag);
    selectedPalettes |= (1 << paletteIndex) << 16;
  }
  if (d[3] & 0x100) selectedPalettes |= (1 << attackerBattler) << 16;
  if (d[4] & 0x100) selectedPalettes |= (1 << targetBattler) << 16;
  TintPlttBuffer(selectedPalettes >>> 0, d[5], d[6], d[7]);
  if (d[0] === d[1]) {
    UnfadePlttBuffer(selectedPalettes >>> 0);
    DestroyAnimVisualTask(taskId);
  }
}

// Stand-ins for the u16 globals whose address AnimShakeMonOrBattleTerrain keeps in data[6..7].
const sShakeTargets: Array<{ get: () => number; set: (v: number) => void }> = [
  { get: () => G.gBattle_BG3_X, set: (v) => { G.gBattle_BG3_X = v & 0xffff; } },
  { get: () => G.gBattle_BG3_Y, set: (v) => { G.gBattle_BG3_Y = v & 0xffff; } },
  { get: () => spriteState.gSpriteCoordOffsetX & 0xffff, set: (v) => { spriteState.gSpriteCoordOffsetX = (v << 16) >> 16; } },
  { get: () => spriteState.gSpriteCoordOffsetY & 0xffff, set: (v) => { spriteState.gSpriteCoordOffsetY = (v << 16) >> 16; } },
];

function AnimShakeMonOrBattleTerrain(sprite: Sprite): void {
  sprite.invisible = true;
  sprite.data[0] = -gBattleAnimArgs[0];
  sprite.data[1] = gBattleAnimArgs[1];
  sprite.data[2] = gBattleAnimArgs[1];
  sprite.data[3] = gBattleAnimArgs[2];
  switch (gBattleAnimArgs[3]) {
    case 0: sprite.data[6] = 0; break; // &gBattle_BG3_X
    case 1: sprite.data[6] = 1; break; // &gBattle_BG3_Y
    case 2: sprite.data[6] = 2; break; // &gSpriteCoordOffsetX
    default: sprite.data[6] = 3; break; // &gSpriteCoordOffsetY
  }
  sprite.data[7] = 0;
  sprite.data[4] = sShakeTargets[sprite.data[6]].get();
  sprite.data[5] = gBattleAnimArgs[3];
  const var0 = (sprite.data[5] - 2) & 0xffff;
  if (var0 < 2) AnimShakeMonOrBattleTerrain_UpdateCoordOffsetEnabled();
  sprite.callback = AnimShakeMonOrBattleTerrain_Step;
}

function AnimShakeMonOrBattleTerrain_Step(sprite: Sprite): void {
  const target = sShakeTargets[sprite.data[6]];
  if (sprite.data[3] > 0) {
    --sprite.data[3];
    if (sprite.data[1] > 0) {
      --sprite.data[1];
    } else {
      sprite.data[1] = sprite.data[2];
      target.set(target.get() + sprite.data[0]);
      sprite.data[0] = -sprite.data[0];
    }
  } else {
    target.set(sprite.data[4]);
    const var0 = (sprite.data[5] - 2) & 0xffff;
    if (var0 < 2) for (let i = 0; i < G.gBattlersCount; ++i) gSprites[gBattlerSpriteIds[i]].coordOffsetEnabled = false;
    DestroyAnimSprite(sprite);
  }
}

function AnimShakeMonOrBattleTerrain_UpdateCoordOffsetEnabled(): void {
  const { gBattleAnimAttacker, gBattleAnimTarget } = animState;
  gSprites[gBattlerSpriteIds[gBattleAnimAttacker]].coordOffsetEnabled = false;
  gSprites[gBattlerSpriteIds[gBattleAnimTarget]].coordOffsetEnabled = false;
  if (gBattleAnimArgs[4] === 2) {
    gSprites[gBattlerSpriteIds[gBattleAnimAttacker]].coordOffsetEnabled = true;
    gSprites[gBattlerSpriteIds[gBattleAnimTarget]].coordOffsetEnabled = true;
  } else if (gBattleAnimArgs[4] === 0) {
    gSprites[gBattlerSpriteIds[gBattleAnimAttacker]].coordOffsetEnabled = true;
  } else {
    gSprites[gBattlerSpriteIds[gBattleAnimTarget]].coordOffsetEnabled = true;
  }
}

// Task data for AnimTask_ShakeBattleTerrain
const tXOffset = 0;
const tYOffset = 1;
const tNumShakes = 2;
const tTimer = 3;
const tShakeDelay = 8;

// Can shake battle terrain back and forth on the X or down and back to original pos on Y (cant shake up from orig pos)
// arg0: x offset of shake
// arg1: y offset of shake
// arg2: number of shakes
// arg3: time between shakes
export function AnimTask_ShakeBattleTerrain(taskId: number): void {
  const d = gTasks[taskId].data;
  d[tXOffset] = gBattleAnimArgs[0];
  d[tYOffset] = gBattleAnimArgs[1];
  d[tNumShakes] = gBattleAnimArgs[2];
  d[tTimer] = gBattleAnimArgs[3];
  d[tShakeDelay] = gBattleAnimArgs[3];
  G.gBattle_BG3_X = gBattleAnimArgs[0];
  G.gBattle_BG3_Y = gBattleAnimArgs[1];
  gTasks[taskId].func = AnimTask_ShakeBattleTerrain_Step;
  gTasks[taskId].func(taskId);
}

function AnimTask_ShakeBattleTerrain_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[tTimer] === 0) {
    if (G.gBattle_BG3_X === d[tXOffset]) G.gBattle_BG3_X = -d[tXOffset];
    else G.gBattle_BG3_X = d[tXOffset];
    if (G.gBattle_BG3_Y === -d[tYOffset]) G.gBattle_BG3_Y = 0;
    else G.gBattle_BG3_Y = -d[tYOffset];
    d[tTimer] = d[tShakeDelay];
    if (--d[tNumShakes] === 0) {
      G.gBattle_BG3_X = 0;
      G.gBattle_BG3_Y = 0;
      DestroyAnimVisualTask(taskId);
    }
  } else {
    d[tTimer]--;
  }
}

function AnimHitSplatBasic(sprite: Sprite): void {
  StartSpriteAffineAnim(sprite, gBattleAnimArgs[3]);
  if (gBattleAnimArgs[2] === 0) InitSpritePosToAnimAttacker(sprite, true);
  else InitSpritePosToAnimTarget(sprite, true);
  sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Same as basic hit splat but takes a length of time to persist for (arg4)
function AnimHitSplatPersistent(sprite: Sprite): void {
  StartSpriteAffineAnim(sprite, gBattleAnimArgs[3]);
  if (gBattleAnimArgs[2] === 0) InitSpritePosToAnimAttacker(sprite, true);
  else InitSpritePosToAnimTarget(sprite, true);
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSpriteAfterTimer);
}

// For paired hit splats whose position is inverted when used by the opponent on the player.
// Used by Twineedle and Spike Cannon
function AnimHitSplatHandleInvert(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER && !IsContest()) gBattleAnimArgs[1] = -gBattleAnimArgs[1];
  AnimHitSplatBasic(sprite);
}

function AnimHitSplatRandom(sprite: Sprite): void {
  if (gBattleAnimArgs[1] === -1) gBattleAnimArgs[1] = random() & 3;
  StartSpriteAffineAnim(sprite, gBattleAnimArgs[1]);
  if (gBattleAnimArgs[0] === ANIM_ATTACKER) InitSpritePosToAnimAttacker(sprite, false);
  else InitSpritePosToAnimTarget(sprite, false);
  sprite.x2 += (random() % 48) - 24;
  sprite.y2 += (random() % 24) - 12;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
}

function AnimHitSplatOnMonEdge(sprite: Sprite): void {
  sprite.data[0] = GetAnimBattlerSpriteId(gBattleAnimArgs[0]);
  sprite.x = gSprites[sprite.data[0]].x + gSprites[sprite.data[0]].x2;
  sprite.y = gSprites[sprite.data[0]].y + gSprites[sprite.data[0]].y2;
  sprite.x2 = gBattleAnimArgs[1];
  sprite.y2 = gBattleAnimArgs[2];
  StartSpriteAffineAnim(sprite, gBattleAnimArgs[3]);
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
  sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
}

function AnimCrossImpact(sprite: Sprite): void {
  if (gBattleAnimArgs[2] === ANIM_ATTACKER) InitSpritePosToAnimAttacker(sprite, true);
  else InitSpritePosToAnimTarget(sprite, true);
  sprite.data[0] = gBattleAnimArgs[3];
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = WaitAnimForDuration;
}

function AnimFlashingHitSplat(sprite: Sprite): void {
  StartSpriteAffineAnim(sprite, gBattleAnimArgs[3]);
  if (gBattleAnimArgs[2] === ANIM_ATTACKER) InitSpritePosToAnimAttacker(sprite, true);
  else InitSpritePosToAnimTarget(sprite, true);
  sprite.callback = AnimFlashingHitSplat_Step;
}

function AnimFlashingHitSplat_Step(sprite: Sprite): void {
  sprite.invisible = !sprite.invisible;
  if (sprite.data[0]++ > 12) DestroyAnimSprite(sprite);
}

registerAnimSpriteCallbacks({
  AnimConfusionDuck, AnimSimplePaletteBlend, AnimComplexPaletteBlend, AnimCirclingSparkle, AnimShakeMonOrBattleTerrain,
  AnimHitSplatBasic, AnimHitSplatHandleInvert, AnimHitSplatRandom, AnimHitSplatOnMonEdge, AnimCrossImpact,
  AnimFlashingHitSplat, AnimHitSplatPersistent,
});

registerAnimTasks({
  AnimTask_BlendColorCycle, AnimTask_BlendColorCycleExclude, AnimTask_BlendColorCycleByTag, AnimTask_FlashAnimTagWithColor,
  AnimTask_InvertScreenColor, AnimTask_TintPalettes, AnimTask_ShakeBattleTerrain,
});
