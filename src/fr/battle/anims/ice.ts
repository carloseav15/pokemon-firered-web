// battle_anim_ice.c: Ice Punch / Ice Beam particles, Blizzard and Powder Snow
// snowballs, Icy Wind waves, Mist / Smog / Haze fog, Poison Gas clouds, Hail
// and Ice Ball. Blend/coordinate tables come from cdata/battle_anim_ice.json.

import * as C from "../../generated/constants";
import { incbin } from "../../hw/assets";
import { LoadBgTiles } from "../../hw/bg";
import { SetGpuReg } from "../../hw/gpu";
import { BG_PLTT_ID, LoadPalette, PLTT_SIZE_4BPP } from "../../hw/palette";
import { BLDALPHA_BLEND } from "../../hw/ppu";
import {
  CreateSprite, DestroySprite, FreeOamMatrix, gSprites, MAX_SPRITES, ST_OAM_AFFINE_OFF, StartSpriteAffineAnim, StartSpriteAnim,
  type Sprite,
} from "../../hw/sprite";
import { Cos, gSineTable, Sin } from "../../hw/trig";
import { cdata } from "../../hw/assets";
import { random } from "../../random";
import {
  ANIM_TARGET, animState, AnimFastTranslateLinear, AnimLoadCompressedBgTilemap, AnimTranslateLinear,
  ConvertPosDataToTranslateLinearData, DestroyAnimSprite, DestroyAnimVisualTask, DestroySpriteAndMatrix, GetAnimBattlerSpriteId,
  GetBattleAnimBg1Data, GetBattlerSpriteBGPriority, GetBattlerSpriteCoord, GetBattlerSpriteCoordAttr, InitAnimArcTranslation,
  InitAnimFastLinearTranslationWithSpeed, InitAnimFastLinearTranslationWithSpeedAndPos, InitAnimLinearTranslation,
  InitAnimLinearTranslationWithSpeed, InitBattleAnimBg, InitSpritePosToAnimAttacker, InitSpritePosToAnimTarget,
  IsBattlerSpriteVisible, RelocateBattleBgPal, RunStoredCallbackWhenAffineAnimEnds, RunStoredCallbackWhenAnimEnds,
  SetAverageBattlerPositions, StartAnimLinearTranslation, StoreSpriteCallbackInData6, TranslateAnimHorizontalArc,
  TranslateAnimSpriteToTargetMonLocation, TranslateSpriteInGrowingCircle,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { G, gBattlerPositions } from "../globals";
import { BG_ANIM_CHAR_BASE_BLOCK, BG_ANIM_PRIORITY, BG_ANIM_SCREEN_SIZE, SetAnimBgAttribute } from "../intro";
import { GetBattlerAtPosition, GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, s16 } from "./common";

const DISPLAY_WIDTH = 240;
const DISPLAY_HEIGHT = 160;
const BIT_SIDE = 1;

type HailStruct = { x: number; y: number; bPosition: number; unk3: number };

function IsDoubleBattle(): boolean {
  return (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) !== 0;
}

// Unused, contains just the top left corner of the large ice crystal
function AnimUnusedIceCrystalThrow(sprite: Sprite): void {
  sprite.oam.tileNum += 7;
  let targetX = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2));
  let targetY = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET));
  let attackerX = s16(GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2));
  let attackerY = s16(GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET));
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[1] = gBattleAnimArgs[0] + attackerX;
  sprite.data[2] = gBattleAnimArgs[2] + targetX;
  sprite.data[3] = gBattleAnimArgs[1] + attackerY;
  sprite.data[4] = gBattleAnimArgs[3] + targetY;
  ConvertPosDataToTranslateLinearData(sprite);
  for (; targetX >= -32 && targetX <= DISPLAY_WIDTH + 32 && targetY >= -32 && targetY <= DISPLAY_HEIGHT + 32;
    targetX = s16(targetX + sprite.data[1]), targetY = s16(targetY + sprite.data[2]));
  sprite.data[1] = -sprite.data[1];
  sprite.data[2] = -sprite.data[2];
  for (; attackerX >= -32 && attackerX <= DISPLAY_WIDTH + 32 && attackerY >= -32 && attackerY <= DISPLAY_HEIGHT + 32;
    attackerX = s16(attackerX + sprite.data[1]), attackerY = s16(attackerY + sprite.data[2]));
  sprite.x = attackerX;
  sprite.y = attackerY;
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[1] = attackerX;
  sprite.data[2] = targetX;
  sprite.data[3] = attackerY;
  sprite.data[4] = targetY;
  ConvertPosDataToTranslateLinearData(sprite);
  sprite.data[3] = gBattleAnimArgs[5];
  sprite.data[4] = gBattleAnimArgs[6];
  sprite.callback = AnimUnusedIceCrystalThrow_Step;
}

