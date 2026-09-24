// pokemon.c: CalculateBaseDamage

import * as C from "../generated/constants";
import type { BattlePokemon } from "../generated/structs";
import { cdata } from "../hw/assets";
import { flagGet } from "../save";
import { G, gBattleResources, gEnigmaBerries } from "./globals";
import { div, gBattleMoves } from "./macros";
import { AbilityBattleEffects, CountAliveMonsInBattle, GetBattlerSide, ItemId_GetHoldEffect, ItemId_GetHoldEffectParam, WEATHER_HAS_EFFECT2 } from "./util";

const u16 = (v: number) => v & 0xffff;

function statStageRatio(stage: number): [number, number] {
  return cdata<Array<[number, number]>>("pokemon", "gStatStageRatios")[stage];
}

/** APPLY_STAT_MOD */
function applyStatMod(mon: BattlePokemon, stat: number, statIndex: number): number {
  const [num, den] = statStageRatio(mon.statStages[statIndex]);
  return Math.trunc((stat * num) / den);
}

function shouldGetStatBadgeBoost(flag: number, battler: number): boolean {
  return !(G.gBattleTypeFlags & (C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_EREADER_TRAINER)) && flagGet(flag) && GetBattlerSide(battler) === C.B_SIDE_PLAYER;
}

function ABILITY_ON_FIELD2(ability: number): number {
  return AbilityBattleEffects(C.ABILITYEFFECT_FIELD_SPORT, 0, ability, 0, 0);
}

function holdInfo(mon: BattlePokemon, battler: number): [number, number] {
  if (mon.item === C.ITEM_ENIGMA_BERRY) return [gEnigmaBerries[battler].holdEffect, gEnigmaBerries[battler].holdEffectParam];
  return [ItemId_GetHoldEffect(mon.item), ItemId_GetHoldEffectParam(mon.item)];
}

