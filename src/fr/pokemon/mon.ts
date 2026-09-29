// pokemon.c: GetMonData/SetMonData over the TS Pokemon objects, plus the
// struct Pokemon helpers used by battles (CreateMon, CalculateMonStats, ...).

import { EOS } from "../gba/charmap";
import * as C from "../generated/constants";
import { random, random32 } from "../random";
import { b64, rom } from "../rom";
import { save } from "../save";
import { calculateStats, type Pokemon } from "./pokemon";

export type Mon = Pokemon & {
  language?: number;
  metGame?: number;
  contest?: number[]; // cool, beauty, cute, smart, tough, sheen
  ribbons?: number[]; // cool,beauty,cute,smart,tough (0-4 each), champion.. world (1 bit), unused
  isBadEgg?: boolean;
  hasSpecies?: boolean;
};

const EMPTY_NAME = [EOS];

/** A zeroed struct Pokemon (species 0) for empty party slots. */
export function zeroMon(): Mon {
  return {
    species: 0, nickname: [...EMPTY_NAME], personality: 0, otId: 0, otName: [...EMPTY_NAME], otGender: 0, level: 0, exp: 0,
    ivs: [0, 0, 0, 0, 0, 0], evs: [0, 0, 0, 0, 0, 0], moves: [0, 0, 0, 0], pp: [0, 0, 0, 0], ppBonuses: 0, hp: 0,
    stats: [0, 0, 0, 0, 0, 0], status: 0, heldItem: 0, friendship: 0, abilityNum: 0, metLevel: 0, metLocation: 0,
    pokeball: 0, isEgg: false, pokerus: 0, markings: 0, mail: C.MAIL_NONE, language: 0, metGame: 0,
  };
}

// ---------------------------------------------------------------- parties

export const gEnemyParty: Mon[] = Array.from({ length: 6 }, zeroMon);
let emptyPlayerSlots: Mon[] = Array.from({ length: 6 }, zeroMon);

/** &gPlayerParty[i]: the save's party, padded with empty mons. */
export function playerMon(i: number): Mon {
  return (save.party[i] as Mon | undefined) ?? emptyPlayerSlots[i];
}

export function setPlayerMon(i: number, mon: Mon): void {
  if (mon.species === 0) {
    if (i < save.party.length) save.party.splice(i, 1);
    return;
  }
  if (i < save.party.length) save.party[i] = mon;
  else save.party.push(mon);
}

/** SwitchPartyMonSlots */
export function swapPlayerMons(a: number, b: number): void {
  const pa = playerMon(a);
  const pb = playerMon(b);
  if (a < save.party.length && b < save.party.length) {
    save.party[a] = pb;
    save.party[b] = pa;
  }
}

export function ZeroEnemyPartyMons(): void {
  for (let i = 0; i < 6; i++) gEnemyParty[i] = zeroMon();
}

export function ZeroPlayerPartyMons(): void {
  save.party.length = 0;
  emptyPlayerSlots = Array.from({ length: 6 }, zeroMon);
}

export function CalculatePlayerPartyCount(): number {
  let n = 0;
  while (n < 6 && GetMonData(playerMon(n), C.MON_DATA_SPECIES) !== C.SPECIES_NONE) n++;
  return n;
}

export function CalculateEnemyPartyCount(): number {
  let n = 0;
  while (n < 6 && GetMonData(gEnemyParty[n], C.MON_DATA_SPECIES) !== C.SPECIES_NONE) n++;
  return n;
}

// ---------------------------------------------------------------- GetMonData / SetMonData

function copyName(src: number[], dest: Uint8Array | number[] | undefined, max: number): number {
  let i = 0;
  for (; i < max && i < src.length && src[i] !== EOS; i++) if (dest) dest[i] = src[i];
  if (dest) dest[i] = EOS;
  return i;
}

let textEgg: number[] | undefined;
let textBadEgg: number[] | undefined;

