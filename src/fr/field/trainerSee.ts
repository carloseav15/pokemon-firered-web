// trainer_see.c: trainer sight, approach task and offscreen camera pan.
// Disguise callbacks and complete Quest Log playback state remain adaptations.
import type { Game } from "../game";
import * as C from "../generated/constants";
import { tasks } from "../gba/tasks";
import type { Sprite } from "../gba/sprite";
import { rom } from "../rom";
import { countAliveNonEggMons } from "../pokemon/pokemon";
import { MAP_OFFSET } from "./fieldmap";
import { QL_IsTrainerSightDisabled } from "../questLogEvents";
import { actionFace, actionJumpInPlace, actionWalkFast, actionWalkNormal, COLLISION_OBJECT_EVENT, DIRECTION_VECTORS, DIR_NORTH, DIR_SOUTH, GetCollisionFlagsAtCoords, GetTrainerFacingDirectionMovementType, LOCALID_CAMERA, OBJECT_EVENTS_COUNT, type ObjectEvent, type ObjectEvents } from "./objectEvents";

type TrainerApproachFunc = (objects: ObjectEvents, trainer: ObjectEvent, range: number, x: number, y: number) => number;

/** GetTrainerApproachDistanceSouth (trainer_see.c). */
export function GetTrainerApproachDistanceSouth(objects: ObjectEvents, trainer: ObjectEvent, range: number, x: number, y: number): number {
  if (trainer.currentCoords.x === x && y > trainer.currentCoords.y && y <= trainer.currentCoords.y + range) {
    if (range > 3 && objects.list.length >= OBJECT_EVENTS_COUNT) return 0;
    return y - trainer.currentCoords.y;
  }
  return 0;
}

/** GetTrainerApproachDistanceNorth (trainer_see.c). */
export function GetTrainerApproachDistanceNorth(_objects: ObjectEvents, trainer: ObjectEvent, range: number, x: number, y: number): number {
  if (trainer.currentCoords.x === x && y < trainer.currentCoords.y && y >= trainer.currentCoords.y - range) return trainer.currentCoords.y - y;
  return 0;
}

/** GetTrainerApproachDistanceWest (trainer_see.c). */
export function GetTrainerApproachDistanceWest(_objects: ObjectEvents, trainer: ObjectEvent, range: number, x: number, y: number): number {
  if (trainer.currentCoords.y === y && x < trainer.currentCoords.x && x >= trainer.currentCoords.x - range) return trainer.currentCoords.x - x;
  return 0;
}

/** GetTrainerApproachDistanceEast (trainer_see.c). */
export function GetTrainerApproachDistanceEast(_objects: ObjectEvents, trainer: ObjectEvent, range: number, x: number, y: number): number {
  if (trainer.currentCoords.y === y && x > trainer.currentCoords.x && x <= trainer.currentCoords.x + range) return x - trainer.currentCoords.x;
  return 0;
}

export const sDirectionalApproachDistanceFuncs: TrainerApproachFunc[] = [
  GetTrainerApproachDistanceSouth,
  GetTrainerApproachDistanceNorth,
  GetTrainerApproachDistanceWest,
  GetTrainerApproachDistanceEast,
];

/** CheckPathBetweenTrainerAndPlayer (trainer_see.c). */
export function CheckPathBetweenTrainerAndPlayer(objects: ObjectEvents, trainer: ObjectEvent, approachDistance: number, direction: number): number {
  if (approachDistance === 0) return 0;
  const rangeX = trainer.rangeX, rangeY = trainer.rangeY;
  try {
    const [dx, dy] = DIRECTION_VECTORS[direction]!;
    let x = trainer.currentCoords.x, y = trainer.currentCoords.y;
    for (let i = 0; i <= approachDistance - 1; i++, x += dx, y += dy) {
      const collision = GetCollisionFlagsAtCoords(objects, trainer, x, y, direction);
      if (collision !== 0 && (collision & 0xfe)) return 0;
    }
    trainer.rangeX = 0;
    trainer.rangeY = 0;
    const collision = objects.GetCollisionAtCoords(trainer, x, y, direction);
    if (collision === COLLISION_OBJECT_EVENT) return approachDistance;
    return 0;
  } finally {
    trainer.rangeX = rangeX;
    trainer.rangeY = rangeY;
  }
}

