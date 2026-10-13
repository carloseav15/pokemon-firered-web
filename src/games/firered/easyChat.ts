// easy_chat.c: easy-chat word lookup, default phrases, trendy-saying bookkeeping,
// and the group/alphabetical selection lists used by the word picker.
import * as C from "./generated/constants";
import { decode, encode, stringVars } from "./gba/charmap";
import { random } from "./random";
import { cdata, hasCData, loadCData, type SymRef } from "./hw/assets";
import { rom } from "./rom";
import { flagGet, IsNationalPokedexEnabled, save, SV, varGet } from "./save";
import type { SaveData } from "./save";
import { GetNationalPokedexCount, speciesName } from "./pokemon/pokemon";
import { GetSetPokedexFlag } from "./pokemon/mon_extra";
import { SpeciesToNationalPokedexNum } from "./pokemon/mon";

const EC_WORD_UNDEFINED = C.EC_WORD_UNDEFINED;
const CHAR_SPACE_TEXT = " ";
const NUM_ALPHABETICAL_GROUPS = 27;
const NUM_TRENDY_SAYINGS = 33;

const EC_GROUP = (word: number): number => (word >> 9) & 0x7f;
const EC_INDEX = (word: number): number => word & 0x1ff;
const EC_WORD = (group: number, index: number): number => ((group << 9) | index) & 0xffff;

type EasyChatWordInfo = { text: SymRef; alphabeticalOrder: number; enabled: number };
type EasyChatGroup = {
  wordData: { valueList?: SymRef; words?: SymRef };
  numWords: number;
  numEnabledWords: number;
};
type EasyChatWordsByLetter = { words: SymRef; numWords: number };

/** struct Unk203A120 (easy_chat.c): the word-picker selection state. */
type EasyChatSelectionData = {
  numGroups: number;
  groups: number[];
  alphabeticalGroups: number[];
  alphabeticalWordsByGroup: number[][];
  allWords: number[];
  totalWords: number;
};
let sEasyChatSelectionData: EasyChatSelectionData | null = null;

/** sEasyChatGroups is positional in easy_chat_groups.h: slot 0 is the sEasyChatGroup_Pokemon list. */
const EC_GROUP_KEYS = [
  "sEasyChatGroup_Pokemon", "sEasyChatGroup_Trainer", "sEasyChatGroup_Status",
  "sEasyChatGroup_Battle", "sEasyChatGroup_Greetings", "sEasyChatGroup_People",
  "sEasyChatGroup_Voices", "sEasyChatGroup_Speech", "sEasyChatGroup_Endings",
  "sEasyChatGroup_Feelings", "sEasyChatGroup_Conditions", "sEasyChatGroup_Actions",
  "sEasyChatGroup_Lifestyle", "sEasyChatGroup_Hobbies", "sEasyChatGroup_Time",
  "sEasyChatGroup_Misc", "sEasyChatGroup_Adjectives", "sEasyChatGroup_Events",
  "sEasyChatGroup_Move1", "sEasyChatGroup_Move2", "sEasyChatGroup_TrendySaying",
  "sEasyChatGroup_Pokemon2",
];

const sDefaultProfileWords = [C.EC_WORD_I_AM, C.EC_WORD_A, C.EC_WORD_POKEMON, C.EC_WORD_FRIEND];
const sDefaultBattleStartWords = [C.EC_WORD_ARE, C.EC_WORD_YOU, C.EC_WORD_READY, C.EC_WORD_QUES, C.EC_WORD_HERE_I_COME, C.EC_WORD_EXCL];
const sDeoxysValue = [C.SPECIES_DEOXYS];

function ecTable<T>(sym: string): T | undefined {
  if (!hasCData("easy_chat", sym)) {
    void loadCData("easy_chat").catch(() => undefined);
    return undefined;
  }
  return cdata<T>("easy_chat", sym);
}

/** sEasyChatGroups[groupId]; undefined until the cdata table has loaded. */
function sEasyChatGroups(groupId: number): EasyChatGroup | undefined {
  return ecTable<EasyChatGroup[]>("sEasyChatGroups")?.[groupId];
}

function groupValueList(groupId: number): number[] {
  const sym = sEasyChatGroups(groupId)?.wordData.valueList?.$sym;
  return sym ? ecTable<number[]>(sym) ?? [] : [];
}

