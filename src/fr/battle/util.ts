// battle_util.c

import * as C from "../generated/constants";
import { random } from "../random";
import { BS, BattleScriptPop, BattleScriptPush, BattleScriptPushCursor, r8 } from "./bscript";
import { cdata } from "../hw/assets";
import { flagGet } from "../save";
import { gBattleScriptingCommandsTable } from "./cmds";
import {
  G, gActionsByTurnOrder, gBattleBufferB, gBattleCommunication, gBattleMons, gBattleResources, gBattleScripting,
  gBattleStruct, gBattleTextBuff1, gBattlerByTurnOrder, gBattlerPartyIndexes, gBattlerPositions, gBitTable, gChosenMoveByBattler,
  gDisableStructs, gEnigmaBerries, gLastMoves, gProtectStructs, gSelectionBattleScripts, gSentPokesToOpponent, gSideStatuses, gSideTimers,
  gSpecialStatuses, gStatuses3, gTakenDmg, gTakenDmgByBattler, gWishFutureKnock, gBattleTextBuff2,
} from "./globals";
import {
  BATTLE_OPPOSITE, IS_BATTLER_OF_TYPE, MOVE_IS_PERMANENT, SET_BATTLER_TYPE, STATUS1_SLEEP_TURN, STATUS1_TOXIC_TURN, STATUS2_BIDE_TURN,
  STATUS2_CONFUSION_TURN, STATUS2_LOCK_CONFUSE_TURN, STATUS2_UPROAR_TURN, STATUS2_WRAPPED_TURN, STATUS3_ALWAYS_HITS_TURN, STATUS3_YAWN_TURN,
  div, gBattleMoves, GET_MOVE_TYPE, STATUS2_INFATUATED_WITH,
} from "./macros";
import { BtlController_EmitPrintString, BtlController_EmitSetMonData, BUFFER_A } from "./controllers";
import {
  B_BUFF_EOS, B_BUFF_MOVE, B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_STRING, PREPARE_ABILITY_BUFFER, PREPARE_BYTE_NUMBER_BUFFER, PREPARE_FLAVOR_BUFFER,
  PREPARE_MON_NICK_WITH_PREFIX_BUFFER, PREPARE_MOVE_BUFFER, PREPARE_STAT_BUFFER, PREPARE_STRING_BUFFER, PREPARE_TYPE_BUFFER,
} from "./message";
import { CalculateBaseDamage } from "./damage";
import { SetMoveEffect, u32bytes } from "./cmds/part1";
import { UproarWakeUpCheck } from "./cmds/part3";
import { BattleTurnPassed, GetWhoStrikesFirst, RunBattleScriptCommands, RunBattleScriptCommands_PopCallbacksStack, SwapTurnOrder } from "./main";
import { CalculatePPWithBonus, GetGenderFromSpeciesAndPersonality, GetMonData, gEnemyParty, playerMon, type Mon } from "../pokemon/mon";
import { GetFlavorRelationByPersonality, IsOtherTrainer } from "../pokemon/mon_extra";
import { GetCurrentWeather } from "./ext";
import { rom } from "../rom";

const MAX_MON_MOVES = 4;
const PARTY_SIZE = 6;

export function partyFor(battler: number): (i: number) => Mon {
  return GetBattlerSide(battler) === C.B_SIDE_PLAYER ? playerMon : (i) => gEnemyParty[i];
}

// ---------------------------------------------------------------- positions (battle_main.c helpers kept here)
export function GetBattlerPosition(battler: number): number {
  return gBattlerPositions[battler];
}

export function GetBattlerAtPosition(position: number): number {
  let i = 0;
  for (; i < G.gBattlersCount; i++) if (gBattlerPositions[i] === position) break;
  return i;
}

export function GetBattlerSide(battler: number): number {
  return GetBattlerPosition(battler) & C.BIT_SIDE;
}

export function WEATHER_HAS_EFFECT(): boolean {
  return AbilityBattleEffects(C.ABILITYEFFECT_CHECK_ON_FIELD, 0, C.ABILITY_CLOUD_NINE, 0, 0) === 0
    && AbilityBattleEffects(C.ABILITYEFFECT_CHECK_ON_FIELD, 0, C.ABILITY_AIR_LOCK, 0, 0) === 0;
}
export const WEATHER_HAS_EFFECT2 = WEATHER_HAS_EFFECT;

export function IS_BATTLE_TYPE_GHOST_WITHOUT_SCOPE(flags: number): boolean {
  return (flags & C.BATTLE_TYPE_GHOST) !== 0 && (flags & C.BATTLE_TYPE_GHOST_UNVEILED) === 0;
}

export function ItemId_GetHoldEffect(item: number): number {
  return rom.items[item]?.holdEffect ?? 0;
}

export function ItemId_GetHoldEffectParam(item: number): number {
  return rom.items[item]?.holdEffectParam ?? 0;
}

function holdEffectOf(battler: number): number {
  return gBattleMons[battler].item === C.ITEM_ENIGMA_BERRY ? gEnigmaBerries[battler].holdEffect : ItemId_GetHoldEffect(gBattleMons[battler].item);
}

function holdEffectParamOf(battler: number): number {
  return gBattleMons[battler].item === C.ITEM_ENIGMA_BERRY ? gEnigmaBerries[battler].holdEffectParam : ItemId_GetHoldEffectParam(gBattleMons[battler].item);
}

function CountTrailingZeroBits(value: number): number {
  for (let i = 0; i < 32; i++) if (value & (1 << i)) return i;
  return 0;
}

// ---------------------------------------------------------------- battle_util.c
export function GetBattlerForBattleScript(caseId: number): number {
  switch (caseId) {
    case C.BS_TARGET: return G.gBattlerTarget;
    case C.BS_ATTACKER: return G.gBattlerAttacker;
    case C.BS_EFFECT_BATTLER: return G.gEffectBattler;
    case C.BS_BATTLER_0: return 0;
    case C.BS_SCRIPTING: return gBattleScripting.battler;
    case C.BS_FAINTED: return G.gBattlerFainted;
    case C.BS_FAINTED_LINK_MULTIPLE_1: return G.gBattlerFainted;
    case C.BS_PLAYER1: return GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
    case C.BS_OPPONENT1: return GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
  }
  return 0;
}

function emitPP(attacker: number, moveIndex: number): void {
  G.gActiveBattler = attacker;
  BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_PPMOVE1_BATTLE + moveIndex, 0, 1, [gBattleMons[attacker].pp[moveIndex]]);
  MarkBattlerForControllerExec(attacker);
}

export function PressurePPLose(target: number, attacker: number, move: number): void {
  if (gBattleMons[target].ability !== C.ABILITY_PRESSURE) return;
  let moveIndex = 0;
  for (; moveIndex < MAX_MON_MOVES; moveIndex++) if (gBattleMons[attacker].moves[moveIndex] === move) break;
  if (moveIndex === MAX_MON_MOVES) return;
  if (gBattleMons[attacker].pp[moveIndex] !== 0) gBattleMons[attacker].pp[moveIndex]--;
  if (MOVE_IS_PERMANENT(attacker, moveIndex, gDisableStructs[attacker])) emitPP(attacker, moveIndex);
}

function pressureOnMove(attacker: number, move: number, cond: (i: number) => boolean): void {
  let pos = MAX_MON_MOVES;
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (cond(i) && gBattleMons[i].ability === C.ABILITY_PRESSURE) {
      let j = 0;
      for (; j < MAX_MON_MOVES; j++) if (gBattleMons[attacker].moves[j] === move) break;
      if (j !== MAX_MON_MOVES) {
        pos = j;
        if (gBattleMons[attacker].pp[j] !== 0) gBattleMons[attacker].pp[j]--;
      }
    }
  }
  if (pos !== MAX_MON_MOVES && MOVE_IS_PERMANENT(attacker, pos, gDisableStructs[attacker])) emitPP(attacker, pos);
}

export function PressurePPLoseOnUsingImprison(attacker: number): void {
  const atkSide = GetBattlerSide(attacker);
  pressureOnMove(attacker, C.MOVE_IMPRISON, (i) => atkSide !== GetBattlerSide(i));
}

export function PressurePPLoseOnUsingPerishSong(attacker: number): void {
  pressureOnMove(attacker, C.MOVE_PERISH_SONG, (i) => i !== attacker);
}

export function MarkBattlerForControllerExec(battler: number): void {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) G.gBattleControllerExecFlags = (G.gBattleControllerExecFlags | (gBitTable[battler] << 28)) >>> 0;
  else G.gBattleControllerExecFlags = (G.gBattleControllerExecFlags | gBitTable[battler]) >>> 0;
}

export function CancelMultiTurnMoves(battler: number): void {
  const m = gBattleMons[battler];
  m.status2 &= ~C.STATUS2_MULTIPLETURNS;
  m.status2 &= ~C.STATUS2_LOCK_CONFUSE;
  m.status2 &= ~C.STATUS2_UPROAR;
  m.status2 &= ~C.STATUS2_BIDE;
  gStatuses3[battler] &= ~C.STATUS3_SEMI_INVULNERABLE;
  gDisableStructs[battler].rolloutTimer = 0;
  gDisableStructs[battler].furyCutterCounter = 0;
}

export function WasUnableToUseMove(battler: number): boolean {
  const p = gProtectStructs[battler];
  return !!(p.prlzImmobility || p.targetNotAffected || p.usedImprisonedMove || p.loveImmobility || p.usedDisabledMove
    || p.usedTauntedMove || p.flag2Unknown || p.flinchImmobility || p.confusionSelfDmg);
}

export function PrepareStringBattle(stringId: number, battler: number): void {
  G.gActiveBattler = battler;
  BtlController_EmitPrintString(BUFFER_A, stringId);
  MarkBattlerForControllerExec(battler);
}

export function ResetSentPokesToOpponentValue(): void {
  let bits = 0;
  gSentPokesToOpponent[0] = 0;
  gSentPokesToOpponent[1] = 0;
  for (let i = 0; i < G.gBattlersCount; i += 2) bits |= gBitTable[gBattlerPartyIndexes[i]];
  for (let i = 1; i < G.gBattlersCount; i += 2) gSentPokesToOpponent[(i & C.BIT_FLANK) >> 1] = bits;
}

export function OpponentSwitchInResetSentPokesToOpponentValue(battler: number): void {
  let bits = 0;
  if (GetBattlerSide(battler) === C.B_SIDE_OPPONENT) {
    const flank = (battler & C.BIT_FLANK) >> 1;
    gSentPokesToOpponent[flank] = 0;
    for (let i = 0; i < G.gBattlersCount; i += 2) if (!(G.gAbsentBattlerFlags & gBitTable[i])) bits |= gBitTable[gBattlerPartyIndexes[i]];
    gSentPokesToOpponent[flank] = bits;
  }
}

export function UpdateSentPokesToOpponentValue(battler: number): void {
  if (GetBattlerSide(battler) === C.B_SIDE_OPPONENT) {
    OpponentSwitchInResetSentPokesToOpponentValue(battler);
  } else {
    for (let i = 1; i < G.gBattlersCount; i++) gSentPokesToOpponent[(i & C.BIT_FLANK) >> 1] |= gBitTable[gBattlerPartyIndexes[battler]];
  }
}

export function TrySetCantSelectMoveBattleScript(): number {
  const b = G.gActiveBattler;
  let limitations = 0;
  const move = gBattleMons[b].moves[gBattleBufferB[b][2]];
  const choiced = gBattleStruct.choicedMove[b];
  if (gDisableStructs[b].disabledMove === move && move !== C.MOVE_NONE) {
    gBattleScripting.battler = b;
    G.gCurrentMove = move;
    gSelectionBattleScripts[b] = BS("BattleScript_SelectingDisabledMove");
    limitations = 1;
  }
  if (move === gLastMoves[b] && move !== C.MOVE_STRUGGLE && gBattleMons[b].status2 & C.STATUS2_TORMENT) {
    CancelMultiTurnMoves(b);
    gSelectionBattleScripts[b] = BS("BattleScript_SelectingTormentedMove");
    limitations++;
  }
  if (gDisableStructs[b].tauntTimer !== 0 && gBattleMoves(move).power === 0) {
    G.gCurrentMove = move;
    gSelectionBattleScripts[b] = BS("BattleScript_SelectingNotAllowedMoveTaunt");
    limitations++;
  }
  if (GetImprisonedMovesCount(b, move)) {
    G.gCurrentMove = move;
    gSelectionBattleScripts[b] = BS("BattleScript_SelectingImprisonedMove");
    limitations++;
  }
  const holdEffect = holdEffectOf(b);
  G.gPotentialItemEffectBattler = b;
  if (holdEffect === C.HOLD_EFFECT_CHOICE_BAND && choiced !== C.MOVE_NONE && choiced !== C.MOVE_UNAVAILABLE && choiced !== move) {
    G.gCurrentMove = choiced;
    G.gLastUsedItem = gBattleMons[b].item;
    gSelectionBattleScripts[b] = BS("BattleScript_SelectingNotAllowedMoveChoiceItem");
    limitations++;
  }
  if (gBattleMons[b].pp[gBattleBufferB[b][2]] === 0) {
    gSelectionBattleScripts[b] = BS("BattleScript_SelectingMoveWithNoPP");
    limitations++;
  }
  return limitations;
}

export function CheckMoveLimitations(battler: number, unusableMoves: number, check: number): number {
  const choiced = gBattleStruct.choicedMove[battler];
  const holdEffect = holdEffectOf(battler);
  const m = gBattleMons[battler];
  const d = gDisableStructs[battler];
  G.gPotentialItemEffectBattler = battler;
  for (let i = 0; i < MAX_MON_MOVES; i++) {
    const mv = m.moves[i];
    if (mv === C.MOVE_NONE && check & C.MOVE_LIMITATION_ZEROMOVE) unusableMoves |= gBitTable[i];
    if (m.pp[i] === 0 && check & C.MOVE_LIMITATION_PP) unusableMoves |= gBitTable[i];
    if (mv === d.disabledMove && check & C.MOVE_LIMITATION_DISABLED) unusableMoves |= gBitTable[i];
    if (mv === gLastMoves[battler] && check & C.MOVE_LIMITATION_TORMENTED && m.status2 & C.STATUS2_TORMENT) unusableMoves |= gBitTable[i];
    if (d.tauntTimer && check & C.MOVE_LIMITATION_TAUNT && gBattleMoves(mv).power === 0) unusableMoves |= gBitTable[i];
    if (GetImprisonedMovesCount(battler, mv) && check & C.MOVE_LIMITATION_IMPRISON) unusableMoves |= gBitTable[i];
    if (d.encoreTimer && d.encoredMove !== mv) unusableMoves |= gBitTable[i];
    if (holdEffect === C.HOLD_EFFECT_CHOICE_BAND && choiced !== C.MOVE_NONE && choiced !== C.MOVE_UNAVAILABLE && choiced !== mv) unusableMoves |= gBitTable[i];
  }
  return unusableMoves & 0xff;
}

