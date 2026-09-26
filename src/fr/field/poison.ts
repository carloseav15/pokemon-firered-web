// field_poison.c Task_TryFieldPoisonWhiteOut. Poison is cleared only after the
// fainted-mon message is queued, preserving the per-Pokémon task sequence.
import * as C from "../generated/constants";
import type { Game } from "../game";
import { tasks } from "../gba/tasks";
import { stringVars } from "../gba/charmap";
import { rom } from "../rom";
import { save, SV, varSet } from "../save";
import { GetMonData, SetMonData } from "../pokemon/mon";
import { nickname } from "../pokemon/pokemon";
import { AdjustFriendship } from "../pokemon/mon_extra";
import type { Mon } from "../pokemon/mon";

/** IsMonValidSpecies (field_poison.c): empty and egg slots are not party mons. */
function IsMonValidSpecies(pokemon: Mon): boolean {
  const species = GetMonData(pokemon, C.MON_DATA_SPECIES_OR_EGG);
  return species !== C.SPECIES_NONE && species !== C.SPECIES_EGG;
}

/** AllMonsFainted (field_poison.c) scans all PARTY_SIZE slots. */
function AllMonsFainted(): boolean {
  for (let i = 0; i < C.PARTY_SIZE; i++) {
    const pokemon = save.party[i] as Mon;
    if (pokemon && IsMonValidSpecies(pokemon) && GetMonData(pokemon, C.MON_DATA_HP)) return false;
  }
  return true;
}

/** MonFaintedFromPoison (field_poison.c). */
function MonFaintedFromPoison(partyIdx: number): boolean {
  const pokemon = save.party[partyIdx] as Mon;
  return !!pokemon && IsMonValidSpecies(pokemon)
    && GetMonData(pokemon, C.MON_DATA_HP) === 0
    && (GetMonData(pokemon, C.MON_DATA_STATUS) & C.STATUS1_PSN_ANY) !== 0;
}

/** FaintFromFieldPoison (field_poison.c). */
function FaintFromFieldPoison(partyIdx: number): void {
  const pokemon = save.party[partyIdx] as Mon;
  AdjustFriendship(pokemon, C.FRIENDSHIP_EVENT_FAINT_OUTSIDE_BATTLE);
  SetMonData(pokemon, C.MON_DATA_STATUS, 0);
  stringVars.var1 = nickname(pokemon);
}

/** DoPoisonFieldEffect: apply one field-poison HP loss and return FLDPSN_*. */
export function DoPoisonFieldEffect(startEffect: () => void): number {
  let numPoisoned = 0;
  let numFainted = 0;
  for (const mon of save.party as Mon[]) {
    if (!GetMonData(mon, C.MON_DATA_SANITY_HAS_SPECIES)) continue;
    if (!(GetMonData(mon, C.MON_DATA_STATUS) & C.STATUS1_PSN_ANY)) continue;

    let hp = GetMonData(mon, C.MON_DATA_HP);
    if (hp === 0 || --hp === 0) numFainted++;
    SetMonData(mon, C.MON_DATA_HP, hp);
    numPoisoned++;
  }
  if (numFainted || numPoisoned) startEffect();
  if (numFainted) return C.FLDPSN_FNT;
  if (numPoisoned) return C.FLDPSN_PSN;
  return C.FLDPSN_NONE;
}

export function tryFieldPoisonWhiteOut(game: Game): void {
  game.overworld.script.ScriptContext_Stop();
  let slot = 0, waiting = false;
  const task = tasks.create(() => {
    if (waiting) {
      if (!game.overworld.messageBox.isHidden()) return;
      waiting = false;
      return;
    }
    for (; slot < C.PARTY_SIZE; slot++) {
      const mon = save.party[slot];
      if (!MonFaintedFromPoison(slot)) continue;
      FaintFromFieldPoison(slot);
      game.overworld.messageBox.show(rom.text("gText_PkmnFainted3"));
      waiting = true;
      return;
    }
    varSet(SV.RESULT, AllMonsFainted() ? 1 : 0);
    tasks.destroy(task);
    game.overworld.script.ScriptContext_Enable();
  }, 80);
}
