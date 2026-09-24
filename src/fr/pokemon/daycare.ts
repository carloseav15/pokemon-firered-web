// daycare.c: the Four Island Day-Care (two mons, eggs, compatibility), the
// Route 5 Day-Care (one mon), egg creation, egg step counting and hatching.

import * as C from "../generated/constants";
import { encode, intToDecimal, stringVars, STR_CONV_MODE_LEFT_ALIGN } from "../gba/charmap";
import { random } from "../random";
import { rom } from "../rom";
import { flagSet, save, SV, varGet, varSet } from "../save";
import {
  calculateStats, canLearnTMHM, createMon, deleteFirstMoveAndGive, genderFromPersonality, giveMove, levelFromExp, MON_HAS_MAX_MOVES,
  movesLearnedAtLevel, nickname, setDexFlag, speciesName, MON_FEMALE, MON_GENDERLESS, type Pokemon,
} from "./pokemon";
import { tmhmMove } from "../menus/monProgress";

export type DaycareMon = { mon: Pokemon | null; steps: number };
export type DayCare = { mons: [DaycareMon, DaycareMon]; offspringPersonality: number; stepCounter: number };

const EGG_GENDER_MALE = 0x8000;
const PARENTS_INCOMPATIBLE = 0, PARENTS_LOW_COMPATIBILITY = 20, PARENTS_MED_COMPATIBILITY = 50, PARENTS_MAX_COMPATIBILITY = 70;
const EGG_HATCH_LEVEL = 5;
const JAPANESE_EGG_NICKNAME = [96, 111, 139, 0xff]; // sJapaneseEggNickname "タマゴ"

export function daycare(): DayCare {
  const s = save as unknown as { daycare?: DayCare };
  if (!s.daycare || !Array.isArray((s.daycare as DayCare).mons)) {
    s.daycare = { mons: [{ mon: null, steps: 0 }, { mon: null, steps: 0 }], offspringPersonality: 0, stepCounter: 0 };
  }
  return s.daycare;
}

export function route5DaycareMon(): DaycareMon {
  const s = save as unknown as { route5DayCareMon?: DaycareMon };
  if (!s.route5DayCareMon) s.route5DayCareMon = { mon: null, steps: 0 };
  return s.route5DayCareMon;
}

const hasSpecies = (d: DaycareMon): boolean => !!d.mon?.species;
export const countPokemonInDaycare = (): number => daycare().mons.filter(hasSpecies).length;
const genderOf = (mon: Pokemon): number => genderFromPersonality(mon.species, mon.personality);

/** StorePokemonInDaycare */
function storePokemonInDaycare(partyIndex: number, slot: DaycareMon): void {
  const mon = save.party[partyIndex];
  if (!mon) return;
  // BoxMonRestorePP: the box form keeps full PP; status and HP are recalculated on withdrawal.
  mon.pp = mon.moves.map((m, i) => (m ? Math.floor(rom.moves[m].pp * (5 + ((mon.ppBonuses >> (i * 2)) & 3)) / 5) : 0));
  slot.mon = mon;
  slot.steps = 0;
  save.party.splice(partyIndex, 1);
}

/** ApplyDaycareExperience + TakeSelectedPokemonFromDaycare */
function takeFromDaycare(slot: DaycareMon): number {
  const mon = slot.mon!;
  stringVars.var1 = nickname(mon);
  const species = mon.species;
  if (mon.level !== 100) {
    mon.exp += slot.steps;
    for (let i = 0; i < 100; i++) {
      const level = levelFromExp(mon.species, mon.exp);
      if (level <= mon.level) break;
      mon.level++;
      // MonTryLearningNewMove: a full moveset forgets its first move
      for (const move of movesLearnedAtLevel(mon.species, mon.level)) {
        if (giveMove(mon, move) === MON_HAS_MAX_MOVES) deleteFirstMoveAndGive(mon, move);
      }
    }
    calculateStats(mon);
  }
  mon.hp = mon.stats[0];
  mon.status = 0;
  save.party.push(mon);
  slot.mon = null;
  slot.steps = 0;
  return species;
}

function levelsGained(slot: DaycareMon): number {
  const mon = slot.mon!;
  return levelFromExp(mon.species, mon.exp + slot.steps) - levelFromExp(mon.species, mon.exp);
}

function costFor(slot: DaycareMon): number {
  const cost = 100 + 100 * levelsGained(slot);
  stringVars.var1 = nickname(slot.mon!);
  stringVars.var2 = intToDecimal(cost, STR_CONV_MODE_LEFT_ALIGN, 5);
  return cost;
}

