// Visor del mundo v1: 37 mapas exteriores de Kanto unidos (docs/VISOR-MUNDO.md par. 5).
// Solo lectura sobre el juego: importa rom, TileRenderer y metatileBehavior; no
// modifica src/fr/ ni public/fr/. Datos: public/viewer/kanto.json (generado).

import { rom, type TilesetData } from "../fr/rom";
import { TileRenderer } from "../fr/field/tileRenderer";
import { TilesetAnimator } from "../fr/field/tilesetAnimator";
import { ExtractMetatileAttribute, METATILE_ATTRIBUTE_BEHAVIOR, NUM_METATILES_IN_PRIMARY } from "../fr/field/fieldmap";
import * as MB from "../fr/generated/metatileBehavior";
import type { Element, KantoIndex, Trigger, Writer } from "./types";

const TILE = 16;
const LAYERS = ["colision", "agua", "salientes", "corte", "fuerza", "golpe_roca", "snorlax", "entrenador", "npc_condicional", "npc", "activador", "puerta"] as const;
type Layer = (typeof LAYERS)[number];
const LAYER_COLORS: Record<Layer, string> = {
  colision: "rgba(255,0,0,0.35)",
  agua: "rgba(0,120,255,0.35)",
  salientes: "rgba(255,200,0,0.45)",
  corte: "rgba(0,200,0,0.55)",
  fuerza: "rgba(150,75,0,0.55)",
  golpe_roca: "rgba(150,150,150,0.55)",
  snorlax: "rgba(0,150,150,0.6)",
  entrenador: "rgba(255,0,255,0.45)",
  npc_condicional: "rgba(255,165,0,0.5)",
  npc: "rgba(255,255,255,0.5)",
  activador: "rgba(0,255,255,0.5)",
  puerta: "rgba(180,0,255,0.55)",
};

const viewport = document.getElementById("viewport")!;
const content = document.getElementById("content")!;
const panel = document.getElementById("panel")!;
const search = document.getElementById("search") as HTMLInputElement;
const layerBox = document.getElementById("layers")!;

let index: KantoIndex;
let minX = 0;
let minY = 0;
let zoom = 1;
let startX: number | null = null;
let startY: number | null = null;
// Colision apagada por defecto (capa ruidosa); el hash ?capas= sigue mandando.
const active = new Set<Layer>((LAYERS as unknown as Layer[]).filter((l) => l !== "colision"));

function behaviorOf(primaryAttrs: Uint32Array, secondaryAttrs: Uint32Array, id: number): number {
  const raw = id < NUM_METATILES_IN_PRIMARY ? (primaryAttrs[id] ?? 0) : (secondaryAttrs[id - NUM_METATILES_IN_PRIMARY] ?? 0);
  return ExtractMetatileAttribute(raw, METATILE_ATTRIBUTE_BEHAVIOR);
}

function parseHash(): void {
  const h = new URLSearchParams(location.hash.slice(1));
  const x = Number(h.get("x"));
  const y = Number(h.get("y"));
  const z = Number(h.get("z"));
  // El scroll x/y se aplica al final de build(), cuando #content ya tiene tamano;
  // aplicarlo aqui se pierde porque el viewport aun no tiene scroll maximo.
  startX = h.get("x") !== null && Number.isFinite(x) ? x : null;
  startY = h.get("y") !== null && Number.isFinite(y) ? y : null;
  if (z !== 0 && Number.isFinite(z)) zoom = Math.min(4, Math.max(0.25, Math.round(z * 1000) / 1000));
  const capas = h.get("capas");
  if (capas) {
    active.clear();
    for (const c of capas.split(",")) if ((LAYERS as readonly string[]).includes(c)) active.add(c as Layer);
  }
}

function setZoom(next: number): void {
  // Redondeado a 3 decimales: sin esto la URL muestra z=0.6400000000000001.
  zoom = Math.round(Math.min(4, Math.max(0.25, next)) * 1000) / 1000;
  content.style.transform = `scale(${zoom})`;
  content.style.width = `${index.world.width * TILE * zoom}px`;
  content.style.height = `${index.world.height * TILE * zoom}px`;
  writeHash();
}

function writeHash(): void {
  const h = new URLSearchParams();
  h.set("x", String(Math.round(viewport.scrollLeft)));
  h.set("y", String(Math.round(viewport.scrollTop)));
  h.set("z", String(zoom));
  h.set("capas", [...active].join(","));
  history.replaceState(null, "", `#${h.toString()}`);
}

