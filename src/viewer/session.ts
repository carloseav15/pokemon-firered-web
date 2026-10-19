// Temporary, explicitly separate from the definitive new_game.c story opening.
// Uses the engine's live SaveBlock, Pokemon, bag and save serialization.
import { rom } from '@core/rom';
import { loadCData } from '@core/hw/assets';
import { restoreViewerEventMap } from './mapEvents';
import { onWarpForRoamer } from '@core/pokemon/roamer';
import { createMon } from '@core/pokemon/pokemon';
import { addBagItem } from '@core/pokemon/items';
import { encode } from '@core/gba/charmap';
import { InitPlayerTrainerId, SeedRngAndSetTrainerId } from '@core/random';
import { newSaveData, save, saveStore, setSave, setSaveStorageKey, flagGet, flagSet, PlayTimeCounter_Start, type SaveData } from '@game/save';
import { HandleSetPokedexFlag } from '@core/pokemon/mon_extra';
import { GetHealLocationIndexFromMapGroupAndNum, GetHealLocation } from '@core/field/overworld';
import * as C from '@game/generated/constants';
import type { WarpAddress } from './navigation';
import type { Direction } from './render/sprites';

export const VIEWER_SAVE_KEY = 'firered-viewer-game-v1';
export type NavigationSave = { mapId: string; x: number; y: number; direction: Direction; dynamic: WarpAddress | null };
export type ViewerSave = SaveData & { viewerNavigation?: NavigationSave; viewerStart?: 'temporary-kanto-v1' | 'definitive-kanto-v1' };
let initialized = false;

export function resetViewerSessionInitialized(): void {
  initialized = false;
}

/** new_game.c NewGameInitData for the viewer's live engine session. */
export function initDefinitiveViewerSession(initialFlags: Record<string, number>, gender: number = C.MALE): void {
  SeedRngAndSetTrainerId(Math.floor(Math.random() * 65536));
  const data = newSaveData();
  data.encryptionKey = 0;
  data.trainerId = InitPlayerTrainerId();
  data.playerGender = gender;
  data.playerName = Array.from(encode(gender === C.FEMALE ? 'LEAF' : 'RED'));
  data.rivalName = Array.from(encode('GREEN'));
  data.money = 3000;
  data.registeredItem = 0;
  data.party = [];
  data.bag.pokeBalls = [];
  data.pokedexCaught.fill(0);
  data.pokedexSeen.fill(0);
  setSave(data);
  for (const name of Object.keys(initialFlags)) flagSet(rom.c(name));
  seedTemporaryRespawn();
  (save as ViewerSave).viewerStart = 'definitive-kanto-v1';
  (save as ViewerSave).viewerNavigation = {
    mapId: 'MAP_PALLET_TOWN_PLAYERS_HOUSE_2F',
    x: 6,
    y: 6,
    direction: 'south',
    dynamic: null,
  };
  saveViewerSession((save as ViewerSave).viewerNavigation!);
}