/** GetEggSpecies: walk the evolution table backwards. */
function eggSpecies(species: number): number {
  for (let i = 0; i < 5; i++) {
    let found = false;
    for (let j = 1; j < rom.species.length && !found; j++) {
      if (rom.species[j].evolutions.some(([, , target]) => target === species)) { species = j; found = true; }
    }
    if (!found) break;
  }
  return species;
}

function compatibilityScore(): number {
  const [a, b] = daycare().mons.map((d) => d.mon!);
  const groups = [a, b].map((m) => rom.species[m.species].eggGroups);
  if (groups[0][0] === C.EGG_GROUP_UNDISCOVERED || groups[1][0] === C.EGG_GROUP_UNDISCOVERED) return PARENTS_INCOMPATIBLE;
  if (groups[0][0] === C.EGG_GROUP_DITTO && groups[1][0] === C.EGG_GROUP_DITTO) return PARENTS_INCOMPATIBLE;
  if (groups[0][0] === C.EGG_GROUP_DITTO || groups[1][0] === C.EGG_GROUP_DITTO) {
    return a.otId === b.otId ? PARENTS_LOW_COMPATIBILITY : PARENTS_MED_COMPATIBILITY;
  }
  const genders = [genderOf(a), genderOf(b)];
  if (genders[0] === genders[1]) return PARENTS_INCOMPATIBLE;
  if (genders[0] === MON_GENDERLESS || genders[1] === MON_GENDERLESS) return PARENTS_INCOMPATIBLE;
  if (!groups[0].some((g) => groups[1].includes(g))) return PARENTS_INCOMPATIBLE;
  if (a.species === b.species) return a.otId === b.otId ? PARENTS_MED_COMPATIBILITY : PARENTS_MAX_COMPATIBILITY;
  return a.otId !== b.otId ? PARENTS_MED_COMPATIBILITY : PARENTS_LOW_COMPATIBILITY;
}

/** GetEggMoves */
function eggMovesOf(species: number): number[] {
  const table = rom.eggMoves;
  const i = table.indexOf(species + 20000);
  if (i < 0) return [];
  const out: number[] = [];
  for (let j = i + 1; j < table.length && table[j] <= 20000; j++) out.push(table[j]);
  return out;
}

/** BuildEggMoveset */
function buildEggMoveset(egg: Pokemon, father: Pokemon, mother: Pokemon): void {
  const levelUp = rom.species[egg.species].learnset.map(([, move]) => move);
  const fatherMoves = father.moves, motherMoves = mother.moves;
  const eggMoves = eggMovesOf(egg.species);
  const give = (m: number) => { if (giveMove(egg, m) === MON_HAS_MAX_MOVES) deleteFirstMoveAndGive(egg, m); };
  for (const m of fatherMoves) { if (!m) break; if (eggMoves.includes(m)) give(m); }
  for (const m of fatherMoves) {
    if (!m) continue;
    for (let j = 0; j < 58; j++) if (m === tmhmMove(C.ITEM_TM01 + j) && canLearnTMHM(egg.species, j)) give(m);
  }
  const shared: number[] = [];
  for (const m of fatherMoves) { if (!m) break; for (const n of motherMoves) if (m === n && m) shared.push(m); }
  for (const m of shared) if (levelUp.includes(m)) give(m);
}

