// quest_log_player.c: player avatar transitions used while recording and playing back a Quest Log.

import * as C from "./generated/constants";
import { GetFishingDirectionAnimNum, GetFishingNoCatchDirectionAnimNum } from "./generated/eventObjectAnims";
import { tasks } from "./gba/tasks";
import { StartVsSeekerFieldEffect } from "./field/vsSeeker";
import { QuestLogRecordPlayerAvatarGfxTransition, gQuestLogPlaybackState } from "./questLogEvents";
import {
  PLAYER_AVATAR_FLAG_ACRO_BIKE, PLAYER_AVATAR_FLAG_MACH_BIKE, PLAYER_AVATAR_FLAG_ON_FOOT,
  PLAYER_AVATAR_FLAG_SURFING, PLAYER_AVATAR_GFX_BIKE, PLAYER_AVATAR_GFX_FISH,
  PLAYER_AVATAR_GFX_NORMAL, PLAYER_AVATAR_GFX_RIDE, PlayerAvatar,
} from "./field/playerAvatar";
import type { Overworld } from "./field/overworld";
import { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST } from "./field/objectEvents";

type QLFishMovementTask = { id: number; ow: Overworld; step: number; timer: number };
type QLVSSeekerMovementTask = { id: number; ow: Overworld; isFinished: () => boolean };

/** QuestLogTryRecordPlayerAvatarGfxTransition (quest_log_player.c). */
export function QuestLogTryRecordPlayerAvatarGfxTransition(state: number): boolean {
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_RECORDING) return false;
  QuestLogRecordPlayerAvatarGfxTransition(state);
  return true;
}

/** QuestLogUpdatePlayerSprite (quest_log_player.c), applied to the active overworld avatar. */
export function QuestLogUpdatePlayerSprite(ow: Overworld, state: number): void {
  const transition = sQLGfxTransitions[state];
  if (state < sQLGfxTransitions.length) transition?.(ow);
}

const sQLGfxTransitions: Array<((ow: Overworld) => void) | undefined> = [];
sQLGfxTransitions[C.QL_PLAYER_GFX_NORMAL] = QL_GfxTransition_Normal;
sQLGfxTransitions[C.QL_PLAYER_GFX_BIKE] = QL_GfxTransition_Bike;
sQLGfxTransitions[C.QL_PLAYER_GFX_FISH] = QL_GfxTransition_Fish;
sQLGfxTransitions[C.QL_PLAYER_GFX_SURF] = QL_GfxTransition_StartSurf;
sQLGfxTransitions[C.QL_PLAYER_GFX_STOP_SURF_S] = QL_GfxTransition_StopSurfSouth;
sQLGfxTransitions[C.QL_PLAYER_GFX_STOP_SURF_N] = QL_GfxTransition_StopSurfNorth;
sQLGfxTransitions[C.QL_PLAYER_GFX_STOP_SURF_W] = QL_GfxTransition_StopSurfWest;
sQLGfxTransitions[C.QL_PLAYER_GFX_STOP_SURF_E] = QL_GfxTransition_StopSurfEast;
sQLGfxTransitions[C.QL_PLAYER_GFX_VSSEEKER] = QL_GfxTransition_VSSeeker;

function QL_SetObjectGraphicsId(ow: Overworld, graphicsId: number): void {
  ow.objects.setGraphicsId(ow.player.object, graphicsId);
  ow.syncObjectSprites();
}

function QL_GfxTransition_Normal(ow: Overworld): void {
  QL_SetObjectGraphicsId(ow, PlayerAvatar.graphicsId(PLAYER_AVATAR_GFX_NORMAL, ow.player.gender));
  ow.objects.turn(ow.player.object, ow.player.object.movementDirection);
  ow.player.SetPlayerAvatarStateMask(PLAYER_AVATAR_FLAG_ON_FOOT);
}

function QL_GfxTransition_Bike(ow: Overworld): void {
  QL_SetObjectGraphicsId(ow, PlayerAvatar.graphicsId(PLAYER_AVATAR_GFX_BIKE, ow.player.gender));
  ow.objects.turn(ow.player.object, ow.player.object.movementDirection);
  ow.player.SetPlayerAvatarStateMask(PLAYER_AVATAR_FLAG_MACH_BIKE);
  ow.player.BikeClearState(0, 0);
}

function QL_GfxTransition_Fish(ow: Overworld): void {
  const object = ow.player.object;
  if (gQuestLogPlaybackState === C.QL_PLAYBACK_STATE_RUNNING || gQuestLogPlaybackState === C.QL_PLAYBACK_STATE_ACTION_END) {
    ow.controlsLocked = true;
    ow.player.preventStep = true;
    const task: QLFishMovementTask = { id: 0, ow, step: 0, timer: 0 };
    task.id = tasks.create(() => Task_QLFishMovement(task), 0xff);
  } else {
    QL_SetObjectGraphicsId(ow, PlayerAvatar.graphicsId(PLAYER_AVATAR_GFX_FISH, ow.player.gender));
    object.sprite.startAnim(GetFishingDirectionAnimNum(object.facingDirection));
  }
}

