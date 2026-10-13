// battle_anim_effects_3.c: Black smoke, Mean Look, Psych Up backgrounds,
// Spikes, Leer, Spotlight/Encore, Rapid Spin, Torment, Tri Attack, Baton Pass,
// Wish and twinkling stars, Stockpile/Spit Up/Swallow, Transform, Morning Sun,
// Doom Desire, Frustration, Flail, Pain Split, Flatter, Reversal, Role Play,
// Acid Armor, Yawn, Focus Band, Facade, Glare, Assist, Barrage, Smelling Salts,
// Helping Hand, Foresight, Meteor Mash, Substitute, Block, Odor Sleuth, Snatch,
// Teeter Dance, Knock Off, Recycle, Weather Ball and Slack Off.

import * as C from "../../generated/constants";
import { random } from "../../random";
import { tasks } from "../../gba/tasks";
import { cdata, incbin, incbin16 } from "../../hw/assets";
import { LoadBgTiles } from "../../hw/bg";
import { affineAnimFrom } from "../../hw/cdataSprite";
import { ClearGpuRegBits, GetGpuReg, SetGpuReg, SetGpuRegBits } from "../../hw/gpu";
import {
  BG_PLTT_ID, BlendPalette, FillPalette, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, OBJ_PLTT_ID, PLTT_SIZE_4BPP, RGB_BLACK,
  RGB_WHITE,
} from "../../hw/palette";
import { BLDALPHA_BLEND } from "../../hw/ppu";
import {
  gScanlineEffect, gScanlineEffectRegBuffers, SCANLINE_EFFECT_DMACNT_16BIT, SCANLINE_EFFECT_DMACNT_32BIT, ScanlineEffect_SetParams,
} from "../../hw/scanline";
import {
  ChangeSpriteAffineAnim, CreateSprite, CreateSpriteAndAnimate, DestroySprite, FreeOamMatrix, gSprites, MAX_SPRITES,
  SpriteCallbackDummy, StartSpriteAffineAnim, StartSpriteAnim, ST_OAM_AFFINE_DOUBLE_MASK, ST_OAM_HFLIP, ST_OAM_OBJ_BLEND,
  ST_OAM_OBJ_NORMAL, ST_OAM_OBJ_WINDOW, type Sprite,
} from "../../hw/sprite";
import { Cos, gSineTable, Sin } from "../../hw/trig";
import { GetMonData, gEnemyParty, playerMon } from "../../pokemon/mon";
import {
  ANIM_ATTACKER, ANIM_TARGET, animState, AnimLoadCompressedBgGfx, AnimLoadCompressedBgTilemap, AnimTranslateLinear, ArcTan2Neg,
  CloneBattlerSpriteWithBlend, CreateAdditionalMonSpriteForMoveAnim, DestroyAnimSprite, DestroyAnimVisualTask,
  DestroyAnimVisualTaskAndDisableBlend, DestroySpriteAndFreeResources_, DestroySpriteAndMatrix, DestroySpriteWithActiveSheet,
  GetAnimBattlerSpriteId, GetBattleAnimBg1Data, GetBattleAnimBgDataByPriorityRank, GetBattleBgPaletteNum, GetBattlerSpriteBGPriority,
  GetBattlerSpriteBGPriorityRank, GetBattlerSpriteCoord, GetBattlerSpriteCoordAttr, GetBattlerSpriteSubpriority,
  GetBattlerYCoordWithElevation, InitAndRunAnimFastLinearTranslation, InitAnimArcTranslation, InitAnimLinearTranslation,
  InitBattleAnimBg, InitSpritePosToAnimAttacker, InitSpritePosToAnimTarget, PrepareAffineAnimInTaskData,
  PrepareBattlerSpriteForRotScale, RelocateBattleBgPal, ResetSpriteRotScale, RunAffineAnimFromTaskData, RunStoredCallbackWhenAnimEnds,
  SetAnimSpriteInitialXOffset, SetAverageBattlerPositions, SetBattlerSpriteYOffsetFromRotation, SetBattlerSpriteYOffsetFromYScale,
  SetSpriteCoordsToAnimAttackerCoords, SetSpriteRotScale, StartAnimLinearTranslation, StoreSpriteCallbackInData6,
  TranslateAnimHorizontalArc, TryResetSpriteAffineState, TrySetSpriteRotScale, WaitAnimForDuration,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { BattleAnimAdjustPanning } from "../animScript";
import { HandleSpeciesGfxDataChange, LoadBattleMonGfxAndAnimate, SetBattlerShadowSpriteCallback } from "../gfx_sfx_util";
import { G, gBattleMonForms, gBattlerPartyIndexes, gBattlerSpriteIds, gBattleSpritesDataPtr, gMonSpritesGfxPtr } from "../globals";
import { BG_ANIM_CHAR_BASE_BLOCK, BG_ANIM_MOSAIC, BG_ANIM_PRIORITY, BG_ANIM_SCREEN_SIZE, SetAnimBgAttribute } from "../intro";
import { GetBattlerPosition, GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, PlaySE12WithPanning, PlaySE1WithPanning, s16 } from "./common";
import { DestroyAnimSpriteAfterTimer } from "./flying";
import { SmokescreenImpact } from "./smokescreen";
import { StartMonScrollingBgMask } from "./utilityFuncs";

const IsDoubleBattle = () => !!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE);
const u16 = (v: number) => v & 0xffff;
const WIN_RANGE = (a: number, b: number) => ((a << 8) | b) & 0xffff;
const affineCmds = (name: string) => affineAnimFrom({ $sym: name });

function AnimBlackSmoke(sprite: Sprite): void {
  sprite.x += gBattleAnimArgs[0]!;
  sprite.y += gBattleAnimArgs[1]!;
  if (!gBattleAnimArgs[3]) sprite.data[0] = gBattleAnimArgs[2]!;
  else sprite.data[0] = -gBattleAnimArgs[2]!;
  sprite.data[1] = gBattleAnimArgs[4]!;
  sprite.callback = AnimBlackSmoke_Step;
}

function AnimBlackSmoke_Step(sprite: Sprite): void {
  if (sprite.data[1]! > 0) {
    sprite.x2 = sprite.data[2]! >> 8;
    sprite.data[2]! += sprite.data[0]!;
    sprite.invisible = !sprite.invisible;
    sprite.data[1]!--;
  } else {
    DestroyAnimSprite(sprite);
  }
}

export function AnimTask_SmokescreenImpact(taskId: number): void {
  SmokescreenImpact(
    GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) + 8,
    GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + 8,
    false);
  DestroyAnimVisualTask(taskId);
}

function AnimWhiteHalo(sprite: Sprite): void {
  sprite.data[0] = 90;
  sprite.callback = WaitAnimForDuration;
  sprite.data[1] = 7;
  StoreSpriteCallbackInData6(sprite, AnimWhiteHalo_Step1);
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[1]!, 16 - sprite.data[1]!));
}

function AnimWhiteHalo_Step1(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[1]!, 16 - sprite.data[1]!));
  if (--sprite.data[1]! < 0) {
    sprite.invisible = true;
    sprite.callback = AnimWhiteHalo_Step2;
  }
}

function AnimWhiteHalo_Step2(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
  DestroyAnimSprite(sprite);
}

function AnimTealAlert(sprite: Sprite): void {
  const x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2) & 0xff;
  const y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) & 0xff;
  InitSpritePosToAnimTarget(sprite, true);
  let rotation = u16(ArcTan2Neg(s16(sprite.x - x), s16(sprite.y - y)));
  rotation = u16(rotation + 0x6000);
  if (IsContest()) rotation = u16(rotation + 0x4000);
  TrySetSpriteRotScale(sprite, false, 0x100, 0x100, rotation);
  sprite.data[0] = gBattleAnimArgs[2]!;
  sprite.data[2] = x;
  sprite.data[4] = y;
  sprite.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimMeanLookEye(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
  sprite.data[0] = 4;
  sprite.callback = AnimMeanLookEye_Step1;
}

function AnimMeanLookEye_Step1(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[0]!, 16 - sprite.data[0]!));
  if (sprite.data[1]) sprite.data[0]!--;
  else sprite.data[0]!++;
  if (sprite.data[0] === 15 || sprite.data[0] === 4) sprite.data[1]! ^= 1;
  if (sprite.data[2]!++ > 70) {
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
    StartSpriteAffineAnim(sprite, 1);
    sprite.data[2] = 0;
    sprite.invisible = true;
    sprite.affineAnimPaused = true;
    sprite.callback = AnimMeanLookEye_Step2;
  }
}

function AnimMeanLookEye_Step2(sprite: Sprite): void {
  if (sprite.data[2]!++ > 9) {
    sprite.invisible = false;
    sprite.affineAnimPaused = false;
    if (sprite.affineAnimEnded) sprite.callback = AnimMeanLookEye_Step3;
  }
}

function AnimMeanLookEye_Step3(sprite: Sprite): void {
  switch (sprite.data[3]) {
  case 0:
  case 1:
    sprite.x2 = 1;
    sprite.y2 = 0;
    break;
  case 2:
  case 3:
    sprite.x2 = -1;
    sprite.y2 = 0;
    break;
  case 4:
  case 5:
    sprite.x2 = 0;
    sprite.y2 = 1;
    break;
  case 6:
  default:
    sprite.x2 = 0;
    sprite.y2 = -1;
    break;
  }
  if (++sprite.data[3]! > 7) sprite.data[3] = 0;
  if (sprite.data[4]!++ > 15) {
    sprite.data[0] = 16;
    sprite.data[1] = 0;
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[0]!, 0));
    sprite.callback = AnimMeanLookEye_Step4;
  }
}

function AnimMeanLookEye_Step4(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[0]!, 16 - sprite.data[0]!));
  if (sprite.data[1]!++ > 1) {
    sprite.data[0]!--;
    sprite.data[1] = 0;
  }
  if (sprite.data[0] === 0) sprite.invisible = true;
  if (sprite.data[0]! < 0) {
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
    DestroyAnimSprite(sprite);
  }
}

export function AnimTask_SetPsychicBackground(taskId: number): void {
  gTasks[taskId]!.func = SetPsychicBackground_Step;
  animState.gAnimVisualTaskCount--;
}

function rotateBgColors(buf: Uint16Array, paletteIndex: number): void {
  const lastColor = buf[BG_PLTT_ID(paletteIndex) + 11]!;
  for (let i = 10; i > 0; i--) buf[BG_PLTT_ID(paletteIndex) + i + 1] = buf[BG_PLTT_ID(paletteIndex) + i]!;
  buf[BG_PLTT_ID(paletteIndex) + 1] = lastColor;
}

function SetPsychicBackground_Step(taskId: number): void {
  const paletteIndex = GetBattleBgPaletteNum() & 0xff;
  const t = gTasks[taskId]!;
  if (++t.data[5]! === 4) {
    rotateBgColors(gPlttBufferFaded, paletteIndex);
    t.data[5] = 0;
  }
  if (u16(gBattleAnimArgs[7]!) === 0xffff) tasks.destroy(taskId);
}

export function AnimTask_FadeScreenToWhite(taskId: number): void {
  gTasks[taskId]!.func = FadeScreenToWhite_Step;
  animState.gAnimVisualTaskCount--;
}

function FadeScreenToWhite_Step(taskId: number): void {
  const paletteIndex = GetBattleBgPaletteNum() & 0xff;
  const t = gTasks[taskId]!;
  if (++t.data[5]! === 4) {
    rotateBgColors(gPlttBufferFaded, paletteIndex);
    rotateBgColors(gPlttBufferUnfaded, paletteIndex);
    t.data[5] = 0;
  }
  if (u16(gBattleAnimArgs[7]!) === 0xffff) tasks.destroy(taskId);
}

function AnimSpikes(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, true);
  const pos = SetAverageBattlerPositions(animState.gBattleAnimTarget, false);
  const x = u16(pos.x);
  const y = u16(pos.y);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) gBattleAnimArgs[2] = -gBattleAnimArgs[2]!;
  sprite.data[0] = gBattleAnimArgs[4]!;
  sprite.data[2] = x + gBattleAnimArgs[2]!;
  sprite.data[4] = y + gBattleAnimArgs[3]!;
  sprite.data[5] = -50;
  InitAnimArcTranslation(sprite);
  sprite.callback = AnimSpikes_Step1;
}

function AnimSpikes_Step1(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) {
    sprite.data[0] = 30;
    sprite.data[1] = 0;
    sprite.callback = WaitAnimForDuration;
    StoreSpriteCallbackInData6(sprite, AnimSpikes_Step2);
  }
}

function AnimSpikes_Step2(sprite: Sprite): void {
  if (sprite.data[1]! & 1) sprite.invisible = !sprite.invisible;
  if (++sprite.data[1]! === 16) DestroyAnimSprite(sprite);
}

function AnimLeer(sprite: Sprite): void {
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  SetAnimSpriteInitialXOffset(sprite, gBattleAnimArgs[0]!);
  sprite.y += gBattleAnimArgs[1]!;
  sprite.callback = RunStoredCallbackWhenAnimEnds;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
}

function AnimLetterZ(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    SetSpriteCoordsToAnimAttackerCoords(sprite);
    SetAnimSpriteInitialXOffset(sprite, gBattleAnimArgs[0]!);
    if (!IsContest()) {
      if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
        sprite.data[1] = gBattleAnimArgs[2]!;
        sprite.data[2] = gBattleAnimArgs[3]!;
      } else {
        sprite.data[1] = -1 * gBattleAnimArgs[2]!;
        sprite.data[2] = -1 * gBattleAnimArgs[3]!;
      }
    } else {
      sprite.data[1] = -1 * gBattleAnimArgs[2]!;
      sprite.data[2] = gBattleAnimArgs[3]!;
    }
  }
  sprite.data[0]!++;
  const var0 = (sprite.data[0]! * 20) & 0xff;
  sprite.data[3]! += sprite.data[1]!;
  sprite.data[4]! += sprite.data[2]!;
  sprite.x2 = Math.trunc(sprite.data[3]! / 2);
  sprite.y2 = Sin(var0 & 0xff, 5) + Math.trunc(sprite.data[4]! / 2);
  if (u16(sprite.x + sprite.x2) > 240) DestroyAnimSprite(sprite);
}

function AnimFang(sprite: Sprite): void {
  if (sprite.animEnded) DestroyAnimSprite(sprite);
}

export function AnimTask_IsTargetPlayerSide(taskId: number): void {
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_OPPONENT) gBattleAnimArgs[C.ARG_RET_ID] = 0;
  else gBattleAnimArgs[C.ARG_RET_ID] = 1;
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_IsHealingMove(taskId: number): void {
  if (animState.gAnimMoveDmg > 0) gBattleAnimArgs[C.ARG_RET_ID] = 0;
  else gBattleAnimArgs[C.ARG_RET_ID] = 1;
  DestroyAnimVisualTask(taskId);
}

function AnimSpotlight(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_WINOUT, C.WINOUT_WIN01_BG_ALL | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR | C.WINOUT_WINOBJ_BG_ALL | C.WINOUT_WINOBJ_OBJ);
  SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_OBJWIN_ON);
  G.gBattle_WIN0H = 0;
  G.gBattle_WIN0V = 0;
  SetGpuReg(C.REG_OFFSET_WIN0H, G.gBattle_WIN0H);
  SetGpuReg(C.REG_OFFSET_WIN0V, G.gBattle_WIN0V);
  InitSpritePosToAnimTarget(sprite, false);
  sprite.oam.objMode = ST_OAM_OBJ_WINDOW;
  sprite.invisible = true;
  sprite.callback = AnimSpotlight_Step1;
}

function AnimSpotlight_Step1(sprite: Sprite): void {
  switch (sprite.data[0]) {
  case 0:
    sprite.invisible = false;
    if (sprite.affineAnimEnded) sprite.data[0]!++;
    break;
  case 1:
  case 3:
    sprite.data[1]! += 117;
    sprite.x2 = sprite.data[1]! >> 8;
    if (++sprite.data[2]! === 21) {
      sprite.data[2] = 0;
      sprite.data[0]!++;
    }
    break;
  case 2:
    sprite.data[1]! -= 117;
    sprite.x2 = sprite.data[1]! >> 8;
    if (++sprite.data[2]! === 41) {
      sprite.data[2] = 0;
      sprite.data[0]!++;
    }
    break;
  case 4:
    ChangeSpriteAffineAnim(sprite, 1);
    sprite.data[0]!++;
    break;
  case 5:
    if (sprite.affineAnimEnded) {
      sprite.invisible = true;
      sprite.callback = AnimSpotlight_Step2;
    }
    break;
  }
}

