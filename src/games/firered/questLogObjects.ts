// quest_log_objects.c: Quest Log scene object events serialization and surf dismount.

import * as C from "./generated/constants";
import * as MB from "./generated/metatileBehavior";
import { SaveObjectEvents } from "./loadSave";
import { save } from "./save";
import { gQuestLogState } from "./questLogEvents";
import { gObjectEvents, type ObjectEvent } from "./field/objectEvents";
import { MapGridGetMetatileBehaviorAt, MAP_OFFSET } from "./field/fieldmap";
import {
  PlayerGetDestCoords,
  SetPlayerAvatarTransitionFlags,
  TestPlayerAvatarFlags,
  PLAYER_AVATAR_FLAG_ON_FOOT,
  PLAYER_AVATAR_FLAG_SURFING,
} from "./field/playerAvatar";
import type { MapObjectTemplate } from "./rom";

export interface QuestLogObjectEvent {
  active: boolean;
  triggerGroundEffectsOnStop: boolean;
  disableCoveringGroundEffects: boolean;
  landingJump: boolean;
  frozen: boolean;
  facingDirectionLocked: boolean;
  disableAnim: boolean;
  enableAnim: boolean;
  inanimate: boolean;
  invisible: boolean;
  offScreen: boolean;
  trackedByCamera: boolean;
  isPlayer: boolean;
  spriteAnimPausedBackup: boolean;
  spriteAffineAnimPausedBackup: boolean;
  disableJumpLandingGroundEffect: boolean;
  fixedPriority: boolean;
  facingDirection: number;
  currentElevation: number;
  previousElevation: number;
  graphicsId: number;
  movementType: number;
  trainerType: number;
  localId: number;
  mapNum: number;
  mapGroup: number;
  x: number;
  y: number;
  trainerRange_berryTreeId: number;
  previousMetatileBehavior: number;
  directionSequenceIndex: number;
  animId: number;
}

export interface QuestLogObjectEventTemplate {
  x: number;
  negx: boolean;
  y: number;
  negy: boolean;
  elevation: number;
  movementType: number;
}

export interface QuestLogScene {
  /** Browser-save index linking this scene snapshot to its action/event command stream. */
  eventIndex?: number;
  /** gQuestLogCurActionIdx captured by quest_log.c while recording this scene. */
  actionIndex?: number;
  startType?: number;
  mapGroup?: number;
  mapNum?: number;
  warpId?: number;
  x?: number;
  y?: number;
  objectEvents: QuestLogObjectEvent[];
  objectEventTemplates?: QuestLogObjectEventTemplate[];
  flags?: Uint8Array | number[];
  vars?: Uint16Array | number[];
  script?: Uint16Array | number[];
}

/** SetPlayerInitialCoordsAtScene (quest_log.c). */
export function SetPlayerInitialCoordsAtScene(questLog: QuestLogScene): void {
  questLog.mapGroup = save.location.mapGroup;
  questLog.mapNum = save.location.mapNum;
  questLog.warpId = save.location.warpId;
  questLog.x = save.pos.x;
  questLog.y = save.pos.y;
}

/** SetGameStateAtScene (quest_log.c). */
export function SetGameStateAtScene(questLog: QuestLogScene): void {
  questLog.flags = [...save.flags];
  questLog.vars = [...save.vars];
}

/** SetNPCInitialCoordsAtScene (quest_log.c). */
export function SetNPCInitialCoordsAtScene(questLog: QuestLogScene): void {
  QL_RecordObjects(questLog);
  const templates = save.objectEventTemplates ?? [];
  questLog.objectEventTemplates = Array.from({ length: C.OBJECT_EVENT_TEMPLATES_COUNT }, (_, i) => {
    const template = templates[i];
    const x = template?.x ?? 0, y = template?.y ?? 0;
    return {
      x: Math.abs(x) & 0xff,
      negx: x < 0,
      y: Math.abs(y) & 0xff,
      negy: y < 0,
      elevation: (template?.elevation ?? 0) & 0x3f,
      movementType: (template?.movementType ?? 0) & 0xff,
    };
  });
}

