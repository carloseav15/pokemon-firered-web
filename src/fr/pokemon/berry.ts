// berry.c: berry table lookup, name copy, and item ID/type conversion helpers.

import * as C from "../generated/constants";
import { cdata, isSym } from "../hw/assets";
import { rom, ROM_BASE } from "../rom";
import { save } from "../save";

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

const ENIGMA_RECEIVED_ITEM_EFFECT_OFFSET = 0x516; // sizeof(Berry2) + ReceivedEnigmaBerry.unk_001C
const ENIGMA_HOLD_EFFECT_OFFSET = ENIGMA_RECEIVED_ITEM_EFFECT_OFFSET + 18;
const ENIGMA_CHECKSUM_OFFSET = 48;

function enigmaBytes(): Uint8Array {
  const bytes = new Uint8Array(0x34);
  for (let i = 0; i < bytes.length; i++) bytes[i] = save.enigmaBerry[i] ?? 0;
  return bytes;
}

function writeBerry2(bytes: Uint8Array, berry: BerryData): void {
  for (let i = 0; i < 7; i++) bytes[i] = berry.name[i] ?? 0;
  bytes[7] = berry.firmness & 0xff;
  bytes[8] = berry.size & 0xff;
  bytes[9] = (berry.size >>> 8) & 0xff;
  bytes[10] = berry.maxYield & 0xff;
  bytes[11] = berry.minYield & 0xff;
  // The decomp exports these Berry2 pointer fields as symbols. The browser save
  // keeps zero in the opaque pointer slots; descriptions resolve from ROM data.
  for (let i = 12; i < 20; i++) bytes[i] = 0;
  bytes[20] = berry.stageDuration & 0xff;
  bytes[21] = berry.spicy & 0xff;
  bytes[22] = berry.dry & 0xff;
  bytes[23] = berry.sweet & 0xff;
  bytes[24] = berry.bitter & 0xff;
  bytes[25] = berry.sour & 0xff;
  bytes[26] = berry.smoothness & 0xff;
  bytes[27] = 0;
}

function GetEnigmaBerryChecksum(bytes = enigmaBytes()): number {
  let result = 0;
  for (let i = 0; i < ENIGMA_CHECKSUM_OFFSET; i++) result = (result + bytes[i]!) >>> 0;
  return result;
}

/** InitEnigmaBerry (berry.c): copy the ROM Enigma Berry defaults and checksum its 0x30-byte prefix. */
export function InitEnigmaBerry(): void {
  const bytes = new Uint8Array(0x34);
  const berryType = C.ITEM_ENIGMA_BERRY - C.FIRST_BERRY_INDEX + 1;
  const berry = cdata<BerryData[]>("berry", "gBerries")[berryType - 1]!;
  writeBerry2(bytes, berry);
  const checksum = GetEnigmaBerryChecksum(bytes);
  bytes[ENIGMA_CHECKSUM_OFFSET] = checksum & 0xff;
  bytes[ENIGMA_CHECKSUM_OFFSET + 1] = (checksum >>> 8) & 0xff;
  bytes[ENIGMA_CHECKSUM_OFFSET + 2] = (checksum >>> 16) & 0xff;
  bytes[ENIGMA_CHECKSUM_OFFSET + 3] = (checksum >>> 24) & 0xff;
  save.enigmaBerry = Array.from(bytes);
}

/** ClearEnigmaBerries (berry.c): zero the saved block and rebuild the ROM default berry. */
export function ClearEnigmaBerries(): void {
  save.enigmaBerry = new Array(0x34).fill(0);
  InitEnigmaBerry();
}

/** SetEnigmaBerry (berry.c): copy Berry2 and the item-effect payload from ReceivedEnigmaBerry. */
export function SetEnigmaBerry(received: ArrayLike<number>): void {
  ClearEnigmaBerries();
  const bytes = enigmaBytes();
  for (let i = 0; i < 28; i++) bytes[i] = (received[i] ?? 0) & 0xff;
  for (let i = 0; i < 18; i++) bytes[28 + i] = (received[ENIGMA_RECEIVED_ITEM_EFFECT_OFFSET + i] ?? 0) & 0xff;
  bytes[46] = (received[ENIGMA_HOLD_EFFECT_OFFSET] ?? 0) & 0xff;
  bytes[47] = (received[ENIGMA_HOLD_EFFECT_OFFSET + 1] ?? 0) & 0xff;
  const checksum = GetEnigmaBerryChecksum(bytes);
  bytes[48] = checksum & 0xff;
  bytes[49] = (checksum >>> 8) & 0xff;
  bytes[50] = (checksum >>> 16) & 0xff;
  bytes[51] = (checksum >>> 24) & 0xff;
  save.enigmaBerry = Array.from(bytes);
}

/** IsEnigmaBerryValid (berry.c): verify the source's nonzero fields and 32-bit byte-sum checksum. */
export function IsEnigmaBerryValid(): boolean {
  const bytes = enigmaBytes();
  const checksum = (bytes[48]! | (bytes[49]! << 8) | (bytes[50]! << 16) | (bytes[51]! << 24)) >>> 0;
  return bytes[20] !== 0 && bytes[10] !== 0 && GetEnigmaBerryChecksum(bytes) === checksum;
}

function enigmaDescription(bytes: Uint8Array, offset: number, fallback: number[]): number[] {
  const address = (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
  if (address < ROM_BASE || address - ROM_BASE >= rom.scripts.length) return [...fallback];
  return Array.from(rom.stringAt(address));
}

function enigmaBerryInfo(fallback: BerryData): BerryInfo {
  const bytes = enigmaBytes();
  return {
    name: Array.from(bytes.subarray(0, 7)),
    firmness: bytes[7]!,
    size: bytes[8]! | (bytes[9]! << 8),
    maxYield: bytes[10]!,
    minYield: bytes[11]!,
    description1: enigmaDescription(bytes, 12, berryText(fallback.description1)),
    description2: enigmaDescription(bytes, 16, berryText(fallback.description2)),
    stageDuration: bytes[20]!,
    spicy: bytes[21]!,
    dry: bytes[22]!,
    sweet: bytes[23]!,
    bitter: bytes[24]!,
    sour: bytes[25]!,
    smoothness: bytes[26]!,
  };
}

function berryText(value: BerryData["description1"]): number[] {
  return isSym(value) ? cdata<number[]>("berry", value.$sym) : value as number[];
}

/** GetBerryInfo from berry.c. */
export function GetBerryInfo(berryIdx: number): BerryInfo {
  berryIdx &= 0xff;
  if (berryIdx === 0 || berryIdx > C.ITEM_ENIGMA_BERRY - C.FIRST_BERRY_INDEX + 1)
    berryIdx = 1;

  const data = cdata<BerryData[]>("berry", "gBerries")[berryIdx - 1];
  if (berryIdx === C.ITEM_ENIGMA_BERRY - C.FIRST_BERRY_INDEX + 1 && IsEnigmaBerryValid())
    return enigmaBerryInfo(data!);
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
