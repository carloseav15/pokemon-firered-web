// quest_log_events.c: single-player event payloads and scene-script recording.

import * as C from "./generated/constants";
import { cdata, symName, type SymRef } from "./hw/assets";
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
import { expandPlaceholders, GetExpandedPlaceholder, intToDecimal, STR_CONV_MODE_LEFT_ALIGN } from "./gba/charmap";
import { stringVars } from "./gba/stringBuffers";
import { ItemId_GetName, ItemId_GetPocket, POCKET_BERRY_POUCH, POCKET_ITEMS, POCKET_KEY_ITEMS, POCKET_POKE_BALLS, POCKET_TM_CASE } from "./pokemon/items";
import { speciesName } from "./pokemon/pokemon";
import { GetBoxNamePtr } from "./pokemon/storage";
import { getMapNameGenericBytes } from "./regionMap";
import {
  DynamicPlaceholderTextUtil_ExpandPlaceholders, DynamicPlaceholderTextUtil_Reset,
  DynamicPlaceholderTextUtil_SetPlaceholderPtr,
} from "./dynamicPlaceholderTextUtil";

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
let sLoadedQuestLogEvent: QuestLogScriptEvent | null = null;
let sLoadedQuestLogEventTexts: Uint8Array[] = [];
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
export type QuestLogArrivedEvent = { mapSec: number };
export type QuestLogEventData = QuestLogShopEvent | QuestLogStoryItemEvent | QuestLogItemEvent | QuestLogSwappedHeldItemEvent
  | QuestLogSwitchedPartyOrderEvent | QuestLogFieldMoveEvent | QuestLogTrainerBattleEvent | QuestLogWildBattleEvent
  | QuestLogLinkBattleEvent | QuestLogDepartedEvent | QuestLogArrivedEvent | Record<string, never>;
export type QuestLogScriptEvent = {
  eventId: number; actionIndex: number; repeats: number; payloads: number[][]; cursor: number; texts?: Uint8Array[];
};
export type QuestLogScriptEntry = { kind: "action"; action: QuestLogAction } | { kind: "event"; event: QuestLogScriptEvent };

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
  SetPokemonCounts();
  SetPlayerInitialCoordsAtScene(scene);
  SetNPCInitialCoordsAtScene(scene);
  BackUpTrainerRematches();
  BackUpMapLayout();
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

/** SetPokemonCounts (quest_log.c): pack party and PC occupancy into VAR_QUEST_LOG_MON_COUNTS. */
export function SetPokemonCounts(): void {
  const partyCount = save.party.reduce((count, mon) => count + Number(mon.species !== C.SPECIES_NONE && (mon as typeof mon & { hasSpecies?: boolean }).hasSpecies !== false), 0);
  const boxMonCount = save.boxes.reduce((count, box) => count + box.reduce((boxCount, mon) =>
    boxCount + Number(mon !== null && mon.species !== C.SPECIES_NONE && (mon as typeof mon & { hasSpecies?: boolean }).hasSpecies !== false), 0), 0);
  varSet(C.VAR_QUEST_LOG_MON_COUNTS, ((partyCount << 12) + boxMonCount) & 0xffff);
}

/** BackUpTrainerRematches (quest_log.c): pack 64 available-rematch flags into four vars. */
export function BackUpTrainerRematches(): void {
  const rematches = save.trainerRematches ?? [];
  for (let varIndex = 0; varIndex < 4; varIndex++) {
    let packed = 0;
    for (let bit = 0; bit < 16; bit++) {
      if (rematches[varIndex * 16 + bit]) packed |= 1 << bit;
    }
    varSet(C.VAR_QLBAK_TRAINER_REMATCHES + varIndex, packed);
  }
}

