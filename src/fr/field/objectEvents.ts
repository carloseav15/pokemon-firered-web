// Port of event_object_movement.c: object events, movement types (NPC AI),
// movement actions (the steps used by applymovement and the player), and
// collision rules.

import * as MB from "../generated/metatileBehavior";
import * as C from "../generated/constants";
import { cdata } from "../hw/assets";
import { Sprite, type FrameImage } from "../gba/sprite";
import { random } from "../random";
import { DATA_ROOT, rom, type AnimCmd, type MapObjectTemplate } from "../rom";
import { GetAcroEndWheelieDirectionAnimNum, GetAcroWheelieDirectionAnimNum, GetAcroWheeliePedalDirectionAnimNum, GetCopyDirection, GetFaceDirectionAnimNum, GetJumpY, GetMoveDirectionAnimNum, GetMoveDirectionFastAnimNum, GetMoveDirectionFasterAnimNum, GetMoveDirectionFastestAnimNum, GetRunningDirectionAnimNum } from "../generated/eventObjectAnims";
import { flagGet } from "../save";
import { CONNECTION_INVALID, MAP_OFFSET, type FieldMap } from "./fieldmap";
import { gSineTable } from "../hw/trig";

export const DIR_NONE = 0, DIR_SOUTH = 1, DIR_NORTH = 2, DIR_WEST = 3, DIR_EAST = 4;
export const DIR_SOUTHWEST = 5, DIR_SOUTHEAST = 6, DIR_NORTHWEST = 7, DIR_NORTHEAST = 8;
export const DIRECTION_VECTORS: Array<[number, number]> = [[0, 0], [0, 1], [0, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [-1, -1], [1, -1]];
export const OPPOSITE: number[] = [DIR_NONE, DIR_NORTH, DIR_SOUTH, DIR_EAST, DIR_WEST, DIR_NORTHEAST, DIR_NORTHWEST, DIR_SOUTHEAST, DIR_SOUTHWEST];

export const COLLISION_NONE = 0;
export const COLLISION_OUTSIDE_RANGE = 1;
export const COLLISION_IMPASSABLE = 2;
export const COLLISION_ELEVATION_MISMATCH = 3;
export const COLLISION_OBJECT_EVENT = 4;
export const COLLISION_STOP_SURFING = 5;
export const COLLISION_LEDGE_JUMP = 6;
export const COLLISION_PUSHED_BOULDER = 7;
export const COLLISION_DIRECTIONAL_STAIR_WARP = 8;

export const OBJECT_EVENTS_COUNT = 16;
export const LOCALID_PLAYER = 0xff;
export const LOCALID_CAMERA = 0x7f;
export const MOVE_SPEED_NORMAL = 0, MOVE_SPEED_FAST_1 = 1, MOVE_SPEED_FAST_2 = 2, MOVE_SPEED_FASTER = 3, MOVE_SPEED_FASTEST = 4;
const JUMP_DISTANCE_IN_PLACE = 0, JUMP_DISTANCE_NORMAL = 1, JUMP_DISTANCE_FAR = 2;
const JUMP_TYPE_HIGH = 0, JUMP_TYPE_LOW = 1, JUMP_TYPE_NORMAL = 2;
const JUMP_HALFWAY = 1, JUMP_FINISHED = 0xff;

const STEP_SIZES: number[][] = [
  new Array(16).fill(1),
  new Array(8).fill(2),
  [2, 3, 3, 2, 3, 3],
  [4, 4, 4, 4],
  [8, 8],
];
const DELAYS_MEDIUM = [32, 64, 96, 128];
const DELAYS_SHORT = [32, 48, 64, 80];
const INITIAL_FACING: Record<number, number> = {};
{
  const table: Array<[number, number]> = [
    [0, 1], [1, 1], [2, 1], [3, 2], [4, 1], [5, 3], [6, 4], [7, 2], [8, 1], [9, 3], [10, 4], [11, 1], [12, 1], [13, 1], [14, 3], [15, 2], [16, 2], [17, 1], [18, 1], [19, 1], [20, 1], [21, 2], [22, 1],
    [23, 1], [24, 1], [25, 2], [26, 1], [27, 3], [28, 4],
  ];
  for (const [t, d] of table) INITIAL_FACING[t] = d;
  const seqFacing = [2, 4, 1, 3, 2, 3, 1, 4, 3, 2, 4, 1, 4, 2, 3, 1, 2, 1, 3, 4, 2, 1, 3, 4];
  seqFacing.forEach((d, i) => { INITIAL_FACING[0x1d + i] = d; });
  const rest: Array<[number, number]> = [[0x35, 2], [0x36, 1], [0x37, 3], [0x38, 4], [0x39, 1], [0x3a, 1], [0x3b, 2], [0x3c, 1], [0x3d, 3], [0x3e, 4], [0x3f, 1],
    [0x40, 1], [0x41, 2], [0x42, 3], [0x43, 4], [0x44, 1], [0x45, 2], [0x46, 3], [0x47, 4], [0x48, 1], [0x49, 2], [0x4a, 3], [0x4b, 4], [0x4c, 1], [0x4d, 1], [0x4e, 1], [0x4f, 1], [0x50, 1]];
  for (const [t, d] of rest) INITIAL_FACING[t] = d;
}

// WALK_SEQUENCE types 0x1D..0x34: directions + the index/axis shortcut rule.
const SEQUENCES: Array<[number[], number, "x" | "y"]> = [
  ["URLD", 2, "x"], ["RLDU", 1, "x"], ["DURL", 1, "y"], ["LDUR", 2, "y"], ["ULRD", 2, "x"], ["LRDU", 1, "x"], ["DULR", 1, "y"], ["RDUL", 2, "y"],
  ["LUDR", 2, "y"], ["UDRL", 1, "y"], ["RLUD", 1, "x"], ["DRLU", 2, "x"], ["RUDL", 2, "y"], ["UDLR", 1, "y"], ["LRUD", 1, "x"], ["DLRU", 2, "x"],
  ["ULDR", 2, "y"], ["DRUL", 2, "y"], ["LDRU", 2, "x"], ["RULD", 2, "x"], ["URDL", 2, "y"], ["DLUR", 2, "y"], ["LURD", 2, "x"], ["RDLU", 2, "x"],
].map(([s, i, a]) => [[...(s as string)].map((c) => ({ U: DIR_NORTH, D: DIR_SOUTH, L: DIR_WEST, R: DIR_EAST } as Record<string, number>)[c]), i as number, a as "x" | "y"]);

const COUNTERCLOCKWISE = [DIR_SOUTH, DIR_EAST, DIR_WEST, DIR_SOUTH, DIR_NORTH];
const CLOCKWISE = [DIR_SOUTH, DIR_WEST, DIR_EAST, DIR_NORTH, DIR_SOUTH];

// Anim numbers (constants/event_object_movement.h)
const ANIM_FACE = 0, ANIM_GO = 4, ANIM_GO_FAST = 8, ANIM_GO_FASTER = 12, ANIM_GO_FASTEST = 16, ANIM_RUN = 20;
const ANIM_RAISE_HAND = C.ANIM_RAISE_HAND, ANIM_NURSE_BOW = C.ANIM_NURSE_BOW;
const STEP_ANIM_TABLES = new Set(["sAnimTable_QuintyPlump", "sAnimTable_Standard", "sAnimTable_RedGreenNormal", "sAnimTable_AcroBike", "sAnimTable_RedGreenSurf", "sAnimTable_Nurse", "sAnimTable_RedGreenFish"]);

export function dirIndex(direction: number): number {
  return Math.max(0, Math.min(3, direction - 1));
}

export function faceAnim(direction: number): number { return GetFaceDirectionAnimNum(direction); }
export function moveAnim(direction: number): number { return GetMoveDirectionAnimNum(direction); }
export function moveFastAnim(direction: number): number { return GetMoveDirectionFastAnimNum(direction); }
export function moveFasterAnim(direction: number): number { return GetMoveDirectionFasterAnimNum(direction); }
export function moveFastestAnim(direction: number): number { return GetMoveDirectionFastestAnimNum(direction); }
export function runAnim(direction: number): number { return GetRunningDirectionAnimNum(direction); }

export function actionFace(direction: number): number { return [0, 0, 1, 2, 3][direction] ?? 0; }
export function actionWalkNormal(direction: number): number { return 0x10 + dirIndex(direction); }
export function actionWalkSlow(direction: number): number { return 0x0c + dirIndex(direction); }
export function actionWalkSlower(direction: number): number { return 0x08 + dirIndex(direction); }
export function actionWalkFast(direction: number): number { return 0x1d + dirIndex(direction); }
export function actionWalkFaster(direction: number): number { return 0x35 + dirIndex(direction); }
export function actionWalkInPlaceNormal(direction: number): number { return 0x25 + dirIndex(direction); }
export function actionWalkInPlaceSlow(direction: number): number { return 0x21 + dirIndex(direction); }
export function actionWalkInPlaceFast(direction: number): number { return 0x29 + dirIndex(direction); }
export function actionWalkInPlaceFaster(direction: number): number { return 0x2d + dirIndex(direction); }
export function actionJump2(direction: number): number { return 0x14 + dirIndex(direction); }
export function actionJump(direction: number): number { return 0x4e + dirIndex(direction); }
export function actionJumpInPlace(direction: number): number { return 0x52 + dirIndex(direction); }
export function actionSlide(direction: number): number { return 0x39 + dirIndex(direction); }
export function actionPlayerRun(direction: number): number { return 0x3d + dirIndex(direction); }
export function actionRideWaterCurrent(direction: number): number { return 0x31 + dirIndex(direction); }
export function actionJumpSpecial(direction: number): number { return 0x46 + dirIndex(direction); }
export function actionSpin(direction: number): number { return 0x94 + dirIndex(direction); }
export const MOVEMENT_ACTION_NONE = 0xff;
export const MOVEMENT_ACTION_STEP_END = 0xfe;

export type ObjectEventHooks = {
  map: () => FieldMap;
  playerDestCoords: () => { x: number; y: number };
  playerIsRunning: () => boolean;
  playerInfo: () => { facing: number; movementDirection: number; movementActionId: number; copyableMovement: number; tileTransitionState: number } | undefined;
  cameraObjectReset?: (object: ObjectEvent) => void;
  groundEffect: (object: ObjectEvent, kind: "spawn" | "begin" | "finish") => void;
  emote: (object: ObjectEvent, kind: number) => void;
  playSE: (name: string) => void;
  cameraCanMove: (direction: number) => boolean;
  registerSprite?: (sprite: Sprite) => number;
  unregisterSprite?: (sprite: Sprite) => void;
  cameraOffset?: () => { x: number; y: number };
  startDisguise?: (object: ObjectEvent, kind: "tree" | "mountain") => void;
  startDisguiseReveal?: (object: ObjectEvent) => void;
  isDisguiseRevealFinished?: (object: ObjectEvent) => boolean;
};

type VirtualObject = { sprite: Sprite; id: number; elevation: number; invisible: boolean; animNum: number; animState: number };

export class ObjectEvent {
  active = true;
  singleMovementActive = false;
  triggerGroundEffectsOnMove = false;
  triggerGroundEffectsOnStop = false;
  disableCoveringGroundEffects = false;
  landingJump = false;
  heldMovementActive = false;
  heldMovementFinished = false;
  frozen = false;
  facingDirectionLocked = false;
  disableAnim = false;
  enableAnim = false;
  inanimate = false;
  invisible = false;
  offScreen = false;
  trackedByCamera = false;
  isPlayer = false;
  hasShadow = false;
  disableJumpLandingGroundEffect = true;
  fixedPriority = false;
  inShortGrass = false;
  inShallowFlowingWater = false;
  inSandPile = false;
  hasReflection = false;
  spriteAnimPausedBackup = false;
  spriteAffineAnimPausedBackup = false;
  graphicsId = 0;
  movementType = 0;
  trainerType = 0;
  localId = 0;
  mapNum = 0;
  mapGroup = 0;
  currentElevation = 0;
  previousElevation = 0;
  initialCoords = { x: 0, y: 0 };
  currentCoords = { x: 0, y: 0 };
  previousCoords = { x: 0, y: 0 };
  facingDirection = DIR_SOUTH;
  movementDirection = DIR_SOUTH;
  previousMovementDirection = DIR_SOUTH;
  rangeX = 0;
  rangeY = 0;
  movementActionId = MOVEMENT_ACTION_NONE;
  trainerRange = 0;
  currentMetatileBehavior = 0;
  previousMetatileBehavior = 0;
  directionSequenceIndex = 0;
  playerCopyableMovement = 0;
  fieldEffectSprite?: Sprite;
  template?: MapObjectTemplate;
  sprite: Sprite;
  animTableName = "";

  constructor() {
    this.sprite = new Sprite();
  }
}

/** event_object_movement.c ObjectEventClearHeldMovement. */
export function ObjectEventClearHeldMovement(objectEvent: ObjectEvent): void {
  objectEvent.movementActionId = MOVEMENT_ACTION_NONE;
  objectEvent.heldMovementActive = false;
  objectEvent.heldMovementFinished = false;
  objectEvent.sprite.data[1] = 0;
  objectEvent.sprite.data[2] = 0;
}

/** event_object_movement.c ObjectEventClearHeldMovementIfActive. */
export function ObjectEventClearHeldMovementIfActive(objectEvent: ObjectEvent): void {
  if (objectEvent.heldMovementActive) ObjectEventClearHeldMovement(objectEvent);
}

/** event_object_movement.c ObjectEventIsMovementOverridden. */
export function ObjectEventIsMovementOverridden(objectEvent: ObjectEvent): boolean {
  return objectEvent.singleMovementActive || objectEvent.heldMovementActive;
}

/** event_object_movement.c ObjectEventIsHeldMovementActive. */
export function ObjectEventIsHeldMovementActive(objectEvent: ObjectEvent): boolean {
  return objectEvent.heldMovementActive && objectEvent.movementActionId !== MOVEMENT_ACTION_NONE;
}

/** event_object_movement.c GetDirectionToFace: x takes precedence over y. */
export function GetDirectionToFace(x1: number, y1: number, x2: number, y2: number): number {
  x1 = (x1 << 16) >> 16;
  y1 = (y1 << 16) >> 16;
  x2 = (x2 << 16) >> 16;
  y2 = (y2 << 16) >> 16;
  if (x1 > x2) return DIR_WEST;
  if (x1 < x2) return DIR_EAST;
  if (y1 > y2) return DIR_NORTH;
  return DIR_SOUTH;
}

/** event_object_movement.c ObjectEventMoveDestCoords: advance one tile using its u8 direction. */
export function ObjectEventMoveDestCoords(objectEvent: ObjectEvent, direction: number): { x: number; y: number } {
  const [dx, dy] = DIRECTION_VECTORS[direction & 0xff]!;
  return {
    x: ((objectEvent.currentCoords.x + dx) << 16) >> 16,
    y: ((objectEvent.currentCoords.y + dy) << 16) >> 16,
  };
}

/** event_object_movement.c SetJumpSpriteData. */
export function SetJumpSpriteData(sprite: Sprite, direction: number, distance: number, type: number): void {
  sprite.data[3] = direction & 0xff;
  sprite.data[4] = distance & 0xff;
  sprite.data[5] = type & 0xff;
  sprite.data[6] = 0;
}

/** event_object_movement.c SetMovementDelay. */
export function SetMovementDelay(sprite: Sprite, delay: number): void {
  sprite.data[3] = (delay << 16) >> 16;
}

/** event_object_movement.c WaitForMovementDelay. */
export function WaitForMovementDelay(sprite: Sprite): boolean {
  sprite.data[3] = ((sprite.data[3] - 1) << 16) >> 16;
  return sprite.data[3] === 0;
}

/** event_object_movement.c SetAndStartSpriteAnim. */
export function SetAndStartSpriteAnim(sprite: Sprite, animNum: number, animCmdIndex: number): void {
  sprite.animNum = animNum & 0xff;
  sprite.animPaused = false;
  sprite.seekAnim(animCmdIndex & 0xff);
}

/** event_object_movement.c SpriteAnimEnded. */
export function SpriteAnimEnded(sprite: Sprite): boolean {
  return sprite.animEnded;
}

/** event_object_movement.c IncrementObjectEventCoords (unused by the C callers). */
export function IncrementObjectEventCoords(objectEvent: ObjectEvent, x: number, y: number): void {
  const oldX = (objectEvent.currentCoords.x << 16) >> 16;
  const oldY = (objectEvent.currentCoords.y << 16) >> 16;
  const dx = (x << 16) >> 16;
  const dy = (y << 16) >> 16;
  objectEvent.previousCoords.x = oldX;
  objectEvent.previousCoords.y = oldY;
  objectEvent.currentCoords.x = ((oldX + dx) << 16) >> 16;
  objectEvent.currentCoords.y = ((oldY + dy) << 16) >> 16;
}

/** event_object_movement.c ShiftObjectEventCoords: copy current to previous, then assign s16 coordinates. */
export function ShiftObjectEventCoords(objectEvent: ObjectEvent, x: number, y: number): void {
  objectEvent.previousCoords.x = (objectEvent.currentCoords.x << 16) >> 16;
  objectEvent.previousCoords.y = (objectEvent.currentCoords.y << 16) >> 16;
  objectEvent.currentCoords.x = (x << 16) >> 16;
  objectEvent.currentCoords.y = (y << 16) >> 16;
}

/** event_object_movement.c ShiftStillObjectEventCoords. */
export function ShiftStillObjectEventCoords(objectEvent: ObjectEvent): void {
  ShiftObjectEventCoords(objectEvent, objectEvent.currentCoords.x, objectEvent.currentCoords.y);
}

/** event_object_movement.c ObjectEventGetLocalIdAndMap: write three u8 values through C byte pointers. */
export function ObjectEventGetLocalIdAndMap(objectEvent: ObjectEvent, args: number[], offset = 0): void {
  const values = [objectEvent.localId, objectEvent.mapNum, objectEvent.mapGroup];
  for (let i = 0; i < values.length; i++) {
    const previous = args[offset + i] ?? 0;
    args[offset + i] = (((previous >>> 0) & 0xffffff00) | (values[i]! & 0xff)) >>> 0;
  }
}

export const gObjectEvents: ObjectEvent[] = Array.from({ length: OBJECT_EVENTS_COUNT }, () => {
  const o = new ObjectEvent();
  o.active = false;
  return o;
});

type GfxInfo = { width: number; height: number; inanimate: boolean; anims: AnimCmd[][]; frames: FrameImage[]; animTable: string; shadowSize: string; tracks: string };
const gfxCache = new Map<number, GfxInfo>();

export function graphicsInfo(graphicsId: number): GfxInfo {
  let info = gfxCache.get(graphicsId);
  if (info) return info;
  const raw = rom.objects.gfx[String(graphicsId)] ?? rom.objects.gfx["0"];
  const table = rom.objects.animTables[raw.anims] ?? [];
  const anims = table.map((name) => (name ? rom.objects.anims[name] ?? [["F", 0, 16, 0, 0], ["J", 0]] : [["F", 0, 16, 0, 0], ["J", 0]])) as AnimCmd[][];
  info = {
    width: raw.width,
    height: raw.height,
    inanimate: raw.inanimate,
    anims,
    frames: raw.frames.map(([file, index]) => ({ url: `${DATA_ROOT}/${file}`, index, width: raw.width, height: raw.height })),
    animTable: raw.anims,
    shadowSize: raw.shadowSize,
    tracks: raw.tracks,
  };
  gfxCache.set(graphicsId, info);
  return info;
}

export class ObjectEvents {
  readonly objects: Array<ObjectEvent | null> = new Array(OBJECT_EVENTS_COUNT).fill(null);
  /** Installed by TrainerSee for the buried-trainer REVEAL_TRAINER task. */
  revealTrainerMovementAction?: (object: ObjectEvent) => boolean;
  private readonly virtualObjects = new Map<number, VirtualObject>();
  private ssAnneExteriorMapNumber?: number;
  templates: MapObjectTemplate[] = [];
  mapNum = 0;
  mapGroup = 0;
  /** Set by lock/lockall (FreezeObjectEvents) */
  constructor(private readonly hooks: ObjectEventHooks) {
    for (let i = 0; i < OBJECT_EVENTS_COUNT; i++) {
      if (gObjectEvents[i].active) this.objects[i] = gObjectEvents[i];
    }
  }

  /** CreateVirtualObject (event_object_movement.c): script/Union Room sprite outside gObjectEvents. */
  CreateVirtualObject(graphicsId: number, virtualObjId: number, x: number, y: number, elevation: number, direction: number): number {
    virtualObjId &= 0xff;
    const previous = this.virtualObjects.get(virtualObjId);
    if (previous) this.hooks.unregisterSprite?.(previous.sprite);
    const info = graphicsInfo(graphicsId & 0xff);
    const sprite = new Sprite();
    sprite.anims = info.anims;
    sprite.frameImages = info.frames;
    sprite.width = info.width;
    sprite.height = info.height;
    sprite.centerToCornerVecX = -(info.width >> 1);
    sprite.centerToCornerVecY = -(info.height >> 1);
    x = (x << 16) >> 16;
    y = (y << 16) >> 16;
    sprite.x = ((x + MAP_OFFSET) * 16 + 8) | 0;
    sprite.y = ((y + MAP_OFFSET) * 16 + 16 + sprite.centerToCornerVecY) | 0;
    sprite.coordOffsetEnabled = true;
    sprite.data[0] = virtualObjId;
    this.InitObjectPriorityByElevation(sprite, elevation);
    this.SetObjectSubpriorityByElevation(elevation, sprite, 1, 0);
    sprite.startAnim(faceAnim(direction & 0xff));
    const virtual: VirtualObject = { sprite, id: virtualObjId, elevation: elevation & 0xff, invisible: false, animNum: 0, animState: 0 };
    sprite.callback = () => {
      this.updateVirtualObject(virtual);
    };
    this.virtualObjects.set(virtualObjId, virtual);
    return this.hooks.registerSprite?.(sprite) ?? -1;
  }

  /** TurnVirtualObject. */
  TurnVirtualObject(virtualObjId: number, direction: number): void {
    this.virtualObjects.get(virtualObjId & 0xff)?.sprite.startAnim(faceAnim(direction & 0xff));
  }

  /** SetVirtualObjectGraphics; directions are graphics IDs in the source API. */
  SetVirtualObjectGraphics(virtualObjId: number, graphicsId: number): void {
    const virtual = this.virtualObjects.get(virtualObjId & 0xff);
    if (!virtual) return;
    const info = graphicsInfo(graphicsId & 0xff), sprite = virtual.sprite;
    sprite.anims = info.anims;
    sprite.frameImages = info.frames;
    sprite.width = info.width;
    sprite.height = info.height;
    sprite.startAnim(0);
  }

  /** SetVirtualObjectInvisibility. */
  SetVirtualObjectInvisibility(virtualObjId: number, invisible: boolean | number): void {
    const virtual = this.virtualObjects.get(virtualObjId & 0xff);
    if (virtual) virtual.invisible = !!invisible;
  }

  /** IsVirtualObjectInvisible returns FALSE for an unknown id, matching C. */
  IsVirtualObjectInvisible(virtualObjId: number): boolean {
    return this.virtualObjects.get(virtualObjId & 0xff)?.invisible ?? false;
  }

  /** SetVirtualObjectSpriteAnim. */
  SetVirtualObjectSpriteAnim(virtualObjId: number, animNo: number): void {
    const virtual = this.virtualObjects.get(virtualObjId & 0xff);
    if (virtual) { virtual.animNum = animNo & 0xff; virtual.animState = 0; }
  }

  /** IsVirtualObjectAnimating returns FALSE for an unknown id. */
  IsVirtualObjectAnimating(virtualObjId: number): boolean {
    return (this.virtualObjects.get(virtualObjId & 0xff)?.animNum ?? 0) !== 0;
  }

  /** Sprite reset during a map transition also removes native virtual-object sprites. */
  ClearVirtualObjects(): void {
    for (const virtual of this.virtualObjects.values()) this.hooks.unregisterSprite?.(virtual.sprite);
    this.virtualObjects.clear();
  }

  private updateVirtualObject(virtual: VirtualObject): void {
    const { sprite } = virtual;
    const offset = this.hooks.cameraOffset?.() ?? { x: 0, y: 0 };
    if (virtual.animNum === 1 || virtual.animNum === 2) {
      if (virtual.animState === 0) {
        sprite.y2 = virtual.animNum === 1 ? -160 : 0;
        virtual.animState = 1;
      }
      sprite.y2 += virtual.animNum === 1 ? 8 : -8;
      if (sprite.y2 === (virtual.animNum === 1 ? 0 : -160)) {
        sprite.y2 = 0;
        if (virtual.animNum === 2) virtual.invisible = true;
        virtual.animNum = 0;
        virtual.animState = 0;
      }
    }
    this.SetObjectSubpriorityByElevation(virtual.elevation, sprite, 1, -offset.y);
    sprite.invisible = virtual.invisible;
    const x = sprite.x + sprite.x2 + sprite.centerToCornerVecX - offset.x;
    const y = sprite.y + sprite.y2 + sprite.centerToCornerVecY - offset.y;
    if (x >= 256 || x - (sprite.centerToCornerVecX >> 1) < -16 || y >= 176 || y - (sprite.centerToCornerVecY >> 1) < -16) sprite.invisible = true;
  }

  get list(): ObjectEvent[] {
    return this.objects.filter((o): o is ObjectEvent => o !== null && o.active);
  }

  player(): ObjectEvent | undefined {
    return this.list.find((o) => o.isPlayer);
  }

  byLocalId(localId: number): ObjectEvent | undefined {
    if (localId === LOCALID_PLAYER) return this.player();
    return this.list.find((o) => !o.isPlayer && o.localId === localId);
  }

  /** GetObjectEventIdByLocalIdAndMap: reserved IDs do not use map identity. */
  byLocalIdAndMap(localId: number, mapNum: number, mapGroup: number): ObjectEvent | undefined {
    const objectEventId = { value: OBJECT_EVENTS_COUNT };
    if (this.TryGetObjectEventIdByLocalIdAndMap(localId, mapNum, mapGroup, objectEventId)) return undefined;
    return this.objects[objectEventId.value] ?? undefined;
  }

  indexOf(object: ObjectEvent): number {
    return this.objects.indexOf(object);
  }

  private freeSlot(): number {
    const objectEventId = this.GetFirstInactiveObjectEventId();
    return objectEventId === OBJECT_EVENTS_COUNT ? -1 : objectEventId;
  }

  GetFirstInactiveObjectEventId(): number {
    for (let i = 0; i < OBJECT_EVENTS_COUNT; i++) {
      if (!this.objects[i]?.active) return i;
    }
    return OBJECT_EVENTS_COUNT;
  }

  GetObjectEventIdByLocalId(localId: number): number {
    localId &= 0xff;
    for (let i = 0; i < OBJECT_EVENTS_COUNT; i++) {
      const objectEvent = this.objects[i];
      if (objectEvent?.active && objectEvent.localId === localId) return i;
    }
    return OBJECT_EVENTS_COUNT;
  }

  GetObjectEventIdByLocalIdAndMapInternal(localId: number, mapNum: number, mapGroupId: number): number {
    localId &= 0xff;
    mapNum &= 0xff;
    mapGroupId &= 0xff;
    for (let i = 0; i < OBJECT_EVENTS_COUNT; i++) {
      const objectEvent = this.objects[i];
      if (objectEvent?.active && objectEvent.localId === localId && objectEvent.mapNum === mapNum && objectEvent.mapGroup === mapGroupId) return i;
    }
    return OBJECT_EVENTS_COUNT;
  }

  GetObjectEventIdByLocalIdAndMap(localId: number, mapNum: number, mapGroupId: number): number {
    localId &= 0xff;
    if (localId < LOCALID_PLAYER) return this.GetObjectEventIdByLocalIdAndMapInternal(localId, mapNum, mapGroupId);
    return this.GetObjectEventIdByLocalId(localId);
  }

  /** The C helper returns TRUE when the object is absent and writes the sentinel ID. */
  TryGetObjectEventIdByLocalIdAndMap(localId: number, mapNum: number, mapGroupId: number, objectEventId: { value: number }): boolean {
    objectEventId.value = this.GetObjectEventIdByLocalIdAndMap(localId, mapNum, mapGroupId);
    return objectEventId.value === OBJECT_EVENTS_COUNT;
  }

  /** InitObjectEventStateFromTemplate + sprite creation */
  spawnFromTemplate(template: MapObjectTemplate, mapNum = this.mapNum, mapGroup = this.mapGroup): ObjectEvent | undefined {
    if (this.byLocalIdAndMap(template.localId, mapNum, mapGroup)) return undefined;
    const slot = this.freeSlot();
    if (slot < 0) return undefined;
    const object = new ObjectEvent();
    object.template = template;
    object.localId = template.localId;
    object.mapNum = mapNum;
    object.mapGroup = mapGroup;
    object.graphicsId = this.resolveGraphicsId(template.graphicsId);
    object.movementType = template.movementType;
    object.trainerType = template.trainerType;
    object.trainerRange = template.trainerRange;
    object.rangeX = template.rangeX;
    object.rangeY = template.rangeY;
    const x = template.x + MAP_OFFSET;
    const y = template.y + MAP_OFFSET;
    object.initialCoords = { x, y };
    object.currentCoords = { x, y };
    object.previousCoords = { x, y };
    object.currentElevation = template.elevation;
    object.previousElevation = template.elevation;
    const facing = INITIAL_FACING[template.movementType] ?? DIR_SOUTH;
    object.facingDirection = facing;
    object.movementDirection = facing;
    object.previousMovementDirection = facing;
    this.objects[slot] = object;
    gObjectEvents[slot] = object;
    this.setupSprite(object);
    return object;
  }

  /** VAR_OBJ_GFX_ID_0.. for dynamic graphics (OBJ_EVENT_GFX_VAR_0..F) */
  resolveGraphicsId(graphicsId: number): number {
    const base = rom.constants.OBJ_EVENT_GFX_VAR_0;
    if (base !== undefined && graphicsId >= base && graphicsId <= base + 15) {
      return varGetFn?.(rom.c("VAR_OBJ_GFX_ID_0") + graphicsId - base) ?? 0;
    }
    return graphicsId;
  }

  spawnPlayer(x: number, y: number, graphicsId: number, facing: number, elevation = 0): ObjectEvent {
    for (let i = 0; i < OBJECT_EVENTS_COUNT; i++) if (this.objects[i]?.isPlayer) this.objects[i] = null;
    const slot = this.freeSlot();
    const object = new ObjectEvent();
    object.isPlayer = true;
    object.localId = LOCALID_PLAYER;
    object.graphicsId = graphicsId;
    object.movementType = rom.constants.MOVEMENT_TYPE_PLAYER ?? 0x0b;
    object.initialCoords = { x, y };
    object.currentCoords = { x, y };
    object.previousCoords = { x, y };
    object.facingDirection = facing;
    object.movementDirection = facing;
    object.currentElevation = elevation;
    object.previousElevation = elevation;
    object.trackedByCamera = true;
    this.objects[slot] = object;
    gObjectEvents[slot] = object;
    this.setupSprite(object);
    return object;
  }

  setupSprite(object: ObjectEvent): void {
    const info = graphicsInfo(object.graphicsId);
    const sprite = new Sprite();
    sprite.anims = info.anims;
    sprite.frameImages = info.frames;
    sprite.width = info.width;
    sprite.height = info.height;
    sprite.centerToCornerVecX = -(info.width >> 1);
    sprite.centerToCornerVecY = -(info.height >> 1);
    object.inanimate = info.inanimate;
    object.animTableName = info.animTable;
    object.sprite = sprite;
    this.placeSprite(object);
    sprite.startAnim(object.inanimate ? 0 : faceAnim(object.facingDirection));
    sprite.data[0] = this.indexOf(object);
    sprite.data[1] = 0;
    sprite.data[2] = 0;
    object.currentMetatileBehavior = this.hooks.map().behaviorAt(object.currentCoords.x, object.currentCoords.y);
    object.previousMetatileBehavior = object.currentMetatileBehavior;
    this.InitObjectPriorityByElevation(sprite, object.previousElevation);
    this.updatePriority(object);
  }

  placeSprite(object: ObjectEvent): void {
    const s = object.sprite;
    s.x = object.currentCoords.x * 16 + 8;
    s.y = object.currentCoords.y * 16 + 16 + s.centerToCornerVecY;
  }

  /** MoveObjectEventToMapCoords (event_object_movement.c). */
  MoveObjectEventToMapCoords(object: ObjectEvent, x: number, y: number): void {
    x = (x << 16) >> 16;
    y = (y << 16) >> 16;
    object.previousCoords = { x, y };
    object.currentCoords = { x, y };
    const info = graphicsInfo(object.graphicsId);
    object.sprite.centerToCornerVecX = -(info.width >> 1);
    object.sprite.centerToCornerVecY = -(info.height >> 1);
    this.placeSprite(object);

    object.singleMovementActive = false;
    object.triggerGroundEffectsOnMove = true;
    object.hasShadow = false;
    object.hasReflection = false;
    object.inShortGrass = false;
    object.inShallowFlowingWater = false;
    object.inSandPile = false;
    ObjectEventClearHeldMovement(object);
    if (object.trackedByCamera) this.hooks.cameraObjectReset?.(object);
  }

  /** SetTrainerMovementType */
  setTrainerMovementType(object: ObjectEvent, movementType: number): void {
    object.movementType = movementType;
    object.directionSequenceIndex = 0;
    object.playerCopyableMovement = 0;
    object.sprite.data[1] = 0;
  }

  /** OverrideMovementTypeForObjectEvent: the saved template keeps the new movement type. */
  overrideTemplateMovementType(object: ObjectEvent, movementType: number): void {
    // GetBaseTemplateForObjectEvent never changes another map's local template.
    if (object.mapNum !== this.mapNum || object.mapGroup !== this.mapGroup) return;
    const template = this.templates.find((t) => t.localId === object.localId);
    if (template) template.movementType = movementType;
  }

  /** OverrideTemplateCoordsForObjectEvent / GetBaseTemplateForObjectEvent. */
  overrideTemplateCoords(object: ObjectEvent): void {
    if (object.mapNum !== this.mapNum || object.mapGroup !== this.mapGroup) return;
    const template = this.templates.find((t) => t.localId === object.localId);
    if (!template) return;
    template.x = object.currentCoords.x - MAP_OFFSET;
    template.y = object.currentCoords.y - MAP_OFFSET;
  }

  setGraphicsId(object: ObjectEvent, graphicsId: number): void {
    const info = graphicsInfo(graphicsId);
    object.graphicsId = graphicsId;
    const s = object.sprite;
    s.anims = info.anims;
    s.frameImages = info.frames;
    s.width = info.width;
    s.height = info.height;
    s.centerToCornerVecX = -(info.width >> 1);
    s.centerToCornerVecY = -(info.height >> 1);
    object.inanimate = info.inanimate;
    object.animTableName = info.animTable;
    // Re-anchor the sprite at its feet, keeping the in-progress step offset.
    const stepX = s.x - (object.previousCoords.x * 16 + 8);
    this.placeSprite(object);
    if (object.heldMovementActive || object.singleMovementActive) s.x += stepX;
    s.startAnim(faceAnim(object.facingDirection));
  }

  remove(object: ObjectEvent | undefined): void {
    if (!object) return;
    object.active = false;
    const index = this.objects.indexOf(object);
    if (index >= 0) {
      this.objects[index] = null;
      gObjectEvents[index] = new ObjectEvent();
      gObjectEvents[index].active = false;
    }
    object.sprite.destroyed = true;
    if (object.fieldEffectSprite) object.fieldEffectSprite.destroyed = true;
  }

  removeAll(keepPlayer = false): void {
    for (let i = 0; i < OBJECT_EVENTS_COUNT; i++) {
      const o = this.objects[i];
      if (!o || (keepPlayer && o.isPlayer)) continue;
      this.remove(o);
    }
  }

  /** TrySpawnObjectEvents: spawn templates within the camera view window. */
  trySpawnInView(cameraX: number, cameraY: number): void {
    const left = cameraX - 2;
    const right = cameraX + 15 + 2;
    const top = cameraY;
    const bottom = cameraY + 14 + 2;
    for (const template of this.templates) {
      const x = template.x + MAP_OFFSET;
      const y = template.y + MAP_OFFSET;
      if (top <= y && bottom >= y && left <= x && right >= x && !flagGet(template.flag)) this.spawnFromTemplate(template);
    }
  }

  /** RemoveObjectEventsOutsideView */
  removeOutsideView(cameraX: number, cameraY: number): void {
    const left = cameraX - 2, right = cameraX + 15 + 2, top = cameraY, bottom = cameraY + 14 + 2;
    for (const o of this.list) {
      if (o.isPlayer) continue;
      const inView = (p: { x: number; y: number }) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
      if (inView(o.currentCoords) || inView(o.initialCoords)) continue;
      this.remove(o);
    }
  }

  /** Shift every object when the camera crosses into a connected map. */
  shiftAll(dx: number, dy: number): void {
    for (const o of this.list) {
      o.initialCoords.x -= dx; o.initialCoords.y -= dy;
      o.currentCoords.x -= dx; o.currentCoords.y -= dy;
      o.previousCoords.x -= dx; o.previousCoords.y -= dy;
      o.sprite.x -= dx * 16;
      o.sprite.y -= dy * 16;
    }
  }

  // ---------------------------------------------------------------- collision

  /** GetCollisionAtCoords (event_object_movement.c). */
  GetCollisionAtCoords(object: ObjectEvent, x: number, y: number, direction: number): number {
    x = (x << 16) >> 16;
    y = (y << 16) >> 16;
    direction &= 0xff; // C parameter is u32; the body narrows it to u8.
    const map = this.hooks.map();
    if (this.IsCoordOutsideObjectEventMovementRange(object, x, y)) return COLLISION_OUTSIDE_RANGE;
    if (map.collisionAt(x, y) || map.borderIdAt(x, y) === CONNECTION_INVALID || this.IsMetatileDirectionallyImpassable(object, x, y, direction)) return COLLISION_IMPASSABLE;
    if (object.trackedByCamera && !this.hooks.cameraCanMove(direction)) return COLLISION_IMPASSABLE;
    if (this.IsElevationMismatchAt(object.currentElevation, x, y)) return COLLISION_ELEVATION_MISMATCH;
    if (this.DoesObjectCollideWithObjectAt(object, x, y)) return COLLISION_OBJECT_EVENT;
    return COLLISION_NONE;
  }

  /** GetCollisionFlagsAtCoords (event_object_movement.c). */
  GetCollisionFlagsAtCoords(object: ObjectEvent, x: number, y: number, direction: number): number {
    x = (x << 16) >> 16;
    y = (y << 16) >> 16;
    direction &= 0xff;
    const map = this.hooks.map();
    let flags = 0;
    if (this.IsCoordOutsideObjectEventMovementRange(object, x, y)) flags |= 1;
    if (map.collisionAt(x, y) || map.borderIdAt(x, y) === CONNECTION_INVALID
      || this.IsMetatileDirectionallyImpassable(object, x, y, direction)
      || (object.trackedByCamera && !this.hooks.cameraCanMove(direction))) flags |= 2;
    if (this.IsElevationMismatchAt(object.currentElevation, x, y)) flags |= 4;
    if (this.DoesObjectCollideWithObjectAt(object, x, y)) flags |= 8;
    return flags;
  }

  /** GetCollisionInDirection (event_object_movement.c). */
  GetCollisionInDirection(object: ObjectEvent, direction: number): number {
    direction &= 0xff;
    const destination = ObjectEventMoveDestCoords(object, direction);
    return this.GetCollisionAtCoords(object, destination.x, destination.y, direction);
  }

  /** IsCoordOutsideObjectEventMovementRange (event_object_movement.c). */
  private IsCoordOutsideObjectEventMovementRange(o: ObjectEvent, x: number, y: number): boolean {
    x = (x << 16) >> 16;
    y = (y << 16) >> 16;
    const rangeX = o.rangeX & 0xf;
    const rangeY = o.rangeY & 0xf;
    const left = ((o.initialCoords.x - rangeX) << 16) >> 16;
    const right = ((o.initialCoords.x + rangeX) << 16) >> 16;
    const top = ((o.initialCoords.y - rangeY) << 16) >> 16;
    const bottom = ((o.initialCoords.y + rangeY) << 16) >> 16;
    if (rangeX !== 0 && (left > x || right < x)) return true;
    if (rangeY !== 0 && (top > y || bottom < y)) return true;
    return false;
  }

  /** IsMetatileDirectionallyImpassable (event_object_movement.c). */
  IsMetatileDirectionallyImpassable(object: ObjectEvent, x: number, y: number, direction: number): boolean {
    x = (x << 16) >> 16;
    y = (y << 16) >> 16;
    direction &= 0xff;
    const target = this.hooks.map().behaviorAt(x, y);
    const current = object.currentMetatileBehavior;
    switch (direction) {
      case DIR_SOUTH: return MB.MetatileBehavior_IsSouthBlocked(current) || MB.MetatileBehavior_IsNorthBlocked(target);
      case DIR_NORTH: return MB.MetatileBehavior_IsNorthBlocked(current) || MB.MetatileBehavior_IsSouthBlocked(target);
      case DIR_WEST: return MB.MetatileBehavior_IsWestBlocked(current) || MB.MetatileBehavior_IsEastBlocked(target);
      case DIR_EAST: return MB.MetatileBehavior_IsEastBlocked(current) || MB.MetatileBehavior_IsWestBlocked(target);
    }
    return false;
  }

  /** IsElevationMismatchAt (event_object_movement.c); u8/s16 parameters wrap at the C boundary. */
  IsElevationMismatchAt(elevation: number, x: number, y: number): boolean {
    elevation &= 0xff;
    x = (x << 16) >> 16;
    y = (y << 16) >> 16;
    if (elevation === 0) return false;
    const mapElevation = this.hooks.map().elevationAt(x, y) & 0xff;
    if (mapElevation === 0 || mapElevation === 15) return false;
    return mapElevation !== elevation;
  }

  /** AreElevationsCompatible (event_object_movement.c). */
  static AreElevationsCompatible(a: number, b: number): boolean {
    a &= 0xff;
    b &= 0xff;
    return a === 0 || b === 0 || a === b;
  }

  objectAt(self: ObjectEvent | null, x: number, y: number): ObjectEvent | undefined {
    for (const o of this.list) {
      if (o === self) continue;
      if ((o.currentCoords.x === x && o.currentCoords.y === y) || (o.previousCoords.x === x && o.previousCoords.y === y)) {
        if (!self || ObjectEvents.AreElevationsCompatible(self.currentElevation, o.currentElevation)) return o;
      }
    }
    return undefined;
  }

  /** DoesObjectCollideWithObjectAt (event_object_movement.c). */
  DoesObjectCollideWithObjectAt(object: ObjectEvent, x: number, y: number): boolean {
    x = (x << 16) >> 16;
    y = (y << 16) >> 16;
    return this.objectAt(object, x, y) !== undefined;
  }

  /** GetObjectEventIdByPosition (event_object_movement.c). */
  GetObjectEventIdByPosition(x: number, y: number, elevation: number): number {
    for (let i = 0; i < OBJECT_EVENTS_COUNT; i++) {
      const object = this.objects[i];
      if (object?.active && object.currentCoords.x === x && object.currentCoords.y === y
        && this.ObjectEventDoesElevationMatch(object, elevation)) return i;
    }
    return OBJECT_EVENTS_COUNT;
  }

  /** GetObjectEventIdByXY (event_object_movement.c): active object at current coordinates, without elevation filtering. */
  GetObjectEventIdByXY(x: number, y: number): number {
    x = (x << 16) >> 16;
    y = (y << 16) >> 16;
    for (let i = 0; i < OBJECT_EVENTS_COUNT; i++) {
      const object = this.objects[i];
      if (object?.active && object.currentCoords.x === x && object.currentCoords.y === y) return i;
    }
    return OBJECT_EVENTS_COUNT;
  }

  /** EnableObjectGroundEffectsByXY (event_object_movement.c). */
  EnableObjectGroundEffectsByXY(x: number, y: number): void {
    const objectEventId = this.GetObjectEventIdByXY(x, y);
    if (objectEventId !== OBJECT_EVENTS_COUNT) this.objects[objectEventId]!.triggerGroundEffectsOnMove = true;
  }

  /** ObjectEventDoesElevationMatch (event_object_movement.c). */
  private ObjectEventDoesElevationMatch(object: ObjectEvent, elevation: number): boolean {
    return object.currentElevation === 0 || elevation === 0 || object.currentElevation === elevation;
  }

  /** Return the object at the C GetObjectEventIdByPosition coordinates. */
  objectAtXYZ(x: number, y: number, elevation: number): ObjectEvent | undefined {
    const objectId = this.GetObjectEventIdByPosition(x, y, elevation);
    return objectId === OBJECT_EVENTS_COUNT ? undefined : this.objects[objectId] ?? undefined;
  }

  // ---------------------------------------------------------------- state helpers

  /** SetAndStartSpriteAnim */
  private setAndStartSpriteAnim(sprite: ObjectEvent["sprite"], animNum: number, animCmdIndex: number): void {
    SetAndStartSpriteAnim(sprite, animNum, animCmdIndex);
  }

  /** StartSpriteAnimInDirection (event_object_movement.c). */
  private StartSpriteAnimInDirection(object: ObjectEvent, direction: number, animNum: number): void {
    this.setAndStartSpriteAnim(object.sprite, animNum, 0);
    this.setDirection(object, direction & 0xff);
    object.sprite.data[2] = 1;
  }

  setDirection(object: ObjectEvent, direction: number): void {
    object.previousMovementDirection = object.facingDirection;
    if (!object.facingDirectionLocked) object.facingDirection = direction;
    object.movementDirection = direction;
  }

  shiftCoords(object: ObjectEvent, x: number, y: number): void {
    ShiftObjectEventCoords(object, x, y);
  }

  shiftStill(object: ObjectEvent): void {
    ShiftStillObjectEventCoords(object);
  }

  /** ObjectEventUpdateElevation (event_object_movement.c). */
  ObjectEventUpdateElevation(object: ObjectEvent): void {
    const map = this.hooks.map();
    const cur = map.elevationAt((object.currentCoords.x << 16) >> 16, (object.currentCoords.y << 16) >> 16) & 0xff;
    const prev = map.elevationAt((object.previousCoords.x << 16) >> 16, (object.previousCoords.y << 16) >> 16) & 0xff;
    if (cur === 15 || prev === 15) return;
    object.currentElevation = cur & 0xf;
    if (cur !== 0 && cur !== 15) object.previousElevation = cur & 0xf;
  }

  updatePriority(object: ObjectEvent): void {
    this.UpdateObjectEventElevationAndPriority(object);
  }

  /** UpdateObjectEventElevationAndPriority (event_object_movement.c). */
  UpdateObjectEventElevationAndPriority(object: ObjectEvent): void {
    if (object.fixedPriority) return;
    this.ObjectEventUpdateElevation(object);
    const elevation = object.previousElevation & 0xff;
    const priorities = cdata<number[]>("event_object_movement", "sElevationToPriority");
    const subspriteTables = cdata<number[]>("event_object_movement", "sElevationToSubspriteTableNum");
    object.sprite.subspriteTableNum = subspriteTables[elevation]!;
    object.sprite.priority = priorities[elevation]!;
  }

  /** InitObjectPriorityByElevation (event_object_movement.c). */
  InitObjectPriorityByElevation(sprite: Sprite, elevation: number): void {
    elevation &= 0xff;
    sprite.subspriteTableNum = cdata<number[]>("event_object_movement", "sElevationToSubspriteTableNum")[elevation]!;
    sprite.priority = cdata<number[]>("event_object_movement", "sElevationToPriority")[elevation]!;
  }

  /** SetObjectSubpriorityByElevation (event_object_movement.c); cameraY maps gSpriteCoordOffsetY. */
  SetObjectSubpriorityByElevation(elevation: number, sprite: Sprite, subpriority: number, cameraY: number): void {
    elevation &= 0xff;
    subpriority &= 0xff;
    const spriteY = (sprite.y << 16) >> 16;
    const centerY = (sprite.centerToCornerVecY << 16) >> 16;
    cameraY = (cameraY << 16) >> 16;
    const table = cdata<number[]>("event_object_movement", "sElevationToSubpriority");
    let y = (spriteY - centerY + cameraY + 8) & 0xff;
    y = (16 - (y >> 4)) << 1;
    sprite.subpriority = (table[elevation]! + y + subpriority) & 0xff;
  }

  updateSubpriority(object: ObjectEvent, cameraY: number): void {
    if (object.fixedPriority) return;
    this.SetObjectSubpriorityByElevation(object.previousElevation, object.sprite, 1, cameraY);
  }

  updateMetatileBehaviors(object: ObjectEvent): void {
    const map = this.hooks.map();
    object.previousMetatileBehavior = map.behaviorAt(object.previousCoords.x, object.previousCoords.y);
    object.currentMetatileBehavior = map.behaviorAt(object.currentCoords.x, object.currentCoords.y);
  }

  private stepAnimTable(object: ObjectEvent): boolean {
    return STEP_ANIM_TABLES.has(object.animTableName);
  }

  setStepAnim(object: ObjectEvent, animNum: number): void {
    if (object.inanimate) return;
    const s = object.sprite;
    s.animNum = animNum;
    if (this.stepAnimTable(object)) s.seekAnim(s.animCmdIndex <= 1 ? 1 : 3);
  }

  setStepAnimHandleAlternation(object: ObjectEvent, animNum: number): void {
    if (object.inanimate) return;
    const s = object.sprite;
    s.animNum = animNum;
    if (this.stepAnimTable(object)) {
      if (s.animCmdIndex === 1) s.animCmdIndex = 2;
      else if (s.animCmdIndex === 3) s.animCmdIndex = 0;
    }
    s.seekAnim(s.animCmdIndex);
  }

  turn(object: ObjectEvent, direction: number): void {
    this.setDirection(object, direction);
    if (!object.inanimate) {
      object.sprite.startAnim(faceAnim(object.facingDirection));
      object.sprite.seekAnim(0);
    }
  }

  // ---------------------------------------------------------------- held movement API

  isMovementOverridden(object: ObjectEvent): boolean {
    return ObjectEventIsMovementOverridden(object);
  }

  isHeldMovementActive(object: ObjectEvent): boolean {
    return ObjectEventIsHeldMovementActive(object);
  }

  /** ObjectEventSetHeldMovement: returns true if it could not be set. */
  setHeldMovement(object: ObjectEvent, actionId: number): boolean {
    if (ObjectEventIsMovementOverridden(object)) return true;
    this.unfreeze(object);
    object.movementActionId = actionId;
    object.heldMovementActive = true;
    object.heldMovementFinished = false;
    object.sprite.data[2] = 0;
    return false;
  }

  forceSetHeldMovement(object: ObjectEvent, actionId: number): void {
    this.clearHeldMovementIfActive(object);
    this.setHeldMovement(object, actionId);
  }

  clearHeldMovementIfActive(object: ObjectEvent): void {
    ObjectEventClearHeldMovementIfActive(object);
  }

  clearHeldMovement(object: ObjectEvent): void {
    ObjectEventClearHeldMovement(object);
  }

  isHeldMovementFinished(object: ObjectEvent): boolean {
    return this.ObjectEventCheckHeldMovementStatus(object) !== 0;
  }

  /** ObjectEventCheckHeldMovementStatus (event_object_movement.c): 0, 1, or 16. */
  ObjectEventCheckHeldMovementStatus(object: ObjectEvent): number {
    if (object.heldMovementActive) return object.heldMovementFinished ? 1 : 0;
    return 16;
  }

  /** ObjectEventClearHeldMovementIfFinished (event_object_movement.c). */
  ObjectEventClearHeldMovementIfFinished(object: ObjectEvent): number {
    const status = this.ObjectEventCheckHeldMovementStatus(object);
    if (status !== 0 && status !== 16) this.clearHeldMovementIfActive(object);
    return status;
  }

  /** FreezeObjectEvent (event_object_movement.c): true means already busy/frozen. */
  FreezeObjectEvent(object: ObjectEvent): boolean {
    if (object.heldMovementActive || object.frozen) return true;
    object.frozen = true;
    object.spriteAnimPausedBackup = object.sprite.animPaused;
    object.spriteAffineAnimPausedBackup = object.sprite.affineAnimPaused;
    object.sprite.animPaused = true;
    object.sprite.affineAnimPaused = true;
    return false;
  }

  /** FreezeObjectEvents (event_object_movement.c). */
  FreezeObjectEvents(): void {
    for (let i = 0; i < OBJECT_EVENTS_COUNT; i++) {
      const object = this.objects[i];
      if (object?.active && !object.isPlayer) this.FreezeObjectEvent(object);
    }
  }

  /** FreezeObjectEventsExceptOne (event_object_movement.c); noFreeze is a u8 object slot. */
  FreezeObjectEventsExceptOne(noFreeze: number): void {
    noFreeze &= 0xff;
    for (let i = 0; i < OBJECT_EVENTS_COUNT; i++) {
      const object = this.objects[i];
      if (i !== noFreeze && object?.active && !object.isPlayer) this.FreezeObjectEvent(object);
    }
  }

  /** UnfreezeObjectEvent (event_object_movement.c). */
  UnfreezeObjectEvent(object: ObjectEvent): void {
    if (!object.active || !object.frozen) return;
    object.frozen = false;
    object.sprite.animPaused = object.spriteAnimPausedBackup;
    object.sprite.affineAnimPaused = object.spriteAffineAnimPausedBackup;
  }

  /** UnfreezeObjectEvents (event_object_movement.c). */
  UnfreezeObjectEvents(): void {
    for (let i = 0; i < OBJECT_EVENTS_COUNT; i++) {
      const object = this.objects[i];
      if (object?.active) this.UnfreezeObjectEvent(object);
    }
  }

  freezeAll(except?: ObjectEvent): void {
    for (const object of this.list) {
      if (object !== except && !object.isPlayer) this.FreezeObjectEvent(object);
    }
  }

  freeze(object: ObjectEvent): void { this.FreezeObjectEvent(object); }

  unfreeze(object: ObjectEvent): void { this.UnfreezeObjectEvent(object); }

  unfreezeAll(): void { this.UnfreezeObjectEvents(); }

  // ---------------------------------------------------------------- per-frame update

  /** UpdateObjectEventCallback / ObjectEventCB for every object. */
  update(cameraX: number, cameraY: number): void {
    for (const object of this.list) {
      const sprite = object.sprite;
      if (object.isPlayer) {
        // Player movement type is driven by field_player_avatar.
        if (ObjectEventIsHeldMovementActive(object) && !object.heldMovementFinished) this.execHeld(object);
      } else if (!object.frozen) {
        if (ObjectEventIsHeldMovementActive(object)) {
          if (!object.heldMovementFinished) this.execHeld(object);
        } else {
          this.runMovementType(object);
        }
      }
      this.updateVisibility(object, cameraX, cameraY);
      this.updateSubpriority(object, cameraY);
      this.UpdateObjectEventElevationAndPriority(object);
      if (object.disableAnim) sprite.animPaused = true;
    }
  }

  private updateVisibility(object: ObjectEvent, offsetX: number, offsetY: number): void {
    const s = object.sprite;
    const x = (((s.x + s.x2 + s.centerToCornerVecX + (s.coordOffsetEnabled ? offsetX : 0)) & 0xffff) << 16) >> 16;
    const y = (((s.y + s.y2 + s.centerToCornerVecY + (s.coordOffsetEnabled ? offsetY : 0)) & 0xffff) << 16) >> 16;
    const right = ((x + s.width) << 16) >> 16;
    const bottom = ((y + s.height) << 16) >> 16;
    this.ssAnneExteriorMapNumber ??= rom.mapNum("MAP_SSANNE_EXTERIOR");
    const ssAnneMap = this.ssAnneExteriorMapNumber;
    const onSsAnneExterior = object.localId === C.LOCALID_SS_ANNE
      && this.mapGroup === (ssAnneMap >>> 8)
      && this.mapNum === (ssAnneMap & 0xff);
    const minX = onSsAnneExterior ? -32 : -16;
    object.offScreen = x >= C.DISPLAY_WIDTH + 16 || right < minX || y >= C.DISPLAY_HEIGHT + 16 || bottom < -16;
    s.invisible = object.invisible || object.offScreen;
  }

  private execHeld(object: ObjectEvent): void {
    if (this.execAction(object)) object.heldMovementFinished = true;
  }

  private setSingle(object: ObjectEvent, actionId: number): void {
    object.movementActionId = actionId;
    object.sprite.data[2] = 0;
  }

  private execSingle(object: ObjectEvent): boolean {
    if (this.execAction(object)) {
      object.movementActionId = MOVEMENT_ACTION_NONE;
      object.sprite.data[2] = 0;
      return true;
    }
    return false;
  }

  private setDelay(object: ObjectEvent, delay: number): void {
    SetMovementDelay(object.sprite, delay);
  }

  private waitDelay(object: ObjectEvent): boolean {
    return WaitForMovementDelay(object.sprite);
  }

  private trainerCloseToPlayer(object: ObjectEvent): boolean {
    if (!this.hooks.playerIsRunning()) return false;
    if (object.trainerType !== 1 && object.trainerType !== 3) return false;
    const p = this.hooks.playerDestCoords();
    const r = object.trainerRange;
    const o = object.currentCoords;
    return !(o.x - r > p.x || o.x + r < p.x || o.y - r > p.y || o.y + r < p.y);
  }

  /** TryGetTrainerEncounterDirection limited to the allowed directions. */
  private trainerEncounterDirection(object: ObjectEvent, allowed: number[]): number {
    if (!this.trainerCloseToPlayer(object)) return DIR_NONE;
    const p = this.hooks.playerDestCoords();
    const dx = p.x - object.currentCoords.x;
    const dy = p.y - object.currentCoords.y;
    const horizontal = dx < 0 ? DIR_WEST : DIR_EAST;
    const vertical = dy < 0 ? DIR_NORTH : DIR_SOUTH;
    const direction = Math.abs(dx) > Math.abs(dy) ? horizontal : vertical;
    if (allowed.includes(direction)) return direction;
    const alternate = direction === DIR_WEST || direction === DIR_EAST ? vertical : horizontal;
    if (allowed.includes(alternate)) return alternate;
    return allowed.find((candidate) => candidate === DIR_NORTH || candidate === DIR_SOUTH)
      ?? allowed.find((candidate) => candidate === DIR_WEST || candidate === DIR_EAST)
      ?? DIR_NONE;
  }

  private runMovementType(object: ObjectEvent): void {
    // Each movement type is a table of steps indexed by sprite.data[1]; steps
    // returning true run the next step in the same frame.
    for (let guard = 0; guard < 8; guard++) {
      if (!this.movementTypeStep(object)) break;
    }
  }

  private faceTypeDirections(type: number): number[] | undefined {
    const c = rom.constants;
    switch (type) {
      case c.MOVEMENT_TYPE_LOOK_AROUND: return [DIR_SOUTH, DIR_NORTH, DIR_WEST, DIR_EAST];
      case c.MOVEMENT_TYPE_FACE_DOWN_AND_UP: return [DIR_SOUTH, DIR_NORTH];
      case c.MOVEMENT_TYPE_FACE_LEFT_AND_RIGHT: return [DIR_WEST, DIR_EAST];
      case c.MOVEMENT_TYPE_FACE_UP_AND_LEFT: return [DIR_NORTH, DIR_WEST];
      case c.MOVEMENT_TYPE_FACE_UP_AND_RIGHT: return [DIR_NORTH, DIR_EAST];
      case c.MOVEMENT_TYPE_FACE_DOWN_AND_LEFT: return [DIR_SOUTH, DIR_WEST];
      case c.MOVEMENT_TYPE_FACE_DOWN_AND_RIGHT: return [DIR_SOUTH, DIR_EAST];
      case c.MOVEMENT_TYPE_FACE_DOWN_UP_AND_LEFT: return [DIR_NORTH, DIR_SOUTH, DIR_WEST, DIR_SOUTH];
      case c.MOVEMENT_TYPE_FACE_DOWN_UP_AND_RIGHT: return [DIR_SOUTH, DIR_NORTH, DIR_EAST, DIR_SOUTH];
      case c.MOVEMENT_TYPE_FACE_UP_LEFT_AND_RIGHT: return [DIR_NORTH, DIR_WEST, DIR_EAST, DIR_NORTH];
      case c.MOVEMENT_TYPE_FACE_DOWN_LEFT_AND_RIGHT: return [DIR_WEST, DIR_EAST, DIR_SOUTH, DIR_SOUTH];
    }
    return undefined;
  }

  private movementTypeStep(object: ObjectEvent): boolean {
    const c = rom.constants;
    const s = object.sprite;
    const type = object.movementType;
    const step = s.data[1];

    // Static facing types
    if (type === c.MOVEMENT_TYPE_NONE || type === c.MOVEMENT_TYPE_BERRY_TREE_GROWTH) {
      return false;
    }
    if (type === c.MOVEMENT_TYPE_INVISIBLE) {
      if (step === 0) {
        this.clearMovement(object);
        this.setSingle(object, actionFace(object.facingDirection));
        object.invisible = true;
        s.data[1] = 1;
        return true;
      }
      if (step === 1 && this.execSingle(object)) { s.data[1] = 2; return true; }
      if (step === 2) object.singleMovementActive = false;
      return false;
    }
    if (type === c.MOVEMENT_TYPE_TREE_DISGUISE || type === c.MOVEMENT_TYPE_MOUNTAIN_DISGUISE) {
      if (object.directionSequenceIndex === 0 || (object.directionSequenceIndex === 1 && !s.data[7])) {
        this.hooks.startDisguise?.(object, type === c.MOVEMENT_TYPE_TREE_DISGUISE ? "tree" : "mountain");
        object.directionSequenceIndex = 1;
        s.data[7]++;
      }
      this.clearMovement(object);
      return false;
    }
    if ([c.MOVEMENT_TYPE_FACE_UP, c.MOVEMENT_TYPE_FACE_DOWN, c.MOVEMENT_TYPE_FACE_LEFT, c.MOVEMENT_TYPE_FACE_RIGHT, c.MOVEMENT_TYPE_BURIED].includes(type)) {
      if (step === 0) {
        this.clearMovement(object);
        this.setSingle(object, actionFace(INITIAL_FACING[type] ?? object.facingDirection));
        s.data[1] = 1;
        return true;
      }
      if (step === 1 && this.execSingle(object)) s.data[1] = 2;
      return false;
    }
    if (type === c.MOVEMENT_TYPE_RAISE_HAND_AND_STOP || type === c.MOVEMENT_TYPE_RAISE_HAND_AND_JUMP || type === c.MOVEMENT_TYPE_RAISE_HAND_AND_SWIM) {
      if (step === 0) { this.clearMovement(object); this.setSingle(object, 0x98 + (type - c.MOVEMENT_TYPE_RAISE_HAND_AND_STOP)); s.data[1] = 1; return true; }
      if (step === 1 && this.execSingle(object)) s.data[1] = 2;
      return false;
    }

    // Random facing (look around and the FACE_*_AND_* types)
    const faceDirs = this.faceTypeDirections(type);
    if (faceDirs) {
      switch (step) {
        case 0: this.clearMovement(object); s.data[1] = 1; return true;
        case 1: this.setSingle(object, actionFace(object.facingDirection)); s.data[1] = 2; return true;
        case 2:
          if (this.execSingle(object)) {
            this.setDelay(object, (type === c.MOVEMENT_TYPE_LOOK_AROUND ? DELAYS_MEDIUM : DELAYS_SHORT)[random() & 3]);
            object.singleMovementActive = false;
            s.data[1] = 3;
          }
          return false;
        case 3:
          if (this.waitDelay(object) || this.trainerCloseToPlayer(object)) { s.data[1] = 4; return true; }
          return false;
        case 4: {
          let direction = this.trainerEncounterDirection(object, [...new Set(faceDirs)]);
          if (direction === DIR_NONE) direction = faceDirs.length === 2 ? faceDirs[random() & 1] : faceDirs[random() & 3];
          this.setDirection(object, direction);
          s.data[1] = 1;
          return true;
        }
      }
      return false;
    }

    // Wandering
    const wanderDirs = type === c.MOVEMENT_TYPE_WANDER_AROUND || type === c.MOVEMENT_TYPE_WANDER_AROUND_SLOWER ? [DIR_SOUTH, DIR_NORTH, DIR_WEST, DIR_EAST]
      : type === c.MOVEMENT_TYPE_WANDER_UP_AND_DOWN || type === c.MOVEMENT_TYPE_WANDER_DOWN_AND_UP ? [DIR_SOUTH, DIR_NORTH]
        : type === c.MOVEMENT_TYPE_WANDER_LEFT_AND_RIGHT || type === c.MOVEMENT_TYPE_WANDER_RIGHT_AND_LEFT ? [DIR_WEST, DIR_EAST] : undefined;
    if (wanderDirs) {
      switch (step) {
        case 0: this.clearMovement(object); s.data[1] = 1; return true;
        case 1: this.setSingle(object, actionFace(object.facingDirection)); s.data[1] = 2; return true;
        case 2:
          if (!this.execSingle(object)) return false;
          this.setDelay(object, DELAYS_MEDIUM[random() & 3]);
          s.data[1] = 3;
          return true;
        case 3:
          if (this.waitDelay(object)) { s.data[1] = 4; return true; }
          return false;
        case 4: {
          const direction = wanderDirs.length === 4 ? wanderDirs[random() & 3] : wanderDirs[random() & 1];
          this.setDirection(object, direction);
          s.data[1] = 5;
          if (this.GetCollisionInDirection(object, direction)) s.data[1] = 1;
          return true;
        }
        case 5:
          this.setSingle(object, type === c.MOVEMENT_TYPE_WANDER_AROUND_SLOWER ? actionWalkSlower(object.movementDirection) : actionWalkNormal(object.movementDirection));
          object.singleMovementActive = true;
          s.data[1] = 6;
          return true;
        case 6:
          if (this.execSingle(object)) { object.singleMovementActive = false; s.data[1] = 1; }
          return false;
      }
      return false;
    }

    // Rotation
    if (type === c.MOVEMENT_TYPE_ROTATE_COUNTERCLOCKWISE || type === c.MOVEMENT_TYPE_ROTATE_CLOCKWISE) {
      switch (step) {
        case 0: this.clearMovement(object); this.setSingle(object, actionFace(object.facingDirection)); s.data[1] = 1; return true;
        case 1: if (this.execSingle(object)) { this.setDelay(object, 48); s.data[1] = 2; } return false;
        case 2: if (this.waitDelay(object) || this.trainerCloseToPlayer(object)) s.data[1] = 3; return false;
        case 3: {
          let direction = this.trainerEncounterDirection(object, [DIR_SOUTH, DIR_NORTH, DIR_WEST, DIR_EAST]);
          if (direction === DIR_NONE) direction = (type === c.MOVEMENT_TYPE_ROTATE_CLOCKWISE ? CLOCKWISE : COUNTERCLOCKWISE)[object.facingDirection];
          this.setDirection(object, direction);
          s.data[1] = 0;
          return true;
        }
      }
      return false;
    }

    // Walk back and forth
    if (type >= c.MOVEMENT_TYPE_WALK_UP_AND_DOWN && type <= c.MOVEMENT_TYPE_WALK_RIGHT_AND_LEFT) {
      switch (step) {
        case 0: this.clearMovement(object); s.data[1] = 1; return true;
        case 1: {
          let direction = INITIAL_FACING[type];
          if (object.directionSequenceIndex) direction = OPPOSITE[direction];
          this.setDirection(object, direction);
          s.data[1] = 2;
          return true;
        }
        case 2: {
          if (object.directionSequenceIndex && object.initialCoords.x === object.currentCoords.x && object.initialCoords.y === object.currentCoords.y) {
            object.directionSequenceIndex = 0;
            this.setDirection(object, OPPOSITE[object.movementDirection]);
          }
          let collision = this.GetCollisionInDirection(object, object.movementDirection);
          let action = actionWalkNormal(object.movementDirection);
          if (collision === COLLISION_OUTSIDE_RANGE) {
            object.directionSequenceIndex++;
            this.setDirection(object, OPPOSITE[object.movementDirection]);
            action = actionWalkNormal(object.movementDirection);
            collision = this.GetCollisionInDirection(object, object.movementDirection);
          }
          if (collision) action = actionWalkInPlaceNormal(object.facingDirection);
          this.setSingle(object, action);
          object.singleMovementActive = true;
          s.data[1] = 3;
          return true;
        }
        case 3:
          if (this.execSingle(object)) { object.singleMovementActive = false; s.data[1] = 1; }
          return false;
      }
      return false;
    }

    // Walk sequences
    if (type >= 0x1d && type <= 0x34) {
      const [route, checkIndex, axis] = SEQUENCES[type - 0x1d];
      switch (step) {
        case 0: this.clearMovement(object); s.data[1] = 1; return true;
        case 1: {
          if (object.directionSequenceIndex === checkIndex && object.initialCoords[axis] === object.currentCoords[axis]) object.directionSequenceIndex = checkIndex + 1;
          if (object.directionSequenceIndex === 3 && object.initialCoords.x === object.currentCoords.x && object.initialCoords.y === object.currentCoords.y) object.directionSequenceIndex = 0;
          this.setDirection(object, route[object.directionSequenceIndex]);
          let action = actionWalkNormal(object.movementDirection);
          let collision = this.GetCollisionInDirection(object, object.movementDirection);
          if (collision === COLLISION_OUTSIDE_RANGE) {
            object.directionSequenceIndex++;
            this.setDirection(object, route[object.directionSequenceIndex & 3]);
            action = actionWalkNormal(object.movementDirection);
            collision = this.GetCollisionInDirection(object, object.movementDirection);
          }
          if (collision) action = actionWalkInPlaceNormal(object.facingDirection);
          this.setSingle(object, action);
          object.singleMovementActive = true;
          s.data[1] = 2;
          return true;
        }
        case 2:
          if (this.execSingle(object)) { object.singleMovementActive = false; s.data[1] = 1; }
          return false;
      }
      return false;
    }

    // Copy the player
    if (type >= c.MOVEMENT_TYPE_COPY_PLAYER && type <= c.MOVEMENT_TYPE_COPY_PLAYER_CLOCKWISE || type >= c.MOVEMENT_TYPE_COPY_PLAYER_IN_GRASS && type <= c.MOVEMENT_TYPE_COPY_PLAYER_CLOCKWISE_IN_GRASS) {
      const inGrass = type >= c.MOVEMENT_TYPE_COPY_PLAYER_IN_GRASS;
      const copyInit = INITIAL_FACING[type];
      switch (step) {
        case 0: {
          this.clearMovement(object);
          if (object.directionSequenceIndex === 0) object.directionSequenceIndex = this.hooks.playerInfo()?.facing ?? DIR_SOUTH;
          s.data[1] = 1;
          return true;
        }
        case 1: {
          const player = this.hooks.playerInfo();
          if (!player || player.movementActionId === MOVEMENT_ACTION_NONE || player.tileTransitionState === 2) return false; // T_TILE_CENTER
          const moveDir = player.movementDirection;
          const playerInit = object.directionSequenceIndex;
          const copyableMovement = player.copyableMovement;
          if (copyableMovement === 0 || copyableMovement === 9 || copyableMovement === 10) return false;
          if (!playerInit || !moveDir || playerInit > 4 || moveDir > 4) return false;
          const direction = GetCopyDirection(copyInit, playerInit, moveDir);
          const vector = DIRECTION_VECTORS[direction]!;
          const destination = ObjectEventMoveDestCoords(object, direction);
          const target = copyableMovement === 8
            ? { x: ((object.currentCoords.x + vector[0] * 2) << 16) >> 16, y: ((object.currentCoords.y + vector[1] * 2) << 16) >> 16 }
            : destination;
          let action: number;
          switch (copyableMovement) {
            case 1: action = actionFace(direction); break;
            case 2: action = actionWalkNormal(direction); break;
            case 3: action = actionWalkFast(direction); break;
            case 4: action = actionWalkFaster(direction); break;
            case 5: action = actionSlide(direction); break;
            case 6: action = actionJumpInPlace(direction); break;
            case 7: action = actionJump(direction); break;
            case 8: action = actionJump2(direction); break;
            default: return false;
          }
          if (copyableMovement !== 1 && copyableMovement !== 6) {
            const blocked = this.GetCollisionAtCoords(object, target.x, target.y, direction)
              || (inGrass && !MB.MetatileBehavior_IsPokeGrass(this.hooks.map().behaviorAt(target.x, target.y)));
            if (blocked) action = actionFace(direction);
          }
          this.setSingle(object, action);
          object.singleMovementActive = true;
          s.data[1] = 2;
          return true;
        }
        case 2:
          if (this.execSingle(object)) { object.singleMovementActive = false; s.data[1] = 1; }
          return false;
      }
      return false;
    }

    // Walking/jogging in place
    if (type >= c.MOVEMENT_TYPE_WALK_IN_PLACE_DOWN && type <= c.MOVEMENT_TYPE_JOG_IN_PLACE_RIGHT) {
      const dir = [DIR_SOUTH, DIR_NORTH, DIR_WEST, DIR_EAST][(type - c.MOVEMENT_TYPE_WALK_IN_PLACE_DOWN) & 3];
      const group = Math.floor((type - c.MOVEMENT_TYPE_WALK_IN_PLACE_DOWN) / 4);
      if (step === 0) {
        this.clearMovement(object);
        this.setSingle(object, group === 0 ? actionWalkInPlaceNormal(dir) : group === 1 ? actionWalkInPlaceFast(dir) : actionWalkInPlaceFaster(dir));
        s.data[1] = 1;
      } else if (this.execSingle(object)) s.data[1] = 0;
      return false;
    }
    return false;
  }

  clearMovement(object: ObjectEvent): void {
    object.singleMovementActive = false;
    object.heldMovementActive = false;
    object.heldMovementFinished = false;
    object.movementActionId = MOVEMENT_ACTION_NONE;
    object.sprite.data[1] = 0;
    object.sprite.data[2] = 0;
  }

  // ---------------------------------------------------------------- movement actions

  private stepSprite(object: ObjectEvent, amount: number, direction: number): void {
    const [dx, dy] = DIRECTION_VECTORS[direction];
    object.sprite.x += dx * amount;
    object.sprite.y += dy * amount;
  }

  private faceDirection(object: ObjectEvent, direction: number): void {
    this.setDirection(object, direction);
    this.shiftStill(object);
    this.setStepAnim(object, moveAnim(object.facingDirection));
    object.sprite.animPaused = true;
    object.sprite.data[2] = 1;
  }

  private initNpcForMovement(object: ObjectEvent, direction: number, speed: number): void {
    this.setDirection(object, direction);
    const [dx, dy] = DIRECTION_VECTORS[direction];
    this.shiftCoords(object, object.currentCoords.x + dx, object.currentCoords.y + dy);
    const s = object.sprite;
    s.data[3] = direction;
    s.data[4] = speed;
    s.data[5] = 0;
    s.animPaused = false;
    object.triggerGroundEffectsOnMove = true;
    s.data[2] = 1;
  }

  private initMovementNormal(object: ObjectEvent, direction: number, speed: number): void {
    this.initNpcForMovement(object, direction, speed);
    const anim = [moveAnim, moveFastAnim, moveFastAnim, moveFasterAnim, moveFastestAnim][speed](object.facingDirection);
    this.setStepAnimHandleAlternation(object, anim);
  }

  /** NpcTakeStep */
  private npcTakeStep(object: ObjectEvent): boolean {
    const s = object.sprite;
    const sizes = STEP_SIZES[s.data[4]];
    if (s.data[5] >= sizes.length) return false;
    this.stepSprite(object, sizes[s.data[5]], s.data[3]);
    s.data[5]++;
    return s.data[5] >= sizes.length;
  }

  private updateMovementNormal(object: ObjectEvent): boolean {
    if (this.npcTakeStep(object)) {
      this.shiftStill(object);
      object.triggerGroundEffectsOnStop = true;
      object.sprite.animPaused = true;
      return true;
    }
    return false;
  }

  /** UpdateMovementGlide; the C glide callback deliberately does not pause the sprite animation. */
  private updateMovementGlide(object: ObjectEvent): boolean {
    if (this.npcTakeStep(object)) {
      this.shiftStill(object);
      object.triggerGroundEffectsOnStop = true;
      return true;
    }
    return false;
  }

  private finishStep(object: ObjectEvent): boolean {
    object.sprite.data[2] = 2;
    return true;
  }

  private initWalkSlowStyle(object: ObjectEvent, direction: number, anim: number): void {
    this.setDirection(object, direction);
    const [dx, dy] = DIRECTION_VECTORS[direction];
    this.shiftCoords(object, object.currentCoords.x + dx, object.currentCoords.y + dy);
    const s = object.sprite;
    s.data[3] = direction;
    s.data[4] = 0;
    s.data[5] = 0;
    this.setStepAnimHandleAlternation(object, anim);
    s.animPaused = false;
    object.triggerGroundEffectsOnMove = true;
    s.data[2] = 1;
  }

  private updateWalkSlowStyle(object: ObjectEvent, kind: "slow" | "slower" | "slowest" | "runSlow"): boolean {
    const s = object.sprite;
    const dir = s.data[3];
    switch (kind) {
      case "slower":
        if (!(s.data[4] & 1)) { this.stepSprite(object, 1, dir); s.data[5]++; }
        s.data[4]++;
        break;
      case "slow":
        if (++s.data[4] < 3) { this.stepSprite(object, 1, dir); s.data[5]++; } else s.data[4] = 0;
        break;
      case "slowest":
        if (++s.data[4] > 9) { s.data[4] = 0; this.stepSprite(object, 1, dir); s.data[5]++; }
        break;
      case "runSlow":
        if ((++s.data[4]) & 1) { this.stepSprite(object, 1, dir); s.data[5]++; } else { this.stepSprite(object, 2, dir); s.data[5] += 2; }
        break;
    }
    if (s.data[5] > 15) {
      this.shiftStill(object);
      object.triggerGroundEffectsOnStop = true;
      s.animPaused = true;
      return true;
    }
    return false;
  }

  private initJump(object: ObjectEvent, direction: number, distance: number, type: number, shadow = false): void {
    const displacement = [0, 1, 1][distance];
    let [dx, dy] = DIRECTION_VECTORS[direction];
    dx *= displacement;
    dy *= displacement;
    this.setDirection(object, direction);
    this.shiftCoords(object, object.currentCoords.x + dx, object.currentCoords.y + dy);
    const s = object.sprite;
    SetJumpSpriteData(s, direction, distance, type);
    s.data[2] = 1;
    s.animPaused = false;
    object.landingJump = true;
    object.triggerGroundEffectsOnMove = true;
    object.disableCoveringGroundEffects = true;
    if (shadow) object.hasShadow = true;
  }

  /** DoJumpSpriteMovement */
  private doJump(object: ObjectEvent, special = false): number {
    const s = object.sprite;
    const distance = s.data[4];
    let phase = 0;
    if (!special) {
      const time = [16, 16, 32][distance];
      const shift = [0, 0, 1][distance];
      if (distance !== JUMP_DISTANCE_IN_PLACE) this.stepSprite(object, 1, s.data[3]);
      s.y2 = GetJumpY(s.data[6] >> shift, s.data[5]) ?? 0;
      s.data[6]++;
      if (s.data[6] === time >> 1) phase = JUMP_HALFWAY;
      if (s.data[6] >= time) { s.y2 = 0; phase = JUMP_FINISHED; }
    } else {
      const time = [0x20, 0x20, 0x40][distance];
      const shift = [1, 1, 2][distance];
      if (distance !== JUMP_DISTANCE_IN_PLACE && !(s.data[6] & 1)) this.stepSprite(object, 1, s.data[3]);
      s.y2 = GetJumpY(s.data[6] >> shift, s.data[5]) ?? 0;
      s.data[6]++;
      if (s.data[6] === time >> 1) phase = JUMP_HALFWAY;
      if (s.data[6] >= time) { s.y2 = 0; phase = JUMP_FINISHED; }
    }
    return phase;
  }

  private updateJump(object: ObjectEvent, special = false): number {
    const phase = this.doJump(object, special);
    if (phase === JUMP_HALFWAY && object.sprite.data[4] !== JUMP_DISTANCE_IN_PLACE) {
      const displacement = [0, 0, 1][object.sprite.data[4]] ?? 0;
      if (displacement !== 0) {
        const [dx, dy] = DIRECTION_VECTORS[object.movementDirection & 0xff]!;
        this.shiftCoords(
          object,
          object.currentCoords.x + dx * displacement,
          object.currentCoords.y + dy * displacement,
        );
        object.triggerGroundEffectsOnMove = true;
        object.disableCoveringGroundEffects = true;
      }
    }
    if (phase === JUMP_FINISHED) {
      this.shiftStill(object);
      object.triggerGroundEffectsOnStop = true;
      object.landingJump = true;
      object.hasShadow = false;
      object.sprite.animPaused = true;
    }
    return phase;
  }

  /** event_object_movement.c DoJumpAnimStep. */
  private DoJumpAnimStep(object: ObjectEvent): number {
    return this.updateJump(object);
  }

  /** event_object_movement.c DoJumpSpecialAnimStep. */
  private DoJumpSpecialAnimStep(object: ObjectEvent): number {
    return this.updateJump(object, true);
  }

  private initMoveInPlace(object: ObjectEvent, direction: number, anim: number, duration: number): void {
    this.setDirection(object, direction);
    this.setStepAnim(object, anim);
    object.sprite.animPaused = false;
    object.sprite.data[3] = duration;
    object.sprite.data[2] = 1;
  }

  private updateMoveInPlace(object: ObjectEvent): boolean {
    if (--object.sprite.data[3] === 0) {
      object.sprite.data[2] = 2;
      object.sprite.animPaused = true;
      return true;
    }
    return false;
  }

  /** Runs one frame of the object's current movement action; true when finished. */
  execAction(object: ObjectEvent): boolean {
    const id = object.movementActionId;
    const s = object.sprite;
    const step = s.data[2];
    if (id === MOVEMENT_ACTION_NONE || id === MOVEMENT_ACTION_STEP_END) return true;
    if (step === 2 && id !== 0x68 && id !== 0x69 && id !== 0x98 && id !== 0x99 && id !== 0x9a) return true;
    const dirOf = (base: number) => [DIR_SOUTH, DIR_NORTH, DIR_WEST, DIR_EAST][(id - base) & 3];

    // Face (0x00-0x07)
    if (id <= 0x07) {
      this.faceDirection(object, dirOf(id <= 3 ? 0 : 4));
      return true;
    }
    // Walk slower (0x08-0x0B), slow (0x0C-0x0F)
    if (id >= 0x08 && id <= 0x0f) {
      const slower = id <= 0x0b;
      if (step === 0) this.initWalkSlowStyle(object, dirOf(slower ? 0x08 : 0x0c), moveAnim(dirOf(slower ? 0x08 : 0x0c)));
      if (this.updateWalkSlowStyle(object, slower ? "slower" : "slow")) return this.finishStep(object);
      return false;
    }
    // Walk normal
    if (id >= 0x10 && id <= 0x13) {
      if (step === 0) this.initMovementNormal(object, dirOf(0x10), MOVE_SPEED_NORMAL);
      if (this.updateMovementNormal(object)) return this.finishStep(object);
      return false;
    }
    // Jump 2 (far jump)
    if (id >= 0x14 && id <= 0x17) {
      if (step === 0) {
        this.initJump(object, dirOf(0x14), JUMP_DISTANCE_FAR, JUMP_TYPE_HIGH, true);
        this.setStepAnim(object, moveAnim(object.facingDirection));
      }
      if (this.DoJumpAnimStep(object) === JUMP_FINISHED) { object.landingJump = false; return this.finishStep(object); }
      return false;
    }
    // Delays
    if (id >= 0x18 && id <= 0x1c) {
      if (step === 0) { s.data[3] = [1, 2, 4, 8, 16][id - 0x18]; s.data[2] = 1; }
      if (--s.data[3] === 0) return this.finishStep(object);
      return false;
    }
    // Walk fast
    if (id >= 0x1d && id <= 0x20) {
      if (step === 0) this.initMovementNormal(object, dirOf(0x1d), MOVE_SPEED_FAST_1);
      if (this.updateMovementNormal(object)) return this.finishStep(object);
      return false;
    }
    // Walk in place
    if (id >= 0x21 && id <= 0x30) {
      const group = Math.floor((id - 0x21) / 4);
      const dir = dirOf(0x21);
      if (step === 0) {
        const anim = [moveAnim, moveAnim, moveFastAnim, moveFasterAnim][group](dir);
        this.initMoveInPlace(object, dir, anim, [32, 16, 8, 4][group]);
      }
      return this.updateMoveInPlace(object);
    }
    // Ride water current
    if (id >= 0x31 && id <= 0x34) {
      if (step === 0) this.initMovementNormal(object, dirOf(0x31), MOVE_SPEED_FAST_2);
      if (this.updateMovementNormal(object)) return this.finishStep(object);
      return false;
    }
    // Walk faster
    if (id >= 0x35 && id <= 0x38) {
      if (step === 0) this.initMovementNormal(object, dirOf(0x35), MOVE_SPEED_FASTER);
      if (this.updateMovementNormal(object)) return this.finishStep(object);
      return false;
    }
    // Slide (ice): fast speed, no walk anim
    if (id >= 0x39 && id <= 0x3c) {
      if (step === 0) {
        this.initNpcForMovement(object, dirOf(0x39), MOVE_SPEED_FAST_1);
        this.setStepAnim(object, faceAnim(object.facingDirection));
      }
      if (this.updateMovementNormal(object)) return this.finishStep(object);
      return false;
    }
    // Player run
    if (id >= 0x3d && id <= 0x40) {
      if (step === 0) {
        this.initNpcForMovement(object, dirOf(0x3d), MOVE_SPEED_FAST_1);
        this.setStepAnimHandleAlternation(object, runAnim(object.facingDirection));
      }
      if (this.updateMovementNormal(object)) return this.finishStep(object);
      return false;
    }
    // Player run slow
    if (id >= 0x41 && id <= 0x44) {
      if (step === 0) this.initWalkSlowStyle(object, dirOf(0x41), runAnim(dirOf(0x41)));
      if (this.updateWalkSlowStyle(object, "runSlow")) return this.finishStep(object);
      return false;
    }
    // Start anim in direction
    if (id === 0x45) {
      // StartSpriteAnimInDirection(current animNum) then MovementAction_WaitSpriteAnim
      if (step === 0) {
        this.StartSpriteAnimInDirection(object, object.movementDirection, object.sprite.animNum);
        return false;
      }
      if (SpriteAnimEnded(object.sprite)) return this.finishStep(object);
      return false;
    }
    // Jump special (ledge-like hops with special timing)
    if (id >= 0x46 && id <= 0x49) {
      if (step === 0) {
        this.initJump(object, dirOf(0x46), JUMP_DISTANCE_NORMAL, JUMP_TYPE_HIGH);
        this.setStepAnim(object, moveAnim(object.facingDirection));
      }
      if (this.DoJumpSpecialAnimStep(object) === JUMP_FINISHED) { object.landingJump = false; return this.finishStep(object); }
      return false;
    }
    // Face player / away
    if (id === 0x4a || id === 0x4b) {
      const p = this.hooks.playerDestCoords();
      let direction = GetDirectionToFace(object.currentCoords.x, object.currentCoords.y, p.x, p.y);
      if (id === 0x4b) direction = OPPOSITE[direction];
      this.faceDirection(object, direction);
      return true;
    }
    if (id === 0x4c) { object.facingDirectionLocked = true; return this.finishStep(object); }
    if (id === 0x4d) { object.facingDirectionLocked = false; return this.finishStep(object); }
    // Jump (ledges)
    if (id >= 0x4e && id <= 0x51) {
      if (step === 0) {
        this.initJump(object, dirOf(0x4e), JUMP_DISTANCE_NORMAL, JUMP_TYPE_NORMAL, true);
        this.setStepAnim(object, moveAnim(object.facingDirection));
      }
      if (this.DoJumpAnimStep(object) === JUMP_FINISHED) { object.landingJump = false; return this.finishStep(object); }
      return false;
    }
    // Jump in place
    if (id >= 0x52 && id <= 0x59) {
      const pairs: Array<[number, number]> = [[DIR_SOUTH, DIR_SOUTH], [DIR_NORTH, DIR_NORTH], [DIR_WEST, DIR_WEST], [DIR_EAST, DIR_EAST], [DIR_SOUTH, DIR_NORTH], [DIR_NORTH, DIR_SOUTH], [DIR_WEST, DIR_EAST], [DIR_EAST, DIR_WEST]];
      const [first, second] = pairs[id - 0x52];
      if (step === 0) {
        this.initJump(object, first, JUMP_DISTANCE_IN_PLACE, JUMP_TYPE_LOW, true);
        this.setStepAnim(object, moveAnim(object.facingDirection));
      }
      const phase = this.DoJumpAnimStep(object);
      if (phase === JUMP_HALFWAY && first !== second) {
        this.setDirection(object, second);
        this.setStepAnim(object, moveAnim(object.facingDirection));
      }
      if (phase === JUMP_FINISHED) { object.landingJump = false; return this.finishStep(object); }
      return false;
    }
    if (id === 0x5a) {
      this.faceDirection(object, INITIAL_FACING[object.movementType] ?? DIR_SOUTH);
      return true;
    }
    if (id === 0x5b) {
      // MovementAction_NurseJoyBowDown: StartSpriteAnimInDirection(DIR_SOUTH, ANIM_NURSE_BOW)
      // then MovementAction_WaitSpriteAnim. SetAndStartSpriteAnim clears animPaused,
      // which the preceding walk_in_place left set.
      if (step === 0) {
        this.StartSpriteAnimInDirection(object, DIR_SOUTH, ANIM_NURSE_BOW);
        return false;
      }
      if (SpriteAnimEnded(s)) { s.data[2] = 2; return true; }
      return false;
    }
    if (id === 0x5c) { object.disableJumpLandingGroundEffect = false; return this.finishStep(object); }
    if (id === 0x5d) { object.disableJumpLandingGroundEffect = true; return this.finishStep(object); }
    if (id === 0x5e) { object.disableAnim = true; return this.finishStep(object); }
    if (id === 0x5f) { object.disableAnim = false; object.sprite.animPaused = object.spriteAnimPausedBackup; return this.finishStep(object); }
    if (id === 0x60) { object.invisible = true; return this.finishStep(object); }
    if (id === 0x61) { object.invisible = false; return this.finishStep(object); }
    // Emotes: exclamation, question, X, double exclamation, smile
    if (id >= 0x62 && id <= 0x66) {
      this.hooks.emote(object, id - 0x62);
      return this.finishStep(object);
    }
    if (id === C.MOVEMENT_ACTION_REVEAL_TRAINER) {
      // MovementAction_RevealTrainer_Step0 (event_object_movement.c).
      // The buried case delegates to trainer_see.c; ordinary FRLG trainers
      // only advance the action and keep their current visibility. Disguise
      // movement types are unused in FRLG (trainer_see.c).
      if (object.movementType === C.MOVEMENT_TYPE_BURIED) {
        if (step === 0) {
          this.revealTrainerMovementAction?.(object);
          s.data[2] = 1;
          return false;
        }
        if (this.revealTrainerMovementAction?.(object)) return this.finishStep(object);
        return false;
      }
      if (object.movementType === C.MOVEMENT_TYPE_TREE_DISGUISE || object.movementType === C.MOVEMENT_TYPE_MOUNTAIN_DISGUISE) {
        if (step === 0) {
          this.hooks.startDisguiseReveal?.(object);
          s.data[2] = 1;
          if (this.hooks.isDisguiseRevealFinished?.(object)) return this.finishStep(object);
          return false;
        }
        if (this.hooks.isDisguiseRevealFinished?.(object)) return this.finishStep(object);
        return false;
      }
      return this.finishStep(object);
    }
    if (id === 0x68 || id === 0x69) {
      // RockSmashBreak / CutTree: the C action flashes for 32 frames, then hides the object.
      if (step === 0) {
        SetAndStartSpriteAnim(s, C.ANIM_REMOVE_OBSTACLE, 0);
        s.data[2] = 1;
        return false;
      }
      if (step === 1) {
        if (SpriteAnimEnded(s)) { SetMovementDelay(s, 32); s.data[2] = 2; }
        return false;
      }
      if (step === 2) {
        object.invisible = !object.invisible;
        if (WaitForMovementDelay(s)) { object.invisible = true; s.data[2] = 3; }
        return false;
      }
      return true;
    }
    if (id === 0x6a) { object.fixedPriority = true; return this.finishStep(object); }
    if (id === 0x6b) { object.fixedPriority = false; return this.finishStep(object); }
    if (id >= 0x6c && id <= 0x6f) return this.finishStep(object);
    // Spin (Rocket Hideout spinner tiles)
    if (id >= 0x94 && id <= 0x97) {
      if (step === 0) {
        this.initNpcForMovement(object, dirOf(0x94), MOVE_SPEED_FAST_1);
        this.setStepAnimHandleAlternation(object, ANIM_RUN + 4 + dirIndex(object.facingDirection));
      }
      if (this.updateMovementNormal(object)) return this.finishStep(object);
      return false;
    }
    // Raise hand
    if (id >= 0x98 && id <= 0x9a) {
      if (step === 0) {
        s.startAnim(ANIM_RAISE_HAND);
        s.animPaused = false;
        object.disableAnim = false;
        s.data[2] = 1;
        s.data[4] = 0; s.data[5] = 0; s.data[6] = 0; s.data[7] = 0;
        return false;
      }
      if (id === 0x98) return SpriteAnimEnded(s) ? this.finishStep(object) : false;
      if (id === 0x9a) {
        s.data[7] = (s.data[7] + 4) & 0xff;
        s.x2 = (gSineTable[s.data[7]] ?? 0) >> 7;
        return s.data[7] === 0 ? this.finishStep(object) : false;
      }
      switch (s.data[7]) {
        case 0:
          s.data[6] += 10;
          if (s.data[6] > 127) {
            s.data[6] = 0;
            s.data[5]++;
            s.data[7] = s.data[5];
            s.startAnim(C.ANIM_STD_FACE_SOUTH);
            s.animPaused = false;
            object.disableAnim = false;
          }
          s.y2 = -((3 * (gSineTable[s.data[6] & 0xff] ?? 0)) >> 7);
          object.singleMovementActive = s.y2 !== 0;
          return false;
        case 1:
          if (++s.data[4] > 16) {
            s.data[4] = 0;
            s.startAnim(ANIM_RAISE_HAND);
            s.animPaused = false;
            object.disableAnim = false;
            s.data[7] = 0;
          } else {
            object.singleMovementActive = false;
          }
          return false;
        case 2:
          object.singleMovementActive = false;
          if (++s.data[4] > 80) { s.data[4] = 0; return this.finishStep(object); }
          return false;
        default:
          return false;
      }
    }
    // Walk slowest
    if (id >= 0x9b && id <= 0x9e) {
      if (step === 0) this.initWalkSlowStyle(object, dirOf(0x9b), moveAnim(dirOf(0x9b)));
      if (this.updateWalkSlowStyle(object, "slowest")) return this.finishStep(object);
      return false;
    }
    if (id === 0x9f) {
      if (step === 0) { object.sprite.startAnim(ANIM_RUN + 8); s.data[3] = 32; s.data[2] = 1; }
      return this.updateMoveInPlace(object);
    }
    // Glide (used by Fly/teleport scenes): fast step with face anim
    if (id >= 0xa0 && id <= 0xa3) {
      if (step === 0) {
        const direction = dirOf(0xa0);
        if (object.facingDirection !== direction) object.sprite.startAnim(faceAnim(direction));
        this.initNpcForMovement(object, direction, MOVE_SPEED_FAST_1);
      }
      if (this.updateMovementGlide(object)) return this.finishStep(object);
      return false;
    }
    if (id === 0xa4 || id === 0xa5) {
      // MovementAction_FlyUp/Down: step 0 initializes y2, step 1 moves 8px per frame,
      // and step 2 completes on the following callback, matching the C function table.
      if (step === 0) {
        s.y2 = id === 0xa4 ? 0 : -160;
        s.data[2] = 1;
        return false;
      }
      s.y2 += id === 0xa4 ? -8 : 8;
      if ((id === 0xa4 && s.y2 === -160) || (id === 0xa5 && s.y2 === 0)) s.data[2] = 2;
      return false;
    }
    if (id >= 0xa6 && id <= 0xa9) {
      if (step === 0) {
        this.initJump(object, dirOf(0xa6), JUMP_DISTANCE_NORMAL, JUMP_TYPE_HIGH);
        this.setStepAnim(object, moveAnim(object.facingDirection));
      }
      if (this.DoJumpSpecialAnimStep(object) === JUMP_FINISHED) return this.finishStep(object);
      return false;
    }
    // Acro bike movement actions (event_object_movement.c).
    if (id >= 0x70 && id <= 0x73) {
      const dir = dirOf(0x70);
      if (step === 0) {
        this.setDirection(object, dir);
        this.shiftStill(object);
        this.setStepAnim(object, GetAcroWheeliePedalDirectionAnimNum(dir));
        s.animPaused = true;
        s.data[2] = 1;
      }
      return true;
    }
    if (id >= 0x74 && id <= 0x7b) {
      if (step === 0) {
        const dir = dirOf(id < 0x78 ? 0x74 : 0x78);
        const anim = id < 0x78 ? GetAcroWheelieDirectionAnimNum(dir) : GetAcroEndWheelieDirectionAnimNum(dir);
        this.StartSpriteAnimInDirection(object, dir, anim);
        return false;
      }
      if (SpriteAnimEnded(object.sprite)) return this.finishStep(object);
      return false;
    }
    if (id >= 0x7c && id <= 0x83) {
      const face = id < 0x80;
      const base = face ? 0x7c : 0x80;
      const dir = dirOf(base);
      if (step === 0) {
        if (object.isPlayer) this.hooks.playSE("SE_BIKE_HOP");
        this.initJump(object, dir, face ? JUMP_DISTANCE_IN_PLACE : JUMP_DISTANCE_NORMAL, JUMP_TYPE_LOW, true);
        this.setAndStartSpriteAnim(object.sprite, GetAcroWheelieDirectionAnimNum(dir), 0);
      }
      if (this.DoJumpAnimStep(object) === JUMP_FINISHED) return this.finishStep(object);
      return false;
    }
    if (id >= 0x84 && id <= 0x87) {
      const dir = dirOf(0x84);
      if (step === 0) {
        if (object.isPlayer) this.hooks.playSE("SE_BIKE_HOP");
        this.initJump(object, dir, JUMP_DISTANCE_FAR, JUMP_TYPE_HIGH, true);
        this.setAndStartSpriteAnim(object.sprite, GetAcroWheelieDirectionAnimNum(dir), 0);
      }
      if (this.DoJumpAnimStep(object) === JUMP_FINISHED) return this.finishStep(object);
      return false;
    }
    if (id >= 0x88 && id <= 0x8b) {
      if (step === 0) {
        if (object.isPlayer) this.hooks.playSE("SE_WALL_HIT");
        this.initMoveInPlace(object, dirOf(0x88), GetAcroWheeliePedalDirectionAnimNum(dirOf(0x88)), 8);
      }
      return this.updateMoveInPlace(object);
    }
    if (id >= 0x8c && id <= 0x93) {
      const pop = id < 0x90;
      const base = pop ? 0x8c : 0x90;
      const dir = dirOf(base);
      if (step === 0) {
        this.initNpcForMovement(object, dir, MOVE_SPEED_FAST_1);
        const anim = GetAcroWheelieDirectionAnimNum(object.facingDirection);
        if (pop) this.setAndStartSpriteAnim(s, anim, 0);
        else this.setStepAnimHandleAlternation(object, GetAcroWheeliePedalDirectionAnimNum(object.facingDirection));
      }
      if (this.updateMovementNormal(object)) return this.finishStep(object);
      return false;
    }
    return true;
  }

  /** Ground effect triggers after the action ran (DoGroundEffects_*) */
  runGroundEffects(): void {
    for (const object of this.list) {
      if (object.triggerGroundEffectsOnMove) {
        this.updateMetatileBehaviors(object);
        this.hooks.groundEffect(object, "begin");
        object.triggerGroundEffectsOnMove = false;
      }
      if (object.triggerGroundEffectsOnStop) {
        this.updateMetatileBehaviors(object);
        this.hooks.groundEffect(object, "finish");
        object.triggerGroundEffectsOnStop = false;
        object.landingJump = false;
      }
      this.updatePriority(object);
    }
  }
}

/** GetCollisionFlagsAtCoords (event_object_movement.c). */
export function GetCollisionFlagsAtCoords(objects: ObjectEvents, object: ObjectEvent, x: number, y: number, direction: number): number {
  return objects.GetCollisionFlagsAtCoords(object, x, y, direction);
}

let varGetFn: ((id: number) => number) | undefined;
export function setVarGetter(fn: (id: number) => number): void {
  varGetFn = fn;
}
