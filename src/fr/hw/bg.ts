// bg.c: background configuration, tilemap buffers and VRAM loading.
// DMA3 requests complete immediately.

import { GetGpuReg, SetGpuReg } from "./gpu";
import { ppu, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BG1HOFS, REG_OFFSET_BG1VOFS, REG_OFFSET_BG2HOFS, REG_OFFSET_BG2PA, REG_OFFSET_BG2PB, REG_OFFSET_BG2PC, REG_OFFSET_BG2PD, REG_OFFSET_BG2VOFS, REG_OFFSET_BG2X_H, REG_OFFSET_BG2X_L, REG_OFFSET_BG2Y_H, REG_OFFSET_BG2Y_L, REG_OFFSET_BG3HOFS, REG_OFFSET_BG3VOFS, REG_OFFSET_BG3X_H, REG_OFFSET_BG3X_L, REG_OFFSET_BG3Y_H, REG_OFFSET_BG3Y_L, REG_OFFSET_MOSAIC } from "./ppu";
import { gSineTable } from "./trig";

export const BG_CHAR_SIZE = 0x4000;
export const BG_SCREEN_SIZE = 0x800;
export const TILE_SIZE_4BPP = 32;
export const TILE_SIZE_8BPP = 64;

export const BG_CTRL_ATTR_VISIBLE = 1;
export const BG_CTRL_ATTR_CHARBASEINDEX = 2;
export const BG_CTRL_ATTR_MAPBASEINDEX = 3;
export const BG_CTRL_ATTR_SCREENSIZE = 4;
export const BG_CTRL_ATTR_PALETTEMODE = 5;
export const BG_CTRL_ATTR_PRIORITY = 6;
export const BG_CTRL_ATTR_MOSAIC = 7;
export const BG_CTRL_ATTR_WRAPAROUND = 8;

export const BG_ATTR_CHARBASEINDEX = 1;
export const BG_ATTR_MAPBASEINDEX = 2;
export const BG_ATTR_SCREENSIZE = 3;
export const BG_ATTR_PALETTEMODE = 4;
export const BG_ATTR_MOSAIC = 5;
export const BG_ATTR_WRAPAROUND = 6;
export const BG_ATTR_PRIORITY = 7;
export const BG_ATTR_MAPSIZE = 8;
export const BG_ATTR_BGTYPE = 9;
export const BG_ATTR_BASETILE = 10;

export const BG_COORD_SET = 0;
export const BG_COORD_ADD = 1;
export const BG_COORD_SUB = 2;

export const BG_MOSAIC_SET = 0;
export const BG_MOSAIC_SET_H = 1;
export const BG_MOSAIC_INC_H = 2;
export const BG_MOSAIC_DEC_H = 3;
export const BG_MOSAIC_SET_V = 4;
export const BG_MOSAIC_INC_V = 5;
export const BG_MOSAIC_DEC_V = 6;

export const BG_TILE_FIND_FREE_SPACE = 0;
export const BG_TILE_ALLOC = 1;
export const BG_TILE_FREE = 2;

export type BgTemplate = { bg: number; charBaseIndex: number; mapBaseIndex: number; screenSize: number; paletteMode: number; priority: number; baseTile: number };

type BgConfig = { visible: number; screenSize: number; priority: number; mosaic: number; wraparound: number; charBaseIndex: number; mapBaseIndex: number; paletteMode: number };
type BgConfig2 = { baseTile: number; basePalette: number; tilemap: Uint16Array | null; bg_x: number; bg_y: number };

const zero = (): BgConfig => ({ visible: 0, screenSize: 0, priority: 0, mosaic: 0, wraparound: 0, charBaseIndex: 0, mapBaseIndex: 0, paletteMode: 0 });
const configs: BgConfig[] = [zero(), zero(), zero(), zero()];
let bgVisibilityAndMode = 0;
const configs2: BgConfig2[] = Array.from({ length: 4 }, () => ({ baseTile: 0, basePalette: 0, tilemap: null, bg_x: 0, bg_y: 0 }));
const tileAllocMap = new Uint8Array(0x100);
export let gWindowTileAutoAllocEnabled = false;

