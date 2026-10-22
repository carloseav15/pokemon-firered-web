// Emerald regional movement actions (games/emerald/regionalMovement.ts) against the original
// event_object_movement.c bodies. The oracle compiles pokeemerald's own UpdateWalkSlowAnim,
// AnimateSpriteInFigure8 and ApplyLevitateMovement; vectors and step counts are read from the
// same source. PREPARED: a bare ObjectEvent at (0,0) per action, no map, collision or rendering.
import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { registerCData } from '../../src/core/hw/assets.ts';
import { rom } from '../../src/core/rom.ts';
import { tasks } from '../../src/core/gba/tasks.ts';
import * as C from '../../src/games/emerald/generated/constants.ts';
import { EMERALD_REGIONAL_MOVEMENT_ACTIONS } from '../../src/games/emerald/generated/movementContract.ts';
import { EMERALD_REGIONAL_IMPLEMENTED_ACTIONS, emeraldInternalActionId, EmeraldRegionalMovement } from '../../src/games/emerald/regionalMovement.ts';
import { translateEmeraldMovementAction } from '../../src/games/emerald/rotatingTileMovement.ts';
import { ObjectEvent, ObjectEvents } from '../../src/core/field/objectEvents.ts';
import type { Overworld } from '../../src/core/field/overworld.ts';

const decomp = process.env.POKEEMERALD ?? resolve('../refs-src/pokeemerald');
const source = readFileSync(resolve(decomp, 'src/event_object_movement.c'), 'utf8');

// Every source regional action is implemented, or listed with the exact blocker.
const BLOCKED = new Map<number, string>([
  [C.MOVEMENT_ACTION_REVEAL_TRAINER, 'the Emerald body adds SetBuriedTrainerMovement and the buried-trainer tasks (trainer_see.c) to the disguise reveal'],
]);
const lockUnlock = new Set([C.MOVEMENT_ACTION_LOCK_ANIM, C.MOVEMENT_ACTION_UNLOCK_ANIM]);
for (const [id, reason] of EMERALD_REGIONAL_MOVEMENT_ACTIONS) {
  const implemented = EMERALD_REGIONAL_IMPLEMENTED_ACTIONS.includes(id) || lockUnlock.has(id);
  assert.ok(implemented !== BLOCKED.has(id), `${reason}: must be implemented xor blocked`);
}
for (const id of EMERALD_REGIONAL_IMPLEMENTED_ACTIONS) assert.ok(EMERALD_REGIONAL_MOVEMENT_ACTIONS.has(id), `${id} is not a regional action`);
for (const id of BLOCKED.keys()) assert.throws(() => translateEmeraldMovementAction(id), /Unsupported Emerald movement/);