function groupWordInfo(groupId: number): EasyChatWordInfo[] {
  const sym = sEasyChatGroups(groupId)?.wordData.words?.$sym;
  return sym ? ecTable<EasyChatWordInfo[]>(sym) ?? [] : [];
}

function isValueListGroup(groupId: number): boolean {
  return groupId === C.EC_GROUP_POKEMON || groupId === C.EC_GROUP_POKEMON_2
    || groupId === C.EC_GROUP_MOVE_1 || groupId === C.EC_GROUP_MOVE_2;
}

/** InitEasyChatPhrases (easy_chat.c): new-game SaveBlock initialization. */
export function InitEasyChatPhrases(data: SaveData): void {
  data.easyChatProfile = sDefaultProfileWords.slice(0, 4);
  data.easyChatBattleStart = sDefaultBattleStartWords.slice(0, 6);
  data.easyChatBattleWon = new Array(C.EASY_CHAT_BATTLE_WORDS_COUNT).fill(EC_WORD_UNDEFINED);
  data.easyChatBattleLost = new Array(C.EASY_CHAT_BATTLE_WORDS_COUNT).fill(EC_WORD_UNDEFINED);
  for (const mail of data.mail) mail.words.fill(EC_WORD_UNDEFINED);
  // include/config.h enables UBFIX; NUM_ADDITIONAL_PHRASE_BYTES is five in this build.
  data.additionalPhrases.fill(0);
}

/** InitQuestionnaireWords (easy_chat.c); `ptr` is GetQuestionnaireWordsPtr() (mystery_gift.c, link scope). */
export function InitQuestionnaireWords(ptr: number[]): void {
  for (let i = 0; i < C.NUM_QUESTIONNAIRE_WORDS; i++) ptr[i] = EC_WORD_UNDEFINED;
}

/** IsECGroupUnlocked (easy_chat.c). */
function IsECGroupUnlocked(groupId: number): boolean {
  switch (groupId & 0xff) {
    case C.EC_GROUP_TRENDY_SAYING: return false;
    case C.EC_GROUP_EVENTS:
    case C.EC_GROUP_MOVE_1:
    case C.EC_GROUP_MOVE_2: return flagGet(C.FLAG_SYS_GAME_CLEAR);
    case C.EC_GROUP_POKEMON: return EC_IsNationalPokedexEnabled();
    default: return true;
  }
}

/** EasyChat_GetNumWordsInGroup (easy_chat.c). */
function EasyChat_GetNumWordsInGroup(groupId: number): number {
  groupId &= 0xff;
  if (groupId === C.EC_GROUP_POKEMON) return GetNationalPokedexCount(C.FLAG_GET_SEEN);
  if (IsECGroupUnlocked(groupId)) return sEasyChatGroups(groupId)?.numEnabledWords ?? 0;
  return 0;
}

/** IsECWordInvalid (easy_chat.c); EC_WORD_UNDEFINED is an allowed empty word. */
export function IsECWordInvalid(easyChatWord: number): boolean {
  easyChatWord &= 0xffff;
  if (easyChatWord === EC_WORD_UNDEFINED) return false;
  const groupId = EC_GROUP(easyChatWord);
  const index = EC_INDEX(easyChatWord);
  if (groupId >= C.EC_NUM_GROUPS) return true;
  const group = sEasyChatGroups(groupId);
  if (!group) return true;
  const numWords = group.numWords;
  if (isValueListGroup(groupId)) {
    const list = groupValueList(groupId);
    for (let i = 0; i < numWords; i++) if (index === list[i]) return false;
    return true;
  }
  return index >= numWords;
}

/** GetEasyChatWord (easy_chat.c), as decoded game text. */
export function GetEasyChatWord(groupId: number, index: number): string {
  switch (groupId) {
    case C.EC_GROUP_POKEMON:
    case C.EC_GROUP_POKEMON_2:
      return decode(speciesName(index));
    case C.EC_GROUP_MOVE_1:
    case C.EC_GROUP_MOVE_2: {
      const move = rom.moves[index];
      if (!move) return "???";
      return decode(Uint8Array.from(atob(move.name), (ch) => ch.charCodeAt(0)));
    }
    default: {
      const sym = groupWordInfo(groupId)[index]?.text?.$sym;
      const text = sym ? ecTable<number[]>(sym) : undefined;
      return text ? decode(Uint8Array.from(text)) : "???";
    }
  }
}

