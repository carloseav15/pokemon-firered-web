// evolution_scene.c and evolution_graphics.c: the faithful GBA evolution presentation.
//
// Ports both:
//   - evolution_graphics.c: sparkle sprite scaling matrices (20..31), the 4 sparkle
//     animation tasks (SpiralUpward, ArcDown, CircleInward, SprayAndFlash), and
//     CycleEvolutionMonSprite (white silhouette morph with scale oscillation).
//   - evolution_scene.c: background animation (Task_AnimateBg, Task_UpdateBgPalette
//     with sBgAnim_PaletteControl and sBgAnim_PalIndexes), video/battle background
//     setup, the main state machine Task_EvolutionScene, B-button cancel, National
//     Dex block (>151 without national dex), cry playback, Shedinja creation, and
//     full level-up move learning with ShowSelectMovePokemonSummaryScreen.
//
// In battle, EvolutionScene runs directly on the battle HW scene and restores
// gCB2_AfterEvolution (BattleMainCB2). In field (party menu / items / trades),
// BeginEvolutionScene fades to black and runs inside fieldMenu if needed.

import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { joy, DPAD_UP, DPAD_DOWN, A_BUTTON, B_BUTTON, JOY_NEW } from "./gba/input";
import { stringVars, expandPlaceholders } from "./gba/charmap";
import { tasks, type TaskFunc, TAIL_SENTINEL } from "./gba/tasks";
import { gMain, SetMainCallback2, SetVBlankCallback, SetHBlankCallback, type MainCallback } from "./hw/runtime";
import {
  ppu,
  REG_OFFSET_DISPCNT,
  REG_OFFSET_BLDCNT,
  REG_OFFSET_BLDALPHA,
  REG_OFFSET_MOSAIC,
  REG_OFFSET_WIN0H,
  REG_OFFSET_WIN0V,
  REG_OFFSET_WIN1H,
  REG_OFFSET_WIN1V,
  REG_OFFSET_WININ,
  REG_OFFSET_WINOUT,
  REG_OFFSET_BG0HOFS,
  REG_OFFSET_BG0VOFS,
  REG_OFFSET_BG1HOFS,
  REG_OFFSET_BG1VOFS,
  REG_OFFSET_BG2HOFS,
  REG_OFFSET_BG2VOFS,
  REG_OFFSET_BG3HOFS,
  REG_OFFSET_BG3VOFS,
  DISPCNT_OBJ_ON,
  DISPCNT_BG0_ON,
  DISPCNT_BG1_ON,
  DISPCNT_BG2_ON,
  DISPCNT_BG3_ON,
  DISPCNT_OBJ_1D_MAP,
  BLDCNT_TGT1_BG1,
  BLDCNT_EFFECT_BLEND,
  BLDCNT_TGT2_BG2,
  BLDCNT_TGT2_BG3,
  BLDALPHA_BLEND,
} from "./hw/ppu";
import { SetGpuReg } from "./hw/gpu";
import {
  LoadBgTiles,
  CopyToBgTilemapBuffer,
  CopyBgTilemapBufferToVram,
  SetBgAttribute,
  ShowBg,
  BG_ATTR_PRIORITY,
} from "./hw/bg";
import { FreeAllWindowBuffers } from "./hw/window";
import {
  BeginNormalPaletteFade,
  gPaletteFade,
  gPlttBufferFaded,
  gPlttBufferUnfaded,
  LoadPalette,
  ResetPaletteFade,
  TransferPlttBuffer,
  UpdatePaletteFade,
  PALETTES_ALL,
  RGB_BLACK,
  RGB_WHITE,
  PLTT_SIZE_4BPP,
  BG_PLTT_ID,
  OBJ_PLTT_ID,
} from "./hw/palette";
import {
  AnimateSprites,
  BuildOamBuffer,
  CreateSprite,
  DestroySprite,
  FreeAllSpritePalettes,
  FreeSpriteTilesByTag,
  LoadOam,
  LoadSpritePalette,
  LoadSpriteSheet,
  ProcessSpriteCopyRequests,
  ResetSpriteData,
  SetOamMatrix,
  gSprites,
  SpriteCallbackDummy,
  ST_OAM_AFFINE_NORMAL,
  ST_OAM_AFFINE_OFF,
  ST_OAM_4BPP,
  TAG_NONE,
  type Sprite,
  type SpriteTemplate,
  oamData,
  gDummySpriteAffineAnimTable,
  gDummySpriteAnimTable,
  CalcCenterToCornerVec,
} from "./hw/sprite";
import { RunTextPrinters, IsTextPrinterActive } from "./hw/text";
import { cdata, incbin, incbin16, loadCData, preloadIncbin } from "./hw/assets";
import { GetBattleBgTemplateData } from "./battle/bg";
import { Sin, Cos } from "./hw/trig";
import { random } from "./random";
import { rom } from "./rom";
import { save, flagGet, incrementGameStat, varGet } from "./save";
import { calculateStats, evolveMon, setDexFlag, speciesName, type Pokemon } from "./pokemon/pokemon";
import {
  type Mon,
  CalculatePlayerPartyCount,
  GetMonData,
  MonTryLearningNewMove,
  RemoveMonPPBonus,
  SetMonMoveSlot,
  playerMon,
} from "./pokemon/mon";
import { GetMonSpritePalFromSpeciesAndPersonality, LoadSpecialPokePic } from "./pokemon/pics";
import { IsHMMove2 } from "./pokemon/mon_extra";
import { G, gBattleTextBuff1, gBattleTextBuff2, gDisplayedStringBattle } from "./battle/globals";
import { InitBattleBgsVideo, LoadBattleTextboxAndBackground } from "./battle/bg";
import {
  BattlePutTextOnWindow,
  BufferStringBattle,
  HandleBattleWindow,
  BattleCreateYesNoCursorAt,
  BattleDestroyYesNoCursorAt,
} from "./battle/message";
import { ShowSelectMovePokemonSummaryScreen, GetMoveSlotToReplace } from "./pokemonSummaryScreen";
import { ScanlineEffect_Stop } from "./hw/scanline";
import { fieldMenu } from "./menus/fieldMenus";
import type { Game } from "./game";

// ---------------------------------------------------------------- constants & types

const TAG_SPARKLES = 1001;
const TAG_PRE_EVO = 1002;
const TAG_POST_EVO = 1003;

const DISPCNT_BG_ALL_ON = DISPCNT_BG0_ON | DISPCNT_BG1_ON | DISPCNT_BG2_ON | DISPCNT_BG3_ON;

/** evolution_scene.c CreateShedinja. Nincada's second evolution is granted
 * after the Ninjask evolution, using the evolved mon as the source record. */
function CreateShedinja(preEvoSpecies: number, mon: Pokemon): void {
  const evolutions = rom.species[preEvoSpecies]?.evolutions;
  const ninjaskEvolution = evolutions?.[0];
  const shedinjaEvolution = evolutions?.[1];
  if (ninjaskEvolution?.[0] !== C.EVO_LEVEL_NINJASK || !shedinjaEvolution || save.party.length >= C.PARTY_SIZE) return;

  const shedinja = structuredClone(mon) as Mon;
  shedinja.species = shedinjaEvolution[2];
  shedinja.nickname = Array.from(speciesName(shedinja.species));
  shedinja.heldItem = 0;
  shedinja.markings = 0;
  shedinja.status = 0;
  shedinja.mail = C.MAIL_NONE;
  shedinja.mailMessage = undefined;
  shedinja.ribbons = new Array(18).fill(0);
  calculateStats(shedinja);
  save.party.push(shedinja);
  setDexFlag(shedinja.species, true);

  if (shedinja.species === C.SPECIES_SHEDINJA
      && shedinja.language === C.LANGUAGE_JAPANESE
      && mon.species === C.SPECIES_NINJASK) {
    shedinja.nickname = [...cdata<number[]>("evolution_scene", "sText_ShedinjaJapaneseName")];
  }
}

// Task wrappers matching C
const gTasks = tasks.tasks;
const CreateTask = (func: TaskFunc, priority = 0) => tasks.create(func, priority);
const DestroyTask = (taskId: number) => tasks.destroy(taskId);
const ResetTasks = () => tasks.reset();
const RunTasks = () => tasks.run();
const FuncIsActiveTask = (func: TaskFunc) => tasks.isActive(func);
const FindTaskIdByFunc = (func: TaskFunc) => tasks.findByFunc(func);

interface EvoInfo {
  preEvoSpriteId: number;
  postEvoSpriteId: number;
  evoTaskId: number;
  delayTimer: number;
  savedPalette: Uint16Array;
}

let sEvoStructPtr: EvoInfo | null = null;
let sBgAnimPal: Uint16Array | null = null;
export let gCB2_AfterEvolution: MainCallback | null = null;

