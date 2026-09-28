// battle_controller_player.c

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, JOY_NEW, START_BUTTON, JOY_HELD, L_BUTTON, R_BUTTON, SELECT_BUTTON } from "../gba/input";
import { tasks } from "../gba/tasks";
import { b64, rom } from "../rom";
import { save, varGet } from "../save";
import { G, gActionSelectionCursor, gBattleBufferA, gBattleBufferB, gBattleControllerData, gBattleMonForms, gBattleMons, gBattlePartyCurrentOrder, gBattlerControllerFuncs, gBattlerPartyIndexes, gBattlerSpriteIds, gBattlerStatusSummaryTaskId, gBattleSpritesDataPtr, gBattleStruct, gBitTable, gDisableStructs, gDisplayedStringBattle, gHealthboxSpriteIds, gMoveSelectionCursor, gTransformedPersonalities } from "./globals";
import { gBattleMoves } from "./macros";
import { CountAliveMonsInBattle, GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide, GetDefaultMoveTarget } from "./util";
import { BattleControllerDummy, BtlController_EmitChosenMonReturnValue, BtlController_EmitDataTransfer, BtlController_EmitOneReturnValue, BtlController_EmitOneReturnValue_Duplicate, BtlController_EmitTwoReturnValues, BUFFER_B, gUnusedControllerStruct, type ChooseMoveStruct, decodeChooseMoveStruct, decodeHpAndStatus, encodeChooseMoveStruct } from "./controllers";
import { BattleMainCB2, BOUNCE_HEALTHBOX, BOUNCE_MON, DoBounceEffect, EndBounceEffect, SpriteCB_FaintSlideAnim, SpriteCB_HideAsMoveTarget, SpriteCB_ShowAsMoveTarget } from "./main_init";
import { AllocSpritePalette, CreateInvisibleSprite, CreateSprite, DestroySprite, FreeOamMatrix, FreeSpriteOamMatrix, FreeSpritePaletteByTag, FreeSpriteTilesByTag, GetSpritePaletteTagByPaletteNum, gSprites, Sprite, SpriteCallbackDummy, StartSpriteAnim } from "../hw/sprite";
import { CalculateMonStats, GetMonData, playerMon, SetMonData } from "../pokemon/mon";
import { addBagItem as AddBagItem } from "../pokemon/items";
import { BattleGfxSfxDummy3, BattleLoadPlayerMonSpriteGfx, BattleStopLowHpSound, ClearTemporarySpeciesSpriteData, CopyAllBattleSpritesInvisibilities, CopyBattleSpriteInvisibility, DecompressTrainerBackPalette, DoHitAnimHealthboxEffect, gTrainerBackPicCoords, HandleLowHpMusicChange, InitAndLaunchChosenStatusAnimation, InitAndLaunchSpecialAnimation, IsBattlerSpritePresent, IsBattleSEPlaying, IsMoveWithoutAnimation, PlayBGM, PlaySE12WithPanning, SetBattlerSpriteAffineMode, SpriteCB_WaitForBattlerBallReleaseAnim, trainerBackPicPalette, TryHandleLaunchBattleTableAnimation, TrySetBehindSubstituteSpriteBit, TryShinyAnimation } from "./gfx_sfx_util";
import { BattlePutTextOnWindow, BattleStringExpandPlaceholdersToDisplayedString, BattleStringShouldBeColored, BufferStringBattle, SetPpNumbersPaletteInMoveSelection } from "./message";
import { BeginFastPaletteFade, BeginNormalPaletteFade, gPaletteFade, LoadCompressedPalette, OBJ_PLTT_ID, PALETTES_ALL, PLTT_SIZE_4BPP, ResetPaletteFadeControl, RGB_BLACK, RGB_WHITE } from "../hw/palette";
import { CB2_BagMenuFromBattle, OpenPartyMenuInTutorialBattle, partyMenuResult } from "./ext";
import { CopyBgTilemapBufferToVram, CopyToBgTilemapBufferRect_ChangePalette, IsDma3ManagerBusyWithBgCopy } from "../hw/bg";
import { animState, CreateLevelUpVerticalSpritesTask, DoMoveAnim, GetBattlerSpriteBGPriorityRank, GetBattlerSpriteCoord, GetBattlerSpriteDefault_Y, GetBattlerSpriteSubpriority, gMultiuseSpriteTemplate, IsBattlerSpriteVisible, LevelUpVerticalSpritesTaskIsRunning, MoveBattlerSpriteToBG, PlayerThrowBall_StartAnimLinearTranslation, ResetBattleAnimBg, SetMultiuseSpriteTemplateToPokemon, SetMultiuseSpriteTemplateToTrainerBack, SetSpritePrimaryCoordsFromSecondaryCoords, SpriteCB_TrainerSlideIn, StartAnimLinearTranslation, StoreSpriteCallbackInData6 } from "./anim";
import { CreatePartyStatusSummarySprites, LoadBattleBarGfx, MoveBattleBar, SetBattleBarStruct, SetHealthboxSpriteInvisible, SetHealthboxSpriteVisible, StartHealthboxSlideIn, SwapHpBarsWithHpText, Task_HidePartyStatusSummary, UpdateHealthboxAttribute, UpdateHpTextInHealthbox } from "./interface";
import { DisableStruct } from "../generated/structs";
import { DoPokeballSendOutAnimation } from "./pokeball";
import { FreeAllWindowBuffers } from "../hw/window";
import { HandleGetMonData, HandleSetMonData } from "./mon_transfer";
import { HandleIntroSlide } from "./intro";
import { IsMonGettingExpSentOut } from "./cmds/part3";
import { IsTextPrinterActive } from "../hw/text";
import { OakOldManHandleInputChooseMove } from "./controller_oak_old_man";
import { ReshowBattleScreenAfterMenu } from "./reshow";
import { intToDecimal, STR_CONV_MODE_RIGHT_ALIGN } from "../gba/charmap";
import { gMain, SetMainCallback2 } from "../hw/runtime";
import { battleHost } from "./host";

const sTargetIdentities = [C.B_POSITION_PLAYER_LEFT, C.B_POSITION_PLAYER_RIGHT, C.B_POSITION_OPPONENT_RIGHT, C.B_POSITION_OPPONENT_LEFT];

export function SetControllerToPlayer(): void {
  gBattlerControllerFuncs[G.gActiveBattler] = PlayerBufferRunCommand;
  G.gDoingBattleAnim = false;
}

export function PlayerBufferExecCompleted(): void {
  gBattlerControllerFuncs[G.gActiveBattler] = PlayerBufferRunCommand;
  G.gBattleControllerExecFlags = (G.gBattleControllerExecFlags & ~gBitTable[G.gActiveBattler]) >>> 0;
}

function PlayerBufferRunCommand(): void {
  if (G.gBattleControllerExecFlags & gBitTable[G.gActiveBattler]) {
    const cmd = gBattleBufferA[G.gActiveBattler][0];
    const fn = sPlayerBufferCommands[cmd];
    if (fn) fn();
    else PlayerBufferExecCompleted();
  }
}

function CompleteOnBattlerSpritePosX_0(): void {
  if (gSprites[gBattlerSpriteIds[G.gActiveBattler]].x2 === 0) PlayerBufferExecCompleted();
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
    PlayerBufferExecCompleted();
  } else if (JOY_NEW(DPAD_LEFT)) {
    actionCursorMove(1, true);
  } else if (JOY_NEW(DPAD_RIGHT)) {
    actionCursorMove(1, false);
  } else if (JOY_NEW(DPAD_UP)) {
    actionCursorMove(2, true);
  } else if (JOY_NEW(DPAD_DOWN)) {
    actionCursorMove(2, false);
  } else if (JOY_NEW(B_BUTTON)) {
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && GetBattlerPosition(b) === C.B_POSITION_PLAYER_RIGHT
      && !(G.gAbsentBattlerFlags & gBitTable[GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT)]) && !(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI)) {
      if (gBattleBufferA[b][1] === C.B_ACTION_USE_ITEM) {
        if (itemId <= C.ITEM_PREMIER_BALL) AddBagItem(itemId, 1);
        else return;
      }
      sound.playSE(C.SE_SELECT);
      BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_CANCEL_PARTNER, 0);
      PlayerBufferExecCompleted();
    }
  } else if (JOY_NEW(START_BUTTON)) {
    SwapHpBarsWithHpText();
  }
}

