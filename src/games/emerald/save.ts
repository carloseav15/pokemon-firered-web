// @game/save for Emerald: SaveBlock1/SaveBlock2 (pokeemerald include/global.h) and event_data.c,
// plus the game stat accessors of overworld.c. Same browser representation as
// src/games/firered/save.ts for the fields both games share; sizes and IDs are Emerald's.
// NewGameInitData (new_game.c) is not ported here: newSaveData() is the zeroed block of
// ClearSav1/ClearSav2 before it runs.

import type { Pokemon } from "@core/pokemon/pokemon";
import type { MapObjectTemplate } from "@core/rom";
import { CANONICAL_STORAGE_KEY, SANDBOX_STORAGE_KEY } from "./data";
import * as C from "./generated/constants";

export const VARS_START = C.VARS_START;
export const VARS_END = C.VARS_END;
export const SPECIAL_VARS_START = C.SPECIAL_VARS_START;
export const SPECIAL_FLAGS_START = C.SPECIAL_FLAGS_START;
export const FLAGS_COUNT = C.FLAGS_COUNT;
export const TEMP_FLAGS_START = C.TEMP_FLAGS_START;
export const TEMP_FLAGS_END = C.TEMP_FLAGS_END;
export const TEMP_VARS_START = C.TEMP_VARS_START;
export const TEMP_VARS_END = C.TEMP_VARS_END;

// event_data.c sizes.
const NUM_SPECIAL_FLAGS = C.SPECIAL_FLAGS_END - C.SPECIAL_FLAGS_START + 1;
const NUM_TEMP_FLAGS = C.TEMP_FLAGS_END - C.TEMP_FLAGS_START + 1;
const SPECIAL_FLAGS_SIZE = NUM_SPECIAL_FLAGS / 8;
const TEMP_FLAGS_SIZE = NUM_TEMP_FLAGS / 8;
const DAILY_FLAGS_SIZE = C.NUM_DAILY_FLAGS / 8;

export type WarpData = { mapGroup: number; mapNum: number; warpId: number; x: number; y: number };
export type BagPocket = Array<{ item: number; quantity: number }>;
/** global.h struct Mail. */
export type MailData = { words: number[]; playerName: number[]; trainerId: number[]; species: number; itemId: number };
/** Legacy browser PC-mail entry; shared with the FireRed contract, unused by Emerald's SaveBlock1.mail. */
export type PcMailEntry = { item: number; message: { words: number[]; author: number[]; authorId: number } };
export type RamScriptSave = { checksum: number; data: { magic: number; mapGroup: number; mapNum: number; objectId: number; script: number[] } };

export type SaveData = {
  version: 2;
  // SaveBlock2
  playerName: number[];
  playerGender: number;
  specialSaveWarpFlags: number;
  trainerId: number;
  /** playTimeHours/Minutes/Seconds/VBlanks kept as one frame count, as in the FireRed representation. */
  playTimeFrames: number;
  options: { textSpeed: number; battleScene: boolean; battleStyle: number; sound: number; buttonMode: number; frameType: number };
  pokedexSeen: number[];
  pokedexCaught: number[];
  /** SaveBlock2.pokedex.nationalMagic / mode / order. */
  nationalDexMagic: number;
  pokedexMode: number;
  pokedexOrder: number;
  encryptionKey: number;
  // SaveBlock1
  pos: { x: number; y: number };
  location: WarpData;
  continueGameWarp: WarpData;
  dynamicWarp: WarpData;
  lastHealLocation: WarpData;
  escapeWarp: WarpData;
  savedMusic: number;
  weather: number;
  weatherCycleStage: number;
  flashLevel: number;
  mapLayoutId: number;
  mapView: number[];
  party: Pokemon[];
  money: number;
  coins: number;
  registeredItem: number;
  pcItems: BagPocket;
  bag: { items: BagPocket; keyItems: BagPocket; pokeBalls: BagPocket; tmHm: BagPocket; berries: BagPocket };
  seen1: number[];
  trainerRematchStepCounter: number;
  trainerRematches: number[];
  objectEventTemplates: MapObjectTemplate[];
  flags: number[];
  vars: number[];
  gameStats: number[];
  easyChatProfile: number[];
  easyChatBattleStart: number[];
  easyChatBattleWon: number[];
  easyChatBattleLost: number[];
  mail: MailData[];
  giftRibbons: number[];
  /** berry.h EnigmaBerry, serialized as its GBA bytes. */
  enigmaBerry: number[];
  ramScript: RamScriptSave;
  seen2: number[];
  rivalName: number[];
  // PokemonStorage (gPokemonStoragePtr)
  currentBox: number;
  boxes: Array<Array<Pokemon | null>>;
  boxNames: number[][];
  boxWallpapers: number[];
  /** Viewer/browser field kept as in the FireRed representation: the saved facing direction. */
  facing: number;
  /** SaveBlock1.outbreak* (tv.c mass outbreaks), read by wild_encounter.c. */
  outbreak: { species: number; locationMapNum: number; locationMapGroup: number; level: number; moves: number[]; probability: number; daysLeft: number };
  /** SaveBlock1.contestWinners (struct ContestWinner; species is what CountPlayerMuseumPaintings reads). */
  contestWinners: Array<{ personality: number; trainerId: number; species: number; contestCategory: number; monName: number[]; trainerName: number[]; contestRank: number }>;
  /** SaveBlock1.roamer (struct Roamer), read by wild_encounter.c through roamer.c. */
  roamer: { ivs: number; personality: number; species: number; hp: number; level: number; status: number; cool: number; beauty: number; cute: number; smart: number; tough: number; active: boolean };
};

