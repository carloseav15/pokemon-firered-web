// Partial state port for quest_log_events.c. Shop-event payloads are persisted
// in the browser save; the scene/action recorder and playback are not yet ported.

import * as C from "./generated/constants";
import { cdata } from "./hw/assets";
import { SetGlobalFieldTintMode } from "./field/fieldPalette";
import {
  QL_LoadAction_Input, QL_LoadAction_MovementOrGfxChange, QL_LoadAction_SceneEnd, QL_LoadAction_Wait,
  QL_RecordAction_Input, QL_RecordAction_MovementOrGfxChange, QL_RecordAction_SceneEnd,
  type LoadedQuestLogAction, type QuestLogAction,
} from "./questLogActions";
import { flagClear, flagGet, flagSet, save, varGet, varSet } from "./save";
import { QuestLog_InitPalettesBackup as initQuestLogPalettesBackup } from "./questLogPalette";
import { rom } from "./rom";

let sPlayedTheSlots = false;
export let gQuestLogState = 0;
export function SetQuestLogState(state: number): void {
  gQuestLogState = state;
  SetGlobalFieldTintMode(state === C.QL_STATE_PLAYBACK ? C.QL_TINT_GRAYSCALE
    : state === C.QL_STATE_PLAYBACK_LAST ? C.QL_TINT_BACKUP_GRAYSCALE : C.QL_TINT_NONE);
}
/** QuestLog_InitPalettesBackup (quest_log.c). */
export function QuestLog_InitPalettesBackup(): void {
  initQuestLogPalettesBackup(gQuestLogState === C.QL_STATE_PLAYBACK_LAST);
}
export let gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
/** QL_GetPlaybackState (quest_log.c): hide the two transitional playback states. */
export function QL_GetPlaybackState(): number {
  switch (gQuestLogPlaybackState) {
    case C.QL_PLAYBACK_STATE_RUNNING:
    case C.QL_PLAYBACK_STATE_ACTION_END:
      return C.QL_PLAYBACK_STATE_RUNNING;
    case C.QL_PLAYBACK_STATE_RECORDING:
    case C.QL_PLAYBACK_STATE_RECORDING_NO_DELAY:
      return C.QL_PLAYBACK_STATE_RECORDING;
    default:
      return C.QL_PLAYBACK_STATE_STOPPED;
  }
}
let gQuestLogDefeatedWildMonRecord: unknown | null = null;
let gQuestLogRecordingPointer: unknown | null = null;
const STEP_RECORDING_MODE_ENABLED = 0;
const STEP_RECORDING_MODE_DISABLED = 1;
const STEP_RECORDING_MODE_DISABLED_UNTIL_DEPART = 2;
let sStepRecordingMode = STEP_RECORDING_MODE_ENABLED;
let sNewlyEnteredMap = false;
let sLastDepartedLocation = 0;
export const gQuestLogRepeatEventTracker = { id: 0, numRepeats: 0, counter: 0 };
let sActivePlayerActionScript = -1;
let sNextActionDelay = 0;
let sLastPlayerMovementActionId = -1;

export type QuestLogShopEvent = {
  totalMoney: number;
  lastItemId: number;
  itemQuantity: number;
  mapSec: number;
  hasMultipleTransactions: boolean;
  logEventId: number;
};

export type QuestLogStoryItemEvent = { itemId: number; mapSec: number };
export type QuestLogItemEvent = { itemId: number; species: number; itemParam: number };
export type QuestLogTrainerBattleEvent = {
  trainerId: number; speciesOpponent: number; speciesPlayer: number; mapSec: number; hpFractionId: number;
};
export type QuestLogWildBattleEvent = { defeatedSpecies: number; caughtSpecies: number; mapSec: number };
export type QuestLogLinkBattleEvent = { outcome: number; playerNames: number[][] };
export type QuestLogDepartedEvent = { mapSec: number; locationId: number };
export type QuestLogEventData = QuestLogShopEvent | QuestLogStoryItemEvent | QuestLogItemEvent | QuestLogTrainerBattleEvent | QuestLogWildBattleEvent | QuestLogLinkBattleEvent | QuestLogDepartedEvent;
export type QuestLogEventRecord = { eventId: number; data: QuestLogEventData };
export function getQuestLogEvents(): QuestLogEventRecord[] {
  return save.questLogEvents ??= [];
}