function AnimUnusedIceCrystalThrow_Step(sprite: Sprite): void {
  if (sprite.data[0] !== 0) {
    sprite.data[5] += sprite.data[1];
    sprite.data[6] += sprite.data[2];
    sprite.x2 = sprite.data[5];
    sprite.y2 = sprite.data[6];
    sprite.x2 += Sin(sprite.data[7], sprite.data[3]);
    sprite.y2 += Sin(sprite.data[7], sprite.data[3]);
    sprite.data[7] = (sprite.data[7] + sprite.data[4]) & 0xff;
    --sprite.data[0];
  } else {
    DestroyAnimSprite(sprite);
  }
}

// Animates the swirling ice crystals in Ice Punch.
function AnimIcePunchSwirlingParticle(sprite: Sprite): void {
  sprite.data[0] = gBattleAnimArgs[0];
  sprite.data[1] = 60;
  sprite.data[2] = 9;
  sprite.data[3] = 30;
  sprite.data[4] = -512;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = TranslateSpriteInGrowingCircle;
  sprite.callback(sprite);
}

// Animates the ice particles in Ice Beam.
function AnimIceBeamParticle(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.data[2] -= gBattleAnimArgs[2];
  else sprite.data[2] += gBattleAnimArgs[2];
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[3];
  sprite.data[0] = gBattleAnimArgs[4];
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = StartAnimLinearTranslation;
}

// Animates the ice crystals at the end of Ice Punch, Ice Beam, Tri Attack,
// Weather Ball (Hail), Blizzard, and Powder Snow.
function AnimIceEffectParticle(sprite: Sprite): void {
  if (gBattleAnimArgs[2] === 0) {
    InitSpritePosToAnimTarget(sprite, true);
  } else {
    const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, true);
    sprite.x = pos.x;
    sprite.y = pos.y;
    if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[0] = -gBattleAnimArgs[0];
    sprite.x += gBattleAnimArgs[0];
    sprite.y += gBattleAnimArgs[1];
  }
  StoreSpriteCallbackInData6(sprite, AnimFlickerIceEffectParticle);
  sprite.callback = RunStoredCallbackWhenAffineAnimEnds;
}

function AnimFlickerIceEffectParticle(sprite: Sprite): void {
  sprite.invisible = !sprite.invisible;
  if (++sprite.data[0] === 20) DestroySpriteAndMatrix(sprite);
}

function offScreen16(sprite: Sprite): boolean {
  return sprite.x + sprite.x2 > DISPLAY_WIDTH + 16 || sprite.x + sprite.x2 < -16 || sprite.y + sprite.y2 > DISPLAY_HEIGHT || sprite.y + sprite.y2 < -16;
}

// Animates the small snowballs that swirl around the target in Blizzard and Icy Wind.
function AnimSwirlingSnowball(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[1] = sprite.x;
  sprite.data[3] = sprite.y;
  if (!gBattleAnimArgs[5]) {
    sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
    sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[3];
  } else {
    const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, true);
    sprite.data[2] = pos.x;
    sprite.data[4] = pos.y;
  }
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.data[2] -= gBattleAnimArgs[2];
  else sprite.data[2] += gBattleAnimArgs[2];
  const tempDataHolder = Int16Array.from(sprite.data);
  InitAnimFastLinearTranslationWithSpeed(sprite);
  sprite.data[1] ^= 1;
  sprite.data[2] ^= 1;
  while (true) {
    sprite.data[0] = 1;
    AnimFastTranslateLinear(sprite);
    if (offScreen16(sprite)) break;
  }
  sprite.x += sprite.x2;
  sprite.y += sprite.y2;
  sprite.x2 = sprite.y2 = 0;
  sprite.data.set(tempDataHolder);
  sprite.callback = InitAnimFastLinearTranslationWithSpeedAndPos;
  StoreSpriteCallbackInData6(sprite, AnimSwirlingSnowball_Step1);
}

