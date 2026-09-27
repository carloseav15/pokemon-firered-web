// SaveBlock1/SaveBlock2 equivalents and event_data.c (flags and vars).

import { CHAR_SPACE, encode, EOS } from "./gba/charmap";
import { bindSaveBlockReader } from "./gba/stringBuffers";
import { rom } from "./rom";
import type { Pokemon } from "./pokemon/pokemon";
import * as C from "./generated/constants";

export const VARS_START = 0x4000;
export const VARS_END = 0x40ff;
export const SPECIAL_VARS_START = 0x8000;
export const SPECIAL_FLAGS_START = 0x4000;
export const FLAGS_COUNT = 0x900;
export const TEMP_FLAGS_START = 0x0;
export const TEMP_FLAGS_END = 0x1f;
export const TEMP_VARS_START = 0x4000;
export const TEMP_VARS_END = 0x400f;

export type WarpData = { mapGroup: number; mapNum: number; warpId: number; x: number; y: number };

export type BagPocket = Array<{ item: number; quantity: number }>;
export type PcMailEntry = { item: number; message: { words: number[]; author: number[]; authorId: number } };
export type MailData = { words: number[]; playerName: number[]; trainerId: number[]; species: number; itemId: number };
export type RamScriptSave = { checksum: number; data: { magic: number; mapGroup: number; mapNum: number; objectId: number; script: number[] } };
export interface WonderNewsMetadata {
  newsType: number;
  sentRewardCounter: number;
  rewardCounter: number;
  berry: number;
}
export interface WonderNews {
  id: number;
  sendType: number;
  bgType: number;
  titleText: number[];
  bodyText: number[][];
}

function emptyMailData(): MailData {
  return {
    words: new Array(C.MAIL_WORDS_COUNT).fill(C.EC_WORD_UNDEFINED),
    playerName: new Array(C.PLAYER_NAME_LENGTH + 1).fill(EOS),
    trainerId: [0, 0, 0, 0],
    species: C.SPECIES_BULBASAUR,
    itemId: C.ITEM_NONE,
  };
}

function mailAuthor(name: number[]): number[] {
  const out = new Array(C.PLAYER_NAME_LENGTH + 1).fill(EOS);
  let i = 0;
  for (; i < C.PLAYER_NAME_LENGTH && i < name.length && name[i] !== EOS; i++) out[i] = name[i] & 0xff;
  for (; i <= 5; i++) out[i] = CHAR_SPACE;
  out[i] = EOS;
  return out;
}

