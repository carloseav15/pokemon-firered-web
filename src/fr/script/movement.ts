// Port of script_movement.c: task data holds up to OBJECT_EVENTS_COUNT movement
// slots; each slot maps one object-event id to a byte-script pointer and finished bit.

import { tasks } from "../gba/tasks";
import { rom } from "../rom";
import { MOVEMENT_ACTION_STEP_END, type ObjectEvent } from "../field/objectEvents";
import type { Overworld } from "../field/overworld";
import * as C from "../generated/constants";

const MOVEMENT_SLOT_EMPTY = C.LOCALID_PLAYER; // 0xFF is also the C task-data sentinel.
type Entry = { objectId: number; object: ObjectEvent; ptr: number; finished: boolean; bytes?: ArrayLike<number> };

export class ScriptMovement {
  private entries: Array<Entry | undefined> = new Array(C.OBJECT_EVENTS_COUNT).fill(undefined);
  private taskId = -1;

  constructor(private readonly ow: Overworld) {}

  private taskFunc = (taskId: number): void => { this.ScriptMovement_MoveObjects(taskId); };

  /** C public entry: true means the object is missing or all script slots are busy. */
  ScriptMovement_StartObjectMovementScript(localId: number, mapNum: number, mapGroup: number, movementScript: ArrayLike<number>): boolean {
    const object = this.ow.objects.byLocalIdAndMap(localId, mapNum, mapGroup);
    if (!object) return true;
    if (this.GetMoveObjectsTaskId() === 0xff) this.ScriptMovement_StartMoveObjects(50);
    const objectId = this.ow.objects.indexOf(object);
    const failed = this.ScriptMovement_TryAddNewMovement(this.GetMoveObjectsTaskId(), objectId, 0);
    if (!failed) {
      const slot = this.GetMovementScriptIdFromObjectEventId(this.GetMoveObjectsTaskId(), objectId);
      const entry = this.entries[slot];
      if (entry) entry.bytes = movementScript;
    }
    return failed;
  }

  /** ScriptMovement_StartObjectMovementScript for scripts addressed by ROM pointer. */
  start(object: ObjectEvent | undefined, ptr: number): boolean {
    if (!object) return true;
    if (this.GetMoveObjectsTaskId() === 0xff) this.ScriptMovement_StartMoveObjects(50);
    return this.ScriptMovement_TryAddNewMovement(this.GetMoveObjectsTaskId(), this.ow.objects.indexOf(object), ptr);
  }

  /** Movement script supplied as bytes by an event command or adapter. */
  startBytes(object: ObjectEvent | undefined, bytes: ArrayLike<number>): boolean {
    if (!object) return true;
    const failed = this.start(object, 0);
    if (!failed) {
      const slot = this.GetMovementScriptIdFromObjectEventId(this.GetMoveObjectsTaskId(), this.ow.objects.indexOf(object));
      const entry = this.entries[slot];
      if (entry) entry.bytes = bytes;
    }
    return failed;
  }

  /** C public query: missing object or missing slot means finished. */
  ScriptMovement_IsObjectMovementFinished(localId: number, mapNum: number, mapGroup: number): boolean {
    return this.isFinished(this.ow.objects.byLocalIdAndMap(localId, mapNum, mapGroup));
  }

  isFinished(object: ObjectEvent | undefined): boolean {
    if (!object) return true;
    const taskId = this.GetMoveObjectsTaskId();
    if (taskId === 0xff) return true;
    const slot = this.GetMovementScriptIdFromObjectEventId(taskId, this.ow.objects.indexOf(object));
    return slot === C.OBJECT_EVENTS_COUNT || this.IsMovementScriptFinished(taskId, slot);
  }

  /** ScriptMovement_UnfreezeObjectEvents. */
  ScriptMovement_UnfreezeObjectEvents(): void {
    const taskId = this.GetMoveObjectsTaskId();
    if (taskId !== 0xff) {
      this.ScriptMovement_UnfreezeActiveObjects(taskId);
      tasks.destroy(taskId);
    }
    this.taskId = -1;
    this.entries = new Array(C.OBJECT_EVENTS_COUNT).fill(undefined);
  }

  unfreezeAndStop(): void { this.ScriptMovement_UnfreezeObjectEvents(); }

  /** ScriptMovement_StartMoveObjects. */
  ScriptMovement_StartMoveObjects(priority: number): void {
    this.entries = new Array(C.OBJECT_EVENTS_COUNT).fill(undefined);
    this.taskId = tasks.create(this.taskFunc, priority & 0xff);
  }

  /** GetMoveObjectsTaskId. */
  GetMoveObjectsTaskId(): number {
    if (this.taskId < 0 || !tasks.tasks[this.taskId]?.isActive || tasks.tasks[this.taskId].func !== this.taskFunc) return 0xff;
    return this.taskId;
  }

  /** ScriptMovement_TryAddNewMovement. */
  ScriptMovement_TryAddNewMovement(taskId: number, objectId: number, movementScript: number): boolean {
    if (taskId === 0xff || taskId !== this.GetMoveObjectsTaskId() || objectId < 0 || objectId >= C.OBJECT_EVENTS_COUNT) return true;
    let slot = this.GetMovementScriptIdFromObjectEventId(taskId, objectId);
    if (slot !== C.OBJECT_EVENTS_COUNT) {
      if (!this.IsMovementScriptFinished(taskId, slot)) return true;
      this.ScriptMovement_AddNewMovement(taskId, slot, objectId, movementScript);
      return false;
    }
    slot = this.GetMovementScriptIdFromObjectEventId(taskId, MOVEMENT_SLOT_EMPTY);
    if (slot === C.OBJECT_EVENTS_COUNT) return true;
    this.ScriptMovement_AddNewMovement(taskId, slot, objectId, movementScript);
    return false;
  }

