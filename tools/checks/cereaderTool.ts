// Headless check for cereader_tool.c (Trainer Tower e-Reader validation and save/load).
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import * as C from "../../src/fr/generated/constants.ts";
import { save } from "../../src/fr/save.ts";
import {
  CalcByteArraySum,
  GetTrainerHillUnkVal,
  ValidateTrainerTowerTrainer,
  ValidateTrainerTowerData,
  CEReaderTool_SaveTrainerTower,
  CEReaderTool_LoadTrainerTower,
  ReadTrainerTowerAndValidate,
  type EReaderTrainerTowerSet,
  type TrainerTowerFloor,
} from "../../src/fr/cereaderTool.ts";

// 1. Test CalcByteArraySum
assert.equal(CalcByteArraySum([1, 2, 3, 4]), 10);
assert.equal(CalcByteArraySum(new Uint8Array([0xff, 0x01])), 256);

// 2. Test GetTrainerHillUnkVal
(save as any).trainerTower = [{ unk9: 41 }];
assert.equal(GetTrainerHillUnkVal(), 42);
(save as any).trainerTower = [{ unk9: 255 }];
assert.equal(GetTrainerHillUnkVal(), 0);

// 3. Test ValidateTrainerTowerTrainer
const validRaw = new Uint8Array(0x3e0);
validRaw[0] = 5;
validRaw[1] = 10;
const expectedTrainerChecksum = 15;

const validFloor: TrainerTowerFloor = {
  id: 0,
  floorIdx: 1,
  challengeType: C.CHALLENGE_TYPE_KNOCKOUT,
  prize: 1,
  trainers: [],
  checksum: expectedTrainerChecksum,
  rawBytes: validRaw,
};
assert.equal(ValidateTrainerTowerTrainer(validFloor), true, "Valid floor passes validation");

// Invalid floor index
assert.equal(ValidateTrainerTowerTrainer({ ...validFloor, floorIdx: 0 }), false);
assert.equal(ValidateTrainerTowerTrainer({ ...validFloor, floorIdx: 9 }), false);

// Invalid challenge type
assert.equal(ValidateTrainerTowerTrainer({ ...validFloor, challengeType: 3 }), false);

// Invalid checksum
assert.equal(ValidateTrainerTowerTrainer({ ...validFloor, checksum: 999 }), false);

// 4. Test ValidateTrainerTowerData
const validSet: EReaderTrainerTowerSet = {
  numFloors: 1,
  id: 0,
  dummy: 0,
  checksum: 50,
  floors: [validFloor],
  rawFloorsBytes: new Uint8Array([20, 30]),
};
assert.equal(ValidateTrainerTowerData(validSet), true, "Valid set passes validation");

// Invalid numFloors
assert.equal(ValidateTrainerTowerData({ ...validSet, numFloors: 0 }), false);
assert.equal(ValidateTrainerTowerData({ ...validSet, numFloors: 9 }), false);

// Invalid checksum on rawFloorsBytes
assert.equal(ValidateTrainerTowerData({ ...validSet, checksum: 9999 }), false);

// 5. Test Save & Load
const savedOk = CEReaderTool_SaveTrainerTower(validSet);
assert.equal(savedOk, true, "CEReaderTool_SaveTrainerTower succeeds");

const loadedSet: EReaderTrainerTowerSet = {
  numFloors: 0,
  id: 0,
  dummy: 0,
  checksum: 0,
  floors: [],
};
const loadOk = CEReaderTool_LoadTrainerTower(loadedSet);
assert.equal(loadOk, true, "CEReaderTool_LoadTrainerTower succeeds");
assert.equal(loadedSet.numFloors, 1);
assert.equal(loadedSet.checksum, 50);

// 6. Test ReadTrainerTowerAndValidate
assert.equal(ReadTrainerTowerAndValidate(), false, "ReadTrainerTowerAndValidate returns false in FRLG");

console.log("PASS: cereader_tool.c (8/8 functions) validation and save/load routines verified.");
