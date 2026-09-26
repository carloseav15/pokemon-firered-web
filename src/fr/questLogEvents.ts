// State shared with quest_log_events.c. Quest Log recording itself is not yet
// connected, but slot-machine play is remembered for the Game Corner exit rule.

import * as C from "./generated/constants";

let sPlayedTheSlots = false;
export let gQuestLogState = 0;
export let gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
let gQuestLogDefeatedWildMonRecord: unknown | null = null;
let gQuestLogRecordingPointer: unknown | null = null;

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
  gQuestLogEvents.push({ eventId, data: { ...data } });
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
  sPlayedTheSlots = false;
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
