// quest_log_events.c: single-player event payloads and scene-script recording.

import * as C from "./generated/constants";
import { cdata } from "./hw/assets";
import { SetGlobalFieldTintMode } from "./field/fieldPalette";
import {
  QL_LoadAction_Input, QL_LoadAction_MovementOrGfxChange, QL_LoadAction_SceneEnd, QL_LoadAction_Wait,
  QL_RecordAction_Input, QL_RecordAction_MovementOrGfxChange, QL_RecordAction_SceneEnd, QL_RecordAction_Wait,
  type LoadedQuestLogAction, type QuestLogAction,
} from "./questLogActions";
import { flagClear, flagGet, flagSet, save, varGet, varSet } from "./save";
import { QuestLog_InitPalettesBackup as initQuestLogPalettesBackup } from "./questLogPalette";
import { gQuestLogState, WriteQuestLogState } from "./questLogState";
import { SetGameStateAtScene, SetNPCInitialCoordsAtScene, SetPlayerInitialCoordsAtScene, type QuestLogScene } from "./questLogObjects";
import { QL_SkipCommand, RecordQuestLogEvent, type QuestLogEventRepeatState } from "./questLogEventBuffer";
import { rom } from "./rom";

export { gQuestLogState };

let sPlayedTheSlots = false;
export function SetQuestLogState(state: number): void {
  WriteQuestLogState(state);
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
let sDeferredTrainerBattleEvent: { eventId: number; data: QuestLogEventData } | null = null;
let sRecordingDeferredTrainerBattle = false;
const STEP_RECORDING_MODE_ENABLED = 0;
const STEP_RECORDING_MODE_DISABLED = 1;
const STEP_RECORDING_MODE_DISABLED_UNTIL_DEPART = 2;
let sStepRecordingMode = STEP_RECORDING_MODE_ENABLED;
let sNewlyEnteredMap = false;
let sLastDepartedLocation = 0;
export const gQuestLogRepeatEventTracker: QuestLogEventRepeatState = { id: 0, numRepeats: 0, counter: 0 };
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
export type QuestLogSwappedHeldItemEvent = { species: number; takenItemId: number; givenItemId: number };
export type QuestLogSwitchedPartyOrderEvent = { species1: number; species2: number };
export type QuestLogFieldMoveEvent = { species: number; fieldMove: number; mapSec: number };
export type QuestLogTrainerBattleEvent = {
  trainerId: number; speciesOpponent: number; speciesPlayer: number; mapSec: number; hpFractionId: number;
};
export type QuestLogWildBattleEvent = { defeatedSpecies: number; caughtSpecies: number; mapSec: number };
export type QuestLogLinkBattleEvent = { outcome: number; playerNames: number[][] };
export type QuestLogDepartedEvent = { mapSec: number; locationId: number };
export type QuestLogEventData = QuestLogShopEvent | QuestLogStoryItemEvent | QuestLogItemEvent | QuestLogSwappedHeldItemEvent
  | QuestLogSwitchedPartyOrderEvent | QuestLogFieldMoveEvent | QuestLogTrainerBattleEvent | QuestLogWildBattleEvent
  | QuestLogLinkBattleEvent | QuestLogDepartedEvent | Record<string, never>;

function nextQuestLogSceneIndex(): number {
  const last = save.questLogScenes?.at(-1)?.eventIndex;
  return last === undefined ? 0 : last + 1;
}

/** IsSpeciesFromSpecialEncounter (quest_log_events.c). */
export function IsSpeciesFromSpecialEncounter(species: number): boolean {
  return species === C.SPECIES_SNORLAX || species === C.SPECIES_ARTICUNO || species === C.SPECIES_ZAPDOS
    || species === C.SPECIES_MOLTRES || species === C.SPECIES_MEWTWO || species === C.SPECIES_LUGIA
    || species === C.SPECIES_HO_OH || species === C.SPECIES_DEOXYS;
}

/** IsEventWithSpecialEncounterSpecies (quest_log_events.c). */
export function IsEventWithSpecialEncounterSpecies(eventId: number, data: QuestLogEventData): boolean {
  if (eventId !== C.QL_EVENT_DEFEATED_WILD_MON) return false;
  const battle = data as QuestLogWildBattleEvent;
  return IsSpeciesFromSpecialEncounter(battle.defeatedSpecies) || IsSpeciesFromSpecialEncounter(battle.caughtSpecies);
}

/** ShouldRegisterEvent_HandleBeatStoryTrainer (quest_log_events.c). */
export function ShouldRegisterEvent_HandleBeatStoryTrainer(eventId: number, data: QuestLogEventData): boolean {
  if (eventId !== C.QL_EVENT_DEFEATED_TRAINER) return false;
  const trainerClass = rom.trainers[(data as QuestLogTrainerBattleEvent).trainerId]?.class;
  return trainerClass !== C.TRAINER_CLASS_RIVAL_EARLY && trainerClass !== C.TRAINER_CLASS_RIVAL_LATE
    && trainerClass !== C.TRAINER_CLASS_CHAMPION && trainerClass !== C.TRAINER_CLASS_BOSS;
}

/** ShouldRegisterEvent_HandlePartyActions (quest_log_events.c). */
export function ShouldRegisterEvent_HandlePartyActions(eventId: number, data: QuestLogEventData): boolean {
  if (eventId === C.QL_EVENT_USED_FIELD_MOVE || eventId === C.QL_EVENT_USED_PKMN_CENTER) return true;
  if (!flagGet(C.FLAG_SYS_GAME_CLEAR)) {
    if (eventId === C.QL_EVENT_SWITCHED_PARTY_ORDER || eventId === C.QL_EVENT_DEFEATED_WILD_MON
      || ShouldRegisterEvent_HandleBeatStoryTrainer(eventId, data)) return true;
  }
  const isPartyItemEvent = eventId === C.QL_EVENT_USED_ITEM || eventId === C.QL_EVENT_GAVE_HELD_ITEM
    || eventId === C.QL_EVENT_GAVE_HELD_ITEM_BAG || eventId === C.QL_EVENT_GAVE_HELD_ITEM_PC
    || eventId === C.QL_EVENT_TOOK_HELD_ITEM || eventId === C.QL_EVENT_SWAPPED_HELD_ITEM
    || eventId === C.QL_EVENT_SWAPPED_HELD_ITEM_PC;
  const isPartyStorageEvent = eventId === C.QL_EVENT_SWITCHED_PARTY_MON_FOR_PC_MON
    || eventId === C.QL_EVENT_WITHDREW_MON_PC || eventId === C.QL_EVENT_DEPOSITED_MON_PC;
  return !flagGet(C.FLAG_SYS_CAN_LINK_WITH_RS) && (isPartyItemEvent || isPartyStorageEvent);
}

/** ShouldRegisterEvent_HandleDeparted (quest_log_events.c). */
export function ShouldRegisterEvent_HandleDeparted(eventId: number, data: QuestLogEventData): boolean {
  if (eventId !== C.QL_EVENT_DEPARTED) {
    sLastDepartedLocation = 0;
    return true;
  }
  const location = (data as QuestLogDepartedEvent).locationId;
  if (sLastDepartedLocation === location + 1) return false;
  sLastDepartedLocation = location + 1;
  return true;
}

/** ShouldRegisterEvent_DepartedGameCorner (quest_log_events.c). */
export function ShouldRegisterEvent_DepartedGameCorner(eventId: number, data: QuestLogEventData): boolean {
  if (eventId !== C.QL_EVENT_DEPARTED) return true;
  if ((data as QuestLogDepartedEvent).locationId === C.QL_LOCATION_GAME_CORNER && !sPlayedTheSlots) return false;
  sPlayedTheSlots = false;
  return true;
}

/** TryDeferTrainerBattleEvent (quest_log_events.c). */
export function TryDeferTrainerBattleEvent(eventId: number, data: QuestLogEventData): boolean {
  if (eventId !== C.QL_EVENT_DEFEATED_TRAINER && eventId !== C.QL_EVENT_DEFEATED_GYM_LEADER
    && eventId !== C.QL_EVENT_DEFEATED_E4_MEMBER && eventId !== C.QL_EVENT_DEFEATED_CHAMPION) return false;
  sDeferredTrainerBattleEvent = null;
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_STOPPED || flagGet(C.FLAG_SYS_GAME_CLEAR)
    || !ShouldRegisterEvent_HandleBeatStoryTrainer(eventId, data)) {
    sDeferredTrainerBattleEvent = { eventId, data: { ...data } };
  }
  return true;
}

