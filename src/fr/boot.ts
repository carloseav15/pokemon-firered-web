// Starts the FireRed engine: loads the exported decomp data, mounts the
// 240x160 canvas and begins a new game or continues the saved one.

import { loadCData, preloadPacks } from "./hw/assets";
import { sound } from "./audio/sound";
import { createM4aBackend } from "./audio/m4a";
import { Game } from "./game";
import { rom } from "./rom";
import { joy } from "./gba/input";
import * as saveModule from "./save";
import { saveStore } from "./save";
import { loadFieldFx } from "./field/fieldEffects";
import { preloadFieldAssets } from "./field/preloadField";
import { loadTrig } from "./hw/trig";
import { installBattleHost } from "./battle/host";
import { preloadBattleAssets } from "./battle/preload";
import { createMon } from "./pokemon/pokemon";
import { RIVAL_BATTLE_HEAL_AFTER, RIVAL_BATTLE_TUTORIAL } from "./generated/constants";
import { getRandomState, SeedRngAndSetTrainerId } from "./random";
import { sWildEncounterData, sWildEncountersDisabled } from "./field/wildEncounter";
import { tasks } from "./gba/tasks";
import { gMain } from "./hw/runtime";
import { preloadHelpSystem } from "./helpSystemUtil";

export type LaunchOptions = (
  | { mode: "new"; playerName: string; gender: number; rivalName: string }
  | { mode: "continue" }
  | { mode: "sandbox" }) & {
    /** Direct-launch tests only. No rAF frames; explicit Timer1 input before new/continue initialization. */
    test?: { timer1Low: number };
  };

let running: Game | undefined;

export function hasFireRedSave(): boolean {
  return saveStore.exists();
}

