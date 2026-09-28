// easy_chat.c: shared word lookup plus the random hobby/lifestyle script special.
import * as C from "./generated/constants";
import { encode, stringVars } from "./gba/charmap";
import { random } from "./random";
import { cdata, hasCData } from "./hw/assets";
import { CopyEasyChatWord } from "./pokemon/mail";
import { flagGet, IsNationalPokedexEnabled } from "./save";
import type { SaveData } from "./save";

/** InitEasyChatPhrases (easy_chat.c): new-game SaveBlock initialization. */
export function InitEasyChatPhrases(data: SaveData): void {
  data.easyChatProfile = [C.EC_WORD_I_AM, C.EC_WORD_A, C.EC_WORD_POKEMON, C.EC_WORD_FRIEND];
  data.easyChatBattleStart = [C.EC_WORD_ARE, C.EC_WORD_YOU, C.EC_WORD_READY, C.EC_WORD_QUES, C.EC_WORD_HERE_I_COME, C.EC_WORD_EXCL];
  data.easyChatBattleWon = new Array(C.EASY_CHAT_BATTLE_WORDS_COUNT).fill(C.EC_WORD_UNDEFINED);
  data.easyChatBattleLost = new Array(C.EASY_CHAT_BATTLE_WORDS_COUNT).fill(C.EC_WORD_UNDEFINED);
  for (const mail of data.mail) mail.words.fill(C.EC_WORD_UNDEFINED);
  // include/config.h enables UBFIX; NUM_ADDITIONAL_PHRASE_BYTES is five in this build.
  data.additionalPhrases.fill(0);
}

type EasyChatWord = { text: { $sym: string } };
const GROUP_DATA: Record<number, string> = {
  [C.EC_GROUP_LIFESTYLE]: "sEasyChatGroup_Lifestyle",
  [C.EC_GROUP_HOBBIES]: "sEasyChatGroup_Hobbies",
};

/** IsECGroupUnlocked (easy_chat.c). */
function IsECGroupUnlocked(groupId: number): boolean {
  switch (groupId & 0xff) {
    case C.EC_GROUP_TRENDY_SAYING: return false;
    case C.EC_GROUP_EVENTS:
    case C.EC_GROUP_MOVE_1:
    case C.EC_GROUP_MOVE_2: return flagGet(C.FLAG_SYS_GAME_CLEAR);
    case C.EC_GROUP_POKEMON: return IsNationalPokedexEnabled();
    default: return true;
  }
}

/** EasyChat_GetNumWordsInGroup (easy_chat.c), for the groups consumed here. */
function EasyChat_GetNumWordsInGroup(groupId: number): number {
  if (!IsECGroupUnlocked(groupId)) return 0;
  const key = GROUP_DATA[groupId & 0xff];
  if (!key || !hasCData("easy_chat", key)) return 0;
  return cdata<EasyChatWord[]>("easy_chat", key).length;
}

/** GetRandomWordFromGroup: lifestyle and hobby groups store ordinary word indices. */
function GetRandomWordFromGroup(groupId: number): number {
  const count = EasyChat_GetNumWordsInGroup(groupId);
  if (count === 0) return C.EC_WORD_UNDEFINED;
  const index = random() % count;
  return ((groupId << 9) | index) & 0xffff;
}

/** GetRandomWordFromAnyGroup: its only C caller passes LIFESTYLE or HOBBIES. */
function GetRandomWordFromAnyGroup(groupId: number): number {
  if (!IsECGroupUnlocked(groupId)) return C.EC_WORD_UNDEFINED;
  return GetRandomWordFromGroup(groupId);
}

/** BufferRandomHobbyOrLifestyleString (easy_chat.c), called by field scripts. */
export function BufferRandomHobbyOrLifestyleString(): void {
  const groupId = random() & 1 ? C.EC_GROUP_HOBBIES : C.EC_GROUP_LIFESTYLE;
  const word = GetRandomWordFromAnyGroup(groupId);
  stringVars.var2 = encode(CopyEasyChatWord(word) ?? "");
}
