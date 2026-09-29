// Battle globals (battle_main.c EWRAM data + battle.h externs).
// Scalars live on `G` under their C names. Those the battle scripts address
// by pointer are backed by the emulated RAM in ram.ts.

import { allocU16Array, allocU8Array, defineScalars } from "./ram";
import * as C from "../generated/constants";
import {
  AI_ThinkingStruct, BattleHealthboxInfo, BattleAnimationInfo, BattleBarInfo, BattleHistory, BattlePokemon, BattleResults,
  BattleScripting, BattleSpriteInfo, BattleStruct, DisableStruct, ProtectStruct, SideTimer, SpecialStatus, WishFutureKnock,
  BattleEnigmaBerry, PokedudeBattlerState,
} from "../generated/structs";
import type { Pokemon } from "../pokemon/pokemon";

export const MAX_BATTLERS_COUNT = 4;

type Fn = (() => void) | null;

/** Scalar globals by C name. */
export interface Globals {
  // RAM-backed (script addressable)
  gCurrentMove: number;
  gHitMarker: number;
  gMoveResultFlags: number;
  gChosenMove: number;
  gEffectBattler: number;
  gBattlerTarget: number;
  gBattleMoveDamage: number;
  gDynamicBasePower: number;
  gBattlerAttacker: number;
  gBattlersCount: number;
  gBattleWeather: number;
  gBattleTypeFlags: number;
  gBattleOutcome: number;
  gCritMultiplier: number;
  gHpDealt: number;
  gBattlerFainted: number;
  gTrainerBattleOpponent_A: number;
  gLastUsedItem: number;
  gNumSafariBalls: number;
  // plain
  gBattle_BG0_X: number; gBattle_BG0_Y: number;
  gBattle_BG1_X: number; gBattle_BG1_Y: number;
  gBattle_BG2_X: number; gBattle_BG2_Y: number;
  gBattle_BG3_X: number; gBattle_BG3_Y: number;
  gBattle_WIN0H: number; gBattle_WIN0V: number;
  gBattle_WIN1H: number; gBattle_WIN1V: number;
  gBattleTerrain: number;
  gActiveBattler: number;
  gBattleControllerExecFlags: number;
  gCurrentTurnActionNumber: number;
  gCurrentActionFuncId: number;
  gCurrMovePos: number;
  gChosenMovePos: number;
  gCalledMove: number;
  gLastUsedAbility: number;
  gPotentialItemEffectBattler: number;
  gAbsentBattlerFlags: number;
  gMultiHitCounter: number;
  /** battle script pointer (address in the battle script blob) */
  gBattlescriptCurrInstr: number;
  gPauseCounterBattle: number;
  gPaydayMoney: number;
  gRandomTurnNumber: number;
  gIntroSlideFlags: number;
  gExpShareExp: number;
  gBattlerInMenuId: number;
  gDoingBattleAnim: boolean;
  gBattleMovePower: number;
  gMoveToLearn: number;
  gLeveledUpInBattle: number;
  gMultiUsePlayerCursor: number;
  gNumberOfMovesToChoose: number;
  gBattleMainFunc: Fn;
  gPreBattleCallback1: Fn;
  gCB2_AfterEvolution: Fn;
}

export const G = {
  gBattle_BG0_X: 0, gBattle_BG0_Y: 0, gBattle_BG1_X: 0, gBattle_BG1_Y: 0,
  gBattle_BG2_X: 0, gBattle_BG2_Y: 0, gBattle_BG3_X: 0, gBattle_BG3_Y: 0,
  gBattle_WIN0H: 0, gBattle_WIN0V: 0, gBattle_WIN1H: 0, gBattle_WIN1V: 0,
  gBattleTerrain: 0,
  gActiveBattler: 0,
  gBattleControllerExecFlags: 0,
  gCurrentTurnActionNumber: 0,
  gCurrentActionFuncId: 0,
  gCurrMovePos: 0,
  gChosenMovePos: 0,
  gCalledMove: 0,
  gLastUsedAbility: 0,
  gPotentialItemEffectBattler: 0,
  gAbsentBattlerFlags: 0,
  gMultiHitCounter: 0,
  gBattlescriptCurrInstr: 0,
  gPauseCounterBattle: 0,
  gPaydayMoney: 0,
  gRandomTurnNumber: 0,
  gIntroSlideFlags: 0,
  gExpShareExp: 0,
  gBattlerInMenuId: 0,
  gDoingBattleAnim: false,
  gBattleMovePower: 0,
  gMoveToLearn: 0,
  gLeveledUpInBattle: 0,
  gMultiUsePlayerCursor: 0,
  gNumberOfMovesToChoose: 0,
  gBattleMainFunc: null,
  gPreBattleCallback1: null,
  gCB2_AfterEvolution: null,
} as unknown as Globals;

