// battle_ai_script_commands.c: the trainer AI script interpreter (scripts from data/battle_ai_scripts.s).
// battle_ai_switch_items.c (switching / item use) is appended below.

import * as C from "../generated/constants";
import { random } from "../random";
import { rom } from "../rom";
import { AIS, bs, ROM_BASE } from "./bscript";
import {
  G, gBattleMons, gBattleResources, gBattleResults, gBattleScripting, gBattleStruct, gBattlerPartyIndexes, gBitTable, gDisableStructs, gLastHitBy, gLastLandedMoves, gLastMoves,
  gSideStatuses, gSideTimers, gStatuses3,
} from "./globals";
import { gBattleMoves, TYPE_EFFECT_ATK_TYPE, TYPE_EFFECT_DEF_TYPE, TYPE_EFFECT_MULTIPLIER } from "./macros";
import { BtlController_EmitTwoReturnValues, BUFFER_B } from "./controllers";
import { AbilityBattleEffects, CheckMoveLimitations, GetBattlerAtPosition, GetBattlerPosition, GetBattlerSide, ItemId_GetHoldEffect } from "./util";
import { GetWhoStrikesFirst } from "./main";
import { AI_CalcDmg, AI_TypeCalc, TypeCalc } from "./cmds/part1";
import { GetGenderFromSpeciesAndPersonality, GetMonData, gEnemyParty, playerMon, type Mon } from "../pokemon/mon";

const AI_ACTION_DONE = 0x01;
const AI_ACTION_FLEE = 0x02;
const AI_ACTION_WATCH = 0x04;
const AI_ACTION_DO_NOT_ATTACK = 0x08;
const AI_ACTION_KEEP = 0xfe; // everything but AI_ACTION_DONE

const AI_EFFECTIVENESS_x4 = 160;
const AI_EFFECTIVENESS_x2 = 80;
const AI_EFFECTIVENESS_x1 = 40;
const AI_EFFECTIVENESS_x0_5 = 20;
const AI_EFFECTIVENESS_x0_25 = 10;
const AI_EFFECTIVENESS_x0 = 0;

const enum AIState { SettingUp, Processing, FinishedProcessing, DoNotProcess }

const AI = () => gBattleResources.ai;
const HISTORY = () => gBattleResources.battleHistory;

/** usedMoves[side][8] (u16) in struct BattleHistory. */
function usedMove(side: number, i: number): number {
  const b = HISTORY().usedMoves;
  const o = (side * 8 + i) * 2;
  return b[o] | (b[o + 1] << 8);
}
function setUsedMove(side: number, i: number, move: number): void {
  const b = HISTORY().usedMoves;
  const o = (side * 8 + i) * 2;
  b[o] = move & 0xff;
  b[o + 1] = (move >> 8) & 0xff;
}

let sAIScriptPtr = 0;

// T1_READ_* on the AI script blob
const a8 = (addr: number) => bs.ai[addr - ROM_BASE];
const a16 = (addr: number) => a8(addr) | (a8(addr + 1) << 8);
const a32 = (addr: number) => (a16(addr) | (a16(addr + 2) << 16)) >>> 0;
const arg = (i: number) => a8(sAIScriptPtr + i);
const jumpIf = (cond: boolean, ptrOffset: number, size: number) => {
  sAIScriptPtr = cond ? a32(sAIScriptPtr + ptrOffset) : sAIScriptPtr + size;
};
const battlerArg = () => (arg(1) === C.AI_USER ? G.gBattlerAttacker : G.gBattlerTarget);

/** Pointer operands of the *_ptr / if_in_* commands can point into the AI script blob or into the battle scripts' data. */
function ptr8(addr: number): number {
  return addr >= ROM_BASE && addr - ROM_BASE < bs.ai.length ? a8(addr) : 0;
}

const sDiscouragedPowerfulMoveEffects = [
  C.EFFECT_EXPLOSION, C.EFFECT_DREAM_EATER, C.EFFECT_RAZOR_WIND, C.EFFECT_SKY_ATTACK, C.EFFECT_RECHARGE, C.EFFECT_SKULL_BASH, C.EFFECT_SOLAR_BEAM,
  C.EFFECT_SPIT_UP, C.EFFECT_FOCUS_PUNCH, C.EFFECT_SUPERPOWER, C.EFFECT_ERUPTION, C.EFFECT_OVERHEAT,
];

export function BattleAI_HandleItemUseBeforeAISetup(): void {
  const h = HISTORY();
  h.clear();
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER && G.gTrainerBattleOpponent_A !== C.TRAINER_SECRET_BASE
    && !(G.gBattleTypeFlags & (C.BATTLE_TYPE_TRAINER_TOWER | C.BATTLE_TYPE_EREADER_TRAINER | C.BATTLE_TYPE_BATTLE_TOWER | C.BATTLE_TYPE_SAFARI | C.BATTLE_TYPE_LINK))) {
    const items = rom.trainers[G.gTrainerBattleOpponent_A]?.items ?? [];
    for (let i = 0; i < C.MAX_TRAINER_ITEMS; i++) {
      if (items[i]) {
        h.trainerItems[h.itemsNo] = items[i];
        h.itemsNo++;
      }
    }
  }
  BattleAI_SetupAIData();
}

export function BattleAI_SetupAIData(): void {
  const ai = AI();
  ai.clear();
  for (let i = 0; i < 4; i++) ai.score[i] = 100;
  const moveLimitations = CheckMoveLimitations(G.gActiveBattler, 0, 0xff);
  for (let i = 0; i < 4; i++) {
    if (gBitTable[i] & moveLimitations) ai.score[i] = 0;
    ai.simulatedRNG[i] = 100 - (random() % 16);
  }
  gBattleResources.AI_ScriptsStack.size = 0;
  G.gBattlerAttacker = G.gActiveBattler;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
    G.gBattlerTarget = random() & C.BIT_FLANK;
    if (G.gAbsentBattlerFlags & gBitTable[G.gBattlerTarget]) G.gBattlerTarget ^= C.BIT_FLANK;
  } else {
    G.gBattlerTarget = G.gBattlerAttacker ^ C.BIT_SIDE;
  }
  const flags = G.gBattleTypeFlags;
  if (flags & C.BATTLE_TYPE_SAFARI) {
    ai.aiFlags = C.AI_SCRIPT_SAFARI;
    return;
  }
  if (flags & C.BATTLE_TYPE_ROAMER) {
    ai.aiFlags = C.AI_SCRIPT_ROAMING;
    return;
  }
  if (!(flags & (C.BATTLE_TYPE_TRAINER_TOWER | C.BATTLE_TYPE_EREADER_TRAINER | C.BATTLE_TYPE_BATTLE_TOWER)) && G.gTrainerBattleOpponent_A !== C.TRAINER_SECRET_BASE) {
    if (flags & C.BATTLE_TYPE_WILD_SCRIPTED) {
      ai.aiFlags = C.AI_SCRIPT_CHECK_BAD_MOVE;
      return;
    }
    if (flags & C.BATTLE_TYPE_LEGENDARY_FRLG) {
      ai.aiFlags = C.AI_SCRIPT_CHECK_BAD_MOVE | C.AI_SCRIPT_TRY_TO_FAINT | C.AI_SCRIPT_CHECK_VIABILITY;
      return;
    }
  } else {
    ai.aiFlags = C.AI_SCRIPT_CHECK_BAD_MOVE | C.AI_SCRIPT_TRY_TO_FAINT | C.AI_SCRIPT_CHECK_VIABILITY;
    return;
  }
  ai.aiFlags = rom.trainers[G.gTrainerBattleOpponent_A]?.ai ?? 0;
}

