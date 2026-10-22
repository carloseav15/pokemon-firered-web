// Cycling Road challenge (field_specials.c, bike.c) and the rematch specials of battle_setup.c, compared
// with the original C bodies compiled from pokeemerald (string_util.c's ConvertIntToDecimalStringN
// included). Inputs are PREPARED states (frame counts, collision counts, record vars, flags);
// outputs come from the ported functions and the compiled C. No browser/rendering claim.
import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rom, setDataRoot } from '../../src/core/rom.ts';
import { loadCData } from '../../src/core/hw/assets.ts';
import { stringVars } from '../../src/core/gba/stringBuffers.ts';
import * as C from '../../src/games/emerald/generated/constants.ts';
import { newSaveData, save, setSave, SV, varGet, varSet, flagSet } from '../../src/games/firered/save.ts';
const fetchFile = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (url.startsWith('/') && !existsSync('public' + url)) return new Response('', { status: 404 }); return fetchFile(input, init); }) as typeof fetch;
setDataRoot('/emerald');
await rom.load();
await loadCData('em:battle_setup');
const cycling = await import('../../src/games/emerald/cyclingRoad.ts');
const { ShouldTryRematchBattle } = await import('../../src/games/emerald/battleSetup.ts');

const decomp = process.env.POKEEMERALD ?? resolve('../refs-src/pokeemerald');
const read = (file: string) => readFileSync(resolve(decomp, 'src', file), 'utf8');
/** Original C text of one top-level function (signature to its closing brace). */
function body(source: string, name: string): string {
  const match = new RegExp(`^[A-Za-z_][\\w\\s\\*]*\\b${name}\\([^;{]*\\)\\s*\\{`, 'm').exec(source);
  assert.ok(match, `C function ${name}`);
  let depth = 0, i = match.index + match[0].length - 1;
  for (; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}' && --depth === 0) break; }
  return source.slice(match.index, i + 1).replace(/^static /, '');
}
const fieldSpecials = read('field_specials.c'), battleSetup = read('battle_setup.c'), stringUtil = read('string_util.c'), bike = read('bike.c');
const functions = [
  body(stringUtil, 'StringCopy'), body(stringUtil, 'StringAppend'), body(stringUtil, 'ConvertIntToDecimalStringN'),
  body(fieldSpecials, 'ResetCyclingRoadChallengeData'), body(fieldSpecials, 'Special_BeginCyclingRoadChallenge'),
  body(fieldSpecials, 'DetermineCyclingRoadResults'), body(fieldSpecials, 'RecordCyclingRoadResults'),
  body(fieldSpecials, 'FinishCyclingRoadChallenge'), body(fieldSpecials, 'GetRecordedCyclingRoadResults'),
  body(bike, 'Bike_TryAdvanceCyclingRoadCollisions'),
  body(battleSetup, 'HasTrainerBeenFought'), body(battleSetup, 'FirstBattleTrainerIdToRematchTableId'),
  body(battleSetup, 'IsFirstTrainerIdReadyForRematch'), body(battleSetup, 'WasSecondRematchWon'), body(battleSetup, 'ShouldTryRematchBattle'),
];
const rematchTable = (await import('../../src/core/hw/assets.ts')).cdata<{ trainerIds: number[]; mapGroup: number; mapNum: number }[]>('em:battle_setup', 'gRematchTable');
assert.equal(rematchTable.length, C.REMATCH_TABLE_ENTRIES);
const text = (name: string) => `{${[...rom.text(name)].join(',')}}`;
const dir = '.decomp-build/checks/cycling'; mkdirSync(dir, { recursive: true });
const shim = `
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef uint8_t u8; typedef int8_t s8; typedef uint16_t u16; typedef int16_t s16; typedef uint32_t u32; typedef int32_t s32; typedef uint8_t bool8; typedef int bool32;
#define TRUE 1
#define FALSE 0
#define EOS 0xFF
#define CHAR_SPACER 0x77
#define CHAR_QUESTION_MARK 0xAC
#define CHAR_DEC_SEPARATOR 0xAD
#define STR_CONV_MODE_LEFT_ALIGN 0
#define STR_CONV_MODE_RIGHT_ALIGN 1
#define STR_CONV_MODE_LEADING_ZEROS 2
#define TRAINER_FLAGS_START ${C.TRAINER_FLAGS_START}
#define REMATCH_TABLE_ENTRIES ${C.REMATCH_TABLE_ENTRIES}
#define MAX_REMATCH_ENTRIES ${C.MAX_REMATCH_ENTRIES}
#define VAR_CYCLING_ROAD_RECORD_TIME_L ${C.VAR_CYCLING_ROAD_RECORD_TIME_L}
#define VAR_CYCLING_ROAD_RECORD_TIME_H ${C.VAR_CYCLING_ROAD_RECORD_TIME_H}
#define VAR_CYCLING_ROAD_RECORD_COLLISIONS ${C.VAR_CYCLING_ROAD_RECORD_COLLISIONS}
#define EWRAM_DATA
static const u8 sDigits[] = {0xA1,0xA2,0xA3,0xA4,0xA5,0xA6,0xA7,0xA8,0xA9,0xAA,0xBB,0xBC,0xBD,0xBE,0xBF,0xC0};
static const s32 sPowersOfTen[] = {1,10,100,1000,10000,100000,1000000,10000000,100000000,1000000000};
struct { u32 vblankCounter1; } gMain;
u16 vars[65536]; u8 flags[8192]; u16 gSpecialVar_Result, gTrainerBattleOpponent_A; u8 trainerRematches[100];
struct RematchTrainer { u16 trainerIds[5]; u16 mapGroup, mapNum; };
struct { u8 trainerRematches[100]; } sb, *gSaveBlock1Ptr = &sb;
u8 gStringVar1[32], gStringVar2[32];
EWRAM_DATA u8 gBikeCollisions = 0; EWRAM_DATA bool8 gBikeCyclingChallenge = FALSE; u32 sBikeCyclingTimer;
const u8 gText_SpaceTimes[] = ${text('gText_SpaceTimes')};
const u8 gText_99TimesPlus[] = ${text('gText_99TimesPlus')};
const u8 gText_SpaceSeconds[] = ${text('gText_SpaceSeconds')};
const u8 gText_1MinutePlus[] = ${text('gText_1MinutePlus')};
u16 VarGet(u16 id) { return vars[id]; }
bool8 VarSet(u16 id, u16 value) { vars[id] = value; return TRUE; }
bool8 FlagGet(u16 id) { return flags[id >> 3] >> (id & 7) & 1; }
const struct RematchTrainer gRematchTable[REMATCH_TABLE_ENTRIES] = {
${rematchTable.map(r => `{{${[...r.trainerIds, 0, 0, 0, 0, 0].slice(0, 5).join(',')}},${r.mapGroup},${r.mapNum}}`).join(',\n')}
};
`;
// The C declares `enum StringConvertMode mode`; replace the type for the compiled copy only.
const compiledFunctions = functions.join('\n\n').replace(/enum StringConvertMode/g, 'int').replace(/enum \{ WAITING_FOR_NONZERO_DIGIT, WRITING_DIGITS, WRITING_SPACES \} state;/g, 'int WAITING_FOR_NONZERO_DIGIT=0,WRITING_DIGITS=1,WRITING_SPACES=2; int state;');
const main = `
static void dump(const u8 *s) { for (int i = 0; i < 32; i++) { printf(" %d", s[i]); if (s[i] == EOS) break; } }
int main(void) {
 char mode; 
 while (scanf(" %c", &mode) == 1) {
  memset(gStringVar1, 0, sizeof gStringVar1); memset(gStringVar2, 0, sizeof gStringVar2);
  if (mode == 'D') { u32 frames; u32 coll; scanf("%u%u", &frames, &coll); DetermineCyclingRoadResults(frames, coll);
   printf("%d", gSpecialVar_Result); dump(gStringVar1); printf(" |"); dump(gStringVar2); puts(""); }
  else if (mode == 'S') { // challenge: active, attempts, begin counter, finish counter, record L H C
   u32 active, attempts, t0, t1, L, H, K; scanf("%u%u%u%u%u%u%u", &active, &attempts, &t0, &t1, &L, &H, &K);
   vars[VAR_CYCLING_ROAD_RECORD_TIME_L] = L; vars[VAR_CYCLING_ROAD_RECORD_TIME_H] = H; vars[VAR_CYCLING_ROAD_RECORD_COLLISIONS] = K;
   gMain.vblankCounter1 = t0; ResetCyclingRoadChallengeData(); if (active) Special_BeginCyclingRoadChallenge();
   for (u32 i = 0; i < attempts; i++) Bike_TryAdvanceCyclingRoadCollisions();
   gMain.vblankCounter1 = t1; FinishCyclingRoadChallenge();
   printf("%d %d %d %d %d", gBikeCollisions, gSpecialVar_Result, vars[VAR_CYCLING_ROAD_RECORD_TIME_L], vars[VAR_CYCLING_ROAD_RECORD_TIME_H], vars[VAR_CYCLING_ROAD_RECORD_COLLISIONS]);
   dump(gStringVar1); printf(" |"); dump(gStringVar2); puts(""); }
  else if (mode == 'G') { u32 L, H, K; scanf("%u%u%u", &L, &H, &K);
   vars[VAR_CYCLING_ROAD_RECORD_TIME_L] = L; vars[VAR_CYCLING_ROAD_RECORD_TIME_H] = H; vars[VAR_CYCLING_ROAD_RECORD_COLLISIONS] = K; gSpecialVar_Result = 99;
   int r = GetRecordedCyclingRoadResults(); printf("%d %d", r, gSpecialVar_Result); dump(gStringVar1); printf(" |"); dump(gStringVar2); puts(""); }
  else if (mode == 'M') { u32 opponent, fought, rematches; scanf("%u%u%u", &opponent, &fought, &rematches);
   memset(flags, 0, sizeof flags); memset(sb.trainerRematches, 0, sizeof sb.trainerRematches);
   for (u32 i = 0; i < fought; i++) { u32 id; scanf("%u", &id); u32 flag = TRAINER_FLAGS_START + id; flags[flag >> 3] |= 1 << (flag & 7); }
   for (u32 i = 0; i < rematches; i++) { u32 id; scanf("%u", &id); sb.trainerRematches[id] = 1; }
   gTrainerBattleOpponent_A = opponent; printf("%d\\n", ShouldTryRematchBattle()); }
 }
}
`;
writeFileSync(`${dir}/oracle.c`, shim + compiledFunctions + main);
const compiled = spawnSync('cc', ['-std=gnu99', '-w', `${dir}/oracle.c`, '-o', `${dir}/oracle`], { encoding: 'utf8' });
assert.equal(compiled.status, 0, compiled.stderr);
const oracle = (cases: string[]): string[] => {
  const result = spawnSync(`${dir}/oracle`, [], { input: cases.join('\n') + '\n', encoding: 'utf8', maxBuffer: 1e8 });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, cases.length);
  return lines;
};
const dumped = (buffer: Uint8Array) => { const out: number[] = []; for (const byte of buffer) { out.push(byte); if (byte === 0xff) break; } return out.join(' '); };

