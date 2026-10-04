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
const layerBox = document.getElementById("layers-menu")!;

let index: KantoIndex;
let minX = 0;
let minY = 0;
let zoom = 1;
let startX: number | null = null;
let startY: number | null = null;
// Colision apagada por defecto (capa ruidosa); el hash ?capas= sigue mandando.
const active = new Set<Layer>((LAYERS as unknown as Layer[]).filter((l) => l !== "colision"));
let fillMode: "full" | "dim" | "off" = "full";
let fillBiomeOverride: "auto" | "ocean" | "trees" | "mountain" = "auto";
let cachedFillSources: Map<string, FillSource> | null = null;

// Modos del Visor: Visor libre, Exploración interactiva, o Edición/Clonado de tiles
type AppMode = "viewer" | "explore" | "edit";
let appMode: AppMode = "viewer";

// --- Modo Exploración (Personaje Jugador) ---
let playerActive = false;
let playerChar: "red" | "leaf" = "red";
let playerMode: "walk" | "bike" | "surf" = "walk";
let playerX = 0; // coordenadas globales de mundo
let playerY = 0;
let playerVisualX = 0; // interpolación visual en píxeles
let playerVisualY = 0;
let playerDir: "south" | "north" | "west" | "east" = "south";
let playerStep = 0;
let playerMoving = false;
let playerRunning = false;
let playerAnimFrame = 0;
let playerSpriteImg: HTMLImageElement | null = null;
let playerEl: HTMLElement | null = null;
let solidCollisionGrid: Uint8Array | null = null; // 1 si bloqueado (sólido)
let waterGrid: Uint8Array | null = null;          // 1 si es agua surfeable
let ledgeGrid: Uint8Array | null = null;          // 1:S, 2:N, 3:W, 4:E

// Rejilla global de metatiles del mundo para clonar con el cuentagotas
let globalMetatileGrid: Int16Array | null = null;

// Modo Pincel y Edición Potente (Tile Cloner & Painter)
let selectedMetatile = 28; // metatile del tileset primario
let eyedropperActive = false;
const customPaintedTiles = new Map<string, number>(); // "x,y" => mt

function isWaterTile(gx: number, gy: number): boolean {
  if (!waterGrid || !index) return false;
  const lx = gx - minX;
  const ly = gy - minY;
  if (lx < 0 || ly < 0 || lx >= index.world.width || ly >= index.world.height) return false;
  return waterGrid[ly * index.world.width + lx] === 1;
}

function ledgeDirection(gx: number, gy: number): number {
  if (!ledgeGrid || !index) return 0;
  const lx = gx - minX;
  const ly = gy - minY;
  if (lx < 0 || ly < 0 || lx >= index.world.width || ly >= index.world.height) return 0;
  return ledgeGrid[ly * index.world.width + lx]!;
}

function isWalkable(gx: number, gy: number, mode: "walk" | "bike" | "surf"): boolean {
  if (!solidCollisionGrid || !index) return true;
  const lx = gx - minX;
  const ly = gy - minY;
  if (lx < 0 || ly < 0 || lx >= index.world.width || ly >= index.world.height) return false;
  const solid = solidCollisionGrid[ly * index.world.width + lx] === 1;
  const water = waterGrid ? waterGrid[ly * index.world.width + lx] === 1 : false;

  if (mode === "surf") {
    // En surf solo se navega por agua, o se puede desembarcar en tierra transitable (no sólida)
    return water || !solid;
  }
  // A pie o en bici: no se puede entrar a casillas sólidas ni al agua directamente
  return !solid && !water;
}

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
  const relleno = h.get("relleno");
  if (relleno === "full" || relleno === "dim" || relleno === "off") fillMode = relleno;
}

/** Cambia el zoom manteniendo fijo el punto del viewport (ax, ay); por defecto, el centro. */
function setZoom(next: number, ax = viewport.clientWidth / 2, ay = viewport.clientHeight / 2): void {
  const worldX = (viewport.scrollLeft + ax) / zoom;
  const worldY = (viewport.scrollTop + ay) / zoom;
  // Redondeado a 3 decimales: sin esto la URL muestra z=0.6400000000000001.
  zoom = Math.round(Math.min(4, Math.max(0.25, next)) * 1000) / 1000;
  content.style.transform = `scale(${zoom})`;
  content.style.width = `${index.world.width * TILE * zoom}px`;
  content.style.height = `${index.world.height * TILE * zoom}px`;
  viewport.scrollLeft = worldX * zoom - ax;
  viewport.scrollTop = worldY * zoom - ay;
  writeHash();
}

function writeHash(): void {
  const h = new URLSearchParams();
  h.set("x", String(Math.round(viewport.scrollLeft)));
  h.set("y", String(Math.round(viewport.scrollTop)));
  h.set("z", String(zoom));
  h.set("capas", [...active].join(","));
  if (fillMode !== "full") h.set("relleno", fillMode);
  history.replaceState(null, "", `#${h.toString()}`);
}