const DISPCNT_ALL_BG_AND_MODE_BITS = 0x0f07;

export function ResetBgs(): void {
  ResetBgControlStructs();
  bgVisibilityAndMode = 0;
  SetTextModeAndHideBgs();
}

function setBgModeInternal(mode: number): void {
  bgVisibilityAndMode = (bgVisibilityAndMode & 0xfff8) | mode;
}

export function GetBgMode(): number {
  return bgVisibilityAndMode & 7;
}

export function ResetBgControlStructs(): void {
  for (let i = 0; i < 4; i++) configs[i] = zero();
}

export function SetBgControlAttributes(bg: number, charBaseIndex: number, mapBaseIndex: number, screenSize: number, paletteMode: number, priority: number, mosaic: number, wraparound: number): void {
  if (bg > 3) return;
  const c = configs[bg];
  if (charBaseIndex !== 0xff) c.charBaseIndex = charBaseIndex & 3;
  if (mapBaseIndex !== 0xff) c.mapBaseIndex = mapBaseIndex & 0x1f;
  if (screenSize !== 0xff) c.screenSize = screenSize & 3;
  if (paletteMode !== 0xff) c.paletteMode = paletteMode & 1;
  if (priority !== 0xff) c.priority = priority & 3;
  if (mosaic !== 0xff) c.mosaic = mosaic & 1;
  if (wraparound !== 0xff) c.wraparound = wraparound & 1;
  c.visible = 1;
}

export function GetBgControlAttribute(bg: number, attr: number): number {
  if (bg > 3 || !configs[bg].visible) return 0xff;
  const c = configs[bg];
  switch (attr) {
    case BG_CTRL_ATTR_VISIBLE: return c.visible;
    case BG_CTRL_ATTR_CHARBASEINDEX: return c.charBaseIndex;
    case BG_CTRL_ATTR_MAPBASEINDEX: return c.mapBaseIndex;
    case BG_CTRL_ATTR_SCREENSIZE: return c.screenSize;
    case BG_CTRL_ATTR_PALETTEMODE: return c.paletteMode;
    case BG_CTRL_ATTR_PRIORITY: return c.priority;
    case BG_CTRL_ATTR_MOSAIC: return c.mosaic;
    case BG_CTRL_ATTR_WRAPAROUND: return c.wraparound;
  }
  return 0xff;
}

/** Copy bytes into VRAM (DMA3 16-bit copy). */
export function copyToVram(src: ArrayLike<number>, dest: number, size: number): void {
  const vram = ppu.vram;
  if (src instanceof Uint16Array) {
    for (let i = 0; i < size >> 1 && dest + i * 2 + 1 < vram.length; i++) {
      const v = src[i] ?? 0;
      vram[dest + i * 2] = v & 0xff;
      vram[dest + i * 2 + 1] = v >> 8;
    }
    return;
  }
  const n = Math.min(size, src.length, vram.length - dest);
  if (src instanceof Uint8Array) vram.set(src.subarray(0, n), dest);
  else for (let i = 0; i < n; i++) vram[dest + i] = src[i];
}

export function LoadBgVram(bg: number, src: ArrayLike<number>, size: number, destOffset: number, mode: number): number {
  if (bg > 3 || !configs[bg].visible) return -1;
  let offset: number;
  if (mode === 1) offset = configs[bg].charBaseIndex * BG_CHAR_SIZE;
  else if (mode === 2) offset = configs[bg].mapBaseIndex * BG_SCREEN_SIZE;
  else return -1;
  copyToVram(src, (destOffset + offset) & 0xffff, size);
  return 0;
}

