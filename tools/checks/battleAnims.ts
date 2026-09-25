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
import { DestroySprite, gSprites, MAX_SPRITES } from '../../src/fr/hw/sprite.ts';
import { tasks } from '../../src/fr/gba/tasks.ts';
import { A_BUTTON, joy } from '../../src/fr/gba/input.ts';
import { preloadBattleAssets } from '../../src/fr/battle/preload.ts';
import { G, gBattlerSpriteIds, gBattleSpritesDataPtr, resetBattleStructs } from '../../src/fr/battle/globals.ts';
import { TryShinyAnimation } from '../../src/fr/battle/anims/special.ts';
import { CB2_InitBattle } from '../../src/fr/battle/main_init.ts';
import { CopyMon, gEnemyParty, GetMonData, SetMonData, ZeroEnemyPartyMons, type Mon } from '../../src/fr/pokemon/mon.ts';
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

function runAnim(table: AnimTable, id: number, attacker: number, target: number, label: string, spriteDelta = 0): void {
  const baseSprites = usedSprites();
  const baseTasks = tasks.count();
  const baseTaskIds = new Set(tasks.tasks.map((t, i) => (t.isActive ? i : -1)).filter((i) => i >= 0));
  const baseSpriteIds = new Set(gSprites.map((s, i) => (s.inUse ? i : -1)).filter((i) => i >= 0));
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
    // Ball-open particles and mon fades outlive the script by up to ~60 frames.
    for (let k = 0; k < (table === 'moves' ? 4 : 90); k++) frame();
    const s = usedSprites();
    const t = tasks.count();
    if (s !== baseSprites + spriteDelta) failures.push({ what: label, reason: `sprites ${baseSprites} -> ${s}` });
    if (t !== baseTasks) failures.push({ what: label, reason: `tasks ${baseTasks} -> ${t}` });
    if (verbose) console.log(`${label}: ${n} frames`);
  } catch (e) {
    failures.push({ what: label, reason: `threw ${(e as Error).stack?.split('\n').slice(0, 4).join(' | ')}` });
    animState.gAnimScriptActive = false;
  }
  // Isolate the next animation from anything this one left behind.
  tasks.tasks.forEach((t, i) => { if (t.isActive && !baseTaskIds.has(i)) tasks.destroy(i); });
  gSprites.forEach((s, i) => { if (s.inUse && !baseSpriteIds.has(i)) DestroySprite(s); });
  animState.gAnimVisualTaskCount = 0;
  animState.gAnimSoundTaskCount = 0;
}

for (let move = moveRange[0]; move <= moveRange[1]; move++) {
  runAnim('moves', move, 0, 1, `move ${move} ${moveLabel(move)} (player)`);
  runAnim('moves', move, 1, 0, `move ${move} ${moveLabel(move)} (enemy)`);
}

function restoreBattlers(): void {
  for (let b = 0; b < 2; b++) {
    const sprite = gSprites[gBattlerSpriteIds[b]];
    sprite.invisible = false;
    sprite.x2 = sprite.y2 = 0;
  }
}

if (!argv.includes('--moves-only')) {
  // gBattleAnims_General (28) and gBattleAnims_StatusConditions (10), from both sides.
  for (let id = 0; id < 28; id++) {
    // Bait/rock throws wait for the Safari trainer back sprite's throw frame.
    if (id === C.B_ANIM_BAIT_THROW || id === C.B_ANIM_ROCK_THROW) continue;
    runAnim('general', id, 0, 1, `general ${id} (player)`);
    runAnim('general', id, 1, 0, `general ${id} (enemy)`);
    restoreBattlers();
  }
  for (let id = 0; id < 10; id++) {
    runAnim('status', id, 0, 1, `status ${id} (player)`);
    runAnim('status', id, 1, 0, `status ${id} (enemy)`);
    restoreBattlers();
  }
  // gBattleAnims_Special: level up, switch outs, substitute swaps, and ball throws
  // with every ball and every non-capturing outcome (the capture itself runs last:
  // it destroys the wild mon's sprite).
  for (const id of [C.B_ANIM_LVL_UP, C.B_ANIM_SWITCH_OUT_PLAYER_MON, C.B_ANIM_SWITCH_OUT_OPPONENT_MON, C.B_ANIM_SUBSTITUTE_TO_MON, C.B_ANIM_MON_TO_SUBSTITUTE]) {
    runAnim('special', id, 0, 1, `special ${id} (player)`);
    restoreBattlers();
  }
  const balls = [C.ITEM_POKE_BALL, C.ITEM_GREAT_BALL, C.ITEM_ULTRA_BALL, C.ITEM_MASTER_BALL, C.ITEM_SAFARI_BALL, C.ITEM_NET_BALL,
    C.ITEM_DIVE_BALL, C.ITEM_NEST_BALL, C.ITEM_REPEAT_BALL, C.ITEM_TIMER_BALL, C.ITEM_LUXURY_BALL, C.ITEM_PREMIER_BALL];
  for (const ball of balls) {
    for (const caseId of [C.BALL_NO_SHAKES, 1, 2, 3, C.BALL_TRAINER_BLOCK, C.BALL_GHOST_DODGE]) {
      G.gLastUsedItem = ball;
      gBattleSpritesDataPtr.animationData.ballThrowCaseId = caseId;
      runAnim('special', C.B_ANIM_BALL_THROW, 0, 1, `ball throw item ${ball} case ${caseId}`);
      restoreBattlers();
    }
  }
  // Shiny sparkles on the wild mon (TryShinyAnimation's tasks, run outside a script).
  {
    const baseSprites = usedSprites();
    const baseTasks = tasks.count();
    const mon = createMon(C.SPECIES_CHARIZARD, 50) as unknown as Mon;
    SetMonData(mon, C.MON_DATA_OT_ID, GetMonData(mon, C.MON_DATA_PERSONALITY));
    gBattleSpritesDataPtr.healthBoxesData[1].finishedShinyMonAnim = 0;
    TryShinyAnimation(1, mon);
    let n = 0;
    while (!gBattleSpritesDataPtr.healthBoxesData[1].finishedShinyMonAnim && n < 600) { frame(); n++; }
    for (let k = 0; k < 60; k++) frame(); // the first sparkle task outlives the second
    if (!gBattleSpritesDataPtr.healthBoxesData[1].finishedShinyMonAnim) failures.push({ what: 'shiny sparkles', reason: 'did not finish' });
    else if (usedSprites() !== baseSprites || tasks.count() !== baseTasks) failures.push({ what: 'shiny sparkles', reason: `sprites ${baseSprites}->${usedSprites()} tasks ${baseTasks}->${tasks.count()}` });
    else if (verbose) console.log(`shiny sparkles: ${n} frames`);
  }
  G.gLastUsedItem = C.ITEM_POKE_BALL;
  gBattleSpritesDataPtr.animationData.ballThrowCaseId = C.BALL_3_SHAKES_SUCCESS;
  runAnim('special', C.B_ANIM_BALL_THROW, 0, 1, 'ball throw capture', -1); // the caught mon's sprite is freed
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