defineScalars(G, {
  gCurrentMove: "u16",
  gHitMarker: "u32",
  gMoveResultFlags: "u8",
  gChosenMove: "u16",
  gEffectBattler: "u8",
  gBattlerTarget: "u8",
  gBattleMoveDamage: "s32",
  gDynamicBasePower: "u16",
  gBattlerAttacker: "u8",
  gBattlersCount: "u8",
  gBattleWeather: "u16",
  gBattleTypeFlags: "u32",
  gBattleOutcome: "u8",
  gCritMultiplier: "u8",
  gHpDealt: "s32",
  gBattlerFainted: "u8",
  gTrainerBattleOpponent_A: "u16",
  gLastUsedItem: "u16",
  gNumSafariBalls: "u8",
  // battle_bg / scanline globals are u16 in the C (negative scroll values wrap).
  gBattle_BG0_X: "u16", gBattle_BG0_Y: "u16", gBattle_BG1_X: "u16", gBattle_BG1_Y: "u16",
  gBattle_BG2_X: "u16", gBattle_BG2_Y: "u16", gBattle_BG3_X: "u16", gBattle_BG3_Y: "u16",
  gBattle_WIN0H: "u16", gBattle_WIN0V: "u16", gBattle_WIN1H: "u16", gBattle_WIN1V: "u16",
});

// ---------------------------------------------------------------- RAM arrays / structs
export const gBattleCommunication = allocU8Array("gBattleCommunication", 8);
export const gBattleTextBuff1 = allocU8Array("gBattleTextBuff1", 16);
export const gBattleTextBuff2 = allocU8Array("gBattleTextBuff2", 16);
export const gBattleTextBuff3 = allocU8Array("gBattleTextBuff3", 16);
export const gBattlerByTurnOrder = allocU8Array("gBattlerByTurnOrder", 4);
export const gBattleScripting = new BattleScripting(allocU8Array("gBattleScripting", BattleScripting.SIZE));
/** gSideStatuses is also referenced by some scripts via macros; keep it in RAM. */
export const gSideStatuses = allocU16Array("gSideStatuses", 2);

// ---------------------------------------------------------------- plain arrays
export const gDisplayedStringBattle = new Uint8Array(300 + 100);
export const gBattleBufferA = Array.from({ length: 4 }, () => new Uint8Array(0x200));
export const gBattleBufferB = Array.from({ length: 4 }, () => new Uint8Array(0x200));
export const gLinkBattleSendBuffer = new Uint8Array(0x1000);  // BATTLE_BUFFER_LINK_SIZE
export const gLinkBattleRecvBuffer = new Uint8Array(0x1000);  // BATTLE_BUFFER_LINK_SIZE
export const gBattlerPartyIndexes = new Uint16Array(4);
export const gBattlerPositions = new Uint8Array(4);
export const gActionsByTurnOrder = new Uint8Array(4);
export const gBattlerSpriteIds = new Uint8Array(4);
export const gTakenDmg = new Int32Array(4);
export const gChosenActionByBattler = new Uint8Array(4);
/** battle script pointers */
export const gSelectionBattleScripts = new Uint32Array(4);
export const gLastPrintedMoves = new Uint16Array(4);
export const gLastMoves = new Uint16Array(4);
export const gLastLandedMoves = new Uint16Array(4);
export const gLastHitByType = new Uint16Array(4);
export const gLastResultingMoves = new Uint16Array(4);
export const gLockedMoves = new Uint16Array(4);
export const gLastHitBy = new Uint8Array(4);
export const gChosenMoveByBattler = new Uint16Array(4);
export const gTakenDmgByBattler = new Uint8Array(4);
export const gStatuses3 = new Uint32Array(4);
export const gSentPokesToOpponent = new Uint8Array(2);
export const gActionSelectionCursor = new Uint8Array(4);
export const gMoveSelectionCursor = new Uint8Array(4);
export const gBattlerStatusSummaryTaskId = new Uint8Array(4);
export const gTransformedPersonalities = new Uint32Array(4);
export const gBattleMonForms = new Uint8Array(4);
export const gHealthboxSpriteIds = new Uint8Array(4);
export const gBattleControllerData = new Uint8Array(4);
export const gBattlerControllerFuncs: Array<() => void> = [() => {}, () => {}, () => {}, () => {}];
export const gBattlePartyCurrentOrder = new Uint8Array(3);