function AnimSpotlight_Step2(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_WINOUT, C.WINOUT_WIN01_BG_ALL | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR | C.WINOUT_WINOBJ_BG_ALL | C.WINOUT_WINOBJ_OBJ | C.WINOUT_WINOBJ_CLR);
  SetGpuReg(C.REG_OFFSET_DISPCNT, GetGpuReg(C.REG_OFFSET_DISPCNT) ^ C.DISPCNT_OBJWIN_ON);
  DestroyAnimSprite(sprite);
}

function AnimClappingHand(sprite: Sprite): void {
  if (gBattleAnimArgs[3] === 0) {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X);
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y);
  }
  sprite.x += gBattleAnimArgs[0]!;
  sprite.y += gBattleAnimArgs[1]!;
  sprite.oam.tileNum += 16;
  if (gBattleAnimArgs[2] === 0) {
    sprite.oam.matrixNum = ST_OAM_HFLIP;
    sprite.x2 = -12;
    sprite.data[1] = 2;
  } else {
    sprite.x2 = 12;
    sprite.data[1] = -2;
  }
  sprite.data[0] = gBattleAnimArgs[4]!;
  if (sprite.data[3] !== 255) sprite.data[3] = gBattleAnimArgs[2]!;
  sprite.callback = AnimClappingHand_Step;
}

function AnimClappingHand_Step(sprite: Sprite): void {
  if (sprite.data[2] === 0) {
    sprite.x2 += sprite.data[1]!;
    if (sprite.x2 === 0) {
      sprite.data[2]!++;
      if (sprite.data[3] === 0) PlaySE1WithPanning(C.SE_M_ENCORE, BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER));
    }
  } else {
    sprite.x2 -= sprite.data[1]!;
    if (Math.abs(sprite.x2) === 12) {
      sprite.data[0]!--;
      sprite.data[2]!--;
    }
  }
  if (sprite.data[0] === 0) DestroyAnimSprite(sprite);
}

function AnimClappingHand2(sprite: Sprite): void {
  sprite.oam.objMode = ST_OAM_OBJ_WINDOW;
  sprite.data[3] = 255;
  AnimClappingHand(sprite);
}

export function AnimTask_CreateSpotlight(taskId: number): void {
  if (IsContest()) {
    SetGpuReg(C.REG_OFFSET_WININ, C.WININ_WIN1_OBJ | C.WININ_WIN1_BG_ALL | C.WININ_WIN0_CLR | C.WININ_WIN0_OBJ | C.WININ_WIN0_BG_ALL);
    G.gBattle_WIN1H = WIN_RANGE(152, C.DISPLAY_WIDTH);
    G.gBattle_WIN1V = WIN_RANGE(0, C.DISPLAY_HEIGHT);
    SetGpuReg(C.REG_OFFSET_WIN1H, G.gBattle_WIN0H);
    SetGpuReg(C.REG_OFFSET_WIN1V, G.gBattle_WIN0V);
  } else {
    SetGpuReg(C.REG_OFFSET_WININ, C.WININ_WIN0_BG_ALL | C.WININ_WIN0_OBJ | C.WININ_WIN0_CLR | C.WININ_WIN1_BG_ALL | C.WININ_WIN1_OBJ);
    G.gBattle_WIN1H = WIN_RANGE(0, C.DISPLAY_WIDTH);
    G.gBattle_WIN1V = WIN_RANGE(120, C.DISPLAY_HEIGHT);
    SetGpuReg(C.REG_OFFSET_WIN1H, G.gBattle_WIN1H);
    SetGpuReg(C.REG_OFFSET_WIN1V, G.gBattle_WIN1V);
    SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_WIN1_ON);
  }
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_RemoveSpotlight(taskId: number): void {
  SetGpuReg(C.REG_OFFSET_WININ, C.WININ_WIN0_BG_ALL | C.WININ_WIN0_OBJ | C.WININ_WIN0_CLR | C.WININ_WIN1_BG_ALL | C.WININ_WIN1_OBJ | C.WININ_WIN1_CLR);
  G.gBattle_WIN1H = 0;
  G.gBattle_WIN1V = 0;
  if (!IsContest()) ClearGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_WIN1_ON);
  DestroyAnimVisualTask(taskId);
}

function AnimRapidSpin(sprite: Sprite): void {
  if (gBattleAnimArgs[0] === 0) {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X) + gBattleAnimArgs[1]!;
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y);
  } else {
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X) + gBattleAnimArgs[1]!;
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y);
  }
  sprite.y2 = gBattleAnimArgs[2]!;
  sprite.data[0] = sprite.y2 > gBattleAnimArgs[3]! ? 1 : 0;
  sprite.data[1] = 0;
  sprite.data[2] = gBattleAnimArgs[4]!;
  sprite.data[3] = gBattleAnimArgs[5]!;
  sprite.data[4] = gBattleAnimArgs[3]!;
  sprite.callback = AnimRapidSpin_Step;
}

function AnimRapidSpin_Step(sprite: Sprite): void {
  sprite.data[1] = (sprite.data[1]! + sprite.data[2]!) & 0xff;
  sprite.x2 = gSineTable[sprite.data[1]!]! >> 4;
  sprite.y2 += sprite.data[3]!;
  if (sprite.data[0]) {
    if (sprite.y2 < sprite.data[4]!) DestroyAnimSprite(sprite);
  } else {
    if (sprite.y2 > sprite.data[4]!) DestroyAnimSprite(sprite);
  }
}

export function AnimTask_RapinSpinMonElevation(taskId: number): void {
  const task = gTasks[taskId]!;
  let var0: number;
  let toBG2: number;
  if (!gBattleAnimArgs[0]) {
    var0 = s16(GetBattlerYCoordWithElevation(animState.gBattleAnimAttacker));
    toBG2 = GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker);
  } else {
    var0 = s16(GetBattlerYCoordWithElevation(animState.gBattleAnimTarget));
    toBG2 = GetBattlerSpriteBGPriorityRank(animState.gBattleAnimTarget);
  }

  task.data[0] = var0 + 36;
  task.data[1] = task.data[0]!;
  task.data[2] = var0 - 33;
  if (task.data[2]! < 0) task.data[2] = 0;
  task.data[3] = task.data[0]!;
  task.data[4] = 8;
  task.data[5] = gBattleAnimArgs[1]!;
  task.data[6] = 0;
  task.data[7] = 0;
  const var3 = toBG2 === 1 ? G.gBattle_BG1_X : G.gBattle_BG2_X;
  task.data[8] = s16(var3);
  const var4 = var3 + C.DISPLAY_WIDTH;
  task.data[9] = s16(var4);
  task.data[10] = gBattleAnimArgs[2]!;
  let var2: number;
  if (!gBattleAnimArgs[2]) {
    task.data[11] = s16(var4);
    var2 = task.data[8]!;
  } else {
    task.data[11] = s16(var3);
    var2 = task.data[9]!;
  }

  task.data[15] = 0;
  for (let i = task.data[2]!; i <= task.data[3]!; i++) {
    gScanlineEffectRegBuffers[0]![i] = var2;
    gScanlineEffectRegBuffers[1]![i] = var2;
  }
  const dmaDest = toBG2 === 1 ? C.REG_OFFSET_BG1HOFS : C.REG_OFFSET_BG2HOFS;
  ScanlineEffect_SetParams({ dmaDest, dmaControl: SCANLINE_EFFECT_DMACNT_16BIT, initState: 1, unused9: 0 });
  task.func = RapinSpinMonElevation_Step;
}

function RapinSpinMonElevation_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[0]! -= task.data[5]!;
  if (task.data[0]! < task.data[2]!) task.data[0] = task.data[2]!;

  if (task.data[4] === 0) {
    task.data[1]! -= task.data[5]!;
    if (task.data[1]! < task.data[2]!) {
      task.data[1] = task.data[2]!;
      task.data[15] = 1;
    }
  } else {
    task.data[4]!--;
  }

  if (++task.data[6]! > 1) {
    task.data[6] = 0;
    task.data[7] = task.data[7] === 0 ? 1 : 0;
    if (task.data[7]) task.data[12] = task.data[8]!;
    else task.data[12] = task.data[9]!;
  }

  for (let i = task.data[0]!; i < task.data[1]!; i++) {
    gScanlineEffectRegBuffers[0]![i] = task.data[12]!;
    gScanlineEffectRegBuffers[1]![i] = task.data[12]!;
  }
  for (let i = task.data[1]!; i <= task.data[3]!; i++) {
    gScanlineEffectRegBuffers[0]![i] = task.data[11]!;
    gScanlineEffectRegBuffers[1]![i] = task.data[11]!;
  }

  if (task.data[15]) {
    if (task.data[10]) gScanlineEffect.state = 3;
    DestroyAnimVisualTask(taskId);
  }
}

export function AnimTask_TormentAttacker(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[0] = 0;
  task.data[1] = 0;
  task.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  task.data[3] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  task.data[4] = 32;
  task.data[5] = -20;
  task.data[6] = 0;
  task.data[15] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.func = TormentAttacker_Step;
}

function TormentAttacker_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  switch (task.data[0]) {
  case 0: {
    const var0 = task.data[2]!;
    const var1 = task.data[4]!;
    const x = s16(task.data[1]! & 1 ? var0 - var1 : var0 + var1);
    const y = s16(task.data[3]! + task.data[5]!);
    const spriteId = CreateSprite(animTemplate("gThoughtBubbleSpriteTemplate"), x, y, (6 - task.data[1]!) & 0xff);
    PlaySE12WithPanning(C.SE_M_METRONOME, BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER));
    if (spriteId !== MAX_SPRITES) {
      gSprites[spriteId]!.hFlip = task.data[1]! & 1;
      gSprites[spriteId]!.callback = SpriteCallbackDummy;
    }
    if (task.data[1]! & 1) {
      task.data[4]! -= 6;
      task.data[5]! -= 6;
    }
    PrepareAffineAnimInTaskData(task, task.data[15]!, affineCmds("sAffineAnims_Torment"));
    task.data[1]!++;
    task.data[0] = 1;
    break;
  }
  case 1:
    if (!RunAffineAnimFromTaskData(task)) {
      if (task.data[1] === 6) {
        task.data[6] = 8;
        task.data[0] = 3;
      } else {
        if (task.data[1]! <= 2) task.data[6] = 10;
        else task.data[6] = 0;
        task.data[0] = 2;
      }
    }
    break;
  case 2:
    if (task.data[6] !== 0) task.data[6]!--;
    else task.data[0] = 0;
    break;
  case 3:
    if (task.data[6] !== 0) task.data[6]!--;
    else task.data[0] = 4;
    break;
  case 4: {
    const template = animTemplate("gThoughtBubbleSpriteTemplate");
    let j = 0;
    for (let i = 0; i < MAX_SPRITES; i++) {
      if (gSprites[i]!.template === template) {
        gSprites[i]!.data[0] = taskId;
        gSprites[i]!.data[1] = 6;
        StartSpriteAnim(gSprites[i]!, 2);
        gSprites[i]!.callback = TormentAttacker_Callback;
        if (++j === 6) break;
      }
    }
    task.data[6] = j;
    task.data[0] = 5;
    break;
  }
  case 5:
    if (task.data[6] === 0) DestroyAnimVisualTask(taskId);
    break;
  }
}

function TormentAttacker_Callback(sprite: Sprite): void {
  if (sprite.animEnded) {
    gTasks[sprite.data[0]!]!.data[sprite.data[1]!]!--;
    DestroySprite(sprite);
  }
}

function AnimTriAttackTriangle(sprite: Sprite): void {
  if (sprite.data[0] === 0) InitSpritePosToAnimAttacker(sprite, false);
  if (++sprite.data[0]! < 40) {
    const v = u16(sprite.data[0]!);
    sprite.invisible = (v & 1) === 0;
  }
  if (sprite.data[0]! > 30) sprite.invisible = false;
  if (sprite.data[0] === 61) {
    StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
    sprite.x += sprite.x2;
    sprite.y += sprite.y2;
    sprite.x2 = 0;
    sprite.y2 = 0;
    sprite.data[0] = 20;
    sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
    sprite.data[4] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
    sprite.callback = StartAnimLinearTranslation;
  }
}

export function AnimTask_DefenseCurlDeformMon(taskId: number): void {
  const t = gTasks[taskId]!;
  switch (t.data[0]) {
  case 0:
    PrepareAffineAnimInTaskData(t, GetAnimBattlerSpriteId(ANIM_ATTACKER), affineCmds("DefenseCurlDeformMonAffineAnimCmds"));
    t.data[0]!++;
    break;
  case 1:
    if (!RunAffineAnimFromTaskData(t)) DestroyAnimVisualTask(taskId);
    break;
  }
}

function AnimBatonPassPokeball(sprite: Sprite): void {
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  switch (sprite.data[0]) {
  case 0:
    sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
    sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
    PrepareBattlerSpriteForRotScale(spriteId, ST_OAM_OBJ_NORMAL);
    sprite.data[1] = 256;
    sprite.data[2] = 256;
    sprite.data[0]!++;
    break;
  case 1:
    sprite.data[1]! += 96;
    sprite.data[2]! -= 26;
    SetSpriteRotScale(spriteId, sprite.data[1]!, sprite.data[2]!, 0);
    if (++sprite.data[3]! === 5) sprite.data[0]!++;
    // fall through
  case 2:
    sprite.data[1]! += 96;
    sprite.data[2]! += 48;
    SetSpriteRotScale(spriteId, sprite.data[1]!, sprite.data[2]!, 0);
    if (++sprite.data[3]! === 9) {
      sprite.data[3] = 0;
      gSprites[spriteId]!.invisible = true;
      ResetSpriteRotScale(spriteId);
      sprite.data[0]!++;
    }
    break;
  case 3:
    sprite.y2 -= 6;
    if (sprite.y + sprite.y2 < -32) DestroyAnimSprite(sprite);
    break;
  }
}

export function AnimWishStar(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x = -16;
  else sprite.x = C.DISPLAY_WIDTH + 16;
  sprite.y = 0;
  sprite.callback = AnimWishStar_Step;
}

function AnimWishStar_Step(sprite: Sprite): void {
  sprite.data[0]! += 72;
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x2 = sprite.data[0]! >> 4;
  else sprite.x2 = -(sprite.data[0]! >> 4);
  sprite.data[1]! += 16;
  sprite.y2 += sprite.data[1]! >> 8;
  if (++sprite.data[2]! % 3 === 0) {
    CreateSpriteAndAnimate(animTemplate("gMiniTwinklingStarSpriteTemplate"), sprite.x + sprite.x2, sprite.y + sprite.y2, (sprite.subpriority + 1) & 0xff);
  }
  const newX = (sprite.x + sprite.x2 + 32) >>> 0;
  if (newX > C.DISPLAY_WIDTH + 64) DestroyAnimSprite(sprite);
}

export function AnimMiniTwinklingStar(sprite: Sprite): void {
  const rand = random() & 3;
  if (rand === 0) sprite.oam.tileNum += 4;
  else sprite.oam.tileNum += 5;
  let y = random() & 7;
  if (y > 3) y = -y;
  sprite.y2 = y;
  sprite.callback = AnimMiniTwinklingStar_Step;
}

function AnimMiniTwinklingStar_Step(sprite: Sprite): void {
  if (++sprite.data[0]! < 30) {
    if (++sprite.data[1]! === 2) {
      sprite.invisible = !sprite.invisible;
      sprite.data[1] = 0;
    }
  } else {
    if (sprite.data[1] === 2) sprite.invisible = false;
    if (sprite.data[1] === 3) {
      sprite.invisible = true;
      sprite.data[1] = -1;
    }
    sprite.data[1]!++;
  }
  if (sprite.data[0]! > 60) DestroySprite(sprite);
}

function runDeformTask(taskId: number, cmdsName: string): void {
  const t = gTasks[taskId]!;
  if (!t.data[0]) {
    PrepareAffineAnimInTaskData(t, GetAnimBattlerSpriteId(ANIM_ATTACKER), affineCmds(cmdsName));
    t.data[0]!++;
  } else if (!RunAffineAnimFromTaskData(t)) {
    DestroyAnimVisualTask(taskId);
  }
}

export function AnimTask_StockpileDeformMon(taskId: number): void {
  runDeformTask(taskId, "sStockpileDeformMonAffineAnimCmds");
}

