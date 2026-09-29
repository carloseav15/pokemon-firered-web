// pokemon.c / overworld.c rules shared by field menus and battle.
import { rom } from "../rom";
import * as C from "../generated/constants";
import { flagGet, save } from "../save";
import type { Pokemon } from "./pokemon";

/** GetMoveRelearnerMoves (pokemon.c): preserve learnset order and skip known or repeated moves. */
export function GetMoveRelearnerMoves(mon: Pokemon): number[] {
  if (!mon.species) return [];
  const result: number[] = [];
  for (const [level, move] of rom.species[mon.species].learnset.slice(0, C.MAX_LEVEL_UP_MOVES)) {
    if (level <= mon.level && !mon.moves.slice(0, C.MAX_MON_MOVES).includes(move) && !result.includes(move)) result.push(move);
  }
  return result;
}

/** GetLevelUpMovesBySpecies (pokemon.c): all level-up moves, including duplicates. */
export function GetLevelUpMovesBySpecies(species: number): number[] {
  return rom.species[species].learnset.slice(0, C.MAX_LEVEL_UP_MOVES).map(([, move]) => move);
}

/** GetNumberOfRelearnableMoves (pokemon.c): eggs have no relearnable moves. */
export function GetNumberOfRelearnableMoves(mon: Pokemon): number {
  return mon.isEgg ? 0 : GetMoveRelearnerMoves(mon).length;
}

/** CountBadgesForOverworldWhiteOutLossCalculation (overworld.c). */
export function CountBadgesForOverworldWhiteOutLossCalculation(): number {
  let badges = 0;
  for (let i = 1; i <= 8; i++) if (flagGet(rom.c(`FLAG_BADGE0${i}_GET`))) badges++;
  return badges;
}

/** ComputeWhiteOutMoneyLoss: highest non-egg level times badge multiplier. */
export function computeWhiteOutMoneyLoss(): number {
  const multipliers = [2, 4, 6, 9, 12, 16, 20, 25, 30];
  const badges = CountBadgesForOverworldWhiteOutLossCalculation();
  const topLevel = save.party.reduce((level, mon) => mon.species && !mon.isEgg ? Math.max(level, mon.level) : level, 1);
  return Math.min(save.money, topLevel * 4 * multipliers[badges]);
}