// Live state: the Hoenn bank layout (Emerald flag/var counts) with only PREPARED vars/flags.
function freshSave(): void {
  setSave(newSaveData());
  save.flags = new Array(C.NUM_FLAG_BYTES).fill(0);
  save.vars = new Array(C.VARS_COUNT).fill(0);
}
const ctx = (opponentA = 0) => ({ ow: { game: { battleSetup: { opponentA } } } }) as never;

// 1. DetermineCyclingRoadResults through GetRecordedCyclingRoadResults / FinishCyclingRoadChallenge.
const frames = [0, 1, 59, 60, 61, 599, 600, 601, 609, 610, 611, 899, 900, 901, 1199, 1200, 1201, 2399, 2400, 2401, 3599, 3600, 3601, 65535, 65536, 70000, 4294967295];
const collisions = [0, 1, 3, 4, 9, 10, 19, 20, 99, 100, 150, 255];
const cases: string[] = []; let compared = 0;
for (const f of frames) for (const k of collisions) cases.push(`D ${f} ${k}`);
const lines = oracle(cases);
cases.forEach((line, i) => {
  const [, f, k] = line.split(' ').map(Number) as [number, number, number];
  freshSave();
  varSet(C.VAR_CYCLING_ROAD_RECORD_TIME_L, f & 0xffff); varSet(C.VAR_CYCLING_ROAD_RECORD_TIME_H, f >>> 16); varSet(C.VAR_CYCLING_ROAD_RECORD_COLLISIONS, k); // PREPARED
  const recorded = f === 0 ? 0 : cycling.GetRecordedCyclingRoadResults();
  if (f === 0) return; // GetRecordedCyclingRoadResults returns FALSE without evaluating a zero record
  assert.equal(recorded, 1);
  assert.equal(`${varGet(SV.RESULT)} ${dumped(stringVars.var1)} | ${dumped(stringVars.var2)}`, lines[i]!.replace(/^(\d+)/, '$1').replace(/\s+/g, ' ').trim(), `D ${f} ${k}`);
  compared++;
});
// GetRecordedCyclingRoadResults: the C result agrees (TRUE and result, or FALSE with a zero record).
const gets = [[0, 0, 0], [1, 0, 5], [3600, 0, 0], [0xffff, 0, 99], [0, 1, 3], [4464, 1, 120], [0, 0xffff, 0]];
const getLines = oracle(gets.map(g => `G ${g.join(' ')}`));
gets.forEach((g, i) => {
  freshSave();
  varSet(C.VAR_CYCLING_ROAD_RECORD_TIME_L, g[0]!); varSet(C.VAR_CYCLING_ROAD_RECORD_TIME_H, g[1]!); varSet(C.VAR_CYCLING_ROAD_RECORD_COLLISIONS, g[2]!); // PREPARED
  varSet(SV.RESULT, 99); // PREPARED
  const returned = cycling.GetRecordedCyclingRoadResults();
  // With no record the C leaves both gStringVars untouched (zeroed by the oracle): compare return and result only.
  const actual = returned ? `${returned} ${varGet(SV.RESULT)} ${dumped(stringVars.var1)} | ${dumped(stringVars.var2)}` : `${returned} ${varGet(SV.RESULT)}`;
  assert.equal(actual.replace(/\s+/g, ' ').trim(), (returned ? getLines[i]! : getLines[i]!.split(' ').slice(0, 2).join(' ')).replace(/\s+/g, ' ').trim(), `G ${g}`);
});

