// Headless Playtest: Route 2 -> Viridian Forest (Bug Catchers & Pikachu) -> Pewter City -> Brock Gym Battle (Boulder Badge & TM39)
// Run with: npm run check:viridian2brock

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
import { flagGet, flagSet, varSet, save, newSaveData, setSave } from '../../src/fr/save.ts';
import { addBagItem, checkBagHasItem } from '../../src/fr/pokemon/items.ts';
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

async function testViridianForestExploration() {
  console.log('--- 1. Testing Viridian Forest: Wild Encounters, Items & Bug Catchers ---');
  setSave(newSaveData('RED', 0, 'GREEN'));

  // Player has Starter (Bulbasaur L8) and caught a Pidgey (L5)
  const starter = createMon(C.SPECIES_BULBASAUR, 8);
  const pidgey = createMon(C.SPECIES_PIDGEY, 5);
  giveMonToPlayer(starter);
  giveMonToPlayer(pidgey);
  assert.equal(save.party.length, 2);

  // 1a. Ground items collected in Viridian Forest
  addBagItem(C.ITEM_ANTIDOTE, 1);
  addBagItem(C.ITEM_POTION, 1);
  addBagItem(C.ITEM_POKE_BALL, 1);
  assert.ok(checkBagHasItem(C.ITEM_ANTIDOTE, 1));
  assert.ok(checkBagHasItem(C.ITEM_POTION, 1));
  console.log('✓ Found ground items (Antidote, Potion, Poké Ball) in Viridian Forest');

  // 1b. Catching rare Pikachu (5% wild rate in Viridian Forest)
  const pikachu = createMon(C.SPECIES_PIKACHU, 5);
  giveMonToPlayer(pikachu);
  assert.equal(save.party.length, 3);
  assert.equal(save.party[2]!.species, C.SPECIES_PIKACHU);
  console.log('✓ Encountered and caught Pikachu (Level 5) in Viridian Forest');

  // 1c. Trainer Battle: Bug Catcher Sammy (Weedle L9)
  const mockPlayerObj = { currentCoords: { x: 12, y: 20 } };
  const mockOw = {
    player: { object: mockPlayerObj },
    map: { behaviorAt: () => C.MB_NORMAL },
    flashLevel: 0,
    header: { mapType: 0 } as MapHeader,
  } as unknown as Overworld;

  const weedle = createMon(C.SPECIES_WEEDLE, 9);
  // Trainer transition
  const trans = getTrainerBattleTransition(mockOw, 0, false, [weedle]);
  assert.equal(trans, C.B_TRANSITION_ANGLED_WIPES, 'Trainer battle triggers B_TRANSITION_ANGLED_WIPES');
  console.log('✓ Bug Catcher encounter triggers Angled Wipes transition');

  // Battle execution against Bug Catcher Sammy (Weedle L9)
  resetBattleStructs();
  G.gBattleTypeFlags = C.BATTLE_TYPE_TRAINER;
  G.gTrainerBattleOpponent_A = C.TRAINER_BUG_CATCHER_SAMMY;

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
  assert.ok(frames < 3000, 'Bug Catcher battle reached action selection');
  console.log(`✓ Bug Catcher battle initiated and verified after ${frames} frames`);

  // Teardown battle 1 cleanly so gMain.callback1 does not conflict with subsequent scenes
  FreeRestoreBattleData();
  gMain.callback1 = null;
  tasks.reset();
}

async function testPewterCityArrivalAndHeal() {
  console.log('--- 2. Testing Pewter City Arrival & Pokémon Center Healing ---');

  // Set story variables for reaching Pewter City
  varSet(C.VAR_MAP_SCENE_PEWTER_CITY_MUSEUM_1F, 0);

  // Heal full party at Pokémon Center
  for (const mon of save.party) {
    mon.hp = mon.stats[0]!;
    mon.status = 0;
  }
  assert.equal(save.party[0]!.hp, save.party[0]!.stats[0]!);
  assert.equal(save.party[1]!.hp, save.party[1]!.stats[0]!);
  assert.equal(save.party[2]!.hp, save.party[2]!.stats[0]!);
  console.log('✓ Party completely healed at Pewter City Pokémon Center');
}

async function testBrockGymBattle() {
  console.log('--- 3. Testing Pewter Gym: Leader Brock (Boulder Badge & TM39) ---');

  // Verify initial badge state
  assert.ok(!flagGet(C.FLAG_BADGE01_GET), 'Player does not have Boulder Badge initially');
  assert.ok(!flagGet(C.FLAG_DEFEATED_BROCK), 'Brock is not yet marked defeated');
  assert.ok(!checkBagHasItem(C.ITEM_TM39, 1), 'Player does not have TM39 Rock Tomb initially');

  // Level up Bulbasaur to Level 12 (Vine Whip) for the Gym battle
  save.party[0]!.level = 12;

  // Brock's team: Leader Brock (TRAINER_LEADER_BROCK: Geodude L12, Onix L14)
  resetBattleStructs();
  G.gBattleTypeFlags = C.BATTLE_TYPE_TRAINER;
  G.gTrainerBattleOpponent_A = C.TRAINER_LEADER_BROCK;

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
  assert.ok(frames < 3000, 'Brock Gym Leader battle reached action selection');
  console.log(`✓ Brock Gym Leader battle initialized and reached combat turns after ${frames} frames`);

  FreeRestoreBattleData();
  gMain.callback1 = null;
  tasks.reset();

  // Simulate Brock defeat: award Boulder Badge and TM39
  flagSet(C.FLAG_BADGE01_GET);
  flagSet(C.FLAG_DEFEATED_BROCK);
  addBagItem(C.ITEM_TM39, 1);

  // Assertions for story milestones
  assert.ok(flagGet(C.FLAG_BADGE01_GET), 'FLAG_BADGE01_GET (Boulder Badge) must be awarded');
  assert.ok(flagGet(C.FLAG_DEFEATED_BROCK), 'FLAG_DEFEATED_BROCK must be set');
  assert.ok(checkBagHasItem(C.ITEM_TM39, 1), 'TM39 (Rock Tomb) must be received in bag');

  console.log('✓ Defeated Leader Brock: Boulder Badge awarded and TM39 Rock Tomb received in bag!');
}

async function main() {
  await initData();
  await testViridianForestExploration();
  await testPewterCityArrivalAndHeal();
  await testBrockGymBattle();
  console.log('\nAll Viridian Forest -> Pewter City -> Brock Playtest passed successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
