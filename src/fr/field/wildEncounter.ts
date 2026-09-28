// wild_encounter.c: FireRed encounter selection, cooldown and rate RNG.
// Faithful port of pokefirered/src/wild_encounter.c (36/36 functions).
import type { Game } from "../game";
import * as C from "../generated/constants";
import { MetatileBehavior_IsBridge } from "../generated/metatileBehavior";
import { cdata, type SymRef } from "../hw/assets";
import { random, random32 } from "../random";
import { flagGet, incrementGameStat, save, varGet, varSet } from "../save";
import { ability, createMon, type Pokemon } from "../pokemon/pokemon";
import { roamerLevel, tryStartRoamerEncounter } from "../pokemon/roamer";

export const MAX_ENCOUNTER_RATE = 1600;
export const HEADER_NONE = 0xFFFF;

export const LAND_WILD_COUNT = 12;
export const WATER_WILD_COUNT = 5;
export const ROCK_WILD_COUNT = 5;
export const FISH_WILD_COUNT = 10;

export const NUM_ALTERING_CAVE_TABLES = 9;

export const WILD_AREA_LAND = 0;
export const WILD_AREA_WATER = 1;
export const WILD_AREA_ROCKS = 2;
export const WILD_AREA_FISHING = 3;

export const WILD_CHECK_REPEL = 0x1;
export const WILD_CHECK_KEEN_EYE = 0x2;

export interface WildPokemon {
  minLevel: number;
  maxLevel: number;
  species: number;
}

export interface WildPokemonInfo {
  encounterRate: number;
  wildPokemon: SymRef;
}

export interface WildPokemonHeader {
  mapGroup: number;
  mapNum: number;
  landMonsInfo: SymRef | 0;
  waterMonsInfo: SymRef | 0;
  rockSmashMonsInfo: SymRef | 0;
  fishingMonsInfo: SymRef | 0;
}

export interface WildEncounterData {
  rngState: number;
  prevMetatileBehavior: number;
  encounterRateBuff: number;
  stepsSinceLastEncounter: number;
  abilityEffect: number;
  leadMonHeldItem: number;
}

export const sWildEncounterData: WildEncounterData = {
  rngState: 0,
  prevMetatileBehavior: 0,
  encounterRateBuff: 0,
  stepsSinceLastEncounter: 0,
  abilityEffect: 0,
  leadMonHeldItem: 0,
};

export let sWildEncountersDisabled = false;

let sGame: Game | null = null;
let sLastGeneratedWildMon: Pokemon | null = null;

const data = <T>(name: string) => cdata<T>("wild_encounter", name);

export function setWildEncounterGame(game: Game): void {
  sGame = game;
}

export function DisableWildEncounters(state: boolean): void {
  sWildEncountersDisabled = state;
}

export function ChooseWildMonIndex_Land(): number {
  const rand = random() % 100;
  if (rand < 20) return 0;
  else if (rand >= 20 && rand < 40) return 1;
  else if (rand >= 40 && rand < 50) return 2;
  else if (rand >= 50 && rand < 60) return 3;
  else if (rand >= 60 && rand < 70) return 4;
  else if (rand >= 70 && rand < 80) return 5;
  else if (rand >= 80 && rand < 85) return 6;
  else if (rand >= 85 && rand < 90) return 7;
  else if (rand >= 90 && rand < 94) return 8;
  else if (rand >= 94 && rand < 98) return 9;
  else if (rand >= 98 && rand < 99) return 10;
  else return 11;
}

export function ChooseWildMonIndex_WaterRock(): number {
  const rand = random() % 100;
  if (rand < 60) return 0;
  else if (rand >= 60 && rand < 90) return 1;
  else if (rand >= 90 && rand < 95) return 2;
  else if (rand >= 95 && rand < 99) return 3;
  else return 4;
}