function targetCycle(step: number): void {
  const b = G.gActiveBattler;
  let i: number;
  do {
    const currSelIdentity = GetBattlerPosition(G.gMultiUsePlayerCursor);
    for (i = 0; i < C.MAX_BATTLERS_COUNT; i++) if (currSelIdentity === sTargetIdentities[i]) break;
    do {
      if (step < 0) {
        if (--i < 0) i = C.MAX_BATTLERS_COUNT;
      } else if (++i > 3) {
        i = 0;
      }
      // sTargetIdentities[4] is out of range in C (reads the next byte, 0x48); treat as no battler.
      G.gMultiUsePlayerCursor = i < 4 ? GetBattlerAtPosition(sTargetIdentities[i]) : G.gBattlersCount;
    } while (G.gMultiUsePlayerCursor === G.gBattlersCount);
    i = 0;
    switch (GetBattlerPosition(G.gMultiUsePlayerCursor)) {
      case C.B_POSITION_PLAYER_LEFT:
      case C.B_POSITION_PLAYER_RIGHT:
        if (b !== G.gMultiUsePlayerCursor) i++;
        else if (gBattleMoves(GetMonData(playerMon(gBattlerPartyIndexes[b]), C.MON_DATA_MOVE1 + gMoveSelectionCursor[b])).target & C.MOVE_TARGET_USER_OR_SELECTED) i++;
        break;
      case C.B_POSITION_OPPONENT_LEFT:
      case C.B_POSITION_OPPONENT_RIGHT:
        i++;
        break;
    }
    if (G.gAbsentBattlerFlags & gBitTable[G.gMultiUsePlayerCursor]) i = 0;
  } while (i === 0);
}

function HandleInputChooseTarget(): void {
  const b = G.gActiveBattler;
  DoBounceEffect(G.gMultiUsePlayerCursor, BOUNCE_HEALTHBOX, 15, 1);
  for (let i = 0; i < G.gBattlersCount; i++) if (i !== G.gMultiUsePlayerCursor) EndBounceEffect(i, BOUNCE_HEALTHBOX);
  if (JOY_NEW(A_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    gSprites[gBattlerSpriteIds[G.gMultiUsePlayerCursor]].callback = SpriteCB_HideAsMoveTarget;
    BtlController_EmitTwoReturnValues(BUFFER_B, 10, gMoveSelectionCursor[b] | (G.gMultiUsePlayerCursor << 8));
    EndBounceEffect(G.gMultiUsePlayerCursor, BOUNCE_HEALTHBOX);
    PlayerBufferExecCompleted();
  } else if (JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    gSprites[gBattlerSpriteIds[G.gMultiUsePlayerCursor]].callback = SpriteCB_HideAsMoveTarget;
    gBattlerControllerFuncs[b] = HandleInputChooseMove;
    DoBounceEffect(b, BOUNCE_HEALTHBOX, 7, 1);
    DoBounceEffect(b, BOUNCE_MON, 7, 1);
    EndBounceEffect(G.gMultiUsePlayerCursor, BOUNCE_HEALTHBOX);
  } else if (JOY_NEW(DPAD_LEFT | DPAD_UP)) {
    sound.playSE(C.SE_SELECT);
    gSprites[gBattlerSpriteIds[G.gMultiUsePlayerCursor]].callback = SpriteCB_HideAsMoveTarget;
    targetCycle(-1);
    gSprites[gBattlerSpriteIds[G.gMultiUsePlayerCursor]].callback = SpriteCB_ShowAsMoveTarget;
  } else if (JOY_NEW(DPAD_RIGHT | DPAD_DOWN)) {
    sound.playSE(C.SE_SELECT);
    gSprites[gBattlerSpriteIds[G.gMultiUsePlayerCursor]].callback = SpriteCB_HideAsMoveTarget;
    targetCycle(1);
    gSprites[gBattlerSpriteIds[G.gMultiUsePlayerCursor]].callback = SpriteCB_ShowAsMoveTarget;
  }
}

function moveCursorTo(mask: number, want: boolean, limited: boolean): void {
  const b = G.gActiveBattler;
  const cur = gMoveSelectionCursor[b];
  if (((cur & mask) !== 0) === want && (!limited || (cur ^ mask) < G.gNumberOfMovesToChoose)) {
    MoveSelectionDestroyCursorAt(cur);
    gMoveSelectionCursor[b] ^= mask;
    sound.playSE(C.SE_SELECT);
    MoveSelectionCreateCursorAt(gMoveSelectionCursor[b], 0);
    MoveSelectionDisplayPpNumber();
    MoveSelectionDisplayMoveType();
    BeginNormalPaletteFade(0xf0000, 0, 0, 0, RGB_WHITE);
  }
}

export function HandleInputChooseMove(): void {
  const b = G.gActiveBattler;
  let canSelectTarget = false;
  const moveInfo = decodeChooseMoveStruct(gBattleBufferA[b], 4);
  PreviewDeterminativeMoveTargets();
  if (JOY_NEW(A_BUTTON)) {
    let moveTarget: number;
    sound.playSE(C.SE_SELECT);
    const mv = moveInfo.moves[gMoveSelectionCursor[b]];
    if (mv === C.MOVE_CURSE) moveTarget = moveInfo.monType1 !== C.TYPE_GHOST && moveInfo.monType2 !== C.TYPE_GHOST ? C.MOVE_TARGET_USER : C.MOVE_TARGET_SELECTED;
    else moveTarget = gBattleMoves(mv).target;
    if (moveTarget & C.MOVE_TARGET_USER) G.gMultiUsePlayerCursor = b;
    else G.gMultiUsePlayerCursor = GetBattlerAtPosition((GetBattlerPosition(b) & C.BIT_SIDE) ^ C.BIT_SIDE);
    if (!gBattleBufferA[b][1]) {
      if (moveTarget & C.MOVE_TARGET_USER_OR_SELECTED && !gBattleBufferA[b][2]) canSelectTarget = true;
    } else {
      if (!(moveTarget & (C.MOVE_TARGET_RANDOM | C.MOVE_TARGET_BOTH | C.MOVE_TARGET_DEPENDS | C.MOVE_TARGET_FOES_AND_ALLY | C.MOVE_TARGET_OPPONENTS_FIELD | C.MOVE_TARGET_USER))) canSelectTarget = true;
      if (moveInfo.currentPp[gMoveSelectionCursor[b]] === 0) {
        canSelectTarget = false;
      } else if (!(moveTarget & (C.MOVE_TARGET_USER | C.MOVE_TARGET_USER_OR_SELECTED)) && CountAliveMonsInBattle(C.BATTLE_ALIVE_EXCEPT_ACTIVE) <= 1) {
        G.gMultiUsePlayerCursor = GetDefaultMoveTarget(b);
        canSelectTarget = false;
      }
    }
    ResetPaletteFadeControl();
    BeginNormalPaletteFade(0xf0000, 0, 0, 0, RGB_WHITE);
    if (!canSelectTarget) {
      BtlController_EmitTwoReturnValues(BUFFER_B, 10, gMoveSelectionCursor[b] | (G.gMultiUsePlayerCursor << 8));
      PlayerBufferExecCompleted();
    } else {
      gBattlerControllerFuncs[b] = HandleInputChooseTarget;
      if (moveTarget & (C.MOVE_TARGET_USER | C.MOVE_TARGET_USER_OR_SELECTED)) G.gMultiUsePlayerCursor = b;
      else if (G.gAbsentBattlerFlags & gBitTable[GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT)]) G.gMultiUsePlayerCursor = GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT);
      else G.gMultiUsePlayerCursor = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
      gSprites[gBattlerSpriteIds[G.gMultiUsePlayerCursor]].callback = SpriteCB_ShowAsMoveTarget;
    }
  } else if (JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    BtlController_EmitTwoReturnValues(BUFFER_B, 10, 0xffff);
    PlayerBufferExecCompleted();
    ResetPaletteFadeControl();
    BeginNormalPaletteFade(0xf0000, 0, 0, 0, RGB_WHITE);
  } else if (JOY_NEW(DPAD_LEFT)) {
    moveCursorTo(1, true, false);
  } else if (JOY_NEW(DPAD_RIGHT)) {
    moveCursorTo(1, false, true);
  } else if (JOY_NEW(DPAD_UP)) {
    moveCursorTo(2, true, false);
  } else if (JOY_NEW(DPAD_DOWN)) {
    moveCursorTo(2, false, true);
  } else if (JOY_NEW(SELECT_BUTTON)) {
    if (G.gNumberOfMovesToChoose > 1 && !(G.gBattleTypeFlags & C.BATTLE_TYPE_LINK)) {
      MoveSelectionCreateCursorAt(gMoveSelectionCursor[b], 29);
      G.gMultiUsePlayerCursor = gMoveSelectionCursor[b] !== 0 ? 0 : gMoveSelectionCursor[b] + 1;
      MoveSelectionCreateCursorAt(G.gMultiUsePlayerCursor, 27);
      BattlePutTextOnWindow(rom.text("gText_BattleSwitchWhich"), C.B_WIN_SWITCH_PROMPT);
      gBattlerControllerFuncs[b] = HandleMoveSwitching;
    }
  }
}

function swap<T>(arr: T[], a: number, c: number): void {
  const t = arr[a];
  arr[a] = arr[c];
  arr[c] = t;
}

function switchCursorMove(mask: number, want: boolean, limited: boolean): void {
  const b = G.gActiveBattler;
  const cur = G.gMultiUsePlayerCursor;
  if (((cur & mask) !== 0) === want && (!limited || (cur ^ mask) < G.gNumberOfMovesToChoose)) {
    if (cur === gMoveSelectionCursor[b]) MoveSelectionCreateCursorAt(gMoveSelectionCursor[b], 29);
    else MoveSelectionDestroyCursorAt(cur);
    G.gMultiUsePlayerCursor ^= mask;
    sound.playSE(C.SE_SELECT);
    MoveSelectionCreateCursorAt(G.gMultiUsePlayerCursor, G.gMultiUsePlayerCursor === gMoveSelectionCursor[b] ? 0 : 27);
  }
}

