// script_pokemon_util.c helpers that operate on the saved or enemy party.

import * as C from "../generated/constants";
import { save } from "../save";
import { createMon } from "./pokemon";
import { GetMonData, gEnemyParty, playerMon, SetMonData, ZeroEnemyPartyMons, type Mon } from "./mon";
import { gSelectedOrderFromParty } from "../partyMenu";

export function CheckPartyMonHasHeldItem(item: number): boolean {
  for (let i = 0; i < C.PARTY_SIZE; i++) {
    const mon = playerMon(i);
    const species = GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG);
    if (species !== C.SPECIES_NONE && species !== C.SPECIES_EGG && GetMonData(mon, C.MON_DATA_HELD_ITEM) === item) return true;
  }
  return false;
}

export function CreateScriptedWildMon(species: number, level: number, item: number): void {
  ZeroEnemyPartyMons();
  const mon = createMon(species, level);
  if (item) SetMonData(mon as Mon, C.MON_DATA_HELD_ITEM, item);
  gEnemyParty[0] = mon as Mon;
}

export function ReducePlayerPartyToThree(): void {
  const selected = gSelectedOrderFromParty.slice(0, 3)
    .filter((partyIndex) => partyIndex !== 0)
    .map((partyIndex) => structuredClone(playerMon(partyIndex - 1)));
  save.party.splice(0, save.party.length, ...selected);
}

/** GetMonsStateToDoubles (pokemon.c), used by HasEnoughMonsForDoubleBattle. */
export function GetMonsStateToDoubles(): number {
  const partyCount = save.party.length;
  if (partyCount === 1) return C.PLAYER_HAS_ONE_MON;
  return save.party.filter((mon) => !mon.isEgg && mon.species !== C.SPECIES_NONE && mon.hp !== 0).length > 1
    ? C.PLAYER_HAS_TWO_USABLE_MONS
    : C.PLAYER_HAS_ONE_USABLE_MON;
}
