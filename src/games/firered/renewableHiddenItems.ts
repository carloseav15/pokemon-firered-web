// Port of pokefirered src/renewable_hidden_items.c
// Regenerates hidden items in Sevii Islands (and selected Kanto routes)
// after 1500 steps upon re-entering a valid map.

import { cdata } from "./hw/assets";
import * as C from "./generated/constants";
import { random } from "./random";
import { flagClear, flagSet, save, varGet, varSet } from "./save";

export interface RenewableHiddenItemData {
  mapGroup: number;
  mapNum: number;
  rare: number[];     // 10%
  uncommon: number[]; // 30%
  common: number[];   // 60%
}

const MAX_HIDDEN_ITEMS_PER_GROUP = 8;
const NO_ITEM = 0xff;

export function SetAllRenewableItemFlags(): void {
  const items = cdata<RenewableHiddenItemData[]>("renewable_hidden_items", "sRenewableHiddenItems");
  for (let i = 0; i < items.length; i++) {
    const { rare, uncommon, common } = items[i];
    for (let j = 0; j < MAX_HIDDEN_ITEMS_PER_GROUP; j++) {
      if (rare[j] !== NO_ITEM) flagSet(C.FLAG_HIDDEN_ITEMS_START + rare[j]);
      if (uncommon[j] !== NO_ITEM) flagSet(C.FLAG_HIDDEN_ITEMS_START + uncommon[j]);
      if (common[j] !== NO_ITEM) flagSet(C.FLAG_HIDDEN_ITEMS_START + common[j]);
    }
  }
}

export function IncrementRenewableHiddenItemStepCounter(): void {
  const varVal = varGet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER);
  if (varVal < 1500) {
    varSet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER, (varVal + 1) & 0xffff);
  }
}

export function TryRegenerateRenewableHiddenItems(
  mapGroup: number = save.location.mapGroup,
  mapNum: number = save.location.mapNum
): void {
  const items = cdata<RenewableHiddenItemData[]>("renewable_hidden_items", "sRenewableHiddenItems");
  let foundMap = 0xff;
  for (let i = 0; i < items.length; i++) {
    if (items[i].mapGroup === mapGroup && items[i].mapNum === mapNum) {
      foundMap = i;
      break;
    }
  }

  if (foundMap === 0xff) return;

  if (varGet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER) >= 1500) {
    varSet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER, 0);
    SetAllRenewableItemFlags();
    SampleRenewableItemFlags();
  }
}

function SampleRenewableItemFlags(): void {
  const items = cdata<RenewableHiddenItemData[]>("renewable_hidden_items", "sRenewableHiddenItems");
  for (let i = 0; i < items.length; i++) {
    const rval = random() % 100;
    let flags: number[];
    if (rval >= 90) {
      flags = items[i].rare;
    } else if (rval >= 60) {
      flags = items[i].uncommon;
    } else {
      flags = items[i].common;
    }

    for (let j = 0; j < MAX_HIDDEN_ITEMS_PER_GROUP; j++) {
      if (flags[j] !== NO_ITEM) {
        flagClear(C.FLAG_HIDDEN_ITEMS_START + flags[j]);
      }
    }
  }
}
