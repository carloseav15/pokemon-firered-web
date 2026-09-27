// Compare a Clang-generated accessor and its active trainer-pic caller to the
// cdata table exported from the same FireRed decomp.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../src/fr/generated/constants.ts";
import { FacilityClassToPicIndex, PageToNextGfxId } from "../../src/fr/generated/cdataTableAccessors.ts";
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

const naming = JSON.parse(readFileSync(`${root}naming_screen.json`, "utf8")) as {
  defs: Record<string, { type: string; value: number[] }>;
};
registerCData("naming_screen", naming.defs);
const pageTable = naming.defs.sPageToNextGfxId;
assert.ok(pageTable, "C-exported sPageToNextGfxId must exist");
assert.equal(pageTable.type, "u8");
assert.equal(pageTable.value.length, 3, "KBPAGE_COUNT is three in FireRed");
const pageResults = JSON.parse(readFileSync(`${process.cwd()}/.decomp-build/checks/pageToNextGfxIdResults.json`, "utf8")) as {
  cases: number[];
  expected: number[];
};
for (let i = 0; i < pageResults.cases.length; i++) {
  assert.equal(PageToNextGfxId(pageResults.cases[i]), pageResults.expected[i], `PageToNextGfxId C parity case ${i}`);
  assert.equal(pageResults.expected[i], pageTable.value[pageResults.cases[i] & 0xff], `C table result for page input ${pageResults.cases[i]}`);
}
const namingSource = readFileSync(`${process.cwd()}/src/fr/namingScreen.ts`, "utf8");
assert.match(namingSource, /const gfx = PageToNextGfxId\(page\);/, "naming screen page button must use the generated C accessor");
console.log(`C-data table accessors: ${table.value.length * 2} trainer-pic table comparisons, 3 integrated trainer-pic checks, and ${pageResults.cases.length} PageToNextGfxId C cases passed`);
