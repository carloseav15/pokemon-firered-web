// battle_controller_opponent.c

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { tasks } from "../gba/tasks";
import { random } from "../random";
import { rom } from "../rom";
import { CreateSprite, DestroySprite, FreeSpriteOamMatrix, FreeSpritePaletteByTag, FreeSpriteTilesByTag, GetSpriteTileStartByTag, gSprites,
  IndexOfSpritePaletteTag, SpriteCallbackDummy, StartSpriteAnim, CreateInvisibleSprite, type Sprite } from "../hw/sprite";
import { DisableStruct } from "../generated/structs";
import {
  G, gBattleBufferA, gBattleControllerData, gBattleMonForms, gBattleSpritesDataPtr, gBattleStruct, gBattlerControllerFuncs, gBattlerPartyIndexes,
  gBattlerSpriteIds, gBattlerStatusSummaryTaskId, gBitTable, gDisplayedStringBattle, gHealthboxSpriteIds, gTransformedPersonalities,
} from "./globals";
import { gBattleMoves } from "./macros";
import { GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide } from "./util";
import {
  BtlController_EmitChosenMonReturnValue, BtlController_EmitDataTransfer, BtlController_EmitOneReturnValue, BtlController_EmitTwoReturnValues, gUnusedControllerStruct,
  BUFFER_B, decodeChooseMoveStruct, decodeHpAndStatus,
} from "./controllers";
import { CopyMonData, HandleGetMonData, HandleSetMonData, SetMonDataFromBuffer } from "./mon_transfer";
import { SpriteCB_FaintOpponentMon } from "./main_init";
import { GetMonData, GetSecretBaseTrainerPicIndex, gEnemyParty } from "../pokemon/mon";
import { GetTrainerTowerOpponentPic } from "../trainerTower";
import {
  BattleLoadOpponentMonSpriteGfx, ClearTemporarySpeciesSpriteData, CopyAllBattleSpritesInvisibilities, CopyBattleSpriteInvisibility,
  DecompressGhostFrontPic, DecompressTrainerFrontPic, FreeTrainerFrontPicPaletteAndTile, HideBattlerShadowSprite, InitAndLaunchChosenStatusAnimation,
  InitAndLaunchSpecialAnimation, IsBattleSEPlaying, IsMoveWithoutAnimation, SetBattlerShadowSpriteCallback, SetBattlerSpriteAffineMode,
  TryHandleLaunchBattleTableAnimation, TrySetBehindSubstituteSpriteBit, TryShinyAnimation, PlaySE12WithPanning, SpriteCB_WaitForBattlerBallReleaseAnim,
  DoHitAnimHealthboxEffect, IsBattlerSpritePresent,
} from "./gfx_sfx_util";
import {
  gMultiuseSpriteTemplate, SetMultiuseSpriteTemplateToPokemon, SetMultiuseSpriteTemplateToTrainerBack, GetBattlerSpriteCoord,
  GetBattlerSpriteDefault_Y, GetBattlerSpriteSubpriority, GetGhostSpriteDefault_Y, SpriteCB_TrainerSlideIn, DoMoveAnim, animState,
  StartAnimLinearTranslation, StoreSpriteCallbackInData6, SetSpritePrimaryCoordsFromSecondaryCoords,
} from "./anim";
import {
  CreatePartyStatusSummarySprites, LoadBattleBarGfx, MoveBattleBar, SetBattleBarStruct, SetHealthboxSpriteInvisible, SetHealthboxSpriteVisible,
  StartHealthboxSlideIn, Task_HidePartyStatusSummary, UpdateHealthboxAttribute, UpdateHpTextInHealthbox,
} from "./interface";
import { BattlePutTextOnWindow, BattleStringShouldBeColored, BufferStringBattle } from "./message";
import { IsTextPrinterActive } from "../hw/text";
import { HandleIntroSlide } from "./intro";
import { DoPokeballSendOutAnimation } from "./pokeball";
import { AI_TrySwitchOrUseItem, BattleAI_ChooseMoveOrAction, BattleAI_SetupAIData, GetMostSuitableMonToSwitchInto } from "./ai";
import { BtlCtrl_OakOldMan_SetState2Flag, BtlCtrl_OakOldMan_TestState2Flag, PrintOakText_HowDisappointing, PrintOakText_InflictingDamageIsKey,
  PrintOakText_OakNoRunningFromATrainer } from "./controller_oak_old_man";
import { gTrainerFrontPicCoords, gTrainerFrontPicPaletteTag, gTrainerFrontPicTag } from "./gfx_sfx_util";

const enemy = (i: number) => gEnemyParty[i];

function IsDoubleBattle(): boolean {
  return (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) !== 0;
}

function OpponentDummy(): void {}

export function SetControllerToOpponent(): void {
  gBattlerControllerFuncs[G.gActiveBattler] = OpponentBufferRunCommand;
}

function OpponentBufferRunCommand(): void {
  if (G.gBattleControllerExecFlags & gBitTable[G.gActiveBattler]) {
    const fn = sOpponentBufferCommands[gBattleBufferA[G.gActiveBattler][0]];
    if (fn) fn();
    else OpponentBufferExecCompleted();
  }
}

export function OpponentBufferExecCompleted(): void {
  gBattlerControllerFuncs[G.gActiveBattler] = OpponentBufferRunCommand;
  G.gBattleControllerExecFlags = (G.gBattleControllerExecFlags & ~gBitTable[G.gActiveBattler]) >>> 0;
}

/** OpponentHandleGetRawMonData/OpponentHandleSetRawMonData (battle_controller_opponent.c): raw
 * struct Pokemon byte-offset access isn't meaningful for the TS Pokemon objects (matching
 * PlayerHandleGetRawMonData/PlayerHandleSetRawMonData's own simplification). */
function OpponentHandleGetRawMonData(): void { OpponentBufferExecCompleted(); }
function OpponentHandleSetRawMonData(): void { OpponentBufferExecCompleted(); }

