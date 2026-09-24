// BG tile VRAM for the overworld: composes metatiles from 4bpp tiles and
// palettes, and applies tileset animations (tileset_anims.c) by replacing
// tile data, exactly as the DMA copies do on hardware.

import type { TilesetData } from "../rom";
import { NUM_METATILES_IN_PRIMARY, NUM_TILES_IN_PRIMARY } from "./fieldmap";

export type Rgb = number[];

const TILE_BYTES = 32;

export class TileRenderer {
  readonly tiles = new Uint8Array(1024 * TILE_BYTES);
  palettes: Rgb[][] = [];
  private cache = new Map<number, { bottom: HTMLCanvasElement; top: HTMLCanvasElement }>();
  private tileUsers = new Map<number, Set<number>>();
  private indexedTileUsers = false;
  /** Palette tint (e.g. quest log / weather); null for none. */
  tint: ((c: Rgb) => Rgb) | null = null;

  constructor(readonly primary: TilesetData, readonly secondary: TilesetData) {
    this.tiles.set(primary.tiles.subarray(0, NUM_TILES_IN_PRIMARY * TILE_BYTES), 0);
    this.tiles.set(secondary.tiles.subarray(0, (1024 - NUM_TILES_IN_PRIMARY) * TILE_BYTES), NUM_TILES_IN_PRIMARY * TILE_BYTES);
    this.reloadPalettes();
  }

  /** LoadMapTilesetPalettes: primary palettes 0-6, secondary 7-12. */
  reloadPalettes(): void {
    const palettes: Rgb[][] = [];
    for (let i = 0; i < 7; i++) palettes.push(this.primary.palettes[i].map((c) => [...c]));
    palettes[0][0] = [0, 0, 0];
    for (let i = 7; i < 13; i++) palettes.push(this.secondary.palettes[i].map((c) => [...c]));
    for (let i = 13; i < 16; i++) palettes.push(new Array(16).fill([0, 0, 0]));
    this.palettes = palettes;
    this.cache.clear();
  }

  setPalette(slot: number, colors: Rgb[]): void {
    this.palettes[slot] = colors.map((c) => [...c]);
    this.cache.clear();
  }

  private metatileEntries(id: number): Uint16Array | undefined {
    if (id < NUM_METATILES_IN_PRIMARY) return this.primary.metatiles.subarray(id * 8, id * 8 + 8);
    const local = id - NUM_METATILES_IN_PRIMARY;
    if (local * 8 >= this.secondary.metatiles.length) return undefined;
    return this.secondary.metatiles.subarray(local * 8, local * 8 + 8);
  }

  private buildTileUsers(): void {
    this.indexedTileUsers = true;
    for (let id = 0; id < 1024; id++) {
      const entries = this.metatileEntries(id);
      if (!entries) continue;
      for (const entry of entries) {
        const tile = entry & 0x3ff;
        let set = this.tileUsers.get(tile);
        if (!set) this.tileUsers.set(tile, (set = new Set()));
        set.add(id);
      }
    }
  }

  /** Overwrite tiles starting at `destTile` (AppendTilesetAnimToBuffer). */
  writeTiles(destTile: number, data: Uint8Array, count = data.length / TILE_BYTES): void {
    this.tiles.set(data.subarray(0, count * TILE_BYTES), destTile * TILE_BYTES);
    if (!this.indexedTileUsers) this.buildTileUsers();
    for (let t = destTile; t < destTile + count; t++) {
      const users = this.tileUsers.get(t);
      if (users) for (const id of users) this.cache.delete(id);
    }
  }

  invalidate(): void {
    this.cache.clear();
  }

