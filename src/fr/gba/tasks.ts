// task.c: a priority-ordered list of per-frame task functions with data[16].

export type TaskFunc = (taskId: number) => void;

export type Task = { func: TaskFunc; priority: number; data: number[]; isActive: boolean; followup?: TaskFunc };

export const NUM_TASKS = 16;
export const TAIL_SENTINEL = 0xff;

class TaskManager {
  readonly tasks: Task[] = Array.from({ length: NUM_TASKS }, () => ({ func: () => {}, priority: 0, data: new Array(16).fill(0), isActive: false }));

  create(func: TaskFunc, priority: number): number {
    for (let i = 0; i < NUM_TASKS; i++) {
      if (!this.tasks[i].isActive) {
        this.tasks[i] = { func, priority, data: new Array(16).fill(0), isActive: true };
        return i;
      }
    }
    // Out of slots: behave like the GBA and reuse the last one.
    this.tasks[NUM_TASKS - 1] = { func, priority, data: new Array(16).fill(0), isActive: true };
    return NUM_TASKS - 1;
  }

  destroy(taskId: number): void {
    if (taskId >= 0 && taskId < NUM_TASKS) this.tasks[taskId].isActive = false;
  }

  reset(): void {
    for (const task of this.tasks) task.isActive = false;
  }

  run(): void {
    const order = this.tasks
      .map((task, id) => ({ task, id }))
      .filter((entry) => entry.task.isActive)
      .sort((a, b) => a.task.priority - b.task.priority || a.id - b.id);
    for (const { task, id } of order) {
      if (task.isActive) task.func(id);
    }
  }

  findByFunc(func: TaskFunc): number {
    for (let i = 0; i < NUM_TASKS; i++) if (this.tasks[i].isActive && this.tasks[i].func === func) return i;
    return TAIL_SENTINEL;
  }

  isActive(func: TaskFunc): boolean {
    return this.findByFunc(func) !== TAIL_SENTINEL;
  }

  data(taskId: number): number[] {
    return this.tasks[taskId].data;
  }

  /** Save/restore the task table (the field's tasks survive a battle scene). */
  snapshot(): Task[] {
    return this.tasks.map((t) => ({ ...t, data: [...t.data] }));
  }

  restore(saved: Task[]): void {
    for (let i = 0; i < NUM_TASKS; i++) this.tasks[i] = saved[i];
  }

  setFunc(taskId: number, func: TaskFunc): void {
    this.tasks[taskId].func = func;
  }
}

export const tasks = new TaskManager();
