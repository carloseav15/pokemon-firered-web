// battle_anim_utility_funcs.c: palette blend / fade tasks, blended mon traces,
// the stat change and scrolling-mask overlays on BG1, flashes, sliding BG3,
// backup palette buffers and battler/side queries used by move scripts.

import * as C from "../../generated/constants";
import { tasks } from "../../gba/tasks";
import { incbin } from "../../hw/assets";
import { GetGpuReg, SetGpuReg, SetGpuRegBits } from "../../hw/gpu";
import {
  BeginHardwarePaletteFade, BG_PLTT_ID, BlendPalette, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, OBJ_PLTT_ID,
  PLTT_ID, PLTT_SIZE_4BPP, PLTT_SIZEOF, RGB, RGB_WHITE,
} from "../../hw/palette";
import { BLDALPHA_BLEND } from "../../hw/ppu";
import { DestroySprite, gSprites, IndexOfSpritePaletteTag, type Sprite } from "../../hw/sprite";
import { GetMonData, gEnemyParty, playerMon } from "../../pokemon/mon";
import {
  ANIM_ATTACKER, ANIM_TARGET, animState, AnimLoadCompressedBgGfx, AnimLoadCompressedBgTilemap, CloneBattlerSpriteWithBlend,
  CreateInvisibleSpriteCopy, DestroyAnimVisualTask, DestroySpriteWithActiveSheet, GetAnimBattlerSpriteId, GetBattleAnimBg1Data,
  GetBattleMonSpritePalettesMask, GetBattlePalettesMask, GetSpritePalIdxByBattler, InitBattleAnimBg, IsBattlerSpriteVisible,
  RelocateBattleBgPal, ResetBattleAnimBg, ToggleBg3Mode,
} from "../anim";
import { registerAnimSpriteCallbacks, registerAnimTasks } from "../animRegistry";
import { BattleAnimAdjustPanning2 } from "../animScript";
import { G, gBattlerPartyIndexes, gBattlerSpriteIds, gBattleSpritesDataPtr } from "../globals";
import { BG_ANIM_CHAR_BASE_BLOCK, BG_ANIM_PRIORITY, BG_ANIM_SCREEN_SIZE, SetAnimBgAttribute } from "../intro";
import { BATTLE_PARTNER } from "../macros";
import { GetBattlerPosition, GetBattlerSide } from "../util";
import { gBattleAnimArgs, gTasks, IsContest, PlaySE12WithPanning, s16 } from "./common";
import { UnpackSelectedBattlePalettes } from "./normal";

const ARG_RET_ID = 7;

// struct AnimStatsChangeData
type AnimStatsChangeData = {
  battler1: number;
  battler2: number;
  higherPriority: number;
  data: Int16Array;
  species: number;
};

let sAnimStatsChangeData: AnimStatsChangeData | null = null;

const sRgbWhite = [RGB_WHITE];
export const gBattleAnimRegOffsBgCnt = [C.REG_OFFSET_BG0CNT, C.REG_OFFSET_BG1CNT, C.REG_OFFSET_BG2CNT, C.REG_OFFSET_BG3CNT];
export const gBattleIntroRegOffsBgCnt = [C.REG_OFFSET_BG0CNT, C.REG_OFFSET_BG1CNT, C.REG_OFFSET_BG2CNT, C.REG_OFFSET_BG3CNT];

function IsDoubleBattle(): boolean {
  return (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) !== 0;
}

function battlerSpecies(battler: number): number {
  if (GetBattlerSide(battler) !== C.B_SIDE_PLAYER) return GetMonData(gEnemyParty[gBattlerPartyIndexes[battler]], C.MON_DATA_SPECIES);
  return GetMonData(playerMon(gBattlerPartyIndexes[battler]), C.MON_DATA_SPECIES);
}

// BgCnt bitfield helpers (struct BgCnt): priority 0-1, charBaseBlock 2-3, mosaic 6, paletteMode 7,
// screenBaseBlock 8-12, areaOverflowMode 13, screenSize 14-15.
function bgCntSet(cnt: number, shift: number, width: number, v: number): number {
  const mask = ((1 << width) - 1) << shift;
  return (cnt & ~mask) | ((v << shift) & mask);
}
const setPriority = (cnt: number, v: number) => bgCntSet(cnt, 0, 2, v);
const setCharBaseBlock = (cnt: number, v: number) => bgCntSet(cnt, 2, 2, v);
const setAreaOverflowMode = (cnt: number, v: number) => bgCntSet(cnt, 13, 1, v);
const setScreenSize = (cnt: number, v: number) => bgCntSet(cnt, 14, 2, v);

