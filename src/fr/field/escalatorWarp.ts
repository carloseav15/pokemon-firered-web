// field_effect.c: source stages for the two halves of an escalator map warp.
import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { paletteFade } from "../gba/fade";
import { tasks } from "../gba/tasks";
import { Cos, Sin } from "../hw/trig";
import { MapGridGetMetatileBehaviorAt } from "./fieldmap";
import { DIR_EAST, DIR_NORTH, DIR_WEST, type ObjectEvent } from "./objectEvents";
import { PlayerGetDestCoords } from "./playerAvatar";
import type { Overworld } from "./overworld";
import { IsEscalatorMoving, StartEscalator, StopEscalator } from "./specialFieldAnim";
import { QuestLog_OnEscalatorWarp, QuestLog_DrawPreviouslyOnQuestHeaderIfInPlaybackMode } from "../questLogEvents";

const sEscalatorTaskOwners = new Map<number, Overworld>();

/** StartEscalatorWarp (field_effect.c). */
export function StartEscalatorWarp(ow: Overworld, metatileBehavior: number, priority: number): void {
  const taskId = tasks.create(Task_EscalatorWarpFieldEffect, priority);
  tasks.data(taskId)[1] = metatileBehavior === C.MB_UP_ESCALATOR ? 1 : 0;
  tasks.data(taskId)[15] = taskId;
  sEscalatorTaskOwners.set(taskId, ow);
}

function Task_EscalatorWarpFieldEffect(taskId: number): void {
  const data = tasks.data(taskId);
  const steps = [EscalatorWarpEffect_1, EscalatorWarpEffect_2, EscalatorWarpEffect_3,
    EscalatorWarpEffect_4, EscalatorWarpEffect_5, EscalatorWarpEffect_6] as const;
  while (steps[data[0]!]!(taskId)) { /* C returns TRUE to execute the next state this frame. */ }
}

function EscalatorWarpEffect_1(taskId: number): boolean {
  const ow = sEscalatorTaskOwners.get(taskId)!;
  const data = tasks.data(taskId);
  ow.objects.freezeAll(); // CameraObjectReset2 is unnecessary with direct player tracking.
  StartEscalator(ow, data[1] !== 0);
  QuestLog_OnEscalatorWarp(C.QL_ESCALATOR_OUT);
  data[0] = data[0]! + 1;
  return false;
}

function EscalatorWarpEffect_2(taskId: number): boolean {
  const ow = sEscalatorTaskOwners.get(taskId)!;
  const data = tasks.data(taskId);
  const player = ow.player.object;
  if (!ow.objects.isMovementOverridden(player) || ow.objects.ObjectEventClearHeldMovementIfFinished(player) !== 0) {
    ow.objects.setHeldMovement(player, faceAction(player));
    data[0] = data[0]! + 1;
    data[2] = 0;
    data[3] = 0;
    if (data[1] === 0) data[0] = 4;
    sound.playSE(sound.c("SE_ESCALATOR"));
  }
  return false;
}

function EscalatorWarpEffect_3(taskId: number): boolean {
  const data = tasks.data(taskId);
  Escalator_AnimatePlayerGoingDown(taskId);
  if (data[2]! > 3) {
    Escalator_BeginFadeOutToNewMap(taskId);
    data[0] = data[0]! + 1;
  }
  return false;
}

function EscalatorWarpEffect_4(taskId: number): boolean {
  Escalator_AnimatePlayerGoingDown(taskId);
  Escalator_TransitionToWarpInEffect(taskId);
  return false;
}

function EscalatorWarpEffect_5(taskId: number): boolean {
  const data = tasks.data(taskId);
  Escalator_AnimatePlayerGoingUp(taskId);
  if (data[2]! > 3) {
    Escalator_BeginFadeOutToNewMap(taskId);
    data[0] = data[0]! + 1;
  }
  return false;
}

function EscalatorWarpEffect_6(taskId: number): boolean {
  Escalator_AnimatePlayerGoingUp(taskId);
  Escalator_TransitionToWarpInEffect(taskId);
  return false;
}

function Escalator_AnimatePlayerGoingDown(taskId: number): void {
  const ow = sEscalatorTaskOwners.get(taskId)!;
  const data = tasks.data(taskId);
  ow.player.object.sprite.x2 = Cos(0x84, data[2]!);
  ow.player.object.sprite.y2 = Sin(0x94, data[2]!);
  data[3] = data[3]! + 1;
  if (data[3]! & 1) data[2] = data[2]! + 1;
}

function Escalator_AnimatePlayerGoingUp(taskId: number): void {
  const ow = sEscalatorTaskOwners.get(taskId)!;
  const data = tasks.data(taskId);
  ow.player.object.sprite.x2 = Cos(0x7c, data[2]!);
  ow.player.object.sprite.y2 = Sin(0x76, data[2]!);
  data[3] = data[3]! + 1;
  if (data[3]! & 1) data[2] = data[2]! + 1;
}

function Escalator_BeginFadeOutToNewMap(taskId: number): void {
  const ow = sEscalatorTaskOwners.get(taskId)!;
  ow.TryFadeOutOldMapMusic();
  ow.warpFadeOutScreen();
}

function Escalator_TransitionToWarpInEffect(taskId: number): void {
  const ow = sEscalatorTaskOwners.get(taskId)!;
  if (paletteFade.active || !ow.BGMusicStopped()) return;
  StopEscalator();
  ow.fieldCallback = () => FieldCB_EscalatorWarpIn(ow);
  ow.warpIntoMapAndLoad();
  sEscalatorTaskOwners.delete(taskId);
  tasks.destroy(taskId);
}