function showBgInternal(bg: number): void {
  if (bg > 3 || !configs[bg].visible) return;
  const c = configs[bg];
  const value = c.priority | (c.charBaseIndex << 2) | (c.mosaic << 6) | (c.paletteMode << 7) | (c.mapBaseIndex << 8) | (c.wraparound << 13) | (c.screenSize << 14);
  SetGpuReg((bg << 1) + 0x8, value);
  bgVisibilityAndMode |= 1 << (bg + 8);
  bgVisibilityAndMode &= DISPCNT_ALL_BG_AND_MODE_BITS;
}

function hideBgInternal(bg: number): void {
  if (bg > 3) return;
  bgVisibilityAndMode &= ~(1 << (bg + 8));
  bgVisibilityAndMode &= DISPCNT_ALL_BG_AND_MODE_BITS;
}

function syncBgVisibilityAndMode(): void {
  SetGpuReg(0, (GetGpuReg(0) & ~DISPCNT_ALL_BG_AND_MODE_BITS) | bgVisibilityAndMode);
}

export function SetTextModeAndHideBgs(): void {
  SetGpuReg(0, GetGpuReg(0) & ~DISPCNT_ALL_BG_AND_MODE_BITS);
}

/** BIOS BgAffineSet for one entry. */
export function BgAffineSet(texX: number, texY: number, scrX: number, scrY: number, sx: number, sy: number, alpha: number): { pa: number; pb: number; pc: number; pd: number; dx: number; dy: number } {
  const theta = (alpha >> 8) & 0xff;
  const sin = gSineTable[theta];
  const cos = gSineTable[(theta + 64) & 0xff];
  const pa = ((sx * cos) >> 8) << 16 >> 16;
  const pb = ((-sx * sin) >> 8) << 16 >> 16;
  const pc = ((sy * sin) >> 8) << 16 >> 16;
  const pd = ((sy * cos) >> 8) << 16 >> 16;
  const dx = texX - (pa * scrX + pb * scrY);
  const dy = texY - (pc * scrX + pd * scrY);
  return { pa, pb, pc, pd, dx, dy };
}

export function SetBgAffine(bg: number, srcCenterX: number, srcCenterY: number, dispCenterX: number, dispCenterY: number, scaleX: number, scaleY: number, rotationAngle: number): void {
  const mode = bgVisibilityAndMode & 7;
  if (mode === 1) { if (bg !== 2) return; } else if (mode === 2) { if (bg < 2 || bg > 3) return; } else return;
  const d = BgAffineSet(srcCenterX, srcCenterY, dispCenterX, dispCenterY, scaleX, scaleY, rotationAngle);
  SetGpuReg(REG_OFFSET_BG2PA, d.pa & 0xffff);
  SetGpuReg(REG_OFFSET_BG2PB, d.pb & 0xffff);
  SetGpuReg(REG_OFFSET_BG2PC, d.pc & 0xffff);
  SetGpuReg(REG_OFFSET_BG2PD, d.pd & 0xffff);
  SetGpuReg(REG_OFFSET_BG2X_L, d.dx & 0xffff);
  SetGpuReg(REG_OFFSET_BG2X_H, (d.dx >> 16) & 0xffff);
  SetGpuReg(REG_OFFSET_BG2Y_L, d.dy & 0xffff);
  SetGpuReg(REG_OFFSET_BG2Y_H, (d.dy >> 16) & 0xffff);
}

