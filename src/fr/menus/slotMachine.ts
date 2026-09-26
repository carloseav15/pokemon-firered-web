// slot_machine.c: Celadon Game Corner slots machine faithfully ported 1:1.
// Backgrounds, windows, reel sprites with affine deformation and scanline blend,
// Clefairy mascot animations, coin display digits, help window, line lights
// and winning line flashing all follow the decomp.

import { FONT_NORMAL, FONT_SMALL, stringWidth as GetStringWidth } from "../gba/font";
import { A_BUTTON, B_BUTTON, DPAD_ANY, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, JOY_HELD, JOY_NEW, R_BUTTON, START_BUTTON } from "../gba/input";
import { tasks, type TaskFunc } from "../gba/tasks";
import {
  ChangeBgX, CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer, FillBgTilemapBufferRect_Palette0,
  GetBgTilemapBuffer, HideBg, InitBgsFromTemplates, LoadBgTilemap, LoadBgTiles,
  ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate,
} from "../hw/bg";
import {
  ClearGpuRegBits, CopyBufferedValuesToGpuRegs, InitGpuRegManager, SetGpuReg, SetGpuRegBits,
} from "../hw/gpu";
import {
  CreateYesNoMenu, DestroyYesNoMenu, GetTextWindowPalette, LoadStdWindowGfx, LoadStdWindowGfxOnBg,
  LoadUserWindowGfx, LoadUserWindowGfx2, Menu_MoveCursorNoWrapAround, Menu_ProcessInputNoWrapClearOnChoose,
} from "../hw/menu";
import { DrawTextBorderOuter } from "../hw/menuHelpers";
import {
  BeginNormalPaletteFade, BlendPalettes, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded,
  LoadPalette, ResetPaletteFade, TransferPlttBuffer, UpdatePaletteFade,
} from "../hw/palette";
import {
  BLDCNT_EFFECT_DARKEN, BLDCNT_TGT1_BD, BLDCNT_TGT1_BG3, BLDCNT_TGT1_OBJ, DISPCNT_MODE_0,
  DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, DISPCNT_WIN0_ON, DISPLAY_WIDTH, OAM_SIZE,
  ppu, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H,
  REG_OFFSET_WIN1H, REG_OFFSET_WININ, REG_OFFSET_WINOUT, VRAM_SIZE, WIN_RANGE,
  WININ_WIN0_BG0, WININ_WIN0_BG1, WININ_WIN0_BG2, WININ_WIN0_BG3, WININ_WIN0_CLR,
  WININ_WIN0_OBJ, WINOUT_WIN01_BG0, WINOUT_WIN01_BG2, WINOUT_WIN01_BG3, WINOUT_WIN01_CLR,
  WINOUT_WIN01_OBJ,
} from "../hw/ppu";
import {
  gMain, type MainCallback, SetHBlankCallback, SetMainCallback1, SetMainCallback2, SetVBlankCallback,
} from "../hw/runtime";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, FreeAllSpritePalettes, gSprites,
  IndexOfSpritePaletteTag, LoadCompressedSpriteSheet, LoadOam, LoadSpritePalette,
  ProcessSpriteCopyRequests, ResetSpriteData, StartSpriteAnim, type Sprite,
} from "../hw/sprite";
import { templateFrom } from "../hw/cdataSprite";
import { cdata, incbin, incbin16, loadCData, preloadPacks } from "../hw/assets";
import { gSineTable } from "../hw/trig";
import { AddTextPrinterParameterized3, AddTextPrinterParameterized5 } from "../hw/text";
import { TEXT_SKIP_DRAW } from "../gba/textPrinter";
import {
  ClearWindowTilemap, CopyWindowToVram, COPYWIN_FULL, FillWindowPixelBuffer, FreeAllWindowBuffers,
  InitWindows, PutWindowTilemap, type WindowTemplate,
} from "../hw/window";
import { sound } from "../audio/sound";
import { random } from "../random";
import { incrementGameStat, save } from "../save";
import { GetCoins as getCoins, removeCoins } from "../pokemon/items";
import { rom } from "../rom";
import * as C from "../generated/constants";

const NUM_REELS = 3;
const REEL_LENGTH = 21;
const REEL_LOAD_LENGTH = 5;
const NUM_MATCH_LINES = 5;
const NUM_BUTTON_TILES = 4;
const NUM_DIGIT_SPRITES = 4;

const PALSLOT_LINE_NORMAL = 4;
const PALSLOT_LINE_BET = 5;
const PALSLOT_LINE_MATCH = 6;

const GFXTAG_REEL_ICONS = 0;
const GFXTAG_CLEFAIRY = 1;
const GFXTAG_DIGITS = 2;

const PALTAG_REEL_ICONS_0 = 0;
const PALTAG_REEL_ICONS_1 = 1;
const PALTAG_REEL_ICONS_2 = 2;
const PALTAG_REEL_ICONS_3 = 3;
const PALTAG_REEL_ICONS_4 = 4;
const PALTAG_CLEFAIRY = 5;
const PALTAG_DIGITS = 6;

export const ICON_7 = 0;
export const ICON_ROCKET = 1;
export const ICON_PIKACHU = 2;
export const ICON_PSYDUCK = 3;
export const ICON_CHERRIES = 4;
export const ICON_MAGNEMITE = 5;
export const ICON_SHELLDER = 6;

export const PAYOUT_NONE = 0;
export const PAYOUT_CHERRIES2 = 1;
export const PAYOUT_CHERRIES3 = 2;
export const PAYOUT_MAGSHELL = 3;
export const PAYOUT_PIKAPSY = 4;
export const PAYOUT_ROCKET = 5;
export const PAYOUT_7 = 6;
const NUM_PAYOUT_TYPES = 7;

const ROWATTR_COL1POS = 0;
const ROWATTR_COL2POS = 1;
const ROWATTR_COL3POS = 2;
const ROWATTR_MINBET = 3;

const SLOTTASK_GFX_INIT = 0;
const SLOTTASK_FADEOUT_EXIT = 1;
const SLOTTASK_UPDATE_LINE_LIGHTS = 2;
const SLOTTASK_CLEFAIRY_BOUNCE = 3;
const SLOTTASK_ANIM_WIN = 4;
const SLOTTASK_END_ANIM_WIN = 5;
const SLOTTASK_ANIM_LOSE = 6;
const SLOTTASK_ANIM_BETTING = 7;
const SLOTTASK_SHOW_AMOUNTS = 8;
const SLOTTASK_MSG_NO_COINS = 9;
const SLOTTASK_ASK_QUIT = 10;
const SLOTTASK_DESTROY_YESNO = 11;
const SLOTTASK_PRESS_BUTTON = 12;
const SLOTTASK_RELEASE_BUTTONS = 13;
const SLOTTASK_SHOWHELP = 14;
const SLOTTASK_HIDEHELP = 15;

const BG_PLTT_ID = (n: number) => n * 16;
const RGB_BLACK = 0;
const RGB = (r: number, g: number, b: number) => (r & 0x1f) | ((g & 0x1f) << 5) | ((b & 0x1f) << 10);

interface SlotMachineState {
  savedCallback: MainCallback;
  machineIdx: number;
  currentReel: number;
  machineBias: number;
  slotRewardClass: number;
  biasCooldown: number;
  bet: number;
  taskId: number;
  spinReelsTaskId: number;
  reelIsSpinning: boolean[];
  reelPositions: number[];
  reelSubpixel: number[];
  destReelPos: number[];
  reelStopOrder: number[];
  reel2BiasInPlay: number;
  winFlags: boolean[];
  payout: number;
}

interface SlotMachineGfxManager {
  reelIconSprites: (Sprite | null)[][];
  creditDigitSprites: (Sprite | null)[];
  payoutDigitSprites: (Sprite | null)[];
  clefairySprites: (Sprite | null)[];
}

interface SlotMachineSubTask {
  funcno: number;
  state: number;
  active: boolean;
}

interface SlotMachineSetupTaskData {
  tasks: SlotMachineSubTask[];
  reelButtonToPress: number;
  bg1X: number;
  yesNoMenuActive: boolean;
  buttonPressedTiles: number[][];
  buttonReleasedTiles: number[][];
  bg0TilemapBuffer: Uint16Array;
  bg1TilemapBuffer: Uint16Array;
  bg2TilemapBuffer: Uint16Array;
  bg3TilemapBuffer: Uint16Array;
}

let sSlotMachineState: SlotMachineState | null = null;
let sSlotMachineGfxManager: SlotMachineGfxManager | null = null;
let sSlotMachineSetupTaskData: SlotMachineSetupTaskData | null = null;

// C-data tables loaded dynamically
let sSecondReelBiasCheckIndices: number[][];
let sThirdReelBiasCheckIndices: number[][];
let sRowAttributes: number[][];
let sReelBiasChances: number[][];
let sReelIconAnimByReelAndPos: number[][];
let sPayoutTable: number[];
let sReelIconPaletteTags: number[];
let sReelIconAffineParams: number[];
let sReelIconBldY: number[];
let sLineTiles: number[][];
let sWinningLineFlashPalIdxs: number[];
let sReelButtonMapTileIdxs: number[][];

