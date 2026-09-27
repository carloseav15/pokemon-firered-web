import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as generated from "../../src/fr/generated/eventObjectAnims";
import { registerCData } from "../../src/fr/hw/assets";

const exported = JSON.parse(readFileSync(resolve("public/fr/cdata/event_object_movement.json"), "utf8")) as {
  defs: Record<string, { type: string; value: number[] }>;
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
];

let assertions = 0;
for (const [name, tableName] of mappings) {
  const table = exported.defs[tableName]?.value;
  const fn = generated[name] as (direction: number) => number;
  if (!table || table.length !== 9) throw new Error(`${tableName} missing or has unexpected length`);
  for (let direction = 0; direction < 9; direction++) {
    const actual = fn(direction);
    if (actual !== table[direction]) throw new Error(`${name}(${direction}) = ${actual}; C-exported ${tableName}[${direction}] = ${table[direction]}`);
    assertions++;
  }
}
console.log(`event_object_movement direction lookups: ${assertions} C-exported table comparisons passed`);