export function CalculateBaseDamage(
  attacker: BattlePokemon, defender: BattlePokemon, move: number, sideStatus: number, powerOverride: number, typeOverride: number,
  battlerIdAtk: number, battlerIdDef: number,
): number {
  let damage = 0;
  let damageHelper: number;
  G.gBattleMovePower = powerOverride ? powerOverride : gBattleMoves(move).power;
  const type = typeOverride ? typeOverride & C.DYNAMIC_TYPE_MASK : gBattleMoves(move).type;
  let attack = attacker.attack;
  let defense = defender.defense;
  let spAttack = attacker.spAttack;
  let spDefense = defender.spDefense;
  const [attackerHoldEffect, attackerHoldEffectParam] = holdInfo(attacker, battlerIdAtk);
  const [defenderHoldEffect] = holdInfo(defender, battlerIdDef);

  if (attacker.ability === C.ABILITY_HUGE_POWER || attacker.ability === C.ABILITY_PURE_POWER) attack = u16(attack * 2);
  if (shouldGetStatBadgeBoost(C.FLAG_BADGE01_GET, battlerIdAtk)) attack = u16(div(110 * attack, 100));
  if (shouldGetStatBadgeBoost(C.FLAG_BADGE05_GET, battlerIdDef)) defense = u16(div(110 * defense, 100));
  if (shouldGetStatBadgeBoost(C.FLAG_BADGE07_GET, battlerIdAtk)) spAttack = u16(div(110 * spAttack, 100));
  if (shouldGetStatBadgeBoost(C.FLAG_BADGE07_GET, battlerIdDef)) spDefense = u16(div(110 * spDefense, 100));

  for (const [effect, effType] of cdata<Array<[number, number]>>("pokemon", "sHoldEffectToType")) {
    if (attackerHoldEffect === effect && type === effType) {
      if (type < C.TYPE_MYSTERY) attack = u16(div(attack * (attackerHoldEffectParam + 100), 100));
      else spAttack = u16(div(spAttack * (attackerHoldEffectParam + 100), 100));
      break;
    }
  }

  const latiX = (s: number) => s === C.SPECIES_LATIAS || s === C.SPECIES_LATIOS;
  if (attackerHoldEffect === C.HOLD_EFFECT_CHOICE_BAND) attack = u16(div(150 * attack, 100));
  if (attackerHoldEffect === C.HOLD_EFFECT_SOUL_DEW && !(G.gBattleTypeFlags & C.BATTLE_TYPE_BATTLE_TOWER) && latiX(attacker.species)) spAttack = u16(div(150 * spAttack, 100));
  if (defenderHoldEffect === C.HOLD_EFFECT_SOUL_DEW && !(G.gBattleTypeFlags & C.BATTLE_TYPE_BATTLE_TOWER) && latiX(defender.species)) spDefense = u16(div(150 * spDefense, 100));
  if (attackerHoldEffect === C.HOLD_EFFECT_DEEP_SEA_TOOTH && attacker.species === C.SPECIES_CLAMPERL) spAttack = u16(spAttack * 2);
  if (defenderHoldEffect === C.HOLD_EFFECT_DEEP_SEA_SCALE && defender.species === C.SPECIES_CLAMPERL) spDefense = u16(spDefense * 2);
  if (attackerHoldEffect === C.HOLD_EFFECT_LIGHT_BALL && attacker.species === C.SPECIES_PIKACHU) spAttack = u16(spAttack * 2);
  if (defenderHoldEffect === C.HOLD_EFFECT_METAL_POWDER && defender.species === C.SPECIES_DITTO) defense = u16(defense * 2);
  if (attackerHoldEffect === C.HOLD_EFFECT_THICK_CLUB && (attacker.species === C.SPECIES_CUBONE || attacker.species === C.SPECIES_MAROWAK)) attack = u16(attack * 2);
  if (defender.ability === C.ABILITY_THICK_FAT && (type === C.TYPE_FIRE || type === C.TYPE_ICE)) spAttack = u16(div(spAttack, 2));
  if (attacker.ability === C.ABILITY_HUSTLE) attack = u16(div(150 * attack, 100));
  if (attacker.ability === C.ABILITY_PLUS && ABILITY_ON_FIELD2(C.ABILITY_MINUS)) spAttack = u16(div(150 * spAttack, 100));
  if (attacker.ability === C.ABILITY_MINUS && ABILITY_ON_FIELD2(C.ABILITY_PLUS)) spAttack = u16(div(150 * spAttack, 100));
  if (attacker.ability === C.ABILITY_GUTS && attacker.status1) attack = u16(div(150 * attack, 100));
  if (defender.ability === C.ABILITY_MARVEL_SCALE && defender.status1) defense = u16(div(150 * defense, 100));
  if (type === C.TYPE_ELECTRIC && AbilityBattleEffects(C.ABILITYEFFECT_FIELD_SPORT, 0, 0, C.ABILITYEFFECT_MUD_SPORT, 0)) G.gBattleMovePower = div(G.gBattleMovePower, 2);
  if (type === C.TYPE_FIRE && AbilityBattleEffects(C.ABILITYEFFECT_FIELD_SPORT, 0, 0, C.ABILITYEFFECT_WATER_SPORT, 0)) G.gBattleMovePower = div(G.gBattleMovePower, 2);
  const pinch = attacker.hp <= div(attacker.maxHP, 3);
  if (pinch && ((type === C.TYPE_GRASS && attacker.ability === C.ABILITY_OVERGROW) || (type === C.TYPE_FIRE && attacker.ability === C.ABILITY_BLAZE)
    || (type === C.TYPE_WATER && attacker.ability === C.ABILITY_TORRENT) || (type === C.TYPE_BUG && attacker.ability === C.ABILITY_SWARM))) {
    G.gBattleMovePower = u16(div(150 * G.gBattleMovePower, 100));
  }
  if (gBattleMoves(G.gCurrentMove).effect === C.EFFECT_EXPLOSION) defense = u16(div(defense, 2));

  const crit = G.gCritMultiplier === 2;
  const halveForScreen = () => {
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && CountAliveMonsInBattle(C.BATTLE_ALIVE_DEF_SIDE) === 2) damage = 2 * div(damage, 3);
    else damage = div(damage, 2);
  };
  const spreadHalf = () => {
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && gBattleMoves(move).target === C.MOVE_TARGET_BOTH && CountAliveMonsInBattle(C.BATTLE_ALIVE_DEF_SIDE) === 2) damage = div(damage, 2);
  };

  if (type < C.TYPE_MYSTERY) {
    if (crit) damage = attacker.statStages[C.STAT_ATK] > C.DEFAULT_STAT_STAGE ? applyStatMod(attacker, attack, C.STAT_ATK) : attack;
    else damage = applyStatMod(attacker, attack, C.STAT_ATK);
    damage = damage * G.gBattleMovePower;
    damage *= div(2 * attacker.level, 5) + 2;
    if (crit) damageHelper = defender.statStages[C.STAT_DEF] < C.DEFAULT_STAT_STAGE ? applyStatMod(defender, defense, C.STAT_DEF) : defense;
    else damageHelper = applyStatMod(defender, defense, C.STAT_DEF);
    damage = div(damage, damageHelper);
    damage = div(damage, 50);
    if (attacker.status1 & C.STATUS1_BURN && attacker.ability !== C.ABILITY_GUTS) damage = div(damage, 2);
    if (sideStatus & C.SIDE_STATUS_REFLECT && G.gCritMultiplier === 1) halveForScreen();
    spreadHalf();
    if (damage === 0) damage = 1;
  }

  if (type === C.TYPE_MYSTERY) damage = 0;

  if (type > C.TYPE_MYSTERY) {
    if (crit) damage = attacker.statStages[C.STAT_SPATK] > C.DEFAULT_STAT_STAGE ? applyStatMod(attacker, spAttack, C.STAT_SPATK) : spAttack;
    else damage = applyStatMod(attacker, spAttack, C.STAT_SPATK);
    damage = damage * G.gBattleMovePower;
    damage *= div(2 * attacker.level, 5) + 2;
    if (crit) damageHelper = defender.statStages[C.STAT_SPDEF] < C.DEFAULT_STAT_STAGE ? applyStatMod(defender, spDefense, C.STAT_SPDEF) : spDefense;
    else damageHelper = applyStatMod(defender, spDefense, C.STAT_SPDEF);
    damage = div(damage, damageHelper);
    damage = div(damage, 50);
    if (sideStatus & C.SIDE_STATUS_LIGHTSCREEN && G.gCritMultiplier === 1) halveForScreen();
    spreadHalf();
    if (WEATHER_HAS_EFFECT2()) {
      if (G.gBattleWeather & C.B_WEATHER_RAIN_TEMPORARY) {
        if (type === C.TYPE_FIRE) damage = div(damage, 2);
        else if (type === C.TYPE_WATER) damage = div(15 * damage, 10);
      }
      if (G.gBattleWeather & (C.B_WEATHER_RAIN | C.B_WEATHER_SANDSTORM | C.B_WEATHER_HAIL_TEMPORARY) && G.gCurrentMove === C.MOVE_SOLAR_BEAM) damage = div(damage, 2);
      if (G.gBattleWeather & C.B_WEATHER_SUN) {
        if (type === C.TYPE_FIRE) damage = div(15 * damage, 10);
        else if (type === C.TYPE_WATER) damage = div(damage, 2);
      }
    }
    if (gBattleResources.flags.flags[battlerIdAtk] & C.RESOURCE_FLAG_FLASH_FIRE && type === C.TYPE_FIRE) damage = div(15 * damage, 10);
  }
  return (damage + 2) | 0;
}
