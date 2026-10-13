// battle_script_commands.c, commands 0x24-0x5B.

import * as C from "../../generated/constants";
import { sound } from "../../audio/sound";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_UP, JOY_NEW } from "../../gba/input";
import { BeginNormalPaletteFade, gPaletteFade, PALETTES_ALL, RGB_BLACK } from "../../hw/palette";
import { gMain } from "../../hw/runtime";
import { FreeAllWindowBuffers } from "../../hw/window";
import { rom } from "../../rom";
import {
  BS, BattleScriptPop, BattleScriptPush, BattleScriptPushCursor, memRead16, memRead32, memRead8, memWrite16, memWrite32, memWrite8,
  r16, r32, r8, scriptTable,
} from "../bscript";
import {
  G, gActionsByTurnOrder, gBattleBufferB, gBattleCommunication, gBattleMons, gBattleResources, gBattleResults, gBattleScripting,
  gBattleStruct, gBattleTextBuff1, gBattleTextBuff2, gBattlerByTurnOrder, gBattlerPartyIndexes, gBitTable, gDisableStructs,
  gEnigmaBerries, gLastHitBy, gLastHitByType, gLastLandedMoves, gLastMoves, gLastPrintedMoves, gLastResultingMoves, gSideStatuses,
  gSideTimers, gSpecialStatuses, gStatuses3, gWishFutureKnock,
} from "../globals";
import {
  BATTLE_PARTNER, GET_BATTLER_SIDE, GET_MOVE_TYPE, GET_STAT_BUFF_ID, GET_STAT_BUFF_VALUE2, HITMARKER_FAINTED, IS_BATTLER_OF_TYPE,
  MOVE_IS_PERMANENT, SET_STAT_BUFF_VALUE, STAT_BUFF_NEGATIVE, TYPE_EFFECT_ATK_TYPE, TYPE_EFFECT_DEF_TYPE, TYPE_EFFECT_MULTIPLIER,
  div, gBattleMoves,
} from "../macros";
import {
  CalculatePlayerPartyCount, GetMonData, MonTryLearningNewMove, RemoveMonPPBonus, SetMonMoveSlot, gEnemyParty, playerMon,
  type Mon, SpeciesToNationalPokedexNum,
} from "../../pokemon/mon";
import {
  AbilityBattleEffects, GetBattlerAtPosition, GetBattlerForBattleScript, GetBattlerPosition, GetBattlerSide, HasNoMonsToSwitch,
  ItemBattleEffects, ItemId_GetHoldEffect, MarkBattlerForControllerExec, RecordAbilityBattle, WasUnableToUseMove, GetAbilityBySpecies,
} from "../util";
import {
  BtlController_EmitBattleAnimation, BtlController_EmitCantSwitch, BtlController_EmitChoosePokemon, BtlController_EmitEndLinkBattle,
  BtlController_EmitFaintingCry, BtlController_EmitGetMonData, BtlController_EmitHealthBarUpdate, BtlController_EmitLinkStandbyMsg,
  BtlController_EmitPlayFanfare, BtlController_EmitPlaySE, BtlController_EmitReturnMonToBall, BtlController_EmitSetMonData,
  BtlController_EmitSpriteInvisibility, BtlController_EmitSwitchInAnim, BtlController_EmitTrainerSlide, BUFFER_A,
} from "../controllers";
import {
  BattlePutTextOnWindow, HandleBattleWindow, BattleCreateYesNoCursorAt, BattleDestroyYesNoCursorAt, PREPARE_MON_NICK_BUFFER,
  PREPARE_MOVE_BUFFER, PREPARE_SPECIES_BUFFER, PrepareStringBattle,
} from "../message";
import { SwitchInClearSetData, UpdatePartyOwnerOnSwitch_NonMulti } from "../main";
import { BattleMainCB2 } from "../main_init";
import { AttacksThisTurn } from "./helpers";
import { u32bytes } from "./part1";
import { HandleSetPokedexFlag, IsHMMove2, RemoveBattleMonPPBonus } from "../../pokemon/mon_extra";
import { UpdateSentPokesToOpponentValue } from "../util";
import { ShowSelectMovePokemonSummaryScreen, GetMoveSlotToReplace } from "../ext";
import { ReshowBattleScreenAfterMenu } from "../reshow";

const WINDOW_CLEAR = 1 << 0;
const cur = () => G.gBattlescriptCurrInstr;
const adv = (n: number) => { G.gBattlescriptCurrInstr += n; };
const cmp = (op: number, a: number, b: number): boolean => {
  switch (op) {
    case C.CMP_EQUAL: return a === b;
    case C.CMP_NOT_EQUAL: return a !== b;
    case C.CMP_GREATER_THAN: return a > b;
    case C.CMP_LESS_THAN: return a < b;
    case C.CMP_COMMON_BITS: return (a & b) !== 0;
    case C.CMP_NO_COMMON_BITS: return !(a & b);
  }
  return false;
};

export function Cmd_checkteamslost(): void {
  if (G.gBattleControllerExecFlags) return;
  let hp = 0;
  for (let i = 0; i < 6; i++) {
    const mon = playerMon(i);
    if (GetMonData(mon, C.MON_DATA_SPECIES) && !GetMonData(mon, C.MON_DATA_IS_EGG)) hp = (hp + GetMonData(mon, C.MON_DATA_HP)) & 0xffff;
  }
  if (hp === 0) G.gBattleOutcome |= C.B_OUTCOME_LOST;
  hp = 0;
  for (let i = 0; i < 6; i++) {
    const mon = gEnemyParty[i];
    if (GetMonData(mon, C.MON_DATA_SPECIES) && !GetMonData(mon, C.MON_DATA_IS_EGG)) hp = (hp + GetMonData(mon, C.MON_DATA_HP)) & 0xffff;
  }
  if (hp === 0) G.gBattleOutcome |= C.B_OUTCOME_WON;
  // link-battle empty spot checks are not needed without link battles
  adv(5);
}

export function MoveValuesCleanUp(): void {
  G.gMoveResultFlags = 0;
  gBattleScripting.dmgMultiplier = 1;
  G.gCritMultiplier = 1;
  gBattleCommunication[C.MOVE_EFFECT_BYTE] = 0;
  gBattleCommunication[C.MISS_TYPE] = 0;
  G.gHitMarker &= ~C.HITMARKER_DESTINYBOND;
  G.gHitMarker &= ~C.HITMARKER_SYNCHRONISE_EFFECT;
}

export function Cmd_movevaluescleanup(): void {
  MoveValuesCleanUp();
  adv(1);
}

export function Cmd_setmultihit(): void {
  G.gMultiHitCounter = r8(cur() + 1);
  adv(2);
}

export function Cmd_decrementmultihit(): void {
  G.gMultiHitCounter = (G.gMultiHitCounter - 1) & 0xff;
  if (G.gMultiHitCounter === 0) adv(5);
  else G.gBattlescriptCurrInstr = r32(cur() + 1);
}

export function Cmd_goto(): void {
  G.gBattlescriptCurrInstr = r32(cur() + 1);
}

export function Cmd_jumpifbyte(): void {
  const op = r8(cur() + 1);
  const mem = r32(cur() + 2);
  const value = r8(cur() + 6);
  const jump = r32(cur() + 7);
  adv(11);
  if (cmp(op, memRead8(mem), value)) G.gBattlescriptCurrInstr = jump;
}

