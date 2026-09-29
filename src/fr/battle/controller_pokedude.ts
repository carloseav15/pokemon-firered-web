// battle_controller_pokedude.c: both battlers of a Teachy TV demo battle. The Pokédude's side plays back a fixed
// input script (action / move cursor positions with delays) and the narration frames pause the battle to show his
// commentary; the opponent side (Prof. Oak's picture) answers with the same scripted choices.
import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { JOY_NEW, A_BUTTON } from "../gba/input";
import { tasks } from "../gba/tasks";
import { cdata, symName, type SymRef } from "../hw/assets";
import { IsDma3ManagerBusyWithBgCopy } from "../hw/bg";
import { BeginFastPaletteFade, BeginNormalPaletteFade, gPaletteFade, LoadCompressedPalette, OBJ_PLTT_ID, PALETTES_ALL, PLTT_SIZE_4BPP, RGB_BLACK } from "../hw/palette";
import { gMain, SetMainCallback2 } from "../hw/runtime";
import {
  AllocSpritePalette, CreateInvisibleSprite, CreateSprite, DestroySprite, FreeOamMatrix, FreeSpriteOamMatrix, FreeSpritePaletteByTag,
  FreeSpriteTilesByTag, GetSpriteTileStartByTag, gSprites, IndexOfSpritePaletteTag, SpriteCallbackDummy, StartSpriteAnim,
} from "../hw/sprite";
import { FreeAllWindowBuffers } from "../hw/window";
import { IsTextPrinterActive } from "../hw/text";
import { DisableStruct } from "../generated/structs";
import { rom } from "../rom";
import { save, varGet, SV } from "../save";
import {
  G, gActionSelectionCursor, gBattleBufferA, gBattleControllerData, gBattleMonForms, gBattlePartyCurrentOrder, gBattleSpritesDataPtr, gBattleStruct,
  gBattlerControllerFuncs, gBattlerPartyIndexes, gBattlerSpriteIds, gBattlerStatusSummaryTaskId, gBitTable, gDisplayedStringBattle, gHealthboxSpriteIds,
  gMoveSelectionCursor, gPokedudeBattlerStates, gTransformedPersonalities,
} from "./globals";
import { GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide } from "./util";
import {
  BtlController_EmitChosenMonReturnValue, BtlController_EmitDataTransfer, BtlController_EmitOneReturnValue, BtlController_EmitTwoReturnValues,
  BUFFER_B, decodeHpAndStatus,
} from "./controllers";
import { CopyMonData, HandleGetMonData, HandleSetMonData, SetMonDataFromBuffer } from "./mon_transfer";
import {
  BattleMainCB2, BOUNCE_HEALTHBOX, BOUNCE_MON, DoBounceEffect, EndBounceEffect, SpriteCB_FaintOpponentMon, SpriteCB_FaintSlideAnim,
} from "./main_init";
import {
  ActionSelectionCreateCursorAt, ActionSelectionDestroyCursorAt, InitMoveSelectionsVarsAndStrings, MoveSelectionCreateCursorAt,
  MoveSelectionDestroyCursorAt, PlayerHandleGetRawMonData, SpriteCB_FreePlayerSpriteLoadMonSprite, Task_PlayerController_RestoreBgmAfterCry,
} from "./controller_player";
import { BtlCtrl_DrawVoiceoverMessageFrame, BtlCtrl_RemoveVoiceoverMessageFrame } from "./controller_oak_old_man";
import { CalculateMonStats, CreateMonWithGenderNatureLetter, gEnemyParty, GetMonData, playerMon, SetMonData, SetMonMoveSlot, ZeroEnemyPartyMons, ZeroPlayerPartyMons, type Mon } from "../pokemon/mon";
import {
  BattleLoadOpponentMonSpriteGfx, BattleLoadPlayerMonSpriteGfx, BattleStopLowHpSound, ClearTemporarySpeciesSpriteData, CopyAllBattleSpritesInvisibilities,
  CopyBattleSpriteInvisibility, DecompressTrainerBackPalette, DecompressTrainerFrontPic, DoHitAnimHealthboxEffect, gTrainerBackPicCoords,
  gTrainerFrontPicCoords, gTrainerFrontPicPaletteTag, gTrainerFrontPicTag, HandleLowHpMusicChange, InitAndLaunchChosenStatusAnimation,
  InitAndLaunchSpecialAnimation, IsBattleSEPlaying, IsMoveWithoutAnimation, PlayBGM, PlaySE12WithPanning, SetBattlerShadowSpriteCallback,
  SetBattlerSpriteAffineMode, SpriteCB_WaitForBattlerBallReleaseAnim, trainerBackPicPalette, TryHandleLaunchBattleTableAnimation,
  TrySetBehindSubstituteSpriteBit, TryShinyAnimation,
} from "./gfx_sfx_util";
import {
  animState, DoMoveAnim, GetBattlerSpriteCoord, GetBattlerSpriteDefault_Y, GetBattlerSpriteSubpriority, gMultiuseSpriteTemplate,
  SetMultiuseSpriteTemplateToPokemon, SetMultiuseSpriteTemplateToTrainerBack, SetSpritePrimaryCoordsFromSecondaryCoords, SpriteCB_TrainerSlideIn,
  StartAnimLinearTranslation, StoreSpriteCallbackInData6,
} from "./anim";
import {
  CreatePartyStatusSummarySprites, DoFreeHealthboxPalsForLevelUp, DoLoadHealthboxPalsForLevelUp, LoadBattleBarGfx, MoveBattleBar, SetBattleBarStruct,
  SetHealthboxSpriteInvisible, SetHealthboxSpriteVisible, StartHealthboxSlideIn, Task_HidePartyStatusSummary, UpdateHealthboxAttribute,
  UpdateHpTextInHealthbox,
} from "./interface";
import { BattlePutTextOnWindow, BattleStringExpandPlaceholdersToDisplayedString, BattleStringShouldBeColored, BufferStringBattle } from "./message";
import { HandleIntroSlide } from "./intro";
import { DoPokeballSendOutAnimation } from "./pokeball";
import { partyMenuResult, Pokedude_OpenPartyMenuInBattle } from "./ext";
import { InitPokedudeBag } from "../bagMenu";
import { bagResult } from "../bagMenu";
import { battleHost } from "./host";
import { ReshowBattleScreenDummy } from "./reshow";

const s16v = (v: number) => (v << 16) >> 16;
const expTable = (species: number) => rom.expTables[rom.species[species].growthRate];
const CD = "battle_controller_pokedude";
const pd = <T>(name: string): T => cdata<T>(CD, name);
const sis = () => gBattleStruct.simulatedInputState;

// pdHealthboxPal1 / pdHealthboxPal2 / pdScriptNum / pdMessageNo alias simulatedInputState[0..3]
const PD_HEALTHBOX_PAL1 = 0;
const PD_HEALTHBOX_PAL2 = 1;
const PD_SCRIPT_NUM = 2;
const PD_MESSAGE_NO = 3;