/** GetTrainerApproachDistance (trainer_see.c). */
export function GetTrainerApproachDistance(objects: ObjectEvents, trainer: ObjectEvent, x: number, y: number): number {
  if (trainer.trainerType === C.TRAINER_TYPE_NORMAL) {
    const direction = trainer.facingDirection;
    const distance = sDirectionalApproachDistanceFuncs[direction - 1]?.(objects, trainer, trainer.trainerRange, x, y) ?? 0;
    return CheckPathBetweenTrainerAndPlayer(objects, trainer, distance, direction);
  }
  for (let i = 0; i < sDirectionalApproachDistanceFuncs.length; i++) {
    const distance = sDirectionalApproachDistanceFuncs[i]!(objects, trainer, trainer.trainerRange, x, y);
    if (CheckPathBetweenTrainerAndPlayer(objects, trainer, distance, i + 1)) return distance;
  }
  return 0;
}

/** TrainerSeeFunc_Dummy (trainer_see.c): no-op placeholder at index 0. */
export function TrainerSeeFunc_Dummy(_taskId?: number, _task?: unknown, _trainerObj?: unknown): boolean {
  return false;
}

/** TrainerSeeFunc_BeginRemoveDisguise (trainer_see.c): initiate reveal movement for disguised trainers. */
export function TrainerSeeFunc_BeginRemoveDisguise(objects: ObjectEvents, trainer: ObjectEvent): boolean {
  if (!objects.isMovementOverridden(trainer) || objects.ObjectEventClearHeldMovementIfFinished(trainer) !== 0) {
    objects.setHeldMovement(trainer, C.MOVEMENT_ACTION_REVEAL_TRAINER);
    return true;
  }
  return false;
}

/** TrainerSeeFunc_WaitRemoveDisguise (trainer_see.c): wait for disguise reveal to complete. */
export function TrainerSeeFunc_WaitRemoveDisguise(objects: ObjectEvents, trainer: ObjectEvent): boolean {
  return objects.ObjectEventClearHeldMovementIfFinished(trainer) !== 0;
}

export class TrainerSee {
  private approaching: {trainer: ObjectEvent; steps: number} | null = null;
  private approachTaskSteps = new Map<number, (taskId: number) => void>();
  private revealTrainerTaskByObject = new WeakMap<ObjectEvent, number>();
  private revealTrainerTasks = new Map<number, {trainer: ObjectEvent; ashPuffId?: number}>();
  private revealTrainerAshPuffs = new Map<number, Sprite>();
  private nextRevealTrainerAshPuffId = 0;

  constructor(private game: Game) {
    game.overworld.objects.revealTrainerMovementAction = (trainer) => this.MovementAction_RevealTrainer_RunTrainerSeeFuncList(trainer);
  }

  /** CheckTrainer (trainer_see.c): flag, approach range, and double-battle eligibility. */
  private CheckTrainer(trainer: ObjectEvent, x: number, y: number): boolean {
    const ow = this.game.overworld;
    const script = trainer.template?.script;
    if (!script || this.game.battleSetup.GetTrainerFlagFromScriptPointer(script)) return false;

    const approachDistance = GetTrainerApproachDistance(ow.objects, trainer, x, y);
    if (!approachDistance) return false;
    if (rom.u8(script + 1) === C.TRAINER_BATTLE_DOUBLE && countAliveNonEggMons() < 2) return false;

    this.game.battleSetup.ConfigureAndSetUpOneTrainerBattle(ow.objects.indexOf(trainer), script);
    this.TrainerApproachPlayer(trainer, approachDistance - 1);
    return true;
  }

  /** TrainerApproachPlayer (trainer_see.c): create the task and retain range-1. */
  private TrainerApproachPlayer(trainer: ObjectEvent, approachDistance: number): void {
    this.approaching = {trainer, steps: approachDistance};
  }

  /** StartTrainerApproachWithFollowupTask: install the frame runner used by the C task list. */
  private StartTrainerApproachWithFollowupTask(step: (taskId: number) => void): number {
    const taskId = tasks.create((id) => this.Task_RunTrainerSeeFuncList(id), 80);
    this.approachTaskSteps.set(taskId, step);
    return taskId;
  }

  /** Task_RunTrainerSeeFuncList: execute the active trainer-see state once this frame. */
  private Task_RunTrainerSeeFuncList(taskId: number): void {
    const step = this.approachTaskSteps.get(taskId);
    if (step) step(taskId);
    else this.Task_DestroyTrainerApproachTask(taskId);
  }