export function AnimTask_SpitUpDeformMon(taskId: number): void {
  runDeformTask(taskId, "sSpitUpDeformMonAffineAnimCmds");
}

function AnimSwallowBlueOrb(sprite: Sprite): void {
  switch (sprite.data[0]) {
  case 0:
    InitSpritePosToAnimAttacker(sprite, false);
    sprite.data[1] = 0x900;
    sprite.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
    sprite.data[0]!++;
    break;
  case 1:
    sprite.y2 -= sprite.data[1]! >> 8;
    sprite.data[1]! -= 96;
    if (sprite.y + sprite.y2 > sprite.data[2]!) DestroyAnimSprite(sprite);
    break;
  }
}

export function AnimTask_SwallowDeformMon(taskId: number): void {
  runDeformTask(taskId, "sSwallowDeformMonAffineAnimCmds");
}

export function AnimTask_TransformMon(taskId: number): void {
  const t = gTasks[taskId]!;
  const a = animState;
  switch (t.data[0]) {
  case 0:
    SetGpuReg(C.REG_OFFSET_MOSAIC, 0);
    if (GetBattlerSpriteBGPriorityRank(a.gBattleAnimAttacker) === 1) SetAnimBgAttribute(1, BG_ANIM_MOSAIC, 1);
    else SetAnimBgAttribute(2, BG_ANIM_MOSAIC, 1);
    t.data[10] = gBattleAnimArgs[0]!;
    t.data[0]!++;
    break;
  case 1:
    if (t.data[2]!++ > 1) {
      t.data[2] = 0;
      t.data[1]!++;
      const stretch = u16(t.data[1]!);
      SetGpuReg(C.REG_OFFSET_MOSAIC, (stretch << 4) | stretch);
      if (stretch === 15) t.data[0]!++;
    }
    break;
  case 2: {
    HandleSpeciesGfxDataChange(a.gBattleAnimAttacker, a.gBattleAnimTarget, t.data[10]!);
    const animBg = GetBattleAnimBgDataByPriorityRank();
    const position = IsContest() ? 0 : GetBattlerPosition(a.gBattleAnimAttacker);
    const src = gMonSpritesGfxPtr.sprites[position]!;
    const offset = gBattleMonForms[a.gBattleAnimAttacker]! << 11;
    animBg.bgTiles.set(src.subarray(offset, offset + C.MON_PIC_SIZE));
    LoadBgTiles(1, animBg.bgTiles, 0x800, animBg.tilesOffset);
    t.data[0]!++;
    break;
  }
  case 3:
    if (t.data[2]!++ > 1) {
      t.data[2] = 0;
      t.data[1]!--;
      const stretch = u16(t.data[1]!);
      SetGpuReg(C.REG_OFFSET_MOSAIC, (stretch << 4) | stretch);
      if (stretch === 0) t.data[0]!++;
    }
    break;
  case 4:
    SetGpuReg(C.REG_OFFSET_MOSAIC, 0);
    if (GetBattlerSpriteBGPriorityRank(a.gBattleAnimAttacker) === 1) SetAnimBgAttribute(1, BG_ANIM_MOSAIC, 0);
    else SetAnimBgAttribute(2, BG_ANIM_MOSAIC, 0);
    if (!IsContest()) {
      if (GetBattlerSide(a.gBattleAnimAttacker) === C.B_SIDE_OPPONENT) {
        if (t.data[10] === 0)
          SetBattlerShadowSpriteCallback(a.gBattleAnimAttacker, gBattleSpritesDataPtr.battlerData[a.gBattleAnimAttacker]!.transformSpecies);
      }
    }
    DestroyAnimVisualTask(taskId);
    break;
  }
}

export function AnimTask_IsMonInvisible(taskId: number): void {
  gBattleAnimArgs[C.ARG_RET_ID] = gSprites[gBattlerSpriteIds[animState.gBattleAnimAttacker]!]!.invisible ? 1 : 0;
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_CastformGfxChange(taskId: number): void {
  HandleSpeciesGfxDataChange(animState.gBattleAnimAttacker, animState.gBattleAnimTarget, 1);
  DestroyAnimVisualTask(taskId);
}

function loadMorningSunBg(): ReturnType<typeof GetBattleAnimBg1Data> {
  const animBg = GetBattleAnimBg1Data();
  AnimLoadCompressedBgTilemap(animBg.bgId, incbin16("gBattleAnim_MorningSunTilemap"));
  AnimLoadCompressedBgGfx(animBg.bgId, incbin("gBattleAnim_MorningSunGfx"), animBg.tilesOffset);
  LoadPalette(incbin("gBattleAnim_MorningSunPal"), BG_PLTT_ID(animBg.paletteId), PLTT_SIZE_4BPP);
  return animBg;
}

const sMorningSunLightBeamCoordsTable = () => cdata<number[]>("battle_anim_effects_3", "sMorningSunLightBeamCoordsTable");

export function AnimTask_MorningSunLightBeam(taskId: number): void {
  const t = gTasks[taskId]!;
  switch (t.data[0]) {
  case 0: {
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG1);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
    SetAnimBgAttribute(1, BG_ANIM_SCREEN_SIZE, 0);
    SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
    if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 1);
    const animBg = loadMorningSunBg();
    if (IsContest()) {
      RelocateBattleBgPal(animBg.paletteId, animBg.bgTilemap, 0, false);
      G.gBattle_BG1_X = -56;
      G.gBattle_BG1_Y = 0;
    } else {
      if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) G.gBattle_BG1_X = -135;
      else G.gBattle_BG1_X = -10;
      G.gBattle_BG1_Y = 0;
    }
    t.data[10] = s16(G.gBattle_BG1_X);
    t.data[11] = s16(G.gBattle_BG1_Y);
    t.data[0]!++;
    PlaySE12WithPanning(C.SE_M_MORNING_SUN, BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER));
    break;
  }
  case 1:
    if (t.data[4]!++ > 0) {
      t.data[4] = 0;
      if (++t.data[1]! > 12) t.data[1] = 12;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(t.data[1]!, 16 - t.data[1]!));
      if (t.data[1] === 12) t.data[0]!++;
    }
    break;
  case 2:
    if (--t.data[1]! < 0) t.data[1] = 0;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(t.data[1]!, 16 - t.data[1]!));
    if (!t.data[1]) {
      G.gBattle_BG1_X = sMorningSunLightBeamCoordsTable()[t.data[2]!]! + t.data[10]!;
      if (++t.data[2]! === 4) t.data[0] = 4;
      else t.data[0] = 3;
    }
    break;
  case 3:
    if (++t.data[3]! === 4) {
      t.data[3] = 0;
      t.data[0] = 1;
      PlaySE12WithPanning(C.SE_M_MORNING_SUN, BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER));
    }
    break;
  case 4: {
    const animBg = GetBattleAnimBg1Data();
    InitBattleAnimBg(animBg.bgId);
    if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 0);
    SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
    G.gBattle_BG1_X = 0;
    G.gBattle_BG1_Y = 0;
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
    DestroyAnimVisualTask(taskId);
    break;
  }
  }
}

function AnimGreenStar(sprite: Sprite): void {
  let xOffset = s16(random());
  xOffset &= 0x3f;
  if (xOffset > 31) xOffset = 32 - xOffset;

  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X) + xOffset;
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y) + 32;
  sprite.data[1] = gBattleAnimArgs[0]!;
  sprite.data[2] = gBattleAnimArgs[1]!;

  const template = animTemplate("gGreenStarSpriteTemplate");
  const spriteId1 = CreateSprite(template, sprite.x, sprite.y, (sprite.subpriority + 1) & 0xff);
  const spriteId2 = CreateSprite(template, sprite.x, sprite.y, (sprite.subpriority + 1) & 0xff);
  StartSpriteAnim(gSprites[spriteId1]!, 1);
  StartSpriteAnim(gSprites[spriteId2]!, 2);

  for (const id of [spriteId1, spriteId2]) {
    gSprites[id]!.data[1] = gBattleAnimArgs[0]!;
    gSprites[id]!.data[2] = gBattleAnimArgs[1]!;
    gSprites[id]!.data[7] = -1;
    gSprites[id]!.invisible = true;
    gSprites[id]!.callback = AnimGreenStar_Callback;
  }

  sprite.data[6] = spriteId1;
  sprite.data[7] = spriteId2;
  sprite.callback = AnimGreenStar_Step1;
}

function AnimGreenStar_Step1(sprite: Sprite): void {
  const delta = s16(sprite.data[3]! + sprite.data[2]!);
  sprite.y2 -= delta >> 8;
  sprite.data[3]! += sprite.data[2]!;
  sprite.data[3]! &= 0xff;
  if (sprite.data[4] === 0 && sprite.y2 < -8) {
    gSprites[sprite.data[6]!]!.invisible = false;
    sprite.data[4]!++;
  }
  if (sprite.data[4] === 1 && sprite.y2 < -16) {
    gSprites[sprite.data[7]!]!.invisible = false;
    sprite.data[4]!++;
  }
  if (--sprite.data[1]! === -1) {
    sprite.invisible = true;
    sprite.callback = AnimGreenStar_Step2;
  }
}

function AnimGreenStar_Step2(sprite: Sprite): void {
  if (gSprites[sprite.data[6]!]!.callback === SpriteCallbackDummy && gSprites[sprite.data[7]!]!.callback === SpriteCallbackDummy) {
    DestroySprite(gSprites[sprite.data[6]!]!);
    DestroySprite(gSprites[sprite.data[7]!]!);
    DestroyAnimSprite(sprite);
  }
}

function AnimGreenStar_Callback(sprite: Sprite): void {
  if (!sprite.invisible) {
    const delta = s16(sprite.data[3]! + sprite.data[2]!);
    sprite.y2 -= delta >> 8;
    sprite.data[3]! += sprite.data[2]!;
    sprite.data[3]! &= 0xff;
    if (--sprite.data[1]! === -1) {
      sprite.invisible = true;
      sprite.callback = SpriteCallbackDummy;
    }
  }
}

const sDoomDesireLightBeamCoordTable = () => cdata<number[]>("battle_anim_effects_3", "sDoomDesireLightBeamCoordTable");
const sDoomDesireLightBeamDelayTable = () => cdata<number[]>("battle_anim_effects_3", "sDoomDesireLightBeamDelayTable");

export function AnimTask_DoomDesireLightBeam(taskId: number): void {
  const t = gTasks[taskId]!;
  switch (t.data[0]) {
  case 0: {
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG1);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(3, 13));
    SetAnimBgAttribute(1, BG_ANIM_SCREEN_SIZE, 0);
    SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
    if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 1);
    const animBg = loadMorningSunBg();
    if (IsContest()) {
      RelocateBattleBgPal(animBg.paletteId, animBg.bgTilemap, 0, false);
      G.gBattle_BG1_X = -56;
      G.gBattle_BG1_Y = 0;
    } else {
      const position = GetBattlerPosition(animState.gBattleAnimTarget);
      if (IsDoubleBattle()) {
        if (position === C.B_POSITION_OPPONENT_LEFT) G.gBattle_BG1_X = -155;
        if (position === C.B_POSITION_OPPONENT_RIGHT) G.gBattle_BG1_X = -115;
        if (position === C.B_POSITION_PLAYER_LEFT) G.gBattle_BG1_X = 14;
        if (position === C.B_POSITION_PLAYER_RIGHT) G.gBattle_BG1_X = -20;
      } else {
        if (position === C.B_POSITION_OPPONENT_LEFT) G.gBattle_BG1_X = -135;
        if (position === C.B_POSITION_PLAYER_LEFT) G.gBattle_BG1_X = -10;
      }
      G.gBattle_BG1_Y = 0;
    }
    t.data[10] = s16(G.gBattle_BG1_X);
    t.data[11] = s16(G.gBattle_BG1_Y);
    t.data[0]!++;
    break;
  }
  case 1:
    t.data[3] = 0;
    if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_OPPONENT)
      G.gBattle_BG1_X = t.data[10]! + sDoomDesireLightBeamCoordTable()[t.data[2]!]!;
    else
      G.gBattle_BG1_X = t.data[10]! - sDoomDesireLightBeamCoordTable()[t.data[2]!]!;
    if (++t.data[2]! === 5) t.data[0] = 5;
    else t.data[0]!++;
    break;
  case 2:
    if (--t.data[1]! <= 4) t.data[1] = 5;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(3, t.data[1]!));
    if (t.data[1] === 5) t.data[0]!++;
    break;
  case 3:
    if (++t.data[3]! > sDoomDesireLightBeamDelayTable()[t.data[2]!]!) t.data[0]!++;
    break;
  case 4:
    if (++t.data[1]! > 13) t.data[1] = 13;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(3, t.data[1]!));
    if (t.data[1] === 13) t.data[0] = 1;
    break;
  case 5: {
    const animBg = GetBattleAnimBg1Data();
    InitBattleAnimBg(animBg.bgId);
    if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 0);
    SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
    G.gBattle_BG1_X = 0;
    G.gBattle_BG1_Y = 0;
    SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
    DestroyAnimVisualTask(taskId);
    break;
  }
  }
}

// Briefly vertically grows and shrinks the attacking mon's sprite.
export function AnimTask_StrongFrustrationGrowAndShrink(taskId: number): void {
  const t = gTasks[taskId]!;
  if (t.data[0] === 0) {
    PrepareAffineAnimInTaskData(t, GetAnimBattlerSpriteId(ANIM_ATTACKER), affineCmds("sStrongFrustrationAffineAnimCmds"));
    t.data[0]!++;
  } else if (!RunAffineAnimFromTaskData(t)) {
    DestroyAnimVisualTask(taskId);
  }
}

// Animates an anger mark near the mon's head.
function AnimWeakFrustrationAngerMark(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    InitSpritePosToAnimAttacker(sprite, false);
    sprite.data[0]!++;
  } else if (sprite.data[0]!++ > 20) {
    sprite.data[1]! += 160;
    sprite.data[2]! += 128;
    if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) sprite.x2 = -(sprite.data[1]! >> 8);
    else sprite.x2 = sprite.data[1]! >> 8;
    sprite.y2 += sprite.data[2]! >> 8;
    if (sprite.y2 > 64) DestroyAnimSprite(sprite);
  }
}

// Rocks the mon back and forth. This is done on a pivot so it is done via rotation.
export function AnimTask_RockMonBackAndForth(taskId: number): void {
  const task = gTasks[taskId]!;
  if (!gBattleAnimArgs[1]) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  if (gBattleAnimArgs[2]! < 0) gBattleAnimArgs[2] = 0;
  if (gBattleAnimArgs[2]! > 2) gBattleAnimArgs[2] = 2;

  task.data[0] = 0;
  task.data[1] = 0;
  task.data[2] = 0;
  task.data[3] = 8 - 2 * gBattleAnimArgs[2]!;
  task.data[4] = 0x100 + gBattleAnimArgs[2]! * 128;
  task.data[5] = gBattleAnimArgs[2]! + 2;
  task.data[6] = gBattleAnimArgs[1]! - 1;
  task.data[15] = GetAnimBattlerSpriteId(gBattleAnimArgs[0]!);

  const side = gBattleAnimArgs[0] === ANIM_ATTACKER ? GetBattlerSide(animState.gBattleAnimAttacker) : GetBattlerSide(animState.gBattleAnimTarget);
  if (side === C.B_SIDE_OPPONENT) {
    task.data[4]! *= -1;
    task.data[5]! *= -1;
  }
  PrepareBattlerSpriteForRotScale(task.data[15]!, ST_OAM_OBJ_NORMAL);
  task.func = AnimTask_RockMonBackAndForth_Step;
}

function AnimTask_RockMonBackAndForth_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  const mon = gSprites[task.data[15]!]!;
  switch (task.data[0]) {
  case 0:
    mon.x2 += task.data[5]!;
    task.data[2] = s16(task.data[2]! - task.data[4]!);
    SetSpriteRotScale(task.data[15]!, 0x100, 0x100, u16(task.data[2]!));
    SetBattlerSpriteYOffsetFromRotation(task.data[15]!);
    if (++task.data[1]! >= task.data[3]!) {
      task.data[1] = 0;
      task.data[0]!++;
    }
    break;
  case 1:
    mon.x2 -= task.data[5]!;
    task.data[2] = s16(task.data[2]! + task.data[4]!);
    SetSpriteRotScale(task.data[15]!, 0x100, 0x100, u16(task.data[2]!));
    SetBattlerSpriteYOffsetFromRotation(task.data[15]!);
    if (++task.data[1]! >= task.data[3]! * 2) {
      task.data[1] = 0;
      task.data[0]!++;
    }
    break;
  case 2:
    mon.x2 += task.data[5]!;
    task.data[2] = s16(task.data[2]! - task.data[4]!);
    SetSpriteRotScale(task.data[15]!, 0x100, 0x100, u16(task.data[2]!));
    SetBattlerSpriteYOffsetFromRotation(task.data[15]!);
    if (++task.data[1]! >= task.data[3]!) {
      if (task.data[6]) {
        task.data[6]!--;
        task.data[1] = 0;
        task.data[0] = 0;
      } else {
        task.data[0]!++;
      }
    }
    break;
  case 3:
    ResetSpriteRotScale(task.data[15]!);
    DestroyAnimVisualTask(taskId);
    break;
  }
}

