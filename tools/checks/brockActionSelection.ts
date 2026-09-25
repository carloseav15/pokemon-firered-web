// Headless check: the Bug Catcher Sammy and Leader Brock battles reach action
// selection (HandleTurnActionSelectionState), and the trainer transition picked
// for a normal-terrain map is ANGLED_WIPES.
// Run with: npm run check:brock-action
//
// What this does NOT verify: walking Viridian Forest, items, captures, the
// Pokémon Center, winning against Brock, the Boulder Badge or TM39. The party
// is built by hand (logged below as PREPARED) and no script runs; the battles
// are started directly with CB2_InitBattle and stopped at the first menu.

import './setupNodeGbaMock.ts';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as C from '../../src/fr/generated/constants.ts';
import { rom, type MapHeader } from '../../src/fr/rom.ts';
import { sound } from '../../src/fr/audio/sound.ts';
import { loadTrig } from '../../src/fr/hw/trig.ts';
import { runHwFrame, SetMainCallback2, gMain } from '../../src/fr/hw/runtime.ts';
import { tasks } from '../../src/fr/gba/tasks.ts';
import { A_BUTTON, joy } from '../../src/fr/gba/input.ts';
import { preloadBattleAssets } from '../../src/fr/battle/preload.ts';
import { G, resetBattleStructs } from '../../src/fr/battle/globals.ts';
import { CB2_InitBattle, FreeRestoreBattleData } from '../../src/fr/battle/main_init.ts';
import { createMon, giveMonToPlayer } from '../../src/fr/pokemon/pokemon.ts';
import { save, newSaveData, setSave } from '../../src/fr/save.ts';
import { getTrainerBattleTransition } from '../../src/fr/battle/transition.ts';
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

function reachActionSelection(label: string): number {
  tasks.reset();
  gMain.state = 0;
  SetMainCallback2(CB2_InitBattle);
  let frames = 0;
  while (frames < 3000) {
    const ready = G.gBattleMainFunc?.name === 'HandleTurnActionSelectionState';
    if (ready && frames > 300) break;
    if (!ready && frames % 16 === 0) joy.press(A_BUTTON);
    frame();
    joy.release(A_BUTTON);
    frames++;
  }
  assert.ok(frames < 3000, `${label} battle reached action selection`);
  // Teardown so gMain.callback1 does not leak into the next battle.
  FreeRestoreBattleData();
  gMain.callback1 = null;
  tasks.reset();
  return frames;
}

async function testBugCatcherSammy() {
  console.log('--- 1. Bug Catcher Sammy (Viridian Forest trainer) ---');
  setSave(newSaveData('RED', 0, 'GREEN'));
  giveMonToPlayer(createMon(C.SPECIES_BULBASAUR, 8));
  giveMonToPlayer(createMon(C.SPECIES_PIDGEY, 5));
  assert.equal(save.party.length, 2);
  console.log('  PREPARED by hand: party Bulbasaur L8 + Pidgey L5 (no route was played)');

  const mockOw = {
    player: { object: { currentCoords: { x: 12, y: 20 } } },
    map: { behaviorAt: () => C.MB_NORMAL },
    flashLevel: 0,
    header: { mapType: 0 } as MapHeader,
  } as unknown as Overworld;
  const trans = getTrainerBattleTransition(mockOw, C.TRAINER_BUG_CATCHER_SAMMY, false, [createMon(C.SPECIES_WEEDLE, 9)]);
  assert.equal(trans, C.B_TRANSITION_ANGLED_WIPES, 'Trainer battle on normal terrain, enemy not weaker -> ANGLED_WIPES');
  console.log('✓ getTrainerBattleTransition picks ANGLED_WIPES (mock overworld, normal terrain)');

  resetBattleStructs();
  G.gBattleTypeFlags = C.BATTLE_TYPE_TRAINER;
  G.gTrainerBattleOpponent_A = C.TRAINER_BUG_CATCHER_SAMMY;
  const frames = reachActionSelection('Bug Catcher Sammy');
  console.log(`✓ Bug Catcher Sammy battle reached action selection after ${frames} frames`);
}

async function testBrockActionSelection() {
  console.log('--- 2. Leader Brock (Pewter Gym) ---');
  setSave(newSaveData('RED', 0, 'GREEN'));
  giveMonToPlayer(createMon(C.SPECIES_BULBASAUR, 12));
  console.log('  PREPARED by hand: party Bulbasaur L12 (no levelling was played)');

  resetBattleStructs();
  G.gBattleTypeFlags = C.BATTLE_TYPE_TRAINER;
  G.gTrainerBattleOpponent_A = C.TRAINER_LEADER_BROCK;
  const frames = reachActionSelection('Leader Brock');
  console.log(`✓ Leader Brock battle reached action selection after ${frames} frames`);
  console.log('  NOT verified here: winning the battle, FLAG_BADGE01_GET, FLAG_DEFEATED_BROCK, ITEM_TM39');
}

async function main() {
  await initData();
  await testBugCatcherSammy();
  await testBrockActionSelection();
  console.log('\nBug Catcher Sammy and Leader Brock battles reach action selection.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