  /** Task_DestroyTrainerApproachTask: release camera/task state and resume the event script. */
  private Task_DestroyTrainerApproachTask(taskId: number): void {
    this.approachTaskSteps.delete(taskId);
    tasks.destroy(taskId);
    this.approaching = null;
    this.game.overworld.script.ScriptContext_Enable();
  }

  /** TrainerSeeFunc_StartExclMark: start the icon/face movement, or dispatch offscreen pan. */
  private TrainerSeeFunc_StartExclMark(trainer: ObjectEvent, range: number): "camera" | "exclamation" {
    if (trainer.facingDirection === DIR_SOUTH && range > 2) return "camera";
    this.game.overworld.effects.startEmoteForObjectEvent(trainer, 0);
    this.game.overworld.objects.setHeldMovement(trainer, actionFace(trainer.facingDirection));
    return "exclamation";
  }

  /** TrainerSeeFunc_WaitExclMark: FALSE while active; otherwise advance the function list. */
  private TrainerSeeFunc_WaitExclMark(): boolean {
    return !this.game.overworld.effects.active.has(C.FLDEFF_EXCLAMATION_MARK_ICON);
  }

  /** TrainerSeeFunc_TrainerApproach: queue one walk step or face the player. */
  private TrainerSeeFunc_TrainerApproach(trainer: ObjectEvent, range: {remaining: number}): boolean {
    if (!this.isTrainerSeeMovementReady(trainer)) return false;
    if (range.remaining) {
      this.game.overworld.objects.setHeldMovement(trainer, actionWalkNormal(trainer.facingDirection));
      range.remaining--;
    } else {
      this.game.overworld.objects.setHeldMovement(trainer, C.MOVEMENT_ACTION_FACE_PLAYER);
      return true;
    }
    return false;
  }

  /** TrainerSeeFunc_PrepareToEngage: restore trainer movement, await player, cancel forced walk. */
  private TrainerSeeFunc_PrepareToEngage(trainer: ObjectEvent): boolean {
    const ow = this.game.overworld;
    if (ow.objects.isMovementOverridden(trainer) && !ow.objects.ObjectEventClearHeldMovementIfFinished(trainer)) return false;
    this.setTrainerMovement(trainer);
    ow.objects.overrideTemplateCoords(trainer);
    if (!this.isTrainerSeeMovementReady(ow.player.object)) return false;
    ow.player.CancelPlayerForcedMovement();
    return true;
  }

  /** TrainerSeeFunc_End: wait for player movement to finish before ending the task. */
  private TrainerSeeFunc_End(): boolean {
    return this.isTrainerSeeMovementReady(this.game.overworld.player.object);
  }

  /** TrainerSeeFunc_TrainerInAshFacesPlayer; task-state adaptation returns when its held action is queued. */
  private TrainerSeeFunc_TrainerInAshFacesPlayer(trainer: ObjectEvent): boolean {
    const ow = this.game.overworld;
    if (ow.objects.isMovementOverridden(trainer) && !ow.objects.ObjectEventClearHeldMovementIfFinished(trainer)) return false;
    ow.objects.setHeldMovement(trainer, C.MOVEMENT_ACTION_FACE_PLAYER);
    return true;
  }

  /** TrainerSeeFunc_BeginJumpOutOfAsh / FldEff_PopOutOfAsh. */
  private TrainerSeeFunc_BeginJumpOutOfAsh(trainer: ObjectEvent): Sprite | null | undefined {
    const ow = this.game.overworld;
    if (ow.objects.ObjectEventCheckHeldMovementStatus(trainer) === 0) return null;
    return ow.effects.popOutOfAsh(trainer);
  }

  /** TrainerSeeFunc_WaitJumpOutOfAsh; AshPuff animCmdIndex 2 is the source reveal threshold. */
  private TrainerSeeFunc_WaitJumpOutOfAsh(trainer: ObjectEvent, ashPuff: Sprite): boolean {
    if (ashPuff.animCmdIndex !== 2) return false;
    const ow = this.game.overworld;
    trainer.fixedPriority = false;
    trainer.triggerGroundEffectsOnMove = true;
    trainer.sprite.priority = 2;
    ow.objects.ObjectEventClearHeldMovementIfFinished(trainer);
    ow.objects.setHeldMovement(trainer, actionJumpInPlace(trainer.facingDirection));
    return true;
  }

  /** TrainerSeeFunc_EndJumpOutOfAsh. */
  private TrainerSeeFunc_EndJumpOutOfAsh(): boolean {
    return !this.game.overworld.effects.active.has(C.FLDEFF_POP_OUT_OF_ASH);
  }

