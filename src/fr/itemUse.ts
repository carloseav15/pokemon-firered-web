// item_use.c shared helpers.

import * as C from "./generated/constants";
import { SetQuestLogEvent } from "./questLogEvents";
import { GetMonData, type Mon } from "./pokemon/mon";

/** ItemUse_SetQuestLogEvent (item_use.c): record the item's 16-bit payload and optional species. */
export function ItemUse_SetQuestLogEvent(eventId: number, pokemon: Mon | null, itemId: number, param: number): void {
  const species = pokemon === null ? 0xffff : GetMonData(pokemon, C.MON_DATA_SPECIES_OR_EGG) & 0xffff;
  SetQuestLogEvent(eventId & 0xff, {
    itemId: itemId & 0xffff,
    species,
    itemParam: param & 0xffff,
  });
}