export function Cmd_jumpifhalfword(): void {
  const op = r8(cur() + 1);
  const mem = r32(cur() + 2);
  const value = r16(cur() + 6);
  const jump = r32(cur() + 8);
  adv(12);
  if (cmp(op, memRead16(mem), value)) G.gBattlescriptCurrInstr = jump;
}

export function Cmd_jumpifword(): void {
  const op = r8(cur() + 1);
  const mem = r32(cur() + 2);
  const value = r32(cur() + 6);
  const jump = r32(cur() + 10);
  adv(14);
  if (cmp(op, memRead32(mem) >>> 0, value >>> 0)) G.gBattlescriptCurrInstr = jump;
}

export function Cmd_jumpifarrayequal(): void {
  const m1 = r32(cur() + 1);
  const m2 = r32(cur() + 5);
  const size = r8(cur() + 9);
  const jump = r32(cur() + 10);
  let i = 0;
  for (; i < size; i++) {
    if (memRead8(m1 + i) !== memRead8(m2 + i)) {
      adv(14);
      break;
    }
  }
  if (i === size) G.gBattlescriptCurrInstr = jump;
}

export function Cmd_jumpifarraynotequal(): void {
  let equal = 0;
  const m1 = r32(cur() + 1);
  const m2 = r32(cur() + 5);
  const size = r8(cur() + 9);
  const jump = r32(cur() + 10);
  for (let i = 0; i < size; i++) if (memRead8(m1 + i) === memRead8(m2 + i)) equal++;
  if (equal !== size) G.gBattlescriptCurrInstr = jump;
  else adv(14);
}

export function Cmd_setbyte(): void {
  memWrite8(r32(cur() + 1), r8(cur() + 5));
  adv(6);
}

export function Cmd_addbyte(): void {
  const p = r32(cur() + 1);
  memWrite8(p, memRead8(p) + r8(cur() + 5));
  adv(6);
}

export function Cmd_subbyte(): void {
  const p = r32(cur() + 1);
  memWrite8(p, memRead8(p) - r8(cur() + 5));
  adv(6);
}

export function Cmd_copyarray(): void {
  const dest = r32(cur() + 1);
  const src = r32(cur() + 5);
  const size = r8(cur() + 9);
  for (let i = 0; i < size; i++) memWrite8(dest + i, memRead8(src + i));
  adv(10);
}

export function Cmd_copyarraywithindex(): void {
  const dest = r32(cur() + 1);
  const src = r32(cur() + 5);
  const index = memRead8(r32(cur() + 9));
  const size = r8(cur() + 13);
  for (let i = 0; i < size; i++) memWrite8(dest + i, memRead8(src + i + index));
  adv(14);
}

export function Cmd_orbyte(): void {
  const p = r32(cur() + 1);
  memWrite8(p, memRead8(p) | r8(cur() + 5));
  adv(6);
}

export function Cmd_orhalfword(): void {
  const p = r32(cur() + 1);
  memWrite16(p, memRead16(p) | r16(cur() + 5));
  adv(7);
}

export function Cmd_orword(): void {
  const p = r32(cur() + 1);
  memWrite32(p, memRead32(p) | r32(cur() + 5));
  adv(9);
}

export function Cmd_bicbyte(): void {
  const p = r32(cur() + 1);
  memWrite8(p, memRead8(p) & ~r8(cur() + 5));
  adv(6);
}

export function Cmd_bichalfword(): void {
  const p = r32(cur() + 1);
  memWrite16(p, memRead16(p) & ~r16(cur() + 5));
  adv(7);
}

export function Cmd_bicword(): void {
  const p = r32(cur() + 1);
  memWrite32(p, memRead32(p) & ~r32(cur() + 5));
  adv(9);
}

export function Cmd_pause(): void {
  if (G.gBattleControllerExecFlags === 0) {
    const value = r16(cur() + 1);
    if (++G.gPauseCounterBattle >= value) {
      G.gPauseCounterBattle = 0;
      adv(3);
    }
  }
}

export function Cmd_waitstate(): void {
  if (G.gBattleControllerExecFlags === 0) adv(1);
}

export function Cmd_healthbar_update(): void {
  G.gActiveBattler = r8(cur() + 1) === C.BS_TARGET ? G.gBattlerTarget : G.gBattlerAttacker;
  BtlController_EmitHealthBarUpdate(BUFFER_A, G.gBattleMoveDamage);
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(2);
}

export function Cmd_return(): void {
  BattleScriptPop();
}

export function Cmd_end(): void {
  G.gMoveResultFlags = 0;
  G.gActiveBattler = 0;
  G.gCurrentActionFuncId = C.B_ACTION_TRY_FINISH;
}

export function Cmd_end2(): void {
  G.gActiveBattler = 0;
  G.gCurrentActionFuncId = C.B_ACTION_TRY_FINISH;
}

export function Cmd_end3(): void {
  BattleScriptPop();
  const s = gBattleResources.battleCallbackStack;
  if (s.size !== 0) s.size--;
  G.gBattleMainFunc = s.function[s.size];
}

export function Cmd_call(): void {
  BattleScriptPush(cur() + 5);
  G.gBattlescriptCurrInstr = r32(cur() + 1);
}

export function Cmd_jumpiftype2(): void {
  const b = GetBattlerForBattleScript(r8(cur() + 1));
  const t = r8(cur() + 2);
  if (t === gBattleMons[b].type1 || t === gBattleMons[b].type2) G.gBattlescriptCurrInstr = r32(cur() + 3);
  else adv(7);
}

export function Cmd_jumpifabilitypresent(): void {
  if (AbilityBattleEffects(C.ABILITYEFFECT_CHECK_ON_FIELD, 0, r8(cur() + 1), 0, 0)) G.gBattlescriptCurrInstr = r32(cur() + 2);
  else adv(6);
}

export function Cmd_endselectionscript(): void {
  gBattleStruct.selectionScriptFinished[G.gBattlerAttacker] = 1;
}

function playAnimation(animId: number, argPtr: number, length: number, pauseOnNoAnims: boolean, includeSilphScope: boolean): void {
  const arg = memRead16(argPtr);
  if (animId === C.B_ANIM_STATS_CHANGE || animId === C.B_ANIM_SNATCH_MOVE || animId === C.B_ANIM_SUBSTITUTE_FADE || (includeSilphScope && animId === C.B_ANIM_SILPH_SCOPED)) {
    BtlController_EmitBattleAnimation(BUFFER_A, animId, arg);
    MarkBattlerForControllerExec(G.gActiveBattler);
    adv(length);
  } else if (G.gHitMarker & C.HITMARKER_NO_ANIMATIONS) {
    if (pauseOnNoAnims) {
      BattleScriptPush(cur() + length);
      G.gBattlescriptCurrInstr = BS("BattleScript_Pausex20");
    } else {
      adv(length);
    }
  } else if (animId === C.B_ANIM_RAIN_CONTINUES || animId === C.B_ANIM_SUN_CONTINUES || animId === C.B_ANIM_SANDSTORM_CONTINUES || animId === C.B_ANIM_HAIL_CONTINUES) {
    BtlController_EmitBattleAnimation(BUFFER_A, animId, arg);
    MarkBattlerForControllerExec(G.gActiveBattler);
    adv(length);
  } else if (gStatuses3[G.gActiveBattler] & C.STATUS3_SEMI_INVULNERABLE) {
    adv(length);
  } else {
    BtlController_EmitBattleAnimation(BUFFER_A, animId, arg);
    MarkBattlerForControllerExec(G.gActiveBattler);
    adv(length);
  }
}

