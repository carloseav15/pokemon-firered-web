// Headless check for the event_object_movement.c MovementType_* dispatch tables
// (src/games/firered/field/objectEvents.ts: MOVEMENT_TYPE_CALLBACKS / MOVEMENT_TYPE_STEPS / movementTypeCallback).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import "./setupNodeGbaMock";
import { registerCData } from "../../src/games/firered/hw/assets";
import * as C from "../../src/games/firered/generated/constants";
import { DIR_SOUTH, ObjectEvent, ObjectEvents } from "../../src/games/firered/field/objectEvents";

const exported = JSON.parse(readFileSync(resolve("public/fr/cdata/event_object_movement.json"), "utf8")) as {
  defs: Record<string, { type: string; value: unknown[] }>;
};
registerCData("event_object_movement", exported.defs);

const mockMap = {
  collisionAt: () => 0,
  borderIdAt: () => 0,
  behaviorAt: () => 0,
  elevationAt: () => 0,
};
const hooks = {
  map: () => mockMap,
  cameraCanMove: () => true,
  playerIsRunning: () => false,
  playerDestCoords: () => ({ x: 0, y: 0 }),
  playerInfo: () => undefined,
  groundEffect: () => {},
  emote: () => {},
  playSE: () => {},
};
const objects = new ObjectEvents(hooks as any);
objects.objects.fill(null);

function spawn(movementType: number, rangeX = 2, rangeY = 2): ObjectEvent {
  const object = new ObjectEvent();
  object.active = true;
  object.movementType = movementType;
  object.rangeX = rangeX;
  object.rangeY = rangeY;
  object.currentCoords = { x: 10, y: 10 };
  object.initialCoords = { x: 10, y: 10 };
  object.facingDirection = DIR_SOUTH;
  object.movementActionId = C.MOVEMENT_ACTION_NONE;
  return object;
}

// Drive `frames` frames through the real per-frame call (runMovementType is private,
// but execHeld/execSingle already run through movementTypeCallback via the class's own
// internal update path; call the exported entry every check exercises: (objects as any)).
function stepFrames(object: ObjectEvent, frames: number): void {
  for (let i = 0; i < frames; i++) {
    (objects as any).runMovementType(object);
  }
}

// Every populated MOVEMENT_TYPE_* id must resolve to real, callable step functions
// (or the no-table special cases) without throwing, across many simulated frames.
for (let type = 0; type < 81; type++) {
  if (type === C.MOVEMENT_TYPE_PLAYER) continue; // driven by field_player_avatar.c, not this table.
  const object = spawn(type);
  stepFrames(object, 300);
}

// MovementType_LookAround: turns to face a random direction after a delay
// (MovementType_LookAround_Step0..4, event_object_movement.c).
{
  const object = spawn(C.MOVEMENT_TYPE_LOOK_AROUND);
  const seen = new Set<number>();
  for (let i = 0; i < 4000 && seen.size < 2; i++) {
    stepFrames(object, 1);
    seen.add(object.facingDirection);
  }
  assert.ok(seen.size >= 2, "MovementType_LookAround must eventually face more than one direction");
}

// MovementType_RotateClockwise: cycles through all four directions and back to the start.
{
  const object = spawn(C.MOVEMENT_TYPE_ROTATE_CLOCKWISE);
  const seenOrder: number[] = [object.facingDirection];
  for (let i = 0; i < 4000 && seenOrder.length < 4; i++) {
    stepFrames(object, 1);
    if (object.facingDirection !== seenOrder[seenOrder.length - 1]) seenOrder.push(object.facingDirection);
  }
  assert.equal(new Set(seenOrder).size, 4, "MovementType_RotateClockwise must visit all four directions");
  for (let i = 0; i < 4000 && object.facingDirection === seenOrder[3]; i++) stepFrames(object, 1);
  assert.equal(object.facingDirection, seenOrder[0], "MovementType_RotateClockwise must cycle back to its starting direction");
}

// MovementType_WanderAround: eventually takes a real step, moving off its spawn tile.
{
  const object = spawn(C.MOVEMENT_TYPE_WANDER_AROUND);
  let moved = false;
  for (let i = 0; i < 4000 && !moved; i++) {
    stepFrames(object, 1);
    if (object.currentCoords.x !== 10 || object.currentCoords.y !== 10) moved = true;
  }
  assert.ok(moved, "MovementType_WanderAround must eventually move off its spawn tile");
}

// MovementType_WalkBackAndForth (WALK_UP_AND_DOWN): walks north/south only.
{
  const object = spawn(C.MOVEMENT_TYPE_WALK_UP_AND_DOWN);
  let moved = false;
  for (let i = 0; i < 2000 && !moved; i++) {
    stepFrames(object, 1);
    if (object.currentCoords.y !== 10) moved = true;
  }
  assert.ok(moved, "MovementType_WalkBackAndForth must walk along its axis");
  assert.equal(object.currentCoords.x, 10, "MovementType_WALK_UP_AND_DOWN must never move in x");
}