export function ChooseWildMonIndex_Fishing(rod: number): number {
  let wildMonIndex = 0;
  const rand = random() % 100;

  switch (rod) {
    case C.OLD_ROD:
      if (rand < 70)
        wildMonIndex = 0;
      else
        wildMonIndex = 1;
      break;
    case C.GOOD_ROD:
      if (rand < 60)
        wildMonIndex = 2;
      else if (rand >= 60 && rand < 80)
        wildMonIndex = 3;
      else if (rand >= 80 && rand < 100)
        wildMonIndex = 4;
      break;
    case C.SUPER_ROD:
      if (rand < 40)
        wildMonIndex = 5;
      else if (rand >= 40 && rand < 80)
        wildMonIndex = 6;
      else if (rand >= 80 && rand < 95)
        wildMonIndex = 7;
      else if (rand >= 95 && rand < 99)
        wildMonIndex = 8;
      else
        wildMonIndex = 9;
      break;
  }
  return wildMonIndex;
}

export function ChooseWildMonLevel(info: WildPokemon): number {
  let lo: number;
  let hi: number;
  if (info.maxLevel >= info.minLevel) {
    lo = info.minLevel;
    hi = info.maxLevel;
  } else {
    lo = info.maxLevel;
    hi = info.minLevel;
  }
  const mod = hi - lo + 1;
  const res = random() % mod;
  return lo + res;
}

export function UnlockedTanobyOrAreNotInTanoby(): boolean {
  if (flagGet(C.FLAG_SYS_UNLOCKED_TANOBY_RUINS))
    return true;
  const mapGroup = save.location.mapGroup;
  const mapNum = save.location.mapNum;
  if (mapGroup !== (C.MAP_SEVEN_ISLAND_TANOBY_RUINS_DILFORD_CHAMBER >>> 8))
    return true;
  if (!(mapNum === (C.MAP_SEVEN_ISLAND_TANOBY_RUINS_MONEAN_CHAMBER & 0xFF)
    || mapNum === (C.MAP_SEVEN_ISLAND_TANOBY_RUINS_LIPTOO_CHAMBER & 0xFF)
    || mapNum === (C.MAP_SEVEN_ISLAND_TANOBY_RUINS_WEEPTH_CHAMBER & 0xFF)
    || mapNum === (C.MAP_SEVEN_ISLAND_TANOBY_RUINS_DILFORD_CHAMBER & 0xFF)
    || mapNum === (C.MAP_SEVEN_ISLAND_TANOBY_RUINS_SCUFIB_CHAMBER & 0xFF)
    || mapNum === (C.MAP_SEVEN_ISLAND_TANOBY_RUINS_RIXY_CHAMBER & 0xFF)
    || mapNum === (C.MAP_SEVEN_ISLAND_TANOBY_RUINS_VIAPOIS_CHAMBER & 0xFF)
  ))
    return true;
  return false;
}

export function GetCurrentMapWildMonHeaderId(): number {
  const headers = data<WildPokemonHeader[]>("gWildMonHeaders");
  for (let i = 0; i < headers.length; i++) {
    const wildHeader = headers[i];
    if (!wildHeader || wildHeader.mapGroup === 0xFF)
      break;

    if (wildHeader.mapGroup === save.location.mapGroup &&
        wildHeader.mapNum === save.location.mapNum) {
      if (save.location.mapGroup === (C.MAP_SIX_ISLAND_ALTERING_CAVE >>> 8) &&
          save.location.mapNum === (C.MAP_SIX_ISLAND_ALTERING_CAVE & 0xFF)) {
        let alteringCaveId = varGet(C.VAR_ALTERING_CAVE_WILD_SET);
        if (alteringCaveId >= NUM_ALTERING_CAVE_TABLES)
          alteringCaveId = 0;
        i += alteringCaveId;
      }

      if (!UnlockedTanobyOrAreNotInTanoby())
        break;
      return i;
    }
  }
  return HEADER_NONE;
}

export function GetUnownLetterByPersonalityLoByte(personality: number): number {
  return (((personality & 0x3000000) >>> 18) | ((personality & 0x30000) >>> 12) | ((personality & 0x300) >>> 6) | (personality & 3)) % 28;
}

export function GenerateUnownPersonalityByLetter(letter: number): number {
  let personality: number;
  do {
    personality = ((random() << 16) | random()) >>> 0;
  } while (GetUnownLetterByPersonalityLoByte(personality) !== letter);
  return personality;
}