/** CopyEasyChatWord (easy_chat.c), as decoded game text; null represents an EOS-only word. */
export function CopyEasyChatWord(easyChatWord: number): string | null {
  easyChatWord &= 0xffff;
  if (IsECWordInvalid(easyChatWord)) return "???";
  if (easyChatWord !== EC_WORD_UNDEFINED) return GetEasyChatWord(EC_GROUP(easyChatWord), EC_INDEX(easyChatWord));
  return null;
}

/** ConvertEasyChatWordsToString (easy_chat.c): space after each nonempty word except the last column, newline per row. */
export function ConvertEasyChatWordsToString(src: readonly number[], columns: number, rows: number): string {
  const lines: string[] = [];
  const numColumns = columns - 1;
  let index = 0;
  for (let i = 0; i < rows; i++) {
    let line = "";
    for (let j = 0; j < numColumns; j++) {
      const word = src[index++] ?? EC_WORD_UNDEFINED;
      line += CopyEasyChatWord(word) ?? "";
      if (word !== EC_WORD_UNDEFINED) line += CHAR_SPACE_TEXT;
    }
    line += CopyEasyChatWord(src[index++] ?? EC_WORD_UNDEFINED) ?? "";
    lines.push(line);
  }
  return lines.join("\n");
}

/** GetEasyChatWordStringLength (easy_chat.c). */
function GetEasyChatWordStringLength(easyChatWord: number): number {
  easyChatWord &= 0xffff;
  if (easyChatWord === EC_WORD_UNDEFINED) return 0;
  if (IsECWordInvalid(easyChatWord)) return "???".length;
  return GetEasyChatWord(EC_GROUP(easyChatWord), EC_INDEX(easyChatWord)).length;
}

/** EC_DoesEasyChatStringFitOnLine (easy_chat.c): TRUE when a row exceeds maxLength. */
export function EC_DoesEasyChatStringFitOnLine(easyChatWords: readonly number[], columns: number, rows: number, maxLength: number): boolean {
  let index = 0;
  for (let i = 0; i < rows; i++) {
    let totalLength = columns - 1;
    for (let j = 0; j < columns; j++) totalLength += GetEasyChatWordStringLength(easyChatWords[index++] ?? EC_WORD_UNDEFINED);
    if (totalLength > maxLength) return true;
  }
  return false;
}

/** GetRandomWordFromGroup (easy_chat.c). */
function GetRandomWordFromGroup(groupId: number): number {
  const numWords = sEasyChatGroups(groupId)?.numWords ?? 0;
  if (numWords === 0) return EC_WORD_UNDEFINED;
  let index = random() % numWords;
  if (isValueListGroup(groupId)) index = groupValueList(groupId)[index];
  return EC_WORD(groupId, index);
}

/** GetRandomWordFromAnyGroup (easy_chat.c). */
function GetRandomWordFromAnyGroup(groupId: number): number {
  if (!IsECGroupUnlocked(groupId)) return EC_WORD_UNDEFINED;
  if (groupId === C.EC_GROUP_POKEMON) return GetRandomECPokemon();
  return GetRandomWordFromGroup(groupId);
}

/** ShowEasyChatMessage (easy_chat.c): `show` is ShowFieldAutoScrollMessage. */
export function ShowEasyChatMessage(show: (text: ArrayLike<number>) => void): void {
  let easyChatWords: number[];
  let columns: number;
  let rows: number;
  switch (varGet(SV.x8004)) {
    case 0:
      easyChatWords = save.easyChatProfile;
      columns = 2;
      rows = 2;
      break;
    case 1:
      easyChatWords = save.easyChatBattleStart;
      if (EC_DoesEasyChatStringFitOnLine(save.easyChatBattleStart, 3, 2, 18)) {
        columns = 2;
        rows = 3;
      } else {
        columns = 3;
        rows = 2;
      }
      break;
    case 2:
      easyChatWords = save.easyChatBattleWon;
      columns = 3;
      rows = 2;
      break;
    case 3:
      easyChatWords = save.easyChatBattleLost;
      columns = 3;
      rows = 2;
      break;
    default:
      return;
  }
  const text = encode(ConvertEasyChatWordsToString(easyChatWords, columns, rows));
  stringVars.var4 = text;
  show(text);
}

