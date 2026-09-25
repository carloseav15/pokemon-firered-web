// palette.c: unfaded/faded palette buffers, palette fades and blending.

import { ppu } from "./ppu";
import { SetGpuReg } from "./gpu";
import { REG_OFFSET_BLDCNT, REG_OFFSET_BLDY } from "./ppu";
import { tasks } from "../gba/tasks";

export const PLTT_BUFFER_SIZE = 0x200;
export const PALETTE_FADE_STATUS_DELAY = 2;
export const PALETTE_FADE_STATUS_ACTIVE = 1;
export const PALETTE_FADE_STATUS_DONE = 0;
export const PALETTE_FADE_STATUS_LOADING = 0xff;
export const PALETTES_BG = 0x0000ffff;
export const PALETTES_OBJECTS = 0xffff0000;
export const PALETTES_ALL = 0xffffffff;
export const BG_PLTT_OFFSET = 0x000;
export const OBJ_PLTT_OFFSET = 0x100;
export const PLTT_ID = (n: number) => n * 16;
export const BG_PLTT_ID = (n: number) => n * 16;
export const OBJ_PLTT_ID = (n: number) => 0x100 + n * 16;
export const PLTT_SIZE_4BPP = 32;
export const PLTT_SIZEOF = (n: number) => n * 2;
export const RGB = (r: number, g: number, b: number) => (r & 0x1f) | ((g & 0x1f) << 5) | ((b & 0x1f) << 10);
export const RGB_BLACK = 0;
export const RGB_WHITE = 0x7fff;
export const RGB_RED = RGB(31, 0, 0);
export const RGB_GREEN = RGB(0, 31, 0);
export const RGB_BLUE = RGB(0, 0, 31);
export const RGB_YELLOW = RGB(31, 31, 0);
export const RGB_MAGENTA = RGB(31, 0, 31);
export const RGB_CYAN = RGB(0, 31, 31);
export const RGB_WHITEALPHA = RGB_WHITE | 0x8000;
export const GET_R = (c: number) => c & 0x1f;
export const GET_G = (c: number) => (c >> 5) & 0x1f;
export const GET_B = (c: number) => (c >> 10) & 0x1f;

const NORMAL_FADE = 0;
const FAST_FADE = 1;
const HARDWARE_FADE = 2;

export const FAST_FADE_IN_FROM_WHITE = 0;
export const FAST_FADE_OUT_TO_WHITE = 1;
export const FAST_FADE_IN_FROM_BLACK = 2;
export const FAST_FADE_OUT_TO_BLACK = 3;

export const gPlttBufferUnfaded = new Uint16Array(PLTT_BUFFER_SIZE);
export const gPlttBufferFaded = new Uint16Array(PLTT_BUFFER_SIZE);

export const gPaletteFade = {
  multipurpose1: 0, // selectedPalettes (normal/fast) or blendCnt (hardware)
  delayCounter: 0,
  y: 0,
  targetY: 0,
  blendColor: 0,
  active: false,
  multipurpose2: 0, // delay (normal/hardware) or submode (fast)
  yDec: false,
  bufferTransferDisabled: false,
  mode: 0,
  shouldResetBlendRegisters: false,
  hardwareFadeFinishing: 0,
  softwareFadeFinishingCounter: 0,
  softwareFadeFinishing: false,
  objPaletteToggle: 0,
  deltaY: 2,
};

let sPlttBufferTransferPending = 0;

/** Copy u16 values from a byte/halfword source. */
function toU16(src: ArrayLike<number> | Uint8Array, count: number): Uint16Array {
  if (src instanceof Uint16Array) return src.subarray(0, count);
  if (src instanceof Uint8Array) {
    const out = new Uint16Array(count);
    for (let i = 0; i < count && i * 2 + 1 < src.length; i++) out[i] = src[i * 2] | (src[i * 2 + 1] << 8);
    return out;
  }
  const out = new Uint16Array(count);
  for (let i = 0; i < count && i < src.length; i++) out[i] = src[i];
  return out;
}

