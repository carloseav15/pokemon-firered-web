// battle_main.c: battle flow (intro, turn loop, actions, end of battle).

import * as C from "../generated/constants";
import { random } from "../random";
import { rom } from "../rom";
import { flagGet, save } from "../save";
import { BS, r8, scriptTable } from "./bscript";
import { FreeBattleResources, G, gActionsByTurnOrder, gActionSelectionCursor, gBattleBufferB, gBattleCommunication, gBattleMons, gBattlerByTurnOrder, gBattlerControllerFuncs, gBattleResources, gBattleResults, gBattlerPartyIndexes, gBattleScripting, gBattleStruct, gBattleTextBuff1, gBattleTextBuff2, gBitTable, gChosenActionByBattler, gChosenMoveByBattler, gDisableStructs, gEnigmaBerries, gLastHitBy, gLastHitByType, gLastLandedMoves, gLastMoves, gLastPrintedMoves, gLastResultingMoves, gLockedMoves, gBattlePartyCurrentOrder, gMoveSelectionCursor, gProtectStructs, gSelectionBattleScripts, gSideStatuses, gSideTimers, gSpecialStatuses, gStatuses3, gWishFutureKnock } from "./globals";
import { div, gBattleMoves, IS_BATTLER_OF_TYPE, s8, STATUS2_INFATUATED_WITH, STATUS3_ALWAYS_HITS_TURN } from "./macros";
import { AbilityBattleEffects, AreAllMovesUnusable, BattleScriptExecute, CancelMultiTurnMoves, ClearFuryCutterDestinyBondGrudge, DoBattlerEndTurnEffects, DoFieldEndTurnEffects, GetAbilityBySpecies, GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide, GetMoveTarget, HandleAction_RunBattleScript, HandleFaintedMonActions, HandleWishPerishSongOnTurnEnd, IS_BATTLE_TYPE_GHOST_WITHOUT_SCOPE, ItemBattleEffects, ItemId_GetHoldEffect, ItemId_GetHoldEffectParam, MarkBattlerForControllerExec, PrepareStringBattle, RecordAbilityBattle, ResetSentPokesToOpponentValue, TryClearRageStatuses, TrySetCantSelectMoveBattleScript, WEATHER_HAS_EFFECT } from "./util";
import { BtlController_EmitChooseAction, BtlController_EmitChooseItem, BtlController_EmitChooseMove, BtlController_EmitChoosePokemon, BtlController_EmitDrawPartyStatusSummary, BtlController_EmitDrawTrainerPic, BtlController_EmitEndBounceEffect, BtlController_EmitGetMonData, BtlController_EmitIntroSlide, BtlController_EmitIntroTrainerBallThrow, BtlController_EmitLinkStandbyMsg, BtlController_EmitLoadMonSprite, BUFFER_A, type ChooseMoveStruct, type HpAndStatus } from "./controllers";
import { CalculatePPWithBonus, gEnemyParty, GetMonData, playerMon, SpeciesToNationalPokedexNum } from "../pokemon/mon";
import { HandleSetPokedexFlag } from "../pokemon/mon_extra";
import { gBattleScriptingCommandsTable } from "./cmds";
import { BattleMainCB2 } from "./main_init";
import { BattleStopLowHpSound, PlayBGM } from "./gfx_sfx_util";
import { BeginFastPaletteFade, gPaletteFade } from "../hw/palette";
import { ClearRematchStateByTrainerId, EvolutionScene, FadeOutMapMusic, GetEvolutionTargetSpecies, GetPartyIdFromBattlePartyId, GetRivalBattleFlags, GetTrainerBattleMode, IsPlayerPartyAndPokemonStorageFull, SwitchPartyMonSlots } from "./ext";
import { FreeAllWindowBuffers } from "../hw/window";
import { GetBattlerTurnOrderNum } from "./cmds/part1";
import { PREPARE_MON_NICK_BUFFER, PREPARE_STAT_BUFFER, PREPARE_STRING_BUFFER } from "./message";
import { ResetSpriteData } from "../hw/sprite";
import { battleHost } from "./host";
import { cdata } from "../hw/assets";
import { gMain } from "../hw/runtime";
import { sound } from "../audio/sound";
import { TrySetQuestLogBattleEvent } from "../questLogBattle";

const PARTY_SIZE = 6;
const BATTLE_COMMUNICATION_ENTRIES_COUNT = 8;
const HP_EMPTY_SLOT = 0xffff;
const NO_DEX_TYPES = C.BATTLE_TYPE_EREADER_TRAINER | C.BATTLE_TYPE_POKEDUDE | C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_GHOST
  | C.BATTLE_TYPE_OLD_MAN_TUTORIAL | C.BATTLE_TYPE_LEGENDARY;

export function IS_BATTLE_TYPE_GHOST_WITH_SCOPE(flags: number): boolean {
  return (flags & C.BATTLE_TYPE_GHOST) !== 0 && (flags & C.BATTLE_TYPE_GHOST_UNVEILED) !== 0;
}

function setSeen(b: number): void {
  HandleSetPokedexFlag(SpeciesToNationalPokedexNum(gBattleMons[b].species), C.FLAG_SET_SEEN, gBattleMons[b].personality);
}

export function BeginBattleIntro(): void {
  BattleStartClearSetData();
  gBattleCommunication[1] = 0;
  G.gBattleMainFunc = BattleIntroGetMonsData;
}

export function BattleMainCB1(): void {
  G.gBattleMainFunc!();
  for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) gBattlerControllerFuncs[G.gActiveBattler]();
}

function BattleStartClearSetData(): void {
  TurnValuesCleanUp(false);
  SpecialStatusesClear();
  for (let i = 0; i < C.MAX_BATTLERS_COUNT; i++) {
    gStatuses3[i] = 0;
    gDisableStructs[i].clear();
    gDisableStructs[i].isFirstTurn = 2;
    gLastMoves[i] = C.MOVE_NONE;
    gLastLandedMoves[i] = C.MOVE_NONE;
    gLastHitByType[i] = 0;
    gLastResultingMoves[i] = C.MOVE_NONE;
    gLastHitBy[i] = 0xff;
    gLockedMoves[i] = C.MOVE_NONE;
    gLastPrintedMoves[i] = C.MOVE_NONE;
    gBattleResources.flags.flags[i] = 0;
  }
  for (let i = 0; i < 2; i++) {
    gSideStatuses[i] = 0;
    gSideTimers[i].clear();
  }
  G.gBattlerAttacker = 0;
  G.gBattlerTarget = 0;
  G.gBattleWeather = 0;
  gWishFutureKnock.clear();
  G.gHitMarker = 0;
  if (!(G.gBattleTypeFlags & (C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_POKEDUDE)) && !save.options.battleScene) G.gHitMarker |= C.HITMARKER_NO_ANIMATIONS;
  gBattleScripting.battleStyle = save.options.battleStyle;
  G.gMultiHitCounter = 0;
  G.gBattleOutcome = 0;
  G.gBattleControllerExecFlags = 0;
  G.gPaydayMoney = 0;
  gBattleResources.battleScriptsStack.size = 0;
  gBattleResources.battleCallbackStack.size = 0;
  gBattleCommunication.fill(0);
  G.gPauseCounterBattle = 0;
  G.gBattleMoveDamage = 0;
  G.gIntroSlideFlags = 0;
  gBattleScripting.animTurn = 0;
  gBattleScripting.animTargetsHit = 0;
  G.gLeveledUpInBattle = 0;
  G.gAbsentBattlerFlags = 0;
  const bs = gBattleStruct;
  bs.runTries = 0;
  bs.safariRockThrowCounter = 0;
  bs.safariBaitThrowCounter = 0;
  const enemySpecies = rom.species[GetMonData(gEnemyParty[0], C.MON_DATA_SPECIES)];
  bs.safariCatchFactor = div((enemySpecies?.catchRate ?? 0) * 100, 1275);
  bs.safariEscapeFactor = div((enemySpecies?.safariFlee ?? 0) * 100, 1275);
  if (bs.safariEscapeFactor <= 1) bs.safariEscapeFactor = 2;
  bs.wildVictorySong = 0;
  bs.moneyMultiplier = 1;
  bs.lastTakenMove.fill(0);
  bs.usedHeldItems.fill(0);
  bs.choicedMove.fill(0);
  bs.changedItems.fill(0);
  bs.lastTakenMoveFrom.fill(0);
  bs.AI_monToSwitchIntoId[0] = PARTY_SIZE;
  bs.AI_monToSwitchIntoId[1] = PARTY_SIZE;
  bs.givenExpMons = 0;
  gBattleResults.clear();
}

function clearLastTakenMoves(b: number): void {
  const bs = gBattleStruct;
  bs.lastTakenMove[b * 2 + 0] = 0;
  bs.lastTakenMove[b * 2 + 1] = 0;
  for (let k = 0; k < 8; k++) bs.lastTakenMoveFrom[b * 8 + k] = 0;
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (i !== b) {
      bs.lastTakenMove[i * 2 + 0] = 0;
      bs.lastTakenMove[i * 2 + 1] = 0;
    }
    bs.lastTakenMoveFrom[i * 8 + b * 2 + 0] = 0;
    bs.lastTakenMoveFrom[i * 8 + b * 2 + 1] = 0;
  }
}

