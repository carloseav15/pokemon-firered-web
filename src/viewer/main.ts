// Visor del mundo: 37 mapas exteriores de Kanto unidos (docs/VISOR-MUNDO.md).
// Navegación nativa sobre el lienzo de Kanto con avatar de jugador (Red/Leaf),
// colisiones, bici, surf, salientes, efectos de campo (hierba, agua, polvo, huellas de arena y bici),
// interacción y deambulación de NPCs, música ambiental dinámica (12 pistas BGM) y efectos de sonido (SE).

import { rom } from "../fr/rom";
import { TileRenderer } from "../fr/field/tileRenderer";
import { TilesetAnimator } from "../fr/field/tilesetAnimator";
import { ExtractMetatileAttribute, METATILE_ATTRIBUTE_BEHAVIOR, NUM_METATILES_IN_PRIMARY } from "../fr/field/fieldmap";
import * as MB from "../fr/generated/metatileBehavior";
import { TILE, LAYERS, LAYER_COLORS, LAYER_LABELS, type Layer, BIOME_NAMES } from "./constants";
import type { Element, KantoIndex, Trigger } from "./types";
import { state, type PlayerVehicle } from "./state";
import { fetchWorldIndex } from "./data/worldIndex";
import { WorldGrid } from "./data/worldGrid";
import { overlayCanvas, mark } from "./render/overlays";
import { renderWorldFill, type FillSource } from "./render/fill";
import { TileAnimationController, animRangesFor, rangeMask, type AnimatedMap } from "./render/tileAnim";
import { renderTilePanel, renderBiomePanel } from "./ui/panel";
import { setupSearch } from "./ui/search";
import { setupMinimap, type MinimapController } from "./ui/minimap";
import { setupPopovers } from "./ui/popover";
import { getPlayerSpriteSheet, type Direction, GFX_MAP } from "./render/sprites";
import { viewerClock, bindViewerClockVisibility } from "./clock";
import { ViewerFieldEffects } from "./fieldEffects";
import { installFieldFxRenderer } from "./render/fieldFx";
import { EntityManager, type LiveEntity } from "./render/entities";
import { DialogManager, type DialogSegment } from "./ui/dialog";
import { ViewerCamera } from "./camera";
import { ViewerAudioController } from "./audio/audioController";

const viewport = document.getElementById("viewport")!;
const content = document.getElementById("content")!;
const panel = document.getElementById("panel")!;
const searchInput = document.getElementById("search") as HTMLInputElement;
const searchResults = document.getElementById("search-results") as HTMLElement;
const layerBox = document.getElementById("layers-menu")!;
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const statusMeta = document.getElementById("status-meta");
const statusPos = document.getElementById("status-pos");

let index: KantoIndex;
let minX = 0;
let minY = 0;
let worldGrid: WorldGrid;
let fillSources = new Map<string, FillSource>();
let fillNearest: Int16Array | null = null;
let animController: TileAnimationController;
let minimapController: MinimapController | null = null;
let entityManager: EntityManager;
let dialogManager: DialogManager;
let fieldEffects: ViewerFieldEffects;
let cancelPlayerMotion: (() => void) | null = null;
function resetExploreSession(): void {
  cancelPlayerMotion?.();
  cancelPlayerMotion = null;
  isStepping = false;
  playerMoving = false;
  keysDown.clear();
  fieldEffects.resetSession();
}
const audioController = new ViewerAudioController();

const camera = new ViewerCamera(viewport, document.getElementById("world-stage")!, content);
let initialZoom = 1;
let selection: { x: number; y: number } | null = null;
let startX: number | null = null;
let startY: number | null = null;
let startExplore = false;
let startPlayer: { x: number; y: number } | null = null;

// --- Estado del Personaje Jugador en el Visor ---
let playerActive = false;
let playerMode: PlayerVehicle = "walk";
let playerX = 0; // coordenadas globales de mundo
let playerY = 0;
let playerVisualX = 0; // interpolación visual en píxeles del mundo
let playerVisualY = 0;
let playerDir: Direction = "south";
let playerStep = 0;
let playerMoving = false;
let playerRunning = false;
let isStepping = false;
const playerEl = document.getElementById("player-sprite");

function parseHash(): void {
  const h = new URLSearchParams(location.hash.slice(1));
  const x = Number(h.get("x"));
  const y = Number(h.get("y"));
  const z = Number(h.get("z"));
  startX = h.get("x") !== null && Number.isFinite(x) ? x : null;
  startY = h.get("y") !== null && Number.isFinite(y) ? y : null;
  if (z !== 0 && Number.isFinite(z)) initialZoom = Math.min(4, Math.max(0.25, Math.round(z * 1000) / 1000));
  const capas = h.get("capas");
  if (capas !== null) {
    state.activeLayers.clear();
    for (const c of capas.split(",")) {
      if ((LAYERS as readonly string[]).includes(c)) state.activeLayers.add(c as Layer);
    }
  }
  startExplore = h.get("modo") === "explore";
  const px = Number(h.get("px"));
  const py = Number(h.get("py"));
  if (h.has("px") && h.has("py") && Number.isSafeInteger(px) && Number.isSafeInteger(py)) startPlayer = { x: px, y: py };
  const sx = Number(h.get("sx"));
  const sy = Number(h.get("sy"));
  if (h.has("sx") && h.has("sy") && Number.isSafeInteger(sx) && Number.isSafeInteger(sy)) selection = { x: sx, y: sy };
  if (h.get("panel") === "closed") panel.classList.add("collapsed");
  const relleno = h.get("relleno");
  if (relleno === "full" || relleno === "dim" || relleno === "off") state.fillMode = relleno;
}