function HandleMoveSwitching(): void {
  const b = G.gActiveBattler;
  if (JOY_NEW(A_BUTTON | SELECT_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    const sel = gMoveSelectionCursor[b];
    const other = G.gMultiUsePlayerCursor;
    if (sel !== other) {
      const moveInfo = decodeChooseMoveStruct(gBattleBufferA[b], 4);
      swap(moveInfo.moves, sel, other);
      swap(moveInfo.currentPp, sel, other);
      swap(moveInfo.maxPp, sel, other);
      gBattleBufferA[b].set(encodeChooseMoveStruct(moveInfo), 4);
      const d = gDisableStructs[b];
      if (d.mimickedMoves & gBitTable[sel]) {
        d.mimickedMoves &= ~gBitTable[sel];
        d.mimickedMoves |= gBitTable[other];
      }
      MoveSelectionDisplayMoveNames();
      const bonuses = (total: number) => [0, 1, 2, 3].map((i) => (total >> (i * 2)) & 3);
      const pack = (arr: number[]) => arr.reduce((acc, v, i) => acc | (v << (i * 2)), 0);
      const per = bonuses(gBattleMons[b].ppBonuses);
      swap(per, sel, other);
      gBattleMons[b].ppBonuses = pack(per);
      for (let i = 0; i < 4; i++) {
        gBattleMons[b].moves[i] = moveInfo.moves[i];
        gBattleMons[b].pp[i] = moveInfo.currentPp[i];
      }
      if (!(gBattleMons[b].status2 & C.STATUS2_TRANSFORMED)) {
        const mon = playerMon(gBattlerPartyIndexes[b]);
        const moves = [0, 1, 2, 3].map((i) => GetMonData(mon, C.MON_DATA_MOVE1 + i));
        const pps = [0, 1, 2, 3].map((i) => GetMonData(mon, C.MON_DATA_PP1 + i));
        const mper = bonuses(GetMonData(mon, C.MON_DATA_PP_BONUSES));
        swap(moves, sel, other);
        swap(pps, sel, other);
        swap(mper, sel, other);
        for (let i = 0; i < 4; i++) {
          SetMonData(mon, C.MON_DATA_MOVE1 + i, moves[i]);
          SetMonData(mon, C.MON_DATA_PP1 + i, pps[i]);
        }
        SetMonData(mon, C.MON_DATA_PP_BONUSES, pack(mper));
      }
    }
    gBattlerControllerFuncs[b] = G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE ? OakOldManHandleInputChooseMove : HandleInputChooseMove;
    gMoveSelectionCursor[b] = G.gMultiUsePlayerCursor;
    MoveSelectionCreateCursorAt(gMoveSelectionCursor[b], 0);
    MoveSelectionDisplayPpString();
    MoveSelectionDisplayPpNumber();
    MoveSelectionDisplayMoveType();
  }
  if (JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    MoveSelectionDestroyCursorAt(G.gMultiUsePlayerCursor);
    MoveSelectionCreateCursorAt(gMoveSelectionCursor[b], 0);
    gBattlerControllerFuncs[b] = G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE ? OakOldManHandleInputChooseMove : HandleInputChooseMove;
    MoveSelectionDisplayPpString();
    MoveSelectionDisplayPpNumber();
    MoveSelectionDisplayMoveType();
  }
  if (JOY_NEW(DPAD_LEFT)) switchCursorMove(1, true, false);
  if (JOY_NEW(DPAD_RIGHT)) switchCursorMove(1, false, true);
  if (JOY_NEW(DPAD_UP)) switchCursorMove(2, true, false);
  if (JOY_NEW(DPAD_DOWN)) switchCursorMove(2, false, true);
}

export function SetBattleEndCallbacks(): void {
  if (!gPaletteFade.active) {
    sound.stopSE(C.SE_LOW_HEALTH);
    gMain.inBattle = false;
    gMain.callback1 = battleHost.preBattleCallback1;
    battleHost.finish(G.gBattleOutcome);
  }
}

function CompleteOnBattlerSpriteCallbackDummy(): void {
  if (gSprites[gBattlerSpriteIds[G.gActiveBattler]].callback === SpriteCallbackDummy) PlayerBufferExecCompleted();
}

function FreeTrainerSpriteAfterSlide(): void {
  const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
  if (s.callback === SpriteCallbackDummy) {
    BattleGfxSfxDummy3(save.playerGender);
    FreeSpriteOamMatrix(s);
    DestroySprite(s);
    PlayerBufferExecCompleted();
  }
}

function Intro_DelayAndEnd(): void {
  const hb = gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler];
  hb.introEndDelay = (hb.introEndDelay - 1) & 0xff;
  if (hb.introEndDelay === 0xff) {
    hb.introEndDelay = 0;
    PlayerBufferExecCompleted();
  }
}

function IsDoubleBattle(): boolean {
  return (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) !== 0;
}

function Intro_WaitForShinyAnimAndHealthbox(): void {
  const b = G.gActiveBattler;
  let v = false;
  if (!IsDoubleBattle() || G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI) {
    if (gSprites[gHealthboxSpriteIds[b]].callback === SpriteCallbackDummy) v = true;
  } else if (gSprites[gHealthboxSpriteIds[b]].callback === SpriteCallbackDummy && gSprites[gHealthboxSpriteIds[b ^ C.BIT_FLANK]].callback === SpriteCallbackDummy) {
    v = true;
  }
  if (sound.isCryPlaying()) v = false;
  const hb = gBattleSpritesDataPtr.healthBoxesData;
  if (v && hb[b].finishedShinyMonAnim && hb[b ^ C.BIT_FLANK].finishedShinyMonAnim) {
    hb[b].triedShinyMonAnim = 0;
    hb[b].finishedShinyMonAnim = 0;
    hb[b ^ C.BIT_FLANK].triedShinyMonAnim = 0;
    hb[b ^ C.BIT_FLANK].finishedShinyMonAnim = 0;
    FreeSpriteTilesByTag(C.ANIM_TAG_GOLD_STARS);
    FreeSpritePaletteByTag(C.ANIM_TAG_GOLD_STARS);
    sound.setBgmVolume(256);
    HandleLowHpMusicChange(playerMon(gBattlerPartyIndexes[b]), b);
    if (IsDoubleBattle()) HandleLowHpMusicChange(playerMon(gBattlerPartyIndexes[b ^ C.BIT_FLANK]), b ^ C.BIT_FLANK);
    hb[b].introEndDelay = 3;
    gBattlerControllerFuncs[b] = Intro_DelayAndEnd;
  }
}

function Intro_TryShinyAnimShowHealthbox(): void {
  const b = G.gActiveBattler;
  const f = b ^ C.BIT_FLANK;
  const hb = gBattleSpritesDataPtr.healthBoxesData;
  if (!hb[b].ballAnimActive && !hb[f].ballAnimActive) {
    if (!hb[b].triedShinyMonAnim) TryShinyAnimation(b, playerMon(gBattlerPartyIndexes[b]));
    if (!hb[f].triedShinyMonAnim) TryShinyAnimation(f, playerMon(gBattlerPartyIndexes[f]));
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

function SwitchIn_CleanShinyAnimShowSubstitute(): void {
  const b = G.gActiveBattler;
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  if (gSprites[gHealthboxSpriteIds[b]].callback === SpriteCallbackDummy && hb.finishedShinyMonAnim) {
    hb.triedShinyMonAnim = 0;
    hb.finishedShinyMonAnim = 0;
    FreeSpriteTilesByTag(C.ANIM_TAG_GOLD_STARS);
    FreeSpritePaletteByTag(C.ANIM_TAG_GOLD_STARS);
    if (gBattleSpritesDataPtr.battlerData[b].behindSubstitute) InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_MON_TO_SUBSTITUTE);
    gBattlerControllerFuncs[b] = SwitchIn_HandleSoundAndEnd;
  }
}

function SwitchIn_HandleSoundAndEnd(): void {
  const b = G.gActiveBattler;
  if (!gBattleSpritesDataPtr.healthBoxesData[b].specialAnimActive && !sound.isCryPlaying()) {
    sound.setBgmVolume(0x100);
    HandleLowHpMusicChange(playerMon(gBattlerPartyIndexes[b]), b);
    PlayerBufferExecCompleted();
  }
}

function SwitchIn_TryShinyAnimShowHealthbox(): void {
  const b = G.gActiveBattler;
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  if (!hb.triedShinyMonAnim && !hb.ballAnimActive) TryShinyAnimation(b, playerMon(gBattlerPartyIndexes[b]));
  if (gSprites[gBattleControllerData[b]].callback === SpriteCallbackDummy && !hb.ballAnimActive) {
    DestroySprite(gSprites[gBattleControllerData[b]]);
    UpdateHealthboxAttribute(gHealthboxSpriteIds[b], playerMon(gBattlerPartyIndexes[b]), C.HEALTHBOX_ALL);
    StartHealthboxSlideIn(b);
    SetHealthboxSpriteVisible(gHealthboxSpriteIds[b]);
    CopyBattleSpriteInvisibility(b);
    gBattlerControllerFuncs[b] = SwitchIn_CleanShinyAnimShowSubstitute;
  }
}

export function Task_PlayerController_RestoreBgmAfterCry(taskId: number): void {
  if (!sound.isCryPlaying()) {
    sound.setBgmVolume(0x100);
    tasks.destroy(taskId);
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
    PlayerBufferExecCompleted();
  }
}

export function CompleteOnInactiveTextPrinter(): void {
  if (!IsTextPrinterActive(0)) PlayerBufferExecCompleted();
}

const expTable = (species: number) => rom.expTables[rom.species[species].growthRate];
const s16v = (v: number) => (v << 16) >> 16;

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
      gBattlerControllerFuncs[battlerId] = CompleteOnInactiveTextPrinter;
      tasks.destroy(taskId);
    }
  } else {
    t.func = Task_PrepareToGiveExpWithExpBar;
  }
}

