// quest_log_events.c: single-player event records in QuestLogScene.script.

import * as C from "./generated/constants";

export interface QuestLogEventRepeatState {
  id: number;
  numRepeats: number;
  counter: number;
  recordStart?: number;
  recordPayloadWords?: number;
  wildRecordStart?: number;
}

const CMD_HEADER_WORDS = 2;
const SCRIPT_WORD_CAPACITY = 128;
const MAX_CMD_REPEAT = 4;

function u16(value: number | undefined): number { return (value ?? 0) & 0xffff; }

/** UpdateRepeatEventCounter (quest_log_events.c). */
export function UpdateRepeatEventCounter(eventId: number, actionIndex: number, tracker: QuestLogEventRepeatState): void {
  if (tracker.id !== (eventId & 0xff) || tracker.counter !== (actionIndex & 0xffff)) {
    tracker.id = eventId & 0xff;
    tracker.numRepeats = 0;
    tracker.counter = actionIndex & 0xffff;
    delete tracker.recordStart;
    delete tracker.recordPayloadWords;
  } else if (tracker.numRepeats < MAX_CMD_REPEAT + 1) {
    tracker.numRepeats++;
  }
}

/** RecordEventHeader (quest_log_events.c), including the source's four-repeat rolling window. */
export function RecordEventHeader(
  script: number[], eventId: number, actionIndex: number, payload: readonly number[], tracker: QuestLogEventRepeatState,
): number | null {
  UpdateRepeatEventCounter(eventId, actionIndex, tracker);
  const repeatCount = tracker.numRepeats;
  const headerWords = repeatCount === 0 ? CMD_HEADER_WORDS : 0;
  if (tracker.recordPayloadWords !== undefined && tracker.recordPayloadWords !== payload.length) return null;

  if (repeatCount === 0) {
    if (script.length + headerWords + payload.length > SCRIPT_WORD_CAPACITY) return null;
    tracker.recordStart = script.length;
    tracker.recordPayloadWords = payload.length;
    script.push((eventId & 0x0fff) + (repeatCount << C.QL_CMD_COUNT_SHIFT), actionIndex & 0xffff, ...payload.map(u16));
    return script.length;
  }

  const start = tracker.recordStart;
  const payloadWords = tracker.recordPayloadWords;
  if (start === undefined || payloadWords === undefined) return null;
  const expectedLength = start + CMD_HEADER_WORDS + payloadWords * repeatCount;
  if (script.length !== expectedLength) return null;
  if (repeatCount <= MAX_CMD_REPEAT) {
    if (script.length + payload.length > SCRIPT_WORD_CAPACITY) return null;
    script[start] = (eventId & 0x0fff) + (repeatCount << C.QL_CMD_COUNT_SHIFT);
    script.push(...payload.map(u16));
  } else {
    // The C buffer temporarily accepts one repeat beyond the retained four, then
    // shifts out the oldest body and overwrites the last retained body.
    for (let i = 0; i < MAX_CMD_REPEAT; i++) {
      const from = start + CMD_HEADER_WORDS + (i + 1) * payloadWords;
      const to = start + CMD_HEADER_WORDS + i * payloadWords;
      for (let j = 0; j < payloadWords; j++) script[to + j] = script[from + j]!;
    }
    const lastBody = start + CMD_HEADER_WORDS + MAX_CMD_REPEAT * payloadWords;
    for (let j = 0; j < payloadWords; j++) script[lastBody + j] = u16(payload[j]);
    script[start] = (eventId & 0x0fff) + (MAX_CMD_REPEAT << C.QL_CMD_COUNT_SHIFT);
  }
  return script.length;
}

type EventData = Record<string, number | boolean>;
type Recorder = (script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData) => number | null;

function record(eventId: number, payload: readonly number[], script: number[], actionIndex: number, tracker: QuestLogEventRepeatState): number | null {
  return RecordEventHeader(script, eventId, actionIndex, payload, tracker);
}

/** RecordEvent_SwitchedPartyOrder. */
export function RecordEvent_SwitchedPartyOrder(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(C.QL_EVENT_SWITCHED_PARTY_ORDER, [u16(data.species1 as number), u16(data.species2 as number)], script, actionIndex, tracker);
}

/** RecordEvent_UsedItem. */
export function RecordEvent_UsedItem(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(C.QL_EVENT_USED_ITEM, [u16(data.itemId as number), u16(data.species as number), u16(data.itemParam as number)], script, actionIndex, tracker);
}

/** RecordEvent_GiveTakeHeldItem. */
export function RecordEvent_GiveTakeHeldItem(eventId: number, script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(eventId, [u16(data.itemId as number), u16(data.species as number)], script, actionIndex, tracker);
}

