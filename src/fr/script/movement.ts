// Port of script_movement.c: applymovement runs a movement byte script on an
// object, one movement action at a time, from a task.

import { tasks } from "../gba/tasks";
import { rom } from "../rom";
import { MOVEMENT_ACTION_STEP_END, type ObjectEvent } from "../field/objectEvents";
import type { Overworld } from "../field/overworld";

type Entry = { object: ObjectEvent; ptr: number; finished: boolean; bytes?: ArrayLike<number> };

export class ScriptMovement {
  private entries: Entry[] = [];
  private taskId = -1;

  constructor(private readonly ow: Overworld) {}

  private ensureTask(): void {
    if (this.taskId >= 0 && tasks.tasks[this.taskId].isActive && tasks.tasks[this.taskId].func === this.taskFunc) return;
    this.entries = [];
    this.taskId = tasks.create(this.taskFunc, 50);
  }

  private taskFunc = (): void => {
    for (const entry of this.entries) this.takeStep(entry);
  };

  /** Start a movement script held in C data (a byte array) rather than the script ROM. */
  startBytes(object: ObjectEvent | undefined, bytes: ArrayLike<number>): boolean {
    if (this.start(object, 0)) return true;
    const entry = this.entries.find((e) => e.object === object);
    if (entry) entry.bytes = bytes;
    return false;
  }

  /** ScriptMovement_StartObjectMovementScript: true on failure */
  start(object: ObjectEvent | undefined, ptr: number): boolean {
    if (!object) return true;
    this.ensureTask();
    const existing = this.entries.find((e) => e.object === object);
    if (existing) {
      if (!existing.finished) return true;
      existing.ptr = ptr;
      existing.bytes = undefined;
      existing.finished = false;
      return false;
    }
    if (this.entries.length >= 16) return true;
    this.entries.push({ object, ptr, finished: false });
    return false;
  }

  isFinished(object: ObjectEvent | undefined): boolean {
    if (!object) return true;
    if (this.taskId < 0 || !tasks.tasks[this.taskId].isActive) return true;
    const entry = this.entries.find((e) => e.object === object);
    if (!entry) return true;
    return entry.finished;
  }

  /** ScriptMovement_UnfreezeObjectEvents */
  unfreezeAndStop(): void {
    if (this.taskId >= 0 && tasks.tasks[this.taskId].isActive && tasks.tasks[this.taskId].func === this.taskFunc) {
      for (const entry of this.entries) {
        if (entry.object.frozen) {
          entry.object.frozen = false;
          entry.object.sprite.animPaused = entry.object.animPausedBackup;
        }
      }
      tasks.destroy(this.taskId);
    }
    this.taskId = -1;
    this.entries = [];
  }

  private takeStep(entry: Entry): void {
    if (entry.finished) return;
    const o = entry.object;
    const objects = this.ow.objects;
    if (o.heldMovementActive && !objects.clearHeldMovementIfFinished(o)) return;
    const next = entry.bytes ? (entry.bytes[entry.ptr] ?? MOVEMENT_ACTION_STEP_END) : rom.u8(entry.ptr);
    if (next === MOVEMENT_ACTION_STEP_END) {
      entry.finished = true;
      objects.freeze(o);
    } else if (!objects.setHeldMovement(o, next)) {
      entry.ptr++;
    }
  }
}