function applyFillMode(): void {
  const fillEl = content.querySelector(".fill") as HTMLElement | null;
  if (fillEl) {
    fillEl.classList.toggle("dimmed", fillMode === "dim");
    fillEl.classList.toggle("hidden", fillMode === "off");
  }
  const select = document.getElementById("fill-mode") as HTMLSelectElement | null;
  if (select && select.value !== fillMode) select.value = fillMode;
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

type AnimatedCell = {
  x: number;
  y: number;
  mt: number;
  mask: number;
};

type AnimatedMap = {
  renderer: TileRenderer;
  animator: TilesetAnimator;
  bctx: CanvasRenderingContext2D;
  // Rectángulo del mapa en píxeles del mundo (sin zoom), para saber si se ve.
  left: number;
  top: number;
  width: number;
  height: number;
  cells: AnimatedCell[];
  dirtyMask: number;
};
const animatedMaps: AnimatedMap[] = [];
let animOn = false;
let animFrame = 0;
let animLast = 0;
let animAccumulator = 0;
let animStartTime = 0;
let animDisabledNotice = "";
// Fotograma de la GBA: 280896 ciclos a 16,78 MHz (59,73 por segundo). Mismo valor que
// FRAME_MS en src/fr/game.ts:112; el juego avanza con este paso fijo y no con el
// refresco de la pantalla (que en un Mac puede ser 120 Hz).
const GBA_FRAME_MS = 1000 / (16777216 / 280896);
let fpsFrames = 0;
let fpsSince = 0;
let fpsValue = 0;

function rangeMask(primary: TilesetData, secondary: TilesetData, ranges: Array<[number, number]>, mt: number): number {
  let entries: Uint16Array;
  if (mt < NUM_METATILES_IN_PRIMARY) entries = primary.metatiles.subarray(mt * 8, mt * 8 + 8);
  else {
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

function animRangesFor(primary: TilesetData, secondary: TilesetData): Array<[number, number]> {
  return [...(ANIM_RANGES[primary.callback ?? ""] ?? []), ...(ANIM_RANGES[secondary.callback ?? ""] ?? [])];
}

function mapVisible(m: AnimatedMap): boolean {
  const left = viewport.scrollLeft / zoom;
  const top = viewport.scrollTop / zoom;
  const right = left + viewport.clientWidth / zoom;
  const bottom = top + viewport.clientHeight / zoom;
  return m.left < right && m.left + m.width > left && m.top < bottom && m.top + m.height > top;
}

function tickAnimations(now: number): void {
  if (!animOn) return;
  // Paso fijo de la GBA, como el bucle del juego (src/fr/game.ts:184-199):
  // UpdateTilesetAnimations una vez por fotograma de GBA (overworld.c:1470).
  animAccumulator += Math.min(now - animLast, 250);
  animLast = now;
  let steps = 0;
  while (animAccumulator >= GBA_FRAME_MS && steps < 8) {
    animAccumulator -= GBA_FRAME_MS;
    steps++;
  }

  // Si no hubo avance de GBA en este fotograma de refresco, terminamos inmediatamente
  if (steps === 0) {
    fpsFrames++;
    if (now - fpsSince >= 1000) {
      fpsValue = (fpsFrames * 1000) / (now - fpsSince);
      fpsFrames = 0;
      fpsSince = now;
      updateMeta();
    }
    animFrame = requestAnimationFrame(tickAnimations);
    return;
  }

  // En zoom muy lejano (< 0.5), el viewport abarca casi todo el mapa. Pausar el
  // redibujado de celdas a zoom lejano protege la GPU y evita caídas de FPS.
  if (zoom >= 0.5) {
    // Rectángulo del viewport visible en coordenadas mundiales (píxeles sin zoom):
    // solo se simulan mapas visibles y solo se redibujan celdas dentro del área.
    const viewLeft = viewport.scrollLeft / zoom;
    const viewTop = viewport.scrollTop / zoom;
    const viewRight = viewLeft + viewport.clientWidth / zoom;
    const viewBottom = viewTop + viewport.clientHeight / zoom;

    for (const m of animatedMaps) {
      // Si el mapa entero está fuera de la pantalla, no gastamos CPU
      if (!mapVisible(m)) continue;

      m.dirtyMask = 0;
      for (let s = 0; s < steps; s++) {
        m.animator.update();
      }

      // Si ningún tile de este mapa cambió en este tick, omitimos todo el redibujado
      if (m.dirtyMask === 0) continue;

      // Cache de metatiles compuestos para este tick: muchas casillas comparten metatile
      // (ej. cientos de casillas de mar 473). Componerlo una sola vez ahorra 50%+ de drawImage.
      const composed = new Map<number, HTMLCanvasElement>();

      // Redibujar únicamente las casillas visibles que usan los rangos modificados
      for (const c of m.cells) {
        if (!(c.mask & m.dirtyMask)) continue;

        const cellLeft = m.left + c.x * TILE;
        const cellTop = m.top + c.y * TILE;
        if (cellLeft + TILE < viewLeft || cellLeft > viewRight || cellTop + TILE < viewTop || cellTop > viewBottom) {
          continue;
        }

        let tileCanvas = composed.get(c.mt);
        if (!tileCanvas) {
          const { bottom, top } = m.renderer.metatile(c.mt);
          tileCanvas = document.createElement("canvas");
          tileCanvas.width = TILE;
          tileCanvas.height = TILE;
          const tctx = tileCanvas.getContext("2d")!;
          tctx.drawImage(bottom, 0, 0);
          tctx.drawImage(top, 0, 0);
          composed.set(c.mt, tileCanvas);
        }

        m.bctx.clearRect(c.x * TILE, c.y * TILE, TILE, TILE);
        m.bctx.drawImage(tileCanvas, c.x * TILE, c.y * TILE);
      }
    }
  }

  fpsFrames++;
  if (now - fpsSince >= 1000) {
    fpsValue = (fpsFrames * 1000) / (now - fpsSince);
    fpsFrames = 0;
    fpsSince = now;

    // Protección de rendimiento: anular animaciones si caen por debajo de 30 FPS
    // tras un periodo de warmup de 1.5 segundos para evitar falsos positivos
    if (now - animStartTime > 1500 && fpsValue < 30) {
      animOn = false;
      const animBox = document.getElementById("anim-toggle") as HTMLInputElement | null;
      if (animBox) animBox.checked = false;
      cancelAnimationFrame(animFrame);
      animDisabledNotice = ` · animaciones anuladas automáticamente (${fpsValue.toFixed(0)} FPS < 30 FPS)`;
      updateMeta();
      return;
    }

    updateMeta();
  }
  animFrame = requestAnimationFrame(tickAnimations);
}

function updateMeta(): void {
  const meta = document.getElementById("status-meta") ?? document.getElementById("meta");
  if (!meta || !index) return;
  const count = Object.keys(index.maps).length;
  const w = index.world.width;
  const h = index.world.height;
  let text = `${count} mapas · ${w}×${h} metatiles · decomp ${index._meta.decomp_commit.slice(0, 8)}`;
  if (index.conflicts.length > 0) {
    const c = index.conflicts[0];
    text += ` · conflicto: ${c.from}→${c.to}`;
  }
  if (animOn) {
    text += ` · animaciones: ${fpsValue.toFixed(0)} FPS`;
  } else if (animDisabledNotice) {
    text += animDisabledNotice;
  }
  meta.textContent = text;
}

// Relleno de las zonas sin mapa: cada casilla vacía muestra el bloque de borde del
// mapa más cercano, repetido como lo repite el juego fuera de los límites
// (GetBorderBlockAt, fieldmap.c:39-57: (x - MAP_OFFSET) mod borderWidth, ídem en y).
// Es solo visual: el borde nunca es transitable.
// Biomas canónicos del exterior de Kanto para el relleno de espacios vacíos.
// Todos los metatiles provienen del tileset primario gTileset_General:
// - BIOME_TREES: bloque 2x2 de árboles densos (copa y tronco: metatiles 28, 29, 20, 21).
// - BIOME_OCEAN: bloque 2x2 de agua marina (metatile 473, MB_OCEAN_WATER).
// - BIOME_MOUNTAIN: bloque 2x2 de montaña escarpada (metatile 113).
const BIOME_TREES = 0;
const BIOME_OCEAN = 1;
const BIOME_MOUNTAIN = 2;
const BIOME_NAMES = ["bosque (árboles densos)", "marítimo (océano)", "montañoso (cordillera)"] as const;

function biomeAt(x: number, y: number): number {
  // 1. Zonas marítimas reales (Océano)
  // Mar del sur abierto (Canela, Ruta 20 y bajo Fuchsia / Ruta 19)
  if (y >= 340) return BIOME_OCEAN;
  // Mar costero al oeste de la Ruta 21
  if (x < 60 && y >= 280) return BIOME_OCEAN;
  // Canal de agua marina bajo la Senda Bici (Ruta 17)
  if (x >= 128 && x <= 160 && y >= 150 && y <= 310) return BIOME_OCEAN;
  // Bahía al sur del puerto de Ciudad Carmín
  if (x >= 264 && x <= 312 && y >= 240 && y <= 310) return BIOME_OCEAN;
  // Océano abierto al este de la costa este (Ruta 12, 13)
  if (x >= 408 && y >= 150) return BIOME_OCEAN;

  // 2. Zonas montañosas reales (Cordillera Norte de Mt. Moon y Rock Tunnel)
  // Cresta de Mt. Moon (sobre Ruta 3 y 4)
  if (x >= 110 && x <= 260 && y <= 60) return BIOME_MOUNTAIN;
  // Acantilados al norte del Cabo de Celeste (Ruta 24 y 25)
  if (x >= 280 && x <= 375 && y <= 15) return BIOME_MOUNTAIN;
  // Cresta de Rock Tunnel (sobre Ruta 9 y 10)
  if (x >= 320 && x <= 408 && y <= 60) return BIOME_MOUNTAIN;

  // 3. Todo el resto de Kanto (incluyendo Meseta Añil, valles y llanuras) es Bosque
  return BIOME_TREES;
}

type FillSource = { info: KantoIndex["maps"][string]; layout: Awaited<ReturnType<typeof rom.loadLayout>>; renderer: TileRenderer };
let nearestFill: Int16Array | null = null;

function drawFill(sources: Map<string, FillSource>): void {
  const W = index.world.width;
  const H = index.world.height;
  const rects = Object.values(index.maps).map((m) => ({
    x0: m.x - minX,
    y0: m.y - minY,
    x1: m.x - minX + m.width,
    y1: m.y - minY + m.height,
  }));
  const occupied = new Uint8Array(W * H);
  for (const r of rects) for (let y = r.y0; y < r.y1; y++) occupied.fill(1, y * W + r.x0, y * W + r.x1);

  // Distancia euclidiana exacta en casillas al mapa más cercano
  // para calcular una niebla / viñeta suave y orgánica en lugar de bandas cuadradas
  const dist = new Float32Array(W * H).fill(9999);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (occupied[y * W + x]) {
        dist[y * W + x] = 0;
        continue;
      }
      let minD = 9999;
      for (const r of rects) {
        const dx = x < r.x0 ? r.x0 - x : x >= r.x1 ? x - r.x1 + 1 : 0;
        const dy = y < r.y0 ? r.y0 - y : y >= r.y1 ? y - r.y1 + 1 : 0;
        const d = Math.hypot(dx, dy);
        if (d < minD) minD = d;
      }
      dist[y * W + x] = minD;
    }
  }

  // Mapa canónico de bordes GBA: cada mapa exterior tiene su bloque oficial de 2x2 metatiles
  // (árboles [28,29,20,21], montaña [113,113,113,113], u océano [473,473,473,473]).
  // Asignamos a cada casilla vacía el patrón del mapa del cual es frontera directa.
  const nearest = new Int16Array(W * H).fill(-1);
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

  const nearestOwner = new Int16Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (occupied[y * W + x]) continue;
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
      nearestOwner[y * W + x] = owner;
      const b = owner >= 0 ? mapBorderType[owner]! : BIOME_TREES;
      // En océano extendemos la masa de agua natural, en tierra desvanecemos suavemente
      if (b === BIOME_OCEAN || minD <= 8) {
        nearest[y * W + x] = b;
      }
    }
  }
  cachedFillSources = sources;
  nearestFill = nearest;

  const baseRenderer = sources.values().next().value?.renderer;
  if (!baseRenderer) return;

  // Limpiar canvas de relleno existente si se vuelve a generar
  const existingFill = content.querySelector(".fill");
  if (existingFill) existingFill.remove();

  // Canvas de relleno unificado: dibuja los patrones de bioma y desvanece
  // suavemente los bordes de tierra con transparencia hacia el fondo oscuro
  const fillCanvas = document.createElement("canvas");
  fillCanvas.width = W * TILE;
  fillCanvas.height = H * TILE;
  fillCanvas.className = "fill";
  fillCanvas.style.cssText = `position:absolute;left:0;top:0;width:${W * TILE}px;height:${H * TILE}px;pointer-events:none;image-rendering:pixelated;`;
  const fctx = fillCanvas.getContext("2d")!;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (occupied[y * W + x]) continue;
      let b = nearest[y * W + x]!;
      if (fillBiomeOverride === "ocean") b = BIOME_OCEAN;
      else if (fillBiomeOverride === "trees") b = BIOME_TREES;
      else if (fillBiomeOverride === "mountain") b = BIOME_MOUNTAIN;
      if (b < 0) continue;
      const d = dist[y * W + x]!;

      // Opacidad orgánica según distancia euclidiana
      let alpha = 1.0;
      if (b !== BIOME_OCEAN && d > 2) {
        alpha = Math.max(0, 1 - (d - 2) / 6);
      }
      if (alpha <= 0.02) continue;

      fctx.globalAlpha = alpha;
      // Metatile del patrón según coordenadas globales (alineación continua)
      let mt = 28;
      const px = x % 2;
      const py = y % 2;
      if (b === BIOME_OCEAN) {
        mt = 473;
      } else if (b === BIOME_MOUNTAIN) {
        mt = 113;
      } else {
        const treeTiles = [28, 29, 20, 21];
        mt = treeTiles[px + py * 2]!;
      }
      const { bottom, top } = baseRenderer.metatile(mt);
      fctx.drawImage(bottom, x * TILE, y * TILE);
      fctx.drawImage(top, x * TILE, y * TILE);
    }
  }
  fctx.globalAlpha = 1.0;

  content.prepend(fillCanvas);
  applyFillMode();
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

  const fillSources = new Map<string, FillSource>();
  // Rejillas globales de colisión, agua, salientes y metatiles originales para clonado
  solidCollisionGrid = new Uint8Array(index.world.width * index.world.height).fill(1); // por defecto vacío = sólido
  waterGrid = new Uint8Array(index.world.width * index.world.height);
  ledgeGrid = new Uint8Array(index.world.width * index.world.height);
  globalMetatileGrid = new Int16Array(index.world.width * index.world.height).fill(-1);

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
          const hasCollision = ((block & 0xc00) >> 10) !== 0;
          if (hasCollision) mark(ctxFor("colision"), x, y, LAYER_COLORS.colision);
          const beh = behaviorOf(primary.attributes, secondary.attributes, mt);
          const isWater = MB.MetatileBehavior_IsSurfable(beh);
          if (isWater) mark(ctxFor("agua"), x, y, LAYER_COLORS.agua);

          // Actualizar colisión, agua y metatile para el jugador y editor
          const gwx = (info.x - minX) + x;
          const gwy = (info.y - minY) + y;
          if (gwx >= 0 && gwy >= 0 && gwx < index.world.width && gwy < index.world.height) {
            const idx = gwy * index.world.width + gwx;
            solidCollisionGrid[idx] = hasCollision ? 1 : 0;
            if (isWater) waterGrid[idx] = 1;
            globalMetatileGrid[idx] = mt;
          }
          let arrow: string | undefined;
          let ledgeVal = 0;
          if (MB.MetatileBehavior_IsJumpEast(beh)) { arrow = "E"; ledgeVal = 4; }
          else if (MB.MetatileBehavior_IsJumpWest(beh)) { arrow = "W"; ledgeVal = 3; }
          else if (MB.MetatileBehavior_IsJumpSouth(beh)) { arrow = "S"; ledgeVal = 1; }
          else if (MB.MetatileBehavior_IsJumpNorth(beh)) { arrow = "N"; ledgeVal = 2; }
          if (arrow) {
            mark(ctxFor("salientes"), x, y, LAYER_COLORS.salientes, arrow);
            if (gwx >= 0 && gwy >= 0 && gwx < index.world.width && gwy < index.world.height) {
              ledgeGrid[gwy * index.world.width + gwx] = ledgeVal;
            }
          }
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
            const mask = rangeMask(primary, secondary, ranges, mt);
            if (mask) cells.push({ x, y, mt, mask });
          }
        }
        if (cells.length > 0) {
          const entry: AnimatedMap = {
            renderer, bctx, cells,
            dirtyMask: 0,
            left: (info.x - minX) * TILE, top: (info.y - minY) * TILE,
            width: info.width * TILE, height: info.height * TILE,
            animator: undefined as unknown as TilesetAnimator,
          };
          entry.animator = new TilesetAnimator({
            primary, secondary,
            writeTiles(destTile: number, data: Uint8Array, count?: number) {
              renderer.writeTiles(destTile, data, count);
              const n = count ?? data.length / 32;
              ranges.forEach(([lo, hi], i) => {
                if (destTile < hi && destTile + n > lo) entry.dirtyMask |= 1 << i;
              });
            },
          });
          animatedMaps.push(entry);
        }
      }
      fillSources.set(id, { info, layout, renderer });

      content.appendChild(wrap);
    }
  }

  drawFill(fillSources);

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