/** RecordEvent_GaveHeldItemFromPartyMenu. */
export const RecordEvent_GaveHeldItemFromPartyMenu: Recorder = (script, actionIndex, tracker, data) => RecordEvent_GiveTakeHeldItem(C.QL_EVENT_GAVE_HELD_ITEM, script, actionIndex, tracker, data);
/** RecordEvent_GaveHeldItemFromBagMenu. */
export const RecordEvent_GaveHeldItemFromBagMenu: Recorder = (script, actionIndex, tracker, data) => RecordEvent_GiveTakeHeldItem(C.QL_EVENT_GAVE_HELD_ITEM_BAG, script, actionIndex, tracker, data);
/** RecordEvent_GaveHeldItemFromPC. */
export const RecordEvent_GaveHeldItemFromPC: Recorder = (script, actionIndex, tracker, data) => RecordEvent_GiveTakeHeldItem(C.QL_EVENT_GAVE_HELD_ITEM_PC, script, actionIndex, tracker, data);
/** RecordEvent_TookHeldItem. */
export const RecordEvent_TookHeldItem: Recorder = (script, actionIndex, tracker, data) => RecordEvent_GiveTakeHeldItem(C.QL_EVENT_TOOK_HELD_ITEM, script, actionIndex, tracker, data);

/** RecordEvent_DepositedItemInPC. */
export function RecordEvent_DepositedItemInPC(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(C.QL_EVENT_DEPOSITED_ITEM_PC, [u16(data.itemId as number)], script, actionIndex, tracker);
}
/** RecordEvent_WithdrewItemFromPC. */
export function RecordEvent_WithdrewItemFromPC(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(C.QL_EVENT_WITHDREW_ITEM_PC, [u16(data.itemId as number)], script, actionIndex, tracker);
}

/** RecordEvent_SwappedHeldItem. */
export function RecordEvent_SwappedHeldItem(eventId: number, script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(eventId, [u16(data.takenItemId as number), u16(data.givenItemId as number), u16(data.species as number)], script, actionIndex, tracker);
}

/** RecordEvent_SwappedHeldItemFromBag. */
export const RecordEvent_SwappedHeldItemFromBag: Recorder = (script, actionIndex, tracker, data) => RecordEvent_SwappedHeldItem(C.QL_EVENT_SWAPPED_HELD_ITEM, script, actionIndex, tracker, data);
/** RecordEvent_SwappedHeldItemFromPC. */
export const RecordEvent_SwappedHeldItemFromPC: Recorder = (script, actionIndex, tracker, data) => RecordEvent_SwappedHeldItem(C.QL_EVENT_SWAPPED_HELD_ITEM_PC, script, actionIndex, tracker, data);

/** RecordEvent_UsedPkmnCenter. */
export function RecordEvent_UsedPkmnCenter(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState): number | null {
  return record(C.QL_EVENT_USED_PKMN_CENTER, [], script, actionIndex, tracker);
}

/** RecordEvent_DefeatedTrainer. */
export function RecordEvent_DefeatedTrainer(eventId: number, script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(eventId, [u16(data.speciesOpponent as number), u16(data.speciesPlayer as number), u16(data.trainerId as number),
    u16(u16(data.mapSec as number) | (u16(data.hpFractionId as number) << 8))], script, actionIndex, tracker);
}

/** RecordEvent_DefeatedGymLeader. */
export const RecordEvent_DefeatedGymLeader: Recorder = (script, actionIndex, tracker, data) => RecordEvent_DefeatedTrainer(C.QL_EVENT_DEFEATED_GYM_LEADER, script, actionIndex, tracker, data);
/** RecordEvent_DefeatedEliteFourMember. */
export const RecordEvent_DefeatedEliteFourMember: Recorder = (script, actionIndex, tracker, data) => RecordEvent_DefeatedTrainer(C.QL_EVENT_DEFEATED_E4_MEMBER, script, actionIndex, tracker, data);
/** RecordEvent_DefeatedChampion: the source stores one payload and replays it three times. */
export const RecordEvent_DefeatedChampion: Recorder = (script, actionIndex, tracker, data) => {
  UpdateRepeatEventCounter(C.QL_EVENT_DEFEATED_CHAMPION, actionIndex, tracker);
  if (script.length + 5 > SCRIPT_WORD_CAPACITY) return null;
  script.push(C.QL_EVENT_DEFEATED_CHAMPION | (2 << C.QL_CMD_COUNT_SHIFT), actionIndex & 0xffff,
    u16(data.speciesOpponent as number), u16(data.speciesPlayer as number), u16(data.hpFractionId as number));
  return script.length;
};
/** RecordEvent_DefeatedNormalTrainer. */
export const RecordEvent_DefeatedNormalTrainer: Recorder = (script, actionIndex, tracker, data) => RecordEvent_DefeatedTrainer(C.QL_EVENT_DEFEATED_TRAINER, script, actionIndex, tracker, data);

