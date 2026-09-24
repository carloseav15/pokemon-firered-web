// battle_script_commands.c, commands 0x00-0x23.

import * as C from "../../generated/constants";
import { random } from "../../random";
import { rom } from "../../rom";
import { flagGet } from "../../save";
import { BS, BattleScriptPop, BattleScriptPush, BattleScriptPushCursor, r16, r32, r8, tableU16 } from "../bscript";
import {
  G, gBattleBufferB, gBattleCommunication, gBattleMons, gBattleResources, gBattleResults, gBattleScripting, gBattleStruct,
  gBattleTextBuff1, gBattleTextBuff2, gBattleTextBuff3, gBattlerByTurnOrder, gBattlerPartyIndexes, gBitTable, gDisableStructs,
  gEnigmaBerries, gLastHitByType, gLastLandedMoves, gLockedMoves, gProtectStructs, gSentPokesToOpponent, gSideStatuses,
  gSpecialStatuses, gStatuses3, gTakenDmg, gTakenDmgByBattler, gWishFutureKnock,
} from "../globals";
import {
  GET_BATTLER_SIDE, GET_MOVE_TYPE, HITMARKER_FAINTED, IS_BATTLER_OF_TYPE, IS_TYPE_PHYSICAL, MOVE_IS_PERMANENT, SET_STAT_BUFF_VALUE,
  STAT_BUFF_NEGATIVE, STATUS1_SLEEP_TURN, STATUS2_CONFUSION_TURN, STATUS2_LOCK_CONFUSE_TURN, STATUS2_UPROAR_TURN, STATUS2_WRAPPED_TURN,
  TYPE_EFFECT_ATK_TYPE, TYPE_EFFECT_DEF_TYPE, TYPE_EFFECT_MULTIPLIER, div, gBattleMoves, F_DYNAMIC_TYPE_1, DYNAMIC_TYPE_MASK,
} from "../macros";
import { GetMonData, gEnemyParty, playerMon } from "../../pokemon/mon";
import {
  AbilityBattleEffects, AtkCanceller_UnableToUseMove, CancelMultiTurnMoves, GetBattlerForBattleScript, GetBattlerSide,
  IsMonDisobedient, ItemId_GetHoldEffect, ItemId_GetHoldEffectParam, MarkBattlerForControllerExec, PressurePPLose,
  RecordAbilityBattle, RecordItemEffectBattle, WEATHER_HAS_EFFECT, WEATHER_HAS_EFFECT2,
} from "../util";
import {
  BtlController_EmitExpUpdate, BtlController_EmitFaintAnimation, BtlController_EmitHealthBarUpdate, BtlController_EmitMoveAnimation,
  BtlController_EmitPlaySE, BtlController_EmitPrintSelectionString, BtlController_EmitSetMonData, BUFFER_A,
} from "../controllers";
import {
  PrepareStringBattle, PREPARE_BYTE_NUMBER_BUFFER, PREPARE_MON_NICK_WITH_PREFIX_BUFFER, PREPARE_MOVE_BUFFER,
  PREPARE_STRING_BUFFER, PREPARE_WORD_NUMBER_BUFFER, gMissStringIds, gTrappingMoves,
} from "../message";
import { CalculateBaseDamage } from "../damage";
import { BtlCtrl_OakOldMan_TestState2Flag } from "../controller_oak_old_man";
import { AdjustFriendship, AdjustFriendshipOnBattleFaint, IsTradedMon, MonGainEVs } from "../../pokemon/mon_extra";
import { BattleStopLowHpSound, HandleLowHpMusicChange, PlayBGM } from "../gfx_sfx_util";
import { FaintClearSetData } from "../main";
import { AttacksThisTurn, ChangeStatBuffs, IsTwoTurnsMove, TrySetDestinyBondToHappen } from "./helpers";

const cur = () => G.gBattlescriptCurrInstr;
const adv = (n: number) => { G.gBattlescriptCurrInstr += n; };
const DEFENDER_IS_PROTECTED = () => !!gProtectStructs[G.gBattlerTarget].protected && !!(gBattleMoves(G.gCurrentMove).flags & C.FLAG_PROTECT_AFFECTED);

const sAccuracyStageRatios: Array<[number, number]> = [
  [33, 100], [36, 100], [43, 100], [50, 100], [60, 100], [75, 100], [1, 1],
  [133, 100], [166, 100], [2, 1], [233, 100], [133, 50], [3, 1],
];
const sCriticalHitChance = [16, 8, 4, 3, 2];

export const sStatusFlagsForMoveEffects: number[] = (() => {
  const t = new Array(C.NUM_MOVE_EFFECTS).fill(0);
  t[C.MOVE_EFFECT_SLEEP] = C.STATUS1_SLEEP;
  t[C.MOVE_EFFECT_POISON] = C.STATUS1_POISON;
  t[C.MOVE_EFFECT_BURN] = C.STATUS1_BURN;
  t[C.MOVE_EFFECT_FREEZE] = C.STATUS1_FREEZE;
  t[C.MOVE_EFFECT_PARALYSIS] = C.STATUS1_PARALYSIS;
  t[C.MOVE_EFFECT_TOXIC] = C.STATUS1_TOXIC_POISON;
  t[C.MOVE_EFFECT_CONFUSION] = C.STATUS2_CONFUSION;
  t[C.MOVE_EFFECT_FLINCH] = C.STATUS2_FLINCHED;
  t[C.MOVE_EFFECT_UPROAR] = C.STATUS2_UPROAR;
  t[C.MOVE_EFFECT_CHARGING] = C.STATUS2_MULTIPLETURNS;
  t[C.MOVE_EFFECT_WRAP] = C.STATUS2_WRAPPED;
  t[C.MOVE_EFFECT_RECHARGE] = C.STATUS2_RECHARGE;
  t[C.MOVE_EFFECT_PREVENT_ESCAPE] = C.STATUS2_ESCAPE_PREVENTION;
  t[C.MOVE_EFFECT_NIGHTMARE] = C.STATUS2_NIGHTMARE;
  t[C.MOVE_EFFECT_THRASH] = C.STATUS2_LOCK_CONFUSE;
  return t;
})();

function sMoveEffectBS_Ptrs(effect: number): number {
  switch (effect) {
    case C.MOVE_EFFECT_POISON: return BS("BattleScript_MoveEffectPoison");
    case C.MOVE_EFFECT_BURN: return BS("BattleScript_MoveEffectBurn");
    case C.MOVE_EFFECT_FREEZE: return BS("BattleScript_MoveEffectFreeze");
    case C.MOVE_EFFECT_PARALYSIS: return BS("BattleScript_MoveEffectParalysis");
    case C.MOVE_EFFECT_TOXIC: return BS("BattleScript_MoveEffectToxic");
    case C.MOVE_EFFECT_CONFUSION: return BS("BattleScript_MoveEffectConfusion");
    case C.MOVE_EFFECT_UPROAR: return BS("BattleScript_MoveEffectUproar");
    case C.MOVE_EFFECT_PAYDAY: return BS("BattleScript_MoveEffectPayDay");
    case C.MOVE_EFFECT_WRAP: return BS("BattleScript_MoveEffectWrap");
    case C.MOVE_EFFECT_RECOIL_25: return BS("BattleScript_MoveEffectRecoil");
    case C.MOVE_EFFECT_RECOIL_33: return BS("BattleScript_MoveEffectRecoil");
    default: return BS("BattleScript_MoveEffectSleep");
  }
}

function holdEffectOf(battler: number): [number, number] {
  if (gBattleMons[battler].item === C.ITEM_ENIGMA_BERRY) return [gEnigmaBerries[battler].holdEffect, gEnigmaBerries[battler].holdEffectParam];
  return [ItemId_GetHoldEffect(gBattleMons[battler].item), ItemId_GetHoldEffectParam(gBattleMons[battler].item)];
}

// ---------------------------------------------------------------- 0x00

export function Cmd_attackcanceler(): void {
  if (G.gBattleOutcome !== 0) {
    G.gCurrentActionFuncId = C.B_ACTION_FINISHED;
    return;
  }
  if (gBattleMons[G.gBattlerAttacker].hp === 0 && !(G.gHitMarker & C.HITMARKER_NO_ATTACKSTRING)) {
    G.gHitMarker |= C.HITMARKER_UNABLE_TO_USE_MOVE;
    G.gBattlescriptCurrInstr = BS("BattleScript_MoveEnd");
    return;
  }
  if (AtkCanceller_UnableToUseMove()) return;
  if (AbilityBattleEffects(C.ABILITYEFFECT_MOVES_BLOCK, G.gBattlerTarget, 0, 0, 0)) return;
  if (!gBattleMons[G.gBattlerAttacker].pp[G.gCurrMovePos] && G.gCurrentMove !== C.MOVE_STRUGGLE && !(G.gHitMarker & (C.HITMARKER_ALLOW_NO_PP | C.HITMARKER_NO_ATTACKSTRING))
    && !(gBattleMons[G.gBattlerAttacker].status2 & C.STATUS2_MULTIPLETURNS)) {
    G.gBattlescriptCurrInstr = BS("BattleScript_NoPPForMove");
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    return;
  }
  G.gHitMarker &= ~C.HITMARKER_ALLOW_NO_PP;
  if (!(G.gHitMarker & C.HITMARKER_OBEYS) && !(gBattleMons[G.gBattlerAttacker].status2 & C.STATUS2_MULTIPLETURNS)) {
    switch (IsMonDisobedient()) {
      case 0: break;
      case 2: G.gHitMarker |= C.HITMARKER_OBEYS; return;
      default: G.gMoveResultFlags |= C.MOVE_RESULT_MISSED; return;
    }
  }
  G.gHitMarker |= C.HITMARKER_OBEYS;
  if (gProtectStructs[G.gBattlerTarget].bounceMove && gBattleMoves(G.gCurrentMove).flags & C.FLAG_MAGIC_COAT_AFFECTED) {
    PressurePPLose(G.gBattlerAttacker, G.gBattlerTarget, C.MOVE_MAGIC_COAT);
    gProtectStructs[G.gBattlerTarget].bounceMove = 0;
    BattleScriptPushCursor();
    G.gBattlescriptCurrInstr = BS("BattleScript_MagicCoatBounce");
    return;
  }
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (gProtectStructs[gBattlerByTurnOrder[i]].stealMove && gBattleMoves(G.gCurrentMove).flags & C.FLAG_SNATCH_AFFECTED) {
      PressurePPLose(G.gBattlerAttacker, gBattlerByTurnOrder[i], C.MOVE_SNATCH);
      gProtectStructs[gBattlerByTurnOrder[i]].stealMove = 0;
      gBattleScripting.battler = gBattlerByTurnOrder[i];
      BattleScriptPushCursor();
      G.gBattlescriptCurrInstr = BS("BattleScript_SnatchedMove");
      return;
    }
  }
  if (gSpecialStatuses[G.gBattlerTarget].lightningRodRedirected) {
    gSpecialStatuses[G.gBattlerTarget].lightningRodRedirected = 0;
    G.gLastUsedAbility = C.ABILITY_LIGHTNING_ROD;
    BattleScriptPushCursor();
    G.gBattlescriptCurrInstr = BS("BattleScript_TookAttack");
    RecordAbilityBattle(G.gBattlerTarget, G.gLastUsedAbility);
  } else if (DEFENDER_IS_PROTECTED()
    && (G.gCurrentMove !== C.MOVE_CURSE || IS_BATTLER_OF_TYPE(G.gBattlerAttacker, C.TYPE_GHOST))
    && (!IsTwoTurnsMove(G.gCurrentMove) || (gBattleMons[G.gBattlerAttacker].status2 & C.STATUS2_MULTIPLETURNS))) {
    CancelMultiTurnMoves(G.gBattlerAttacker);
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gLastLandedMoves[G.gBattlerTarget] = 0;
    gLastHitByType[G.gBattlerTarget] = 0;
    gBattleCommunication[C.MISS_TYPE] = C.B_MSG_PROTECTED;
    adv(1);
  } else {
    adv(1);
  }
}

export function JumpIfMoveFailed(adder: number, move: number): void {
  let ptr = cur() + adder;
  if (G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) {
    gLastLandedMoves[G.gBattlerTarget] = 0;
    gLastHitByType[G.gBattlerTarget] = 0;
    ptr = r32(cur() + 1);
  } else {
    TrySetDestinyBondToHappen();
    if (AbilityBattleEffects(C.ABILITYEFFECT_ABSORBING, G.gBattlerTarget, 0, 0, move)) return;
  }
  G.gBattlescriptCurrInstr = ptr;
}

export function Cmd_jumpifaffectedbyprotect(): void {
  if (DEFENDER_IS_PROTECTED()) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    JumpIfMoveFailed(5, 0);
    gBattleCommunication[C.MISS_TYPE] = C.B_MSG_PROTECTED;
  } else {
    adv(5);
  }
}