/** BackUpMapLayout (quest_log.c), using the map layout index used by gMapHeader. */
export function BackUpMapLayout(): void {
  const mapId = rom.mapIdByNum((save.location.mapGroup << 8) | save.location.mapNum);
  if (mapId === undefined) throw new Error(`missing map id for Quest Log snapshot ${save.location.mapGroup}:${save.location.mapNum}`);
  const map = rom.mapIndex.maps[mapId];
  if (!map) throw new Error(`missing map header for Quest Log snapshot ${save.location.mapGroup}:${save.location.mapNum}`);
  varSet(C.VAR_QLBAK_MAP_LAYOUT, rom.mapIndex.layouts[map.layout] ?? 0);
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

/** QuestLog_RecordEnteredMap (quest_log_events.c), called before setting a world-map flag. */
export function QuestLog_RecordEnteredMap(worldMapFlag: number): void {
  if (gQuestLogState === C.QL_STATE_PLAYBACK || gQuestLogState === C.QL_STATE_PLAYBACK_LAST) return;
  const worldMapFlags = cdata<number[]>("quest_log_events", "sWorldMapFlags");
  if (!worldMapFlags.includes(worldMapFlag)) return;
  sNewlyEnteredMap = !flagGet(worldMapFlag);
}

/** SetQuestLogEvent_Arrived (quest_log_events.c), called once per qualifying map visit. */
export function SetQuestLogEvent_Arrived(): void {
  if (gQuestLogState === C.QL_STATE_PLAYBACK || gQuestLogState === C.QL_STATE_PLAYBACK_LAST || !sNewlyEnteredMap) return;
  SetQuestLogEvent(C.QL_EVENT_ARRIVED, { mapSec: GetMapRegionSection(save.location.mapGroup, save.location.mapNum) });
  sNewlyEnteredMap = false;
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

/** QL_UpdateLastDepartedLocation (quest_log_events.c): read locationId from the packed event body. */
export function QL_UpdateLastDepartedLocation(eventData: ArrayLike<number> | null): void {
  if (eventData === null || ((eventData[0] ?? 0) & C.QL_CMD_EVENT_MASK) !== C.QL_EVENT_DEPARTED) {
    sLastDepartedLocation = 0;
    return;
  }
  // QL_EVENT_DEPARTED stores mapSec and locationId in adjacent bytes of its first u16.
  sLastDepartedLocation = ((((eventData[2] ?? 0) & 0xffff) >>> 8) & 0xff) + 1;
}

function QuestLog_GetSpeciesName(species: number): Uint8Array {
  return species === C.SPECIES_EGG ? rom.text("gText_EggNickname") : speciesName(species);
}

function expandQuestLogText(template: ArrayLike<number>, vars: Partial<Record<"var1" | "var2" | "var3", ArrayLike<number>>>): Uint8Array {
  if (vars.var1) stringVars.var1 = Uint8Array.from(vars.var1);
  if (vars.var2) stringVars.var2 = Uint8Array.from(vars.var2);
  if (vars.var3) stringVars.var3 = Uint8Array.from(vars.var3);
  return expandPlaceholders(template);
}

function expandQuestLogEventText(template: string, vars: Partial<Record<"var1" | "var2" | "var3", ArrayLike<number>>>): Uint8Array {
  return expandQuestLogText(rom.text(template), vars);
}

/** LoadEvent_SwitchedPartyOrder (quest_log_events.c). */
export function LoadEvent_SwitchedPartyOrder(payload: readonly number[]): Uint8Array {
  return expandQuestLogEventText("gText_QuestLog_SwitchMon1WithMon2", {
    var1: QuestLog_GetSpeciesName(payload[0] ?? C.SPECIES_NONE),
    var2: QuestLog_GetSpeciesName(payload[1] ?? C.SPECIES_NONE),
  });
}

/** LoadEvent_UsedItem (quest_log_events.c). */
export function LoadEvent_UsedItem(payload: readonly number[]): Uint8Array {
  const itemId = payload[0] ?? C.ITEM_NONE;
  const species = payload[1] ?? C.SPECIES_NONE;
  const itemParam = payload[2] ?? C.SPECIES_NONE;
  const pocket = ItemId_GetPocket(itemId);
  const itemName = ItemId_GetName(itemId);
  if (pocket === POCKET_ITEMS || pocket === POCKET_POKE_BALLS || pocket === POCKET_BERRY_POUCH) {
    if (itemId === C.ITEM_ESCAPE_ROPE) {
      return expandQuestLogEventText("gText_QuestLog_UsedEscapeRope", {
        var1: save.playerName, var2: getMapNameGenericBytes(itemParam & 0xff),
      });
    }
    if (species !== C.SPECIES_NONE) {
      return expandQuestLogEventText("gText_QuestLog_UsedItemOnMonAtThisLocation", {
        var1: itemName, var2: QuestLog_GetSpeciesName(species),
      });
    }
    return expandQuestLogEventText("gText_QuestLog_UsedTheItem", { var1: itemName });
  }
  if (pocket === POCKET_KEY_ITEMS) return expandQuestLogEventText("gText_QuestLog_UsedTheKeyItem", { var1: itemName });
  if (pocket === POCKET_TM_CASE) {
    const tmhmMoves = cdata<number[]>("party_menu", "sTMHMMoves");
    const move = tmhmMoves[itemId - C.ITEM_TM01] ?? C.MOVE_NONE;
    const hm = itemId >= C.ITEM_HM01;
    const replacedMove = itemParam !== C.SPECIES_NONE;
    const template = hm
      ? replacedMove ? "gText_QuestLog_MonReplacedMoveWithHM" : "gText_QuestLog_MonLearnedMoveFromHM"
      : replacedMove ? "gText_QuestLog_MonReplacedMoveWithTM" : "gText_QuestLog_MonLearnedMoveFromTM";
    return expandQuestLogEventText(template, {
      var1: QuestLog_GetSpeciesName(species), var2: rom.moveName(move),
      var3: replacedMove ? rom.moveName(itemParam) : undefined,
    });
  }
  return new Uint8Array([C.EOS]);
}

/** LoadEvent_UsedPkmnCenter (quest_log_events.c). */
export function LoadEvent_UsedPkmnCenter(_payload: readonly number[]): Uint8Array {
  return expandQuestLogEventText("gText_QuestLog_MonsWereFullyRestoredAtCenter", {});
}

function questLogTextFromSymbolArray(name: string, index: number): Uint8Array {
  const symbol = cdata<Array<SymRef | number>>("quest_log_events", name)[index];
  if (typeof symbol !== "object" || symbol === null) throw new Error(`${name}[${index}] is not a text symbol`);
  const textName = symName(symbol);
  if (textName === null) throw new Error(`${name}[${index}] has no symbol name`);
  return rom.text(textName);
}

/** LoadEvent_DepartedLocation (quest_log_events.c). */
export function LoadEvent_DepartedLocation(payload: readonly number[]): Uint8Array {
  const packed = payload[0] ?? 0;
  const mapSec = packed & 0xff;
  const locationId = packed >>> 8;
  const typeIds = cdata<number[]>("quest_log_events", "sLocationToDepartedTextId");
  const departedTextId = typeIds[locationId] ?? 0;
  let template: ArrayLike<number>;
  if (departedTextId === C.QL_DEPARTED_GYM) {
    const gymMapSecs = cdata<number[]>("quest_log_events", "sGymCityMapSecs");
    const gymIndex = gymMapSecs.indexOf(mapSec);
    if (gymIndex >= 0) {
      template = rom.text(flagGet(C.FLAG_BADGE01_GET + gymIndex)
        ? "gText_QuestLog_DepartedGym" : "gText_QuestLog_GymWasFullOfToughTrainers");
    } else {
      template = questLogTextFromSymbolArray("sDepartedLocationTexts", departedTextId);
    }
  } else {
    template = questLogTextFromSymbolArray("sDepartedLocationTexts", departedTextId);
  }
  stringVars.var1 = getMapNameGenericBytes(mapSec);
  stringVars.var2 = questLogTextFromSymbolArray("sLocationNameTexts", locationId);
  return expandPlaceholders(template);
}

/** LoadEvent_UsedFieldMove (quest_log_events.c). */
export function LoadEvent_UsedFieldMove(payload: readonly number[]): Uint8Array {
  const species = payload[0] ?? C.SPECIES_NONE;
  const packedMoveAndMap = payload[1] ?? 0;
  const fieldMove = packedMoveAndMap & 0xff;
  const mapSec = packedMoveAndMap >>> 8;
  const vars: Partial<Record<"var1" | "var2" | "var3", ArrayLike<number>>> = {
    var1: QuestLog_GetSpeciesName(species),
  };
  if (mapSec !== 0xff) vars.var2 = getMapNameGenericBytes(mapSec);
  if (fieldMove === C.FIELD_MOVE_TELEPORT) {
    vars.var3 = rom.text(mapSec === C.MAPSEC_PALLET_TOWN ? "gText_QuestLog_Home" : "gText_PokemonCenter");
  }
  return expandQuestLogText(questLogTextFromSymbolArray("sUsedFieldMoveTexts", fieldMove), vars);
}

/** LoadEvent_ObtainedStoryItem (quest_log_events.c). */
export function LoadEvent_ObtainedStoryItem(payload: readonly number[]): Uint8Array {
  const packed = payload[1] ?? 0;
  return expandQuestLogEventText("gText_QuestLog_ObtainedItemInLocation", {
    var1: getMapNameGenericBytes(packed & 0xff), var2: ItemId_GetName(payload[0] ?? C.ITEM_NONE),
  });
}

/** LoadEvent_ArrivedInLocation (quest_log_events.c). */
export function LoadEvent_ArrivedInLocation(payload: readonly number[]): Uint8Array {
  return expandQuestLogEventText("gText_QuestLog_ArrivedInLocation", {
    var1: getMapNameGenericBytes((payload[0] ?? 0) & 0xff),
  });
}

function boxName(boxId: number): ArrayLike<number> {
  const name = GetBoxNamePtr(boxId);
  if (name === null) throw new RangeError(`invalid Quest Log box id ${boxId}`);
  return name;
}

function packedByte(word: number, byte: 0 | 1): number { return ((word ?? 0) >>> (byte * 8)) & 0xff; }

function expandQuestLogDynamicText(template: string, placeholders: ArrayLike<number>[]): Uint8Array {
  DynamicPlaceholderTextUtil_Reset();
  placeholders.forEach((text, index) => DynamicPlaceholderTextUtil_SetPlaceholderPtr(index, text));
  return DynamicPlaceholderTextUtil_ExpandPlaceholders(rom.text(template));
}

function trainerNameBytes(trainerId: number): Uint8Array {
  const encoded = rom.trainers[trainerId]?.name;
  return encoded ? Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)) : Uint8Array.of(C.EOS);
}

