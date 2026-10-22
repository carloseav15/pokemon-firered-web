// Hoenn map entry: pokeemerald's map-load scripts run by the core script VM on the exported
// Emerald data (DATA_ROOT "/emerald"). Viewer adaptation of the event-data and map-script part of
// overworld.c LoadMapFromWarp + fieldmap.c InitMap; everything else in that sequence is listed below.
// The live save carries the Hoenn progress bank and the Hoenn field fields (regionSave.ts), so the
// VM's flag/var writes and the location it reads are Hoenn's own.
//
// Not run here (viewer handles or not yet bridged): CheckLeftFriendsSecretBase, TrySetMapSaveWarpStatus
// (the viewer saves its own position), TryUpdateRandomTrainerRematches (needs five badges: IsRematchStepCounterMaxed,
// and the step counter is not incremented either), UpdatePerDay (the rest of DoTimeBasedEvents, see
// games/emerald/clock.ts), ChooseAmbientCrySpecies (the viewer's audio controller picks its own ambient cry),
// UpdateLocationHistoryForRoamer / RoamerMoveToOtherLocationSet (Emerald's roamer.c is not ported), Battle
// Pyramid/Trainer Hill maps, UpdateTVScreensOnMap and InitSecretBaseAppearance (tv.c / secret_base.c). RestartWildEncounterImmunitySteps is the caller's (EngineInteraction.enterMap). The
// ON_WARP_INTO_MAP_TABLE / ON_FRAME_TABLE scripts run afterwards, once the map's object events exist
// (EngineInteraction.enterMap).
import type { Game } from '@game/game';
import { save } from '@game/save';
import { rom, type MapObjectTemplate } from '@core/rom';
import { loadCData } from '@core/hw/assets';
import { MAP_OFFSET } from '@core/field/fieldmap';
import { dummyWarp, isMapTypeOutdoors, MAP_SCRIPT_ON_LOAD, MAP_SCRIPT_ON_RESUME, MAP_SCRIPT_ON_TRANSITION } from '@core/field/overworld';
import { ResetCyclingRoadChallengeData } from '../games/emerald/cyclingRoad';
import { ClearBerryTrees } from '../games/emerald/berry';
import { DoTimeBasedEvents } from '../games/emerald/clock';
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
  /** CB2_ContinueSavedGame keeps saved templates and skips warp-only temp resets/ON_TRANSITION. */
  continuing?: boolean;
  /** overworld.c SKIP_OBJECT_EVENT_LOAD: warp keeps modified templates, but still resets TEMP/runs ON_TRANSITION. */
  preservedTemplates?: MapObjectTemplate[];
  /** The caller already set gLastUsedWarp (the Mossdeep warp applies its own ApplyCurrentWarp). */
  keepLastUsedWarp?: boolean;
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

/** field_screen_effect.c gMaxFlashLevel: ARRAY_COUNT(sFlashLevelToRadius) - 1 with the nine Emerald radii { 200, 72, 64, 56, 48, 40, 32, 24, 0 }. */
const gMaxFlashLevel = 8;

/** overworld.c SetDefaultFlashLevel (Emerald: gMapHeader.cave is the map.json `requires_flash`; the flash starts one level
 * below gMaxFlashLevel, or at level 1 once FLAG_SYS_USE_FLASH is set). SaveBlock1.flashLevel and the engine's own copy. */
function SetDefaultFlashLevel(ow: Game['overworld']): void {
  let flashLevel: number;
  if (!ow.header.requiresFlash) flashLevel = 0;
  else if (EmSave.FlagGet(EM.FLAG_SYS_USE_FLASH)) flashLevel = 1;
  else flashLevel = gMaxFlashLevel - 1;
  save.flashLevel = flashLevel;
  ow.flashLevel = flashLevel;
}

/**
 * LoadMapFromWarp's event-data steps and InitMap's ON_LOAD for `nav.mapId` on Emerald data.
 * Continue follows CB2_ContinueSavedGame instead: keep templates/TEMP data and run ON_LOAD,
 * without warp-only ON_TRANSITION. Leaves the templates (with the scripts' changes) loaded.
 */
