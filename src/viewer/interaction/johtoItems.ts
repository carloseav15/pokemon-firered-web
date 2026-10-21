import * as C from "../../games/firered/generated/constants";

export interface JohtoItemInfo {
  name: string;
  itemId: number;
}

export interface JohtoInspectionInfo {
  title: string;
  text: string;
  heal?: boolean;
}

const ITEM_NAME_MAP: Record<string, { name: string; itemId: number }> = {
  Potion: { name: "Poción", itemId: C.ITEM_POTION },
  SuperPotion: { name: "Superpoción", itemId: C.ITEM_SUPER_POTION },
  HyperPotion: { name: "Hiperpoción", itemId: C.ITEM_HYPER_POTION },
  MaxPotion: { name: "Poción Máxima", itemId: C.ITEM_MAX_POTION },
  FullRestore: { name: "Restaura Todo", itemId: C.ITEM_FULL_RESTORE },
  Revive: { name: "Revivir", itemId: C.ITEM_REVIVE },
  MaxRevive: { name: "Revivir Máximo", itemId: C.ITEM_MAX_REVIVE },
  Ether: { name: "Éter", itemId: C.ITEM_ETHER },
  MaxEther: { name: "Éter Máximo", itemId: C.ITEM_MAX_ETHER },
  Elixir: { name: "Elixir", itemId: C.ITEM_ELIXIR },
  MaxElixir: { name: "Elixir Máximo", itemId: C.ITEM_MAX_ELIXIR },
  Antidote: { name: "Antídoto", itemId: C.ITEM_ANTIDOTE },
  ParlyzHeal: { name: "Antiparalizador", itemId: C.ITEM_PARALYZE_HEAL },
  Awakening: { name: "Despertar", itemId: C.ITEM_AWAKENING },
  BurnHeal: { name: "Antiquemar", itemId: C.ITEM_BURN_HEAL },
  IceHeal: { name: "Antihielo", itemId: C.ITEM_ICE_HEAL },
  FullHeal: { name: "Cura Total", itemId: C.ITEM_FULL_HEAL },
  PokeBall: { name: "Poké Ball", itemId: C.ITEM_POKE_BALL },
  GreatBall: { name: "Super Ball", itemId: C.ITEM_GREAT_BALL },
  UltraBall: { name: "Ultra Ball", itemId: C.ITEM_ULTRA_BALL },
  MasterBall: { name: "Master Ball", itemId: C.ITEM_MASTER_BALL },
  Repel: { name: "Repelente", itemId: C.ITEM_REPEL },
  SuperRepel: { name: "Superrepelente", itemId: C.ITEM_SUPER_REPEL },
  MaxRepel: { name: "Repelente Máximo", itemId: C.ITEM_MAX_REPEL },
  EscapeRope: { name: "Cuerda Huida", itemId: C.ITEM_ESCAPE_ROPE },
  RareCandy: { name: "Caramelo Raro", itemId: C.ITEM_RARE_CANDY },
  Nugget: { name: "Pepita", itemId: C.ITEM_NUGGET },
  StarPiece: { name: "Trozo Estrella", itemId: C.ITEM_STAR_PIECE },
  Stardust: { name: "Polvoestelar", itemId: C.ITEM_STARDUST },
  PPUp: { name: "Más PP", itemId: C.ITEM_PP_UP },
  HpUp: { name: "Más PS", itemId: C.ITEM_HP_UP },
  Carbos: { name: "Carburante", itemId: C.ITEM_CARBOS },
  Calcium: { name: "Calcio", itemId: C.ITEM_CALCIUM },
  Iron: { name: "Hierro", itemId: C.ITEM_IRON },
  Protein: { name: "Proteína", itemId: C.ITEM_PROTEIN },
  Zinc: { name: "Cinc", itemId: C.ITEM_ZINC },
};