/** FieldCB_EscalatorWarpIn (field_effect.c). */
function FieldCB_EscalatorWarpIn(ow: Overworld): void {
  ow.fieldCallback = null;
  ow.playSpecialMapMusic();
  ow.WarpFadeInScreen();
  QuestLog_DrawPreviouslyOnQuestHeaderIfInPlaybackMode(ow);
  ow.LockPlayerFieldControls();
  ow.objects.freezeAll();
  const taskId = tasks.create((id) => Task_EscalatorWarpInFieldEffect(id), 0);
  tasks.data(taskId)[15] = taskId;
  sEscalatorTaskOwners.set(taskId, ow);
}

function Task_EscalatorWarpInFieldEffect(taskId: number): void {
  const data = tasks.data(taskId);
  const steps = [EscalatorWarpInEffect_1, EscalatorWarpInEffect_2, EscalatorWarpInEffect_3,
    EscalatorWarpInEffect_4, EscalatorWarpInEffect_5, EscalatorWarpInEffect_6, EscalatorWarpInEffect_7] as const;
  while (steps[data[0]!]!(taskId)) { /* C continues only when a state returns TRUE. */ }
}

function EscalatorWarpInEffect_1(taskId: number): boolean {
  const ow = sEscalatorTaskOwners.get(taskId)!;
  const data = tasks.data(taskId);
  ow.objects.setHeldMovement(ow.player.object, C.MOVEMENT_ACTION_FACE_RIGHT);
  const dest = PlayerGetDestCoords();
  let goingUp = true;
  data[0] = data[0]! + 1;
  data[1] = 16;
  if (MapGridGetMetatileBehaviorAt(dest.x, dest.y, ow.map) === C.MB_DOWN_ESCALATOR) {
    goingUp = false;
    data[0] = 3;
  }
  StartEscalator(ow, !goingUp);
  return true;
}

function EscalatorWarpInEffect_2(taskId: number): boolean {
  const ow = sEscalatorTaskOwners.get(taskId)!;
  const data = tasks.data(taskId);
  ow.player.object.sprite.x2 = Cos(0x84, data[1]!);
  ow.player.object.sprite.y2 = Sin(0x94, data[1]!);
  data[0] = data[0]! + 1;
  return false;
}

function EscalatorWarpInEffect_3(taskId: number): boolean {
  const ow = sEscalatorTaskOwners.get(taskId)!;
  const data = tasks.data(taskId);
  const sprite = ow.player.object.sprite;
  sprite.x2 = Cos(0x84, data[1]!);
  sprite.y2 = Sin(0x94, data[1]!);
  data[2] = data[2]! + 1;
  if (data[2]! & 1) data[1] = data[1]! - 1;
  if (data[1] === 0) { sprite.x2 = 0; sprite.y2 = 0; data[0] = 5; }
  return false;
}

function EscalatorWarpInEffect_4(taskId: number): boolean {
  const ow = sEscalatorTaskOwners.get(taskId)!;
  const data = tasks.data(taskId);
  ow.player.object.sprite.x2 = Cos(0x7c, data[1]!);
  ow.player.object.sprite.y2 = Sin(0x76, data[1]!);
  data[0] = data[0]! + 1;
  return false;
}

function EscalatorWarpInEffect_5(taskId: number): boolean {
  const ow = sEscalatorTaskOwners.get(taskId)!;
  const data = tasks.data(taskId);
  const sprite = ow.player.object.sprite;
  sprite.x2 = Cos(0x7c, data[1]!);
  sprite.y2 = Sin(0x76, data[1]!);
  data[2] = data[2]! + 1;
  if (data[2]! & 1) data[1] = data[1]! - 1;
  if (data[1] === 0) { sprite.x2 = 0; sprite.y2 = 0; data[0] = data[0]! + 1; }
  return false;
}

function EscalatorWarpInEffect_6(taskId: number): boolean {
  if (IsEscalatorMoving()) return false;
  StopEscalator();
  const data = tasks.data(taskId);
  data[0] = data[0]! + 1;
  return true;
}

function EscalatorWarpInEffect_7(taskId: number): boolean {
  const ow = sEscalatorTaskOwners.get(taskId)!;
  const player = ow.player.object;
  if (ow.objects.ObjectEventClearHeldMovementIfFinished(player) === 0) return false;
  ow.UnlockPlayerFieldControls(); // CameraObjectReset1 is a no-op with direct player tracking.
  ow.objects.unfreezeAll();
  ow.objects.setHeldMovement(player, C.MOVEMENT_ACTION_WALK_NORMAL_RIGHT);
  QuestLog_OnEscalatorWarp(C.QL_ESCALATOR_IN);
  sEscalatorTaskOwners.delete(taskId);
  tasks.destroy(taskId);
  return false;
}

function faceAction(player: ObjectEvent): number {
  switch (player.facingDirection) {
    case DIR_NORTH: return C.MOVEMENT_ACTION_FACE_UP;
    case DIR_WEST: return C.MOVEMENT_ACTION_FACE_LEFT;
    case DIR_EAST: return C.MOVEMENT_ACTION_FACE_RIGHT;
    default: return C.MOVEMENT_ACTION_FACE_DOWN;
  }
}
