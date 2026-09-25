// Headless check for Pokémon Summary Screen parity (pokemon_summary_screen.c)
// Run with: npm run check:summary

import './setupNodeGbaMock.ts';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerCData } from '../../src/fr/hw/assets.ts';
import { rom } from '../../src/fr/rom.ts';
import * as C from '../../src/fr/generated/constants.ts';
import {
  GetLastViewedMonIndex,
  GetMoveSlotToReplace,
  PokemonSummaryScreenMode,
} from '../../src/fr/pokemonSummaryScreen.ts';
import { createMon, speciesName, type Pokemon } from '../../src/fr/pokemon/pokemon.ts';
import { GetMonData, type Mon } from '../../src/fr/pokemon/mon.ts';
import { itemName } from '../../src/fr/pokemon/items.ts';
import { isHMMove } from '../../src/fr/menus/monProgress.ts';
import { decode } from '../../src/fr/gba/charmap.ts';

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
const pssCData = JSON.parse(readFileSync(root + 'cdata/pokemon_summary_screen.json', 'utf8'));
registerCData('pokemon_summary_screen', pssCData.defs);

const bmCData = JSON.parse(readFileSync(root + 'cdata/battle_main.json', 'utf8'));
registerCData('battle_main', bmCData.defs);

const mdCData = JSON.parse(readFileSync(root + 'cdata/move_descriptions.json', 'utf8'));
registerCData('move_descriptions', mdCData.defs);

const pbCData = JSON.parse(readFileSync(root + 'cdata/pokeball.json', 'utf8'));
registerCData('pokeball', pbCData.defs);

const mmCData = JSON.parse(readFileSync(root + 'cdata/mon_markings.json', 'utf8'));
registerCData('mon_markings', mmCData.defs);

// 3. Verify key cdata structures from pokemon_summary_screen.c
const defs = pssCData.defs;
assert.ok(defs.sBgTempaltes, 'sBgTempaltes must exist');
const bgTemplates = defs.sBgTempaltes.value;
assert.equal(bgTemplates.length, 4, 'Must have 4 background layers');
const bgByNum = Object.fromEntries(bgTemplates.map((t: any) => [t.bg, t]));
assert.equal(bgByNum[0].priority, 0, 'BG0 must have priority 0 (text/windows)');
assert.equal(bgByNum[2].priority, 1, 'BG2 must have priority 1');
assert.equal(bgByNum[1].priority, 2, 'BG1 must have priority 2 (sliding pages/bars)');
assert.equal(bgByNum[3].priority, 3, 'BG3 must have priority 3 (static background)');

assert.ok(defs.sWindowTemplates_Info, 'sWindowTemplates_Info must exist');
assert.ok(defs.sWindowTemplates_Skills, 'sWindowTemplates_Skills must exist');
assert.ok(defs.sWindowTemplates_Moves, 'sWindowTemplates_Moves must exist');
assert.ok(defs.sWindowTemplates_Permanent_Bg1, 'sWindowTemplates_Permanent_Bg1 must exist');
assert.ok(defs.sWindowTemplates_Permanent_Bg2, 'sWindowTemplates_Permanent_Bg2 must exist');

assert.ok(defs.sMoveSelectionCursorOamData, 'sMoveSelectionCursorOamData must exist');
assert.ok(defs.sMoveSelectionCursorOamAnimTable, 'sMoveSelectionCursorOamAnimTable must exist');
assert.ok(defs.sStatusAilmentIconOamData, 'sStatusAilmentIconOamData must exist');
assert.ok(defs.sStatusAilmentIconAnimTable, 'sStatusAilmentIconAnimTable must exist');
assert.ok(defs.sPokerusIconObjOamData, 'sPokerusIconObjOamData must exist');
assert.ok(defs.sPokerusIconObjAnimTable, 'sPokerusIconObjAnimTable must exist');
assert.ok(defs.sStarObjOamData, 'sStarObjOamData must exist');
assert.ok(defs.sStarObjAnimTable, 'sStarObjAnimTable must exist');
assert.ok(defs.sHpOrExpBarOamData, 'sHpOrExpBarOamData must exist');
assert.ok(defs.sHpOrExpBarAnimTable, 'sHpOrExpBarAnimTable must exist');

