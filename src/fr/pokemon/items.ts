// Port of item.c (bag pockets, PC items) and money.c.

import { b64, rom, type ItemInfo } from "../rom";
import { flagSet, save, type BagPocket } from "../save";

export const POCKET_ITEMS = 1, POCKET_KEY_ITEMS = 2, POCKET_POKE_BALLS = 3, POCKET_TM_CASE = 4, POCKET_BERRY_POUCH = 5;
const CAPACITY: Record<number, number> = { 1: 42, 2: 30, 3: 13, 4: 58, 5: 43 };
export const PC_ITEMS_COUNT = 30;
export const MAX_MONEY = 999999;
export const MAX_COINS = 9999;

let byId: Map<number, ItemInfo> | undefined;

export function itemInfo(itemId: number): ItemInfo | undefined {
  if (!byId) {
    byId = new Map();
    for (const item of rom.items) byId.set(item.id, item);
  }
  return byId.get(itemId);
}

export function itemName(itemId: number): Uint8Array {
  const info = itemInfo(itemId) ?? itemInfo(0);
  return b64(info!.name);
}

export function itemPocket(itemId: number): number {
  return itemInfo(itemId)?.pocket ?? 0;
}

export function pocketList(pocket: number): BagPocket {
  switch (pocket) {
    case POCKET_ITEMS: return save.bag.items;
    case POCKET_KEY_ITEMS: return save.bag.keyItems;
    case POCKET_POKE_BALLS: return save.bag.pokeBalls;
    case POCKET_TM_CASE: return save.bag.tmCase;
    case POCKET_BERRY_POUCH: return save.bag.berryPouch;
  }
  return [];
}

export function checkBagHasItem(itemId: number, count: number): boolean {
  const pocket = itemPocket(itemId);
  if (!pocket) return false;
  const slot = pocketList(pocket).find((s) => s.item === itemId);
  return !!slot && slot.quantity >= count;
}

export function checkBagHasSpace(itemId: number, count: number): boolean {
  const pocket = itemPocket(itemId);
  if (!pocket) return false;
  const list = pocketList(pocket);
  const slot = list.find((s) => s.item === itemId);
  if (slot) return slot.quantity + count <= 999;
  return list.length < CAPACITY[pocket];
}

export function addBagItem(itemId: number, count: number): boolean {
  const pocket = itemPocket(itemId);
  if (!pocket) return false;
  const list = pocketList(pocket);
  const slot = list.find((s) => s.item === itemId);
  if (slot) {
    if (slot.quantity + count > 999) return false;
    slot.quantity += count;
    return true;
  }
  const c = rom.constants;
  if (pocket === POCKET_TM_CASE && !checkBagHasItem(c.ITEM_TM_CASE, 1)) {
    if (save.bag.keyItems.length >= CAPACITY[POCKET_KEY_ITEMS]) return false;
    save.bag.keyItems.push({ item: c.ITEM_TM_CASE, quantity: 1 });
  }
  if (pocket === POCKET_BERRY_POUCH && !checkBagHasItem(c.ITEM_BERRY_POUCH, 1)) {
    if (save.bag.keyItems.length >= CAPACITY[POCKET_KEY_ITEMS]) return false;
    save.bag.keyItems.push({ item: c.ITEM_BERRY_POUCH, quantity: 1 });
    flagSet(c.FLAG_SYS_GOT_BERRY_POUCH);
  }
  if (itemId === c.ITEM_BERRY_POUCH) flagSet(c.FLAG_SYS_GOT_BERRY_POUCH);
  if (list.length >= CAPACITY[pocket]) return false;
  list.push({ item: itemId, quantity: count });
  if (pocket === POCKET_TM_CASE || pocket === POCKET_BERRY_POUCH) list.sort((a, b) => a.item - b.item);
  return true;
}

export function removeBagItem(itemId: number, count: number): boolean {
  if (!itemId) return false;
  const pocket = itemPocket(itemId);
  if (!pocket) return false;
  const list = pocketList(pocket);
  const index = list.findIndex((s) => s.item === itemId);
  if (index < 0 || list[index].quantity < count) return false;
  list[index].quantity -= count;
  if (list[index].quantity === 0) list.splice(index, 1);
  return true;
}

export function bagItemQuantity(itemId: number): number {
  const pocket = itemPocket(itemId);
  return pocketList(pocket).find((s) => s.item === itemId)?.quantity ?? 0;
}

export function checkPCHasItem(itemId: number, count: number): boolean {
  return save.pcItems.some((s) => s.item === itemId && s.quantity >= count);
}

export function addPCItem(itemId: number, count: number): boolean {
  const slot = save.pcItems.find((s) => s.item === itemId);
  if (slot) {
    if (slot.quantity + count > 999) return false;
    slot.quantity += count;
    return true;
  }
  if (save.pcItems.length >= PC_ITEMS_COUNT) return false;
  save.pcItems.push({ item: itemId, quantity: count });
  return true;
}

export function removePCItem(itemId: number, count: number): void {
  const index = save.pcItems.findIndex((s) => s.item === itemId);
  if (index < 0) return;
  save.pcItems[index].quantity -= count;
  if (save.pcItems[index].quantity <= 0) save.pcItems.splice(index, 1);
}

export function isEnoughMoney(amount: number): boolean {
  return save.money >= amount;
}

export function addMoney(amount: number): void {
  save.money = Math.min(MAX_MONEY, save.money + amount);
}

export function removeMoney(amount: number): void {
  save.money = Math.max(0, save.money - amount);
}

export function addCoins(amount: number): boolean {
  if (save.coins >= MAX_COINS) return false;
  const next = save.coins + (amount & 0xffff);
  save.coins = Math.min(MAX_COINS, next);
  return true;
}

export function removeCoins(amount: number): boolean {
  if (save.coins < amount) return false;
  save.coins -= amount;
  return true;
}

export function isTMHM(itemId: number): boolean {
  return itemPocket(itemId) === POCKET_TM_CASE;
}

/** TM/HM index (0..57) for the TM case items. */
export function tmhmIndex(itemId: number): number {
  return itemId - (rom.constants.ITEM_TM01 ?? 289);
}
