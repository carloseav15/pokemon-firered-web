import { TILE } from "../constants";
import type { FillSource } from "./fill";

/** GetBorderBlockAt (fieldmap.c): repeat the current map's exported border,
 * anchored to its local origin. This canvas covers only the camera, never the world.
 * Other maps draw over it; borders remain non-walkable in WorldGrid.
 */
export class SectorBorder {
  readonly canvas = document.createElement("canvas");
  private source: FillSource | undefined;
  private pattern: CanvasPattern | null = null;
  private left = NaN;
  private top = NaN;
  private dirty = true;
  constructor(content: HTMLElement) {
    this.canvas.className = "sector-border";
    this.canvas.style.cssText = "position:absolute;pointer-events:none;image-rendering:pixelated";
    content.prepend(this.canvas);
  }
  get bytes(): number { return this.canvas.width * this.canvas.height * 4; }
  invalidate(renderer: FillSource["renderer"]): void { if (this.source?.renderer === renderer) this.dirty = true; }
  draw(source: FillSource | undefined, view: { x: number; y: number; width: number; height: number }, minX: number, minY: number): void {
    if (!source) return;
    const left = Math.floor(view.x / TILE) * TILE, top = Math.floor(view.y / TILE) * TILE;
    const width = Math.ceil(view.width / TILE) * TILE + TILE, height = Math.ceil(view.height / TILE) * TILE + TILE;
    if (source !== this.source || this.dirty) {
      const motif = document.createElement("canvas");
      const { layout, renderer } = source;
      if (!layout.borderWidth || !layout.borderHeight) return;
      motif.width = layout.borderWidth * TILE; motif.height = layout.borderHeight * TILE;
      const ctx = motif.getContext("2d")!;
      for (let y = 0; y < layout.borderHeight; y++) for (let x = 0; x < layout.borderWidth; x++) {
        const mt = layout.border[y * layout.borderWidth + x]! & 0x3ff;
        const { bottom, top } = renderer.metatile(mt);
        ctx.drawImage(bottom, x * TILE, y * TILE); ctx.drawImage(top, x * TILE, y * TILE);
      }
      this.pattern = this.canvas.getContext("2d")!.createPattern(motif, "repeat");
      this.source = source; this.dirty = true;
    }
    if (!this.dirty && left === this.left && top === this.top && width === this.canvas.width && height === this.canvas.height) return;
    this.left = left; this.top = top; this.dirty = false;
    if (width !== this.canvas.width) this.canvas.width = width;
    if (height !== this.canvas.height) this.canvas.height = height;
    this.canvas.style.left = `${left}px`; this.canvas.style.top = `${top}px`;
    this.pattern?.setTransform(new DOMMatrix().translate((source.info.x - minX) * TILE - left, (source.info.y - minY) * TILE - top));
    const ctx = this.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    if (this.pattern) { ctx.fillStyle = this.pattern; ctx.fillRect(0, 0, width, height); }
  }
  dispose(): void { this.canvas.remove(); this.canvas.width = 0; this.canvas.height = 0; this.source = undefined; this.pattern = null; }
}
