// Headless check for trade_scene.c / trade.c port (pokemon/ingameTrade.ts)
// Run with: npm run check:trade

import './setupNodeGbaMock.ts';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerCData, registerIncbinIndex, registerPack } from '../../src/fr/hw/assets.ts';
import { rom } from '../../src/fr/rom.ts';
import * as Trade from '../../src/fr/pokemon/ingameTrade.ts';
import { gMain } from '../../src/fr/hw/runtime.ts';
import { tasks } from '../../src/fr/gba/tasks.ts';
import { save, SV, varSet } from '../../src/fr/save.ts';
import { createMon } from '../../src/fr/pokemon/pokemon.ts';
import * as C from '../../src/fr/generated/constants.ts';

const root = process.cwd() + '/public/fr/';

console.log('--- 1. Testing trade_scene cdata & incbin assets ---');
const tradeSceneCData = JSON.parse(readFileSync(root + 'cdata/trade_scene.json', 'utf8'));
registerCData('trade_scene', tradeSceneCData.defs);
assert.ok(tradeSceneCData.defs.sBgTemplates, 'sBgTemplates must exist in trade_scene cdata');
assert.ok(tradeSceneCData.defs.sTradeMessageWindowTemplates, 'sTradeMessageWindowTemplates must exist in cdata');
assert.ok(tradeSceneCData.defs.sInGameTrades, 'sInGameTrades must exist in cdata');
assert.ok(tradeSceneCData.defs.sSpriteTemplate_Pokeball, 'sSpriteTemplate_Pokeball must exist in cdata');
assert.ok(tradeSceneCData.defs.sSpriteTemplate_LinkMonGlow, 'sSpriteTemplate_LinkMonGlow must exist in cdata');
assert.ok(tradeSceneCData.defs.sSpriteTemplate_LinkMonShadow, 'sSpriteTemplate_LinkMonShadow must exist in cdata');
assert.ok(tradeSceneCData.defs.sSpriteTemplate_CableEnd, 'sSpriteTemplate_CableEnd must exist in cdata');

const tradeCData = JSON.parse(readFileSync(root + 'cdata/trade.json', 'utf8'));
registerCData('trade', tradeCData.defs);

const pokeballCData = JSON.parse(readFileSync(root + 'cdata/pokeball.json', 'utf8'));
registerCData('pokeball', pokeballCData.defs);

(rom as any).constants = JSON.parse(readFileSync(root + 'constants.json', 'utf8'));
const stringsJson = JSON.parse(readFileSync(root + 'data/strings.json', 'utf8'));
(rom as any).strings = stringsJson;
(rom as any).fonts = JSON.parse(readFileSync(root + 'gfx/fonts.json', 'utf8'));
(rom as any).charmap = JSON.parse(readFileSync(root + 'charmap.json', 'utf8'));
const speciesRaw = JSON.parse(readFileSync(root + 'data/species.json', 'utf8'));
(rom as any).species = speciesRaw.species;
(rom as any).pokedex = speciesRaw.pokedex;
(rom as any).expTables = speciesRaw.exp;

const movesRaw = JSON.parse(readFileSync(root + 'data/moves.json', 'utf8'));
(rom as any).moves = movesRaw.moves;
(rom as any).abilities = movesRaw.abilities;
(rom as any).natures = movesRaw.natures;

const itemsRaw = JSON.parse(readFileSync(root + 'data/items.json', 'utf8'));
(rom as any).items = itemsRaw.items;

const incbinIndex = JSON.parse(readFileSync(root + 'incbin/index.json', 'utf8'));
registerIncbinIndex(incbinIndex);

const tradePack = readFileSync(root + 'incbin/graphics_trade.bin');
registerPack('graphics_trade', new Uint8Array(tradePack.buffer, tradePack.byteOffset, tradePack.byteLength));

const battleAnimsPack = readFileSync(root + 'incbin/graphics_battle_anims.bin');
registerPack('graphics_battle_anims', new Uint8Array(battleAnimsPack.buffer, battleAnimsPack.byteOffset, battleAnimsPack.byteLength));

assert.ok(incbinIndex.symbols['sGbaAffine_Gfx'], 'sGbaAffine_Gfx in incbin');
assert.ok(incbinIndex.symbols['sGbaMapCable'], 'sGbaMapCable in incbin');
assert.ok(incbinIndex.symbols['sCableCloseup_Map'], 'sCableCloseup_Map in incbin');
assert.ok(incbinIndex.symbols['sPokeball_Gfx'], 'sPokeball_Gfx in incbin');
console.log('✓ trade_scene cdata and incbin assets validated');

console.log('--- 2. Testing in-game trade species info & pokemon creation ---');
varSet(SV.x8004, 0); // In-game trade index 0 (e.g. MIMIEN Mr. Mime for Abra)
const requested = Trade.getInGameTradeSpeciesInfo();
assert.ok(requested > 0, 'Requested species must be valid');

// Set up party with requested Pokemon
const offeredMon = createMon(requested, 10);
save.party = [offeredMon];
varSet(SV.x8005, 0); // Slot 0
assert.equal(Trade.getTradeSpecies(), requested, 'getTradeSpecies matches offered mon');

Trade.createInGameTradePokemon();
console.log('✓ Trade pokemon created successfully');

console.log('--- 3. Testing trade scene initialization and animation stepping ---');
Trade.CB2_InitInGameTrade();
assert.ok(gMain.state > 0, 'CB2_InitInGameTrade stepped state');

// Step through init states
for (let i = 0; i < 20; i++) {
  if (gMain.callback2) gMain.callback2();
  tasks.run();
}
console.log('✓ Trade scene main loop stepped cleanly without errors');

// Step through animation
for (let i = 0; i < 60; i++) {
  if (gMain.callback2) gMain.callback2();
  tasks.run();
}
console.log('✓ Trade animation sequence stepped successfully');

console.log('All trade scene tests passed!');
