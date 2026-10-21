// Hoenn map entry: pokeemerald's map-load scripts run by the core script VM on the exported
// Emerald data (DATA_ROOT "/emerald"). Viewer adaptation of the event-data and map-script part of
// overworld.c LoadMapFromWarp + fieldmap.c InitMap; everything else in that sequence is listed below.
// The live save carries the Hoenn progress bank and the Hoenn field fields (regionSave.ts), so the
// VM's flag/var writes and the location it reads are Hoenn's own.
//
// Not run here (viewer handles or not yet bridged): CheckLeftFriendsSecretBase, TrySetMapSaveWarpStatus,
// ResetCyclingRoadChallengeData, TryUpdateRandomTrainerRematches, DoTimeBasedEvents,
// SetSavedWeatherFromCurrMapHeader, ChooseAmbientCrySpecies, SetDefaultFlashLevel,
// Overworld_ClearSavedMusic, roamer updates, Battle Pyramid/Trainer Hill maps, TV screens and secret
// bases. RestartWildEncounterImmunitySteps is the caller's (EngineInteraction.enterMap). The
// ON_WARP_INTO_MAP_TABLE / ON_FRAME_TABLE scripts run afterwards, once the map's object events exist
// (EngineInteraction.enterMap).
import type { Game } from '@game/game';
import { save } from '@game/save';
import { rom, type MapObjectTemplate } from '@core/rom';
import { MAP_OFFSET } from '@core/field/fieldmap';
import { isMapTypeOutdoors, MAP_SCRIPT_ON_LOAD, MAP_SCRIPT_ON_TRANSITION } from '@core/field/overworld';
import * as EmSave from '../games/emerald/save';
import * as EM from '../games/emerald/generated/constants';
import { liveWorldRegion } from './regionSave';
import { syncViewerLocation, type NavigationSave } from './session';

export type HoennMapEntryReport = {
  mapId: string;
  /** Labels of the ON_TRANSITION / ON_LOAD scripts that ran, if the map has them. */
  transition: string | null;
  load: string | null;
  /** Object templates whose position or movement type the scripts changed. */
  changedTemplates: MapObjectTemplate[];
};

export type HoennMapEntryHooks = {
  /** A map script changed a metatile of the entered map (map-local coordinates). */
  onSetMetatile?: (mapId: string, x: number, y: number, metatile: number) => void;
};

/** SaveBlock1.flags/vars of Emerald's event_data.c are the Hoenn bank installed in the live save. */
export function bindEmeraldEventData(): void {
  if (liveWorldRegion() !== 'hoenn') throw Error('Emerald event data while the Hoenn bank is not live');
  if (save.flags.length !== EM.NUM_FLAG_BYTES || save.vars.length !== EM.VARS_COUNT) throw Error('Live save does not hold an Emerald progress bank');
  const block = EmSave.newSaveData();
  block.flags = save.flags;
  block.vars = save.vars;
  EmSave.setSave(block);
}

export const scriptLabel = (ptr: number): string | null => ptr ? rom.labelAt(ptr) ?? `0x${ptr.toString(16)}` : null;

/**
 * LoadMapFromWarp's event-data steps and InitMap's ON_LOAD for `nav.mapId` on `game`, which must
 * be running Emerald data. Leaves the map's object templates (with the scripts' changes) loaded.
 */
export async function runEmeraldMapEntry(game: Game, nav: NavigationSave, hooks: HoennMapEntryHooks = {}): Promise<HoennMapEntryReport> {
  bindEmeraldEventData();
  const ow = game.overworld;
  syncViewerLocation(nav);
  // LoadCurrentMapData + LoadObjEventTemplatesFromHeader
  await ow.prepareViewerMapScripts(nav.mapId);
  const header = ow.header;
  // LoadMapFromWarp: ClearTempFieldEventData, FLAG_SYS_USE_FLASH, RunOnTransitionMapScript
  EmSave.ClearTempFieldEventData();
  if (isMapTypeOutdoors(header.mapType)) EmSave.FlagClear(EM.FLAG_SYS_USE_FLASH);
  const transition = scriptLabel(ow.MapHeaderGetScriptTable(MAP_SCRIPT_ON_TRANSITION));
  ow.RunOnTransitionMapScript();
  // InitMap: InitMapLayoutData, then RunOnLoadMapScript (metatile changes go to the viewer).
  ow.map.InitMapLayoutData(ow.loaded);
  ow.map.onChange = (x, y) => hooks.onSetMetatile?.(header.id, x - MAP_OFFSET, y - MAP_OFFSET, ow.map.metatileIdAt(x, y));
  const load = scriptLabel(ow.MapHeaderGetScriptTable(MAP_SCRIPT_ON_LOAD));
  try { ow.RunOnLoadMapScript(); } finally { ow.map.onChange = undefined; }
  const base = new Map(header.objects.filter((o): o is MapObjectTemplate => !o.clone).map(o => [o.localId, o]));
  const changedTemplates = ow.objects.templates.filter(t => {
    const b = base.get(t.localId);
    return !!b && (b.x !== t.x || b.y !== t.y || b.movementType !== t.movementType);
  }).map(t => ({ ...t }));
  return { mapId: header.id, transition, load, changedTemplates };
}