  /**
   * MovementAction_RevealTrainer_RunTrainerSeeFuncList (trainer_see.c).
   * TypeScript keeps the ObjectEvent and ash-puff Sprite in maps because its
   * Task data array cannot store GBA pointers; the corresponding C slots stay
   * reserved below (data[1..2] and data[4]). Returns true after the task ends
   * so ObjectEvents can complete the held movement action.
   */
  MovementAction_RevealTrainer_RunTrainerSeeFuncList(trainer: ObjectEvent): boolean {
    const existingTaskId = this.revealTrainerTaskByObject.get(trainer);
    if (existingTaskId !== undefined) {
      if (this.revealTrainerTasks.get(existingTaskId)?.trainer === trainer) return false;
      this.revealTrainerTaskByObject.delete(trainer);
      return true;
    }

    if (!tasks.tasks.some((task) => !task.isActive)) return false;
    const taskId = tasks.create((id) => this.Task_RevealTrainer_RunTrainerSeeFuncList(id), 0);
    const task = tasks.data(taskId);
    // C stores a pointer in data[1..2]. The object event table slot is its
    // stable TypeScript equivalent and is retained as a 32-bit word.
    tasks.setWordArg(taskId, 1, this.game.overworld.objects.indexOf(trainer));
    task[0] = 0;
    task[4] = 0;
    task[7] = 0;
    this.revealTrainerTasks.set(taskId, {trainer});
    this.revealTrainerTaskByObject.set(trainer, taskId);
    return false;
  }

  /** Task_RevealTrainer_RunTrainerSeeFuncList (trainer_see.c), data[0] indexes sTrainerSeeFuncList2. */
  private Task_RevealTrainer_RunTrainerSeeFuncList(taskId: number): void {
    const state = this.revealTrainerTasks.get(taskId);
    if (!state) { tasks.destroy(taskId); return; }

    const data = tasks.data(taskId);
    const trainer = state.trainer;
    if (!data[7]) {
      this.game.overworld.objects.clearHeldMovement(trainer);
      data[7]++;
    }

    switch (data[0]) {
      case 0:
        if (this.TrainerSeeFunc_TrainerInAshFacesPlayer(trainer)) data[0]++;
        break;
      case 1: {
        const ashPuff = this.TrainerSeeFunc_BeginJumpOutOfAsh(trainer);
        if (ashPuff) {
          let spriteId = this.nextRevealTrainerAshPuffId & 0xff;
          while (this.revealTrainerAshPuffs.has(spriteId)) spriteId = (spriteId + 1) & 0xff;
          this.nextRevealTrainerAshPuffId = (spriteId + 1) & 0xff;
          state.ashPuffId = spriteId;
          data[4] = spriteId;
          this.revealTrainerAshPuffs.set(spriteId, ashPuff);
          data[0]++;
        }
        break;
      }
      case 2: {
        const ashPuff = this.revealTrainerAshPuffs.get(data[4]);
        if (ashPuff && this.TrainerSeeFunc_WaitJumpOutOfAsh(trainer, ashPuff)) data[0]++;
        break;
      }
      case 3:
        if (this.TrainerSeeFunc_EndJumpOutOfAsh()) {
          this.setTrainerMovement(trainer);
          if (state.ashPuffId !== undefined) this.revealTrainerAshPuffs.delete(state.ashPuffId);
          this.revealTrainerTasks.delete(taskId);
          tasks.destroy(taskId);
          return;
        }
        break;
    }

    // trainer_see.c keeps the reveal movement from completing while the task runs.
    trainer.heldMovementFinished = false;
  }

  /** TrainerSeeFunc_OffscreenAboveTrainerCreateCameraObj; SpawnSpecialObjectEventParameterized adaptation. */
  private TrainerSeeFunc_OffscreenAboveTrainerCreateCameraObj(): ObjectEvent | undefined {
    const ow = this.game.overworld, player = ow.player.object;
    const objectEventId = ow.objects.SpawnSpecialObjectEventParameterized(C.OBJ_EVENT_GFX_YOUNGSTER, 7, LOCALID_CAMERA, player.currentCoords.x, player.currentCoords.y, 3);
    const camera = objectEventId === OBJECT_EVENTS_COUNT ? undefined : ow.objects.objects[objectEventId] ?? undefined;
    if (camera) {
      camera.invisible = true;
      ow.cameraTarget = camera;
      ow.syncObjectSprites();
    }
    return camera;
  }