let sEvoCursorPos = 0;
let sEvoGraphicsTaskId = 0;
let sMoveToLearn = 0;

// ---------------------------------------------------------------- evolution_graphics.c

const sEvolutionSparkleMatrixScales = [
  0x3c0, 0x380, 0x340, 0x300, 0x2c0, 0x280, 0x240, 0x200, 0x1c0, 0x180, 0x140, 0x100,
];

// The C file uses named empty callbacks here; the shared dummy preserves the
// same no-op behavior and keeps the engine's dummy-callback identity checks.
const SpriteCallbackDummy_EvoSparkles = SpriteCallbackDummy;
const SpriteCallbackDummy_MonSprites = SpriteCallbackDummy;

function SetEvoSparklesMatrices(): void {
  for (let i = 0; i < sEvolutionSparkleMatrixScales.length; i++) {
    const s = sEvolutionSparkleMatrixScales[i];
    SetOamMatrix(i + 20, s, 0, 0, s);
  }
}

const sSpriteTemplate_EvolutionSparkles: SpriteTemplate = {
  tileTag: TAG_SPARKLES,
  paletteTag: TAG_SPARKLES,
  oam: oamData({
    y: 160,
    priority: 1,
    shape: 0,
    size: 0,
    bpp: ST_OAM_4BPP,
  }),
  anims: gDummySpriteAnimTable,
  images: null,
  affineAnims: gDummySpriteAffineAnimTable,
  callback: SpriteCallbackDummy_EvoSparkles,
};

function LoadEvoSparkleSpriteAndPal(): void {
  FreeSpriteTilesByTag(TAG_SPARKLES);
  LoadSpriteSheet({ data: incbin("sEvolutionSparklesTileData"), size: 0x20, tag: TAG_SPARKLES });
  LoadSpritePalette({ data: incbin16("sEvolutionSparklesPalData"), tag: TAG_SPARKLES });
}

function SpriteCB_PreEvoSparkleSet1(sprite: Sprite): void {
  if (sprite.y > 8) {
    sprite.y = 88 - Math.trunc((sprite.data[7] * sprite.data[7]) / 80);
    sprite.y2 = Math.trunc(Sin(sprite.data[6] & 0xff, sprite.data[5]) / 4);
    sprite.x2 = Cos(sprite.data[6] & 0xff, sprite.data[5]);
    sprite.data[6] = (sprite.data[6] + 4) & 0xff;
    if (sprite.data[7] & 1) sprite.data[5]--;
    sprite.data[7]++;
    sprite.subpriority = sprite.y2 > 0 ? 1 : 20;
    let mnum = Math.trunc(sprite.data[5] / 4) + 20;
    if (mnum > 31) mnum = 31;
    sprite.oam.matrixNum = mnum;
  } else {
    DestroySprite(sprite);
  }
}

function CreatePreEvoSparkleSet1(a0: number): void {
  const spriteId = CreateSprite(sSpriteTemplate_EvolutionSparkles, 120, 88, 0);
  if (spriteId !== 0xff) {
    const s = gSprites[spriteId];
    s.data[5] = 48;
    s.data[6] = a0;
    s.data[7] = 0;
    s.oam.affineMode = ST_OAM_AFFINE_NORMAL;
    s.oam.matrixNum = 31;
    CalcCenterToCornerVec(s, s.oam.shape, s.oam.size, s.oam.affineMode);
    s.callback = SpriteCB_PreEvoSparkleSet1;
  }
}

function EvoTask_WaitForPre1SparklesToGoUp(taskId: number): void {
  if (gTasks[taskId].data[15] !== 0) {
    gTasks[taskId].data[15]--;
  } else {
    DestroyTask(taskId);
  }
}

function EvoTask_CreatePreEvoSparkleSet1(taskId: number): void {
  if (gTasks[taskId].data[15] < 64) {
    if ((gTasks[taskId].data[15] & 7) === 0) {
      for (let i = 0; i < 4; i++) {
        CreatePreEvoSparkleSet1(2 * (gTasks[taskId].data[15] & 0x78) + 64 * i);
      }
    }
    gTasks[taskId].data[15]++;
  } else {
    gTasks[taskId].data[15] = 96;
    gTasks[taskId].func = EvoTask_WaitForPre1SparklesToGoUp;
  }
}

function EvoTask_PreEvoSparkleSet1Init(taskId: number): void {
  SetEvoSparklesMatrices();
  gTasks[taskId].data[15] = 0;
  BeginNormalPaletteFade(3 << gTasks[taskId].data[1], 10, 0, 16, RGB_WHITE);
  gTasks[taskId].func = EvoTask_CreatePreEvoSparkleSet1;
  sound.playSE(C.SE_M_MEGA_KICK);
}

function EvolutionSparkles_SpiralUpward(a0: number): number {
  const taskId = CreateTask(EvoTask_PreEvoSparkleSet1Init, 0);
  gTasks[taskId].data[1] = a0;
  return taskId;
}

function SpriteCB_PreEvoSparkleSet2(sprite: Sprite): void {
  if (sprite.y < 88) {
    sprite.y = 8 + Math.trunc((sprite.data[7] * sprite.data[7]) / 5);
    sprite.y2 = Math.trunc(Sin(sprite.data[6] & 0xff, sprite.data[5]) / 4);
    sprite.x2 = Cos(sprite.data[6] & 0xff, sprite.data[5]);
    sprite.data[5] = Sin((sprite.data[7] * 4) & 0xff, 40) + 8;
    sprite.data[7]++;
  } else {
    DestroySprite(sprite);
  }
}

function CreatePreEvoSparkleSet2(a0: number): void {
  const spriteId = CreateSprite(sSpriteTemplate_EvolutionSparkles, 120, 8, 0);
  if (spriteId !== 0xff) {
    const s = gSprites[spriteId];
    s.data[5] = 8;
    s.data[6] = a0;
    s.data[7] = 0;
    s.oam.affineMode = ST_OAM_AFFINE_NORMAL;
    s.oam.matrixNum = 25;
    s.subpriority = 1;
    CalcCenterToCornerVec(s, s.oam.shape, s.oam.size, s.oam.affineMode);
    s.callback = SpriteCB_PreEvoSparkleSet2;
  }
}

function EvoTask_CreatePreEvoSparklesSet2(taskId: number): void {
  if (gTasks[taskId].data[15] < 96) {
    if (gTasks[taskId].data[15] < 6) {
      for (let i = 0; i < 9; i++) CreatePreEvoSparkleSet2(16 * i);
    }
    gTasks[taskId].data[15]++;
  } else {
    gTasks[taskId].func = EvoTask_PreEvoSparkleSet2Teardown;
  }
}

/** evolution_graphics.c EvoTask_PreEvoSparkleSet2Teardown; preserve its next-task-tick teardown. */
function EvoTask_PreEvoSparkleSet2Teardown(taskId: number): void {
  DestroyTask(taskId);
}

function EvoTask_PreEvoSparkleSet2Init(taskId: number): void {
  SetEvoSparklesMatrices();
  gTasks[taskId].data[15] = 0;
  gTasks[taskId].func = EvoTask_CreatePreEvoSparklesSet2;
  sound.playSE(C.SE_M_BUBBLE_BEAM2);
}

function EvolutionSparkles_ArcDown(): number {
  return CreateTask(EvoTask_PreEvoSparkleSet2Init, 0);
}

function SpriteCB_PostEvoSparkleSet1(sprite: Sprite): void {
  if (sprite.data[5] > 8) {
    sprite.y2 = Sin(sprite.data[6] & 0xff, sprite.data[5]);
    sprite.x2 = Cos(sprite.data[6] & 0xff, sprite.data[5]);
    sprite.data[5] -= sprite.data[3];
    sprite.data[6] = (sprite.data[6] + 4) & 0xff;
  } else {
    DestroySprite(sprite);
  }
}

function CreatePostEvoSparkleSet1(a0: number, a1: number): void {
  const spriteId = CreateSprite(sSpriteTemplate_EvolutionSparkles, 120, 56, 0);
  if (spriteId !== 0xff) {
    const s = gSprites[spriteId];
    s.data[3] = a1;
    s.data[5] = 120;
    s.data[6] = a0;
    s.data[7] = 0;
    s.oam.affineMode = ST_OAM_AFFINE_NORMAL;
    s.oam.matrixNum = 31;
    s.subpriority = 1;
    CalcCenterToCornerVec(s, s.oam.shape, s.oam.size, s.oam.affineMode);
    s.callback = SpriteCB_PostEvoSparkleSet1;
  }
}

