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
  { itemId: C.ITEM_POKE_BALL, name: "Poké Ball", price: 200, description: "Cápsula estándar para atrapar Pokémon salvajes.", category: "balls" },
  { itemId: C.ITEM_GREAT_BALL, name: "Super Ball", price: 600, description: "Poké Ball de alto rendimiento con mayor índice de éxito.", category: "balls" },
  { itemId: C.ITEM_ULTRA_BALL, name: "Ultra Ball", price: 1200, description: "Poké Ball de calidad superior con altísima tasa de captura.", category: "balls" },

  // Medicinas y Curas de PS
  { itemId: C.ITEM_POTION, name: "Poción", price: 300, description: "Medicina en spray que restaura 20 PS de un Pokémon.", category: "potions" },
  { itemId: C.ITEM_SUPER_POTION, name: "Superpoción", price: 700, description: "Medicina en spray que restaura 50 PS de un Pokémon.", category: "potions" },
  { itemId: C.ITEM_HYPER_POTION, name: "Hiperpoción", price: 1200, description: "Restaura 200 PS de un Pokémon.", category: "potions" },
  { itemId: C.ITEM_REVIVE, name: "Revivir", price: 1500, description: "Revive a un Pokémon debilitado recuperando la mitad de sus PS.", category: "potions" },

  // Curas de Estado
  { itemId: C.ITEM_ANTIDOTE, name: "Antídoto", price: 100, description: "Cura el envenenamiento de un Pokémon.", category: "status" },
  { itemId: C.ITEM_PARALYZE_HEAL, name: "Antiparálisis", price: 200, description: "Cura la parálisis de un Pokémon.", category: "status" },
  { itemId: C.ITEM_AWAKENING, name: "Despertar", price: 250, description: "Despierta a un Pokémon dormido.", category: "status" },
  { itemId: C.ITEM_BURN_HEAL, name: "Antiquemar", price: 250, description: "Cura las quemaduras de un Pokémon.", category: "status" },
  { itemId: C.ITEM_ICE_HEAL, name: "Antihielo", price: 250, description: "Descongela a un Pokémon congelado.", category: "status" },

  // Herramientas de Aventura
  { itemId: C.ITEM_ESCAPE_ROPE, name: "Cuerda Huida", price: 550, description: "Cuerda resistente para escapar al instante de cuevas.", category: "tools" },
  { itemId: C.ITEM_REPEL, name: "Repelente", price: 350, description: "Repele Pokémon salvajes débiles durante 100 pasos.", category: "tools" },
  { itemId: C.ITEM_SUPER_REPEL, name: "Superrepelente", price: 500, description: "Repele Pokémon salvajes débiles durante 200 pasos.", category: "tools" },
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
  if (!item) return { success: false, message: "Artículo no disponible en esta tienda." };

  const totalCost = item.price * count;
  const currentMoney = GetMoney();

  if (currentMoney < totalCost) {
    return {
      success: false,
      message: `No tienes suficiente dinero (necesitas ¥${totalCost.toLocaleString()} y tienes ¥${currentMoney.toLocaleString()}).`,
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
    message: `¡Has comprado ${count}x ${item.name}!`,
    premierBallAwarded,
  };
}