function JumpIfMoveAffectedByProtect(move: number): boolean {
  if (DEFENDER_IS_PROTECTED()) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    JumpIfMoveFailed(7, move);
    gBattleCommunication[C.MISS_TYPE] = C.B_MSG_PROTECTED;
    return true;
  }
  return false;
}

function AccuracyCalcHelper(move: number): boolean {
  const t = G.gBattlerTarget;
  if (gStatuses3[t] & C.STATUS3_ALWAYS_HITS && gDisableStructs[t].battlerWithSureHit === G.gBattlerAttacker) {
    JumpIfMoveFailed(7, move);
    return true;
  }
  if (!(G.gHitMarker & C.HITMARKER_IGNORE_ON_AIR) && gStatuses3[t] & C.STATUS3_ON_AIR) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    JumpIfMoveFailed(7, move);
    return true;
  }
  G.gHitMarker &= ~C.HITMARKER_IGNORE_ON_AIR;
  if (!(G.gHitMarker & C.HITMARKER_IGNORE_UNDERGROUND) && gStatuses3[t] & C.STATUS3_UNDERGROUND) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    JumpIfMoveFailed(7, move);
    return true;
  }
  G.gHitMarker &= ~C.HITMARKER_IGNORE_UNDERGROUND;
  if (!(G.gHitMarker & C.HITMARKER_IGNORE_UNDERWATER) && gStatuses3[t] & C.STATUS3_UNDERWATER) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    JumpIfMoveFailed(7, move);
    return true;
  }
  G.gHitMarker &= ~C.HITMARKER_IGNORE_UNDERWATER;
  const effect = gBattleMoves(move).effect;
  if ((WEATHER_HAS_EFFECT() && (G.gBattleWeather & C.B_WEATHER_RAIN) && effect === C.EFFECT_THUNDER)
    || effect === C.EFFECT_ALWAYS_HIT || effect === C.EFFECT_VITAL_THROW) {
    JumpIfMoveFailed(7, move);
    return true;
  }
  return false;
}

export function Cmd_accuracycheck(): void {
  let move = r16(cur() + 5);
  const first = G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE;
  if ((first && !BtlCtrl_OakOldMan_TestState2Flag(1) && gBattleMoves(move).power !== 0 && GetBattlerSide(G.gBattlerAttacker) === C.B_SIDE_PLAYER)
    || (first && !BtlCtrl_OakOldMan_TestState2Flag(2) && gBattleMoves(move).power === 0 && GetBattlerSide(G.gBattlerAttacker) === C.B_SIDE_PLAYER)
    || (G.gBattleTypeFlags & C.BATTLE_TYPE_POKEDUDE)) {
    JumpIfMoveFailed(7, move);
    return;
  }
  if (move === C.NO_ACC_CALC || move === C.NO_ACC_CALC_CHECK_LOCK_ON) {
    if (gStatuses3[G.gBattlerTarget] & C.STATUS3_ALWAYS_HITS && move === C.NO_ACC_CALC_CHECK_LOCK_ON && gDisableStructs[G.gBattlerTarget].battlerWithSureHit === G.gBattlerAttacker) adv(7);
    else if (gStatuses3[G.gBattlerTarget] & (C.STATUS3_ON_AIR | C.STATUS3_UNDERGROUND | C.STATUS3_UNDERWATER)) G.gBattlescriptCurrInstr = r32(cur() + 1);
    else if (!JumpIfMoveAffectedByProtect(0)) adv(7);
    return;
  }
  if (move === C.ACC_CURR_MOVE) move = G.gCurrentMove;
  const type = GET_MOVE_TYPE(move);
  if (JumpIfMoveAffectedByProtect(move)) return;
  if (AccuracyCalcHelper(move)) return;
  let buff: number;
  const acc = gBattleMons[G.gBattlerAttacker].statStages[C.STAT_ACC];
  if (gBattleMons[G.gBattlerTarget].status2 & C.STATUS2_FORESIGHT) buff = acc;
  else buff = ((acc + C.DEFAULT_STAT_STAGE - gBattleMons[G.gBattlerTarget].statStages[C.STAT_EVASION]) << 24) >> 24;
  if (buff < C.MIN_STAT_STAGE) buff = C.MIN_STAT_STAGE;
  if (buff > C.MAX_STAT_STAGE) buff = C.MAX_STAT_STAGE;
  let moveAcc = gBattleMoves(move).accuracy;
  if (WEATHER_HAS_EFFECT() && G.gBattleWeather & C.B_WEATHER_SUN && gBattleMoves(move).effect === C.EFFECT_THUNDER) moveAcc = 50;
  let calc = (sAccuracyStageRatios[buff][0] * moveAcc) & 0xffff;
  calc = div(calc, sAccuracyStageRatios[buff][1]) & 0xffff;
  if (gBattleMons[G.gBattlerAttacker].ability === C.ABILITY_COMPOUND_EYES) calc = div(calc * 130, 100) & 0xffff;
  if (WEATHER_HAS_EFFECT() && gBattleMons[G.gBattlerTarget].ability === C.ABILITY_SAND_VEIL && G.gBattleWeather & C.B_WEATHER_SANDSTORM) calc = div(calc * 80, 100) & 0xffff;
  if (gBattleMons[G.gBattlerAttacker].ability === C.ABILITY_HUSTLE && IS_TYPE_PHYSICAL(type)) calc = div(calc * 80, 100) & 0xffff;
  const [holdEffect, param] = holdEffectOf(G.gBattlerTarget);
  G.gPotentialItemEffectBattler = G.gBattlerTarget;
  if (holdEffect === C.HOLD_EFFECT_EVASION_UP) calc = div(calc * (100 - param), 100) & 0xffff;
  if ((random() % 100) + 1 > calc) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && (gBattleMoves(move).target === C.MOVE_TARGET_BOTH || gBattleMoves(move).target === C.MOVE_TARGET_FOES_AND_ALLY))
      gBattleCommunication[C.MISS_TYPE] = C.B_MSG_AVOIDED_ATK;
    else gBattleCommunication[C.MISS_TYPE] = C.B_MSG_MISSED;
    CheckWonderGuardAndLevitate();
  }
  JumpIfMoveFailed(7, move);
}

export function Cmd_attackstring(): void {
  if (G.gBattleControllerExecFlags) return;
  if (!(G.gHitMarker & (C.HITMARKER_NO_ATTACKSTRING | C.HITMARKER_ATTACKSTRING_PRINTED))) {
    PrepareStringBattle(C.STRINGID_USEDMOVE, G.gBattlerAttacker);
    G.gHitMarker |= C.HITMARKER_ATTACKSTRING_PRINTED;
  }
  adv(1);
  gBattleCommunication[C.MSG_DISPLAY] = 0;
}

export function Cmd_ppreduce(): void {
  let ppToDeduct = 1;
  if (G.gBattleControllerExecFlags) return;
  const a = G.gBattlerAttacker;
  if (!gSpecialStatuses[a].ppNotAffectedByPressure) {
    switch (gBattleMoves(G.gCurrentMove).target) {
      case C.MOVE_TARGET_FOES_AND_ALLY:
        ppToDeduct += AbilityBattleEffects(C.ABILITYEFFECT_COUNT_ON_FIELD, a, C.ABILITY_PRESSURE, 0, 0);
        break;
      case C.MOVE_TARGET_BOTH:
      case C.MOVE_TARGET_OPPONENTS_FIELD:
        ppToDeduct += AbilityBattleEffects(C.ABILITYEFFECT_COUNT_OTHER_SIDE, a, C.ABILITY_PRESSURE, 0, 0);
        break;
      default:
        if (a !== G.gBattlerTarget && gBattleMons[G.gBattlerTarget].ability === C.ABILITY_PRESSURE) ppToDeduct++;
    }
  }
  if (!(G.gHitMarker & (C.HITMARKER_NO_PPDEDUCT | C.HITMARKER_NO_ATTACKSTRING)) && gBattleMons[a].pp[G.gCurrMovePos]) {
    gProtectStructs[a].notFirstStrike = 1;
    if (gBattleMons[a].pp[G.gCurrMovePos] > ppToDeduct) gBattleMons[a].pp[G.gCurrMovePos] -= ppToDeduct;
    else gBattleMons[a].pp[G.gCurrMovePos] = 0;
    if (MOVE_IS_PERMANENT(a, G.gCurrMovePos, gDisableStructs[a])) {
      G.gActiveBattler = a;
      BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_PPMOVE1_BATTLE + G.gCurrMovePos, 0, 1, [gBattleMons[a].pp[G.gCurrMovePos]]);
      MarkBattlerForControllerExec(a);
    }
  }
  G.gHitMarker &= ~C.HITMARKER_NO_PPDEDUCT;
  adv(1);
}

export function Cmd_critcalc(): void {
  const a = G.gBattlerAttacker;
  const item = gBattleMons[a].item;
  const holdEffect = item === C.ITEM_ENIGMA_BERRY ? gEnigmaBerries[a].holdEffect : ItemId_GetHoldEffect(item);
  G.gPotentialItemEffectBattler = a;
  const eff = gBattleMoves(G.gCurrentMove).effect;
  let critChance = 2 * ((gBattleMons[a].status2 & C.STATUS2_FOCUS_ENERGY) !== 0 ? 1 : 0)
    + (eff === C.EFFECT_HIGH_CRITICAL ? 1 : 0)
    + (eff === C.EFFECT_SKY_ATTACK ? 1 : 0)
    + (eff === C.EFFECT_BLAZE_KICK ? 1 : 0)
    + (eff === C.EFFECT_POISON_TAIL ? 1 : 0)
    + (holdEffect === C.HOLD_EFFECT_SCOPE_LENS ? 1 : 0)
    + 2 * (holdEffect === C.HOLD_EFFECT_LUCKY_PUNCH && gBattleMons[a].species === C.SPECIES_CHANSEY ? 1 : 0)
    + 2 * (holdEffect === C.HOLD_EFFECT_STICK && gBattleMons[a].species === C.SPECIES_FARFETCHD ? 1 : 0);
  if (critChance >= sCriticalHitChance.length) critChance = sCriticalHitChance.length - 1;
  const t = G.gBattlerTarget;
  if (gBattleMons[t].ability !== C.ABILITY_BATTLE_ARMOR && gBattleMons[t].ability !== C.ABILITY_SHELL_ARMOR
    && !(gStatuses3[a] & C.STATUS3_CANT_SCORE_A_CRIT)
    && !(G.gBattleTypeFlags & C.BATTLE_TYPE_OLD_MAN_TUTORIAL)
    && !(random() % sCriticalHitChance[critChance])
    && (!(G.gBattleTypeFlags & C.BATTLE_TYPE_FIRST_BATTLE) || BtlCtrl_OakOldMan_TestState2Flag(1))
    && !(G.gBattleTypeFlags & C.BATTLE_TYPE_POKEDUDE)) G.gCritMultiplier = 2;
  else G.gCritMultiplier = 1;
  adv(1);
}

export function Cmd_damagecalc(): void {
  const sideStatus = gSideStatuses[GET_BATTLER_SIDE(G.gBattlerTarget)];
  G.gBattleMoveDamage = CalculateBaseDamage(gBattleMons[G.gBattlerAttacker], gBattleMons[G.gBattlerTarget], G.gCurrentMove, sideStatus, G.gDynamicBasePower, gBattleStruct.dynamicMoveType, G.gBattlerAttacker, G.gBattlerTarget);
  G.gBattleMoveDamage = G.gBattleMoveDamage * G.gCritMultiplier * gBattleScripting.dmgMultiplier;
  if (gStatuses3[G.gBattlerAttacker] & C.STATUS3_CHARGED_UP && gBattleMoves(G.gCurrentMove).type === C.TYPE_ELECTRIC) G.gBattleMoveDamage *= 2;
  if (gProtectStructs[G.gBattlerAttacker].helpingHand) G.gBattleMoveDamage = div(G.gBattleMoveDamage * 15, 10);
  adv(1);
}

export function AI_CalcDmg(attacker: number, defender: number): void {
  const sideStatus = gSideStatuses[GET_BATTLER_SIDE(defender)];
  G.gBattleMoveDamage = CalculateBaseDamage(gBattleMons[attacker], gBattleMons[defender], G.gCurrentMove, sideStatus, G.gDynamicBasePower, gBattleStruct.dynamicMoveType, attacker, defender);
  G.gDynamicBasePower = 0;
  G.gBattleMoveDamage = G.gBattleMoveDamage * G.gCritMultiplier * gBattleScripting.dmgMultiplier;
  if (gStatuses3[attacker] & C.STATUS3_CHARGED_UP && gBattleMoves(G.gCurrentMove).type === C.TYPE_ELECTRIC) G.gBattleMoveDamage *= 2;
  if (gProtectStructs[attacker].helpingHand) G.gBattleMoveDamage = div(G.gBattleMoveDamage * 15, 10);
}