function Task_PrepareToGiveExpWithExpBar(taskId: number): void {
  const t = tasks.tasks[taskId];
  const monIndex = t.data[0] & 0xff;
  const gainedExp = s16v(t.data[1]);
  const battlerId = t.data[2];
  const mon = playerMon(monIndex);
  const level = GetMonData(mon, C.MON_DATA_LEVEL);
  const species = GetMonData(mon, C.MON_DATA_SPECIES);
  let exp = GetMonData(mon, C.MON_DATA_EXP);
  const currLvlExp = expTable(species)[level];
  exp -= currLvlExp;
  const expToNextLvl = expTable(species)[level + 1] - currLvlExp;
  SetBattleBarStruct(battlerId, gHealthboxSpriteIds[battlerId], expToNextLvl, exp, -gainedExp);
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
    const species = GetMonData(mon, C.MON_DATA_SPECIES);
    const expOnNextLvl = expTable(species)[level + 1];
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
      gBattlerControllerFuncs[battlerId] = CompleteOnInactiveTextPrinter;
      tasks.destroy(taskId);
    }
  }
}

function Task_LaunchLvlUpAnim(taskId: number): void {
  const t = tasks.tasks[taskId];
  let battlerId = t.data[2];
  const monIndex = t.data[0] & 0xff;
  if (IsDoubleBattle() && monIndex === gBattlerPartyIndexes[battlerId ^ C.BIT_FLANK]) battlerId ^= C.BIT_FLANK;
  InitAndLaunchSpecialAnimation(battlerId, battlerId, battlerId, C.B_ANIM_LVL_UP);
  t.func = Task_UpdateLvlInHealthbox;
}

function Task_UpdateLvlInHealthbox(taskId: number): void {
  const t = tasks.tasks[taskId];
  const battlerId = t.data[2];
  if (!gBattleSpritesDataPtr.healthBoxesData[battlerId].specialAnimActive) {
    const monIndex = t.data[0] & 0xff;
    if (IsDoubleBattle() && monIndex === gBattlerPartyIndexes[battlerId ^ C.BIT_FLANK]) {
      UpdateHealthboxAttribute(gHealthboxSpriteIds[battlerId ^ C.BIT_FLANK], playerMon(monIndex), C.HEALTHBOX_ALL);
    } else {
      UpdateHealthboxAttribute(gHealthboxSpriteIds[battlerId], playerMon(monIndex), C.HEALTHBOX_ALL);
    }
    t.func = DestroyExpTaskAndCompleteOnInactiveTextPrinter;
  }
}

function DestroyExpTaskAndCompleteOnInactiveTextPrinter(taskId: number): void {
  const t = tasks.tasks[taskId];
  const battlerId = t.data[2];
  if (IsBattlerSpriteVisible(battlerId)) {
    t.func = Task_CreateLevelUpVerticalStripes;
    t.data[15] = 0;
  } else {
    gBattlerControllerFuncs[battlerId] = CompleteOnInactiveTextPrinter;
    tasks.destroy(taskId);
  }
}

function Task_CreateLevelUpVerticalStripes(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const battlerId = data[2];
  const bgPriorityRank = GetBattlerSpriteBGPriorityRank(battlerId);
  const isOnBg2 = (bgPriorityRank ^ 1) !== 0;
  const sprite = gSprites[gBattlerSpriteIds[battlerId]];
  switch (data[15]) {
    case 0:
      if (!IsTextPrinterActive(0)) {
        if (!isOnBg2) {
          data[14] = G.gBattle_BG1_X;
          data[13] = G.gBattle_BG1_Y;
          G.gBattle_BG1_X = (-(sprite.x + sprite.x2) + 32) & 0xffff;
          G.gBattle_BG1_Y = (-(sprite.y + sprite.y2) + 32) & 0xffff;
        } else {
          data[14] = G.gBattle_BG2_X;
          data[13] = G.gBattle_BG2_Y;
          G.gBattle_BG2_X = (-(sprite.x + sprite.x2) + 32) & 0xffff;
          G.gBattle_BG2_Y = (-(sprite.y + sprite.y2) + 32) & 0xffff;
        }
        data[15]++;
      }
      break;
    case 1:
      MoveBattlerSpriteToBG(battlerId, isOnBg2);
      data[15]++;
      break;
    case 2:
      sound.playSE(C.SE_RS_SHOP);
      if (IsMonGettingExpSentOut()) CreateLevelUpVerticalSpritesTask(sprite.x + sprite.x2, sprite.y + sprite.y2, 10000, 10000, 1, 0);
      data[15]++;
      break;
    case 3:
      if (!LevelUpVerticalSpritesTaskIsRunning()) {
        sprite.invisible = false;
        data[15]++;
      }
      break;
    case 5:
      ResetBattleAnimBg(isOnBg2);
      data[15]++;
      break;
    case 4:
      data[15]++;
      break;
    case 6:
      if (!isOnBg2) {
        G.gBattle_BG1_X = data[14];
        G.gBattle_BG1_Y = data[13];
      } else {
        G.gBattle_BG2_X = data[14];
        G.gBattle_BG2_Y = data[13];
      }
      gBattlerControllerFuncs[battlerId] = CompleteOnInactiveTextPrinter;
      tasks.destroy(taskId);
      break;
  }
}

function FreeMonSpriteAfterFaintAnim(): void {
  const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
  if (s.y + s.y2 > C.DISPLAY_HEIGHT) {
    FreeOamMatrix(s.oam.matrixNum);
    DestroySprite(s);
    SetHealthboxSpriteInvisible(gHealthboxSpriteIds[G.gActiveBattler]);
    PlayerBufferExecCompleted();
  }
}

function FreeMonSpriteAfterSwitchOutAnim(): void {
  if (!gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].specialAnimActive) {
    const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
    FreeSpriteOamMatrix(s);
    DestroySprite(s);
    SetHealthboxSpriteInvisible(gHealthboxSpriteIds[G.gActiveBattler]);
    PlayerBufferExecCompleted();
  }
}

function CompleteOnInactiveTextPrinter2(): void {
  if (!IsTextPrinterActive(0)) PlayerBufferExecCompleted();
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
    if ((gBattleBufferA[G.gActiveBattler][1] & 0xf) === 1) PrintLinkStandbyMsg();
    PlayerBufferExecCompleted();
  }
}

function OpenBagAndChooseItem(): void {
  if (!gPaletteFade.active) {
    gBattlerControllerFuncs[G.gActiveBattler] = CompleteWhenChoseItem;
    FreeAllWindowBuffers();
    CB2_BagMenuFromBattle();
  }
}

function CompleteWhenChoseItem(): void {
  if (gMain.callback2 === BattleMainCB2 && !gPaletteFade.active) {
    BtlController_EmitOneReturnValue(BUFFER_B, varGet(C.VAR_ITEM_ID));
    PlayerBufferExecCompleted();
  }
}

function CompleteOnSpecialAnimDone(): void {
  if (!G.gDoingBattleAnim || !gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].specialAnimActive) PlayerBufferExecCompleted();
}

function DoHitAnimBlinkSpriteEffect(): void {
  const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
  if (s.data[1] === 32) {
    s.data[1] = 0;
    s.invisible = false;
    G.gDoingBattleAnim = false;
    PlayerBufferExecCompleted();
  } else {
    if (s.data[1] % 4 === 0) s.invisible = !s.invisible;
    s.data[1]++;
  }
}

function strCopyInto(dst: Uint8Array, offset: number, src: ArrayLike<number>): number {
  let i = 0;
  for (; i < src.length && src[i] !== 0xff; i++) dst[offset + i] = src[i];
  dst[offset + i] = 0xff;
  return offset + i;
}