export function BgTileAllocOp(bg: number, offset: number, count: number, mode: number): number {
  switch (mode) {
    case BG_TILE_FIND_FREE_SPACE: {
      const start = GetBgControlAttribute(bg, BG_CTRL_ATTR_CHARBASEINDEX) * (BG_CHAR_SIZE / TILE_SIZE_4BPP);
      const end = Math.min(0x800, start + 0x400);
      let blockSize = 0;
      let blockStart = 0;
      offset = 0;
      for (let i = start; i < end; i++, offset++) {
        if (!((tileAllocMap[i >> 3] >> (i & 7)) & 1)) {
          if (blockSize) {
            blockSize++;
            if (blockSize === count) return blockStart;
          } else {
            blockStart = offset;
            blockSize = 1;
            if (count === 1) return blockStart;
          }
        } else {
          blockSize = 0;
        }
      }
      return -1;
    }
    case BG_TILE_ALLOC: {
      const start = GetBgControlAttribute(bg, BG_CTRL_ATTR_CHARBASEINDEX) * (BG_CHAR_SIZE / TILE_SIZE_4BPP) + offset;
      for (let i = start; i < start + count; i++) tileAllocMap[i >> 3] |= 1 << (i & 7);
      break;
    }
    case BG_TILE_FREE: {
      const start = GetBgControlAttribute(bg, BG_CTRL_ATTR_CHARBASEINDEX) * (BG_CHAR_SIZE / TILE_SIZE_4BPP) + offset;
      for (let i = start; i < start + count; i++) tileAllocMap[i >> 3] &= ~(1 << (i & 7));
      break;
    }
  }
  return 0;
}

export function ResetBgsAndClearDma3BusyFlags(enableWindowTileAutoAlloc: boolean | number): void {
  ResetBgs();
  gWindowTileAutoAllocEnabled = !!enableWindowTileAutoAlloc;
  tileAllocMap.fill(0);
}

export function InitBgFromTemplate(t: BgTemplate): void {
  const bg = t.bg;
  if (bg >= 4) return;
  SetBgControlAttributes(bg, t.charBaseIndex ?? 0, t.mapBaseIndex ?? 0, t.screenSize ?? 0, t.paletteMode ?? 0, t.priority ?? 0, 0, 0);
  const c2 = configs2[bg];
  c2.baseTile = t.baseTile ?? 0;
  c2.basePalette = 0;
  c2.tilemap = null;
  c2.bg_x = 0;
  c2.bg_y = 0;
  tileAllocMap[((t.charBaseIndex ?? 0) * (BG_CHAR_SIZE / TILE_SIZE_4BPP)) >> 3] = 1;
}

export function InitBgsFromTemplates(bgMode: number, templates: BgTemplate[], numTemplates = templates.length): void {
  setBgModeInternal(bgMode);
  ResetBgControlStructs();
  for (let i = 0; i < numTemplates; i++) InitBgFromTemplate(templates[i]);
}

export function LoadBgTiles(bg: number, src: ArrayLike<number>, size: number, destOffset: number): number {
  const tileOffset = GetBgControlAttribute(bg, BG_CTRL_ATTR_PALETTEMODE) === 0 ? (configs2[bg].baseTile + destOffset) * 0x20 : (configs2[bg].baseTile + destOffset) * 0x40;
  const cursor = LoadBgVram(bg, src, size, tileOffset, 1);
  if (cursor < 0) return -1;
  if (gWindowTileAutoAllocEnabled) BgTileAllocOp(bg, tileOffset / 0x20, size / 0x20, BG_TILE_ALLOC);
  return cursor;
}

export function LoadBgTilemap(bg: number, src: ArrayLike<number>, size: number, destOffset: number): number {
  return LoadBgVram(bg, src, size, destOffset * 32, 2);
}

export function IsDma3ManagerBusyWithBgCopy(): boolean {
  return false;
}

export function ShowBg(bg: number): void {
  showBgInternal(bg);
  syncBgVisibilityAndMode();
}

export function HideBg(bg: number): void {
  hideBgInternal(bg);
  syncBgVisibilityAndMode();
}

