// field_specials.c GetHiddenItemAttr: decode the u32 stored in a BgEvent.

import * as C from "../generated/constants";
import type { MapBgEvent } from "../rom";

type HiddenItemEvent = Extract<MapBgEvent, { type: "hidden_item" }>;

/** Repack the exported field values into the C BgEvent.hiddenItem layout. */
export function EncodeHiddenItemData(event: HiddenItemEvent): number {
  return ((event.item & 0xffff)
    | (((event.flag - C.FLAG_HIDDEN_ITEMS_START) & 0xff) << C.HIDDEN_ITEM_FLAG_SHIFT)
    | ((event.quantity & 0x7f) << C.HIDDEN_ITEM_QUANTITY_SHIFT)
    | ((Number(event.underfoot) & 1) << C.HIDDEN_ITEM_UNDERFOOT_SHIFT)) >>> 0;
}

/** GetHiddenItemAttr from field_specials.c. The result is a u16. */
export function GetHiddenItemAttr(hiddenItem: number, attr: number): number {
  const raw = hiddenItem >>> 0;
  switch (attr & 0xff) {
    case C.HIDDEN_ITEM_ITEM:
      return raw & 0xffff;
    case C.HIDDEN_ITEM_FLAG:
      return ((raw >>> C.HIDDEN_ITEM_FLAG_SHIFT) & 0xff) + C.FLAG_HIDDEN_ITEMS_START;
    case C.HIDDEN_ITEM_QUANTITY:
      return (raw >>> C.HIDDEN_ITEM_QUANTITY_SHIFT) & 0x7f;
    case C.HIDDEN_ITEM_UNDERFOOT:
      return (raw >>> C.HIDDEN_ITEM_UNDERFOOT_SHIFT) & 1;
    default:
      return 1;
  }
}