export function GenerateWildMon(species: number, level: number, slot: number): void {
  let personality: number;
  if (species !== C.SPECIES_UNOWN) {
    const nature = random() % 25;
    do {
      personality = random32();
    } while (personality % 25 !== nature);
  } else {
    const chamber = save.location.mapNum - (C.MAP_SEVEN_ISLAND_TANOBY_RUINS_MONEAN_CHAMBER & 0xFF);
    const slots = data<number[][]>("sUnownLetterSlots");
    personality = GenerateUnownPersonalityByLetter(slots[chamber][slot]);
  }
  const mon = createMon(species, level, {
    personality,
    metLocation: sGame?.overworld.header.regionMapSection,
  });
  sLastGeneratedWildMon = mon;
}

export function IsWildLevelAllowedByRepel(wildLevel: number): boolean {
  if (!varGet(C.VAR_REPEL_STEP_COUNT))
    return true;

  for (let i = 0; i < save.party.length; i++) {
    const mon = save.party[i];
    if (mon.hp > 0 && !mon.isEgg) {
      const ourLevel = mon.level;
      if (wildLevel < ourLevel)
        return false;
      else
        return true;
    }
  }
  return false;
}

export function TryGenerateWildMon(info: WildPokemonInfo, area: number, flags: number): boolean {
  let slot = 0;
  switch (area) {
    case WILD_AREA_LAND:
      slot = ChooseWildMonIndex_Land();
      break;
    case WILD_AREA_WATER:
    case WILD_AREA_ROCKS:
      slot = ChooseWildMonIndex_WaterRock();
      break;
  }
  const wildList = data<WildPokemon[]>(info.wildPokemon.$sym);
  const level = ChooseWildMonLevel(wildList[slot]);
  if (flags === WILD_CHECK_REPEL && !IsWildLevelAllowedByRepel(level)) {
    return false;
  }
  GenerateWildMon(wildList[slot].species, level, slot);
  return true;
}

export function GenerateFishingEncounter(info: WildPokemonInfo, rod: number): number {
  const slot = ChooseWildMonIndex_Fishing(rod);
  const wildList = data<WildPokemon[]>(info.wildPokemon.$sym);
  const level = ChooseWildMonLevel(wildList[slot]);
  GenerateWildMon(wildList[slot].species, level, slot);
  return wildList[slot].species;
}

export function WildEncounterRandom(): number {
  sWildEncounterData.rngState = (Math.imul(sWildEncounterData.rngState, 1103515245) + 12345) >>> 0;
  return sWildEncounterData.rngState >>> 16;
}

export function SeedWildEncounterRng(seed: number): void {
  sWildEncounterData.rngState = seed & 0xFFFF;
  ResetEncounterRateModifiers();
}

export function ResetEncounterRateModifiers(): void {
  sWildEncounterData.encounterRateBuff = 0;
  sWildEncounterData.stepsSinceLastEncounter = 0;
}

/** RestartWildEncounterImmunitySteps (field_control_avatar.c). */
export function RestartWildEncounterImmunitySteps(): void {
  ResetEncounterRateModifiers();
}

export function AddToWildEncounterRateBuff(encounterRate: number): void {
  if (varGet(C.VAR_REPEL_STEP_COUNT) === 0)
    sWildEncounterData.encounterRateBuff = (sWildEncounterData.encounterRateBuff + encounterRate) & 0xFFFF;
  else
    sWildEncounterData.encounterRateBuff = 0;
}

export function GetFluteEncounterRateModType(): number {
  if (flagGet(C.FLAG_SYS_WHITE_FLUTE_ACTIVE))
    return 1;
  else if (flagGet(C.FLAG_SYS_BLACK_FLUTE_ACTIVE))
    return 2;
  else
    return 0;
}

export function ApplyFluteEncounterRateMod(encounterRate: { value: number }): void {
  switch (GetFluteEncounterRateModType()) {
    case 1:
      encounterRate.value += Math.trunc(encounterRate.value / 2);
      break;
    case 2:
      encounterRate.value = Math.trunc(encounterRate.value / 2);
      break;
  }
}

export function IsLeadMonHoldingCleanseTag(): boolean {
  return sWildEncounterData.leadMonHeldItem === C.ITEM_CLEANSE_TAG;
}