let hashTimeout: ReturnType<typeof setTimeout> | null = null;
function scheduleHashWrite(): void {
  if (hashTimeout !== null) return;
  hashTimeout = setTimeout(() => {
    hashTimeout = null;
    writeHash();
  }, 200);
}

function writeHash(): void {
  const h = new URLSearchParams();
  h.set("x", String(Math.round(viewport.scrollLeft)));
  h.set("y", String(Math.round(viewport.scrollTop)));
  h.set("z", String(camera.zoom));
  if (selection) {
    h.set("sx", String(selection.x));
    h.set("sy", String(selection.y));
  }
  if (panel.classList.contains("collapsed")) h.set("panel", "closed");
  h.set("modo", state.appMode);
  if (playerActive) {
    h.set("px", String(playerX));
    h.set("py", String(playerY));
  }
  h.set("capas", [...state.activeLayers].join(","));
  if (state.fillMode !== "full") h.set("relleno", state.fillMode);
  history.replaceState(null, "", `#${h.toString()}`);
}

function setZoom(next: number, ax = viewport.clientWidth / 2, ay = viewport.clientHeight / 2): void {
  camera.setZoom(next, ax, ay);
  minimapController?.updateRadar();
  scheduleHashWrite();
}

function applyFillMode(): void {
  const fillEl = content.querySelector(".fill") as HTMLElement | null;
  if (fillEl) {
    fillEl.classList.toggle("dimmed", state.fillMode === "dim");
    fillEl.classList.toggle("hidden", state.fillMode === "off");
  }
  const select = document.getElementById("fill-mode") as HTMLSelectElement | null;
  if (select && select.value !== state.fillMode) select.value = state.fillMode;
}

function applyLayerVisibility(): void {
  for (const layer of LAYERS) {
    const on = state.activeLayers.has(layer);
    content.querySelectorAll<HTMLElement>(`[data-layer="${layer}"]`).forEach((el) => {
      el.style.display = on ? "" : "none";
    });
    const box = document.getElementById(`layer-${layer}`) as HTMLInputElement | null;
    if (box) box.checked = on;
  }
}

function updateMeta(): void {
  if (!statusMeta) return;
  const base = `${Object.keys(index?.maps ?? {}).length || 37} mapas exteriores · Kanto GBA`;
  if (animController?.animOn) {
    const fpsText = animController.fpsValue > 0 ? ` · ${animController.fpsValue.toFixed(0)} FPS` : " · 60 FPS";
    statusMeta.textContent = `${base}${fpsText}`;
  } else {
    statusMeta.textContent = `${base}${animController?.animDisabledNotice ?? ""}`;
  }
}

function centerOnMap(id: string): boolean {
  const mapEl = content.querySelector<HTMLElement>(`[data-map="${id}"]`);
  const info = index.maps[id];
  if (!mapEl || !info) return false;
  viewport.scrollLeft = (mapEl.offsetLeft + (info.width * TILE) / 2) * camera.zoom - viewport.clientWidth / 2;
  viewport.scrollTop = (mapEl.offsetTop + (info.height * TILE) / 2) * camera.zoom - viewport.clientHeight / 2;
  minimapController?.updateRadar();
  checkCurrentMapMusic();
  scheduleHashWrite();
  return true;
}

function behaviorOf(primaryAttrs: Uint32Array, secondaryAttrs: Uint32Array, id: number): number {
  const raw = id < NUM_METATILES_IN_PRIMARY ? (primaryAttrs[id] ?? 0) : (secondaryAttrs[id - NUM_METATILES_IN_PRIMARY] ?? 0);
  return ExtractMetatileAttribute(raw, METATILE_ATTRIBUTE_BEHAVIOR);
}

function findMapAt(gx: number, gy: number): [string, KantoIndex["maps"][string]] | undefined {
  if (!index) return undefined;
  return Object.entries(index.maps).find(
    ([, m]) => gx >= m.x && gx < m.x + m.width && gy >= m.y && gy < m.y + m.height
  );
}

function checkCurrentMapMusic(): void {
  if (!audioController.isEnabled()) return;
  const centerGx = Math.floor((viewport.scrollLeft / camera.zoom + viewport.clientWidth / (2 * camera.zoom)) / TILE) + minX;
  const centerGy = Math.floor((viewport.scrollTop / camera.zoom + viewport.clientHeight / (2 * camera.zoom)) / TILE) + minY;
  const curGx = playerActive ? playerX : centerGx;
  const curGy = playerActive ? playerY : centerGy;

  const found = findMapAt(curGx, curGy);
  if (found) {
    const [mapId, m] = found;
    audioController.updateMap(mapId, m.music);
  }
}

// --- Lógica del Avatar del Jugador ---