  private drawTile(img: ImageData, entry: number, ox: number, oy: number): void {
    const tile = entry & 0x3ff;
    const hflip = (entry & 0x400) !== 0;
    const vflip = (entry & 0x800) !== 0;
    const palette = this.palettes[entry >> 12] ?? this.palettes[0];
    const base = tile * TILE_BYTES;
    const data = img.data;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const sx = hflip ? 7 - x : x;
        const sy = vflip ? 7 - y : y;
        const byte = this.tiles[base + sy * 4 + (sx >> 1)];
        const index = sx & 1 ? byte >> 4 : byte & 0xf;
        if (index === 0) continue;
        let c = palette[index];
        if (this.tint) c = this.tint(c);
        const o = ((oy + y) * 16 + ox + x) * 4;
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    }
  }

  private build(id: number): { bottom: HTMLCanvasElement; top: HTMLCanvasElement } {
    const entries = this.metatileEntries(id);
    const make = (offset: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      if (!entries) return canvas;
      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(16, 16);
      this.drawTile(img, entries[offset + 0], 0, 0);
      this.drawTile(img, entries[offset + 1], 8, 0);
      this.drawTile(img, entries[offset + 2], 0, 8);
      this.drawTile(img, entries[offset + 3], 8, 8);
      ctx.putImageData(img, 0, 0);
      return canvas;
    };
    return { bottom: make(0), top: make(4) };
  }

  metatile(id: number): { bottom: HTMLCanvasElement; top: HTMLCanvasElement } {
    let entry = this.cache.get(id);
    if (!entry) {
      entry = this.build(id);
      this.cache.set(id, entry);
    }
    return entry;
  }

  /** Draw raw 4bpp tile data (door animations) using a BG palette. */
  drawRawTiles(ctx: CanvasRenderingContext2D, data: Uint8Array, tileIndex: number, palette: number, x: number, y: number): void {
    const img = ctx.createImageData(8, 8);
    const pal = this.palettes[palette];
    for (let py = 0; py < 8; py++) {
      for (let px = 0; px < 8; px++) {
        const byte = data[tileIndex * TILE_BYTES + py * 4 + (px >> 1)];
        const index = px & 1 ? byte >> 4 : byte & 0xf;
        const o = (py * 8 + px) * 4;
        if (index === 0) continue;
        const c = pal[index];
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    canvas.getContext("2d")!.putImageData(img, 0, 0);
    ctx.drawImage(canvas, x, y);
  }
}

type AnimStep = (timer: number, r: TileRenderer) => void;

function queue(r: TileRenderer, frames: Uint8Array[] | undefined, index: number, dest: number, count: number): void {
  if (!frames || frames.length === 0) return;
  r.writeTiles(dest, frames[index % frames.length], count);
}

/** Port of tileset_anims.c callbacks keyed by the tileset's callback name. */
export class TilesetAnimator {
  private primaryCounter = 0;
  private primaryMax = 0;
  private secondaryCounter = 0;
  private secondaryMax = 0;
  private primaryStep: AnimStep | null = null;
  private secondaryStep: AnimStep | null = null;

  constructor(private readonly renderer: TileRenderer) {
    this.initPrimary();
    this.initSecondary();
  }

  private initPrimary(): void {
    const t = this.renderer.primary;
    if (t.callback === "InitTilesetAnim_General") {
      this.primaryMax = 640;
      this.primaryStep = (timer, r) => {
        if (timer % 8 === 0) queue(r, t.anims.sandwatersedge, Math.floor(timer / 8), 464, 18);
        if (timer % 16 === 1) queue(r, t.anims.water_current_landwatersedge, Math.floor(timer / 16), 416, 48);
        if (timer % 16 === 2) queue(r, t.anims.flower, Math.floor(timer / 16), 508, 4);
      };
    }
  }

  private initSecondary(): void {
    const t = this.renderer.secondary;
    const a = t.anims;
    switch (t.callback) {
      case "InitTilesetAnim_CeladonCity":
        this.secondaryMax = 120;
        this.secondaryStep = (timer, r) => { if (timer % 12 === 0) queue(r, a.fountain, Math.floor(timer / 12), 744, 8); };
        break;
      case "InitTilesetAnim_SilphCo":
        this.secondaryMax = 160;
        this.secondaryStep = (timer, r) => { if (timer % 10 === 0) queue(r, a.fountain, Math.floor(timer / 10), 976, 8); };
        break;
      case "InitTilesetAnim_MtEmber":
        this.secondaryMax = 256;
        this.secondaryStep = (timer, r) => { if (timer % 16 === 0) queue(r, a.steam, Math.floor(timer / 16), 896, 8); };
        break;
      case "InitTilesetAnim_VermilionGym":
        this.secondaryMax = 240;
        this.secondaryStep = (timer, r) => { if (timer % 2 === 0) queue(r, a.motorizeddoor, Math.floor(timer / 2), 880, 7); };
        break;
      case "InitTilesetAnim_CeladonGym": {
        this.secondaryMax = 256;
        // sTilesetAnims_CeladonGym_Flowers: frames 0,1,2,1
        const order = a.flowers ? [a.flowers[0], a.flowers[1], a.flowers[2], a.flowers[1]] : undefined;
        this.secondaryStep = (timer, r) => { if (timer % 16 === 0) queue(r, order, Math.floor(timer / 16), 739, 4); };
        break;
      }
    }
  }

  /** UpdateTilesetAnimations (once per frame) */
  update(): void {
    if (++this.primaryCounter >= this.primaryMax) this.primaryCounter = 0;
    if (++this.secondaryCounter >= this.secondaryMax) this.secondaryCounter = 0;
    this.primaryStep?.(this.primaryCounter, this.renderer);
    this.secondaryStep?.(this.secondaryCounter, this.renderer);
  }

  /** Draw every animation frame 0 immediately so the first view is correct. */
  prime(): void {
    for (let t = 0; t < 32; t++) {
      this.primaryStep?.(t, this.renderer);
      this.secondaryStep?.(t, this.renderer);
    }
    this.primaryCounter = 0;
    this.secondaryCounter = 0;
  }
}
