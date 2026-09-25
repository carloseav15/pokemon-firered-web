// SaveBlock1/SaveBlock2 equivalents and event_data.c (flags and vars).

import { encode, EOS } from "./gba/charmap";
import { rom } from "./rom";
import type { Pokemon } from "./pokemon/pokemon";

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
  bag: { items: BagPocket; keyItems: BagPocket; pokeBalls: BagPocket; tmCase: BagPocket; berryPouch: BagPocket };
  pcItems: BagPocket;
  pcMail: PcMailEntry[];
  registeredItem: number;
  party: Pokemon[];
  boxes: Array<Array<Pokemon | null>>;
  currentBox: number;
  boxNames?: number[][];
  boxWallpapers?: number[];
  pokedexSeen: number[];
  pokedexCaught: number[];
  gameStats: number[];
  playTimeFrames: number;
  options: { textSpeed: number; battleScene: boolean; battleStyle: number; sound: number; buttonMode: number; frameType: number };
  savedMusic: number;
  playerAvatarFlags: number;
  facing: number;
  weather?: number;
  objectEventTemplates?: unknown;
  daycare?: unknown;
  berryPowder?: number;
  trainerRematchStepCounter?: number;
  trainerRematches?: number[];
  roamer?: unknown;
};

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
    bag: { items: [], keyItems: [], pokeBalls: [], tmCase: [], berryPouch: [] },
    pcItems: [],
    pcMail: [],
    registeredItem: 0,
    party: [],
    boxes: Array.from({ length: 14 }, () => new Array(30).fill(null)),
    currentBox: 0,
    pokedexSeen: new Array(52).fill(0),
    pokedexCaught: new Array(52).fill(0),
    gameStats: new Array(64).fill(0),
    playTimeFrames: 0,
    options: { textSpeed: 1, battleScene: true, battleStyle: 0, sound: 0, buttonMode: 0, frameType: 0 },
    savedMusic: 0,
    playerAvatarFlags: 1,
    facing: 1,
  };
}

/** The live save state (gSaveBlock1Ptr / gSaveBlock2Ptr). */
export let save: SaveData = newSaveData();

export function setSave(data: SaveData): void {
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