function initCDataTables(): void {
  sSecondReelBiasCheckIndices = cdata<number[][]>("slot_machine", "sSecondReelBiasCheckIndices");
  sThirdReelBiasCheckIndices = cdata<number[][]>("slot_machine", "sThirdReelBiasCheckIndices");
  sRowAttributes = cdata<number[][]>("slot_machine", "sRowAttributes");
  sReelBiasChances = cdata<number[][]>("slot_machine", "sReelBiasChances");
  sReelIconAnimByReelAndPos = cdata<number[][]>("slot_machine", "sReelIconAnimByReelAndPos");
  sPayoutTable = cdata<number[]>("slot_machine", "sPayoutTable");
  sReelIconPaletteTags = cdata<number[]>("slot_machine", "sReelIconPaletteTags");
  sReelIconAffineParams = cdata<number[]>("slot_machine", "sReelIconAffineParams");
  sReelIconBldY = cdata<number[]>("slot_machine", "sReelIconBldY");
  sLineTiles = [
    cdata<number[]>("slot_machine", "sLineTiles_TLBR"),
    cdata<number[]>("slot_machine", "sLineTiles_TopRow"),
    cdata<number[]>("slot_machine", "sLineTiles_MiddleRow"),
    cdata<number[]>("slot_machine", "sLineTiles_BottomRow"),
    cdata<number[]>("slot_machine", "sLineTiles_BLTR"),
  ];
  sWinningLineFlashPalIdxs = cdata<number[]>("slot_machine", "sWinningLineFlashPalIdxs");
  sReelButtonMapTileIdxs = cdata<number[][]>("slot_machine", "sReelButtonMapTileIdxs");
}

function Random(): number {
  return random();
}

function GetCoins(): number {
  return getCoins();
}

function SetCoins(coins: number): void {
  save.coins = Math.max(0, Math.min(9999, coins));
}

function AddCoins(coins: number): void {
  save.coins = Math.min(9999, save.coins + coins);
}

function RemoveCoins(coins: number): boolean {
  return removeCoins(coins);
}

function IncrementGameStat(stat: number): void {
  incrementGameStat(stat);
}

function PlaySE(songId: number): void {
  sound.playSE(songId);
}

function PlayFanfare(songId: number): void {
  sound.playFanfare(songId);
}

function IsFanfareTaskInactive(): boolean {
  return sound.isFanfareTaskInactive();
}

function ResetTasks(): void {
  tasks.reset();
}

function CreateTask(func: TaskFunc, priority: number): number {
  return tasks.create(func, priority);
}

function DestroyTask(taskId: number): void {
  tasks.destroy(taskId);
}

function FuncIsActiveTask(func: TaskFunc): boolean {
  return tasks.tasks.some((t) => t.isActive && t.func === func);
}

function FindTaskIdByFunc(func: TaskFunc): number {
  return tasks.findByFunc(func);
}

function SetQLPlayedTheSlots(): void {
  // Quest Log is out of scope per user rules & PORTING-STATUS.md
}

export function PlaySlotMachine(machineIdx: number, savedCallback: MainCallback): void {
  ResetTasks();
  initCDataTables();
  if (machineIdx >= sReelBiasChances.length) machineIdx = 0;
  sSlotMachineState = {
    savedCallback,
    machineIdx,
    currentReel: 0,
    machineBias: 0,
    slotRewardClass: 0,
    biasCooldown: 0,
    bet: 0,
    taskId: 0,
    spinReelsTaskId: 0,
    reelIsSpinning: [false, false, false],
    reelPositions: [0, 0, 0],
    reelSubpixel: [0, 0, 0],
    destReelPos: [REEL_LENGTH, REEL_LENGTH, REEL_LENGTH],
    reelStopOrder: [0, 0, 0],
    reel2BiasInPlay: 0,
    winFlags: [false, false, false, false, false],
    payout: 0,
  };
  InitSlotMachineState(sSlotMachineState);
  SetMainCallback2(CB2_InitSlotMachine);
}

function InitSlotMachineState(ptr: SlotMachineState): void {
  ptr.currentReel = 0;
  ptr.bet = 0;
  ptr.payout = 0;
  for (let i = 0; i < NUM_REELS; i++) {
    sSlotMachineState!.reelIsSpinning[i] = false;
    sSlotMachineState!.reelPositions[i] = 0;
    sSlotMachineState!.reelSubpixel[i] = 0;
    sSlotMachineState!.destReelPos[i] = REEL_LENGTH;
  }
}

function CB2_InitSlotMachine(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();

  switch (gMain.state) {
    case 0:
      if (CreateSlotMachine()) {
        SetMainCallback2(sSlotMachineState!.savedCallback);
        CleanSupSlotMachineState();
      } else {
        SetSlotMachineSetupTask(SLOTTASK_GFX_INIT, 0);
        gMain.state++;
      }
      break;
    case 1:
      if (!IsSlotMachineSetupTaskActive(0)) {
        sSlotMachineState!.taskId = CreateTask(MainTask_SlotsGameLoop, 0);
        sSlotMachineState!.spinReelsTaskId = CreateTask(Task_SpinReels, 1);
        SetMainCallback2(CB2_RunSlotMachine);
      }
      break;
  }
}

function CleanSupSlotMachineState(): void {
  DestroySlotMachine();
  sSlotMachineState = null;
}

function CB2_RunSlotMachine(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

function MainTask_SlotsGameLoop(taskId: number): void {
  const data = tasks.tasks[taskId]?.data;
  if (!data || !sSlotMachineState) return;

  switch (data[0]) {
    case 0: // Betting Phase
      if (GetCoins() === 0) {
        SetMainTask(MainTask_NoCoinsGameOver);
      } else if (JOY_NEW(DPAD_DOWN)) {
        sSlotMachineState.bet++;
        RemoveCoins(1);
        PlaySE(C.SE_RS_SHOP);
        SetSlotMachineSetupTask(SLOTTASK_SHOW_AMOUNTS, 0);
        SetSlotMachineSetupTask(SLOTTASK_UPDATE_LINE_LIGHTS, 1);
        data[0] = 1;
      } else if (JOY_NEW(R_BUTTON)) {
        const toAdd = 3 - sSlotMachineState.bet;
        if (GetCoins() >= toAdd) {
          sSlotMachineState.bet = 3;
          RemoveCoins(toAdd);
        } else {
          sSlotMachineState.bet += GetCoins();
          SetCoins(0);
        }
        PlaySE(C.SE_RS_SHOP);
        SetSlotMachineSetupTask(SLOTTASK_SHOW_AMOUNTS, 0);
        SetSlotMachineSetupTask(SLOTTASK_UPDATE_LINE_LIGHTS, 1);
        data[0] = 1;
      } else if (JOY_NEW(A_BUTTON) && sSlotMachineState.bet !== 0) {
        data[0] = 2;
      } else if (JOY_NEW(B_BUTTON)) {
        SetMainTask(MainTask_ConfirmExitGame);
      } else if (JOY_NEW(DPAD_RIGHT)) {
        SetMainTask(MainTask_ShowHelp);
      }
      break;
    case 1:
      if (!IsSlotMachineSetupTaskActive(0) && !IsSlotMachineSetupTaskActive(1)) {
        if (sSlotMachineState.bet === 3 || GetCoins() === 0) data[0] = 2;
        else data[0] = 0;
      }
      break;
    case 2:
      SetQLPlayedTheSlots();
      CalcSlotBias();
      StartReels();
      sSlotMachineState.currentReel = 0;
      SetSlotMachineSetupTask(SLOTTASK_CLEFAIRY_BOUNCE, 0);
      data[0] = 3;
      break;
    case 3:
      if (!IsSlotMachineSetupTaskActive(0)) {
        if (JOY_NEW(A_BUTTON)) {
          PlaySE(C.SE_CONTEST_PLACE);
          StopCurrentReel(sSlotMachineState.currentReel, sSlotMachineState.currentReel);
          PressReelButton(sSlotMachineState.currentReel, 0);
          data[0] = 4;
        }
      }
      break;
    case 4:
      if (!IsReelSpinning(sSlotMachineState.currentReel) && !IsSlotMachineSetupTaskActive(0)) {
        sSlotMachineState.currentReel++;
        if (sSlotMachineState.currentReel >= NUM_REELS) {
          sSlotMachineState.slotRewardClass = CalcPayout();
          sSlotMachineState.bet = 0;
          sSlotMachineState.currentReel = 0;
          if (sSlotMachineState.slotRewardClass === PAYOUT_NONE) {
            SetMainTask(MainTask_DarnNoPayout);
          } else {
            if (sSlotMachineState.slotRewardClass === PAYOUT_7) {
              IncrementGameStat(C.GAME_STAT_SLOT_JACKPOTS);
            }
            ResetMachineBias();
            SetMainTask(MainTask_WinHandlePayout);
          }
        } else {
          data[0] = 3;
        }
      }
      break;
  }
}

function MainTask_NoCoinsGameOver(taskId: number): void {
  const data = tasks.tasks[taskId]?.data;
  if (!data) return;

  switch (data[0]) {
    case 0:
      SetSlotMachineSetupTask(SLOTTASK_MSG_NO_COINS, 0);
      data[0]++;
      break;
    case 1:
      if (!IsSlotMachineSetupTaskActive(0)) data[0]++;
      break;
    case 2:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) SetMainTask(MainTask_ExitSlots);
      break;
  }
}