const zeroWarp = (): WarpData => ({ mapGroup: 0, mapNum: 0, warpId: 0, x: 0, y: 0 });
const zeroMail = (): MailData => ({
  words: new Array(C.MAIL_WORDS_COUNT).fill(0), playerName: new Array(C.PLAYER_NAME_LENGTH + 1).fill(0),
  trainerId: new Array(C.TRAINER_ID_LENGTH).fill(0), species: 0, itemId: 0,
});

/** The zeroed save blocks (ClearSav1/ClearSav2) that NewGameInitData starts from. */
export function newSaveData(): SaveData {
  return {
    version: 2,
    playerName: new Array(C.PLAYER_NAME_LENGTH + 1).fill(0),
    playerGender: 0,
    specialSaveWarpFlags: 0,
    trainerId: 0,
    playTimeFrames: 0,
    options: { textSpeed: 0, battleScene: true, battleStyle: 0, sound: 0, buttonMode: 0, frameType: 0 },
    pokedexSeen: new Array(C.NUM_DEX_FLAG_BYTES).fill(0),
    pokedexCaught: new Array(C.NUM_DEX_FLAG_BYTES).fill(0),
    nationalDexMagic: 0,
    pokedexMode: 0,
    pokedexOrder: 0,
    encryptionKey: 0,
    pos: { x: 0, y: 0 },
    location: zeroWarp(),
    continueGameWarp: zeroWarp(),
    dynamicWarp: zeroWarp(),
    lastHealLocation: zeroWarp(),
    escapeWarp: zeroWarp(),
    savedMusic: 0,
    weather: 0,
    weatherCycleStage: 0,
    flashLevel: 0,
    mapLayoutId: 0,
    mapView: new Array(0x100).fill(0),
    party: [],
    money: 0,
    coins: 0,
    registeredItem: 0,
    pcItems: [],
    bag: { items: [], keyItems: [], pokeBalls: [], tmHm: [], berries: [] },
    seen1: new Array(C.NUM_DEX_FLAG_BYTES).fill(0),
    trainerRematchStepCounter: 0,
    trainerRematches: new Array(C.MAX_REMATCH_ENTRIES).fill(0),
    objectEventTemplates: [],
    flags: new Array(C.NUM_FLAG_BYTES).fill(0),
    vars: new Array(C.VARS_COUNT).fill(0),
    gameStats: new Array(C.NUM_GAME_STATS).fill(0),
    easyChatProfile: new Array(C.EASY_CHAT_BATTLE_WORDS_COUNT).fill(0),
    easyChatBattleStart: new Array(C.EASY_CHAT_BATTLE_WORDS_COUNT).fill(0),
    easyChatBattleWon: new Array(C.EASY_CHAT_BATTLE_WORDS_COUNT).fill(0),
    easyChatBattleLost: new Array(C.EASY_CHAT_BATTLE_WORDS_COUNT).fill(0),
    mail: Array.from({ length: C.MAIL_COUNT }, zeroMail),
    giftRibbons: new Array(C.GIFT_RIBBONS_COUNT).fill(0),
    enigmaBerry: new Array(0x34).fill(0),
    ramScript: { checksum: 0, data: { magic: 0, mapGroup: 0, mapNum: 0, objectId: 0, script: new Array(995).fill(0) } },
    seen2: new Array(C.NUM_DEX_FLAG_BYTES).fill(0),
    rivalName: new Array(C.PLAYER_NAME_LENGTH + 1).fill(0),
    currentBox: 0,
    boxes: Array.from({ length: C.TOTAL_BOXES_COUNT }, () => new Array(C.IN_BOX_COUNT).fill(null)),
    boxNames: Array.from({ length: C.TOTAL_BOXES_COUNT }, () => new Array(9).fill(0)),
    boxWallpapers: new Array(C.TOTAL_BOXES_COUNT).fill(0),
    facing: 0,
    outbreak: { species: 0, locationMapNum: 0, locationMapGroup: 0, level: 0, moves: new Array(C.MAX_MON_MOVES).fill(0), probability: 0, daysLeft: 0 },
    contestWinners: Array.from({ length: C.NUM_CONTEST_WINNERS }, () => ({ personality: 0, trainerId: 0, species: 0, contestCategory: 0,
      monName: new Array(C.POKEMON_NAME_LENGTH + 1).fill(0), trainerName: new Array(C.PLAYER_NAME_LENGTH + 1).fill(0), contestRank: 0 })),
    roamer: { ivs: 0, personality: 0, species: 0, hp: 0, level: 0, status: 0, cool: 0, beauty: 0, cute: 0, smart: 0, tough: 0, active: false },
  };
}