export function BattleAI_ChooseMoveOrAction(): number {
  const ai = AI();
  RecordLastUsedMoveByTarget();
  while (ai.aiFlags !== 0) {
    if (ai.aiFlags & 1) {
      ai.aiState = AIState.SettingUp;
      BattleAI_DoAIProcessing();
    }
    ai.aiFlags = ai.aiFlags >>> 1;
    ai.aiLogicId++;
    ai.movesetIndex = 0;
  }
  if (ai.aiAction & AI_ACTION_FLEE) return C.AI_CHOICE_FLEE;
  if (ai.aiAction & AI_ACTION_WATCH) return C.AI_CHOICE_WATCH;
  // u8 currentMoveArray: scores compared as unsigned bytes like the C code
  const score = (i: number) => ai.score[i] & 0xff;
  let numOfBestMoves = 1;
  const currentMove = [score(0)];
  const considered = [0];
  for (let i = 1; i < 4; i++) {
    if (currentMove[0] < score(i)) {
      numOfBestMoves = 1;
      currentMove[0] = score(i);
      considered[0] = i;
    }
    if (currentMove[0] === score(i)) {
      currentMove[numOfBestMoves] = score(i);
      considered[numOfBestMoves++] = i;
    }
  }
  return considered[random() % numOfBestMoves];
}

function BattleAI_DoAIProcessing(): void {
  const ai = AI();
  while (ai.aiState !== AIState.FinishedProcessing) {
    switch (ai.aiState) {
      case AIState.DoNotProcess:
        break;
      case AIState.SettingUp:
        sAIScriptPtr = a32(AIS("gBattleAI_ScriptsTable") + ai.aiLogicId * 4);
        ai.moveConsidered = gBattleMons[G.gBattlerAttacker].pp[ai.movesetIndex] === 0 ? 0 : gBattleMons[G.gBattlerAttacker].moves[ai.movesetIndex];
        ai.aiState++;
        break;
      case AIState.Processing:
        if (ai.moveConsidered !== 0) {
          sBattleAICmdTable[arg(0)]();
        } else {
          ai.score[ai.movesetIndex] = 0;
          ai.aiAction |= AI_ACTION_DONE;
        }
        if (ai.aiAction & AI_ACTION_DONE) {
          ai.movesetIndex++;
          if (ai.movesetIndex < 4 && (ai.aiAction & AI_ACTION_DO_NOT_ATTACK) === 0) ai.aiState = AIState.SettingUp;
          else ai.aiState++;
          ai.aiAction &= AI_ACTION_KEEP;
        }
        break;
    }
  }
}

function RecordLastUsedMoveByTarget(): void {
  for (let i = 0; i < 8; i++) {
    if (usedMove(G.gBattlerTarget >> 1, i) === 0) {
      setUsedMove(G.gBattlerTarget >> 1, i, gLastMoves[G.gBattlerTarget]);
      return;
    }
  }
}

// ---------------------------------------------------------------- commands

const hpPercent = (b: number) => Math.trunc((100 * gBattleMons[b].hp) / gBattleMons[b].maxHP) >>> 0;
const funcResult = () => AI().funcResult;
const setResult = (v: number) => { AI().funcResult = v; };

function resetDamageCalc(): void {
  G.gDynamicBasePower = 0;
  gBattleStruct.dynamicMoveType = 0;
  gBattleScripting.dmgMultiplier = 1;
  G.gMoveResultFlags = 0;
  G.gCritMultiplier = 1;
}

/** TypeCalc result (from a base of 40) to the AI_EFFECTIVENESS_* scale. */
function normalizeEffectiveness(): void {
  if (G.gBattleMoveDamage === 120) G.gBattleMoveDamage = AI_EFFECTIVENESS_x2;
  if (G.gBattleMoveDamage === 240) G.gBattleMoveDamage = AI_EFFECTIVENESS_x4;
  if (G.gBattleMoveDamage === 30) G.gBattleMoveDamage = AI_EFFECTIVENESS_x0_5;
  if (G.gBattleMoveDamage === 15) G.gBattleMoveDamage = AI_EFFECTIVENESS_x0_25;
  if (G.gMoveResultFlags & C.MOVE_RESULT_DOESNT_AFFECT_FOE) G.gBattleMoveDamage = AI_EFFECTIVENESS_x0;
}

function simulatedDamage(): number {
  const ai = AI();
  resetDamageCalc();
  G.gCurrentMove = ai.moveConsidered;
  AI_CalcDmg(G.gBattlerAttacker, G.gBattlerTarget);
  TypeCalc(G.gCurrentMove, G.gBattlerAttacker, G.gBattlerTarget);
  return Math.trunc((G.gBattleMoveDamage * ai.simulatedRNG[ai.movesetIndex]) / 100);
}

function partyOf(which: number): (i: number) => Mon {
  return which === 1 ? (i) => gEnemyParty[i] : playerMon;
}

/** gBattleMons[b].moves[i] for i in 0..7: past index 3 this reads the following struct bytes, as in the C code. */
function battleMonMoveOob(b: number, i: number): number {
  const bytes = gBattleMons[b].bytes;
  return bytes[12 + i * 2] | (bytes[13 + i * 2] << 8);
}

function hasAttackingMove(): boolean {
  for (let i = 0; i < 4; i++) {
    const mv = gBattleMons[G.gBattlerAttacker].moves[i];
    if (mv !== 0 && gBattleMoves(mv).power !== 0) return true;
  }
  return false;
}

function inList(ptr: number, width: 1 | 2): boolean {
  const end = width === 1 ? 0xff : 0xffff;
  const read = (p: number) => (width === 1 ? ptr8(p) : ptr8(p) | (ptr8(p + 1) << 8));
  for (let p = ptr; read(p) !== end; p += width) if (funcResult() === read(p)) return true;
  return false;
}

function userHasMove(move: number): boolean {
  for (let i = 0; i < 4; i++) if (gBattleMons[G.gBattlerAttacker].moves[i] === move) return true;
  return false;
}

