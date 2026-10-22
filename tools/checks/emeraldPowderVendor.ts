// Reuses hoennCircuit's DOM/RAF/data harness (--powder): the Slateport Berry Powder vendor through the VM
// (SlateportCity_EventScript_ReceivedPowderJar): HasEnoughBerryPowder, DisplayBerryPowderVendorMenu, ShowScrollableMultichoice
// (the scrolling list), the item exchange (TakeBerryPowder, PrintPlayerBerryPowderAmount, giveitem) and RemoveBerryPowderVendorMenu.
// PREPARED: 200 powder, FLAG_RECEIVED_POWDER_JAR and the key presses (DOWN to the second item, A, YES, then B out of the list).
import assert from 'node:assert/strict';
import { checkBagHasItem } from '../../src/core/pokemon/items.ts';
import { flagSet, save } from '../../src/games/firered/save.ts';
import { A_BUTTON, B_BUTTON, DPAD_DOWN } from '../../src/core/gba/input.ts';
import { tasks } from '../../src/core/gba/tasks.ts';
import * as EM from '../../src/games/emerald/generated/constants.ts';
import type { EngineInteraction } from '../../src/viewer/engineInteraction.ts';
import type { NavigationSave } from '../../src/viewer/session.ts';
type Pump = (frames: number, input?: (frame: number) => number, done?: () => boolean) => Promise<number>;

export async function runPowderChecks(engine: EngineInteraction, pump: Pump): Promise<void> {
  const nav: NavigationSave = { mapId: 'MAP_SLATEPORT_CITY', x: 20, y: 20, direction: 'north', dynamic: null };
  await engine.enterMap(nav);
  save.berryPowder = 200; // PREPARED
  flagSet(EM.FLAG_RECEIVED_POWDER_JAR); // PREPARED: the jar was given by the first conversation
  assert.equal(checkBagHasItem(EM.ITEM_ENERGY_ROOT, 1), false);
  assert.equal(await engine.triggerScript(nav, 'SlateportCity_EventScript_ReceivedPowderJar'), true);
  const seen = new Set<string>();
  let lists = 0, wasInList = false, listFrame = 0, powderAfterPurchase = -1;
  await pump(8000, f => {
    const active = tasks.tasks.filter(t => t.isActive).map(t => t.func.name);
    active.forEach(n => seen.add(n));
    const inList = active.includes('ScrollableMultichoice_ProcessInput');
    if (inList && !wasInList) { lists++; listFrame = 0; }
    wasInList = inList;
    if (inList) {
      listFrame++;
      if (lists === 1) { // first visit: DOWN to ENERGY ROOT (80), then A
        if (listFrame === 6) return DPAD_DOWN;
        return listFrame === 20 ? A_BUTTON : 0;
      }
      if (powderAfterPurchase < 0) powderAfterPurchase = save.berryPowder!;
      return listFrame === 12 ? B_BUTTON : 0; // second visit (the script returns to the list): cancel
    }
    return f % 24 === 12 ? A_BUTTON : 0; // messages and the YES/NO answers (the cursor starts on YES)
  }, () => !engine.open);
  assert.equal(engine.open, false, `the vendor script finished (tasks seen: ${[...seen].join(', ')})`);
  assert.ok(seen.has('ScrollableMultichoice_ProcessInput'), 'ShowScrollableMultichoice ran its list task');
  assert.equal(lists, 2, 'the list opened for the purchase and again after "trade something else?" ... or the answer returned to it');
  assert.equal(powderAfterPurchase, 200 - 80, 'TakeBerryPowder took the 80 powder of ENERGY ROOT before the second visit');
  assert.equal(checkBagHasItem(EM.ITEM_ENERGY_ROOT, 1), true, 'giveitem ITEM_ENERGY_ROOT');
  assert.equal(save.berryPowder, 120);
  console.log(`check:emerald-powder-vendor PASS: ReceivedPowderJar → list (${[...seen].filter(n => /Scrollable/.test(n)).join(', ')}) → ENERGY ROOT for 80 powder → list again → cancel; PREPARED powder/flag/keys`);
}
