// mail.c / mailbox_pc.c / trade_scene.c (in-game trade mail): held-mail
// messages as easy-chat words. Reading, taking, the field-use view and
// composing a new message (the Easy Chat writer, via the party menu GIVE
// path → DoEasyChatScreen) are connected.

import { CHAR_SPACE, decode, EOS } from "../gba/charmap";
import * as C from "../generated/constants";
import { cdata, hasCData, loadCData, type SymRef } from "../hw/assets";
import { rom } from "../rom";
import { GetUnownLetterByPersonality } from "../pokemonIcon";
import { save, type MailData, type PcMailEntry } from "../save";
import { speciesName, type Pokemon } from "./pokemon";
import { ConvertEasyChatWordsToString, CopyEasyChatWord } from "../easyChat";

export const MAIL_WORDS_COUNT = C.MAIL_WORDS_COUNT;
export const EC_WORD_UNDEFINED = C.EC_WORD_UNDEFINED;
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

/** ItemIsMail (mail_data.c). */
export const ItemIsMail = isMailItem;

function blankMailData(): MailData {
  return {
    words: new Array(C.MAIL_WORDS_COUNT).fill(C.EC_WORD_UNDEFINED),
    playerName: new Array(C.PLAYER_NAME_LENGTH + 1).fill(EOS),
    trainerId: [0, 0, 0, 0],
    species: C.SPECIES_BULBASAUR,
    itemId: C.ITEM_NONE,
  };
}

/** ClearMailStruct (mail_data.c). */
export function ClearMailStruct(mail: MailData): void {
  mail.words = new Array(C.MAIL_WORDS_COUNT).fill(C.EC_WORD_UNDEFINED);
  mail.playerName = new Array(C.PLAYER_NAME_LENGTH + 1).fill(EOS);
  mail.trainerId = [0, 0, 0, 0];
  mail.species = C.SPECIES_BULBASAUR;
  mail.itemId = C.ITEM_NONE;
}

/** ClearMailData (mail_data.c): reset all 16 SaveBlock mail entries. */
export function ClearMailData(): void {
  save.mail = Array.from({ length: C.MAIL_COUNT }, blankMailData);
}

function currentMailData(mon: Pokemon): MailData | undefined {
  const id = mon.mail ?? C.MAIL_NONE;
  return id < C.MAIL_COUNT ? save.mail[id] : undefined;
}

function authorId(bytes: number[]): number {
  return ((bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8) | ((bytes[2] ?? 0) << 16) | ((bytes[3] ?? 0) << 24)) >>> 0;
}

function authorBytes(name: number[]): number[] {
  const out = new Array(C.PLAYER_NAME_LENGTH + 1).fill(EOS);
  let i = 0;
  for (; i < C.PLAYER_NAME_LENGTH && i < name.length && name[i] !== EOS; i++) out[i] = name[i] & 0xff;
  for (; i <= 5; i++) out[i] = CHAR_SPACE;
  out[i] = EOS;
  return out;
}

function copiedNameBytes(name: number[]): number[] {
  const out = new Array(C.PLAYER_NAME_LENGTH + 1).fill(EOS);
  for (let i = 0; i < C.PLAYER_NAME_LENGTH && i < name.length && name[i] !== EOS; i++) out[i] = name[i] & 0xff;
  return out;
}

function messageFromMailData(mail: MailData): MailMessage {
  const eos = mail.playerName.indexOf(EOS);
  return {
    words: [...mail.words],
    author: mail.playerName.slice(0, eos < 0 ? mail.playerName.length : eos + 1),
    authorId: authorId(mail.trainerId),
  };
}

/** MonHasMail (mail_data.c). */
export function MonHasMail(mon: Pokemon): boolean {
  return isMailItem(mon.heldItem) && (mon.mail ?? C.MAIL_NONE) !== C.MAIL_NONE;
}

