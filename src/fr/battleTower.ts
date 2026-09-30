// battle_tower.c — SaveBlock2 battle tower state, party rules, records and battle setup.
// The trainer/class tables are empty in this FireRed C source; they intentionally remain empty.

import * as C from "./generated/constants";
import { cdata } from "./hw/assets";
import { StringAppend } from "./generated/stringUtil";
import { ConvertEasyChatWordsToString, EC_DoesEasyChatStringFitOnLine } from "./easyChat";
import { random } from "./random";
import { encode, EOS, stringVars, copy } from "./gba/charmap";
import { CopyItemName } from "./hw/menuHelpers";
import { addBagItem } from "./pokemon/items";
import { GetSetPokedexFlag } from "./pokemon/mon_extra";
import { speciesName } from "./pokemon/pokemon";
import { CreateMonWithEVSpread, CreateBattleTowerMon, GetMonData, gEnemyParty, SetMonData, SetMonMoveSlot, ZeroEnemyPartyMons, type BattleTowerPokemon } from "./pokemon/mon";
import { SpeciesToNationalPokedexNum, playerMon, ConvertPokemonToBattleTowerPokemon } from "./pokemon/mon";
import { save, newBattleTowerData, SetGameStat, IncrementGameStat, varGet, varSet, SV, type BattleTowerDataSave, type BattleTowerRecordSave, type BattleTowerEReaderTrainerSave } from "./save";
import { BattleSetup_GetBattleTowerBattleTransition } from "./battle/battleSetup";
import { G, gBattleMons } from "./battle/globals";
import { B_OUTCOME_DREW, B_OUTCOME_WON } from "./battle/battleSetup";
import { gSelectedOrderFromParty } from "./partyMenu";
import { ReducePlayerPartyToThree } from "./pokemon/scriptPokemonUtil";
import type { Game } from "./game";

const sText_100 = encode("100");
const sBattleTowerHeldItems = (): number[] => cdata("battle_tower", "sBattleTowerHeldItems");
const sBattleTowerTrainers = (): Array<{ trainerClass: number; name: number[]; teamFlags: number; greeting: number[] }> => cdata("battle_tower", "sBattleTowerTrainers");
const gBattleTowerLevel50Mons = (): Array<{ species: number; heldItem: number; teamFlags: number; moves: number[]; evSpread: number; nature: number }> => cdata("battle_tower", "gBattleTowerLevel50Mons");
const gBattleTowerLevel100Mons = (): Array<{ species: number; heldItem: number; teamFlags: number; moves: number[]; evSpread: number; nature: number }> => cdata("battle_tower", "gBattleTowerLevel100Mons");
const gBattleTowerBannedSpecies = (): number[] => cdata("battle_tower", "gBattleTowerBannedSpecies");
const sShortStreakPrizes = (): number[] => cdata("battle_tower", "sShortStreakPrizes");
const sLongStreakPrizes = (): number[] => cdata("battle_tower", "sLongStreakPrizes");

let sSpecialVar_0x8004_Copy = 0;
let ewram160FB = 0;

const tower = (): BattleTowerDataSave => save.battleTower;
const setResult = (value: number) => { varSet(SV.RESULT, value); };

function bytesToU32(bytes: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) out.push(((bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8) | ((bytes[i + 2] ?? 0) << 16) | ((bytes[i + 3] ?? 0) << 24)) >>> 0);
  return out;
}

function halfwordsToU32(halfwords: readonly number[]): number[] {
  const bytes: number[] = [];
  for (const halfword of halfwords) bytes.push(halfword & 0xff, (halfword >>> 8) & 0xff);
  return bytesToU32(bytes);
}

function battleTowerPokemonWords(mon: BattleTowerPokemon): number[] {
  const words: number[] = [mon.species & 0xffff, mon.heldItem & 0xffff, ...mon.moves.slice(0, 4).map((x) => x & 0xffff),
    ((mon.level & 0xff) | ((mon.ppBonuses & 0xff) << 8) | ((mon.hpEV & 0xff) << 16) | ((mon.attackEV & 0xff) << 24)) >>> 0,
    ((mon.defenseEV & 0xff) | ((mon.speedEV & 0xff) << 8) | ((mon.spAttackEV & 0xff) << 16) | ((mon.spDefenseEV & 0xff) << 24)) >>> 0,
    mon.otId >>> 0,
    ((mon.hpIV & 31) | ((mon.attackIV & 31) << 5) | ((mon.defenseIV & 31) << 10) | ((mon.speedIV & 31) << 15)
      | ((mon.spAttackIV & 31) << 20) | ((mon.spDefenseIV & 31) << 25) | ((mon.abilityNum & 1) << 31)) >>> 0,
    mon.personality >>> 0];
  const nickname = mon.nickname.slice(0, C.POKEMON_NAME_LENGTH + 1);
  while (nickname.length < C.POKEMON_NAME_LENGTH + 1) nickname.push(EOS);
  return [...halfwordsToU32(words.slice(0, 6)), ...words.slice(6), ...bytesToU32([...nickname, mon.friendship & 0xff])];
}