export function SetBgAttribute(bg: number, attr: number, value: number): void {
  switch (attr) {
    case BG_ATTR_CHARBASEINDEX: SetBgControlAttributes(bg, value, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff); break;
    case BG_ATTR_MAPBASEINDEX: SetBgControlAttributes(bg, 0xff, value, 0xff, 0xff, 0xff, 0xff, 0xff); break;
    case BG_ATTR_SCREENSIZE: SetBgControlAttributes(bg, 0xff, 0xff, value, 0xff, 0xff, 0xff, 0xff); break;
    case BG_ATTR_PALETTEMODE: SetBgControlAttributes(bg, 0xff, 0xff, 0xff, value, 0xff, 0xff, 0xff); break;
    case BG_ATTR_PRIORITY: SetBgControlAttributes(bg, 0xff, 0xff, 0xff, 0xff, value, 0xff, 0xff); break;
    case BG_ATTR_MOSAIC: SetBgControlAttributes(bg, 0xff, 0xff, 0xff, 0xff, 0xff, value, 0xff); break;
    case BG_ATTR_WRAPAROUND: SetBgControlAttributes(bg, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, value); break;
  }
}

export function GetBgAttribute(bg: number, attr: number): number {
  switch (attr) {
    case BG_ATTR_CHARBASEINDEX: return GetBgControlAttribute(bg, BG_CTRL_ATTR_CHARBASEINDEX);
    case BG_ATTR_MAPBASEINDEX: return GetBgControlAttribute(bg, BG_CTRL_ATTR_MAPBASEINDEX);
    case BG_ATTR_SCREENSIZE: return GetBgControlAttribute(bg, BG_CTRL_ATTR_SCREENSIZE);
    case BG_ATTR_PALETTEMODE: return GetBgControlAttribute(bg, BG_CTRL_ATTR_PALETTEMODE);
    case BG_ATTR_PRIORITY: return GetBgControlAttribute(bg, BG_CTRL_ATTR_PRIORITY);
    case BG_ATTR_MOSAIC: return GetBgControlAttribute(bg, BG_CTRL_ATTR_MOSAIC);
    case BG_ATTR_WRAPAROUND: return GetBgControlAttribute(bg, BG_CTRL_ATTR_WRAPAROUND);
    case BG_ATTR_MAPSIZE:
      switch (GetBgType(bg)) {
        case 0: return GetBgMetricTextMode(bg, 0) * 0x800;
        case 1: return GetBgMetricAffineMode(bg, 0) * 0x100;
        default: return 0;
      }
    case BG_ATTR_BGTYPE: return GetBgType(bg);
    case BG_ATTR_BASETILE: return configs2[bg].baseTile;
  }
  return -1;
}

function writeBgScroll(bg: number, horizontal: boolean): void {
  const mode = GetBgMode();
  const v = horizontal ? configs2[bg].bg_x : configs2[bg].bg_y;
  if (bg < 2 || mode === 0) {
    const reg = horizontal ? [REG_OFFSET_BG0HOFS, REG_OFFSET_BG1HOFS, REG_OFFSET_BG2HOFS, REG_OFFSET_BG3HOFS][bg] : [REG_OFFSET_BG0VOFS, REG_OFFSET_BG1VOFS, REG_OFFSET_BG2VOFS, REG_OFFSET_BG3VOFS][bg];
    SetGpuReg(reg, (v >> 8) & 0xffff);
  } else if (bg === 2 || (bg === 3 && mode === 2)) {
    const [hi, lo] = bg === 2 ? (horizontal ? [REG_OFFSET_BG2X_H, REG_OFFSET_BG2X_L] : [REG_OFFSET_BG2Y_H, REG_OFFSET_BG2Y_L]) : (horizontal ? [REG_OFFSET_BG3X_H, REG_OFFSET_BG3X_L] : [REG_OFFSET_BG3Y_H, REG_OFFSET_BG3Y_L]);
    SetGpuReg(hi, (v >>> 16) & 0xffff);
    SetGpuReg(lo, v & 0xffff);
  }
}