// ---------------------------------------------------------------- byte-backed structs
function structArray<T>(ctor: { new (bytes: Uint8Array): T; SIZE: number }, count: number): T[] {
  const size = (ctor.SIZE + 3) & ~3;
  const buffer = new Uint8Array(size * count);
  return Array.from({ length: count }, (_, i) => new ctor(buffer.subarray(i * size, i * size + ctor.SIZE)));
}

export const gBattleMons = structArray(BattlePokemon, 4);
export const gDisableStructs = structArray(DisableStruct, 4);
export const gProtectStructs = structArray(ProtectStruct, 4);
export const gSpecialStatuses = structArray(SpecialStatus, 4);
export const gSideTimers = structArray(SideTimer, 2);
export const gWishFutureKnock = structArray(WishFutureKnock, 1)[0];
export const gBattleStruct = structArray(BattleStruct, 1)[0];
export const gBattleResults = structArray(BattleResults, 1)[0];
export const gEnigmaBerries = structArray(BattleEnigmaBerry, 4);
export const gPokedudeBattlerStates = structArray(PokedudeBattlerState, 4);
/** battle_util2.c allocates these BG animation buffers for each battle. */
export const gBattleAnimBgTileBuffer = new Uint8Array(0x2000);
export const gBattleAnimBgTilemapBuffer = new Uint16Array(0x800);

/** struct SecretBaseRecord (global.h); only fields the game reads are modelled. */
export type SecretBaseRecord = {
  secretBaseId: number;
  gender: number;
  trainerName: Uint8Array;
  trainerId: Uint8Array;
  language: number;
  numSecretBasesReceived: number;
  numTimesEntered: number;
  decorations: Uint8Array;
  decorationPos: Uint8Array;
  party: {
    personality: Uint32Array;
    moves: Uint16Array;
    species: Uint16Array;
    heldItems: Uint16Array;
    levels: Uint8Array;
    EVs: Uint8Array;
  };
};

/** AllocZeroed(sizeof(struct SecretBaseRecord)). */
export function newSecretBaseRecord(): SecretBaseRecord {
  return {
    secretBaseId: 0, gender: 0,
    trainerName: new Uint8Array(C.PLAYER_NAME_LENGTH),
    trainerId: new Uint8Array(C.TRAINER_ID_LENGTH),
    language: 0, numSecretBasesReceived: 0, numTimesEntered: 0,
    decorations: new Uint8Array(C.DECOR_MAX_SECRET_BASE),
    decorationPos: new Uint8Array(C.DECOR_MAX_SECRET_BASE),
    party: {
      personality: new Uint32Array(C.PARTY_SIZE),
      moves: new Uint16Array(C.PARTY_SIZE * C.MAX_MON_MOVES),
      species: new Uint16Array(C.PARTY_SIZE),
      heldItems: new Uint16Array(C.PARTY_SIZE),
      levels: new Uint8Array(C.PARTY_SIZE),
      EVs: new Uint8Array(C.PARTY_SIZE),
    },
  };
}

/** struct BattleResources */
export const gBattleResources = {
  flags: { flags: new Uint32Array(4) },
  battleScriptsStack: { ptr: new Uint32Array(8), size: 0 },
  battleCallbackStack: { function: new Array<Fn>(8).fill(null), size: 0 },
  beforeLvlUp: { stats: new Uint16Array(6) },
  ai: structArray(AI_ThinkingStruct, 1)[0],
  battleHistory: structArray(BattleHistory, 1)[0],
  AI_ScriptsStack: { ptr: new Uint32Array(8), size: 0 },
  secretBase: newSecretBaseRecord(),
};

