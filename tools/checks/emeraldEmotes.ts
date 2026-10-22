// Reuses hoennCircuit's DOM/RAF/data harness (--emotes): the Emerald emotion icons of trainer_see.c on the engine's real field
// effects: the exclamation and question pictures (shared movement actions) and the heart (regional MOVEMENT_ACTION_EMOTE_HEART)
// read the three pictures of the Emerald export (fieldfx.json `emotions`), rise with SpriteCB_TrainerIcons and last the 60 frames of
// sSpriteAnim_Icons1/2; the movement action itself runs through the regional table. PREPARED: the player object as the emoting object.
import assert from 'node:assert/strict';
import { emeraldInternalActionId } from '../../src/games/emerald/regionalMovement.ts';
import { emeraldMovement } from '../../src/games/emerald/rotatingTileMovement.ts';
import * as EM from '../../src/games/emerald/generated/constants.ts';
import type { EngineInteraction } from '../../src/viewer/engineInteraction.ts';
import type { Game } from '../../src/games/firered/game.ts';
type Pump = (frames: number, input?: (frame: number) => number, done?: () => boolean) => Promise<number>;

export async function runEmoteChecks(engine: EngineInteraction, _pump: Pump): Promise<void> {
  await engine.enterMap({ mapId: 'MAP_OLDALE_TOWN', x: 16, y: 12, direction: 'north', dynamic: null });
  const ow = (engine as unknown as { game: Game }).game.overworld;
  const player = ow.player.object;
  emeraldMovement(ow); // installs the regional movement table (the Emerald script movement does it on first use)
  const urls = (): string[] => ow.sprites.sprites.filter(s => s.frameImages.length > 0 && /emotion_/.test(s.frameImages[0]!.url)).map(s => s.frameImages[Math.min(s.imageValue, s.frameImages.length - 1)]!.url.split('/').pop()!);
  assert.deepEqual(urls(), []);
  // The shared exclamation / question actions: FireRed's MovementAction_EmoteExclamationMark_Step0 starts the effect.
  ow.effects.startEmoteForObjectEvent(player, 0);
  ow.effects.startEmoteForObjectEvent(player, 1);
  ow.sprites.update(); // the first animation frame is applied by the first update
  assert.deepEqual(urls().sort(), ['emotion_exclamation.png', 'emotion_question.png']);
  // The regional heart action runs through the Emerald movement table.
  const heartAction = emeraldInternalActionId(EM.MOVEMENT_ACTION_EMOTE_HEART);
  const run = ow.objects.externalMovementActions.get(heartAction);
  assert.ok(run, 'MOVEMENT_ACTION_EMOTE_HEART is registered');
  player.sprite.data[2] = 0;
  assert.equal(run!(player), true, 'MovementAction_EmoteHeart_Step0 returns TRUE');
  assert.equal(player.sprite.data[2], 1, 'sActionFuncId = 1');
  ow.sprites.update();
  assert.deepEqual(urls().sort(), ['emotion_exclamation.png', 'emotion_heart.png', 'emotion_question.png']);
  const sprites = ow.sprites.sprites.filter(s => s.frameImages.length > 0 && /emotion_/.test(s.frameImages[0]!.url));
  assert.ok(sprites.every(s => s.priority === 1 && s.coordOffsetEnabled), 'SetIconSpriteData: priority 1, coordOffsetEnabled');
  const y0 = sprites.map(s => s.y2);
  // 60 frames of animation; the sprites rise (sYVelocity -5, +1 per frame while sYOffset != 0) and are then stopped.
  let frames = 0;
  while (ow.sprites.sprites.some(s => /emotion_/.test(s.frameImages[0]?.url ?? '')) && frames < 200) { ow.sprites.update(); frames++; }
  assert.ok(frames >= 56 && frames <= 62, `the icons end with sSpriteAnim_Icons (60 frames): ${frames}`);
  assert.notDeepEqual(y0, [0, 0, 0], 'the icons were above the head at some point');
  console.log(`check:emerald-emotes PASS: exclamation, question and heart pictures from the Emerald export (${frames} frames); PREPARED player object`);
}