/** Resuelve el nombre e identificador de un objeto del suelo a partir de su script de evento. */
export function getJohtoItemInfo(scriptName?: string): JohtoItemInfo | undefined {
  if (!scriptName) return undefined;
  const match = scriptName.match(/Item_?([A-Za-z0-9]+)/);
  if (!match) return undefined;
  const key = match[1]!;
  if (ITEM_NAME_MAP[key]) return ITEM_NAME_MAP[key];

  // Casos especiales de MTs
  if (key.startsWith("TM")) {
    return { name: `MT (${key.replace("TM", "")})`, itemId: C.ITEM_TM01 };
  }

  // Traducción y formateo genérico
  const formatted = key.replace(/([A-Z])/g, " $1").trim();
  return { name: formatted, itemId: C.ITEM_POKE_BALL };
}

/** Textos auténticos de inspección de objetos interactivos en casas y edificios (PC, NES, estanterías, etc.). */
export function getJohtoInspection(
  mapId: string,
  x: number,
  y: number,
  scriptName?: string
): JohtoInspectionInfo | undefined {
  if (!scriptName) return undefined;

  if (scriptName.includes("EventScript_NES")) {
    return {
      title: "Consola NES",
      text: "¡Has jugado una divertida partida en la consola NES de 8 bits!\n\n...¡Qué recuerdos! Pero ya es hora de partir a explorar la región de Johto.",
    };
  }

  if (scriptName.includes("EventScript_WallClock") || scriptName.includes("Clock")) {
    return {
      title: "Reloj de pared",
      text: "Es un elegante reloj de pared con la hora de Johto perfectamente sincronizada.",
    };
  }

  if (scriptName.includes("EventScript_PC") || scriptName.includes("BirchsLab_EventScript_PC")) {
    if (mapId.includes("LAB")) {
      return {
        title: "Ordenador del Laboratorio",
        text: "En la pantalla del ordenador se detallan las investigaciones del Profesor Elm sobre los orígenes y la evolución de los Pokémon.",
      };
    }
    return {
      title: "PC de Almacenamiento",
      text: "El PC está encendido. Muestra el sistema de almacenamiento de Pokémon desarrollado por Bill para entrenadores.",
    };
  }

  if (scriptName.includes("HealingMachine")) {
    return {
      title: "Máquina Regeneradora de Elm",
      text: "¡Colocas a tus Pokémon en los compartimentos de la máquina del Profesor!\n\nUn suave destello reparador envuelve las Poké Balls... ¡Tu equipo ha recuperado toda su energía y salud!",
      heal: true,
    };
  }

  if (scriptName.includes("BookShelf") || scriptName.includes("Bookshelf")) {
    return {
      title: "Estantería",
      text: "¡Las estanterías están repletas de interesantes libros y enciclopedias sobre Pokémon, rutas y leyendas antiguas!",
    };
  }

  if (scriptName.includes("StatueDescription") || scriptName.includes("SproutTower_2F_EventScript_Statue")) {
    if (mapId.includes("SPROUT")) {
      return {
        title: "Estatua Sagrada",
        text: "Una venerada estatua de Bellsprout esculpida a mano en madera milenaria que protege la Torre.",
      };
    }
    return {
      title: "Estatua de las Ruinas Alfa",
      text: "Una antiquísima estatua de piedra con extrañas inscripciones en relieve que recuerdan a los misteriosos Unown.",
    };
  }

  if (scriptName.includes("EmptyTrashCan") || scriptName.includes("Trash")) {
    return {
      title: "Papelera",
      text: "Miras dentro de la papelera... pero no hay nada.",
    };
  }

  if (scriptName.includes("PlayersHouseMailbox")) {
    return {
      title: "Buzón de correo",
      text: "Buzón de la Casa del Jugador.",
    };
  }

  if (scriptName.includes("ElmsHouseMailbox") || scriptName.includes("LabSign")) {
    return {
      title: "Laboratorio del Prof. Elm",
      text: "Laboratorio de Investigación Pokémon del Profesor Elm.",
    };
  }

  if (scriptName.includes("TownSign")) {
    return {
      title: "Pueblo Primavera",
      text: "Pueblo Primavera: Donde sopla el viento del comienzo.",
    };
  }

  return undefined;
}
