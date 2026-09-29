// daycare.c: the Four Island Day-Care (two mons, eggs, compatibility), the
// Route 5 Day-Care (one mon), egg creation, egg step counting and hatching.

import * as C from "../generated/constants";
import { CHAR_NEWLINE, encode, EOS, intToDecimal, stringVars, STR_CONV_MODE_LEFT_ALIGN } from "../gba/charmap";
import { StringAppend, StringCompare, StringCopy, StringCopy_Nickname } from "../generated/stringUtil";
import { random } from "../random";
import { rom } from "../rom";
import { flagSet, save, SV, varGet, varSet, type MailData } from "../save";
import { ClearMailStruct, GetMailDataForMon, GiveMailToMon2, MonHasMail, TakeMailFromMon } from "./mail";
import {
  calculateStats, CanMonLearnTMHM, createMon, deleteFirstMoveAndGive, genderFromPersonality, giveMove, levelFromExp, MON_HAS_MAX_MOVES,
  movesLearnedAtLevel, nickname, setDexFlag, speciesName, TryIncrementMonLevel, MON_FEMALE, MON_GENDERLESS, MON_MALE, type Pokemon,
} from "./pokemon";
import { tmhmMove } from "../menus/monProgress";
import { GetLevelUpMovesBySpecies } from "./partyRules";

export type DaycareMon = { mon: Pokemon | null; steps: number; mail?: MailData; mailOtName?: number[]; mailMonName?: number[] };
export type DayCare = { mons: [DaycareMon, DaycareMon]; offspringPersonality: number; stepCounter: number };

const EGG_GENDER_MALE = 0x8000;
const PARENTS_INCOMPATIBLE = 0, PARENTS_LOW_COMPATIBILITY = 20, PARENTS_MED_COMPATIBILITY = 50, PARENTS_MAX_COMPATIBILITY = 70;
const EGG_HATCH_LEVEL = 5;
const JAPANESE_EGG_NICKNAME = [96, 111, 139, 0xff]; // sJapaneseEggNickname "タマゴ"

/** CreateEgg: setup used by script_pokemon_util.c ScriptGiveEgg. */
export function CreateEgg(species: number, setHotSpringsLocation: boolean): Pokemon {
  const egg = createMon(species, EGG_HATCH_LEVEL);
  egg.pokeball = C.ITEM_POKE_BALL;
  egg.nickname = [...JAPANESE_EGG_NICKNAME];
  egg.friendship = rom.species[species].eggCycles;
  egg.metLevel = 0;
  (egg as Pokemon & { language?: number }).language = C.LANGUAGE_JAPANESE;
  if (setHotSpringsLocation) egg.metLocation = C.METLOC_SPECIAL_EGG;
  egg.isEgg = true;
  return egg;
}

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

const POKEMON_NAME_LENGTH = 10;
const MAX_LEVEL = 100;
const DAYCARE_MON_COUNT = 2;
const INHERITED_IV_COUNT = 3;
const NUM_STATS = 6;
const EGG_MOVES_ARRAY_COUNT = 10;
const EGG_MOVES_SPECIES_OFFSET = 20000;
const MAX_MON_MOVES = 4;
const NUM_TECHNICAL_MACHINES = 50, NUM_HIDDEN_MACHINES = 8;

/** struct RecordMixingDayCareMail (link record mixing). */
export type RecordMixingDayCareMail = { holdsItem: boolean[]; numDaycareMons: number };

/** GetBoxMonData(&daycareMon->mon, MON_DATA_SPECIES) != 0; also MON_DATA_SANITY_HAS_SPECIES. */
const hasSpecies = (d: DaycareMon): boolean => !!d.mon?.species;
const genderOf = (mon: Pokemon): number => genderFromPersonality(mon.species, mon.personality);
const symbolBytes = (text: string): number[] => Array.from(encode(text)).filter((b) => b !== EOS);

/** DayCare_GetMonNickname / DayCare_GetBoxMonNickname: copy the nickname into `dest` (StringCopy_Nickname). */
export function DayCare_GetMonNickname(mon: Pokemon, dest: Uint8Array): number {
  return StringCopy_Nickname(dest, nickname(mon));
}
export function DayCare_GetBoxMonNickname(mon: Pokemon, dest: Uint8Array): number {
  return StringCopy_Nickname(dest, nickname(mon));
}
const nicknameBuffer = (mon: Pokemon): Uint8Array => {
  const dest = new Uint8Array(POKEMON_NAME_LENGTH * 2);
  DayCare_GetBoxMonNickname(mon, dest);
  return dest;
};