// gBattleAnimArgs[0] is a bitfield.
// Bits 0-10 result in the following palettes being selected:
//   0: battle background palettes (BG palettes 1, 2, and 3)
//   1: gBattleAnimAttacker OBJ palette
//   2: gBattleAnimTarget OBJ palette
//   3: gBattleAnimAttacker partner OBJ palette
//   4: gBattleAnimTarget partner OBJ palette
//   5: BG palette 4
//   6: BG palette 5
//   7: Player battler left
//   8: Player battler right
//   9: Enemy battler left
//  10: Enemy battler right
export function AnimTask_BlendBattleAnimPal(taskId: number): void {
  let selectedPalettes = UnpackSelectedBattlePalettes(gBattleAnimArgs[0]);
  selectedPalettes |= GetBattleMonSpritePalettesMask(
    ((gBattleAnimArgs[0] >> 7) & 1) !== 0,
    ((gBattleAnimArgs[0] >> 8) & 1) !== 0,
    ((gBattleAnimArgs[0] >> 9) & 1) !== 0,
    ((gBattleAnimArgs[0] >> 10) & 1) !== 0,
  );
  StartBlendAnimSpriteColor(taskId, selectedPalettes >>> 0);
}

// gBattleAnimArgs[0] is a command ID
// This command will blend bg and battlers except as commanded:
// 0: Not attacker
// 1: Not target
// 2: Not attacker nor bg
// 3: Not target nor bg
// 4: Neither attacker nor target
// 5: Blend all
// 6: Neither bg nor attacker's partner
// 7: Neither bg nor target's partner
export function AnimTask_BlendBattleAnimPalExclude(taskId: number): void {
  const animBattlers = [0, 0xff];
  let selectedPalettes = UnpackSelectedBattlePalettes(1);
  switch (gBattleAnimArgs[0]) {
    case 2:
      selectedPalettes = 0;
    // fall through
    case ANIM_ATTACKER:
      animBattlers[0] = animState.gBattleAnimAttacker;
      break;
    case 3:
      selectedPalettes = 0;
    // fall through
    case ANIM_TARGET:
      animBattlers[0] = animState.gBattleAnimTarget;
      break;
    case 4:
      animBattlers[0] = animState.gBattleAnimAttacker;
      animBattlers[1] = animState.gBattleAnimTarget;
      break;
    case 5:
      animBattlers[0] = 0xff;
      break;
    case 6:
      selectedPalettes = 0;
      animBattlers[0] = BATTLE_PARTNER(animState.gBattleAnimAttacker);
      break;
    case 7:
      selectedPalettes = 0;
      animBattlers[0] = BATTLE_PARTNER(animState.gBattleAnimTarget);
      break;
  }
  for (let battler = 0; battler < C.MAX_BATTLERS_COUNT; ++battler) {
    if (battler !== animBattlers[0] && battler !== animBattlers[1] && IsBattlerSpriteVisible(battler))
      selectedPalettes |= 0x10000 << GetSpritePalIdxByBattler(battler);
  }
  StartBlendAnimSpriteColor(taskId, selectedPalettes >>> 0);
}

export function AnimTask_SetCamouflageBlend(taskId: number): void {
  const selectedPalettes = UnpackSelectedBattlePalettes(gBattleAnimArgs[0]);
  switch (G.gBattleTerrain) {
    case C.BATTLE_TERRAIN_GRASS: gBattleAnimArgs[4] = RGB(12, 24, 2); break;
    case C.BATTLE_TERRAIN_LONG_GRASS: gBattleAnimArgs[4] = RGB(0, 15, 2); break;
    case C.BATTLE_TERRAIN_SAND: gBattleAnimArgs[4] = RGB(30, 24, 11); break;
    case C.BATTLE_TERRAIN_UNDERWATER: gBattleAnimArgs[4] = RGB(0, 0, 18); break;
    case C.BATTLE_TERRAIN_WATER: gBattleAnimArgs[4] = RGB(11, 22, 31); break;
    case C.BATTLE_TERRAIN_POND: gBattleAnimArgs[4] = RGB(11, 22, 31); break;
    case C.BATTLE_TERRAIN_MOUNTAIN: gBattleAnimArgs[4] = RGB(22, 16, 10); break;
    case C.BATTLE_TERRAIN_CAVE: gBattleAnimArgs[4] = RGB(14, 9, 3); break;
    case C.BATTLE_TERRAIN_BUILDING: gBattleAnimArgs[4] = RGB(31, 31, 31); break;
    case C.BATTLE_TERRAIN_PLAIN: gBattleAnimArgs[4] = RGB(31, 31, 31); break;
  }
  StartBlendAnimSpriteColor(taskId, selectedPalettes);
}

export function AnimTask_BlendParticle(taskId: number): void {
  const paletteIndex = IndexOfSpritePaletteTag(gBattleAnimArgs[0] & 0xffff);
  const selectedPalettes = (1 << (paletteIndex + 16)) >>> 0;
  StartBlendAnimSpriteColor(taskId, selectedPalettes);
}

function StartBlendAnimSpriteColor(taskId: number, selectedPalettes: number): void {
  const d = gTasks[taskId].data;
  d[0] = s16(selectedPalettes);
  d[1] = s16(selectedPalettes >>> 16);
  d[2] = gBattleAnimArgs[1];
  d[3] = gBattleAnimArgs[2];
  d[4] = gBattleAnimArgs[3];
  d[5] = gBattleAnimArgs[4];
  d[10] = gBattleAnimArgs[2];
  gTasks[taskId].func = AnimTask_BlendSpriteColor_Step2;
  gTasks[taskId].func(taskId);
}