export function Cmd_playanimation(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  playAnimation(r8(cur() + 2), r32(cur() + 3), 7, true, true);
}

export function Cmd_playanimation_var(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  playAnimation(memRead8(r32(cur() + 2)), r32(cur() + 6), 10, false, false);
}

export function Cmd_setgraphicalstatchangevalues(): void {
  let value = 0;
  switch (GET_STAT_BUFF_VALUE2(gBattleScripting.statChanger)) {
    case SET_STAT_BUFF_VALUE(1): value = C.STAT_ANIM_PLUS1; break;
    case SET_STAT_BUFF_VALUE(2): value = C.STAT_ANIM_PLUS2; break;
    case SET_STAT_BUFF_VALUE(1) | STAT_BUFF_NEGATIVE: value = C.STAT_ANIM_MINUS1; break;
    case SET_STAT_BUFF_VALUE(2) | STAT_BUFF_NEGATIVE: value = C.STAT_ANIM_MINUS2; break;
  }
  gBattleScripting.animArg1 = GET_STAT_BUFF_ID(gBattleScripting.statChanger) + value - 1;
  gBattleScripting.animArg2 = 0;
  adv(1);
}

export function Cmd_playstatchangeanimation(): void {
  let currStat = 0;
  let statAnimId = 0;
  let changeable = 0;
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  const b = G.gActiveBattler;
  let statsToCheck = r8(cur() + 2);
  const flags = r8(cur() + 3);
  if (flags & C.STAT_CHANGE_NEGATIVE) {
    const start = flags & C.STAT_CHANGE_BY_TWO ? C.STAT_ANIM_MINUS2 - 1 : C.STAT_ANIM_MINUS1 - 1;
    while (statsToCheck !== 0) {
      if (statsToCheck & 1) {
        if (flags & C.STAT_CHANGE_CANT_PREVENT) {
          if (gBattleMons[b].statStages[currStat] > C.MIN_STAT_STAGE) {
            statAnimId = start + currStat;
            changeable++;
          }
        } else if (!gSideTimers[GET_BATTLER_SIDE(b)].mistTimer
          && gBattleMons[b].ability !== C.ABILITY_CLEAR_BODY
          && gBattleMons[b].ability !== C.ABILITY_WHITE_SMOKE
          && !(gBattleMons[b].ability === C.ABILITY_KEEN_EYE && currStat === C.STAT_ACC)
          && !(gBattleMons[b].ability === C.ABILITY_HYPER_CUTTER && currStat === C.STAT_ATK)) {
          if (gBattleMons[b].statStages[currStat] > C.MIN_STAT_STAGE) {
            statAnimId = start + currStat;
            changeable++;
          }
        }
      }
      statsToCheck >>= 1;
      currStat++;
    }
    if (changeable > 1) statAnimId = flags & C.STAT_CHANGE_BY_TWO ? C.STAT_ANIM_MULTIPLE_MINUS2 : C.STAT_ANIM_MULTIPLE_MINUS1;
  } else {
    const start = flags & C.STAT_CHANGE_BY_TWO ? C.STAT_ANIM_PLUS2 - 1 : C.STAT_ANIM_PLUS1 - 1;
    while (statsToCheck !== 0) {
      if (statsToCheck & 1 && gBattleMons[b].statStages[currStat] < C.MAX_STAT_STAGE) {
        statAnimId = start + currStat;
        changeable++;
      }
      statsToCheck >>= 1;
      currStat++;
    }
    if (changeable > 1) statAnimId = flags & C.STAT_CHANGE_BY_TWO ? C.STAT_ANIM_MULTIPLE_PLUS2 : C.STAT_ANIM_MULTIPLE_PLUS1;
  }
  if (flags & C.STAT_CHANGE_MULTIPLE_STATS && changeable < 2) {
    adv(4);
  } else if (changeable !== 0 && !gBattleScripting.statAnimPlayed) {
    BtlController_EmitBattleAnimation(BUFFER_A, C.B_ANIM_STATS_CHANGE, statAnimId);
    MarkBattlerForControllerExec(b);
    if (flags & C.STAT_CHANGE_MULTIPLE_STATS && changeable > 1) gBattleScripting.statAnimPlayed = 1;
    adv(4);
  } else {
    adv(4);
  }
}

const TARGET_TURN_DAMAGED = () => gSpecialStatuses[G.gBattlerTarget].physicalDmg !== 0 || gSpecialStatuses[G.gBattlerTarget].specialDmg !== 0;