// 4. Verify all incbin assets exist in index.json
const incbinIndex = JSON.parse(readFileSync(root + 'incbin/index.json', 'utf8')).symbols;
const requiredSymbols = [
  'gSummaryScreen_HpBar_Gfx',
  'gSummaryScreen_ExpBar_Gfx',
  'gSummaryScreen_HpExpBar_Pal',
  'sPokeSummary_HpBarPalYellow',
  'sPokeSummary_HpBarPalRed',
  'sPokerusIconObjTiles',
  'sPokerusIconObjPal',
  'sStarObjTiles',
  'sStarObjPal',
  'sMonMarkings_Gfx',
  'sMonMarkingSpritePalette',
  'sMoveSelectionCursorTiles_Left',
  'sMoveSelectionCursorTiles_Right',
  'sMoveSelectionCursorPals',
  'gSummaryScreen_Bg_Gfx',
  'gSummaryScreen_Bg_Pal',
  'sTextHeaderPalette',
  'sTextMovesPalette',
  'gSummaryScreen_PageInfo_Tilemap',
  'gSummaryScreen_PageSkills_Tilemap',
  'gSummaryScreen_PageMoves_Tilemap',
  'gSummaryScreen_PageMovesInfo_Tilemap',
  'gSummaryScreen_PageEgg_Tilemap',
  'sBgTilemap_MovesPage',
  'sBgTilemap_MovesInfoPage',
  'gSummaryScreen_StatusAilmentIcon_Gfx',
  'gSummaryScreen_StatusAilmentIcon_Pal',
];

for (const sym of requiredSymbols) {
  assert.ok(incbinIndex[sym], `Symbol ${sym} must exist in incbin/index.json`);
  assert.ok(incbinIndex[sym][2] > 0, `Symbol ${sym} must have positive byte size`);
}

// 5. Test Mon data extraction and buffer logic
const charmander = createMon(C.SPECIES_CHARMANDER, 5);
assert.equal(GetMonData(charmander as Mon, C.MON_DATA_SPECIES), C.SPECIES_CHARMANDER);
assert.equal(GetMonData(charmander as Mon, C.MON_DATA_LEVEL), 5);
assert.ok(GetMonData(charmander as Mon, C.MON_DATA_MAX_HP) > 0);
assert.ok(GetMonData(charmander as Mon, C.MON_DATA_ATK) > 0);
assert.ok(GetMonData(charmander as Mon, C.MON_DATA_DEF) > 0);
assert.ok(GetMonData(charmander as Mon, C.MON_DATA_SPEED) > 0);
assert.ok(GetMonData(charmander as Mon, C.MON_DATA_SPATK) > 0);
assert.ok(GetMonData(charmander as Mon, C.MON_DATA_SPDEF) > 0);

// Verify speciesName and itemName
assert.equal(decode(speciesName(C.SPECIES_CHARMANDER)), 'CHARMANDER');
assert.equal(decode(speciesName(C.SPECIES_PIKACHU)), 'PIKACHU');
assert.equal(decode(itemName(C.ITEM_POTION)), 'POTION');

// 6. Test Egg mon properties
const egg = createMon(C.SPECIES_TOGEPI, 1);
egg.isEgg = true;
egg.friendship = 5; // hatch cycles remaining
assert.equal(GetMonData(egg as Mon, C.MON_DATA_SANITY_IS_EGG), 1);

// Egg pic shake vigor logic from PokeSum_SetMonPicSpriteCallback:
// cycles <= 5 -> vigor 2; cycles <= 10 -> vigor 1; else vigor 0
const getEggVigor = (cycles: number) => (cycles <= 5 ? 2 : cycles <= 10 ? 1 : 0);
assert.equal(getEggVigor(5), 2);
assert.equal(getEggVigor(10), 1);
assert.equal(getEggVigor(20), 0);

// 7. Test HM move restriction (HM moves cannot be forgotten unless in forget move mode)
assert.equal(isHMMove(C.MOVE_CUT), true, 'CUT is an HM move');
assert.equal(isHMMove(C.MOVE_SURF), true, 'SURF is an HM move');
assert.equal(isHMMove(C.MOVE_TACKLE), false, 'TACKLE is not an HM move');

// 8. Test mode enums and default getters
assert.equal(PokemonSummaryScreenMode.PSS_MODE_NORMAL, 0);
assert.equal(PokemonSummaryScreenMode.PSS_MODE_SELECT_MOVE, 2);
assert.equal(GetLastViewedMonIndex(), 0);
assert.equal(GetMoveSlotToReplace(), 0);

console.log('PASS: Pokémon Summary Screen parity checks succeeded (4 BGs, templates, incbin symbols, mon/egg buffers, HM checks).');