function EvoTask_CreatePostEvoSparklesSet1(taskId: number): void {
  if (gTasks[taskId].data[15] < 48) {
    if (gTasks[taskId].data[15] === 0) {
      for (let i = 0; i < 16; i++) CreatePostEvoSparkleSet1(i * 16, 4);
    }
    if (gTasks[taskId].data[15] === 32) {
      for (let i = 0; i < 16; i++) CreatePostEvoSparkleSet1(i * 16, 8);
    }
    gTasks[taskId].data[15]++;
  } else {
    gTasks[taskId].func = EvoTask_PostEvoSparklesSet1Teardown;
  }
}

/** evolution_graphics.c EvoTask_PostEvoSparklesSet1Teardown; preserve its next-task-tick teardown. */
function EvoTask_PostEvoSparklesSet1Teardown(taskId: number): void {
  DestroyTask(taskId);
}

function EvoTask_PostEvoSparklesSet1Init(taskId: number): void {
  SetEvoSparklesMatrices();
  gTasks[taskId].data[15] = 0;
  gTasks[taskId].func = EvoTask_CreatePostEvoSparklesSet1;
  sound.playSE(C.SE_SHINY);
}

function EvolutionSparkles_CircleInward(): number {
  return CreateTask(EvoTask_PostEvoSparklesSet1Init, 0);
}

function SpriteCB_PostEvoSparkleSet2(sprite: Sprite): void {
  if ((sprite.data[7] & 3) === 0) sprite.y++;
  if (sprite.data[6] < 128) {
    sprite.y2 = -Sin(sprite.data[6] & 0xff, sprite.data[5]);
    sprite.x = 120 + Math.trunc((sprite.data[3] * sprite.data[7]) / 3);
    sprite.data[6]++;
    let mnum = 31 - Math.trunc((sprite.data[6] * 12) / 128);
    if (sprite.data[6] > 64) {
      sprite.subpriority = 1;
    } else {
      sprite.invisible = false;
      sprite.subpriority = 20;
      if (sprite.data[6] > 112 && (sprite.data[6] & 1)) sprite.invisible = true;
    }
    if (mnum < 20) mnum = 20;
    sprite.oam.matrixNum = mnum;
    sprite.data[7]++;
  } else {
    DestroySprite(sprite);
  }
}

function CreatePostEvoSparkleSet2(seed: number): void {
  const spriteId = CreateSprite(sSpriteTemplate_EvolutionSparkles, 120, 56, 0);
  if (spriteId !== 0xff) {
    const s = gSprites[spriteId];
    s.data[3] = 3 - (random() % 7);
    s.data[5] = 48 + (random() & 63);
    s.data[7] = 0;
    s.oam.affineMode = ST_OAM_AFFINE_NORMAL;
    s.oam.matrixNum = 31;
    s.subpriority = 20;
    CalcCenterToCornerVec(s, s.oam.shape, s.oam.size, s.oam.affineMode);
    s.callback = SpriteCB_PostEvoSparkleSet2;
  }
}

function EvoTask_PostEvoSparklesSet2Teardown(taskId: number): void {
  if (!gPaletteFade.active) DestroyTask(taskId);
}

function EvoTask_CreatePostEvoSparklesSet2(taskId: number): void {
  if (gTasks[taskId].data[15] < 128) {
    switch (gTasks[taskId].data[15]) {
      case 0:
        for (let i = 0; i < 8; i++) CreatePostEvoSparkleSet2(i);
        break;
      case 32:
        BeginNormalPaletteFade(0xffff0f1c, 16, 16, 0, RGB_WHITE);
        break;
      default:
        if (gTasks[taskId].data[15] < 50) CreatePostEvoSparkleSet2(random() & 7);
        break;
    }
    gTasks[taskId].data[15]++;
  } else {
    gTasks[taskId].func = EvoTask_PostEvoSparklesSet2Teardown;
  }
}

function EvoTask_PostEvoSparklesSet2Init(taskId: number): void {
  SetEvoSparklesMatrices();
  gTasks[taskId].data[15] = 0;
  IsMovingBackgroundTaskRunning();
  gPlttBufferUnfaded.set(gPlttBufferFaded.subarray(BG_PLTT_ID(2), BG_PLTT_ID(2) + 48), BG_PLTT_ID(2));
  BeginNormalPaletteFade(0xfff90f1c, 0, 0, 16, RGB_WHITE);
  gTasks[taskId].func = EvoTask_CreatePostEvoSparklesSet2;
  sound.playSE(C.SE_M_PETAL_DANCE);
}

/** evolution_graphics.c EvoTask_CreatePostEvoSparklesSet2Trade. */
function EvoTask_CreatePostEvoSparklesSet2Trade(taskId: number): void {
  if (gTasks[taskId].data[15] < 128) {
    switch (gTasks[taskId].data[15]) {
      case 0:
        for (let i = 0; i < 8; i++) CreatePostEvoSparkleSet2(i);
        break;
      case 32:
        BeginNormalPaletteFade(0xffff0f00, 16, 16, 0, RGB_WHITE);
        break;
      default:
        if (gTasks[taskId].data[15] < 50) CreatePostEvoSparkleSet2(random() & 7);
        break;
    }
    gTasks[taskId].data[15]++;
  } else {
    gTasks[taskId].func = EvoTask_PostEvoSparklesSet2Teardown;
  }
}

/** evolution_graphics.c EvoTask_PostEvoSparklesSet2TradeInit. */
function EvoTask_PostEvoSparklesSet2TradeInit(taskId: number): void {
  SetEvoSparklesMatrices();
  gTasks[taskId].data[15] = 0;
  IsMovingBackgroundTaskRunning();
  gPlttBufferUnfaded.set(gPlttBufferFaded.subarray(BG_PLTT_ID(2), BG_PLTT_ID(2) + 48), BG_PLTT_ID(2));
  BeginNormalPaletteFade(0xfff90f00, 0, 0, 16, RGB_WHITE);
  gTasks[taskId].func = EvoTask_CreatePostEvoSparklesSet2Trade;
  sound.playSE(C.SE_M_PETAL_DANCE);
}

/** evolution_graphics.c EvolutionSparkles_SprayAndFlash_Trade. */
export function EvolutionSparkles_SprayAndFlash_Trade(species: number): number {
  const taskId = CreateTask(EvoTask_PostEvoSparklesSet2TradeInit, 0);
  gTasks[taskId].data[2] = species;
  return taskId;
}

function EvolutionSparkles_SprayAndFlash(species: number): number {
  const taskId = CreateTask(EvoTask_PostEvoSparklesSet2Init, 0);
  gTasks[taskId].data[2] = species;
  return taskId;
}

// Mon sprite morphing: white silhouette scale oscillation
// data[1]: preEvoSpriteId
// data[2]: postEvoSpriteId
// data[3]: tPreEvoScale
// data[4]: tPostEvoScale
// data[5]: tDirection
// data[6]: tSpeed
// data[8]: tEvoStopped

function PreEvoInvisible_PostEvoVisible_KillTask(taskId: number): void {
  const pre = gSprites[gTasks[taskId].data[1]];
  const post = gSprites[gTasks[taskId].data[2]];
  pre.oam.affineMode = ST_OAM_AFFINE_OFF;
  pre.oam.matrixNum = 0;
  pre.invisible = true;
  post.oam.affineMode = ST_OAM_AFFINE_OFF;
  post.oam.matrixNum = 0;
  post.invisible = false;
  CalcCenterToCornerVec(pre, pre.oam.shape, pre.oam.size, pre.oam.affineMode);
  CalcCenterToCornerVec(post, post.oam.shape, post.oam.size, post.oam.affineMode);
  DestroyTask(taskId);
}

function PreEvoVisible_PostEvoInvisible_KillTask(taskId: number): void {
  const pre = gSprites[gTasks[taskId].data[1]];
  const post = gSprites[gTasks[taskId].data[2]];
  pre.oam.affineMode = ST_OAM_AFFINE_OFF;
  pre.oam.matrixNum = 0;
  pre.invisible = false;
  post.oam.affineMode = ST_OAM_AFFINE_OFF;
  post.oam.matrixNum = 0;
  post.invisible = true;
  CalcCenterToCornerVec(pre, pre.oam.shape, pre.oam.size, pre.oam.affineMode);
  CalcCenterToCornerVec(post, post.oam.shape, post.oam.size, post.oam.affineMode);
  DestroyTask(taskId);
}