export function SwitchInClearSetData(): void {
  const b = G.gActiveBattler;
  const copy = gDisableStructs[b].bytes.slice();
  const d = gDisableStructs[b];
  const batonPass = gBattleMoves(G.gCurrentMove).effect === C.EFFECT_BATON_PASS;
  if (!batonPass) {
    for (let i = 0; i < C.NUM_BATTLE_STATS; i++) gBattleMons[b].statStages[i] = C.DEFAULT_STAT_STAGE;
    for (let i = 0; i < G.gBattlersCount; i++) {
      if (gBattleMons[i].status2 & C.STATUS2_ESCAPE_PREVENTION && gDisableStructs[i].battlerPreventingEscape === b) gBattleMons[i].status2 &= ~C.STATUS2_ESCAPE_PREVENTION;
      if (gStatuses3[i] & C.STATUS3_ALWAYS_HITS && gDisableStructs[i].battlerWithSureHit === b) {
        gStatuses3[i] &= ~C.STATUS3_ALWAYS_HITS;
        gDisableStructs[i].battlerWithSureHit = 0;
      }
    }
  }
  if (batonPass) {
    gBattleMons[b].status2 &= C.STATUS2_CONFUSION | C.STATUS2_FOCUS_ENERGY | C.STATUS2_SUBSTITUTE | C.STATUS2_ESCAPE_PREVENTION | C.STATUS2_CURSED;
    gStatuses3[b] &= C.STATUS3_LEECHSEED_BATTLER | C.STATUS3_LEECHSEED | C.STATUS3_ALWAYS_HITS | C.STATUS3_PERISH_SONG | C.STATUS3_ROOTED
      | C.STATUS3_MUDSPORT | C.STATUS3_WATERSPORT;
    for (let i = 0; i < G.gBattlersCount; i++) {
      if (GetBattlerSide(b) !== GetBattlerSide(i) && (gStatuses3[i] & C.STATUS3_ALWAYS_HITS) !== 0 && gDisableStructs[i].battlerWithSureHit === b) {
        gStatuses3[i] &= ~C.STATUS3_ALWAYS_HITS;
        gStatuses3[i] |= STATUS3_ALWAYS_HITS_TURN(2);
      }
    }
  } else {
    gBattleMons[b].status2 = 0;
    gStatuses3[b] = 0;
  }
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (gBattleMons[i].status2 & STATUS2_INFATUATED_WITH(b)) gBattleMons[i].status2 &= ~STATUS2_INFATUATED_WITH(b);
    if (gBattleMons[i].status2 & C.STATUS2_WRAPPED && gBattleStruct.wrappedBy[i] === b) gBattleMons[i].status2 &= ~C.STATUS2_WRAPPED;
  }
  gActionSelectionCursor[b] = 0;
  gMoveSelectionCursor[b] = 0;
  d.clear();
  if (batonPass) {
    const old = new (d.constructor as new (bytes: Uint8Array) => typeof d)(copy);
    d.substituteHP = old.substituteHP;
    d.battlerWithSureHit = old.battlerWithSureHit;
    d.perishSongTimer = old.perishSongTimer;
    d.perishSongTimerStartValue = old.perishSongTimerStartValue;
    d.battlerPreventingEscape = old.battlerPreventingEscape;
  }
  G.gMoveResultFlags = 0;
  d.isFirstTurn = 2;
  gLastMoves[b] = C.MOVE_NONE;
  gLastLandedMoves[b] = C.MOVE_NONE;
  gLastHitByType[b] = 0;
  gLastResultingMoves[b] = C.MOVE_NONE;
  gLastPrintedMoves[b] = C.MOVE_NONE;
  gLastHitBy[b] = 0xff;
  clearLastTakenMoves(b);
  gBattleStruct.choicedMove[b] = C.MOVE_NONE;
  gBattleResources.flags.flags[b] = 0;
  G.gCurrentMove = C.MOVE_NONE;
}

export function FaintClearSetData(): void {
  const b = G.gActiveBattler;
  for (let i = 0; i < C.NUM_BATTLE_STATS; i++) gBattleMons[b].statStages[i] = C.DEFAULT_STAT_STAGE;
  gBattleMons[b].status2 = 0;
  gStatuses3[b] = 0;
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (gBattleMons[i].status2 & C.STATUS2_ESCAPE_PREVENTION && gDisableStructs[i].battlerPreventingEscape === b) gBattleMons[i].status2 &= ~C.STATUS2_ESCAPE_PREVENTION;
    if (gBattleMons[i].status2 & STATUS2_INFATUATED_WITH(b)) gBattleMons[i].status2 &= ~STATUS2_INFATUATED_WITH(b);
    if (gBattleMons[i].status2 & C.STATUS2_WRAPPED && gBattleStruct.wrappedBy[i] === b) gBattleMons[i].status2 &= ~C.STATUS2_WRAPPED;
  }
  gActionSelectionCursor[b] = 0;
  gMoveSelectionCursor[b] = 0;
  gDisableStructs[b].clear();
  const p = gProtectStructs[b];
  p.protected = 0;
  p.endured = 0;
  p.noValidMoves = 0;
  p.helpingHand = 0;
  p.bounceMove = 0;
  p.stealMove = 0;
  p.flag0Unknown = 0;
  p.prlzImmobility = 0;
  p.confusionSelfDmg = 0;
  p.targetNotAffected = 0;
  p.chargingTurn = 0;
  p.fleeType = 0;
  p.usedImprisonedMove = 0;
  p.loveImmobility = 0;
  p.usedDisabledMove = 0;
  p.usedTauntedMove = 0;
  p.flag2Unknown = 0;
  p.flinchImmobility = 0;
  p.notFirstStrike = 0;
  gDisableStructs[b].isFirstTurn = 2;
  gLastMoves[b] = C.MOVE_NONE;
  gLastLandedMoves[b] = C.MOVE_NONE;
  gLastHitByType[b] = 0;
  gLastResultingMoves[b] = C.MOVE_NONE;
  gLastPrintedMoves[b] = C.MOVE_NONE;
  gLastHitBy[b] = 0xff;
  gBattleStruct.choicedMove[b] = C.MOVE_NONE;
  clearLastTakenMoves(b);
  gBattleResources.flags.flags[b] = 0;
  const types = rom.species[gBattleMons[b].species].types;
  gBattleMons[b].type1 = types[0];
  gBattleMons[b].type2 = types[1];
}

function BattleIntroGetMonsData(): void {
  switch (gBattleCommunication[C.MULTIUSE_STATE]) {
    case 0:
      G.gActiveBattler = gBattleCommunication[1];
      BtlController_EmitGetMonData(BUFFER_A, C.REQUEST_ALL_BATTLE, 0);
      MarkBattlerForControllerExec(G.gActiveBattler);
      gBattleCommunication[C.MULTIUSE_STATE]++;
      break;
    case 1:
      if (G.gBattleControllerExecFlags === 0) {
        gBattleCommunication[1]++;
        if (gBattleCommunication[1] === G.gBattlersCount) G.gBattleMainFunc = BattleIntroPrepareBackgroundSlide;
        else gBattleCommunication[C.MULTIUSE_STATE] = 0;
      }
      break;
  }
}

function BattleIntroPrepareBackgroundSlide(): void {
  if (G.gBattleControllerExecFlags === 0) {
    G.gActiveBattler = GetBattlerAtPosition(0);
    BtlController_EmitIntroSlide(BUFFER_A, G.gBattleTerrain);
    MarkBattlerForControllerExec(G.gActiveBattler);
    G.gBattleMainFunc = BattleIntroDrawTrainersOrMonsSprites;
    gBattleCommunication[C.MULTIUSE_STATE] = 0;
    gBattleCommunication[C.SPRITES_INIT_STATE1] = 0;
  }
}

function BattleIntroDrawTrainersOrMonsSprites(): void {
  if (G.gBattleControllerExecFlags) return;
  for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
    const b = G.gActiveBattler;
    const m = gBattleMons[b];
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI && GetBattlerSide(b) === C.B_SIDE_PLAYER) {
      m.clear();
    } else {
      m.bytes.set(gBattleBufferB[b].subarray(4, 4 + m.bytes.length));
      const types = rom.species[m.species].types;
      m.type1 = types[0];
      m.type2 = types[1];
      m.ability = GetAbilityBySpecies(m.species, m.abilityNum);
      gBattleStruct.hpOnSwitchout[GetBattlerSide(b)] = m.hp;
      for (let i = 0; i < C.NUM_BATTLE_STATS; i++) m.statStages[i] = C.DEFAULT_STAT_STAGE;
      m.status2 = 0;
    }
    if (GetBattlerPosition(b) === C.B_POSITION_PLAYER_LEFT) {
      BtlController_EmitDrawTrainerPic(BUFFER_A);
      MarkBattlerForControllerExec(b);
    }
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) {
      if (GetBattlerPosition(b) === C.B_POSITION_OPPONENT_LEFT) {
        BtlController_EmitDrawTrainerPic(BUFFER_A);
        MarkBattlerForControllerExec(b);
      }
      if (GetBattlerSide(b) === C.B_SIDE_OPPONENT && !(G.gBattleTypeFlags & NO_DEX_TYPES)) setSeen(b);
    } else if (GetBattlerSide(b) === C.B_SIDE_OPPONENT) {
      if (G.gBattleTypeFlags & (C.BATTLE_TYPE_GHOST | C.BATTLE_TYPE_GHOST_UNVEILED)) {
        if (!IS_BATTLE_TYPE_GHOST_WITHOUT_SCOPE(G.gBattleTypeFlags)) setSeen(b);
      } else if (!(G.gBattleTypeFlags & NO_DEX_TYPES)) {
        setSeen(b);
      }
      BtlController_EmitLoadMonSprite(BUFFER_A);
      MarkBattlerForControllerExec(b);
    }
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI && (GetBattlerPosition(b) === C.B_POSITION_PLAYER_RIGHT || GetBattlerPosition(b) === C.B_POSITION_OPPONENT_RIGHT)) {
      BtlController_EmitDrawTrainerPic(BUFFER_A);
      MarkBattlerForControllerExec(b);
    }
  }
  G.gBattleMainFunc = BattleIntroDrawPartySummaryScreens;
}

function partyHpStatus(get: (i: number) => ReturnType<typeof playerMon>): HpAndStatus[] {
  const out: HpAndStatus[] = [];
  for (let i = 0; i < PARTY_SIZE; i++) {
    const mon = get(i);
    const s = GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG);
    if (s === C.SPECIES_NONE || s === C.SPECIES_EGG) out.push({ hp: HP_EMPTY_SLOT, status: 0 });
    else out.push({ hp: GetMonData(mon, C.MON_DATA_HP), status: GetMonData(mon, C.MON_DATA_STATUS) });
  }
  return out;
}

function BattleIntroDrawPartySummaryScreens(): void {
  if (G.gBattleControllerExecFlags) return;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) {
    G.gActiveBattler = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
    BtlController_EmitDrawPartyStatusSummary(BUFFER_A, partyHpStatus((i) => gEnemyParty[i]), C.PARTY_SUMM_SKIP_DRAW_DELAY);
    MarkBattlerForControllerExec(G.gActiveBattler);
    G.gActiveBattler = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
    BtlController_EmitDrawPartyStatusSummary(BUFFER_A, partyHpStatus(playerMon), C.PARTY_SUMM_SKIP_DRAW_DELAY);
    MarkBattlerForControllerExec(G.gActiveBattler);
    G.gBattleMainFunc = BattleIntroPrintTrainerWantsToBattle;
  } else {
    G.gBattleMainFunc = BattleIntroPrintWildMonAttacked;
  }
}

function BattleIntroPrintTrainerWantsToBattle(): void {
  if (G.gBattleControllerExecFlags === 0) {
    G.gActiveBattler = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
    PrepareStringBattle(C.STRINGID_INTROMSG, G.gActiveBattler);
    G.gBattleMainFunc = BattleIntroPrintOpponentSendsOut;
  }
}

function BattleIntroPrintWildMonAttacked(): void {
  if (G.gBattleControllerExecFlags === 0) {
    G.gBattleMainFunc = BattleIntroPrintPlayerSendsOut;
    PrepareStringBattle(C.STRINGID_INTROMSG, 0);
    if (IS_BATTLE_TYPE_GHOST_WITH_SCOPE(G.gBattleTypeFlags)) {
      gBattleScripting.battler = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
      BattleScriptExecute(BS("BattleScript_SilphScopeUnveiled"));
    }
  }
}

function BattleIntroPrintOpponentSendsOut(): void {
  if (G.gBattleControllerExecFlags === 0) {
    PrepareStringBattle(C.STRINGID_INTROSENDOUT, GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT));
    G.gBattleMainFunc = BattleIntroOpponentSendsOutMonAnimation;
  }
}

