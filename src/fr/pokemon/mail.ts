// mail.c / mailbox_pc.c / trade_scene.c (in-game trade mail): held-mail
// messages as easy-chat words. Reading, taking and the field-use view are
// ported; composing a new message (the Easy Chat writer) is pending, so mail
// attached through GIVE carries a blank message.

import { decode } from "../gba/charmap";
import * as C from "../generated/constants";
import { cdata, hasCData, loadCData, type SymRef } from "../hw/assets";
import { rom } from "../rom";
import { GetUnownLetterByPersonality } from "../pokemonIcon";
import { speciesName, type Pokemon } from "./pokemon";

export const MAIL_WORDS_COUNT = 9;
export const EC_WORD_UNDEFINED = 0xffff;
const UNOWN_OFFSET = 30000;

/** SpeciesToMailSpecies; preserve the Unown letter in the mail record. */
export function SpeciesToMailSpecies(species: number, personality: number): number {
  const speciesId = species & 0xffff;
  if (speciesId === C.SPECIES_UNOWN) return (UNOWN_OFFSET + GetUnownLetterByPersonality(personality >>> 0)) & 0xffff;
  return speciesId;
}

/** MailSpeciesToSpecies; returns the out-parameter as unownLetter. */
export function MailSpeciesToSpecies(mailSpecies: number): { species: number; unownLetter: number } {
  const id = mailSpecies & 0xffff;
  if (id >= UNOWN_OFFSET && id < UNOWN_OFFSET + C.NUM_UNOWN_FORMS) {
    return { species: C.SPECIES_UNOWN, unownLetter: id - UNOWN_OFFSET };
  }
  return { species: id, unownLetter: 0 };
}

/** struct Mail (words + author), stored on the holding mon. */
export type MailMessage = {
  words: number[];
  author: number[];
  authorId: number;
};

/** ItemIsMail: ORANGE_MAIL..RETRO_MAIL. */
export function isMailItem(item: number): boolean {
  const c = rom.constants;
  return item >= (c.ITEM_ORANGE_MAIL ?? 0) && item <= (c.ITEM_RETRO_MAIL ?? 0) && (c.ITEM_ORANGE_MAIL ?? 0) !== 0;
}

/** Blank message, as a bag mail item or a fresh GIVE carries (messageExists=FALSE). */
export function blankMail(): MailMessage {
  return { words: new Array(MAIL_WORDS_COUNT).fill(EC_WORD_UNDEFINED), author: [], authorId: 0 };
}

export function hasMessageText(msg: MailMessage | undefined): boolean {
  return !!msg && msg.words.some((w) => w !== EC_WORD_UNDEFINED);
}

// ---------------------------------------------------------------- easy-chat words

/** EC_GROUP ids 0x0..0x15 in sEasyChatGroups order (easy_chat_groups.h). */
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

type WordInfo = { text: SymRef };

function groupWords(group: number): number[] | WordInfo[] | undefined {
  const key = EC_GROUP_KEYS[group];
  if (!hasCData("easy_chat", key)) {
    void loadCData("easy_chat").catch(() => undefined);
    return undefined;
  }
  return cdata<number[] | WordInfo[]>("easy_chat", key);
}

/** CopyEasyChatWord: word id to display text, null for EC_WORD_UNDEFINED. */
export function ecWordText(word: number): string | null {
  if (word === EC_WORD_UNDEFINED) return null;
  const group = word >> 9;
  const index = word & 0x1ff;
  const list = groupWords(group);
  if (!list) return "???";
  if (group === 0 || group === 0x12 || group === 0x13 || group === 0x15) {
    // Pokemon/move groups look text up by species/move id directly
    // (GetEasyChatWord); the valueList only gates validity (IsECWordInvalid).
    if (!(list as number[]).includes(index)) return "???";
    if (group === 0x12 || group === 0x13) {
      const move = rom.moves[index];
      if (!move) return "???";
      return decode(Uint8Array.from(atob(move.name), (ch) => ch.charCodeAt(0)));
    }
    return decode(speciesName(index));
  }
  const entry = (list as WordInfo[])[index];
  const sym = entry?.text?.$sym;
  if (!sym || !hasCData("easy_chat", sym)) return "???";
  return decode(Uint8Array.from(cdata<number[]>("easy_chat", sym)));
}

/** ConvertEasyChatWordsToString over the 5x2 mail arrangement (5 + 4 words). */
export function mailLines(words: number[]): string[] {
  const text = (w: number): string => ecWordText(w) ?? "";
  const line1 = words.slice(0, 5).map(text).filter((s) => s !== "").join(" ");
  const line2 = words.slice(5, 9).map(text).filter((s) => s !== "").join(" ");
  return [line1, line2].filter((s) => s !== "");
}

// ---------------------------------------------------------------- attach / take

/** GetInGameTradeMail: words, author and ids from sInGameTradeMailMessages. */
export function attachTradeMail(mon: Pokemon, mailNum: number, otName: number[], otId: number): void {
  if (!hasCData("trade_scene", "sInGameTradeMailMessages")) return;
  const table = cdata<number[][]>("trade_scene", "sInGameTradeMailMessages");
  const row = table[mailNum];
  if (!row) return;
  mon.mail = mailNum;
  mon.mailMessage = {
    words: row.slice(0, MAIL_WORDS_COUNT),
    author: [...otName],
    authorId: otId >>> 0,
  };
}

/** TakeMailFromMon: clears the held mail item and its message. */
export function takeMail(mon: Pokemon): number {
  const item = mon.heldItem;
  mon.heldItem = 0;
  mon.mailMessage = undefined;
  return item;
}
