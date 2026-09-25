// Key item screens reached from the bag or scripts: fame_checker.c (people,
// unlocked flavor texts and their sources) and teachy_tv.c (the program
// list and its narration). Both keep the save state and text of the source
// while the dedicated graphics are ported.

import * as C from "../generated/constants";
import { decode } from "../gba/charmap";
import { cdata, loadCData, symName } from "../hw/assets";
import { rom } from "../rom";
import { save, varGet, varSet, SV } from "../save";
import { InitPokedudeBagRegister, InitPokedudeBagTMs } from "../bagMenu";
import { openHardwareChoice, openHardwareMessage } from "./hardwareChoice";

export const NUM_FAMECHECKER_PERSONS = 16;
const FCPICKSTATE_NO_DRAW = 0, FCPICKSTATE_SILHOUETTE = 1, FCPICKSTATE_COLORED = 2;

type FameEntry = { pickState: number; flavorTextFlags: number };

function fameChecker(): FameEntry[] {
  const s = save as unknown as { fameChecker?: FameEntry[] };
  if (!s.fameChecker) {
    s.fameChecker = Array.from({ length: NUM_FAMECHECKER_PERSONS }, () => ({ pickState: FCPICKSTATE_NO_DRAW, flavorTextFlags: 0 }));
    s.fameChecker[0].pickState = FCPICKSTATE_COLORED; // FAMECHECKER_OAK
  }
  return s.fameChecker;
}

/** ResetFameChecker */
export function resetFameChecker(): void {
  (save as unknown as { fameChecker?: FameEntry[] }).fameChecker = undefined;
  fameChecker();
}

/** FullyUnlockFameChecker */
export function fullyUnlockFameChecker(): void {
  for (const e of fameChecker()) { e.pickState = FCPICKSTATE_COLORED; e.flavorTextFlags |= 0x3f; }
}

/** SetFlavorTextFlagFromSpecialVars */
export function setFlavorTextFlagFromSpecialVars(): void {
  const person = varGet(SV.x8004), flag = varGet(SV.x8005);
  if (person < NUM_FAMECHECKER_PERSONS && flag < 6) {
    fameChecker()[person].flavorTextFlags |= 1 << flag;
    varSet(SV.x8005, FCPICKSTATE_SILHOUETTE);
    updatePickStateFromSpecialVar8005();
  }
}

/** UpdatePickStateFromSpecialVar8005 */
export function updatePickStateFromSpecialVar8005(): void {
  const person = varGet(SV.x8004), state = varGet(SV.x8005);
  if (person >= NUM_FAMECHECKER_PERSONS || state >= 3 || state === FCPICKSTATE_NO_DRAW) return;
  const entry = fameChecker()[person];
  if (state === FCPICKSTATE_SILHOUETTE && entry.pickState === FCPICKSTATE_COLORED) return;
  entry.pickState = state;
}

const syms = (name: string): string[] => cdata<unknown[]>("fame_checker", name).map((v) => symName(v) ?? "");
const NON_TRAINER_NAMES = ["PROF. OAK", "DAISY", "BILL", "MR. FUJI"];

function personName(i: number): string {
  const id = cdata<number[]>("fame_checker", "sTrainerIdxs")[i];
  if (id >= 0xfe00) return NON_TRAINER_NAMES[id - 0xfe00] ?? "";
  const trainer = rom.trainers[id];
  return trainer ? decode(Uint8Array.from(atob(trainer.name), (c) => c.charCodeAt(0))) : "";
}

/** Task_FameCheckerMain: people list → profile → the six flavor texts. */
export async function openFameChecker(done: () => void): Promise<void> {
  await loadCData("fame_checker");
  const profiles = syms("sFameCheckerNameAndQuotesPointers");
  const flavor = syms("sFameCheckerFlavorTextPointers");
  const locations = syms("sFlavorTextOriginLocationTexts");
  const objects = syms("sFlavorTextOriginObjectNameTexts");
  const people = (): void => {
    const entries = fameChecker().map((e, i) => ({ e, i })).filter(({ e }) => e.pickState !== FCPICKSTATE_NO_DRAW);
    openHardwareChoice("FAME CHECKER", entries.map(({ e, i }) => ({ label: e.pickState === FCPICKSTATE_SILHOUETTE ? "?????" : personName(i), value: i })), true, (i) => {
      if (i === null) { done(); return; }
      if (fameChecker()[i].pickState !== FCPICKSTATE_COLORED) { people(); return; }
      openHardwareMessage(rom.text(profiles[i]), () => person(i));
    });
  };
  const person = (i: number): void => {
    const flags = fameChecker()[i].flavorTextFlags;
    openHardwareChoice(personName(i), Array.from({ length: 6 }, (_, j) => ({
      label: flags & (1 << j) ? `${decode(rom.text(objects[i * 6 + j]))}` : "?", value: j, disabled: !(flags & (1 << j)),
    })), true, (j) => {
      if (j === null) { people(); return; }
      const k = i * 6 + j;
      openHardwareMessage(rom.text(locations[k]), () => openHardwareMessage(rom.text(flavor[k]), () => person(i)));
    });
  };
  people();
}

/** teachy_tv.c: the six programs (sTeachyTvOptions) and their narration. */
export function openTeachyTv(done: () => void): void {
  const programs: Array<[string, string, string]> = [
    ["gTeachyTvString_TeachBattle", "gTeachyTvText_BattleScript1", "gTeachyTvText_BattleScript2"],
    ["gTeachyTvString_StatusProblems", "gTeachyTvText_StatusScript1", "gTeachyTvText_StatusScript2"],
    ["gTeachyTvString_TypeMatchups", "gTeachyTvText_MatchupsScript1", "gTeachyTvText_MatchupsScript2"],
    ["gTeachyTvString_CatchPkmn", "gTeachyTvText_CatchingScript1", "gTeachyTvText_CatchingScript2"],
    ["gTeachyTvString_AboutTMs", "gTeachyTvText_TMsScript1", "gTeachyTvText_TMsScript2"],
    ["gTeachyTvString_RegisterItem", "gTeachyTvText_RegisterScript1", "gTeachyTvText_RegisterScript2"],
  ];
  const menu = (): void => {
    openHardwareMessage(rom.text("gTeachyTvText_PokedudeSaysHello"), () => {
      openHardwareChoice("TEACHY TV", programs.map(([title], value) => ({ label: decode(rom.text(title)), value })), true, (i) => {
        if (i === null) { done(); return; }
        const [, a, b] = programs[i];
        const afterProgram = (): void => {
          if (i === 4) InitPokedudeBagTMs(menu);
          else if (i === 5) InitPokedudeBagRegister(menu);
          else menu();
        };
        openHardwareMessage(rom.text(a), () => openHardwareMessage(rom.text(b), afterProgram));
      });
    });
  };
  menu();
}