export async function launchFireRed(options: LaunchOptions, container: HTMLElement = document.getElementById("game")!): Promise<Game> {
  if (running) {
    if (options.test) throw new Error("A test session requires a fresh page");
    return running;
  }
  const manualFrames = options.test !== undefined;
  if (options.test && (!Number.isInteger(options.test.timer1Low) || options.test.timer1Low < 0 || options.test.timer1Low > 0xffff))
    throw new Error("test.timer1Low must be a u16 integer");
  container.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 160;
  canvas.className = "fr-screen";
  canvas.tabIndex = 0;
  container.appendChild(canvas);
  const status = document.createElement("div");
  status.className = "fr-status";
  status.textContent = "Loading FireRed data…";
  container.appendChild(status);
  try {
    await rom.load((label) => { status.textContent = `Loading ${label}…`; });
    await loadFieldFx();
    await loadCData("wild_encounter", "berry");
    // braille_text.c glyphs and the text_printer.c half-row table for FONT_BRAILLE,
    // "text" for the text.c glyph width tables (sFont*GlyphWidths) and keypad icons.
    // help_message.c window tiles for the START menu descriptions.
    await Promise.all([loadCData("text_printer", "text"), preloadPacks(["graphics_fonts", "graphics_help_system", "graphics_quest_log"])]);
    await preloadFieldAssets();
    await loadTrig();
    status.textContent = "Loading battle data…";
    await preloadBattleAssets();
    await sound.loadCryData();
    if (manualFrames) await preloadHelpSystem();
  } catch (error) {
    status.textContent = `Could not load game data. Run: python3 tools/decomp/export.py\n${String(error)}`;
    throw error;
  }
  status.remove();
  sound.init(rom.constants);
  sound.m4aSoundInit(createM4aBackend());
  const game = new Game(canvas);
  installBattleHost(game);
  running = game;
  (window as unknown as { frGame: Game }).frGame = game;
  let recording: { version: number; timer1Low: number; startFrame: number; initialState: unknown; inputs: number[] } | null = null;
  // Debug hook: normal mode remains independent of rAF; tests have exclusive frame ownership.
  (window as unknown as { frDebug: unknown }).frDebug = {
    game, rom, joy, save: saveModule,
    executionMode: manualFrames ? "manual" : "realtime",
    snapshot() {
      const ow = game.overworld, script = ow.script.global;
      // Deliberately a projection. No callbacks, closures, sprites, audio or full battle state are serialized.
      return JSON.parse(JSON.stringify({ version: 1, execution: game.executionSnapshot(), save: saveModule.save,
        random: getRandomState(), wild: { ...sWildEncounterData, disabled: sWildEncountersDisabled }, input: joy.snapshot(),
        hardware: { state: gMain.state, inBattle: gMain.inBattle, vblankCounter2: gMain.vblankCounter2,
          callback1: gMain.callback1?.name ?? null, callback2: gMain.callback2?.name ?? null },
        field: { map: ow.loaded?.header.id ?? null, locked: ow.controlsLocked,
          objects: ow.objects.objects.map(o => o ? { localId: o.localId, currentCoords: o.currentCoords,
            previousCoords: o.previousCoords, facingDirection: o.facingDirection, movementType: o.movementType,
            invisible: o.invisible } : null) },
        script: { mode: script.mode, scriptPtr: script.scriptPtr, stack: script.stack,
          native: script.nativePtr?.name ?? null, comparisonResult: script.comparisonResult, data: script.data, entry: script.entry },
        tasks: tasks.tasks.map(t => ({ active: t.isActive, func: t.func.name, priority: t.priority,
          prev: t.prev, next: t.next, data: t.data, followup: t.followup?.name ?? null })) }));
    },
    beginRecording() {
      if (!options.test) throw new Error("Input recording requires a manual test session");
      if (recording) throw new Error("Input recording already active");
      const debug = (window as unknown as { frDebug: { snapshot(): unknown } }).frDebug;
      recording = { version: 1, timer1Low: options.test.timer1Low, startFrame: game.frameCount, initialState: debug.snapshot(), inputs: [] };
    },
    endRecording() {
      if (!recording) throw new Error("Input recording is not active");
      const result = recording;
      recording = null;
      return result;
    },
    run(frames: number, buttons = 0): void {
      if (!Number.isInteger(frames) || frames < 0) throw new Error("frames must be a nonnegative integer");
      if (!Number.isInteger(buttons) || buttons < 0 || buttons > 0x3ff) throw new Error("buttons must be a GBA key mask");
      if (manualFrames) {
        for (let i = 0; i < frames; i++) {
          joy.release(0x3ff);
          joy.press(buttons);
          recording?.inputs.push(buttons);
          game.frame();
          joy.release(0x3ff);
          // HBlank/VCount callbacks currently run in render: retain one render per manual frame, independent of batch size.
          game.render();
        }
        return;
      }
      joy.press(buttons);
      for (let i = 0; i < frames; i++) game.frame();
      joy.release(buttons);
      game.render();
    },
    /** Run frames while letting fetches resolve between batches. */
    async wait(frames: number, buttons = 0): Promise<void> {
      if (!Number.isInteger(frames) || frames < 0) throw new Error("frames must be a nonnegative integer");
      if (!Number.isInteger(buttons) || buttons < 0 || buttons > 0x3ff) throw new Error("buttons must be a GBA key mask");
      const debug = (window as unknown as { frDebug: { run(n: number, b?: number): void } }).frDebug;
      for (let i = 0; i < frames; i += 4) {
        debug.run(Math.min(4, frames - i), buttons);
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    },
    /** Hold a direction until the player has moved `tiles` tiles (or is blocked). */
    async walk(dir: "U" | "D" | "L" | "R", tiles = 1): Promise<unknown> {
      const bits = { R: 0x10, L: 0x20, U: 0x40, D: 0x80 }[dir];
      const debug = (window as unknown as { frDebug: { run(n: number, b?: number): void; wait(n: number, b?: number): Promise<void>; state(): unknown } }).frDebug;
      const object = () => game.overworld.player.object;
      const start = { ...object().currentCoords };
      const moved = () => Math.abs(object().currentCoords.x - start.x) + Math.abs(object().currentCoords.y - start.y);
      for (let frame = 0; frame < 40 * tiles + 40; frame++) {
        // Release once the last step has started so the player stops on that tile.
        debug.run(1, moved() >= tiles ? 0 : bits);
        if (frame % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 1));
        if (moved() >= tiles && game.overworld.player.tileTransitionState !== 1) break;
      }
      await debug.wait(8);
      return debug.state();
    },
    async press(button: "A" | "B" | "START" | "SELECT", frames = 30): Promise<void> {
      const bits = { A: 1, B: 2, SELECT: 4, START: 8 }[button];
      const debug = (window as unknown as { frDebug: { wait(n: number, b?: number): Promise<void> } }).frDebug;
      await debug.wait(4, bits);
      await debug.wait(frames);
    },
    /** Debug: give a level-5 starter and start the Oak's Lab rival battle (as after choosing a starter). */
    rivalBattle(starter = "SPECIES_BULBASAUR"): void {
      const rivalMon: Record<string, string> = {
        SPECIES_BULBASAUR: "TRAINER_RIVAL_OAKS_LAB_CHARMANDER",
        SPECIES_SQUIRTLE: "TRAINER_RIVAL_OAKS_LAB_BULBASAUR",
        SPECIES_CHARMANDER: "TRAINER_RIVAL_OAKS_LAB_SQUIRTLE",
      };
      saveModule.save.party.length = 0;
      saveModule.save.party.push(createMon(rom.c(starter), 5));
      const bs = game.battleSetup;
      bs.mode = rom.c("TRAINER_BATTLE_EARLY_RIVAL");
      bs.rivalFlags = RIVAL_BATTLE_HEAL_AFTER | RIVAL_BATTLE_TUTORIAL;
      bs.opponentA = rom.c(rivalMon[starter] ?? "TRAINER_RIVAL_OAKS_LAB_SQUIRTLE");
      bs.startTrainerBattle();
    },
    state(): unknown {
      const object = game.overworld.player.object;
      return object && { x: object.currentCoords.x - 7, y: object.currentCoords.y - 7, facing: object.facingDirection, map: game.overworld.loaded?.header.id, script: game.overworld.script.isActive?.() };
    },
  };
  if (options.test) {
    saveModule.setSaveStorageKey(saveModule.SANDBOX_STORAGE_KEY);
    SeedRngAndSetTrainerId(options.test.timer1Low);
  }
  if (options.mode === "sandbox") {
    saveModule.setSaveStorageKey(saveModule.SANDBOX_STORAGE_KEY);
    const data = saveStore.load();
    if (data) game.continueGame(data);
    else game.newGame("RED", 0, "GREEN");
  } else if (options.mode === "continue") {
    const data = saveStore.load();
    if (data) game.continueGame(data);
    else game.newGame("RED", 0, "GREEN");
  } else {
    game.newGame(options.playerName, options.gender, options.rivalName);
  }
  if (manualFrames) {
    // Initial map bytes are PREPARED before any frames. Later map/screen loads remain outside phase-one guarantees.
    await game.overworld.prepareMap(game.overworld.mapIdForWarp(saveModule.save.location),
      options.mode === "new" ? undefined : saveModule.save.mapLayoutId);
  }
  game.start({ manualFrames });
  canvas.focus();
  return game;
}
