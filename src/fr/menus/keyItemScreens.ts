// Key item screens reached from the bag or scripts: fame_checker.c (people,
// unlocked flavor texts and their sources) and teachy_tv.c (the program
// list and its narration). Both keep the save state and text of the source
// while the dedicated graphics are ported.

import { rom } from "../rom";
import { decode } from "../gba/charmap";
import { InitPokedudeBagRegister, InitPokedudeBagTMs } from "../bagMenu";
import { openHardwareChoice, openHardwareMessage } from "./hardwareChoice";
import { preloadFameCheckerAssets, UseFameChecker, resetFameChecker, fullyUnlockFameChecker, setFlavorTextFlagFromSpecialVars, updatePickStateFromSpecialVar8005, NUM_FAMECHECKER_PERSONS } from "../fameChecker";
export { resetFameChecker, fullyUnlockFameChecker, setFlavorTextFlagFromSpecialVars, updatePickStateFromSpecialVar8005, NUM_FAMECHECKER_PERSONS };

/** Task_FameCheckerMain: use full faithful fame checker screen */
export async function openFameChecker(done: () => void): Promise<void> {
  await preloadFameCheckerAssets();
  UseFameChecker(done);
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