export function Cmd_moveend(): void {
  let effect = false;
  const originallyUsedMove = G.gChosenMove === C.MOVE_UNAVAILABLE ? C.MOVE_NONE : G.gChosenMove;
  const endMode = r8(cur() + 1);
  const endState = r8(cur() + 2);
  const a = G.gBattlerAttacker;
  const holdEffectAtk = gBattleMons[a].item === C.ITEM_ENIGMA_BERRY ? gEnigmaBerries[a].holdEffect : ItemId_GetHoldEffect(gBattleMons[a].item);
  const choiced = gBattleStruct.choicedMove;
  const moveType = GET_MOVE_TYPE(G.gCurrentMove);
  do {
    const t = G.gBattlerTarget;
    switch (gBattleScripting.moveendState) {
      case C.MOVEEND_RAGE:
        if (gBattleMons[t].status2 & C.STATUS2_RAGE && gBattleMons[t].hp !== 0 && G.gBattlerAttacker !== t
          && GetBattlerSide(G.gBattlerAttacker) !== GetBattlerSide(t) && !(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT)
          && TARGET_TURN_DAMAGED() && gBattleMoves(G.gCurrentMove).power !== 0 && gBattleMons[t].statStages[C.STAT_ATK] < C.MAX_STAT_STAGE) {
          gBattleMons[t].statStages[C.STAT_ATK]++;
          BattleScriptPushCursor();
          G.gBattlescriptCurrInstr = BS("BattleScript_RageIsBuilding");
          effect = true;
        }
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_DEFROST:
        if (gBattleMons[t].status1 & C.STATUS1_FREEZE && gBattleMons[t].hp !== 0 && G.gBattlerAttacker !== t
          && gSpecialStatuses[t].specialDmg && !(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) && moveType === C.TYPE_FIRE) {
          gBattleMons[t].status1 &= ~C.STATUS1_FREEZE;
          G.gActiveBattler = t;
          BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_STATUS_BATTLE, 0, 4, u32bytes(gBattleMons[t].status1));
          MarkBattlerForControllerExec(G.gActiveBattler);
          BattleScriptPushCursor();
          G.gBattlescriptCurrInstr = BS("BattleScript_DefrostedViaFireMove");
          effect = true;
        }
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_SYNCHRONIZE_TARGET:
        if (AbilityBattleEffects(C.ABILITYEFFECT_SYNCHRONIZE, t, 0, 0, 0)) effect = true;
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_ON_DAMAGE_ABILITIES:
        if (AbilityBattleEffects(C.ABILITYEFFECT_ON_DAMAGE, t, 0, 0, 0)) effect = true;
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_IMMUNITY_ABILITIES:
        if (AbilityBattleEffects(C.ABILITYEFFECT_IMMUNITY, 0, 0, 0, 0)) effect = true;
        else gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_SYNCHRONIZE_ATTACKER:
        if (AbilityBattleEffects(C.ABILITYEFFECT_ATK_SYNCHRONIZE, G.gBattlerAttacker, 0, 0, 0)) effect = true;
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_CHOICE_MOVE: {
        const atk = G.gBattlerAttacker;
        if (G.gHitMarker & C.HITMARKER_OBEYS && holdEffectAtk === C.HOLD_EFFECT_CHOICE_BAND && G.gChosenMove !== C.MOVE_STRUGGLE
          && (choiced[atk] === C.MOVE_NONE || choiced[atk] === C.MOVE_UNAVAILABLE)) {
          if (G.gChosenMove === C.MOVE_BATON_PASS && !(G.gMoveResultFlags & C.MOVE_RESULT_FAILED)) {
            gBattleScripting.moveendState++;
            break;
          }
          choiced[atk] = G.gChosenMove;
        }
        let i = 0;
        for (; i < 4; i++) if (gBattleMons[atk].moves[i] === choiced[atk]) break;
        if (i === 4) choiced[atk] = C.MOVE_NONE;
        gBattleScripting.moveendState++;
        break;
      }
      case C.MOVEEND_CHANGED_ITEMS:
        for (let i = 0; i < G.gBattlersCount; i++) {
          const changed = gBattleStruct.changedItems;
          if (changed[i] !== C.ITEM_NONE) {
            gBattleMons[i].item = changed[i];
            changed[i] = C.ITEM_NONE;
          }
        }
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_ITEM_EFFECTS_ALL:
        if (ItemBattleEffects(C.ITEMEFFECT_MOVE_END, 0, false)) effect = true;
        else gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_KINGSROCK_SHELLBELL:
        if (ItemBattleEffects(C.ITEMEFFECT_KINGSROCK_SHELLBELL, 0, false)) effect = true;
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_ATTACKER_INVISIBLE:
        if (gStatuses3[G.gBattlerAttacker] & C.STATUS3_SEMI_INVULNERABLE && G.gHitMarker & C.HITMARKER_NO_ANIMATIONS) {
          G.gActiveBattler = G.gBattlerAttacker;
          BtlController_EmitSpriteInvisibility(BUFFER_A, true);
          MarkBattlerForControllerExec(G.gActiveBattler);
          gBattleScripting.moveendState++;
          return;
        }
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_ATTACKER_VISIBLE:
        if (G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT || !(gStatuses3[G.gBattlerAttacker] & C.STATUS3_SEMI_INVULNERABLE) || WasUnableToUseMove(G.gBattlerAttacker)) {
          G.gActiveBattler = G.gBattlerAttacker;
          BtlController_EmitSpriteInvisibility(BUFFER_A, false);
          MarkBattlerForControllerExec(G.gActiveBattler);
          gStatuses3[G.gBattlerAttacker] &= ~C.STATUS3_SEMI_INVULNERABLE;
          gSpecialStatuses[G.gBattlerAttacker].restoredBattlerSprite = 1;
          gBattleScripting.moveendState++;
          return;
        }
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_TARGET_VISIBLE:
        if (!gSpecialStatuses[t].restoredBattlerSprite && t < G.gBattlersCount && !(gStatuses3[t] & C.STATUS3_SEMI_INVULNERABLE)) {
          G.gActiveBattler = t;
          BtlController_EmitSpriteInvisibility(BUFFER_A, false);
          MarkBattlerForControllerExec(G.gActiveBattler);
          gStatuses3[t] &= ~C.STATUS3_SEMI_INVULNERABLE;
          gBattleScripting.moveendState++;
          return;
        }
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_SUBSTITUTE:
        for (let i = 0; i < G.gBattlersCount; i++) if (gDisableStructs[i].substituteHP === 0) gBattleMons[i].status2 &= ~C.STATUS2_SUBSTITUTE;
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_UPDATE_LAST_MOVES:
        if (G.gHitMarker & C.HITMARKER_SWAP_ATTACKER_TARGET) {
          G.gActiveBattler = G.gBattlerAttacker;
          G.gBattlerAttacker = G.gBattlerTarget;
          G.gBattlerTarget = G.gActiveBattler;
          G.gHitMarker &= ~C.HITMARKER_SWAP_ATTACKER_TARGET;
        }
        if (G.gHitMarker & C.HITMARKER_ATTACKSTRING_PRINTED) gLastPrintedMoves[G.gBattlerAttacker] = G.gChosenMove;
        if (!(G.gAbsentBattlerFlags & gBitTable[G.gBattlerAttacker]) && !(gBattleStruct.absentBattlerFlags & gBitTable[G.gBattlerAttacker])
          && gBattleMoves(originallyUsedMove).effect !== C.EFFECT_BATON_PASS) {
          if (G.gHitMarker & C.HITMARKER_OBEYS) {
            gLastMoves[G.gBattlerAttacker] = G.gChosenMove;
            gLastResultingMoves[G.gBattlerAttacker] = G.gCurrentMove;
          } else {
            gLastMoves[G.gBattlerAttacker] = C.MOVE_UNAVAILABLE;
            gLastResultingMoves[G.gBattlerAttacker] = C.MOVE_UNAVAILABLE;
          }
          if (!(G.gHitMarker & HITMARKER_FAINTED(G.gBattlerTarget))) gLastHitBy[G.gBattlerTarget] = G.gBattlerAttacker;
          if (G.gHitMarker & C.HITMARKER_OBEYS && !(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT)) {
            if (G.gChosenMove === C.MOVE_UNAVAILABLE) {
              gLastLandedMoves[G.gBattlerTarget] = G.gChosenMove;
            } else {
              gLastLandedMoves[G.gBattlerTarget] = G.gCurrentMove;
              gLastHitByType[G.gBattlerTarget] = GET_MOVE_TYPE(G.gCurrentMove);
            }
          } else {
            gLastLandedMoves[G.gBattlerTarget] = C.MOVE_UNAVAILABLE;
          }
        }
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_MIRROR_MOVE:
        if (!(G.gAbsentBattlerFlags & gBitTable[G.gBattlerAttacker]) && !(gBattleStruct.absentBattlerFlags & gBitTable[G.gBattlerAttacker])
          && gBattleMoves(originallyUsedMove).flags & C.FLAG_MIRROR_MOVE_AFFECTED && G.gHitMarker & C.HITMARKER_OBEYS
          && G.gBattlerAttacker !== G.gBattlerTarget && !(G.gHitMarker & HITMARKER_FAINTED(G.gBattlerTarget))
          && !(G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT)) {
          const ltm = gBattleStruct.lastTakenMove;
          ltm[G.gBattlerTarget * 2 + 0] = G.gChosenMove & 0xff;
          ltm[G.gBattlerTarget * 2 + 1] = (G.gChosenMove >> 8) & 0xff;
          const from = gBattleStruct.lastTakenMoveFrom;
          from[G.gBattlerAttacker * 2 + G.gBattlerTarget * 8 + 0] = G.gChosenMove & 0xff;
          from[G.gBattlerAttacker * 2 + G.gBattlerTarget * 8 + 1] = (G.gChosenMove >> 8) & 0xff;
        }
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_NEXT_TARGET:
        if (!(G.gHitMarker & C.HITMARKER_UNABLE_TO_USE_MOVE) && G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE
          && !gProtectStructsCharging() && gBattleMoves(G.gCurrentMove).target === C.MOVE_TARGET_BOTH && !(G.gHitMarker & C.HITMARKER_NO_ATTACKSTRING)) {
          const battlerId = GetBattlerAtPosition(BATTLE_PARTNER(GetBattlerPosition(G.gBattlerTarget)));
          if (gBattleMons[battlerId].hp !== 0) {
            G.gBattlerTarget = battlerId;
            G.gHitMarker |= C.HITMARKER_NO_ATTACKSTRING;
            gBattleScripting.moveendState = 0;
            MoveValuesCleanUp();
            BattleScriptPush(scriptTable("gBattleScriptsForMoveEffects", gBattleMoves(G.gCurrentMove).effect));
            G.gBattlescriptCurrInstr = BS("BattleScript_FlushMessageBox");
            return;
          } else {
            G.gHitMarker |= C.HITMARKER_NO_ATTACKSTRING;
          }
        }
        gBattleScripting.moveendState++;
        break;
      case C.MOVEEND_COUNT:
        break;
    }
    if (endMode === 1 && !effect) gBattleScripting.moveendState = C.MOVEEND_COUNT;
    if (endMode === 2 && endState === gBattleScripting.moveendState) gBattleScripting.moveendState = C.MOVEEND_COUNT;
  } while (gBattleScripting.moveendState !== C.MOVEEND_COUNT && !effect);
  if (gBattleScripting.moveendState === C.MOVEEND_COUNT && !effect) adv(3);
}

