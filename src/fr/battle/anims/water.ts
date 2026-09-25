// battle_anim_water.c: raindrops, Bubble / Bubblebeam, Aurora Beam rings,
// sine-wave beams, Hydro Cannon, Water Gun, Surf / Muddy Water waves (BG1 +
// BLDALPHA scanline effect), Water Spout, Water Sport and Water Pulse.
// Adaptation: the contest-only Surf tilemap path is not taken (IsContest is FALSE).

import * as C from "../../generated/constants";
import { tasks, type Task } from "../../gba/tasks";
import { incbin } from "../../hw/assets";
import { SetGpuReg } from "../../hw/gpu";
import { BG_PLTT_ID, gPlttBufferFaded, LoadPalette, OBJ_PLTT_ID, PLTT_SIZE_4BPP } from "../../hw/palette";
import { BLDALPHA_BLEND, REG_OFFSET_BLDALPHA } from "../../hw/ppu";
import {
  gScanlineEffect, gScanlineEffectRegBuffers, SCANLINE_EFFECT_DMACNT_16BIT, ScanlineEffect_SetParams, ScanlineEffect_Stop,
} from "../../hw/scanline";
import {
  CreateInvisibleSprite, CreateSprite, DestroySprite, FreeOamMatrix, FreeSpriteOamMatrix, gSprites, IndexOfSpritePaletteTag,
  MAX_SPRITES, SpriteCallbackDummy, ST_OAM_OBJ_NORMAL, StartSpriteAffineAnim, StartSpriteAnim, type Sprite,
} from "../../hw/sprite";
import { Cos, gSineTable, Sin } from "../../hw/trig";
import { GetMonData, gEnemyParty, playerMon } from "../../pokemon/mon";
import { random } from "../../random";
import {
  ANIM_ATTACKER, ANIM_DEF_PARTNER, ANIM_TARGET, animState, AnimLoadCompressedBgGfx, AnimLoadCompressedBgTilemap, AnimTranslateLinear,
  BattleAnimHelper_RunSpriteSquash, BattleAnimHelper_SetSpriteSquashParams, DestroyAnimSprite, DestroyAnimVisualTask,
  DestroySpriteAndMatrix, GetAnimBattlerSpriteId, GetBattleAnimBg1Data, GetBattlerSpriteCoord, GetBattlerSpriteSubpriority,
  InitAnimArcTranslation, InitAnimLinearTranslation, InitBattleAnimBg, InitSpritePosToAnimAttacker, InitSpritePosToAnimTarget,
  PrepareBattlerSpriteForRotScale, ResetSpriteRotScale, RunStoredCallbackWhenAnimEnds, SetBattlerSpriteYOffsetFromYScale,
  StartAnimLinearTranslation, StoreSpriteCallbackInData6, TranslateAnimHorizontalArc, WaitAnimForDuration,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { G, gBattlerPartyIndexes } from "../globals";
import { BG_ANIM_CHAR_BASE_BLOCK, BG_ANIM_PRIORITY, BG_ANIM_SCREEN_SIZE, SetAnimBgAttribute } from "../intro";
import { GetBattlerPosition, GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, s16 } from "./common";
import { AnimTask_HorizontalShake } from "./ground";

const DISPLAY_WIDTH = 240;
const DISPLAY_HEIGHT = 160;
const RAND_MULT = 1103515245;
const ISO_RANDOMIZE2 = (val: number) => (Math.imul(RAND_MULT, val) + 12345) | 0;

// Used by Water Spout / Water Sport
function AnimTask_CreateRaindrops(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[0] === 0) {
    d[1] = gBattleAnimArgs[0];
    d[2] = gBattleAnimArgs[1];
    d[3] = gBattleAnimArgs[2];
  }
  d[0]++;
  if (d[0] % d[2] === 1) {
    const x = (random() % DISPLAY_WIDTH) & 0xff;
    const y = (random() % (DISPLAY_HEIGHT / 2)) & 0xff;
    CreateSprite(animTemplate("gRainDropSpriteTemplate"), x, y, 4);
  }
  if (d[0] === d[3]) DestroyAnimVisualTask(taskId);
}

function AnimRainDrop(sprite: Sprite): void {
  sprite.callback = AnimRainDrop_Step;
}

function AnimRainDrop_Step(sprite: Sprite): void {
  if (++sprite.data[0] < 14) { // Was 13 in emerald
    sprite.x2 += 1;
    sprite.y2 += 4;
  }
  if (sprite.animEnded) DestroySprite(sprite);
}