function battleTowerRecordWords(record: BattleTowerRecordSave): number[] {
  const name = record.name.slice(0, C.PLAYER_NAME_LENGTH + 1); while (name.length < C.PLAYER_NAME_LENGTH + 1) name.push(EOS);
  const trainerId = record.trainerId.slice(0, C.TRAINER_ID_LENGTH); while (trainerId.length < C.TRAINER_ID_LENGTH) trainerId.push(0);
  const greeting = record.greeting.slice(0, C.EASY_CHAT_BATTLE_WORDS_COUNT); while (greeting.length < C.EASY_CHAT_BATTLE_WORDS_COUNT) greeting.push(0);
  return [((record.battleTowerLevelType & 0xff) | ((record.trainerClass & 0xff) << 8) | ((record.winStreak & 0xffff) << 16)) >>> 0,
    ...bytesToU32(name), ...bytesToU32(trainerId), ...halfwordsToU32(greeting), ...record.party.flatMap(battleTowerPokemonWords)];
}

function eReaderTrainerWords(trainer: BattleTowerEReaderTrainerSave): number[] {
  const name = trainer.name.slice(0, 8); while (name.length < 8) name.push(EOS);
  const trainerId = trainer.trainerId.slice(0, 4); while (trainerId.length < 4) trainerId.push(0);
  const words = [((trainer.unk0 & 0xff) | ((trainer.trainerClass & 0xff) << 8) | ((trainer.winStreak & 0xffff) << 16)) >>> 0,
    ...bytesToU32(name), ...bytesToU32(trainerId), ...halfwordsToU32(trainer.greeting), ...halfwordsToU32(trainer.farewellPlayerLost),
    ...halfwordsToU32(trainer.farewellPlayerWon), ...trainer.party.flatMap(battleTowerPokemonWords)];
  return words;
}

/** battle_tower.c GetCurrentBattleTowerWinStreak. */
export function GetCurrentBattleTowerWinStreak(battleTowerLevelType: number): number {
  const d = tower();
  const winStreak = (((d.curStreakChallengesNum[battleTowerLevelType]! - 1) * 7 - 1) + d.curChallengeBattleNum[battleTowerLevelType]!) & 0xffff;
  return winStreak > 9999 ? 9999 : winStreak;
}

/** battle_tower.c ResetBattleTowerStreak. */
function ResetBattleTowerStreak(levelType: number): void {
  tower().var_4AE[levelType] = 0;
  tower().curChallengeBattleNum[levelType] = 1;
  tower().curStreakChallengesNum[levelType] = 1;
}

/** battle_tower.c SetBattleTowerRecordChecksum: checksum the exact C byte layout. */
function SetBattleTowerRecordChecksum(record: BattleTowerRecordSave): void {
  record.checksum = battleTowerRecordWords(record).reduce((sum, word) => (sum + word) >>> 0, 0);
}

/** battle_tower.c ClearBattleTowerRecord. */
function ClearBattleTowerRecord(record: BattleTowerRecordSave): void {
  Object.assign(record, {
    battleTowerLevelType: 0, trainerClass: 0, winStreak: 0,
    name: new Array(C.PLAYER_NAME_LENGTH + 1).fill(0), trainerId: new Array(C.TRAINER_ID_LENGTH).fill(0),
    greeting: new Array(C.EASY_CHAT_BATTLE_WORDS_COUNT).fill(0), checksum: 0,
  });
  record.party = record.party.map(() => ({ species: 0, heldItem: 0, moves: [0, 0, 0, 0], level: 0, ppBonuses: 0,
    hpEV: 0, attackEV: 0, defenseEV: 0, speedEV: 0, spAttackEV: 0, spDefenseEV: 0, otId: 0, hpIV: 0, attackIV: 0,
    defenseIV: 0, speedIV: 0, spAttackIV: 0, spDefenseIV: 0, abilityNum: 0, personality: 0,
    nickname: new Array(C.POKEMON_NAME_LENGTH + 1).fill(0), friendship: 0 }));
}

/** battle_tower.c ValidateBattleTowerRecordChecksums. */
function ValidateBattleTowerRecordChecksums(): void {
  const d = tower();
  for (const record of [d.playerRecord, ...d.records]) {
    const expected = record.checksum >>> 0;
    const copy = { ...record };
    SetBattleTowerRecordChecksum(copy);
    if (expected !== copy.checksum) ClearBattleTowerRecord(record);
  }
}

/** BattleTowerMapScript2. */
export function BattleTowerMapScript2(): void {
  const d = tower();
  let count = 0;
  for (let levelType = 0; levelType < 2; levelType++) {
    switch (d.var_4AE[levelType]) {
      default:
      case 0: ResetBattleTowerStreak(levelType); if (count === 0) varSet(C.VAR_TEMP_0, 5); break;
      case 1: ResetBattleTowerStreak(levelType); varSet(C.VAR_TEMP_0, C.BTSPECIAL_RESULT_SAVE_SCUM); count++; break;
      case 3: break;
      case 4: varSet(C.VAR_TEMP_0, C.BTSPECIAL_RESULT_WON7); count++; break;
      case 5: varSet(C.VAR_TEMP_0, C.BTSPECIAL_RESULT_LOST); count++; break;
      case 6: break;
      case 2: varSet(C.VAR_TEMP_0, C.BTSPECIAL_RESULT_QUICKSAVE); count++; break;
    }
  }
  if (d.var_4AE[0] === 3 && d.var_4AE[1] === 3) varSet(C.VAR_TEMP_0, C.BTSPECIAL_RESULT_INACTIVE);
  ValidateBattleTowerRecordChecksums();
}