/** struct BattleSpriteData */
export const gBattleSpritesDataPtr = {
  battlerData: structArray(BattleSpriteInfo, 4),
  healthBoxesData: structArray(BattleHealthboxInfo, 4),
  animationData: structArray(BattleAnimationInfo, 1)[0],
  battleBars: structArray(BattleBarInfo, 4),
};

/** gMonSpritesGfxPtr: decompressed battler sprite sheets (4 frames of 0x800 bytes each). */
export const gMonSpritesGfxPtr = {
  sprites: Array.from({ length: 4 }, () => new Uint8Array(0x2000)),
  barFontGfx: new Uint8Array(0x1000),
  multiUseBuffer: new Uint8Array(0x800),
};

/** gPlayerParty / gEnemyParty (struct Pokemon arrays). */
export const parties = {
  gPlayerParty: [] as Array<Pokemon | null>,
  gEnemyParty: [] as Array<Pokemon | null>,
};

export const gBitTable = Array.from({ length: 32 }, (_, i) => (1 << i) >>> 0);

/** battle_gfx_sfx_util.c AllocateBattleSpritesData; stable typed arrays stand in for AllocZeroed blocks. */
export function AllocateBattleSpritesData(): void {
  for (const data of [...gBattleSpritesDataPtr.battlerData, ...gBattleSpritesDataPtr.healthBoxesData,
    gBattleSpritesDataPtr.animationData, ...gBattleSpritesDataPtr.battleBars]) data.bytes.fill(0);
}

/** battle_gfx_sfx_util.c FreeBattleSpritesData; scrub the static browser storage before reuse. */
export function FreeBattleSpritesData(): void { AllocateBattleSpritesData(); }

/** battle_gfx_sfx_util.c AllocateMonSpritesGfx; reinitialize the fixed browser sprite buffers. */
export function AllocateMonSpritesGfx(): void {
  for (const sprite of gMonSpritesGfxPtr.sprites) sprite.fill(0);
  gMonSpritesGfxPtr.barFontGfx.fill(0);
  gMonSpritesGfxPtr.multiUseBuffer.fill(0);
}

/** battle_gfx_sfx_util.c FreeMonSpritesGfx; arrays stay allocated so image views remain stable. */
export function FreeMonSpritesGfx(): void { AllocateMonSpritesGfx(); }

function clearBattleResourceStorage(): void {
  gBattleResources.flags.flags.fill(0);
  gBattleResources.battleScriptsStack.ptr.fill(0);
  gBattleResources.battleScriptsStack.size = 0;
  gBattleResources.battleCallbackStack.function.fill(null);
  gBattleResources.battleCallbackStack.size = 0;
  gBattleResources.beforeLvlUp.stats.fill(0);
  for (const s of [gBattleResources.ai, gBattleResources.battleHistory]) s.bytes.fill(0);
  gBattleResources.AI_ScriptsStack.ptr.fill(0);
  gBattleResources.AI_ScriptsStack.size = 0;
  gBattleResources.secretBase = newSecretBaseRecord();
  gBattleAnimBgTileBuffer.fill(0);
  gBattleAnimBgTilemapBuffer.fill(0);
}

/** battle_util2.c AllocateBattleResources; typed-array storage stands in for AllocZeroed. */
export function AllocateBattleResources(): void {
  gBattleStruct.clear();
  clearBattleResourceStorage();
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_POKEDUDE) {
    for (const s of gPokedudeBattlerStates) s.bytes.fill(0);
  }
}

/** battle_util2.c FreeBattleResources; scrub the static browser storage at the end of its lifetime. */
export function FreeBattleResources(): void {
  gBattleStruct.clear();
  clearBattleResourceStorage();
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_POKEDUDE) {
    for (const s of gPokedudeBattlerStates) s.bytes.fill(0);
  }
}

export function resetBattleStructs(): void {
  for (const s of [...gBattleMons, ...gDisableStructs, ...gProtectStructs, ...gSpecialStatuses, ...gSideTimers, gWishFutureKnock, gBattleResults]) s.clear();
  AllocateBattleResources();
}