import { gProtectStructs } from "../globals";
function gProtectStructsCharging(): boolean {
  return !!gProtectStructs[G.gBattlerAttacker].chargingTurn;
}

export function Cmd_typecalc2(): void {
  let flags = 0;
  let i = 0;
  const moveType = gBattleMoves(G.gCurrentMove).type;
  const t = G.gBattlerTarget;
  if (gBattleMons[t].ability === C.ABILITY_LEVITATE && moveType === C.TYPE_GROUND) {
    G.gLastUsedAbility = gBattleMons[t].ability;
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED | C.MOVE_RESULT_DOESNT_AFFECT_FOE;
    gLastLandedMoves[t] = 0;
    gBattleCommunication[C.MISS_TYPE] = C.B_MSG_GROUND_MISS;
    RecordAbilityBattle(t, G.gLastUsedAbility);
  } else {
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
        if (def === t1) {
          if (mul === C.TYPE_MUL_NO_EFFECT) {
            G.gMoveResultFlags |= C.MOVE_RESULT_DOESNT_AFFECT_FOE;
            break;
          }
          if (mul === C.TYPE_MUL_NOT_EFFECTIVE) flags |= C.MOVE_RESULT_NOT_VERY_EFFECTIVE;
          if (mul === C.TYPE_MUL_SUPER_EFFECTIVE) flags |= C.MOVE_RESULT_SUPER_EFFECTIVE;
        }
        if (def === t2) {
          if (t1 !== t2 && mul === C.TYPE_MUL_NO_EFFECT) {
            G.gMoveResultFlags |= C.MOVE_RESULT_DOESNT_AFFECT_FOE;
            break;
          }
          if (t1 !== t2 && mul === C.TYPE_MUL_NOT_EFFECTIVE) flags |= C.MOVE_RESULT_NOT_VERY_EFFECTIVE;
          if (t1 !== t2 && mul === C.TYPE_MUL_SUPER_EFFECTIVE) flags |= C.MOVE_RESULT_SUPER_EFFECTIVE;
        }
      }
      i += 3;
    }
  }
  if (gBattleMons[t].ability === C.ABILITY_WONDER_GUARD && !(flags & C.MOVE_RESULT_NO_EFFECT)
    && AttacksThisTurn(G.gBattlerAttacker, G.gCurrentMove) === 2
    && (!(flags & C.MOVE_RESULT_SUPER_EFFECTIVE) || ((flags & (C.MOVE_RESULT_SUPER_EFFECTIVE | C.MOVE_RESULT_NOT_VERY_EFFECTIVE)) === (C.MOVE_RESULT_SUPER_EFFECTIVE | C.MOVE_RESULT_NOT_VERY_EFFECTIVE)))
    && gBattleMoves(G.gCurrentMove).power) {
    G.gLastUsedAbility = C.ABILITY_WONDER_GUARD;
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gLastLandedMoves[t] = 0;
    gBattleCommunication[C.MISS_TYPE] = C.B_MSG_AVOIDED_DMG;
    RecordAbilityBattle(t, G.gLastUsedAbility);
  }
  if (G.gMoveResultFlags & C.MOVE_RESULT_DOESNT_AFFECT_FOE) gProtectStructs[G.gBattlerAttacker].targetNotAffected = 1;
  adv(1);
}

export function Cmd_returnatktoball(): void {
  G.gActiveBattler = G.gBattlerAttacker;
  if (!(G.gHitMarker & HITMARKER_FAINTED(G.gActiveBattler))) {
    BtlController_EmitReturnMonToBall(BUFFER_A, false);
    MarkBattlerForControllerExec(G.gActiveBattler);
  }
  adv(1);
}

export function Cmd_getswitchedmondata(): void {
  if (G.gBattleControllerExecFlags) return;
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  gBattlerPartyIndexes[G.gActiveBattler] = gBattleStruct.monToSwitchIntoId[G.gActiveBattler];
  BtlController_EmitGetMonData(BUFFER_A, C.REQUEST_ALL_BATTLE, gBitTable[gBattlerPartyIndexes[G.gActiveBattler]]);
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(2);
}

export function Cmd_switchindataupdate(): void {
  if (G.gBattleControllerExecFlags) return;
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  const b = G.gActiveBattler;
  const oldStages = Int8Array.from(gBattleMons[b].statStages);
  const oldStatus2 = gBattleMons[b].status2;
  gBattleMons[b].bytes.set(gBattleBufferB[b].subarray(4, 4 + gBattleMons[b].bytes.length));
  gBattleMons[b].type1 = rom.species[gBattleMons[b].species].types[0];
  gBattleMons[b].type2 = rom.species[gBattleMons[b].species].types[1];
  gBattleMons[b].ability = GetAbilityBySpecies(gBattleMons[b].species, gBattleMons[b].abilityNum);
  const side = GetBattlerSide(b);
  if (gWishFutureKnock.knockedOffMons[side] & gBitTable[gBattlerPartyIndexes[b]]) gBattleMons[b].item = C.ITEM_NONE;
  if (gBattleMoves(G.gCurrentMove).effect === C.EFFECT_BATON_PASS) {
    for (let i = 0; i < C.NUM_BATTLE_STATS; i++) gBattleMons[b].statStages[i] = oldStages[i];
    gBattleMons[b].status2 = oldStatus2;
  }
  SwitchInClearSetData();
  gBattleScripting.battler = b;
  PREPARE_MON_NICK_BUFFER(gBattleTextBuff1, b, gBattlerPartyIndexes[b]);
  adv(2);
}

export function Cmd_switchinanim(): void {
  if (G.gBattleControllerExecFlags) return;
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  const b = G.gActiveBattler;
  if (GetBattlerSide(b) === C.B_SIDE_OPPONENT
    && !(G.gBattleTypeFlags & (C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_LEGENDARY | C.BATTLE_TYPE_OLD_MAN_TUTORIAL | C.BATTLE_TYPE_POKEDUDE | C.BATTLE_TYPE_EREADER_TRAINER | C.BATTLE_TYPE_GHOST)))
    HandleSetPokedexFlag(SpeciesToNationalPokedexNum(gBattleMons[b].species), C.FLAG_SET_SEEN, gBattleMons[b].personality);
  G.gAbsentBattlerFlags &= ~gBitTable[b];
  BtlController_EmitSwitchInAnim(BUFFER_A, gBattlerPartyIndexes[b], r8(cur() + 2));
  MarkBattlerForControllerExec(b);
  adv(3);
}