/** RecordEvent_DefeatedWildMon. */
export function RecordEvent_DefeatedWildMon(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  UpdateRepeatEventCounter(C.QL_EVENT_DEFEATED_WILD_MON, actionIndex, tracker);
  const previous = tracker.wildRecordStart;
  if (previous !== undefined) {
    const countWord = previous + 4;
    if (data.defeatedSpecies !== C.SPECIES_NONE) {
      script[previous + 2] = u16(data.defeatedSpecies as number);
      script[countWord] = (script[countWord]! & 0xff00) | Math.min((script[countWord]! & 0xff) + 1, 0xff);
    }
    if (data.caughtSpecies !== C.SPECIES_NONE) {
      script[previous + 3] = u16(data.caughtSpecies as number);
      script[countWord] = (script[countWord]! & 0x00ff) | (Math.min(((script[countWord]! >>> 8) & 0xff) + 1, 0xff) << 8);
    }
    script[previous + 5] = u16(data.mapSec as number);
    return script.length;
  }
  if (script.length + 6 > SCRIPT_WORD_CAPACITY) return null;
  tracker.wildRecordStart = script.length;
  script.push(C.QL_EVENT_DEFEATED_WILD_MON, actionIndex & 0xffff,
    u16(data.defeatedSpecies as number), u16(data.caughtSpecies as number),
    Number(data.defeatedSpecies !== C.SPECIES_NONE) | (Number(data.caughtSpecies !== C.SPECIES_NONE) << 8),
    u16(data.mapSec as number));
  return script.length;
}

/** RecordEvent_DepartedLocation. */
export function RecordEvent_DepartedLocation(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(C.QL_EVENT_DEPARTED, [u16(u16(data.mapSec as number) | (u16(data.locationId as number) << 8))], script, actionIndex, tracker);
}

/** RecordEvent_UsedFieldMove. */
export function RecordEvent_UsedFieldMove(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(C.QL_EVENT_USED_FIELD_MOVE, [u16(data.species as number), u16(u16(data.fieldMove as number) | (u16(data.mapSec as number) << 8))], script, actionIndex, tracker);
}

/** RecordEvent_BoughtItem. The C writer always sets the transaction byte. */
export function RecordEvent_BoughtItem(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  const money = Number(data.totalMoney) >>> 0;
  return record(C.QL_EVENT_BOUGHT_ITEM, [u16(data.lastItemId as number), u16(data.itemQuantity as number), money >>> 16, money,
    u16(u16(data.mapSec as number) | (1 << 8))], script, actionIndex, tracker);
}

/** RecordEvent_SoldItem. */
export function RecordEvent_SoldItem(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  const money = Number(data.totalMoney) >>> 0;
  return record(C.QL_EVENT_SOLD_ITEM, [u16(data.lastItemId as number), u16(data.itemQuantity as number), money >>> 16, money,
    u16(u16(data.mapSec as number) | (Number(data.hasMultipleTransactions) << 8))], script, actionIndex, tracker);
}

/** RecordEvent_ObtainedStoryItem. */
export function RecordEvent_ObtainedStoryItem(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(C.QL_EVENT_OBTAINED_STORY_ITEM, [u16(data.itemId as number), u16(data.mapSec as number)], script, actionIndex, tracker);
}

function packBytes(first: number, second = 0): number {
  return (first & 0xff) | ((second & 0xff) << 8);
}

/** RecordEvent_SwitchedMonsBetweenBoxes / RecordEvent_SwitchedMonsWithinBox. */
export function RecordEvent_SwitchedMons(eventId: number, script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(eventId, [u16(data.species1 as number), u16(data.species2 as number), packBytes(data.box1 as number, data.box2 as number)], script, actionIndex, tracker);
}

/** RecordEvent_SwitchedPartyMonForPCMon. */
export function RecordEvent_SwitchedPartyMonForPCMon(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  const partyIndex = C.TOTAL_BOXES_COUNT;
  const partyMonIsFirst = data.box1 === partyIndex;
  const species1 = partyMonIsFirst ? data.species2 as number : data.species1 as number;
  const species2 = partyMonIsFirst ? data.species1 as number : data.species2 as number;
  const box = partyMonIsFirst ? data.box2 as number : data.box1 as number;
  return record(C.QL_EVENT_SWITCHED_PARTY_MON_FOR_PC_MON, [u16(species1), u16(species2), packBytes(box)], script, actionIndex, tracker);
}

