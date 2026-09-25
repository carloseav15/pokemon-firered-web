// wild_pokemon_area.c + pokedex_area_markers.c: the red ellipses on the Pokédex
// area map. All markers form one OBJ-window sprite whose subsprites come from
// sAreaMarkers, selected by the MAPSEC -> DEX_AREA tables.
// Adaptations: PAM_TaskData lives in a Map keyed by task id (like hw/listMenu);
// IsSpeciesOnMap reads FISH_WILD_COUNT fishing slots. The C reads LAND_WILD_COUNT,
// so its two extra slots come from the ROM bytes after the table. Those bytes are
// the FishingMonsInfo rate and the pointer halves, and they cannot be reproduced.

import * as C from "./generated/constants";
import { tasks } from "./gba/tasks";
import { cdata, incbin, loadCData, symName, type SymRef } from "./hw/assets";
import { BG_ATTR_CHARBASEINDEX, CopyBgTilemapBufferToVram, FillBgTilemapBufferRect_Palette0, HideBg, SetBgAttribute, ShowBg } from "./hw/bg";
import { ClearGpuRegBits, SetGpuReg, SetGpuRegBits } from "./hw/gpu";
import { LoadPalette, OBJ_PLTT_ID } from "./hw/palette";
import {
  BLDALPHA_BLEND, BLDCNT_EFFECT_BLEND, BLDCNT_TGT1_BG1, BLDCNT_TGT2_BD, BLDCNT_TGT2_BG0, BLDCNT_TGT2_BG1, BLDCNT_TGT2_BG2, BLDCNT_TGT2_BG3,
  DISPCNT_OBJWIN_ON, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT, REG_OFFSET_WININ, REG_OFFSET_WINOUT,
  WININ_WIN0_BG_ALL, WININ_WIN0_OBJ, WININ_WIN1_BG_ALL, WININ_WIN1_OBJ, WINOUT_WIN01_BG0, WINOUT_WIN01_BG2, WINOUT_WIN01_BG3,
  WINOUT_WIN01_BG_ALL, WINOUT_WIN01_CLR, WINOUT_WIN01_OBJ, WINOUT_WINOBJ_BG_ALL, WINOUT_WINOBJ_CLR, WINOUT_WINOBJ_OBJ,
} from "./hw/ppu";
import {
  CreateSprite, DestroySprite, FreeSpriteTilesByTag, gDummySpriteTemplate, gSprites, LoadSpriteSheet, SetSubspriteTables, ST_OAM_OBJ_WINDOW, TAG_NONE,
  type Subsprite,
} from "./hw/sprite";
import { roamerMapSection } from "./pokemon/roamer";
import { rom } from "./rom";
import { flagGet, varGet } from "./save";

// ---------------------------------------------------------------- wild_pokemon_area.c

type RoamerPair = { roamer: number; starter: number };
type WildPokemonHeader = { mapGroup: number; mapNum: number; landMonsInfo: SymRef | 0; waterMonsInfo: SymRef | 0; rockSmashMonsInfo: SymRef | 0; fishingMonsInfo: SymRef | 0 };
type WildPokemonInfo = { encounterRate: number; wildPokemon: SymRef };
type WildPokemon = { minLevel: number; maxLevel: number; species: number };

const area = <T>(name: string) => cdata<T>("wild_pokemon_area", name);
const wild = <T>(name: string) => cdata<T>("wild_encounter", name);

/** Loads the cdata that GetSpeciesPokedexAreaMarkers and CreatePokedexAreaMarkers read. */
export async function loadPokedexAreaData(): Promise<void> {
  await loadCData("wild_pokemon_area", "pokedex_area_markers", "wild_encounter");
}

/** field_specials.c GetUnlockedSeviiAreas */
export function GetUnlockedSeviiAreas(): number {
  let result = 0;
  if (flagGet(C.FLAG_WORLD_MAP_ONE_ISLAND) === true) result |= 1 << 0;
  if (flagGet(C.FLAG_WORLD_MAP_TWO_ISLAND) === true) result |= 1 << 1;
  if (flagGet(C.FLAG_WORLD_MAP_THREE_ISLAND) === true) result |= 1 << 2;
  if (flagGet(C.FLAG_WORLD_MAP_FOUR_ISLAND) === true) result |= 1 << 3;
  if (flagGet(C.FLAG_WORLD_MAP_FIVE_ISLAND) === true) result |= 1 << 4;
  if (flagGet(C.FLAG_WORLD_MAP_SIX_ISLAND) === true) result |= 1 << 5;
  if (flagGet(C.FLAG_WORLD_MAP_SEVEN_ISLAND) === true) result |= 1 << 6;
  return result;
}

/** field_specials.c GetStarterSpecies */
function GetStarterSpecies(): number {
  const starters = [C.SPECIES_BULBASAUR, C.SPECIES_SQUIRTLE, C.SPECIES_CHARMANDER];
  const idx = varGet(C.VAR_STARTER_MON);
  return starters[idx >= starters.length ? 0 : idx];
}