function ModulateDmgByType(multiplier: number): void {
  G.gBattleMoveDamage = div(G.gBattleMoveDamage * multiplier, 10);
  if (G.gBattleMoveDamage === 0 && multiplier !== 0) G.gBattleMoveDamage = 1;
  switch (multiplier) {
    case C.TYPE_MUL_NO_EFFECT:
      G.gMoveResultFlags |= C.MOVE_RESULT_DOESNT_AFFECT_FOE;
      G.gMoveResultFlags &= ~C.MOVE_RESULT_NOT_VERY_EFFECTIVE;
      G.gMoveResultFlags &= ~C.MOVE_RESULT_SUPER_EFFECTIVE;
      break;
    case C.TYPE_MUL_NOT_EFFECTIVE:
      if (gBattleMoves(G.gCurrentMove).power && !(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT)) {
        if (G.gMoveResultFlags & C.MOVE_RESULT_SUPER_EFFECTIVE) G.gMoveResultFlags &= ~C.MOVE_RESULT_SUPER_EFFECTIVE;
        else G.gMoveResultFlags |= C.MOVE_RESULT_NOT_VERY_EFFECTIVE;
      }
      break;
    case C.TYPE_MUL_SUPER_EFFECTIVE:
      if (gBattleMoves(G.gCurrentMove).power && !(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT)) {
        if (G.gMoveResultFlags & C.MOVE_RESULT_NOT_VERY_EFFECTIVE) G.gMoveResultFlags &= ~C.MOVE_RESULT_NOT_VERY_EFFECTIVE;
        else G.gMoveResultFlags |= C.MOVE_RESULT_SUPER_EFFECTIVE;
      }
      break;
  }
}

export function Cmd_typecalc(): void {
  let i = 0;
  if (G.gCurrentMove === C.MOVE_STRUGGLE) {
    adv(1);
    return;
  }
  const moveType = GET_MOVE_TYPE(G.gCurrentMove);
  const t = G.gBattlerTarget;
  if (IS_BATTLER_OF_TYPE(G.gBattlerAttacker, moveType)) {
    G.gBattleMoveDamage = G.gBattleMoveDamage * 15;
    G.gBattleMoveDamage = div(G.gBattleMoveDamage, 10);
  }
  if (gBattleMons[t].ability === C.ABILITY_LEVITATE && moveType === C.TYPE_GROUND) {
    G.gLastUsedAbility = gBattleMons[t].ability;
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED | C.MOVE_RESULT_DOESNT_AFFECT_FOE;
    gLastLandedMoves[t] = 0;
    gLastHitByType[t] = 0;
    gBattleCommunication[C.MISS_TYPE] = C.B_MSG_GROUND_MISS;
    RecordAbilityBattle(t, G.gLastUsedAbility);
  } else {
    while (TYPE_EFFECT_ATK_TYPE(i) !== C.TYPE_ENDTABLE) {
      if (TYPE_EFFECT_ATK_TYPE(i) === C.TYPE_FORESIGHT) {
        if (gBattleMons[t].status2 & C.STATUS2_FORESIGHT) break;
        i += 3;
        continue;
      } else if (TYPE_EFFECT_ATK_TYPE(i) === moveType) {
        if (TYPE_EFFECT_DEF_TYPE(i) === gBattleMons[t].type1) ModulateDmgByType(TYPE_EFFECT_MULTIPLIER(i));
        if (TYPE_EFFECT_DEF_TYPE(i) === gBattleMons[t].type2 && gBattleMons[t].type1 !== gBattleMons[t].type2) ModulateDmgByType(TYPE_EFFECT_MULTIPLIER(i));
      }
      i += 3;
    }
  }
  if (gBattleMons[t].ability === C.ABILITY_WONDER_GUARD && AttacksThisTurn(G.gBattlerAttacker, G.gCurrentMove) === 2
    && (!(G.gMoveResultFlags & C.MOVE_RESULT_SUPER_EFFECTIVE) || ((G.gMoveResultFlags & (C.MOVE_RESULT_SUPER_EFFECTIVE | C.MOVE_RESULT_NOT_VERY_EFFECTIVE)) === (C.MOVE_RESULT_SUPER_EFFECTIVE | C.MOVE_RESULT_NOT_VERY_EFFECTIVE)))
    && gBattleMoves(G.gCurrentMove).power) {
    G.gLastUsedAbility = C.ABILITY_WONDER_GUARD;
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gLastLandedMoves[t] = 0;
    gLastHitByType[t] = 0;
    gBattleCommunication[C.MISS_TYPE] = C.B_MSG_AVOIDED_DMG;
    RecordAbilityBattle(t, G.gLastUsedAbility);
  }
  if (G.gMoveResultFlags & C.MOVE_RESULT_DOESNT_AFFECT_FOE) gProtectStructs[G.gBattlerAttacker].targetNotAffected = 1;
  adv(1);
}

function CheckWonderGuardAndLevitate(): void {
  let flags = 0;
  let i = 0;
  if (G.gCurrentMove === C.MOVE_STRUGGLE || !gBattleMoves(G.gCurrentMove).power) return;
  const moveType = GET_MOVE_TYPE(G.gCurrentMove);
  const t = G.gBattlerTarget;
  if (gBattleMons[t].ability === C.ABILITY_LEVITATE && moveType === C.TYPE_GROUND) {
    G.gLastUsedAbility = C.ABILITY_LEVITATE;
    gBattleCommunication[C.MISS_TYPE] = C.B_MSG_GROUND_MISS;
    RecordAbilityBattle(t, C.ABILITY_LEVITATE);
    return;
  }
  while (TYPE_EFFECT_ATK_TYPE(i) !== C.TYPE_ENDTABLE) {
    if (TYPE_EFFECT_ATK_TYPE(i) === C.TYPE_FORESIGHT) {
      if (gBattleMons[t].status2 & C.STATUS2_FORESIGHT) break;
      i += 3;
      continue;
    }
    if (TYPE_EFFECT_ATK_TYPE(i) === moveType) {
      const def = TYPE_EFFECT_DEF_TYPE(i);
      const mul = TYPE_EFFECT_MULTIPLIER(i);
      const t1 = gBattleMons[t].type1;
      const t2 = gBattleMons[t].type2;
      if (def === t1 && mul === C.TYPE_MUL_NO_EFFECT) {
        G.gMoveResultFlags |= C.MOVE_RESULT_DOESNT_AFFECT_FOE;
        gProtectStructs[G.gBattlerAttacker].targetNotAffected = 1;
      }
      if (def === t2 && t1 !== t2 && mul === C.TYPE_MUL_NO_EFFECT) {
        G.gMoveResultFlags |= C.MOVE_RESULT_DOESNT_AFFECT_FOE;
        gProtectStructs[G.gBattlerAttacker].targetNotAffected = 1;
      }
      if (def === t1 && mul === 20) flags |= 1;
      if (def === t2 && t1 !== t2 && mul === C.TYPE_MUL_SUPER_EFFECTIVE) flags |= 1;
      if (def === t1 && mul === 5) flags |= 2;
      if (def === t2 && t1 !== t2 && mul === C.TYPE_MUL_NOT_EFFECTIVE) flags |= 2;
    }
    i += 3;
  }
  if (gBattleMons[t].ability === C.ABILITY_WONDER_GUARD && AttacksThisTurn(G.gBattlerAttacker, G.gCurrentMove) === 2) {
    if (((flags & 2) || !(flags & 1)) && gBattleMoves(G.gCurrentMove).power) {
      G.gLastUsedAbility = C.ABILITY_WONDER_GUARD;
      gBattleCommunication[C.MISS_TYPE] = C.B_MSG_AVOIDED_DMG;
      RecordAbilityBattle(t, C.ABILITY_WONDER_GUARD);
    }
  }
}

function ModulateDmgByType2(multiplier: number, move: number, flags: { v: number }): void {
  G.gBattleMoveDamage = div(G.gBattleMoveDamage * multiplier, 10);
  if (G.gBattleMoveDamage === 0 && multiplier !== 0) G.gBattleMoveDamage = 1;
  switch (multiplier) {
    case C.TYPE_MUL_NO_EFFECT:
      flags.v |= C.MOVE_RESULT_DOESNT_AFFECT_FOE;
      flags.v &= ~C.MOVE_RESULT_NOT_VERY_EFFECTIVE;
      flags.v &= ~C.MOVE_RESULT_SUPER_EFFECTIVE;
      break;
    case C.TYPE_MUL_NOT_EFFECTIVE:
      if (gBattleMoves(move).power && !(flags.v & C.MOVE_RESULT_NO_EFFECT)) {
        if (flags.v & C.MOVE_RESULT_SUPER_EFFECTIVE) flags.v &= ~C.MOVE_RESULT_SUPER_EFFECTIVE;
        else flags.v |= C.MOVE_RESULT_NOT_VERY_EFFECTIVE;
      }
      break;
    case C.TYPE_MUL_SUPER_EFFECTIVE:
      if (gBattleMoves(move).power && !(flags.v & C.MOVE_RESULT_NO_EFFECT)) {
        if (flags.v & C.MOVE_RESULT_NOT_VERY_EFFECTIVE) flags.v &= ~C.MOVE_RESULT_NOT_VERY_EFFECTIVE;
        else flags.v |= C.MOVE_RESULT_SUPER_EFFECTIVE;
      }
      break;
  }
}

export function TypeCalc(move: number, attacker: number, defender: number): number {
  let i = 0;
  const flags = { v: 0 };
  if (move === C.MOVE_STRUGGLE) return 0;
  const moveType = gBattleMoves(move).type;
  if (IS_BATTLER_OF_TYPE(attacker, moveType)) {
    G.gBattleMoveDamage = G.gBattleMoveDamage * 15;
    G.gBattleMoveDamage = div(G.gBattleMoveDamage, 10);
  }
  if (gBattleMons[defender].ability === C.ABILITY_LEVITATE && moveType === C.TYPE_GROUND) {
    flags.v |= C.MOVE_RESULT_MISSED | C.MOVE_RESULT_DOESNT_AFFECT_FOE;
  } else {
    while (TYPE_EFFECT_ATK_TYPE(i) !== C.TYPE_ENDTABLE) {
      if (TYPE_EFFECT_ATK_TYPE(i) === C.TYPE_FORESIGHT) {
        if (gBattleMons[defender].status2 & C.STATUS2_FORESIGHT) break;
        i += 3;
        continue;
      } else if (TYPE_EFFECT_ATK_TYPE(i) === moveType) {
        if (TYPE_EFFECT_DEF_TYPE(i) === gBattleMons[defender].type1) ModulateDmgByType2(TYPE_EFFECT_MULTIPLIER(i), move, flags);
        if (TYPE_EFFECT_DEF_TYPE(i) === gBattleMons[defender].type2 && gBattleMons[defender].type1 !== gBattleMons[defender].type2)
          ModulateDmgByType2(TYPE_EFFECT_MULTIPLIER(i), move, flags);
      }
      i += 3;
    }
  }
  if (gBattleMons[defender].ability === C.ABILITY_WONDER_GUARD && !(flags.v & C.MOVE_RESULT_MISSED)
    && AttacksThisTurn(attacker, move) === 2
    && (!(flags.v & C.MOVE_RESULT_SUPER_EFFECTIVE) || ((flags.v & (C.MOVE_RESULT_SUPER_EFFECTIVE | C.MOVE_RESULT_NOT_VERY_EFFECTIVE)) === (C.MOVE_RESULT_SUPER_EFFECTIVE | C.MOVE_RESULT_NOT_VERY_EFFECTIVE)))
    && gBattleMoves(move).power) flags.v |= C.MOVE_RESULT_MISSED;
  return flags.v & 0xff;
}

export function AI_TypeCalc(move: number, targetSpecies: number, targetAbility: number): number {
  let i = 0;
  const flags = { v: 0 };
  const type1 = rom.species[targetSpecies].types[0];
  const type2 = rom.species[targetSpecies].types[1];
  if (move === C.MOVE_STRUGGLE) return 0;
  const moveType = gBattleMoves(move).type;
  if (targetAbility === C.ABILITY_LEVITATE && moveType === C.TYPE_GROUND) {
    flags.v = C.MOVE_RESULT_MISSED | C.MOVE_RESULT_DOESNT_AFFECT_FOE;
  } else {
    while (TYPE_EFFECT_ATK_TYPE(i) !== C.TYPE_ENDTABLE) {
      if (TYPE_EFFECT_ATK_TYPE(i) === C.TYPE_FORESIGHT) {
        i += 3;
        continue;
      }
      if (TYPE_EFFECT_ATK_TYPE(i) === moveType) {
        if (TYPE_EFFECT_DEF_TYPE(i) === type1) ModulateDmgByType2(TYPE_EFFECT_MULTIPLIER(i), move, flags);
        if (TYPE_EFFECT_DEF_TYPE(i) === type2 && type1 !== type2) ModulateDmgByType2(TYPE_EFFECT_MULTIPLIER(i), move, flags);
      }
      i += 3;
    }
  }
  if (targetAbility === C.ABILITY_WONDER_GUARD
    && (!(flags.v & C.MOVE_RESULT_SUPER_EFFECTIVE) || ((flags.v & (C.MOVE_RESULT_SUPER_EFFECTIVE | C.MOVE_RESULT_NOT_VERY_EFFECTIVE)) === (C.MOVE_RESULT_SUPER_EFFECTIVE | C.MOVE_RESULT_NOT_VERY_EFFECTIVE)))
    && gBattleMoves(move).power) flags.v |= C.MOVE_RESULT_DOESNT_AFFECT_FOE;
  return flags.v & 0xff;
}