// ---- original-C oracle -------------------------------------------------------------------
const body = (name: string): string => {
  const match = new RegExp(`^[a-z0-9_ ]*\\b${name}\\([^;{]*\\)\\s*\\{`, 'm').exec(source);
  assert.ok(match, name);
  let end = source.indexOf('{', match.index) + 1, depth = 1;
  while (depth) { if (source[end] === '{') depth++; else if (source[end] === '}') depth--; end++; }
  return source.slice(match.index, end);
};
const table = (name: string): string => new RegExp(`${name}\\[[^\\]]*\\]\\s*=\\s*\\{[\\s\\S]*?\\n\\};`).exec(source)![0];
const dir = '.decomp-build/checks/emerald-regional'; mkdirSync(dir, { recursive: true });
const oracle = `
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef uint8_t u8; typedef int8_t s8; typedef uint16_t u16; typedef int16_t s16; typedef uint32_t u32; typedef int32_t s32; typedef uint8_t bool8;
#define TRUE 1
#define FALSE 0
#define FIGURE_8_LENGTH ${C.FIGURE_8_LENGTH}
struct Sprite { s16 x, y, x2, y2; s16 data[8]; };
struct ObjectEvent { u8 spriteId; };
struct Task { s16 data[16]; };
struct Task gTasks[16]; struct ObjectEvent gObjectEvent; struct Sprite gSprites[2];
struct Coords16 { s16 x, y; };
#define DIR_NONE 0
#define DIR_SOUTH 1
#define DIR_NORTH 2
#define DIR_WEST 3
#define DIR_EAST 4
#define DIR_SOUTHWEST 5
#define DIR_SOUTHEAST 6
#define DIR_NORTHWEST 7
#define DIR_NORTHEAST 8
#define sDirection data[3]
#define sTimer data[4]
#define sNumSteps data[5]
static const struct Coords16 ${table('sDirectionToVectors')}
${body('Step1')}
${body('SetWalkSlowSpriteData')}
${body('UpdateWalkSlowAnim')}
static const s8 ${table('sFigure8XOffsets')}
static const s8 ${table('sFigure8YOffsets')}
${body('GetFigure8YOffset')}
${body('GetFigure8XOffset')}
${body('InitSpriteForFigure8Anim')}
${body('AnimateSpriteInFigure8')}
void LoadWordFromTwoHalfwords(u16 *a, u32 *b) { *b = (u32)(size_t)&gObjectEvent; }
#undef sTimer
#undef sNumSteps
${body('ApplyLevitateMovement')}
int main(int argc, char **argv) {
  int mode = atoi(argv[1]);
  if (mode == 0) { /* walk slow, direction argv[2] */
    int d = atoi(argv[2]); struct Sprite *s = &gSprites[0]; memset(s, 0, sizeof *s);
    SetWalkSlowSpriteData(s, d);
    for (int f = 1; f < 100; f++) { int r = UpdateWalkSlowAnim(s); printf("%d %d %d\\n", s->x, s->y, r); if (r) break; }
  } else if (mode == 1) { /* figure 8 */
    struct Sprite *s = &gSprites[0]; memset(s, 0, sizeof *s); InitSpriteForFigure8Anim(s);
    for (int f = 0; f < 4 * FIGURE_8_LENGTH; f++) { int r = AnimateSpriteInFigure8(s); printf("%d %d %d\\n", s->x2, s->y2, r); }
  } else { /* levitate */
    gObjectEvent.spriteId = 1; memset(gTasks, 0, sizeof gTasks); gTasks[0].data[3] = (s16)0xFFFF;
    for (int f = 0; f < 48; f++) { ApplyLevitateMovement(0); printf("%d\\n", gSprites[1].y2); }
  }
}
`.replace('#include <string.h>', '#include <string.h>\n#include <stdlib.h>');
writeFileSync(`${dir}/oracle.c`, oracle);
const build = spawnSync('cc', ['-w', '-o', `${dir}/oracle`, `${dir}/oracle.c`], { encoding: 'utf8' });
assert.equal(build.status, 0, build.stderr);
const run = (...args: (string | number)[]): number[][] => spawnSync(`${dir}/oracle`, args.map(String), { encoding: 'utf8' }).stdout.trim().split('\n').map(line => line.split(' ').map(Number));

// ---- TS engine --------------------------------------------------------------------------
const exported = JSON.parse(readFileSync(resolve('public/fr/cdata/event_object_movement.json'), 'utf8'));
registerCData('event_object_movement', exported.defs);
(rom as any).charmap = JSON.parse(readFileSync('public/fr/charmap.json', 'utf8'));
rom.objects = { gfx: { '0': { width: 16, height: 16, inanimate: false, anims: 'none', frames: [], reflectionFrames: [], bridgeReflectionFrames: [], disableReflectionPaletteLoad: false, shadowSize: 'SHADOW_SIZE_M', tracks: 'TRACKS_NONE' } as any }, animTables: { none: [] }, anims: {} };
const objects = new ObjectEvents({ playerDestCoords: () => ({ x: 5, y: 5 }), emote: () => {}, playSE: () => {}, playerIsRunning: () => false } as any);
const ow = { objects } as unknown as Overworld;
new EmeraldRegionalMovement(ow);
const anims = new Proxy([] as any[], { get: (_t, prop) => (prop === 'length' ? 999 : [['F', 0, 1, 0, 0], ['E']]) });
tasks.reset();
function start(action: number): ObjectEvent {
  const object = new ObjectEvent();
  object.sprite.anims = anims;
  object.movementActionId = translateEmeraldMovementAction(action);
  object.sprite.data[2] = 0;
  objects.objects[0] = object;
  return object;
}
function runToEnd(object: ObjectEvent, maxFrames = 200): number {
  for (let frame = 1; frame <= maxFrames; frame++) {
    const finished = objects.execAction(object);
    object.sprite.animate();
    if (finished) return frame;
  }
  throw Error('did not finish');
}
const vectors = [...table('sDirectionToVectors').matchAll(/\{\s*(-?\d+),\s*(-?\d+)\}/g)].map(m => [Number(m[1]), Number(m[2])]);
const stepCount = (name: string) => (new RegExp(`${name}\\[\\]\\s*=\\s*\\{([^}]*)\\}`).exec(source)![1].match(/Step\d+/g) ?? []).length;

