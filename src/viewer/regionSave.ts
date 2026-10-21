// Regional save contract for the unified Kanto/Hoenn world (viewer adaptation, not a C port).
// Stored layout (WORLD_SAVE_VERSION 2): the top-level SaveData stays the canonical FireRed
// SaveBlock: global trainer data (party, money, bag, PC, Pokédex, play time) plus Kanto
// progress (flags, vars, viewerNavigation, viewerObjects). Every other region keeps its own
// progress bank in `world.regions`, indexed with its source game's IDs. While a non-Kanto
// region is live, its bank is installed in the live save so flagGet/flagSet/varGet use that
// game's IDs, and the Kanto fields are parked; serialization always restores the canonical form.
import { newSaveData, save, saveStore, setSave, setSaveStorageKey, type SaveData } from '@game/save';
import { FLAGS_COUNT as EM_FLAGS_COUNT, VARS_END as EM_VARS_END, VARS_START as EM_VARS_START } from '../games/emerald/generated/constants';
import * as C from '@game/generated/constants';
import type { NavigationSave } from './session';

export type RegionId = 'kanto' | 'hoenn';
export type BankedRegionId = Exclude<RegionId, 'kanto'>;
/** Source game whose flag/var IDs index each region's progress. */
export const REGION_GAME = { kanto: 'firered', hoenn: 'emerald' } as const;
export const WORLD_SAVE_VERSION = 2;
export const WORLD_SAVE_KEY = 'firered-save-v1';
export const VIEWER_SAVE_KEY = 'firered-viewer-game-v1';

export type RegionalNavigation = NavigationSave & { region: RegionId };
type ViewerObjectsSnapshot = { version: 1 | 2; mapId: string; states: unknown[] };
/**
 * SaveBlock1/2 fields whose values are map numbers, map-local positions or map-bound state: they are
 * the region's own while it is live (its game's map numbering) and are banked with its progress.
 */
export const REGIONAL_FIELD_KEYS = [
  'location', 'pos', 'mapLayoutId', 'continueGameWarp', 'dynamicWarp', 'lastHealLocation', 'escapeWarp',
  'objectEventTemplates', 'objectEvents', 'objectEventsVersion', 'weather', 'weatherCycleStage', 'savedMusic',
  'facing', 'playerAvatarFlags', 'mapView', 'trainerRematchStepCounter', 'trainerRematches',
] as const satisfies readonly (keyof SaveData)[];
export type RegionalField = Partial<Pick<SaveData, (typeof REGIONAL_FIELD_KEYS)[number]>>;

export type RegionProgress = {
  game: (typeof REGION_GAME)[BankedRegionId];
  flags: number[];
  vars: number[];
  viewerNavigation: RegionalNavigation | null;
  viewerObjects: ViewerObjectsSnapshot | null;
  /** The region's REGIONAL_FIELD_KEYS values; null until the region is first saved (absent in older v2 saves). */
  field?: RegionalField | null;
};
export type WorldSave = {
  version: typeof WORLD_SAVE_VERSION;
  /** Region of the most recent save; the next continue belongs there. */
  activeRegion: RegionId;
  /** Regions whose new-game initialization has run for this trainer. */
  started: Record<RegionId, boolean>;
  regions: Partial<Record<BankedRegionId, RegionProgress>>;
  /** Viewer-only named session flags (ViewerState.eventFlags), per region. */
  sessionFlags: Partial<Record<RegionId, string[]>>;
  /** Present when a v1 save needed repair; records what was moved and what could not be split. */
  migration?: { from: 1; note: string };
};
export type WorldSaveData = SaveData & {
  viewerNavigation?: NavigationSave;
  viewerObjects?: ViewerObjectsSnapshot;
  viewerStart?: 'temporary-kanto-v1' | 'definitive-kanto-v1';
  world?: WorldSave;
};

const REGION_SIZES: Record<BankedRegionId, { flagBytes: number; vars: number }> = {
  hoenn: { flagBytes: EM_FLAGS_COUNT / 8, vars: EM_VARS_END - EM_VARS_START + 1 },
};

export function newRegionProgress(region: BankedRegionId): RegionProgress {
  const size = REGION_SIZES[region];
  return { game: REGION_GAME[region], flags: new Array(size.flagBytes).fill(0), vars: new Array(size.vars).fill(0), viewerNavigation: null, viewerObjects: null, field: null };
}

const takeField = (data: SaveData): RegionalField => {
  const out: Record<string, unknown> = {};
  for (const key of REGIONAL_FIELD_KEYS) if (data[key] !== undefined) out[key] = structuredClone(data[key]);
  return out as RegionalField;
};
/** Install field values. A bank's missing keys take the zeroed SaveBlock values (ClearSav1); `exact`
 * restores a parked snapshot as it was, absent keys included. */