/** OpponentHandleLinkStandbyMsg (battle_controller_opponent.c). */
function OpponentHandleLinkStandbyMsg(): void { OpponentBufferExecCompleted(); }

/** OpponentHandleCmd55 (battle_controller_opponent.c): the link-battle-end callback restoration
 * (gMain.inBattle/gPreBattleCallback1/gMain.savedCallback) is link-only machinery this port
 * doesn't model; BATTLE_TYPE_LINK is never set here, so the branch is kept but never taken. */
function OpponentHandleCmd55(): void {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK && !(G.gBattleTypeFlags & C.BATTLE_TYPE_IS_MASTER)) {
    // link battle-end callback restoration: not modeled (see doc comment above).
  }
  OpponentBufferExecCompleted();
}

// These controller commands are explicit completion-only handlers in battle_controller_opponent.c.
function OpponentHandlePaletteFade(): void { OpponentBufferExecCompleted(); }
function OpponentHandleSuccessBallThrowAnim(): void { OpponentBufferExecCompleted(); }
function OpponentHandleBallThrowAnim(): void { OpponentBufferExecCompleted(); }
function OpponentHandlePause(): void { OpponentBufferExecCompleted(); }
function OpponentHandlePrintSelectionString(): void { OpponentBufferExecCompleted(); }
function OpponentHandleUnknownYesNoBox(): void { OpponentBufferExecCompleted(); }
function OpponentHandleCmd23(): void { OpponentBufferExecCompleted(); }
function OpponentHandleExpUpdate(): void { OpponentBufferExecCompleted(); }
function OpponentHandleStatusXor(): void { OpponentBufferExecCompleted(); }
function OpponentHandleDataTransfer(): void { OpponentBufferExecCompleted(); }
function OpponentHandleDMA3Transfer(): void { OpponentBufferExecCompleted(); }
function OpponentHandlePlayBGM(): void { OpponentBufferExecCompleted(); }
function OpponentHandleCmd32(): void { OpponentBufferExecCompleted(); }
function OpponentHandleTwoReturnValues(): void { OpponentBufferExecCompleted(); }
function OpponentHandleChosenMonReturnValue(): void { OpponentBufferExecCompleted(); }
function OpponentHandleOneReturnValue(): void { OpponentBufferExecCompleted(); }
function OpponentHandleOneReturnValue_Duplicate(): void { OpponentBufferExecCompleted(); }
function OpponentHandleCmd42(): void { OpponentBufferExecCompleted(); }
function OpponentHandleEndBounceEffect(): void { OpponentBufferExecCompleted(); }

/** OpponentHandleCmd37 (battle_controller_opponent.c): clear the legacy controller word. */
function OpponentHandleCmd37(): void {
  gUnusedControllerStruct.unk = 0;
  OpponentBufferExecCompleted();
}

/** OpponentHandleCmd38 (battle_controller_opponent.c): copy the command byte to the legacy word. */
function OpponentHandleCmd38(): void {
  gUnusedControllerStruct.unk = gBattleBufferA[G.gActiveBattler][1];
  OpponentBufferExecCompleted();
}

/** OpponentHandleCmd39 (battle_controller_opponent.c): clear the legacy controller flag. */
function OpponentHandleCmd39(): void {
  gUnusedControllerStruct.flag = 0;
  OpponentBufferExecCompleted();
}

/** OpponentHandleCmd40 (battle_controller_opponent.c): toggle the low legacy controller flag bit. */
function OpponentHandleCmd40(): void {
  gUnusedControllerStruct.flag ^= 1;
  OpponentBufferExecCompleted();
}

function CompleteOnBattlerSpriteCallbackDummy(): void {
  if (gSprites[gBattlerSpriteIds[G.gActiveBattler]].callback === SpriteCallbackDummy) OpponentBufferExecCompleted();
}

function FreeTrainerSpriteAfterSlide(): void {
  const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
  if (s.callback === SpriteCallbackDummy) {
    FreeTrainerFrontPicPaletteAndTile(s.oam.affineParam);
    s.oam.tileNum = s.data[5];
    FreeSpriteOamMatrix(s);
    DestroySprite(s);
    OpponentBufferExecCompleted();
  }
}

function Intro_DelayAndEnd(): void {
  const hb = gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler];
  hb.introEndDelay = (hb.introEndDelay - 1) & 0xff;
  if (hb.introEndDelay === 0xff) {
    hb.introEndDelay = 0;
    OpponentBufferExecCompleted();
  }
}

function Intro_WaitForShinyAnimAndHealthbox(): void {
  const b = G.gActiveBattler;
  const f = b ^ C.BIT_FLANK;
  let v = false;
  if (!IsDoubleBattle() || G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI) {
    if (gSprites[gHealthboxSpriteIds[b]].callback === SpriteCallbackDummy) v = true;
  } else if (gSprites[gHealthboxSpriteIds[b]].callback === SpriteCallbackDummy && gSprites[gHealthboxSpriteIds[f]].callback === gSprites[gHealthboxSpriteIds[b]].callback) {
    v = true;
  }
  if (sound.isCryPlaying()) v = false;
  const hb = gBattleSpritesDataPtr.healthBoxesData;
  if (v && hb[b].finishedShinyMonAnim && hb[f].finishedShinyMonAnim) {
    hb[b].triedShinyMonAnim = 0;
    hb[b].finishedShinyMonAnim = 0;
    hb[f].triedShinyMonAnim = 0;
    hb[f].finishedShinyMonAnim = 0;
    FreeSpriteTilesByTag(C.ANIM_TAG_GOLD_STARS);
    FreeSpritePaletteByTag(C.ANIM_TAG_GOLD_STARS);
    sound.setBgmVolume(256);
    hb[b].introEndDelay = 3;
    gBattlerControllerFuncs[b] = Intro_DelayAndEnd;
  }
}