/** CheckMonBattleTowerBanlist. */
function CheckMonBattleTowerBanlist(species: number, heldItem: number, _hp: number, battleTowerLevelType: number, monLevel: number,
  validPartySpecies: number[], validPartyHeldItems: number[]): boolean {
  if (species === C.SPECIES_EGG || species === C.SPECIES_NONE) return false;
  if (gBattleTowerBannedSpecies().includes(species)) return false;
  if (battleTowerLevelType === 0 && monLevel > 50) return false;
  if (validPartySpecies.includes(species)) return false;
  if (heldItem !== C.ITEM_NONE && validPartyHeldItems.includes(heldItem)) return false;
  validPartySpecies.push(species); validPartyHeldItems.push(heldItem);
  return true;
}

/** AppendBattleTowerBannedSpeciesName. */
function AppendBattleTowerBannedSpeciesName(species: number, count: number): number {
  if (GetSetPokedexFlag(SpeciesToNationalPokedexNum(species), C.FLAG_GET_CAUGHT)) {
    if (count === 0) StringAppend(stringVars.var1, encode("  "));
    count++;
    StringAppend(stringVars.var1, speciesName(species));
    switch (count) {
      case 2: StringAppend(stringVars.var1, encode("\n")); break;
      case 5: case 8: case 11: StringAppend(stringVars.var1, encode("\n")); break;
      default: StringAppend(stringVars.var1, encode("  ")); break;
    }
  }
  return count;
}

/** CheckPartyBattleTowerBanlist. */
export function CheckPartyBattleTowerBanlist(): void {
  const validPartySpecies: number[] = [], validPartyHeldItems: number[] = [];
  const d = tower();
  for (let i = 0; i < C.PARTY_SIZE; i++) {
    const mon = playerMon(i);
    CheckMonBattleTowerBanlist(GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG), GetMonData(mon, C.MON_DATA_HELD_ITEM),
      GetMonData(mon, C.MON_DATA_HP), varGet(SV.RESULT), GetMonData(mon, C.MON_DATA_LEVEL), validPartySpecies, validPartyHeldItems);
  }
  if (validPartySpecies.length < 3) {
    stringVars.var1 = new Uint8Array([EOS]);
    varSet(SV.x8004, 1);
    let count = 0;
    for (const species of gBattleTowerBannedSpecies()) if (species !== 0xffff) count = AppendBattleTowerBannedSpeciesName(species, count);
    const end = stringVars.var1.findIndex((x) => x === EOS);
    if (end > 0) stringVars.var1[end - 1] = EOS;
    StringAppend(stringVars.var1, encode(" is"));
  } else {
    varSet(SV.x8004, 0);
    d.battleTowerLevelType = varGet(SV.RESULT) & 1;
  }
}

/** ShouldBattleEReaderTrainer. FireRed's ValidateEReaderTrainer rejects its initial empty record. */
function ShouldBattleEReaderTrainer(levelType: number, winStreak: number): boolean {
  ValidateEReaderTrainer();
  const d = tower();
  if (varGet(SV.RESULT) !== 0 || d.ereaderTrainer.winStreak !== winStreak) return false;
  const teamLevel = levelType !== 0 ? 100 : 50;
  const species: number[] = [], heldItems: number[] = [];
  for (const mon of d.ereaderTrainer.party) {
    if (mon.level !== teamLevel) return false;
    CheckMonBattleTowerBanlist(mon.species, mon.heldItem, 1, levelType, mon.level, species, heldItems);
  }
  return species.length === 3;
}

/** ChooseSpecialBattleTowerTrainer. */
function ChooseSpecialBattleTowerTrainer(): boolean {
  const d = tower();
  const levelType = d.battleTowerLevelType;
  const winStreak = GetCurrentBattleTowerWinStreak(levelType);
  if (ShouldBattleEReaderTrainer(levelType, winStreak)) { d.battleTowerTrainerId = C.BATTLE_TOWER_EREADER_TRAINER_ID; return true; }
  const candidates: number[] = [];
  d.records.forEach((record, index) => {
    let hasData = false;
    const expected = record.checksum >>> 0;
    const copy = { ...record };
    SetBattleTowerRecordChecksum(copy);
    hasData = battleTowerRecordWords(record).some((word) => word !== 0);
    if (record.winStreak === winStreak && record.battleTowerLevelType === levelType && hasData && expected === copy.checksum) candidates.push(index);
  });
  if (!candidates.length) return false;
  d.battleTowerTrainerId = candidates[random() % candidates.length]! + C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID;
  return true;
}