// One MovementType_WalkSequence* variant, exercised the same way as WalkBackAndForth.
{
  const object = spawn(C.MOVEMENT_TYPE_WALK_SEQUENCE_UP_RIGHT_LEFT_DOWN);
  let moved = false;
  for (let i = 0; i < 2000 && !moved; i++) {
    stepFrames(object, 1);
    if (object.currentCoords.x !== 10 || object.currentCoords.y !== 10) moved = true;
  }
  assert.ok(moved, "MovementType_WalkSequenceUpRightLeftDown must eventually move");
}

// Idle delays chosen in MovementType_*_Step2: gMovementDelaysMedium {32, 64, 96, 128} for LookAround, FaceDownAndUp and
// FaceLeftAndRight; gMovementDelaysShort {32, 48, 64, 80} for the other eight FACE_*_AND_* types (event_object_movement.c).
{
  const MEDIUM = [32, 64, 96, 128], SHORT = [32, 48, 64, 80];
  const cases: Array<[string, number, number[]]> = [
    ["LOOK_AROUND", C.MOVEMENT_TYPE_LOOK_AROUND, MEDIUM],
    ["FACE_DOWN_AND_UP", C.MOVEMENT_TYPE_FACE_DOWN_AND_UP, MEDIUM],
    ["FACE_LEFT_AND_RIGHT", C.MOVEMENT_TYPE_FACE_LEFT_AND_RIGHT, MEDIUM],
    ["FACE_UP_AND_LEFT", C.MOVEMENT_TYPE_FACE_UP_AND_LEFT, SHORT],
    ["FACE_UP_AND_RIGHT", C.MOVEMENT_TYPE_FACE_UP_AND_RIGHT, SHORT],
    ["FACE_DOWN_AND_LEFT", C.MOVEMENT_TYPE_FACE_DOWN_AND_LEFT, SHORT],
    ["FACE_DOWN_AND_RIGHT", C.MOVEMENT_TYPE_FACE_DOWN_AND_RIGHT, SHORT],
    ["FACE_DOWN_UP_AND_LEFT", C.MOVEMENT_TYPE_FACE_DOWN_UP_AND_LEFT, SHORT],
    ["FACE_DOWN_UP_AND_RIGHT", C.MOVEMENT_TYPE_FACE_DOWN_UP_AND_RIGHT, SHORT],
    ["FACE_UP_LEFT_AND_RIGHT", C.MOVEMENT_TYPE_FACE_UP_LEFT_AND_RIGHT, SHORT],
    ["FACE_DOWN_LEFT_AND_RIGHT", C.MOVEMENT_TYPE_FACE_DOWN_LEFT_AND_RIGHT, SHORT],
  ];
  for (const [name, type, allowed] of cases) {
    const object = spawn(type);
    const seen = new Set<number>();
    let previous = 0;
    for (let i = 0; i < 60000 && seen.size < allowed.length; i++) {
      stepFrames(object, 1);
      // Step2 stores a fresh delay in data[3]; Step3 only counts it down, so a rise marks a new draw.
      const delay = object.sprite.data[3];
      if (object.sprite.data[1] === 3 && delay > previous) seen.add(delay);
      previous = delay;
    }
    for (const v of seen) assert.ok(allowed.includes(v), `MovementType_${name}: delay ${v} not in {${allowed}}`);
    assert.equal(seen.size, allowed.length, `MovementType_${name}: saw delays ${[...seen]} of {${allowed}}`);
  }
}

// MovementType_FaceDirection (FACE_UP/DOWN/LEFT/RIGHT), Step0-2: Step0 starts the face action with the object's current
// facingDirection (not the type's initial one), Step1 waits for it and Step2 clears singleMovementActive.
{
  const faceTypes: Array<[string, number, number]> = [
    ["FACE_UP", C.MOVEMENT_TYPE_FACE_UP, 2], ["FACE_DOWN", C.MOVEMENT_TYPE_FACE_DOWN, 1],
    ["FACE_LEFT", C.MOVEMENT_TYPE_FACE_LEFT, 3], ["FACE_RIGHT", C.MOVEMENT_TYPE_FACE_RIGHT, 4],
  ];
  for (const [name, type, initial] of faceTypes) {
    const object = spawn(type);
    object.facingDirection = initial;
    stepFrames(object, 60);
    assert.equal(object.singleMovementActive, false, `MovementType_${name}: Step2 must clear singleMovementActive`);
    assert.equal(object.facingDirection, initial, `MovementType_${name}: keeps its facing`);
    // A script turned the NPC; Step0 running again must face the current direction, not the type's initial one.
    const other = initial === 1 ? 3 : 1;
    const turned = spawn(type);
    turned.facingDirection = other;
    stepFrames(turned, 60);
    assert.equal(turned.facingDirection, other, `MovementType_${name}: Step0 must use the current facingDirection`);
  }
}