export function QL_RecordObjects(questLog: QuestLogScene): void {
  for (let i = 0; i < C.OBJECT_EVENTS_COUNT; i++) {
    const src = gObjectEvents[i];
    const dst = questLog.objectEvents[i] ??= {
      active: false,
      triggerGroundEffectsOnStop: false,
      disableCoveringGroundEffects: false,
      landingJump: false,
      frozen: false,
      facingDirectionLocked: false,
      disableAnim: false,
      enableAnim: false,
      inanimate: false,
      invisible: false,
      offScreen: false,
      trackedByCamera: false,
      isPlayer: false,
      spriteAnimPausedBackup: false,
      spriteAffineAnimPausedBackup: false,
      disableJumpLandingGroundEffect: false,
      fixedPriority: false,
      facingDirection: 0,
      currentElevation: 0,
      previousElevation: 0,
      graphicsId: 0,
      movementType: 0,
      trainerType: 0,
      localId: 0,
      mapNum: 0,
      mapGroup: 0,
      x: 0,
      y: 0,
      trainerRange_berryTreeId: 0,
      previousMetatileBehavior: 0,
      directionSequenceIndex: 0,
      animId: 0,
    };

    dst.active = src.active;
    dst.triggerGroundEffectsOnStop = src.triggerGroundEffectsOnStop;
    dst.disableCoveringGroundEffects = src.disableCoveringGroundEffects;
    dst.landingJump = src.landingJump;
    dst.frozen = src.frozen;
    dst.facingDirectionLocked = src.facingDirectionLocked;
    dst.disableAnim = src.disableAnim;
    dst.enableAnim = src.enableAnim;
    dst.inanimate = src.inanimate;
    dst.invisible = src.invisible;
    dst.offScreen = src.offScreen;
    dst.trackedByCamera = src.trackedByCamera;
    dst.isPlayer = src.isPlayer;
    dst.spriteAnimPausedBackup = src.spriteAnimPausedBackup;
    dst.spriteAffineAnimPausedBackup = src.spriteAffineAnimPausedBackup;
    dst.disableJumpLandingGroundEffect = src.disableJumpLandingGroundEffect;
    dst.fixedPriority = src.fixedPriority;
    dst.facingDirection = src.facingDirection;
    dst.currentElevation = src.currentElevation;
    dst.previousElevation = src.previousElevation;
    dst.graphicsId = src.graphicsId;
    dst.movementType = src.movementType;
    dst.trainerType = src.trainerType;
    dst.localId = src.localId;
    dst.mapNum = src.mapNum;
    dst.mapGroup = src.mapGroup;
    dst.x = src.currentCoords.x;
    dst.y = src.currentCoords.y;
    dst.trainerRange_berryTreeId = src.trainerRange;
    dst.previousMetatileBehavior = src.previousMetatileBehavior;
    dst.directionSequenceIndex = src.directionSequenceIndex;
    dst.animId = src.playerCopyableMovement;
  }
}