function EvoTask_ShrinkOrExpandEvoSprites(taskId: number): void {
  const t = gTasks[taskId];
  if (t.data[8]) {
    t.func = PreEvoVisible_PostEvoInvisible_KillTask;
    return;
  }
  let r6 = 0;
  if (!t.data[5]) {
    if (t.data[3] < 0x100 - t.data[6]) {
      t.data[3] += t.data[6];
    } else {
      t.data[3] = 0x100;
      r6 = 1;
    }
    if (t.data[4] > 0x10 + t.data[6]) {
      t.data[4] -= t.data[6];
    } else {
      t.data[4] = 0x10;
      r6++;
    }
  } else {
    if (t.data[4] < 0x100 - t.data[6]) {
      t.data[4] += t.data[6];
    } else {
      t.data[4] = 0x100;
      r6 = 1;
    }
    if (t.data[3] > 0x10 + t.data[6]) {
      t.data[3] -= t.data[6];
    } else {
      t.data[3] = 0x10;
      r6++;
    }
  }
  const m30 = Math.floor(0x10000 / t.data[3]);
  const m31 = Math.floor(0x10000 / t.data[4]);
  SetOamMatrix(30, m30, 0, 0, m30);
  SetOamMatrix(31, m31, 0, 0, m31);
  if (r6 === 2) {
    t.func = EvoTask_ChooseNextEvoSpriteAnim;
  }
}

function EvoTask_ChooseNextEvoSpriteAnim(taskId: number): void {
  const t = gTasks[taskId];
  if (t.data[8]) {
    PreEvoVisible_PostEvoInvisible_KillTask(taskId);
  } else if (t.data[6] === 128) {
    PreEvoInvisible_PostEvoVisible_KillTask(taskId);
  } else {
    t.data[6] += 2;
    t.data[5] ^= 1;
    t.func = EvoTask_ShrinkOrExpandEvoSprites;
  }
}

function EvoTask_PrePostEvoMonSpritesInit(taskId: number): void {
  gTasks[taskId].data[5] = 0;
  gTasks[taskId].data[6] = 8;
  gTasks[taskId].func = EvoTask_ChooseNextEvoSpriteAnim;
}

function CycleEvolutionMonSprite(preEvoSpriteId: number, postEvoSpriteId: number): number {
  const taskId = CreateTask(EvoTask_PrePostEvoMonSpritesInit, 0);
  const t = gTasks[taskId];
  t.data[1] = preEvoSpriteId;
  t.data[2] = postEvoSpriteId;
  t.data[3] = 256;
  t.data[4] = 16;
  t.data[8] = 0; // tEvoStopped

  SetOamMatrix(30, Math.floor(0x10000 / 256), 0, 0, Math.floor(0x10000 / 256));
  SetOamMatrix(31, Math.floor(0x10000 / 16), 0, 0, Math.floor(0x10000 / 16));

  const pre = gSprites[preEvoSpriteId];
  pre.callback = SpriteCallbackDummy_MonSprites;
  pre.oam.affineMode = ST_OAM_AFFINE_NORMAL;
  pre.oam.matrixNum = 30;
  pre.invisible = false;
  CalcCenterToCornerVec(pre, pre.oam.shape, pre.oam.size, pre.oam.affineMode);

  const post = gSprites[postEvoSpriteId];
  post.callback = SpriteCallbackDummy_MonSprites;
  post.oam.affineMode = ST_OAM_AFFINE_NORMAL;
  post.oam.matrixNum = 31;
  post.invisible = false;
  CalcCenterToCornerVec(post, post.oam.shape, post.oam.size, post.oam.affineMode);

  // Fill faded palettes for pre and post evo with white
  gPlttBufferFaded.subarray(OBJ_PLTT_ID(pre.oam.paletteNum), OBJ_PLTT_ID(pre.oam.paletteNum) + 16).fill(RGB_WHITE);
  gPlttBufferFaded.subarray(OBJ_PLTT_ID(post.oam.paletteNum), OBJ_PLTT_ID(post.oam.paletteNum) + 16).fill(RGB_WHITE);

  return taskId;
}

// ---------------------------------------------------------------- evolution_scene.c background anim

const sBgAnim_PaletteControl: number[][] = [
  [0, 12, 1, 6],
  [13, 36, 5, 2],
  [13, 24, 1, 2],
  [37, 49, 1, 6],
];

function Task_UpdateBgPalette(taskId: number): void {
  const d = gTasks[taskId].data;
  // d[0]: tCycleTimer
  // d[1]: tPalStage
  // d[2]: tControlStage
  // d[3]: tNumCycles
  // d[5]: tStartTimer
  // d[6]: tPaused

  if (d[6]) return;
  if (d[5]++ < 20) return;

  const control = sBgAnim_PaletteControl[d[2]];
  if (!control) {
    DestroyTask(taskId);
    return;
  }
  const [startPal, endPal, cycles, delay] = control;

  if (d[0]++ > delay) {
    if (d[1] === endPal) {
      d[3]++;
      if (d[3] === cycles) {
        d[3] = 0;
        d[2]++;
      }
      d[1] = startPal;
    } else {
      if (sBgAnimPal) {
        LoadPalette(sBgAnimPal.subarray(d[1] * 16, d[1] * 16 + 16), BG_PLTT_ID(10), PLTT_SIZE_4BPP);
      }
      d[0] = 0;
      d[1]++;
    }
  }

  if (d[2] >= sBgAnim_PaletteControl.length) {
    DestroyTask(taskId);
  }
}

function Task_AnimateBg(taskId: number): void {
  const d = gTasks[taskId].data;
  const isLink = !!d[2];

  d[0] = (d[0] + 5) & 0xff;
  d[1] = (d[0] + 0x80) & 0xff;

  G.gBattle_BG1_X = Cos(d[0], 4) + 8;
  G.gBattle_BG1_Y = Sin(d[0], 4) + 16;

  if (!isLink) {
    G.gBattle_BG2_X = Cos(d[1], 4) + 8;
    G.gBattle_BG2_Y = Sin(d[1], 4) + 16;
  } else {
    G.gBattle_BG3_X = Cos(d[1], 4) + 8;
    G.gBattle_BG3_Y = Sin(d[1], 4) + 16;
  }

  if (!FuncIsActiveTask(Task_UpdateBgPalette)) {
    DestroyTask(taskId);
    G.gBattle_BG1_X = 0;
    G.gBattle_BG1_Y = 0;
    if (!isLink) {
      G.gBattle_BG2_X = 0;
      G.gBattle_BG2_Y = 0;
    } else {
      G.gBattle_BG3_X = 256;
      G.gBattle_BG3_Y = 0;
    }
  }
}

function InitMovingBgPalette(palette: Uint16Array): void {
  const palIndexes = cdata<number[][]>("evolution_scene", "sBgAnim_PalIndexes");
  const bgPal = incbin16("sBgAnim_Pal");
  for (let i = 0; i < palIndexes.length; i++) {
    for (let j = 0; j < 16; j++) {
      palette[i * 16 + j] = bgPal[palIndexes[i][j]];
    }
  }
}

function StartBgAnimation(isLink: boolean): void {
  sBgAnimPal = new Uint16Array(50 * 16);
  InitMovingBgPalette(sBgAnimPal);

  const innerBgId = 1;
  const outerBgId = !isLink ? 2 : 3;

  LoadPalette(incbin16("evolution_scene.c:sBlackPalette"), BG_PLTT_ID(10), 32);

  const bgTiles = incbin("sMovingBackgroundTiles");
  LoadBgTiles(1, bgTiles, bgTiles.length, 0);
  CopyToBgTilemapBuffer(1, incbin("sMovingBackgroundMap1"), 0, 0);
  CopyToBgTilemapBuffer(outerBgId, incbin("sMovingBackgroundMap2"), 0, 0);
  CopyBgTilemapBufferToVram(1);
  CopyBgTilemapBufferToVram(outerBgId);

  if (!isLink) {
    SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG1 | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_BG2);
    SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(8, 8));
    SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_ON | DISPCNT_BG2_ON | DISPCNT_BG1_ON | DISPCNT_BG0_ON | DISPCNT_OBJ_1D_MAP);
    SetBgAttribute(innerBgId, BG_ATTR_PRIORITY, 2);
    SetBgAttribute(outerBgId, BG_ATTR_PRIORITY, 2);
    ShowBg(1);
    ShowBg(2);
  } else {
    SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG1 | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_BG3);
    SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(8, 8));
    SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_ON | DISPCNT_BG3_ON | DISPCNT_BG1_ON | DISPCNT_BG0_ON | DISPCNT_OBJ_1D_MAP);
    SetBgAttribute(innerBgId, BG_ATTR_PRIORITY, 2);
    SetBgAttribute(outerBgId, BG_ATTR_PRIORITY, 2);
    ShowBg(1);
    ShowBg(3);
  }

  CreateTask(Task_UpdateBgPalette, 5);
  CreateBgAnimTask(isLink);
}