function MainTask_ShowHelp(taskId: number): void {
  const data = tasks.tasks[taskId]?.data;
  if (!data) return;

  switch (data[0]) {
    case 0:
      SetSlotMachineSetupTask(SLOTTASK_SHOWHELP, 0);
      data[0]++;
      break;
    case 1:
      if (!IsSlotMachineSetupTaskActive(0)) data[0]++;
      break;
    case 2:
      if (JOY_NEW(DPAD_LEFT)) {
        SetSlotMachineSetupTask(SLOTTASK_HIDEHELP, 0);
        data[0]++;
      }
      break;
    case 3:
      if (!IsSlotMachineSetupTaskActive(0)) SetMainTask(MainTask_SlotsGameLoop);
      break;
  }
}

function MainTask_ConfirmExitGame(taskId: number): void {
  const data = tasks.tasks[taskId]?.data;
  if (!data || !sSlotMachineState) return;

  switch (data[0]) {
    case 0:
      SetSlotMachineSetupTask(SLOTTASK_ASK_QUIT, 0);
      data[0]++;
      break;
    case 1:
      if (!IsSlotMachineSetupTaskActive(0)) data[0]++;
      break;
    case 2:
      switch (Menu_ProcessInputNoWrapClearOnChoose()) {
        case 0: // YES
          AddCoins(sSlotMachineState.bet);
          SetSlotMachineSetupTask(SLOTTASK_SHOW_AMOUNTS, 0);
          data[0] = 3;
          break;
        case 1: // NO
        case -1: // B
          SetSlotMachineSetupTask(SLOTTASK_DESTROY_YESNO, 0);
          data[0] = 4;
          break;
      }
      break;
    case 3:
      if (!IsSlotMachineSetupTaskActive(0)) SetMainTask(MainTask_ExitSlots);
      break;
    case 4:
      if (!IsSlotMachineSetupTaskActive(0)) SetMainTask(MainTask_SlotsGameLoop);
      break;
  }
}

function MainTask_DarnNoPayout(taskId: number): void {
  const data = tasks.tasks[taskId]?.data;
  if (!data) return;

  switch (data[0]) {
    case 0:
      SetSlotMachineSetupTask(SLOTTASK_ANIM_LOSE, 0);
      data[1] = 0;
      data[0]++;
      break;
    case 1:
      data[1]++;
      if (data[1] > 60) {
        SetSlotMachineSetupTask(SLOTTASK_ANIM_BETTING, 0);
        SetSlotMachineSetupTask(SLOTTASK_UPDATE_LINE_LIGHTS, 1);
        SetSlotMachineSetupTask(SLOTTASK_RELEASE_BUTTONS, 2);
        data[0]++;
      }
      break;
    case 2:
      if (!IsSlotMachineSetupTaskActive(0) && !IsSlotMachineSetupTaskActive(1) && !IsSlotMachineSetupTaskActive(2)) {
        SetMainTask(MainTask_SlotsGameLoop);
      }
      break;
  }
}

function MainTask_WinHandlePayout(taskId: number): void {
  const data = tasks.tasks[taskId]?.data;
  if (!data || !sSlotMachineState) return;

  switch (data[0]) {
    case 0:
      if (sSlotMachineState.slotRewardClass === PAYOUT_ROCKET || sSlotMachineState.slotRewardClass === PAYOUT_7) {
        PlayFanfare(C.MUS_SLOTS_JACKPOT);
      } else {
        PlayFanfare(C.MUS_SLOTS_WIN);
      }
      SetSlotMachineSetupTask(SLOTTASK_SHOW_AMOUNTS, 0);
      SetSlotMachineSetupTask(SLOTTASK_ANIM_WIN, 1);
      data[1] = 8;
      data[0]++;
      break;
    case 1:
      data[1]++;
      if (data[1] > 120) {
        data[1] = 8;
        if (JOY_HELD(A_BUTTON)) data[1] = 2;
        data[0]++;
      }
      break;
    case 2:
      if (!IsSlotMachineSetupTaskActive(0)) {
        if (IsFanfareTaskInactive() && JOY_NEW(START_BUTTON)) {
          AddCoins(sSlotMachineState.payout);
          sSlotMachineState.payout = 0;
        } else {
          data[1]--;
          if (data[1] === 0) {
            if (IsFanfareTaskInactive()) PlaySE(C.SE_PIN);
            if (sSlotMachineState.payout !== 0) {
              AddCoins(1);
              sSlotMachineState.payout--;
            }
            data[1] = 8;
            if (JOY_HELD(A_BUTTON)) data[1] = 2;
          }
        }
        SetSlotMachineSetupTask(SLOTTASK_SHOW_AMOUNTS, 0);
        if (sSlotMachineState.payout === 0) data[0]++;
      }
      break;
    case 3:
      if (IsFanfareTaskInactive() && !IsSlotMachineSetupTaskActive(0)) {
        SetSlotMachineSetupTask(SLOTTASK_END_ANIM_WIN, 0);
        data[0]++;
      }
      break;
    case 4:
      if (!IsSlotMachineSetupTaskActive(0)) {
        SetSlotMachineSetupTask(SLOTTASK_UPDATE_LINE_LIGHTS, 0);
        SetSlotMachineSetupTask(SLOTTASK_RELEASE_BUTTONS, 1);
        data[0]++;
      }
      break;
    case 5:
      if (!IsSlotMachineSetupTaskActive(0) && !IsSlotMachineSetupTaskActive(1)) {
        SetMainTask(MainTask_SlotsGameLoop);
      }
      break;
  }
}

function MainTask_ExitSlots(taskId: number): void {
  const data = tasks.tasks[taskId]?.data;
  if (!data || !sSlotMachineState) return;

  switch (data[0]) {
    case 0:
      SetSlotMachineSetupTask(SLOTTASK_FADEOUT_EXIT, 0);
      data[0]++;
      break;
    case 1:
      if (!IsSlotMachineSetupTaskActive(0)) {
        const savedCallback = sSlotMachineState.savedCallback;
        CleanSupSlotMachineState();
        SetMainCallback2(savedCallback);
      }
      break;
  }
}

function SetMainTask(taskFunc: TaskFunc): void {
  if (!sSlotMachineState) return;
  const task = tasks.tasks[sSlotMachineState.taskId];
  if (task) {
    task.func = taskFunc;
    task.data[0] = 0;
  }
}

function Task_SpinReels(_taskId: number): void {
  if (!sSlotMachineState) return;

  for (let i = 0; i < NUM_REELS; i++) {
    if (sSlotMachineState.reelIsSpinning[i] || sSlotMachineState.reelSubpixel[i] !== 0) {
      if (sSlotMachineState.reelSubpixel[i] !== 0 || sSlotMachineState.reelPositions[i] !== sSlotMachineState.destReelPos[i]) {
        sSlotMachineState.reelSubpixel[i]++;
        if (sSlotMachineState.reelSubpixel[i] > 2) {
          sSlotMachineState.reelSubpixel[i] = 0;
          sSlotMachineState.reelPositions[i]--;
          if (sSlotMachineState.reelPositions[i] < 0) {
            sSlotMachineState.reelPositions[i] = REEL_LENGTH - 1;
          }
        }
        if (sSlotMachineState.reelPositions[i] !== sSlotMachineState.destReelPos[i]) continue;
      }
      sSlotMachineState.destReelPos[i] = REEL_LENGTH;
      sSlotMachineState.reelIsSpinning[i] = false;
    }
  }
  UpdateReelIconSprites(sSlotMachineState.reelPositions, sSlotMachineState.reelSubpixel);
}

function StartReels(): void {
  if (!sSlotMachineState) return;
  for (let i = 0; i < NUM_REELS; i++) sSlotMachineState.reelIsSpinning[i] = true;
}

function StopCurrentReel(whichReel: number, whichReel2: number): void {
  switch (whichReel2) {
    case 0:
      StopReel1(whichReel);
      break;
    case 1:
      StopReel2(whichReel);
      break;
    case 2:
      StopReel3(whichReel);
      break;
  }
}

function IsReelSpinning(whichReel: number): boolean {
  return !!sSlotMachineState?.reelIsSpinning[whichReel];
}

