// save_location.c: map classification and the save-warp / GCN link flags.

import * as C from "../generated/constants";
import { rom } from "../rom";
import { save } from "../save";

const POKECENTER_MAPS = [
  "VIRIDIAN_CITY_POKEMON_CENTER_1F", "VIRIDIAN_CITY_POKEMON_CENTER_2F", "PEWTER_CITY_POKEMON_CENTER_1F", "PEWTER_CITY_POKEMON_CENTER_2F",
  "CERULEAN_CITY_POKEMON_CENTER_1F", "CERULEAN_CITY_POKEMON_CENTER_2F", "LAVENDER_TOWN_POKEMON_CENTER_1F", "LAVENDER_TOWN_POKEMON_CENTER_2F",
  "VERMILION_CITY_POKEMON_CENTER_1F", "VERMILION_CITY_POKEMON_CENTER_2F", "CELADON_CITY_POKEMON_CENTER_1F", "CELADON_CITY_POKEMON_CENTER_2F",
  "FUCHSIA_CITY_POKEMON_CENTER_1F", "FUCHSIA_CITY_POKEMON_CENTER_2F", "CINNABAR_ISLAND_POKEMON_CENTER_1F", "CINNABAR_ISLAND_POKEMON_CENTER_2F",
  "INDIGO_PLATEAU_POKEMON_CENTER_1F", "INDIGO_PLATEAU_POKEMON_CENTER_2F", "SAFFRON_CITY_POKEMON_CENTER_1F", "SAFFRON_CITY_POKEMON_CENTER_2F",
  "ROUTE4_POKEMON_CENTER_1F", "ROUTE4_POKEMON_CENTER_2F", "ROUTE10_POKEMON_CENTER_1F", "ROUTE10_POKEMON_CENTER_2F",
  "ONE_ISLAND_POKEMON_CENTER_1F", "ONE_ISLAND_POKEMON_CENTER_2F", "TWO_ISLAND_POKEMON_CENTER_1F", "TWO_ISLAND_POKEMON_CENTER_2F",
  "THREE_ISLAND_POKEMON_CENTER_1F", "THREE_ISLAND_POKEMON_CENTER_2F", "FOUR_ISLAND_POKEMON_CENTER_1F", "FOUR_ISLAND_POKEMON_CENTER_2F",
  "FIVE_ISLAND_POKEMON_CENTER_1F", "FIVE_ISLAND_POKEMON_CENTER_2F", "SEVEN_ISLAND_POKEMON_CENTER_1F", "SEVEN_ISLAND_POKEMON_CENTER_2F",
  "SIX_ISLAND_POKEMON_CENTER_1F", "SIX_ISLAND_POKEMON_CENTER_2F", "BATTLE_COLOSSEUM_2P", "TRADE_CENTER", "BATTLE_COLOSSEUM_4P", "UNION_ROOM",
];

function IsCurMapInLocationList(list: readonly number[]): boolean {
  const locSum = (save.location.mapGroup << 8) + save.location.mapNum;
  for (const map of list) {
    if (map === C.MAP_UNDEFINED) break;
    if (map === locSum) return true;
  }
  return false;
}

const SAVE_LOCATION_POKECENTER_LIST = POKECENTER_MAPS.map((name) => {
  const mapId = C[`MAP_${name}` as keyof typeof C];
  if (typeof mapId !== "number") throw new Error(`Missing generated map constant MAP_${name}`);
  return mapId;
}).concat(C.MAP_UNDEFINED);
const SAVE_LOCATION_RELOAD_LIST = [C.MAP_UNDEFINED];
const EMPTY_MAP_LIST = [C.MAP_UNDEFINED];

export function IsCurMapPokeCenter(): boolean { return IsCurMapInLocationList(SAVE_LOCATION_POKECENTER_LIST); }
export function IsCurMapReloadLocation(): boolean { return IsCurMapInLocationList(SAVE_LOCATION_RELOAD_LIST); }
export function IsCurMapInEmptyList(): boolean { return IsCurMapInLocationList(EMPTY_MAP_LIST); }

function saveBlock2(): { specialSaveWarpFlags?: number; gcnLinkFlags?: number } {
  return save as unknown as { specialSaveWarpFlags?: number; gcnLinkFlags?: number };
}

function TrySetPokeCenterWarpStatus(): void {
  const s = saveBlock2();
  s.specialSaveWarpFlags = IsCurMapPokeCenter()
    ? (s.specialSaveWarpFlags ?? 0) | C.POKECENTER_SAVEWARP
    : (s.specialSaveWarpFlags ?? 0) & ~C.POKECENTER_SAVEWARP;
}

function TrySetReloadWarpStatus(): void {
  const s = saveBlock2();
  s.specialSaveWarpFlags = IsCurMapReloadLocation()
    ? (s.specialSaveWarpFlags ?? 0) | C.LOBBY_SAVEWARP
    : (s.specialSaveWarpFlags ?? 0) & ~C.LOBBY_SAVEWARP;
}

function TrySetUnknownWarpStatus(): void {
  const s = saveBlock2();
  s.specialSaveWarpFlags = IsCurMapInEmptyList()
    ? (s.specialSaveWarpFlags ?? 0) | C.UNK_SPECIAL_SAVE_WARP_FLAG_3
    : (s.specialSaveWarpFlags ?? 0) & ~C.UNK_SPECIAL_SAVE_WARP_FLAG_3;
}

export function TrySetMapSaveWarpStatus(): void {
  TrySetPokeCenterWarpStatus();
  TrySetReloadWarpStatus();
  TrySetUnknownWarpStatus();
}

export function SetUnlockedPokedexFlags(): void {
  const s = saveBlock2();
  s.gcnLinkFlags = (s.gcnLinkFlags ?? 0) | (1 << 0) | (1 << 4) | (1 << 5);
}

export function SetPostgameFlags(): void {
  const s = saveBlock2();
  s.specialSaveWarpFlags = (s.specialSaveWarpFlags ?? 0) | C.CHAMPION_SAVEWARP;
  s.gcnLinkFlags = (s.gcnLinkFlags ?? 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 15);
}