export function AreAllMovesUnusable(): boolean {
  const b = G.gActiveBattler;
  const unusable = CheckMoveLimitations(b, 0, C.MOVE_LIMITATIONS_ALL);
  if (unusable === 0xf) {
    gProtectStructs[b].noValidMoves = 1;
    gSelectionBattleScripts[b] = BS("BattleScript_NoMovesLeft");
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) gBattleBufferB[b][3] = GetBattlerAtPosition(BATTLE_OPPOSITE(GetBattlerPosition(b)) | (random() & 2));
    else gBattleBufferB[b][3] = GetBattlerAtPosition(BATTLE_OPPOSITE(GetBattlerPosition(b)));
  } else {
    gProtectStructs[b].noValidMoves = 0;
  }
  return unusable === 0xf;
}

export function GetImprisonedMovesCount(battler: number, move: number): number {
  let n = 0;
  const side = GetBattlerSide(battler);
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (side !== GetBattlerSide(i) && gStatuses3[i] & C.STATUS3_IMPRISONED_OTHERS) {
      let j = 0;
      for (; j < MAX_MON_MOVES; j++) if (move === gBattleMons[i].moves[j]) break;
      if (j < MAX_MON_MOVES) n++;
    }
  }
  return n;
}

const enum EndTurn {
  ORDER, REFLECT, LIGHT_SCREEN, MIST, SAFEGUARD, WISH, RAIN, SANDSTORM, SUN, HAIL, FIELD_COUNT,
}

export function DoFieldEndTurnEffects(): boolean {
  let effect = 0;
  for (G.gBattlerAttacker = 0; G.gBattlerAttacker < G.gBattlersCount && G.gAbsentBattlerFlags & gBitTable[G.gBattlerAttacker]; G.gBattlerAttacker++);
  for (G.gBattlerTarget = 0; G.gBattlerTarget < G.gBattlersCount && G.gAbsentBattlerFlags & gBitTable[G.gBattlerTarget]; G.gBattlerTarget++);
  const bs = gBattleStruct;

  const sideTimerCase = (battlerOf: (s: number) => number, run: (side: number) => boolean) => {
    while (bs.turnSideTracker < 2) {
      const side = bs.turnSideTracker;
      G.gActiveBattler = G.gBattlerAttacker = battlerOf(side);
      if (run(side)) effect++;
      bs.turnSideTracker++;
      if (effect !== 0) break;
    }
    if (effect === 0) {
      bs.turnCountersTracker++;
      bs.turnSideTracker = 0;
    }
  };

  do {
    switch (bs.turnCountersTracker) {
      case EndTurn.ORDER: {
        for (let i = 0; i < G.gBattlersCount; i++) gBattlerByTurnOrder[i] = i;
        for (let i = 0; i < G.gBattlersCount - 1; i++) {
          for (let j = i + 1; j < G.gBattlersCount; j++) if (GetWhoStrikesFirst(gBattlerByTurnOrder[i], gBattlerByTurnOrder[j], false)) SwapTurnOrder(i, j);
        }
        bs.turnCountersTracker++;
        bs.turnSideTracker = 0;
      }
      // fall through
      case EndTurn.REFLECT:
        if (bs.turnCountersTracker === EndTurn.REFLECT) {
          sideTimerCase((s) => gSideTimers[s].reflectBattlerId, (side) => {
            if (gSideStatuses[side] & C.SIDE_STATUS_REFLECT && --gSideTimers[side].reflectTimer === 0) {
              gSideStatuses[side] &= ~C.SIDE_STATUS_REFLECT;
              BattleScriptExecute(BS("BattleScript_SideStatusWoreOff"));
              PREPARE_MOVE_BUFFER(gBattleTextBuff1, C.MOVE_REFLECT);
              return true;
            }
            return false;
          });
        }
        break;
      case EndTurn.LIGHT_SCREEN:
        sideTimerCase((s) => gSideTimers[s].lightscreenBattlerId, (side) => {
          if (gSideStatuses[side] & C.SIDE_STATUS_LIGHTSCREEN && --gSideTimers[side].lightscreenTimer === 0) {
            gSideStatuses[side] &= ~C.SIDE_STATUS_LIGHTSCREEN;
            BattleScriptExecute(BS("BattleScript_SideStatusWoreOff"));
            gBattleCommunication[C.MULTISTRING_CHOOSER] = side;
            PREPARE_MOVE_BUFFER(gBattleTextBuff1, C.MOVE_LIGHT_SCREEN);
            return true;
          }
          return false;
        });
        break;
      case EndTurn.MIST:
        sideTimerCase((s) => gSideTimers[s].mistBattlerId, (side) => {
          if (gSideTimers[side].mistTimer !== 0 && --gSideTimers[side].mistTimer === 0) {
            gSideStatuses[side] &= ~C.SIDE_STATUS_MIST;
            BattleScriptExecute(BS("BattleScript_SideStatusWoreOff"));
            gBattleCommunication[C.MULTISTRING_CHOOSER] = side;
            PREPARE_MOVE_BUFFER(gBattleTextBuff1, C.MOVE_MIST);
            return true;
          }
          return false;
        });
        break;
      case EndTurn.SAFEGUARD:
        sideTimerCase((s) => gSideTimers[s].safeguardBattlerId, (side) => {
          if (gSideStatuses[side] & C.SIDE_STATUS_SAFEGUARD && --gSideTimers[side].safeguardTimer === 0) {
            gSideStatuses[side] &= ~C.SIDE_STATUS_SAFEGUARD;
            BattleScriptExecute(BS("BattleScript_SafeguardEnds"));
            return true;
          }
          return false;
        });
        break;
      case EndTurn.WISH:
        while (bs.turnSideTracker < G.gBattlersCount) {
          const b = (G.gActiveBattler = gBattlerByTurnOrder[bs.turnSideTracker]);
          if (gWishFutureKnock.wishCounter[b] !== 0 && --gWishFutureKnock.wishCounter[b] === 0 && gBattleMons[b].hp !== 0) {
            G.gBattlerTarget = b;
            BattleScriptExecute(BS("BattleScript_WishComesTrue"));
            effect++;
          }
          bs.turnSideTracker++;
          if (effect !== 0) break;
        }
        if (effect === 0) bs.turnCountersTracker++;
        break;
      case EndTurn.RAIN:
        if (G.gBattleWeather & C.B_WEATHER_RAIN) {
          const MC = C.MULTISTRING_CHOOSER;
          if (!(G.gBattleWeather & C.B_WEATHER_RAIN_PERMANENT)) {
            if (--gWishFutureKnock.weatherDuration === 0) {
              G.gBattleWeather &= ~C.B_WEATHER_RAIN_TEMPORARY;
              G.gBattleWeather &= ~C.B_WEATHER_RAIN_DOWNPOUR;
              gBattleCommunication[MC] = C.B_MSG_RAIN_STOPPED;
            } else if (G.gBattleWeather & C.B_WEATHER_RAIN_DOWNPOUR) gBattleCommunication[MC] = C.B_MSG_DOWNPOUR_CONTINUES;
            else gBattleCommunication[MC] = C.B_MSG_RAIN_CONTINUES;
          } else if (G.gBattleWeather & C.B_WEATHER_RAIN_DOWNPOUR) gBattleCommunication[MC] = C.B_MSG_DOWNPOUR_CONTINUES;
          else gBattleCommunication[MC] = C.B_MSG_RAIN_CONTINUES;
          BattleScriptExecute(BS("BattleScript_RainContinuesOrEnds"));
          effect++;
        }
        bs.turnCountersTracker++;
        break;
      case EndTurn.SANDSTORM:
        if (G.gBattleWeather & C.B_WEATHER_SANDSTORM) {
          if (!(G.gBattleWeather & C.B_WEATHER_SANDSTORM_PERMANENT) && --gWishFutureKnock.weatherDuration === 0) {
            G.gBattleWeather &= ~C.B_WEATHER_SANDSTORM_TEMPORARY;
            G.gBattlescriptCurrInstr = BS("BattleScript_SandStormHailEnds");
          } else {
            G.gBattlescriptCurrInstr = BS("BattleScript_DamagingWeatherContinues");
          }
          gBattleScripting.animArg1 = C.B_ANIM_SANDSTORM_CONTINUES;
          gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SANDSTORM;
          BattleScriptExecute(G.gBattlescriptCurrInstr);
          effect++;
        }
        bs.turnCountersTracker++;
        break;
      case EndTurn.SUN:
        if (G.gBattleWeather & C.B_WEATHER_SUN) {
          if (!(G.gBattleWeather & C.B_WEATHER_SUN_PERMANENT) && --gWishFutureKnock.weatherDuration === 0) {
            G.gBattleWeather &= ~C.B_WEATHER_SUN_TEMPORARY;
            G.gBattlescriptCurrInstr = BS("BattleScript_SunlightFaded");
          } else {
            G.gBattlescriptCurrInstr = BS("BattleScript_SunlightContinues");
          }
          BattleScriptExecute(G.gBattlescriptCurrInstr);
          effect++;
        }
        bs.turnCountersTracker++;
        break;
      case EndTurn.HAIL:
        if (G.gBattleWeather & C.B_WEATHER_HAIL) {
          if (--gWishFutureKnock.weatherDuration === 0) {
            G.gBattleWeather &= ~C.B_WEATHER_HAIL_TEMPORARY;
            G.gBattlescriptCurrInstr = BS("BattleScript_SandStormHailEnds");
          } else {
            G.gBattlescriptCurrInstr = BS("BattleScript_DamagingWeatherContinues");
          }
          gBattleScripting.animArg1 = C.B_ANIM_HAIL_CONTINUES;
          gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_HAIL;
          BattleScriptExecute(G.gBattlescriptCurrInstr);
          effect++;
        }
        bs.turnCountersTracker++;
        break;
      case EndTurn.FIELD_COUNT:
        effect++;
        break;
    }
  } while (effect === 0);
  return G.gBattleMainFunc !== BattleTurnPassed;
}

const enum BEnd {
  INGRAIN, ABILITIES, ITEMS1, LEECH_SEED, POISON, BAD_POISON, BURN, NIGHTMARES, CURSE, WRAP, UPROAR, THRASH, DISABLE, ENCORE,
  LOCK_ON, CHARGE, TAUNT, YAWN, ITEMS2, BATTLER_COUNT,
}

function fractionDmg(battler: number, d: number): void {
  G.gBattleMoveDamage = div(gBattleMons[battler].maxHP, d);
  if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
}

function emitStatus1(battler: number): void {
  BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_STATUS_BATTLE, 0, 4, u32bytes(gBattleMons[battler].status1));
  MarkBattlerForControllerExec(battler);
}

function putWrappedMoveInBuff1(b: number): void {
  gBattleTextBuff1[0] = B_BUFF_PLACEHOLDER_BEGIN;
  gBattleTextBuff1[1] = B_BUFF_MOVE;
  gBattleTextBuff1[2] = gBattleStruct.wrappedMove[b * 2 + 0];
  gBattleTextBuff1[3] = gBattleStruct.wrappedMove[b * 2 + 1];
  gBattleTextBuff1[4] = B_BUFF_EOS;
}

