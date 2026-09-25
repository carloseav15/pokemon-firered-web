// Headless check for Field Effects (fieldEffects.ts) and Battle Transitions (battle/transition.ts)
// Run with: npm run check:transitions

import './setupNodeGbaMock.ts';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as C from '../../src/fr/generated/constants.ts';
import { rom, type MapHeader } from '../../src/fr/rom.ts';
import { save } from '../../src/fr/save.ts';
import { loadFieldFx, FieldEffects } from '../../src/fr/field/fieldEffects.ts';
import { ObjectEvent, ObjectManager, DIR_SOUTH } from '../../src/fr/field/objectEvents.ts';
import { Overworld } from '../../src/fr/field/overworld.ts';
import type { FieldMap } from '../../src/fr/field/fieldmap.ts';
import {
  getWildBattleTransition,
  getTrainerBattleTransition,
  BattleTransitionScene,
} from '../../src/fr/battle/transition.ts';
import { createMon, type Pokemon } from '../../src/fr/pokemon/pokemon.ts';
import { SpriteManager } from '../../src/fr/gba/sprite.ts';

const root = process.cwd() + '/public';
(globalThis as any).fetch = async (url: string) => {
  let norm = String(url).replace(/^\/?/, '/');
  if (!norm.startsWith('/fr/')) norm = '/fr' + norm;
  const path = root + norm;
  if (!existsSync(path)) {
    throw new Error(`fetch 404: ${url} -> ${path}`);
  }
  const buf = readFileSync(path);
  return {
    ok: true,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    text: async () => buf.toString('utf8'),
  };
};

console.log('--- 1. Testing fieldfx.json data integrity ---');
rom.objects = JSON.parse(readFileSync(process.cwd() + '/public/fr/objects.json', 'utf8'));
const fieldfxRaw = JSON.parse(readFileSync(process.cwd() + '/public/fr/fieldfx.json', 'utf8'));
assert.ok(fieldfxRaw.templates, 'fieldfx.json must have templates');
assert.ok(fieldfxRaw.templates.TallGrass, 'TallGrass template must exist');
assert.ok(fieldfxRaw.templates.ShadowSmall, 'ShadowSmall template must exist');
assert.ok(fieldfxRaw.templates.ShadowMedium, 'ShadowMedium template must exist');
assert.ok(fieldfxRaw.templates.GroundImpactDust, 'GroundImpactDust template must exist');
assert.ok(fieldfxRaw.templates.JumpTallGrass, 'JumpTallGrass template must exist');
assert.ok(existsSync(process.cwd() + '/public/fr/' + fieldfxRaw.emoticons.file), 'Emoticon spritesheet must exist');
console.log('✓ fieldfx.json templates and assets verified');

async function testFieldEffects() {
  console.log('--- 2. Testing FieldEffects class & ground effect spawning ---');
  await loadFieldFx();

  // Mock minimal Overworld environment
  const mockSprites = new SpriteManager();
  const mockMap = {
    behaviorAt: (x: number, y: number) => {
      if (x === 10 && y === 10) return C.MB_TALL_GRASS;
      return C.MB_NORMAL;
    },
  } as unknown as FieldMap;

  const mockGame = {
    fieldEffectArguments: [0, 0, 0, 0],
    weather: { renderFog: () => {} },
  };

  const mockOw = {
    sprites: mockSprites,
    map: mockMap,
    game: mockGame,
    flashLevel: 0,
    header: { mapType: 0 } as MapHeader,
  } as unknown as Overworld;

  const fe = new FieldEffects(mockOw);

  // Create mock ObjectEvent
  const obj = new ObjectEvent(mockOw.objects ?? ({} as ObjectManager));
  obj.active = true;
  obj.isPlayer = true;
  obj.currentCoords = { x: 10, y: 10 };
  obj.previousCoords = { x: 10, y: 11 };
  obj.currentMetatileBehavior = C.MB_TALL_GRASS;
  obj.previousMetatileBehavior = C.MB_NORMAL;
  obj.movementDirection = DIR_SOUTH;
  obj.sprite.priority = 2;
  obj.sprite.subpriority = 10;

  // 2a. Step into tall grass ("begin")
  fe.groundEffect(obj, "begin");
  assert.equal(mockSprites.sprites.length, 1, 'Tall grass sprite must be spawned on begin in tall grass');
  const grassSprite = mockSprites.sprites[0]!;
  assert.equal(grassSprite.priority, 2, 'Grass sprite priority matches object');
  assert.equal(grassSprite.subpriority, 9, 'Grass sprite subpriority is object.subpriority - 1 (in front of feet)');

  // 2b. Object jumping (spawn shadow)
  mockSprites.sprites.length = 0;
  obj.currentMetatileBehavior = C.MB_NORMAL;
  obj.landingJump = true;
  fe.groundEffect(obj, "begin");
  assert.equal(mockSprites.sprites.length, 1, 'Shadow sprite must be spawned during jump');
  const shadowSprite = mockSprites.sprites[0]!;
  assert.equal(shadowSprite.subpriority, 11, 'Shadow sprite subpriority is object.subpriority + 1 (under feet)');

  // 2c. Jump landing ("finish") in tall grass vs normal ground
  mockSprites.sprites.length = 0;
  obj.currentMetatileBehavior = C.MB_NORMAL;
  obj.landingJump = true;
  fe.groundEffect(obj, "finish");
  assert.equal(mockSprites.sprites.length, 1, 'Landing dust must be spawned on normal ground landing');

  mockSprites.sprites.length = 0;
  obj.currentMetatileBehavior = C.MB_TALL_GRASS;
  obj.landingJump = true;
  fe.groundEffect(obj, "finish");
  assert.equal(mockSprites.sprites.length, 1, 'JumpTallGrass must be spawned on tall grass landing');

  console.log('✓ FieldEffects ground effects (tall grass, shadow, landing dust) verified');
}

