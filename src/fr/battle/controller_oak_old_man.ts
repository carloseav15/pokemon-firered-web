// battle_controller_oak_old_man.c: player-side controller for the first rival battle (Oak's commentary)
// and the old man's catching tutorial.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, JOY_NEW, START_BUTTON } from "../gba/input";
import { tasks } from "../gba/tasks";
import { rom } from "../rom";
import { save, varGet } from "../save";
import { CopyBgTilemapBufferToVram, FillBgTilemapBufferRect, IsDma3ManagerBusyWithBgCopy } from "../hw/bg";
import { BeginFastPaletteFade, BeginNormalPaletteFade, gPaletteFade, LoadCompressedPalette, OBJ_PLTT_ID, PALETTES_ALL, PLTT_SIZE_4BPP, RGB_BLACK } from "../hw/palette";
import { gMain } from "../hw/runtime";
import { AllocSpritePalette, CreateInvisibleSprite, CreateSprite, DestroySprite, FreeOamMatrix, FreeSpriteOamMatrix, FreeSpritePaletteByTag,
  FreeSpriteTilesByTag, gSprites, SpriteCallbackDummy, StartSpriteAnim } from "../hw/sprite";
import { FreeAllWindowBuffers } from "../hw/window";
import { IsTextPrinterActive } from "../hw/text";
import { DisableStruct } from "../generated/structs";
import {
  G, gActionSelectionCursor, gBattleBufferA, gBattleCommunication, gBattleControllerData, gBattleMonForms, gBattlePartyCurrentOrder,
  gBattleSpritesDataPtr, gBattleStruct, gBattlerControllerFuncs, gBattlerPartyIndexes, gBattlerSpriteIds, gBattlerStatusSummaryTaskId, gBitTable,
  gDisplayedStringBattle, gHealthboxSpriteIds, gTransformedPersonalities,
} from "./globals";
import { GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide } from "./util";
import { BtlController_EmitChosenMonReturnValue, BtlController_EmitDataTransfer, BtlController_EmitOneReturnValue, BtlController_EmitTwoReturnValues,
  BattleControllerDummy, BUFFER_B, decodeHpAndStatus } from "./controllers";
import { HandleGetMonData, HandleSetMonData } from "./mon_transfer";
import { BOUNCE_HEALTHBOX, BOUNCE_MON, DoBounceEffect, EndBounceEffect, SpriteCB_FaintSlideAnim, BattleMainCB2 } from "./main_init";
import { ActionSelectionCreateCursorAt, ActionSelectionDestroyCursorAt, HandleInputChooseMove, InitMoveSelectionsVarsAndStrings,
  SpriteCB_FreePlayerSpriteLoadMonSprite, Task_PlayerController_RestoreBgmAfterCry, PlayerHandleGetRawMonData } from "./controller_player";
import { OpponentBufferExecCompleted } from "./controller_opponent";
import { CalculateMonStats, GetMonData, playerMon, SetMonData } from "../pokemon/mon";
import { addBagItem as AddBagItem } from "../pokemon/items";
import {
  CopyAllBattleSpritesInvisibilities, DecompressTrainerBackPalette, DoHitAnimHealthboxEffect, HandleLowHpMusicChange, InitAndLaunchSpecialAnimation,
  IsMoveWithoutAnimation, PlaySE12WithPanning, SetBattlerSpriteAffineMode, SpriteCB_WaitForBattlerBallReleaseAnim, TryHandleLaunchBattleTableAnimation,
  TrySetBehindSubstituteSpriteBit, TryShinyAnimation, trainerBackPicPalette, gTrainerBackPicCoords,
} from "./gfx_sfx_util";
import {
  animState, DoMoveAnim, GetBattlerSpriteCoord, GetBattlerSpriteDefault_Y, GetBattlerSpriteSubpriority, gMultiuseSpriteTemplate,
  SetMultiuseSpriteTemplateToPokemon, SetMultiuseSpriteTemplateToTrainerBack, SetSpritePrimaryCoordsFromSecondaryCoords, SpriteCB_TrainerSlideIn,
  StartAnimLinearTranslation, StoreSpriteCallbackInData6,
} from "./anim";
import {
  CreatePartyStatusSummarySprites, DoFreeHealthboxPalsForLevelUp, DoLoadHealthboxPalsForLevelUp, LoadBattleBarGfx, MoveBattleBar, SetBattleBarStruct,
  SetHealthboxSpriteInvisible, SetHealthboxSpriteVisible, StartHealthboxSlideIn, SwapHpBarsWithHpText, Task_HidePartyStatusSummary,
  UpdateHealthboxAttribute, UpdateHpTextInHealthbox,
} from "./interface";
import { BattlePutTextOnWindow, BattleStringExpandPlaceholdersToDisplayedString, BattleStringShouldBeColored, BufferStringBattle } from "./message";
import { HandleIntroSlide } from "./intro";
import { DoPokeballSendOutAnimation } from "./pokeball";
import { CB2_BagMenuFromBattle, InitOldManBag, OpenPartyMenuInTutorialBattle, partyMenuResult } from "./ext";

const FIRST_BATTLE_MSG_FLAG_INFLICT_DMG = 1 << 0;
const FIRST_BATTLE_MSG_FLAG_STAT_CHG = 1 << 1;
const FIRST_BATTLE_MSG_FLAG_HP_RESTORE = 1 << 2;

const sis = () => gBattleStruct.simulatedInputState;
const BG_TILE_V_FLIP = (n: number) => n | 0x800;
const s16v = (v: number) => (v << 16) >> 16;
const expTable = (species: number) => rom.expTables[rom.species[species].growthRate];

function IsDoubleBattle(): boolean {
  return (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) !== 0;
}

function OakOldManDummy(): void {}

export function SetControllerToOakOrOldMan(): void {
  gBattlerControllerFuncs[G.gActiveBattler] = OakOldManBufferRunCommand;
  sis().fill(0, 0, 4);
}

function OakOldManBufferRunCommand(): void {
  if (G.gBattleControllerExecFlags & gBitTable[G.gActiveBattler]) {
    const fn = sOakOldManBufferCommands[gBattleBufferA[G.gActiveBattler][0]];
    if (fn) fn();
    else OakOldManBufferExecCompleted();
  }
}

function OakOldManBufferExecCompleted(): void {
  gBattlerControllerFuncs[G.gActiveBattler] = OakOldManBufferRunCommand;
  G.gBattleControllerExecFlags = (G.gBattleControllerExecFlags & ~gBitTable[G.gActiveBattler]) >>> 0;
}

function actionCursorMove(mask: number, wantSet: boolean): void {
  const b = G.gActiveBattler;
  if (((gActionSelectionCursor[b] & mask) !== 0) === wantSet) {
    sound.playSE(C.SE_SELECT);
    ActionSelectionDestroyCursorAt(gActionSelectionCursor[b]);
    gActionSelectionCursor[b] ^= mask;
    ActionSelectionCreateCursorAt(gActionSelectionCursor[b], 0);
  }
}

