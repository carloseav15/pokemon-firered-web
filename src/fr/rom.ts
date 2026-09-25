// Loads the data exported from pokefirered by tools/decomp/export.py.
// Everything the engine needs from the original game lives here: the
// assembled event script bytecode, constants, maps, tilesets, object
// graphics and the battle/pokemon tables.

export const ROM_BASE = 0x08000000;
export const EXTERN_BASE = 0x0f000000;
export const DATA_ROOT = "/fr";

export type MapObjectTemplate = {
  localId: number;
  graphicsId: number;
  graphicsName: string;
  x: number;
  y: number;
  elevation: number;
  movementType: number;
  rangeX: number;
  rangeY: number;
  trainerType: number;
  trainerRange: number;
  script: number;
  scriptName: string | null;
  flag: number;
  clone?: false;
};

export type CloneTemplate = { clone: true; graphicsId: number; x: number; y: number; targetLocalId: number; targetMap: string };

export type MapWarp = { x: number; y: number; elevation: number; destMap: string; destWarpId: number };
export type MapCoordEvent = { x: number; y: number; elevation: number; var: number; value: number; script: number; scriptName: string };
export type MapBgEvent =
  | { type: "sign"; x: number; y: number; elevation: number; facing: number; script: number; scriptName: string }
  | { type: "hidden_item"; x: number; y: number; elevation: number; item: number; flag: number; quantity: number; underfoot: boolean };
export type MapConnection = { direction: "up" | "down" | "left" | "right" | "dive" | "emerge"; offset: number; map: string };

export type MapHeader = {
  id: string;
  num: number;
  name: string;
  layout: string;
  music: number;
  musicName: string;
  regionMapSection: number;
  regionMapSectionName: string;
  requiresFlash: boolean;
  weather: number;
  mapType: number;
  allowCycling: boolean;
  allowEscaping: boolean;
  allowRunning: boolean;
  showMapName: boolean;
  floorNumber: number;
  battleScene: number;
  mapScripts: number;
  connections: MapConnection[];
  objects: Array<MapObjectTemplate | CloneTemplate>;
  warps: MapWarp[];
  coords: MapCoordEvent[];
  bgs: MapBgEvent[];
};

export type LayoutData = {
  id: string;
  width: number;
  height: number;
  borderWidth: number;
  borderHeight: number;
  primary: string;
  secondary: string;
  blocks: Uint16Array;
  border: Uint16Array;
};

export type TilesetData = {
  name: string;
  isSecondary: boolean;
  callback: string | null;
  tiles: Uint8Array; // 4bpp packed, 32 bytes per tile
  palettes: number[][][]; // 16 palettes of 16 [r,g,b]
  metatiles: Uint16Array; // 8 tile entries per metatile
  attributes: Uint32Array;
  anims: Record<string, Uint8Array[]>;
};

export type AnimCmd = ["F", number, number, number, number] | ["J", number] | ["L", number] | ["E"];

export type ObjectGfxInfo = {
  name: string;
  width: number;
  height: number;
  paletteTag: string;
  paletteSlot: string;
  shadowSize: string;
  inanimate: boolean;
  tracks: string;
  anims: string;
  frames: Array<[string, number]>;
};

export type SpeciesInfo = {
  name: string; // base64 GBA string
  base: number[];
  types: number[];
  catchRate: number;
  expYield: number;
  evYield: number[];
  items: number[];
  genderRatio: number;
  eggCycles: number;
  friendship: number;
  growthRate: number;
  eggGroups: number[];
  abilities: number[];
  safariFlee: number;
  color: number;
  noFlip: number;
  learnset: Array<[number, number]>;
  evolutions: Array<[number, number, number]>;
  tmhm: [number, number];
  tutor: number;
  national: number;
  frontCoords: [number, number];
  backCoords: [number, number];
  elevation: number;
};

export type MoveInfo = {
  name: string;
  effect: number;
  power: number;
  type: number;
  accuracy: number;
  pp: number;
  chance: number;
  target: number;
  priority: number;
  flags: number;
  description: string;
};

export type ItemInfo = {
  id: number;
  const: string;
  name: string;
  price: number;
  holdEffect: number;
  holdEffectParam: number;
  description: string;
  importance: number;
  registrability: number;
  pocket: number;
  type: number | string;
  fieldUseFunc: string;
  battleUsage: number;
  battleUseFunc: string;
  secondaryId: number;
};