export function GetMonData(mon: Mon, field: number, data?: Uint8Array | number[]): number {
  const species = mon.species;
  switch (field) {
    case C.MON_DATA_STATUS: return mon.status >>> 0;
    case C.MON_DATA_LEVEL: return mon.level;
    case C.MON_DATA_HP: return mon.hp;
    case C.MON_DATA_MAX_HP: return mon.stats[0];
    case C.MON_DATA_ATK: case C.MON_DATA_ATK2: return mon.stats[1];
    case C.MON_DATA_DEF: case C.MON_DATA_DEF2: return mon.stats[2];
    case C.MON_DATA_SPEED: case C.MON_DATA_SPEED2: return mon.stats[3];
    case C.MON_DATA_SPATK: case C.MON_DATA_SPATK2: return mon.stats[4];
    case C.MON_DATA_SPDEF: case C.MON_DATA_SPDEF2: return mon.stats[5];
    case C.MON_DATA_MAIL: return mon.mail ?? C.MAIL_NONE;
    case C.MON_DATA_PERSONALITY: return mon.personality >>> 0;
    case C.MON_DATA_OT_ID: return mon.otId >>> 0;
    case C.MON_DATA_NICKNAME:
      if (mon.isBadEgg) {
        textBadEgg ??= Array.from(rom.text("gText_BadEgg"));
        return copyName(textBadEgg, data, C.POKEMON_NAME_LENGTH);
      }
      if (mon.isEgg) {
        textEgg ??= Array.from(rom.text("gText_EggNickname"));
        return copyName(textEgg, data, 0x400);
      }
      {
        let i = 0;
        for (; i < C.POKEMON_NAME_LENGTH; i++) if (data) data[i] = mon.nickname[i] ?? EOS;
        if (data) data[i] = EOS;
        return i;
      }
    case C.MON_DATA_LANGUAGE: return mon.language ?? C.LANGUAGE_ENGLISH;
    case C.MON_DATA_SANITY_IS_BAD_EGG: return mon.isBadEgg ? 1 : 0;
    case C.MON_DATA_SANITY_HAS_SPECIES: return species ? 1 : 0;
    case C.MON_DATA_SANITY_IS_EGG: return mon.isEgg ? 1 : 0;
    case C.MON_DATA_OT_NAME: {
      let i = 0;
      for (; i < C.PLAYER_NAME_LENGTH; i++) if (data) data[i] = mon.otName[i] ?? EOS;
      if (data) data[i] = EOS;
      return i;
    }
    case C.MON_DATA_MARKINGS: return mon.markings;
    case C.MON_DATA_CHECKSUM: return 0;
    case C.MON_DATA_ENCRYPT_SEPARATOR: return 0;
    case C.MON_DATA_SPECIES: return mon.isBadEgg ? C.SPECIES_EGG : species;
    case C.MON_DATA_HELD_ITEM: return mon.heldItem;
    case C.MON_DATA_EXP: return mon.exp >>> 0;
    case C.MON_DATA_PP_BONUSES: return mon.ppBonuses;
    case C.MON_DATA_FRIENDSHIP: return mon.friendship;
    case C.MON_DATA_MOVE1: case C.MON_DATA_MOVE2: case C.MON_DATA_MOVE3: case C.MON_DATA_MOVE4:
      return mon.moves[field - C.MON_DATA_MOVE1] ?? 0;
    case C.MON_DATA_PP1: case C.MON_DATA_PP2: case C.MON_DATA_PP3: case C.MON_DATA_PP4:
      return mon.pp[field - C.MON_DATA_PP1] ?? 0;
    case C.MON_DATA_HP_EV: return mon.evs[0];
    case C.MON_DATA_ATK_EV: return mon.evs[1];
    case C.MON_DATA_DEF_EV: return mon.evs[2];
    case C.MON_DATA_SPEED_EV: return mon.evs[3];
    case C.MON_DATA_SPATK_EV: return mon.evs[4];
    case C.MON_DATA_SPDEF_EV: return mon.evs[5];
    case C.MON_DATA_COOL: return mon.contest?.[0] ?? 0;
    case C.MON_DATA_BEAUTY: return mon.contest?.[1] ?? 0;
    case C.MON_DATA_CUTE: return mon.contest?.[2] ?? 0;
    case C.MON_DATA_SMART: return mon.contest?.[3] ?? 0;
    case C.MON_DATA_TOUGH: return mon.contest?.[4] ?? 0;
    case C.MON_DATA_SHEEN: return mon.contest?.[5] ?? 0;
    case C.MON_DATA_POKERUS: return mon.pokerus;
    case C.MON_DATA_MET_LOCATION: return mon.metLocation;
    case C.MON_DATA_MET_LEVEL: return mon.metLevel;
    case C.MON_DATA_MET_GAME: return mon.metGame ?? C.VERSION_FIRE_RED;
    case C.MON_DATA_POKEBALL: return mon.pokeball;
    case C.MON_DATA_OT_GENDER: return mon.otGender;
    case C.MON_DATA_HP_IV: return mon.ivs[0];
    case C.MON_DATA_ATK_IV: return mon.ivs[1];
    case C.MON_DATA_DEF_IV: return mon.ivs[2];
    case C.MON_DATA_SPEED_IV: return mon.ivs[3];
    case C.MON_DATA_SPATK_IV: return mon.ivs[4];
    case C.MON_DATA_SPDEF_IV: return mon.ivs[5];
    case C.MON_DATA_IS_EGG: return mon.isEgg ? 1 : 0;
    case C.MON_DATA_ABILITY_NUM: return mon.abilityNum;
    case C.MON_DATA_MODERN_FATEFUL_ENCOUNTER: return mon.modernFatefulEncounter ? 1 : 0;
    case C.MON_DATA_SPECIES_OR_EGG:
      return species && (mon.isEgg || mon.isBadEgg) ? C.SPECIES_EGG : species;
    case C.MON_DATA_IVS:
      return (mon.ivs[0] | (mon.ivs[1] << 5) | (mon.ivs[2] << 10) | (mon.ivs[3] << 15) | (mon.ivs[4] << 20) | (mon.ivs[5] << 25)) >>> 0;
    case C.MON_DATA_KNOWN_MOVES: {
      let ret = 0;
      if (species && !mon.isEgg && data) {
        for (let i = 0; data[i] !== C.MOVES_COUNT && i < data.length; i++) if (mon.moves.includes(data[i])) ret |= 1 << i;
      }
      return ret >>> 0;
    }
    default:
      if (field >= C.MON_DATA_COOL_RIBBON && field <= C.MON_DATA_UNUSED_RIBBONS) return ribbon(mon, field);
      if (field === C.MON_DATA_RIBBON_COUNT) {
        if (!species || mon.isEgg) return 0;
        let n = 0;
        for (let f = C.MON_DATA_COOL_RIBBON; f <= C.MON_DATA_WORLD_RIBBON; f++) if (f < C.MON_DATA_CHAMPION_RIBBON || f > C.MON_DATA_TOUGH_RIBBON) n += ribbon(mon, f);
        for (let f = C.MON_DATA_CHAMPION_RIBBON; f <= C.MON_DATA_WORLD_RIBBON; f++) n += ribbon(mon, f);
        return n;
      }
      return 0;
  }
}

