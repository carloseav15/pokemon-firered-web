// A small model of window.c/menu.c: text windows are 4bpp pixel buffers
// placed on a BG tilemap, optionally surrounded by frame tiles.

import { b64, rom } from "../rom";

export type Rgb = number[];
export type FrameKind = "none" | "dialogue" | "signpost" | "std" | "stdwin";

const TILE = 8;

export function stdPalette(index = 0): Rgb[] {
  return rom.windows.stdpal[index];
}

/** An 8x8 tile sheet colorized with a palette; used for window frames. */
class TileSheet {
  private tiles: HTMLCanvasElement[] = [];
  constructor(name: string, palette: Rgb[]) {
    const raw = rom.windows[name];
    const pixels = b64(raw.pixels);
    const cols = raw.width / TILE;
    const rows = raw.height / TILE;
    for (let t = 0; t < cols * rows; t++) {
      const canvas = document.createElement("canvas");
      canvas.width = TILE;
      canvas.height = TILE;
      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(TILE, TILE);
      const sx = (t % cols) * TILE;
      const sy = Math.floor(t / cols) * TILE;
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const index = pixels[(sy + y) * raw.width + sx + x] & 0xf;
          const o = (y * TILE + x) * 4;
          if (index === 0) continue;
          const c = palette[index] ?? [255, 0, 255];
          img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      this.tiles.push(canvas);
    }
  }

  draw(ctx: CanvasRenderingContext2D, tile: number, x: number, y: number, vflip = false, hflip = false): void {
    const canvas = this.tiles[tile];
    if (!canvas) return;
    if (!vflip && !hflip) {
      ctx.drawImage(canvas, x, y);
      return;
    }
    ctx.save();
    ctx.translate(x + (hflip ? TILE : 0), y + (vflip ? TILE : 0));
    ctx.scale(hflip ? -1 : 1, vflip ? -1 : 1);
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }
}

const sheets = new Map<string, TileSheet>();

function frameSheet(kind: FrameKind, frameType: number): TileSheet {
  const key = kind === "std" ? `std${frameType}` : kind;
  let sheet = sheets.get(key);
  if (!sheet) {
    if (kind === "dialogue") sheet = new TileSheet("menu_message", stdPalette(0));
    else if (kind === "signpost") sheet = new TileSheet("signpost", stdPalette(1));
    else if (kind === "stdwin") sheet = new TileSheet("std", stdPalette(3));
    else {
      const name = `type${frameType + 1}`;
      sheet = new TileSheet(name, rom.windows[name].palette);
    }
    sheets.set(key, sheet);
  }
  return sheet;
}

export class Window {
  readonly pixels: Uint8Array;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private dirty = true;
  frame: FrameKind = "none";
  frameType = 0;
  visible = true;
  /** Draw a solid fill (palette index) behind transparent pixels; used by some menus. */
  constructor(public x: number, public y: number, public width: number, public height: number, public palette: Rgb[] = stdPalette(0)) {
    this.pixelWidth = width * TILE;
    this.pixelHeight = height * TILE;
    this.pixels = new Uint8Array(this.pixelWidth * this.pixelHeight);
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.pixelWidth;
    this.canvas.height = this.pixelHeight;
    this.ctx = this.canvas.getContext("2d")!;
    this.image = this.ctx.createImageData(this.pixelWidth, this.pixelHeight);
  }

  fill(color: number): void {
    this.pixels.fill(color & 0xf);
    this.dirty = true;
  }