export type TrainerMon = { iv: number; level: number; species: number; item?: number; moves?: number[] };
export type TrainerInfo = { class: number; music: number; female: number; pic: number; name: string; items: number[]; double: number; ai: number; party: TrainerMon[] };

export type WildMons = { rate: number; mons: Array<[number, number, number]> };
export type WildHeader = { land_mons?: WildMons; water_mons?: WildMons; rock_smash_mons?: WildMons; fishing_mons?: WildMons };

export function b64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function json<T>(path: string): Promise<T> {
  const response = await fetch(`${DATA_ROOT}/${path}`);
  if (!response.ok) throw new Error(`missing data ${path} — run: python3 tools/decomp/export.py`);
  return response.json() as Promise<T>;
}

async function binary(path: string): Promise<Uint8Array> {
  const response = await fetch(`${DATA_ROOT}/${path}`);
  if (!response.ok) throw new Error(`missing data ${path}`);
  return new Uint8Array(await response.arrayBuffer());
}

type ScriptsMeta = { base: number; externBase: number; labels: Record<string, number>; externals: string[]; commands: string[]; specials: string[]; std: number[] };

export class Rom {
  constants!: Record<string, number>;
  private reverse = new Map<string, Map<number, string>>();
  scripts!: Uint8Array;
  scriptMeta!: ScriptsMeta;
  private labelByAddress = new Map<number, string>();
  mapIndex!: { groups: string[][]; maps: Record<string, { num: number; name: string; layout: string; section: string }>; layouts: Record<string, number> };
  private mapById = new Map<number, string>();
  private maps = new Map<string, MapHeader>();
  private layouts = new Map<string, LayoutData>();
  private layoutIdByIndex = new Map<number, string>();
  private tilesets = new Map<string, TilesetData>();
  objects!: { gfx: Record<string, ObjectGfxInfo>; animTables: Record<string, Array<string | null>>; anims: Record<string, AnimCmd[]> };
  species!: SpeciesInfo[];
  pokedex!: Array<{ category: string; height: number; weight: number; description: string }>;
  expTables!: number[][];
  tutorMoves!: number[];
  eggMoves!: number[];
  hmMoves!: number[];
  tmhmMoves!: number[];
  scriptMenu!: { multichoice: Record<string, string[]>; stdStrings: string[]; textColors: number[] };
  statStageRatios!: Array<[number, number]>;
  moves!: MoveInfo[];
  abilities!: Array<{ name: string; description: string }>;
  natures!: string[];
  trainerClasses!: string[];
  typeNames!: string[];
  typeEffectiveness!: number[];
  trainerMoney!: Array<[number, number]>;
  trainers!: TrainerInfo[];
  items!: ItemInfo[];
  itemEffects!: Array<number[] | null>;
  wild!: { rates: Record<string, number[]>; maps: Record<string, WildHeader> };
  healLocations!: { heal_locations: Array<{ id: string; map: string; x: number; y: number; respawn_map?: string; respawn_npc?: string }> };
  regionMap!: Array<{ id: string; name: string; x: number; y: number; width: number; height: number }>;
  strings!: Record<string, string>;
  battleStrings!: { start: number; table: Array<string | { label: string }> };
  gfx!: { pokemon: Record<string, string> };
  fonts!: Record<string, { width: number; height: number; pixels: string; widths?: number[]; palette?: number[][] }>;
  windows!: Record<string, { width: number; height: number; pixels: string; palette: number[][] }> & { stdpal: number[][][] };
  doors!: Record<string, { width: number; height: number; pixels: string }>;
  charmap!: { chars: Record<string, number> };

  private loading?: Promise<void>;

  /** Loads everything once; later calls (startup, then the game) share the same promise. */
  load(progress?: (label: string) => void): Promise<void> {
    this.loading ??= this.loadAll(progress);
    return this.loading;
  }