/** LoadPalette(src, offset (in colors), size (in bytes)) */
export function LoadPalette(src: ArrayLike<number>, offset: number, size: number): void {
  const count = size >> 1;
  const data = toU16(src, count);
  for (let i = 0; i < count && offset + i < PLTT_BUFFER_SIZE; i++) {
    gPlttBufferUnfaded[offset + i] = data[i] ?? 0;
    gPlttBufferFaded[offset + i] = data[i] ?? 0;
  }
}

export const LoadCompressedPalette = LoadPalette;

export function FillPalette(value: number, offset: number, size: number): void {
  const count = size >> 1;
  gPlttBufferUnfaded.fill(value, offset, offset + count);
  gPlttBufferFaded.fill(value, offset, offset + count);
}

export function TransferPlttBuffer(): void {
  if (!gPaletteFade.bufferTransferDisabled) {
    ppu.pltt.set(gPlttBufferFaded);
    sPlttBufferTransferPending = 0;
    if (gPaletteFade.mode === HARDWARE_FADE && gPaletteFade.active) updateBlendRegisters();
  }
}

export function UpdatePaletteFade(): number {
  if (sPlttBufferTransferPending) return PALETTE_FADE_STATUS_LOADING;
  let result: number;
  if (gPaletteFade.mode === NORMAL_FADE) result = updateNormalPaletteFade();
  else if (gPaletteFade.mode === FAST_FADE) result = updateFastPaletteFade();
  else result = updateHardwarePaletteFade();
  sPlttBufferTransferPending = gPaletteFade.multipurpose1 ? 1 : 0;
  return result;
}

export function ResetPaletteFade(): void {
  ResetPaletteFadeControl();
}

export function ReadPlttIntoBuffers(): void {
  gPlttBufferUnfaded.set(ppu.pltt);
  gPlttBufferFaded.set(ppu.pltt);
}

export function BeginNormalPaletteFade(selectedPalettes: number, delay: number, startY: number, targetY: number, blendColor: number): boolean {
  if (gPaletteFade.active) return false;
  gPaletteFade.deltaY = 2;
  if (delay < 0) {
    gPaletteFade.deltaY += -delay;
    delay = 0;
  }
  gPaletteFade.multipurpose1 = selectedPalettes >>> 0;
  gPaletteFade.delayCounter = delay;
  gPaletteFade.multipurpose2 = delay;
  gPaletteFade.y = startY;
  gPaletteFade.targetY = targetY;
  gPaletteFade.blendColor = blendColor & 0x7fff;
  gPaletteFade.active = true;
  gPaletteFade.mode = NORMAL_FADE;
  gPaletteFade.yDec = startY >= targetY;
  UpdatePaletteFade();
  const temp = gPaletteFade.bufferTransferDisabled;
  gPaletteFade.bufferTransferDisabled = false;
  ppu.pltt.set(gPlttBufferFaded);
  sPlttBufferTransferPending = 0;
  if (gPaletteFade.mode === HARDWARE_FADE && gPaletteFade.active) updateBlendRegisters();
  gPaletteFade.bufferTransferDisabled = temp;
  return true;
}

export function ResetPaletteFadeControl(): void {
  Object.assign(gPaletteFade, {
    multipurpose1: 0, multipurpose2: 0, delayCounter: 0, y: 0, targetY: 0, blendColor: 0, active: false,
    yDec: false, bufferTransferDisabled: false, shouldResetBlendRegisters: false, hardwareFadeFinishing: 0,
    softwareFadeFinishing: false, softwareFadeFinishingCounter: 0, objPaletteToggle: 0, deltaY: 2, mode: 0,
  });
}