function MoveSelectionDisplayMoveNames(): void {
  const moveInfo = decodeChooseMoveStruct(gBattleBufferA[G.gActiveBattler], 4);
  G.gNumberOfMovesToChoose = 0;
  for (let i = 0; i < 4; i++) {
    MoveSelectionDestroyCursorAt(i);
    const p = strCopyInto(gDisplayedStringBattle, 0, rom.text("gText_MoveInterfaceDynamicColors"));
    strCopyInto(gDisplayedStringBattle, p, b64(rom.moves[moveInfo.moves[i]].name));
    BattlePutTextOnWindow(gDisplayedStringBattle, i + 3);
    if (moveInfo.moves[i] !== C.MOVE_NONE) G.gNumberOfMovesToChoose++;
  }
}

function MoveSelectionDisplayPpString(): void {
  strCopyInto(gDisplayedStringBattle, 0, rom.text("gText_MoveInterfacePP"));
  BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_PP);
}

function MoveSelectionDisplayPpNumber(): void {
  const b = G.gActiveBattler;
  if (gBattleBufferA[b][2] === 1) return;
  SetPpNumbersPaletteInMoveSelection();
  const moveInfo = decodeChooseMoveStruct(gBattleBufferA[b], 4);
  let p = strCopyInto(gDisplayedStringBattle, 0, intToDecimal(moveInfo.currentPp[gMoveSelectionCursor[b]], STR_CONV_MODE_RIGHT_ALIGN, 2));
  gDisplayedStringBattle[p++] = C.CHAR_SLASH;
  strCopyInto(gDisplayedStringBattle, p, intToDecimal(moveInfo.maxPp[gMoveSelectionCursor[b]], STR_CONV_MODE_RIGHT_ALIGN, 2));
  BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_PP_REMAINING);
}

function MoveSelectionDisplayMoveType(): void {
  const b = G.gActiveBattler;
  const moveInfo = decodeChooseMoveStruct(gBattleBufferA[b], 4);
  let p = strCopyInto(gDisplayedStringBattle, 0, rom.text("gText_MoveInterfaceType"));
  gDisplayedStringBattle[p++] = C.EXT_CTRL_CODE_BEGIN;
  gDisplayedStringBattle[p++] = 6;
  gDisplayedStringBattle[p++] = 1;
  p = strCopyInto(gDisplayedStringBattle, p, rom.text("gText_MoveInterfaceDynamicColors"));
  strCopyInto(gDisplayedStringBattle, p, b64(rom.typeNames[gBattleMoves(moveInfo.moves[gMoveSelectionCursor[b]]).type]));
  BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MOVE_TYPE);
}

export function MoveSelectionCreateCursorAt(cursorPosition: number, arg1: number): void {
  CopyToBgTilemapBufferRect_ChangePalette(0, [arg1 + 1, arg1 + 2], 9 * (cursorPosition & 1) + 1, 55 + (cursorPosition & 2), 1, 2, 0x11);
  CopyBgTilemapBufferToVram(0);
}

export function MoveSelectionDestroyCursorAt(cursorPosition: number): void {
  CopyToBgTilemapBufferRect_ChangePalette(0, [32, 32], 9 * (cursorPosition & 1) + 1, 55 + (cursorPosition & 2), 1, 2, 0x11);
  CopyBgTilemapBufferToVram(0);
}

export function ActionSelectionCreateCursorAt(cursorPosition: number, _arg1: number): void {
  CopyToBgTilemapBufferRect_ChangePalette(0, [1, 2], 7 * (cursorPosition & 1) + 16, 35 + (cursorPosition & 2), 1, 2, 0x11);
  CopyBgTilemapBufferToVram(0);
}

export function ActionSelectionDestroyCursorAt(cursorPosition: number): void {
  CopyToBgTilemapBufferRect_ChangePalette(0, [32, 32], 7 * (cursorPosition & 1) + 16, 35 + (cursorPosition & 2), 1, 2, 0x11);
  CopyBgTilemapBufferToVram(0);
}

export function SetCB2ToReshowScreenAfterMenu(): void {
  SetMainCallback2(ReshowBattleScreenAfterMenu);
}

function CompleteOnFinishedStatusAnimation(): void {
  if (!gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].statusAnimActive) PlayerBufferExecCompleted();
}

function CompleteOnFinishedBattleAnimation(): void {
  if (!gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].animFromTableActive) PlayerBufferExecCompleted();
}

function PrintLinkStandbyMsg(): void {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) {
    G.gBattle_BG0_X = 0;
    G.gBattle_BG0_Y = 0;
    BattlePutTextOnWindow(rom.text("gText_LinkStandby"), C.B_WIN_MSG);
  }
}

function PlayerHandleGetMonData(): void {
  const [data, size] = HandleGetMonData(playerMon);
  BtlController_EmitDataTransfer(BUFFER_B, size, data);
  PlayerBufferExecCompleted();
}

function PlayerHandleGetRawMonData(): void {
  // Raw struct Pokemon memory access is not meaningful for the TS Pokemon objects (unused by the game).
  PlayerBufferExecCompleted();
}

function PlayerHandleSetMonData(): void {
  HandleSetMonData(playerMon);
  HandleLowHpMusicChange(playerMon(gBattlerPartyIndexes[G.gActiveBattler]), G.gActiveBattler);
  PlayerBufferExecCompleted();
}

function PlayerHandleSetRawMonData(): void {
  PlayerBufferExecCompleted();
}

function PlayerHandleLoadMonSprite(): void {
  const b = G.gActiveBattler;
  BattleLoadPlayerMonSpriteGfx(playerMon(gBattlerPartyIndexes[b]), b);
  gSprites[gBattlerSpriteIds[b]].oam.paletteNum = b;
  gBattlerControllerFuncs[b] = CompleteOnBattlerSpritePosX_0;
}

function PlayerHandleSwitchInAnim(): void {
  const b = G.gActiveBattler;
  ClearTemporarySpeciesSpriteData(b, gBattleBufferA[b][2]);
  gBattlerPartyIndexes[b] = gBattleBufferA[b][1];
  BattleLoadPlayerMonSpriteGfx(playerMon(gBattlerPartyIndexes[b]), b);
  gActionSelectionCursor[b] = 0;
  gMoveSelectionCursor[b] = 0;
  StartSendOutAnim(b, gBattleBufferA[b][2] !== 0);
  gBattlerControllerFuncs[b] = SwitchIn_TryShinyAnimShowHealthbox;
}

function StartSendOutAnim(battlerId: number, dontClearSubstituteBit: boolean): void {
  ClearTemporarySpeciesSpriteData(battlerId, dontClearSubstituteBit ? 1 : 0);
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

function PlayerHandleReturnMonToBall(): void {
  const b = G.gActiveBattler;
  if (gBattleBufferA[b][1] === 0) {
    gBattleSpritesDataPtr.healthBoxesData[b].animationState = 0;
    gBattlerControllerFuncs[b] = DoSwitchOutAnimation;
  } else {
    const s = gSprites[gBattlerSpriteIds[b]];
    FreeSpriteOamMatrix(s);
    DestroySprite(s);
    SetHealthboxSpriteInvisible(gHealthboxSpriteIds[b]);
    PlayerBufferExecCompleted();
  }
}

function DoSwitchOutAnimation(): void {
  const b = G.gActiveBattler;
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  switch (hb.animationState) {
    case 0:
      if (gBattleSpritesDataPtr.battlerData[b].behindSubstitute) InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_SUBSTITUTE_TO_MON);
      hb.animationState = 1;
      break;
    case 1:
      if (!hb.specialAnimActive) {
        hb.animationState = 0;
        InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_SWITCH_OUT_PLAYER_MON);
        gBattlerControllerFuncs[b] = FreeMonSpriteAfterSwitchOutAnim;
      }
      break;
  }
}

function trainerBackY(trainerPicId: number): number {
  return (8 - gTrainerBackPicCoords(trainerPicId).size) * 4 + 80;
}

function PlayerHandleDrawTrainerPic(): void {
  const b = G.gActiveBattler;
  let xPos: number;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI) xPos = (GetBattlerPosition(b) & C.BIT_FLANK) !== C.B_FLANK_LEFT ? 90 : 32;
  else xPos = 80;
  const trainerPicId = save.playerGender;
  DecompressTrainerBackPalette(trainerPicId, b);
  SetMultiuseSpriteTemplateToTrainerBack(trainerPicId, GetBattlerPosition(b));
  gBattlerSpriteIds[b] = CreateSprite(gMultiuseSpriteTemplate(), xPos, trainerBackY(trainerPicId), GetBattlerSpriteSubpriority(b));
  const s = gSprites[gBattlerSpriteIds[b]];
  s.oam.paletteNum = b;
  s.x2 = C.DISPLAY_WIDTH;
  s.data[0] = -2;
  s.callback = SpriteCB_TrainerSlideIn;
  gBattlerControllerFuncs[b] = CompleteOnBattlerSpriteCallbackDummy;
}

