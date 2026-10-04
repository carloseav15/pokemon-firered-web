import { TILE } from "../constants";
import type { TileRenderer } from "../../fr/field/tileRenderer";

const metatileCache = new WeakMap<TileRenderer, Map<number, HTMLCanvasElement>>();

export function composeMetatile(renderer: TileRenderer, mt: number): HTMLCanvasElement {
  let cache = metatileCache.get(renderer);
  if (!cache) {
    cache = new Map();
    metatileCache.set(renderer, cache);
  }
  const cached = cache.get(mt);
  if (cached) return cached;

  const { bottom, top } = renderer.metatile(mt);
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bottom, 0, 0);
  ctx.drawImage(top, 0, 0);
  cache.set(mt, canvas);
  return canvas;
}

export function clearMetatileCache(renderer?: TileRenderer): void {
  if (renderer) {
    metatileCache.delete(renderer);
  }
}

export function invalidateMetatile(renderer: TileRenderer, mt: number): void {
  const cache = metatileCache.get(renderer);
  if (cache) {
    cache.delete(mt);
  }
}
