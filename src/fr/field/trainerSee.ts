// trainer_see.c: normal trainer sight, approach task and offscreen camera pan.
// Buried/disguise/ash callbacks and quest-log playback suppression remain pending.
import type { Game } from "../game";
import * as C from "../generated/constants";
import { tasks } from "../gba/tasks";
import { rom } from "../rom";
import { countAliveNonEggMons } from "../pokemon/pokemon";
import { MAP_OFFSET } from "./fieldmap";
import { actionFace, actionWalkFast, actionWalkNormal, COLLISION_OBJECT_EVENT, DIRECTION_VECTORS, DIR_NORTH, DIR_SOUTH, GetCollisionFlagsAtCoords, LOCALID_CAMERA, OBJECT_EVENTS_COUNT, type ObjectEvent, type ObjectEvents } from "./objectEvents";

type TrainerApproachFunc = (objects: ObjectEvents, trainer: ObjectEvent, range: number, x: number, y: number) => number;

/** GetTrainerApproachDistanceSouth (trainer_see.c). */
function GetTrainerApproachDistanceSouth(objects: ObjectEvents, trainer: ObjectEvent, range: number, x: number, y: number): number {
  if (trainer.currentCoords.x === x && y > trainer.currentCoords.y && y <= trainer.currentCoords.y + range) {
    if (range > 3 && objects.list.length >= OBJECT_EVENTS_COUNT) return 0;
    return y - trainer.currentCoords.y;
  }
  return 0;
}

/** GetTrainerApproachDistanceNorth (trainer_see.c). */
function GetTrainerApproachDistanceNorth(_objects: ObjectEvents, trainer: ObjectEvent, range: number, x: number, y: number): number {
  if (trainer.currentCoords.x === x && y < trainer.currentCoords.y && y >= trainer.currentCoords.y - range) return trainer.currentCoords.y - y;
  return 0;
}

/** GetTrainerApproachDistanceWest (trainer_see.c). */
function GetTrainerApproachDistanceWest(_objects: ObjectEvents, trainer: ObjectEvent, range: number, x: number, y: number): number {
  if (trainer.currentCoords.y === y && x < trainer.currentCoords.x && x >= trainer.currentCoords.x - range) return trainer.currentCoords.x - x;
  return 0;
}

/** GetTrainerApproachDistanceEast (trainer_see.c). */
function GetTrainerApproachDistanceEast(_objects: ObjectEvents, trainer: ObjectEvent, range: number, x: number, y: number): number {
  if (trainer.currentCoords.y === y && x > trainer.currentCoords.x && x <= trainer.currentCoords.x + range) return x - trainer.currentCoords.x;
  return 0;
}

const sDirectionalApproachDistanceFuncs: TrainerApproachFunc[] = [
  GetTrainerApproachDistanceSouth,
  GetTrainerApproachDistanceNorth,
  GetTrainerApproachDistanceWest,
  GetTrainerApproachDistanceEast,
];

/** CheckPathBetweenTrainerAndPlayer (trainer_see.c). */
function CheckPathBetweenTrainerAndPlayer(objects: ObjectEvents, trainer: ObjectEvent, approachDistance: number, direction: number): number {
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
    const collision = objects.collisionAt(trainer, x, y, direction);
    if (collision === COLLISION_OBJECT_EVENT) return approachDistance;
    return 0;
  } finally {
    trainer.rangeX = rangeX;
    trainer.rangeY = rangeY;
  }
}

