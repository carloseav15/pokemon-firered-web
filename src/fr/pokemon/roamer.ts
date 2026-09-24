// roamer.c: the legendary beast (Raikou/Entei/Suicune by starter) that moves
// between Kanto routes each map load and can appear in 1/4 of land encounters.

import * as C from "../generated/constants";
import { random } from "../random";
import { rom } from "../rom";
import { save, varGet } from "../save";
import { calculateStats, createMon, type Pokemon } from "./pokemon";

const ROAMER_MAP_GROUP = 3;
type RoamerSave = { species: number; level: number; status: number; active: boolean; ivs: number[]; personality: number; hp: number };

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
  if (!sets) {
    sets = ROUTE_SETS.map((row) => {
      const nums = row.map((r) => rom.c(`MAP_${r}`) & 0xff);
      while (nums.length < NUM_LOCATIONS_PER_SET) nums.push(MAP_UNDEFINED_NUM());
      return nums;
    });
  }
  return sets;
}

/** sRoamerLocation and sLocationHistory are EWRAM (not saved) in the original. */
let location: [number, number] = [0, 0];
const history: Array<[number, number]> = [[0, 0], [0, 0], [0, 0]];

function roamer(): RoamerSave {
  const s = save as unknown as { roamer?: RoamerSave };
  if (!s.roamer || typeof s.roamer !== "object") s.roamer = { species: 0, level: 0, status: 0, active: false, ivs: [0, 0, 0, 0, 0, 0], personality: 0, hp: 0 };
  return s.roamer;
}

/** InitRoamer: ClearRoamerData + CreateInitialRoamerMon */
export function initRoamer(): void {
  const starter = [C.SPECIES_BULBASAUR, C.SPECIES_SQUIRTLE, C.SPECIES_CHARMANDER][varGet(C.VAR_STARTER_MON)] ?? C.SPECIES_BULBASAUR;
  const species = starter === C.SPECIES_BULBASAUR ? C.SPECIES_ENTEI : starter === C.SPECIES_CHARMANDER ? C.SPECIES_SUICUNE : C.SPECIES_RAIKOU;
  const mon = createMon(species, 50);
  Object.assign(roamer(), { species, level: 50, status: 0, active: true, ivs: [...mon.ivs], personality: mon.personality, hp: mon.stats[0] });
  for (const h of history) { h[0] = 0; h[1] = 0; }
  location = [ROAMER_MAP_GROUP, locationSets()[random() % locationSets().length][0]];
}

/** UpdateLocationHistoryForRoamer + RoamerMove (every camera transition/map load) */
export function onMapLoadForRoamer(): void {
  history[2] = [...history[1]] as [number, number];
  history[1] = [...history[0]] as [number, number];
  history[0] = [save.location.mapGroup, save.location.mapNum];
  if (random() % 16 === 0) { moveToOtherLocationSet(); return; }
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

function moveToOtherLocationSet(): void {
  if (!roamer().active) return;
  location[0] = ROAMER_MAP_GROUP;
  for (;;) {
    const mapNum = locationSets()[random() % locationSets().length][0];
    if (location[1] !== mapNum) { location[1] = mapNum; return; }
  }
}

/** TryStartRoamerEncounter: the roamer instance, or null. */
export function tryStartRoamerEncounter(): Pokemon | null {
  const r = roamer();
  if (!r.active || save.location.mapGroup !== location[0] || save.location.mapNum !== location[1] || random() % 4 !== 0) return null;
  const mon = createMon(r.species, r.level, { personality: r.personality });
  mon.ivs = [...r.ivs];
  calculateStats(mon); // CreateMonWithIVsPersonality recalculates stats from the stored IVs
  mon.status = r.status;
  mon.hp = r.hp;
  return mon;
}

export function roamerLevel(): number { return roamer().level; }

/** UpdateRoamerHPStatus + SetRoamerInactive (battle_main.c after a roamer battle) */
export function afterRoamerBattle(enemy: Pokemon | undefined, outcome: number): void {
  const r = roamer();
  if (enemy) { r.hp = enemy.hp; r.status = enemy.status; }
  moveToOtherLocationSet();
  if ((outcome & C.B_OUTCOME_WON) || outcome === C.B_OUTCOME_CAUGHT) r.active = false;
}

/** GetRoamerLocationMapSectionId (Pokédex area display) */
export function roamerMapSection(): number {
  if (!roamer().active) return C.MAPSEC_NONE;
  const id = rom.mapIdByNum((location[0] << 8) | location[1]);
  return id ? rom.c(rom.mapIndex.maps[id].section) : C.MAPSEC_NONE;
}