function updateNormalPaletteFade(): number {
  if (!gPaletteFade.active) return PALETTE_FADE_STATUS_DONE;
  if (isSoftwarePaletteFadeFinishing()) return gPaletteFade.active ? PALETTE_FADE_STATUS_ACTIVE : PALETTE_FADE_STATUS_DONE;
  if (!gPaletteFade.objPaletteToggle) {
    if (gPaletteFade.delayCounter < gPaletteFade.multipurpose2) {
      gPaletteFade.delayCounter++;
      return 2;
    }
    gPaletteFade.delayCounter = 0;
  }
  let paletteOffset = 0;
  let selected: number;
  if (!gPaletteFade.objPaletteToggle) {
    selected = gPaletteFade.multipurpose1 & 0xffff;
  } else {
    selected = gPaletteFade.multipurpose1 >>> 16;
    paletteOffset = OBJ_PLTT_OFFSET;
  }
  while (selected) {
    if (selected & 1) BlendPalette(paletteOffset, 16, gPaletteFade.y, gPaletteFade.blendColor);
    selected >>>= 1;
    paletteOffset += 16;
  }
  gPaletteFade.objPaletteToggle ^= 1;
  if (!gPaletteFade.objPaletteToggle) {
    if (gPaletteFade.y === gPaletteFade.targetY) {
      gPaletteFade.multipurpose1 = 0;
      gPaletteFade.softwareFadeFinishing = true;
    } else if (!gPaletteFade.yDec) {
      gPaletteFade.y = Math.min(gPaletteFade.targetY, gPaletteFade.y + gPaletteFade.deltaY);
    } else {
      gPaletteFade.y = Math.max(gPaletteFade.targetY, gPaletteFade.y - gPaletteFade.deltaY);
    }
  }
  return gPaletteFade.active ? PALETTE_FADE_STATUS_ACTIVE : PALETTE_FADE_STATUS_DONE;
}

export function InvertPlttBuffer(selectedPalettes: number): void {
  let offset = 0;
  selectedPalettes >>>= 0;
  while (selectedPalettes) {
    if (selectedPalettes & 1) for (let i = 0; i < 16; i++) gPlttBufferFaded[offset + i] = ~gPlttBufferFaded[offset + i] & 0xffff;
    selectedPalettes >>>= 1;
    offset += 16;
  }
}

export function TintPlttBuffer(selectedPalettes: number, r: number, g: number, b: number): void {
  let offset = 0;
  selectedPalettes >>>= 0;
  while (selectedPalettes) {
    if (selectedPalettes & 1) {
      for (let i = 0; i < 16; i++) {
        const c = gPlttBufferFaded[offset + i];
        gPlttBufferFaded[offset + i] = (((c & 0x1f) + r) & 0x1f) | (((((c >> 5) & 0x1f) + g) & 0x1f) << 5) | (((((c >> 10) & 0x1f) + b) & 0x1f) << 10) | (c & 0x8000);
      }
    }
    selectedPalettes >>>= 1;
    offset += 16;
  }
}

export function UnfadePlttBuffer(selectedPalettes: number): void {
  let offset = 0;
  selectedPalettes >>>= 0;
  while (selectedPalettes) {
    if (selectedPalettes & 1) for (let i = 0; i < 16; i++) gPlttBufferFaded[offset + i] = gPlttBufferUnfaded[offset + i];
    selectedPalettes >>>= 1;
    offset += 16;
  }
}

export function BeginFastPaletteFade(submode: number): void {
  gPaletteFade.deltaY = 2;
  gPaletteFade.y = 31;
  gPaletteFade.multipurpose2 = submode & 0x3f;
  gPaletteFade.active = true;
  gPaletteFade.mode = FAST_FADE;
  if (submode === FAST_FADE_IN_FROM_BLACK) gPlttBufferFaded.fill(RGB_BLACK);
  if (submode === FAST_FADE_IN_FROM_WHITE) gPlttBufferFaded.fill(RGB_WHITE);
  UpdatePaletteFade();
}

