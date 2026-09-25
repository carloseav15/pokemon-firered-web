// Headless test suite for fame_checker.c (fameChecker.ts)
// Run with: npm run check:famechecker

import './setupNodeGbaMock.ts';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as C from '../../src/fr/generated/constants.ts';
import { rom } from '../../src/fr/rom.ts';
import { sound } from '../../src/fr/audio/sound.ts';
import { loadTrig } from '../../src/fr/hw/trig.ts';
import { runHwFrame, SetMainCallback2, gMain } from '../../src/fr/hw/runtime.ts';
import { tasks } from '../../src/fr/gba/tasks.ts';
import { joy, START_BUTTON, B_BUTTON } from '../../src/fr/gba/input.ts';
import { gPaletteFade } from '../../src/fr/hw/palette.ts';
import { save, newSaveData, setSave, varSet, SV } from '../../src/fr/save.ts';
import {
  ResetFameChecker,
  FullyUnlockFameChecker,
  SetFlavorTextFlagFromSpecialVars,
  UseFameChecker,
  fameChecker,
  preloadFameCheckerAssets,
  sFameCheckerData,
  NUM_FAMECHECKER_PERSONS,
  FCPICKSTATE_NO_DRAW,
  FCPICKSTATE_SILHOUETTE,
  FCPICKSTATE_COLORED,
} from '../../src/fr/fameChecker.ts';

const root = process.cwd() + '/public';
(globalThis as any).fetch = async (url: string) => {
  let norm = String(url).replace(/^\/?/, '/');
  if (!norm.startsWith('/fr/')) norm = '/fr' + norm;
  const path = root + norm;
  if (!existsSync(path)) throw new Error(`fetch 404: ${url} -> ${path}`);
  const buf = readFileSync(path);
  return {
    ok: true,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    text: async () => buf.toString('utf8'),
  };
};

function frame(): void {
  joy.poll();
  runHwFrame();
}

async function initData() {
  const fr = root + '/fr/';
  rom.constants = JSON.parse(readFileSync(fr + 'constants.json', 'utf8'));
  rom.charmap = JSON.parse(readFileSync(fr + 'charmap.json', 'utf8'));
  rom.strings = JSON.parse(readFileSync(fr + 'data/strings.json', 'utf8'));
  rom.trainers = JSON.parse(readFileSync(fr + 'data/trainers.json', 'utf8'));
  sound.init(rom.constants);
  await loadTrig();
  await preloadFameCheckerAssets();
}

async function testFameCheckerDataState() {
  console.log('--- 1. Testing Fame Checker save state & flag operations ---');
  setSave(newSaveData('RED', 0, 'GREEN'));

  // Initial state: only Oak is colored, everyone else is NO_DRAW
  ResetFameChecker();
  const entries = fameChecker();
  assert.equal(entries.length, NUM_FAMECHECKER_PERSONS);
  assert.equal(entries[0].pickState, FCPICKSTATE_COLORED, 'Prof Oak starts unlocked');
  for (let i = 1; i < NUM_FAMECHECKER_PERSONS; i++) {
    assert.equal(entries[i].pickState, FCPICKSTATE_NO_DRAW, `Person ${i} starts NO_DRAW`);
  }
  console.log('✓ Initial Fame Checker state verified (Prof Oak available)');

  // Discover Brock via script special vars
  varSet(SV.x8004, 2); // FAMECHECKER_BROCK
  varSet(SV.x8005, 0); // flavor text flag 0
  SetFlavorTextFlagFromSpecialVars();
  assert.equal(entries[2].pickState, FCPICKSTATE_SILHOUETTE, 'Brock unlocked as silhouette');
  assert.equal(entries[2].flavorTextFlags, 1, 'Brock flavor text 0 recorded');
  console.log('✓ Special vars flavor text unlock (Brock silhouette + clue 0) verified');

  // Fully unlock all 16 persons
  FullyUnlockFameChecker();
  for (let i = 0; i < NUM_FAMECHECKER_PERSONS; i++) {
    assert.equal(entries[i].pickState, FCPICKSTATE_COLORED, `Person ${i} is fully colored`);
    assert.equal(entries[i].flavorTextFlags, 0x3f, `Person ${i} has all 6 flavor texts`);
  }
  console.log('✓ FullyUnlockFameChecker verified (all 16 persons & 6 clues each unlocked)');
}

async function testFameCheckerUI() {
  console.log('--- 2. Testing Fame Checker UI screen & state machine ---');
  let returnCallbackCalled = false;
  const onExit = () => {
    returnCallbackCalled = true;
  };

  UseFameChecker(onExit);
  assert.equal(sFameCheckerData.numUnlockedPersons, NUM_FAMECHECKER_PERSONS, 'All 16 persons populated in UI list');

  // Run frames through loading states until fade is complete
  for (let i = 0; i < 20; i++) {
    frame();
  }
  while (gPaletteFade.active) {
    frame();
  }
  frame(); // Transition from Task_WaitFadeOnInit to Task_TopMenuHandleInput
  assert.ok(!sFameCheckerData.inPickMode, 'Starts in list mode');

  // Press START to enter pick mode (photo / silhouette view)
  joy.press(START_BUTTON);
  frame();
  joy.release(START_BUTTON);
  for (let i = 0; i < 10; i++) frame();
  assert.ok(sFameCheckerData.inPickMode, 'Entered pick mode on START press');
  console.log('✓ Enter pick mode on START key verified');

  // Press B to exit pick mode
  joy.press(B_BUTTON);
  frame();
  joy.release(B_BUTTON);
  for (let i = 0; i < 10; i++) frame();
  assert.ok(!sFameCheckerData.inPickMode, 'Exited pick mode on B key');
  console.log('✓ Exit pick mode on B key verified');

  // Press B again to close Fame Checker and trigger return callback
  joy.press(B_BUTTON);
  frame();
  joy.release(B_BUTTON);
  for (let i = 0; i < 30; i++) frame();
  assert.ok(returnCallbackCalled, 'Exit callback invoked on closing Fame Checker');
  console.log('✓ Close Fame Checker & return callback verified');
}

async function main() {
  await initData();
  await testFameCheckerDataState();
  await testFameCheckerUI();
  console.log('\nAll Fame Checker checks passed successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
