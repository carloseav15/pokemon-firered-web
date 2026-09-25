// struct Pokemon and the pokemon.c helpers the field and battle code use.

import { EOS, length } from "../gba/charmap";
import { random, random32 } from "../random";
import { b64, rom } from "../rom";
import { sendMonToPC } from "./storage";
import { save } from "../save";
import type { MailMessage } from "./mail";

export const MAX_LEVEL = 100;
export const PARTY_SIZE = 6;
export const STAT_HP = 0, STAT_ATK = 1, STAT_DEF = 2, STAT_SPEED = 3, STAT_SPATK = 4, STAT_SPDEF = 5;
export const MON_MALE = 0x00, MON_FEMALE = 0xfe, MON_GENDERLESS = 0xff;
export const MON_ALREADY_KNOWS_MOVE = 0xfffe;
export const MON_HAS_MAX_MOVES = 0xffff;

export type Pokemon = {
  species: number;
  nickname: number[];
  personality: number;
  otId: number;
  otName: number[];
  otGender: number;
  level: number;
  exp: number;
  ivs: number[];
  evs: number[];
  moves: number[];
  pp: number[];
  ppBonuses: number;
  hp: number;
  stats: number[]; // [maxHP, atk, def, speed, spatk, spdef]
  status: number;
  heldItem: number;
  friendship: number;
  abilityNum: number;
  metLevel: number;
  metLocation: number;
  pokeball: number;
  isEgg: boolean;
  pokerus: number;
  markings: number;
  contest?: number[]; // cool, beauty, cute, smart, tough, sheen (pokemon.c contest stats)
  mailMessage?: MailMessage; // held-mail words + author (mail.c struct Mail)
  modernFatefulEncounter?: boolean;
  mail?: number;
};

const NATURE_STAT_TABLE: number[][] = [];
for (let n = 0; n < 25; n++) {
  const row = [0, 0, 0, 0, 0];
  const up = Math.floor(n / 5);
  const down = n % 5;
  if (up !== down) { row[up] = 1; row[down] = -1; }
  NATURE_STAT_TABLE.push(row);
}

export function speciesName(species: number): Uint8Array {
  return b64(rom.species[species]?.name ?? rom.species[0].name);
}

export function nature(mon: Pokemon): number {
  return (mon.personality >>> 0) % 25;
}

export function genderFromPersonality(species: number, personality: number): number {
  const ratio = rom.species[species].genderRatio;
  if (ratio === MON_MALE || ratio === MON_FEMALE || ratio === MON_GENDERLESS) return ratio;
  return ratio > (personality & 0xff) ? MON_FEMALE : MON_MALE;
}

export function gender(mon: Pokemon): number {
  return genderFromPersonality(mon.species, mon.personality);
}

export function isShiny(mon: Pokemon): boolean {
  const value = ((mon.otId >>> 16) ^ (mon.otId & 0xffff) ^ (mon.personality >>> 16) ^ (mon.personality & 0xffff)) >>> 0;
  return value < 8;
}

export function ability(mon: Pokemon): number {
  const abilities = rom.species[mon.species].abilities;
  return mon.abilityNum && abilities[1] ? abilities[1] : abilities[0];
}

export function expForLevel(species: number, level: number): number {
  return rom.expTables[rom.species[species].growthRate][level];
}

export function levelFromExp(species: number, exp: number): number {
  const table = rom.expTables[rom.species[species].growthRate];
  let level = 1;
  while (level <= MAX_LEVEL && table[level] <= exp) level++;
  return level - 1;
}

function modifyStatByNature(n: number, value: number, statIndex: number): number {
  if (statIndex <= STAT_HP || statIndex > 5) return value;
  const effect = NATURE_STAT_TABLE[n][statIndex - 1];
  if (effect === 1) return Math.floor((value * 110) / 100) & 0xffff;
  if (effect === -1) return Math.floor((value * 90) / 100) & 0xffff;
  return value;
}