/** CreateBgAnimTask (evolution_scene.c): the task uses data[2] as a bool8. */
function CreateBgAnimTask(isLink: boolean): void {
  const taskId = CreateTask(Task_AnimateBg, 7);
  gTasks[taskId].data[2] = isLink ? 1 : 0;
}

function IsMovingBackgroundTaskRunning(): void {
  const taskId = FindTaskIdByFunc(Task_UpdateBgPalette);
  if (taskId !== TAIL_SENTINEL) {
    gTasks[taskId].data[6] = 1; // tPaused = true
  }
  gPlttBufferFaded.subarray(BG_PLTT_ID(10), BG_PLTT_ID(10) + 16).fill(RGB_BLACK);
  gPlttBufferUnfaded.subarray(BG_PLTT_ID(10), BG_PLTT_ID(10) + 16).fill(RGB_BLACK);
}

function RestoreBgAfterAnim(): void {
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  G.gBattle_BG1_X = 0;
  G.gBattle_BG1_Y = 0;
  G.gBattle_BG2_X = 0;
  G.gBattle_BG2_Y = 0;
  SetBgAttribute(1, BG_ATTR_PRIORITY, GetBattleBgTemplateData(1, 5));
  SetBgAttribute(2, BG_ATTR_PRIORITY, GetBattleBgTemplateData(2, 5));
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_ON | DISPCNT_BG3_ON | DISPCNT_BG0_ON | DISPCNT_OBJ_1D_MAP);
  sBgAnimPal = null;
}

function StopBgAnimation(): void {
  const id1 = FindTaskIdByFunc(Task_UpdateBgPalette);
  if (id1 !== TAIL_SENTINEL) DestroyTask(id1);
  const id2 = FindTaskIdByFunc(Task_AnimateBg);
  if (id2 !== TAIL_SENTINEL) DestroyTask(id2);

  gPlttBufferFaded.subarray(BG_PLTT_ID(10), BG_PLTT_ID(10) + 16).fill(RGB_BLACK);
  gPlttBufferUnfaded.subarray(BG_PLTT_ID(10), BG_PLTT_ID(10) + 16).fill(RGB_BLACK);
  RestoreBgAfterAnim();
}

// ---------------------------------------------------------------- EvolutionScene state machine

enum EvoState {
  EVOSTATE_FADE_IN,
  EVOSTATE_INTRO_MSG,
  EVOSTATE_INTRO_MON_ANIM,
  EVOSTATE_INTRO_SOUND,
  EVOSTATE_START_MUSIC,
  EVOSTATE_START_BG_AND_SPARKLE_SPIRAL,
  EVOSTATE_SPARKLE_ARC,
  EVOSTATE_CYCLE_MON_SPRITE,
  EVOSTATE_WAIT_CYCLE_MON_SPRITE,
  EVOSTATE_SPARKLE_CIRCLE,
  EVOSTATE_SPARKLE_SPRAY,
  EVOSTATE_EVO_SOUND,
  EVOSTATE_RESTORE_SCREEN,
  EVOSTATE_EVO_MON_ANIM,
  EVOSTATE_SET_MON_EVOLVED,
  EVOSTATE_TRY_LEARN_MOVE,
  EVOSTATE_END,
  EVOSTATE_CANCEL,
  EVOSTATE_CANCEL_MON_ANIM,
  EVOSTATE_CANCEL_MSG,
  EVOSTATE_LEARNED_MOVE,
  EVOSTATE_TRY_LEARN_ANOTHER_MOVE,
  EVOSTATE_REPLACE_MOVE,
}

enum MoveState {
  MVSTATE_INTRO_MSG_1,
  MVSTATE_INTRO_MSG_2,
  MVSTATE_INTRO_MSG_3,
  MVSTATE_PRINT_YES_NO,
  MVSTATE_HANDLE_YES_NO,
  MVSTATE_SHOW_MOVE_SELECT,
  MVSTATE_HANDLE_MOVE_SELECT,
  MVSTATE_FORGET_MSG_1,
  MVSTATE_FORGET_MSG_2,
  MVSTATE_LEARNED_MOVE,
  MVSTATE_ASK_CANCEL,
  MVSTATE_CANCEL,
  MVSTATE_RETRY_AFTER_HM,
}

const TASK_BIT_CAN_STOP = 1 << 0;
const TASK_BIT_LEARN_MOVE = 1 << 7;

function PREPARE_MOVE_BUFFER(dst: Uint8Array, move: number): void {
  dst[0] = C.B_BUFF_PLACEHOLDER_BEGIN;
  dst[1] = C.B_BUFF_MOVE;
  dst[2] = move & 0xff;
  dst[3] = (move >> 8) & 0xff;
  dst[4] = C.B_BUFF_EOS;
}

function CB2_EvolutionSceneUpdate(): void {
  AnimateSprites();
  BuildOamBuffer();
  RunTextPrinters();
  UpdatePaletteFade();
  RunTasks();
}

function VBlankCB_EvolutionScene(): void {
  SetGpuReg(REG_OFFSET_BG0HOFS, G.gBattle_BG0_X);
  SetGpuReg(REG_OFFSET_BG0VOFS, G.gBattle_BG0_Y);
  SetGpuReg(REG_OFFSET_BG1HOFS, G.gBattle_BG1_X);
  SetGpuReg(REG_OFFSET_BG1VOFS, G.gBattle_BG1_Y);
  SetGpuReg(REG_OFFSET_BG2HOFS, G.gBattle_BG2_X);
  SetGpuReg(REG_OFFSET_BG2VOFS, G.gBattle_BG2_Y);
  SetGpuReg(REG_OFFSET_BG3HOFS, G.gBattle_BG3_X);
  SetGpuReg(REG_OFFSET_BG3VOFS, G.gBattle_BG3_Y);
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function CB2_EvolutionSceneLoadGraphics(): void {
  if (!sEvoStructPtr) return;
  const taskId = sEvoStructPtr.evoTaskId;
  const partyId = gTasks[taskId].data[10];
  const mon = save.party[partyId] ?? playerMon(partyId);
  const postEvoSpecies = gTasks[taskId].data[2];

  SetHBlankCallback(null);
  SetVBlankCallback(null);
  ppu.vram.fill(0);

  SetGpuReg(REG_OFFSET_MOSAIC, 0);
  SetGpuReg(REG_OFFSET_WIN0H, 0);
  SetGpuReg(REG_OFFSET_WIN0V, 0);
  SetGpuReg(REG_OFFSET_WIN1H, 0);
  SetGpuReg(REG_OFFSET_WIN1V, 0);
  SetGpuReg(REG_OFFSET_WININ, 0);
  SetGpuReg(REG_OFFSET_WINOUT, 0);

  ResetPaletteFade();

  G.gBattle_BG0_X = 0; G.gBattle_BG0_Y = 0;
  G.gBattle_BG1_X = 0; G.gBattle_BG1_Y = 0;
  G.gBattle_BG2_X = 0; G.gBattle_BG2_Y = 0;
  G.gBattle_BG3_X = 256; G.gBattle_BG3_Y = 0;
  G.gBattleTerrain = C.BATTLE_TERRAIN_PLAIN;

  InitBattleBgsVideo();
  LoadBattleTextboxAndBackground();
  ResetSpriteData();
  FreeAllSpritePalettes();

  const postEvoPic = new Uint8Array(2048);
  LoadSpecialPokePic(true, postEvoPic, postEvoSpecies, mon.personality, true);
  FreeSpriteTilesByTag(TAG_POST_EVO);
  LoadSpriteSheet({ data: postEvoPic, size: 2048, tag: TAG_POST_EVO });

  const pal2 = GetMonSpritePalFromSpeciesAndPersonality(postEvoSpecies, mon.otId, mon.personality);
  LoadPalette(pal2, OBJ_PLTT_ID(2), PLTT_SIZE_4BPP);

  const postTemplate: SpriteTemplate = {
    tileTag: TAG_POST_EVO,
    paletteTag: TAG_NONE,
    oam: oamData({
      affineMode: ST_OAM_AFFINE_OFF,
      objMode: 0,
      mosaic: 0,
      bpp: ST_OAM_4BPP,
      shape: 0,
      size: 3, // 64x64
      priority: 0,
      paletteNum: 2,
    }),
    anims: gDummySpriteAnimTable,
    images: null,
    affineAnims: gDummySpriteAffineAnimTable,
    callback: SpriteCallbackDummy,
  };
  sEvoStructPtr.postEvoSpriteId = CreateSprite(postTemplate, 120, 64, 30);

  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_ON | DISPCNT_BG_ALL_ON | DISPCNT_OBJ_1D_MAP);
  SetVBlankCallback(VBlankCB_EvolutionScene);
  SetMainCallback2(CB2_EvolutionSceneUpdate);

  BeginNormalPaletteFade(PALETTES_ALL, 0, 0x10, 0, RGB_BLACK);
  ShowBg(0);
  ShowBg(1);
  ShowBg(2);
  ShowBg(3);
}