function defeatedOpponentFlavor(index: number): Uint8Array {
  const texts = ["gText_QuestLog_Handily", "gText_QuestLog_Tenaciously", "gText_QuestLog_Somehow"];
  return rom.text(texts[index] ?? texts[0]!);
}

function defeatedChampionFlavor(index: number): Uint8Array {
  const texts = ["gText_QuestLog_Coolly", "gText_QuestLog_Somehow", "gText_QuestLog_Barely"];
  return rom.text(texts[index] ?? texts[0]!);
}

function loadTrainerBattleText(payload: readonly number[], template: string, rivalMayBeNamed: boolean): Uint8Array {
  const packed = payload[3] ?? 0;
  const trainerId = payload[2] ?? 0;
  const trainerClass = rom.trainers[trainerId]?.class;
  const trainerName = rivalMayBeNamed && (trainerClass === C.TRAINER_CLASS_RIVAL_EARLY
    || trainerClass === C.TRAINER_CLASS_RIVAL_LATE || trainerClass === C.TRAINER_CLASS_CHAMPION)
    ? GetExpandedPlaceholder(C.PLACEHOLDER_ID_RIVAL) : trainerNameBytes(trainerId);
  return expandQuestLogDynamicText(template, [
    getMapNameGenericBytes(packedByte(packed, 0)), trainerName,
    QuestLog_GetSpeciesName(payload[0] ?? C.SPECIES_NONE), QuestLog_GetSpeciesName(payload[1] ?? C.SPECIES_NONE),
    defeatedOpponentFlavor(packedByte(packed, 1)),
  ]);
}