const RIBBON_INDEX: Record<number, number> = {};
[C.MON_DATA_COOL_RIBBON, C.MON_DATA_BEAUTY_RIBBON, C.MON_DATA_CUTE_RIBBON, C.MON_DATA_SMART_RIBBON, C.MON_DATA_TOUGH_RIBBON,
  C.MON_DATA_CHAMPION_RIBBON, C.MON_DATA_WINNING_RIBBON, C.MON_DATA_VICTORY_RIBBON, C.MON_DATA_ARTIST_RIBBON, C.MON_DATA_EFFORT_RIBBON,
  C.MON_DATA_MARINE_RIBBON, C.MON_DATA_LAND_RIBBON, C.MON_DATA_SKY_RIBBON, C.MON_DATA_COUNTRY_RIBBON, C.MON_DATA_NATIONAL_RIBBON,
  C.MON_DATA_EARTH_RIBBON, C.MON_DATA_WORLD_RIBBON, C.MON_DATA_UNUSED_RIBBONS].forEach((f, i) => { RIBBON_INDEX[f] = i; });

function ribbon(mon: Mon, field: number): number {
  return mon.ribbons?.[RIBBON_INDEX[field]] ?? 0;
}

function nameFrom(data: ArrayLike<number>, max: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(data[i] ?? EOS);
  return out;
}