const putField = (data: SaveData, field: RegionalField | null | undefined, exact = false): void => {
  const fresh = newSaveData() as Record<string, unknown>, target = data as Record<string, unknown>;
  for (const key of REGIONAL_FIELD_KEYS) {
    const value = exact ? field?.[key] : field?.[key] ?? fresh[key];
    if (value === undefined) delete target[key]; else target[key] = structuredClone(value);
  }
};

function newWorld(): WorldSave {
  return { version: WORLD_SAVE_VERSION, activeRegion: 'kanto', started: { kanto: false, hoenn: false }, regions: {}, sessionFlags: {} };
}

const byteArray = (v: unknown, length: number): v is number[] =>
  Array.isArray(v) && v.length === length && v.every(b => Number.isInteger(b) && b >= 0 && b <= 0xffff);

function validProgress(region: BankedRegionId, bank: unknown): bank is RegionProgress {
  if (!bank || typeof bank !== 'object') return false;
  const b = bank as RegionProgress, size = REGION_SIZES[region];
  return b.game === REGION_GAME[region] && byteArray(b.flags, size.flagBytes) && byteArray(b.vars, size.vars)
    && (b.viewerNavigation === null || (typeof b.viewerNavigation === 'object' && b.viewerNavigation.region === region && typeof b.viewerNavigation.mapId === 'string'))
    && (b.viewerObjects === null || typeof b.viewerObjects === 'object')
    && (b.field === undefined || b.field === null || typeof b.field === 'object');
}

/** FireRed map IDs come from the generated FireRed constants; Emerald-only maps are absent. */
export const isFireRedMap = (mapId: string): boolean => typeof (C as Record<string, unknown>)[mapId] === 'number' && mapId.startsWith('MAP_');

/** Pre-world (v1) Kanto acceptance rule from initializeViewerSession. */
const legacyKantoStarted = (d: WorldSaveData): boolean =>
  (d.playerName?.length ?? 0) > 0 || d.viewerStart === 'temporary-kanto-v1' || d.viewerStart === 'definitive-kanto-v1';

/**
 * Upgrade a stored save to WORLD_SAVE_VERSION. A v1 save is Kanto-only by construction,
 * except that the Hoenn viewer could overwrite it with its own navigation; such navigation
 * (a map that is not a FireRed map) is moved to the Hoenn bank instead of being continued in Kanto.
 */
export function migrateWorldSave(data: WorldSaveData, isKantoMap: (mapId: string) => boolean = isFireRedMap): WorldSaveData {
  const world = data.world;
  if (world && world.version === WORLD_SAVE_VERSION) {
    world.started = { kanto: !!world.started?.kanto, hoenn: !!world.started?.hoenn };
    world.activeRegion = world.activeRegion === 'hoenn' ? 'hoenn' : 'kanto';
    world.regions ??= {};
    world.sessionFlags ??= {};
    if (data.viewerNavigation && data.viewerNavigation.region !== undefined && data.viewerNavigation.region !== 'kanto')
      throw Error('Saved Kanto navigation belongs to another region');
    return data;
  }
  const next = newWorld();
  const nav = data.viewerNavigation;
  const foreignNav = !!nav && !isKantoMap(nav.mapId);
  if (foreignNav) {
    const bank = newRegionProgress('hoenn');
    bank.viewerNavigation = { ...nav!, region: 'hoenn' };
    if (data.viewerObjects && !isKantoMap(data.viewerObjects.mapId)) { bank.viewerObjects = data.viewerObjects; delete data.viewerObjects; }
    // A save with no Kanto start marker was written by a Hoenn session alone: its flags/vars are Emerald IDs.
    const hoennOnly = data.viewerStart === undefined;
    if (hoennOnly) {
      bank.flags = data.flags.slice(0, bank.flags.length).concat(new Array(Math.max(0, bank.flags.length - data.flags.length)).fill(0));
      bank.vars = data.vars.slice(0, bank.vars.length);
      const fresh = newSaveData();
      data.flags = fresh.flags;
      data.vars = fresh.vars;
    }
    next.regions.hoenn = bank;
    next.started.hoenn = true;
    next.migration = { from: 1, note: hoennOnly
      ? 'Hoenn-only v1 save: navigation, flags and vars moved to the Hoenn bank'
      : 'Hoenn navigation moved to the Hoenn bank; Kanto flags kept as stored (mixed IDs cannot be separated)' };
    delete data.viewerNavigation;
    next.started.kanto = !hoennOnly && legacyKantoStarted(data);
  } else {
    next.started.kanto = legacyKantoStarted(data);
  }
  if (data.viewerNavigation) data.viewerNavigation = { ...data.viewerNavigation, region: 'kanto' } as NavigationSave;
  data.world = next;
  return data;
}

