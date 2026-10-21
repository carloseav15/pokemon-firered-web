// Definición y datos de combates contra entrenadores en rutas de Johto.
import * as C from "../../games/firered/generated/constants";

export interface JohtoTrainerMon {
  species: number;
  level: number;
}

export interface JohtoTrainerInfo {
  id: string;
  name: string;
  trainerClass: string;
  introText: string;
  defeatText: string;
  defeatedText: string;
  party: JohtoTrainerMon[];
  reward: number;
  trainerId: number;
  visionRange: number;
}

export const JOHTO_TRAINERS: Record<string, JohtoTrainerInfo> = {
  // Ruta 30: El Joven Joey
  "Route30_EventScript_Youngster_Joey": {
    id: "Route30_EventScript_Youngster_Joey",
    name: "Joven Joey",
    trainerClass: "Joven",
    introText: "¡Te he visto mirarme fijamente a los ojos! ¡Mi Rattata está en el percentil superior de todos los Rattata del mundo! ¡Prepárate a luchar!",
    defeatText: "¡Oh, no! ¡Mi querido e invencible Rattata ha caído derrotado!",
    defeatedText: "Puede que mi Rattata haya perdido hoy, ¡pero entrenaremos más duro que nadie para ser los mejores de todo Johto!",
    party: [
      { species: C.SPECIES_RATTATA, level: 4 },
    ],
    reward: 64,
    trainerId: C.TRAINER_YOUNGSTER_JOEY,
    visionRange: 4,
  },

  // Ruta 30: El Joven Mikey
  "Route30_EventScript_Youngster_Mikey": {
    id: "Route30_EventScript_Youngster_Mikey",
    name: "Joven Mikey",
    trainerClass: "Joven",
    introText: "¡Para ser un buen entrenador no hay secretos: combatir contra todo el que se cruce! ¡Acepta mi desafío!",
    defeatText: "¡Vaya! ¡Se nota que sabes entrenar a tus Pokémon de verdad!",
    defeatedText: "Convertirse en un maestro Pokémon es un camino duro, ¡pero cada derrota me ayuda a mejorar!",
    party: [
      { species: C.SPECIES_PIDGEY, level: 2 },
      { species: C.SPECIES_RATTATA, level: 4 },
    ],
    reward: 64,
    trainerId: C.TRAINER_YOUNGSTER_BEN,
    visionRange: 3,
  },

  // Ruta 30: Cazabichos Don
  "Route30_EventScript_Bugcatcher_Don": {
    id: "Route30_EventScript_Bugcatcher_Don",
    name: "Cazabichos Don",
    trainerClass: "Cazabichos",
    introText: "¡Mis Pokémon bicho están llenos de energía y no temen a nada! ¡A ver cómo respondes a sus picotazos!",
    defeatText: "¡Mis pobres bichitos no han podido resistir la fuerza de tus ataques!",
    defeatedText: "Se me acabaron las Poké Balls atrapando bichos en la hierba... Menos mal que la tienda está cerca.",
    party: [
      { species: C.SPECIES_CATERPIE, level: 3 },
      { species: C.SPECIES_CATERPIE, level: 3 },
    ],
    reward: 48,
    trainerId: C.TRAINER_BUG_CATCHER_RICK,
    visionRange: 3,
  },

  // Ruta 31: Cazabichos Wade
  "Route31_EventScript_Bugcatcher_Wade": {
    id: "Route31_EventScript_Bugcatcher_Wade",
    name: "Cazabichos Wade",
    trainerClass: "Cazabichos",
    introText: "¡He atrapado a todos estos Pokémon en el bosque! ¿Crees que tu equipo puede vencer a mi enjambre?",
    defeatText: "¡He perdido! Veo que tus Pokémon tienen mucha mejor estrategia.",
    defeatedText: "Aunque lleves 6 Pokémon contigo, si atrapas otro se enviará automáticamente a las cajas del PC.",
    party: [
      { species: C.SPECIES_CATERPIE, level: 2 },
      { species: C.SPECIES_CATERPIE, level: 2 },
      { species: C.SPECIES_WEEDLE, level: 3 },
      { species: C.SPECIES_CATERPIE, level: 2 },
    ],
    reward: 48,
    trainerId: C.TRAINER_BUG_CATCHER_DOUG,
    visionRange: 4,
  },

  // Ruta 32: Joven Albert
  "Route32_EventScript_YoungsterAlbert": {
    id: "Route32_EventScript_YoungsterAlbert",
    name: "Joven Albert",
    trainerClass: "Joven",
    introText: "¡Voy a ganar combates usando solo a mis Pokémon favoritos, no los que todos usan!",
    defeatText: "¡Mis favoritos no han sido suficientes hoy!",
    defeatedText: "Seguiré entrenando a mis favoritos hasta hacerlos campeones.",
    party: [
      { species: C.SPECIES_RATTATA, level: 6 },
      { species: C.SPECIES_ZUBAT, level: 8 },
    ],
    reward: 128,
    trainerId: C.TRAINER_YOUNGSTER_CALVIN,
    visionRange: 4,
  },

  // Ruta 32: Joven Gordon
  "Route32_EventScript_YoungsterGordon": {
    id: "Route32_EventScript_YoungsterGordon",
    name: "Joven Gordon",
    trainerClass: "Joven",
    introText: "¡La hierba alta está repleta de sorpresas! ¡Te presento a mi compañero de agua!",
    defeatText: "¡Vaya chaparrón nos has dado!",
    defeatedText: "El terreno húmedo de la Ruta 32 es el hogar ideal para los Pokémon de agua.",
    party: [
      { species: C.SPECIES_WOOPER, level: 10 },
    ],
    reward: 160,
    trainerId: C.TRAINER_YOUNGSTER_DAN,
    visionRange: 3,
  },

  // Ruta 34: Joven Ian
  "Route34_EventScript_YoungsterIan": {
    id: "Route34_EventScript_YoungsterIan",
    name: "Joven Ian",
    trainerClass: "Joven",
    introText: "¡Entreno a diario para ser el número uno de mi clase de entrenadores!",
    defeatText: "¡Tu equipo está en otra liga!",
    defeatedText: "Aún me queda mucho por estudiar para llegar a la altura de entrenadores como tú.",
    party: [
      { species: C.SPECIES_MANKEY, level: 10 },
      { species: C.SPECIES_DIGLETT, level: 12 },
    ],
    reward: 192,
    trainerId: C.TRAINER_YOUNGSTER_CHAD,
    visionRange: 4,
  },

  // Ruta 34: Joven Samuel
  "Route34_EventScript_YoungsterSamuel": {
    id: "Route34_EventScript_YoungsterSamuel",
    name: "Joven Samuel",
    trainerClass: "Joven",
    introText: "¡Mi sueño es convertirme en Líder de Gimnasio algún día! ¡Demuéstrame tu fuerza!",
    defeatText: "¡Impresionante! Tienes madera de futuro campeón.",
    defeatedText: "Algún día abriré mi propio gimnasio y te desafiaré por la medalla.",
    party: [
      { species: C.SPECIES_RATTATA, level: 7 },
      { species: C.SPECIES_SANDSHREW, level: 10 },
      { species: C.SPECIES_SPEAROW, level: 8 },
      { species: C.SPECIES_SPEAROW, level: 10 },
    ],
    reward: 160,
    trainerId: C.TRAINER_YOUNGSTER_TYLER,
    visionRange: 4,
  },
};

