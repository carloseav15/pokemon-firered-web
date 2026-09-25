// pokemon.c SendMonToPC and field_specials.c destination-box bookkeeping.
import { concat, intToDecimal, STR_CONV_MODE_LEFT_ALIGN } from "../gba/charmap";
import { rom } from "../rom";
import { flagClear, flagGet, flagSet, save, SV, varGet, varSet } from "../save";
import { calculatePPWithBonus, type Pokemon } from "./pokemon";
import * as C from "../generated/constants";
let previousDestinationBox = 0;
export function getPCBoxToSendMon(): number { return previousDestinationBox; }
export function getBoxName(box: number): Uint8Array {
  const boxId = box & 0xff;
  if (boxId >= save.boxes.length) return Uint8Array.of(0xff);
  const name = save.boxNames?.[boxId];
  return name ? Uint8Array.from(name) : concat(rom.text("gText_Box"), intToDecimal(boxId + 1, STR_CONV_MODE_LEFT_ALIGN, 2));
}

/** ResetPokemonStorageSystem (pokemon_storage_system_menu.c). */
export function resetPokemonStorageSystem(): void {
  save.currentBox = 0;
  save.boxes = Array.from({ length: C.TOTAL_BOXES_COUNT }, () => new Array(C.IN_BOX_COUNT).fill(null));
  save.boxNames = Array.from({ length: C.TOTAL_BOXES_COUNT }, (_, box) => Array.from(concat(rom.text("gText_Box"), intToDecimal(box + 1, STR_CONV_MODE_LEFT_ALIGN, 2))));
  save.boxWallpapers = Array.from({ length: C.TOTAL_BOXES_COUNT }, (_, box) => box % (C.MAX_DEFAULT_WALLPAPER + 1));
}
export function shouldShowBoxWasFullMessage(): boolean {
  if (flagGet(rom.c("FLAG_SHOWN_BOX_WAS_FULL_MESSAGE")) || save.currentBox === varGet(rom.c("VAR_PC_BOX_TO_SEND_MON"))) return false;
  flagSet(rom.c("FLAG_SHOWN_BOX_WAS_FULL_MESSAGE"));
  return true;
}
export function findStorageDestination(): {box: number; slot: number} | null {
  for (let i = 0; i < save.boxes.length; i++) {
    const box = (save.currentBox + i) % save.boxes.length;
    const slot = save.boxes[box].findIndex(mon => !mon?.species);
    if (slot >= 0) return {box, slot};
  }
  return null;
}
/** IsDestinationBoxFull also updates the script's chosen box, like the C function. */
export function isDestinationBoxFull(): boolean {
  previousDestinationBox = varGet(rom.c("VAR_PC_BOX_TO_SEND_MON"));
  const destination = findStorageDestination();
  if (!destination) return false;
  if (previousDestinationBox !== destination.box) flagClear(rom.c("FLAG_SHOWN_BOX_WAS_FULL_MESSAGE"));
  varSet(rom.c("VAR_PC_BOX_TO_SEND_MON"), destination.box);
  return shouldShowBoxWasFullMessage();
}
export function sendMonToPC(mon: Pokemon): boolean {
  previousDestinationBox = varGet(rom.c("VAR_PC_BOX_TO_SEND_MON"));
  const destination = findStorageDestination();
  if (!destination) return false;
  for (let i = 0; i < 4; i++) mon.pp[i] = mon.moves[i] ? calculatePPWithBonus(mon.moves[i], mon.ppBonuses, i) : 0;
  save.boxes[destination.box][destination.slot] = structuredClone(mon);
  varSet(SV.MON_BOX_ID, destination.box); varSet(SV.MON_BOX_POS, destination.slot);
  if (previousDestinationBox !== destination.box) flagClear(rom.c("FLAG_SHOWN_BOX_WAS_FULL_MESSAGE"));
  varSet(rom.c("VAR_PC_BOX_TO_SEND_MON"), destination.box);
  // The source does not change StorageGetCurrentBox when a capture overflows.
  return true;
}

