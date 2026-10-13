// Shared tileset animations used by the overworld renderer and credits BG VRAM.
import type { TilesetData } from "../rom";

const TILE_BYTES = 32;

export type TilesetAnimationTarget = {
  readonly primary: TilesetData;
  readonly secondary: TilesetData;
  writeTiles(destTile: number, data: Uint8Array, count?: number): void;
};

type TilesetAnimCallback = (timer: number) => void;
type TilesetAnimTransfer = { src: Uint8Array; destTile: number; sizeBytes: number };

/** Shared tileset_anims.c counters, callbacks, and transfer queue. */
export class TilesetAnimator {
  private primaryCounter = 0;
  private primaryMax = 0;
  private secondaryCounter = 0;
  private secondaryMax = 0;
  private primaryCallback: TilesetAnimCallback | null = null;
  private secondaryCallback: TilesetAnimCallback | null = null;
  private readonly transferBuffer: TilesetAnimTransfer[] = [];

  constructor(private readonly target: TilesetAnimationTarget) { this.InitTilesetAnimations(); }

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
      this.target.writeTiles(transfer.destTile, transfer.src, Math.floor(transfer.sizeBytes / TILE_BYTES));
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
    if (this.target.primary.callback === "InitTilesetAnim_General") this.InitTilesetAnim_General();
  }

  /** _InitSecondaryTilesetAnimation. */
  _InitSecondaryTilesetAnimation(): void {
    this.secondaryCounter = 0;
    this.secondaryMax = 0;
    this.secondaryCallback = null;
    switch (this.target.secondary.callback) {
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
    const frames = this.target.primary.anims.flower;
    if (frames?.length) this.AppendTilesetAnimToBuffer(frames[timer % frames.length], 508, 4 * TILE_BYTES);
  }

  /** QueueAnimTiles_General_Water_Current_LandWatersEdge. */
  QueueAnimTiles_General_Water_Current_LandWatersEdge(timer: number): void {
    const frames = this.target.primary.anims.water_current_landwatersedge;
    if (frames?.length) this.AppendTilesetAnimToBuffer(frames[timer % frames.length], 416, 48 * TILE_BYTES);
  }

  /** QueueAnimTiles_General_SandWatersEdge. */
  QueueAnimTiles_General_SandWatersEdge(timer: number): void {
    const frames = this.target.primary.anims.sandwatersedge;
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
    const frames = this.target.secondary.anims.fountain;
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
    const frames = this.target.secondary.anims.fountain;
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
    const frames = this.target.secondary.anims.steam;
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
    const frames = this.target.secondary.anims.motorizeddoor;
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
    const frames = this.target.secondary.anims.flowers;
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