/** gSaveBlock1Ptr / gSaveBlock2Ptr. */
export let save: SaveData = newSaveData();
export function setSave(data: SaveData): void { save = data; }

// event_data.c EWRAM state: gSpecialVar_* (gSpecialVars order, data/event_scripts.s) and sSpecialFlags.
// The last gSpecialVars entry is gTrainerBattleOpponent_A (VAR_TRAINER_BATTLE_OPPONENT_A).
export const specialVars = new Uint16Array(C.SPECIAL_VARS_END - C.SPECIAL_VARS_START + 1);
const sSpecialFlags = new Uint8Array(SPECIAL_FLAGS_SIZE);

// VAR_0x8000..VAR_0x800B and VAR_UNUSED_0x8014 are named by their value (the generated constants skip them).
export const SV = {
  x8000: 0x8000, x8001: 0x8001, x8002: 0x8002, x8003: 0x8003, x8004: 0x8004, x8005: 0x8005, x8006: 0x8006, x8007: 0x8007,
  x8008: 0x8008, x8009: 0x8009, x800A: 0x800a, x800B: 0x800b, FACING: C.VAR_FACING, RESULT: C.VAR_RESULT, ITEM_ID: C.VAR_ITEM_ID,
  LAST_TALKED: C.VAR_LAST_TALKED, CONTEST_RANK: C.VAR_CONTEST_RANK, CONTEST_CATEGORY: C.VAR_CONTEST_CATEGORY,
  MON_BOX_ID: C.VAR_MON_BOX_ID, MON_BOX_POS: C.VAR_MON_BOX_POS, x8014: 0x8014,
  TRAINER_BATTLE_OPPONENT_A: C.VAR_TRAINER_BATTLE_OPPONENT_A,
};

/** A u16/u8 cell in SaveBlock1 or event_data.c's EWRAM (the C pointer GetVarPointer/GetFlagPointer returns). */
export type EventDataPointer = { value: number };

export function InitEventData(): void {
  save.flags.fill(0);
  save.vars.fill(0);
  sSpecialFlags.fill(0);
}

export function ClearTempFieldEventData(): void {
  save.flags.fill(0, TEMP_FLAGS_START / 8, TEMP_FLAGS_START / 8 + TEMP_FLAGS_SIZE);
  save.vars.fill(0, TEMP_VARS_START - VARS_START, TEMP_VARS_START - VARS_START + C.NUM_TEMP_VARS);
  FlagClear(C.FLAG_SYS_ENC_UP_ITEM);
  FlagClear(C.FLAG_SYS_ENC_DOWN_ITEM);
  FlagClear(C.FLAG_SYS_USE_STRENGTH);
  FlagClear(C.FLAG_SYS_CTRL_OBJ_DELETE);
  FlagClear(C.FLAG_NURSE_UNION_ROOM_REMINDER);
}

export function ClearDailyFlags(): void {
  save.flags.fill(0, C.DAILY_FLAGS_START / 8, C.DAILY_FLAGS_START / 8 + DAILY_FLAGS_SIZE);
}