function AnimTask_BlendSpriteColor_Step2(taskId: number): void {
  const d = gTasks[taskId].data;
  let singlePaletteMask = 0;
  if (d[9] === d[2]) {
    d[9] = 0;
    // (s16 data[0]) | (s16 data[1] << 16): data[0] sign-extends, as in the C.
    let selectedPalettes = (d[0] | (d[1] << 16)) >>> 0;
    while (selectedPalettes) {
      if (selectedPalettes & 1) BlendPalette(singlePaletteMask, 16, d[10], d[5] & 0xffff);
      singlePaletteMask += 0x10;
      selectedPalettes >>>= 1;
    }
    if (d[10] < d[4]) ++d[10];
    else if (d[10] > d[4]) --d[10];
    else DestroyAnimVisualTask(taskId);
  } else {
    ++d[9];
  }
}

export function AnimTask_HardwarePaletteFade(taskId: number): void {
  BeginHardwarePaletteFade(gBattleAnimArgs[0], gBattleAnimArgs[1], gBattleAnimArgs[2], gBattleAnimArgs[3], gBattleAnimArgs[4]);
  gTasks[taskId].func = AnimTask_HardwarePaletteFade_Step;
}

function AnimTask_HardwarePaletteFade_Step(taskId: number): void {
  if (!gPaletteFade.active) DestroyAnimVisualTask(taskId);
}

// Used to leave blended traces of a mon, usually to imply speed as in Agility or Aerial Ace
export function AnimTask_TraceMonBlended(taskId: number): void {
  const d = gTasks[taskId].data;
  d[0] = gBattleAnimArgs[0];
  d[1] = 0;
  d[2] = gBattleAnimArgs[1];
  d[3] = gBattleAnimArgs[2];
  d[4] = gBattleAnimArgs[3];
  d[5] = 0;
  gTasks[taskId].func = AnimTask_TraceMonBlended_Step;
}

function AnimTask_TraceMonBlended_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  if (d[4]) {
    if (d[1]) {
      --d[1];
    } else {
      d[6] = CloneBattlerSpriteWithBlend(d[0]);
      if (d[6] >= 0) {
        const s = gSprites[d[6]];
        s.oam.priority = d[0] ? 1 : 2;
        s.data[0] = d[3];
        s.data[1] = taskId;
        s.data[2] = 5;
        s.callback = AnimMonTrace;
        ++d[5];
      }
      --d[4];
      d[1] = d[2];
    }
  } else if (d[5] === 0) {
    DestroyAnimVisualTask(taskId);
  }
}

function AnimMonTrace(sprite: Sprite): void {
  if (sprite.data[0]) {
    --sprite.data[0];
  } else {
    --gTasks[sprite.data[1]].data[sprite.data[2]];
    DestroySpriteWithActiveSheet(sprite);
  }
}

const WIN_OBJWIN_SETUP_ININ = C.WININ_WIN0_BG_ALL | C.WININ_WIN0_OBJ | C.WININ_WIN0_CLR | C.WININ_WIN1_BG_ALL | C.WININ_WIN1_OBJ | C.WININ_WIN1_CLR;
const WINOUT_MASK_BG1 = C.WINOUT_WIN01_BG0 | C.WINOUT_WIN01_BG2 | C.WINOUT_WIN01_BG3 | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR
  | C.WINOUT_WINOBJ_BG_ALL | C.WINOUT_WINOBJ_OBJ | C.WINOUT_WINOBJ_CLR;
const WINOUT_ALL = C.WINOUT_WIN01_BG_ALL | C.WINOUT_WIN01_OBJ | C.WINOUT_WIN01_CLR | C.WINOUT_WINOBJ_BG_ALL | C.WINOUT_WINOBJ_OBJ | C.WINOUT_WINOBJ_CLR;