function targetUsedMove(move: number): boolean {
  for (let i = 0; i < 8; i++) if (usedMove(G.gBattlerTarget >> 1, i) === move) return true;
  return false;
}

function Cmd_get_how_powerful_move_is(): void {
  const ai = AI();
  const discouraged = (move: number) => sDiscouragedPowerfulMoveEffects.includes(gBattleMoves(move).effect);
  if (gBattleMoves(ai.moveConsidered).power > 1 && !discouraged(ai.moveConsidered)) {
    resetDamageCalc();
    const moveDmgs: number[] = [];
    for (let m = 0; m < 4; m++) {
      const mv = gBattleMons[G.gBattlerAttacker].moves[m];
      if (mv !== C.MOVE_NONE && !discouraged(mv) && gBattleMoves(mv).power > 1) {
        G.gCurrentMove = mv;
        AI_CalcDmg(G.gBattlerAttacker, G.gBattlerTarget);
        TypeCalc(G.gCurrentMove, G.gBattlerAttacker, G.gBattlerTarget);
        moveDmgs[m] = Math.trunc((G.gBattleMoveDamage * ai.simulatedRNG[m]) / 100);
        if (moveDmgs[m] === 0) moveDmgs[m] = 1;
      } else {
        moveDmgs[m] = 0;
      }
    }
    let m = 0;
    for (; m < 4; m++) if (moveDmgs[m] > moveDmgs[ai.movesetIndex]) break;
    setResult(m === 4 ? C.MOVE_MOST_POWERFUL : C.MOVE_NOT_MOST_POWERFUL);
  } else {
    setResult(C.MOVE_POWER_DISCOURAGED);
  }
  sAIScriptPtr++;
}

function Cmd_count_alive_pokemon(): void {
  setResult(0);
  const b = battlerArg();
  const party = GetBattlerSide(b) === C.B_SIDE_PLAYER ? playerMon : (i: number) => gEnemyParty[i];
  let onField1 = gBattlerPartyIndexes[b];
  let onField2 = gBattlerPartyIndexes[b];
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
    onField1 = gBattlerPartyIndexes[b];
    onField2 = gBattlerPartyIndexes[GetBattlerAtPosition(GetBattlerPosition(b) ^ C.BIT_FLANK)];
  }
  for (let i = 0; i < 6; i++) {
    const s = GetMonData(party(i), C.MON_DATA_SPECIES_OR_EGG);
    if (i !== onField1 && i !== onField2 && GetMonData(party(i), C.MON_DATA_HP) !== 0 && s !== C.SPECIES_NONE && s !== C.SPECIES_EGG) setResult(funcResult() + 1);
  }
  sAIScriptPtr += 2;
}

function Cmd_get_ability(): void {
  const b = battlerArg();
  const m = gBattleMons[b];
  if (GetBattlerSide(b) === C.AI_TARGET) {
    const side = b & C.BIT_SIDE;
    const known = HISTORY().abilities[side];
    if (known !== 0) {
      setResult(known);
    } else if (m.ability === C.ABILITY_SHADOW_TAG || m.ability === C.ABILITY_MAGNET_PULL || m.ability === C.ABILITY_ARENA_TRAP) {
      setResult(m.ability);
    } else {
      const [a0, a1] = rom.species[m.species].abilities;
      if (a0 !== C.ABILITY_NONE) setResult(a1 !== C.ABILITY_NONE ? (random() % 2 ? a0 : a1) : a0);
      else setResult(a1);
    }
  } else {
    setResult(m.ability);
  }
  sAIScriptPtr += 2;
}

function Cmd_get_highest_type_effectiveness(): void {
  resetDamageCalc();
  setResult(0);
  for (let i = 0; i < 4; i++) {
    G.gBattleMoveDamage = 40;
    G.gCurrentMove = gBattleMons[G.gBattlerAttacker].moves[i];
    if (G.gCurrentMove !== C.MOVE_NONE) {
      TypeCalc(G.gCurrentMove, G.gBattlerAttacker, G.gBattlerTarget);
      normalizeEffectiveness();
      if (funcResult() < G.gBattleMoveDamage) setResult(G.gBattleMoveDamage);
    }
  }
  sAIScriptPtr += 1;
}

function Cmd_if_type_effectiveness(): void {
  resetDamageCalc();
  G.gBattleMoveDamage = AI_EFFECTIVENESS_x1;
  G.gCurrentMove = AI().moveConsidered;
  TypeCalc(G.gCurrentMove, G.gBattlerAttacker, G.gBattlerTarget);
  normalizeEffectiveness();
  jumpIf((G.gBattleMoveDamage & 0xff) === arg(1), 2, 6);
}

function partyHasStatus(): boolean {
  const party = partyOf(arg(1));
  const status = a32(sAIScriptPtr + 2);
  for (let i = 0; i < 6; i++) {
    const mon = party(i);
    const species = GetMonData(mon, C.MON_DATA_SPECIES);
    if (species !== C.SPECIES_NONE && species !== C.SPECIES_EGG && GetMonData(mon, C.MON_DATA_HP) !== 0 && GetMonData(mon, C.MON_DATA_STATUS) === status) return true;
  }
  return false;
}

function Cmd_if_status_not_in_party(): void {
  // Bugged in the original: every match advances by 10 without returning, then the pointer read happens anyway.
  const party = partyOf(arg(1));
  const status = a32(sAIScriptPtr + 2);
  for (let i = 0; i < 6; i++) {
    const mon = party(i);
    const species = GetMonData(mon, C.MON_DATA_SPECIES);
    if (species !== C.SPECIES_NONE && species !== C.SPECIES_EGG && GetMonData(mon, C.MON_DATA_HP) !== 0 && GetMonData(mon, C.MON_DATA_STATUS) === status) sAIScriptPtr += 10;
  }
  sAIScriptPtr = a32(sAIScriptPtr + 6);
}

function Cmd_get_weather(): void {
  const w = G.gBattleWeather;
  if (w & C.B_WEATHER_RAIN) setResult(C.AI_WEATHER_RAIN);
  if (w & C.B_WEATHER_SANDSTORM) setResult(C.AI_WEATHER_SANDSTORM);
  if (w & C.B_WEATHER_SUN) setResult(C.AI_WEATHER_SUN);
  if (w & C.B_WEATHER_HAIL_TEMPORARY) setResult(C.AI_WEATHER_HAIL);
  sAIScriptPtr += 1;
}

function Cmd_if_has_move(want: boolean): void {
  const move = a16(sAIScriptPtr + 2);
  switch (arg(1)) {
    case C.AI_USER:
    case C.AI_USER_PARTNER:
      jumpIf(userHasMove(move) === want, 4, 8);
      break;
    case C.AI_TARGET:
    case C.AI_TARGET_PARTNER:
      jumpIf(targetUsedMove(move) === want, 4, 8);
      break;
  }
}

