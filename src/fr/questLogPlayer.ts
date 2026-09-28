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

/** QuestLogTryRecordPlayerAvatarGfxTransition (quest_log_player.c). */
export function QuestLogTryRecordPlayerAvatarGfxTransition(state: number): boolean {
  if (gQuestLogPlaybackState !== C.QL_PLAYBACK_STATE_RECORDING) return false;
  QuestLogRecordPlayerAvatarGfxTransition(state);
  return true;
}

/** QuestLogUpdatePlayerSprite (quest_log_player.c), applied to the active overworld avatar. */
export function QuestLogUpdatePlayerSprite(ow: Overworld, state: number): void {
  const player = ow.player;
  const object = player.object;
  switch (state) {
    case C.QL_PLAYER_GFX_NORMAL:
      player.setState(PLAYER_AVATAR_GFX_NORMAL);
      ow.objects.turn(object, object.movementDirection);
      player.SetPlayerAvatarStateMask(PLAYER_AVATAR_FLAG_ON_FOOT);
      break;
    case C.QL_PLAYER_GFX_BIKE:
      player.setState(PLAYER_AVATAR_GFX_BIKE);
      ow.objects.turn(object, object.movementDirection);
      player.SetPlayerAvatarStateMask(PLAYER_AVATAR_FLAG_MACH_BIKE);
      player.BikeClearState(0, 0);
      break;
    case C.QL_PLAYER_GFX_FISH:
      if (gQuestLogPlaybackState === C.QL_PLAYBACK_STATE_RUNNING || gQuestLogPlaybackState === C.QL_PLAYBACK_STATE_ACTION_END) {
        ow.controlsLocked = true;
        player.preventStep = true;
        let step = 0, delay = 0;
        const align = (): void => {
          const frame = object.sprite.imageValue;
          object.sprite.x2 = frame >= 1 && frame <= 3 ? (object.facingDirection === DIR_WEST ? -8 : 8) : 0;
          object.sprite.y2 = frame === 5 ? -8 : frame === 10 || frame === 11 ? 8 : 0;
          if (player.flags & PLAYER_AVATAR_FLAG_SURFING) ow.effects.setSurfBlobPlayerOffset(true, object.sprite.y2);
        };
        const id = tasks.create(() => {
          switch (step) {
            case 0:
              ow.objects.clearHeldMovementIfActive(object);
              object.enableAnim = true;
              player.setState(PLAYER_AVATAR_GFX_FISH);
              object.sprite.startAnim(GetFishingDirectionAnimNum(object.facingDirection));
              delay = 0;
              step++;
              break;
            case 1:
              align();
              if (delay < 60) delay++;
              else step++;
              break;
            case 2:
              object.sprite.startAnim(GetFishingNoCatchDirectionAnimNum(player.object.facingDirection));
              step++;
              break;
            case 3:
              align();
              if (!object.sprite.animEnded) break;
              player.setState(player.flags & PLAYER_AVATAR_FLAG_SURFING ? PLAYER_AVATAR_GFX_RIDE : PLAYER_AVATAR_GFX_NORMAL);
              ow.objects.turn(object, object.movementDirection);
              object.sprite.x2 = 0;
              object.sprite.y2 = 0;
              if (player.flags & PLAYER_AVATAR_FLAG_SURFING) ow.effects.setSurfBlobPlayerOffset(false, 0);
              player.preventStep = false;
              ow.controlsLocked = false;
              tasks.destroy(id);
              break;
          }
        }, 0xff);
      } else {
        player.setState(PLAYER_AVATAR_GFX_FISH);
        object.sprite.startAnim(GetFishingDirectionAnimNum(object.facingDirection));
      }
      break;
    case C.QL_PLAYER_GFX_SURF:
      if (!(player.flags & PLAYER_AVATAR_FLAG_SURFING)) {
        player.setState(PLAYER_AVATAR_GFX_RIDE);
        ow.objects.turn(object, object.movementDirection);
        player.SetPlayerAvatarStateMask(PLAYER_AVATAR_FLAG_SURFING);
        ow.effects.startSurfBlob(object, C.BOB_PLAYER_AND_MON);
      }
      break;
    case C.QL_PLAYER_GFX_STOP_SURF_S: player.CreateStopSurfingTask_NoMusicChange(DIR_SOUTH); break;
    case C.QL_PLAYER_GFX_STOP_SURF_N: player.CreateStopSurfingTask_NoMusicChange(DIR_NORTH); break;
    case C.QL_PLAYER_GFX_STOP_SURF_W: player.CreateStopSurfingTask_NoMusicChange(DIR_WEST); break;
    case C.QL_PLAYER_GFX_STOP_SURF_E: player.CreateStopSurfingTask_NoMusicChange(DIR_EAST); break;
    case C.QL_PLAYER_GFX_VSSEEKER:
      ow.controlsLocked = true;
      ow.objects.freezeAll();
      const isFinished = StartVsSeekerFieldEffect(ow);
      const taskId = tasks.create(() => {
        if (!isFinished()) return;
        ow.objects.unfreezeAll();
        ow.controlsLocked = false;
        tasks.destroy(taskId);
      }, 0);
      break;
  }
}

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
