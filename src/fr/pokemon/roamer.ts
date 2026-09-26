// roamer.c: roaming legendary storage, route movement, and encounter creation.

import * as C from "../generated/constants";
import { random } from "../random";
import { rom } from "../rom";
import { save, varGet } from "../save";
import { calculateStats, createMon, type Pokemon } from "./pokemon";

const ROAMER_MAP_GROUP = 3;
type RoamerSave = {
  species: number; level: number; status: number; active: boolean; ivs: number[]; personality: number; hp: number;
  cool: number; beauty: number; cute: number; smart: number; tough: number;
};

const ROUTE_SETS: string[][] = [
  ["ROUTE1", "ROUTE2", "ROUTE21_NORTH", "ROUTE22"], ["ROUTE2", "ROUTE1", "ROUTE3", "ROUTE22"], ["ROUTE3", "ROUTE2", "ROUTE4"],
  ["ROUTE4", "ROUTE3", "ROUTE5", "ROUTE9", "ROUTE24"], ["ROUTE5", "ROUTE4", "ROUTE6", "ROUTE7", "ROUTE8", "ROUTE9", "ROUTE24"],
  ["ROUTE6", "ROUTE5", "ROUTE7", "ROUTE8", "ROUTE11"], ["ROUTE7", "ROUTE5", "ROUTE6", "ROUTE8", "ROUTE16"],
  ["ROUTE8", "ROUTE5", "ROUTE6", "ROUTE7", "ROUTE10", "ROUTE12"], ["ROUTE9", "ROUTE4", "ROUTE5", "ROUTE10", "ROUTE24"],
  ["ROUTE10", "ROUTE8", "ROUTE9", "ROUTE12"], ["ROUTE11", "ROUTE6", "ROUTE12"], ["ROUTE12", "ROUTE10", "ROUTE11", "ROUTE13"],
  ["ROUTE13", "ROUTE12", "ROUTE14"], ["ROUTE14", "ROUTE13", "ROUTE15"], ["ROUTE15", "ROUTE14", "ROUTE18", "ROUTE19"],
  ["ROUTE16", "ROUTE7", "ROUTE17"], ["ROUTE17", "ROUTE16", "ROUTE18"], ["ROUTE18", "ROUTE15", "ROUTE17", "ROUTE19"],
  ["ROUTE19", "ROUTE15", "ROUTE18", "ROUTE20"], ["ROUTE20", "ROUTE19", "ROUTE21_NORTH"], ["ROUTE21_NORTH", "ROUTE1", "ROUTE20"],
  ["ROUTE22", "ROUTE1", "ROUTE2", "ROUTE23"], ["ROUTE23", "ROUTE22", "ROUTE2"], ["ROUTE24", "ROUTE4", "ROUTE5", "ROUTE9"],
  ["ROUTE25", "ROUTE24", "ROUTE9"],
];
const NUM_LOCATIONS_PER_SET = 7;
const MAP_UNDEFINED_NUM = (): number => rom.c("MAP_UNDEFINED") & 0xff;

let sets: number[][] | undefined;
function locationSets(): number[][] {
  if (!sets) sets = ROUTE_SETS.map((row) => {
    const nums = row.map((r) => rom.c(`MAP_${r}`) & 0xff);
    while (nums.length < NUM_LOCATIONS_PER_SET) nums.push(MAP_UNDEFINED_NUM());
    return nums;
  });
  return sets;
}

/** sRoamerLocation and sLocationHistory are EWRAM (not saved) in the original. */
let location: [number, number] = [0, 0];
const history: Array<[number, number]> = [[0, 0], [0, 0], [0, 0]];

function roamer(): RoamerSave {
  const s = save as unknown as { roamer?: RoamerSave };
  if (!s.roamer || typeof s.roamer !== "object") s.roamer = {
    species: 0, level: 0, status: 0, active: false, ivs: [0, 0, 0, 0, 0, 0], personality: 0, hp: 0,
    cool: 0, beauty: 0, cute: 0, smart: 0, tough: 0,
  };
  return s.roamer;
}

export function ClearRoamerData(): void {
  Object.assign(roamer(), {
    species: 0, level: 0, status: 0, active: false, ivs: [0, 0, 0, 0, 0, 0], personality: 0, hp: 0,
    cool: 0, beauty: 0, cute: 0, smart: 0, tough: 0,
  });
  location = [0, 0];
  for (const h of history) { h[0] = 0; h[1] = 0; }
}