/** BufferRandomHobbyOrLifestyleString (easy_chat.c), called by field scripts. */
export function BufferRandomHobbyOrLifestyleString(): void {
  const groupId = random() & 1 ? C.EC_GROUP_HOBBIES : C.EC_GROUP_LIFESTYLE;
  const easyChatWord = GetRandomWordFromAnyGroup(groupId);
  stringVars.var2 = encode(CopyEasyChatWord(easyChatWord) ?? "");
}

/** IsTrendySayingUnlocked (easy_chat.c). */
function IsTrendySayingUnlocked(additionalPhraseId: number): boolean {
  const byteOffset = Math.trunc(additionalPhraseId / 8);
  const shift = additionalPhraseId % 8;
  return ((save.additionalPhrases[byteOffset] >> shift) & 1) !== 0;
}

/** EnableRareWord (easy_chat.c). */
export function EnableRareWord(additionalPhraseId: number): void {
  additionalPhraseId &= 0xff;
  if (additionalPhraseId < NUM_TRENDY_SAYINGS) {
    const byteOffset = Math.trunc(additionalPhraseId / 8);
    const shift = additionalPhraseId % 8;
    save.additionalPhrases[byteOffset] = (save.additionalPhrases[byteOffset] | (1 << shift)) & 0xff;
  }
}

/** GetNumUnlockedTrendySayings (easy_chat.c). */
function GetNumUnlockedTrendySayings(): number {
  let numAdditionalPhrasesUnlocked = 0;
  for (let i = 0; i < NUM_TRENDY_SAYINGS; i++) if (IsTrendySayingUnlocked(i)) numAdditionalPhrasesUnlocked++;
  return numAdditionalPhrasesUnlocked;
}

/** UnlockRandomTrendySaying (easy_chat.c). */
export function UnlockRandomTrendySaying(): number {
  const numAdditionalPhrasesUnlocked = GetNumUnlockedTrendySayings();
  if (numAdditionalPhrasesUnlocked === NUM_TRENDY_SAYINGS) return EC_WORD_UNDEFINED;
  let additionalPhraseId = random() % (NUM_TRENDY_SAYINGS - numAdditionalPhrasesUnlocked);
  for (let i = 0; i < NUM_TRENDY_SAYINGS; i++) {
    if (!IsTrendySayingUnlocked(i)) {
      if (additionalPhraseId) {
        additionalPhraseId--;
      } else {
        EnableRareWord(i);
        return EC_WORD(C.EC_GROUP_TRENDY_SAYING, i);
      }
    }
  }
  return EC_WORD_UNDEFINED;
}

/** GetRandomUnlockedTrendySaying (easy_chat.c). */
export function GetRandomUnlockedTrendySaying(): number {
  let additionalPhraseId = GetNumUnlockedTrendySayings();
  if (additionalPhraseId === 0) return EC_WORD_UNDEFINED;
  additionalPhraseId = random() % additionalPhraseId;
  for (let i = 0; i < NUM_TRENDY_SAYINGS; i++) {
    if (IsTrendySayingUnlocked(i)) {
      if (additionalPhraseId) additionalPhraseId--;
      else return EC_WORD(C.EC_GROUP_TRENDY_SAYING, i);
    }
  }
  return EC_WORD_UNDEFINED;
}

/** EC_IsNationalPokedexEnabled (easy_chat.c). */
function EC_IsNationalPokedexEnabled(): boolean {
  return IsNationalPokedexEnabled();
}

/** GetRandomECPokemon (easy_chat.c). */
function GetRandomECPokemon(): number {
  let index = EasyChat_GetNumWordsInGroup(C.EC_GROUP_POKEMON_2);
  if (index === 0) return EC_WORD_UNDEFINED;
  index = random() % index;
  const species = groupValueList(C.EC_GROUP_POKEMON_2);
  const numWords = sEasyChatGroups(C.EC_GROUP_POKEMON_2)?.numWords ?? 0;
  for (let i = 0; i < numWords; i++) {
    const dexNum = SpeciesToNationalPokedexNum(species[i]);
    if (GetSetPokedexFlag(dexNum, C.FLAG_GET_SEEN)) {
      if (index) index--;
      else return EC_WORD(C.EC_GROUP_POKEMON_2, species[i]);
    }
  }
  return EC_WORD_UNDEFINED;
}