function AnimSwirlingSnowball_Step1(sprite: Sprite): void {
  sprite.x += sprite.x2;
  sprite.y += sprite.y2;
  sprite.y2 = 0;
  sprite.x2 = 0;
  sprite.data[0] = 128;
  const tempVar = GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER ? 20 : -20;
  sprite.data[3] = Sin(sprite.data[0], tempVar);
  sprite.data[4] = Cos(sprite.data[0], 0xf);
  sprite.data[5] = 0;
  sprite.callback = AnimSwirlingSnowball_Step2;
  sprite.callback(sprite);
}

function AnimSwirlingSnowball_Step2(sprite: Sprite): void {
  const tempVar = GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER ? 20 : -20;
  if (sprite.data[5] <= 31) {
    sprite.x2 = Sin(sprite.data[0], tempVar) - sprite.data[3];
    sprite.y2 = Cos(sprite.data[0], 15) - sprite.data[4];
    sprite.data[0] = (sprite.data[0] + 16) & 0xff;
    sprite.data[5] += 1;
  } else {
    sprite.x += sprite.x2;
    sprite.y += sprite.y2;
    sprite.x2 = sprite.y2 = 0;
    sprite.data[3] = sprite.data[4] = 0;
    sprite.callback = AnimSwirlingSnowball_End;
  }
}

function AnimSwirlingSnowball_End(sprite: Sprite): void {
  sprite.data[0] = 1;
  AnimFastTranslateLinear(sprite);
  if (((sprite.x + sprite.x2 + 16) >>> 0) > 272 || sprite.y + sprite.y2 > 256 || sprite.y + sprite.y2 < -16) DestroyAnimSprite(sprite);
}

// Moves particles towards the target mon and off the screen. Used to animate
// the large snowballs in Blizzard and the small snowballs in Powder Snow.
function AnimMoveParticleBeyondTarget(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[1] = sprite.x;
  sprite.data[3] = sprite.y;
  if (!gBattleAnimArgs[7]) {
    sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
    sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  } else {
    const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, true);
    sprite.data[2] = pos.x;
    sprite.data[4] = pos.y;
  }
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.data[2] -= gBattleAnimArgs[2];
  else sprite.data[2] += gBattleAnimArgs[2];
  sprite.data[4] += gBattleAnimArgs[3];
  InitAnimFastLinearTranslationWithSpeed(sprite);
  const tempDataHolder = Int16Array.from(sprite.data);
  sprite.data[1] ^= 1;
  sprite.data[2] ^= 1;
  while (true) {
    sprite.data[0] = 1;
    AnimFastTranslateLinear(sprite);
    if (offScreen16(sprite)) break;
  }
  sprite.x += sprite.x2;
  sprite.y += sprite.y2;
  sprite.y2 = 0;
  sprite.x2 = 0;
  sprite.data.set(tempDataHolder);
  sprite.data[5] = gBattleAnimArgs[5];
  sprite.data[6] = gBattleAnimArgs[6];
  sprite.callback = AnimWiggleParticleTowardsTarget;
}

// Moves particles in a sine wave towards the target.
function AnimWiggleParticleTowardsTarget(sprite: Sprite): void {
  AnimFastTranslateLinear(sprite);
  if (sprite.data[0] === 0) sprite.data[0] = 1;
  sprite.y2 += Sin(sprite.data[7], sprite.data[5]);
  sprite.data[7] = (sprite.data[7] + sprite.data[6]) & 0xff;
  if (sprite.data[0] === 1) {
    if (offScreen16(sprite)) DestroyAnimSprite(sprite);
  }
}