export function DoBattlerEndTurnEffects(): number {
  let effect = 0;
  const bs = gBattleStruct;
  G.gHitMarker |= C.HITMARKER_GRUDGE | C.HITMARKER_SKIP_DMG_TRACK;
  while (bs.turnEffectsBattlerId < G.gBattlersCount && bs.turnEffectsTracker <= BEnd.BATTLER_COUNT) {
    G.gActiveBattler = G.gBattlerAttacker = gBattlerByTurnOrder[bs.turnEffectsBattlerId];
    const b = G.gActiveBattler;
    const m = gBattleMons[b];
    if (G.gAbsentBattlerFlags & gBitTable[b]) {
      bs.turnEffectsBattlerId++;
      continue;
    }
    switch (bs.turnEffectsTracker) {
      case BEnd.INGRAIN:
        if (gStatuses3[b] & C.STATUS3_ROOTED && m.hp !== m.maxHP && m.hp !== 0) {
          fractionDmg(b, 16);
          G.gBattleMoveDamage *= -1;
          BattleScriptExecute(BS("BattleScript_IngrainTurnHeal"));
          effect++;
        }
        bs.turnEffectsTracker++;
        break;
      case BEnd.ABILITIES:
        if (AbilityBattleEffects(C.ABILITYEFFECT_ENDTURN, b, 0, 0, 0)) effect++;
        bs.turnEffectsTracker++;
        break;
      case BEnd.ITEMS1:
        if (ItemBattleEffects(C.ITEMEFFECT_NORMAL, b, false)) effect++;
        bs.turnEffectsTracker++;
        break;
      case BEnd.ITEMS2:
        if (ItemBattleEffects(C.ITEMEFFECT_NORMAL, b, true)) effect++;
        bs.turnEffectsTracker++;
        break;
      case BEnd.LEECH_SEED:
        if (gStatuses3[b] & C.STATUS3_LEECHSEED && gBattleMons[gStatuses3[b] & C.STATUS3_LEECHSEED_BATTLER].hp !== 0 && m.hp !== 0) {
          G.gBattlerTarget = gStatuses3[b] & C.STATUS3_LEECHSEED_BATTLER;
          fractionDmg(b, 8);
          gBattleScripting.animArg1 = G.gBattlerTarget;
          gBattleScripting.animArg2 = G.gBattlerAttacker;
          BattleScriptExecute(BS("BattleScript_LeechSeedTurnDrain"));
          effect++;
        }
        bs.turnEffectsTracker++;
        break;
      case BEnd.POISON:
        if (m.status1 & C.STATUS1_POISON && m.hp !== 0) {
          fractionDmg(b, 8);
          BattleScriptExecute(BS("BattleScript_PoisonTurnDmg"));
          effect++;
        }
        bs.turnEffectsTracker++;
        break;
      case BEnd.BAD_POISON:
        if (m.status1 & C.STATUS1_TOXIC_POISON && m.hp !== 0) {
          fractionDmg(b, 16);
          if ((m.status1 & C.STATUS1_TOXIC_COUNTER) !== STATUS1_TOXIC_TURN(15)) m.status1 += STATUS1_TOXIC_TURN(1);
          G.gBattleMoveDamage *= (m.status1 & C.STATUS1_TOXIC_COUNTER) >> 8;
          BattleScriptExecute(BS("BattleScript_PoisonTurnDmg"));
          effect++;
        }
        bs.turnEffectsTracker++;
        break;
      case BEnd.BURN:
        if (m.status1 & C.STATUS1_BURN && m.hp !== 0) {
          fractionDmg(b, 8);
          BattleScriptExecute(BS("BattleScript_BurnTurnDmg"));
          effect++;
        }
        bs.turnEffectsTracker++;
        break;
      case BEnd.NIGHTMARES:
        if (m.status2 & C.STATUS2_NIGHTMARE && m.hp !== 0) {
          if (m.status1 & C.STATUS1_SLEEP) {
            fractionDmg(b, 4);
            BattleScriptExecute(BS("BattleScript_NightmareTurnDmg"));
            effect++;
          } else {
            m.status2 &= ~C.STATUS2_NIGHTMARE;
          }
        }
        bs.turnEffectsTracker++;
        break;
      case BEnd.CURSE:
        if (m.status2 & C.STATUS2_CURSED && m.hp !== 0) {
          fractionDmg(b, 4);
          BattleScriptExecute(BS("BattleScript_CurseTurnDmg"));
          effect++;
        }
        bs.turnEffectsTracker++;
        break;
      case BEnd.WRAP:
        if (m.status2 & C.STATUS2_WRAPPED && m.hp !== 0) {
          m.status2 -= STATUS2_WRAPPED_TURN(1);
          if (m.status2 & C.STATUS2_WRAPPED) {
            gBattleScripting.animArg1 = gBattleStruct.wrappedMove[b * 2 + 0];
            gBattleScripting.animArg2 = gBattleStruct.wrappedMove[b * 2 + 1];
            putWrappedMoveInBuff1(b);
            G.gBattlescriptCurrInstr = BS("BattleScript_WrapTurnDmg");
            fractionDmg(b, 16);
          } else {
            putWrappedMoveInBuff1(b);
            G.gBattlescriptCurrInstr = BS("BattleScript_WrapEnds");
          }
          BattleScriptExecute(G.gBattlescriptCurrInstr);
          effect++;
        }
        bs.turnEffectsTracker++;
        break;
      case BEnd.UPROAR:
        if (m.status2 & C.STATUS2_UPROAR) {
          for (G.gBattlerAttacker = 0; G.gBattlerAttacker < G.gBattlersCount; G.gBattlerAttacker++) {
            const a = gBattleMons[G.gBattlerAttacker];
            if (a.status1 & C.STATUS1_SLEEP && a.ability !== C.ABILITY_SOUNDPROOF) {
              a.status1 &= ~C.STATUS1_SLEEP;
              a.status2 &= ~C.STATUS2_NIGHTMARE;
              gBattleCommunication[C.MULTISTRING_CHOOSER] = 1;
              BattleScriptExecute(BS("BattleScript_MonWokeUpInUproar"));
              G.gActiveBattler = G.gBattlerAttacker;
              emitStatus1(G.gActiveBattler);
              break;
            }
          }
          if (G.gBattlerAttacker !== G.gBattlersCount) {
            effect = 2;
            break;
          } else {
            G.gBattlerAttacker = b;
            m.status2 -= STATUS2_UPROAR_TURN(1);
            if (WasUnableToUseMove(b)) {
              CancelMultiTurnMoves(b);
              gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_UPROAR_ENDS;
            } else if (m.status2 & C.STATUS2_UPROAR) {
              gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_UPROAR_CONTINUES;
              m.status2 |= C.STATUS2_MULTIPLETURNS;
            } else {
              gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_UPROAR_ENDS;
              CancelMultiTurnMoves(b);
            }
            BattleScriptExecute(BS("BattleScript_PrintUproarOverTurns"));
            effect = 1;
          }
        }
        if (effect !== 2) bs.turnEffectsTracker++;
        break;
      case BEnd.THRASH:
        if (m.status2 & C.STATUS2_LOCK_CONFUSE) {
          m.status2 -= STATUS2_LOCK_CONFUSE_TURN(1);
          if (WasUnableToUseMove(b)) CancelMultiTurnMoves(b);
          else if (!(m.status2 & C.STATUS2_LOCK_CONFUSE) && m.status2 & C.STATUS2_MULTIPLETURNS) {
            m.status2 &= ~C.STATUS2_MULTIPLETURNS;
            if (!(m.status2 & C.STATUS2_CONFUSION)) {
              gBattleCommunication[C.MOVE_EFFECT_BYTE] = C.MOVE_EFFECT_CONFUSION | C.MOVE_EFFECT_AFFECTS_USER;
              SetMoveEffect(true, 0);
              if (m.status2 & C.STATUS2_CONFUSION) BattleScriptExecute(BS("BattleScript_ThrashConfuses"));
              effect++;
            }
          }
        }
        bs.turnEffectsTracker++;
        break;
      case BEnd.DISABLE: {
        const d = gDisableStructs[b];
        if (d.disableTimer !== 0) {
          let i = 0;
          for (; i < MAX_MON_MOVES; i++) if (d.disabledMove === m.moves[i]) break;
          if (i === MAX_MON_MOVES) {
            d.disabledMove = C.MOVE_NONE;
            d.disableTimer = 0;
          } else if (--d.disableTimer === 0) {
            d.disabledMove = C.MOVE_NONE;
            BattleScriptExecute(BS("BattleScript_DisabledNoMore"));
            effect++;
          }
        }
        bs.turnEffectsTracker++;
        break;
      }
      case BEnd.ENCORE: {
        const d = gDisableStructs[b];
        if (d.encoreTimer !== 0) {
          if (m.moves[d.encoredMovePos] !== d.encoredMove) {
            d.encoredMove = C.MOVE_NONE;
            d.encoreTimer = 0;
          } else if (--d.encoreTimer === 0 || m.pp[d.encoredMovePos] === 0) {
            d.encoredMove = C.MOVE_NONE;
            d.encoreTimer = 0;
            BattleScriptExecute(BS("BattleScript_EncoredNoMore"));
            effect++;
          }
        }
        bs.turnEffectsTracker++;
        break;
      }
      case BEnd.LOCK_ON:
        if (gStatuses3[b] & C.STATUS3_ALWAYS_HITS) gStatuses3[b] -= STATUS3_ALWAYS_HITS_TURN(1);
        bs.turnEffectsTracker++;
        break;
      case BEnd.CHARGE:
        if (gDisableStructs[b].chargeTimer && --gDisableStructs[b].chargeTimer === 0) gStatuses3[b] &= ~C.STATUS3_CHARGED_UP;
        bs.turnEffectsTracker++;
        break;
      case BEnd.TAUNT:
        if (gDisableStructs[b].tauntTimer) gDisableStructs[b].tauntTimer--;
        bs.turnEffectsTracker++;
        break;
      case BEnd.YAWN:
        if (gStatuses3[b] & C.STATUS3_YAWN) {
          gStatuses3[b] -= STATUS3_YAWN_TURN(1);
          if (!(gStatuses3[b] & C.STATUS3_YAWN) && !(m.status1 & C.STATUS1_ANY) && m.ability !== C.ABILITY_VITAL_SPIRIT
            && m.ability !== C.ABILITY_INSOMNIA && !UproarWakeUpCheck(b)) {
            CancelMultiTurnMoves(b);
            m.status1 |= STATUS1_SLEEP_TURN((random() & 3) + 2);
            emitStatus1(b);
            G.gEffectBattler = b;
            BattleScriptExecute(BS("BattleScript_YawnMakesAsleep"));
            effect++;
          }
        }
        bs.turnEffectsTracker++;
        break;
      case BEnd.BATTLER_COUNT:
        bs.turnEffectsTracker = 0;
        bs.turnEffectsBattlerId++;
        break;
    }
    if (effect !== 0) return effect;
  }
  G.gHitMarker &= ~(C.HITMARKER_GRUDGE | C.HITMARKER_SKIP_DMG_TRACK);
  return 0;
}

export function HandleWishPerishSongOnTurnEnd(): boolean {
  const bs = gBattleStruct;
  G.gHitMarker |= C.HITMARKER_GRUDGE | C.HITMARKER_SKIP_DMG_TRACK;
  switch (bs.wishPerishSongState) {
    case 0:
      while (bs.wishPerishSongBattlerId < G.gBattlersCount) {
        const b = (G.gActiveBattler = bs.wishPerishSongBattlerId);
        if (G.gAbsentBattlerFlags & gBitTable[b]) {
          bs.wishPerishSongBattlerId++;
          continue;
        }
        bs.wishPerishSongBattlerId++;
        const w = gWishFutureKnock;
        if (w.futureSightCounter[b] !== 0 && --w.futureSightCounter[b] === 0 && gBattleMons[b].hp !== 0) {
          gBattleCommunication[C.MULTISTRING_CHOOSER] = w.futureSightMove[b] === C.MOVE_FUTURE_SIGHT ? C.B_MSG_FUTURE_SIGHT : C.B_MSG_DOOM_DESIRE;
          PREPARE_MOVE_BUFFER(gBattleTextBuff1, w.futureSightMove[b]);
          G.gBattlerTarget = b;
          G.gBattlerAttacker = w.futureSightAttacker[b];
          G.gBattleMoveDamage = w.futureSightDmg[b];
          gSpecialStatuses[G.gBattlerTarget].dmg = 0xffff;
          BattleScriptExecute(BS("BattleScript_MonTookFutureAttack"));
          return true;
        }
      }
      bs.wishPerishSongState = 1;
      bs.wishPerishSongBattlerId = 0;
    // fall through
    case 1:
      while (bs.wishPerishSongBattlerId < G.gBattlersCount) {
        const b = (G.gActiveBattler = G.gBattlerAttacker = gBattlerByTurnOrder[bs.wishPerishSongBattlerId]);
        if (G.gAbsentBattlerFlags & gBitTable[b]) {
          bs.wishPerishSongBattlerId++;
          continue;
        }
        bs.wishPerishSongBattlerId++;
        if (gStatuses3[b] & C.STATUS3_PERISH_SONG) {
          PREPARE_BYTE_NUMBER_BUFFER(gBattleTextBuff1, 1, gDisableStructs[b].perishSongTimer);
          if (gDisableStructs[b].perishSongTimer === 0) {
            gStatuses3[b] &= ~C.STATUS3_PERISH_SONG;
            G.gBattleMoveDamage = gBattleMons[b].hp;
            G.gBattlescriptCurrInstr = BS("BattleScript_PerishSongTakesLife");
          } else {
            gDisableStructs[b].perishSongTimer--;
            G.gBattlescriptCurrInstr = BS("BattleScript_PerishSongCountGoesDown");
          }
          BattleScriptExecute(G.gBattlescriptCurrInstr);
          return true;
        }
      }
      break;
  }
  G.gHitMarker &= ~(C.HITMARKER_GRUDGE | C.HITMARKER_SKIP_DMG_TRACK);
  return false;
}

const FAINTED_ACTIONS_MAX_CASE = 7;

export function HandleFaintedMonActions(): boolean {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI) return false;
  const bs = gBattleStruct;
  do {
    switch (bs.faintedActionsState) {
      case 0:
        bs.faintedActionsBattlerId = 0;
        bs.faintedActionsState++;
        for (let i = 0; i < G.gBattlersCount; i++) {
          if (G.gAbsentBattlerFlags & gBitTable[i] && !HasNoMonsToSwitch(i, PARTY_SIZE, PARTY_SIZE)) G.gAbsentBattlerFlags &= ~gBitTable[i];
        }
      // fall through
      case 1:
        if (bs.faintedActionsState === 1) {
          do {
            const id = bs.faintedActionsBattlerId;
            G.gBattlerFainted = G.gBattlerTarget = id;
            if (gBattleMons[id].hp === 0 && !(bs.givenExpMons & gBitTable[gBattlerPartyIndexes[id]]) && !(G.gAbsentBattlerFlags & gBitTable[id])) {
              BattleScriptExecute(BS("BattleScript_GiveExp"));
              bs.faintedActionsState = 2;
              return true;
            }
          } while (++bs.faintedActionsBattlerId !== G.gBattlersCount);
          bs.faintedActionsState = 3;
        }
        break;
      case 2:
        OpponentSwitchInResetSentPokesToOpponentValue(G.gBattlerFainted);
        if (++bs.faintedActionsBattlerId === G.gBattlersCount) bs.faintedActionsState = 3;
        else bs.faintedActionsState = 1;
        break;
      case 3:
        bs.faintedActionsBattlerId = 0;
        bs.faintedActionsState++;
      // fall through
      case 4:
        if (bs.faintedActionsState === 4) {
          do {
            const id = bs.faintedActionsBattlerId;
            G.gBattlerFainted = G.gBattlerTarget = id;
            if (gBattleMons[id].hp === 0 && !(G.gAbsentBattlerFlags & gBitTable[id])) {
              BattleScriptExecute(BS("BattleScript_HandleFaintedMon"));
              bs.faintedActionsState = 5;
              return true;
            }
          } while (++bs.faintedActionsBattlerId !== G.gBattlersCount);
          bs.faintedActionsState = 6;
        }
        break;
      case 5:
        if (++bs.faintedActionsBattlerId === G.gBattlersCount) bs.faintedActionsState = 6;
        else bs.faintedActionsState = 4;
        break;
      case 6:
        if (AbilityBattleEffects(C.ABILITYEFFECT_INTIMIDATE1, 0, 0, 0, 0) || AbilityBattleEffects(C.ABILITYEFFECT_TRACE, 0, 0, 0, 0)
          || ItemBattleEffects(C.ITEMEFFECT_NORMAL, 0, true) || AbilityBattleEffects(C.ABILITYEFFECT_FORECAST, 0, 0, 0, 0)) return true;
        bs.faintedActionsState++;
        break;
      case FAINTED_ACTIONS_MAX_CASE:
        break;
    }
  } while (bs.faintedActionsState !== FAINTED_ACTIONS_MAX_CASE);
  return false;
}

export function TryClearRageStatuses(): void {
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (gBattleMons[i].status2 & C.STATUS2_RAGE && gChosenMoveByBattler[i] !== C.MOVE_RAGE) gBattleMons[i].status2 &= ~C.STATUS2_RAGE;
  }
}

