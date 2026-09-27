// berry.c: berry table lookup, name copy, and item ID/type conversion helpers.

import * as C from "../generated/constants";
import { cdata, isSym } from "../hw/assets";

type BerryData = {
  name: number[];
  firmness: number;
  size: number;
  maxYield: number;
  minYield: number;
  description1: number[] | { $sym: string };
  description2: number[] | { $sym: string };
  stageDuration: number;
  spicy: number;
  dry: number;
  sweet: number;
  bitter: number;
  sour: number;
  smoothness: number;
};

export type BerryInfo = Omit<BerryData, "description1" | "description2"> & {
  description1: number[];
  description2: number[];
};

function berryText(value: BerryData["description1"]): number[] {
  return isSym(value) ? cdata<number[]>("berry", value.$sym) : value as number[];
}

/** GetBerryInfo from berry.c. Custom e-Reader Enigma Berry data is not received by the web port. */
export function GetBerryInfo(berryIdx: number): BerryInfo {
  berryIdx &= 0xff;
  if (berryIdx === 0 || berryIdx > C.ITEM_ENIGMA_BERRY - C.FIRST_BERRY_INDEX + 1)
    berryIdx = 1;

  const data = cdata<BerryData[]>("berry", "gBerries")[berryIdx - 1];
  return {
    ...data,
    name: [...data.name],
    description1: berryText(data.description1),
    description2: berryText(data.description2),
  };
}

/** GetBerryNameByBerryType from berry.c; copies the six-byte name and EOS. */
export function GetBerryNameByBerryType(berryType: number, dest: Uint8Array): void {
  const name = GetBerryInfo(berryType).name;
  for (let i = 0; i < 6; i++) dest[i] = name[i] ?? 0;
  dest[6] = 0xff;
}

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
