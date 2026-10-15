// field_player_avatar.c teleport task family, shared by the engine and streaming viewer.
// Sprite world Y is normalized to screen Y; y2 carries the deflection so the map anchor stays fixed.
import * as C from "@game/generated/constants";
import { tasks } from "../gba/tasks";
import type { ObjectEvent } from "./objectEvents";
const {DIR_NONE, DIR_SOUTH, DIR_NORTH, DIR_EAST, DIR_WEST}=C;
export type TeleportObject = Pick<ObjectEvent,"facingDirection"|"fixedPriority"> & {
  sprite: Pick<ObjectEvent["sprite"],"y2"|"priority"|"subpriority"|"subspriteMode">;
};
export type TeleportHost = {
  object(): TeleportObject;
  screenY(): number;
  clearHeldMovement(): boolean;
  heldMovementFinished(): boolean;
  face(direction: number): void;
};
export class TeleportAnimation {
  constructor(private readonly host: TeleportHost, private readonly scheduler=tasks) {}
  private teleportSavedFacingDirection = DIR_NONE;
  private teleportWarpOutTaskId = -1;
  private teleportInTaskId = -1;
  private teleportWarpOutTask: ((taskId: number) => void) | null = null;
  private teleportInTask: ((taskId: number) => void) | null = null;
  /** SavePlayerFacingDirectionForTeleport (field_player_avatar.c). */
  SavePlayerFacingDirectionForTeleport(direction: number): void { this.teleportSavedFacingDirection = direction & 0xff; }

  /** GetTeleportSavedFacingDirection (field_player_avatar.c). */
  private GetTeleportSavedFacingDirection(): number {
    return this.teleportSavedFacingDirection === DIR_NONE ? DIR_SOUTH : this.teleportSavedFacingDirection;
  }

  /** StartTeleportWarpOutPlayerAnim (field_player_avatar.c). */
  StartTeleportWarpOutPlayerAnim(): void {
    const task = { id: -1, state: 0, rotationTimer: 0, deltaY: 1, yDeflection: 0 };
    const run = (_taskId: number): void => this.Task_TeleportWarpOutPlayerAnim(task);
    task.id = this.scheduler.create(run, 0);
    this.teleportWarpOutTaskId = task.id;
    this.teleportWarpOutTask = run;
    this.Task_TeleportWarpOutPlayerAnim(task);
  }

  /** WaitTeleportWarpOutPlayerAnim returns the task's C `FuncIsActiveTask` value. */
  WaitTeleportWarpOutPlayerAnim(): boolean { return this.teleportWarpOutTask !== null && this.scheduler.isActive(this.teleportWarpOutTask); }

  /** Task_TeleportWarpOutPlayerAnim (field_player_avatar.c). */
  private Task_TeleportWarpOutPlayerAnim(task: { id: number; state: number; rotationTimer: number; deltaY: number; yDeflection: number }): void {
    const object = this.host.object(), sprite = object.sprite;
    if (task.state === 0) {
      if (!this.host.clearHeldMovement()) return;
      this.SavePlayerFacingDirectionForTeleport(object.facingDirection);
      task.rotationTimer = 0;
      task.deltaY = 1;
      task.yDeflection = (this.host.screenY() + sprite.y2) * 16;
      sprite.y2 = 0;
      object.fixedPriority = true;
      sprite.priority = 0;
      sprite.subpriority = 0;
      sprite.subspriteMode = C.SUBSPRITES_OFF;
      task.state++;
    }
    if (task.state === 1) {
      this.TeleportAnim_RotatePlayer(object, task);
      task.yDeflection -= task.deltaY;
      task.deltaY += 3;
      const screenY = task.yDeflection >> 4;
      sprite.y2 = screenY - (this.host.screenY());
      if (screenY < -32) task.state++;
    } else if (task.state === 2) {
      this.scheduler.destroy(task.id);
      this.teleportWarpOutTaskId = -1;
      this.teleportWarpOutTask = null;
    }
  }

