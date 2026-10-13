// battle_anim_special.c: level-up healthbox flash, switch-out shrink/ball effect,
// the Poké Ball throw (arc, shrink, bounces, shakes, click and break-out, trainer
// block and ghost dodge), ball-open particles and mon fade, Substitute swap,
// shiny sparkles and the Safari bait/rock throw.
// Adaptation: RequestDma3Fill writes the OBJ VRAM directly.

import * as C from "../../generated/constants";
import { sound } from "../../audio/sound";
import { tasks, TaskDummy } from "../../gba/tasks";
import { cdata, incbin, incbin16 } from "../../hw/assets";
import { templateFrom, type CSpriteTemplate } from "../../hw/cdataSprite";
import { GetGpuReg, SetGpuReg, SetGpuRegBits } from "../../hw/gpu";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalette, BlendPalettes, gPaletteFade, gPlttBufferUnfaded, LoadPalette, OBJ_PLTT_ID,
  PLTT_SIZE_4BPP, RGB, RGB_BLACK, RGB_WHITE,
} from "../../hw/palette";
import { BLDALPHA_BLEND, OBJ_VRAM0, ppu } from "../../hw/ppu";
import { gMain } from "../../hw/runtime";
import {
  AllocSpritePalette, AnimateSprite, ChangeSpriteAffineAnim, CreateInvisibleSprite, CreateSprite, DestroySprite,
  DestroySpriteAndFreeResources, FreeOamMatrix, FreeSpriteOamMatrix, FreeSpritePaletteByTag, FreeSpriteTilesByTag,
  GetSpriteTileStartByTag, gSprites, IndexOfSpritePaletteTag, MAX_SPRITES, SpriteCallbackDummy, StartSpriteAffineAnim,
  StartSpriteAnim, ST_OAM_OBJ_BLEND, ST_OAM_OBJ_NORMAL, ST_OAM_OBJ_WINDOW, type Sprite, type SpriteTemplate,
} from "../../hw/sprite";
import { Cos, Sin } from "../../hw/trig";
import { GetMonData, gEnemyParty, playerMon, type Mon } from "../../pokemon/mon";
import { save } from "../../save";
import {
  animState, AnimLoadCompressedBgGfx, AnimLoadCompressedBgTilemap, copySprite, DestroyAnimSprite, DestroyAnimVisualTask,
  GetBattleAnimBg1Data, GetBattlePalettesMask, GetBattlerSpriteBGPriorityRank, GetBattlerSpriteCoord, GetBattlerSpriteSubpriority,
  InitAnimArcTranslation, InitSpritePosToAnimAttacker, IsBattlerSpriteVisible, PrepareBattlerSpriteForRotScale, ResetBattleAnimBg,
  ResetSpriteRotScale, SetBattlerSpriteYOffsetFromYScale, SetSpriteRotScale, TranslateAnimHorizontalArc, TranslateAnimVerticalArc,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import {
  gBattleAnimPaletteTable, gBattleAnimPicTable, LoadCompressedSpritePaletteUsingHeap, LoadCompressedSpriteSheetUsingHeap,
  type CompressedSpritePalette, type CompressedSpriteSheet,
} from "../animScript";
import { ClearBehindSubstituteBit, LoadBattleMonGfxAndAnimate } from "../gfx_sfx_util";
import { G, gBattleCommunication, gBattlerPartyIndexes, gBattlerSpriteIds, gBattleSpritesDataPtr, gHealthboxSpriteIds } from "../globals";
import { BG_ANIM_AREA_OVERFLOW_MODE, BG_ANIM_CHAR_BASE_BLOCK, BG_ANIM_PRIORITY, BG_ANIM_SCREEN_SIZE, SetAnimBgAttribute } from "../intro";
import { UpdateOamPriorityInAllHealthboxes } from "../interface";
import { SpriteCB_PlayerThrowInit } from "../main_init";
import { FreeBallGfx, gBallSpriteTemplates, LoadBallGfx } from "../pokeball";
import { GetBattlerAtPosition, GetBattlerSide } from "../util";
import { animTemplate, gBattleAnimArgs, gTasks, IsContest, PlaySE, PlaySE12WithPanning } from "./common";

const ANIM_SPRITES_START = 10000;
const s16 = (v: number) => (v << 16) >> 16;
const u16 = (v: number) => v & 0xffff;

let gMonShrinkDuration = 0;
let gMonShrinkDelta = 0;
let gMonShrinkDistance = 0;

type CaptureStar = { xOffset: number; yOffset: number; amplitude: number };
const sCaptureStar = () => cdata<CaptureStar[]>("battle_anim_special", "sCaptureStar");
export const gBallParticleSpritesheets = () => cdata<CompressedSpriteSheet[]>("battle_anim_special", "gBallParticleSpritesheets");
export const gBallParticlePalettes = () => cdata<CompressedSpritePalette[]>("battle_anim_special", "gBallParticlePalettes");
const sBallParticleAnimNums = () => cdata<number[]>("battle_anim_special", "sBallParticleAnimNums");
const sBallOpenFadeColors = () => cdata<number[]>("battle_anim_special", "sBallOpenFadeColors");

let particleTemplates: SpriteTemplate[] | null = null;
function sBallParticlesSpriteTemplates(): SpriteTemplate[] {
  return (particleTemplates ??= cdata<CSpriteTemplate[]>("battle_anim_special", "sBallParticlesSpriteTemplates").map((t) => templateFrom(t)));
}

function battlerMon(battlerId: number): Mon {
  return GetBattlerSide(battlerId) === C.B_SIDE_PLAYER
    ? playerMon(gBattlerPartyIndexes[battlerId]!)
    : gEnemyParty[gBattlerPartyIndexes[battlerId]!]!;
}

// Unused
export function AnimTask_LevelUpHealthBox(taskId: number): void {
  const battler = animState.gBattleAnimAttacker;
  G.gBattle_WIN0H = 0;
  G.gBattle_WIN0V = 0;
  SetGpuReg(C.REG_OFFSET_WININ, C.WININ_WIN0_BG_ALL | C.WININ_WIN0_OBJ | C.WININ_WIN0_CLR | C.WININ_WIN1_BG_ALL | C.WININ_WIN1_OBJ | C.WININ_WIN1_CLR);
  SetGpuReg(C.REG_OFFSET_WINOUT, C.WINOUT_WIN01_BG0 | C.WINOUT_WIN01_BG2 | C.WINOUT_WIN01_BG3 | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR | C.WINOUT_WINOBJ_BG_ALL | C.WINOUT_WINOBJ_OBJ | C.WINOUT_WINOBJ_CLR);
  SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_OBJWIN_ON);
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG1 | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
  SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 0);
  SetAnimBgAttribute(1, BG_ANIM_SCREEN_SIZE, 0);
  SetAnimBgAttribute(1, BG_ANIM_AREA_OVERFLOW_MODE, 1);
  SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 1);
  const healthBoxSpriteId = gHealthboxSpriteIds[battler]!;
  const spriteId1 = gSprites[healthBoxSpriteId]!.oam.affineParam & 0xff;
  const spriteId2 = gSprites[healthBoxSpriteId]!.data[5]! & 0xff;
  const spriteId3 = CreateInvisibleSprite(SpriteCallbackDummy);
  const spriteId4 = CreateInvisibleSprite(SpriteCallbackDummy);
  gSprites[healthBoxSpriteId]!.oam.priority = 1;
  gSprites[spriteId1]!.oam.priority = 1;
  gSprites[spriteId2]!.oam.priority = 1;
  copySprite(gSprites[spriteId3]!, gSprites[healthBoxSpriteId]!);
  copySprite(gSprites[spriteId4]!, gSprites[spriteId1]!);
  gSprites[spriteId3]!.oam.objMode = ST_OAM_OBJ_WINDOW;
  gSprites[spriteId4]!.oam.objMode = ST_OAM_OBJ_WINDOW;
  gSprites[spriteId3]!.callback = SpriteCallbackDummy;
  gSprites[spriteId4]!.callback = SpriteCallbackDummy;
  const animBgData = GetBattleAnimBg1Data();
  AnimLoadCompressedBgTilemap(animBgData.bgId, incbin16("gUnusedLevelupAnimationTilemap"));
  AnimLoadCompressedBgGfx(animBgData.bgId, incbin("gUnusedLevelupAnimationGfx"), animBgData.tilesOffset);
  LoadPalette(incbin("gCureBubblesPal"), BG_PLTT_ID(animBgData.paletteId), PLTT_SIZE_4BPP);
  G.gBattle_BG1_X = -gSprites[spriteId3]!.x + 32;
  G.gBattle_BG1_Y = -gSprites[spriteId3]!.y - 32;
  const t = gTasks[taskId]!;
  t.data[1] = 640;
  t.data[0] = spriteId3;
  t.data[2] = spriteId4;
  t.func = AnimTask_UnusedLevelUpHealthBox_Step;
}