export function ChangeBgX(bg: number, value: number, op: number): number {
  if (bg > 3 || GetBgControlAttribute(bg, BG_CTRL_ATTR_VISIBLE) === 0) return -1;
  const c = configs2[bg];
  if (op === BG_COORD_ADD) c.bg_x = (c.bg_x + value) | 0;
  else if (op === BG_COORD_SUB) c.bg_x = (c.bg_x - value) | 0;
  else c.bg_x = value | 0;
  writeBgScroll(bg, true);
  return c.bg_x;
}

export function ChangeBgY(bg: number, value: number, op: number): number {
  if (bg > 3 || GetBgControlAttribute(bg, BG_CTRL_ATTR_VISIBLE) === 0) return -1;
  const c = configs2[bg];
  if (op === BG_COORD_ADD) c.bg_y = (c.bg_y + value) | 0;
  else if (op === BG_COORD_SUB) c.bg_y = (c.bg_y - value) | 0;
  else c.bg_y = value | 0;
  writeBgScroll(bg, false);
  return c.bg_y;
}

export function GetBgX(bg: number): number {
  if (bg > 3 || GetBgControlAttribute(bg, BG_CTRL_ATTR_VISIBLE) === 0) return -1;
  return configs2[bg].bg_x;
}

export function GetBgY(bg: number): number {
  if (bg > 3 || GetBgControlAttribute(bg, BG_CTRL_ATTR_VISIBLE) === 0) return -1;
  return configs2[bg].bg_y;
}

export function AdjustBgMosaic(value: number, mode: number): number {
  let size = GetGpuReg(REG_OFFSET_MOSAIC);
  let h = size & 0xf;
  let v = (size >> 4) & 0xf;
  size &= 0xff00;
  switch (mode) {
    case BG_MOSAIC_SET_H: h = value & 0xf; break;
    case BG_MOSAIC_INC_H: h = Math.min(0xf, h + value); break;
    case BG_MOSAIC_DEC_H: h = Math.max(0, h - value); break;
    case BG_MOSAIC_SET_V: v = value & 0xf; break;
    case BG_MOSAIC_INC_V: v = Math.min(0xf, v + value); break;
    case BG_MOSAIC_DEC_V: v = Math.max(0, v - value); break;
    default: h = value & 0xf; v = value >> 4; break;
  }
  size |= (v << 4) & 0xf0;
  size |= h & 0xf;
  SetGpuReg(REG_OFFSET_MOSAIC, size);
  return size;
}

export function SetBgTilemapBuffer(bg: number, tilemap: Uint16Array): void {
  if (bg <= 3 && GetBgControlAttribute(bg, BG_CTRL_ATTR_VISIBLE) !== 0) configs2[bg].tilemap = tilemap;
}

export function UnsetBgTilemapBuffer(bg: number): void {
  if (bg <= 3 && GetBgControlAttribute(bg, BG_CTRL_ATTR_VISIBLE) !== 0) configs2[bg].tilemap = null;
}

export function GetBgTilemapBuffer(bg: number): Uint16Array | null {
  if (bg > 3 || GetBgControlAttribute(bg, BG_CTRL_ATTR_VISIBLE) === 0) return null;
  return configs2[bg].tilemap;
}

function bytesOf(buf: Uint16Array): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** CopyToBgTilemapBuffer(bg, src, size (0 = compressed, whole source), destOffset in tiles) */
export function CopyToBgTilemapBuffer(bg: number, src: ArrayLike<number>, mode: number, destOffset: number): void {
  const tm = configs2[bg].tilemap;
  if (bg > 3 || !tm) return;
  const dst = bytesOf(tm);
  const start = destOffset * 32;
  const size = mode !== 0 ? mode : src.length;
  for (let i = 0; i < size && start + i < dst.length && i < src.length; i++) dst[start + i] = src[i];
}

export function CopyBgTilemapBufferToVram(bg: number): void {
  const tm = configs2[bg].tilemap;
  if (bg > 3 || !tm) return;
  let size: number;
  switch (GetBgType(bg)) {
    case 0: size = GetBgMetricTextMode(bg, 0) * 0x800; break;
    case 1: size = GetBgMetricAffineMode(bg, 0) * 0x100; break;
    default: size = 0;
  }
  LoadBgVram(bg, bytesOf(tm), size, 0, 2);
}