/** SetMonData(mon, field, value): value is the number (or name bytes). */
export function SetMonData(mon: Mon, field: number, value: number | ArrayLike<number>): void {
  const v = typeof value === "number" ? value : (value as ArrayLike<number>)[0] ?? 0;
  switch (field) {
    case C.MON_DATA_STATUS: mon.status = v >>> 0; return;
    case C.MON_DATA_LEVEL: mon.level = v & 0xff; return;
    case C.MON_DATA_HP: mon.hp = v & 0xffff; return;
    case C.MON_DATA_MAX_HP: mon.stats[0] = v & 0xffff; return;
    case C.MON_DATA_ATK: mon.stats[1] = v & 0xffff; return;
    case C.MON_DATA_DEF: mon.stats[2] = v & 0xffff; return;
    case C.MON_DATA_SPEED: mon.stats[3] = v & 0xffff; return;
    case C.MON_DATA_SPATK: mon.stats[4] = v & 0xffff; return;
    case C.MON_DATA_SPDEF: mon.stats[5] = v & 0xffff; return;
    case C.MON_DATA_MAIL: mon.mail = v & 0xff; return;
    case C.MON_DATA_PERSONALITY: mon.personality = v >>> 0; return;
    case C.MON_DATA_OT_ID:
      mon.otId = typeof value === "number" ? v >>> 0 : ((value[0] | (value[1] << 8) | (value[2] << 16) | (value[3] << 24)) >>> 0);
      return;
    case C.MON_DATA_NICKNAME: mon.nickname = nameFrom(value as ArrayLike<number>, C.POKEMON_NAME_LENGTH); return;
    case C.MON_DATA_LANGUAGE: mon.language = v; return;
    case C.MON_DATA_SANITY_IS_BAD_EGG: mon.isBadEgg = !!v; return;
    case C.MON_DATA_SANITY_HAS_SPECIES: mon.hasSpecies = !!v; return;
    case C.MON_DATA_SANITY_IS_EGG: mon.isEgg = !!v; return;
    case C.MON_DATA_OT_NAME: mon.otName = nameFrom(value as ArrayLike<number>, C.PLAYER_NAME_LENGTH); return;
    case C.MON_DATA_MARKINGS: mon.markings = v & 0xff; return;
    case C.MON_DATA_SPECIES: mon.species = v & 0xffff; mon.hasSpecies = !!mon.species; return;
    case C.MON_DATA_HELD_ITEM: mon.heldItem = v & 0xffff; return;
    case C.MON_DATA_EXP: mon.exp = v >>> 0; return;
    case C.MON_DATA_PP_BONUSES: mon.ppBonuses = v & 0xff; return;
    case C.MON_DATA_FRIENDSHIP: mon.friendship = v & 0xff; return;
    case C.MON_DATA_MOVE1: case C.MON_DATA_MOVE2: case C.MON_DATA_MOVE3: case C.MON_DATA_MOVE4:
      mon.moves[field - C.MON_DATA_MOVE1] = v & 0xffff; return;
    case C.MON_DATA_PP1: case C.MON_DATA_PP2: case C.MON_DATA_PP3: case C.MON_DATA_PP4:
      mon.pp[field - C.MON_DATA_PP1] = v & 0xff; return;
    case C.MON_DATA_HP_EV: mon.evs[0] = v & 0xff; return;
    case C.MON_DATA_ATK_EV: mon.evs[1] = v & 0xff; return;
    case C.MON_DATA_DEF_EV: mon.evs[2] = v & 0xff; return;
    case C.MON_DATA_SPEED_EV: mon.evs[3] = v & 0xff; return;
    case C.MON_DATA_SPATK_EV: mon.evs[4] = v & 0xff; return;
    case C.MON_DATA_SPDEF_EV: mon.evs[5] = v & 0xff; return;
    case C.MON_DATA_COOL: case C.MON_DATA_BEAUTY: case C.MON_DATA_CUTE: case C.MON_DATA_SMART: case C.MON_DATA_TOUGH: case C.MON_DATA_SHEEN: {
      const idx = [C.MON_DATA_COOL, C.MON_DATA_BEAUTY, C.MON_DATA_CUTE, C.MON_DATA_SMART, C.MON_DATA_TOUGH, C.MON_DATA_SHEEN].indexOf(field);
      mon.contest ??= [0, 0, 0, 0, 0, 0];
      mon.contest[idx] = v & 0xff;
      return;
    }
    case C.MON_DATA_POKERUS: mon.pokerus = v & 0xff; return;
    case C.MON_DATA_MET_LOCATION: mon.metLocation = v & 0xff; return;
    case C.MON_DATA_MET_LEVEL: mon.metLevel = v & 0x7f; return;
    case C.MON_DATA_MET_GAME: mon.metGame = v & 0xf; return;
    case C.MON_DATA_POKEBALL: mon.pokeball = v & 0xf; return;
    case C.MON_DATA_OT_GENDER: mon.otGender = v & 1; return;
    case C.MON_DATA_HP_IV: mon.ivs[0] = v & 31; return;
    case C.MON_DATA_ATK_IV: mon.ivs[1] = v & 31; return;
    case C.MON_DATA_DEF_IV: mon.ivs[2] = v & 31; return;
    case C.MON_DATA_SPEED_IV: mon.ivs[3] = v & 31; return;
    case C.MON_DATA_SPATK_IV: mon.ivs[4] = v & 31; return;
    case C.MON_DATA_SPDEF_IV: mon.ivs[5] = v & 31; return;
    case C.MON_DATA_IS_EGG: mon.isEgg = !!(v & 1); return;
    case C.MON_DATA_ABILITY_NUM: mon.abilityNum = v & 1; return;
    case C.MON_DATA_MODERN_FATEFUL_ENCOUNTER: mon.modernFatefulEncounter = !!v; return;
    case C.MON_DATA_IVS:
      mon.ivs = [v & 31, (v >>> 5) & 31, (v >>> 10) & 31, (v >>> 15) & 31, (v >>> 20) & 31, (v >>> 25) & 31];
      return;
    default:
      if (field >= C.MON_DATA_COOL_RIBBON && field <= C.MON_DATA_UNUSED_RIBBONS) {
        mon.ribbons ??= new Array(18).fill(0);
        mon.ribbons[RIBBON_INDEX[field]] = v;
      }
  }
}