/** LoadEvent_DefeatedGymLeader (quest_log_events.c). */
export function LoadEvent_DefeatedGymLeader(payload: readonly number[]): Uint8Array {
  return loadTrainerBattleText(payload, "gText_QuestLog_TookOnGymLeadersMonWithMonAndWon", false);
}

/** LoadEvent_DefeatedEliteFourMember (quest_log_events.c). */
export function LoadEvent_DefeatedEliteFourMember(payload: readonly number[]): Uint8Array {
  const packed = payload[3] ?? 0;
  return expandQuestLogDynamicText("gText_QuestLog_TookOnEliteFoursMonWithMonAndWon", [
    trainerNameBytes(payload[2] ?? 0), QuestLog_GetSpeciesName(payload[0] ?? C.SPECIES_NONE),
    QuestLog_GetSpeciesName(payload[1] ?? C.SPECIES_NONE), defeatedOpponentFlavor(packedByte(packed, 1)),
  ]);
}

/** LoadEvent_DefeatedTrainer (quest_log_events.c). */
export function LoadEvent_DefeatedTrainer(payload: readonly number[]): Uint8Array {
  return loadTrainerBattleText(payload, "gText_QuestLog_TookOnTrainersMonWithMonAndWon", true);
}

/** LoadEvent_DefeatedWildMon (quest_log_events.c). */
export function LoadEvent_DefeatedWildMon(payload: readonly number[]): Uint8Array {
  const counts = payload[2] ?? 0;
  const defeated = packedByte(counts, 0);
  const caught = packedByte(counts, 1);
  const template = defeated === 0 ? caught === 1 ? "gText_QuestLog_CaughtWildMon" : "gText_QuestLog_CaughtWildMons"
    : caught === 0 ? defeated === 1 ? "gText_QuestLog_DefeatedWildMon" : "gText_QuestLog_DefeatedWildMons"
      : defeated === 1 ? caught === 1 ? "gText_QuestLog_DefeatedWildMonAndCaughtWildMon" : "gText_QuestLog_DefeatedWildMonAndCaughtWildMons"
        : caught === 1 ? "gText_QuestLog_DefeatedWildMonsAndCaughtWildMon" : "gText_QuestLog_DefeatedWildMonsAndCaughtWildMons";
  return expandQuestLogDynamicText(template, [
    getMapNameGenericBytes(packedByte(payload[3] ?? 0, 0)), QuestLog_GetSpeciesName(payload[0] ?? C.SPECIES_NONE),
    intToDecimal(defeated, STR_CONV_MODE_LEFT_ALIGN, 3), QuestLog_GetSpeciesName(payload[1] ?? C.SPECIES_NONE),
    intToDecimal(caught, STR_CONV_MODE_LEFT_ALIGN, 3), save.playerName,
  ]);
}

/** LoadEvent_DefeatedChampion (quest_log_events.c), producing its three sequential scene lines. */
export function LoadEvent_DefeatedChampion(payload: readonly number[]): Uint8Array[] {
  const opponent = payload[0] ?? C.SPECIES_NONE;
  const playerMon = payload[1] ?? C.SPECIES_NONE;
  const flavor = defeatedChampionFlavor(packedByte(payload[2] ?? 0, 0));
  return [
    expandQuestLogDynamicText("gText_QuestLog_PlayerBattledChampionRival", [save.playerName, save.rivalName]),
    expandQuestLogDynamicText("gText_QuestLog_PlayerSentOutMon1RivalSentOutMon2", [
      save.rivalName, QuestLog_GetSpeciesName(opponent), save.playerName, QuestLog_GetSpeciesName(playerMon),
    ]),
    expandQuestLogDynamicText("gText_QuestLog_WonTheMatchAsAResult", [flavor]),
  ];
}

