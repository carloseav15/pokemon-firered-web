// gpu_regs.c: register writes outside VBlank are buffered and copied to the
// hardware registers during the VBlank interrupt.

import { ppu, REG_OFFSET_DISPCNT, REG_OFFSET_DISPSTAT, REG_OFFSET_VCOUNT, DISPCNT_FORCED_BLANK } from "./ppu";
import * as C from "../generated/constants";

const GPU_REG_BUF_SIZE = 0x60;
const buffer = new Uint16Array(GPU_REG_BUF_SIZE / 2);
const waiting: number[] = [];
let inVBlank = false;
let regIE = 0;

export function InitGpuRegManager(): void {
  buffer.fill(0);
  waiting.length = 0;
  regIE = 0;
}

export function setInVBlank(value: boolean): void {
  inVBlank = value;
}

function copyBufferedValueToGpuReg(offset: number): void {
  const value = buffer[offset >> 1];
  if (offset === REG_OFFSET_DISPSTAT) {
    const irqBits = C.DISPSTAT_HBLANK_INTR | C.DISPSTAT_VBLANK_INTR;
    ppu.setReg(offset, (ppu.reg(offset) & ~irqBits) | value);
  } else ppu.setReg(offset, value);
}

export function CopyBufferedValuesToGpuRegs(): void {
  for (const offset of waiting) copyBufferedValueToGpuReg(offset);
  waiting.length = 0;
}

export function SetGpuReg(offset: number, value: number): void {
  const regOffset = offset & 0xff;
  if (regOffset >= GPU_REG_BUF_SIZE) return;
  buffer[regOffset >> 1] = value & 0xffff;
  if (inVBlank || (ppu.reg(REG_OFFSET_DISPCNT) & DISPCNT_FORCED_BLANK)) {
    copyBufferedValueToGpuReg(regOffset);
  } else if (!waiting.includes(regOffset)) {
    waiting.push(regOffset);
  }
}

export function GetGpuReg(offset: number): number {
  const regOffset = offset & 0xff;
  if (regOffset === REG_OFFSET_DISPSTAT) return ppu.reg(REG_OFFSET_DISPSTAT);
  if (regOffset === REG_OFFSET_VCOUNT) return ppu.vcount;
  if (regOffset < GPU_REG_BUF_SIZE) return buffer[regOffset >> 1];
  return 0;
}

export function SetGpuRegBits(offset: number, mask: number): void {
  const regOffset = offset & 0xff;
  if (regOffset < GPU_REG_BUF_SIZE) SetGpuReg(regOffset, buffer[regOffset >> 1] | mask);
}

export function ClearGpuRegBits(offset: number, mask: number): void {
  const regOffset = offset & 0xff;
  if (regOffset < GPU_REG_BUF_SIZE) SetGpuReg(regOffset, buffer[regOffset >> 1] & ~mask);
}

// The browser frame loop drives callbacks directly, but preserve the C IE
// mask and its visible DISPSTAT interrupt-enable bits.
function updateRegDispstatIntrBits(): void {
  let value = 0;
  if (regIE & C.INTR_FLAG_HBLANK) value |= C.DISPSTAT_HBLANK_INTR;
  if (regIE & C.INTR_FLAG_VBLANK) value |= C.DISPSTAT_VBLANK_INTR;
  const current = GetGpuReg(REG_OFFSET_DISPSTAT) & (C.DISPSTAT_HBLANK_INTR | C.DISPSTAT_VBLANK_INTR);
  if (current !== value) SetGpuReg(REG_OFFSET_DISPSTAT, value);
}

export function EnableInterrupts(mask: number): void {
  regIE = (regIE | (mask & 0xffff)) & 0xffff;
  updateRegDispstatIntrBits();
}

export function DisableInterrupts(mask: number): void {
  regIE = (regIE & ~(mask & 0xffff)) & 0xffff;
  updateRegDispstatIntrBits();
}
