// quest_log.c palette backup used while returning from Quest Log playback.

import { PLTT_BUFFER_SIZE, gPlttBufferUnfaded } from "./hw/palette";

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
