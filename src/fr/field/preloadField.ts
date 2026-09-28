// C data definitions and INCBIN packs read synchronously by the field-side
// ports (field effects, specials, key items, menus). Loaded once at boot.

import { loadCData, preloadPacks } from "../hw/assets";

const CDATA_FILES = [
  "field_effect", "field_specials", "vs_seeker", "pokemon_jump", "fame_checker", "party_menu", "item_menu", "region_map", "map_preview_screen",
  "renewable_hidden_items", "pokemon_summary_screen", "pokedex_screen", "trainer_card", "evolution_scene", "hall_of_fame", "daycare", "trade", "trade_scene",
  "roamer", "seagallop", "field_weather", "field_weather_effects", "battle_transition", "learn_move", "tm_case", "berry_pouch",
  "shop", "item_pc", "pokemon_storage_system_graphics", "pokemon_storage_system_data", "diploma", "credits", "slot_machine",
  "trainer_tower", "help_system", "teachy_tv", "easy_chat", "itemfinder", "ss_anne", "script_menu", "field_tasks", "field_door", "event_object_movement",
];

const PACKS = [
  "graphics_field_effects", "graphics_field_specials", "graphics_interface", "graphics_object_events", "graphics_ss_anne", "graphics_seagallop",
  "graphics_weather", "graphics_cave_transition", "graphics_battle_transitions", "graphics_misc", "graphics_region_map", "graphics_map_preview",
  "graphics_party_menu", "graphics_item_menu", "graphics_summary_screen", "graphics_pokedex", "graphics_trainer_card",
  "graphics_evolution_scene", "graphics_hall_of_fame", "graphics_diploma", "graphics_credits", "graphics_items", "graphics_tm_case",
  "graphics_berry_pouch", "graphics_shop_menu", "graphics_item_pc", "graphics_pokemon_storage", "graphics_learn_move",
  "graphics_trade", "graphics_slot_machine", "graphics_teachy_tv", "graphics_fame_checker", "graphics_itemfinder", "graphics_script_menu",
];

let loading: Promise<void> | null = null;

export function preloadFieldAssets(): Promise<void> {
  return (loading ??= Promise.all([loadCData(...CDATA_FILES.filter(Boolean)).catch(() => loadEach()), preloadPacks(PACKS)]).then(() => undefined));
}

/** Some decomp files have no exported definitions; load the rest one by one. */
async function loadEach(): Promise<void> {
  await Promise.all(CDATA_FILES.map((f) => loadCData(f).catch(() => undefined)));
}