/** CountPokemonInDaycare */
export function CountPokemonInDaycare(daycare: DayCare): number {
  let count = 0;
  for (let i = 0; i < DAYCARE_MON_COUNT; i++) if (hasSpecies(daycare.mons[i])) count++;
  return count;
}
export const countPokemonInDaycare = (): number => CountPokemonInDaycare(daycare());

/** InitDaycareMailRecordMixing */
export function InitDaycareMailRecordMixing(daycare: DayCare, daycareMail: RecordMixingDayCareMail): void {
  let numDaycareMons = 0;
  for (let i = 0; i < DAYCARE_MON_COUNT; i++) {
    if (hasSpecies(daycare.mons[i])) {
      numDaycareMons++;
      daycareMail.holdsItem[i] = daycare.mons[i].mon!.heldItem !== C.ITEM_NONE;
    } else {
      daycareMail.holdsItem[i] = true;
    }
  }
  daycareMail.numDaycareMons = numDaycareMons;
}

/** Daycare_FindEmptySpot */
function Daycare_FindEmptySpot(daycare: DayCare): number {
  for (let i = 0; i < DAYCARE_MON_COUNT; i++) if (!hasSpecies(daycare.mons[i])) return i;
  return -1;
}

/** StorePokemonInDaycare: `mon` is a party member; the party is compacted after it leaves. */
function StorePokemonInDaycare(mon: Pokemon, daycareMon: DaycareMon): void {
  if (MonHasMail(mon)) {
    daycareMon.mailOtName = [...save.playerName];
    daycareMon.mailMonName = Array.from(nicknameBuffer(mon));
    daycareMon.mail = GetMailDataForMon(mon);
    TakeMailFromMon(mon);
  } else daycareMon.mail = undefined;
  // BoxMonRestorePP: the box form keeps full PP; status and HP are recalculated on withdrawal.
  mon.pp = mon.moves.map((m, i) => (m ? Math.floor(rom.moves[m].pp * (5 + ((mon.ppBonuses >> (i * 2)) & 3)) / 5) : 0));
  daycareMon.mon = mon;
  daycareMon.steps = 0;
  // ZeroMonData + CompactPartySlots + CalculatePlayerPartyCount
  const index = save.party.indexOf(mon);
  if (index >= 0) save.party.splice(index, 1);
}

/** StorePokemonInEmptyDaycareSlot */
function StorePokemonInEmptyDaycareSlot(mon: Pokemon, daycare: DayCare): void {
  const slotId = Daycare_FindEmptySpot(daycare);
  StorePokemonInDaycare(mon, daycare.mons[slotId]);
}

/** ClearDaycareMonMail: the stored OT/mon names and the message. */
function ClearDaycareMonMail(daycareMon: DaycareMon): void {
  daycareMon.mailOtName = undefined;
  daycareMon.mailMonName = undefined;
  daycareMon.mail = undefined;
}

/** ClearDaycareMon */
function ClearDaycareMon(daycareMon: DaycareMon): void {
  daycareMon.mon = null;
  daycareMon.steps = 0;
  ClearDaycareMonMail(daycareMon);
}

/** ClearAllDaycareData */
export function ClearAllDaycareData(daycare: DayCare): void {
  for (let i = 0; i < DAYCARE_MON_COUNT; i++) ClearDaycareMon(daycare.mons[i]);
  daycare.offspringPersonality = 0;
  daycare.stepCounter = 0;
}

/** ShiftDaycareSlots: shifts the second daycare pokemon slot into the first slot. */
function ShiftDaycareSlots(daycare: DayCare): void {
  // This condition is only satisfied when the player takes out the first pokemon from the daycare.
  if (hasSpecies(daycare.mons[1]) && !hasSpecies(daycare.mons[0])) {
    daycare.mons[0].mon = daycare.mons[1].mon;
    daycare.mons[1].mon = null;
    daycare.mons[0].mail = daycare.mons[1].mail;
    daycare.mons[0].mailOtName = daycare.mons[1].mailOtName;
    daycare.mons[0].mailMonName = daycare.mons[1].mailMonName;
    daycare.mons[0].steps = daycare.mons[1].steps;
    daycare.mons[1].steps = 0;
    ClearDaycareMonMail(daycare.mons[1]);
  }
}

/** ApplyDaycareExperience: level up one level at a time, learning the moves of each level. */
function ApplyDaycareExperience(mon: Pokemon): void {
  for (let i = 0; i < MAX_LEVEL; i++) {
    if (!TryIncrementMonLevel(mon)) break;
    // MonTryLearningNewMove: a full moveset forgets its first move
    for (const move of movesLearnedAtLevel(mon.species, mon.level)) {
      if (giveMove(mon, move) === MON_HAS_MAX_MOVES) deleteFirstMoveAndGive(mon, move);
    }
  }
  calculateStats(mon);
}