function AnimTask_UnusedLevelUpHealthBox_Step(taskId: number): void {
  const battler = animState.gBattleAnimAttacker;
  const t = gTasks[taskId]!;
  t.data[13] = s16(t.data[13]! + t.data[1]!);
  G.gBattle_BG1_Y += u16(t.data[13]!) >> 8;
  t.data[13] = t.data[13]! & 0xff;

  switch (t.data[15]) {
  case 0:
    if (t.data[11]!++ > 1) {
      t.data[11] = 0;
      t.data[12]!++;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(t.data[12]!, 16 - t.data[12]!));
      if (t.data[12] === 8) t.data[15]!++;
    }
    break;
  case 1:
    if (++t.data[10]! === 30) t.data[15]!++;
    break;
  case 2:
    if (t.data[11]!++ > 1) {
      t.data[11] = 0;
      t.data[12]!--;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(t.data[12]!, 16 - t.data[12]!));
      if (t.data[12] === 0) {
        ResetBattleAnimBg(0);
        G.gBattle_WIN0H = 0;
        G.gBattle_WIN0V = 0;
        SetGpuReg(C.REG_OFFSET_WININ, C.WININ_WIN0_BG_ALL | C.WININ_WIN0_OBJ | C.WININ_WIN0_CLR | C.WININ_WIN1_BG_ALL | C.WININ_WIN1_OBJ | C.WININ_WIN1_CLR);
        SetGpuReg(C.REG_OFFSET_WINOUT, C.WINOUT_WIN01_BG_ALL | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR | C.WINOUT_WINOBJ_BG_ALL | C.WINOUT_WINOBJ_OBJ | C.WINOUT_WINOBJ_CLR);
        if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 0);

        SetGpuReg(C.REG_OFFSET_DISPCNT, GetGpuReg(C.REG_OFFSET_DISPCNT) ^ C.DISPCNT_OBJWIN_ON);
        SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 0));
        DestroySprite(gSprites[t.data[0]!]!);
        DestroySprite(gSprites[t.data[2]!]!);
        SetAnimBgAttribute(1, BG_ANIM_AREA_OVERFLOW_MODE, 0);
        const hb = gHealthboxSpriteIds[battler]!;
        const spriteId1 = gSprites[hb]!.oam.affineParam & 0xff;
        const spriteId2 = gSprites[hb]!.data[5]! & 0xff;
        gSprites[hb]!.oam.priority = 1;
        gSprites[spriteId1]!.oam.priority = 1;
        gSprites[spriteId2]!.oam.priority = 1;
        DestroyAnimVisualTask(taskId);
      }
    }
    break;
  }
}

export function DoLoadHealthboxPalsForLevelUp(battler: number): { paletteId1: number; paletteId2: number } {
  const healthBoxSpriteId = gHealthboxSpriteIds[battler]!;
  const spriteId1 = gSprites[healthBoxSpriteId]!.oam.affineParam & 0xff;
  const spriteId2 = gSprites[healthBoxSpriteId]!.data[5]! & 0xff;
  const paletteId1 = AllocSpritePalette(C.TAG_HEALTHBOX_PALS_1) & 0xff;
  const paletteId2 = AllocSpritePalette(C.TAG_HEALTHBOX_PALS_2) & 0xff;
  const offset1 = OBJ_PLTT_ID(gSprites[healthBoxSpriteId]!.oam.paletteNum);
  const offset2 = OBJ_PLTT_ID(gSprites[spriteId2]!.oam.paletteNum);
  LoadPalette(gPlttBufferUnfaded.slice(offset1, offset1 + 16), OBJ_PLTT_ID(paletteId1), PLTT_SIZE_4BPP);
  LoadPalette(gPlttBufferUnfaded.slice(offset2, offset2 + 16), OBJ_PLTT_ID(paletteId2), PLTT_SIZE_4BPP);
  gSprites[healthBoxSpriteId]!.oam.paletteNum = paletteId1;
  gSprites[spriteId1]!.oam.paletteNum = paletteId1;
  gSprites[spriteId2]!.oam.paletteNum = paletteId2;
  return { paletteId1, paletteId2 };
}

export function AnimTask_LoadHealthboxPalsForLevelUp(taskId: number): void {
  DoLoadHealthboxPalsForLevelUp(animState.gBattleAnimAttacker);
  DestroyAnimVisualTask(taskId);
}

export function DoFreeHealthboxPalsForLevelUp(battler: number): void {
  const healthBoxSpriteId = gHealthboxSpriteIds[battler]!;
  const spriteId1 = gSprites[healthBoxSpriteId]!.oam.affineParam & 0xff;
  const spriteId2 = gSprites[healthBoxSpriteId]!.data[5]! & 0xff;
  FreeSpritePaletteByTag(C.TAG_HEALTHBOX_PALS_1);
  FreeSpritePaletteByTag(C.TAG_HEALTHBOX_PALS_2);
  const paletteId1 = IndexOfSpritePaletteTag(C.TAG_HEALTHBOX_PAL) & 0xff;
  const paletteId2 = IndexOfSpritePaletteTag(C.TAG_HEALTHBAR_PAL) & 0xff;
  gSprites[healthBoxSpriteId]!.oam.paletteNum = paletteId1;
  gSprites[spriteId1]!.oam.paletteNum = paletteId1;
  gSprites[spriteId2]!.oam.paletteNum = paletteId2;
}

export function AnimTask_FreeHealthboxPalsForLevelUp(taskId: number): void {
  DoFreeHealthboxPalsForLevelUp(animState.gBattleAnimAttacker);
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_FlashHealthboxOnLevelUp(taskId: number): void {
  const t = gTasks[taskId]!;
  t.data[10] = gBattleAnimArgs[0]!;
  t.data[11] = gBattleAnimArgs[1]!;
  t.func = AnimTask_FlashHealthboxOnLevelUp_Step;
}

function AnimTask_FlashHealthboxOnLevelUp_Step(taskId: number): void {
  const t = gTasks[taskId]!;
  t.data[0]!++;
  if (t.data[0]!++ >= t.data[11]!) {
    t.data[0] = 0;
    const paletteNum = IndexOfSpritePaletteTag(C.TAG_HEALTHBOX_PALS_1) & 0xff;
    const colorOffset = t.data[10] === 0 ? 6 : 2;
    switch (t.data[1]) {
    case 0: {
      t.data[2]! += 2;
      if (t.data[2]! > 16) t.data[2] = 16;
      const paletteOffset = OBJ_PLTT_ID(paletteNum);
      BlendPalette(paletteOffset + colorOffset, 1, t.data[2]!, RGB(20, 27, 31));
      if (t.data[2] === 16) t.data[1]!++;
      break;
    }
    case 1: {
      t.data[2]! -= 2;
      if (t.data[2]! < 0) t.data[2] = 0;
      const paletteOffset = OBJ_PLTT_ID(paletteNum);
      BlendPalette(paletteOffset + colorOffset, 1, t.data[2]!, RGB(20, 27, 31));
      if (t.data[2] === 0) DestroyAnimVisualTask(taskId);
      break;
    }
    }
  }
}

export function AnimTask_SwitchOutShrinkMon(taskId: number): void {
  const spriteId = gBattlerSpriteIds[animState.gBattleAnimAttacker]!;
  const t = gTasks[taskId]!;
  switch (t.data[0]) {
  case 0:
    PrepareBattlerSpriteForRotScale(spriteId, ST_OAM_OBJ_NORMAL);
    t.data[10] = 0x100;
    t.data[0]!++;
    break;
  case 1:
    t.data[10]! += 0x30;
    SetSpriteRotScale(spriteId, t.data[10]!, t.data[10]!, 0);
    SetBattlerSpriteYOffsetFromYScale(spriteId);
    if (t.data[10]! >= 0x2d0) t.data[0]!++;
    break;
  case 2:
    ResetSpriteRotScale(spriteId);
    gSprites[spriteId]!.invisible = true;
    DestroyAnimVisualTask(taskId);
    break;
  }
}

export function AnimTask_SwitchOutBallEffect(taskId: number): void {
  const a = animState;
  const spriteId = gBattlerSpriteIds[a.gBattleAnimAttacker]!;
  const ball = GetMonData(battlerMon(a.gBattleAnimAttacker), C.MON_DATA_POKEBALL);
  const ballId = ItemIdToBallId(ball);
  const t = gTasks[taskId]!;
  switch (t.data[0]) {
  case 0: {
    const x = GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_X) & 0xff;
    const y = GetBattlerSpriteCoord(a.gBattleAnimAttacker, C.BATTLER_COORD_Y) & 0xff;
    const priority = gSprites[spriteId]!.oam.priority;
    const subpriority = gSprites[spriteId]!.subpriority;
    t.data[10] = AnimateBallOpenParticles(x, y + 32, priority, subpriority, ballId);
    const selectedPalettes = GetBattlePalettesMask(true, false, false, false, false, false, false);
    t.data[11] = LaunchBallFadeMonTask(false, a.gBattleAnimAttacker, selectedPalettes, ballId);
    t.data[0]!++;
    break;
  }
  case 1:
    if (!gTasks[t.data[10]!]!.isActive && !gTasks[t.data[11]!]!.isActive) DestroyAnimVisualTask(taskId);
    break;
  }
}