function ApplyRandomDmgMultiplier(): void {
  const rand = random();
  const randPercent = 100 - (rand % 16);
  if (G.gBattleMoveDamage !== 0) {
    G.gBattleMoveDamage *= randPercent;
    G.gBattleMoveDamage = div(G.gBattleMoveDamage, 100);
    if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
  }
}

function adjustDamage(checkFalseSwipe: boolean): void {
  ApplyRandomDmgMultiplier();
  const t = G.gBattlerTarget;
  const [holdEffect, param] = holdEffectOf(t);
  G.gPotentialItemEffectBattler = t;
  if (holdEffect === C.HOLD_EFFECT_FOCUS_BAND && (random() % 100) < param) {
    RecordItemEffectBattle(t, holdEffect);
    gSpecialStatuses[t].focusBanded = 1;
  }
  if (!(gBattleMons[t].status2 & C.STATUS2_SUBSTITUTE)
    && ((checkFalseSwipe && gBattleMoves(G.gCurrentMove).effect === C.EFFECT_FALSE_SWIPE) || gProtectStructs[t].endured || gSpecialStatuses[t].focusBanded)
    && gBattleMons[t].hp <= G.gBattleMoveDamage) {
    G.gBattleMoveDamage = gBattleMons[t].hp - 1;
    if (gProtectStructs[t].endured) {
      G.gMoveResultFlags |= C.MOVE_RESULT_FOE_ENDURED;
    } else if (gSpecialStatuses[t].focusBanded) {
      G.gMoveResultFlags |= C.MOVE_RESULT_FOE_HUNG_ON;
      G.gLastUsedItem = gBattleMons[t].item;
    }
  }
  adv(1);
}

export function Cmd_adjustnormaldamage(): void {
  adjustDamage(true);
}

export function Cmd_adjustnormaldamage2(): void {
  adjustDamage(false);
}

export function Cmd_attackanimation(): void {
  if (G.gBattleControllerExecFlags) return;
  if ((G.gHitMarker & C.HITMARKER_NO_ANIMATIONS) && G.gCurrentMove !== C.MOVE_TRANSFORM && G.gCurrentMove !== C.MOVE_SUBSTITUTE) {
    BattleScriptPush(cur() + 1);
    G.gBattlescriptCurrInstr = BS("BattleScript_Pausex20");
    gBattleScripting.animTurn++;
    gBattleScripting.animTargetsHit++;
  } else {
    const target = gBattleMoves(G.gCurrentMove).target;
    if ((target & C.MOVE_TARGET_BOTH || target & C.MOVE_TARGET_FOES_AND_ALLY || target & C.MOVE_TARGET_DEPENDS) && gBattleScripting.animTargetsHit) {
      adv(1);
      return;
    }
    if (!(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT)) {
      G.gActiveBattler = G.gBattlerAttacker;
      BtlController_EmitMoveAnimation(BUFFER_A, G.gCurrentMove, gBattleScripting.animTurn, G.gBattleMovePower, G.gBattleMoveDamage, gBattleMons[G.gBattlerAttacker].friendship, gDisableStructs[G.gBattlerAttacker]);
      gBattleScripting.animTurn++;
      gBattleScripting.animTargetsHit++;
      MarkBattlerForControllerExec(G.gBattlerAttacker);
      adv(1);
    } else {
      BattleScriptPush(cur() + 1);
      G.gBattlescriptCurrInstr = BS("BattleScript_Pausex20");
    }
  }
}

export function Cmd_waitanimation(): void {
  if (G.gBattleControllerExecFlags === 0) adv(1);
}

export function Cmd_healthbarupdate(): void {
  if (G.gBattleControllerExecFlags) return;
  if (!(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT)) {
    G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
    const b = G.gActiveBattler;
    if (gBattleMons[b].status2 & C.STATUS2_SUBSTITUTE && gDisableStructs[b].substituteHP && !(G.gHitMarker & C.HITMARKER_IGNORE_SUBSTITUTE)) {
      PrepareStringBattle(C.STRINGID_SUBSTITUTEDAMAGED, b);
    } else {
      const currDmg = G.gBattleMoveDamage;
      const healthValue = ((currDmg <= 10000 ? currDmg : 10000) << 16) >> 16;
      BtlController_EmitHealthBarUpdate(BUFFER_A, healthValue);
      MarkBattlerForControllerExec(b);
      if (GetBattlerSide(b) === C.B_SIDE_PLAYER && G.gBattleMoveDamage > 0) gBattleResults.playerMonWasDamaged = 1;
    }
  }
  adv(2);
}

export function Cmd_datahpupdate(): void {
  if (G.gBattleControllerExecFlags) return;
  let moveType: number;
  if (gBattleStruct.dynamicMoveType === 0) moveType = gBattleMoves(G.gCurrentMove).type;
  else if (!(gBattleStruct.dynamicMoveType & F_DYNAMIC_TYPE_1)) moveType = gBattleStruct.dynamicMoveType & DYNAMIC_TYPE_MASK;
  else moveType = gBattleMoves(G.gCurrentMove).type;
  const arg = r8(cur() + 1);
  if (!(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT)) {
    G.gActiveBattler = GetBattlerForBattleScript(arg);
    const b = G.gActiveBattler;
    if (gBattleMons[b].status2 & C.STATUS2_SUBSTITUTE && gDisableStructs[b].substituteHP && !(G.gHitMarker & C.HITMARKER_IGNORE_SUBSTITUTE)) {
      if (gDisableStructs[b].substituteHP >= G.gBattleMoveDamage) {
        if (gSpecialStatuses[b].dmg === 0) gSpecialStatuses[b].dmg = G.gBattleMoveDamage;
        gDisableStructs[b].substituteHP -= G.gBattleMoveDamage;
        G.gHpDealt = G.gBattleMoveDamage;
      } else {
        if (gSpecialStatuses[b].dmg === 0) gSpecialStatuses[b].dmg = gDisableStructs[b].substituteHP;
        G.gHpDealt = gDisableStructs[b].substituteHP;
        gDisableStructs[b].substituteHP = 0;
      }
      if (gDisableStructs[b].substituteHP === 0) {
        adv(2);
        BattleScriptPushCursor();
        G.gBattlescriptCurrInstr = BS("BattleScript_SubstituteFade");
        return;
      }
    } else {
      G.gHitMarker &= ~C.HITMARKER_IGNORE_SUBSTITUTE;
      if (G.gBattleMoveDamage < 0) {
        gBattleMons[b].hp -= G.gBattleMoveDamage;
        if (gBattleMons[b].hp > gBattleMons[b].maxHP) gBattleMons[b].hp = gBattleMons[b].maxHP;
      } else {
        if (G.gHitMarker & C.HITMARKER_SKIP_DMG_TRACK) {
          G.gHitMarker &= ~C.HITMARKER_SKIP_DMG_TRACK;
        } else {
          gTakenDmg[b] += G.gBattleMoveDamage;
          gTakenDmgByBattler[b] = arg === C.BS_TARGET ? G.gBattlerAttacker : G.gBattlerTarget;
        }
        if (gBattleMons[b].hp > G.gBattleMoveDamage) {
          gBattleMons[b].hp -= G.gBattleMoveDamage;
          G.gHpDealt = G.gBattleMoveDamage;
        } else {
          G.gHpDealt = gBattleMons[b].hp;
          gBattleMons[b].hp = 0;
        }
        if (!gSpecialStatuses[b].dmg && !(G.gHitMarker & C.HITMARKER_PASSIVE_DAMAGE)) gSpecialStatuses[b].dmg = G.gHpDealt;
        if (IS_TYPE_PHYSICAL(moveType) && !(G.gHitMarker & C.HITMARKER_PASSIVE_DAMAGE) && G.gCurrentMove !== C.MOVE_PAIN_SPLIT) {
          gProtectStructs[b].physicalDmg = G.gHpDealt;
          gSpecialStatuses[b].physicalDmg = G.gHpDealt;
          const id = arg === C.BS_TARGET ? G.gBattlerAttacker : G.gBattlerTarget;
          gProtectStructs[b].physicalBattlerId = id;
          gSpecialStatuses[b].physicalBattlerId = id;
        } else if (!IS_TYPE_PHYSICAL(moveType) && !(G.gHitMarker & C.HITMARKER_PASSIVE_DAMAGE)) {
          gProtectStructs[b].specialDmg = G.gHpDealt;
          gSpecialStatuses[b].specialDmg = G.gHpDealt;
          const id = arg === C.BS_TARGET ? G.gBattlerAttacker : G.gBattlerTarget;
          gProtectStructs[b].specialBattlerId = id;
          gSpecialStatuses[b].specialBattlerId = id;
        }
      }
      G.gHitMarker &= ~C.HITMARKER_PASSIVE_DAMAGE;
      BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_HP_BATTLE, 0, 2, u16bytes(gBattleMons[b].hp));
      MarkBattlerForControllerExec(b);
    }
  } else {
    G.gActiveBattler = GetBattlerForBattleScript(arg);
    if (gSpecialStatuses[G.gActiveBattler].dmg === 0) gSpecialStatuses[G.gActiveBattler].dmg = 0xffff;
  }
  adv(2);
}

export function u16bytes(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff];
}

