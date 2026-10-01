// BG tile VRAM for the overworld: composes metatiles from 4bpp tiles and
// palettes, and applies tileset animations (tileset_anims.c) by replacing
// tile data, exactly as the DMA copies do on hardware.

import type { TilesetData } from "../rom";
import { NUM_METATILES_IN_PRIMARY, NUM_TILES_IN_PRIMARY } from "./fieldmap";
import { NUM_PALS_IN_PRIMARY, NUM_PALS_TOTAL, NUM_TILES_TOTAL } from "../generated/constants";
import { GET_B, GET_G, GET_R, LoadPalette, gPlttBufferFaded } from "../hw/palette";
import { ApplyGlobalTintToPaletteEntries } from "./fieldPalette";

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
    this.CopyMapTilesetsToVram();
    this.LoadMapTilesetPalettes();
  }

  /** CopyTilesetToVram / CopyTilesetToVramUsingHeap. ROM tiles are already decompressed. */
  CopyTilesetToVram(tileset: TilesetData | null, numTiles: number, offset: number): void {
    if (tileset) this.tiles.set(tileset.tiles.subarray(0, (numTiles & 0xffff) * TILE_BYTES), (offset & 0xffff) * TILE_BYTES);
  }

  CopyTilesetToVramUsingHeap(tileset: TilesetData | null, numTiles: number, offset: number): void {
    this.CopyTilesetToVram(tileset, numTiles, offset);
  }

  CopyPrimaryTilesetToVram(): void { this.CopyTilesetToVram(this.primary, NUM_TILES_IN_PRIMARY, 0); }
  CopySecondaryTilesetToVram(): void { this.CopyTilesetToVram(this.secondary, NUM_TILES_TOTAL - NUM_TILES_IN_PRIMARY, NUM_TILES_IN_PRIMARY); }
  CopySecondaryTilesetToVramUsingHeap(): void { this.CopyTilesetToVramUsingHeap(this.secondary, NUM_TILES_TOTAL - NUM_TILES_IN_PRIMARY, NUM_TILES_IN_PRIMARY); }

  CopyMapTilesetsToVram(): void {
    this.CopyTilesetToVramUsingHeap(this.primary, NUM_TILES_IN_PRIMARY, 0);
    this.CopySecondaryTilesetToVramUsingHeap();
  }

  /** LoadTilesetPalette; offsets and sizes retain the C API's color/byte units. */
  LoadTilesetPalette(tileset: TilesetData | null, destOffset: number, size: number): void {
    if (!tileset) return;
    const paletteStart = tileset.isSecondary ? NUM_PALS_IN_PRIMARY : 0;
    const paletteCount = tileset.isSecondary ? NUM_PALS_TOTAL - NUM_PALS_IN_PRIMARY : NUM_PALS_IN_PRIMARY;
    const source = tileset.palettes.slice(paletteStart, paletteStart + paletteCount).flat();
    const srcStart = tileset.isSecondary ? 0 : 1;
    const count = tileset.isSecondary ? size >> 1 : Math.max(0, (size - 2) >> 1);
    const packed = new Uint16Array(count);
    for (let i = 0; i < count; i++) {
      const [r, g, b] = source[srcStart + i] ?? [0, 0, 0];
      packed[i] = (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10);
    }
    if (!tileset.isSecondary) LoadPalette([0], destOffset, 2);
    LoadPalette(packed, destOffset + (tileset.isSecondary ? 0 : 1), size - (tileset.isSecondary ? 0 : 2));
    const tintOffset = destOffset + (tileset.isSecondary ? 0 : 1);
    ApplyGlobalTintToPaletteEntries(tintOffset, tileset.isSecondary ? size >> 1 : (size - 2) >> 1);
  }

  LoadPrimaryTilesetPalette(): void { this.LoadTilesetPalette(this.primary, 0, NUM_PALS_IN_PRIMARY * 32); }
  LoadSecondaryTilesetPalette(): void { this.LoadTilesetPalette(this.secondary, NUM_PALS_IN_PRIMARY * 16, (NUM_PALS_TOTAL - NUM_PALS_IN_PRIMARY) * 32); }

  /** LoadMapTilesetPalettes: load and tint both source palette ranges. */
  LoadMapTilesetPalettes(): void {
    this.LoadPrimaryTilesetPalette();
    this.LoadSecondaryTilesetPalette();
    this.reloadPalettes();
  }

  /** Rebuild renderer RGB palettes from the GBA-format faded palette buffer. */
  reloadPalettes(): void {
    const palettes: Rgb[][] = [];
    for (let i = 0; i < NUM_PALS_TOTAL; i++) {
      const colors: Rgb[] = [];
      for (let j = 0; j < 16; j++) {
        const color = gPlttBufferFaded[i * 16 + j];
        colors.push([GET_R(color) << 3, GET_G(color) << 3, GET_B(color) << 3]);
      }
      palettes.push(colors);
    }
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

type TilesetAnimCallback = (timer: number) => void;
type TilesetAnimTransfer = { src: Uint8Array; destTile: number; sizeBytes: number };

/** tileset_anims.c DMA transfer queue and callbacks, adapted to field tile buffers. */
export class TilesetAnimator {
  private primaryCounter = 0;
  private primaryMax = 0;
  private secondaryCounter = 0;
  private secondaryMax = 0;
  private primaryCallback: TilesetAnimCallback | null = null;
  private secondaryCallback: TilesetAnimCallback | null = null;
  private readonly transferBuffer: TilesetAnimTransfer[] = [];

  constructor(private readonly renderer: TileRenderer) { this.InitTilesetAnimations(); }

  /** ResetTilesetAnimBuffer. */
  ResetTilesetAnimBuffer(): void { this.transferBuffer.length = 0; }

  /** AppendTilesetAnimToBuffer (20 entries maximum). */
  AppendTilesetAnimToBuffer(src: Uint8Array | undefined, destTile: number, sizeBytes: number): void {
    if (!src || this.transferBuffer.length >= 20) return;
    this.transferBuffer.push({ src, destTile, sizeBytes });
  }

  /** TransferTilesetAnimsBuffer; synchronous copy is the browser's VBlank transfer. */
  TransferTilesetAnimsBuffer(): void {
    for (const transfer of this.transferBuffer)
      this.renderer.writeTiles(transfer.destTile, transfer.src, Math.floor(transfer.sizeBytes / TILE_BYTES));
    this.transferBuffer.length = 0;
  }

  /** InitTilesetAnimations. */
  InitTilesetAnimations(): void {
    this.ResetTilesetAnimBuffer();
    this._InitPrimaryTilesetAnimation();
    this._InitSecondaryTilesetAnimation();
  }

  /** InitSecondaryTilesetAnimation. */
  InitSecondaryTilesetAnimation(): void { this._InitSecondaryTilesetAnimation(); }

  /** _InitPrimaryTilesetAnimation. */
  _InitPrimaryTilesetAnimation(): void {
    this.primaryCounter = 0;
    this.primaryMax = 0;
    this.primaryCallback = null;
    if (this.renderer.primary.callback === "InitTilesetAnim_General") this.InitTilesetAnim_General();
  }

  /** _InitSecondaryTilesetAnimation. */
  _InitSecondaryTilesetAnimation(): void {
    this.secondaryCounter = 0;
    this.secondaryMax = 0;
    this.secondaryCallback = null;
    switch (this.renderer.secondary.callback) {
      case "InitTilesetAnim_CeladonCity": this.InitTilesetAnim_CeladonCity(); break;
      case "InitTilesetAnim_SilphCo": this.InitTilesetAnim_SilphCo(); break;
      case "InitTilesetAnim_MtEmber": this.InitTilesetAnim_MtEmber(); break;
      case "InitTilesetAnim_VermilionGym": this.InitTilesetAnim_VermilionGym(); break;
      case "InitTilesetAnim_CeladonGym": this.InitTilesetAnim_CeladonGym(); break;
    }
  }

  /** UpdateTilesetAnimations, followed by the Canvas VBlank transfer. */
  UpdateTilesetAnimations(): void {
    this.ResetTilesetAnimBuffer();
    if (++this.primaryCounter >= this.primaryMax) this.primaryCounter = 0;
    if (++this.secondaryCounter >= this.secondaryMax) this.secondaryCounter = 0;
    this.primaryCallback?.(this.primaryCounter);
    this.secondaryCallback?.(this.secondaryCounter);
    this.TransferTilesetAnimsBuffer();
  }

  update(): void { this.UpdateTilesetAnimations(); }

  /** QueueAnimTiles_General_Flower. */
  QueueAnimTiles_General_Flower(timer: number): void {
    const frames = this.renderer.primary.anims.flower;
    if (frames?.length) this.AppendTilesetAnimToBuffer(frames[timer % frames.length], 508, 4 * TILE_BYTES);
  }

  /** QueueAnimTiles_General_Water_Current_LandWatersEdge. */
  QueueAnimTiles_General_Water_Current_LandWatersEdge(timer: number): void {
    const frames = this.renderer.primary.anims.water_current_landwatersedge;
    if (frames?.length) this.AppendTilesetAnimToBuffer(frames[timer % frames.length], 416, 48 * TILE_BYTES);
  }

  /** QueueAnimTiles_General_SandWatersEdge. */
  QueueAnimTiles_General_SandWatersEdge(timer: number): void {
    const frames = this.renderer.primary.anims.sandwatersedge;
    if (frames?.length) this.AppendTilesetAnimToBuffer(frames[timer % frames.length], 464, 18 * TILE_BYTES);
  }

  /** TilesetAnim_General. */
  TilesetAnim_General(timer: number): void {
    if (timer % 8 === 0) this.QueueAnimTiles_General_SandWatersEdge(Math.trunc(timer / 8));
    if (timer % 16 === 1) this.QueueAnimTiles_General_Water_Current_LandWatersEdge(Math.trunc(timer / 16));
    if (timer % 16 === 2) this.QueueAnimTiles_General_Flower(Math.trunc(timer / 16));
  }

  /** InitTilesetAnim_General. */
  InitTilesetAnim_General(): void {
    this.primaryCounter = 0;
    this.primaryMax = 640;
    this.primaryCallback = (timer) => this.TilesetAnim_General(timer);
  }

  /** QueueAnimTiles_CeladonCity_Fountain. */
  QueueAnimTiles_CeladonCity_Fountain(timer: number): void {
    const frames = this.renderer.secondary.anims.fountain;
    if (frames?.length) this.AppendTilesetAnimToBuffer(frames[timer % frames.length], 744, 8 * TILE_BYTES);
  }

  /** TilesetAnim_CeladonCity. */
  TilesetAnim_CeladonCity(timer: number): void {
    if (timer % 12 === 0) this.QueueAnimTiles_CeladonCity_Fountain(Math.trunc(timer / 12));
  }

  /** InitTilesetAnim_CeladonCity. */
  InitTilesetAnim_CeladonCity(): void {
    this.secondaryCounter = 0; this.secondaryMax = 120;
    this.secondaryCallback = (timer) => this.TilesetAnim_CeladonCity(timer);
  }

  /** QueueAnimTiles_SilphCo_Fountain. */
  QueueAnimTiles_SilphCo_Fountain(timer: number): void {
    const frames = this.renderer.secondary.anims.fountain;
    if (frames?.length) this.AppendTilesetAnimToBuffer(frames[timer % frames.length], 976, 8 * TILE_BYTES);
  }

  /** TilesetAnim_SilphCo. */
  TilesetAnim_SilphCo(timer: number): void {
    if (timer % 10 === 0) this.QueueAnimTiles_SilphCo_Fountain(Math.trunc(timer / 10));
  }

  /** InitTilesetAnim_SilphCo. */
  InitTilesetAnim_SilphCo(): void {
    this.secondaryCounter = 0; this.secondaryMax = 160;
    this.secondaryCallback = (timer) => this.TilesetAnim_SilphCo(timer);
  }

  /** QueueAnimTiles_MtEmber_Steam. */
  QueueAnimTiles_MtEmber_Steam(timer: number): void {
    const frames = this.renderer.secondary.anims.steam;
    if (frames?.length) this.AppendTilesetAnimToBuffer(frames[timer % frames.length], 896, 8 * TILE_BYTES);
  }

  /** TilesetAnim_MtEmber. */
  TilesetAnim_MtEmber(timer: number): void {
    if (timer % 16 === 0) this.QueueAnimTiles_MtEmber_Steam(Math.trunc(timer / 16));
  }

  /** InitTilesetAnim_MtEmber. */
  InitTilesetAnim_MtEmber(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => this.TilesetAnim_MtEmber(timer);
  }

  /** QueueAnimTiles_VermilionGym_MotorizedDoor. */
  QueueAnimTiles_VermilionGym_MotorizedDoor(timer: number): void {
    const frames = this.renderer.secondary.anims.motorizeddoor;
    if (frames?.length) this.AppendTilesetAnimToBuffer(frames[timer % frames.length], 880, 7 * TILE_BYTES);
  }

  /** TilesetAnim_VermilionGym. */
  TilesetAnim_VermilionGym(timer: number): void {
    if (timer % 2 === 0) this.QueueAnimTiles_VermilionGym_MotorizedDoor(Math.trunc(timer / 2));
  }

  /** InitTilesetAnim_VermilionGym. */
  InitTilesetAnim_VermilionGym(): void {
    this.secondaryCounter = 0; this.secondaryMax = 240;
    this.secondaryCallback = (timer) => this.TilesetAnim_VermilionGym(timer);
  }

  /** QueueAnimTiles_CeladonGym_Flowers. */
  QueueAnimTiles_CeladonGym_Flowers(timer: number): void {
    const frames = this.renderer.secondary.anims.flowers;
    if (frames?.length) this.AppendTilesetAnimToBuffer(frames[timer % frames.length], 739, 4 * TILE_BYTES);
  }

  /** TilesetAnim_CeladonGym. */
  TilesetAnim_CeladonGym(timer: number): void {
    if (timer % 16 === 0) this.QueueAnimTiles_CeladonGym_Flowers(Math.trunc(timer / 16));
  }

  /** InitTilesetAnim_CeladonGym. */
  InitTilesetAnim_CeladonGym(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => this.TilesetAnim_CeladonGym(timer);
  }
}