/** GetTrainerApproachDistance (trainer_see.c). */
function GetTrainerApproachDistance(objects: ObjectEvents, trainer: ObjectEvent, x: number, y: number): number {
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

export class TrainerSee {
  private approaching: {trainer: ObjectEvent; steps: number} | null = null;
  constructor(private game: Game) {}

  /** CheckTrainer (trainer_see.c): flag, approach range, and double-battle eligibility. */
  private CheckTrainer(trainer: ObjectEvent, x: number, y: number): boolean {
    const ow = this.game.overworld;
    const script = trainer.template?.script;
    if (!script || this.game.battleSetup.hasTrainerBeenFought(rom.u16(script + 2))) return false;

    const approachDistance = GetTrainerApproachDistance(ow.objects, trainer, x, y);
    if (!approachDistance) return false;
    if (rom.u8(script + 1) === C.TRAINER_BATTLE_DOUBLE && countAliveNonEggMons() < 2) return false;

    this.game.battleSetup.configureFromApproach(ow.objects.indexOf(trainer), script);
    this.approaching = {trainer, steps: approachDistance - 1};
    return true;
  }

  checkForTrainersWantingBattle(): boolean {
    if (this.approaching) return false;
    const ow = this.game.overworld;
    for (const trainer of ow.objects.list) {
      if (trainer.trainerType !== C.TRAINER_TYPE_NORMAL) continue;
      if (this.CheckTrainer(trainer, ow.player.object.currentCoords.x, ow.player.object.currentCoords.y)) return true;
    }
    return false;
  }
  /** EndTrainerApproach starts the waiting task; the source event waits for it. */
  endApproach(): void {
    const pending = this.approaching;
    if (!pending) { this.game.overworld.script.enable(); return; }
    const ow = this.game.overworld, trainer = pending.trainer;
    let state: "start" | "cameraUp" | "cameraDown" | "exclamation" | "walk" | "engage" | "end" = "start";
    let camera: ObjectEvent | undefined, cameraSteps = 0, remaining = pending.steps;
    const movementReady = (object: ObjectEvent): boolean => !ow.objects.isMovementOverridden(object) || ow.objects.ObjectEventClearHeldMovementIfFinished(object) !== 0;
    const finish = (id: number): void => {
      if (camera) { ow.cameraTarget = ow.player.object; ow.objects.remove(camera); }
      this.approaching = null; tasks.destroy(id); ow.script.enable();
    };
    tasks.create(id => {
      if (!trainer.active) { finish(id); return; }
      switch (state) {
        case "start":
          if (trainer.facingDirection === DIR_SOUTH && pending.steps > 2) {
            camera = ow.objects.spawnFromTemplate({localId: LOCALID_CAMERA, graphicsId: C.OBJ_EVENT_GFX_YOUNGSTER, graphicsName: "", x: ow.player.object.currentCoords.x - MAP_OFFSET, y: ow.player.object.currentCoords.y - MAP_OFFSET, elevation: 3, movementType: 7, rangeX: 0, rangeY: 0, trainerType: 0, trainerRange: 0, script: 0, scriptName: null, flag: 0});
            if (camera) { camera.invisible = true; ow.cameraTarget = camera; ow.syncObjectSprites(); state = "cameraUp"; return; }
          }
          ow.effects.emote(trainer, 0);
          ow.objects.setHeldMovement(trainer, actionFace(trainer.facingDirection));
          state = "exclamation";
          break;
        case "cameraUp":
          if (!camera || !movementReady(camera)) return;
          if (cameraSteps !== pending.steps - 1) {
            ow.objects.setHeldMovement(camera, actionWalkFast(DIR_NORTH)); cameraSteps++;
          } else { ow.effects.emote(trainer, 0); cameraSteps = 0; state = "cameraDown"; }
          break;
        case "cameraDown":
          if (!camera || ow.effects.active.has(C.FLDEFF_EXCLAMATION_MARK_ICON) || !movementReady(camera)) return;
          if (cameraSteps !== pending.steps - 1) {
            ow.objects.setHeldMovement(camera, actionWalkFast(DIR_SOUTH)); cameraSteps++;
          } else {
            ow.cameraTarget = ow.player.object; ow.objects.remove(camera); camera = undefined; state = "exclamation";
          }
          break;
        case "exclamation":
          if (ow.effects.active.has(C.FLDEFF_EXCLAMATION_MARK_ICON)) return;
          state = "walk";
          // TrainerSeeFunc_WaitExclMark returns TRUE: approach runs this frame.
          // fall through
        case "walk":
          if (!movementReady(trainer)) return;
          if (remaining) { ow.objects.setHeldMovement(trainer, actionWalkNormal(trainer.facingDirection)); remaining--; }
          else { ow.objects.setHeldMovement(trainer, C.MOVEMENT_ACTION_FACE_PLAYER); state = "engage"; }
          break;
        case "engage":
          if (!movementReady(trainer)) return;
          this.setTrainerMovement(trainer);
          ow.objects.overrideTemplateCoords(trainer);
          if (!movementReady(ow.player.object)) return;
          ow.player.cancelForcedMovement();
          state = "end";
          break;
        case "end":
          if (movementReady(ow.player.object)) finish(id);
          break;
      }
    }, 80);
  }
  setUpTrainerMovement(): void {
    const trainer = this.game.overworld.objects.objects[this.game.overworld.selectedObject];
    if (trainer) this.setTrainerMovement(trainer);
  }
  private setTrainerMovement(trainer: ObjectEvent): void {
    const movementType = [C.MOVEMENT_TYPE_FACE_DOWN, C.MOVEMENT_TYPE_FACE_DOWN, C.MOVEMENT_TYPE_FACE_UP, C.MOVEMENT_TYPE_FACE_LEFT, C.MOVEMENT_TYPE_FACE_RIGHT][trainer.facingDirection];
    const objects = this.game.overworld.objects;
    objects.setTrainerMovementType(trainer, movementType);
    objects.overrideTemplateMovementType(trainer, movementType);
  }
}