// TTVSCR_* (teachy_tv.h)
const TTVSCR_BATTLE = 0;
const TTVSCR_STATUS = 1;
const TTVSCR_MATCHUPS = 2;
const TTVSCR_CATCHING = 3;

function IsDoubleBattle(): boolean {
  return (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) !== 0;
}

/** The party slot of battler `b`'s side: gPlayerParty for the Pokédude, gEnemyParty for the opponent. */
function monOfSide(monId: number): Mon {
  return GetBattlerSide(G.gActiveBattler) === C.B_SIDE_PLAYER ? playerMon(monId) : gEnemyParty[monId];
}

function PokedudeDummy(): void {}
function TaskDummy(_taskId: number): void {}

/** SetControllerToPokedude */
export function SetControllerToPokedude(): void {
  gBattlerControllerFuncs[G.gActiveBattler] = PokedudeBufferRunCommand;
  sis()[PD_SCRIPT_NUM] = varGet(SV.x8004);
  sis()[PD_MESSAGE_NO] = 0;
}

function PokedudeBufferRunCommand(): void {
  if (G.gBattleControllerExecFlags & gBitTable[G.gActiveBattler]) {
    if (gBattleBufferA[G.gActiveBattler][0] < sPokedudeBufferCommandsList.length) {
      if (!HandlePokedudeVoiceoverEtc()) sPokedudeBufferCommandsList[gBattleBufferA[G.gActiveBattler][0]]();
    } else {
      PokedudeBufferExecCompleted();
    }
  }
}

function HandleInputChooseAction(): void {
  PokedudeSimulateInputChooseAction();
}

function CompleteOnBattlerSpriteCallbackDummy(): void {
  if (gSprites[gBattlerSpriteIds[G.gActiveBattler]].callback === SpriteCallbackDummy) PokedudeBufferExecCompleted();
}

function CompleteOnBattlerSpritePosX_0(): void {
  const b = G.gActiveBattler;
  const s = gSprites[gBattlerSpriteIds[b]];
  if (s.animEnded && s.x2 === 0) {
    const hb = gBattleSpritesDataPtr.healthBoxesData[b];
    if (!hb.triedShinyMonAnim) {
      TryShinyAnimation(b, gEnemyParty[gBattlerPartyIndexes[b]]);
    } else if (hb.finishedShinyMonAnim) {
      hb.triedShinyMonAnim = 0;
      hb.finishedShinyMonAnim = 0;
      FreeSpriteTilesByTag(C.ANIM_TAG_GOLD_STARS);
      FreeSpritePaletteByTag(C.ANIM_TAG_GOLD_STARS);
      PokedudeBufferExecCompleted();
    }
  }
}

function CompleteOnInactiveTextPrinter(): void {
  if (!IsTextPrinterActive(0)) PokedudeBufferExecCompleted();
}

/** Pokedude_SetBattleEndCallbacks: link-only, the browser has no link battles. */
function Pokedude_SetBattleEndCallbacks(): void {
  if (!gPaletteFade.active) {
    gMain.inBattle = false;
    gMain.callback1 = battleHost.preBattleCallback1;
    SetMainCallback2(gMain.savedCallback);
  }
}

