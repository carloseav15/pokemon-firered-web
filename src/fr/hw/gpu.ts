// gpu_regs.c: register writes outside VBlank are buffered and copied to the
// hardware registers during the VBlank interrupt.

import { ppu, REG_OFFSET_DISPCNT, REG_OFFSET_DISPSTAT, REG_OFFSET_VCOUNT, DISPCNT_FORCED_BLANK } from "./ppu";

const GPU_REG_BUF_SIZE = 0x60;
const buffer = new Uint16Array(GPU_REG_BUF_SIZE / 2);
const waiting: number[] = [];
let inVBlank = false;

export function InitGpuRegManager(): void {
  buffer.fill(0);
  waiting.length = 0;
}

export function setInVBlank(value: boolean): void {
  inVBlank = value;
}

function copyBufferedValueToGpuReg(offset: number): void {
  ppu.setReg(offset, buffer[offset >> 1]);
}

export function CopyBufferedValuesToGpuRegs(): void {
  for (const offset of waiting) copyBufferedValueToGpuReg(offset);
  waiting.length = 0;
}

export function SetGpuReg(offset: number, value: number): void {
  if (offset < GPU_REG_BUF_SIZE) {
    buffer[offset >> 1] = value & 0xffff;
    if (inVBlank || (ppu.reg(REG_OFFSET_DISPCNT) & DISPCNT_FORCED_BLANK)) {
      copyBufferedValueToGpuReg(offset);
    } else if (!waiting.includes(offset)) {
      waiting.push(offset);
    }
  } else {
    ppu.setReg(offset, value);
  }
}

export function GetGpuReg(offset: number): number {
  if (offset === REG_OFFSET_DISPSTAT) return ppu.reg(REG_OFFSET_DISPSTAT);
  if (offset === REG_OFFSET_VCOUNT) return ppu.vcount;
  if (offset < GPU_REG_BUF_SIZE) return buffer[offset >> 1];
  return ppu.reg(offset);
}

export function SetGpuRegBits(offset: number, mask: number): void {
  SetGpuReg(offset, GetGpuReg(offset) | mask);
}

export function ClearGpuRegBits(offset: number, mask: number): void {
  SetGpuReg(offset, GetGpuReg(offset) & ~mask);
}

// Interrupt masks are irrelevant here (VBlank/HBlank callbacks are driven by
// the frame loop), but keep the API for ported code.
export function EnableInterrupts(_mask: number): void {}
export function DisableInterrupts(_mask: number): void {}