// Animates the ice pilar wave used by Icy Wind.
function AnimWaveFromCenterOfTarget(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    if (gBattleAnimArgs[2] === 0) {
      InitSpritePosToAnimTarget(sprite, false);
    } else {
      const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, false);
      sprite.x = pos.x;
      sprite.y = pos.y;
      if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[0] = -gBattleAnimArgs[0];
      sprite.x += gBattleAnimArgs[0];
      sprite.y += gBattleAnimArgs[1];
    }
    ++sprite.data[0];
  } else if (sprite.animEnded) {
    DestroyAnimSprite(sprite);
  }
}

// Animates the fog that swirls around the mon in Mist and Smog.
function InitSwirlingFogAnim(sprite: Sprite): void {
  let battler: number;
  const { gBattleAnimAttacker, gBattleAnimTarget } = animState;
  if (gBattleAnimArgs[4] === 0) {
    if (gBattleAnimArgs[5] === 0) {
      InitSpritePosToAnimAttacker(sprite, false);
    } else {
      const pos = SetAverageBattlerPositions(gBattleAnimAttacker, false);
      sprite.x = pos.x;
      sprite.y = pos.y;
      if (GetBattlerSide(gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x -= gBattleAnimArgs[0];
      else sprite.x += gBattleAnimArgs[0];
      sprite.y += gBattleAnimArgs[1];
    }
    battler = gBattleAnimAttacker;
  } else {
    if (gBattleAnimArgs[5] === 0) {
      InitSpritePosToAnimTarget(sprite, false);
    } else {
      const pos = SetAverageBattlerPositions(gBattleAnimTarget, false);
      sprite.x = pos.x;
      sprite.y = pos.y;
      if (GetBattlerSide(gBattleAnimTarget) !== C.B_SIDE_PLAYER) sprite.x -= gBattleAnimArgs[0];
      else sprite.x += gBattleAnimArgs[0];
      sprite.y += gBattleAnimArgs[1];
    }
    battler = gBattleAnimTarget;
  }
  sprite.data[7] = battler;
  sprite.data[6] = gBattleAnimArgs[5] === 0 || !IsDoubleBattle() ? 0x20 : 0x40;
  if (GetBattlerSide(gBattleAnimTarget) === C.B_SIDE_PLAYER) sprite.y += 8;
  sprite.data[0] = gBattleAnimArgs[3];
  sprite.data[1] = sprite.x;
  sprite.data[2] = sprite.x;
  sprite.data[3] = sprite.y;
  sprite.data[4] = sprite.y + gBattleAnimArgs[2];
  InitAnimLinearTranslation(sprite);
  sprite.data[5] = 64;
  sprite.callback = AnimSwirlingFogAnim;
  sprite.callback(sprite);
}

// Animates swirling fog initialized by InitSwirlingFogAnim.
function AnimSwirlingFogAnim(sprite: Sprite): void {
  if (!AnimTranslateLinear(sprite)) {
    sprite.x2 += Sin(sprite.data[5], sprite.data[6]);
    sprite.y2 += Cos(sprite.data[5], -6);
    if (((sprite.data[5] - 64) & 0xffff) <= 0x7f) sprite.oam.priority = GetBattlerSpriteBGPriority(sprite.data[7]);
    else sprite.oam.priority = GetBattlerSpriteBGPriority(sprite.data[7]) + 1;
    sprite.data[5] = (sprite.data[5] + 3) & 0xff;
  } else {
    DestroyAnimSprite(sprite);
  }
}

function loadFogBg(): void {
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG1 | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
  SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
  SetAnimBgAttribute(1, BG_ANIM_SCREEN_SIZE, 0);
  if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 1);
  G.gBattle_BG1_X = 0;
  G.gBattle_BG1_Y = 0;
  SetGpuReg(C.REG_OFFSET_BG1HOFS, G.gBattle_BG1_X);
  SetGpuReg(C.REG_OFFSET_BG1VOFS, G.gBattle_BG1_Y);
  const animBg = GetBattleAnimBg1Data();
  LoadBgTiles(animBg.bgId, incbin("gWeatherFogHorizontalTiles"), 0x800, animBg.tilesOffset);
  AnimLoadCompressedBgTilemap(animBg.bgId, incbin("gBattleAnimFogTilemap"));
  LoadPalette(incbin("gDefaultWeatherSpritePalette"), BG_PLTT_ID(animBg.paletteId), PLTT_SIZE_4BPP);
  if (IsContest()) RelocateBattleBgPal(animBg.paletteId, animBg.bgTilemap, 0, false);
}

function finishFogBg(taskId: number): void {
  if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 0);
  G.gBattle_BG1_X = 0;
  G.gBattle_BG1_Y = 0;
  SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 0));
  SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
  DestroyAnimVisualTask(taskId);
}