function SwitchIn_HandleSoundAndEnd(): void {
  const b = G.gActiveBattler;
  if (!gBattleSpritesDataPtr.healthBoxesData[b].specialAnimActive) {
    tasks.create(Task_PlayerController_RestoreBgmAfterCry, 10);
    HandleLowHpMusicChange(playerMon(gBattlerPartyIndexes[b]), b);
    PokedudeBufferExecCompleted();
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

function CompleteOnSpecialAnimDone(): void {
  if (!G.gDoingBattleAnim) PokedudeBufferExecCompleted();
}

function Intro_DelayAndEnd(): void {
  const hb = gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler];
  hb.introEndDelay = (hb.introEndDelay - 1) & 0xff;
  if (hb.introEndDelay === 255) {
    hb.introEndDelay = 0;
    PokedudeBufferExecCompleted();
  }
}

function PokedudeHandleInputChooseMove(): void {
  PokedudeSimulateInputChooseMove();
}

function OpenPartyMenuToChooseMon(): void {
  if (!gPaletteFade.active) {
    const b = G.gActiveBattler;
    gBattlerControllerFuncs[b] = WaitForMonSelection;
    tasks.destroy(gBattleControllerData[b]);
    FreeAllWindowBuffers();
    Pokedude_OpenPartyMenuInBattle();
  }
}

function WaitForMonSelection(): void {
  if (gMain.callback2 === BattleMainCB2 && !gPaletteFade.active) {
    if (partyMenuResult.useExitCallback) BtlController_EmitChosenMonReturnValue(BUFFER_B, partyMenuResult.selectedMonPartyId, gBattlePartyCurrentOrder);
    else BtlController_EmitChosenMonReturnValue(BUFFER_B, 6, [0, 0, 0]);
    PokedudeBufferExecCompleted();
  }
}

function OpenBagAndChooseItem(): void {
  if (!gPaletteFade.active) {
    gBattlerControllerFuncs[G.gActiveBattler] = CompleteWhenChoseItem;
    ReshowBattleScreenDummy();
    FreeAllWindowBuffers();
    let callbackId: number;
    switch (varGet(SV.x8004)) {
      case TTVSCR_STATUS:
      default:
        callbackId = C.ITEMMENULOCATION_TTVSCR_STATUS;
        break;
      case TTVSCR_CATCHING:
        callbackId = C.ITEMMENULOCATION_TTVSCR_CATCHING;
        break;
    }
    InitPokedudeBag(callbackId);
  }
}

function CompleteWhenChoseItem(): void {
  if (gMain.callback2 === BattleMainCB2 && !gPaletteFade.active) {
    BtlController_EmitOneReturnValue(BUFFER_B, bagResult.itemId);
    PokedudeBufferExecCompleted();
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
  let r4 = false;
  if (gSprites[gHealthboxSpriteIds[b]].callback === SpriteCallbackDummy) r4 = true;
  if (r4 && hb[b].finishedShinyMonAnim && hb[f].finishedShinyMonAnim) {
    hb[b].triedShinyMonAnim = 0;
    hb[b].finishedShinyMonAnim = 0;
    hb[f].triedShinyMonAnim = 0;
    hb[f].finishedShinyMonAnim = 0;
    FreeSpriteTilesByTag(C.ANIM_TAG_GOLD_STARS);
    FreeSpritePaletteByTag(C.ANIM_TAG_GOLD_STARS);
    tasks.create(Task_PlayerController_RestoreBgmAfterCry, 10);
    HandleLowHpMusicChange(playerMon(gBattlerPartyIndexes[b]), b);
    gBattlerControllerFuncs[b] = Intro_DelayAndEnd;
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
    // The bar has been filled with given exp points.
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
  const b = G.gActiveBattler;
  const s = gSprites[gBattlerSpriteIds[b]];
  if (GetBattlerSide(b) === C.B_SIDE_PLAYER) {
    if (s.y + s.y2 > C.DISPLAY_HEIGHT) {
      FreeOamMatrix(s.oam.matrixNum);
      DestroySprite(s);
      SetHealthboxSpriteInvisible(gHealthboxSpriteIds[b]);
      PokedudeBufferExecCompleted();
    }
  } else if (!s.inUse) {
    SetHealthboxSpriteInvisible(gHealthboxSpriteIds[b]);
    PokedudeBufferExecCompleted();
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
    PokedudeBufferExecCompleted();
  }
}

function CompleteOnInactiveTextPrinter2(): void {
  if (!IsTextPrinterActive(0)) PokedudeBufferExecCompleted();
}

function DoHitAnimBlinkSpriteEffect(): void {
  const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
  if (s.data[1] === 32) {
    s.data[1] = 0;
    s.invisible = false;
    G.gDoingBattleAnim = false;
    PokedudeBufferExecCompleted();
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
    PokedudeBufferExecCompleted();
  }
}

function CompleteOnBattlerSpriteCallbackDummy2(): void {
  if (gSprites[gBattlerSpriteIds[G.gActiveBattler]].callback === SpriteCallbackDummy) PokedudeBufferExecCompleted();
}

function CompleteOnFinishedBattleAnimation(): void {
  if (!gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].animFromTableActive) PokedudeBufferExecCompleted();
}

function CompleteOnFinishedStatusAnimation(): void {
  if (!gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].statusAnimActive) PokedudeBufferExecCompleted();
}

function PokedudeBufferExecCompleted(): void {
  gBattlerControllerFuncs[G.gActiveBattler] = PokedudeBufferRunCommand;
  // The BATTLE_TYPE_LINK branch (PrepareBufferDataTransferLink) has no link session to serve.
  G.gBattleControllerExecFlags = (G.gBattleControllerExecFlags & ~gBitTable[G.gActiveBattler]) >>> 0;
}

// ---------------------------------------------------------------- buffer command handlers
function PokedudeHandleGetMonData(): void {
  const [data, size] = HandleGetMonData(monOfSide.bind(null), CopyPokedudeMonData);
  BtlController_EmitDataTransfer(BUFFER_B, size, data);
  PokedudeBufferExecCompleted();
}

/** CopyPokedudeMonData: the request serializer routed to the active battler's side. */
function CopyPokedudeMonData(monId: number, dst: Uint8Array, offset: number): number {
  return CopyMonData(monOfSide(monId), gBattleBufferA[G.gActiveBattler][1], dst, offset);
}

function PokedudeHandleGetRawMonData(): void {
  PlayerHandleGetRawMonData();
}

function PokedudeHandleSetMonData(): void {
  HandleSetMonData(monOfSide, SetPokedudeMonData);
  PokedudeBufferExecCompleted();
}

/** SetPokedudeMonData: apply bufferA's request bytes to one slot of the active battler's side. */
function SetPokedudeMonData(monId: number): void {
  SetMonDataFromBuffer(monOfSide(monId));
  HandleLowHpMusicChange(playerMon(gBattlerPartyIndexes[G.gActiveBattler]), G.gActiveBattler);
}

function PokedudeHandleSetRawMonData(): void {
  PokedudeBufferExecCompleted();
}

function PokedudeHandleLoadMonSprite(): void {
  const b = G.gActiveBattler;
  const mon = gEnemyParty[gBattlerPartyIndexes[b]];
  const species = GetMonData(mon, C.MON_DATA_SPECIES);
  BattleLoadOpponentMonSpriteGfx(mon, b);
  const y = GetBattlerSpriteDefault_Y(b);
  SetMultiuseSpriteTemplateToPokemon(species, GetBattlerPosition(b));
  gBattlerSpriteIds[b] = CreateSprite(gMultiuseSpriteTemplate(), GetBattlerSpriteCoord(b, C.BATTLER_COORD_X_2), y, GetBattlerSpriteSubpriority(b));
  const s = gSprites[gBattlerSpriteIds[b]];
  s.x2 = -C.DISPLAY_WIDTH;
  s.data[0] = b;
  s.data[2] = species;
  s.oam.paletteNum = b;
  StartSpriteAnim(s, gBattleMonForms[b]);
  SetBattlerShadowSpriteCallback(b, GetMonData(gEnemyParty[gBattlerPartyIndexes[b]], C.MON_DATA_SPECIES));
  gBattlerControllerFuncs[b] = CompleteOnBattlerSpritePosX_0;
  PokedudeBufferExecCompleted();
}

function PokedudeHandleSwitchInAnim(): void {
  const b = G.gActiveBattler;
  ClearTemporarySpeciesSpriteData(b, gBattleBufferA[b][2]);
  gBattlerPartyIndexes[b] = gBattleBufferA[b][1];
  BattleLoadPlayerMonSpriteGfx(playerMon(gBattlerPartyIndexes[b]), b);
  gActionSelectionCursor[b] = 0;
  gMoveSelectionCursor[b] = 0;
  StartSendOutAnim(b);
  gBattlerControllerFuncs[b] = SwitchIn_TryShinyAnimShowHealthbox;
}

function PokedudeHandleReturnMonToBall(): void {
  const b = G.gActiveBattler;
  if (gBattleBufferA[b][1] === 0) {
    InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_SWITCH_OUT_PLAYER_MON);
    gBattlerControllerFuncs[b] = DoSwitchOutAnimation;
  } else {
    const s = gSprites[gBattlerSpriteIds[b]];
    FreeSpriteOamMatrix(s);
    DestroySprite(s);
    SetHealthboxSpriteInvisible(gHealthboxSpriteIds[b]);
    PokedudeBufferExecCompleted();
  }
}

function PokedudeHandleDrawTrainerPic(): void {
  const b = G.gActiveBattler;
  if (GetBattlerSide(b) === C.B_SIDE_PLAYER) {
    DecompressTrainerBackPalette(C.TRAINER_BACK_PIC_POKEDUDE, b);
    SetMultiuseSpriteTemplateToTrainerBack(C.TRAINER_BACK_PIC_POKEDUDE, GetBattlerPosition(b));
    gBattlerSpriteIds[b] = CreateSprite(gMultiuseSpriteTemplate(), 80, (8 - gTrainerBackPicCoords(C.TRAINER_BACK_PIC_POKEDUDE).size) * 4 + 80, 30);
    const s = gSprites[gBattlerSpriteIds[b]];
    s.x2 = C.DISPLAY_WIDTH;
    s.data[0] = -2;
    s.oam.paletteNum = b;
    s.callback = SpriteCB_TrainerSlideIn;
  } else {
    const trainerPicId = C.TRAINER_PIC_PROFESSOR_OAK;
    DecompressTrainerFrontPic(trainerPicId, b);
    SetMultiuseSpriteTemplateToTrainerBack(trainerPicId, GetBattlerPosition(b));
    gBattlerSpriteIds[b] = CreateSprite(gMultiuseSpriteTemplate(), 176, (8 - gTrainerFrontPicCoords(trainerPicId).size) * 4 + 40, GetBattlerSpriteSubpriority(b));
    const s = gSprites[gBattlerSpriteIds[b]];
    s.x2 = -C.DISPLAY_WIDTH;
    s.data[0] = 2;
    s.oam.paletteNum = IndexOfSpritePaletteTag(gTrainerFrontPicPaletteTag(trainerPicId));
    s.data[5] = s.oam.tileNum;
    s.oam.tileNum = GetSpriteTileStartByTag(gTrainerFrontPicTag(trainerPicId));
    s.oam.affineParam = trainerPicId;
    s.callback = SpriteCB_TrainerSlideIn;
  }
  gBattlerControllerFuncs[b] = CompleteOnBattlerSpriteCallbackDummy;
}