// ---------------------------------------------------------------- creation

export const OT_ID_PLAYER_ID = 0;
export const OT_ID_PRESET = 1;
export const OT_ID_RANDOM_NO_SHINY = 2;
export const USE_RANDOM_IVS = 32;

export function GetSpeciesName(species: number): number[] {
  const src = b64(rom.species[species > C.NUM_SPECIES ? 0 : species]?.name ?? rom.species[0].name);
  const out: number[] = [];
  let i = 0;
  for (; i < C.POKEMON_NAME_LENGTH; i++) {
    out[i] = src[i] ?? EOS;
    if (out[i] === EOS) break;
  }
  out[i] = EOS;
  return out;
}

function trainerIdBytes(): number {
  return save.trainerId >>> 0;
}

/** CreateMon (pokemon.c) */
export function CreateMon(mon: Mon, species: number, level: number, fixedIV: number, hasFixedPersonality: boolean | number, fixedPersonality: number, otIdType: number, fixedOtId: number): void {
  Object.assign(mon, zeroMon());
  const personality = hasFixedPersonality ? fixedPersonality >>> 0 : random32();
  mon.personality = personality;
  let value: number;
  if (otIdType === OT_ID_RANDOM_NO_SHINY) {
    do {
      value = random32();
    } while (((((value >>> 16) ^ (value & 0xffff) ^ (personality >>> 16) ^ (personality & 0xffff)) >>> 0) < C.SHINY_ODDS));
  } else if (otIdType === OT_ID_PRESET) {
    value = fixedOtId >>> 0;
  } else {
    value = trainerIdBytes();
  }
  mon.otId = value;
  mon.nickname = GetSpeciesName(species);
  mon.language = C.LANGUAGE_ENGLISH;
  mon.otName = [...save.playerName];
  mon.species = species;
  mon.hasSpecies = true;
  mon.exp = rom.expTables[rom.species[species].growthRate][level];
  mon.friendship = rom.species[species].friendship;
  mon.metLocation = currentRegionMapSection();
  mon.metLevel = level;
  mon.metGame = C.VERSION_FIRE_RED;
  mon.pokeball = C.ITEM_POKE_BALL;
  mon.otGender = save.playerGender;
  if (fixedIV < USE_RANDOM_IVS) {
    mon.ivs = [fixedIV, fixedIV, fixedIV, fixedIV, fixedIV, fixedIV];
  } else {
    const a = random();
    const b = random();
    mon.ivs = [a & 31, (a >> 5) & 31, (a >> 10) & 31, b & 31, (b >> 5) & 31, (b >> 10) & 31];
  }
  if (rom.species[species].abilities[1]) mon.abilityNum = personality & 1;
  GiveMonInitialMoveset(mon);
  mon.level = level;
  mon.mail = C.MAIL_NONE;
  CalculateMonStats(mon);
}

