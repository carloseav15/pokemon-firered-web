// berry.c tree state (PlantBerryTree, BerryTreeGrow, BerryTreeTimeUpdate, yield, Enigma validity) against the original C
// bodies compiled from pokeemerald, over PREPARED scenarios (random plantings, enigma berry data, minute spans, RNG seeds).
// The comparison covers every tree field after each operation and the RNG state. No browser/rendering claim.
import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rom, setDataRoot } from '../../src/core/rom.ts';
import { loadCData, cdata } from '../../src/core/hw/assets.ts';
import { getRandomState, setRandomStateForTest } from '../../src/core/random.ts';
import * as C from '../../src/games/emerald/generated/constants.ts';
import { newSaveData, save, setSave } from '../../src/games/firered/save.ts';
const fetchFile = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (url.startsWith('/') && !existsSync('public' + url)) return new Response('', { status: 404 }); return fetchFile(input, init); }) as typeof fetch;
setDataRoot('/emerald');
await rom.load();
await loadCData('berry');
const berry = await import('../../src/games/emerald/berry.ts');
const clock = await import('../../src/games/emerald/clock.ts');

const decomp = process.env.POKEEMERALD ?? resolve('../refs-src/pokeemerald');
const source = readFileSync(resolve(decomp, 'src/berry.c'), 'utf8');
function body(name: string): string {
  const match = new RegExp(`^[A-Za-z_][\\w\\s\\*]*\\b${name}\\([^;{]*\\)\\s*\\{`, 'm').exec(source);
  assert.ok(match, `C function ${name}`);
  let depth = 0, i = match.index + match[0].length - 1;
  for (; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}' && --depth === 0) break; }
  return source.slice(match.index, i + 1).replace(/^static /, '');
}
const SECONDS_PER_MINUTE = 60, MINUTES_PER_HOUR = 60, HOURS_PER_DAY = 24;
const functions = ['GetEnigmaBerryChecksum', 'IsEnigmaBerryValid', 'GetBerryInfo', 'GetBerryTreeInfo', 'GetStageDurationByBerryType', 'BerryTreeGetNumStagesWatered',
  'CalcBerryYieldInternal', 'CalcBerryYield', 'BerryTreeGrow', 'BerryTreeTimeUpdate', 'PlantBerryTree', 'RemoveBerryTree', 'ClearBerryTrees',
  'ItemIdToBerryType', 'BerryTypeToItemId'].map(body).join('\n\n');