/** TakeSelectedPokemonFromDaycare */
function TakeSelectedPokemonFromDaycare(daycareMon: DaycareMon): number {
  const mon = daycareMon.mon!;
  stringVars.var1 = nicknameBuffer(mon);
  const species = mon.species;
  if (mon.level !== MAX_LEVEL) {
    mon.exp += daycareMon.steps;
    ApplyDaycareExperience(mon);
  }
  // BoxMonToMon: HP and status are recalculated
  mon.hp = mon.stats[0];
  mon.status = 0;
  save.party.push(mon);
  if (daycareMon.mail?.itemId) {
    GiveMailToMon2(mon, daycareMon.mail);
    ClearDaycareMonMail(daycareMon);
  }
  daycareMon.mon = null;
  daycareMon.steps = 0;
  return species;
}

/** TakeSelectedPokemonMonFromDaycareShiftSlots */
function TakeSelectedPokemonMonFromDaycareShiftSlots(daycare: DayCare, slotId: number): number {
  const species = TakeSelectedPokemonFromDaycare(daycare.mons[slotId]);
  ShiftDaycareSlots(daycare);
  return species;
}

/** GetLevelAfterDaycareSteps */
function GetLevelAfterDaycareSteps(mon: Pokemon, steps: number): number {
  return levelFromExp(mon.species, mon.exp + steps);
}

/** GetNumLevelsGainedFromSteps (u8 result) */
function GetNumLevelsGainedFromSteps(daycareMon: DaycareMon): number {
  const levelBefore = levelFromExp(daycareMon.mon!.species, daycareMon.mon!.exp);
  const levelAfter = GetLevelAfterDaycareSteps(daycareMon.mon!, daycareMon.steps);
  return (levelAfter - levelBefore) & 0xff;
}

/** GetNumLevelsGainedForDaycareMon */
function GetNumLevelsGainedForDaycareMon(daycareMon: DaycareMon): number {
  const numLevelsGained = GetNumLevelsGainedFromSteps(daycareMon);
  stringVars.var2 = intToDecimal(numLevelsGained, STR_CONV_MODE_LEFT_ALIGN, 2);
  stringVars.var1 = nicknameBuffer(daycareMon.mon!);
  return numLevelsGained;
}

/** GetDaycareCostForSelectedMon */
function GetDaycareCostForSelectedMon(daycareMon: DaycareMon): number {
  const numLevelsGained = GetNumLevelsGainedFromSteps(daycareMon);
  stringVars.var1 = nicknameBuffer(daycareMon.mon!);
  const cost = 100 + 100 * numLevelsGained;
  stringVars.var2 = intToDecimal(cost, STR_CONV_MODE_LEFT_ALIGN, 5);
  return cost;
}

/** GetDaycareCostForMon (u16 result) */
function GetDaycareCostForMon(daycare: DayCare, slotId: number): number {
  return GetDaycareCostForSelectedMon(daycare.mons[slotId]) & 0xffff;
}

/** Debug_AddDaycareSteps: debug helper, unused in the shipped game. */
export function Debug_AddDaycareSteps(numSteps: number): void {
  daycare().mons[0].steps += numSteps;
  daycare().mons[1].steps += numSteps;
  route5DaycareMon().steps += numSteps;
}

/** GetEggSpecies: walk the evolution table backwards. */
function GetEggSpecies(species: number): number {
  for (let i = 0; i < 5; i++) {
    let found = false;
    let j: number;
    for (j = 1; j < rom.species.length; j++) {
      if (rom.species[j].evolutions.some(([, , target]) => target === species)) { species = j; found = true; break; }
    }
    if (!found && j === rom.species.length) break;
  }
  return species;
}

/** _TriggerPendingDaycareEgg / _TriggerPendingDaycareMaleEgg (the nature-inheritance code is commented out in the C). */
function _TriggerPendingDaycareEgg(daycare: DayCare): void {
  daycare.offspringPersonality = (random() % 0xfffe) + 1;
  flagSet(C.FLAG_PENDING_DAYCARE_EGG);
}
function _TriggerPendingDaycareMaleEgg(daycare: DayCare): void {
  daycare.offspringPersonality = (random() | EGG_GENDER_MALE) >>> 0;
  flagSet(C.FLAG_PENDING_DAYCARE_EGG);
}
export function TriggerPendingDaycareEgg(): void { _TriggerPendingDaycareEgg(daycare()); }
export function TriggerPendingDaycareMaleEgg(): void { _TriggerPendingDaycareMaleEgg(daycare()); }

