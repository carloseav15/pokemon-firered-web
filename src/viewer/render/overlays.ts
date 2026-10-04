import { TILE, type Layer } from "../constants";

export function overlayCanvas(w: number, h: number, layer: Layer): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w * TILE;
  c.height = h * TILE;
  c.className = "overlay";
  c.dataset.layer = layer;
  return [c, c.getContext("2d")!];
}

export function mark(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, arrow?: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  if (arrow) {
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    const cx = x * TILE + 8;
    const cy = y * TILE + 8;
    ctx.beginPath();
    if (arrow === "E") {
      ctx.moveTo(cx + 5, cy);
      ctx.lineTo(cx - 3, cy - 4);
      ctx.lineTo(cx - 3, cy + 4);
    } else if (arrow === "W") {
      ctx.moveTo(cx - 5, cy);
      ctx.lineTo(cx + 3, cy - 4);
      ctx.lineTo(cx + 3, cy + 4);
    } else if (arrow === "S") {
      ctx.moveTo(cx, cy + 5);
      ctx.lineTo(cx - 4, cy - 3);
      ctx.lineTo(cx + 4, cy - 3);
    } else {
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx - 4, cy + 3);
      ctx.lineTo(cx + 4, cy + 3);
    }
    ctx.closePath();
    ctx.fill();
  }
}