/** QuestLog_CheckDepartingIndoorsMap (field_specials.c), called after InitObjectEventsLocal on map entry. */
export function QuestLog_CheckDepartingIndoorsMap(): void {
  const pairs = cdata<number[][]>("field_specials", "sInsideOutsidePairs");
  for (let i = 0; i < pairs.length; i++) {
    const [insideGroup, insideNum] = pairs[i]!;
    if (save.location.mapGroup !== insideGroup || save.location.mapNum !== insideNum) continue;
    if (varGet(C.VAR_QL_ENTRANCE) !== C.QL_LOCATION_ROCKET_HIDEOUT || i !== C.QL_LOCATION_GAME_CORNER) {
      varSet(C.VAR_QL_ENTRANCE, i);
      flagSet(C.FLAG_SYS_QL_DEPARTED);
    }
    break;
  }
}

function GetMapRegionSection(mapGroup: number, mapNum: number): number {
  const mapId = rom.mapIdByNum((mapGroup << 8) | mapNum);
  const section = mapId ? rom.mapIndex.maps[mapId]?.section : undefined;
  if (!section) throw new Error(`missing region-map section for map ${mapGroup}:${mapNum}`);
  return rom.c(section);
}

/** QuestLog_TryRecordDepartedLocation (field_specials.c), called after the indoor marker on map entry. */
export function QuestLog_TryRecordDepartedLocation(): void {
  let locationId = varGet(C.VAR_QL_ENTRANCE) & 0xffff;
  if (!flagGet(C.FLAG_SYS_QL_DEPARTED)) return;
  let data: QuestLogDepartedEvent = { mapSec: 0, locationId: 0 };
  const mapGroup = save.location.mapGroup, mapNum = save.location.mapNum;

  if (locationId === C.QL_LOCATION_VIRIDIAN_FOREST_1) {
    const south = rom.mapNum("MAP_ROUTE2_VIRIDIAN_FOREST_SOUTH_ENTRANCE");
    const north = rom.mapNum("MAP_ROUTE2_VIRIDIAN_FOREST_NORTH_ENTRANCE");
    if (mapGroup === (south >>> 8) && (mapNum === (south & 0xff) || mapNum === (north & 0xff))) {
      data.mapSec = C.MAPSEC_ROUTE_2;
      data.locationId = mapNum === (south & 0xff) ? locationId : (locationId + 1) & 0xff;
      SetQuestLogEvent(C.QL_EVENT_DEPARTED, data);
      flagClear(C.FLAG_SYS_QL_DEPARTED);
      return;
    }
  } else if (locationId === C.QL_LOCATION_LEAGUE_GATE_1) {
    const route22 = rom.mapNum("MAP_ROUTE22"), route23 = rom.mapNum("MAP_ROUTE23");
    if (mapGroup === (route22 >>> 8) && (mapNum === (route22 & 0xff) || mapNum === (route23 & 0xff))) {
      const pairs = cdata<number[][]>("field_specials", "sInsideOutsidePairs");
      const inside = pairs[locationId]!;
      data.mapSec = GetMapRegionSection(inside[0]!, inside[1]!);
      data.locationId = mapNum === (route22 & 0xff) ? locationId : (locationId + 1) & 0xff;
      SetQuestLogEvent(C.QL_EVENT_DEPARTED, data);
      flagClear(C.FLAG_SYS_QL_DEPARTED);
      return;
    }
  }

  const pairs = cdata<number[][]>("field_specials", "sInsideOutsidePairs");
  const [insideGroup, insideNum, outsideGroup, outsideNum] = pairs[locationId]!;
  if (mapGroup !== outsideGroup || mapNum !== outsideNum) return;
  data.mapSec = GetMapRegionSection(insideGroup!, insideNum!);
  data.locationId = locationId & 0xff;
  if (locationId === C.QL_LOCATION_ROCK_TUNNEL_1) {
    if (save.pos.x !== 15 || save.pos.y !== 26) data.locationId = (data.locationId + 1) & 0xff;
  } else if (locationId === C.QL_LOCATION_SEAFOAM_ISLANDS_1) {
    if (save.pos.x !== 67 || save.pos.y !== 15) data.locationId = (data.locationId + 1) & 0xff;
  }
  SetQuestLogEvent(C.QL_EVENT_DEPARTED, data);
  flagClear(C.FLAG_SYS_QL_DEPARTED);
  if (locationId === C.QL_LOCATION_ROCKET_HIDEOUT) {
    varSet(C.VAR_QL_ENTRANCE, C.QL_LOCATION_GAME_CORNER);
    flagSet(C.FLAG_SYS_QL_DEPARTED);
  }
}