const rtcSource = readFileSync(resolve(decomp, 'src/rtc.c'), 'utf8');
const calcTimeDifference = (() => {
  const start = rtcSource.indexOf('void CalcTimeDifference(');
  let depth = 0, end = rtcSource.indexOf('{', start);
  for (let i = end; i < rtcSource.length; i++) { if (rtcSource[i] === '{') depth++; else if (rtcSource[i] === '}' && --depth === 0) { end = i; break; } }
  return rtcSource.slice(start, end + 1);
})();
const gBerries = cdata<{ name: number[]; maxYield: number; minYield: number; stageDuration: number }[]>('berry', 'gBerries');
assert.equal(gBerries.length, 43);
const dir = '.decomp-build/checks/berry'; mkdirSync(dir, { recursive: true });
const shim = `
#include <stdio.h>
#include <stdint.h>
#include <string.h>
typedef uint8_t u8; typedef int8_t s8; typedef uint16_t u16; typedef int16_t s16; typedef uint32_t u32; typedef int32_t s32; typedef uint8_t bool8; typedef int bool32;
#define TRUE 1
#define FALSE 0
#define BERRY_NAME_LENGTH 6
#define BERRY_ITEM_EFFECT_COUNT 18
#define BERRY_NONE 0
#define BERRY_STAGE_NO_BERRY ${C.BERRY_STAGE_NO_BERRY}
#define BERRY_STAGE_PLANTED ${C.BERRY_STAGE_PLANTED}
#define BERRY_STAGE_SPROUTED ${C.BERRY_STAGE_SPROUTED}
#define BERRY_STAGE_TALLER ${C.BERRY_STAGE_TALLER}
#define BERRY_STAGE_FLOWERING ${C.BERRY_STAGE_FLOWERING}
#define BERRY_STAGE_BERRIES ${C.BERRY_STAGE_BERRIES}
#define NUM_WATER_STAGES ${C.NUM_WATER_STAGES}
#define BERRY_TREES_COUNT ${C.BERRY_TREES_COUNT}
#define FIRST_BERRY_INDEX ${C.FIRST_BERRY_INDEX}
#define LAST_BERRY_INDEX ${C.LAST_BERRY_INDEX}
#define ITEM_ENIGMA_BERRY ${C.ITEM_ENIGMA_BERRY}
#define ITEM_TO_BERRY(itemId) (((itemId) - FIRST_BERRY_INDEX) + 1)
#define EWRAM_DATA
struct Berry { const u8 name[BERRY_NAME_LENGTH + 1]; u8 firmness; u16 size; u8 maxYield; u8 minYield; const u8 *description1; const u8 *description2; u8 stageDuration; u8 spicy; u8 dry; u8 sweet; u8 bitter; u8 sour; u8 smoothness; };
struct Berry2 { u8 name[BERRY_NAME_LENGTH + 1]; u8 firmness; u16 size; u8 maxYield; u8 minYield; u8 *description1; u8 *description2; u8 stageDuration; u8 spicy; u8 dry; u8 sweet; u8 bitter; u8 sour; u8 smoothness; };
struct EnigmaBerry { struct Berry2 berry; u8 itemEffect[BERRY_ITEM_EFFECT_COUNT]; u8 holdEffect; u8 holdEffectParam; u32 checksum; };
struct BerryTree { u8 berry; u8 stage:7; u8 stopGrowth:1; u16 minutesUntilNextStage; u8 berryYield; u8 regrowthCount:4; u8 watered1:1; u8 watered2:1; u8 watered3:1; u8 watered4:1; };
struct { struct BerryTree berryTrees[BERRY_TREES_COUNT]; struct EnigmaBerry enigmaBerry; } sb, *gSaveBlock1Ptr = &sb;
u32 rng; u16 Random(void) { rng = rng * 1103515245 + 24691; return rng >> 16; }
const struct BerryTree gBlankBerryTree = {};
const struct Berry gBerries[] = {
${gBerries.map(b => `{{${[...b.name, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff].slice(0, 7).join(',')}}, 0, 0, ${b.maxYield}, ${b.minYield}, 0, 0, ${b.stageDuration}}`).join(',\n')}
};
`;
const main = `
static void dump(void) {
  for (int i = 0; i < BERRY_TREES_COUNT; i++) { struct BerryTree *t = &sb.berryTrees[i];
    if (t->berry || t->stage || t->stopGrowth || t->minutesUntilNextStage || t->berryYield || t->regrowthCount || t->watered1 || t->watered2 || t->watered3 || t->watered4)
      printf("%d:%d,%d,%d,%d,%d,%d,%d%d%d%d ", i, t->berry, t->stage, t->stopGrowth, t->minutesUntilNextStage, t->berryYield, t->regrowthCount, t->watered1, t->watered2, t->watered3, t->watered4); }
  printf("| %u\\n", rng);
}
int main(void) {
  char op; unsigned a, b, c, d;
  while (scanf(" %c", &op) == 1) {
    if (op == 'S') { scanf("%u", &a); rng = a; ClearBerryTrees(); memset(&sb.enigmaBerry, 0, sizeof sb.enigmaBerry); }
    else if (op == 'E') { // enigma: stageDuration maxYield minYield valid
      scanf("%u%u%u%u", &a, &b, &c, &d); sb.enigmaBerry.berry.stageDuration = a; sb.enigmaBerry.berry.maxYield = b; sb.enigmaBerry.berry.minYield = c;
      u32 sum = 0; u8 *bytes = (u8 *)&sb.enigmaBerry; for (int i = 0; i < sizeof(sb.enigmaBerry) - sizeof(sb.enigmaBerry.checksum); i++) sum += bytes[i];
      sb.enigmaBerry.checksum = d ? sum : sum + 1; }
    else if (op == 'P') { scanf("%u%u%u%u", &a, &b, &c, &d); PlantBerryTree(a, b, c, d); }
    else if (op == 'T') { scanf("%u", &a); BerryTreeTimeUpdate((s32)a); }
    else if (op == 'R') { scanf("%u", &a); RemoveBerryTree(a); }
    else if (op == 'W') { scanf("%u%u", &a, &b); struct BerryTree *t = GetBerryTreeInfo(a); if (b == 1) t->watered1 = 1; if (b == 2) t->watered2 = 1; if (b == 3) t->watered3 = 1; if (b == 4) t->watered4 = 1; }
    else if (op == 'I') { scanf("%u", &a); printf("%d %d\\n", ItemIdToBerryType(a), BerryTypeToItemId(a)); continue; }
    else if (op == 'G') { scanf("%u", &a); const struct Berry *i = GetBerryInfo(a); printf("%u %u %u\\n", i->stageDuration, i->maxYield, i->minYield); continue; }
    else if (op == 'D') { dump(); }
  }
}
`;
const timeShim = `
#define SECONDS_PER_MINUTE 60
#define MINUTES_PER_HOUR 60
#define HOURS_PER_DAY 24
struct Time { s16 days; s8 hours; s8 minutes; s8 seconds; };
${calcTimeDifference}
int main(void) { int a[8]; while (scanf("%d%d%d%d%d%d%d%d", a, a+1, a+2, a+3, a+4, a+5, a+6, a+7) == 8) {
  struct Time t1 = {a[0], a[1], a[2], a[3]}, t2 = {a[4], a[5], a[6], a[7]}, r; CalcTimeDifference(&r, &t1, &t2); printf("%d %d %d %d\\n", r.days, r.hours, r.minutes, r.seconds); } }
`;
writeFileSync(`${dir}/time.c`, shim.slice(0, shim.indexOf('struct Berry {')) + timeShim);
const timeCompiled = spawnSync('cc', ['-std=gnu99', '-w', `${dir}/time.c`, '-o', `${dir}/time`], { encoding: 'utf8' });
assert.equal(timeCompiled.status, 0, timeCompiled.stderr);
writeFileSync(`${dir}/oracle.c`, shim + functions + main);
const compiled = spawnSync('cc', ['-std=gnu99', '-w', `${dir}/oracle.c`, '-o', `${dir}/oracle`], { encoding: 'utf8' });
assert.equal(compiled.status, 0, compiled.stderr);