export function AnimTask_LoadBallGfx(taskId: number): void {
  const ballId = ItemIdToBallId(G.gLastUsedItem);
  LoadBallGfx(ballId);
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_FreeBallGfx(taskId: number): void {
  const ballId = ItemIdToBallId(G.gLastUsedItem);
  FreeBallGfx(ballId);
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_IsBallBlockedByTrainerOrDodged(taskId: number): void {
  switch (gBattleSpritesDataPtr.animationData.ballThrowCaseId) {
  case C.BALL_TRAINER_BLOCK:
    gBattleAnimArgs[C.ARG_RET_ID] = -1;
    break;
  case C.BALL_GHOST_DODGE:
    gBattleAnimArgs[C.ARG_RET_ID] = -2;
    break;
  default:
    gBattleAnimArgs[C.ARG_RET_ID] = 0;
    break;
  }
  DestroyAnimVisualTask(taskId);
}

export function ItemIdToBallId(ballItem: number): number {
  switch (ballItem) {
  case C.ITEM_MASTER_BALL: return C.BALL_MASTER;
  case C.ITEM_ULTRA_BALL: return C.BALL_ULTRA;
  case C.ITEM_GREAT_BALL: return C.BALL_GREAT;
  case C.ITEM_SAFARI_BALL: return C.BALL_SAFARI;
  case C.ITEM_NET_BALL: return C.BALL_NET;
  case C.ITEM_DIVE_BALL: return C.BALL_DIVE;
  case C.ITEM_NEST_BALL: return C.BALL_NEST;
  case C.ITEM_REPEAT_BALL: return C.BALL_REPEAT;
  case C.ITEM_TIMER_BALL: return C.BALL_TIMER;
  case C.ITEM_LUXURY_BALL: return C.BALL_LUXURY;
  case C.ITEM_PREMIER_BALL: return C.BALL_PREMIER;
  case C.ITEM_POKE_BALL:
  default:
    return C.BALL_POKE;
  }
}

export function AnimTask_ThrowBall(taskId: number): void {
  const a = animState;
  const ballId = ItemIdToBallId(G.gLastUsedItem);
  const spriteId = CreateSprite(gBallSpriteTemplates()[ballId]!, 32, 80, 29);
  gSprites[spriteId]!.data[0] = 34;
  gSprites[spriteId]!.data[1] = GetBattlerSpriteCoord(a.gBattleAnimTarget, C.BATTLER_COORD_X);
  gSprites[spriteId]!.data[2] = GetBattlerSpriteCoord(a.gBattleAnimTarget, C.BATTLER_COORD_Y) - 16;
  gSprites[spriteId]!.callback = SpriteCB_ThrowBall_Init;
  gBattleSpritesDataPtr.animationData.wildMonInvisible = gSprites[gBattlerSpriteIds[a.gBattleAnimTarget]!]!.invisible ? 1 : 0;
  gTasks[taskId]!.data[0] = spriteId;
  gTasks[taskId]!.func = AnimTask_ThrowBall_WaitAnimObjComplete;
}

function AnimTask_ThrowBall_WaitAnimObjComplete(taskId: number): void {
  const spriteId = gTasks[taskId]!.data[0]! & 0xff;
  if (u16(gSprites[spriteId]!.data[0]!) === 0xffff) DestroyAnimVisualTask(taskId);
}

export function AnimTask_ThrowBallSpecial(taskId: number): void {
  let x: number;
  let y: number;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_OLD_MAN_TUTORIAL) {
    x = 28;
    y = 11;
  } else {
    x = 23;
    y = 11;
    if (save.playerGender === C.FEMALE) y = 13;
  }

  const ballId = ItemIdToBallId(G.gLastUsedItem);
  const subpriority = (GetBattlerSpriteSubpriority(GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT)) + 1) & 0xff;
  const spriteId = CreateSprite(gBallSpriteTemplates()[ballId]!, x | 32, y | 80, subpriority);
  gSprites[spriteId]!.data[0] = 34;
  gSprites[spriteId]!.data[1] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_X);
  gSprites[spriteId]!.data[2] = GetBattlerSpriteCoord(animState.gBattleAnimTarget, C.BATTLER_COORD_Y) - 16;
  gSprites[spriteId]!.callback = SpriteCallbackDummy;
  gSprites[gBattlerSpriteIds[GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT)]!]!.callback = SpriteCB_PlayerThrowInit;
  gTasks[taskId]!.data[0] = spriteId;
  gTasks[taskId]!.func = AnimTask_ThrowBallSpecial_PlaySfx;
}

function AnimTask_ThrowBallSpecial_PlaySfx(taskId: number): void {
  if (gSprites[gBattlerSpriteIds[GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT)]!]!.animCmdIndex === 1) {
    PlaySE12WithPanning(C.SE_BALL_THROW, 0);
    gSprites[gTasks[taskId]!.data[0]!]!.callback = SpriteCB_ThrowBall_Init;
    tasks.create(AnimTask_ThrowBallSpecial_ResetPlayerSprite, 10);
    gTasks[taskId]!.func = AnimTask_ThrowBall_WaitAnimObjComplete;
  }
}

function AnimTask_ThrowBallSpecial_ResetPlayerSprite(taskId: number): void {
  const player = gSprites[gBattlerSpriteIds[GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT)]!]!;
  if (player.animEnded) {
    StartSpriteAnim(player, 0);
    tasks.destroy(taskId);
  }
}

// sTransl_Speed data[0], InitX data[1], DestX data[2], InitY data[3], DestY data[4], ArcAmpl data[5]
function SpriteCB_ThrowBall_Init(sprite: Sprite): void {
  const destX = u16(sprite.data[1]!);
  const destY = u16(sprite.data[2]!);
  sprite.data[1] = sprite.x;
  sprite.data[2] = destX;
  sprite.data[3] = sprite.y;
  sprite.data[4] = destY;
  sprite.data[5] = -40;
  InitAnimArcTranslation(sprite);
  sprite.callback = SpriteCB_ThrowBall_ArcFlight;
}

function SpriteCB_ThrowBall_ArcFlight(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) {
    const caseId = gBattleSpritesDataPtr.animationData.ballThrowCaseId;
    if (caseId === C.BALL_TRAINER_BLOCK) {
      sprite.callback = TrainerBallBlock;
    } else if (caseId === C.BALL_GHOST_DODGE) {
      sprite.callback = GhostBallDodge;
    } else {
      StartSpriteAnim(sprite, 1);
      sprite.x += sprite.x2;
      sprite.y += sprite.y2;
      sprite.x2 = 0;
      sprite.y2 = 0;
      for (let i = 0; i < 8; i++) sprite.data[i] = 0;
      sprite.data[5] = 0;
      sprite.callback = SpriteCB_ThrowBall_TenFrameDelay;

      const ballId = ItemIdToBallId(G.gLastUsedItem);
      if (ballId < C.POKEBALL_COUNT) {
        AnimateBallOpenParticles(sprite.x, sprite.y - 5, 1, 28, ballId);
        LaunchBallFadeMonTask(false, animState.gBattleAnimTarget, 14, ballId);
      }
    }
  }
}

function SpriteCB_ThrowBall_TenFrameDelay(sprite: Sprite): void {
  if (++sprite.data[5]! === 10) {
    sprite.data[5] = tasks.create(TaskDummy, 50);
    sprite.callback = SpriteCB_ThrowBall_ShrinkMon;
    gSprites[gBattlerSpriteIds[animState.gBattleAnimTarget]!]!.data[1] = 0;
  }
}

function SpriteCB_ThrowBall_ShrinkMon(sprite: Sprite): void {
  const spriteId = gBattlerSpriteIds[animState.gBattleAnimTarget]!;
  const taskId = sprite.data[5]! & 0xff;
  const t = gTasks[taskId]!;
  if (++t.data[1]! === 11) PlaySE(C.SE_BALL_TRADE);

  switch (t.data[0]) {
  case 0:
    PrepareBattlerSpriteForRotScale(spriteId, ST_OAM_OBJ_NORMAL);
    t.data[10] = 256;
    gMonShrinkDuration = 28;
    gMonShrinkDistance = u16((gSprites[spriteId]!.y + gSprites[spriteId]!.y2) - (sprite.y + sprite.y2));
    gMonShrinkDelta = u16(Math.trunc((gMonShrinkDistance * 256) / gMonShrinkDuration));
    t.data[2] = s16(gMonShrinkDelta);
    t.data[0]!++;
    break;
  case 1:
    t.data[10]! += 0x20;
    SetSpriteRotScale(spriteId, t.data[10]!, t.data[10]!, 0);
    t.data[3] = s16(t.data[3]! + t.data[2]!);
    gSprites[spriteId]!.y2 = -t.data[3]! >> 8;
    if (t.data[10]! >= 0x480) t.data[0]!++;
    break;
  case 2:
    ResetSpriteRotScale(spriteId);
    gSprites[spriteId]!.invisible = true;
    t.data[0]!++;
    break;
  default:
    if (t.data[1]! > 10) {
      tasks.destroy(taskId);
      StartSpriteAnim(sprite, 2);
      sprite.data[5] = 0;
      sprite.callback = SpriteCB_ThrowBall_InitialFall;
    }
    break;
  }
}

