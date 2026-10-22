// pokeemerald event_object_movement.c movement actions that pokefirered lacks (the
// "regional" set of generated/movementContract.ts), ported from the Emerald bodies and
// their gMovementActionFuncs_* tables (data/object_events/movement_action_func_tables.h).
// They run through the shared engine helpers whose bodies the contract compared
// (InitNpcForMovement, UpdateMovementNormal, InitWalkSlower = Emerald InitWalkSlow...).
// Not ported: MOVEMENT_ACTION_EMOTE_HEART (FLDEFF_HEART_ICON; the Emerald field-effect sheets
// are not exported) and MOVEMENT_ACTION_REVEAL_TRAINER (trainer_see.c disguise/buried bodies).
import type { Overworld } from '@core/field/overworld';
import { DIR_EAST, DIR_NORTH, DIR_NORTHEAST, DIR_NORTHWEST, DIR_SOUTH, DIR_SOUTHEAST, DIR_SOUTHWEST, DIR_WEST, MOVE_SPEED_FAST_1, MOVE_SPEED_NORMAL, type ObjectEvent } from '@core/field/objectEvents';
import type { Sprite } from '@core/gba/sprite';
import { tasks } from '@core/gba/tasks';
import { GetAcroEndWheelieDirectionAnimNum } from '@game/generated/eventObjectAnims';
import { rom } from '@core/rom';
import * as C from './generated/constants';

type StepFunc = (object: ObjectEvent, sprite: Sprite) => boolean;

/** Internal action namespace, never written into Emerald bytecode or interpreted as a GBA ID. */
export const emeraldInternalActionId = (action: number): number => 0x100 + action;

// Emerald sFigure8XOffsets / sFigure8YOffsets (FIGURE_8_LENGTH entries).
const sFigure8XOffsets = [
  1, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 1, 2, 2, 1, 2,
  2, 1, 2, 2, 1, 2, 1, 1,
  2, 1, 1, 2, 1, 1, 2, 1,
  1, 2, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 0, 1, 1, 0,
  1, 0, 1, 0, 1, 0, 0, 0,
  0, 1, 0, 0, 0, 0, 0, 0,
];
const sFigure8YOffsets = [
  0, 0, 1, 0, 0, 1, 0, 0,
  1, 0, 1, 1, 0, 1, 1, 0,
  1, 1, 0, 1, 1, 0, 1, 1,
  0, 0, 1, 0, 0, 1, 0, 0,
  1, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, -1, 0, 0, -1, 0, 0,
  -1, 0, -1, -1, 0, -1, -1, 0,
  -1, -1, -1, -1, -1, -1, -1, -2,
];

/** Source actions this module executes; the generated contract keeps every other regional action rejected. */
export const EMERALD_REGIONAL_IMPLEMENTED_ACTIONS: readonly number[] = [
  C.MOVEMENT_ACTION_WALK_NORMAL_DIAGONAL_UP_LEFT, C.MOVEMENT_ACTION_WALK_NORMAL_DIAGONAL_UP_RIGHT,
  C.MOVEMENT_ACTION_WALK_NORMAL_DIAGONAL_DOWN_LEFT, C.MOVEMENT_ACTION_WALK_NORMAL_DIAGONAL_DOWN_RIGHT,
  C.MOVEMENT_ACTION_WALK_SLOW_DIAGONAL_UP_LEFT, C.MOVEMENT_ACTION_WALK_SLOW_DIAGONAL_UP_RIGHT,
  C.MOVEMENT_ACTION_WALK_SLOW_DIAGONAL_DOWN_LEFT, C.MOVEMENT_ACTION_WALK_SLOW_DIAGONAL_DOWN_RIGHT,
  C.MOVEMENT_ACTION_ACRO_END_WHEELIE_MOVE_DOWN, C.MOVEMENT_ACTION_ACRO_END_WHEELIE_MOVE_UP,
  C.MOVEMENT_ACTION_ACRO_END_WHEELIE_MOVE_LEFT, C.MOVEMENT_ACTION_ACRO_END_WHEELIE_MOVE_RIGHT,
  C.MOVEMENT_ACTION_WALK_LEFT_AFFINE, C.MOVEMENT_ACTION_WALK_RIGHT_AFFINE,
  C.MOVEMENT_ACTION_RESTORE_ANIMATION, C.MOVEMENT_ACTION_HIDE_REFLECTION, C.MOVEMENT_ACTION_SHOW_REFLECTION,
  C.MOVEMENT_ACTION_LEVITATE, C.MOVEMENT_ACTION_STOP_LEVITATE, C.MOVEMENT_ACTION_STOP_LEVITATE_AT_TOP,
  C.MOVEMENT_ACTION_FIGURE_8,
];