function Cmd_if_has_move_with_effect(): void {
  const effect = arg(2);
  switch (arg(1)) {
    case C.AI_USER:
    case C.AI_USER_PARTNER: {
      let found = false;
      for (let i = 0; i < 4; i++) {
        const mv = gBattleMons[G.gBattlerAttacker].moves[i];
        if (mv !== 0 && gBattleMoves(mv).effect === effect) found = true;
      }
      jumpIf(found, 3, 7);
      break;
    }
    case C.AI_TARGET:
    case C.AI_TARGET_PARTNER:
      // The C loop's result is unused: it always jumps.
      for (let i = 0; i < 8; i++) void battleMonMoveOob(G.gBattlerAttacker, i);
      sAIScriptPtr = a32(sAIScriptPtr + 3);
      break;
  }
}

function Cmd_if_doesnt_have_move_with_effect(): void {
  const effect = arg(2);
  switch (arg(1)) {
    case C.AI_USER:
    case C.AI_USER_PARTNER: {
      let found = false;
      for (let i = 0; i < 4; i++) {
        const mv = gBattleMons[G.gBattlerAttacker].moves[i];
        if (mv !== 0 && gBattleMoves(mv).effect === effect) found = true;
      }
      jumpIf(!found, 3, 7);
      break;
    }
    case C.AI_TARGET:
    case C.AI_TARGET_PARTNER:
      // Always skips in the original.
      sAIScriptPtr += 7;
      break;
  }
}

function Cmd_if_any_move_disabled_or_encored(): void {
  const b = battlerArg();
  if (arg(2) === 0) jumpIf(gDisableStructs[b].disabledMove !== C.MOVE_NONE, 3, 7);
  else if (arg(2) !== 1) sAIScriptPtr += 7;
  else jumpIf(gDisableStructs[b].encoredMove !== C.MOVE_NONE, 3, 7);
}

function Cmd_if_curr_move_disabled_or_encored(): void {
  const d = gDisableStructs[G.gActiveBattler];
  switch (arg(1)) {
    case 0: jumpIf(d.disabledMove === AI().moveConsidered, 2, 6); break;
    case 1: jumpIf(d.encoredMove === AI().moveConsidered, 2, 6); break;
    default: sAIScriptPtr += 6; break;
  }
}

function Cmd_if_random_safari_flee(): void {
  const bs2 = gBattleStruct;
  let rate: number;
  if (bs2.safariRockThrowCounter) {
    rate = (bs2.safariEscapeFactor * 2) & 0xff;
    if (rate > 20) rate = 20;
  } else if (bs2.safariBaitThrowCounter !== 0) {
    rate = bs2.safariEscapeFactor >> 2;
    if (rate === 0) rate = 1;
  } else {
    rate = bs2.safariEscapeFactor;
  }
  rate = (rate * 5) & 0xff;
  jumpIf((random() % 100 & 0xff) < rate, 1, 5);
}

function Cmd_get_hold_effect(): void {
  const b = battlerArg();
  if (GetBattlerSide(b) === C.B_SIDE_PLAYER) setResult(HISTORY().itemEffects[b & C.BIT_SIDE]);
  else setResult(ItemId_GetHoldEffect(gBattleMons[b].item));
  sAIScriptPtr += 2;
}

function Cmd_end(): void {
  const stack = gBattleResources.AI_ScriptsStack;
  if (stack.size !== 0) {
    stack.size--;
    sAIScriptPtr = stack.ptr[stack.size];
  } else {
    AI().aiAction |= AI_ACTION_DONE;
  }
}

function Cmd_if_level_compare(): void {
  const atk = gBattleMons[G.gBattlerAttacker].level;
  const def = gBattleMons[G.gBattlerTarget].level;
  switch (arg(1)) {
    case 0: jumpIf(atk > def, 2, 6); break;
    case 1: jumpIf(atk < def, 2, 6); break;
    case 2: jumpIf(atk === def, 2, 6); break;
  }
}

function nop(): void {}

const statusCmd = (get: (b: number) => number, want: boolean) => () => {
  jumpIf(((get(battlerArg()) & a32(sAIScriptPtr + 2)) !== 0) === want, 6, 10);
};