function BattleIntroOpponentSendsOutMonAnimation(): void {
  if (G.gBattleControllerExecFlags === 0) {
    for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
      const pos = GetBattlerPosition(G.gActiveBattler);
      if (pos === C.B_POSITION_OPPONENT_LEFT || (G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI && pos === C.B_POSITION_OPPONENT_RIGHT)) {
        BtlController_EmitIntroTrainerBallThrow(BUFFER_A);
        MarkBattlerForControllerExec(G.gActiveBattler);
      }
    }
    G.gBattleMainFunc = BattleIntroRecordMonsToDex;
  }
}

function BattleIntroRecordMonsToDex(): void {
  if (G.gBattleControllerExecFlags === 0) {
    for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
      if (GetBattlerSide(G.gActiveBattler) === C.B_SIDE_OPPONENT && !(G.gBattleTypeFlags & NO_DEX_TYPES)) setSeen(G.gActiveBattler);
    }
    G.gBattleMainFunc = BattleIntroPrintPlayerSendsOut;
  }
}

function BattleIntroPrintPlayerSendsOut(): void {
  if (G.gBattleControllerExecFlags === 0) {
    if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI)) PrepareStringBattle(C.STRINGID_INTROSENDOUT, GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT));
    G.gBattleMainFunc = BattleIntroPlayerSendsOutMonAnimation;
  }
}

function BattleIntroPlayerSendsOutMonAnimation(): void {
  if (G.gBattleControllerExecFlags) return;
  for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
    const pos = GetBattlerPosition(G.gActiveBattler);
    if (pos === C.B_POSITION_PLAYER_LEFT || (G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI && pos === C.B_POSITION_PLAYER_RIGHT)) {
      BtlController_EmitIntroTrainerBallThrow(BUFFER_A);
      MarkBattlerForControllerExec(G.gActiveBattler);
    }
  }
  gBattleStruct.switchInAbilitiesCounter = 0;
  gBattleStruct.switchInItemsCounter = 0;
  gBattleStruct.overworldWeatherDone = 0;
  G.gBattleMainFunc = TryDoEventsBeforeFirstTurn;
}

function TryDoEventsBeforeFirstTurn(): void {
  let effect = 0;
  const bs = gBattleStruct;
  if (G.gBattleControllerExecFlags) return;
  if (bs.switchInAbilitiesCounter === 0) {
    for (let i = 0; i < G.gBattlersCount; i++) gBattlerByTurnOrder[i] = i;
    for (let i = 0; i < G.gBattlersCount - 1; i++) {
      for (let j = i + 1; j < G.gBattlersCount; j++) if (GetWhoStrikesFirst(gBattlerByTurnOrder[i], gBattlerByTurnOrder[j], true) !== 0) SwapTurnOrder(i, j);
    }
  }
  if (!bs.overworldWeatherDone && AbilityBattleEffects(0, 0, 0, C.ABILITYEFFECT_SWITCH_IN_WEATHER, 0) !== 0) {
    bs.overworldWeatherDone = 1;
    return;
  }
  while (bs.switchInAbilitiesCounter < G.gBattlersCount) {
    if (AbilityBattleEffects(C.ABILITYEFFECT_ON_SWITCHIN, gBattlerByTurnOrder[bs.switchInAbilitiesCounter], 0, 0, 0) !== 0) effect++;
    bs.switchInAbilitiesCounter++;
    if (effect !== 0) return;
  }
  if (AbilityBattleEffects(C.ABILITYEFFECT_INTIMIDATE1, 0, 0, 0, 0) !== 0) return;
  if (AbilityBattleEffects(C.ABILITYEFFECT_TRACE, 0, 0, 0, 0) !== 0) return;
  while (bs.switchInItemsCounter < G.gBattlersCount) {
    if (ItemBattleEffects(C.ITEMEFFECT_ON_SWITCH_IN, gBattlerByTurnOrder[bs.switchInItemsCounter], false)) effect++;
    bs.switchInItemsCounter++;
    if (effect !== 0) return;
  }
  for (let i = 0; i < C.MAX_BATTLERS_COUNT; i++) {
    bs.monToSwitchIntoId[i] = PARTY_SIZE;
    gChosenActionByBattler[i] = C.B_ACTION_NONE;
    gChosenMoveByBattler[i] = C.MOVE_NONE;
  }
  TurnValuesCleanUp(false);
  SpecialStatusesClear();
  bs.absentBattlerFlags = G.gAbsentBattlerFlags;
  G.gBattleMainFunc = HandleTurnActionSelectionState;
  ResetSentPokesToOpponentValue();
  for (let i = 0; i < BATTLE_COMMUNICATION_ENTRIES_COUNT; i++) gBattleCommunication[i] = 0;
  for (let i = 0; i < G.gBattlersCount; i++) gBattleMons[i].status2 &= ~C.STATUS2_FLINCHED;
  bs.turnEffectsTracker = 0;
  bs.turnEffectsBattlerId = 0;
  bs.wishPerishSongState = 0;
  bs.wishPerishSongBattlerId = 0;
  gBattleScripting.moveendState = 0;
  bs.faintedActionsState = 0;
  bs.turnCountersTracker = 0;
  G.gMoveResultFlags = 0;
  G.gRandomTurnNumber = random();
}

function HandleEndTurn_ContinueBattle(): void {
  if (G.gBattleControllerExecFlags === 0) {
    G.gBattleMainFunc = BattleTurnPassed;
    for (let i = 0; i < BATTLE_COMMUNICATION_ENTRIES_COUNT; i++) gBattleCommunication[i] = 0;
    for (let i = 0; i < G.gBattlersCount; i++) {
      gBattleMons[i].status2 &= ~C.STATUS2_FLINCHED;
      if (gBattleMons[i].status1 & C.STATUS1_SLEEP && gBattleMons[i].status2 & C.STATUS2_MULTIPLETURNS) CancelMultiTurnMoves(i);
    }
    const bs = gBattleStruct;
    bs.turnEffectsTracker = 0;
    bs.turnEffectsBattlerId = 0;
    bs.wishPerishSongState = 0;
    bs.wishPerishSongBattlerId = 0;
    bs.turnCountersTracker = 0;
    G.gMoveResultFlags = 0;
  }
}

export function BattleTurnPassed(): void {
  TurnValuesCleanUp(true);
  if (G.gBattleOutcome === 0) {
    if (DoFieldEndTurnEffects()) return;
    if (DoBattlerEndTurnEffects()) return;
  }
  if (HandleFaintedMonActions()) return;
  gBattleStruct.faintedActionsState = 0;
  if (HandleWishPerishSongOnTurnEnd()) return;
  TurnValuesCleanUp(false);
  G.gHitMarker &= ~C.HITMARKER_NO_ATTACKSTRING;
  G.gHitMarker &= ~C.HITMARKER_UNABLE_TO_USE_MOVE;
  G.gHitMarker &= ~C.HITMARKER_PLAYER_FAINTED;
  G.gHitMarker &= ~C.HITMARKER_PASSIVE_DAMAGE;
  gBattleScripting.animTurn = 0;
  gBattleScripting.animTargetsHit = 0;
  gBattleScripting.moveendState = 0;
  G.gBattleMoveDamage = 0;
  G.gMoveResultFlags = 0;
  for (let i = 0; i < 5; i++) gBattleCommunication[i] = 0;
  if (G.gBattleOutcome !== 0) {
    G.gCurrentActionFuncId = C.B_ACTION_FINISHED;
    G.gBattleMainFunc = RunTurnActionsFunctions;
    return;
  }
  if (gBattleResults.battleTurnCounter < 0xff) gBattleResults.battleTurnCounter++;
  for (let i = 0; i < G.gBattlersCount; i++) {
    gChosenActionByBattler[i] = C.B_ACTION_NONE;
    gChosenMoveByBattler[i] = C.MOVE_NONE;
  }
  for (let i = 0; i < C.MAX_BATTLERS_COUNT; i++) gBattleStruct.monToSwitchIntoId[i] = PARTY_SIZE;
  gBattleStruct.absentBattlerFlags = G.gAbsentBattlerFlags;
  G.gBattleMainFunc = HandleTurnActionSelectionState;
  G.gRandomTurnNumber = random();
}

export function IsRunningFromBattleImpossible(): number {
  const b = G.gActiveBattler;
  const holdEffect = gBattleMons[b].item === C.ITEM_ENIGMA_BERRY ? gEnigmaBerries[b].holdEffect : ItemId_GetHoldEffect(gBattleMons[b].item);
  G.gPotentialItemEffectBattler = b;
  if (holdEffect === C.HOLD_EFFECT_CAN_ALWAYS_RUN || G.gBattleTypeFlags & C.BATTLE_TYPE_LINK || gBattleMons[b].ability === C.ABILITY_RUN_AWAY) return C.BATTLE_RUN_SUCCESS;
  const side = GetBattlerSide(b);
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (side !== GetBattlerSide(i) && gBattleMons[i].ability === C.ABILITY_SHADOW_TAG) {
      gBattleScripting.battler = i;
      G.gLastUsedAbility = gBattleMons[i].ability;
      gBattleCommunication[C.MULTISTRING_CHOOSER] = 2;
      return C.BATTLE_RUN_FAILURE;
    }
    if (side !== GetBattlerSide(i) && gBattleMons[b].ability !== C.ABILITY_LEVITATE && !IS_BATTLER_OF_TYPE(b, C.TYPE_FLYING)
      && gBattleMons[i].ability === C.ABILITY_ARENA_TRAP) {
      gBattleScripting.battler = i;
      G.gLastUsedAbility = gBattleMons[i].ability;
      gBattleCommunication[C.MULTISTRING_CHOOSER] = 2;
      return C.BATTLE_RUN_FAILURE;
    }
  }
  const i = AbilityBattleEffects(C.ABILITYEFFECT_CHECK_FIELD_EXCEPT_BATTLER, b, C.ABILITY_MAGNET_PULL, 0, 0);
  if (i !== 0 && IS_BATTLER_OF_TYPE(b, C.TYPE_STEEL)) {
    gBattleScripting.battler = i - 1;
    G.gLastUsedAbility = gBattleMons[i - 1].ability;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = 2;
    return C.BATTLE_RUN_FAILURE;
  }
  if (gBattleMons[b].status2 & (C.STATUS2_ESCAPE_PREVENTION | C.STATUS2_WRAPPED) || gStatuses3[b] & C.STATUS3_ROOTED) {
    gBattleCommunication[C.MULTISTRING_CHOOSER] = 0;
    return C.BATTLE_RUN_FORBIDDEN;
  }
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE) {
    gBattleCommunication[C.MULTISTRING_CHOOSER] = 1;
    return C.BATTLE_RUN_FORBIDDEN;
  }
  return C.BATTLE_RUN_SUCCESS;
}

