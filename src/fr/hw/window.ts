// window.c + blit.c: text/graphics windows backed by 4bpp tile buffers that
// are placed on a BG tilemap.

import { BG_ATTR_BASETILE, BG_ATTR_MAPSIZE, BG_TILE_ALLOC, BG_TILE_FIND_FREE_SPACE, BG_TILE_FREE, BgTileAllocOp, CopyBgTilemapBufferToVram, FillBgTilemapBufferRect, GetBgAttribute, GetBgTilemapBuffer, LoadBgTiles, SetBgTilemapBuffer, UnsetBgTilemapBuffer, WriteSequenceToBgTilemapBuffer, gWindowTileAutoAllocEnabled } from "./bg";

export const WINDOWS_MAX = 32;
export const WINDOW_NONE = 0xff;
export const COPYWIN_NONE = 0;
export const COPYWIN_MAP = 1;
export const COPYWIN_GFX = 2;
export const COPYWIN_FULL = 3;

export const WINDOW_BG = 0;
export const WINDOW_TILEMAP_LEFT = 1;
export const WINDOW_TILEMAP_TOP = 2;
export const WINDOW_WIDTH = 3;
export const WINDOW_HEIGHT = 4;
export const WINDOW_PALETTE_NUM = 5;
export const WINDOW_BASE_BLOCK = 6;
export const WINDOW_TILE_DATA = 7;

export const PIXEL_FILL = (n: number) => ((n & 0xf) << 4) | (n & 0xf);

export type WindowTemplate = { bg: number; tilemapLeft: number; tilemapTop: number; width: number; height: number; paletteNum: number; baseBlock: number };
export const DUMMY_WIN_TEMPLATE: WindowTemplate = { bg: 0xff, tilemapLeft: 0, tilemapTop: 0, width: 0, height: 0, paletteNum: 0, baseBlock: 0 };

export type GbaWindow = { window: WindowTemplate; tileData: Uint8Array | null };

export const gWindows: GbaWindow[] = Array.from({ length: WINDOWS_MAX }, () => ({ window: { ...DUMMY_WIN_TEMPLATE }, tileData: null }));
/** true: tilemap buffer owned by the caller; Uint16Array: allocated by the window system. */
const windowBgTilemapBuffers: Array<Uint16Array | "external" | null> = [null, null, null, null];
const window8BitIds = new Set<number>();
export let gWindowClearTile = 0;

export function setWindowClearTile(tile: number): void {
  gWindowClearTile = tile;
}

function numActiveWindowsOnBg(bg: number): number {
  return gWindows.filter((w) => w.window.bg === bg).length;
}

function ensureBgTilemap(bg: number): boolean {
  if (windowBgTilemapBuffers[bg] === null) {
    const size = GetBgAttribute(bg, BG_ATTR_MAPSIZE);
    if (size !== 0xffff && size > 0) {
      const buffer = new Uint16Array(size >> 1);
      windowBgTilemapBuffers[bg] = buffer;
      SetBgTilemapBuffer(bg, buffer);
    }
  }
  return true;
}

export function InitWindows(templates: WindowTemplate[]): boolean {
  for (let i = 0; i < 4; i++) windowBgTilemapBuffers[i] = GetBgTilemapBuffer(i) ? "external" : null;
  window8BitIds.clear();
  for (const w of gWindows) {
    w.window = { ...DUMMY_WIN_TEMPLATE };
    w.tileData = null;
  }
  for (let i = 0; i < WINDOWS_MAX && i < templates.length && templates[i].bg !== 0xff; i++) {
    const t = templates[i];
    let base = 0;
    if (gWindowTileAutoAllocEnabled) {
      base = BgTileAllocOp(t.bg, 0, t.width * t.height, BG_TILE_FIND_FREE_SPACE);
      if (base === -1) return false;
    }
    ensureBgTilemap(t.bg);
    gWindows[i].tileData = new Uint8Array(0x20 * t.width * t.height);
    gWindows[i].window = { ...DUMMY_WIN_TEMPLATE, ...t };
    if (gWindowTileAutoAllocEnabled) {
      gWindows[i].window.baseBlock = base;
      BgTileAllocOp(t.bg, base, t.width * t.height, BG_TILE_ALLOC);
    }
  }
  gWindowClearTile = 0;
  return true;
}

