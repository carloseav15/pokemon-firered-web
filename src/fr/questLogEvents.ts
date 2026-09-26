// State shared with quest_log_events.c. Quest Log recording itself is not yet
// connected, but slot-machine play is remembered for the Game Corner exit rule.

import * as C from "./generated/constants";

let sPlayedTheSlots = false;
export let gQuestLogState = 0;
export let gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
let gQuestLogDefeatedWildMonRecord: unknown | null = null;
let gQuestLogRecordingPointer: unknown | null = null;
let sStepRecordingMode = 0;
let sNewlyEnteredMap = false;
let sLastDepartedLocation = 0;
export const gQuestLogRepeatEventTracker = { id: 0, numRepeats: 0, counter: 0 };

export type QuestLogShopEvent = {
  totalMoney: number;
  lastItemId: number;
  itemQuantity: number;
  mapSec: number;
  hasMultipleTransactions: boolean;
  logEventId: number;
};

export type QuestLogEventRecord = { eventId: number; data: QuestLogShopEvent };
export const gQuestLogEvents: QuestLogEventRecord[] = [];

/** SetQuestLogEvent (quest_log_events.c), currently retaining shop payloads in session memory. */
export function SetQuestLogEvent(eventId: number, data: QuestLogShopEvent): void {
  // The current port has typed payload support for only the two shop events.
  if (eventId !== C.QL_EVENT_BOUGHT_ITEM && eventId !== C.QL_EVENT_SOLD_ITEM) return;
  QL_EnableRecordingSteps();
  if (gQuestLogState === C.QL_STATE_PLAYBACK) return;
  gQuestLogEvents.push({ eventId, data: { ...data } });
}

/** QL_EnableRecordingSteps (quest_log_events.c). */
export function QL_EnableRecordingSteps(): void { sStepRecordingMode = 1; }

/** QL_ResetRepeatEventTracker (quest_log_events.c). */
export function QL_ResetRepeatEventTracker(): void {
  gQuestLogRepeatEventTracker.id = 0;
  gQuestLogRepeatEventTracker.numRepeats = 0;
  gQuestLogRepeatEventTracker.counter = 0;
}

/** QL_ResetEventStates (quest_log_events.c). */
export function QL_ResetEventStates(): void {
  sNewlyEnteredMap = false;
  sLastDepartedLocation = 0;
  sPlayedTheSlots = false;
}

/** QuestLog_CutRecording (quest_log.c): close recording state and clear transient pointers. */
export function QuestLog_CutRecording(): void {
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_STOPPED && gQuestLogState === C.QL_STATE_RECORDING) {
    gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
    gQuestLogState = 0;
  }
  gQuestLogDefeatedWildMonRecord = null;
  gQuestLogRecordingPointer = null;
}

/** GetQuestLogState returns the C global consumed by `specialvar`. */
export function GetQuestLogState(): number { return gQuestLogState; }

/** SetQLPlayedTheSlots (quest_log_events.c). */
export function SetQLPlayedTheSlots(): void {
  sPlayedTheSlots = true;
}

/** Reset the modeled slot flag when ResetQuestLog resets event state. */
export function ResetQLPlayedTheSlots(): void {
  QL_ResetEventStates();
  sStepRecordingMode = 0;
  QL_ResetRepeatEventTracker();
  gQuestLogEvents.length = 0;
  gQuestLogState = 0;
  gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
  gQuestLogDefeatedWildMonRecord = null;
  gQuestLogRecordingPointer = null;
}

/** Read the temporary Game Corner flag when the Quest Log departure recorder is connected. */
export function WasQLPlayedTheSlots(): boolean {
  return sPlayedTheSlots;
}

/** Consume the temporary flag when the departure event is recorded. */
export function ConsumeQLPlayedTheSlots(): boolean {
  const played = sPlayedTheSlots;
  sPlayedTheSlots = false;
  return played;
}