function SpriteCB_ThrowBall_InitialFall(sprite: Sprite): void {
  if (sprite.animEnded) {
    sprite.data[3] = 0;
    sprite.data[4] = 40;
    sprite.data[5] = 0;
    const angle = 0;
    sprite.y += Cos(angle, 40);
    sprite.y2 = -Cos(angle, sprite.data[4]!);
    sprite.callback = SpriteCB_ThrowBall_Bounce;
  }
}

function SpriteCB_ThrowBall_Bounce(sprite: Sprite): void {
  let lastBounce = false;
  switch (sprite.data[3]! & 0xff) {
  case 0:
    sprite.y2 = -Cos(sprite.data[5]!, sprite.data[4]!);
    sprite.data[5]! += (sprite.data[3]! >> 8) + 4;
    if (sprite.data[5]! >= 64) {
      sprite.data[4]! -= 10;
      sprite.data[3]! += 257;

      const bounceCount = sprite.data[3]! >> 8;
      if (bounceCount === 4) lastBounce = true;

      // Play a different sound effect for each pokeball bounce.
      switch (bounceCount) {
      case 1: PlaySE(C.SE_BALL_BOUNCE_1); break;
      case 2: PlaySE(C.SE_BALL_BOUNCE_2); break;
      case 3: PlaySE(C.SE_BALL_BOUNCE_3); break;
      default: PlaySE(C.SE_BALL_BOUNCE_4); break;
      }
    }
    break;
  case 1:
    sprite.y2 = -Cos(sprite.data[5]!, sprite.data[4]!);
    sprite.data[5]! -= (sprite.data[3]! >> 8) + 4;
    if (sprite.data[5]! <= 0) {
      sprite.data[5] = 0;
      sprite.data[3]! &= -0x100;
    }
    break;
  }

  if (lastBounce) {
    sprite.data[3] = 0;
    sprite.y += Cos(64, 40);
    sprite.y2 = 0;
    if (gBattleSpritesDataPtr.animationData.ballThrowCaseId === C.BALL_NO_SHAKES) {
      sprite.data[5] = 0;
      sprite.callback = SpriteCB_ThrowBall_DelayThenBreakOut;
    } else {
      sprite.callback = SpriteCB_ThrowBall_InitShake;
      sprite.data[4] = 1;
      sprite.data[5] = 0;
    }
  }
}

function SpriteCB_ThrowBall_InitShake(sprite: Sprite): void {
  if (++sprite.data[3]! === 31) {
    sprite.data[3] = 0;
    sprite.affineAnimPaused = true;
    StartSpriteAffineAnim(sprite, 1);
    gBattleSpritesDataPtr.animationData.ballSubpx = 0;
    sprite.callback = SpriteCB_ThrowBall_DoShake;
    PlaySE(C.SE_BALL);
  }
}

function ballShakeStep(sprite: Sprite): void {
  const anim = gBattleSpritesDataPtr.animationData;
  if (anim.ballSubpx > 0xff) {
    sprite.x2 += sprite.data[4]!;
    anim.ballSubpx &= 0xff;
  } else {
    anim.ballSubpx += 0xb0;
  }
}

function SpriteCB_ThrowBall_DoShake(sprite: Sprite): void {
  const anim = gBattleSpritesDataPtr.animationData;
  switch (sprite.data[3]! & 0xff) {
  case 0: {
    ballShakeStep(sprite);
    sprite.data[5]!++;
    sprite.affineAnimPaused = false;
    const var0 = u16(sprite.data[5]! + 7);
    if (var0 > 14) {
      anim.ballSubpx = 0;
      sprite.data[3]!++;
      sprite.data[5] = 0;
    }
    break;
  }
  case 1:
    if (++sprite.data[5]! === 1) {
      sprite.data[5] = 0;
      sprite.data[4] = -sprite.data[4]!;
      sprite.data[3]!++;
      sprite.affineAnimPaused = false;
      if (sprite.data[4]! < 0) ChangeSpriteAffineAnim(sprite, 2);
      else ChangeSpriteAffineAnim(sprite, 1);
    } else {
      sprite.affineAnimPaused = true;
    }
    break;
  case 2: {
    ballShakeStep(sprite);
    sprite.data[5]!++;
    sprite.affineAnimPaused = false;
    const var0 = u16(sprite.data[5]! + 12);
    if (var0 > 24) {
      anim.ballSubpx = 0;
      sprite.data[3]!++;
      sprite.data[5] = 0;
    }
    break;
  }
  case 3:
    if (sprite.data[5]!++ < 0) {
      sprite.affineAnimPaused = true;
      break;
    }
    sprite.data[5] = 0;
    sprite.data[4] = -sprite.data[4]!;
    sprite.data[3]!++;
    sprite.affineAnimPaused = false;
    if (sprite.data[4]! < 0) ChangeSpriteAffineAnim(sprite, 2);
    else ChangeSpriteAffineAnim(sprite, 1);
    // fall through
  case 4: {
    ballShakeStep(sprite);
    sprite.data[5]!++;
    sprite.affineAnimPaused = false;
    const var0 = u16(sprite.data[5]! + 4);
    if (var0 > 8) {
      anim.ballSubpx = 0;
      sprite.data[3]!++;
      sprite.data[5] = 0;
      sprite.data[4] = -sprite.data[4]!;
    }
    break;
  }
  case 5: {
    sprite.data[3]! += 0x100;
    const state = (sprite.data[3]! >> 8) << 24 >> 24;
    if (state === anim.ballThrowCaseId) {
      sprite.affineAnimPaused = true;
      sprite.callback = SpriteCB_ThrowBall_DelayThenBreakOut;
    } else if (anim.ballThrowCaseId === C.BALL_3_SHAKES_SUCCESS && state === 3) {
      sprite.callback = SpriteCB_ThrowBall_InitClick;
      sprite.affineAnimPaused = true;
    } else {
      sprite.data[3]!++;
      sprite.affineAnimPaused = true;
    }
    break;
  }
  case 6:
  default:
    if (++sprite.data[5]! === 31) {
      sprite.data[5] = 0;
      sprite.data[3]! &= -0x100;
      StartSpriteAffineAnim(sprite, 3);
      if (sprite.data[4]! < 0) StartSpriteAffineAnim(sprite, 2);
      else StartSpriteAffineAnim(sprite, 1);
      PlaySE(C.SE_BALL);
    }
    break;
  }
}

function SpriteCB_ThrowBall_DelayThenBreakOut(sprite: Sprite): void {
  if (++sprite.data[5]! === 31) {
    sprite.data[5] = 0;
    sprite.callback = SpriteCB_ThrowBall_BeginBreakOut;
  }
}

function SpriteCB_ThrowBall_InitClick(sprite: Sprite): void {
  sprite.animPaused = true;
  sprite.callback = SpriteCB_ThrowBall_DoClick;
  sprite.data[3] = 0;
  sprite.data[4] = 0;
  sprite.data[5] = 0;
}

function SpriteCB_ThrowBall_DoClick(sprite: Sprite): void {
  const battler = animState.gBattleAnimTarget;
  sprite.data[4]!++;
  if (sprite.data[4] === 40) {
    PlaySE(C.SE_BALL_CLICK);
    BlendPalettes((0x10000 << sprite.oam.paletteNum) >>> 0, 6, RGB_BLACK);
    CreateStarsWhenBallClicks(sprite);
  } else if (sprite.data[4] === 60) {
    BeginNormalPaletteFade((0x10000 << sprite.oam.paletteNum) >>> 0, 2, 6, 0, RGB_BLACK);
  } else if (sprite.data[4] === 95) {
    G.gDoingBattleAnim = false;
    UpdateOamPriorityInAllHealthboxes(1);
    sound.m4aMPlayAllStop();
    PlaySE(C.MUS_CAUGHT_INTRO);
  } else if (sprite.data[4] === 315) {
    FreeOamMatrix(gSprites[gBattlerSpriteIds[battler]!]!.oam.matrixNum);
    DestroySprite(gSprites[gBattlerSpriteIds[battler]!]!);
    sprite.data[0] = 0;
    sprite.callback = SpriteCB_ThrowBall_FinishClick;
  }
}