// Floats a petal across the screen towards the target mon's side.
function AnimSweetScentPetal(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
    sprite.x = 0;
    sprite.y = gBattleAnimArgs[0]!;
  } else {
    sprite.x = C.DISPLAY_WIDTH;
    sprite.y = gBattleAnimArgs[0]! - 30;
  }
  sprite.data[2] = gBattleAnimArgs[2]!;
  StartSpriteAnim(sprite, gBattleAnimArgs[1]!);
  sprite.callback = AnimSweetScentPetal_Step;
}

function AnimSweetScentPetal_Step(sprite: Sprite): void {
  sprite.data[0]! += 3;
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
    sprite.x += 5;
    sprite.y -= 1;
    if (sprite.x > C.DISPLAY_WIDTH) DestroyAnimSprite(sprite);
    sprite.y2 = Sin(sprite.data[0]! & 0xff, 16);
  } else {
    sprite.x -= 5;
    sprite.y += 1;
    if (sprite.x < 0) DestroyAnimSprite(sprite);
    sprite.y2 = Cos(sprite.data[0]! & 0xff, 16);
  }
}

// Moves the mon sprite in a flailing back-and-forth motion.
export function AnimTask_FlailMovement(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[0] = 0;
  task.data[1] = 0;
  task.data[2] = 0;
  task.data[3] = 0;
  task.data[12] = 0x20;
  task.data[13] = 0x40;
  task.data[14] = 0x800;
  task.data[15] = GetAnimBattlerSpriteId(gBattleAnimArgs[0]!);
  PrepareBattlerSpriteForRotScale(task.data[15]!, ST_OAM_OBJ_NORMAL);
  task.func = AnimTask_FlailMovement_Step;
}

function AnimTask_FlailMovement_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  switch (task.data[0]) {
  case 0:
    task.data[2] = s16(task.data[2]! + 0x200);
    if (task.data[2]! >= task.data[14]!) {
      const diff = s16(task.data[14]! - task.data[2]!);
      const div = s16(Math.trunc(diff / (task.data[14]! * 2)));
      const mod = s16(diff % (task.data[14]! * 2));
      if ((div & 1) === 0) {
        task.data[2] = s16(task.data[14]! - mod);
        task.data[0] = 1;
      } else {
        task.data[2] = s16(mod - task.data[14]!);
      }
    }
    break;
  case 1:
    task.data[2] = s16(task.data[2]! - 0x200);
    if (task.data[2]! <= -task.data[14]!) {
      const diff = s16(task.data[14]! - task.data[2]!);
      const div = s16(Math.trunc(diff / (task.data[14]! * 2)));
      const mod = s16(diff % (task.data[14]! * 2));
      if ((1 & div) === 0) {
        task.data[2] = s16(mod - task.data[14]!);
        task.data[0] = 0;
      } else {
        task.data[2] = s16(task.data[14]! - mod);
      }
    }
    break;
  case 2:
    ResetSpriteRotScale(task.data[15]!);
    DestroyAnimVisualTask(taskId);
    return;
  }

  SetSpriteRotScale(task.data[15]!, 0x100, 0x100, u16(task.data[2]!));
  SetBattlerSpriteYOffsetFromRotation(task.data[15]!);
  const temp = task.data[2]!;
  gSprites[task.data[15]!]!.x2 = -((temp >= 0 ? temp : temp + 63) >> 6);
  if (++task.data[1]! > 8) {
    if (task.data[12]) {
      task.data[12]!--;
      task.data[14]! -= task.data[13]!;
      if (task.data[14]! < 16) task.data[14] = 16;
    } else {
      task.data[0] = 2;
    }
  }
}

// Makes a spark-like projectile fall on top of the mon.
function AnimPainSplitProjectile(sprite: Sprite): void {
  if (!sprite.data[0]) {
    if (gBattleAnimArgs[2] === ANIM_ATTACKER) {
      sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
      sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
    }
    sprite.x += gBattleAnimArgs[0]!;
    sprite.y += gBattleAnimArgs[1]!;
    sprite.data[1] = 0x80;
    sprite.data[2] = 0x300;
    sprite.data[3] = gBattleAnimArgs[1]!;
    sprite.data[0]!++;
  } else {
    sprite.x2 = sprite.data[1]! >> 8;
    sprite.y2 += sprite.data[2]! >> 8;
    if (sprite.data[4] === 0 && sprite.y2 > -sprite.data[3]!) {
      sprite.data[4] = 1;
      sprite.data[2] = Math.trunc(-sprite.data[2]! / 3) * 2;
    }
    sprite.data[1]! += 192;
    sprite.data[2]! += 128;
    if (sprite.animEnded) DestroyAnimSprite(sprite);
  }
}

// Performs one of several affine transformations on the mon sprite.
export function AnimTask_PainSplitMovement(taskId: number): void {
  const t = gTasks[taskId]!;
  if (t.data[0] === 0) {
    t.data[11] = gBattleAnimArgs[0] === ANIM_ATTACKER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
    const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[0]!);
    t.data[10] = spriteId;
    PrepareBattlerSpriteForRotScale(spriteId, ST_OAM_OBJ_NORMAL);
    switch (gBattleAnimArgs[1]) {
    case 0:
      SetSpriteRotScale(spriteId, 0xe0, 0x140, 0);
      SetBattlerSpriteYOffsetFromYScale(spriteId);
      break;
    case 1:
      SetSpriteRotScale(spriteId, 0xd0, 0x130, 0xf00);
      SetBattlerSpriteYOffsetFromYScale(spriteId);
      if (IsContest() || GetBattlerSide(t.data[11]!) === C.B_SIDE_PLAYER) gSprites[spriteId]!.y2 += 16;
      break;
    case 2:
      SetSpriteRotScale(spriteId, 0xd0, 0x130, 0xf100);
      SetBattlerSpriteYOffsetFromYScale(spriteId);
      if (IsContest() || GetBattlerSide(t.data[11]!) === C.B_SIDE_PLAYER) gSprites[spriteId]!.y2 += 16;
      break;
    }
    gSprites[spriteId]!.x2 = 2;
    t.data[0]!++;
  } else {
    const spriteId = t.data[10]! & 0xff;
    if (++t.data[2]! === 3) {
      t.data[2] = 0;
      gSprites[spriteId]!.x2 = -gSprites[spriteId]!.x2;
    }
    if (++t.data[1]! === 13) {
      ResetSpriteRotScale(spriteId);
      gSprites[spriteId]!.x2 = 0;
      gSprites[spriteId]!.y2 = 0;
      DestroyAnimVisualTask(taskId);
    }
  }
}

// Move a piece of confetti in a slightly-random speed across the screen.
function AnimFlatterConfetti(sprite: Sprite): void {
  const tileOffset = (random() % 12) & 0xff;
  sprite.oam.tileNum += tileOffset;
  const rand1 = random() & 0x1ff;
  const rand2 = random() & 0xff;
  if (rand1 & 1) sprite.data[0] = 0x5e0 + rand1;
  else sprite.data[0] = 0x5e0 - rand1;
  if (rand2 & 1) sprite.data[1] = 0x480 + rand2;
  else sprite.data[1] = 0x480 - rand2;
  sprite.data[2] = gBattleAnimArgs[0]!;
  if (sprite.data[2] === ANIM_ATTACKER) sprite.x = -8;
  else sprite.x = 248;
  sprite.y = 104;
  sprite.callback = AnimFlatterConfetti_Step;
}

function AnimFlatterConfetti_Step(sprite: Sprite): void {
  if (sprite.data[2] === 0) {
    sprite.x2 += sprite.data[0]! >> 8;
    sprite.y2 -= sprite.data[1]! >> 8;
  } else {
    sprite.x2 -= sprite.data[0]! >> 8;
    sprite.y2 -= sprite.data[1]! >> 8;
  }
  sprite.data[0]! -= 22;
  sprite.data[1]! -= 48;
  if (sprite.data[0]! < 0) sprite.data[0] = 0;
  if (++sprite.data[3]! === 31) DestroyAnimSprite(sprite);
}

// Uses a spotlight sprite as a light mask to illuminate the target mon. The spotlight grows and shrinks.
function AnimFlatterSpotlight(sprite: Sprite): void {
  SetGpuReg(C.REG_OFFSET_WINOUT, C.WINOUT_WIN01_BG_ALL | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR | C.WINOUT_WINOBJ_BG_ALL | C.WINOUT_WINOBJ_OBJ);
  SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_OBJWIN_ON);
  G.gBattle_WIN0H = 0;
  G.gBattle_WIN0V = 0;
  SetGpuReg(C.REG_OFFSET_WIN0H, G.gBattle_WIN0H);
  SetGpuReg(C.REG_OFFSET_WIN0V, G.gBattle_WIN0V);
  sprite.data[0] = gBattleAnimArgs[2]!;
  InitSpritePosToAnimTarget(sprite, false);
  sprite.oam.objMode = ST_OAM_OBJ_WINDOW;
  sprite.invisible = true;
  sprite.callback = AnimFlatterSpotlight_Step;
}

function AnimFlatterSpotlight_Step(sprite: Sprite): void {
  switch (sprite.data[1]) {
  case 0:
    sprite.invisible = false;
    if (sprite.affineAnimEnded) sprite.data[1]!++;
    break;
  case 1:
    if (--sprite.data[0]! === 0) {
      ChangeSpriteAffineAnim(sprite, 1);
      sprite.data[1]!++;
    }
    break;
  case 2:
    if (sprite.affineAnimEnded) {
      sprite.invisible = true;
      sprite.data[1]!++;
    }
    break;
  case 3:
    SetGpuReg(C.REG_OFFSET_WINOUT, C.WINOUT_WIN01_BG_ALL | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR | C.WINOUT_WINOBJ_BG_ALL | C.WINOUT_WINOBJ_OBJ | C.WINOUT_WINOBJ_CLR);
    SetGpuReg(C.REG_OFFSET_DISPCNT, GetGpuReg(C.REG_OFFSET_DISPCNT) ^ C.DISPCNT_OBJWIN_ON);
    DestroyAnimSprite(sprite);
    break;
  }
}

// Spins an orb around the attacking mon, while its path radius grows and shrinks.
function AnimReversalOrb(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.data[0] = gBattleAnimArgs[0]!;
  sprite.data[1] = gBattleAnimArgs[1]!;
  sprite.callback = AnimReversalOrb_Step;
  sprite.callback(sprite);
}

function AnimReversalOrb_Step(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[1]!, sprite.data[2]! >> 8);
  sprite.y2 = Cos(sprite.data[1]!, sprite.data[3]! >> 8);
  sprite.data[1] = (sprite.data[1]! + 9) & 0xff;
  if (u16(sprite.data[1]!) < 64 || sprite.data[1]! > 195) sprite.subpriority = (GetBattlerSpriteSubpriority(animState.gBattleAnimAttacker) - 1) & 0xff;
  else sprite.subpriority = (GetBattlerSpriteSubpriority(animState.gBattleAnimAttacker) + 1) & 0xff;

  if (!sprite.data[5]) {
    sprite.data[2]! += 0x400;
    sprite.data[3]! += 0x100;
    sprite.data[4]!++;
    if (sprite.data[4] === sprite.data[0]) {
      sprite.data[4] = 0;
      sprite.data[5] = 1;
    }
  } else if (sprite.data[5] === 1) {
    sprite.data[2]! -= 0x400;
    sprite.data[3]! -= 0x100;
    sprite.data[4]!++;
    if (sprite.data[4] === sprite.data[0]) DestroyAnimSprite(sprite);
  }
}

// Copies the target mon's sprite, and makes a white silhouette that shrinks away.
export function AnimTask_RolePlaySilhouette(taskId: number): void {
  const a = animState;
  GetAnimBattlerSpriteId(ANIM_ATTACKER);
  const targetSpecies = () => {
    const transform = gBattleSpritesDataPtr.battlerData[a.gBattleAnimTarget]!.transformSpecies;
    if (transform !== C.SPECIES_NONE) return transform;
    if (GetBattlerSide(a.gBattleAnimTarget) === C.B_SIDE_PLAYER) return GetMonData(playerMon(gBattlerPartyIndexes[a.gBattleAnimTarget]!), C.MON_DATA_SPECIES);
    return GetMonData(gEnemyParty[gBattlerPartyIndexes[a.gBattleAnimTarget]!]!, C.MON_DATA_SPECIES);
  };
  let isBackPic: boolean;
  let personality: number;
  let otId: number;
  let xOffset: number;
  if (GetBattlerSide(a.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    isBackPic = false;
    personality = GetMonData(playerMon(gBattlerPartyIndexes[a.gBattleAnimTarget]!), C.MON_DATA_PERSONALITY) >>> 0;
    otId = GetMonData(playerMon(gBattlerPartyIndexes[a.gBattleAnimTarget]!), C.MON_DATA_OT_ID) >>> 0;
    xOffset = 20;
  } else {
    isBackPic = true;
    personality = GetMonData(gEnemyParty[gBattlerPartyIndexes[a.gBattleAnimTarget]!]!, C.MON_DATA_PERSONALITY) >>> 0;
    otId = GetMonData(gEnemyParty[gBattlerPartyIndexes[a.gBattleAnimTarget]!]!, C.MON_DATA_OT_ID) >>> 0;
    xOffset = -20;
  }
  const species = targetSpecies();
  const priority = GetBattlerSpriteBGPriority(a.gBattleAnimAttacker);

  const coord1 = s16(GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_X));
  const coord2 = s16(GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_Y));
  const spriteId = CreateAdditionalMonSpriteForMoveAnim(species, isBackPic, 0, coord1 + xOffset, coord2, 5, personality, otId, a.gBattleAnimTarget, true);
  gSprites[spriteId]!.oam.priority = priority;
  gSprites[spriteId]!.oam.objMode = ST_OAM_OBJ_BLEND;
  FillPalette(RGB_WHITE, OBJ_PLTT_ID(gSprites[spriteId]!.oam.paletteNum), PLTT_SIZE_4BPP);
  gSprites[spriteId]!.oam.priority = priority;
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(gTasks[taskId]!.data[1]!, 16 - gTasks[taskId]!.data[1]!));
  gTasks[taskId]!.data[0] = spriteId;
  gTasks[taskId]!.func = AnimTask_RolePlaySilhouette_Step1;
}

function AnimTask_RolePlaySilhouette_Step1(taskId: number): void {
  const t = gTasks[taskId]!;
  if (t.data[10]!++ > 1) {
    t.data[10] = 0;
    t.data[1]!++;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(t.data[1]!, 16 - t.data[1]!));
    if (t.data[1] === 10) {
      t.data[10] = 256;
      t.data[11] = 256;
      t.func = AnimTask_RolePlaySilhouette_Step2;
    }
  }
}

function AnimTask_RolePlaySilhouette_Step2(taskId: number): void {
  const t = gTasks[taskId]!;
  const spriteId = t.data[0]! & 0xff;
  t.data[10]! -= 16;
  t.data[11]! += 128;
  gSprites[spriteId]!.oam.affineMode |= ST_OAM_AFFINE_DOUBLE_MASK;
  TrySetSpriteRotScale(gSprites[spriteId]!, true, t.data[10]!, t.data[11]!, 0);
  if (++t.data[12]! === 9) {
    TryResetSpriteAffineState(gSprites[spriteId]!);
    DestroySpriteAndFreeResources_(gSprites[spriteId]!);
    t.func = DestroyAnimVisualTaskAndDisableBlend;
  }
}

