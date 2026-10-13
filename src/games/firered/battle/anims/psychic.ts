// battle_anim_psychic.c: Reflect / Light Screen walls and sparkles, Kinesis spoon,
// Amnesia question mark, Meditate / Teleport affine tasks, Imprison orbs,
// Skill Swap, Extrasensory distortion and clone, and Psycho Boost.

import * as C from "../../generated/constants";
import { affineAnimFrom, affineAnimsFrom } from "../../hw/cdataSprite";
import { SetGpuReg } from "../../hw/gpu";
import { gPlttBufferFaded, OBJ_PLTT_ID } from "../../hw/palette";
import { BLDALPHA_BLEND, REG_OFFSET_BG1HOFS, REG_OFFSET_BG2HOFS } from "../../hw/ppu";
import { gScanlineEffect, gScanlineEffectRegBuffers, SCANLINE_EFFECT_DMACNT_16BIT, ScanlineEffect_SetParams } from "../../hw/scanline";
import {
  AllocOamMatrix, CalcCenterToCornerVec, ChangeSpriteAffineAnim, CreateSprite, DestroySprite, FreeOamMatrix, gSprites,
  IndexOfSpritePaletteTag, InitSpriteAffineAnim, MAX_SPRITES, SpriteCallbackDummy, ST_OAM_AFFINE_DOUBLE, ST_OAM_AFFINE_NORMAL,
  ST_OAM_AFFINE_OFF, StartSpriteAffineAnim, StartSpriteAnim, type Sprite,
} from "../../hw/sprite";
import { gSineTable } from "../../hw/trig";
import {
  ANIM_ATTACKER, ANIM_TARGET, animState, CloneBattlerSpriteWithBlend, DestroyAnimSprite, DestroyAnimVisualTask,
  DestroySpriteAndMatrix, DestroySpriteWithActiveSheet, GetAnimBattlerSpriteId, GetBattlerSpriteBGPriorityRank,
  GetBattlerSpriteCoord, GetBattlerSpriteCoordAttr, GetBattlerYCoordWithElevation, InitAnimArcTranslation, InitSpritePosToAnimAttacker,
  InitSpritePosToAnimTarget, IsBattlerSpriteVisible, MoveBattlerSpriteToBG, PrepareAffineAnimInTaskData, ResetBattleAnimBg,
  ResetSpriteRotScale, RunAffineAnimFromTaskData, RunStoredCallbackWhenAnimEnds, SetBattlerSpriteYOffsetFromOtherYScale,
  SetSpriteRotScale, StoreSpriteCallbackInData6, TranslateAnimHorizontalArc,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { BattleAnimAdjustPanning } from "../animScript";
import { G, gBattlerSpriteIds } from "../globals";
import { BATTLE_PARTNER } from "../macros";
import { GetBattlerAtPosition, GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, PlaySE12WithPanning, s16 } from "./common";

const DISPLAY_WIDTH = 240;

function IsDoubleBattle(): boolean {
  return (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) !== 0;
}

// For the rectangular wall sprite used by Reflect, Mirror Coat, etc
function AnimDefensiveWall(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER || IsContest()) {
    sprite.oam.priority = 2;
    sprite.subpriority = 200;
  }
  if (!IsContest()) {
    const battlerCopy = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
    let battler = battlerCopy;
    const rank = GetBattlerSpriteBGPriorityRank(battler);
    const toBG2 = (rank ^ 1) !== 0;
    if (IsBattlerSpriteVisible(battler)) MoveBattlerSpriteToBG(battler, toBG2);
    battler = BATTLE_PARTNER(battlerCopy);
    if (IsBattlerSpriteVisible(battler)) MoveBattlerSpriteToBG(battler, !toBG2);
  }
  if (!IsContest() && IsDoubleBattle()) {
    if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
      sprite.x = 72;
      sprite.y = 80;
    } else {
      sprite.x = 176;
      sprite.y = 40;
    }
  } else {
    if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[0] = -gBattleAnimArgs[0];
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X) + gBattleAnimArgs[0];
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y) + gBattleAnimArgs[1];
  }
  if (IsContest()) sprite.y += 9;
  sprite.data[0] = OBJ_PLTT_ID(IndexOfSpritePaletteTag(gBattleAnimArgs[2] & 0xffff));
  sprite.callback = AnimDefensiveWall_Step2;
  sprite.callback(sprite);
}