function GetNextReelPosition(whichReel: number): number {
  if (!sSlotMachineState) return 0;
  let position = sSlotMachineState.reelPositions[whichReel]!;
  if (sSlotMachineState.reelSubpixel[whichReel] !== 0) {
    position--;
    if (position < 0) position = REEL_LENGTH - 1;
  }
  return position;
}

function StopReel1(whichReel: number): void {
  if (!sSlotMachineState) return;
  let destPos: number;
  const posToSample: number[] = [];
  const nextPos = GetNextReelPosition(whichReel);

  if (sSlotMachineState.machineBias === 0 && whichReel === 0) {
    for (let i = 0; i < 5; i++) {
      let j: number;
      for (j = 0, destPos = nextPos - i + 1; j < 3; j++, destPos++) {
        if (destPos >= REEL_LENGTH) destPos = 0;
        if (TestReelIconAttribute(1, sReelIconAnimByReelAndPos[whichReel]![destPos]!)) break;
      }
      if (j === 3) posToSample.push(i);
    }
  } else if (sSlotMachineState.machineBias !== 1 || whichReel === 0) {
    for (let i = 0, dPos = nextPos + 1; i < 3; i++, dPos++) {
      if (dPos >= REEL_LENGTH) dPos = 0;
      if (TestReelIconAttribute(sSlotMachineState.machineBias, sReelIconAnimByReelAndPos[whichReel]![dPos]!)) {
        posToSample.push(0);
        break;
      }
    }
    for (let i = 0, dPos = nextPos; i < 4; i++, dPos--) {
      if (dPos < 0) dPos = REEL_LENGTH - 1;
      if (TestReelIconAttribute(sSlotMachineState.machineBias, sReelIconAnimByReelAndPos[whichReel]![dPos]!)) {
        posToSample.push(i + 1);
      }
    }
  }

  if (posToSample.length === 0) {
    destPos = Random() % 5;
  } else {
    destPos = posToSample[Random() % posToSample.length]!;
  }
  destPos = nextPos - destPos;
  if (destPos < 0) destPos += REEL_LENGTH;
  sSlotMachineState.reelStopOrder[0] = whichReel;
  sSlotMachineState.destReelPos[whichReel] = destPos;
}

function StopReel2(whichReel: number): void {
  if (!sSlotMachineState) return;
  const firstStoppedReelId = sSlotMachineState.reelStopOrder[0]!;
  let firstStoppedReelPos = sSlotMachineState.reelPositions[firstStoppedReelId]! + 1;
  if (firstStoppedReelPos >= REEL_LENGTH) firstStoppedReelPos = 0;
  const nextPos = GetNextReelPosition(whichReel);
  let pos = nextPos + 1;
  if (pos >= REEL_LENGTH) pos = 0;
  const possiblePositions: number[] = [];

  for (let i = 0; i < 5; i++) {
    if (TwoReelBiasCheck(firstStoppedReelId, firstStoppedReelPos, whichReel, pos, sSlotMachineState.machineBias)) {
      possiblePositions.push(i);
    }
    pos--;
    if (pos < 0) pos = REEL_LENGTH - 1;
  }

  if (possiblePositions.length === 0) {
    sSlotMachineState.reel2BiasInPlay = 0;
    if (sSlotMachineState.machineBias === PAYOUT_ROCKET || sSlotMachineState.machineBias === PAYOUT_7) pos = 4;
    else pos = 0;
  } else {
    sSlotMachineState.reel2BiasInPlay = 1;
    pos = possiblePositions[0]!;
  }
  pos = nextPos - pos;
  if (pos < 0) pos += REEL_LENGTH;
  sSlotMachineState.reelStopOrder[1] = whichReel;
  sSlotMachineState.destReelPos[whichReel] = pos;
}

function StopReel3(whichReel: number): void {
  if (!sSlotMachineState) return;
  const nextPos = GetNextReelPosition(whichReel);
  let testPos = nextPos;
  const possiblePositions: number[] = [];

  for (let i = 0; i < 5; i++) {
    if (OneReelBiasCheck(whichReel, testPos, sSlotMachineState.machineBias)) {
      possiblePositions.push(i);
    }
    testPos--;
    if (testPos < 0) testPos = 20;
  }

  let pos: number;
  if (possiblePositions.length === 0) {
    if (sSlotMachineState.machineBias === PAYOUT_ROCKET || sSlotMachineState.machineBias === PAYOUT_7) pos = 4;
    else pos = 0;
  } else {
    pos = possiblePositions[0]!;
  }
  pos = nextPos - pos;
  if (pos < 0) pos += REEL_LENGTH;
  sSlotMachineState.destReelPos[whichReel] = pos;
}

function TwoReelBiasCheck(reel0id: number, reel0pos: number, reel1id: number, reel1pos: number, icon: number): boolean {
  const icons: number[] = new Array(9).fill(7);

  for (let i = 0; i < 3; i++) {
    icons[3 * reel0id + i] = sReelIconAnimByReelAndPos[reel0id]![reel0pos]!;
    icons[3 * reel1id + i] = sReelIconAnimByReelAndPos[reel1id]![reel1pos]!;
    reel0pos++;
    if (reel0pos >= REEL_LENGTH) reel0pos = 0;
    reel1pos++;
    if (reel1pos >= REEL_LENGTH) reel1pos = 0;
  }

  switch (icon) {
    case 0:
      for (let i = 0; i < 3; i++) {
        if (TestReelIconAttribute(1, icons[i]!)) return false;
      }
      for (let i = 0; i < 15; i++) {
        if (icons[sSecondReelBiasCheckIndices[i]![0]!] === icons[sSecondReelBiasCheckIndices[i]![1]!]) return true;
      }
      return false;
    case 1:
      if (reel0id === 0 || reel1id === 0) {
        if (reel0id === 1 || reel1id === 1) {
          for (let i = 0; i < 15; i += 3) {
            if (icons[sSecondReelBiasCheckIndices[i]![0]!] === icons[sSecondReelBiasCheckIndices[i]![1]!]) return false;
          }
        }
        for (let i = 0; i < 3; i++) {
          if (TestReelIconAttribute(icon, icons[i]!)) return true;
        }
        return false;
      } else {
        return true;
      }
    case 2:
      if (reel0id === 2 || reel1id === 2) {
        for (let i = 0; i < 9; i++) {
          if (TestReelIconAttribute(icon, icons[i]!)) return true;
        }
        return false;
      }
      break;
  }
  for (let i = 0; i < 15; i++) {
    if (
      icons[sSecondReelBiasCheckIndices[i]![0]!] === icons[sSecondReelBiasCheckIndices[i]![1]!] &&
      TestReelIconAttribute(icon, icons[sSecondReelBiasCheckIndices[i]![0]!]!)
    ) {
      return true;
    }
  }
  return false;
}

function OneReelBiasCheck(reelId: number, reelPos: number, biasIcon: number): boolean {
  if (!sSlotMachineState) return false;
  const icons: number[] = new Array(9);
  let firstStoppedPos = sSlotMachineState.reelPositions[sSlotMachineState.reelStopOrder[0]!]! + 1;
  let secondStoppedPos = sSlotMachineState.reelPositions[sSlotMachineState.reelStopOrder[1]!]! + 1;
  reelPos++;
  if (firstStoppedPos >= REEL_LENGTH) firstStoppedPos = 0;
  if (secondStoppedPos >= REEL_LENGTH) secondStoppedPos = 0;
  if (reelPos >= REEL_LENGTH) reelPos = 0;

  for (let i = 0; i < 3; i++) {
    icons[sSlotMachineState.reelStopOrder[0]! * 3 + i] = sReelIconAnimByReelAndPos[sSlotMachineState.reelStopOrder[0]!]![firstStoppedPos]!;
    icons[sSlotMachineState.reelStopOrder[1]! * 3 + i] = sReelIconAnimByReelAndPos[sSlotMachineState.reelStopOrder[1]!]![secondStoppedPos]!;
    icons[reelId * 3 + i] = sReelIconAnimByReelAndPos[reelId]![reelPos]!;
    if (++firstStoppedPos >= REEL_LENGTH) firstStoppedPos = 0;
    if (++secondStoppedPos >= REEL_LENGTH) secondStoppedPos = 0;
    if (++reelPos >= REEL_LENGTH) reelPos = 0;
  }

  switch (biasIcon) {
    case PAYOUT_NONE:
      for (let i = 0; i < 3; i++) {
        if (TestReelIconAttribute(1, icons[i]!)) return false;
      }
      for (let i = 0; i < NUM_MATCH_LINES; i++) {
        if (
          icons[sThirdReelBiasCheckIndices[i]![0]!] === icons[sThirdReelBiasCheckIndices[i]![1]!] &&
          icons[sThirdReelBiasCheckIndices[i]![0]!] === icons[sThirdReelBiasCheckIndices[i]![2]!]
        ) {
          return false;
        }
      }
      return true;
    case PAYOUT_CHERRIES2:
      for (let i = 0; i < NUM_MATCH_LINES; i++) {
        if (
          icons[sThirdReelBiasCheckIndices[i]![0]!] === icons[sThirdReelBiasCheckIndices[i]![1]!] &&
          TestReelIconAttribute(biasIcon, icons[sThirdReelBiasCheckIndices[i]![0]!]!)
        ) {
          return false;
        }
      }
      for (let i = 0; i < 3; i++) {
        if (TestReelIconAttribute(biasIcon, icons[i]!)) return true;
      }
      return false;
    case PAYOUT_CHERRIES3:
      for (let i = 0; i < NUM_MATCH_LINES; i++) {
        if (
          icons[sThirdReelBiasCheckIndices[i]![0]!] === icons[sThirdReelBiasCheckIndices[i]![1]!] &&
          TestReelIconAttribute(biasIcon, icons[sThirdReelBiasCheckIndices[i]![0]!]!)
        ) {
          return true;
        }
      }
      return false;
  }

  for (let i = 0; i < NUM_MATCH_LINES; i++) {
    if (
      icons[sThirdReelBiasCheckIndices[i]![0]!] === icons[sThirdReelBiasCheckIndices[i]![1]!] &&
      icons[sThirdReelBiasCheckIndices[i]![0]!] === icons[sThirdReelBiasCheckIndices[i]![2]!] &&
      TestReelIconAttribute(biasIcon, icons[sThirdReelBiasCheckIndices[i]![0]!]!)
    ) {
      return true;
    }
  }
  return false;
}