export function ApplyCleanseTagEncounterRateMod(encounterRate: { value: number }): void {
  if (IsLeadMonHoldingCleanseTag())
    encounterRate.value = Math.trunc((encounterRate.value * 2) / 3);
}

export function GetAbilityEncounterRateModType(): number {
  sWildEncounterData.abilityEffect = 0;
  const lead = save.party[0];
  if (lead && !lead.isEgg) {
    const ab = ability(lead);
    if (ab === C.ABILITY_STENCH)
      sWildEncounterData.abilityEffect = 1;
    else if (ab === C.ABILITY_ILLUMINATE)
      sWildEncounterData.abilityEffect = 2;
  }
  return sWildEncounterData.abilityEffect;
}

export function DoWildEncounterRateDiceRoll(encounterRate: number): boolean {
  if ((WildEncounterRandom() % MAX_ENCOUNTER_RATE) < encounterRate)
    return true;
  return false;
}

export function DoGlobalWildEncounterDiceRoll(): boolean {
  if ((random() % 100) >= 60)
    return false;
  return true;
}

export function DoWildEncounterRateTest(encounterRate: number, ignoreAbility: boolean): boolean {
  let rate = encounterRate * 16;
  const playerFlags = sGame?.overworld.player.flags ?? 0;
  if (playerFlags & (C.PLAYER_AVATAR_FLAG_MACH_BIKE | C.PLAYER_AVATAR_FLAG_ACRO_BIKE))
    rate = Math.trunc((rate * 80) / 100);
  rate += Math.trunc((sWildEncounterData.encounterRateBuff * 16) / 200);

  const rateRef = { value: rate };
  ApplyFluteEncounterRateMod(rateRef);
  ApplyCleanseTagEncounterRateMod(rateRef);
  rate = rateRef.value;

  if (!ignoreAbility) {
    switch (sWildEncounterData.abilityEffect) {
      case 1:
        rate = Math.trunc(rate / 2);
        break;
      case 2:
        rate *= 2;
        break;
    }
  }

  if (rate > MAX_ENCOUNTER_RATE)
    rate = MAX_ENCOUNTER_RATE;

  return DoWildEncounterRateDiceRoll(rate);
}

export function GetMapBaseEncounterCooldown(encounterType: number): number {
  const headerIdx = GetCurrentMapWildMonHeaderId();
  if (headerIdx === HEADER_NONE)
    return 0xFF;
  const headers = data<WildPokemonHeader[]>("gWildMonHeaders");
  const header = headers[headerIdx];
  if (encounterType === C.TILE_ENCOUNTER_LAND) {
    if (!header.landMonsInfo)
      return 0xFF;
    const landInfo = data<WildPokemonInfo>((header.landMonsInfo as SymRef).$sym);
    if (landInfo.encounterRate >= 80)
      return 0;
    if (landInfo.encounterRate < 10)
      return 8;
    return 8 - Math.trunc(landInfo.encounterRate / 10);
  }
  if (encounterType === C.TILE_ENCOUNTER_WATER) {
    if (!header.waterMonsInfo)
      return 0xFF;
    const waterInfo = data<WildPokemonInfo>((header.waterMonsInfo as SymRef).$sym);
    if (waterInfo.encounterRate >= 80)
      return 0;
    if (waterInfo.encounterRate < 10)
      return 8;
    return 8 - Math.trunc(waterInfo.encounterRate / 10);
  }
  return 0xFF;
}

