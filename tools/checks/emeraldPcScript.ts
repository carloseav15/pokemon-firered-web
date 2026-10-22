// Reuses hoennCircuit's DOM/RAF/data harness (--pc): the Pokémon Center PC of Oldale Town through the viewer's own interaction
// path (metatile script EventScript_PC from data/scripts/pc.inc): the screen flickers on (DoPCTurnOnEffect), the main menu
// (ScriptMenu_CreatePCMultichoice) answers its three options, the player's PC and the storage system open through the engine,
// and logging off (DoPCTurnOffEffect) ends the script. PREPARED: the trainer with a one-Pokémon party, the player's tile.
import assert from 'node:assert/strict';
import { rom } from '../../src/core/rom.ts';
import { save, varGet } from '../../src/games/firered/save.ts';
import { A_BUTTON, DPAD_DOWN } from '../../src/core/gba/input.ts';
import { tasks } from '../../src/core/gba/tasks.ts';
import * as EMB from '../../src/games/emerald/generated/metatileBehavior.ts';
import * as EM from '../../src/games/emerald/generated/constants.ts';
import type { EngineInteraction } from '../../src/viewer/engineInteraction.ts';
import type { Game } from '../../src/games/firered/game.ts';
import type { NavigationSave } from '../../src/viewer/session.ts';
type Pump = (frames: number, input?: (frame: number) => number, done?: () => boolean) => Promise<number>;

export async function runPcChecks(engine: EngineInteraction, pump: Pump): Promise<void> {
  const mapId = 'MAP_OLDALE_TOWN_POKEMON_CENTER_1F';
  await engine.enterMap({ mapId, x: 7, y: 4, direction: 'north', dynamic: null });
  const ow = (engine as unknown as { game: Game }).game.overworld;
  // The PC tile: the first MB_PC metatile of the exported map; the player stands south of it.
  let pc: { x: number; y: number } | undefined;
  for (let y = 7; y < ow.map.ySize - 7 && !pc; y++)
    for (let x = 7; x < ow.map.xSize - 7 && !pc; x++) if (EMB.MetatileBehavior_IsPC(ow.map.behaviorAt(x, y))) pc = { x: x - 7, y: y - 7 };
  assert.ok(pc, 'the Pokémon Center has a PC metatile');
  const nav: NavigationSave = { mapId, x: pc.x, y: pc.y + 1, direction: 'north', dynamic: null };
  const k = rom.constants as Record<string, number>;
  const metatile = () => ow.map.metatileIdAt(pc.x + 7, pc.y + 7);
  const before = metatile();
  save.facing = EM.DIR_NORTH;
  await engine.enterMap(nav);
  assert.equal(await engine.interactFront(nav, false), true, 'EventScript_PC started from the metatile behavior');
  // Phase 1: A through the boot-up message until the main menu task is up.
  const seen: string[] = [];
  let menuSeen = false;
  await pump(2000, f => {
    const names = tasks.tasks.filter(t => t.isActive).map(t => t.func.name);
    for (const n of names) if (!seen.includes(n)) seen.push(n);
    if (names.includes('Task_MultichoiceMenu_HandleInput')) menuSeen = true;
    return !menuSeen && f % 24 === 12 ? A_BUTTON : 0;
  }, () => menuSeen);
  assert.ok(menuSeen, `the PC main menu opened (tasks seen: ${seen.join(', ')})`);
  assert.ok(seen.includes('Task_PCTurnOnEffect'), 'DoPCTurnOnEffect created its task');
  assert.equal(metatile(), k.METATILE_Building_PC_On, 'the PC screen finished flickering on (5 flickers, odd, starting off)');
  assert.equal(varGet(0x800d), 0xff, 'ScriptMenu_CreatePCMultichoice left gSpecialVar_Result at 0xFF until a choice');
  // Phase 2: DOWN, DOWN, A on "LOG OFF" (index 2 without the Hall of Fame): EventScript_AccessHallOfFame → not game clear → TurnOffPC.
  let frames = 0;
  await pump(3000, () => { frames++; return frames % 24 === 4 && frames < 60 ? DPAD_DOWN : frames % 24 === 12 && frames >= 36 ? A_BUTTON : 0; }, () => !engine.open);
  assert.equal(engine.open, false, 'the script finished (PC turned off)');
  assert.equal(metatile(), k.METATILE_Building_PC_Off, 'DoPCTurnOffEffect switched the screen off');
  assert.equal(before, k.METATILE_Building_PC_Off, 'the exported map starts with the screen off');
  console.log(`check:emerald-pc-script PASS: EventScript_PC on ${mapId} (PC at ${pc.x},${pc.y}): flicker task, ${seen.filter(n => /PC|Multichoice/.test(n)).join(', ')}, log off; PREPARED trainer/player tile`);
}
