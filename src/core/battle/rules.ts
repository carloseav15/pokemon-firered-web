// Battle rules profile: the single place that decides whether a move is physical or special.
//
// In Gen 3 the category follows the move's *type* (IS_TYPE_PHYSICAL / IS_TYPE_SPECIAL in battle.h). The
// engine asks the question at six sites (CalculateBaseDamage, Cmd_accuracycheck, Cmd_datahpupdate); they all go
// through `rules` so a different profile can answer it from the move itself.
//
// Only the faithful "gen3" profile exists. It must stay bit-identical to the original macros: the
// characterization check (tools/checks/battleCategory.ts) pins its behaviour.
// Design for further profiles: unified-world/DISENO-REGLAS.md.

import { IS_TYPE_PHYSICAL, IS_TYPE_SPECIAL } from "./macros";

export interface BattleRules {
  readonly profile: "gen3";
  /** Is `move` (whose effective type is `moveType`) a physical move? */
  isPhysical(move: number, moveType: number): boolean;
  /** Is `move` (whose effective type is `moveType`) a special move? */
  isSpecial(move: number, moveType: number): boolean;
}

/** FireRed / Emerald rules: category by type, exactly the original macros. */
export const gen3Rules: BattleRules = {
  profile: "gen3",
  isPhysical: (_move, moveType) => IS_TYPE_PHYSICAL(moveType),
  isSpecial: (_move, moveType) => IS_TYPE_SPECIAL(moveType),
};

let active: BattleRules = gen3Rules;

/** The rules in force. Read at every decision, so a profile change takes effect for the next battle action. */
export function battleRules(): BattleRules {
  return active;
}

export function setBattleRules(rules: BattleRules): void {
  active = rules;
}