/** RemoveIVIndexFromList: removes the selected index and shifts the remaining elements left. */
function RemoveIVIndexFromList(ivs: number[], selectedIv: number): void {
  ivs[selectedIv] = 0xff;
  const temp = ivs.slice(0, NUM_STATS);
  let j = 0;
  for (let i = 0; i < NUM_STATS; i++) if (temp[i] !== 0xff) ivs[j++] = temp[i];
}

/** InheritIVs: three distinct stats, each taken from a random parent. */
function InheritIVs(egg: Pokemon, daycare: DayCare): void {
  const selectedIvs: number[] = [];
  const availableIVs: number[] = [];
  const whichParent: number[] = [];
  for (let i = 0; i < NUM_STATS; i++) availableIVs[i] = i;
  for (let i = 0; i < INHERITED_IV_COUNT; i++) {
    selectedIvs[i] = availableIVs[random() % (NUM_STATS - i)];
    RemoveIVIndexFromList(availableIVs, selectedIvs[i]);
  }
  for (let i = 0; i < INHERITED_IV_COUNT; i++) whichParent[i] = random() % DAYCARE_MON_COUNT;
  // IV order (HP, ATK, DEF, SPEED, SPATK, SPDEF) matches Pokemon.ivs
  for (let i = 0; i < INHERITED_IV_COUNT; i++) egg.ivs[selectedIvs[i]] = daycare.mons[whichParent[i]].mon!.ivs[selectedIvs[i]];
}

/** GetEggMoves: stores the egg moves of the mon's species in `eggMoves` and returns their count. */
function GetEggMoves(pokemon: Pokemon, eggMoves: number[]): number {
  const table = rom.eggMoves;
  let numEggMoves = 0;
  let eggMoveIdx = 0;
  for (let i = 0; i < table.length - 1; i++) {
    if (table[i] === pokemon.species + EGG_MOVES_SPECIES_OFFSET) {
      eggMoveIdx = i + 1;
      break;
    }
  }
  for (let i = 0; i < EGG_MOVES_ARRAY_COUNT; i++) {
    if (table[eggMoveIdx + i] > EGG_MOVES_SPECIES_OFFSET) break;
    eggMoves[i] = table[eggMoveIdx + i];
    numEggMoves++;
  }
  return numEggMoves;
}

/** BuildEggMoveset (the sHatchedEgg* scratch buffers are locals here). */
function BuildEggMoveset(egg: Pokemon, father: Pokemon, mother: Pokemon): void {
  let numSharedParentMoves = 0;
  const finalMoves = [0, 0, 0, 0];
  const eggMoves: number[] = [];
  const fatherMoves = [...father.moves];
  const motherMoves = [...mother.moves];
  const levelUpMoves = GetLevelUpMovesBySpecies(egg.species);
  const numLevelUpMoves = levelUpMoves.length;
  const give = (move: number) => { if (giveMove(egg, move) === MON_HAS_MAX_MOVES) deleteFirstMoveAndGive(egg, move); };
  const numEggMoves = GetEggMoves(egg, eggMoves);
  for (let i = 0; i < MAX_MON_MOVES; i++) {
    if (fatherMoves[i] !== C.MOVE_NONE) {
      for (let j = 0; j < numEggMoves; j++) {
        if (fatherMoves[i] === eggMoves[j]) { give(fatherMoves[i]); break; }
      }
    } else break;
  }
  for (let i = 0; i < MAX_MON_MOVES; i++) {
    if (fatherMoves[i] !== C.MOVE_NONE) {
      for (let j = 0; j < NUM_TECHNICAL_MACHINES + NUM_HIDDEN_MACHINES; j++) {
        if (fatherMoves[i] === tmhmMove(C.ITEM_TM01 + j) && CanMonLearnTMHM(egg, j)) give(fatherMoves[i]);
      }
    }
  }
  for (let i = 0; i < MAX_MON_MOVES; i++) {
    if (fatherMoves[i] === C.MOVE_NONE) break;
    for (let j = 0; j < MAX_MON_MOVES; j++) {
      // The C writes numSharedParentMoves past sHatchedEggFinalMoves[4] when more than 4 pairs match; only the first 4 are read.
      if (fatherMoves[i] === motherMoves[j] && fatherMoves[i] !== C.MOVE_NONE) finalMoves[numSharedParentMoves++] = fatherMoves[i];
    }
  }
  for (let i = 0; i < MAX_MON_MOVES; i++) {
    if (finalMoves[i] === C.MOVE_NONE) break;
    for (let j = 0; j < numLevelUpMoves; j++) {
      if (levelUpMoves[j] !== C.MOVE_NONE && finalMoves[i] === levelUpMoves[j]) { give(finalMoves[i]); break; }
    }
  }
}

