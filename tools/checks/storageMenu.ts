// Headless check for pokemon_storage_system_menu.c port (storageMenu.ts)
// Run with: npm run check:storage

import './setupNodeGbaMock.ts';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerCData } from '../../src/fr/hw/assets.ts';
import { save } from '../../src/fr/save.ts';
import { rom } from '../../src/fr/rom.ts';
import * as StorageMenu from '../../src/fr/menus/storageMenu.ts';

const root = process.cwd() + '/public/fr/';
rom.charmap = JSON.parse(readFileSync(root + 'charmap.json', 'utf8'));
rom.strings = JSON.parse(readFileSync(root + 'data/strings.json', 'utf8'));

console.log('--- 1. Testing pokemon_storage_system_menu cdata ---');
const storageCData = JSON.parse(readFileSync(root + 'cdata/pokemon_storage_system_menu.json', 'utf8'));
registerCData('pokemon_storage_system_menu', storageCData.defs);
assert.ok(storageCData.defs.sMainMenuTexts, 'sMainMenuTexts must exist in cdata');
assert.ok(storageCData.defs.sWindowTemplate_MainMenu, 'sWindowTemplate_MainMenu must exist in cdata');
assert.ok(storageCData.defs.sAnims_ChooseBoxMenu, 'sAnims_ChooseBoxMenu must exist in cdata');
console.log('✓ cdata definitions verified');

console.log('--- 2. Testing exported C functions presence & signatures ---');
const expectedFns = [
  'DrawTextWindowAndBufferTiles',
  'PrintStringToBufferCopyNow',
  'CountMonsInBox',
  'GetFirstFreeBoxSpot',
  'CountPartyNonEggMons',
  'CountPartyAliveNonEggMonsExcept',
  'CountPartyAliveNonEggMons_IgnoreVar0x8004Slot',
  'CountPartyMons',
  'StringCopyAndFillWithSpaces',
  'UnusedWriteRectCpu',
  'UnusedWriteRectDma',
  'Task_PCMainMenu',
  'ShowPokemonStorageSystemPC',
  'FieldTask_ReturnToPcMenu',
  'CreatePCMainMenu',
  'CB2_ExitPokeStorage',
  'ResetPokemonStorageSystem',
  'LoadChooseBoxMenuGfx',
  'FreeBoxSelectionPopupSpriteGfx',
  'CreateChooseBoxMenuSprites',
  'DestroyChooseBoxMenuSprites',
  'HandleBoxChooseSelectionInput',
];

for (const fnName of expectedFns) {
  assert.equal(typeof (StorageMenu as any)[fnName], 'function', `Function ${fnName} must be exported in storageMenu.ts`);
}
console.log(`✓ All ${expectedFns.length} exported functions present`);

console.log('--- 3. Testing party and box counting functions ---');
StorageMenu.ResetPokemonStorageSystem();
assert.equal(save.boxes.length, StorageMenu.TOTAL_BOXES_COUNT);
assert.equal(StorageMenu.CountMonsInBox(0), 0, 'New box should have 0 mons');
assert.equal(StorageMenu.GetFirstFreeBoxSpot(0), 0, 'First free spot should be 0');

// Fill box spot 0 with mock mon
save.boxes[0][0] = { species: 1, level: 5, nickname: [0xbb, 0xff] };
assert.equal(StorageMenu.CountMonsInBox(0), 1);
assert.equal(StorageMenu.GetFirstFreeBoxSpot(0), 1);

// Test party counting
save.party = [
  { species: 1, hp: 20, isEgg: false } as any,
  { species: 4, hp: 0, isEgg: false } as any,
  { species: 7, hp: 20, isEgg: true } as any,
  null as any,
  null as any,
  null as any,
];
assert.equal(StorageMenu.CountPartyMons(), 3, 'CountPartyMons counts all 3 present');
assert.equal(StorageMenu.CountPartyNonEggMons(), 2, 'CountPartyNonEggMons excludes egg');
assert.equal(StorageMenu.CountPartyAliveNonEggMonsExcept(0), 0, 'Slot 0 ignored, slot 1 fainted, slot 2 is egg -> 0 alive');
console.log('✓ Counting functions verified');

console.log('--- storageMenu check passed successfully! ---');