/** RecordEvent_MovedMonBetweenBoxes. */
export function RecordEvent_MovedMonBetweenBoxes(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(C.QL_EVENT_MOVED_MON_BETWEEN_BOXES, [u16(data.species1 as number), packBytes(data.box1 as number, data.box2 as number)], script, actionIndex, tracker);
}

/** RecordEvent_MovedMonWithinBox / RecordEvent_WithdrewMonFromPC / RecordEvent_DepositedMonInPC. */
export function RecordEvent_MovedMon(eventId: number, script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(eventId, [u16(data.species1 as number), packBytes(data.box1 as number)], script, actionIndex, tracker);
}

/** RecordEvent_SwitchedMultipleMons. */
export function RecordEvent_SwitchedMultipleMons(script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  return record(C.QL_EVENT_SWITCHED_MULTIPLE_MONS, [packBytes(data.box1 as number, data.box2 as number)], script, actionIndex, tracker);
}

/** RecordQuestLogEvent: the active single-player event writers from quest_log_events.c. */
export function RecordQuestLogEvent(eventId: number, script: number[], actionIndex: number, tracker: QuestLogEventRepeatState, data: EventData): number | null {
  switch (eventId) {
    case C.QL_EVENT_SWITCHED_PARTY_ORDER: return RecordEvent_SwitchedPartyOrder(script, actionIndex, tracker, data);
    case C.QL_EVENT_USED_ITEM: return RecordEvent_UsedItem(script, actionIndex, tracker, data);
    case C.QL_EVENT_GAVE_HELD_ITEM: return RecordEvent_GaveHeldItemFromPartyMenu(script, actionIndex, tracker, data);
    case C.QL_EVENT_GAVE_HELD_ITEM_BAG: return RecordEvent_GaveHeldItemFromBagMenu(script, actionIndex, tracker, data);
    case C.QL_EVENT_GAVE_HELD_ITEM_PC: return RecordEvent_GaveHeldItemFromPC(script, actionIndex, tracker, data);
    case C.QL_EVENT_TOOK_HELD_ITEM: return RecordEvent_TookHeldItem(script, actionIndex, tracker, data);
    case C.QL_EVENT_DEPOSITED_ITEM_PC: return RecordEvent_DepositedItemInPC(script, actionIndex, tracker, data);
    case C.QL_EVENT_WITHDREW_ITEM_PC: return RecordEvent_WithdrewItemFromPC(script, actionIndex, tracker, data);
    case C.QL_EVENT_SWAPPED_HELD_ITEM: return RecordEvent_SwappedHeldItemFromBag(script, actionIndex, tracker, data);
    case C.QL_EVENT_SWAPPED_HELD_ITEM_PC: return RecordEvent_SwappedHeldItemFromPC(script, actionIndex, tracker, data);
    case C.QL_EVENT_USED_PKMN_CENTER: return RecordEvent_UsedPkmnCenter(script, actionIndex, tracker);
    case C.QL_EVENT_DEFEATED_GYM_LEADER: return RecordEvent_DefeatedGymLeader(script, actionIndex, tracker, data);
    case C.QL_EVENT_DEFEATED_WILD_MON: return RecordEvent_DefeatedWildMon(script, actionIndex, tracker, data);
    case C.QL_EVENT_DEFEATED_E4_MEMBER: return RecordEvent_DefeatedEliteFourMember(script, actionIndex, tracker, data);
    case C.QL_EVENT_DEFEATED_CHAMPION: return RecordEvent_DefeatedChampion(script, actionIndex, tracker, data);
    case C.QL_EVENT_DEFEATED_TRAINER: return RecordEvent_DefeatedNormalTrainer(script, actionIndex, tracker, data);
    case C.QL_EVENT_DEPARTED: return RecordEvent_DepartedLocation(script, actionIndex, tracker, data);
    case C.QL_EVENT_USED_FIELD_MOVE: return RecordEvent_UsedFieldMove(script, actionIndex, tracker, data);
    case C.QL_EVENT_BOUGHT_ITEM: return RecordEvent_BoughtItem(script, actionIndex, tracker, data);
    case C.QL_EVENT_SOLD_ITEM: return RecordEvent_SoldItem(script, actionIndex, tracker, data);
    case C.QL_EVENT_OBTAINED_STORY_ITEM: return RecordEvent_ObtainedStoryItem(script, actionIndex, tracker, data);
    case C.QL_EVENT_SWITCHED_MONS_BETWEEN_BOXES:
    case C.QL_EVENT_SWITCHED_MONS_WITHIN_BOX: return RecordEvent_SwitchedMons(eventId, script, actionIndex, tracker, data);
    case C.QL_EVENT_SWITCHED_PARTY_MON_FOR_PC_MON: return RecordEvent_SwitchedPartyMonForPCMon(script, actionIndex, tracker, data);
    case C.QL_EVENT_MOVED_MON_BETWEEN_BOXES: return RecordEvent_MovedMonBetweenBoxes(script, actionIndex, tracker, data);
    case C.QL_EVENT_MOVED_MON_WITHIN_BOX:
    case C.QL_EVENT_WITHDREW_MON_PC:
    case C.QL_EVENT_DEPOSITED_MON_PC: return RecordEvent_MovedMon(eventId, script, actionIndex, tracker, data);
    case C.QL_EVENT_SWITCHED_MULTIPLE_MONS: return RecordEvent_SwitchedMultipleMons(script, actionIndex, tracker, data);
    default: return null;
  }
}