/** RemoveEggFromDayCare */
function RemoveEggFromDayCare(daycare: DayCare): void {
  daycare.offspringPersonality = 0;
  daycare.stepCounter = 0;
}

/** AlterEggSpeciesWithIncenseItem: the C edits *species in place; here the new species is returned. */
function AlterEggSpeciesWithIncenseItem(species: number, daycare: DayCare): number {
  if (species === C.SPECIES_WYNAUT || species === C.SPECIES_AZURILL) {
    const motherItem = daycare.mons[0].mon!.heldItem;
    const fatherItem = daycare.mons[1].mon!.heldItem;
    if (species === C.SPECIES_WYNAUT && motherItem !== C.ITEM_LAX_INCENSE && fatherItem !== C.ITEM_LAX_INCENSE) species = C.SPECIES_WOBBUFFET;
    if (species === C.SPECIES_AZURILL && motherItem !== C.ITEM_SEA_INCENSE && fatherItem !== C.ITEM_SEA_INCENSE) species = C.SPECIES_MARILL;
  }
  return species;
}

/** DetermineEggSpeciesAndParentSlots: parentSlots[0] is the mother slot, parentSlots[1] the father slot. */
function DetermineEggSpeciesAndParentSlots(daycare: DayCare, parentSlots: number[]): number {
  const species: number[] = [];
  for (let i = 0; i < DAYCARE_MON_COUNT; i++) {
    species[i] = daycare.mons[i].mon!.species;
    if (species[i] === C.SPECIES_DITTO) {
      parentSlots[0] = i ^ 1;
      parentSlots[1] = i;
    } else if (genderOf(daycare.mons[i].mon!) === MON_FEMALE) {
      parentSlots[0] = i;
      parentSlots[1] = i ^ 1;
    }
  }
  let eggSpecies = GetEggSpecies(species[parentSlots[0]]);
  if (eggSpecies === C.SPECIES_NIDORAN_F && daycare.offspringPersonality & EGG_GENDER_MALE) eggSpecies = C.SPECIES_NIDORAN_M;
  if (eggSpecies === C.SPECIES_ILLUMISE && daycare.offspringPersonality & EGG_GENDER_MALE) eggSpecies = C.SPECIES_VOLBEAT;
  // Make Ditto the "mother" slot if the other daycare mon is male.
  if (species[parentSlots[1]] === C.SPECIES_DITTO && genderOf(daycare.mons[parentSlots[0]].mon!) !== MON_FEMALE) {
    const ditto = parentSlots[1];
    parentSlots[1] = parentSlots[0];
    parentSlots[0] = ditto;
  }
  return eggSpecies;
}

/** SetInitialEggData: the C fills `mon` in place; here the new egg is returned. */
function SetInitialEggData(species: number, daycare: DayCare): Pokemon {
  const personality = (daycare.offspringPersonality | (random() << 16)) >>> 0;
  const mon = createMon(species, EGG_HATCH_LEVEL, { personality });
  mon.pokeball = C.ITEM_POKE_BALL;
  mon.nickname = [...JAPANESE_EGG_NICKNAME];
  mon.friendship = rom.species[species].eggCycles;
  mon.metLevel = 0;
  (mon as Pokemon & { language?: number }).language = C.LANGUAGE_JAPANESE;
  return mon;
}

/** _GiveEggFromDaycare (GiveEggFromDaycare special) */
function _GiveEggFromDaycare(daycare: DayCare): void {
  const parentSlots = [0, 1];
  let species = DetermineEggSpeciesAndParentSlots(daycare, parentSlots);
  species = AlterEggSpeciesWithIncenseItem(species, daycare);
  const egg = SetInitialEggData(species, daycare);
  InheritIVs(egg, daycare);
  BuildEggMoveset(egg, daycare.mons[parentSlots[1]].mon!, daycare.mons[parentSlots[0]].mon!);
  calculateStats(egg);
  egg.isEgg = true;
  save.party.push(egg);
  RemoveEggFromDayCare(daycare);
}
export function giveEggFromDaycare(): void { _GiveEggFromDaycare(daycare()); }

/** IsEggPending */
function IsEggPending(daycare: DayCare): boolean {
  return daycare.offspringPersonality !== 0;
}

/** EggGroupsOverlap: true when the two egg group lists share a group. */
function EggGroupsOverlap(eggGroups1: readonly number[], eggGroups2: readonly number[]): boolean {
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (eggGroups1[i] === eggGroups2[j]) return true;
  return false;
}

