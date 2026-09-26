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

function Task_TryFieldPoisonWhiteOut(taskId: number, game: Game): void {
  // field_poison.c stores tState and tPartyId in task data[0] and [1].
  const data = tasks.data(taskId);
  switch (data[0]) {
    case 0:
      for (; data[1] < C.PARTY_SIZE; data[1]++) {
        if (!MonFaintedFromPoison(data[1])) continue;
        FaintFromFieldPoison(data[1]);
        game.overworld.messageBox.show(rom.text("gText_PkmnFainted3"));
        data[0]++;
        return;
      }
      data[0] = 2;
      break;
    case 1:
      if (game.overworld.messageBox.isHidden()) data[0]--;
      break;
    case 2:
      varSet(SV.RESULT, AllMonsFainted() ? 1 : 0);
      tasks.destroy(taskId);
      game.overworld.script.ScriptContext_Enable();
      break;
  }
}

export function tryFieldPoisonWhiteOut(game: Game): void {
  tasks.create((taskId) => Task_TryFieldPoisonWhiteOut(taskId, game), 80);
  game.overworld.script.ScriptContext_Stop();
}
