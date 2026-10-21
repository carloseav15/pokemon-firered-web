import * as C from "../../games/firered/generated/constants";

/**
 * Mapeo de etiquetas de música de Johto (Heart & Soul / HGSS) hacia las
 * pistas de audio GBA del visor.
 *
 * Aprovecha los arreglos oficiales de GBA que Game Freak y Go Ichinose
 * compusieron para FireRed en las Islas Sevii como homenajes a Johto:
 * - MUS_SEVII_123: Pueblo Azalea y Ciudad Endrino (GSC Azalea Town theme)
 * - MUS_SEVII_67: Ciudad Malva y Ciudad Olivo (GSC Violet City theme)
 * - MUS_SEVII_ROUTE: Ruta 42, 43, 44 y Lago de la Furia (GSC Route 42 theme)
 * - MUS_SEVII_DUNGEON: Cueva Unión, Encinar y Ruinas Alfa (GSC Union Cave theme)
 * - MUS_SEVII_45: Ciudad Cerezo, Pueblo Caoba y Parque Nacional (GSC Sevii remix)
 * - MUS_SEVII_CAVE: Ruta Helada, Guarida Dragón y cuevas oscuras
 * y las pistas correspondientes para el recorrido de Kanto en Johto y vehículos.
 */
export const JOHTO_MUSIC_MAP: Record<string, number> = {
  // Ciudades y pueblos de Johto
  MUS_HG_NEW_BARK: C.MUS_PALLET,
  MUS_HG_CHERRYGROVE: C.MUS_SEVII_45,
  MUS_HG_VIOLET: C.MUS_SEVII_67,
  MUS_HG_AZALEA: C.MUS_SEVII_123,
  MUS_HG_GOLDENROD: C.MUS_CELADON,
  MUS_HG_ECRUTEAK: C.MUS_POKE_TOWER,
  MUS_HG_CIANWOOD: C.MUS_VERMILLION,

  // Rutas y exteriores de Johto
  MUS_HG_ROUTE29: C.MUS_ROUTE1,
  MUS_HG_ROUTE30: C.MUS_ROUTE3,
  MUS_HG_ROUTE34: C.MUS_ROUTE11,
  MUS_HG_ROUTE38: C.MUS_ROUTE24,
  MUS_HG_ROUTE42: C.MUS_SEVII_ROUTE,
  MUS_HG_ROUTE47: C.MUS_SEVII_ROUTE,
  MUS_HG_BELL_TOWER: C.MUS_POKE_TOWER,
  MUS_HG_LIGHTHOUSE: C.MUS_VIRIDIAN_FOREST,
  MUS_HG_UNION_CAVE: C.MUS_SEVII_DUNGEON,
  MUS_HG_MT_MOON_SQUARE: C.MUS_MT_MOON,
  MUS_HG_NATIONAL_PARK: C.MUS_SEVII_45,
  MUS_HG_SAFARI_ZONE: C.MUS_SEVII_ROUTE,
  MUS_HG_SAFARI_ZONE_GATE: C.MUS_SEVII_ROUTE,
  MUS_HG_RUINS_OF_ALPH: C.MUS_SEVII_CAVE,
  MUS_HG_SPROUT_TOWER: C.MUS_POKE_TOWER,
  MUS_HG_BURNED_TOWER: C.MUS_POKE_TOWER,
  MUS_HG_ICE_PATH: C.MUS_SEVII_CAVE,
  MUS_HG_DRAGONS_DEN: C.MUS_SEVII_CAVE,
  MUS_HG_ROCK_TUNNEL: C.MUS_MT_MOON,
  MUS_HG_VICTORY_ROAD: C.MUS_VICTORY_ROAD,
  MUS_HG_POKEMON_LEAGUE: C.MUS_VICTORY_ROAD,
  MUS_HG_SS_AQUA: C.MUS_SS_ANNE,
  MUS_HG_ELM_LAB: C.MUS_OAK_LAB,
  MUS_HG_OAK: C.MUS_OAK,
  MUS_HG_GYM: C.MUS_GYM,
  MUS_HG_POKE_CENTER: C.MUS_POKE_CENTER,
  MUS_HG_POKE_MART: C.MUS_POKE_CENTER,
  MUS_HG_GAME_CORNER: C.MUS_GAME_CORNER,
  MUS_HG_TEAM_ROCKET_HQ: C.MUS_ROCKET_HIDEOUT,
  MUS_HG_ROCKET_TAKEOVER: C.MUS_ROCKET_HIDEOUT,
  MUS_HG_VIRIDIAN_FOREST: C.MUS_VIRIDIAN_FOREST,

  // Vehículos en Johto
  MUS_HG_CYCLING: C.MUS_CYCLING,
  MUS_HG_SURF: C.MUS_SURF,

  // Ciudades de Kanto presentes en el mundo continuo
  MUS_HG_PALLET: C.MUS_PALLET,
  MUS_HG_PEWTER: C.MUS_PEWTER,
  MUS_HG_CERULEAN: C.MUS_CELADON,
  MUS_HG_VERMILION: C.MUS_VERMILLION,
  MUS_HG_CELADON: C.MUS_CELADON,
  MUS_HG_LAVENDER: C.MUS_LAVENDER,
  MUS_HG_CINNABAR: C.MUS_CINNABAR,

  // Rutas de Kanto presentes en el mundo continuo
  MUS_HG_ROUTE1: C.MUS_ROUTE1,
  MUS_HG_ROUTE3: C.MUS_ROUTE3,
  MUS_HG_ROUTE11: C.MUS_ROUTE11,
  MUS_HG_ROUTE24: C.MUS_ROUTE24,
  MUS_HG_ROUTE26: C.MUS_ROUTE24,

  // Especiales
  MUS_PL_FIGHT_AREA_DAY: C.MUS_TRAINER_TOWER,
  MUS_DUMMY: 0,
  MUS_NONE: 0,
};

/**
 * Resuelve una etiqueta de música de Johto (o nombre simbólico) a su ID de pista de audio GBA.
 */
export function resolveJohtoMusic(name?: string | null): number {
  if (!name) return C.MUS_PALLET;
  return JOHTO_MUSIC_MAP[name] ?? C.MUS_PALLET;
}