export type StorageResult = "ok" | "invalid" | "partyFull" | "boxFull" | "lastUsable" | "mail" | "egg" | "neededMove" | "bagFull";
export type StorageLocation = {box: number; slot: number}; // box=-1 is party
const isMail = (item: number): boolean => item >= rom.c("ITEM_ORANGE_MAIL") && item <= rom.c("ITEM_RETRO_MAIL");
export function storedMon(location: StorageLocation): Pokemon | null {
  return location.box === -1 ? save.party[location.slot] ?? null : save.boxes[location.box]?.[location.slot] ?? null;
}
function mayRemovePartyMon(slot: number): boolean {
  return save.party.some((mon, i) => i !== slot && mon.species && !mon.isEgg && mon.hp > 0);
}
export function depositMon(partySlot: number, box: number): StorageResult {
  const mon = save.party[partySlot];
  if (!mon || !save.boxes[box]) return "invalid";
  if (!mayRemovePartyMon(partySlot)) return "lastUsable";
  if (isMail(mon.heldItem)) return "mail";
  const slot = save.boxes[box].findIndex(entry => !entry?.species);
  if (slot < 0) return "boxFull";
  const copy = structuredClone(mon);
  // A BoxPokemon stores no battle HP/status fields. Restore PP on deposit.
  copy.status = 0; copy.hp = copy.stats[0]; copy.mail = C.MAIL_NONE;
  for (let i = 0; i < 4; i++) copy.pp[i] = copy.moves[i] ? calculatePPWithBonus(copy.moves[i], copy.ppBonuses, i) : 0;
  save.boxes[box][slot] = copy;
  save.party.splice(partySlot, 1);
  return "ok";
}
export function withdrawMon(box: number, slot: number): StorageResult {
  const mon = save.boxes[box]?.[slot];
  if (!mon?.species) return "invalid";
  if (save.party.length >= 6) return "partyFull";
  const copy = structuredClone(mon);
  copy.status = 0; copy.hp = copy.stats[0]; copy.mail = C.MAIL_NONE;
  save.party.push(copy); save.boxes[box][slot] = null;
  return "ok";
}
export function releaseMon(location: StorageLocation): StorageResult {
  const mon = storedMon(location);
  if (!mon?.species) return "invalid";
  if (location.box === -1 && !mayRemovePartyMon(location.slot)) return "lastUsable";
  if (mon.isEgg) return "egg";
  if (isMail(mon.heldItem)) return "mail";
  // pokemon_storage_system_data.c RunCanReleaseMon: preserve the last Surf
  // and Dive user anywhere in the party/boxes, not every HM move.
  const others = [...save.party.filter((_, slot) => location.box !== -1 || slot !== location.slot),
    ...save.boxes.flatMap((box, index) => box.filter((_, slot) => index !== location.box || slot !== location.slot))];
  for (const move of [rom.c("MOVE_SURF"), rom.c("MOVE_DIVE")]) {
    if (mon.moves.includes(move) && !others.some(other => other?.species && !other.isEgg && other.moves.includes(move))) return "neededMove";
  }
  if (location.box === -1) save.party.splice(location.slot, 1);
  else save.boxes[location.box][location.slot] = null;
  return "ok";
}

/**
 * MOVE MON grab/place/shift (DoMonPlaceChange) across party slots and box
 * slots. PLACE targets an empty slot, SHIFT swaps with an occupant;
 * party-to-party is always a swap. Party-to-box keeps deposit rules (one
 * usable mon must stay, mail never leaves the party this way).
 */
export function moveMon(from: StorageLocation, to: StorageLocation): StorageResult {
  if (from.box === to.box && from.slot === to.slot) return "ok";
  const src = storedMon(from);
  if (!src?.species) return "invalid";
  const dst = storedMon(to);
  if (from.box === -1 && to.box === -1 && dst) {
    save.party[from.slot] = dst;
    save.party[to.slot] = src;
    return "ok";
  }
  if (from.box === -1 && to.box !== -1) {
    if (!mayRemovePartyMon(from.slot)) return "lastUsable";
    if (isMail(src.heldItem)) return "mail";
  }
  if (from.box !== -1 && to.box === -1 && !dst && save.party.length >= 6) return "partyFull";
  // Detach the moving mon.
  if (from.box === -1) save.party.splice(from.slot, 1);
  else save.boxes[from.box][from.slot] = null;
  // A displaced mon returns to the source slot.
  if (dst) {
    if (from.box === -1) save.party.splice(Math.min(from.slot, save.party.length), 0, dst);
    else save.boxes[from.box][from.slot] = dst;
  }
  // Place the moving mon.
  if (to.box === -1) {
    if (dst) save.party[to.slot] = src;
    else save.party.push(src);
  } else save.boxes[to.box][to.slot] = src;
  return "ok";
}

/**
 * MOVE ITEMS between mons (Item_GiveMovingToMon / Item_SwitchMonsWithMoving).
 * Mail can never be picked up or displaced (Task_PrintCantStoreMail).
 */
export function giveHeldItem(from: StorageLocation, to: StorageLocation): StorageResult {
  const src = storedMon(from);
  const dst = storedMon(to);
  if (!src?.species || !dst?.species || !src.heldItem) return "invalid";
  if (isMail(src.heldItem) || isMail(dst.heldItem)) return "mail";
  if (!dst.heldItem) {
    dst.heldItem = src.heldItem;
    src.heldItem = 0;
    return "ok";
  }
  [src.heldItem, dst.heldItem] = [dst.heldItem, src.heldItem];
  return "ok";
}

// ---------------------------------------------------------------- wallpapers

/** Box wallpaper ids in pokemon_storage_system.h order. */
export const WALLPAPER_NAMES = [
  "FOREST", "CITY", "DESERT", "SAVANNA", "CRAG", "VOLCANO", "SNOW", "CAVE",
  "BEACH", "SEAFLOOR", "RIVER", "SKY", "STARS", "POKECENTER", "TILES", "SIMPLE",
];

/** GetBoxWallpaper; new boxes default like the source (boxId % (SAVANNA + 1)). */
export function getBoxWallpaper(box: number): number {
  return save.boxWallpapers?.[box] ?? box % 4;
}

export function setBoxWallpaper(box: number, wallpaper: number): void {
  if (wallpaper < 0 || wallpaper >= WALLPAPER_NAMES.length) return;
  save.boxWallpapers ??= save.boxes.map((_, i) => i % 4);
  save.boxWallpapers[box] = wallpaper;
}