const enum Cancel {
  FLAGS, ASLEEP, FROZEN, TRUANT, RECHARGE, FLINCH, DISABLED, TAUNTED, IMPRISONED, CONFUSED, PARALYSED, GHOST, IN_LOVE, BIDE, THAW, END,
}

export function AtkCanceller_UnableToUseMove(): number {
  let effect = 0;
  const bs = gBattleStruct;
  const a = G.gBattlerAttacker;
  const m = gBattleMons[a];
  do {
    switch (bs.atkCancellerTracker) {
      case Cancel.FLAGS:
        m.status2 &= ~C.STATUS2_DESTINY_BOND;
        gStatuses3[a] &= ~C.STATUS3_GRUDGE;
        bs.atkCancellerTracker++;
        break;
      case Cancel.ASLEEP:
        if (m.status1 & C.STATUS1_SLEEP) {
          if (UproarWakeUpCheck(a)) {
            m.status1 &= ~C.STATUS1_SLEEP;
            m.status2 &= ~C.STATUS2_NIGHTMARE;
            BattleScriptPushCursor();
            gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_WOKE_UP_UPROAR;
            G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedWokeUp");
            effect = 2;
          } else {
            const toSub = m.ability === C.ABILITY_EARLY_BIRD ? 2 : 1;
            if ((m.status1 & C.STATUS1_SLEEP) < toSub) m.status1 &= ~C.STATUS1_SLEEP;
            else m.status1 -= toSub;
            if (m.status1 & C.STATUS1_SLEEP) {
              if (G.gCurrentMove !== C.MOVE_SNORE && G.gCurrentMove !== C.MOVE_SLEEP_TALK) {
                G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedIsAsleep");
                G.gHitMarker |= C.HITMARKER_UNABLE_TO_USE_MOVE;
                effect = 2;
              }
            } else {
              m.status2 &= ~C.STATUS2_NIGHTMARE;
              BattleScriptPushCursor();
              gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_WOKE_UP;
              G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedWokeUp");
              effect = 2;
            }
          }
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.FROZEN:
        if (m.status1 & C.STATUS1_FREEZE) {
          if (random() % 5) {
            if (gBattleMoves(G.gCurrentMove).effect !== C.EFFECT_THAW_HIT) {
              G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedIsFrozen");
              G.gHitMarker |= C.HITMARKER_NO_ATTACKSTRING;
            } else {
              bs.atkCancellerTracker++;
              break;
            }
          } else {
            m.status1 &= ~C.STATUS1_FREEZE;
            BattleScriptPushCursor();
            G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedUnfroze");
            gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_DEFROSTED;
          }
          effect = 2;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.TRUANT:
        if (m.ability === C.ABILITY_TRUANT && gDisableStructs[a].truantCounter) {
          CancelMultiTurnMoves(a);
          G.gHitMarker |= C.HITMARKER_UNABLE_TO_USE_MOVE;
          gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_LOAFING;
          G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedLoafingAround");
          G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
          effect = 1;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.RECHARGE:
        if (m.status2 & C.STATUS2_RECHARGE) {
          m.status2 &= ~C.STATUS2_RECHARGE;
          gDisableStructs[a].rechargeTimer = 0;
          CancelMultiTurnMoves(a);
          G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedMustRecharge");
          G.gHitMarker |= C.HITMARKER_UNABLE_TO_USE_MOVE;
          effect = 1;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.FLINCH:
        if (m.status2 & C.STATUS2_FLINCHED) {
          m.status2 &= ~C.STATUS2_FLINCHED;
          gProtectStructs[a].flinchImmobility = 1;
          CancelMultiTurnMoves(a);
          G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedFlinched");
          G.gHitMarker |= C.HITMARKER_UNABLE_TO_USE_MOVE;
          effect = 1;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.DISABLED:
        if (gDisableStructs[a].disabledMove === G.gCurrentMove && gDisableStructs[a].disabledMove !== C.MOVE_NONE) {
          gProtectStructs[a].usedDisabledMove = 1;
          gBattleScripting.battler = a;
          CancelMultiTurnMoves(a);
          G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedIsDisabled");
          G.gHitMarker |= C.HITMARKER_UNABLE_TO_USE_MOVE;
          effect = 1;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.TAUNTED:
        if (gDisableStructs[a].tauntTimer && gBattleMoves(G.gCurrentMove).power === 0) {
          gProtectStructs[a].usedTauntedMove = 1;
          CancelMultiTurnMoves(a);
          G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedIsTaunted");
          G.gHitMarker |= C.HITMARKER_UNABLE_TO_USE_MOVE;
          effect = 1;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.IMPRISONED:
        if (GetImprisonedMovesCount(a, G.gCurrentMove)) {
          gProtectStructs[a].usedImprisonedMove = 1;
          CancelMultiTurnMoves(a);
          G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedIsImprisoned");
          G.gHitMarker |= C.HITMARKER_UNABLE_TO_USE_MOVE;
          effect = 1;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.CONFUSED:
        if (m.status2 & C.STATUS2_CONFUSION) {
          m.status2 -= STATUS2_CONFUSION_TURN(1);
          if (m.status2 & C.STATUS2_CONFUSION) {
            if (random() & 1) {
              gBattleCommunication[C.MULTISTRING_CHOOSER] = 0;
              BattleScriptPushCursor();
            } else {
              gBattleCommunication[C.MULTISTRING_CHOOSER] = 1;
              G.gBattlerTarget = a;
              G.gBattleMoveDamage = CalculateBaseDamage(m, m, C.MOVE_POUND, 0, 40, 0, a, a);
              gProtectStructs[a].confusionSelfDmg = 1;
              G.gHitMarker |= C.HITMARKER_UNABLE_TO_USE_MOVE;
            }
            G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedIsConfused");
          } else {
            BattleScriptPushCursor();
            G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedIsConfusedNoMore");
          }
          effect = 1;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.PARALYSED:
        if (m.status1 & C.STATUS1_PARALYSIS && random() % 4 === 0) {
          gProtectStructs[a].prlzImmobility = 1;
          G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedIsParalyzed");
          G.gHitMarker |= C.HITMARKER_UNABLE_TO_USE_MOVE;
          effect = 1;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.GHOST:
        if (IS_BATTLE_TYPE_GHOST_WITHOUT_SCOPE(G.gBattleTypeFlags)) {
          G.gBattlescriptCurrInstr = GetBattlerSide(a) === C.B_SIDE_PLAYER ? BS("BattleScript_TooScaredToMove") : BS("BattleScript_GhostGetOutGetOut");
          gBattleCommunication[C.MULTISTRING_CHOOSER] = 0;
          effect = 1;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.IN_LOVE:
        if (m.status2 & C.STATUS2_INFATUATION) {
          gBattleScripting.battler = CountTrailingZeroBits((m.status2 & C.STATUS2_INFATUATION) >>> 0x10);
          if (random() & 1) {
            BattleScriptPushCursor();
          } else {
            BattleScriptPush(BS("BattleScript_MoveUsedIsInLoveCantAttack"));
            G.gHitMarker |= C.HITMARKER_UNABLE_TO_USE_MOVE;
            gProtectStructs[a].loveImmobility = 1;
            CancelMultiTurnMoves(a);
          }
          G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedIsInLove");
          effect = 1;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.BIDE:
        if (m.status2 & C.STATUS2_BIDE) {
          m.status2 -= STATUS2_BIDE_TURN(1);
          if (m.status2 & C.STATUS2_BIDE) {
            G.gBattlescriptCurrInstr = BS("BattleScript_BideStoringEnergy");
          } else if (gTakenDmg[a]) {
            G.gCurrentMove = C.MOVE_BIDE;
            gBattleScripting.bideDmg = gTakenDmg[a] * 2;
            G.gBattlerTarget = gTakenDmgByBattler[a];
            if (G.gAbsentBattlerFlags & gBitTable[G.gBattlerTarget]) G.gBattlerTarget = GetMoveTarget(C.MOVE_BIDE, C.MOVE_TARGET_SELECTED + 1);
            G.gBattlescriptCurrInstr = BS("BattleScript_BideAttack");
          } else {
            G.gBattlescriptCurrInstr = BS("BattleScript_BideNoEnergyToAttack");
          }
          effect = 1;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.THAW:
        if (m.status1 & C.STATUS1_FREEZE) {
          if (gBattleMoves(G.gCurrentMove).effect === C.EFFECT_THAW_HIT) {
            m.status1 &= ~C.STATUS1_FREEZE;
            BattleScriptPushCursor();
            G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedUnfroze");
            gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_DEFROSTED_BY_MOVE;
          }
          effect = 2;
        }
        bs.atkCancellerTracker++;
        break;
      case Cancel.END:
        break;
    }
  } while (bs.atkCancellerTracker !== Cancel.END && effect === 0);
  if (effect === 2) {
    G.gActiveBattler = a;
    emitStatus1(a);
  }
  return effect;
}

export function HasNoMonsToSwitch(battler: number, partyIdBattlerOn1: number, partyIdBattlerOn2: number): boolean {
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE)) return false;
  let flankId: number;
  let playerId: number;
  let party: (i: number) => Mon;
  if (GetBattlerSide(battler) === C.B_SIDE_OPPONENT) {
    flankId = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
    playerId = GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT);
    party = (i) => gEnemyParty[i];
  } else {
    flankId = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
    playerId = GetBattlerAtPosition(C.B_POSITION_PLAYER_RIGHT);
    party = playerMon;
  }
  if (partyIdBattlerOn1 === PARTY_SIZE) partyIdBattlerOn1 = gBattlerPartyIndexes[flankId];
  if (partyIdBattlerOn2 === PARTY_SIZE) partyIdBattlerOn2 = gBattlerPartyIndexes[playerId];
  let i = 0;
  for (; i < PARTY_SIZE; i++) {
    const mon = party(i);
    const s = GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG);
    if (GetMonData(mon, C.MON_DATA_HP) !== 0 && s !== C.SPECIES_NONE && s !== C.SPECIES_EGG && i !== partyIdBattlerOn1 && i !== partyIdBattlerOn2
      && i !== gBattleStruct.monToSwitchIntoId[flankId] && i !== gBattleStruct.monToSwitchIntoId[playerId]) break;
  }
  return i === PARTY_SIZE;
}

export function CastformDataTypeChange(battler: number): number {
  let formChange = 0;
  const m = gBattleMons[battler];
  if (m.species !== C.SPECIES_CASTFORM || m.ability !== C.ABILITY_FORECAST || m.hp === 0) return 0;
  if (!WEATHER_HAS_EFFECT() && !IS_BATTLER_OF_TYPE(battler, C.TYPE_NORMAL)) {
    SET_BATTLER_TYPE(battler, C.TYPE_NORMAL);
    return 1;
  }
  if (!WEATHER_HAS_EFFECT()) return 0;
  if (!(G.gBattleWeather & (C.B_WEATHER_RAIN | C.B_WEATHER_SUN | C.B_WEATHER_HAIL)) && !IS_BATTLER_OF_TYPE(battler, C.TYPE_NORMAL)) {
    SET_BATTLER_TYPE(battler, C.TYPE_NORMAL);
    formChange = 1;
  }
  if (G.gBattleWeather & C.B_WEATHER_SUN && !IS_BATTLER_OF_TYPE(battler, C.TYPE_FIRE)) {
    SET_BATTLER_TYPE(battler, C.TYPE_FIRE);
    formChange = 2;
  }
  if (G.gBattleWeather & C.B_WEATHER_RAIN && !IS_BATTLER_OF_TYPE(battler, C.TYPE_WATER)) {
    SET_BATTLER_TYPE(battler, C.TYPE_WATER);
    formChange = 3;
  }
  if (G.gBattleWeather & C.B_WEATHER_HAIL && !IS_BATTLER_OF_TYPE(battler, C.TYPE_ICE)) {
    SET_BATTLER_TYPE(battler, C.TYPE_ICE);
    formChange = 4;
  }
  return formChange;
}

const SOUND_MOVES = [
  C.MOVE_GROWL, C.MOVE_ROAR, C.MOVE_SING, C.MOVE_SUPERSONIC, C.MOVE_SCREECH, C.MOVE_SNORE, C.MOVE_UPROAR, C.MOVE_METAL_SOUND,
  C.MOVE_GRASS_WHISTLE, C.MOVE_HYPER_VOICE,
];

function statusStr(name: string): number[] {
  return cdata<number[]>("battle_main", `gStatusConditionString_${name}Jpn`);
}

function StringCopyBuff(dst: Uint8Array, src: number[]): void {
  let i = 0;
  for (; i < src.length && src[i] !== 0xff; i++) dst[i] = src[i];
  dst[i] = 0xff;
}

const TARGET_TURN_DAMAGED = () => gSpecialStatuses[G.gBattlerTarget].physicalDmg !== 0 || gSpecialStatuses[G.gBattlerTarget].specialDmg !== 0;

function contactStatusAbility(move: number, chanceMod: number, moveEffect: number): number {
  const a = G.gBattlerAttacker;
  if (!(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) && gBattleMons[a].hp !== 0 && !gProtectStructs[a].confusionSelfDmg && TARGET_TURN_DAMAGED()
    && gBattleMoves(move).flags & C.FLAG_MAKES_CONTACT && random() % chanceMod === 0) {
    gBattleCommunication[C.MOVE_EFFECT_BYTE] = C.MOVE_EFFECT_AFFECTS_USER | moveEffect;
    BattleScriptPushCursor();
    G.gBattlescriptCurrInstr = BS("BattleScript_ApplySecondaryEffect");
    G.gHitMarker |= C.HITMARKER_STATUS_ABILITY_EFFECT;
    return 1;
  }
  return 0;
}

export function AbilityBattleEffects(caseID: number, battler: number, ability: number, special: number, moveArg: number): number {
  let effect = 0;
  if (G.gBattlerAttacker >= G.gBattlersCount) G.gBattlerAttacker = battler;
  const pokeAtk = partyFor(G.gBattlerAttacker)(gBattlerPartyIndexes[G.gBattlerAttacker]);
  if (G.gBattlerTarget >= G.gBattlersCount) G.gBattlerTarget = battler;
  const pokeDef = partyFor(G.gBattlerTarget)(gBattlerPartyIndexes[G.gBattlerTarget]);
  const speciesAtk = GetMonData(pokeAtk, C.MON_DATA_SPECIES);
  const pidAtk = GetMonData(pokeAtk, C.MON_DATA_PERSONALITY);
  const speciesDef = GetMonData(pokeDef, C.MON_DATA_SPECIES);
  const pidDef = GetMonData(pokeDef, C.MON_DATA_PERSONALITY);

  if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI) return effect;
  G.gLastUsedAbility = special ? special : gBattleMons[battler].ability;
  const move = moveArg ? moveArg : G.gCurrentMove;
  const moveType = GET_MOVE_TYPE(move);
  if (IS_BATTLE_TYPE_GHOST_WITHOUT_SCOPE(G.gBattleTypeFlags) && (G.gLastUsedAbility === C.ABILITY_INTIMIDATE || G.gLastUsedAbility === C.ABILITY_TRACE)) return effect;

  let side: number;
  switch (caseID) {
    case C.ABILITYEFFECT_ON_SWITCHIN:
      if (G.gBattlerAttacker >= G.gBattlersCount) G.gBattlerAttacker = battler;
      switch (G.gLastUsedAbility) {
        case C.ABILITYEFFECT_SWITCH_IN_WEATHER:
          switch (GetCurrentWeather()) {
            case C.WEATHER_RAIN: case C.WEATHER_RAIN_THUNDERSTORM: case C.WEATHER_DOWNPOUR:
              if (!(G.gBattleWeather & C.B_WEATHER_RAIN)) {
                G.gBattleWeather = C.B_WEATHER_RAIN_TEMPORARY | C.B_WEATHER_RAIN_PERMANENT;
                gBattleScripting.animArg1 = C.B_ANIM_RAIN_CONTINUES;
                gBattleScripting.battler = battler;
                effect++;
              }
              break;
            case C.WEATHER_SANDSTORM:
              if (!(G.gBattleWeather & C.B_WEATHER_SANDSTORM)) {
                G.gBattleWeather = C.B_WEATHER_SANDSTORM;
                gBattleScripting.animArg1 = C.B_ANIM_SANDSTORM_CONTINUES;
                gBattleScripting.battler = battler;
                effect++;
              }
              break;
            case C.WEATHER_DROUGHT:
              if (!(G.gBattleWeather & C.B_WEATHER_SUN)) {
                G.gBattleWeather = C.B_WEATHER_SUN;
                gBattleScripting.animArg1 = C.B_ANIM_SUN_CONTINUES;
                gBattleScripting.battler = battler;
                effect++;
              }
              break;
          }
          if (effect !== 0) {
            gBattleCommunication[C.MULTISTRING_CHOOSER] = GetCurrentWeather();
            BattleScriptPushCursorAndCallback(BS("BattleScript_OverworldWeatherStarts"));
          }
          break;
        case C.ABILITY_DRIZZLE:
          if (!(G.gBattleWeather & C.B_WEATHER_RAIN_PERMANENT)) {
            G.gBattleWeather = C.B_WEATHER_RAIN_PERMANENT | C.B_WEATHER_RAIN_TEMPORARY;
            BattleScriptPushCursorAndCallback(BS("BattleScript_DrizzleActivates"));
            gBattleScripting.battler = battler;
            effect++;
          }
          break;
        case C.ABILITY_SAND_STREAM:
          if (!(G.gBattleWeather & C.B_WEATHER_SANDSTORM_PERMANENT)) {
            G.gBattleWeather = C.B_WEATHER_SANDSTORM;
            BattleScriptPushCursorAndCallback(BS("BattleScript_SandstreamActivates"));
            gBattleScripting.battler = battler;
            effect++;
          }
          break;
        case C.ABILITY_DROUGHT:
          if (!(G.gBattleWeather & C.B_WEATHER_SUN_PERMANENT)) {
            G.gBattleWeather = C.B_WEATHER_SUN;
            BattleScriptPushCursorAndCallback(BS("BattleScript_DroughtActivates"));
            gBattleScripting.battler = battler;
            effect++;
          }
          break;
        case C.ABILITY_INTIMIDATE:
          if (!gSpecialStatuses[battler].intimidatedMon) {
            gStatuses3[battler] |= C.STATUS3_INTIMIDATE_POKES;
            gSpecialStatuses[battler].intimidatedMon = 1;
          }
          break;
        case C.ABILITY_FORECAST:
          effect = CastformDataTypeChange(battler);
          if (effect !== 0) {
            BattleScriptPushCursorAndCallback(BS("BattleScript_CastformChange"));
            gBattleScripting.battler = battler;
            gBattleStruct.formToChangeInto = effect - 1;
          }
          break;
        case C.ABILITY_TRACE:
          if (!gSpecialStatuses[battler].traced) {
            gStatuses3[battler] |= C.STATUS3_TRACE;
            gSpecialStatuses[battler].traced = 1;
          }
          break;
        case C.ABILITY_CLOUD_NINE:
        case C.ABILITY_AIR_LOCK:
          for (let t = 0; t < G.gBattlersCount; t++) {
            effect = CastformDataTypeChange(t);
            if (effect !== 0) {
              BattleScriptPushCursorAndCallback(BS("BattleScript_CastformChange"));
              gBattleScripting.battler = t;
              gBattleStruct.formToChangeInto = effect - 1;
              break;
            }
          }
          break;
      }
      break;
    case C.ABILITYEFFECT_ENDTURN:
      if (gBattleMons[battler].hp !== 0) {
        const m = gBattleMons[battler];
        G.gBattlerAttacker = battler;
        switch (G.gLastUsedAbility) {
          case C.ABILITY_RAIN_DISH:
            if (WEATHER_HAS_EFFECT() && G.gBattleWeather & C.B_WEATHER_RAIN && m.maxHP > m.hp) {
              G.gLastUsedAbility = C.ABILITY_RAIN_DISH;
              BattleScriptPushCursorAndCallback(BS("BattleScript_RainDishActivates"));
              G.gBattleMoveDamage = div(m.maxHP, 16);
              if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
              G.gBattleMoveDamage *= -1;
              effect++;
            }
            break;
          case C.ABILITY_SHED_SKIN:
            if (m.status1 & C.STATUS1_ANY && random() % 3 === 0) {
              if (m.status1 & (C.STATUS1_POISON | C.STATUS1_TOXIC_POISON)) StringCopyBuff(gBattleTextBuff1, statusStr("Poison"));
              if (m.status1 & C.STATUS1_SLEEP) StringCopyBuff(gBattleTextBuff1, statusStr("Sleep"));
              if (m.status1 & C.STATUS1_PARALYSIS) StringCopyBuff(gBattleTextBuff1, statusStr("Paralysis"));
              if (m.status1 & C.STATUS1_BURN) StringCopyBuff(gBattleTextBuff1, statusStr("Burn"));
              if (m.status1 & C.STATUS1_FREEZE) StringCopyBuff(gBattleTextBuff1, statusStr("Ice"));
              m.status1 = 0;
              m.status2 &= ~C.STATUS2_NIGHTMARE;
              gBattleScripting.battler = G.gActiveBattler = battler;
              BattleScriptPushCursorAndCallback(BS("BattleScript_ShedSkinActivates"));
              emitStatus1(battler);
              effect++;
            }
            break;
          case C.ABILITY_SPEED_BOOST:
            if (m.statStages[C.STAT_SPEED] < C.MAX_STAT_STAGE && gDisableStructs[battler].isFirstTurn !== 2) {
              m.statStages[C.STAT_SPEED]++;
              gBattleScripting.animArg1 = 14 + C.STAT_SPEED;
              gBattleScripting.animArg2 = 0;
              BattleScriptPushCursorAndCallback(BS("BattleScript_SpeedBoostActivates"));
              gBattleScripting.battler = battler;
              effect++;
            }
            break;
          case C.ABILITY_TRUANT:
            gDisableStructs[G.gBattlerAttacker].truantCounter ^= 1;
            break;
        }
      }
      break;
    case C.ABILITYEFFECT_MOVES_BLOCK:
      if (G.gLastUsedAbility === C.ABILITY_SOUNDPROOF && SOUND_MOVES.includes(move)) {
        if (gBattleMons[G.gBattlerAttacker].status2 & C.STATUS2_MULTIPLETURNS) G.gHitMarker |= C.HITMARKER_NO_PPDEDUCT;
        G.gBattlescriptCurrInstr = BS("BattleScript_SoundproofProtected");
        effect = 1;
      }
      break;
    case C.ABILITYEFFECT_ABSORBING:
      if (move) {
        const nfs = gProtectStructs[G.gBattlerAttacker].notFirstStrike;
        switch (G.gLastUsedAbility) {
          case C.ABILITY_VOLT_ABSORB:
          case C.ABILITY_WATER_ABSORB: {
            const t = G.gLastUsedAbility === C.ABILITY_VOLT_ABSORB ? C.TYPE_ELECTRIC : C.TYPE_WATER;
            if (moveType === t && gBattleMoves(move).power !== 0) {
              G.gBattlescriptCurrInstr = nfs ? BS("BattleScript_MoveHPDrain") : BS("BattleScript_MoveHPDrain_PPLoss");
              effect = 1;
            }
            break;
          }
          case C.ABILITY_FLASH_FIRE:
            if (moveType === C.TYPE_FIRE && !(gBattleMons[battler].status1 & C.STATUS1_FREEZE)) {
              const flags = gBattleResources.flags.flags;
              if (!(flags[battler] & C.RESOURCE_FLAG_FLASH_FIRE)) {
                gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_FLASH_FIRE_BOOST;
                flags[battler] |= C.RESOURCE_FLAG_FLASH_FIRE;
              } else {
                gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_FLASH_FIRE_NO_BOOST;
              }
              G.gBattlescriptCurrInstr = nfs ? BS("BattleScript_FlashFireBoost") : BS("BattleScript_FlashFireBoost_PPLoss");
              effect = 2;
            }
            break;
        }
        if (effect === 1) {
          if (gBattleMons[battler].maxHP === gBattleMons[battler].hp) {
            G.gBattlescriptCurrInstr = nfs ? BS("BattleScript_MonMadeMoveUseless") : BS("BattleScript_MonMadeMoveUseless_PPLoss");
          } else {
            G.gBattleMoveDamage = div(gBattleMons[battler].maxHP, 4);
            if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
            G.gBattleMoveDamage *= -1;
          }
        }
      }
      break;
    case C.ABILITYEFFECT_ON_DAMAGE: {
      const a = G.gBattlerAttacker;
      switch (G.gLastUsedAbility) {
        case C.ABILITY_COLOR_CHANGE:
          if (!(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) && move !== C.MOVE_STRUGGLE && gBattleMoves(move).power !== 0 && TARGET_TURN_DAMAGED()
            && !IS_BATTLER_OF_TYPE(battler, moveType) && gBattleMons[battler].hp !== 0) {
            SET_BATTLER_TYPE(battler, moveType);
            PREPARE_TYPE_BUFFER(gBattleTextBuff1, moveType);
            BattleScriptPushCursor();
            G.gBattlescriptCurrInstr = BS("BattleScript_ColorChangeActivates");
            effect++;
          }
          break;
        case C.ABILITY_ROUGH_SKIN:
          if (!(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) && gBattleMons[a].hp !== 0 && !gProtectStructs[a].confusionSelfDmg && TARGET_TURN_DAMAGED()
            && gBattleMoves(move).flags & C.FLAG_MAKES_CONTACT) {
            G.gBattleMoveDamage = div(gBattleMons[a].maxHP, 16);
            if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
            BattleScriptPushCursor();
            G.gBattlescriptCurrInstr = BS("BattleScript_RoughSkinActivates");
            effect++;
          }
          break;
        case C.ABILITY_EFFECT_SPORE:
          if (!(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) && gBattleMons[a].hp !== 0 && !gProtectStructs[a].confusionSelfDmg && TARGET_TURN_DAMAGED()
            && gBattleMoves(move).flags & C.FLAG_MAKES_CONTACT && random() % 10 === 0) {
            do gBattleCommunication[C.MOVE_EFFECT_BYTE] = random() & 3;
            while (gBattleCommunication[C.MOVE_EFFECT_BYTE] === 0);
            if (gBattleCommunication[C.MOVE_EFFECT_BYTE] === C.MOVE_EFFECT_BURN) gBattleCommunication[C.MOVE_EFFECT_BYTE] += 2;
            gBattleCommunication[C.MOVE_EFFECT_BYTE] += C.MOVE_EFFECT_AFFECTS_USER;
            BattleScriptPushCursor();
            G.gBattlescriptCurrInstr = BS("BattleScript_ApplySecondaryEffect");
            G.gHitMarker |= C.HITMARKER_STATUS_ABILITY_EFFECT;
            effect++;
          }
          break;
        case C.ABILITY_POISON_POINT:
          effect += contactStatusAbility(move, 3, C.MOVE_EFFECT_POISON);
          break;
        case C.ABILITY_STATIC:
          effect += contactStatusAbility(move, 3, C.MOVE_EFFECT_PARALYSIS);
          break;
        case C.ABILITY_FLAME_BODY:
          effect += contactStatusAbility(move, 3, C.MOVE_EFFECT_BURN);
          break;
        case C.ABILITY_CUTE_CHARM: {
          const gA = GetGenderFromSpeciesAndPersonality(speciesAtk, pidAtk);
          const gD = GetGenderFromSpeciesAndPersonality(speciesDef, pidDef);
          if (!(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) && gBattleMons[a].hp !== 0 && !gProtectStructs[a].confusionSelfDmg
            && gBattleMoves(move).flags & C.FLAG_MAKES_CONTACT && TARGET_TURN_DAMAGED() && gBattleMons[G.gBattlerTarget].hp !== 0
            && random() % 3 === 0 && gBattleMons[a].ability !== C.ABILITY_OBLIVIOUS && gA !== gD
            && !(gBattleMons[a].status2 & C.STATUS2_INFATUATION) && gA !== C.MON_GENDERLESS && gD !== C.MON_GENDERLESS) {
            gBattleMons[a].status2 |= STATUS2_INFATUATED_WITH(G.gBattlerTarget);
            BattleScriptPushCursor();
            G.gBattlescriptCurrInstr = BS("BattleScript_CuteCharmActivates");
            effect++;
          }
          break;
        }
      }
      break;
    }
    case C.ABILITYEFFECT_IMMUNITY:
      for (battler = 0; battler < G.gBattlersCount; battler++) {
        const m = gBattleMons[battler];
        switch (m.ability) {
          case C.ABILITY_IMMUNITY:
            if (m.status1 & (C.STATUS1_POISON | C.STATUS1_TOXIC_POISON | C.STATUS1_TOXIC_COUNTER)) {
              StringCopyBuff(gBattleTextBuff1, statusStr("Poison"));
              effect = 1;
            }
            break;
          case C.ABILITY_OWN_TEMPO:
            if (m.status2 & C.STATUS2_CONFUSION) {
              StringCopyBuff(gBattleTextBuff1, statusStr("Confusion"));
              effect = 2;
            }
            break;
          case C.ABILITY_LIMBER:
            if (m.status1 & C.STATUS1_PARALYSIS) {
              StringCopyBuff(gBattleTextBuff1, statusStr("Paralysis"));
              effect = 1;
            }
            break;
          case C.ABILITY_INSOMNIA:
          case C.ABILITY_VITAL_SPIRIT:
            if (m.status1 & C.STATUS1_SLEEP) {
              m.status2 &= ~C.STATUS2_NIGHTMARE;
              StringCopyBuff(gBattleTextBuff1, statusStr("Sleep"));
              effect = 1;
            }
            break;
          case C.ABILITY_WATER_VEIL:
            if (m.status1 & C.STATUS1_BURN) {
              StringCopyBuff(gBattleTextBuff1, statusStr("Burn"));
              effect = 1;
            }
            break;
          case C.ABILITY_MAGMA_ARMOR:
            if (m.status1 & C.STATUS1_FREEZE) {
              StringCopyBuff(gBattleTextBuff1, statusStr("Ice"));
              effect = 1;
            }
            break;
          case C.ABILITY_OBLIVIOUS:
            if (m.status2 & C.STATUS2_INFATUATION) {
              StringCopyBuff(gBattleTextBuff1, statusStr("Love"));
              effect = 3;
            }
            break;
        }
        if (effect !== 0) {
          if (effect === 1) m.status1 = 0;
          else if (effect === 2) m.status2 &= ~C.STATUS2_CONFUSION;
          else if (effect === 3) m.status2 &= ~C.STATUS2_INFATUATION;
          BattleScriptPushCursor();
          G.gBattlescriptCurrInstr = BS("BattleScript_AbilityCuredStatus");
          gBattleScripting.battler = battler;
          G.gActiveBattler = battler;
          emitStatus1(battler);
          return effect;
        }
      }
      break;
    case C.ABILITYEFFECT_FORECAST:
      for (battler = 0; battler < G.gBattlersCount; battler++) {
        if (gBattleMons[battler].ability === C.ABILITY_FORECAST) {
          effect = CastformDataTypeChange(battler);
          if (effect !== 0) {
            BattleScriptPushCursorAndCallback(BS("BattleScript_CastformChange"));
            gBattleScripting.battler = battler;
            gBattleStruct.formToChangeInto = effect - 1;
            return effect;
          }
        }
      }
      break;
    case C.ABILITYEFFECT_SYNCHRONIZE:
    case C.ABILITYEFFECT_ATK_SYNCHRONIZE:
      if (G.gLastUsedAbility === C.ABILITY_SYNCHRONIZE && G.gHitMarker & C.HITMARKER_SYNCHRONISE_EFFECT) {
        G.gHitMarker &= ~C.HITMARKER_SYNCHRONISE_EFFECT;
        gBattleStruct.synchronizeMoveEffect &= ~(C.MOVE_EFFECT_AFFECTS_USER | C.MOVE_EFFECT_CERTAIN);
        if (gBattleStruct.synchronizeMoveEffect === C.MOVE_EFFECT_TOXIC) gBattleStruct.synchronizeMoveEffect = C.MOVE_EFFECT_POISON;
        if (caseID === C.ABILITYEFFECT_SYNCHRONIZE) {
          gBattleCommunication[C.MOVE_EFFECT_BYTE] = gBattleStruct.synchronizeMoveEffect + C.MOVE_EFFECT_AFFECTS_USER;
          gBattleScripting.battler = G.gBattlerTarget;
        } else {
          gBattleCommunication[C.MOVE_EFFECT_BYTE] = gBattleStruct.synchronizeMoveEffect;
          gBattleScripting.battler = G.gBattlerAttacker;
        }
        BattleScriptPushCursor();
        G.gBattlescriptCurrInstr = BS("BattleScript_SynchronizeActivates");
        G.gHitMarker |= C.HITMARKER_STATUS_ABILITY_EFFECT;
        effect++;
      }
      break;
    case C.ABILITYEFFECT_INTIMIDATE1:
    case C.ABILITYEFFECT_INTIMIDATE2:
      for (let i = 0; i < G.gBattlersCount; i++) {
        if (gBattleMons[i].ability === C.ABILITY_INTIMIDATE && gStatuses3[i] & C.STATUS3_INTIMIDATE_POKES) {
          G.gLastUsedAbility = C.ABILITY_INTIMIDATE;
          gStatuses3[i] &= ~C.STATUS3_INTIMIDATE_POKES;
          if (caseID === C.ABILITYEFFECT_INTIMIDATE1) {
            BattleScriptPushCursorAndCallback(BS("BattleScript_IntimidateActivatesEnd3"));
          } else {
            BattleScriptPushCursor();
            G.gBattlescriptCurrInstr = BS("BattleScript_IntimidateActivates");
          }
          gBattleStruct.intimidateBattler = i;
          effect++;
          break;
        }
      }
      break;
    case C.ABILITYEFFECT_TRACE:
      for (let i = 0; i < G.gBattlersCount; i++) {
        if (gBattleMons[i].ability === C.ABILITY_TRACE && gStatuses3[i] & C.STATUS3_TRACE) {
          side = (GetBattlerPosition(i) ^ C.BIT_SIDE) & C.BIT_SIDE;
          const target1 = GetBattlerAtPosition(side);
          const target2 = GetBattlerAtPosition(side + C.BIT_FLANK);
          const ok = (t: number) => gBattleMons[t].ability !== C.ABILITY_NONE && gBattleMons[t].hp !== 0;
          const take = (t: number) => {
            G.gActiveBattler = t;
            gBattleMons[i].ability = gBattleMons[t].ability;
            G.gLastUsedAbility = gBattleMons[t].ability;
            effect++;
          };
          if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
            if (ok(target1) && ok(target2)) take(GetBattlerAtPosition(((random() & 1) * 2) | side));
            else if (ok(target1)) take(target1);
            else if (ok(target2)) take(target2);
          } else {
            G.gActiveBattler = target1;
            if (gBattleMons[target1].ability && gBattleMons[target1].hp) take(target1);
          }
          if (effect !== 0) {
            BattleScriptPushCursorAndCallback(BS("BattleScript_TraceActivates"));
            gStatuses3[i] &= ~C.STATUS3_TRACE;
            gBattleScripting.battler = i;
            PREPARE_MON_NICK_WITH_PREFIX_BUFFER(gBattleTextBuff1, G.gActiveBattler, gBattlerPartyIndexes[G.gActiveBattler]);
            PREPARE_ABILITY_BUFFER(gBattleTextBuff2, G.gLastUsedAbility);
            break;
          }
        }
      }
      break;
    case C.ABILITYEFFECT_CHECK_OTHER_SIDE:
      side = GetBattlerSide(battler);
      for (let i = 0; i < G.gBattlersCount; i++) {
        if (GetBattlerSide(i) !== side && gBattleMons[i].ability === ability) {
          G.gLastUsedAbility = ability;
          effect = i + 1;
        }
      }
      break;
    case C.ABILITYEFFECT_CHECK_BATTLER_SIDE:
      side = GetBattlerSide(battler);
      for (let i = 0; i < G.gBattlersCount; i++) {
        if (GetBattlerSide(i) === side && gBattleMons[i].ability === ability) {
          G.gLastUsedAbility = ability;
          effect = i + 1;
        }
      }
      break;
    case C.ABILITYEFFECT_FIELD_SPORT:
      switch (G.gLastUsedAbility) {
        case C.ABILITYEFFECT_MUD_SPORT:
          for (let i = 0; i < G.gBattlersCount; i++) if (gStatuses3[i] & C.STATUS3_MUDSPORT) effect = i + 1;
          break;
        case C.ABILITYEFFECT_WATER_SPORT:
          for (let i = 0; i < G.gBattlersCount; i++) if (gStatuses3[i] & C.STATUS3_WATERSPORT) effect = i + 1;
          break;
        default:
          for (let i = 0; i < G.gBattlersCount; i++) {
            if (gBattleMons[i].ability === ability) {
              G.gLastUsedAbility = ability;
              effect = i + 1;
            }
          }
          break;
      }
      break;
    case C.ABILITYEFFECT_CHECK_ON_FIELD:
      for (let i = 0; i < G.gBattlersCount; i++) {
        if (gBattleMons[i].ability === ability && gBattleMons[i].hp !== 0) {
          G.gLastUsedAbility = ability;
          effect = i + 1;
        }
      }
      break;
    case C.ABILITYEFFECT_CHECK_FIELD_EXCEPT_BATTLER:
      side = GetBattlerSide(battler);
      for (let i = 0; i < G.gBattlersCount; i++) {
        if (GetBattlerSide(i) !== side && gBattleMons[i].ability === ability) {
          G.gLastUsedAbility = ability;
          effect = i + 1;
          break;
        }
      }
      if (effect === 0) {
        for (let i = 0; i < G.gBattlersCount; i++) {
          if (gBattleMons[i].ability === ability && GetBattlerSide(i) === side && i !== battler) {
            G.gLastUsedAbility = ability;
            effect = i + 1;
          }
        }
      }
      break;
    case C.ABILITYEFFECT_COUNT_OTHER_SIDE:
      side = GetBattlerSide(battler);
      for (let i = 0; i < G.gBattlersCount; i++) {
        if (GetBattlerSide(i) !== side && gBattleMons[i].ability === ability) {
          G.gLastUsedAbility = ability;
          effect++;
        }
      }
      break;
    case C.ABILITYEFFECT_COUNT_BATTLER_SIDE:
      side = GetBattlerSide(battler);
      for (let i = 0; i < G.gBattlersCount; i++) {
        if (GetBattlerSide(i) === side && gBattleMons[i].ability === ability) {
          G.gLastUsedAbility = ability;
          effect++;
        }
      }
      break;
    case C.ABILITYEFFECT_COUNT_ON_FIELD:
      for (let i = 0; i < G.gBattlersCount; i++) {
        if (gBattleMons[i].ability === ability && i !== battler) {
          G.gLastUsedAbility = ability;
          effect++;
        }
      }
      break;
  }
  if (effect && caseID < C.ABILITYEFFECT_CHECK_OTHER_SIDE && G.gLastUsedAbility !== 0xff) RecordAbilityBattle(battler, G.gLastUsedAbility);
  return effect;
}

export function BattleScriptExecute(ptr: number): void {
  G.gBattlescriptCurrInstr = ptr;
  const s = gBattleResources.battleCallbackStack;
  s.function[s.size++] = G.gBattleMainFunc;
  G.gBattleMainFunc = RunBattleScriptCommands_PopCallbacksStack;
  G.gCurrentActionFuncId = 0;
}

export function BattleScriptPushCursorAndCallback(ptr: number): void {
  BattleScriptPushCursor();
  G.gBattlescriptCurrInstr = ptr;
  const s = gBattleResources.battleCallbackStack;
  s.function[s.size++] = G.gBattleMainFunc;
  G.gBattleMainFunc = RunBattleScriptCommands;
}

const enum ItemFx { NO_EFFECT, STATUS_CHANGE, EFFECT_OTHER, PP_CHANGE, HP_CHANGE, STATS_CHANGE }

const SET_STATCHANGER = (statId: number, stage: number, goesDown: boolean) => {
  gBattleScripting.statChanger = statId + (stage << 4) + ((goesDown ? 1 : 0) << 7);
};

export function ItemBattleEffects(caseID: number, battlerId: number, moveTurn: boolean): number {
  let i = 0;
  let effect: number = ItemFx.NO_EFFECT;
  let changedPP = 0;
  G.gLastUsedItem = gBattleMons[battlerId].item;
  let battlerHoldEffect = holdEffectOf(battlerId);
  let battlerHoldEffectParam = holdEffectParamOf(battlerId);
  const atkItem = gBattleMons[G.gBattlerAttacker].item;
  const atkHoldEffect = holdEffectOf(G.gBattlerAttacker);
  const atkHoldEffectParam = holdEffectParamOf(G.gBattlerAttacker);

  const m = () => gBattleMons[battlerId];
  const tryConfuseBerry = (flavor: number) => {
    if (m().hp <= div(m().maxHP, 2) && !moveTurn) {
      PREPARE_FLAVOR_BUFFER(gBattleTextBuff1, flavor);
      G.gBattleMoveDamage = div(m().maxHP, battlerHoldEffectParam);
      if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
      if (m().hp + G.gBattleMoveDamage > m().maxHP) G.gBattleMoveDamage = m().maxHP - m().hp;
      G.gBattleMoveDamage *= -1;
      if (GetFlavorRelationByPersonality(m().personality, flavor) < 0) BattleScriptExecute(BS("BattleScript_BerryConfuseHealEnd2"));
      else BattleScriptExecute(BS("BattleScript_ItemHealHP_RemoveItem"));
      effect = ItemFx.HP_CHANGE;
    }
  };
  const tryStatUpBerry = (stat: number) => {
    if (m().hp <= div(m().maxHP, battlerHoldEffectParam) && !moveTurn && m().statStages[stat] < C.MAX_STAT_STAGE) {
      PREPARE_STAT_BUFFER(gBattleTextBuff1, stat);
      G.gEffectBattler = battlerId;
      SET_STATCHANGER(stat, 1, false);
      gBattleScripting.animArg1 = 14 + stat;
      gBattleScripting.animArg2 = 0;
      BattleScriptExecute(BS("BattleScript_BerryStatRaiseEnd2"));
      effect = ItemFx.STATS_CHANGE;
    }
  };
  const restoreStats = () => {
    for (i = 0; i < C.NUM_BATTLE_STATS; i++) {
      if (m().statStages[i] < C.DEFAULT_STAT_STAGE) {
        m().statStages[i] = C.DEFAULT_STAT_STAGE;
        effect = ItemFx.STATS_CHANGE;
      }
    }
  };
  /** Shared by HOLD_EFFECT_CURE_STATUS in both cases; returns the number of cured conditions. */
  const copyCuredStatusStrings = (): number => {
    let n = 0;
    if (m().status1 & C.STATUS1_PSN_ANY) { StringCopyBuff(gBattleTextBuff1, statusStr("Poison")); n++; }
    if (m().status1 & C.STATUS1_SLEEP) {
      m().status2 &= ~C.STATUS2_NIGHTMARE;
      StringCopyBuff(gBattleTextBuff1, statusStr("Sleep"));
      n++;
    }
    if (m().status1 & C.STATUS1_PARALYSIS) { StringCopyBuff(gBattleTextBuff1, statusStr("Paralysis")); n++; }
    if (m().status1 & C.STATUS1_BURN) { StringCopyBuff(gBattleTextBuff1, statusStr("Burn")); n++; }
    if (m().status1 & C.STATUS1_FREEZE) { StringCopyBuff(gBattleTextBuff1, statusStr("Ice")); n++; }
    if (m().status2 & C.STATUS2_CONFUSION) { StringCopyBuff(gBattleTextBuff1, statusStr("Confusion")); n++; }
    return n;
  };

  switch (caseID) {
    case C.ITEMEFFECT_ON_SWITCH_IN:
      switch (battlerHoldEffect) {
        case C.HOLD_EFFECT_DOUBLE_PRIZE:
          gBattleStruct.moneyMultiplier = 2;
          break;
        case C.HOLD_EFFECT_RESTORE_STATS:
          restoreStats();
          if (effect !== 0) {
            gBattleScripting.battler = battlerId;
            G.gPotentialItemEffectBattler = battlerId;
            G.gActiveBattler = G.gBattlerAttacker = battlerId;
            BattleScriptExecute(BS("BattleScript_WhiteHerbEnd2"));
          }
          break;
      }
      break;
    case C.ITEMEFFECT_NORMAL:
      if (m().hp) {
        switch (battlerHoldEffect) {
          case C.HOLD_EFFECT_RESTORE_HP:
            if (m().hp <= div(m().maxHP, 2) && !moveTurn) {
              G.gBattleMoveDamage = battlerHoldEffectParam;
              if (m().hp + battlerHoldEffectParam > m().maxHP) G.gBattleMoveDamage = m().maxHP - m().hp;
              G.gBattleMoveDamage *= -1;
              BattleScriptExecute(BS("BattleScript_ItemHealHP_RemoveItem"));
              effect = ItemFx.HP_CHANGE;
            }
            break;
          case C.HOLD_EFFECT_RESTORE_PP:
            if (!moveTurn) {
              const mon = partyFor(battlerId)(gBattlerPartyIndexes[battlerId]);
              let move = 0;
              let ppBonuses = 0;
              for (i = 0; i < MAX_MON_MOVES; i++) {
                move = GetMonData(mon, C.MON_DATA_MOVE1 + i);
                changedPP = GetMonData(mon, C.MON_DATA_PP1 + i);
                ppBonuses = GetMonData(mon, C.MON_DATA_PP_BONUSES);
                if (move && changedPP === 0) break;
              }
              if (i !== MAX_MON_MOVES) {
                const maxPP = CalculatePPWithBonus(move, ppBonuses, i);
                changedPP = changedPP + battlerHoldEffectParam > maxPP ? maxPP : changedPP + battlerHoldEffectParam;
                PREPARE_MOVE_BUFFER(gBattleTextBuff1, move);
                BattleScriptExecute(BS("BattleScript_BerryPPHealEnd2"));
                BtlController_EmitSetMonData(BUFFER_A, i + C.REQUEST_PPMOVE1_BATTLE, 0, 1, [changedPP]);
                MarkBattlerForControllerExec(G.gActiveBattler);
                effect = ItemFx.PP_CHANGE;
              }
            }
            break;
          case C.HOLD_EFFECT_RESTORE_STATS:
            restoreStats();
            if (effect !== 0) {
              gBattleScripting.battler = battlerId;
              G.gPotentialItemEffectBattler = battlerId;
              G.gActiveBattler = G.gBattlerAttacker = battlerId;
              BattleScriptExecute(BS("BattleScript_WhiteHerbEnd2"));
            }
            break;
          case C.HOLD_EFFECT_LEFTOVERS:
            if (m().hp < m().maxHP && !moveTurn) {
              G.gBattleMoveDamage = div(m().maxHP, 16);
              if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
              if (m().hp + G.gBattleMoveDamage > m().maxHP) G.gBattleMoveDamage = m().maxHP - m().hp;
              G.gBattleMoveDamage *= -1;
              BattleScriptExecute(BS("BattleScript_ItemHealHP_End2"));
              effect = ItemFx.HP_CHANGE;
              RecordItemEffectBattle(battlerId, battlerHoldEffect);
            }
            break;
          case C.HOLD_EFFECT_CONFUSE_SPICY: tryConfuseBerry(C.FLAVOR_SPICY); break;
          case C.HOLD_EFFECT_CONFUSE_DRY: tryConfuseBerry(C.FLAVOR_DRY); break;
          case C.HOLD_EFFECT_CONFUSE_SWEET: tryConfuseBerry(C.FLAVOR_SWEET); break;
          case C.HOLD_EFFECT_CONFUSE_BITTER: tryConfuseBerry(C.FLAVOR_BITTER); break;
          case C.HOLD_EFFECT_CONFUSE_SOUR: tryConfuseBerry(C.FLAVOR_SOUR); break;
          case C.HOLD_EFFECT_ATTACK_UP:
            if (m().hp <= div(m().maxHP, battlerHoldEffectParam) && !moveTurn && m().statStages[C.STAT_ATK] < C.MAX_STAT_STAGE) {
              PREPARE_STAT_BUFFER(gBattleTextBuff1, C.STAT_ATK);
              PREPARE_STRING_BUFFER(gBattleTextBuff2, C.STRINGID_STATROSE);
              G.gEffectBattler = battlerId;
              SET_STATCHANGER(C.STAT_ATK, 1, false);
              gBattleScripting.animArg1 = 14 + C.STAT_ATK;
              gBattleScripting.animArg2 = 0;
              BattleScriptExecute(BS("BattleScript_BerryStatRaiseEnd2"));
              effect = ItemFx.STATS_CHANGE;
            }
            break;
          case C.HOLD_EFFECT_DEFENSE_UP: tryStatUpBerry(C.STAT_DEF); break;
          case C.HOLD_EFFECT_SPEED_UP: tryStatUpBerry(C.STAT_SPEED); break;
          case C.HOLD_EFFECT_SP_ATTACK_UP: tryStatUpBerry(C.STAT_SPATK); break;
          case C.HOLD_EFFECT_SP_DEFENSE_UP: tryStatUpBerry(C.STAT_SPDEF); break;
          case C.HOLD_EFFECT_CRITICAL_UP:
            if (m().hp <= div(m().maxHP, battlerHoldEffectParam) && !moveTurn && !(m().status2 & C.STATUS2_FOCUS_ENERGY)) {
              m().status2 |= C.STATUS2_FOCUS_ENERGY;
              BattleScriptExecute(BS("BattleScript_BerryFocusEnergyEnd2"));
              effect = ItemFx.EFFECT_OTHER;
            }
            break;
          case C.HOLD_EFFECT_RANDOM_STAT_UP:
            if (!moveTurn && m().hp <= div(m().maxHP, battlerHoldEffectParam)) {
              for (i = 0; i < C.NUM_STATS - 1; i++) if (m().statStages[C.STAT_ATK + i] < C.MAX_STAT_STAGE) break;
              if (i !== C.NUM_STATS - 1) {
                do i = random() % (C.NUM_STATS - 1);
                while (m().statStages[C.STAT_ATK + i] === C.MAX_STAT_STAGE);
                PREPARE_STAT_BUFFER(gBattleTextBuff1, i + 1);
                gBattleTextBuff2[0] = B_BUFF_PLACEHOLDER_BEGIN;
                gBattleTextBuff2[1] = B_BUFF_STRING;
                gBattleTextBuff2[2] = C.STRINGID_STATSHARPLY & 0xff;
                gBattleTextBuff2[3] = C.STRINGID_STATSHARPLY >> 8;
                gBattleTextBuff2[4] = B_BUFF_STRING;
                gBattleTextBuff2[5] = C.STRINGID_STATROSE & 0xff;
                gBattleTextBuff2[6] = C.STRINGID_STATROSE >> 8;
                gBattleTextBuff2[7] = B_BUFF_EOS;
                G.gEffectBattler = battlerId;
                SET_STATCHANGER(i + 1, 2, false);
                gBattleScripting.animArg1 = 0x21 + i + 6;
                gBattleScripting.animArg2 = 0;
                BattleScriptExecute(BS("BattleScript_BerryStatRaiseEnd2"));
                effect = ItemFx.STATS_CHANGE;
              }
            }
            break;
          case C.HOLD_EFFECT_CURE_PAR:
            if (m().status1 & C.STATUS1_PARALYSIS) {
              m().status1 &= ~C.STATUS1_PARALYSIS;
              BattleScriptExecute(BS("BattleScript_BerryCurePrlzEnd2"));
              effect = ItemFx.STATUS_CHANGE;
            }
            break;
          case C.HOLD_EFFECT_CURE_PSN:
            if (m().status1 & C.STATUS1_PSN_ANY) {
              m().status1 &= ~(C.STATUS1_PSN_ANY | C.STATUS1_TOXIC_COUNTER);
              BattleScriptExecute(BS("BattleScript_BerryCurePsnEnd2"));
              effect = ItemFx.STATUS_CHANGE;
            }
            break;
          case C.HOLD_EFFECT_CURE_BRN:
            if (m().status1 & C.STATUS1_BURN) {
              m().status1 &= ~C.STATUS1_BURN;
              BattleScriptExecute(BS("BattleScript_BerryCureBrnEnd2"));
              effect = ItemFx.STATUS_CHANGE;
            }
            break;
          case C.HOLD_EFFECT_CURE_FRZ:
            if (m().status1 & C.STATUS1_FREEZE) {
              m().status1 &= ~C.STATUS1_FREEZE;
              BattleScriptExecute(BS("BattleScript_BerryCureFrzEnd2"));
              effect = ItemFx.STATUS_CHANGE;
            }
            break;
          case C.HOLD_EFFECT_CURE_SLP:
            if (m().status1 & C.STATUS1_SLEEP) {
              m().status1 &= ~C.STATUS1_SLEEP;
              m().status2 &= ~C.STATUS2_NIGHTMARE;
              BattleScriptExecute(BS("BattleScript_BerryCureSlpEnd2"));
              effect = ItemFx.STATUS_CHANGE;
            }
            break;
          case C.HOLD_EFFECT_CURE_CONFUSION:
            if (m().status2 & C.STATUS2_CONFUSION) {
              m().status2 &= ~C.STATUS2_CONFUSION;
              BattleScriptExecute(BS("BattleScript_BerryCureConfusionEnd2"));
              effect = ItemFx.EFFECT_OTHER;
            }
            break;
          case C.HOLD_EFFECT_CURE_STATUS:
            if (m().status1 & C.STATUS1_ANY || m().status2 & C.STATUS2_CONFUSION) {
              i = copyCuredStatusStrings();
              gBattleCommunication[C.MULTISTRING_CHOOSER] = i <= 1 ? C.B_MSG_CURED_PROBLEM : C.B_MSG_NORMALIZED_STATUS;
              m().status1 = 0;
              m().status2 &= ~C.STATUS2_CONFUSION;
              BattleScriptExecute(BS("BattleScript_BerryCureChosenStatusEnd2"));
              effect = ItemFx.STATUS_CHANGE;
            }
            break;
          case C.HOLD_EFFECT_CURE_ATTRACT:
            if (m().status2 & C.STATUS2_INFATUATION) {
              m().status2 &= ~C.STATUS2_INFATUATION;
              StringCopyBuff(gBattleTextBuff1, statusStr("Love"));
              BattleScriptExecute(BS("BattleScript_BerryCureChosenStatusEnd2"));
              gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_CURED_PROBLEM;
              effect = ItemFx.EFFECT_OTHER;
            }
            break;
        }
        if (effect !== 0) {
          gBattleScripting.battler = battlerId;
          G.gPotentialItemEffectBattler = battlerId;
          G.gActiveBattler = G.gBattlerAttacker = battlerId;
          if (effect === ItemFx.STATUS_CHANGE) {
            emitStatus1(battlerId);
          } else if (effect === ItemFx.PP_CHANGE) {
            if (MOVE_IS_PERMANENT(battlerId, i, gDisableStructs[battlerId])) m().pp[i] = changedPP;
          }
        }
      }
      break;
    case C.ITEMEFFECT_DUMMY:
      break;
    case C.ITEMEFFECT_MOVE_END:
      for (battlerId = 0; battlerId < G.gBattlersCount; battlerId++) {
        G.gLastUsedItem = gBattleMons[battlerId].item;
        battlerHoldEffect = holdEffectOf(battlerId);
        battlerHoldEffectParam = holdEffectParamOf(battlerId);
        const ret = (script: string, fx: number) => {
          BattleScriptPushCursor();
          G.gBattlescriptCurrInstr = BS(script);
          effect = fx;
        };
        switch (battlerHoldEffect) {
          case C.HOLD_EFFECT_CURE_PAR:
            if (m().status1 & C.STATUS1_PARALYSIS) {
              m().status1 &= ~C.STATUS1_PARALYSIS;
              ret("BattleScript_BerryCureParRet", ItemFx.STATUS_CHANGE);
            }
            break;
          case C.HOLD_EFFECT_CURE_PSN:
            if (m().status1 & C.STATUS1_PSN_ANY) {
              m().status1 &= ~(C.STATUS1_PSN_ANY | C.STATUS1_TOXIC_COUNTER);
              ret("BattleScript_BerryCurePsnRet", ItemFx.STATUS_CHANGE);
            }
            break;
          case C.HOLD_EFFECT_CURE_BRN:
            if (m().status1 & C.STATUS1_BURN) {
              m().status1 &= ~C.STATUS1_BURN;
              ret("BattleScript_BerryCureBrnRet", ItemFx.STATUS_CHANGE);
            }
            break;
          case C.HOLD_EFFECT_CURE_FRZ:
            if (m().status1 & C.STATUS1_FREEZE) {
              m().status1 &= ~C.STATUS1_FREEZE;
              ret("BattleScript_BerryCureFrzRet", ItemFx.STATUS_CHANGE);
            }
            break;
          case C.HOLD_EFFECT_CURE_SLP:
            if (m().status1 & C.STATUS1_SLEEP) {
              m().status1 &= ~C.STATUS1_SLEEP;
              m().status2 &= ~C.STATUS2_NIGHTMARE;
              ret("BattleScript_BerryCureSlpRet", ItemFx.STATUS_CHANGE);
            }
            break;
          case C.HOLD_EFFECT_CURE_CONFUSION:
            if (m().status2 & C.STATUS2_CONFUSION) {
              m().status2 &= ~C.STATUS2_CONFUSION;
              ret("BattleScript_BerryCureConfusionRet", ItemFx.EFFECT_OTHER);
            }
            break;
          case C.HOLD_EFFECT_CURE_ATTRACT:
            if (m().status2 & C.STATUS2_INFATUATION) {
              m().status2 &= ~C.STATUS2_INFATUATION;
              StringCopyBuff(gBattleTextBuff1, statusStr("Love"));
              gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_CURED_PROBLEM;
              ret("BattleScript_BerryCureChosenStatusRet", ItemFx.EFFECT_OTHER);
            }
            break;
          case C.HOLD_EFFECT_CURE_STATUS:
            if (m().status1 & C.STATUS1_ANY || m().status2 & C.STATUS2_CONFUSION) {
              copyCuredStatusStrings();
              m().status1 = 0;
              m().status2 &= ~C.STATUS2_CONFUSION;
              gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_CURED_PROBLEM;
              ret("BattleScript_BerryCureChosenStatusRet", ItemFx.STATUS_CHANGE);
            }
            break;
          case C.HOLD_EFFECT_RESTORE_STATS:
            restoreStats();
            if (effect !== 0) {
              gBattleScripting.battler = battlerId;
              G.gPotentialItemEffectBattler = battlerId;
              BattleScriptPushCursor();
              G.gBattlescriptCurrInstr = BS("BattleScript_WhiteHerbRet");
              return effect;
            }
            break;
        }
        if (effect !== 0) {
          gBattleScripting.battler = battlerId;
          G.gPotentialItemEffectBattler = battlerId;
          G.gActiveBattler = battlerId;
          emitStatus1(battlerId);
          break;
        }
      }
      break;
    case C.ITEMEFFECT_KINGSROCK_SHELLBELL:
      if (G.gBattleMoveDamage) {
        const t = G.gBattlerTarget;
        const a = G.gBattlerAttacker;
        switch (atkHoldEffect) {
          case C.HOLD_EFFECT_FLINCH:
            if (!(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) && TARGET_TURN_DAMAGED() && random() % 100 < battlerHoldEffectParam
              && gBattleMoves(G.gCurrentMove).flags & C.FLAG_KINGS_ROCK_AFFECTED && gBattleMons[t].hp) {
              gBattleCommunication[C.MOVE_EFFECT_BYTE] = C.MOVE_EFFECT_FLINCH;
              BattleScriptPushCursor();
              SetMoveEffect(false, 0);
              BattleScriptPop();
            }
            break;
          case C.HOLD_EFFECT_SHELL_BELL:
            if (!(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) && gSpecialStatuses[t].dmg !== 0 && gSpecialStatuses[t].dmg !== 0xffff
              && a !== t && gBattleMons[a].hp !== gBattleMons[a].maxHP && gBattleMons[a].hp !== 0) {
              G.gLastUsedItem = atkItem;
              G.gPotentialItemEffectBattler = a;
              gBattleScripting.battler = a;
              G.gBattleMoveDamage = div(gSpecialStatuses[t].dmg, atkHoldEffectParam) * -1;
              if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = -1;
              gSpecialStatuses[t].dmg = 0;
              BattleScriptPushCursor();
              G.gBattlescriptCurrInstr = BS("BattleScript_ItemHealHP_Ret");
              effect++;
            }
            break;
        }
      }
      break;
  }
  return effect;
}

export function ClearFuryCutterDestinyBondGrudge(battlerId: number): void {
  gDisableStructs[battlerId].furyCutterCounter = 0;
  gBattleMons[battlerId].status2 &= ~C.STATUS2_DESTINY_BOND;
  gStatuses3[battlerId] &= ~C.STATUS3_GRUDGE;
}

export function HandleAction_RunBattleScript(): void {
  if (G.gBattleControllerExecFlags === 0) gBattleScriptingCommandsTable[r8(G.gBattlescriptCurrInstr)]();
}

export function GetMoveTarget(move: number, setTarget: number): number {
  let targetBattler = 0;
  const moveTarget = setTarget !== C.NO_TARGET_OVERRIDE ? setTarget - 1 : gBattleMoves(move).target;
  const a = G.gBattlerAttacker;
  let side: number;
  switch (moveTarget) {
    case C.MOVE_TARGET_SELECTED:
      side = GetBattlerSide(a) ^ C.BIT_SIDE;
      if (gSideTimers[side].followmeTimer && gBattleMons[gSideTimers[side].followmeTarget].hp) {
        targetBattler = gSideTimers[side].followmeTarget;
      } else {
        side = GetBattlerSide(a);
        do targetBattler = random() % G.gBattlersCount;
        while (targetBattler === a || side === GetBattlerSide(targetBattler) || G.gAbsentBattlerFlags & gBitTable[targetBattler]);
        if (gBattleMoves(move).type === C.TYPE_ELECTRIC && AbilityBattleEffects(C.ABILITYEFFECT_COUNT_OTHER_SIDE, a, C.ABILITY_LIGHTNING_ROD, 0, 0)
          && gBattleMons[targetBattler].ability !== C.ABILITY_LIGHTNING_ROD) {
          targetBattler ^= C.BIT_FLANK;
          RecordAbilityBattle(targetBattler, gBattleMons[targetBattler].ability);
          gSpecialStatuses[targetBattler].lightningRodRedirected = 1;
        }
      }
      break;
    case C.MOVE_TARGET_DEPENDS:
    case C.MOVE_TARGET_BOTH:
    case C.MOVE_TARGET_FOES_AND_ALLY:
    case C.MOVE_TARGET_OPPONENTS_FIELD:
      targetBattler = GetBattlerAtPosition((GetBattlerPosition(a) & C.BIT_SIDE) ^ C.BIT_SIDE);
      if (G.gAbsentBattlerFlags & gBitTable[targetBattler]) targetBattler ^= C.BIT_FLANK;
      break;
    case C.MOVE_TARGET_RANDOM:
      side = GetBattlerSide(a) ^ C.BIT_SIDE;
      if (gSideTimers[side].followmeTimer && gBattleMons[gSideTimers[side].followmeTarget].hp) {
        targetBattler = gSideTimers[side].followmeTarget;
      } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && moveTarget & C.MOVE_TARGET_RANDOM) {
        if (GetBattlerSide(a) === C.B_SIDE_PLAYER) targetBattler = GetBattlerAtPosition(random() & 1 ? C.B_POSITION_OPPONENT_LEFT : C.B_POSITION_OPPONENT_RIGHT);
        else targetBattler = GetBattlerAtPosition(random() & 1 ? C.B_POSITION_PLAYER_LEFT : C.B_POSITION_PLAYER_RIGHT);
        if (G.gAbsentBattlerFlags & gBitTable[targetBattler]) targetBattler ^= C.BIT_FLANK;
      } else {
        targetBattler = GetBattlerAtPosition((GetBattlerPosition(a) & C.BIT_SIDE) ^ C.BIT_SIDE);
      }
      break;
    case C.MOVE_TARGET_USER_OR_SELECTED:
    case C.MOVE_TARGET_USER:
      targetBattler = a;
      break;
  }
  gBattleStruct.moveTarget[a] = targetBattler;
  return targetBattler;
}

function IsBattlerModernFatefulEncounter(battlerId: number): boolean {
  if (GetBattlerSide(battlerId) === C.B_SIDE_OPPONENT) return true;
  const mon = playerMon(gBattlerPartyIndexes[battlerId]);
  const species = GetMonData(mon, C.MON_DATA_SPECIES);
  if (species !== C.SPECIES_DEOXYS && species !== C.SPECIES_MEW) return true;
  return !!GetMonData(mon, C.MON_DATA_MODERN_FATEFUL_ENCOUNTER);
}

export function IsMonDisobedient(): number {
  let obedienceLevel = 0;
  const a = G.gBattlerAttacker;
  const m = gBattleMons[a];
  if (G.gBattleTypeFlags & (C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_POKEDUDE)) return 0;
  if (GetBattlerSide(a) === C.B_SIDE_OPPONENT) return 0;
  if (IsBattlerModernFatefulEncounter(a)) {
    if (!IsOtherTrainer(m.otId, m.otName)) return 0;
    if (flagGet(C.FLAG_BADGE08_GET)) return 0;
    obedienceLevel = 10;
    if (flagGet(C.FLAG_BADGE02_GET)) obedienceLevel = 30;
    if (flagGet(C.FLAG_BADGE04_GET)) obedienceLevel = 50;
    if (flagGet(C.FLAG_BADGE06_GET)) obedienceLevel = 70;
  }
  if (m.level <= obedienceLevel) return 0;
  let rnd = random() & 255;
  let calc = ((m.level + obedienceLevel) * rnd) >> 8;
  if (calc < obedienceLevel) return 0;
  if (G.gCurrentMove === C.MOVE_RAGE) m.status2 &= ~C.STATUS2_RAGE;
  if (m.status1 & C.STATUS1_SLEEP && (G.gCurrentMove === C.MOVE_SNORE || G.gCurrentMove === C.MOVE_SLEEP_TALK)) {
    G.gBattlescriptCurrInstr = BS("BattleScript_IgnoresWhileAsleep");
    return 1;
  }
  rnd = random() & 255;
  calc = ((m.level + obedienceLevel) * rnd) >> 8;
  if (calc < obedienceLevel && G.gCurrentMove !== C.MOVE_FOCUS_PUNCH) {
    calc = CheckMoveLimitations(a, gBitTable[G.gCurrMovePos], C.MOVE_LIMITATIONS_ALL);
    if (calc === 0xf) {
      gBattleCommunication[C.MULTISTRING_CHOOSER] = random() & (C.NUM_LOAF_STRINGS - 1);
      G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedLoafingAround");
      return 1;
    }
    do G.gCurrMovePos = G.gChosenMovePos = random() & (MAX_MON_MOVES - 1);
    while (gBitTable[G.gCurrMovePos] & calc);
    G.gCalledMove = m.moves[G.gCurrMovePos];
    G.gBattlescriptCurrInstr = BS("BattleScript_IgnoresAndUsesRandomMove");
    G.gBattlerTarget = GetMoveTarget(G.gCalledMove, C.NO_TARGET_OVERRIDE);
    G.gHitMarker |= C.HITMARKER_DISOBEDIENT_MOVE;
    return 2;
  }
  obedienceLevel = (m.level - obedienceLevel) & 0xff;
  calc = random() & 255;
  if (calc < obedienceLevel && !(m.status1 & C.STATUS1_ANY) && m.ability !== C.ABILITY_VITAL_SPIRIT && m.ability !== C.ABILITY_INSOMNIA) {
    let i = 0;
    for (; i < G.gBattlersCount; i++) if (gBattleMons[i].status2 & C.STATUS2_UPROAR) break;
    if (i === G.gBattlersCount) {
      G.gBattlescriptCurrInstr = BS("BattleScript_IgnoresAndFallsAsleep");
      return 1;
    }
  }
  calc -= obedienceLevel;
  if (calc < obedienceLevel) {
    G.gBattleMoveDamage = CalculateBaseDamage(m, m, C.MOVE_POUND, 0, 40, 0, a, a);
    G.gBattlerTarget = a;
    G.gBattlescriptCurrInstr = BS("BattleScript_IgnoresAndHitsItself");
    G.gHitMarker |= C.HITMARKER_UNABLE_TO_USE_MOVE;
    return 2;
  }
  gBattleCommunication[C.MULTISTRING_CHOOSER] = random() & (C.NUM_LOAF_STRINGS - 1);
  G.gBattlescriptCurrInstr = BS("BattleScript_MoveUsedLoafingAround");
  return 1;
}

// ---------------------------------------------------------------- small helpers from other battle files
/** battle_ai_script_commands.c */
export function RecordAbilityBattle(battlerId: number, abilityId: number): void {
  if (GetBattlerSide(battlerId) === 0) gBattleResources.battleHistory.abilities[battlerId & 1] = abilityId;
}

export function RecordItemEffectBattle(battlerId: number, itemEffect: number): void {
  if (GetBattlerSide(battlerId) === 0) gBattleResources.battleHistory.itemEffects[battlerId & 1] = itemEffect;
}

/** battle_interface.c */
export function GetScaledHPFraction(hp: number, maxhp: number, scale: number): number {
  const result = Math.trunc((((hp << 16) >> 16) * scale) / ((maxhp << 16) >> 16)) & 0xff;
  if (result === 0 && hp > 0) return 1;
  return result;
}

/** pokemon.c */
export function CountAliveMonsInBattle(caseId: number): number {
  let n = 0;
  for (let i = 0; i < C.MAX_BATTLERS_COUNT; i++) {
    if (G.gAbsentBattlerFlags & gBitTable[i]) continue;
    switch (caseId) {
      case C.BATTLE_ALIVE_EXCEPT_ACTIVE: if (i !== G.gActiveBattler) n++; break;
      case C.BATTLE_ALIVE_ATK_SIDE: if (GetBattlerSide(i) === GetBattlerSide(G.gBattlerAttacker)) n++; break;
      case C.BATTLE_ALIVE_DEF_SIDE: if (GetBattlerSide(i) === GetBattlerSide(G.gBattlerTarget)) n++; break;
    }
  }
  return n;
}

export function GetDefaultMoveTarget(battlerId: number): number {
  const opposing = BATTLE_OPPOSITE(GetBattlerPosition(battlerId) & C.BIT_SIDE);
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE)) return GetBattlerAtPosition(opposing);
  if (CountAliveMonsInBattle(C.BATTLE_ALIVE_EXCEPT_ACTIVE) > 1) {
    return GetBattlerAtPosition((random() & 1) === 0 ? opposing ^ C.BIT_FLANK : opposing);
  }
  if (G.gAbsentBattlerFlags & gBitTable[opposing]) return GetBattlerAtPosition(opposing ^ C.BIT_FLANK);
  return GetBattlerAtPosition(opposing);
}

export function GetAbilityBySpecies(species: number, abilityNum: number): number {
  const abilities = rom.species[species]?.abilities ?? [0, 0];
  G.gLastUsedAbility = abilityNum ? abilities[1] : abilities[0];
  return G.gLastUsedAbility;
}
