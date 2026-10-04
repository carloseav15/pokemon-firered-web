import { TILE, BIOME_TREES, BIOME_OCEAN, BIOME_MOUNTAIN } from "../constants";
import type { TileRenderer } from "../../fr/field/tileRenderer";
import type { KantoIndex } from "../types";
import { composeMetatile } from "./metatile";
import type { rom } from "../../fr/rom";

export type FillSource = {
  info: KantoIndex["maps"][string];
  layout: Awaited<ReturnType<typeof rom.loadLayout>>;
  renderer: TileRenderer;
};

export type FillResult = {
  canvas: HTMLCanvasElement;
  nearest: Int16Array;
};

export function renderWorldFill(
  index: KantoIndex,
  minX: number,
  minY: number,
  sources: Map<string, FillSource>,
  fillBiomeOverride: "auto" | "ocean" | "trees" | "mountain"
): FillResult {
  const W = index.world.width;
  const H = index.world.height;
  const rects = Object.values(index.maps).map((m) => ({
    x0: m.x - minX,
    y0: m.y - minY,
    x1: m.x - minX + m.width,
    y1: m.y - minY + m.height,
  }));
  const occupied = new Uint8Array(W * H);
  for (const r of rects) {
    for (let y = r.y0; y < r.y1; y++) {
      occupied.fill(1, y * W + r.x0, y * W + r.x1);
    }
  }

  const mapBorderType = new Int8Array(rects.length);
  const ids = Object.keys(index.maps);
  ids.forEach((id, i) => {
    const src = sources.get(id);
    if (!src) return;
    const borderTiles = src.layout.border.slice(0, 4).map((t) => t & 0x3ff);
    if (borderTiles[0] === 473) mapBorderType[i] = BIOME_OCEAN;
    else if (borderTiles[0] === 113) mapBorderType[i] = BIOME_MOUNTAIN;
    else mapBorderType[i] = BIOME_TREES;
  });

  const dist = new Float32Array(W * H).fill(9999);
  const nearest = new Int16Array(W * H).fill(-1);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (occupied[idx]) {
        dist[idx] = 0;
        continue;
      }
      let minD = 9999;
      let owner = -1;
      rects.forEach((r, i) => {
        const dx = x < r.x0 ? r.x0 - x : x >= r.x1 ? x - r.x1 + 1 : 0;
        const dy = y < r.y0 ? r.y0 - y : y >= r.y1 ? y - r.y1 + 1 : 0;
        const d = Math.hypot(dx, dy);
        if (d < minD) {
          minD = d;
          owner = i;
        }
      });
      dist[idx] = minD;
      const b = owner >= 0 ? mapBorderType[owner]! : BIOME_TREES;
      if (b === BIOME_OCEAN || minD <= 8) {
        nearest[idx] = b;
      }
    }
  }

  const fillCanvas = document.createElement("canvas");
  fillCanvas.width = W * TILE;
  fillCanvas.height = H * TILE;
  fillCanvas.className = "fill";
  fillCanvas.style.position = "absolute";
  fillCanvas.style.left = "0";
  fillCanvas.style.top = "0";
  fillCanvas.style.width = `${W * TILE}px`;
  fillCanvas.style.height = `${H * TILE}px`;
  fillCanvas.style.pointerEvents = "none";
  fillCanvas.style.imageRendering = "pixelated";

  const baseRenderer = sources.values().next().value?.renderer;
  if (!baseRenderer) {
    return { canvas: fillCanvas, nearest };
  }

  const fctx = fillCanvas.getContext("2d")!;
  const treeTiles = [28, 29, 20, 21];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (occupied[idx]) continue;
      let b = nearest[idx]!;
      if (fillBiomeOverride === "ocean") b = BIOME_OCEAN;
      else if (fillBiomeOverride === "trees") b = BIOME_TREES;
      else if (fillBiomeOverride === "mountain") b = BIOME_MOUNTAIN;
      if (b < 0) continue;
      const d = dist[idx]!;

      let alpha = 1.0;
      if (b !== BIOME_OCEAN && d > 2) {
        alpha = Math.max(0, 1 - (d - 2) / 6);
      }
      if (alpha <= 0.02) continue;

      fctx.globalAlpha = alpha;
      let mt = 28;
      if (b === BIOME_OCEAN) {
        mt = 473;
      } else if (b === BIOME_MOUNTAIN) {
        mt = 113;
      } else {
        const px = x % 2;
        const py = y % 2;
        mt = treeTiles[px + py * 2]!;
      }

      const tileCanvas = composeMetatile(baseRenderer, mt);
      fctx.drawImage(tileCanvas, x * TILE, y * TILE);
    }
  }
  fctx.globalAlpha = 1.0;

  return { canvas: fillCanvas, nearest };
}