  fillRect(color: number, x: number, y: number, w: number, h: number): void {
    for (let yy = Math.max(0, y); yy < Math.min(this.pixelHeight, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.pixelWidth, x + w); xx++) this.pixels[yy * this.pixelWidth + xx] = color & 0xf;
    }
    this.dirty = true;
  }

  setPixel(x: number, y: number, color: number): void {
    if (x < 0 || y < 0 || x >= this.pixelWidth || y >= this.pixelHeight) return;
    this.pixels[y * this.pixelWidth + x] = color;
    this.dirty = true;
  }

  /** BlitBitmapRectToWindow for index data with a source width; index 0 is skipped when `transparent`. */
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
    const w = this.pixelWidth;
    this.pixels.copyWithin(0, dy * w);
    this.pixels.fill(fillColor & 0xf, (this.pixelHeight - dy) * w);
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  private refresh(): void {
    const data = this.image.data;
    for (let i = 0; i < this.pixels.length; i++) {
      const index = this.pixels[i];
      const o = i * 4;
      if (index === 0) { data[o + 3] = 0; continue; }
      const c = this.palette[index] ?? [255, 0, 255];
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
    this.dirty = false;
  }

  /** Pixel offset applied when drawing (BG scroll of the window's layer). */
  offsetX = 0;
  offsetY = 0;

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;
    ctx.save();
    if (this.offsetX || this.offsetY) ctx.translate(this.offsetX, this.offsetY);
    if (this.frame !== "none") this.renderFrame(ctx);
    if (this.dirty) this.refresh();
    ctx.drawImage(this.canvas, this.x * TILE, this.y * TILE);
    ctx.restore();
  }

  private renderFrame(ctx: CanvasRenderingContext2D): void {
    const sheet = frameSheet(this.frame, this.frameType);
    const L = this.x, T = this.y, W = this.width, H = this.height;
    const at = (tile: number, tx: number, ty: number, vflip = false) => sheet.draw(ctx, tile, tx * TILE, ty * TILE, vflip);
    if (this.frame === "std" || this.frame === "stdwin") {
      // WindowFunc_DrawStdFrameWithCustomTileAndPalette
      at(0, L - 1, T - 1);
      for (let x = 0; x < W; x++) at(1, L + x, T - 1);
      at(2, L + W, T - 1);
      for (let y = 0; y < H; y++) { at(3, L - 1, T + y); at(5, L + W, T + y); }
      at(6, L - 1, T + H);
      for (let x = 0; x < W; x++) at(7, L + x, T + H);
      at(8, L + W, T + H);
      return;
    }
    // WindowFunc_DrawDialogueFrame (non-signpost and signpost share the tile layout
    // but the signpost variant swaps rows 2 and 3).
    const signpost = this.frame === "signpost";
    const row = (ty: number, a: number, b: number, mid: number | null, c: number, d: number, vflip = false) => {
      at(a, L - 2, ty, vflip);
      at(b, L - 1, ty, vflip);
      if (mid !== null) for (let x = 0; x < W; x++) at(mid, L + x, ty, vflip);
      at(c, L + W, ty, vflip);
      at(d, L + W + 1, ty, vflip);
    };
    row(T - 1, 0, 1, 2, 3, 4);
    row(T, 5, 6, null, 8, 9);
    row(T + 1, 10, 11, null, 12, 13);
    if (!signpost) {
      row(T + 2, 10, 11, null, 12, 13, true);
      row(T + 3, 5, 6, null, 8, 9, true);
    } else {
      row(T + 2, 5, 6, null, 8, 9, true);
      row(T + 3, 10, 11, null, 12, 13, true);
    }
    row(T + 4, 0, 1, 2, 3, 4, true);
    // Background of the frame's interior rows beside the text area is the
    // window's own fill; nothing else to draw.
  }
}

/** Windows drawn on BG0 in creation order (text windows, menus). */
export class WindowLayer {
  readonly windows: Window[] = [];

  add(window: Window): Window {
    this.windows.push(window);
    return window;
  }

  remove(window: Window | undefined): void {
    if (!window) return;
    const index = this.windows.indexOf(window);
    if (index >= 0) this.windows.splice(index, 1);
  }

  clear(): void {
    this.windows.length = 0;
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const window of this.windows) window.render(ctx);
  }
}
