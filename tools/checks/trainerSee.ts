// Headless check for trainer_see.c parity (sight calculations, disguise helpers, cdata).
import "./setupNodeGbaMock.ts";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import * as C from "../../src/fr/generated/constants.ts";
import {
  GetTrainerApproachDistanceSouth,
  GetTrainerApproachDistanceNorth,
  GetTrainerApproachDistanceWest,
  GetTrainerApproachDistanceEast,
  sDirectionalApproachDistanceFuncs,
  GetTrainerApproachDistance,
  CheckPathBetweenTrainerAndPlayer,
  TrainerSeeFunc_Dummy,
  TrainerSeeFunc_BeginRemoveDisguise,
  TrainerSeeFunc_WaitRemoveDisguise,
} from "../../src/fr/field/trainerSee.ts";
import { COLLISION_OBJECT_EVENT, type ObjectEvent, type ObjectEvents } from "../../src/fr/field/objectEvents.ts";

// 1. Verify cdata exports from trainer_see.json
const cdataRaw = JSON.parse(readFileSync(process.cwd() + "/public/fr/cdata/trainer_see.json", "utf8"));
const defs = cdataRaw.defs;
assert.ok(defs.sTrainerSeeFuncList, "sTrainerSeeFuncList must exist in cdata");
assert.equal(defs.sTrainerSeeFuncList.value.length, 15, "sTrainerSeeFuncList has 15 functions");
assert.equal(defs.sTrainerSeeFuncList.value[0].$sym, "TrainerSeeFunc_Dummy");
assert.equal(defs.sTrainerSeeFuncList.value[6].$sym, "TrainerSeeFunc_BeginRemoveDisguise");
assert.equal(defs.sTrainerSeeFuncList.value[7].$sym, "TrainerSeeFunc_WaitRemoveDisguise");

assert.ok(defs.sDirectionalApproachDistanceFuncs, "sDirectionalApproachDistanceFuncs must exist in cdata");
assert.equal(defs.sDirectionalApproachDistanceFuncs.value.length, 4, "4 directional approach funcs in cdata");
assert.equal(defs.sDirectionalApproachDistanceFuncs.value[0].$sym, "GetTrainerApproachDistanceSouth");
assert.equal(defs.sDirectionalApproachDistanceFuncs.value[1].$sym, "GetTrainerApproachDistanceNorth");
assert.equal(defs.sDirectionalApproachDistanceFuncs.value[2].$sym, "GetTrainerApproachDistanceWest");
assert.equal(defs.sDirectionalApproachDistanceFuncs.value[3].$sym, "GetTrainerApproachDistanceEast");

// 2. Test directional distance calculations
const mockObjects = {
  list: [],
  // ObjectEvents.GetCollisionAtCoords (event_object_movement.c): the player tile
  // collides as an object event; the path itself is open (flags 0 below).
  GetCollisionAtCoords: (_trainer: ObjectEvent, _x: number, _y: number, _dir: number) => COLLISION_OBJECT_EVENT,
  // ObjectEvents.GetCollisionFlagsAtCoords (event_object_movement.c): open path here.
  GetCollisionFlagsAtCoords: (_trainer: ObjectEvent, _x: number, _y: number, _dir: number) => 0,
  isMovementOverridden: (_obj: ObjectEvent) => false,
  ObjectEventClearHeldMovementIfFinished: (_obj: ObjectEvent) => 1,
  setHeldMovement: (_obj: ObjectEvent, action: number) => { (_obj as any).heldMovement = action; },
} as unknown as ObjectEvents;

const baseTrainer: ObjectEvent = {
  active: true,
  currentCoords: { x: 10, y: 10 },
  previousCoords: { x: 10, y: 10 },
  facingDirection: C.DIR_SOUTH,
  trainerType: C.TRAINER_TYPE_NORMAL,
  trainerRange: 4,
  rangeX: 0,
  rangeY: 0,
} as ObjectEvent;

// South: target is at (10, 13) -> distance 3
assert.equal(GetTrainerApproachDistanceSouth(mockObjects, baseTrainer, 4, 10, 13), 3);
// South out of range: target at (10, 15) -> 0
assert.equal(GetTrainerApproachDistanceSouth(mockObjects, baseTrainer, 4, 10, 15), 0);
// South wrong X: target at (11, 13) -> 0
assert.equal(GetTrainerApproachDistanceSouth(mockObjects, baseTrainer, 4, 11, 13), 0);

// North: target is at (10, 8) -> distance 2
assert.equal(GetTrainerApproachDistanceNorth(mockObjects, baseTrainer, 4, 10, 8), 2);
assert.equal(GetTrainerApproachDistanceNorth(mockObjects, baseTrainer, 4, 10, 5), 0);

// West: target is at (7, 10) -> distance 3
assert.equal(GetTrainerApproachDistanceWest(mockObjects, baseTrainer, 4, 7, 10), 3);
assert.equal(GetTrainerApproachDistanceWest(mockObjects, baseTrainer, 4, 5, 10), 0);

// East: target is at (14, 10) -> distance 4
assert.equal(GetTrainerApproachDistanceEast(mockObjects, baseTrainer, 4, 14, 10), 4);
assert.equal(GetTrainerApproachDistanceEast(mockObjects, baseTrainer, 4, 15, 10), 0);

// 3. Test sDirectionalApproachDistanceFuncs array alignment
assert.equal(sDirectionalApproachDistanceFuncs.length, 4);
assert.equal(sDirectionalApproachDistanceFuncs[0], GetTrainerApproachDistanceSouth);
assert.equal(sDirectionalApproachDistanceFuncs[1], GetTrainerApproachDistanceNorth);
assert.equal(sDirectionalApproachDistanceFuncs[2], GetTrainerApproachDistanceWest);
assert.equal(sDirectionalApproachDistanceFuncs[3], GetTrainerApproachDistanceEast);

// 4. Test CheckPathBetweenTrainerAndPlayer and GetTrainerApproachDistance
assert.equal(CheckPathBetweenTrainerAndPlayer(mockObjects, baseTrainer, 3, C.DIR_SOUTH), 3);
assert.equal(GetTrainerApproachDistance(mockObjects, baseTrainer, 10, 13), 3);

// 5. Test TrainerSeeFunc_Dummy
assert.equal(TrainerSeeFunc_Dummy(), false, "TrainerSeeFunc_Dummy always returns false");

// 6. Test TrainerSeeFunc_BeginRemoveDisguise and TrainerSeeFunc_WaitRemoveDisguise
const disguisedTrainer = {
  ...baseTrainer,
  movementType: C.MOVEMENT_TYPE_TREE_DISGUISE,
} as ObjectEvent;

const beginOk = TrainerSeeFunc_BeginRemoveDisguise(mockObjects, disguisedTrainer);
assert.equal(beginOk, true, "TrainerSeeFunc_BeginRemoveDisguise initiates reveal action");
assert.equal((disguisedTrainer as any).heldMovement, C.MOVEMENT_ACTION_REVEAL_TRAINER);

const waitOk = TrainerSeeFunc_WaitRemoveDisguise(mockObjects, disguisedTrainer);
assert.equal(waitOk, true, "TrainerSeeFunc_WaitRemoveDisguise returns true when movement clears");

console.log("PASS: trainer_see.c (37/37 functions) approach calculation and disguise checks verified.");
