// Battle rules profiles: the single place that decides whether a move is physical or special.
//
// In Gen 3 the category follows the move's *type* (IS_TYPE_PHYSICAL / IS_TYPE_SPECIAL in battle.h). The
// engine asks the question at six sites (CalculateBaseDamage, Cmd_accuracycheck, Cmd_datahpupdate); they all go
// through `battleRules()`, so a profile can answer it from the move itself.
//
// Profiles:
//   gen3     the original, by type. Default. Must stay bit-identical to the macros: the characterization check
//            (tools/checks/battleCategory.ts) pins it.
//   unified  Gen 4 categories, per move (src/core/battle/data/moveCategoriesGen4.ts). A move whose category
//            is "status" in that table keeps the type rule, so nothing that is not a damaging move changes.
//
// Design: unified-world/DISENO-REGLAS.md.

import * as C from "@game/generated/constants";
import { IS_TYPE_PHYSICAL, IS_TYPE_SPECIAL } from "./macros";
import { MOVE_CATEGORIES_GEN4 } from "./data/moveCategoriesGen4";

export type BattleRulesProfile = "gen3" | "unified";

export interface BattleRules {
  readonly profile: BattleRulesProfile;
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

/**
 * Gen 4 split: the category belongs to the move; the effective type (Hidden Power, Weather Ball…) is irrelevant.
 * A move of type "???" is neither (CalculateBaseDamage zeroes its damage between the two branches), exactly as in gen3.
 */
export const unifiedRules: BattleRules = {
  profile: "unified",
  isPhysical(move, moveType) {
    if (moveType === C.TYPE_MYSTERY) return false;
    const c = MOVE_CATEGORIES_GEN4[move];
    return c === "P" ? true : c === "S" ? false : IS_TYPE_PHYSICAL(moveType);
  },
  isSpecial(move, moveType) {
    if (moveType === C.TYPE_MYSTERY) return false;
    const c = MOVE_CATEGORIES_GEN4[move];
    return c === "S" ? true : c === "P" ? false : IS_TYPE_SPECIAL(moveType);
  },
};

export const BATTLE_RULES: Readonly<Record<BattleRulesProfile, BattleRules>> = { gen3: gen3Rules, unified: unifiedRules };

let active: BattleRules = gen3Rules;

/** The rules in force. Read at every decision, so a profile change takes effect on the next battle action. */
export function battleRules(): BattleRules {
  return active;
}

export function setBattleRules(rules: BattleRules): void {
  active = rules;
}

export function setBattleRulesProfile(profile: BattleRulesProfile): void {
  active = BATTLE_RULES[profile];
}