export function HandleWildEncounterCooldown(currMetatileAttrs: number): boolean {
  const encounterType = (currMetatileAttrs >>> 24) & 7;
  if (encounterType === C.TILE_ENCOUNTER_NONE)
    return false;
  let minSteps = GetMapBaseEncounterCooldown(encounterType);
  if (minSteps === 0xFF)
    return false;
  minSteps *= 256;
  let encRate = 5 * 256;
  switch (GetFluteEncounterRateModType()) {
    case 1:
      minSteps -= Math.trunc(minSteps / 2);
      encRate += Math.trunc(encRate / 2);
      break;
    case 2:
      minSteps *= 2;
      encRate = Math.trunc(encRate / 2);
      break;
  }
  sWildEncounterData.leadMonHeldItem = save.party[0]?.heldItem ?? 0;
  if (IsLeadMonHoldingCleanseTag()) {
    minSteps += Math.trunc(minSteps / 3);
    encRate -= Math.trunc(encRate / 3);
  }
  switch (GetAbilityEncounterRateModType()) {
    case 1:
      minSteps *= 2;
      encRate = Math.trunc(encRate / 2);
      break;
    case 2:
      minSteps = Math.trunc(minSteps / 2);
      encRate *= 2;
      break;
  }
  minSteps = Math.trunc(minSteps / 256);
  encRate = Math.trunc(encRate / 256);

  if (sWildEncounterData.stepsSinceLastEncounter >= minSteps)
    return true;
  sWildEncounterData.stepsSinceLastEncounter = (sWildEncounterData.stepsSinceLastEncounter + 1) & 0xFF;
  if ((random() % 100) < encRate)
    return true;
  return false;
}

export function StandardWildEncounter(currMetatileAttrs: number, previousMetatileBehavior: number): boolean {
  if (sWildEncountersDisabled)
    return false;

  const headerId = GetCurrentMapWildMonHeaderId();
  if (headerId !== HEADER_NONE) {
    const headers = data<WildPokemonHeader[]>("gWildMonHeaders");
    const header = headers[headerId];
    const encType = (currMetatileAttrs >>> 24) & 7;
    const isBridge = (currMetatileAttrs & 0x1FF) && MetatileBehavior_IsBridge(currMetatileAttrs & 0x1FF);
    const isSurfing = !!((sGame?.overworld.player.flags ?? 0) & C.PLAYER_AVATAR_FLAG_SURFING);

    if (encType === C.TILE_ENCOUNTER_LAND) {
      if (!header.landMonsInfo)
        return false;
      const landInfo = data<WildPokemonInfo>((header.landMonsInfo as SymRef).$sym);
      if (previousMetatileBehavior !== (currMetatileAttrs & 0x1FF) && !DoGlobalWildEncounterDiceRoll())
        return false;
      if (!DoWildEncounterRateTest(landInfo.encounterRate, false)) {
        AddToWildEncounterRateBuff(landInfo.encounterRate);
        return false;
      }
      const roamer = tryStartRoamerEncounter();
      if (roamer) {
        if (!IsWildLevelAllowedByRepel(roamerLevel()))
          return false;
        sGame?.battleSetup.startRoamerBattle(roamer);
        return true;
      }
      if (TryGenerateWildMon(landInfo, WILD_AREA_LAND, WILD_CHECK_REPEL)) {
        if (sLastGeneratedWildMon) sGame?.battleSetup.startWildBattle(sLastGeneratedWildMon);
        return true;
      } else {
        AddToWildEncounterRateBuff(landInfo.encounterRate);
      }
    } else if (encType === C.TILE_ENCOUNTER_WATER || (isSurfing && isBridge)) {
      if (!header.waterMonsInfo)
        return false;
      const waterInfo = data<WildPokemonInfo>((header.waterMonsInfo as SymRef).$sym);
      if (previousMetatileBehavior !== (currMetatileAttrs & 0x1FF) && !DoGlobalWildEncounterDiceRoll())
        return false;
      if (!DoWildEncounterRateTest(waterInfo.encounterRate, false)) {
        AddToWildEncounterRateBuff(waterInfo.encounterRate);
        return false;
      }
      const roamer = tryStartRoamerEncounter();
      if (roamer) {
        if (!IsWildLevelAllowedByRepel(roamerLevel()))
          return false;
        sGame?.battleSetup.startRoamerBattle(roamer);
        return true;
      }
      if (TryGenerateWildMon(waterInfo, WILD_AREA_WATER, WILD_CHECK_REPEL)) {
        if (sLastGeneratedWildMon) sGame?.battleSetup.startWildBattle(sLastGeneratedWildMon);
        return true;
      } else {
        AddToWildEncounterRateBuff(waterInfo.encounterRate);
      }
    }
  }
  return false;
}

