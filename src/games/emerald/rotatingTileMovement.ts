// Emerald rotating_tile_puzzle.c movement boundary to the FireRed action dispatcher.
// WalkNormal/Face bodies are shared in both decomps, but their byte IDs differ.
// LockAnim/UnlockAnim/FindLockedObjectEventIndex below are the complete Emerald
// event_object_movement.c family; FireRed has no equivalent animation-lock allocation.
import type { Overworld } from '@core/field/overworld';
import { type ObjectEvent } from '@core/field/objectEvents';
import * as C from './generated/constants';
import { rom } from '@core/rom';
import { EMERALD_SHARED_MOVEMENT_ACTIONS, EMERALD_REGIONAL_MOVEMENT_ACTIONS } from './generated/movementContract';
import * as FR from '../firered/generated/constants';

// Internal action namespace, never written into Emerald bytecode or interpreted as a GBA ID.
const LOCK_ANIM = 0x100 + C.MOVEMENT_ACTION_LOCK_ANIM;
const UNLOCK_ANIM = 0x100 + C.MOVEMENT_ACTION_UNLOCK_ANIM;
export const ROTATING_TILE_ACTIONS = new Map<number, number>([
  [C.MOVEMENT_ACTION_LOCK_ANIM, LOCK_ANIM], [C.MOVEMENT_ACTION_UNLOCK_ANIM, UNLOCK_ANIM],
  [C.MOVEMENT_ACTION_WALK_NORMAL_RIGHT, FR.MOVEMENT_ACTION_WALK_NORMAL_RIGHT],
  [C.MOVEMENT_ACTION_WALK_NORMAL_DOWN, FR.MOVEMENT_ACTION_WALK_NORMAL_DOWN],
  [C.MOVEMENT_ACTION_WALK_NORMAL_LEFT, FR.MOVEMENT_ACTION_WALK_NORMAL_LEFT],
  [C.MOVEMENT_ACTION_WALK_NORMAL_UP, FR.MOVEMENT_ACTION_WALK_NORMAL_UP],
  [C.MOVEMENT_ACTION_FACE_RIGHT, FR.MOVEMENT_ACTION_FACE_RIGHT],
  [C.MOVEMENT_ACTION_FACE_DOWN, FR.MOVEMENT_ACTION_FACE_DOWN],
  [C.MOVEMENT_ACTION_FACE_LEFT, FR.MOVEMENT_ACTION_FACE_LEFT],
  [C.MOVEMENT_ACTION_FACE_UP, FR.MOVEMENT_ACTION_FACE_UP],
  [C.MOVEMENT_ACTION_STEP_END, FR.MOVEMENT_ACTION_STEP_END],
]);

// One source animation-lock allocation per Overworld, shared by puzzle and ROM scripts.
const movementInstances = new WeakMap<Overworld, EmeraldRotatingTileMovement>();
export function emeraldMovement(ow: Overworld): EmeraldRotatingTileMovement {
  let movement = movementInstances.get(ow);
  if (!movement) { movement = new EmeraldRotatingTileMovement(ow); movementInstances.set(ow, movement); }
  return movement;
}

/** Regional byte -> shared action. A missing body is an error, never a numeric alias. */
export function translateEmeraldMovementAction(action: number): number {
  const translated = EMERALD_SHARED_MOVEMENT_ACTIONS.get(action) ?? ROTATING_TILE_ACTIONS.get(action);
  if (translated === undefined) throw Error(`Unsupported Emerald movement ${action}: ${EMERALD_REGIONAL_MOVEMENT_ACTIONS.get(action) ?? 'unknown source action'}`);
  return translated;
}

/** Preflight the complete source script before scheduling any movement. */
export function validateEmeraldMovementScript(ptr: number): void {
  for (;;) {
    const action = rom.u8(ptr++);
    translateEmeraldMovementAction(action);
    if (action === C.MOVEMENT_ACTION_STEP_END) return;
  }
}

