// field_specials.c: AnimateElevator / Task_ElevatorShake and window animation.
// Hosts translate GBA camera/map operations; task order and tables remain shared.
import * as C from "@game/generated/constants";
import { tasks as defaultTasks, type TaskManager } from "../gba/tasks";
import { cdata } from "../hw/assets";
import { MAP_OFFSET, MAPGRID_COLLISION_MASK } from "./fieldmap";

export type ElevatorAnimationHost = {
  stopCameraPanning(): void;
  pan(x: number, y: number): void;
  restoreCameraPanning(): void;
  resumeScript(): void;
  playSE(id: number): void;
  setMetatile(x: number, y: number, value: number): void;
  drawMap(): void;
};

export class ElevatorAnimation {
  private readonly shake = (id: number): void => this.Task_ElevatorShake(id);
  private readonly window = (id: number): void => this.Task_AnimateElevatorWindowView(id);
  constructor(private readonly host: ElevatorAnimationHost, private readonly scheduler: TaskManager = defaultTasks) {}

  AnimateElevator(from: number, to: number): void {
    const data = this.scheduler.data(this.scheduler.create(this.shake, 9));
    data[1] = 0; data[2] = 0; data[4] = 1;
    from &= 0xffff; to &= 0xffff;
    data[6] = from > to ? 1 : 0;
    const nfloors = Math.min(Math.abs(from - to), 8);
    data[5] = cdata<number[]>("field_specials", "sElevatorAnimationDuration")[nfloors]!;
    this.host.stopCameraPanning();
    this.AnimateElevatorWindowView(nfloors, data[6]);
    this.host.playSE(C.SE_ELEVATOR);
  }

  private Task_ElevatorShake(taskId: number): void {
    const data = this.scheduler.data(taskId);
    data[1] = (data[1]! + 1) << 16 >> 16;
    if (data[1]! % 3 !== 0) return;
    data[1] = 0;
    data[2] = (data[2]! + 1) << 16 >> 16;
    data[4] = -data[4]!;
    this.host.pan(0, data[4]);
    if (data[2] === data[5]) {
      this.host.playSE(C.SE_DING_DONG);
      this.scheduler.destroy(taskId);
      this.host.resumeScript();
      this.host.restoreCameraPanning();
    }
  }

  private AnimateElevatorWindowView(nfloors: number, direction: number): void {
    if (this.scheduler.tasks.some(task => task.isActive && task.func === this.window)) return;
    const data = this.scheduler.data(this.scheduler.create(this.window, 8));
    data[0] = 0; data[1] = 0; data[2] = direction;
    data[3] = cdata<number[]>("field_specials", "sElevatorWindowAnimDuration")[nfloors]!;
  }

  private Task_AnimateElevatorWindowView(taskId: number): void {
    const data = this.scheduler.data(taskId);
    if (data[1] === 6) {
      data[0] = (data[0]! + 1) << 16 >> 16;
      const table = cdata<number[][]>("field_specials", data[2] === 0
        ? "sElevatorWindowMetatilesGoingUp" : "sElevatorWindowMetatilesGoingDown");
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        this.host.setMetatile(j + 1 + MAP_OFFSET, i + MAP_OFFSET, table[i]![data[0]! % 3]! | MAPGRID_COLLISION_MASK);
      }
      this.host.drawMap();
      data[1] = 0;
      if (data[0] === data[3]) this.scheduler.destroy(taskId);
    }
    data[1] = (data[1]! + 1) << 16 >> 16;
  }
}