function Task_QLFishMovement(task: QLFishMovementTask): void {
  const { ow } = task, object = ow.player.object, sprite = object.sprite;
  const alignFishingAnimationFrames = (): void => {
    const frame = sprite.imageValue;
    sprite.x2 = frame >= 1 && frame <= 3 ? (object.facingDirection === DIR_WEST ? -8 : 8) : 0;
    sprite.y2 = frame === 5 ? -8 : frame === 10 || frame === 11 ? 8 : 0;
    if (ow.player.flags & PLAYER_AVATAR_FLAG_SURFING) ow.effects.setSurfBlobPlayerOffset(true, sprite.y2);
  };
  switch (task.step) {
    case 0:
      ow.objects.clearHeldMovementIfActive(object);
      object.enableAnim = true;
      QL_SetObjectGraphicsId(ow, PlayerAvatar.graphicsId(PLAYER_AVATAR_GFX_FISH, ow.player.gender));
      sprite.startAnim(GetFishingDirectionAnimNum(object.facingDirection));
      task.step++; task.timer = 0;
      break;
    case 1:
      alignFishingAnimationFrames();
      if (task.timer < 60) task.timer++; else task.step++;
      break;
    case 2:
      sprite.startAnim(GetFishingNoCatchDirectionAnimNum(ow.player.object.facingDirection));
      task.step++;
      break;
    case 3:
      alignFishingAnimationFrames();
      if (!sprite.animEnded) break;
      QL_SetObjectGraphicsId(ow, PlayerAvatar.graphicsId(ow.player.flags & PLAYER_AVATAR_FLAG_SURFING ? PLAYER_AVATAR_GFX_RIDE : PLAYER_AVATAR_GFX_NORMAL, ow.player.gender));
      ow.objects.turn(object, object.movementDirection);
      sprite.x2 = 0; sprite.y2 = 0;
      if (ow.player.flags & PLAYER_AVATAR_FLAG_SURFING) ow.effects.setSurfBlobPlayerOffset(false, 0);
      ow.player.preventStep = false; ow.controlsLocked = false; tasks.destroy(task.id);
      break;
  }
}

function QL_GfxTransition_StartSurf(ow: Overworld): void {
  if (ow.player.flags & PLAYER_AVATAR_FLAG_SURFING) return;
  QL_SetObjectGraphicsId(ow, PlayerAvatar.graphicsId(PLAYER_AVATAR_GFX_RIDE, ow.player.gender));
  ow.objects.turn(ow.player.object, ow.player.object.movementDirection);
  ow.player.SetPlayerAvatarStateMask(PLAYER_AVATAR_FLAG_SURFING);
  ow.effects.startSurfBlob(ow.player.object, C.BOB_PLAYER_AND_MON);
}

function QL_GfxTransition_VSSeeker(ow: Overworld): void {
  ow.controlsLocked = true; ow.objects.freezeAll();
  const task: QLVSSeekerMovementTask = { id: 0, ow, isFinished: StartVsSeekerFieldEffect(ow) };
  task.id = tasks.create(() => Task_QLVSSeekerMovement(task), 0);
}

function Task_QLVSSeekerMovement(task: QLVSSeekerMovementTask): void {
  if (!task.isFinished()) return;
  task.ow.objects.unfreezeAll(); task.ow.controlsLocked = false; tasks.destroy(task.id);
}

function QL_GfxTransition_StopSurfSouth(ow: Overworld): void { ow.player.CreateStopSurfingTask_NoMusicChange(DIR_SOUTH); }
function QL_GfxTransition_StopSurfNorth(ow: Overworld): void { ow.player.CreateStopSurfingTask_NoMusicChange(DIR_NORTH); }
function QL_GfxTransition_StopSurfWest(ow: Overworld): void { ow.player.CreateStopSurfingTask_NoMusicChange(DIR_WEST); }
function QL_GfxTransition_StopSurfEast(ow: Overworld): void { ow.player.CreateStopSurfingTask_NoMusicChange(DIR_EAST); }

/** QuestLogCallUpdatePlayerSprite (quest_log_player.c). */
export function QuestLogCallUpdatePlayerSprite(ow: Overworld, state: number): void {
  QuestLogUpdatePlayerSprite(ow, state);
}

/** Connect the C avatar state-transition callers to Quest Log recording and replay logic. */
export function QuestLogApplyPlayerAvatarTransition(ow: Overworld, state: number): void {
  QuestLogTryRecordPlayerAvatarGfxTransition(state);
  QuestLogCallUpdatePlayerSprite(ow, state);
}

/** Keep the class type referenced here for the source-level avatar API contract. */
export type QuestLogPlayerAvatar = PlayerAvatar;
