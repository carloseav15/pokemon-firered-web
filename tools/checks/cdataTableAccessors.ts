// Compare a Clang-generated accessor and its active trainer-pic caller to the
// cdata table exported from the same FireRed decomp.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../src/fr/generated/constants.ts";
import { FacilityClassToPicIndex } from "../../src/fr/generated/cdataTableAccessors.ts";
import { registerCData } from "../../src/fr/hw/assets.ts";
import { PlayerGenderToFrontTrainerPicId } from "../../src/fr/trainerPokemonSprites.ts";

const root = `${process.cwd()}/public/fr/cdata/`;
const pokemon = JSON.parse(readFileSync(`${root}pokemon.json`, "utf8")) as {
  defs: Record<string, { type: string; value: number[] }>;
};
registerCData("pokemon", pokemon.defs);

const table = pokemon.defs.gFacilityClassToPicIndex;
assert.ok(table, "C-exported gFacilityClassToPicIndex must exist");
assert.equal(table.type, "u8");
assert.equal(table.value.length, 150, "AST array bound and exported table length are 150");

for (let index = 0; index < table.value.length; index++) {
  assert.equal(FacilityClassToPicIndex(index), table.value[index], `facility class ${index}`);
  assert.equal(FacilityClassToPicIndex(index + 0x10000), table.value[index], `u16-wrapped facility class ${index}`);
}

assert.equal(PlayerGenderToFrontTrainerPicId(C.MALE, true), table.value[C.FACILITY_CLASS_RED]);
assert.equal(PlayerGenderToFrontTrainerPicId(C.FEMALE, true), table.value[C.FACILITY_CLASS_LEAF]);
assert.equal(PlayerGenderToFrontTrainerPicId(C.MALE, false), C.MALE);
console.log(`FacilityClassToPicIndex: ${table.value.length * 2} table comparisons and 3 integrated trainer-pic checks passed`);