export class EmeraldRotatingTileMovement {
  private sLockedAnimObjectEvents: { localIds: number[]; count: number } | null = null;
  constructor(private readonly ow: Overworld) {
    ow.objects.isExternalMovementAnimationLocked = object => this.sLockedAnimObjectEvents !== null
      && this.FindLockedObjectEventIndex(object) !== C.OBJECT_EVENTS_COUNT;
    ow.objects.externalMovementActions.set(LOCK_ANIM, object => this.lockAction(object));
    ow.objects.externalMovementActions.set(UNLOCK_ANIM, object => this.unlockAction(object));
  }
  start(localId: number, mapNum: number, mapGroup: number, script: number[]): void {
    const translated = script.map(action => {
      const id = ROTATING_TILE_ACTIONS.get(action);
      if (id === undefined) throw Error(`Unsupported Emerald rotating tile movement ${action}`);
      return id;
    });
    this.ow.game.scriptMovement.ScriptMovement_StartObjectMovementScript(localId, mapNum, mapGroup, translated);
  }
  // Source action table: Step0, then MovementAction_Finish (TRUE, without side effects).
  private lockAction(object: ObjectEvent): boolean {
    if (object.sprite.data[2] === 0) this.MovementAction_LockAnim_Step0(object);
    return true;
  }
  private unlockAction(object: ObjectEvent): boolean {
    if (object.sprite.data[2] === 0) this.MovementAction_UnlockAnim_Step0(object);
    return true;
  }
  /** event_object_movement.c MovementAction_LockAnim_Step0 */
  MovementAction_LockAnim_Step0(object: ObjectEvent): boolean {
    let ableToStore = false;
    if (!this.sLockedAnimObjectEvents) {
      this.sLockedAnimObjectEvents = { localIds: new Array(C.OBJECT_EVENTS_COUNT).fill(C.LOCALID_NONE), count: 1 };
      this.sLockedAnimObjectEvents.localIds[0] = object.localId;
      ableToStore = true;
    } else {
      let firstFreeSlot = C.OBJECT_EVENTS_COUNT, found = false;
      for (let i = 0; i < C.OBJECT_EVENTS_COUNT; i++) {
        if (firstFreeSlot === C.OBJECT_EVENTS_COUNT && this.sLockedAnimObjectEvents.localIds[i] === C.LOCALID_NONE) firstFreeSlot = i;
        if (this.sLockedAnimObjectEvents.localIds[i] === object.localId) { found = true; break; }
      }
      if (!found && firstFreeSlot !== C.OBJECT_EVENTS_COUNT) {
        this.sLockedAnimObjectEvents.localIds[firstFreeSlot] = object.localId;
        this.sLockedAnimObjectEvents.count++;
        ableToStore = true;
      }
    }
    if (ableToStore) { object.inanimate = true; object.facingDirectionLocked = true; }
    object.sprite.data[2] = 1;
    return true;
  }
  /** event_object_movement.c MovementAction_UnlockAnim_Step0 */
  MovementAction_UnlockAnim_Step0(object: ObjectEvent): boolean {
    object.sprite.data[2] = 1;
    if (this.sLockedAnimObjectEvents) {
      let ableToStore = false;
      const index = this.FindLockedObjectEventIndex(object);
      if (index !== C.OBJECT_EVENTS_COUNT) {
        this.sLockedAnimObjectEvents.localIds[index] = C.LOCALID_NONE;
        this.sLockedAnimObjectEvents.count--;
        ableToStore = true;
      }
      if (this.sLockedAnimObjectEvents.count === 0) this.sLockedAnimObjectEvents = null;
      if (ableToStore) {
        // Read the Emerald graphics field directly: the shared graphicsInfo helper applies
        // FireRed's 152-entry bounds, whereas Emerald's source table has 239 entries.
        const graphicsId = this.ow.objects.resolveGraphicsId(object.graphicsId);
        object.inanimate = rom.objects.gfx[String(graphicsId)].inanimate;
        object.facingDirectionLocked = false;
        object.sprite.animPaused = false;
      }
    }
    return true;
  }
  /** event_object_movement.c FindLockedObjectEventIndex */
  FindLockedObjectEventIndex(object: ObjectEvent): number {
    for (let i = 0; i < C.OBJECT_EVENTS_COUNT; i++) if (this.sLockedAnimObjectEvents!.localIds[i] === object.localId) return i;
    return C.OBJECT_EVENTS_COUNT;
  }
}
