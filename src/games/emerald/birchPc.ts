// pokeemerald birch_pc.c: Professor Birch's Pokédex rating (Hoenn Pokédex).
import { GetNationalPokedexCount } from "@core/pokemon/pokemon";
import { GetSetPokedexFlag } from "@core/pokemon/mon_extra";
import { SpeciesToNationalPokedexNum } from "@core/pokemon/mon";
import { HoennToNationalOrder } from "@core/pokemon/pokemon";
import { rom } from "@core/rom";
import type { ScriptRunner } from "@core/script/context";
import { flagGet, save, SV, varGet, varSet } from "@game/save";
import * as FR from "@game/generated/constants";
import * as EM from "./generated/constants";

/** pokedex.c GetHoennPokedexCount */
export function GetHoennPokedexCount(caseId: number): number {
  let count = 0;
  for (let i = 0; i < EM.HOENN_DEX_COUNT; i++) {
    switch (caseId) {
      case EM.FLAG_GET_SEEN:
        if (GetSetPokedexFlag(HoennToNationalOrder(i + 1), EM.FLAG_GET_SEEN)) count++;
        break;
      case EM.FLAG_GET_CAUGHT:
        if (GetSetPokedexFlag(HoennToNationalOrder(i + 1), EM.FLAG_GET_CAUGHT)) count++;
        break;
    }
  }
  return count;
}

/** event_data.c IsNationalPokedexEnabled */
function IsNationalPokedexEnabled(): boolean {
  return save.nationalDexMagic === 0xda && varGet(EM.VAR_NATIONAL_DEX) === 0x302 && flagGet(EM.FLAG_SYS_NATIONAL_DEX);
}

/** birch_pc.c ScriptGetPokedexInfo */
export function ScriptGetPokedexInfo(): number {
  if (varGet(SV.x8004) === 0) { // is national dex not present?
    varSet(SV.x8005, GetHoennPokedexCount(EM.FLAG_GET_SEEN));
    varSet(SV.x8006, GetHoennPokedexCount(EM.FLAG_GET_CAUGHT));
  } else {
    varSet(SV.x8005, GetNationalPokedexCount(EM.FLAG_GET_SEEN));
    varSet(SV.x8006, GetNationalPokedexCount(EM.FLAG_GET_CAUGHT));
  }
  return IsNationalPokedexEnabled() ? 1 : 0;
}

/** birch_pc.c GetPokedexRatingText (the labels are the gBirchDexRatingText_* strings of data/text/pokedex_rating.inc) */
function GetPokedexRatingText(count: number): Uint8Array {
  for (let limit = 10; limit <= 200; limit += 10)
    if (count < limit) return rom.text(`gBirchDexRatingText_LessThan${limit}`);
  const caught = (species: number) => GetSetPokedexFlag(SpeciesToNationalPokedexNum(species), FR.FLAG_GET_CAUGHT);
  // Jirachi and Deoxys do not count towards the completion: either caught means the actual count is below 200.
  if (count === 200) {
    if (caught(EM.SPECIES_JIRACHI) || caught(EM.SPECIES_DEOXYS)) return rom.text("gBirchDexRatingText_LessThan200");
    return rom.text("gBirchDexRatingText_DexCompleted");
  }
  if (count === EM.HOENN_DEX_COUNT - 1) {
    if (caught(EM.SPECIES_JIRACHI) && caught(EM.SPECIES_DEOXYS)) return rom.text("gBirchDexRatingText_LessThan200");
    return rom.text("gBirchDexRatingText_DexCompleted");
  }
  if (count === EM.HOENN_DEX_COUNT) return rom.text("gBirchDexRatingText_DexCompleted");
  return rom.text("gBirchDexRatingText_LessThan10");
}

/** birch_pc.c ShowPokedexRatingMessage; ShowFieldMessage is the field message box. */
export function ShowPokedexRatingMessage(ctx: ScriptRunner): void {
  ctx.ow.messageBox.show(GetPokedexRatingText(varGet(SV.x8004)));
}
