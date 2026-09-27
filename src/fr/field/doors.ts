// Port of field_door.c: door graphics and animation frames come from exported
// cdata; Canvas draws the source frames over the map metatiles.

import { sound } from "../audio/sound";
import * as C from "../generated/constants";
import * as MB from "../generated/metatileBehavior";
import { b64, rom } from "../rom";
import { cdata, cdataAny, symName } from "../hw/assets";
import { tasks, type TaskFunc } from "../gba/tasks";
import type { Overworld } from "./overworld";

const SIZE_1x2 = 1;
const CLOSED = -1;

type DoorGfx = { metatile: number; sound: number; size: number; file: string; palettes: number[] };
type DoorAnimFrame = { duration: number; tileOffset: number };
type DoorGraphicsCData = { metatileId: number; sound: number; size: number; tiles: unknown; paletteNums: unknown };

function doorImageName(symbol: string): string {
  return symbol.replace(/^sDoorAnimTiles_/, "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Za-z])([0-9])/g, "$1_$2")
    .toLowerCase();
}

export class DoorAnimator {
  private static readonly TASK_PRIORITY = 80;
  private gfx: DoorGfx[] | undefined;
  private animFrames = new Map<string, DoorAnimFrame[]>();
  private tileData = new Map<string, Uint8Array>();
  private anim?: { door: DoorGfx; frames: DoorAnimFrame[]; x: number; y: number; frameId: number; counter: number };
  private taskId = -1;
  private readonly Task_AnimateDoor: TaskFunc = (taskId) => this.taskAnimateDoor(taskId);
  /** Door frame currently drawn at a map position (tile offset or CLOSED). */
  private drawn = new Map<string, { door: DoorGfx; offset: number }>();

  constructor(private readonly ow: Overworld) {}

  private table(): DoorGfx[] {
    if (!this.gfx) {
      const source = cdata<DoorGraphicsCData[]>("field_door", "sDoorGraphics");
      this.gfx = source.filter((door) => typeof door.metatileId === "number").map((door) => {
        const tileSymbol = symName(door.tiles);
        const paletteSymbol = symName(door.paletteNums);
        if (!tileSymbol || !paletteSymbol) throw new Error("invalid sDoorGraphics cdata reference");
        const palettes = cdataAny<number[]>(paletteSymbol);
        if (!palettes) throw new Error(`missing door palette cdata ${paletteSymbol}`);
        return { metatile: door.metatileId, sound: door.sound, size: door.size, file: doorImageName(tileSymbol), palettes };
      });
    }
    return this.gfx;
  }

  private doorAt(x: number, y: number): DoorGfx | undefined {
    return this.GetDoorGraphics(this.ow.map.metatileIdAt(x, y));
  }

  reset(): void {
    if (this.taskId >= 0 && tasks.tasks[this.taskId].func === this.Task_AnimateDoor) tasks.destroy(this.taskId);
    this.taskId = -1;
    this.anim = undefined;
    this.drawn.clear();
  }

  GetDoorSoundEffect(x: number, y: number): number {
    const door = this.doorAt(x, y);
    return sound.c(door?.sound === 0 ? "SE_DOOR" : "SE_SLIDING_DOOR");
  }

  private frames(name: string): DoorAnimFrame[] {
    let frames = this.animFrames.get(name);
    if (!frames) {
      frames = cdata<DoorAnimFrame[]>("field_door", name)
        .filter((frame) => typeof frame.duration === "number")
        .map((frame) => ({
          duration: frame.duration,
          tileOffset: frame.tileOffset === 0xffff ? CLOSED : frame.tileOffset / C.TILE_SIZE_4BPP,
        }));
      this.animFrames.set(name, frames);
    }
    return frames;
  }

  private StartDoorAnimationTask(door: DoorGfx, frames: DoorAnimFrame[], x: number, y: number): number {
    if (tasks.isActive(this.Task_AnimateDoor)) return -1;
    this.anim = { door, frames, x, y, frameId: 0, counter: 0 };
    const taskId = tasks.create(this.Task_AnimateDoor, DoorAnimator.TASK_PRIORITY);
    if (!tasks.tasks[taskId].isActive || tasks.tasks[taskId].func !== this.Task_AnimateDoor) {
      this.anim = undefined;
      return -1;
    }
    this.taskId = taskId;
    return taskId;
  }

  private AnimateDoorOpenInternal(x: number, y: number): number {
    const door = this.doorAt(x, y);
    if (!door) return -1;
    const suffix = door.size === SIZE_1x2 ? "Large" : "Small";
    return this.StartDoorAnimationTask(door, this.frames(`sDoorAnimFrames_Open${suffix}`), x, y);
  }

  private StartDoorCloseAnimation(x: number, y: number): number {
    const door = this.doorAt(x, y);
    if (!door) return -1;
    const suffix = door.size === SIZE_1x2 ? "Large" : "Small";
    return this.StartDoorAnimationTask(door, this.frames(`sDoorAnimFrames_Close${suffix}`), x, y);
  }

  FieldAnimateDoorOpen(x: number, y: number): number {
    if (!MB.MetatileBehavior_IsWarpDoor_2(this.ow.map.behaviorAt(x, y))) return -1;
    return this.AnimateDoorOpenInternal(x, y);
  }

  FieldAnimateDoorClose(x: number, y: number): number {
    if (!MB.MetatileBehavior_IsWarpDoor_2(this.ow.map.behaviorAt(x, y))) return -1;
    return this.StartDoorCloseAnimation(x, y);
  }

  FieldSetDoorOpened(x: number, y: number): void {
    if (!MB.MetatileBehavior_IsWarpDoor_2(this.ow.map.behaviorAt(x, y))) return;
    const door = this.doorAt(x, y);
    if (!door) return;
    const frames = this.frames(`sDoorAnimFrames_Open${door.size === SIZE_1x2 ? "Large" : "Small"}`);
    this.draw(door, frames[frames.length - 1].tileOffset, x, y);
  }

  FieldSetDoorClosed(x: number, y: number): void {
    if (!MB.MetatileBehavior_IsWarpDoor_2(this.ow.map.behaviorAt(x, y))) return;
    const door = this.doorAt(x, y);
    if (door) this.draw(door, CLOSED, x, y);
  }

  FieldIsDoorAnimationRunning(): boolean {
    return tasks.isActive(this.Task_AnimateDoor);
  }

  /** GetDoorGraphics: lookup the source table entry for the map metatile. */
  private GetDoorGraphics(id: number): DoorGfx | undefined { return this.table().find((door) => door.metatile === id); }

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
  private taskAnimateDoor(taskId: number): void {
    if (taskId !== this.taskId) return;
    const a = this.anim;
    if (!a) { tasks.destroy(taskId); this.taskId = -1; return; }
    if (a.counter === 0) this.DrawDoor(a.door, a.frames[a.frameId], a.x, a.y);
    if (a.counter === a.frames[a.frameId].duration) {
      a.counter = 0;
      a.frameId++;
      if (a.frameId >= a.frames.length) {
        this.anim = undefined;
        this.taskId = -1;
        tasks.destroy(taskId);
      }
      return;
    }
    a.counter++;
  }

  /** DrawDoor; C copies frame tiles to VRAM, while this renderer composites exported tiles. */
  private DrawDoor(door: DoorGfx, frame: DoorAnimFrame, x: number, y: number): void {
    this.draw(door, frame.tileOffset, x, y);
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
