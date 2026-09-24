// main.c for GBA-hardware scenes: gMain callbacks, the VBlank/HBlank
// handlers and the per-frame flow (callbacks -> VBlank -> scanline render).

import { joy } from "../gba/input";
import { tasks, type Task } from "../gba/tasks";
import { CopyBufferedValuesToGpuRegs, setInVBlank } from "./gpu";
import { ppu } from "./ppu";
import { scanlineHBlank } from "./scanline";

export type MainCallback = (() => void) | null;

export const gMain = {
  callback1: null as MainCallback,
  callback2: null as MainCallback,
  savedCallback: null as MainCallback,
  vblankCallback: null as MainCallback,
  hblankCallback: null as MainCallback,
  state: 0,
  inBattle: false,
  vblankCounter1: 0,
  vblankCounter2: 0,
  get heldKeys(): number { return joy.held; },
  get newKeys(): number { return joy.newKeys; },
  get newAndRepeatedKeys(): number { return joy.repeated; },
};

export function SetMainCallback1(cb: MainCallback): void {
  gMain.callback1 = cb;
}

export function SetMainCallback2(cb: MainCallback): void {
  gMain.callback2 = cb;
  gMain.state = 0;
}

export function SetVBlankCallback(cb: MainCallback): void {
  gMain.vblankCallback = cb;
}

export function SetHBlankCallback(cb: MainCallback): void {
  gMain.hblankCallback = cb;
}

/** One frame of a hardware scene: callbacks then the VBlank interrupt. */
export function runHwFrame(): void {
  gMain.callback1?.();
  gMain.callback2?.();
  setInVBlank(true);
  gMain.vblankCallback?.();
  gMain.vblankCounter2++;
  CopyBufferedValuesToGpuRegs();
  setInVBlank(false);
  gMain.vblankCounter1++;
}

export function renderHw(ctx: CanvasRenderingContext2D): void {
  ppu.hblank = (line) => {
    scanlineHBlank(line);
    gMain.hblankCallback?.();
  };
  ctx.putImageData(ppu.renderFrame(), 0, 0);
}

/** A Game scene driven by gMain (battle, menus ported on the hardware layer). */
export class HwScene {
  private savedTasks: Task[] | null = null;

  enter(): void {
    this.savedTasks = tasks.snapshot();
    tasks.reset();
  }

  leave(): void {
    if (this.savedTasks) tasks.restore(this.savedTasks);
    this.savedTasks = null;
    gMain.callback1 = gMain.callback2 = gMain.vblankCallback = gMain.hblankCallback = null;
  }

  update(): void {
    runHwFrame();
  }

  render(ctx: CanvasRenderingContext2D): void {
    renderHw(ctx);
  }
}