/** QL_SkipCommand (quest_log_events.c), for the single-player command families encoded above. */
export function QL_SkipCommand(script: readonly number[], cursor: number): number | null {
  if (cursor < 0 || cursor >= script.length) return null;
  const header = u16(script[cursor]);
  const eventId = header & 0x0fff;
  let repeats = header >>> C.QL_CMD_COUNT_SHIFT;
  if (eventId === C.QL_EVENT_DEFEATED_CHAMPION) repeats = 0;
  const baseBytes = eventId === C.QL_EVENT_INPUT || eventId === C.QL_EVENT_GFX_CHANGE || eventId === C.QL_EVENT_MOVEMENT ? 8
    : eventId === C.QL_EVENT_WAIT ? 4
      : eventId === C.QL_EVENT_SCENE_END ? 2
        : eventId === C.QL_EVENT_SWITCHED_PARTY_ORDER || eventId === C.QL_EVENT_GAVE_HELD_ITEM
          || eventId === C.QL_EVENT_GAVE_HELD_ITEM_BAG || eventId === C.QL_EVENT_GAVE_HELD_ITEM_PC
          || eventId === C.QL_EVENT_TOOK_HELD_ITEM || eventId === C.QL_EVENT_USED_FIELD_MOVE ? 8
          : eventId === C.QL_EVENT_USED_ITEM || eventId === C.QL_EVENT_SWAPPED_HELD_ITEM
            || eventId === C.QL_EVENT_SWAPPED_HELD_ITEM_PC ? 10
            : eventId === C.QL_EVENT_USED_PKMN_CENTER ? 4
                          : eventId === C.QL_EVENT_DEPOSITED_ITEM_PC || eventId === C.QL_EVENT_WITHDREW_ITEM_PC ? 6
                : eventId === C.QL_EVENT_MOVED_MON_BETWEEN_BOXES || eventId === C.QL_EVENT_MOVED_MON_WITHIN_BOX
                  || eventId === C.QL_EVENT_WITHDREW_MON_PC || eventId === C.QL_EVENT_DEPOSITED_MON_PC ? 8
                  : eventId === C.QL_EVENT_SWITCHED_MONS_BETWEEN_BOXES || eventId === C.QL_EVENT_SWITCHED_MONS_WITHIN_BOX
                    || eventId === C.QL_EVENT_SWITCHED_PARTY_MON_FOR_PC_MON ? 10
                    : eventId === C.QL_EVENT_SWITCHED_MULTIPLE_MONS ? 6
                : eventId === C.QL_EVENT_DEFEATED_GYM_LEADER || eventId === C.QL_EVENT_DEFEATED_WILD_MON
                  || eventId === C.QL_EVENT_DEFEATED_E4_MEMBER || eventId === C.QL_EVENT_DEFEATED_TRAINER ? 12
                  : eventId === C.QL_EVENT_DEFEATED_CHAMPION ? 10
                    : eventId === C.QL_EVENT_DEPARTED ? 6
                      : eventId === C.QL_EVENT_BOUGHT_ITEM || eventId === C.QL_EVENT_SOLD_ITEM ? 14
                        : eventId === C.QL_EVENT_OBTAINED_STORY_ITEM ? 8 : 0;
  if (baseBytes === 0) return null;
  const next = cursor + (baseBytes + (baseBytes - 4) * repeats) / 2;
  return next <= script.length ? next : null;
}
