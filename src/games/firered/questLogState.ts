// quest_log_events.c gQuestLogState, kept as its own leaf module so that
// gba/textPrinter.ts can read the playback flag (TextPrinterWaitAutoMode)
// without importing the quest event graph: questLogEvents -> save -> ...
// -> gba/textPrinter. questLogEvents.ts re-exports the binding, so its
// consumers keep importing it from there.

export let gQuestLogState = 0;

let commitQuestLogWindow1: (() => void) | null = null;

/** Install the Canvas equivalent of the Quest Log footer tilemap commit. */
export function SetQuestLogWindow1Committer(callback: (() => void) | null): void {
  commitQuestLogWindow1 = callback;
}

/** CommitQuestLogWindow1 (quest_log.c): flush the footer window after dialog cleanup. */
export function CommitQuestLogWindow1(): void {
  commitQuestLogWindow1?.();
}

/** Writes gQuestLogState (the tint side effect lives in questLogEvents.SetQuestLogState). */
export function WriteQuestLogState(state: number): void {
  gQuestLogState = state;
}