function SpriteCB_ThrowBall_FinishClick(sprite: Sprite): void {
  switch (sprite.data[0]) {
  case 0: {
    sprite.data[1] = 0;
    sprite.data[2] = 0;
    sprite.oam.objMode = ST_OAM_OBJ_BLEND;
    SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16, 0));
    const paletteIndex = IndexOfSpritePaletteTag(sprite.template.paletteTag) & 0xff;
    BeginNormalPaletteFade((1 << (paletteIndex + 0x10)) >>> 0, 0, 0, 16, RGB_WHITE);
    sprite.data[0]!++;
    break;
  }
  case 1:
    if (sprite.data[1]!++ > 0) {
      sprite.data[1] = 0;
      sprite.data[2]!++;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16 - sprite.data[2]!, sprite.data[2]!));
      if (sprite.data[2] === 16) sprite.data[0]!++;
    }
    break;
  case 2:
    sprite.invisible = true;
    sprite.data[0]!++;
    break;
  default:
    if (!gPaletteFade.active) {
      SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      sprite.data[0] = 0;
      sprite.callback = BattleAnimObj_SignalEnd;
    }
    break;
  }
}

function BattleAnimObj_SignalEnd(sprite: Sprite): void {
  if (sprite.data[0] === 0) {
    sprite.data[0] = -1;
  } else {
    FreeSpriteOamMatrix(sprite);
    DestroySprite(sprite);
  }
}

function CreateStarsWhenBallClicks(sprite: Sprite): void {
  let subpriority: number;
  if (sprite.subpriority) {
    subpriority = sprite.subpriority - 1;
  } else {
    subpriority = 0;
    sprite.subpriority = 1;
  }

  LoadBallParticleGfx(C.BALL_MASTER);
  for (let i = 0; i < 3; i++) {
    const spriteId = CreateSprite(sBallParticlesSpriteTemplates()[C.BALL_MASTER]!, sprite.x, sprite.y, subpriority);
    if (spriteId !== MAX_SPRITES) {
      const star = gSprites[spriteId]!;
      const cs = sCaptureStar()[i]!;
      star.data[0] = 24;
      star.data[2] = sprite.x + cs.xOffset;
      star.data[4] = sprite.y + cs.yOffset;
      star.data[5] = cs.amplitude;
      InitAnimArcTranslation(star);
      star.callback = SpriteCB_BallCaptureSuccessStar;
      StartSpriteAnim(star, sBallParticleAnimNums()[C.BALL_MASTER]!);
    }
  }
}

function SpriteCB_BallCaptureSuccessStar(sprite: Sprite): void {
  sprite.invisible = !sprite.invisible;
  if (TranslateAnimHorizontalArc(sprite)) DestroySprite(sprite);
}

function SpriteCB_ThrowBall_BeginBreakOut(sprite: Sprite): void {
  const target = animState.gBattleAnimTarget;
  StartSpriteAnim(sprite, 1);
  StartSpriteAffineAnim(sprite, 0);
  sprite.callback = SpriteCB_ThrowBall_RunBreakOut;
  const ballId = ItemIdToBallId(G.gLastUsedItem);
  if (ballId < C.POKEBALL_COUNT) {
    AnimateBallOpenParticles(sprite.x, sprite.y - 5, 1, 28, ballId);
    LaunchBallFadeMonTask(true, target, 14, ballId);
  }

  const mon = gSprites[gBattlerSpriteIds[target]!]!;
  mon.invisible = false;
  StartSpriteAffineAnim(mon, 1);
  AnimateSprite(mon);
  mon.data[1] = 0x1000;
}

function SpriteCB_ThrowBall_RunBreakOut(sprite: Sprite): void {
  const mon = gSprites[gBattlerSpriteIds[animState.gBattleAnimTarget]!]!;
  let next = false;

  if (sprite.animEnded) sprite.invisible = true;

  if (mon.affineAnimEnded) {
    StartSpriteAffineAnim(mon, 0);
    next = true;
  } else {
    mon.data[1]! -= 288;
    mon.y2 = mon.data[1]! >> 8;
  }

  if (sprite.animEnded && next) {
    mon.y2 = 0;
    mon.invisible = !!gBattleSpritesDataPtr.animationData.wildMonInvisible;
    sprite.data[0] = 0;
    sprite.callback = BattleAnimObj_SignalEnd;
    G.gDoingBattleAnim = false;
    UpdateOamPriorityInAllHealthboxes(1);
  }
}

function TrainerBallBlock(sprite: Sprite): void {
  sprite.x += sprite.x2;
  sprite.y += sprite.y2;
  sprite.x2 = sprite.y2 = 0;
  for (let i = 0; i < 6; i++) sprite.data[i] = 0;
  sprite.callback = TrainerBallBlock2;
}

function TrainerBallBlock2(sprite: Sprite): void {
  const var0 = s16(sprite.data[0]! + 0x800);
  const var1 = s16(sprite.data[1]! + 0x680);

  sprite.x2 -= var1 >> 8;
  sprite.y2 += var0 >> 8;
  sprite.data[0] = (sprite.data[0]! + 0x800) & 0xff;
  sprite.data[1] = (sprite.data[1]! + 0x680) & 0xff;
  if (sprite.y + sprite.y2 > 160 || sprite.x + sprite.x2 < -8) {
    sprite.data[0] = 0;
    sprite.callback = BattleAnimObj_SignalEnd;
    G.gDoingBattleAnim = false;
    UpdateOamPriorityInAllHealthboxes(1);
  }
}

function GhostBallDodge(sprite: Sprite): void {
  sprite.x += sprite.x2;
  sprite.y += sprite.y2;
  sprite.x2 = sprite.y2 = 0;
  sprite.data[0] = 0x22;
  sprite.data[1] = sprite.x;
  sprite.data[2] = sprite.x - 8;
  sprite.data[3] = sprite.y;
  sprite.data[4] = 0x90;
  sprite.data[5] = 0x20;
  InitAnimArcTranslation(sprite);
  TranslateAnimVerticalArc(sprite);
  sprite.callback = GhostBallDodge2;
}

function GhostBallDodge2(sprite: Sprite): void {
  if (!TranslateAnimVerticalArc(sprite)) {
    if (sprite.y + sprite.y2 < 65) return;
  }
  sprite.data[0] = 0;
  sprite.callback = BattleAnimObj_SignalEnd;
  G.gDoingBattleAnim = false;
  UpdateOamPriorityInAllHealthboxes(1);
}

function LoadBallParticleGfx(ballId: number): void {
  if (GetSpriteTileStartByTag(gBallParticleSpritesheets()[ballId]!.tag) === 0xffff) {
    LoadCompressedSpriteSheetUsingHeap(gBallParticleSpritesheets()[ballId]!);
    LoadCompressedSpritePaletteUsingHeap(gBallParticlePalettes()[ballId]!);
  }
}

const sBallParticleAnimationFuncs: ((taskId: number) => void)[] = [];

export function AnimateBallOpenParticles(x: number, y: number, priority: number, subpriority: number, ballId: number): number {
  LoadBallParticleGfx(ballId);
  const taskId = tasks.create(sBallParticleAnimationFuncs[ballId]!, 5);
  const t = gTasks[taskId]!;
  t.data[1] = x & 0xff;
  t.data[2] = y & 0xff;
  t.data[3] = priority & 0xff;
  t.data[4] = subpriority & 0xff;
  t.data[15] = ballId & 0xff;
  PlaySE(C.SE_BALL_OPEN);
  return taskId;
}

function IncrementBattleParticleCounter(): void {
  if (gMain.inBattle) gBattleSpritesDataPtr.animationData.numBallParticles++;
}

function PokeBallOpenParticleAnimation(taskId: number): void {
  const t = gTasks[taskId]!;
  const ballId = t.data[15]! & 0xff;
  if (t.data[0]! < 16) {
    const x = t.data[1]! & 0xff;
    const y = t.data[2]! & 0xff;
    const priority = t.data[3]! & 0xff;
    const subpriority = t.data[4]! & 0xff;

    const spriteId = CreateSprite(sBallParticlesSpriteTemplates()[ballId]!, x, y, subpriority);
    if (spriteId !== MAX_SPRITES) {
      IncrementBattleParticleCounter();
      StartSpriteAnim(gSprites[spriteId]!, sBallParticleAnimNums()[ballId]!);
      gSprites[spriteId]!.callback = PokeBallOpenParticleAnimation_Step1;
      gSprites[spriteId]!.oam.priority = priority;

      let var0 = t.data[0]! & 0xff;
      if (var0 >= 8) var0 -= 8;
      gSprites[spriteId]!.data[0] = var0 * 32;
    }

    if (t.data[0] === 15) {
      if (!gMain.inBattle) gSprites[spriteId]!.data[7] = 1;
      tasks.destroy(taskId);
      return;
    }
  }
  t.data[0]!++;
}

function PokeBallOpenParticleAnimation_Step1(sprite: Sprite): void {
  if (sprite.data[1] === 0) sprite.callback = PokeBallOpenParticleAnimation_Step2;
  else sprite.data[1]!--;
}