/** LoadEvent_BoughtItem (quest_log_events.c). */
export function LoadEvent_BoughtItem(payload: readonly number[]): Uint8Array {
  const totalMoney = ((payload[2] ?? 0) & 0xffff) * 0x10000 + ((payload[3] ?? 0) & 0xffff);
  const mapSec = packedByte(payload[4] ?? 0, 0);
  const itemName = ItemId_GetName(payload[0] ?? C.ITEM_NONE);
  if ((payload[1] ?? 0) < 2) {
    return expandQuestLogDynamicText("gText_QuestLog_BoughtItem", [getMapNameGenericBytes(mapSec), itemName]);
  }
  return expandQuestLogDynamicText("gText_QuestLog_BoughtItemsIncludingItem", [
    getMapNameGenericBytes(mapSec), itemName, intToDecimal(totalMoney, STR_CONV_MODE_LEFT_ALIGN, 6),
  ]);
}

/** LoadEvent_SoldItem (quest_log_events.c). */
export function LoadEvent_SoldItem(payload: readonly number[]): Uint8Array {
  const totalMoney = ((payload[2] ?? 0) & 0xffff) * 0x10000 + ((payload[3] ?? 0) & 0xffff);
  const packed = payload[4] ?? 0;
  const mapName = getMapNameGenericBytes(packedByte(packed, 0));
  const itemName = ItemId_GetName(payload[0] ?? C.ITEM_NONE);
  if (packedByte(packed, 1) !== 0) {
    return expandQuestLogDynamicText("gText_QuestLog_SoldItemsIncludingItem", [
      mapName, itemName, intToDecimal(totalMoney, STR_CONV_MODE_LEFT_ALIGN, 6),
    ]);
  }
  const quantity = payload[1] ?? 0;
  let quantityText = rom.text("gText_QuestLog_JustOne");
  if (quantity !== 1) {
    DynamicPlaceholderTextUtil_Reset();
    DynamicPlaceholderTextUtil_SetPlaceholderPtr(4, intToDecimal(quantity, STR_CONV_MODE_LEFT_ALIGN, 3));
    quantityText = DynamicPlaceholderTextUtil_ExpandPlaceholders(rom.text("gText_QuestLog_Num"));
  }
  return expandQuestLogDynamicText("gText_QuestLog_SoldNumOfItem", [
    save.playerName, mapName, itemName, quantityText,
  ]);
}

/** LoadEvent_SwitchedMonsBetweenBoxes (quest_log_events.c). */
export function LoadEvent_SwitchedMonsBetweenBoxes(payload: readonly number[]): Uint8Array {
  return expandQuestLogDynamicText("gText_QuestLog_SwitchedMonsBetweenBoxes", [
    boxName(packedByte(payload[2] ?? 0, 0)), QuestLog_GetSpeciesName(payload[0] ?? C.SPECIES_NONE),
    boxName(packedByte(payload[2] ?? 0, 1)), QuestLog_GetSpeciesName(payload[1] ?? C.SPECIES_NONE),
  ]);
}

/** LoadEvent_SwitchedMonsWithinBox (quest_log_events.c). */
export function LoadEvent_SwitchedMonsWithinBox(payload: readonly number[]): Uint8Array {
  return expandQuestLogDynamicText("gText_QuestLog_SwitchedMonsWithinBox", [
    boxName(packedByte(payload[2] ?? 0, 0)), QuestLog_GetSpeciesName(payload[0] ?? C.SPECIES_NONE),
    QuestLog_GetSpeciesName(payload[1] ?? C.SPECIES_NONE),
  ]);
}

/** LoadEvent_SwitchedPartyMonForPCMon (quest_log_events.c). */
export function LoadEvent_SwitchedPartyMonForPCMon(payload: readonly number[]): Uint8Array {
  return expandQuestLogDynamicText("gText_QuestLog_SwitchedPartyMonForPCMon", [
    boxName(packedByte(payload[2] ?? 0, 0)), QuestLog_GetSpeciesName(payload[0] ?? C.SPECIES_NONE),
    QuestLog_GetSpeciesName(payload[1] ?? C.SPECIES_NONE),
  ]);
}

/** LoadEvent_MovedMonBetweenBoxes (quest_log_events.c). */
export function LoadEvent_MovedMonBetweenBoxes(payload: readonly number[]): Uint8Array {
  return expandQuestLogDynamicText("gText_QuestLog_MovedMonToNewBox", [
    boxName(packedByte(payload[1] ?? 0, 0)), QuestLog_GetSpeciesName(payload[0] ?? C.SPECIES_NONE),
    boxName(packedByte(payload[1] ?? 0, 1)),
  ]);
}

