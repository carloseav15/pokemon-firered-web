// Loads everything the battle engine reads synchronously: C data definitions, graphics packs and the
// assembled battle / AI / animation scripts.

import { loadCData, preloadPacks } from "../hw/assets";
import { preloadNamingScreen } from "../namingScreen";
import { loadBattleScripts } from "./bscript";

const CDATA_FILES = [
  "battle_anim", "battle_anim_mons", "battle_anim_smokescreen", "battle_anim_special", "battle_bg", "battle_main", "battle_message",
  "battle_script_commands", "battle_interface", "data", "graphics", "pokeball", "pokedex", "pokemon", "pokemon_icon",
  "pokemon_special_anim_scene", "strings", "trig",
];

const PACKS = [
  "pokemon", "graphics_trainers", "graphics_battle_anims", "graphics_battle_terrain", "graphics_battle_interface", "graphics_interface",
  "graphics_fonts", "graphics_text_window", "graphics_pokemon_special_anim",
];

let loading: Promise<void> | null = null;

export function preloadBattleAssets(): Promise<void> {
  return (loading ??= Promise.all([loadCData(...CDATA_FILES), preloadPacks(PACKS), loadBattleScripts(), preloadNamingScreen()]).then(() => undefined));
}
