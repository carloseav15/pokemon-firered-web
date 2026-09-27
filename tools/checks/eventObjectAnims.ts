import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as generated from "../../src/fr/generated/eventObjectAnims";
import { registerCData } from "../../src/fr/hw/assets";

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
console.log(`event_object_movement checks: ${assertions - cResults.cases.length} C-data/edge comparisons and ${cResults.cases.length} extracted-C harness cases passed`);
