// Headless check for the event_object_movement.c MovementType_* dispatch tables
// (src/fr/field/objectEvents.ts: MOVEMENT_TYPE_CALLBACKS / MOVEMENT_TYPE_STEPS / movementTypeCallback).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import "./setupNodeGbaMock";
import { registerCData } from "../../src/fr/hw/assets";
import * as C from "../../src/fr/generated/constants";
import { DIR_SOUTH, ObjectEvent, ObjectEvents } from "../../src/fr/field/objectEvents";

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

console.log("event_object_movement.c MovementType_* dispatch table checks passed");
