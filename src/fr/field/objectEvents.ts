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
import { flagGet, varGet } from "../save";
import { QL_GetPlaybackState } from "../questLogEvents";
import { CONNECTION_INVALID, MAP_OFFSET, MapGridGetCollisionAt, MapGridGetElevationAt, type FieldMap } from "./fieldmap";
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
  inHotSprings = false;
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
  /** GBA sprite ID returned by CreateWarpArrowSprite for the player. */
  warpArrowSpriteId = 0xff;
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

type GfxInfo = { width: number; height: number; inanimate: boolean; anims: AnimCmd[][]; frames: FrameImage[]; reflectionFrames: FrameImage[]; bridgeReflectionFrames: FrameImage[]; disableReflectionPaletteLoad: boolean; animTable: string; shadowSize: string; tracks: string };
const gfxCache = new Map<number, GfxInfo>();

/** GetObjectEventGraphicsInfo (event_object_movement.c), including VAR and invalid-ID resolution. */
export function graphicsInfo(graphicsId: number): GfxInfo {
  let resolvedGraphicsId = graphicsId & 0xff;
  if (resolvedGraphicsId >= C.OBJ_EVENT_GFX_VARS) {
    resolvedGraphicsId = varGet(C.VAR_OBJ_GFX_ID_0 + resolvedGraphicsId - C.OBJ_EVENT_GFX_VARS) & 0xff;
  }
  if (resolvedGraphicsId >= C.NUM_OBJ_EVENT_GFX) resolvedGraphicsId = C.OBJ_EVENT_GFX_LITTLE_BOY;
  let info = gfxCache.get(resolvedGraphicsId);
  if (info) return info;
  const raw = rom.objects.gfx[String(resolvedGraphicsId)] ?? rom.objects.gfx[String(C.OBJ_EVENT_GFX_LITTLE_BOY)];
  const table = rom.objects.animTables[raw.anims] ?? [];
  const anims = table.map((name) => (name ? rom.objects.anims[name] ?? [["F", 0, 16, 0, 0], ["J", 0]] : [["F", 0, 16, 0, 0], ["J", 0]])) as AnimCmd[][];
  info = {
    width: raw.width,
    height: raw.height,
    inanimate: raw.inanimate,
    anims,
    frames: raw.frames.map(([file, index]) => ({ url: `${DATA_ROOT}/${file}`, index, width: raw.width, height: raw.height })),
    reflectionFrames: raw.reflectionFrames.map(([file, index]) => ({ url: `${DATA_ROOT}/${file}`, index, width: raw.width, height: raw.height })),
    bridgeReflectionFrames: raw.bridgeReflectionFrames.map(([file, index]) => ({ url: `${DATA_ROOT}/${file}`, index, width: raw.width, height: raw.height })),
    disableReflectionPaletteLoad: raw.disableReflectionPaletteLoad,
    animTable: raw.anims,
    shadowSize: raw.shadowSize,
    tracks: raw.tracks,
  };
  gfxCache.set(resolvedGraphicsId, info);
  return info;
}

/**
 * sMovementActionFuncs (event_object_movement.c, data/object_events/movement_action_func_tables.h):
 * one entry per MOVEMENT_ACTION_* id (0..169, in enum order), each an ordered list of the
 * MovementAction_*_StepN function names the C dispatcher steps through via
 * `sMovementActionFuncs[actionId][sprite->data[2]]`. Names repeated across rows (e.g.
 * MovementAction_PauseSpriteAnim, MovementAction_Finish) are the same shared C function.
 */