/** QL_StartRecordingAction (quest_log.c): allocate the current SaveBlock1 scene slot and snapshot it. */
export function QL_StartRecordingAction(eventId: number, eventIndex: number): QuestLogScene {
  QL_ResetRepeatEventTracker();
  const scenes = save.questLogScenes ??= [];
  const scene: QuestLogScene = {
    startType: eventId === C.QL_EVENT_DEPARTED ? C.QL_START_WARP : C.QL_START_NORMAL,
    objectEvents: [],
    script: [],
    eventIndex,
    actionIndex: 0,
  };
  SetPlayerInitialCoordsAtScene(scene);
  SetNPCInitialCoordsAtScene(scene);
  SetGameStateAtScene(scene);
  const facing = scene.objectEvents.find((objectEvent) => objectEvent.isPlayer)?.facingDirection ?? save.facing;
  const movement = facing === C.DIR_EAST ? C.MOVEMENT_ACTION_FACE_RIGHT
    : facing === C.DIR_NORTH ? C.MOVEMENT_ACTION_FACE_UP
      : facing === C.DIR_WEST ? C.MOVEMENT_ACTION_FACE_LEFT : C.MOVEMENT_ACTION_FACE_DOWN;
  const cursor = QL_RecordAction_MovementOrGfxChange(scene.script as number[], {
    type: C.QL_ACTION_MOVEMENT, duration: 0, data: [0, 0, 0, movement],
  });
  if (cursor !== null) {
    scene.actionIndex = 1;
    gQuestLogRecordingPointer = cursor;
  }
  scenes.push(scene);
  if (scenes.length > C.QUEST_LOG_SCENE_COUNT) scenes.splice(0, scenes.length - C.QUEST_LOG_SCENE_COUNT);
  const retainedEvents = new Set(scenes.map((entry) => entry.eventIndex));
  const actions = save.questLogPlayerGfxActions ??= [];
  const retainedActions = actions.filter((entry) => retainedEvents.has(entry.eventIndex));
  actions.length = 0;
  actions.push(...retainedActions);
  return scene;
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
  if (QL_RecordAction_MovementOrGfxChange(script, action) !== null) {
    IncrementQuestLogActionIndex();
    sNextActionDelay = 0;
  }
}