// 2. The challenge: Reset/Begin, collision counting (capped at 100, inactive when no challenge), Finish and the record.
const sessions: number[][] = [];
for (const active of [0, 1]) for (const attempts of [0, 1, 7, 99, 100, 130]) for (const [t0, t1] of [[0, 0], [10, 610], [4294967000, 100], [500, 3700], [0, 70000]]) for (const record of [[0, 0, 0], [900, 0, 2], [3000, 0, 7], [65535, 1, 50]])
  sessions.push([active, attempts, t0!, t1!, ...record]);
const sessionLines = oracle(sessions.map(s => `S ${s.join(' ')}`));
sessions.forEach((s, i) => {
  const [active, attempts, t0, t1, L, H, K] = s as [number, number, number, number, number, number, number];
  freshSave();
  varSet(C.VAR_CYCLING_ROAD_RECORD_TIME_L, L); varSet(C.VAR_CYCLING_ROAD_RECORD_TIME_H, H); varSet(C.VAR_CYCLING_ROAD_RECORD_COLLISIONS, K); // PREPARED
  let counter = t0;
  cycling.SetCyclingRoadFrameCounter(() => counter);
  cycling.ResetCyclingRoadChallengeData();
  if (active) cycling.Special_BeginCyclingRoadChallenge();
  for (let n = 0; n < attempts; n++) cycling.Bike_TryAdvanceCyclingRoadCollisions();
  counter = t1;
  cycling.FinishCyclingRoadChallenge();
  const actual = `${cycling.GetBikeCollisions()} ${varGet(SV.RESULT)} ${varGet(C.VAR_CYCLING_ROAD_RECORD_TIME_L)} ${varGet(C.VAR_CYCLING_ROAD_RECORD_TIME_H)} ${varGet(C.VAR_CYCLING_ROAD_RECORD_COLLISIONS)} ${dumped(stringVars.var1)} | ${dumped(stringVars.var2)}`;
  assert.equal(actual.replace(/\s+/g, ' ').trim(), sessionLines[i]!.replace(/\s+/g, ' ').trim(), `S ${s}`);
});

