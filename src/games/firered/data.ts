// @game/data: per-game constants the shared engine needs to locate its data and saves.
// FireRed values; Emerald provides its own src/games/emerald/data.ts under the same alias.

export const GAME_ID = "firered";
/** URL prefix of the exported browser data (public/fr, written by tools/decomp/export.py). */
export const DEFAULT_DATA_ROOT = "/fr";
/** localStorage keys; changing them orphans existing saves and tools/playtest/saves. */
export const CANONICAL_STORAGE_KEY = "pokemon-gba-web-lab.firered.v2";
export const SANDBOX_STORAGE_KEY = "pokemon-gba-web-lab.firered.sandbox";