export function Cmd_jumpifcantswitch(): void {
  const arg = r8(cur() + 1);
  G.gActiveBattler = GetBattlerForBattleScript(arg & ~C.SWITCH_IGNORE_ESCAPE_PREVENTION);
  const b = G.gActiveBattler;
  if (!(arg & C.SWITCH_IGNORE_ESCAPE_PREVENTION)
    && ((gBattleMons[b].status2 & (C.STATUS2_WRAPPED | C.STATUS2_ESCAPE_PREVENTION)) || (gStatuses3[b] & C.STATUS3_ROOTED))) {
    G.gBattlescriptCurrInstr = r32(cur() + 2);
    return;
  }
  let battlerIn1: number;
  let battlerIn2: number;
  let party: (i: number) => Mon;
  if (GetBattlerSide(b) === C.B_SIDE_OPPONENT) {
    battlerIn1 = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
    battlerIn2 = G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE ? GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT) : battlerIn1;
    party = (i) => gEnemyParty[i];
  } else {
    battlerIn1 = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
    battlerIn2 = G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE ? GetBattlerAtPosition(C.B_POSITION_PLAYER_RIGHT) : battlerIn1;
    party = playerMon;
  }
  let i = 0;
  for (; i < 6; i++) {
    const mon = party(i);
    if (GetMonData(mon, C.MON_DATA_HP) !== 0 && GetMonData(mon, C.MON_DATA_SPECIES) !== C.SPECIES_NONE && !GetMonData(mon, C.MON_DATA_IS_EGG)
      && i !== gBattlerPartyIndexes[battlerIn1] && i !== gBattlerPartyIndexes[battlerIn2]) break;
  }
  if (i === 6) G.gBattlescriptCurrInstr = r32(cur() + 2);
  else adv(6);
}

function ChooseMonToSendOut(slotId: number): void {
  gBattleStruct.battlerPartyIndexes[G.gActiveBattler] = gBattlerPartyIndexes[G.gActiveBattler];
  BtlController_EmitChoosePokemon(BUFFER_A, C.PARTY_ACTION_SEND_OUT, slotId, C.ABILITY_NONE, battlerPartyOrders(G.gActiveBattler));
  MarkBattlerForControllerExec(G.gActiveBattler);
}

export function battlerPartyOrders(b: number): Uint8Array {
  return gBattleStruct.battlerPartyOrders.subarray(b * 3, b * 3 + 3);
}

export function Cmd_openpartyscreen(): void {
  let flags = 0;
  const jumpPtr = r32(cur() + 2);
  const arg = r8(cur() + 1);
  if (arg === C.BS_FAINTED_LINK_MULTIPLE_1) {
    if ((G.gBattleTypeFlags & (C.BATTLE_TYPE_DOUBLE | C.BATTLE_TYPE_MULTI)) !== C.BATTLE_TYPE_DOUBLE) {
      for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
        const b = G.gActiveBattler;
        if (G.gHitMarker & HITMARKER_FAINTED(b)) {
          if (HasNoMonsToSwitch(b, 6, 6)) {
            G.gAbsentBattlerFlags |= gBitTable[b];
            G.gHitMarker &= ~HITMARKER_FAINTED(b);
            BtlController_EmitLinkStandbyMsg(BUFFER_A, C.LINK_STANDBY_MSG_ONLY);
            MarkBattlerForControllerExec(b);
          } else if (!gSpecialStatuses[b].faintedHasReplacement) {
            ChooseMonToSendOut(6);
            gSpecialStatuses[b].faintedHasReplacement = 1;
          }
        } else {
          BtlController_EmitLinkStandbyMsg(BUFFER_A, C.LINK_STANDBY_MSG_ONLY);
          MarkBattlerForControllerExec(b);
        }
      }
    } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
      const bits = G.gHitMarker >>> 28;
      const handle = (battler: number, cond: boolean, slot: number, flagBit: number, skipFlag: number) => {
        if (!cond) return;
        G.gActiveBattler = battler;
        if (HasNoMonsToSwitch(battler, 6, 6)) {
          G.gAbsentBattlerFlags |= gBitTable[battler];
          G.gHitMarker &= ~HITMARKER_FAINTED(battler);
          BtlController_EmitCantSwitch(BUFFER_A);
          MarkBattlerForControllerExec(battler);
        } else if (!gSpecialStatuses[battler].faintedHasReplacement) {
          ChooseMonToSendOut(slot);
          gSpecialStatuses[battler].faintedHasReplacement = 1;
        } else if (skipFlag === 0 || !(flags & skipFlag)) {
          BtlController_EmitLinkStandbyMsg(BUFFER_A, C.LINK_STANDBY_MSG_ONLY);
          MarkBattlerForControllerExec(battler);
          flags |= flagBit;
        }
      };
      handle(0, !!(gBitTable[0] & bits), gBattleStruct.monToSwitchIntoId[2], 1, 0);
      handle(2, !!(gBitTable[2] & bits) && !(gBitTable[0] & bits), gBattleStruct.monToSwitchIntoId[0], 0, 1);
      handle(1, !!(gBitTable[1] & bits), gBattleStruct.monToSwitchIntoId[3], 2, 0);
      handle(3, !!(gBitTable[3] & bits) && !(gBitTable[1] & bits), gBattleStruct.monToSwitchIntoId[1], 0, 2);
      if (!gSpecialStatuses[0].faintedHasReplacement && !gSpecialStatuses[2].faintedHasReplacement && bits !== 0) {
        G.gActiveBattler = G.gAbsentBattlerFlags & gBitTable[0] ? 2 : 0;
        BtlController_EmitLinkStandbyMsg(BUFFER_A, C.LINK_STANDBY_MSG_ONLY);
        MarkBattlerForControllerExec(G.gActiveBattler);
      }
      if (!gSpecialStatuses[1].faintedHasReplacement && !gSpecialStatuses[3].faintedHasReplacement && bits !== 0) {
        G.gActiveBattler = G.gAbsentBattlerFlags & gBitTable[1] ? 3 : 1;
        BtlController_EmitLinkStandbyMsg(BUFFER_A, C.LINK_STANDBY_MSG_ONLY);
        MarkBattlerForControllerExec(G.gActiveBattler);
      }
    }
    adv(6);
  } else if (arg === C.BS_FAINTED_LINK_MULTIPLE_2) {
    if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI) && G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
      const bits = G.gHitMarker >>> 28;
      if (gBitTable[2] & bits && gBitTable[0] & bits) {
        G.gActiveBattler = 2;
        if (HasNoMonsToSwitch(2, gBattleBufferB[0][1], 6)) {
          G.gAbsentBattlerFlags |= gBitTable[2];
          G.gHitMarker &= ~HITMARKER_FAINTED(2);
          BtlController_EmitCantSwitch(BUFFER_A);
          MarkBattlerForControllerExec(2);
        } else if (!gSpecialStatuses[2].faintedHasReplacement) {
          ChooseMonToSendOut(gBattleStruct.monToSwitchIntoId[0]);
          gSpecialStatuses[2].faintedHasReplacement = 1;
        }
      }
      if (gBitTable[3] & bits && bits & gBitTable[1]) {
        G.gActiveBattler = 3;
        if (HasNoMonsToSwitch(3, gBattleBufferB[1][1], 6)) {
          G.gAbsentBattlerFlags |= gBitTable[3];
          G.gHitMarker &= ~HITMARKER_FAINTED(3);
          BtlController_EmitCantSwitch(BUFFER_A);
          MarkBattlerForControllerExec(3);
        } else if (!gSpecialStatuses[3].faintedHasReplacement) {
          ChooseMonToSendOut(gBattleStruct.monToSwitchIntoId[1]);
          gSpecialStatuses[3].faintedHasReplacement = 1;
        }
      }
    }
    adv(6);
    const bits = G.gHitMarker >>> 28;
    G.gBattlerFainted = 0;
    while (!(gBitTable[G.gBattlerFainted] & bits) && G.gBattlerFainted < G.gBattlersCount) G.gBattlerFainted++;
    if (G.gBattlerFainted === G.gBattlersCount) G.gBattlescriptCurrInstr = jumpPtr;
  } else {
    const caseId = arg & C.PARTY_SCREEN_OPTIONAL ? C.PARTY_ACTION_CHOOSE_MON : C.PARTY_ACTION_SEND_OUT;
    const battlerId = GetBattlerForBattleScript(arg & ~C.PARTY_SCREEN_OPTIONAL);
    if (gSpecialStatuses[battlerId].faintedHasReplacement) {
      adv(6);
    } else if (HasNoMonsToSwitch(battlerId, 6, 6)) {
      G.gActiveBattler = battlerId;
      G.gAbsentBattlerFlags |= gBitTable[battlerId];
      G.gHitMarker &= ~HITMARKER_FAINTED(battlerId);
      G.gBattlescriptCurrInstr = jumpPtr;
    } else {
      G.gActiveBattler = battlerId;
      gBattleStruct.battlerPartyIndexes[battlerId] = gBattlerPartyIndexes[battlerId];
      BtlController_EmitChoosePokemon(BUFFER_A, caseId, gBattleStruct.monToSwitchIntoId[battlerId ^ 2], 0, battlerPartyOrders(battlerId));
      MarkBattlerForControllerExec(battlerId);
      adv(6);
      if (GetBattlerPosition(battlerId) === C.B_POSITION_PLAYER_LEFT && gBattleResults.playerSwitchesCounter < 255) gBattleResults.playerSwitchesCounter++;
      if (G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI) {
        for (G.gActiveBattler = 0; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
          if (G.gActiveBattler !== battlerId) {
            BtlController_EmitLinkStandbyMsg(BUFFER_A, C.LINK_STANDBY_MSG_ONLY);
            MarkBattlerForControllerExec(G.gActiveBattler);
          }
        }
      } else {
        G.gActiveBattler = GetBattlerAtPosition(GetBattlerPosition(battlerId) ^ C.BIT_SIDE);
        if (G.gAbsentBattlerFlags & gBitTable[G.gActiveBattler]) G.gActiveBattler ^= C.BIT_FLANK;
        BtlController_EmitLinkStandbyMsg(BUFFER_A, C.LINK_STANDBY_MSG_ONLY);
        MarkBattlerForControllerExec(G.gActiveBattler);
      }
    }
  }
}

