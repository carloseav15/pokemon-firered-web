// pokeemerald gSpecials entries that the Hoenn circuit's scripts call and the FireRed table lacks.
// Installed on the engine with setGameSpecials while Emerald content runs (EngineInteraction).
// Each function keeps its C source file and name.
import { GetSetPokedexFlag } from "@core/pokemon/mon_extra";
import { HoennToNationalOrder } from "@core/pokemon/pokemon";
import type { ScriptRunner } from "@core/script/context";
import { flagGet, GetGameStat, save, varGet, varSet } from "@game/save";
import * as EM from "./generated/constants";
import { save as emSave } from "./save";

/** pokedex.c HasAllHoennMons: -2 excludes Jirachi and Deoxys. HoennToNationalOrder is the core port of
 * pokemon.c (sHoennToNationalOrder has the same values in pokeemerald and pokefirered). */
function HasAllHoennMons(): boolean {
  for (let i = 0; i < EM.HOENN_DEX_COUNT - 2; i++)
    if (!GetSetPokedexFlag(HoennToNationalOrder(i + 1), EM.FLAG_GET_CAUGHT)) return false;
  return true;
}

/** contest_util.c CountPlayerMuseumPaintings (SaveBlock1.contestWinners). */
function CountPlayerMuseumPaintings(): number {
  let count = 0;
  for (let i = 0; i < EM.NUM_CONTEST_WINNERS - EM.MUSEUM_CONTEST_WINNERS_START; i++)
    if (emSave.contestWinners[EM.MUSEUM_CONTEST_WINNERS_START + i]!.species) count++;
  return count;
}

/** trainer_card.c HasAllFrontierSymbols */
function HasAllFrontierSymbols(): boolean {
  for (let i = 0; i < EM.NUM_FRONTIER_FACILITIES; i++)
    if (!flagGet(EM.FLAG_SYS_TOWER_SILVER + 2 * i) || !flagGet(EM.FLAG_SYS_TOWER_GOLD + 2 * i)) return false;
  return true;
}

/** trainer_card.c CountPlayerTrainerStars */
export function CountPlayerTrainerStars(): number {
  let stars = 0;
  if (GetGameStat(EM.GAME_STAT_ENTERED_HOF)) stars++;
  if (HasAllHoennMons()) stars++;
  if (CountPlayerMuseumPaintings() >= EM.CONTEST_CATEGORIES_COUNT) stars++;
  if (HasAllFrontierSymbols()) stars++;
  return stars;
}

/** field_specials.c PlayerNotAtTrainerHillEntrance */
export function PlayerNotAtTrainerHillEntrance(): number {
  if (save.location.mapGroup === (EM.MAP_TRAINER_HILL_ENTRANCE >> 8) && save.location.mapNum === (EM.MAP_TRAINER_HILL_ENTRANCE & 0xff)) return 0;
  return 1;
}

/** field_specials.c UpdateCyclingRoadState: ON_RESUME of Route 110. */
export function UpdateCyclingRoadState(ctx: ScriptRunner): void {
  const last = ctx.ow.lastUsedWarp;
  if (last.mapNum === (EM.MAP_ROUTE110_SEASIDE_CYCLING_ROAD_NORTH_ENTRANCE & 0xff)
    && last.mapGroup === (EM.MAP_ROUTE110_SEASIDE_CYCLING_ROAD_NORTH_ENTRANCE >>> 8)) return;
  const state = varGet(EM.VAR_CYCLING_CHALLENGE_STATE);
  if (state === 2 || state === 3) {
    varSet(EM.VAR_CYCLING_CHALLENGE_STATE, 0);
    ctx.ow.Overworld_SetSavedMusic(EM.MUS_DUMMY);
  }
}

export const EMERALD_SPECIALS = { CountPlayerTrainerStars, PlayerNotAtTrainerHillEntrance, UpdateCyclingRoadState };
