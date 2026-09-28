// Port of field_player_avatar.c (walking, running, turning, ledges, surf,
// forced movement tiles) for the on-foot and surfing states.

import * as MB from "../generated/metatileBehavior";
import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { B_BUTTON } from "../gba/input";
import { tasks } from "../gba/tasks";
import { rom } from "../rom";
import { flagGet, incrementGameStat } from "../save";
import { QuestLogApplyPlayerAvatarTransition } from "../questLogPlayer";
import { QuestLogRecordNPCStepWithDuration, QuestLogRecordPlayerStep, QuestLogRecordPlayerStepWithDuration } from "../questLogEvents";
import {
  actionFace, actionJump2, actionJumpInPlace, actionPlayerRun, actionRideWaterCurrent, actionSpin, actionWalkFast, actionWalkInPlaceFast,
  actionWalkInPlaceSlow, actionWalkNormal, actionWalkSlow, COLLISION_DIRECTIONAL_STAIR_WARP, COLLISION_ELEVATION_MISMATCH, COLLISION_LEDGE_JUMP,
  actionWalkSlower, COLLISION_NONE, COLLISION_OBJECT_EVENT, COLLISION_PUSHED_BOULDER, COLLISION_STOP_SURFING, DIR_EAST, DIR_NONE, DIR_NORTH, DIR_SOUTH, DIR_WEST, OPPOSITE,
  DIRECTION_VECTORS, graphicsInfo, OBJECT_EVENTS_COUNT, type ObjectEvent,
} from "./objectEvents";
import type { Overworld } from "./overworld";

export const PLAYER_AVATAR_FLAG_ON_FOOT = 1 << 0;
export const PLAYER_AVATAR_FLAG_MACH_BIKE = 1 << 1;
export const PLAYER_AVATAR_FLAG_ACRO_BIKE = 1 << 2;
export const PLAYER_AVATAR_FLAG_SURFING = 1 << 3;
export const PLAYER_AVATAR_FLAG_UNDERWATER = 1 << 4;
export const PLAYER_AVATAR_FLAG_CONTROLLABLE = 1 << 5;
export const PLAYER_AVATAR_FLAG_FORCED = 1 << 6;
export const PLAYER_AVATAR_FLAG_DASH = 1 << 7;

export const NOT_MOVING = 0, TURN_DIRECTION = 1, MOVING = 2;
export const T_NOT_MOVING = 0, T_TILE_TRANSITION = 1, T_TILE_CENTER = 2;

export const PLAYER_AVATAR_GFX_NORMAL = 0, PLAYER_AVATAR_GFX_BIKE = 1, PLAYER_AVATAR_GFX_RIDE = 2, PLAYER_AVATAR_GFX_FIELD_MOVE = 3, PLAYER_AVATAR_GFX_FISH = 4, PLAYER_AVATAR_GFX_VSSEEKER = 5;
const BIKE_TRANS_FACE_DIRECTION = 0, BIKE_TRANS_TURNING = 1, BIKE_TRANS_MOVE = 2, BIKE_TRANS_DOWNHILL = 3, BIKE_TRANS_UPHILL = 4;
export const BIKE_STATE_NORMAL = 0, BIKE_STATE_TURNING = 1, BIKE_STATE_SLOPE = 2;
export const PLAYER_SPEED_STANDING = 0, PLAYER_SPEED_NORMAL = 1, PLAYER_SPEED_FAST = 2, PLAYER_SPEED_FASTER = 3, PLAYER_SPEED_FASTEST = 4;

export let gPlayerAvatar: PlayerAvatar | null = null;
export function SetPlayerAvatar(avatar: PlayerAvatar | null): void { gPlayerAvatar = avatar; }

export function PlayerGetDestCoords(): { x: number; y: number } {
  if (gPlayerAvatar?.object) {
    return { x: gPlayerAvatar.object.currentCoords.x, y: gPlayerAvatar.object.currentCoords.y };
  }
  return { x: 0, y: 0 };
}

export function TestPlayerAvatarFlags(flags: number): number {
  return (gPlayerAvatar?.flags ?? 0) & flags;
}

export function SetPlayerAvatarTransitionFlags(flags: number): void {
  gPlayerAvatar?.DoPlayerAvatarTransition(flags);
}

/** GetPlayerFacingDirection / GetPlayerMovementDirection (field_player_avatar.c). */
export function GetPlayerFacingDirection(): number { return gPlayerAvatar?.object.facingDirection ?? 0; }
export function GetPlayerMovementDirection(): number { return gPlayerAvatar?.object.movementDirection ?? 0; }
/** PlayerGetElevation returns the player's previous elevation byte. */
export function PlayerGetElevation(): number { return gPlayerAvatar?.object.previousElevation ?? 0; }
export function GetPlayerAvatarFlags(): number { return gPlayerAvatar?.flags ?? 0; }
export function GetPlayerAvatarGraphicsIdByStateIdAndGender(state: number, gender: number): number {
  return PlayerAvatar.graphicsId(state, gender);
}
export function GetRivalAvatarGraphicsIdByStateIdAndGender(state: number, gender: number): number {
  return GetPlayerAvatarGraphicsIdByStateIdAndGender(state, gender);
}
export function GetRSAvatarGraphicsIdByGender(gender: number): number {
  return [C.OBJ_EVENT_GFX_RS_BRENDAN, C.OBJ_EVENT_GFX_RS_MAY][gender] ?? 0;
}
export function GetPlayerAvatarGraphicsIdByStateId(state: number): number {
  return GetPlayerAvatarGraphicsIdByStateIdAndGender(state, gPlayerAvatar?.gender ?? 0);
}
export function GetPlayerAvatarGenderByGraphicsId(gfxId: number): number {
  const femaleGraphics = [C.OBJ_EVENT_GFX_GREEN_NORMAL, C.OBJ_EVENT_GFX_GREEN_BIKE, C.OBJ_EVENT_GFX_GREEN_SURF,
    C.OBJ_EVENT_GFX_GREEN_FIELD_MOVE, C.OBJ_EVENT_GFX_GREEN_FISH];
  return femaleGraphics.includes(gfxId) ? 1 : 0;
}
export function GetPlayerAvatarGraphicsIdByCurrentState(): number {
  const avatar = gPlayerAvatar;
  if (!avatar) return 0;
  return GetPlayerAvatarGraphicsIdByStateId(avatar.currentStateId());
}

export class PlayerAvatar {
  flags = PLAYER_AVATAR_FLAG_ON_FOOT;
  runningState = NOT_MOVING;
  tileTransitionState = T_NOT_MOVING;
  gender = 0;
  preventStep = false;
  lastSpinTile = 0;
  object!: ObjectEvent;
  surfBlob?: import("../gba/sprite").Sprite;

  constructor(private readonly ow: Overworld) {
    gPlayerAvatar = this;
  }

  static graphicsId(state: number, gender: number): number {
    const c = rom.constants;
    const table = [
      [c.OBJ_EVENT_GFX_RED_NORMAL, c.OBJ_EVENT_GFX_GREEN_NORMAL],
      [c.OBJ_EVENT_GFX_RED_BIKE, c.OBJ_EVENT_GFX_GREEN_BIKE],
      [c.OBJ_EVENT_GFX_RED_SURF, c.OBJ_EVENT_GFX_GREEN_SURF],
      [c.OBJ_EVENT_GFX_RED_FIELD_MOVE, c.OBJ_EVENT_GFX_GREEN_FIELD_MOVE],
      [c.OBJ_EVENT_GFX_RED_FISH, c.OBJ_EVENT_GFX_GREEN_FISH],
      [c.OBJ_EVENT_GFX_RED_VS_SEEKER, c.OBJ_EVENT_GFX_GREEN_VS_SEEKER],
    ];
    return table[state][gender] ?? 0;
  }