export function u32bytes(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

export function Cmd_critmessage(): void {
  if (G.gBattleControllerExecFlags === 0) {
    if (G.gCritMultiplier === 2 && !(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT)) {
      PrepareStringBattle(C.STRINGID_CRITICALHIT, G.gBattlerAttacker);
      gBattleCommunication[C.MSG_DISPLAY] = 1;
    }
    adv(1);
  }
}

export function Cmd_effectivenesssound(): void {
  if (G.gBattleControllerExecFlags) return;
  G.gActiveBattler = G.gBattlerTarget;
  if (!(G.gMoveResultFlags & C.MOVE_RESULT_MISSED)) {
    const f = G.gMoveResultFlags & ~C.MOVE_RESULT_MISSED & 0xff;
    switch (f) {
      case C.MOVE_RESULT_SUPER_EFFECTIVE:
        BtlController_EmitPlaySE(BUFFER_A, C.SE_SUPER_EFFECTIVE);
        MarkBattlerForControllerExec(G.gActiveBattler);
        break;
      case C.MOVE_RESULT_NOT_VERY_EFFECTIVE:
        BtlController_EmitPlaySE(BUFFER_A, C.SE_NOT_EFFECTIVE);
        MarkBattlerForControllerExec(G.gActiveBattler);
        break;
      case C.MOVE_RESULT_DOESNT_AFFECT_FOE:
      case C.MOVE_RESULT_FAILED:
        break;
      default:
        if (G.gMoveResultFlags & C.MOVE_RESULT_SUPER_EFFECTIVE) {
          BtlController_EmitPlaySE(BUFFER_A, C.SE_SUPER_EFFECTIVE);
          MarkBattlerForControllerExec(G.gActiveBattler);
        } else if (G.gMoveResultFlags & C.MOVE_RESULT_NOT_VERY_EFFECTIVE) {
          BtlController_EmitPlaySE(BUFFER_A, C.SE_NOT_EFFECTIVE);
          MarkBattlerForControllerExec(G.gActiveBattler);
        } else if (!(G.gMoveResultFlags & (C.MOVE_RESULT_DOESNT_AFFECT_FOE | C.MOVE_RESULT_FAILED))) {
          BtlController_EmitPlaySE(BUFFER_A, C.SE_EFFECTIVE);
          MarkBattlerForControllerExec(G.gActiveBattler);
        }
    }
  }
  adv(1);
}

export function Cmd_resultmessage(): void {
  let stringId = 0;
  if (G.gBattleControllerExecFlags) return;
  if (G.gMoveResultFlags & C.MOVE_RESULT_MISSED && (!(G.gMoveResultFlags & C.MOVE_RESULT_DOESNT_AFFECT_FOE) || gBattleCommunication[C.MISS_TYPE] > C.B_MSG_AVOIDED_ATK)) {
    stringId = gMissStringIds()[gBattleCommunication[C.MISS_TYPE]];
    gBattleCommunication[C.MSG_DISPLAY] = 1;
  } else {
    gBattleCommunication[C.MSG_DISPLAY] = 1;
    switch (G.gMoveResultFlags & ~C.MOVE_RESULT_MISSED & 0xff) {
      case C.MOVE_RESULT_SUPER_EFFECTIVE: stringId = C.STRINGID_SUPEREFFECTIVE; break;
      case C.MOVE_RESULT_NOT_VERY_EFFECTIVE: stringId = C.STRINGID_NOTVERYEFFECTIVE; break;
      case C.MOVE_RESULT_ONE_HIT_KO: stringId = C.STRINGID_ONEHITKO; break;
      case C.MOVE_RESULT_FOE_ENDURED: stringId = C.STRINGID_PKMNENDUREDHIT; break;
      case C.MOVE_RESULT_FAILED: stringId = C.STRINGID_BUTITFAILED; break;
      case C.MOVE_RESULT_DOESNT_AFFECT_FOE: stringId = C.STRINGID_ITDOESNTAFFECT; break;
      case C.MOVE_RESULT_FOE_HUNG_ON:
        G.gLastUsedItem = gBattleMons[G.gBattlerTarget].item;
        G.gPotentialItemEffectBattler = G.gBattlerTarget;
        G.gMoveResultFlags &= ~(C.MOVE_RESULT_FOE_ENDURED | C.MOVE_RESULT_FOE_HUNG_ON);
        BattleScriptPushCursor();
        G.gBattlescriptCurrInstr = BS("BattleScript_FocusBandActivates");
        return;
      default:
        if (G.gMoveResultFlags & C.MOVE_RESULT_DOESNT_AFFECT_FOE) {
          stringId = C.STRINGID_ITDOESNTAFFECT;
        } else if (G.gMoveResultFlags & C.MOVE_RESULT_ONE_HIT_KO) {
          G.gMoveResultFlags &= ~C.MOVE_RESULT_ONE_HIT_KO;
          G.gMoveResultFlags &= ~C.MOVE_RESULT_SUPER_EFFECTIVE;
          G.gMoveResultFlags &= ~C.MOVE_RESULT_NOT_VERY_EFFECTIVE;
          BattleScriptPushCursor();
          G.gBattlescriptCurrInstr = BS("BattleScript_OneHitKOMsg");
          return;
        } else if (G.gMoveResultFlags & C.MOVE_RESULT_FOE_ENDURED) {
          G.gMoveResultFlags &= ~(C.MOVE_RESULT_FOE_ENDURED | C.MOVE_RESULT_FOE_HUNG_ON);
          BattleScriptPushCursor();
          G.gBattlescriptCurrInstr = BS("BattleScript_EnduredMsg");
          return;
        } else if (G.gMoveResultFlags & C.MOVE_RESULT_FOE_HUNG_ON) {
          G.gLastUsedItem = gBattleMons[G.gBattlerTarget].item;
          G.gPotentialItemEffectBattler = G.gBattlerTarget;
          G.gMoveResultFlags &= ~(C.MOVE_RESULT_FOE_ENDURED | C.MOVE_RESULT_FOE_HUNG_ON);
          BattleScriptPushCursor();
          G.gBattlescriptCurrInstr = BS("BattleScript_FocusBandActivates");
          return;
        } else if (G.gMoveResultFlags & C.MOVE_RESULT_FAILED) {
          stringId = C.STRINGID_BUTITFAILED;
        } else {
          gBattleCommunication[C.MSG_DISPLAY] = 0;
        }
    }
  }
  if (stringId) PrepareStringBattle(stringId, G.gBattlerAttacker);
  adv(1);
}

export function Cmd_printstring(): void {
  if (G.gBattleControllerExecFlags === 0) {
    const v = r16(cur() + 1);
    PrepareStringBattle(v, G.gBattlerAttacker);
    adv(3);
    gBattleCommunication[C.MSG_DISPLAY] = 1;
  }
}

export function Cmd_printselectionstring(): void {
  G.gActiveBattler = G.gBattlerAttacker;
  BtlController_EmitPrintSelectionString(BUFFER_A, r16(cur() + 1));
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(3);
  gBattleCommunication[C.MSG_DISPLAY] = 1;
}

export function Cmd_waitmessage(): void {
  if (G.gBattleControllerExecFlags === 0) {
    if (!gBattleCommunication[C.MSG_DISPLAY]) {
      adv(3);
    } else {
      const toWait = r16(cur() + 1);
      if (++G.gPauseCounterBattle >= toWait) {
        G.gPauseCounterBattle = 0;
        adv(3);
        gBattleCommunication[C.MSG_DISPLAY] = 0;
      }
    }
  }
}

export function Cmd_printfromtable(): void {
  if (G.gBattleControllerExecFlags === 0) {
    const id = tableU16(r32(cur() + 1), gBattleCommunication[C.MULTISTRING_CHOOSER]);
    PrepareStringBattle(id, G.gBattlerAttacker);
    adv(5);
    gBattleCommunication[C.MSG_DISPLAY] = 1;
  }
}

export function Cmd_printselectionstringfromtable(): void {
  if (G.gBattleControllerExecFlags === 0) {
    const id = tableU16(r32(cur() + 1), gBattleCommunication[C.MULTISTRING_CHOOSER]);
    G.gActiveBattler = G.gBattlerAttacker;
    BtlController_EmitPrintSelectionString(BUFFER_A, id);
    MarkBattlerForControllerExec(G.gActiveBattler);
    adv(5);
    gBattleCommunication[C.MSG_DISPLAY] = 1;
  }
}

export function GetBattlerTurnOrderNum(battlerId: number): number {
  let i = 0;
  for (; i < G.gBattlersCount; i++) if (gBattlerByTurnOrder[i] === battlerId) break;
  return i;
}

function INCREMENT_RETURN(): void {
  adv(1);
}

function preventionScript(ability: number, script: string): void {
  G.gLastUsedAbility = ability;
  RecordAbilityBattle(G.gEffectBattler, ability);
  BattleScriptPush(cur() + 1);
  G.gBattlescriptCurrInstr = BS(script);
  if (G.gHitMarker & C.HITMARKER_STATUS_ABILITY_EFFECT) {
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_ABILITY_PREVENTS_ABILITY_STATUS;
    G.gHitMarker &= ~C.HITMARKER_STATUS_ABILITY_EFFECT;
  } else {
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_ABILITY_PREVENTS_MOVE_STATUS;
  }
}

export function SetMoveEffect(primary: boolean, certain: number): void {
  let statusChanged = false;
  let affectsUser = 0;
  let noSunCanFreeze = true;
  const MEB = C.MOVE_EFFECT_BYTE;
  if (gBattleCommunication[MEB] & C.MOVE_EFFECT_AFFECTS_USER) {
    G.gEffectBattler = G.gBattlerAttacker;
    gBattleCommunication[MEB] &= ~C.MOVE_EFFECT_AFFECTS_USER;
    affectsUser = C.MOVE_EFFECT_AFFECTS_USER;
    gBattleScripting.battler = G.gBattlerTarget;
  } else {
    G.gEffectBattler = G.gBattlerTarget;
    gBattleScripting.battler = G.gBattlerAttacker;
  }
  const e = G.gEffectBattler;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_POKEDUDE && gBattleCommunication[MEB] !== 1 && GetBattlerSide(e) === C.B_SIDE_OPPONENT) return INCREMENT_RETURN();
  if (gBattleMons[e].ability === C.ABILITY_SHIELD_DUST && !(G.gHitMarker & C.HITMARKER_STATUS_ABILITY_EFFECT) && !primary && gBattleCommunication[MEB] <= 9) return INCREMENT_RETURN();
  if (gSideStatuses[GET_BATTLER_SIDE(e)] & C.SIDE_STATUS_SAFEGUARD && !(G.gHitMarker & C.HITMARKER_STATUS_ABILITY_EFFECT) && !primary && gBattleCommunication[MEB] <= 7) return INCREMENT_RETURN();
  if (gBattleMons[e].hp === 0 && gBattleCommunication[MEB] !== C.MOVE_EFFECT_PAYDAY && gBattleCommunication[MEB] !== C.MOVE_EFFECT_STEAL_ITEM) return INCREMENT_RETURN();
  if (gBattleMons[e].status2 & C.STATUS2_SUBSTITUTE && affectsUser !== C.MOVE_EFFECT_AFFECTS_USER) return INCREMENT_RETURN();
  const isPrimaryOrCertain = primary === true || certain === C.MOVE_EFFECT_CERTAIN;
  if (gBattleCommunication[MEB] <= C.PRIMARY_STATUS_MOVE_EFFECT) {
    switch (sStatusFlagsForMoveEffects[gBattleCommunication[MEB]]) {
      case C.STATUS1_SLEEP:
        if (gBattleMons[e].ability !== C.ABILITY_SOUNDPROOF) {
          for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount && !(gBattleMons[G.gActiveBattler].status2 & C.STATUS2_UPROAR); G.gActiveBattler++) { /* find uproar */ }
        } else {
          G.gActiveBattler = G.gBattlersCount;
        }
        if (gBattleMons[e].status1) break;
        if (G.gActiveBattler !== G.gBattlersCount) break;
        if (gBattleMons[e].ability === C.ABILITY_VITAL_SPIRIT) break;
        if (gBattleMons[e].ability === C.ABILITY_INSOMNIA) break;
        CancelMultiTurnMoves(e);
        statusChanged = true;
        break;
      case C.STATUS1_POISON:
        if (gBattleMons[e].ability === C.ABILITY_IMMUNITY && isPrimaryOrCertain) {
          preventionScript(C.ABILITY_IMMUNITY, "BattleScript_PSNPrevention");
          return;
        }
        if ((IS_BATTLER_OF_TYPE(e, C.TYPE_POISON) || IS_BATTLER_OF_TYPE(e, C.TYPE_STEEL)) && (G.gHitMarker & C.HITMARKER_STATUS_ABILITY_EFFECT) && isPrimaryOrCertain) {
          BattleScriptPush(cur() + 1);
          G.gBattlescriptCurrInstr = BS("BattleScript_PSNPrevention");
          gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STATUS_HAD_NO_EFFECT;
          return;
        }
        if (IS_BATTLER_OF_TYPE(e, C.TYPE_POISON)) break;
        if (IS_BATTLER_OF_TYPE(e, C.TYPE_STEEL)) break;
        if (gBattleMons[e].status1) break;
        if (gBattleMons[e].ability === C.ABILITY_IMMUNITY) break;
        statusChanged = true;
        break;
      case C.STATUS1_BURN:
        if (gBattleMons[e].ability === C.ABILITY_WATER_VEIL && isPrimaryOrCertain) {
          preventionScript(C.ABILITY_WATER_VEIL, "BattleScript_BRNPrevention");
          return;
        }
        if (IS_BATTLER_OF_TYPE(e, C.TYPE_FIRE) && (G.gHitMarker & C.HITMARKER_STATUS_ABILITY_EFFECT) && isPrimaryOrCertain) {
          BattleScriptPush(cur() + 1);
          G.gBattlescriptCurrInstr = BS("BattleScript_BRNPrevention");
          gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STATUS_HAD_NO_EFFECT;
          return;
        }
        if (IS_BATTLER_OF_TYPE(e, C.TYPE_FIRE)) break;
        if (gBattleMons[e].ability === C.ABILITY_WATER_VEIL) break;
        if (gBattleMons[e].status1) break;
        statusChanged = true;
        break;
      case C.STATUS1_FREEZE:
        if (WEATHER_HAS_EFFECT() && G.gBattleWeather & C.B_WEATHER_SUN) noSunCanFreeze = false;
        if (IS_BATTLER_OF_TYPE(e, C.TYPE_ICE)) break;
        if (gBattleMons[e].status1) break;
        if (!noSunCanFreeze) break;
        if (gBattleMons[e].ability === C.ABILITY_MAGMA_ARMOR) break;
        CancelMultiTurnMoves(e);
        statusChanged = true;
        break;
      case C.STATUS1_PARALYSIS:
        if (gBattleMons[e].ability === C.ABILITY_LIMBER) {
          if (isPrimaryOrCertain) {
            preventionScript(C.ABILITY_LIMBER, "BattleScript_PRLZPrevention");
            return;
          }
          break;
        }
        if (gBattleMons[e].status1) break;
        statusChanged = true;
        break;
      case C.STATUS1_TOXIC_POISON:
        if (gBattleMons[e].ability === C.ABILITY_IMMUNITY && isPrimaryOrCertain) {
          preventionScript(C.ABILITY_IMMUNITY, "BattleScript_PSNPrevention");
          return;
        }
        if ((IS_BATTLER_OF_TYPE(e, C.TYPE_POISON) || IS_BATTLER_OF_TYPE(e, C.TYPE_STEEL)) && (G.gHitMarker & C.HITMARKER_STATUS_ABILITY_EFFECT) && isPrimaryOrCertain) {
          BattleScriptPush(cur() + 1);
          G.gBattlescriptCurrInstr = BS("BattleScript_PSNPrevention");
          gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STATUS_HAD_NO_EFFECT;
          return;
        }
        if (gBattleMons[e].status1) break;
        if (!IS_BATTLER_OF_TYPE(e, C.TYPE_POISON) && !IS_BATTLER_OF_TYPE(e, C.TYPE_STEEL)) {
          if (gBattleMons[e].ability === C.ABILITY_IMMUNITY) break;
          gBattleMons[e].status1 &= ~C.STATUS1_TOXIC_POISON;
          gBattleMons[e].status1 &= ~C.STATUS1_POISON;
          statusChanged = true;
          break;
        } else {
          G.gMoveResultFlags |= C.MOVE_RESULT_DOESNT_AFFECT_FOE;
        }
        break;
    }
    if (statusChanged) {
      BattleScriptPush(cur() + 1);
      if (sStatusFlagsForMoveEffects[gBattleCommunication[MEB]] === C.STATUS1_SLEEP) gBattleMons[e].status1 |= STATUS1_SLEEP_TURN((random() & 3) + 2);
      else gBattleMons[e].status1 |= sStatusFlagsForMoveEffects[gBattleCommunication[MEB]];
      G.gBattlescriptCurrInstr = sMoveEffectBS_Ptrs(gBattleCommunication[MEB]);
      G.gActiveBattler = e;
      BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_STATUS_BATTLE, 0, 4, u32bytes(gBattleMons[e].status1));
      MarkBattlerForControllerExec(G.gActiveBattler);
      if (G.gHitMarker & C.HITMARKER_STATUS_ABILITY_EFFECT) {
        gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STATUSED_BY_ABILITY;
        G.gHitMarker &= ~C.HITMARKER_STATUS_ABILITY_EFFECT;
      } else {
        gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STATUSED;
      }
      const m = gBattleCommunication[MEB];
      if (m === C.MOVE_EFFECT_POISON || m === C.MOVE_EFFECT_TOXIC || m === C.MOVE_EFFECT_PARALYSIS || m === C.MOVE_EFFECT_BURN) {
        gBattleStruct.synchronizeMoveEffect = m;
        G.gHitMarker |= C.HITMARKER_SYNCHRONISE_EFFECT;
      }
    } else {
      adv(1);
    }
    return;
  }
  if (gBattleMons[e].status2 & sStatusFlagsForMoveEffects[gBattleCommunication[MEB]]) {
    adv(1);
    return;
  }
  const effect = gBattleCommunication[MEB];
  switch (effect) {
    case C.MOVE_EFFECT_CONFUSION:
      if (gBattleMons[e].ability === C.ABILITY_OWN_TEMPO || gBattleMons[e].status2 & C.STATUS2_CONFUSION) {
        adv(1);
      } else {
        gBattleMons[e].status2 |= STATUS2_CONFUSION_TURN((random() % 4) + 2);
        BattleScriptPush(cur() + 1);
        G.gBattlescriptCurrInstr = sMoveEffectBS_Ptrs(effect);
      }
      break;
    case C.MOVE_EFFECT_FLINCH:
      if (gBattleMons[e].ability === C.ABILITY_INNER_FOCUS) {
        if (isPrimaryOrCertain) {
          G.gLastUsedAbility = C.ABILITY_INNER_FOCUS;
          RecordAbilityBattle(e, C.ABILITY_INNER_FOCUS);
          G.gBattlescriptCurrInstr = BS("BattleScript_FlinchPrevention");
        } else {
          adv(1);
        }
      } else {
        if (GetBattlerTurnOrderNum(e) > G.gCurrentTurnActionNumber) gBattleMons[e].status2 |= sStatusFlagsForMoveEffects[effect];
        adv(1);
      }
      break;
    case C.MOVE_EFFECT_UPROAR:
      if (!(gBattleMons[e].status2 & C.STATUS2_UPROAR)) {
        gBattleMons[e].status2 |= C.STATUS2_MULTIPLETURNS;
        gLockedMoves[e] = G.gCurrentMove;
        gBattleMons[e].status2 |= STATUS2_UPROAR_TURN((random() & 3) + 2);
        BattleScriptPush(cur() + 1);
        G.gBattlescriptCurrInstr = sMoveEffectBS_Ptrs(effect);
      } else {
        adv(1);
      }
      break;
    case C.MOVE_EFFECT_PAYDAY:
      if (GET_BATTLER_SIDE(G.gBattlerAttacker) === C.B_SIDE_PLAYER) {
        const payday = G.gPaydayMoney;
        G.gPaydayMoney = (G.gPaydayMoney + gBattleMons[G.gBattlerAttacker].level * 5) & 0xffff;
        if (payday > G.gPaydayMoney) G.gPaydayMoney = 0xffff;
      }
      BattleScriptPush(cur() + 1);
      G.gBattlescriptCurrInstr = sMoveEffectBS_Ptrs(effect);
      break;
    case C.MOVE_EFFECT_TRI_ATTACK:
      if (gBattleMons[e].status1) {
        adv(1);
      } else {
        gBattleCommunication[MEB] = (random() % 3) + 3;
        SetMoveEffect(false, 0);
      }
      break;
    case C.MOVE_EFFECT_CHARGING:
      gBattleMons[e].status2 |= C.STATUS2_MULTIPLETURNS;
      gLockedMoves[e] = G.gCurrentMove;
      gProtectStructs[e].chargingTurn = 1;
      adv(1);
      break;
    case C.MOVE_EFFECT_WRAP:
      if (gBattleMons[e].status2 & C.STATUS2_WRAPPED) {
        adv(1);
      } else {
        gBattleMons[e].status2 |= STATUS2_WRAPPED_TURN((random() & 3) + 3);
        gBattleStruct.wrappedMove[e * 2 + 0] = G.gCurrentMove & 0xff;
        gBattleStruct.wrappedMove[e * 2 + 1] = (G.gCurrentMove >> 8) & 0xff;
        gBattleStruct.wrappedBy[e] = G.gBattlerAttacker;
        BattleScriptPush(cur() + 1);
        G.gBattlescriptCurrInstr = sMoveEffectBS_Ptrs(effect);
        const trapping = gTrappingMoves();
        for (gBattleCommunication[C.MULTISTRING_CHOOSER] = 0; ; gBattleCommunication[C.MULTISTRING_CHOOSER]++) {
          if (gBattleCommunication[C.MULTISTRING_CHOOSER] >= C.NUM_TRAPPING_MOVES - 1) break;
          if (trapping[gBattleCommunication[C.MULTISTRING_CHOOSER]] === G.gCurrentMove) break;
        }
      }
      break;
    case C.MOVE_EFFECT_RECOIL_25:
      G.gBattleMoveDamage = div(G.gHpDealt, 4);
      if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
      BattleScriptPush(cur() + 1);
      G.gBattlescriptCurrInstr = sMoveEffectBS_Ptrs(effect);
      break;
    case C.MOVE_EFFECT_ATK_PLUS_1: case C.MOVE_EFFECT_DEF_PLUS_1: case C.MOVE_EFFECT_SPD_PLUS_1: case C.MOVE_EFFECT_SP_ATK_PLUS_1:
    case C.MOVE_EFFECT_SP_DEF_PLUS_1: case C.MOVE_EFFECT_ACC_PLUS_1: case C.MOVE_EFFECT_EVS_PLUS_1:
      statEffect(SET_STAT_BUFF_VALUE(1), effect - C.MOVE_EFFECT_ATK_PLUS_1 + 1, affectsUser, "BattleScript_StatUp");
      break;
    case C.MOVE_EFFECT_ATK_MINUS_1: case C.MOVE_EFFECT_DEF_MINUS_1: case C.MOVE_EFFECT_SPD_MINUS_1: case C.MOVE_EFFECT_SP_ATK_MINUS_1:
    case C.MOVE_EFFECT_SP_DEF_MINUS_1: case C.MOVE_EFFECT_ACC_MINUS_1: case C.MOVE_EFFECT_EVS_MINUS_1:
      statEffect(SET_STAT_BUFF_VALUE(1) | STAT_BUFF_NEGATIVE, effect - C.MOVE_EFFECT_ATK_MINUS_1 + 1, affectsUser, "BattleScript_StatDown");
      break;
    case C.MOVE_EFFECT_ATK_PLUS_2: case C.MOVE_EFFECT_DEF_PLUS_2: case C.MOVE_EFFECT_SPD_PLUS_2: case C.MOVE_EFFECT_SP_ATK_PLUS_2:
    case C.MOVE_EFFECT_SP_DEF_PLUS_2: case C.MOVE_EFFECT_ACC_PLUS_2: case C.MOVE_EFFECT_EVS_PLUS_2:
      statEffect(SET_STAT_BUFF_VALUE(2), effect - C.MOVE_EFFECT_ATK_PLUS_2 + 1, affectsUser, "BattleScript_StatUp");
      break;
    case C.MOVE_EFFECT_ATK_MINUS_2: case C.MOVE_EFFECT_DEF_MINUS_2: case C.MOVE_EFFECT_SPD_MINUS_2: case C.MOVE_EFFECT_SP_ATK_MINUS_2:
    case C.MOVE_EFFECT_SP_DEF_MINUS_2: case C.MOVE_EFFECT_ACC_MINUS_2: case C.MOVE_EFFECT_EVS_MINUS_2:
      statEffect(SET_STAT_BUFF_VALUE(2) | STAT_BUFF_NEGATIVE, effect - C.MOVE_EFFECT_ATK_MINUS_2 + 1, affectsUser, "BattleScript_StatDown");
      break;
    case C.MOVE_EFFECT_RECHARGE:
      gBattleMons[e].status2 |= C.STATUS2_RECHARGE;
      gDisableStructs[e].rechargeTimer = 2;
      gLockedMoves[e] = G.gCurrentMove;
      adv(1);
      break;
    case C.MOVE_EFFECT_RAGE:
      gBattleMons[G.gBattlerAttacker].status2 |= C.STATUS2_RAGE;
      adv(1);
      break;
    case C.MOVE_EFFECT_STEAL_ITEM: {
      if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER_TOWER) {
        adv(1);
        break;
      }
      const side = GetBattlerSide(G.gBattlerAttacker);
      const noSpecial = !(G.gBattleTypeFlags & (C.BATTLE_TYPE_EREADER_TRAINER | C.BATTLE_TYPE_BATTLE_TOWER | C.BATTLE_TYPE_LINK)) && G.gTrainerBattleOpponent_A !== C.TRAINER_SECRET_BASE;
      const t = G.gBattlerTarget;
      if (GetBattlerSide(G.gBattlerAttacker) === C.B_SIDE_OPPONENT && noSpecial) {
        adv(1);
      } else if (noSpecial && (gWishFutureKnock.knockedOffMons[side] & gBitTable[gBattlerPartyIndexes[G.gBattlerAttacker]])) {
        adv(1);
      } else if (gBattleMons[t].item && gBattleMons[t].ability === C.ABILITY_STICKY_HOLD) {
        G.gBattlescriptCurrInstr = BS("BattleScript_StickyHoldActivates");
        G.gLastUsedAbility = gBattleMons[t].ability;
        RecordAbilityBattle(t, G.gLastUsedAbility);
      } else if (gBattleMons[G.gBattlerAttacker].item !== C.ITEM_NONE || gBattleMons[t].item === C.ITEM_ENIGMA_BERRY
        || IS_ITEM_MAIL(gBattleMons[t].item) || gBattleMons[t].item === C.ITEM_NONE) {
        adv(1);
      } else {
        const item = gBattleMons[t].item;
        gBattleStruct.changedItems[G.gBattlerAttacker] = item;
        G.gLastUsedItem = item;
        gBattleMons[t].item = C.ITEM_NONE;
        G.gActiveBattler = G.gBattlerAttacker;
        BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_HELDITEM_BATTLE, 0, 2, u16bytes(G.gLastUsedItem));
        MarkBattlerForControllerExec(G.gBattlerAttacker);
        G.gActiveBattler = t;
        BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_HELDITEM_BATTLE, 0, 2, u16bytes(gBattleMons[t].item));
        MarkBattlerForControllerExec(t);
        BattleScriptPush(cur() + 1);
        G.gBattlescriptCurrInstr = BS("BattleScript_ItemSteal");
        gBattleStruct.choicedMove[t] = 0;
      }
      break;
    }
    case C.MOVE_EFFECT_PREVENT_ESCAPE:
      gBattleMons[G.gBattlerTarget].status2 |= C.STATUS2_ESCAPE_PREVENTION;
      gDisableStructs[G.gBattlerTarget].battlerPreventingEscape = G.gBattlerAttacker;
      adv(1);
      break;
    case C.MOVE_EFFECT_NIGHTMARE:
      gBattleMons[G.gBattlerTarget].status2 |= C.STATUS2_NIGHTMARE;
      adv(1);
      break;
    case C.MOVE_EFFECT_ALL_STATS_UP:
      BattleScriptPush(cur() + 1);
      G.gBattlescriptCurrInstr = BS("BattleScript_AllStatsUp");
      break;
    case C.MOVE_EFFECT_RAPIDSPIN:
      BattleScriptPush(cur() + 1);
      G.gBattlescriptCurrInstr = BS("BattleScript_RapidSpinAway");
      break;
    case C.MOVE_EFFECT_REMOVE_PARALYSIS:
      if (!(gBattleMons[G.gBattlerTarget].status1 & C.STATUS1_PARALYSIS)) {
        adv(1);
      } else {
        gBattleMons[G.gBattlerTarget].status1 &= ~C.STATUS1_PARALYSIS;
        G.gActiveBattler = G.gBattlerTarget;
        BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_STATUS_BATTLE, 0, 4, u32bytes(gBattleMons[G.gActiveBattler].status1));
        MarkBattlerForControllerExec(G.gActiveBattler);
        BattleScriptPush(cur() + 1);
        G.gBattlescriptCurrInstr = BS("BattleScript_TargetPRLZHeal");
      }
      break;
    case C.MOVE_EFFECT_ATK_DEF_DOWN:
      BattleScriptPush(cur() + 1);
      G.gBattlescriptCurrInstr = BS("BattleScript_AtkDefDown");
      break;
    case C.MOVE_EFFECT_RECOIL_33:
      G.gBattleMoveDamage = div(G.gHpDealt, 3);
      if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
      BattleScriptPush(cur() + 1);
      G.gBattlescriptCurrInstr = sMoveEffectBS_Ptrs(effect);
      break;
    case C.MOVE_EFFECT_THRASH:
      if (gBattleMons[e].status2 & C.STATUS2_LOCK_CONFUSE) {
        adv(1);
      } else {
        gBattleMons[e].status2 |= C.STATUS2_MULTIPLETURNS;
        gLockedMoves[e] = G.gCurrentMove;
        gBattleMons[e].status2 |= STATUS2_LOCK_CONFUSE_TURN((random() & 1) + 2);
      }
      break;
    case C.MOVE_EFFECT_KNOCK_OFF:
      if (gBattleMons[e].ability === C.ABILITY_STICKY_HOLD) {
        if (gBattleMons[e].item === C.ITEM_NONE) {
          adv(1);
        } else {
          G.gLastUsedAbility = C.ABILITY_STICKY_HOLD;
          G.gBattlescriptCurrInstr = BS("BattleScript_StickyHoldActivates");
          RecordAbilityBattle(e, C.ABILITY_STICKY_HOLD);
        }
        break;
      }
      if (gBattleMons[e].item) {
        const side = GetBattlerSide(e);
        G.gLastUsedItem = gBattleMons[e].item;
        gBattleMons[e].item = C.ITEM_NONE;
        gWishFutureKnock.knockedOffMons[side] |= gBitTable[gBattlerPartyIndexes[e]];
        BattleScriptPush(cur() + 1);
        G.gBattlescriptCurrInstr = BS("BattleScript_KnockedOff");
        gBattleStruct.choicedMove[e] = 0;
      } else {
        adv(1);
      }
      break;
    case C.MOVE_EFFECT_SP_ATK_TWO_DOWN:
      BattleScriptPush(cur() + 1);
      G.gBattlescriptCurrInstr = BS("BattleScript_SAtkDown2");
      break;
  }
}

