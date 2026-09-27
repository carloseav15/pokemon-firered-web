// Core context and availability state from help_system.c.

import * as C from "./generated/constants";
import { gQuestLogState } from "./questLogEvents";
import { flagGet, save } from "./save";
import { IsCurMapPokeCenter } from "./pokemon/saveLocation";
import { rom } from "./rom";

let contextId = C.HELPCONTEXT_NONE;
let enabled = false;
let toggleWithRButtonDisabled = false;
let contextBackup = C.HELPCONTEXT_NONE;

export function GetHelpContext(): number { return contextId; }

/** SetHelpContextDontCheckBattle. */
export function SetHelpContextDontCheckBattle(id: number): void { contextId = id & 0xff; }

/** SetHelpContext: keep field-help contexts while opening the bag or party during battle. */
export function SetHelpContext(id: number): void {
  const inBattle = contextId === C.HELPCONTEXT_WILD_BATTLE
    || contextId === C.HELPCONTEXT_TRAINER_BATTLE_SINGLE
    || contextId === C.HELPCONTEXT_TRAINER_BATTLE_DOUBLE
    || contextId === C.HELPCONTEXT_SAFARI_BATTLE;
  const battleMenuContext = id === C.HELPCONTEXT_BAG || id === C.HELPCONTEXT_PARTY_MENU
    || id === C.HELPCONTEXT_POKEMON_INFO || id === C.HELPCONTEXT_POKEMON_SKILLS
    || id === C.HELPCONTEXT_POKEMON_MOVES;
  if (!inBattle || !battleMenuContext) contextId = id & 0xff;
}

/** Script_SetHelpContext, called through the script-special dispatcher. */
export function Script_SetHelpContext(id: number): void { contextId = id & 0xff; }
export function BackupHelpContext(): void { contextBackup = contextId; }
export function RestoreHelpContext(): void { contextId = contextBackup; }

/** HelpSystem_Disable / HelpSystem_Enable. */
export function HelpSystem_Disable(): void { enabled = false; }
export function HelpSystem_Enable(): void {
  if (gQuestLogState !== C.QL_STATE_PLAYBACK && gQuestLogState !== C.QL_STATE_PLAYBACK_LAST) {
    enabled = true;
    HelpSystem_EnableToggleWithRButton();
  }
}
export function IsHelpSystemEnabled(): boolean { return enabled; }
export function HelpSystem_DisableToggleWithRButton(): void { toggleWithRButtonDisabled = true; }
export function HelpSystem_EnableToggleWithRButton(): void { toggleWithRButtonDisabled = false; }
export function IsHelpSystemToggleWithRButtonDisabled(): boolean { return toggleWithRButtonDisabled; }