const sBattleAICmdTable: Array<() => void> = [
  () => jumpIf(random() % 256 < arg(1), 2, 6), // 0x00 if_random_less_than
  () => jumpIf(random() % 256 > arg(1), 2, 6), // 0x01
  () => jumpIf(random() % 256 === arg(1), 2, 6), // 0x02
  () => jumpIf(random() % 256 !== arg(1), 2, 6), // 0x03
  () => { // 0x04 score
    const ai = AI();
    ai.score[ai.movesetIndex] += (arg(1) << 24) >> 24;
    if (ai.score[ai.movesetIndex] < 0) ai.score[ai.movesetIndex] = 0;
    sAIScriptPtr += 2;
  },
  () => jumpIf(hpPercent(battlerArg()) < arg(2), 3, 7), // 0x05 if_hp_less_than
  () => jumpIf(hpPercent(battlerArg()) > arg(2), 3, 7),
  () => jumpIf(hpPercent(battlerArg()) === arg(2), 3, 7),
  () => jumpIf(hpPercent(battlerArg()) !== arg(2), 3, 7),
  statusCmd((b) => gBattleMons[b].status1, true), // 0x09
  statusCmd((b) => gBattleMons[b].status1, false),
  statusCmd((b) => gBattleMons[b].status2, true),
  statusCmd((b) => gBattleMons[b].status2, false),
  statusCmd((b) => gStatuses3[b], true),
  statusCmd((b) => gStatuses3[b], false),
  statusCmd((b) => gSideStatuses[b & C.BIT_SIDE], true), // 0x0F if_side_affecting
  statusCmd((b) => gSideStatuses[b & C.BIT_SIDE], false),
  () => jumpIf(funcResult() < arg(1), 2, 6), // 0x11 if_less_than
  () => jumpIf(funcResult() > arg(1), 2, 6),
  () => jumpIf(funcResult() === arg(1), 2, 6),
  () => jumpIf(funcResult() !== arg(1), 2, 6),
  () => jumpIf(funcResult() < ptr8(a32(sAIScriptPtr + 1)), 5, 9), // 0x15 if_less_than_ptr
  () => jumpIf(funcResult() > ptr8(a32(sAIScriptPtr + 1)), 5, 9),
  () => jumpIf(funcResult() === ptr8(a32(sAIScriptPtr + 1)), 5, 9),
  () => jumpIf(funcResult() !== ptr8(a32(sAIScriptPtr + 1)), 5, 9),
  () => jumpIf(AI().moveConsidered === a16(sAIScriptPtr + 1), 3, 7), // 0x19 if_move
  () => jumpIf(AI().moveConsidered !== a16(sAIScriptPtr + 1), 3, 7),
  () => jumpIf(inList(a32(sAIScriptPtr + 1), 1), 5, 9), // 0x1B if_in_bytes
  () => jumpIf(!inList(a32(sAIScriptPtr + 1), 1), 5, 9),
  () => jumpIf(inList(a32(sAIScriptPtr + 1), 2), 5, 9), // 0x1D if_in_hwords
  () => jumpIf(!inList(a32(sAIScriptPtr + 1), 2), 5, 9),
  () => jumpIf(hasAttackingMove(), 1, 5), // 0x1F if_user_has_attacking_move
  () => jumpIf(!hasAttackingMove(), 1, 5),
  () => { setResult(gBattleResults.battleTurnCounter); sAIScriptPtr += 1; }, // 0x21 get_turn_count
  () => { // 0x22 get_type
    switch (arg(1)) {
      case C.AI_TYPE1_USER: setResult(gBattleMons[G.gBattlerAttacker].type1); break;
      case C.AI_TYPE1_TARGET: setResult(gBattleMons[G.gBattlerTarget].type1); break;
      case C.AI_TYPE2_USER: setResult(gBattleMons[G.gBattlerAttacker].type2); break;
      case C.AI_TYPE2_TARGET: setResult(gBattleMons[G.gBattlerTarget].type2); break;
      case C.AI_TYPE_MOVE: setResult(gBattleMoves(AI().moveConsidered).type); break;
    }
    sAIScriptPtr += 2;
  },
  () => { setResult(gBattleMoves(AI().moveConsidered).power); sAIScriptPtr += 1; }, // 0x23
  Cmd_get_how_powerful_move_is, // 0x24
  () => { setResult(gLastMoves[battlerArg()]); sAIScriptPtr += 2; }, // 0x25
  () => jumpIf(arg(1) === funcResult(), 2, 6), // 0x26 if_equal_
  () => jumpIf(arg(1) !== funcResult(), 2, 6),
  () => jumpIf(GetWhoStrikesFirst(G.gBattlerAttacker, G.gBattlerTarget, true) === arg(1), 2, 6), // 0x28
  () => jumpIf(GetWhoStrikesFirst(G.gBattlerAttacker, G.gBattlerTarget, true) !== arg(1), 2, 6),
  nop, nop, // 0x2A, 0x2B
  Cmd_count_alive_pokemon, // 0x2C
  () => { setResult(AI().moveConsidered); sAIScriptPtr += 1; }, // 0x2D
  () => { setResult(gBattleMoves(AI().moveConsidered).effect); sAIScriptPtr += 1; }, // 0x2E
  Cmd_get_ability, // 0x2F
  Cmd_get_highest_type_effectiveness, // 0x30
  Cmd_if_type_effectiveness, // 0x31
  nop, nop, // 0x32, 0x33
  () => jumpIf(partyHasStatus(), 6, 10), // 0x34 if_status_in_party
  Cmd_if_status_not_in_party, // 0x35
  Cmd_get_weather, // 0x36
  () => jumpIf(gBattleMoves(AI().moveConsidered).effect === arg(1), 2, 6), // 0x37 if_effect
  () => jumpIf(gBattleMoves(AI().moveConsidered).effect !== arg(1), 2, 6),
  () => jumpIf(gBattleMons[battlerArg()].statStages[arg(2)] < arg(3), 4, 8), // 0x39
  () => jumpIf(gBattleMons[battlerArg()].statStages[arg(2)] > arg(3), 4, 8),
  () => jumpIf(gBattleMons[battlerArg()].statStages[arg(2)] === arg(3), 4, 8),
  () => jumpIf(gBattleMons[battlerArg()].statStages[arg(2)] !== arg(3), 4, 8),
  () => { // 0x3D if_can_faint
    if (gBattleMoves(AI().moveConsidered).power < 2) { sAIScriptPtr += 5; return; }
    G.gBattleMoveDamage = simulatedDamage();
    if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
    jumpIf(gBattleMons[G.gBattlerTarget].hp <= G.gBattleMoveDamage, 1, 5);
  },
  () => { // 0x3E if_cant_faint (no 0 -> 1 clamp in the original)
    if (gBattleMoves(AI().moveConsidered).power < 2) { sAIScriptPtr += 5; return; }
    G.gBattleMoveDamage = simulatedDamage();
    jumpIf(gBattleMons[G.gBattlerTarget].hp > G.gBattleMoveDamage, 1, 5);
  },
  () => Cmd_if_has_move(true), // 0x3F
  () => Cmd_if_has_move(false), // 0x40
  Cmd_if_has_move_with_effect, // 0x41
  Cmd_if_doesnt_have_move_with_effect, // 0x42
  Cmd_if_any_move_disabled_or_encored, // 0x43
  Cmd_if_curr_move_disabled_or_encored, // 0x44
  () => { AI().aiAction |= AI_ACTION_DONE | AI_ACTION_FLEE | AI_ACTION_DO_NOT_ATTACK; }, // 0x45 flee
  Cmd_if_random_safari_flee, // 0x46
  () => { AI().aiAction |= AI_ACTION_DONE | AI_ACTION_WATCH | AI_ACTION_DO_NOT_ATTACK; }, // 0x47 watch
  Cmd_get_hold_effect, // 0x48
  () => { // 0x49 get_gender
    const m = gBattleMons[battlerArg()];
    setResult(GetGenderFromSpeciesAndPersonality(m.species, m.personality));
    sAIScriptPtr += 2;
  },
  () => { setResult(gDisableStructs[battlerArg()].isFirstTurn); sAIScriptPtr += 2; }, // 0x4A
  () => { setResult(gDisableStructs[battlerArg()].stockpileCounter); sAIScriptPtr += 2; }, // 0x4B
  () => { setResult(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE); sAIScriptPtr += 1; }, // 0x4C
  () => { setResult(gBattleStruct.usedHeldItems[battlerArg()] & 0xff); sAIScriptPtr += 2; }, // 0x4D (low byte of u16[battlerId])
  () => { setResult(gBattleMoves(funcResult()).type); sAIScriptPtr += 1; }, // 0x4E
  () => { setResult(gBattleMoves(funcResult()).power); sAIScriptPtr += 1; }, // 0x4F
  () => { setResult(gBattleMoves(funcResult()).effect); sAIScriptPtr += 1; }, // 0x50
  () => { setResult(gDisableStructs[battlerArg()].protectUses); sAIScriptPtr += 2; }, // 0x51
  nop, nop, nop, nop, nop, nop, // 0x52-0x57
  () => { // 0x58 call
    const stack = gBattleResources.AI_ScriptsStack;
    stack.ptr[stack.size++] = sAIScriptPtr + 5;
    sAIScriptPtr = a32(sAIScriptPtr + 1);
  },
  () => { sAIScriptPtr = a32(sAIScriptPtr + 1); }, // 0x59 goto
  Cmd_end, // 0x5A
  Cmd_if_level_compare, // 0x5B
  () => jumpIf(gDisableStructs[G.gBattlerTarget].tauntTimer !== 0, 1, 5), // 0x5C
  () => jumpIf(gDisableStructs[G.gBattlerTarget].tauntTimer === 0, 1, 5), // 0x5D
];