function PokeBallOpenParticleAnimation_Step2(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[0]!, sprite.data[1]!);
  sprite.y2 = Cos(sprite.data[0]!, sprite.data[1]!);
  sprite.data[1]! += 2;
  if (sprite.data[1] === 50) DestroyBallOpenAnimationParticle(sprite);
}

/** The shared body of the fan-out particle tasks (Timer/Dive/Safari/Ultra): `count` sprites spaced by `step`. */
function fanOutParticles(taskId: number, count: number, step: number, d4: number, d5: number, d6: number): number {
  const t = gTasks[taskId]!;
  const ballId = t.data[15]! & 0xff;
  const x = t.data[1]! & 0xff;
  const y = t.data[2]! & 0xff;
  const priority = t.data[3]! & 0xff;
  const subpriority = t.data[4]! & 0xff;
  let spriteId = 0;
  for (let i = 0; i < count; i++) {
    spriteId = CreateSprite(sBallParticlesSpriteTemplates()[ballId]!, x, y, subpriority);
    if (spriteId !== MAX_SPRITES) {
      IncrementBattleParticleCounter();
      StartSpriteAnim(gSprites[spriteId]!, sBallParticleAnimNums()[ballId]!);
      gSprites[spriteId]!.callback = FanOutBallOpenParticles_Step1;
      gSprites[spriteId]!.oam.priority = priority;
      gSprites[spriteId]!.data[0] = i * step;
      gSprites[spriteId]!.data[4] = d4;
      gSprites[spriteId]!.data[5] = d5;
      gSprites[spriteId]!.data[6] = d6;
    }
  }
  return spriteId;
}

function TimerBallOpenParticleAnimation(taskId: number): void {
  const spriteId = fanOutParticles(taskId, 8, 32, 10, 2, 1);
  if (!gMain.inBattle) gSprites[spriteId]!.data[7] = 1;
  tasks.destroy(taskId);
}

function DiveBallOpenParticleAnimation(taskId: number): void {
  const spriteId = fanOutParticles(taskId, 8, 32, 10, 1, 2);
  if (!gMain.inBattle) gSprites[spriteId]!.data[7] = 1;
  tasks.destroy(taskId);
}

// Also used for Net Ball
function SafariBallOpenParticleAnimation(taskId: number): void {
  const spriteId = fanOutParticles(taskId, 8, 32, 4, 1, 1);
  if (!gMain.inBattle) gSprites[spriteId]!.data[7] = 1;
  tasks.destroy(taskId);
}

// Also used for Nest Ball
function UltraBallOpenParticleAnimation(taskId: number): void {
  const spriteId = fanOutParticles(taskId, 10, 25, 5, 1, 1);
  if (!gMain.inBattle) gSprites[spriteId]!.data[7] = 1;
  tasks.destroy(taskId);
}

// Also used for Luxury Ball
function GreatBallOpenParticleAnimation(taskId: number): void {
  const t = gTasks[taskId]!;
  if (t.data[7]) {
    t.data[7]!--;
  } else {
    const spriteId = fanOutParticles(taskId, 8, 32, 8, 2, 2);
    t.data[7] = 8;
    if (++t.data[0]! === 2) {
      if (!gMain.inBattle) gSprites[spriteId]!.data[7] = 1;
      tasks.destroy(taskId);
    }
  }
}

function FanOutBallOpenParticles_Step1(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[0]!, sprite.data[1]!);
  sprite.y2 = Cos(sprite.data[0]!, sprite.data[2]!);
  sprite.data[0] = (sprite.data[0]! + sprite.data[4]!) & 0xff;
  sprite.data[1]! += sprite.data[5]!;
  sprite.data[2]! += sprite.data[6]!;
  if (++sprite.data[3]! === 51) DestroyBallOpenAnimationParticle(sprite);
}

function RepeatBallOpenParticleAnimation(taskId: number): void {
  const t = gTasks[taskId]!;
  const ballId = t.data[15]! & 0xff;
  const x = t.data[1]! & 0xff;
  const y = t.data[2]! & 0xff;
  const priority = t.data[3]! & 0xff;
  const subpriority = t.data[4]! & 0xff;
  let spriteId = 0;
  for (let i = 0; i < C.POKEBALL_COUNT; i++) {
    spriteId = CreateSprite(sBallParticlesSpriteTemplates()[ballId]!, x, y, subpriority);
    if (spriteId !== MAX_SPRITES) {
      IncrementBattleParticleCounter();
      StartSpriteAnim(gSprites[spriteId]!, sBallParticleAnimNums()[ballId]!);
      gSprites[spriteId]!.callback = RepeatBallOpenParticleAnimation_Step1;
      gSprites[spriteId]!.oam.priority = priority;
      gSprites[spriteId]!.data[0] = i * 21;
    }
  }
  if (!gMain.inBattle) gSprites[spriteId]!.data[7] = 1;
  tasks.destroy(taskId);
}

function RepeatBallOpenParticleAnimation_Step1(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[0]!, sprite.data[1]!);
  sprite.y2 = Cos(sprite.data[0]!, Sin(sprite.data[0]!, sprite.data[2]!));
  sprite.data[0] = (sprite.data[0]! + 6) & 0xff;
  sprite.data[1]!++;
  sprite.data[2]!++;
  if (++sprite.data[3]! === 51) DestroyBallOpenAnimationParticle(sprite);
}

function MasterBallOpenParticleAnimation(taskId: number): void {
  const t = gTasks[taskId]!;
  const ballId = t.data[15]! & 0xff;
  const x = t.data[1]! & 0xff;
  const y = t.data[2]! & 0xff;
  const priority = t.data[3]! & 0xff;
  const subpriority = t.data[4]! & 0xff;
  let spriteId = 0;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 8; i++) {
      spriteId = CreateSprite(sBallParticlesSpriteTemplates()[ballId]!, x, y, subpriority);
      if (spriteId !== MAX_SPRITES) {
        IncrementBattleParticleCounter();
        StartSpriteAnim(gSprites[spriteId]!, sBallParticleAnimNums()[ballId]!);
        gSprites[spriteId]!.callback = FanOutBallOpenParticles_Step1;
        gSprites[spriteId]!.oam.priority = priority;
        gSprites[spriteId]!.data[0] = i * 32;
        gSprites[spriteId]!.data[4] = 8;
        if (j === 0) {
          gSprites[spriteId]!.data[5] = 2;
          gSprites[spriteId]!.data[6] = 1;
        } else {
          gSprites[spriteId]!.data[5] = 1;
          gSprites[spriteId]!.data[6] = 2;
        }
      }
    }
  }
  if (!gMain.inBattle) gSprites[spriteId]!.data[7] = 1;
  tasks.destroy(taskId);
}

function PremierBallOpenParticleAnimation(taskId: number): void {
  const t = gTasks[taskId]!;
  const ballId = t.data[15]! & 0xff;
  const x = t.data[1]! & 0xff;
  const y = t.data[2]! & 0xff;
  const priority = t.data[3]! & 0xff;
  const subpriority = t.data[4]! & 0xff;
  let spriteId = 0;
  for (let i = 0; i < 8; i++) {
    spriteId = CreateSprite(sBallParticlesSpriteTemplates()[ballId]!, x, y, subpriority);
    if (spriteId !== MAX_SPRITES) {
      IncrementBattleParticleCounter();
      StartSpriteAnim(gSprites[spriteId]!, sBallParticleAnimNums()[ballId]!);
      gSprites[spriteId]!.callback = PremierBallOpenParticleAnimation_Step1;
      gSprites[spriteId]!.oam.priority = priority;
      gSprites[spriteId]!.data[0] = i * 32;
    }
  }
  if (!gMain.inBattle) gSprites[spriteId]!.data[7] = 1;
  tasks.destroy(taskId);
}

function PremierBallOpenParticleAnimation_Step1(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[0]!, sprite.data[1]!);
  sprite.y2 = Cos(sprite.data[0]!, Sin(sprite.data[0]! & 0x3f, sprite.data[2]!));
  sprite.data[0] = (sprite.data[0]! + 10) & 0xff;
  sprite.data[1]!++;
  sprite.data[2]!++;
  if (++sprite.data[3]! === 51) DestroyBallOpenAnimationParticle(sprite);
}

function DestroyBallOpenAnimationParticle(sprite: Sprite): void {
  if (!gMain.inBattle) {
    if (sprite.data[7] === 1) DestroySpriteAndFreeResources(sprite);
    else DestroySprite(sprite);
  } else {
    const anim = gBattleSpritesDataPtr.animationData;
    anim.numBallParticles--;
    if (anim.numBallParticles === 0) {
      for (let j = 0; j < C.POKEBALL_COUNT; j++) {
        FreeSpriteTilesByTag(gBallParticleSpritesheets()[j]!.tag);
        FreeSpritePaletteByTag(gBallParticlePalettes()[j]!.tag);
      }
      DestroySprite(sprite);
    } else {
      DestroySprite(sprite);
    }
  }
}

