// pokemon.c / pokedex*.c / battle_util2.c helpers used by the battle engine.

import * as C from "../generated/constants";
import { cdata } from "../hw/assets";
import { gMain } from "../hw/runtime";
import { random } from "../random";
import { rom } from "../rom";
import { save } from "../save";
import { currentRegionMapSection, GetMonData, GetNature, GetNatureFromPersonality, gPPUpClearMask, NationalPokedexNumToSpecies, playerMon, SetMonData, type Mon } from "./mon";
import { G, gBattleMons, gBattlerPartyIndexes, gEnigmaBerries } from "../battle/globals";
import { GetAbilityBySpecies, GetBattlerAtPosition, ItemId_GetHoldEffect } from "../battle/util";
import type { BattlePokemon } from "../generated/structs";

const HM_MOVES_END = 0xffff;

function holdEffectForMon(heldItem: number): number {
  if (heldItem === C.ITEM_ENIGMA_BERRY) return gMain.inBattle ? gEnigmaBerries[0].holdEffect : 0;
  return ItemId_GetHoldEffect(heldItem);
}

export function AdjustFriendship(mon: Mon, event: number): void {
  const species = GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG);
  const holdEffect = holdEffectForMon(GetMonData(mon, C.MON_DATA_HELD_ITEM));
  if (!species || species === C.SPECIES_EGG) return;
  let friendship = GetMonData(mon, C.MON_DATA_FRIENDSHIP);
  let level = 0;
  if (friendship >= 100) level++;
  if (friendship >= 200) level++;
  if (event === C.FRIENDSHIP_EVENT_WALKING && random() & 1) return;
  if (event === C.FRIENDSHIP_EVENT_LEAGUE_BATTLE) {
    if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER)) return;
    const cls = rom.trainers[G.gTrainerBattleOpponent_A]?.class;
    if (!(cls === C.TRAINER_CLASS_LEADER || cls === C.TRAINER_CLASS_ELITE_FOUR || cls === C.TRAINER_CLASS_CHAMPION)) return;
  }
  let delta = cdata<number[][]>("pokemon", "sFriendshipEventDeltas")[event][level];
  if (delta > 0 && holdEffect === C.HOLD_EFFECT_FRIENDSHIP_UP) delta = Math.trunc((150 * delta) / 100);
  friendship += delta;
  if (delta > 0) {
    if (GetMonData(mon, C.MON_DATA_POKEBALL) === C.ITEM_LUXURY_BALL) friendship++;
    if (GetMonData(mon, C.MON_DATA_MET_LOCATION) === currentRegionMapSection()) friendship++;
  }
  if (friendship < 0) friendship = 0;
  if (friendship > C.MAX_FRIENDSHIP) friendship = C.MAX_FRIENDSHIP;
  SetMonData(mon, C.MON_DATA_FRIENDSHIP, friendship);
}

/** battle_util2.c */
export function AdjustFriendshipOnBattleFaint(battlerId: number): void {
  let opposing = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
    const opposing2 = GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT);
    if (gBattleMons[opposing2].level > gBattleMons[opposing].level) opposing = opposing2;
  }
  const mon = playerMon(gBattlerPartyIndexes[battlerId]);
  const diff = gBattleMons[opposing].level - gBattleMons[battlerId].level;
  AdjustFriendship(mon, diff > 29 ? C.FRIENDSHIP_EVENT_FAINT_LARGE : C.FRIENDSHIP_EVENT_FAINT_SMALL);
}

export function CheckPartyHasHadPokerus(party: (i: number) => Mon, selection: number): number {
  let ret = 0;
  if (selection) {
    let i = 0;
    let bit = 1;
    while (selection) {
      if (selection & 1 && GetMonData(party(i), C.MON_DATA_POKERUS)) ret |= bit;
      i++;
      bit <<= 1;
      selection >>= 1;
    }
  } else if (GetMonData(party(0), C.MON_DATA_POKERUS)) {
    ret = 1;
  }
  return ret;
}