export function Cmd_switchhandleorder(): void {
  if (G.gBattleControllerExecFlags) return;
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  const b = G.gActiveBattler;
  switch (r8(cur() + 2)) {
    case 0:
      for (let i = 0; i < G.gBattlersCount; i++) {
        if (gBattleBufferB[i][0] === C.CONTROLLER_CHOSENMONRETURNVALUE) gBattleStruct.monToSwitchIntoId[i] = gBattleBufferB[i][1];
      }
      break;
    case 1:
      if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI)) UpdatePartyOwnerOnSwitch_NonMulti(b);
      break;
    case 2:
      gBattleCommunication[0] = gBattleBufferB[b][1];
      gBattleStruct.monToSwitchIntoId[b] = gBattleBufferB[b][1];
      UpdatePartyOwnerOnSwitch_NonMulti(b);
      PREPARE_SPECIES_BUFFER(gBattleTextBuff1, gBattleMons[G.gBattlerAttacker].species);
      PREPARE_MON_NICK_BUFFER(gBattleTextBuff2, b, gBattleBufferB[b][1]);
      break;
  }
  adv(3);
}

export function Cmd_switchineffects(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  const b = G.gActiveBattler;
  UpdateSentPokesToOpponentValue(b);
  G.gHitMarker &= ~HITMARKER_FAINTED(b);
  gSpecialStatuses[b].faintedHasReplacement = 0;
  const side = GetBattlerSide(b);
  if (!(gSideStatuses[side] & C.SIDE_STATUS_SPIKES_DAMAGED) && (gSideStatuses[side] & C.SIDE_STATUS_SPIKES)
    && !IS_BATTLER_OF_TYPE(b, C.TYPE_FLYING) && gBattleMons[b].ability !== C.ABILITY_LEVITATE) {
    gSideStatuses[side] |= C.SIDE_STATUS_SPIKES_DAMAGED;
    const spikesDmg = ((5 - gSideTimers[side].spikesAmount) * 2) & 0xff;
    G.gBattleMoveDamage = div(gBattleMons[b].maxHP, spikesDmg);
    if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
    gBattleScripting.battler = b;
    BattleScriptPushCursor();
    const arg = r8(cur() + 1);
    if (arg === C.BS_TARGET) G.gBattlescriptCurrInstr = BS("BattleScript_SpikesOnTarget");
    else if (arg === C.BS_ATTACKER) G.gBattlescriptCurrInstr = BS("BattleScript_SpikesOnAttacker");
    else G.gBattlescriptCurrInstr = BS("BattleScript_SpikesOnFaintedBattler");
  } else {
    if (gBattleMons[b].ability === C.ABILITY_TRUANT) gDisableStructs[b].truantCounter = 1;
    if (!AbilityBattleEffects(C.ABILITYEFFECT_ON_SWITCHIN, b, 0, 0, 0) && !ItemBattleEffects(C.ITEMEFFECT_ON_SWITCH_IN, b, false)) {
      gSideStatuses[side] &= ~C.SIDE_STATUS_SPIKES_DAMAGED;
      for (let i = 0; i < G.gBattlersCount; i++) if (gBattlerByTurnOrder[i] === b) gActionsByTurnOrder[i] = C.B_ACTION_CANCEL_PARTNER;
      for (let i = 0; i < G.gBattlersCount; i++) gBattleStruct.hpOnSwitchout[GetBattlerSide(i)] = gBattleMons[i].hp;
      if (r8(cur() + 1) === C.BS_FAINTED_LINK_MULTIPLE_1) {
        const bits = G.gHitMarker >>> 28;
        G.gBattlerFainted++;
        for (;;) {
          if (bits & gBitTable[G.gBattlerFainted] && !(G.gAbsentBattlerFlags & gBitTable[G.gBattlerFainted])) break;
          if (G.gBattlerFainted >= G.gBattlersCount) break;
          G.gBattlerFainted++;
        }
      }
      adv(2);
    }
  }
}

export function Cmd_trainerslidein(): void {
  G.gActiveBattler = !r8(cur() + 1) ? GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT) : GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
  BtlController_EmitTrainerSlide(BUFFER_A);
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(2);
}

export function Cmd_playse(): void {
  G.gActiveBattler = G.gBattlerAttacker;
  BtlController_EmitPlaySE(BUFFER_A, r16(cur() + 1));
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(3);
}