// AnimDefensiveWall_Step1 is removed in FRLG from the removal of Contest handling
function AnimDefensiveWall_Step2(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[3], 16 - sprite.data[3]));
  if (sprite.data[3] === 13) sprite.callback = AnimDefensiveWall_Step3;
  else ++sprite.data[3];
}

function AnimDefensiveWall_Step3(sprite: Sprite): void {
  if (++sprite.data[1] === 2) {
    sprite.data[1] = 0;
    const startOffset = sprite.data[0] & 0xffff;
    const color = gPlttBufferFaded[startOffset + 8];
    for (let i = 8; i > 0; --i) gPlttBufferFaded[startOffset + i] = gPlttBufferFaded[startOffset + i - 1];
    gPlttBufferFaded[startOffset + 1] = color;
    if (++sprite.data[2] === 16) sprite.callback = AnimDefensiveWall_Step4;
  }
}

function AnimDefensiveWall_Step4(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[3], 16 - sprite.data[3]));
  if (--sprite.data[3] === -1) {
    if (!IsContest()) {
      const battlerCopy = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
      let battler = battlerCopy;
      if (IsBattlerSpriteVisible(battler)) gSprites[gBattlerSpriteIds[battler]].invisible = false;
      battler = BATTLE_PARTNER(battlerCopy);
      if (IsBattlerSpriteVisible(battler)) gSprites[gBattlerSpriteIds[battler]].invisible = false;
    }
    sprite.invisible = true;
    sprite.callback = AnimDefensiveWall_Step5;
  }
}

function AnimDefensiveWall_Step5(sprite: Sprite): void {
  if (!IsContest()) {
    const battlerCopy = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
    let battler = battlerCopy;
    const rank = GetBattlerSpriteBGPriorityRank(battler);
    const toBG2 = (rank ^ 1) !== 0;
    if (IsBattlerSpriteVisible(battler)) ResetBattleAnimBg(toBG2);
    battler = battlerCopy ^ 2;
    if (IsBattlerSpriteVisible(battler)) ResetBattleAnimBg(!toBG2);
  }
  sprite.callback = DestroyAnimSprite;
}

// Animates the sparkle that appears during Reflect or Light Screen/Mirror Coat
function AnimWallSparkle(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    const ignoreOffsets = gBattleAnimArgs[3] !== 0;
    const respectMonPicOffsets = !ignoreOffsets;
    if (!IsContest() && IsDoubleBattle()) {
      if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
        sprite.x = 72 - gBattleAnimArgs[0];
        sprite.y = gBattleAnimArgs[1] + 80;
      } else {
        sprite.x = gBattleAnimArgs[0] + 176;
        sprite.y = gBattleAnimArgs[1] + 40;
      }
    } else if (gBattleAnimArgs[2] === 0) {
      InitSpritePosToAnimAttacker(sprite, respectMonPicOffsets);
    } else {
      InitSpritePosToAnimTarget(sprite, respectMonPicOffsets);
    }
    ++sprite.data[0];
  } else if (sprite.animEnded || sprite.affineAnimEnded) {
    DestroySpriteAndMatrix(sprite);
  }
}

function AnimBentSpoon(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    StartSpriteAnim(sprite, 1);
    sprite.x -= 40;
    sprite.y += 10;
    sprite.data[1] = -1;
  } else {
    sprite.x += 40;
    sprite.y -= 10;
    sprite.data[1] = 1;
  }
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = RunStoredCallbackWhenAnimEnds;
}