function mailTrainerId(id: number): number[] {
  const value = id >>> 0;
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

export type SaveData = {
  version: 2;
  playerName: number[];
  playerGender: number;
  trainerId: number;
  rivalName: number[];
  location: WarpData;
  pos: { x: number; y: number };
  continueGameWarp: WarpData;
  dynamicWarp: WarpData;
  lastHealLocation: WarpData;
  escapeWarp: WarpData;
  flags: number[];
  vars: number[];
  money: number;
  coins: number;
  mail: MailData[];
  bag: { items: BagPocket; keyItems: BagPocket; pokeBalls: BagPocket; tmCase: BagPocket; berryPouch: BagPocket };
  pcItems: BagPocket;
  registeredItem: number;
  party: Pokemon[];
  boxes: Array<Array<Pokemon | null>>;
  currentBox: number;
  boxNames?: number[][];
  boxWallpapers?: number[];
  pokedexSeen: number[];
  pokedexCaught: number[];
  gameStats: number[];
  giftRibbons?: number[];
  battleTower?: number[];
  miniGameResults?: { berryCrush: number[]; pokemonJump: number[]; berryPicking: number[]; berryPowder: number };
  playTimeFrames: number;
  options: { textSpeed: number; battleScene: boolean; battleStyle: number; sound: number; buttonMode: number; frameType: number };
  savedMusic: number;
  playerAvatarFlags: number;
  facing: number;
  weather?: number;
  weatherCycleStage?: number;
  nationalDexMagic?: number;
  nationalDexRseMagic?: number;
  objectEvents?: unknown;
  objectEventTemplates?: unknown;
  daycare?: unknown;
  berryPowder?: number;
  trainerRematchStepCounter?: number;
  trainerRematches?: number[];
  roamer?: unknown;
  ramScript?: RamScriptSave;
  wonderNewsMetadata?: WonderNewsMetadata;
  wonderNews?: WonderNews;
  wonderNewsCrc?: number;
  /** Browser-save representation of recorded Quest Log events. */
  questLogEvents?: Array<{
    eventId: number;
    data: { totalMoney: number; lastItemId: number; itemQuantity: number; mapSec: number; hasMultipleTransactions: boolean; logEventId: number }
      | { itemId: number; mapSec: number }
      | { trainerId: number; speciesOpponent: number; speciesPlayer: number; mapSec: number; hpFractionId: number }
      | { defeatedSpecies: number; caughtSpecies: number; mapSec: number };
  }>;
  /** Serialized avatar graphics actions captured while Quest Log recording is active. */
  questLogPlayerGfxActions?: Array<{ eventIndex: number; script: number[] }>;
};

function emptyRamScript(): RamScriptSave {
  return { checksum: 0, data: { magic: 0, mapGroup: 0, mapNum: 0, objectId: 0, script: new Array(995).fill(0) } };
}

const STORAGE_KEY = "pokemon-gba-web-lab.firered.v2";

function emptyWarp(): WarpData {
  return { mapGroup: 0xff, mapNum: 0xff, warpId: 0xff, x: -1, y: -1 };
}

export function newSaveData(): SaveData {
  return {
    version: 2,
    playerName: [0xff],
    playerGender: 0,
    // new_game.c InitPlayerTrainerId assigns this after title-screen RNG seeding.
    trainerId: 0,
    rivalName: [0xff],
    location: emptyWarp(),
    pos: { x: 0, y: 0 },
    continueGameWarp: emptyWarp(),
    dynamicWarp: emptyWarp(),
    lastHealLocation: emptyWarp(),
    escapeWarp: emptyWarp(),
    flags: new Array(FLAGS_COUNT / 8).fill(0),
    vars: new Array(VARS_END - VARS_START + 1).fill(0),
    money: 3000,
    coins: 0,
    mail: Array.from({ length: C.MAIL_COUNT }, emptyMailData),
    bag: { items: [], keyItems: [], pokeBalls: [], tmCase: [], berryPouch: [] },
    pcItems: [],
    registeredItem: 0,
    party: [],
    boxes: Array.from({ length: 14 }, () => new Array(30).fill(null)),
    currentBox: 0,
    pokedexSeen: new Array(52).fill(0),
    pokedexCaught: new Array(52).fill(0),
    gameStats: new Array(64).fill(0),
    giftRibbons: new Array(C.GIFT_RIBBONS_COUNT).fill(0),
    battleTower: [],
    miniGameResults: { berryCrush: [], pokemonJump: [], berryPicking: [], berryPowder: 0 },
    playTimeFrames: 0,
    options: { textSpeed: 1, battleScene: true, battleStyle: 0, sound: 0, buttonMode: 0, frameType: 0 },
    savedMusic: 0,
    playerAvatarFlags: 1,
    facing: 1,
    weatherCycleStage: 0,
    nationalDexMagic: 0,
    nationalDexRseMagic: 0,
    questLogEvents: [],
    questLogPlayerGfxActions: [],
    ramScript: emptyRamScript(),
    wonderNewsMetadata: { newsType: 0, sentRewardCounter: 0, rewardCounter: 0, berry: 0 },
  };
}

/** The live save state (gSaveBlock1Ptr / gSaveBlock2Ptr). */
export let save: SaveData = newSaveData();

// gSaveBlock1Ptr/gSaveBlock2Ptr for the generated ExpandPlaceholder_* functions.
bindSaveBlockReader(() => save);

export function setSave(data: SaveData): void {
  const legacy = data as SaveData & { pcMail?: PcMailEntry[] };
  if (!Array.isArray(data.mail) || data.mail.length !== C.MAIL_COUNT) {
    data.mail = Array.from({ length: C.MAIL_COUNT }, emptyMailData);
    for (let i = 0; i < Math.min(10, legacy.pcMail?.length ?? 0); i++) {
      const entry = legacy.pcMail![i];
      const target = data.mail[C.PARTY_SIZE + i];
      target.words = [...entry.message.words];
      target.playerName = mailAuthor(entry.message.author);
      target.trainerId = mailTrainerId(entry.message.authorId);
      target.itemId = entry.item;
    }
    for (let i = 0; i < Math.min(C.PARTY_SIZE, data.party.length); i++) {
      const mon = data.party[i];
      const item = mon.heldItem;
      if (item < C.ITEM_ORANGE_MAIL || item > C.ITEM_RETRO_MAIL) continue;
      const slot = data.mail[i];
      slot.words = [...(mon.mailMessage?.words ?? new Array(C.MAIL_WORDS_COUNT).fill(0xffff))];
      slot.playerName = mailAuthor(mon.mailMessage?.author ?? data.playerName);
      slot.trainerId = mailTrainerId(mon.mailMessage?.authorId ?? data.trainerId);
      slot.species = mon.species;
      slot.itemId = item;
      mon.mail = i;
    }
  }
  delete legacy.pcMail;
  data.ramScript ??= emptyRamScript();
  data.questLogEvents ??= [];
  data.questLogPlayerGfxActions ??= [];
  data.questLogPlayerGfxActions = data.questLogPlayerGfxActions.filter((entry): entry is { eventIndex: number; script: number[] } =>
    !!entry && typeof entry === "object" && Number.isInteger(entry.eventIndex) && Array.isArray(entry.script));
  // Migrate browser saves created before event_data.c's nationalDexMagic was represented.
  if (data.nationalDexMagic === undefined) {
    const flag = C.FLAG_SYS_NATIONAL_DEX;
    data.nationalDexMagic = data.vars[C.VAR_NATIONAL_DEX - VARS_START] === 0x6258
      && (((data.flags[flag >> 3] ?? 0) & (1 << (flag & 7))) !== 0) ? 0xb9 : 0;
  }
  save = data;
}

// play_time.c: one persisted frame count represents hours/minutes/seconds/VBlanks.
export const MAX_PLAY_TIME_FRAMES = 215_999_999;
const PLAY_TIME_STOPPED = 0;
const PLAY_TIME_RUNNING = 1;
const PLAY_TIME_MAXED_OUT = 2;
let playTimeCounterState = PLAY_TIME_STOPPED;

export function PlayTimeCounter_Reset(): void {
  playTimeCounterState = PLAY_TIME_STOPPED;
  save.playTimeFrames = 0;
}

export function PlayTimeCounter_Start(): void {
  if (save.playTimeFrames > MAX_PLAY_TIME_FRAMES) PlayTimeCounter_SetToMax();
  else playTimeCounterState = PLAY_TIME_RUNNING;
}

export function PlayTimeCounter_Stop(): void {
  playTimeCounterState = PLAY_TIME_STOPPED;
}

export function PlayTimeCounter_Update(): void {
  if (playTimeCounterState !== PLAY_TIME_RUNNING) return;
  if (save.playTimeFrames >= MAX_PLAY_TIME_FRAMES) {
    PlayTimeCounter_SetToMax();
    return;
  }
  save.playTimeFrames++;
  if (save.playTimeFrames >= MAX_PLAY_TIME_FRAMES) playTimeCounterState = PLAY_TIME_MAXED_OUT;
}

export function PlayTimeCounter_SetToMax(): void {
  playTimeCounterState = PLAY_TIME_MAXED_OUT;
  save.playTimeFrames = MAX_PLAY_TIME_FRAMES;
}

export const specialVars = new Uint16Array(0x15);
const specialFlags = new Uint8Array(0x10);

export const SV = {
  x8000: 0x8000, x8001: 0x8001, x8002: 0x8002, x8003: 0x8003, x8004: 0x8004, x8005: 0x8005, x8006: 0x8006, x8007: 0x8007,
  x8008: 0x8008, x8009: 0x8009, x800A: 0x800a, x800B: 0x800b, FACING: 0x800c, RESULT: 0x800d, ITEM_ID: 0x800e,
  LAST_TALKED: 0x800f, MON_BOX_ID: 0x8010, MON_BOX_POS: 0x8011, TEXT_COLOR: 0x8012, PREV_TEXT_COLOR: 0x8013, x8014: 0x8014,
};

export function varGet(id: number): number {
  if (id < VARS_START) return id;
  if (id < SPECIAL_VARS_START) return save.vars[id - VARS_START] ?? 0;
  const index = id - SPECIAL_VARS_START;
  if (index < specialVars.length) return specialVars[index];
  return id;
}

export function varSet(id: number, value: number): boolean {
  if (id < VARS_START) return false;
  if (id < SPECIAL_VARS_START) {
    save.vars[id - VARS_START] = value & 0xffff;
    return true;
  }
  const index = id - SPECIAL_VARS_START;
  if (index >= specialVars.length) return false;
  specialVars[index] = value & 0xffff;
  return true;
}

export function flagGet(id: number): boolean {
  if (id === 0) return false;
  if (id < SPECIAL_FLAGS_START) return ((save.flags[id >> 3] ?? 0) & (1 << (id & 7))) !== 0;
  const index = id - SPECIAL_FLAGS_START;
  return (specialFlags[index >> 3] & (1 << (index & 7))) !== 0;
}

export function flagSet(id: number): void {
  if (id === 0) return;
  if (id < SPECIAL_FLAGS_START) save.flags[id >> 3] = (save.flags[id >> 3] ?? 0) | (1 << (id & 7));
  else {
    const index = id - SPECIAL_FLAGS_START;
    specialFlags[index >> 3] |= 1 << (index & 7);
  }
}

export function flagClear(id: number): void {
  if (id === 0) return;
  if (id < SPECIAL_FLAGS_START) save.flags[id >> 3] = (save.flags[id >> 3] ?? 0) & ~(1 << (id & 7));
  else {
    const index = id - SPECIAL_FLAGS_START;
    specialFlags[index >> 3] &= ~(1 << (index & 7));
  }
}

/** InitEventData: clear save-backed flags, vars, and temporary special flags. */
export function InitEventData(): void {
  save.flags.fill(0);
  save.vars.fill(0);
  specialFlags.fill(0);
}

/** ResetSpecialVars resets the complete gSpecialVar_0x8000..0x8014 table. */
export function ResetSpecialVars(): void { specialVars.fill(0); }

/** National Pokédex enable/disable markers from event_data.c. */
export function DisableNationalPokedex(): void {
  save.nationalDexMagic = 0;
  varSet(C.VAR_NATIONAL_DEX, 0);
  flagClear(C.FLAG_SYS_NATIONAL_DEX);
}
export function EnableNationalPokedex(): void {
  save.nationalDexMagic = 0xb9;
  varSet(C.VAR_NATIONAL_DEX, 0x6258);
  flagSet(C.FLAG_SYS_NATIONAL_DEX);
}
export function IsNationalPokedexEnabled(): boolean {
  return save.nationalDexMagic === 0xb9 && varGet(C.VAR_NATIONAL_DEX) === 0x6258 && flagGet(C.FLAG_SYS_NATIONAL_DEX);
}

/** Unused RSE compatibility routines retained in event_data.c. */
export function DisableNationalPokedex_RSE(): void {
  save.nationalDexRseMagic = 0;
  varSet(rom.c("VAR_0x403C"), 0);
  flagClear(rom.c("FLAG_0x838"));
}
export function EnableNationalPokedex_RSE(): void {
  save.nationalDexRseMagic = 0xda;
  varSet(rom.c("VAR_0x403C"), 0x0302);
  flagSet(rom.c("FLAG_0x838"));
}
export function IsNationalPokedexEnabled_RSE(): boolean {
  return save.nationalDexRseMagic === 0xda
    && varGet(rom.c("VAR_0x403C")) === 0x0302
    && flagGet(rom.c("FLAG_0x838"));
}

/** Mystery Gift and RTC reset gates/clearing routines from event_data.c. */
export function DisableMysteryGift(): void { flagClear(C.FLAG_SYS_MYSTERY_GIFT_ENABLED); }
export function EnableMysteryGift(): void { flagSet(C.FLAG_SYS_MYSTERY_GIFT_ENABLED); }
export function IsMysteryGiftEnabled(): boolean { return flagGet(C.FLAG_SYS_MYSTERY_GIFT_ENABLED); }
export function ClearMysteryGiftFlags(): void {
  flagClear(C.FLAG_MYSTERY_GIFT_DONE);
  for (let i = 1; i <= 15; i++) flagClear(C.FLAG_MYSTERY_GIFT_1 + i - 1);
}
export function ClearMysteryGiftVars(): void {
  for (const id of [C.VAR_EVENT_PICHU_SLOT, C.VAR_MYSTERY_GIFT_1, C.VAR_MYSTERY_GIFT_2, C.VAR_MYSTERY_GIFT_3,
    C.VAR_MYSTERY_GIFT_4, C.VAR_MYSTERY_GIFT_5, C.VAR_MYSTERY_GIFT_6, C.VAR_MYSTERY_GIFT_7, C.VAR_ALTERING_CAVE_WILD_SET]) varSet(id, 0);
}
export function DisableResetRTC(): void {
  varSet(C.VAR_RESET_RTC_ENABLE, 0);
  flagClear(C.FLAG_SYS_RESET_RTC_ENABLE);
}
export function EnableResetRTC(): void {
  varSet(C.VAR_RESET_RTC_ENABLE, 0x0920);
  flagSet(C.FLAG_SYS_RESET_RTC_ENABLE);
}
export function CanResetRTC(): boolean {
  return flagGet(C.FLAG_SYS_RESET_RTC_ENABLE) && varGet(C.VAR_RESET_RTC_ENABLE) === 0x0920;
}

/** VarGetObjectEventGraphicsId. */
export function VarGetObjectEventGraphicsId(index: number): number { return varGet(C.VAR_OBJ_GFX_ID_0 + index) & 0xff; }

/** C-compatible flag/variable names and live storage pointers. */
export type EventDataPointer = { value: number };
export function VarGet(index: number): number { return varGet(index); }
export function VarSet(index: number, value: number): boolean { return varSet(index, value); }
export function FlagGet(index: number): boolean { return flagGet(index); }
export function FlagSet(index: number): boolean { flagSet(index); return false; }
export function FlagClear(index: number): boolean { flagClear(index); return false; }

export function GetVarPointer(index: number): EventDataPointer | null {
  if (index < VARS_START) return null;
  if (index < SPECIAL_VARS_START) {
    const slot = index - VARS_START;
    if (slot >= save.vars.length) return null;
    return { get value() { return save.vars[slot] ?? 0; }, set value(v: number) { save.vars[slot] = v & 0xffff; } };
  }
  const slot = index - SPECIAL_VARS_START;
  if (slot >= specialVars.length) return null;
  return { get value() { return specialVars[slot]; }, set value(v: number) { specialVars[slot] = v & 0xffff; } };
}

export function GetFlagAddr(index: number): EventDataPointer | null {
  if (index === 0 || index >= FLAGS_COUNT && index < SPECIAL_FLAGS_START) return null;
  if (index < SPECIAL_FLAGS_START) {
    const slot = index >> 3;
    return { get value() { return save.flags[slot] ?? 0; }, set value(v: number) { save.flags[slot] = v & 0xff; } };
  }
  const slot = (index - SPECIAL_FLAGS_START) >> 3;
  if (slot >= specialFlags.length) return null;
  return { get value() { return specialFlags[slot]; }, set value(v: number) { specialFlags[slot] = v & 0xff; } };
}

/** IsFlagOrVarStoredInQuestLog eligibility rules; storage/playback itself is not implemented. */
export function IsFlagOrVarStoredInQuestLog(index: number, isVar: boolean): boolean {
  if (!isVar) return index >= C.STORY_FLAGS_START && !(index >= C.SYS_FLAGS && index < C.PERMA_SYS_FLAGS_START);
  const firstRecorded = C.VAR_ICE_STEP_COUNT - VARS_START;
  const firstUnrecordedScene = C.VAR_MAP_SCENE_PALLET_TOWN_OAK - VARS_START;
  const firstRecordedAfterScene = C.VAR_PORTHOLE - VARS_START;
  return index >= firstRecorded && !(index >= firstUnrecordedScene && index < firstRecordedAfterScene);
}

/** ClearTempFieldEventData */
export function clearTempFieldEventData(): void {
  for (let i = TEMP_FLAGS_START >> 3; i <= TEMP_FLAGS_END >> 3; i++) save.flags[i] = 0;
  for (let v = TEMP_VARS_START; v <= TEMP_VARS_END; v++) save.vars[v - VARS_START] = 0;
  for (const name of ["FLAG_SYS_WHITE_FLUTE_ACTIVE", "FLAG_SYS_BLACK_FLUTE_ACTIVE", "FLAG_SYS_USE_STRENGTH", "FLAG_SYS_SPECIAL_WILD_BATTLE", "FLAG_SYS_INFORMED_OF_LOCAL_WIRELESS_PLAYER"]) {
    if (name in rom.constants) flagClear(rom.c(name));
  }
}

export function incrementGameStat(index: number): void {
  if (index < save.gameStats.length) save.gameStats[index] = Math.min(0xffffff, (save.gameStats[index] ?? 0) + 1);
}

export function playerName(): Uint8Array {
  return Uint8Array.from(save.playerName);
}

export function rivalName(): Uint8Array {
  return Uint8Array.from(save.rivalName);
}

export function setName(target: "player" | "rival", name: Uint8Array): void {
  const bytes = Array.from(name);
  const end = bytes.indexOf(EOS);
  const trimmed = end >= 0 ? bytes.slice(0, end + 1) : [...bytes, EOS];
  if (target === "player") save.playerName = trimmed;
  else save.rivalName = trimmed;
}

export const saveStore = {
  exists(): boolean {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
  },
  load(): SaveData | undefined {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return undefined;
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== 2) return undefined;
      return data;
    } catch {
      return undefined;
    }
  },
  /** ClearSaveData */
  clear(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  },
  write(data: SaveData = save): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  },
};