function Intro_TryShinyAnimShowHealthbox(): void {
  const b = G.gActiveBattler;
  const f = b ^ C.BIT_FLANK;
  const hb = gBattleSpritesDataPtr.healthBoxesData;
  if (!hb[b].triedShinyMonAnim && !hb[b].ballAnimActive) TryShinyAnimation(b, enemy(gBattlerPartyIndexes[b]));
  if (!hb[f].triedShinyMonAnim && !hb[f].ballAnimActive) TryShinyAnimation(f, enemy(gBattlerPartyIndexes[f]));
  if (!hb[b].ballAnimActive && !hb[f].ballAnimActive) {
    if (IsDoubleBattle() && !(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI)) {
      DestroySprite(gSprites[gBattleControllerData[f]]);
      UpdateHealthboxAttribute(gHealthboxSpriteIds[f], enemy(gBattlerPartyIndexes[f]), C.HEALTHBOX_ALL);
      StartHealthboxSlideIn(f);
      SetHealthboxSpriteVisible(gHealthboxSpriteIds[f]);
      SetBattlerShadowSpriteCallback(f, GetMonData(enemy(gBattlerPartyIndexes[f]), C.MON_DATA_SPECIES));
    }
    DestroySprite(gSprites[gBattleControllerData[b]]);
    UpdateHealthboxAttribute(gHealthboxSpriteIds[b], enemy(gBattlerPartyIndexes[b]), C.HEALTHBOX_ALL);
    StartHealthboxSlideIn(b);
    SetHealthboxSpriteVisible(gHealthboxSpriteIds[b]);
    SetBattlerShadowSpriteCallback(b, GetMonData(enemy(gBattlerPartyIndexes[b]), C.MON_DATA_SPECIES));
    gBattleSpritesDataPtr.animationData.introAnimActive = 0;
    gBattlerControllerFuncs[b] = Intro_WaitForShinyAnimAndHealthbox;
  }
}

function TryShinyAnimAfterMonAnim(): void {
  const b = G.gActiveBattler;
  const s = gSprites[gBattlerSpriteIds[b]];
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  if (s.animEnded && s.x2 === 0) {
    if (!hb.triedShinyMonAnim) {
      TryShinyAnimation(b, enemy(gBattlerPartyIndexes[b]));
    } else if (hb.finishedShinyMonAnim) {
      hb.triedShinyMonAnim = 0;
      hb.finishedShinyMonAnim = 0;
      FreeSpriteTilesByTag(C.ANIM_TAG_GOLD_STARS);
      FreeSpritePaletteByTag(C.ANIM_TAG_GOLD_STARS);
      OpponentBufferExecCompleted();
    }
  }
}

function CompleteOnHealthbarDone(): void {
  const b = G.gActiveBattler;
  const hpValue = MoveBattleBar(b, gHealthboxSpriteIds[b], C.HEALTH_BAR, 0);
  SetHealthboxSpriteVisible(gHealthboxSpriteIds[b]);
  if (hpValue !== -1) {
    UpdateHpTextInHealthbox(gHealthboxSpriteIds[b], hpValue, C.HP_CURRENT);
  } else if (!BtlCtrl_OakOldMan_TestState2Flag(1) && G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE) {
    BtlCtrl_OakOldMan_SetState2Flag(1);
    gBattlerControllerFuncs[b] = PrintOakText_InflictingDamageIsKey;
  } else {
    OpponentBufferExecCompleted();
  }
}

function HideHealthboxAfterMonFaint(): void {
  if (!gSprites[gBattlerSpriteIds[G.gActiveBattler]].inUse) {
    SetHealthboxSpriteInvisible(gHealthboxSpriteIds[G.gActiveBattler]);
    OpponentBufferExecCompleted();
  }
}

function FreeMonSpriteAfterSwitchOutAnim(): void {
  const b = G.gActiveBattler;
  if (!gBattleSpritesDataPtr.healthBoxesData[b].specialAnimActive) {
    const s = gSprites[gBattlerSpriteIds[b]];
    FreeSpriteOamMatrix(s);
    DestroySprite(s);
    HideBattlerShadowSprite(b);
    SetHealthboxSpriteInvisible(gHealthboxSpriteIds[b]);
    OpponentBufferExecCompleted();
  }
}

function CompleteOnInactiveTextPrinter(): void {
  if (!IsTextPrinterActive(0)) OpponentBufferExecCompleted();
}

function DoHitAnimBlinkSpriteEffect(): void {
  const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
  if (s.data[1] === 32) {
    s.data[1] = 0;
    s.invisible = false;
    G.gDoingBattleAnim = false;
    OpponentBufferExecCompleted();
  } else {
    if (s.data[1] % 4 === 0) s.invisible = !s.invisible;
    s.data[1]++;
  }
}

function SwitchIn_ShowSubstitute(): void {
  const b = G.gActiveBattler;
  if (gSprites[gHealthboxSpriteIds[b]].callback === SpriteCallbackDummy) {
    if (gBattleSpritesDataPtr.battlerData[b].behindSubstitute) InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_MON_TO_SUBSTITUTE);
    gBattlerControllerFuncs[b] = SwitchIn_HandleSoundAndEnd;
  }
}

function SwitchIn_HandleSoundAndEnd(): void {
  if (!gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].specialAnimActive && !sound.isCryPlaying()) {
    sound.setBgmVolume(0x100);
    OpponentBufferExecCompleted();
  }
}

function SwitchIn_ShowHealthbox(): void {
  const b = G.gActiveBattler;
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  if (hb.finishedShinyMonAnim) {
    hb.triedShinyMonAnim = 0;
    hb.finishedShinyMonAnim = 0;
    FreeSpriteTilesByTag(C.ANIM_TAG_GOLD_STARS);
    FreeSpritePaletteByTag(C.ANIM_TAG_GOLD_STARS);
    StartSpriteAnim(gSprites[gBattlerSpriteIds[b]], 0);
    UpdateHealthboxAttribute(gHealthboxSpriteIds[b], enemy(gBattlerPartyIndexes[b]), C.HEALTHBOX_ALL);
    StartHealthboxSlideIn(b);
    SetHealthboxSpriteVisible(gHealthboxSpriteIds[b]);
    CopyBattleSpriteInvisibility(b);
    gBattlerControllerFuncs[b] = SwitchIn_ShowSubstitute;
  }
}