function statEffect(value: number, statId: number, affectsUser: number, script: string): void {
  if (ChangeStatBuffs(value, statId, affectsUser, 0)) {
    adv(1);
  } else {
    gBattleScripting.animArg1 = gBattleCommunication[C.MOVE_EFFECT_BYTE] & ~(C.MOVE_EFFECT_AFFECTS_USER | C.MOVE_EFFECT_CERTAIN) & 0xff;
    gBattleScripting.animArg2 = 0;
    BattleScriptPush(cur() + 1);
    G.gBattlescriptCurrInstr = BS(script);
  }
}

export function IS_ITEM_MAIL(item: number): boolean {
  return item >= C.ITEM_ORANGE_MAIL && item <= C.ITEM_RETRO_MAIL;
}

export function Cmd_seteffectwithchance(): void {
  let percentChance: number;
  if (gBattleMons[G.gBattlerAttacker].ability === C.ABILITY_SERENE_GRACE) percentChance = gBattleMoves(G.gCurrentMove).chance * 2;
  else percentChance = gBattleMoves(G.gCurrentMove).chance;
  if (gBattleCommunication[C.MOVE_EFFECT_BYTE] & C.MOVE_EFFECT_CERTAIN && !(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT)) {
    gBattleCommunication[C.MOVE_EFFECT_BYTE] &= ~C.MOVE_EFFECT_CERTAIN;
    SetMoveEffect(false, C.MOVE_EFFECT_CERTAIN);
  } else if (random() % 100 <= percentChance && gBattleCommunication[C.MOVE_EFFECT_BYTE] && !(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT)) {
    if (percentChance >= 100) SetMoveEffect(false, C.MOVE_EFFECT_CERTAIN);
    else SetMoveEffect(false, 0);
  } else {
    adv(1);
  }
  gBattleCommunication[C.MOVE_EFFECT_BYTE] = 0;
  gBattleScripting.multihitMoveEffect = 0;
}

