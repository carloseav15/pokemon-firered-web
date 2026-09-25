// Canvas rendering of raw GBA graphics for field-layer code: 4bpp tiles,
// BG tilemaps and 15-bit palettes, as exported from the decomp INCBINs.
// The field is drawn with Canvas 2D, so VRAM uploads become canvases.

import { incbin, incbin16 } from "../hw/assets";

export function rgb555(color: number): [number, number, number] {
  return [(color & 31) << 3, ((color >> 5) & 31) << 3, ((color >> 10) & 31) << 3];
}

export function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/** Draw one 8×8 4bpp tile into image data (color 0 transparent unless opaque). */
function putTile(img: ImageData, tiles: Uint8Array, tile: number, palette: ArrayLike<number>, palOffset: number, dx: number, dy: number, hflip: boolean, vflip: boolean, opaque: boolean): void {
  const base = tile * 32;
  if (base + 32 > tiles.length) return;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const b = tiles[base + y * 4 + (x >> 1)];
      const index = x & 1 ? b >> 4 : b & 15;
      if (!index && !opaque) continue;
      const px = dx + (hflip ? 7 - x : x);
      const py = dy + (vflip ? 7 - y : y);
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
      const [r, g, bl] = rgb555(palette[palOffset + index] ?? 0);
      const o = (py * img.width + px) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = bl;
      img.data[o + 3] = 255;
    }
  }
}

/** A sprite sheet of `frames` frames, each widthTiles×heightTiles tiles laid out row-major (OBJ 1D mapping). */
export function spriteSheet(tiles: Uint8Array, palette: ArrayLike<number>, width: number, height: number, frames = 1): HTMLCanvasElement {
  const c = canvas(width, height * frames);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(width, height * frames);
  const tw = width >> 3, th = height >> 3;
  for (let f = 0; f < frames; f++) {
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < tw; tx++) putTile(img, tiles, f * tw * th + ty * tw + tx, palette, 0, tx * 8, f * height + ty * 8, false, false, false);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * A BG tilemap rendered to a canvas. Tilemap entries use the GBA text-BG
 * format (tile | hflip<<10 | vflip<<11 | palette<<12); `palettes` is the full
 * 16×16 BG palette RAM slice the palette numbers index.
 */
export function tilemapCanvas(tiles: Uint8Array, tilemap: ArrayLike<number>, palettes: ArrayLike<number>, widthTiles: number, heightTiles: number, opaque = false, strideTiles = widthTiles): HTMLCanvasElement {
  const c = canvas(widthTiles * 8, heightTiles * 8);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(widthTiles * 8, heightTiles * 8);
  for (let ty = 0; ty < heightTiles; ty++) {
    for (let tx = 0; tx < widthTiles; tx++) {
      const e = tilemap[ty * strideTiles + tx] ?? 0;
      putTile(img, tiles, e & 0x3ff, palettes, ((e >> 12) & 15) * 16, tx * 8, ty * 8, !!(e & 0x400), !!(e & 0x800), opaque);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Palette colors of an INCBIN symbol. */
export function palette(symbol: string): Uint16Array {
  return incbin16(symbol);
}

export function tiles(symbol: string): Uint8Array {
  return incbin(symbol);
}