function SwitchIn_TryShinyAnim(): void {
  const b = G.gActiveBattler;
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  if (!hb.triedShinyMonAnim && !hb.ballAnimActive) TryShinyAnimation(b, enemy(gBattlerPartyIndexes[b]));
  if (gSprites[gBattleControllerData[b]].callback === SpriteCallbackDummy && !hb.ballAnimActive) {
    DestroySprite(gSprites[gBattleControllerData[b]]);
    SetBattlerShadowSpriteCallback(b, GetMonData(enemy(gBattlerPartyIndexes[b]), C.MON_DATA_SPECIES));
    gBattlerControllerFuncs[b] = SwitchIn_ShowHealthbox;
  }
}

function CompleteOnFinishedStatusAnimation(): void {
  if (!gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].statusAnimActive) OpponentBufferExecCompleted();
}

function CompleteOnFinishedBattleAnimation(): void {
  if (!gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler].animFromTableActive) OpponentBufferExecCompleted();
}

function OpponentHandleGetMonData(): void {
  const [data, size] = HandleGetMonData(enemy, (monId, dst, offset) => GetOpponentMonData(monId, dst, offset));
  BtlController_EmitDataTransfer(BUFFER_B, size, data);
  OpponentBufferExecCompleted();
}

/** GetOpponentMonData (battle_controller_opponent.c): copy the requested opponent fields to the transfer buffer. */
function GetOpponentMonData(monId: number, dst: Uint8Array, offset: number): number {
  return CopyMonData(enemy(monId), gBattleBufferA[G.gActiveBattler][1], dst, offset);
}

function OpponentHandleSetMonData(): void {
  HandleSetMonData(enemy, (monId) => SetOpponentMonData(monId));
  OpponentBufferExecCompleted();
}

/** SetOpponentMonData (battle_controller_opponent.c): apply the active request to the selected opponent-party member. */
function SetOpponentMonData(monId: number): void {
  SetMonDataFromBuffer(enemy(monId));
}

function OpponentHandleLoadMonSprite(): void {
  const b = G.gActiveBattler;
  const mon = enemy(gBattlerPartyIndexes[b]);
  const species = GetMonData(mon, C.MON_DATA_SPECIES);
  let y: number;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_GHOST) {
    DecompressGhostFrontPic(mon, b);
    y = GetGhostSpriteDefault_Y(b);
    gBattleSpritesDataPtr.healthBoxesData[b].triedShinyMonAnim = 1;
    gBattleSpritesDataPtr.healthBoxesData[b].finishedShinyMonAnim = 1;
  } else {
    BattleLoadOpponentMonSpriteGfx(mon, b);
    y = GetBattlerSpriteDefault_Y(b);
  }
  SetMultiuseSpriteTemplateToPokemon(species, GetBattlerPosition(b));
  gBattlerSpriteIds[b] = CreateSprite(gMultiuseSpriteTemplate(), GetBattlerSpriteCoord(b, C.BATTLER_COORD_X_2), y, GetBattlerSpriteSubpriority(b));
  const s = gSprites[gBattlerSpriteIds[b]];
  s.x2 = -C.DISPLAY_WIDTH;
  s.data[0] = b;
  s.data[2] = species;
  s.oam.paletteNum = b;
  StartSpriteAnim(s, gBattleMonForms[b]);
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_GHOST)) SetBattlerShadowSpriteCallback(b, species);
  gBattlerControllerFuncs[b] = TryShinyAnimAfterMonAnim;
}

function OpponentHandleSwitchInAnim(): void {
  const b = G.gActiveBattler;
  gBattleStruct.monToSwitchIntoId[b] = 6;
  gBattlerPartyIndexes[b] = gBattleBufferA[b][1];
  StartSendOutAnim(b, gBattleBufferA[b][2] !== 0);
  gBattlerControllerFuncs[b] = SwitchIn_TryShinyAnim;
}

function StartSendOutAnim(battlerId: number, dontClearSubstituteBit: boolean): void {
  ClearTemporarySpeciesSpriteData(battlerId, dontClearSubstituteBit ? 1 : 0);
  gBattlerPartyIndexes[battlerId] = gBattleBufferA[battlerId][1];
  const mon = enemy(gBattlerPartyIndexes[battlerId]);
  const species = GetMonData(mon, C.MON_DATA_SPECIES);
  gBattleControllerData[battlerId] = CreateInvisibleSprite(SpriteCB_WaitForBattlerBallReleaseAnim);
  BattleLoadOpponentMonSpriteGfx(mon, battlerId);
  SetMultiuseSpriteTemplateToPokemon(species, GetBattlerPosition(battlerId));
  gBattlerSpriteIds[battlerId] = CreateSprite(gMultiuseSpriteTemplate(), GetBattlerSpriteCoord(battlerId, C.BATTLER_COORD_X_2),
    GetBattlerSpriteDefault_Y(battlerId), GetBattlerSpriteSubpriority(battlerId));
  const s = gSprites[gBattlerSpriteIds[battlerId]];
  s.data[0] = battlerId;
  s.data[2] = species;
  gSprites[gBattleControllerData[battlerId]].data[1] = gBattlerSpriteIds[battlerId];
  s.oam.paletteNum = battlerId;
  StartSpriteAnim(s, gBattleMonForms[battlerId]);
  s.invisible = true;
  s.callback = SpriteCallbackDummy;
  gSprites[gBattleControllerData[battlerId]].data[0] = DoPokeballSendOutAnimation(0, C.POKEBALL_OPPONENT_SENDOUT);
}