  private async loadAll(progress?: (label: string) => void): Promise<void> {
    progress?.("constants");
    this.constants = await json("constants.json");
    progress?.("scripts");
    [this.scripts, this.scriptMeta] = await Promise.all([binary("scripts.bin"), json<ScriptsMeta>("scripts.json")]);
    for (const [name, offset] of Object.entries(this.scriptMeta.labels)) {
      if (!this.labelByAddress.has(ROM_BASE + offset)) this.labelByAddress.set(ROM_BASE + offset, name);
    }
    progress?.("maps");
    this.mapIndex = await json("maps.json");
    for (const [id, entry] of Object.entries(this.mapIndex.maps)) this.mapById.set(entry.num, id);
    for (const [layoutId, index] of Object.entries(this.mapIndex.layouts)) this.layoutIdByIndex.set(index, layoutId);
    progress?.("graphics");
    [this.objects, this.gfx, this.fonts, this.windows, this.doors] = await Promise.all([
      json<Rom["objects"]>("objects.json"),
      json<Rom["gfx"]>("gfx.json"),
      json<Rom["fonts"]>("gfx/fonts.json"),
      json<Rom["windows"]>("gfx/windows.json"),
      json<Rom["doors"]>("gfx/doors.json"),
    ]);
    progress?.("pokemon data");
    const [species, moves, trainers, items, wild, heal, region, strings, battleStrings] = await Promise.all([
      json<{ species: SpeciesInfo[]; pokedex: Rom["pokedex"]; exp: number[][]; tutorMoves: number[]; eggMoves: number[]; hmMoves: number[]; statStageRatios: Array<[number, number]> }>("data/species.json"),
      json<{ moves: MoveInfo[]; abilities: Rom["abilities"]; natures: string[]; trainerClasses: string[]; types: string[]; typeEffectiveness: number[]; trainerMoney: Array<[number, number]> }>("data/moves.json"),
      json<TrainerInfo[]>("data/trainers.json"),
      json<{ items: ItemInfo[]; effects: Array<number[] | null> }>("data/items.json"),
      json<Rom["wild"]>("data/wild.json"),
      json<Rom["healLocations"]>("data/heal_locations.json"),
      json<Rom["regionMap"]>("data/region_map.json"),
      json<Record<string, string>>("data/strings.json"),
      json<Rom["battleStrings"]>("data/battle_strings.json"),
    ]);
    this.species = species.species;
    this.pokedex = species.pokedex;
    this.expTables = species.exp;
    this.tutorMoves = species.tutorMoves;
    this.eggMoves = species.eggMoves;
    this.hmMoves = species.hmMoves;
    this.tmhmMoves = (species as { tmhmMoves?: number[] }).tmhmMoves ?? [];
    this.statStageRatios = species.statStageRatios;
    this.moves = moves.moves;
    this.abilities = moves.abilities;
    this.natures = moves.natures;
    this.trainerClasses = moves.trainerClasses;
    this.typeNames = moves.types;
    this.typeEffectiveness = moves.typeEffectiveness;
    this.trainerMoney = moves.trainerMoney;
    this.trainers = trainers;
    this.items = items.items;
    this.itemEffects = items.effects;
    this.wild = wild;
    this.healLocations = heal;
    this.regionMap = region;
    this.strings = strings;
    this.battleStrings = battleStrings;
    this.charmap = await json("charmap.json");
    this.scriptMenu = await json("data/script_menu.json");
  }

  /** Header of a map that has already been fetched (synchronous). */
  cachedMap(id: string): MapHeader | undefined {
    return this.maps.get(id);
  }

  c(name: string): number {
    const value = this.constants[name];
    if (value === undefined) throw new Error(`unknown constant ${name}`);
    return value;
  }

  /** Name of a constant value within a prefix, e.g. nameOf("SPECIES_", 1). */
  nameOf(prefix: string, value: number): string | undefined {
    let table = this.reverse.get(prefix);
    if (!table) {
      table = new Map();
      for (const [name, v] of Object.entries(this.constants)) {
        if (name.startsWith(prefix) && !table.has(v)) table.set(v, name);
      }
      this.reverse.set(prefix, table);
    }
    return table.get(value);
  }

  label(name: string): number {
    const offset = this.scriptMeta.labels[name];
    if (offset === undefined) throw new Error(`unknown script label ${name}`);
    return ROM_BASE + offset;
  }

  hasLabel(name: string): boolean {
    return name in this.scriptMeta.labels;
  }

  labelAt(address: number): string | undefined {
    return this.labelByAddress.get(address);
  }

  /** Byte view of a script-blob pointer (texts, movement scripts, mart lists). */
  u8(address: number): number {
    return this.scripts[address - ROM_BASE] ?? 0xff;
  }

