// Hoenn map entry: pokeemerald's map-load scripts run by the core script VM on the exported
// Emerald data (DATA_ROOT "/emerald"). Viewer adaptation of the event-data and map-script part of
// overworld.c LoadMapFromWarp + fieldmap.c InitMap; everything else in that sequence is listed below.
// The live save carries the Hoenn progress bank (regionSave.ts), so the VM's flag/var writes land
// there; the FireRed location/template fields this needs are restored after the run.
//
// Not run here (viewer handles or not yet bridged): CheckLeftFriendsSecretBase, TrySetMapSaveWarpStatus,
// ResetCyclingRoadChallengeData, RestartWildEncounterImmunitySteps, TryUpdateRandomTrainerRematches,
// DoTimeBasedEvents, SetSavedWeatherFromCurrMapHeader, ChooseAmbientCrySpecies, SetDefaultFlashLevel,
// Overworld_ClearSavedMusic, roamer updates, Battle Pyramid/Trainer Hill maps, TV screens and secret
// bases. ON_WARP_INTO_MAP_TABLE and ON_FRAME_TABLE matches are reported, not run: they need spawned
// object events and the message/movement UI, which the core cannot yet load from Emerald data.
import { Game } from '@game/game';
import { save } from '@game/save';
import { rom, type MapObjectTemplate } from '@core/rom';
import { MAP_OFFSET } from '@core/field/fieldmap';
import { isMapTypeOutdoors, MAP_SCRIPT_ON_FRAME_TABLE, MAP_SCRIPT_ON_LOAD, MAP_SCRIPT_ON_TRANSITION, MAP_SCRIPT_ON_WARP_INTO_MAP_TABLE } from '@core/field/overworld';
import * as EmSave from '../games/emerald/save';
import * as EM from '../games/emerald/generated/constants';
import { liveWorldRegion } from './regionSave';
import type { NavigationSave } from './session';

export type HoennMapEntryReport = {
  mapId: string;
  /** Labels of the ON_TRANSITION / ON_LOAD scripts that ran, if the map has them. */
  transition: string | null;
  load: string | null;
  /** Matching ON_WARP_INTO_MAP_TABLE / ON_FRAME_TABLE entries that were not run. */
  pendingWarpInto: string | null;
  pendingFrame: string | null;
  /** Object templates whose position or movement type the scripts changed. */
  changedTemplates: MapObjectTemplate[];
};

type Hooks = {
  /** A map script changed a metatile of the entered map (map-local coordinates). */
  onSetMetatile?: (mapId: string, x: number, y: number, metatile: number) => void;
};

const offscreenCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = 240; canvas.height = 160;
  return canvas;
};

/** SaveBlock1.flags/vars of Emerald's event_data.c are the Hoenn bank installed in the live save. */
function bindEmeraldEventData(): void {
  if (liveWorldRegion() !== 'hoenn') throw Error('Hoenn map entry while the Hoenn bank is not live');
  if (save.flags.length !== EM.NUM_FLAG_BYTES || save.vars.length !== EM.VARS_COUNT) throw Error('Live save does not hold an Emerald progress bank');
  const block = EmSave.newSaveData();
  block.flags = save.flags;
  block.vars = save.vars;
  EmSave.setSave(block);
}

const label = (ptr: number): string | null => ptr ? rom.labelAt(ptr) ?? `0x${ptr.toString(16)}` : null;

export class HoennMapEntry {
  private game?: Game;
  private loading?: Promise<void>;
  private running = false;
  constructor(private readonly hooks: Hooks = {}) {}

  private async initialize(): Promise<void> {
    await rom.load();
    this.game = new Game(offscreenCanvas());
  }

  /** Run the source map-load scripts for `nav.mapId`. Returns undefined while a previous entry runs. */
  async enterMap(nav: NavigationSave): Promise<HoennMapEntryReport | undefined> {
    if (this.running) return undefined;
    this.running = true;
    const kept = { location: save.location, pos: save.pos, mapLayoutId: save.mapLayoutId, templates: save.objectEventTemplates };
    try {
      await (this.loading ??= this.initialize());
      bindEmeraldEventData();
      const ow = this.game!.overworld;
      const num = rom.mapNum(nav.mapId);
      save.location = { mapGroup: num >>> 8, mapNum: num & 255, warpId: -1, x: nav.x, y: nav.y };
      save.pos = { x: nav.x, y: nav.y };
      // LoadCurrentMapData + LoadObjEventTemplatesFromHeader
      await ow.prepareViewerMapScripts(nav.mapId);
      const header = ow.header;
      // LoadMapFromWarp: ClearTempFieldEventData, FLAG_SYS_USE_FLASH, RunOnTransitionMapScript
      EmSave.ClearTempFieldEventData();
      if (isMapTypeOutdoors(header.mapType)) EmSave.FlagClear(EM.FLAG_SYS_USE_FLASH);
      const transition = label(ow.MapHeaderGetScriptTable(MAP_SCRIPT_ON_TRANSITION));
      ow.RunOnTransitionMapScript();
      // InitMap: InitMapLayoutData, then RunOnLoadMapScript (metatile changes go to the viewer).
      ow.map.InitMapLayoutData(ow.loaded);
      ow.map.onChange = (x, y) => this.hooks.onSetMetatile?.(header.id, x - MAP_OFFSET, y - MAP_OFFSET, ow.map.metatileIdAt(x, y));
      const load = label(ow.MapHeaderGetScriptTable(MAP_SCRIPT_ON_LOAD));
      ow.RunOnLoadMapScript();
      ow.map.onChange = undefined;
      const base = new Map(header.objects.filter((o): o is MapObjectTemplate => !o.clone).map(o => [o.localId, o]));
      const changedTemplates = ow.objects.templates.filter(t => {
        const b = base.get(t.localId);
        return !!b && (b.x !== t.x || b.y !== t.y || b.movementType !== t.movementType);
      }).map(t => ({ ...t }));
      return {
        mapId: header.id, transition, load, changedTemplates,
        pendingWarpInto: label(ow.MapHeaderCheckScriptTable(MAP_SCRIPT_ON_WARP_INTO_MAP_TABLE)),
        pendingFrame: label(ow.MapHeaderCheckScriptTable(MAP_SCRIPT_ON_FRAME_TABLE)),
      };
    } finally {
      save.location = kept.location;
      save.pos = kept.pos;
      save.mapLayoutId = kept.mapLayoutId;
      save.objectEventTemplates = kept.templates;
      this.running = false;
    }
  }
}
