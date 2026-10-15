// field_effect.c: engine adapter for the shared escalator warp tasks (escalatorAnimation.ts).
import * as C from "@game/generated/constants";
import { sound } from "../audio/sound";
import { paletteFade } from "../gba/fade";
import { MapGridGetMetatileBehaviorAt } from "./fieldmap";
import { DIR_EAST, DIR_NORTH, DIR_WEST, type ObjectEvent } from "./objectEvents";
import { PlayerGetDestCoords } from "./playerAvatar";
import type { Overworld } from "./overworld";
import { EscalatorTiles, EscalatorWarpAnimation, type EscalatorWarpHost } from "./escalatorAnimation";
import { QuestLog_OnEscalatorWarp, QuestLog_DrawPreviouslyOnQuestHeaderIfInPlaybackMode } from "@game/questLogEvents";

const animations = new WeakMap<Overworld, EscalatorWarpAnimation>();

function faceAction(player: ObjectEvent): number {
  switch (player.facingDirection) {
    case DIR_NORTH: return C.MOVEMENT_ACTION_FACE_UP;
    case DIR_WEST: return C.MOVEMENT_ACTION_FACE_LEFT;
    case DIR_EAST: return C.MOVEMENT_ACTION_FACE_RIGHT;
    default: return C.MOVEMENT_ACTION_FACE_DOWN;
  }
}

function animationFor(ow: Overworld): EscalatorWarpAnimation {
  let animation = animations.get(ow);
  if (animation) return animation;
  const host: EscalatorWarpHost = {
    sprite: () => ow.player.object.sprite,
    freezeObjects: () => ow.objects.freezeAll(), // CameraObjectReset2 is unnecessary with direct player tracking.
    unfreezeObjects: () => ow.objects.unfreezeAll(),
    playerMovementReady: () => !ow.objects.isMovementOverridden(ow.player.object)
      || ow.objects.ObjectEventClearHeldMovementIfFinished(ow.player.object) !== 0,
    holdFacing: () => ow.objects.setHeldMovement(ow.player.object, faceAction(ow.player.object)),
    faceRight: () => ow.objects.setHeldMovement(ow.player.object, C.MOVEMENT_ACTION_FACE_RIGHT),
    playerMovementFinished: () => ow.objects.ObjectEventClearHeldMovementIfFinished(ow.player.object) !== 0,
    walkRight: () => ow.objects.setHeldMovement(ow.player.object, C.MOVEMENT_ACTION_WALK_NORMAL_RIGHT),
    playEscalatorSound: () => sound.playSE(sound.c("SE_ESCALATOR")),
    beginFadeOut: () => { ow.TryFadeOutOldMapMusic(); ow.warpFadeOutScreen(); },
    fadeFinished: () => !paletteFade.active && ow.BGMusicStopped(),
    warpIntoMap: () => {
      ow.fieldCallback = () => { ow.fieldCallback = null; animationFor(ow).FieldCB_EscalatorWarpIn(); };
      ow.warpIntoMapAndLoad();
    },
    destinationIsDownEscalator: () => {
      const dest = PlayerGetDestCoords();
      return MapGridGetMetatileBehaviorAt(dest.x, dest.y, ow.map) === C.MB_DOWN_ESCALATOR;
    },
    beginWarpIn: () => {
      ow.playSpecialMapMusic();
      ow.WarpFadeInScreen();
      QuestLog_DrawPreviouslyOnQuestHeaderIfInPlaybackMode(ow);
      ow.LockPlayerFieldControls();
    },
    unlockControls: () => ow.UnlockPlayerFieldControls(), // CameraObjectReset1 is a no-op with direct player tracking.
    questLog: direction => QuestLog_OnEscalatorWarp(direction),
  };
  const tiles = new EscalatorTiles({
    // ow.map is replaced by each map load; the C globals always address the current map.
    metatileIdAt: (x, y) => ow.map.metatileIdAt(x, y),
    setMetatileIdAt: (x, y, id) => ow.map.setMetatileIdAt(x, y, id),
  }, () => {
    // Despite its name, field_player_avatar.c returns currentCoords directly.
    const p = ow.player.object;
    return { x: p.currentCoords.x, y: p.currentCoords.y };
  });
  animation = new EscalatorWarpAnimation(host, tiles);
  animations.set(ow, animation);
  return animation;
}

/** StartEscalatorWarp (field_effect.c). */
export function StartEscalatorWarp(ow: Overworld, metatileBehavior: number, priority: number): void {
  animationFor(ow).StartEscalatorWarp(metatileBehavior, priority);
}