// PREPARED scenarios from a fixed PRNG.
let state = 0x2545f491;
const rand = (n: number): number => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor((state / 4294967296) * n); };
const scenarios: string[][] = [];
for (let s = 0; s < 600; s++) {
  const ops: string[] = [`S ${rand(0x10000) * 65537 >>> 0}`];
  if (rand(3) === 0) ops.push(`E ${rand(30)} ${rand(7)} ${rand(4)} ${rand(2)}`);
  const plants = 1 + rand(5);
  for (let i = 0; i < plants; i++) ops.push(`P ${rand(8)} ${rand(46)} ${rand(6)} ${rand(2)}`);
  for (let i = 0, n = 2 + rand(6); i < n; i++) {
    const kind = rand(6);
    if (kind === 0) ops.push(`P ${rand(8)} ${1 + rand(43)} ${rand(6)} ${rand(2)}`);
    else if (kind === 1) ops.push(`W ${rand(8)} ${1 + rand(4)}`);
    else if (kind === 2) ops.push(`R ${rand(8)}`);
    else ops.push(`T ${[1, 59, 60, 179, 180, 1000, 3000, 9000, 20000, 60000, 400000][rand(11)]}`);
    ops.push('D');
  }
  scenarios.push(ops);
}
const items = [0, 1, EnigmaItem(), C.FIRST_BERRY_INDEX - 1, C.FIRST_BERRY_INDEX, C.FIRST_BERRY_INDEX + 10, C.LAST_BERRY_INDEX, C.LAST_BERRY_INDEX + 1, 65535];
function EnigmaItem(): number { return C.ITEM_ENIGMA_BERRY; }
const lookups = [...items.map(i => `I ${i}`), ...[0, 1, 43, 44, 255].map(b => `G ${b}`), `E 0 0 0 1`, `G ${C.ITEM_ENIGMA_BERRY - C.FIRST_BERRY_INDEX + 1}`, `E 9 5 2 1`, `G ${C.ITEM_ENIGMA_BERRY - C.FIRST_BERRY_INDEX + 1}`, `E 9 5 2 0`, `G ${C.ITEM_ENIGMA_BERRY - C.FIRST_BERRY_INDEX + 1}`];
const program = scenarios.map(s => `${s.join('\n')}\nD`).join('\n') + '\nS 1\n' + lookups.join('\n');
const result = spawnSync(`${dir}/oracle`, [], { input: program + '\n', encoding: 'utf8', maxBuffer: 1e9 });
assert.equal(result.status, 0, result.stderr);
const expected = result.stdout.trim().split('\n');