export function AddWindow(template: WindowTemplate): number {
  let win = 0;
  for (; win < WINDOWS_MAX; win++) if (gWindows[win].window.bg === 0xff) break;
  if (win === WINDOWS_MAX) return WINDOW_NONE;
  const bg = template.bg;
  let base = 0;
  if (gWindowTileAutoAllocEnabled) {
    base = BgTileAllocOp(bg, 0, template.width * template.height, BG_TILE_FIND_FREE_SPACE);
    if (base === -1) return WINDOW_NONE;
  }
  if (windowBgTilemapBuffers[bg] === null && GetBgTilemapBuffer(bg)) windowBgTilemapBuffers[bg] = "external";
  ensureBgTilemap(bg);
  gWindows[win].tileData = new Uint8Array(0x20 * template.width * template.height);
  gWindows[win].window = { ...DUMMY_WIN_TEMPLATE, ...template };
  if (gWindowTileAutoAllocEnabled) {
    gWindows[win].window.baseBlock = base;
    BgTileAllocOp(bg, base, template.width * template.height, BG_TILE_ALLOC);
  }
  return win;
}

/** window_8bpp.c AddWindow8Bit; 8bpp tiles occupy 64 bytes and use caller-assigned tile blocks. */
export function AddWindow8Bit(template: WindowTemplate): number {
  let win = 0;
  for (; win < WINDOWS_MAX; win++) if (gWindows[win].window.bg === 0xff) break;
  if (win === WINDOWS_MAX) return WINDOW_NONE;

  const bg = template.bg;
  if (windowBgTilemapBuffers[bg] === null && GetBgTilemapBuffer(bg)) windowBgTilemapBuffers[bg] = "external";
  const mapWasMissing = windowBgTilemapBuffers[bg] === null;
  ensureBgTilemap(bg);
  try {
    gWindows[win].tileData = new Uint8Array(0x40 * template.width * template.height);
  } catch {
    if (mapWasMissing && numActiveWindowsOnBg(bg) === 0 && windowBgTilemapBuffers[bg] instanceof Uint16Array) {
      windowBgTilemapBuffers[bg] = null;
      UnsetBgTilemapBuffer(bg);
    }
    return WINDOW_NONE;
  }
  gWindows[win].window = { ...DUMMY_WIN_TEMPLATE, ...template };
  window8BitIds.add(win);
  return win;
}

export function RemoveWindow(windowId: number): void {
  const w = gWindows[windowId];
  const bg = w.window.bg;
  const is8Bit = window8BitIds.delete(windowId);
  if (gWindowTileAutoAllocEnabled && !is8Bit) BgTileAllocOp(bg, w.window.baseBlock, w.window.width * w.window.height, BG_TILE_FREE);
  w.window = { ...DUMMY_WIN_TEMPLATE };
  if (bg < 4 && numActiveWindowsOnBg(bg) === 0 && windowBgTilemapBuffers[bg] !== "external") windowBgTilemapBuffers[bg] = null;
  w.tileData = null;
}

export function FreeAllWindowBuffers(): void {
  for (let i = 0; i < 4; i++) if (windowBgTilemapBuffers[i] !== "external") windowBgTilemapBuffers[i] = null;
  for (const w of gWindows) w.tileData = null;
}

export function CopyWindowToVram(windowId: number, mode: number): void {
  const w = gWindows[windowId];
  if (!w || w.window.bg === 0xff) return;
  const size = 32 * w.window.width * w.window.height;
  if (mode === COPYWIN_MAP || mode === COPYWIN_FULL) {
    if (mode === COPYWIN_FULL && w.tileData) LoadBgTiles(w.window.bg, w.tileData, size, w.window.baseBlock);
    CopyBgTilemapBufferToVram(w.window.bg);
  } else if (mode === COPYWIN_GFX && w.tileData) {
    LoadBgTiles(w.window.bg, w.tileData, size, w.window.baseBlock);
  }
}

/** window_8bpp.c CopyWindowToVram8Bit; COPYWIN_MAP/GFX/FULL retain C semantics. */
export function CopyWindowToVram8Bit(windowId: number, mode: number): void {
  const w = gWindows[windowId];
  if (!w || w.window.bg === 0xff || !w.tileData) return;
  const size = (0x40 * w.window.width * w.window.height) & 0xffff;
  if (mode === COPYWIN_MAP || mode === COPYWIN_FULL) {
    if (mode === COPYWIN_FULL) LoadBgTiles(w.window.bg, w.tileData, size, w.window.baseBlock);
    CopyBgTilemapBufferToVram(w.window.bg);
  } else if (mode === COPYWIN_GFX) {
    LoadBgTiles(w.window.bg, w.tileData, size, w.window.baseBlock);
  }
}

export function PutWindowTilemap(windowId: number): void {
  const t = gWindows[windowId].window;
  WriteSequenceToBgTilemapBuffer(t.bg, GetBgAttribute(t.bg, BG_ATTR_BASETILE) + t.baseBlock, t.tilemapLeft, t.tilemapTop, t.width, t.height, t.paletteNum, 1);
}