  /** InitPlayerAvatar */
  init(x: number, y: number, direction: number, gender: number): void {
    gPlayerAvatar = this;
    this.gender = gender;
    const object = this.ow.objects.spawnPlayer(x, y, PlayerAvatar.graphicsId(PLAYER_AVATAR_GFX_NORMAL, gender), direction, this.ow.map.elevationAt(x, y));
    this.object = object;
    this.flags = PLAYER_AVATAR_FLAG_ON_FOOT | PLAYER_AVATAR_FLAG_CONTROLLABLE;
    this.runningState = NOT_MOVING;
    this.tileTransitionState = T_NOT_MOVING;
    this.preventStep = false;
    object.hasShadow = false;
    this.ow.objects.turn(object, direction);
  }

  /**
   * SetPlayerAvatarTransitionFlags (field_player_avatar.c): ORs into transitionFlags then
   * calls DoPlayerAvatarTransition, which dispatches sPlayerAvatarTransitionFuncs bit by
   * bit. Applied immediately here instead of queued, since every caller already passes
   * the complete flag set for one transition and DoPlayerAvatarTransition clears
   * transitionFlags back to 0 before returning either way.
   */
  setTransitionFlags(transition: number): void {
    if (transition & PLAYER_AVATAR_FLAG_ON_FOOT) this.PlayerAvatarTransition_Normal();
    if (transition & (PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE)) {
      this.PlayerAvatarTransition_Bike();
      this.flags = (this.flags & ~(PLAYER_AVATAR_FLAG_ON_FOOT | PLAYER_AVATAR_FLAG_SURFING)) | (transition & (PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE));
    }
    if (transition & PLAYER_AVATAR_FLAG_SURFING) this.PlayerAvatarTransition_Surfing();
    if (transition & PLAYER_AVATAR_FLAG_UNDERWATER) this.PlayerAvatarTransition_Underwater();
    if (transition & PLAYER_AVATAR_FLAG_CONTROLLABLE) this.PlayerAvatarTransition_ReturnToField();
    if (transition & (PLAYER_AVATAR_FLAG_FORCED | PLAYER_AVATAR_FLAG_DASH)) this.PlayerAvatarTransition_Dummy();
  }

  /** DoPlayerAvatarTransition (field_player_avatar.c); dispatches the requested state bits. */
  DoPlayerAvatarTransition(flags: number): void { this.setTransitionFlags(flags); }

  private PlayerAvatarTransition_Normal(): void { QuestLogApplyPlayerAvatarTransition(this.ow, C.QL_PLAYER_GFX_NORMAL); }
  private PlayerAvatarTransition_Bike(): void {
    QuestLogApplyPlayerAvatarTransition(this.ow, C.QL_PLAYER_GFX_BIKE);
    this.BikeClearState(0, 0);
  }
  private PlayerAvatarTransition_Surfing(): void { QuestLogApplyPlayerAvatarTransition(this.ow, C.QL_PLAYER_GFX_SURF); }
  /** PlayerAvatarTransition_Underwater (empty FireRed callback). */
  private PlayerAvatarTransition_Underwater(): void {}
  /** PlayerAvatarTransition_Dummy (empty FireRed callback). */
  private PlayerAvatarTransition_Dummy(): void {}
  private PlayerAvatarTransition_ReturnToField(): void { this.flags |= PLAYER_AVATAR_FLAG_CONTROLLABLE; }

  setState(state: number): void {
    const id = PlayerAvatar.graphicsId(state, this.gender);
    if (id && id !== this.object.graphicsId) {
      graphicsInfo(id);
      this.ow.objects.setGraphicsId(this.object, id);
      this.ow.syncObjectSprites();
    }
  }

  /** GetPlayerAvatarGraphicsIdByCurrentState (as a PLAYER_AVATAR_GFX_* state). */
  currentStateId(): number {
    if (this.flags & PLAYER_AVATAR_FLAG_SURFING) return PLAYER_AVATAR_GFX_RIDE;
    if (this.flags & (PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE)) return PLAYER_AVATAR_GFX_BIKE;
    return PLAYER_AVATAR_GFX_NORMAL;
  }

  isDashing(): boolean {
    return (this.flags & PLAYER_AVATAR_FLAG_DASH) !== 0;
  }

  isSurfing(): boolean {
    return (this.flags & PLAYER_AVATAR_FLAG_SURFING) !== 0;
  }

  /** SetPlayerInvisibility (field_player_avatar.c), including the surfing field-effect sprite. */
  SetPlayerInvisibility(invisible: boolean): void {
    this.object.invisible = invisible;
    if (this.isSurfing()) this.ow.effects.setSurfBlobInvisible(invisible);
  }

  PlayerIsAnimActive(): boolean {
    return this.ow.objects.isMovementOverridden(this.object);
  }

  /** walkrun_is_standing_still / IsPlayerStandingStill */
  isStandingStill(): boolean {
    return this.tileTransitionState !== T_TILE_TRANSITION && !(this.object.heldMovementActive && !this.object.heldMovementFinished);
  }

  private PlayerAnimIsMultiFrameStationary(): boolean {
    const id = this.object.movementActionId;
    return id <= 0x07 || (id >= 0x18 && id <= 0x1c) || (id >= 0x21 && id <= 0x30) || (id >= 0x70 && id <= 0x7b) || (id >= 0x88 && id <= 0x8b);
  }

  private PlayerAnimIsMultiFrameStationaryAndStateNotTurning(): boolean {
    return this.PlayerAnimIsMultiFrameStationary() && this.runningState !== TURN_DIRECTION;
  }

  /** PlayerCheckIfAnimFinishedOrInactive (field_player_avatar.c). */
  private PlayerCheckIfAnimFinishedOrInactive(): boolean {
    return this.ow.objects.isHeldMovementFinished(this.object);
  }

  /** UpdatePlayerAvatarTransitionState */
  UpdatePlayerAvatarTransitionState(): void {
    this.tileTransitionState = T_NOT_MOVING;
    if (this.PlayerIsAnimActive()) {
      if (!this.PlayerCheckIfAnimFinishedOrInactive()) {
        if (!this.PlayerAnimIsMultiFrameStationary()) this.tileTransitionState = T_TILE_TRANSITION;
      } else if (!this.PlayerAnimIsMultiFrameStationaryAndStateNotTurning()) {
        this.tileTransitionState = T_TILE_CENTER;
      }
    }
  }

  PlayerSetAnimId(actionId: number, copyable: number): void {
    if (this.PlayerIsAnimActive()) return;
    this.PlayerSetCopyableMovement(copyable);
    this.ow.objects.setHeldMovement(this.object, actionId);
    QuestLogRecordPlayerStep(actionId, this.ow.controlsLocked);
  }

  /** PlayerSetCopyableMovement (field_player_avatar.c). */
  private PlayerSetCopyableMovement(movement: number): void { this.object.playerCopyableMovement = movement & 0xff; }
  /** PlayerGetCopyableMovement (field_player_avatar.c). */
  PlayerGetCopyableMovement(): number { return this.object.playerCopyableMovement & 0xff; }

  /** QL_TryRecordPlayerStepWithDuration0 (field_player_avatar.c). */
  QL_TryRecordPlayerStepWithDuration0(movementAction: number): void {
    if (!this.ow.objects.setHeldMovement(this.object, movementAction)) QuestLogRecordPlayerStepWithDuration(movementAction, 0);
  }

  /** QL_TryRecordNPCStepWithDuration32 (field_player_avatar.c). */
  QL_TryRecordNPCStepWithDuration32(object: ObjectEvent, movementAction: number): void {
    if (!this.ow.objects.setHeldMovement(object, movementAction)) {
      QuestLogRecordNPCStepWithDuration(object.localId, object.mapNum, object.mapGroup, movementAction, 32);
    }
  }

  /** PlayerForceSetHeldMovement (field_player_avatar.c). */
  PlayerForceSetHeldMovement(actionId: number): void {
    this.ow.objects.forceSetHeldMovement(this.object, actionId);
  }