/** UpdateOrInsertReceivedBattleTowerRecord; obsolete Record Mixing entry point retained from R/S. */
function UpdateOrInsertReceivedBattleTowerRecord(record: BattleTowerRecordSave): void {
  const d = tower();
  let index = 0;
  for (; index < d.records.length; index++) {
    let j = 0;
    for (; j < 4; j++) if (d.records[index]!.trainerId[j] !== record.trainerId[j]) break;
    let k = 0;
    if (j === 4) {
      for (; k < 7; k++) {
        if (d.records[index]!.name[j] !== record.name[j]) break;
        if (record.name[j] === EOS) { k = 7; break; }
      }
    }
    if (k === 7) break;
  }
  if (index < d.records.length) { d.records[index] = structuredClone(record); return; }
  index = d.records.findIndex((entry) => entry.winStreak === 0);
  if (index >= 0) { d.records[index] = structuredClone(record); return; }

  let lowest: number[] = [d.records[0]!.winStreak];
  let indices: number[] = [0];
  for (index = 1; index < d.records.length; index++) {
    let j = 0;
    for (; j < lowest.length; j++) {
      if (d.records[index]!.winStreak < lowest[j]!) {
        lowest = [d.records[index]!.winStreak]; indices = [index]; break;
      }
      if (d.records[index]!.winStreak > lowest[j]!) break;
    }
    if (j === lowest.length) { lowest.push(d.records[index]!.winStreak); indices.push(index); }
  }
  const replace = indices[random() % indices.length]!;
  d.records[replace] = structuredClone(record);
}

/** ChooseNextBattleTowerTrainer. The base-game trainer table is empty in C; selection retains its C bounds. */
export function ChooseNextBattleTowerTrainer(): void {
  const d = tower();
  const levelType = d.battleTowerLevelType;
  if (ChooseSpecialBattleTowerTrainer()) {
    SetBattleTowerTrainerGfxId(d.battleTowerTrainerId);
    d.battledTrainerIds[d.curChallengeBattleNum[levelType]! - 1] = d.battleTowerTrainerId;
    return;
  }
  const challenge = d.curChallengeBattleNum[levelType]!;
  const streak = d.curStreakChallengesNum[levelType]!;
  let trainerId: number;
  do {
    if (streak <= 7) {
      trainerId = challenge === 7
        ? (((random() & 0xff) * 5) >> 7) + (streak - 1) * 10 + 20
        : (((random() & 0xff) * 5) >> 6) + (streak - 1) * 10;
    } else trainerId = (((random() & 0xff) * 30) >> 8) + 70;
  } while (d.battledTrainerIds.slice(0, challenge - 1).includes(trainerId));
  d.battleTowerTrainerId = trainerId;
  SetBattleTowerTrainerGfxId(trainerId);
  if (challenge < 7) d.battledTrainerIds[challenge - 1] = trainerId;
}

function SetBattleTowerTrainerGfxId(_trainerClass: number): void { varSet(C.VAR_OBJ_GFX_ID_0, C.OBJ_EVENT_GFX_YOUNGSTER); }
export function SetEReaderTrainerGfxId(): void { SetBattleTowerTrainerGfxId(C.BATTLE_TOWER_EREADER_TRAINER_ID); }

/** Task_WaitBT: transition/task scheduling is owned by the browser battle host. */
function Task_WaitBT(game: Game, request: Parameters<Game["startBattle"]>[0]): void { game.startBattle(request); }

/** GetBattleTowerTrainerFrontSpriteId. */
export function GetBattleTowerTrainerFrontSpriteId(): number {
  const d = tower();
  const facilityClass = d.battleTowerTrainerId === C.BATTLE_TOWER_EREADER_TRAINER_ID ? d.ereaderTrainer.trainerClass
    : d.battleTowerTrainerId < C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID ? (sBattleTowerTrainers()[d.battleTowerTrainerId]?.trainerClass ?? 0)
      : (d.records[d.battleTowerTrainerId - C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID]?.trainerClass ?? 0);
  return cdata<number[]>("pokemon", "gFacilityClassToPicIndex")[facilityClass] ?? 0;
}

/** GetBattleTowerTrainerClassNameId. */
export function GetBattleTowerTrainerClassNameId(): number {
  const d = tower();
  const facilityClass = d.battleTowerTrainerId === C.BATTLE_TOWER_EREADER_TRAINER_ID ? d.ereaderTrainer.trainerClass
    : d.battleTowerTrainerId >= C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID ? (d.records[d.battleTowerTrainerId - C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID]?.trainerClass ?? 0)
      : (sBattleTowerTrainers()[d.battleTowerTrainerId]?.trainerClass ?? 0);
  return cdata<number[]>("pokemon", "gFacilityClassToTrainerClass")[facilityClass] ?? 0;
}

/** GetBattleTowerTrainerName. */
export function GetBattleTowerTrainerName(dest: number[] | Uint8Array = stringVars.var1): void {
  const d = tower();
  const source = d.battleTowerTrainerId === C.BATTLE_TOWER_EREADER_TRAINER_ID ? d.ereaderTrainer.name
    : d.battleTowerTrainerId < C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID ? (sBattleTowerTrainers()[d.battleTowerTrainerId]?.name ?? [])
      : (d.records[d.battleTowerTrainerId - C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID]?.name ?? []);
  let i = 0;
  const length = d.battleTowerTrainerId < C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID && d.battleTowerTrainerId !== C.BATTLE_TOWER_EREADER_TRAINER_ID ? 3 : 7;
  for (; i < length; i++) dest[i] = source[i] ?? EOS;
  dest[i] = EOS;
}

