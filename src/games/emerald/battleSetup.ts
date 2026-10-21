// pokeemerald src/battle_setup.c BattleSetup_GetEnvironmentId: the battle environment (background and
// Camouflage / Secret Power / Nature Power environment) from the tile the player stands on. Used by
// the FireRed battle engine's battleHost while Emerald content runs (EngineInteraction).
import type { Game } from "@game/game";
import { save } from "@game/save";
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