// For water bubbles that move to a dest, as in Bubble/Bubblebeam
function AnimWaterBubbleProjectile(sprite: Sprite): void {
  const attacker = animState.gBattleAnimAttacker;
  if (GetBattlerSide(attacker) !== C.B_SIDE_PLAYER) {
    sprite.x = GetBattlerSpriteCoord(attacker, C.BATTLER_COORD_X_2) - gBattleAnimArgs[0];
    sprite.y = GetBattlerSpriteCoord(attacker, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[1];
    sprite.animPaused = true;
  } else {
    sprite.x = GetBattlerSpriteCoord(attacker, C.BATTLER_COORD_X_2) + gBattleAnimArgs[0];
    sprite.y = GetBattlerSpriteCoord(attacker, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[1];
    sprite.animPaused = true;
  }
  if (GetBattlerSide(attacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[2] = -gBattleAnimArgs[2];
  sprite.data[0] = gBattleAnimArgs[6];
  sprite.data[1] = sprite.x;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  InitAnimLinearTranslation(sprite);
  const spriteId = CreateInvisibleSprite(SpriteCallbackDummy);
  sprite.data[5] = spriteId;
  sprite.x -= Sin(gBattleAnimArgs[4] & 0xff, gBattleAnimArgs[2]);
  sprite.y -= Cos(gBattleAnimArgs[4] & 0xff, gBattleAnimArgs[3]);
  gSprites[spriteId].data[0] = gBattleAnimArgs[2];
  gSprites[spriteId].data[1] = gBattleAnimArgs[3];
  gSprites[spriteId].data[2] = gBattleAnimArgs[5];
  gSprites[spriteId].data[3] = (gBattleAnimArgs[4] & 0xff) * 256;
  gSprites[spriteId].data[4] = gBattleAnimArgs[6];
  sprite.callback = AnimWaterBubbleProjectile_Step1;
  sprite.callback(sprite);
}

function AnimWaterBubbleProjectile_Step1(sprite: Sprite): void {
  const otherSpriteId = sprite.data[5] & 0xff;
  const other = gSprites[otherSpriteId];
  let timer = other.data[4] & 0xff;
  const trigIndex = other.data[3] & 0xffff;
  sprite.data[0] = 1;
  AnimTranslateLinear(sprite);
  sprite.x2 += Sin(trigIndex >> 8, other.data[0]);
  sprite.y2 += Cos(trigIndex >> 8, other.data[1]);
  other.data[3] = trigIndex + other.data[2];
  timer = (timer - 1) & 0xff;
  if (timer !== 0) {
    other.data[4] = timer;
  } else {
    sprite.callback = AnimWaterBubbleProjectile_Step2;
    DestroySprite(other);
  }
}

function AnimWaterBubbleProjectile_Step2(sprite: Sprite): void {
  sprite.animPaused = false;
  sprite.callback = RunStoredCallbackWhenAnimEnds;
  StoreSpriteCallbackInData6(sprite, AnimWaterBubbleProjectile_Step3);
}

function AnimWaterBubbleProjectile_Step3(sprite: Sprite): void {
  sprite.data[0] = 10;
  sprite.callback = WaitAnimForDuration;
  StoreSpriteCallbackInData6(sprite, DestroySpriteAndMatrix);
}

function AnimAuroraBeamRings(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  const unkArg = GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER ? -gBattleAnimArgs[2] : gBattleAnimArgs[2];
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[1] = sprite.x;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + unkArg;
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[3];
  InitAnimLinearTranslation(sprite);
  sprite.callback = AnimAuroraBeamRings_Step;
  sprite.affineAnimPaused = true;
  sprite.callback(sprite);
}

function AnimAuroraBeamRings_Step(sprite: Sprite): void {
  if ((gBattleAnimArgs[7] & 0xffff) === 0xffff) {
    StartSpriteAnim(sprite, 1);
    sprite.affineAnimPaused = false;
  }
  if (AnimTranslateLinear(sprite)) DestroyAnimSprite(sprite);
}

// Updates the palette on the rainbow rings used in Aurora Beam to make them appear to be rotating counterclockwise
function AnimTask_RotateAuroraRingColors(taskId: number): void {
  gTasks[taskId].data[0] = gBattleAnimArgs[0];
  gTasks[taskId].data[2] = OBJ_PLTT_ID(IndexOfSpritePaletteTag(C.ANIM_TAG_RAINBOW_RINGS));
  gTasks[taskId].func = AnimTask_RotateAuroraRingColors_Step;
}

function AnimTask_RotateAuroraRingColors_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  if (++d[10] === 3) {
    d[10] = 0;
    const palIndex = (d[2] + 1) & 0xffff;
    const tempPlt = gPlttBufferFaded[palIndex];
    for (let i = 1; i < 8; i++) gPlttBufferFaded[palIndex + i - 1] = gPlttBufferFaded[palIndex + i];
    gPlttBufferFaded[palIndex + 7] = tempPlt;
  }
  if (++d[11] === d[0]) DestroyAnimVisualTask(taskId);
}

// For animating undulating beam attacks (e.g. Flamethrower, Hydro Pump, Signal Beam)
function AnimToTargetInSinWave(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[0] = 30;
  sprite.data[1] = sprite.x;
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[3] = sprite.y;
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  InitAnimLinearTranslation(sprite);
  sprite.data[5] = Math.trunc(0xd200 / sprite.data[0]);
  sprite.data[7] = gBattleAnimArgs[3];
  const retArg = gBattleAnimArgs[7] & 0xffff;
  if (gBattleAnimArgs[7] > 127) {
    sprite.data[6] = (retArg - 127) * 256;
    sprite.data[7] = -sprite.data[7];
  } else {
    sprite.data[6] = retArg * 256;
  }
  sprite.callback = AnimToTargetInSinWave_Step;
  sprite.callback(sprite);
}

function AnimToTargetInSinWave_Step(sprite: Sprite): void {
  if (AnimTranslateLinear(sprite)) DestroyAnimSprite(sprite);
  sprite.y2 += Sin(sprite.data[6] >> 8, sprite.data[7]);
  if ((sprite.data[6] + sprite.data[5]) >> 8 > 127) {
    sprite.data[6] = 0;
    sprite.data[7] = -sprite.data[7];
  } else {
    sprite.data[6] += sprite.data[5];
  }
}

function AnimTask_StartSinAnimTimer(taskId: number): void {
  gTasks[taskId].data[0] = gBattleAnimArgs[0];
  gBattleAnimArgs[7] = 0;
  gTasks[taskId].func = AnimTask_RunSinAnimTimer;
}

function AnimTask_RunSinAnimTimer(taskId: number): void {
  gBattleAnimArgs[7] = (gBattleAnimArgs[7] + 3) & 0xff;
  if (--gTasks[taskId].data[0] === 0) DestroyAnimVisualTask(taskId);
}

// Flashing blue orbs grow in size near the attacker. First stage of Hydro Cannon
function AnimHydroCannonCharge(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y);
  sprite.y2 = -10;
  const priority = GetBattlerSpriteSubpriority(animState.gBattleAnimAttacker) & 0xff;
  if (!IsContest()) {
    if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
      sprite.x2 = 10;
      sprite.subpriority = (priority + 2) & 0xff;
    } else {
      sprite.x2 = -10;
      sprite.subpriority = (priority - 2) & 0xff;
    }
  } else {
    sprite.x2 = -10;
    sprite.subpriority = (priority + 2) & 0xff;
  }
  sprite.callback = AnimHydroCannonCharge_Step;
}

function AnimHydroCannonCharge_Step(sprite: Sprite): void {
  if (sprite.affineAnimEnded) DestroyAnimSprite(sprite);
}

// Flashing blue orbs move from the attacker to the target. Second stage of Hydro Cannon
function AnimHydroCannonBeam(sprite: Sprite): void {
  const attacker = animState.gBattleAnimAttacker;
  if (GetBattlerSide(attacker) === GetBattlerSide(animState.gBattleAnimTarget)) {
    gBattleAnimArgs[0] *= -1;
    if (GetBattlerPosition(attacker) === C.B_POSITION_PLAYER_LEFT || GetBattlerPosition(attacker) === C.B_POSITION_OPPONENT_LEFT) gBattleAnimArgs[0] *= -1;
  }
  const animType = (gBattleAnimArgs[5] & 0xff00) === 0;
  const coordType = (gBattleAnimArgs[5] & 0xff) === 0 ? C.BATTLER_COORD_Y_PIC_OFFSET : 1;
  InitSpritePosToAnimAttacker(sprite, animType);
  if (GetBattlerSide(attacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[2] = -gBattleAnimArgs[2];
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + gBattleAnimArgs[2];
  sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, coordType) + gBattleAnimArgs[3];
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

// Water droplet appears and drips down. Used by Water Gun on impact
function AnimWaterGunDroplet(sprite: Sprite): void {
  InitSpritePosToAnimTarget(sprite, true);
  sprite.data[0] = gBattleAnimArgs[4];
  sprite.data[2] = sprite.x + gBattleAnimArgs[2];
  sprite.data[4] = sprite.y + gBattleAnimArgs[4];
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimSmallBubblePair(sprite: Sprite): void {
  if (gBattleAnimArgs[3] !== ANIM_ATTACKER) InitSpritePosToAnimTarget(sprite, true);
  else InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[7] = gBattleAnimArgs[2];
  sprite.callback = AnimSmallBubblePair_Step;
}

function AnimSmallBubblePair_Step(sprite: Sprite): void {
  sprite.data[0] = (sprite.data[0] + 11) & 0xff;
  sprite.x2 = Sin(sprite.data[0], 4);
  sprite.data[1] += 48;
  sprite.y2 = -(sprite.data[1] >> 8);
  if (sprite.data[7]-- === 0) DestroyAnimSprite(sprite);
}

function AnimTask_CreateSurfWave(taskId: number): void {
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG1 | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
  SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
  SetAnimBgAttribute(1, BG_ANIM_SCREEN_SIZE, 1);
  const animBg = GetBattleAnimBg1Data();
  SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 1);
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_OPPONENT)
    AnimLoadCompressedBgTilemap(animBg.bgId, incbin("gBattleAnimBgTilemap_SurfOpponent"));
  else
    AnimLoadCompressedBgTilemap(animBg.bgId, incbin("gBattleAnimBgTilemap_SurfPlayer"));
  AnimLoadCompressedBgGfx(animBg.bgId, incbin("gBattleAnimBgImage_Surf"), animBg.tilesOffset);
  if (gBattleAnimArgs[0] === 0) LoadPalette(incbin("gBattleAnimBgPalette_Surf"), BG_PLTT_ID(animBg.paletteId), PLTT_SIZE_4BPP);
  else LoadPalette(incbin("gBattleAnimBgPalette_MuddyWater"), BG_PLTT_ID(animBg.paletteId), PLTT_SIZE_4BPP);
  const taskId2 = tasks.create(AnimTask_SurfWaveScanlineEffect, gTasks[taskId].priority + 1);
  const d = gTasks[taskId].data;
  const d2 = gTasks[taskId2].data;
  d[15] = taskId2;
  d2[0] = 0;
  d2[1] = 0x1000;
  d2[2] = 0x1000;
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_OPPONENT) {
    G.gBattle_BG1_X = -224;
    G.gBattle_BG1_Y = 256;
    d[0] = 2;
    d[1] = -1;
    d2[3] = 1;
  } else {
    G.gBattle_BG1_X = 0;
    G.gBattle_BG1_Y = -48;
    d[0] = -2;
    d[1] = 1;
    d2[3] = 0;
  }
  SetGpuReg(C.REG_OFFSET_BG1HOFS, G.gBattle_BG1_X);
  SetGpuReg(C.REG_OFFSET_BG1VOFS, G.gBattle_BG1_Y);
  if (d2[3] === 0) {
    d2[4] = 48;
    d2[5] = 112;
  } else {
    d2[4] = 0;
    d2[5] = 0;
  }
  d[6] = 1;
  gTasks[taskId].func = AnimTask_CreateSurfWave_Step1;
}

function AnimTask_CreateSurfWave_Step1(taskId: number): void {
  const d = gTasks[taskId].data;
  G.gBattle_BG1_X += d[0];
  G.gBattle_BG1_Y += d[1];
  const animBg = GetBattleAnimBg1Data();
  d[2] += d[1];
  if (++d[5] === 4) {
    const base = 16 * animBg.paletteId;
    const rgbBuffer = gPlttBufferFaded[base + 7];
    for (let i = 6; i !== 0; i--) gPlttBufferFaded[base + 1 + i] = gPlttBufferFaded[base + 1 + i - 1];
    gPlttBufferFaded[base + 1] = rgbBuffer;
    d[5] = 0;
  }
  const d2 = gTasks[d[15]].data;
  if (++d[6] > 1) {
    d[6] = 0;
    if (++d[3] < 14) {
      d2[1] = s16(d[3] | ((16 - d[3]) << 8));
      d[4]++;
    }
    if (d[3] > 54) {
      d[4]--;
      d2[1] = s16(d[4] | ((16 - d[4]) << 8));
    }
  }
  if (!(d2[1] & 0x1f)) {
    d[0] = d2[1] & 0x1f;
    gTasks[taskId].func = AnimTask_CreateSurfWave_Step2;
  }
}

function AnimTask_CreateSurfWave_Step2(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[0] === 0) {
    InitBattleAnimBg(1);
    InitBattleAnimBg(2);
    d[0]++;
  } else {
    if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 0);
    G.gBattle_BG1_X = 0;
    G.gBattle_BG1_Y = 0;
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 0));
    gTasks[d[15]].data[15] = -1;
    DestroyAnimVisualTask(taskId);
  }
}

