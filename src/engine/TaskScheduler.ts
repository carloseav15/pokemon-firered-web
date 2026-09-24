export type EngineTask = {
  id: number;
  priority: number;
  active: boolean;
  update: (deltaMs: number) => boolean | void;
};

export class TaskScheduler {
  private nextId = 1;
  private tasks: EngineTask[] = [];

  create(update: EngineTask["update"], priority = 0): number {
    const task = { id: this.nextId++, priority, active: true, update };
    this.tasks.push(task);
    this.tasks.sort((left, right) => left.priority - right.priority);
    return task.id;
  }

  destroy(id: number): void {
    const task = this.tasks.find((candidate) => candidate.id === id);
    if (task) task.active = false;
  }

  run(deltaMs: number): void {
    for (const task of this.tasks) {
      if (!task.active) continue;
      if (task.update(deltaMs) === true) task.active = false;
    }
    this.tasks = this.tasks.filter((task) => task.active);
  }

  clear(): void {
    this.tasks = [];
  }
}
