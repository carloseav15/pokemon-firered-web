// Port of item.c (bag pockets, PC items) and money.c.

import * as C from "../generated/constants";
import { b64, rom, type ItemInfo } from "../rom";
import { flagSet, save, type BagPocket } from "../save";

export const POCKET_ITEMS = 1, POCKET_KEY_ITEMS = 2, POCKET_POKE_BALLS = 3, POCKET_TM_CASE = 4, POCKET_BERRY_POUCH = 5;
const CAPACITY: Record<number, number> = { 1: 42, 2: 30, 3: 13, 4: 58, 5: 43 };
export const PC_ITEMS_COUNT = 30;
export const MAX_MONEY = 999999;
export const MAX_COINS = C.MAX_COINS;

let byId: Map<number, ItemInfo> | undefined;

export function itemInfo(itemId: number): ItemInfo | undefined {
  if (!byId) {
    byId = new Map();
    for (const item of rom.items) byId.set(item.id, item);
  }
  return byId.get(SanitizeItemId(itemId));
}

/** SanitizeItemId (item.c): invalid IDs resolve to ITEM_NONE before table lookup. */
export function SanitizeItemId(itemId: number): number {
  return (itemId & 0xffff) >= C.ITEMS_COUNT ? C.ITEM_NONE : itemId & 0xffff;
}

/** ItemId_GetFieldFunc / ItemId_GetBattleFunc (item.c): data symbols stand in for C callback pointers. */
export function ItemId_GetFieldFunc(itemId: number): string {
  return itemInfo(itemId)?.fieldUseFunc ?? "NULL";
}

export function ItemId_GetBattleFunc(itemId: number): string {
  return itemInfo(itemId)?.battleUseFunc ?? "NULL";
}

/** ItemId_Get* (item.c): the ROM data table is already decoded in the browser. */
export const ItemId_GetName = itemName;
export function ItemId_GetId(itemId: number): number { return itemInfo(itemId)?.id ?? C.ITEM_NONE; }
export function ItemId_GetRegistrability(itemId: number): number { return itemInfo(itemId)?.registrability ?? 0; }
export function ItemId_GetPocket(itemId: number): number { return itemInfo(itemId)?.pocket ?? 0; }
export function ItemId_GetSecondaryId(itemId: number): number { return itemInfo(itemId)?.secondaryId ?? 0; }

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

/** SetBagPocketsPointers (item.c): return the five SaveBlock pocket arrays in C order. */
export function SetBagPocketsPointers(): BagPocket[] {
  return [save.bag.items, save.bag.keyItems, save.bag.pokeBalls, save.bag.tmCase, save.bag.berryPouch];
}

/** BagPocketGetFirstEmptySlot: compact browser arrays put the first empty slot at length. */
export function BagPocketGetFirstEmptySlot(pocketId: number): number {
  const list = pocketList((pocketId & 0xff) + 1);
  const capacity = CAPACITY[(pocketId & 0xff) + 1];
  return capacity === undefined || list.length >= capacity ? -1 : list.length;
}

/** IsPocketNotEmpty takes a one-based POCKET_* value in item.c. */
export function IsPocketNotEmpty(pocketId: number): boolean {
  return pocketList(pocketId).length !== 0;
}

export const GetPocketByItemId = ItemId_GetPocket;

/** Slot quantities are plain numbers in SaveData; the GBA XOR encryption is not stored here. */
export function GetBagItemQuantity(slot: { quantity: number }): number { return slot.quantity & 0xffff; }
export function SetBagItemQuantity(slot: { quantity: number }, value: number): void { slot.quantity = value & 0xffff; }
export function GetPcItemQuantity(slot: { quantity: number }): number { return slot.quantity & 0xffff; }
export function SetPcItemQuantity(slot: { quantity: number }, value: number): void { slot.quantity = value & 0xffff; }

/** ClearItemSlots operates on the occupied compact slots represented in the web save. */
export function ClearItemSlots(slots: BagPocket, capacity: number): void { slots.splice(0, Math.max(0, capacity)); }
export function ClearPCItemSlots(): void { save.pcItems.splice(0, save.pcItems.length); }
export function ClearBag(): void { for (const pocket of SetBagPocketsPointers()) pocket.splice(0, pocket.length); }
export function PCItemsGetFirstEmptySlot(): number { return save.pcItems.length < PC_ITEMS_COUNT ? save.pcItems.length : -1; }
export function CountItemsInPC(): number {
  let count = 0;
  for (const slot of save.pcItems) if (slot.item !== C.ITEM_NONE) count++;
  return count;
}

/** SwapItemSlots (item.c), mutating both slot records as the C pointer version does. */
export function SwapItemSlots(a: BagPocket[number], b: BagPocket[number]): void {
  [a.item, b.item] = [b.item, a.item];
  [a.quantity, b.quantity] = [b.quantity, a.quantity];
}

/** SortAndCompactBagPocket: the fixed C table becomes a compact list sorted by item ID. */
export function SortAndCompactBagPocket(pocket: BagPocket): void {
  pocket.sort((a, b) => a.item - b.item);
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

export const BagGetQuantityByItemId = bagItemQuantity;

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
  return GetMoney() >= (amount >>> 0);
}

/** GetMoney (money.c): SaveBlock encryption is resolved by the browser save layer. */
export function GetMoney(): number {
  return save.money >>> 0;
}

/** SetMoney (money.c): store the decrypted u32 value used by the browser save format. */
export function SetMoney(value: number): void {
  save.money = value >>> 0;
}

export function addMoney(amount: number): void {
  const current = GetMoney();
  let next = (current + (amount >>> 0)) >>> 0;
  // AddMoney checks both its cap and whether unsigned addition wrapped.
  if (next > MAX_MONEY || next < current) next = MAX_MONEY;
  SetMoney(next);
}

export function removeMoney(amount: number): void {
  const current = GetMoney();
  const cost = amount >>> 0;
  SetMoney(current < cost ? 0 : current - cost);
}

/** GetCoins (coins.c): the browser save stores the decrypted u16 value. */
export function GetCoins(): number {
  return save.coins & 0xffff;
}

/** SetCoins (coins.c): encryption is handled by the browser save format. */
export function SetCoins(coinAmount: number): void {
  save.coins = coinAmount & 0xffff;
}

export function addCoins(amount: number): boolean {
  const coins = GetCoins();
  const toAdd = amount & 0xffff;
  if (coins >= MAX_COINS) return false;
  SetCoins(Math.min(MAX_COINS, coins + toAdd));
  return true;
}

export function removeCoins(amount: number): boolean {
  const toSub = amount & 0xffff; // coins.c RemoveCoins(u16 toSub)
  const coins = GetCoins();
  if (coins < toSub) return false;
  SetCoins(coins - toSub);
  return true;
}

export function isTMHM(itemId: number): boolean {
  return itemPocket(itemId) === POCKET_TM_CASE;
}

/** TM/HM index (0..57) for the TM case items. */
export function tmhmIndex(itemId: number): number {
  return itemId - (rom.constants.ITEM_TM01 ?? 289);
}

/** item_use.c CheckIfItemIsTMHMOrEvolutionStone: 1 for TM/HM, 2 for an evolution item, 0 otherwise. */
export function CheckIfItemIsTMHMOrEvolutionStone(item: number): number {
  const info = itemInfo(item);
  if (info?.fieldUseFunc === "FieldUseFunc_TmCase" || (info && item >= C.ITEM_TM01 && item <= C.ITEM_HM08)) return 1;
  if (info?.fieldUseFunc === "FieldUseFunc_EvoItem") return 2;
  return 0;
}