/** src is a u16 tilemap array for text BGs or bytes for affine BGs. */
export function CopyToBgTilemapBufferRect(bg: number, src: ArrayLike<number>, destX: number, destY: number, width: number, height: number): void {
  const tm = configs2[bg].tilemap;
  if (bg > 3 || !tm) return;
  let k = 0;
  switch (GetBgType(bg)) {
    case 0:
      for (let y = destY; y < destY + height; y++) for (let x = destX; x < destX + width; x++) tm[(y * 0x20 + x) & 0xffff] = src[k++];
      break;
    case 1: {
      const dst = bytesOf(tm);
      const w = GetBgMetricAffineMode(bg, 1);
      for (let y = destY; y < destY + height; y++) for (let x = destX; x < destX + width; x++) dst[y * w + x] = src[k++];
      break;
    }
  }
}

export function CopyToBgTilemapBufferRect_ChangePalette(bg: number, src: ArrayLike<number>, destX: number, destY: number, rectWidth: number, rectHeight: number, palette: number): void {
  CopyRectToBgTilemapBufferRect(bg, src, 0, 0, rectWidth, rectHeight, destX, destY, rectWidth, rectHeight, palette, 0, 0);
}

export function CopyRectToBgTilemapBufferRect(bg: number, src: ArrayLike<number>, srcX: number, srcY: number, srcWidth: number, _srcHeight: number, destX: number, destY: number, rectWidth: number, rectHeight: number, palette1: number, tileOffset: number, palette2: number): void {
  const tm = configs2[bg].tilemap;
  if (bg > 3 || !tm) return;
  const screenSize = GetBgControlAttribute(bg, BG_CTRL_ATTR_SCREENSIZE);
  const screenWidth = GetBgMetricTextMode(bg, 1) * 0x20;
  const screenHeight = GetBgMetricTextMode(bg, 2) * 0x20;
  switch (GetBgType(bg)) {
    case 0: {
      let p = srcY * srcWidth + srcX;
      for (let i = destY; i < destY + rectHeight; i++) {
        for (let j = destX; j < destX + rectWidth; j++) {
          const index = GetTileMapIndexFromCoords(j, i, screenSize, screenWidth, screenHeight);
          tm[index] = CopyTileMapEntry(src[p] ?? 0, tm[index], palette1, tileOffset, palette2);
          p++;
        }
        p += srcWidth - rectWidth;
      }
      break;
    }
    case 1: {
      const dst = bytesOf(tm);
      const w = GetBgMetricAffineMode(bg, 1);
      let p = srcY * srcWidth + srcX;
      for (let i = destY; i < destY + rectHeight; i++) {
        for (let j = destX; j < destX + rectWidth; j++) {
          dst[w * i + j] = (src[p] + tileOffset) & 0xff;
          p++;
        }
        p += srcWidth - rectWidth;
      }
      break;
    }
  }
}

export function FillBgTilemapBufferRect_Palette0(bg: number, tileNum: number, x: number, y: number, width: number, height: number): void {
  const tm = configs2[bg].tilemap;
  if (bg > 3 || !tm) return;
  switch (GetBgType(bg)) {
    case 0:
      for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) tm[(yy * 0x20 + xx) & 0xffff] = tileNum;
      break;
    case 1: {
      const dst = bytesOf(tm);
      const w = GetBgMetricAffineMode(bg, 1);
      for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) dst[yy * w + xx] = tileNum & 0xff;
      break;
    }
  }
}

export function FillBgTilemapBufferRect(bg: number, tileNum: number, x: number, y: number, width: number, height: number, palette: number): void {
  WriteSequenceToBgTilemapBuffer(bg, tileNum, x, y, width, height, palette, 0);
}