export function UpdatePartyOwnerOnSwitch_NonMulti(battler: number): void {
  const orders = gBattleStruct.battlerPartyOrders;
  for (let i = 0; i < 3; i++) gBattlePartyCurrentOrder[i] = orders[battler * 3 + i];
  const r4 = GetPartyIdFromBattlePartyId(gBattlerPartyIndexes[battler]);
  const r1 = GetPartyIdFromBattlePartyId(gBattleStruct.monToSwitchIntoId[battler]);
  SwitchPartyMonSlots(r4, r1);
  for (let i = 0; i < 3; i++) {
    orders[battler * 3 + i] = gBattlePartyCurrentOrder[i];
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) orders[(battler ^ C.BIT_FLANK) * 3 + i] = gBattlePartyCurrentOrder[i];
  }
}

const enum Sel {
  BEFORE_ACTION_CHOSEN, WAIT_ACTION_CHOSEN, WAIT_ACTION_CASE_CHOSEN, WAIT_ACTION_CONFIRMED_STANDBY, WAIT_ACTION_CONFIRMED, SELECTION_SCRIPT,
  WAIT_SET_BEFORE_ACTION,
}

function controllerBusy(b: number): boolean {
  const mask = gBitTable[b] | 0xf0000000 | (gBitTable[b] << 4) | (gBitTable[b] << 8) | (gBitTable[b] << 12);
  return (G.gBattleControllerExecFlags & mask) !== 0;
}

function startSelectionScript(b: number, after: number): void {
  gBattleCommunication[b] = Sel.SELECTION_SCRIPT;
  gBattleStruct.selectionScriptFinished[b] = 0;
  gBattleStruct.stateIdAfterSelScript[b] = after;
}

function ABILITY_ON_OPPOSING_FIELD(b: number, ability: number): number {
  return AbilityBattleEffects(C.ABILITYEFFECT_CHECK_OTHER_SIDE, b, ability, 0, 0);
}

function HandleTurnActionSelectionState(): void {
  gBattleCommunication[C.ACTIONS_CONFIRMED_COUNT] = 0;
  const bs = gBattleStruct;
  for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
    const b = G.gActiveBattler;
    const position = GetBattlerPosition(b);
    switch (gBattleCommunication[b]) {
      case Sel.BEFORE_ACTION_CHOSEN: {
        bs.monToSwitchIntoId[b] = PARTY_SIZE;
        const partner = GetBattlerAtPosition(position ^ C.BIT_FLANK);
        if (G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI || (position & C.BIT_FLANK) === C.B_FLANK_LEFT || bs.absentBattlerFlags & gBitTable[partner]
          || gBattleCommunication[partner] === Sel.WAIT_ACTION_CONFIRMED) {
          if (bs.absentBattlerFlags & gBitTable[b]) {
            gChosenActionByBattler[b] = C.B_ACTION_NOTHING_FAINTED;
            gBattleCommunication[b] = !(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI) ? Sel.WAIT_ACTION_CONFIRMED : Sel.WAIT_ACTION_CONFIRMED_STANDBY;
          } else if (gBattleMons[b].status2 & C.STATUS2_MULTIPLETURNS || gBattleMons[b].status2 & C.STATUS2_RECHARGE) {
            gChosenActionByBattler[b] = C.B_ACTION_USE_MOVE;
            gBattleCommunication[b] = Sel.WAIT_ACTION_CONFIRMED_STANDBY;
          } else {
            BtlController_EmitChooseAction(BUFFER_A, gChosenActionByBattler[0], gBattleBufferB[0][1] | (gBattleBufferB[0][2] << 8));
            MarkBattlerForControllerExec(b);
            gBattleCommunication[b]++;
          }
        }
        break;
      }
      case Sel.WAIT_ACTION_CHOSEN:
        if (!controllerBusy(b)) {
          gChosenActionByBattler[b] = gBattleBufferB[b][1];
          switch (gBattleBufferB[b][1]) {
            case C.B_ACTION_USE_MOVE:
              if (AreAllMovesUnusable()) {
                startSelectionScript(b, Sel.WAIT_ACTION_CONFIRMED_STANDBY);
                bs.moveTarget[b] = gBattleBufferB[b][3];
                return;
              } else if (gDisableStructs[b].encoredMove !== C.MOVE_NONE) {
                gChosenMoveByBattler[b] = gDisableStructs[b].encoredMove;
                bs.chosenMovePositions[b] = gDisableStructs[b].encoredMovePos;
                gBattleCommunication[b] = Sel.WAIT_ACTION_CONFIRMED_STANDBY;
                return;
              } else {
                const m = gBattleMons[b];
                const moveInfo: ChooseMoveStruct = { moves: [], currentPp: [], maxPp: [], species: m.species, monType1: m.type1, monType2: m.type2 };
                for (let i = 0; i < 4; i++) {
                  moveInfo.moves[i] = m.moves[i];
                  moveInfo.currentPp[i] = m.pp[i];
                  moveInfo.maxPp[i] = CalculatePPWithBonus(m.moves[i], m.ppBonuses, i);
                }
                BtlController_EmitChooseMove(BUFFER_A, (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) !== 0, false, moveInfo);
                MarkBattlerForControllerExec(b);
              }
              break;
            case C.B_ACTION_USE_ITEM:
              if (G.gBattleTypeFlags & (C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_BATTLE_TOWER | C.BATTLE_TYPE_EREADER_TRAINER)) {
                gSelectionBattleScripts[b] = BS("BattleScript_ActionSelectionItemsCantBeUsed");
                startSelectionScript(b, Sel.BEFORE_ACTION_CHOSEN);
                return;
              }
              BtlController_EmitChooseItem(BUFFER_A, bs.battlerPartyOrders.subarray(b * 3, b * 3 + 3));
              MarkBattlerForControllerExec(b);
              break;
            case C.B_ACTION_SWITCH: {
              bs.battlerPartyIndexes[b] = gBattlerPartyIndexes[b];
              const orders = bs.battlerPartyOrders.subarray(b * 3, b * 3 + 3);
              let i = 0;
              if (gBattleMons[b].status2 & (C.STATUS2_WRAPPED | C.STATUS2_ESCAPE_PREVENTION) || gStatuses3[b] & C.STATUS3_ROOTED) {
                BtlController_EmitChoosePokemon(BUFFER_A, C.PARTY_ACTION_CANT_SWITCH, 6, C.ABILITY_NONE, orders);
              } else if ((i = ABILITY_ON_OPPOSING_FIELD(b, C.ABILITY_SHADOW_TAG))
                || ((i = ABILITY_ON_OPPOSING_FIELD(b, C.ABILITY_ARENA_TRAP)) && !IS_BATTLER_OF_TYPE(b, C.TYPE_FLYING) && gBattleMons[b].ability !== C.ABILITY_LEVITATE)
                || ((i = AbilityBattleEffects(C.ABILITYEFFECT_CHECK_FIELD_EXCEPT_BATTLER, b, C.ABILITY_MAGNET_PULL, 0, 0)) && IS_BATTLER_OF_TYPE(b, C.TYPE_STEEL))) {
                BtlController_EmitChoosePokemon(BUFFER_A, ((i - 1) << 4) | C.PARTY_ACTION_ABILITY_PREVENTS, 6, G.gLastUsedAbility, orders);
              } else if (b === 2 && gChosenActionByBattler[0] === C.B_ACTION_SWITCH) {
                BtlController_EmitChoosePokemon(BUFFER_A, C.PARTY_ACTION_CHOOSE_MON, bs.monToSwitchIntoId[0], C.ABILITY_NONE, orders);
              } else if (b === 3 && gChosenActionByBattler[1] === C.B_ACTION_SWITCH) {
                BtlController_EmitChoosePokemon(BUFFER_A, C.PARTY_ACTION_CHOOSE_MON, bs.monToSwitchIntoId[1], C.ABILITY_NONE, orders);
              } else {
                BtlController_EmitChoosePokemon(BUFFER_A, C.PARTY_ACTION_CHOOSE_MON, 6, C.ABILITY_NONE, orders);
              }
              MarkBattlerForControllerExec(b);
              break;
            }
            case C.B_ACTION_SAFARI_BALL:
              if (IsPlayerPartyAndPokemonStorageFull()) {
                gSelectionBattleScripts[b] = BS("BattleScript_PrintFullBox");
                startSelectionScript(b, Sel.BEFORE_ACTION_CHOSEN);
                return;
              }
              break;
            case C.B_ACTION_CANCEL_PARTNER:
              gBattleCommunication[b] = Sel.WAIT_SET_BEFORE_ACTION;
              gBattleCommunication[GetBattlerAtPosition(GetBattlerPosition(b) ^ C.BIT_FLANK)] = Sel.BEFORE_ACTION_CHOSEN;
              BtlController_EmitEndBounceEffect(BUFFER_A);
              MarkBattlerForControllerExec(b);
              return;
          }
          if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER && !(G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) && gBattleBufferB[b][1] === C.B_ACTION_RUN) {
            BattleScriptExecute(BS("BattleScript_PrintCantRunFromTrainer"));
            gBattleCommunication[b] = Sel.BEFORE_ACTION_CHOSEN;
          } else if (IsRunningFromBattleImpossible() !== C.BATTLE_RUN_SUCCESS && gBattleBufferB[b][1] === C.B_ACTION_RUN) {
            gSelectionBattleScripts[b] = BS("BattleScript_PrintCantEscapeFromBattle");
            startSelectionScript(b, Sel.BEFORE_ACTION_CHOSEN);
            return;
          } else {
            gBattleCommunication[b]++;
          }
        }
        break;
      case Sel.WAIT_ACTION_CASE_CHOSEN:
        if (!controllerBusy(b)) {
          const buf = gBattleBufferB[b];
          switch (gChosenActionByBattler[b]) {
            case C.B_ACTION_USE_MOVE:
              if (buf[1] >= 3 && buf[1] <= 9) {
                gChosenActionByBattler[b] = buf[1];
                return;
              }
              if ((buf[2] | (buf[3] << 8)) === 0xffff) {
                gBattleCommunication[b] = Sel.BEFORE_ACTION_CHOSEN;
              } else if (TrySetCantSelectMoveBattleScript()) {
                startSelectionScript(b, Sel.WAIT_ACTION_CHOSEN);
                buf[1] = 0;
                return;
              } else {
                bs.chosenMovePositions[b] = buf[2];
                gChosenMoveByBattler[b] = gBattleMons[b].moves[bs.chosenMovePositions[b]];
                bs.moveTarget[b] = buf[3];
                gBattleCommunication[b]++;
              }
              break;
            case C.B_ACTION_USE_ITEM:
              if ((buf[1] | (buf[2] << 8)) === 0) {
                gBattleCommunication[b] = Sel.BEFORE_ACTION_CHOSEN;
              } else {
                G.gLastUsedItem = buf[1] | (buf[2] << 8);
                gBattleCommunication[b]++;
              }
              break;
            case C.B_ACTION_SWITCH:
              if (buf[1] === PARTY_SIZE) {
                gBattleCommunication[b] = Sel.BEFORE_ACTION_CHOSEN;
              } else {
                bs.monToSwitchIntoId[b] = buf[1];
                if (G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI) {
                  const o = bs.battlerPartyOrders;
                  o[b * 3 + 0] &= 0xf;
                  o[b * 3 + 0] |= buf[2] & 0xf0;
                  o[b * 3 + 1] = buf[3];
                  o[(b ^ C.BIT_FLANK) * 3 + 0] &= 0xf0;
                  o[(b ^ C.BIT_FLANK) * 3 + 0] |= (buf[2] & 0xf0) >> 4;
                  o[(b ^ C.BIT_FLANK) * 3 + 2] = buf[3];
                }
                gBattleCommunication[b]++;
              }
              break;
            case C.B_ACTION_RUN:
            case C.B_ACTION_SAFARI_RUN:
              G.gHitMarker |= C.HITMARKER_RUN;
              gBattleCommunication[b]++;
              break;
            case C.B_ACTION_SAFARI_WATCH_CAREFULLY:
            case C.B_ACTION_SAFARI_BALL:
            case C.B_ACTION_SAFARI_BAIT:
            case C.B_ACTION_SAFARI_GO_NEAR:
            case C.B_ACTION_OLDMAN_THROW:
              gBattleCommunication[b]++;
              break;
          }
        }
        break;
      case Sel.WAIT_ACTION_CONFIRMED_STANDBY:
        if (!controllerBusy(b)) {
          if ((G.gBattleTypeFlags & (C.BATTLE_TYPE_MULTI | C.BATTLE_TYPE_DOUBLE)) !== C.BATTLE_TYPE_DOUBLE || (position & C.BIT_FLANK) !== C.B_FLANK_LEFT
            || bs.absentBattlerFlags & gBitTable[GetBattlerAtPosition(position ^ C.BIT_FLANK)]) {
            BtlController_EmitLinkStandbyMsg(BUFFER_A, C.LINK_STANDBY_MSG_STOP_BOUNCE);
          } else {
            BtlController_EmitLinkStandbyMsg(BUFFER_A, C.LINK_STANDBY_STOP_BOUNCE_ONLY);
          }
          MarkBattlerForControllerExec(b);
          gBattleCommunication[b]++;
        }
        break;
      case Sel.WAIT_ACTION_CONFIRMED:
        if (!controllerBusy(b)) gBattleCommunication[C.ACTIONS_CONFIRMED_COUNT]++;
        break;
      case Sel.SELECTION_SCRIPT:
        if (bs.selectionScriptFinished[b]) {
          gBattleCommunication[b] = bs.stateIdAfterSelScript[b];
        } else {
          G.gBattlerAttacker = b;
          G.gBattlescriptCurrInstr = gSelectionBattleScripts[b];
          if (!controllerBusy(b)) gBattleScriptingCommandsTable[r8(G.gBattlescriptCurrInstr)]();
          gSelectionBattleScripts[b] = G.gBattlescriptCurrInstr;
        }
        break;
      case Sel.WAIT_SET_BEFORE_ACTION:
        if (!controllerBusy(b)) gBattleCommunication[b] = Sel.BEFORE_ACTION_CHOSEN;
        break;
    }
  }
  if (gBattleCommunication[C.ACTIONS_CONFIRMED_COUNT] === G.gBattlersCount) G.gBattleMainFunc = SetActionsAndBattlersTurnOrder;
}