function applyLayerVisibility(): void {
  for (const layer of LAYERS) {
    const on = active.has(layer);
    content.querySelectorAll<HTMLElement>(`[data-layer="${layer}"]`).forEach((el) => {
      el.style.display = on ? "" : "none";
    });
    const box = document.getElementById(`layer-${layer}`) as HTMLInputElement | null;
    if (box) box.checked = on;
  }
}

function overlayCanvas(w: number, h: number, layer: Layer): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w * TILE;
  c.height = h * TILE;
  c.className = "overlay";
  c.dataset.layer = layer;
  return [c, c.getContext("2d")!];
}

function mark(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, arrow?: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  if (arrow) {
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    const cx = x * TILE + 8;
    const cy = y * TILE + 8;
    ctx.beginPath();
    if (arrow === "E") ctx.moveTo(cx + 5, cy), ctx.lineTo(cx - 3, cy - 4), ctx.lineTo(cx - 3, cy + 4);
    else if (arrow === "W") ctx.moveTo(cx - 5, cy), ctx.lineTo(cx + 3, cy - 4), ctx.lineTo(cx + 3, cy + 4);
    else if (arrow === "S") ctx.moveTo(cx, cy + 5), ctx.lineTo(cx - 4, cy - 3), ctx.lineTo(cx + 4, cy - 3);
    else ctx.moveTo(cx, cy - 5), ctx.lineTo(cx - 4, cy + 3), ctx.lineTo(cx + 4, cy + 3);
    ctx.closePath();
    ctx.fill();
  }
}

// 7.5: rangos de tiles VRAM que cada callback de TilesetAnimator reescribe
// (destTile y tamano de tilesetAnimator.ts; el C los aplica una vez por frame).
const ANIM_RANGES: Record<string, Array<[number, number]>> = {
  InitTilesetAnim_General: [[416, 464], [464, 482], [508, 512]],
  InitTilesetAnim_CeladonCity: [[744, 752]],
  InitTilesetAnim_SilphCo: [[976, 984]],
  InitTilesetAnim_MtEmber: [[896, 904]],
  InitTilesetAnim_VermilionGym: [[880, 887]],
  InitTilesetAnim_CeladonGym: [[739, 743]],
};

type AnimatedMap = {
  renderer: TileRenderer;
  animator: TilesetAnimator;
  bctx: CanvasRenderingContext2D;
  cells: Array<{ x: number; y: number; mt: number }>;
};
const animatedMaps: AnimatedMap[] = [];
let animOn = false;
let animFrame = 0;

function metatileUsesAnim(primary: TilesetData, secondary: TilesetData, ranges: Array<[number, number]>, mt: number): boolean {
  let entries: Uint16Array;
  if (mt < NUM_METATILES_IN_PRIMARY) entries = primary.metatiles.subarray(mt * 8, mt * 8 + 8);
  else {
    const local = mt - NUM_METATILES_IN_PRIMARY;
    if (local * 8 >= secondary.metatiles.length) return false;
    entries = secondary.metatiles.subarray(local * 8, local * 8 + 8);
  }
  for (const entry of entries) {
    const tile = entry & 0x3ff;
    for (const [lo, hi] of ranges) if (tile >= lo && tile < hi) return true;
  }
  return false;
}

function animRangesFor(primary: TilesetData, secondary: TilesetData): Array<[number, number]> {
  return [...(ANIM_RANGES[primary.callback ?? ""] ?? []), ...(ANIM_RANGES[secondary.callback ?? ""] ?? [])];
}

function tickAnimations(): void {
  if (!animOn) return;
  // Mismo ritmo que el C: UpdateTilesetAnimations una vez por frame (60/s,
  // overworld.c:1470); cada mapa lleva sus contadores como el juego.
  for (const m of animatedMaps) {
    m.animator.update();
    for (const c of m.cells) {
      const { bottom, top } = m.renderer.metatile(c.mt);
      m.bctx.drawImage(bottom, c.x * TILE, c.y * TILE);
      m.bctx.drawImage(top, c.x * TILE, c.y * TILE);
    }
  }
  animFrame = requestAnimationFrame(tickAnimations);
}