export function WriteSequenceToBgTilemapBuffer(bg: number, firstTileNum: number, x: number, y: number, width: number, height: number, paletteSlot: number, tileNumDelta: number): void {
  const tm = configs2[bg].tilemap;
  if (bg > 3 || !tm) return;
  const attribute = GetBgControlAttribute(bg, BG_CTRL_ATTR_SCREENSIZE);
  const w = GetBgMetricTextMode(bg, 1) * 0x20;
  const h = GetBgMetricTextMode(bg, 2) * 0x20;
  switch (GetBgType(bg)) {
    case 0:
      for (let yy = y; yy < y + height; yy++) {
        for (let xx = x; xx < x + width; xx++) {
          const index = GetTileMapIndexFromCoords(xx, yy, attribute, w, h) & 0xffff;
          tm[index] = CopyTileMapEntry(firstTileNum, tm[index], paletteSlot, 0, 0);
          firstTileNum = ((firstTileNum & 0xfc00) + ((firstTileNum + tileNumDelta) & 0x3ff)) & 0xffff;
        }
      }
      break;
    case 1: {
      const dst = bytesOf(tm);
      const mw = GetBgMetricAffineMode(bg, 1);
      for (let yy = y; yy < y + height; yy++) {
        for (let xx = x; xx < x + width; xx++) {
          dst[yy * mw + xx] = firstTileNum & 0xff;
          firstTileNum = ((firstTileNum & 0xfc00) + ((firstTileNum + tileNumDelta) & 0x3ff)) & 0xffff;
        }
      }
      break;
    }
  }
}

export function GetBgMetricTextMode(bg: number, which: number): number {
  const a = GetBgControlAttribute(bg, BG_CTRL_ATTR_SCREENSIZE);
  switch (which) {
    case 0: return [1, 2, 2, 4][a] ?? 0;
    case 1: return [1, 2, 1, 2][a] ?? 0;
    case 2: return [1, 1, 2, 2][a] ?? 0;
  }
  return 0;
}

export function GetBgMetricAffineMode(bg: number, which: number): number {
  const a = GetBgControlAttribute(bg, BG_CTRL_ATTR_SCREENSIZE);
  switch (which) {
    case 0: return [1, 4, 0x10, 0x40][a] ?? 0;
    case 1:
    case 2: return 0x10 << a;
  }
  return 0;
}

export function GetTileMapIndexFromCoords(x: number, y: number, screenSize: number, screenWidth: number, screenHeight: number): number {
  x &= screenWidth - 1;
  y &= screenHeight - 1;
  switch (screenSize) {
    case 3:
      if (y >= 0x20) y += 0x20;
    // fallthrough
    case 1:
      if (x >= 0x20) {
        x -= 0x20;
        y += 0x20;
      }
  }
  return y * 0x20 + x;
}

/** Returns the new tilemap entry (C writes it through a pointer). */
export function CopyTileMapEntry(src: number, dest: number, palette1: number, tileOffset: number, palette2: number): number {
  let v: number;
  if (palette1 >= 0 && palette1 <= 15) {
    v = ((src + tileOffset) & 0xfff) + ((palette1 + palette2) << 12);
  } else if (palette1 === 16) {
    v = dest & 0xfc00;
    v += palette2 << 12;
    v |= (src + tileOffset) & 0x3ff;
  } else {
    v = src + tileOffset + (palette2 << 12);
  }
  return v & 0xffff;
}

export function GetBgType(bg: number): number {
  const mode = GetBgMode();
  switch (bg) {
    case 0:
    case 1: return mode === 0 || mode === 1 ? 0 : 0xffff;
    case 2: return mode === 0 ? 0 : mode === 1 || mode === 2 ? 1 : 0xffff;
    case 3: return mode === 0 ? 0 : mode === 2 ? 1 : 0xffff;
  }
  return 0xffff;
}
