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
    if (this.target.primary.callback === "InitTilesetAnim_General") {
      if (this.target.primary.anims.water) this.InitTilesetAnim_General_Emerald();
      else this.InitTilesetAnim_General();
    } else if (this.target.primary.callback === "InitTilesetAnim_Building") {
      this.InitTilesetAnim_Building();
    }
  }

  /** _InitSecondaryTilesetAnimation. */
  _InitSecondaryTilesetAnimation(): void {
    this.secondaryCounter = 0;
    this.secondaryMax = 0;
    this.secondaryCallback = null;
    switch (this.target.secondary.callback) {
      // FireRed
      case "InitTilesetAnim_CeladonCity": this.InitTilesetAnim_CeladonCity(); break;
      case "InitTilesetAnim_SilphCo": this.InitTilesetAnim_SilphCo(); break;
      case "InitTilesetAnim_MtEmber": this.InitTilesetAnim_MtEmber(); break;
      case "InitTilesetAnim_VermilionGym": this.InitTilesetAnim_VermilionGym(); break;
      case "InitTilesetAnim_CeladonGym": this.InitTilesetAnim_CeladonGym(); break;

      // Emerald
      case "InitTilesetAnim_Rustboro": this.InitTilesetAnim_Rustboro(); break;
      case "InitTilesetAnim_Dewford": this.InitTilesetAnim_Dewford(); break;
      case "InitTilesetAnim_Slateport": this.InitTilesetAnim_Slateport(); break;
      case "InitTilesetAnim_Mauville": this.InitTilesetAnim_Mauville(); break;
      case "InitTilesetAnim_Lavaridge": this.InitTilesetAnim_Lavaridge(); break;
      case "InitTilesetAnim_EverGrande": this.InitTilesetAnim_EverGrande(); break;
      case "InitTilesetAnim_Pacifidlog": this.InitTilesetAnim_Pacifidlog(); break;
      case "InitTilesetAnim_Sootopolis": this.InitTilesetAnim_Sootopolis(); break;
      case "InitTilesetAnim_Underwater": this.InitTilesetAnim_Underwater(); break;
      case "InitTilesetAnim_Cave": this.InitTilesetAnim_Cave(); break;
      case "InitTilesetAnim_BattleFrontierOutsideWest": this.InitTilesetAnim_BattleFrontierOutsideWest(); break;
      case "InitTilesetAnim_BattleFrontierOutsideEast": this.InitTilesetAnim_BattleFrontierOutsideEast(); break;
      case "InitTilesetAnim_SootopolisGym": this.InitTilesetAnim_SootopolisGym(); break;
      case "InitTilesetAnim_EliteFour": this.InitTilesetAnim_EliteFour(); break;
      case "InitTilesetAnim_MauvilleGym": this.InitTilesetAnim_MauvilleGym(); break;
      case "InitTilesetAnim_BikeShop": this.InitTilesetAnim_BikeShop(); break;
      case "InitTilesetAnim_BattlePyramid": this.InitTilesetAnim_BattlePyramid(); break;
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

  /** Emerald General & Building Animations */
  InitTilesetAnim_General_Emerald(): void {
    this.primaryCounter = 0;
    this.primaryMax = 256;
    this.primaryCallback = (timer) => {
      if (timer % 16 === 0) this.QueueAnimTiles_General_Flower(Math.trunc(timer / 16));
      if (timer % 16 === 1) {
        const frames = this.target.primary.anims.water;
        if (frames?.length) this.AppendTilesetAnimToBuffer(frames[Math.trunc(timer / 16) % frames.length], 432, 30 * TILE_BYTES);
      }
      if (timer % 16 === 2) {
        const frames = this.target.primary.anims.sand_water_edge;
        if (frames?.length) this.AppendTilesetAnimToBuffer(frames[Math.trunc(timer / 16) % frames.length], 464, 10 * TILE_BYTES);
      }
      if (timer % 16 === 3) {
        const frames = this.target.primary.anims.waterfall;
        if (frames?.length) this.AppendTilesetAnimToBuffer(frames[Math.trunc(timer / 16) % frames.length], 496, 6 * TILE_BYTES);
      }
      if (timer % 16 === 4) {
        const frames = this.target.primary.anims.land_water_edge;
        if (frames?.length) this.AppendTilesetAnimToBuffer(frames[Math.trunc(timer / 16) % frames.length], 480, 10 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_Building(): void {
    this.primaryCounter = 0;
    this.primaryMax = 256;
    this.primaryCallback = (timer) => {
      if (timer % 8 === 0) {
        const frames = this.target.primary.anims.tv_turned_on;
        if (frames?.length) this.AppendTilesetAnimToBuffer(frames[Math.trunc(timer / 8) % frames.length], 496, 4 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_Rustboro(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      const mod = timer % 8;
      const div = Math.trunc(timer / 8);
      const windy = this.target.secondary.anims.windy_water;
      if (windy?.length) {
        const f = ((div - mod) % windy.length + windy.length) % windy.length;
        this.AppendTilesetAnimToBuffer(windy[f], 512 + 128 + mod * 4, 4 * TILE_BYTES);
      }
      if (mod === 0) {
        const fountain = this.target.secondary.anims.fountain;
        if (fountain?.length) this.AppendTilesetAnimToBuffer(fountain[div % fountain.length], 512 + 448, 4 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_Dewford(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      if (timer % 8 === 0) {
        const frames = this.target.secondary.anims.flag;
        if (frames?.length) this.AppendTilesetAnimToBuffer(frames[Math.trunc(timer / 8) % frames.length], 512 + 170, 6 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_Slateport(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      if (timer % 16 === 0) {
        const frames = this.target.secondary.anims.balloons;
        if (frames?.length) this.AppendTilesetAnimToBuffer(frames[Math.trunc(timer / 16) % frames.length], 512 + 224, 4 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_Mauville(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      const mod = timer % 8;
      const div = Math.trunc(timer / 8);
      const f1 = this.target.secondary.anims.flower_1;
      const f2 = this.target.secondary.anims.flower_2;
      if (f1?.length) this.AppendTilesetAnimToBuffer(f1[div % f1.length], 512 + 96 + mod * 4, 4 * TILE_BYTES);
      if (f2?.length) this.AppendTilesetAnimToBuffer(f2[div % f2.length], 512 + 128 + mod * 4, 4 * TILE_BYTES);
    };
  }

  InitTilesetAnim_Lavaridge(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      if (timer % 16 === 0) {
        const steam = this.target.secondary.anims.steam;
        if (steam?.length) {
          const frame = steam[Math.trunc(timer / 16) % steam.length];
          this.AppendTilesetAnimToBuffer(frame, 512 + 288, 4 * TILE_BYTES);
          this.AppendTilesetAnimToBuffer(frame, 512 + 292, 4 * TILE_BYTES);
        }
      }
      if (timer % 16 === 1) {
        const lava = this.target.secondary.anims.lava;
        if (lava?.length) this.AppendTilesetAnimToBuffer(lava[Math.trunc(timer / 16) % lava.length], 512 + 160, 4 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_EverGrande(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      const mod = timer % 8;
      const div = Math.trunc(timer / 8);
      const flowers = this.target.secondary.anims.flowers;
      if (flowers?.length) this.AppendTilesetAnimToBuffer(flowers[div % flowers.length], 512 + 224 + mod * 4, 4 * TILE_BYTES);
    };
  }

  InitTilesetAnim_Pacifidlog(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      if (timer % 16 === 0) {
        const logBridges = this.target.secondary.anims.log_bridges;
        if (logBridges?.length) this.AppendTilesetAnimToBuffer(logBridges[Math.trunc(timer / 16) % logBridges.length], 512 + 464, 30 * TILE_BYTES);
      }
      if (timer % 16 === 1) {
        const currents = this.target.secondary.anims.water_currents;
        if (currents?.length) this.AppendTilesetAnimToBuffer(currents[Math.trunc(timer / 16) % currents.length], 512 + 496, 8 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_Sootopolis(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      if (timer % 16 === 0) {
        const stormy = this.target.secondary.anims.stormy_water;
        if (stormy?.length) this.AppendTilesetAnimToBuffer(stormy[Math.trunc(timer / 16) % stormy.length], 512 + 240, 96 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_Underwater(): void {
    this.secondaryCounter = 0; this.secondaryMax = 128;
    this.secondaryCallback = (timer) => {
      if (timer % 16 === 0) {
        const seaweed = this.target.secondary.anims.seaweed;
        if (seaweed?.length) this.AppendTilesetAnimToBuffer(seaweed[Math.trunc(timer / 16) % seaweed.length], 512 + 496, 4 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_Cave(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      if (timer % 16 === 0) {
        const lava = this.target.secondary.anims.lava;
        if (lava?.length) this.AppendTilesetAnimToBuffer(lava[Math.trunc(timer / 16) % lava.length], 512 + 416, 4 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_BattleFrontierOutsideWest(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      if (timer % 8 === 0) {
        const flag = this.target.secondary.anims.flag;
        if (flag?.length) this.AppendTilesetAnimToBuffer(flag[Math.trunc(timer / 8) % flag.length], 512 + 218, 6 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_BattleFrontierOutsideEast(): void {
    this.InitTilesetAnim_BattleFrontierOutsideWest();
  }

  InitTilesetAnim_SootopolisGym(): void {
    this.secondaryCounter = 0; this.secondaryMax = 240;
    this.secondaryCallback = (timer) => {
      if (timer % 8 === 0) {
        const step = Math.trunc(timer / 8);
        const front = this.target.secondary.anims.front_waterfall;
        const side = this.target.secondary.anims.side_waterfall;
        if (front?.length) this.AppendTilesetAnimToBuffer(front[step % front.length], 512 + 464, 20 * TILE_BYTES);
        if (side?.length) this.AppendTilesetAnimToBuffer(side[step % side.length], 512 + 496, 12 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_EliteFour(): void {
    this.secondaryCounter = 0; this.secondaryMax = 128;
    this.secondaryCallback = (timer) => {
      if (timer % 8 === 0) {
        const step = Math.trunc(timer / 8);
        const floor = this.target.secondary.anims.floor_light;
        const wall = this.target.secondary.anims.wall_lights;
        if (floor?.length) this.AppendTilesetAnimToBuffer(floor[step % floor.length], 512 + 480, 4 * TILE_BYTES);
        if (wall?.length) this.AppendTilesetAnimToBuffer(wall[step % wall.length], 512 + 504, 1 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_MauvilleGym(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      if (timer % 4 === 0) {
        const gates = this.target.secondary.anims.electric_gates;
        if (gates?.length) this.AppendTilesetAnimToBuffer(gates[Math.trunc(timer / 4) % gates.length], 512 + 144, 16 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_BikeShop(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      if (timer % 4 === 0) {
        const lights = this.target.secondary.anims.blinking_lights;
        if (lights?.length) this.AppendTilesetAnimToBuffer(lights[Math.trunc(timer / 4) % lights.length], 512 + 496, 9 * TILE_BYTES);
      }
    };
  }

  InitTilesetAnim_BattlePyramid(): void {
    this.secondaryCounter = 0; this.secondaryMax = 256;
    this.secondaryCallback = (timer) => {
      if (timer % 8 === 0) {
        const step = Math.trunc(timer / 8);
        const torch = this.target.secondary.anims.torch;
        const shadow = this.target.secondary.anims.statue_shadow;
        if (torch?.length) this.AppendTilesetAnimToBuffer(torch[step % torch.length], 512 + 151, 8 * TILE_BYTES);
        if (shadow?.length) this.AppendTilesetAnimToBuffer(shadow[step % shadow.length], 512 + 135, 8 * TILE_BYTES);
      }
    };
  }
}
