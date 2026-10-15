// Progress model for the unified world (docs/MUNDO-UNIFICADO.md, phase 1).
//
// Three layers, one source of truth each:
//   regional     per source namespace (kanto=FireRed, johto=Heart & Soul, hoenn=Emerald). Each game's scripts
//                keep using their own flag/var IDs unchanged; IDs collide across games, so namespaces never mix.
//   derived      medals and field-move abilities are *computed* from regional flags, never copied, so they cannot
//                drift. Abilities are checked at the field-move layer, not by mirroring HM flags into other regions.
//   exploration  visited maps, fly points and unlocked inter-region links, keyed by region.
//
// No dependency on the game engine: IDs are injected through FlagIds so the model can be tested with real data.

export type Region = "kanto" | "johto" | "hoenn";
export const REGIONS: readonly Region[] = ["kanto", "johto", "hoenn"];
export const REGION_SOURCE: Record<Region, "firered" | "hns" | "emerald"> = { kanto: "firered", johto: "hns", hoenn: "emerald" };

export type Ability = "cut" | "fly" | "surf" | "strength" | "flash" | "rock_smash" | "waterfall" | "dive";
export const ABILITIES: readonly Ability[] = ["cut", "fly", "surf", "strength", "flash", "rock_smash", "waterfall", "dive"];

/** Symbolic name -> ID per region, as exported from each decomp. */
export type FlagIds = Record<Region, { flags: Record<string, number>; vars: Record<string, number> }>;

// Flag that records that the HM/ability was obtained, per region and ability. A missing entry means the game
// has no such event. FireRed's Waterfall is picked up from the floor: its object's hide flag is set afterwards.
export const ABILITY_FLAGS: Record<Region, Partial<Record<Ability, string>>> = {
  kanto: { cut: "FLAG_GOT_HM01", fly: "FLAG_GOT_HM02", surf: "FLAG_GOT_HM03", strength: "FLAG_GOT_HM04",
           flash: "FLAG_GOT_HM05", rock_smash: "FLAG_GOT_HM06", waterfall: "FLAG_HIDE_FOUR_ISLAND_ICEFALL_CAVE_1F_HM07" },
  johto: hmFlags(), hoenn: hmFlags(),
};
function hmFlags(): Partial<Record<Ability, string>> {
  const names: [Ability, string][] = [["cut", "CUT"], ["fly", "FLY"], ["surf", "SURF"], ["strength", "STRENGTH"],
    ["flash", "FLASH"], ["rock_smash", "ROCK_SMASH"], ["waterfall", "WATERFALL"], ["dive", "DIVE"]];
  return Object.fromEntries(names.map(([a, n]) => [a, `FLAG_RECEIVED_HM_${n}`]));
}

export const BADGES_PER_REGION = 8;
const badgeFlag = (n: number): string => `FLAG_BADGE0${n}_GET`;

// Ranges shared by the three decomps (include/constants/flags.h, vars.h).
const SPECIAL_FLAGS_START = 0x4000; // runtime-only flags: never persisted
const TEMP_FLAG_COUNT = 0x20; // flags 0x00..0x1F are cleared on every map load
const VARS_START = 0x4000;
const SPECIAL_VARS_START = 0x8000; // VAR_0x8000.. scratch variables: never persisted
const TEMP_VAR_COUNT = 0x10; // VAR_TEMP_0..F

export interface RegionScope {
  flagGet(id: number): boolean;
  flagSet(id: number): void;
  flagClear(id: number): void;
  varGet(id: number): number;
  varSet(id: number, value: number): void;
  /** Same cleanup the original does when a map loads. */
  clearTemp(): void;
}

interface Namespace { flags: Set<number>; vars: Map<number, number>; }

export interface SaveV1 {
  version: 1;
  startRegion: Region;
  regions: Record<Region, { flags: number[]; vars: Record<string, number> }>;
  visited: Record<Region, string[]>;
  flyPoints: Record<Region, string[]>;
  links: string[];
}

export class ProgressStore {
  private readonly ns: Record<Region, Namespace> = {
    kanto: { flags: new Set(), vars: new Map() }, johto: { flags: new Set(), vars: new Map() },
    hoenn: { flags: new Set(), vars: new Map() },
  };
  private readonly visitedMaps: Record<Region, Set<string>> = { kanto: new Set(), johto: new Set(), hoenn: new Set() };
  private readonly fly: Record<Region, Set<string>> = { kanto: new Set(), johto: new Set(), hoenn: new Set() };
  private readonly unlocked = new Set<string>();