function PlayerHandleTrainerSlide(): void {
  const b = G.gActiveBattler;
  const trainerPicId = save.playerGender;
  DecompressTrainerBackPalette(trainerPicId, b);
  SetMultiuseSpriteTemplateToTrainerBack(trainerPicId, GetBattlerPosition(b));
  gBattlerSpriteIds[b] = CreateSprite(gMultiuseSpriteTemplate(), 80, trainerBackY(trainerPicId), 30);
  const s = gSprites[gBattlerSpriteIds[b]];
  s.oam.paletteNum = b;
  s.x2 = -96;
  s.data[0] = 2;
  s.callback = SpriteCB_TrainerSlideIn;
  gBattlerControllerFuncs[b] = CompleteOnBattlerSpriteCallbackDummy;
}

function PlayerHandleTrainerSlideBack(): void {
  const b = G.gActiveBattler;
  const s = gSprites[gBattlerSpriteIds[b]];
  SetSpritePrimaryCoordsFromSecondaryCoords(s);
  s.data[0] = 50;
  s.data[2] = -40;
  s.data[4] = s.y;
  s.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(s, SpriteCallbackDummy);
  StartSpriteAnim(s, 1);
  gBattlerControllerFuncs[b] = FreeTrainerSpriteAfterSlide;
}

function PlayerHandleFaintAnimation(): void {
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

function PlayerHandlePaletteFade(): void {
  BeginNormalPaletteFade(PALETTES_ALL, 2, 0, 16, RGB_BLACK);
  PlayerBufferExecCompleted();
}

function PlayerHandleSuccessBallThrowAnim(): void {
  gBattleSpritesDataPtr.animationData.ballThrowCaseId = C.BALL_3_SHAKES_SUCCESS;
  G.gDoingBattleAnim = true;
  InitAndLaunchSpecialAnimation(G.gActiveBattler, G.gActiveBattler, GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT), C.B_ANIM_BALL_THROW);
  gBattlerControllerFuncs[G.gActiveBattler] = CompleteOnSpecialAnimDone;
}

function PlayerHandleBallThrowAnim(): void {
  gBattleSpritesDataPtr.animationData.ballThrowCaseId = gBattleBufferA[G.gActiveBattler][1];
  G.gDoingBattleAnim = true;
  InitAndLaunchSpecialAnimation(G.gActiveBattler, G.gActiveBattler, GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT), C.B_ANIM_BALL_THROW);
  gBattlerControllerFuncs[G.gActiveBattler] = CompleteOnSpecialAnimDone;
}

function PlayerHandlePause(): void {
  PlayerBufferExecCompleted();
}

function PlayerHandleMoveAnimation(): void {
  const b = G.gActiveBattler;
  if (!IsBattleSEPlaying(b)) {
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
      PlayerBufferExecCompleted();
    } else {
      gBattleSpritesDataPtr.healthBoxesData[b].animationState = 0;
      gBattlerControllerFuncs[b] = PlayerDoMoveAnimation;
    }
  }
}

function PlayerDoMoveAnimation(): void {
  const b = G.gActiveBattler;
  const buf = gBattleBufferA[b];
  const move = buf[1] | (buf[2] << 8);
  const multihit = buf[11];
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  const bd = gBattleSpritesDataPtr.battlerData[b];
  switch (hb.animationState) {
    case 0:
      if (bd.behindSubstitute && !bd.flag_x8) {
        bd.flag_x8 = 1;
        InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_SUBSTITUTE_TO_MON);
      }
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
        if (bd.behindSubstitute && multihit < 2) {
          InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_MON_TO_SUBSTITUTE);
          bd.flag_x8 = 0;
        }
        hb.animationState = 3;
      }
      break;
    case 3:
      if (!hb.specialAnimActive) {
        CopyAllBattleSpritesInvisibilities();
        TrySetBehindSubstituteSpriteBit(b, move);
        hb.animationState = 0;
        PlayerBufferExecCompleted();
      }
      break;
  }
}

function PlayerHandlePrintString(): void {
  const b = G.gActiveBattler;
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  const stringId = gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8);
  BufferStringBattle(stringId);
  if (BattleStringShouldBeColored(stringId)) BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG | C.B_TEXT_FLAG_NPC_CONTEXT_FONT);
  else BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
  gBattlerControllerFuncs[b] = CompleteOnInactiveTextPrinter2;
}

function PlayerHandlePrintSelectionString(): void {
  if (GetBattlerSide(G.gActiveBattler) === C.B_SIDE_PLAYER) PlayerHandlePrintString();
  else PlayerBufferExecCompleted();
}

function HandleChooseActionAfterDma3(): void {
  if (!IsDma3ManagerBusyWithBgCopy()) {
    G.gBattle_BG0_X = 0;
    G.gBattle_BG0_Y = 160;
    gBattlerControllerFuncs[G.gActiveBattler] = HandleInputChooseAction;
  }
}

function PlayerHandleChooseAction(): void {
  const b = G.gActiveBattler;
  gBattlerControllerFuncs[b] = HandleChooseActionAfterDma3;
  BattlePutTextOnWindow(rom.text("gText_EmptyString3"), C.B_WIN_MSG);
  BattlePutTextOnWindow(rom.text("gText_BattleMenu"), C.B_WIN_ACTION_MENU);
  for (let i = 0; i < 4; i++) ActionSelectionDestroyCursorAt(i);
  ActionSelectionCreateCursorAt(gActionSelectionCursor[b], 0);
  BattleStringExpandPlaceholdersToDisplayedString(rom.text("gText_WhatWillPkmnDo"));
  BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_ACTION_PROMPT);
}

function PlayerHandleUnknownYesNoBox(): void {}

function HandleChooseMoveAfterDma3(): void {
  if (!IsDma3ManagerBusyWithBgCopy()) {
    G.gBattle_BG0_X = 0;
    G.gBattle_BG0_Y = 320;
    gBattlerControllerFuncs[G.gActiveBattler] = HandleInputChooseMove;
  }
}

function PlayerHandleChooseMove(): void {
  InitMoveSelectionsVarsAndStrings();
  gBattlerControllerFuncs[G.gActiveBattler] = HandleChooseMoveAfterDma3;
}

export function InitMoveSelectionsVarsAndStrings(): void {
  MoveSelectionDisplayMoveNames();
  G.gMultiUsePlayerCursor = 0xff;
  MoveSelectionCreateCursorAt(gMoveSelectionCursor[G.gActiveBattler], 0);
  MoveSelectionDisplayPpString();
  MoveSelectionDisplayPpNumber();
  MoveSelectionDisplayMoveType();
}

function PlayerHandleChooseItem(): void {
  const b = G.gActiveBattler;
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0x10, RGB_BLACK);
  gBattlerControllerFuncs[b] = OpenBagAndChooseItem;
  G.gBattlerInMenuId = b;
  for (let i = 0; i < 3; i++) gBattlePartyCurrentOrder[i] = gBattleBufferA[b][1 + i];
}

