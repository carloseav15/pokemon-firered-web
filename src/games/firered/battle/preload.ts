// Loads everything the battle engine reads synchronously: C data definitions, graphics packs and the
// assembled battle / AI / animation scripts.

import { loadCData, preloadPacks } from "@core/hw/assets";
import { isEmeraldData } from "@core/rom";
import { preloadNamingScreen } from "@core/namingScreen";
import { preloadPokedexScreen } from "../pokedexScreen";
import { preloadEvolutionScene } from "../evolutionScene";
import { preloadSummaryScreen } from "../pokemonSummaryScreen";
import { loadBattleScripts } from "@core/battle/bscript";
import "@core/battle/anims";

const CDATA_FILES = [
  "battle_anim", "battle_anim_bug", "battle_anim_dark", "battle_anim_dragon",
  "battle_anim_effects_1", "battle_anim_effects_2", "battle_anim_effects_3",
  "battle_anim_electric", "battle_anim_fight", "battle_anim_fire", "battle_anim_flying",
  "battle_anim_ghost", "battle_anim_ground", "battle_anim_ice", "battle_anim_mon_movement",
  "battle_anim_mons", "battle_anim_normal", "battle_anim_poison", "battle_anim_psychic",
  "battle_anim_rock", "battle_anim_smokescreen", "battle_anim_sound_tasks",
  "battle_anim_special", "battle_anim_status_effects", "battle_anim_utility_funcs",
  "battle_anim_water", "battle_bg", "battle_main", "battle_message",
  "battle_script_commands", "battle_interface", "data", "graphics", "pokeball", "pokedex_screen", "pokemon", "pokemon_icon",
  "pokemon_special_anim_scene", "strings", "trig",
];

const PACKS = [
  "pokemon", "graphics_trainers", "graphics_battle_anims", "graphics_battle_terrain", "graphics_battle_interface", "graphics_interface",
  "graphics_fonts", "graphics_text_window", "graphics_pokemon_special_anim", "graphics_weather",
];

let loading: Promise<void> | null = null;

export function preloadBattleAssets(): Promise<void> {
  return (loading ??= Promise.all([
    // pokeemerald content: its environment backgrounds next to the FireRed interface data (bg.ts).
    loadCData(...CDATA_FILES, ...(isEmeraldData() ? ["fr:battle_bg"] : [])),
    preloadPacks([...PACKS, ...(isEmeraldData() ? ["graphics_battle_environment", "graphics_balls"] : [])]),
    loadBattleScripts(),
    preloadNamingScreen(),
    preloadPokedexScreen(),
    preloadEvolutionScene(),
    preloadSummaryScreen(),
  ]).then(() => undefined));
}
