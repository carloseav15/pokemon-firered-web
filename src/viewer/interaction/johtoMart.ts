// Sistema de Tiendas Pokémon (Poké Marts) para el visor de Johto y Kanto.
import * as C from "../../games/firered/generated/constants";
import { GetMoney, removeMoney, addBagItem } from "@core/pokemon/items";
import type { DialogManager } from "../ui/dialog";
import type { ViewerAudioController } from "../audio/audioController";

export interface MartItem {
  itemId: number;
  name: string;
  price: number;
  description: string;
  category: "balls" | "potions" | "status" | "tools";
}

export const BASE_MART_ITEMS: MartItem[] = [
  // Poké Balls
  { itemId: C.ITEM_POKE_BALL, name: "Poké Ball", price: 200, description: "A standard ball for catching wild Pokémon.", category: "balls" },
  { itemId: C.ITEM_GREAT_BALL, name: "Great Ball", price: 600, description: "A high-performance ball with a higher catch rate.", category: "balls" },
  { itemId: C.ITEM_ULTRA_BALL, name: "Ultra Ball", price: 1200, description: "A high-quality ball with a very high catch rate.", category: "balls" },

  // Medicinas y Curas de PS
  { itemId: C.ITEM_POTION, name: "Potion", price: 300, description: "A spray medicine that restores 20 HP.", category: "potions" },
  { itemId: C.ITEM_SUPER_POTION, name: "Super Potion", price: 700, description: "A spray medicine that restores 50 HP.", category: "potions" },
  { itemId: C.ITEM_HYPER_POTION, name: "Hyper Potion", price: 1200, description: "Restores 200 HP.", category: "potions" },
  { itemId: C.ITEM_REVIVE, name: "Revive", price: 1500, description: "Revives a fainted Pokémon with half its HP.", category: "potions" },

  // Curas de Estado
  { itemId: C.ITEM_ANTIDOTE, name: "Antidote", price: 100, description: "Cures a Pokémon's poisoning.", category: "status" },
  { itemId: C.ITEM_PARALYZE_HEAL, name: "Parlyz Heal", price: 200, description: "Cures a Pokémon's paralysis.", category: "status" },
  { itemId: C.ITEM_AWAKENING, name: "Awakening", price: 250, description: "Wakes a sleeping Pokémon.", category: "status" },
  { itemId: C.ITEM_BURN_HEAL, name: "Burn Heal", price: 250, description: "Heals a Pokémon's burn.", category: "status" },
  { itemId: C.ITEM_ICE_HEAL, name: "Ice Heal", price: 250, description: "Thaws a frozen Pokémon.", category: "status" },

  // Herramientas de Aventura
  { itemId: C.ITEM_ESCAPE_ROPE, name: "Escape Rope", price: 550, description: "A rope for escaping from caves.", category: "tools" },
  { itemId: C.ITEM_REPEL, name: "Repel", price: 350, description: "Repels weak wild Pokémon for 100 steps.", category: "tools" },
  { itemId: C.ITEM_SUPER_REPEL, name: "Super Repel", price: 500, description: "Repels weak wild Pokémon for 200 steps.", category: "tools" },
];

/** Determina si un objeto o script corresponde al dependiente de la tienda. */
export function isMartClerk(graphicsName?: string, scriptName?: string): boolean {
  if (graphicsName === "OBJ_EVENT_GFX_CLERK" || (graphicsName && graphicsName.includes("CLERK"))) return true;
  if (typeof scriptName === "string") {
    const s = scriptName.toLowerCase();
    if (s.includes("clerk") || s.includes("pokemart") || s === "common_openmart") return true;
  }
  return false;
}

/** Devuelve los artículos disponibles según el avance o tamaño de la ciudad. */
export function getMartCatalogue(mapId: string): MartItem[] {
  const m = mapId.toUpperCase();
  const isEarlyTown = m.includes("CHERRYGROVE") || m.includes("VIOLET") || m.includes("AZALEA") || m.includes("VIRIDIAN") || m.includes("PEWTER") || m.includes("OLDALE") || m.includes("PETALBURG");

  if (isEarlyTown) {
    // Tienda inicial: objetos esenciales
    return BASE_MART_ITEMS.filter(it =>
      it.itemId === C.ITEM_POKE_BALL ||
      it.itemId === C.ITEM_POTION ||
      it.itemId === C.ITEM_ANTIDOTE ||
      it.itemId === C.ITEM_PARALYZE_HEAL ||
      it.itemId === C.ITEM_AWAKENING ||
      it.itemId === C.ITEM_ESCAPE_ROPE ||
      it.itemId === C.ITEM_REPEL
    );
  }

  // Tiendas más avanzadas (Trigal, Iris, Olivo, Ciudad Azafrán, etc.)
  return BASE_MART_ITEMS;
}

/** Ejecuta la transacción de compra de un artículo. */
export function buyMartItem(itemId: number, count: number = 1): { success: boolean; message: string; premierBallAwarded?: boolean } {
  const item = BASE_MART_ITEMS.find(it => it.itemId === itemId);
  if (!item) return { success: false, message: "Item unavailable in this shop." };

  const totalCost = item.price * count;
  const currentMoney = GetMoney();

  if (currentMoney < totalCost) {
    return {
      success: false,
      message: `Not enough money (you need ¥${totalCost.toLocaleString("en-US")} and have ¥${currentMoney.toLocaleString("en-US")}).`,
    };
  }

  removeMoney(totalCost);
  addBagItem(itemId, count);

  let premierBallAwarded = false;
  if (itemId === C.ITEM_POKE_BALL && count >= 10) {
    addBagItem(C.ITEM_PREMIER_BALL, 1);
    premierBallAwarded = true;
  }

  return {
    success: true,
    message: `Purchased ${count}x ${item.name}!`,
    premierBallAwarded,
  };
}