  /** GetMovementScriptIdFromObjectEventId (script_movement.c: OBJECT_EVENTS_COUNT when missing). */
  GetMovementScriptIdFromObjectEventId(taskId: number, objectId: number): number {
    if (taskId === 0xff || taskId !== this.GetMoveObjectsTaskId()) return C.OBJECT_EVENTS_COUNT;
    const slot = this.entries.findIndex((entry) => entry?.objectId === (objectId & 0xff));
    return slot < 0 ? C.OBJECT_EVENTS_COUNT : slot;
  }

  /** LoadObjectEventIdPtrFromMovementScript: slot id stands for the task-data byte pointer. */
  LoadObjectEventIdPtrFromMovementScript(taskId: number, moveScriptId: number): { taskId: number; moveScriptId: number } | null {
    if (taskId !== this.GetMoveObjectsTaskId() || moveScriptId < 0 || moveScriptId >= C.OBJECT_EVENTS_COUNT) return null;
    return { taskId, moveScriptId };
  }

  /** SetObjectEventIdAtMovementScript. */
  SetObjectEventIdAtMovementScript(taskId: number, moveScriptId: number, objectId: number): void {
    const ptr = this.LoadObjectEventIdPtrFromMovementScript(taskId, moveScriptId);
    const object = this.ow.objects.objects[objectId];
    if (!ptr || !object) return;
    const old = this.entries[ptr.moveScriptId];
    this.entries[ptr.moveScriptId] = { objectId: objectId & 0xff, object, ptr: old?.ptr ?? 0, finished: old?.finished ?? false, bytes: old?.bytes };
  }

  /** LoadObjectEventIdFromMovementScript. */
  LoadObjectEventIdFromMovementScript(taskId: number, moveScriptId: number): number {
    const ptr = this.LoadObjectEventIdPtrFromMovementScript(taskId, moveScriptId);
    return ptr ? this.entries[ptr.moveScriptId]?.objectId ?? MOVEMENT_SLOT_EMPTY : MOVEMENT_SLOT_EMPTY;
  }

  /** ClearMovementScriptFinished. */
  ClearMovementScriptFinished(taskId: number, moveScriptId: number): void {
    if (taskId === this.GetMoveObjectsTaskId() && this.entries[moveScriptId]) this.entries[moveScriptId]!.finished = false;
  }

  /** SetMovementScriptFinished. */
  SetMovementScriptFinished(taskId: number, moveScriptId: number): void {
    if (taskId === this.GetMoveObjectsTaskId() && this.entries[moveScriptId]) this.entries[moveScriptId]!.finished = true;
  }

  /** IsMovementScriptFinished. */
  IsMovementScriptFinished(taskId: number, moveScriptId: number): boolean {
    return taskId === this.GetMoveObjectsTaskId() && !!this.entries[moveScriptId]?.finished;
  }

  /** SetMovementScript. */
  SetMovementScript(moveScriptId: number, movementScript: number): void {
    const entry = this.entries[moveScriptId];
    if (entry) { entry.ptr = movementScript; entry.bytes = undefined; }
  }

  /** GetMovementScript. */
  GetMovementScript(moveScriptId: number): number { return this.entries[moveScriptId]?.ptr ?? 0; }

  /** ScriptMovement_AddNewMovement. */
  ScriptMovement_AddNewMovement(taskId: number, moveScriptId: number, objectId: number, movementScript: number): void {
    this.ClearMovementScriptFinished(taskId, moveScriptId);
    this.SetMovementScript(moveScriptId, movementScript);
    this.SetObjectEventIdAtMovementScript(taskId, moveScriptId, objectId);
  }

  /** ScriptMovement_UnfreezeActiveObjects. */
  ScriptMovement_UnfreezeActiveObjects(taskId: number): void {
    if (taskId !== this.GetMoveObjectsTaskId()) return;
    for (const entry of this.entries) if (entry && entry.objectId !== MOVEMENT_SLOT_EMPTY) this.ow.objects.unfreeze(entry.object);
  }

  /** ScriptMovement_MoveObjects. */
  ScriptMovement_MoveObjects(taskId: number): void {
    if (taskId !== this.GetMoveObjectsTaskId()) return;
    for (let slot = 0; slot < C.OBJECT_EVENTS_COUNT; slot++) {
      const objectId = this.LoadObjectEventIdFromMovementScript(taskId, slot);
      if (objectId !== MOVEMENT_SLOT_EMPTY) this.ScriptMovement_TakeStep(taskId, slot, objectId, this.GetMovementScript(slot));
    }
  }

  /** ScriptMovement_TakeStep. */
  ScriptMovement_TakeStep(taskId: number, moveScriptId: number, objectId: number, movementScript: number): void {
    if (this.IsMovementScriptFinished(taskId, moveScriptId)) return;
    const entry = this.entries[moveScriptId];
    const object = this.ow.objects.objects[objectId];
    if (!entry || !object || entry.objectId !== objectId) return;
    if (object.heldMovementActive && !this.ow.objects.ObjectEventClearHeldMovementIfFinished(object)) return;
    const next = entry.bytes ? (entry.bytes[entry.ptr] ?? MOVEMENT_ACTION_STEP_END) : rom.u8(movementScript);
    if (next === MOVEMENT_ACTION_STEP_END) {
      this.SetMovementScriptFinished(taskId, moveScriptId);
      this.ow.objects.freeze(object);
    } else if (!this.ow.objects.setHeldMovement(object, next)) {
      entry.ptr++;
    }
  }
}