// Performs a wavy transformation on the mon's sprite, and fades out.
export function AnimTask_AcidArmor(taskId: number): void {
  const task = gTasks[taskId]!;
  const battler = gBattleAnimArgs[0] === ANIM_ATTACKER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  task.data[0] = 0;
  task.data[1] = 0;
  task.data[2] = 0;
  task.data[3] = 16;
  task.data[4] = 0;
  task.data[5] = battler;
  task.data[6] = 32;
  task.data[7] = 0;
  task.data[8] = 24;
  if (GetBattlerSide(battler) === C.B_SIDE_OPPONENT) task.data[8]! *= -1;
  task.data[13] = GetBattlerYCoordWithElevation(battler) - 34;
  if (task.data[13]! < 0) task.data[13] = 0;
  task.data[14] = task.data[13]! + 66;
  task.data[15] = GetAnimBattlerSpriteId(gBattleAnimArgs[0]!);

  let dmaDest: number;
  let bgX: number;
  let bgY: number;
  if (GetBattlerSpriteBGPriorityRank(battler) === 1) {
    dmaDest = C.REG_OFFSET_BG1HOFS;
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG1);
    bgX = u16(G.gBattle_BG1_X);
    bgY = u16(G.gBattle_BG1_Y);
  } else {
    dmaDest = C.REG_OFFSET_BG2HOFS;
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT1_BG2);
    bgX = u16(G.gBattle_BG2_X);
    bgY = u16(G.gBattle_BG2_Y);
  }
  for (let y = 0, i = 0; y < 160; y++, i += 2) {
    gScanlineEffectRegBuffers[0]![i] = bgX;
    gScanlineEffectRegBuffers[1]![i] = bgX;
    gScanlineEffectRegBuffers[0]![i + 1] = bgY;
    gScanlineEffectRegBuffers[1]![i + 1] = bgY;
  }
  ScanlineEffect_SetParams({ dmaDest, dmaControl: SCANLINE_EFFECT_DMACNT_32BIT, initState: 1, unused9: 0 });
  task.func = AnimTask_AcidArmor_Step;
}

function AnimTask_AcidArmor_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  let bgX: number;
  let bgY: number;
  if (GetBattlerSpriteBGPriorityRank(task.data[5]!) === 1) {
    bgX = s16(G.gBattle_BG1_X);
    bgY = s16(G.gBattle_BG1_Y);
  } else {
    bgX = s16(G.gBattle_BG2_X);
    bgY = s16(G.gBattle_BG2_Y);
  }

  switch (task.data[0]) {
  case 0: {
    let offset = s16(task.data[14]! * 2);
    let var1 = 0;
    let var2 = 0;
    let i = 0;
    task.data[1] = (task.data[1]! + 2) & 0xff;
    let sineIndex = task.data[1]!;
    task.data[9] = Math.trunc(0x7e0 / task.data[6]!);
    task.data[10] = -Math.trunc((task.data[7]! * 2) / task.data[9]!);
    task.data[11] = task.data[7]!;
    let var3 = s16(task.data[11]! >> 5);
    task.data[12] = var3;
    let var0 = task.data[14]!;
    const buf = gScanlineEffectRegBuffers[gScanlineEffect.srcBuffer]!;
    while (var0 > task.data[13]!) {
      buf[offset + 1] = (i - var2) + bgY;
      buf[offset] = bgX + var3 + (gSineTable[sineIndex]! >> 5);
      sineIndex = (sineIndex + 10) & 0xff;
      task.data[11] = s16(task.data[11]! + task.data[10]!);
      var3 = s16(task.data[11]! >> 5);
      task.data[12] = var3;
      i++;
      offset -= 2;
      var1 = s16(var1 + task.data[6]!);
      var2 = s16(var1 >> 5);
      var0--;
    }
    var0 = s16(var0 * 2);
    while (var0 >= 0) {
      gScanlineEffectRegBuffers[0]![var0] = bgX + 240;
      gScanlineEffectRegBuffers[1]![var0] = bgX + 240;
      var0 -= 2;
    }
    if (++task.data[6]! > 63) {
      task.data[6] = 64;
      task.data[2]!++;
      if (task.data[2]! & 1) task.data[3]!--;
      else task.data[4]!++;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(task.data[3]!, task.data[4]!));
      if (task.data[3] === 0 && task.data[4] === 16) {
        task.data[2] = 0;
        task.data[3] = 0;
        task.data[0]!++;
      }
    } else {
      task.data[7] = s16(task.data[7]! + task.data[8]!);
    }
    break;
  }
  case 1:
    if (++task.data[2]! > 12) {
      gScanlineEffect.state = 3;
      task.data[2] = 0;
      task.data[0]!++;
    }
    break;
  case 2:
    task.data[2]!++;
    if (task.data[2]! & 1) task.data[3]!++;
    else task.data[4]!--;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(task.data[3]!, task.data[4]!));
    if (task.data[3] === 16 && task.data[4] === 0) {
      task.data[2] = 0;
      task.data[3] = 0;
      task.data[0]!++;
    }
    break;
  case 3:
    DestroyAnimVisualTask(taskId);
    break;
  }
}

// Runs an affine animation that makes it look like the mon is inhaling deeply.
export function AnimTask_DeepInhale(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[0] = 0;
  task.data[15] = GetAnimBattlerSpriteId(gBattleAnimArgs[0]!);
  PrepareAffineAnimInTaskData(task, task.data[15]!, affineCmds("sDeepInhaleAffineAnimCmds"));
  task.func = AnimTask_DeepInhale_Step;
}

function AnimTask_DeepInhale_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  let var0 = u16(task.data[0]!);
  task.data[0]!++;
  var0 = u16(var0 - 20);
  if (var0 < 23) {
    if (++task.data[1]! > 1) {
      task.data[1] = 0;
      task.data[2]!++;
      if (task.data[2]! & 1) gSprites[task.data[15]!]!.x2 = 1;
      else gSprites[task.data[15]!]!.x2 = -1;
    }
  } else {
    gSprites[task.data[15]!]!.x2 = 0;
  }
  if (!RunAffineAnimFromTaskData(task)) DestroyAnimVisualTask(taskId);
}

function InitYawnCloudPosition(sprite: Sprite, startX: number, startY: number, destX: number, destY: number, duration: number): void {
  sprite.x = startX;
  sprite.y = startY;
  sprite.data[4] = startX << 4;
  sprite.data[5] = startY << 4;
  sprite.data[6] = Math.trunc(((destX - startX) << 4) / duration);
  sprite.data[7] = Math.trunc(((destY - startY) << 4) / duration);
}

function UpdateYawnCloudPosition(sprite: Sprite): void {
  sprite.data[4]! += sprite.data[6]!;
  sprite.data[5]! += sprite.data[7]!;
  sprite.x = sprite.data[4]! >> 4;
  sprite.y = sprite.data[5]! >> 4;
}

// Drifts a cloud in a wavy path towards the target mon.
function AnimYawnCloud(sprite: Sprite): void {
  const destX = s16(sprite.x);
  const destY = s16(sprite.y);
  SetSpriteCoordsToAnimAttackerCoords(sprite);
  StartSpriteAffineAnim(sprite, gBattleAnimArgs[0]!);
  InitYawnCloudPosition(sprite, sprite.x, sprite.y, destX, destY, 64);
  sprite.data[0] = 0;
  sprite.callback = AnimYawnCloud_Step;
}

function AnimYawnCloud_Step(sprite: Sprite): void {
  sprite.data[0]!++;
  const index = (sprite.data[0]! * 8) & 0xff;
  UpdateYawnCloudPosition(sprite);
  sprite.y2 = Sin(index, 8);
  if (sprite.data[0]! > 58) {
    if (++sprite.data[1]! > 1) {
      sprite.data[1] = 0;
      sprite.data[2]!++;
      sprite.invisible = !!(sprite.data[2]! & 1);
      if (sprite.data[2]! > 3) DestroySpriteAndMatrix(sprite);
    }
  }
}

// Animates a cloud coming from the smoke ball.
function AnimSmokeBallEscapeCloud(sprite: Sprite): void {
  sprite.data[0] = gBattleAnimArgs[3]!;
  StartSpriteAffineAnim(sprite, gBattleAnimArgs[0]!);
  if (GetBattlerSide(animState.gBattleAnimTarget) !== C.B_SIDE_PLAYER) gBattleAnimArgs[1] = -gBattleAnimArgs[1]!;
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2) + gBattleAnimArgs[1]!;
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET) + gBattleAnimArgs[2]!;
  sprite.callback = DestroyAnimSpriteAfterTimer;
}

function focusBandFlip(t: { data: number[] }, clearTo: number): void {
  t.data[0]!--;
  if ((t.data[6]! & 0x8000) && (t.data[1] = s16(t.data[1]! - 1)) === -1) {
    if (t.data[9] === 0) {
      t.data[9] = t.data[4]!;
      t.data[4] = -t.data[4]!;
    } else {
      t.data[9] = clearTo;
    }
    if (t.data[10] === 0) {
      t.data[10] = t.data[5]!;
      t.data[5] = -t.data[5]!;
    } else {
      t.data[10] = 0;
    }
    t.data[1] = t.data[13]!;
  }
}

function AnimTask_SlideMonForFocusBand_Step2(taskId: number): void {
  const t = gTasks[taskId]!;
  focusBandFlip(t, 0);
  const var0 = u16(t.data[7]!);
  const var1 = u16(t.data[8]!);
  const mon = gSprites[t.data[15]!]!;
  if (t.data[2]! & 0x8000) mon.x2 = t.data[9]! - (var0 >> 8);
  else mon.x2 = t.data[9]! + (var0 >> 8);
  if (t.data[3]! & 0x8000) mon.y2 = t.data[10]! - (var1 >> 8);
  else mon.y2 = t.data[10]! + (var1 >> 8);
  if (t.data[0]! < 1) {
    tasks.destroy(taskId);
    animState.gAnimVisualTaskCount--;
  }
}

function AnimTask_SlideMonForFocusBand_Step1(taskId: number): void {
  const t = gTasks[taskId]!;
  focusBandFlip(t, 0);
  const var0 = u16((t.data[2]! & 0x7fff) + t.data[7]!);
  const var1 = u16((t.data[3]! & 0x7fff) + t.data[8]!);
  const mon = gSprites[t.data[15]!]!;
  if (t.data[2]! & 0x8000) mon.x2 = t.data[9]! - (var0 >> 8);
  else mon.x2 = t.data[9]! + (var0 >> 8);
  if (t.data[3]! & 0x8000) mon.y2 = t.data[10]! - (var1 >> 8);
  else mon.y2 = t.data[10]! + (var1 >> 8);
  t.data[7] = s16(var0);
  t.data[8] = s16(var1);
  if (t.data[0]! < 1) {
    t.data[0] = 30;
    t.data[13] = 0;
    t.func = AnimTask_SlideMonForFocusBand_Step2;
  }
}

export function AnimTask_SlideMonForFocusBand(taskId: number): void {
  const t = gTasks[taskId]!;
  t.data[15] = gBattlerSpriteIds[animState.gBattleAnimAttacker]!;
  t.data[14] = gBattleAnimArgs[0]!;
  t.data[0] = gBattleAnimArgs[0]!;
  t.data[13] = gBattleAnimArgs[6]!;
  if (gBattleAnimArgs[3]) t.data[6] = s16(t.data[6]! | -0x8000);
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    t.data[2] = gBattleAnimArgs[1]!;
    t.data[3] = gBattleAnimArgs[2]!;
  } else {
    if (gBattleAnimArgs[1]! & 0x8000) t.data[2] = gBattleAnimArgs[1]! & 0x7fff;
    else t.data[2] = s16(gBattleAnimArgs[1]! | -0x8000);
    if (gBattleAnimArgs[2]! & 0x8000) t.data[3] = gBattleAnimArgs[2]! & 0x7fff;
    else t.data[3] = s16(gBattleAnimArgs[2]! | -0x8000);
  }
  t.data[8] = 0;
  t.data[7] = 0;
  t.data[4] = gBattleAnimArgs[4]!;
  t.data[5] = gBattleAnimArgs[5]!;
  t.func = AnimTask_SlideMonForFocusBand_Step1;
}

// AnimTask_SquishAndSweatDroplets: tState data[0], tTimer data[1], tActiveSprites data[2],
// tNumSquishes data[3], tBaseX data[4], tBaseY data[5], tSubpriority data[6], tBattlerSpriteId data[15].
// AnimFacadeSweatDrop: sTimer data[0], sVelocX data[1], sVelocY data[2], sTaskId data[3], sActiveSpritesIdx data[4].
const SQUISH_IDX_ACTIVE_SPRITES = 2;

// Squishes the mon vertically and emits sweat droplets a few times.
export function AnimTask_SquishAndSweatDroplets(taskId: number): void {
  const task = gTasks[taskId]!;
  if (!gBattleAnimArgs[1]) DestroyAnimVisualTask(taskId);
  task.data[0] = 0;
  task.data[1] = 0;
  task.data[SQUISH_IDX_ACTIVE_SPRITES] = 0;
  task.data[3] = gBattleAnimArgs[1]!;
  const battler = gBattleAnimArgs[0] === ANIM_ATTACKER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  task.data[4] = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X);
  task.data[5] = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y);
  task.data[6] = GetBattlerSpriteSubpriority(battler);
  task.data[15] = GetAnimBattlerSpriteId(gBattleAnimArgs[0]!);
  PrepareAffineAnimInTaskData(task, task.data[15]!, affineCmds("sFacadeSquishAffineAnimCmds"));
  task.func = AnimTask_SquishAndSweatDroplets_Step;
}

function AnimTask_SquishAndSweatDroplets_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  switch (task.data[0]) {
  case 0:
    task.data[1]!++;
    if (task.data[1] === 6) CreateSweatDroplets(taskId, true);
    if (task.data[1] === 18) CreateSweatDroplets(taskId, false);
    if (!RunAffineAnimFromTaskData(task)) {
      if (--task.data[3]! === 0) {
        // Animation is finished
        task.data[0]!++;
      } else {
        // Animation continues, more droplet sprites to create
        task.data[1] = 0;
        PrepareAffineAnimInTaskData(task, task.data[15]!, affineCmds("sFacadeSquishAffineAnimCmds"));
      }
    }
    break;
  case 1:
    // Wait for sprites to be destroyed before ending task
    if (task.data[SQUISH_IDX_ACTIVE_SPRITES] === 0) DestroyAnimVisualTask(taskId);
    break;
  }
}

function CreateSweatDroplets(taskId: number, lowerDroplets: boolean): void {
  const task = gTasks[taskId]!;
  let xOffset: number;
  let yOffset: number;
  if (!lowerDroplets) {
    xOffset = 18;
    yOffset = -20;
  } else {
    xOffset = 30;
    yOffset = 20;
  }
  const xCoords = [
    s16(task.data[4]! - xOffset), s16(task.data[4]! - xOffset - 4), s16(task.data[4]! + xOffset), s16(task.data[4]! + xOffset + 4),
  ];
  const yCoords = [s16(task.data[5]! + yOffset), s16(task.data[5]! + yOffset + 6)];
  for (let i = 0; i < 4; i++) {
    const spriteId = CreateSprite(animTemplate("gFacadeSweatDropSpriteTemplate"), xCoords[i]!, yCoords[i & 1]!, (task.data[6]! - 5) & 0xff);
    if (spriteId !== MAX_SPRITES) {
      gSprites[spriteId]!.data[0] = 0;
      gSprites[spriteId]!.data[1] = i < 2 ? -2 : 2; // First two travel left, remaining travel right
      gSprites[spriteId]!.data[2] = -1;
      gSprites[spriteId]!.data[3] = taskId;
      gSprites[spriteId]!.data[4] = SQUISH_IDX_ACTIVE_SPRITES;
      task.data[SQUISH_IDX_ACTIVE_SPRITES]!++;
    }
  }
}

function AnimFacadeSweatDrop(sprite: Sprite): void {
  sprite.x += sprite.data[1]!;
  sprite.y += sprite.data[2]!;
  if (++sprite.data[0]! > 6) {
    gTasks[sprite.data[3]!]!.data[sprite.data[4]!]!--;
    DestroySprite(sprite);
  }
}

const sFacadeBlendColors = () => cdata<number[]>("battle_anim_effects_3", "sFacadeBlendColors");

// Blends the mon sprite's color with a rotating set of colors.
export function AnimTask_FacadeColorBlend(taskId: number): void {
  const t = gTasks[taskId]!;
  t.data[0] = 0;
  t.data[1] = gBattleAnimArgs[1]!;
  const spriteId = GetAnimBattlerSpriteId(gBattleAnimArgs[0]!);
  t.data[2] = OBJ_PLTT_ID(gSprites[spriteId]!.oam.paletteNum);
  t.func = AnimTask_FacadeColorBlend_Step;
}