/** Read the shared world save (main key, then the viewer key) and migrate it. */
export function loadWorldSave(isKantoMap: (mapId: string) => boolean = isFireRedMap): WorldSaveData | undefined {
  setSaveStorageKey(WORLD_SAVE_KEY);
  let stored = saveStore.load() as WorldSaveData | undefined;
  if (!stored) {
    setSaveStorageKey(VIEWER_SAVE_KEY);
    stored = saveStore.load() as WorldSaveData | undefined;
  }
  setSaveStorageKey(VIEWER_SAVE_KEY);
  return stored ? migrateWorldSave(stored, isKantoMap) : undefined;
}

// Live-region bookkeeping: which progress is installed in `save`, and the parked Kanto fields.
let liveRegion: RegionId = 'kanto';
let parkedKanto: Pick<WorldSaveData, 'flags' | 'vars' | 'viewerNavigation' | 'viewerObjects'> & { field: RegionalField } | null = null;

export function liveWorldRegion(): RegionId { return liveRegion; }

export function worldOf(data: WorldSaveData = save as WorldSaveData): WorldSave {
  return data.world ??= newWorld();
}

/** Mark Kanto live on the current `save` (after setSave of a stored or new Kanto game). */
export function enterKanto(): void {
  if (liveRegion !== 'kanto') throw Error('Kanto entry while another region is live');
  worldOf();
}

/**
 * Install `region`'s progress bank into the live save. Returns true when the bank was
 * created here, so the caller runs that region's new-game flag initialization.
 */
export function enterBankedRegion(region: BankedRegionId): boolean {
  if (liveRegion !== 'kanto') throw Error(`${liveRegion} is already live`);
  const data = save as WorldSaveData, world = worldOf(data);
  const created = !world.regions[region];
  if (!created && !validProgress(region, world.regions[region])) throw Error(`Saved ${region} progress is corrupted`);
  const bank = world.regions[region] ?? newRegionProgress(region);
  delete world.regions[region];
  parkedKanto = { flags: data.flags, vars: data.vars, viewerNavigation: data.viewerNavigation, viewerObjects: data.viewerObjects, field: takeField(data) };
  putField(data, bank.field);
  data.flags = bank.flags.slice();
  data.vars = bank.vars.slice();
  if (bank.viewerNavigation) data.viewerNavigation = structuredClone(bank.viewerNavigation); else delete data.viewerNavigation;
  if (bank.viewerObjects) data.viewerObjects = structuredClone(bank.viewerObjects); else delete data.viewerObjects;
  liveRegion = region;
  world.started[region] = true;
  return created;
}

/** The canonical stored form of the live save (Kanto progress at top level). */
export function serializeWorldSave(data: WorldSaveData = save as WorldSaveData): WorldSaveData {
  const world = structuredClone(worldOf(data));
  world.activeRegion = liveRegion;
  if (liveRegion === 'kanto') {
    world.started.kanto = true;
    return { ...data, world };
  }
  const bank = newRegionProgress(liveRegion);
  bank.flags = data.flags.slice();
  bank.vars = data.vars.slice();
  bank.viewerNavigation = data.viewerNavigation ? { ...data.viewerNavigation, region: liveRegion } : null;
  bank.viewerObjects = data.viewerObjects ? structuredClone(data.viewerObjects) : null;
  bank.field = takeField(data);
  world.regions[liveRegion] = bank;
  const out: WorldSaveData = { ...data, flags: parkedKanto!.flags, vars: parkedKanto!.vars, world };
  putField(out, parkedKanto!.field, true);
  if (parkedKanto!.viewerNavigation) out.viewerNavigation = parkedKanto!.viewerNavigation; else delete out.viewerNavigation;
  if (parkedKanto!.viewerObjects) out.viewerObjects = parkedKanto!.viewerObjects; else delete out.viewerObjects;
  return out;
}

/** Write the canonical world save to both browser keys. */
export function writeWorldSave(): boolean {
  const stored = serializeWorldSave();
  setSaveStorageKey(WORLD_SAVE_KEY);
  const ok = saveStore.write(stored);
  setSaveStorageKey(VIEWER_SAVE_KEY);
  saveStore.write(stored);
  return ok;
}

export function regionSessionFlags(region: RegionId): string[] {
  return [...(worldOf().sessionFlags[region] ?? [])];
}
export function setRegionSessionFlags(region: RegionId, names: Iterable<string>): void {
  worldOf().sessionFlags[region] = [...new Set(names)].sort();
}

/** Discard live-region state (tests and full reloads only). */
export function resetWorldRegion(): void {
  liveRegion = 'kanto';
  parkedKanto = null;
}

/** Reload the stored world into `save` (continue): Kanto progress live, banks parked. */
export function reloadWorldSave(isKantoMap: (mapId: string) => boolean = isFireRedMap): WorldSaveData | undefined {
  const stored = loadWorldSave(isKantoMap);
  if (!stored) return undefined;
  resetWorldRegion();
  setSave(stored);
  return stored;
}