export function Cmd_fanfare(): void {
  G.gActiveBattler = G.gBattlerAttacker;
  BtlController_EmitPlayFanfare(BUFFER_A, r16(cur() + 1));
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(3);
}

export function Cmd_playfaintcry(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  BtlController_EmitFaintingCry(BUFFER_A);
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(2);
}

export function Cmd_endlinkbattle(): void {
  G.gActiveBattler = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
  BtlController_EmitEndLinkBattle(BUFFER_A, G.gBattleOutcome);
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(1);
}

export function Cmd_returntoball(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  BtlController_EmitReturnMonToBall(BUFFER_A, true);
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(2);
}

function GiveMoveToBattleMon(b: number, move: number): number {
  for (let i = 0; i < 4; i++) {
    if (!gBattleMons[b].moves[i]) {
      gBattleMons[b].moves[i] = move;
      gBattleMons[b].pp[i] = gBattleMoves(move).pp;
      return move;
    }
  }
  return C.MON_HAS_MAX_MOVES;
}

export function Cmd_handlelearnnewmove(): void {
  const learnedPtr = r32(cur() + 1);
  const nothingPtr = r32(cur() + 5);
  const mon = playerMon(gBattleStruct.expGetterMonId);
  const setMove = (m: number) => { G.gMoveToLearn = m; };
  let learnMove = MonTryLearningNewMove(mon, !!r8(cur() + 9), setMove);
  while (learnMove === C.MON_ALREADY_KNOWS_MOVE) learnMove = MonTryLearningNewMove(mon, false, setMove);
  if (learnMove === C.MOVE_NONE) {
    G.gBattlescriptCurrInstr = nothingPtr;
  } else if (learnMove === C.MON_HAS_MAX_MOVES) {
    adv(10);
  } else {
    G.gActiveBattler = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
    if (gBattlerPartyIndexes[G.gActiveBattler] === gBattleStruct.expGetterMonId && !(gBattleMons[G.gActiveBattler].status2 & C.STATUS2_TRANSFORMED))
      GiveMoveToBattleMon(G.gActiveBattler, learnMove);
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
      G.gActiveBattler = GetBattlerAtPosition(C.B_POSITION_PLAYER_RIGHT);
      if (gBattlerPartyIndexes[G.gActiveBattler] === gBattleStruct.expGetterMonId && !(gBattleMons[G.gActiveBattler].status2 & C.STATUS2_TRANSFORMED))
        GiveMoveToBattleMon(G.gActiveBattler, learnMove);
    }
    G.gBattlescriptCurrInstr = learnedPtr;
  }
}

function yesNoInput(onA: () => void, onB: () => void): void {
  if (JOY_NEW(DPAD_UP) && gBattleCommunication[C.CURSOR_POSITION] !== 0) {
    sound.playSE(C.SE_SELECT);
    BattleDestroyYesNoCursorAt();
    gBattleCommunication[C.CURSOR_POSITION] = 0;
    BattleCreateYesNoCursorAt();
  }
  if (JOY_NEW(DPAD_DOWN) && gBattleCommunication[C.CURSOR_POSITION] === 0) {
    sound.playSE(C.SE_SELECT);
    BattleDestroyYesNoCursorAt();
    gBattleCommunication[C.CURSOR_POSITION] = 1;
    BattleCreateYesNoCursorAt();
  }
  if (JOY_NEW(A_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    onA();
  } else if (JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    onB();
  }
}

function openYesNo(): void {
  HandleBattleWindow(23, 8, 29, 13, 0);
  BattlePutTextOnWindow(rom.text("gText_BattleYesNoChoice"), C.B_WIN_YESNO);
  gBattleScripting.learnMoveState++;
  gBattleCommunication[C.CURSOR_POSITION] = 0;
  BattleCreateYesNoCursorAt();
}

function SetBattleMonMoveSlot(b: number, move: number, slot: number): void {
  gBattleMons[b].moves[slot] = move;
  gBattleMons[b].pp[slot] = gBattleMoves(move).pp;
}

export function Cmd_yesnoboxlearnmove(): void {
  G.gActiveBattler = 0;
  switch (gBattleScripting.learnMoveState) {
    case 0:
      openYesNo();
      break;
    case 1:
      yesNoInput(() => {
        if (gBattleCommunication[1] === 0) {
          HandleBattleWindow(23, 8, 29, 13, WINDOW_CLEAR);
          BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
          gBattleScripting.learnMoveState++;
        } else {
          gBattleScripting.learnMoveState = 4;
        }
      }, () => { gBattleScripting.learnMoveState = 4; });
      break;
    case 2:
      if (!gPaletteFade.active) {
        FreeAllWindowBuffers();
        ShowSelectMovePokemonSummaryScreen(gBattleStruct.expGetterMonId, CalculatePlayerPartyCount() - 1, ReshowBattleScreenAfterMenu, G.gMoveToLearn);
        gBattleScripting.learnMoveState++;
      }
      break;
    case 3:
      if (!gPaletteFade.active && gMain.callback2 === BattleMainCB2) {
        const movePosition = GetMoveSlotToReplace();
        if (movePosition === 4) {
          gBattleScripting.learnMoveState = 4;
        } else {
          const mon = playerMon(gBattleStruct.expGetterMonId);
          const moveId = GetMonData(mon, C.MON_DATA_MOVE1 + movePosition);
          if (IsHMMove2(moveId)) {
            PrepareStringBattle(C.STRINGID_HMMOVESCANTBEFORGOTTEN, G.gActiveBattler);
            gBattleScripting.learnMoveState = 5;
          } else {
            G.gBattlescriptCurrInstr = r32(cur() + 1);
            PREPARE_MOVE_BUFFER(gBattleTextBuff2, moveId);
            RemoveMonPPBonus(mon, movePosition);
            SetMonMoveSlot(mon, G.gMoveToLearn, movePosition);
            if (gBattlerPartyIndexes[0] === gBattleStruct.expGetterMonId && MOVE_IS_PERMANENT(0, movePosition, gDisableStructs[0])) {
              RemoveBattleMonPPBonus(gBattleMons[0], movePosition);
              SetBattleMonMoveSlot(0, G.gMoveToLearn, movePosition);
            }
            if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && gBattlerPartyIndexes[2] === gBattleStruct.expGetterMonId && MOVE_IS_PERMANENT(2, movePosition, gDisableStructs[2])) {
              RemoveBattleMonPPBonus(gBattleMons[2], movePosition);
              SetBattleMonMoveSlot(2, G.gMoveToLearn, movePosition);
            }
          }
        }
      }
      break;
    case 4:
      HandleBattleWindow(23, 8, 29, 13, WINDOW_CLEAR);
      adv(5);
      break;
    case 5:
      if (G.gBattleControllerExecFlags === 0) gBattleScripting.learnMoveState = 2;
      break;
  }
}

export function Cmd_yesnoboxstoplearningmove(): void {
  switch (gBattleScripting.learnMoveState) {
    case 0:
      openYesNo();
      break;
    case 1:
      yesNoInput(() => {
        if (gBattleCommunication[1] !== 0) G.gBattlescriptCurrInstr = r32(cur() + 1);
        else adv(5);
        HandleBattleWindow(23, 8, 29, 13, WINDOW_CLEAR);
      }, () => {
        G.gBattlescriptCurrInstr = r32(cur() + 1);
        HandleBattleWindow(23, 8, 29, 13, WINDOW_CLEAR);
      });
      break;
  }
}