function Task_EvolutionScene(taskId: number): void {
  const t = gTasks[taskId];
  const partyId = t.data[10];
  const mon = (save.party[partyId] ?? playerMon(partyId)) as Pokemon;
  const postEvoSpecies = t.data[2];
  const preEvoSpecies = t.data[1];

  // Automatic cancel if target is past Mew without national dex
  const national = varGet(C.VAR_NATIONAL_DEX) === 0x6258 && flagGet(C.FLAG_SYS_NATIONAL_DEX);
  if (!national && t.data[0] === EvoState.EVOSTATE_WAIT_CYCLE_MON_SPRITE && postEvoSpecies > C.SPECIES_MEW) {
    t.data[0] = EvoState.EVOSTATE_CANCEL;
    t.data[9] = 1; // tEvoWasStopped = true
    if (tasks.tasks[sEvoGraphicsTaskId]?.isActive) {
      gTasks[sEvoGraphicsTaskId].data[8] = 1; // tEvoStopped = true
    }
    StopBgAnimation();
    return;
  }

  // B Button cancel check
  if (
    (joy.held & B_BUTTON) !== 0 &&
    t.data[0] === EvoState.EVOSTATE_WAIT_CYCLE_MON_SPRITE &&
    tasks.tasks[sEvoGraphicsTaskId]?.isActive &&
    (t.data[3] & TASK_BIT_CAN_STOP)
  ) {
    t.data[0] = EvoState.EVOSTATE_CANCEL;
    if (tasks.tasks[sEvoGraphicsTaskId]?.isActive) {
      gTasks[sEvoGraphicsTaskId].data[8] = 1; // tEvoStopped = true
    }
    StopBgAnimation();
    return;
  }

  switch (t.data[0]) {
    case EvoState.EVOSTATE_FADE_IN:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0x10, 0, RGB_BLACK);
      if (sEvoStructPtr) gSprites[sEvoStructPtr.preEvoSpriteId].invisible = false;
      t.data[0]++;
      ShowBg(0);
      ShowBg(1);
      ShowBg(2);
      ShowBg(3);
      break;

    case EvoState.EVOSTATE_INTRO_MSG:
      if (!gPaletteFade.active) {
        stringVars.var1 = Uint8Array.from(mon.nickname);
        const text = expandPlaceholders(rom.text("gText_PkmnIsEvolving"));
        BattlePutTextOnWindow(text, C.B_WIN_MSG);
        t.data[0]++;
      }
      break;

    case EvoState.EVOSTATE_INTRO_MON_ANIM:
      if (!IsTextPrinterActive(0)) {
        sound.PlayCry_Normal(preEvoSpecies, 0);
        t.data[0]++;
      }
      break;

    case EvoState.EVOSTATE_INTRO_SOUND:
      if (sound.isCryFinished()) {
        sound.playSE(sound.c("MUS_EVOLUTION_INTRO"));
        t.data[0]++;
      }
      break;

    case EvoState.EVOSTATE_START_MUSIC:
      if (!sound.isSEPlaying()) {
        sound.playBGM(sound.c("MUS_EVOLUTION"));
        t.data[0]++;
        BeginNormalPaletteFade(0x1c, 4, 0, 0x10, RGB_BLACK);
      }
      break;

    case EvoState.EVOSTATE_START_BG_AND_SPARKLE_SPIRAL:
      if (!gPaletteFade.active) {
        StartBgAnimation(false);
        sEvoGraphicsTaskId = EvolutionSparkles_SpiralUpward(17);
        t.data[0]++;
      }
      break;

    case EvoState.EVOSTATE_SPARKLE_ARC:
      if (!tasks.tasks[sEvoGraphicsTaskId]?.isActive) {
        t.data[0]++;
        if (sEvoStructPtr) sEvoStructPtr.delayTimer = 1;
        sEvoGraphicsTaskId = EvolutionSparkles_ArcDown();
      }
      break;

    case EvoState.EVOSTATE_CYCLE_MON_SPRITE:
      if (!tasks.tasks[sEvoGraphicsTaskId]?.isActive && sEvoStructPtr) {
        sEvoGraphicsTaskId = CycleEvolutionMonSprite(sEvoStructPtr.preEvoSpriteId, sEvoStructPtr.postEvoSpriteId);
        t.data[0]++;
      }
      break;

    case EvoState.EVOSTATE_WAIT_CYCLE_MON_SPRITE:
      if (sEvoStructPtr && --sEvoStructPtr.delayTimer <= 0) {
        sEvoStructPtr.delayTimer = 3;
        if (!tasks.tasks[sEvoGraphicsTaskId]?.isActive) {
          t.data[0]++;
        }
      }
      break;

    case EvoState.EVOSTATE_SPARKLE_CIRCLE:
      sEvoGraphicsTaskId = EvolutionSparkles_CircleInward();
      t.data[0]++;
      break;

    case EvoState.EVOSTATE_SPARKLE_SPRAY:
      if (!tasks.tasks[sEvoGraphicsTaskId]?.isActive) {
        sEvoGraphicsTaskId = EvolutionSparkles_SprayAndFlash(postEvoSpecies);
        t.data[0]++;
      }
      break;

    case EvoState.EVOSTATE_EVO_SOUND:
      if (!tasks.tasks[sEvoGraphicsTaskId]?.isActive) {
        sound.playSE(C.SE_EXP);
        t.data[0]++;
      }
      break;

    case EvoState.EVOSTATE_RESTORE_SCREEN:
      if (sound.isSEPlaying()) {
        sound.stopBGM();
        if (sEvoStructPtr) {
          gPlttBufferUnfaded.set(sEvoStructPtr.savedPalette, BG_PLTT_ID(2));
        }
        RestoreBgAfterAnim();
        BeginNormalPaletteFade(0x1c, 0, 0x10, 0, RGB_BLACK);
        t.data[0]++;
      }
      break;

    case EvoState.EVOSTATE_EVO_MON_ANIM:
      if (!gPaletteFade.active) {
        sound.PlayCry_Normal(postEvoSpecies, 0);
        t.data[0]++;
      }
      break;

    case EvoState.EVOSTATE_SET_MON_EVOLVED:
      if (sound.isCryFinished()) {
        stringVars.var1 = Uint8Array.from(mon.nickname);
        stringVars.var2 = speciesName(postEvoSpecies);
        const text = expandPlaceholders(rom.text("gText_CongratsPkmnEvolved"));
        BattlePutTextOnWindow(text, C.B_WIN_MSG);
        sound.playFanfare(C.MUS_EVOLVED);
        t.data[0]++;
        evolveMon(mon, postEvoSpecies);
        incrementGameStat(C.GAME_STAT_EVOLVED_POKEMON);
      }
      break;

    case EvoState.EVOSTATE_TRY_LEARN_MOVE:
      if (!IsTextPrinterActive(0)) {
        const learnsFirst = !!t.data[4];
        const varRes = MonTryLearningNewMove(mon, learnsFirst, (m) => { sMoveToLearn = m; });
        if (varRes !== C.MOVE_NONE && !t.data[9]) {
          sound.stopBGM();
          t.data[3] |= TASK_BIT_LEARN_MOVE;
          t.data[4] = 0; // tLearnsFirstMove = false
          t.data[6] = MoveState.MVSTATE_INTRO_MSG_1; // tLearnMoveState
          gBattleTextBuff1.set(mon.nickname);

          if (varRes === C.MON_HAS_MAX_MOVES) {
            t.data[0] = EvoState.EVOSTATE_REPLACE_MOVE;
          } else if (varRes === C.MON_ALREADY_KNOWS_MOVE) {
            break;
          } else {
            t.data[0] = EvoState.EVOSTATE_LEARNED_MOVE;
          }
        } else {
          // No move to learn, or evolution was canceled
          BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0x10, RGB_BLACK);
          t.data[0] = EvoState.EVOSTATE_END;
        }
      }
      break;

    case EvoState.EVOSTATE_END:
      if (!gPaletteFade.active) {
        if (!t.data[9]) {
          CreateShedinja(preEvoSpecies, mon);
        }
        DestroyTask(taskId);
        FreeSpriteTilesByTag(TAG_PRE_EVO);
        FreeSpriteTilesByTag(TAG_POST_EVO);
        FreeSpriteTilesByTag(TAG_SPARKLES);
        sEvoStructPtr = null;
        FreeAllWindowBuffers();
        SetVBlankCallback(null);
        if (gCB2_AfterEvolution) {
          SetMainCallback2(gCB2_AfterEvolution);
        }
      }
      break;

    case EvoState.EVOSTATE_CANCEL:
      if (!tasks.tasks[sEvoGraphicsTaskId]?.isActive) {
        sound.stopBGM();
        BeginNormalPaletteFade(0x6001c, 0, 0x10, 0, RGB_WHITE);
        t.data[0] = EvoState.EVOSTATE_CANCEL_MON_ANIM;
      }
      break;

    case EvoState.EVOSTATE_CANCEL_MON_ANIM:
      if (!gPaletteFade.active) {
        sound.PlayCry_Normal(preEvoSpecies, 0);
        t.data[0] = EvoState.EVOSTATE_CANCEL_MSG;
      }
      break;

    case EvoState.EVOSTATE_CANCEL_MSG:
      if (sound.isCryFinished()) {
        const textKey = t.data[9] ? "gText_EllipsisQuestionMark" : "gText_PkmnStoppedEvolving";
        stringVars.var1 = Uint8Array.from(mon.nickname);
        const text = expandPlaceholders(rom.text(textKey));
        BattlePutTextOnWindow(text, C.B_WIN_MSG);
        t.data[9] = 1; // tEvoWasStopped = true
        t.data[0] = EvoState.EVOSTATE_TRY_LEARN_MOVE;
      }
      break;

    case EvoState.EVOSTATE_LEARNED_MOVE:
      if (!IsTextPrinterActive(0) && !sound.isSEPlaying()) {
        PREPARE_MOVE_BUFFER(gBattleTextBuff2, sMoveToLearn);
        sound.playFanfare(C.MUS_LEVEL_UP);
        BufferStringBattle(C.STRINGID_PKMNLEARNEDMOVE);
        BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
        t.data[4] = 0x40; // counter
        t.data[0] = EvoState.EVOSTATE_TRY_LEARN_ANOTHER_MOVE;
      }
      break;

    case EvoState.EVOSTATE_TRY_LEARN_ANOTHER_MOVE:
      if (!IsTextPrinterActive(0) && !sound.isSEPlaying() && --t.data[4] === 0) {
        t.data[0] = EvoState.EVOSTATE_TRY_LEARN_MOVE;
      }
      break;

    case EvoState.EVOSTATE_REPLACE_MOVE:
      switch (t.data[6]) {
        case MoveState.MVSTATE_INTRO_MSG_1:
          if (!IsTextPrinterActive(0) && !sound.isSEPlaying()) {
            PREPARE_MOVE_BUFFER(gBattleTextBuff2, sMoveToLearn);
            BufferStringBattle(C.STRINGID_TRYTOLEARNMOVE1);
            BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
            t.data[6]++;
          }
          break;

        case MoveState.MVSTATE_INTRO_MSG_2:
          if (!IsTextPrinterActive(0) && !sound.isSEPlaying()) {
            BufferStringBattle(C.STRINGID_TRYTOLEARNMOVE2);
            BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
            t.data[6]++;
          }
          break;

        case MoveState.MVSTATE_INTRO_MSG_3:
          if (!IsTextPrinterActive(0) && !sound.isSEPlaying()) {
            BufferStringBattle(C.STRINGID_TRYTOLEARNMOVE3);
            BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
            t.data[7] = MoveState.MVSTATE_SHOW_MOVE_SELECT; // tLearnMoveYesState
            t.data[8] = MoveState.MVSTATE_ASK_CANCEL;       // tLearnMoveNoState
            t.data[6] = MoveState.MVSTATE_PRINT_YES_NO;
          }
          break;

        case MoveState.MVSTATE_PRINT_YES_NO:
          if (!IsTextPrinterActive(0) && !sound.isSEPlaying()) {
            HandleBattleWindow(23, 8, 29, 13, 0);
            BattlePutTextOnWindow(rom.text("gText_BattleYesNoChoice"), C.B_WIN_YESNO);
            t.data[6] = MoveState.MVSTATE_HANDLE_YES_NO;
            sEvoCursorPos = 0;
            BattleCreateYesNoCursorAt();
          }
          break;

        case MoveState.MVSTATE_HANDLE_YES_NO:
          if (JOY_NEW(DPAD_UP) && sEvoCursorPos !== 0) {
            sound.playSE(C.SE_SELECT);
            BattleDestroyYesNoCursorAt();
            sEvoCursorPos = 0;
            BattleCreateYesNoCursorAt();
          }
          if (JOY_NEW(DPAD_DOWN) && sEvoCursorPos === 0) {
            sound.playSE(C.SE_SELECT);
            BattleDestroyYesNoCursorAt();
            sEvoCursorPos = 1;
            BattleCreateYesNoCursorAt();
          }
          if (JOY_NEW(A_BUTTON)) {
            HandleBattleWindow(23, 8, 29, 13, C.WINDOW_CLEAR);
            sound.playSE(C.SE_SELECT);
            if (sEvoCursorPos !== 0) {
              t.data[6] = t.data[8]; // NO state
            } else {
              t.data[6] = t.data[7]; // YES state
              if (t.data[6] === MoveState.MVSTATE_SHOW_MOVE_SELECT) {
                BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0x10, RGB_BLACK);
              }
            }
          }
          if (JOY_NEW(B_BUTTON)) {
            HandleBattleWindow(23, 8, 29, 13, C.WINDOW_CLEAR);
            sound.playSE(C.SE_SELECT);
            t.data[6] = t.data[8]; // NO state
          }
          break;

        case MoveState.MVSTATE_SHOW_MOVE_SELECT:
          if (!gPaletteFade.active) {
            FreeAllWindowBuffers();
            ShowSelectMovePokemonSummaryScreen(
              partyId,
              CalculatePlayerPartyCount() - 1,
              CB2_EvolutionSceneLoadGraphics,
              sMoveToLearn,
            );
            t.data[6]++;
          }
          break;

        case MoveState.MVSTATE_HANDLE_MOVE_SELECT:
          if (!gPaletteFade.active && gMain.callback2 === CB2_EvolutionSceneUpdate) {
            const slot = GetMoveSlotToReplace();
            if (slot === C.MAX_MON_MOVES) {
              t.data[6] = MoveState.MVSTATE_ASK_CANCEL;
            } else {
              const move = GetMonData(mon, slot + C.MON_DATA_MOVE1);
              if (IsHMMove2(move)) {
                BufferStringBattle(C.STRINGID_HMMOVESCANTBEFORGOTTEN);
                BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
                t.data[6] = MoveState.MVSTATE_RETRY_AFTER_HM;
              } else {
                PREPARE_MOVE_BUFFER(gBattleTextBuff2, move);
                RemoveMonPPBonus(mon, slot);
                SetMonMoveSlot(mon, sMoveToLearn, slot);
                t.data[6]++;
              }
            }
          }
          break;

        case MoveState.MVSTATE_FORGET_MSG_1:
          BufferStringBattle(C.STRINGID_123POOF);
          BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
          t.data[6]++;
          break;

        case MoveState.MVSTATE_FORGET_MSG_2:
          if (!IsTextPrinterActive(0) && !sound.isSEPlaying()) {
            BufferStringBattle(C.STRINGID_PKMNFORGOTMOVE);
            BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
            t.data[6]++;
          }
          break;

        case MoveState.MVSTATE_LEARNED_MOVE:
          if (!IsTextPrinterActive(0) && !sound.isSEPlaying()) {
            BufferStringBattle(C.STRINGID_ANDELLIPSIS);
            BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
            t.data[0] = EvoState.EVOSTATE_LEARNED_MOVE;
          }
          break;

        case MoveState.MVSTATE_ASK_CANCEL:
          BufferStringBattle(C.STRINGID_STOPLEARNINGMOVE);
          BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
          t.data[7] = MoveState.MVSTATE_CANCEL;
          t.data[8] = MoveState.MVSTATE_INTRO_MSG_1;
          t.data[6] = MoveState.MVSTATE_PRINT_YES_NO;
          break;

        case MoveState.MVSTATE_CANCEL:
          BufferStringBattle(C.STRINGID_DIDNOTLEARNMOVE);
          BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
          t.data[0] = EvoState.EVOSTATE_TRY_LEARN_MOVE;
          break;

        case MoveState.MVSTATE_RETRY_AFTER_HM:
          if (!IsTextPrinterActive(0) && !sound.isSEPlaying()) {
            t.data[6] = MoveState.MVSTATE_SHOW_MOVE_SELECT;
          }
          break;
      }
      break;
  }
}