// Used by Amnesia
function AnimQuestionMark(sprite: Sprite): void {
  let x = s16(Math.trunc(GetBattlerSpriteCoordAttr(animState.gBattleAnimAttacker, C.BATTLER_COORD_ATTR_WIDTH) / 2));
  const y = s16(Math.trunc(GetBattlerSpriteCoordAttr(animState.gBattleAnimAttacker, C.BATTLER_COORD_ATTR_HEIGHT) / -2));
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_OPPONENT) x = -x;
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2) + x;
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET) + y;
  if (sprite.y < 16) sprite.y = 16;
  StoreSpriteCallbackInData6(sprite, AnimQuestionMark_Step1);
  sprite.callback = RunStoredCallbackWhenAnimEnds;
}

function AnimQuestionMark_Step1(sprite: Sprite): void {
  sprite.oam.affineMode = ST_OAM_AFFINE_NORMAL;
  sprite.affineAnims = affineAnimsFrom({ $sym: "sAffineAnims_QuestionMark" });
  sprite.data[0] = 0;
  InitSpriteAffineAnim(sprite);
  sprite.callback = AnimQuestionMark_Step2;
}

function AnimQuestionMark_Step2(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      if (sprite.affineAnimEnded) {
        FreeOamMatrix(sprite.oam.matrixNum);
        sprite.oam.affineMode = ST_OAM_AFFINE_OFF;
        sprite.data[1] = 18;
        ++sprite.data[0];
      }
      break;
    case 1:
      if (--sprite.data[1] === -1) DestroyAnimSprite(sprite);
      break;
  }
}

function AnimTask_MeditateStretchAttacker(taskId: number): void {
  const task = gTasks[taskId];
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.data[0] = spriteId;
  PrepareAffineAnimInTaskData(task, spriteId, affineAnimFrom({ $sym: "sAffineAnim_MeditateStretchAttacker" }));
  task.func = AnimTask_MeditateStretchAttacker_Step;
}

function AnimTask_MeditateStretchAttacker_Step(taskId: number): void {
  if (!RunAffineAnimFromTaskData(gTasks[taskId])) DestroyAnimVisualTask(taskId);
}

function AnimTask_Teleport(taskId: number): void {
  const task = gTasks[taskId];
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.data[0] = spriteId;
  task.data[1] = 0;
  task.data[2] = 0;
  task.data[3] = GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER ? 4 : 8;
  PrepareAffineAnimInTaskData(task, task.data[0], affineAnimFrom({ $sym: "sAffineAnim_Teleport" }));
  task.func = AnimTask_Teleport_Step;
}

function AnimTask_Teleport_Step(taskId: number): void {
  const task = gTasks[taskId];
  const d = task.data;
  switch (d[1]) {
    case 0:
      RunAffineAnimFromTaskData(task);
      if (++d[2] > 19) ++d[1];
      break;
    case 1:
      if (d[3] !== 0) {
        gSprites[d[0]].y2 -= 8;
        --d[3];
      } else {
        gSprites[d[0]].invisible = true;
        gSprites[d[0]].x = DISPLAY_WIDTH + 32;
        ResetSpriteRotScale(d[0]);
        DestroyAnimVisualTask(taskId);
      }
      break;
  }
}

function AnimTask_ImprisonOrbs(taskId: number): void {
  const d = gTasks[taskId].data;
  d[3] = 16;
  d[4] = 0;
  d[13] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  d[14] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  const var0 = Math.trunc(GetBattlerSpriteCoordAttr(animState.gBattleAnimAttacker, C.BATTLER_COORD_ATTR_WIDTH) / 3) & 0xffff;
  const var1 = Math.trunc(GetBattlerSpriteCoordAttr(animState.gBattleAnimAttacker, C.BATTLER_COORD_ATTR_HEIGHT) / 3) & 0xffff;
  d[12] = s16(var0 > var1 ? var0 : var1);
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16, 0));
  gTasks[taskId].func = AnimTask_ImprisonOrbs_Step;
}