/** Abre el menú interactivo de la Tienda Pokémon. */
export function openJohtoMart(mapId: string, dialogManager: DialogManager, audioController: ViewerAudioController): void {
  const catalogue = getMartCatalogue(mapId);

  const showMainMenu = () => {
    const money = GetMoney();
    dialogManager.showChoice(
      "Poké Mart",
      [
        "Hello! Welcome to the Poké Mart.\n\n",
        "Your money: ",
        { text: `¥${money.toLocaleString("en-US")}`, strong: true },
        "\n\nHow can we help you today?",
      ],
      [
        {
          label: "🛒 Browse items",
          primary: true,
          action: () => showCategories(),
        },
        {
          label: "👋 Leave",
          action: () => {
            dialogManager.show("Clerk", ["We hope to see you again! Good luck on your journey!"]);
          },
        },
      ]
    );
  };

  const showCategories = () => {
    const money = GetMoney();
    dialogManager.showChoice(
      "Poké Mart - Categories",
      [
        "Choose an item category:\n(Available money: ",
        { text: `¥${money.toLocaleString("en-US")}`, strong: true },
        ")",
      ],
      [
        {
          label: "🔴 Poké Balls",
          primary: true,
          action: () => showItemList("balls"),
        },
        {
          label: "🧪 Potions and Revives",
          action: () => showItemList("potions"),
        },
        {
          label: "🌿 Status healing",
          action: () => showItemList("status"),
        },
        {
          label: "🪢 Adventure and Repels",
          action: () => showItemList("tools"),
        },
        {
          label: "↩️ Back",
          action: () => showMainMenu(),
        },
      ]
    );
  };

  const showItemList = (category: "balls" | "potions" | "status" | "tools") => {
    const items = catalogue.filter(it => it.category === category);
    const categoryName = category === "balls" ? "Poké Balls" : category === "potions" ? "Medicine" : category === "status" ? "Status healing" : "Adventure";
    const money = GetMoney();

    const choices = items.map(item => ({
      label: `${item.name} (¥${item.price.toLocaleString("en-US")})`,
      action: () => showItemDetail(item),
    }));

    choices.push({
      label: "↩️ Change category",
      action: () => showCategories(),
    });

    dialogManager.showChoice(
      `Poké Mart - ${categoryName}`,
      [
        `Items: ${categoryName} available.\nBalance: `,
        { text: `¥${money.toLocaleString("en-US")}`, strong: true },
        "\n\nSelect an item to see its details and buy:",
      ],
      choices
    );
  };

  const showItemDetail = (item: MartItem) => {
    const money = GetMoney();
    const canAfford1 = money >= item.price;
    const canAfford5 = money >= item.price * 5;
    const canAfford10 = money >= item.price * 10;

    const choices = [
      {
        label: `Buy x1 (¥${item.price.toLocaleString("en-US")})`,
        primary: canAfford1,
        action: () => processPurchase(item, 1),
      },
      {
        label: `Buy x5 (¥${(item.price * 5).toLocaleString("en-US")})`,
        action: () => processPurchase(item, 5),
      },
    ];

    if (item.itemId === C.ITEM_POKE_BALL) {
      choices.push({
        label: `Buy x10 (¥${(item.price * 10).toLocaleString("en-US")} + Premier Ball 🎁)`,
        action: () => processPurchase(item, 10),
      });
    } else {
      choices.push({
        label: `Buy x10 (¥${(item.price * 10).toLocaleString("en-US")})`,
        action: () => processPurchase(item, 10),
      });
    }

    choices.push({
      label: "↩️ Back to list",
      action: () => showItemList(item.category),
    });

    dialogManager.showChoice(
      `Buy: ${item.name}`,
      [
        { text: item.name, strong: true },
        `\n${item.description}\n\nUnit price: `,
        { text: `¥${item.price.toLocaleString("en-US")}`, strong: true },
        `\nYour current money: `,
        { text: `¥${money.toLocaleString("en-US")}`, strong: true },
        "\n\nHow many would you like?",
      ],
      choices
    );
  };

  const processPurchase = (item: MartItem, count: number) => {
    const res = buyMartItem(item.itemId, count);
    if (!res.success) {
      dialogManager.show("Clerk", [
        res.message,
        "\n\n",
        { text: "We cannot offer credit.", strong: true },
      ]);
      return;
    }

    audioController.playShop();
    const remainingMoney = GetMoney();
    const msgSegments: (string | { text: string; strong: true })[] = [
      `Thank you for your purchase!\n\nYou received `,
      { text: `${count}x ${item.name}`, strong: true },
      " and put them in your Bag.",
    ];

    if (res.premierBallAwarded) {
      msgSegments.push(
        "\n\n🎁 ",
        { text: "You also receive a Premier Ball for buying 10 Poké Balls!", strong: true }
      );
    }

    msgSegments.push(
      `\n\nTu saldo restante es of `,
      { text: `¥${remainingMoney.toLocaleString("en-US")}`, strong: true },
      ".\nWould you like to keep shopping?"
    );

    dialogManager.showChoice(
      "Purchase successful!",
      msgSegments,
      [
        {
          label: "🛒 Keep shopping",
          primary: true,
          action: () => showCategories(),
        },
        {
          label: "👋 Finish shopping",
          action: () => {
            dialogManager.show("Clerk", ["Thank you! Come back when you need more supplies!"]);
          },
        },
      ]
    );
  };

  showMainMenu();
}