function OpponentHandleReturnMonToBall(): void {
  const b = G.gActiveBattler;
  if (!gBattleBufferA[b][1]) {
    gBattleSpritesDataPtr.healthBoxesData[b].animationState = 0;
    gBattlerControllerFuncs[b] = DoSwitchOutAnimation;
  } else {
    const s = gSprites[gBattlerSpriteIds[b]];
    FreeSpriteOamMatrix(s);
    DestroySprite(s);
    HideBattlerShadowSprite(b);
    SetHealthboxSpriteInvisible(gHealthboxSpriteIds[b]);
    OpponentBufferExecCompleted();
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
        InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_SWITCH_OUT_OPPONENT_MON);
        gBattlerControllerFuncs[b] = FreeMonSpriteAfterSwitchOutAnim;
      }
      break;
  }
}

function opponentTrainerPic(): number {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER_TOWER) return GetTrainerTowerOpponentPic();
  if (G.gTrainerBattleOpponent_A === C.TRAINER_SECRET_BASE) return GetSecretBaseTrainerPicIndex();
  return rom.trainers[G.gTrainerBattleOpponent_A]?.pic ?? 0;
}

function createTrainerFrontSprite(subpriority: number): Sprite {
  const b = G.gActiveBattler;
  const trainerPicId = opponentTrainerPic();
  DecompressTrainerFrontPic(trainerPicId, b);
  SetMultiuseSpriteTemplateToTrainerBack(trainerPicId, GetBattlerPosition(b));
  gBattlerSpriteIds[b] = CreateSprite(gMultiuseSpriteTemplate(), 176, (8 - gTrainerFrontPicCoords(trainerPicId).size) * 4 + 40, subpriority);
  const s = gSprites[gBattlerSpriteIds[b]];
  s.oam.paletteNum = IndexOfSpritePaletteTag(gTrainerFrontPicPaletteTag(trainerPicId));
  s.data[5] = s.oam.tileNum;
  s.oam.tileNum = GetSpriteTileStartByTag(gTrainerFrontPicTag(trainerPicId));
  s.oam.affineParam = trainerPicId;
  s.callback = SpriteCB_TrainerSlideIn;
  return s;
}

function OpponentHandleDrawTrainerPic(): void {
  const s = createTrainerFrontSprite(GetBattlerSpriteSubpriority(G.gActiveBattler));
  s.x2 = -C.DISPLAY_WIDTH;
  s.data[0] = 2;
  gBattlerControllerFuncs[G.gActiveBattler] = CompleteOnBattlerSpriteCallbackDummy;
}

function OpponentHandleTrainerSlide(): void {
  const s = createTrainerFrontSprite(30);
  s.x2 = 96;
  s.x += 32;
  s.data[0] = -2;
  gBattlerControllerFuncs[G.gActiveBattler] = CompleteOnBattlerSpriteCallbackDummy;
}

function OpponentHandleTrainerSlideBack(): void {
  const s = gSprites[gBattlerSpriteIds[G.gActiveBattler]];
  SetSpritePrimaryCoordsFromSecondaryCoords(s);
  s.data[0] = 35;
  s.data[2] = 280;
  s.data[4] = s.y;
  s.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(s, SpriteCallbackDummy);
  gBattlerControllerFuncs[G.gActiveBattler] = FreeTrainerSpriteAfterSlide;
}

function OpponentHandleFaintAnimation(): void {
  const b = G.gActiveBattler;
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  if (!hb.animationState) {
    if (gBattleSpritesDataPtr.battlerData[b].behindSubstitute) InitAndLaunchSpecialAnimation(b, b, b, C.B_ANIM_SUBSTITUTE_TO_MON);
    hb.animationState++;
  } else if (!hb.specialAnimActive) {
    hb.animationState = 0;
    PlaySE12WithPanning(C.SE_FAINT, C.SOUND_PAN_TARGET);
    gSprites[gBattlerSpriteIds[b]].callback = SpriteCB_FaintOpponentMon;
    gBattlerControllerFuncs[b] = HideHealthboxAfterMonFaint;
  }
}

function OpponentHandleMoveAnimation(): void {
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
      OpponentBufferExecCompleted();
    } else {
      gBattleSpritesDataPtr.healthBoxesData[b].animationState = 0;
      gBattlerControllerFuncs[b] = OpponentDoMoveAnimation;
    }
  }
}

function OpponentDoMoveAnimation(): void {
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
        OpponentBufferExecCompleted();
      }
      break;
  }
}

function OpponentHandlePrintString(): void {
  const b = G.gActiveBattler;
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  const stringId = gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8);
  BufferStringBattle(stringId);
  if (BattleStringShouldBeColored(stringId)) BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG | C.B_TEXT_FLAG_NPC_CONTEXT_FONT);
  else BattlePutTextOnWindow(gDisplayedStringBattle, C.B_WIN_MSG);
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE) {
    switch (stringId) {
      case 0x17f:
        gBattlerControllerFuncs[b] = PrintOakText_HowDisappointing;
        return;
      case 0xe3:
        gBattlerControllerFuncs[b] = PrintOakText_OakNoRunningFromATrainer;
        return;
    }
  }
  gBattlerControllerFuncs[b] = CompleteOnInactiveTextPrinter;
}

function OpponentHandleChooseAction(): void {
  AI_TrySwitchOrUseItem();
  OpponentBufferExecCompleted();
}