function fillSurfScanlines(buf: Uint16Array, d: number[]): number {
  let i: number;
  for (i = 0; i < d[4]; i++) buf[i] = d[2];
  for (i = d[4]; i < d[5]; i++) buf[i] = d[1];
  for (i = d[5]; i < 160; i++) buf[i] = d[2];
  return i;
}

function AnimTask_SurfWaveScanlineEffect(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0: {
      let i: number;
      for (i = 0; i < d[4]; i++) gScanlineEffectRegBuffers[0][i] = gScanlineEffectRegBuffers[1][i] = d[2];
      for (i = d[4]; i < d[5]; i++) gScanlineEffectRegBuffers[0][i] = gScanlineEffectRegBuffers[1][i] = d[1];
      for (i = d[5]; i < 160; i++) gScanlineEffectRegBuffers[0][i] = gScanlineEffectRegBuffers[1][i] = d[2];
      if (d[4] === 0) gScanlineEffectRegBuffers[0][i] = gScanlineEffectRegBuffers[1][i] = d[1];
      else gScanlineEffectRegBuffers[0][i] = gScanlineEffectRegBuffers[1][i] = d[2];
      ScanlineEffect_SetParams({ dmaDest: REG_OFFSET_BLDALPHA, dmaControl: SCANLINE_EFFECT_DMACNT_16BIT, initState: 1, unused9: 0 });
      d[0]++;
      break;
    }
    case 1:
      if (d[3] === 0) {
        if (--d[4] <= 0) {
          d[4] = 0;
          d[0]++;
        }
      } else if (++d[5] > 111) {
        d[0]++;
      }
      fillSurfScanlines(gScanlineEffectRegBuffers[gScanlineEffect.srcBuffer], d);
      break;
    case 2:
      fillSurfScanlines(gScanlineEffectRegBuffers[gScanlineEffect.srcBuffer], d);
      if (d[15] === -1) {
        ScanlineEffect_Stop();
        tasks.destroy(taskId);
      }
      break;
  }
}

