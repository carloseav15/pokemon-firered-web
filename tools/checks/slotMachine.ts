// Headless check for slot_machine.c port (menus/slotMachine.ts)
// Run with: npx tsx tools/checks/slotMachine.ts

import './setupNodeGbaMock.ts';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerCData, registerIncbinIndex, registerPack } from '../../src/fr/hw/assets.ts';
import { rom } from '../../src/fr/rom.ts';
import * as SlotMachine from '../../src/fr/menus/slotMachine.ts';
import { gMain } from '../../src/fr/hw/runtime.ts';
import { tasks } from '../../src/fr/gba/tasks.ts';
import { save } from '../../src/fr/save.ts';

const root = process.cwd() + '/public/fr/';

console.log('--- 1. Testing slot_machine cdata & incbin assets ---');
const slotMachineCData = JSON.parse(readFileSync(root + 'cdata/slot_machine.json', 'utf8'));
registerCData('slot_machine', slotMachineCData.defs);
assert.ok(slotMachineCData.defs.sBgTemplates, 'sBgTemplates must exist in cdata');
assert.ok(slotMachineCData.defs.sWindowTemplates, 'sWindowTemplates must exist in cdata');
assert.ok(slotMachineCData.defs.sReelBiasChances, 'sReelBiasChances must exist in cdata');
assert.ok(slotMachineCData.defs.sReelIconAnimByReelAndPos, 'sReelIconAnimByReelAndPos must exist in cdata');
assert.ok(slotMachineCData.defs.sPayoutTable, 'sPayoutTable must exist in cdata');
assert.ok(slotMachineCData.defs.sReelIconPaletteTags, 'sReelIconPaletteTags must exist in cdata');
assert.ok(slotMachineCData.defs.sReelIconAffineParams, 'sReelIconAffineParams must exist in cdata');
assert.ok(slotMachineCData.defs.sReelIconBldY, 'sReelIconBldY must exist in cdata');

const trigCData = JSON.parse(readFileSync(root + 'cdata/trig.json', 'utf8'));
registerCData('trig', trigCData.defs);

const textWinCData = JSON.parse(readFileSync(root + 'cdata/text_window_graphics.json', 'utf8'));
registerCData('text_window_graphics', textWinCData.defs);

// SlotsTask_GraphicsInit prints via the text printer tables.
const textCData = JSON.parse(readFileSync(root + 'cdata/text.json', 'utf8'));
registerCData('text', textCData.defs);
const textPrinterCData = JSON.parse(readFileSync(root + 'cdata/text_printer.json', 'utf8'));
registerCData('text_printer', textPrinterCData.defs);

const stringsJson = JSON.parse(readFileSync(root + 'data/strings.json', 'utf8'));
(rom as any).strings = stringsJson;
(rom as any).fonts = JSON.parse(readFileSync(root + 'gfx/fonts.json', 'utf8'));


const incbinIndex = JSON.parse(readFileSync(root + 'incbin/index.json', 'utf8'));
registerIncbinIndex(incbinIndex);

const packBuf = readFileSync(root + 'incbin/graphics_slot_machine.bin');
registerPack('graphics_slot_machine', new Uint8Array(packBuf.buffer, packBuf.byteOffset, packBuf.byteLength));

const textWinBuf = readFileSync(root + 'incbin/graphics_text_window.bin');
registerPack('graphics_text_window', new Uint8Array(textWinBuf.buffer, textWinBuf.byteOffset, textWinBuf.byteLength));

// Text printing needs the font glyphs.
for (const pack of ['graphics_fonts', 'graphics_interface']) {
  const buf = readFileSync(root + `incbin/${pack}.bin`);
  registerPack(pack, new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
}


assert.ok(incbinIndex.symbols['slot_machine.c:sBg_Tiles'], 'sBg_Tiles in incbin');
assert.ok(incbinIndex.symbols['slot_machine.c:sBg_Tilemap'], 'sBg_Tilemap in incbin');
assert.ok(incbinIndex.symbols['slot_machine.c:sBg_Pal'], 'sBg_Pal in incbin');
assert.ok(incbinIndex.symbols['slot_machine.c:sReelIcons_Tiles'], 'sReelIcons_Tiles in incbin');
assert.ok(incbinIndex.symbols['slot_machine.c:sClefairy_Tiles'], 'sClefairy_Tiles in incbin');
assert.ok(incbinIndex.symbols['slot_machine.c:sDigits_Tiles'], 'sDigits_Tiles in incbin');
console.log('✓ slot_machine cdata and incbin assets validated');

console.log('--- 2. Testing slot machine launch and lifecycle ---');
save.coins = 50;
let closed = false;
SlotMachine.PlaySlotMachine(0, () => {
  closed = true;
});

assert.ok(gMain.callback2, 'gMain.callback2 must be initialized');

// Run frame tasks for initialization
for (let frame = 0; frame < 10; frame++) {
  gMain.callback2();
}

console.log('✓ Slot machine initialized and frames stepped');

console.log('--- 3. Testing slot machine constants and exports ---');
assert.equal(SlotMachine.ICON_7, 0);
assert.equal(SlotMachine.ICON_ROCKET, 1);
assert.equal(SlotMachine.ICON_PIKACHU, 2);
assert.equal(SlotMachine.ICON_PSYDUCK, 3);
assert.equal(SlotMachine.ICON_CHERRIES, 4);
assert.equal(SlotMachine.ICON_MAGNEMITE, 5);
assert.equal(SlotMachine.ICON_SHELLDER, 6);

assert.equal(SlotMachine.PAYOUT_NONE, 0);
assert.equal(SlotMachine.PAYOUT_CHERRIES2, 1);
assert.equal(SlotMachine.PAYOUT_CHERRIES3, 2);
assert.equal(SlotMachine.PAYOUT_MAGSHELL, 3);
assert.equal(SlotMachine.PAYOUT_PIKAPSY, 4);
assert.equal(SlotMachine.PAYOUT_ROCKET, 5);
assert.equal(SlotMachine.PAYOUT_7, 6);

console.log('✓ Slot machine icons and payouts verified');
console.log('All slot machine checks passed successfully!');