function TestReelIconAttribute(attr: number, icon: number): boolean {
  switch (attr) {
    case PAYOUT_NONE:
      return (icon ^ 4) !== 0;
    case PAYOUT_CHERRIES2:
    case PAYOUT_CHERRIES3:
      return icon === ICON_CHERRIES;
    case PAYOUT_MAGSHELL:
      return icon === ICON_MAGNEMITE || icon === ICON_SHELLDER;
    case PAYOUT_PIKAPSY:
      return icon === ICON_PIKACHU || icon === ICON_PSYDUCK;
    case PAYOUT_ROCKET:
      return icon === ICON_ROCKET;
    case PAYOUT_7:
      return icon === ICON_7;
    default:
      return false;
  }
}

function ReelIconToPayoutRank(iconId: number): number {
  switch (iconId) {
    default:
    case ICON_CHERRIES:
      return PAYOUT_CHERRIES2;
    case ICON_MAGNEMITE:
    case ICON_SHELLDER:
      return PAYOUT_MAGSHELL;
    case ICON_PIKACHU:
    case ICON_PSYDUCK:
      return PAYOUT_PIKAPSY;
    case ICON_ROCKET:
      return PAYOUT_ROCKET;
    case ICON_7:
      return PAYOUT_7;
  }
}

function CalcSlotBias(): void {
  if (!sSlotMachineState) return;
  const rval = Math.trunc(Random() / 4);
  let i: number;
  const biasChances = sReelBiasChances[sSlotMachineState.machineIdx]!;
  for (i = 0; i < NUM_PAYOUT_TYPES - 1; i++) {
    if (rval < biasChances[i]!) break;
  }
  if (sSlotMachineState.machineBias < PAYOUT_ROCKET) {
    if (sSlotMachineState.biasCooldown === 0) {
      if ((Random() & 0x3fff) < biasChances[PAYOUT_7]!) {
        sSlotMachineState.biasCooldown = Random() & 1 ? 5 : 60;
      }
    }
    if (sSlotMachineState.biasCooldown !== 0) {
      if (i === 0 && (Random() & 0x3fff) < Math.trunc(0.7 * 0x3fff)) {
        sSlotMachineState.biasCooldown = Random() & 1 ? 5 : 60;
      }
      sSlotMachineState.biasCooldown--;
    }
    sSlotMachineState.machineBias = i;
  }
}

function ResetMachineBias(): void {
  if (sSlotMachineState) sSlotMachineState.machineBias = 0;
}

function CalcPayout(): number {
  if (!sSlotMachineState) return 0;
  const visibleIcons = new Uint8Array(9);
  let reel1pos = sSlotMachineState.reelPositions[0]!;
  let reel2pos = sSlotMachineState.reelPositions[1]!;
  let reel3pos = sSlotMachineState.reelPositions[2]!;

  for (let i = 0; i < NUM_MATCH_LINES; i++) sSlotMachineState.winFlags[i] = false;

  for (let i = 0; i < 3; i++) {
    reel1pos++;
    if (reel1pos >= REEL_LENGTH) reel1pos = 0;
    reel2pos++;
    if (reel2pos >= REEL_LENGTH) reel2pos = 0;
    reel3pos++;
    if (reel3pos >= REEL_LENGTH) reel3pos = 0;
    visibleIcons[0 * 3 + i] = sReelIconAnimByReelAndPos[0]![reel1pos]!;
    visibleIcons[1 * 3 + i] = sReelIconAnimByReelAndPos[1]![reel2pos]!;
    visibleIcons[2 * 3 + i] = sReelIconAnimByReelAndPos[2]![reel3pos]!;
  }

  sSlotMachineState.payout = 0;
  let bestMatch = 0;

  for (let i = 0; i < NUM_MATCH_LINES; i++) {
    if (sSlotMachineState.bet >= sRowAttributes[i]![ROWATTR_MINBET]!) {
      let curMatch: number;
      const col1 = visibleIcons[sRowAttributes[i]![ROWATTR_COL1POS]!]!;
      const col2 = visibleIcons[sRowAttributes[i]![ROWATTR_COL2POS]!]!;
      const col3 = visibleIcons[sRowAttributes[i]![ROWATTR_COL3POS]!]!;

      if (TestReelIconAttribute(1, col1)) {
        curMatch = TestReelIconAttribute(2, col2) ? 2 : 1;
      } else if (col1 === col2 && col1 === col3) {
        curMatch = ReelIconToPayoutRank(col1);
      } else {
        curMatch = 0;
      }

      if (curMatch !== 0) {
        sSlotMachineState.winFlags[i] = true;
        sSlotMachineState.payout += sPayoutTable[curMatch]!;
      }
      if (curMatch > bestMatch) bestMatch = curMatch;
    }
  }
  return bestMatch;
}

function GetPayout(): number {
  return sSlotMachineState ? sSlotMachineState.payout : 0;
}

function GetPlayerBet(): number {
  return sSlotMachineState ? sSlotMachineState.bet : 0;
}

function GetWinFlagByLine(lineId: number): boolean {
  return !!sSlotMachineState?.winFlags[lineId];
}

function LoadSpriteGraphicsAndAllocateManager(): boolean {
  // Sprite sheets
  LoadCompressedSpriteSheet({ data: incbin("slot_machine.c:sReelIcons_Tiles"), size: 0xe00, tag: GFXTAG_REEL_ICONS });
  LoadCompressedSpriteSheet({ data: incbin("slot_machine.c:sClefairy_Tiles"), size: 0xc00, tag: GFXTAG_CLEFAIRY });
  LoadCompressedSpriteSheet({ data: incbin("slot_machine.c:sDigits_Tiles"), size: 0x280, tag: GFXTAG_DIGITS });

  // Sprite palettes
  const reelPal = incbin16("slot_machine.c:sReelIcons_Pal");
  for (let i = 0; i < 5; i++) {
    LoadSpritePalette({ data: reelPal.subarray(i * 16, (i + 1) * 16) as Uint16Array, tag: PALTAG_REEL_ICONS_0 + i });
  }
  LoadSpritePalette({ data: incbin16("slot_machine.c:sClefairy_Pal"), tag: PALTAG_CLEFAIRY });
  LoadSpritePalette({ data: incbin16("slot_machine.c:sDigits_Pal"), tag: PALTAG_DIGITS });

  sSlotMachineGfxManager = {
    reelIconSprites: Array.from({ length: NUM_REELS }, () => new Array(REEL_LOAD_LENGTH).fill(null)),
    creditDigitSprites: new Array(NUM_DIGIT_SPRITES).fill(null),
    payoutDigitSprites: new Array(NUM_DIGIT_SPRITES).fill(null),
    clefairySprites: [null, null],
  };
  InitGfxManager(sSlotMachineGfxManager);
  return true;
}

function DestroyGfxManager(): void {
  sSlotMachineGfxManager = null;
}

function InitGfxManager(manager: SlotMachineGfxManager): void {
  for (let i = 0; i < NUM_REELS; i++) {
    for (let j = 0; j < REEL_LOAD_LENGTH; j++) {
      manager.reelIconSprites[i]![j] = null;
    }
  }
}