function HandleInputChooseAction(): void {
  const b = G.gActiveBattler;
  const itemId = gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8);
  DoBounceEffect(b, BOUNCE_HEALTHBOX, 7, 1);
  DoBounceEffect(b, BOUNCE_MON, 7, 1);
  if (JOY_NEW(A_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    const actions = [C.B_ACTION_USE_MOVE, C.B_ACTION_USE_ITEM, C.B_ACTION_SWITCH, C.B_ACTION_RUN];
    BtlController_EmitTwoReturnValues(BUFFER_B, actions[gActionSelectionCursor[b]], 0);
    OakOldManBufferExecCompleted();
  } else if (JOY_NEW(DPAD_LEFT)) {
    actionCursorMove(1, true);
  } else if (JOY_NEW(DPAD_RIGHT)) {
    actionCursorMove(1, false);
  } else if (JOY_NEW(DPAD_UP)) {
    actionCursorMove(2, true);
  } else if (JOY_NEW(DPAD_DOWN)) {
    actionCursorMove(2, false);
  } else if (JOY_NEW(B_BUTTON)) {
    if (IsDoubleBattle() && GetBattlerPosition(b) === C.B_POSITION_PLAYER_RIGHT
      && !(G.gAbsentBattlerFlags & gBitTable[GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT)]) && !(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI)) {
      if (gBattleBufferA[b][1] === C.B_ACTION_USE_ITEM) {
        if (itemId <= C.ITEM_PREMIER_BALL) AddBagItem(itemId, 1);
        else return;
      }
      sound.playSE(C.SE_SELECT);
      BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_CANCEL_PARTNER, 0);
      OakOldManBufferExecCompleted();
    }
  } else if (JOY_NEW(START_BUTTON)) {
    SwapHpBarsWithHpText();
  }
}

/** Old man: moves the cursor to BAG and opens it. */
function SimulateInputChooseAction(): void {
  const st = sis();
  switch (st[0]) {
    case 0:
      st[2] = 64;
      st[0]++;
    // fall through
    case 1:
      if (--st[2] === 0) {
        sound.playSE(C.SE_SELECT);
        ActionSelectionDestroyCursorAt(0);
        ActionSelectionCreateCursorAt(1, 0);
        st[2] = 64;
        st[0]++;
      }
      break;
    case 2:
      if (--st[2] === 0) {
        sound.playSE(C.SE_SELECT);
        BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_USE_ITEM, 0);
        OakOldManBufferExecCompleted();
      }
      break;
  }
}

function CompleteOnBattlerSpriteCallbackDummy(): void {
  if (gSprites[gBattlerSpriteIds[G.gActiveBattler]].callback === SpriteCallbackDummy) OakOldManBufferExecCompleted();
}

function CompleteOnInactiveTextPrinter(): void {
  if (!IsTextPrinterActive(0)) OakOldManBufferExecCompleted();
}

function CompleteOnSpecialAnimDone(): void {
  if (!G.gDoingBattleAnim) OakOldManBufferExecCompleted();
}

/** OakOldManHandleSuccessBallThrowAnim / OakOldManHandleBallThrowAnim (battle_controller_oak_old_man.c). */
function OakOldManHandleSuccessBallThrowAnim(): void { launchBallThrow(C.BALL_3_SHAKES_SUCCESS); }
function OakOldManHandleBallThrowAnim(): void { launchBallThrow(gBattleBufferA[G.gActiveBattler][1]); }

export function OakOldManHandleInputChooseMove(): void {
  HandleInputChooseMove();
  if (!(G.gBattleControllerExecFlags & gBitTable[G.gActiveBattler])) OakOldManBufferExecCompleted();
}

function OpenPartyMenuToChooseMon(): void {
  if (!gPaletteFade.active) {
    const b = G.gActiveBattler;
    gBattlerControllerFuncs[b] = WaitForMonSelection;
    const caseId = tasks.tasks[gBattleControllerData[b]].data[0];
    tasks.destroy(gBattleControllerData[b]);
    FreeAllWindowBuffers();
    OpenPartyMenuInTutorialBattle(caseId);
  }
}

function WaitForMonSelection(): void {
  if (gMain.callback2 === BattleMainCB2 && !gPaletteFade.active) {
    if (partyMenuResult.useExitCallback) BtlController_EmitChosenMonReturnValue(BUFFER_B, partyMenuResult.selectedMonPartyId, gBattlePartyCurrentOrder);
    else BtlController_EmitChosenMonReturnValue(BUFFER_B, 6, [0, 0, 0]);
    OakOldManBufferExecCompleted();
  }
}

function OpenBagAndChooseItem(): void {
  if (!gPaletteFade.active) {
    gBattlerControllerFuncs[G.gActiveBattler] = CompleteWhenChoseItem;
    FreeAllWindowBuffers();
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE) CB2_BagMenuFromBattle();
    else InitOldManBag();
  }
}

function CompleteWhenChoseItem(): void {
  if (gMain.callback2 === BattleMainCB2 && !gPaletteFade.active) {
    const itemId = varGet(C.VAR_ITEM_ID);
    if (!BtlCtrl_OakOldMan_TestState2Flag(FIRST_BATTLE_MSG_FLAG_HP_RESTORE) && itemId === C.ITEM_POTION && G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE) {
      BtlCtrl_OakOldMan_SetState2Flag(FIRST_BATTLE_MSG_FLAG_HP_RESTORE);
      gBattlerControllerFuncs[G.gActiveBattler] = PrintOakText_KeepAnEyeOnHP;
    } else {
      BtlController_EmitOneReturnValue(BUFFER_B, itemId);
      OakOldManBufferExecCompleted();
    }
  }
}

function Intro_TryShinyAnimShowHealthbox(): void {
  const b = G.gActiveBattler;
  const f = b ^ C.BIT_FLANK;
  const hb = gBattleSpritesDataPtr.healthBoxesData;
  if (!hb[b].triedShinyMonAnim && !hb[b].ballAnimActive) TryShinyAnimation(b, playerMon(gBattlerPartyIndexes[b]));
  if (!hb[f].triedShinyMonAnim && !hb[f].ballAnimActive) TryShinyAnimation(f, playerMon(gBattlerPartyIndexes[f]));
  if (!hb[b].ballAnimActive && !hb[f].ballAnimActive) {
    if (IsDoubleBattle() && !(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI)) {
      DestroySprite(gSprites[gBattleControllerData[f]]);
      UpdateHealthboxAttribute(gHealthboxSpriteIds[f], playerMon(gBattlerPartyIndexes[f]), C.HEALTHBOX_ALL);
      StartHealthboxSlideIn(f);
      SetHealthboxSpriteVisible(gHealthboxSpriteIds[f]);
    }
    DestroySprite(gSprites[gBattleControllerData[b]]);
    UpdateHealthboxAttribute(gHealthboxSpriteIds[b], playerMon(gBattlerPartyIndexes[b]), C.HEALTHBOX_ALL);
    StartHealthboxSlideIn(b);
    SetHealthboxSpriteVisible(gHealthboxSpriteIds[b]);
    gBattleSpritesDataPtr.animationData.introAnimActive = 0;
    gBattlerControllerFuncs[b] = Intro_WaitForShinyAnimAndHealthbox;
  }
}

function Intro_WaitForShinyAnimAndHealthbox(): void {
  const b = G.gActiveBattler;
  const f = b ^ C.BIT_FLANK;
  const hb = gBattleSpritesDataPtr.healthBoxesData;
  if (gSprites[gHealthboxSpriteIds[b]].callback === SpriteCallbackDummy && hb[b].finishedShinyMonAnim && hb[f].finishedShinyMonAnim) {
    hb[b].triedShinyMonAnim = 0;
    hb[b].finishedShinyMonAnim = 0;
    hb[f].triedShinyMonAnim = 0;
    hb[f].finishedShinyMonAnim = 0;
    FreeSpriteTilesByTag(C.ANIM_TAG_GOLD_STARS);
    FreeSpritePaletteByTag(C.ANIM_TAG_GOLD_STARS);
    tasks.create(Task_PlayerController_RestoreBgmAfterCry, 10);
    HandleLowHpMusicChange(playerMon(gBattlerPartyIndexes[b]), b);
    gBattlerControllerFuncs[b] = PrintOakText_ForPetesSake;
  }
}