// ---------------------------------------------------------------- battle_ai_switch_items.c

const aiMonToSwitch = () => gBattleStruct.AI_monToSwitchIntoId;
const aiSlot = () => GetBattlerPosition(G.gActiveBattler) >> 1;

function emitSwitch(monId: number): true {
  aiMonToSwitch()[aiSlot()] = monId;
  BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_SWITCH, 0);
  return true;
}

function enemyUsable(i: number): boolean {
  const s = GetMonData(gEnemyParty[i], C.MON_DATA_SPECIES_OR_EGG);
  return GetMonData(gEnemyParty[i], C.MON_DATA_HP) !== 0 && s !== C.SPECIES_NONE && s !== C.SPECIES_EGG;
}

/** The two battlers on the AI's side that are (or will be) on the field. */
function battlersIn(): [number, number] {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
    const partner = GetBattlerAtPosition(GetBattlerPosition(G.gActiveBattler) ^ C.BIT_FLANK);
    return [G.gActiveBattler, G.gAbsentBattlerFlags & gBitTable[partner] ? G.gActiveBattler : partner];
  }
  return [G.gActiveBattler, G.gActiveBattler];
}

function isOnFieldOrIncoming(i: number, b1: number, b2: number): boolean {
  const next = gBattleStruct.monToSwitchIntoId;
  return i === gBattlerPartyIndexes[b1] || i === gBattlerPartyIndexes[b2] || i === next[b1] || i === next[b2];
}

function enemyMonAbility(i: number): number {
  const species = GetMonData(gEnemyParty[i], C.MON_DATA_SPECIES);
  return GetMonData(gEnemyParty[i], C.MON_DATA_ABILITY_NUM) !== C.ABILITY_NONE ? rom.species[species].abilities[1] : rom.species[species].abilities[0];
}

function ShouldSwitchIfPerishSong(): boolean {
  if (gStatuses3[G.gActiveBattler] & C.STATUS3_PERISH_SONG && gDisableStructs[G.gActiveBattler].perishSongTimer === 0) return emitSwitch(C.PARTY_SIZE);
  return false;
}

function ShouldSwitchIfWonderGuard(): boolean {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) return false;
  const opp = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
  if (gBattleMons[opp].ability !== C.ABILITY_WONDER_GUARD) return false;
  for (let i = 0; i < 4; i++) {
    const move = gBattleMons[G.gActiveBattler].moves[i];
    if (move !== C.MOVE_NONE && AI_TypeCalc(move, gBattleMons[opp].species, gBattleMons[opp].ability) & C.MOVE_RESULT_SUPER_EFFECTIVE) return false;
  }
  for (let i = 0; i < C.PARTY_SIZE; i++) {
    if (!enemyUsable(i) || i === gBattlerPartyIndexes[G.gActiveBattler]) continue;
    for (let j = 0; j < 4; j++) {
      const move = GetMonData(gEnemyParty[i], C.MON_DATA_MOVE1 + j);
      if (move === C.MOVE_NONE) continue;
      if (AI_TypeCalc(move, gBattleMons[opp].species, gBattleMons[opp].ability) & C.MOVE_RESULT_SUPER_EFFECTIVE && random() % 3 < 2) return emitSwitch(i);
    }
  }
  return false;
}

function FindMonThatAbsorbsOpponentsMove(): boolean {
  const last = gLastLandedMoves[G.gActiveBattler];
  if ((HasSuperEffectiveMoveAgainstOpponents(true) && random() % 3) || last === C.MOVE_NONE) return false;
  if (last === 0xffff || gBattleMoves(last).power === 0) return false;
  const [b1, b2] = battlersIn();
  let absorbing: number;
  const type = gBattleMoves(last).type;
  if (type === C.TYPE_FIRE) absorbing = C.ABILITY_FLASH_FIRE;
  else if (type === C.TYPE_WATER) absorbing = C.ABILITY_WATER_ABSORB;
  else if (type === C.TYPE_ELECTRIC) absorbing = C.ABILITY_VOLT_ABSORB;
  else return false;
  if (gBattleMons[G.gActiveBattler].ability === absorbing) return false;
  for (let i = 0; i < C.PARTY_SIZE; i++) {
    if (!enemyUsable(i) || isOnFieldOrIncoming(i, b1, b2)) continue;
    if (absorbing === enemyMonAbility(i) && random() & 1) return emitSwitch(i);
  }
  return false;
}

function ShouldSwitchIfNaturalCure(): boolean {
  const m = gBattleMons[G.gActiveBattler];
  if (!(m.status1 & C.STATUS1_SLEEP) || m.ability !== C.ABILITY_NATURAL_CURE || m.hp < (m.maxHP >> 1)) return false;
  const last = gLastLandedMoves[G.gActiveBattler];
  if ((last === C.MOVE_NONE || last === 0xffff) && random() & 1) return emitSwitch(C.PARTY_SIZE);
  if (gBattleMoves(last).power === 0 && random() & 1) return emitSwitch(C.PARTY_SIZE);
  if (FindMonWithFlagsAndSuperEffective(C.MOVE_RESULT_DOESNT_AFFECT_FOE, 1) || FindMonWithFlagsAndSuperEffective(C.MOVE_RESULT_NOT_VERY_EFFECTIVE, 1)) return true;
  if (random() & 1) return emitSwitch(C.PARTY_SIZE);
  return false;
}

function HasSuperEffectiveMoveAgainstOpponents(noRng: boolean): boolean {
  for (const pos of [C.B_POSITION_PLAYER_LEFT, C.B_POSITION_PLAYER_LEFT ^ C.BIT_FLANK]) {
    if (pos !== C.B_POSITION_PLAYER_LEFT && !(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE)) return false;
    const opp = GetBattlerAtPosition(pos);
    if (G.gAbsentBattlerFlags & gBitTable[opp]) continue;
    for (let i = 0; i < 4; i++) {
      const move = gBattleMons[G.gActiveBattler].moves[i];
      if (move === C.MOVE_NONE) continue;
      if (AI_TypeCalc(move, gBattleMons[opp].species, gBattleMons[opp].ability) & C.MOVE_RESULT_SUPER_EFFECTIVE && (noRng || random() % 10)) return true;
    }
  }
  return false;
}

function AreStatsRaised(): boolean {
  let buffed = 0;
  for (let i = 0; i < C.NUM_BATTLE_STATS; i++) {
    const st = gBattleMons[G.gActiveBattler].statStages[i];
    if (st > 6) buffed = (buffed + st - 6) & 0xff;
  }
  return buffed > 3;
}