export async function runEmeraldMapEntry(game: Game, nav: NavigationSave, hooks: HoennMapEntryHooks = {}): Promise<HoennMapEntryReport> {
  bindEmeraldEventData();
  const ow = game.overworld;
  // Keep template movementType independent of the live object's movementType: the rotating
  // puzzle changes the former while its held face action changes only the live facing.
  const savedTemplates = hooks.continuing ? save.objectEventTemplates : hooks.preservedTemplates;
  if (hooks.continuing && rom.mapNum(nav.mapId) !== ((save.location.mapGroup << 8) | save.location.mapNum))
    throw Error('Continue map does not match the saved Hoenn location');
  // ApplyCurrentWarp: gLastUsedWarp is the location being left; Continue starts from a cleared one.
  if (hooks.continuing) ow.lastUsedWarp = dummyWarp();
  else if (!hooks.keepLastUsedWarp) ow.lastUsedWarp = { ...save.location };
  syncViewerLocation(nav);
  // LoadCurrentMapData + LoadObjEventTemplatesFromHeader
  await ow.prepareViewerMapScripts(nav.mapId, savedTemplates);
  const header = ow.header;
  // A bank without berry trees is new: NewGameInitData's `call EventScript_ResetAllBerries` (the flag half of
  // EventScript_ResetAllMapFlags is initializeHoennSessionFlags in main.ts).
  if (!save.berryTrees) {
    await loadCData('berry'); // gBerries: GetBerryInfo's table (the engine preloads it, headless callers do not)
    ClearBerryTrees();
    ow.script.RunScriptImmediately(rom.label('EventScript_ResetAllBerries'));
  }
  // LoadMapFromWarp: ClearTempFieldEventData, FLAG_SYS_USE_FLASH, RunOnTransitionMapScript
  const transition = hooks.continuing ? null : scriptLabel(ow.MapHeaderGetScriptTable(MAP_SCRIPT_ON_TRANSITION));
  // UpdateMiscOverworldStates (Continue) / LoadMapFromWarp: ResetCyclingRoadChallengeData; the saved
  // music is cleared before ON_TRANSITION (savebgm) and restored from the save on Continue.
  ResetCyclingRoadChallengeData();
  DoTimeBasedEvents();
  if (hooks.continuing) ow.savedMusic = save.savedMusic ?? 0;
  else {
    EmSave.ClearTempFieldEventData();
    game.weather.SetSavedWeatherFromCurrMapHeader(header.weather);
    if (isMapTypeOutdoors(header.mapType)) EmSave.FlagClear(EM.FLAG_SYS_USE_FLASH);
    SetDefaultFlashLevel(ow);
    ow.Overworld_ClearSavedMusic();
    ow.RunOnTransitionMapScript();
  }
  // InitMap: InitMapLayoutData, then RunOnLoadMapScript (metatile changes go to the viewer).
  ow.map.InitMapLayoutData(ow.loaded);
  // The engine's own handler (EngineInteraction.initialize) reports later setmetatile calls: restore it.
  const engineOnChange = ow.map.onChange;
  ow.map.onChange = (x, y) => hooks.onSetMetatile?.(header.id, x - MAP_OFFSET, y - MAP_OFFSET, ow.map.metatileIdAt(x, y));
  const load = scriptLabel(ow.MapHeaderGetScriptTable(MAP_SCRIPT_ON_LOAD));
  try { ow.RunOnLoadMapScript(); } finally { ow.map.onChange = engineOnChange; }
  // ResumeMap: ON_RESUME (Route 110's UpdateCyclingRoadState). ADAPTATION: CableClub_OnResume only runs
  // `special InitUnionRoom`, the wireless Union Room task, which belongs to the link scope excluded
  // from the single-player goal (AGENTS.md, 2026-09-27); Pokémon Centers must still be enterable.
  if (scriptLabel(ow.MapHeaderGetScriptTable(MAP_SCRIPT_ON_RESUME)) !== 'CableClub_OnResume') ow.RunOnResumeMapScript();
  save.savedMusic = ow.savedMusic;
  const base = new Map(header.objects.filter((o): o is MapObjectTemplate => !o.clone).map(o => [o.localId, o]));
  const changedTemplates = ow.objects.templates.filter(t => {
    const b = base.get(t.localId);
    return !!b && (b.x !== t.x || b.y !== t.y || b.movementType !== t.movementType);
  }).map(t => ({ ...t }));
  return { mapId: header.id, transition, load, changedTemplates };
}