function AnimTask_ImprisonOrbs_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0:
      if (++d[1] > 8) {
        d[1] = 0;
        const spriteId = CreateSprite(animTemplate("sImprisonOrbSpriteTemplate"), d[13], d[14], 0);
        d[d[2] + 8] = spriteId;
        if (spriteId !== MAX_SPRITES) {
          switch (d[2]) {
            case 0: gSprites[spriteId].x2 = d[12]; gSprites[spriteId].y2 = -d[12]; break;
            case 1: gSprites[spriteId].x2 = -d[12]; gSprites[spriteId].y2 = d[12]; break;
            case 2: gSprites[spriteId].x2 = d[12]; gSprites[spriteId].y2 = d[12]; break;
            case 3: gSprites[spriteId].x2 = -d[12]; gSprites[spriteId].y2 = -d[12]; break;
          }
        }
        if (++d[2] === 5) ++d[0];
      }
      break;
    case 1:
      if (d[1] & 1) --d[3];
      else ++d[4];
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[3], d[4]));
      if (++d[1] === 32) {
        for (let i = 8; i < 13; ++i) if (d[i] !== MAX_SPRITES) DestroySprite(gSprites[d[i]]);
        ++d[0];
      }
      break;
    case 2:
      ++d[0];
      break;
    case 3:
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
      DestroyAnimVisualTask(taskId);
      break;
  }
}

function AnimRedX_Step(sprite: Sprite): void {
  if (sprite.data[1] > sprite.data[0] - 10) sprite.invisible = (sprite.data[1] & 1) !== 0;
  if (sprite.data[1] === sprite.data[0]) DestroyAnimSprite(sprite);
  ++sprite.data[1];
}

function AnimRedX(sprite: Sprite): void {
  if (gBattleAnimArgs[0] === 0) {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  }
  sprite.data[0] = gBattleAnimArgs[1];
  sprite.callback = AnimRedX_Step;
}

function AnimTask_SkillSwap(taskId: number): void {
  const d = gTasks[taskId].data;
  const { gBattleAnimAttacker, gBattleAnimTarget } = animState;
  const attr = GetBattlerSpriteCoordAttr;
  if (IsContest()) {
    if (gBattleAnimArgs[0] === ANIM_TARGET) {
      d[10] = -10;
      d[11] = attr(gBattleAnimTarget, C.BATTLER_COORD_ATTR_RIGHT) - 8;
      d[12] = attr(gBattleAnimTarget, C.BATTLER_COORD_ATTR_TOP) + 8;
      d[13] = attr(gBattleAnimAttacker, C.BATTLER_COORD_ATTR_RIGHT) - 8;
      d[14] = attr(gBattleAnimAttacker, C.BATTLER_COORD_ATTR_TOP) + 8;
    } else {
      d[10] = 10;
      d[11] = attr(gBattleAnimAttacker, C.BATTLER_COORD_ATTR_LEFT) + 8;
      d[12] = attr(gBattleAnimAttacker, C.BATTLER_COORD_ATTR_BOTTOM) - 8;
      d[13] = attr(gBattleAnimTarget, C.BATTLER_COORD_ATTR_LEFT) + 8;
      d[14] = attr(gBattleAnimTarget, C.BATTLER_COORD_ATTR_BOTTOM) - 8;
    }
  } else if (gBattleAnimArgs[0] === 1) {
    d[10] = -10;
    d[11] = attr(gBattleAnimTarget, C.BATTLER_COORD_ATTR_LEFT) + 8;
    d[12] = attr(gBattleAnimTarget, C.BATTLER_COORD_ATTR_TOP) + 8;
    d[13] = attr(gBattleAnimAttacker, C.BATTLER_COORD_ATTR_LEFT) + 8;
    d[14] = attr(gBattleAnimAttacker, C.BATTLER_COORD_ATTR_TOP) + 8;
  } else {
    d[10] = 10;
    d[11] = attr(gBattleAnimAttacker, C.BATTLER_COORD_ATTR_RIGHT) - 8;
    d[12] = attr(gBattleAnimAttacker, C.BATTLER_COORD_ATTR_BOTTOM) - 8;
    d[13] = attr(gBattleAnimTarget, C.BATTLER_COORD_ATTR_RIGHT) - 8;
    d[14] = attr(gBattleAnimTarget, C.BATTLER_COORD_ATTR_BOTTOM) - 8;
  }
  d[1] = 6;
  gTasks[taskId].func = AnimTask_SkillSwap_Step;
}

