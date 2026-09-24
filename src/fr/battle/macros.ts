// Function-like macros from battle.h / constants/battle.h and friends.

import * as C from "../generated/constants";
import { rom } from "../rom";
import { G, gBattleMons, gBattleStruct, gBattlerPositions, gBitTable } from "./globals";

export const STATUS1_SLEEP_TURN = (n: number) => n;
export const STATUS1_TOXIC_TURN = (n: number) => n << 8;
export const STATUS2_CONFUSION_TURN = (n: number) => n;
export const STATUS2_UPROAR_TURN = (n: number) => n << 4;
export const STATUS2_BIDE_TURN = (n: number) => (n << 8) & C.STATUS2_BIDE;
export const STATUS2_LOCK_CONFUSE_TURN = (n: number) => n << 10;
export const STATUS2_WRAPPED_TURN = (n: number) => n << 13;
export const STATUS2_INFATUATED_WITH = (b: number) => (gBitTable[b] << 16) >>> 0;
export const STATUS3_ALWAYS_HITS_TURN = (n: number) => (n << 3) & C.STATUS3_ALWAYS_HITS;
export const STATUS3_YAWN_TURN = (n: number) => (n << 11) & C.STATUS3_YAWN;
export const HITMARKER_FAINTED = (b: number) => (gBitTable[b] << 28) >>> 0;
export const HITMARKER_FAINTED2 = (b: number) => ((1 << 28) << b) >>> 0;
export const BATTLE_OPPOSITE = (id: number) => id ^ 1;
export const BATTLE_PARTNER = (id: number) => id ^ 2;
export const IS_BATTLE_TYPE_GHOST_WITHOUT_SCOPE = (f: number) => !!(f & C.BATTLE_TYPE_GHOST) && !(f & C.BATTLE_TYPE_GHOST_UNVEILED);
export const IS_BATTLE_TYPE_GHOST_WITH_SCOPE = (f: number) => !!(f & C.BATTLE_TYPE_GHOST) && !!(f & C.BATTLE_TYPE_GHOST_UNVEILED);
export const GET_UNOWN_LETTER = (p: number) => (((p & 0x03000000) >>> 18) | ((p & 0x00030000) >>> 12) | ((p & 0x00000300) >>> 6) | (p & 0x00000003)) % 28;

export const GET_BATTLER_POSITION = (b: number) => gBattlerPositions[b];
export const GET_BATTLER_SIDE = (b: number) => gBattlerPositions[b] & C.BIT_SIDE;
export const GET_BATTLER_SIDE2 = GET_BATTLER_SIDE;

export const IS_TYPE_PHYSICAL = (t: number) => t < C.TYPE_MYSTERY;
export const IS_TYPE_SPECIAL = (t: number) => t > C.TYPE_MYSTERY;
export const IS_BATTLER_OF_TYPE = (b: number, type: number) => gBattleMons[b].type1 === type || gBattleMons[b].type2 === type;
export function SET_BATTLER_TYPE(b: number, type: number): void {
  gBattleMons[b].type1 = type;
  gBattleMons[b].type2 = type;
}

export const F_DYNAMIC_TYPE_1 = 1 << 6;
export const F_DYNAMIC_TYPE_2 = 1 << 7;
export const DYNAMIC_TYPE_MASK = F_DYNAMIC_TYPE_1 - 1;

/** GET_MOVE_TYPE(move, typeArg) */
export function GET_MOVE_TYPE(move: number): number {
  return gBattleStruct.dynamicMoveType ? gBattleStruct.dynamicMoveType & DYNAMIC_TYPE_MASK : rom.moves[move].type;
}

export const GET_STAT_BUFF_ID = (n: number) => n & 0xf;
export const GET_STAT_BUFF_VALUE2 = (n: number) => n & 0xf0;
export const GET_STAT_BUFF_VALUE = (n: number) => (n >> 4) & 7;
export const STAT_BUFF_NEGATIVE = 0x80;
export const SET_STAT_BUFF_VALUE = (n: number) => (((n << 24) >> 24) << 4) & 0xf0;

export const TYPE_EFFECT_ATK_TYPE = (i: number) => rom.typeEffectiveness[i];
export const TYPE_EFFECT_DEF_TYPE = (i: number) => rom.typeEffectiveness[i + 1];
export const TYPE_EFFECT_MULTIPLIER = (i: number) => rom.typeEffectiveness[i + 2];

/** gBattleMoves[move] */
export const gBattleMoves = (move: number) => rom.moves[move];

export const s8 = (v: number) => (v << 24) >> 24;
export const u8 = (v: number) => v & 0xff;
export const s16 = (v: number) => (v << 16) >> 16;
export const u16 = (v: number) => v & 0xffff;
export const s32 = (v: number) => v | 0;
export const u32 = (v: number) => v >>> 0;
/** C integer division (truncates toward zero). */
export const div = (a: number, b: number) => Math.trunc(a / b);

export function WEATHER_HAS_EFFECT_FN(abilityEffects: (caseId: number, battler: number, ability: number, special: number, move: number) => number): boolean {
  return abilityEffects(C.ABILITYEFFECT_CHECK_ON_FIELD, 0, C.ABILITY_CLOUD_NINE, 0, 0) === 0
    && abilityEffects(C.ABILITYEFFECT_CHECK_ON_FIELD, 0, C.ABILITY_AIR_LOCK, 0, 0) === 0;
}

export function MOVE_IS_PERMANENT(battler: number, moveSlot: number, disable: { mimickedMoves: number }): boolean {
  return !(gBattleMons[battler].status2 & C.STATUS2_TRANSFORMED) && !(disable.mimickedMoves & gBitTable[moveSlot]);
}

export { G };