function AnimTask_FacadeColorBlend_Step(taskId: number): void {
  const t = gTasks[taskId]!;
  if (t.data[1]) {
    BlendPalette(t.data[2]!, 16, 8, sFacadeBlendColors()[t.data[0]!]!);
    if (++t.data[0]! > 23) t.data[0] = 0;
    t.data[1]!--;
  } else {
    BlendPalette(t.data[2]!, 16, 0, RGB_BLACK);
    DestroyAnimVisualTask(taskId);
  }
}

export function AnimTask_StatusClearedEffect(taskId: number): void {
  StartMonScrollingBgMask(taskId, 0, 0x1a0, animState.gBattleAnimAttacker, !!gBattleAnimArgs[0], 10, 2, 30, "gCureBubblesGfx", "gCureBubblesTilemap", "gCureBubblesPal");
}

// Moves a noise line from the mon.
function AnimRoarNoiseLine(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_OPPONENT) gBattleAnimArgs[0] = -gBattleAnimArgs[0]!;
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X) + gBattleAnimArgs[0]!;
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_Y) + gBattleAnimArgs[1]!;
  if (gBattleAnimArgs[2] === 0) {
    sprite.data[0] = 0x280;
    sprite.data[1] = -0x280;
  } else if (gBattleAnimArgs[2] === 1) {
    sprite.vFlip = 1;
    sprite.data[0] = 0x280;
    sprite.data[1] = 0x280;
  } else {
    StartSpriteAnim(sprite, 1);
    sprite.data[0] = 0x280;
  }
  if (GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    sprite.data[0] = -sprite.data[0]!;
    sprite.hFlip = 1;
  }
  sprite.callback = AnimRoarNoiseLine_Step;
}

function AnimRoarNoiseLine_Step(sprite: Sprite): void {
  sprite.data[6]! += sprite.data[0]!;
  sprite.data[7]! += sprite.data[1]!;
  sprite.x2 = sprite.data[6]! >> 8;
  sprite.y2 = sprite.data[7]! >> 8;
  if (++sprite.data[5]! === 14) DestroyAnimSprite(sprite);
}

// AnimTask_GlareEyeDots: tState data[0], tTimer data[1], tPairNum data[2], tPairMax data[5], tDotOffset data[6],
// tIsContest data[7], tActiveSprites data[10], tStartX data[11], tStartY data[12], tEndX data[13], tEndY data[14].
// AnimGlareEyeDot: sTimer data[0], sTaskId data[1], sActiveSpritesIdx data[2].
const GLARE_IDX_ACTIVE_SPRITES = 10;

// Makes a series of dots in a trail from the attacker to the target.
export function AnimTask_GlareEyeDots(taskId: number): void {
  const task = gTasks[taskId]!;
  const a = animState;
  task.data[5] = 12;
  task.data[6] = 3;
  task.data[7] = 0;
  const quarter = Math.trunc(GetBattlerSpriteCoordAttr(a.gBattleAnimAttacker, C.BATTLER_COORD_ATTR_HEIGHT) / 4);
  if (GetBattlerSide(a.gBattleAnimAttacker) === C.B_SIDE_PLAYER) task.data[11] = GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_X_2) + quarter;
  else task.data[11] = GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_X_2) - quarter;
  task.data[12] = GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET) - quarter;
  task.data[13] = GetBattlerSpriteCoord(a.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  task.data[14] = GetBattlerSpriteCoord(a.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  task.func = AnimTask_GlareEyeDots_Step;
}

function AnimTask_GlareEyeDots_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  switch (task.data[0]) {
  case 0:
    // Wait to create next pair of dots
    if (++task.data[1]! > 3) {
      task.data[1] = 0;
      const { x, y } = GetGlareEyeDotCoords(task.data[11]!, task.data[12]!, task.data[13]!, task.data[14]!, task.data[5]!, task.data[2]!);
      // Create dot pair
      for (let i = 0; i < 2; i++) {
        const spriteId = CreateSprite(animTemplate("gGlareEyeDotSpriteTemplate"), x, y, 35);
        if (spriteId !== MAX_SPRITES) {
          const dot = gSprites[spriteId]!;
          if (!task.data[7]) {
            if (i === 0) dot.x2 = dot.y2 = -task.data[6]!;
            else dot.x2 = dot.y2 = task.data[6]!;
          } else {
            if (i === 0) {
              dot.x2 = -task.data[6]!;
              dot.y2 = task.data[6]!;
            } else {
              dot.x2 = task.data[6]!;
              dot.y2 = -task.data[6]!;
            }
          }
          dot.data[0] = 0;
          dot.data[1] = taskId;
          dot.data[2] = GLARE_IDX_ACTIVE_SPRITES;
          task.data[GLARE_IDX_ACTIVE_SPRITES]!++;
        }
      }
      if (task.data[2] === task.data[5]) task.data[0]!++;
      task.data[2]!++;
    }
    break;
  case 1:
    // Wait for sprites to be destroyed before ending task
    if (task.data[GLARE_IDX_ACTIVE_SPRITES] === 0) DestroyAnimVisualTask(taskId);
    break;
  }
}

function GetGlareEyeDotCoords(startX: number, startY: number, endX: number, endY: number, pairMax: number, pairNum: number): { x: number; y: number } {
  pairMax &= 0xff;
  pairNum &= 0xff;
  if (pairNum === 0) return { x: startX, y: startY };
  if (pairNum >= pairMax) return { x: endX, y: endY };
  pairMax--;
  const x2 = (startX << 8) + pairNum * Math.trunc(((endX - startX) << 8) / pairMax);
  const y2 = (startY << 8) + pairNum * Math.trunc(((endY - startY) << 8) / pairMax);
  return { x: s16(x2 >> 8), y: s16(y2 >> 8) };
}

function AnimGlareEyeDot(sprite: Sprite): void {
  if (++sprite.data[0]! > 36) {
    gTasks[sprite.data[1]!]!.data[sprite.data[2]!]!--;
    DestroySprite(sprite);
  }
}

// Moves a pawprint in a straight line.
function AnimAssistPawprint(sprite: Sprite): void {
  sprite.x = gBattleAnimArgs[0]!;
  sprite.y = gBattleAnimArgs[1]!;
  sprite.data[2] = gBattleAnimArgs[2]!;
  sprite.data[4] = gBattleAnimArgs[3]!;
  sprite.data[0] = gBattleAnimArgs[4]!;
  StoreSpriteCallbackInData6(sprite, DestroyAnimSprite);
  sprite.callback = InitAndRunAnimFastLinearTranslation;
}

// Moves a ball in an arc twoards the target, and rotates the ball while arcing.
export function AnimTask_BarrageBall(taskId: number): void {
  const task = gTasks[taskId]!;
  const a = animState;
  task.data[11] = GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  task.data[12] = GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_Y_PIC_OFFSET);
  task.data[13] = GetBattlerSpriteCoord(a.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  task.data[14] = GetBattlerSpriteCoord(a.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET) + Math.trunc(GetBattlerSpriteCoordAttr(a.gBattleAnimTarget, C.BATTLER_COORD_ATTR_HEIGHT) / 4);
  task.data[15] = CreateSprite(animTemplate("gBarrageBallSpriteTemplate"), task.data[11]!, task.data[12]!, (GetBattlerSpriteSubpriority(a.gBattleAnimTarget) - 5) & 0xff);
  if (task.data[15] !== MAX_SPRITES) {
    const ball = gSprites[task.data[15]!]!;
    ball.data[0] = 16;
    ball.data[2] = task.data[13]!;
    ball.data[4] = task.data[14]!;
    ball.data[5] = -32;
    InitAnimArcTranslation(ball);
    if (GetBattlerSide(a.gBattleAnimAttacker) === C.B_SIDE_OPPONENT) StartSpriteAffineAnim(ball, 1);
    task.func = AnimTask_BarrageBall_Step;
  } else {
    DestroyAnimVisualTask(taskId);
  }
}

function AnimTask_BarrageBall_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  const ball = gSprites[task.data[15]!]!;
  switch (task.data[0]) {
  case 0:
    if (++task.data[1]! > 1) {
      task.data[1] = 0;
      TranslateAnimHorizontalArc(ball);
      if (++task.data[2]! > 7) task.data[0]!++;
    }
    break;
  case 1:
    if (TranslateAnimHorizontalArc(ball)) {
      task.data[1] = 0;
      task.data[2] = 0;
      task.data[0]!++;
    }
    break;
  case 2:
    if (++task.data[1]! > 1) {
      task.data[1] = 0;
      task.data[2]!++;
      ball.invisible = !!(task.data[2]! & 1);
      if (task.data[2] === 16) {
        FreeOamMatrix(ball.oam.matrixNum);
        DestroySprite(ball);
        task.data[0]!++;
      }
    }
    break;
  case 3:
    DestroyAnimVisualTask(taskId);
    break;
  }
}

// Moves a hand back and forth in a squishing motion.
function AnimSmellingSaltsHand(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === ANIM_ATTACKER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  sprite.oam.tileNum += 16;
  sprite.data[6] = gBattleAnimArgs[2]!;
  sprite.data[7] = gBattleAnimArgs[1] === 0 ? -1 : 1;
  sprite.y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y_PIC_OFFSET);
  if (gBattleAnimArgs[1] === 0) {
    sprite.oam.matrixNum |= ST_OAM_HFLIP;
    sprite.x = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_LEFT) - 8;
  } else {
    sprite.x = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_RIGHT) + 8;
  }
  sprite.callback = AnimSmellingSaltsHand_Step;
}

function AnimSmellingSaltsHand_Step(sprite: Sprite): void {
  switch (sprite.data[0]) {
  case 0:
    if (++sprite.data[1]! > 1) {
      sprite.data[1] = 0;
      sprite.x2 += sprite.data[7]!;
      if (++sprite.data[2]! === 12) sprite.data[0]!++;
    }
    break;
  case 1:
    if (++sprite.data[1]! === 8) {
      sprite.data[1] = 0;
      sprite.data[0]!++;
    }
    break;
  case 2:
    sprite.x2 -= sprite.data[7]! * 4;
    if (++sprite.data[1]! === 6) {
      sprite.data[1] = 0;
      sprite.data[0]!++;
    }
    break;
  case 3:
    sprite.x2 += sprite.data[7]! * 3;
    if (++sprite.data[1]! === 8) {
      if (--sprite.data[6]!) {
        sprite.data[1] = 0;
        sprite.data[0]!--;
      } else {
        DestroyAnimSprite(sprite);
      }
    }
    break;
  }
}

// Squishes the mon horizontally a few times.
export function AnimTask_SmellingSaltsSquish(taskId: number): void {
  if (gBattleAnimArgs[0] === ANIM_ATTACKER) {
    DestroyAnimVisualTask(taskId);
  } else {
    const t = gTasks[taskId]!;
    t.data[0] = gBattleAnimArgs[1]!;
    t.data[15] = GetAnimBattlerSpriteId(gBattleAnimArgs[0]!);
    PrepareAffineAnimInTaskData(t, t.data[15]!, affineCmds("sSmellingSaltsSquishAffineAnimCmds"));
    t.func = AnimTask_SmellingSaltsSquish_Step;
  }
}

function AnimTask_SmellingSaltsSquish_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  if (++task.data[1]! > 1) {
    task.data[1] = 0;
    if (!(task.data[2]! & 1)) gSprites[task.data[15]!]!.x2 = 2;
    else gSprites[task.data[15]!]!.x2 = -2;
  }
  if (!RunAffineAnimFromTaskData(task)) {
    gSprites[task.data[15]!]!.x2 = 0;
    if (--task.data[0]!) {
      PrepareAffineAnimInTaskData(task, task.data[15]!, affineCmds("sSmellingSaltsSquishAffineAnimCmds"));
      task.data[1] = 0;
      task.data[2] = 0;
    } else {
      DestroyAnimVisualTask(taskId);
    }
  }
}

// Blinks an exclamation image over the mon a few times.
function AnimSmellingSaltExclamation(sprite: Sprite): void {
  const battler = gBattleAnimArgs[0] === ANIM_ATTACKER ? animState.gBattleAnimAttacker : animState.gBattleAnimTarget;
  sprite.x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoordAttr(battler, C.BATTLER_COORD_ATTR_TOP);
  if (sprite.y < 8) sprite.y = 8;
  sprite.data[0] = 0;
  sprite.data[1] = gBattleAnimArgs[1]!;
  sprite.data[2] = 0;
  sprite.data[3] = gBattleAnimArgs[2]!;
  sprite.callback = AnimSmellingSaltExclamation_Step;
}

function AnimSmellingSaltExclamation_Step(sprite: Sprite): void {
  if (++sprite.data[0]! >= sprite.data[1]!) {
    sprite.data[0] = 0;
    sprite.data[2] = (sprite.data[2]! + 1) & 1;
    sprite.invisible = !!sprite.data[2];
    if (sprite.data[2] && --sprite.data[3]! === 0) DestroyAnimSprite(sprite);
  }
}

// Claps a hand several times.
function AnimHelpingHandClap(sprite: Sprite): void {
  if (gBattleAnimArgs[0] === 0) {
    sprite.oam.matrixNum |= ST_OAM_HFLIP;
    sprite.x = 100;
    sprite.data[7] = 1;
  } else {
    sprite.x = 140;
    sprite.data[7] = -1;
  }
  sprite.y = 56;
  sprite.callback = AnimHelpingHandClap_Step;
}

function AnimHelpingHandClap_Step(sprite: Sprite): void {
  switch (sprite.data[0]) {
  case 0:
    sprite.y -= sprite.data[7]! * 2;
    if (sprite.data[1]! & 1) sprite.x -= sprite.data[7]! * 2;
    if (++sprite.data[1]! === 9) {
      sprite.data[1] = 0;
      sprite.data[0]!++;
    }
    break;
  case 1:
    if (++sprite.data[1]! === 4) {
      sprite.data[1] = 0;
      sprite.data[0]!++;
    }
    break;
  case 2:
    sprite.data[1]!++;
    sprite.y += sprite.data[7]! * 3;
    sprite.x2 = sprite.data[7]! * (gSineTable[sprite.data[1]! * 10]! >> 3);
    if (sprite.data[1] === 12) {
      sprite.data[1] = 0;
      sprite.data[0]!++;
    }
    break;
  case 3:
    if (++sprite.data[1]! === 2) {
      sprite.data[1] = 0;
      sprite.data[0]!++;
    }
    break;
  case 4:
    sprite.data[1]!++;
    sprite.y -= sprite.data[7]! * 3;
    sprite.x2 = sprite.data[7]! * (gSineTable[sprite.data[1]! * 10]! >> 3);
    if (sprite.data[1] === 12) sprite.data[0]!++;
    break;
  case 5:
    sprite.data[1]!++;
    sprite.y += sprite.data[7]! * 3;
    sprite.x2 = sprite.data[7]! * (gSineTable[sprite.data[1]! * 10]! >> 3);
    if (sprite.data[1] === 15) sprite.oam.tileNum += 16;
    if (sprite.data[1] === 18) {
      sprite.data[1] = 0;
      sprite.data[0]!++;
    }
    break;
  case 6:
    sprite.x += sprite.data[7]! * 6;
    if (++sprite.data[1]! === 9) {
      sprite.data[1] = 0;
      sprite.data[0]!++;
    }
    break;
  case 7:
    sprite.x += sprite.data[7]! * 2;
    if (++sprite.data[1]! === 1) {
      sprite.data[1] = 0;
      sprite.data[0]!++;
    }
    break;
  case 8:
    sprite.x -= sprite.data[7]! * 3;
    if (++sprite.data[1]! === 5) DestroyAnimSprite(sprite);
    break;
  }
}

// Repeatedly moves the attacking mon in a horizontal lunging motion.
export function AnimTask_HelpingHandAttackerMovement(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[15] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  if (IsDoubleBattle()) {
    const attackerX = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X);
    const partnerX = GetBattlerSpriteCoord(animState.gBattleAnimAttacker ^ 2, C.BATTLER_COORD_X);
    task.data[14] = attackerX > partnerX ? 1 : -1;
  } else {
    task.data[14] = GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER ? -1 : 1;
  }
  task.func = AnimTask_HelpingHandAttackerMovement_Step;
}