export function PutWindowRectTilemapOverridePalette(windowId: number, x: number, y: number, width: number, height: number, palette: number): void {
  const t = gWindows[windowId].window;
  let row = t.baseBlock + y * t.width + x + GetBgAttribute(t.bg, BG_ATTR_BASETILE);
  for (let i = 0; i < height; i++) {
    WriteSequenceToBgTilemapBuffer(t.bg, row, t.tilemapLeft + x, t.tilemapTop + y + i, width, 1, palette, 1);
    row += t.width;
  }
}

export function ClearWindowTilemap(windowId: number): void {
  const t = gWindows[windowId].window;
  FillBgTilemapBufferRect(t.bg, gWindowClearTile, t.tilemapLeft, t.tilemapTop, t.width, t.height, t.paletteNum);
}

export function PutWindowRectTilemap(windowId: number, x: number, y: number, width: number, height: number): void {
  const t = gWindows[windowId].window;
  let row = t.baseBlock + y * t.width + x + GetBgAttribute(t.bg, BG_ATTR_BASETILE);
  for (let i = 0; i < height; i++) {
    WriteSequenceToBgTilemapBuffer(t.bg, row, t.tilemapLeft + x, t.tilemapTop + y + i, width, 1, t.paletteNum, 1);
    row += t.width;
  }
}

// ---------------------------------------------------------------- blit.c

export type Bitmap = { pixels: Uint8Array; width: number; height: number };

function pixelAddr(x: number, y: number, rowTiles: number): number {
  return ((x >> 1) & 3) + ((x >> 3) << 5) + (((y >> 3) * rowTiles) << 5) + ((y & 7) << 2);
}

function pixelAddr8Bit(x: number, y: number, rowTiles: number): number {
  return (x & 7) + ((x >> 3) << 6) + (((y >> 3) * rowTiles) << 6) + ((y & 7) << 3);
}

/** blit.c BlitBitmapRect4BitWithoutColorKey. */
export function BlitBitmapRect4BitWithoutColorKey(src: Bitmap, dst: Bitmap, srcX: number, srcY: number, dstX: number, dstY: number, width: number, height: number): void {
  BlitBitmapRect4Bit(src, dst, srcX, srcY, dstX, dstY, width, height, 0xff);
}

export function BlitBitmapRect4Bit(src: Bitmap, dst: Bitmap, srcX: number, srcY: number, dstX: number, dstY: number, width: number, height: number, colorKey: number): void {
  const xEnd = dst.width - dstX < width ? dst.width - dstX + srcX : srcX + width;
  const yEnd = dst.height - dstY < height ? dst.height - dstY + srcY : height + srcY;
  const srcRow = (src.width + (src.width & 7)) >> 3;
  const dstRow = (dst.width + (dst.width & 7)) >> 3;
  for (let sy = srcY, dy = dstY; sy < yEnd; sy++, dy++) {
    for (let sx = srcX, dx = dstX; sx < xEnd; sx++, dx++) {
      const sa = pixelAddr(sx, sy, srcRow);
      const v = (src.pixels[sa] >> ((sx & 1) << 2)) & 0xf;
      if (colorKey !== 0xff && v === colorKey) continue;
      const da = pixelAddr(dx, dy, dstRow);
      if (da >= dst.pixels.length) continue;
      const shift = (dx & 1) << 2;
      dst.pixels[da] = (v << shift) | (dst.pixels[da] & (0xf0 >> shift));
    }
  }
}

export function FillBitmapRect4Bit(surface: Bitmap, x: number, y: number, width: number, height: number, fillValue: number): void {
  const xEnd = Math.min(surface.width, x + width);
  const yEnd = Math.min(surface.height, y + height);
  const row = (surface.width + (surface.width & 7)) >> 3;
  for (let yy = y; yy < yEnd; yy++) {
    for (let xx = x; xx < xEnd; xx++) {
      const a = pixelAddr(xx, yy, row);
      if (xx & 1) surface.pixels[a] = (surface.pixels[a] & 0xf) | ((fillValue & 0xf) << 4);
      else surface.pixels[a] = (surface.pixels[a] & 0xf0) | (fillValue & 0xf);
    }
  }
}

