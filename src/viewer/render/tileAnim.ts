import { TILE, GBA_FRAME_MS, ANIM_RANGES } from "../constants";
import type { TileRenderer } from "../../fr/field/tileRenderer";
import type { TilesetAnimator } from "../../fr/field/tilesetAnimator";
import type { TilesetData } from "../../fr/rom";
import { NUM_METATILES_IN_PRIMARY } from "../../fr/field/fieldmap";
import { composeMetatile, invalidateMetatile } from "./metatile";

export type AnimatedCell = {
  x: number;
  y: number;
  mt: number;
  mask: number;
};

export type AnimatedMap = {
  renderer: TileRenderer;
  animator: TilesetAnimator;
  bctx: CanvasRenderingContext2D;
  left: number;
  top: number;
  width: number;
  height: number;
  cells: AnimatedCell[];
  dirtyMask: number;
};

export function animRangesFor(primary: TilesetData, secondary: TilesetData): Array<[number, number]> {
  return [...(ANIM_RANGES[primary.callback ?? ""] ?? []), ...(ANIM_RANGES[secondary.callback ?? ""] ?? [])];
}

export function rangeMask(primary: TilesetData, secondary: TilesetData, ranges: Array<[number, number]>, mt: number): number {
  let entries: Uint16Array;
  if (mt < NUM_METATILES_IN_PRIMARY) {
    entries = primary.metatiles.subarray(mt * 8, mt * 8 + 8);
  } else {
    const local = mt - NUM_METATILES_IN_PRIMARY;
    if (local * 8 >= secondary.metatiles.length) return 0;
    entries = secondary.metatiles.subarray(local * 8, local * 8 + 8);
  }
  let mask = 0;
  for (const entry of entries) {
    const tile = entry & 0x3ff;
    ranges.forEach(([lo, hi], i) => {
      if (tile >= lo && tile < hi) mask |= 1 << i;
    });
  }
  return mask;
}

export class TileAnimationController {
  readonly animatedMaps: AnimatedMap[] = [];
  animOn = false;
  animFrame = 0;
  animLast = 0;
  animAccumulator = 0;
  animStartTime = 0;
  animDisabledNotice = "";
  fpsFrames = 0;
  fpsSince = 0;
  fpsValue = 0;

  constructor(
    private readonly getViewportRect: () => { left: number; top: number; width: number; height: number; zoom: number },
    private readonly onFpsUpdate: () => void,
    private readonly onFrame?: () => void
  ) {}

  addMap(map: AnimatedMap): void {
    this.animatedMaps.push(map);
  }

  private mapVisible(m: AnimatedMap, viewLeft: number, viewTop: number, viewRight: number, viewBottom: number): boolean {
    return m.left < viewRight && m.left + m.width > viewLeft && m.top < viewBottom && m.top + m.height > viewTop;
  }

  start(): void {
    if (this.animOn) return;
    this.animOn = true;
    this.animLast = this.fpsSince = this.animStartTime = performance.now();
    this.animAccumulator = 0;
    this.fpsFrames = 0;
    this.animDisabledNotice = "";
    this.animFrame = requestAnimationFrame((now) => this.tick(now));
  }

  stop(): void {
    if (!this.animOn) return;
    this.animOn = false;
    cancelAnimationFrame(this.animFrame);
  }

  private tick(now: number): void {
    if (!this.animOn) return;

    this.animAccumulator += Math.min(now - this.animLast, 250);
    this.animLast = now;
    let steps = 0;
    while (this.animAccumulator >= GBA_FRAME_MS && steps < 8) {
      this.animAccumulator -= GBA_FRAME_MS;
      steps++;
    }

    if (steps === 0) {
      this.recordFps(now);
      this.animFrame = requestAnimationFrame((n) => this.tick(n));
      return;
    }

    const { left, top, width, height, zoom } = this.getViewportRect();
    if (zoom >= 0.5) {
      const viewLeft = left / zoom;
      const viewTop = top / zoom;
      const viewRight = viewLeft + width / zoom;
      const viewBottom = viewTop + height / zoom;

      for (const m of this.animatedMaps) {
        if (!this.mapVisible(m, viewLeft, viewTop, viewRight, viewBottom)) continue;

        m.dirtyMask = 0;
        for (let s = 0; s < steps; s++) {
          m.animator.update();
        }

        if (m.dirtyMask === 0) continue;


        for (const c of m.cells) {
          if (!(c.mask & m.dirtyMask)) continue;

          const cellLeft = m.left + c.x * TILE;
          const cellTop = m.top + c.y * TILE;
          if (cellLeft + TILE < viewLeft || cellLeft > viewRight || cellTop + TILE < viewTop || cellTop > viewBottom) {
            continue;
          }

          invalidateMetatile(m.renderer, c.mt);
          const tileCanvas = composeMetatile(m.renderer, c.mt);
          m.bctx.clearRect(c.x * TILE, c.y * TILE, TILE, TILE);
          m.bctx.drawImage(tileCanvas, c.x * TILE, c.y * TILE);
        }
      }
    }

    this.recordFps(now);
    this.onFrame?.();
    if (this.animOn) {
      this.animFrame = requestAnimationFrame((n) => this.tick(n));
    }
  }

  private recordFps(now: number): void {
    this.fpsFrames++;
    if (now - this.fpsSince >= 1000) {
      this.fpsValue = (this.fpsFrames * 1000) / (now - this.fpsSince);
      this.fpsFrames = 0;
      this.fpsSince = now;

      if (now - this.animStartTime > 1500 && this.fpsValue < 30) {
        this.stop();
        const animBox = document.getElementById("anim-toggle") as HTMLInputElement | null;
        if (animBox) animBox.checked = false;
        this.animDisabledNotice = ` · animaciones anuladas automáticamente (${this.fpsValue.toFixed(0)} FPS < 30 FPS)`;
      }

      this.onFpsUpdate();
    }
  }
}