// Only used by Curse for non-Ghost mons
export function AnimTask_DrawFallingWhiteLinesOnAttacker(taskId: number): void {
  let var0 = 0;
  G.gBattle_WIN0H = 0;
  G.gBattle_WIN0V = 0;
  SetGpuReg(C.REG_OFFSET_WININ, WIN_OBJWIN_SETUP_ININ);
  SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_MASK_BG1);
  SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_OBJWIN_ON);
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG1 | C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(8, 12));
  let bg1Cnt = GetGpuReg(C.REG_OFFSET_BG1CNT);
  bg1Cnt = setPriority(bg1Cnt, 0);
  bg1Cnt = setScreenSize(bg1Cnt, 0);
  SetGpuReg(C.REG_OFFSET_BG1CNT, bg1Cnt);
  if (!IsContest()) {
    bg1Cnt = setCharBaseBlock(bg1Cnt, 1);
    SetGpuReg(C.REG_OFFSET_BG1CNT, bg1Cnt);
  }
  if (IsDoubleBattle() && !IsContest()) {
    const pos = GetBattlerPosition(animState.gBattleAnimAttacker);
    if (pos === C.B_POSITION_OPPONENT_RIGHT || pos === C.B_POSITION_PLAYER_LEFT) {
      if (IsBattlerSpriteVisible(BATTLE_PARTNER(animState.gBattleAnimAttacker))) {
        gSprites[gBattlerSpriteIds[BATTLE_PARTNER(animState.gBattleAnimAttacker)]].oam.priority -= 1;
        bg1Cnt = setPriority(bg1Cnt, 1);
        SetGpuReg(C.REG_OFFSET_BG1CNT, bg1Cnt);
        var0 = 1;
      }
    }
  }
  const species = battlerSpecies(animState.gBattleAnimAttacker);
  const spriteId = GetAnimBattlerSpriteId(ANIM_ATTACKER);
  const newSpriteId = CreateInvisibleSpriteCopy(animState.gBattleAnimAttacker, spriteId, species);
  const animBgData = GetBattleAnimBg1Data();
  AnimLoadCompressedBgTilemap(animBgData.bgId, incbin("gFile_graphics_battle_anims_masks_curse_tilemap"));
  if (IsContest()) RelocateBattleBgPal(animBgData.paletteId, animBgData.bgTilemap, 0, false);
  AnimLoadCompressedBgGfx(animBgData.bgId, incbin("gFile_graphics_battle_anims_masks_curse_sheet"), animBgData.tilesOffset);
  LoadPalette(sRgbWhite, BG_PLTT_ID(animBgData.paletteId) + 1, PLTT_SIZEOF(1));
  G.gBattle_BG1_X = -gSprites[spriteId].x + 32;
  G.gBattle_BG1_Y = -gSprites[spriteId].y + 32;
  gTasks[taskId].data[0] = newSpriteId;
  gTasks[taskId].data[6] = var0;
  gTasks[taskId].func = AnimTask_DrawFallingWhiteLinesOnAttacker_Step;
}

function AnimTask_DrawFallingWhiteLinesOnAttacker_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  d[10] += 4;
  G.gBattle_BG1_Y -= 4;
  if (d[10] === 64) {
    d[10] = 0;
    G.gBattle_BG1_Y += 64;
    if (++d[11] === 4) {
      ResetBattleAnimBg(false);
      G.gBattle_WIN0H = 0;
      G.gBattle_WIN0V = 0;
      SetGpuReg(C.REG_OFFSET_WININ, WIN_OBJWIN_SETUP_ININ);
      SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_ALL);
      if (!IsContest()) SetGpuReg(C.REG_OFFSET_BG1CNT, setCharBaseBlock(GetGpuReg(C.REG_OFFSET_BG1CNT), 0));
      SetGpuReg(C.REG_OFFSET_DISPCNT, GetGpuReg(C.REG_OFFSET_DISPCNT) ^ C.DISPCNT_OBJWIN_ON);
      SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      DestroySprite(gSprites[d[0]]);
      const animBgData = GetBattleAnimBg1Data();
      InitBattleAnimBg(animBgData.bgId);
      if (d[6] === 1) ++gSprites[gBattlerSpriteIds[BATTLE_PARTNER(animState.gBattleAnimAttacker)]].oam.priority;
      G.gBattle_BG1_Y = 0;
      DestroyAnimVisualTask(taskId);
    }
  }
}

export function InitStatsChangeAnimation(taskId: number): void {
  sAnimStatsChangeData = { battler1: 0, battler2: 0, higherPriority: 0, data: new Int16Array(8), species: 0 };
  for (let i = 0; i < 8; ++i) sAnimStatsChangeData.data[i] = gBattleAnimArgs[i];
  gTasks[taskId].func = StatsChangeAnimation_Step1;
}

function StatsChangeAnimation_Step1(taskId: number): void {
  const s = sAnimStatsChangeData!;
  if (s.data[2] === 0) s.battler1 = animState.gBattleAnimAttacker;
  else s.battler1 = animState.gBattleAnimTarget;
  s.battler2 = BATTLE_PARTNER(s.battler1);
  if (IsContest() || (s.data[3] && !IsBattlerSpriteVisible(s.battler2))) s.data[3] = 0;
  G.gBattle_WIN0H = 0;
  G.gBattle_WIN0V = 0;
  SetGpuReg(C.REG_OFFSET_WININ, WIN_OBJWIN_SETUP_ININ);
  SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_MASK_BG1);
  SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_OBJWIN_ON);
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG1 | C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
  SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 0);
  SetAnimBgAttribute(1, BG_ANIM_SCREEN_SIZE, 0);
  if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 1);
  if (IsDoubleBattle() && s.data[3] === 0) {
    const pos = GetBattlerPosition(s.battler1);
    if (pos === C.B_POSITION_OPPONENT_RIGHT || pos === C.B_POSITION_PLAYER_LEFT) {
      if (IsBattlerSpriteVisible(s.battler2)) {
        gSprites[gBattlerSpriteIds[s.battler2]].oam.priority -= 1;
        SetAnimBgAttribute(1, BG_ANIM_PRIORITY, 1);
        s.higherPriority = 1;
      }
    }
  }
  s.species = battlerSpecies(s.battler1);
  gTasks[taskId].func = StatsChangeAnimation_Step2;
}