function AnimTask_HelpingHandAttackerMovement_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  const mon = gSprites[task.data[15]!]!;
  const phase = (frames: number, dx: number) => {
    mon.x2 += dx;
    if (++task.data[1]! === frames) {
      task.data[1] = 0;
      task.data[0]!++;
    }
  };
  switch (task.data[0]) {
  case 0: phase(13, 0); break;
  case 1: phase(6, -task.data[14]! * 3); break;
  case 2: phase(6, task.data[14]! * 3); break;
  case 3:
    if (++task.data[1]! === 2) {
      task.data[1] = 0;
      if (task.data[2] === 0) {
        task.data[2]!++;
        task.data[0] = 1;
      } else {
        task.data[0]!++;
      }
    }
    break;
  case 4: phase(3, task.data[14]!); break;
  case 5: phase(6, 0); break;
  case 6: phase(5, -task.data[14]! * 4); break;
  case 7: phase(5, task.data[14]! * 4); break;
  case 8:
    mon.x2 = 0;
    DestroyAnimVisualTask(taskId);
    break;
  }
}

// Moves a magnifying glass around in straight lines.
function AnimForesightMagnifyingGlass(sprite: Sprite): void {
  if (gBattleAnimArgs[0] === ANIM_ATTACKER) {
    InitSpritePosToAnimAttacker(sprite, true);
    sprite.data[7] = animState.gBattleAnimAttacker;
  } else {
    sprite.data[7] = animState.gBattleAnimTarget;
  }
  if (GetBattlerSide(sprite.data[7]!) === C.B_SIDE_OPPONENT) sprite.oam.matrixNum = ST_OAM_HFLIP;
  sprite.oam.priority = GetBattlerSpriteBGPriority(sprite.data[7]!);
  sprite.oam.objMode = ST_OAM_OBJ_BLEND;
  sprite.callback = AnimForesightMagnifyingGlass_Step;
}

function AnimForesightMagnifyingGlass_Step(sprite: Sprite): void {
  const b = sprite.data[7]!;
  switch (sprite.data[5]) {
  case 0: {
    let x = 0;
    let y = 0;
    switch (sprite.data[6]) {
    default:
      sprite.data[6] = 0;
      // fall through
    case 0:
    case 4:
      x = u16(GetBattlerSpriteCoordAttr(b, C.BATTLER_COORD_ATTR_RIGHT) - 4);
      y = u16(GetBattlerSpriteCoordAttr(b, C.BATTLER_COORD_ATTR_BOTTOM) - 4);
      break;
    case 1:
      x = u16(GetBattlerSpriteCoordAttr(b, C.BATTLER_COORD_ATTR_RIGHT) - 4);
      y = u16(GetBattlerSpriteCoordAttr(b, C.BATTLER_COORD_ATTR_TOP) + 4);
      break;
    case 2:
      x = u16(GetBattlerSpriteCoordAttr(b, C.BATTLER_COORD_ATTR_LEFT) + 4);
      y = u16(GetBattlerSpriteCoordAttr(b, C.BATTLER_COORD_ATTR_BOTTOM) - 4);
      break;
    case 3:
      x = u16(GetBattlerSpriteCoordAttr(b, C.BATTLER_COORD_ATTR_LEFT) + 4);
      y = u16(GetBattlerSpriteCoordAttr(b, C.BATTLER_COORD_ATTR_TOP) - 4);
      break;
    case 5:
      x = u16(GetBattlerSpriteCoord(b, C.BATTLER_COORD_X_2));
      y = u16(GetBattlerSpriteCoord(b, C.BATTLER_COORD_Y_PIC_OFFSET));
      break;
    }
    if (sprite.data[6] === 4) sprite.data[0] = 24;
    else if (sprite.data[6] === 5) sprite.data[0] = 6;
    else sprite.data[0] = 12;
    sprite.data[1] = sprite.x;
    sprite.data[2] = x;
    sprite.data[3] = sprite.y;
    sprite.data[4] = y;
    InitAnimLinearTranslation(sprite);
    sprite.data[5]!++;
    break;
  }
  case 1:
    if (AnimTranslateLinear(sprite)) {
      switch (sprite.data[6]) {
      default:
        sprite.x += sprite.x2;
        sprite.y += sprite.y2;
        sprite.y2 = 0;
        sprite.x2 = 0;
        sprite.data[0] = 0;
        sprite.data[5]!++;
        sprite.data[6]!++;
        break;
      case 4:
        sprite.x += sprite.x2;
        sprite.y += sprite.y2;
        sprite.y2 = 0;
        sprite.x2 = 0;
        sprite.data[5] = 0;
        sprite.data[6]!++;
        break;
      case 5:
        sprite.data[0] = 0;
        sprite.data[1] = 16;
        sprite.data[2] = 0;
        sprite.data[5] = 3;
        break;
      }
    }
    break;
  case 2:
    if (++sprite.data[0]! === 4) sprite.data[5] = 0;
    break;
  case 3:
    if (!(sprite.data[0]! & 1)) sprite.data[1]!--;
    else sprite.data[2]!++;
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[1]!, sprite.data[2]!));
    if (++sprite.data[0]! === 32) {
      sprite.invisible = true;
      sprite.data[5]!++;
    }
    break;
  case 4:
    DestroyAnimSprite(sprite);
    break;
  }
}

function AnimMeteorMashStar_Step(sprite: Sprite): void {
  sprite.x2 = Math.trunc(((sprite.data[2]! - sprite.data[0]!) * sprite.data[5]!) / sprite.data[4]!);
  sprite.y2 = Math.trunc(((sprite.data[3]! - sprite.data[1]!) * sprite.data[5]!) / sprite.data[4]!);
  if (!(sprite.data[5]! & 1)) CreateSprite(animTemplate("gMiniTwinklingStarSpriteTemplate"), sprite.x + sprite.x2, sprite.y + sprite.y2, 5);
  if (sprite.data[5] === sprite.data[4]) DestroyAnimSprite(sprite);
  sprite.data[5]!++;
}

// Moves a shooting star across the screen that leaves little twinkling stars behind its path.
function AnimMeteorMashStar(sprite: Sprite): void {
  GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X_2);
  GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) {
    sprite.data[0] = sprite.x - gBattleAnimArgs[0]!;
    sprite.data[2] = sprite.x - gBattleAnimArgs[2]!;
  } else {
    sprite.data[0] = sprite.x + gBattleAnimArgs[0]!;
    sprite.data[2] = sprite.x + gBattleAnimArgs[2]!;
  }
  sprite.data[1] = sprite.y + gBattleAnimArgs[1]!;
  sprite.data[3] = sprite.y + gBattleAnimArgs[3]!;
  sprite.data[4] = gBattleAnimArgs[4]!;
  sprite.x = sprite.data[0]!;
  sprite.y = sprite.data[1]!;
  sprite.callback = AnimMeteorMashStar_Step;
}

export function AnimTask_MonToSubstitute(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  const t = gTasks[taskId]!;
  if (t.data[0] === 0) {
    PrepareBattlerSpriteForRotScale(spriteId, ST_OAM_OBJ_NORMAL);
    t.data[1] = 0x100;
    t.data[2] = 0x100;
    t.data[0]!++;
  } else if (t.data[0] === 1) {
    t.data[1]! += 0x60;
    t.data[2]! -= 0xd;
    SetSpriteRotScale(spriteId, t.data[1]!, t.data[2]!, 0);
    if (++t.data[3]! === 9) {
      t.data[3] = 0;
      ResetSpriteRotScale(spriteId);
      gSprites[spriteId]!.invisible = true;
      t.data[0]!++;
    }
  } else {
    LoadBattleMonGfxAndAnimate(animState.gBattleAnimAttacker, false, spriteId);
    for (let i = 0; i < 16; i++) t.data[i] = 0;
    t.func = AnimTask_MonToSubstituteDoll;
  }
}

function AnimTask_MonToSubstituteDoll(taskId: number): void {
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  const t = gTasks[taskId]!;
  const mon = gSprites[spriteId]!;
  switch (t.data[0]) {
  case 0:
    mon.y2 = -200;
    mon.x2 = 200;
    mon.invisible = false;
    t.data[10] = 0;
    t.data[0]!++;
    break;
  case 1:
    t.data[10]! += 112;
    mon.y2 += t.data[10]! >> 8;
    if (mon.y + mon.y2 >= -32) mon.x2 = 0;
    if (mon.y2 > 0) mon.y2 = 0;
    if (mon.y2 === 0) {
      PlaySE12WithPanning(C.SE_M_BUBBLE2, BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER));
      t.data[10] = s16(t.data[10]! - 0x800);
      t.data[0]!++;
    }
    break;
  case 2:
    t.data[10]! -= 112;
    if (t.data[10]! < 0) t.data[10] = 0;
    mon.y2 -= t.data[10]! >> 8;
    if (t.data[10] === 0) t.data[0]!++;
    break;
  case 3:
    t.data[10]! += 112;
    mon.y2 += t.data[10]! >> 8;
    if (mon.y2 > 0) mon.y2 = 0;
    if (mon.y2 === 0) {
      PlaySE12WithPanning(C.SE_M_BUBBLE2, BattleAnimAdjustPanning(C.SOUND_PAN_ATTACKER));
      DestroyAnimVisualTask(taskId);
    }
    break;
  }
}

// Moves down an X that flickers and disappears.
function AnimBlockX(sprite: Sprite): void {
  let y: number;
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) {
    sprite.subpriority = (GetBattlerSpriteSubpriority(animState.gBattleAnimTarget) - 2) & 0xff;
    y = -144;
  } else {
    sprite.subpriority = (GetBattlerSpriteSubpriority(animState.gBattleAnimTarget) + 2) & 0xff;
    y = -96;
  }
  sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y_PIC_OFFSET);
  sprite.y2 = y;
  sprite.callback = AnimBlockX_Step;
}

function AnimBlockX_Step(sprite: Sprite): void {
  switch (sprite.data[0]) {
  case 0:
    sprite.y2 += 10;
    if (sprite.y2 >= 0) {
      PlaySE12WithPanning(C.SE_M_SKETCH, BattleAnimAdjustPanning(C.SOUND_PAN_TARGET));
      sprite.y2 = 0;
      sprite.data[0]!++;
    }
    break;
  case 1:
    sprite.data[1]! += 4;
    sprite.y2 = -(gSineTable[sprite.data[1]!]! >> 3);
    if (sprite.data[1]! > 0x7f) {
      PlaySE12WithPanning(C.SE_M_SKETCH, BattleAnimAdjustPanning(C.SOUND_PAN_TARGET));
      sprite.data[1] = 0;
      sprite.y2 = 0;
      sprite.data[0]!++;
    }
    break;
  case 2:
    sprite.data[1]! += 6;
    sprite.y2 = -(gSineTable[sprite.data[1]!]! >> 4);
    if (sprite.data[1]! > 0x7f) {
      sprite.data[1] = 0;
      sprite.y2 = 0;
      sprite.data[0]!++;
    }
    break;
  case 3:
    if (++sprite.data[1]! > 8) {
      PlaySE12WithPanning(C.SE_M_LEER, BattleAnimAdjustPanning(C.SOUND_PAN_TARGET));
      sprite.data[1] = 0;
      sprite.data[0]!++;
    }
    break;
  case 4:
    if (++sprite.data[1]! > 8) {
      sprite.data[1] = 0;
      sprite.data[2]!++;
      sprite.invisible = !!(sprite.data[2]! & 1);
      if (sprite.data[2] === 7) DestroyAnimSprite(sprite);
    }
    break;
  }
}

// Quickly moves two clones of the target mon back and forth.
export function AnimTask_OdorSleuthMovement(taskId: number): void {
  const spriteId1 = s16(CloneBattlerSpriteWithBlend(ANIM_TARGET));
  if (spriteId1 < 0) {
    DestroyAnimVisualTask(taskId);
    return;
  }
  const spriteId2 = s16(CloneBattlerSpriteWithBlend(ANIM_TARGET));
  if (spriteId2 < 0) {
    DestroySpriteWithActiveSheet(gSprites[spriteId1]!);
    DestroyAnimVisualTask(taskId);
    return;
  }
  const s1 = gSprites[spriteId1]!;
  const s2 = gSprites[spriteId2]!;
  s2.x2 += 24;
  s1.x2 -= 24;
  s2.data[0] = 0;
  s1.data[0] = 0;
  s2.data[1] = 0;
  s1.data[1] = 0;
  s2.data[2] = 0;
  s1.data[2] = 0;
  s2.data[3] = 16;
  s1.data[3] = -16;
  s2.data[4] = 0;
  s1.data[4] = 128;
  s2.data[5] = 24;
  s1.data[5] = 24;
  s2.data[6] = taskId;
  s1.data[6] = taskId;
  s2.data[7] = 0;
  s1.data[7] = 0;
  gTasks[taskId]!.data[0] = 2;
  if (!gBattleSpritesDataPtr.battlerData[animState.gBattleAnimTarget]!.invisible) {
    s2.invisible = false;
    s1.invisible = true;
  } else {
    s2.invisible = true;
    s1.invisible = true;
  }
  s2.oam.objMode = ST_OAM_OBJ_NORMAL;
  s1.oam.objMode = ST_OAM_OBJ_NORMAL;
  s2.callback = MoveOdorSleuthClone;
  s1.callback = MoveOdorSleuthClone;
  gTasks[taskId]!.func = AnimTask_OdorSleuthMovementWaitFinish;
}

function AnimTask_OdorSleuthMovementWaitFinish(taskId: number): void {
  if (gTasks[taskId]!.data[0] === 0) DestroyAnimVisualTask(taskId);
}

function MoveOdorSleuthClone(sprite: Sprite): void {
  if (++sprite.data[1]! > 1) {
    sprite.data[1] = 0;
    if (!gBattleSpritesDataPtr.battlerData[animState.gBattleAnimTarget]!.invisible) sprite.invisible = !sprite.invisible;
  }
  sprite.data[4] = sprite.data[4]! + sprite.data[3]!;
  sprite.data[4]! &= 0xff;
  sprite.x2 = Cos(sprite.data[4]!, sprite.data[5]!);
  switch (sprite.data[0]) {
  case 0:
    if (++sprite.data[2]! === 60) {
      sprite.data[2] = 0;
      sprite.data[0]!++;
    }
    break;
  case 1:
    if (++sprite.data[2]! > 0) {
      sprite.data[2] = 0;
      sprite.data[5]! -= 2;
      if (sprite.data[5]! < 0) {
        gTasks[sprite.data[6]!]!.data[sprite.data[7]!]!--;
        DestroySpriteWithActiveSheet(sprite);
      }
    }
    break;
  }
}

export function AnimTask_GetReturnPowerLevel(taskId: number): void {
  const f = animState.gAnimFriendship;
  gBattleAnimArgs[C.ARG_RET_ID] = 0;
  if (f < 60) gBattleAnimArgs[C.ARG_RET_ID] = 0;
  if (f > 60 && f < 92) gBattleAnimArgs[C.ARG_RET_ID] = 1;
  if (f > 91 && f < 201) gBattleAnimArgs[C.ARG_RET_ID] = 2;
  if (f > 200) gBattleAnimArgs[C.ARG_RET_ID] = 3;
  DestroyAnimVisualTask(taskId);
}