/**
 * Resuelve la información de combate de un entrenador de Johto.
 */
export function getJohtoTrainerInfo(scriptName?: string, mapId?: string, localId?: number): JohtoTrainerInfo | undefined {
  if (scriptName && scriptName in JOHTO_TRAINERS) return JOHTO_TRAINERS[scriptName];

  // Caso especial: Joey en combate en la Ruta 30 (localId 2 o 6)
  if (scriptName === "Route30_EventScript_Youngster_Joey_Fighting" || (mapId === "MAP_ROUTE30" && (localId === 2 || localId === 6))) {
    return JOHTO_TRAINERS["Route30_EventScript_Youngster_Joey"];
  }

  // Caso especial: Mikey en la Ruta 30 (localId 7)
  if (mapId === "MAP_ROUTE30" && localId === 7) {
    return JOHTO_TRAINERS["Route30_EventScript_Youngster_Mikey"];
  }

  // Caso especial: Don en la Ruta 30 (localId 4)
  if (mapId === "MAP_ROUTE30" && localId === 4) {
    return JOHTO_TRAINERS["Route30_EventScript_Bugcatcher_Don"];
  }

  // Caso especial: Wade en la Ruta 31 (localId 1)
  if (mapId === "MAP_ROUTE31" && localId === 1) {
    return JOHTO_TRAINERS["Route31_EventScript_Bugcatcher_Wade"];
  }

  return undefined;
}

/** Comprueba si un NPC es un entrenador combatible en Johto. */
export function isJohtoTrainer(scriptName?: string, mapId?: string, localId?: number): boolean {
  return getJohtoTrainerInfo(scriptName, mapId, localId) !== undefined;
}
