// quest_log_events.c gQuestLogState, kept as its own leaf module so that
// gba/textPrinter.ts can read the playback flag (TextPrinterWaitAutoMode)
// without importing the quest event graph: questLogEvents -> save -> ...
// -> gba/textPrinter. questLogEvents.ts re-exports the binding, so its
// consumers keep importing it from there.

export let gQuestLogState = 0;

/** Writes gQuestLogState (the tint side effect lives in questLogEvents.SetQuestLogState). */
export function WriteQuestLogState(state: number): void {
  gQuestLogState = state;
}