export function SwapTurnOrder(id1: number, id2: number): void {
  let t = gActionsByTurnOrder[id1];
  gActionsByTurnOrder[id1] = gActionsByTurnOrder[id2];
  gActionsByTurnOrder[id2] = t;
  t = gBattlerByTurnOrder[id1];
  gBattlerByTurnOrder[id1] = gBattlerByTurnOrder[id2];
  gBattlerByTurnOrder[id2] = t;
}

function statStageRatio(stage: number): [number, number] {
  return cdata<Array<[number, number]>>("pokemon", "gStatStageRatios")[stage];
}

function effectiveSpeed(b: number): number {
  const m = gBattleMons[b];
  let mult = 1;
  if (WEATHER_HAS_EFFECT()
    && ((m.ability === C.ABILITY_SWIFT_SWIM && G.gBattleWeather & C.B_WEATHER_RAIN) || (m.ability === C.ABILITY_CHLOROPHYLL && G.gBattleWeather & C.B_WEATHER_SUN))) mult = 2;
  const [num, den] = statStageRatio(m.statStages[C.STAT_SPEED]);
  let speed = Math.floor(((m.speed * mult) * num) / den) >>> 0;
  const holdEffect = m.item === C.ITEM_ENIGMA_BERRY ? gEnigmaBerries[b].holdEffect : ItemId_GetHoldEffect(m.item);
  const holdEffectParam = m.item === C.ITEM_ENIGMA_BERRY ? gEnigmaBerries[b].holdEffectParam : ItemId_GetHoldEffectParam(m.item);
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) && flagGet(C.FLAG_BADGE03_GET) && GetBattlerSide(b) === C.B_SIDE_PLAYER) speed = Math.floor((speed * 110) / 100);
  if (holdEffect === C.HOLD_EFFECT_MACHO_BRACE) speed = Math.floor(speed / 2);
  if (m.status1 & C.STATUS1_PARALYSIS) speed = Math.floor(speed / 4);
  if (holdEffect === C.HOLD_EFFECT_QUICK_CLAW && G.gRandomTurnNumber < Math.trunc((0xffff * holdEffectParam) / 100)) speed = 0xffffffff;
  return speed;
}

function chosenMove(b: number): number {
  if (gChosenActionByBattler[b] !== C.B_ACTION_USE_MOVE) return C.MOVE_NONE;
  if (gProtectStructs[b].noValidMoves) return C.MOVE_STRUGGLE;
  return gBattleMons[b].moves[gBattleStruct.chosenMovePositions[b]];
}

export function GetWhoStrikesFirst(battler1: number, battler2: number, ignoreChosenMoves: boolean): number {
  let strikesFirst = 0;
  const speed1 = effectiveSpeed(battler1);
  const speed2 = effectiveSpeed(battler2);
  const move1 = ignoreChosenMoves ? C.MOVE_NONE : chosenMove(battler1);
  const move2 = ignoreChosenMoves ? C.MOVE_NONE : chosenMove(battler2);
  const p1 = s8(gBattleMoves(move1).priority);
  const p2 = s8(gBattleMoves(move2).priority);
  if (p1 !== 0 || p2 !== 0) {
    if (p1 === p2) {
      if (speed1 === speed2 && random() & 1) strikesFirst = 2;
      else if (speed1 < speed2) strikesFirst = 1;
    } else if (p1 < p2) {
      strikesFirst = 1;
    }
  } else if (speed1 === speed2 && random() & 1) {
    strikesFirst = 2;
  } else if (speed1 < speed2) {
    strikesFirst = 1;
  }
  return strikesFirst;
}

function SetActionsAndBattlersTurnOrder(): void {
  let turnOrderId = 0;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI) {
    for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
      gActionsByTurnOrder[turnOrderId] = gChosenActionByBattler[G.gActiveBattler];
      gBattlerByTurnOrder[turnOrderId] = G.gActiveBattler;
      turnOrderId++;
    }
  } else {
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) {
      for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
        if (gChosenActionByBattler[G.gActiveBattler] === C.B_ACTION_RUN) {
          turnOrderId = 5;
          break;
        }
      }
    } else if (gChosenActionByBattler[0] === C.B_ACTION_RUN) {
      G.gActiveBattler = 0;
      turnOrderId = 5;
    }
    if (turnOrderId === 5) {
      gActionsByTurnOrder[0] = gChosenActionByBattler[G.gActiveBattler];
      gBattlerByTurnOrder[0] = G.gActiveBattler;
      turnOrderId = 1;
      for (let i = 0; i < G.gBattlersCount; i++) {
        if (i !== G.gActiveBattler) {
          gActionsByTurnOrder[turnOrderId] = gChosenActionByBattler[i];
          gBattlerByTurnOrder[turnOrderId] = i;
          turnOrderId++;
        }
      }
      G.gBattleMainFunc = CheckFocusPunch_ClearVarsBeforeTurnStarts;
      gBattleStruct.focusPunchBattlerId = 0;
      return;
    }
    const itemOrSwitch = (a: number) => a === C.B_ACTION_USE_ITEM || a === C.B_ACTION_SWITCH;
    for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
      if (itemOrSwitch(gChosenActionByBattler[G.gActiveBattler])) {
        gActionsByTurnOrder[turnOrderId] = gChosenActionByBattler[G.gActiveBattler];
        gBattlerByTurnOrder[turnOrderId] = G.gActiveBattler;
        turnOrderId++;
      }
    }
    for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
      if (!itemOrSwitch(gChosenActionByBattler[G.gActiveBattler])) {
        gActionsByTurnOrder[turnOrderId] = gChosenActionByBattler[G.gActiveBattler];
        gBattlerByTurnOrder[turnOrderId] = G.gActiveBattler;
        turnOrderId++;
      }
    }
    for (let i = 0; i < G.gBattlersCount - 1; i++) {
      for (let j = i + 1; j < G.gBattlersCount; j++) {
        if (!itemOrSwitch(gActionsByTurnOrder[i]) && !itemOrSwitch(gActionsByTurnOrder[j])
          && GetWhoStrikesFirst(gBattlerByTurnOrder[i], gBattlerByTurnOrder[j], false)) SwapTurnOrder(i, j);
      }
    }
  }
  G.gBattleMainFunc = CheckFocusPunch_ClearVarsBeforeTurnStarts;
  gBattleStruct.focusPunchBattlerId = 0;
}

function TurnValuesCleanUp(var0: boolean): void {
  for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
    const b = G.gActiveBattler;
    const d = gDisableStructs[b];
    if (var0) {
      gProtectStructs[b].protected = 0;
      gProtectStructs[b].endured = 0;
    } else {
      gProtectStructs[b].clear();
      if (d.isFirstTurn) d.isFirstTurn--;
      if (d.rechargeTimer) {
        d.rechargeTimer--;
        if (d.rechargeTimer === 0) gBattleMons[b].status2 &= ~C.STATUS2_RECHARGE;
      }
    }
    if (d.substituteHP === 0) gBattleMons[b].status2 &= ~C.STATUS2_SUBSTITUTE;
  }
  gSideTimers[0].followmeTimer = 0;
  gSideTimers[1].followmeTimer = 0;
}

function SpecialStatusesClear(): void {
  for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) gSpecialStatuses[G.gActiveBattler].clear();
}