export function TryStandardWildEncounter(currMetatileAttrs: number): boolean {
  if (!HandleWildEncounterCooldown(currMetatileAttrs)) {
    sWildEncounterData.prevMetatileBehavior = currMetatileAttrs & 0x1FF;
    return false;
  } else if (StandardWildEncounter(currMetatileAttrs, sWildEncounterData.prevMetatileBehavior)) {
    sWildEncounterData.encounterRateBuff = 0;
    sWildEncounterData.stepsSinceLastEncounter = 0;
    sWildEncounterData.prevMetatileBehavior = currMetatileAttrs & 0x1FF;
    return true;
  } else {
    sWildEncounterData.prevMetatileBehavior = currMetatileAttrs & 0x1FF;
    return false;
  }
}

export function RockSmashWildEncounter(): void {
  const headerIdx = GetCurrentMapWildMonHeaderId();
  if (headerIdx === HEADER_NONE) {
    varSet(C.VAR_RESULT, 0);
    return;
  }
  const headers = data<WildPokemonHeader[]>("gWildMonHeaders");
  const header = headers[headerIdx];
  if (!header.rockSmashMonsInfo) {
    varSet(C.VAR_RESULT, 0);
    return;
  }
  const info = data<WildPokemonInfo>((header.rockSmashMonsInfo as SymRef).$sym);
  if (!DoWildEncounterRateTest(info.encounterRate, true)) {
    varSet(C.VAR_RESULT, 0);
    return;
  }
  if (TryGenerateWildMon(info, WILD_AREA_ROCKS, WILD_CHECK_REPEL)) {
    if (sLastGeneratedWildMon) sGame?.battleSetup.startWildBattle(sLastGeneratedWildMon);
    varSet(C.VAR_RESULT, 1);
  } else {
    varSet(C.VAR_RESULT, 0);
  }
}

export function SweetScentWildEncounter(): boolean {
  const headerId = GetCurrentMapWildMonHeaderId();
  if (headerId === HEADER_NONE)
    return false;

  const p = sGame?.overworld.player?.object?.currentCoords ?? { x: 0, y: 0 };
  const attrs = sGame?.overworld.map.attributesOf(sGame.overworld.map.metatileIdAt(p.x, p.y)) ?? 0;
  const encType = (attrs >>> 24) & 7;
  const headers = data<WildPokemonHeader[]>("gWildMonHeaders");
  const header = headers[headerId];

  if (encType === C.TILE_ENCOUNTER_LAND) {
    const roamer = tryStartRoamerEncounter();
    if (roamer) {
      sGame?.battleSetup.startRoamerBattle(roamer);
      return true;
    }
    if (!header.landMonsInfo)
      return false;
    const info = data<WildPokemonInfo>((header.landMonsInfo as SymRef).$sym);
    TryGenerateWildMon(info, WILD_AREA_LAND, 0);
    if (sLastGeneratedWildMon) sGame?.battleSetup.startWildBattle(sLastGeneratedWildMon);
    return true;
  } else if (encType === C.TILE_ENCOUNTER_WATER) {
    const roamer = tryStartRoamerEncounter();
    if (roamer) {
      sGame?.battleSetup.startRoamerBattle(roamer);
      return true;
    }
    if (!header.waterMonsInfo)
      return false;
    const info = data<WildPokemonInfo>((header.waterMonsInfo as SymRef).$sym);
    TryGenerateWildMon(info, WILD_AREA_WATER, 0);
    if (sLastGeneratedWildMon) sGame?.battleSetup.startWildBattle(sLastGeneratedWildMon);
    return true;
  }
  return false;
}

export function DoesCurrentMapHaveFishingMons(): boolean {
  const headerIdx = GetCurrentMapWildMonHeaderId();
  if (headerIdx === HEADER_NONE)
    return false;
  const headers = data<WildPokemonHeader[]>("gWildMonHeaders");
  return !!headers[headerIdx]?.fishingMonsInfo;
}

export function FishingWildEncounter(rod: number): void {
  const headerIdx = GetCurrentMapWildMonHeaderId();
  if (headerIdx === HEADER_NONE)
    return;
  const headers = data<WildPokemonHeader[]>("gWildMonHeaders");
  if (!headers[headerIdx]?.fishingMonsInfo)
    return;
  const info = data<WildPokemonInfo>((headers[headerIdx].fishingMonsInfo as SymRef).$sym);
  GenerateFishingEncounter(info, rod);
  incrementGameStat(C.GAME_STAT_FISHING_CAPTURES);
  if (sLastGeneratedWildMon) sGame?.battleSetup.startWildBattle(sLastGeneratedWildMon);
}

