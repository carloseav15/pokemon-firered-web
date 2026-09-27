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
console.log(`event_object_movement table lookups: ${assertions} C-exported table comparisons passed`);