/** QuestLogRecordPlayerAvatarGfxTransitionWithDuration (quest_log.c). */
export function QuestLogRecordPlayerAvatarGfxTransitionWithDuration(gfxState: number, duration: number): void {
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_RECORDING) return;
  const script = save.questLogPlayerGfxActions?.[sActivePlayerActionScript]?.script;
  if (!script) return;
  const action: QuestLogAction = { type: C.QL_ACTION_GFX_CHANGE, duration: sNextActionDelay, data: [0, 0, 0, gfxState & 0xff] };
  if (QL_RecordAction_MovementOrGfxChange(script, action) !== null) {
    IncrementQuestLogActionIndex();
    sNextActionDelay = duration & 0xff;
  }
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
  IncrementQuestLogActionIndex();
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
  IncrementQuestLogActionIndex();
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
  IncrementQuestLogActionIndex();
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
  IncrementQuestLogActionIndex();
  sNextActionDelay = 0;
}

function IncrementQuestLogActionIndex(): void {
  const scene = save.questLogScenes?.at(-1);
  if (scene && gQuestLogPlaybackState === C.QL_PLAYBACK_STATE_RECORDING) {
    scene.actionIndex = ((scene.actionIndex ?? 0) + 1) & 0xffff;
    gQuestLogRecordingPointer = (scene.script as number[] | undefined)?.length ?? 0;
  }
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
    const command = (script[cursor] ?? 0) & 0x0fff;
    let loaded: LoadedQuestLogAction | null;
    if (command === C.QL_EVENT_MOVEMENT || command === C.QL_EVENT_GFX_CHANGE) loaded = QL_LoadAction_MovementOrGfxChange(script, cursor);
    else if (command === C.QL_EVENT_INPUT) loaded = QL_LoadAction_Input(script, cursor);
    else if (command === C.QL_EVENT_WAIT) loaded = QL_LoadAction_Wait(script, cursor);
    else if (command === C.QL_EVENT_SCENE_END) loaded = QL_LoadAction_SceneEnd(script, cursor);
    else {
      const next = QL_SkipCommand(script, cursor);
      if (next === null) break;
      cursor = next;
      continue;
    }
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
  const isPokemonCenterEvent = eventId === C.QL_EVENT_USED_PKMN_CENTER;
  const isStoryItemEvent = eventId === C.QL_EVENT_OBTAINED_STORY_ITEM;
  const isDepartedEvent = eventId === C.QL_EVENT_DEPARTED;
  const isItemEvent = eventId === C.QL_EVENT_USED_ITEM || eventId === C.QL_EVENT_GAVE_HELD_ITEM
    || eventId === C.QL_EVENT_GAVE_HELD_ITEM_BAG || eventId === C.QL_EVENT_GAVE_HELD_ITEM_PC
    || eventId === C.QL_EVENT_TOOK_HELD_ITEM || eventId === C.QL_EVENT_SWAPPED_HELD_ITEM
    || eventId === C.QL_EVENT_SWAPPED_HELD_ITEM_PC || eventId === C.QL_EVENT_DEPOSITED_ITEM_PC
    || eventId === C.QL_EVENT_WITHDREW_ITEM_PC;
  const isSwitchedPartyOrder = eventId === C.QL_EVENT_SWITCHED_PARTY_ORDER;
  const isFieldMove = eventId === C.QL_EVENT_USED_FIELD_MOVE;
  const isBattleEvent = eventId === C.QL_EVENT_DEFEATED_GYM_LEADER || eventId === C.QL_EVENT_DEFEATED_WILD_MON
    || eventId === C.QL_EVENT_DEFEATED_E4_MEMBER || eventId === C.QL_EVENT_DEFEATED_CHAMPION
    || eventId === C.QL_EVENT_DEFEATED_TRAINER;
  const isStorageEvent = eventId === C.QL_EVENT_SWITCHED_MONS_BETWEEN_BOXES
    || eventId === C.QL_EVENT_SWITCHED_MONS_WITHIN_BOX || eventId === C.QL_EVENT_SWITCHED_PARTY_MON_FOR_PC_MON
    || eventId === C.QL_EVENT_MOVED_MON_BETWEEN_BOXES || eventId === C.QL_EVENT_MOVED_MON_WITHIN_BOX
    || eventId === C.QL_EVENT_WITHDREW_MON_PC || eventId === C.QL_EVENT_DEPOSITED_MON_PC
    || eventId === C.QL_EVENT_SWITCHED_MULTIPLE_MONS;
  const isLinkBattleEvent = eventId === C.QL_EVENT_LINK_BATTLED_SINGLE
    || eventId === C.QL_EVENT_LINK_BATTLED_DOUBLE
    || eventId === C.QL_EVENT_LINK_BATTLED_MULTI
    || eventId === C.QL_EVENT_LINK_BATTLED_UNION;
  if (!isShopEvent && !isPokemonCenterEvent && !isStoryItemEvent && !isDepartedEvent && !isItemEvent && !isBattleEvent
    && !isLinkBattleEvent && !isSwitchedPartyOrder && !isFieldMove && !isStorageEvent) return;
  QL_EnableRecordingSteps();
  if (gQuestLogState === C.QL_STATE_PLAYBACK) return;
  if (InQuestLogDisabledLocation()) return;
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_STOPPED && isStoryItemEvent) return;
  if (isLinkBattleEvent || IsEventWithSpecialEncounterSpecies(eventId, data)) return;
  if (!sRecordingDeferredTrainerBattle && TryDeferTrainerBattleEvent(eventId, data)) return;
  if (!ShouldRegisterEvent_DepartedGameCorner(eventId, data)) return;
  if (gQuestLogPlaybackState === C.QL_PLAYBACK_STATE_STOPPED) {
    if (ShouldRegisterEvent_HandlePartyActions(eventId, data)) return;
    if ((eventId !== C.QL_EVENT_DEFEATED_WILD_MON || gQuestLogDefeatedWildMonRecord === null)
      && !ShouldRegisterEvent_HandleDeparted(eventId, data)) return;
  }
  if (eventId !== C.QL_EVENT_DEFEATED_WILD_MON) {
    gQuestLogDefeatedWildMonRecord = null;
    delete gQuestLogRepeatEventTracker.wildRecordStart;
  }
  if (isPokemonCenterEvent && gQuestLogRepeatEventTracker.id === C.QL_EVENT_USED_PKMN_CENTER
    && gQuestLogRepeatEventTracker.numRepeats !== 0) return;
  if (eventId === C.QL_EVENT_DEPARTED && (data as QuestLogDepartedEvent).locationId === C.QL_LOCATION_SAFARI_ZONE) {
    sStepRecordingMode = STEP_RECORDING_MODE_DISABLED;
  }
  if (gQuestLogPlaybackState === C.QL_PLAYBACK_STATE_STOPPED) {
    WriteQuestLogState(C.QL_STATE_RECORDING);
    gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_RECORDING;
    sNextActionDelay = 0;
    sLastPlayerMovementActionId = -1;
    const scripts = save.questLogPlayerGfxActions ??= [];
    const eventIndex = nextQuestLogSceneIndex();
    const scene = QL_StartRecordingAction(eventId, eventIndex);
    for (let i = scripts.length - 1; i >= 0; i--) if (scripts[i]!.eventIndex === eventIndex) scripts.splice(i, 1);
    scripts.push({ eventIndex, script: scene.script as number[] });
    sActivePlayerActionScript = scripts.length - 1;
  }

  let scene = save.questLogScenes?.at(-1);
  if (!scene) return;
  let script = scene.script as number[];
  let next = RecordQuestLogEvent(eventId, script, scene.actionIndex ?? 0, gQuestLogRepeatEventTracker, data as Record<string, number | boolean>);
  if (next === null) {
    QL_FinishRecordingScene();
    if (ShouldRegisterEvent_HandlePartyActions(eventId, data)
      || !ShouldRegisterEvent_HandleDeparted(eventId, data)) return;
    WriteQuestLogState(C.QL_STATE_RECORDING);
    gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_RECORDING;
    const eventIndex = nextQuestLogSceneIndex();
    scene = QL_StartRecordingAction(eventId, eventIndex);
    script = scene.script as number[];
    const scripts = save.questLogPlayerGfxActions ??= [];
    for (let i = scripts.length - 1; i >= 0; i--) if (scripts[i]!.eventIndex === eventIndex) scripts.splice(i, 1);
    scripts.push({ eventIndex, script });
    sActivePlayerActionScript = scripts.length - 1;
    next = RecordQuestLogEvent(eventId, script, scene.actionIndex ?? 0, gQuestLogRepeatEventTracker, data as Record<string, number | boolean>);
    if (next === null) return;
  }
  if (eventId === C.QL_EVENT_DEFEATED_WILD_MON) gQuestLogDefeatedWildMonRecord = gQuestLogRepeatEventTracker.wildRecordStart ?? null;
  gQuestLogRecordingPointer = next;
  if (eventId === C.QL_EVENT_USED_ITEM && (data as QuestLogItemEvent).itemId === C.ITEM_ESCAPE_ROPE) {
    sStepRecordingMode = STEP_RECORDING_MODE_DISABLED_UNTIL_DEPART;
  } else if (eventId === C.QL_EVENT_USED_FIELD_MOVE) {
    const move = (data as QuestLogFieldMoveEvent).fieldMove;
    sStepRecordingMode = move === C.FIELD_MOVE_TELEPORT || move === C.FIELD_MOVE_DIG
      ? STEP_RECORDING_MODE_DISABLED_UNTIL_DEPART : STEP_RECORDING_MODE_DISABLED;
  } else if (eventId === C.QL_EVENT_DEFEATED_GYM_LEADER || eventId === C.QL_EVENT_DEFEATED_E4_MEMBER
    || eventId === C.QL_EVENT_DEFEATED_CHAMPION) {
    sStepRecordingMode = STEP_RECORDING_MODE_DISABLED;
  }
  if (sStepRecordingMode !== STEP_RECORDING_MODE_ENABLED) QL_FinishRecordingScene();
}