// Diagonal walks: normal = sStep1Funcs entries, slow = UpdateWalkSlowAnim frames from the oracle.
const diagonals: [number, number, boolean][] = [
  [C.MOVEMENT_ACTION_WALK_NORMAL_DIAGONAL_UP_LEFT, 7, false], [C.MOVEMENT_ACTION_WALK_NORMAL_DIAGONAL_UP_RIGHT, 8, false],
  [C.MOVEMENT_ACTION_WALK_NORMAL_DIAGONAL_DOWN_LEFT, 5, false], [C.MOVEMENT_ACTION_WALK_NORMAL_DIAGONAL_DOWN_RIGHT, 6, false],
  [C.MOVEMENT_ACTION_WALK_SLOW_DIAGONAL_UP_LEFT, 7, true], [C.MOVEMENT_ACTION_WALK_SLOW_DIAGONAL_UP_RIGHT, 8, true],
  [C.MOVEMENT_ACTION_WALK_SLOW_DIAGONAL_DOWN_LEFT, 5, true], [C.MOVEMENT_ACTION_WALK_SLOW_DIAGONAL_DOWN_RIGHT, 6, true],
];
for (const [action, direction, slow] of diagonals) {
  const object = start(action);
  const frames = runToEnd(object);
  const [dx, dy] = vectors[direction];
  assert.equal(object.facingDirection, direction);
  assert.deepEqual([object.currentCoords.x, object.currentCoords.y], [dx, dy], `tile ${action}`);
  assert.equal(object.sprite.animPaused, true);
  if (slow) {
    const trace = run(0, direction); // [x, y, done] per UpdateWalkSlowAnim call
    assert.equal(frames, trace.length, `slow diagonal ${action} frames`);
    assert.deepEqual([object.sprite.x, object.sprite.y], [trace.at(-1)![0], trace.at(-1)![1]]);
  } else {
    assert.equal(frames, stepCount('sStep1Funcs'), `normal diagonal ${action} frames`);
    assert.deepEqual([object.sprite.x, object.sprite.y], [16 * dx, 16 * dy]);
  }
}

// Acro end-wheelie moves: InitNpcForMovement at speed 1 (sStep2Funcs), then one tile.
for (const [action, direction] of [[C.MOVEMENT_ACTION_ACRO_END_WHEELIE_MOVE_DOWN, 1], [C.MOVEMENT_ACTION_ACRO_END_WHEELIE_MOVE_UP, 2], [C.MOVEMENT_ACTION_ACRO_END_WHEELIE_MOVE_LEFT, 3], [C.MOVEMENT_ACTION_ACRO_END_WHEELIE_MOVE_RIGHT, 4]] as const) {
  const object = start(action);
  assert.equal(runToEnd(object), stepCount('sStep2Funcs'));
  assert.deepEqual([object.currentCoords.x, object.currentCoords.y], vectors[direction]);
  assert.equal(object.sprite.animNum, [0, C.ANIM_STANDING_WHEELIE_BACK_WHEEL_SOUTH, C.ANIM_STANDING_WHEELIE_BACK_WHEEL_NORTH, C.ANIM_STANDING_WHEELIE_BACK_WHEEL_WEST, C.ANIM_STANDING_WHEELIE_BACK_WHEEL_EAST][direction], 'GetAcroEndWheelieDirectionAnimNum');
}

// Walk affine: InitMovementNormal(FAST_1) with the affine animation selected, paused again at the end.
for (const [action, direction, affine] of [[C.MOVEMENT_ACTION_WALK_LEFT_AFFINE, 3, 2], [C.MOVEMENT_ACTION_WALK_RIGHT_AFFINE, 4, 3]] as const) {
  const object = start(action);
  assert.equal(runToEnd(object), stepCount('sStep2Funcs'));
  assert.deepEqual([object.currentCoords.x, object.currentCoords.y], vectors[direction]);
  assert.equal(object.sprite.affineAnimNum, affine);
  assert.equal(object.sprite.affineAnimPaused, true);
}