const snapshot = (): string => {
  const out: string[] = [];
  (save.berryTrees ?? []).forEach((t, i) => {
    if (t.berry || t.stage || t.stopGrowth || t.minutesUntilNextStage || t.berryYield || t.regrowthCount || t.watered1 || t.watered2 || t.watered3 || t.watered4)
      out.push(`${i}:${t.berry},${t.stage},${t.stopGrowth ? 1 : 0},${t.minutesUntilNextStage},${t.berryYield},${t.regrowthCount},${+t.watered1}${+t.watered2}${+t.watered3}${+t.watered4} `);
  });
  return `${out.join('')}| ${getRandomState().seed}`;
};
const enigmaBytes = (stageDuration: number, maxYield: number, minYield: number, valid: boolean): number[] => {
  const bytes = new Array(0x34).fill(0);
  bytes[20] = stageDuration; bytes[10] = maxYield; bytes[11] = minYield;
  let sum = 0; for (let i = 0; i < 48; i++) sum += bytes[i];
  const checksum = valid ? sum : sum + 1;
  for (let i = 0; i < 4; i++) bytes[48 + i] = (checksum >>> (8 * i)) & 0xff;
  return bytes;
};
let cursor = 0, compared = 0;
const next = (): string => expected[cursor++]!;
for (const ops of [...scenarios.map(s => [...s, 'D']), ['S 1']]) {
  for (const line of ops) {
    const [op, ...args] = line.split(' '); const n = args.map(Number);
    if (op === 'S') { setSave(newSaveData()); setRandomStateForTest(n[0]!); berry.ClearBerryTrees(); save.enigmaBerry = new Array(0x34).fill(0); }
    else if (op === 'E') save.enigmaBerry = enigmaBytes(n[0]!, n[1]!, n[2]!, !!n[3]);
    else if (op === 'P') berry.PlantBerryTree(n[0]!, n[1]!, n[2]!, !!n[3]);
    else if (op === 'T') berry.BerryTreeTimeUpdate(n[0]!);
    else if (op === 'R') berry.RemoveBerryTree(n[0]!);
    else if (op === 'W') { const t = berry.GetBerryTreeInfo(n[0]!); (t as unknown as Record<string, boolean>)[`watered${n[1]}`] = true; }
    else if (op === 'D') { assert.equal(snapshot(), next(), `scenario step ${compared}: ${line}`); compared++; }
  }
}
// ItemIdToBerryType / BerryTypeToItemId / GetBerryInfo lookups (the last scenario list; BerryTypeToItemId is internal to berry.c).
for (const item of items) { const line = next(); assert.ok(line.startsWith(`${berry.ItemIdToBerryType(item)} `), `ItemIdToBerryType(${item}): ${line}`); }
for (const b of [0, 1, 43, 44, 255]) { const info = berry.GetBerryInfo(b); assert.equal(`${info.stageDuration} ${info.maxYield} ${info.minYield}`, next(), `GetBerryInfo(${b})`); }
const enigma = C.ITEM_ENIGMA_BERRY - C.FIRST_BERRY_INDEX + 1;
for (const [spec, valid] of [[[0, 0, 0], true], [[9, 5, 2], true], [[9, 5, 2], false]] as const) {
  save.enigmaBerry = enigmaBytes(spec[0], spec[1], spec[2], valid);
  const info = berry.GetBerryInfo(enigma);
  assert.equal(`${info.stageDuration} ${info.maxYield} ${info.minYield}`, next(), `GetBerryInfo(enigma ${spec} ${valid})`);
}
const timeCases: number[][] = [];
for (let i = 0; i < 400; i++) timeCases.push([rand(40), rand(24), rand(60), rand(60), rand(40), rand(24), rand(60), rand(60)]);
const timeOut = spawnSync(`${dir}/time`, [], { input: timeCases.map(c => c.join(' ')).join('\n') + '\n', encoding: 'utf8' }).stdout.trim().split('\n');
timeCases.forEach((c, i) => {
  const result = { days: 0, hours: 0, minutes: 0, seconds: 0 };
  clock.CalcTimeDifference(result, { days: c[0]!, hours: c[1]!, minutes: c[2]!, seconds: c[3]! }, { days: c[4]!, hours: c[5]!, minutes: c[6]!, seconds: c[7]! });
  assert.equal(`${result.days} ${result.hours} ${result.minutes} ${result.seconds}`, timeOut[i], `CalcTimeDifference ${c}`);
});
console.log(`original C comparison PASS: ${scenarios.length} PREPARED scenarios, ${compared} tree snapshots (all fields + RNG), item/berry lookups and Enigma validity`);