export function calculateStats(mon: Pokemon): void {
  const info = rom.species[mon.species];
  const oldMaxHP = mon.stats[0] ?? 0;
  const level = levelFromExp(mon.species, mon.exp);
  mon.level = level;
  let newMaxHP: number;
  if (mon.species === rom.constants.SPECIES_SHEDINJA) newMaxHP = 1;
  else {
    const n = 2 * info.base[0] + mon.ivs[0];
    newMaxHP = Math.floor(((n + Math.floor(mon.evs[0] / 4)) * level) / 100) + level + 10;
  }
  const stats = [newMaxHP];
  const n = nature(mon);
  for (let i = 1; i < 6; i++) {
    const value = Math.floor(((2 * info.base[i] + mon.ivs[i] + Math.floor(mon.evs[i] / 4)) * level) / 100) + 5;
    stats.push(modifyStatByNature(n, value, i));
  }
  mon.stats = stats;
  if (mon.species === rom.constants.SPECIES_SHEDINJA) {
    if (mon.hp !== 0 || oldMaxHP === 0) mon.hp = 1;
    return;
  }
  if (mon.hp === 0 && oldMaxHP === 0) mon.hp = newMaxHP;
  else if (mon.hp !== 0) mon.hp = Math.max(1, mon.hp + newMaxHP - oldMaxHP);
}

export function giveMove(mon: Pokemon, move: number): number {
  for (let i = 0; i < 4; i++) {
    if (!mon.moves[i]) {
      mon.moves[i] = move;
      mon.pp[i] = rom.moves[move].pp;
      return move;
    }
    if (mon.moves[i] === move) return MON_ALREADY_KNOWS_MOVE;
  }
  return MON_HAS_MAX_MOVES;
}

export function deleteFirstMoveAndGive(mon: Pokemon, move: number): void {
  mon.moves = [...mon.moves.slice(1, 4), move];
  mon.pp = [...mon.pp.slice(1, 4), rom.moves[move].pp];
  mon.ppBonuses = (mon.ppBonuses >> 2) & 0x3f;
}

export function setMoveSlot(mon: Pokemon, move: number, slot: number): void {
  mon.moves[slot] = move;
  mon.pp[slot] = rom.moves[move].pp;
}

export function giveInitialMoveset(mon: Pokemon): void {
  const level = levelFromExp(mon.species, mon.exp);
  for (const [moveLevel, move] of rom.species[mon.species].learnset) {
    if (moveLevel > level) break;
    if (giveMove(mon, move) === MON_HAS_MAX_MOVES) deleteFirstMoveAndGive(mon, move);
  }
}

export type CreateOptions = {
  fixedIV?: number; // 0..31, or undefined for random
  personality?: number;
  otId?: number;
  noShiny?: boolean;
  metLocation?: number;
};

/** CreateMon + CalculateMonStats + GiveMonInitialMoveset. */
export function createMon(species: number, level: number, options: CreateOptions = {}): Pokemon {
  const personality = options.personality ?? random32();
  let otId = options.otId ?? save.trainerId;
  if (options.noShiny) {
    do otId = random32();
    while ((((otId >>> 16) ^ (otId & 0xffff) ^ (personality >>> 16) ^ (personality & 0xffff)) >>> 0) < 8);
  }
  let ivs: number[];
  if (options.fixedIV !== undefined && options.fixedIV < 32) ivs = new Array(6).fill(options.fixedIV);
  else {
    const a = random();
    const b = random();
    ivs = [a & 31, (a >> 5) & 31, (a >> 10) & 31, b & 31, (b >> 5) & 31, (b >> 10) & 31];
  }
  const info = rom.species[species];
  const name = Array.from(speciesName(species));
  const mon: Pokemon = {
    species,
    nickname: name,
    personality,
    otId,
    otName: [...save.playerName],
    otGender: save.playerGender,
    level,
    exp: expForLevel(species, level),
    ivs,
    evs: [0, 0, 0, 0, 0, 0],
    moves: [0, 0, 0, 0],
    pp: [0, 0, 0, 0],
    ppBonuses: 0,
    hp: 0,
    stats: [0, 0, 0, 0, 0, 0],
    status: 0,
    heldItem: 0,
    friendship: info.friendship,
    abilityNum: info.abilities[1] ? personality & 1 : 0,
    metLevel: level,
    metLocation: options.metLocation ?? 0,
    pokeball: rom.constants.ITEM_POKE_BALL ?? 4,
    isEgg: false,
    pokerus: 0,
    markings: 0,
  };
  calculateStats(mon);
  mon.hp = mon.stats[0];
  giveInitialMoveset(mon);
  return mon;
}