// Fades mons to black and places foggy overlay in Haze.
function AnimTask_HazeScrollingFog(taskId: number): void {
  loadFogBg();
  gTasks[taskId].func = AnimTask_HazeScrollingFog_Step;
}

function AnimTask_HazeScrollingFog_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  G.gBattle_BG1_X += -1;
  switch (d[12]) {
    case 0:
      if (++d[10] === 4) {
        d[10] = 0;
        ++d[9];
        d[11] = cdata<number[]>("battle_anim_ice", "sHazeBlendAmounts")[d[9]];
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[11], 16 - d[11]));
        if (d[11] === 9) {
          ++d[12];
          d[11] = 0;
        }
      }
      break;
    case 1:
      if (++d[11] === 0x51) {
        d[11] = 9;
        ++d[12];
      }
      break;
    case 2:
      if (++d[10] === 4) {
        d[10] = 0;
        --d[11];
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[11], 16 - d[11]));
        if (d[11] === 0) {
          ++d[12];
          d[11] = 0;
        }
      }
      break;
    case 3:
      GetBattleAnimBg1Data();
      InitBattleAnimBg(1);
      InitBattleAnimBg(2);
      ++d[12];
    // fall through
    case 4:
      finishFogBg(taskId);
      break;
  }
}

// Throws the ball in Mist Ball.
function AnimThrowMistBall(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.callback = TranslateAnimSpriteToTargetMonLocation;
}

function AnimTask_MistBallFog(taskId: number): void {
  loadFogBg();
  gTasks[taskId].data[15] = -1;
  gTasks[taskId].func = AnimTask_MistBallFog_Step;
}

function AnimTask_MistBallFog_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  G.gBattle_BG1_X += d[15];
  switch (d[12]) {
    case 0:
      d[9] += 1;
      d[11] = cdata<number[]>("battle_anim_ice", "sMistBlendAmounts")[d[9]];
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[11], 17 - d[11]));
      if (d[11] === 5) {
        ++d[12];
        d[11] = 0;
      }
      break;
    case 1:
      if (++d[11] === 0x51) {
        d[11] = 5;
        ++d[12];
      }
      break;
    case 2:
      if (++d[10] === 4) {
        d[10] = 0;
        d[11] -= 1;
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[11], 16 - d[11]));
        if (d[11] === 0) {
          ++d[12];
          d[11] = 0;
        }
      }
      break;
    case 3:
      GetBattleAnimBg1Data();
      InitBattleAnimBg(1);
      InitBattleAnimBg(2);
      ++d[12];
    // fall through
    case 4:
      finishFogBg(taskId);
      break;
  }
}