// 3. ShouldTryRematchBattle: every table row with each combination of first/second battle flags and rematch state.
const rematchCases: string[] = [], expected: number[] = [];
for (let row = 0; row < rematchTable.length; row++) for (const fought of [[], [1], [2], [1, 2]]) for (const wants of [false, true]) {
  const ids = rematchTable[row]!.trainerIds;
  const fightedIds = fought.map(i => ids[i - 1]!).filter(Boolean);
  rematchCases.push(`M ${ids[0]} ${fightedIds.length} ${wants ? 1 : 0} ${fightedIds.join(' ')} ${wants ? row : ''}`);
}
for (const opponent of [0, 1, 4, 65535]) rematchCases.push(`M ${opponent} 0 0`);
const rematchLines = oracle(rematchCases);
rematchCases.forEach((line, i) => {
  const parts = line.split(/\s+/).slice(1).map(Number);
  const [opponent, fought, wants, ...rest] = parts as [number, number, number, ...number[]];
  freshSave();
  for (const id of rest.slice(0, fought)) flagSet(C.TRAINER_FLAGS_START + id);
  save.trainerRematches = new Array(C.MAX_REMATCH_ENTRIES).fill(0);
  if (wants) save.trainerRematches[rest[fought]!] = 1;
  expected.push(ShouldTryRematchBattle(ctx(opponent)));
  assert.equal(String(expected[i]), rematchLines[i], line);
});
console.log(`original C comparison PASS: ${compared} Determine cases + ${gets.length} recorded + ${sessions.length} challenge sessions + ${rematchCases.length} rematch cases (PREPARED vars/flags/counters)`);