function PlayerHandleChoosePokemon(): void {
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

function TaskDummy(_taskId: number): void {}

function PlayerHandleCmd23(): void {
  BattleStopLowHpSound();
  BeginNormalPaletteFade(PALETTES_ALL, 2, 0, 16, RGB_BLACK);
  PlayerBufferExecCompleted();
}

function PlayerHandleHealthBarUpdate(): void {
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

function PlayerHandleExpUpdate(): void {
  const b = G.gActiveBattler;
  const monId = gBattleBufferA[b][1];
  if (GetMonData(playerMon(monId), C.MON_DATA_LEVEL) >= C.MAX_LEVEL) {
    PlayerBufferExecCompleted();
  } else {
    LoadBattleBarGfx(1);
    const expPointsToGive = s16v(gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8));
    const taskId = tasks.create(Task_GiveExpToMon, 10);
    const t = tasks.tasks[taskId];
    t.data[0] = monId;
    t.data[1] = expPointsToGive;
    t.data[2] = b;
    gBattlerControllerFuncs[b] = BattleControllerDummy;
  }
}

function PlayerHandleStatusIconUpdate(): void {
  const b = G.gActiveBattler;
  if (!IsBattleSEPlaying(b)) {
    UpdateHealthboxAttribute(gHealthboxSpriteIds[b], playerMon(gBattlerPartyIndexes[b]), C.HEALTHBOX_STATUS_ICON);
    gBattleSpritesDataPtr.healthBoxesData[b].statusAnimActive = 0;
    gBattlerControllerFuncs[b] = CompleteOnFinishedStatusAnimation;
  }
}

function PlayerHandleStatusAnimation(): void {
  const b = G.gActiveBattler;
  if (!IsBattleSEPlaying(b)) {
    const buf = gBattleBufferA[b];
    InitAndLaunchChosenStatusAnimation(buf[1] !== 0, (buf[2] | (buf[3] << 8) | (buf[4] << 16) | (buf[5] << 24)) >>> 0);
    gBattlerControllerFuncs[b] = CompleteOnFinishedStatusAnimation;
  }
}

function PlayerHandleStatusXor(): void {
  const b = G.gActiveBattler;
  const mon = playerMon(gBattlerPartyIndexes[b]);
  const val = (GetMonData(mon, C.MON_DATA_STATUS) ^ gBattleBufferA[b][1]) & 0xff;
  SetMonData(mon, C.MON_DATA_STATUS, val);
  PlayerBufferExecCompleted();
}

function PlayerHandleDataTransfer(): void { PlayerBufferExecCompleted(); }
function PlayerHandleDMA3Transfer(): void { PlayerBufferExecCompleted(); }

function PlayerHandlePlayBGM(): void {
  PlayBGM(gBattleBufferA[G.gActiveBattler][1] | (gBattleBufferA[G.gActiveBattler][2] << 8));
  PlayerBufferExecCompleted();
}

function PlayerHandleCmd32(): void { PlayerBufferExecCompleted(); }

function PlayerHandleCmd37(): void { gUnusedControllerStruct.unk = 0; PlayerBufferExecCompleted(); }
function PlayerHandleCmd38(): void { gUnusedControllerStruct.unk = gBattleBufferA[G.gActiveBattler][1] & 0x7f; PlayerBufferExecCompleted(); }
function PlayerHandleCmd39(): void { gUnusedControllerStruct.flag = 0; PlayerBufferExecCompleted(); }
function PlayerHandleCmd40(): void { gUnusedControllerStruct.flag = (gUnusedControllerStruct.flag ^ 1) & 1; PlayerBufferExecCompleted(); }
function PlayerHandleCmd42(): void { PlayerBufferExecCompleted(); }

function PlayerHandleTwoReturnValues(): void {
  BtlController_EmitTwoReturnValues(BUFFER_B, 0, 0);
  PlayerBufferExecCompleted();
}

function PlayerHandleChosenMonReturnValue(): void {
  BtlController_EmitChosenMonReturnValue(BUFFER_B, 0, [0, 0, 0]);
  PlayerBufferExecCompleted();
}

function PlayerHandleOneReturnValue(): void {
  BtlController_EmitOneReturnValue(BUFFER_B, 0);
  PlayerBufferExecCompleted();
}

function PlayerHandleOneReturnValue_Duplicate(): void {
  BtlController_EmitOneReturnValue_Duplicate(BUFFER_B, 0);
  PlayerBufferExecCompleted();
}

function PlayerHandleCmdNop(): void { PlayerBufferExecCompleted(); }

function PlayerHandleHitAnimation(): void {
  const b = G.gActiveBattler;
  const s = gSprites[gBattlerSpriteIds[b]];
  if (s.invisible) {
    PlayerBufferExecCompleted();
  } else {
    G.gDoingBattleAnim = true;
    s.data[1] = 0;
    DoHitAnimHealthboxEffect(b);
    gBattlerControllerFuncs[b] = DoHitAnimBlinkSpriteEffect;
  }
}

function PlayerHandlePlaySE(): void {
  const b = G.gActiveBattler;
  const pan = GetBattlerSide(b) === C.B_SIDE_PLAYER ? C.SOUND_PAN_ATTACKER : C.SOUND_PAN_TARGET;
  PlaySE12WithPanning(gBattleBufferA[b][1] | (gBattleBufferA[b][2] << 8), pan);
  PlayerBufferExecCompleted();
}

function PlayerHandlePlayFanfare(): void {
  sound.playFanfare(gBattleBufferA[G.gActiveBattler][1] | (gBattleBufferA[G.gActiveBattler][2] << 8));
  PlayerBufferExecCompleted();
}

function PlayerHandleFaintingCry(): void {
  sound.PlayCry_ByMode(GetMonData(playerMon(gBattlerPartyIndexes[G.gActiveBattler]), C.MON_DATA_SPECIES), -25, C.CRY_MODE_FAINT);
  PlayerBufferExecCompleted();
}

function PlayerHandleIntroSlide(): void {
  HandleIntroSlide(gBattleBufferA[G.gActiveBattler][1]);
  G.gIntroSlideFlags |= 1;
  PlayerBufferExecCompleted();
}

function PlayerHandleIntroTrainerBallThrow(): void {
  const b = G.gActiveBattler;
  const s = gSprites[gBattlerSpriteIds[b]];
  SetSpritePrimaryCoordsFromSecondaryCoords(s);
  s.data[0] = 50;
  s.data[2] = -40;
  s.data[4] = s.y;
  s.callback = PlayerThrowBall_StartAnimLinearTranslation;
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
}

export function SpriteCB_FreePlayerSpriteLoadMonSprite(sprite: Sprite): void {
  const battlerId = sprite.data[5];
  FreeSpriteOamMatrix(sprite);
  FreeSpritePaletteByTag(GetSpritePaletteTagByPaletteNum(sprite.oam.paletteNum));
  DestroySprite(sprite);
  BattleLoadPlayerMonSpriteGfx(playerMon(gBattlerPartyIndexes[battlerId]), battlerId);
  StartSpriteAnim(gSprites[gBattlerSpriteIds[battlerId]], 0);
}

function Task_StartSendOutAnim(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (t.data[1] < 31) {
    t.data[1]++;
    return;
  }
  const saved = G.gActiveBattler;
  G.gActiveBattler = t.data[0];
  const b = G.gActiveBattler;
  gBattleBufferA[b][1] = gBattlerPartyIndexes[b];
  StartSendOutAnim(b, false);
  if (IsDoubleBattle() && !(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI)) {
    const f = b ^ C.BIT_FLANK;
    G.gActiveBattler = f;
    gBattleBufferA[f][1] = gBattlerPartyIndexes[f];
    BattleLoadPlayerMonSpriteGfx(playerMon(gBattlerPartyIndexes[f]), f);
    StartSendOutAnim(f, false);
    G.gActiveBattler = b;
  }
  gBattlerControllerFuncs[b] = Intro_TryShinyAnimShowHealthbox;
  G.gActiveBattler = saved;
  tasks.destroy(taskId);
}

function PlayerHandleDrawPartyStatusSummary(): void {
  const b = G.gActiveBattler;
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  if (gBattleBufferA[b][1] && GetBattlerSide(b) === C.B_SIDE_PLAYER) {
    PlayerBufferExecCompleted();
  } else {
    hb.partyStatusSummaryShown = 1;
    gBattlerStatusSummaryTaskId[b] = CreatePartyStatusSummarySprites(b, decodeHpAndStatus(gBattleBufferA[b], 4), gBattleBufferA[b][1], gBattleBufferA[b][2]);
    hb.partyStatusDelayTimer = 0;
    if (gBattleBufferA[b][2] !== 0) hb.partyStatusDelayTimer = 93;
    gBattlerControllerFuncs[b] = EndDrawPartyStatusSummary;
  }
}

function EndDrawPartyStatusSummary(): void {
  const hb = gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler];
  if (hb.partyStatusDelayTimer++ > 0x5c) {
    hb.partyStatusDelayTimer = 0;
    PlayerBufferExecCompleted();
  }
}

function PlayerHandleHidePartyStatusSummary(): void {
  const b = G.gActiveBattler;
  if (gBattleSpritesDataPtr.healthBoxesData[b].partyStatusSummaryShown) tasks.tasks[gBattlerStatusSummaryTaskId[b]].func = Task_HidePartyStatusSummary;
  PlayerBufferExecCompleted();
}

function PlayerHandleEndBounceEffect(): void {
  EndBounceEffect(G.gActiveBattler, BOUNCE_HEALTHBOX);
  EndBounceEffect(G.gActiveBattler, BOUNCE_MON);
  PlayerBufferExecCompleted();
}

function PlayerHandleSpriteInvisibility(): void {
  const b = G.gActiveBattler;
  if (IsBattlerSpritePresent(b)) {
    gSprites[gBattlerSpriteIds[b]].invisible = gBattleBufferA[b][1] !== 0;
    CopyBattleSpriteInvisibility(b);
  }
  PlayerBufferExecCompleted();
}

function PlayerHandleBattleAnimation(): void {
  const b = G.gActiveBattler;
  if (!IsBattleSEPlaying(b)) {
    const animationId = gBattleBufferA[b][1];
    const argument = gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8);
    if (TryHandleLaunchBattleTableAnimation(b, b, b, animationId, argument)) PlayerBufferExecCompleted();
    else gBattlerControllerFuncs[b] = CompleteOnFinishedBattleAnimation;
  }
}

function PlayerHandleLinkStandbyMsg(): void {
  const b = G.gActiveBattler;
  switch (gBattleBufferA[b][1]) {
    case 0:
      PrintLinkStandbyMsg();
    // fall through
    case 1:
      EndBounceEffect(b, BOUNCE_HEALTHBOX);
      EndBounceEffect(b, BOUNCE_MON);
      break;
    case 2:
      PrintLinkStandbyMsg();
      break;
  }
  PlayerBufferExecCompleted();
}

function PlayerHandleResetActionMoveSelection(): void {
  const b = G.gActiveBattler;
  switch (gBattleBufferA[b][1]) {
    case C.RESET_ACTION_MOVE_SELECTION:
      gActionSelectionCursor[b] = 0;
      gMoveSelectionCursor[b] = 0;
      break;
    case C.RESET_ACTION_SELECTION:
      gActionSelectionCursor[b] = 0;
      break;
    case C.RESET_MOVE_SELECTION:
      gMoveSelectionCursor[b] = 0;
      break;
  }
  PlayerBufferExecCompleted();
}