function PokedudeHandleTrainerSlide(): void {
  const b = G.gActiveBattler;
  DecompressTrainerBackPalette(C.TRAINER_BACK_PIC_POKEDUDE, b);
  SetMultiuseSpriteTemplateToTrainerBack(C.TRAINER_BACK_PIC_POKEDUDE, GetBattlerPosition(b));
  gBattlerSpriteIds[b] = CreateSprite(gMultiuseSpriteTemplate(), 80, (8 - gTrainerBackPicCoords(C.TRAINER_BACK_PIC_POKEDUDE).size) * 4 + 80, 30);
  const s = gSprites[gBattlerSpriteIds[b]];
  s.oam.paletteNum = b;
  s.x2 = -96;
  s.data[0] = 2;
  s.callback = SpriteCB_TrainerSlideIn;
  gBattlerControllerFuncs[b] = CompleteOnBattlerSpriteCallbackDummy2;
}

function PokedudeHandleTrainerSlideBack(): void {
  PokedudeBufferExecCompleted();
}

function PokedudeHandleFaintAnimation(): void {
  const b = G.gActiveBattler;
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  if (hb.animationState === 0) {
    if (gBattleSpritesDataPtr.battlerData[b].behindSubstitute) InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_SUBSTITUTE_TO_MON);
    hb.animationState++;
  } else if (!hb.specialAnimActive) {
    hb.animationState = 0;
    const s = gSprites[gBattlerSpriteIds[b]];
    if (GetBattlerSide(b) === C.B_SIDE_PLAYER) {
      HandleLowHpMusicChange(playerMon(gBattlerPartyIndexes[b]), b);
      PlaySE12WithPanning(C.SE_FAINT, C.SOUND_PAN_ATTACKER);
      s.data[1] = 0;
      s.data[2] = 5;
      s.callback = SpriteCB_FaintSlideAnim;
    } else {
      PlaySE12WithPanning(C.SE_FAINT, C.SOUND_PAN_TARGET);
      s.callback = SpriteCB_FaintOpponentMon;
    }
    gBattlerControllerFuncs[b] = FreeMonSpriteAfterFaintAnim;
  }
}

function PokedudeHandlePaletteFade(): void {
  PokedudeBufferExecCompleted();
}

function PokedudeHandleSuccessBallThrowAnim(): void {
  gBattleSpritesDataPtr.animationData.ballThrowCaseId = C.BALL_3_SHAKES_SUCCESS;
  G.gDoingBattleAnim = true;
  InitAndLaunchSpecialAnimation(G.gActiveBattler, G.gActiveBattler, GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT), C.B_ANIM_BALL_THROW);
  gBattlerControllerFuncs[G.gActiveBattler] = CompleteOnSpecialAnimDone;
}

function PokedudeHandleBallThrowAnim(): void {
  const ballThrowCaseId = gBattleBufferA[G.gActiveBattler][1];
  gBattleSpritesDataPtr.animationData.ballThrowCaseId = ballThrowCaseId;
  G.gDoingBattleAnim = true;
  InitAndLaunchSpecialAnimation(G.gActiveBattler, G.gActiveBattler, GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT), C.B_ANIM_BALL_THROW);
  gBattlerControllerFuncs[G.gActiveBattler] = CompleteOnSpecialAnimDone;
}

function PokedudeHandlePause(): void {
  PokedudeBufferExecCompleted();
}

function PokedudeHandleMoveAnimation(): void {
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
    // always returns FALSE
    PokedudeBufferExecCompleted();
  } else {
    gBattleSpritesDataPtr.healthBoxesData[b].animationState = 0;
    gBattlerControllerFuncs[b] = PokedudeDoMoveAnimation;
  }
}

function PokedudeDoMoveAnimation(): void {
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
        PokedudeBufferExecCompleted();
      }
      break;
  }
}

function PokedudeHandlePrintString(): void {
  const b = G.gActiveBattler;
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  const stringId = gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8);
  BufferStringBattle(stringId);
  if (BattleStringShouldBeColored(stringId)) BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG | C.B_TEXT_FLAG_NPC_CONTEXT_FONT);
  else BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
  gBattlerControllerFuncs[b] = CompleteOnInactiveTextPrinter;
}

function PokedudeHandlePrintSelectionString(): void {
  if (GetBattlerSide(G.gActiveBattler) === C.B_SIDE_PLAYER) PokedudeHandlePrintString();
  else PokedudeBufferExecCompleted();
}

function HandleChooseActionAfterDma3(): void {
  if (!IsDma3ManagerBusyWithBgCopy()) {
    G.gBattle_BG0_X = 0;
    G.gBattle_BG0_Y = 160;
    gBattlerControllerFuncs[G.gActiveBattler] = HandleInputChooseAction;
  }
}

function PokedudeHandleChooseAction(): void {
  const b = G.gActiveBattler;
  if (GetBattlerSide(b) === C.B_SIDE_PLAYER) {
    gBattlerControllerFuncs[b] = HandleChooseActionAfterDma3;
    BattlePutTextOnWindow(rom.text("gText_EmptyString3"), C.B_WIN_MSG);
    BattlePutTextOnWindow(rom.text("gText_BattleMenu"), C.B_WIN_ACTION_MENU);
    for (let i = 0; i < C.MAX_MON_MOVES; ++i) ActionSelectionDestroyCursorAt(i);
    ActionSelectionCreateCursorAt(gActionSelectionCursor[b], 0);
    BattleStringExpandPlaceholdersToDisplayedString(rom.text("gText_WhatWillPkmnDo"));
    BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_ACTION_PROMPT);
  } else {
    gBattlerControllerFuncs[b] = HandleInputChooseAction;
  }
}

function PokedudeHandleUnknownYesNoBox(): void {
  PokedudeBufferExecCompleted();
}

function PokedudeHandleChooseMoveAfterDma3(): void {
  if (!IsDma3ManagerBusyWithBgCopy()) {
    G.gBattle_BG0_X = 0;
    G.gBattle_BG0_Y = 320;
    gBattlerControllerFuncs[G.gActiveBattler] = PokedudeHandleInputChooseMove;
  }
}