/** GetDaycareCompatibilityScore */
function GetDaycareCompatibilityScore(daycare: DayCare): number {
  const eggGroups: number[][] = [];
  const species: number[] = [];
  const trainerIds: number[] = [];
  const genders: number[] = [];
  for (let i = 0; i < DAYCARE_MON_COUNT; i++) {
    const mon = daycare.mons[i].mon!;
    species[i] = mon.species;
    trainerIds[i] = mon.otId;
    genders[i] = genderFromPersonality(species[i], mon.personality);
    eggGroups[i] = [rom.species[species[i]].eggGroups[0], rom.species[species[i]].eggGroups[1]];
  }
  // check unbreedable egg group
  if (eggGroups[0][0] === C.EGG_GROUP_UNDISCOVERED || eggGroups[1][0] === C.EGG_GROUP_UNDISCOVERED) return PARENTS_INCOMPATIBLE;
  // two Ditto can't breed
  if (eggGroups[0][0] === C.EGG_GROUP_DITTO && eggGroups[1][0] === C.EGG_GROUP_DITTO) return PARENTS_INCOMPATIBLE;
  // one parent is Ditto
  if (eggGroups[0][0] === C.EGG_GROUP_DITTO || eggGroups[1][0] === C.EGG_GROUP_DITTO) {
    if (trainerIds[0] === trainerIds[1]) return PARENTS_LOW_COMPATIBILITY;
    return PARENTS_MED_COMPATIBILITY;
  }
  // neither parent is Ditto
  if (genders[0] === genders[1]) return PARENTS_INCOMPATIBLE;
  if (genders[0] === MON_GENDERLESS || genders[1] === MON_GENDERLESS) return PARENTS_INCOMPATIBLE;
  if (!EggGroupsOverlap(eggGroups[0], eggGroups[1])) return PARENTS_INCOMPATIBLE;
  if (species[0] === species[1]) {
    if (trainerIds[0] === trainerIds[1]) return PARENTS_MED_COMPATIBILITY; // same species, same trainer
    return PARENTS_MAX_COMPATIBILITY; // same species, different trainers
  }
  if (trainerIds[0] !== trainerIds[1]) return PARENTS_MED_COMPATIBILITY; // different species, different trainers
  return PARENTS_LOW_COMPATIBILITY; // different species, same trainer
}

/** GetDaycareCompatibilityScoreFromSave */
function GetDaycareCompatibilityScoreFromSave(): number {
  return GetDaycareCompatibilityScore(daycare());
}

/** TryProduceOrHatchEgg: called once per step. */
function TryProduceOrHatchEgg(daycare: DayCare): boolean {
  let validEggs = 0;
  for (let i = 0; i < DAYCARE_MON_COUNT; i++) {
    if (hasSpecies(daycare.mons[i])) { daycare.mons[i].steps++; validEggs++; }
  }
  // Check if an egg should be produced
  if (daycare.offspringPersonality === 0 && validEggs === DAYCARE_MON_COUNT && (daycare.mons[1].steps & 0xff) === 0xff) {
    const compatibility = GetDaycareCompatibilityScore(daycare);
    if (compatibility > Math.floor((random() * 100) / 0xffff)) TriggerPendingDaycareEgg();
  }
  // Hatch Egg
  daycare.stepCounter = (daycare.stepCounter + 1) & 0xff;
  if (daycare.stepCounter === 255) {
    for (let i = 0; i < save.party.length; i++) {
      const mon = save.party[i];
      if (!mon.isEgg) continue;
      // MON_DATA_SANITY_IS_BAD_EGG has no counterpart: the party never holds bad eggs.
      let steps = mon.friendship;
      if (steps !== 0) {
        steps -= 1;
        mon.friendship = steps;
      } else { // hatch the egg
        varSet(SV.x8004, i);
        return true;
      }
    }
  }
  return false; // no hatching
}

/** ShouldEggHatch */
export function shouldEggHatch(): boolean {
  const r5 = route5DaycareMon();
  if (hasSpecies(r5)) r5.steps++;
  return TryProduceOrHatchEgg(daycare());
}

/** _GetDaycareMonNicknames: gStringVar1/2 = nicknames, gStringVar3 = first mon's trainer name. */
function _GetDaycareMonNicknames(daycare: DayCare): void {
  if (hasSpecies(daycare.mons[0])) {
    stringVars.var1 = nicknameBuffer(daycare.mons[0].mon!);
    stringVars.var3 = Uint8Array.from(daycare.mons[0].mon!.otName);
  }
  if (hasSpecies(daycare.mons[1])) stringVars.var2 = nicknameBuffer(daycare.mons[1].mon!);
}

