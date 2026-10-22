// GetInteractedMetatileScript (field_control_avatar.c): the original C dispatcher compiled with the
// metatile-behavior predicates replaced by their truth tables, which come from the generated
// pokeemerald predicates (generated/metatileBehavior.ts, from metatile_behavior.c). The comparison covers the
// call order, labels and the elevation branch for every behavior value, direction and elevation match.
// PREPARED: behavior values, directions and elevations. No script execution or rendering.
import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rom, setDataRoot } from '../../src/core/rom.ts';
import * as MB from '../../src/games/emerald/generated/metatileBehavior.ts';
const fetchFile = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (url.startsWith('/') && !existsSync('public' + url)) return new Response('', { status: 404 }); return fetchFile(input, init); }) as typeof fetch;
setDataRoot('/emerald');
await rom.load();
const { GetInteractedMetatileScript } = await import('../../src/games/emerald/fieldControlAvatar.ts');

const decomp = process.env.POKEEMERALD ?? resolve('../refs-src/pokeemerald');
const source = readFileSync(resolve(decomp, 'src/field_control_avatar.c'), 'utf8');
const start = source.indexOf('static const u8 *GetInteractedMetatileScript(struct MapPosition *position');
let depth = 0, end = source.indexOf('{', start);
for (let i = end; i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}' && --depth === 0) { end = i; break; } }
const fn = source.slice(start, end + 1).replace('static ', '');

const predicates = [...new Set(fn.match(/MetatileBehavior_\w+|CheckInteractedWithFriends\w+/g))];
const labels = [...new Set([...fn.matchAll(/return (\w*EventScript_\w+);/g)].map(m => m[1]!))];
const dirPredicates = new Set(predicates.filter(name => MB[name as keyof typeof MB] && (MB[name as keyof typeof MB] as unknown as Function).length === 2));
const table = (name: string): string => {
  const f = (MB as unknown as Record<string, Function>)[name]!;
  const rows: number[][] = [];
  for (let behavior = 0; behavior < 256; behavior++) rows.push(dirPredicates.has(name) ? [0, 1, 2, 3, 4].map(d => (f(behavior, d) ? 1 : 0)) : [f(behavior) ? 1 : 0]);
  return rows.map(r => `{${r.join(',')}}`).join(',');
};
const c = `
#include <stdio.h>
#include <stdint.h>
typedef uint8_t u8; typedef int8_t s8; typedef uint16_t u16; typedef int16_t s16; typedef int bool8;
#define TRUE 1
#define FALSE 0
#define NULL ((void*)0)
struct MapPosition { s16 x, y; s8 elevation; };
int friends = 0, gridElevation = 0;
${labels.map((l, i) => `const u8 ${l}[1] = {${i + 1}};`).join('\n')}
static int MapGridGetElevationAt(int x, int y) { return gridElevation; }
${predicates.filter(p => p.startsWith('MetatileBehavior_')).map(name => `static const u8 t_${name}[256][${dirPredicates.has(name) ? 5 : 1}] = {${table(name)}};
static bool8 ${name}(u8 b${dirPredicates.has(name) ? ', u8 d' : ''}) { return t_${name}[b][${dirPredicates.has(name) ? 'd < 5 ? d : 0' : '0'}]; }`).join('\n')}
${predicates.filter(p => p.startsWith('CheckInteracted')).map(name => `static void ${name}(void) { friends = 1; }`).join('\n')}
${fn}
int main(void) {
  int behavior, direction, match;
  while (scanf("%d %d %d", &behavior, &direction, &match) == 3) {
    struct MapPosition position = { 0, 0, 3 }; friends = 0; gridElevation = match ? 3 : 5;
    const u8 *script = GetInteractedMetatileScript(&position, behavior, direction);
    printf("%d %d\\n", script ? script[0] : 0, friends);
  }
}
`;
const dir = '.decomp-build/checks/metatile-scripts'; mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/oracle.c`, c);
const compiled = spawnSync('cc', ['-std=gnu99', '-w', `${dir}/oracle.c`, '-o', `${dir}/oracle`], { encoding: 'utf8' });
assert.equal(compiled.status, 0, compiled.stderr);
const cases: number[][] = [];
for (let behavior = 0; behavior < 256; behavior++) for (let direction = 0; direction < 5; direction++) for (const match of [0, 1]) cases.push([behavior, direction, match]);
const result = spawnSync(`${dir}/oracle`, [], { input: cases.map(k => k.join(' ')).join('\n') + '\n', encoding: 'utf8', maxBuffer: 1e8 });
assert.equal(result.status, 0, result.stderr);
const lines = result.stdout.trim().split('\n');
assert.equal(lines.length, cases.length);
let scripts = 0, friendsCases = 0;
cases.forEach(([behavior, direction, match], i) => {
  const [expectedLabel, friends] = lines[i]!.split(' ').map(Number) as [number, number];
  const position = { x: 0, y: 0, elevation: 3 };
  let actual: number;
  try { actual = GetInteractedMetatileScript(position, behavior!, direction!, match ? 3 : 5); } catch (error) {
    assert.equal(friends, 1, `ported function stopped where C does not call CheckInteractedWithFriends*: ${error}`);
    friendsCases++;
    return;
  }
  assert.equal(friends, 0, `C calls CheckInteractedWithFriends* for ${cases[i]}`);
  const expected = expectedLabel === 0 ? 0 : rom.label(labels[expectedLabel - 1]!);
  assert.equal(actual, expected, `behavior ${behavior} direction ${direction} elevation match ${match}`);
  if (actual) scripts++;
});
console.log(`original C comparison PASS: ${cases.length} PREPARED (behavior, direction, elevation) cases, ${scripts} scripts, ${friendsCases} secret-base furniture stops`);
