// Port of the lock/wait routines in event_object_lock.c, used by ScrCmd_lock
// and ScrCmd_lockall in scrcmd.c. Native script callbacks preserve the C wait
// for the player's current tile transition and, for `lock`, the selected NPC's
// single movement.

import { T_TILE_TRANSITION } from "../field/playerAvatar";
import { tasks, type TaskFunc } from "../gba/tasks";
import type { ScriptRunner } from "./context";

/** walkrun_is_standing_still */
export function walkrunIsStandingStill(ctx: ScriptRunner): boolean {
  return ctx.ow.player.tileTransitionState !== T_TILE_TRANSITION;
}

/** IsFreezePlayerFinished */
export function IsFreezePlayerFinished(ctx: ScriptRunner): boolean {
  if (!Task_WaitPlayerStopMoving(ctx)) return false;
  StopPlayerAvatar(ctx);
  return true;
}

/** Task_WaitPlayerStopMoving: native-script completion replaces task destruction. */
function Task_WaitPlayerStopMoving(ctx: ScriptRunner): boolean {
  if (!walkrunIsStandingStill(ctx)) return false;
  ctx.ow.player.HandleEnforcedLookDirectionOnPlayerStopMoving();
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

  const state = { playerDone: false, targetDone: false };
  if (!object?.singleMovementActive) {
    if (object) ctx.ow.objects.freeze(object);
    state.targetDone = true;
  }

  ctx.SetupNativeScript(() => IsFreezeSelectedObjectAndPlayerFinished(ctx, object, state));
}

type FreezeSelectedState = { playerDone: boolean; targetDone: boolean };

/** IsFreezeSelectedObjectAndPlayerFinished / Task_WaitPlayerAndTargetNPCStopMoving. */
function IsFreezeSelectedObjectAndPlayerFinished(ctx: ScriptRunner, object: typeof ctx.ow.player.object | null | undefined, state: FreezeSelectedState): boolean {
  if (!Task_WaitPlayerAndTargetNPCStopMoving(ctx, object, state)) return false;
  StopPlayerAvatar(ctx);
  return true;
}

/** Task_WaitPlayerAndTargetNPCStopMoving; task data[0..1] becomes retained script state. */
function Task_WaitPlayerAndTargetNPCStopMoving(ctx: ScriptRunner, object: typeof ctx.ow.player.object | null | undefined, state: FreezeSelectedState): boolean {
  if (!state.playerDone && walkrunIsStandingStill(ctx)) {
    ctx.ow.player.HandleEnforcedLookDirectionOnPlayerStopMoving();
    state.playerDone = true;
  }
  if (!state.targetDone && object && !object.singleMovementActive) {
    ctx.ow.objects.freeze(object);
    state.targetDone = true;
  }
  return state.playerDone && state.targetDone;
}

// Task_FreezeObjectAndPlayer data (pokeemerald event_object_lock.c).
const tPlayerFrozen = 0, tObjectFrozen = 1, tObjectId = 2;
/** Task functions standing in for the C function pointer Task_FreezeObjectAndPlayer (FuncIsActiveTask). */
const freezeObjectAndPlayerFuncs = new WeakSet<TaskFunc>();

/** Task_FreezeObjectAndPlayer: freeze the designated object and the player once their movement is finished. */
function Task_FreezeObjectAndPlayer(ctx: ScriptRunner, taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const object = ctx.ow.objects.objects[data[tObjectId]!];

  if (!data[tPlayerFrozen] && ctx.ow.player.isStandingStill()) {
    // PlayerFreeze has the same body as HandleEnforcedLookDirectionOnPlayerStopMoving.
    ctx.ow.player.HandleEnforcedLookDirectionOnPlayerStopMoving();
    data[tPlayerFrozen] = 1;
  }
  if (!data[tObjectFrozen] && object && !object.singleMovementActive) {
    ctx.ow.objects.FreezeObjectEvent(object);
    data[tObjectFrozen] = 1;
  }
  if (data[tPlayerFrozen] && data[tObjectFrozen]) tasks.destroy(taskId);
}

/** Starts one Task_FreezeObjectAndPlayer, freezing the object now when it is not mid-movement. */
function StartFreezeObjectAndPlayerTask(ctx: ScriptRunner, objectEventId: number, priority: number): void {
  const func = (id: number): void => Task_FreezeObjectAndPlayer(ctx, id);
  freezeObjectAndPlayerFuncs.add(func);
  const taskId = tasks.create(func, priority);
  const data = tasks.tasks[taskId].data;
  const object = ctx.ow.objects.objects[objectEventId];
  data[tObjectId] = objectEventId;
  if (object && !object.singleMovementActive) {
    ctx.ow.objects.FreezeObjectEvent(object);
    data[tObjectFrozen] = 1;
  }
}

/**
 * FreezeForApproachingTrainers: freeze all objects at once except the player and the
 * approaching trainers, which freeze (with the player) once their movement is finished.
 */
export function FreezeForApproachingTrainers(ctx: ScriptRunner): void {
  const trainerSee = ctx.ow.game.trainerSee;
  const trainerObjectId1 = trainerSee.GetChosenApproachingTrainerObjectEventId(0);

  if (trainerSee.gNoOfApproachingTrainers === 2) {
    const trainerObjectId2 = trainerSee.GetChosenApproachingTrainerObjectEventId(1);
    ctx.ow.objects.FreezeObjectEventsExceptTwo(trainerObjectId1, trainerObjectId2);
    StartFreezeObjectAndPlayerTask(ctx, trainerObjectId1, 80);
    StartFreezeObjectAndPlayerTask(ctx, trainerObjectId2, 81);
  } else {
    ctx.ow.objects.FreezeObjectEventsExceptOne(trainerObjectId1);
    StartFreezeObjectAndPlayerTask(ctx, trainerObjectId1, 80);
  }
}

/** IsFreezeObjectAndPlayerFinished */
export function IsFreezeObjectAndPlayerFinished(ctx: ScriptRunner): boolean {
  if (tasks.tasks.some(t => t.isActive && freezeObjectAndPlayerFuncs.has(t.func))) return false;
  StopPlayerAvatar(ctx);
  return true;
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

/** UnionRoom_UnlockPlayerAndChatPartner (union_room.c / event_object_lock.c). */
export function UnionRoom_UnlockPlayerAndChatPartner(ctx: ScriptRunner): void {
  const partner = ctx.ow.objects.objects[ctx.ow.selectedObject];
  if (partner?.active) ctx.ow.objects.ObjectEventClearHeldMovementIfFinished(partner);
  ctx.ow.objects.ObjectEventClearHeldMovementIfFinished(ctx.ow.player.object);
  ctx.ow.game.scriptMovement.unfreezeAndStop();
  ctx.ow.objects.unfreezeAll();
}

function StopPlayerAvatar(ctx: ScriptRunner): void {
  ctx.ow.player.StopPlayerAvatar();
}