/** NameHasGenderSymbol */
export function NameHasGenderSymbol(name: ArrayLike<number>, genderRatio: number): boolean {
  let male = 0, female = 0;
  for (let i = 0; name[i] !== EOS; i++) {
    if (name[i] === C.CHAR_MALE) male++;
    if (name[i] === C.CHAR_FEMALE) female++;
  }
  if (genderRatio === MON_MALE && male !== 0 && female === 0) return true;
  if (genderRatio === MON_FEMALE && female !== 0 && male === 0) return true;
  return false;
}

/** AppendGenderSymbol: gText_MaleSymbol4/FemaleSymbol4 are ♂/♀; gText_GenderlessSymbol is empty. Returns the end offset. */
function AppendGenderSymbol(name: Uint8Array, gender: number): number {
  if (gender === MON_MALE) {
    if (!NameHasGenderSymbol(name, MON_MALE)) return StringAppend(name, [...symbolBytes("♂"), EOS]);
  } else if (gender === MON_FEMALE) {
    if (!NameHasGenderSymbol(name, MON_FEMALE)) return StringAppend(name, [...symbolBytes("♀"), EOS]);
  }
  return StringAppend(name, [EOS]);
}

/** AppendMonGenderSymbol */
function AppendMonGenderSymbol(name: Uint8Array, boxMon: Pokemon): number {
  return AppendGenderSymbol(name, genderOf(boxMon));
}

/** GetDaycareLevelMenuText: both nicknames with their gender symbol, then EXIT. */
export function GetDaycareLevelMenuText(daycare: DayCare, dest: Uint8Array): void {
  const sNewLineText = [CHAR_NEWLINE, EOS];
  const monNames: Uint8Array[] = [];
  dest[0] = EOS;
  for (let i = 0; i < DAYCARE_MON_COUNT; i++) {
    monNames[i] = new Uint8Array(POKEMON_NAME_LENGTH * 2 + 4);
    DayCare_GetBoxMonNickname(daycare.mons[i].mon!, monNames[i]);
    AppendMonGenderSymbol(monNames[i], daycare.mons[i].mon!);
  }
  StringCopy(dest, monNames[0]);
  StringAppend(dest, sNewLineText);
  StringAppend(dest, monNames[1]);
  StringAppend(dest, sNewLineText);
  StringAppend(dest, rom.text("gOtherText_Exit"));
}

/** GetDaycareLevelMenuLevelText: "Lv" + level after the stored steps, one line per slot. */
export function GetDaycareLevelMenuLevelText(daycare: DayCare, dest: Uint8Array): void {
  const sNewLineText = [CHAR_NEWLINE, EOS];
  dest[0] = EOS;
  for (let i = 0; i < DAYCARE_MON_COUNT; i++) {
    StringAppend(dest, rom.text("gText_Lv"));
    const level = GetLevelAfterDaycareSteps(daycare.mons[i].mon!, daycare.mons[i].steps);
    StringAppend(dest, intToDecimal(level, STR_CONV_MODE_LEFT_ALIGN, 3));
    StringAppend(dest, sNewLineText);
  }
}

/** CreatedHatchedMon: the hatched mon built from the egg's species, moves, personality, IVs, markings and Pokérus. */
function CreatedHatchedMon(egg: Pokemon): Pokemon {
  const temp = createMon(egg.species, EGG_HATCH_LEVEL, { personality: egg.personality });
  temp.moves = [...egg.moves];
  temp.ivs = [...egg.ivs];
  temp.markings = egg.markings;
  temp.friendship = 120;
  temp.pokerus = egg.pokerus;
  return temp;
}

/** AddHatchedMonToParty; `mapNameID` is GetCurrentRegionMapSectionId(), supplied by the caller. */
export function AddHatchedMonToParty(id: number, mapNameID: number): void {
  const mon = CreatedHatchedMon(save.party[id]);
  mon.isEgg = false;
  mon.nickname = Array.from(speciesName(mon.species));
  setDexFlag(mon.species, true);
  stringVars.var1 = nicknameBuffer(mon);
  mon.pokeball = C.ITEM_POKE_BALL;
  mon.metLevel = 0;
  mon.metLocation = mapNameID;
  mon.pp = mon.moves.map((m) => (m ? rom.moves[m].pp : 0)); // MonRestorePP
  calculateStats(mon);
  mon.hp = mon.stats[0];
  save.party[id] = mon;
}
export const hatchPartyEgg = AddHatchedMonToParty;