/** SetSwitchedPartyOrderQuestLogEvent (party_menu.c). */
export function SetSwitchedPartyOrderQuestLogEvent(species1: number, species2: number): void {
  SetQuestLogEvent(C.QL_EVENT_SWITCHED_PARTY_ORDER, { species1, species2 });
}

/** SetSwappedHeldItemQuestLogEvent (party_menu.c). */
export function SetSwappedHeldItemQuestLogEvent(eventId: number, species: number, takenItemId: number, givenItemId: number): void {
  SetQuestLogEvent(eventId, { species, takenItemId, givenItemId });
}

/** SetUsedFieldMoveQuestLogEvent (party_menu.c), with the source map-section id resolved by the caller. */
export function SetUsedFieldMoveQuestLogEvent(species: number, fieldMove: number, mapSec: number): void {
  SetQuestLogEvent(C.QL_EVENT_USED_FIELD_MOVE, { species, fieldMove, mapSec });
}

/** SetUsedFlyQuestLogEvent (party_menu.c), with the selected destination's map-section id resolved by the caller. */
export function SetUsedFlyQuestLogEvent(species: number, mapSec: number): void {
  SetUsedFieldMoveQuestLogEvent(species, C.FIELD_MOVE_FLY, mapSec);
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
  delete gQuestLogRepeatEventTracker.recordStart;
  delete gQuestLogRepeatEventTracker.recordPayloadWords;
  delete gQuestLogRepeatEventTracker.wildRecordStart;
}