export class EmeraldRegionalMovement {
  /** CreateLevitateMovementTask keeps the object in task->data[0..1]; objectEvent->warpArrowSpriteId is the task id. */
  private readonly levitateObjects = new Map<number, ObjectEvent>();
  /** Source gMovementActionFuncs_* per action id; only the ones implemented here. */
  readonly actions = new Map<number, readonly StepFunc[]>();

  constructor(private readonly ow: Overworld) {
    const walkSlowDiagonal = (action: number, direction: number) => this.add(action, [
      (object, sprite) => { this.ow.objects.InitWalkSlower(object, sprite, direction); return this.WalkSlow_Step1(object, sprite); },
      (object, sprite) => this.WalkSlow_Step1(object, sprite), this.PauseSpriteAnim]);
    const walkNormalDiagonal = (action: number, direction: number) => this.add(action, [
      (object, sprite) => { this.ow.objects.initMovementNormal(object, direction, MOVE_SPEED_NORMAL); return this.MovementNormal_Step1(object, sprite); },
      (object, sprite) => this.MovementNormal_Step1(object, sprite), this.PauseSpriteAnim]);
    walkNormalDiagonal(C.MOVEMENT_ACTION_WALK_NORMAL_DIAGONAL_UP_LEFT, DIR_NORTHWEST);
    walkNormalDiagonal(C.MOVEMENT_ACTION_WALK_NORMAL_DIAGONAL_UP_RIGHT, DIR_NORTHEAST);
    walkNormalDiagonal(C.MOVEMENT_ACTION_WALK_NORMAL_DIAGONAL_DOWN_LEFT, DIR_SOUTHWEST);
    walkNormalDiagonal(C.MOVEMENT_ACTION_WALK_NORMAL_DIAGONAL_DOWN_RIGHT, DIR_SOUTHEAST);
    walkSlowDiagonal(C.MOVEMENT_ACTION_WALK_SLOW_DIAGONAL_UP_LEFT, DIR_NORTHWEST);
    walkSlowDiagonal(C.MOVEMENT_ACTION_WALK_SLOW_DIAGONAL_UP_RIGHT, DIR_NORTHEAST);
    walkSlowDiagonal(C.MOVEMENT_ACTION_WALK_SLOW_DIAGONAL_DOWN_LEFT, DIR_SOUTHWEST);
    walkSlowDiagonal(C.MOVEMENT_ACTION_WALK_SLOW_DIAGONAL_DOWN_RIGHT, DIR_SOUTHEAST);

    const acroEndWheelieMove = (action: number, direction: number) => this.add(action, [
      (object, sprite) => { this.InitAcroEndWheelie(object, sprite, direction, 1); return this.MovementNormal_Step1(object, sprite); },
      (object, sprite) => this.MovementNormal_Step1(object, sprite), this.PauseSpriteAnim]);
    acroEndWheelieMove(C.MOVEMENT_ACTION_ACRO_END_WHEELIE_MOVE_DOWN, DIR_SOUTH);
    acroEndWheelieMove(C.MOVEMENT_ACTION_ACRO_END_WHEELIE_MOVE_UP, DIR_NORTH);
    acroEndWheelieMove(C.MOVEMENT_ACTION_ACRO_END_WHEELIE_MOVE_LEFT, DIR_WEST);
    acroEndWheelieMove(C.MOVEMENT_ACTION_ACRO_END_WHEELIE_MOVE_RIGHT, DIR_EAST);

    const walkAffine = (action: number, direction: number, affineAnimNum: number) => this.add(action, [
      (object, sprite) => {
        this.ow.objects.initMovementNormal(object, direction, MOVE_SPEED_FAST_1);
        sprite.affineAnimPaused = false;
        sprite.affineAnimNum = affineAnimNum; // ChangeSpriteAffineAnimIfDifferent; object sprites use gDummySpriteAffineAnimTable
        return this.WalkAffine_Step1(object, sprite);
      },
      (object, sprite) => this.WalkAffine_Step1(object, sprite), this.PauseSpriteAnim]);
    walkAffine(C.MOVEMENT_ACTION_WALK_LEFT_AFFINE, DIR_WEST, 2);
    walkAffine(C.MOVEMENT_ACTION_WALK_RIGHT_AFFINE, DIR_EAST, 3);

    this.add(C.MOVEMENT_ACTION_RESTORE_ANIMATION, [(object, sprite) => this.RestoreAnimation_Step0(object, sprite), this.Finish]);
    this.add(C.MOVEMENT_ACTION_HIDE_REFLECTION, [(object) => { object.hideReflection = true; return true; }, this.Finish]);
    this.add(C.MOVEMENT_ACTION_SHOW_REFLECTION, [(object) => { object.hideReflection = false; return true; }, this.Finish]);
    this.add(C.MOVEMENT_ACTION_LEVITATE, [(object, sprite) => { this.CreateLevitateMovementTask(object); sprite.data[2] = 1; return true; }, this.Finish]);
    this.add(C.MOVEMENT_ACTION_STOP_LEVITATE, [(object, sprite) => {
      this.DestroyLevitateMovementTask(object.warpArrowSpriteId);
      sprite.y2 = 0;
      sprite.data[2] = 1;
      return true;
    }, this.Finish]);
    this.add(C.MOVEMENT_ACTION_STOP_LEVITATE_AT_TOP, [(object, sprite) => {
      if (sprite.y2 === 0) {
        this.DestroyLevitateMovementTask(object.warpArrowSpriteId);
        sprite.data[2] = 1;
        return true;
      }
      return false;
    }, this.Finish]);
    this.add(C.MOVEMENT_ACTION_FIGURE_8, [
      (object, sprite) => { this.InitFigure8Anim(object, sprite); sprite.data[2] = 1; return this.Figure8_Step1(object, sprite); },
      (object, sprite) => this.Figure8_Step1(object, sprite), this.PauseSpriteAnim]);

    for (const action of EMERALD_REGIONAL_IMPLEMENTED_ACTIONS) if (!this.actions.has(action)) throw Error(`Emerald regional movement ${action} has no body`);
    for (const [action, steps] of this.actions) {
      ow.objects.externalMovementActions.set(emeraldInternalActionId(action), object => {
        // ObjectEventExecSingleMovementAction: sMovementActionFuncs[action][sprite->sActionFuncId].
        const step = steps[Math.min(object.sprite.data[2], steps.length - 1)]!;
        return step(object, object.sprite);
      });
    }
  }

