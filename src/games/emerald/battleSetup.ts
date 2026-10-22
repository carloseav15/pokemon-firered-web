// pokeemerald src/battle_setup.c BattleSetup_GetEnvironmentId: the battle environment (background and
// Camouflage / Secret Power / Nature Power environment) from the tile the player stands on. Used by
// the FireRed battle engine's battleHost while Emerald content runs (EngineInteraction).
import type { Game } from "@game/game";
import { cdata } from "@core/hw/assets";
import type { ScriptRunner } from "@core/script/context";
import { flagGet, save } from "@game/save";
import * as EM from "./generated/constants";
import * as EMB from "./generated/metatileBehavior";

/** BattleSetup_GetEnvironmentId; GetSavedWeather is SaveBlock1.weather. */
export function BattleSetup_GetEnvironmentId(game: Game): number {
  const ow = game.overworld;
  // PlayerGetDestCoords
  const { x, y } = ow.player.object.currentCoords;
  const tileBehavior = ow.map.behaviorAt(x, y);

  if (EMB.MetatileBehavior_IsTallGrass(tileBehavior)) return EM.BATTLE_ENVIRONMENT_GRASS;
  if (EMB.MetatileBehavior_IsLongGrass(tileBehavior)) return EM.BATTLE_ENVIRONMENT_LONG_GRASS;
  if (EMB.MetatileBehavior_IsSandOrDeepSand(tileBehavior)) return EM.BATTLE_ENVIRONMENT_SAND;

  switch (ow.header.mapType) {
    case EM.MAP_TYPE_TOWN:
    case EM.MAP_TYPE_CITY:
    case EM.MAP_TYPE_ROUTE:
      break;
    case EM.MAP_TYPE_UNDERGROUND:
      if (EMB.MetatileBehavior_IsIndoorEncounter(tileBehavior)) return EM.BATTLE_ENVIRONMENT_BUILDING;
      if (EMB.MetatileBehavior_IsSurfableWaterOrUnderwater(tileBehavior)) return EM.BATTLE_ENVIRONMENT_POND;
      return EM.BATTLE_ENVIRONMENT_CAVE;
    case EM.MAP_TYPE_INDOOR:
    case EM.MAP_TYPE_SECRET_BASE:
      return EM.BATTLE_ENVIRONMENT_BUILDING;
    case EM.MAP_TYPE_UNDERWATER:
      return EM.BATTLE_ENVIRONMENT_UNDERWATER;
    case EM.MAP_TYPE_OCEAN_ROUTE:
      if (EMB.MetatileBehavior_IsSurfableWaterOrUnderwater(tileBehavior)) return EM.BATTLE_ENVIRONMENT_WATER;
      return EM.BATTLE_ENVIRONMENT_PLAIN;
  }
  if (EMB.MetatileBehavior_IsDeepOrOceanWater(tileBehavior)) return EM.BATTLE_ENVIRONMENT_WATER;
  if (EMB.MetatileBehavior_IsSurfableWaterOrUnderwater(tileBehavior)) return EM.BATTLE_ENVIRONMENT_POND;
  if (EMB.MetatileBehavior_IsMountain(tileBehavior)) return EM.BATTLE_ENVIRONMENT_MOUNTAIN;
  if (ow.player.flags & EM.PLAYER_AVATAR_FLAG_SURFING) {
    // Is BRIDGE_TYPE_POND_*?
    if (EMB.MetatileBehavior_GetBridgeType(tileBehavior) !== EM.BRIDGE_TYPE_OCEAN) return EM.BATTLE_ENVIRONMENT_POND;
    if (EMB.MetatileBehavior_IsBridgeOverWater(tileBehavior)) return EM.BATTLE_ENVIRONMENT_WATER;
  }
  if (save.location.mapGroup === (EM.MAP_ROUTE113 >> 8) && save.location.mapNum === (EM.MAP_ROUTE113 & 0xff)) return EM.BATTLE_ENVIRONMENT_SAND;
  if (save.weather === EM.WEATHER_SANDSTORM) return EM.BATTLE_ENVIRONMENT_SAND;
  return EM.BATTLE_ENVIRONMENT_PLAIN;
}

/** battle_setup.c gRematchTable (cdata "battle_setup"). */
type RematchTrainer = { trainerIds: number[]; mapGroup: number; mapNum: number };
const gRematchTable = (): RematchTrainer[] => cdata<RematchTrainer[]>("em:battle_setup", "gRematchTable");

/** battle_setup.c HasTrainerBeenFought */
function HasTrainerBeenFought(trainerId: number): boolean {
  return flagGet(EM.TRAINER_FLAGS_START + (trainerId & 0xffff));
}

/** battle_setup.c FirstBattleTrainerIdToRematchTableId */
function FirstBattleTrainerIdToRematchTableId(table: RematchTrainer[], trainerId: number): number {
  for (let i = 0; i < EM.REMATCH_TABLE_ENTRIES; i++)
    if (table[i]!.trainerIds[0] === trainerId) return i;
  return -1;
}

/** battle_setup.c IsFirstTrainerIdReadyForRematch; trainerRematches is the Hoenn bank's SaveBlock1 array. */
function IsFirstTrainerIdReadyForRematch(table: RematchTrainer[], firstBattleTrainerId: number): boolean {
  const tableId = FirstBattleTrainerIdToRematchTableId(table, firstBattleTrainerId);
  if (tableId === -1) return false;
  if (tableId >= EM.MAX_REMATCH_ENTRIES) return false;
  if ((save.trainerRematches?.[tableId] ?? 0) === 0) return false;
  return true;
}

/** battle_setup.c WasSecondRematchWon */
function WasSecondRematchWon(table: RematchTrainer[], firstBattleTrainerId: number): boolean {
  const tableId = FirstBattleTrainerIdToRematchTableId(table, firstBattleTrainerId);
  if (tableId === -1) return false;
  if (!HasTrainerBeenFought(table[tableId]!.trainerIds[1]!)) return false;
  return true;
}

/** battle_setup.c ShouldTryRematchBattle; gTrainerBattleOpponent_A is the engine's opponentA. */
export function ShouldTryRematchBattle(ctx: ScriptRunner): number {
  const opponentA = ctx.ow.game.battleSetup.opponentA;
  if (IsFirstTrainerIdReadyForRematch(gRematchTable(), opponentA)) return 1;
  return WasSecondRematchWon(gRematchTable(), opponentA) ? 1 : 0;
}