/** GiveMailToMon (mail_data.c): allocate the corresponding party mail slot. */
export function GiveMailToMon(mon: Pokemon, itemId: number): number {
  for (let id = 0; id < C.PARTY_SIZE; id++) {
    if (save.mail[id].itemId !== C.ITEM_NONE) continue;
    const mail = save.mail[id];
    ClearMailStruct(mail);
    mail.playerName = authorBytes(save.playerName);
    const trainerId = save.trainerId >>> 0;
    mail.trainerId = [trainerId & 0xff, (trainerId >>> 8) & 0xff, (trainerId >>> 16) & 0xff, (trainerId >>> 24) & 0xff];
    mail.species = SpeciesToMailSpecies(mon.species, mon.personality);
    mail.itemId = itemId & 0xffff;
    mon.mail = id;
    mon.mailMessage = messageFromMailData(mail);
    mon.heldItem = itemId & 0xffff;
    return id;
  }
  return C.MAIL_NONE;
}

/** GiveMailToMon2 (mail_data.c): allocate a party slot and copy a Mail record. */
export function GiveMailToMon2(mon: Pokemon, mail: MailData): number {
  const id = GiveMailToMon(mon, mail.itemId);
  if (id === C.MAIL_NONE) return C.MAIL_NONE;
  const target = save.mail[id];
  target.words = [...mail.words];
  target.playerName = [...mail.playerName];
  target.trainerId = [...mail.trainerId];
  target.species = mail.species;
  target.itemId = mail.itemId;
  mon.mailMessage = messageFromMailData(target);
  mon.heldItem = mail.itemId;
  return id;
}

/** mail_data.c DummyMailFunc: the source's unused placeholder always returns FALSE. */
export function DummyMailFunc(): boolean {
  return false;
}

/** Copy the saved record for a mail-holding Pokémon. */
export function GetMailDataForMon(mon: Pokemon): MailData | undefined {
  const mail = currentMailData(mon);
  if (!mail) return undefined;
  return { words: [...mail.words], playerName: [...mail.playerName], trainerId: [...mail.trainerId], species: mail.species, itemId: mail.itemId };
}

/** TakeMailFromMon (mail_data.c). */
export function TakeMailFromMon(mon: Pokemon): void {
  if (!MonHasMail(mon)) return;
  const mail = currentMailData(mon);
  if (mail) mail.itemId = C.ITEM_NONE;
  mon.mail = C.MAIL_NONE;
  mon.heldItem = C.ITEM_NONE;
  mon.mailMessage = undefined;
}

/** ClearMailItemId (mail_data.c). */
export function ClearMailItemId(mailId: number): void {
  if (mailId >= 0 && mailId < save.mail.length) save.mail[mailId].itemId = C.ITEM_NONE;
}

/** TakeMailFromMon2 (mail_data.c): copy a held party record into the first free PC slot. */
export function TakeMailFromMon2(mon: Pokemon): number {
  const source = currentMailData(mon);
  if (!source) return C.MAIL_NONE;
  for (let id = C.PARTY_SIZE; id < C.MAIL_COUNT; id++) {
    if (save.mail[id].itemId !== C.ITEM_NONE) continue;
    const target = save.mail[id];
    target.words = [...source.words];
    target.playerName = [...source.playerName];
    target.trainerId = [...source.trainerId];
    target.species = source.species;
    target.itemId = source.itemId;
    source.itemId = C.ITEM_NONE;
    mon.mail = C.MAIL_NONE;
    mon.heldItem = C.ITEM_NONE;
    mon.mailMessage = undefined;
    return id;
  }
  return C.MAIL_NONE;
}

/** CountPCMail (player_pc.c), over mail slots after the party records. */
export function CountPCMail(): number {
  return save.mail.slice(C.PARTY_SIZE).filter((mail) => mail.itemId !== C.ITEM_NONE).length;
}

