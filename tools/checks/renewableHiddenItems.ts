// Headless check for renewable hidden items parity
// Run with: npx esbuild tools/checks/renewableHiddenItems.ts --bundle --platform=node --format=esm --log-level=warning --outfile=.decomp-build/checks/renewableHiddenItems.mjs && node .decomp-build/checks/renewableHiddenItems.mjs

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerCData } from '../../src/fr/hw/assets.ts';
import * as C from '../../src/fr/generated/constants.ts';
import { flagClear, flagGet, flagSet, varGet, varSet } from '../../src/fr/save.ts';
import {
  IncrementRenewableHiddenItemStepCounter,
  TryRegenerateRenewableHiddenItems,
  SetAllRenewableItemFlags,
  type RenewableHiddenItemData,
} from '../../src/fr/renewableHiddenItems.ts';

const root = process.cwd() + '/public/fr/';
const cdataRaw = JSON.parse(readFileSync(root + 'cdata/renewable_hidden_items.json', 'utf8'));
registerCData('renewable_hidden_items', cdataRaw.defs);

const items: RenewableHiddenItemData[] = cdataRaw.defs.sRenewableHiddenItems.value;
assert.equal(items.length, 15, 'sRenewableHiddenItems must have 15 map entries');

// 1. Check step counter behavior
varSet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER, 0); // PREPARED: counter starts at 0; the code under test increments it
for (let i = 0; i < 1499; i++) {
  IncrementRenewableHiddenItemStepCounter();
}
assert.equal(varGet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER), 1499, 'counter should be 1499');

IncrementRenewableHiddenItemStepCounter();
assert.equal(varGet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER), 1500, 'counter should be capped at 1500');

IncrementRenewableHiddenItemStepCounter();
assert.equal(varGet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER), 1500, 'counter should not exceed 1500');

// 2. Check regeneration on an unlisted map (should NOT regenerate)
TryRegenerateRenewableHiddenItems(99, 99);
assert.equal(varGet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER), 1500, 'unlisted map must not reset step counter');

// 3. Check SetAllRenewableItemFlags
// First clear all flags
for (const entry of items) {
  for (const id of [...entry.rare, ...entry.uncommon, ...entry.common]) {
    if (id !== 0xff) flagClear(C.FLAG_HIDDEN_ITEMS_START + id);
  }
}
SetAllRenewableItemFlags();
for (const entry of items) {
  for (const id of [...entry.rare, ...entry.uncommon, ...entry.common]) {
    if (id !== 0xff) {
      assert.equal(flagGet(C.FLAG_HIDDEN_ITEMS_START + id), true, `flag for item ${id} must be set`);
    }
  }
}

// 4. Check TryRegenerateRenewableHiddenItems on a valid map (Route 20: group 3, num 38)
assert.equal(varGet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER), 1500);
TryRegenerateRenewableHiddenItems(3, 38);
assert.equal(varGet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER), 0, 'counter must reset to 0 after regeneration');

// Running again with counter < 1500 should not regenerate
varSet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER, 100); // PREPARED: below the 1500 threshold
TryRegenerateRenewableHiddenItems(3, 38);
assert.equal(varGet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER), 100, 'counter < 1500 must not trigger regeneration');

// 5. Run multiple regeneration cycles to verify tiers and random sampling
let rareSampled = 0;
let uncommonSampled = 0;
let commonSampled = 0;

// Resort Gorgeous (group 1, num 109) has rare, uncommon and common items:
const resortGorgeous = items.find(e => e.mapGroup === 1 && e.mapNum === 109)!;
assert.ok(resortGorgeous);

for (let cycle = 0; cycle < 1000; cycle++) {
  varSet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER, 1500); // PREPARED: at the threshold
  TryRegenerateRenewableHiddenItems(1, 109);
  assert.equal(varGet(C.VAR_RENEWABLE_ITEM_STEP_COUNTER), 0);

  // Check which tier was cleared on Resort Gorgeous:
  // Item 90 is only in common
  // Item 91 is in rare and uncommon
  // Item 98 is in common
  // Item 102 is in rare
  const commonCleared = !flagGet(C.FLAG_HIDDEN_ITEMS_START + 90);
  const rareCleared = !flagGet(C.FLAG_HIDDEN_ITEMS_START + 102);

  if (commonCleared) commonSampled++;
  else if (rareCleared) rareSampled++;
  else uncommonSampled++;
}

// In C:
// rval >= 90 (10%): rare
// rval >= 60 (30%): uncommon
// else (60%): common
assert.ok(commonSampled > 450, `Common should be ~60% (got ${commonSampled}/1000)`);
assert.ok(uncommonSampled > 200, `Uncommon should be ~30% (got ${uncommonSampled}/1000)`);
assert.ok(rareSampled > 50, `Rare should be ~10% (got ${rareSampled}/1000)`);

console.log(`PASS: renewable hidden items verified (15 maps, step counter capping, flag sets/resets, 1000 regeneration cycles sampled: ${commonSampled} common, ${uncommonSampled} uncommon, ${rareSampled} rare).`);
