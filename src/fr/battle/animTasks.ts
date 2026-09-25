// battle_anim.c Cmd_createvisualtask / Cmd_createsoundtask: starts a task by
// its C name. Every task lives in the battle_anim_*.c ports under anims/,
// which register themselves in animRegistry.

import { tasks } from "../gba/tasks";
import { animState, DestroyAnimVisualTask } from "./anim";
import { ANIM_TASK_FUNCS } from "./animRegistry";

const silent = new Set<string>();

/** Stand-in for a task name the ports do not know: ends at once so the script keeps running. */
function MissingAnimTask(taskId: number): void {
  DestroyAnimVisualTask(taskId);
}

export function runAnimTask(name: string, priority: number, soundTask = false): void {
  const fn = ANIM_TASK_FUNCS[name];
  if (!fn && !silent.has(name)) {
    silent.add(name);
    console.warn(`battle anim task not implemented: ${name}`);
  }
  const taskFunc = fn ?? MissingAnimTask;
  const id = tasks.create(taskFunc, priority);
  taskFunc(id);
  if (soundTask) animState.gAnimSoundTaskCount++;
  else animState.gAnimVisualTaskCount++;
}
