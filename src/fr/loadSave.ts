// load_save.c: gPlayerParty <-> gSaveBlock1Ptr->playerParty. The port keeps a single party (save.party, which is
// what &gPlayerParty[i] reads), so the save block's copy is held here while a scene rewrites the working party.
import { save } from "./save";
import * as C from "./generated/constants";
import { gObjectEvents, ObjectEvent } from "./field/objectEvents";
import type { SpriteManager } from "./gba/sprite";
import type { Pokemon } from "./pokemon/pokemon";

let sSaveBlockParty: Pokemon[] = [];

/** SavePlayerParty */
export function SavePlayerParty(): void {
  sSaveBlockParty = structuredClone(save.party);
}

/** LoadPlayerParty */
export function LoadPlayerParty(): void {
  save.party.length = 0;
  save.party.push(...structuredClone(sSaveBlockParty));
}

// global.fieldmap.h ObjectEvent (0x24 bytes on GBA). JSON retains logical
// fields, not host memory or Sprite references. Renderer IDs are captured for
// completeness; SpawnObjectEventsOnReturnToField replaces them on continue.
const objectFlags = [
  "active", "singleMovementActive", "triggerGroundEffectsOnMove", "triggerGroundEffectsOnStop",
  "disableCoveringGroundEffects", "landingJump", "heldMovementActive", "heldMovementFinished",
  "frozen", "facingDirectionLocked", "disableAnim", "enableAnim", "inanimate", "invisible",
  "offScreen", "trackedByCamera", "isPlayer", "hasReflection", "inShortGrass",
  "inShallowFlowingWater", "inSandPile", "inHotSprings", "hasShadow", "spriteAnimPausedBackup",
  "spriteAffineAnimPausedBackup", "disableJumpLandingGroundEffect", "fixedPriority", "hideReflection",
] as const;
const objectBytes = [
  "graphicsId", "movementType", "trainerType", "localId", "mapNum", "mapGroup", "warpArrowSpriteId",
  "movementActionId", "trainerRange", "currentMetatileBehavior", "previousMetatileBehavior",
  "previousMovementDirection", "directionSequenceIndex", "playerCopyableMovement",
] as const;
const objectNibbles = ["currentElevation", "previousElevation", "facingDirection", "movementDirection", "rangeX", "rangeY"] as const;
const objectCoords = ["initialCoords", "currentCoords", "previousCoords"] as const;
export type ObjectEventSave = Pick<ObjectEvent,
  typeof objectFlags[number] | typeof objectBytes[number] | typeof objectNibbles[number] | typeof objectCoords[number]
> & { spriteId: number; fieldEffectSpriteId: number };

/** SaveObjectEvents (load_save.c): copy all fixed slots, including inactive objects. */
export function SaveObjectEvents(sprites?: SpriteManager): void {
  save.objectEvents = gObjectEvents.map(object => {
    const record = {} as ObjectEventSave;
    for (const key of objectFlags) record[key] = !!object[key];
    for (const key of objectBytes) record[key] = object[key] & 0xff;
    for (const key of objectNibbles) record[key] = object[key] & 0xf;
    for (const key of objectCoords) record[key] = {
      x: (object[key].x << 16) >> 16, y: (object[key].y << 16) >> 16,
    };
    record.spriteId = sprites?.getId(object.sprite) ?? 0xff;
    record.fieldEffectSpriteId = object.fieldEffectSprite ? sprites?.getId(object.fieldEffectSprite) ?? 0xff : 0xff;
    return record;
  });
  save.objectEventsVersion = 1;
}

/** Legacy saves contain no full snapshot (or the old seven-field Quest Log copy). */
export function HasSavedObjectEvents(): boolean {
  const records = save.objectEvents;
  const inRange = (value: unknown, low: number, high: number): boolean =>
    typeof value === "number" && Number.isInteger(value) && value >= low && value <= high;
  return save.objectEventsVersion === 1 && Array.isArray(records) && records.length === C.OBJECT_EVENTS_COUNT
    && records.every(record => record && objectFlags.every(key => typeof record[key] === "boolean")
      && [...objectBytes, "spriteId", "fieldEffectSpriteId"].every(key => inRange(record[key as keyof ObjectEventSave], 0, 0xff))
      && objectNibbles.every(key => inRange(record[key], 0, 0xf))
      && objectCoords.every(key => inRange(record[key]?.x, -0x8000, 0x7fff) && inRange(record[key]?.y, -0x8000, 0x7fff)))
    && records.some(record => record.active && record.movementType === C.MOVEMENT_TYPE_PLAYER);
}

/** LoadObjectEvents (load_save.c): restore records, leaving renderer construction to the field. */
export function LoadObjectEvents(): void {
  if (!HasSavedObjectEvents()) throw new Error("save has no complete ObjectEvent snapshot");
  for (let i = 0; i < C.OBJECT_EVENTS_COUNT; i++) {
    const record = save.objectEvents![i];
    const object = new ObjectEvent();
    for (const key of objectFlags) object[key] = record[key];
    for (const key of objectBytes) object[key] = record[key] & 0xff;
    for (const key of objectNibbles) object[key] = record[key] & 0xf;
    for (const key of objectCoords) object[key] = {
      x: (record[key].x << 16) >> 16, y: (record[key].y << 16) >> 16,
    };
    gObjectEvents[i] = object;
  }
}