/** FillBattleTowerTrainerParty. */
function FillBattleTowerTrainerParty(): void {
  const d = tower(); ZeroEnemyPartyMons();
  if (d.battleTowerTrainerId === C.BATTLE_TOWER_EREADER_TRAINER_ID) {
    d.ereaderTrainer.party.forEach((mon, i) => CreateBattleTowerMon(gEnemyParty[i]!, mon)); return;
  }
  if (d.battleTowerTrainerId >= C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID) {
    d.records[d.battleTowerTrainerId - C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID]!.party.forEach((mon, i) => CreateBattleTowerMon(gEnemyParty[i]!, mon)); return;
  }
  const trainer = sBattleTowerTrainers()[d.battleTowerTrainerId];
  if (!trainer) return;
  const levelType = d.battleTowerLevelType;
  const mons = levelType ? gBattleTowerLevel100Mons() : gBattleTowerLevel50Mons();
  let fixedIV = 6, offset = 0, pool = 60;
  if (d.battleTowerTrainerId >= 80 && d.battleTowerTrainerId < C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID) { fixedIV = 31; offset = 200; pool = 100; }
  else if (d.battleTowerTrainerId >= 70) { fixedIV = 31; offset = 180; }
  else if (d.battleTowerTrainerId >= 60) { fixedIV = 21; offset = 150; }
  else if (d.battleTowerTrainerId >= 50) { fixedIV = 18; offset = 120; }
  else if (d.battleTowerTrainerId >= 40) { fixedIV = 15; offset = 90; }
  else if (d.battleTowerTrainerId >= 30) { fixedIV = 12; offset = 60; }
  else if (d.battleTowerTrainerId >= 20) { fixedIV = 9; offset = 30; }
  const teamFlags = trainer.teamFlags, chosen: number[] = [];
  let friendship = 255;
  for (let partyIndex = 0; partyIndex < 3;) {
    const index = Math.trunc((random() & 0xff) * pool / 256) + offset;
    const monData = mons[index]; if (!monData || (teamFlags !== 0 && (monData.teamFlags & teamFlags) !== teamFlags)) continue;
    if (chosen.some((chosenIndex) => mons[chosenIndex]!.species === monData.species || (mons[chosenIndex]!.heldItem !== 0 && mons[chosenIndex]!.heldItem === monData.heldItem) || chosenIndex === index)) continue;
    chosen.push(index);
    const mon = gEnemyParty[partyIndex]!;
    CreateMonWithEVSpread(mon, monData.species, levelType ? 100 : 50, fixedIV, monData.evSpread);
    monData.moves.forEach((move, i) => { SetMonMoveSlot(mon, move, i); if (move === C.MOVE_FRUSTRATION) friendship = 0; });
    SetMonData(mon, C.MON_DATA_FRIENDSHIP, friendship);
    SetMonData(mon, C.MON_DATA_HELD_ITEM, sBattleTowerHeldItems()[monData.heldItem] ?? C.ITEM_NONE);
    partyIndex++;
  }
}

/** BufferBattleTowerTrainerMessage. */
function BufferBattleTowerTrainerMessage(greeting: readonly number[]): void {
  if (EC_DoesEasyChatStringFitOnLine(greeting, 3, 2, 18)) {
    const text = encode(ConvertEasyChatWordsToString(greeting, 2, 3));
    const first = text.indexOf(C.CHAR_NEWLINE), second = text.indexOf(C.CHAR_NEWLINE, first + 1);
    if (second >= 0) text[second] = C.CHAR_PROMPT_SCROLL;
    stringVars.var4 = text;
  } else stringVars.var4 = encode(ConvertEasyChatWordsToString(greeting, 3, 2));
}

/** PrintBattleTowerTrainerGreeting. */
export function PrintBattleTowerTrainerGreeting(): void {
  const d = tower();
  const greeting = d.battleTowerTrainerId === C.BATTLE_TOWER_EREADER_TRAINER_ID ? d.ereaderTrainer.greeting
    : d.battleTowerTrainerId < C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID ? sBattleTowerTrainers()[d.battleTowerTrainerId]?.greeting ?? []
      : d.records[d.battleTowerTrainerId - C.BATTLE_TOWER_RECORD_MIXING_TRAINER_BASE_ID]?.greeting ?? [];
  BufferBattleTowerTrainerMessage(greeting);
}