sBallParticleAnimationFuncs[C.BALL_POKE] = PokeBallOpenParticleAnimation;
sBallParticleAnimationFuncs[C.BALL_GREAT] = GreatBallOpenParticleAnimation;
sBallParticleAnimationFuncs[C.BALL_SAFARI] = SafariBallOpenParticleAnimation;
sBallParticleAnimationFuncs[C.BALL_ULTRA] = UltraBallOpenParticleAnimation;
sBallParticleAnimationFuncs[C.BALL_MASTER] = MasterBallOpenParticleAnimation;
sBallParticleAnimationFuncs[C.BALL_NET] = SafariBallOpenParticleAnimation;
sBallParticleAnimationFuncs[C.BALL_DIVE] = DiveBallOpenParticleAnimation;
sBallParticleAnimationFuncs[C.BALL_NEST] = UltraBallOpenParticleAnimation;
sBallParticleAnimationFuncs[C.BALL_REPEAT] = RepeatBallOpenParticleAnimation;
sBallParticleAnimationFuncs[C.BALL_TIMER] = TimerBallOpenParticleAnimation;
sBallParticleAnimationFuncs[C.BALL_LUXURY] = GreatBallOpenParticleAnimation;
sBallParticleAnimationFuncs[C.BALL_PREMIER] = PremierBallOpenParticleAnimation;

export function LaunchBallFadeMonTask(unfadeLater: boolean, battler: number, selectedPalettes: number, ballId: number): number {
  const taskId = tasks.create(Task_FadeMon_ToBallColor, 5);
  const t = gTasks[taskId]!;
  t.data[15] = ballId;
  t.data[3] = battler;
  t.data[10] = s16(selectedPalettes);
  t.data[11] = s16(selectedPalettes >>> 16);

  if (!unfadeLater) {
    BlendPalette(OBJ_PLTT_ID(battler), 16, 0, sBallOpenFadeColors()[ballId]!);
    t.data[1] = 1;
  } else {
    BlendPalette(OBJ_PLTT_ID(battler), 16, 16, sBallOpenFadeColors()[ballId]!);
    t.data[0] = 16;
    t.data[1] = -1;
    t.func = Task_FadeMon_ToNormal;
  }

  BeginNormalPaletteFade(selectedPalettes >>> 0, 0, 0, 16, RGB_WHITE);
  return taskId;
}

const fadeSelected = (t: { data: number[] }) => (u16(t.data[10]!) | (u16(t.data[11]!) << 16)) >>> 0;

function Task_FadeMon_ToBallColor(taskId: number): void {
  const t = gTasks[taskId]!;
  const ballId = t.data[15]! & 0xff;
  if (t.data[2]! <= 16) {
    BlendPalette(OBJ_PLTT_ID(t.data[3]!), 16, t.data[0]!, sBallOpenFadeColors()[ballId]!);
    t.data[0]! += t.data[1]!;
    t.data[2]!++;
  } else if (!gPaletteFade.active) {
    BeginNormalPaletteFade(fadeSelected(t), 0, 16, 0, RGB_WHITE);
    tasks.destroy(taskId);
  }
}

function Task_FadeMon_ToNormal(taskId: number): void {
  if (!gPaletteFade.active) {
    BeginNormalPaletteFade(fadeSelected(gTasks[taskId]!), 0, 16, 0, RGB_WHITE);
    gTasks[taskId]!.func = Task_FadeMon_ToNormal_Step;
  }
}

function Task_FadeMon_ToNormal_Step(taskId: number): void {
  const t = gTasks[taskId]!;
  const ballId = t.data[15]! & 0xff;
  if (t.data[2]! <= 16) {
    BlendPalette(OBJ_PLTT_ID(t.data[3]!), 16, t.data[0]!, sBallOpenFadeColors()[ballId]!);
    t.data[0]! += t.data[1]!;
    t.data[2]!++;
  } else {
    tasks.destroy(taskId);
  }
}

export function AnimTask_SwapMonSpriteToFromSubstitute(taskId: number): void {
  const a = animState;
  const spriteId = gBattlerSpriteIds[a.gBattleAnimAttacker]!;
  const t = gTasks[taskId]!;
  const mon = gSprites[spriteId]!;
  let done = false;
  switch (t.data[10]) {
  case 0: {
    t.data[11] = gBattleAnimArgs[0]!;
    t.data[0] = s16(t.data[0]! + 0x500);
    if (GetBattlerSide(a.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) mon.x2 += t.data[0]! >> 8;
    else mon.x2 -= t.data[0]! >> 8;

    t.data[0] = t.data[0]! & 0xff;
    const x = (mon.x + mon.x2 + 32) >>> 0;
    if (x > 304) t.data[10]!++;
    break;
  }
  case 1:
    LoadBattleMonGfxAndAnimate(a.gBattleAnimAttacker, !!t.data[11], spriteId);
    t.data[10]!++;
    break;
  case 2:
    t.data[0] = s16(t.data[0]! + 0x500);
    if (GetBattlerSide(a.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) mon.x2 -= t.data[0]! >> 8;
    else mon.x2 += t.data[0]! >> 8;

    t.data[0] = t.data[0]! & 0xff;
    if (GetBattlerSide(a.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
      if (mon.x2 <= 0) {
        mon.x2 = 0;
        done = true;
      }
    } else {
      if (mon.x2 >= 0) {
        mon.x2 = 0;
        done = true;
      }
    }
    if (done) DestroyAnimVisualTask(taskId);
    break;
  }
}

export function AnimTask_SubstituteFadeToInvisible(taskId: number): void {
  const t = gTasks[taskId]!;
  switch (t.data[15]) {
  case 0:
    if (GetBattlerSpriteBGPriorityRank(animState.gBattleAnimAttacker) === C.B_POSITION_OPPONENT_LEFT)
      SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG1 | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
    else
      SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG2 | C.BLDCNT_EFFECT_BLEND | C.BLDCNT_TGT2_ALL);
    SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16, 0));
    t.data[15]!++;
    break;
  case 1:
    if (t.data[1]!++ > 1) {
      t.data[1] = 0;
      t.data[0]!++;
      SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16 - t.data[0]!, t.data[0]!));
      if (t.data[0] === 16) t.data[15]!++;
    }
    break;
  case 2: {
    const spriteId = gBattlerSpriteIds[animState.gBattleAnimAttacker]!;
    const start = OBJ_VRAM0 + gSprites[spriteId]!.oam.tileNum * C.TILE_SIZE_4BPP;
    ppu.vram.fill(0, start, start + 0x800);
    ClearBehindSubstituteBit(animState.gBattleAnimAttacker);
    DestroyAnimVisualTask(taskId);
    break;
  }
  }
}

export function AnimTask_IsAttackerBehindSubstitute(taskId: number): void {
  gBattleAnimArgs[C.ARG_RET_ID] = gBattleSpritesDataPtr.battlerData[animState.gBattleAnimAttacker]!.behindSubstitute;
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_SetTargetToEffectBattler(taskId: number): void {
  animState.gBattleAnimTarget = G.gEffectBattler;
  DestroyAnimVisualTask(taskId);
}

export function TryShinyAnimation(battler: number, mon: Mon): void {
  let isShiny = false;
  gBattleSpritesDataPtr.healthBoxesData[battler]!.triedShinyMonAnim = 1;
  const otId = GetMonData(mon, C.MON_DATA_OT_ID) >>> 0;
  const personality = GetMonData(mon, C.MON_DATA_PERSONALITY) >>> 0;

  if (IsBattlerSpriteVisible(battler)) {
    const shinyValue = (otId >>> 16) ^ (otId & 0xffff) ^ (personality >>> 16) ^ (personality & 0xffff);
    if (shinyValue < C.SHINY_ODDS) isShiny = true;

    if (isShiny) {
      if (GetSpriteTileStartByTag(C.ANIM_TAG_GOLD_STARS) === 0xffff) {
        LoadCompressedSpriteSheetUsingHeap(gBattleAnimPicTable(C.ANIM_TAG_GOLD_STARS - ANIM_SPRITES_START));
        LoadCompressedSpritePaletteUsingHeap(gBattleAnimPaletteTable(C.ANIM_TAG_GOLD_STARS - ANIM_SPRITES_START));
      }

      const taskId1 = tasks.create(AnimTask_ShinySparkles, 10);
      const taskId2 = tasks.create(AnimTask_ShinySparkles, 10);
      gTasks[taskId1]!.data[0] = battler;
      gTasks[taskId2]!.data[0] = battler;
      gTasks[taskId1]!.data[1] = 0;
      gTasks[taskId2]!.data[1] = 1;
      return;
    }
  }

  gBattleSpritesDataPtr.healthBoxesData[battler]!.finishedShinyMonAnim = 1;
}

function AnimTask_ShinySparkles(taskId: number): void {
  const t = gTasks[taskId]!;
  if (t.data[13]! < 60) {
    t.data[13]!++;
    return;
  }

  if (gBattleSpritesDataPtr.animationData.numBallParticles) return;

  const counter = u16(t.data[10]!++);
  if (counter & 3) return;

  const battler = t.data[0]! & 0xff;
  const x = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_X) & 0xff;
  const y = GetBattlerSpriteCoord(battler, C.BATTLER_COORD_Y) & 0xff;
  const state = s16(t.data[11]!);
  let spriteId: number;
  if (state === 0) {
    spriteId = CreateSprite(animTemplate("gWishStarSpriteTemplate"), x, y, 5);
  } else if (state >= 0 && t.data[11]! < 4) {
    spriteId = CreateSprite(animTemplate("gMiniTwinklingStarSpriteTemplate"), x, y, 5);
    gSprites[spriteId]!.oam.tileNum += 4;
  } else {
    spriteId = CreateSprite(animTemplate("gMiniTwinklingStarSpriteTemplate"), x, y, 5);
    gSprites[spriteId]!.oam.tileNum += 5;
  }

  if (!t.data[1]) {
    gSprites[spriteId]!.callback = SpriteCB_ShinySparkles_1;
  } else {
    gSprites[spriteId]!.callback = SpriteCB_ShinySparkles_2;
    gSprites[spriteId]!.x2 = -32;
    gSprites[spriteId]!.y2 = 32;
    gSprites[spriteId]!.invisible = true;
    if (!t.data[11]) {
      const pan = GetBattlerSide(battler) === C.B_SIDE_PLAYER ? C.SOUND_PAN_ATTACKER : C.SOUND_PAN_TARGET;
      PlaySE12WithPanning(C.SE_SHINY, pan);
    }
  }

  gSprites[spriteId]!.data[0] = taskId;
  t.data[11]!++;
  if (spriteId !== MAX_SPRITES) t.data[12]!++;

  if (t.data[11] === 5) t.func = AnimTask_ShinySparkles_WaitSparkles;
}

