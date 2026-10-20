export const TILE = 16;

export const LAYERS = [
  "colision",
  "agua",
  "salientes",
  "corte",
  "fuerza",
  "golpe_roca",
  "snorlax",
  "entrenador",
  "npc_condicional",
  "npc",
  "activador",
  "puerta",
] as const;

export type Layer = (typeof LAYERS)[number];

export const LAYER_COLORS: Record<Layer, string> = {
  colision: "rgba(255,0,0,0.35)",
  agua: "rgba(0,120,255,0.35)",
  salientes: "rgba(255,200,0,0.45)",
  corte: "rgba(0,200,0,0.55)",
  fuerza: "rgba(150,75,0,0.55)",
  golpe_roca: "rgba(150,150,150,0.55)",
  snorlax: "rgba(0,150,150,0.6)",
  entrenador: "rgba(255,0,255,0.45)",
  npc_condicional: "rgba(255,165,0,0.5)",
  npc: "rgba(255,255,255,0.5)",
  activador: "rgba(0,255,255,0.5)",
  puerta: "rgba(180,0,255,0.55)",
};

export const LAYER_LABELS: Record<Layer, string> = {
  colision: "Colisión",
  agua: "Agua",
  salientes: "Salientes",
  corte: "Corte",
  fuerza: "Fuerza",
  golpe_roca: "Golpe roca",
  snorlax: "Snorlax",
  entrenador: "Entrenador",
  npc_condicional: "NPC condicional",
  npc: "NPC",
  activador: "Activador",
  puerta: "Puerta",
};

// Fotograma de la GBA: 280896 ciclos a 16,78 MHz (59,73 por segundo). Mismo valor que
// FRAME_MS en src/games/firered/game.ts:112; el juego avanza con este paso fijo y no con el
// refresco de la pantalla (que en un Mac puede ser 120 Hz).
export const GBA_FRAME_MS = 1000 / (16777216 / 280896);

export const BIOME_TREES = 0;
export const BIOME_OCEAN = 1;
export const BIOME_MOUNTAIN = 2;
export const BIOME_NAMES = ["bosque (árboles densos)", "marítimo (océano)", "montañoso (cordillera)"] as const;

export const ANIM_RANGES: Record<string, Array<[number, number]>> = {
  // FireRed
  InitTilesetAnim_General: [[416, 464], [464, 482], [508, 512]],
  InitTilesetAnim_CeladonCity: [[744, 752]],
  InitTilesetAnim_SilphCo: [[976, 984]],
  InitTilesetAnim_MtEmber: [[896, 904]],
  InitTilesetAnim_VermilionGym: [[880, 887]],
  InitTilesetAnim_CeladonGym: [[739, 743]],

  // Emerald
  InitTilesetAnim_General_Emerald: [[432, 462], [464, 474], [480, 490], [496, 502], [508, 512]],
  InitTilesetAnim_Building: [[496, 500]],
  InitTilesetAnim_Rustboro: [[640, 672], [960, 964]],
  InitTilesetAnim_Dewford: [[682, 688]],
  InitTilesetAnim_Slateport: [[736, 740]],
  InitTilesetAnim_Mauville: [[608, 672]],
  InitTilesetAnim_Lavaridge: [[672, 676], [800, 808]],
  InitTilesetAnim_EverGrande: [[736, 768]],
  InitTilesetAnim_Pacifidlog: [[976, 1006], [1008, 1016]],
  InitTilesetAnim_Sootopolis: [[752, 848]],
  InitTilesetAnim_Underwater: [[1008, 1012]],
  InitTilesetAnim_Cave: [[928, 932]],
  InitTilesetAnim_BattleFrontierOutsideWest: [[730, 736]],
  InitTilesetAnim_BattleFrontierOutsideEast: [[730, 736]],
  InitTilesetAnim_SootopolisGym: [[976, 996], [1008, 1020]],
  InitTilesetAnim_EliteFour: [[992, 996], [1016, 1017]],
  InitTilesetAnim_MauvilleGym: [[656, 672]],
  InitTilesetAnim_BikeShop: [[1008, 1017]],
  InitTilesetAnim_BattlePyramid: [[647, 655], [663, 671]],
};