/** QuestLogRecordPlayerAvatarGfxTransition (quest_log.c): record the source gfx state byte. */
export function QuestLogRecordPlayerAvatarGfxTransition(gfxState: number): void {
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_RECORDING) return;
  const script = save.questLogPlayerGfxActions?.[sActivePlayerActionScript]?.script;
  if (!script) return;
  const action: QuestLogAction = { type: C.QL_ACTION_GFX_CHANGE, duration: sNextActionDelay, data: [0, 0, 0, gfxState & 0xff] };
  if (QL_RecordAction_MovementOrGfxChange(script, action) !== null) sNextActionDelay = 0;
}

/** QuestLogRecordPlayerAvatarGfxTransitionWithDuration (quest_log.c). */
export function QuestLogRecordPlayerAvatarGfxTransitionWithDuration(gfxState: number, duration: number): void {
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_RECORDING) return;
  const script = save.questLogPlayerGfxActions?.[sActivePlayerActionScript]?.script;
  if (!script) return;
  const action: QuestLogAction = { type: C.QL_ACTION_GFX_CHANGE, duration: sNextActionDelay, data: [0, 0, 0, gfxState & 0xff] };
  if (QL_RecordAction_MovementOrGfxChange(script, action) !== null) sNextActionDelay = duration & 0xff;
}

/** QL_AfterRecordFishActionSuccessful (quest_log.c). */
export function QL_AfterRecordFishActionSuccessful(): void { sNextActionDelay++; }

/** QuestLogRecordPlayerStep (quest_log.c), called after the avatar accepts a held movement. */
export function QuestLogRecordPlayerStep(movementActionId: number, controlsLocked = false): void {
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_RECORDING || controlsLocked) return;
  const script = save.questLogPlayerGfxActions?.[sActivePlayerActionScript]?.script;
  if (!script) return;
  if (movementActionId <= C.MOVEMENT_ACTION_FACE_RIGHT && sLastPlayerMovementActionId === movementActionId) return;
  if (QL_RecordAction_MovementOrGfxChange(script, { type: C.QL_ACTION_MOVEMENT, duration: sNextActionDelay, data: [0, 0, 0, movementActionId & 0xff] }) === null) {
    gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
    return;
  }
  sNextActionDelay = 0;
  sLastPlayerMovementActionId = movementActionId & 0xff;
}

/** QuestLogRecordPlayerStepWithDuration (quest_log.c). */
export function QuestLogRecordPlayerStepWithDuration(movementActionId: number, duration: number): void {
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_RECORDING) return;
  const script = save.questLogPlayerGfxActions?.[sActivePlayerActionScript]?.script;
  if (!script) return;
  if (QL_RecordAction_MovementOrGfxChange(script, { type: C.QL_ACTION_MOVEMENT, duration: sNextActionDelay, data: [0, 0, 0, movementActionId & 0xff] }) === null) {
    gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
    return;
  }
  sLastPlayerMovementActionId = movementActionId & 0xff;
  sNextActionDelay = duration & 0xffff;
}