function OpponentHandleChooseMove(): void {
  const b = G.gActiveBattler;
  const moveInfo = decodeChooseMoveStruct(gBattleBufferA[b], 4);
  if (G.gBattleTypeFlags & (C.BATTLE_TYPE_TRAINER | C.BATTLE_TYPE_FIRST_BATTLE | C.BATTLE_TYPE_SAFARI | C.BATTLE_TYPE_ROAMER)) {
    BattleAI_SetupAIData();
    const chosenMoveId = BattleAI_ChooseMoveOrAction();
    switch (chosenMoveId) {
      case C.AI_CHOICE_WATCH:
        BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_SAFARI_WATCH_CAREFULLY, 0);
        break;
      case C.AI_CHOICE_FLEE:
        BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_RUN, 0);
        break;
      default: {
        const target = gBattleMoves(moveInfo.moves[chosenMoveId]).target;
        if (target & (C.MOVE_TARGET_USER_OR_SELECTED | C.MOVE_TARGET_USER)) G.gBattlerTarget = b;
        if (target & C.MOVE_TARGET_BOTH) {
          G.gBattlerTarget = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
          if (G.gAbsentBattlerFlags & gBitTable[G.gBattlerTarget]) G.gBattlerTarget = GetBattlerAtPosition(C.B_POSITION_PLAYER_RIGHT);
        }
        BtlController_EmitTwoReturnValues(BUFFER_B, 10, chosenMoveId | (G.gBattlerTarget << 8));
        break;
      }
    }
    OpponentBufferExecCompleted();
  } else {
    let chosenMoveId: number;
    let move: number;
    do {
      chosenMoveId = random() & 3;
      move = moveInfo.moves[chosenMoveId];
    } while (move === C.MOVE_NONE);
    if (gBattleMoves(move).target & (C.MOVE_TARGET_USER_OR_SELECTED | C.MOVE_TARGET_USER)) BtlController_EmitTwoReturnValues(BUFFER_B, 10, chosenMoveId | (b << 8));
    else if (IsDoubleBattle()) BtlController_EmitTwoReturnValues(BUFFER_B, 10, chosenMoveId | (GetBattlerAtPosition(random() & 2) << 8));
    else BtlController_EmitTwoReturnValues(BUFFER_B, 10, chosenMoveId | (GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT) << 8));
    OpponentBufferExecCompleted();
  }
}

function OpponentHandleChooseItem(): void {
  const k = (G.gActiveBattler >> 1) * 2;
  BtlController_EmitOneReturnValue(BUFFER_B, gBattleStruct.chosenItem[k] | (gBattleStruct.chosenItem[k + 1] << 8));
  OpponentBufferExecCompleted();
}

function OpponentHandleChoosePokemon(): void {
  const b = G.gActiveBattler;
  const k = GetBattlerPosition(b) >> 1;
  let chosenMonId: number;
  if (gBattleStruct.AI_monToSwitchIntoId[k] === 6) {
    chosenMonId = GetMostSuitableMonToSwitchInto();
    if (chosenMonId === 6) {
      let battler1: number;
      let battler2: number;
      if (!IsDoubleBattle()) {
        battler2 = battler1 = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
      } else {
        battler1 = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
        battler2 = GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT);
      }
      for (chosenMonId = 0; chosenMonId < 6; chosenMonId++) {
        if (GetMonData(enemy(chosenMonId), C.MON_DATA_HP) !== 0 && chosenMonId !== gBattlerPartyIndexes[battler1] && chosenMonId !== gBattlerPartyIndexes[battler2]) break;
      }
    }
  } else {
    chosenMonId = gBattleStruct.AI_monToSwitchIntoId[k];
    gBattleStruct.AI_monToSwitchIntoId[k] = 6;
  }
  gBattleStruct.monToSwitchIntoId[b] = chosenMonId;
  BtlController_EmitChosenMonReturnValue(BUFFER_B, chosenMonId, [0, 0, 0]);
  OpponentBufferExecCompleted();
}

function OpponentHandleHealthBarUpdate(): void {
  const b = G.gActiveBattler;
  LoadBattleBarGfx(0);
  const hpVal = (((gBattleBufferA[b][3] << 8) | gBattleBufferA[b][2]) << 16) >> 16;
  const mon = enemy(gBattlerPartyIndexes[b]);
  const maxHP = GetMonData(mon, C.MON_DATA_MAX_HP);
  if (hpVal !== C.INSTANT_HP_BAR_DROP) SetBattleBarStruct(b, gHealthboxSpriteIds[b], maxHP, GetMonData(mon, C.MON_DATA_HP), hpVal);
  else SetBattleBarStruct(b, gHealthboxSpriteIds[b], maxHP, 0, hpVal);
  gBattlerControllerFuncs[b] = CompleteOnHealthbarDone;
}

function OpponentHandleStatusIconUpdate(): void {
  const b = G.gActiveBattler;
  if (!IsBattleSEPlaying(b)) {
    UpdateHealthboxAttribute(gHealthboxSpriteIds[b], enemy(gBattlerPartyIndexes[b]), C.HEALTHBOX_STATUS_ICON);
    gBattleSpritesDataPtr.healthBoxesData[b].statusAnimActive = 0;
    gBattlerControllerFuncs[b] = CompleteOnFinishedStatusAnimation;
  }
}

function OpponentHandleStatusAnimation(): void {
  const b = G.gActiveBattler;
  if (!IsBattleSEPlaying(b)) {
    const buf = gBattleBufferA[b];
    InitAndLaunchChosenStatusAnimation(buf[1] !== 0, (buf[2] | (buf[3] << 8) | (buf[4] << 16) | (buf[5] << 24)) >>> 0);
    gBattlerControllerFuncs[b] = CompleteOnFinishedStatusAnimation;
  }
}

function OpponentHandleHitAnimation(): void {
  const b = G.gActiveBattler;
  const s = gSprites[gBattlerSpriteIds[b]];
  if (s.invisible) {
    OpponentBufferExecCompleted();
  } else {
    G.gDoingBattleAnim = true;
    s.data[1] = 0;
    DoHitAnimHealthboxEffect(b);
    gBattlerControllerFuncs[b] = DoHitAnimBlinkSpriteEffect;
  }
}