function CreateReelIconSprites(): void {
  if (!sSlotMachineGfxManager) return;
  const template = templateFrom(cdata("slot_machine", "sSpriteTemplate_ReelIcons"));

  for (let i = 0; i < NUM_REELS; i++) {
    for (let j = 0; j < REEL_LOAD_LENGTH; j++) {
      const spriteId = CreateSprite(template, 80 + 40 * i, 44 + 24 * j, 2);
      const animId = sReelIconAnimByReelAndPos[i]![j]!;
      const sprite = gSprites[spriteId]!;
      StartSpriteAnim(sprite, animId);
      sprite.oam.paletteNum = IndexOfSpritePaletteTag(sReelIconPaletteTags[animId]!);
      sprite.data[0] = i;
      sprite.data[1] = j;
      sprite.data[2] = j;
      sprite.data[3] = 0;
      sprite.oam.matrixNum = 0;
      sSlotMachineGfxManager.reelIconSprites[i]![j] = sprite;
    }
  }
}

function UpdateReelIconSprites(reelPosPtr: number[], yposPtr: number[]): void {
  if (!sSlotMachineGfxManager) return;

  for (let i = 0; i < NUM_REELS; i++) {
    let reelPos = reelPosPtr[i]!;
    const ypos = yposPtr[i]! * 8;
    for (let j = 0; j < REEL_LOAD_LENGTH; j++) {
      const sprite = sSlotMachineGfxManager.reelIconSprites[i]![j]!;
      sprite.y2 = ypos;
      const animId = sReelIconAnimByReelAndPos[i]![reelPos]!;
      StartSpriteAnim(sprite, animId);
      sprite.oam.paletteNum = IndexOfSpritePaletteTag(sReelIconPaletteTags[animId]!);
      reelPos++;
      if (reelPos >= REEL_LENGTH) reelPos = 0;
    }
  }
}

function HBlankCB_SlotMachine(): void {
  const vcount = ppu.vcount - 0x2b;
  if (vcount >= 0 && vcount < 0x54) {
    ppu.oam[3] = sReelIconAffineParams[vcount]!;
    SetGpuReg(REG_OFFSET_BLDY, sReelIconBldY[vcount]!);
  } else {
    ppu.oam[3] = 0x100;
    SetGpuReg(REG_OFFSET_BLDY, 0);
  }
}

function CreateScoreDigitSprites(): void {
  if (!sSlotMachineGfxManager) return;
  const template = templateFrom(cdata("slot_machine", "sSpriteTemplate_Digits"));

  for (let i = 0; i < NUM_DIGIT_SPRITES; i++) {
    let spriteId = CreateSprite(template, 85 + 7 * i, 30, 0);
    sSlotMachineGfxManager.creditDigitSprites[i] = gSprites[spriteId]!;
    spriteId = CreateSprite(template, 133 + 7 * i, 30, 0);
    sSlotMachineGfxManager.payoutDigitSprites[i] = gSprites[spriteId]!;
  }
}

function UpdateCoinsDisplay(): void {
  if (!sSlotMachineGfxManager) return;
  let coins = GetCoins();
  let payout = GetPayout();
  let divisor = 1000;

  for (let i = 0; i < NUM_DIGIT_SPRITES; i++) {
    const quotientCoins = Math.trunc(coins / divisor);
    StartSpriteAnim(sSlotMachineGfxManager.creditDigitSprites[i]!, quotientCoins);
    coins -= quotientCoins * divisor;

    const quotientPayout = Math.trunc(payout / divisor);
    StartSpriteAnim(sSlotMachineGfxManager.payoutDigitSprites[i]!, quotientPayout);
    payout -= quotientPayout * divisor;

    divisor = Math.trunc(divisor / 10);
  }
}

function CreateClefairySprites(): void {
  if (!sSlotMachineGfxManager) return;
  const template = templateFrom(cdata("slot_machine", "sSpriteTemplate_Clefairy"));

  let spriteId = CreateSprite(template, 16, 136, 1);
  sSlotMachineGfxManager.clefairySprites[0] = gSprites[spriteId]!;
  spriteId = CreateSprite(template, DISPLAY_WIDTH - 16, 136, 1);
  sSlotMachineGfxManager.clefairySprites[1] = gSprites[spriteId]!;
  sSlotMachineGfxManager.clefairySprites[1].hFlip = 1;
}

function SetClefairySpriteAnim(animId: number): void {
  if (!sSlotMachineGfxManager) return;
  for (let i = 0; i < sSlotMachineGfxManager.clefairySprites.length; i++) {
    const sprite = sSlotMachineGfxManager.clefairySprites[i];
    if (sprite) StartSpriteAnim(sprite, animId);
  }
}

function CreateSlotMachine(): boolean {
  sSlotMachineSetupTaskData = {
    tasks: Array.from({ length: 8 }, () => ({ funcno: 0, state: 0, active: false })),
    reelButtonToPress: 0,
    bg1X: 0,
    yesNoMenuActive: false,
    buttonPressedTiles: Array.from({ length: NUM_REELS }, () => new Array(NUM_BUTTON_TILES).fill(0)),
    buttonReleasedTiles: Array.from({ length: NUM_REELS }, () => new Array(NUM_BUTTON_TILES).fill(0)),
    bg0TilemapBuffer: new Uint16Array(1024),
    bg1TilemapBuffer: new Uint16Array(1024),
    bg2TilemapBuffer: new Uint16Array(1024),
    bg3TilemapBuffer: new Uint16Array(1024),
  };
  CreateTask(Task_SlotMachine, 2);
  return false;
}

function DestroySlotMachine(): void {
  if (FuncIsActiveTask(Task_SlotMachine)) {
    DestroyTask(FindTaskIdByFunc(Task_SlotMachine));
  }
  sSlotMachineSetupTaskData = null;
  DestroyGfxManager();
  FreeAllWindowBuffers();
}

function Task_SlotMachine(_taskId: number): void {
  const ptr = GetSlotMachineSetupTaskDataPtr();
  if (!ptr) return;

  for (let i = 0; i < ptr.tasks.length; i++) {
    const task = ptr.tasks[i]!;
    if (task.active) {
      task.active = sSlotMachineSetupTasks[task.funcno]!(task, ptr);
    }
  }
}

function VBlankCB_SlotMachine(): void {
  TransferPlttBuffer();
  LoadOam();
  ProcessSpriteCopyRequests();
}

function GetSlotMachineSetupTaskDataPtr(): SlotMachineSetupTaskData | null {
  return sSlotMachineSetupTaskData;
}

function SetSlotMachineSetupTask(funcno: number, taskId: number): void {
  const ptr = GetSlotMachineSetupTaskDataPtr();
  if (!ptr) return;
  const task = ptr.tasks[taskId]!;
  task.funcno = funcno;
  task.state = 0;
  task.active = sSlotMachineSetupTasks[funcno]!(task, ptr);
}

function IsSlotMachineSetupTaskActive(taskId: number): boolean {
  const ptr = GetSlotMachineSetupTaskDataPtr();
  return !!ptr?.tasks[taskId]?.active;
}

function SetBackdropColor(color: number): void {
  gPlttBufferUnfaded[0] = color;
  gPlttBufferFaded[0] = color;
}

const sSlotMachineSetupTasks: Array<(subtask: SlotMachineSubTask, ptr: SlotMachineSetupTaskData) => boolean> = [
  SlotsTask_GraphicsInit,
  SlotsTask_FadeOut,
  SlotsTask_UpdateLineStates,
  SlotsTask_ClefairyUpdateOnReelsStart,
  SlotsTask_StartClefairyDanceAndWinningLineFlash,
  SlotsTask_StopWinningLineFlashTask,
  SlotsTask_ClefairyFainted,
  SlotsTask_ClefairyNeutral,
  SlotsTask_UpdateCoinsDisplay,
  SlotsTask_MessageOutOfCoins,
  SlotsTask_AskQuitPlaying,
  SlotsTask_DestroyYesNoMenu,
  SlotsTask_PressReelButton,
  SlotsTask_ReleaseReelButtons,
  SlotsTask_ShowHelp,
  SlotsTask_HideHelp,
];