  /** TrainerSeeFunc_OffscreenAboveTrainerCameraObjMoveUp. */
  private TrainerSeeFunc_OffscreenAboveTrainerCameraObjMoveUp(camera: ObjectEvent, trainer: ObjectEvent, trainerRange: number, movedSteps: number): { movedSteps: number; exclamationStarted: boolean } | undefined {
    const ow = this.game.overworld;
    if (!this.isTrainerSeeMovementReady(camera)) return undefined;
    if (movedSteps !== trainerRange - 1) {
      ow.objects.setHeldMovement(camera, actionWalkFast(DIR_NORTH));
      return {movedSteps: movedSteps + 1, exclamationStarted: false};
    }
    ow.effects.startEmoteForObjectEvent(trainer, 0);
    return {movedSteps: 0, exclamationStarted: true};
  }

  /** TrainerSeeFunc_OffscreenAboveTrainerCameraObjMoveDown. */
  private TrainerSeeFunc_OffscreenAboveTrainerCameraObjMoveDown(camera: ObjectEvent, trainerRange: number, movedSteps: number): { movedSteps: number; complete: boolean } | undefined {
    const ow = this.game.overworld;
    if (ow.effects.active.has(C.FLDEFF_EXCLAMATION_MARK_ICON) || !this.isTrainerSeeMovementReady(camera)) return undefined;
    if (movedSteps !== trainerRange - 1) {
      ow.objects.setHeldMovement(camera, actionWalkFast(DIR_SOUTH));
      return {movedSteps: movedSteps + 1, complete: false};
    }
    ow.cameraTarget = ow.player.object;
    ow.objects.remove(camera);
    return {movedSteps: 0, complete: true};
  }

  private isTrainerSeeMovementReady(object: ObjectEvent): boolean {
    const objects = this.game.overworld.objects;
    return !objects.isMovementOverridden(object) || objects.ObjectEventClearHeldMovementIfFinished(object) !== 0;
  }

  checkForTrainersWantingBattle(): boolean {
    if (QL_IsTrainerSightDisabled() || this.approaching) return false;
    const ow = this.game.overworld;
    for (const trainer of ow.objects.list) {
      if (trainer.trainerType !== C.TRAINER_TYPE_NORMAL && trainer.trainerType !== C.TRAINER_TYPE_BURIED) continue;
      if (this.CheckTrainer(trainer, ow.player.object.currentCoords.x, ow.player.object.currentCoords.y)) return true;
    }
    return false;
  }
  /** TrainerSeeFunc_Dummy (trainer_see.c): no-op placeholder at index 0. */
  private TrainerSeeFunc_Dummy(): boolean {
    return TrainerSeeFunc_Dummy();
  }

  /** TrainerSeeFunc_BeginRemoveDisguise (trainer_see.c): initiate reveal movement for disguised trainers. */
  private TrainerSeeFunc_BeginRemoveDisguise(trainer: ObjectEvent): boolean {
    return TrainerSeeFunc_BeginRemoveDisguise(this.game.overworld.objects, trainer);
  }

  /** TrainerSeeFunc_WaitRemoveDisguise (trainer_see.c): wait for disguise reveal to complete. */
  private TrainerSeeFunc_WaitRemoveDisguise(trainer: ObjectEvent): boolean {
    return TrainerSeeFunc_WaitRemoveDisguise(this.game.overworld.objects, trainer);
  }