// ---------------------------------------------------------------- exp tasks (data[0]=monId, [1]=gainedExp, [2]=battler, [10]=frames)
function Task_GiveExpToMon(taskId: number): void {
  const t = tasks.tasks[taskId];
  const monId = t.data[0] & 0xff;
  const battlerId = t.data[2];
  let gainedExp = s16v(t.data[1]);
  if (IsDoubleBattle() || monId !== gBattlerPartyIndexes[battlerId]) {
    const mon = playerMon(monId);
    const species = GetMonData(mon, C.MON_DATA_SPECIES);
    const level = GetMonData(mon, C.MON_DATA_LEVEL);
    let currExp = GetMonData(mon, C.MON_DATA_EXP);
    const nextLvlExp = expTable(species)[level + 1];
    if (currExp + gainedExp >= nextLvlExp) {
      SetMonData(mon, C.MON_DATA_EXP, nextLvlExp);
      CalculateMonStats(mon);
      gainedExp -= nextLvlExp - currExp;
      const saved = G.gActiveBattler;
      G.gActiveBattler = battlerId;
      BtlController_EmitTwoReturnValues(BUFFER_B, C.RET_VALUE_LEVELED_UP, gainedExp & 0xffff);
      G.gActiveBattler = saved;
      if (IsDoubleBattle() && (monId === gBattlerPartyIndexes[battlerId] || monId === gBattlerPartyIndexes[battlerId ^ C.BIT_FLANK])) t.func = Task_LaunchLvlUpAnim;
      else t.func = DestroyExpTaskAndCompleteOnInactiveTextPrinter;
    } else {
      currExp += gainedExp;
      SetMonData(mon, C.MON_DATA_EXP, currExp);
      gBattlerControllerFuncs[battlerId] = CompleteOnInactiveTextPrinter2;
      tasks.destroy(taskId);
    }
  } else {
    t.func = Task_PrepareToGiveExpWithExpBar;
  }
}

function Task_PrepareToGiveExpWithExpBar(taskId: number): void {
  const t = tasks.tasks[taskId];
  const mon = playerMon(t.data[0] & 0xff);
  const battlerId = t.data[2];
  const level = GetMonData(mon, C.MON_DATA_LEVEL);
  const species = GetMonData(mon, C.MON_DATA_SPECIES);
  const currLvlExp = expTable(species)[level];
  const exp = GetMonData(mon, C.MON_DATA_EXP) - currLvlExp;
  const expToNextLvl = expTable(species)[level + 1] - currLvlExp;
  SetBattleBarStruct(battlerId, gHealthboxSpriteIds[battlerId], expToNextLvl, exp, -s16v(t.data[1]));
  sound.playSE(C.SE_EXP);
  t.func = Task_GiveExpWithExpBar;
}

function Task_GiveExpWithExpBar(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (t.data[10] < 13) {
    t.data[10]++;
    return;
  }
  const monId = t.data[0] & 0xff;
  let gainedExp = s16v(t.data[1]);
  const battlerId = t.data[2];
  const newExpPoints = MoveBattleBar(battlerId, gHealthboxSpriteIds[battlerId], C.EXP_BAR, 0);
  SetHealthboxSpriteVisible(gHealthboxSpriteIds[battlerId]);
  if (newExpPoints === -1) {
    sound.stopSE(C.SE_EXP);
    const mon = playerMon(monId);
    const level = GetMonData(mon, C.MON_DATA_LEVEL);
    let currExp = GetMonData(mon, C.MON_DATA_EXP);
    const expOnNextLvl = expTable(GetMonData(mon, C.MON_DATA_SPECIES))[level + 1];
    if (currExp + gainedExp >= expOnNextLvl) {
      SetMonData(mon, C.MON_DATA_EXP, expOnNextLvl);
      CalculateMonStats(mon);
      gainedExp -= expOnNextLvl - currExp;
      const saved = G.gActiveBattler;
      G.gActiveBattler = battlerId;
      BtlController_EmitTwoReturnValues(BUFFER_B, C.RET_VALUE_LEVELED_UP, gainedExp & 0xffff);
      G.gActiveBattler = saved;
      t.func = Task_LaunchLvlUpAnim;
    } else {
      currExp += gainedExp;
      SetMonData(mon, C.MON_DATA_EXP, currExp);
      gBattlerControllerFuncs[battlerId] = CompleteOnInactiveTextPrinter2;
      tasks.destroy(taskId);
    }
  }
}

function Task_LaunchLvlUpAnim(taskId: number): void {
  const t = tasks.tasks[taskId];
  let battlerId = t.data[2];
  if (IsDoubleBattle() && (t.data[0] & 0xff) === gBattlerPartyIndexes[battlerId ^ C.BIT_FLANK]) battlerId ^= C.BIT_FLANK;
  InitAndLaunchSpecialAnimation(battlerId, battlerId, battlerId, C.B_ANIM_LVL_UP);
  t.func = Task_UpdateLvlInHealthbox;
}

function Task_UpdateLvlInHealthbox(taskId: number): void {
  const t = tasks.tasks[taskId];
  const battlerId = t.data[2];
  if (!gBattleSpritesDataPtr.healthBoxesData[battlerId].specialAnimActive) {
    const monIndex = t.data[0] & 0xff;
    if (IsDoubleBattle() && monIndex === gBattlerPartyIndexes[battlerId ^ C.BIT_FLANK]) UpdateHealthboxAttribute(gHealthboxSpriteIds[battlerId ^ C.BIT_FLANK], playerMon(monIndex), C.HEALTHBOX_ALL);
    else UpdateHealthboxAttribute(gHealthboxSpriteIds[battlerId], playerMon(monIndex), C.HEALTHBOX_ALL);
    t.func = DestroyExpTaskAndCompleteOnInactiveTextPrinter;
  }
}

function DestroyExpTaskAndCompleteOnInactiveTextPrinter(taskId: number): void {
  gBattlerControllerFuncs[tasks.tasks[taskId].data[2]] = CompleteOnInactiveTextPrinter2;
  tasks.destroy(taskId);
}

function FreeMonSpriteAfterFaintAnim(): void {
  const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
  if (s.y + s.y2 > C.DISPLAY_HEIGHT) {
    FreeOamMatrix(s.oam.matrixNum);
    DestroySprite(s);
    SetHealthboxSpriteInvisible(gHealthboxSpriteIds[G.gActiveBattler]);
    OakOldManBufferExecCompleted();
  }
}

// ---------------------------------------------------------------- Oak's commentary
function darkenMask(): number {
  const st = sis();
  return ((gBitTable[st[1]] | gBitTable[st[3]]) << 16) >>> 0;
}