/** Abre el menú interactivo de la Tienda Pokémon. */
export function openJohtoMart(mapId: string, dialogManager: DialogManager, audioController: ViewerAudioController): void {
  const catalogue = getMartCatalogue(mapId);

  const showMainMenu = () => {
    const money = GetMoney();
    dialogManager.showChoice(
      "Tienda Pokémon",
      [
        "¡Hola! Te damos la bienvenida a la Tienda Pokémon.\n\n",
        "Tu dinero actual: ",
        { text: `¥${money.toLocaleString()}`, strong: true },
        "\n\n¿En qué podemos ayudarte hoy?",
      ],
      [
        {
          label: "🛒 Ver catálogo de compra",
          primary: true,
          action: () => showCategories(),
        },
        {
          label: "👋 Salir",
          action: () => {
            dialogManager.show("Dependiente", ["¡Esperamos volver a verte! ¡Buena suerte en tu viaje!"]);
          },
        },
      ]
    );
  };

  const showCategories = () => {
    const money = GetMoney();
    dialogManager.showChoice(
      "Tienda Pokémon - Categorías",
      [
        "Selecciona el tipo de artículo que deseas comprar:\n(Tu saldo disponible: ",
        { text: `¥${money.toLocaleString()}`, strong: true },
        ")",
      ],
      [
        {
          label: "🔴 Poké Balls",
          primary: true,
          action: () => showItemList("balls"),
        },
        {
          label: "🧪 Pociones y Revivir",
          action: () => showItemList("potions"),
        },
        {
          label: "🌿 Curas de estado",
          action: () => showItemList("status"),
        },
        {
          label: "🪢 Aventura y Repelentes",
          action: () => showItemList("tools"),
        },
        {
          label: "↩️ Volver",
          action: () => showMainMenu(),
        },
      ]
    );
  };

  const showItemList = (category: "balls" | "potions" | "status" | "tools") => {
    const items = catalogue.filter(it => it.category === category);
    const categoryName = category === "balls" ? "Poké Balls" : category === "potions" ? "Medicinas" : category === "status" ? "Curas de Estado" : "Aventura";
    const money = GetMoney();

    const choices = items.map(item => ({
      label: `${item.name} (¥${item.price.toLocaleString()})`,
      action: () => showItemDetail(item),
    }));

    choices.push({
      label: "↩️ Cambiar categoría",
      action: () => showCategories(),
    });

    dialogManager.showChoice(
      `Tienda Pokémon - ${categoryName}`,
      [
        `Artículos de ${categoryName} disponibles.\nSaldo: `,
        { text: `¥${money.toLocaleString()}`, strong: true },
        "\n\nSelecciona un producto para ver sus detalles y comprar:",
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
        label: `Comprar x1 (¥${item.price.toLocaleString()})`,
        primary: canAfford1,
        action: () => processPurchase(item, 1),
      },
      {
        label: `Comprar x5 (¥${(item.price * 5).toLocaleString()})`,
        action: () => processPurchase(item, 5),
      },
    ];

    if (item.itemId === C.ITEM_POKE_BALL) {
      choices.push({
        label: `Comprar x10 (¥${(item.price * 10).toLocaleString()} + Honor Ball 🎁)`,
        action: () => processPurchase(item, 10),
      });
    } else {
      choices.push({
        label: `Comprar x10 (¥${(item.price * 10).toLocaleString()})`,
        action: () => processPurchase(item, 10),
      });
    }

    choices.push({
      label: "↩️ Volver a la lista",
      action: () => showItemList(item.category),
    });

    dialogManager.showChoice(
      `Comprar: ${item.name}`,
      [
        { text: item.name, strong: true },
        `\n${item.description}\n\nPrecio unitario: `,
        { text: `¥${item.price.toLocaleString()}`, strong: true },
        `\nTu saldo actual: `,
        { text: `¥${money.toLocaleString()}`, strong: true },
        "\n\n¿Cuántas unidades deseas llevarte?",
      ],
      choices
    );
  };

  const processPurchase = (item: MartItem, count: number) => {
    const res = buyMartItem(item.itemId, count);
    if (!res.success) {
      dialogManager.show("Dependiente", [
        res.message,
        "\n\n",
        { text: "No podemos fiar artículos en la tienda.", strong: true },
      ]);
      return;
    }

    audioController.playShop();
    const remainingMoney = GetMoney();
    const msgSegments: (string | { text: string; strong: true })[] = [
      `¡Muchísimas gracias por tu compra!\n\nHas obtenido `,
      { text: `${count}x ${item.name}`, strong: true },
      " que ya están guardados en tu mochila.",
    ];

    if (res.premierBallAwarded) {
      msgSegments.push(
        "\n\n🎁 ",
        { text: "¡Y por comprar 10 Poké Balls te obsequiamos con una Honor Ball de regalo!", strong: true }
      );
    }

    msgSegments.push(
      `\n\nTu saldo restante es de `,
      { text: `¥${remainingMoney.toLocaleString()}`, strong: true },
      ".\n¿Deseas seguir comprando?"
    );

    dialogManager.showChoice(
      "¡Compra realizada con éxito!",
      msgSegments,
      [
        {
          label: "🛒 Seguir comprando",
          primary: true,
          action: () => showCategories(),
        },
        {
          label: "👋 Terminar compra",
          action: () => {
            dialogManager.show("Dependiente", ["¡Gracias por tu visita! ¡Vuelve cuando necesites más suministros!"]);
          },
        },
      ]
    );
  };

  showMainMenu();
}