function CheckFocusPunch_ClearVarsBeforeTurnStarts(): void {
  if (!(G.gHitMarker & C.HITMARKER_RUN)) {
    while (gBattleStruct.focusPunchBattlerId < G.gBattlersCount) {
      const b = (G.gActiveBattler = G.gBattlerAttacker = gBattleStruct.focusPunchBattlerId);
      gBattleStruct.focusPunchBattlerId++;
      if (gChosenMoveByBattler[b] === C.MOVE_FOCUS_PUNCH && !(gBattleMons[b].status1 & C.STATUS1_SLEEP) && !gDisableStructs[b].truantCounter
        && !gProtectStructs[b].noValidMoves) {
        BattleScriptExecute(BS("BattleScript_FocusPunchSetUp"));
        return;
      }
    }
  }
  TryClearRageStatuses();
  G.gCurrentTurnActionNumber = 0;
  G.gCurrentActionFuncId = gActionsByTurnOrder[0];
  G.gDynamicBasePower = 0;
  gBattleStruct.dynamicMoveType = 0;
  G.gBattleMainFunc = RunTurnActionsFunctions;
  gBattleCommunication[3] = 0;
  gBattleCommunication[4] = 0;
  gBattleScripting.multihitMoveEffect = 0;
  gBattleResources.battleScriptsStack.size = 0;
}

function RunTurnActionsFunctions(): void {
  if (G.gBattleOutcome !== 0) G.gCurrentActionFuncId = C.B_ACTION_FINISHED;
  gBattleStruct.savedTurnActionNumber = G.gCurrentTurnActionNumber;
  sTurnActionsFuncsTable[G.gCurrentActionFuncId]();
  if (G.gCurrentTurnActionNumber >= G.gBattlersCount) {
    G.gHitMarker &= ~C.HITMARKER_PASSIVE_DAMAGE;
    G.gBattleMainFunc = sEndTurnFuncsTable[G.gBattleOutcome & 0x7f];
  } else if (gBattleStruct.savedTurnActionNumber !== G.gCurrentTurnActionNumber) {
    G.gHitMarker &= ~C.HITMARKER_NO_ATTACKSTRING;
    G.gHitMarker &= ~C.HITMARKER_UNABLE_TO_USE_MOVE;
  }
}

function HandleEndTurn_BattleWon(): void {
  G.gCurrentActionFuncId = 0;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) {
    gBattleTextBuff1[0] = G.gBattleOutcome;
    G.gBattlerAttacker = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
    G.gBattlescriptCurrInstr = BS("BattleScript_LinkBattleWonOrLost");
    G.gBattleOutcome &= ~C.B_OUTCOME_LINK_BATTLE_RAN;
  } else if (G.gBattleTypeFlags & (C.BATTLE_TYPE_TRAINER_TOWER | C.BATTLE_TYPE_EREADER_TRAINER | C.BATTLE_TYPE_BATTLE_TOWER)) {
    BattleStopLowHpSound();
    PlayBGM(C.MUS_VICTORY_TRAINER);
    G.gBattlescriptCurrInstr = BS("BattleScript_BattleTowerTrainerBattleWon");
  } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER && !(G.gBattleTypeFlags & C.BATTLE_TYPE_LINK)) {
    BattleStopLowHpSound();
    G.gBattlescriptCurrInstr = BS("BattleScript_LocalTrainerBattleWon");
    switch (rom.trainers[G.gTrainerBattleOpponent_A]?.class) {
      case C.TRAINER_CLASS_LEADER:
      case C.TRAINER_CLASS_CHAMPION:
        PlayBGM(C.MUS_VICTORY_GYM_LEADER);
        break;
      default:
        PlayBGM(C.MUS_VICTORY_TRAINER);
        break;
    }
  } else {
    G.gBattlescriptCurrInstr = BS("BattleScript_PayDayMoneyAndPickUpItems");
  }
  G.gBattleMainFunc = HandleEndTurn_FinishBattle;
}

function HandleEndTurn_BattleLost(): void {
  G.gCurrentActionFuncId = 0;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) {
    gBattleTextBuff1[0] = G.gBattleOutcome;
    G.gBattlerAttacker = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
    G.gBattlescriptCurrInstr = BS("BattleScript_LinkBattleWonOrLost");
    G.gBattleOutcome &= ~C.B_OUTCOME_LINK_BATTLE_RAN;
  } else {
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER && GetTrainerBattleMode() === C.TRAINER_BATTLE_EARLY_RIVAL) {
      gBattleCommunication[C.MULTISTRING_CHOOSER] = GetRivalBattleFlags() & C.RIVAL_BATTLE_HEAL_AFTER ? 1 : 2;
      G.gBattlerAttacker = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
    } else {
      gBattleCommunication[C.MULTISTRING_CHOOSER] = 0;
    }
    G.gBattlescriptCurrInstr = BS("BattleScript_LocalBattleLost");
  }
  G.gBattleMainFunc = HandleEndTurn_FinishBattle;
}

function HandleEndTurn_RanFromBattle(): void {
  G.gCurrentActionFuncId = 0;
  switch (gProtectStructs[G.gBattlerAttacker].fleeType) {
    default: G.gBattlescriptCurrInstr = BS("BattleScript_GotAwaySafely"); break;
    case 1: G.gBattlescriptCurrInstr = BS("BattleScript_SmokeBallEscape"); break;
    case 2: G.gBattlescriptCurrInstr = BS("BattleScript_RanAwayUsingMonAbility"); break;
  }
  G.gBattleMainFunc = HandleEndTurn_FinishBattle;
}

function HandleEndTurn_MonFled(): void {
  G.gCurrentActionFuncId = 0;
  PREPARE_MON_NICK_BUFFER(gBattleTextBuff1, G.gBattlerAttacker, gBattlerPartyIndexes[G.gBattlerAttacker]);
  G.gBattlescriptCurrInstr = BS("BattleScript_WildMonFled");
  G.gBattleMainFunc = HandleEndTurn_FinishBattle;
}

function copyName(dst: Uint8Array, src: Uint8Array): void {
  let i = 0;
  for (; i < src.length && src[i] !== 0xff && i < dst.length - 1; i++) dst[i] = src[i];
  dst[i] = 0xff;
}

function HandleEndTurn_FinishBattle(): void {
  if (G.gCurrentActionFuncId === C.B_ACTION_TRY_FINISH || G.gCurrentActionFuncId === C.B_ACTION_FINISHED) {
    if (!(G.gBattleTypeFlags & (C.BATTLE_TYPE_TRAINER_TOWER | C.BATTLE_TYPE_EREADER_TRAINER | C.BATTLE_TYPE_OLD_MAN_TUTORIAL | C.BATTLE_TYPE_BATTLE_TOWER
      | C.BATTLE_TYPE_SAFARI | C.BATTLE_TYPE_FIRST_BATTLE | C.BATTLE_TYPE_LINK))) {
      for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
        const b = G.gActiveBattler;
        if (GetBattlerSide(b) === C.B_SIDE_PLAYER) {
          if (gBattleResults.playerMon1Species === C.SPECIES_NONE) {
            gBattleResults.playerMon1Species = gBattleMons[b].species;
            copyName(gBattleResults.playerMon1Name, gBattleMons[b].nickname);
          } else {
            gBattleResults.playerMon2Species = gBattleMons[b].species;
            copyName(gBattleResults.playerMon2Name, gBattleMons[b].nickname);
          }
        }
      }
    }
    TrySetQuestLogBattleEvent();
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) ClearRematchStateByTrainerId();
    BeginFastPaletteFade(3);
    FadeOutMapMusic(5);
    G.gBattleMainFunc = FreeResetData_ReturnToOvOrDoEvolutions;
  } else if (G.gBattleControllerExecFlags === 0) {
    gBattleScriptingCommandsTable[r8(G.gBattlescriptCurrInstr)]();
  }
}

function FreeResetData_ReturnToOvOrDoEvolutions(): void {
  if (!gPaletteFade.active) {
    ResetSpriteData();
    if (G.gLeveledUpInBattle === 0 || G.gBattleOutcome !== C.B_OUTCOME_WON) G.gBattleMainFunc = ReturnFromBattleToOverworld;
    else G.gBattleMainFunc = TryEvolvePokemon;
    FreeAllWindowBuffers();
    if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_LINK)) {
      FreeBattleResources();
    }
  }
}

function TryEvolvePokemon(): void {
  while (G.gLeveledUpInBattle !== 0) {
    for (let i = 0; i < PARTY_SIZE; i++) {
      if (G.gLeveledUpInBattle & gBitTable[i]) {
        const levelUpBits = G.gLeveledUpInBattle & ~gBitTable[i] & 0xff;
        G.gLeveledUpInBattle = levelUpBits;
        const species = GetEvolutionTargetSpecies(playerMon(i), C.EVO_MODE_NORMAL, levelUpBits);
        if (species !== C.SPECIES_NONE) {
          G.gBattleMainFunc = WaitForEvoSceneToFinish;
          EvolutionScene(playerMon(i), species, true, i);
          return;
        }
      }
    }
  }
  G.gBattleMainFunc = ReturnFromBattleToOverworld;
}

function WaitForEvoSceneToFinish(): void {
  if (gMain.callback2 === BattleMainCB2) G.gBattleMainFunc = TryEvolvePokemon;
}

function ReturnFromBattleToOverworld(): void {
  sound.stopSE(C.SE_LOW_HEALTH);
  battleHost.finish(G.gBattleOutcome);
}

export function RunBattleScriptCommands_PopCallbacksStack(): void {
  if (G.gCurrentActionFuncId === C.B_ACTION_TRY_FINISH || G.gCurrentActionFuncId === C.B_ACTION_FINISHED) {
    const s = gBattleResources.battleCallbackStack;
    if (s.size !== 0) s.size--;
    G.gBattleMainFunc = s.function[s.size];
  } else if (G.gBattleControllerExecFlags === 0) {
    gBattleScriptingCommandsTable[r8(G.gBattlescriptCurrInstr)]();
  }
}

export function RunBattleScriptCommands(): void {
  if (G.gBattleControllerExecFlags === 0) gBattleScriptingCommandsTable[r8(G.gBattlescriptCurrInstr)]();
}

function randomOpponentOrPlayer(playerSide: boolean): number {
  if (playerSide) return GetBattlerAtPosition(random() & 1 ? C.B_POSITION_OPPONENT_LEFT : C.B_POSITION_OPPONENT_RIGHT);
  return GetBattlerAtPosition(random() & 1 ? C.B_POSITION_PLAYER_LEFT : C.B_POSITION_PLAYER_RIGHT);
}

function fixAbsentTarget(): void {
  if (G.gAbsentBattlerFlags & gBitTable[G.gBattlerTarget]) {
    if (GetBattlerSide(G.gBattlerAttacker) !== GetBattlerSide(G.gBattlerTarget)) {
      G.gBattlerTarget = GetBattlerAtPosition(GetBattlerPosition(G.gBattlerTarget) ^ C.BIT_FLANK);
    } else {
      G.gBattlerTarget = GetBattlerAtPosition(GetBattlerPosition(G.gBattlerAttacker) ^ C.BIT_SIDE);
      if (G.gAbsentBattlerFlags & gBitTable[G.gBattlerTarget]) G.gBattlerTarget = GetBattlerAtPosition(GetBattlerPosition(G.gBattlerTarget) ^ C.BIT_FLANK);
    }
  }
}