// Figure 8: full x2/y2 trace of AnimateSpriteInFigure8, ending at (0,0) with ground effects on stop.
{
  const trace = run(1);
  const object = start(C.MOVEMENT_ACTION_FIGURE_8);
  const seen: number[][] = [];
  for (let frame = 0; frame < trace.length; frame++) {
    const finished = objects.execAction(object);
    seen.push([object.sprite.x2, object.sprite.y2, finished ? 1 : 0]);
    if (finished) break;
  }
  assert.deepEqual(seen, trace);
  assert.equal(object.triggerGroundEffectsOnStop, true);
  assert.equal(object.sprite.animPaused, true);
}

// Levitate: ApplyLevitateMovement task trace (y2 per frame), StopLevitateAtTop waits for y2 == 0, StopLevitate resets y2.
{
  const trace = run(2).map(([y]) => y);
  const object = start(C.MOVEMENT_ACTION_LEVITATE);
  assert.equal(runToEnd(object), 1);
  const taskId = object.warpArrowSpriteId;
  assert.ok(tasks.tasks[taskId].isActive);
  const seen: number[] = [];
  for (let frame = 0; frame < trace.length; frame++) { tasks.tasks[taskId].func(taskId); seen.push(object.sprite.y2); }
  assert.deepEqual(seen, trace);
  const top = start(C.MOVEMENT_ACTION_STOP_LEVITATE_AT_TOP);
  top.warpArrowSpriteId = taskId; top.sprite.y2 = -1;
  assert.equal(objects.execAction(top), false);
  assert.ok(tasks.tasks[taskId].isActive);
  top.sprite.y2 = 0; assert.equal(objects.execAction(top), true);
  assert.equal(tasks.tasks[taskId].isActive, false);
  const lev2 = start(C.MOVEMENT_ACTION_LEVITATE); runToEnd(lev2);
  const stop = start(C.MOVEMENT_ACTION_STOP_LEVITATE); stop.warpArrowSpriteId = lev2.warpArrowSpriteId; stop.sprite.y2 = -3;
  assert.equal(runToEnd(stop), 1); assert.equal(stop.sprite.y2, 0); assert.equal(tasks.tasks[lev2.warpArrowSpriteId].isActive, false);
}

// Reflection flags and RestoreAnimation (graphics inanimate flag read from the Emerald-sized table).
{
  const object = start(C.MOVEMENT_ACTION_HIDE_REFLECTION); runToEnd(object); assert.equal(object.hideReflection, true);
  const show = start(C.MOVEMENT_ACTION_SHOW_REFLECTION); show.hideReflection = true; runToEnd(show); assert.equal(show.hideReflection, false);
  const restore = start(C.MOVEMENT_ACTION_RESTORE_ANIMATION); restore.inanimate = true; restore.graphicsId = 0; runToEnd(restore); assert.equal(restore.inanimate, false);
}

// MovementAction_EmoteHeart: FieldEffectStart(FLDEFF_HEART_ICON) for the object, sActionFuncId = 1, then MovementAction_Finish.
{
  const calls: Array<[unknown, number]> = [];
  (ow as unknown as { effects: unknown }).effects = { emoteHeart: (object: unknown, id: number) => { calls.push([object, id]); } };
  const object = start(C.MOVEMENT_ACTION_EMOTE_HEART);
  assert.equal(runToEnd(object), 1, 'step 0 returns TRUE and MovementAction_Finish ends the action in the same frame');
  assert.deepEqual(calls, [[object, C.FLDEFF_HEART_ICON]]);
}

assert.equal(emeraldInternalActionId(C.MOVEMENT_ACTION_FIGURE_8), 0x100 + C.MOVEMENT_ACTION_FIGURE_8);
console.log(`PASS emerald regional movement: ${EMERALD_REGIONAL_IMPLEMENTED_ACTIONS.length} actions executed against C oracle traces (walk-slow, figure-8, levitate), source step counts and vectors; ${BLOCKED.size} blocked with reasons (PREPARED bare objects; no map, collision or rendering)`);