export function DisableNationalPokedex(): void {
  const nationalDexVar = GetVarPointer(C.VAR_NATIONAL_DEX)!;
  save.nationalDexMagic = 0;
  nationalDexVar.value = 0;
  FlagClear(C.FLAG_SYS_NATIONAL_DEX);
}

/** EnableNationalPokedex; ResetPokedexScrollPositions (pokedex.c) clears UI-only EWRAM not represented here. */
export function EnableNationalPokedex(): void {
  const nationalDexVar = GetVarPointer(C.VAR_NATIONAL_DEX)!;
  save.nationalDexMagic = 0xda;
  nationalDexVar.value = 0x302;
  FlagSet(C.FLAG_SYS_NATIONAL_DEX);
  save.pokedexMode = C.DEX_MODE_NATIONAL;
  save.pokedexOrder = 0;
}

export function IsNationalPokedexEnabled(): boolean {
  return save.nationalDexMagic === 0xda && VarGet(C.VAR_NATIONAL_DEX) === 0x302 && FlagGet(C.FLAG_SYS_NATIONAL_DEX);
}

export function DisableMysteryEvent(): void { FlagClear(C.FLAG_SYS_MYSTERY_EVENT_ENABLE); }
export function EnableMysteryEvent(): void { FlagSet(C.FLAG_SYS_MYSTERY_EVENT_ENABLE); }
export function IsMysteryEventEnabled(): boolean { return FlagGet(C.FLAG_SYS_MYSTERY_EVENT_ENABLE); }
export function DisableMysteryGift(): void { FlagClear(C.FLAG_SYS_MYSTERY_GIFT_ENABLE); }
export function EnableMysteryGift(): void { FlagSet(C.FLAG_SYS_MYSTERY_GIFT_ENABLE); }
export function IsMysteryGiftEnabled(): boolean { return FlagGet(C.FLAG_SYS_MYSTERY_GIFT_ENABLE); }

export function ClearMysteryGiftFlags(): void {
  for (const flag of [C.FLAG_MYSTERY_GIFT_DONE, C.FLAG_MYSTERY_GIFT_1, C.FLAG_MYSTERY_GIFT_2, C.FLAG_MYSTERY_GIFT_3,
    C.FLAG_MYSTERY_GIFT_4, C.FLAG_MYSTERY_GIFT_5, C.FLAG_MYSTERY_GIFT_6, C.FLAG_MYSTERY_GIFT_7, C.FLAG_MYSTERY_GIFT_8,
    C.FLAG_MYSTERY_GIFT_9, C.FLAG_MYSTERY_GIFT_10, C.FLAG_MYSTERY_GIFT_11, C.FLAG_MYSTERY_GIFT_12, C.FLAG_MYSTERY_GIFT_13,
    C.FLAG_MYSTERY_GIFT_14, C.FLAG_MYSTERY_GIFT_15]) FlagClear(flag);
}

export function ClearMysteryGiftVars(): void {
  for (const id of [C.VAR_GIFT_PICHU_SLOT, C.VAR_GIFT_UNUSED_1, C.VAR_GIFT_UNUSED_2, C.VAR_GIFT_UNUSED_3,
    C.VAR_GIFT_UNUSED_4, C.VAR_GIFT_UNUSED_5, C.VAR_GIFT_UNUSED_6, C.VAR_GIFT_UNUSED_7]) VarSet(id, 0);
}

export function DisableResetRTC(): void {
  VarSet(C.VAR_RESET_RTC_ENABLE, 0);
  FlagClear(C.FLAG_SYS_RESET_RTC_ENABLE);
}

export function EnableResetRTC(): void {
  VarSet(C.VAR_RESET_RTC_ENABLE, 0x920);
  FlagSet(C.FLAG_SYS_RESET_RTC_ENABLE);
}

export function CanResetRTC(): boolean {
  return FlagGet(C.FLAG_SYS_RESET_RTC_ENABLE) && VarGet(C.VAR_RESET_RTC_ENABLE) === 0x920;
}

export function GetVarPointer(id: number): EventDataPointer | null {
  id &= 0xffff;
  if (id < VARS_START) return null;
  if (id < SPECIAL_VARS_START) {
    const slot = id - VARS_START;
    return { get value() { return save.vars[slot] ?? 0; }, set value(v: number) { save.vars[slot] = v & 0xffff; } };
  }
  // gSpecialVars[id - SPECIAL_VARS_START]: the C table has no bounds check.
  const slot = id - SPECIAL_VARS_START;
  return { get value() { return specialVars[slot] ?? 0; }, set value(v: number) { if (slot < specialVars.length) specialVars[slot] = v & 0xffff; } };
}