export function Cmd_seteffectprimary(): void {
  SetMoveEffect(true, 0);
}

export function Cmd_seteffectsecondary(): void {
  SetMoveEffect(false, 0);
}

export function Cmd_clearstatusfromeffect(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  const m = gBattleCommunication[C.MOVE_EFFECT_BYTE];
  if (m <= C.PRIMARY_STATUS_MOVE_EFFECT) gBattleMons[G.gActiveBattler].status1 &= ~sStatusFlagsForMoveEffects[m];
  else gBattleMons[G.gActiveBattler].status2 &= ~sStatusFlagsForMoveEffects[m];
  gBattleCommunication[C.MOVE_EFFECT_BYTE] = 0;
  adv(2);
  gBattleScripting.multihitMoveEffect = 0;
}

export function Cmd_tryfaintmon(): void {
  if (r8(cur() + 2) !== 0) {
    G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
    if (G.gHitMarker & HITMARKER_FAINTED(G.gActiveBattler)) {
      const ptr = r32(cur() + 3);
      BattleScriptPop();
      G.gBattlescriptCurrInstr = ptr;
      gSideStatuses[GetBattlerSide(G.gActiveBattler)] &= ~C.SIDE_STATUS_SPIKES_DAMAGED;
    } else {
      adv(7);
    }
    return;
  }
  let battlerId: number;
  let ptr: number;
  if (r8(cur() + 1) === C.BS_ATTACKER) {
    G.gActiveBattler = G.gBattlerAttacker;
    battlerId = G.gBattlerTarget;
    ptr = BS("BattleScript_FaintAttacker");
  } else {
    G.gActiveBattler = G.gBattlerTarget;
    battlerId = G.gBattlerAttacker;
    ptr = BS("BattleScript_FaintTarget");
  }
  const b = G.gActiveBattler;
  if (!(G.gAbsentBattlerFlags & gBitTable[b]) && gBattleMons[b].hp === 0) {
    G.gHitMarker |= HITMARKER_FAINTED(b);
    BattleScriptPush(cur() + 7);
    G.gBattlescriptCurrInstr = ptr;
    if (GetBattlerSide(b) === C.B_SIDE_PLAYER) {
      G.gHitMarker |= C.HITMARKER_PLAYER_FAINTED;
      if (gBattleResults.playerFaintCounter < 255) gBattleResults.playerFaintCounter++;
      AdjustFriendshipOnBattleFaint(b);
    } else {
      if (gBattleResults.opponentFaintCounter < 255) gBattleResults.opponentFaintCounter++;
      gBattleResults.lastOpponentSpecies = GetMonData(gEnemyParty[gBattlerPartyIndexes[b]], C.MON_DATA_SPECIES);
      gBattleStruct.lastAttackerToFaintOpponent = G.gBattlerAttacker;
    }
    if ((G.gHitMarker & C.HITMARKER_DESTINYBOND) && gBattleMons[G.gBattlerAttacker].hp !== 0) {
      G.gHitMarker &= ~C.HITMARKER_DESTINYBOND;
      BattleScriptPush(cur());
      G.gBattleMoveDamage = gBattleMons[battlerId].hp;
      G.gBattlescriptCurrInstr = BS("BattleScript_DestinyBondTakesLife");
    }
    if ((gStatuses3[G.gBattlerTarget] & C.STATUS3_GRUDGE) && !(G.gHitMarker & C.HITMARKER_GRUDGE)
      && GetBattlerSide(G.gBattlerAttacker) !== GetBattlerSide(G.gBattlerTarget)
      && gBattleMons[G.gBattlerAttacker].hp !== 0 && G.gCurrentMove !== C.MOVE_STRUGGLE) {
      const moveIndex = gBattleStruct.chosenMovePositions[G.gBattlerAttacker];
      gBattleMons[G.gBattlerAttacker].pp[moveIndex] = 0;
      BattleScriptPush(cur());
      G.gBattlescriptCurrInstr = BS("BattleScript_GrudgeTakesPp");
      G.gActiveBattler = G.gBattlerAttacker;
      BtlController_EmitSetMonData(BUFFER_A, moveIndex + C.REQUEST_PPMOVE1_BATTLE, 0, 1, [gBattleMons[G.gActiveBattler].pp[moveIndex]]);
      MarkBattlerForControllerExec(G.gActiveBattler);
      PREPARE_MOVE_BUFFER(gBattleTextBuff1, gBattleMons[G.gBattlerAttacker].moves[moveIndex]);
    }
  } else {
    adv(7);
  }
}

export function Cmd_dofaintanimation(): void {
  if (G.gBattleControllerExecFlags === 0) {
    G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
    BtlController_EmitFaintAnimation(BUFFER_A);
    MarkBattlerForControllerExec(G.gActiveBattler);
    adv(2);
  }
}

export function Cmd_cleareffectsonfaint(): void {
  if (G.gBattleControllerExecFlags === 0) {
    G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
    gBattleMons[G.gActiveBattler].status1 = 0;
    BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_STATUS_BATTLE, 0, 4, u32bytes(0));
    MarkBattlerForControllerExec(G.gActiveBattler);
    FaintClearSetData();
    adv(2);
  }
}

export function Cmd_jumpifstatus(): void {
  const b = GetBattlerForBattleScript(r8(cur() + 1));
  const flags = r32(cur() + 2);
  const jump = r32(cur() + 6);
  if (gBattleMons[b].status1 & flags && gBattleMons[b].hp !== 0) G.gBattlescriptCurrInstr = jump;
  else adv(10);
}

export function Cmd_jumpifstatus2(): void {
  const b = GetBattlerForBattleScript(r8(cur() + 1));
  const flags = r32(cur() + 2);
  const jump = r32(cur() + 6);
  if (gBattleMons[b].status2 & flags && gBattleMons[b].hp !== 0) G.gBattlescriptCurrInstr = jump;
  else adv(10);
}

export function Cmd_jumpifability(): void {
  const ability = r8(cur() + 2);
  const jump = r32(cur() + 3);
  const which = r8(cur() + 1);
  if (which === C.BS_ATTACKER_SIDE || which === C.BS_NOT_ATTACKER_SIDE) {
    const b = AbilityBattleEffects(which === C.BS_ATTACKER_SIDE ? C.ABILITYEFFECT_CHECK_BATTLER_SIDE : C.ABILITYEFFECT_CHECK_OTHER_SIDE, G.gBattlerAttacker, ability, 0, 0);
    if (b) {
      G.gLastUsedAbility = ability;
      G.gBattlescriptCurrInstr = jump;
      RecordAbilityBattle(b - 1, G.gLastUsedAbility);
      gBattleScripting.battlerWithAbility = b - 1;
    } else {
      adv(7);
    }
  } else {
    const b = GetBattlerForBattleScript(which);
    if (gBattleMons[b].ability === ability) {
      G.gLastUsedAbility = ability;
      G.gBattlescriptCurrInstr = jump;
      RecordAbilityBattle(b, G.gLastUsedAbility);
      gBattleScripting.battlerWithAbility = b;
    } else {
      adv(7);
    }
  }
}

export function Cmd_jumpifsideaffecting(): void {
  const side = r8(cur() + 1) === C.BS_ATTACKER ? GET_BATTLER_SIDE(G.gBattlerAttacker) : GET_BATTLER_SIDE(G.gBattlerTarget);
  const flags = r16(cur() + 2);
  const jump = r32(cur() + 4);
  if (gSideStatuses[side] & flags) G.gBattlescriptCurrInstr = jump;
  else adv(8);
}

