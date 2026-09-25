// menu2.c (partial): the per-species position table used by the item-use
// scene (pokemon_special_anim_scene.c). The rest of menu2.c is still pending.
// Needs loadCData("menu2") first.

import * as C from "./generated/constants";
import { cdata } from "./hw/assets";

const SPECIES_OLD_UNOWN_EMARK = C.NUM_SPECIES + 0;
const SPECIES_OLD_UNOWN_QMARK = C.NUM_SPECIES + 1;

const sMonPosAttributes = () => cdata<number[][]>("menu2", "sMonPosAttributes");

/** wild_encounter.c GetUnownLetterByPersonalityLoByte (GET_UNOWN_LETTER). */
function GetUnownLetterByPersonalityLoByte(personality: number): number {
  return ((((personality & 0x03000000) >>> 18) | ((personality & 0x00030000) >>> 12) | ((personality & 0x00000300) >>> 6) | (personality & 0x00000003)) >>> 0) % C.NUM_UNOWN_FORMS;
}

/** Menu2_GetMonPosAttribute */
export function Menu2_GetMonPosAttribute(species: number, personality: number, attributeId: number): number {
  if (species === C.SPECIES_UNOWN) {
    const unownLetter = GetUnownLetterByPersonalityLoByte(personality);
    switch (unownLetter) {
      case 0:
        break;
      case 26:
        species = SPECIES_OLD_UNOWN_EMARK;
        break;
      case 27:
        species = SPECIES_OLD_UNOWN_QMARK;
        break;
      default:
        species = C.SPECIES_OLD_UNOWN_B + unownLetter - 1;
        break;
    }
  }
  if (species !== C.SPECIES_NONE && attributeId < C.PSA_MON_ATTR_COUNT) {
    species--;
    const value = sMonPosAttributes()[species]?.[attributeId];
    if (value !== undefined && value !== 0xff) return value;
  }
  return 32;
}

/** Menu2_GetStarSpritePosAttribute (s8 result). */
export function Menu2_GetStarSpritePosAttribute(species: number, personality: number, attributeId: number): number {
  return ((Menu2_GetMonPosAttribute(species, personality, attributeId) - 32) << 24) >> 24;
}