function AnimSmallDriftingBubbles(sprite: Sprite): void {
  sprite.oam.tileNum += 8;
  InitSpritePosToAnimTarget(sprite, true);
  const randData = s16((random() & 0xff) | 256);
  let randData2 = s16(random() & 0x1ff);
  if (randData2 > 255) randData2 = 256 - randData2;
  sprite.data[1] = randData;
  sprite.data[2] = randData2;
  sprite.callback = AnimSmallDriftingBubbles_Step;
}

function AnimSmallDriftingBubbles_Step(sprite: Sprite): void {
  sprite.data[3] += sprite.data[1];
  sprite.data[4] += sprite.data[2];
  if (sprite.data[1] & 1) sprite.x2 = -(sprite.data[3] >> 8);
  else sprite.x2 = sprite.data[3] >> 8;
  sprite.y2 = sprite.data[4] >> 8;
  if (++sprite.data[0] === 21) DestroyAnimSprite(sprite);
}

function AnimTask_WaterSpoutLaunch(taskId: number): void {
  const d = gTasks[taskId].data;
  d[15] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  d[5] = gSprites[d[15]].y;
  d[1] = GetWaterSpoutPowerForAnim();
  PrepareBattlerSpriteForRotScale(d[15], ST_OAM_OBJ_NORMAL);
  gTasks[taskId].func = AnimTask_WaterSpoutLaunch_Step;
}

