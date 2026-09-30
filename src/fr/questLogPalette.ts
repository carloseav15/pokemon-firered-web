// quest_log.c palette backup used while returning from Quest Log playback.

import { OBJ_PLTT_ID, PLTT_BUFFER_SIZE, gPlttBufferUnfaded } from "./hw/palette";
import { SlightlyDarkenPalsInWeather } from "./field/weather";

let sPalettesBackup: Uint16Array | undefined;

/** QuestLog_InitPalettesBackup: the source allocates storage only for PLAYBACK_LAST. */
export function QuestLog_InitPalettesBackup(playbackLast: boolean): void {
  sPalettesBackup = playbackLast ? new Uint16Array(PLTT_BUFFER_SIZE) : undefined;
}

/** QuestLog_BackUpPalette: offset and size are counts of u16 colors. */
export function QuestLog_BackUpPalette(offset: number, size: number): void {
  if (!sPalettesBackup) throw new Error("Quest Log palette backup is not initialized");
  sPalettesBackup.set(gPlttBufferUnfaded.subarray(offset, offset + size), offset);
}

/** QL_SlightlyDarkenSomePals (quest_log.c): darken the saved-game scene's backed-up palette ranges. */
export function QL_SlightlyDarkenSomePals(): void {
  if (!sPalettesBackup) return;
  const saved = sPalettesBackup.slice();
  SlightlyDarkenPalsInWeather(sPalettesBackup, sPalettesBackup, 13 * 16);
  for (const [slot, count] of [[1, 1], [6, 4], [11, 5]] as const) {
    const offset = OBJ_PLTT_ID(slot);
    SlightlyDarkenPalsInWeather(sPalettesBackup.subarray(offset), sPalettesBackup.subarray(offset), count * 16);
  }
  gPlttBufferUnfaded.set(sPalettesBackup);
  sPalettesBackup.set(saved);
}

/** Restore the unmodified save palette after the final Quest Log scene. */
export function RestoreQuestLogPalettes(): void {
  if (!sPalettesBackup) return;
  gPlttBufferUnfaded.set(sPalettesBackup);
  sPalettesBackup = undefined;
}
