// Glue between the overworld (Game) and the battle engine: battle type flags, terrain,
// wild party, and the return to the field (gMain.savedCallback in the original).

import * as C from "../generated/constants";
import * as MB from "../generated/metatileBehavior";
import { HwScene, gMain, SetMainCallback2, type MainCallback } from "../hw/runtime";
import { random } from "../random";
import { rom } from "../rom";
import type { Game, Scene } from "../game";
import type { BattleRequest } from "./battleSetup";
import { PLAYER_AVATAR_FLAG_SURFING } from "../field/playerAvatar";
import { CopyMon, GetMonData, gEnemyParty, SetMonData, ZeroEnemyPartyMons, type Mon } from "../pokemon/mon";
import { AllocateBattleSpritesData, AllocateMonSpritesGfx, FreeBattleSpritesData, FreeMonSpritesGfx, G, resetBattleStructs } from "./globals";
import { CB2_InitBattle } from "./main_init";

let game: Game | null = null;
let current: { request: BattleRequest; scene: HwScene } | null = null;
/** gMain.savedCallback of a battle entered from a hardware scene that keeps running (Teachy TV). */
let embeddedSavedCallback: MainCallback = null;

export const battleHost = {
  preBattleCallback1: null as MainCallback,

  /** BattleSetup_GetTerrainId */
  BattleSetup_GetTerrainId(): number {
    if (!game) return C.BATTLE_TERRAIN_PLAIN;
    const ow = game.overworld;
    const { x, y } = ow.player.object.currentCoords;
    const behavior = ow.map.behaviorAt(x, y);
    if (MB.MetatileBehavior_IsTallGrass(behavior)) return C.BATTLE_TERRAIN_GRASS;
    if (MB.MetatileBehavior_IsLongGrass(behavior)) return C.BATTLE_TERRAIN_LONG_GRASS;
    if (MB.MetatileBehavior_IsSandOrShallowFlowingWater(behavior)) return C.BATTLE_TERRAIN_SAND;
    switch (ow.header.mapType) {
      case C.MAP_TYPE_TOWN:
      case C.MAP_TYPE_CITY:
      case C.MAP_TYPE_ROUTE:
        break;
      case C.MAP_TYPE_UNDERGROUND:
        if (MB.MetatileBehavior_IsIndoorEncounter(behavior)) return C.BATTLE_TERRAIN_BUILDING;
        if (MB.MetatileBehavior_IsSurfable(behavior)) return C.BATTLE_TERRAIN_POND;
        return C.BATTLE_TERRAIN_CAVE;
      case C.MAP_TYPE_INDOOR:
      case C.MAP_TYPE_SECRET_BASE:
        return C.BATTLE_TERRAIN_BUILDING;
      case C.MAP_TYPE_UNDERWATER:
        return C.BATTLE_TERRAIN_UNDERWATER;
      case C.MAP_TYPE_OCEAN_ROUTE:
        return MB.MetatileBehavior_IsSurfable(behavior) ? C.BATTLE_TERRAIN_WATER : C.BATTLE_TERRAIN_PLAIN;
    }
    if (MB.MetatileBehavior_IsDeepWaterTerrain(behavior)) return C.BATTLE_TERRAIN_WATER;
    if (MB.MetatileBehavior_IsSurfable(behavior)) return C.BATTLE_TERRAIN_POND;
    if (MB.MetatileBehavior_IsMountain(behavior)) return C.BATTLE_TERRAIN_MOUNTAIN;
    if (ow.player.flags & PLAYER_AVATAR_FLAG_SURFING) {
      if (MB.MetatileBehavior_GetBridgeType(behavior)) return C.BATTLE_TERRAIN_POND;
      if (MB.MetatileBehavior_IsBridge(behavior)) return C.BATTLE_TERRAIN_WATER;
    }
    return C.BATTLE_TERRAIN_PLAIN;
  },

  /** overworld.c GetCurrentMapBattleScene */
  mapBattleScene(): number {
    return game?.overworld.header.battleScene ?? C.MAP_BATTLE_SCENE_NORMAL;
  },

  /** battle_setup.c GetTrainerBattleMode / GetRivalBattleFlags */
  trainerBattleMode(): number {
    return game?.battleSetup.mode ?? 0;
  },
  rivalBattleFlags(): number {
    return game?.battleSetup.rivalFlags ?? 0;
  },

  /** The running Game (field services used by battle-side C code). */
  game(): Game {
    if (!game) throw new Error("battle host has no game");
    return game;
  },
  /** gTrainerBattleOpponent_A */
  opponentA(): number {
    return game?.battleSetup.opponentA ?? 0;
  },

  /** gMapHeader.mapType */
  mapType(): number {
    return game?.overworld.header.mapType ?? C.MAP_TYPE_NONE;
  },

  /** GetCurrentWeather: the field weather engine's current weather. */
  weather(): number {
    return game?.weather.current ?? C.WEATHER_NONE;
  },

  /** battle_setup.c GetTrainerALoseText / GetTrainerWonSpeech (already placeholder-expanded). */
  trainerLoseText(): Uint8Array {
    return game ? game.battleSetup.GetTrainerALoseText() : new Uint8Array([0xff]);
  },
  trainerWonText(): Uint8Array {
    return game ? game.battleSetup.GetTrainerWonSpeech() : new Uint8Array([0xff]);
  },

  /** pokemon.c SetWildMonHeldItem */
  setWildMonHeldItem(): void {
    if (G.gBattleTypeFlags & (C.BATTLE_TYPE_POKEDUDE | C.BATTLE_TYPE_LEGENDARY | C.BATTLE_TYPE_TRAINER)) return;
    const rnd = random() % 100;
    const species = GetMonData(gEnemyParty[0], C.MON_DATA_SPECIES);
    const [common, rare] = rom.species[species].items;
    if (common === rare) {
      SetMonData(gEnemyParty[0], C.MON_DATA_HELD_ITEM, common);
      return;
    }
    if (rnd > 44) SetMonData(gEnemyParty[0], C.MON_DATA_HELD_ITEM, rnd <= 94 ? common : rare);
  },

  /** Final step of the battle: SetMainCallback2(gMain.savedCallback) back to the field. */
  finish(outcome: number): void {
    if (embeddedSavedCallback) {
      // SetMainCallback2(gMain.savedCallback): the entering scene continues where it left off.
      const savedCallback = embeddedSavedCallback;
      embeddedSavedCallback = null;
      gMain.inBattle = false;
      gMain.callback1 = null;
      FreeMonSpritesGfx();
      FreeBattleSpritesData();
      SetMainCallback2(savedCallback);
      return;
    }
    const c = current;
    if (!c || !game) return;
    current = null;
    gMain.inBattle = false;
    gMain.callback1 = battleHost.preBattleCallback1;
    FreeMonSpritesGfx();
    FreeBattleSpritesData();
    c.scene.leave();
    game.scene = null;
    if (c.request.isSafari) game.safariBalls = G.gNumSafariBalls;
    c.request.onEnd(outcome);
  },
};

