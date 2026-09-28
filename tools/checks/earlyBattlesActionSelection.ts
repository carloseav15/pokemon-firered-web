// Headless check: a trainer battle against a hand-built rival party reaches
// action selection, and getWildBattleTransition picks SLICE / WHITE_BARS_FADE
// by level on a mock tall-grass overworld.
// Run with: npm run check:earlybattles
//
// What this does NOT verify: the Oak's Lab scripts, the rival trainer data
// (TRAINER_RIVAL_OAKS_LAB_*), winning, the post-battle heal, Route 1, the
// parcel or the Pokédex. Those were exercised in the browser (PORTING-STATUS.md,
// 2026-09-25). State set by hand is logged as PREPARED.

import './setupNodeGbaMock.ts';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as C from '../../src/fr/generated/constants.ts';
import { rom, type MapHeader } from '../../src/fr/rom.ts';
import { sound } from '../../src/fr/audio/sound.ts';
import { loadTrig } from '../../src/fr/hw/trig.ts';
import { runHwFrame, SetMainCallback2 } from '../../src/fr/hw/runtime.ts';
import { tasks } from '../../src/fr/gba/tasks.ts';
import { A_BUTTON, joy } from '../../src/fr/gba/input.ts';
import { preloadBattleAssets } from '../../src/fr/battle/preload.ts';
import { G, resetBattleStructs } from '../../src/fr/battle/globals.ts';
import { CB2_InitBattle } from '../../src/fr/battle/main_init.ts';
import { CopyMon, gEnemyParty, type Mon } from '../../src/fr/pokemon/mon.ts';
import { createMon, giveMonToPlayer } from '../../src/fr/pokemon/pokemon.ts';
import { save, newSaveData, setSave } from '../../src/fr/save.ts';
import { GetWildBattleTransition } from '../../src/fr/battle/transition.ts';
import type { Overworld } from '../../src/fr/field/overworld.ts';

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
  sound.frame();
}

async function initData() {
  const fr = root + '/fr/';
  rom.constants = JSON.parse(readFileSync(fr + 'constants.json', 'utf8'));
  rom.charmap = JSON.parse(readFileSync(fr + 'charmap.json', 'utf8'));
  rom.strings = JSON.parse(readFileSync(fr + 'data/strings.json', 'utf8'));
  rom.battleStrings = JSON.parse(readFileSync(fr + 'data/battle_strings.json', 'utf8'));
  const speciesRaw = JSON.parse(readFileSync(fr + 'data/species.json', 'utf8'));
  rom.species = speciesRaw.species;
  rom.pokedex = speciesRaw.pokedex;
  rom.expTables = speciesRaw.exp;

  const movesRaw = JSON.parse(readFileSync(fr + 'data/moves.json', 'utf8'));
  rom.moves = movesRaw.moves;
  rom.abilities = movesRaw.abilities;
  rom.natures = movesRaw.natures;
  rom.trainerClasses = movesRaw.trainerClasses;
  rom.types = movesRaw.types;
  rom.typeEffectiveness = movesRaw.typeEffectiveness;

  rom.trainers = JSON.parse(readFileSync(fr + 'data/trainers.json', 'utf8'));
  const itemsRaw = JSON.parse(readFileSync(fr + 'data/items.json', 'utf8'));
  rom.items = itemsRaw.items;
  rom.itemEffects = itemsRaw.effects;
  rom.fonts = JSON.parse(readFileSync(fr + 'gfx/fonts.json', 'utf8'));

  sound.init(rom.constants);
  await loadTrig();
  await preloadBattleAssets();
}

async function testRivalBattle() {
  console.log('--- 1. Trainer battle vs a hand-built rival party ---');
  setSave(newSaveData('RED', 0, 'GREEN'));

  // Player chooses Bulbasaur (L5)
  const starter = createMon(C.SPECIES_BULBASAUR, 5);
  giveMonToPlayer(starter);
  assert.equal(save.party.length, 1);
  assert.equal(save.party[0]!.species, C.SPECIES_BULBASAUR);
  assert.equal(save.party[0]!.level, 5);

  // Rival chooses Charmander (L5)
  resetBattleStructs();
  G.gBattleTypeFlags = C.BATTLE_TYPE_TRAINER;
  ZeroEnemyPartyMons();
  const rivalMon = createMon(C.SPECIES_CHARMANDER, 5);
  CopyMon(gEnemyParty[0], rivalMon as unknown as Mon);
  console.log('  PREPARED by hand: party Bulbasaur L5, enemy party Charmander L5 (no trainer id, no script)');

  SetMainCallback2(CB2_InitBattle);

  let frames = 0;
  // Run until action selection
  while (frames < 3000) {
    const ready = G.gBattleMainFunc?.name === 'HandleTurnActionSelectionState';
    if (ready && frames > 300) break;
    if (!ready && frames % 16 === 0) joy.press(A_BUTTON);
    frame();
    joy.release(A_BUTTON);
    frames++;
  }
  assert.ok(frames < 3000, 'Rival battle must reach action selection');
  console.log(`✓ Battle reached action selection after ${frames} frames`);

}

function ZeroEnemyPartyMons(): void {
  for (let i = 0; i < 6; i++) {
    gEnemyParty[i].species = 0;
    gEnemyParty[i].hp = 0;
    gEnemyParty[i].level = 0;
  }
}

async function testRoute1EncountersAndTransitions() {
  console.log('--- 2. Wild battle transition choice (mock tall-grass overworld) ---');

  const mockPlayerObj = { currentCoords: { x: 10, y: 15 } };
  const mockOw = {
    player: { object: mockPlayerObj },
    map: { behaviorAt: () => C.MB_TALL_GRASS },
    flashLevel: 0,
    header: { mapType: 0 } as MapHeader,
  } as unknown as Overworld;

  // Starter is Level 5
  assert.equal(save.party[0]!.level, 5);

  // Route 1 typical encounters: Pidgey L2, Rattata L2, Rattata L3, Pidgey L3
  const wildPidgeyL2 = [createMon(C.SPECIES_PIDGEY, 2)];
  const wildRattataL3 = [createMon(C.SPECIES_RATTATA, 3)];

  // Weaker enemy (< Level 5) -> B_TRANSITION_SLICE
  const trans1 = GetWildBattleTransition(mockOw, wildPidgeyL2);
  assert.equal(trans1, C.B_TRANSITION_SLICE, 'Weaker wild enemy (L2 vs L5) must trigger B_TRANSITION_SLICE');

  const trans2 = GetWildBattleTransition(mockOw, wildRattataL3);
  assert.equal(trans2, C.B_TRANSITION_SLICE, 'Weaker wild enemy (L3 vs L5) must trigger B_TRANSITION_SLICE');

  // Equal or stronger enemy (>= Level 5) -> B_TRANSITION_WHITE_BARS_FADE
  const strongWild = [createMon(C.SPECIES_PIDGEY, 5)];
  const trans3 = GetWildBattleTransition(mockOw, strongWild);
  assert.equal(trans3, C.B_TRANSITION_WHITE_BARS_FADE, 'Equal/stronger wild enemy (L5 vs L5) must trigger B_TRANSITION_WHITE_BARS_FADE');

  console.log('✓ Route 1 battle transitions (SLICE for weaker, WHITE_BARS_FADE for equal/stronger) verified');
}

async function main() {
  await initData();
  await testRivalBattle();
  await testRoute1EncountersAndTransitions();
  console.log('\nEarly trainer battle reaches action selection; wild transition choice matches GetWildBattleTransition.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