  PlayerFaceDirection(direction: number): void { this.PlayerSetAnimId(actionFace(direction), 1); }
  PlayerTurnInPlace(direction: number): void { this.PlayerSetAnimId(actionWalkInPlaceFast(direction), 1); }
  PlayerWalkNormal(direction: number): void { this.PlayerSetAnimId(actionWalkNormal(direction), 2); }
  PlayerWalkSlow(direction: number): void { this.PlayerSetAnimId(actionWalkSlow(direction), 2); }
  PlayerWalkFast(direction: number): void { this.PlayerSetAnimId(actionWalkFast(direction), 2); }
  PlayerRun(direction: number): void { this.PlayerSetAnimId(actionPlayerRun(direction), 2); }
  PlayerRunSlow(direction: number): void { this.PlayerSetAnimId(0x41 + direction - 1, 2); }
  PlayerRideWaterCurrent(direction: number): void { this.PlayerSetAnimId(actionRideWaterCurrent(direction), 2); }
  PlayerGoSpin(direction: number): void { this.PlayerSetAnimId(actionSpin(direction), 3); }

  /** PlayerWalkSlower (field_player_avatar.c). */
  PlayerWalkSlower(direction: number): void { this.PlayerSetAnimId(actionWalkSlower(direction), 2); }
  /** PlayerGlide (field_player_avatar.c). */
  PlayerGlide(direction: number): void {
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_GLIDE_DOWN, C.MOVEMENT_ACTION_GLIDE_DOWN, C.MOVEMENT_ACTION_GLIDE_UP, C.MOVEMENT_ACTION_GLIDE_LEFT, C.MOVEMENT_ACTION_GLIDE_RIGHT]), 2);
  }
  /** PlayerWalkFaster (field_player_avatar.c). */
  PlayerWalkFaster(direction: number): void {
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_WALK_FASTER_DOWN, C.MOVEMENT_ACTION_WALK_FASTER_DOWN, C.MOVEMENT_ACTION_WALK_FASTER_UP, C.MOVEMENT_ACTION_WALK_FASTER_LEFT, C.MOVEMENT_ACTION_WALK_FASTER_RIGHT]), 2);
  }
  /** PlayerFaceDirectionFast (field_player_avatar.c). */
  PlayerFaceDirectionFast(direction: number): void {
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_FACE_DOWN_FAST, C.MOVEMENT_ACTION_FACE_DOWN_FAST, C.MOVEMENT_ACTION_FACE_UP_FAST, C.MOVEMENT_ACTION_FACE_LEFT_FAST, C.MOVEMENT_ACTION_FACE_RIGHT_FAST]), 1);
  }
  /** PlayerShakeHeadOrWalkInPlace (field_player_avatar.c). */
  PlayerShakeHeadOrWalkInPlace(): void { this.PlayerSetAnimId(C.MOVEMENT_ACTION_SHAKE_HEAD_OR_WALK_IN_PLACE, 0); }

  /** HandleEnforcedLookDirectionOnPlayerStopMoving (field_player_avatar.c). */
  HandleEnforcedLookDirectionOnPlayerStopMoving(): void {
    if ((this.tileTransitionState === T_TILE_CENTER || this.tileTransitionState === T_NOT_MOVING)
      && this.IsPlayerNotUsingAcroBikeOnBumpySlope()) this.PlayerForceSetHeldMovement(actionFace(this.object.facingDirection));
  }

  private acroMovementAction(direction: number, actions: readonly number[]): number {
    const directionU8 = direction & 0xff;
    return actions[directionU8 > DIR_EAST ? DIR_NONE : directionU8]!;
  }

  /** PlayerIdleWheelie (field_player_avatar.c). */
  private PlayerIdleWheelie(direction: number): void {
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_ACRO_WHEELIE_FACE_DOWN, C.MOVEMENT_ACTION_ACRO_WHEELIE_FACE_DOWN, C.MOVEMENT_ACTION_ACRO_WHEELIE_FACE_UP, C.MOVEMENT_ACTION_ACRO_WHEELIE_FACE_LEFT, C.MOVEMENT_ACTION_ACRO_WHEELIE_FACE_RIGHT]), 1);
  }
  /** PlayerStartWheelie (field_player_avatar.c). */
  private PlayerStartWheelie(direction: number): void {
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_DOWN, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_DOWN, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_UP, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_LEFT, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_RIGHT]), 1);
  }
  /** PlayerEndWheelie (field_player_avatar.c). */
  private PlayerEndWheelie(direction: number): void {
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_ACRO_END_WHEELIE_FACE_DOWN, C.MOVEMENT_ACTION_ACRO_END_WHEELIE_FACE_DOWN, C.MOVEMENT_ACTION_ACRO_END_WHEELIE_FACE_UP, C.MOVEMENT_ACTION_ACRO_END_WHEELIE_FACE_LEFT, C.MOVEMENT_ACTION_ACRO_END_WHEELIE_FACE_RIGHT]), 1);
  }
  /** PlayerStandingHoppingWheelie (field_player_avatar.c). */
  private PlayerStandingHoppingWheelie(direction: number): void {
    sound.playSE(sound.c("SE_BIKE_HOP"));
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_DOWN, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_DOWN, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_UP, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_LEFT, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_RIGHT]), 1);
  }
  /** PlayerMovingHoppingWheelie (field_player_avatar.c). */
  private PlayerMovingHoppingWheelie(direction: number): void {
    sound.playSE(sound.c("SE_BIKE_HOP"));
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_DOWN, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_DOWN, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_UP, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_LEFT, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_RIGHT]), 2);
  }
  /** PlayerLedgeHoppingWheelie (field_player_avatar.c). */
  private PlayerLedgeHoppingWheelie(direction: number): void {
    sound.playSE(sound.c("SE_BIKE_HOP"));
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_DOWN, C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_DOWN, C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_UP, C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_LEFT, C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_RIGHT]), 8);
  }
  /** PlayerAcroTurnJump (field_player_avatar.c). */
  private PlayerAcroTurnJump(direction: number): void {
    sound.playSE(sound.c("SE_BIKE_HOP"));
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_JUMP_IN_PLACE_UP_DOWN, C.MOVEMENT_ACTION_JUMP_IN_PLACE_UP_DOWN, C.MOVEMENT_ACTION_JUMP_IN_PLACE_DOWN_UP, C.MOVEMENT_ACTION_JUMP_IN_PLACE_RIGHT_LEFT, C.MOVEMENT_ACTION_JUMP_IN_PLACE_LEFT_RIGHT]), 1);
  }
  /** PlayerAcroWheelieCollide (field_player_avatar.c). */
  private PlayerAcroWheelieCollide(direction: number): void {
    sound.playSE(sound.c("SE_WALL_HIT"));
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_ACRO_WHEELIE_IN_PLACE_DOWN, C.MOVEMENT_ACTION_ACRO_WHEELIE_IN_PLACE_DOWN, C.MOVEMENT_ACTION_ACRO_WHEELIE_IN_PLACE_UP, C.MOVEMENT_ACTION_ACRO_WHEELIE_IN_PLACE_LEFT, C.MOVEMENT_ACTION_ACRO_WHEELIE_IN_PLACE_RIGHT]), 2);
  }
  /** PlayerAcroPopWheelie (field_player_avatar.c). */
  private PlayerAcroPopWheelie(direction: number): void {
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_DOWN, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_DOWN, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_UP, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_LEFT, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_RIGHT]), 2);
  }
  /** PlayerAcroWheelieMove (field_player_avatar.c). */
  private PlayerAcroWheelieMove(direction: number): void {
    this.PlayerSetAnimId(this.acroMovementAction(direction, [C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_DOWN, C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_DOWN, C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_UP, C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_LEFT, C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_RIGHT]), 2);
  }

  PlayerJumpLedge(direction: number): void {
    sound.playSE(sound.c("SE_LEDGE"));
    this.PlayerSetAnimId(actionJump2(direction), 8);
  }

  PlayerNotOnBikeCollide(direction: number): void {
    this.PlayCollisionSoundIfNotFacingWarp(direction);
    this.PlayerSetAnimId(actionWalkInPlaceSlow(direction), 2);
  }

  PlayCollisionSoundIfNotFacingWarp(direction: number): void {
    const behavior = this.object.currentMetatileBehavior;
    const arrowChecks = [MB.MetatileBehavior_IsSouthArrowWarp, MB.MetatileBehavior_IsNorthArrowWarp, MB.MetatileBehavior_IsWestArrowWarp, MB.MetatileBehavior_IsEastArrowWarp];
    if (arrowChecks[direction - 1]?.(behavior)) return;
    if (direction === DIR_WEST && (MB.MetatileBehavior_IsDirectionalUpLeftStairWarp(behavior) || MB.MetatileBehavior_IsDirectionalDownLeftStairWarp(behavior))) return;
    if (direction === DIR_EAST && (MB.MetatileBehavior_IsDirectionalUpRightStairWarp(behavior) || MB.MetatileBehavior_IsDirectionalDownRightStairWarp(behavior))) return;
    if (direction === DIR_NORTH) {
      const b = this.ow.map.behaviorAt(this.object.currentCoords.x, this.object.currentCoords.y - 1);
      if (MB.MetatileBehavior_IsWarpDoor(b)) return;
    }
    sound.playSE(sound.c("SE_WALL_HIT"));
  }

  /** player_step */
  step(direction: number, newKeys: number, heldKeys: number): void {
    if (this.preventStep) return;
    if (this.tryUpdateSpinDirection()) return;
    if (this.tryInterruptSpecialAnim(direction)) return;
    // npc_clear_strange_bits
    this.object.inanimate = false;
    this.object.disableAnim = false;
    this.object.facingDirectionLocked = false;
    this.flags &= ~PLAYER_AVATAR_FLAG_DASH;
    if (!this.tryForcedMovement()) {
      // MovePlayerAvatarUsingKeypadInput
      if (this.flags & (PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE)) this.movePlayerOnBike(direction, newKeys, heldKeys);
      else this.movePlayerNotOnBike(direction, heldKeys);
      if (this.runningState === MOVING) this.flags &= ~PLAYER_AVATAR_FLAG_CONTROLLABLE;
    }
  }

  private tryInterruptSpecialAnim(direction: number): boolean {
    const o = this.object;
    if (this.ow.objects.isMovementOverridden(o) && !this.ow.objects.ObjectEventClearHeldMovementIfFinished(o)) {
      const held = o.movementActionId;
      if (held > 0x20 && held < 0x25) {
        if (direction !== DIR_NONE && o.movementDirection !== direction) {
          this.ow.objects.clearHeldMovement(o);
          return false;
        }
      }
      return true;
    }
    return false;
  }

  private tryUpdateSpinDirection(): boolean {
    if ((this.flags & PLAYER_AVATAR_FLAG_FORCED) && MB.MetatileBehavior_IsSpinTile(this.lastSpinTile)) {
      const o = this.object;
      if (o.heldMovementFinished) {
        if (MB.MetatileBehavior_IsStopSpinning(o.currentMetatileBehavior)) return false;
        if (MB.MetatileBehavior_IsSpinTile(o.currentMetatileBehavior)) this.lastSpinTile = o.currentMetatileBehavior;
        this.ow.objects.clearHeldMovement(o);
        this.PlayerApplyTileForcedMovement(this.lastSpinTile);
      }
      return true;
    }
    return false;
  }

  /** sForcedMovementFuncs (field_player_avatar.c); the fallback ForcedMovement_None
   * entry lives in tryForcedMovement/applyTileForcedMovement, matching the C loop that
   * stops at the first matching check (or the trailing {NULL, ForcedMovement_None}). */
  private forcedMovementTable(): Array<[(b: number) => boolean, () => boolean]> {
    return [
      [MB.MetatileBehavior_IsTrickHouseSlipperyFloor, () => this.ForcedMovement_Slip()],
      [MB.MetatileBehavior_IsIce_2, () => this.ForcedMovement_Slip()],
      [MB.MetatileBehavior_IsWalkSouth, () => this.ForcedMovement_WalkSouth()],
      [MB.MetatileBehavior_IsWalkNorth, () => this.ForcedMovement_WalkNorth()],
      [MB.MetatileBehavior_IsWalkWest, () => this.ForcedMovement_WalkWest()],
      [MB.MetatileBehavior_IsWalkEast, () => this.ForcedMovement_WalkEast()],
      [MB.MetatileBehavior_IsSouthwardCurrent, () => this.ForcedMovement_PushedSouthByCurrent()],
      [MB.MetatileBehavior_IsNorthwardCurrent, () => this.ForcedMovement_PushedNorthByCurrent()],
      [MB.MetatileBehavior_IsWestwardCurrent, () => this.ForcedMovement_PushedWestByCurrent()],
      [MB.MetatileBehavior_IsEastwardCurrent, () => this.ForcedMovement_PushedEastByCurrent()],
      [MB.MetatileBehavior_IsSpinRight, () => this.ForcedMovement_SpinRight()],
      [MB.MetatileBehavior_IsSpinLeft, () => this.ForcedMovement_SpinLeft()],
      [MB.MetatileBehavior_IsSpinUp, () => this.ForcedMovement_SpinUp()],
      [MB.MetatileBehavior_IsSpinDown, () => this.ForcedMovement_SpinDown()],
      [MB.MetatileBehavior_IsSlideSouth, () => this.ForcedMovement_SlideSouth()],
      [MB.MetatileBehavior_IsSlideNorth, () => this.ForcedMovement_SlideNorth()],
      [MB.MetatileBehavior_IsSlideWest, () => this.ForcedMovement_SlideWest()],
      [MB.MetatileBehavior_IsSlideEast, () => this.ForcedMovement_SlideEast()],
      // MetatileBehavior_IsWaterfall reuses ForcedMovement_PushedSouthByCurrent directly in C.
      [MB.MetatileBehavior_IsWaterfall, () => this.ForcedMovement_PushedSouthByCurrent()],
      [MB.MetatileBehavior_IsSecretBaseJumpMat, () => this.ForcedMovement_MatJump()],
      [MB.MetatileBehavior_IsSecretBaseSpinMat, () => this.ForcedMovement_MatSpin()],
    ];
  }

  private ForcedMovement_Slip(): boolean { return this.DoForcedMovementInCurrentDirection((d) => this.PlayerWalkFast(d)); }
  private ForcedMovement_WalkSouth(): boolean { return this.DoForcedMovement(DIR_SOUTH, (d) => this.PlayerWalkNormal(d)); }
  private ForcedMovement_WalkNorth(): boolean { return this.DoForcedMovement(DIR_NORTH, (d) => this.PlayerWalkNormal(d)); }
  private ForcedMovement_WalkWest(): boolean { return this.DoForcedMovement(DIR_WEST, (d) => this.PlayerWalkNormal(d)); }
  private ForcedMovement_WalkEast(): boolean { return this.DoForcedMovement(DIR_EAST, (d) => this.PlayerWalkNormal(d)); }
  private ForcedMovement_PushedSouthByCurrent(): boolean { return this.DoForcedMovement(DIR_SOUTH, (d) => this.PlayerRideWaterCurrent(d)); }
  private ForcedMovement_PushedNorthByCurrent(): boolean { return this.DoForcedMovement(DIR_NORTH, (d) => this.PlayerRideWaterCurrent(d)); }
  private ForcedMovement_PushedWestByCurrent(): boolean { return this.DoForcedMovement(DIR_WEST, (d) => this.PlayerRideWaterCurrent(d)); }
  private ForcedMovement_PushedEastByCurrent(): boolean { return this.DoForcedMovement(DIR_EAST, (d) => this.PlayerRideWaterCurrent(d)); }
  private PlaySpinSound(): void { sound.playSE(sound.c("SE_M_RAZOR_WIND2")); }
  private ForcedMovement_SpinRight(): boolean { this.PlaySpinSound(); return this.DoForcedMovement(DIR_EAST, (d) => this.PlayerGoSpin(d)); }
  private ForcedMovement_SpinLeft(): boolean { this.PlaySpinSound(); return this.DoForcedMovement(DIR_WEST, (d) => this.PlayerGoSpin(d)); }
  private ForcedMovement_SpinUp(): boolean { this.PlaySpinSound(); return this.DoForcedMovement(DIR_NORTH, (d) => this.PlayerGoSpin(d)); }
  private ForcedMovement_SpinDown(): boolean { this.PlaySpinSound(); return this.DoForcedMovement(DIR_SOUTH, (d) => this.PlayerGoSpin(d)); }
  private ForcedMovement_SlideSouth(): boolean { return this.ForcedMovement_Slide(DIR_SOUTH); }
  private ForcedMovement_SlideNorth(): boolean { return this.ForcedMovement_Slide(DIR_NORTH); }
  private ForcedMovement_SlideWest(): boolean { return this.ForcedMovement_Slide(DIR_WEST); }
  private ForcedMovement_SlideEast(): boolean { return this.ForcedMovement_Slide(DIR_EAST); }

  /** ForcedMovement_MatJump (field_player_avatar.c). */
  private ForcedMovement_MatJump(): boolean {
    this.DoPlayerMatJump();
    return true;
  }

  /** DoPlayerMatJump / DoPlayerAvatarSecretBaseMatJump (field_player_avatar.c): the
   * sPlayerAvatarSecretBaseMatJump table has a single entry, so the C tight while-loop
   * (`while (sPlayerAvatarSecretBaseMatJump[data[0]](...))`) reduces to one call. */
  private DoPlayerMatJump(): void {
    let taskId = -1;
    let steps = 0;
    /** PlayerAvatar_DoSecretBaseMatJump (field_player_avatar.c). */
    const PlayerAvatar_DoSecretBaseMatJump = (): boolean => {
      this.preventStep = true;
      if (this.ow.objects.ObjectEventClearHeldMovementIfFinished(this.object) === 0) return false;
      sound.playSE(sound.c("SE_LEDGE"));
      this.ow.objects.setHeldMovement(this.object, actionJumpInPlace(this.object.facingDirection));
      steps++;
      if (steps > 1) {
        this.preventStep = false;
        this.setTransitionFlags(PLAYER_AVATAR_FLAG_CONTROLLABLE);
        tasks.destroy(taskId);
      }
      return false;
    };
    taskId = this.ow.effects.tasks.create(PlayerAvatar_DoSecretBaseMatJump, 0xff);
    PlayerAvatar_DoSecretBaseMatJump();
  }

  /** ForcedMovement_MatSpin (field_player_avatar.c). */
  private ForcedMovement_MatSpin(): boolean {
    this.DoPlayerMatSpin();
    return true;
  }

  /** DoPlayerMatSpin / PlayerAvatar_DoSecretBaseMatSpin (field_player_avatar.c):
   * sPlayerAvatarSecretBaseMatSpin = [Step0, Step1, Step2, Step3], run through
   * task->data[0] by a tight while-loop (Step0 returns TRUE, so it always falls
   * straight into Step1 the same tick; Step1-3 return FALSE and wait a tick). */
  private DoPlayerMatSpin(): void {
    const object = this.object;
    const directions = [DIR_WEST, DIR_EAST, DIR_NORTH, DIR_SOUTH];
    const delays = [C.MOVEMENT_ACTION_DELAY_1, C.MOVEMENT_ACTION_DELAY_1, C.MOVEMENT_ACTION_DELAY_2, C.MOVEMENT_ACTION_DELAY_4, C.MOVEMENT_ACTION_DELAY_8];
    let taskId = -1;
    // task->data[0..2]: step index, initial (movement) direction, same-direction count.
    const data = [0, DIR_SOUTH, 0];
    const PlayerAvatar_SecretBaseMatSpinStep0 = (): boolean => {
      data[0]++;
      data[1] = object.movementDirection;
      this.preventStep = true;
      this.ow.controlsLocked = true;
      sound.playSE(sound.c("SE_WARP_IN"));
      return true;
    };
    const PlayerAvatar_SecretBaseMatSpinStep1 = (): boolean => {
      if (this.ow.objects.ObjectEventClearHeldMovementIfFinished(object) === 0) return false;
      const direction = directions[object.movementDirection - 1];
      if (direction === undefined) return false;
      this.ow.objects.setHeldMovement(object, actionFace(direction));
      if (direction === data[1]) data[2]++;
      data[0]++;
      if (data[2] > 3 && direction === OPPOSITE[data[1]]) data[0]++;
      return false;
    };
    const PlayerAvatar_SecretBaseMatSpinStep2 = (): boolean => {
      if (this.ow.objects.ObjectEventClearHeldMovementIfFinished(object) === 0) return false;
      this.ow.objects.setHeldMovement(object, delays[data[2]] ?? delays[4]!);
      data[0] = 1;
      return false;
    };
    const PlayerAvatar_SecretBaseMatSpinStep3 = (): boolean => {
      if (this.ow.objects.ObjectEventClearHeldMovementIfFinished(object) === 0) return false;
      this.ow.objects.setHeldMovement(object, actionWalkSlower(OPPOSITE[data[1]]));
      this.ow.controlsLocked = false;
      this.preventStep = false;
      tasks.destroy(taskId);
      return false;
    };
    const steps = [PlayerAvatar_SecretBaseMatSpinStep0, PlayerAvatar_SecretBaseMatSpinStep1, PlayerAvatar_SecretBaseMatSpinStep2, PlayerAvatar_SecretBaseMatSpinStep3];
    /** PlayerAvatar_DoSecretBaseMatSpin (field_player_avatar.c). */
    const PlayerAvatar_DoSecretBaseMatSpin = (): void => {
      while (steps[data[0]]!()) { /* tight loop, matching Task_BumpBoulder-style C dispatch */ }
    };
    taskId = this.ow.effects.tasks.create(PlayerAvatar_DoSecretBaseMatSpin, 0xff);
    PlayerAvatar_DoSecretBaseMatSpin();
  }

  private tryForcedMovement(): boolean {
    if (!(this.flags & PLAYER_AVATAR_FLAG_CONTROLLABLE)) {
      const behavior = this.object.currentMetatileBehavior;
      for (const [check, apply] of this.forcedMovementTable()) {
        if (check(behavior)) {
          this.lastSpinTile = behavior;
          return apply();
        }
      }
    }
    return this.ForcedMovement_None();
  }

  private PlayerApplyTileForcedMovement(behavior: number): void {
    for (const [check, apply] of this.forcedMovementTable()) if (check(behavior)) apply();
  }

  private ForcedMovement_None(): boolean {
    if (this.flags & PLAYER_AVATAR_FLAG_FORCED) {
      const o = this.object;
      o.facingDirectionLocked = false;
      o.enableAnim = true;
      this.ow.objects.setDirection(o, o.facingDirection);
      this.flags &= ~PLAYER_AVATAR_FLAG_FORCED;
    }
    return false;
  }

  /** CancelPlayerForcedMovement (field_player_avatar.c). */
  CancelPlayerForcedMovement(): void {
    this.ForcedMovement_None();
  }

  private DoForcedMovement(direction: number, action: (d: number) => void): boolean {
    const collision = this.checkCollision(direction);
    this.flags |= PLAYER_AVATAR_FLAG_FORCED;
    if (collision) {
      this.ForcedMovement_None();
      if (collision < COLLISION_STOP_SURFING) return false;
      if (collision === COLLISION_LEDGE_JUMP) this.PlayerJumpLedge(direction);
      this.flags |= PLAYER_AVATAR_FLAG_FORCED;
      this.runningState = MOVING;
      return true;
    }
    this.runningState = MOVING;
    action(direction);
    return true;
  }

  private DoForcedMovementInCurrentDirection(action: (d: number) => void): boolean {
    this.object.disableAnim = true;
    return this.DoForcedMovement(this.object.movementDirection, action);
  }

  private ForcedMovement_Slide(direction: number): boolean {
    this.object.disableAnim = true;
    this.object.facingDirectionLocked = true;
    return this.DoForcedMovement(direction, (d) => this.PlayerWalkFast(d));
  }

  // ---------------------------------------------------------------- bike.c

  acroBikeState = 0;
  private newDirBackup = DIR_NONE;
  bikeFrameCounter = 0;
  bikeSpeed = PLAYER_SPEED_STANDING;
  directionHistory = 0;
  abStartSelectHistory = 0;
  readonly dirTimerHistory = new Array<number>(8).fill(0);

  /** MovePlayerOnBike: sBikeInputHandlers → sBikeTransitions */
  private movePlayerOnBike(direction: number, newKeys: number, heldKeys: number): void {
    const transitionId = this.GetBikeTransitionId(direction, newKeys, heldKeys);
    switch (transitionId) {
      case BIKE_TRANS_FACE_DIRECTION: this.BikeTransition_FaceDirection(direction); break;
      case BIKE_TRANS_TURNING: this.BikeTransition_TurnDirection(direction); break;
      case BIKE_TRANS_MOVE: this.BikeTransition_MoveDirection(direction); break;
      case BIKE_TRANS_DOWNHILL: this.BikeTransition_Downhill(direction); break;
      case BIKE_TRANS_UPHILL: this.BikeTransition_Uphill(direction); break;
    }
  }

  private GetBikeTransitionId(direction: number, newKeys: number, heldKeys: number): number {
    switch (this.acroBikeState) {
      case BIKE_STATE_NORMAL: return this.BikeInputHandler_Normal(direction, newKeys, heldKeys);
      case BIKE_STATE_TURNING: return this.BikeInputHandler_Turning(direction, newKeys, heldKeys);
      case BIKE_STATE_SLOPE: return this.BikeInputHandler_Slope(direction, newKeys, heldKeys);
      default: return BIKE_TRANS_FACE_DIRECTION;
    }
  }

  private BikeInputHandler_Normal(direction: number, newKeys: number, heldKeys: number): number {
    const moveDirection = this.object.movementDirection;
    this.bikeFrameCounter = 0;
    if (MB.MetatileBehavior_IsCyclingRoadPullDownTile(this.object.currentMetatileBehavior)) {
      if (!(heldKeys & B_BUTTON)) {
        this.acroBikeState = BIKE_STATE_SLOPE; this.runningState = MOVING;
        return direction < DIR_NORTH ? BIKE_TRANS_DOWNHILL : BIKE_TRANS_UPHILL;
      } else if (direction !== DIR_NONE) {
        this.acroBikeState = BIKE_STATE_SLOPE; this.runningState = MOVING; return BIKE_TRANS_UPHILL;
      }
    }
    if (direction === DIR_NONE) { this.runningState = NOT_MOVING; return BIKE_TRANS_FACE_DIRECTION; }
    if (direction !== moveDirection && this.runningState !== MOVING) {
      this.acroBikeState = BIKE_STATE_TURNING; this.newDirBackup = direction; this.runningState = NOT_MOVING;
      return this.GetBikeTransitionId(direction, newKeys, heldKeys);
    }
    this.runningState = MOVING; return BIKE_TRANS_MOVE;
  }

  private BikeInputHandler_Turning(direction: number, newKeys: number, heldKeys: number): number {
    void direction; void newKeys; void heldKeys;
    this.runningState = TURN_DIRECTION; this.acroBikeState = BIKE_STATE_NORMAL; this.Bike_SetBikeStill();
    return BIKE_TRANS_TURNING;
  }

  private BikeInputHandler_Slope(direction: number, newKeys: number, heldKeys: number): number {
    void newKeys; void heldKeys;
    if (MB.MetatileBehavior_IsCyclingRoadPullDownTile(this.object.currentMetatileBehavior)) {
      if (direction !== this.object.movementDirection) {
        this.acroBikeState = BIKE_STATE_TURNING; this.newDirBackup = direction; this.runningState = NOT_MOVING;
        return this.GetBikeTransitionId(direction, newKeys, heldKeys);
      }
      this.runningState = MOVING; this.acroBikeState = BIKE_STATE_SLOPE;
      return direction < DIR_NORTH ? BIKE_TRANS_DOWNHILL : BIKE_TRANS_UPHILL;
    }
    this.acroBikeState = BIKE_STATE_NORMAL;
    if (direction === DIR_NONE) { this.runningState = NOT_MOVING; return BIKE_TRANS_FACE_DIRECTION; }
    this.runningState = MOVING; return BIKE_TRANS_MOVE;
  }

  private BikeTransition_FaceDirection(direction: number): void { this.PlayerFaceDirection(direction === DIR_NONE ? this.object.movementDirection : direction); }

  private BikeTransition_TurnDirection(direction: number): void {
    direction = this.newDirBackup;
    if (!this.CanBikeFaceDirectionOnRail(direction, this.object.currentMetatileBehavior)) direction = this.object.movementDirection;
    this.PlayerFaceDirection(direction);
  }

  private BikeTransition_MoveDirection(direction: number): void {
    if (!this.CanBikeFaceDirectionOnRail(direction, this.object.currentMetatileBehavior)) { this.PlayerFaceDirection(this.object.movementDirection); return; }
    const collision = this.GetBikeCollision(direction);
    if (collision > COLLISION_NONE && collision <= 11) {
      if (collision === COLLISION_LEDGE_JUMP) this.PlayerJumpLedge(direction);
      else if (collision !== COLLISION_STOP_SURFING && collision !== COLLISION_PUSHED_BOULDER && collision !== COLLISION_DIRECTIONAL_STAIR_WARP) {
        this.PlayerOnBikeCollide(direction);
      }
    } else if (collision === 14 || this.isMovingOnRockStairs(direction)) this.PlayerWalkFast(direction);
    else this.PlayerRideWaterCurrent(direction);
  }

  /** PlayerOnBikeCollide (field_player_avatar.c). */
  private PlayerOnBikeCollide(direction: number): void {
    this.PlayCollisionSoundIfNotFacingWarp(direction);
    this.PlayerSetAnimId(0x25 + Math.max(0, direction - 1), 2);
  }

  private BikeTransition_Downhill(direction: number): void {
    void direction;
    const collision = this.GetBikeCollision(DIR_SOUTH);
    if (collision === COLLISION_NONE) this.PlayerSetAnimId(0x35, 2);
    else if (collision === COLLISION_LEDGE_JUMP) this.PlayerJumpLedge(DIR_SOUTH);
  }

  private BikeTransition_Uphill(direction: number): void { if (this.GetBikeCollision(direction) === COLLISION_NONE) this.PlayerWalkNormal(direction); }

  /** GetBikeCollision / GetBikeCollisionAt */
  private GetBikeCollision(direction: number): number {
    const { x, y } = this.object.currentCoords;
    const [dx, dy] = DIRECTION_VECTORS[direction];
    const behavior = this.ow.map.behaviorAt(x + dx, y + dy);
    return this.GetBikeCollisionAt(x + dx, y + dy, direction, behavior);
  }

  private GetBikeCollisionAt(x: number, y: number, direction: number, behavior: number): number {
    let collision = this.checkObjectCollision(this.object, x, y, direction);
    if (collision <= COLLISION_OBJECT_EVENT) {
      if (MB.MetatileBehavior_IsCrackedIce(behavior)) return 14;
      if (collision === COLLISION_NONE && this.MetatileBehaviorForbidsBiking(behavior)) collision = 2; // COLLISION_IMPASSABLE
    }
    return collision;
  }

  MetatileBehaviorForbidsBiking(behavior: number): boolean {
    if (MB.MetatileBehavior_IsRunningDisallowed(behavior)) return true;
    if (!MB.MetatileBehavior_IsFortreeBridge(behavior)) return false;
    return !(this.object.previousElevation & 1);
  }

  private CanBikeFaceDirectionOnRail(direction: number, behavior: number): boolean {
    if (direction === DIR_EAST || direction === DIR_WEST) return !(MB.MetatileBehavior_IsIsolatedVerticalRail(behavior) || MB.MetatileBehavior_IsVerticalRail(behavior));
    return !(MB.MetatileBehavior_IsIsolatedHorizontalRail(behavior) || MB.MetatileBehavior_IsHorizontalRail(behavior));
  }

  /** IsBikingDisallowedByPlayer */
  IsBikingDisallowedByPlayer(): boolean {
    if (this.flags & (PLAYER_AVATAR_FLAG_UNDERWATER | PLAYER_AVATAR_FLAG_SURFING)) return true;
    const { x, y } = this.object.currentCoords;
    return this.MetatileBehaviorForbidsBiking(this.ow.map.behaviorAt(x, y));
  }

  isOnBike(): boolean {
    return (this.flags & (PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE)) !== 0;
  }

  /** bike.c GetOnOffBike */
  GetOnOffBike(flags: number): void {
    const ow = this.ow;
    if (this.isOnBike()) {
      this.setTransitionFlags(PLAYER_AVATAR_FLAG_ON_FOOT);
      ow.savedMusic = 0;
      ow.playSpecialMapMusic();
    } else {
      this.setTransitionFlags(flags);
      const sec = ow.header.regionMapSection;
      const c = rom.constants;
      if (sec !== c.MAPSEC_KANTO_VICTORY_ROAD && sec !== c.MAPSEC_ROUTE_23 && sec !== c.MAPSEC_INDIGO_PLATEAU) {
        ow.savedMusic = c.MUS_CYCLING;
        sound.playNewMapMusic(c.MUS_CYCLING);
      }
    }
  }

  /** RS_IsRunningDisallowed (Emerald compatibility API retained by the decomp). */
  RS_IsRunningDisallowed(behavior: number): boolean {
    return this.MetatileBehaviorForbidsBiking(behavior) || this.ow.header.mapType === rom.constants.MAP_TYPE_INDOOR;
  }

  /** IsRunningDisallowed: map-header gate plus metatile restrictions. */
  IsRunningDisallowed(behavior: number): boolean {
    return !this.ow.header.allowRunning || this.MetatileBehaviorForbidsBiking(behavior);
  }

  /** IsPlayerNotUsingAcroBikeOnBumpySlope. */
  IsPlayerNotUsingAcroBikeOnBumpySlope(): boolean {
    return !((this.flags & PLAYER_AVATAR_FLAG_ACRO_BIKE) && MB.MetatileBehavior_IsBumpySlope(this.ow.map.behaviorAt(this.object.currentCoords.x, this.object.currentCoords.y)));
  }

  /** BikeClearState: reset Acro trick/input history and Mach speed state. */
  BikeClearState(directionHistory: number, abStartSelectHistory: number): void {
    this.acroBikeState = BIKE_STATE_NORMAL;
    this.newDirBackup = 0;
    this.bikeFrameCounter = 0;
    this.bikeSpeed = PLAYER_SPEED_STANDING;
    this.directionHistory = directionHistory >>> 0;
    this.abStartSelectHistory = abStartSelectHistory >>> 0;
    this.lastSpinTile = 0;
    this.dirTimerHistory.fill(0);
  }

  Bike_UpdateBikeCounterSpeed(counter: number): void {
    const counterU8 = counter & 0xff;
    this.bikeFrameCounter = counterU8;
    this.bikeSpeed = (counterU8 + (this.bikeFrameCounter >> 1)) & 0xff;
  }

  private Bike_SetBikeStill(): void {
    this.bikeFrameCounter = 0;
    this.bikeSpeed = PLAYER_SPEED_STANDING;
  }

  GetPlayerSpeed(): number {
    if (this.flags & PLAYER_AVATAR_FLAG_MACH_BIKE) return [PLAYER_SPEED_NORMAL, PLAYER_SPEED_FAST, PLAYER_SPEED_FASTEST][this.bikeFrameCounter] ?? PLAYER_SPEED_NORMAL;
    if (this.flags & PLAYER_AVATAR_FLAG_ACRO_BIKE) return PLAYER_SPEED_FASTER;
    if (this.flags & (PLAYER_AVATAR_FLAG_SURFING | PLAYER_AVATAR_FLAG_DASH)) return PLAYER_SPEED_FAST;
    return PLAYER_SPEED_NORMAL;
  }

  Bike_HandleBumpySlopeJump(): void {
    if (!(this.flags & PLAYER_AVATAR_FLAG_ACRO_BIKE)) return;
    const { x, y } = this.object.currentCoords;
    if (MB.MetatileBehavior_IsBumpySlope(this.ow.map.behaviorAt(x, y))) {
      this.acroBikeState = BIKE_STATE_SLOPE;
      // PlayerUseAcroBikeOnBumpySlope has an empty body in FireRed's C source.
    }
  }

  StopPlayerAvatar(): void {
    const o = this.object;
    o.inanimate = false;
    o.disableAnim = false;
    o.facingDirectionLocked = false;
    this.flags &= ~PLAYER_AVATAR_FLAG_DASH;
    this.ow.objects.setDirection(o, o.facingDirection);
    if (this.flags & (PLAYER_AVATAR_FLAG_MACH_BIKE | PLAYER_AVATAR_FLAG_ACRO_BIKE)) {
      this.Bike_HandleBumpySlopeJump();
      this.Bike_UpdateBikeCounterSpeed(0);
    }
  }

  private movePlayerNotOnBike(direction: number, heldKeys: number): void {
    // CheckMovementInputNotOnBike
    if (direction === DIR_NONE) {
      this.runningState = NOT_MOVING;
      this.PlayerFaceDirection(this.object.facingDirection);
      return;
    }
    if (direction !== this.object.movementDirection && this.runningState !== MOVING) {
      this.runningState = TURN_DIRECTION;
      this.PlayerTurnInPlace(direction);
      return;
    }
    this.runningState = MOVING;
    // PlayerNotOnBikeMoving
    const collision = this.checkCollision(direction);
    if (collision !== COLLISION_NONE) {
      if (collision === COLLISION_LEDGE_JUMP) this.PlayerJumpLedge(direction);
      else if (collision === COLLISION_DIRECTIONAL_STAIR_WARP) this.PlayerFaceDirection(direction);
      else if (collision !== COLLISION_STOP_SURFING && collision !== COLLISION_PUSHED_BOULDER) this.PlayerNotOnBikeCollide(direction);
      return;
    }
    if (this.flags & PLAYER_AVATAR_FLAG_SURFING) {
      this.PlayerWalkFast(direction);
      return;
    }
    const canRun = (heldKeys & B_BUTTON) && flagGet(rom.constants.FLAG_SYS_B_DASH) && !this.IsRunningDisallowed(this.object.currentMetatileBehavior);
    if (canRun) {
      if (this.isMovingOnRockStairs(direction)) this.PlayerRunSlow(direction);
      else this.PlayerRun(direction);
      this.flags |= PLAYER_AVATAR_FLAG_DASH;
    } else if (this.isMovingOnRockStairs(direction)) {
      this.PlayerWalkSlow(direction);
    } else {
      this.PlayerWalkNormal(direction);
    }
  }

  private isMovingOnRockStairs(direction: number): boolean {
    const { x, y } = this.object.currentCoords;
    if (direction === DIR_NORTH) return MB.MetatileBehavior_IsRockStairs(this.ow.map.behaviorAt(x, y));
    if (direction === DIR_SOUTH) return MB.MetatileBehavior_IsRockStairs(this.ow.map.behaviorAt(x, y + 1));
    return false;
  }

  /** CheckForPlayerAvatarCollision */
  checkCollision(direction: number): number {
    const { x, y } = this.object.currentCoords;
    if (this.isDirectionalStairWarp(this.ow.map.behaviorAt(x, y), direction)) return COLLISION_DIRECTIONAL_STAIR_WARP;
    const [dx, dy] = DIRECTION_VECTORS[direction];
    return this.checkObjectCollision(this.object, x + dx, y + dy, direction);
  }

  isDirectionalStairWarp(behavior: number, direction: number): boolean {
    if (direction === DIR_WEST) return MB.MetatileBehavior_IsDirectionalUpLeftStairWarp(behavior) || MB.MetatileBehavior_IsDirectionalDownLeftStairWarp(behavior);
    if (direction === DIR_EAST) return MB.MetatileBehavior_IsDirectionalUpRightStairWarp(behavior) || MB.MetatileBehavior_IsDirectionalDownRightStairWarp(behavior);
    return false;
  }

  /** CheckForObjectEventCollision */
  checkObjectCollision(object: ObjectEvent, x: number, y: number, direction: number): number {
    const collision = this.ow.objects.GetCollisionAtCoords(object, x, y, direction);
    if (collision === COLLISION_ELEVATION_MISMATCH && this.canStopSurfing(x, y, direction)) return COLLISION_STOP_SURFING;
    if (this.ledgeJumpDirection(x, y, direction) !== DIR_NONE) {
      incrementGameStat(rom.constants.GAME_STAT_JUMPED_DOWN_LEDGES ?? 0);
      return COLLISION_LEDGE_JUMP;
    }
    if (collision === COLLISION_OBJECT_EVENT && this.TryPushBoulder(x, y, direction)) return COLLISION_PUSHED_BOULDER;
    if (collision === COLLISION_NONE) {
      const acroCollision = this.CheckAcroBikeCollision(this.ow.map.behaviorAt(x, y));
      if (acroCollision !== COLLISION_NONE) return acroCollision;
    }
    return collision;
  }

  /** CheckAcroBikeCollision (field_player_avatar.c); called after ordinary collision checks. */
  private CheckAcroBikeCollision(metatileBehavior: number): number {
    const checks: Array<[(behavior: number) => boolean, number]> = [
      [MB.MetatileBehavior_IsBumpySlope, C.COLLISION_WHEELIE_HOP],
      [MB.MetatileBehavior_IsIsolatedVerticalRail, C.COLLISION_ISOLATED_VERTICAL_RAIL],
      [MB.MetatileBehavior_IsIsolatedHorizontalRail, C.COLLISION_ISOLATED_HORIZONTAL_RAIL],
      [MB.MetatileBehavior_IsVerticalRail, C.COLLISION_VERTICAL_RAIL],
      [MB.MetatileBehavior_IsHorizontalRail, C.COLLISION_HORIZONTAL_RAIL],
    ];
    for (const [check, collision] of checks) if (check(metatileBehavior)) return collision;
    return COLLISION_NONE;
  }

  private ledgeJumpDirection(x: number, y: number, direction: number): number {
    const behavior = this.ow.map.behaviorAt(x, y);
    const checks = [MB.MetatileBehavior_IsJumpSouth, MB.MetatileBehavior_IsJumpNorth, MB.MetatileBehavior_IsJumpWest, MB.MetatileBehavior_IsJumpEast];
    if (direction < 1 || direction > 4) return DIR_NONE;
    return checks[direction - 1](behavior) ? direction : DIR_NONE;
  }

  private canStopSurfing(x: number, y: number, direction: number): boolean {
    if ((this.flags & PLAYER_AVATAR_FLAG_SURFING) && this.ow.map.elevationAt(x, y) === 3 && !this.ow.objects.objectAtXYZ(x, y, 3)) {
      this.createStopSurfingTask(direction);
      return true;
    }
    return false;
  }

  /** CreateStopSurfingTask: surf music ends and the player hops onto land. */
  createStopSurfingTask(direction: number, changeMusic = true): void {
    this.ow.controlsLocked = true;
    this.ow.objects.freezeAll();
    if (changeMusic) {
      this.ow.savedMusic = 0;
      this.ow.playSpecialMapMusic();
    }
    this.flags = (this.flags & ~PLAYER_AVATAR_FLAG_SURFING) | PLAYER_AVATAR_FLAG_ON_FOOT;
    this.preventStep = true;
    const o = this.object;
    let state = 0;
    const id = this.ow.effects.tasks.create(() => {
      if (state === 0) {
        if (!this.ow.objects.isMovementOverridden(o) || this.ow.objects.ObjectEventClearHeldMovementIfFinished(o)) {
          this.ow.effects.setSurfBlobBobState(C.BOB_MON_ONLY);
          this.ow.objects.setHeldMovement(o, 0x14 + direction - 1 + 0x3a - 0x14 - 0x3a + 0x46); // jump special
          state = 1;
        }
      } else if (this.ow.objects.ObjectEventClearHeldMovementIfFinished(o)) {
        this.setState(PLAYER_AVATAR_GFX_NORMAL);
        this.ow.objects.setHeldMovement(o, actionFace(o.facingDirection));
        this.preventStep = false;
        this.ow.effects.destroySurfBlob();
        this.ow.objects.unfreezeAll();
        this.ow.controlsLocked = false;
        this.ow.effects.tasks.destroy(id);
      }
    }, 0xff);
  }

  /** TryPushBoulder (field_player_avatar.c). */
  private TryPushBoulder(x: number, y: number, direction: number): boolean {
    if (!flagGet(rom.constants.FLAG_SYS_USE_STRENGTH ?? 0)) return false;
    const objectEventId = this.ow.objects.GetObjectEventIdByXY(x, y);
    const boulder = objectEventId === OBJECT_EVENTS_COUNT ? undefined : this.ow.objects.objects[objectEventId] ?? undefined;
    if (!boulder || boulder.graphicsId !== rom.constants.OBJ_EVENT_GFX_PUSHABLE_BOULDER) return false;
    const [dx, dy] = DIRECTION_VECTORS[direction];
    const tx = boulder.currentCoords.x + dx;
    const ty = boulder.currentCoords.y + dy;
    const behavior = this.ow.map.behaviorAt(tx, ty);
    if (behavior === rom.constants.MB_FALL_WARP || (this.ow.objects.GetCollisionAtCoords(boulder, tx, ty, direction) === COLLISION_NONE && !MB.MetatileBehavior_IsNonAnimDoor(behavior))) {
      this.ow.effects.StartStrengthAnim(boulder, direction);
      return true;
    }
    return false;
  }

  /** Entry point used by surf: start surfing towards `direction`. */
  startSurfing(): void {
    const o = this.object;
    const direction = o.facingDirection;
    this.ow.controlsLocked = true;
    this.ow.objects.freezeAll();
    let state = 0;
    const id = this.ow.effects.tasks.create(() => {
      if (state === 0) {
        this.setState(PLAYER_AVATAR_GFX_RIDE);
        this.flags = (this.flags & ~PLAYER_AVATAR_FLAG_ON_FOOT) | PLAYER_AVATAR_FLAG_SURFING;
        this.ow.effects.startSurfBlob(o, C.BOB_NONE);
        this.ow.objects.setHeldMovement(o, 0x46 + direction - 1);
        state = 1;
      } else if (this.ow.objects.ObjectEventClearHeldMovementIfFinished(o)) {
        this.ow.effects.setSurfBlobBobState(C.BOB_PLAYER_AND_MON);
        this.ow.objects.turn(o, direction);
        this.ow.objects.unfreezeAll();
        this.ow.controlsLocked = false;
        this.ow.script.ScriptContext_Enable();
        this.ow.effects.tasks.destroy(id);
      }
    }, 0xff);
  }

  /** PartyHasMonWithSurf (field_player_avatar.c). */
  PartyHasMonWithSurf(): boolean {
    if (this.isSurfing()) return false;
    return this.ow.game.party().some((mon) => !mon.isEgg && mon.moves.includes(rom.constants.MOVE_SURF));
  }

  /**
   * IsPlayerFacingSurfableFishableWater (field_player_avatar.c): the C check gates on
   * PlayerGetElevation() (the player's OWN previousElevation, e.g. a bridge tile) equal
   * to 3, not the target tile's elevation; this checks the target tile's elevation
   * instead, and MetatileBehavior_IsSurfable instead of MetatileAtCoordsIsWaterTile.
   * Not touched here pending a focused check against the elevation/bridge system.
   */
  IsPlayerFacingSurfableFishableWater(): boolean {
    const o = this.object;
    const [dx, dy] = DIRECTION_VECTORS[o.facingDirection];
    const x = o.currentCoords.x + dx, y = o.currentCoords.y + dy;
    if (this.ow.objects.GetCollisionAtCoords(o, x, y, o.facingDirection) === COLLISION_ELEVATION_MISMATCH && this.ow.map.elevationAt(x, y) === 1
      && MB.MetatileBehavior_IsSurfable(this.ow.map.behaviorAt(x, y))) return true;
    return false;
  }
}