function updateFastPaletteFade(): number {
  if (!gPaletteFade.active) return PALETTE_FADE_STATUS_DONE;
  if (isSoftwarePaletteFadeFinishing()) return gPaletteFade.active ? PALETTE_FADE_STATUS_ACTIVE : PALETTE_FADE_STATUS_DONE;
  const start = gPaletteFade.objPaletteToggle ? OBJ_PLTT_OFFSET : 0;
  const end = gPaletteFade.objPaletteToggle ? PLTT_BUFFER_SIZE : OBJ_PLTT_OFFSET;
  const submode = gPaletteFade.multipurpose2;
  for (let i = start; i < end; i++) {
    const u = gPlttBufferUnfaded[i];
    const f = gPlttBufferFaded[i];
    let r = f & 0x1f, g = (f >> 5) & 0x1f, b = (f >> 10) & 0x1f;
    const r0 = u & 0x1f, g0 = (u >> 5) & 0x1f, b0 = (u >> 10) & 0x1f;
    switch (submode) {
      case FAST_FADE_IN_FROM_WHITE: r = Math.max(r0, r - 2); g = Math.max(g0, g - 2); b = Math.max(b0, b - 2); break;
      case FAST_FADE_OUT_TO_WHITE: r = Math.min(31, r + 2); g = Math.min(31, g + 2); b = Math.min(31, b + 2); break;
      case FAST_FADE_IN_FROM_BLACK: r = Math.min(r0, r + 2); g = Math.min(g0, g + 2); b = Math.min(b0, b + 2); break;
      case FAST_FADE_OUT_TO_BLACK: r = Math.max(0, r - 2); g = Math.max(0, g - 2); b = Math.max(0, b - 2); break;
    }
    gPlttBufferFaded[i] = r | (g << 5) | (b << 10);
  }
  gPaletteFade.objPaletteToggle ^= 1;
  if (gPaletteFade.objPaletteToggle) return gPaletteFade.active ? PALETTE_FADE_STATUS_ACTIVE : PALETTE_FADE_STATUS_DONE;
  gPaletteFade.y = Math.max(0, gPaletteFade.y - gPaletteFade.deltaY);
  if (gPaletteFade.y === 0) {
    switch (submode) {
      case FAST_FADE_IN_FROM_WHITE:
      case FAST_FADE_IN_FROM_BLACK: gPlttBufferFaded.set(gPlttBufferUnfaded); break;
      case FAST_FADE_OUT_TO_WHITE: gPlttBufferFaded.fill(0xffff); break;
      case FAST_FADE_OUT_TO_BLACK: gPlttBufferFaded.fill(0); break;
    }
    gPaletteFade.mode = NORMAL_FADE;
    gPaletteFade.softwareFadeFinishing = true;
  }
  return gPaletteFade.active ? PALETTE_FADE_STATUS_ACTIVE : PALETTE_FADE_STATUS_DONE;
}

export function BeginHardwarePaletteFade(blendCnt: number, delay: number, y: number, targetY: number, shouldResetBlendRegisters: number): void {
  gPaletteFade.multipurpose1 = blendCnt;
  gPaletteFade.delayCounter = delay;
  gPaletteFade.multipurpose2 = delay;
  gPaletteFade.y = y;
  gPaletteFade.targetY = targetY;
  gPaletteFade.active = true;
  gPaletteFade.mode = HARDWARE_FADE;
  gPaletteFade.shouldResetBlendRegisters = (shouldResetBlendRegisters & 1) !== 0;
  gPaletteFade.hardwareFadeFinishing = 0;
  gPaletteFade.yDec = !(y < targetY);
}

function updateHardwarePaletteFade(): number {
  if (!gPaletteFade.active) return PALETTE_FADE_STATUS_DONE;
  if (gPaletteFade.delayCounter < gPaletteFade.multipurpose2) {
    gPaletteFade.delayCounter++;
    return PALETTE_FADE_STATUS_DELAY;
  }
  gPaletteFade.delayCounter = 0;
  if (!gPaletteFade.yDec) {
    gPaletteFade.y++;
    if (gPaletteFade.y > gPaletteFade.targetY) {
      gPaletteFade.hardwareFadeFinishing++;
      gPaletteFade.y--;
    }
  } else {
    if (gPaletteFade.y-- - 1 < gPaletteFade.targetY) {
      gPaletteFade.hardwareFadeFinishing++;
      gPaletteFade.y++;
    }
  }
  if (gPaletteFade.hardwareFadeFinishing) {
    if (gPaletteFade.shouldResetBlendRegisters) {
      gPaletteFade.multipurpose1 = 0;
      gPaletteFade.y = 0;
    }
    gPaletteFade.shouldResetBlendRegisters = false;
  }
  return gPaletteFade.active ? PALETTE_FADE_STATUS_ACTIVE : PALETTE_FADE_STATUS_DONE;
}

