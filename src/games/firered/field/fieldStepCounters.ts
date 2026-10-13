// Per-step counters called by ProcessPlayerFieldInput (field_control_avatar.c).
import * as C from "../generated/constants";
import { rom } from "../rom";
import { save, varGet, varSet } from "../save";

export function RunMassageCooldownStepCounter(): void {
  const count = varGet(C.VAR_MASSAGE_COOLDOWN_STEP_COUNTER);
  if (count < 500) varSet(C.VAR_MASSAGE_COOLDOWN_STEP_COUNTER, count + 1);
}

export function IncrementResortGorgeousStepCounter(): void {
  if (varGet(C.VAR_RESORT_GORGEOUS_REQUESTED_MON) === C.SPECIES_NONE) return;
  const count = (varGet(C.VAR_RESORT_GOREGEOUS_STEP_COUNTER) + 1) & 0xffff;
  if (count >= 250) {
    varSet(C.VAR_RESORT_GORGEOUS_REQUESTED_MON, 0xffff);
    varSet(C.VAR_RESORT_GOREGEOUS_STEP_COUNTER, 0);
  } else {
    varSet(C.VAR_RESORT_GOREGEOUS_STEP_COUNTER, count);
  }
}

export function IncrementBirthIslandRockStepCount(): void {
  const map = rom.mapNum("MAP_BIRTH_ISLAND_EXTERIOR");
  if (save.location.mapGroup !== (map >>> 8) || save.location.mapNum !== (map & 0xff)) return;
  const count = (varGet(C.VAR_DEOXYS_INTERACTION_STEP_COUNTER) + 1) & 0xffff;
  varSet(C.VAR_DEOXYS_INTERACTION_STEP_COUNTER, count > 99 ? 0 : count);
}
