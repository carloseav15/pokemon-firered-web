// Arnés de animaciones de movimientos: arranca el motor FireRed, monta un combate sencillo (jugador contra un rival salvaje),
// espera a que termine la presentación y reproduce animaciones de movimientos bajo demanda. Se usa desde ?fr=anims
// (la ficha del dex lo incrusta en un iframe). No modifica la lógica del motor: pide la animación por el mismo camino
// que el juego (BtlController_EmitMoveAnimation -> PlayerHandleMoveAnimation -> PlayerDoMoveAnimation).
//
// API en window.frAnim:
//   ready: Promise<void>            resuelta cuando el combate está listo para animar
//   play(move, opts?): Promise<void> reproduce la animación del movimiento (índice de movimiento de FireRed)
//   status(): { ready, playing, error }

import * as C from "./generated/constants";
import { launchFireRed } from "./boot";
import { rom } from "@core/rom";
import { createMon } from "@core/pokemon/pokemon";
import { save } from "./save";
import { G, gBattleBufferA, gDisableStructs } from "@core/battle/globals";
import { BtlController_EmitMoveAnimation, BUFFER_A } from "@core/battle/controllers";
import { MarkBattlerForControllerExec } from "@core/battle/util";
import { PlayerBufferExecCompleted } from "@core/battle/controller_player";
import { BattlePutTextOnWindow } from "@core/battle/message";
import { gBattleMoves } from "@core/battle/macros";

type PlayOptions = { power?: number; damage?: number; friendship?: number; timeoutMs?: number };
type FrAnim = {
  ready: Promise<void>;
  play(move: number, options?: PlayOptions): Promise<void>;
  status(): { ready: boolean; playing: boolean; error: string | null };
};

const A_BUTTON_BIT = 1;

export async function launchAnimHarness(params: URLSearchParams): Promise<void> {
  const attackerParam = Number(params.get("a") ?? 0);
  const targetParam = Number(params.get("t") ?? 0);
  const status = { ready: false, playing: false, error: null as string | null };
  let resolveReady!: () => void;
  let rejectReady!: (e: unknown) => void;
  const ready = new Promise<void>((res, rej) => { resolveReady = res; rejectReady = rej; });
  ready.catch(() => {});

  const api: FrAnim = {
    ready,
    status: () => ({ ...status }),
    async play(move: number, options: PlayOptions = {}): Promise<void> {
      await ready;
      if (status.playing) throw new Error("ya hay una animación en curso");
      status.playing = true;
      try {
        const power = options.power ?? (gBattleMoves(move) as { power?: number } | undefined)?.power ?? 0;
        G.gBattlerAttacker = 0;
        G.gBattlerTarget = 1;
        G.gActiveBattler = 0;
        PlayerBufferExecCompleted(); // controlador del jugador en reposo, sin orden pendiente
        BtlController_EmitMoveAnimation(BUFFER_A, move, 0, power, options.damage ?? 0, options.friendship ?? 70, gDisableStructs[0]);
        MarkBattlerForControllerExec(0);
        const deadline = performance.now() + (options.timeoutMs ?? 20000);
        while (G.gBattleControllerExecFlags & 1) {
          if (performance.now() > deadline) throw new Error("la animación no terminó a tiempo");
          await new Promise((r) => setTimeout(r, 16));
        }
      } catch (e) {
        status.error = String(e);
        throw e;
      } finally {
        status.playing = false;
      }
    },
  };
  (window as unknown as { frAnim: FrAnim }).frAnim = api;

  try {
    const game = await launchFireRed({ mode: "sandbox" });
    const attackerSpecies = attackerParam || rom.c("SPECIES_CHARMANDER");
    const targetSpecies = targetParam || rom.c("SPECIES_PIDGEY");
    const debug = (window as unknown as { frDebug: { wait(frames: number, buttons?: number): Promise<void> } }).frDebug;
    await debug.wait(120);
    save.party.length = 0;
    save.party.push(createMon(attackerSpecies, 10));
    game.battleSetup.StartWildBattle(createMon(targetSpecies, 5));
    // Avanzar la presentación (texto de aparición, salida del Pokémon) hasta que el menú de acciones esté pendiente.
    for (let i = 0; i < 900; i++) {
      const waiting = gBattleBufferA[0][0] === C.CONTROLLER_CHOOSEACTION && (G.gBattleControllerExecFlags & 1) !== 0;
      if (waiting) break;
      await debug.wait(4, A_BUTTON_BIT);
      await debug.wait(20);
    }
    if (!(gBattleBufferA[0][0] === C.CONTROLLER_CHOOSEACTION && (G.gBattleControllerExecFlags & 1) !== 0)) {
      throw new Error("el combate no llegó al menú de acciones");
    }
    await debug.wait(30);
    // Congelar la lógica de turnos y ocultar el menú: queda la escena con la caja de texto vacía.
    G.gBattleMainFunc = () => {};
    BattlePutTextOnWindow(rom.text("gText_EmptyString3"), C.B_WIN_MSG);
    G.gBattle_BG0_X = 0;
    G.gBattle_BG0_Y = 0;
    G.gActiveBattler = 0;
    PlayerBufferExecCompleted();
    status.ready = true;
    resolveReady();
  } catch (e) {
    status.error = String(e);
    rejectReady(e);
  }
}