function SlotsTask_GraphicsInit(subtask: SlotMachineSubTask, ptr: SlotMachineSetupTaskData): boolean {
  switch (subtask.state) {
    case 0:
      BlendPalettes(0xffffffff, 16, RGB_BLACK);
      subtask.state++;
      break;
    case 1:
      SetVBlankCallback(null);
      ResetSpriteData();
      FreeAllSpritePalettes();
      ppu.oam.fill(0);
      ppu.vram.fill(0);
      SetGpuReg(REG_OFFSET_DISPCNT, 0);
      ResetBgsAndClearDma3BusyFlags(false);
      InitBgsFromTemplates(0, cdata<BgTemplate[]>("slot_machine", "sBgTemplates"));
      InitWindows(cdata<WindowTemplate[]>("slot_machine", "sWindowTemplates"));

      SetBgTilemapBuffer(3, ptr.bg3TilemapBuffer);
      FillBgTilemapBufferRect_Palette0(3, 0, 0, 0, 32, 32);
      CopyBgTilemapBufferToVram(3);

      LoadBgTiles(2, incbin("slot_machine.c:sBg_Tiles"), 0, 0x00);
      LoadBgTiles(2, incbin("slot_machine.c:sButtonPressed_Tiles"), 0, 0xc0);
      SetBgTilemapBuffer(2, ptr.bg2TilemapBuffer);
      CopyToBgTilemapBuffer(2, incbin16("slot_machine.c:sBg_Tilemap"), 0, 0x00);
      CopyBgTilemapBufferToVram(2);

      LoadPalette(incbin16("slot_machine.c:sBg_Pal"), BG_PLTT_ID(0), 160);
      LoadPalette(incbin16("slot_machine.c:sBgPal_MatchLines"), BG_PLTT_ID(PALSLOT_LINE_BET), 32);
      LoadPalette(incbin16("slot_machine.c:sCombosWindow_Pal"), BG_PLTT_ID(7), 96);
      SetBackdropColor(RGB(30, 30, 31));
      LoadUserWindowGfx2(0, 0x00a, BG_PLTT_ID(13));
      LoadStdWindowGfxOnBg(0, 0x001, BG_PLTT_ID(15));

      SetBgTilemapBuffer(0, ptr.bg0TilemapBuffer);
      FillBgTilemapBufferRect_Palette0(0, 0, 0, 2, 32, 30);
      LoadBgTiles(1, incbin("slot_machine.c:sCombosWindow_Tiles"), 0, 0);
      SetBgTilemapBuffer(1, ptr.bg1TilemapBuffer);
      CopyToBgTilemapBuffer(1, incbin16("slot_machine.c:sCombosWindow_Tilemap"), 0, 0);
      CopyBgTilemapBufferToVram(1);

      LoadPalette(GetTextWindowPalette(2), BG_PLTT_ID(14), 32);
      FillWindowPixelBuffer(1, 0xff);
      PutWindowTilemap(1);

      {
        const controlsText = rom.text("gString_SlotMachineControls");
        const x = DISPLAY_WIDTH - 4 - GetStringWidth(FONT_SMALL, controlsText, 0);
        const textColor = [6, 1, 2];
        AddTextPrinterParameterized3(1, FONT_SMALL, x, 0, textColor, 0, controlsText);
      }
      CopyBgTilemapBufferToVram(0);


      SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | 0x20 | DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
      SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG3 | BLDCNT_TGT1_OBJ | BLDCNT_TGT1_BD | BLDCNT_EFFECT_DARKEN);

      LoadSpriteGraphicsAndAllocateManager();
      CreateReelIconSprites();
      CreateScoreDigitSprites();
      CreateClefairySprites();
      UpdateCoinsDisplay();

      BlendPalettes(0xffffffff, 0x10, RGB_BLACK);
      SetVBlankCallback(VBlankCB_SlotMachine);
      SetHBlankCallback(HBlankCB_SlotMachine);
      subtask.state++;
      break;
    case 2:
      ShowBg(0);
      ShowBg(3);
      ShowBg(2);
      HideBg(1);
      InitReelButtonTileMem();
      BlendPalettes(0xffffffff, 0x10, RGB_BLACK);
      BeginNormalPaletteFade(0xffffffff, -1, 16, 0, RGB_BLACK);
      subtask.state++;
      break;
    case 3:
      UpdatePaletteFade();
      if (!gPaletteFade.active) return false;
      break;
  }
  return true;
}

function SlotsTask_FadeOut(subtask: SlotMachineSubTask, _ptr: SlotMachineSetupTaskData): boolean {
  switch (subtask.state) {
    case 0:
      BeginNormalPaletteFade(0xffffffff, -1, 0, 16, 0);
      subtask.state++;
      break;
    case 1:
      if (!gPaletteFade.active) return false;
      break;
  }
  return true;
}

function SlotsTask_UpdateLineStates(subtask: SlotMachineSubTask, _ptr: SlotMachineSetupTaskData): boolean {
  switch (subtask.state) {
    case 0: {
      const buf = GetBgTilemapBuffer(2);
      if (buf) SetLineStatesByBet(buf);
      CopyBgTilemapBufferToVram(2);
      subtask.state++;
      break;
    }
    case 1:
      return false;
  }
  return true;
}


function SlotsTask_ClefairyUpdateOnReelsStart(_subtask: SlotMachineSubTask, _ptr: SlotMachineSetupTaskData): boolean {
  SetClefairySpriteAnim(1);
  return false;
}

function SlotsTask_StartClefairyDanceAndWinningLineFlash(_subtask: SlotMachineSubTask, _ptr: SlotMachineSetupTaskData): boolean {
  SetClefairySpriteAnim(2);
  CreateTask(Task_FlashWinningLine, 3);
  return false;
}

function SlotsTask_StopWinningLineFlashTask(subtask: SlotMachineSubTask, _ptr: SlotMachineSetupTaskData): boolean {
  switch (subtask.state) {
    case 0:
      SignalStopWinningLineFlashTask();
      subtask.state++;
      break;
    case 1:
      if (!FuncIsActiveTask(Task_FlashWinningLine)) {
        SetClefairySpriteAnim(0);
        return false;
      }
      break;
  }
  return true;
}

function SlotsTask_ClefairyFainted(_subtask: SlotMachineSubTask, _ptr: SlotMachineSetupTaskData): boolean {
  SetClefairySpriteAnim(3);
  return false;
}

function SlotsTask_ClefairyNeutral(_subtask: SlotMachineSubTask, _ptr: SlotMachineSetupTaskData): boolean {
  SetClefairySpriteAnim(0);
  return false;
}

function SlotsTask_UpdateCoinsDisplay(_subtask: SlotMachineSubTask, _ptr: SlotMachineSetupTaskData): boolean {
  UpdateCoinsDisplay();
  return false;
}

function SlotsTask_MessageOutOfCoins(subtask: SlotMachineSubTask, _ptr: SlotMachineSetupTaskData): boolean {
  switch (subtask.state) {
    case 0:
      Slot_PrintOnWindow0(rom.text("gString_OutOfCoins"));
      CopyWindowToVram(0, COPYWIN_FULL);
      subtask.state++;
      break;
    case 1:
      return false;
  }
  return true;
}

function SlotsTask_AskQuitPlaying(subtask: SlotMachineSubTask, _ptr: SlotMachineSetupTaskData): boolean {
  switch (subtask.state) {
    case 0:
      Slot_PrintOnWindow0(rom.text("gString_QuitPlaying"));
      Slot_CreateYesNoMenu(0);
      CopyWindowToVram(0, COPYWIN_FULL);
      subtask.state++;
      break;
    case 1:
      return false;
  }
  return true;
}

function SlotsTask_DestroyYesNoMenu(subtask: SlotMachineSubTask, _ptr: SlotMachineSetupTaskData): boolean {
  switch (subtask.state) {
    case 0:
      Slot_ClearWindow0();
      Slot_DestroyYesNoMenu();
      CopyWindowToVram(0, COPYWIN_FULL);
      subtask.state++;
      break;
    case 1:
      return false;
  }
  return true;
}

function SlotsTask_PressReelButton(subtask: SlotMachineSubTask, ptr: SlotMachineSetupTaskData): boolean {
  switch (subtask.state) {
    case 0:
      SetReelButtonPressed(ptr.reelButtonToPress);
      CopyBgTilemapBufferToVram(2);
      subtask.state++;
      break;
    case 1:
      return false;
  }
  return true;
}

function SlotsTask_ReleaseReelButtons(subtask: SlotMachineSubTask, _ptr: SlotMachineSetupTaskData): boolean {
  switch (subtask.state) {
    case 0:
      ReleaseReelButtons();
      CopyBgTilemapBufferToVram(2);
      subtask.state++;
      break;
    case 1:
      return false;
  }
  return true;
}

function SlotsTask_ShowHelp(subtask: SlotMachineSubTask, ptr: SlotMachineSetupTaskData): boolean {
  switch (subtask.state) {
    case 0:
      SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
      SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_BG0 | WININ_WIN0_BG1 | WININ_WIN0_BG2 | WININ_WIN0_BG3 | WININ_WIN0_OBJ | WININ_WIN0_CLR);
      SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG0 | WINOUT_WIN01_BG2 | WINOUT_WIN01_BG3 | WINOUT_WIN01_OBJ | WINOUT_WIN01_CLR);
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, 0));
      SetGpuReg(REG_OFFSET_WIN1H, WIN_RANGE(0, 160));
      ShowBg(1);
      PlaySE(C.SE_WIN_OPEN);
      ptr.bg1X = 0;
      subtask.state++;
      break;
    case 1:
      ptr.bg1X += 16;
      if (ptr.bg1X >= 256) {
        ptr.bg1X = 256;
        subtask.state++;
      }
      ChangeBgX(1, 256 * (256 - ptr.bg1X), 0);
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, ptr.bg1X));
      break;
    case 2:
      return false;
  }
  return true;
}