export function compare(op: number, value: number, operand: number): boolean {
  switch (op) {
    case C.CMP_EQUAL: return value === operand;
    case C.CMP_NOT_EQUAL: return value !== operand;
    case C.CMP_GREATER_THAN: return value > operand;
    case C.CMP_LESS_THAN: return value < operand;
    case C.CMP_COMMON_BITS: return (value & operand) !== 0;
    case C.CMP_NO_COMMON_BITS: return !(value & operand);
  }
  return false;
}

export function Cmd_jumpifstat(): void {
  const b = GetBattlerForBattleScript(r8(cur() + 1));
  const value = gBattleMons[b].statStages[r8(cur() + 3)] & 0xff;
  if (compare(r8(cur() + 2), value, r8(cur() + 4))) G.gBattlescriptCurrInstr = r32(cur() + 5);
  else adv(9);
}

export function Cmd_jumpifstatus3condition(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  const status = r32(cur() + 2);
  const jump = r32(cur() + 7);
  const has = (gStatuses3[G.gActiveBattler] & status) !== 0;
  if (r8(cur() + 6)) {
    if (has) adv(11);
    else G.gBattlescriptCurrInstr = jump;
  } else {
    if (has) G.gBattlescriptCurrInstr = jump;
    else adv(11);
  }
}

export function Cmd_jumpiftype(): void {
  const b = GetBattlerForBattleScript(r8(cur() + 1));
  const type = r8(cur() + 2);
  const jump = r32(cur() + 3);
  if (IS_BATTLER_OF_TYPE(b, type)) G.gBattlescriptCurrInstr = jump;
  else adv(7);
}

function holdEffectOfItem(item: number): number {
  if (item === C.ITEM_ENIGMA_BERRY) return 0; // gSaveBlock1Ptr->enigmaBerry.holdEffect
  return ItemId_GetHoldEffect(item);
}

export function Cmd_getexp(): void {
  let holdEffect: number;
  let i: number;
  let viaExpShare = 0;
  G.gBattlerFainted = GetBattlerForBattleScript(r8(cur() + 1));
  const sentIn = gSentPokesToOpponent[(G.gBattlerFainted & 2) >> 1];
  switch (gBattleScripting.getexpState) {
    case 0:
      if (GetBattlerSide(G.gBattlerFainted) !== C.B_SIDE_OPPONENT || (G.gBattleTypeFlags & (C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_TRAINER_TOWER | C.BATTLE_TYPE_BATTLE_TOWER | C.BATTLE_TYPE_SAFARI | C.BATTLE_TYPE_EREADER_TRAINER))) {
        gBattleScripting.getexpState = 6;
      } else {
        gBattleScripting.getexpState++;
        gBattleStruct.givenExpMons |= gBitTable[gBattlerPartyIndexes[G.gBattlerFainted]];
      }
      break;
    case 1: {
      let viaSentIn = 0;
      for (i = 0; i < 6; i++) {
        if (GetMonData(playerMon(i), C.MON_DATA_SPECIES) === C.SPECIES_NONE || GetMonData(playerMon(i), C.MON_DATA_HP) === 0) continue;
        if (gBitTable[i] & sentIn) viaSentIn++;
        holdEffect = holdEffectOfItem(GetMonData(playerMon(i), C.MON_DATA_HELD_ITEM));
        if (holdEffect === C.HOLD_EFFECT_EXP_SHARE) viaExpShare++;
      }
      const calculatedExp = div(rom.species[gBattleMons[G.gBattlerFainted].species].expYield * gBattleMons[G.gBattlerFainted].level, 7) & 0xffff;
      if (viaExpShare) {
        gBattleStruct.expValue = viaSentIn ? div(div(calculatedExp, 2), viaSentIn) : 0;
        if (gBattleStruct.expValue === 0) gBattleStruct.expValue = 1;
        G.gExpShareExp = div(div(calculatedExp, 2), viaExpShare) & 0xffff;
        if (G.gExpShareExp === 0) G.gExpShareExp = 1;
      } else {
        gBattleStruct.expValue = viaSentIn ? div(calculatedExp, viaSentIn) : 0;
        if (gBattleStruct.expValue === 0) gBattleStruct.expValue = 1;
        G.gExpShareExp = 0;
      }
      gBattleScripting.getexpState++;
      gBattleStruct.expGetterMonId = 0;
      gBattleStruct.sentInPokes = sentIn;
    }
    // fallthrough
    case 2:
      if (G.gBattleControllerExecFlags === 0) {
        const mon = playerMon(gBattleStruct.expGetterMonId);
        holdEffect = holdEffectOfItem(GetMonData(mon, C.MON_DATA_HELD_ITEM));
        if (holdEffect !== C.HOLD_EFFECT_EXP_SHARE && !(gBattleStruct.sentInPokes & 1)) {
          gBattleStruct.sentInPokes >>= 1;
          gBattleScripting.getexpState = 5;
          G.gBattleMoveDamage = 0;
        } else if (GetMonData(mon, C.MON_DATA_LEVEL) === C.MAX_LEVEL) {
          gBattleStruct.sentInPokes >>= 1;
          gBattleScripting.getexpState = 5;
          G.gBattleMoveDamage = 0;
        } else {
          if (!(G.gBattleTypeFlags & (C.BATTLE_TYPE_TRAINER | C.BATTLE_TYPE_POKEDUDE)) && gBattleMons[0].hp !== 0 && !gBattleStruct.wildVictorySong) {
            BattleStopLowHpSound();
            PlayBGM(C.MUS_VICTORY_WILD);
            gBattleStruct.wildVictorySong++;
          }
          if (GetMonData(mon, C.MON_DATA_HP)) {
            if (gBattleStruct.sentInPokes & 1) G.gBattleMoveDamage = gBattleStruct.expValue;
            else G.gBattleMoveDamage = 0;
            if (holdEffect === C.HOLD_EFFECT_EXP_SHARE) G.gBattleMoveDamage += G.gExpShareExp;
            if (holdEffect === C.HOLD_EFFECT_LUCKY_EGG) G.gBattleMoveDamage = div(G.gBattleMoveDamage * 150, 100);
            if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) G.gBattleMoveDamage = div(G.gBattleMoveDamage * 150, 100);
            if (IsTradedMon(mon) && !(G.gBattleTypeFlags & C.BATTLE_TYPE_POKEDUDE)) {
              G.gBattleMoveDamage = div(G.gBattleMoveDamage * 150, 100);
              i = C.STRINGID_ABOOSTED;
            } else {
              i = C.STRINGID_EMPTYSTRING4;
            }
            if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
              if (gBattlerPartyIndexes[2] === gBattleStruct.expGetterMonId && !(G.gAbsentBattlerFlags & gBitTable[2])) gBattleStruct.expGetterBattlerId = 2;
              else gBattleStruct.expGetterBattlerId = !(G.gAbsentBattlerFlags & gBitTable[0]) ? 0 : 2;
            } else {
              gBattleStruct.expGetterBattlerId = 0;
            }
            PREPARE_MON_NICK_WITH_PREFIX_BUFFER(gBattleTextBuff1, gBattleStruct.expGetterBattlerId, gBattleStruct.expGetterMonId);
            PREPARE_STRING_BUFFER(gBattleTextBuff2, i);
            PREPARE_WORD_NUMBER_BUFFER(gBattleTextBuff3, 5, G.gBattleMoveDamage);
            PrepareStringBattle(C.STRINGID_PKMNGAINEDEXP, gBattleStruct.expGetterBattlerId);
            MonGainEVs(mon, gBattleMons[G.gBattlerFainted].species);
          }
          gBattleStruct.sentInPokes >>= 1;
          gBattleScripting.getexpState++;
        }
      }
      break;
    case 3:
      if (G.gBattleControllerExecFlags === 0) {
        gBattleBufferB[gBattleStruct.expGetterBattlerId][0] = 0;
        const mon = playerMon(gBattleStruct.expGetterMonId);
        if (GetMonData(mon, C.MON_DATA_HP) && GetMonData(mon, C.MON_DATA_LEVEL) !== C.MAX_LEVEL) {
          const s = gBattleResources.beforeLvlUp.stats;
          s[C.STAT_HP] = GetMonData(mon, C.MON_DATA_MAX_HP);
          s[C.STAT_ATK] = GetMonData(mon, C.MON_DATA_ATK);
          s[C.STAT_DEF] = GetMonData(mon, C.MON_DATA_DEF);
          s[C.STAT_SPEED] = GetMonData(mon, C.MON_DATA_SPEED);
          s[C.STAT_SPATK] = GetMonData(mon, C.MON_DATA_SPATK);
          s[C.STAT_SPDEF] = GetMonData(mon, C.MON_DATA_SPDEF);
          G.gActiveBattler = gBattleStruct.expGetterBattlerId;
          BtlController_EmitExpUpdate(BUFFER_A, gBattleStruct.expGetterMonId, G.gBattleMoveDamage);
          MarkBattlerForControllerExec(G.gActiveBattler);
        }
        gBattleScripting.getexpState++;
      }
      break;
    case 4:
      if (G.gBattleControllerExecFlags === 0) {
        G.gActiveBattler = gBattleStruct.expGetterBattlerId;
        const b = G.gActiveBattler;
        if (gBattleBufferB[b][0] === C.CONTROLLER_TWORETURNVALUES && gBattleBufferB[b][1] === C.RET_VALUE_LEVELED_UP) {
          const mon = playerMon(gBattleStruct.expGetterMonId);
          if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER && gBattlerPartyIndexes[b] === gBattleStruct.expGetterMonId) HandleLowHpMusicChange(playerMon(gBattlerPartyIndexes[b]), b);
          PREPARE_MON_NICK_WITH_PREFIX_BUFFER(gBattleTextBuff1, b, gBattleStruct.expGetterMonId);
          PREPARE_BYTE_NUMBER_BUFFER(gBattleTextBuff2, 3, GetMonData(mon, C.MON_DATA_LEVEL));
          BattleScriptPushCursor();
          G.gLeveledUpInBattle |= gBitTable[gBattleStruct.expGetterMonId];
          G.gBattlescriptCurrInstr = BS("BattleScript_LevelUp");
          G.gBattleMoveDamage = gBattleBufferB[b][2] | (gBattleBufferB[b][3] << 8);
          AdjustFriendship(mon, C.FRIENDSHIP_EVENT_GROW_LEVEL);
          if (gBattlerPartyIndexes[0] === gBattleStruct.expGetterMonId && gBattleMons[0].hp) {
            gBattleMons[0].level = GetMonData(mon, C.MON_DATA_LEVEL);
            gBattleMons[0].hp = GetMonData(mon, C.MON_DATA_HP);
            gBattleMons[0].maxHP = GetMonData(mon, C.MON_DATA_MAX_HP);
            gBattleMons[0].attack = GetMonData(mon, C.MON_DATA_ATK);
            gBattleMons[0].defense = GetMonData(mon, C.MON_DATA_DEF);
            gBattleMons[0].speed = GetMonData(mon, C.MON_DATA_SPEED);
            gBattleMons[0].spAttack = GetMonData(mon, C.MON_DATA_SPATK);
            gBattleMons[0].spDefense = GetMonData(mon, C.MON_DATA_SPDEF);
          }
          if (gBattlerPartyIndexes[2] === gBattleStruct.expGetterMonId && gBattleMons[2].hp && (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE)) {
            gBattleMons[2].level = GetMonData(mon, C.MON_DATA_LEVEL);
            gBattleMons[2].hp = GetMonData(mon, C.MON_DATA_HP);
            gBattleMons[2].maxHP = GetMonData(mon, C.MON_DATA_MAX_HP);
            gBattleMons[2].attack = GetMonData(mon, C.MON_DATA_ATK);
            gBattleMons[2].defense = GetMonData(mon, C.MON_DATA_DEF);
            gBattleMons[2].speed = GetMonData(mon, C.MON_DATA_SPEED);
            gBattleMons[2].speed = GetMonData(mon, C.MON_DATA_SPEED); // original bug: spDefense not updated
            gBattleMons[2].spAttack = GetMonData(mon, C.MON_DATA_SPATK);
          }
          gBattleScripting.getexpState = 5;
        } else {
          G.gBattleMoveDamage = 0;
          gBattleScripting.getexpState = 5;
        }
      }
      break;
    case 5:
      if (G.gBattleMoveDamage) {
        gBattleScripting.getexpState = 3;
      } else {
        gBattleStruct.expGetterMonId++;
        if (gBattleStruct.expGetterMonId < 6) gBattleScripting.getexpState = 2;
        else gBattleScripting.getexpState = 6;
      }
      break;
    case 6:
      if (G.gBattleControllerExecFlags === 0) {
        gBattleMons[G.gBattlerFainted].item = C.ITEM_NONE;
        gBattleMons[G.gBattlerFainted].ability = C.ABILITY_NONE;
        adv(2);
      }
      break;
  }
}