function PokedudeHandleChooseMove(): void {
  const b = G.gActiveBattler;
  if (GetBattlerSide(b) === C.B_SIDE_PLAYER) {
    InitMoveSelectionsVarsAndStrings();
    gBattlerControllerFuncs[b] = PokedudeHandleChooseMoveAfterDma3;
  } else {
    gBattlerControllerFuncs[b] = PokedudeHandleInputChooseMove;
  }
}

function PokedudeHandleChooseItem(): void {
  const b = G.gActiveBattler;
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0x10, RGB_BLACK);
  gBattlerControllerFuncs[b] = OpenBagAndChooseItem;
  G.gBattlerInMenuId = b;
  for (let i = 0; i < 3; ++i) gBattlePartyCurrentOrder[i] = gBattleBufferA[b][i + 1];
}

function PokedudeHandleChoosePokemon(): void {
  const b = G.gActiveBattler;
  gBattleControllerData[b] = tasks.create(TaskDummy, 0xff);
  tasks.tasks[gBattleControllerData[b]].data[0] = gBattleBufferA[b][1] & 0xf;
  gBattleStruct.battlerPreventingSwitchout = gBattleBufferA[b][1] >> 4;
  gBattleStruct.playerPartyIdx = gBattleBufferA[b][2];
  gBattleStruct.abilityPreventingSwitchout = gBattleBufferA[b][3];
  for (let i = 0; i < 3; ++i) gBattlePartyCurrentOrder[i] = gBattleBufferA[b][4 + i];
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0x10, RGB_BLACK);
  gBattlerControllerFuncs[b] = OpenPartyMenuToChooseMon;
  G.gBattlerInMenuId = b;
}

function PokedudeHandleCmd23(): void {
  PokedudeBufferExecCompleted();
}

function PokedudeHandleHealthBarUpdate(): void {
  const b = G.gActiveBattler;
  const mon = GetBattlerSide(b) === C.B_SIDE_PLAYER ? playerMon(gBattlerPartyIndexes[b]) : gEnemyParty[gBattlerPartyIndexes[b]];
  LoadBattleBarGfx(0);
  const hpVal = s16v(gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8));
  const maxHP = GetMonData(mon, C.MON_DATA_MAX_HP);
  if (hpVal !== C.INSTANT_HP_BAR_DROP) {
    SetBattleBarStruct(b, gHealthboxSpriteIds[b], maxHP, GetMonData(mon, C.MON_DATA_HP), hpVal);
  } else {
    SetBattleBarStruct(b, gHealthboxSpriteIds[b], maxHP, 0, hpVal);
    UpdateHpTextInHealthbox(gHealthboxSpriteIds[b], 0, C.HP_CURRENT);
  }
  gBattlerControllerFuncs[b] = CompleteOnHealthbarDone;
}

function PokedudeHandleExpUpdate(): void {
  const b = G.gActiveBattler;
  const monId = gBattleBufferA[b][1];
  if (GetMonData(playerMon(monId), C.MON_DATA_LEVEL) >= C.MAX_LEVEL) {
    PokedudeBufferExecCompleted();
  } else {
    LoadBattleBarGfx(1);
    const taskId = tasks.create(Task_GiveExpToMon, 10);
    const t = tasks.tasks[taskId];
    t.data[0] = monId;
    t.data[1] = s16v(gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8));
    t.data[2] = b;
    gBattlerControllerFuncs[b] = PokedudeDummy;
  }
}

function PokedudeHandleStatusIconUpdate(): void {
  const b = G.gActiveBattler;
  if (!IsBattleSEPlaying(b)) {
    const mon = GetBattlerSide(b) === C.B_SIDE_PLAYER ? playerMon(gBattlerPartyIndexes[b]) : gEnemyParty[gBattlerPartyIndexes[b]];
    UpdateHealthboxAttribute(gHealthboxSpriteIds[b], mon, C.HEALTHBOX_STATUS_ICON);
    gBattleSpritesDataPtr.healthBoxesData[b].statusAnimActive = 0;
    gBattlerControllerFuncs[b] = CompleteOnFinishedStatusAnimation;
  }
}

function PokedudeHandleStatusAnimation(): void {
  const b = G.gActiveBattler;
  if (!IsBattleSEPlaying(b)) {
    const buf = gBattleBufferA[b];
    InitAndLaunchChosenStatusAnimation(buf[1], (buf[2] | (buf[3] << 8) | (buf[4] << 16) | (buf[5] << 24)) >>> 0);
    gBattlerControllerFuncs[b] = CompleteOnFinishedStatusAnimation;
  }
}

function PokedudeHandleStatusXor(): void {
  const b = G.gActiveBattler;
  const mon = GetBattlerSide(b) === C.B_SIDE_PLAYER ? playerMon(gBattlerPartyIndexes[b]) : gEnemyParty[gBattlerPartyIndexes[b]];
  const val = (GetMonData(mon, C.MON_DATA_STATUS) ^ gBattleBufferA[b][1]) & 0xff;
  SetMonData(mon, C.MON_DATA_STATUS, val);
  PokedudeBufferExecCompleted();
}

function PokedudeHandleDataTransfer(): void { PokedudeBufferExecCompleted(); }
function PokedudeHandleDMA3Transfer(): void { PokedudeBufferExecCompleted(); }
function PokedudeHandlePlayBGM(): void { PokedudeBufferExecCompleted(); }
function PokedudeHandleCmd32(): void { PokedudeBufferExecCompleted(); }
function PokedudeHandleTwoReturnValues(): void { PokedudeBufferExecCompleted(); }
function PokedudeHandleChosenMonReturnValue(): void { PokedudeBufferExecCompleted(); }
function PokedudeHandleOneReturnValue(): void { PokedudeBufferExecCompleted(); }
function PokedudeHandleOneReturnValue_Duplicate(): void { PokedudeBufferExecCompleted(); }
function PokedudeHandleCmd37(): void { PokedudeBufferExecCompleted(); }
function PokedudeHandleCmd38(): void { PokedudeBufferExecCompleted(); }
function PokedudeHandleCmd39(): void { PokedudeBufferExecCompleted(); }
function PokedudeHandleCmd40(): void { PokedudeBufferExecCompleted(); }

function PokedudeHandleHitAnimation(): void {
  const b = G.gActiveBattler;
  const s = gSprites[gBattlerSpriteIds[b]];
  if (s.invisible) {
    PokedudeBufferExecCompleted();
  } else {
    G.gDoingBattleAnim = true;
    s.data[1] = 0;
    DoHitAnimHealthboxEffect(b);
    gBattlerControllerFuncs[b] = DoHitAnimBlinkSpriteEffect;
  }
}

function PokedudeHandleCmd42(): void { PokedudeBufferExecCompleted(); }

function PokedudeHandlePlaySE(): void {
  sound.playSE(gBattleBufferA[G.gActiveBattler][1] | (gBattleBufferA[G.gActiveBattler][2] << 8));
  PokedudeBufferExecCompleted();
}

function PokedudeHandlePlayFanfare(): void {
  sound.playFanfare(gBattleBufferA[G.gActiveBattler][1] | (gBattleBufferA[G.gActiveBattler][2] << 8));
  PokedudeBufferExecCompleted();
}