export async function initializeViewerSession(
  initialFlags: Record<string, number>,
  options?: { forceTemporary?: boolean; forceDefinitive?: boolean; gender?: number }
): Promise<void> {
  if (initialized) return;
  // rom data, plus the map-entry bookkeeping tables mapEvents.ts runs before the engine loads.
  await Promise.all([rom.load(), loadCData('renewable_hidden_items', 'wild_encounter')]);
  // Prefer the main game save if available, so console mode and explore mode share the exact same playthrough.
  setSaveStorageKey("firered-save-v1");
  let stored = saveStore.load() as ViewerSave | undefined;
  if (!stored) {
    setSaveStorageKey(VIEWER_SAVE_KEY);
    stored = saveStore.load() as ViewerSave | undefined;
  }
  // Overworld_ResetStateOnContinue: the roamer's location is not saved; continuing places it again.
  if (stored && (stored.playerName?.length > 0 || stored.viewerStart === 'temporary-kanto-v1' || stored.viewerStart === 'definitive-kanto-v1')) {
    setSave(stored);
    onWarpForRoamer();
  } else if (options?.forceTemporary) {
    SeedRngAndSetTrainerId(Math.floor(Math.random() * 65536));
    setSave(newSaveData());
    // new_game.c:149 runs EventScript_ResetAllMapFlags. The world index exports
    // that source script's setflag names (values are source lines, not flag IDs).
    for (const name of Object.keys(initialFlags)) flagSet(rom.c(name));
    save.trainerId = InitPlayerTrainerId();
    save.playerGender = options.gender ?? C.MALE;
    save.playerName = Array.from(encode(save.playerGender === C.FEMALE ? 'LEAF' : 'RED'));
    save.rivalName = Array.from(encode('GREEN'));
    const candidates = [C.SPECIES_BULBASAUR, C.SPECIES_CHARMANDER, C.SPECIES_SQUIRTLE, C.SPECIES_PIKACHU];
    save.party.push(createMon(candidates[Math.floor(Math.random() * candidates.length)]!, 5));
    if (!addBagItem(C.ITEM_POKE_BALL, 5)) throw Error('No se pudo preparar la mochila inicial');
    (save as ViewerSave).viewerStart = 'temporary-kanto-v1';
    grantTemporaryPokedex();
  } else {
    initDefinitiveViewerSession(initialFlags, options?.gender ?? C.MALE);
  }
  restoreViewerEventMap((save as ViewerSave).viewerNavigation?.mapId ?? null);
  if ((save as ViewerSave).viewerStart === 'temporary-kanto-v1') {
    grantTemporaryPokedex();
  }
  seedTemporaryRespawn();
  // CB2_NewGame / CB2_ContinueSavedGame start the play time counter.
  PlayTimeCounter_Start();
  initialized = true;
}
// Temporary start only: new_game.c leaves Pallet Town as the white-out respawn
// until a Pokémon Center nurse script (setrespawn) changes it.
function seedTemporaryRespawn(): void {
  const last = save.lastHealLocation;
  if (GetHealLocationIndexFromMapGroupAndNum(last.mapGroup, last.mapNum) !== C.HEAL_LOCATION_NONE) return;
  const pallet = GetHealLocation(rom.c('HEAL_LOCATION_PALLET_TOWN'));
  if (pallet) save.lastHealLocation = { mapGroup: pallet.mapGroup, mapNum: pallet.mapNum, warpId: -1, x: pallet.x, y: pallet.y };
}
// Temporary start only: the Pokédex Oak hands over in the story, with the
// starter registered, so the start menu shows the source Pokédex entry.
function grantTemporaryPokedex(): void {
  if (flagGet(C.FLAG_SYS_POKEDEX_GET)) return;
  flagSet(C.FLAG_SYS_POKEMON_GET);
  flagSet(C.FLAG_SYS_POKEDEX_GET);
  const lead = save.party[0];
  if (lead) {
    HandleSetPokedexFlag(lead.species, C.FLAG_SET_SEEN, lead.personality);
    HandleSetPokedexFlag(lead.species, C.FLAG_SET_CAUGHT, lead.personality);
  }
}
export function viewerCheckpoint(): NavigationSave | undefined { return (save as ViewerSave).viewerNavigation; }
export function syncViewerLocation(nav: NavigationSave): void {
  const num = rom.mapNum(nav.mapId);
  save.location = { mapGroup: num >>> 8, mapNum: num & 255, warpId: -1, x: nav.x, y: nav.y };
  save.pos = { x: nav.x, y: nav.y };
  save.facing = { south: C.DIR_SOUTH, north: C.DIR_NORTH, west: C.DIR_WEST, east: C.DIR_EAST }[nav.direction];
  if (nav.dynamic) {
    const target=rom.mapNum(nav.dynamic.mapId);
    save.dynamicWarp={mapGroup:target>>>8,mapNum:target&255,warpId:nav.dynamic.warpId,x:nav.dynamic.x??-1,y:nav.dynamic.y??-1};
  }
  (save as ViewerSave).viewerNavigation = structuredClone(nav);
}
export function saveViewerSession(nav: NavigationSave): boolean {
  syncViewerLocation(nav);
  setSaveStorageKey("firered-save-v1");
  const ok = saveStore.write();
  setSaveStorageKey(VIEWER_SAVE_KEY);
  saveStore.write();
  return ok;
}