function FindMonWithFlagsAndSuperEffective(flags: number, moduloPercent: number): boolean {
  const last = gLastLandedMoves[G.gActiveBattler];
  if (last === 0) return false;
  if (last === 0xffff || gLastHitBy[G.gActiveBattler] === 0xff || gBattleMoves(last).power === 0) return false;
  const [b1, b2] = battlersIn();
  for (let i = 0; i < C.PARTY_SIZE; i++) {
    if (!enemyUsable(i) || isOnFieldOrIncoming(i, b1, b2)) continue;
    const species = GetMonData(gEnemyParty[i], C.MON_DATA_SPECIES);
    if (AI_TypeCalc(last, species, enemyMonAbility(i)) & flags) {
      const hitter = gLastHitBy[G.gActiveBattler];
      for (let j = 0; j < 4; j++) {
        const move = GetMonData(gEnemyParty[i], C.MON_DATA_MOVE1 + j);
        if (move === C.MOVE_NONE) continue;
        if (AI_TypeCalc(move, gBattleMons[hitter].species, gBattleMons[hitter].ability) & C.MOVE_RESULT_SUPER_EFFECTIVE && random() % moduloPercent === 0) return emitSwitch(i);
      }
    }
  }
  return false;
}

function ShouldSwitch(): boolean {
  const a = G.gActiveBattler;
  if (gBattleMons[a].status2 & (C.STATUS2_WRAPPED | C.STATUS2_ESCAPE_PREVENTION) || gStatuses3[a] & C.STATUS3_ROOTED
    || AbilityBattleEffects(C.ABILITYEFFECT_CHECK_OTHER_SIDE, a, C.ABILITY_SHADOW_TAG, 0, 0)
    || AbilityBattleEffects(C.ABILITYEFFECT_CHECK_OTHER_SIDE, a, C.ABILITY_ARENA_TRAP, 0, 0)) return false; // misses the flying/levitate check
  if (AbilityBattleEffects(C.ABILITYEFFECT_FIELD_SPORT, 0, C.ABILITY_MAGNET_PULL, 0, 0)
    && (gBattleMons[a].type1 === C.TYPE_STEEL || gBattleMons[a].type2 === C.TYPE_STEEL)) return false;
  const [b1, b2] = battlersIn();
  let available = 0;
  for (let i = 0; i < C.PARTY_SIZE; i++) if (enemyUsable(i) && !isOnFieldOrIncoming(i, b1, b2)) available++;
  if (!available) return false;
  if (ShouldSwitchIfPerishSong() || ShouldSwitchIfWonderGuard() || FindMonThatAbsorbsOpponentsMove() || ShouldSwitchIfNaturalCure()) return true;
  if (HasSuperEffectiveMoveAgainstOpponents(false) || AreStatsRaised()) return false;
  return FindMonWithFlagsAndSuperEffective(C.MOVE_RESULT_DOESNT_AFFECT_FOE, 2) || FindMonWithFlagsAndSuperEffective(C.MOVE_RESULT_NOT_VERY_EFFECTIVE, 3);
}

export function AI_TrySwitchOrUseItem(): void {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) {
    if (ShouldSwitch()) {
      if (aiMonToSwitch()[aiSlot()] === 6) {
        let monToSwitchId = GetMostSuitableMonToSwitchInto();
        if (monToSwitchId === 6) {
          const b1 = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
          const b2 = G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE ? GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT) : b1;
          for (monToSwitchId = 0; monToSwitchId < C.PARTY_SIZE; monToSwitchId++) {
            // `!GetMonData(...) == 0` in the original: true when HP is nonzero.
            if (GetMonData(gEnemyParty[monToSwitchId], C.MON_DATA_HP) !== 0 && !isOnFieldOrIncoming(monToSwitchId, b1, b2)) break;
          }
        }
        aiMonToSwitch()[aiSlot()] = monToSwitchId;
      }
      gBattleStruct.monToSwitchIntoId[G.gActiveBattler] = aiMonToSwitch()[aiSlot()];
      return;
    } else if (ShouldUseItem()) {
      return;
    }
  }
  BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_USE_MOVE, (G.gActiveBattler ^ C.BIT_SIDE) << 8);
}

function ModulateByTypeEffectiveness(atkType: number, defType1: number, defType2: number, v: number): number {
  for (let i = 0; TYPE_EFFECT_ATK_TYPE(i) !== C.TYPE_ENDTABLE; i += 3) {
    if (TYPE_EFFECT_ATK_TYPE(i) === C.TYPE_FORESIGHT) continue;
    if (TYPE_EFFECT_ATK_TYPE(i) === atkType) {
      if (TYPE_EFFECT_DEF_TYPE(i) === defType1) v = Math.trunc((v * TYPE_EFFECT_MULTIPLIER(i)) / 10) & 0xff;
      if (TYPE_EFFECT_DEF_TYPE(i) === defType2 && defType1 !== defType2) v = Math.trunc((v * TYPE_EFFECT_MULTIPLIER(i)) / 10) & 0xff;
    }
  }
  return v;
}

export function GetMostSuitableMonToSwitchInto(): number {
  if (gBattleStruct.monToSwitchIntoId[G.gActiveBattler] !== C.PARTY_SIZE) return gBattleStruct.monToSwitchIntoId[G.gActiveBattler];
  const [b1, b2] = battlersIn();
  let opp: number;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
    opp = random() & C.BIT_FLANK;
    if (G.gAbsentBattlerFlags & gBitTable[opp]) opp ^= C.BIT_FLANK;
  } else {
    opp = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
  }
  let invalidMons = 0;
  let bestDmg: number;
  let bestMonId: number;
  while (invalidMons !== 0x3f) {
    bestDmg = 0;
    bestMonId = 6;
    for (let i = 0; i < C.PARTY_SIZE; i++) {
      const species = GetMonData(gEnemyParty[i], C.MON_DATA_SPECIES);
      if (species !== C.SPECIES_NONE && GetMonData(gEnemyParty[i], C.MON_DATA_HP) !== 0 && !(gBitTable[i] & invalidMons) && !isOnFieldOrIncoming(i, b1, b2)) {
        const [t1, t2] = rom.species[species].types;
        let typeDmg = 10;
        typeDmg = ModulateByTypeEffectiveness(gBattleMons[opp].type1, t1, t2, typeDmg);
        typeDmg = ModulateByTypeEffectiveness(gBattleMons[opp].type2, t1, t2, typeDmg);
        if (bestDmg < typeDmg) {
          bestDmg = typeDmg;
          bestMonId = i;
        }
      } else {
        invalidMons |= gBitTable[i];
      }
    }
    if (bestMonId !== C.PARTY_SIZE) {
      let i = 0;
      for (; i < 4; i++) {
        const move = GetMonData(gEnemyParty[bestMonId], C.MON_DATA_MOVE1 + i);
        if (move !== C.MOVE_NONE && TypeCalc(move, G.gActiveBattler, opp) & C.MOVE_RESULT_SUPER_EFFECTIVE) break;
      }
      if (i !== 4) return bestMonId;
      invalidMons |= gBitTable[bestMonId];
    } else {
      invalidMons = 0x3f;
    }
  }
  resetDamageCalc();
  bestDmg = 0;
  bestMonId = 6;
  for (let i = 0; i < C.PARTY_SIZE; i++) {
    if ((GetMonData(gEnemyParty[i], C.MON_DATA_SPECIES) & 0xffff) === C.SPECIES_NONE || GetMonData(gEnemyParty[i], C.MON_DATA_HP) === 0 || isOnFieldOrIncoming(i, b1, b2)) continue;
    for (let j = 0; j < 4; j++) {
      const move = GetMonData(gEnemyParty[i], C.MON_DATA_MOVE1 + j);
      G.gBattleMoveDamage = 0;
      if (move !== C.MOVE_NONE && gBattleMoves(move).power !== 1) {
        AI_CalcDmg(G.gActiveBattler, opp);
        TypeCalc(move, G.gActiveBattler, opp);
      }
      // bestDmg is a u8 in the original
      if (bestDmg < G.gBattleMoveDamage) {
        bestDmg = G.gBattleMoveDamage & 0xff;
        bestMonId = i;
      }
    }
  }
  return bestMonId;
}