// Makes the mon run out of screen, run past the opposing mon, and return to its original position.
export function AnimTask_SnatchOpposingMonMove(taskId: number): void {
  const t = gTasks[taskId]!;
  const a = animState;
  switch (t.data[0]) {
  case 0: {
    const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
    t.data[1] = s16(t.data[1]! + 0x800);
    if (GetBattlerSide(a.gBattleAnimAttacker) === C.B_SIDE_PLAYER) gSprites[spriteId]!.x2 += t.data[1]! >> 8;
    else gSprites[spriteId]!.x2 -= t.data[1]! >> 8;
    t.data[1]! &= 0xff;
    const x = s16(gSprites[spriteId]!.x + gSprites[spriteId]!.x2);
    if (x < -32 || x > C.DISPLAY_WIDTH + 32) {
      t.data[1] = 0;
      t.data[0]!++;
    }
    break;
  }
  case 1: {
    const transform = gBattleSpritesDataPtr.battlerData[a.gBattleAnimAttacker]!.transformSpecies;
    let personality: number;
    let otId: number;
    let species: number;
    let subpriority: number;
    let isBackPic: boolean;
    let x: number;
    if (GetBattlerSide(a.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
      const mon = playerMon(gBattlerPartyIndexes[a.gBattleAnimAttacker]!);
      personality = GetMonData(mon, C.MON_DATA_PERSONALITY) >>> 0;
      otId = GetMonData(mon, C.MON_DATA_OT_ID) >>> 0;
      species = transform === C.SPECIES_NONE ? GetMonData(mon, C.MON_DATA_SPECIES) : transform;
      subpriority = (gSprites[GetAnimBattlerSpriteId(ANIM_TARGET)]!.subpriority + 1) & 0xff;
      isBackPic = false;
      x = C.DISPLAY_WIDTH + 32;
    } else {
      const mon = gEnemyParty[gBattlerPartyIndexes[a.gBattleAnimAttacker]!]!;
      personality = GetMonData(mon, C.MON_DATA_PERSONALITY) >>> 0;
      otId = GetMonData(mon, C.MON_DATA_OT_ID) >>> 0;
      species = transform === C.SPECIES_NONE ? GetMonData(mon, C.MON_DATA_SPECIES) : transform;
      subpriority = (gSprites[GetAnimBattlerSpriteId(ANIM_TARGET)]!.subpriority - 1) & 0xff;
      isBackPic = true;
      x = -32;
    }
    const spriteId2 = CreateAdditionalMonSpriteForMoveAnim(species, isBackPic, 0, x, GetBattlerSpriteCoord(a.gBattleAnimTarget, C.BATTLER_COORD_Y), subpriority, personality, otId, a.gBattleAnimAttacker, false);
    if (transform !== C.SPECIES_NONE) BlendPalette(OBJ_PLTT_ID(gSprites[spriteId2]!.oam.paletteNum), 16, 6, RGB_WHITE);
    t.data[15] = spriteId2;
    t.data[0]!++;
    break;
  }
  case 2: {
    const spriteId2 = t.data[15]! & 0xff;
    t.data[1] = s16(t.data[1]! + 0x800);
    if (GetBattlerSide(a.gBattleAnimAttacker) === C.B_SIDE_PLAYER) gSprites[spriteId2]!.x2 -= t.data[1]! >> 8;
    else gSprites[spriteId2]!.x2 += t.data[1]! >> 8;
    t.data[1]! &= 0xff;
    const x = s16(gSprites[spriteId2]!.x + gSprites[spriteId2]!.x2);
    if (t.data[14] === 0) {
      if (GetBattlerSide(a.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
        if (x < GetBattlerSpriteCoord(a.gBattleAnimTarget, C.BATTLER_COORD_X)) {
          t.data[14]!++;
          gBattleAnimArgs[7] = -1;
        }
      } else {
        if (x > GetBattlerSpriteCoord(a.gBattleAnimTarget, C.BATTLER_COORD_X)) {
          t.data[14]!++;
          gBattleAnimArgs[7] = -1;
        }
      }
    }
    if (x < -32 || x > C.DISPLAY_WIDTH + 32) {
      t.data[1] = 0;
      t.data[0]!++;
    }
    break;
  }
  case 3: {
    const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
    const spriteId2 = t.data[15]! & 0xff;
    DestroySpriteAndFreeResources_(gSprites[spriteId2]!);
    if (GetBattlerSide(a.gBattleAnimAttacker) === C.B_SIDE_PLAYER) gSprites[spriteId]!.x2 = -gSprites[spriteId]!.x - 32;
    else gSprites[spriteId]!.x2 = C.DISPLAY_WIDTH + 32 - gSprites[spriteId]!.x;
    t.data[0]!++;
    break;
  }
  case 4: {
    const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
    const mon = gSprites[spriteId]!;
    t.data[1] = s16(t.data[1]! + 0x800);
    if (GetBattlerSide(a.gBattleAnimAttacker) === C.B_SIDE_PLAYER) {
      mon.x2 += t.data[1]! >> 8;
      if (mon.x2 + mon.x >= GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_X)) mon.x2 = 0;
    } else {
      mon.x2 -= t.data[1]! >> 8;
      if (mon.x2 + mon.x <= GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_X)) mon.x2 = 0;
    }
    t.data[1] = t.data[1]! & 0xff;
    if (mon.x2 === 0) DestroyAnimVisualTask(taskId);
    break;
  }
  }
}

export function AnimUnusedItemBagSteal(sprite: Sprite): void {
  switch (sprite.data[7]) {
  case 0:
    if (gBattleAnimArgs[7] === -1) {
      PlaySE12WithPanning(C.SE_M_VITAL_THROW, BattleAnimAdjustPanning(C.SOUND_PAN_TARGET));
      sprite.y = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y) + 16;
      sprite.data[0] = -32;
      sprite.data[7]!++;
      sprite.invisible = false;
      if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_OPPONENT)
        sprite.subpriority = (gSprites[GetAnimBattlerSpriteId(ANIM_TARGET)]!.subpriority - 1) & 0xff;
    } else {
      sprite.invisible = true;
    }
    break;
  case 1:
    sprite.y2 = Sin(sprite.data[1]!, sprite.data[0]!);
    sprite.data[1]! += 5;
    if (sprite.data[1]! > 0x7f) {
      sprite.data[0] = Math.trunc(sprite.data[0]! / 2);
      sprite.data[3]!++;
      sprite.data[1]! -= 0x7f;
    }
    sprite.data[2]! += 0x100;
    if (GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER) sprite.x2 -= sprite.data[2]! >> 8;
    else sprite.x2 += sprite.data[2]! >> 8;
    sprite.data[2]! &= 0xff;
    if (sprite.data[3] === 2) DestroyAnimSprite(sprite);
    break;
  }
}

// Quickly moves the mon towards its partner and back.
export function AnimTask_SnatchPartnerMove(taskId: number): void {
  const t = gTasks[taskId]!;
  switch (t.data[15]) {
  case 0: {
    const attackerX = s16(GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X));
    const targetX = s16(GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X));
    t.data[0] = 6;
    if (attackerX > targetX) t.data[0]! *= -1;
    t.data[1] = attackerX;
    t.data[2] = targetX;
    t.data[15]!++;
    break;
  }
  case 1: {
    const mon = gSprites[gBattlerSpriteIds[animState.gBattleAnimAttacker]!]!;
    mon.x2 += t.data[0]!;
    if (t.data[0]! > 0) {
      if (mon.x + mon.x2 >= t.data[2]!) t.data[15]!++;
    } else {
      if (mon.x + mon.x2 <= t.data[2]!) t.data[15]!++;
    }
    break;
  }
  case 2:
    t.data[0]! *= -1;
    t.data[15]!++;
    break;
  case 3: {
    const mon = gSprites[gBattlerSpriteIds[animState.gBattleAnimAttacker]!]!;
    mon.x2 += t.data[0]!;
    if (t.data[0]! < 0) {
      if (mon.x + mon.x2 <= t.data[1]!) t.data[15]!++;
    } else {
      if (mon.x + mon.x2 >= t.data[1]!) t.data[15]!++;
    }
    break;
  }
  case 4:
  default:
    gSprites[gBattlerSpriteIds[animState.gBattleAnimAttacker]!]!.x2 = 0;
    DestroyAnimVisualTask(taskId);
    break;
  }
}

// Moves the mon's sprite back and forth in an unpredictable swaying motion.
export function AnimTask_TeeterDanceMovement(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[3] = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  task.data[4] = GetBattlerSide(animState.gBattleAnimAttacker) === C.B_SIDE_PLAYER ? 1 : -1;
  task.data[6] = gSprites[task.data[3]!]!.y;
  task.data[5] = gSprites[task.data[3]!]!.x;
  task.data[9] = 0;
  task.data[11] = 0;
  task.data[10] = 1;
  task.data[12] = 0;
  task.func = AnimTask_TeeterDanceMovement_Step;
}

function AnimTask_TeeterDanceMovement_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  const mon = gSprites[task.data[3]!]!;
  switch (task.data[0]) {
  case 0:
    task.data[11]! += 8;
    task.data[11]! &= 0xff;
    mon.x2 = gSineTable[task.data[11]!]! >> 5;
    task.data[9]! += 2;
    task.data[9]! &= 0xff;
    mon.x = (gSineTable[task.data[9]!]! >> 3) * task.data[4]! + task.data[5]!;
    if (task.data[9] === 0) {
      mon.x = task.data[5]!;
      task.data[0]!++;
    }
    break;
  case 1:
    task.data[11]! += 8;
    task.data[11]! &= 0xff;
    mon.x2 = gSineTable[task.data[11]!]! >> 5;
    if (task.data[11] === 0) {
      mon.x2 = 0;
      task.data[0]!++;
    }
    break;
  case 2:
    DestroyAnimVisualTask(taskId);
    break;
  }
}

function AnimKnockOffStrike_Step(sprite: Sprite): void {
  // These two cases are identical.
  sprite.data[1]! += sprite.data[0]!;
  sprite.data[1]! &= 0xff;
  sprite.x2 = Cos(sprite.data[1]!, 20);
  sprite.y2 = Sin(sprite.data[1]!, 20);
  if (sprite.animEnded) DestroyAnimSprite(sprite);
  sprite.data[2]!++;
}

// Animates a strike that swipes downard at the target mon.
function AnimKnockOffStrike(sprite: Sprite): void {
  if (GetBattlerSide(animState.gBattleAnimTarget) === C.B_SIDE_PLAYER) {
    sprite.x -= gBattleAnimArgs[0]!;
    sprite.y += gBattleAnimArgs[1]!;
    sprite.data[0] = -11;
    sprite.data[1] = 192;
    StartSpriteAffineAnim(sprite, 1);
  } else {
    sprite.data[0] = 11;
    sprite.data[1] = 192;
    sprite.x += gBattleAnimArgs[0]!;
    sprite.y += gBattleAnimArgs[1]!;
  }
  sprite.callback = AnimKnockOffStrike_Step;
}

// Gradually fades a rotating recyle arrow sprite in and back out.
function AnimRecycle(sprite: Sprite): void {
  sprite.x = GetBattlerSpriteCoord(animState.gBattleAnimAttacker, C.BATTLER_COORD_X_2);
  sprite.y = GetBattlerSpriteCoordAttr(animState.gBattleAnimAttacker, C.BATTLER_COORD_ATTR_TOP);
  if (sprite.y < 16) sprite.y = 16;
  sprite.data[6] = 0;
  sprite.data[7] = 16;
  sprite.callback = AnimRecycle_Step;
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[6]!, sprite.data[7]!));
}

function AnimRecycle_Step(sprite: Sprite): void {
  switch (sprite.data[2]) {
  case 0:
    if (++sprite.data[0]! > 1) {
      sprite.data[0] = 0;
      if (!(sprite.data[1]! & 1)) {
        if (sprite.data[6]! < 16) sprite.data[6]!++;
      } else {
        if (sprite.data[7] !== 0) sprite.data[7]!--;
      }
      sprite.data[1]!++;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[6]!, sprite.data[7]!));
      if (sprite.data[7] === 0) sprite.data[2]!++;
    }
    break;
  case 1:
    if (++sprite.data[0]! === 10) {
      sprite.data[0] = 0;
      sprite.data[1] = 0;
      sprite.data[2]!++;
    }
    break;
  case 2:
    if (++sprite.data[0]! > 1) {
      sprite.data[0] = 0;
      if (!(sprite.data[1]! & 1)) {
        if (sprite.data[6] !== 0) sprite.data[6]!--;
      } else {
        if (sprite.data[7]! < 16) sprite.data[7]!++;
      }
      sprite.data[1]!++;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(sprite.data[6]!, sprite.data[7]!));
      if (sprite.data[7] === 16) sprite.data[2]!++;
    }
    break;
  case 3:
    DestroySpriteAndMatrix(sprite);
    break;
  }
}

export function AnimTask_GetWeather(taskId: number): void {
  const w = animState.gWeatherMoveAnim;
  gBattleAnimArgs[C.ARG_RET_ID] = C.ANIM_WEATHER_NONE;
  if (w & C.B_WEATHER_SUN) gBattleAnimArgs[C.ARG_RET_ID] = C.ANIM_WEATHER_SUN;
  else if (w & C.B_WEATHER_RAIN) gBattleAnimArgs[C.ARG_RET_ID] = C.ANIM_WEATHER_RAIN;
  else if (w & C.B_WEATHER_SANDSTORM) gBattleAnimArgs[C.ARG_RET_ID] = C.ANIM_WEATHER_SANDSTORM;
  else if (w & C.B_WEATHER_HAIL) gBattleAnimArgs[C.ARG_RET_ID] = C.ANIM_WEATHER_HAIL;
  DestroyAnimVisualTask(taskId);
}

// Squishes the mon sprite vertically, and shakes it back and forth.
export function AnimTask_SlackOffSquish(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[0] = 0;
  task.data[15] = GetAnimBattlerSpriteId(gBattleAnimArgs[0]!);
  PrepareAffineAnimInTaskData(task, task.data[15]!, affineCmds("sSlackOffSquishAffineAnimCmds"));
  task.func = AnimTask_SlackOffSquish_Step;
}

function AnimTask_SlackOffSquish_Step(taskId: number): void {
  const task = gTasks[taskId]!;
  task.data[0]!++;
  if (task.data[0]! > 16 && task.data[0]! < 40) {
    if (++task.data[1]! > 2) {
      task.data[1] = 0;
      task.data[2]!++;
      if (!(task.data[2]! & 1)) gSprites[task.data[15]!]!.x2 = -1;
      else gSprites[task.data[15]!]!.x2 = 1;
    }
  } else {
    gSprites[task.data[15]!]!.x2 = 0;
  }
  if (!RunAffineAnimFromTaskData(task)) DestroyAnimVisualTask(taskId);
}

registerAnimSpriteCallbacks({
  AnimAssistPawprint, AnimBatonPassPokeball, AnimBlackSmoke, AnimBlockX, AnimClappingHand, AnimClappingHand2,
  AnimFacadeSweatDrop, AnimFang, AnimFlatterConfetti, AnimFlatterSpotlight, AnimForesightMagnifyingGlass,
  AnimGlareEyeDot, AnimGreenStar, AnimHelpingHandClap, AnimKnockOffStrike, AnimLeer, AnimLetterZ, AnimMeanLookEye,
  AnimMeteorMashStar, AnimMiniTwinklingStar, AnimPainSplitProjectile, AnimRapidSpin, AnimRecycle, AnimReversalOrb,
  AnimRoarNoiseLine, AnimSmellingSaltExclamation, AnimSmellingSaltsHand, AnimSmokeBallEscapeCloud, AnimSpikes,
  AnimSpotlight, AnimSwallowBlueOrb, AnimSweetScentPetal, AnimTealAlert, AnimTriAttackTriangle, AnimUnusedItemBagSteal,
  AnimWeakFrustrationAngerMark, AnimWhiteHalo, AnimWishStar, AnimYawnCloud,
});
registerAnimTasks({
  AnimTask_AcidArmor, AnimTask_BarrageBall, AnimTask_CastformGfxChange, AnimTask_CreateSpotlight, AnimTask_DeepInhale,
  AnimTask_DefenseCurlDeformMon, AnimTask_DoomDesireLightBeam, AnimTask_FacadeColorBlend, AnimTask_FadeScreenToWhite,
  AnimTask_FlailMovement, AnimTask_GetReturnPowerLevel, AnimTask_GetWeather, AnimTask_GlareEyeDots,
  AnimTask_HelpingHandAttackerMovement, AnimTask_IsHealingMove, AnimTask_IsMonInvisible, AnimTask_IsTargetPlayerSide,
  AnimTask_MonToSubstitute, AnimTask_MorningSunLightBeam, AnimTask_OdorSleuthMovement, AnimTask_PainSplitMovement,
  AnimTask_RapinSpinMonElevation, AnimTask_RemoveSpotlight, AnimTask_RockMonBackAndForth, AnimTask_RolePlaySilhouette,
  AnimTask_SetPsychicBackground, AnimTask_SlackOffSquish, AnimTask_SlideMonForFocusBand, AnimTask_SmellingSaltsSquish,
  AnimTask_SmokescreenImpact, AnimTask_SnatchOpposingMonMove, AnimTask_SnatchPartnerMove, AnimTask_SpitUpDeformMon,
  AnimTask_SquishAndSweatDroplets, AnimTask_StatusClearedEffect, AnimTask_StockpileDeformMon,
  AnimTask_StrongFrustrationGrowAndShrink, AnimTask_SwallowDeformMon, AnimTask_TeeterDanceMovement,
  AnimTask_TormentAttacker, AnimTask_TransformMon,
});