async function testBattleTransitions() {
  console.log('--- 3. Testing Battle Transitions (selection & execution) ---');

  // Load minimal rom constants and data
  rom.constants = JSON.parse(readFileSync(process.cwd() + '/public/fr/constants.json', 'utf8'));
  rom.trainers = [];

  // Setup party in save: level 5 starter (Pikachu / Bulbasaur)
  save.party = [
    {
      species: 1,
      level: 5,
      hp: 20,
      isEgg: false,
    } as unknown as Pokemon,
  ];

  const mockPlayerObj = {
    currentCoords: { x: 5, y: 5 },
  };

  const normalMapOw = {
    player: { object: mockPlayerObj },
    map: { behaviorAt: () => C.MB_NORMAL },
    flashLevel: 0,
    header: { mapType: 0 } as MapHeader,
  } as unknown as Overworld;

  const caveMapOw = {
    player: { object: mockPlayerObj },
    map: { behaviorAt: () => C.MB_NORMAL },
    flashLevel: 0,
    header: { mapType: 4 /* MAP_TYPE_UNDERGROUND */ } as MapHeader,
  } as unknown as Overworld;

  // 3a. Wild battle transition selection
  const weakWild = [{ level: 3, hp: 10, isEgg: false } as unknown as Pokemon];
  const strongWild = [{ level: 6, hp: 25, isEgg: false } as unknown as Pokemon];

  const weakTrans = getWildBattleTransition(normalMapOw, weakWild);
  assert.equal(weakTrans, C.B_TRANSITION_SLICE, 'Wild battle against weaker enemy on normal map must use B_TRANSITION_SLICE');

  const strongTrans = getWildBattleTransition(normalMapOw, strongWild);
  assert.equal(strongTrans, C.B_TRANSITION_WHITE_BARS_FADE, 'Wild battle against stronger enemy on normal map must use B_TRANSITION_WHITE_BARS_FADE');

  const caveTrans = getWildBattleTransition(caveMapOw, weakWild);
  assert.equal(caveTrans, C.B_TRANSITION_CLOCKWISE_WIPE, 'Wild battle in cave must use B_TRANSITION_CLOCKWISE_WIPE');

  console.log('✓ Battle transition table selection verified');

  // 3b. Execution of B_TRANSITION_SLICE
  const mockCanvas = {
    width: 240,
    height: 160,
    getContext: () => ({
      fillStyle: '',
      fillRect: () => {},
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      globalAlpha: 1,
    }),
  } as unknown as HTMLCanvasElement;

  if (typeof (globalThis as any).document === 'undefined') {
    (globalThis as any).document = {
      createElement: (tag: string) => mockCanvas,
    };
  }

  const mockCtx = {
    canvas: mockCanvas,
    fillStyle: '',
    fillRect: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;

  let sliceDone = false;
  const sliceScene = new BattleTransitionScene(C.B_TRANSITION_SLICE, mockCtx, () => {
    sliceDone = true;
  });

  // Tick until complete (should take ~80-120 frames)
  for (let frame = 0; frame < 200 && !sliceDone; frame++) {
    sliceScene.update();
  }
  assert.ok(sliceDone, 'B_TRANSITION_SLICE must finish cleanly within frame budget');
  console.log('✓ B_TRANSITION_SLICE execution verified');

  // 3c. Execution of B_TRANSITION_WHITE_BARS_FADE
  let whiteBarsDone = false;
  const whiteBarsScene = new BattleTransitionScene(C.B_TRANSITION_WHITE_BARS_FADE, mockCtx, () => {
    whiteBarsDone = true;
  });

  for (let frame = 0; frame < 200 && !whiteBarsDone; frame++) {
    whiteBarsScene.update();
  }
  assert.ok(whiteBarsDone, 'B_TRANSITION_WHITE_BARS_FADE must finish cleanly within frame budget');
  console.log('✓ B_TRANSITION_WHITE_BARS_FADE execution verified');

  // 3d. Execution of B_TRANSITION_CLOCKWISE_WIPE
  let clockwiseDone = false;
  const clockwiseScene = new BattleTransitionScene(C.B_TRANSITION_CLOCKWISE_WIPE, mockCtx, () => {
    clockwiseDone = true;
  });

  for (let frame = 0; frame < 300 && !clockwiseDone; frame++) {
    clockwiseScene.update();
  }
  assert.ok(clockwiseDone, 'B_TRANSITION_CLOCKWISE_WIPE must finish cleanly');
  console.log('✓ B_TRANSITION_CLOCKWISE_WIPE execution verified');

  // 3e. Execution of B_TRANSITION_ANGLED_WIPES
  let angledDone = false;
  const angledScene = new BattleTransitionScene(C.B_TRANSITION_ANGLED_WIPES, mockCtx, () => {
    angledDone = true;
  });

  for (let frame = 0; frame < 300 && !angledDone; frame++) {
    angledScene.update();
  }
  assert.ok(angledDone, 'B_TRANSITION_ANGLED_WIPES must finish cleanly');
  console.log('✓ B_TRANSITION_ANGLED_WIPES execution verified');
}

async function main() {
  await testFieldEffects();
  await testBattleTransitions();
  console.log('\nAll Field Effects and Battle Transitions tests passed successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