/** SetBattleTowerProperty. */
export function SetBattleTowerProperty(): void {
  const d = tower(), mode = d.battleTowerLevelType, value = varGet(SV.x8005);
  switch (varGet(SV.x8004)) {
    case 0: ewram160FB = d.var_4AE[mode]!; d.var_4AE[mode] = value & 0xff; break;
    case 1: d.battleTowerLevelType = value & 1; break;
    case 2: d.curChallengeBattleNum[mode] = value & 0xffff; break;
    case 3: d.curStreakChallengesNum[mode] = value & 0xffff; break;
    case 4: d.battleTowerTrainerId = value & 0xff; break;
    case 5: d.selectedPartyMons = gSelectedOrderFromParty.slice(0, 3).map((x) => x & 0xff); break;
    case 6: if (d.battleTowerTrainerId === C.BATTLE_TOWER_EREADER_TRAINER_ID) ClearEReaderTrainer(d.ereaderTrainer); if (d.totalBattleTowerWins < 9999) d.totalBattleTowerWins++; d.curChallengeBattleNum[mode] = (d.curChallengeBattleNum[mode]! + 1) & 0xffff; SaveCurrentWinStreak(); setResult(d.curChallengeBattleNum[mode]!); stringVars.var1 = Uint8Array.from([d.curChallengeBattleNum[mode]! + 0xa1, EOS]); break;
    case 7: if (d.curStreakChallengesNum[mode]! < 1430) d.curStreakChallengesNum[mode] = (d.curStreakChallengesNum[mode]! + 1) & 0xffff; SaveCurrentWinStreak(); setResult(d.curStreakChallengesNum[mode]!); break;
    case 8: d.unk_554 = value & 1; break;
    case 10: SetGameStat(C.GAME_STAT_BATTLE_TOWER_BEST_STREAK, d.bestBattleTowerWinStreak); break;
    case 11: if (d.var_4AE[mode] !== 3) ResetBattleTowerStreak(mode); break;
    case 12: d.var_4AE[mode] = ewram160FB; break;
    case 13: d.currentWinStreaks[mode] = GetCurrentBattleTowerWinStreak(mode); break;
    case 14: d.lastStreakLevelType = d.battleTowerLevelType; break;
  }
}

/** BattleTowerUtil. */
export function BattleTowerUtil(): void {
  const d = tower(), mode = d.battleTowerLevelType;
  switch (varGet(SV.x8004)) {
    case 0: setResult(d.var_4AE[mode]!); break; case 1: setResult(mode); break;
    case 2: setResult(d.curChallengeBattleNum[mode]!); break; case 3: setResult(d.curStreakChallengesNum[mode]!); break;
    case 4: setResult(d.battleTowerTrainerId); break; case 8: setResult(d.unk_554); break;
    case 9: setResult(GetCurrentBattleTowerWinStreak(mode)); break;
    case 10: SetGameStat(C.GAME_STAT_BATTLE_TOWER_BEST_STREAK, d.bestBattleTowerWinStreak); break;
    case 11: ResetBattleTowerStreak(mode); break; case 12: d.var_4AE[mode] = ewram160FB; break;
    case 13: d.currentWinStreaks[mode] = GetCurrentBattleTowerWinStreak(mode); break;
    case 14: d.lastStreakLevelType = mode; break;
  }
}

/** SetBattleTowerParty. */
export function SetBattleTowerParty(): void {
  gSelectedOrderFromParty.splice(0, 3, ...tower().selectedPartyMons);
  ReducePlayerPartyToThree();
}

/** SaveCurrentWinStreak. */
function SaveCurrentWinStreak(): void {
  const d = tower(), mode = d.battleTowerLevelType, streak = GetCurrentBattleTowerWinStreak(mode);
  if (d.recordWinStreaks[mode]! < streak) d.recordWinStreaks[mode] = streak;
  const best = Math.max(d.recordWinStreaks[0]!, d.recordWinStreaks[1]!);
  SetGameStat(C.GAME_STAT_BATTLE_TOWER_BEST_STREAK, best);
  d.bestBattleTowerWinStreak = Math.min(best, 9999);
}

/** SetPlayerBattleTowerRecord. */
function SetPlayerBattleTowerRecord(): void {
  const d = tower(), record = d.playerRecord, id = save.trainerId >>> 0;
  record.battleTowerLevelType = d.battleTowerLevelType;
  const trainerClasses = cdata<number[]>("battle_tower", save.playerGender !== C.MALE ? "sFemaleTrainerClasses" : "sMaleTrainerClasses");
  const trainerIdBytes = [id & 0xff, (id >>> 8) & 0xff, (id >>> 16) & 0xff, (id >>> 24) & 0xff];
  record.trainerClass = trainerClasses[trainerIdBytes.reduce((sum, byte) => sum + byte, 0) % trainerClasses.length]!;
  record.trainerId = [id & 0xff, (id >>> 8) & 0xff, (id >>> 16) & 0xff, (id >>> 24) & 0xff];
  record.name = Array.from(save.playerName).slice(0, C.PLAYER_NAME_LENGTH + 1);
  record.winStreak = GetCurrentBattleTowerWinStreak(d.battleTowerLevelType);
  record.greeting = save.easyChatBattleStart.slice(0, C.EASY_CHAT_BATTLE_WORDS_COUNT);
  for (let i = 0; i < 3; i++) ConvertPokemonToBattleTowerPokemon(playerMon(d.selectedPartyMons[i]! - 1), record.party[i]!);
  SetBattleTowerRecordChecksum(record); SaveCurrentWinStreak();
}