/** InitEasyChatSelection (easy_chat.c): Alloc always succeeds in JS. */
export function InitEasyChatSelection(): boolean {
  sEasyChatSelectionData = {
    numGroups: 0,
    groups: new Array(C.EC_NUM_GROUPS).fill(0),
    alphabeticalGroups: new Array(NUM_ALPHABETICAL_GROUPS).fill(0),
    alphabeticalWordsByGroup: Array.from({ length: NUM_ALPHABETICAL_GROUPS }, () => new Array(270).fill(0)),
    allWords: new Array(270).fill(0),
    totalWords: 0,
  };
  PopulateECGroups();
  PopulateAlphabeticalGroups();
  return true;
}

/** DestroyEasyChatSelectionData (easy_chat.c). */
export function DestroyEasyChatSelectionData(): void {
  sEasyChatSelectionData = null;
}

/** PopulateECGroups (easy_chat.c). */
function PopulateECGroups(): void {
  const data = sEasyChatSelectionData!;
  data.numGroups = 0;
  if (GetNationalPokedexCount(C.FLAG_GET_SEEN)) data.groups[data.numGroups++] = C.EC_GROUP_POKEMON;
  for (let i = C.EC_GROUP_TRAINER; i <= C.EC_GROUP_ADJECTIVES; i++) data.groups[data.numGroups++] = i;
  if (flagGet(C.FLAG_SYS_GAME_CLEAR)) {
    data.groups[data.numGroups++] = C.EC_GROUP_EVENTS;
    data.groups[data.numGroups++] = C.EC_GROUP_MOVE_1;
    data.groups[data.numGroups++] = C.EC_GROUP_MOVE_2;
  }
  if (IsNationalPokedexEnabled()) data.groups[data.numGroups++] = C.EC_GROUP_POKEMON_2;
}

/** GetNumDisplayableGroups (easy_chat.c). */
export function GetNumDisplayableGroups(): number {
  return sEasyChatSelectionData!.numGroups;
}

/** GetSelectedGroupByIndex (easy_chat.c). */
export function GetSelectedGroupByIndex(index: number): number {
  if (index >= sEasyChatSelectionData!.numGroups) return C.EC_NUM_GROUPS;
  return sEasyChatSelectionData!.groups[index];
}

/** sEasyChatGroupNamePointers[groupId] (strings.c), as decoded game text. */
export function GetEasyChatWordGroupName(groupId: number): string {
  const sym = ecTable<SymRef[]>("sEasyChatGroupNamePointers")?.[groupId]?.$sym;
  if (!sym) return "";
  if (!hasCData("strings", sym)) {
    void loadCData("strings").catch(() => undefined);
    return "";
  }
  return decode(Uint8Array.from(cdata<number[]>("strings", sym)));
}

/** BufferEasyChatWordGroupName (easy_chat.c, unused): group name padded with spaces to totalChars. */
export function BufferEasyChatWordGroupName(groupId: number, totalChars: number): string {
  return GetEasyChatWordGroupName(groupId).padEnd(totalChars, CHAR_SPACE_TEXT);
}

/** CopyEasyChatWordPadded (easy_chat.c). */
export function CopyEasyChatWordPadded(easyChatWord: number, totalChars: number): string {
  return (CopyEasyChatWord(easyChatWord) ?? "").padEnd(totalChars, CHAR_SPACE_TEXT);
}

/** PopulateAlphabeticalGroups (easy_chat.c). */
function PopulateAlphabeticalGroups(): void {
  const data = sEasyChatSelectionData!;
  const byLetter = ecTable<EasyChatWordsByLetter[]>("sEasyChatWordsByLetterPointers");
  if (!byLetter) return;
  for (let i = 0; i < NUM_ALPHABETICAL_GROUPS; i++) {
    const numWords = byLetter[i].numWords;
    const list = ecTable<number[]>(byLetter[i].words.$sym) ?? [];
    let words = 0;
    data.alphabeticalGroups[i] = 0;
    let index = 0;
    for (let j = 0; j < numWords; ) {
      let numToProcess: number;
      if ((list[words] & 0xffff) === EC_WORD_UNDEFINED) {
        words++;
        numToProcess = list[words++];
        j += 2;
      } else {
        numToProcess = 1;
      }
      for (let k = 0; k < numToProcess; k++) {
        if (IsWordUnlocked(list[words + k] & 0xffff)) {
          data.alphabeticalWordsByGroup[i][index++] = list[words + k] & 0xffff;
          data.alphabeticalGroups[i]++;
          break;
        }
      }
      words += numToProcess;
      j += numToProcess;
    }
  }
}