function StatsChangeAnimation_Step2(taskId: number): void {
  const s = sAnimStatsChangeData!;
  let newSpriteId = 0;
  let battlerSpriteId = gBattlerSpriteIds[s.battler1];
  const spriteId = CreateInvisibleSpriteCopy(s.battler1, battlerSpriteId, s.species);
  if (s.data[3]) {
    battlerSpriteId = gBattlerSpriteIds[s.battler2];
    newSpriteId = CreateInvisibleSpriteCopy(s.battler2, battlerSpriteId, s.species);
  }
  const animBgData = GetBattleAnimBg1Data();
  if (s.data[0] === 0) AnimLoadCompressedBgTilemap(animBgData.bgId, incbin("gBattleStatMask1_Tilemap"));
  else AnimLoadCompressedBgTilemap(animBgData.bgId, incbin("gBattleStatMask2_Tilemap"));
  if (IsContest()) RelocateBattleBgPal(animBgData.paletteId, animBgData.bgTilemap, 0, false);
  AnimLoadCompressedBgGfx(animBgData.bgId, incbin("gBattleStatMask_Gfx"), animBgData.tilesOffset);
  let pal: string;
  switch (s.data[1]) {
    case 0: pal = "gBattleStatMask2_Pal"; break;
    case 1: pal = "gBattleStatMask1_Pal"; break;
    case 2: pal = "gBattleStatMask3_Pal"; break;
    case 3: pal = "gBattleStatMask4_Pal"; break;
    case 4: pal = "gBattleStatMask6_Pal"; break;
    case 5: pal = "gBattleStatMask7_Pal"; break;
    case 6: pal = "gBattleStatMask8_Pal"; break;
    default: pal = "gBattleStatMask5_Pal"; break;
  }
  LoadPalette(incbin(pal), BG_PLTT_ID(animBgData.paletteId), PLTT_SIZE_4BPP);
  G.gBattle_BG1_X = 0;
  G.gBattle_BG1_Y = 0;
  const d = gTasks[taskId].data;
  if (s.data[0] === 1) {
    G.gBattle_BG1_X = 64;
    d[1] = -3;
  } else {
    d[1] = 3;
  }
  if (s.data[4] === 0) {
    d[4] = 10;
    d[5] = 20;
  } else {
    d[4] = 13;
    d[5] = 30;
  }
  d[0] = spriteId;
  d[2] = s.data[3];
  d[3] = newSpriteId;
  d[6] = s.higherPriority;
  d[7] = gBattlerSpriteIds[s.battler2];
  gTasks[taskId].func = StatsChangeAnimation_Step3;
  if (s.data[0] === 0) PlaySE12WithPanning(C.SE_M_STAT_INCREASE, BattleAnimAdjustPanning2(C.SOUND_PAN_ATTACKER));
  else PlaySE12WithPanning(C.SE_M_STAT_DECREASE, BattleAnimAdjustPanning2(C.SOUND_PAN_ATTACKER));
}

function StatsChangeAnimation_Step3(taskId: number): void {
  const d = gTasks[taskId].data;
  G.gBattle_BG1_Y += d[1];
  switch (d[15]) {
    case 0:
      if (d[11]++ > 0) {
        d[11] = 0;
        ++d[12];
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[12], 16 - d[12]));
        if (d[12] === d[4]) ++d[15];
      }
      break;
    case 1:
      if (++d[10] === d[5]) ++d[15];
      break;
    case 2:
      if (d[11]++ > 0) {
        d[11] = 0;
        --d[12];
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[12], 16 - d[12]));
        if (d[12] === 0) {
          ResetBattleAnimBg(false);
          ++d[15];
        }
      }
      break;
    case 3:
      G.gBattle_WIN0H = 0;
      G.gBattle_WIN0V = 0;
      SetGpuReg(C.REG_OFFSET_WININ, WIN_OBJWIN_SETUP_ININ);
      SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_ALL);
      if (!IsContest()) SetAnimBgAttribute(1, BG_ANIM_CHAR_BASE_BLOCK, 0);
      SetGpuReg(C.REG_OFFSET_DISPCNT, GetGpuReg(C.REG_OFFSET_DISPCNT) ^ C.DISPCNT_OBJWIN_ON);
      SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
      SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
      DestroySprite(gSprites[d[0]]);
      if (d[2]) DestroySprite(gSprites[d[3]]);
      if (d[6] === 1) ++gSprites[d[7]].oam.priority;
      sAnimStatsChangeData = null;
      DestroyAnimVisualTask(taskId);
      break;
  }
}