function OpponentHandlePlaySE(): void {
  const b = G.gActiveBattler;
  const pan = GetBattlerSide(b) === C.B_SIDE_PLAYER ? C.SOUND_PAN_ATTACKER : C.SOUND_PAN_TARGET;
  PlaySE12WithPanning(gBattleBufferA[b][1] | (gBattleBufferA[b][2] << 8), pan);
  OpponentBufferExecCompleted();
}

function OpponentHandlePlayFanfare(): void {
  sound.playFanfare(gBattleBufferA[G.gActiveBattler][1] | (gBattleBufferA[G.gActiveBattler][2] << 8));
  OpponentBufferExecCompleted();
}

function OpponentHandleFaintingCry(): void {
  sound.PlayCry_ByMode(GetMonData(enemy(gBattlerPartyIndexes[G.gActiveBattler]), C.MON_DATA_SPECIES), 25, C.CRY_MODE_FAINT);
  OpponentBufferExecCompleted();
}

function OpponentHandleIntroSlide(): void {
  HandleIntroSlide(gBattleBufferA[G.gActiveBattler][1]);
  G.gIntroSlideFlags |= 1;
  OpponentBufferExecCompleted();
}

function OpponentHandleIntroTrainerBallThrow(): void {
  const b = G.gActiveBattler;
  const s = gSprites[gBattlerSpriteIds[b]];
  SetSpritePrimaryCoordsFromSecondaryCoords(s);
  s.data[0] = 35;
  s.data[2] = 280;
  s.data[4] = s.y;
  s.callback = StartAnimLinearTranslation;
  StoreSpriteCallbackInData6(s, SpriteCB_FreeOpponentSprite);
  const taskId = tasks.create(Task_StartSendOutAnim, 5);
  tasks.tasks[taskId].data[0] = b;
  if (gBattleSpritesDataPtr.healthBoxesData[b].partyStatusSummaryShown) tasks.tasks[gBattlerStatusSummaryTaskId[b]].func = Task_HidePartyStatusSummary;
  gBattleSpritesDataPtr.animationData.introAnimActive = 1;
  gBattlerControllerFuncs[b] = OpponentDummy;
}

function SpriteCB_FreeOpponentSprite(sprite: Sprite): void {
  FreeTrainerFrontPicPaletteAndTile(sprite.oam.affineParam);
  sprite.oam.tileNum = sprite.data[5];
  FreeSpriteOamMatrix(sprite);
  DestroySprite(sprite);
}

function Task_StartSendOutAnim(taskId: number): void {
  const saved = G.gActiveBattler;
  const b = (G.gActiveBattler = tasks.tasks[taskId].data[0]);
  gBattleBufferA[b][1] = gBattlerPartyIndexes[b];
  StartSendOutAnim(b, false);
  if (IsDoubleBattle() && !(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI)) {
    const f = b ^ C.BIT_FLANK;
    G.gActiveBattler = f;
    gBattleBufferA[f][1] = gBattlerPartyIndexes[f];
    StartSendOutAnim(f, false);
    G.gActiveBattler = b;
  }
  gBattlerControllerFuncs[b] = Intro_TryShinyAnimShowHealthbox;
  G.gActiveBattler = saved;
  tasks.destroy(taskId);
}

function OpponentHandleDrawPartyStatusSummary(): void {
  const b = G.gActiveBattler;
  const hb = gBattleSpritesDataPtr.healthBoxesData[b];
  if (gBattleBufferA[b][1] && GetBattlerSide(b) === C.B_SIDE_PLAYER) {
    OpponentBufferExecCompleted();
    return;
  }
  hb.partyStatusSummaryShown = 1;
  if (gBattleBufferA[b][2]) {
    if (hb.opponentDrawPartyStatusSummaryDelay < 2) {
      hb.opponentDrawPartyStatusSummaryDelay++;
      return;
    }
    hb.opponentDrawPartyStatusSummaryDelay = 0;
  }
  gBattlerStatusSummaryTaskId[b] = CreatePartyStatusSummarySprites(b, decodeHpAndStatus(gBattleBufferA[b], 4), gBattleBufferA[b][1], gBattleBufferA[b][2]);
  hb.partyStatusDelayTimer = 0;
  if (gBattleBufferA[b][2]) hb.partyStatusDelayTimer = 0x5d;
  gBattlerControllerFuncs[b] = EndDrawPartyStatusSummary;
}

function EndDrawPartyStatusSummary(): void {
  const hb = gBattleSpritesDataPtr.healthBoxesData[G.gActiveBattler];
  if (hb.partyStatusDelayTimer++ > 0x5c) {
    hb.partyStatusDelayTimer = 0;
    OpponentBufferExecCompleted();
  }
}

function OpponentHandleHidePartyStatusSummary(): void {
  const b = G.gActiveBattler;
  if (gBattleSpritesDataPtr.healthBoxesData[b].partyStatusSummaryShown) tasks.tasks[gBattlerStatusSummaryTaskId[b]].func = Task_HidePartyStatusSummary;
  OpponentBufferExecCompleted();
}

function OpponentHandleSpriteInvisibility(): void {
  const b = G.gActiveBattler;
  if (IsBattlerSpritePresent(b)) {
    gSprites[gBattlerSpriteIds[b]].invisible = gBattleBufferA[b][1] !== 0;
    CopyBattleSpriteInvisibility(b);
  }
  OpponentBufferExecCompleted();
}

function OpponentHandleBattleAnimation(): void {
  const b = G.gActiveBattler;
  if (!IsBattleSEPlaying(b)) {
    const animationId = gBattleBufferA[b][1];
    const argument = gBattleBufferA[b][2] | (gBattleBufferA[b][3] << 8);
    if (TryHandleLaunchBattleTableAnimation(b, b, b, animationId, argument)) OpponentBufferExecCompleted();
    else gBattlerControllerFuncs[b] = CompleteOnFinishedBattleAnimation;
  }
}

/** OpponentHandleResetActionMoveSelection (battle_controller_opponent.c). */
function OpponentHandleResetActionMoveSelection(): void {
  OpponentBufferExecCompleted();
}