  private add(action: number, steps: readonly StepFunc[]): void { this.actions.set(action, steps); }

  /** MovementAction_Finish */
  private readonly Finish: StepFunc = () => true;

  /** MovementAction_PauseSpriteAnim */
  private readonly PauseSpriteAnim: StepFunc = (_object, sprite) => { sprite.animPaused = true; return true; };

  /** MovementAction_WalkSlowDiagonal*_Step1: UpdateWalkSlow is pokefirered's UpdateWalkSlower. */
  private WalkSlow_Step1(object: ObjectEvent, sprite: Sprite): boolean {
    if (this.ow.objects.UpdateWalkSlower(object, sprite)) {
      sprite.data[2] = 2;
      return true;
    }
    return false;
  }

  /** MovementAction_WalkNormalDiagonal*_Step1 and MovementAction_AcroEndWheelieMove*_Step1 */
  private MovementNormal_Step1(object: ObjectEvent, sprite: Sprite): boolean {
    if (this.ow.objects.updateMovementNormal(object)) {
      sprite.data[2] = 2;
      return true;
    }
    return false;
  }

  /** MovementAction_Walk{Left,Right}Affine_Step1 */
  private WalkAffine_Step1(object: ObjectEvent, sprite: Sprite): boolean {
    if (this.ow.objects.updateMovementNormal(object)) {
      sprite.affineAnimPaused = true;
      sprite.data[2] = 2;
      return true;
    }
    return false;
  }

