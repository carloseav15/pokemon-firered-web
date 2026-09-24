// pokemon.c SendMonToPC and field_specials.c destination-box bookkeeping.
import { encode } from "../gba/charmap";
import { rom } from "../rom";
import { flagClear, flagGet, flagSet, save, SV, varGet, varSet } from "../save";
import { calculatePPWithBonus, type Pokemon } from "./pokemon";
let previousDestinationBox = 0;
export function getPCBoxToSendMon(): number { return previousDestinationBox; }
export function getBoxName(box: number): Uint8Array {
  const name = save.boxNames?.[box];
  return name ? Uint8Array.from(name) : encode(`BOX${box + 1}`);
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

export type StorageResult = "ok" | "invalid" | "partyFull" | "boxFull" | "lastUsable" | "mail" | "egg" | "neededMove";
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
  copy.status = 0; copy.hp = copy.stats[0]; copy.mail = rom.c("MAIL_NONE");
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
  copy.status = 0; copy.hp = copy.stats[0]; copy.mail = rom.c("MAIL_NONE");
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