function AnimTask_WaterSpoutLaunch_Step(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[0]) {
    case 0:
      BattleAnimHelper_SetSpriteSquashParams(task, d[15], 0x100, 0x100, 224, 0x200, 32);
      d[0]++;
    // fallthrough
    case 1:
      if (++d[3] > 1) {
        d[3] = 0;
        if (++d[4] & 1) {
          gSprites[d[15]].x2 = 3;
          gSprites[d[15]].y++;
        } else {
          gSprites[d[15]].x2 = -3;
        }
      }
      if (BattleAnimHelper_RunSpriteSquash(task) === 0) {
        SetBattlerSpriteYOffsetFromYScale(d[15]);
        gSprites[d[15]].x2 = 0;
        d[3] = 0;
        d[4] = 0;
        d[0]++;
      }
      break;
    case 2:
      if (++d[3] > 4) {
        BattleAnimHelper_SetSpriteSquashParams(task, d[15], 224, 0x200, 384, 224, 8);
        d[3] = 0;
        d[0]++;
      }
      break;
    case 3:
      if (BattleAnimHelper_RunSpriteSquash(task) === 0) {
        d[3] = 0;
        d[4] = 0;
        d[0]++;
      }
      break;
    case 4:
      CreateWaterSpoutLaunchDroplets(task, taskId);
      d[0]++;
    // fallthrough
    case 5:
      if (++d[3] > 1) {
        d[3] = 0;
        if (++d[4] & 1) gSprites[d[15]].y2 += 2;
        else gSprites[d[15]].y2 -= 2;
        if (d[4] === 10) {
          BattleAnimHelper_SetSpriteSquashParams(task, d[15], 384, 224, 0x100, 0x100, 8);
          d[3] = 0;
          d[4] = 0;
          d[0]++;
        }
      }
      break;
    case 6:
      gSprites[d[15]].y--;
      if (BattleAnimHelper_RunSpriteSquash(task) === 0) {
        ResetSpriteRotScale(d[15]);
        gSprites[d[15]].y = d[5];
        d[4] = 0;
        d[0]++;
      }
      break;
    case 7:
      if (d[2] === 0) DestroyAnimVisualTask(taskId);
      break;
  }
}