export function VarGet(id: number): number {
  const ptr = GetVarPointer(id);
  if (!ptr) return id & 0xffff;
  return ptr.value;
}

export function VarSet(id: number, value: number): boolean {
  const ptr = GetVarPointer(id);
  if (!ptr) return false;
  ptr.value = value;
  return true;
}

export function VarGetObjectEventGraphicsId(id: number): number {
  return VarGet(C.VAR_OBJ_GFX_ID_0 + (id & 0xff)) & 0xff;
}

export function GetFlagPointer(id: number): EventDataPointer | null {
  id &= 0xffff;
  if (id === 0) return null;
  if (id < SPECIAL_FLAGS_START) {
    const slot = id >> 3;
    return { get value() { return save.flags[slot] ?? 0; }, set value(v: number) { save.flags[slot] = v & 0xff; } };
  }
  const slot = (id - SPECIAL_FLAGS_START) >> 3;
  return { get value() { return sSpecialFlags[slot] ?? 0; }, set value(v: number) { if (slot < sSpecialFlags.length) sSpecialFlags[slot] = v & 0xff; } };
}

export function FlagSet(id: number): number {
  const ptr = GetFlagPointer(id);
  if (ptr) ptr.value |= 1 << (id & 7);
  return 0;
}

export function FlagClear(id: number): number {
  const ptr = GetFlagPointer(id);
  if (ptr) ptr.value &= ~(1 << (id & 7));
  return 0;
}

export function FlagGet(id: number): boolean {
  const ptr = GetFlagPointer(id);
  if (!ptr) return false;
  return ((ptr.value >> (id & 7)) & 1) !== 0;
}

// Contract names the core imports (same as the FireRed module).
export const varGet = VarGet;
export const varSet = VarSet;
export const flagGet = FlagGet;
export function flagSet(id: number): void { FlagSet(id); }
export function flagClear(id: number): void { FlagClear(id); }
export const clearTempFieldEventData = ClearTempFieldEventData;

// overworld.c game stats: SaveBlock1.gameStats holds each value XOR SaveBlock2.encryptionKey.
export function ResetGameStats(): void {
  for (let i = 0; i < C.NUM_GAME_STATS; i++) SetGameStat(i, 0);
}

export function IncrementGameStat(index: number): void {
  index &= 0xff;
  if (index < C.NUM_USED_GAME_STATS) {
    let statVal = GetGameStat(index);
    if (statVal < 0xffffff) statVal++;
    else statVal = 0xffffff;
    SetGameStat(index, statVal);
  }
}

export function GetGameStat(index: number): number {
  index &= 0xff;
  if (index >= C.NUM_USED_GAME_STATS) return 0;
  return ((save.gameStats[index] ?? 0) ^ save.encryptionKey) >>> 0;
}

export function SetGameStat(index: number, value: number): void {
  index &= 0xff;
  if (index < C.NUM_USED_GAME_STATS) save.gameStats[index] = ((value ^ save.encryptionKey) >>> 0);
}

/** ApplyNewEncryptionKeyToGameStats with load_save.c ApplyNewEncryptionKeyToWord. */
export function ApplyNewEncryptionKeyToGameStats(newKey: number): void {
  for (let i = 0; i < C.NUM_GAME_STATS; i++) save.gameStats[i] = (((save.gameStats[i] ?? 0) ^ save.encryptionKey) ^ newKey) >>> 0;
}

export const incrementGameStat = IncrementGameStat;

export { CANONICAL_STORAGE_KEY, SANDBOX_STORAGE_KEY };
let activeStorageKey = CANONICAL_STORAGE_KEY;
export function setSaveStorageKey(key: string): void { activeStorageKey = key; }
export function getSaveStorageKey(): string { return activeStorageKey; }

/** Browser storage of the save blocks (the flash sectors of save.c are not represented). */
export const saveStore = {
  exists(): boolean {
    try { return !!localStorage.getItem(activeStorageKey); } catch { return false; }
  },
  load(): SaveData | undefined {
    try {
      const raw = localStorage.getItem(activeStorageKey);
      if (!raw) return undefined;
      const data = JSON.parse(raw) as SaveData;
      return data.version === 2 ? data : undefined;
    } catch {
      return undefined;
    }
  },
  clear(): void {
    try { localStorage.removeItem(activeStorageKey); } catch { /* storage unavailable */ }
  },
  write(data: SaveData = save): boolean {
    try {
      localStorage.setItem(activeStorageKey, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  },
};