/** QuestLogRecordNPCStepWithDuration (quest_log.c). */
export function QuestLogRecordNPCStepWithDuration(localId: number, mapNum: number, mapGroup: number, movementActionId: number, duration: number): void {
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_RECORDING) return;
  const script = save.questLogPlayerGfxActions?.[sActivePlayerActionScript]?.script;
  if (!script) return;
  if (QL_RecordAction_MovementOrGfxChange(script, {
    type: C.QL_ACTION_MOVEMENT, duration: sNextActionDelay,
    data: [localId & 0xff, mapNum & 0xff, mapGroup & 0xff, movementActionId & 0xff],
  }) === null) {
    gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
    return;
  }
  sNextActionDelay = duration & 0xffff;
}

/** QL_RecordFieldInput (quest_log.c): preserve only the C bitfield mask and direction byte. */
export function QL_RecordFieldInput(input: {
  pressedAButton: boolean; checkStandardWildEncounter: boolean; heldDirection: boolean;
  heldDirection2: boolean; tookStep: boolean; pressedBButton: boolean; dpadDirection: number;
}): void {
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_RECORDING) return;
  const script = save.questLogPlayerGfxActions?.[sActivePlayerActionScript]?.script;
  if (!script) return;
  const flags = (input.pressedAButton ? 1 : 0) | (input.checkStandardWildEncounter ? 2 : 0)
    | (input.heldDirection ? 0x10 : 0) | (input.heldDirection2 ? 0x20 : 0)
    | (input.tookStep ? 0x40 : 0) | (input.pressedBButton ? 0x80 : 0);
  if (QL_RecordAction_Input(script, { type: C.QL_ACTION_INPUT, duration: sNextActionDelay, data: [flags, 0, input.dpadDirection & 0xff, 0] }) === null) {
    gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
    return;
  }
  sNextActionDelay = 0;
}

/** QL_TryRunActions recording branch (quest_log.c): count unlocked overworld frames between actions. */
export function QL_TryRunActions(controlsLocked: boolean): void {
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_RECORDING) return;
  if (controlsLocked) return;
  const script = save.questLogPlayerGfxActions?.[sActivePlayerActionScript]?.script;
  if (script && script.length >= 128) {
    gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
    return;
  }
  sNextActionDelay = (sNextActionDelay + 1) & 0xffff;
}

/** Decode one saved action buffer using the source QL_LoadAction_* command format. */
export function QL_LoadPlayerActionScript(eventIndex: number): QuestLogAction[] {
  const script = save.questLogPlayerGfxActions?.find((entry) => entry.eventIndex === eventIndex)?.script;
  if (!script) return [];
  const actions: QuestLogAction[] = [];
  let cursor = 0;
  while (cursor < script.length) {
    const command = script[cursor];
    let loaded: LoadedQuestLogAction | null;
    if (command === C.QL_EVENT_MOVEMENT || command === C.QL_EVENT_GFX_CHANGE) loaded = QL_LoadAction_MovementOrGfxChange(script, cursor);
    else if (command === C.QL_EVENT_INPUT) loaded = QL_LoadAction_Input(script, cursor);
    else if (command === C.QL_EVENT_WAIT) loaded = QL_LoadAction_Wait(script, cursor);
    else if (command === C.QL_EVENT_SCENE_END) loaded = QL_LoadAction_SceneEnd(script, cursor);
    else break;
    if (!loaded) break;
    actions.push(loaded.action);
    cursor = loaded.next;
    if (loaded.action.type === C.QL_ACTION_SCENE_END) break;
  }
  return actions;
}

