import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import * as generated from "../../src/fr/generated/eventObjectAnims";
import { registerCData } from "../../src/fr/hw/assets";
import "./setupNodeGbaMock";
import {
  COLLISION_ELEVATION_MISMATCH,
  COLLISION_NONE,
  COLLISION_OBJECT_EVENT,
  DIR_EAST,
  ObjectEvent,
  ObjectEvents,
} from "../../src/fr/field/objectEvents";

const exported = JSON.parse(readFileSync(resolve("public/fr/cdata/event_object_movement.json"), "utf8")) as {
  defs: Record<string, { type: string; value: unknown[] }>;
};
registerCData("event_object_movement", exported.defs);

const mappings: Array<[keyof typeof generated, string]> = [
  ["GetFaceDirectionAnimNum", "sFaceDirectionAnimNums"],
  ["GetMoveDirectionAnimNum", "sMoveDirectionAnimNums"],
  ["GetMoveDirectionFastAnimNum", "sMoveDirectionFastAnimNums"],
  ["GetMoveDirectionFasterAnimNum", "sMoveDirectionFasterAnimNums"],
  ["GetMoveDirectionFastestAnimNum", "sMoveDirectionFastestAnimNums"],
  ["GetJumpSpecialDirectionAnimNum", "sJumpSpecialDirectionAnimNums"],
  ["GetAcroWheelieDirectionAnimNum", "sAcroBunnyHopBackWheelDirectionAnimNums"],
  ["GetAcroBunnyHopFrontWheelDirectionAnimNum", "sAcroBunnyHopFrontWheelDirectionAnimNums"],
  ["GetAcroEndWheelieDirectionAnimNum", "sAcroStandingWheelieBackWheelDirectionAnimNums"],
  ["GetSpinDirectionAnimNum", "sSpinDirectionAnimNums"],
  ["GetAcroUnusedActionDirectionAnimNum", "sAcroStandingWheelieFrontWheelDirectionAnimNums"],
  ["GetAcroWheeliePedalDirectionAnimNum", "sAcroMovingWheelieDirectionAnimNums"],
  ["GetFishingDirectionAnimNum", "sFishingDirectionAnimNums"],
  ["GetFishingNoCatchDirectionAnimNum", "sFishingNoCatchDirectionAnimNums"],
  ["GetFishingBiteDirectionAnimNum", "sFishingBiteDirectionAnimNums"],
  ["GetRunningDirectionAnimNum", "sRunningDirectionAnimNums"],
  ["GetTrainerFacingDirectionMovementType", "sTrainerFacingDirectionMovementTypes"],
  ["ElevationToPriority", "sElevationToPriority"],
];

let assertions = 0;
for (const [name, tableName] of mappings) {
  const table = exported.defs[tableName]?.value as number[] | undefined;
  const fn = generated[name] as (direction: number) => number;
  const expectedLength = tableName === "sElevationToPriority" ? 16 : 9;
  if (!table || table.length !== expectedLength) throw new Error(`${tableName} missing or has unexpected length`);
  for (let index = 0; index < expectedLength; index++) {
    const actual = fn(index);
    if (actual !== table[index]) throw new Error(`${name}(${index}) = ${actual}; C-exported ${tableName}[${index}] = ${table[index]}`);
    assertions++;
  }
}