// Initializes gas clouds in the Poison Gas animation.
function InitPoisonGasCloudAnim(sprite: Sprite): void {
  const { gBattleAnimAttacker, gBattleAnimTarget } = animState;
  sprite.data[0] = gBattleAnimArgs[0];
  if (GetBattlerSpriteCoord(gBattleAnimAttacker, C.BATTLER_COORD_X_2) < GetBattlerSpriteCoord(gBattleAnimTarget, C.BATTLER_COORD_X_2))
    sprite.data[7] = 0x8000;
  if ((gBattlerPositions[gBattleAnimTarget] & BIT_SIDE) === C.B_SIDE_PLAYER) {
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
    gBattleAnimArgs[3] = -gBattleAnimArgs[3];
    if (sprite.data[7] & 0x8000 && (gBattlerPositions[gBattleAnimAttacker] & BIT_SIDE) === C.B_SIDE_PLAYER)
      sprite.subpriority = gSprites[GetAnimBattlerSpriteId(ANIM_TARGET)].subpriority + 1;
    sprite.data[6] = 1;
  }
  sprite.x = GetBattlerSpriteCoord(gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  if (gBattleAnimArgs[7]) {
    sprite.data[1] = sprite.x + gBattleAnimArgs[1];
    sprite.data[2] = GetBattlerSpriteCoord(gBattleAnimTarget, C.BATTLER_COORD_X_2) + gBattleAnimArgs[3];
    sprite.data[3] = sprite.y + gBattleAnimArgs[2];
    sprite.data[4] = GetBattlerSpriteCoord(gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[4];
  } else {
    sprite.data[1] = sprite.x + gBattleAnimArgs[1];
    sprite.data[2] = GetBattlerSpriteCoord(gBattleAnimTarget, C.BATTLER_COORD_X) + gBattleAnimArgs[3];
    sprite.data[3] = sprite.y + gBattleAnimArgs[2];
    sprite.data[4] = GetBattlerSpriteCoord(gBattleAnimTarget, C.BATTLER_COORD_Y) + gBattleAnimArgs[4];
  }
  sprite.data[7] |= GetBattlerSpriteBGPriority(gBattleAnimTarget) << 8;
  if (IsContest()) {
    sprite.data[6] = 1;
    sprite.subpriority = 0x80;
  }
  InitAnimLinearTranslation(sprite);
  sprite.callback = MovePoisonGasCloud;
}

function MovePoisonGasCloud(sprite: Sprite): void {
  const target = animState.gBattleAnimTarget;
  switch (sprite.data[7] & 0xff) {
    case 0: {
      AnimTranslateLinear(sprite);
      let value = gSineTable[sprite.data[5]];
      sprite.x2 += value >> 4;
      if (sprite.data[6]) sprite.data[5] = (sprite.data[5] - 8) & 0xff;
      else sprite.data[5] = (sprite.data[5] + 8) & 0xff;
      if (sprite.data[0] <= 0) {
        sprite.data[0] = 80;
        sprite.x = GetBattlerSpriteCoord(target, C.BATTLER_COORD_X);
        sprite.data[1] = sprite.x;
        sprite.data[2] = sprite.x;
        sprite.y += sprite.y2;
        sprite.data[3] = sprite.y;
        sprite.data[4] = sprite.y + 29;
        ++sprite.data[7];
        if (IsContest()) sprite.data[5] = 80;
        else if ((gBattlerPositions[target] & BIT_SIDE) !== C.B_SIDE_PLAYER) sprite.data[5] = 204;
        else sprite.data[5] = 80;
        sprite.y2 = 0;
        value = gSineTable[sprite.data[5]];
        sprite.x2 = value >> 3;
        sprite.data[5] = (sprite.data[5] + 2) & 0xff;
        InitAnimLinearTranslation(sprite);
      }
      break;
    }
    case 1: {
      AnimTranslateLinear(sprite);
      const value = gSineTable[sprite.data[5]];
      sprite.x2 += value >> 3;
      sprite.y2 += (gSineTable[sprite.data[5] + 0x40] * -3) >> 8;
      const var0 = (sprite.data[5] - 0x40) & 0xffff;
      if (!IsContest()) {
        if (var0 <= 0x7f) sprite.oam.priority = sprite.data[7] >> 8;
        else sprite.oam.priority = (sprite.data[7] >> 8) + 1;
        sprite.data[5] = (sprite.data[5] + 4) & 0xff;
      } else {
        if (var0 <= 0x7f) sprite.subpriority = 128;
        else sprite.subpriority = 140;
        sprite.data[5] = (sprite.data[5] - 4) & 0xff;
      }
      if (sprite.data[0] <= 0) {
        sprite.data[0] = 0x300;
        sprite.x += sprite.x2;
        sprite.data[1] = sprite.x;
        sprite.y += sprite.y2;
        sprite.data[3] = sprite.y;
        sprite.data[4] = sprite.y + 4;
        if (IsContest()) sprite.data[2] = -0x10;
        else if ((gBattlerPositions[target] & BIT_SIDE) !== C.B_SIDE_PLAYER) sprite.data[2] = 0x100;
        else sprite.data[2] = -0x10;
        ++sprite.data[7];
        sprite.x2 = sprite.y2 = 0;
        InitAnimLinearTranslationWithSpeed(sprite);
      }
      break;
    }
    case 2:
      if (AnimTranslateLinear(sprite)) {
        if (sprite.oam.affineMode & 1) {
          FreeOamMatrix(sprite.oam.matrixNum);
          sprite.oam.affineMode = ST_OAM_AFFINE_OFF;
        }
        DestroySprite(sprite);
        --animState.gAnimVisualTaskCount;
      }
      break;
  }
}

// Creates Hail.
function AnimTask_Hail(taskId: number): void {
  gTasks[taskId].func = AnimTask_Hail2;
}

function AnimTask_Hail2(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0:
      if (++d[4] > 2) {
        d[4] = 0;
        d[5] = 0;
        d[2] = 0;
        ++d[0];
      }
      break;
    case 1:
      if (d[5] === 0) {
        if (GenerateHailParticle(d[3], d[2], taskId, 1)) ++d[1];
        if (++d[2] === 3) {
          if (++d[3] === 10) ++d[0];
          else --d[0];
        } else {
          d[5] = 1;
        }
      } else {
        --d[5];
      }
      break;
    case 2:
      if (d[1] === 0) DestroyAnimVisualTask(taskId);
      break;
  }
}

function GenerateHailParticle(hailStructId: number, affineAnimNum: number, taskId: number, c: number): boolean {
  const hail = cdata<HailStruct[]>("battle_anim_ice", "sHailCoordData")[hailStructId];
  let battlerX: number;
  let battlerY: number;
  let possibleBool = false;
  const unk = hail.unk3;
  if (unk !== 2) {
    const id = GetBattlerAtPosition(hail.bPosition);
    if (IsBattlerSpriteVisible(id)) {
      possibleBool = true;
      battlerX = s16(GetBattlerSpriteCoord(id, C.BATTLER_COORD_X_2));
      battlerY = s16(GetBattlerSpriteCoord(id, C.BATTLER_COORD_Y_PIC_OFFSET));
      switch (unk) {
        case 0:
          battlerX -= Math.trunc(GetBattlerSpriteCoordAttr(id, C.BATTLER_COORD_ATTR_WIDTH) / 6);
          battlerY -= Math.trunc(GetBattlerSpriteCoordAttr(id, C.BATTLER_COORD_ATTR_HEIGHT) / 6);
          break;
        case 1:
          battlerX += Math.trunc(GetBattlerSpriteCoordAttr(id, C.BATTLER_COORD_ATTR_WIDTH) / 6);
          battlerY += Math.trunc(GetBattlerSpriteCoordAttr(id, C.BATTLER_COORD_ATTR_HEIGHT) / 6);
          break;
      }
    } else {
      battlerX = hail.x;
      battlerY = hail.y;
    }
  } else {
    battlerX = hail.x;
    battlerY = hail.y;
  }
  const spriteX = s16(battlerX - Math.trunc((battlerY + 8) / 2));
  const id = CreateSprite(animTemplate("sHailParticleSpriteTemplate"), spriteX, -8, 18);
  if (id === MAX_SPRITES) return false;
  StartSpriteAffineAnim(gSprites[id], affineAnimNum);
  gSprites[id].data[0] = possibleBool ? 1 : 0;
  gSprites[id].data[3] = battlerX;
  gSprites[id].data[4] = battlerY;
  gSprites[id].data[5] = affineAnimNum;
  gSprites[id].data[6] = taskId;
  gSprites[id].data[7] = c;
  return true;
}

function AnimHailBegin(sprite: Sprite): void {
  sprite.x += 4;
  sprite.y += 8;
  if (sprite.x < sprite.data[3] && sprite.y < sprite.data[4]) return;
  if (sprite.data[0] === 1 && sprite.data[5] === 0) {
    const spriteId = CreateSprite(animTemplate("gIceCrystalHitLargeSpriteTemplate"), sprite.data[3], sprite.data[4], sprite.subpriority);
    sprite.data[0] = spriteId;
    if (spriteId !== 64) {
      gSprites[sprite.data[0]].callback = AnimHailContinue;
      gSprites[sprite.data[0]].data[6] = sprite.data[6];
      gSprites[sprite.data[0]].data[7] = sprite.data[7];
    }
    FreeOamMatrix(sprite.oam.matrixNum);
    DestroySprite(sprite);
  } else {
    --gTasks[sprite.data[6]].data[sprite.data[7]];
    FreeOamMatrix(sprite.oam.matrixNum);
    DestroySprite(sprite);
  }
}

function AnimHailContinue(sprite: Sprite): void {
  if (++sprite.data[0] === 20) {
    --gTasks[sprite.data[6]].data[sprite.data[7]];
    FreeOamMatrix(sprite.oam.matrixNum);
    DestroySprite(sprite);
  }
}

// Initializes the animation for Ice Ball.
function InitIceBallAnim(sprite: Sprite): void {
  const disable = animState.gAnimDisableStructPtr!;
  let animNum = (disable.rolloutTimerStartValue - disable.rolloutTimer - 1) & 0xff;
  if (animNum > 4) animNum = 4;
  StartSpriteAffineAnim(sprite, animNum);
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = gBattleAnimArgs[4];
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[2] = -gBattleAnimArgs[2];
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + gBattleAnimArgs[2];
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[3];
  sprite.data[5] = gBattleAnimArgs[5];
  InitAnimArcTranslation(sprite);
  sprite.callback = AnimThrowIceBall;
}

// Throws the ball of ice in Ice Ball.
function AnimThrowIceBall(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) {
    StartSpriteAnim(sprite, 1);
    sprite.callback = RunStoredCallbackWhenAnimEnds;
    StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  }
}