/** _GiveEggFromDaycare */
export function giveEggFromDaycare(): void {
  const dc = daycare();
  const species = [dc.mons[0].mon!.species, dc.mons[1].mon!.species];
  let mother = 0, father = 1;
  for (let i = 0; i < 2; i++) {
    if (species[i] === C.SPECIES_DITTO) { mother = i ^ 1; father = i; }
    else if (genderOf(dc.mons[i].mon!) === MON_FEMALE) { mother = i; father = i ^ 1; }
  }
  let eggSp = eggSpecies(species[mother]);
  if (eggSp === C.SPECIES_NIDORAN_F && dc.offspringPersonality & EGG_GENDER_MALE) eggSp = C.SPECIES_NIDORAN_M;
  if (eggSp === C.SPECIES_ILLUMISE && dc.offspringPersonality & EGG_GENDER_MALE) eggSp = C.SPECIES_VOLBEAT;
  if (species[father] === C.SPECIES_DITTO && genderOf(dc.mons[mother].mon!) !== MON_FEMALE) [mother, father] = [father, mother];
  // AlterEggSpeciesWithIncenseItem
  const items = [dc.mons[0].mon!.heldItem, dc.mons[1].mon!.heldItem];
  if (eggSp === C.SPECIES_WYNAUT && !items.includes(C.ITEM_LAX_INCENSE)) eggSp = C.SPECIES_WOBBUFFET;
  if (eggSp === C.SPECIES_AZURILL && !items.includes(C.ITEM_SEA_INCENSE)) eggSp = C.SPECIES_MARILL;
  // SetInitialEggData
  const personality = (dc.offspringPersonality | (random() << 16)) >>> 0;
  const egg = createMon(eggSp, EGG_HATCH_LEVEL, { personality });
  egg.pokeball = C.ITEM_POKE_BALL;
  egg.nickname = [...JAPANESE_EGG_NICKNAME];
  egg.friendship = rom.species[eggSp].eggCycles;
  egg.metLevel = 0;
  // InheritIVs: three distinct stats from random parents
  const available = [0, 1, 2, 3, 4, 5];
  const selected: number[] = [];
  for (let i = 0; i < 3; i++) {
    const iv = available[random() % (6 - i)];
    selected.push(iv);
    available.splice(available.indexOf(iv), 1);
  }
  const which = selected.map(() => random() % 2);
  // IV order in the C switch: HP, ATK, DEF, SPEED, SPATK, SPDEF (matches Pokemon.ivs)
  selected.forEach((stat, i) => { egg.ivs[stat] = dc.mons[which[i]].mon!.ivs[stat]; });
  egg.moves = [0, 0, 0, 0];
  egg.pp = [0, 0, 0, 0];
  for (const [level, move] of rom.species[eggSp].learnset) {
    if (level > EGG_HATCH_LEVEL) break;
    if (giveMove(egg, move) === MON_HAS_MAX_MOVES) deleteFirstMoveAndGive(egg, move);
  }
  buildEggMoveset(egg, dc.mons[father].mon!, dc.mons[mother].mon!);
  calculateStats(egg);
  egg.isEgg = true;
  save.party.push(egg);
  dc.offspringPersonality = 0;
  dc.stepCounter = 0;
}

/** TriggerPendingDaycareEgg */
function triggerPendingEgg(): void {
  daycare().offspringPersonality = (random() % 0xfffe) + 1;
  flagSet(C.FLAG_PENDING_DAYCARE_EGG);
}

/** ShouldEggHatch / TryProduceOrHatchEgg: called once per step. */
export function shouldEggHatch(): boolean {
  const r5 = route5DaycareMon();
  if (hasSpecies(r5)) r5.steps++;
  const dc = daycare();
  let valid = 0;
  for (const d of dc.mons) if (hasSpecies(d)) { d.steps++; valid++; }
  if (dc.offspringPersonality === 0 && valid === 2 && (dc.mons[1].steps & 0xff) === 0xff) {
    if (compatibilityScore() > Math.floor((random() * 100) / 0xffff)) triggerPendingEgg();
  }
  dc.stepCounter = (dc.stepCounter + 1) & 0xff;
  if (dc.stepCounter === 255) {
    for (let i = 0; i < save.party.length; i++) {
      const mon = save.party[i];
      if (!mon.isEgg) continue;
      if (mon.friendship !== 0) mon.friendship--;
      else { varSet(SV.x8004, i); return true; }
    }
  }
  return false;
}

/** AddHatchedMonToParty (CreatedHatchedMon) */
export function hatchPartyEgg(index: number, metLocation: number): void {
  const egg = save.party[index];
  const hatched = createMon(egg.species, EGG_HATCH_LEVEL, { personality: egg.personality });
  hatched.moves = [...egg.moves];
  hatched.pp = egg.moves.map((m) => (m ? rom.moves[m].pp : 0));
  hatched.ivs = [...egg.ivs];
  hatched.markings = egg.markings;
  hatched.pokerus = egg.pokerus;
  hatched.friendship = 120;
  hatched.pokeball = C.ITEM_POKE_BALL;
  hatched.metLevel = 0;
  hatched.metLocation = metLocation;
  hatched.nickname = Array.from(speciesName(hatched.species));
  hatched.isEgg = false;
  calculateStats(hatched);
  hatched.hp = hatched.stats[0];
  save.party[index] = hatched;
  setDexFlag(hatched.species, true);
  stringVars.var1 = nickname(hatched);
}

// ---------------------------------------------------------------- script specials