/** LoadEvent_MovedMonWithinBox (quest_log_events.c). */
export function LoadEvent_MovedMonWithinBox(payload: readonly number[]): Uint8Array {
  return expandQuestLogDynamicText("gText_QuestLog_MovedMonWithinBox", [
    boxName(packedByte(payload[1] ?? 0, 0)), QuestLog_GetSpeciesName(payload[0] ?? C.SPECIES_NONE),
  ]);
}

/** LoadEvent_WithdrewMonFromPC (quest_log_events.c). */
export function LoadEvent_WithdrewMonFromPC(payload: readonly number[]): Uint8Array {
  return expandQuestLogDynamicText("gText_QuestLog_WithdrewMonFromPC", [
    boxName(packedByte(payload[1] ?? 0, 0)), QuestLog_GetSpeciesName(payload[0] ?? C.SPECIES_NONE),
  ]);
}

/** LoadEvent_DepositedMonInPC (quest_log_events.c). */
export function LoadEvent_DepositedMonInPC(payload: readonly number[]): Uint8Array {
  return expandQuestLogDynamicText("gText_QuestLog_DepositedMonInPC", [
    QuestLog_GetSpeciesName(payload[0] ?? C.SPECIES_NONE), boxName(packedByte(payload[1] ?? 0, 0)),
  ]);
}

/** LoadEvent_SwitchedMultipleMons (quest_log_events.c). */
export function LoadEvent_SwitchedMultipleMons(payload: readonly number[]): Uint8Array {
  const box1 = packedByte(payload[0] ?? 0, 0);
  const box2 = packedByte(payload[0] ?? 0, 1);
  return expandQuestLogDynamicText("gText_QuestLog_SwitchedMultipleMons", [
    boxName(box1), box1 === box2 ? rom.text("gText_QuestLog_ADifferentSpot") : boxName(box2),
  ]);
}

/** LoadEvent_DepositedItemInPC (quest_log_events.c). */
export function LoadEvent_DepositedItemInPC(payload: readonly number[]): Uint8Array {
  return expandQuestLogEventText("gText_QuestLog_StoredItemInPC", { var1: ItemId_GetName(payload[0] ?? C.ITEM_NONE) });
}

/** LoadEvent_WithdrewItemFromPC (quest_log_events.c). */
export function LoadEvent_WithdrewItemFromPC(payload: readonly number[]): Uint8Array {
  return expandQuestLogEventText("gText_QuestLog_WithdrewItemFromPC", { var1: ItemId_GetName(payload[0] ?? C.ITEM_NONE) });
}

/** LoadEvent_GaveHeldItemFromPartyMenu (quest_log_events.c). */
export function LoadEvent_GaveHeldItemFromPartyMenu(payload: readonly number[]): Uint8Array {
  return expandQuestLogEventText("gText_QuestLog_GaveMonHeldItem", {
    var1: QuestLog_GetSpeciesName(payload[1] ?? C.SPECIES_NONE), var2: ItemId_GetName(payload[0] ?? C.ITEM_NONE),
  });
}

/** LoadEvent_GaveHeldItemFromBagMenu (quest_log_events.c). */
export function LoadEvent_GaveHeldItemFromBagMenu(payload: readonly number[]): Uint8Array {
  return expandQuestLogEventText("gText_QuestLog_GaveMonHeldItem2", {
    var1: QuestLog_GetSpeciesName(payload[1] ?? C.SPECIES_NONE), var2: ItemId_GetName(payload[0] ?? C.ITEM_NONE),
  });
}

/** LoadEvent_GaveHeldItemFromPC (quest_log_events.c). */
export function LoadEvent_GaveHeldItemFromPC(payload: readonly number[]): Uint8Array {
  return expandQuestLogEventText("gText_QuestLog_GaveMonHeldItemFromPC", {
    var1: ItemId_GetName(payload[0] ?? C.ITEM_NONE), var2: QuestLog_GetSpeciesName(payload[1] ?? C.SPECIES_NONE),
  });
}

/** LoadEvent_TookHeldItem (quest_log_events.c). */
export function LoadEvent_TookHeldItem(payload: readonly number[]): Uint8Array {
  return expandQuestLogEventText("gText_QuestLog_TookHeldItemFromMon", {
    var1: QuestLog_GetSpeciesName(payload[1] ?? C.SPECIES_NONE), var2: ItemId_GetName(payload[0] ?? C.ITEM_NONE),
  });
}

/** LoadEvent_SwappedHeldItem (quest_log_events.c). */
export function LoadEvent_SwappedHeldItem(payload: readonly number[]): Uint8Array {
  return expandQuestLogEventText("gText_QuestLog_SwappedHeldItemsOnMon", {
    var1: QuestLog_GetSpeciesName(payload[2] ?? C.SPECIES_NONE),
    var2: ItemId_GetName(payload[0] ?? C.ITEM_NONE), var3: ItemId_GetName(payload[1] ?? C.ITEM_NONE),
  });
}

