// field_effect.c Task_FallWarpFieldEffect and all seven callbacks.
import * as C from "@game/generated/constants";
import { tasks } from "../gba/tasks";
import type { ObjectEvent } from "./objectEvents";
export type FallObject = Pick<ObjectEvent,"facingDirection"|"invisible"|"fixedPriority"|"triggerGroundEffectsOnMove"|"triggerGroundEffectsOnStop"|"landingJump"> & {
  sprite: Pick<ObjectEvent["sprite"],"y2"|"centerToCornerVecY"|"priority"|"subspriteMode">;
};
export type FallHost = {
  object(): FallObject; screenY(): number;
  preventStep(value: boolean): void; face(direction: number): void;
  weatherFinished(): boolean; playSound(id: number): void;
  beginPan(): void; pan(y: number): void; finish(): void;
};
export class FallWarpAnimation {
  private taskId=-1;
  private readonly run=(id:number)=>this.Task_FallWarpFieldEffect(id);
  constructor(private readonly host: FallHost,private readonly scheduler=tasks) {}
  start(): void { this.taskId=this.scheduler.create(this.run,0);this.scheduler.data(this.taskId)[15]=this.taskId; }
  get active(): boolean { return this.scheduler.isActive(this.run); }
  get stage(): number { return this.taskId<0?7:this.scheduler.data(this.taskId)[0]!; }
  reset(): void { if(this.active)this.scheduler.destroy(this.taskId);this.taskId=-1; }
  /** Task_FallWarpFieldEffect (field_effect.c): run consecutive source stages in one frame when requested. */
  private Task_FallWarpFieldEffect(taskId: number): void {
    const data = this.scheduler.data(taskId);
    const steps = [this.FallWarpEffect_1, this.FallWarpEffect_2, this.FallWarpEffect_3, this.FallWarpEffect_4,
      this.FallWarpEffect_5, this.FallWarpEffect_6, this.FallWarpEffect_7] as const;
    while (data[0]! < steps.length && steps[data[0]!]!.call(this, data)) { /* C step returned TRUE: continue this frame. */ }
  }

  private FallWarpEffect_1(data: number[]): boolean {
    const object = this.host.object();
    const sprite = object.sprite;
    // CameraObjectReset2 is a no-op in this renderer, which tracks the player directly.
    object.invisible = true;
    this.host.preventStep(true);
    this.host.face(object.facingDirection);
    data[4] = sprite.subspriteMode;
    object.fixedPriority = true;
    sprite.priority = 1;
    sprite.subspriteMode = C.SUBSPRITES_IGNORE_PRIORITY;
    data[0] = data[0]! + 1;
    return true;
  }

  private FallWarpEffect_2(data: number[]): boolean {
    if (this.host.weatherFinished()) data[0] = data[0]! + 1;
    return false;
  }

  private FallWarpEffect_3(data: number[]): boolean {
    const sprite = this.host.object().sprite;
    sprite.y2 = -(this.host.screenY() - sprite.centerToCornerVecY);
    data[1] = 1;
    data[2] = 0;
    this.host.object().invisible = false;
    this.host.playSound(C.SE_FALL);
    data[0] = data[0]! + 1;
    return false;
  }

  private FallWarpEffect_4(data: number[]): boolean {
    const object = this.host.object();
    const sprite = object.sprite;
    sprite.y2 += data[1]!;
    if (data[1]! < 8) {
      data[2] = data[2]! + data[1]!;
      if (data[2]! & 0xf) data[1] = data[1]! << 1;
    }
    if (data[3] === 0 && sprite.y2 >= -16) {
      data[3] = 1;
      object.fixedPriority = false;
      sprite.subspriteMode = data[4]!;
      object.triggerGroundEffectsOnMove = true;
    }
    if (sprite.y2 >= 0) {
      this.host.playSound(C.SE_M_STRENGTH);
      object.triggerGroundEffectsOnStop = true;
      object.landingJump = true;
      sprite.y2 = 0;
      data[0] = data[0]! + 1;
    }
    return false;
  }

  private FallWarpEffect_5(data: number[]): boolean {
    data[0] = data[0]! + 1;
    data[1] = 4;
    data[2] = 0;
    this.host.beginPan();
    return true;
  }

  private FallWarpEffect_6(data: number[]): boolean {
    this.host.pan(data[1]!);
    data[1] = -data[1]!;
    data[2] = data[2]! + 1;
    if ((data[2]! & 3) === 0) data[1] = data[1]! >> 1;
    if (data[1] === 0) data[0] = data[0]! + 1;
    return false;
  }

  private FallWarpEffect_7(data: number[]): boolean {
    this.host.preventStep(false);
    this.host.finish();
    this.scheduler.destroy(data[15]!);
    return false;
  }

}
