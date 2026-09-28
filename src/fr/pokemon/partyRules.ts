// pokemon.c / overworld.c rules shared by field menus and battle.
import { rom } from "../rom";
import { flagGet, save } from "../save";
import type { Pokemon } from "./pokemon";

/** GetNumberOfRelearnableMoves/GetMoveRelearnerMoves: species, level, no duplicates. */
export function relearnableMoves(mon: Pokemon): number[] {
  if (mon.isEgg || !mon.species) return [];
  const result: number[] = [];
  for (const [level, move] of rom.species[mon.species].learnset) {
    if (level <= mon.level && !mon.moves.includes(move) && !result.includes(move)) result.push(move);
  }
  return result;
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