/** LoadEvent_SwappedHeldItemFromPC (quest_log_events.c). */
export function LoadEvent_SwappedHeldItemFromPC(payload: readonly number[]): Uint8Array {
  return expandQuestLogEventText("gText_QuestLog_SwappedHeldItemFromPC", {
    var1: ItemId_GetName(payload[1] ?? C.ITEM_NONE), var2: QuestLog_GetSpeciesName(payload[2] ?? C.SPECIES_NONE),
    var3: ItemId_GetName(payload[0] ?? C.ITEM_NONE),
  });
}

/** LoadQuestLogEventText: build each repeat's event description from the saved payloads. */
export function LoadQuestLogEventText(event: QuestLogScriptEvent): Uint8Array[] | null {
  if (event.eventId === C.QL_EVENT_DEFEATED_CHAMPION) return LoadEvent_DefeatedChampion(event.payloads[0] ?? []);
  const load = event.eventId === C.QL_EVENT_GAVE_HELD_ITEM ? LoadEvent_GaveHeldItemFromPartyMenu
      : event.eventId === C.QL_EVENT_GAVE_HELD_ITEM_BAG ? LoadEvent_GaveHeldItemFromBagMenu
        : event.eventId === C.QL_EVENT_GAVE_HELD_ITEM_PC ? LoadEvent_GaveHeldItemFromPC
        : event.eventId === C.QL_EVENT_TOOK_HELD_ITEM ? LoadEvent_TookHeldItem
            : event.eventId === C.QL_EVENT_SWAPPED_HELD_ITEM ? LoadEvent_SwappedHeldItem
              : event.eventId === C.QL_EVENT_SWAPPED_HELD_ITEM_PC ? LoadEvent_SwappedHeldItemFromPC
                : event.eventId === C.QL_EVENT_DEPARTED ? LoadEvent_DepartedLocation
                  : event.eventId === C.QL_EVENT_USED_FIELD_MOVE ? LoadEvent_UsedFieldMove
                      : event.eventId === C.QL_EVENT_OBTAINED_STORY_ITEM ? LoadEvent_ObtainedStoryItem
                      : event.eventId === C.QL_EVENT_ARRIVED ? LoadEvent_ArrivedInLocation
                        : event.eventId === C.QL_EVENT_DEFEATED_GYM_LEADER ? LoadEvent_DefeatedGymLeader
                          : event.eventId === C.QL_EVENT_DEFEATED_WILD_MON ? LoadEvent_DefeatedWildMon
                            : event.eventId === C.QL_EVENT_DEFEATED_E4_MEMBER ? LoadEvent_DefeatedEliteFourMember
                              : event.eventId === C.QL_EVENT_DEFEATED_TRAINER ? LoadEvent_DefeatedTrainer
                : event.eventId === C.QL_EVENT_BOUGHT_ITEM ? LoadEvent_BoughtItem
                                  : event.eventId === C.QL_EVENT_SOLD_ITEM ? LoadEvent_SoldItem
                                    : event.eventId === C.QL_EVENT_SWITCHED_PARTY_ORDER ? LoadEvent_SwitchedPartyOrder
                                      : event.eventId === C.QL_EVENT_USED_ITEM ? LoadEvent_UsedItem
                                        : event.eventId === C.QL_EVENT_USED_PKMN_CENTER ? LoadEvent_UsedPkmnCenter
                                    : event.eventId === C.QL_EVENT_SWITCHED_MONS_BETWEEN_BOXES ? LoadEvent_SwitchedMonsBetweenBoxes
                                      : event.eventId === C.QL_EVENT_SWITCHED_MONS_WITHIN_BOX ? LoadEvent_SwitchedMonsWithinBox
                                        : event.eventId === C.QL_EVENT_SWITCHED_PARTY_MON_FOR_PC_MON ? LoadEvent_SwitchedPartyMonForPCMon
                                          : event.eventId === C.QL_EVENT_MOVED_MON_BETWEEN_BOXES ? LoadEvent_MovedMonBetweenBoxes
                                            : event.eventId === C.QL_EVENT_MOVED_MON_WITHIN_BOX ? LoadEvent_MovedMonWithinBox
                                              : event.eventId === C.QL_EVENT_WITHDREW_MON_PC ? LoadEvent_WithdrewMonFromPC
                                                : event.eventId === C.QL_EVENT_DEPOSITED_MON_PC ? LoadEvent_DepositedMonInPC
                                                  : event.eventId === C.QL_EVENT_SWITCHED_MULTIPLE_MONS ? LoadEvent_SwitchedMultipleMons
                                                    : event.eventId === C.QL_EVENT_DEPOSITED_ITEM_PC ? LoadEvent_DepositedItemInPC
                                                      : event.eventId === C.QL_EVENT_WITHDREW_ITEM_PC ? LoadEvent_WithdrewItemFromPC : null;
  return load === null ? null : event.payloads.map((_payload, repeatIndex) => {
    const payload = LoadEvent(event.eventId, event, repeatIndex);
    return payload === null ? new Uint8Array([C.EOS]) : load(payload);
  });
}

