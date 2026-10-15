import * as C from "@game/generated/constants";
import * as MB from "@game/generated/metatileBehavior";

export type ForcedAction = "PlayerWalkFast" | "PlayerWalkNormal" | "PlayerRideWaterCurrent" | "PlayerGoSpin" | "PlayerJumpLedge";
export interface ForcedObject {
  heldMovementFinished: boolean; currentMetatileBehavior: number; movementDirection: number;
  facingDirection: number; facingDirectionLocked: boolean; disableAnim: boolean; enableAnim: boolean;
}
export interface ForcedState { flags: number; runningState: number; lastSpinTile: number }
export interface ForcedHost {
  object(): ForcedObject;
  clearHeldMovement(): void;
  setDirection(direction: number): void;
  collision(direction: number): number;
  move(action: ForcedAction, direction: number): void;
  spinSound(): void;
  matJump(): void;
  matSpin(): void;
}

/** field_player_avatar.c forced-movement dispatch and state family.
 * The host supplies the existing collision/actions, not a second tile classifier.
 */
export class ForcedMovement {
  constructor(readonly state: ForcedState, private readonly host: ForcedHost) {}
  TryUpdatePlayerSpinDirection(): boolean {
    if ((this.state.flags & C.PLAYER_AVATAR_FLAG_FORCED) && MB.MetatileBehavior_IsSpinTile(this.state.lastSpinTile)) {
      const o = this.host.object();
      if (o.heldMovementFinished) {
        if (MB.MetatileBehavior_IsStopSpinning(o.currentMetatileBehavior)) return false;
        if (MB.MetatileBehavior_IsSpinTile(o.currentMetatileBehavior)) this.state.lastSpinTile = o.currentMetatileBehavior;
        this.host.clearHeldMovement();
        this.PlayerApplyTileForcedMovement(this.state.lastSpinTile);
      }
      return true;
    }
    return false;
  }

  /** sForcedMovementFuncs (field_player_avatar.c); the fallback ForcedMovement_None
   * entry is dispatched below, matching the C loop that
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

  private ForcedMovement_Slip(): boolean { return this.DoForcedMovementInCurrentDirection((d) => this.host.move("PlayerWalkFast", d)); }
  private ForcedMovement_WalkSouth(): boolean { return this.DoForcedMovement(C.DIR_SOUTH, (d) => this.host.move("PlayerWalkNormal", d)); }
  private ForcedMovement_WalkNorth(): boolean { return this.DoForcedMovement(C.DIR_NORTH, (d) => this.host.move("PlayerWalkNormal", d)); }
  private ForcedMovement_WalkWest(): boolean { return this.DoForcedMovement(C.DIR_WEST, (d) => this.host.move("PlayerWalkNormal", d)); }
  private ForcedMovement_WalkEast(): boolean { return this.DoForcedMovement(C.DIR_EAST, (d) => this.host.move("PlayerWalkNormal", d)); }
  private ForcedMovement_PushedSouthByCurrent(): boolean { return this.DoForcedMovement(C.DIR_SOUTH, (d) => this.host.move("PlayerRideWaterCurrent", d)); }
  private ForcedMovement_PushedNorthByCurrent(): boolean { return this.DoForcedMovement(C.DIR_NORTH, (d) => this.host.move("PlayerRideWaterCurrent", d)); }
  private ForcedMovement_PushedWestByCurrent(): boolean { return this.DoForcedMovement(C.DIR_WEST, (d) => this.host.move("PlayerRideWaterCurrent", d)); }
  private ForcedMovement_PushedEastByCurrent(): boolean { return this.DoForcedMovement(C.DIR_EAST, (d) => this.host.move("PlayerRideWaterCurrent", d)); }
  private PlaySpinSound(): void { this.host.spinSound(); }
  private ForcedMovement_SpinRight(): boolean { this.PlaySpinSound(); return this.DoForcedMovement(C.DIR_EAST, (d) => this.host.move("PlayerGoSpin", d)); }
  private ForcedMovement_SpinLeft(): boolean { this.PlaySpinSound(); return this.DoForcedMovement(C.DIR_WEST, (d) => this.host.move("PlayerGoSpin", d)); }
  private ForcedMovement_SpinUp(): boolean { this.PlaySpinSound(); return this.DoForcedMovement(C.DIR_NORTH, (d) => this.host.move("PlayerGoSpin", d)); }
  private ForcedMovement_SpinDown(): boolean { this.PlaySpinSound(); return this.DoForcedMovement(C.DIR_SOUTH, (d) => this.host.move("PlayerGoSpin", d)); }
  private ForcedMovement_SlideSouth(): boolean { return this.ForcedMovement_Slide(C.DIR_SOUTH); }
  private ForcedMovement_SlideNorth(): boolean { return this.ForcedMovement_Slide(C.DIR_NORTH); }
  private ForcedMovement_SlideWest(): boolean { return this.ForcedMovement_Slide(C.DIR_WEST); }
  private ForcedMovement_SlideEast(): boolean { return this.ForcedMovement_Slide(C.DIR_EAST); }

  TryDoMetatileBehaviorForcedMovement(): boolean {
    if (!(this.state.flags & C.PLAYER_AVATAR_FLAG_CONTROLLABLE)) {
      const behavior = this.host.object().currentMetatileBehavior;
      for (const [check, apply] of this.forcedMovementTable()) {
        if (check(behavior)) {
          this.state.lastSpinTile = behavior;
          return apply();
        }
      }
    }
    return this.ForcedMovement_None();
  }

  private PlayerApplyTileForcedMovement(behavior: number): void {
    for (const [check, apply] of this.forcedMovementTable()) if (check(behavior)) apply();
  }

  ForcedMovement_None(): boolean {
    if (this.state.flags & C.PLAYER_AVATAR_FLAG_FORCED) {
      const o = this.host.object();
      o.facingDirectionLocked = false;
      o.enableAnim = true;
      this.host.setDirection(o.facingDirection);
      this.state.flags &= ~C.PLAYER_AVATAR_FLAG_FORCED;
    }
    return false;
  }

  private DoForcedMovement(direction: number, action: (d: number) => void): boolean {
    const collision = this.host.collision(direction);
    this.state.flags |= C.PLAYER_AVATAR_FLAG_FORCED;
    if (collision) {
      this.ForcedMovement_None();
      if (collision < C.COLLISION_STOP_SURFING) return false;
      if (collision === C.COLLISION_LEDGE_JUMP) this.host.move("PlayerJumpLedge", direction);
      this.state.flags |= C.PLAYER_AVATAR_FLAG_FORCED;
      this.state.runningState = C.MOVING;
      return true;
    }
    this.state.runningState = C.MOVING;
    action(direction);
    return true;
  }

  private DoForcedMovementInCurrentDirection(action: (d: number) => void): boolean {
    this.host.object().disableAnim = true;
    return this.DoForcedMovement(this.host.object().movementDirection, action);
  }

  private ForcedMovement_Slide(direction: number): boolean {
    this.host.object().disableAnim = true;
    this.host.object().facingDirectionLocked = true;
    return this.DoForcedMovement(direction, (d) => this.host.move("PlayerWalkFast", d));
  }

  private ForcedMovement_MatJump(): boolean { this.host.matJump(); return true; }
  private ForcedMovement_MatSpin(): boolean { this.host.matSpin(); return true; }
}