/** blit.c BlitBitmapRect4BitTo8Bit; dest pixels contain palette-offset indices. */
export function BlitBitmapRect4BitTo8Bit(src: Bitmap, dst: Bitmap, srcX: number, srcY: number, dstX: number, dstY: number, width: number, height: number, colorKey: number, paletteOffset: number): void {
  const xEnd = dst.width - dstX < width ? dst.width - dstX + srcX : srcX + width;
  const yEnd = dst.height - dstY < height ? srcY + dst.height - dstY : srcY + height;
  const srcRow = (src.width + (src.width & 7)) >> 3;
  const dstRow = (dst.width + (dst.width & 7)) >> 3;
  const paletteBase = ((paletteOffset & 0xf) << 4) & 0xff;
  for (let sy = srcY, dy = dstY; sy < yEnd; sy++, dy++) {
    for (let sx = srcX, dx = dstX; sx < xEnd; sx++, dx++) {
      const source = src.pixels[pixelAddr(sx, sy, srcRow)];
      const color = (source >> ((sx & 1) << 2)) & 0xf;
      if (colorKey !== 0xff && color === (colorKey & 0xf)) continue;
      const da = pixelAddr8Bit(dx, dy, dstRow);
      if (da < dst.pixels.length) dst.pixels[da] = (paletteBase + color) & 0xff;
    }
  }
}

/** blit.c FillBitmapRect8Bit. */
export function FillBitmapRect8Bit(surface: Bitmap, x: number, y: number, width: number, height: number, fillValue: number): void {
  const xEnd = Math.min(surface.width, x + width);
  const yEnd = Math.min(surface.height, y + height);
  const row = (surface.width + (surface.width & 7)) >> 3;
  for (let yy = y; yy < yEnd; yy++) {
    for (let xx = x; xx < xEnd; xx++) {
      const a = pixelAddr8Bit(xx, yy, row);
      if (a < surface.pixels.length) surface.pixels[a] = fillValue & 0xff;
    }
  }
}

function windowBitmap(windowId: number): Bitmap {
  const w = gWindows[windowId];
  return { pixels: w.tileData!, width: 8 * w.window.width, height: 8 * w.window.height };
}

function windowBitmap8Bit(windowId: number): Bitmap {
  const w = gWindows[windowId];
  return { pixels: w.tileData!, width: 8 * w.window.width, height: 8 * w.window.height };
}

/** window_8bpp.c FillWindowPixelBuffer8Bit. */
export function FillWindowPixelBuffer8Bit(windowId: number, fillValue: number): void {
  gWindows[windowId].tileData?.fill(fillValue & 0xff);
}

/** window_8bpp.c FillWindowPixelRect8Bit. */
export function FillWindowPixelRect8Bit(windowId: number, fillValue: number, x: number, y: number, width: number, height: number): void {
  FillBitmapRect8Bit(windowBitmap8Bit(windowId), x, y, width, height, fillValue);
}

/** window_8bpp.c wrapper; source color zero is transparent and paletteNum selects the 16-color bank. */
export function BlitBitmapRectToWindow4BitTo8Bit(windowId: number, pixels: Uint8Array, srcX: number, srcY: number, srcWidth: number, srcHeight: number, destX: number, destY: number, rectWidth: number, rectHeight: number, paletteNum: number): void {
  BlitBitmapRect4BitTo8Bit({ pixels, width: srcWidth, height: srcHeight }, windowBitmap8Bit(windowId), srcX, srcY, destX, destY, rectWidth, rectHeight, 0, paletteNum);
}

export function BlitBitmapToWindow(windowId: number, pixels: Uint8Array, x: number, y: number, width: number, height: number): void {
  BlitBitmapRectToWindow(windowId, pixels, 0, 0, width, height, x, y, width, height);
}

export function BlitBitmapRectToWindow(windowId: number, pixels: Uint8Array, srcX: number, srcY: number, srcWidth: number, srcHeight: number, destX: number, destY: number, rectWidth: number, rectHeight: number): void {
  BlitBitmapRect4Bit({ pixels, width: srcWidth, height: srcHeight }, windowBitmap(windowId), srcX, srcY, destX, destY, rectWidth, rectHeight, 0);
}

export function BlitBitmapRectToWindowWithColorKey(windowId: number, pixels: Uint8Array, srcX: number, srcY: number, srcWidth: number, srcHeight: number, destX: number, destY: number, rectWidth: number, rectHeight: number, colorKey: number): void {
  BlitBitmapRect4Bit({ pixels, width: srcWidth, height: srcHeight }, windowBitmap(windowId), srcX, srcY, destX, destY, rectWidth, rectHeight, colorKey);
}

export function FillWindowPixelRect(windowId: number, fillValue: number, x: number, y: number, width: number, height: number): void {
  FillBitmapRect4Bit(windowBitmap(windowId), x, y, width, height, fillValue);
}