// Returns a value 0-3 relative to which quarter HP the attacker is in
// A higher number results in more water sprites during the Water Spout animation
function GetWaterSpoutPowerForAnim(): number {
  const partyIndex = gBattlerPartyIndexes[animState.gBattleAnimAttacker];
  const slot = GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER ? playerMon(partyIndex) : gEnemyParty[partyIndex];
  let maxhp = GetMonData(slot, C.MON_DATA_MAX_HP) & 0xffff;
  const hp = GetMonData(slot, C.MON_DATA_HP) & 0xffff;
  maxhp = (maxhp / 4) | 0;
  for (let i = 0; i < 3; i++) if (hp < maxhp * (i + 1)) return i;
  return 3;
}

function CreateWaterSpoutLaunchDroplets(task: Task, taskId: number): void {
  const d = task.data;
  const attackerCoordX = s16(GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2));
  const attackerCoordY = s16(GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET));
  let trigIndex = 172;
  const subpriority = (GetBattlerSpriteSubpriority(animState.gBattleAnimAttacker) - 1) & 0xff;
  let increment = 4 - d[1];
  if (increment <= 0) increment = 1;
  for (let i = 0; i < 20; i += increment) {
    const spriteId = CreateSprite(animTemplate("gSmallWaterOrbSpriteTemplate"), attackerCoordX, attackerCoordY, subpriority);
    if (spriteId !== MAX_SPRITES) {
      const s = gSprites[spriteId];
      s.data[1] = i;
      s.data[2] = attackerCoordX * 16;
      s.data[3] = attackerCoordY * 16;
      s.data[4] = Cos(trigIndex, 64);
      s.data[5] = Sin(trigIndex, 64);
      s.data[6] = taskId;
      s.data[7] = 2;
      if (d[2] & 1) AnimSmallWaterOrb(s);
      d[2]++;
    }
    trigIndex = (trigIndex + increment * 2) & 0xff;
  }
}

function AnimSmallWaterOrb(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      sprite.data[4] += (sprite.data[1] % 6) * 3;
      sprite.data[5] += (sprite.data[1] % 3) * 3;
      sprite.data[0]++;
    // fallthrough
    case 1:
      sprite.data[2] += sprite.data[4];
      sprite.data[3] += sprite.data[5];
      sprite.x = sprite.data[2] >> 4;
      sprite.y = sprite.data[3] >> 4;
      if (sprite.x < -8 || sprite.x > 248 || sprite.y < -8 || sprite.y > 120) {
        gTasks[sprite.data[6]].data[sprite.data[7]]--;
        DestroySprite(sprite);
      }
      break;
  }
}

function AnimTask_WaterSpoutRain(taskId: number): void {
  const d = gTasks[taskId].data;
  d[1] = GetWaterSpoutPowerForAnim();
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
    d[4] = 136;
    d[6] = 40;
  } else {
    d[4] = 16;
    d[6] = 80;
  }
  d[5] = 98;
  d[7] = d[4] + 49;
  d[12] = d[1] * 5 + 5;
  gTasks[taskId].func = AnimTask_WaterSpoutRain_Step;
}

function AnimTask_WaterSpoutRain_Step(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[0]) {
    case 0:
      if (++d[2] > 2) {
        d[2] = 0;
        CreateWaterSpoutRainDroplet(task, taskId);
      }
      if (d[10] !== 0 && d[13] === 0) {
        gBattleAnimArgs[0] = ANIM_TARGET;
        gBattleAnimArgs[1] = 0;
        gBattleAnimArgs[2] = 12;
        let taskId2 = tasks.create(AnimTask_HorizontalShake, 80);
        if (taskId2 !== 0xff) {
          gTasks[taskId2].func(taskId2);
          animState.gAnimVisualTaskCount++;
        }
        gBattleAnimArgs[0] = ANIM_DEF_PARTNER;
        taskId2 = tasks.create(AnimTask_HorizontalShake, 80);
        if (taskId2 !== 0xff) {
          gTasks[taskId2].func(taskId2);
          animState.gAnimVisualTaskCount++;
        }
        d[13] = 1;
      }
      if (d[11] >= d[12]) d[0]++;
      break;
    case 1:
      if (d[9] === 0) DestroyAnimVisualTask(taskId);
      break;
  }
}

