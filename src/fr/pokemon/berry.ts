// berry.c: item ID and berry type conversion helpers.

import * as C from "../generated/constants";

/** ItemIdToBerryType from berry.c. */
export function ItemIdToBerryType(itemId: number): number {
  itemId &= 0xffff;
  const offset = itemId - C.FIRST_BERRY_INDEX;
  if (offset < 0 || offset > C.ITEM_ENIGMA_BERRY - C.FIRST_BERRY_INDEX)
    return 1;
  return offset + 1;
}

/** BerryTypeToItemId from berry.c. */
export function BerryTypeToItemId(berryType: number): number {
  berryType &= 0xffff;
  const offset = berryType - 1;
  if (offset < 0 || offset > C.ITEM_ENIGMA_BERRY - C.FIRST_BERRY_INDEX)
    return C.FIRST_BERRY_INDEX;
  return berryType + C.FIRST_BERRY_INDEX - 1;
}