function AnimTask_ShinySparkles_WaitSparkles(taskId: number): void {
  const t = gTasks[taskId]!;
  if (!t.data[12]) {
    if (t.data[1] === 1) {
      const battler = t.data[0]! & 0xff;
      gBattleSpritesDataPtr.healthBoxesData[battler]!.finishedShinyMonAnim = 1;
    }
    tasks.destroy(taskId);
  }
}

function SpriteCB_ShinySparkles_1(sprite: Sprite): void {
  sprite.x2 = Sin(sprite.data[1]!, 24);
  sprite.y2 = Cos(sprite.data[1]!, 24);
  sprite.data[1]! += 12;
  if (sprite.data[1]! > 0xff) {
    gTasks[sprite.data[0]!]!.data[12]!--;
    FreeSpriteOamMatrix(sprite);
    DestroySprite(sprite);
  }
}

function SpriteCB_ShinySparkles_2(sprite: Sprite): void {
  if (sprite.data[1]! < 4) {
    sprite.data[1]!++;
  } else {
    sprite.invisible = false;
    sprite.x2 += 5;
    sprite.y2 -= 5;
    if (sprite.x2 > 32) {
      gTasks[sprite.data[0]!]!.data[12]!--;
      FreeSpriteOamMatrix(sprite);
      DestroySprite(sprite);
    }
  }
}

export function AnimTask_LoadBaitGfx(taskId: number): void {
  LoadCompressedSpriteSheetUsingHeap(gBattleAnimPicTable(C.ANIM_TAG_SAFARI_BAIT - ANIM_SPRITES_START));
  LoadCompressedSpritePaletteUsingHeap(gBattleAnimPaletteTable(C.ANIM_TAG_SAFARI_BAIT - ANIM_SPRITES_START));
  IndexOfSpritePaletteTag(C.ANIM_TAG_SAFARI_BAIT);
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_FreeBaitGfx(taskId: number): void {
  FreeSpriteTilesByTag(C.ANIM_TAG_SAFARI_BAIT);
  FreeSpritePaletteByTag(C.ANIM_TAG_SAFARI_BAIT);
  DestroyAnimVisualTask(taskId);
}

function SpriteCB_SafariBaitOrRock_Init(sprite: Sprite): void {
  InitSpritePosToAnimAttacker(sprite, false);
  sprite.data[0] = 30;
  sprite.data[2] = GetBattlerSpriteCoord(GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT), C.BATTLER_COORD_X) + gBattleAnimArgs[2]!;
  sprite.data[4] = GetBattlerSpriteCoord(GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT), C.BATTLER_COORD_Y) + gBattleAnimArgs[3]!;
  sprite.data[5] = -32;
  InitAnimArcTranslation(sprite);
  gSprites[gBattlerSpriteIds[animState.gBattleAnimAttacker]!]!.callback = SpriteCB_PlayerThrowInit;
  sprite.callback = SpriteCB_SafariBaitOrRock_WaitPlayerThrow;
}

function SpriteCB_SafariBaitOrRock_WaitPlayerThrow(sprite: Sprite): void {
  if (gSprites[gBattlerSpriteIds[animState.gBattleAnimAttacker]!]!.animCmdIndex === 1)
    sprite.callback = SpriteCB_SafariBaitOrRock_ArcFlight;
}

function SpriteCB_SafariBaitOrRock_ArcFlight(sprite: Sprite): void {
  if (TranslateAnimHorizontalArc(sprite)) {
    sprite.data[0] = 0;
    sprite.invisible = true;
    sprite.callback = SpriteCB_SafariBaitOrRock_Finish;
  }
}

function SpriteCB_SafariBaitOrRock_Finish(sprite: Sprite): void {
  const attacker = gSprites[gBattlerSpriteIds[animState.gBattleAnimAttacker]!]!;
  if (attacker.animEnded) {
    if (++sprite.data[0]! > 0) {
      StartSpriteAnim(attacker, 0);
      DestroyAnimSprite(sprite);
    }
  }
}

export function AnimTask_SafariOrGhost_DecideAnimSides(taskId: number): void {
  switch (gBattleAnimArgs[0]) {
  case 0:
    animState.gBattleAnimAttacker = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
    animState.gBattleAnimTarget = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
    break;
  case 1:
    animState.gBattleAnimAttacker = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
    animState.gBattleAnimTarget = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
    break;
  }
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_SafariGetReaction(taskId: number): void {
  if (gBattleCommunication[C.MULTISTRING_CHOOSER]! >= C.NUM_SAFARI_REACTIONS) gBattleAnimArgs[7] = 0;
  else gBattleAnimArgs[7] = gBattleCommunication[C.MULTISTRING_CHOOSER]!;
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_GetTrappedMoveAnimId(taskId: number): void {
  const animArg = gBattleSpritesDataPtr.animationData.animArg;
  if (animArg === C.MOVE_FIRE_SPIN) gBattleAnimArgs[0] = C.TRAP_ANIM_FIRE_SPIN;
  else if (animArg === C.MOVE_WHIRLPOOL) gBattleAnimArgs[0] = C.TRAP_ANIM_WHIRLPOOL;
  else if (animArg === C.MOVE_CLAMP) gBattleAnimArgs[0] = C.TRAP_ANIM_CLAMP;
  else if (animArg === C.MOVE_SAND_TOMB) gBattleAnimArgs[0] = C.TRAP_ANIM_SAND_TOMB;
  else gBattleAnimArgs[0] = C.TRAP_ANIM_BIND;
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_GetBattlersFromArg(taskId: number): void {
  animState.gBattleAnimAttacker = gBattleSpritesDataPtr.animationData.animArg & 0xff;
  animState.gBattleAnimTarget = (gBattleSpritesDataPtr.animationData.animArg >> 8) & 0xff;
  DestroyAnimVisualTask(taskId);
}

registerAnimSpriteCallbacks({ SpriteCB_SafariBaitOrRock_Init });
registerAnimTasks({
  AnimTask_LevelUpHealthBox, AnimTask_LoadHealthboxPalsForLevelUp, AnimTask_FreeHealthboxPalsForLevelUp,
  AnimTask_FlashHealthboxOnLevelUp, AnimTask_SwitchOutShrinkMon, AnimTask_SwitchOutBallEffect, AnimTask_LoadBallGfx,
  AnimTask_FreeBallGfx, AnimTask_IsBallBlockedByTrainerOrDodged, AnimTask_ThrowBall, AnimTask_ThrowBallSpecial,
  AnimTask_SwapMonSpriteToFromSubstitute, AnimTask_SubstituteFadeToInvisible, AnimTask_IsAttackerBehindSubstitute,
  AnimTask_SetTargetToEffectBattler, AnimTask_LoadBaitGfx, AnimTask_FreeBaitGfx, AnimTask_SafariOrGhost_DecideAnimSides,
  AnimTask_SafariGetReaction, AnimTask_GetTrappedMoveAnimId, AnimTask_GetBattlersFromArg,
});