function updateBrushPreview(): void {
  const preview = document.getElementById("tile-brush-preview");
  const label = document.getElementById("tile-brush-label");
  if (label) {
    label.textContent = `Tile: #${selectedMetatile}`;
  }
  if (!preview || !cachedFillSources) return;
  const baseRenderer = cachedFillSources.values().next().value?.renderer;
  if (!baseRenderer) return;
  const { bottom, top } = baseRenderer.metatile(selectedMetatile);
  const cvs = document.createElement("canvas");
  cvs.width = TILE;
  cvs.height = TILE;
  const c = cvs.getContext("2d")!;
  c.drawImage(bottom, 0, 0);
  c.drawImage(top, 0, 0);
  preview.innerHTML = "";
  cvs.style.width = "100%";
  cvs.style.height = "100%";
  cvs.style.imageRendering = "pixelated";
  preview.appendChild(cvs);
}

function showAt(worldX: number, worldY: number): void {
  const cellX = Math.floor(worldX / TILE);
  const cellY = Math.floor(worldY / TILE);
  const selBox = document.getElementById("selection-box");
  if (selBox) {
    selBox.style.display = "block";
    selBox.style.left = `${cellX * TILE}px`;
    selBox.style.top = `${cellY * TILE}px`;
    selBox.style.width = `${TILE}px`;
    selBox.style.height = `${TILE}px`;
  }

  // Auto-desplegar panel si el usuario pincha una casilla
  if (panel.classList.contains("collapsed")) {
    panel.classList.remove("collapsed");
  }

  const mx = cellX + minX;
  const my = cellY + minY;
  const worldIdx = cellY * index.world.width + cellX;

  // Si estamos en modo clonar (cuentagotas) o modo edición sobre un mapa de Kanto, clonar su tile
  if (appMode === "edit" || eyedropperActive) {
    if (globalMetatileGrid && worldIdx >= 0 && worldIdx < globalMetatileGrid.length) {
      const clonedMt = globalMetatileGrid[worldIdx]!;
      if (clonedMt >= 0) {
        selectedMetatile = clonedMt;
        updateBrushPreview();
        if (eyedropperActive) {
          eyedropperActive = false;
          viewport.classList.remove("mode-eyedropper");
          const eyeBtn = document.getElementById("eyedropper-btn");
          if (eyeBtn) eyeBtn.classList.remove("active-mode");
        }
      }
    }
  }

  // Si estamos en modo edición y se hace clic en el lienzo, pintar esa casilla con el tile clonado
  if (appMode === "edit" && cachedFillSources) {
    const key = `${cellX},${cellY}`;
    customPaintedTiles.set(key, selectedMetatile);
    const fillCanvas = content.querySelector(".fill") as HTMLCanvasElement | null;
    if (fillCanvas) {
      const fctx = fillCanvas.getContext("2d")!;
      const baseRenderer = cachedFillSources.values().next().value?.renderer;
      if (baseRenderer) {
        const { bottom, top } = baseRenderer.metatile(selectedMetatile);
        fctx.clearRect(cellX * TILE, cellY * TILE, TILE, TILE);
        fctx.drawImage(bottom, cellX * TILE, cellY * TILE);
        fctx.drawImage(top, cellX * TILE, cellY * TILE);
      }
    }
  }

  const entry = Object.entries(index.maps).find(([, m]) => mx >= m.x && mx < m.x + m.width && my >= m.y && my < m.y + m.height);
  if (!entry) {
    const fx = mx - minX;
    const fy = my - minY;
    const i = nearestFill && fx >= 0 && fy >= 0 && fx < index.world.width && fy < index.world.height ? nearestFill[fy * index.world.width + fx]! : -1;
    panel.innerHTML = i >= 0 && i < BIOME_NAMES.length
      ? `<h2>Exterior de Kanto</h2><p><span class="badge badge-trigger">BIOMA</span> ${BIOME_NAMES[i]}</p><p style="color:#71717a">Coordenadas mundo: (${mx}, ${my}) · No es transitable.</p><p style="margin-top:12px"><button id="btn-set-brush" class="btn" style="width:100%">🖌️ Clonar este bioma</button></p>`
      : `<h2>Exterior de Kanto</h2><p>Fuera de los mapas.</p>`;
    const btnSetBrush = document.getElementById("btn-set-brush");
    if (btnSetBrush) {
      btnSetBrush.addEventListener("click", () => {
        if (i === 1) selectedMetatile = 473; // océano
        else if (i === 2) selectedMetatile = 113; // montaña
        else selectedMetatile = 28; // árboles
        updateBrushPreview();
      });
    }
    return;
  }
  const [id, m] = entry;
  const lx = mx - m.x;
  const ly = my - m.y;
  const els = index.elements.filter((e) => e.map === id && e.x === lx && e.y === ly);
  const trs = index.triggers.filter((t) => t.map === id && t.x === lx && t.y === ly);
  let html = `<h2>${id}</h2><p style="color:#a1a1aa;margin-bottom:8px">Casilla local: <b>(${lx}, ${ly})</b> · Mundo: (${mx}, ${my})</p>`;
  if (els.length === 0 && trs.length === 0) {
    panel.innerHTML = html + "<p style='color:#71717a'>Sin elementos del índice en esta casilla.</p>";
    return;
  }
  for (const e of els) {
    let badgeClass = "badge-flag";
    if (e.layer === "entrenador") badgeClass = "badge-trainer";
    else if (e.layer === "puerta") badgeClass = "badge-warp";
    html += `<h3><span class="badge ${badgeClass}">${e.layer.toUpperCase()}</span>${e.localId !== undefined ? ` #${e.localId}` : ""}</h3>`;
    if (e.graphics) html += `<p><b>Gráficos:</b> <code>${e.graphics}</code></p>`;
    // El indice omite flag cuando el objeto no tiene: no se muestra nada.
    if (e.flag !== undefined) {
      const line = typeof e.flag === "string" ? index.initialFlags[e.flag] : undefined;
      const initStatus = e.startsHidden && line !== undefined ? "Oculto" : "Visible";
      html += `<p><b>Flag:</b> <code>${e.flag}</code> (Inicial: <span class="badge badge-flag">${initStatus}</span>)</p>${writersHtml(e.flag)}`;
    }
    if (e.movedByScript) html += "<p><i>Se mueve por script (setobjectxyperm).</i></p>";
    if (e.trainer) html += `<p><b>Combate:</b> <code>${e.trainer}</code></p>`;
    if (e.trainerRange !== undefined) {
      html += e.direction
        ? `<p><b>Rango de visión:</b> ${e.trainerRange} casillas hacia <b>${e.direction}</b>.</p>`
        : `<p><b>Rango de visión:</b> ${e.trainerRange} casillas (dirección variable en juego).</p>`;
    }
    if (e.destMap) {
      const exterior = e.destMap in index.maps;
      html += exterior
        ? `<p><span class="badge badge-warp">DESTINO</span> ${e.destMap} (exterior)</p>`
        : `<p><span class="badge badge-warp">DESTINO</span> ${e.destMap} — interior: <i>${e.destName ?? e.destMap}</i></p>`;
    }
  }
  for (const t of trs) {
    html += `<h3><span class="badge badge-trigger">ACTIVADOR</span></h3><p><b>Condición:</b> <code>${t.var} == ${t.value}</code></p><p><b>Script:</b> <code>${t.script}</code></p>${writersHtml(t.var)}`;
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
    if (animOn) {
      animLast = fpsSince = animStartTime = performance.now();
      animAccumulator = 0;
      fpsFrames = 0;
      animDisabledNotice = "";
      animFrame = requestAnimationFrame(tickAnimations);
    } else {
      cancelAnimationFrame(animFrame);
    }
    updateMeta();
  });
  const fillSelect = document.getElementById("fill-mode") as HTMLSelectElement | null;
  if (fillSelect) {
    fillSelect.value = fillMode;
    fillSelect.addEventListener("change", () => {
      fillMode = (fillSelect.value as "full" | "dim" | "off") || "full";
      applyFillMode();
      writeHash();
    });
  }

  const biomeSelect = document.getElementById("fill-biome") as HTMLSelectElement | null;
  if (biomeSelect) {
    biomeSelect.value = fillBiomeOverride;
    biomeSelect.addEventListener("change", () => {
      fillBiomeOverride = (biomeSelect.value as "auto" | "ocean" | "trees" | "mountain") || "auto";
      if (cachedFillSources) drawFill(cachedFillSources);
    });
  }

  const charSelect = document.getElementById("player-char") as HTMLSelectElement | null;
  if (charSelect) {
    charSelect.value = playerChar;
    charSelect.addEventListener("change", () => {
      playerChar = (charSelect.value as "red" | "leaf") || "red";
      loadPlayerSprite();
    });
  }
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

  const updateLayersBtnText = () => {
    const btn = document.getElementById("layers-btn");
    if (btn) btn.textContent = `Capas (${active.size}/${LAYERS.length}) ▾`;
  };
  updateLayersBtnText();

  document.getElementById("layers-all")?.addEventListener("click", () => {
    for (const l of LAYERS) active.add(l as Layer);
    for (const l of LAYERS) {
      const b = document.getElementById(`layer-${l}`) as HTMLInputElement | null;
      if (b) b.checked = true;
    }
    applyLayerVisibility();
    writeHash();
    updateLayersBtnText();
  });

  document.getElementById("layers-none")?.addEventListener("click", () => {
    active.clear();
    for (const l of LAYERS) {
      const b = document.getElementById(`layer-${l}`) as HTMLInputElement | null;
      if (b) b.checked = false;
    }
    applyLayerVisibility();
    writeHash();
    updateLayersBtnText();
  });

  // --- Posicionamiento y fallback para Popover nativo ---
  const layersBtn = document.getElementById("layers-btn");
  const overflowBtn = document.getElementById("overflow-btn");
  const overflowMenu = document.getElementById("overflow-menu");

  const positionPopover = (btn: HTMLElement, menu: HTMLElement) => {
    const rect = btn.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    if (menu.id === "overflow-menu") {
      menu.style.right = `${window.innerWidth - rect.right}px`;
      menu.style.left = "auto";
    } else {
      menu.style.left = `${rect.left}px`;
      menu.style.right = "auto";
    }
  };

  if (layersBtn) {
    layersBtn.addEventListener("click", () => {
      positionPopover(layersBtn, layerBox);
      // Fallback si el navegador no soporta popover nativo
      if (!("popover" in HTMLElement.prototype)) {
        overflowMenu?.classList.remove("popover-open");
        layerBox.classList.toggle("popover-open");
      }
    });
  }
  if (overflowBtn && overflowMenu) {
    overflowBtn.addEventListener("click", () => {
      positionPopover(overflowBtn, overflowMenu);
      // Fallback si el navegador no soporta popover nativo
      if (!("popover" in HTMLElement.prototype)) {
        layerBox.classList.remove("popover-open");
        overflowMenu.classList.toggle("popover-open");
      }
    });
  }
  if (!("popover" in HTMLElement.prototype)) {
    document.addEventListener("click", (e) => {
      const target = e.target as Node;
      if (!layerBox.contains(target) && !layersBtn?.contains(target)) {
        layerBox.classList.remove("popover-open");
      }
      if (!overflowMenu?.contains(target) && !overflowBtn?.contains(target)) {
        overflowMenu?.classList.remove("popover-open");
      }
    });
  }

  const radarToggle = document.getElementById("radar-toggle") as HTMLInputElement | null;
  const minimapWrap = document.getElementById("minimap-wrap");
  if (radarToggle && minimapWrap) {
    radarToggle.addEventListener("change", () => {
      minimapWrap.style.display = radarToggle.checked ? "flex" : "none";
    });
  }

  // --- Minimapa Radar de Navegación ---
  const minimapCanvas = document.getElementById("minimap-canvas") as HTMLCanvasElement | null;
  const minimapBox = document.getElementById("minimap-viewbox");
  const minimapCanvasWrap = document.getElementById("minimap-canvas-wrap");
  if (minimapCanvas && minimapBox && minimapCanvasWrap && index) {
    const mctx = minimapCanvas.getContext("2d")!;
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;
    const worldW = index.world.width;
    const worldH = index.world.height;
    const scaleX = mw / worldW;
    const scaleY = mh / worldH;

    // Dibujar silueta de mapas de Kanto en el minimapa
    mctx.fillStyle = "#18181b";
    mctx.fillRect(0, 0, mw, mh);
    mctx.fillStyle = "#065f46"; // Tierras / rutas
    for (const m of Object.values(index.maps)) {
      const rx = (m.x - minX) * scaleX;
      const ry = (m.y - minY) * scaleY;
      const rw = Math.max(1, m.width * scaleX);
      const rh = Math.max(1, m.height * scaleY);
      mctx.fillRect(rx, ry, rw, rh);
    }

    const playerDot = document.getElementById("minimap-player-dot");
    const updateRadar = () => {
      const worldPxW = worldW * TILE;
      const worldPxH = worldH * TILE;
      const vx = (viewport.scrollLeft / zoom) / worldPxW;
      const vy = (viewport.scrollTop / zoom) / worldPxH;
      const vw = (viewport.clientWidth / zoom) / worldPxW;
      const vh = (viewport.clientHeight / zoom) / worldPxH;

      minimapBox.style.left = `${Math.max(0, Math.min(mw, vx * mw))}px`;
      minimapBox.style.top = `${Math.max(0, Math.min(mh, vy * mh))}px`;
      minimapBox.style.width = `${Math.max(4, Math.min(mw, vw * mw))}px`;
      minimapBox.style.height = `${Math.max(4, Math.min(mh, vh * mh))}px`;

      if (playerDot) {
        if (playerActive) {
          playerDot.style.display = "block";
          const px = (playerX - minX) * scaleX;
          const py = (playerY - minY) * scaleY;
          playerDot.style.left = `${px}px`;
          playerDot.style.top = `${py}px`;
        } else {
          playerDot.style.display = "none";
        }
      }
    };

    viewport.addEventListener("scroll", updateRadar);
    updateRadar();

    // Click o arrastrar en minimapa para teletransportarse
    const navigateMini = (e: MouseEvent) => {
      const rect = minimapCanvasWrap.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) / rect.width;
      const clickY = (e.clientY - rect.top) / rect.height;
      viewport.scrollLeft = clickX * (worldW * TILE) * zoom - viewport.clientWidth / 2;
      viewport.scrollTop = clickY * (worldH * TILE) * zoom - viewport.clientHeight / 2;
      writeHash();
      updateRadar();
    };
    let miniDragging = false;
    minimapCanvasWrap.addEventListener("mousedown", (e) => {
      miniDragging = true;
      navigateMini(e);
    });
    window.addEventListener("mousemove", (e) => {
      if (miniDragging) navigateMini(e);
    });
    window.addEventListener("mouseup", () => {
      miniDragging = false;
    });
  }

  const panelToggle = document.getElementById("panel-toggle");
  if (panelToggle) {
    panelToggle.addEventListener("click", () => {
      panel.classList.toggle("collapsed");
    });
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

  // --- Inicialización y Lógica del Modo Exploración con Avatar ---
  // --- Inicialización y Lógica del Modo Exploración con Avatar ---
  playerEl = document.getElementById("player-sprite");

  function getSpriteSheet(): string {
    const isLeaf = playerChar === "leaf";
    if (playerMode === "bike") return isLeaf ? "/fr/objects/greenbike__player.png" : "/fr/objects/redbike__player.png";
    if (playerMode === "surf") return isLeaf ? "/fr/objects/greensurfrun__player.png" : "/fr/objects/redsurfrun__player.png";
    if (playerRunning && playerMoving) return isLeaf ? "/fr/objects/greensurfrun__player.png" : "/fr/objects/redsurfrun__player.png";
    return isLeaf ? "/fr/objects/greennormal__player.png" : "/fr/objects/rednormal__player.png";
  }

  function loadPlayerSprite(): void {
    playerSpriteImg = new Image();
    playerSpriteImg.src = getSpriteSheet();
    playerSpriteImg.onload = () => updatePlayerDisplay();
  }
  loadPlayerSprite();

  function updatePlayerDisplay(): void {
    if (!playerEl || !playerActive) return;
    const px = playerVisualX;
    const py = playerVisualY;

    // Dimensiones según vehículo: Bici = 32x32, a pie / surf = 16x32
    const isBike = playerMode === "bike";
    const spriteW = isBike ? 32 : 16;
    const spriteH = 32;

    playerEl.style.width = `${spriteW}px`;
    playerEl.style.height = `${spriteH}px`;
    playerEl.style.left = `${isBike ? px - 8 : px}px`;
    playerEl.style.top = `${py - 16}px`;
    playerEl.style.display = "block";

    let frameIdx = 0;
    let flip = false;
    if (isBike) {
      // redbike: 9 frames (32x32). 0: frente, 1: espalda, 2: perfil, 3..8: pedaleo
      if (playerDir === "south") frameIdx = playerMoving ? (playerStep % 2 === 0 ? 3 : 4) : 0;
      else if (playerDir === "north") frameIdx = playerMoving ? (playerStep % 2 === 0 ? 5 : 6) : 1;
      else if (playerDir === "west") frameIdx = playerMoving ? (playerStep % 2 === 0 ? 7 : 8) : 2;
      else if (playerDir === "east") { frameIdx = playerMoving ? (playerStep % 2 === 0 ? 7 : 8) : 2; flip = true; }
    } else if (playerMode === "surf") {
      // redsurfrun: frames 0..2 reposo/surf (0: sur, 1: norte, 2: oeste/este)
      if (playerDir === "south") frameIdx = 0;
      else if (playerDir === "north") frameIdx = 1;
      else if (playerDir === "west") frameIdx = 2;
      else if (playerDir === "east") { frameIdx = 2; flip = true; }
    } else if (playerRunning && playerMoving) {
      // Zapatillas de correr (redsurfrun/greensurfrun):
      // frames 3..4: Correr Sur, 5..6: Correr Norte, 7..8: Correr Perfil
      if (playerDir === "south") frameIdx = playerStep % 2 === 0 ? 3 : 4;
      else if (playerDir === "north") frameIdx = playerStep % 2 === 0 ? 5 : 6;
      else if (playerDir === "west") frameIdx = playerStep % 2 === 0 ? 7 : 8;
      else if (playerDir === "east") { frameIdx = playerStep % 2 === 0 ? 7 : 8; flip = true; }
    } else {
      // Normal: 0 frente, 1 espalda, 2 perfil, 3..8 pasos normales
      if (playerDir === "south") frameIdx = playerMoving ? (playerStep % 2 === 0 ? 3 : 4) : 0;
      else if (playerDir === "north") frameIdx = playerMoving ? (playerStep % 2 === 0 ? 5 : 6) : 1;
      else if (playerDir === "west") frameIdx = playerMoving ? (playerStep % 2 === 0 ? 7 : 8) : 2;
      else if (playerDir === "east") { frameIdx = playerMoving ? (playerStep % 2 === 0 ? 7 : 8) : 2; flip = true; }
    }

    playerEl.style.backgroundImage = `url(${getSpriteSheet()})`;
    playerEl.style.backgroundPosition = `-${frameIdx * spriteW}px 0px`;
    playerEl.style.transform = flip ? "scaleX(-1)" : "scaleX(1)";

    // Centrar cámara en el personaje durante exploración
    viewport.scrollLeft = (px + TILE / 2) * zoom - viewport.clientWidth / 2;
    viewport.scrollTop = (py + TILE / 2) * zoom - viewport.clientHeight / 2;
  }

  function startExploration(): void {
    playerActive = true;
    const btn = document.getElementById("player-btn");
    if (btn) {
      btn.style.background = "#0284c7";
      btn.textContent = "🚶 Explorando";
    }
    // Asegurar que las animaciones de tiles (agua, flores) estén encendidas para máxima inmersión
    if (!animOn) {
      animOn = true;
      const animBox = document.getElementById("anim-toggle") as HTMLInputElement | null;
      if (animBox) animBox.checked = true;
      animLast = fpsSince = animStartTime = performance.now();
      animAccumulator = 0;
      fpsFrames = 0;
      animFrame = requestAnimationFrame(tickAnimations);
    }
    // Ubicar en Pueblo Paleta por defecto si es inicio
    if (playerX === 0 && playerY === 0) {
      const paleta = index.maps["MAP_PALLET_TOWN"];
      if (paleta) {
        playerX = paleta.x + 8;
        playerY = paleta.y + 8;
      } else {
        playerX = minX + Math.floor(index.world.width / 2);
        playerY = minY + Math.floor(index.world.height / 2);
      }
    }
    playerVisualX = (playerX - minX) * TILE;
    playerVisualY = (playerY - minY) * TILE;
    updatePlayerDisplay();
  }

  function stopExploration(): void {
    playerActive = false;
    if (playerEl) playerEl.style.display = "none";
  }

  function setAppMode(nextMode: AppMode): void {
    appMode = nextMode;

    const modeViewerBtn = document.getElementById("mode-viewer-btn");
    const modeExploreBtn = document.getElementById("mode-explore-btn");
    const modeEditBtn = document.getElementById("mode-edit-btn");
    const editToolbar = document.getElementById("edit-toolbar");
    const bikeBtn = document.getElementById("bike-btn");
    const eyeBtn = document.getElementById("eyedropper-btn");

    modeViewerBtn?.classList.toggle("active-mode", appMode === "viewer");
    modeExploreBtn?.classList.toggle("active-mode", appMode === "explore");
    modeEditBtn?.classList.toggle("active-mode", appMode === "edit");

    viewport.classList.remove("mode-edit", "mode-eyedropper");
    eyedropperActive = false;
    eyeBtn?.classList.remove("active-mode");

    if (appMode === "explore") {
      if (editToolbar) editToolbar.style.display = "none";
      if (bikeBtn) bikeBtn.style.display = "inline-flex";
      startExploration();
    } else {
      stopExploration();
      if (bikeBtn) bikeBtn.style.display = "none";
      if (appMode === "edit") {
        if (editToolbar) editToolbar.style.display = "inline-flex";
        viewport.classList.add("mode-edit");
        updateBrushPreview();
      } else {
        if (editToolbar) editToolbar.style.display = "none";
      }
    }
  }

  const modeViewerBtn = document.getElementById("mode-viewer-btn");
  const modeExploreBtn = document.getElementById("mode-explore-btn");
  const modeEditBtn = document.getElementById("mode-edit-btn");
  const eyedropperBtn = document.getElementById("eyedropper-btn");

  modeViewerBtn?.addEventListener("click", () => setAppMode("viewer"));
  modeExploreBtn?.addEventListener("click", () => setAppMode("explore"));
  modeEditBtn?.addEventListener("click", () => setAppMode("edit"));

  eyedropperBtn?.addEventListener("click", () => {
    eyedropperActive = !eyedropperActive;
    eyedropperBtn.classList.toggle("active-mode", eyedropperActive);
    viewport.classList.toggle("mode-eyedropper", eyedropperActive);
  });

  // Botón Bici
  const bikeBtn = document.getElementById("bike-btn");
  function toggleBike(): void {
    if (playerMode === "surf") return; // No se puede usar bici en el agua
    playerMode = playerMode === "bike" ? "walk" : "bike";
    if (bikeBtn) {
      bikeBtn.style.background = playerMode === "bike" ? "#f59e0b" : "";
    }
    loadPlayerSprite();
  }
  if (bikeBtn) bikeBtn.addEventListener("click", toggleBike);

  // Teclado para controlar avatar (WASD / Flechas / Shift / B)
  const keysDown = new Set<string>();
  window.addEventListener("keydown", (e) => {
    if (document.activeElement === search) return;
    const key = e.key.toLowerCase();
    if (key === "b" && playerActive) {
      toggleBike();
      return;
    }
    if (key === "shift") {
      playerRunning = true;
    }
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
      if (playerActive) e.preventDefault();
      keysDown.add(key);
      processPlayerStep();
    }
  });

  window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    keysDown.delete(key);
    if (key === "shift") playerRunning = false;
    if (!["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].some((k) => keysDown.has(k))) {
      playerMoving = false;
      updatePlayerDisplay();
    }
  });

  let isStepping = false;
  function processPlayerStep(): void {
    if (!playerActive || isStepping) return;

    let dx = 0;
    let dy = 0;
    let targetDir = playerDir;
    if (keysDown.has("arrowup") || keysDown.has("w")) { dy = -1; targetDir = "north"; }
    else if (keysDown.has("arrowdown") || keysDown.has("s")) { dy = 1; targetDir = "south"; }
    else if (keysDown.has("arrowleft") || keysDown.has("a")) { dx = -1; targetDir = "west"; }
    else if (keysDown.has("arrowright") || keysDown.has("d")) { dx = 1; targetDir = "east"; }

    playerDir = targetDir;
    if (dx === 0 && dy === 0) return;

    let targetX = playerX + dx;
    let targetY = playerY + dy;

    // Comprobar si hay salto de saliente (Ledge jump)
    const ledge = ledgeDirection(playerX, playerY);
    let isLedgeJump = false;
    if (
      (ledge === 1 && dy === 1) ||  // Salto sur
      (ledge === 2 && dy === -1) || // Salto norte
      (ledge === 3 && dx === -1) || // Salto oeste
      (ledge === 4 && dx === 1)     // Salto este
    ) {
      targetX = playerX + dx * 2;
      targetY = playerY + dy * 2;
      isLedgeJump = true;
    }

    // Comprobar entrada a agua para activar surf automáticamente
    const targetIsWater = isWaterTile(targetX, targetY);
    if (targetIsWater && playerMode !== "surf") {
      playerMode = "surf";
      loadPlayerSprite();
    } else if (!targetIsWater && playerMode === "surf" && isWalkable(targetX, targetY, "walk")) {
      // Desembarcar de surf a tierra
      playerMode = "walk";
      loadPlayerSprite();
    }

    if (isLedgeJump || isWalkable(targetX, targetY, playerMode)) {
      isStepping = true;
      playerMoving = true;
      playerStep = (playerStep + 1) % 4;

      const startPxX = (playerX - minX) * TILE;
      const startPxY = (playerY - minY) * TILE;
      const destPxX = (targetX - minX) * TILE;
      const destPxY = (targetY - minY) * TILE;

      const duration = playerMode === "bike" ? 100 : playerRunning ? 120 : 160;
      const startTime = performance.now();

      const animateStep = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        playerVisualX = startPxX + (destPxX - startPxX) * t;
        playerVisualY = startPxY + (destPxY - startPxY) * t;

        // Salto con arco si es saliente
        if (isLedgeJump) {
          playerVisualY -= Math.sin(t * Math.PI) * 10;
        }

        updatePlayerDisplay();

        if (t < 1) {
          requestAnimationFrame(animateStep);
        } else {
          playerX = targetX;
          playerY = targetY;
          playerVisualX = destPxX;
          playerVisualY = destPxY;
          isStepping = false;
          if (keysDown.size > 0) {
            processPlayerStep();
          } else {
            playerMoving = false;
            updatePlayerDisplay();
          }
        }
      };
      requestAnimationFrame(animateStep);
    } else {
      playerMoving = false;
      updatePlayerDisplay();
    }
  }

  // Atajo de teclado '/' o '⌘K' para enfocar búsqueda
  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== search) {
      e.preventDefault();
      search.focus();
      search.select();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      search.focus();
      search.select();
    }
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
  const statusPos = document.getElementById("status-pos");
  viewport.addEventListener("pointermove", (ev) => {
    // Coordenadas en tiempo real para el status bar
    if (statusPos) {
      const rect = content.getBoundingClientRect();
      const worldPxX = (ev.clientX - rect.left) / zoom;
      const worldPxY = (ev.clientY - rect.top) / zoom;
      const curX = Math.floor(worldPxX / TILE) + minX;
      const curY = Math.floor(worldPxY / TILE) + minY;
      statusPos.innerHTML = `Cursor: <code>(${curX}, ${curY})</code>`;
    }

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
      // Trackpad de Mac: deslizar con dos dedos desplaza (scroll nativo del
      // viewport) y pellizcar hace zoom (el navegador lo envía con ctrlKey).
      // Rueda de ratón: zoom. Se distingue por el delta: la rueda avanza a saltos
      // (modo línea en Firefox; múltiplos de 120 en wheelDeltaY en Chrome/Safari) y
      // sin componente horizontal; el trackpad envía deltas pequeños y continuos.
      const legacy = (ev as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY ?? 0;
      const mouseWheel = ev.deltaMode === 1 || (ev.deltaX === 0 && legacy !== 0 && legacy % 120 === 0 && Math.abs(ev.deltaY) >= 50);
      // ⌘ + rueda (o deslizamiento) hace zoom siempre, por si el ratón no se reconoce.
      if (!ev.ctrlKey && !ev.metaKey && !mouseWheel) return;
      ev.preventDefault();
      const r = viewport.getBoundingClientRect();
      const factor = ev.ctrlKey ? Math.exp(-ev.deltaY * 0.01) : ev.deltaY > 0 ? 0.9 : 1.1;
      setZoom(zoom * factor, ev.clientX - r.left, ev.clientY - r.top);
    },
    { passive: false },
  );
  // El desplazamiento nativo (trackpad, barras) también guarda la posición en la URL.
  let hashPending = false;
  viewport.addEventListener("scroll", () => {
    if (hashPending) return;
    hashPending = true;
    setTimeout(() => {
      hashPending = false;
      writeHash();
    }, 200);
  });
  document.getElementById("zoom-in")!.addEventListener("click", () => setZoom(zoom * 1.25));
  document.getElementById("zoom-out")!.addEventListener("click", () => setZoom(zoom * 0.8));
}

build()
  .then(() => {
    setupUi();
    updateMeta();
  })
  .catch((err) => {
    panel.innerHTML = `<p>Error: ${String(err)}</p>`;
    throw err;
  });