function updateBlendRegisters(): void {
  SetGpuReg(REG_OFFSET_BLDCNT, gPaletteFade.multipurpose1 & 0xffff);
  SetGpuReg(REG_OFFSET_BLDY, gPaletteFade.y);
  if (gPaletteFade.hardwareFadeFinishing) {
    gPaletteFade.hardwareFadeFinishing = 0;
    gPaletteFade.mode = 0;
    gPaletteFade.multipurpose1 = 0;
    gPaletteFade.y = 0;
    gPaletteFade.active = false;
  }
}

function isSoftwarePaletteFadeFinishing(): boolean {
  if (gPaletteFade.softwareFadeFinishing) {
    if (gPaletteFade.softwareFadeFinishingCounter === 4) {
      gPaletteFade.active = false;
      gPaletteFade.softwareFadeFinishing = false;
      gPaletteFade.softwareFadeFinishingCounter = 0;
    } else {
      gPaletteFade.softwareFadeFinishingCounter++;
    }
    return true;
  }
  return false;
}

/** blend_palette.c: BlendPalette */
export function BlendPalette(palOffset: number, numEntries: number, coeff: number, blendColor: number): void {
  const br = blendColor & 0x1f, bg = (blendColor >> 5) & 0x1f, bb = (blendColor >> 10) & 0x1f;
  for (let i = 0; i < numEntries; i++) {
    const index = i + palOffset;
    const c = gPlttBufferUnfaded[index];
    const r = c & 0x1f, g = (c >> 5) & 0x1f, b = (c >> 10) & 0x1f;
    gPlttBufferFaded[index] = RGB(r + (((br - r) * coeff) >> 4), g + (((bg - g) * coeff) >> 4), b + (((bb - b) * coeff) >> 4));
  }
}

/** blend_palette.c: BlendPalettesAt; blends a caller-provided palette buffer in place. */
export function BlendPalettesAt(palbuff: Uint16Array, blendPal: number, coefficient: number, size: number): void {
  const count = Math.max(0, size | 0);
  const target = blendPal & 0xffff;
  const coeff = coefficient >>> 0;
  if (coeff === 16) {
    palbuff.fill(target, 0, count);
    return;
  }
  const r = target & 0x1f, g = (target >>> 5) & 0x1f, b = (target >>> 10) & 0x1f;
  for (let i = 0; i < count; i++) {
    const color = palbuff[i]!;
    const r2 = color & 0x1f, g2 = (color >>> 5) & 0x1f, b2 = (color >>> 10) & 0x1f;
    // Preserve C's u32 coefficient conversions and 32-bit multiplication wrap.
    const rr = (r2 + (Math.imul((r - r2) >>> 0, coeff) >>> 4)) >>> 0;
    const gg = (g2 + (Math.imul((g - g2) >>> 0, coeff) >>> 4)) >>> 0;
    const bb = (b2 + (Math.imul((b - b2) >>> 0, coeff) >>> 4)) >>> 0;
    palbuff[i] = (rr | (gg << 5) | (bb << 10)) & 0xffff;
  }
}

export function BlendPalettes(selectedPalettes: number, coeff: number, color: number): void {
  selectedPalettes >>>= 0;
  for (let offset = 0; selectedPalettes; offset += 16) {
    if (selectedPalettes & 1) BlendPalette(offset, 16, coeff, color);
    selectedPalettes >>>= 1;
  }
}

export function BlendPalettesUnfaded(selectedPalettes: number, coeff: number, color: number): void {
  gPlttBufferFaded.set(gPlttBufferUnfaded);
  BlendPalettes(selectedPalettes, coeff, color);
}