/** PopulateBravoTrainerBattleTowerLostData. */
function PopulateBravoTrainerBattleTowerLostData(): void {
  const d = tower();
  GetBattleTowerTrainerName(d.defeatedByTrainerName);
  d.defeatedBySpecies = gBattleMons[1]?.species ?? 0;
  d.firstMonSpecies = gBattleMons[0]?.species ?? 0;
  d.firstMonNickname = Array.from(gBattleMons[0]?.nickname ?? [EOS]).slice(0, C.POKEMON_NAME_LENGTH + 1);
}

/** SaveBattleTowerProgress. */
export function SaveBattleTowerProgress(): void {
  const d = tower(), mode = d.battleTowerLevelType, result = varGet(SV.x8004);
  if (result === 3 || result === 0) if (d.curStreakChallengesNum[mode]! > 1 || d.curChallengeBattleNum[mode]! > 1) SetPlayerBattleTowerRecord();
  PopulateBravoTrainerBattleTowerLostData();
  d.battleOutcome = G.gBattleOutcome;
  if (result !== 3) d.var_4AE[mode] = result & 0xff;
  varSet(C.VAR_TEMP_0, C.BTSPECIAL_TEST); d.unk_554 = 1;
}

/** DetermineBattleTowerPrize. */
export function DetermineBattleTowerPrize(): void {
  const d = tower(), prizes = d.curStreakChallengesNum[d.battleTowerLevelType]! - 1 > 5 ? sLongStreakPrizes() : sShortStreakPrizes();
  d.prizeItem = prizes[random() % prizes.length]!;
}

/** GiveBattleTowerPrize. */
export function GiveBattleTowerPrize(): number {
  const d = tower();
  if (addBagItem(d.prizeItem, 1)) { stringVars.var1 = CopyItemName(d.prizeItem); setResult(1); }
  else { setResult(0); d.var_4AE[d.battleTowerLevelType] = 6; }
  return varGet(SV.RESULT);
}

/** AwardBattleTowerRibbons. */
export function AwardBattleTowerRibbons(): number {
  const d = tower(), mode = d.battleTowerLevelType, ribbon = mode !== 0 ? C.MON_DATA_VICTORY_RIBBON : C.MON_DATA_WINNING_RIBBON;
  setResult(0);
  if (GetCurrentBattleTowerWinStreak(mode) > 55) for (let i = 0; i < 3; i++) {
    const mon = playerMon(d.selectedPartyMons[i]! - 1);
    if (!GetMonData(mon, ribbon)) { setResult(1); SetMonData(mon, ribbon, 1); }
  }
  if (varGet(SV.RESULT) !== 0) IncrementGameStat(C.GAME_STAT_RECEIVED_RIBBONS);
  return varGet(SV.RESULT);
}

/** GetEreaderTrainerFrontSpriteId. */
export function GetEreaderTrainerFrontSpriteId(): number { return cdata<number[]>("pokemon", "gFacilityClassToPicIndex")[tower().ereaderTrainer.trainerClass] ?? 0; }
/** GetEreaderTrainerClassId. */
export function GetEreaderTrainerClassId(): number { return cdata<number[]>("pokemon", "gFacilityClassToTrainerClass")[tower().ereaderTrainer.trainerClass] ?? 0; }
/** CopyEReaderTrainerName5. */
export function CopyEReaderTrainerName5(dest: number[] | Uint8Array = stringVars.var1): void {
  for (let i = 0; i < 5; i++) dest[i] = tower().ereaderTrainer.name[i] ?? EOS;
  dest[5] = EOS;
}

/** ClearEReaderTrainer. */
export function ClearEReaderTrainer(trainer: BattleTowerEReaderTrainerSave = tower().ereaderTrainer): void {
  Object.assign(trainer, { unk0: 0, trainerClass: 0, winStreak: 0, name: new Array(8).fill(0), trainerId: [0, 0, 0, 0],
    greeting: new Array(6).fill(0), farewellPlayerLost: new Array(6).fill(0), farewellPlayerWon: new Array(6).fill(0), checksum: 0 });
  trainer.party = trainer.party.map(() => ({ species: 0, heldItem: 0, moves: [0, 0, 0, 0], level: 0, ppBonuses: 0, hpEV: 0,
    attackEV: 0, defenseEV: 0, speedEV: 0, spAttackEV: 0, spDefenseEV: 0, otId: 0, hpIV: 0, attackIV: 0, defenseIV: 0,
    speedIV: 0, spAttackIV: 0, spDefenseIV: 0, abilityNum: 0, personality: 0, nickname: new Array(C.POKEMON_NAME_LENGTH + 1).fill(0), friendship: 0 }));
}

/** ValidateEReaderTrainer. */
export function ValidateEReaderTrainer(): number {
  const trainer = tower().ereaderTrainer;
  setResult(0);
  const words = eReaderTrainerWords(trainer);
  // C checks every u32 before checksum, both for an all-zero payload and for its sum.
  if (words.every((word) => word === 0)) { setResult(1); return 1; }
  const checksum = words.reduce((sum, word) => (sum + word) >>> 0, 0);
  if (trainer.checksum !== checksum) { ClearEReaderTrainer(trainer); setResult(1); }
  return varGet(SV.RESULT);
}

