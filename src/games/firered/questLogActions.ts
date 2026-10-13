// quest_log_events.c: Quest Log action script encoding. The GBA save reserves 128 u16 words per scene.

import * as C from "./generated/constants";

export type QuestLogAction = {
  type: number;
  duration: number;
  data: [number, number, number, number];
};
export type LoadedQuestLogAction = { action: QuestLogAction; next: number };

const SCRIPT_CAPACITY_BYTES = 128 * 2;

function hasRoom(script: readonly number[], cursor: number, bytes: number): boolean {
  return cursor >= 0 && cursor <= script.length && (cursor * 2 + bytes <= SCRIPT_CAPACITY_BYTES);
}

/** QL_IsRoomToSaveEvent (quest_log.c), with the scene script and offset standing in for the C pointer. */
export function QL_IsRoomToSaveEvent(script: readonly number[], cursor: number, size: number): boolean {
  return hasRoom(script, cursor, size);
}

/** QL_IsRoomToSaveAction (quest_log.c): identical room check for action records. */
export function QL_IsRoomToSaveAction(script: readonly number[], cursor: number, size: number): boolean {
  return hasRoom(script, cursor, size);
}

function hasStored(script: readonly number[], cursor: number, bytes: number): boolean {
  return cursor >= 0 && cursor + bytes / 2 <= script.length;
}

function packBytes(data: readonly number[]): [number, number] {
  return [((data[0] ?? 0) & 0xff) | (((data[1] ?? 0) & 0xff) << 8), ((data[2] ?? 0) & 0xff) | (((data[3] ?? 0) & 0xff) << 8)];
}

function unpackWords(script: readonly number[], cursor: number): [number, number, number, number] {
  const first = script[cursor + 2] ?? 0, second = script[cursor + 3] ?? 0;
  return [first & 0xff, (first >>> 8) & 0xff, second & 0xff, (second >>> 8) & 0xff];
}

/** QL_RecordAction_SceneEnd: writes the 2-byte scene-end command. */
export function QL_RecordAction_SceneEnd(script: number[], cursor = script.length): number | null {
  if (!QL_IsRoomToSaveAction(script, cursor, 2)) return null;
  script[cursor] = C.QL_EVENT_SCENE_END;
  return cursor + 1;
}

/** QL_LoadAction_SceneEnd. */
export function QL_LoadAction_SceneEnd(script: readonly number[], cursor: number): LoadedQuestLogAction | null {
  if (!hasStored(script, cursor, 2) || script[cursor] !== C.QL_EVENT_SCENE_END) return null;
  return { action: { type: C.QL_ACTION_SCENE_END, duration: 0, data: [0, 0, 0, 0] }, next: cursor + 1 };
}

/** QL_RecordAction_Wait. */
export function QL_RecordAction_Wait(script: number[], duration: number, cursor = script.length): number | null {
  if (!QL_IsRoomToSaveAction(script, cursor, 4)) return null;
  script[cursor] = C.QL_EVENT_WAIT;
  script[cursor + 1] = duration & 0xffff;
  return cursor + 2;
}

/** QL_LoadAction_Wait. */
export function QL_LoadAction_Wait(script: readonly number[], cursor: number): LoadedQuestLogAction | null {
  if (!hasStored(script, cursor, 4) || script[cursor] !== C.QL_EVENT_WAIT) return null;
  return { action: { type: C.QL_ACTION_WAIT, duration: script[cursor + 1] & 0xffff, data: [0, 0, 0, 0] }, next: cursor + 2 };
}

/** QL_RecordAction_Input. Data bytes match the four-byte FieldInput union. */
export function QL_RecordAction_Input(script: number[], action: QuestLogAction, cursor = script.length): number | null {
  if (!QL_IsRoomToSaveAction(script, cursor, 8)) return null;
  const [a, b] = packBytes(action.data);
  script[cursor] = C.QL_EVENT_INPUT;
  script[cursor + 1] = action.duration & 0xffff;
  script[cursor + 2] = a;
  script[cursor + 3] = b;
  return cursor + 4;
}

/** QL_LoadAction_Input. */
export function QL_LoadAction_Input(script: readonly number[], cursor: number): LoadedQuestLogAction | null {
  if (!hasStored(script, cursor, 8) || script[cursor] !== C.QL_EVENT_INPUT) return null;
  return { action: { type: C.QL_ACTION_INPUT, duration: script[cursor + 1] & 0xffff, data: unpackWords(script, cursor) }, next: cursor + 4 };
}

/** QL_RecordAction_MovementOrGfxChange. */
export function QL_RecordAction_MovementOrGfxChange(script: number[], action: QuestLogAction, cursor = script.length): number | null {
  if (!QL_IsRoomToSaveAction(script, cursor, 8)) return null;
  const [a, b] = packBytes(action.data);
  script[cursor] = action.type === C.QL_ACTION_MOVEMENT ? C.QL_EVENT_MOVEMENT : C.QL_EVENT_GFX_CHANGE;
  script[cursor + 1] = action.duration & 0xffff;
  script[cursor + 2] = a;
  script[cursor + 3] = b;
  return cursor + 4;
}

/** QL_LoadAction_MovementOrGfxChange. */
export function QL_LoadAction_MovementOrGfxChange(script: readonly number[], cursor: number): LoadedQuestLogAction | null {
  if (!hasRoom(script, cursor, 8)) return null;
  const cmd = script[cursor];
  if (cmd !== C.QL_EVENT_MOVEMENT && cmd !== C.QL_EVENT_GFX_CHANGE) return null;
  return {
    action: { type: cmd === C.QL_EVENT_MOVEMENT ? C.QL_ACTION_MOVEMENT : C.QL_ACTION_GFX_CHANGE, duration: script[cursor + 1] & 0xffff, data: unpackWords(script, cursor) },
    next: cursor + 4,
  };
}
