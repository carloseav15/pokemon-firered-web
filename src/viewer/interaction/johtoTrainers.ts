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
    name: "Youngster Joey",
    trainerClass: "Youngster",
    introText: "I saw you looking right at me! My Rattata is in the top percentage of all Rattata! Get ready to battle!",
    defeatText: "Oh no! My dear, unbeatable Rattata was defeated!",
    defeatedText: "My Rattata lost today, but we will train hard to be the best in Johto!",
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
    name: "Youngster Mikey",
    trainerClass: "Youngster",
    introText: "The secret to being a good Trainer is battling everyone you meet! Accept my challenge!",
    defeatText: "Wow! You really know how to train your Pokémon!",
    defeatedText: "Becoming a Pokémon master is hard, but every defeat helps me improve!",
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
    name: "Bug Catcher Don",
    trainerClass: "Bug Catcher",
    introText: "My Bug Pokémon are full of energy and fearless! Let's see how you handle their attacks!",
    defeatText: "My poor bugs could not withstand your attacks!",
    defeatedText: "I used all my Poké Balls catching bugs in the grass... Good thing the shop is nearby.",
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
    name: "Bug Catcher Wade",
    trainerClass: "Bug Catcher",
    introText: "I caught all these Pokémon in the forest! Can your team beat my swarm?",
    defeatText: "I lost! Your Pokémon have a much better strategy.",
    defeatedText: "If you have six Pokémon with you, any others you catch are sent to the PC Boxes.",
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
    name: "Youngster Albert",
    trainerClass: "Youngster",
    introText: "I will win with my favorite Pokémon, not just the ones everyone uses!",
    defeatText: "My favorites were not enough today!",
    defeatedText: "I will keep training my favorites until they are champions.",
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
    name: "Youngster Gordon",
    trainerClass: "Youngster",
    introText: "The tall grass is full of surprises! Meet my Water-type partner!",
    defeatText: "You really rained on our parade!",
    defeatedText: "Route 32's wet ground is ideal for Water Pokémon.",
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
    name: "Youngster Ian",
    trainerClass: "Youngster",
    introText: "I train every day to be the best Trainer in my class!",
    defeatText: "Your team is in another league!",
    defeatedText: "I still have much to learn to match Trainers like you.",
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
    name: "Youngster Samuel",
    trainerClass: "Youngster",
    introText: "My dream is to become a Gym Leader! Show me your strength!",
    defeatText: "Impressive! You have what it takes to become a Champion.",
    defeatedText: "Someday I will open my own Gym and challenge you for the Badge.",
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