/** BufferEReaderTrainerGreeting. */
export function BufferEReaderTrainerGreeting(): void { BufferBattleTowerTrainerMessage(tower().ereaderTrainer.greeting); }

/** StartSpecialBattle. */
export function StartSpecialBattle(game: Game): void {
  sSpecialVar_0x8004_Copy = varGet(SV.x8004);
  if (sSpecialVar_0x8004_Copy === 0) { FillBattleTowerTrainerParty(); G.gBattleTypeFlags = C.BATTLE_TYPE_BATTLE_TOWER | C.BATTLE_TYPE_TRAINER; }
  else if (sSpecialVar_0x8004_Copy === 2) { ZeroEnemyPartyMons(); tower().ereaderTrainer.party.forEach((mon, i) => CreateBattleTowerMon(gEnemyParty[i]!, mon)); }
  else if (sSpecialVar_0x8004_Copy === 1) {
    // Secret Base data is an RS leftover; FireRed copies the party's held items back to itself.
  }
  else return;
  if (sSpecialVar_0x8004_Copy === 2) G.gBattleTypeFlags = C.BATTLE_TYPE_EREADER_TRAINER | C.BATTLE_TYPE_TRAINER;
  if (sSpecialVar_0x8004_Copy !== 1) G.gTrainerBattleOpponent_A = 0;
  const transition = BattleSetup_GetBattleTowerBattleTransition();
  Task_WaitBT(game, { kind: "trainer", trainerId: G.gTrainerBattleOpponent_A, enemyParty: gEnemyParty.slice(0, 3).map((mon) => structuredClone(mon)),
    transition, onEnd: (outcome) => {
      game.battleOutcome = outcome;
      setResult(outcome);
      if (sSpecialVar_0x8004_Copy === 2) PrintEReaderTrainerFarewellMessage(outcome);
      game.returnToFieldContinueScript(true);
    } });
  game.overworld.script.ScriptContext_Stop();
}

/** SetEReaderTrainerChecksum. The C function is retained for data producers; checksum is calculated by the same layout helper. */
function SetEReaderTrainerChecksum(trainer: BattleTowerEReaderTrainerSave): void {
  trainer.checksum = eReaderTrainerWords(trainer).reduce((sum, word) => (sum + word) >>> 0, 0);
}

/** Debug_FillEReaderTrainerWithPlayerData; unused C debug helper for constructing a valid local fixture. */
function Debug_FillEReaderTrainerWithPlayerData(): void {
  const trainer = tower().ereaderTrainer;
  const id = save.trainerId >>> 0;
  const classes = cdata<number[]>("battle_tower", save.playerGender !== C.MALE ? "sFemaleTrainerClasses" : "sMaleTrainerClasses");
  trainer.trainerClass = classes[(id & 0xff) % classes.length]!;
  trainer.trainerId = [id & 0xff, (id >>> 8) & 0xff, (id >>> 16) & 0xff, (id >>> 24) & 0xff];
  trainer.name = Array.from(save.playerName).slice(0, 8);
  trainer.winStreak = 1;
  for (let i = 0; i < C.EASY_CHAT_BATTLE_WORDS_COUNT; i++) {
    trainer.greeting[i] = save.easyChatBattleStart[i]!;
    trainer.farewellPlayerLost[i] = i + 7;
    trainer.farewellPlayerWon[i] = i + 13;
  }
  for (let i = 0; i < 3; i++) ConvertPokemonToBattleTowerPokemon(playerMon(i), trainer.party[i]!);
  SetEReaderTrainerChecksum(trainer);
}

function PrintEReaderTrainerFarewellMessage(outcome: number): void {
  if (outcome === B_OUTCOME_DREW) stringVars.var4 = new Uint8Array([EOS]);
  else BufferBattleTowerTrainerMessage(outcome === B_OUTCOME_WON ? tower().ereaderTrainer.farewellPlayerWon : tower().ereaderTrainer.farewellPlayerLost);
}

/** CB2_FinishEReaderBattle callback behavior expressed through the browser battle host. */
export function CB2_FinishEReaderBattle(outcome: number): void { if (sSpecialVar_0x8004_Copy === 2) PrintEReaderTrainerFarewellMessage(outcome); }

/** BattleTower_SoftReset. */
export function BattleTower_SoftReset(): void { if (typeof location !== "undefined") location.reload(); }

/** Dummy_TryEnableBravoTrainerBattleTower: TakeBravoTrainerBattleTowerOffTheAir() is an empty C macro. */
export function Dummy_TryEnableBravoTrainerBattleTower(): void { for (let i = 0; i < 2; i++) if (tower().var_4AE[i] === 1) { /* empty C macro */ } }

/** Static C count helpers useful to the battle integration. */
export function battleTowerCurrentTrainerName(): Uint8Array { const out = new Uint8Array(8); GetBattleTowerTrainerName(out); return out; }
export function battleTowerLevelName(): Uint8Array { return copy(sText_100); }
