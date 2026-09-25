// task.c: a priority-ordered list of per-frame task functions with data[16].

export type TaskFunc = (taskId: number) => void;

export type Task = { func: TaskFunc; priority: number; data: number[]; isActive: boolean; prev: number; next: number; followup?: TaskFunc };

export const NUM_TASKS = 16;
const HEAD_SENTINEL = 0xfe;
export const TAIL_SENTINEL = 0xff;
export const TaskDummy: TaskFunc = () => {};

class TaskManager {
  readonly tasks: Task[] = Array.from({ length: NUM_TASKS }, (_, i) => ({ func: TaskDummy, priority: -1, data: new Array(16).fill(0), isActive: false, prev: i, next: i + 1 }));

  create(func: TaskFunc, priority: number): number {
    for (let i = 0; i < NUM_TASKS; i++) {
      if (!this.tasks[i].isActive) {
        const task = this.tasks[i];
        task.func = func;
        task.priority = priority;
        task.data.fill(0);
        task.followup = undefined;
        this.insert(i);
        task.isActive = true;
        return i;
      }
    }
    return 0;
  }

  private firstActive(): number {
    for (let i = 0; i < NUM_TASKS; i++) if (this.tasks[i].isActive && this.tasks[i].prev === HEAD_SENTINEL) return i;
    return NUM_TASKS;
  }

  private insert(newTaskId: number): void {
    let id = this.firstActive();
    if (id === NUM_TASKS) {
      this.tasks[newTaskId].prev = HEAD_SENTINEL;
      this.tasks[newTaskId].next = TAIL_SENTINEL;
      return;
    }
    while (true) {
      if (this.tasks[newTaskId].priority < this.tasks[id].priority) {
        const previous = this.tasks[id].prev;
        this.tasks[newTaskId].prev = previous;
        this.tasks[newTaskId].next = id;
        if (previous !== HEAD_SENTINEL) this.tasks[previous].next = newTaskId;
        this.tasks[id].prev = newTaskId;
        return;
      }
      if (this.tasks[id].next === TAIL_SENTINEL) {
        this.tasks[newTaskId].prev = id;
        this.tasks[newTaskId].next = TAIL_SENTINEL;
        this.tasks[id].next = newTaskId;
        return;
      }
      id = this.tasks[id].next;
    }
  }

  destroy(taskId: number): void {
    if (taskId < 0 || taskId >= NUM_TASKS) return;
    const task = this.tasks[taskId];
    if (!task.isActive) return;
    task.isActive = false;
    if (task.prev === HEAD_SENTINEL) {
      if (task.next !== TAIL_SENTINEL) this.tasks[task.next].prev = HEAD_SENTINEL;
    } else if (task.next === TAIL_SENTINEL) {
      this.tasks[task.prev].next = TAIL_SENTINEL;
    } else {
      this.tasks[task.prev].next = task.next;
      this.tasks[task.next].prev = task.prev;
    }
  }

  reset(): void {
    for (let i = 0; i < NUM_TASKS; i++) {
      const task = this.tasks[i];
      task.isActive = false;
      task.func = TaskDummy;
      task.prev = i;
      task.next = i + 1;
      task.priority = -1;
      task.data.fill(0);
      task.followup = undefined;
    }
    this.tasks[0].prev = HEAD_SENTINEL;
    this.tasks[NUM_TASKS - 1].next = TAIL_SENTINEL;
  }

  run(): void {
    let id = this.firstActive();
    if (id === NUM_TASKS) return;
    do {
      this.tasks[id].func(id);
      id = this.tasks[id].next;
    } while (id !== TAIL_SENTINEL);
  }

  findByFunc(func: TaskFunc): number {
    for (let i = 0; i < NUM_TASKS; i++) if (this.tasks[i].isActive && this.tasks[i].func === func) return i;
    return TAIL_SENTINEL;
  }

  isActive(func: TaskFunc): boolean {
    return this.findByFunc(func) !== TAIL_SENTINEL;
  }

  count(): number {
    return this.tasks.reduce((count, task) => count + (task.isActive ? 1 : 0), 0);
  }

  setWordArg(taskId: number, dataElem: number, value: number): void {
    if (dataElem <= 14) {
      this.tasks[taskId].data[dataElem] = value & 0xffff;
      this.tasks[taskId].data[dataElem + 1] = value >>> 16;
    }
  }

  getWordArg(taskId: number, dataElem: number): number {
    if (dataElem > 14) return 0;
    return ((this.tasks[taskId].data[dataElem] & 0xffff) | (this.tasks[taskId].data[dataElem + 1] << 16)) >>> 0;
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