function AnimTask_SkillSwap_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0:
      if (++d[1] > 6) {
        d[1] = 0;
        const spriteId = CreateSprite(animTemplate("sSkillSwapOrbSpriteTemplate"), d[11], d[12], 0);
        if (spriteId !== 64) {
          const s = gSprites[spriteId];
          s.data[0] = 16;
          s.data[2] = d[13];
          s.data[4] = d[14];
          s.data[5] = d[10];
          InitAnimArcTranslation(s);
          StartSpriteAffineAnim(s, d[2] & 3);
        }
        if (++d[2] === 12) ++d[0];
      }
      break;
    case 1:
      if (++d[1] > 17) DestroyAnimVisualTask(taskId);
      break;
  }
}

function AnimSkillSwapOrb(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) {
    FreeOamMatrix(sprite.oam.matrixNum);
    DestroySprite(sprite);
  }
}

// The scanline effect that distorts the target during Extrasensory by segmenting the mon vertically and shifting the slices
// arg0: Stage. Stage 0 is a slight right distortion, 1 is a medium left distortion, and 2 is a severe right distortion
function AnimTask_ExtrasensoryDistortion(taskId: number): void {
  const d = gTasks[taskId].data;
  const yOffset = GetBattlerYCoordWithElevation(animState.gBattleAnimTarget) & 0xff;
  d[14] = yOffset - 32;
  switch (gBattleAnimArgs[0]) {
    case 0: d[11] = 2; d[12] = 5; d[13] = 64; d[15] = yOffset + 32; break;
    case 1: d[11] = 2; d[12] = 5; d[13] = 192; d[15] = yOffset + 32; break;
    case 2: d[11] = 4; d[12] = 4; d[13] = 0; d[15] = yOffset + 32; break;
  }
  if (d[14] < 0) d[14] = 0;
  let dmaDest: number;
  if (GetBattlerSpriteBGPriorityRank(animState.gBattleAnimTarget) === 1) {
    d[10] = s16(G.gBattle_BG1_X);
    dmaDest = REG_OFFSET_BG1HOFS;
  } else {
    d[10] = s16(G.gBattle_BG2_X);
    dmaDest = REG_OFFSET_BG2HOFS;
  }
  for (let i = d[14]; i <= d[14] + 64; ++i) {
    gScanlineEffectRegBuffers[0][i] = d[10];
    gScanlineEffectRegBuffers[1][i] = d[10];
  }
  ScanlineEffect_SetParams({ dmaDest, dmaControl: SCANLINE_EFFECT_DMACNT_16BIT, initState: 1, unused9: 0 });
  gTasks[taskId].func = AnimTask_ExtrasensoryDistortion_Step;
}

function AnimTask_ExtrasensoryDistortion_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0: {
      let sineIndex = d[13];
      for (let i = d[14]; i <= d[15]; ++i) {
        let var2 = s16(gSineTable[sineIndex] >> d[12]);
        if (var2 > 0) var2 += d[1] & 3;
        else if (var2 < 0) var2 -= d[1] & 3;
        gScanlineEffectRegBuffers[0][i] = d[10] + var2;
        gScanlineEffectRegBuffers[1][i] = d[10] + var2;
        sineIndex = s16(sineIndex + d[11]);
      }
      if (++d[1] > 23) ++d[0];
      break;
    }
    case 1:
      gScanlineEffect.state = 3;
      ++d[0];
      break;
    case 2:
      DestroyAnimVisualTask(taskId);
      break;
  }
}