export function QL_LoadObjects(questLog: QuestLogScene, templates: readonly MapObjectTemplate[]): void {
  const questLogObjectEvents = questLog.objectEvents;

  for (let i = 0; i < C.OBJECT_EVENTS_COUNT; i++) {
    const src = questLogObjectEvents[i];
    const dst = gObjectEvents[i];
    if (!src || !dst) continue;

    dst.active = src.active;
    dst.triggerGroundEffectsOnStop = src.triggerGroundEffectsOnStop;
    dst.disableCoveringGroundEffects = src.disableCoveringGroundEffects;
    dst.landingJump = src.landingJump;
    dst.frozen = src.frozen;
    dst.facingDirectionLocked = src.facingDirectionLocked;
    dst.disableAnim = src.disableAnim;
    dst.enableAnim = src.enableAnim;
    dst.inanimate = src.inanimate;
    dst.invisible = src.invisible;
    dst.offScreen = src.offScreen;
    dst.trackedByCamera = src.trackedByCamera;
    dst.isPlayer = src.isPlayer;
    dst.spriteAnimPausedBackup = src.spriteAnimPausedBackup;
    dst.spriteAffineAnimPausedBackup = src.spriteAffineAnimPausedBackup;
    dst.disableJumpLandingGroundEffect = src.disableJumpLandingGroundEffect;
    dst.fixedPriority = src.fixedPriority;
    dst.facingDirection = src.facingDirection;
    dst.currentElevation = src.currentElevation;
    dst.previousElevation = src.previousElevation;
    dst.graphicsId = src.graphicsId;
    dst.movementType = src.movementType;
    dst.trainerType = src.trainerType;
    dst.localId = src.localId;
    dst.mapNum = src.mapNum;
    dst.mapGroup = src.mapGroup;
    dst.currentCoords.x = src.x;
    dst.currentCoords.y = src.y;
    dst.trainerRange = src.trainerRange_berryTreeId;
    dst.previousMetatileBehavior = src.previousMetatileBehavior;
    dst.directionSequenceIndex = src.directionSequenceIndex;
    dst.playerCopyableMovement = src.animId;

    for (let j = 0; j < templates.length && j < C.OBJECT_EVENT_TEMPLATES_COUNT; j++) {
      const t = templates[j];
      if (t && dst.localId === t.localId) {
        dst.initialCoords.x = t.x + MAP_OFFSET;
        dst.initialCoords.y = t.y + MAP_OFFSET;
        dst.rangeX = t.rangeX;
        dst.rangeY = t.rangeY;
      }
    }

    const curX = dst.currentCoords.x;
    const curY = dst.currentCoords.y;
    dst.currentMetatileBehavior = MapGridGetMetatileBehaviorAt(curX, curY);

    if (dst.previousMetatileBehavior === MapGridGetMetatileBehaviorAt(curX, curY)) {
      dst.previousCoords.x = curX;
      dst.previousCoords.y = curY;
    } else if (dst.previousMetatileBehavior === MapGridGetMetatileBehaviorAt(curX - 1, curY)) {
      dst.previousCoords.x = curX - 1;
      dst.previousCoords.y = curY;
    } else if (dst.previousMetatileBehavior === MapGridGetMetatileBehaviorAt(curX + 1, curY)) {
      dst.previousCoords.x = curX + 1;
      dst.previousCoords.y = curY;
    } else if (dst.previousMetatileBehavior === MapGridGetMetatileBehaviorAt(curX, curY - 1)) {
      dst.previousCoords.x = curX;
      dst.previousCoords.y = curY - 1;
    } else if (dst.previousMetatileBehavior === MapGridGetMetatileBehaviorAt(curX, curY + 1)) {
      dst.previousCoords.x = curX;
      dst.previousCoords.y = curY + 1;
    }
  }

  SaveObjectEvents();
}

export function QL_TryStopSurfing(): void {
  if (gQuestLogState === C.QL_STATE_PLAYBACK) {
    const coords = PlayerGetDestCoords();
    const behavior = MapGridGetMetatileBehaviorAt(coords.x, coords.y);
    if (!MB.MetatileBehavior_IsSurfable(behavior) && TestPlayerAvatarFlags(PLAYER_AVATAR_FLAG_SURFING) !== 0) {
      SetPlayerAvatarTransitionFlags(PLAYER_AVATAR_FLAG_ON_FOOT);
      const playerObj = gObjectEvents.find((o) => o.isPlayer);
      if (playerObj?.fieldEffectSprite) {
        playerObj.fieldEffectSprite.destroyed = true;
        playerObj.fieldEffectSprite = undefined;
      }
    }
  }
}
