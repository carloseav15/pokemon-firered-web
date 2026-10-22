// rotating_gate.c against the original C: the whole source file is compiled with a shim for the sprite engine and the
// map grid, and driven with the same PREPARED sequences of (map, temp vars, wall pattern, direction, tile) as the
// TypeScript port (src/games/emerald/rotatingGate.ts). The oracle prints every result and the orientation bytes in the
// temp vars after each call. No rendering: the gate sprites are the recorded graphics gap.
import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rom, setDataRoot } from '../../src/core/rom.ts';
import { loadCData } from '../../src/core/hw/assets.ts';
import { newSaveData, setSave, save, varGet, varSet } from '../../src/games/firered/save.ts';
import { MAP_OFFSET } from '../../src/core/field/fieldmap.ts';
import * as EM from '../../src/games/emerald/generated/constants.ts';
import { CheckForRotatingGatePuzzleCollision, CheckForRotatingGatePuzzleCollisionWithoutAnimation, RotatingGate_InitPuzzle, RotatingGate_InitPuzzleAndGraphics } from '../../src/games/emerald/rotatingGate.ts';
import { RotatingGate_InitPuzzle as InitSpecial } from '../../src/games/emerald/rotatingGate.ts';

const fetchFile = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (url.startsWith('/') && !existsSync('public' + url)) return new Response('', { status: 404 }); return fetchFile(input, init); }) as typeof fetch;
setDataRoot('/emerald');
await rom.load();
await loadCData('em:rotating_gate');
const decomp = process.env.POKEEMERALD ?? resolve('../refs-src/pokeemerald');
const source = readFileSync(resolve(decomp, 'src/rotating_gate.c'), 'utf8');
const dir = '.decomp-build/checks/rotating-gate'; mkdirSync(dir, { recursive: true });