/** SetQuestLogEvent (quest_log_events.c), storing source event payloads for supported single-player events. */
export function SetQuestLogEvent(eventId: number, data: QuestLogEventData): void {
  if (eventId === C.QL_EVENT_DEPARTED && sStepRecordingMode === STEP_RECORDING_MODE_DISABLED_UNTIL_DEPART) {
    QL_EnableRecordingSteps();
    return;
  }
  const isShopEvent = eventId === C.QL_EVENT_BOUGHT_ITEM || eventId === C.QL_EVENT_SOLD_ITEM;
  const isStoryItemEvent = eventId === C.QL_EVENT_OBTAINED_STORY_ITEM;
  const isDepartedEvent = eventId === C.QL_EVENT_DEPARTED;
  const isItemEvent = eventId === C.QL_EVENT_USED_ITEM || eventId === C.QL_EVENT_GAVE_HELD_ITEM
    || eventId === C.QL_EVENT_GAVE_HELD_ITEM_BAG || eventId === C.QL_EVENT_GAVE_HELD_ITEM_PC
    || eventId === C.QL_EVENT_TOOK_HELD_ITEM || eventId === C.QL_EVENT_SWAPPED_HELD_ITEM
    || eventId === C.QL_EVENT_SWAPPED_HELD_ITEM_PC || eventId === C.QL_EVENT_DEPOSITED_ITEM_PC
    || eventId === C.QL_EVENT_WITHDREW_ITEM_PC;
  const isBattleEvent = eventId === C.QL_EVENT_DEFEATED_GYM_LEADER || eventId === C.QL_EVENT_DEFEATED_WILD_MON
    || eventId === C.QL_EVENT_DEFEATED_E4_MEMBER || eventId === C.QL_EVENT_DEFEATED_CHAMPION
    || eventId === C.QL_EVENT_DEFEATED_TRAINER;
  const isLinkBattleEvent = eventId === C.QL_EVENT_LINK_BATTLED_SINGLE
    || eventId === C.QL_EVENT_LINK_BATTLED_DOUBLE
    || eventId === C.QL_EVENT_LINK_BATTLED_MULTI
    || eventId === C.QL_EVENT_LINK_BATTLED_UNION;
  if (!isShopEvent && !isStoryItemEvent && !isDepartedEvent && !isItemEvent && !isBattleEvent && !isLinkBattleEvent) return;
  QL_EnableRecordingSteps();
  if (gQuestLogState === C.QL_STATE_PLAYBACK) return;
  if (InQuestLogDisabledLocation()) return;
  getQuestLogEvents().push({ eventId, data: { ...data } });
  if (eventId === C.QL_EVENT_DEPARTED && (data as QuestLogDepartedEvent).locationId === C.QL_LOCATION_SAFARI_ZONE) {
    sStepRecordingMode = STEP_RECORDING_MODE_DISABLED;
  }
  if (gQuestLogPlaybackState === C.QL_PLAYBACK_STATE_STOPPED) {
    gQuestLogState = C.QL_STATE_RECORDING;
    gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_RECORDING;
    sNextActionDelay = 0;
    sLastPlayerMovementActionId = -1;
    const scripts = save.questLogPlayerGfxActions ??= [];
    scripts.push({ eventIndex: getQuestLogEvents().length - 1, script: [] });
    sActivePlayerActionScript = scripts.length - 1;
  }
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
export function QL_EnableRecordingSteps(): void { sStepRecordingMode = STEP_RECORDING_MODE_ENABLED; }

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
    const script = save.questLogPlayerGfxActions?.[sActivePlayerActionScript]?.script;
    if (script) QL_RecordAction_SceneEnd(script);
    gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
    gQuestLogState = 0;
    sActivePlayerActionScript = -1;
  }
  gQuestLogDefeatedWildMonRecord = null;
  gQuestLogRecordingPointer = null;
  sNextActionDelay = 0;
  sLastPlayerMovementActionId = -1;
}

/** QL_FinishRecordingScene (quest_log.c): commit the active scene-end marker and stop recording. */
export function QL_FinishRecordingScene(): void {
  if (gQuestLogState !== C.QL_STATE_RECORDING) return;
  const script = save.questLogPlayerGfxActions?.[sActivePlayerActionScript]?.script;
  if (script) QL_RecordAction_SceneEnd(script);
  gQuestLogState = 0;
  sActivePlayerActionScript = -1;
  gQuestLogDefeatedWildMonRecord = null;
  gQuestLogRecordingPointer = null;
  gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
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
  sStepRecordingMode = STEP_RECORDING_MODE_ENABLED;
  QL_ResetRepeatEventTracker();
  getQuestLogEvents().length = 0;
  (save.questLogPlayerGfxActions ??= []).length = 0;
  sActivePlayerActionScript = -1;
  sNextActionDelay = 0;
  sLastPlayerMovementActionId = -1;
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
