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
  Potion: { name: "Potion", itemId: C.ITEM_POTION },
  SuperPotion: { name: "Super Potion", itemId: C.ITEM_SUPER_POTION },
  HyperPotion: { name: "Hyper Potion", itemId: C.ITEM_HYPER_POTION },
  MaxPotion: { name: "Max Potion", itemId: C.ITEM_MAX_POTION },
  FullRestore: { name: "Full Restore", itemId: C.ITEM_FULL_RESTORE },
  Revive: { name: "Revive", itemId: C.ITEM_REVIVE },
  MaxRevive: { name: "Max Revive", itemId: C.ITEM_MAX_REVIVE },
  Ether: { name: "Ether", itemId: C.ITEM_ETHER },
  MaxEther: { name: "Max Ether", itemId: C.ITEM_MAX_ETHER },
  Elixir: { name: "Elixir", itemId: C.ITEM_ELIXIR },
  MaxElixir: { name: "Max Elixir", itemId: C.ITEM_MAX_ELIXIR },
  Antidote: { name: "Antidote", itemId: C.ITEM_ANTIDOTE },
  ParlyzHeal: { name: "Parlyz Heal", itemId: C.ITEM_PARALYZE_HEAL },
  Awakening: { name: "Awakening", itemId: C.ITEM_AWAKENING },
  BurnHeal: { name: "Burn Heal", itemId: C.ITEM_BURN_HEAL },
  IceHeal: { name: "Ice Heal", itemId: C.ITEM_ICE_HEAL },
  FullHeal: { name: "Full Heal", itemId: C.ITEM_FULL_HEAL },
  PokeBall: { name: "Poké Ball", itemId: C.ITEM_POKE_BALL },
  GreatBall: { name: "Great Ball", itemId: C.ITEM_GREAT_BALL },
  UltraBall: { name: "Ultra Ball", itemId: C.ITEM_ULTRA_BALL },
  MasterBall: { name: "Master Ball", itemId: C.ITEM_MASTER_BALL },
  Repel: { name: "Repel", itemId: C.ITEM_REPEL },
  SuperRepel: { name: "Super Repel", itemId: C.ITEM_SUPER_REPEL },
  MaxRepel: { name: "Max Repel", itemId: C.ITEM_MAX_REPEL },
  EscapeRope: { name: "Escape Rope", itemId: C.ITEM_ESCAPE_ROPE },
  RareCandy: { name: "Rare Candy", itemId: C.ITEM_RARE_CANDY },
  Nugget: { name: "Nugget", itemId: C.ITEM_NUGGET },
  StarPiece: { name: "Star Piece", itemId: C.ITEM_STAR_PIECE },
  Stardust: { name: "Stardust", itemId: C.ITEM_STARDUST },
  PPUp: { name: "PP Up", itemId: C.ITEM_PP_UP },
  HpUp: { name: "HP Up", itemId: C.ITEM_HP_UP },
  Carbos: { name: "Carbos", itemId: C.ITEM_CARBOS },
  Calcium: { name: "Calcium", itemId: C.ITEM_CALCIUM },
  Iron: { name: "Iron", itemId: C.ITEM_IRON },
  Protein: { name: "Protein", itemId: C.ITEM_PROTEIN },
  Zinc: { name: "Zinc", itemId: C.ITEM_ZINC },
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
    return { name: `TM (${key.replace("TM", "")})`, itemId: C.ITEM_TM01 };
  }

  // Traducción y formateo genérico
  const formatted = key.replace(/([A-Z])/g, " $1").trim();
  return { name: formatted, itemId: C.ITEM_POKE_BALL };
}

/** Adapted inspection text; official-source review remains pending. */
export function getJohtoInspection(
  mapId: string,
  x: number,
  y: number,
  scriptName?: string
): JohtoInspectionInfo | undefined {
  if (!scriptName) return undefined;

  if (scriptName.includes("EventScript_NES")) {
    return {
      title: "NES console",
      text: "You played a fun game on the 8-bit NES!\n\n...What memories! But it is time to explore Johto.",
    };
  }

  if (scriptName.includes("EventScript_WallClock") || scriptName.includes("Clock")) {
    return {
      title: "Wall clock",
      text: "An elegant wall clock synchronized with Johto's local time.",
    };
  }

  if (scriptName.includes("EventScript_PC") || scriptName.includes("BirchsLab_EventScript_PC")) {
    if (mapId.includes("LAB")) {
      return {
        title: "Lab computer",
        text: "The computer displays Professor Elm's research into Pokémon origins and evolution.",
      };
    }
    return {
      title: "Storage PC",
      text: "The PC is on. It displays Bill's Pokémon Storage System for Trainers.",
    };
  }

  if (scriptName.includes("HealingMachine")) {
    return {
      title: "Elm's Healing Machine",
      text: "You place your Pokémon in the professor's machine!\n\nA soft healing light surrounds the Poké Balls... Your party has recovered its energy and health!",
      heal: true,
    };
  }

  if (scriptName.includes("BookShelf") || scriptName.includes("Bookshelf")) {
    return {
      title: "Bookshelf",
      text: "The shelves are full of books and encyclopedias about Pokémon, routes and ancient legends!",
    };
  }

  if (scriptName.includes("StatueDescription") || scriptName.includes("SproutTower_2F_EventScript_Statue")) {
    if (mapId.includes("SPROUT")) {
      return {
        title: "Sacred statue",
        text: "A revered Bellsprout statue carved from ancient wood watches over the tower.",
      };
    }
    return {
      title: "Ruins of Alph statue",
      text: "An ancient stone statue with strange inscriptions resembling the mysterious Unown.",
    };
  }

  if (scriptName.includes("EmptyTrashCan") || scriptName.includes("Trash")) {
    return {
      title: "Trash can",
      text: "You look in the trash can... It is empty.",
    };
  }

  if (scriptName.includes("PlayersHouseMailbox")) {
    return {
      title: "Mailbox",
      text: "The player's mailbox.",
    };
  }

  if (scriptName.includes("ElmsHouseMailbox") || scriptName.includes("LabSign")) {
    return {
      title: "Professor Elm's Lab",
      text: "Professor Elm's Pokémon Research Lab.",
    };
  }

  if (scriptName.includes("TownSign")) {
    return {
      title: "New Bark Town",
      text: "New Bark Town: Where Winds of a New Beginning Blow!",
    };
  }

  return undefined;
}