/** LoadEvent (quest_log_events.c): select one decoded record repeat from the saved event stream. */
export function LoadEvent(eventId: number, event: QuestLogScriptEvent, repeatIndex = 0): readonly number[] | null {
  if (event.eventId !== eventId || repeatIndex < 0) return null;
  return event.payloads[repeatIndex] ?? null;
}

/** QL_LoadEvent (quest_log_events.c): expose the first text and prime the repeat cursor. */
export function QL_LoadEvent(event: QuestLogScriptEvent, currentActionIndex: number): Uint8Array | null {
  if (event.actionIndex > currentActionIndex) return null;
  QL_ResetRepeatEventTracker();
  sLoadedQuestLogEvent = event;
  sLoadedQuestLogEventTexts = LoadQuestLogEventText(event) ?? [];
  if (sLoadedQuestLogEventTexts.length === 0) return null;
  // The Champion record stores one body but its loader emits three sequential lines.
  const repeats = event.eventId === C.QL_EVENT_DEFEATED_CHAMPION ? 2 : event.repeats;
  gQuestLogRepeatEventTracker.id = event.eventId;
  gQuestLogRepeatEventTracker.numRepeats = repeats;
  gQuestLogRepeatEventTracker.counter = repeats > 0 ? 1 : 0;
  return sLoadedQuestLogEventTexts[0] ?? null;
}

/** QL_TryRepeatEvent (quest_log_events.c): return the next text line for a repeated event. */
export function QL_TryRepeatEvent(event: QuestLogScriptEvent): Uint8Array | null {
  const tracker = gQuestLogRepeatEventTracker;
  if (sLoadedQuestLogEvent !== event || tracker.counter === 0 || tracker.id !== event.eventId) return null;
  const text = sLoadedQuestLogEventTexts[tracker.counter] ?? null;
  tracker.counter++;
  if (tracker.counter > tracker.numRepeats) QL_ResetRepeatEventTracker();
  return text;
}

/** ReadQuestLogScriptFromSav1 (quest_log.c): separate packed actions and event records in script order. */
export function ReadQuestLogScriptFromSav1(eventIndex: number): QuestLogScriptEntry[] {
  const scene = save.questLogScenes?.find((entry) => entry.eventIndex === eventIndex);
  const script = (scene?.script as number[] | undefined)
    ?? save.questLogPlayerGfxActions?.find((entry) => entry.eventIndex === eventIndex)?.script;
  if (!script) return [];
  const entries: QuestLogScriptEntry[] = [];
  let cursor = 0;
  let eventNum = 0;
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
      const encodedRepeats = ((script[cursor] ?? 0) & 0xffff) >>> C.QL_CMD_COUNT_SHIFT;
      const repeats = command === C.QL_EVENT_DEFEATED_CHAMPION ? 0 : encodedRepeats;
      const bodyStart = cursor + 2;
      const bodyWords = Math.floor((next - bodyStart) / (repeats + 1));
      const payloads = Array.from({ length: repeats + 1 }, (_, index) =>
        script.slice(bodyStart + index * bodyWords, bodyStart + (index + 1) * bodyWords));
      const event: QuestLogScriptEvent = {
        eventId: command,
        actionIndex: (script[cursor + 1] ?? 0) & 0xffff,
        repeats,
        payloads,
        cursor,
      };
      const firstText = QL_LoadEvent(event, scene?.actionIndex ?? event.actionIndex);
      if (firstText) {
        event.texts = [firstText];
        while (true) {
          const repeatedText = QL_TryRepeatEvent(event);
          if (!repeatedText) break;
          event.texts.push(repeatedText);
        }
      }
      entries.push({ kind: "event", event });
      if (eventNum++ === 0) QL_UpdateLastDepartedLocation(script.slice(cursor));
      cursor = next;
      continue;
    }
    if (!loaded) break;
    entries.push({ kind: "action", action: loaded.action });
    cursor = loaded.next;
    if (loaded.action.type === C.QL_ACTION_SCENE_END) break;
  }
  return entries;
}

/** Decode the action subset for the existing action consumers. */
export function QL_LoadPlayerActionScript(eventIndex: number): QuestLogAction[] {
  return ReadQuestLogScriptFromSav1(eventIndex).flatMap((entry) => entry.kind === "action" ? [entry.action] : []);
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
  const isArrivedEvent = eventId === C.QL_EVENT_ARRIVED;
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
  if (!isShopEvent && !isPokemonCenterEvent && !isStoryItemEvent && !isArrivedEvent && !isDepartedEvent && !isItemEvent && !isBattleEvent
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
  } else if (eventId === C.QL_EVENT_DEFEATED_TRAINER || eventId === C.QL_EVENT_DEFEATED_GYM_LEADER || eventId === C.QL_EVENT_DEFEATED_E4_MEMBER
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