  constructor(private readonly ids: FlagIds, public startRegion: Region = "kanto") {}

  scope(region: Region): RegionScope {
    const n = this.ns[region];
    return {
      flagGet: id => id !== 0 && n.flags.has(id),
      flagSet: id => { if (id !== 0) n.flags.add(id); },
      flagClear: id => { n.flags.delete(id); },
      varGet: id => n.vars.get(id) ?? 0,
      varSet: (id, value) => {
        const v = value & 0xffff;
        if (v === 0) n.vars.delete(id); else n.vars.set(id, v);
      },
      clearTemp: () => {
        for (let i = 1; i < TEMP_FLAG_COUNT; i++) n.flags.delete(i);
        for (let i = 0; i < TEMP_VAR_COUNT; i++) n.vars.delete(VARS_START + i);
      },
    };
  }

  /** Flag by symbolic name; throws if the region's decomp has no such flag (a typo must not read as "unset"). */
  flagId(region: Region, name: string): number {
    const id = this.ids[region].flags[name];
    if (id === undefined) throw new Error(`${REGION_SOURCE[region]} has no ${name}`);
    return id;
  }

  // --- derived layer ---------------------------------------------------------------------------------------------

  medals(region: Region): number {
    let count = 0;
    for (let n = 1; n <= BADGES_PER_REGION; n++) {
      if (this.ns[region].flags.has(this.flagId(region, badgeFlag(n)))) count++;
    }
    return count;
  }

  totalMedals(): number {
    return REGIONS.reduce((sum, r) => sum + this.medals(r), 0);
  }

  hasAbility(ability: Ability): boolean {
    return REGIONS.some(r => {
      const name = ABILITY_FLAGS[r][ability];
      if (!name) return false;
      const id = this.ids[r].flags[name];
      return id !== undefined && this.ns[r].flags.has(id);
    });
  }

  abilities(): Ability[] {
    return ABILITIES.filter(a => this.hasAbility(a));
  }

  // --- exploration layer -----------------------------------------------------------------------------------------

  visit(region: Region, mapId: string): void { this.visitedMaps[region].add(mapId); }
  hasVisited(region: Region, mapId: string): boolean { return this.visitedMaps[region].has(mapId); }
  addFlyPoint(region: Region, mapId: string): void { this.fly[region].add(mapId); }
  flyPoints(): { region: Region; mapId: string }[] {
    return REGIONS.flatMap(r => [...this.fly[r]].sort().map(mapId => ({ region: r, mapId })));
  }
  unlockLink(id: string): void { this.unlocked.add(id); }
  hasLink(id: string): boolean { return this.unlocked.has(id); }

  // --- persistence -----------------------------------------------------------------------------------------------

  serialize(): SaveV1 {
    const regions = {} as SaveV1["regions"];
    for (const r of REGIONS) {
      const vars: Record<string, number> = {};
      for (const [id, v] of [...this.ns[r].vars].sort((a, b) => a[0] - b[0])) {
        if (id >= VARS_START && id < SPECIAL_VARS_START) vars[String(id)] = v;
      }
      regions[r] = { flags: [...this.ns[r].flags].filter(id => id < SPECIAL_FLAGS_START).sort((a, b) => a - b), vars };
    }
    const sorted = (m: Record<Region, Set<string>>): Record<Region, string[]> =>
      ({ kanto: [...m.kanto].sort(), johto: [...m.johto].sort(), hoenn: [...m.hoenn].sort() });
    return { version: 1, startRegion: this.startRegion, regions, visited: sorted(this.visitedMaps),
             flyPoints: sorted(this.fly), links: [...this.unlocked].sort() };
  }

  static restore(save: SaveV1, ids: FlagIds): ProgressStore {
    if (save.version !== 1) throw new Error(`unsupported progress save version ${String(save.version)}`);
    const store = new ProgressStore(ids, save.startRegion);
    for (const r of REGIONS) {
      for (const id of save.regions[r].flags) store.ns[r].flags.add(id);
      for (const [id, v] of Object.entries(save.regions[r].vars)) store.ns[r].vars.set(Number(id), v);
      for (const m of save.visited[r]) store.visitedMaps[r].add(m);
      for (const m of save.flyPoints[r]) store.fly[r].add(m);
    }
    for (const l of save.links) store.unlocked.add(l);
    return store;
  }
}