function HandleAction_UseMove(): void {
  let side: number;
  let v = 4;
  const a = (G.gBattlerAttacker = gBattlerByTurnOrder[G.gCurrentTurnActionNumber]);
  if (gBattleStruct.absentBattlerFlags & gBitTable[a]) {
    G.gCurrentActionFuncId = C.B_ACTION_FINISHED;
    return;
  }
  const d = gDisableStructs[a];
  const m = gBattleMons[a];
  G.gCritMultiplier = 1;
  gBattleScripting.dmgMultiplier = 1;
  gBattleStruct.atkCancellerTracker = 0;
  G.gMoveResultFlags = 0;
  G.gMultiHitCounter = 0;
  gBattleCommunication[C.MISS_TYPE] = 0;
  G.gCurrMovePos = G.gChosenMovePos = gBattleStruct.chosenMovePositions[a];
  if (gProtectStructs[a].noValidMoves) {
    gProtectStructs[a].noValidMoves = 0;
    G.gCurrentMove = G.gChosenMove = C.MOVE_STRUGGLE;
    G.gHitMarker |= C.HITMARKER_NO_PPDEDUCT;
    gBattleStruct.moveTarget[a] = GetMoveTarget(C.MOVE_STRUGGLE, C.NO_TARGET_OVERRIDE);
  } else if (m.status2 & C.STATUS2_MULTIPLETURNS || m.status2 & C.STATUS2_RECHARGE) {
    G.gCurrentMove = G.gChosenMove = gLockedMoves[a];
  } else if (d.encoredMove !== C.MOVE_NONE && d.encoredMove === m.moves[d.encoredMovePos]) {
    G.gCurrentMove = G.gChosenMove = d.encoredMove;
    G.gCurrMovePos = G.gChosenMovePos = d.encoredMovePos;
    gBattleStruct.moveTarget[a] = GetMoveTarget(G.gCurrentMove, C.NO_TARGET_OVERRIDE);
  } else if (d.encoredMove !== C.MOVE_NONE && d.encoredMove !== m.moves[d.encoredMovePos]) {
    G.gCurrMovePos = G.gChosenMovePos = d.encoredMovePos;
    G.gCurrentMove = G.gChosenMove = m.moves[G.gCurrMovePos];
    d.encoredMove = C.MOVE_NONE;
    d.encoredMovePos = 0;
    d.encoreTimer = 0;
    gBattleStruct.moveTarget[a] = GetMoveTarget(G.gCurrentMove, C.NO_TARGET_OVERRIDE);
  } else if (m.moves[G.gCurrMovePos] !== gChosenMoveByBattler[a]) {
    G.gCurrentMove = G.gChosenMove = m.moves[G.gCurrMovePos];
    gBattleStruct.moveTarget[a] = GetMoveTarget(G.gCurrentMove, C.NO_TARGET_OVERRIDE);
  } else {
    G.gCurrentMove = G.gChosenMove = m.moves[G.gCurrMovePos];
  }
  if (GetBattlerSide(a) === C.B_SIDE_PLAYER) gBattleResults.lastUsedMovePlayer = G.gCurrentMove;
  else gBattleResults.lastUsedMoveOpponent = G.gCurrentMove;

  side = GetBattlerSide(a) ^ C.BIT_SIDE;
  const mv = gBattleMoves(G.gCurrentMove);
  const st = gSideTimers[side];
  if (st.followmeTimer !== 0 && mv.target === C.MOVE_TARGET_SELECTED && GetBattlerSide(a) !== GetBattlerSide(st.followmeTarget)
    && gBattleMons[st.followmeTarget].hp !== 0) {
    G.gBattlerTarget = st.followmeTarget;
  } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && st.followmeTimer === 0 && (mv.power !== 0 || mv.target !== C.MOVE_TARGET_USER)
    && gBattleMons[gBattleStruct.moveTarget[a]].ability !== C.ABILITY_LIGHTNING_ROD && mv.type === C.TYPE_ELECTRIC) {
    side = GetBattlerSide(a);
    for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
      const b = G.gActiveBattler;
      if (side !== GetBattlerSide(b) && gBattleStruct.moveTarget[a] !== b && gBattleMons[b].ability === C.ABILITY_LIGHTNING_ROD
        && GetBattlerTurnOrderNum(b) < v) v = GetBattlerTurnOrderNum(b);
    }
    if (v === 4) {
      if (gBattleMoves(G.gChosenMove).target & C.MOVE_TARGET_RANDOM) G.gBattlerTarget = randomOpponentOrPlayer(GetBattlerSide(a) === C.B_SIDE_PLAYER);
      else G.gBattlerTarget = gBattleStruct.moveTarget[a];
      fixAbsentTarget();
    } else {
      G.gActiveBattler = gBattlerByTurnOrder[v];
      RecordAbilityBattle(G.gActiveBattler, gBattleMons[G.gActiveBattler].ability);
      gSpecialStatuses[G.gActiveBattler].lightningRodRedirected = 1;
      G.gBattlerTarget = G.gActiveBattler;
    }
  } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && gBattleMoves(G.gChosenMove).target & C.MOVE_TARGET_RANDOM) {
    G.gBattlerTarget = randomOpponentOrPlayer(GetBattlerSide(a) === C.B_SIDE_PLAYER);
    if (G.gAbsentBattlerFlags & gBitTable[G.gBattlerTarget] && GetBattlerSide(a) !== GetBattlerSide(G.gBattlerTarget)) {
      G.gBattlerTarget = GetBattlerAtPosition(GetBattlerPosition(G.gBattlerTarget) ^ C.BIT_FLANK);
    }
  } else {
    G.gBattlerTarget = gBattleStruct.moveTarget[a];
    fixAbsentTarget();
  }
  G.gBattlescriptCurrInstr = scriptTable("gBattleScriptsForMoveEffects", gBattleMoves(G.gCurrentMove).effect);
  G.gCurrentActionFuncId = C.B_ACTION_EXEC_SCRIPT;
}

function HandleAction_Switch(): void {
  const a = (G.gBattlerAttacker = gBattlerByTurnOrder[G.gCurrentTurnActionNumber]);
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  gActionSelectionCursor[a] = 0;
  gMoveSelectionCursor[a] = 0;
  PREPARE_MON_NICK_BUFFER(gBattleTextBuff1, a, gBattleStruct.battlerPartyIndexes[a]);
  gBattleScripting.battler = a;
  G.gBattlescriptCurrInstr = BS("BattleScript_ActionSwitch");
  G.gCurrentActionFuncId = C.B_ACTION_EXEC_SCRIPT;
  if (gBattleResults.playerSwitchesCounter < 255) gBattleResults.playerSwitchesCounter++;
}

function HandleAction_UseItem(): void {
  const a = (G.gBattlerAttacker = G.gBattlerTarget = gBattlerByTurnOrder[G.gCurrentTurnActionNumber]);
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  ClearFuryCutterDestinyBondGrudge(a);
  G.gLastUsedItem = gBattleBufferB[a][1] | (gBattleBufferB[a][2] << 8);
  if (G.gLastUsedItem <= C.ITEM_PREMIER_BALL) {
    G.gBattlescriptCurrInstr = scriptTable("gBattlescriptsForBallThrow", G.gLastUsedItem);
  } else if (G.gLastUsedItem === C.ITEM_POKE_DOLL || G.gLastUsedItem === C.ITEM_FLUFFY_TAIL) {
    G.gBattlescriptCurrInstr = scriptTable("gBattlescriptsForRunningByItem", 0);
  } else if (G.gLastUsedItem === C.ITEM_POKE_FLUTE) {
    G.gBattlescriptCurrInstr = scriptTable("gBattlescriptsForRunningByItem", 1);
  } else if (GetBattlerSide(a) === C.B_SIDE_PLAYER) {
    G.gBattlescriptCurrInstr = scriptTable("gBattlescriptsForUsingItem", 0);
  } else {
    const bs = gBattleStruct;
    const k = a >> 1;
    gBattleScripting.battler = a;
    switch (bs.AI_itemType[k]) {
      case C.AI_ITEM_FULL_RESTORE:
      case C.AI_ITEM_HEAL_HP:
        break;
      case C.AI_ITEM_CURE_CONDITION:
        gBattleCommunication[C.MULTISTRING_CHOOSER] = 0;
        if (bs.AI_itemFlags[k] & 1) {
          if (bs.AI_itemFlags[k] & 0x3e) gBattleCommunication[C.MULTISTRING_CHOOSER] = 5;
        } else {
          while (!(bs.AI_itemFlags[k] & 1)) {
            bs.AI_itemFlags[k] >>= 1;
            gBattleCommunication[C.MULTISTRING_CHOOSER]++;
          }
        }
        break;
      case C.AI_ITEM_X_STAT:
        gBattleCommunication[C.MULTISTRING_CHOOSER] = 4;
        if (bs.AI_itemFlags[k] & 0x80) {
          gBattleCommunication[C.MULTISTRING_CHOOSER] = 5;
        } else {
          PREPARE_STAT_BUFFER(gBattleTextBuff1, C.STAT_ATK);
          PREPARE_STRING_BUFFER(gBattleTextBuff2, C.CHAR_X);
          while (!(bs.AI_itemFlags[k] & 1)) {
            bs.AI_itemFlags[k] >>= 1;
            gBattleTextBuff1[2]++;
          }
          gBattleScripting.animArg1 = gBattleTextBuff1[2] + 14;
          gBattleScripting.animArg2 = 0;
        }
        break;
      case C.AI_ITEM_GUARD_SPECS:
        gBattleCommunication[C.MULTISTRING_CHOOSER] = G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE ? 2 : 0;
        break;
    }
    G.gBattlescriptCurrInstr = scriptTable("gBattlescriptsForUsingItem", bs.AI_itemType[k]);
  }
  G.gCurrentActionFuncId = C.B_ACTION_EXEC_SCRIPT;
}

export function TryRunFromBattle(battler: number): boolean {
  let effect = 0;
  const m = gBattleMons[battler];
  const holdEffect = m.item === C.ITEM_ENIGMA_BERRY ? gEnigmaBerries[battler].holdEffect : ItemId_GetHoldEffect(m.item);
  G.gPotentialItemEffectBattler = battler;
  if (holdEffect === C.HOLD_EFFECT_CAN_ALWAYS_RUN) {
    G.gLastUsedItem = m.item;
    gProtectStructs[battler].fleeType = C.FLEE_ITEM;
    effect++;
  } else if (m.ability === C.ABILITY_RUN_AWAY) {
    G.gLastUsedAbility = C.ABILITY_RUN_AWAY;
    gProtectStructs[battler].fleeType = C.FLEE_ABILITY;
    effect++;
  } else if (IS_BATTLE_TYPE_GHOST_WITHOUT_SCOPE(G.gBattleTypeFlags)) {
    if (GetBattlerSide(battler) === C.B_SIDE_PLAYER) effect++;
  } else {
    if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE)) {
      const opp = gBattleMons[battler ^ C.BIT_SIDE];
      if (m.speed < opp.speed) {
        const speedVar = (div(m.speed * 128, opp.speed) + gBattleStruct.runTries * 30) & 0xff;
        if (speedVar > (random() & 0xff)) effect++;
      } else {
        effect++;
      }
    }
    gBattleStruct.runTries++;
  }
  if (effect !== 0) {
    G.gCurrentTurnActionNumber = G.gBattlersCount;
    G.gBattleOutcome = C.B_OUTCOME_RAN;
  }
  return effect !== 0;
}

