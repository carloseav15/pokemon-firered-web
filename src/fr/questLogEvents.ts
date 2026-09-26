// Partial state port for quest_log_events.c. Shop-event payloads are persisted
// in the browser save; the scene/action recorder and playback are not yet ported.

import * as C from "./generated/constants";
import { save } from "./save";

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

export type QuestLogStoryItemEvent = { itemId: number; mapSec: number };
export type QuestLogTrainerBattleEvent = {
  trainerId: number; speciesOpponent: number; speciesPlayer: number; mapSec: number; hpFractionId: number;
};
export type QuestLogWildBattleEvent = { defeatedSpecies: number; caughtSpecies: number; mapSec: number };
export type QuestLogEventData = QuestLogShopEvent | QuestLogStoryItemEvent | QuestLogTrainerBattleEvent | QuestLogWildBattleEvent;
export type QuestLogEventRecord = { eventId: number; data: QuestLogEventData };
export function getQuestLogEvents(): QuestLogEventRecord[] {
  return save.questLogEvents ??= [];
}

/** SetQuestLogEvent (quest_log_events.c), currently supporting shop and story-item payloads. */
export function SetQuestLogEvent(eventId: number, data: QuestLogEventData): void {
  const isShopEvent = eventId === C.QL_EVENT_BOUGHT_ITEM || eventId === C.QL_EVENT_SOLD_ITEM;
  const isStoryItemEvent = eventId === C.QL_EVENT_OBTAINED_STORY_ITEM;
  const isBattleEvent = eventId === C.QL_EVENT_DEFEATED_GYM_LEADER || eventId === C.QL_EVENT_DEFEATED_WILD_MON
    || eventId === C.QL_EVENT_DEFEATED_E4_MEMBER || eventId === C.QL_EVENT_DEFEATED_CHAMPION
    || eventId === C.QL_EVENT_DEFEATED_TRAINER;
  if (!isShopEvent && !isStoryItemEvent && !isBattleEvent) return;
  QL_EnableRecordingSteps();
  if (gQuestLogState === C.QL_STATE_PLAYBACK) return;
  if (InQuestLogDisabledLocation()) return;
  getQuestLogEvents().push({ eventId, data: { ...data } });
}

/** InQuestLogDisabledLocation (quest_log_events.c). */
export function InQuestLogDisabledLocation(mapGroup = save.location.mapGroup, mapNum = save.location.mapNum): boolean {
  const map = (mapGroup << 8) | mapNum;
  const disabledMaps = [
    C.MAP_TRAINER_TOWER_1F, C.MAP_TRAINER_TOWER_2F, C.MAP_TRAINER_TOWER_3F,
    C.MAP_TRAINER_TOWER_4F, C.MAP_TRAINER_TOWER_5F, C.MAP_TRAINER_TOWER_6F,
    C.MAP_TRAINER_TOWER_7F, C.MAP_TRAINER_TOWER_8F, C.MAP_TRAINER_TOWER_ROOF,
    C.MAP_TRAINER_TOWER_LOBBY, C.MAP_TRAINER_TOWER_ELEVATOR,
    C.MAP_SAFFRON_CITY_POKEMON_TRAINER_FAN_CLUB,
    C.MAP_SEVEN_ISLAND_HOUSE_ROOM1, C.MAP_SEVEN_ISLAND_HOUSE_ROOM2,
    C.MAP_ROCKET_HIDEOUT_ELEVATOR, C.MAP_SILPH_CO_ELEVATOR,
    C.MAP_CELADON_CITY_DEPARTMENT_STORE_ELEVATOR,
  ];
  return disabledMaps.includes(map);
}

/** QuestLog_ShouldEndSceneOnMapChange (quest_log_events.c). */
export function QuestLog_ShouldEndSceneOnMapChange(): boolean {
  if (!InQuestLogDisabledLocation()) return false;
  if (gQuestLogState === C.QL_STATE_PLAYBACK) return true;
  if (gQuestLogState === C.QL_STATE_RECORDING) QuestLog_CutRecording();
  return false;
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
  getQuestLogEvents().length = 0;
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