// ---------------------------------------------------------------- public entry points

/**
 * EvolutionScene: run the full GBA evolution sequence.
 */
export function EvolutionScene(
  mon: Mon | Pokemon,
  postEvoSpecies: number,
  canStopEvo: boolean,
  partyId: number,
  exitCallback?: () => void,
): void {
  gCB2_AfterEvolution = exitCallback ?? gMain.callback2;

  SetHBlankCallback(null);
  SetVBlankCallback(null);
  ppu.vram.fill(0);

  SetGpuReg(REG_OFFSET_MOSAIC, 0);
  SetGpuReg(REG_OFFSET_WIN0H, 0);
  SetGpuReg(REG_OFFSET_WIN0V, 0);
  SetGpuReg(REG_OFFSET_WIN1H, 0);
  SetGpuReg(REG_OFFSET_WIN1V, 0);
  SetGpuReg(REG_OFFSET_WININ, 0);
  SetGpuReg(REG_OFFSET_WINOUT, 0);

  ResetPaletteFade();

  G.gBattle_BG0_X = 0; G.gBattle_BG0_Y = 0;
  G.gBattle_BG1_X = 0; G.gBattle_BG1_Y = 0;
  G.gBattle_BG2_X = 0; G.gBattle_BG2_Y = 0;
  G.gBattle_BG3_X = 256; G.gBattle_BG3_Y = 0;
  G.gBattleTerrain = C.BATTLE_TERRAIN_PLAIN;

  InitBattleBgsVideo();
  LoadBattleTextboxAndBackground();
  ResetSpriteData();
  ScanlineEffect_Stop();
  ResetTasks();
  FreeAllSpritePalettes();
  FreeSpriteTilesByTag(TAG_PRE_EVO);
  FreeSpriteTilesByTag(TAG_POST_EVO);
  FreeSpriteTilesByTag(TAG_SPARKLES);

  stringVars.var1 = Uint8Array.from(mon.nickname);
  stringVars.var2 = speciesName(postEvoSpecies);

  const currSpecies = mon.species;

  // preEvo sprite
  const preEvoPic = new Uint8Array(2048);
  LoadSpecialPokePic(true, preEvoPic, currSpecies, mon.personality, true);
  LoadSpriteSheet({ data: preEvoPic, size: 2048, tag: TAG_PRE_EVO });
  const pokePal1 = GetMonSpritePalFromSpeciesAndPersonality(currSpecies, mon.otId, mon.personality);
  LoadPalette(pokePal1, OBJ_PLTT_ID(1), PLTT_SIZE_4BPP);

  const preTemplate: SpriteTemplate = {
    tileTag: TAG_PRE_EVO,
    paletteTag: TAG_NONE,
    oam: oamData({
      affineMode: ST_OAM_AFFINE_OFF,
      objMode: 0,
      mosaic: 0,
      bpp: ST_OAM_4BPP,
      shape: 0,
      size: 3, // 64x64
      priority: 0,
      paletteNum: 1,
    }),
    anims: gDummySpriteAnimTable,
    images: null,
    affineAnims: gDummySpriteAffineAnimTable,
    callback: SpriteCallbackDummy,
  };
  const preSpriteId = CreateSprite(preTemplate, 120, 64, 30);
  gSprites[preSpriteId].invisible = true;

  // postEvo sprite
  const postEvoPic = new Uint8Array(2048);
  LoadSpecialPokePic(true, postEvoPic, postEvoSpecies, mon.personality, true);
  LoadSpriteSheet({ data: postEvoPic, size: 2048, tag: TAG_POST_EVO });
  const pokePal2 = GetMonSpritePalFromSpeciesAndPersonality(postEvoSpecies, mon.otId, mon.personality);
  LoadPalette(pokePal2, OBJ_PLTT_ID(2), PLTT_SIZE_4BPP);

  const postTemplate: SpriteTemplate = {
    tileTag: TAG_POST_EVO,
    paletteTag: TAG_NONE,
    oam: oamData({
      affineMode: ST_OAM_AFFINE_OFF,
      objMode: 0,
      mosaic: 0,
      bpp: ST_OAM_4BPP,
      shape: 0,
      size: 3, // 64x64
      priority: 0,
      paletteNum: 2,
    }),
    anims: gDummySpriteAnimTable,
    images: null,
    affineAnims: gDummySpriteAffineAnimTable,
    callback: SpriteCallbackDummy,
  };
  const postSpriteId = CreateSprite(postTemplate, 120, 64, 30);
  gSprites[postSpriteId].invisible = true;

  LoadEvoSparkleSpriteAndPal();

  const evoTaskId = CreateTask(Task_EvolutionScene, 0);
  const et = gTasks[evoTaskId];
  et.data[0] = EvoState.EVOSTATE_FADE_IN;
  et.data[1] = currSpecies;
  et.data[2] = postEvoSpecies;
  et.data[3] = canStopEvo ? TASK_BIT_CAN_STOP : 0;
  et.data[4] = 1; // tLearnsFirstMove = true
  et.data[9] = 0; // tEvoWasStopped = false
  et.data[10] = partyId;

  sEvoStructPtr = {
    preEvoSpriteId: preSpriteId,
    postEvoSpriteId: postSpriteId,
    evoTaskId,
    delayTimer: 0,
    savedPalette: new Uint16Array(48),
  };
  sEvoStructPtr.savedPalette.set(gPlttBufferUnfaded.subarray(BG_PLTT_ID(2), BG_PLTT_ID(2) + 48));

  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_ON | DISPCNT_BG_ALL_ON | DISPCNT_OBJ_1D_MAP);
  SetVBlankCallback(VBlankCB_EvolutionScene);
  sound.stopBGM();
  SetMainCallback2(CB2_EvolutionSceneUpdate);
}