/** CreateMaleMon: preset random OT ID and reroll personality until male. */
export function createMaleMon(species: number, level: number): Pokemon {
  let otId: number;
  let personality: number;
  do {
    otId = random32();
    personality = random32();
  } while (genderFromPersonality(species, personality) !== MON_MALE);
  return createMon(species, level, { otId, personality });
}

export function nickname(mon: Pokemon): Uint8Array {
  return Uint8Array.from(mon.nickname.slice(0, length(mon.nickname)).concat([EOS]));
}

export function healMon(mon: Pokemon): void {
  mon.hp = mon.stats[0];
  mon.status = 0;
  for (let i = 0; i < 4; i++) if (mon.moves[i]) mon.pp[i] = calculatePPWithBonus(mon.moves[i], mon.ppBonuses, i);
}

export function calculatePPWithBonus(move: number, ppBonuses: number, slot: number): number {
  const basePP = rom.moves[move].pp;
  return basePP + Math.floor((basePP * 20 * ((ppBonuses >> (2 * slot)) & 3)) / 100);
}

export function knowsMove(mon: Pokemon, move: number): boolean {
  return mon.moves.includes(move);
}

export function partyCount(): number {
  return save.party.length;
}

export function countAliveNonEggMons(exclude = -1): number {
  return save.party.filter((mon, i) => i !== exclude && !mon.isEgg && mon.hp > 0).length;
}

export function firstAliveNonEgg(): Pokemon | undefined {
  return save.party.find((mon) => !mon.isEgg && mon.hp > 0);
}

export function leadMonIndex(): number {
  const index = save.party.findIndex((mon) => !mon.isEgg);
  return index < 0 ? 0 : index;
}

/** GiveMonToPlayer: party or PC. Returns MON_GIVEN_TO_PARTY(0)/PC(1)/CANT(2). */
export function giveMonToPlayer(mon: Pokemon): number {
  mon.otName = [...save.playerName];
  mon.otGender = save.playerGender;
  mon.otId = save.trainerId;
  if (save.party.length < PARTY_SIZE) {
    save.party.push(structuredClone(mon));
    return 0;
  }
  return sendMonToPC(mon) ? 1 : 2;
}

export function nationalDexNum(species: number): number {
  return rom.species[species]?.national ?? 0;
}

export function setDexFlag(species: number, caught: boolean): void {
  const n = nationalDexNum(species) - 1;
  if (n < 0) return;
  save.pokedexSeen[n >> 3] |= 1 << (n & 7);
  if (caught) save.pokedexCaught[n >> 3] |= 1 << (n & 7);
}

export function getDexFlag(species: number, caught: boolean): boolean {
  const n = nationalDexNum(species) - 1;
  if (n < 0) return false;
  const table = caught ? save.pokedexCaught : save.pokedexSeen;
  return ((table[n >> 3] ?? 0) & (1 << (n & 7))) !== 0;
}

export function dexCount(caught: boolean, kantoOnly = false): number {
  let count = 0;
  const limit = kantoOnly ? 151 : 386;
  const table = caught ? save.pokedexCaught : save.pokedexSeen;
  for (let n = 0; n < limit; n++) if ((table[n >> 3] ?? 0) & (1 << (n & 7))) count++;
  return count;
}