function updatePlayerDisplay(): void {
  if (!playerEl || !playerActive) return;
  const px = playerVisualX;
  const py = playerVisualY;

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
    if (playerDir === "south") frameIdx = playerMoving ? (playerStep % 2 === 0 ? 3 : 4) : 0;
    else if (playerDir === "north") frameIdx = playerMoving ? (playerStep % 2 === 0 ? 5 : 6) : 1;
    else if (playerDir === "west") frameIdx = playerMoving ? (playerStep % 2 === 0 ? 7 : 8) : 2;
    else if (playerDir === "east") {
      frameIdx = playerMoving ? (playerStep % 2 === 0 ? 7 : 8) : 2;
      flip = true;
    }
  } else if (playerMode === "surf") {
    if (playerDir === "south") frameIdx = 0;
    else if (playerDir === "north") frameIdx = 1;
    else if (playerDir === "west") frameIdx = 2;
    else if (playerDir === "east") {
      frameIdx = 2;
      flip = true;
    }
  } else if (playerRunning && playerMoving) {
    if (playerDir === "south") frameIdx = playerStep % 2 === 0 ? 3 : 4;
    else if (playerDir === "north") frameIdx = playerStep % 2 === 0 ? 5 : 6;
    else if (playerDir === "west") frameIdx = playerStep % 2 === 0 ? 7 : 8;
    else if (playerDir === "east") {
      frameIdx = playerStep % 2 === 0 ? 7 : 8;
      flip = true;
    }
  } else {
    if (playerDir === "south") frameIdx = playerMoving ? (playerStep % 2 === 0 ? 3 : 4) : 0;
    else if (playerDir === "north") frameIdx = playerMoving ? (playerStep % 2 === 0 ? 5 : 6) : 1;
    else if (playerDir === "west") frameIdx = playerMoving ? (playerStep % 2 === 0 ? 7 : 8) : 2;
    else if (playerDir === "east") {
      frameIdx = playerMoving ? (playerStep % 2 === 0 ? 7 : 8) : 2;
      flip = true;
    }
  }

  const inGrass = worldGrid.isGrassTile(playerX, playerY) && playerMode !== "surf" && !isBike;
  playerEl.style.clipPath = inGrass ? "inset(0 0 4px 0)" : "none";

  const spriteSheet = getPlayerSpriteSheet(state.playerChar, playerMode, playerRunning && playerMoving);
  playerEl.style.backgroundImage = `url(${spriteSheet})`;
  playerEl.style.backgroundPosition = `-${frameIdx * spriteW}px 0px`;
  playerEl.style.transform = flip ? "scaleX(-1)" : "scaleX(1)";

  viewport.scrollLeft = (px + TILE / 2) * camera.zoom - viewport.clientWidth / 2;
  viewport.scrollTop = (py + TILE / 2) * camera.zoom - viewport.clientHeight / 2;
  minimapController?.updateRadar();

  updateEntitiesView();
  checkCurrentMapMusic();
  scheduleHashWrite();
}

function updateEntitiesView(): void {
  if (!playerActive) {
    entityManager.hideAll();
    return;
  }
  const viewLeft = viewport.scrollLeft / camera.zoom - 64;
  const viewTop = viewport.scrollTop / camera.zoom - 64;
  const viewRight = viewLeft + viewport.clientWidth / camera.zoom + 128;
  const viewBottom = viewTop + viewport.clientHeight / camera.zoom + 128;

  entityManager.updateVisibility(viewLeft, viewTop, viewRight, viewBottom, (ent) => {
    interactWithEntity(ent);
  });
}

function interactWithEntity(ent: LiveEntity): void {
  audioController.playSelect();
  entityManager.faceTowards(ent, playerX, playerY);

  const title = ent.element.trainer ? `${ent.element.trainer}` : `${ent.element.map.replace("MAP_", "")}`;
  let msg: DialogSegment[] = [""];
  if (ent.element.layer === "snorlax") {
    msg = ["¡Un enorme Pokémon duerme plácidamente en medio del camino! Está bloqueando el paso... Necesitas una Poké Flauta."];
  } else if (ent.element.layer === "corte") {
    msg = ["¡Un árbol pequeño bloquea el paso! Un Pokémon podría cortarlo con la MO Corte."];
  } else if (ent.element.graphics === "OBJ_EVENT_GFX_ITEM_BALL") {
    msg = [`¡Has encontrado un objeto en el suelo! (${ent.element.flag ?? "Objeto misterioso"}).`];
  } else if (ent.element.trainer) {
    msg = [
      "¡El entrenador ",
      { text: ent.element.trainer, strong: true },
      ` te reta a un combate Pokémon! Rango de visión: ${ent.element.trainerRange ?? 1} casillas.`,
    ];
  } else {
    msg = ["Hola viajero. Bienvenido a las rutas de Kanto. ¿Estás listo para convertirte en el campeón de la Liga Pokémon?"];
  }
  dialogManager.show(title, msg);
}

function checkTrainerSight(): void {
  for (const ent of entityManager.entities) {
    if (!ent.element.trainer || ent.defeated) continue;
    const r = ent.element.trainerRange ?? 0;
    if (r <= 0) continue;

    let inSight = false;
    if (ent.dir === "south" && playerX === ent.gx && playerY > ent.gy && playerY <= ent.gy + r) inSight = true;
    else if (ent.dir === "north" && playerX === ent.gx && playerY < ent.gy && playerY >= ent.gy - r) inSight = true;
    else if (ent.dir === "west" && playerY === ent.gy && playerX < ent.gx && playerX >= ent.gx - r) inSight = true;
    else if (ent.dir === "east" && playerY === ent.gy && playerX > ent.gx && playerX <= ent.gx + r) inSight = true;

    if (inSight) {
      audioController.playExclamation();
      entityManager.showAlert(ent);
      interactWithEntity(ent);
      break;
    }
  }
}