export function GetLocalWildMon(isWaterMon?: { value: boolean }): number {
  if (isWaterMon) isWaterMon.value = false;
  const headerId = GetCurrentMapWildMonHeaderId();
  if (headerId === HEADER_NONE)
    return C.SPECIES_NONE;

  const headers = data<WildPokemonHeader[]>("gWildMonHeaders");
  const header = headers[headerId];
  const landMonsInfo = header.landMonsInfo ? data<WildPokemonInfo>((header.landMonsInfo as SymRef).$sym) : null;
  const waterMonsInfo = header.waterMonsInfo ? data<WildPokemonInfo>((header.waterMonsInfo as SymRef).$sym) : null;

  if (!landMonsInfo && !waterMonsInfo)
    return C.SPECIES_NONE;

  if (landMonsInfo && !waterMonsInfo) {
    const list = data<WildPokemon[]>(landMonsInfo.wildPokemon.$sym);
    return list[ChooseWildMonIndex_Land()].species;
  } else if (!landMonsInfo && waterMonsInfo) {
    if (isWaterMon) isWaterMon.value = true;
    const list = data<WildPokemon[]>(waterMonsInfo.wildPokemon.$sym);
    return list[ChooseWildMonIndex_WaterRock()].species;
  }

  if ((random() % 100) < 80) {
    const list = data<WildPokemon[]>(landMonsInfo!.wildPokemon.$sym);
    return list[ChooseWildMonIndex_Land()].species;
  } else {
    if (isWaterMon) isWaterMon.value = true;
    const list = data<WildPokemon[]>(waterMonsInfo!.wildPokemon.$sym);
    return list[ChooseWildMonIndex_WaterRock()].species;
  }
}

export function GetLocalWaterMon(): number {
  const headerId = GetCurrentMapWildMonHeaderId();
  if (headerId !== HEADER_NONE) {
    const headers = data<WildPokemonHeader[]>("gWildMonHeaders");
    const header = headers[headerId];
    if (header.waterMonsInfo) {
      const waterMonsInfo = data<WildPokemonInfo>((header.waterMonsInfo as SymRef).$sym);
      const list = data<WildPokemon[]>(waterMonsInfo.wildPokemon.$sym);
      return list[ChooseWildMonIndex_WaterRock()].species;
    }
  }
  return C.SPECIES_NONE;
}

export function UpdateRepelCounter(): boolean {
  const steps = varGet(C.VAR_REPEL_STEP_COUNT);
  if (steps !== 0) {
    const nextSteps = steps - 1;
    varSet(C.VAR_REPEL_STEP_COUNT, nextSteps);
    if (nextSteps === 0) {
      return true;
    }
  }
  return false;
}

export class WildEncounter {
  constructor(game: Game) {
    setWildEncounterGame(game);
  }

  get disabled(): boolean {
    return sWildEncountersDisabled;
  }
  set disabled(state: boolean) {
    DisableWildEncounters(state);
  }

  seed(value: number): void {
    SeedWildEncounterRng(value);
  }

  tryStandardWildEncounter(attributes: number): boolean {
    return TryStandardWildEncounter(attributes);
  }

  rockSmashEncounter(): boolean {
    RockSmashWildEncounter();
    return varGet(C.VAR_RESULT) === 1;
  }

  sweetScentEncounter(attributes?: number): boolean {
    return SweetScentWildEncounter();
  }

  hasFishingMons(): boolean {
    return DoesCurrentMapHaveFishingMons();
  }

  fishingEncounter(rod: number): boolean {
    FishingWildEncounter(rod);
    return true;
  }

  getLocalWildMon(): { species: number; isWaterMon: boolean } {
    const isWater = { value: false };
    const species = GetLocalWildMon(isWater);
    return { species, isWaterMon: isWater.value };
  }

  getLocalWaterMon(): number {
    return GetLocalWaterMon();
  }
}