/** CreateMonWithGenderNatureLetter (pokemon.c) */
export function CreateMonWithGenderNatureLetter(mon: Mon, species: number, level: number, fixedIV: number, gender: number, nature: number, unownLetter: number): void {
  let personality: number;
  if (((unownLetter - 1) & 0xff) < C.NUM_UNOWN_FORMS) {
    let actualLetter: number;
    do {
      personality = random32();
      // GET_UNOWN_LETTER
      actualLetter = ((((personality & 0x03000000) >>> 18) | ((personality & 0x00030000) >>> 12) | ((personality & 0x00000300) >>> 6) | (personality & 0x00000003)) >>> 0) % C.NUM_UNOWN_FORMS;
    } while (nature !== GetNatureFromPersonality(personality) || gender !== GetGenderFromSpeciesAndPersonality(species, personality) || actualLetter !== unownLetter - 1);
  } else {
    do {
      personality = random32();
    } while (nature !== GetNatureFromPersonality(personality) || gender !== GetGenderFromSpeciesAndPersonality(species, personality));
  }
  CreateMon(mon, species, level, fixedIV, true, personality, OT_ID_PLAYER_ID, 0);
}

let regionMapSection = () => 0;
export function setRegionMapSectionProvider(fn: () => number): void {
  regionMapSection = fn;
}
export function currentRegionMapSection(): number {
  return regionMapSection();
}

/** CalculateMonStats also writes gBattleScripting.levelUpHP (set by battle code). */
export const monHooks = { setLevelUpHP: (_hp: number) => {} };

export function CalculateMonStats(mon: Mon): void {
  const oldMaxHP = mon.stats[0] ?? 0;
  calculateStats(mon);
  let levelUpHP = (mon.stats[0] - oldMaxHP) & 0xff;
  if (levelUpHP === 0) levelUpHP = 1;
  monHooks.setLevelUpHP(levelUpHP);
}

export function GetLevelFromMonExp(mon: Mon): number {
  const table = rom.expTables[rom.species[mon.species].growthRate];
  let level = 1;
  while (level <= C.MAX_LEVEL && table[level] <= mon.exp) level++;
  return level - 1;
}

export function GiveMoveToMon(mon: Mon, move: number): number {
  for (let i = 0; i < 4; i++) {
    const existing = mon.moves[i];
    if (!existing) {
      mon.moves[i] = move;
      mon.pp[i] = rom.moves[move].pp;
      return move;
    }
    if (existing === move) return C.MON_ALREADY_KNOWS_MOVE;
  }
  return C.MON_HAS_MAX_MOVES;
}

export function SetMonMoveSlot(mon: Mon, move: number, slot: number): void {
  mon.moves[slot] = move;
  mon.pp[slot] = rom.moves[move].pp;
}

export function DeleteFirstMoveAndGiveMoveToMon(mon: Mon, move: number): void {
  const moves = [mon.moves[1], mon.moves[2], mon.moves[3], move];
  const pp = [mon.pp[1], mon.pp[2], mon.pp[3], rom.moves[move].pp];
  mon.moves = moves;
  mon.pp = pp;
  mon.ppBonuses = (mon.ppBonuses >> 2) & 0xff;
}

