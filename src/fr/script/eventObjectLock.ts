// Port of the lock/wait routines in event_object_lock.c, used by ScrCmd_lock
// and ScrCmd_lockall in scrcmd.c. Native script callbacks preserve the C wait
// for the player's current tile transition and, for `lock`, the selected NPC's
// single movement.

import { T_TILE_TRANSITION } from "../field/playerAvatar";
import type { ScriptRunner } from "./context";

/** walkrun_is_standing_still */
export function walkrunIsStandingStill(ctx: ScriptRunner): boolean {
  return ctx.ow.player.tileTransitionState !== T_TILE_TRANSITION;
}

/** IsFreezePlayerFinished */
export function IsFreezePlayerFinished(ctx: ScriptRunner): boolean {
  if (!walkrunIsStandingStill(ctx)) return false;
  HandleEnforcedLookDirection(ctx);
  StopPlayerAvatar(ctx);
  return true;
}

/** FreezeObjects_WaitForPlayer */
export function FreezeObjects_WaitForPlayer(ctx: ScriptRunner): void {
  ctx.ow.objects.freezeAll();
  ctx.SetupNativeScript(() => IsFreezePlayerFinished(ctx));
}

/** IsFreezeSelectedObjectAndPlayerFinished / Task_WaitPlayerAndTargetNPCStopMoving */
export function FreezeObjects_WaitForPlayerAndSelected(ctx: ScriptRunner): void {
  const object = ctx.ow.objects.objects[ctx.ow.selectedObject];
  ctx.ow.objects.freezeAll(object ?? undefined);

  let playerDone = false;
  let targetDone = false;
  if (!object?.singleMovementActive) {
    if (object) ctx.ow.objects.freeze(object);
    targetDone = true;
  }

  ctx.SetupNativeScript(() => {
    if (!playerDone && walkrunIsStandingStill(ctx)) {
      HandleEnforcedLookDirection(ctx);
      playerDone = true;
    }
    if (!targetDone && object && !object.singleMovementActive) {
      ctx.ow.objects.freeze(object);
      targetDone = true;
    }
    if (!playerDone || !targetDone) return false;
    StopPlayerAvatar(ctx);
    return true;
  });
}

/**
 * ClearPlayerHeldMovementAndUnfreezeObjectEvents (event_object_lock.c).
 * Used when a field sequence returns control after freezing the object set.
 */
export function ClearPlayerHeldMovementAndUnfreezeObjectEvents(ctx: ScriptRunner): void {
  ctx.ow.objects.ObjectEventClearHeldMovementIfFinished(ctx.ow.player.object);
  ctx.ow.game.scriptMovement.unfreezeAndStop();
  ctx.ow.objects.unfreezeAll();
}

function HandleEnforcedLookDirection(ctx: ScriptRunner): void {
  if (!ctx.ow.player.IsPlayerNotUsingAcroBikeOnBumpySlope()) return;
  const player = ctx.ow.player.object;
  player.heldMovementActive = false;
  ctx.ow.objects.forceSetHeldMovement(player, [0, 0, 1, 2, 3][player.facingDirection] ?? 0);
}

function StopPlayerAvatar(ctx: ScriptRunner): void {
  ctx.ow.player.StopPlayerAvatar();
}