const MART_MAPS = [
  "MAP_VIRIDIAN_CITY_MART", "MAP_PEWTER_CITY_MART", "MAP_CERULEAN_CITY_MART", "MAP_LAVENDER_TOWN_MART",
  "MAP_VERMILION_CITY_MART", "MAP_CELADON_CITY_DEPARTMENT_STORE_1F", "MAP_CELADON_CITY_DEPARTMENT_STORE_2F",
  "MAP_CELADON_CITY_DEPARTMENT_STORE_3F", "MAP_CELADON_CITY_DEPARTMENT_STORE_4F", "MAP_CELADON_CITY_DEPARTMENT_STORE_5F",
  "MAP_CELADON_CITY_DEPARTMENT_STORE_ROOF", "MAP_CELADON_CITY_DEPARTMENT_STORE_ELEVATOR", "MAP_FUCHSIA_CITY_MART",
  "MAP_CINNABAR_ISLAND_MART", "MAP_SAFFRON_CITY_MART", "MAP_THREE_ISLAND_MART", "MAP_FOUR_ISLAND_MART",
  "MAP_SEVEN_ISLAND_MART", "MAP_SIX_ISLAND_MART",
];
const GYM_MAPS = [
  "MAP_PEWTER_CITY_GYM", "MAP_CERULEAN_CITY_GYM", "MAP_VERMILION_CITY_GYM", "MAP_CELADON_CITY_GYM",
  "MAP_FUCHSIA_CITY_GYM", "MAP_SAFFRON_CITY_GYM", "MAP_CINNABAR_ISLAND_GYM", "MAP_VIRIDIAN_CITY_GYM",
];
const DUNGEON_MAP_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["MAP_VIRIDIAN_FOREST", 1], ["MAP_MT_MOON_1F", 3], ["MAP_ROCK_TUNNEL_1F", 2],
  ["MAP_DIGLETTS_CAVE_NORTH_ENTRANCE", 3], ["MAP_SEAFOAM_ISLANDS_1F", 5], ["MAP_VICTORY_ROAD_1F", 3],
  ["MAP_CERULEAN_CAVE_1F", 3], ["MAP_MT_EMBER_RUBY_PATH_B4F", 1], ["MAP_MT_EMBER_SUMMIT_PATH_1F", 3],
  ["MAP_MT_EMBER_RUBY_PATH_B5F", 7], ["MAP_THREE_ISLAND_BERRY_FOREST", 1], ["MAP_SIX_ISLAND_PATTERN_BUSH", 1],
  ["MAP_FIVE_ISLAND_LOST_CAVE_ENTRANCE", 15], ["MAP_FOUR_ISLAND_ICEFALL_CAVE_ENTRANCE", 4],
  ["MAP_SIX_ISLAND_ALTERING_CAVE", 1], ["MAP_SEVEN_ISLAND_TANOBY_RUINS_MONEAN_CHAMBER", 7],
];

function isMapInList(maps: readonly string[]): boolean {
  const current = (save.location.mapGroup << 8) | save.location.mapNum;
  return maps.some((name) => rom.c(name) === current);
}

function isDungeonMap(): boolean {
  return DUNGEON_MAP_RANGES.some(([name, count], index) => {
    const start = rom.c(name);
    return (index !== 15 || flagGet(C.FLAG_SYS_UNLOCKED_TANOBY_RUINS))
      && (start >>> 8) === save.location.mapGroup
      && save.location.mapNum >= (start & 0xff)
      && save.location.mapNum < (start & 0xff) + count;
  });
}

/** SetHelpContextForMap (help_system.c), using the active map header and source map lists. */
export function SetHelpContextForMap(ow: { player: { isSurfing(): boolean }; header: { mapType: number } }): void {
  HelpSystem_EnableToggleWithRButton();
  if (ow.player.isSurfing()) SetHelpContext(C.HELPCONTEXT_SURFING);
  else if (isDungeonMap()) SetHelpContext(C.HELPCONTEXT_DUNGEON);
  else if (ow.header.mapType === C.MAP_TYPE_INDOOR || ow.header.mapType === C.MAP_TYPE_SECRET_BASE) {
    const home1 = rom.c("MAP_PALLET_TOWN_PLAYERS_HOUSE_1F");
    const home2 = rom.c("MAP_PALLET_TOWN_PLAYERS_HOUSE_2F");
    const oakLab = rom.c("MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB");
    const current = (save.location.mapGroup << 8) | save.location.mapNum;
    if (current === home1 || current === home2) SetHelpContext(C.HELPCONTEXT_PLAYERS_HOUSE);
    else if (current === oakLab) SetHelpContext(C.HELPCONTEXT_OAKS_LAB);
    else if (IsCurMapPokeCenter()) SetHelpContext(C.HELPCONTEXT_POKECENTER);
    else if (isMapInList(MART_MAPS)) SetHelpContext(C.HELPCONTEXT_MART);
    else if (isMapInList(GYM_MAPS)) SetHelpContext(C.HELPCONTEXT_GYM);
    else SetHelpContext(C.HELPCONTEXT_INDOORS);
  } else SetHelpContext(C.HELPCONTEXT_OVERWORLD);
}
