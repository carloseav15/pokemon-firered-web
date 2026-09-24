// scanline_effect.c: per-scanline register writes driven by HBlank DMA.

import { tasks } from "../gba/tasks";
import { ppu } from "./ppu";
import { gSineTable } from "./trig";

export const SCANLINE_EFFECT_DMACNT_16BIT = 16;
export const SCANLINE_EFFECT_DMACNT_32BIT = 32;
export const SCANLINE_EFFECT_REG_BG0HOFS = 0x0;
export const SCANLINE_EFFECT_REG_BG0VOFS = 0x2;
export const SCANLINE_EFFECT_REG_BG1HOFS = 0x4;
export const SCANLINE_EFFECT_REG_BG1VOFS = 0x6;
export const SCANLINE_EFFECT_REG_BG2HOFS = 0x8;
export const SCANLINE_EFFECT_REG_BG2VOFS = 0xa;
export const SCANLINE_EFFECT_REG_BG3HOFS = 0xc;
export const SCANLINE_EFFECT_REG_BG3VOFS = 0xe;

/** dmaDest is the IO register offset (e.g. REG_OFFSET_WIN0H). */
export type ScanlineEffectParams = { dmaDest: number; dmaControl: number; initState: number; unused9?: number };

export const gScanlineEffectRegBuffers = [new Uint16Array(0x3c0), new Uint16Array(0x3c0)];
export const gScanlineEffect = { dmaDest: 0, dmaControl: 0, srcBuffer: 0, state: 0, waveTaskId: 0xff };
let shouldStopWaveTask = false;

/** The HBlank DMA channel 0 state. */
const dma0 = { active: false, buffer: gScanlineEffectRegBuffers[0], dest: 0, is32: false };

/** Hooked into the PPU: write the value for this scanline before it is drawn. */
export function scanlineHBlank(line: number): void {
  if (!dma0.active) return;
  if (dma0.is32) {
    ppu.setReg(dma0.dest, dma0.buffer[line * 2]);
    ppu.setReg(dma0.dest + 2, dma0.buffer[line * 2 + 1]);
  } else {
    ppu.setReg(dma0.dest, dma0.buffer[line]);
  }
}

export function DmaStop0(): void {
  dma0.active = false;
}

export function ScanlineEffect_Stop(): void {
  gScanlineEffect.state = 0;
  DmaStop0();
  if (gScanlineEffect.waveTaskId !== 0xff) {
    tasks.destroy(gScanlineEffect.waveTaskId);
    gScanlineEffect.waveTaskId = 0xff;
  }
}

export function ScanlineEffect_Clear(): void {
  gScanlineEffectRegBuffers[0].fill(0);
  gScanlineEffectRegBuffers[1].fill(0);
  gScanlineEffect.dmaDest = 0;
  gScanlineEffect.dmaControl = 0;
  gScanlineEffect.srcBuffer = 0;
  gScanlineEffect.state = 0;
  gScanlineEffect.waveTaskId = 0xff;
}

export function ScanlineEffect_SetParams(params: ScanlineEffectParams): void {
  gScanlineEffect.dmaControl = params.dmaControl;
  gScanlineEffect.dmaDest = params.dmaDest;
  gScanlineEffect.state = params.initState;
}

export function ScanlineEffect_InitHBlankDmaTransfer(): void {
  if (gScanlineEffect.state === 0) return;
  if (gScanlineEffect.state === 3) {
    gScanlineEffect.state = 0;
    DmaStop0();
    shouldStopWaveTask = true;
    return;
  }
  dma0.active = true;
  dma0.buffer = gScanlineEffectRegBuffers[gScanlineEffect.srcBuffer];
  dma0.dest = gScanlineEffect.dmaDest;
  dma0.is32 = gScanlineEffect.dmaControl === SCANLINE_EFFECT_DMACNT_32BIT;
  gScanlineEffect.srcBuffer ^= 1;
}

const battleBgOffsets = { get: (_reg: number) => 0 };

/** Battle code provides gBattle_BGx_X/Y for waves that follow the battle BG scroll. */
export function setBattleBgOffsetProvider(get: (reg: number) => number): void {
  battleBgOffsets.get = get;
}

const TaskFunc_UpdateWavePerFrame = (taskId: number): void => {
  const t = tasks.data(taskId);
  if (shouldStopWaveTask) {
    tasks.destroy(taskId);
    gScanlineEffect.waveTaskId = 0xff;
    return;
  }
  const value = t[7] ? battleBgOffsets.get(t[6]) : 0;
  const buf = gScanlineEffectRegBuffers[gScanlineEffect.srcBuffer];
  const src = gScanlineEffectRegBuffers[0];
  let offset = t[3] + 320;
  for (let i = t[0]; i < t[1]; i++) buf[i] = (src[offset++] + value) & 0xffff;
  if (t[4] !== 0) {
    t[4]--;
  } else {
    t[4] = t[5];
    t[3]++;
    if (t[3] === t[2]) t[3] = 0;
  }
};

export function ScanlineEffect_InitWave(startLine: number, endLine: number, frequency: number, amplitude: number, delayInterval: number, regOffset: number, applyBattleBgOffsets: boolean | number): number {
  ScanlineEffect_Clear();
  ScanlineEffect_SetParams({ dmaDest: 0x10 + regOffset, dmaControl: SCANLINE_EFFECT_DMACNT_16BIT, initState: 1 });
  const taskId = tasks.create(TaskFunc_UpdateWavePerFrame, 0);
  const t = tasks.data(taskId);
  t[0] = startLine;
  t[1] = endLine;
  t[2] = Math.trunc(256 / frequency);
  t[3] = 0;
  t[4] = delayInterval;
  t[5] = delayInterval;
  t[6] = regOffset;
  t[7] = applyBattleBgOffsets ? 1 : 0;
  gScanlineEffect.waveTaskId = taskId;
  shouldStopWaveTask = false;
  const b0 = gScanlineEffectRegBuffers[0];
  let theta = 0;
  for (let i = 0; i < 256; i++) {
    b0[320 + i] = Math.trunc((gSineTable[theta] * amplitude) / 256) & 0xffff;
    theta = (theta + frequency) & 0xff;
  }
  let offset = 320;
  for (let i = startLine; i < endLine; i++) {
    b0[i] = b0[offset];
    gScanlineEffectRegBuffers[1][i] = b0[offset];
    offset++;
  }
  return taskId;
}