export function MonGainEVs(mon: Mon, defeatedSpecies: number): void {
  const evs: number[] = [];
  let totalEVs = 0;
  for (let i = 0; i < C.NUM_STATS; i++) {
    evs[i] = GetMonData(mon, C.MON_DATA_HP_EV + i);
    totalEVs += evs[i];
  }
  // evYield order in rom.species matches struct SpeciesInfo: HP, Atk, Def, Speed, SpAtk, SpDef (= STAT_* order).
  const yields = rom.species[defeatedSpecies].evYield;
  for (let i = 0; i < C.NUM_STATS; i++) {
    if (totalEVs >= C.MAX_TOTAL_EVS) break;
    // CheckPartyHasHadPokerus(mon, 0) with mon treated as a one-element party.
    const multiplier = CheckPartyHasHadPokerus(() => mon, 0) ? 2 : 1;
    let evIncrease = (yields[i] * multiplier) & 0xffff;
    if (holdEffectForMon(GetMonData(mon, C.MON_DATA_HELD_ITEM)) === C.HOLD_EFFECT_MACHO_BRACE) evIncrease = (evIncrease * 2) & 0xffff;
    const s = (v: number) => (v << 16) >> 16;
    if (totalEVs + s(evIncrease) > C.MAX_TOTAL_EVS) evIncrease = (s(evIncrease) + C.MAX_TOTAL_EVS - (totalEVs + evIncrease)) & 0xffff;
    if (evs[i] + s(evIncrease) > C.MAX_PER_STAT_EVS) evIncrease = (s(evIncrease) + C.MAX_PER_STAT_EVS - (evs[i] + evIncrease)) & 0xffff;
    evs[i] = (evs[i] + evIncrease) & 0xff;
    totalEVs = (totalEVs + evIncrease) & 0xffff;
    SetMonData(mon, C.MON_DATA_HP_EV + i, evs[i]);
  }
}

/** pokedex_screen.c DexScreen_GetSetPokedexFlag (the seen1/seen2 anticheat copies collapse to one table). */
export function GetSetPokedexFlag(nationalDexNo: number, caseId: number): number {
  const n = nationalDexNo - 1;
  const index = n >> 3;
  const mask = 1 << (n & 7);
  const seen = save.pokedexSeen;
  const owned = save.pokedexCaught;
  switch (caseId) {
    case C.FLAG_GET_SEEN:
      return seen[index] & mask ? 1 : 0;
    case C.FLAG_GET_CAUGHT:
      return owned[index] & mask && (owned[index] & mask) === (seen[index] & mask) ? 1 : 0;
    case C.FLAG_SET_SEEN:
      seen[index] |= mask;
      break;
    case C.FLAG_SET_CAUGHT:
      owned[index] |= mask;
      break;
  }
  return 0;
}

export function HandleSetPokedexFlag(nationalNum: number, caseId: number, personality: number): void {
  const getCase = caseId === C.FLAG_SET_SEEN ? C.FLAG_GET_SEEN : C.FLAG_GET_CAUGHT;
  if (!GetSetPokedexFlag(nationalNum, getCase)) {
    GetSetPokedexFlag(nationalNum, caseId);
    const species = NationalPokedexNumToSpecies(nationalNum);
    const dex = save as unknown as { unownPersonality?: number; spindaPersonality?: number };
    if (species === C.SPECIES_UNOWN) dex.unownPersonality = personality >>> 0;
    if (species === C.SPECIES_SPINDA) dex.spindaPersonality = personality >>> 0;
  }
}

export function IsHMMove2(move: number): boolean {
  const hm = cdata<number[]>("pokemon", "sHMMoves");
  for (let i = 0; hm[i] !== HM_MOVES_END; i++) if (hm[i] === move) return true;
  return false;
}

export function GetFlavorRelationByPersonality(personality: number, flavor: number): number {
  const nature = GetNatureFromPersonality(personality);
  return cdata<number[]>("pokemon", "sPokeblockFlavorCompatibilityTable")[nature * C.FLAVOR_COUNT + flavor];
}

export function IsOtherTrainer(otId: number, otName: ArrayLike<number>): boolean {
  if (otId >>> 0 === save.trainerId >>> 0) {
    for (let i = 0; otName[i] !== 0xff && i < otName.length; i++) if (otName[i] !== save.playerName[i]) return true;
    return false;
  }
  return true;
}

export function IsTradedMon(mon: Mon): boolean {
  const otName: number[] = [];
  GetMonData(mon, C.MON_DATA_OT_NAME, otName);
  return IsOtherTrainer(GetMonData(mon, C.MON_DATA_OT_ID), otName);
}

/** GetMonAbility (pokemon.c) */
export function GetMonAbility(mon: Mon): number {
  return GetAbilityBySpecies(GetMonData(mon, C.MON_DATA_SPECIES), GetMonData(mon, C.MON_DATA_ABILITY_NUM));
}

