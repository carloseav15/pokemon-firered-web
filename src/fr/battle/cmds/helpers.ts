// Small shared helpers from battle_script_commands.c.

import * as C from "../../generated/constants";
import { cdata } from "../../hw/assets";
import { G, gBattleMons } from "../globals";
import { gBattleMoves } from "../macros";
import { GetBattlerSide } from "../util";

export function IsTwoTurnsMove(move: number): boolean {
  const e = gBattleMoves(move).effect;
  return e === C.EFFECT_SKULL_BASH || e === C.EFFECT_RAZOR_WIND || e === C.EFFECT_SKY_ATTACK
    || e === C.EFFECT_SOLAR_BEAM || e === C.EFFECT_SEMI_INVULNERABLE || e === C.EFFECT_BIDE;
}

export function IsInvalidForSleepTalkOrAssist(move: number): boolean {
  return move === C.MOVE_NONE || move === C.MOVE_SLEEP_TALK || move === C.MOVE_ASSIST || move === C.MOVE_MIRROR_MOVE || move === C.MOVE_METRONOME;
}

/** Returns 1 if it's a charging turn, otherwise 2. */
export function AttacksThisTurn(_battlerId: number, move: number): number {
  const e = gBattleMoves(move).effect;
  if (e === C.EFFECT_SOLAR_BEAM && (G.gBattleWeather & C.B_WEATHER_SUN)) return 2;
  if (IsTwoTurnsMove(move) && (G.gHitMarker & C.HITMARKER_CHARGING)) return 1;
  return 2;
}

export function TrySetDestinyBondToHappen(): void {
  const sideAttacker = GetBattlerSide(G.gBattlerAttacker);
  const sideTarget = GetBattlerSide(G.gBattlerTarget);
  if (gBattleMons[G.gBattlerTarget].status2 & C.STATUS2_DESTINY_BOND && sideAttacker !== sideTarget && !(G.gHitMarker & C.HITMARKER_GRUDGE))
    G.gHitMarker |= C.HITMARKER_DESTINYBOND;
}

/** static tables of battle_script_commands.c */
export const T = {
  get protectSuccessRates(): number[] { return cdata<number[]>("battle_script_commands", "sProtectSuccessRates"); },
  get movesForbiddenToCopy(): number[] { return cdata<number[]>("battle_script_commands", "sMovesForbiddenToCopy"); },
  get flailHpScaleToPowerTable(): number[] { return cdata<number[]>("battle_script_commands", "sFlailHpScaleToPowerTable"); },
  get naturePowerMoves(): number[] { return cdata<number[]>("battle_script_commands", "sNaturePowerMoves"); },
  get weightToDamageTable(): number[] { return cdata<number[]>("battle_script_commands", "sWeightToDamageTable"); },
  get pickupItems(): Array<{ itemId: number; chance: number }> { return cdata("battle_script_commands", "sPickupItems"); },
  get terrainToType(): number[] { return cdata<number[]>("battle_script_commands", "sTerrainToType"); },
  get ballCatchBonuses(): number[] { return cdata<number[]>("battle_script_commands", "sBallCatchBonuses"); },
};

export { ChangeStatBuffs } from "./part3";