function GetRoamerSpecies(): number {
  const starter = [C.SPECIES_BULBASAUR, C.SPECIES_SQUIRTLE, C.SPECIES_CHARMANDER][varGet(C.VAR_STARTER_MON)];
  if (starter === C.SPECIES_BULBASAUR) return C.SPECIES_ENTEI;
  if (starter === C.SPECIES_CHARMANDER) return C.SPECIES_SUICUNE;
  return C.SPECIES_RAIKOU;
}

export function CreateInitialRoamerMon(): void {
  const mon = createMon(GetRoamerSpecies(), 50);
  const r = roamer();
  Object.assign(r, {
    species: mon.species, level: 50, status: 0, active: true, ivs: [...mon.ivs], personality: mon.personality,
    hp: mon.stats[0], cool: mon.contest?.[0] ?? 0, beauty: mon.contest?.[1] ?? 0,
    cute: mon.contest?.[2] ?? 0, smart: mon.contest?.[3] ?? 0, tough: mon.contest?.[4] ?? 0,
  });
  location = [ROAMER_MAP_GROUP, locationSets()[random() % locationSets().length][0]];
}

export function InitRoamer(): void { ClearRoamerData(); CreateInitialRoamerMon(); }
export const initRoamer = InitRoamer;

export function UpdateLocationHistoryForRoamer(): void {
  history[2] = [...history[1]] as [number, number];
  history[1] = [...history[0]] as [number, number];
  history[0] = [save.location.mapGroup, save.location.mapNum];
}

export function RoamerMoveToOtherLocationSet(): void {
  if (!roamer().active) return;
  location[0] = ROAMER_MAP_GROUP;
  for (;;) {
    const mapNum = locationSets()[random() % locationSets().length][0];
    if (location[1] !== mapNum) { location[1] = mapNum; return; }
  }
}

export function RoamerMove(): void {
  if (random() % 16 === 0) { RoamerMoveToOtherLocationSet(); return; }
  if (!roamer().active) return;
  for (const set of locationSets()) {
    if (location[1] !== set[0]) continue;
    for (;;) {
      const mapNum = set[(random() % (NUM_LOCATIONS_PER_SET - 1)) + 1];
      if (!(history[2][0] === ROAMER_MAP_GROUP && history[2][1] === mapNum) && mapNum !== MAP_UNDEFINED_NUM()) {
        location[1] = mapNum;
        return;
      }
    }
  }
}

/** LoadMapFromWarp and Overworld_ResetStateOnContinue. */
export function onWarpForRoamer(): void { UpdateLocationHistoryForRoamer(); RoamerMoveToOtherLocationSet(); }

/** LoadMapFromCameraTransition. */
export function onCameraTransitionForRoamer(): void { UpdateLocationHistoryForRoamer(); RoamerMove(); }

export function IsRoamerAt(mapGroup: number, mapNum: number): boolean {
  return roamer().active && mapGroup === location[0] && mapNum === location[1];
}

export function CreateRoamerMonInstance(): Pokemon {
  const r = roamer();
  const mon = createMon(r.species, r.level, { personality: r.personality });
  mon.ivs = [...r.ivs];
  calculateStats(mon);
  mon.status = r.status;
  mon.hp = r.hp;
  mon.contest = [r.cool, r.beauty, r.cute, r.smart, r.tough, 0];
  return mon;
}

export function TryStartRoamerEncounter(): Pokemon | null {
  if (IsRoamerAt(save.location.mapGroup, save.location.mapNum) && random() % 4 === 0) return CreateRoamerMonInstance();
  return null;
}
export const tryStartRoamerEncounter = TryStartRoamerEncounter;
export function roamerLevel(): number { return roamer().level; }

export function UpdateRoamerHPStatus(mon: Pokemon): void {
  const r = roamer();
  r.hp = mon.hp;
  r.status = mon.status;
  RoamerMoveToOtherLocationSet();
}

export function SetRoamerInactive(): void { roamer().active = false; }

export function afterRoamerBattle(mon: Pokemon | undefined, outcome: number): void {
  if (mon) UpdateRoamerHPStatus(mon);
  if (outcome === C.B_OUTCOME_WON || outcome === C.B_OUTCOME_CAUGHT || outcome === C.B_OUTCOME_DREW) SetRoamerInactive();
}

export function GetRoamerLocation(): [number, number] { return [...location]; }

export function GetRoamerLocationMapSectionId(): number {
  if (!roamer().active) return C.MAPSEC_NONE;
  const id = rom.mapIdByNum((location[0] << 8) | location[1]);
  return id ? rom.c(rom.mapIndex.maps[id].section) : C.MAPSEC_NONE;
}
export const roamerMapSection = GetRoamerLocationMapSectionId;