export function AnimTask_Flash(taskId: number): void {
  let selectedPalettes = GetBattleMonSpritePalettesMask(true, true, true, true);
  SetPalettesToColor(selectedPalettes, 0);
  gTasks[taskId].data[14] = s16(selectedPalettes >>> 16);
  selectedPalettes = GetBattlePalettesMask(true, false, false, false, false, false, false) & 0xffff;
  SetPalettesToColor(selectedPalettes, 0xffff);
  gTasks[taskId].data[15] = s16(selectedPalettes);
  gTasks[taskId].data[0] = 0;
  gTasks[taskId].data[1] = 0;
  gTasks[taskId].func = AnimTask_Flash_Step;
}

function AnimTask_Flash_Step(taskId: number): void {
  const d = gTasks[taskId].data;
  switch (d[0]) {
    case 0:
      if (++d[1] > 6) {
        d[1] = 0;
        d[2] = 16;
        ++d[0];
      }
      break;
    case 1:
      if (++d[1] > 1) {
        d[1] = 0;
        --d[2];
        for (let i = 0; i < 16; ++i) {
          if ((d[15] >> i) & 1) BlendPalette(BG_PLTT_ID(i), 16, d[2], 0xffff);
          if ((d[14] >> i) & 1) BlendPalette(OBJ_PLTT_ID(i), 16, d[2], 0);
        }
        if (d[2] === 0) ++d[0];
      }
      break;
    case 2:
      DestroyAnimVisualTask(taskId);
      break;
  }
}

function SetPalettesToColor(selectedPalettes: number, color: number): void {
  selectedPalettes >>>= 0;
  for (let i = 0; i < 32; selectedPalettes >>>= 1, ++i) {
    if (selectedPalettes & 1) {
      const paletteOffset = PLTT_ID(i);
      for (let curOffset = paletteOffset; curOffset < paletteOffset + 16; ++curOffset) gPlttBufferFaded[curOffset] = color;
    }
  }
}

export function AnimTask_BlendNonAttackerPalettes(taskId: number): void {
  let selectedPalettes = 0;
  for (let battler = 0; battler < C.MAX_BATTLERS_COUNT; ++battler) {
    if (animState.gBattleAnimAttacker !== battler) selectedPalettes |= 1 << (battler + 16);
  }
  for (let j = 5; j !== 0; --j) gBattleAnimArgs[j] = gBattleAnimArgs[j - 1];
  StartBlendAnimSpriteColor(taskId, selectedPalettes >>> 0);
}

export function AnimTask_StartSlidingBg(taskId: number): void {
  ToggleBg3Mode(false);
  const newTaskId = tasks.create(AnimTask_UpdateSlidingBg, 5);
  if (gBattleAnimArgs[2] && GetBattlerSide(animState.gBattleAnimAttacker) !== C.B_SIDE_PLAYER) {
    gBattleAnimArgs[0] = -gBattleAnimArgs[0];
    gBattleAnimArgs[1] = -gBattleAnimArgs[1];
  }
  const d = gTasks[newTaskId].data;
  d[1] = gBattleAnimArgs[0];
  d[2] = gBattleAnimArgs[1];
  d[3] = gBattleAnimArgs[3];
  ++d[0];
  DestroyAnimVisualTask(taskId);
}

function AnimTask_UpdateSlidingBg(taskId: number): void {
  const d = gTasks[taskId].data;
  d[10] = s16(d[10] + d[1]);
  d[11] = s16(d[11] + d[2]);
  G.gBattle_BG3_X += d[10] >> 8;
  G.gBattle_BG3_Y += d[11] >> 8;
  d[10] &= 0xff;
  d[11] &= 0xff;
  if (gBattleAnimArgs[7] === d[3]) {
    G.gBattle_BG3_X = 0;
    G.gBattle_BG3_Y = 0;
    ToggleBg3Mode(true);
    tasks.destroy(taskId);
  }
}

