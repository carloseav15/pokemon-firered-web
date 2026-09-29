// load_save.c: gPlayerParty <-> gSaveBlock1Ptr->playerParty. The port keeps a single party (save.party, which is
// what &gPlayerParty[i] reads), so the save block's copy is held here while a scene rewrites the working party.
import { save } from "./save";
import type { Pokemon } from "./pokemon/pokemon";

let sSaveBlockParty: Pokemon[] = [];

/** SavePlayerParty */
export function SavePlayerParty(): void {
  sSaveBlockParty = structuredClone(save.party);
}

/** LoadPlayerParty */
export function LoadPlayerParty(): void {
  save.party.length = 0;
  save.party.push(...structuredClone(sSaveBlockParty));
}