function PrintOakText_ForPetesSake(): void {
  const st = sis();
  switch (st[0]) {
    case 0:
      if (!gPaletteFade.active) {
        const ids = DoLoadHealthboxPalsForLevelUp(GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT));
        st[1] = ids[0];
        st[3] = ids[1];
        BeginNormalPaletteFade(0xffffff7e, 4, 0, 8, RGB_BLACK);
        st[0]++;
      }
      break;
    case 1:
      if (!gPaletteFade.active) {
        BtlCtrl_DrawVoiceoverMessageFrame();
        st[0]++;
      }
      break;
    case 2:
      BattleStringExpandPlaceholdersToDisplayedString(rom.text("gText_ForPetesSake"));
      BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_OAK_OLD_MAN);
      st[0]++;
      break;
    case 3:
      if (!IsTextPrinterActive(24)) {
        BeginNormalPaletteFade(darkenMask(), 4, 8, 0, RGB_BLACK);
        st[0]++;
      }
      break;
    case 4:
      if (!gPaletteFade.active) {
        BattleStringExpandPlaceholdersToDisplayedString(rom.text("gText_TheTrainerThat"));
        BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_OAK_OLD_MAN);
        st[0]++;
      }
      break;
    case 5:
      if (!IsTextPrinterActive(24)) {
        BeginNormalPaletteFade(darkenMask(), 4, 0, 8, RGB_BLACK);
        st[0]++;
      }
      break;
    case 6:
      if (!gPaletteFade.active) {
        BattleStringExpandPlaceholdersToDisplayedString(rom.text("gText_TryBattling"));
        BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_OAK_OLD_MAN);
        st[0]++;
      }
      break;
    case 7:
      if (!IsTextPrinterActive(24)) {
        BeginNormalPaletteFade(0xffffff7e, 4, 8, 0, RGB_BLACK);
        st[0]++;
      }
      break;
    case 8:
      if (!gPaletteFade.active) {
        DoFreeHealthboxPalsForLevelUp(GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT));
        BtlCtrl_RemoveVoiceoverMessageFrame();
        st[0] = 0;
        OakOldManBufferExecCompleted();
      }
      break;
  }
}

export function PrintOakText_InflictingDamageIsKey(): void {
  PrintOakTextWithMainBgDarkened("gText_InflictingDamageIsKey", 1);
}

function PrintOakText_LoweringStats(): void {
  PrintOakTextWithMainBgDarkened("gText_LoweringStats", 64);
}

export function PrintOakText_OakNoRunningFromATrainer(): void {
  PrintOakTextWithMainBgDarkened("gText_OakNoRunningFromATrainer", 1);
}

function PrintOakText_WinEarnsPrizeMoney(): void {
  PrintOakTextWithMainBgDarkened("gText_WinEarnsPrizeMoney", 64);
}

export function PrintOakText_HowDisappointing(): void {
  PrintOakTextWithMainBgDarkened("gText_HowDissapointing", 64);
}

function PrintOakTextWithMainBgDarkened(textLabel: string, delay: number): void {
  const st = sis();
  switch (st[0]) {
    case 0:
      if (!IsTextPrinterActive(0)) {
        st[3] = delay;
        st[0]++;
      }
      break;
    case 1:
      // u8 decrement: a delay of 0 behaves as 256.
      st[3] = (st[3] - 1) & 0xff;
      if (st[3] === 0) {
        BeginNormalPaletteFade(0xffffff7e, 4, 0, 8, RGB_BLACK);
        st[0]++;
      }
      break;
    case 2:
      if (!gPaletteFade.active) {
        BtlCtrl_DrawVoiceoverMessageFrame();
        st[0]++;
      }
      break;
    case 3:
      BattleStringExpandPlaceholdersToDisplayedString(rom.text(textLabel));
      BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_OAK_OLD_MAN);
      st[0]++;
      break;
    case 4:
      if (!IsTextPrinterActive(24)) {
        BeginNormalPaletteFade(0xffffff7e, 4, 8, 0, RGB_BLACK);
        st[0]++;
      }
      break;
    case 5:
      if (!gPaletteFade.active) {
        BtlCtrl_RemoveVoiceoverMessageFrame();
        if (GetBattlerSide(G.gActiveBattler) === C.B_SIDE_PLAYER) OakOldManBufferExecCompleted();
        else OpponentBufferExecCompleted();
        gBattleCommunication[C.MSG_DISPLAY] = 0;
        st[0] = 0;
      }
      break;
  }
}

function PrintOakText_KeepAnEyeOnHP(): void {
  const st = sis();
  switch (st[0]) {
    case 0:
      if (!gPaletteFade.active) {
        const ids = DoLoadHealthboxPalsForLevelUp(G.gActiveBattler);
        st[1] = ids[0];
        st[3] = ids[1];
        BeginNormalPaletteFade(0xffffff7e, 4, 0, 8, RGB_BLACK);
        st[0]++;
      }
      break;
    case 1:
      if (!gPaletteFade.active) {
        BeginNormalPaletteFade(darkenMask(), 4, 8, 0, RGB_BLACK);
        st[0]++;
      }
      break;
    case 2:
      if (!gPaletteFade.active) {
        BtlCtrl_DrawVoiceoverMessageFrame();
        st[0]++;
      }
      break;
    case 3:
      BattleStringExpandPlaceholdersToDisplayedString(rom.text("gText_KeepAnEyeOnHP"));
      BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_OAK_OLD_MAN);
      st[0]++;
      break;
    case 4:
      if (!IsTextPrinterActive(24)) {
        BeginNormalPaletteFade(darkenMask(), 4, 0, 8, RGB_BLACK);
        st[0]++;
      }
      break;
    case 5:
      if (!gPaletteFade.active) {
        BeginNormalPaletteFade(0xffffff7e, 4, 8, 0, RGB_BLACK);
        st[0]++;
      }
      break;
    case 6:
      if (!gPaletteFade.active) {
        BtlCtrl_RemoveVoiceoverMessageFrame();
        BtlController_EmitOneReturnValue(BUFFER_B, varGet(C.VAR_ITEM_ID));
        OakOldManBufferExecCompleted();
        st[0] = 0;
      }
      break;
  }
}

function CompleteOnHealthbarDone(): void {
  const b = G.gActiveBattler;
  const hpValue = MoveBattleBar(b, gHealthboxSpriteIds[b], C.HEALTH_BAR, 0);
  SetHealthboxSpriteVisible(gHealthboxSpriteIds[b]);
  if (hpValue !== -1) {
    UpdateHpTextInHealthbox(gHealthboxSpriteIds[b], hpValue, C.HP_CURRENT);
  } else {
    HandleLowHpMusicChange(playerMon(gBattlerPartyIndexes[b]), b);
    OakOldManBufferExecCompleted();
  }
}

function CompleteOnInactiveTextPrinter2(): void {
  if (!IsTextPrinterActive(0)) OakOldManBufferExecCompleted();
}

function DoHitAnimBlinkSpriteEffect(): void {
  const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
  if (s.data[1] === 32) {
    s.data[1] = 0;
    s.invisible = false;
    G.gDoingBattleAnim = false;
    OakOldManBufferExecCompleted();
  } else {
    if (s.data[1] % 4 === 0) s.invisible = !s.invisible;
    s.data[1]++;
  }
}

function DoSwitchOutAnimation(): void {
  if (!gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].specialAnimActive) {
    const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
    FreeSpriteOamMatrix(s);
    DestroySprite(s);
    SetHealthboxSpriteInvisible(gHealthboxSpriteIds[G.gActiveBattler]);
    OakOldManBufferExecCompleted();
  }
}

function CompleteOnFinishedBattleAnimation(): void {
  if (!gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].animFromTableActive) OakOldManBufferExecCompleted();
}