/** Exact dex completion predicates from pokedex.c (all checks use National Dex indices). */
function hasCaughtNationalDexNumber(national: number): boolean {
  const index = national - 1;
  return index >= 0 && ((save.pokedexCaught[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
}

export function hasAllKantoDexSpecies(): boolean {
  // HasAllKantoMons excludes Mew: national numbers 1 through 150.
  for (let national = 1; national <= 150; national++)
    if (!hasCaughtNationalDexNumber(national)) return false;
  return true;
}

export function hasAllNationalDexSpecies(): boolean {
  // HasAllMons excludes Mew, Lugia, Ho-Oh, Celebi, Jirachi and Deoxys.
  const excluded = new Set([151, 249, 250, 251, 385, 386]);
  for (let national = 1; national <= 386; national++)
    if (!excluded.has(national) && !hasCaughtNationalDexNumber(national)) return false;
  return true;
}

/** GetEvolutionTargetSpecies for level-up style evolutions (mode 0). */
export function levelUpEvolution(mon: Pokemon): number {
  const info = rom.species[mon.species];
  const c = rom.constants;
  for (const [method, param, target] of info.evolutions) {
    switch (method) {
      case c.EVO_FRIENDSHIP:
        if (mon.friendship >= 220) return target;
        break;
      case c.EVO_LEVEL:
        if (param <= mon.level) return target;
        break;
      case c.EVO_LEVEL_ATK_GT_DEF:
        if (param <= mon.level && mon.stats[1] > mon.stats[2]) return target;
        break;
      case c.EVO_LEVEL_ATK_EQ_DEF:
        if (param <= mon.level && mon.stats[1] === mon.stats[2]) return target;
        break;
      case c.EVO_LEVEL_ATK_LT_DEF:
        if (param <= mon.level && mon.stats[1] < mon.stats[2]) return target;
        break;
      case c.EVO_LEVEL_SILCOON:
        if (param <= mon.level && ((mon.personality >>> 16) & 0xffff) % 10 <= 4) return target;
        break;
      case c.EVO_LEVEL_CASCOON:
        if (param <= mon.level && ((mon.personality >>> 16) & 0xffff) % 10 > 4) return target;
        break;
      case c.EVO_LEVEL_NINJASK:
        if (param <= mon.level) return target;
        break;
      case c.EVO_BEAUTY:
        if (param <= (mon.contest?.[1] ?? 0)) return target;
        break;
    }
  }
  return 0;
}

export function itemEvolution(mon: Pokemon, item: number): number {
  const c = rom.constants;
  for (const [method, param, target] of rom.species[mon.species].evolutions) {
    if (method === c.EVO_ITEM && param === item) return target;
  }
  return 0;
}

export function tradeEvolution(mon: Pokemon): number {
  const c = rom.constants;
  for (const [method, param, target] of rom.species[mon.species].evolutions) {
    if (method === c.EVO_TRADE) return target;
    if (method === c.EVO_TRADE_ITEM && mon.heldItem === param) return target;
  }
  return 0;
}

/** Evolve in place, keeping the nickname unless it matched the species name. */
export function evolveMon(mon: Pokemon, target: number): void {
  const oldName = speciesName(mon.species);
  const nick = nickname(mon);
  const renamed = oldName.length !== nick.length || oldName.some((b, i) => b !== nick[i]);
  mon.species = target;
  if (!renamed) mon.nickname = Array.from(speciesName(target));
  calculateStats(mon);
  setDexFlag(target, true);
}

/** Moves learned exactly at `level` (MonTryLearningNewMove iteration). */
export function movesLearnedAtLevel(species: number, level: number): number[] {
  return rom.species[species].learnset.filter(([l]) => l === level).map(([, move]) => move);
}

export function canLearnTMHM(species: number, index: number): boolean {
  const [lo, hi] = rom.species[species].tmhm;
  if (index < 32) return ((lo >>> index) & 1) === 1;
  return ((hi >>> (index - 32)) & 1) === 1;
}

/** AdjustFriendship for the common field events. */
export function adjustFriendship(mon: Pokemon, delta: number): void {
  if (mon.isEgg) return;
  mon.friendship = Math.max(0, Math.min(255, mon.friendship + delta));
}