function startExploration(targetGx?: number, targetGy?: number): void {
  resetExploreSession();
  playerActive = true;
  state.appMode = "explore";

  const modeViewerBtn = document.getElementById("mode-viewer-btn");
  const modeExploreBtn = document.getElementById("mode-explore-btn");
  const bikeBtn = document.getElementById("bike-btn");
  modeViewerBtn?.classList.remove("active-mode");
  modeExploreBtn?.classList.add("active-mode");
  if (bikeBtn) bikeBtn.style.display = "inline-flex";

  if (!animController.animOn) {
    animController.start();
    const animBox = document.getElementById("anim-toggle") as HTMLInputElement | null;
    if (animBox) animBox.checked = true;
    updateMeta();
  }

  if (targetGx !== undefined && targetGy !== undefined) {
    playerX = targetGx;
    playerY = targetGy;
  } else if (playerX === 0 && playerY === 0) {
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
  checkCurrentMapMusic();
  fieldEffects.onGroundStep("spawn", { x: playerX, y: playerY, previousX: playerX, previousY: playerY, direction: playerDir, previousDirection: playerDir, landingJump: false });
}

function stopExploration(): void {
  resetExploreSession();
  playerActive = false;
  keysDown.clear();
  playerRunning = false;
  state.appMode = "viewer";

  const modeViewerBtn = document.getElementById("mode-viewer-btn");
  const modeExploreBtn = document.getElementById("mode-explore-btn");
  const bikeBtn = document.getElementById("bike-btn");
  modeViewerBtn?.classList.add("active-mode");
  modeExploreBtn?.classList.remove("active-mode");
  if (bikeBtn) bikeBtn.style.display = "none";

  if (playerEl) playerEl.style.display = "none";
  entityManager.hideAll();
  dialogManager.close();
  minimapController?.updateRadar();
  scheduleHashWrite();
}

function toggleBike(): void {
  if (playerMode === "surf") return;
  playerMode = playerMode === "bike" ? "walk" : "bike";
  const bikeBtn = document.getElementById("bike-btn");
  if (bikeBtn) {
    bikeBtn.style.background = playerMode === "bike" ? "#f59e0b" : "";
  }
  if (playerMode === "bike") {
    audioController.playBikeBell();
  }
  updatePlayerDisplay();
}

const keysDown = new Set<string>();

function processPlayerStep(): void {
  if (!playerActive || isStepping || dialogManager.isOpen()) return;

  let dx = 0;
  let dy = 0;
  let targetDir = playerDir;
  if (keysDown.has("arrowup") || keysDown.has("w")) {
    dy = -1;
    targetDir = "north";
  } else if (keysDown.has("arrowdown") || keysDown.has("s")) {
    dy = 1;
    targetDir = "south";
  } else if (keysDown.has("arrowleft") || keysDown.has("a")) {
    dx = -1;
    targetDir = "west";
  } else if (keysDown.has("arrowright") || keysDown.has("d")) {
    dx = 1;
    targetDir = "east";
  }

  const previousDirection = playerDir;
  playerDir = targetDir;
  if (dx === 0 && dy === 0) return;

  let targetX = playerX + dx;
  let targetY = playerY + dy;

  const ledge = worldGrid.ledgeDirection(playerX, playerY);
  let isLedgeJump = false;
  if (
    (ledge === 1 && dy === 1) ||
    (ledge === 2 && dy === -1) ||
    (ledge === 3 && dx === -1) ||
    (ledge === 4 && dx === 1)
  ) {
    targetX = playerX + dx * 2;
    targetY = playerY + dy * 2;
    isLedgeJump = true;
  }

  const targetIsWater = worldGrid.isWaterTile(targetX, targetY);
  if (targetIsWater && playerMode !== "surf") {
    playerMode = "surf";
  } else if (!targetIsWater && playerMode === "surf" && worldGrid.isWalkable(targetX, targetY, "walk")) {
    playerMode = "walk";
  }

  if (isLedgeJump || worldGrid.isWalkable(targetX, targetY, playerMode)) {
    isStepping = true;
    playerMoving = true;
    playerStep = (playerStep + 1) % 4;

    const startPxX = (playerX - minX) * TILE;
    const startPxY = (playerY - minY) * TILE;
    const destPxX = (targetX - minX) * TILE;
    const destPxY = (targetY - minY) * TILE;

    if (isLedgeJump) {
      audioController.playLedgeJump();
    }

    const groundActor = { x: targetX, y: targetY, previousX: playerX, previousY: playerY,
      direction: playerDir, previousDirection, landingJump: isLedgeJump, vehicle: playerMode };
    fieldEffects.onGroundStep("begin", groundActor);

    const duration = playerMode === "bike" ? 100 : playerRunning ? 120 : 160;
    const startTime = viewerClock.elapsedMs;

    const animateStep = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      playerVisualX = startPxX + (destPxX - startPxX) * t;
      playerVisualY = startPxY + (destPxY - startPxY) * t;

      if (isLedgeJump) {
        playerVisualY -= Math.sin(t * Math.PI) * 12;
      }

      updatePlayerDisplay();

      if (t >= 1) {
        cancelPlayerMotion?.();
        cancelPlayerMotion = null;
        playerX = targetX;
        playerY = targetY;
        playerVisualX = destPxX;
        playerVisualY = destPxY;
        isStepping = false;

        fieldEffects.onGroundStep("finish", groundActor);

        checkTrainerSight();

        if (keysDown.size > 0 && !dialogManager.isOpen()) {
          processPlayerStep();
        } else {
          playerMoving = false;
          updatePlayerDisplay();
        }
      }
    };
    cancelPlayerMotion = viewerClock.subscribe(frame => animateStep(frame.elapsedMs));
  } else {
    if (!isStepping) {
      isStepping = true;
      playerMoving = true;
      audioController.playWallBump();
      playerStep = (playerStep + 1) % 4;
      const basePxX = (playerX - minX) * TILE;
      const basePxY = (playerY - minY) * TILE;
      const bumpDist = 3;
      const bumpDuration = 90;
      const bumpStartTime = viewerClock.elapsedMs;

      const animateBump = (now: number) => {
        const elapsed = now - bumpStartTime;
        const t = Math.min(1, elapsed / bumpDuration);
        const offset = Math.sin(t * Math.PI) * bumpDist;
        playerVisualX = basePxX + dx * offset;
        playerVisualY = basePxY + dy * offset;
        updatePlayerDisplay();

        if (t >= 1) {
          cancelPlayerMotion?.();
          cancelPlayerMotion = null;
          playerVisualX = basePxX;
          playerVisualY = basePxY;
          isStepping = false;
          playerMoving = false;
          updatePlayerDisplay();
        }
      };
      cancelPlayerMotion = viewerClock.subscribe(frame => animateBump(frame.elapsedMs));
    }
  }
}

