// Battle rules profiles: the single place that decides how the engine's rules differ from FireRed.
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
//            Badges give no stat boosts. Obedience by badges (util.ts) is not covered yet: it needs its own rule.
//            The Fairy type (src/core/battle/data/fairyGen6.ts, label in fairyIcon.ts) is applied to the loaded data
//            when the profile is selected and removed again when gen3 is selected: see applyUnifiedData().
//
// Design: unified-world/DISENO-REGLAS.md.

import * as C from "@game/generated/constants";
import { rom } from "../rom";
import { IS_TYPE_PHYSICAL, IS_TYPE_SPECIAL } from "./macros";
import { MOVE_CATEGORIES_GEN4 } from "./data/moveCategoriesGen4";
import {
  FAIRY_MOVE_TYPES, FAIRY_SPECIES_TYPES, FAIRY_TYPE_NAME_B64, TYPE_CHART_ADD, TYPE_CHART_REMOVE,
} from "./data/fairyGen6";
import { FAIRY_ICON_PALETTE_PATCH, FAIRY_ICON_TILES_B64 } from "./data/fairyIcon";
import { setMenuInfoFairyIcon } from "../hw/listMenu";

export type BattleRulesProfile = "gen3" | "unified";

export interface BattleRules {
  readonly profile: BattleRulesProfile;
  /** Is `move` (whose effective type is `moveType`) a physical move? */
  isPhysical(move: number, moveType: number): boolean;
  /** Is `move` (whose effective type is `moveType`) a special move? */
  isSpecial(move: number, moveType: number): boolean;
  /**
   * Gym badges raise the player's Attack (1), Defense (5), Sp. Atk / Sp. Def (7) and Speed (3) by 10 % in battle
   * (CalculateBaseDamage, GetWhoStrikesFirst). The unified world treats badges as progress only.
   */
  readonly statBadgeBoosts: boolean;
}

/** FireRed / Emerald rules: category by type, exactly the original macros. */
export const gen3Rules: BattleRules = {
  profile: "gen3",
  statBadgeBoosts: true,
  isPhysical: (_move, moveType) => IS_TYPE_PHYSICAL(moveType),
  isSpecial: (_move, moveType) => IS_TYPE_SPECIAL(moveType),
};

/**
 * Gen 4 split: the category belongs to the move; the effective type (Hidden Power, Weather Ball…) is irrelevant.
 * A move of type "???" is neither (CalculateBaseDamage zeroes its damage between the two branches), exactly as in gen3.
 */
export const unifiedRules: BattleRules = {
  profile: "unified",
  statBadgeBoosts: false,
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

// ---------------------------------------------------------------------------------------------- data of the profile

/** What the faithful data looked like before the unified profile patched it, so gen3 can be restored exactly. */
interface FaithfulSnapshot {
  typeEffectiveness: number[];
  typeNames: string[];
  speciesTypes: Map<number, number[]>;
  moveTypes: Map<number, number>;
}

let snapshot: FaithfulSnapshot | null = null;

/**
 * Patch the loaded ROM data with the Fairy type: its name, the chart rows, the 18 retyped species and the 3 retyped
 * moves. Idempotent. Hidden Power is untouched on purpose: Cmd_hiddenpowercalc counts NUMBER_OF_MON_TYPES (18), which
 * this does not change, so it can never produce Fairy.
 */
export function applyUnifiedData(): void {
  if (snapshot) return;
  if (!rom.species?.length || !rom.moves?.length || !rom.typeEffectiveness?.length || !rom.typeNames?.length) {
    throw new Error("battle rules: load the ROM data before selecting the unified profile");
  }
  const flat = rom.typeEffectiveness;
  snapshot = {
    typeEffectiveness: flat,
    typeNames: rom.typeNames,
    speciesTypes: new Map(),
    moveTypes: new Map(),
  };

  // Chart: drop the removed rows, then add the Fairy rows before the Foresight marker (the rows after it are the
  // immunities that Foresight lifts, and must stay after it).
  const kept: number[] = [];
  let marker = -1;
  for (let i = 0; i < flat.length; i += 3) {
    const [a, d] = [flat[i], flat[i + 1]];
    if (a === C.TYPE_FORESIGHT && marker < 0) marker = kept.length;
    const removed = marker < 0 && TYPE_CHART_REMOVE.some(([ra, rd]) => ra === a && rd === d);
    if (!removed) kept.push(flat[i], flat[i + 1], flat[i + 2]);
  }
  if (marker < 0) throw new Error("battle rules: type chart has no Foresight marker");
  const added = TYPE_CHART_ADD.flatMap(([a, d, m]) => [a, d, m]);
  rom.typeEffectiveness = [...kept.slice(0, marker), ...added, ...kept.slice(marker)];

  rom.typeNames = [...rom.typeNames, FAIRY_TYPE_NAME_B64];

  for (const [id, types] of Object.entries(FAIRY_SPECIES_TYPES)) {
    const sp = rom.species[Number(id)];
    snapshot.speciesTypes.set(Number(id), [...sp.types]);
    sp.types = [types[0], types[1]];
  }
  for (const [id, type] of Object.entries(FAIRY_MOVE_TYPES)) {
    const mv = rom.moves[Number(id)];
    snapshot.moveTypes.set(Number(id), mv.type);
    mv.type = type;
  }

  // The type label the summary, Pokédex, TM case and move relearner draw for Fairy.
  setMenuInfoFairyIcon({
    tiles: Uint8Array.from(atob(FAIRY_ICON_TILES_B64), (c) => c.charCodeAt(0)),
    palette: FAIRY_ICON_PALETTE_PATCH,
  });
}

/** Undo applyUnifiedData(): the faithful FireRed data, as loaded. No-op when it was never applied. */
export function restoreFaithfulData(): void {
  if (!snapshot) return;
  rom.typeEffectiveness = snapshot.typeEffectiveness;
  rom.typeNames = snapshot.typeNames;
  for (const [id, types] of snapshot.speciesTypes) rom.species[id].types = types;
  for (const [id, type] of snapshot.moveTypes) rom.moves[id].type = type;
  setMenuInfoFairyIcon(null);
  snapshot = null;
}

// ------------------------------------------------------------------------------------------------ selection

let active: BattleRules = gen3Rules;

/** The rules in force. Read at every decision, so a profile change takes effect on the next battle action. */
export function battleRules(): BattleRules {
  return active;
}

/** Replace the rules object only; loaded data is not touched. Prefer setBattleRulesProfile. */
export function setBattleRules(rules: BattleRules): void {
  active = rules;
}

/** Select a profile and make the loaded data match it (Fairy data is applied or removed). */
export function setBattleRulesProfile(profile: BattleRulesProfile): void {
  if (profile === "unified") applyUnifiedData();
  else restoreFaithfulData();
  active = BATTLE_RULES[profile];
}