export function CopyToWindowPixelBuffer(windowId: number, src: ArrayLike<number>, size: number, tileOffset: number): void {
  const data = gWindows[windowId].tileData!;
  const n = size !== 0 ? size : src.length;
  for (let i = 0; i < n && 0x20 * tileOffset + i < data.length && i < src.length; i++) data[0x20 * tileOffset + i] = src[i];
}

export function FillWindowPixelBuffer(windowId: number, fillValue: number): void {
  gWindows[windowId].tileData?.fill(fillValue & 0xff);
}

export function ScrollWindow(windowId: number, direction: number, distance: number, fillValue: number): void {
  const w = gWindows[windowId];
  const data = w.tileData!;
  const bmp = windowBitmap(windowId);
  const fill = fillValue & 0xf;
  const px = (x: number, y: number) => (data[pixelAddr(x, y, w.window.width)] >> ((x & 1) << 2)) & 0xf;
  const copy = new Uint8Array(bmp.width * bmp.height);
  for (let y = 0; y < bmp.height; y++) for (let x = 0; x < bmp.width; x++) copy[y * bmp.width + x] = px(x, y);
  for (let y = 0; y < bmp.height; y++) {
    const sy = direction === 0 ? y + distance : direction === 1 ? y - distance : y;
    for (let x = 0; x < bmp.width; x++) {
      const v = sy >= 0 && sy < bmp.height ? copy[sy * bmp.width + x] : fill;
      FillBitmapRect4Bit(bmp, x, y, 1, 1, v);
    }
  }
}

export function SetWindowAttribute(windowId: number, attr: number, value: number): boolean {
  const t = gWindows[windowId].window;
  switch (attr) {
    case WINDOW_TILEMAP_LEFT: t.tilemapLeft = value; return false;
    case WINDOW_TILEMAP_TOP: t.tilemapTop = value; return false;
    case WINDOW_PALETTE_NUM: t.paletteNum = value; return false;
    case WINDOW_BASE_BLOCK: t.baseBlock = value; return false;
  }
  return true;
}

export function GetWindowAttribute(windowId: number, attr: number): number {
  const t = gWindows[windowId].window;
  switch (attr) {
    case WINDOW_BG: return t.bg;
    case WINDOW_TILEMAP_LEFT: return t.tilemapLeft;
    case WINDOW_TILEMAP_TOP: return t.tilemapTop;
    case WINDOW_WIDTH: return t.width;
    case WINDOW_HEIGHT: return t.height;
    case WINDOW_PALETTE_NUM: return t.paletteNum;
    case WINDOW_BASE_BLOCK: return t.baseBlock;
  }
  return 0;
}

export function CallWindowFunction(windowId: number, func: (bg: number, left: number, top: number, width: number, height: number, paletteNum: number) => void): void {
  const t = gWindows[windowId].window;
  func(t.bg, t.tilemapLeft, t.tilemapTop, t.width, t.height, t.paletteNum);
}

/** A pixel view of a window's tile buffer for the text printer. */
export class WindowSurface {
  constructor(readonly windowId: number) {}

  private get w(): GbaWindow {
    return gWindows[this.windowId];
  }

  get pixelWidth(): number {
    return this.w.window.width * 8;
  }

  get pixelHeight(): number {
    return this.w.window.height * 8;
  }

  fill(color: number): void {
    this.w.tileData?.fill(((color & 0xf) << 4) | (color & 0xf));
  }

  fillRect(color: number, x: number, y: number, w: number, h: number): void {
    if (!this.w.tileData) return;
    FillBitmapRect4Bit(windowBitmap(this.windowId), Math.max(0, x), Math.max(0, y), w + Math.min(0, x), h + Math.min(0, y), color);
  }

  setPixel(x: number, y: number, color: number): void {
    const data = this.w.tileData;
    if (!data || x < 0 || y < 0 || x >= this.pixelWidth || y >= this.pixelHeight) return;
    const a = pixelAddr(x, y, this.w.window.width);
    if (x & 1) data[a] = (data[a] & 0xf) | ((color & 0xf) << 4);
    else data[a] = (data[a] & 0xf0) | (color & 0xf);
  }

  /** Linear (row-major) index source, as used by the font renderer. */
  blit(src: ArrayLike<number>, srcWidth: number, srcX: number, srcY: number, dstX: number, dstY: number, w: number, h: number, transparent = false): void {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = src[(srcY + y) * srcWidth + srcX + x];
        if (transparent && v === 0) continue;
        this.setPixel(dstX + x, dstY + y, v);
      }
    }
  }

  scroll(dy: number, fillColor: number): void {
    ScrollWindow(this.windowId, 0, dy, fillColor);
  }
}