/** BufferDayCareMonReceivedMail: true when the stored mail was written by another mon or trainer. */
function BufferDayCareMonReceivedMail(daycare: DayCare, daycareId: number): boolean {
  const daycareMon = daycare.mons[daycareId];
  const nick = nicknameBuffer(daycareMon.mon!);
  // A daycare saved before the OT/mon names were kept has nothing to compare against.
  if (!daycareMon.mailOtName || !daycareMon.mailMonName) return false;
  if (daycareMon.mail && daycareMon.mail.itemId !== C.ITEM_NONE
    && (StringCompare(nick, daycareMon.mailMonName) !== 0 || StringCompare(save.playerName, daycareMon.mailOtName) !== 0)) {
    stringVars.var1 = nick;
    stringVars.var2 = Uint8Array.from(daycareMon.mailOtName);
    stringVars.var3 = Uint8Array.from(daycareMon.mailMonName);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- script specials

// C special names. Bodies follow daycare.c; `gSpecialVar_0x8004` is the party index (or daycare slot) operand.
const GetCursorSelectionMonId = (): number => varGet(SV.x8004);

export const DAYCARE_SPECIALS: Record<string, () => number | void> = {
  GetDaycareState: () => {
    if (IsEggPending(daycare())) return C.DAYCARE_EGG_WAITING;
    const numMons = CountPokemonInDaycare(daycare());
    if (numMons !== 0) return numMons + 1; // DAYCARE_ONE_MON or DAYCARE_TWO_MONS
    return C.DAYCARE_NO_MONS;
  },
  GetDaycarePokemonCount: () => CountPokemonInDaycare(daycare()),
  StoreSelectedPokemonInDaycare: () => {
    const mon = save.party[GetCursorSelectionMonId()];
    if (mon) StorePokemonInEmptyDaycareSlot(mon, daycare());
  },
  TakePokemonFromDaycare: () => TakeSelectedPokemonMonFromDaycareShiftSlots(daycare(), varGet(SV.x8004)),
  GetDaycareCost: () => { varSet(SV.x8005, GetDaycareCostForMon(daycare(), varGet(SV.x8004))); },
  GetNumLevelsGainedFromDaycare: () => {
    const slot = daycare().mons[varGet(SV.x8004)];
    if (hasSpecies(slot)) return GetNumLevelsGainedForDaycareMon(slot);
    return 0;
  },
  GetDaycareMonNicknames: () => { _GetDaycareMonNicknames(daycare()); },
  GetSelectedMonNicknameAndSpecies: () => {
    const mon = save.party[GetCursorSelectionMonId()];
    if (!mon) return 0;
    stringVars.var1 = nicknameBuffer(mon);
    return mon.species;
  },
  SetDaycareCompatibilityString: () => {
    const relationshipScore = GetDaycareCompatibilityScoreFromSave();
    let whichString = 0;
    if (relationshipScore === PARENTS_INCOMPATIBLE) whichString = 3;
    if (relationshipScore === PARENTS_LOW_COMPATIBILITY) whichString = 2;
    if (relationshipScore === PARENTS_MED_COMPATIBILITY) whichString = 1;
    if (relationshipScore === PARENTS_MAX_COMPATIBILITY) whichString = 0;
    stringVars.var4 = rom.text(["gDaycareText_GetAlongVeryWell", "gDaycareText_GetAlong", "gDaycareText_DontLikeOther", "gDaycareText_PlayOther"][whichString]);
  },
  GiveEggFromDaycare: () => { _GiveEggFromDaycare(daycare()); },
  RejectEggFromDayCare: () => { RemoveEggFromDayCare(daycare()); },
  PutMonInRoute5Daycare: () => {
    const mon = save.party[GetCursorSelectionMonId()];
    if (mon) StorePokemonInDaycare(mon, route5DaycareMon());
  },
  GetCostToWithdrawRoute5DaycareMon: () => { varSet(SV.x8005, GetDaycareCostForSelectedMon(route5DaycareMon()) & 0xffff); },
  IsThereMonInRoute5Daycare: () => (hasSpecies(route5DaycareMon()) ? 1 : 0),
  GetNumLevelsGainedForRoute5DaycareMon: () => GetNumLevelsGainedForDaycareMon(route5DaycareMon()),
  TakePokemonFromRoute5Daycare: () => TakeSelectedPokemonFromDaycare(route5DaycareMon()),
  DaycareMonReceivedMail: () => (BufferDayCareMonReceivedMail(daycare(), varGet(SV.x8004)) ? 1 : 0),
};

/** GetDaycareLevelMenuText rows: nickname + gender symbol (AppendMonGenderSymbol) and the level after the stored steps. */
export function daycareLevelMenuRows(): Array<{ name: Uint8Array; level: number }> {
  return daycare().mons.map((d) => {
    const name = new Uint8Array(POKEMON_NAME_LENGTH * 2 + 4);
    DayCare_GetBoxMonNickname(d.mon!, name);
    const end = AppendMonGenderSymbol(name, d.mon!);
    return { name: name.slice(0, end + 1), level: GetLevelAfterDaycareSteps(d.mon!, d.steps) };
  });
}
