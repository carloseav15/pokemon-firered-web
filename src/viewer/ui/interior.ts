// Visor de interiores: un mapa suelto (casa, Centro Pokémon, cueva, gimnasio…) dibujado desde sus datos, con sus
// warps, objetos, eventos de coordenada y carteles. Los interiores no tienen sitio en el mundo exterior: se
// encadenan por warps, así que aquí se navega de puerta en puerta con una pila de «volver».
//
// Solo lee datos exportados (rom.loadMap / loadLayout / loadTileset); no usa el motor del juego.

import { DATA_ROOT, rom } from "@core/rom";
import type { MapHeader, MapObjectTemplate } from "@core/rom";
import { TileRenderer } from "@core/field/tileRenderer";
import { facingFrame, fallbackGfx, gfxInfoOf, spriteFolderOf } from "../render/sprites";
import { getJohtoDialogue, formatJohtoInteriorName } from "../interaction/johtoDialogues";

const TILE = 16;
const ZOOM = 3;

export type InteriorHooks = {
  /** Es un mapa del mundo exterior del visor (tiene sitio en el lienzo principal). */
  isExterior(mapId: string): boolean;
  /** Cierra el interior y centra el mundo exterior en un mapa. */
  showExterior(mapId: string): void;
  /** Nombre del mapa según maps.json del juego (el visor no carga el índice completo de `rom`). */
  mapName(mapId: string): string | undefined;
};