function battleTypeFlags(request: BattleRequest): number {
  let flags = 0;
  if (request.kind === "trainer") flags |= C.BATTLE_TYPE_TRAINER;
  if (request.isFirstBattle) flags |= C.BATTLE_TYPE_FIRST_BATTLE;
  if (request.isOldMan) flags |= C.BATTLE_TYPE_OLD_MAN_TUTORIAL;
  if (request.isLegendary) flags |= C.BATTLE_TYPE_LEGENDARY;
  if (request.isLegendaryFrlg) flags |= C.BATTLE_TYPE_LEGENDARY_FRLG;
  if (request.isRegi) flags |= C.BATTLE_TYPE_REGI;
  if (request.isKyogreGroudon) flags |= C.BATTLE_TYPE_KYOGRE_GROUDON;
  if (request.isGhost) flags |= C.BATTLE_TYPE_GHOST;
  if (request.isGhostUnveiled) flags |= C.BATTLE_TYPE_GHOST_UNVEILED;
  if (request.isSafari) flags |= C.BATTLE_TYPE_SAFARI;
  if (request.isDouble) flags |= C.BATTLE_TYPE_DOUBLE;
  if (request.isRoamer) flags |= C.BATTLE_TYPE_ROAMER;
  if (request.isTrainerTower) flags |= C.BATTLE_TYPE_TRAINER_TOWER;
  return flags;
}

/** Game.battleRunner: builds the battle scene (CB2_InitBattle) for a request from the overworld. */
function runBattle(request: BattleRequest): Scene {
  const scene = new HwScene();
  scene.enter();
  current = { request, scene };
  G.gBattleTypeFlags = battleTypeFlags(request);
  G.gTrainerBattleOpponent_A = request.trainerId ?? 0;
  resetBattleStructs();
  AllocateBattleSpritesData();
  AllocateMonSpritesGfx();
  if (game && request.isSafari) G.gNumSafariBalls = game.safariBalls;
  ZeroEnemyPartyMons();
  request.enemyParty.forEach((mon, i) => {
    if (i < 6) CopyMon(gEnemyParty[i], mon as Mon);
  });
  gMain.savedCallback = null;
  SetMainCallback2(CB2_InitBattle);
  return scene;
}

/**
 * CB2_InitBattle for a battle started from a hardware scene (the Teachy TV demos): the caller has already set the
 * battle type flags and both parties, and gets `savedCallback` back when the battle ends.
 */
export function StartBattleFromHwScene(savedCallback: MainCallback): void {
  resetBattleStructs();
  AllocateBattleSpritesData();
  AllocateMonSpritesGfx();
  gMain.savedCallback = savedCallback;
  embeddedSavedCallback = savedCallback;
  SetMainCallback2(CB2_InitBattle);
}

export function installBattleHost(g: Game): void {
  game = g;
  g.battleRunner = runBattle;
}