function CreateWaterSpoutRainDroplet(task: Task, taskId: number): void {
  const d = task.data;
  const yPosArg = (((gSineTable[d[8]] + 3) >> 4) + d[6]) & 0xffff;
  const spriteId = CreateSprite(animTemplate("gSmallWaterOrbSpriteTemplate"), d[7], 0, 0);
  if (spriteId !== MAX_SPRITES) {
    gSprites[spriteId].callback = AnimWaterSpoutRain;
    gSprites[spriteId].data[5] = yPosArg;
    gSprites[spriteId].data[6] = taskId;
    gSprites[spriteId].data[7] = 9;
    d[9]++;
  }
  d[11]++;
  d[8] = (d[8] + 39) & 0xff;
  d[7] = s16((ISO_RANDOMIZE2(d[7]) % d[5]) + d[4]);
}

function AnimWaterSpoutRain(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    sprite.y += 8;
    if (sprite.y >= sprite.data[5]) {
      gTasks[sprite.data[6]].data[10] = 1;
      sprite.data[1] = CreateSprite(animTemplate("gWaterHitSplatSpriteTemplate"), sprite.x, sprite.y, 1);
      if (sprite.data[1] !== MAX_SPRITES) {
        const hit = gSprites[sprite.data[1]];
        StartSpriteAffineAnim(hit, 3);
        hit.data[6] = sprite.data[6];
        hit.data[7] = sprite.data[7];
        hit.callback = AnimWaterSpoutRainHit;
      }
      DestroySprite(sprite);
    }
  }
}

function AnimWaterSpoutRainHit(sprite: Sprite): void {
  if (++sprite.data[1] > 1) {
    sprite.data[1] = 0;
    sprite.invisible = !sprite.invisible;
    if (++sprite.data[2] === 12) {
      gTasks[sprite.data[6]].data[sprite.data[7]]--;
      FreeOamMatrix(sprite.oam.matrixNum);
      DestroySprite(sprite);
    }
  }
}

function AnimTask_WaterSport(taskId: number): void {
  const d = gTasks[taskId].data;
  d[3] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  d[4] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  d[7] = GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER ? 1 : -1;
  if (IsContest()) d[7] *= -1;
  d[5] = d[3] + d[7] * 8;
  d[6] = d[4] - d[7] * 8;
  d[9] = -32;
  d[1] = 0;
  d[0] = 0;
  gTasks[taskId].func = AnimTask_WaterSport_Step;
}

function AnimTask_WaterSport_Step(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[0]) {
    case 0:
      CreateWaterSportDroplet(task);
      if (d[10] !== 0) d[0]++;
      break;
    case 1:
      CreateWaterSportDroplet(task);
      if (++d[1] > 16) {
        d[1] = 0;
        d[0]++;
      }
      break;
    case 2:
      CreateWaterSportDroplet(task);
      d[5] += d[7] * 6;
      if (!(d[5] >= -16 && d[5] <= 256)) {
        if (++d[12] > 2) {
          d[13] = 1;
          d[0] = 6;
          d[1] = 0;
        } else {
          d[1] = 0;
          d[0]++;
        }
      }
      break;
    case 3:
      CreateWaterSportDroplet(task);
      d[6] -= d[7] * 2;
      if (++d[1] > 7) d[0]++;
      break;
    case 4:
      CreateWaterSportDroplet(task);
      d[5] -= d[7] * 6;
      if (!(d[5] >= -16 && d[5] <= 256)) {
        d[12]++;
        d[1] = 0;
        d[0]++;
      }
      break;
    case 5:
      CreateWaterSportDroplet(task);
      d[6] -= d[7] * 2;
      if (++d[1] > 7) d[0] = 2;
      break;
    case 6:
      if (d[8] === 0) d[0]++;
      break;
    default:
      DestroyAnimVisualTask(taskId);
      break;
  }
}

function CreateWaterSportDroplet(task: Task): void {
  const d = task.data;
  if (++d[2] > 1) {
    d[2] = 0;
    const spriteId = CreateSprite(animTemplate("gSmallWaterOrbSpriteTemplate"), d[3], d[4], 10);
    if (spriteId !== MAX_SPRITES) {
      const s = gSprites[spriteId];
      s.data[0] = 16;
      s.data[2] = d[5];
      s.data[4] = d[6];
      s.data[5] = d[9];
      InitAnimArcTranslation(s);
      s.callback = AnimWaterSportDroplet;
      d[8]++;
    }
  }
}

function AnimWaterSportDroplet(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) {
    sprite.x += sprite.x2;
    sprite.y += sprite.y2;
    sprite.data[0] = 6;
    sprite.data[2] = (random() & 0x1f) - 16 + sprite.x;
    sprite.data[4] = (random() & 0x1f) - 16 + sprite.y;
    sprite.data[5] = ~(random() & 7);
    InitAnimArcTranslation(sprite);
    sprite.callback = AnimWaterSportDroplet_Step;
  }
}