function showAt(worldX: number, worldY: number): void {
  const cellX = Math.floor(worldX / TILE);
  const cellY = Math.floor(worldY / TILE);
  if (cellX < 0 || cellY < 0 || cellX >= index.world.width || cellY >= index.world.height) {
    return;
  }
  const selBox = document.getElementById("selection-box");
  if (selBox) {
    selBox.style.display = "block";
    selBox.style.left = `${cellX * TILE}px`;
    selBox.style.top = `${cellY * TILE}px`;
    selBox.style.width = `${TILE}px`;
    selBox.style.height = `${TILE}px`;
  }

  selection = { x: cellX + minX, y: cellY + minY };
  scheduleHashWrite();

  const mx = cellX + minX;
  const my = cellY + minY;

  const entry = findMapAt(mx, my);
  if (!entry) {
    const fx = mx - minX;
    const fy = my - minY;
    const biomeIdx = fillNearest && fx >= 0 && fy >= 0 && fx < index.world.width && fy < index.world.height ? fillNearest[fy * index.world.width + fx]! : -1;
    renderBiomePanel(panel, biomeIdx, mx, my);
    return;
  }

  const [id, m] = entry;
  const lx = mx - m.x;
  const ly = my - m.y;
  const els = index.elements.filter((e) => e.map === id && e.x === lx && e.y === ly);
  const trs = index.triggers.filter((t) => t.map === id && t.x === lx && t.y === ly);

  renderTilePanel(panel, index, id, lx, ly, mx, my, els, trs, () => {
    startExploration(mx, my);
  }, centerOnMap);
}

