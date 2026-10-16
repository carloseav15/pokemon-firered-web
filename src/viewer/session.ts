// Temporary, explicitly separate from the definitive new_game.c story opening.
// Uses the engine's live SaveBlock, Pokemon, bag and save serialization.
import { rom } from '@core/rom';
import { createMon } from '@core/pokemon/pokemon';
import { addBagItem } from '@core/pokemon/items';
import { encode } from '@core/gba/charmap';
import { InitPlayerTrainerId, SeedRngAndSetTrainerId } from '@core/random';
import { newSaveData, save, saveStore, setSave, setSaveStorageKey, flagGet, flagSet, type SaveData } from '@game/save';
import { HandleSetPokedexFlag } from '@core/pokemon/mon_extra';
import * as C from '@game/generated/constants';
import type { WarpAddress } from './navigation';
import type { Direction } from './render/sprites';

export const VIEWER_SAVE_KEY = 'firered-viewer-game-v1';
export type NavigationSave = { mapId: string; x: number; y: number; direction: Direction; dynamic: WarpAddress | null };
type ViewerSave = SaveData & { viewerNavigation?: NavigationSave; viewerStart?: 'temporary-kanto-v1' };
let initialized = false;
export async function initializeViewerSession(): Promise<void> {
  if (initialized) return;
  await rom.load();
  setSaveStorageKey(VIEWER_SAVE_KEY);
  const stored = saveStore.load() as ViewerSave | undefined;
  if (stored?.viewerStart === 'temporary-kanto-v1') setSave(stored);
  else {
    SeedRngAndSetTrainerId(Math.floor(Math.random() * 65536));
    setSave(newSaveData());
    save.trainerId = InitPlayerTrainerId();
    save.playerName = Array.from(encode('RED'));
    save.rivalName = Array.from(encode('GREEN'));
    const candidates = [C.SPECIES_BULBASAUR, C.SPECIES_CHARMANDER, C.SPECIES_SQUIRTLE, C.SPECIES_PIKACHU];
    save.party.push(createMon(candidates[Math.floor(Math.random() * candidates.length)]!, 5));
    if (!addBagItem(C.ITEM_POKE_BALL, 5)) throw Error('No se pudo preparar la mochila inicial');
    (save as ViewerSave).viewerStart = 'temporary-kanto-v1';
  }
  grantTemporaryPokedex();
  initialized = true;
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
export function saveViewerSession(nav: NavigationSave): boolean { syncViewerLocation(nav); return saveStore.write(); }