// Creates a cloned transparent sprite of the battler that grows and then shrinks back to original size. Used by Extrasensory
// arg0: battler
function AnimTask_TransparentCloneGrowAndShrink(taskId: number): void {
  const d = gTasks[taskId].data;
  const matrixNum = s16(AllocOamMatrix());
  if (matrixNum === 0xff) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  const spriteId = s16(CloneBattlerSpriteWithBlend(gBattleAnimArgs[0]));
  if (spriteId < 0) {
    FreeOamMatrix(matrixNum);
    DestroyAnimVisualTask(taskId);
    return;
  }
  const s = gSprites[spriteId];
  s.callback = SpriteCallbackDummy;
  s.oam.affineMode = ST_OAM_AFFINE_DOUBLE;
  s.oam.matrixNum = matrixNum;
  s.affineAnimPaused = true;
  ++s.subpriority;
  SetSpriteRotScale(spriteId, 256, 256, 0);
  CalcCenterToCornerVec(s, s.oam.shape, s.oam.size, s.oam.affineMode);
  d[13] = GetAnimBattlerSpriteId(gBattleAnimArgs[0]);
  d[14] = matrixNum;
  d[15] = spriteId;
  gTasks[taskId].func = AnimTask_TransparentCloneGrowAndShrink_Step;
}

function AnimTask_TransparentCloneGrowAndShrink_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0:
      d[1] += 4;
      d[2] = 256 - (gSineTable[d[1]] >> 1);
      SetSpriteRotScale(d[15], d[2], d[2], 0);
      SetBattlerSpriteYOffsetFromOtherYScale(d[15], d[13]);
      if (d[1] === 48) ++d[0];
      break;
    case 1:
      d[1] -= 4;
      d[2] = 256 - (gSineTable[d[1]] >> 1);
      SetSpriteRotScale(d[15], d[2], d[2], 0);
      SetBattlerSpriteYOffsetFromOtherYScale(d[15], d[13]);
      if (d[1] === 0) ++d[0];
      break;
    case 2:
      DestroySpriteWithActiveSheet(gSprites[d[15]]);
      ++d[0];
      break;
    case 3:
      FreeOamMatrix(d[14]);
      DestroyAnimVisualTask(taskId);
      break;
  }
}

function AnimPsychoBoost(sprite: Sprite): void {
  switch (sprite.data[0]) {
    case 0:
      sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X);
      sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y);
      if (IsContest()) sprite.y += 12;
      sprite.data[1] = 8;
      SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[1], 16 - sprite.data[1]));
      ++sprite.data[0];
      break;
    case 1:
      if (sprite.affineAnimEnded) {
        PlaySE12WithPanning(C.SE_M_TELEPORT, BattleAnimAdjustPanning(-64));
        ChangeSpriteAffineAnim(sprite, 1);
        ++sprite.data[0];
      }
      break;
    case 2:
      if (sprite.data[2]++ > 1) {
        sprite.data[2] = 0;
        --sprite.data[1];
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[1], 16 - sprite.data[1]));
        if (sprite.data[1] === 0) {
          ++sprite.data[0];
          sprite.invisible = true;
        }
      }
      sprite.data[3] += 0x380;
      sprite.y2 -= sprite.data[3] >> 8;
      sprite.data[3] &= 0xff;
      break;
    case 3:
      SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      DestroyAnimSprite(sprite);
      break;
  }
}

registerAnimSpriteCallbacks({
  AnimDefensiveWall, AnimWallSparkle, AnimBentSpoon, AnimQuestionMark, AnimRedX, AnimSkillSwapOrb, AnimPsychoBoost,
});

registerAnimTasks({
  AnimTask_MeditateStretchAttacker, AnimTask_Teleport, AnimTask_ImprisonOrbs, AnimTask_SkillSwap, AnimTask_ExtrasensoryDistortion,
  AnimTask_TransparentCloneGrowAndShrink,
});
