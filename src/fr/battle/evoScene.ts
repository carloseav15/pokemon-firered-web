// evolution_scene.c (battle path): the evolution presentation. Source runs a
// task state machine with sprite transitions, sparkles, music and a B-hold
// cancel window; this keeps the same message/music/cancel/dex/learn-move order
// (intro message, cry, evolution music, white flashes with B cancel, congrats
// or stopped message, Shedinja split, new-move learning) while the sprite and
// background animation callbacks are pending. Completion restores the battle
// callback so WaitForEvoSceneToFinish resumes TryEvolvePokemon.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { stringVars } from "../gba/charmap";
import { B_BUTTON, joy } from "../gba/input";
import { gMain, SetMainCallback1, SetMainCallback2, SetVBlankCallback } from "../hw/runtime";
import { BeginNormalPaletteFade, gPaletteFade, PALETTES_ALL, RGB_WHITE, TransferPlttBuffer, UpdatePaletteFade } from "../hw/palette";
import { rom } from "../rom";
import { flagGet, incrementGameStat, varGet } from "../save";
import { evolveMon, speciesName, type Pokemon } from "../pokemon/pokemon";
import type { Mon } from "../pokemon/mon";
import { openHardwareMessage } from "../menus/hardwareChoice";
import { learnLevelUpMoves, trySpawnShedinja } from "../menus/monProgress";

const FLASH_CYCLES = 4;
const INTRO_SE_FRAMES = 12;

/**
 * Flash the screen white with a B-hold cancel window (EVOSTATE_WAIT_CYCLE_MON_SPRITE).
 * done(true) when B was held while cancellable.
 */
function flashLoop(cancellable: boolean, done: (stopped: boolean) => void): void {
  let wait = INTRO_SE_FRAMES;
  let phase: "out" | "back" = "out";
  let cycle = 0;
  let stopped = false;
  let fadingOut = false;
  SetVBlankCallback(TransferPlttBuffer);
  SetMainCallback2(() => {
    UpdatePaletteFade();
    if (cancellable && (joy.held & B_BUTTON) !== 0) stopped = true;
    if (stopped && !fadingOut) {
      fadingOut = true;
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_WHITE);
      return;
    }
    if (fadingOut) {
      if (!gPaletteFade.active) done(true);
      return;
    }
    if (wait > 0) {
      wait--;
      if (wait === 0) {
        sound.playBGM(sound.c("MUS_EVOLUTION"));
        BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_WHITE);
      }
      return;
    }
    if (gPaletteFade.active) return;
    if (phase === "out") {
      phase = "back";
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_WHITE);
    } else if (++cycle >= FLASH_CYCLES) {
      done(false);
    } else {
      phase = "out";
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_WHITE);
    }
  });
}

export function EvolutionScene(mon: Mon, targetSpecies: number, canStopEvo: boolean, _partyId: number): void {
  // WaitForEvoSceneToFinish resumes once this is BattleMainCB2 again.
  const resume = gMain.callback2;
  const cb1 = gMain.callback1;
  const finish = (): void => {
    sound.stopBGM();
    SetMainCallback1(cb1);
    SetVBlankCallback(null);
    SetMainCallback2(resume);
  };
  // Without the national dex, mons past Mew auto-cancel (TASK_BIT path).
  const national = varGet(C.VAR_NATIONAL_DEX) === 0x6258 && flagGet(C.FLAG_SYS_NATIONAL_DEX);
  const autoStop = !national && targetSpecies > C.SPECIES_MEW;
  const preSpecies = mon.species;
  const target = targetSpecies;
  const poke = mon as Pokemon;
  stringVars.var1 = Uint8Array.from(mon.nickname);
  sound.stopBGM(); // m4aMPlayAllStop
  SetMainCallback1(null);
  openHardwareMessage(rom.text("gText_PkmnIsEvolving"), () => {
    sound.playCry(preSpecies, 0);
    sound.playSE(sound.c("MUS_EVOLUTION_INTRO"));
    flashLoop(canStopEvo && !autoStop, (stopped) => {
      if (stopped || autoStop) {
        // EVOSTATE_CANCEL_MSG: Huh? stopped evolving (or ...? when auto-stopped).
        sound.stopBGM();
        sound.playCry(preSpecies, 0);
        openHardwareMessage(
          rom.text(autoStop ? "gText_EllipsisQuestionMark" : "gText_PkmnStoppedEvolving"),
          () => learnLevelUpMoves(poke, finish),
        );
        return;
      }
      // EVOSTATE_SET_MON_EVOLVED: evolve, rename, dex, stat, congrats.
      evolveMon(poke, target);
      incrementGameStat(C.GAME_STAT_EVOLVED_POKEMON);
      sound.playCry(target, 0);
      sound.playFanfare(C.MUS_EVOLVED);
      stringVars.var2 = speciesName(target);
      openHardwareMessage(rom.text("gText_CongratsPkmnEvolved"), () => {
        trySpawnShedinja(poke, preSpecies);
        learnLevelUpMoves(poke, finish);
      });
    });
  });
}