const MOVEMENT_ACTION_STEPS: readonly (readonly string[])[] = [
  /* FACE_DOWN */ ["MovementAction_FaceDown_Step0", "MovementAction_PauseSpriteAnim"],
  /* FACE_UP */ ["MovementAction_FaceUp_Step0", "MovementAction_PauseSpriteAnim"],
  /* FACE_LEFT */ ["MovementAction_FaceLeft_Step0", "MovementAction_PauseSpriteAnim"],
  /* FACE_RIGHT */ ["MovementAction_FaceRight_Step0", "MovementAction_PauseSpriteAnim"],
  /* FACE_DOWN_FAST */ ["MovementAction_FaceDownFast_Step0", "MovementAction_Finish"],
  /* FACE_UP_FAST */ ["MovementAction_FaceUpFast_Step0", "MovementAction_Finish"],
  /* FACE_LEFT_FAST */ ["MovementAction_FaceLeftFast_Step0", "MovementAction_Finish"],
  /* FACE_RIGHT_FAST */ ["MovementAction_FaceRightFast_Step0", "MovementAction_Finish"],
  /* WALK_SLOWER_DOWN */ ["MovementAction_WalkSlowerDown_Step0", "MovementAction_WalkSlowerDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_SLOWER_UP */ ["MovementAction_WalkSlowerUp_Step0", "MovementAction_WalkSlowerUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_SLOWER_LEFT */ ["MovementAction_WalkSlowerLeft_Step0", "MovementAction_WalkSlowerLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_SLOWER_RIGHT */ ["MovementAction_WalkSlowerRight_Step0", "MovementAction_WalkSlowerRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_SLOW_DOWN */ ["MovementAction_WalkSlowDown_Step0", "MovementAction_WalkSlowDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_SLOW_UP */ ["MovementAction_WalkSlowUp_Step0", "MovementAction_WalkSlowUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_SLOW_LEFT */ ["MovementAction_WalkSlowLeft_Step0", "MovementAction_WalkSlowLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_SLOW_RIGHT */ ["MovementAction_WalkSlowRight_Step0", "MovementAction_WalkSlowRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_NORMAL_DOWN */ ["MovementAction_WalkNormalDown_Step0", "MovementAction_WalkNormalDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_NORMAL_UP */ ["MovementAction_WalkNormalUp_Step0", "MovementAction_WalkNormalUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_NORMAL_LEFT */ ["MovementAction_WalkNormalLeft_Step0", "MovementAction_WalkNormalLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_NORMAL_RIGHT */ ["MovementAction_WalkNormalRight_Step0", "MovementAction_WalkNormalRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_2_DOWN */ ["MovementAction_Jump2Down_Step0", "MovementAction_Jump2Down_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_2_UP */ ["MovementAction_Jump2Up_Step0", "MovementAction_Jump2Up_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_2_LEFT */ ["MovementAction_Jump2Left_Step0", "MovementAction_Jump2Left_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_2_RIGHT */ ["MovementAction_Jump2Right_Step0", "MovementAction_Jump2Right_Step1", "MovementAction_PauseSpriteAnim"],
  /* DELAY_1 */ ["MovementAction_Delay1_Step0", "MovementAction_Delay_Step1", "MovementAction_Finish"],
  /* DELAY_2 */ ["MovementAction_Delay2_Step0", "MovementAction_Delay_Step1", "MovementAction_Finish"],
  /* DELAY_4 */ ["MovementAction_Delay4_Step0", "MovementAction_Delay_Step1", "MovementAction_Finish"],
  /* DELAY_8 */ ["MovementAction_Delay8_Step0", "MovementAction_Delay_Step1", "MovementAction_Finish"],
  /* DELAY_16 */ ["MovementAction_Delay16_Step0", "MovementAction_Delay_Step1", "MovementAction_Finish"],
  /* WALK_FAST_DOWN */ ["MovementAction_WalkFastDown_Step0", "MovementAction_WalkFastDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_FAST_UP */ ["MovementAction_WalkFastUp_Step0", "MovementAction_WalkFastUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_FAST_LEFT */ ["MovementAction_WalkFastLeft_Step0", "MovementAction_WalkFastLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_FAST_RIGHT */ ["MovementAction_WalkFastRight_Step0", "MovementAction_WalkFastRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_SLOW_DOWN */ ["MovementAction_WalkInPlaceSlowDown_Step0", "MovementAction_WalkInPlaceSlow_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_SLOW_UP */ ["MovementAction_WalkInPlaceSlowUp_Step0", "MovementAction_WalkInPlaceSlow_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_SLOW_LEFT */ ["MovementAction_WalkInPlaceSlowLeft_Step0", "MovementAction_WalkInPlaceSlow_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_SLOW_RIGHT */ ["MovementAction_WalkInPlaceSlowRight_Step0", "MovementAction_WalkInPlaceSlow_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_NORMAL_DOWN */ ["MovementAction_WalkInPlaceNormalDown_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_NORMAL_UP */ ["MovementAction_WalkInPlaceNormalUp_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_NORMAL_LEFT */ ["MovementAction_WalkInPlaceNormalLeft_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_NORMAL_RIGHT */ ["MovementAction_WalkInPlaceNormalRight_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_FAST_DOWN */ ["MovementAction_WalkInPlaceFastDown_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_FAST_UP */ ["MovementAction_WalkInPlaceFastUp_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_FAST_LEFT */ ["MovementAction_WalkInPlaceFastLeft_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_FAST_RIGHT */ ["MovementAction_WalkInPlaceFastRight_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_FASTER_DOWN */ ["MovementAction_WalkInPlaceFasterDown_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_FASTER_UP */ ["MovementAction_WalkInPlaceFasterUp_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_FASTER_LEFT */ ["MovementAction_WalkInPlaceFasterLeft_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_IN_PLACE_FASTER_RIGHT */ ["MovementAction_WalkInPlaceFasterRight_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* RIDE_WATER_CURRENT_DOWN */ ["MovementAction_RideWaterCurrentDown_Step0", "MovementAction_RideWaterCurrentDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* RIDE_WATER_CURRENT_UP */ ["MovementAction_RideWaterCurrentUp_Step0", "MovementAction_RideWaterCurrentUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* RIDE_WATER_CURRENT_LEFT */ ["MovementAction_RideWaterCurrentLeft_Step0", "MovementAction_RideWaterCurrentLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* RIDE_WATER_CURRENT_RIGHT */ ["MovementAction_RideWaterCurrentRight_Step0", "MovementAction_RideWaterCurrentRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_FASTER_DOWN */ ["MovementAction_WalkFasterDown_Step0", "MovementAction_WalkFasterDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_FASTER_UP */ ["MovementAction_WalkFasterUp_Step0", "MovementAction_WalkFasterUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_FASTER_LEFT */ ["MovementAction_WalkFasterLeft_Step0", "MovementAction_WalkFasterLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_FASTER_RIGHT */ ["MovementAction_WalkFasterRight_Step0", "MovementAction_WalkFasterRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* SLIDE_DOWN */ ["MovementAction_SlideDown_Step0", "MovementAction_SlideDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* SLIDE_UP */ ["MovementAction_SlideUp_Step0", "MovementAction_SlideUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* SLIDE_LEFT */ ["MovementAction_SlideLeft_Step0", "MovementAction_SlideLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* SLIDE_RIGHT */ ["MovementAction_SlideRight_Step0", "MovementAction_SlideRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* PLAYER_RUN_DOWN */ ["MovementAction_PlayerRunDown_Step0", "MovementAction_PlayerRunDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* PLAYER_RUN_UP */ ["MovementAction_PlayerRunUp_Step0", "MovementAction_PlayerRunUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* PLAYER_RUN_LEFT */ ["MovementAction_PlayerRunLeft_Step0", "MovementAction_PlayerRunLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* PLAYER_RUN_RIGHT */ ["MovementAction_PlayerRunRight_Step0", "MovementAction_PlayerRunRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* PLAYER_RUN_DOWN_SLOW */ ["MovementAction_RunDownSlow_Step0", "MovementAction_RunDownSlow_Step1", "MovementAction_PauseSpriteAnim"],
  /* PLAYER_RUN_UP_SLOW */ ["MovementAction_RunUpSlow_Step0", "MovementAction_RunUpSlow_Step1", "MovementAction_PauseSpriteAnim"],
  /* PLAYER_RUN_LEFT_SLOW */ ["MovementAction_RunLeftSlow_Step0", "MovementAction_RunLeftSlow_Step1", "MovementAction_PauseSpriteAnim"],
  /* PLAYER_RUN_RIGHT_SLOW */ ["MovementAction_RunRightSlow_Step0", "MovementAction_RunRightSlow_Step1", "MovementAction_PauseSpriteAnim"],
  /* START_ANIM_IN_DIRECTION */ ["MovementAction_StartAnimInDirection_Step0", "MovementAction_WaitSpriteAnim", "MovementAction_PauseSpriteAnim"],
  /* JUMP_SPECIAL_DOWN */ ["MovementAction_JumpSpecialDown_Step0", "MovementAction_JumpSpecialDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_SPECIAL_UP */ ["MovementAction_JumpSpecialUp_Step0", "MovementAction_JumpSpecialUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_SPECIAL_LEFT */ ["MovementAction_JumpSpecialLeft_Step0", "MovementAction_JumpSpecialLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_SPECIAL_RIGHT */ ["MovementAction_JumpSpecialRight_Step0", "MovementAction_JumpSpecialRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* FACE_PLAYER */ ["MovementAction_FacePlayer_Step0", "MovementAction_PauseSpriteAnim"],
  /* FACE_AWAY_PLAYER */ ["MovementAction_FaceAwayPlayer_Step0", "MovementAction_PauseSpriteAnim"],
  /* LOCK_FACING_DIRECTION */ ["MovementAction_LockFacingDirection_Step0", "MovementAction_PauseSpriteAnim"],
  /* UNLOCK_FACING_DIRECTION */ ["MovementAction_UnlockFacingDirection_Step0", "MovementAction_PauseSpriteAnim"],
  /* JUMP_DOWN */ ["MovementAction_JumpDown_Step0", "MovementAction_JumpDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_UP */ ["MovementAction_JumpUp_Step0", "MovementAction_JumpUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_LEFT */ ["MovementAction_JumpLeft_Step0", "MovementAction_JumpLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_RIGHT */ ["MovementAction_JumpRight_Step0", "MovementAction_JumpRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_IN_PLACE_DOWN */ ["MovementAction_JumpInPlaceDown_Step0", "MovementAction_JumpInPlaceDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_IN_PLACE_UP */ ["MovementAction_JumpInPlaceUp_Step0", "MovementAction_JumpInPlaceUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_IN_PLACE_LEFT */ ["MovementAction_JumpInPlaceLeft_Step0", "MovementAction_JumpInPlaceLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_IN_PLACE_RIGHT */ ["MovementAction_JumpInPlaceRight_Step0", "MovementAction_JumpInPlaceRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_IN_PLACE_DOWN_UP */ ["MovementAction_JumpInPlaceDownUp_Step0", "MovementAction_JumpInPlaceDownUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_IN_PLACE_UP_DOWN */ ["MovementAction_JumpInPlaceUpDown_Step0", "MovementAction_JumpInPlaceUpDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_IN_PLACE_LEFT_RIGHT */ ["MovementAction_JumpInPlaceLeftRight_Step0", "MovementAction_JumpInPlaceLeftRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_IN_PLACE_RIGHT_LEFT */ ["MovementAction_JumpInPlaceRightLeft_Step0", "MovementAction_JumpInPlaceRightLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* FACE_ORIGINAL_DIRECTION */ ["MovementAction_FaceOriginalDirection_Step0", "MovementAction_PauseSpriteAnim"],
  /* NURSE_JOY_BOW_DOWN */ ["MovementAction_NurseJoyBowDown_Step0", "MovementAction_WaitSpriteAnim", "MovementAction_PauseSpriteAnim"],
  /* ENABLE_JUMP_LANDING_GROUND_EFFECT */ ["MovementAction_EnableJumpLandingGroundEffect_Step0", "MovementAction_Finish"],
  /* DISABLE_JUMP_LANDING_GROUND_EFFECT */ ["MovementAction_DisableJumpLandingGroundEffect_Step0", "MovementAction_Finish"],
  /* DISABLE_ANIMATION */ ["MovementAction_DisableAnimation_Step0", "MovementAction_Finish"],
  /* RESTORE_ANIMATION */ ["MovementAction_RestoreAnimation_Step0", "MovementAction_Finish"],
  /* SET_INVISIBLE */ ["MovementAction_SetInvisible_Step0", "MovementAction_Finish"],
  /* SET_VISIBLE */ ["MovementAction_SetVisible_Step0", "MovementAction_Finish"],
  /* EMOTE_EXCLAMATION_MARK */ ["MovementAction_EmoteExclamationMark_Step0", "MovementAction_Finish"],
  /* EMOTE_QUESTION_MARK */ ["MovementAction_EmoteQuestionMark_Step0", "MovementAction_Finish"],
  /* EMOTE_X */ ["MovementAction_EmoteX_Step0", "MovementAction_Finish"],
  /* EMOTE_DOUBLE_EXCL_MARK */ ["MovementAction_EmoteDoubleExclamationMark_Step0", "MovementAction_Finish"],
  /* EMOTE_SMILE */ ["MovementAction_EmoteSmile_Step0", "MovementAction_Finish"],
  /* REVEAL_TRAINER */ ["MovementAction_RevealTrainer_Step0", "MovementAction_RevealTrainer_Step1", "MovementAction_Finish"],
  /* ROCK_SMASH_BREAK */ ["MovementAction_RockSmashBreak_Step0", "MovementAction_RockSmashBreak_Step1", "MovementAction_RockSmashBreak_Step2", "MovementAction_Finish"],
  /* CUT_TREE */ ["MovementAction_CutTree_Step0", "MovementAction_CutTree_Step1", "MovementAction_CutTree_Step2", "MovementAction_Finish"],
  /* SET_FIXED_PRIORITY */ ["MovementAction_SetFixedPriority_Step0", "MovementAction_Finish"],
  /* CLEAR_FIXED_PRIORITY */ ["MovementAction_ClearFixedPriority_Step0", "MovementAction_Finish"],
  /* INIT_AFFINE_ANIM */ ["MovementAction_InitAffineAnim_Step0", "MovementAction_Finish"],
  /* CLEAR_AFFINE_ANIM */ ["MovementAction_ClearAffineAnim_Step0", "MovementAction_Finish"],
  /* WALK_DOWN_START_AFFINE */ ["MovementAction_WalkDownStartAffine_Step0", "MovementAction_WalkDownStartAffine_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_DOWN_AFFINE */ ["MovementAction_WalkDownAffine_Step0", "MovementAction_WalkDownAffine_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_FACE_DOWN */ ["MovementAction_AcroWheelieFaceDown_Step0", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_FACE_UP */ ["MovementAction_AcroWheelieFaceUp_Step0", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_FACE_LEFT */ ["MovementAction_AcroWheelieFaceLeft_Step0", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_FACE_RIGHT */ ["MovementAction_AcroWheelieFaceRight_Step0", "MovementAction_PauseSpriteAnim"],
  /* ACRO_POP_WHEELIE_DOWN */ ["MovementAction_AcroPopWheelieDown_Step0", "MovementAction_WaitSpriteAnim", "MovementAction_PauseSpriteAnim"],
  /* ACRO_POP_WHEELIE_UP */ ["MovementAction_AcroPopWheelieUp_Step0", "MovementAction_WaitSpriteAnim", "MovementAction_PauseSpriteAnim"],
  /* ACRO_POP_WHEELIE_LEFT */ ["MovementAction_AcroPopWheelieLeft_Step0", "MovementAction_WaitSpriteAnim", "MovementAction_PauseSpriteAnim"],
  /* ACRO_POP_WHEELIE_RIGHT */ ["MovementAction_AcroPopWheelieRight_Step0", "MovementAction_WaitSpriteAnim", "MovementAction_PauseSpriteAnim"],
  /* ACRO_END_WHEELIE_FACE_DOWN */ ["MovementAction_AcroEndWheelieFaceDown_Step0", "MovementAction_WaitSpriteAnim", "MovementAction_PauseSpriteAnim"],
  /* ACRO_END_WHEELIE_FACE_UP */ ["MovementAction_AcroEndWheelieFaceUp_Step0", "MovementAction_WaitSpriteAnim", "MovementAction_PauseSpriteAnim"],
  /* ACRO_END_WHEELIE_FACE_LEFT */ ["MovementAction_AcroEndWheelieFaceLeft_Step0", "MovementAction_WaitSpriteAnim", "MovementAction_PauseSpriteAnim"],
  /* ACRO_END_WHEELIE_FACE_RIGHT */ ["MovementAction_AcroEndWheelieFaceRight_Step0", "MovementAction_WaitSpriteAnim", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_HOP_FACE_DOWN */ ["MovementAction_AcroWheelieHopFaceDown_Step0", "MovementAction_AcroWheelieHopFaceDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_HOP_FACE_UP */ ["MovementAction_AcroWheelieHopFaceUp_Step0", "MovementAction_AcroWheelieHopFaceUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_HOP_FACE_LEFT */ ["MovementAction_AcroWheelieHopFaceLeft_Step0", "MovementAction_AcroWheelieHopFaceLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_HOP_FACE_RIGHT */ ["MovementAction_AcroWheelieHopFaceRight_Step0", "MovementAction_AcroWheelieHopFaceRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_HOP_DOWN */ ["MovementAction_AcroWheelieHopDown_Step0", "MovementAction_AcroWheelieHopDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_HOP_UP */ ["MovementAction_AcroWheelieHopUp_Step0", "MovementAction_AcroWheelieHopUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_HOP_LEFT */ ["MovementAction_AcroWheelieHopLeft_Step0", "MovementAction_AcroWheelieHopLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_HOP_RIGHT */ ["MovementAction_AcroWheelieHopRight_Step0", "MovementAction_AcroWheelieHopRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_JUMP_DOWN */ ["MovementAction_AcroWheelieJumpDown_Step0", "MovementAction_AcroWheelieJumpDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_JUMP_UP */ ["MovementAction_AcroWheelieJumpUp_Step0", "MovementAction_AcroWheelieJumpUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_JUMP_LEFT */ ["MovementAction_AcroWheelieJumpLeft_Step0", "MovementAction_AcroWheelieJumpLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_JUMP_RIGHT */ ["MovementAction_AcroWheelieJumpRight_Step0", "MovementAction_AcroWheelieJumpRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_IN_PLACE_DOWN */ ["MovementAction_AcroWheelieInPlaceDown_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_IN_PLACE_UP */ ["MovementAction_AcroWheelieInPlaceUp_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_IN_PLACE_LEFT */ ["MovementAction_AcroWheelieInPlaceLeft_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_IN_PLACE_RIGHT */ ["MovementAction_AcroWheelieInPlaceRight_Step0", "MovementAction_WalkInPlace_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_POP_WHEELIE_MOVE_DOWN */ ["MovementAction_AcroPopWheelieMoveDown_Step0", "MovementAction_AcroPopWheelieMoveDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_POP_WHEELIE_MOVE_UP */ ["MovementAction_AcroPopWheelieMoveUp_Step0", "MovementAction_AcroPopWheelieMoveUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_POP_WHEELIE_MOVE_LEFT */ ["MovementAction_AcroPopWheelieMoveLeft_Step0", "MovementAction_AcroPopWheelieMoveLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_POP_WHEELIE_MOVE_RIGHT */ ["MovementAction_AcroPopWheelieMoveRight_Step0", "MovementAction_AcroPopWheelieMoveRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_MOVE_DOWN */ ["MovementAction_AcroWheelieMoveDown_Step0", "MovementAction_AcroWheelieMoveDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_MOVE_UP */ ["MovementAction_AcroWheelieMoveUp_Step0", "MovementAction_AcroWheelieMoveUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_MOVE_LEFT */ ["MovementAction_AcroWheelieMoveLeft_Step0", "MovementAction_AcroWheelieMoveLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* ACRO_WHEELIE_MOVE_RIGHT */ ["MovementAction_AcroWheelieMoveRight_Step0", "MovementAction_AcroWheelieMoveRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* SPIN_DOWN */ ["MovementAction_SpinDown_Step0", "MovementAction_SpinDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* SPIN_UP */ ["MovementAction_SpinUp_Step0", "MovementAction_SpinUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* SPIN_LEFT */ ["MovementAction_SpinLeft_Step0", "MovementAction_SpinLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* SPIN_RIGHT */ ["MovementAction_SpinRight_Step0", "MovementAction_SpinRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* RAISE_HAND_AND_STOP */ ["MovementAction_RaiseHand_Step0", "MovementAction_RaiseHandAndStop_Step1"],
  /* RAISE_HAND_AND_JUMP */ ["MovementAction_RaiseHand_Step0", "MovementAction_RaiseHandAndJump_Step1"],
  /* RAISE_HAND_AND_SWIM */ ["MovementAction_RaiseHand_Step0", "MovementAction_RaiseHandAndSwim_Step1"],
  /* WALK_SLOWEST_DOWN */ ["MovementAction_WalkSlowestDown_Step0", "MovementAction_WalkSlowestDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_SLOWEST_UP */ ["MovementAction_WalkSlowestUp_Step0", "MovementAction_WalkSlowestUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_SLOWEST_LEFT */ ["MovementAction_WalkSlowestLeft_Step0", "MovementAction_WalkSlowestLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* WALK_SLOWEST_RIGHT */ ["MovementAction_WalkSlowestRight_Step0", "MovementAction_WalkSlowestRight_Step1", "MovementAction_PauseSpriteAnim"],
  /* SHAKE_HEAD_OR_WALK_IN_PLACE */ ["MovementAction_ShakeHeadOrWalkInPlace_Step0", "MovementAction_ShakeHeadOrWalkInPlace_Step1"],
  /* GLIDE_DOWN */ ["MovementAction_GlideDown_Step0", "MovementAction_GlideDown_Step1", "MovementAction_Finish"],
  /* GLIDE_UP */ ["MovementAction_GlideUp_Step0", "MovementAction_GlideUp_Step1", "MovementAction_Finish"],
  /* GLIDE_LEFT */ ["MovementAction_GlideLeft_Step0", "MovementAction_GlideLeft_Step1", "MovementAction_Finish"],
  /* GLIDE_RIGHT */ ["MovementAction_GlideRight_Step0", "MovementAction_GlideRight_Step1", "MovementAction_Finish"],
  /* FLY_UP */ ["MovementAction_FlyUp_Step0", "MovementAction_FlyUp_Step1", "MovementAction_FlyUp_Step2"],
  /* FLY_DOWN */ ["MovementAction_FlyDown_Step0", "MovementAction_FlyDown_Step1", "MovementAction_FlyUp_Step2"],
  /* JUMP_SPECIAL_WITH_EFFECT_DOWN */ ["MovementAction_JumpSpecialWithEffectDown_Step0", "MovementAction_JumpSpecialWithEffectDown_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_SPECIAL_WITH_EFFECT_UP */ ["MovementAction_JumpSpecialWithEffectUp_Step0", "MovementAction_JumpSpecialWithEffectUp_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_SPECIAL_WITH_EFFECT_LEFT */ ["MovementAction_JumpSpecialWithEffectLeft_Step0", "MovementAction_JumpSpecialWithEffectLeft_Step1", "MovementAction_PauseSpriteAnim"],
  /* JUMP_SPECIAL_WITH_EFFECT_RIGHT */ ["MovementAction_JumpSpecialWithEffectRight_Step0", "MovementAction_JumpSpecialWithEffectRight_Step1", "MovementAction_PauseSpriteAnim"],
];

/**
 * sMovementTypeCallbacks (event_object_movement.c): one entry per MOVEMENT_TYPE_* id
 * (0..80), naming the MovementType_* setup it runs. null matches C's NULL entry
 * (MOVEMENT_TYPE_BERRY_TREE_GROWTH has no movement-type behavior).
 */
const MOVEMENT_TYPE_CALLBACKS: readonly (string | null)[] = [
  /* NONE */ "MovementType_None",
  /* LOOK_AROUND */ "MovementType_LookAround",
  /* WANDER_AROUND */ "MovementType_WanderAround",
  /* WANDER_UP_AND_DOWN */ "MovementType_WanderUpAndDown",
  /* WANDER_DOWN_AND_UP */ "MovementType_WanderUpAndDown",
  /* WANDER_LEFT_AND_RIGHT */ "MovementType_WanderLeftAndRight",
  /* WANDER_RIGHT_AND_LEFT */ "MovementType_WanderLeftAndRight",
  /* FACE_UP */ "MovementType_FaceDirection",
  /* FACE_DOWN */ "MovementType_FaceDirection",
  /* FACE_LEFT */ "MovementType_FaceDirection",
  /* FACE_RIGHT */ "MovementType_FaceDirection",
  /* PLAYER */ "MovementType_Player",
  /* BERRY_TREE_GROWTH */ null,
  /* FACE_DOWN_AND_UP */ "MovementType_FaceDownAndUp",
  /* FACE_LEFT_AND_RIGHT */ "MovementType_FaceLeftAndRight",
  /* FACE_UP_AND_LEFT */ "MovementType_FaceUpAndLeft",
  /* FACE_UP_AND_RIGHT */ "MovementType_FaceUpAndRight",
  /* FACE_DOWN_AND_LEFT */ "MovementType_FaceDownAndLeft",
  /* FACE_DOWN_AND_RIGHT */ "MovementType_FaceDownAndRight",
  /* FACE_DOWN_UP_AND_LEFT */ "MovementType_FaceDownUpAndLeft",
  /* FACE_DOWN_UP_AND_RIGHT */ "MovementType_FaceDownUpAndRight",
  /* FACE_UP_LEFT_AND_RIGHT */ "MovementType_FaceUpRightAndLeft",
  /* FACE_DOWN_LEFT_AND_RIGHT */ "MovementType_FaceDownRightAndLeft",
  /* ROTATE_COUNTERCLOCKWISE */ "MovementType_RotateCounterclockwise",
  /* ROTATE_CLOCKWISE */ "MovementType_RotateClockwise",
  /* WALK_UP_AND_DOWN */ "MovementType_WalkBackAndForth",
  /* WALK_DOWN_AND_UP */ "MovementType_WalkBackAndForth",
  /* WALK_LEFT_AND_RIGHT */ "MovementType_WalkBackAndForth",
  /* WALK_RIGHT_AND_LEFT */ "MovementType_WalkBackAndForth",
  /* WALK_SEQUENCE_UP_RIGHT_LEFT_DOWN */ "MovementType_WalkSequenceUpRightLeftDown",
  /* WALK_SEQUENCE_RIGHT_LEFT_DOWN_UP */ "MovementType_WalkSequenceRightLeftDownUp",
  /* WALK_SEQUENCE_DOWN_UP_RIGHT_LEFT */ "MovementType_WalkSequenceDownUpRightLeft",
  /* WALK_SEQUENCE_LEFT_DOWN_UP_RIGHT */ "MovementType_WalkSequenceLeftDownUpRight",
  /* WALK_SEQUENCE_UP_LEFT_RIGHT_DOWN */ "MovementType_WalkSequenceUpLeftRightDown",
  /* WALK_SEQUENCE_LEFT_RIGHT_DOWN_UP */ "MovementType_WalkSequenceLeftRightDownUp",
  /* WALK_SEQUENCE_DOWN_UP_LEFT_RIGHT */ "MovementType_WalkSequenceDownUpLeftRight",
  /* WALK_SEQUENCE_RIGHT_DOWN_UP_LEFT */ "MovementType_WalkSequenceRightDownUpLeft",
  /* WALK_SEQUENCE_LEFT_UP_DOWN_RIGHT */ "MovementType_WalkSequenceLeftUpDownRight",
  /* WALK_SEQUENCE_UP_DOWN_RIGHT_LEFT */ "MovementType_WalkSequenceUpDownRightLeft",
  /* WALK_SEQUENCE_RIGHT_LEFT_UP_DOWN */ "MovementType_WalkSequenceRightLeftUpDown",
  /* WALK_SEQUENCE_DOWN_RIGHT_LEFT_UP */ "MovementType_WalkSequenceDownRightLeftUp",
  /* WALK_SEQUENCE_RIGHT_UP_DOWN_LEFT */ "MovementType_WalkSequenceRightUpDownLeft",
  /* WALK_SEQUENCE_UP_DOWN_LEFT_RIGHT */ "MovementType_WalkSequenceUpDownLeftRight",
  /* WALK_SEQUENCE_LEFT_RIGHT_UP_DOWN */ "MovementType_WalkSequenceLeftRightUpDown",
  /* WALK_SEQUENCE_DOWN_LEFT_RIGHT_UP */ "MovementType_WalkSequenceDownLeftRightUp",
  /* WALK_SEQUENCE_UP_LEFT_DOWN_RIGHT */ "MovementType_WalkSequenceUpLeftDownRight",
  /* WALK_SEQUENCE_DOWN_RIGHT_UP_LEFT */ "MovementType_WalkSequenceDownRightUpLeft",
  /* WALK_SEQUENCE_LEFT_DOWN_RIGHT_UP */ "MovementType_WalkSequenceLeftDownRightUp",
  /* WALK_SEQUENCE_RIGHT_UP_LEFT_DOWN */ "MovementType_WalkSequenceRightUpLeftDown",
  /* WALK_SEQUENCE_UP_RIGHT_DOWN_LEFT */ "MovementType_WalkSequenceUpRightDownLeft",
  /* WALK_SEQUENCE_DOWN_LEFT_UP_RIGHT */ "MovementType_WalkSequenceDownLeftUpRight",
  /* WALK_SEQUENCE_LEFT_UP_RIGHT_DOWN */ "MovementType_WalkSequenceLeftUpRightDown",
  /* WALK_SEQUENCE_RIGHT_DOWN_LEFT_UP */ "MovementType_WalkSequenceRightDownLeftUp",
  /* COPY_PLAYER */ "MovementType_CopyPlayer",
  /* COPY_PLAYER_OPPOSITE */ "MovementType_CopyPlayer",
  /* COPY_PLAYER_COUNTERCLOCKWISE */ "MovementType_CopyPlayer",
  /* COPY_PLAYER_CLOCKWISE */ "MovementType_CopyPlayer",
  /* TREE_DISGUISE */ "MovementType_TreeDisguise",
  /* MOUNTAIN_DISGUISE */ "MovementType_MountainDisguise",
  /* COPY_PLAYER_IN_GRASS */ "MovementType_CopyPlayerInGrass",
  /* COPY_PLAYER_OPPOSITE_IN_GRASS */ "MovementType_CopyPlayerInGrass",
  /* COPY_PLAYER_COUNTERCLOCKWISE_IN_GRASS */ "MovementType_CopyPlayerInGrass",
  /* COPY_PLAYER_CLOCKWISE_IN_GRASS */ "MovementType_CopyPlayerInGrass",
  /* BURIED */ "MovementType_Buried",
  /* WALK_IN_PLACE_DOWN */ "MovementType_WalkInPlace",
  /* WALK_IN_PLACE_UP */ "MovementType_WalkInPlace",
  /* WALK_IN_PLACE_LEFT */ "MovementType_WalkInPlace",
  /* WALK_IN_PLACE_RIGHT */ "MovementType_WalkInPlace",
  /* WALK_IN_PLACE_FAST_DOWN */ "MovementType_WalkInPlaceFast",
  /* WALK_IN_PLACE_FAST_UP */ "MovementType_WalkInPlaceFast",
  /* WALK_IN_PLACE_FAST_LEFT */ "MovementType_WalkInPlaceFast",
  /* WALK_IN_PLACE_FAST_RIGHT */ "MovementType_WalkInPlaceFast",
  /* JOG_IN_PLACE_DOWN */ "MovementType_JogInPlace",
  /* JOG_IN_PLACE_UP */ "MovementType_JogInPlace",
  /* JOG_IN_PLACE_LEFT */ "MovementType_JogInPlace",
  /* JOG_IN_PLACE_RIGHT */ "MovementType_JogInPlace",
  /* INVISIBLE */ "MovementType_Invisible",
  /* RAISE_HAND_AND_STOP */ "MovementType_RaiseHandAndStop",
  /* RAISE_HAND_AND_JUMP */ "MovementType_RaiseHandAndJump",
  /* RAISE_HAND_AND_SWIM */ "MovementType_RaiseHandAndSwim",
  /* WANDER_AROUND_SLOWER */ "MovementType_WanderAroundSlower",
];

/**
 * gMovementTypeFuncs_<name> (event_object_movement.c, data/object_events/movement_type_func_tables.h):
 * per MovementType_* setup, the ordered MovementType_*_StepN callbacks it steps through via
 * sprite->data[1]. MovementType_None/_Player/_TreeDisguise/_MountainDisguise have no table in
 * C either; they run their own body directly (see movementTypeCallback).
 */
const MOVEMENT_TYPE_STEPS: Readonly<Record<string, readonly string[]>> = {
  MovementType_WanderAround: ["MovementType_WanderAround_Step0", "MovementType_WanderAround_Step1", "MovementType_WanderAround_Step2", "MovementType_WanderAround_Step3", "MovementType_WanderAround_Step4", "MovementType_WanderAround_Step5", "MovementType_WanderAround_Step6"],
  MovementType_WanderAroundSlower: ["MovementType_WanderAround_Step0", "MovementType_WanderAround_Step1", "MovementType_WanderAround_Step2", "MovementType_WanderAround_Step3", "MovementType_WanderAround_Step4", "MovementType_WanderAround_Step5Slower", "MovementType_WanderAround_Step6"],
  MovementType_LookAround: ["MovementType_LookAround_Step0", "MovementType_LookAround_Step1", "MovementType_LookAround_Step2", "MovementType_LookAround_Step3", "MovementType_LookAround_Step4"],
  MovementType_WanderUpAndDown: ["MovementType_WanderUpAndDown_Step0", "MovementType_WanderUpAndDown_Step1", "MovementType_WanderUpAndDown_Step2", "MovementType_WanderUpAndDown_Step3", "MovementType_WanderUpAndDown_Step4", "MovementType_WanderUpAndDown_Step5", "MovementType_WanderUpAndDown_Step6"],
  MovementType_WanderLeftAndRight: ["MovementType_WanderLeftAndRight_Step0", "MovementType_WanderLeftAndRight_Step1", "MovementType_WanderLeftAndRight_Step2", "MovementType_WanderLeftAndRight_Step3", "MovementType_WanderLeftAndRight_Step4", "MovementType_WanderLeftAndRight_Step5", "MovementType_WanderLeftAndRight_Step6"],
  MovementType_FaceDirection: ["MovementType_FaceDirection_Step0", "MovementType_FaceDirection_Step1", "MovementType_FaceDirection_Step2"],
  MovementType_FaceDownAndUp: ["MovementType_FaceDownAndUp_Step0", "MovementType_FaceDownAndUp_Step1", "MovementType_FaceDownAndUp_Step2", "MovementType_FaceDownAndUp_Step3", "MovementType_FaceDownAndUp_Step4"],
  MovementType_FaceLeftAndRight: ["MovementType_FaceLeftAndRight_Step0", "MovementType_FaceLeftAndRight_Step1", "MovementType_FaceLeftAndRight_Step2", "MovementType_FaceLeftAndRight_Step3", "MovementType_FaceLeftAndRight_Step4"],
  MovementType_FaceUpAndLeft: ["MovementType_FaceUpAndLeft_Step0", "MovementType_FaceUpAndLeft_Step1", "MovementType_FaceUpAndLeft_Step2", "MovementType_FaceUpAndLeft_Step3", "MovementType_FaceUpAndLeft_Step4"],
  MovementType_FaceUpAndRight: ["MovementType_FaceUpAndRight_Step0", "MovementType_FaceUpAndRight_Step1", "MovementType_FaceUpAndRight_Step2", "MovementType_FaceUpAndRight_Step3", "MovementType_FaceUpAndRight_Step4"],
  MovementType_FaceDownAndLeft: ["MovementType_FaceDownAndLeft_Step0", "MovementType_FaceDownAndLeft_Step1", "MovementType_FaceDownAndLeft_Step2", "MovementType_FaceDownAndLeft_Step3", "MovementType_FaceDownAndLeft_Step4"],
  MovementType_FaceDownAndRight: ["MovementType_FaceDownAndRight_Step0", "MovementType_FaceDownAndRight_Step1", "MovementType_FaceDownAndRight_Step2", "MovementType_FaceDownAndRight_Step3", "MovementType_FaceDownAndRight_Step4"],
  MovementType_FaceDownUpAndLeft: ["MovementType_FaceDownUpAndLeft_Step0", "MovementType_FaceDownUpAndLeft_Step1", "MovementType_FaceDownUpAndLeft_Step2", "MovementType_FaceDownUpAndLeft_Step3", "MovementType_FaceDownUpAndLeft_Step4"],
  MovementType_FaceDownUpAndRight: ["MovementType_FaceDownUpAndRight_Step0", "MovementType_FaceDownUpAndRight_Step1", "MovementType_FaceDownUpAndRight_Step2", "MovementType_FaceDownUpAndRight_Step3", "MovementType_FaceDownUpAndRight_Step4"],
  MovementType_FaceUpRightAndLeft: ["MovementType_FaceUpLeftAndRight_Step0", "MovementType_FaceUpLeftAndRight_Step1", "MovementType_FaceUpLeftAndRight_Step2", "MovementType_FaceUpLeftAndRight_Step3", "MovementType_FaceUpLeftAndRight_Step4"],
  MovementType_FaceDownRightAndLeft: ["MovementType_FaceDownLeftAndRight_Step0", "MovementType_FaceDownLeftAndRight_Step1", "MovementType_FaceDownLeftAndRight_Step2", "MovementType_FaceDownLeftAndRight_Step3", "MovementType_FaceDownLeftAndRight_Step4"],
  MovementType_RotateCounterclockwise: ["MovementType_RotateCounterclockwise_Step0", "MovementType_RotateCounterclockwise_Step1", "MovementType_RotateCounterclockwise_Step2", "MovementType_RotateCounterclockwise_Step3"],
  MovementType_RotateClockwise: ["MovementType_RotateClockwise_Step0", "MovementType_RotateClockwise_Step1", "MovementType_RotateClockwise_Step2", "MovementType_RotateClockwise_Step3"],
  MovementType_WalkBackAndForth: ["MovementType_WalkBackAndForth_Step0", "MovementType_WalkBackAndForth_Step1", "MovementType_WalkBackAndForth_Step2", "MovementType_WalkBackAndForth_Step3"],
  MovementType_WalkSequenceUpRightLeftDown: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceUpRightLeftDown_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceRightLeftDownUp: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceRightLeftDownUp_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceDownUpRightLeft: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceDownUpRightLeft_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceLeftDownUpRight: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceLeftDownUpRight_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceUpLeftRightDown: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceUpLeftRightDown_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceLeftRightDownUp: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceLeftRightDownUp_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceDownUpLeftRight: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceDownUpLeftRight_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceRightDownUpLeft: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceRightDownUpLeft_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceLeftUpDownRight: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceLeftUpDownRight_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceUpDownRightLeft: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceUpDownRightLeft_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceRightLeftUpDown: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceRightLeftUpDown_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceDownRightLeftUp: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceDownRightLeftUp_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceRightUpDownLeft: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceRightUpDownLeft_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceUpDownLeftRight: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceUpDownLeftRight_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceLeftRightUpDown: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceLeftRightUpDown_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceDownLeftRightUp: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceDownLeftRightUp_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceUpLeftDownRight: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceUpLeftDownRight_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceDownRightUpLeft: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceDownRightUpLeft_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceLeftDownRightUp: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceLeftDownRightUp_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceRightUpLeftDown: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceRightUpLeftDown_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceUpRightDownLeft: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceUpRightDownLeft_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceDownLeftUpRight: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceDownLeftUpRight_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceLeftUpRightDown: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceLeftUpRightDown_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_WalkSequenceRightDownLeftUp: ["MovementType_WalkSequence_Step0", "MovementType_WalkSequenceRightDownLeftUp_Step1", "MovementType_WalkSequence_Step2"],
  MovementType_CopyPlayer: ["MovementType_CopyPlayer_Step0", "MovementType_CopyPlayer_Step1", "MovementType_CopyPlayer_Step2"],
  MovementType_CopyPlayerInGrass: ["MovementType_CopyPlayer_Step0", "MovementType_CopyPlayerInGrass_Step1", "MovementType_CopyPlayer_Step2"],
  MovementType_WalkInPlace: ["MovementType_WalkInPlace_Step0", "MovementType_MoveInPlace_Step1"],
  MovementType_WalkInPlaceFast: ["MovementType_WalkInPlaceFast_Step0", "MovementType_MoveInPlace_Step1"],
  MovementType_JogInPlace: ["MovementType_JogInPlace_Step0", "MovementType_MoveInPlace_Step1"],
  MovementType_Invisible: ["MovementType_Invisible_Step0", "MovementType_Invisible_Step1", "MovementType_Invisible_Step2"],
  MovementType_Buried: ["MovementType_Buried_Step0"],
  MovementType_RaiseHandAndStop: ["MovementType_RaiseHandAndStop_Step0", "MovementType_RaiseHandAndStop_Step1", "MovementType_RaiseHandAndStop_Step2"],
  MovementType_RaiseHandAndJump: ["MovementType_RaiseHandAndJump_Step0", "MovementType_RaiseHandAndMove_Step1"],
  MovementType_RaiseHandAndSwim: ["MovementType_RaiseHandAndSwim_Step0", "MovementType_RaiseHandAndMove_Step1"],
};

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
    object.triggerGroundEffectsOnMove = true;
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
    graphicsId &= 0xff;
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
    // ObjectEventSetGraphicsId repositions from current map coordinates while
    // retaining animNum, animCmdIndex, imageValue, flips and pause state.
    this.placeSprite(object);
    if (object.trackedByCamera) this.hooks.cameraObjectReset?.(object);
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
    if (MapGridGetCollisionAt(x, y, map) || map.borderIdAt(x, y) === CONNECTION_INVALID || this.IsMetatileDirectionallyImpassable(object, x, y, direction)) return COLLISION_IMPASSABLE;
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
    if (MapGridGetCollisionAt(x, y, map) || map.borderIdAt(x, y) === CONNECTION_INVALID
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
    const mapElevation = MapGridGetElevationAt(x, y, this.hooks.map());
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
    const cur = MapGridGetElevationAt((object.currentCoords.x << 16) >> 16, (object.currentCoords.y << 16) >> 16, map);
    const prev = MapGridGetElevationAt((object.previousCoords.x << 16) >> 16, (object.previousCoords.y << 16) >> 16, map);
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
    if (QL_GetPlaybackState() === C.QL_PLAYBACK_STATE_RUNNING) this.clearHeldMovementIfActive(object);
    else if (ObjectEventIsMovementOverridden(object)) return true;
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
      // UpdateObjectEventCurrentMovement calls DoGroundEffects_OnSpawn before
      // enabling animation or dispatching this object's movement callback.
      if (object.triggerGroundEffectsOnMove) {
        this.doGroundEffect(object, "spawn");
        object.triggerGroundEffectsOnMove = false;
      }
      // TryEnableObjectEventAnim runs before the movement callback in C.
      if (object.enableAnim) {
        sprite.animPaused = false;
        object.disableAnim = false;
        object.enableAnim = false;
      }
      if (object.isPlayer) {
        this.MovementType_Player(object, sprite);
      } else if (!object.frozen) {
        if (ObjectEventIsHeldMovementActive(object)) {
          if (!object.heldMovementFinished) this.execHeld(object);
        } else {
          this.runMovementType(object);
        }
      }
      // C processes begin/finish flags immediately after this object's callback.
      if (object.triggerGroundEffectsOnMove) {
        this.doGroundEffect(object, "begin");
        object.triggerGroundEffectsOnMove = false;
      }
      if (object.triggerGroundEffectsOnStop) {
        this.doGroundEffect(object, "finish");
        object.triggerGroundEffectsOnStop = false;
        object.landingJump = false;
      }
      this.updateVisibility(object, cameraX, cameraY);
      this.updateSubpriority(object, cameraY);
      this.UpdateObjectEventElevationAndPriority(object);
      if (object.disableAnim) sprite.animPaused = true;
    }
  }

  private doGroundEffect(object: ObjectEvent, kind: "spawn" | "begin" | "finish"): void {
    this.updateMetatileBehaviors(object);
    this.hooks.groundEffect(object, kind);
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
    if (object.trainerType !== C.TRAINER_TYPE_NORMAL && object.trainerType !== C.TRAINER_TYPE_BURIED) return false;
    const p = this.hooks.playerDestCoords();
    const r = object.trainerRange;
    const o = object.currentCoords;
    const minX = ((o.x - r) << 16) >> 16;
    const maxX = ((o.x + r) << 16) >> 16;
    const minY = ((o.y - r) << 16) >> 16;
    const maxY = ((o.y + r) << 16) >> 16;
    return !(minX > p.x || maxX < p.x || minY > p.y || maxY < p.y);
  }

  /** Mirrors gGetVectorDirectionFuncs in movement_type_func_tables.h. */
  private trainerEncounterDirection(object: ObjectEvent, mode: number): number {
    if (!this.trainerCloseToPlayer(object)) return DIR_NONE;
    const p = this.hooks.playerDestCoords();
    // The C locals are s16; keep the same wrapping before abs/comparison.
    const dx = (p.x - object.currentCoords.x) << 16 >> 16;
    const dy = (p.y - object.currentCoords.y) << 16 >> 16;
    // The C absdx/absdy locals are also s16: abs(-32768) wraps back to -32768.
    const absDx = (Math.abs(dx) << 16) >> 16;
    const absDy = (Math.abs(dy) << 16) >> 16;
    const vector = (): number => absDx > absDy
      ? dx < 0 ? DIR_WEST : DIR_EAST
      : dy < 0 ? DIR_NORTH : DIR_SOUTH;
    const northSouth = (): number => dy < 0 ? DIR_NORTH : DIR_SOUTH;
    const westEast = (): number => dx < 0 ? DIR_WEST : DIR_EAST;
    switch (mode) {
      case rom.constants.RUNFOLLOW_NORTH_SOUTH: return northSouth();
      case rom.constants.RUNFOLLOW_EAST_WEST: return westEast();
      case rom.constants.RUNFOLLOW_NORTH_WEST: {
        const dir = vector();
        if (dir === DIR_SOUTH) return dx < 0 ? DIR_WEST : DIR_NORTH;
        if (dir === DIR_EAST) return dy < 0 ? DIR_NORTH : DIR_NORTH;
        return dir;
      }
      case rom.constants.RUNFOLLOW_NORTH_EAST: {
        const dir = vector();
        if (dir === DIR_SOUTH) return dx < 0 ? DIR_NORTH : DIR_EAST;
        if (dir === DIR_WEST) return dy < 0 ? DIR_NORTH : DIR_NORTH;
        return dir;
      }
      case rom.constants.RUNFOLLOW_SOUTH_WEST: {
        const dir = vector();
        if (dir === DIR_NORTH) return dx < 0 ? DIR_WEST : DIR_SOUTH;
        if (dir === DIR_EAST) return dy < 0 ? DIR_SOUTH : DIR_SOUTH;
        return dir;
      }
      case rom.constants.RUNFOLLOW_SOUTH_EAST: {
        const dir = vector();
        if (dir === DIR_NORTH) return dx < 0 ? DIR_SOUTH : DIR_EAST;
        if (dir === DIR_WEST) return dy < 0 ? DIR_SOUTH : DIR_SOUTH;
        return dir;
      }
      case rom.constants.RUNFOLLOW_NORTH_SOUTH_WEST: {
        const dir = vector(); return dir === DIR_EAST ? northSouth() : dir;
      }
      case rom.constants.RUNFOLLOW_NORTH_SOUTH_EAST: {
        const dir = vector(); return dir === DIR_WEST ? northSouth() : dir;
      }
      case rom.constants.RUNFOLLOW_NORTH_EAST_WEST: {
        const dir = vector(); return dir === DIR_SOUTH ? westEast() : dir;
      }
      case rom.constants.RUNFOLLOW_SOUTH_EAST_WEST: {
        const dir = vector(); return dir === DIR_NORTH ? westEast() : dir;
      }
      default: return vector();
    }
  }

  private trainerDirectionMode(type: number): number {
    const c = rom.constants;
    switch (type) {
      case c.MOVEMENT_TYPE_FACE_DOWN_AND_UP: return c.RUNFOLLOW_NORTH_SOUTH;
      case c.MOVEMENT_TYPE_FACE_LEFT_AND_RIGHT: return c.RUNFOLLOW_EAST_WEST;
      case c.MOVEMENT_TYPE_FACE_UP_AND_LEFT: return c.RUNFOLLOW_NORTH_WEST;
      case c.MOVEMENT_TYPE_FACE_UP_AND_RIGHT: return c.RUNFOLLOW_NORTH_EAST;
      case c.MOVEMENT_TYPE_FACE_DOWN_AND_LEFT: return c.RUNFOLLOW_SOUTH_WEST;
      case c.MOVEMENT_TYPE_FACE_DOWN_AND_RIGHT: return c.RUNFOLLOW_SOUTH_EAST;
      case c.MOVEMENT_TYPE_FACE_DOWN_UP_AND_LEFT: return c.RUNFOLLOW_NORTH_SOUTH_WEST;
      case c.MOVEMENT_TYPE_FACE_DOWN_UP_AND_RIGHT: return c.RUNFOLLOW_NORTH_SOUTH_EAST;
      case c.MOVEMENT_TYPE_FACE_UP_LEFT_AND_RIGHT: return c.RUNFOLLOW_NORTH_EAST_WEST;
      case c.MOVEMENT_TYPE_FACE_DOWN_LEFT_AND_RIGHT: return c.RUNFOLLOW_SOUTH_EAST_WEST;
      default: return c.RUNFOLLOW_ANY;
    }
  }

  private runMovementType(object: ObjectEvent): void {
    // UpdateObjectEventCurrentMovement repeats the callback until it returns FALSE (event_object_movement.c).
    while (this.movementTypeCallback(object)) {}
  }

  /** MovementType_Player (field_player_avatar.c), driven from the object update loop. */
  private MovementType_Player(object: ObjectEvent, sprite: Sprite): void {
    if (ObjectEventIsHeldMovementActive(object)) {
      if (!object.heldMovementFinished) this.execHeld(object);
    } else if (!object.frozen) {
      while (this.ObjectEventCB2_NoMovement2(object, sprite)) { /* C repeats while callback returns nonzero. */ }
    }
  }

  /** ObjectEventCB2_NoMovement2 (field_player_avatar.c): player movement has no autonomous step. */
  private ObjectEventCB2_NoMovement2(_object: ObjectEvent, _sprite: Sprite): number { return 0; }

  /**
   * sMovementTypeCallbacks[objectEvent->movementType] selects the MovementType_* setup
   * (event_object_movement.c); its callback then runs gMovementTypeFuncs_<name>[sprite->data[1]].
   * MovementType_None/_Player/_TreeDisguise/_MountainDisguise have no step table in C (they
   * run their own body directly), so movementTypeBranch below covers them too.
   */
  private movementTypeCallback(object: ObjectEvent): boolean {
    const name = MOVEMENT_TYPE_CALLBACKS[object.movementType];
    if (!name) return false;
    const steps = MOVEMENT_TYPE_STEPS[name];
    if (!steps) return this.movementTypeBranch(object);
    const step = object.sprite.data[1];
    const fn = (this as unknown as Record<string, (object: ObjectEvent, sprite: Sprite) => boolean>)[steps[Math.min(step, steps.length - 1)]];
    return fn.call(this, object, object.sprite);
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

  private movementTypeBranch(object: ObjectEvent): boolean {
    const c = rom.constants;
    const s = object.sprite;
    const type = object.movementType;
    const step = s.data[1];

    // MovementType_Buried initializes its fixed layer once before dispatching
    // the buried callback (event_object_movement.c).
    if (type === c.MOVEMENT_TYPE_BURIED && !s.data[7]) {
      object.fixedPriority = true;
      s.subspriteMode = c.SUBSPRITES_IGNORE_PRIORITY;
      s.priority = 3;
      s.data[7]++;
    }

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
    if (type === c.MOVEMENT_TYPE_BURIED) {
      if (step === 0) this.clearMovement(object);
      return false;
    }
    if ([c.MOVEMENT_TYPE_FACE_UP, c.MOVEMENT_TYPE_FACE_DOWN, c.MOVEMENT_TYPE_FACE_LEFT, c.MOVEMENT_TYPE_FACE_RIGHT].includes(type)) {
      if (step === 0) {
        this.clearMovement(object);
        this.setSingle(object, actionFace(INITIAL_FACING[type] ?? object.facingDirection));
        s.data[1] = 1;
        return true;
      }
      if (step === 1 && this.execSingle(object)) s.data[1] = 2;
      return false;
    }
    if (type === c.MOVEMENT_TYPE_RAISE_HAND_AND_STOP) {
      if (step === 0) { this.clearMovement(object); this.setSingle(object, c.MOVEMENT_ACTION_RAISE_HAND_AND_STOP); s.data[1] = 1; return true; }
      if (step === 1 && this.execSingle(object)) { s.data[1] = 2; return true; }
      if (step === 2) object.singleMovementActive = false;
      return false;
    }
    if (type === c.MOVEMENT_TYPE_RAISE_HAND_AND_JUMP || type === c.MOVEMENT_TYPE_RAISE_HAND_AND_SWIM) {
      if (step === 0) {
        this.clearMovement(object);
        this.setSingle(object, type === c.MOVEMENT_TYPE_RAISE_HAND_AND_JUMP ? c.MOVEMENT_ACTION_RAISE_HAND_AND_JUMP : c.MOVEMENT_ACTION_RAISE_HAND_AND_SWIM);
        s.data[1] = 1;
        return false;
      }
      if (step === 1 && this.execSingle(object)) s.data[1] = 0;
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
          let direction = this.trainerEncounterDirection(object, this.trainerDirectionMode(type));
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
          let direction = this.trainerEncounterDirection(object, rom.constants.RUNFOLLOW_ANY);
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

  /**
   * ObjectEventExecSingleMovementAction/ObjectEventExecHeldMovementAction driver
   * (event_object_movement.c): sMovementActionFuncs[actionId][sprite->data[2]](...).
   * Runs one frame of the object's current movement action; true when finished.
   */
  execAction(object: ObjectEvent): boolean {
    const id = object.movementActionId;
    if (id === MOVEMENT_ACTION_NONE || id === MOVEMENT_ACTION_STEP_END) return true;
    const steps = MOVEMENT_ACTION_STEPS[id];
    if (!steps) return true;
    const step = object.sprite.data[2];
    const name = steps[Math.min(step, steps.length - 1)] as keyof this;
    return (this[name] as unknown as (object: ObjectEvent, sprite: Sprite) => boolean).call(this, object, object.sprite);
  }

  /** Shared body of every MovementAction_*_StepN (event_object_movement.c), parameterized
   * by the action id and step index instead of reading them off object.sprite.data. */
  private movementActionStep(object: ObjectEvent, id: number, step: number): boolean {
    const s = object.sprite;
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
      // MovementAction_WalkInPlaceSlow_Step1 additionally bumps animDelayCounter on
      // odd frames (event_object_movement.c); the other speeds tail-call the plain
      // MovementAction_WalkInPlace_Step1.
      return group === 0 ? this.MovementAction_WalkInPlaceSlow_Step1(object, s) : this.MovementAction_WalkInPlace_Step1(object, s);
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
    if (id === 0x5e) { object.inanimate = true; return this.finishStep(object); }
    if (id === 0x5f) { object.inanimate = graphicsInfo(object.graphicsId).inanimate; return this.finishStep(object); }
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
    if (id === 0x6c) {
      // InitSpriteAffineAnim + ST_OAM_AFFINE_DOUBLE. The object graphics
      // tables use gDummySpriteAffineAnimTable, so the initialized matrix is
      // identity until a real affine sequence is selected.
      s.affineMode = C.ST_OAM_AFFINE_DOUBLE;
      s.affineScaleX = s.affineScaleY = 1;
      s.affineRotation = 0;
      s.affineAnimNum = 0;
      s.affineAnimPaused = true;
      s.centerToCornerVecX = -(s.width >> 1) * 2;
      s.centerToCornerVecY = -(s.height >> 1) * 2;
      s.subspriteMode = 0;
      return this.finishStep(object);
    }
    if (id === 0x6d) {
      // FreeOamMatrix + ST_OAM_AFFINE_OFF + CalcCenterToCornerVec.
      s.affineMode = C.ST_OAM_AFFINE_OFF;
      s.affineScaleX = s.affineScaleY = 1;
      s.affineRotation = 0;
      s.centerToCornerVecX = -(s.width >> 1);
      s.centerToCornerVecY = -(s.height >> 1);
      return this.finishStep(object);
    }
    if (id === 0x6e || id === 0x6f) {
      // C starts affine animation 0 or changes to animation 1, then walks
      // south at the slower step cadence. FRLG object graphics all point to
      // the one-command dummy affine table; the visual matrix remains identity.
      if (step === 0) {
        this.initWalkSlowStyle(object, DIR_SOUTH, moveAnim(DIR_SOUTH));
        s.affineAnimPaused = false;
        s.affineAnimNum = id === 0x6e ? 0 : 1;
      }
      if (this.updateWalkSlowStyle(object, "slower")) {
        s.affineAnimPaused = true;
        return this.finishStep(object);
      }
      return false;
    }
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
      if (step === 2) return this.finishStep(object);
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

  // Shared step functions reused across many actions (event_object_movement.c):
  // the same C function pointer appears in several sMovementActionFuncs_* tables.
  private MovementAction_PauseSpriteAnim(object: ObjectEvent, sprite: Sprite): boolean {
    sprite.animPaused = true;
    return true;
  }

  private MovementAction_Finish(object: ObjectEvent, sprite: Sprite): boolean {
    return true;
  }

  private MovementAction_Delay_Step1(object: ObjectEvent, sprite: Sprite): boolean {
    if (--sprite.data[3] === 0) { sprite.data[2] = 2; return true; }
    return false;
  }

  private MovementAction_WalkInPlace_Step1(object: ObjectEvent, sprite: Sprite): boolean {
    return this.updateMoveInPlace(object);
  }

  private MovementAction_WalkInPlaceSlow_Step1(object: ObjectEvent, sprite: Sprite): boolean {
    if (sprite.data[3] & 1) sprite.animDelayCounter++;
    return this.updateMoveInPlace(object);
  }

  private MovementAction_WaitSpriteAnim(object: ObjectEvent, sprite: Sprite): boolean {
    if (SpriteAnimEnded(sprite)) { sprite.data[2] = 2; return true; }
    return false;
  }

  private MovementAction_RaiseHand_Step0(object: ObjectEvent, sprite: Sprite): boolean {
    sprite.startAnim(ANIM_RAISE_HAND);
    sprite.animPaused = false;
    object.disableAnim = false;
    sprite.data[2] = 1;
    sprite.data[4] = 0;
    sprite.data[5] = 0;
    sprite.data[6] = 0;
    sprite.data[7] = 0;
    return false;
  }

  private MovementAction_FlyUp_Step2(object: ObjectEvent, sprite: Sprite): boolean {
    return true;
  }

  // MovementAction_*_StepN wrappers: the id-specific ones keep the C name/signature
  // (event_object_movement.c) but delegate to the shared movementActionStep body
  // above with their own fixed action id, matching how the C functions call the
  // same shared Init*/Update* helpers with a hardcoded direction/speed constant.
  private MovementAction_FaceDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FACE_DOWN, 0); }
  private MovementAction_FaceUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FACE_UP, 0); }
  private MovementAction_FaceLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FACE_LEFT, 0); }
  private MovementAction_FaceRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FACE_RIGHT, 0); }
  private MovementAction_FaceDownFast_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FACE_DOWN_FAST, 0); }
  private MovementAction_FaceUpFast_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FACE_UP_FAST, 0); }
  private MovementAction_FaceLeftFast_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FACE_LEFT_FAST, 0); }
  private MovementAction_FaceRightFast_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FACE_RIGHT_FAST, 0); }
  private MovementAction_WalkSlowerDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWER_DOWN, 0); }
  private MovementAction_WalkSlowerDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWER_DOWN, 1); }
  private MovementAction_WalkSlowerUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWER_UP, 0); }
  private MovementAction_WalkSlowerUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWER_UP, 1); }
  private MovementAction_WalkSlowerLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWER_LEFT, 0); }
  private MovementAction_WalkSlowerLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWER_LEFT, 1); }
  private MovementAction_WalkSlowerRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWER_RIGHT, 0); }
  private MovementAction_WalkSlowerRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWER_RIGHT, 1); }
  private MovementAction_WalkSlowDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOW_DOWN, 0); }
  private MovementAction_WalkSlowDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOW_DOWN, 1); }
  private MovementAction_WalkSlowUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOW_UP, 0); }
  private MovementAction_WalkSlowUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOW_UP, 1); }
  private MovementAction_WalkSlowLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOW_LEFT, 0); }
  private MovementAction_WalkSlowLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOW_LEFT, 1); }
  private MovementAction_WalkSlowRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOW_RIGHT, 0); }
  private MovementAction_WalkSlowRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOW_RIGHT, 1); }
  private MovementAction_WalkNormalDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_NORMAL_DOWN, 0); }
  private MovementAction_WalkNormalDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_NORMAL_DOWN, 1); }
  private MovementAction_WalkNormalUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_NORMAL_UP, 0); }
  private MovementAction_WalkNormalUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_NORMAL_UP, 1); }
  private MovementAction_WalkNormalLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_NORMAL_LEFT, 0); }
  private MovementAction_WalkNormalLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_NORMAL_LEFT, 1); }
  private MovementAction_WalkNormalRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_NORMAL_RIGHT, 0); }
  private MovementAction_WalkNormalRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_NORMAL_RIGHT, 1); }
  private MovementAction_Jump2Down_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_2_DOWN, 0); }
  private MovementAction_Jump2Down_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_2_DOWN, 1); }
  private MovementAction_Jump2Up_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_2_UP, 0); }
  private MovementAction_Jump2Up_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_2_UP, 1); }
  private MovementAction_Jump2Left_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_2_LEFT, 0); }
  private MovementAction_Jump2Left_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_2_LEFT, 1); }
  private MovementAction_Jump2Right_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_2_RIGHT, 0); }
  private MovementAction_Jump2Right_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_2_RIGHT, 1); }
  private MovementAction_Delay1_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_DELAY_1, 0); }
  private MovementAction_Delay2_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_DELAY_2, 0); }
  private MovementAction_Delay4_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_DELAY_4, 0); }
  private MovementAction_Delay8_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_DELAY_8, 0); }
  private MovementAction_Delay16_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_DELAY_16, 0); }
  private MovementAction_WalkFastDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FAST_DOWN, 0); }
  private MovementAction_WalkFastDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FAST_DOWN, 1); }
  private MovementAction_WalkFastUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FAST_UP, 0); }
  private MovementAction_WalkFastUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FAST_UP, 1); }
  private MovementAction_WalkFastLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FAST_LEFT, 0); }
  private MovementAction_WalkFastLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FAST_LEFT, 1); }
  private MovementAction_WalkFastRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FAST_RIGHT, 0); }
  private MovementAction_WalkFastRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FAST_RIGHT, 1); }
  private MovementAction_WalkInPlaceSlowDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_SLOW_DOWN, 0); }
  private MovementAction_WalkInPlaceSlowUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_SLOW_UP, 0); }
  private MovementAction_WalkInPlaceSlowLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_SLOW_LEFT, 0); }
  private MovementAction_WalkInPlaceSlowRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_SLOW_RIGHT, 0); }
  private MovementAction_WalkInPlaceNormalDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_DOWN, 0); }
  private MovementAction_WalkInPlaceNormalUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_UP, 0); }
  private MovementAction_WalkInPlaceNormalLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_LEFT, 0); }
  private MovementAction_WalkInPlaceNormalRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_RIGHT, 0); }
  private MovementAction_WalkInPlaceFastDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_FAST_DOWN, 0); }
  private MovementAction_WalkInPlaceFastUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_FAST_UP, 0); }
  private MovementAction_WalkInPlaceFastLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_FAST_LEFT, 0); }
  private MovementAction_WalkInPlaceFastRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_FAST_RIGHT, 0); }
  private MovementAction_WalkInPlaceFasterDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_FASTER_DOWN, 0); }
  private MovementAction_WalkInPlaceFasterUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_FASTER_UP, 0); }
  private MovementAction_WalkInPlaceFasterLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_FASTER_LEFT, 0); }
  private MovementAction_WalkInPlaceFasterRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_IN_PLACE_FASTER_RIGHT, 0); }
  private MovementAction_RideWaterCurrentDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_RIDE_WATER_CURRENT_DOWN, 0); }
  private MovementAction_RideWaterCurrentDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_RIDE_WATER_CURRENT_DOWN, 1); }
  private MovementAction_RideWaterCurrentUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_RIDE_WATER_CURRENT_UP, 0); }
  private MovementAction_RideWaterCurrentUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_RIDE_WATER_CURRENT_UP, 1); }
  private MovementAction_RideWaterCurrentLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_RIDE_WATER_CURRENT_LEFT, 0); }
  private MovementAction_RideWaterCurrentLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_RIDE_WATER_CURRENT_LEFT, 1); }
  private MovementAction_RideWaterCurrentRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_RIDE_WATER_CURRENT_RIGHT, 0); }
  private MovementAction_RideWaterCurrentRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_RIDE_WATER_CURRENT_RIGHT, 1); }
  private MovementAction_WalkFasterDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FASTER_DOWN, 0); }
  private MovementAction_WalkFasterDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FASTER_DOWN, 1); }
  private MovementAction_WalkFasterUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FASTER_UP, 0); }
  private MovementAction_WalkFasterUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FASTER_UP, 1); }
  private MovementAction_WalkFasterLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FASTER_LEFT, 0); }
  private MovementAction_WalkFasterLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FASTER_LEFT, 1); }
  private MovementAction_WalkFasterRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FASTER_RIGHT, 0); }
  private MovementAction_WalkFasterRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_FASTER_RIGHT, 1); }
  private MovementAction_SlideDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SLIDE_DOWN, 0); }
  private MovementAction_SlideDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SLIDE_DOWN, 1); }
  private MovementAction_SlideUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SLIDE_UP, 0); }
  private MovementAction_SlideUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SLIDE_UP, 1); }
  private MovementAction_SlideLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SLIDE_LEFT, 0); }
  private MovementAction_SlideLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SLIDE_LEFT, 1); }
  private MovementAction_SlideRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SLIDE_RIGHT, 0); }
  private MovementAction_SlideRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SLIDE_RIGHT, 1); }
  private MovementAction_PlayerRunDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_DOWN, 0); }
  private MovementAction_PlayerRunDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_DOWN, 1); }
  private MovementAction_PlayerRunUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_UP, 0); }
  private MovementAction_PlayerRunUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_UP, 1); }
  private MovementAction_PlayerRunLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_LEFT, 0); }
  private MovementAction_PlayerRunLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_LEFT, 1); }
  private MovementAction_PlayerRunRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_RIGHT, 0); }
  private MovementAction_PlayerRunRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_RIGHT, 1); }
  private MovementAction_RunDownSlow_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_DOWN_SLOW, 0); }
  private MovementAction_RunDownSlow_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_DOWN_SLOW, 1); }
  private MovementAction_RunUpSlow_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_UP_SLOW, 0); }
  private MovementAction_RunUpSlow_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_UP_SLOW, 1); }
  private MovementAction_RunLeftSlow_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_LEFT_SLOW, 0); }
  private MovementAction_RunLeftSlow_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_LEFT_SLOW, 1); }
  private MovementAction_RunRightSlow_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_RIGHT_SLOW, 0); }
  private MovementAction_RunRightSlow_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_PLAYER_RUN_RIGHT_SLOW, 1); }
  private MovementAction_StartAnimInDirection_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_START_ANIM_IN_DIRECTION, 0); }
  private MovementAction_JumpSpecialDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_DOWN, 0); }
  private MovementAction_JumpSpecialDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_DOWN, 1); }
  private MovementAction_JumpSpecialUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_UP, 0); }
  private MovementAction_JumpSpecialUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_UP, 1); }
  private MovementAction_JumpSpecialLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_LEFT, 0); }
  private MovementAction_JumpSpecialLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_LEFT, 1); }
  private MovementAction_JumpSpecialRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_RIGHT, 0); }
  private MovementAction_JumpSpecialRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_RIGHT, 1); }
  private MovementAction_FacePlayer_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FACE_PLAYER, 0); }
  private MovementAction_FaceAwayPlayer_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FACE_AWAY_PLAYER, 0); }
  private MovementAction_LockFacingDirection_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_LOCK_FACING_DIRECTION, 0); }
  private MovementAction_UnlockFacingDirection_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_UNLOCK_FACING_DIRECTION, 0); }
  private MovementAction_JumpDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_DOWN, 0); }
  private MovementAction_JumpDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_DOWN, 1); }
  private MovementAction_JumpUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_UP, 0); }
  private MovementAction_JumpUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_UP, 1); }
  private MovementAction_JumpLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_LEFT, 0); }
  private MovementAction_JumpLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_LEFT, 1); }
  private MovementAction_JumpRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_RIGHT, 0); }
  private MovementAction_JumpRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_RIGHT, 1); }
  private MovementAction_JumpInPlaceDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_DOWN, 0); }
  private MovementAction_JumpInPlaceDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_DOWN, 1); }
  private MovementAction_JumpInPlaceUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_UP, 0); }
  private MovementAction_JumpInPlaceUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_UP, 1); }
  private MovementAction_JumpInPlaceLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_LEFT, 0); }
  private MovementAction_JumpInPlaceLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_LEFT, 1); }
  private MovementAction_JumpInPlaceRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_RIGHT, 0); }
  private MovementAction_JumpInPlaceRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_RIGHT, 1); }
  private MovementAction_JumpInPlaceDownUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_DOWN_UP, 0); }
  private MovementAction_JumpInPlaceDownUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_DOWN_UP, 1); }
  private MovementAction_JumpInPlaceUpDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_UP_DOWN, 0); }
  private MovementAction_JumpInPlaceUpDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_UP_DOWN, 1); }
  private MovementAction_JumpInPlaceLeftRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_LEFT_RIGHT, 0); }
  private MovementAction_JumpInPlaceLeftRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_LEFT_RIGHT, 1); }
  private MovementAction_JumpInPlaceRightLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_RIGHT_LEFT, 0); }
  private MovementAction_JumpInPlaceRightLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_IN_PLACE_RIGHT_LEFT, 1); }
  private MovementAction_FaceOriginalDirection_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FACE_ORIGINAL_DIRECTION, 0); }
  private MovementAction_NurseJoyBowDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_NURSE_JOY_BOW_DOWN, 0); }
  private MovementAction_EnableJumpLandingGroundEffect_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ENABLE_JUMP_LANDING_GROUND_EFFECT, 0); }
  private MovementAction_DisableJumpLandingGroundEffect_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_DISABLE_JUMP_LANDING_GROUND_EFFECT, 0); }
  private MovementAction_DisableAnimation_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_DISABLE_ANIMATION, 0); }
  private MovementAction_RestoreAnimation_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_RESTORE_ANIMATION, 0); }
  private MovementAction_SetInvisible_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SET_INVISIBLE, 0); }
  private MovementAction_SetVisible_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SET_VISIBLE, 0); }
  private MovementAction_EmoteExclamationMark_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_EMOTE_EXCLAMATION_MARK, 0); }
  private MovementAction_EmoteQuestionMark_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_EMOTE_QUESTION_MARK, 0); }
  private MovementAction_EmoteX_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_EMOTE_X, 0); }
  private MovementAction_EmoteDoubleExclamationMark_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_EMOTE_DOUBLE_EXCL_MARK, 0); }
  private MovementAction_EmoteSmile_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_EMOTE_SMILE, 0); }
  private MovementAction_RevealTrainer_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_REVEAL_TRAINER, 0); }
  private MovementAction_RevealTrainer_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_REVEAL_TRAINER, 1); }
  private MovementAction_RockSmashBreak_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ROCK_SMASH_BREAK, 0); }
  private MovementAction_RockSmashBreak_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ROCK_SMASH_BREAK, 1); }
  private MovementAction_RockSmashBreak_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ROCK_SMASH_BREAK, 2); }
  private MovementAction_CutTree_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_CUT_TREE, 0); }
  private MovementAction_CutTree_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_CUT_TREE, 1); }
  private MovementAction_CutTree_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_CUT_TREE, 2); }
  private MovementAction_SetFixedPriority_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SET_FIXED_PRIORITY, 0); }
  private MovementAction_ClearFixedPriority_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_CLEAR_FIXED_PRIORITY, 0); }
  private MovementAction_InitAffineAnim_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_INIT_AFFINE_ANIM, 0); }
  private MovementAction_ClearAffineAnim_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_CLEAR_AFFINE_ANIM, 0); }
  private MovementAction_WalkDownStartAffine_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_DOWN_START_AFFINE, 0); }
  private MovementAction_WalkDownStartAffine_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_DOWN_START_AFFINE, 1); }
  private MovementAction_WalkDownAffine_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_DOWN_AFFINE, 0); }
  private MovementAction_WalkDownAffine_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_DOWN_AFFINE, 1); }
  private MovementAction_AcroWheelieFaceDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_FACE_DOWN, 0); }
  private MovementAction_AcroWheelieFaceUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_FACE_UP, 0); }
  private MovementAction_AcroWheelieFaceLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_FACE_LEFT, 0); }
  private MovementAction_AcroWheelieFaceRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_FACE_RIGHT, 0); }
  private MovementAction_AcroPopWheelieDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_DOWN, 0); }
  private MovementAction_AcroPopWheelieUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_UP, 0); }
  private MovementAction_AcroPopWheelieLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_LEFT, 0); }
  private MovementAction_AcroPopWheelieRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_RIGHT, 0); }
  private MovementAction_AcroEndWheelieFaceDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_END_WHEELIE_FACE_DOWN, 0); }
  private MovementAction_AcroEndWheelieFaceUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_END_WHEELIE_FACE_UP, 0); }
  private MovementAction_AcroEndWheelieFaceLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_END_WHEELIE_FACE_LEFT, 0); }
  private MovementAction_AcroEndWheelieFaceRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_END_WHEELIE_FACE_RIGHT, 0); }
  private MovementAction_AcroWheelieHopFaceDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_DOWN, 0); }
  private MovementAction_AcroWheelieHopFaceDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_DOWN, 1); }
  private MovementAction_AcroWheelieHopFaceUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_UP, 0); }
  private MovementAction_AcroWheelieHopFaceUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_UP, 1); }
  private MovementAction_AcroWheelieHopFaceLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_LEFT, 0); }
  private MovementAction_AcroWheelieHopFaceLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_LEFT, 1); }
  private MovementAction_AcroWheelieHopFaceRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_RIGHT, 0); }
  private MovementAction_AcroWheelieHopFaceRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_FACE_RIGHT, 1); }
  private MovementAction_AcroWheelieHopDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_DOWN, 0); }
  private MovementAction_AcroWheelieHopDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_DOWN, 1); }
  private MovementAction_AcroWheelieHopUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_UP, 0); }
  private MovementAction_AcroWheelieHopUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_UP, 1); }
  private MovementAction_AcroWheelieHopLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_LEFT, 0); }
  private MovementAction_AcroWheelieHopLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_LEFT, 1); }
  private MovementAction_AcroWheelieHopRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_RIGHT, 0); }
  private MovementAction_AcroWheelieHopRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_HOP_RIGHT, 1); }
  private MovementAction_AcroWheelieJumpDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_DOWN, 0); }
  private MovementAction_AcroWheelieJumpDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_DOWN, 1); }
  private MovementAction_AcroWheelieJumpUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_UP, 0); }
  private MovementAction_AcroWheelieJumpUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_UP, 1); }
  private MovementAction_AcroWheelieJumpLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_LEFT, 0); }
  private MovementAction_AcroWheelieJumpLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_LEFT, 1); }
  private MovementAction_AcroWheelieJumpRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_RIGHT, 0); }
  private MovementAction_AcroWheelieJumpRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_JUMP_RIGHT, 1); }
  private MovementAction_AcroWheelieInPlaceDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_IN_PLACE_DOWN, 0); }
  private MovementAction_AcroWheelieInPlaceUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_IN_PLACE_UP, 0); }
  private MovementAction_AcroWheelieInPlaceLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_IN_PLACE_LEFT, 0); }
  private MovementAction_AcroWheelieInPlaceRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_IN_PLACE_RIGHT, 0); }
  private MovementAction_AcroPopWheelieMoveDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_DOWN, 0); }
  private MovementAction_AcroPopWheelieMoveDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_DOWN, 1); }
  private MovementAction_AcroPopWheelieMoveUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_UP, 0); }
  private MovementAction_AcroPopWheelieMoveUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_UP, 1); }
  private MovementAction_AcroPopWheelieMoveLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_LEFT, 0); }
  private MovementAction_AcroPopWheelieMoveLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_LEFT, 1); }
  private MovementAction_AcroPopWheelieMoveRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_RIGHT, 0); }
  private MovementAction_AcroPopWheelieMoveRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_POP_WHEELIE_MOVE_RIGHT, 1); }
  private MovementAction_AcroWheelieMoveDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_DOWN, 0); }
  private MovementAction_AcroWheelieMoveDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_DOWN, 1); }
  private MovementAction_AcroWheelieMoveUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_UP, 0); }
  private MovementAction_AcroWheelieMoveUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_UP, 1); }
  private MovementAction_AcroWheelieMoveLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_LEFT, 0); }
  private MovementAction_AcroWheelieMoveLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_LEFT, 1); }
  private MovementAction_AcroWheelieMoveRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_RIGHT, 0); }
  private MovementAction_AcroWheelieMoveRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_ACRO_WHEELIE_MOVE_RIGHT, 1); }
  private MovementAction_SpinDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SPIN_DOWN, 0); }
  private MovementAction_SpinDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SPIN_DOWN, 1); }
  private MovementAction_SpinUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SPIN_UP, 0); }
  private MovementAction_SpinUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SPIN_UP, 1); }
  private MovementAction_SpinLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SPIN_LEFT, 0); }
  private MovementAction_SpinLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SPIN_LEFT, 1); }
  private MovementAction_SpinRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SPIN_RIGHT, 0); }
  private MovementAction_SpinRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SPIN_RIGHT, 1); }
  private MovementAction_RaiseHandAndStop_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_RAISE_HAND_AND_STOP, 1); }
  private MovementAction_RaiseHandAndJump_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_RAISE_HAND_AND_JUMP, 1); }
  private MovementAction_RaiseHandAndSwim_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_RAISE_HAND_AND_SWIM, 1); }
  private MovementAction_WalkSlowestDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWEST_DOWN, 0); }
  private MovementAction_WalkSlowestDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWEST_DOWN, 1); }
  private MovementAction_WalkSlowestUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWEST_UP, 0); }
  private MovementAction_WalkSlowestUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWEST_UP, 1); }
  private MovementAction_WalkSlowestLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWEST_LEFT, 0); }
  private MovementAction_WalkSlowestLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWEST_LEFT, 1); }
  private MovementAction_WalkSlowestRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWEST_RIGHT, 0); }
  private MovementAction_WalkSlowestRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_WALK_SLOWEST_RIGHT, 1); }
  private MovementAction_ShakeHeadOrWalkInPlace_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SHAKE_HEAD_OR_WALK_IN_PLACE, 0); }
  private MovementAction_ShakeHeadOrWalkInPlace_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_SHAKE_HEAD_OR_WALK_IN_PLACE, 1); }
  private MovementAction_GlideDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_GLIDE_DOWN, 0); }
  private MovementAction_GlideDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_GLIDE_DOWN, 1); }
  private MovementAction_GlideUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_GLIDE_UP, 0); }
  private MovementAction_GlideUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_GLIDE_UP, 1); }
  private MovementAction_GlideLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_GLIDE_LEFT, 0); }
  private MovementAction_GlideLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_GLIDE_LEFT, 1); }
  private MovementAction_GlideRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_GLIDE_RIGHT, 0); }
  private MovementAction_GlideRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_GLIDE_RIGHT, 1); }
  private MovementAction_FlyUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FLY_UP, 0); }
  private MovementAction_FlyUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FLY_UP, 1); }
  private MovementAction_FlyDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FLY_DOWN, 0); }
  private MovementAction_FlyDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_FLY_DOWN, 1); }
  private MovementAction_JumpSpecialWithEffectDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_WITH_EFFECT_DOWN, 0); }
  private MovementAction_JumpSpecialWithEffectDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_WITH_EFFECT_DOWN, 1); }
  private MovementAction_JumpSpecialWithEffectUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_WITH_EFFECT_UP, 0); }
  private MovementAction_JumpSpecialWithEffectUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_WITH_EFFECT_UP, 1); }
  private MovementAction_JumpSpecialWithEffectLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_WITH_EFFECT_LEFT, 0); }
  private MovementAction_JumpSpecialWithEffectLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_WITH_EFFECT_LEFT, 1); }
  private MovementAction_JumpSpecialWithEffectRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_WITH_EFFECT_RIGHT, 0); }
  private MovementAction_JumpSpecialWithEffectRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementActionStep(object, C.MOVEMENT_ACTION_JUMP_SPECIAL_WITH_EFFECT_RIGHT, 1); }

  // MovementType_*_StepN wrappers (event_object_movement.c): named to match the C
  // gMovementTypeFuncs_* tables, delegating to the shared movementTypeBranch body
  // above, which already reads object.movementType/sprite.data[1] live (equivalencia).
  private MovementType_WanderAround_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderAround_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderAround_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderAround_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderAround_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderAround_Step5(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderAround_Step6(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderAround_Step5Slower(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_LookAround_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_LookAround_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_LookAround_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_LookAround_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_LookAround_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderUpAndDown_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderUpAndDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderUpAndDown_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderUpAndDown_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderUpAndDown_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderUpAndDown_Step5(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderUpAndDown_Step6(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderLeftAndRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderLeftAndRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderLeftAndRight_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderLeftAndRight_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderLeftAndRight_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderLeftAndRight_Step5(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WanderLeftAndRight_Step6(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDirection_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDirection_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDirection_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndUp_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndUp_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndUp_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndUp_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceLeftAndRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceLeftAndRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceLeftAndRight_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceLeftAndRight_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceLeftAndRight_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpAndLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpAndLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpAndLeft_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpAndLeft_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpAndLeft_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpAndRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpAndRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpAndRight_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpAndRight_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpAndRight_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndLeft_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndLeft_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndLeft_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndRight_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndRight_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownAndRight_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownUpAndLeft_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownUpAndLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownUpAndLeft_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownUpAndLeft_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownUpAndLeft_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownUpAndRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownUpAndRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownUpAndRight_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownUpAndRight_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownUpAndRight_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpLeftAndRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpLeftAndRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpLeftAndRight_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpLeftAndRight_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceUpLeftAndRight_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownLeftAndRight_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownLeftAndRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownLeftAndRight_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownLeftAndRight_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_FaceDownLeftAndRight_Step4(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RotateCounterclockwise_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RotateCounterclockwise_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RotateCounterclockwise_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RotateCounterclockwise_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RotateClockwise_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RotateClockwise_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RotateClockwise_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RotateClockwise_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkBackAndForth_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkBackAndForth_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkBackAndForth_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkBackAndForth_Step3(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequence_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceUpRightLeftDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequence_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceRightLeftDownUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceDownUpRightLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceLeftDownUpRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceUpLeftRightDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceLeftRightDownUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceDownUpLeftRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceRightDownUpLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceLeftUpDownRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceUpDownRightLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceRightLeftUpDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceDownRightLeftUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceRightUpDownLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceUpDownLeftRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceLeftRightUpDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceDownLeftRightUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceUpLeftDownRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceDownRightUpLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceLeftDownRightUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceRightUpLeftDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceUpRightDownLeft_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceDownLeftUpRight_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceLeftUpRightDown_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkSequenceRightDownLeftUp_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_CopyPlayer_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_CopyPlayer_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_CopyPlayer_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_CopyPlayerInGrass_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkInPlace_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_MoveInPlace_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_WalkInPlaceFast_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_JogInPlace_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_Invisible_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_Invisible_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_Invisible_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_Buried_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RaiseHandAndStop_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RaiseHandAndStop_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RaiseHandAndStop_Step2(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RaiseHandAndJump_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RaiseHandAndMove_Step1(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
  private MovementType_RaiseHandAndSwim_Step0(object: ObjectEvent, sprite: Sprite): boolean { return this.movementTypeBranch(object); }
}

/** GetCollisionFlagsAtCoords (event_object_movement.c). */
export function GetCollisionFlagsAtCoords(objects: ObjectEvents, object: ObjectEvent, x: number, y: number, direction: number): number {
  return objects.GetCollisionFlagsAtCoords(object, x, y, direction);
}

let varGetFn: ((id: number) => number) | undefined;
export function setVarGetter(fn: (id: number) => number): void {
  varGetFn = fn;
}