async function build(): Promise<void> {
  state.loadStored();
  parseHash();

  if (loadingText) loadingText.textContent = "Descargando índice cartográfico de Kanto…";
  const worldData = await fetchWorldIndex();
  index = worldData.index;
  minX = worldData.minX;
  minY = worldData.minY;

  worldGrid = new WorldGrid(index.world.width, index.world.height, minX, minY);
  entityManager = new EntityManager(content, minX, minY);
  dialogManager = new DialogManager();
  fieldEffects = await ViewerFieldEffects.create(worldGrid, viewerClock);
  const disposeEffects = installFieldFxRenderer(fieldEffects, content, minX, minY);
  const unbindVisibility = bindViewerClockVisibility();
  const unsubscribeSimulation = viewerClock.subscribe(frame => {
    audioController.frame();
    if (playerActive) entityManager.updateAutonomousBehaviors(frame.elapsedMs, playerX, playerY);
  });
  window.addEventListener("pagehide", event => {
    if (event.persisted) { viewerClock.pause("pagehide"); return; }
    resetExploreSession(); disposeEffects(); unbindVisibility(); unsubscribeSimulation(); animController?.stop();
  });
  window.addEventListener("pageshow", () => viewerClock.resume("pagehide"));

  const byPair = new Map<string, string[]>();
  const layoutsByMap = new Map<string, Awaited<ReturnType<typeof rom.loadLayout>>>();

  if (loadingText) loadingText.textContent = "Cargando layouts de mapas…";
  const mapEntries = Object.entries(index.maps);
  const loadedLayouts = await Promise.all(
    mapEntries.map(async ([id, m]) => {
      const layout = await rom.loadLayout(m.layout);
      return { id, layout };
    })
  );

  for (const { id, layout } of loadedLayouts) {
    layoutsByMap.set(id, layout);
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

  animController = new TileAnimationController(
    () => ({
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
      width: viewport.clientWidth,
      height: viewport.clientHeight,
      zoom: camera.zoom,
    }),
    () => updateMeta(),
    viewerClock
  );

  let processedCount = 0;
  for (const ids of byPair.values()) {
    for (const id of ids) {
      const info = index.maps[id];
      const layout = layoutsByMap.get(id)!;
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
          const isGrass =
            MB.MetatileBehavior_IsPokeGrass(beh) ||
            MB.MetatileBehavior_IsTallGrass(beh) ||
            MB.MetatileBehavior_IsLongGrass(beh);
          const isSand = MB.MetatileBehavior_IsSand(beh) || MB.MetatileBehavior_IsSandOrShallowFlowingWater(beh);
          if (isWater) mark(ctxFor("agua"), x, y, LAYER_COLORS.agua);

          const gwx = info.x + x;
          const gwy = info.y + y;
          if (worldGrid.inBounds(gwx, gwy)) {
            const idx = worldGrid.idx(gwx, gwy);
            worldGrid.behaviors[idx] = beh;
            worldGrid.solid[idx] = hasCollision ? 1 : 0;
            if (isWater) worldGrid.water[idx] = 1;
            if (isGrass) worldGrid.grass[idx] = 1;
            if (isSand) worldGrid.sand[idx] = 1;
            worldGrid.metatiles[idx] = mt;
          }

          let arrow: string | undefined;
          let ledgeVal = 0;
          if (MB.MetatileBehavior_IsJumpEast(beh)) {
            arrow = "E";
            ledgeVal = 4;
          } else if (MB.MetatileBehavior_IsJumpWest(beh)) {
            arrow = "W";
            ledgeVal = 3;
          } else if (MB.MetatileBehavior_IsJumpSouth(beh)) {
            arrow = "S";
            ledgeVal = 1;
          } else if (MB.MetatileBehavior_IsJumpNorth(beh)) {
            arrow = "N";
            ledgeVal = 2;
          }
          if (arrow) {
            mark(ctxFor("salientes"), x, y, LAYER_COLORS.salientes, arrow);
            if (worldGrid.inBounds(gwx, gwy)) {
              worldGrid.ledge[worldGrid.idx(gwx, gwy)] = ledgeVal;
            }
          }
        }
      }

      for (const e of elementsByMap.get(id) ?? []) {
        const egwx = info.x + e.x;
        const egwy = info.y + e.y;
        const isSolidEntity = e.layer !== "puerta" && e.layer !== "activador";
        if (isSolidEntity && worldGrid.inBounds(egwx, egwy)) {
          worldGrid.npc[worldGrid.idx(egwx, egwy)] = 1;

          let dir: Direction = "south";
          if (e.direction === "up") dir = "north";
          else if (e.direction === "down") dir = "south";
          else if (e.direction === "left") dir = "west";
          else if (e.direction === "right") dir = "east";

          entityManager.addEntity(e, egwx, egwy, dir);
        }

        if (e.layer === "puerta") {
          mark(ctxFor("puerta"), e.x, e.y, LAYER_COLORS.puerta);
        } else if (e.layer === "entrenador") {
          const ctx = ctxFor("entrenador");
          const r = e.trainerRange ?? 0;
          const dir =
            e.direction === "up" || e.direction === "down" || e.direction === "left" || e.direction === "right"
              ? e.direction
              : null;
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

      for (const t of triggersByMap.get(id) ?? []) {
        mark(ctxFor("activador"), t.x, t.y, LAYER_COLORS.activador);
      }

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
            renderer,
            bctx,
            cells,
            dirtyMask: 0,
            left: (info.x - minX) * TILE,
            top: (info.y - minY) * TILE,
            width: info.width * TILE,
            height: info.height * TILE,
            animator: undefined as unknown as TilesetAnimator,
          };
          entry.animator = new TilesetAnimator({
            primary,
            secondary,
            writeTiles(destTile: number, data: Uint8Array, count?: number) {
              renderer.writeTiles(destTile, data, count);
              const n = count ?? data.length / 32;
              ranges.forEach(([lo, hi], i) => {
                if (destTile < hi && destTile + n > lo) entry.dirtyMask |= 1 << i;
              });
            },
          });
          animController.addMap(entry);
        }
      }

      fillSources.set(id, { info, layout, renderer });
      content.appendChild(wrap);

      processedCount++;
      if (loadingText) loadingText.textContent = `Renderizando mapas (${processedCount}/${mapEntries.length})…`;
    }
  }

  const fillResult = renderWorldFill(index, minX, minY, fillSources, state.fillBiomeOverride);
  fillNearest = fillResult.nearest;
  content.prepend(fillResult.canvas);
  applyFillMode();

  const worldW = index.world.width * TILE;
  const worldH = index.world.height * TILE;
  camera.configure(worldW, worldH, initialZoom);
  if (selection) {
    if (selection.x < minX || selection.y < minY || selection.x >= minX + index.world.width || selection.y >= minY + index.world.height) selection = null;
    else showAt((selection.x - minX) * TILE, (selection.y - minY) * TILE);
  }

  if (startX !== null) viewport.scrollLeft = startX;
  if (startY !== null) viewport.scrollTop = startY;

  applyLayerVisibility();

  if (state.audio) {
    audioController.enable();
    checkCurrentMapMusic();
  }

  if (loadingOverlay) {
    loadingOverlay.classList.add("hidden");
    setTimeout(() => loadingOverlay.remove(), 400);
  }
}