  /** StartTeleportInPlayerAnim (field_player_avatar.c). */
  StartTeleportInPlayerAnim(): void {
    const task = { id: -1, state: 0, rotationTimer: 0, deltaY: 116, yDeflection: 0, targetScreenY: 0,
      finalFacingDirection: DIR_SOUTH, priority: 0, subpriority: 0, landingDelay: 0 };
    const run = (_taskId: number): void => this.Task_TeleportWarpInPlayerAnim(task);
    task.id = this.scheduler.create(run, 0);
    this.teleportInTaskId = task.id;
    this.teleportInTask = run;
    this.Task_TeleportWarpInPlayerAnim(task);
  }

  /** WaitTeleportInPlayerAnim returns the task's C `FuncIsActiveTask` value. */
  WaitTeleportInPlayerAnim(): boolean { return this.teleportInTask !== null && this.scheduler.isActive(this.teleportInTask); }

  /** Task_TeleportWarpInPlayerAnim (field_player_avatar.c). */
  private Task_TeleportWarpInPlayerAnim(task: { id: number; state: number; rotationTimer: number; deltaY: number; yDeflection: number; targetScreenY: number;
    finalFacingDirection: number; priority: number; subpriority: number; landingDelay: number }): void {
    const object = this.host.object(), sprite = object.sprite;
    if (task.state === 0) {
      task.finalFacingDirection = this.GetTeleportSavedFacingDirection();
      // C's designated table is indexed by DIR_NONE, SOUTH, NORTH, WEST, EAST.
      const faceSequence = [DIR_SOUTH, DIR_WEST, DIR_EAST, DIR_NORTH, DIR_SOUTH];
      this.host.face(faceSequence[task.finalFacingDirection] ?? DIR_SOUTH);
      task.rotationTimer = 0;
      task.deltaY = 116;
      task.targetScreenY = this.host.screenY();
      task.priority = sprite.priority;
      task.subpriority = sprite.subpriority;
      task.yDeflection = -((sprite.y2 + 32) * 16);
      sprite.y2 = 0;
      object.fixedPriority = true;
      sprite.priority = 1;
      sprite.subpriority = 0;
      sprite.subspriteMode = C.SUBSPRITES_OFF;
      task.state++;
    }
    if (task.state === 1) {
      this.TeleportAnim_RotatePlayer(object, task);
      task.yDeflection += task.deltaY;
      task.deltaY -= 3;
      if (task.deltaY < 4) task.deltaY = 4;
      let screenY = task.yDeflection >> 4;
      sprite.y2 = screenY - task.targetScreenY;
      if (screenY >= task.targetScreenY) {
        screenY = task.targetScreenY;
        sprite.y2 = 0;
        task.landingDelay = 0;
        task.state++;
      }
    } else if (task.state === 2) {
      this.TeleportAnim_RotatePlayer(object, task);
      task.landingDelay++;
      if (task.landingDelay > 8) task.state++;
    } else if (task.state === 3 && task.finalFacingDirection === this.TeleportAnim_RotatePlayer(object, task)) {
      object.fixedPriority = false;
      sprite.priority = task.priority;
      sprite.subpriority = task.subpriority;
      this.scheduler.destroy(task.id);
      this.teleportInTaskId = -1;
      this.teleportInTask = null;
    }
  }

  /** TeleportAnim_RotatePlayer (field_player_avatar.c). */
  private TeleportAnim_RotatePlayer(object: TeleportObject, task: { rotationTimer: number }): number {
    if (task.rotationTimer < 8 && ++task.rotationTimer < 8) return object.facingDirection;
    if (!this.host.heldMovementFinished()) return object.facingDirection;
    const sequence = [DIR_SOUTH, DIR_WEST, DIR_EAST, DIR_NORTH, DIR_SOUTH];
    const nextDirection = sequence[object.facingDirection] ?? DIR_SOUTH;
    this.host.face(nextDirection);
    task.rotationTimer = 0;
    return nextDirection;
  }

  reset(): void {
    if(this.teleportWarpOutTask) this.scheduler.destroy(this.teleportWarpOutTaskId);
    if(this.teleportInTask) this.scheduler.destroy(this.teleportInTaskId);
    this.teleportWarpOutTask=this.teleportInTask=null;
    this.teleportWarpOutTaskId=this.teleportInTaskId=-1;
  }
}