function grayOf(c: number): number {
  return ((c & 0x1f) * 76 + ((c >> 5) & 0x1f) * 151 + ((c >> 10) & 0x1f) * 29) >> 8;
}

const ROUNDED_DOWN_GRAYSCALE = [0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 11, 11, 11, 11, 11, 16, 16, 16, 16, 16, 21, 21, 21, 21, 21, 27, 27, 27, 27, 27, 31, 31];

export function TintPalette_GrayScale(palette: Uint16Array, count: number, start = 0): void {
  for (let i = 0; i < count; i++) {
    const gray = grayOf(palette[start + i]);
    palette[start + i] = RGB(gray, gray, gray);
  }
}

export function TintPalette_GrayScale2(palette: Uint16Array, count: number, start = 0): void {
  for (let i = 0; i < count; i++) {
    let gray = grayOf(palette[start + i]);
    if (gray > 31) gray = 31;
    gray = ROUNDED_DOWN_GRAYSCALE[gray];
    palette[start + i] = RGB(gray, gray, gray);
  }
}

export function TintPalette_SepiaTone(palette: Uint16Array, count: number, start = 0): void {
  for (let i = 0; i < count; i++) {
    const gray = grayOf(palette[start + i]);
    let r = ((307 * gray) & 0xffff) >> 8;
    const g = ((256 * gray) & 0xffff) >> 8;
    const b = ((240 * gray) & 0xffff) >> 8;
    if (r > 31) r = 31;
    palette[start + i] = RGB(r, g, b);
  }
}

export function TintPalette_CustomTone(palette: Uint16Array, count: number, rTone: number, gTone: number, bTone: number, start = 0): void {
  for (let i = 0; i < count; i++) {
    const gray = grayOf(palette[start + i]);
    const r = Math.min(31, ((rTone * gray) & 0xffff) >> 8);
    const g = Math.min(31, ((gTone * gray) & 0xffff) >> 8);
    const b = Math.min(31, ((bTone * gray) & 0xffff) >> 8);
    palette[start + i] = RGB(r, g, b);
  }
}

// ---------------------------------------------------------------- BlendPalettesGradually

const Task_BlendPalettesGradually = (taskId: number): void => {
  const data = tasks.data(taskId);
  const palettes = ((data[5] & 0xffff) | (data[6] << 16)) >>> 0;
  if (++data[4] > data[3]) {
    data[4] = 0;
    BlendPalettes(palettes, data[0], data[7]);
    const target = data[1];
    if (data[0] === target) {
      tasks.destroy(taskId);
    } else {
      data[0] += data[2];
      if (data[2] >= 0) {
        if (data[0] < target) return;
      } else if (data[0] > target) {
        return;
      }
      data[0] = target;
    }
  }
};

export function BlendPalettesGradually(selectedPalettes: number, delay: number, coeff: number, coeffTarget: number, color: number, priority: number, id: number): void {
  const taskId = tasks.create(Task_BlendPalettesGradually, priority);
  const data = tasks.data(taskId);
  data[0] = coeff;
  data[1] = coeffTarget;
  if (delay >= 0) {
    data[3] = delay;
    data[2] = 1;
  } else {
    data[3] = 0;
    data[2] = -delay + 1;
  }
  if (coeffTarget < coeff) data[2] *= -1;
  data[5] = selectedPalettes & 0xffff;
  data[6] = (selectedPalettes >>> 16) & 0xffff;
  data[7] = color;
  data[8] = id;
  Task_BlendPalettesGradually(taskId);
}

export function IsBlendPalettesGraduallyTaskActive(id: number): boolean {
  return tasks.tasks.some((t) => t.isActive && t.func === Task_BlendPalettesGradually && t.data[8] === id);
}

export function DestroyBlendPalettesGraduallyTask(): void {
  for (;;) {
    const id = tasks.findByFunc(Task_BlendPalettesGradually);
    if (id === 0xff) break;
    tasks.destroy(id);
  }
}
