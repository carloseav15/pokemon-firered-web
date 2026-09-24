// Port of field_door.c: door open/close animations drawn over metatiles.

import { sound } from "../audio/sound";
import * as MB from "../generated/metatileBehavior";
import { b64, rom } from "../rom";
import type { Overworld } from "./overworld";

const SLIDING = 1;
const SIZE_1x2 = 1;
const CLOSED = -1;

// sDoorGraphics: [metatile label, sound, size, file, palettes]
const DOORS: Array<[string, number, number, string, number[]]> = [
  ["METATILE_General_Door", 0, 0, "general", [2, 2, 2, 2, 2, 2, 2, 2]],
  ["METATILE_General_SlidingSingleDoor", 1, 0, "sliding_single", [3, 3, 3, 3, 3, 3, 3, 3]],
  ["METATILE_General_SlidingDoubleDoor", 1, 0, "sliding_double", [3, 3, 3, 3, 3, 3, 3, 3]],
  ["METATILE_PalletTown_Door", 0, 0, "pallet", [8, 8, 8, 8, 8, 8, 8, 8]],
  ["METATILE_PalletTown_OaksLabDoor", 0, 0, "oaks_lab", [10, 10, 10, 10, 10, 10, 10, 10]],
  ["METATILE_ViridianCity_Door", 0, 0, "viridian", [8, 8, 8, 8, 8, 8, 8, 8]],
  ["METATILE_PewterCity_Door", 0, 0, "pewter", [8, 8, 8, 8, 8, 8, 8, 8]],
  ["METATILE_SaffronCity_Door", 0, 0, "saffron", [8, 8, 8, 8, 8, 8, 8, 8]],
  ["METATILE_SaffronCity_SilphCoDoor", 1, 0, "silph_co", [3, 3, 3, 3, 3, 3, 3, 3]],
  ["METATILE_CeruleanCity_Door", 0, 0, "cerulean", [12, 12, 12, 12, 12, 12, 12, 12]],
  ["METATILE_LavenderTown_Door", 0, 0, "lavender", [9, 9, 9, 9, 9, 9, 9, 9]],
  ["METATILE_VermilionCity_Door", 0, 0, "vermilion", [9, 9, 9, 9, 9, 9, 9, 9]],
  ["METATILE_VermilionCity_SSAnneWarp", 0, 0, "pokemon_fan_club", [9, 9, 9, 9, 9, 9, 9, 9]],
  ["METATILE_CeladonCity_DeptStoreDoor", 1, 0, "dept_store", [3, 3, 3, 3, 3, 3, 3, 3]],
  ["METATILE_FuchsiaCity_Door", 0, 0, "fuchsia", [8, 8, 8, 8, 8, 8, 8, 8]],
  ["METATILE_FuchsiaCity_SafariZoneDoor", 1, 0, "safari_zone", [9, 9, 9, 9, 9, 9, 9, 9]],
  ["METATILE_CinnabarIsland_LabDoor", 0, 0, "cinnabar_lab", [3, 3, 3, 3, 3, 3, 3, 3]],
  ["METATILE_SeviiIslands123_Door", 0, 0, "sevii_123", [5, 5, 5, 5, 5, 5, 5, 5]],
  ["METATILE_SeviiIslands123_GameCornerDoor", 1, 0, "joyful_game_corner", [3, 3, 3, 3, 3, 3, 3, 3]],
  ["METATILE_SeviiIslands123_PokeCenterDoor", 0, 0, "one_island_poke_center", [3, 3, 3, 3, 3, 3, 3, 3]],
  ["METATILE_SeviiIslands45_Door", 0, 0, "sevii_45", [5, 5, 5, 5, 5, 5, 5, 5]],
  ["METATILE_SeviiIslands45_DayCareDoor", 0, 0, "four_island_day_care", [3, 3, 3, 3, 3, 3, 3, 3]],
  ["METATILE_SeviiIslands45_RocketWarehouseDoor_Unlocked", 0, 0, "rocket_warehouse", [10, 10, 10, 10, 10, 10, 10, 10]],
  ["METATILE_SeviiIslands67_Door", 0, 0, "sevii_67", [5, 5, 5, 5, 5, 5, 5, 5]],
  ["METATILE_DepartmentStore_ElevatorDoor", 1, 1, "dept_store_elevator", [8, 8, 8, 8, 8, 8, 8, 8]],
  ["METATILE_PokemonCenter_CableClubDoor", 1, 1, "cable_club", [8, 8, 8, 8, 8, 8, 8, 8]],
  ["METATILE_SilphCo_HideoutElevatorDoor", 1, 1, "hideout_elevator", [12, 12, 2, 2, 2, 2, 2, 2]],
  ["METATILE_SSAnne_Door", 0, 1, "ss_anne", [7, 7, 7, 7, 7, 7, 7, 7]],
  ["METATILE_SilphCo_ElevatorDoor", 1, 1, "silph_co_elevator", [8, 8, 2, 2, 2, 2, 2, 2]],
  ["METATILE_SeaCottage_Teleporter_Door", 1, 1, "teleporter", [8, 8, 8, 8, 8, 8, 8, 8]],
  ["METATILE_TrainerTower_LobbyElevatorDoor", 1, 1, "trainer_tower_lobby_elevator", [8, 8, 2, 2, 2, 2, 2, 2]],
  ["METATILE_TrainerTower_RoofElevatorDoor", 1, 1, "trainer_tower_roof_elevator", [11, 11, 2, 2, 2, 2, 2, 2]],
];

