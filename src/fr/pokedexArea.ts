// wild_pokemon_area.c + pokedex_area_markers.c.
// Resolves C encounter tables and MAPSEC-to-DEX_AREA tables into the same
// marker subsprite records used by the original Pokédex area map. The screen,
// OBJ-window blend setup, marker animation, and destroy lifecycle remain in
// the Pokédex graphics port.

import * as C from "./generated/constants";
import { cdata, loadCData } from "./hw/assets";
import { rom } from "./rom";
import { flagGet, varGet } from "./save";
import { roamerMapSection } from "./pokemon/roamer";

export type AreaMarkerSubsprite = {
  dexArea: number;
  x: number;
  y: number;
  size: number;
  shape: number;
  priority: number;
  tileOffset: number;
};

const AREA_TABLES = ["sDexAreas_Kanto", "sDexAreas_Sevii1", "sDexAreas_Sevii2", "sDexAreas_Sevii3", "sDexAreas_Sevii4", "sDexAreas_Sevii5", "sDexAreas_Sevii6", "sDexAreas_Sevii7"];
const SEVII_FLAGS = [
  C.FLAG_WORLD_MAP_ONE_ISLAND, C.FLAG_WORLD_MAP_TWO_ISLAND, C.FLAG_WORLD_MAP_THREE_ISLAND,
  C.FLAG_WORLD_MAP_FOUR_ISLAND, C.FLAG_WORLD_MAP_FIVE_ISLAND, C.FLAG_WORLD_MAP_SIX_ISLAND,
  C.FLAG_WORLD_MAP_SEVEN_ISLAND,
];
const ROAMER_STARTERS = [C.SPECIES_BULBASAUR, C.SPECIES_CHARMANDER, C.SPECIES_SQUIRTLE];
const MARKER_SUBSPRITES = [
  "sSubsprite_Circular", "sSubsprite_SmallHorizontal", "sSubsprite_SmallVertical",
  "sSubsprite_MediumHorizontal", "sSubsprite_MediumVertical", "sSubsprite_LargeHorizontal", "sSubsprite_LargeVertical",
];

type CSubsprite = { size: number; shape: number; priority: number; tileOffset: number };
type RoamerPair = { roamer: number; starter: number };

/** Load the source cdata files needed by GetSpeciesPokedexAreaMarkers. */
export async function loadPokedexAreaData(): Promise<void> {
  await loadCData("wild_pokemon_area", "pokedex_area_markers");
}

function dexAreasForMapSection(mapSection: number, table: number[][]): number[] {
  return table.filter((entry) => entry[0] === mapSection).map((entry) => entry[1]);
}

function isSpeciesOnMap(header: (typeof rom.wild.maps)[string], species: number): boolean {
  return [header.land_mons, header.water_mons, header.fishing_mons, header.rock_smash_mons]
    .some((encounters) => encounters?.mons.some((mon) => mon[2] === species) ?? false);
}

function unlockedSeviiMask(): number {
  return SEVII_FLAGS.reduce((mask, flag, island) => flagGet(flag) ? mask | (1 << island) : mask, 0);
}

/** GetSpeciesPokedexAreaMarkers; returns one source subsprite per matching area. */
export async function getSpeciesPokedexAreaMarkers(species: number): Promise<AreaMarkerSubsprite[]> {
  await loadPokedexAreaData();
  const kanto = cdata<number[][]>("wild_pokemon_area", AREA_TABLES[0]);
  const roamerPairs = cdata<RoamerPair[]>("wild_pokemon_area", "sRoamerPairs");
  const roamerPair = roamerPairs.find((pair) => pair.roamer === species);
  let dexAreas: number[] = [];

  if (roamerPair) {
    const selectedStarter = varGet(C.VAR_STARTER_MON);
    const starterIndex = selectedStarter < ROAMER_STARTERS.length ? selectedStarter : 0;
    if (roamerPair.starter === ROAMER_STARTERS[starterIndex]) {
      dexAreas = dexAreasForMapSection(roamerMapSection(), kanto).slice(0, 1);
    }
  } else {
    const seviiAreas = unlockedSeviiMask();
    const savedAlteringCaveSet = varGet(C.VAR_ALTERING_CAVE_WILD_SET);
    const alteringCaveSet = savedAlteringCaveSet >= C.NUM_ALTERING_CAVE_TABLES ? 0 : savedAlteringCaveSet;
    let alteringCaveCount = 0;

    for (const [mapId, encounters] of Object.entries(rom.wild.maps)) {
      const mapMeta = rom.mapIndex.maps[mapId];
      if (!mapMeta) continue;
      const mapSection = rom.c(mapMeta.section);
      if (mapSection === C.MAPSEC_ALTERING_CAVE) {
        const thisCaveSet = alteringCaveCount++;
        if (thisCaveSet !== alteringCaveSet) continue;
      }
      if (!isSpeciesOnMap(encounters, species)) continue;

      dexAreas.push(...dexAreasForMapSection(mapSection, kanto));
      for (let island = 0; island < 7; island++) {
        if (!(seviiAreas & (1 << island))) continue;
        const table = cdata<number[][]>("wild_pokemon_area", AREA_TABLES[island + 1]);
        dexAreas.push(...dexAreasForMapSection(mapSection, table));
      }
    }
  }

  const areas = cdata<number[][]>("pokedex_area_markers", "sAreaMarkers");
  return dexAreas.flatMap((dexArea) => {
    const [markerKind, x, y] = areas[dexArea] ?? [];
    if (markerKind === undefined) return [];
    const markerName = MARKER_SUBSPRITES[markerKind];
    if (!markerName) return [];
    const marker = cdata<CSubsprite>("pokedex_area_markers", markerName);
    return [{ dexArea, x, y, ...marker }];
  });
}