async function build(): Promise<void> {
  const res = await fetch("/viewer/kanto.json");
  if (!res.ok) throw new Error("falta public/viewer/kanto.json: ejecuta npm run viewer:index");
  index = (await res.json()) as KantoIndex;
  minX = Math.min(...Object.values(index.maps).map((m) => m.x));
  minY = Math.min(...Object.values(index.maps).map((m) => m.y));
  parseHash();

  const byPair = new Map<string, string[]>();
  for (const [id, m] of Object.entries(index.maps)) {
    const layout = await rom.loadLayout(m.layout);
    const key = `${layout.primary}|${layout.secondary}`;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key)!.push(id);
  }

  const elementsByMap = new Map<string, Element[]>();
  for (const e of index.elements) {
    if (!elementsByMap.has(e.map)) elementsByMap.set(e.map, []);
    elementsByMap.get(e.map)!.push(e);
  }
  const triggersByMap = new Map<string, Trigger[]>();
  for (const t of index.triggers) {
    if (!triggersByMap.has(t.map)) triggersByMap.set(t.map, []);
    triggersByMap.get(t.map)!.push(t);
  }

  // Por par de tilesets: paletas antes de dibujar sus mapas, uno a uno (par. 5.2).
  for (const ids of byPair.values()) {
    for (const id of ids) {
      const info = index.maps[id];
      const header = await rom.loadMap(id);
      void header;
      const layout = await rom.loadLayout(info.layout);
      const primary = await rom.loadTileset(layout.primary);
      const secondary = await rom.loadTileset(layout.secondary);
      const renderer = new TileRenderer(primary, secondary);

      const wrap = document.createElement("div");
      wrap.className = "map";
      wrap.style.left = `${(info.x - minX) * TILE}px`;
      wrap.style.top = `${(info.y - minY) * TILE}px`;
      wrap.dataset.map = id;
      const base = document.createElement("canvas");
      base.width = info.width * TILE;
      base.height = info.height * TILE;
      base.className = "base";
      const bctx = base.getContext("2d")!;
      wrap.appendChild(base);

      const overlays = new Map<Layer, CanvasRenderingContext2D>();
      const ctxFor = (layer: Layer): CanvasRenderingContext2D => {
        let ctx = overlays.get(layer);
        if (!ctx) {
          const [c, cc] = overlayCanvas(info.width, info.height, layer);
          wrap.appendChild(c);
          overlays.set(layer, cc);
          ctx = cc;
        }
        return ctx;
      };

      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const block = layout.blocks[y * info.width + x]!;
          const mt = block & 0x3ff;
          const { bottom, top } = renderer.metatile(mt);
          bctx.drawImage(bottom, x * TILE, y * TILE);
          bctx.drawImage(top, x * TILE, y * TILE);
          if (((block & 0xc00) >> 10) !== 0) mark(ctxFor("colision"), x, y, LAYER_COLORS.colision);
          const beh = behaviorOf(primary.attributes, secondary.attributes, mt);
          if (MB.MetatileBehavior_IsSurfable(beh)) mark(ctxFor("agua"), x, y, LAYER_COLORS.agua);
          let arrow: string | undefined;
          if (MB.MetatileBehavior_IsJumpEast(beh)) arrow = "E";
          else if (MB.MetatileBehavior_IsJumpWest(beh)) arrow = "W";
          else if (MB.MetatileBehavior_IsJumpSouth(beh)) arrow = "S";
          else if (MB.MetatileBehavior_IsJumpNorth(beh)) arrow = "N";
          if (arrow) mark(ctxFor("salientes"), x, y, LAYER_COLORS.salientes, arrow);
        }
      }

      for (const e of elementsByMap.get(id) ?? []) {
        if (e.layer === "puerta") {
          mark(ctxFor("puerta"), e.x, e.y, LAYER_COLORS.puerta);
        } else if (e.layer === "entrenador") {
          const ctx = ctxFor("entrenador");
          const r = e.trainerRange ?? 0;
          // Vision en linea segun su direccion (del movementType FACE_* del C);
          // sin direccion estatica solo se marca la casilla.
          const dir = e.direction === "up" || e.direction === "down" || e.direction === "left" || e.direction === "right" ? e.direction : null;
          if (dir) {
            ctx.fillStyle = "rgba(255,0,255,0.30)";
            const dx = dir === "left" ? -1 : dir === "right" ? 1 : 0;
            const dy = dir === "up" ? -1 : dir === "down" ? 1 : 0;
            for (let i = 1; i <= r; i++) ctx.fillRect((e.x + dx * i) * TILE, (e.y + dy * i) * TILE, TILE, TILE);
          }
          mark(ctx, e.x, e.y, LAYER_COLORS.entrenador);
        } else {
          mark(ctxFor(e.layer as Layer), e.x, e.y, LAYER_COLORS[e.layer as Layer]);
        }
      }
      for (const t of triggersByMap.get(id) ?? []) mark(ctxFor("activador"), t.x, t.y, LAYER_COLORS.activador);

      // 7.5: registra las casillas con tiles animados de este par de tilesets.
      // TileRenderer invalida su cache al recibir writeTiles, asi solo se
      // redibuja lo que cambio de frame.
      const ranges = animRangesFor(primary, secondary);
      if (ranges.length > 0) {
        const cells: AnimatedMap["cells"] = [];
        for (let y = 0; y < info.height; y++) {
          for (let x = 0; x < info.width; x++) {
            const mt = layout.blocks[y * info.width + x]! & 0x3ff;
            if (metatileUsesAnim(primary, secondary, ranges, mt)) cells.push({ x, y, mt });
          }
        }
        if (cells.length > 0) animatedMaps.push({ renderer, animator: new TilesetAnimator(renderer), bctx, cells });
      }

      content.appendChild(wrap);
    }
  }

  const worldW = index.world.width * TILE;
  const worldH = index.world.height * TILE;
  content.style.width = `${worldW * zoom}px`;
  content.style.height = `${worldH * zoom}px`;
  content.style.transform = `scale(${zoom})`;
  if (startX !== null) viewport.scrollLeft = startX;
  if (startY !== null) viewport.scrollTop = startY;
  applyLayerVisibility();
}