// Initializes the particles that scatter at the end of the Ice Ball animation.
function InitIceBallParticle(sprite: Sprite): void {
  sprite.oam.tileNum += 8;
  InitSpritePosToAnimTarget(sprite, true);
  const randA = s16((random() & 0xff) + 256);
  let randB = s16(random() & 0x1ff);
  if (randB > 0xff) randB = 256 - randB;
  sprite.data[1] = randA;
  sprite.data[2] = randB;
  sprite.callback = AnimIceBallParticle;
}

// Animates the particles created by InitIceBallParticle.
function AnimIceBallParticle(sprite: Sprite): void {
  sprite.data[3] += sprite.data[1];
  sprite.data[4] += sprite.data[2];
  if (sprite.data[1] & 1) sprite.x2 = -(sprite.data[3] >> 8);
  else sprite.x2 = sprite.data[3] >> 8;
  sprite.y2 = sprite.data[4] >> 8;
  if (++sprite.data[0] === 21) DestroyAnimSprite(sprite);
}

// Counter for Ice Ball.
function AnimTask_GetRolloutCounter(taskId: number): void {
  const arg = gBattleAnimArgs[0] & 0xff;
  const disable = animState.gAnimDisableStructPtr!;
  gBattleAnimArgs[arg] = disable.rolloutTimerStartValue - disable.rolloutTimer - 1;
  DestroyAnimVisualTask(taskId);
}

registerAnimSpriteCallbacks({
  AnimUnusedIceCrystalThrow, AnimIcePunchSwirlingParticle, AnimIceBeamParticle, AnimIceEffectParticle, AnimSwirlingSnowball,
  AnimMoveParticleBeyondTarget, AnimWaveFromCenterOfTarget, InitSwirlingFogAnim, AnimThrowMistBall, InitPoisonGasCloudAnim,
  AnimHailBegin, InitIceBallAnim, InitIceBallParticle,
});

registerAnimTasks({
  AnimTask_HazeScrollingFog, AnimTask_MistBallFog, AnimTask_Hail, AnimTask_GetRolloutCounter,
});