  /** InitAcroEndWheelie */
  private InitAcroEndWheelie(object: ObjectEvent, sprite: Sprite, direction: number, speed: number): void {
    this.ow.objects.initNpcForMovement(object, direction, speed);
    sprite.startAnim(GetAcroEndWheelieDirectionAnimNum(object.facingDirection));
    sprite.seekAnim(0);
  }

  /** MovementAction_RestoreAnimation_Step0. The shared graphicsInfo helper applies FireRed's
   * 152-entry bounds, whereas the Emerald table is read directly (as MovementAction_UnlockAnim_Step0). */
  private RestoreAnimation_Step0(object: ObjectEvent, sprite: Sprite): boolean {
    const graphicsId = this.ow.objects.resolveGraphicsId(object.graphicsId);
    object.inanimate = rom.objects.gfx[String(graphicsId)].inanimate;
    sprite.data[2] = 1;
    return true;
  }

  /** CreateLevitateMovementTask */
  private CreateLevitateMovementTask(object: ObjectEvent): void {
    const taskId = tasks.create((id) => this.ApplyLevitateMovement(id), 0xff);
    this.levitateObjects.set(taskId, object);
    object.warpArrowSpriteId = taskId;
    tasks.tasks[taskId]!.data[3] = -1; // task->data[3] = 0xFFFF in an s16
  }

  /** ApplyLevitateMovement */
  private ApplyLevitateMovement(taskId: number): void {
    const task = tasks.tasks[taskId]!;
    const object = this.levitateObjects.get(taskId)!;
    const sprite = object.sprite;
    if (!(task.data[2]! & 3)) sprite.y2 += task.data[3]!;
    if (!(task.data[2]! & 15)) task.data[3] = -task.data[3]!;
    task.data[2]! += 1;
  }

  /** DestroyLevitateMovementTask */
  private DestroyLevitateMovementTask(taskId: number): void {
    this.levitateObjects.delete(taskId);
    tasks.destroy(taskId);
  }

  /** InitFigure8Anim: InitSpriteForFigure8Anim, then animPaused = FALSE. */
  private InitFigure8Anim(_object: ObjectEvent, sprite: Sprite): void {
    sprite.data[6] = 0;
    sprite.data[7] = 0;
    sprite.animPaused = false;
  }

  /** AnimateSpriteInFigure8 */
  private AnimateSpriteInFigure8(sprite: Sprite): boolean {
    const length = C.FIGURE_8_LENGTH;
    let finished = false;
    switch (sprite.data[7]) {
      case 0:
        sprite.x2 += sFigure8XOffsets[sprite.data[6]!]!;
        sprite.y2 += sFigure8YOffsets[sprite.data[6]!]!;
        break;
      case 1:
        sprite.x2 -= sFigure8XOffsets[(length - 1) - sprite.data[6]!]!;
        sprite.y2 += sFigure8YOffsets[(length - 1) - sprite.data[6]!]!;
        break;
      case 2:
        sprite.x2 -= sFigure8XOffsets[sprite.data[6]!]!;
        sprite.y2 += sFigure8YOffsets[sprite.data[6]!]!;
        break;
      case 3:
        sprite.x2 += sFigure8XOffsets[(length - 1) - sprite.data[6]!]!;
        sprite.y2 += sFigure8YOffsets[(length - 1) - sprite.data[6]!]!;
        break;
    }
    if (++sprite.data[6]! === length) {
      sprite.data[6] = 0;
      sprite.data[7]! += 1;
    }
    if (sprite.data[7] === 4) {
      sprite.y2 = 0;
      sprite.x2 = 0;
      finished = true;
    }
    return finished;
  }

  /** DoFigure8Anim */
  private DoFigure8Anim(object: ObjectEvent, sprite: Sprite): boolean {
    if (this.AnimateSpriteInFigure8(sprite)) {
      this.ow.objects.shiftStill(object);
      object.triggerGroundEffectsOnStop = true;
      sprite.animPaused = true;
      return true;
    }
    return false;
  }

  /** MovementAction_Figure8_Step1 */
  private Figure8_Step1(object: ObjectEvent, sprite: Sprite): boolean {
    if (this.DoFigure8Anim(object, sprite)) {
      sprite.data[2] = 2;
      return true;
    }
    return false;
  }
}