// ---------------------------------------------------------------- buffer command handlers
// These OakOldManHandle* routines in battle_controller_oak_old_man.c each
// acknowledge their controller command and return without changing state.
function OakOldManHandleSetRawMonData(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleGetRawMonData(): void { PlayerHandleGetRawMonData(); }
function OakOldManHandleLoadMonSprite(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleSwitchInAnim(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleTrainerSlideBack(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandlePaletteFade(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandlePause(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleUnknownYesNoBox(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleCmd23(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleStatusIconUpdate(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleStatusAnimation(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleStatusXor(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleDataTransfer(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleDMA3Transfer(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandlePlayBGM(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleCmd32(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleTwoReturnValues(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleChosenMonReturnValue(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleOneReturnValue(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleOneReturnValue_Duplicate(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleCmd37(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleCmd38(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleCmd39(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleCmd40(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleCmd42(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleHidePartyStatusSummary(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleSpriteInvisibility(): void { OakOldManBufferExecCompleted(); }
function OakOldManHandleResetActionMoveSelection(): void { OakOldManBufferExecCompleted(); }

function OakOldManHandleGetMonData(): void {
  const [data, size] = HandleGetMonData(playerMon);
  BtlController_EmitDataTransfer(BUFFER_B, size, data);
  OakOldManBufferExecCompleted();
}

function OakOldManHandleSetMonData(): void {
  HandleSetMonData(playerMon);
  OakOldManBufferExecCompleted();
}

function OakOldManHandleReturnMonToBall(): void {
  const b = G.gActiveBattler;
  if (gBattleBufferA[b][1] === 0) {
    InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_SWITCH_OUT_PLAYER_MON);
    gBattlerControllerFuncs[b] = DoSwitchOutAnimation;
  } else {
    const s = gSprites[gBattlerSpriteIds[b]];
    FreeSpriteOamMatrix(s);
    DestroySprite(s);
    SetHealthboxSpriteInvisible(gHealthboxSpriteIds[b]);
    OakOldManBufferExecCompleted();
  }
}

function createBackPicSprite(): void {
  const b = G.gActiveBattler;
  const pic = G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE ? save.playerGender : C.TRAINER_BACK_PIC_OLD_MAN;
  DecompressTrainerBackPalette(pic, b);
  SetMultiuseSpriteTemplateToTrainerBack(pic, GetBattlerPosition(b));
  gBattlerSpriteIds[b] = CreateSprite(gMultiuseSpriteTemplate(), 80, (8 - gTrainerBackPicCoords(pic).size) * 4 + 80, 30);
  gSprites[gBattlerSpriteIds[b]].oam.paletteNum = b;
}

function OakOldManHandleDrawTrainerPic(): void {
  createBackPicSprite();
  const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
  s.x2 = C.DISPLAY_WIDTH;
  s.data[0] = -2;
  s.callback = SpriteCB_TrainerSlideIn;
  gBattlerControllerFuncs[G.gActiveBattler] = CompleteOnBattlerSpriteCallbackDummy;
}

function OakOldManHandleTrainerSlide(): void {
  createBackPicSprite();
  const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
  s.x2 = -96;
  s.data[0] = 2;
  s.callback = SpriteCB_TrainerSlideIn;
  gBattlerControllerFuncs[G.gActiveBattler] = CompleteOnBattlerSpriteCallbackDummy;
}

function OakOldManHandleFaintAnimation(): void {
  const b = G.gActiveBattler;
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  if (hb.animationState === 0) {
    if (gBattleSpritesDataPtr.battlerData[b].behindSubstitute) InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_SUBSTITUTE_TO_MON);
    hb.animationState++;
  } else if (!hb.specialAnimActive) {
    hb.animationState = 0;
    HandleLowHpMusicChange(playerMon(gBattlerPartyIndexes[b]), b);
    PlaySE12WithPanning(C.SE_FAINT, C.SOUND_PAN_ATTACKER);
    const s = gSprites[gBattlerSpriteIds[b]];
    s.data[1] = 0;
    s.data[2] = 5;
    s.callback = SpriteCB_FaintSlideAnim;
    gBattlerControllerFuncs[b] = FreeMonSpriteAfterFaintAnim;
  }
}

function launchBallThrow(caseId: number): void {
  gBattleSpritesDataPtr.animationData.ballThrowCaseId = caseId;
  G.gDoingBattleAnim = true;
  InitAndLaunchSpecialAnimation(G.gActiveBattler, G.gActiveBattler, GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT), C.B_ANIM_BALL_THROW_WITH_TRAINER);
  gBattlerControllerFuncs[G.gActiveBattler] = CompleteOnSpecialAnimDone;
}

function OakOldManHandleMoveAnimation(): void {
  const b = G.gActiveBattler;
  const buf = gBattleBufferA[b];
  const move = buf[1] | (buf[2] << 8);
  animState.gAnimMoveTurn = buf[3];
  animState.gAnimMovePower = buf[4] | (buf[5] << 8);
  animState.gAnimMoveDmg = buf[6] | (buf[7] << 8) | (buf[8] << 16) | (buf[9] << 24);
  animState.gAnimFriendship = buf[10];
  animState.gWeatherMoveAnim = buf[12] | (buf[13] << 8);
  animState.gAnimDisableStructPtr = new DisableStruct(buf.subarray(16, 16 + DisableStruct.SIZE));
  gTransformedPersonalities[b] = animState.gAnimDisableStructPtr.transformedMonPersonality;
  if (IsMoveWithoutAnimation(move, animState.gAnimMoveTurn)) {
    OakOldManBufferExecCompleted();
  } else {
    gBattleSpritesDataPtr.healthBoxesData[b].animationState = 0;
    gBattlerControllerFuncs[b] = OakOldManDoMoveAnimation;
  }
}

function OakOldManDoMoveAnimation(): void {
  const b = G.gActiveBattler;
  const move = gBattleBufferA[b][1] | (gBattleBufferA[b][2] << 8);
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  const bd = gBattleSpritesDataPtr.battlerData[b];
  switch (hb.animationState) {
    case 0:
      if (bd.behindSubstitute) InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_SUBSTITUTE_TO_MON);
      hb.animationState = 1;
      break;
    case 1:
      if (!hb.specialAnimActive) {
        SetBattlerSpriteAffineMode(C.ST_OAM_AFFINE_OFF);
        DoMoveAnim(move);
        hb.animationState = 2;
      }
      break;
    case 2:
      animState.gAnimScriptCallback();
      if (!animState.gAnimScriptActive) {
        SetBattlerSpriteAffineMode(C.ST_OAM_AFFINE_NORMAL);
        if (bd.behindSubstitute) InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_MON_TO_SUBSTITUTE);
        hb.animationState = 3;
      }
      break;
    case 3:
      if (!hb.specialAnimActive) {
        CopyAllBattleSpritesInvisibilities();
        TrySetBehindSubstituteSpriteBit(b, move);
        hb.animationState = 0;
        OakOldManBufferExecCompleted();
      }
      break;
  }
}

function OakOldManHandlePrintString(): void {
  const b = G.gActiveBattler;
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  const stringId = gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8);
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_OLD_MAN_TUTORIAL && stringId === 1) {
    OakOldManBufferExecCompleted();
    return;
  }
  BufferStringBattle(stringId);
  if (BattleStringShouldBeColored(stringId)) BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG | C.B_TEXT_FLAG_NPC_CONTEXT_FONT);
  else BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE) {
    switch (stringId) {
      case C.STRINGID_DEFENDERSSTATFELL:
        if (!BtlCtrl_OakOldMan_TestState2Flag(FIRST_BATTLE_MSG_FLAG_STAT_CHG)) {
          BtlCtrl_OakOldMan_SetState2Flag(FIRST_BATTLE_MSG_FLAG_STAT_CHG);
          gBattlerControllerFuncs[b] = PrintOakText_LoweringStats;
          return;
        }
        break;
      case C.STRINGID_PLAYERGOTMONEY:
        gBattlerControllerFuncs[b] = PrintOakText_WinEarnsPrizeMoney;
        return;
      case C.STRINGID_TRAINER1WINTEXT:
        gBattlerControllerFuncs[b] = PrintOakText_HowDisappointing;
        return;
      case C.STRINGID_DONTLEAVEBIRCH:
        gBattlerControllerFuncs[b] = PrintOakText_OakNoRunningFromATrainer;
        return;
    }
  }
  gBattlerControllerFuncs[b] = CompleteOnInactiveTextPrinter;
}

function OakOldManHandlePrintSelectionString(): void {
  if (GetBattlerSide(G.gActiveBattler) === C.B_SIDE_PLAYER) OakOldManHandlePrintString();
  else OakOldManBufferExecCompleted();
}

function HandleChooseActionAfterDma3(): void {
  if (!IsDma3ManagerBusyWithBgCopy()) {
    G.gBattle_BG0_X = 0;
    G.gBattle_BG0_Y = 160;
    gBattlerControllerFuncs[G.gActiveBattler] = G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE ? HandleInputChooseAction : SimulateInputChooseAction;
  }
}

function OakOldManHandleChooseAction(): void {
  const b = G.gActiveBattler;
  gBattlerControllerFuncs[b] = HandleChooseActionAfterDma3;
  BattlePutTextOnWindow(rom.text("gText_EmptyString3"), C.B_WIN_MSG);
  BattlePutTextOnWindow(rom.text("gText_BattleMenu"), C.B_WIN_ACTION_MENU);
  for (let i = 0; i < 4; i++) ActionSelectionDestroyCursorAt(i);
  ActionSelectionCreateCursorAt(gActionSelectionCursor[b], 0);
  BattleStringExpandPlaceholdersToDisplayedString(rom.text(G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE ? "gText_WhatWillPkmnDo" : "gText_WhatWillOldManDo"));
  BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_ACTION_PROMPT);
}

function OakHandleChooseMove_WaitDma3(): void {
  if (!IsDma3ManagerBusyWithBgCopy()) {
    G.gBattle_BG0_X = 0;
    G.gBattle_BG0_Y = 320;
    gBattlerControllerFuncs[G.gActiveBattler] = OakOldManHandleInputChooseMove;
  }
}

function OakOldManHandleChooseMove(): void {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE) {
    InitMoveSelectionsVarsAndStrings();
    gBattlerControllerFuncs[G.gActiveBattler] = OakHandleChooseMove_WaitDma3;
    return;
  }
  const st = sis();
  switch (st[1]) {
    case 0:
      InitMoveSelectionsVarsAndStrings();
      st[1]++;
      st[3] = 80;
    // fall through
    case 1:
      if (--st[3] === 0) {
        sound.playSE(C.SE_SELECT);
        BtlController_EmitTwoReturnValues(BUFFER_B, 10, 0x100);
        OakOldManBufferExecCompleted();
      }
      break;
  }
}

function OakOldManHandleChooseItem(): void {
  const b = G.gActiveBattler;
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0x10, RGB_BLACK);
  gBattlerControllerFuncs[b] = OpenBagAndChooseItem;
  G.gBattlerInMenuId = b;
  for (let i = 0; i < 3; i++) gBattlePartyCurrentOrder[i] = gBattleBufferA[b][i + 1];
}

function TaskDummy(_taskId: number): void {}

function OakOldManHandleChoosePokemon(): void {
  const b = G.gActiveBattler;
  gBattleControllerData[b] = tasks.create(TaskDummy, 0xff);
  tasks.tasks[gBattleControllerData[b]].data[0] = gBattleBufferA[b][1] & 0xf;
  gBattleStruct.battlerPreventingSwitchout = gBattleBufferA[b][1] >> 4;
  gBattleStruct.playerPartyIdx = gBattleBufferA[b][2];
  gBattleStruct.abilityPreventingSwitchout = gBattleBufferA[b][3];
  for (let i = 0; i < 3; i++) gBattlePartyCurrentOrder[i] = gBattleBufferA[b][4 + i];
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0x10, RGB_BLACK);
  gBattlerControllerFuncs[b] = OpenPartyMenuToChooseMon;
  G.gBattlerInMenuId = b;
}

function OakOldManHandleHealthBarUpdate(): void {
  const b = G.gActiveBattler;
  LoadBattleBarGfx(0);
  const hpVal = s16v(gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8));
  const mon = playerMon(gBattlerPartyIndexes[b]);
  const maxHP = GetMonData(mon, C.MON_DATA_MAX_HP);
  if (hpVal !== C.INSTANT_HP_BAR_DROP) {
    SetBattleBarStruct(b, gHealthboxSpriteIds[b], maxHP, GetMonData(mon, C.MON_DATA_HP), hpVal);
  } else {
    SetBattleBarStruct(b, gHealthboxSpriteIds[b], maxHP, 0, hpVal);
    UpdateHpTextInHealthbox(gHealthboxSpriteIds[b], 0, C.HP_CURRENT);
  }
  gBattlerControllerFuncs[b] = CompleteOnHealthbarDone;
}

function OakOldManHandleExpUpdate(): void {
  const b = G.gActiveBattler;
  const monId = gBattleBufferA[b][1];
  if (GetMonData(playerMon(monId), C.MON_DATA_LEVEL) >= C.MAX_LEVEL) {
    OakOldManBufferExecCompleted();
  } else {
    LoadBattleBarGfx(1);
    const taskId = tasks.create(Task_GiveExpToMon, 10);
    const t = tasks.tasks[taskId];
    t.data[0] = monId;
    t.data[1] = s16v(gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8));
    t.data[2] = b;
    gBattlerControllerFuncs[b] = OakOldManDummy;
  }
}

function OakOldManHandleHitAnimation(): void {
  const b = G.gActiveBattler;
  const s = gSprites[gBattlerSpriteIds[b]];
  if (s.invisible) {
    OakOldManBufferExecCompleted();
  } else {
    G.gDoingBattleAnim = true;
    s.data[1] = 0;
    DoHitAnimHealthboxEffect(b);
    gBattlerControllerFuncs[b] = DoHitAnimBlinkSpriteEffect;
  }
}

function OakOldManHandlePlaySE(): void {
  sound.playSE(gBattleBufferA[G.gActiveBattler][1] | (gBattleBufferA[G.gActiveBattler][2] << 8));
  OakOldManBufferExecCompleted();
}

function OakOldManHandlePlayFanfare(): void {
  sound.playFanfare(gBattleBufferA[G.gActiveBattler][1] | (gBattleBufferA[G.gActiveBattler][2] << 8));
  OakOldManBufferExecCompleted();
}

function OakOldManHandleFaintingCry(): void {
  sound.PlayCry_Normal(GetMonData(playerMon(gBattlerPartyIndexes[G.gActiveBattler]), C.MON_DATA_SPECIES), 25);
  OakOldManBufferExecCompleted();
}

function OakOldManHandleIntroSlide(): void {
  HandleIntroSlide(gBattleBufferA[G.gActiveBattler][1]);
  G.gIntroSlideFlags |= 1;
  OakOldManBufferExecCompleted();
}

function OakOldManHandleIntroTrainerBallThrow(): void {
  const b = G.gActiveBattler;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE) {
    const s = gSprites[gBattlerSpriteIds[b]];
    SetSpritePrimaryCoordsFromSecondaryCoords(s);
    s.data[0] = 50;
    s.data[2] = -40;
    s.data[4] = s.y;
    s.callback = StartAnimLinearTranslation;
    s.data[5] = b;
    StoreSpriteCallbackInData6(s, SpriteCB_FreePlayerSpriteLoadMonSprite);
    StartSpriteAnim(s, 1);
    const paletteNum = AllocSpritePalette(0xd6f8);
    LoadCompressedPalette(trainerBackPicPalette(save.playerGender), OBJ_PLTT_ID(paletteNum), PLTT_SIZE_4BPP);
    s.oam.paletteNum = paletteNum;
    const taskId = tasks.create(Task_StartSendOutAnim, 5);
    tasks.tasks[taskId].data[0] = b;
    if (gBattleSpritesDataPtr.healthBoxesData[b].partyStatusSummaryShown) tasks.tasks[gBattlerStatusSummaryTaskId[b]].func = Task_HidePartyStatusSummary;
    gBattleSpritesDataPtr.animationData.introAnimActive = 1;
    gBattlerControllerFuncs[b] = BattleControllerDummy;
  } else {
    if (gBattleSpritesDataPtr.healthBoxesData[b].partyStatusSummaryShown) tasks.tasks[gBattlerStatusSummaryTaskId[b]].func = Task_HidePartyStatusSummary;
    OakOldManBufferExecCompleted();
  }
}

function StartSendOutAnim(battlerId: number): void {
  gBattleSpritesDataPtr.battlerData[battlerId].transformSpecies = C.SPECIES_NONE;
  gBattlerPartyIndexes[battlerId] = gBattleBufferA[battlerId][1];
  const species = GetMonData(playerMon(gBattlerPartyIndexes[battlerId]), C.MON_DATA_SPECIES);
  gBattleControllerData[battlerId] = CreateInvisibleSprite(SpriteCB_WaitForBattlerBallReleaseAnim);
  SetMultiuseSpriteTemplateToPokemon(species, GetBattlerPosition(battlerId));
  gBattlerSpriteIds[battlerId] = CreateSprite(gMultiuseSpriteTemplate(), GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_X_2),
    GetBattlerSpriteDefault_Y(battlerId), GetBattlerSpriteSubpriority(battlerId));
  const s = gSprites[gBattlerSpriteIds[battlerId]];
  gSprites[gBattleControllerData[battlerId]].data[1] = gBattlerSpriteIds[battlerId];
  s.data[0] = battlerId;
  s.data[2] = species;
  s.oam.paletteNum = battlerId;
  StartSpriteAnim(s, gBattleMonForms[battlerId]);
  s.invisible = true;
  s.callback = SpriteCallbackDummy;
  gSprites[gBattleControllerData[battlerId]].data[0] = DoPokeballSendOutAnimation(0, C.POKEBALL_PLAYER_SENDOUT);
}

function Task_StartSendOutAnim(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (t.data[1] < 31) {
    t.data[1]++;
    return;
  }
  const saved = G.gActiveBattler;
  const b = (G.gActiveBattler = t.data[0]);
  gBattleBufferA[b][1] = gBattlerPartyIndexes[b];
  StartSendOutAnim(b);
  gBattlerControllerFuncs[b] = Intro_TryShinyAnimShowHealthbox;
  G.gActiveBattler = saved;
  tasks.destroy(taskId);
}

function OakOldManHandleDrawPartyStatusSummary(): void {
  const b = G.gActiveBattler;
  if (gBattleBufferA[b][1] !== 0 && GetBattlerSide(b) === C.B_SIDE_PLAYER) {
    OakOldManBufferExecCompleted();
  } else {
    gBattleSpritesDataPtr.healthBoxesData[b].partyStatusSummaryShown = 1;
    gBattlerStatusSummaryTaskId[b] = CreatePartyStatusSummarySprites(b, decodeHpAndStatus(gBattleBufferA[b], 4), gBattleBufferA[b][1], gBattleBufferA[b][2]);
    OakOldManBufferExecCompleted();
  }
}

function OakOldManHandleEndBounceEffect(): void {
  EndBounceEffect(G.gActiveBattler, BOUNCE_HEALTHBOX);
  EndBounceEffect(G.gActiveBattler, BOUNCE_MON);
  OakOldManBufferExecCompleted();
}

function OakOldManHandleBattleAnimation(): void {
  const b = G.gActiveBattler;
  const animationId = gBattleBufferA[b][1];
  const argument = gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8);
  if (TryHandleLaunchBattleTableAnimation(b, b, b, animationId, argument)) OakOldManBufferExecCompleted();
  else gBattlerControllerFuncs[b] = CompleteOnFinishedBattleAnimation;
}

function OakOldManHandleLinkStandbyMsg(): void {
  const b = G.gActiveBattler;
  if (gBattleBufferA[b][1] === 0 || gBattleBufferA[b][1] === 1) {
    EndBounceEffect(b, BOUNCE_HEALTHBOX);
    EndBounceEffect(b, BOUNCE_MON);
  }
  OakOldManBufferExecCompleted();
}

function OakOldManHandleCmd55(): void {
  G.gBattleOutcome = gBattleBufferA[G.gActiveBattler][1];
  sound.fadeOutBGM(5);
  BeginFastPaletteFade(3);
  OakOldManBufferExecCompleted();
}

function OakOldManCmdEnd(): void {}

export function BtlCtrl_OakOldMan_TestState2Flag(mask: number): boolean {
  return (sis()[2] & mask) !== 0;
}

export function BtlCtrl_OakOldMan_SetState2Flag(mask: number): void {
  sis()[2] |= mask;
}

export function BtlCtrl_DrawVoiceoverMessageFrame(): void {
  const width = 0x1a;
  const pal = 7;
  const F = (tile: number, x: number, y: number, w: number, h: number) => FillBgTilemapBufferRect(0, tile, x, y, w, h, pal);
  F(0x30, 0, 0xe, 1, 1);
  F(0x31, 1, 0xe, 1, 1);
  F(0x32, 2, 0xe, width, 1);
  F(0x33, 0x1c, 0xe, 1, 1);
  F(0x34, 0x1d, 0xe, 1, 1);
  F(0x35, 0, 0xf, 1, 1);
  F(0x36, 1, 0xf, 1, 1);
  F(0x38, 0x1c, 0xf, 1, 1);
  F(0x39, 0x1d, 0xf, 1, 1);
  F(0x3a, 0, 0x10, 1, 1);
  F(0x3b, 1, 0x10, 1, 1);
  F(0x3c, 0x1c, 0x10, 1, 1);
  F(0x3d, 0x1d, 0x10, 1, 1);
  F(BG_TILE_V_FLIP(0x3a), 0, 0x11, 1, 1);
  F(BG_TILE_V_FLIP(0x3b), 1, 0x11, 1, 1);
  F(BG_TILE_V_FLIP(0x3c), 0x1c, 0x11, 1, 1);
  F(BG_TILE_V_FLIP(0x3d), 0x1d, 0x11, 1, 1);
  F(BG_TILE_V_FLIP(0x35), 0, 0x12, 1, 1);
  F(BG_TILE_V_FLIP(0x36), 1, 0x12, 1, 1);
  F(BG_TILE_V_FLIP(0x38), 0x1c, 0x12, 1, 1);
  F(BG_TILE_V_FLIP(0x39), 0x1d, 0x12, 1, 1);
  F(BG_TILE_V_FLIP(0x30), 0, 0x13, 1, 1);
  F(BG_TILE_V_FLIP(0x31), 1, 0x13, 1, 1);
  F(BG_TILE_V_FLIP(0x32), 2, 0x13, width, 1);
  F(BG_TILE_V_FLIP(0x33), 0x1c, 0x13, 1, 1);
  F(BG_TILE_V_FLIP(0x34), 0x1d, 0x13, 1, 1);
}

export function BtlCtrl_RemoveVoiceoverMessageFrame(): void {
  const width = 0x1a;
  const height = 4;
  const F = (tile: number, x: number, y: number, w: number, h: number) => FillBgTilemapBufferRect(0, tile, x, y, w, h, 0);
  F(3, 0, 0xe, 1, 1);
  F(4, 1, 0xe, 1, 1);
  F(5, 2, 0xe, width, 1);
  F(6, 0x1c, 0xe, 1, 1);
  F(7, 0x1d, 0xe, 1, 1);
  F(8, 0, 0xf, 1, height);
  F(9, 1, 0xf, 1, height);
  F(0xa, 2, 0xf, width, height);
  F(0xb, 0x1c, 0xf, 1, height);
  F(0xc, 0x1d, 0xf, 1, height);
  F(0xd, 0, 0x13, 1, 1);
  F(0xe, 1, 0x13, 1, 1);
  F(0xf, 2, 0x13, width, 1);
  F(0x10, 0x1c, 0x13, 1, 1);
  F(0x11, 0x1d, 0x13, 1, 1);
}


const sOakOldManBufferCommands: Record<number, () => void> = {
  [C.CONTROLLER_GETMONDATA]: OakOldManHandleGetMonData,
  [C.CONTROLLER_GETRAWMONDATA]: OakOldManHandleGetRawMonData,
  [C.CONTROLLER_SETMONDATA]: OakOldManHandleSetMonData,
  [C.CONTROLLER_SETRAWMONDATA]: OakOldManHandleSetRawMonData,
  [C.CONTROLLER_LOADMONSPRITE]: OakOldManHandleLoadMonSprite,
  [C.CONTROLLER_SWITCHINANIM]: OakOldManHandleSwitchInAnim,
  [C.CONTROLLER_RETURNMONTOBALL]: OakOldManHandleReturnMonToBall,
  [C.CONTROLLER_DRAWTRAINERPIC]: OakOldManHandleDrawTrainerPic,
  [C.CONTROLLER_TRAINERSLIDE]: OakOldManHandleTrainerSlide,
  [C.CONTROLLER_TRAINERSLIDEBACK]: OakOldManHandleTrainerSlideBack,
  [C.CONTROLLER_FAINTANIMATION]: OakOldManHandleFaintAnimation,
  [C.CONTROLLER_PALETTEFADE]: OakOldManHandlePaletteFade,
  [C.CONTROLLER_SUCCESSBALLTHROWANIM]: OakOldManHandleSuccessBallThrowAnim,
  [C.CONTROLLER_BALLTHROWANIM]: OakOldManHandleBallThrowAnim,
  [C.CONTROLLER_PAUSE]: OakOldManHandlePause,
  [C.CONTROLLER_MOVEANIMATION]: OakOldManHandleMoveAnimation,
  [C.CONTROLLER_PRINTSTRING]: OakOldManHandlePrintString,
  [C.CONTROLLER_PRINTSTRINGPLAYERONLY]: OakOldManHandlePrintSelectionString,
  [C.CONTROLLER_CHOOSEACTION]: OakOldManHandleChooseAction,
  [C.CONTROLLER_UNKNOWNYESNOBOX]: OakOldManHandleUnknownYesNoBox,
  [C.CONTROLLER_CHOOSEMOVE]: OakOldManHandleChooseMove,
  [C.CONTROLLER_OPENBAG]: OakOldManHandleChooseItem,
  [C.CONTROLLER_CHOOSEPOKEMON]: OakOldManHandleChoosePokemon,
  [C.CONTROLLER_23]: OakOldManHandleCmd23,
  [C.CONTROLLER_HEALTHBARUPDATE]: OakOldManHandleHealthBarUpdate,
  [C.CONTROLLER_EXPUPDATE]: OakOldManHandleExpUpdate,
  [C.CONTROLLER_STATUSICONUPDATE]: OakOldManHandleStatusIconUpdate,
  [C.CONTROLLER_STATUSANIMATION]: OakOldManHandleStatusAnimation,
  [C.CONTROLLER_STATUSXOR]: OakOldManHandleStatusXor,
  [C.CONTROLLER_DATATRANSFER]: OakOldManHandleDataTransfer,
  [C.CONTROLLER_DMA3TRANSFER]: OakOldManHandleDMA3Transfer,
  [C.CONTROLLER_PLAYBGM]: OakOldManHandlePlayBGM,
  [C.CONTROLLER_32]: OakOldManHandleCmd32,
  [C.CONTROLLER_TWORETURNVALUES]: OakOldManHandleTwoReturnValues,
  [C.CONTROLLER_CHOSENMONRETURNVALUE]: OakOldManHandleChosenMonReturnValue,
  [C.CONTROLLER_ONERETURNVALUE]: OakOldManHandleOneReturnValue,
  [C.CONTROLLER_ONERETURNVALUE_DUPLICATE]: OakOldManHandleOneReturnValue_Duplicate,
  [C.CONTROLLER_CLEARUNKVAR]: OakOldManHandleCmd37,
  [C.CONTROLLER_SETUNKVAR]: OakOldManHandleCmd38,
  [C.CONTROLLER_CLEARUNKFLAG]: OakOldManHandleCmd39,
  [C.CONTROLLER_TOGGLEUNKFLAG]: OakOldManHandleCmd40,
  [C.CONTROLLER_HITANIMATION]: OakOldManHandleHitAnimation,
  [C.CONTROLLER_CANTSWITCH]: OakOldManHandleCmd42,
  [C.CONTROLLER_PLAYSE]: OakOldManHandlePlaySE,
  [C.CONTROLLER_PLAYFANFARE]: OakOldManHandlePlayFanfare,
  [C.CONTROLLER_FAINTINGCRY]: OakOldManHandleFaintingCry,
  [C.CONTROLLER_INTROSLIDE]: OakOldManHandleIntroSlide,
  [C.CONTROLLER_INTROTRAINERBALLTHROW]: OakOldManHandleIntroTrainerBallThrow,
  [C.CONTROLLER_DRAWPARTYSTATUSSUMMARY]: OakOldManHandleDrawPartyStatusSummary,
  [C.CONTROLLER_HIDEPARTYSTATUSSUMMARY]: OakOldManHandleHidePartyStatusSummary,
  [C.CONTROLLER_ENDBOUNCE]: OakOldManHandleEndBounceEffect,
  [C.CONTROLLER_SPRITEINVISIBILITY]: OakOldManHandleSpriteInvisibility,
  [C.CONTROLLER_BATTLEANIMATION]: OakOldManHandleBattleAnimation,
  [C.CONTROLLER_LINKSTANDBYMSG]: OakOldManHandleLinkStandbyMsg,
  [C.CONTROLLER_RESETACTIONMOVESELECTION]: OakOldManHandleResetActionMoveSelection,
  [C.CONTROLLER_ENDLINKBATTLE]: OakOldManHandleCmd55,
  [C.CONTROLLER_TERMINATOR_NOP]: OakOldManCmdEnd,
};