const jumpTables = exported.defs.sJumpYTable.value as Array<{ $sym: string }>;
if (jumpTables.length !== 3) throw new Error("sJumpYTable must export three jump curves");
for (let type = 0; type < jumpTables.length; type++) {
  const table = exported.defs[jumpTables[type].$sym].value as number[];
  if (table.length !== 16) throw new Error(`${jumpTables[type].$sym} must contain 16 signed-byte entries`);
  for (let i = 0; i < table.length; i++) {
    const actual = generated.GetJumpY(i, type);
    if (actual !== table[i]) throw new Error(`GetJumpY(${i}, ${type}) = ${actual}; C-exported ${jumpTables[type].$sym}[${i}] = ${table[i]}`);
    if (generated.GetJumpY(i + 0x10000, type) !== table[i]) throw new Error(`GetJumpY did not wrap s16 index ${i + 0x10000}`);
    assertions += 2;
  }
}
const copyDirections = exported.defs.sPlayerDirectionsForCopy.value as number[][];
if (copyDirections.length !== 4 || copyDirections.some((row) => row.length !== 4)) throw new Error("sPlayerDirectionsForCopy must be a 4 by 4 C table");
for (let initDir = 1; initDir <= 4; initDir++) {
  for (let moveDir = 1; moveDir <= 4; moveDir++) {
    const expected = copyDirections[initDir - 1][moveDir - 1];
    if (generated.GetPlayerDirectionForCopy(initDir, moveDir) !== expected) throw new Error(`GetPlayerDirectionForCopy(${initDir}, ${moveDir}) differs from C data`);
    if (generated.GetPlayerDirectionForCopy(initDir + 0x100, moveDir + 0x100) !== expected) throw new Error("GetPlayerDirectionForCopy did not wrap u8 parameters");
    assertions += 2;
  }
}
const copyDirectionTable = exported.defs.sPlayerDirectionToCopyDirection.value as number[][];
if (copyDirectionTable.length !== 4 || copyDirectionTable.some((row) => row.length !== 4)) throw new Error("sPlayerDirectionToCopyDirection must be a 4 by 4 C table");
for (let copyInitDir = 1; copyInitDir <= 4; copyInitDir++) {
  for (let playerInitDir = 1; playerInitDir <= 4; playerInitDir++) {
    for (let playerMoveDir = 1; playerMoveDir <= 4; playerMoveDir++) {
      const intermediate = copyDirections[playerInitDir - 1][playerMoveDir - 1];
      const expected = copyDirectionTable[copyInitDir - 1][intermediate - 1];
      const actual = generated.GetCopyDirection(copyInitDir, playerInitDir, playerMoveDir);
      if (actual !== expected) throw new Error(`GetCopyDirection(${copyInitDir}, ${playerInitDir}, ${playerMoveDir}) differs from C tables`);
      if (generated.GetCopyDirection(copyInitDir + 0x100, playerInitDir + 0x100, playerMoveDir + 0x100) !== expected) throw new Error("GetCopyDirection did not preserve u8 truncation");
      assertions += 2;
    }
  }
}
for (const invalid of [0, 5, 0x100, 0x105]) {
  if (generated.GetCopyDirection(1, invalid, 1) !== 0) throw new Error(`GetCopyDirection accepted invalid player initial direction ${invalid}`);
  if (generated.GetCopyDirection(1, 1, invalid) !== 0) throw new Error(`GetCopyDirection accepted invalid player movement direction ${invalid}`);
  assertions += 2;
}
const cResults = JSON.parse(readFileSync(resolve(".decomp-build/checks/copyDirectionResults.json"), "utf8")) as {
  cases: number[][];
  expected: number[];
};
if (cResults.cases.length !== cResults.expected.length) throw new Error("C copy-direction harness result is malformed");
for (let i = 0; i < cResults.cases.length; i++) {
  const [copyInitDir, playerInitDir, playerMoveDir] = cResults.cases[i];
  const actual = generated.GetCopyDirection(copyInitDir, playerInitDir, playerMoveDir);
  if (actual !== cResults.expected[i]) throw new Error(`GetCopyDirection C parity case ${i}: got ${actual}, C returned ${cResults.expected[i]}`);
}
assertions += cResults.cases.length;
const elevationResults = JSON.parse(readFileSync(resolve(".decomp-build/checks/eventObjectElevationResults.json"), "utf8")) as {
  mismatch: number[];
  compatible: number[];
};
let mapElevation = 0;
let seenCoords = { x: 0, y: 0 };
const objects = new ObjectEvents({
  map: () => ({ elevationAt: (x: number, y: number) => { seenCoords = { x, y }; return mapElevation; } }),
} as any);
let mismatchIndex = 0;
for (let elevation = 0; elevation < 256; elevation++) {
  for (mapElevation = 0; mapElevation < 16; mapElevation++) {
    const actual = objects.IsElevationMismatchAt(elevation, 0, 0) ? 1 : 0;
    if (actual !== elevationResults.mismatch[mismatchIndex++]) throw new Error(`IsElevationMismatchAt(${elevation}, map=${mapElevation}) differs from C`);
    assertions++;
  }
}
let compatibleIndex = 0;
for (let a = 0; a < 256; a++) {
  for (let b = 0; b < 256; b++) {
    const actual = ObjectEvents.AreElevationsCompatible(a, b) ? 1 : 0;
    if (actual !== elevationResults.compatible[compatibleIndex++]) throw new Error(`AreElevationsCompatible(${a}, ${b}) differs from C`);
    assertions++;
  }
}
objects.IsElevationMismatchAt(1, 0x10001, -0x10002);
if (seenCoords.x !== 1 || seenCoords.y !== -2) throw new Error("IsElevationMismatchAt did not wrap s16 coordinates at the C call boundary");
assertions++;
const mockMap = {
  collisionAt: () => 0,
  borderIdAt: () => 0,
  behaviorAt: () => 0,
  elevationAt: () => mapElevation,
};
const fieldObjects = new ObjectEvents({ map: () => mockMap, cameraCanMove: () => true } as any);
fieldObjects.objects.fill(null);
const mover = new ObjectEvent();
mover.currentCoords = { x: 10, y: 10 };
mover.initialCoords = { x: 10, y: 10 };
mover.currentElevation = 2;
mover.rangeX = 1;
mover.rangeY = 1;
fieldObjects.objects[0] = mover;
mapElevation = 2;
if (fieldObjects.GetCollisionAtCoords(mover, 11, 10, DIR_EAST) !== COLLISION_NONE) throw new Error("clear collision target should be passable");
if (fieldObjects.GetCollisionFlagsAtCoords(mover, 11, 10, DIR_EAST) !== 0) throw new Error("clear collision target should have no flags");
const blocker = new ObjectEvent();
blocker.currentCoords = { x: 11, y: 10 };
blocker.currentElevation = 2;
fieldObjects.objects[1] = blocker;
if (!fieldObjects.DoesObjectCollideWithObjectAt(mover, 11, 10)) throw new Error("object collision helper missed active target");
if (fieldObjects.GetCollisionInDirection(mover, DIR_EAST) !== COLLISION_OBJECT_EVENT) throw new Error("directional collision did not find object");
if (fieldObjects.GetCollisionFlagsAtCoords(mover, 11, 10, DIR_EAST) !== 8) throw new Error("object collision flag does not match C bit 3");
mapElevation = 3;
if (fieldObjects.GetCollisionAtCoords(mover, 11, 10, DIR_EAST) !== COLLISION_ELEVATION_MISMATCH) throw new Error("elevation mismatch must be checked before object overlap");
fieldObjects.objects[1] = null;
if (fieldObjects.GetCollisionAtCoords(mover, 11, 10, DIR_EAST) !== COLLISION_ELEVATION_MISMATCH) throw new Error("elevation mismatch was not reported for empty target");
assertions += 7;
const freezeResults = JSON.parse(readFileSync(resolve(".decomp-build/checks/eventObjectFreezeResults.json"), "utf8")) as {
  directResults: number[];
  states: number[][];
};
// PREPARED: object and sprite states are seeded to isolate the C freeze/unfreeze cases.
function freshObjectManager(): ObjectEvents {
  const manager = new ObjectEvents({ map: () => mockMap, cameraCanMove: () => true } as any);
  manager.objects.fill(null);
  for (let i = 0; i < 16; i++) {
    const object = new ObjectEvent();
    object.active = i < 5;
    object.isPlayer = i === 0;
    object.spriteId = i;
    object.sprite.animPaused = (i & 1) !== 0;
    object.sprite.affineAnimPaused = (i & 2) !== 0;
    manager.objects[i] = object;
  }
  return manager;
}
function flattenObjectManager(manager: ObjectEvents): number[] {
  return manager.objects.flatMap((object, i) => object
    ? [Number(object.active), Number(object.heldMovementActive), Number(object.frozen), object.spriteId,
      Number(object.spriteAnimPausedBackup), Number(object.spriteAffineAnimPausedBackup),
      Number(object.sprite.animPaused), Number(object.sprite.affineAnimPaused)]
    : [0, 0, 0, i, 0, 0, 0, 0]);
}
let freezeManager = freshObjectManager();
freezeManager.objects[1]!.heldMovementActive = true;
const freezeReturns = [
  Number(freezeManager.FreezeObjectEvent(freezeManager.objects[1]!)),
  Number(freezeManager.FreezeObjectEvent(freezeManager.objects[2]!)),
  Number(freezeManager.FreezeObjectEvent(freezeManager.objects[2]!)),
];
assert.deepEqual(freezeReturns, freezeResults.directResults, "FreezeObjectEvent return values differ from C");
assertions += freezeReturns.length;
function compareFreezeState(manager: ObjectEvents, scenario: number): void {
  assert.deepEqual(flattenObjectManager(manager), freezeResults.states[scenario], `object freeze scenario ${scenario} differs from C`);
  assertions += freezeResults.states[scenario].length;
}
compareFreezeState(freezeManager, 0);
freezeManager = freshObjectManager();
freezeManager.objects[2]!.heldMovementActive = true;
freezeManager.objects[3]!.active = false;
freezeManager.FreezeObjectEvents();
compareFreezeState(freezeManager, 1);
freezeManager = freshObjectManager();
freezeManager.FreezeObjectEventsExceptOne(4);
compareFreezeState(freezeManager, 2);
freezeManager = freshObjectManager();
freezeManager.objects[1]!.frozen = true;
freezeManager.objects[1]!.spriteAnimPausedBackup = true;
freezeManager.objects[1]!.spriteAffineAnimPausedBackup = false;
freezeManager.objects[1]!.sprite.animPaused = true;
freezeManager.objects[1]!.sprite.affineAnimPaused = true;
freezeManager.objects[2]!.active = false;
freezeManager.objects[2]!.frozen = true;
freezeManager.UnfreezeObjectEvent(freezeManager.objects[2]!);
freezeManager.UnfreezeObjectEvent(freezeManager.objects[1]!);
compareFreezeState(freezeManager, 3);
freezeManager = freshObjectManager();
freezeManager.objects[1]!.frozen = true;
freezeManager.objects[1]!.spriteAnimPausedBackup = true;
freezeManager.objects[1]!.spriteAffineAnimPausedBackup = true;
freezeManager.objects[2]!.frozen = true;
freezeManager.objects[2]!.spriteAffineAnimPausedBackup = true;
freezeManager.objects[3]!.active = false;
freezeManager.objects[3]!.frozen = true;
freezeManager.UnfreezeObjectEvents();
compareFreezeState(freezeManager, 4);
console.log(`event_object_movement checks: ${assertions - cResults.cases.length} C-data/edge comparisons and ${cResults.cases.length} extracted-C harness cases passed`);