function writerText(w: Writer): string {
  if ("value" in w && !("action" in w)) return `valor ${w.value}`;
  if (w.action === "add") return `+= ${w.value}`;
  if (w.action === "copy") return `= ${w.from}`;
  return w.action;
}

function writersHtml(key: string | number): string {
  const list = index.writers[String(key)] ?? [];
  if (list.length === 0) return "<p>Se cambia fuera de los scripts de mapa.</p>";
  return `<ul>${list.map((w) => `<li>${writerText(w)} — ${w.map}, <i>${w.label}</i>, línea ${w.line}</li>`).join("")}</ul>`;
}

function centerOnMap(id: string): boolean {
  const mapEl = content.querySelector<HTMLElement>(`[data-map="${id}"]`);
  const info = index.maps[id];
  if (!mapEl || !info) return false;
  viewport.scrollLeft = (mapEl.offsetLeft + (info.width * TILE) / 2) * zoom - viewport.clientWidth / 2;
  viewport.scrollTop = (mapEl.offsetTop + (info.height * TILE) / 2) * zoom - viewport.clientHeight / 2;
  writeHash();
  return true;
}

function resolveMap(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (index.maps[query.trim()]) return query.trim();
  for (const [id, m] of Object.entries(index.maps)) {
    if (id.toLowerCase() === q || m.title.toLowerCase() === q || m.section.toLowerCase() === q) return id;
  }
  return null;
}

function showAt(worldX: number, worldY: number): void {
  const mx = Math.floor(worldX / TILE) + minX;
  const my = Math.floor(worldY / TILE) + minY;
  const entry = Object.entries(index.maps).find(([, m]) => mx >= m.x && mx < m.x + m.width && my >= m.y && my < m.y + m.height);
  if (!entry) {
    panel.innerHTML = "<p>Fuera de los mapas.</p>";
    return;
  }
  const [id, m] = entry;
  const lx = mx - m.x;
  const ly = my - m.y;
  const els = index.elements.filter((e) => e.map === id && e.x === lx && e.y === ly);
  const trs = index.triggers.filter((t) => t.map === id && t.x === lx && t.y === ly);
  let html = `<h2>${id} (${lx}, ${ly})</h2>`;
  if (els.length === 0 && trs.length === 0) {
    panel.innerHTML = html + "<p>Sin elementos del índice en esta casilla.</p>";
    return;
  }
  for (const e of els) {
    html += `<h3>${e.layer}${e.localId !== undefined ? ` #${e.localId}` : ""}</h3>`;
    if (e.graphics) html += `<p>Gráficos: ${e.graphics}</p>`;
    // El indice omite flag cuando el objeto no tiene: no se muestra nada.
    if (e.flag !== undefined) {
      html += `<p>Flag: ${e.flag}</p>${writersHtml(e.flag)}`;
      const line = typeof e.flag === "string" ? index.initialFlags[e.flag] : undefined;
      html += e.startsHidden && line !== undefined
        ? `<p>Al iniciar partida: oculto (setflag en EventScript_ResetAllMapFlags, data/event_scripts.s:${line}).</p>`
        : "<p>Al iniciar partida: visible.</p>";
    }
    if (e.movedByScript) html += "<p>Se mueve por script (setobjectxyperm).</p>";
    if (e.trainer) html += `<p>Combate: ${e.trainer}</p>`;
    if (e.trainerRange !== undefined) {
      html += e.direction
        ? `<p>Rango de visión: ${e.trainerRange} hacia ${e.direction}.</p>`
        : `<p>Rango de visión: ${e.trainerRange} (dirección variable en juego).</p>`;
    }
    if (e.destMap) {
      const exterior = e.destMap in index.maps;
      html += exterior
        ? `<p>Destino: ${e.destMap} (exterior).</p>`
        : `<p>Destino: ${e.destMap} — interior: ${e.destName ?? e.destMap}.</p>`;
    }
  }
  for (const t of trs) {
    html += `<h3>activador</h3><p>Condición: ${t.var} == ${t.value}</p><p>Script: ${t.script}</p>${writersHtml(t.var)}`;
  }
  panel.innerHTML = html;
  // La puerta centra la vista si el destino es exterior (en V1 todos los
  // destinos son interiores: 0 de 95 dan a otro mapa exterior).
  for (const e of els) {
    if (e.layer === "puerta" && e.destMap && e.destMap in index.maps) centerOnMap(e.destMap);
  }
}