function GetAI_ItemType(itemId: number, e: number[]): number {
  if ((itemId & 0xff) === (C.ITEM_FULL_RESTORE & 0xff)) return C.AI_ITEM_FULL_RESTORE; // u8 itemId in the original
  if (e[4] & C.ITEM4_HEAL_HP) return C.AI_ITEM_HEAL_HP;
  if (e[3] & C.ITEM3_STATUS_ALL) return C.AI_ITEM_CURE_CONDITION;
  if (e[0] & (C.ITEM0_DIRE_HIT | C.ITEM0_X_ATTACK) || e[1] !== 0 || e[2] !== 0) return C.AI_ITEM_X_STAT;
  if (e[3] & C.ITEM3_GUARD_SPEC) return C.AI_ITEM_GUARD_SPECS;
  return C.AI_ITEM_NOT_RECOGNIZABLE;
}

/** pokemon.c GetItemEffectParamOffset, for effect byte 4 (the only one the AI asks about). */
function GetItemEffectParamOffset4(e: number[], effectBit: number): number {
  let offset = C.ITEM_EFFECT_ARG_START;
  let val = e[4] & ~C.ITEM4_PP_UP;
  for (let j = 0; val; j++, val >>= 1, effectBit >>= 1) {
    if (!(val & 1)) continue;
    switch (j) {
      case 2:
        if (val & (C.ITEM4_REVIVE >> 2)) val &= ~(C.ITEM4_REVIVE >> 2);
      // fallthrough
      case 0:
      case 1:
      case 3:
        if (val & effectBit) return offset;
        offset++;
        break;
      case 7:
        return 0;
    }
  }
  return 0;
}

function ShouldUseItem(): boolean {
  const a = G.gActiveBattler;
  const m = gBattleMons[a];
  const h = HISTORY();
  let validMons = 0;
  let shouldUse = false;
  for (let i = 0; i < C.PARTY_SIZE; i++) if (enemyUsable(i)) validMons++;
  for (let i = 0; i < C.MAX_TRAINER_ITEMS; i++) {
    if (i && validMons > h.itemsNo - i + 1) continue;
    const item = h.trainerItems[i];
    const e = item === C.ITEM_NONE ? null : rom.itemEffects[item - C.ITEM_POTION];
    if (!e) continue;
    const slot = a >> 1;
    gBattleStruct.AI_itemType[slot] = GetAI_ItemType(item, e);
    switch (gBattleStruct.AI_itemType[slot]) {
      case C.AI_ITEM_FULL_RESTORE:
        if (m.hp >= (m.maxHP >> 2) || m.hp === 0) break;
        shouldUse = true;
        break;
      case C.AI_ITEM_HEAL_HP: {
        const paramOffset = GetItemEffectParamOffset4(e, 4);
        if (paramOffset === 0 || m.hp === 0) break;
        if (m.hp < (m.maxHP >> 2) || m.maxHP - m.hp > e[paramOffset]) shouldUse = true;
        break;
      }
      case C.AI_ITEM_CURE_CONDITION: {
        let f = 0;
        if (e[3] & C.ITEM3_SLEEP && m.status1 & C.STATUS1_SLEEP) f |= 0x20;
        if (e[3] & C.ITEM3_POISON && m.status1 & (C.STATUS1_POISON | C.STATUS1_TOXIC_POISON)) f |= 0x10;
        if (e[3] & C.ITEM3_BURN && m.status1 & C.STATUS1_BURN) f |= 0x8;
        if (e[3] & C.ITEM3_FREEZE && m.status1 & C.STATUS1_FREEZE) f |= 0x4;
        if (e[3] & C.ITEM3_PARALYSIS && m.status1 & C.STATUS1_PARALYSIS) f |= 0x2;
        if (e[3] & C.ITEM3_CONFUSION && m.status2 & C.STATUS2_CONFUSION) f |= 0x1;
        gBattleStruct.AI_itemFlags[slot] = f;
        if (f) shouldUse = true;
        break;
      }
      case C.AI_ITEM_X_STAT: {
        gBattleStruct.AI_itemFlags[slot] = 0;
        if (!gDisableStructs[a].isFirstTurn) break;
        let f = 0;
        if (e[0] & C.ITEM0_X_ATTACK) f |= 0x1;
        if (e[1] & C.ITEM1_X_DEFEND) f |= 0x2;
        if (e[1] & C.ITEM1_X_SPEED) f |= 0x4;
        if (e[2] & C.ITEM2_X_SPATK) f |= 0x8;
        if (e[2] & C.ITEM2_X_ACCURACY) f |= 0x20;
        if (e[0] & C.ITEM0_DIRE_HIT) f |= 0x80;
        gBattleStruct.AI_itemFlags[slot] = f;
        shouldUse = true;
        break;
      }
      case C.AI_ITEM_GUARD_SPECS:
        if (gDisableStructs[a].isFirstTurn && gSideTimers[GetBattlerSide(a)].mistTimer === 0) shouldUse = true;
        break;
      case C.AI_ITEM_NOT_RECOGNIZABLE:
        return false;
    }
    if (shouldUse) {
      BtlController_EmitTwoReturnValues(BUFFER_B, C.B_ACTION_USE_ITEM, 0);
      // u8 chosenItem[4]: the u16 item is stored as two bytes at (battler / 2) * 2
      gBattleStruct.chosenItem[slot * 2] = item & 0xff;
      gBattleStruct.chosenItem[slot * 2 + 1] = item >> 8;
      h.trainerItems[i] = 0;
      return true;
    }
  }
  return false;
}