const OPEN_SMALL = [CLOSED, 0, 4, 8];
const CLOSE_SMALL = [8, 4, 0, CLOSED];
const OPEN_LARGE = [CLOSED, 0, 8, 16];
const CLOSE_LARGE = [16, 8, 0, CLOSED];
const FRAME_DURATION = 4;

type DoorGfx = { metatile: number; sound: number; size: number; file: string; palettes: number[] };

export class DoorAnimator {
  private gfx: DoorGfx[] | undefined;
  private tileData = new Map<string, Uint8Array>();
  private anim?: { door: DoorGfx; frames: number[]; x: number; y: number; frameId: number; counter: number };
  /** Door frame currently drawn at a map position (tile offset or CLOSED). */
  private drawn = new Map<string, { door: DoorGfx; offset: number }>();

  constructor(private readonly ow: Overworld) {}

  private table(): DoorGfx[] {
    if (!this.gfx) {
      this.gfx = DOORS.filter(([label]) => label in rom.constants).map(([label, snd, size, file, palettes]) => ({ metatile: rom.c(label), sound: snd, size, file, palettes }));
    }
    return this.gfx;
  }

  private doorAt(x: number, y: number): DoorGfx | undefined {
    const id = this.ow.map.metatileIdAt(x, y);
    return this.table().find((d) => d.metatile === id);
  }

  reset(): void {
    this.anim = undefined;
    this.drawn.clear();
  }

  soundEffect(x: number, y: number): number {
    const door = this.doorAt(x, y);
    return sound.c(door?.sound === SLIDING ? "SE_SLIDING_DOOR" : "SE_DOOR");
  }

  private start(x: number, y: number, open: boolean): boolean {
    if (this.anim) return false;
    const door = this.doorAt(x, y);
    if (!door) return false;
    const frames = door.size === SIZE_1x2 ? (open ? OPEN_LARGE : CLOSE_LARGE) : (open ? OPEN_SMALL : CLOSE_SMALL);
    this.anim = { door, frames, x, y, frameId: 0, counter: 0 };
    return true;
  }

  animateOpen(x: number, y: number): boolean {
    return this.start(x, y, true);
  }

  animateClose(x: number, y: number): boolean {
    return this.start(x, y, false);
  }