export function GiveMonInitialMoveset(mon: Mon): void {
  const level = GetLevelFromMonExp(mon);
  for (const [moveLevel, move] of rom.species[mon.species].learnset) {
    if (moveLevel > level) break;
    if (GiveMoveToMon(mon, move) === C.MON_HAS_MAX_MOVES) DeleteFirstMoveAndGiveMoveToMon(mon, move);
  }
}

let sLearningMoveTableID = 0;
/** MonTryLearningNewMove: returns the move given, MON_HAS_MAX_MOVES/ALREADY_KNOWS, or 0; sets moveToLearn. */
export function MonTryLearningNewMove(mon: Mon, firstMove: boolean, setMoveToLearn: (m: number) => void): number {
  const learnset = rom.species[mon.species].learnset;
  const level = mon.level;
  if (firstMove) {
    sLearningMoveTableID = 0;
    while (learnset[sLearningMoveTableID]?.[0] !== level) {
      sLearningMoveTableID++;
      if (sLearningMoveTableID >= learnset.length) return C.MOVE_NONE;
    }
  }
  const entry = learnset[sLearningMoveTableID];
  if (entry && entry[0] === level) {
    setMoveToLearn(entry[1]);
    sLearningMoveTableID++;
    return GiveMoveToMon(mon, entry[1]);
  }
  return C.MOVE_NONE;
}

export function GetMonGender(mon: Mon): number {
  return GetGenderFromSpeciesAndPersonality(mon.species, mon.personality);
}

export function GetGenderFromSpeciesAndPersonality(species: number, personality: number): number {
  const ratio = rom.species[species].genderRatio;
  if (ratio === C.MON_MALE || ratio === C.MON_FEMALE || ratio === C.MON_GENDERLESS) return ratio;
  return ratio > (personality & 0xff) ? C.MON_FEMALE : C.MON_MALE;
}

export function CalculatePPWithBonus(move: number, ppBonuses: number, moveIndex: number): number {
  const basePP = rom.moves[move]?.pp ?? 0;
  return (basePP + Math.trunc((basePP * 20 * ((ppBonuses >> (2 * moveIndex)) & 3)) / 100)) & 0xff;
}

export const gPPUpGetMask = [0x03, 0x0c, 0x30, 0xc0];
export const gPPUpSetMask = [0x01, 0x04, 0x10, 0x40];
export const gPPUpClearMask = [0xfc, 0xf3, 0xcf, 0x3f];
export const gPPUpAddMask = [0x01, 0x04, 0x10, 0x40];

export function RemoveMonPPBonus(mon: Mon, moveIndex: number): void {
  mon.ppBonuses &= gPPUpClearMask[moveIndex];
}

export function GetNature(mon: Mon): number {
  return (mon.personality >>> 0) % 25;
}

export function GetNatureFromPersonality(personality: number): number {
  return (personality >>> 0) % 25;
}

export function IsMonShiny(mon: Mon): boolean {
  return IsShinyOtIdPersonality(mon.otId, mon.personality);
}

export function IsShinyOtIdPersonality(otId: number, personality: number): boolean {
  return ((((otId >>> 16) ^ (otId & 0xffff) ^ (personality >>> 16) ^ (personality & 0xffff)) >>> 0) < C.SHINY_ODDS);
}

export function SpeciesToNationalPokedexNum(species: number): number {
  if (!species) return 0;
  return rom.species[species]?.national ?? 0;
}

export function NationalPokedexNumToSpecies(nationalNum: number): number {
  if (!nationalNum) return 0;
  const i = rom.species.findIndex((s, idx) => idx > 0 && s.national === nationalNum);
  return i < 0 ? 0 : i;
}

export function MonRestorePP(mon: Mon): void {
  for (let i = 0; i < 4; i++) {
    if (mon.moves[i]) mon.pp[i] = CalculatePPWithBonus(mon.moves[i], mon.ppBonuses, i);
  }
}

export function GetMonEVCount(mon: Mon): number {
  return mon.evs.reduce((a, b) => a + b, 0) & 0xffff;
}

export function CopyMon(dest: Mon, src: Mon): void {
  Object.assign(dest, JSON.parse(JSON.stringify(src)));
}