function setupUi(): void {
  const animBox = document.getElementById("anim-toggle") as HTMLInputElement;
  animBox.checked = false;
  animBox.addEventListener("change", () => {
    animOn = animBox.checked;
    if (animOn) animFrame = requestAnimationFrame(tickAnimations);
    else cancelAnimationFrame(animFrame);
  });
  for (const layer of LAYERS) {
    const label = document.createElement("label");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = LAYER_COLORS[layer];
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = `layer-${layer}`;
    box.checked = active.has(layer);
    box.addEventListener("change", () => {
      if (box.checked) active.add(layer);
      else active.delete(layer);
      applyLayerVisibility();
      writeHash();
    });
    label.append(box, swatch, ` ${layer}`);
    layerBox.appendChild(label);
  }
  const list = document.getElementById("maplist") as HTMLDataListElement;
  for (const id of Object.keys(index.maps).sort()) {
    const opt = document.createElement("option");
    opt.value = id;
    list.appendChild(opt);
  }
  // Nombres legibles (7.4): el valor del datalist es lo que recibe el buscador.
  for (const [id, m] of Object.entries(index.maps).sort()) {
    if (m.title && m.title !== id) {
      const opt = document.createElement("option");
      opt.value = m.title;
      opt.label = id;
      list.appendChild(opt);
    }
    if (m.section && m.section !== id) {
      const opt = document.createElement("option");
      opt.value = m.section;
      opt.label = id;
      list.appendChild(opt);
    }
  }
  search.addEventListener("change", () => {
    const id = resolveMap(search.value);
    if (!id) return;
    centerOnMap(id);
  });

  let dragX = 0;
  let dragY = 0;
  let dragging = false;
  let moved = false;
  viewport.addEventListener("pointerdown", (ev) => {
    dragging = true;
    moved = false;
    dragX = ev.clientX;
    dragY = ev.clientY;
    viewport.setPointerCapture(ev.pointerId);
  });
  viewport.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    const dx = ev.clientX - dragX;
    const dy = ev.clientY - dragY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    viewport.scrollLeft -= dx;
    viewport.scrollTop -= dy;
    dragX = ev.clientX;
    dragY = ev.clientY;
  });
  viewport.addEventListener("pointerup", (ev) => {
    dragging = false;
    if (moved) {
      writeHash();
      return;
    }
    const rect = content.getBoundingClientRect();
    showAt((ev.clientX - rect.left) / zoom, (ev.clientY - rect.top) / zoom);
  });
  viewport.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      setZoom(zoom * (ev.deltaY > 0 ? 0.9 : 1.1));
    },
    { passive: false },
  );
  document.getElementById("zoom-in")!.addEventListener("click", () => setZoom(zoom * 1.25));
  document.getElementById("zoom-out")!.addEventListener("click", () => setZoom(zoom * 0.8));
}

build()
  .then(() => {
    setupUi();
    const meta = document.getElementById("meta")!;
    const count = Object.keys(index.maps).length;
    meta.textContent = `${count} mapas · ${index.world.width}×${index.world.height} metatiles · ${index.conflicts.length} conflicto(s) · decomp ${index._meta.decomp_commit.slice(0, 8)}`;
    if (index.conflicts.length > 0) {
      const c = index.conflicts[0];
      meta.textContent += ` · conflicto: ${c.from}→${c.to} previa (${c.placed}) propuesta (${c.proposed})`;
    }
  })
  .catch((err) => {
    panel.innerHTML = `<p>Error: ${String(err)}</p>`;
    throw err;
  });