// MovementType_WalkInPlace / WalkInPlaceFast / JogInPlace Step0: walk in place toward the current facingDirection (the C
// reads objectEvent->facingDirection, not the type's initial direction) and Step0 returns TRUE, so Step1 runs in the same frame.
{
  const groups: Array<[string, number, number]> = [
    ["WALK_IN_PLACE", C.MOVEMENT_TYPE_WALK_IN_PLACE_DOWN, C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_RIGHT],
    ["WALK_IN_PLACE_FAST", C.MOVEMENT_TYPE_WALK_IN_PLACE_FAST_DOWN, C.MOVEMENT_ACTION_WALK_IN_PLACE_FAST_RIGHT],
    ["JOG_IN_PLACE", C.MOVEMENT_TYPE_JOG_IN_PLACE_DOWN, C.MOVEMENT_ACTION_WALK_IN_PLACE_FASTER_RIGHT],
  ];
  for (const [name, firstType, rightAction] of groups) {
    const object = spawn(firstType);
    object.facingDirection = 4; // DIR_EAST, whatever the type's initial direction is
    stepFrames(object, 1);
    assert.equal(object.movementActionId, rightAction, `MovementType_${name}: first frame walks in place toward facingDirection`);
    assert.equal(object.sprite.data[1], 1, `MovementType_${name}: Step1 is waiting for the action after the first frame`);
  }
}

// MovementType_CopyPlayer Step0/Step1 with CopyablePlayerMovement_FaceDirection. GetCopyDirection returns DIR_NONE when the
// player's facing/movement direction is DIR_NONE, and the C then still sets the face action (face down) instead of
// waiting; with valid directions the object copies the player's turn (COPY_PLAYER starts facing NORTH; player init DOWN, move RIGHT -> WEST).
{
  const withPlayer = (facing: number, movementDirection: number, copyableMovement: number) => {
    const o = new ObjectEvents({
      ...hooks,
      playerInfo: () => ({ facing, movementDirection, movementActionId: 5, copyableMovement, tileTransitionState: 0 }),
    } as any);
    o.objects.fill(null);
    const actions: number[] = [];
    const original = (o as any).ObjectEventSetSingleMovement.bind(o);
    (o as any).ObjectEventSetSingleMovement = (object: ObjectEvent, actionId: number) => { actions.push(actionId); original(object, actionId); };
    return { o, actions };
  };
  const first = (o: ObjectEvents, object: ObjectEvent) => (o as any).runMovementType(object);

  const invalid = withPlayer(0, 1, 1);
  first(invalid.o, spawn(C.MOVEMENT_TYPE_COPY_PLAYER));
  assert.deepEqual(invalid.actions, [C.MOVEMENT_ACTION_FACE_DOWN], "CopyPlayer with DIR_NONE player direction sets the DIR_NONE face action (face down)");

  const valid = withPlayer(1, 4, 1); // player faced DOWN at start, now moves RIGHT
  first(valid.o, spawn(C.MOVEMENT_TYPE_COPY_PLAYER));
  assert.deepEqual(valid.actions, [C.MOVEMENT_ACTION_FACE_LEFT], "CopyPlayer (initial NORTH) turns LEFT when the player turns RIGHT");

  // CopyablePlayerMovement_GoSpeed0 with a blocked tile: the C sets the walk action and then the face action over it.
  const blockedMap = { ...mockMap, collisionAt: () => 1 };
  const blocked = new ObjectEvents({ ...hooks, map: () => blockedMap,
    playerInfo: () => ({ facing: 1, movementDirection: 1, movementActionId: 5, copyableMovement: 2, tileTransitionState: 0 }) } as any);
  blocked.objects.fill(null);
  const calls: number[] = [];
  const orig = (blocked as any).ObjectEventSetSingleMovement.bind(blocked);
  (blocked as any).ObjectEventSetSingleMovement = (object: ObjectEvent, actionId: number) => { calls.push(actionId); orig(object, actionId); };
  first(blocked, spawn(C.MOVEMENT_TYPE_COPY_PLAYER));
  assert.deepEqual(calls, [C.MOVEMENT_ACTION_WALK_NORMAL_UP, C.MOVEMENT_ACTION_FACE_UP],
    "CopyPlayer blocked step: walk action then face action (both go through ObjectEventSetSingleMovement)");
}

// GetOppositeDirection: gOppositeDirections = {N, S, E, W, NE, NW, SE, SW} indexed by direction - 1; 0 and values above 8 pass through.
{
  const expected = [0, 2, 1, 4, 3, 8, 7, 6, 5, 9, 10];
  expected.forEach((want, dir) => assert.equal((objects as any).GetOppositeDirection(dir), want, `GetOppositeDirection(${dir})`));
}

console.log("event_object_movement.c MovementType_* dispatch table checks passed");
