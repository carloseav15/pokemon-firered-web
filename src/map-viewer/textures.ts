import type { Texture } from "./types";
export const TEXTURE_BUDGET = 96 * 1024 * 1024;
export const textureBytes = (t: Texture): number => t.decodedWidth * t.decodedHeight * 4;
export type View = { x: number; y: number; width: number; height: number; zoom: number };
export function nearTextures(textures: Texture[], view: View, margin = 128): Texture[] {
  const x = view.x / view.zoom, y = view.y / view.zoom;
  const pad = margin / view.zoom;
  return textures.filter(t => t.x < x + view.width / view.zoom + pad && t.y < y + view.height / view.zoom + pad && t.x + t.w > x - pad && t.y + t.h > y - pad);
}

/** Bounds images retained by this viewer; browser/GPU caches are outside this estimate. */
export class TexturePool {
  private cache = new Map<string, { image: HTMLImageElement; bytes: number }>();
  private active = new Set<string>();
  constructor(private readonly stage: HTMLElement, private readonly onError: (url: string) => void) {}
  get retainedBytes(): number { return [...this.cache.values()].reduce((n, e) => n + e.bytes, 0); }
  get activeCount(): number { return this.active.size; }
  clear(): void {
    for (const e of this.cache.values()) { e.image.remove(); e.image.removeAttribute("src"); }
    this.cache.clear(); this.active.clear();
  }
  render(textures: Texture[]): void {
    const wanted = new Set(textures.map(t => t.key));
    for (const key of this.active) if (!wanted.has(key)) this.cache.get(key)?.image.remove();
    this.active = wanted;
    const needed = textures.reduce((n, t) => n + textureBytes(t), 0);
    if (needed > TEXTURE_BUDGET) throw new Error("La vista supera el presupuesto de imágenes; acerca el zoom o reduce capas.");
    // Evict older inactive images before inserting new ones.
    const missing = textures.filter(t => !this.cache.has(t.key)).reduce((n, t) => n + textureBytes(t), 0);
    let retained = this.retainedBytes;
    for (const [key, e] of this.cache) {
      if (retained + missing <= TEXTURE_BUDGET) break;
      if (wanted.has(key)) continue;
      e.image.remove(); e.image.removeAttribute("src"); this.cache.delete(key); retained -= e.bytes;
    }
    for (const t of textures) {
      let e = this.cache.get(t.key);
      if (!e) {
        const image = document.createElement("img");
        image.alt = ""; image.decoding = "async"; image.draggable = false;
        image.className = `texture ${t.layer}`;
        Object.assign(image.style, { left: `${t.x}px`, top: `${t.y}px`, width: `${t.w}px`, height: `${t.h}px` });
        image.addEventListener("error", () => { if (this.cache.get(t.key)?.image === image) this.onError(t.url); });
        image.src = t.url;
        e = { image, bytes: textureBytes(t) };
      }
      this.cache.delete(t.key); this.cache.set(t.key, e); // Touch LRU.
      if (!e.image.isConnected) this.stage.append(e.image);
    }
  }
}