/** PCMailCompaction (player_pc.c), preserving the order of nonempty records. */
export function PCMailCompaction(): void {
  const pc = save.mail.slice(C.PARTY_SIZE);
  const occupied = pc.filter((mail) => mail.itemId !== C.ITEM_NONE);
  const empty = pc.filter((mail) => mail.itemId === C.ITEM_NONE);
  save.mail.splice(C.PARTY_SIZE, pc.length, ...occupied, ...empty);
}

/** Get the mail record at the compacted PC mailbox list index. */
export function GetPCMail(index: number): MailData | undefined {
  const slot = C.PARTY_SIZE + index;
  return index >= 0 && index < C.MAIL_COUNT - C.PARTY_SIZE ? save.mail[slot] : undefined;
}

/** PC mailbox view derived from SaveBlock1 mail slots. */
export function GetPCMailEntry(index: number): PcMailEntry | undefined {
  const mail = GetPCMail(index);
  return mail ? { item: mail.itemId, message: messageFromMailData(mail) } : undefined;
}

/** Clear a mailbox entry and compact the 10 SaveBlock PC mail slots. */
export function ClearPCMailEntry(index: number): void {
  const mail = GetPCMail(index);
  if (!mail) return;
  ClearMailStruct(mail);
  PCMailCompaction();
}

/** Blank message, as a bag mail item or a fresh GIVE carries (messageExists=FALSE). */
export function blankMail(): MailMessage {
  return { words: new Array(MAIL_WORDS_COUNT).fill(EC_WORD_UNDEFINED), author: [], authorId: 0 };
}

export function hasMessageText(msg: MailMessage | undefined): boolean {
  return !!msg && msg.words.some((w) => w !== EC_WORD_UNDEFINED);
}

// ---------------------------------------------------------------- easy-chat words
// CopyEasyChatWord / ConvertEasyChatWordsToString live in easyChat.ts (easy_chat.c).
export { CopyEasyChatWord, ConvertEasyChatWordsToString };

/** BufferMailMessage's active 5x2 layout: ConvertEasyChatWordsToString for
 * each row (two words in rows 0..3, one word in row 4). C appends a space
 * after the first defined word even when the second word is undefined. */
export function BufferMailMessage(words: number[]): string[] {
  const lines: string[] = [];
  let index = 0;
  for (let row = 0; row < 5; row++) {
    const columns = row < 4 ? 2 : 1;
    lines.push(ConvertEasyChatWordsToString(words.slice(index, index + columns), columns, 1));
    index += columns;
  }
  return lines;
}

/** Rows AddMailMessagePrinters displays, omitting EOS/leading-space rows. */
export function mailLines(words: number[]): string[] {
  return BufferMailMessage(words).filter((line) => line !== "" && line[0] !== " ");
}

// ---------------------------------------------------------------- attach / take

/** GetInGameTradeMail: words, author and ids from sInGameTradeMailMessages. */
export function attachTradeMail(mon: Pokemon, mailNum: number, otName: number[], otId: number): void {
  if (!hasCData("trade_scene", "sInGameTradeMailMessages")) return;
  const table = cdata<number[][]>("trade_scene", "sInGameTradeMailMessages");
  const row = table[mailNum];
  if (!row) return;
  const trainerId = otId >>> 0;
  const mail = blankMailData();
  mail.words = row.slice(0, MAIL_WORDS_COUNT);
  mail.playerName = copiedNameBytes(otName);
  mail.trainerId = [(trainerId >>> 24) & 0xff, (trainerId >>> 16) & 0xff, (trainerId >>> 8) & 0xff, trainerId & 0xff];
  mail.species = mon.species;
  mail.itemId = mon.heldItem;
  GiveMailToMon2(mon, mail);
}

/** GetInGameTradeMail (trade_scene.c): build the mail record from the scripted trader. */
export function GetInGameTradeMail(mon: Pokemon, mailNum: number, otName: number[], otId: number): void {
  attachTradeMail(mon, mailNum, otName, otId);
}

/** TakeMailFromMon: clears the held mail item and its message. */
export function takeMail(mon: Pokemon): number {
  const item = mon.heldItem;
  TakeMailFromMon(mon);
  return item;
}