/** QL_ResetEventStates (quest_log_events.c). */
export function QL_ResetEventStates(): void {
  sNewlyEnteredMap = false;
  sLastDepartedLocation = 0;
  sPlayedTheSlots = false;
}

/** QL_RecordWait (quest_log_events.c): append a timed wait command to the active scene. */
export function QL_RecordWait(duration: number): void {
  if (gQuestLogRecordingPointer === null) return;
  const script = save.questLogScenes?.at(-1)?.script as number[] | undefined;
  if (!script) return;
  const next = QL_RecordAction_Wait(script, duration & 0xffff);
  if (next === null) {
    gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
    return;
  }
  gQuestLogRecordingPointer = next;
  IncrementQuestLogActionIndex();
}

/** QuestLogEvents_HandleEndTrainerBattle (quest_log_events.c), called by battle_setup.c on eligible exits. */
export function QuestLogEvents_HandleEndTrainerBattle(): void {
  const deferred = sDeferredTrainerBattleEvent;
  if (!deferred) return;
  sDeferredTrainerBattleEvent = null;
  if (gQuestLogPlaybackState === C.QL_PLAYBACK_STATE_STOPPED) sLastDepartedLocation = 0;
  sRecordingDeferredTrainerBattle = true;
  try {
    SetQuestLogEvent(deferred.eventId, deferred.data);
  } finally {
    sRecordingDeferredTrainerBattle = false;
  }
  QL_RecordWait(1);
  QL_FinishRecordingScene();
}