function AnimWaterSportDroplet_Step(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) {
    for (let i = 0; i < gTasks.length; i++) {
      if (gTasks[i].isActive && gTasks[i].func === AnimTask_WaterSport_Step) {
        gTasks[i].data[10] = 1;
        gTasks[i].data[8]--;
        DestroySprite(sprite);
      }
    }
  }
}

function AnimWaterPulseBubble(sprite: Sprite): void {
  sprite.x = gBattleAnimArgs[0];
  sprite.y = gBattleAnimArgs[1];
  sprite.data[0] = gBattleAnimArgs[2];
  sprite.data[1] = gBattleAnimArgs[3];
  sprite.data[2] = gBattleAnimArgs[4];
  sprite.data[3] = gBattleAnimArgs[5];
  sprite.callback = AnimWaterPulseBubble_Step;
}

function AnimWaterPulseBubble_Step(sprite: Sprite): void {
  sprite.data[4] -= sprite.data[0];
  sprite.y2 = Math.trunc(sprite.data[4] / 10);
  sprite.data[5] = (sprite.data[5] + sprite.data[1]) & 0xff;
  sprite.x2 = Sin(sprite.data[5], sprite.data[2]);
  if (--sprite.data[3] === 0) DestroyAnimSprite(sprite);
}

function AnimWaterPulseRingBubble(sprite: Sprite): void {
  sprite.data[3] += sprite.data[1];
  sprite.data[4] += sprite.data[2];
  sprite.x2 = sprite.data[3] >> 7;
  sprite.y2 = sprite.data[4] >> 7;
  if (--sprite.data[0] === 0) {
    FreeSpriteOamMatrix(sprite);
    DestroySprite(sprite);
  }
}

export function AnimWaterPulseRing(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  sprite.data[1] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[3] = gBattleAnimArgs[2];
  sprite.data[4] = gBattleAnimArgs[3];
  sprite.callback = AnimWaterPulseRing_Step;
}

function AnimWaterPulseRing_Step(sprite: Sprite): void {
  const xDiff = sprite.data[1] - sprite.x;
  const yDiff = sprite.data[2] - sprite.y;
  sprite.x2 = Math.trunc((sprite.data[0] * xDiff) / sprite.data[3]);
  sprite.y2 = Math.trunc((sprite.data[0] * yDiff) / sprite.data[3]);
  if (++sprite.data[5] === sprite.data[4]) {
    sprite.data[5] = 0;
    CreateWaterPulseRingBubbles(sprite, xDiff, yDiff);
  }
  if (sprite.data[3] === sprite.data[0]) DestroyAnimSprite(sprite);
  sprite.data[0]++;
}

function CreateWaterPulseRingBubbles(sprite: Sprite, xDiff: number, yDiff: number): void {
  const something = s16(Math.trunc(sprite.data[0] / 2));
  const combinedX = s16(sprite.x + sprite.x2);
  const combinedY = s16(sprite.y + sprite.y2);
  const somethingRandomY = s16(yDiff + (random() % 10) - 5);
  const somethingRandomX = s16(-xDiff + (random() % 10) - 5);
  const template = animTemplate("gWaterPulseRingBubbleSpriteTemplate");
  const subpriority = (GetBattlerSpriteSubpriority(animState.gBattleAnimAttacker) - 1) & 0xff;
  let spriteId = CreateSprite(template, combinedX, combinedY + something, 130);
  gSprites[spriteId].data[0] = 20;
  gSprites[spriteId].data[1] = somethingRandomY;
  gSprites[spriteId].subpriority = subpriority;
  gSprites[spriteId].data[2] = somethingRandomX < 0 ? -somethingRandomX : somethingRandomX;
  spriteId = CreateSprite(template, combinedX, combinedY - something, 130);
  gSprites[spriteId].data[0] = 20;
  gSprites[spriteId].data[1] = somethingRandomY;
  gSprites[spriteId].subpriority = subpriority;
  gSprites[spriteId].data[2] = somethingRandomX > 0 ? -somethingRandomX : somethingRandomX;
}

registerAnimSpriteCallbacks({
  AnimRainDrop, AnimWaterBubbleProjectile, AnimAuroraBeamRings, AnimToTargetInSinWave, AnimHydroCannonCharge, AnimHydroCannonBeam,
  AnimWaterGunDroplet, AnimSmallBubblePair, AnimSmallDriftingBubbles, AnimSmallWaterOrb, AnimWaterSpoutRain, AnimWaterSpoutRainHit,
  AnimWaterSportDroplet, AnimWaterPulseBubble, AnimWaterPulseRingBubble, AnimWaterPulseRing,
});

registerAnimTasks({
  AnimTask_CreateRaindrops, AnimTask_RotateAuroraRingColors, AnimTask_StartSinAnimTimer, AnimTask_CreateSurfWave,
  AnimTask_WaterSpoutLaunch, AnimTask_WaterSpoutRain, AnimTask_WaterSport,
});