/** RemoveBattleMonPPBonus (pokemon.c) */
export function RemoveBattleMonPPBonus(mon: BattlePokemon, moveIndex: number): void {
  mon.ppBonuses &= gPPUpClearMask[moveIndex];
}

/** PartyMonHasStatus (pokemon.c): partyIndex and battleId are unused in the C body. */
export function PartyMonHasStatus(mon: Mon, _partyIndex: number, healMask: number, _battleId: number): boolean {
  return (GetMonData(mon, C.MON_DATA_STATUS) & healMask) !== 0;
}

/** GetItemEffectParamOffset (pokemon.c): offset of effectBit inside effectByte of the item's effect,
 *  ITEM_EFFECT_ARG_START when the byte carries that effect, 0 when it must not be used. */
export function GetItemEffectParamOffset(itemId: number, effectByte: number, effectBit: number): number {
  let offset = C.ITEM_EFFECT_ARG_START;
  let itemEffect: number[] | Uint8Array | null = rom.itemEffects[itemId - C.ITEM_POTION] ?? null;

  if (!itemEffect && itemId !== C.ITEM_ENIGMA_BERRY) return 0;
  if (itemId === C.ITEM_ENIGMA_BERRY) itemEffect = gEnigmaBerries[G.gActiveBattler].itemEffect;
  // C works with a pointer that it has already proven non-NULL.
  if (!itemEffect) return 0;

  for (let i = 0; i < C.ITEM_EFFECT_ARG_START; i++) {
    switch (i) {
      case 0:
      case 1:
      case 2:
      case 3:
        if (i === effectByte) return 0;
        break;
      case 4: {
        let val = itemEffect[4];
        if (val & C.ITEM4_PP_UP) val &= ~C.ITEM4_PP_UP;
        let j = 0;
        while (val) {
          if (val & 1) {
            switch (j) {
              case 2: // ITEM4_HEAL_HP
                if (val & (C.ITEM4_REVIVE >> 2)) val &= ~(C.ITEM4_REVIVE >> 2);
              // fallthrough
              case 0: // ITEM4_EV_HP
                if (i === effectByte && (val & effectBit)) return offset;
                offset++;
                break;
              case 1: // ITEM4_EV_ATK
                if (i === effectByte && (val & effectBit)) return offset;
                offset++;
                break;
              case 3: // ITEM4_HEAL_PP
                if (i === effectByte && (val & effectBit)) return offset;
                offset++;
                break;
              case 7: // ITEM4_EVO_STONE
                if (i === effectByte) return 0;
                break;
            }
          }
          j++;
          val >>= 1;
          if (i === effectByte) effectBit >>= 1;
        }
        break;
      }
      case 5: {
        let val = itemEffect[5];
        let j = 0;
        while (val) {
          if (val & 1) {
            switch (j) {
              case 0: // ITEM5_EV_DEF
              case 1: // ITEM5_EV_SPEED
              case 2: // ITEM5_EV_SPDEF
              case 3: // ITEM5_EV_SPATK
              case 4: // ITEM5_PP_MAX
              case 5: // ITEM5_FRIENDSHIP_LOW
              case 6: // ITEM5_FRIENDSHIP_MID
                if (i === effectByte && (val & effectBit)) return offset;
                offset++;
                break;
              case 7: // ITEM5_FRIENDSHIP_HIGH
                if (i === effectByte) return 0;
                break;
            }
          }
          j++;
          val >>= 1;
          if (i === effectByte) effectBit >>= 1;
        }
        break;
      }
    }
  }

  return offset;
}

/** RandomlyGivePartyPokerus (pokemon.c): the C body is the RS stub that only reserves a stack slot. */
export function RandomlyGivePartyPokerus(_party: Mon[]): void {
  let foo = 0;
  foo;
}

/** UpdatePartyPokerusTime (pokemon.c): same RS stub as RandomlyGivePartyPokerus. */
export function UpdatePartyPokerusTime(_party: Mon[]): void {
  let foo = 0;
  foo;
}

/** PartySpreadPokerus (pokemon.c): same RS stub as RandomlyGivePartyPokerus. */
export function PartySpreadPokerus(_party: Mon[]): void {
  let foo = 0;
  foo;
}

/** GetMonFlavorRelation (pokemon.c) */
export function GetMonFlavorRelation(mon: Mon, flavor: number): number {
  const nature = GetNature(mon);
  return cdata<number[]>("pokemon", "sPokeblockFlavorCompatibilityTable")[nature * C.FLAVOR_COUNT + flavor];
}