function PlayerHandleCmd55(): void {
  G.gBattleOutcome = gBattleBufferA[G.gActiveBattler][1];
  sound.fadeOutBGM(5);
  BeginFastPaletteFade(3);
  PlayerBufferExecCompleted();
  gBattlerControllerFuncs[G.gActiveBattler] = SetBattleEndCallbacks;
}

function PlayerCmdEnd(): void {}

function PreviewDeterminativeMoveTargets(): void {
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE)) return;
  const b = G.gActiveBattler;
  let bitMask = 0;
  let startY = 0;
  const moveInfo = decodeChooseMoveStruct(gBattleBufferA[b], 4);
  const move = moveInfo.moves[gMoveSelectionCursor[b]];
  let moveTarget: number;
  if (move === C.MOVE_CURSE) moveTarget = moveInfo.monType1 !== C.TYPE_GHOST && moveInfo.monType2 !== C.TYPE_GHOST ? C.MOVE_TARGET_USER : C.MOVE_TARGET_SELECTED;
  else moveTarget = gBattleMoves(move).target;
  const bit = (pos: number) => gBitTable[GetBattlerAtPosition(pos)];
  switch (moveTarget) {
    case C.MOVE_TARGET_SELECTED:
    case C.MOVE_TARGET_DEPENDS:
    case C.MOVE_TARGET_USER_OR_SELECTED:
    case C.MOVE_TARGET_RANDOM:
      bitMask = 0xf0000;
      startY = 0;
      break;
    case C.MOVE_TARGET_BOTH:
    case C.MOVE_TARGET_OPPONENTS_FIELD:
      bitMask = (bit(C.B_POSITION_OPPONENT_LEFT) | bit(C.B_POSITION_OPPONENT_RIGHT)) << 16;
      startY = 8;
      break;
    case C.MOVE_TARGET_USER:
      switch (move) {
        case C.MOVE_HAZE: case C.MOVE_SANDSTORM: case C.MOVE_PERISH_SONG: case C.MOVE_RAIN_DANCE: case C.MOVE_SUNNY_DAY: case C.MOVE_HAIL:
        case C.MOVE_MUD_SPORT: case C.MOVE_WATER_SPORT:
          bitMask = 0xf0000;
          break;
        case C.MOVE_SAFEGUARD: case C.MOVE_REFLECT: case C.MOVE_LIGHT_SCREEN: case C.MOVE_MIST: case C.MOVE_HEAL_BELL: case C.MOVE_AROMATHERAPY:
          bitMask = (bit(C.B_POSITION_PLAYER_LEFT) | bit(C.B_POSITION_PLAYER_RIGHT)) << 16;
          break;
        case C.MOVE_HELPING_HAND:
          bitMask = bit(GetBattlerPosition(b) ^ C.BIT_FLANK) << 16;
          break;
        default:
          bitMask = gBitTable[b] << 16;
          break;
      }
      startY = 8;
      break;
    case C.MOVE_TARGET_FOES_AND_ALLY:
      bitMask = (bit(C.B_POSITION_OPPONENT_LEFT) | bit(GetBattlerPosition(b) ^ C.BIT_FLANK) | bit(C.B_POSITION_OPPONENT_RIGHT)) << 16;
      startY = 8;
      break;
  }
  BeginNormalPaletteFade(bitMask >>> 0, 8, startY, 0, RGB_WHITE);
}

const sPlayerBufferCommands: Record<number, () => void> = {
  [C.CONTROLLER_GETMONDATA]: PlayerHandleGetMonData,
  [C.CONTROLLER_GETRAWMONDATA]: PlayerHandleGetRawMonData,
  [C.CONTROLLER_SETMONDATA]: PlayerHandleSetMonData,
  [C.CONTROLLER_SETRAWMONDATA]: PlayerHandleSetRawMonData,
  [C.CONTROLLER_LOADMONSPRITE]: PlayerHandleLoadMonSprite,
  [C.CONTROLLER_SWITCHINANIM]: PlayerHandleSwitchInAnim,
  [C.CONTROLLER_RETURNMONTOBALL]: PlayerHandleReturnMonToBall,
  [C.CONTROLLER_DRAWTRAINERPIC]: PlayerHandleDrawTrainerPic,
  [C.CONTROLLER_TRAINERSLIDE]: PlayerHandleTrainerSlide,
  [C.CONTROLLER_TRAINERSLIDEBACK]: PlayerHandleTrainerSlideBack,
  [C.CONTROLLER_FAINTANIMATION]: PlayerHandleFaintAnimation,
  [C.CONTROLLER_PALETTEFADE]: PlayerHandlePaletteFade,
  [C.CONTROLLER_SUCCESSBALLTHROWANIM]: PlayerHandleSuccessBallThrowAnim,
  [C.CONTROLLER_BALLTHROWANIM]: PlayerHandleBallThrowAnim,
  [C.CONTROLLER_PAUSE]: PlayerHandlePause,
  [C.CONTROLLER_MOVEANIMATION]: PlayerHandleMoveAnimation,
  [C.CONTROLLER_PRINTSTRING]: PlayerHandlePrintString,
  [C.CONTROLLER_PRINTSTRINGPLAYERONLY]: PlayerHandlePrintSelectionString,
  [C.CONTROLLER_CHOOSEACTION]: PlayerHandleChooseAction,
  [C.CONTROLLER_UNKNOWNYESNOBOX]: PlayerHandleUnknownYesNoBox,
  [C.CONTROLLER_CHOOSEMOVE]: PlayerHandleChooseMove,
  [C.CONTROLLER_OPENBAG]: PlayerHandleChooseItem,
  [C.CONTROLLER_CHOOSEPOKEMON]: PlayerHandleChoosePokemon,
  [C.CONTROLLER_23]: PlayerHandleCmd23,
  [C.CONTROLLER_HEALTHBARUPDATE]: PlayerHandleHealthBarUpdate,
  [C.CONTROLLER_EXPUPDATE]: PlayerHandleExpUpdate,
  [C.CONTROLLER_STATUSICONUPDATE]: PlayerHandleStatusIconUpdate,
  [C.CONTROLLER_STATUSANIMATION]: PlayerHandleStatusAnimation,
  [C.CONTROLLER_STATUSXOR]: PlayerHandleStatusXor,
  [C.CONTROLLER_DATATRANSFER]: PlayerHandleDataTransfer,
  [C.CONTROLLER_DMA3TRANSFER]: PlayerHandleDMA3Transfer,
  [C.CONTROLLER_PLAYBGM]: PlayerHandlePlayBGM,
  [C.CONTROLLER_32]: PlayerHandleCmd32,
  [C.CONTROLLER_TWORETURNVALUES]: PlayerHandleTwoReturnValues,
  [C.CONTROLLER_CHOSENMONRETURNVALUE]: PlayerHandleChosenMonReturnValue,
  [C.CONTROLLER_ONERETURNVALUE]: PlayerHandleOneReturnValue,
  [C.CONTROLLER_ONERETURNVALUE_DUPLICATE]: PlayerHandleOneReturnValue_Duplicate,
  [C.CONTROLLER_CLEARUNKVAR]: PlayerHandleCmd37,
  [C.CONTROLLER_SETUNKVAR]: PlayerHandleCmd38,
  [C.CONTROLLER_CLEARUNKFLAG]: PlayerHandleCmd39,
  [C.CONTROLLER_TOGGLEUNKFLAG]: PlayerHandleCmd40,
  [C.CONTROLLER_HITANIMATION]: PlayerHandleHitAnimation,
  [C.CONTROLLER_CANTSWITCH]: PlayerHandleCmd42,
  [C.CONTROLLER_PLAYSE]: PlayerHandlePlaySE,
  [C.CONTROLLER_PLAYFANFARE]: PlayerHandlePlayFanfare,
  [C.CONTROLLER_FAINTINGCRY]: PlayerHandleFaintingCry,
  [C.CONTROLLER_INTROSLIDE]: PlayerHandleIntroSlide,
  [C.CONTROLLER_INTROTRAINERBALLTHROW]: PlayerHandleIntroTrainerBallThrow,
  [C.CONTROLLER_DRAWPARTYSTATUSSUMMARY]: PlayerHandleDrawPartyStatusSummary,
  [C.CONTROLLER_HIDEPARTYSTATUSSUMMARY]: PlayerHandleHidePartyStatusSummary,
  [C.CONTROLLER_ENDBOUNCE]: PlayerHandleEndBounceEffect,
  [C.CONTROLLER_SPRITEINVISIBILITY]: PlayerHandleSpriteInvisibility,
  [C.CONTROLLER_BATTLEANIMATION]: PlayerHandleBattleAnimation,
  [C.CONTROLLER_LINKSTANDBYMSG]: PlayerHandleLinkStandbyMsg,
  [C.CONTROLLER_RESETACTIONMOVESELECTION]: PlayerHandleResetActionMoveSelection,
  [C.CONTROLLER_ENDLINKBATTLE]: PlayerHandleCmd55,
  [C.CONTROLLER_TERMINATOR_NOP]: PlayerCmdEnd,
};