  setOpened(x: number, y: number): void {
    if (!MB.MetatileBehavior_IsWarpDoor_2(this.ow.map.behaviorAt(x, y))) return;
    const door = this.doorAt(x, y);
    if (!door) return;
    const frames = door.size === SIZE_1x2 ? OPEN_LARGE : OPEN_SMALL;
    this.draw(door, frames[frames.length - 1], x, y);
  }

  setClosed(x: number, y: number): void {
    if (!MB.MetatileBehavior_IsWarpDoor_2(this.ow.map.behaviorAt(x, y))) return;
    const door = this.doorAt(x, y);
    if (door) this.draw(door, CLOSED, x, y);
  }

  isRunning(): boolean {
    return this.anim !== undefined;
  }

  private draw(door: DoorGfx, offset: number, x: number, y: number): void {
    const keys = door.size === SIZE_1x2 ? [`${x},${y - 1}`, `${x},${y}`] : [`${x},${y}`];
    if (offset === CLOSED) {
      for (const key of keys) this.drawn.delete(key);
      return;
    }
    if (door.size === SIZE_1x2) {
      this.drawn.set(`${x},${y - 1}`, { door, offset });
      this.drawn.set(`${x},${y}`, { door, offset: offset + 4 });
    } else {
      this.drawn.set(`${x},${y}`, { door, offset });
    }
  }

  /** Task_AnimateDoor */
  update(): void {
    const a = this.anim;
    if (!a) return;
    if (a.counter === 0) this.draw(a.door, a.frames[a.frameId], a.x, a.y);
    if (a.counter === FRAME_DURATION) {
      a.counter = 0;
      a.frameId++;
      if (a.frameId >= a.frames.length) this.anim = undefined;
      return;
    }
    a.counter++;
  }

  private tiles(file: string): Uint8Array {
    let data = this.tileData.get(file);
    if (!data) {
      const raw = rom.doors[file];
      const pixels = b64(raw.pixels);
      // Convert the 16px-wide indexed image into 4bpp tiles in row-major tile order.
      const tilesAcross = raw.width / 8;
      const tilesDown = raw.height / 8;
      data = new Uint8Array(tilesAcross * tilesDown * 32);
      let o = 0;
      for (let ty = 0; ty < tilesDown; ty++) {
        for (let tx = 0; tx < tilesAcross; tx++) {
          for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x += 2) {
              const lo = pixels[(ty * 8 + y) * raw.width + tx * 8 + x] & 0xf;
              const hi = pixels[(ty * 8 + y) * raw.width + tx * 8 + x + 1] & 0xf;
              data[o++] = lo | (hi << 4);
            }
          }
        }
      }
      this.tileData.set(file, data);
    }
    return data;
  }

  /** Draw open/closing door frames on BG2 after the map layer. */
  render(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const renderer = this.ow.renderer;
    if (!renderer || this.drawn.size === 0) return;
    for (const [key, { door, offset }] of this.drawn) {
      const [x, y] = key.split(",").map(Number);
      const sx = x * 16 - camX;
      const sy = y * 16 - camY;
      if (sx < -16 || sy < -16 || sx > 240 || sy > 160) continue;
      const data = this.tiles(door.file);
      const base = offset;
      const paletteOffset = door.size === SIZE_1x2 && offset % 8 === 4 ? 4 : 0;
      // Cover the closed door tiles first with the frame (tile 0 of each slot is opaque in the art).
      renderer.drawRawTiles(ctx, data, base + 0, door.palettes[paletteOffset + 0], sx, sy);
      renderer.drawRawTiles(ctx, data, base + 1, door.palettes[paletteOffset + 1], sx + 8, sy);
      renderer.drawRawTiles(ctx, data, base + 2, door.palettes[paletteOffset + 2], sx, sy + 8);
      renderer.drawRawTiles(ctx, data, base + 3, door.palettes[paletteOffset + 3], sx + 8, sy + 8);
    }
  }

  /** Metatile positions currently replaced by door frames (bottom layer hidden). */
  isDoorDrawnAt(x: number, y: number): boolean {
    return this.drawn.has(`${x},${y}`);
  }
}