/** GetUnlockedECWords (easy_chat.c). */
export function GetUnlockedECWords(isAlphabetical: boolean, groupId: number): void {
  const data = sEasyChatSelectionData!;
  data.totalWords = !isAlphabetical ? GetUnlockedWordsInECGroup(groupId) : GetUnlockedWordsInAlphabeticalGroup(groupId);
}

/** GetDisplayedWordByIndex (easy_chat.c). */
export function GetDisplayedWordByIndex(index: number): number {
  const data = sEasyChatSelectionData!;
  if (index >= data.totalWords) return EC_WORD_UNDEFINED;
  return data.allWords[index];
}

/** GetNumDisplayedWords (easy_chat.c). */
export function GetNumDisplayedWords(): number {
  return sEasyChatSelectionData!.totalWords;
}

/** GetUnlockedWordsInECGroup (easy_chat.c). */
function GetUnlockedWordsInECGroup(groupId: number): number {
  const data = sEasyChatSelectionData!;
  const numWords = sEasyChatGroups(groupId)?.numWords ?? 0;
  let totalWords = 0;
  if (isValueListGroup(groupId)) {
    const list = groupValueList(groupId);
    for (let i = 0; i < numWords; i++) {
      if (UnlockedECMonOrMove(list[i], groupId)) data.allWords[totalWords++] = EC_WORD(groupId, list[i]);
    }
    return totalWords;
  }
  const wordInfo = groupWordInfo(groupId);
  for (let i = 0; i < numWords; i++) {
    const alphabeticalOrder = wordInfo[i].alphabeticalOrder;
    if (UnlockedECMonOrMove(alphabeticalOrder, groupId)) data.allWords[totalWords++] = EC_WORD(groupId, alphabeticalOrder);
  }
  return totalWords;
}

/** GetUnlockedWordsInAlphabeticalGroup (easy_chat.c). */
function GetUnlockedWordsInAlphabeticalGroup(alphabeticalGroup: number): number {
  const data = sEasyChatSelectionData!;
  let totalWords = 0;
  for (let i = 0; i < data.alphabeticalGroups[alphabeticalGroup]; i++)
    data.allWords[totalWords++] = data.alphabeticalWordsByGroup[alphabeticalGroup][i];
  return totalWords;
}

/** IsGroupSelectable (easy_chat.c, unused in this build's callers but reached by IsWordUnlocked). */
function IsGroupSelectable(groupIdx: number): boolean {
  const data = sEasyChatSelectionData!;
  for (let i = 0; i < data.numGroups; i++) if (data.groups[i] === groupIdx) return true;
  return false;
}

/** UnlockedECMonOrMove (easy_chat.c). */
function UnlockedECMonOrMove(wordIndex: number, groupId: number): boolean {
  switch (groupId) {
    case C.EC_GROUP_POKEMON:
      return !!GetSetPokedexFlag(SpeciesToNationalPokedexNum(wordIndex), C.FLAG_GET_SEEN);
    case C.EC_GROUP_POKEMON_2:
      if (EC_IsDeoxys(wordIndex)) return !!GetSetPokedexFlag(SpeciesToNationalPokedexNum(wordIndex), C.FLAG_GET_SEEN);
      return true;
    case C.EC_GROUP_MOVE_1:
    case C.EC_GROUP_MOVE_2:
      return true;
    default:
      return !!groupWordInfo(groupId)[wordIndex]?.enabled;
  }
}

/** EC_IsDeoxys (easy_chat.c). */
function EC_IsDeoxys(species: number): boolean {
  for (let i = 0; i < sDeoxysValue.length; i++) if (sDeoxysValue[i] === species) return true;
  return false;
}

/** IsWordUnlocked (easy_chat.c). */
function IsWordUnlocked(easyChatWord: number): boolean {
  const groupId = EC_GROUP(easyChatWord);
  const index = EC_INDEX(easyChatWord);
  if (!IsGroupSelectable(groupId)) return false;
  return UnlockedECMonOrMove(index, groupId);
}
