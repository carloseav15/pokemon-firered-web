// Key item screen reached from the bag or scripts: fame_checker.c (people,
// unlocked flavor texts and their sources). It keeps the save state and text
// of the source while the dedicated graphics are ported.

import { preloadFameCheckerAssets, UseFameChecker, resetFameChecker, fullyUnlockFameChecker, setFlavorTextFlagFromSpecialVars, updatePickStateFromSpecialVar8005, NUM_FAMECHECKER_PERSONS } from "../fameChecker";
export { resetFameChecker, fullyUnlockFameChecker, setFlavorTextFlagFromSpecialVars, updatePickStateFromSpecialVar8005, NUM_FAMECHECKER_PERSONS };

/** Task_FameCheckerMain: use full faithful fame checker screen */
export async function openFameChecker(done: () => void, fromStartMenuBag = false): Promise<void> {
  await preloadFameCheckerAssets();
  UseFameChecker(done, fromStartMenuBag);
}