function OpponentCmdEnd(): void {}

const sOpponentBufferCommands: Record<number, () => void> = {
  [C.CONTROLLER_GETMONDATA]: OpponentHandleGetMonData,
  [C.CONTROLLER_GETRAWMONDATA]: OpponentHandleGetRawMonData,
  [C.CONTROLLER_SETMONDATA]: OpponentHandleSetMonData,
  [C.CONTROLLER_SETRAWMONDATA]: OpponentHandleSetRawMonData,
  [C.CONTROLLER_LOADMONSPRITE]: OpponentHandleLoadMonSprite,
  [C.CONTROLLER_SWITCHINANIM]: OpponentHandleSwitchInAnim,
  [C.CONTROLLER_RETURNMONTOBALL]: OpponentHandleReturnMonToBall,
  [C.CONTROLLER_DRAWTRAINERPIC]: OpponentHandleDrawTrainerPic,
  [C.CONTROLLER_TRAINERSLIDE]: OpponentHandleTrainerSlide,
  [C.CONTROLLER_TRAINERSLIDEBACK]: OpponentHandleTrainerSlideBack,
  [C.CONTROLLER_FAINTANIMATION]: OpponentHandleFaintAnimation,
  [C.CONTROLLER_PALETTEFADE]: OpponentHandlePaletteFade,
  [C.CONTROLLER_SUCCESSBALLTHROWANIM]: OpponentHandleSuccessBallThrowAnim,
  [C.CONTROLLER_BALLTHROWANIM]: OpponentHandleBallThrowAnim,
  [C.CONTROLLER_PAUSE]: OpponentHandlePause,
  [C.CONTROLLER_MOVEANIMATION]: OpponentHandleMoveAnimation,
  [C.CONTROLLER_PRINTSTRING]: OpponentHandlePrintString,
  [C.CONTROLLER_PRINTSTRINGPLAYERONLY]: OpponentHandlePrintSelectionString,
  [C.CONTROLLER_CHOOSEACTION]: OpponentHandleChooseAction,
  [C.CONTROLLER_UNKNOWNYESNOBOX]: OpponentHandleUnknownYesNoBox,
  [C.CONTROLLER_CHOOSEMOVE]: OpponentHandleChooseMove,
  [C.CONTROLLER_OPENBAG]: OpponentHandleChooseItem,
  [C.CONTROLLER_CHOOSEPOKEMON]: OpponentHandleChoosePokemon,
  [C.CONTROLLER_23]: OpponentHandleCmd23,
  [C.CONTROLLER_HEALTHBARUPDATE]: OpponentHandleHealthBarUpdate,
  [C.CONTROLLER_EXPUPDATE]: OpponentHandleExpUpdate,
  [C.CONTROLLER_STATUSICONUPDATE]: OpponentHandleStatusIconUpdate,
  [C.CONTROLLER_STATUSANIMATION]: OpponentHandleStatusAnimation,
  [C.CONTROLLER_STATUSXOR]: OpponentHandleStatusXor,
  [C.CONTROLLER_DATATRANSFER]: OpponentHandleDataTransfer,
  [C.CONTROLLER_DMA3TRANSFER]: OpponentHandleDMA3Transfer,
  [C.CONTROLLER_PLAYBGM]: OpponentHandlePlayBGM,
  [C.CONTROLLER_32]: OpponentHandleCmd32,
  [C.CONTROLLER_TWORETURNVALUES]: OpponentHandleTwoReturnValues,
  [C.CONTROLLER_CHOSENMONRETURNVALUE]: OpponentHandleChosenMonReturnValue,
  [C.CONTROLLER_ONERETURNVALUE]: OpponentHandleOneReturnValue,
  [C.CONTROLLER_ONERETURNVALUE_DUPLICATE]: OpponentHandleOneReturnValue_Duplicate,
  [C.CONTROLLER_CLEARUNKVAR]: OpponentHandleCmd37,
  [C.CONTROLLER_SETUNKVAR]: OpponentHandleCmd38,
  [C.CONTROLLER_CLEARUNKFLAG]: OpponentHandleCmd39,
  [C.CONTROLLER_TOGGLEUNKFLAG]: OpponentHandleCmd40,
  [C.CONTROLLER_HITANIMATION]: OpponentHandleHitAnimation,
  [C.CONTROLLER_CANTSWITCH]: OpponentHandleCmd42,
  [C.CONTROLLER_PLAYSE]: OpponentHandlePlaySE,
  [C.CONTROLLER_PLAYFANFARE]: OpponentHandlePlayFanfare,
  [C.CONTROLLER_FAINTINGCRY]: OpponentHandleFaintingCry,
  [C.CONTROLLER_INTROSLIDE]: OpponentHandleIntroSlide,
  [C.CONTROLLER_INTROTRAINERBALLTHROW]: OpponentHandleIntroTrainerBallThrow,
  [C.CONTROLLER_DRAWPARTYSTATUSSUMMARY]: OpponentHandleDrawPartyStatusSummary,
  [C.CONTROLLER_HIDEPARTYSTATUSSUMMARY]: OpponentHandleHidePartyStatusSummary,
  [C.CONTROLLER_ENDBOUNCE]: OpponentHandleEndBounceEffect,
  [C.CONTROLLER_SPRITEINVISIBILITY]: OpponentHandleSpriteInvisibility,
  [C.CONTROLLER_BATTLEANIMATION]: OpponentHandleBattleAnimation,
  [C.CONTROLLER_LINKSTANDBYMSG]: OpponentHandleLinkStandbyMsg,
  [C.CONTROLLER_RESETACTIONMOVESELECTION]: OpponentHandleResetActionMoveSelection,
  [C.CONTROLLER_ENDLINKBATTLE]: OpponentHandleCmd55,
  [C.CONTROLLER_TERMINATOR_NOP]: OpponentCmdEnd,
};