export const DAYCARE_SPECIALS: Record<string, () => number | void> = {
  GetDaycareState: () => {
    if (daycare().offspringPersonality !== 0) return C.DAYCARE_EGG_WAITING;
    const n = countPokemonInDaycare();
    return n ? n + 1 : C.DAYCARE_NO_MONS;
  },
  GetDaycarePokemonCount: () => countPokemonInDaycare(),
  StoreSelectedPokemonInDaycare: () => {
    const dc = daycare();
    const slot = dc.mons.find((d) => !hasSpecies(d));
    if (slot) storePokemonInDaycare(varGet(SV.x8004), slot);
  },
  TakePokemonFromDaycare: () => {
    const dc = daycare();
    const species = takeFromDaycare(dc.mons[varGet(SV.x8004)]);
    // ShiftDaycareSlots
    if (hasSpecies(dc.mons[1]) && !hasSpecies(dc.mons[0])) {
      dc.mons[0] = dc.mons[1];
      dc.mons[1] = { mon: null, steps: 0 };
    }
    return species;
  },
  GetDaycareCost: () => { varSet(SV.x8005, costFor(daycare().mons[varGet(SV.x8004)])); },
  GetNumLevelsGainedFromDaycare: () => {
    const slot = daycare().mons[varGet(SV.x8004)];
    if (!hasSpecies(slot)) return 0;
    const n = levelsGained(slot);
    stringVars.var2 = intToDecimal(n, STR_CONV_MODE_LEFT_ALIGN, 2);
    stringVars.var1 = nickname(slot.mon!);
    return n;
  },
  GetDaycareMonNicknames: () => {
    const dc = daycare();
    if (hasSpecies(dc.mons[0])) { stringVars.var1 = nickname(dc.mons[0].mon!); stringVars.var3 = Uint8Array.from(dc.mons[0].mon!.otName); }
    if (hasSpecies(dc.mons[1])) stringVars.var2 = nickname(dc.mons[1].mon!);
  },
  GetSelectedMonNicknameAndSpecies: () => {
    const mon = save.party[varGet(SV.x8004)];
    if (!mon) return 0;
    stringVars.var1 = nickname(mon);
    return mon.species;
  },
  SetDaycareCompatibilityString: () => {
    const score = compatibilityScore();
    const which = score === PARENTS_INCOMPATIBLE ? 3 : score === PARENTS_LOW_COMPATIBILITY ? 2 : score === PARENTS_MED_COMPATIBILITY ? 1 : 0;
    stringVars.var4 = rom.text(["gDaycareText_GetAlongVeryWell", "gDaycareText_GetAlong", "gDaycareText_DontLikeOther", "gDaycareText_PlayOther"][which]);
  },
  GiveEggFromDaycare: () => { giveEggFromDaycare(); },
  RejectEggFromDayCare: () => { const dc = daycare(); dc.offspringPersonality = 0; dc.stepCounter = 0; },
  PutMonInRoute5Daycare: () => { storePokemonInDaycare(varGet(SV.x8004), route5DaycareMon()); },
  GetCostToWithdrawRoute5DaycareMon: () => { varSet(SV.x8005, costFor(route5DaycareMon())); },
  IsThereMonInRoute5Daycare: () => (hasSpecies(route5DaycareMon()) ? 1 : 0),
  GetNumLevelsGainedForRoute5DaycareMon: () => {
    const slot = route5DaycareMon();
    const n = levelsGained(slot);
    stringVars.var2 = intToDecimal(n, STR_CONV_MODE_LEFT_ALIGN, 2);
    stringVars.var1 = nickname(slot.mon!);
    return n;
  },
  TakePokemonFromRoute5Daycare: () => takeFromDaycare(route5DaycareMon()),
  DaycareMonReceivedMail: () => 0,
};

/** GetDaycareLevelMenuText rows: nickname + gender symbol and the level after the stored steps. */
export function daycareLevelMenuRows(): Array<{ name: Uint8Array; level: number }> {
  return daycare().mons.map((d) => {
    const mon = d.mon!;
    const name = [...nickname(mon)].filter((b) => b !== 0xff);
    const g = genderOf(mon);
    if (g === MON_FEMALE) name.push(...encode("♀").filter((b) => b !== 0xff));
    else if (g !== MON_GENDERLESS) name.push(...encode("♂").filter((b) => b !== 0xff));
    name.push(0xff);
    return { name: Uint8Array.from(name), level: levelFromExp(mon.species, mon.exp + d.steps) };
  });
}
