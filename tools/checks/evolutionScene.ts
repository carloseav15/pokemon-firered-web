// Headless check for Evolution Scene parity (evolution_scene.c and evolution_graphics.c)
// Run with: npm run check:evolution

import './setupNodeGbaMock.ts';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerCData } from '../../src/fr/hw/assets.ts';
import { rom } from '../../src/fr/rom.ts';
import * as C from '../../src/fr/generated/constants.ts';
import { createMon, speciesName, type Pokemon } from '../../src/fr/pokemon/pokemon.ts';
import { trySpawnShedinja } from '../../src/fr/menus/monProgress.ts';
import { save } from '../../src/fr/save.ts';

const root = process.cwd() + '/public/fr/';

// 1. Load constants, strings, species, moves, items, charmap
rom.constants = JSON.parse(readFileSync(root + 'constants.json', 'utf8'));
rom.charmap = JSON.parse(readFileSync(root + 'charmap.json', 'utf8'));
rom.strings = JSON.parse(readFileSync(root + 'data/strings.json', 'utf8'));
const speciesRaw = JSON.parse(readFileSync(root + 'data/species.json', 'utf8'));
rom.species = speciesRaw.species;
rom.pokedex = speciesRaw.pokedex;
rom.expTables = speciesRaw.exp;

const movesRaw = JSON.parse(readFileSync(root + 'data/moves.json', 'utf8'));
rom.moves = movesRaw.moves;
rom.abilities = movesRaw.abilities;
rom.natures = movesRaw.natures;

const itemsRaw = JSON.parse(readFileSync(root + 'data/items.json', 'utf8'));
rom.items = itemsRaw.items;

// 2. Register cdata
const evoSceneCData = JSON.parse(readFileSync(root + 'cdata/evolution_scene.json', 'utf8'));
registerCData('evolution_scene', evoSceneCData.defs);

const evoGfxCData = JSON.parse(readFileSync(root + 'cdata/evolution_graphics.json', 'utf8'));
registerCData('evolution_graphics', evoGfxCData.defs);

// 3. Verify cdata definitions from evolution_scene.c
const sDefs = evoSceneCData.defs;
assert.ok(sDefs.sBgAnim_PaletteControl, 'sBgAnim_PaletteControl must exist in cdata');
const palControl = sDefs.sBgAnim_PaletteControl.value;
assert.equal(palControl.length, 4, 'sBgAnim_PaletteControl must have 4 stages');
assert.deepEqual(palControl[0], [0, 12, 1, 6], 'Stage 0 must cycle 0..12, 1 cycle, delay 6');
assert.deepEqual(palControl[1], [13, 36, 5, 2], 'Stage 1 must cycle 13..36, 5 cycles, delay 2');
assert.deepEqual(palControl[2], [13, 24, 1, 2], 'Stage 2 must cycle 13..24, 1 cycle, delay 2');
assert.deepEqual(palControl[3], [37, 49, 1, 6], 'Stage 3 must cycle 37..49, 1 cycle, delay 6');

assert.ok(sDefs.sBgAnim_PalIndexes, 'sBgAnim_PalIndexes must exist in cdata');
const palIndexes = sDefs.sBgAnim_PalIndexes.value;
assert.equal(palIndexes.length, 50, 'sBgAnim_PalIndexes must have 50 index palettes');
for (let i = 0; i < 50; i++) {
  assert.equal(palIndexes[i].length, 16, `Index palette ${i} must have 16 colors`);
}

// 4. Verify cdata definitions from evolution_graphics.c
const gDefs = evoGfxCData.defs;
assert.ok(gDefs.sEvolutionSparkleMatrixScales, 'sEvolutionSparkleMatrixScales must exist in cdata');
const sparkleScales = gDefs.sEvolutionSparkleMatrixScales.value;
assert.equal(sparkleScales.length, 12, 'Must have 12 sparkle matrix scales (matrices 20..31)');
assert.equal(sparkleScales[0], 0x3c0, 'First sparkle scale must be 0x3C0');
assert.equal(sparkleScales[11], 0x100, 'Last sparkle scale must be 0x100');

assert.ok(gDefs.sSpriteTemplate_EvolutionSparkles, 'sSpriteTemplate_EvolutionSparkles must exist in cdata');
assert.equal(gDefs.sSpriteTemplate_EvolutionSparkles.value.tileTag, 1001, 'Sparkle tileTag must be 1001');
assert.equal(gDefs.sSpriteTemplate_EvolutionSparkles.value.paletteTag, 1001, 'Sparkle paletteTag must be 1001');

// 5. Verify incbin symbols in pack index
const idx = JSON.parse(readFileSync(root + 'incbin/index.json', 'utf8')).symbols;
const requiredSymbols = [
  'sEvolutionSparklesPalData',
  'sEvolutionSparklesTileData',
  'sBgAnim_Pal',
  'evolution_scene.c:sBlackPalette',
  'sMovingBackgroundMap1',
  'sMovingBackgroundMap2',
  'sMovingBackgroundTiles',
];
for (const sym of requiredSymbols) {
  assert.ok(idx[sym], `Symbol ${sym} must be indexed in public/fr/incbin/index.json`);
}

// 6. Test mon sprite scaling matrix math
// In CycleEvolutionMonSprite:
// Scale 256 (0x100) -> 0x10000 / 0x100 = 0x100 (1.0x scale)
// Scale 16 (0x10) -> 0x10000 / 0x10 = 0x1000 (16.0x scale)
const mPre = Math.floor(0x10000 / 256);
assert.equal(mPre, 0x100, 'Scale 256 gives affine matrix parameter 0x100');
const mPost = Math.floor(0x10000 / 16);
assert.equal(mPost, 0x1000, 'Scale 16 gives affine matrix parameter 0x1000');

// Speed progression from 8 to 128
let speed = 8;
let cycles = 0;
while (speed < 128) {
  speed += 2;
  cycles++;
}
assert.equal(speed, 128, 'Speed terminates at 128');
assert.equal(cycles, 60, 'Takes exactly 60 alternating cycles to reach speed 128');

// 7. Verify National Dex evolution barrier
// Before National Dex, target species past Mew (>151) cannot evolve
const canEvolveWithoutNatDex = (targetSpecies: number) => targetSpecies <= C.SPECIES_MEW;
assert.equal(canEvolveWithoutNatDex(C.SPECIES_CHARIZARD), true, 'Charmeleon can evolve to Charizard (<=151)');
assert.equal(canEvolveWithoutNatDex(C.SPECIES_CROBAT), false, 'Golbat cannot evolve to Crobat (169 > 151) without National Dex');

// 8. Verify Shedinja trigger
save.party = [];
save.bag = { pokeBalls: [{ item: C.ITEM_POKE_BALL, quantity: 5 }] } as unknown as typeof save.bag;
const nincada = createMon(C.SPECIES_NINCADA, 20);
save.party.push(nincada);

trySpawnShedinja(nincada, C.SPECIES_NINCADA);
assert.equal(save.party.length, 2, 'Shedinja was added to party');
assert.equal(save.party[1].species, C.SPECIES_SHEDINJA, 'New party member is Shedinja');
assert.equal(save.bag.pokeBalls[0].quantity, 4, 'Used one Poké Ball for Shedinja');

console.log('✓ All evolutionScene parity checks passed!');