export function AnimTask_GetAttackerSide(taskId: number): void {
  gBattleAnimArgs[7] = GetBattlerSide(animState.gBattleAnimAttacker);
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_GetTargetSide(taskId: number): void {
  gBattleAnimArgs[7] = GetBattlerSide(animState.gBattleAnimTarget);
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_GetTargetIsAttackerPartner(taskId: number): void {
  gBattleAnimArgs[7] = BATTLE_PARTNER(animState.gBattleAnimAttacker) === animState.gBattleAnimTarget ? 1 : 0;
  DestroyAnimVisualTask(taskId);
}

// For hiding or subsequently revealing all other battlers
export function AnimTask_SetAllNonAttackersInvisiblity(taskId: number): void {
  for (let battler = 0; battler < C.MAX_BATTLERS_COUNT; ++battler) {
    if (battler !== animState.gBattleAnimAttacker && IsBattlerSpriteVisible(battler))
      gSprites[gBattlerSpriteIds[battler]].invisible = (gBattleAnimArgs[0] & 1) !== 0;
  }
  DestroyAnimVisualTask(taskId);
}

export function StartMonScrollingBgMask(
  taskId: number, _unused: number, scrollSpeed: number, battler1: number, includePartner: boolean, numFadeSteps: number,
  fadeStepDelay: number, duration: number, gfx: string, tilemap: string, palette: string,
): void {
  let newSpriteId = 0;
  const battler2 = BATTLE_PARTNER(battler1);
  if (IsContest() || (includePartner && !IsBattlerSpriteVisible(battler2))) includePartner = false;
  G.gBattle_WIN0H = 0;
  G.gBattle_WIN0V = 0;
  SetGpuReg(C.REG_OFFSET_WININ, WIN_OBJWIN_SETUP_ININ);
  SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_MASK_BG1);
  SetGpuRegBits(C.REG_OFFSET_DISPCNT, C.DISPCNT_OBJWIN_ON);
  SetGpuReg(C.REG_OFFSET_BLDCNT, C.BLDCNT_TGT1_BG1 | C.BLDCNT_TGT2_ALL | C.BLDCNT_EFFECT_BLEND);
  SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
  let bg1Cnt = GetGpuReg(C.REG_OFFSET_BG1CNT);
  bg1Cnt = setPriority(bg1Cnt, 0);
  bg1Cnt = setScreenSize(bg1Cnt, 0);
  bg1Cnt = setAreaOverflowMode(bg1Cnt, 1);
  if (!IsContest()) bg1Cnt = setCharBaseBlock(bg1Cnt, 1);
  SetGpuReg(C.REG_OFFSET_BG1CNT, bg1Cnt);
  const species = battlerSpecies(battler1);
  const spriteId = CreateInvisibleSpriteCopy(battler1, gBattlerSpriteIds[battler1], species);
  if (includePartner) newSpriteId = CreateInvisibleSpriteCopy(battler2, gBattlerSpriteIds[battler2], species);
  const animBgData = GetBattleAnimBg1Data();
  AnimLoadCompressedBgTilemap(animBgData.bgId, incbin(tilemap));
  if (IsContest()) RelocateBattleBgPal(animBgData.paletteId, animBgData.bgTilemap, 0, false);
  AnimLoadCompressedBgGfx(animBgData.bgId, incbin(gfx), animBgData.tilesOffset);
  LoadPalette(incbin(palette), BG_PLTT_ID(animBgData.paletteId), PLTT_SIZE_4BPP);
  G.gBattle_BG1_X = 0;
  G.gBattle_BG1_Y = 0;
  const d = gTasks[taskId].data;
  d[1] = s16(scrollSpeed);
  d[4] = numFadeSteps;
  d[5] = duration;
  d[6] = fadeStepDelay;
  d[0] = spriteId;
  d[2] = includePartner ? 1 : 0;
  d[3] = newSpriteId;
  gTasks[taskId].func = UpdateMonScrollingBgMask;
}

function UpdateMonScrollingBgMask(taskId: number): void {
  const d = gTasks[taskId].data;
  d[13] = s16(d[13] + (d[1] < 0 ? -d[1] : d[1]));
  if (d[1] < 0) G.gBattle_BG1_Y -= d[13] >> 8;
  else G.gBattle_BG1_Y += d[13] >> 8;
  d[13] &= 0xff;
  switch (d[15]) {
    case 0:
      if (d[11]++ >= d[6]) {
        d[11] = 0;
        ++d[12];
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[12], 16 - d[12]));
        if (d[12] === d[4]) ++d[15];
      }
      break;
    case 1:
      if (++d[10] === d[5]) ++d[15];
      break;
    case 2:
      if (d[11]++ >= d[6]) {
        d[11] = 0;
        --d[12];
        SetGpuReg(C.REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[12], 16 - d[12]));
        if (d[12] === 0) {
          ResetBattleAnimBg(false);
          G.gBattle_WIN0H = 0;
          G.gBattle_WIN0V = 0;
          SetGpuReg(C.REG_OFFSET_WININ, WIN_OBJWIN_SETUP_ININ);
          SetGpuReg(C.REG_OFFSET_WINOUT, WINOUT_ALL);
          if (!IsContest()) SetGpuReg(C.REG_OFFSET_BG1CNT, setCharBaseBlock(GetGpuReg(C.REG_OFFSET_BG1CNT), 0));
          SetGpuReg(C.REG_OFFSET_DISPCNT, GetGpuReg(C.REG_OFFSET_DISPCNT) ^ C.DISPCNT_OBJWIN_ON);
          SetGpuReg(C.REG_OFFSET_BLDCNT, 0);
          SetGpuReg(C.REG_OFFSET_BLDALPHA, 0);
          DestroySprite(gSprites[d[0]]);
          if (d[2]) DestroySprite(gSprites[d[3]]);
          DestroyAnimVisualTask(taskId);
        }
      }
      break;
  }
}

export function AnimTask_GetBattleTerrain(taskId: number): void {
  gBattleAnimArgs[0] = G.gBattleTerrain;
  DestroyAnimVisualTask(taskId);
}

// gMonSpritesGfxPtr->multiUseBuffer: a u16 backup palette buffer (0x2000 bytes) while allocated.
let sMultiUseBuffer: Uint16Array | null = null;