  /** EndTrainerApproach starts the waiting task; the source event waits for it. */
  endApproach(): void {
    const pending = this.approaching;
    if (!pending) { this.game.overworld.script.ScriptContext_Enable(); return; }
    const ow = this.game.overworld, trainer = pending.trainer;
    let state: "start" | "cameraUp" | "cameraDown" | "exclamation" | "beginDisguise" | "waitDisguise" | "ashPuff" | "ashReveal" | "ashWaitPuff" | "walk" | "engage" | "end" = "start";
    let camera: ObjectEvent | undefined, cameraSteps = 0, ashPuff: Sprite | null | undefined;
    const approachRange = {remaining: pending.steps};
    const movementReady = (object: ObjectEvent): boolean => this.isTrainerSeeMovementReady(object);
    const finish = (id: number): void => {
      if (camera) { ow.cameraTarget = ow.player.object; ow.objects.remove(camera); }
      this.Task_DestroyTrainerApproachTask(id);
    };
    this.StartTrainerApproachWithFollowupTask(id => {
      if (!trainer.active) { finish(id); return; }
      switch (state) {
        case "start": {
          this.TrainerSeeFunc_Dummy();
          const next = this.TrainerSeeFunc_StartExclMark(trainer, pending.steps);
          if (next === "camera") {
            camera = this.TrainerSeeFunc_OffscreenAboveTrainerCreateCameraObj();
            if (camera) { state = "cameraUp"; return; }
          }
          state = "exclamation";
          // StartExclMark returns TRUE in C, so check the icon in this same frame.
          if (!this.TrainerSeeFunc_WaitExclMark()) return;
          if (trainer.movementType === C.MOVEMENT_TYPE_TREE_DISGUISE || trainer.movementType === C.MOVEMENT_TYPE_MOUNTAIN_DISGUISE) {
            if (this.TrainerSeeFunc_BeginRemoveDisguise(trainer)) {
              state = "waitDisguise";
            } else {
              state = "beginDisguise";
            }
          } else if (trainer.movementType === C.MOVEMENT_TYPE_BURIED) {
            if (!this.TrainerSeeFunc_TrainerInAshFacesPlayer(trainer)) { state = "exclamation"; return; }
            state = "ashPuff";
          } else state = "walk";
          break;
        }
        case "cameraUp":
          if (!camera) return;
          {
            const result = this.TrainerSeeFunc_OffscreenAboveTrainerCameraObjMoveUp(camera, trainer, pending.steps, cameraSteps);
            if (!result) return;
            cameraSteps = result.movedSteps;
            if (result.exclamationStarted) state = "cameraDown";
          }
          break;
        case "cameraDown":
          if (!camera) return;
          {
            const result = this.TrainerSeeFunc_OffscreenAboveTrainerCameraObjMoveDown(camera, pending.steps, cameraSteps);
            if (!result) return;
            cameraSteps = result.movedSteps;
            if (result.complete) { camera = undefined; state = "exclamation"; }
          }
          break;
        case "exclamation":
          if (!this.TrainerSeeFunc_WaitExclMark()) return;
          if (trainer.movementType === C.MOVEMENT_TYPE_TREE_DISGUISE || trainer.movementType === C.MOVEMENT_TYPE_MOUNTAIN_DISGUISE) {
            if (this.TrainerSeeFunc_BeginRemoveDisguise(trainer)) {
              state = "waitDisguise";
            } else {
              state = "beginDisguise";
            }
            break;
          }
          if (trainer.movementType === C.MOVEMENT_TYPE_BURIED) {
            if (!this.TrainerSeeFunc_TrainerInAshFacesPlayer(trainer)) return;
            state = "ashPuff";
            break;
          }
          state = "walk";
          // TrainerSeeFunc_WaitExclMark returns TRUE: approach runs this frame.
          // fall through
        case "beginDisguise":
          if (this.TrainerSeeFunc_BeginRemoveDisguise(trainer)) {
            state = "waitDisguise";
          }
          break;
        case "waitDisguise":
          if (this.TrainerSeeFunc_WaitRemoveDisguise(trainer)) {
            state = "walk";
          }
          break;
        case "walk":
          if (this.TrainerSeeFunc_TrainerApproach(trainer, approachRange)) state = "engage";
          break;
        case "ashPuff":
          ashPuff = this.TrainerSeeFunc_BeginJumpOutOfAsh(trainer);
          if (!ashPuff) { state = "walk"; break; }
          state = "ashReveal";
          break;
        case "ashReveal":
          if (!ashPuff || !this.TrainerSeeFunc_WaitJumpOutOfAsh(trainer, ashPuff)) return;
          state = "ashWaitPuff";
          break;
        case "ashWaitPuff":
          if (!this.TrainerSeeFunc_EndJumpOutOfAsh()) return;
          state = "walk";
          break;
        case "engage":
          if (this.TrainerSeeFunc_PrepareToEngage(trainer)) state = "end";
          break;
        case "end":
          if (this.TrainerSeeFunc_End()) finish(id);
          break;
      }
    });
  }
  setUpTrainerMovement(): void {
    const trainer = this.game.overworld.objects.objects[this.game.overworld.selectedObject];
    if (trainer) this.setTrainerMovement(trainer);
  }
  private setTrainerMovement(trainer: ObjectEvent): void {
    const movementType = GetTrainerFacingDirectionMovementType(trainer.facingDirection);
    const objects = this.game.overworld.objects;
    objects.setTrainerMovementType(trainer, movementType);
    objects.overrideTemplateMovementType(trainer, movementType);
  }
}
