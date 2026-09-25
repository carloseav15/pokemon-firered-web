// trainer_see.c: normal trainer sight, approach task and offscreen camera pan.
// Disguise/ash trainer callbacks and quest-log playback suppression remain pending.
import type { Game } from "../game";
import * as C from "../generated/constants";
import { tasks } from "../gba/tasks";
import { rom } from "../rom";
import { countAliveNonEggMons } from "../pokemon/pokemon";
import { MAP_OFFSET } from "./fieldmap";
import { actionFace, actionWalkFast, actionWalkNormal, COLLISION_OBJECT_EVENT, DIRECTION_VECTORS, DIR_NORTH, DIR_SOUTH, LOCALID_CAMERA, type ObjectEvent } from "./objectEvents";

export class TrainerSee {
  private approaching: {trainer: ObjectEvent; steps: number} | null = null;
  constructor(private game: Game) {}
  checkForTrainersWantingBattle(): boolean {
    if (this.approaching) return false;
    const ow = this.game.overworld;
    for (const trainer of ow.objects.list) {
      if (trainer.trainerType !== C.TRAINER_TYPE_NORMAL) continue;
      const script = trainer.template?.script;
      if (!script || this.game.battleSetup.hasTrainerBeenFought(rom.u16(script + 2))) continue;
      if (rom.u8(script + 1) === C.TRAINER_BATTLE_DOUBLE && countAliveNonEggMons() < 2) continue;
      const distance = this.approachDistance(trainer);
      if (!distance) continue;
      this.approaching = {trainer, steps: distance - 1};
      this.game.battleSetup.configureFromApproach(ow.objects.indexOf(trainer), script);
      return true;
    }
    return false;
  }
  private approachDistance(trainer: ObjectEvent): number {
    const ow = this.game.overworld;
    const player = ow.player.object.currentCoords;
    const [dx, dy] = DIRECTION_VECTORS[trainer.facingDirection];
    const deltaX = player.x - trainer.currentCoords.x, deltaY = player.y - trainer.currentCoords.y;
    if ((dx && deltaY) || (dy && deltaX)) return 0;
    const distance = dx ? deltaX * dx : deltaY * dy;
    if (distance <= 0 || distance > trainer.trainerRange) return 0;
    if (trainer.facingDirection === DIR_SOUTH && trainer.trainerRange > 3 && ow.objects.list.length >= 16) return 0;
    const rangeX = trainer.rangeX, rangeY = trainer.rangeY;
    trainer.rangeX = trainer.rangeY = 0;
    try {
      for (let i = 0; i < distance; i++) {
        const collision = ow.objects.collisionAt(trainer, trainer.currentCoords.x + dx * i, trainer.currentCoords.y + dy * i, trainer.facingDirection);
        if (collision !== 0) return 0;
      }
      return ow.objects.collisionAt(trainer, player.x, player.y, trainer.facingDirection) === COLLISION_OBJECT_EVENT ? distance : 0;
    } finally { trainer.rangeX = rangeX; trainer.rangeY = rangeY; }
  }
  /** EndTrainerApproach starts the waiting task; the source event waits for it. */
  endApproach(): void {
    const pending = this.approaching;
    if (!pending) { this.game.overworld.script.enable(); return; }
    const ow = this.game.overworld, trainer = pending.trainer;
    let state: "start" | "cameraUp" | "cameraDown" | "exclamation" | "walk" | "engage" | "end" = "start";
    let camera: ObjectEvent | undefined, cameraSteps = 0, remaining = pending.steps;
    const movementReady = (object: ObjectEvent): boolean => !ow.objects.isMovementOverridden(object) || ow.objects.clearHeldMovementIfFinished(object);
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