export function AnimTask_AllocBackupPalBuffer(taskId: number): void {
  sMultiUseBuffer = new Uint16Array(0x1000);
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_FreeBackupPalBuffer(taskId: number): void {
  sMultiUseBuffer = null;
  DestroyAnimVisualTask(taskId);
}

function backupPaletteIndex(): number {
  let paletteIndex = 0;
  if (gBattleAnimArgs[0] === 0) {
    for (let selectedPalettes = GetBattlePalettesMask(true, false, false, false, false, false, false); (selectedPalettes & 1) === 0; ++paletteIndex)
      selectedPalettes >>>= 1;
  } else if (gBattleAnimArgs[0] === 1) {
    paletteIndex = animState.gBattleAnimAttacker + 16;
  } else if (gBattleAnimArgs[0] === 2) {
    paletteIndex = animState.gBattleAnimTarget + 16;
  }
  return paletteIndex;
}

export function AnimTask_CopyPalUnfadedToBackup(taskId: number): void {
  const paletteIndex = backupPaletteIndex();
  const at = gBattleAnimArgs[1] * 16;
  sMultiUseBuffer!.set(gPlttBufferUnfaded.subarray(PLTT_ID(paletteIndex), PLTT_ID(paletteIndex) + 16), at);
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_CopyPalUnfadedFromBackup(taskId: number): void {
  const paletteIndex = backupPaletteIndex();
  const at = gBattleAnimArgs[1] * 16;
  gPlttBufferUnfaded.set(sMultiUseBuffer!.subarray(at, at + 16), PLTT_ID(paletteIndex));
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_CopyPalFadedToUnfaded(taskId: number): void {
  const paletteIndex = backupPaletteIndex();
  gPlttBufferUnfaded.set(gPlttBufferFaded.subarray(PLTT_ID(paletteIndex), PLTT_ID(paletteIndex) + 16), PLTT_ID(paletteIndex));
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_IsContest(taskId: number): void {
  gBattleAnimArgs[ARG_RET_ID] = IsContest() ? 1 : 0;
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_SetAnimAttackerAndTargetForEffectTgt(taskId: number): void {
  animState.gBattleAnimAttacker = G.gBattlerTarget;
  animState.gBattleAnimTarget = G.gEffectBattler;
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_IsTargetSameSide(taskId: number): void {
  gBattleAnimArgs[ARG_RET_ID] = GetBattlerSide(animState.gBattleAnimAttacker) === GetBattlerSide(animState.gBattleAnimTarget) ? 1 : 0;
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_SetAnimTargetToBattlerTarget(taskId: number): void {
  animState.gBattleAnimTarget = G.gBattlerTarget;
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_SetAnimAttackerAndTargetForEffectAtk(taskId: number): void {
  animState.gBattleAnimAttacker = G.gBattlerAttacker;
  animState.gBattleAnimTarget = G.gEffectBattler;
  DestroyAnimVisualTask(taskId);
}

export function AnimTask_SetAttackerInvisibleWaitForSignal(taskId: number): void {
  if (IsContest()) {
    DestroyAnimVisualTask(taskId);
  } else {
    const bd = gBattleSpritesDataPtr.battlerData[animState.gBattleAnimAttacker];
    gTasks[taskId].data[0] = bd.invisible;
    bd.invisible = 1;
    gTasks[taskId].func = AnimTask_WaitAndRestoreVisibility;
    --animState.gAnimVisualTaskCount;
  }
}

function AnimTask_WaitAndRestoreVisibility(taskId: number): void {
  if (gBattleAnimArgs[7] === 0x1000) {
    gBattleSpritesDataPtr.battlerData[animState.gBattleAnimAttacker].invisible = gTasks[taskId].data[0] & 1;
    tasks.destroy(taskId);
  }
}

registerAnimSpriteCallbacks({ AnimMonTrace });

registerAnimTasks({
  AnimTask_BlendBattleAnimPal, AnimTask_BlendBattleAnimPalExclude, AnimTask_SetCamouflageBlend, AnimTask_BlendParticle,
  AnimTask_HardwarePaletteFade, AnimTask_TraceMonBlended, AnimTask_DrawFallingWhiteLinesOnAttacker, InitStatsChangeAnimation,
  AnimTask_Flash, AnimTask_BlendNonAttackerPalettes, AnimTask_StartSlidingBg, AnimTask_GetAttackerSide, AnimTask_GetTargetSide,
  AnimTask_GetTargetIsAttackerPartner, AnimTask_SetAllNonAttackersInvisiblity, AnimTask_GetBattleTerrain,
  AnimTask_AllocBackupPalBuffer, AnimTask_FreeBackupPalBuffer, AnimTask_CopyPalUnfadedToBackup, AnimTask_CopyPalUnfadedFromBackup,
  AnimTask_CopyPalFadedToUnfaded, AnimTask_IsContest, AnimTask_SetAnimAttackerAndTargetForEffectTgt, AnimTask_IsTargetSameSide,
  AnimTask_SetAnimTargetToBattlerTarget, AnimTask_SetAnimAttackerAndTargetForEffectAtk, AnimTask_SetAttackerInvisibleWaitForSignal,
});
