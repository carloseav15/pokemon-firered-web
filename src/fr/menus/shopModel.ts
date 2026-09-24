// shop.c / item_menu.c: stock, quantity limits and purchase/sale mutations.
import { rom } from "../rom";
import { save, incrementGameStat } from "../save";
import { addBagItem, addMoney, bagItemQuantity, itemInfo, removeBagItem, removeMoney } from "../pokemon/items";
export type TransactionResult = "ok" | "invalid" | "noMoney" | "noRoom" | "notSellable" | "notEnough";
export class ShopModel {
  readonly stock: number[] = [];
  constructor(pointer: number) {
    // CreateShopMenu: source inventory is a u16 list terminated by ITEM_NONE.
    for (let i = 0; i < rom.items.length; i++) {
      const item = rom.u16(pointer + i * 2);
      if (!item) return;
      if (!itemInfo(item)) throw new Error(`Invalid shop stock item ${item}`);
      this.stock.push(item);
    }
    throw new Error("Unterminated shop inventory");
  }
  price(item: number, selling = false): number {
    const price = itemInfo(item)?.price ?? 0;
    return selling ? Math.floor(price / 2) : price;
  }
  maxQuantity(item: number, selling = false): number {
    if (selling) return this.price(item, true) > 0 ? Math.min(99, bagItemQuantity(item)) : 0;
    const price = this.price(item);
    return this.stock.includes(item) && price > 0 ? Math.min(99, Math.floor(save.money / price)) : 0;
  }
  buy(item: number, quantity: number): TransactionResult {
    if (!this.stock.includes(item) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return "invalid";
    const total = this.price(item) * quantity;
    if (save.money < total) return "noMoney";
    // AddBagItem is authoritative, including TM Case/Berry Pouch acquisition.
    // Money is only removed after the inventory accepts the item.
    if (!addBagItem(item, quantity)) return "noRoom";
    removeMoney(total);
    incrementGameStat(rom.c("GAME_STAT_SHOPPED"));
    return "ok";
  }
  sell(item: number, quantity: number): TransactionResult {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return "invalid";
    if ((itemInfo(item)?.price ?? 0) === 0) return "notSellable";
    if (!removeBagItem(item, quantity)) return "notEnough";
    addMoney(this.price(item, true) * quantity);
    return "ok";
  }
}