/** QuestLog_CutRecording (quest_log.c): close recording state and clear transient pointers. */
export function QuestLog_CutRecording(): void {
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_STOPPED && gQuestLogState === C.QL_STATE_RECORDING) {
    const script = save.questLogPlayerGfxActions?.[sActivePlayerActionScript]?.script;
    QL_RecordWait(1);
    if (script) {
      QL_RecordAction_SceneEnd(script);
      gQuestLogRecordingPointer = script.length;
    }
    gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
    WriteQuestLogState(0);
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
  if (script) {
    QL_RecordAction_SceneEnd(script);
    gQuestLogRecordingPointer = script.length;
  }
  WriteQuestLogState(0);
  sActivePlayerActionScript = -1;
  gQuestLogDefeatedWildMonRecord = null;
  gQuestLogRecordingPointer = null;
  gQuestLogPlaybackState = C.QL_PLAYBACK_STATE_STOPPED;
}

/** SaveQuestLogData (quest_log.c): close the active action stream and order the retained scene ring. */
export function SaveQuestLogData(): void {
  QuestLog_CutRecording();
  const scenes = save.questLogScenes ??= [];
  scenes.sort((a, b) => (a.eventIndex ?? 0) - (b.eventIndex ?? 0));
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
  (save.questLogScenes ??= []).length = 0;
  (save.questLogPlayerGfxActions ??= []).length = 0;
  sActivePlayerActionScript = -1;
  sNextActionDelay = 0;
  sLastPlayerMovementActionId = -1;
  WriteQuestLogState(0);
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