function PokedudeHandleFaintingCry(): void {
  const b = G.gActiveBattler;
  const mon = GetBattlerSide(b) === C.B_SIDE_PLAYER ? playerMon(gBattlerPartyIndexes[b]) : gEnemyParty[gBattlerPartyIndexes[b]];
  sound.PlayCry_Normal(GetMonData(mon, C.MON_DATA_SPECIES), 25);
  PokedudeBufferExecCompleted();
}

function PokedudeHandleIntroSlide(): void {
  HandleIntroSlide(gBattleBufferA[G.gActiveBattler][1]);
  G.gIntroSlideFlags |= 1;
  PokedudeBufferExecCompleted();
}

function PokedudeHandleIntroTrainerBallThrow(): void {
  const b = G.gActiveBattler;
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
  LoadCompressedPalette(trainerBackPicPalette(C.TRAINER_BACK_PIC_POKEDUDE), OBJ_PLTT_ID(paletteNum), PLTT_SIZE_4BPP);
  s.oam.paletteNum = paletteNum;
  const taskId = tasks.create(Task_StartSendOutAnim, 5);
  tasks.tasks[taskId].data[0] = b;
  if (gBattleSpritesDataPtr.healthBoxesData[b].partyStatusSummaryShown) tasks.tasks[gBattlerStatusSummaryTaskId[b]].func = Task_HidePartyStatusSummary;
  gBattleSpritesDataPtr.animationData.introAnimActive = 1;
  gBattlerControllerFuncs[b] = PokedudeDummy;
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

function PokedudeHandleDrawPartyStatusSummary(): void {
  const b = G.gActiveBattler;
  if (gBattleBufferA[b][1] !== 0 && GetBattlerSide(b) === C.B_SIDE_PLAYER) {
    PokedudeBufferExecCompleted();
  } else {
    gBattleSpritesDataPtr.healthBoxesData[b].partyStatusSummaryShown = 1;
    gBattlerStatusSummaryTaskId[b] = CreatePartyStatusSummarySprites(b, decodeHpAndStatus(gBattleBufferA[b], 4), gBattleBufferA[b][1], gBattleBufferA[b][2]);
    PokedudeBufferExecCompleted();
  }
}

function PokedudeHandleHidePartyStatusSummary(): void { PokedudeBufferExecCompleted(); }

function PokedudeHandleEndBounceEffect(): void {
  EndBounceEffect(G.gActiveBattler, BOUNCE_HEALTHBOX);
  EndBounceEffect(G.gActiveBattler, BOUNCE_MON);
  PokedudeBufferExecCompleted();
}

function PokedudeHandleSpriteInvisibility(): void { PokedudeBufferExecCompleted(); }

function PokedudeHandleBattleAnimation(): void {
  const b = G.gActiveBattler;
  const animationId = gBattleBufferA[b][1];
  const argument = gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8);
  if (TryHandleLaunchBattleTableAnimation(b, b, b, animationId, argument)) PokedudeBufferExecCompleted();
  else gBattlerControllerFuncs[b] = CompleteOnFinishedBattleAnimation;
}

function PokedudeHandleLinkStandbyMsg(): void {
  const b = G.gActiveBattler;
  switch (gBattleBufferA[b][1]) {
    case 0:
    case 1:
      EndBounceEffect(b, BOUNCE_HEALTHBOX);
      EndBounceEffect(b, BOUNCE_MON);
      break;
    case 2:
      break;
  }
  PokedudeBufferExecCompleted();
}

function PokedudeHandleResetActionMoveSelection(): void { PokedudeBufferExecCompleted(); }

function PokedudeHandleCmd55(): void {
  G.gBattleOutcome = gBattleBufferA[G.gActiveBattler][1];
  sound.fadeOutBGM(5);
  BeginFastPaletteFade(3);
  PokedudeBufferExecCompleted();
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_IS_MASTER) && G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) gBattlerControllerFuncs[G.gActiveBattler] = Pokedude_SetBattleEndCallbacks;
}

function PokedudeCmdEnd(): void {}

// ---------------------------------------------------------------- script handlers
type PokedudeInputScript = { cursorPos: number[]; delay: number[] };
type PokedudeTextScriptHeader = { btlcmd: number; side: number; stringid?: number; callback: SymRef | 0 };

/** Entry `idx` of a demo input script; past the end (the C reads whatever follows the table) repeats the last entry. */
const scriptEntry = (script: PokedudeInputScript[], idx: number): PokedudeInputScript => script[Math.min(idx, script.length - 1)];

function PokedudeSimulateInputChooseAction(): void {
  const b = G.gActiveBattler;
  const scripts = pd<SymRef[]>("sInputScripts_ChooseAction");
  const script = pd<PokedudeInputScript[]>(symName(scripts[sis()[PD_SCRIPT_NUM]])!);
  const st = gPokedudeBattlerStates[b];
  if (GetBattlerSide(b) === C.B_SIDE_PLAYER) {
    DoBounceEffect(b, BOUNCE_HEALTHBOX, 7, 1);
    DoBounceEffect(b, BOUNCE_MON, 7, 1);
  }
  if (scriptEntry(script, st.action_idx).delay[b] === st.timer) {
    if (GetBattlerSide(b) === C.B_SIDE_PLAYER) sound.playSE(C.SE_SELECT);
    st.timer = 0;
    switch (scriptEntry(script, st.action_idx).cursorPos[b]) {
      case 0:
        BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_USE_MOVE, 0);
        break;
      case 1:
        BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_USE_ITEM, 0);
        break;
      case 2:
        BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_SWITCH, 0);
        break;
      case 3:
        BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_RUN, 0);
        break;
    }
    PokedudeBufferExecCompleted();
    st.action_idx++;
    if (scriptEntry(script, st.action_idx).cursorPos[b] === 4) st.action_idx = 0;
  } else {
    if (gActionSelectionCursor[b] !== scriptEntry(script, st.action_idx).cursorPos[b] && ((scriptEntry(script, st.action_idx).delay[b] / 2) | 0) === st.timer) {
      sound.playSE(C.SE_SELECT);
      ActionSelectionDestroyCursorAt(gActionSelectionCursor[b]);
      gActionSelectionCursor[b] = scriptEntry(script, st.action_idx).cursorPos[b];
      ActionSelectionCreateCursorAt(gActionSelectionCursor[b], 0);
    }
    st.timer++;
  }
}