const shim = `
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef uint8_t u8; typedef int8_t s8; typedef uint16_t u16; typedef int16_t s16; typedef uint32_t u32; typedef int32_t s32; typedef uint8_t bool8; typedef uint32_t bool32;
#define TRUE 1
#define FALSE 0
#define EWRAM_DATA
#define TAG_NONE 0xFFFF
#define MAX_SPRITES 64
#define MAP_OFFSET 7
#define MAP_OFFSET_W 15
#define MAP_OFFSET_H 14
#define DISPLAY_WIDTH 240
#define DISPLAY_HEIGHT 160
#define NUM_TEMP_VARS 16
#define STATIC_ASSERT(a,b)
#define ARRAY_COUNT(a) (sizeof(a)/sizeof((a)[0]))
#define max(a,b) ((a)>(b)?(a):(b))
#define INCGFX_U8(a,b) {0}
#define SPRITE_SHAPE(x) 0
#define SPRITE_SIZE(x) 0
#define ST_OAM_AFFINE_NORMAL 1
#define ST_OAM_OBJ_NORMAL 0
#define ST_OAM_4BPP 0
#define ANIMCMD_FRAME(a,b) {0}
#define ANIMCMD_END {0}
#define ANIMCMD_JUMP(a) {0}
#define AFFINEANIMCMD_FRAME(a,b,c,d) {0}
#define AFFINEANIMCMD_JUMP(a) {0}
#define AFFINEANIMCMD_END {0}
#define AFFINEANIMCMD_LOOP(a) {0}
#define SE_ROTATING_GATE 0
#define PLAYER_SPEED_NORMAL 0
#define DIR_NONE 0
#define DIR_SOUTH ${EM.DIR_SOUTH}
#define DIR_NORTH ${EM.DIR_NORTH}
#define DIR_WEST ${EM.DIR_WEST}
#define DIR_EAST ${EM.DIR_EAST}
#define VAR_TEMP_0 ${EM.VAR_TEMP_0}
#define MAP_GROUP(m) ((m) >> 8)
#define MAP_NUM(m) ((m) & 0xFF)
#define MAP_FORTREE_CITY_GYM ${EM.MAP_FORTREE_CITY_GYM}
#define MAP_ROUTE110_TRICK_HOUSE_PUZZLE6 ${EM.MAP_ROUTE110_TRICK_HOUSE_PUZZLE6}
struct OamData { u32 y,affineMode,objMode,mosaic,bpp,shape,x,matrixNum,size,tileNum,priority,paletteNum,affineParam; };
struct SpriteSheet { const u8 *data; u16 size; u16 tag; };
union AnimCmd { int x; };
union AffineAnimCmd { int x; };
struct Sprite;
struct SpriteTemplate { u16 tileTag, paletteTag; const struct OamData *oam; const union AnimCmd *const *anims; const void *images; const union AffineAnimCmd *const *affineAnims; void (*callback)(struct Sprite *); };
struct Coords8 { s8 x, y; };
struct Sprite { s16 x, y, x2, y2; s16 data[8]; u8 invisible, coordOffsetEnabled; s16 centerToCornerVecX, centerToCornerVecY; };
struct Sprite gSprites[MAX_SPRITES + 1];
s16 gSpriteCoordOffsetX, gSpriteCoordOffsetY;
struct { struct { u8 mapGroup, mapNum; } location; struct { s16 x, y; } pos; } block, *gSaveBlock1Ptr = &block;
u16 vars[16];
u16 *GetVarPointer(u16 id) { return &vars[id - VAR_TEMP_0]; }
int grid[64][64];
u8 MapGridGetCollisionAt(s16 x, s16 y) { if (x < 0 || y < 0 || x >= 64 || y >= 64) return 1; return grid[y][x]; }
u8 CreateSprite(const struct SpriteTemplate *t, s16 x, s16 y, u8 sub) { return MAX_SPRITES; }
void StartSpriteAffineAnim(struct Sprite *s, u8 n) {}
void GetMapCoordsFromSpritePos(s16 x, s16 y, s16 *ox, s16 *oy) {}
void FreeSpriteOamMatrix(struct Sprite *s) {}
void DestroySprite(struct Sprite *s) {}
void PlaySE(u16 se) {}
int GetPlayerSpeed(void) { return 0; }
void LoadSpriteSheets(const struct SpriteSheet *s) {}
`;
const main = `
int main(void) {
 int map, n;
 while (scanf("%d %d", &map, &n) == 2) {
  memset(vars, 0, sizeof(vars));
  for (int y = 0; y < 64; y++) for (int x = 0; x < 64; x++) { int v; scanf("%d", &v); grid[y][x] = v; }
  block.location.mapGroup = map >> 8; block.location.mapNum = map & 0xff;
  RotatingGate_InitPuzzle();
  printf("init"); for (int i = 0; i < 16; i++) printf(" %d", ((u8 *)vars)[i]); puts("");
  for (int k = 0; k < n; k++) {
   int mode, dir, x, y; scanf("%d %d %d %d", &mode, &dir, &x, &y);
   int r = mode ? CheckForRotatingGatePuzzleCollisionWithoutAnimation(dir, x, y) : CheckForRotatingGatePuzzleCollision(dir, x, y);
   printf("%d", r); for (int i = 0; i < 16; i++) printf(" %d", ((u8 *)vars)[i]); puts("");
  }
 }
}
`;
// The sprite-only static functions and the camera/graphics entry points are unused by the oracle: silence the warnings.
writeFileSync(`${dir}/oracle.c`, shim + source.replace(/^#include.*$/gm, '').replace(/^STATIC_ASSERT.*$/gm, '') + main);
const compiled = spawnSync('cc', ['-std=gnu99', '-w', `${dir}/oracle.c`, '-o', `${dir}/oracle`], { encoding: 'utf8' });
assert.equal(compiled.status, 0, compiled.stderr);

// PREPARED deterministic pseudo-random scenarios: wall patterns (collision 0/1/2/3) and tiles near the gates.
let seed = 12345;
const rnd = (n: number): number => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 16) % n; };
const MAPS = [EM.MAP_FORTREE_CITY_GYM, EM.MAP_ROUTE110_TRICK_HOUSE_PUZZLE6, EM.MAP_ROUTE102];
const DIRS = [EM.DIR_NORTH, EM.DIR_SOUTH, EM.DIR_WEST, EM.DIR_EAST, 0];
type Gate = { x: number; y: number };
const configs: Record<number, Gate[]> = {
  [EM.MAP_FORTREE_CITY_GYM]: (await import('../../src/core/hw/assets.ts')).cdata<Gate[]>('em:rotating_gate', 'sRotatingGate_FortreePuzzleConfig'),
  [EM.MAP_ROUTE110_TRICK_HOUSE_PUZZLE6]: (await import('../../src/core/hw/assets.ts')).cdata<Gate[]>('em:rotating_gate', 'sRotatingGate_TrickHousePuzzleConfig'),
  [EM.MAP_ROUTE102]: [],
};
type Scenario = { map: number; grid: number[][]; steps: Array<[number, number, number, number]> };
const scenarios: Scenario[] = [];
for (let s = 0; s < 400; s++) {
  const map = MAPS[s % 3]!;
  const wallRate = [0, 4, 12, 30][rnd(4)]!; // percent of tiles that are walls (collision 1); a few get collision 2/3
  const grid = Array.from({ length: 64 }, () => Array.from({ length: 64 }, () => (rnd(100) < wallRate ? [1, 1, 1, 2, 3][rnd(5)]! : 0)));
  const steps: Scenario['steps'] = [];
  for (let k = 0; k < 60; k++) {
    const gates = configs[map]!;
    const gate = gates.length ? gates[rnd(gates.length)]! : { x: 20, y: 20 };
    const x = gate.x + MAP_OFFSET - 3 + rnd(6), y = gate.y + MAP_OFFSET - 3 + rnd(6);
    steps.push([rnd(2), DIRS[rnd(5)]!, x, y]);
  }
  scenarios.push({ map, grid, steps });
}
const input = scenarios.map(sc => `${sc.map} ${sc.steps.length}\n${sc.grid.map(r => r.join(' ')).join('\n')}\n${sc.steps.map(st => st.join(' ')).join('\n')}`).join('\n');
const oracle = spawnSync(`${dir}/oracle`, [], { input, encoding: 'utf8', maxBuffer: 1e8 });
assert.equal(oracle.status, 0, oracle.stderr);
const lines = oracle.stdout.trim().split('\n');
setSave(newSaveData());
const bytes = (): number[] => Array.from({ length: 16 }, (_, i) => (varGet(EM.VAR_TEMP_0 + (i >> 1)) >> (8 * (i & 1))) & 0xff);
let line = 0, collisions = 0, rotations = 0;
for (const [index, sc] of scenarios.entries()) {
  save.location = { mapGroup: sc.map >> 8, mapNum: sc.map & 0xff, warpId: -1, x: 0, y: 0 };
  for (let v = 0; v < 8; v++) varSet(EM.VAR_TEMP_0 + v, 0); // PREPARED: zeroed temp vars before InitPuzzle
  RotatingGate_InitPuzzle();
  assert.equal(`init ${bytes().join(' ')}`, lines[line++], `scenario ${index} init`);
  const map = { collisionAt: (x: number, y: number) => (x < 0 || y < 0 || x >= 64 || y >= 64 ? 1 : sc.grid[y]![x]!) } as never;
  for (const [mode, dir, x, y] of sc.steps) {
    const before = bytes().join(' ');
    const result = mode ? CheckForRotatingGatePuzzleCollisionWithoutAnimation(dir, x, y, map) : CheckForRotatingGatePuzzleCollision(dir, x, y, map);
    assert.equal(`${result ? 1 : 0} ${bytes().join(' ')}`, lines[line++], `scenario ${index}: mode ${mode} dir ${dir} at ${x},${y}`);
    if (result) collisions++;
    if (!mode && !result && bytes().join(' ') !== before) rotations++;
  }
}
assert.equal(line, lines.length);
assert.ok(collisions > 150 && rotations > 150, `scenarios must exercise both blocked arms (${collisions}) and rotations (${rotations})`);
// RotatingGate_InitPuzzleAndGraphics loads the configuration without touching the orientations (graphics gap).
save.location = { mapGroup: EM.MAP_FORTREE_CITY_GYM >> 8, mapNum: EM.MAP_FORTREE_CITY_GYM & 0xff, warpId: -1, x: 0, y: 0 };
for (let v = 0; v < 8; v++) varSet(EM.VAR_TEMP_0 + v, 0); // PREPARED: zeroed temp vars before InitPuzzle
RotatingGate_InitPuzzleAndGraphics();
assert.deepEqual(bytes(), new Array(16).fill(0));
void InitSpecial;
console.log(`original C comparison PASS: rotating_gate.c compiled, ${scenarios.length} PREPARED scenarios x 60 steps (${collisions} blocked arms, ${rotations} rotations); gate sprites are a recorded gap`);