type HistoryEntry = { mapId: string; arriveWarp: number | null };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class InteriorViewer {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly side: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private history: HistoryEntry[] = [];
  private current: HistoryEntry | null = null;
  private token = 0;

  constructor(private readonly hooks: InteriorHooks) {
    this.root = el("div");
    this.root.id = "interior";
    this.root.style.display = "none";
    const bar = el("div", "interior-bar");
    this.backBtn = el("button", "btn", "← Back");
    this.backBtn.addEventListener("click", () => this.back());
    const close = el("button", "btn", "✕ Close");
    close.addEventListener("click", () => this.close());
    this.title = el("strong", "interior-title");
    this.meta = el("span", "interior-meta");
    bar.append(this.backBtn, this.title, this.meta, close);
    const body = el("div", "interior-body");
    this.stage = el("div", "interior-stage");
    this.side = el("div", "interior-side");
    body.append(this.stage, this.side);
    this.root.append(bar, body);
    document.body.appendChild(this.root);
    window.addEventListener("keydown", (e) => {
      if (!this.isOpen()) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.close(); }
      if (e.key === "Backspace" && (e.target as HTMLElement | null)?.tagName !== "INPUT") { e.preventDefault(); this.back(); }
    }, true);
  }

  isOpen(): boolean {
    return this.root.style.display !== "none";
  }

  close(): void {
    this.root.style.display = "none";
    this.history = [];
    this.current = null;
  }

  private back(): void {
    const prev = this.history.pop();
    if (prev) void this.show(prev, false);
  }

  /** Abre un mapa interior; `arriveWarp` marca la casilla de llegada (índice de warp de ese mapa). */
  async open(mapId: string, arriveWarp: number | null = null): Promise<void> {
    if (this.current) this.history.push(this.current);
    await this.show({ mapId, arriveWarp }, true);
  }

  private async show(entry: HistoryEntry, _push: boolean): Promise<void> {
    const token = ++this.token;
    this.root.style.display = "flex";
    this.title.textContent = entry.mapId.replace(/^MAP_/, "");
    this.meta.textContent = "Loading…";
    this.backBtn.disabled = this.history.length === 0;
    let map: MapHeader;
    let layout: Awaited<ReturnType<typeof rom.loadLayout>>;
    let primary: Awaited<ReturnType<typeof rom.loadTileset>>;
    let secondary: Awaited<ReturnType<typeof rom.loadTileset>>;
    try {
      map = await rom.loadMap(entry.mapId);
      layout = await rom.loadLayout(map.layout);
      primary = await rom.loadTileset(layout.primary);
      secondary = await rom.loadTileset(layout.secondary);
    } catch (error) {
      this.meta.textContent = `Unable to load ${entry.mapId}: ${String(error)}`;
      return;
    }
    if (token !== this.token) return;
    this.current = entry;
    this.backBtn.disabled = this.history.length === 0;

    this.title.textContent = formatJohtoInteriorName(entry.mapId) ?? this.hooks.mapName(entry.mapId) ?? map.name;
    this.meta.textContent = `${entry.mapId} · ${layout.width}×${layout.height} · music ${map.musicName} · ${layout.primary.replace("gTileset_", "")} + ${layout.secondary.replace("gTileset_", "")}`;

    const renderer = new TileRenderer(primary, secondary);
    const w = layout.width;
    const h = layout.height;
    const canvas = el("canvas");
    canvas.width = w * TILE;
    canvas.height = h * TILE;
    canvas.style.width = `${w * TILE * ZOOM}px`;
    canvas.style.height = `${h * TILE * ZOOM}px`;
    canvas.style.imageRendering = "pixelated";
    const ctx = canvas.getContext("2d")!;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const mt = layout.blocks[y * w + x]! & 0x3ff;
        const { bottom, top } = renderer.metatile(mt);
        ctx.drawImage(bottom, x * TILE, y * TILE);
        ctx.drawImage(top, x * TILE, y * TILE);
      }
    }
    // Los interiores se ven sobre fondo oscuro; los bloques con colisión se atenúan un poco para leer el suelo.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (((layout.blocks[y * w + x]! & 0xc00) >> 10) !== 0) {
          ctx.fillStyle = "rgba(255,0,0,0.12)";
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    }

    const wrap = el("div", "interior-map");
    wrap.style.width = `${w * TILE * ZOOM}px`;
    wrap.style.height = `${h * TILE * ZOOM}px`;
    wrap.appendChild(canvas);

    const place = (cls: string, x: number, y: number, label: string, onClick?: () => void): HTMLElement => {
      const m = el("div", `interior-mark ${cls}`);
      m.style.left = `${x * TILE * ZOOM}px`;
      m.style.top = `${y * TILE * ZOOM}px`;
      m.style.width = `${TILE * ZOOM}px`;
      m.style.height = `${TILE * ZOOM}px`;
      m.title = label;
      if (onClick) { m.classList.add("clickable"); m.addEventListener("click", onClick); }
      wrap.appendChild(m);
      return m;
    };

    // Objetos con su sprite (de pie, mirando al sur): clones y objetos sin hoja se marcan sin dibujo.
    for (const o of map.objects) {
      if (o.clone) {
        place("obj", o.x, o.y, `clon of ${o.targetMap} #${o.targetLocalId}`);
        continue;
      }
      const obj = o as MapObjectTemplate;
      const dialogue = getJohtoDialogue(entry.mapId, obj.localId, obj.scriptName ?? undefined, obj.graphicsName);
      const label = dialogue
        ? `${dialogue.title}: ${dialogue.text}`
        : `${obj.graphicsName} · ${obj.scriptName ?? "no script"}${obj.trainerType ? ` · trainer (range ${obj.trainerRange})` : ""}`;
      const m = place("obj", obj.x, obj.y, label, dialogue ? () => this.showDialogue(dialogue) : undefined);
      const g = gfxInfoOf(obj.graphicsName) ?? fallbackGfx();
      const frame = facingFrame(g, "south");
      const sprite = el("div", "interior-sprite");
      sprite.style.width = `${g.w * ZOOM}px`;
      sprite.style.height = `${g.h * ZOOM}px`;
      sprite.style.left = `${-((g.w - TILE) / 2) * ZOOM}px`;
      sprite.style.top = `${-(g.h - TILE) * ZOOM}px`;
      const folder = spriteFolderOf(obj.graphicsName);
      sprite.style.backgroundImage = `url(${folder}/${g.file})`;
      sprite.style.backgroundSize = "auto 100%";
      sprite.style.backgroundPosition = `-${frame.frame * g.w * ZOOM}px 0`;
      m.appendChild(sprite);
      if (obj.trainerType) m.classList.add("trainer");
    }

    map.warps.forEach((wp, i) => {
      const dest = wp.destMap;
      const label = `warp ${i} → ${dest}${wp.destWarpId >= 0 ? ` #${wp.destWarpId}` : ""}`;
      const mark = place("warp", wp.x, wp.y, label, () => this.followWarp(dest, wp.destWarpId));
      mark.textContent = String(i);
      if (entry.arriveWarp === i) mark.classList.add("arrive");
    });
    for (const c of map.coords) place("coord", c.x, c.y, `coordinate event: var ${c.var} = ${c.value} → ${c.scriptName}`);
    for (const b of map.bgs) {
      if (b.type === "sign") place("sign", b.x, b.y, `sign · ${b.scriptName}`);
      else place("item", b.x, b.y, `hidden item · ${b.item} ×${b.quantity}${b.underfoot ? " (underfoot)" : ""}`);
    }

    this.stage.replaceChildren(wrap);
    this.fillSide(map, entry);
    // Lleva la casilla de llegada al centro del escenario.
    if (entry.arriveWarp !== null) {
      const wp = map.warps[entry.arriveWarp];
      if (wp) {
        this.stage.scrollLeft = (wp.x + 0.5) * TILE * ZOOM - this.stage.clientWidth / 2;
        this.stage.scrollTop = (wp.y + 0.5) * TILE * ZOOM - this.stage.clientHeight / 2;
      }
    }
  }

  showDialogue(dialogue: { title: string; text: string }): void {
    const existing = this.side.querySelector(".interior-dialogue");
    existing?.remove();
    const box = el("div", "interior-section interior-dialogue");
    box.style.cssText = "background:#1e293b;border:1px solid #38bdf8;border-radius:6px;padding:8px 10px;margin-bottom:12px;";
    const h = el("strong", undefined, `💬 ${dialogue.title}`);
    h.style.cssText = "display:block;color:#38bdf8;margin-bottom:4px;font-size:13px;";
    const p = el("div", undefined, dialogue.text);
    p.style.cssText = "white-space:pre-wrap;line-height:1.4;font-size:12px;color:#f1f5f9;";
    box.append(h, p);
    this.side.prepend(box);
    box.scrollIntoView({ behavior: "smooth" });
  }

  private followWarp(destMap: string, destWarpId: number): void {
    if (this.hooks.isExterior(destMap)) {
      this.close();
      this.hooks.showExterior(destMap);
      return;
    }
    void this.open(destMap, destWarpId >= 0 ? destWarpId : null);
  }

  private fillSide(map: MapHeader, entry: HistoryEntry): void {
    const side = this.side;
    side.replaceChildren();
    const section = (name: string, count: number): HTMLElement => {
      const s = el("div", "interior-section");
      s.appendChild(el("h4", undefined, `${name} (${count})`));
      side.appendChild(s);
      return s;
    };
    const row = (parent: HTMLElement, text: string, onClick?: () => void): void => {
      const r = el("div", onClick ? "interior-row link" : "interior-row", text);
      if (onClick) r.addEventListener("click", onClick);
      parent.appendChild(r);
    };

    const sw = section("Warps", map.warps.length);
    map.warps.forEach((wp, i) => {
      const exterior = this.hooks.isExterior(wp.destMap);
      row(sw, `${i}${entry.arriveWarp === i ? " ◀ llegada" : ""} · (${wp.x},${wp.y}) → ${wp.destMap.replace(/^MAP_/, "")}${exterior ? " ⛰ exterior" : ""}`,
        () => this.followWarp(wp.destMap, wp.destWarpId));
    });
    if (map.connections.length > 0) {
      const sc = section("Connections", map.connections.length);
      for (const c of map.connections) {
        row(sc, `${c.direction} · ${c.map.replace(/^MAP_/, "")} (desfase ${c.offset})`, () => this.followWarp(c.map, -1));
      }
    }
    const so = section("Items", map.objects.length);
    for (const o of map.objects) {
      if (o.clone) { row(so, `clon · (${o.x},${o.y}) → ${o.targetMap}#${o.targetLocalId}`); continue; }
      const obj = o as MapObjectTemplate;
      const flag = obj.flag ? ` · flag ${obj.flag}` : "";
      row(so, `#${obj.localId} (${obj.x},${obj.y}) ${obj.graphicsName.replace("OBJ_EVENT_GFX_", "")} · ${obj.scriptName ?? "—"}${obj.trainerType ? " · trainer" : ""}${flag}`);
    }
    if (map.coords.length > 0) {
      const sk = section("Coordinate events", map.coords.length);
      for (const c of map.coords) row(sk, `(${c.x},${c.y}) var ${c.var} = ${c.value} → ${c.scriptName}`);
    }
    if (map.bgs.length > 0) {
      const sb = section("Signs and hidden items", map.bgs.length);
      for (const b of map.bgs) {
        row(sb, b.type === "sign" ? `(${b.x},${b.y}) sign · ${b.scriptName}` : `(${b.x},${b.y}) item ${b.item} ×${b.quantity} · flag ${b.flag}`);
      }
    }
  }
}