function setupUi(): void {
  const animBox = document.getElementById("anim-toggle") as HTMLInputElement;
  if (animBox) {
    animBox.checked = false;
    animBox.addEventListener("change", () => {
      if (animBox.checked) animController.start();
      else animController.stop();
      updateMeta();
    });
  }

  const charSelect = document.getElementById("player-char") as HTMLSelectElement | null;
  if (charSelect) {
    charSelect.value = state.playerChar;
    charSelect.addEventListener("change", () => {
      state.playerChar = (charSelect.value as "red" | "leaf") || "red";
      state.saveStored();
      updatePlayerDisplay();
    });
  }

  const fillSelect = document.getElementById("fill-mode") as HTMLSelectElement | null;
  if (fillSelect) {
    fillSelect.value = state.fillMode;
    fillSelect.addEventListener("change", () => {
      state.fillMode = (fillSelect.value as "full" | "dim" | "off") || "full";
      applyFillMode();
      state.saveStored();
      scheduleHashWrite();
    });
  }

  const biomeSelect = document.getElementById("fill-biome") as HTMLSelectElement | null;
  if (biomeSelect) {
    biomeSelect.value = state.fillBiomeOverride;
    biomeSelect.addEventListener("change", () => {
      state.fillBiomeOverride = (biomeSelect.value as "auto" | "ocean" | "trees" | "mountain") || "auto";
      const oldCanvas = content.querySelector(".fill");
      oldCanvas?.remove();
      const fillResult = renderWorldFill(index, minX, minY, fillSources, state.fillBiomeOverride);
      fillNearest = fillResult.nearest;
      content.prepend(fillResult.canvas);
      applyFillMode();
      state.saveStored();
    });
  }

  const audioBtn = document.getElementById("audio-btn");
  const audioToggle = document.getElementById("audio-toggle") as HTMLInputElement | null;

  const updateAudioUi = () => {
    const on = audioController.isEnabled();
    if (audioBtn) {
      audioBtn.textContent = on ? "🔊 Audio" : "🔇 Audio";
      audioBtn.classList.toggle("active-mode", on);
    }
    if (audioToggle) {
      audioToggle.checked = on;
    }
  };

  const toggleAudio = () => {
    if (audioController.isEnabled()) {
      audioController.disable();
      state.audio = false;
    } else {
      audioController.enable();
      state.audio = audioController.isEnabled();
      if (audioController.lastError && statusMeta) statusMeta.textContent = audioController.lastError;
      checkCurrentMapMusic();
    }
    state.saveStored();
    updateAudioUi();
  };

  audioBtn?.addEventListener("click", toggleAudio);
  audioToggle?.addEventListener("change", toggleAudio);
  updateAudioUi();

  for (const layer of LAYERS) {
    const label = document.createElement("label");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = LAYER_COLORS[layer];
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = `layer-${layer}`;
    box.checked = state.activeLayers.has(layer);
    box.addEventListener("change", () => {
      if (box.checked) state.activeLayers.add(layer);
      else state.activeLayers.delete(layer);
      applyLayerVisibility();
      state.saveStored();
      scheduleHashWrite();
      updateLayersBtnText();
    });
    label.append(box, swatch, ` ${LAYER_LABELS[layer] ?? layer}`);
    layerBox.appendChild(label);
  }

  const updateLayersBtnText = () => {
    const btn = document.getElementById("layers-btn");
    if (btn) btn.textContent = `Capas (${state.activeLayers.size}/${LAYERS.length}) ▾`;
  };
  updateLayersBtnText();

  document.getElementById("layers-all")?.addEventListener("click", () => {
    for (const l of LAYERS) state.activeLayers.add(l as Layer);
    for (const l of LAYERS) {
      const b = document.getElementById(`layer-${l}`) as HTMLInputElement | null;
      if (b) b.checked = true;
    }
    applyLayerVisibility();
    state.saveStored();
    scheduleHashWrite();
    updateLayersBtnText();
  });

  document.getElementById("layers-none")?.addEventListener("click", () => {
    state.activeLayers.clear();
    for (const l of LAYERS) {
      const b = document.getElementById(`layer-${l}`) as HTMLInputElement | null;
      if (b) b.checked = false;
    }
    applyLayerVisibility();
    state.saveStored();
    scheduleHashWrite();
    updateLayersBtnText();
  });

  setupPopovers(
    document.getElementById("layers-btn"),
    layerBox,
    document.getElementById("overflow-btn"),
    document.getElementById("overflow-menu")
  );

  minimapController = setupMinimap(
    index,
    minX,
    minY,
    viewport,
    () => camera.zoom,
    () => {
      checkCurrentMapMusic();
      scheduleHashWrite();
    },
    () => ({ active: playerActive, x: playerX, y: playerY })
  );

  const radarToggle = document.getElementById("radar-toggle") as HTMLInputElement | null;
  const minimapWrap = document.getElementById("minimap-wrap");
  if (radarToggle && minimapWrap) {
    radarToggle.checked = state.radar;
    minimapWrap.style.display = state.radar ? "flex" : "none";
    radarToggle.addEventListener("change", () => {
      state.radar = radarToggle.checked;
      minimapWrap.style.display = state.radar ? "flex" : "none";
      state.saveStored();
    });
  }

  const panelToggle = document.getElementById("panel-toggle");
  if (panelToggle) {
    panelToggle.addEventListener("click", () => {
      panel.classList.toggle("collapsed");
      scheduleHashWrite();
    });
  }

  setupSearch(index, searchInput, searchResults, (mapId) => {
    centerOnMap(mapId);
  });

  const modeViewerBtn = document.getElementById("mode-viewer-btn");
  const modeExploreBtn = document.getElementById("mode-explore-btn");
  const bikeBtn = document.getElementById("bike-btn");

  modeViewerBtn?.addEventListener("click", () => stopExploration());
  modeExploreBtn?.addEventListener("click", () => startExploration());
  bikeBtn?.addEventListener("click", () => toggleBike());

  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return;
    const key = e.key.toLowerCase();

    if (key === "m") {
      toggleAudio();
      return;
    }
    if (key === "b" && playerActive) {
      toggleBike();
      return;
    }
    if (key === "shift") {
      playerRunning = true;
    }
    if (key === " " || key === "enter" || key === "z") {
      if (dialogManager.isOpen()) {
        e.preventDefault();
        dialogManager.close();
        audioController.playSelect();
        return;
      } else if (playerActive) {
        e.preventDefault();
        let fx = playerX;
        let fy = playerY;
        if (playerDir === "north") fy--;
        else if (playerDir === "south") fy++;
        else if (playerDir === "west") fx--;
        else if (playerDir === "east") fx++;

        const frontEnt = entityManager.findAt(fx, fy);
        if (frontEnt) {
          interactWithEntity(frontEnt);
          return;
        }
      }
    }
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
      if (playerActive) e.preventDefault();
      if (dialogManager.isOpen()) dialogManager.close();
      keysDown.add(key);
      processPlayerStep();
    }
    if (e.key === "/" && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    if ((e.metaKey || e.ctrlKey) && key === "k") {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
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

  let dragX = 0;
  let dragY = 0;
  let activePointer: number | null = null;
  let originX = 0;
  let originY = 0;
  const cancelDrag = () => {
    const id = activePointer;
    activePointer = null;
    if (id !== null && viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    scheduleHashWrite();
  };
  window.addEventListener("blur", () => {
    keysDown.clear();
    playerRunning = false;
    playerMoving = false;
    cancelDrag();
  });
  viewport.addEventListener("pointercancel", (ev) => {
    if (ev.pointerId === activePointer) cancelDrag();
  });
  viewport.addEventListener("lostpointercapture", (ev) => {
    if (ev.pointerId === activePointer) cancelDrag();
  });
  let moved = false;
  viewport.addEventListener("pointerdown", (ev) => {
    if (!ev.isPrimary || ev.button !== 0 || activePointer !== null) return;
    activePointer = ev.pointerId;
    originX = ev.clientX;
    originY = ev.clientY;
    moved = false;
    dragX = ev.clientX;
    dragY = ev.clientY;
    viewport.setPointerCapture(ev.pointerId);
  });

  viewport.addEventListener("pointermove", (ev) => {
    if (statusPos) {
      const { x: worldPxX, y: worldPxY } = camera.clientToWorld(ev.clientX, ev.clientY);
      const curX = Math.floor(worldPxX / TILE) + minX;
      const curY = Math.floor(worldPxY / TILE) + minY;
      const code = statusPos.querySelector("code");
      if (code) {
        code.textContent = `(${curX}, ${curY})`;
      } else {
        statusPos.textContent = `Cursor: (${curX}, ${curY})`;
      }
    }

    if (ev.pointerId !== activePointer) return;
    const dx = ev.clientX - dragX;
    const dy = ev.clientY - dragY;
    if (Math.abs(ev.clientX - originX) + Math.abs(ev.clientY - originY) > 3) moved = true;
    viewport.scrollLeft -= dx;
    viewport.scrollTop -= dy;
    dragX = ev.clientX;
    dragY = ev.clientY;
    minimapController?.updateRadar();
    updateEntitiesView();
    checkCurrentMapMusic();
  });

  viewport.addEventListener("pointerup", (ev) => {
    if (ev.pointerId !== activePointer) return;
    cancelDrag();
    if (moved) {
      scheduleHashWrite();
      return;
    }
    const point = camera.clientToWorld(ev.clientX, ev.clientY);
    showAt(point.x, point.y);
  });

  viewport.addEventListener(
    "wheel",
    (ev) => {
      const legacy = (ev as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY ?? 0;
      const mouseWheel =
        ev.deltaMode === 1 || (ev.deltaX === 0 && legacy !== 0 && legacy % 120 === 0 && Math.abs(ev.deltaY) >= 50);
      if (!ev.ctrlKey && !ev.metaKey && !mouseWheel) return;
      ev.preventDefault();
      const r = viewport.getBoundingClientRect();
      const factor = ev.ctrlKey ? Math.exp(-ev.deltaY * 0.01) : ev.deltaY > 0 ? 0.9 : 1.1;
      setZoom(camera.zoom * factor, ev.clientX - r.left - viewport.clientLeft, ev.clientY - r.top - viewport.clientTop);
    },
    { passive: false }
  );

  viewport.addEventListener("scroll", () => {
    minimapController?.updateRadar();
    updateEntitiesView();
    checkCurrentMapMusic();
    scheduleHashWrite();
  });

  document.getElementById("zoom-in")!.addEventListener("click", () => setZoom(camera.zoom * 1.25));
  document.getElementById("zoom-out")!.addEventListener("click", () => setZoom(camera.zoom * 0.8));
}

build()
  .then(() => {
    setupUi();
    updateMeta();
    if (startExplore) {
      const valid = startPlayer && startPlayer.x >= minX && startPlayer.y >= minY
        && startPlayer.x < minX + index.world.width && startPlayer.y < minY + index.world.height;
      startExploration(valid ? startPlayer!.x : undefined, valid ? startPlayer!.y : undefined);
      if (startX !== null) viewport.scrollLeft = startX;
      if (startY !== null) viewport.scrollTop = startY;
    }
  })
  .catch((err) => {
    panel.innerHTML = `<p>Error al cargar el visor: ${String(err)}</p>`;
    if (loadingOverlay) loadingOverlay.remove();
    throw err;
  });