function PokedudeSimulateInputChooseMove(): void {
  const b = G.gActiveBattler;
  const scripts = pd<SymRef[]>("sInputScripts_ChooseMove");
  const script = pd<PokedudeInputScript[]>(symName(scripts[sis()[PD_SCRIPT_NUM]])!);
  const st = gPokedudeBattlerStates[b];
  if (scriptEntry(script, st.move_idx).delay[b] === st.timer) {
    if (GetBattlerSide(b) === C.B_SIDE_PLAYER) sound.playSE(C.SE_SELECT);
    st.timer = 0;
    BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_EXEC_SCRIPT, scriptEntry(script, st.move_idx).cursorPos[b] | ((b ^ C.BIT_SIDE) << 8));
    PokedudeBufferExecCompleted();
    st.move_idx++;
    if (scriptEntry(script, st.move_idx).cursorPos[b] === 255) st.move_idx = 0;
  } else {
    if (scriptEntry(script, st.move_idx).cursorPos[b] !== gMoveSelectionCursor[b] && ((scriptEntry(script, st.move_idx).delay[b] / 2) | 0) === st.timer) {
      sound.playSE(C.SE_SELECT);
      MoveSelectionDestroyCursorAt(gMoveSelectionCursor[b]);
      gMoveSelectionCursor[b] = scriptEntry(script, st.move_idx).cursorPos[b];
      MoveSelectionCreateCursorAt(gMoveSelectionCursor[b], 0);
    }
    st.timer++;
  }
}

function HandlePokedudeVoiceoverEtc(): boolean {
  const b = G.gActiveBattler;
  const scripts = pd<SymRef[]>("sPokedudeTextScripts");
  const header = pd<PokedudeTextScriptHeader[]>(symName(scripts[sis()[PD_SCRIPT_NUM]])!)[sis()[PD_MESSAGE_NO]];
  const bstringid = gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8);
  if (header === undefined) return false;
  if (gBattleBufferA[b][0] !== header.btlcmd) return false;
  if (b !== header.side) return false;
  if (gBattleBufferA[b][0] === C.CONTROLLER_PRINTSTRING && (header.stringid ?? 0) !== bstringid) return false;
  if (!header.callback) {
    sis()[PD_MESSAGE_NO]++;
    return false;
  }
  gBattlerControllerFuncs[b] = pdCallbacks[symName(header.callback)!];
  gPokedudeBattlerStates[b].timer = 0;
  gPokedudeBattlerStates[b].msg_idx = (header.stringid ?? 0) & 0xff;
  sis()[PD_MESSAGE_NO]++;
  return true;
}

function ReturnFromPokedudeAction(): void {
  gPokedudeBattlerStates[G.gActiveBattler].timer = 0;
  gBattlerControllerFuncs[G.gActiveBattler] = PokedudeBufferRunCommand;
}

function PokedudeAction_PrintVoiceoverMessage(): void {
  const st = gPokedudeBattlerStates[G.gActiveBattler];
  switch (st.timer) {
    case 0:
      if (!gPaletteFade.active) {
        BeginNormalPaletteFade(0xffffff7f, 4, 0, 8, RGB_BLACK);
        ++st.timer;
      }
      break;
    case 1:
      if (!gPaletteFade.active) {
        st.saved_bg0y = G.gBattle_BG0_Y & 0xff;
        BtlCtrl_DrawVoiceoverMessageFrame();
        ++st.timer;
      }
      break;
    case 2:
      G.gBattle_BG0_Y = 0;
      BattleStringExpandPlaceholdersToDisplayedString(GetPokedudeText());
      BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_OAK_OLD_MAN);
      ++st.timer;
      break;
    case 3:
      if (!IsTextPrinterActive(24) && JOY_NEW(A_BUTTON)) {
        sound.playSE(C.SE_SELECT);
        BeginNormalPaletteFade(0xffffff7f, 4, 8, 0, RGB_BLACK);
        ++st.timer;
      }
      break;
    case 4:
      if (!gPaletteFade.active) {
        if (st.msg_idx === (C.STRINGID_PKMNGAINEDEXP & 0xff)) {
          BattleStopLowHpSound();
          PlayBGM(C.MUS_VICTORY_WILD);
        }
        G.gBattle_BG0_Y = st.saved_bg0y;
        BtlCtrl_RemoveVoiceoverMessageFrame();
        ReturnFromPokedudeAction();
      }
      break;
  }
}

function PokedudeAction_PrintMessageWithHealthboxPals(): void {
  const st = gPokedudeBattlerStates[G.gActiveBattler];
  const mask = (): number => (((gBitTable[sis()[PD_HEALTHBOX_PAL2]] | gBitTable[sis()[PD_HEALTHBOX_PAL1]]) << 16) >>> 0);
  switch (st.timer) {
    case 0:
      if (!gPaletteFade.active) {
        const ids = DoLoadHealthboxPalsForLevelUp(GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT));
        sis()[PD_HEALTHBOX_PAL2] = ids[0];
        sis()[PD_HEALTHBOX_PAL1] = ids[1];
        BeginNormalPaletteFade(0xffffff7f, 4, 0, 8, RGB_BLACK);
        ++st.timer;
      }
      break;
    case 1:
      if (!gPaletteFade.active) {
        BeginNormalPaletteFade(mask(), 4, 8, 0, RGB_BLACK);
        ++st.timer;
      }
      break;
    case 2:
      if (!gPaletteFade.active) {
        BtlCtrl_DrawVoiceoverMessageFrame();
        ++st.timer;
      }
      break;
    case 3:
      BattleStringExpandPlaceholdersToDisplayedString(GetPokedudeText());
      BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_OAK_OLD_MAN);
      ++st.timer;
      break;
    case 4:
      if (!IsTextPrinterActive(24) && JOY_NEW(A_BUTTON)) {
        sound.playSE(C.SE_SELECT);
        BeginNormalPaletteFade(mask(), 4, 0, 8, RGB_BLACK);
        ++st.timer;
      }
      break;
    case 5:
      if (!gPaletteFade.active) {
        BeginNormalPaletteFade(0xffffff7f, 4, 8, 0, RGB_BLACK);
        ++st.timer;
      }
      break;
    case 6:
      if (!gPaletteFade.active) {
        if (st.msg_idx === (C.STRINGID_PKMNGAINEDEXP & 0xff)) {
          BattleStopLowHpSound();
          PlayBGM(C.MUS_VICTORY_WILD);
        }
        DoFreeHealthboxPalsForLevelUp(GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT));
        BtlCtrl_RemoveVoiceoverMessageFrame();
        ReturnFromPokedudeAction();
      }
      break;
  }
}

const pdCallbacks: Record<string, () => void> = { PokedudeAction_PrintVoiceoverMessage, PokedudeAction_PrintMessageWithHealthboxPals };

function GetPokedudeText(): Uint8Array {
  const names = ["sPokedudeTexts_Battle", "sPokedudeTexts_Status", "sPokedudeTexts_TypeMatchup", "sPokedudeTexts_Catching"];
  const script = sis()[PD_SCRIPT_NUM];
  const table = pd<SymRef[]>(names[script] ?? names[TTVSCR_BATTLE]);
  return rom.text(symName(table[sis()[PD_MESSAGE_NO] - 1])!);
}