/** Scans for the given species and fills `subsprites` with its area markers; returns the count. */
export function GetSpeciesPokedexAreaMarkers(species: number, subsprites: Subsprite[]): number {
  if (GetRoamerIndex(species) >= 0) return GetRoamerPokedexAreaMarkers(species, subsprites);

  const kanto = area<number[][]>("sDexAreas_Kanto");
  const sevii = area<Array<[SymRef, unknown]>>("sSeviiDexAreas").map(([table]) => area<number[][]>(symName(table)!));
  const seviiAreas = GetUnlockedSeviiAreas();
  let alteringCaveCount = 0;
  let alteringCaveNum = varGet(C.VAR_ALTERING_CAVE_WILD_SET);
  if (alteringCaveNum >= C.NUM_ALTERING_CAVE_TABLES) alteringCaveNum = 0;
  const headers = wild<WildPokemonHeader[]>("gWildMonHeaders");
  let areaCount = 0;
  for (let i = 0; headers[i].mapGroup !== (C.MAP_UNDEFINED >> 8); i++) {
    const mapSecId = GetMapSecIdFromWildMonHeader(headers[i]);
    if (mapSecId === C.MAPSEC_ALTERING_CAVE) {
      alteringCaveCount++;
      if (alteringCaveNum !== alteringCaveCount - 1) continue;
    }
    if (IsSpeciesOnMap(headers[i], species)) {
      // Search for all dex areas associated with this MAPSEC.
      // In the vanilla game each MAPSEC only has at most one DEX_AREA.
      const cursor = { index: 0, dexArea: 0 };
      while (FindDexAreaByMapSec(mapSecId, kanto, kanto.length, cursor)) {
        if (cursor.dexArea !== C.DEX_AREA_NONE) GetAreaMarkerSubsprite(areaCount++, cursor.dexArea, subsprites);
      }
      for (let j = 0; j < sevii.length; j++) {
        if ((seviiAreas >> j) & 1) {
          // Search for all dex areas associated with this MAPSEC in this unlocked Sevii Island
          const seviiCursor = { index: 0, dexArea: 0 };
          while (FindDexAreaByMapSec(mapSecId, sevii[j], sevii[j].length, seviiCursor)) {
            if (seviiCursor.dexArea !== C.DEX_AREA_NONE) GetAreaMarkerSubsprite(areaCount++, seviiCursor.dexArea, subsprites);
          }
        }
      }
    }
  }
  return areaCount;
}

function GetRoamerIndex(species: number): number {
  const pairs = area<RoamerPair[]>("sRoamerPairs");
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].roamer === species) return i;
  }
  return -1;
}

function GetRoamerPokedexAreaMarkers(species: number, subsprites: Subsprite[]): number {
  // Make sure that this is a roamer species, and that it corresponds to the player's starter.
  const roamerIdx = GetRoamerIndex(species);
  if (roamerIdx < 0) return 0;
  if (area<RoamerPair[]>("sRoamerPairs")[roamerIdx].starter !== GetStarterSpecies()) return 0;

  const mapSecId = roamerMapSection();
  const kanto = area<number[][]>("sDexAreas_Kanto");
  const cursor = { index: 0, dexArea: 0 };
  if (FindDexAreaByMapSec(mapSecId, kanto, kanto.length, cursor)) {
    if (cursor.dexArea !== C.DEX_AREA_NONE) {
      GetAreaMarkerSubsprite(0, cursor.dexArea, subsprites);
      return 1;
    }
  }
  return 0;
}

function IsSpeciesOnMap(data: WildPokemonHeader, species: number): boolean {
  if (IsSpeciesInEncounterTable(data.landMonsInfo, species, C.LAND_WILD_COUNT)) return true;
  if (IsSpeciesInEncounterTable(data.waterMonsInfo, species, C.WATER_WILD_COUNT)) return true;
  // The C passes LAND_WILD_COUNT here (see the header comment).
  if (IsSpeciesInEncounterTable(data.fishingMonsInfo, species, C.FISH_WILD_COUNT)) return true;
  if (IsSpeciesInEncounterTable(data.rockSmashMonsInfo, species, C.ROCK_WILD_COUNT)) return true;
  return false;
}

function IsSpeciesInEncounterTable(infoRef: SymRef | 0, species: number, count: number): boolean {
  if (infoRef) {
    const info = wild<WildPokemonInfo>(symName(infoRef)!);
    const mons = wild<WildPokemon[]>(symName(info.wildPokemon)!);
    for (let i = 0; i < count && i < mons.length; i++) {
      if (mons[i].species === species) return true;
    }
  }
  return false;
}

function GetMapSecIdFromWildMonHeader(header: WildPokemonHeader): number {
  const id = rom.mapIdByNum((header.mapGroup << 8) | header.mapNum);
  return id ? rom.c(rom.mapIndex.maps[id].section) : C.MAPSEC_NONE;
}