  u16(address: number): number {
    const o = address - ROM_BASE;
    return this.scripts[o] | (this.scripts[o + 1] << 8);
  }

  u32(address: number): number {
    const o = address - ROM_BASE;
    return (this.scripts[o] | (this.scripts[o + 1] << 8) | (this.scripts[o + 2] << 16) | (this.scripts[o + 3] << 24)) >>> 0;
  }

  /** Copies a 0xFF-terminated string from the script blob. */
  stringAt(address: number): Uint8Array {
    const start = address - ROM_BASE;
    let end = start;
    while (end < this.scripts.length && this.scripts[end] !== 0xff) end++;
    return this.scripts.slice(start, end + 1);
  }

  /** gMoveNames[move] */
  moveName(move: number): Uint8Array {
    return b64(this.moves[move]?.name ?? "/w==");
  }

  /** GetMapName for a region map section (gRegionMapEntries / sMapNames). */
  regionMapName(section: number): Uint8Array {
    const entry = this.regionMap[section];
    return entry ? b64(entry.name) : Uint8Array.from([0xff]);
  }

  text(name: string): Uint8Array {
    const value = this.strings[name];
    if (value) return b64(value);
    if (this.hasLabel(name)) return this.stringAt(this.label(name));
    throw new Error(`unknown text ${name}`);
  }

  mapIdByNum(num: number): string | undefined {
    return this.mapById.get(num);
  }

  mapNum(id: string): number {
    return this.mapIndex.maps[id]?.num ?? this.c(id);
  }

  async loadMap(id: string): Promise<MapHeader> {
    let map = this.maps.get(id);
    if (!map) {
      map = await json<MapHeader>(`maps/${id}.json`);
      this.maps.set(id, map);
      // Warp destinations are needed synchronously (dynamic warps, connections).
      for (const warp of map.warps) if (warp.destMap.startsWith("MAP_") && warp.destMap !== "MAP_DYNAMIC" && !this.maps.has(warp.destMap)) void json<MapHeader>(`maps/${warp.destMap}.json`).then((m) => this.maps.set(warp.destMap, m)).catch(() => {});
    }
    return map;
  }

  /** A layout already fetched (SetCurrentMapLayout runs synchronously in map scripts). */
  cachedLayout(id: string): LayoutData | undefined {
    return this.layouts.get(id);
  }

  async loadLayout(id: string): Promise<LayoutData> {
    let layout = this.layouts.get(id);
    if (!layout) {
      const raw = await json<{ id: string; width: number; height: number; borderWidth: number; borderHeight: number; primary: string; secondary: string; blocks: string; border: string }>(`layouts/${id}.json`);
      const blocks = b64(raw.blocks);
      const border = b64(raw.border);
      layout = {
        ...raw,
        blocks: new Uint16Array(blocks.buffer, blocks.byteOffset, blocks.byteLength / 2),
        border: new Uint16Array(border.buffer, border.byteOffset, border.byteLength / 2),
      };
      this.layouts.set(id, layout);
    }
    return layout;
  }

  layoutIdByIndex_(index: number): string | undefined {
    return this.layoutIdByIndex.get(index);
  }

  cachedTileset(name: string): TilesetData | undefined {
    return this.tilesets.get(name);
  }

  async loadTileset(name: string): Promise<TilesetData> {
    let tileset = this.tilesets.get(name);
    if (!tileset) {
      const raw = await json<{ name: string; isSecondary: boolean; callback: string | null; tiles: string; palettes: number[][][]; metatiles: string; attributes: string; anims: Record<string, string[]> }>(`tilesets/${name}.json`);
      const metatiles = b64(raw.metatiles);
      const attributes = b64(raw.attributes);
      const anims: Record<string, Uint8Array[]> = {};
      for (const [group, frames] of Object.entries(raw.anims)) anims[group] = frames.map(b64);
      tileset = {
        name: raw.name,
        isSecondary: raw.isSecondary,
        callback: raw.callback,
        tiles: b64(raw.tiles),
        palettes: raw.palettes,
        metatiles: new Uint16Array(metatiles.buffer, metatiles.byteOffset, metatiles.byteLength / 2),
        attributes: new Uint32Array(attributes.buffer.slice(attributes.byteOffset, attributes.byteOffset + attributes.byteLength)),
        anims,
      };
      this.tilesets.set(name, tileset);
    }
    return tileset;
  }
}

export const rom = new Rom();