/** InitPokedudePartyAndOpponent */
export function InitPokedudePartyAndOpponent(): void {
  let myIdx = 0;
  let opIdx = 0;
  G.gBattleTypeFlags = C.BATTLE_TYPE_POKEDUDE;
  ZeroPlayerPartyMons();
  ZeroEnemyPartyMons();
  const pointers = pd<SymRef[]>("sPokedudeBattlePartyPointers");
  const data = pd<Array<{ side: number; level?: number; species?: number; moves?: number[]; nature?: number; gender?: number }>>(symName(pointers[varGet(SV.x8004)])!);
  for (let i = 0; data[i].side !== 0xff; i++) {
    let mon: Mon;
    if (data[i].side === C.B_SIDE_PLAYER) {
      // gPlayerParty[myIdx++]: grow the party (save.party) by one empty slot the mon is created into.
      const slot = playerMon(myIdx++);
      save.party.push(slot);
      mon = slot;
    } else {
      mon = gEnemyParty[opIdx++];
    }
    CreateMonWithGenderNatureLetter(mon, data[i].species!, data[i].level!, 0, data[i].gender ?? 0, data[i].nature ?? 0, 0);
    for (let j = 0; j < 4; ++j) SetMonMoveSlot(mon, (data[i].moves ?? [])[j] ?? 0, j);
  }
}

const sPokedudeBufferCommandsList: Array<() => void> = [];
{
  const set = (id: number, fn: () => void): void => { sPokedudeBufferCommandsList[id] = fn; };
  set(C.CONTROLLER_GETMONDATA, PokedudeHandleGetMonData);
  set(C.CONTROLLER_GETRAWMONDATA, PokedudeHandleGetRawMonData);
  set(C.CONTROLLER_SETMONDATA, PokedudeHandleSetMonData);
  set(C.CONTROLLER_SETRAWMONDATA, PokedudeHandleSetRawMonData);
  set(C.CONTROLLER_LOADMONSPRITE, PokedudeHandleLoadMonSprite);
  set(C.CONTROLLER_SWITCHINANIM, PokedudeHandleSwitchInAnim);
  set(C.CONTROLLER_RETURNMONTOBALL, PokedudeHandleReturnMonToBall);
  set(C.CONTROLLER_DRAWTRAINERPIC, PokedudeHandleDrawTrainerPic);
  set(C.CONTROLLER_TRAINERSLIDE, PokedudeHandleTrainerSlide);
  set(C.CONTROLLER_TRAINERSLIDEBACK, PokedudeHandleTrainerSlideBack);
  set(C.CONTROLLER_FAINTANIMATION, PokedudeHandleFaintAnimation);
  set(C.CONTROLLER_PALETTEFADE, PokedudeHandlePaletteFade);
  set(C.CONTROLLER_SUCCESSBALLTHROWANIM, PokedudeHandleSuccessBallThrowAnim);
  set(C.CONTROLLER_BALLTHROWANIM, PokedudeHandleBallThrowAnim);
  set(C.CONTROLLER_PAUSE, PokedudeHandlePause);
  set(C.CONTROLLER_MOVEANIMATION, PokedudeHandleMoveAnimation);
  set(C.CONTROLLER_PRINTSTRING, PokedudeHandlePrintString);
  set(C.CONTROLLER_PRINTSTRINGPLAYERONLY, PokedudeHandlePrintSelectionString);
  set(C.CONTROLLER_CHOOSEACTION, PokedudeHandleChooseAction);
  set(C.CONTROLLER_UNKNOWNYESNOBOX, PokedudeHandleUnknownYesNoBox);
  set(C.CONTROLLER_CHOOSEMOVE, PokedudeHandleChooseMove);
  set(C.CONTROLLER_OPENBAG, PokedudeHandleChooseItem);
  set(C.CONTROLLER_CHOOSEPOKEMON, PokedudeHandleChoosePokemon);
  set(C.CONTROLLER_23, PokedudeHandleCmd23);
  set(C.CONTROLLER_HEALTHBARUPDATE, PokedudeHandleHealthBarUpdate);
  set(C.CONTROLLER_EXPUPDATE, PokedudeHandleExpUpdate);
  set(C.CONTROLLER_STATUSICONUPDATE, PokedudeHandleStatusIconUpdate);
  set(C.CONTROLLER_STATUSANIMATION, PokedudeHandleStatusAnimation);
  set(C.CONTROLLER_STATUSXOR, PokedudeHandleStatusXor);
  set(C.CONTROLLER_DATATRANSFER, PokedudeHandleDataTransfer);
  set(C.CONTROLLER_DMA3TRANSFER, PokedudeHandleDMA3Transfer);
  set(C.CONTROLLER_PLAYBGM, PokedudeHandlePlayBGM);
  set(C.CONTROLLER_32, PokedudeHandleCmd32);
  set(C.CONTROLLER_TWORETURNVALUES, PokedudeHandleTwoReturnValues);
  set(C.CONTROLLER_CHOSENMONRETURNVALUE, PokedudeHandleChosenMonReturnValue);
  set(C.CONTROLLER_ONERETURNVALUE, PokedudeHandleOneReturnValue);
  set(C.CONTROLLER_ONERETURNVALUE_DUPLICATE, PokedudeHandleOneReturnValue_Duplicate);
  set(C.CONTROLLER_CLEARUNKVAR, PokedudeHandleCmd37);
  set(C.CONTROLLER_SETUNKVAR, PokedudeHandleCmd38);
  set(C.CONTROLLER_CLEARUNKFLAG, PokedudeHandleCmd39);
  set(C.CONTROLLER_TOGGLEUNKFLAG, PokedudeHandleCmd40);
  set(C.CONTROLLER_HITANIMATION, PokedudeHandleHitAnimation);
  set(C.CONTROLLER_CANTSWITCH, PokedudeHandleCmd42);
  set(C.CONTROLLER_PLAYSE, PokedudeHandlePlaySE);
  set(C.CONTROLLER_PLAYFANFARE, PokedudeHandlePlayFanfare);
  set(C.CONTROLLER_FAINTINGCRY, PokedudeHandleFaintingCry);
  set(C.CONTROLLER_INTROSLIDE, PokedudeHandleIntroSlide);
  set(C.CONTROLLER_INTROTRAINERBALLTHROW, PokedudeHandleIntroTrainerBallThrow);
  set(C.CONTROLLER_DRAWPARTYSTATUSSUMMARY, PokedudeHandleDrawPartyStatusSummary);
  set(C.CONTROLLER_HIDEPARTYSTATUSSUMMARY, PokedudeHandleHidePartyStatusSummary);
  set(C.CONTROLLER_ENDBOUNCE, PokedudeHandleEndBounceEffect);
  set(C.CONTROLLER_SPRITEINVISIBILITY, PokedudeHandleSpriteInvisibility);
  set(C.CONTROLLER_BATTLEANIMATION, PokedudeHandleBattleAnimation);
  set(C.CONTROLLER_LINKSTANDBYMSG, PokedudeHandleLinkStandbyMsg);
  set(C.CONTROLLER_RESETACTIONMOVESELECTION, PokedudeHandleResetActionMoveSelection);
  set(C.CONTROLLER_ENDLINKBATTLE, PokedudeHandleCmd55);
  set(C.CONTROLLER_TERMINATOR_NOP, PokedudeCmdEnd);
}