function SlotsTask_HideHelp(subtask: SlotMachineSubTask, ptr: SlotMachineSetupTaskData): boolean {
  switch (subtask.state) {
    case 0:
      PlaySE(C.SE_WIN_OPEN);
      subtask.state++;
      // fallthrough
    case 1:
      ptr.bg1X -= 16;
      if (ptr.bg1X <= 0) {
        ptr.bg1X = 0;
        subtask.state++;
      }
      ChangeBgX(1, 256 * (256 - ptr.bg1X), 0);
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, ptr.bg1X));
      break;
    case 2:
      HideBg(1);
      ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
      subtask.state++;
      break;
    case 3:
      return false;
  }
  return true;
}

function Slot_PrintOnWindow0(str: ArrayLike<number>): void {
  FillWindowPixelBuffer(0, 1);
  PutWindowTilemap(0);
  DrawTextBorderOuter(0, 0x001, 15);
  AddTextPrinterParameterized5(0, FONT_NORMAL, str, 1, 2, TEXT_SKIP_DRAW, null, 1, 2);
}

function Slot_ClearWindow0(): void {
  FillWindowPixelBuffer(0, 0);
  ClearWindowTilemap(0);
}

function SetLineStatesByBet(bgTilemapBuffer: Uint16Array): void {
  switch (GetPlayerBet()) {
    case 0:
      SetLineState(bgTilemapBuffer, 0, PALSLOT_LINE_NORMAL);
      SetLineState(bgTilemapBuffer, 1, PALSLOT_LINE_NORMAL);
      SetLineState(bgTilemapBuffer, 2, PALSLOT_LINE_NORMAL);
      SetLineState(bgTilemapBuffer, 3, PALSLOT_LINE_NORMAL);
      SetLineState(bgTilemapBuffer, 4, PALSLOT_LINE_NORMAL);
      break;
    case 3:
      SetLineState(bgTilemapBuffer, 0, PALSLOT_LINE_BET);
      SetLineState(bgTilemapBuffer, 4, PALSLOT_LINE_BET);
      // fallthrough
    case 2:
      SetLineState(bgTilemapBuffer, 1, PALSLOT_LINE_BET);
      SetLineState(bgTilemapBuffer, 3, PALSLOT_LINE_BET);
      // fallthrough
    case 1:
      SetLineState(bgTilemapBuffer, 2, PALSLOT_LINE_BET);
      break;
  }
}

function SetLineState(bgTilemapBuffer: Uint16Array, lineId: number, paletteNo: number): void {
  const tiles = sLineTiles[lineId]!;
  const palMask = (paletteNo & 0xf) << 12;
  for (let i = 0; i < tiles.length; i++) {
    const idx = tiles[i]!;
    bgTilemapBuffer[idx] = (bgTilemapBuffer[idx]! & 0x0fff) | palMask;
  }
}

function Task_FlashWinningLine(taskId: number): void {
  const data = tasks.tasks[taskId]?.data;
  if (!data) return;

  switch (data[0]) {
    case 0: {
      const matchPal = incbin16("slot_machine.c:sBgPal_MatchLines");
      LoadPalette(matchPal, BG_PLTT_ID(PALSLOT_LINE_MATCH), 32);
      const buf = GetBgTilemapBuffer(2);
      if (buf) {
        for (let i = 0; i < NUM_MATCH_LINES; i++) {
          if (GetWinFlagByLine(i)) SetLineState(buf, i, PALSLOT_LINE_MATCH);
        }
      }
      CopyBgTilemapBufferToVram(2);
      data[0]++;
      break;
    }
    case 1: {
      if (data[1] === 0) {
        const y = gSineTable[data[2]!]! >> 7;
        const payoutLights = incbin16("slot_machine.c:sBgPal_PayoutLight");
        LoadPalette(payoutLights.subarray(y * 16, (y + 1) * 16) as Uint16Array, BG_PLTT_ID(1), 32);
        data[2] = (data[2]! + 32) & 0x7f;
        data[1] = 8;
      } else {
        data[1]--;
      }

      if (data[3] === 0) {
        data[4] = (data[4]! + 8) & 0x7f;
        data[5] = gSineTable[data[4]!]! >> 5;
        BlendPalettes(1 << PALSLOT_LINE_MATCH, data[5]!, RGB_BLACK);
      } else {
        data[4]++;
        if (data[4]! > 1) {
          data[4] = 0;
          data[5] = (data[5]! + 1) & 1;
          BlendPalettes(1 << PALSLOT_LINE_MATCH, data[5]! * 8, RGB_BLACK);
        }
      }

      for (let i = 0; i < sWinningLineFlashPalIdxs.length; i++) {
        const palIdx = sWinningLineFlashPalIdxs[i]! + BG_PLTT_ID(PALSLOT_LINE_MATCH);
        gPlttBufferFaded[palIdx] = gPlttBufferUnfaded[palIdx]!;
      }
      break;
    }
    case 2: {
      // Restore match lines to normal color
      const buf = GetBgTilemapBuffer(2);
      if (buf) {
        for (let i = 0; i < NUM_MATCH_LINES; i++) {
          if (GetWinFlagByLine(i)) SetLineState(buf, i, PALSLOT_LINE_NORMAL);
        }
      }
      // Restore payout lights to normal color
      const bgPal = incbin16("slot_machine.c:sBg_Pal");
      LoadPalette(bgPal.subarray(16, 32) as Uint16Array, BG_PLTT_ID(1), 32);
      CopyBgTilemapBufferToVram(2);
      data[0]++;
      break;
    }
    case 3:
      DestroyTask(taskId);
      break;
  }
}

function SignalStopWinningLineFlashTask(): void {
  const taskId = FindTaskIdByFunc(Task_FlashWinningLine);
  if (taskId !== 0xff && tasks.tasks[taskId]) {
    tasks.tasks[taskId]!.data[0] = 2;
  }
}

function Slot_CreateYesNoMenu(cursorPos: number): void {
  const template = cdata<WindowTemplate>("slot_machine", "sYesNoWindowTemplate");
  CreateYesNoMenu(template, FONT_NORMAL, 0, 2, 10, 13, cursorPos);
  Menu_MoveCursorNoWrapAround(cursorPos);
  const ptr = GetSlotMachineSetupTaskDataPtr();
  if (ptr) ptr.yesNoMenuActive = true;
}

function Slot_DestroyYesNoMenu(): void {
  const ptr = GetSlotMachineSetupTaskDataPtr();
  if (ptr && ptr.yesNoMenuActive) {
    DestroyYesNoMenu();
    ptr.yesNoMenuActive = false;
  }
}

function InitReelButtonTileMem(): void {
  const ptr = GetSlotMachineSetupTaskDataPtr();
  if (!ptr) return;
  const buffer = GetBgTilemapBuffer(2);
  if (!buffer) return;

  for (let i = 0; i < NUM_REELS; i++) {
    for (let j = 0; j < NUM_BUTTON_TILES; j++) {
      const idx = sReelButtonMapTileIdxs[i]![j]!;
      ptr.buttonReleasedTiles[i]![j] = buffer[idx]!;
      ptr.buttonPressedTiles[i]![j] = j + 0xc0;
    }
  }
}

function SetReelButtonPressed(reel: number): void {
  if (reel < NUM_REELS) {
    const ptr = GetSlotMachineSetupTaskDataPtr();
    if (!ptr) return;
    const buffer = GetBgTilemapBuffer(2);
    if (!buffer) return;
    for (let i = 0; i < NUM_BUTTON_TILES; i++) {
      const idx = sReelButtonMapTileIdxs[reel]![i]!;
      buffer[idx] = ptr.buttonPressedTiles[reel]![i]!;
    }
  }
}

function ReleaseReelButtons(): void {
  const ptr = GetSlotMachineSetupTaskDataPtr();
  if (!ptr) return;
  const buffer = GetBgTilemapBuffer(2);
  if (!buffer) return;

  for (let i = 0; i < NUM_REELS; i++) {
    for (let j = 0; j < NUM_BUTTON_TILES; j++) {
      const idx = sReelButtonMapTileIdxs[i]![j]!;
      buffer[idx] = ptr.buttonReleasedTiles[i]![j]!;
    }
  }
}


function PressReelButton(reel: number, taskId: number): void {
  const ptr = GetSlotMachineSetupTaskDataPtr();
  if (!ptr) return;
  ptr.reelButtonToPress = reel;
  SetSlotMachineSetupTask(SLOTTASK_PRESS_BUTTON, taskId);
}

/** Field wrapper used by Game.playSlotMachine */
export function openSlotMachine(machineIdx: number, done: () => void): void {
  void (async () => {
    await loadCData("slot_machine");
    await preloadPacks(["graphics_slot_machine"]);
    PlaySlotMachine(machineIdx, () => {
      done();
    });
  })();
}
