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

export type LaunchOptions =
  | { mode: "new"; playerName: string; gender: number; rivalName: string }
  | { mode: "continue" }
  | { mode: "sandbox" };

let running: Game | undefined;

export function hasFireRedSave(): boolean {
  return saveStore.exists();
}

export async function launchFireRed(options: LaunchOptions, container: HTMLElement = document.getElementById("game")!): Promise<Game> {
  if (running) return running;
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
  // Debug hook: step frames with buttons held (independent of rAF throttling).
  (window as unknown as { frDebug: unknown }).frDebug = {
    game, rom, joy, save: saveModule,
    run(frames: number, buttons = 0): void {
      joy.press(buttons);
      for (let i = 0; i < frames; i++) game.frame();
      joy.release(buttons);
      game.render();
    },
    /** Run frames while letting fetches resolve between batches. */
    async wait(frames: number, buttons = 0): Promise<void> {
      const debug = (window as unknown as { frDebug: { run(n: number, b?: number): void } }).frDebug;
      for (let i = 0; i < frames; i += 4) {
        debug.run(4, buttons);
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
  game.start();
  canvas.focus();
  return game;
}
