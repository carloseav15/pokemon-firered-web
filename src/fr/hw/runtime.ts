// main.c for GBA-hardware scenes: gMain callbacks, the VBlank/HBlank
// handlers and the per-frame flow (callbacks -> VBlank -> scanline render).

import { joy } from "../gba/input";
import { tasks, type Task } from "../gba/tasks";
import { CopyBufferedValuesToGpuRegs, EnableInterrupts, GetGpuReg, setInVBlank, SetGpuReg } from "./gpu";
import { ppu } from "./ppu";
import { scanlineHBlank } from "./scanline";
import * as C from "../generated/constants";
import { REG_OFFSET_DISPSTAT } from "./ppu";

export type MainCallback = (() => void) | null;

const vblankWaiters: Array<() => void> = [];
let timer1StartedAt = 0;

/** main.c StartTimer1; browser adaptation uses a monotonic clock at the GBA timer's rate. */
export function StartTimer1(): void { timer1StartedAt = performance.now(); }

/** Read REG_TM1CNT_L while Timer 1 is enabled. */
export function GetTimer1Low(): number {
  return Math.floor((performance.now() - timer1StartedAt) * 16777.216) & 0xffff;
}

export const gMain = {
  callback1: null as MainCallback,
  callback2: null as MainCallback,
  savedCallback: null as MainCallback,
  vblankCallback: null as MainCallback,
  hblankCallback: null as MainCallback,
  vcountCallback: null as MainCallback,
  serialCallback: null as MainCallback,
  intrCheck: 0,
  vcountIntrEnabled: false,
  state: 0,
  inBattle: false,
  vblankCounter1: null as { value: number } | null,
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

/** main.c InitMainCallbacks; the browser copyright/intro stage is driven by Startup itself. */
export function InitMainCallbacks(): void {
  gMain.vblankCounter1 = null;
  gMain.vblankCounter2 = 0;
  gMain.callback1 = null;
  SetMainCallback2(null);
  gMain.savedCallback = null;
  gMain.intrCheck = 0;
  gMain.vcountIntrEnabled = false;
}

/**
 * Browser adaptation for screens whose exported data loads asynchronously.
 * The C switches gMain.callback2 synchronously when a screen is opened, so the
 * caller's CB2 (for example BattleMainCB2 waiting in CompleteWhenChoseItem)
 * never runs again until the screen returns. Park callback2 on an idle stub
 * at once and run the screen's setup when its data is ready.
 */
export function SetMainCallback2WhenLoaded(load: Promise<unknown>, setup: () => void): void {
  SetMainCallback2(() => {});
  void load.then(setup);
}

export function SetVBlankCallback(cb: MainCallback): void {
  gMain.vblankCallback = cb;
}

export function SetHBlankCallback(cb: MainCallback): void {
  gMain.hblankCallback = cb;
}

/** main.c SetVCountCallback. */
export function SetVCountCallback(cb: MainCallback): void { gMain.vcountCallback = cb; }

/** main.c SetSerialCallback; the browser retains the callback for an optional link adapter. */
export function SetSerialCallback(cb: MainCallback): void { gMain.serialCallback = cb; }

/** main.c InitIntrHandlers: reset interrupt callbacks and enable the frame-driven VBlank interrupt. */
export function InitIntrHandlers(): void {
  gMain.vblankCallback = null;
  gMain.hblankCallback = null;
  gMain.vcountCallback = null;
  gMain.serialCallback = null;
  gMain.intrCheck = 0;
  EnableInterrupts(C.INTR_FLAG_VBLANK);
}

/** main.c EnableVCountIntrAtLine150. */
export function EnableVCountIntrAtLine150(): void {
  const dispstat = (GetGpuReg(REG_OFFSET_DISPSTAT) & 0xff) | (150 << 8) | C.DISPSTAT_VCOUNT_INTR;
  SetGpuReg(REG_OFFSET_DISPSTAT, dispstat);
  EnableInterrupts(C.INTR_FLAG_VCOUNT);
  gMain.vcountIntrEnabled = true;
}

/** main.c HBlankIntr. */
export function HBlankIntr(): void {
  gMain.hblankCallback?.();
  gMain.intrCheck |= C.INTR_FLAG_HBLANK;
}

/** main.c VCountIntr. The m4a VSync hook has no browser equivalent; retain the interrupt state. */
export function VCountIntr(): void {
  gMain.intrCheck |= C.INTR_FLAG_VCOUNT;
}

/** main.c WaitForVBlank as a frame-loop awaitable instead of a blocking CPU spin. */
export function WaitForVBlank(): Promise<void> {
  return new Promise((resolve) => vblankWaiters.push(resolve));
}

/** main.c CallCallbacks; the browser has no link/save-failure/help interrupt blockers here. */
export function CallCallbacks(): void {
  gMain.callback1?.();
  gMain.callback2?.();
}

/** main.c UpdateLinkAndCallCallbacks with link-connection handling omitted by the single-player browser port. */
export function UpdateLinkAndCallCallbacks(): void { CallCallbacks(); }

/** main.c InitKeys. */
export function InitKeys(): void { joy.initKeys(); }

/** main.c SetVBlankCounter1Ptr: VBlankIntr increments only a registered counter pointer. */
export function SetVBlankCounter1Ptr(counter: { value: number } | null): void {
  gMain.vblankCounter1 = counter;
}

/** main.c DisableVBlankCounter1. */
export function DisableVBlankCounter1(): void {
  gMain.vblankCounter1 = null;
}

/** main.c VBlankIntr: run the registered callback and advance counters during VBlank. */
export function VBlankIntr(): void {
  if (gMain.vblankCounter1) gMain.vblankCounter1.value++;
  gMain.vblankCallback?.();
  gMain.vblankCounter2++;
  CopyBufferedValuesToGpuRegs();
  gMain.intrCheck |= C.INTR_FLAG_VBLANK;
}

/** One frame of a hardware scene: callbacks then the VBlank interrupt. */
export function runHwFrame(): void {
  UpdateLinkAndCallCallbacks();
  setInVBlank(true);
  VBlankIntr();
  setInVBlank(false);
  for (const resolve of vblankWaiters.splice(0)) resolve();
}

export function renderHw(ctx: CanvasRenderingContext2D): void {
  ppu.hblank = (line) => {
    scanlineHBlank(line);
    HBlankIntr();
    if (line === 150 && gMain.vcountIntrEnabled) VCountIntr();
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