function HandleAction_Run(): void {
  const a = (G.gBattlerAttacker = gBattlerByTurnOrder[G.gCurrentTurnActionNumber]);
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) {
    G.gCurrentTurnActionNumber = G.gBattlersCount;
    for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
      if (gChosenActionByBattler[G.gActiveBattler] === C.B_ACTION_RUN) {
        G.gBattleOutcome |= GetBattlerSide(G.gActiveBattler) === C.B_SIDE_PLAYER ? C.B_OUTCOME_LOST : C.B_OUTCOME_WON;
      }
    }
    G.gBattleOutcome |= C.B_OUTCOME_LINK_BATTLE_RAN;
  } else if (GetBattlerSide(a) === C.B_SIDE_PLAYER) {
    if (!TryRunFromBattle(a)) {
      ClearFuryCutterDestinyBondGrudge(a);
      gBattleCommunication[C.MULTISTRING_CHOOSER] = 3;
      G.gBattlescriptCurrInstr = BS("BattleScript_PrintFailedToRunString");
      G.gCurrentActionFuncId = C.B_ACTION_EXEC_SCRIPT;
    }
  } else if (gBattleMons[a].status2 & (C.STATUS2_WRAPPED | C.STATUS2_ESCAPE_PREVENTION)) {
    gBattleCommunication[C.MULTISTRING_CHOOSER] = 4;
    G.gBattlescriptCurrInstr = BS("BattleScript_PrintFailedToRunString");
    G.gCurrentActionFuncId = C.B_ACTION_EXEC_SCRIPT;
  } else {
    G.gCurrentTurnActionNumber = G.gBattlersCount;
    G.gBattleOutcome = C.B_OUTCOME_MON_FLED;
  }
}

function safariCatchFactorFromSpecies(): number {
  return div((rom.species[GetMonData(gEnemyParty[0], C.MON_DATA_SPECIES)]?.catchRate ?? 0) * 100, 1275);
}

function HandleAction_WatchesCarefully(): void {
  const bs = gBattleStruct;
  G.gBattlerAttacker = gBattlerByTurnOrder[G.gCurrentTurnActionNumber];
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  if (bs.safariRockThrowCounter !== 0) {
    bs.safariRockThrowCounter--;
    if (bs.safariRockThrowCounter === 0) {
      bs.safariCatchFactor = safariCatchFactorFromSpecies();
      gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_MON_WATCHING;
    } else {
      gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_MON_ANGRY;
    }
  } else if (bs.safariBaitThrowCounter !== 0) {
    bs.safariBaitThrowCounter--;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = bs.safariBaitThrowCounter === 0 ? C.B_MSG_MON_WATCHING : C.B_MSG_MON_EATING;
  } else {
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_MON_WATCHING;
  }
  G.gBattlescriptCurrInstr = scriptTable("gBattlescriptsForSafariActions", 0);
  G.gCurrentActionFuncId = C.B_ACTION_EXEC_SCRIPT;
}

function HandleAction_SafariZoneBallThrow(): void {
  G.gBattlerAttacker = gBattlerByTurnOrder[G.gCurrentTurnActionNumber];
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  G.gNumSafariBalls--;
  G.gLastUsedItem = C.ITEM_SAFARI_BALL;
  G.gBattlescriptCurrInstr = scriptTable("gBattlescriptsForBallThrow", C.ITEM_SAFARI_BALL);
  G.gCurrentActionFuncId = C.B_ACTION_EXEC_SCRIPT;
}

function HandleAction_ThrowBait(): void {
  const bs = gBattleStruct;
  G.gBattlerAttacker = gBattlerByTurnOrder[G.gCurrentTurnActionNumber];
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  bs.safariBaitThrowCounter += (random() % 5) + 2;
  if (bs.safariBaitThrowCounter > 6) bs.safariBaitThrowCounter = 6;
  bs.safariRockThrowCounter = 0;
  bs.safariCatchFactor >>= 1;
  if (bs.safariCatchFactor <= 2) bs.safariCatchFactor = 3;
  G.gBattlescriptCurrInstr = scriptTable("gBattlescriptsForSafariActions", 2);
  G.gCurrentActionFuncId = C.B_ACTION_EXEC_SCRIPT;
}

function HandleAction_ThrowRock(): void {
  const bs = gBattleStruct;
  G.gBattlerAttacker = gBattlerByTurnOrder[G.gCurrentTurnActionNumber];
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  bs.safariRockThrowCounter += (random() % 5) + 2;
  if (bs.safariRockThrowCounter > 6) bs.safariRockThrowCounter = 6;
  bs.safariBaitThrowCounter = 0;
  bs.safariCatchFactor <<= 1;
  if (bs.safariCatchFactor > 20) bs.safariCatchFactor = 20;
  G.gBattlescriptCurrInstr = scriptTable("gBattlescriptsForSafariActions", 1);
  G.gCurrentActionFuncId = C.B_ACTION_EXEC_SCRIPT;
}

function HandleAction_SafariZoneRun(): void {
  G.gBattlerAttacker = gBattlerByTurnOrder[G.gCurrentTurnActionNumber];
  sound.playSE(C.SE_FLEE);
  G.gCurrentTurnActionNumber = G.gBattlersCount;
  G.gBattleOutcome = C.B_OUTCOME_RAN;
}

function HandleAction_OldManBallThrow(): void {
  const a = (G.gBattlerAttacker = gBattlerByTurnOrder[G.gCurrentTurnActionNumber]);
  G.gBattle_BG0_X = 0;
  G.gBattle_BG0_Y = 0;
  PREPARE_MON_NICK_BUFFER(gBattleTextBuff1, a, gBattlerPartyIndexes[a]);
  G.gBattlescriptCurrInstr = scriptTable("gBattlescriptsForSafariActions", 3);
  G.gCurrentActionFuncId = C.B_ACTION_EXEC_SCRIPT;
  gActionsByTurnOrder[1] = C.B_ACTION_FINISHED;
}

function HandleAction_TryFinish(): void {
  if (!HandleFaintedMonActions()) {
    gBattleStruct.faintedActionsState = 0;
    G.gCurrentActionFuncId = C.B_ACTION_FINISHED;
  }
}

const HITMARKER_CLEAR_AFTER_ACTION = C.HITMARKER_DESTINYBOND | C.HITMARKER_IGNORE_SUBSTITUTE | C.HITMARKER_ATTACKSTRING_PRINTED
  | C.HITMARKER_NO_PPDEDUCT | C.HITMARKER_STATUS_ABILITY_EFFECT | C.HITMARKER_IGNORE_ON_AIR | C.HITMARKER_IGNORE_UNDERGROUND
  | C.HITMARKER_IGNORE_UNDERWATER | C.HITMARKER_PASSIVE_DAMAGE | C.HITMARKER_OBEYS | C.HITMARKER_WAKE_UP_CLEAR
  | C.HITMARKER_SYNCHRONISE_EFFECT | C.HITMARKER_CHARGING | C.HITMARKER_NEVER_SET;

function HandleAction_NothingIsFainted(): void {
  G.gCurrentTurnActionNumber++;
  G.gCurrentActionFuncId = gActionsByTurnOrder[G.gCurrentTurnActionNumber];
  G.gHitMarker &= ~HITMARKER_CLEAR_AFTER_ACTION;
}

function HandleAction_ActionFinished(): void {
  G.gCurrentTurnActionNumber++;
  G.gCurrentActionFuncId = gActionsByTurnOrder[G.gCurrentTurnActionNumber];
  SpecialStatusesClear();
  G.gHitMarker &= ~HITMARKER_CLEAR_AFTER_ACTION;
  G.gCurrentMove = C.MOVE_NONE;
  G.gBattleMoveDamage = 0;
  G.gMoveResultFlags = 0;
  gBattleScripting.animTurn = 0;
  gBattleScripting.animTargetsHit = 0;
  gLastLandedMoves[G.gBattlerAttacker] = 0;
  gLastHitByType[G.gBattlerAttacker] = 0;
  gBattleStruct.dynamicMoveType = 0;
  G.gDynamicBasePower = 0;
  gBattleScripting.moveendState = 0;
  gBattleCommunication[C.MOVE_EFFECT_BYTE] = 0;
  gBattleCommunication[C.ACTIONS_CONFIRMED_COUNT] = 0;
  gBattleScripting.multihitMoveEffect = 0;
  gBattleResources.battleScriptsStack.size = 0;
}

const sTurnActionsFuncsTable: Record<number, () => void> = {
  [C.B_ACTION_USE_MOVE]: HandleAction_UseMove,
  [C.B_ACTION_USE_ITEM]: HandleAction_UseItem,
  [C.B_ACTION_SWITCH]: HandleAction_Switch,
  [C.B_ACTION_RUN]: HandleAction_Run,
  [C.B_ACTION_SAFARI_WATCH_CAREFULLY]: HandleAction_WatchesCarefully,
  [C.B_ACTION_SAFARI_BALL]: HandleAction_SafariZoneBallThrow,
  [C.B_ACTION_SAFARI_BAIT]: HandleAction_ThrowBait,
  [C.B_ACTION_SAFARI_GO_NEAR]: HandleAction_ThrowRock,
  [C.B_ACTION_SAFARI_RUN]: HandleAction_SafariZoneRun,
  [C.B_ACTION_OLDMAN_THROW]: HandleAction_OldManBallThrow,
  [C.B_ACTION_EXEC_SCRIPT]: HandleAction_RunBattleScript,
  [C.B_ACTION_TRY_FINISH]: HandleAction_TryFinish,
  [C.B_ACTION_FINISHED]: HandleAction_ActionFinished,
  [C.B_ACTION_NOTHING_FAINTED]: HandleAction_NothingIsFainted,
};

const sEndTurnFuncsTable: Record<number, () => void> = {
  0: HandleEndTurn_ContinueBattle,
  [C.B_OUTCOME_WON]: HandleEndTurn_BattleWon,
  [C.B_OUTCOME_LOST]: HandleEndTurn_BattleLost,
  [C.B_OUTCOME_DREW]: HandleEndTurn_BattleLost,
  [C.B_OUTCOME_RAN]: HandleEndTurn_RanFromBattle,
  [C.B_OUTCOME_PLAYER_TELEPORTED]: HandleEndTurn_FinishBattle,
  [C.B_OUTCOME_MON_FLED]: HandleEndTurn_MonFled,
  [C.B_OUTCOME_CAUGHT]: HandleEndTurn_FinishBattle,
  [C.B_OUTCOME_NO_SAFARI_BALLS]: HandleEndTurn_FinishBattle,
};