/**
 * BeginEvolutionScene: fade to black, then launch EvolutionScene.
 * Handles both field and menu execution.
 */
export function BeginEvolutionScene(
  mon: Mon | Pokemon,
  postEvoSpecies: number,
  canStopEvo: boolean,
  partyId: number,
  exitCallback?: () => void,
): void {
  const start = (done: () => void) => {
    void preloadEvolutionScene().then(() => {
      sPendingEvolution = { mon, postEvoSpecies: postEvoSpecies & 0xffff, canStopEvo, partyId: partyId & 0xff, done };
      const taskId = CreateTask(Task_BeginEvolutionScene, 0);
      gTasks[taskId].data[0] = 0;
      gTasks[taskId].data[2] = postEvoSpecies & 0xffff;
      gTasks[taskId].data[3] = canStopEvo ? 1 : 0;
      gTasks[taskId].data[10] = partyId & 0xff;
      SetMainCallback2(CB2_BeginEvolutionScene);
    });
  };

  // If outside of a HW scene (e.g. overworld field), enter fieldMenu
  const frGame = typeof window !== "undefined" ? (window as unknown as { frGame?: Game }).frGame : undefined;
  if (frGame && !frGame.scene) {
    fieldMenu(frGame, (close) => {
      start(() => {
        close();
        exitCallback?.();
      });
    });
  } else {
    start(exitCallback ?? (() => {}));
  }
}

type PendingEvolution = {
  mon: Mon | Pokemon;
  postEvoSpecies: number;
  canStopEvo: boolean;
  partyId: number;
  done: () => void;
};

let sPendingEvolution: PendingEvolution | null = null;

/** CB2_BeginEvolutionScene (evolution_scene.c). */
function CB2_BeginEvolutionScene(): void {
  UpdatePaletteFade();
  RunTasks();
}

/** Task_BeginEvolutionScene (evolution_scene.c), including its two task states. */
function Task_BeginEvolutionScene(taskId: number): void {
  const task = gTasks[taskId];
  if (task.data[0] === 0) {
    BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0x10, RGB_BLACK);
    task.data[0]++;
    return;
  }
  if (task.data[0] === 1 && !gPaletteFade.active) {
    const pending = sPendingEvolution;
    DestroyTask(taskId);
    sPendingEvolution = null;
    if (pending) EvolutionScene(pending.mon, task.data[2], !!task.data[3], task.data[10], pending.done);
  }
}

/**
 * Preload all assets required by EvolutionScene.
 */
export async function preloadEvolutionScene(): Promise<void> {
  await Promise.all([
    loadCData("evolution_scene"),
    loadCData("evolution_graphics"),
    loadCData("battle_bg"),
    loadCData("battle_message"),
    loadCData("trig"),
    preloadIncbin([
      "sEvolutionSparklesPalData",
      "sEvolutionSparklesTileData",
      "sBgAnim_Pal",
      "evolution_scene.c:sBlackPalette",
      "sMovingBackgroundMap1",
      "sMovingBackgroundMap2",
      "sMovingBackgroundTiles",
      "gBattleInterface_Textbox_Gfx",
      "gBattleInterface_Textbox_Tilemap",
      "gBattleInterface_Textbox_Pal",
      "sUserFrame_Type1_Gfx",
      "sUserFrame_Type1_Pal",
    ]),
  ]);
}
