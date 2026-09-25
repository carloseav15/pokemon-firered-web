// Headless check for the battle animation ports (battle_anim*.c).
// Boots a real wild battle (CB2_InitBattle) in Node with the exported data,
// waits for the action menu, then runs every move animation script (and the
// general/special/status tables) from both sides. Each script must finish
// within a frame budget without throwing and leave no stray tasks/sprites.
// Missing sprite callbacks / tasks (not yet ported) are reported as warnings.
//
// Run with: npm run check:anims  [-- --moves 1-50] [-- --verbose]

import './setupNodeGbaMock.ts';
import { readFileSync } from 'node:fs';
import * as C from '../../src/fr/generated/constants.ts';
import { rom } from '../../src/fr/rom.ts';
import { sound } from '../../src/fr/audio/sound.ts';
import { loadTrig } from '../../src/fr/hw/trig.ts';
import { runHwFrame, SetMainCallback2 } from '../../src/fr/hw/runtime.ts';
import { ppu } from '../../src/fr/hw/ppu.ts';
import { gSprites, MAX_SPRITES } from '../../src/fr/hw/sprite.ts';
import { tasks } from '../../src/fr/gba/tasks.ts';
import { A_BUTTON, joy } from '../../src/fr/gba/input.ts';
import { preloadBattleAssets } from '../../src/fr/battle/preload.ts';
import { G, resetBattleStructs } from '../../src/fr/battle/globals.ts';
import { CB2_InitBattle } from '../../src/fr/battle/main_init.ts';
import { CopyMon, gEnemyParty, ZeroEnemyPartyMons, type Mon } from '../../src/fr/pokemon/mon.ts';
import { createMon } from '../../src/fr/pokemon/pokemon.ts';
import { save } from '../../src/fr/save.ts';
import { animState, LaunchBattleAnimation, type AnimTable } from '../../src/fr/battle/anim.ts';
import { SetBattlerSpriteAffineMode } from '../../src/fr/battle/gfx_sfx_util.ts';
import { DisableStruct } from '../../src/fr/generated/structs.ts';

const root = process.cwd() + '/public';
(globalThis as any).fetch = async (url: string) => {
  const path = root + String(url).replace(/^\/?/, '/');
  const buf = readFileSync(path);
  return {
    ok: true,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    text: async () => buf.toString('utf8'),
  };
};

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const renderFrames = argv.includes('--render');
let moveRange: [number, number] = [1, C.MOVES_COUNT - 1];
const mi = argv.indexOf('--moves');
if (mi >= 0) {
  const [a, b] = argv[mi + 1].split('-').map(Number);
  moveRange = [a, b ?? a];
}

const warnings = new Map<string, number>();
const origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = args.map(String).join(' ');
  warnings.set(msg, (warnings.get(msg) ?? 0) + 1);
  if (verbose) origWarn(msg);
};

await rom.load();
await loadTrig();
await preloadBattleAssets();
sound.init(rom.constants);

// Player: level 50 Venusaur; enemy: level 50 Charizard (both visible, single battle).
save.party.length = 0;
save.party.push(createMon(C.SPECIES_VENUSAUR, 50));
resetBattleStructs();
G.gBattleTypeFlags = 0;
ZeroEnemyPartyMons();
CopyMon(gEnemyParty[0], createMon(C.SPECIES_CHARIZARD, 50) as unknown as Mon);
SetMainCallback2(CB2_InitBattle);

function frame(): void {
  joy.poll();
  runHwFrame();
  sound.frame();
  if (renderFrames) ppu.renderFrame();
}

// Run until the battle reaches the player's action selection.
let frames = 0;
while (frames < 3000) {
  const ready = G.gBattleMainFunc?.name === 'HandleTurnActionSelectionState';
  if (ready && frames > 400) break;
  if (!ready && frames % 16 === 0) joy.press(A_BUTTON);
  frame();
  joy.release(A_BUTTON);
  frames++;
}
for (let k = 0; k < 60; k++) frame(); // let the action menu finish drawing
console.log(`battle ready after ${frames} frames (main=${G.gBattleMainFunc?.name})`);

function usedSprites(): number {
  let n = 0;
  for (let i = 0; i < MAX_SPRITES; i++) if (gSprites[i].inUse) n++;
  return n;
}

function moveLabel(move: number): string {
  return String(Object.entries(C).find(([k, v]) => k.startsWith('MOVE_') && v === move)?.[0] ?? move);
}

type Failure = { what: string; reason: string };
const failures: Failure[] = [];

function runAnim(table: AnimTable, id: number, attacker: number, target: number, label: string): void {
  const baseSprites = usedSprites();
  const baseTasks = tasks.count();
  animState.gBattleAnimAttacker = attacker;
  animState.gBattleAnimTarget = target;
  animState.gAnimMoveTurn = 0;
  animState.gAnimMovePower = 80;
  animState.gAnimMoveDmg = 30;
  animState.gAnimFriendship = 255;
  animState.gWeatherMoveAnim = 0;
  animState.gAnimDisableStructPtr = new DisableStruct(new Uint8Array(DisableStruct.SIZE));
  try {
    SetBattlerSpriteAffineMode(C.ST_OAM_AFFINE_OFF);
    LaunchBattleAnimation(table, id, table === 'moves');
    let n = 0;
    while (animState.gAnimScriptActive && n < 1500) {
      animState.gAnimScriptCallback();
      frame();
      n++;
    }
    SetBattlerSpriteAffineMode(C.ST_OAM_AFFINE_NORMAL);
    if (animState.gAnimScriptActive) {
      failures.push({ what: label, reason: `did not finish in ${n} frames (visual=${animState.gAnimVisualTaskCount} sound=${animState.gAnimSoundTaskCount})` });
      animState.gAnimScriptActive = false;
    }
    // Let lingering sprites (e.g. those destroyed on the next frame) settle.
    for (let k = 0; k < 4; k++) frame();
    const s = usedSprites();
    const t = tasks.count();
    if (s !== baseSprites) failures.push({ what: label, reason: `sprites ${baseSprites} -> ${s}` });
    if (t !== baseTasks) failures.push({ what: label, reason: `tasks ${baseTasks} -> ${t}` });
    if (verbose) console.log(`${label}: ${n} frames`);
  } catch (e) {
    failures.push({ what: label, reason: `threw ${(e as Error).stack?.split('\n').slice(0, 4).join(' | ')}` });
    animState.gAnimScriptActive = false;
  }
  animState.gAnimVisualTaskCount = 0;
  animState.gAnimSoundTaskCount = 0;
}

for (let move = moveRange[0]; move <= moveRange[1]; move++) {
  runAnim('moves', move, 0, 1, `move ${move} ${moveLabel(move)} (player)`);
  runAnim('moves', move, 1, 0, `move ${move} ${moveLabel(move)} (enemy)`);
}

console.log(`\n${failures.length} failures`);
for (const f of failures) console.log(`  FAIL ${f.what}: ${f.reason}`);
const missing = [...warnings.keys()].filter((w) => w.includes('not implemented'));
console.log(`\n${missing.length} unported callbacks/tasks referenced:`);
for (const w of missing.sort()) console.log(`  ${w}`);
const other = [...warnings.keys()].filter((w) => !w.includes('not implemented'));
if (other.length) {
  console.log(`\nother warnings:`);
  for (const w of other) console.log(`  ${w} (x${warnings.get(w)})`);
}
process.exitCode = failures.length ? 1 : 0;