/** Searches a MAPSEC -> DEX_AREA table from cursor.index; sets dexArea and the next index. */
function FindDexAreaByMapSec(mapSecId: number, table: number[][], count: number, cursor: { index: number; dexArea: number }): boolean {
  for (let i = cursor.index; i < count; i++) {
    if (table[i][0] === mapSecId) {
      cursor.dexArea = table[i][1];
      cursor.index = i + 1;
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- pokedex_area_markers.c

type PAM_TaskData = { subsprites: { subspriteCount: number; subsprites: Subsprite[] }; spriteId: number; tilesTag: number; paletteTag: number };
type CSubsprite = { size: number; shape: number; priority: number; tileOffset: number };

const sTaskData = new Map<number, PAM_TaskData>();
const marker = <T>(name: string) => cdata<T>("pokedex_area_markers", name);

function Task_ShowAreaMarkers(taskId: number): void {
  const data = sTaskData.get(taskId)!;
  gSprites[data.spriteId].invisible = false;
}

export function CreatePokedexAreaMarkers(species: number, tilesTag: number, palIdx: number, y: number): number {
  // Load gfx
  LoadSpriteSheet({ data: incbin("sMarkerTiles"), size: 0x4a0, tag: tilesTag });
  LoadPalette(incbin("sMarkerPal"), OBJ_PLTT_ID(palIdx), 32);

  // Get marker subsprites
  const taskId = tasks.create(Task_ShowAreaMarkers, 0);
  const subsprites: Subsprite[] = [];
  const data: PAM_TaskData = { subsprites: { subspriteCount: 0, subsprites }, spriteId: 0, tilesTag, paletteTag: TAG_NONE };
  sTaskData.set(taskId, data);
  data.subsprites.subspriteCount = GetSpeciesPokedexAreaMarkers(species, subsprites);

  SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_OBJWIN_ON);
  SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG1 | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_BG0 | BLDCNT_TGT2_BG1 | BLDCNT_TGT2_BG2 | BLDCNT_TGT2_BG3 | BLDCNT_TGT2_BD);
  SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(12, 8));
  SetGpuReg(REG_OFFSET_BLDY, 0);
  SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_BG_ALL | WININ_WIN0_OBJ | WININ_WIN1_BG_ALL | WININ_WIN1_OBJ);
  SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG0 | WINOUT_WIN01_BG2 | WINOUT_WIN01_BG3 | WINOUT_WIN01_OBJ | WINOUT_WIN01_CLR | WINOUT_WINOBJ_BG_ALL | WINOUT_WINOBJ_CLR);

  // Set marker subsprites on full sprite
  data.spriteId = CreateSprite({ ...gDummySpriteTemplate, tileTag: tilesTag }, 104, y + 32, 0);
  const sprite = gSprites[data.spriteId];
  SetSubspriteTables(sprite, [data.subsprites]);
  sprite.oam.objMode = ST_OAM_OBJ_WINDOW;
  sprite.oam.paletteNum = palIdx;
  sprite.subspriteTableNum = 0;
  sprite.invisible = true;

  // Show markers
  HideBg(1);
  SetBgAttribute(1, BG_ATTR_CHARBASEINDEX, 0);
  FillBgTilemapBufferRect_Palette0(1, 0x00f, 0, 0, 30, 20);
  CopyBgTilemapBufferToVram(1);
  ShowBg(1);
  return taskId;
}

export function DestroyPokedexAreaMarkers(taskId: number): void {
  const data = sTaskData.get(taskId)!;
  FreeSpriteTilesByTag(data.tilesTag);
  DestroySprite(gSprites[data.spriteId]);
  sTaskData.delete(taskId);
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  SetGpuReg(REG_OFFSET_BLDALPHA, 0);
  SetGpuReg(REG_OFFSET_BLDY, 0);
  SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_BG_ALL | WININ_WIN0_OBJ | WININ_WIN1_BG_ALL | WININ_WIN1_OBJ);
  SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG_ALL | WINOUT_WIN01_OBJ | WINOUT_WINOBJ_BG_ALL | WINOUT_WINOBJ_OBJ);
  ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_OBJWIN_ON);
  HideBg(1);
  SetBgAttribute(1, BG_ATTR_CHARBASEINDEX, 2);
  FillBgTilemapBufferRect_Palette0(1, 0x000, 0, 0, 30, 20);
  CopyBgTilemapBufferToVram(1);
  ShowBg(1);
  tasks.destroy(taskId);
}

export function GetAreaMarkerSubsprite(i: number, dexArea: number, subsprites: Subsprite[]): void {
  // [DEX_AREA_NONE] = {} is exported as an empty row; C zero-fills it.
  const [kind = 0, x = 0, y = 0] = marker<number[][]>("sAreaMarkers")[dexArea];
  const sub = marker<CSubsprite>(symName(marker<SymRef[]>("sSubsprites")[kind])!);
  subsprites[i] = { x: (x << 24) >> 24, y: (y << 24) >> 24, shape: sub.shape, size: sub.size, tileOffset: sub.tileOffset, priority: sub.priority };
}

export function GetNumPokedexAreaMarkers(taskId: number): number {
  return sTaskData.get(taskId)!.subsprites.subspriteCount;
}
