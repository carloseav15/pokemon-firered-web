import { ferryDestination, ferryUrl } from "./regionTravel";
import { ViewerObjectSpawns, cloneElement } from "./data/objectSpawns";
import { readViewerTemplateState, savedViewerObjects, storeViewerObjects, type ViewerObjectState } from "./objectState";
import { initializeViewerSession, initDefinitiveViewerSession, saveViewerSession, viewerCheckpoint, initializeRegionalSession, continueRegionalSession, type NavigationSave } from "./session";
import { enterKanto, regionSessionFlags, reloadWorldSave, setRegionSessionFlags } from "./regionSave";
import { onWarpForRoamer } from "@core/pokemon/roamer";
import { enterViewerEventMap, restoreViewerEventMap, viewerEventMap } from "./mapEvents";
import { isViewerObjectPresent } from "./data/objectPresence";
import { EngineInteraction } from "./engineInteraction";
import type { HoennMapEntryReport } from "./hoennMapEntry";
import { flagClear, flagGet, flagSet, PlayTimeCounter_Start, PlayTimeCounter_Update, save as gameSave } from "@game/save";
import { ElevatorAnimation } from "@core/field/elevatorAnimation";
import { ElevatorMenu } from "./ui/elevator";
import { loadElevators, type ElevatorDefinition, type ElevatorChoice } from "./elevators";
import { ViewerForcedMovement } from "./forcedNavigation";
import { FallWarpAnimation, type FallObject } from "@core/field/fallWarpAnimation";
import { TeleportAnimation, type TeleportObject } from "@core/field/teleportAnimation";
import { EscalatorTiles, EscalatorWarpAnimation } from "@core/field/escalatorAnimation";
import { TaskManager } from "@core/gba/tasks";
import { ViewerDoorAnimation, ViewerWarpVisuals } from "./render/warpVisuals";
import * as C from "../games/firered/generated/constants";
import * as EmConstants from "../games/emerald/generated/constants";
import { FADE_FROM_BLACK, FADE_FROM_WHITE, FADE_TO_BLACK, FADE_TO_WHITE } from "@core/gba/fade";
import { MapTransitionIsEnter, MapTransitionIsExit, GetStairsMovementDirection } from "@core/field/mapTransitions";
import { AvatarDepth } from "./render/depth";
import { PlayerReflection } from "./render/reflection";
import { JumpShadow } from "./render/shadow";
import { SurfSupport } from "./render/surf";
// Visor del mundo: 37 mapas exteriores de Kanto unidos (docs/VISOR-MUNDO.md).
// Navegación nativa sobre el lienzo de Kanto con avatar de jugador (Red/Leaf),
// colisiones, bici, surf, salientes, efectos de campo (hierba, agua, polvo, huellas de arena y bici),
// interacción y deambulación de NPCs, música ambiental dinámica (12 pistas BGM) y efectos de sonido (SE).

import type { MapHeader, MapObjectTemplate, TilesetData } from "@core/rom";
import { NavigationWarps, warpAt, stepWarpBehavior, inputWarpBehavior, isWarpDoorBehavior, warpArrivalDirection, type WarpAddress } from "./navigation";
import { Rom, rom, setDataRoot } from "@core/rom";
import { TileRenderer } from "@core/field/tileRenderer";
import { TilesetAnimator } from "@core/field/tilesetAnimator";
import { MAP_OFFSET, ExtractMetatileAttribute, METATILE_ATTRIBUTE_BEHAVIOR, NUM_METATILES_IN_PRIMARY, SetTilesetProfile } from "@core/field/fieldmap";
import * as MB from "../games/firered/generated/metatileBehavior";
import * as MBEmerald from "../games/emerald/generated/metatileBehavior";
import * as EmeraldConstants from "../games/emerald/generated/constants";
import {
  HoennBikeSpeedTracker,
  HoennAcroBikeTracker,
  getCrackedFloorHoleMetatile,
  getHoleFallDestination,
  checkMuddySlopeMovement,
  isRailMetatile,
  checkRailMovement,
  isDiveableWater,
  isUnableToEmerge,
  getHoennDiveDestination,
  getHoennEmergeDestination,
  SootopolisGymIceTracker,
  METATILE_SootopolisGym_Ice_Broken,
  METATILE_SootopolisGym_Ice_Cracked,
  METATILE_SootopolisGym_Stairs,
  MossdeepGymTracker,
  HoennAshTracker,
  getShoalTide,
  getShoalCaveTideDestination,
  isCableCarStation,
  getCableCarDestination,
  FortreeGymRotatingGateTracker,
  MauvilleGymLaserTracker,
  isElectricBarrierMetatile,
  LavaridgeGymTracker,
  DewfordGymDarknessTracker,
  DEWFORD_GYM_LEADER,
  PetalburgGymDoorTracker,
  PETALBURG_GYM_LEADER,
} from "./hoennMechanics";
import {
  type CinematicHost,
  runSkyPillarRayquazaCinematic,
  runCaveOfOriginRumbleCinematic,
  runSootopolisClashCinematic,
} from "./hoennCinematics";
import { GBA_FRAME_MS, TILE, LAYERS, LAYER_COLORS, LAYER_LABELS, type Layer, BIOME_NAMES } from "./constants";
import type { Element, KantoIndex, Trigger } from "./types";
import { state, type PlayerVehicle } from "./state";
import { fetchWorldIndex, type WorldIndexData } from "./data/worldIndex";
import { WorldGrid } from "./data/worldGrid";
import { AvatarAnimator, type AvatarData, type AvatarAction } from "./render/avatar";
import { planStep } from "./movement";
import { cdata, hasCData, loadCData } from "@core/hw/assets";
import { SectorLoader, nearbySectors, type SectorResource } from "./data/sectors";
import { ExplorationUi } from "./ui/exploration";
import { SectorBorder } from "./render/sectorBorder";
import { overlayCanvas, mark } from "./render/overlays";
import { renderWorldFill, type FillSource } from "./render/fill";
import { TileAnimationController, animRangesFor, rangeMask, type AnimatedMap } from "./render/tileAnim";
import { renderTilePanel, renderBiomePanel } from "./ui/panel";
import { setupSearch } from "./ui/search";
import { InteriorViewer } from "./ui/interior";
import { setupMinimap, type MinimapController } from "./ui/minimap";
import { setupPopovers } from "./ui/popover";
import { getPlayerSpriteSheet, gfxInfoOf, fallbackGfx, type Direction, loadHoennGfx, spriteFolderOf } from "./render/sprites";
import { viewerClock, bindViewerClockVisibility } from "./clock";
import { ViewerFieldEffects } from "./fieldEffects";
import { installFieldFxRenderer } from "./render/fieldFx";
import { EntityManager, type LiveEntity } from "./render/entities";
import { DialogManager, type DialogSegment } from "./ui/dialog";
import { ViewerCamera } from "./camera";
import { ViewerAudioController } from "./audio/audioController";
import { MapNamePopup } from "./ui/mapPopup";
import { WeatherOverlay } from "./render/weatherOverlay";
import { getJohtoSign, formatSignTitle } from "./interaction/johtoSigns";
import { getJohtoDialogue, formatJohtoInteriorName } from "./interaction/johtoDialogues";
import { getJohtoItemInfo, getJohtoInspection } from "./interaction/johtoItems";
import { openJohtoMart, isMartClerk } from "./interaction/johtoMart";
import { getJohtoTrainerInfo, isJohtoTrainer } from "./interaction/johtoTrainers";
import { JOHTO_WILD_MONS } from "./audio/johtoWildMons";
import { calculatePPWithBonus, createMon, giveMonToPlayer, setDexFlag } from "@core/pokemon/pokemon";
import { addBagItem, addMoney } from "@core/pokemon/items";

// Juego del visor: Kanto (FireRed) por omisión; ?game=emerald abre Hoenn; ?game=hns o ?region=johto abre Johto (Heart & Soul).
type ViewerGame = "firered" | "emerald" | "hns";
const queryParams = new URLSearchParams(location.search);
const isHoennParam = queryParams.get("game") === "emerald" || queryParams.get("region") === "hoenn";
const isHnsParam = queryParams.get("game") === "hns" || queryParams.get("region") === "johto" || queryParams.get("region") === "hns";
const GAME: ViewerGame = isHnsParam ? "hns" : isHoennParam ? "emerald" : "firered";
const HOENN = isHoennParam;
const JOHTO = isHnsParam;
const GAME_NAME = JOHTO ? "Johto" : HOENN ? "Hoenn" : "Kanto";
if (HOENN) {
  setDataRoot("/emerald");
  SetTilesetProfile("emerald");
} else if (JOHTO) {
  setDataRoot("/hns");
  SetTilesetProfile("firered");
}

/** Predicados de comportamiento de metatile que usan las capas, según el juego. */
type BehaviorTests = {
  water: (b: number) => boolean;
  grass: (b: number) => boolean;
  sand: (b: number) => boolean;
  jumpEast: (b: number) => boolean;
  jumpWest: (b: number) => boolean;
  jumpSouth: (b: number) => boolean;
  jumpNorth: (b: number) => boolean;
};
const BEHAVIOR_TESTS: BehaviorTests = (HOENN || JOHTO)
  ? {
      water: MBEmerald.MetatileBehavior_IsSurfableWaterOrUnderwater,
      grass: (b) => MBEmerald.MetatileBehavior_IsPokeGrass(b) || MBEmerald.MetatileBehavior_IsTallGrass(b) || MBEmerald.MetatileBehavior_IsLongGrass(b),
      sand: MBEmerald.MetatileBehavior_IsSandOrDeepSand,
      jumpEast: MBEmerald.MetatileBehavior_IsJumpEast,
      jumpWest: MBEmerald.MetatileBehavior_IsJumpWest,
      jumpSouth: MBEmerald.MetatileBehavior_IsJumpSouth,
      jumpNorth: MBEmerald.MetatileBehavior_IsJumpNorth,
    }
  : {
      water: MB.MetatileBehavior_IsSurfable,
      grass: (b) => MB.MetatileBehavior_IsPokeGrass(b) || MB.MetatileBehavior_IsTallGrass(b) || MB.MetatileBehavior_IsLongGrass(b),
      sand: (b) => MB.MetatileBehavior_IsSand(b) || MB.MetatileBehavior_IsSandOrShallowFlowingWater(b),
      jumpEast: MB.MetatileBehavior_IsJumpEast,
      jumpWest: MB.MetatileBehavior_IsJumpWest,
      jumpSouth: MB.MetatileBehavior_IsJumpSouth,
      jumpNorth: MB.MetatileBehavior_IsJumpNorth,
    };

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
let exteriorWorld: WorldIndexData;
let navigationMap: string | null = null;
let warpBusy = false;
let elevatorBusy = false;
let elevatorMenu: ElevatorMenu;
let elevators: Record<string,ElevatorDefinition> = {};
let blockedArrival: string | null = null;
const mapHeaders = new Map<string, MapHeader>();
const navigationWarps = new NavigationWarps(async id => {
  const cached = mapHeaders.get(id);
  if (cached) return cached;
  const header = await new Rom().loadMap(id);
  mapHeaders.set(id, header);
  return header;
});
let changeNavigationWorld: (mapId: string) => Promise<void>;
const hoennBikeTracker = new HoennBikeSpeedTracker();
const hoennAcroBikeTracker = new HoennAcroBikeTracker();
const sootopolisGymTracker = new SootopolisGymIceTracker();
const mossdeepGymTracker = new MossdeepGymTracker();
const hoennAshTracker = new HoennAshTracker();
const fortreeGymTracker = new FortreeGymRotatingGateTracker();
const mauvilleGymTracker = new MauvilleGymLaserTracker();
const lavaridgeGymTracker = new LavaridgeGymTracker();
const dewfordGymTracker = new DewfordGymDarknessTracker();
const petalburgGymTracker = new PetalburgGymDoorTracker();
const hoennCinematicHost: CinematicHost = {
  get content() { return content; },
  get viewport() { return viewport; },
  get audio() { return audioController; },
  get dialog() { return dialogManager; },
  get entityManager() { return entityManager; },
  get camera() { return camera; },
  lockControls(locked: boolean) {
    playerActive = !locked;
    if (locked) {
      keysDown.clear();
      playerMoving = false;
      avatarAnimator?.stop(state.playerChar, playerMode, playerDir, viewerClock.tick);
      updatePlayerDisplay();
    }
  },
  updateEntitiesView() {
    updateEntitiesView();
  },
};

let minX = 0;
let minY = 0;
let worldGrid: WorldGrid;
let sectorLoader: SectorLoader | null = null;
let streaming = false;
let sectorBorder: SectorBorder | null = null;
function updateSectorBorder(): void {
  if (!sectorBorder || !playerActive) return;
  const current = findMapAt(playerX, playerY)?.[0];
  sectorBorder.draw(current ? fillSources.get(current) : undefined, {
    x: viewport.scrollLeft / camera.zoom, y: viewport.scrollTop / camera.zoom,
    width: viewport.clientWidth / camera.zoom, height: viewport.clientHeight / camera.zoom,
  }, minX, minY);
}
let explorationUi: ExplorationUi | null = null;
/** The field engine: FireRed content in Kanto (and Johto), pokeemerald content in Hoenn (DATA_ROOT "/emerald"). */
let engineInteraction: EngineInteraction | null = null;
let mapPopup: MapNamePopup | null = null;
let weatherOverlay: WeatherOverlay | null = null;
let battleFlashEl: HTMLElement | null = null;

async function playBattleTransition(): Promise<void> {
  if (!battleFlashEl) {
    battleFlashEl = document.createElement("div");
    battleFlashEl.id = "battle-flash-overlay";
    document.body.appendChild(battleFlashEl);
  }
  battleFlashEl.classList.remove("battle-flash-anim");
  void battleFlashEl.offsetWidth;
  battleFlashEl.classList.add("battle-flash-anim");
  await new Promise(r => setTimeout(r, 380));
  battleFlashEl.classList.remove("battle-flash-anim");
}

function navigationSnapshot(): NavigationSave {
  const found = findMapAt(playerX, playerY);
  if (!found) throw Error("Player is outside the map");
  return { mapId: found[0], x: playerX-found[1].x, y: playerY-found[1].y,
    direction: playerDir, dynamic: navigationWarps.returnAddress };
}
/** Shared by the menu and ferry: capture the departing map before serializing its bank. */
function saveCurrentSession(): boolean {
  if (JOHTO) return false;
  const nav = navigationSnapshot();
  storeViewerObjects(nav.mapId, readViewerMapObjects(nav.mapId));
  setRegionSessionFlags(HOENN ? "hoenn" : "kanto", state.eventFlags);
  return saveViewerSession(nav);
}
function sailTo(region: "kanto" | "hoenn"): void {
  try {
    if (!saveCurrentSession()) throw Error("Unable to save your game. Please try again before sailing.");
    location.assign(ferryUrl(region));
  } catch (error) { dialogManager.show("Unable to sail", [String(error)]); }
}
function pauseInteraction(active: boolean): void {
  keysDown.clear(); playerRunning = false;
  if (active) viewerClock.pause("engine-interaction"); else { viewerClock.resume("engine-interaction"); updateEntitiesView(); }
}
async function continueViewerSession(): Promise<void> {
  const checkpoint = viewerCheckpoint();
  if (!checkpoint) throw Error("No saved game yet");
  // Reload the saved SaveBlock too, discarding unsaved purchases/healing.
  if (!reloadWorldSave()) throw Error("Unable to read the saved game");
  enterKanto();
  loadRegionSessionFlags();
  PlayTimeCounter_Start();
  onWarpForRoamer(); // Overworld_ResetStateOnContinue
  const nav = viewerCheckpoint()!;
  restoreViewerEventMap(nav.mapId);
  state.playerChar = gameSave.playerGender === C.FEMALE ? "leaf" : "red";
  (document.getElementById("player-char") as HTMLSelectElement).value = state.playerChar;
  await changeNavigationWorld(nav.mapId);
  await rom.loadMap(nav.mapId);
  { entityManager.resetRemovedObjects(); objectSpawns.reset(); }
  applyViewerObjects(savedViewerObjects(nav.mapId));
  const info = index.maps[nav.mapId]!;
  navigationWarps.restore(nav.dynamic);
  await startExploration(info.x+nav.x, info.y+nav.y);
  playerDir = nav.direction; updatePlayerDisplay(); writeHash();
}

/** The engine moved the player (white-out): continue from its new map and tile. */
let relocateChain: Promise<void> = Promise.resolve();
async function relocateViewer(nav: NavigationSave): Promise<void> {
  const run = async () => {
    const prevWarpBusy = warpBusy;
    warpBusy = true;
    try {
      // The engine hands off its warp before running its own map loader.
      if (enterViewerEventMap(nav.mapId, true)) { entityManager.resetRemovedObjects(); objectSpawns.reset(); }
      await changeNavigationWorld(nav.mapId);
      const info = index.maps[nav.mapId]!;
      navigationWarps.restore(nav.dynamic);
      await startExploration(info.x + nav.x, info.y + nav.y);
      playerDir = nav.direction; updatePlayerDisplay(); writeHash();
      enteredMapId = nav.mapId;
      if (HOENN) void enterHoennMap(nav).catch(error => console.error("Hoenn map entry after relocation", error));
      else void engineInteraction?.enterMap(nav).catch(error => console.error("Map entry after relocation", error));
    } finally {
      warpBusy = prevWarpBusy;
    }
  };
  relocateChain = relocateChain.then(run, run);
  return relocateChain;
}

let sectorUpdateQueued = false;
function requestSectors(): Promise<void> {
  if (!sectorLoader || warpBusy) return Promise.resolve();
  const view = { x: minX + viewport.scrollLeft / camera.zoom / TILE,
    y: minY + viewport.scrollTop / camera.zoom / TILE,
    width: viewport.clientWidth / camera.zoom / TILE, height: viewport.clientHeight / camera.zoom / TILE };
  const nearby = nearbySectors(index.maps, view, 20);
  const playerMap = playerActive ? findMapAt(playerX, playerY)?.[0] : undefined;
  if (playerMap && !nearby.includes(playerMap)) nearby.unshift(playerMap);
  return sectorLoader.update(nearby);
}
function scheduleSectors(): void {
  if (!sectorLoader || sectorUpdateQueued) return;
  sectorUpdateQueued = true;
  requestAnimationFrame(() => { sectorUpdateQueued = false; void requestSectors(); });
}
let fillSources = new Map<string, FillSource>();
/** Live metatile replacement for field effects that rewrite map blocks (special_field_anim.c escalators). */
type MetatilePainter = { info: KantoIndex["maps"][string]; layout: { blocks: Uint16Array | number[] }; renderer: TileRenderer;
  bctx: CanvasRenderingContext2D; grid: WorldGrid; primary: TilesetData; secondary: TilesetData };
const metatilePainters = new Map<string, MetatilePainter>();
function paintNavigationMetatile(gx: number, gy: number, value: number): void {
  const hit = findMapAt(gx, gy);
  const painter = hit && metatilePainters.get(hit[0]);
  if (!hit || !painter) return;
  const x = gx - painter.info.x, y = gy - painter.info.y, mt = value & 0x3ff;
  const slot = y * painter.info.width + x, old = painter.layout.blocks[slot]!;
  painter.layout.blocks[slot] = (old & 0xf000) | (value & 0x0fff);
  const { bottom, top } = painter.renderer.metatile(mt);
  painter.bctx.clearRect(x * TILE, y * TILE, TILE, TILE);
  painter.bctx.drawImage(bottom, x * TILE, y * TILE);
  painter.bctx.drawImage(top, x * TILE, y * TILE);
  const idx = painter.grid.idx(gx, gy);
  painter.grid.metatiles[idx] = mt;
  painter.grid.behaviors[idx] = behaviorOf(painter.primary.attributes, painter.secondary.attributes, mt);
  painter.grid.solid[idx] = ((value & 0xc00) >> 10) !== 0 ? 1 : 0;
  avatarDepth?.invalidate();
  if (playerActive) avatarDepth?.update(playerVisualX, isStepping ? groundVisualY : playerVisualY, minX, minY, playerElevation);
}
let fillNearest: Int16Array | null = null;
let animController: TileAnimationController;
let minimapController: MinimapController | null = null;
let entityManager: EntityManager;
let dialogManager: DialogManager;
let interiorViewer: InteriorViewer;
/** maps.json del juego: todos los mapas (exteriores e interiores) con nombre, layout y sección. */
let allMaps: Record<string, { num: number; name: string; layout: string; section: string }> = {};
let fieldEffects: ViewerFieldEffects;
/** Efectos de campo vacíos: Hoenn no tiene los de FireRed (hierba, polvo, huellas), así que explorar no los dibuja. */
const NO_FIELD_EFFECTS = { onGroundStep(): void {}, resetSession(): void {} } as unknown as ViewerFieldEffects;
const forcedNavigation = new ViewerForcedMovement((x,y)=>!!findMapAt(x,y));
let cancelPlayerMotion: (() => void) | null = null;
function resetExploreSession(): void {
  forcedNavigation.reset(playerDir);
  cancelPlayerMotion?.();
  cancelPlayerMotion = null;
  avatarAnimator?.stop(state.playerChar, playerMode, playerDir, viewerClock.tick);
  isStepping = false;
  stepRunning = false;
  shoreAnchor = null;
  stepTarget = null;
  playerReflection?.hide();
  avatarDepth?.hide();
  jumpShadow?.hide();
  surfSupport?.hide();
  playerMoving = false;
  keysDown.clear();
  fieldEffects?.resetSession();
}
const audioController = new ViewerAudioController();
if (HOENN) audioController.setHoenn(true);
if (JOHTO) audioController.setJohto(true);

const camera = new ViewerCamera(viewport, document.getElementById("world-stage")!, content);
let initialZoom = 1;
let selection: { x: number; y: number } | null = null;
let startX: number | null = null;
let startY: number | null = null;
let startExplore = false;
/** #mapa=MAP_ID: abre el visor centrado en ese mapa (o en su interior si no está en el mundo exterior). */
let startMapId: string | null = null;
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
let stepRunning = false;
let jumpArc: readonly number[] = [];
let avatarAnimator: AvatarAnimator | null = null;
let surfSupport: SurfSupport | null = null;
let jumpShadow: JumpShadow | null = null;
let playerReflection: PlayerReflection | null = null;
let avatarDepth: AvatarDepth | null = null;
let warpVisuals: ViewerWarpVisuals | null = null;
let playerWarpHidden = false;
let warpOffsetX=0,warpOffsetY=0;
let warpPriority: number | null = null;
let warpCameraY=0,fallPreventStep=false;
let playerElevation = 0;
/** ObjectEventUpdateElevation currentElevation: 0 on neutral tiles, unlike previousElevation (draw priority). */
let playerCurrentElevation = 0;
let stepTarget: {x:number;y:number} | null = null;
let groundVisualY = 0;
let jumpBehaviors: readonly number[] = [];
let shoreAnchor: { x: number; y: number } | null = null;
const playerEl = document.getElementById("player-sprite");

function parseHash(): void {
  const h = new URLSearchParams(location.hash.slice(1));
  const x = Number(h.get("x"));
  const y = Number(h.get("y"));
  const z = Number(h.get("z"));
  startX = h.get("x") !== null && Number.isFinite(x) ? x : null;
  startY = h.get("y") !== null && Number.isFinite(y) ? y : null;
  if (z !== 0 && Number.isFinite(z)) initialZoom = Math.min(6, Math.max(0.25, Math.round(z * 1000) / 1000));
  const capas = h.get("capas");
  if (capas !== null) {
    state.activeLayers.clear();
    for (const c of capas.split(",")) {
      if ((LAYERS as readonly string[]).includes(c)) state.activeLayers.add(c as Layer);
    }
  }
  startExplore = h.get("modo") === "explore";
  startMapId = h.get("mapa");
  const returnWarp = Number(h.get("retornoWarp"));
  if (h.has("retorno") && h.has("retornoWarp") && Number.isSafeInteger(returnWarp) && returnWarp >= -1)
    navigationWarps.restore({ mapId: h.get("retorno")!, warpId: returnWarp,
      ...(h.has("retornoX") && h.has("retornoY") ? { x:Number(h.get("retornoX")),y:Number(h.get("retornoY")) } : {}) });
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
  if (warpBusy) return;
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
  if (navigationMap) h.set("mapa", navigationMap);
  const dynamicReturn = navigationWarps.returnAddress;
  if (dynamicReturn) { h.set("retorno", dynamicReturn.mapId); h.set("retornoWarp", String(dynamicReturn.warpId));
    if (dynamicReturn.x !== undefined && dynamicReturn.y !== undefined) { h.set("retornoX",String(dynamicReturn.x));h.set("retornoY",String(dynamicReturn.y)); } }
  if (playerActive) {
    h.set("px", String(playerX));
    h.set("py", String(playerY));
  }
  h.set("capas", [...state.activeLayers].join(","));
  if (state.fillMode !== "full") h.set("relleno", state.fillMode);
  history.replaceState(null, "", `#${h.toString()}`);
}

function setZoom(next: number, ax = viewport.clientWidth / 2, ay = viewport.clientHeight / 2): void {
  if (playerActive && !HOENN && !JOHTO) next = Math.round(Math.max(1, next));
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
  const base = `${Object.keys(index?.maps ?? {}).length || 37} outdoor maps · ${GAME_NAME} GBA`;
  if (animController?.animOn) {
    const fpsText = animController.fpsValue > 0 ? ` · ${animController.fpsValue.toFixed(0)} FPS` : " · measuring FPS";
    statusMeta.textContent = `${base}${fpsText}`;
  } else {
    statusMeta.textContent = `${base}${animController?.animDisabledNotice ?? ""}`;
  }
}

function centerOnMap(id: string): boolean {
  const info = index.maps[id];
  if (!info) return false;
  viewport.scrollLeft = ((info.x - minX) * TILE + (info.width * TILE) / 2) * camera.zoom - viewport.clientWidth / 2;
  viewport.scrollTop = ((info.y - minY) * TILE + (info.height * TILE) / 2) * camera.zoom - viewport.clientHeight / 2;
  scheduleSectors();
  minimapController?.updateRadar();
  checkCurrentMapMusic();
  scheduleHashWrite();
  return true;
}

async function fetchHoennIndex(): Promise<WorldIndexData> {
  const res = await fetch("/viewer/hoenn.json");
  if (!res.ok) throw new Error("missing public/viewer/hoenn.json: run EXPORT_GAME=emerald python3 tools/viewer/world_index.py");
  const hoennIndex = (await res.json()) as KantoIndex;
  const maps = Object.values(hoennIndex.maps);
  return { index: hoennIndex, minX: Math.min(...maps.map((m) => m.x)), minY: Math.min(...maps.map((m) => m.y)) };
}

async function fetchJohtoIndex(): Promise<WorldIndexData> {
  const res = await fetch("/viewer/johto.json");
  if (!res.ok) throw new Error("missing public/viewer/johto.json");
  const johtoIndex = (await res.json()) as KantoIndex;
  const maps = Object.values(johtoIndex.maps);
  return { index: johtoIndex, minX: Math.min(...maps.map((m) => m.x)), minY: Math.min(...maps.map((m) => m.y)) };
}

/** Selector Kanto/Hoenn/Johto (recarga la página con ?region=); Hoenn y Johto ocultan los controles que dependen de FireRed. */
function setupGameSelect(): void {
  const select = document.createElement("select");
  select.id = "game-select";
  select.className = "btn";
  select.title = "Map region";
  for (const [value, label] of [["firered", "Kanto · FireRed"], ["emerald", "Hoenn · Emerald"], ["hns", "Johto / Kanto · HnS"]] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = GAME;
  select.addEventListener("change", () => {
    const url = new URL(location.href);
    if (select.value === "hns") {
      url.searchParams.set("region", "johto");
      url.searchParams.delete("game");
      url.searchParams.delete("mapa");
    } else if (select.value === "emerald") {
      url.searchParams.set("region", "hoenn");
      url.searchParams.delete("game");
      url.searchParams.delete("mapa");
    } else {
      url.searchParams.set("region", "kanto");
      url.searchParams.delete("game");
      url.searchParams.delete("mapa");
    }
    url.hash = "";
    location.href = url.toString();
  });
  document.getElementById("layers-btn")?.before(select);
  if (HOENN) {
    document.title = "Pokémon Odyssey — Hoenn World Map";
    const title = document.querySelector(".app-title");
    if (title) title.lastChild!.textContent = " Hoenn · World Map";
    document.getElementById("anim-toggle")?.closest("label")?.style.setProperty("display", "none");
    const charSelect = document.getElementById("player-char") as HTMLSelectElement | null;
    if (charSelect) {
      charSelect.options[0]!.text = "Brendan";
      charSelect.options[1]!.text = "May";
    }
  } else if (JOHTO) {
    document.title = "Pokémon Odyssey — Johto World Map (Heart & Soul)";
    const title = document.querySelector(".app-title");
    if (title) title.lastChild!.textContent = " Johto · Heart & Soul";
    document.getElementById("anim-toggle")?.closest("label")?.style.setProperty("display", "none");
    const charSelect = document.getElementById("player-char") as HTMLSelectElement | null;
    if (charSelect) {
      charSelect.options[0]!.text = "Ethan";
      charSelect.options[1]!.text = "Lyra";
    }
  }
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
    const section = m.section;
    const canOverride = section !== "MAPSEC_KANTO_VICTORY_ROAD" && section !== "MAPSEC_ROUTE_23" && section !== "MAPSEC_INDIGO_PLATEAU";
    const musicChoice = (m.music && m.music > 0) ? m.music : (m.musicName || m.music);
    audioController.setPlayerOnWater(playerActive && playerMode === "surf");
    audioController.updateMap(mapId, musicChoice, playerActive ? playerMode : undefined, canOverride);
  }
}

// --- Lógica del Avatar del Jugador ---

function updatePlayerDisplay(): void {
  if (!playerEl || !playerActive) return;
  const px = playerVisualX;
  const py = playerVisualY;

  const running = isStepping ? stepRunning : playerRunning && playerMoving;
  const isBike = playerMode === "bike";
  // Emerald and Johto surfing sheet: 32x32 cells (a player riding the Pokémon), like the FireRed bike's width.
  const wide = isBike || ((HOENN || JOHTO) && playerMode === "surf");
  const spriteW = wide ? 32 : 16;
  const spriteH = 32;

  playerEl.style.width = `${spriteW}px`;
  playerEl.style.height = `${spriteH}px`;
  playerEl.style.left = `${wide ? px - 8 : px}px`;
  playerEl.style.top = `${py - 16}px`;
  playerEl.style.display = "block";
  playerEl.style.visibility = playerWarpHidden ? "hidden" : "";

  // Hoenn and Johto retain the sprite-sheet adapter; Kanto resolves all frames through AvatarAnimator.
  let frameIdx = 0;
  const flip = playerDir === "east";
  if (!avatarAnimator) {
    const facing = playerDir === "south" ? 0 : playerDir === "north" ? playerMode === "surf" && (HOENN || JOHTO) ? 2 : 1 : playerMode === "surf" && (HOENN || JOHTO) ? 4 : 2;
    frameIdx = !playerMoving ? facing
      : playerMode === "surf" && (HOENN || JOHTO) ? (playerDir === "south" ? (playerStep % 2 === 0 ? 0 : 1) : playerDir === "north" ? (playerStep % 2 === 0 ? 2 : 3) : (playerStep % 2 === 0 ? 4 : 5))
      : (playerDir === "south" ? 3 : playerDir === "north" ? 5 : 7) + (playerStep % 2 === 0 ? 0 : 1);
  }

  const airborne = isStepping && (shoreAnchor !== null || (avatarAnimator ? avatarAnimator.frame(state.playerChar, playerMode, playerDir, viewerClock.tick).action === "jump" : Math.abs(playerVisualY - groundVisualY) > 0.5));
  const inGrass = !airborne && worldGrid.isGrassTile(playerX, playerY) && playerMode !== "surf" && !isBike;
  playerEl.style.clipPath = inGrass ? "inset(0 0 4px 0)" : "none";

  const priority = warpPriority ?? (hasCData("event_object_movement", "sElevationToPriority") ? (cdata<number[]>("event_object_movement", "sElevationToPriority")[playerElevation & 0xf] ?? 2) : 2);
  playerEl.style.zIndex = priority <= 1 ? "30" : "25";

  if (avatarAnimator) {
    const frame = avatarAnimator.frame(state.playerChar, playerMode, playerDir, viewerClock.tick);
    surfSupport?.setPriority(priority);jumpShadow?.setPriority(priority);
    playerEl.style.width = `${frame.width}px`; playerEl.style.height = `${frame.height}px`;
    playerEl.style.left = `${px - (frame.width - TILE) / 2}px`;
    const shoreJump = frame.moving && (frame.action === "board" || frame.action === "dismount");
    const supportPoint = shoreJump ? shoreAnchor : { x: px, y: py };
    const bob = surfSupport?.update((playerMode === "surf" || shoreJump) && !!supportPoint, playerDir, supportPoint?.x ?? px, supportPoint?.y ?? py, viewerClock.tick) ?? 0;
    jumpShadow?.update(frame.moving && frame.action === "jump" && !MB.MetatileBehavior_IsPokeGrass(jumpBehaviors[0] ?? 0)
      && !jumpBehaviors.some(behavior => MB.MetatileBehavior_IsSurfable(behavior) || MB.MetatileBehavior_IsReflective(behavior)),
      px, groundVisualY, frame.height, frame.shadowSize);
    const riderOffset = shoreJump ? 0 : bob;
    const groundY = airborne ? groundVisualY : py;
    avatarDepth?.update(px,groundY,minX,minY,playerElevation);
    fieldEffects.setActorVisual({xPx:px+minX*TILE,groundYPx:groundY+minY*TILE,height:frame.height,elevation:playerElevation});
    playerReflection?.update(frame,worldGrid,stepTarget ?? {x:playerX,y:playerY},{x:playerX,y:playerY},px,groundY,py-groundY+riderOffset,minX,minY,viewerClock.tick);
    playerEl.style.top = `${py - (frame.height - TILE) + riderOffset}px`;
    playerEl.style.backgroundImage = `url(${frame.url})`;
    playerEl.style.backgroundPosition = `-${frame.index * frame.width}px 0px`;
    playerEl.style.transform = `scale(${frame.hFlip ? -1 : 1}, ${frame.vFlip ? -1 : 1})`;
    playerEl.dataset.animation = JSON.stringify(frame);
  } else {
    playerEl.style.backgroundImage = `url(${getPlayerSpriteSheet(state.playerChar, playerMode, running, state.bikeType)})`;
    playerEl.style.backgroundPosition = `-${frameIdx * spriteW}px 0px`;
    playerEl.style.transform = flip ? "scaleX(-1)" : "scaleX(1)";
    const groundY = airborne ? groundVisualY : py;
    avatarDepth?.update(px, groundY, minX, minY, playerElevation);
    if (jumpShadow && isStepping && airborne) {
      jumpShadow.setPriority(priority);
      jumpShadow.update(true, px, groundY, spriteH, "SHADOW_SIZE_M");
    } else {
      jumpShadow?.hide();
    }
  }

  playerEl.style.left=`${parseFloat(playerEl.style.left)+warpOffsetX}px`;
  playerEl.style.top=`${parseFloat(playerEl.style.top)+warpOffsetY}px`;

  viewport.scrollLeft = (px + TILE / 2) * camera.zoom - viewport.clientWidth / 2;
  viewport.scrollTop = (py + TILE / 2) * camera.zoom - viewport.clientHeight / 2 + warpCameraY*camera.zoom;
  minimapController?.updateRadar();

  scheduleSectors();
  updateSectorBorder();
  const baseTitle = findMapAt(playerX, playerY)?.[1].title ?? GAME_NAME;
  // GetSafariZoneFlag reads FireRed's FLAG_SYS_SAFARI_MODE ID, not valid against the Hoenn bank.
  const safariStats = HOENN ? undefined : engineInteraction?.getSafariStats();
  const locationTitle = safariStats?.active
    ? `${baseTitle} · Safari: ${safariStats.balls} bolas, ${safariStats.steps} steps`
    : baseTitle;
  explorationUi?.setLocation(locationTitle);
  const here = findMapAt(playerX, playerY)?.[0];
  if (playerActive && here) {
    const type = mapHeaders.get(here)?.mapType;
    const outdoors = type === C.MAP_TYPE_ROUTE || type === C.MAP_TYPE_TOWN || type === C.MAP_TYPE_CITY || type === C.MAP_TYPE_UNDERWATER || type === C.MAP_TYPE_OCEAN_ROUTE;
    if (outdoors) lastOutdoorNav = navigationSnapshot();
    else if (!HOENN && !JOHTO && type !== undefined && here !== enteredMapId && lastOutdoorNav && lastOutdoorNav.mapId !== here)
      void engineInteraction?.recordEscapeWarp(lastOutdoorNav, here).catch(error => console.error("Escape warp", error));
  }
  if (playerActive && here && here !== enteredMapId) {
    if (enterViewerEventMap(here)) entityManager.resetRemovedObjects();
    enteredMapId = here;
    const header = mapHeaders.get(here) ?? rom.cachedMap(here);
    const mapInfo = index?.maps[here];
    const type = header?.mapType;
    const outdoors = JOHTO ? true : (type === C.MAP_TYPE_ROUTE || type === C.MAP_TYPE_TOWN || type === C.MAP_TYPE_CITY || type === C.MAP_TYPE_UNDERWATER || type === C.MAP_TYPE_OCEAN_ROUTE);
    if (!HOENN) audioController.chooseAmbientCry(here, Boolean(outdoors));
    if (header || mapInfo) {
      const defaultWeather = HOENN && here.startsWith("MAP_UNDERWATER")
        ? EmConstants.WEATHER_UNDERWATER_BUBBLES
        : HOENN && (here === "MAP_MT_PYRE_EXTERIOR" || here === "MAP_MT_PYRE_SUMMIT")
        ? EmConstants.WEATHER_FOG_HORIZONTAL
        : (mapInfo?.weather ?? header?.weather ?? 0);
      weatherOverlay?.setWeather(defaultWeather);
      weatherOverlay?.setRequiresFlash(Boolean(header?.requiresFlash));
      if (here === "MAP_DEWFORD_TOWN_GYM") {
        weatherOverlay?.setCustomDarknessRadius(dewfordGymTracker.getFlashRadius());
      } else {
        weatherOverlay?.setCustomDarknessRadius(null);
      }
      if (here === "MAP_PETALBURG_CITY_GYM") {
        const hit = findMapAt(playerX, playerY);
        for (const tu of petalburgGymTracker.getAllUnlockedDoorMetatiles()) {
          const wx = hit ? hit[1].x + tu.x : tu.x;
          const wy = hit ? hit[1].y + tu.y : tu.y;
          paintNavigationMetatile(wx, wy, tu.metatileId);
        }
      }
      if (header?.showMapName !== false) {
        let theme: "town" | "city" | "route" | "cave" | "indoor" = "route";
        if (header?.requiresFlash || header?.mapType === C.MAP_TYPE_UNDERGROUND) theme = "cave";
        else if (header?.mapType === C.MAP_TYPE_TOWN) theme = "town";
        else if (header?.mapType === C.MAP_TYPE_CITY) theme = "city";
        else if (header?.mapType === C.MAP_TYPE_INDOOR) theme = "indoor";
        const mapTitle = findMapAt(playerX, playerY)?.[1].title;
        if (mapTitle) mapPopup?.show(mapTitle, theme);
      }
    }
    if (!HOENN && !JOHTO) pendingMapEntry = (engineInteraction?.enterMap(navigationSnapshot()) ?? Promise.resolve()).then(() => {});
    else if (HOENN) pendingMapEntry = enterHoennMap(navigationSnapshot());
    void pendingMapEntry.catch(error => console.error("Map entry", error));
  }
  updateEntitiesView();
  checkCurrentMapMusic();
  scheduleHashWrite();
}

/** Hoenn arrival through the engine (pokeemerald map scripts): apply the object templates they moved. */
async function enterHoennMap(nav: NavigationSave): Promise<void> {
  const report: HoennMapEntryReport | undefined = await engineInteraction?.enterMap(nav);
  if (!report) return;
  // Graphics IDs are Emerald's: keep the viewer's own graphics name for each object.
  applyViewerObjects(report.changedTemplates.map(t => { const state = readViewerTemplateState(t, report.mapId); delete state.graphicsId; return state; }));
  updateEntitiesView();
}

let pendingMapEntry: Promise<void> = Promise.resolve();
let enteredMapId = "";
let lastOutdoorNav: NavigationSave | null = null;
const objectSpawns=new ViewerObjectSpawns();
function syncEntityPresence(): boolean {
  if (!playerActive || !entityManager) return false;
  const here=findMapAt(playerX,playerY)?.[0];
  const header=here?mapHeaders.get(here):undefined,info=here?index.maps[here]:undefined;
  if(header&&info&&!HOENN&&!JOHTO)objectSpawns.update(header,{x:playerX-info.x,y:playerY-info.y},info.width,info.height,mapHeaders);
  const changed = entityManager.syncPresence(e=>isViewerObjectPresent(e)&&(HOENN || JOHTO || objectSpawns.present(e)));
  if (changed) {
    // Clear first, then rebuild the union: conditional templates may share a tile.
    for (const tile of entityManager.takeVacatedTiles()) worldGrid.setNpc(tile.gx,tile.gy,false);
    for (const ent of entityManager.entities) worldGrid.setNpc(ent.gx, ent.gy, false);
    for (const ent of entityManager.entities) if (!ent.hidden) worldGrid.setNpc(ent.gx, ent.gy, true);
  }
  return changed;
}
function updateEntitiesView(): void {
  syncEntityPresence();
  // Hoenn y Johto muestran sus personajes también fuera de la exploración (fijos), siempre que haya algo a la vista.
  if (!playerActive && !HOENN && !JOHTO) {
    entityManager.hideAll();
    return;
  }
  const viewLeft = viewport.scrollLeft / camera.zoom - 64;
  const viewTop = viewport.scrollTop / camera.zoom - 64;
  const viewRight = viewLeft + viewport.clientWidth / camera.zoom + 128;
  const viewBottom = viewTop + viewport.clientHeight / camera.zoom + 128;

  entityManager.updateVisibility(viewLeft, viewTop, viewRight, viewBottom, (ent) => {
    if (!HOENN && !JOHTO || playerActive) interactWithEntity(ent);
  });
}

function interactWithEntity(ent: LiveEntity): void {
  if (ent.hidden) return;
  if (playerActive) {
    const header = mapHeaders.get(ent.element.map) ?? rom.cachedMap(ent.element.map);
    const npc = header?.objects.find(o => !o.clone && "localId" in o && o.localId === ent.element.localId);
    let scriptName = npc && !npc.clone && (npc.script || (npc.scriptName && npc.scriptName !== "0x0" && npc.scriptName !== "NULL"))
      ? (npc.scriptName || npc.script)
      : undefined;

    if (!scriptName && (ent.element.graphics === "OBJ_EVENT_GFX_CUT_TREE" || ent.element.layer === "corte")) {
      scriptName = "EventScript_CutTree";
    } else if (!scriptName && (ent.element.graphics === "OBJ_EVENT_GFX_ROCK_SMASH_ROCK" || ent.element.layer === "roca")) {
      scriptName = "EventScript_RockSmash";
    } else if (!scriptName && ent.element.layer === "snorlax") {
      scriptName = "Route12_EventScript_Snorlax";
    }

    if (scriptName) {
      if (isStepping || warpBusy || explorationUi?.paused || (engineInteraction && engineInteraction.open)) return;
      const dx = playerDir === "east" ? 1 : playerDir === "west" ? -1 : 0;
      const dy = playerDir === "south" ? 1 : playerDir === "north" ? -1 : 0;
      const reach = MB.MetatileBehavior_IsCounter(worldGrid.behaviorAt(playerX+dx,playerY+dy)) ? 2 : 1;
      const here = findMapAt(playerX, playerY)?.[0];
      const reachableInMap = ent.element.map === here
        || (here ? mapHeaders.get(here)?.objects.some(o => o.clone && o.targetMap === ent.element.map && o.targetLocalId === ent.element.localId) : false);
      if (!reachableInMap || ent.gx !== playerX+dx*reach || ent.gy !== playerY+dy*reach) return;

      const isNurse = ent.element.graphics === "OBJ_EVENT_GFX_NURSE"
        || (typeof scriptName === "string" && (scriptName.includes("Nurse") || scriptName.includes("PkmnCenterNurse")))
        || (typeof ent.element.graphics === "string" && ent.element.graphics.includes("NURSE") && !ent.element.graphics.includes("CHANSEY"));

      const isChansey = ent.element.graphics === "OBJ_EVENT_GFX_NURSE_CHANSEY"
        || (typeof scriptName === "string" && scriptName.includes("Chansey"))
        || (typeof ent.element.graphics === "string" && ent.element.graphics.includes("CHANSEY"));

      if (isNurse && !HOENN) {
        audioController.playSelect();
        entityManager.faceTowards(ent, playerX, playerY);

        if (gameSave.party.length === 0) {
          dialogManager.show("Nurse Joy", [
            "Hello! Welcome to the Pokémon Center.\n\nWe restore Pokémon to full health.\n\n",
            { text: "Come back when you have a Pokémon in your party!", strong: true },
          ]);
          return;
        }

        dialogManager.showChoice(
          "Pokémon Center - Nurse Joy",
          [
            "Hello! Welcome to the Pokémon Center.\n\nWe restore your Pokémon to full health.\n\nWould you like us to heal them?",
          ],
          [
            {
              label: "Heal party",
              primary: true,
              action: () => {
                for (const mon of gameSave.party) {
                  mon.hp = mon.stats[0];
                  mon.status = 0;
                  for (let i = 0; i < 4; i++) {
                    mon.pp[i] = mon.moves[i] ? calculatePPWithBonus(mon.moves[i], mon.ppBonuses, i) : 0;
                  }
                }
                audioController.playHealFanfare();
                dialogManager.show("Nurse Joy", [
                  "Thank you for waiting!\n\nYour Pokémon are now fully healed.\n\n",
                  { text: "We hope to see you again!", strong: true },
                ]);
              },
            },
            {
              label: "Not now",
              action: () => {
                dialogManager.show("Nurse Joy", ["We hope to see you again!"]);
              },
            },
          ]
        );
        return;
      }

      if (isChansey && !HOENN) {
        audioController.playSelect();
        entityManager.faceTowards(ent, playerX, playerY);
        audioController.playMonCry(C.SPECIES_CHANSEY);
        dialogManager.show("Chansey", [
          "Chan! Siii! 💕\n\n(Chansey smiles as it looks after the Pokémon in the center.)",
        ]);
        return;
      }

      const isClerk = isMartClerk(ent.element.graphics, typeof scriptName === "string" ? scriptName : undefined);
      if (isClerk && !HOENN) {
        audioController.playSelect();
        entityManager.faceTowards(ent, playerX, playerY);
        openJohtoMart(ent.element.map, dialogManager, audioController);
        return;
      }

      if (JOHTO) {
        const scriptKey = typeof scriptName === "string" ? scriptName : undefined;
        if (ent.element.map === "MAP_NEW_BARK_TOWN_LAB" || scriptKey?.includes("NewBarkTown_Lab")) {
          const isChikorita = ent.element.localId === 4 || scriptKey === "NewBarkTown_Lab_EventScript_ChikoritaBall";
          const isCyndaquil = ent.element.localId === 5 || scriptKey === "NewBarkTown_Lab_EventScript_CyndaquilBall";
          const isTotodile = ent.element.localId === 6 || scriptKey === "NewBarkTown_Lab_EventScript_TotodileBall";
          if (isChikorita || isCyndaquil || isTotodile) {
            if (gameSave.party.length > 0) {
              dialogManager.show("Prof. Elm", ["You have already chosen your Pokémon! Take good care of it on your journey to Cherrygrove City."]);
              return;
            }
            const starterSpecies = isChikorita ? C.SPECIES_CHIKORITA : isCyndaquil ? C.SPECIES_CYNDAQUIL : C.SPECIES_TOTODILE;
            const starterName = isChikorita ? "Chikorita" : isCyndaquil ? "Cyndaquil" : "Totodile";
            const starterType = isChikorita ? "Grass 🌱" : isCyndaquil ? "Fire 🔥" : "Water 💧";
            const starterDesc = isChikorita
              ? "A gentle, cheerful Pokémon that uses the aromatic leaf on its head to soothe others."
              : isCyndaquil
                ? "A shy, cautious Pokémon that releases flames from its back when startled or angry."
                : "An energetic, playful Pokémon with powerful jaws that can bite anything.";

            dialogManager.showChoice(
              `Poké Ball: ${starterName}`,
              [
                `It contains the ${starterType} `,
                { text: starterName, strong: true },
                `.\n\n${starterDesc}\n\nWould you like to choose `,
                { text: starterName, strong: true },
                " as your Johto starter Pokémon?",
              ],
              [
                {
                  label: `Choose ${starterName}!`,
                  primary: true,
                  action: () => {
                    const mon = createMon(starterSpecies, 5);
                    giveMonToPlayer(mon);
                    setDexFlag(starterSpecies, true);
                    addBagItem(C.ITEM_POTION, 5);
                    addBagItem(C.ITEM_POKE_BALL, 5);
                    audioController.playSelect();
                    ent.hidden = true;
                    ent.removed = true;
                    ent.el?.remove();
                    worldGrid.setNpc(ent.gx, ent.gy, false);
                    dialogManager.show(
                      "Pokémon received!",
                      [
                        "You chose ",
                        { text: starterName, strong: true },
                        " (Level 5)!\n\nProf. Elm: A wonderful choice! I put ",
                        { text: "5 Potions and 5 Poké Balls", strong: true },
                        " in your Bag to get you started. Take good care of your new partner!",
                      ]
                    );
                  },
                },
                {
                  label: "Think it over",
                  action: () => dialogManager.close(),
                },
              ]
            );
            return;
          }

          if (ent.element.localId === 2 || scriptKey === "NewBarkTown_Lab_EventScript_Elm") {
            audioController.playSelect();
            entityManager.faceTowards(ent, playerX, playerY);
            if (gameSave.party.length === 0) {
              dialogManager.show("Prof. Elm", [
                "Hello, explorer! I have been waiting for you.",
                "\n\nI have prepared three Poké Balls on the table, with special starter Pokémon: ",
                { text: "Chikorita", strong: true }, ", ",
                { text: "Cyndaquil", strong: true }, " and ",
                { text: "Totodile", strong: true },
                ".\n\nGo to the table and choose a partner for your journey!",
              ]);
            } else {
              const starterName = gameSave.party[0]?.species ? (rom.species[gameSave.party[0].species]?.name ?? "Pokémon") : "Pokémon";
              dialogManager.show("Prof. Elm", [
                `Your ${starterName} looks very happy with you!`,
                "\n\nLeave the lab and head west on Route 29 toward Cherrygrove City. Mr. Pokémon awaits with a mystery!",
              ]);
            }
            return;
          }
        }

        if (ent.element.graphics === "OBJ_EVENT_GFX_ITEM_BALL" || ent.element.graphics === "OBJ_EVENT_GFX_POKE_BALL" || (scriptKey && scriptKey.includes("Item"))) {
          const itemInfo = getJohtoItemInfo(scriptKey);
          const itemName = itemInfo?.name ?? "Unknown item";
          audioController.playSelect();
          ent.hidden = true;
          ent.removed = true;
          ent.el?.remove();
          worldGrid.setNpc(ent.gx, ent.gy, false);
          if (itemInfo) {
            addBagItem(itemInfo.itemId, 1);
          }
          dialogManager.show("Item found", [
            "You found: ",
            { text: itemName, strong: true },
            "!",
          ]);
          return;
        }

        const jTrainer = getJohtoTrainerInfo(scriptKey, ent.element.map, ent.element.localId);
        if (jTrainer) {
          audioController.playExclamation();
          entityManager.faceTowards(ent, playerX, playerY);

          if (ent.defeated) {
            dialogManager.show(jTrainer.name, [jTrainer.defeatedText]);
            return;
          }

          if (gameSave.party.length === 0) {
            dialogManager.show(jTrainer.name, [
              "Hello! You look like a new Trainer... Come back when you have a Pokémon ready to battle!",
            ]);
            return;
          }

          dialogManager.showChoice(
            `Trainer challenge: ${jTrainer.name}!`,
            [
              { text: jTrainer.name, strong: true },
              `: «${jTrainer.introText}»\n\nDo you accept the Pokémon battle?`,
            ],
            [
              {
                label: "⚔️ Accept battle!",
                primary: true,
                action: () => {
                  const enemyParty = jTrainer.party.map(p => createMon(p.species, p.level));
                  const nav = navigationSnapshot();
                  if (engineInteraction) {
                    void engineInteraction.startTrainerBattle(jTrainer.trainerId, enemyParty, nav, (outcome) => {
                      if (outcome === 1) {
                        ent.defeated = true;
                        addMoney(jTrainer.reward);
                        dialogManager.show(jTrainer.name, [
                          `«${jTrainer.defeatText}»\n\n`,
                          { text: `You defeated ${jTrainer.name} and earned ¥${jTrainer.reward.toLocaleString("en-US")}!`, strong: true },
                        ]);
                      } else {
                        dialogManager.show(jTrainer.name, [
                          "Good try! Keep training your party and try again whenever you like.",
                        ]);
                      }
                    }).catch(err => {
                      console.error("Johto Trainer battle error:", err);
                    });
                  }
                },
              },
              {
                label: "🏃 Not now",
                action: () => dialogManager.close(),
              },
            ]
          );
          return;
        }

        const dialogue = getJohtoDialogue(ent.element.map, ent.element.localId ?? 0, scriptName, ent.element.graphics);
        if (dialogue) {
          audioController.playSelect();
          entityManager.faceTowards(ent, playerX, playerY);
          dialogManager.show(dialogue.title, [dialogue.text]);
          return;
        }
      }

      const isFerrySailor = !HOENN && (scriptName === "VermilionCity_EventScript_FerrySailor"
        || (ent.element.map === "MAP_VERMILION_CITY" && (ent.element.localId === 6 || (npc && !npc.clone && "localId" in npc && npc.localId === 6))));

      if (isFerrySailor) {
        dialogManager.showChoice(
          "🚢 S.S. Anne Ferry",
          [
            "Hello, explorer! The ferry is ready to sail toward new horizons.",
            { text: " Would you like to sail to Slateport City in Hoenn?", strong: true },
          ],
          [
            {
              label: "🚢 Sail to Hoenn!",
              primary: true,
              action: () => {
                sailTo("hoenn");
              },
            },
            {
              label: "Stay in Kanto",
              action: () => dialogManager.close(),
            },
          ]
        );
        return;
      }

      if (HOENN && (scriptName === "SlateportCity_EventScript_Sailor1" || scriptName === "SlateportCity_EventScript_Sailor2" || (ent.element.map === "MAP_SLATEPORT_CITY" && (ent.gx >= 25 && ent.gy >= 40)))) {
        dialogManager.showChoice(
          "🚢 S.S. Tidal Ferry",
          [
            "Greetings from Hoenn's port! The ferry is ready to leave.",
            { text: " Would you like to return to Vermilion City in Kanto?", strong: true },
          ],
          [
            {
              label: "🚢 Return to Kanto!",
              primary: true,
              action: () => {
                sailTo("kanto");
              },
            },
            {
              label: "Stay in Hoenn",
              action: () => dialogManager.close(),
            },
          ]
        );
        return;
      }

      if (HOENN && (ent.element.map === "MAP_SKY_PILLAR_TOP" || ent.element.graphics?.includes("RAYQUAZA"))) {
        void runSkyPillarRayquazaCinematic(hoennCinematicHost);
        return;
      }
      if (HOENN && (ent.element.map === "MAP_SOOTOPOLIS_CITY" || ent.element.graphics?.includes("GROUDON") || ent.element.graphics?.includes("KYOGRE"))) {
        void runSootopolisClashCinematic(hoennCinematicHost);
        return;
      }
      if (HOENN && (ent.element.map?.startsWith("MAP_CAVE_OF_ORIGIN") || (ent.element.graphics?.includes("WALLACE") && ent.element.map?.includes("CAVE_OF_ORIGIN")))) {
        void runCaveOfOriginRumbleCinematic(hoennCinematicHost);
        return;
      }

      if (engineInteraction) {
        if (npc && !npc.clone) {
          void engineInteraction.show(navigationSnapshot(), { mapId: ent.element.map, localId: npc.localId }).catch(error => dialogManager.show("Interaction", [String(error)]));
        } else {
          void engineInteraction.triggerScript(navigationSnapshot(), scriptName).then(() => {
            if (ent.element.layer === "corte" || ent.element.layer === "roca") {
              ent.removed = true;
              ent.hidden = true;
              ent.el?.remove();
              ent.el = undefined;
              worldGrid.setNpc(ent.gx, ent.gy, false);
            }
          }).catch(error => dialogManager.show("Interaction", [String(error)]));
        }
        return;
      }
    }
  }
  // Hoenn: an object event without a script has no interaction (GetInteractedObjectEventScript returns NULL).
  if (HOENN && playerActive) return;
  audioController.playSelect();
  entityManager.faceTowards(ent, playerX, playerY);

  const title = ent.element.trainer ? `${ent.element.trainer}` : `${ent.element.map.replace("MAP_", "")}`;
  let msg: DialogSegment[] = [""];
  if (ent.element.layer === "snorlax") {
    msg = ["A huge Pokémon is sleeping in the road! It is blocking the path... You need a Poké Flute."];
  } else if (ent.element.layer === "corte") {
    msg = ["A small tree blocks the path! A Pokémon could cut it using Cut."];
  } else if (ent.element.graphics === "OBJ_EVENT_GFX_ITEM_BALL") {
    msg = [`You found an item on the ground! (${ent.element.flag ?? "Unknown item"}).`];
  } else if (ent.element.graphics === "OBJ_EVENT_GFX_NURSE" || (ent.element.graphics && ent.element.graphics.includes("NURSE") && !ent.element.graphics.includes("CHANSEY"))) {
    dialogManager.show("Nurse Joy", ["Approach the Pokémon Center counter to have Nurse Joy heal your party."]);
    return;
  } else if (ent.element.graphics === "OBJ_EVENT_GFX_NURSE_CHANSEY" || (ent.element.graphics && ent.element.graphics.includes("CHANSEY"))) {
    audioController.playMonCry(C.SPECIES_CHANSEY);
    dialogManager.show("Chansey", ["CHANSEY: Chaan! Sii! 💕"]);
    return;
  } else if (isMartClerk(ent.element.graphics)) {
    dialogManager.show("Clerk", ["Approach the Poké Mart counter to buy supplies."]);
    return;
  } else if (ent.element.trainer) {
    msg = [
      "Trainer ",
      { text: ent.element.trainer, strong: true },
      ` challenges you to a Pokémon battle! Sight range: ${ent.element.trainerRange ?? 1} tiles.`,
    ];
  } else if (JOHTO) {
    const header = mapHeaders.get(ent.element.map) ?? rom.cachedMap(ent.element.map);
    const npc = header?.objects.find(o => !o.clone && "localId" in o && o.localId === ent.element.localId);
    const scriptName = npc && !npc.clone && (npc.script || (npc.scriptName && npc.scriptName !== "0x0" && npc.scriptName !== "NULL"))
      ? (npc.scriptName || npc.script)
      : undefined;

    const scriptKey = typeof scriptName === "string" ? scriptName : undefined;
    if (ent.element.graphics === "OBJ_EVENT_GFX_ITEM_BALL" || ent.element.graphics === "OBJ_EVENT_GFX_POKE_BALL" || (scriptKey && scriptKey.includes("Item"))) {
      const itemInfo = getJohtoItemInfo(scriptKey);
      const itemName = itemInfo?.name ?? "Unknown item";
      dialogManager.show("Item", [`A Poké Ball on the ground contains: ${itemName}.`]);
      return;
    }

    const jTrainer = getJohtoTrainerInfo(scriptKey, ent.element.map, ent.element.localId);
    if (jTrainer) {
      if (ent.defeated) {
        dialogManager.show(jTrainer.name, [`${jTrainer.name} has already been defeated: «${jTrainer.defeatedText}»`]);
      } else {
        dialogManager.show(jTrainer.name, [
          `Trainer `,
          { text: jTrainer.name, strong: true },
          ` is waiting for an opponent on the route. Sight range: ${jTrainer.visionRange} tiles.`,
        ]);
      }
      return;
    }

    const dialogue = getJohtoDialogue(ent.element.map, ent.element.localId ?? 0, scriptName, ent.element.graphics);
    if (dialogue) {
      dialogManager.show(dialogue.title, [dialogue.text]);
      return;
    }
    msg = ["Hello, traveler. Welcome to Johto. Are you ready to become the Pokémon League Champion?"];
  } else {
    msg = ["Hello, traveler. Welcome to " + GAME_NAME + ". Are you ready to become the Pokémon League Champion?"];
  }
  dialogManager.show(title, msg);
}

function tryReadSign(fx: number, fy: number): boolean {
  const hit = findMapAt(fx, fy);
  if (!hit) return false;
  const [mapId] = hit;
  const lx = fx - hit[1].x;
  const ly = fy - hit[1].y;
  const header = mapHeaders.get(mapId) ?? rom.cachedMap(mapId);
  const bg = header?.bgs?.find(b => b.x === lx && b.y === ly);
  const scriptName = bg && "scriptName" in bg ? (bg as { scriptName?: string }).scriptName : undefined;
  if (JOHTO) {
    const insp = getJohtoInspection(mapId, lx, ly, scriptName);
    if (insp) {
      audioController.playSelect();
      if (insp.heal) {
        for (const mon of gameSave.party) {
          mon.hp = mon.stats[0];
          mon.status = 0;
          for (let i = 0; i < 4; i++) mon.pp[i] = mon.moves[i] ? calculatePPWithBonus(mon.moves[i], mon.ppBonuses, i) : 0;
        }
      }
      dialogManager.show(insp.title, [insp.text]);
      return true;
    }
  }
  const signInfo = getJohtoSign(mapId, lx, ly, scriptName);
  if (signInfo) {
    audioController.playSelect();
    dialogManager.show(signInfo.title, [signInfo.text]);
    return true;
  }
  if (bg && bg.type === "sign") {
    audioController.playSelect();
    const title = formatSignTitle(mapId, scriptName);
    dialogManager.show(title, [title]);
    return true;
  }
  return false;
}

function checkTrainerSight(): void {
  for (const ent of entityManager.entities) {
    if (ent.hidden || ent.defeated) continue;
    let r = ent.element.trainerRange ?? 0;
    let isTrainer = !!ent.element.trainer;

    if (JOHTO && !isTrainer) {
      const header = mapHeaders.get(ent.element.map) ?? rom.cachedMap(ent.element.map);
      const npc = header?.objects.find(o => !o.clone && "localId" in o && o.localId === ent.element.localId);
      const scriptName = npc && !npc.clone && (npc.script || (npc.scriptName && npc.scriptName !== "0x0" && npc.scriptName !== "NULL"))
        ? (npc.scriptName || npc.script)
        : undefined;
      const jTrainer = getJohtoTrainerInfo(typeof scriptName === "string" ? scriptName : undefined, ent.element.map, ent.element.localId);
      if (jTrainer) {
        isTrainer = true;
        r = jTrainer.visionRange;
      }
    }

    if (!isTrainer || r <= 0) continue;

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

async function preloadExplorationSprites(): Promise<void> {
  const halfW = viewport.clientWidth / camera.zoom / TILE / 2 + 2;
  const halfH = viewport.clientHeight / camera.zoom / TILE / 2 + 2;
  const urls = new Set([getPlayerSpriteSheet(state.playerChar, "walk", false, state.bikeType), getPlayerSpriteSheet(state.playerChar, "walk", true, state.bikeType),
    getPlayerSpriteSheet(state.playerChar, "surf", false, state.bikeType), getPlayerSpriteSheet(state.playerChar, "bike", false, state.bikeType)]);
  for (const ent of entityManager.entities) if (Math.abs(ent.gx - playerX) <= halfW && Math.abs(ent.gy - playerY) <= halfH) {
    const gfxKey = ent.element.graphics ?? "";
    const gfx = gfxInfoOf(gfxKey) ?? fallbackGfx();
    const folder = JOHTO ? spriteFolderOf(gfxKey) : ((HOENN || JOHTO) ? "/emerald" : "/fr");
    urls.add(`${folder}/${gfx.file}`);
  }
  await Promise.all([...urls].map(async url => {
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
    } catch {
      // Ignora fallos de predecodificación de sprites
    }
  }));
}

let exploreManualZoom = 0;
function exploreAutoZoom(): number {
  const w = window.innerWidth || viewport.clientWidth;
  const h = window.innerHeight || viewport.clientHeight;
  return Math.max(2, Math.min(6, Math.floor(Math.min(w / C.DISPLAY_WIDTH, h / C.DISPLAY_HEIGHT)) || 2));
}

/** Hoenn runs on the shared trainer with its own Emerald-ID progress bank (regionSave.ts). */
async function initializeHoennRegion(): Promise<void> {
  // Regional arrival respawn resolves the exported Emerald heal table before play or saving.
  await rom.load();
  initializeRegionalSession("hoenn", () => initializeHoennSessionFlags(index.initialFlags));
  loadRegionSessionFlags();
}
function loadRegionSessionFlags(): void {
  state.eventFlags.clear();
  for (const name of regionSessionFlags(HOENN ? "hoenn" : "kanto")) state.eventFlags.add(name);
}
async function continueHoennSession(): Promise<void> {
  await rom.load();
  const nav = continueRegionalSession("hoenn", () => initializeHoennSessionFlags(index.initialFlags));
  loadRegionSessionFlags();
  await changeNavigationWorld(nav.mapId);
  const info = index.maps[nav.mapId];
  if (!info) throw Error(`Saved map ${nav.mapId} is not in the Hoenn index`);
  navigationWarps.restore(nav.dynamic);
  await startExploration(info.x + nav.x, info.y + nav.y);
  playerDir = nav.direction; updatePlayerDisplay(); writeHash();
}

/**
 * ADAPTATION of NewGameInitData's RunScriptImmediately(EventScript_ResetAllMapFlags) for a new
 * Hoenn bank: sets the script's setflag list as extracted by world_index.py, but not its
 * `call EventScript_ResetAllBerries` (berry trees have no place in the bank yet). To be replaced
 * by running the script through HoennMapEntry's VM host once bank creation can await it.
 */
function initializeHoennSessionFlags(initialFlags?: Record<string, number>): void {
  if (!initialFlags) return;
  const flags = EmConstants as Record<string, number | undefined>;
  for (const [name, val] of Object.entries(initialFlags)) {
    const id = flags[name] ?? (typeof val === "number" ? val : 0);
    if (id) flagSet(id);
  }
}

async function startExploration(targetGx?: number, targetGy?: number): Promise<void> {
  if (!streaming) {
    writeHash();
    const h = new URLSearchParams(location.hash.slice(1));
    h.set("modo", "explore");
    if (targetGx !== undefined && targetGy !== undefined) { h.set("px", String(targetGx)); h.set("py", String(targetGy)); }
    location.hash = h.toString(); location.reload(); return;
  }
  if (!playerActive) camera.setZoom(exploreManualZoom || exploreAutoZoom());
  if (!HOENN && !JOHTO) {
    const explicitExternalMap = startMapId && startMapId !== "MAP_PALLET_TOWN_PLAYERS_HOUSE_2F";
    await initializeViewerSession(index.initialFlags, {
      forceTemporary: !!explicitExternalMap,
      gender: state.playerChar === "leaf" ? C.FEMALE : C.MALE,
    });
    gameSave.playerGender = state.playerChar === "leaf" ? C.FEMALE : C.MALE;
  } else if (HOENN) {
    await initializeHoennRegion();
  } else {
    initializeHoennSessionFlags(index.initialFlags);
  }
  if (!JOHTO) window.setTimeout(() => void engineInteraction?.warm().catch(() => {}), 1500);
  resetExploreSession();
  state.appMode = "explore";

  const modeViewerBtn = document.getElementById("mode-viewer-btn");
  const modeExploreBtn = document.getElementById("mode-explore-btn");
  const bikeBtn = document.getElementById("bike-btn");
  modeViewerBtn?.classList.remove("active-mode");
  modeExploreBtn?.classList.add("active-mode");
  if (bikeBtn) bikeBtn.style.display = "inline-flex";



  const preferred = targetGx !== undefined && targetGy !== undefined ? findMapAt(targetGx, targetGy)?.[0] : startMapId;
  const requestedX = startX !== null ? minX + Math.floor((startX + viewport.clientWidth / 2) / camera.zoom / TILE) : null;
  const requestedY = startY !== null ? minY + Math.floor((startY + viewport.clientHeight / 2) / camera.zoom / TILE) : null;
  const selected = targetGx !== undefined && targetGy !== undefined ? findMapAt(targetGx, targetGy)?.[1] : startMapId && index.maps[startMapId];
  const nearCamera = requestedX !== null && requestedY !== null ? Object.values(index.maps).find(m => requestedX >= m.x && requestedX < m.x + m.width && requestedY >= m.y && requestedY < m.y + m.height) : undefined;
  const fallbackMapId = JOHTO ? "MAP_NEW_BARK_TOWN" : HOENN ? "MAP_LITTLEROOT_TOWN" : "MAP_PALLET_TOWN";

  if (sectorLoader) {
    if (preferred && index.maps[preferred]) {
      centerOnMap(preferred);
    } else if (nearCamera) {
      // La cámara ya se encuentra sobre un sector válido de esta región
    } else {
      // Coordenadas fuera de los límites de esta región (p. ej. hash copiado de otra región o del atlas global): centrar en el mapa inicial
      centerOnMap(fallbackMapId);
    }
    await requestSectors();
  }
  const requestedVehicle = targetGx !== undefined && targetGy !== undefined && worldGrid.isWaterTile(targetGx, targetGy) ? "surf" : "walk";
  if (targetGx !== undefined && targetGy !== undefined && worldGrid.isWalkable(targetGx, targetGy, requestedVehicle)) {
    playerX = targetGx;
    playerY = targetGy;
    playerMode = requestedVehicle;
  } else if (playerX === 0 && playerY === 0) {
    const paleta = selected || nearCamera || index.maps[fallbackMapId];
    if (paleta) {
      const spawnX = targetGx !== undefined && targetGx >= paleta.x && targetGx < paleta.x + paleta.width
        ? targetGx
        : nearCamera && !selected && requestedX !== null && requestedX >= paleta.x && requestedX < paleta.x + paleta.width
          ? requestedX
          : selected
            ? paleta.x + Math.floor(paleta.width / 2)
            : JOHTO
              ? paleta.x + 20
              : paleta.x + 8;
      const spawnY = targetGy !== undefined && targetGy >= paleta.y && targetGy < paleta.y + paleta.height
        ? targetGy
        : nearCamera && !selected && requestedY !== null && requestedY >= paleta.y && requestedY < paleta.y + paleta.height
          ? requestedY
          : selected
            ? paleta.y + Math.floor(paleta.height / 2)
            : JOHTO
              ? paleta.y + 12
              : paleta.y + 8;
      playerX = spawnX;
      playerY = spawnY;
      // El centro del mapa puede ser un muro o edificio: busca la casilla libre más cercana dentro de los límites del mapa.
      for (let r = 0; r < Math.max(paleta.width, paleta.height, 30) && !worldGrid.isWalkable(playerX, playerY, requestedVehicle); r++) {
        let found = false;
        for (let oy = -r; oy <= r && !found; oy++) {
          for (let ox = -r; ox <= r && !found; ox++) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
            const cx = spawnX + ox;
            const cy = spawnY + oy;
            if (cx < paleta.x || cx >= paleta.x + paleta.width || cy < paleta.y || cy >= paleta.y + paleta.height) continue;
            if (worldGrid.isWalkable(cx, cy, requestedVehicle)) {
              playerX = cx;
              playerY = cy;
              found = true;
            }
          }
        }
        if (found) break;
      }
    } else {
      playerX = minX + Math.floor(index.world.width / 2);
      playerY = minY + Math.floor(index.world.height / 2);
    }
  }

  playerMode = worldGrid.isWaterTile(playerX, playerY) ? "surf" : playerMode === "surf" ? "walk" : playerMode;
  if (!worldGrid.isWalkable(playerX, playerY, playerMode)) throw new Error("No walkable starting position found");
  await preloadExplorationSprites();
  playerActive = true;
  explorationUi?.enter();
  if (!animController.animOn) {
    animController.start();
    const animBox = document.getElementById("anim-toggle") as HTMLInputElement | null;
    if (animBox) animBox.checked = true;
    updateMeta();
  }
  playerElevation=avatarDepth?.elevationAt(playerX,playerY)??0;
  if(playerElevation===15)playerElevation=0;
  playerCurrentElevation=playerElevation;
  playerVisualX = (playerX - minX) * TILE;
  playerVisualY = (playerY - minY) * TILE;
  groundVisualY = playerVisualY;
  updatePlayerDisplay();
  checkCurrentMapMusic();
  fieldEffects.onGroundStep("spawn", { x: playerX, y: playerY, previousX: playerX, previousY: playerY, direction: playerDir, previousDirection: playerDir, landingJump: false, elevation:playerElevation, priority:(HOENN || JOHTO)?2:cdata<number[]>("event_object_movement","sElevationToPriority")[playerElevation],vehicle: playerMode });
}

function stopExploration(): void {
  resetExploreSession();
  playerActive = false;
  keysDown.clear();
  playerRunning = false;
  state.appMode = "viewer";
  explorationUi?.exit();

  const modeViewerBtn = document.getElementById("mode-viewer-btn");
  const modeExploreBtn = document.getElementById("mode-explore-btn");
  const bikeBtn = document.getElementById("bike-btn");
  modeViewerBtn?.classList.add("active-mode");
  modeExploreBtn?.classList.remove("active-mode");
  if (bikeBtn) bikeBtn.style.display = "none";

  if (playerEl) playerEl.style.display = "none";
  surfSupport?.hide();
  jumpShadow?.hide();
  playerReflection?.hide();
  avatarDepth?.hide();
  shoreAnchor = null;
  entityManager.hideAll();
  dialogManager.close();
  minimapController?.updateRadar();
  scheduleHashWrite();
}

function toggleBike(): void {
  if (elevatorBusy || fallPreventStep || warpBusy || isStepping || playerMode === "surf") return;
  const mapId = findMapAt(playerX,playerY)?.[0];
  if (mapId && mapHeaders.get(mapId)?.allowCycling === false) return;
  if (HOENN && playerMode === "bike") {
    if (state.bikeType === "mach") {
      state.bikeType = "acro";
      const bikeBtn = document.getElementById("bike-btn");
      if (bikeBtn) {
        bikeBtn.style.background = "#3b82f6";
        bikeBtn.title = "Acro Bike";
      }
      audioController.playBikeBell();
      hoennBikeTracker.reset();
      updatePlayerDisplay();
      return;
    } else {
      state.bikeType = "mach";
      playerMode = "walk";
      hoennBikeTracker.reset();
    }
  } else {
    playerMode = playerMode === "bike" ? "walk" : "bike";
    hoennBikeTracker.reset();
  }
  const bikeBtn = document.getElementById("bike-btn");
  if (bikeBtn) {
    bikeBtn.style.background = playerMode === "bike" ? "#f59e0b" : "";
    bikeBtn.title = HOENN ? (playerMode === "bike" ? "Mach Bike" : "Bicycle") : "Bicycle";
  }
  if (playerMode === "bike") {
    audioController.playBikeBell();
  }
  updatePlayerDisplay();
  checkCurrentMapMusic();
}

function toggleDive(): void {
  if (elevatorBusy || fallPreventStep || warpBusy || isStepping) return;
  if (!HOENN) return;

  const hit = findMapAt(playerX, playerY);
  const curMap = hit ? hit[0] : (navigationMap ?? "");
  const locX = hit ? playerX - hit[1].x : playerX;
  const locY = hit ? playerY - hit[1].y : playerY;
  const currentBehavior = worldGrid.behaviorAt(playerX, playerY);
  const isUnderwater = curMap.includes("UNDERWATER") || (mapHeaders.get(curMap)?.mapType === 5);

  if (isUnderwater) {
    if (isUnableToEmerge(currentBehavior)) {
      audioController.playWallBump();
      return;
    }
    const emergeDest = getHoennEmergeDestination(curMap, locX, locY);
    if (emergeDest) {
      audioController.playSE(EmeraldConstants.SE_M_DIVE);
      const srcHdr = mapHeaders.get(curMap) ?? ({ id: curMap, warps: [], regionMapSection: 0, mapType: 0 } as unknown as MapHeader);
      void followNavigationWarp(srcHdr, -1, "step", {
        mapId: emergeDest.mapId,
        warpId: -1,
        x: emergeDest.x,
        y: emergeDest.y,
      }).then(() => {
        playerMode = "surf";
        updatePlayerDisplay();
      });
    }
  } else if (playerMode === "surf" || isDiveableWater(currentBehavior)) {
    const diveDest = getHoennDiveDestination(curMap, locX, locY);
    if (diveDest) {
      audioController.playSE(EmeraldConstants.SE_M_DIVE);
      const srcHdr = mapHeaders.get(curMap) ?? ({ id: curMap, warps: [], regionMapSection: 0, mapType: 0 } as unknown as MapHeader);
      void followNavigationWarp(srcHdr, -1, "step", {
        mapId: diveDest.mapId,
        warpId: -1,
        x: diveDest.x,
        y: diveDest.y,
      }).then(() => {
        playerMode = "surf";
        audioController.playBGM(EmeraldConstants.MUS_UNDERWATER);
        updatePlayerDisplay();
      });
    }
  }
}

function triggerAcroHop(): void {
  if (elevatorBusy || fallPreventStep || warpBusy || isStepping) return;
  if (playerMode !== "bike" || state.bikeType !== "acro") return;
  const hop = hoennAcroBikeTracker.triggerHop();
  audioController.playSE(hop.sound);
  isStepping = true;
  playerMoving = true;
  const startPxY = (playerY - minY) * TILE;
  const startTick = viewerClock.tick;
  avatarAnimator?.begin(state.playerChar, "bike", playerDir, "jump", startTick);
  const cancelHop = viewerClock.subscribe(frame => {
    const elapsed = frame.tick - startTick;
    if (elapsed < 16) {
      playerVisualY = startPxY - Math.sin((elapsed / 16) * Math.PI) * 10;
      updatePlayerDisplay();
    } else {
      cancelHop();
      playerVisualY = startPxY;
      isStepping = false;
      playerMoving = false;
      avatarAnimator?.stop(state.playerChar, "bike", playerDir, frame.tick);
      updatePlayerDisplay();
    }
  });
}

const keysDown = new Set<string>();

function tryPushBoulder(boulderEnt: LiveEntity, direction: Direction): boolean {
  if (HOENN || JOHTO || !playerActive || isStepping || warpBusy || elevatorBusy) return false;
  if (playerMode === "surf") return false;
  const flagId = C.FLAG_SYS_USE_STRENGTH;
  if (!flagGet(flagId)) return false;

  const dx = direction === "east" ? 1 : direction === "west" ? -1 : 0;
  const dy = direction === "south" ? 1 : direction === "north" ? -1 : 0;
  const bx = boulderEnt.gx + dx;
  const by = boulderEnt.gy + dy;

  if (!worldGrid.isLoaded(bx, by)) return false;
  if (entityManager.findAt(bx, by)) return false;

  const behavior = worldGrid.behaviorAt(bx, by);
  const isHole = behavior === C.MB_FALL_WARP;
  const isDoor = MB.MetatileBehavior_IsNonAnimDoor(behavior);
  const walkable = worldGrid.isWalkable(bx, by, "walk");
  if (!isHole && (!walkable || isDoor)) return false;

  isStepping = true;
  playerMoving = true;
  stepRunning = false;
  audioController.playSE(C.SE_M_STRENGTH);

  const startTick = viewerClock.tick;
  avatarAnimator?.begin(state.playerChar, playerMode, direction, "walk", startTick);

  const fromX = boulderEnt.gx, fromY = boulderEnt.gy;
  const startPxX = (fromX - minX) * TILE;
  const startPxY = (fromY - minY) * TILE;
  const destPxX = (bx - minX) * TILE;
  const destPxY = (by - minY) * TILE;
  const gfxInfo = gfxInfoOf(boulderEnt.element.graphics ?? "") ?? fallbackGfx();
  const duration = 32 * GBA_FRAME_MS;

  const unsubscribe = viewerClock.subscribe(frame => {
    const elapsed = (frame.tick - startTick) * GBA_FRAME_MS;
    const progress = Math.min(1, elapsed / duration);
    if (boulderEnt.el) {
      const curPxX = startPxX + (destPxX - startPxX) * progress;
      const curPxY = startPxY + (destPxY - startPxY) * progress;
      boulderEnt.el.style.left = `${curPxX - (gfxInfo.w > 16 ? (gfxInfo.w - 16) / 2 : 0)}px`;
      boulderEnt.el.style.top = `${curPxY - (gfxInfo.h - 16)}px`;
    }
    updatePlayerDisplay();

    if (progress >= 1) {
      unsubscribe();
      avatarAnimator?.stop(state.playerChar, playerMode, direction, frame.tick);
      isStepping = false;
      playerMoving = false;

      if (isHole) {
        audioController.playSE(C.SE_FALL);
        boulderEnt.hidden = true;
        boulderEnt.removed = true;
        boulderEnt.el?.remove();
        boulderEnt.el = undefined;
        worldGrid.setNpc(fromX, fromY, false);

        const mapId = boulderEnt.element.map;
        const states = savedViewerObjects(mapId);
        const existing = states.find(s => s.localId === boulderEnt.element.localId);
        if (existing) {
          existing.removed = true;
        } else {
          states.push({
            mapId,
            localId: boulderEnt.element.localId!,
            x: fromX,
            y: fromY,
            direction: "south",
            invisible: false,
            removed: true,
            graphicsId: C.OBJ_EVENT_GFX_PUSHABLE_BOULDER,
          });
        }
        storeViewerObjects(mapId, states);

        const flag = boulderEnt.element.flag;
        const flagNum = typeof flag === "string" ? (/^(?:0x[\da-f]+|\d+)$/i.test(flag) ? Number(flag) : rom.c(flag)) : flag ?? 0;
        if (flagNum) flagSet(flagNum);

        const header = mapHeaders.get(mapId);
        const template = header?.objects.find((o): o is MapObjectTemplate => !o.clone && o.localId === boulderEnt.element.localId);
        const reveal = template?.trainerType;
        const revealNum = typeof reveal === "string" ? (/^(?:0x[\da-f]+|\d+)$/i.test(reveal) ? Number(reveal) : rom.c(reveal)) : reveal ?? 0;
        if (revealNum) flagClear(revealNum);
      } else {
        worldGrid.setNpc(fromX, fromY, false);
        worldGrid.setNpc(bx, by, true);
        boulderEnt.gx = bx;
        boulderEnt.gy = by;
        if (boulderEnt.el) {
          boulderEnt.el.style.left = `${destPxX - (gfxInfo.w > 16 ? (gfxInfo.w - 16) / 2 : 0)}px`;
          boulderEnt.el.style.top = `${destPxY - (gfxInfo.h - 16)}px`;
        }

        const mapId = boulderEnt.element.map;
        const states = savedViewerObjects(mapId);
        const existing = states.find(s => s.localId === boulderEnt.element.localId);
        if (existing) {
          existing.x = bx;
          existing.y = by;
        } else {
          states.push({
            mapId,
            localId: boulderEnt.element.localId!,
            x: bx,
            y: by,
            direction: "south",
            invisible: false,
            removed: false,
            graphicsId: C.OBJ_EVENT_GFX_PUSHABLE_BOULDER,
          });
        }
        storeViewerObjects(mapId, states);

        if (gameSave.objectEventTemplates) {
          const t = gameSave.objectEventTemplates.find(s => s.localId === boulderEnt.element.localId);
          if (t) { t.x = bx; t.y = by; }
        }

        if (behavior === C.MB_STRENGTH_BUTTON) {
          const hit = findMapAt(bx, by);
          if (hit) {
            const [mid, info] = hit;
            const lx = bx - info.x, ly = by - info.y;
            const trigger = index.triggers.find(t => t.map === mid && t.x === lx && t.y === ly)
              ?? mapHeaders.get(mid)?.coords.find(c => c.x === lx && c.y === ly);
            if (trigger && engineInteraction) {
              const script = typeof (trigger as { script?: unknown }).script === "string"
                ? (trigger as { script: string }).script
                : (trigger as { scriptName?: string }).scriptName;
              if (script) void engineInteraction.triggerScript(navigationSnapshot(), script);
            }
          }
        }
      }
      updatePlayerDisplay();
      if (keysDown.size) processPlayerStep();
    }
  });

  return true;
}

function processPlayerStep(): void {
  if (!playerActive || engineInteraction?.open || elevatorBusy || fallPreventStep || warpBusy || isStepping || dialogManager.isOpen() || interiorViewer.isOpen() || explorationUi?.paused) return;

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

  const forced = forcedNavigation.next(worldGrid,playerX,playerY,playerDir,playerMode,playerCurrentElevation);
  if(forced?.loading){void requestSectors().then(()=>processPlayerStep());return;}
  for(let i=0;i<(forced?.sounds??0);i++)audioController.playSE(C.SE_M_RAZOR_WIND2);
  const forcedStep=forced?.step;
  if(forced?.consumed&&!forcedStep){
    // TryUpdatePlayerSpinDirection consumes the collision frame even when its
    // action was rejected; keypad/idle handling resumes on the following tick.
    isStepping=true;
    cancelPlayerMotion=viewerClock.subscribe(()=>{
      cancelPlayerMotion?.();cancelPlayerMotion=null;isStepping=false;processPlayerStep();
    });
    return;
  }
  if(forcedStep){
    targetDir=forcedStep.direction;
    dx=targetDir==="east"?1:targetDir==="west"?-1:0;
    dy=targetDir==="south"?1:targetDir==="north"?-1:0;
  }
  const previousDirection = playerDir;
  playerDir = forcedStep?.facing ?? targetDir;
  if (dx === 0 && dy === 0) {
    if (HOENN) hoennBikeTracker.reset();
    playerMoving=false;avatarAnimator?.stop(state.playerChar,playerMode,playerDir,viewerClock.tick);updatePlayerDisplay();return;
  }
  let isMudSlide = false;
  if (HOENN && !forcedStep) {
    const currentBehavior = worldGrid.behaviorAt(playerX, playerY);
    const onMudSlope = MBEmerald.MetatileBehavior_IsMuddySlope(currentBehavior);
    if (onMudSlope) {
      const isClimbingNorth = targetDir === "north" && dy < 0;
      const canClimb = isClimbingNorth && playerMode === "bike" && state.bikeType === "mach" && hoennBikeTracker.isMaxSpeed();
      if (!canClimb) {
        isMudSlide = true;
        targetDir = "south";
        dx = 0;
        dy = 1;
        playerDir = "south";
        hoennBikeTracker.reset();
        audioController.playSE(C.SE_M_RAZOR_WIND2);
      }
    } else if (targetDir === "north" && dy < 0) {
      const targetBehavior = worldGrid.behaviorAt(playerX, playerY - 1);
      if (MBEmerald.MetatileBehavior_IsMuddySlope(targetBehavior)) {
        const canClimb = playerMode === "bike" && state.bikeType === "mach" && hoennBikeTracker.isMaxSpeed();
        if (!canClimb) {
          audioController.playWallBump();
          hoennBikeTracker.reset();
          return;
        }
      }
    }
    const targetBehavior = worldGrid.behaviorAt(playerX + dx, playerY + dy);
    const currentOnRail = isRailMetatile(currentBehavior);
    const targetIsRail = isRailMetatile(targetBehavior);
    if (currentOnRail || targetIsRail) {
      const railCheck = checkRailMovement(targetBehavior, currentOnRail, targetDir, playerMode, state.bikeType, hoennAcroBikeTracker.isBHeld());
      if (!railCheck.allowed) {
        audioController.playWallBump();
        return;
      }
      if (railCheck.sound) {
        audioController.playSE(railCheck.sound);
      }
    }

    const hit = findMapAt(playerX, playerY);
    const curMap = hit ? hit[0] : (navigationMap ?? "");
    const locX = hit ? playerX - hit[1].x : playerX;
    const locY = hit ? playerY - hit[1].y : playerY;

    if (curMap === "MAP_FORTREE_CITY_GYM") {
      const targetLocX = locX + dx;
      const targetLocY = locY + dy;
      const gateCheck = fortreeGymTracker.checkMovement(targetDir, targetLocX, targetLocY);
      if (gateCheck.blocked) {
        audioController.playWallBump();
        return;
      }
      if (gateCheck.rotated && gateCheck.sound) {
        audioController.playSE(gateCheck.sound);
      }
    }

    if (curMap === "MAP_MAUVILLE_CITY_GYM") {
      const targetMetatile = worldGrid.getMetatile(playerX + dx, playerY + dy);
      if (isElectricBarrierMetatile(targetMetatile)) {
        audioController.playWallBump();
        return;
      }
    }

    if (curMap === "MAP_PETALBURG_CITY_GYM") {
      const targetLocX = locX + dx;
      const targetLocY = locY + dy;
      const doorCheck = petalburgGymTracker.checkDoorMovement(locX, locY, targetLocX, targetLocY);
      if (doorCheck.isDoor) {
        if (doorCheck.locked) {
          audioController.playWallBump();
          return;
        }
        if (doorCheck.canEnter && doorCheck.destX !== undefined && doorCheck.destY !== undefined) {
          if (doorCheck.sound) audioController.playSE(doorCheck.sound);
          const srcHdr = mapHeaders.get(curMap) ?? ({ id: curMap, warps: [], regionMapSection: 0, mapType: 0 } as unknown as MapHeader);
          void followNavigationWarp(srcHdr, -1, "step", {
            mapId: "MAP_PETALBURG_CITY_GYM",
            warpId: -1,
            x: doorCheck.destX,
            y: doorCheck.destY,
          });
          return;
        }
      }
    }
  }
  if (!forcedStep && !isMudSlide && tryNavigationWarp("input", playerDir)) return;
  // PlayerNotOnBikeTurningInPlace -> PlayerTurnInPlace -> WalkInPlaceFast (8 ticks).
  if (!forcedStep && !isMudSlide && avatarAnimator && playerMode !== "bike" && previousDirection !== targetDir && !playerMoving) {
    isStepping = true; playerMoving = true; stepRunning = false;
    const started = viewerClock.tick;
    avatarAnimator.begin(state.playerChar, playerMode, playerDir, "turn", started);
    updatePlayerDisplay();
    cancelPlayerMotion = viewerClock.subscribe(frame => {
      updatePlayerDisplay();
      if (frame.tick - started < 8) return;
      cancelPlayerMotion?.(); cancelPlayerMotion = null;
      isStepping = false; playerMoving = false;
      avatarAnimator?.stop(state.playerChar, playerMode, playerDir, frame.tick);
      updatePlayerDisplay();
      if (keysDown.size) processPlayerStep();
    });
    return;
  }

  if (!forcedStep && !isMudSlide && tryNavigationWarp("front", playerDir)) return;
  const allowAutoSurf = HOENN || JOHTO || new URLSearchParams(location.hash.slice(1)).get("autosurf") === "1" || new URLSearchParams(location.hash.slice(1)).get("autoSurf") === "1";
  const plan = forcedStep?.plan ?? planStep(worldGrid, playerX, playerY, playerDir, playerMode, playerCurrentElevation, allowAutoSurf);
  const targetX = plan.x, targetY = plan.y;
  const isLedgeJump = plan.jump;
  if (plan.status === "loading" && findMapAt(targetX, targetY)) {
    void requestSectors().then(() => {
      if (worldGrid.isLoaded(targetX, targetY)) processPlayerStep();
    });
    return;
  }

  if (plan.status === "ready") {
    if (HOENN && !isMudSlide && !forcedStep) {
      hoennBikeTracker.onStep(targetDir, playerMode, state.bikeType);
    }
    const previousVehicle = playerMode;
    playerMode = plan.vehicle;
    stepRunning = !forcedStep && playerMode === "walk" && playerRunning && !isLedgeJump
      && mapHeaders.get(findMapAt(playerX,playerY)?.[0] ?? "")?.allowRunning !== false;
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

    const nextElevation=avatarDepth?.elevationAt(targetX,targetY)??0;
    const previousElevation=avatarDepth?.elevationAt(playerX,playerY)??0;
    if(nextElevation!==15&&previousElevation!==15){playerCurrentElevation=nextElevation&0xf;if(nextElevation!==0)playerElevation=nextElevation;}
    const transition = !!avatarAnimator && (previousVehicle === "surf") !== (playerMode === "surf");
    const groundActor = { x: targetX, y: targetY, previousX: playerX, previousY: playerY,
      direction: playerDir, previousDirection, landingJump: isLedgeJump || (transition && previousVehicle === "surf"), airborne:isLedgeJump||transition,
      elevation:playerElevation,priority:(HOENN||JOHTO)?2:cdata<number[]>("event_object_movement","sElevationToPriority")[playerElevation],vehicle: playerMode };
    fieldEffects.onGroundStep("begin", groundActor);

    // Kanto uses the C step tables and 32-tick jumps (far/special); Hoenn retains its adapter timings.
    const forcedAction: AvatarAction | undefined = isMudSlide ? "ice" : forcedStep ? ({PlayerGoSpin:"spin",PlayerRideWaterCurrent:"current",PlayerWalkFast:"ice",PlayerWalkNormal:"walk",PlayerJumpLedge:"jump"} as const)[forcedStep.action] : undefined;
    // PlayerIsMovingOnRockStairs (field_player_avatar.c): north uses the current cell, south the destination.
    const rockStairs = !forcedStep && !isLedgeJump && !transition && !HOENN && !JOHTO && playerMode === "walk"
      && (playerDir === "north" ? MB.MetatileBehavior_IsRockStairs(worldGrid.behaviorAt(playerX, playerY))
        : playerDir === "south" ? MB.MetatileBehavior_IsRockStairs(worldGrid.behaviorAt(targetX, targetY)) : false);
    const action: AvatarAction = transition ? playerMode === "surf" ? "board" : "dismount" : isLedgeJump ? "jump" : forcedAction ?? (playerMode === "bike" ? "bike" : playerMode === "surf" ? "surf" : stepRunning ? (rockStairs ? "runSlow" : "run") : (rockStairs ? "walkSlow" : "walk"));
    const offsets = avatarAnimator?.offsets(action);
    const bikeDuration = HOENN && state.bikeType === "mach"
      ? (hoennBikeTracker.isMaxSpeed() ? 65 : hoennBikeTracker.speed === 2 ? 100 : 140)
      : 100;
    const duration = isMudSlide ? 80 : avatarAnimator ? (isLedgeJump || transition ? 32 : offsets!.length) * GBA_FRAME_MS : isLedgeJump ? 32 * GBA_FRAME_MS : playerMode === "bike" ? bikeDuration : stepRunning ? 120 : 160;
    stepTarget = {x:targetX,y:targetY};
    jumpBehaviors = [worldGrid.behaviorAt(targetX, targetY), worldGrid.behaviorAt(playerX, playerY)];
    shoreAnchor = transition ? previousVehicle === "surf" ? {x:startPxX,y:startPxY} : {x:destPxX,y:destPxY} : null;
    const startTick = viewerClock.tick;
    avatarAnimator?.begin(state.playerChar, playerMode, playerDir, action, startTick, forcedStep?.freeze);

    const animateStep = (tick: number) => {
      const elapsed = (tick - startTick) * GBA_FRAME_MS;
      const t = Math.min(1, elapsed / duration);
      const elapsedTicks = tick - startTick;
      const progress = avatarAnimator ? isLedgeJump ? Math.min(1, elapsedTicks / 32) : transition ? Math.min(16, Math.ceil(elapsedTicks / 2)) / 16 : offsets![Math.min(offsets!.length - 1, elapsedTicks - 1)]! / 16 : t;
      playerVisualX = startPxX + (destPxX - startPxX) * progress;
      playerVisualY = startPxY + (destPxY - startPxY) * progress;
      groundVisualY = playerVisualY;

      if (isLedgeJump || transition) {
        const elapsedTicks = tick - startTick;
        playerVisualY += t >= 1 ? 0 : (jumpArc ? jumpArc[Math.min(15, Math.max(0, elapsedTicks - 1) >> 1)]! : -Math.sin(t * Math.PI) * 12);
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
        stepTarget = null;
        jumpShadow?.hide();
        shoreAnchor = null;
        avatarAnimator?.stop(state.playerChar, playerMode, playerDir, tick, !!forcedStep);
        forcedNavigation.moved(targetDir,!forcedStep);

        fieldEffects.onGroundStep("finish", groundActor);

        if (HOENN) {
          const arrivedBehavior = worldGrid.behaviorAt(playerX, playerY);
          const isCracked = MBEmerald.MetatileBehavior_IsCrackedFloor(arrivedBehavior);
          const isHole = MBEmerald.MetatileBehavior_IsCrackedFloorHole(arrivedBehavior)
            || MBEmerald.MetatileBehavior_IsMtPyreHole(arrivedBehavior);

          if (isCracked) {
            const currentMt = worldGrid.getMetatile(playerX, playerY);
            const holeMt = getCrackedFloorHoleMetatile(currentMt);
            const isFullSpeedBike = playerMode === "bike" && state.bikeType === "mach" && hoennBikeTracker.isMaxSpeed();

            if (isFullSpeedBike) {
              const collapseX = playerX;
              const collapseY = playerY;
              setTimeout(() => {
                paintNavigationMetatile(collapseX, collapseY, holeMt);
                audioController.playSE(C.SE_BANG);
              }, 180);
            } else {
              paintNavigationMetatile(playerX, playerY, holeMt);
              const hit = findMapAt(playerX, playerY);
              const curMap = hit ? hit[0] : (navigationMap ?? "");
              const locX = hit ? playerX - hit[1].x : playerX;
              const locY = hit ? playerY - hit[1].y : playerY;
              const fallDest = getHoleFallDestination(curMap, locX, locY);
              if (fallDest) {
                const srcHdr = mapHeaders.get(curMap) ?? { id: curMap, warps: [], regionMapSection: 0, mapType: 0 } as unknown as MapHeader;
                void followNavigationWarp(srcHdr, -1, "step", {
                  mapId: fallDest.mapId,
                  warpId: -1,
                  x: fallDest.x,
                  y: fallDest.y,
                });
                return;
              }
            }
          } else if (isHole) {
            const hit = findMapAt(playerX, playerY);
            const curMap = hit ? hit[0] : (navigationMap ?? "");
            const locX = hit ? playerX - hit[1].x : playerX;
            const locY = hit ? playerY - hit[1].y : playerY;
            const fallDest = getHoleFallDestination(curMap, locX, locY);
            if (fallDest) {
              const srcHdr = mapHeaders.get(curMap) ?? { id: curMap, warps: [], regionMapSection: 0, mapType: 0 } as unknown as MapHeader;
              void followNavigationWarp(srcHdr, -1, "step", {
                mapId: fallDest.mapId,
                warpId: -1,
                x: fallDest.x,
                y: fallDest.y,
              });
              return;
            }
          }

          // Sootopolis Gym Ice Puzzle
          const hit = findMapAt(playerX, playerY);
          const curMap = hit ? hit[0] : (navigationMap ?? "");
          const locX = hit ? playerX - hit[1].x : playerX;
          const locY = hit ? playerY - hit[1].y : playerY;

          if (curMap === "MAP_SOOTOPOLIS_CITY_GYM_1F") {
            const iceResult = sootopolisGymTracker.onStep(locX, locY, arrivedBehavior);
            if (iceResult.action === "crack") {
              if (iceResult.sound) audioController.playSE(iceResult.sound);
              paintNavigationMetatile(playerX, playerY, METATILE_SootopolisGym_Ice_Cracked);
              if (iceResult.unlockedStairs) {
                for (const st of iceResult.unlockedStairs.tiles) {
                  const wx = hit ? hit[1].x + st.x : st.x;
                  const wy = hit ? hit[1].y + st.y : st.y;
                  paintNavigationMetatile(wx, wy, METATILE_SootopolisGym_Stairs);
                }
              }
            } else if (iceResult.action === "fall") {
              paintNavigationMetatile(playerX, playerY, METATILE_SootopolisGym_Ice_Broken);
              if (iceResult.sound) audioController.playSE(iceResult.sound);
              audioController.playSE(EmeraldConstants.SE_FALL);
              const srcHdr = mapHeaders.get(curMap) ?? ({ id: curMap, warps: [], regionMapSection: 0, mapType: 0 } as unknown as MapHeader);
              void followNavigationWarp(srcHdr, -1, "step", {
                mapId: "MAP_SOOTOPOLIS_CITY_GYM_B1F",
                warpId: -1,
                x: locX,
                y: locY,
              });
              return;
            }
          }

          // Mossdeep Gym Puzzle
          if (curMap === "MAP_MOSSDEEP_CITY_GYM") {
            const mossResult = mossdeepGymTracker.onWarpStep(locX, locY);
            if (mossResult.isWarp && mossResult.warpDestination) {
              if (mossResult.sound) audioController.playSE(mossResult.sound);
              const destX = hit ? hit[1].x + mossResult.warpDestination.x : mossResult.warpDestination.x;
              const destY = hit ? hit[1].y + mossResult.warpDestination.y : mossResult.warpDestination.y;
              playerX = destX;
              playerY = destY;
              playerVisualX = (destX - minX) * TILE;
              playerVisualY = (destY - minY) * TILE;
              updatePlayerDisplay();
            }
          }

          // Mauville Gym Electric Laser Barriers
          if (curMap === "MAP_MAUVILLE_CITY_GYM") {
            const mauvilleResult = mauvilleGymTracker.onStep(locX, locY);
            if (mauvilleResult.isSwitch) {
              if (mauvilleResult.soundSwitch) audioController.playSE(mauvilleResult.soundSwitch);
              if (mauvilleResult.soundUnlock) audioController.playSE(mauvilleResult.soundUnlock);
              if (mauvilleResult.tileUpdates) {
                for (const tu of mauvilleResult.tileUpdates) {
                  const wx = hit ? hit[1].x + tu.x : tu.x;
                  const wy = hit ? hit[1].y + tu.y : tu.y;
                  paintNavigationMetatile(wx, wy, tu.metatileId);
                }
              }
            }
          }

          // Lavaridge Gym Geysers & Buried Trainers
          if (curMap === "MAP_LAVARIDGE_TOWN_GYM_1F" || curMap === "MAP_LAVARIDGE_TOWN_GYM_B1F") {
            const trainerCheck = lavaridgeGymTracker.checkBuriedTrainers(curMap, locX, locY);
            if (trainerCheck.revealed && trainerCheck.sound) {
              audioController.playSE(trainerCheck.sound);
              audioController.playSE(EmeraldConstants.SE_FU_ZAKU);
            }
            const lavaWarp = lavaridgeGymTracker.onStep(curMap, locX, locY, arrivedBehavior);
            if (lavaWarp.action === "fall" && lavaWarp.destMap) {
              if (lavaWarp.soundLaunch) audioController.playSE(lavaWarp.soundLaunch);
              const srcHdr = mapHeaders.get(curMap) ?? ({ id: curMap, warps: [], regionMapSection: 0, mapType: 0 } as unknown as MapHeader);
              void followNavigationWarp(srcHdr, -1, "step", {
                mapId: lavaWarp.destMap,
                warpId: -1,
                x: lavaWarp.destX ?? locX,
                y: lavaWarp.destY ?? locY,
              });
              return;
            } else if (lavaWarp.action === "launch" && lavaWarp.destMap) {
              if (lavaWarp.soundLaunch) audioController.playSE(lavaWarp.soundLaunch);
              if (lavaWarp.soundLand) audioController.playSE(lavaWarp.soundLand);
              const srcHdr = mapHeaders.get(curMap) ?? ({ id: curMap, warps: [], regionMapSection: 0, mapType: 0 } as unknown as MapHeader);
              void followNavigationWarp(srcHdr, -1, "step", {
                mapId: lavaWarp.destMap,
                warpId: -1,
                x: lavaWarp.destX ?? locX,
                y: lavaWarp.destY ?? locY,
              });
              return;
            }
          }

          // Dewford Gym (Brawly) Stepped Dynamic Darkness
          if (curMap === "MAP_DEWFORD_TOWN_GYM") {
            weatherOverlay?.setCustomDarknessRadius(dewfordGymTracker.getFlashRadius());
            const nearLeader = dewfordGymTracker.checkLeaderProximity(locX, locY);
            if (nearLeader) {
              const res = dewfordGymTracker.defeatTrainer(DEWFORD_GYM_LEADER.id);
              if (res.changed) {
                audioController.playSE(EmeraldConstants.SE_APPLAUSE);
                if (res.sound) audioController.playSE(res.sound);
                weatherOverlay?.setCustomDarknessRadius(res.newRadius);
              }
            } else {
              const nearTrainer = dewfordGymTracker.checkTrainerProximity(locX, locY);
              if (nearTrainer) {
                const res = dewfordGymTracker.defeatTrainer(nearTrainer.id);
                if (res.changed) {
                  audioController.playSE(EmeraldConstants.SE_FU_ZAKU);
                  if (res.sound) audioController.playSE(res.sound);
                  weatherOverlay?.setCustomDarknessRadius(res.newRadius);
                }
              }
            }
          }

          // Petalburg Gym (Norman) Shoji Sliding Doors & Thematic Rooms
          if (curMap === "MAP_PETALBURG_CITY_GYM") {
            const proximity = petalburgGymTracker.checkTrainerProximity(locX, locY);
            if (proximity.found) {
              if (proximity.isNorman) {
                const defeatRes = petalburgGymTracker.defeatTrainer(PETALBURG_GYM_LEADER.id);
                if (defeatRes.changed) {
                  audioController.playSE(EmeraldConstants.SE_APPLAUSE);
                  if (defeatRes.sound) audioController.playSE(defeatRes.sound);
                  if (defeatRes.tileUpdates) {
                    for (const tu of defeatRes.tileUpdates) {
                      const wx = hit ? hit[1].x + tu.x : tu.x;
                      const wy = hit ? hit[1].y + tu.y : tu.y;
                      paintNavigationMetatile(wx, wy, tu.metatileId);
                    }
                  }
                }
              } else if (proximity.trainer) {
                const defeatRes = petalburgGymTracker.defeatTrainer(proximity.trainer.id);
                if (defeatRes.changed) {
                  audioController.playSE(EmeraldConstants.SE_FU_ZAKU);
                  if (defeatRes.sound) audioController.playSE(defeatRes.sound);
                  if (defeatRes.tileUpdates) {
                    for (const tu of defeatRes.tileUpdates) {
                      const wx = hit ? hit[1].x + tu.x : tu.x;
                      const wy = hit ? hit[1].y + tu.y : tu.y;
                      paintNavigationMetatile(wx, wy, tu.metatileId);
                    }
                  }
                }
              }
            }

            // Check south exit doors
            const exitCheck = petalburgGymTracker.checkSouthExit(locX, locY);
            if (exitCheck.isExit && exitCheck.destX !== undefined && exitCheck.destY !== undefined) {
              if (exitCheck.sound) audioController.playSE(exitCheck.sound);
              const srcHdr = mapHeaders.get(curMap) ?? ({ id: curMap, warps: [], regionMapSection: 0, mapType: 0 } as unknown as MapHeader);
              void followNavigationWarp(srcHdr, -1, "step", {
                mapId: "MAP_PETALBURG_CITY_GYM",
                warpId: -1,
                x: exitCheck.destX,
                y: exitCheck.destY,
              });
              return;
            }
          }

          // Ash Grass (Route 113 & Lavaridge)
          if (MBEmerald.MetatileBehavior_IsAshGrass(arrivedBehavior)) {
            const currentMt = worldGrid.getMetatile(playerX, playerY);
            const ashRes = hoennAshTracker.onStep(arrivedBehavior, currentMt);
            if (ashRes.isAsh) {
              paintNavigationMetatile(playerX, playerY, ashRes.cleanMetatile);
              if (ashRes.sound) audioController.playSE(ashRes.sound);
            }
          }

          // Mt. Chimney Cable Car Station (Route 112 <-> Mt. Chimney Summit)
          if (isCableCarStation(curMap)) {
            if (locX === 6 && (locY === 3 || locY === 4)) {
              const ride = getCableCarDestination(curMap);
              if (ride) {
                audioController.playSE(EmeraldConstants.SE_DING_DONG);
                audioController.playSE(EmeraldConstants.SE_ELEVATOR);
                const srcHdr = mapHeaders.get(curMap) ?? ({ id: curMap, warps: [], regionMapSection: 0, mapType: 0 } as unknown as MapHeader);
                void followNavigationWarp(srcHdr, -1, "step", {
                  mapId: ride.destMap,
                  warpId: -1,
                  x: ride.x,
                  y: ride.y,
                });
                return;
              }
            }
          }
        }

        if (HOENN && index) {
          const hit = findMapAt(playerX, playerY);
          if (hit) {
            const [mid, info] = hit;
            const lx = playerX - info.x, ly = playerY - info.y;
            if (mid === "MAP_SKY_PILLAR_TOP" && ly <= 10 && !state.eventFlags.has("FLAG_AWAKENED_RAYQUAZA")) {
              state.eventFlags.add("FLAG_AWAKENED_RAYQUAZA");
              void runSkyPillarRayquazaCinematic(hoennCinematicHost);
              return;
            }
            const trg = index.triggers.find(t => t.map === mid && t.x === lx && t.y === ly);
            if (trg) {
              const wName = (trg as { weather?: string }).weather;
              const sName = (trg as { script?: string }).script ?? "";
              if (wName === "COORD_EVENT_WEATHER_VOLCANIC_ASH") {
                weatherOverlay?.setWeather(EmConstants.WEATHER_VOLCANIC_ASH);
              } else if (wName === "COORD_EVENT_WEATHER_SANDSTORM" || sName.includes("SandstormTrigger")) {
                weatherOverlay?.setWeather(EmConstants.WEATHER_SANDSTORM);
              } else if (wName === "COORD_EVENT_WEATHER_RAIN") {
                weatherOverlay?.setWeather(EmConstants.WEATHER_RAIN);
              } else if (wName === "COORD_EVENT_WEATHER_RAIN_THUNDERSTORM") {
                weatherOverlay?.setWeather(EmConstants.WEATHER_RAIN_THUNDERSTORM);
              } else if (wName === "COORD_EVENT_WEATHER_DOWNPOUR") {
                weatherOverlay?.setWeather(EmConstants.WEATHER_DOWNPOUR);
              } else if (wName === "COORD_EVENT_WEATHER_FOG_HORIZONTAL") {
                weatherOverlay?.setWeather(EmConstants.WEATHER_FOG_HORIZONTAL);
              } else if (wName === "COORD_EVENT_WEATHER_SUNNY" || sName.includes("SunTrigger")) {
                weatherOverlay?.setWeather(EmConstants.WEATHER_SUNNY);
              }
            }
          }
        }

        if (blockedArrival !== `${playerX},${playerY}`) blockedArrival = null;
        if (tryNavigationWarp("step", playerDir)) return;
        if (HOENN || JOHTO || !engineInteraction) checkTrainerSight();
        if (HOENN && engineInteraction && !dialogManager.isOpen()) {
          // pokeemerald ProcessPlayerFieldInput step checks (ON_FRAME, coord events, Repel, wild encounters).
          isStepping = true;
          const here = navigationSnapshot();
          const vehicle = playerMode === "surf" ? "surf" : playerMode === "bike" ? (state.bikeType === "acro" ? "acro" : "mach") : "walk";
          void engineInteraction.tryEmeraldStep(here, vehicle).catch(error => { console.error("Hoenn step", error); return false; }).then(hit => {
            isStepping = false;
            if (hit || dialogManager.isOpen()) { playerMoving = false; avatarAnimator?.stop(state.playerChar, playerMode, playerDir, viewerClock.tick); updatePlayerDisplay(); }
            else processPlayerStep();
          });
          return;
        }
        if (!HOENN && !JOHTO && engineInteraction) {
          // field_control_avatar.c CheckStandardWildEncounter on each tile-center step.
          isStepping = true;
          const here = navigationSnapshot();
          void engineInteraction.tryWildEncounter(here, playerMode === "surf").catch(error => { console.error('Encuentro salvaje', error); return false; }).then(hit => {
            isStepping = false;
            if (hit || dialogManager.isOpen()) { playerMoving = false; avatarAnimator?.stop(state.playerChar, playerMode, playerDir, viewerClock.tick); updatePlayerDisplay(); }
            else processPlayerStep();
          });
          return;
        } else if (JOHTO && engineInteraction && !isStepping && !warpBusy && !elevatorBusy && !dialogManager.isOpen()) {
          const behavior = worldGrid.behaviorAt(playerX, playerY);
          const isGrass = MB.MetatileBehavior_IsPokeGrass(behavior) || MB.MetatileBehavior_IsTallGrass(behavior) || MB.MetatileBehavior_IsLongGrass(behavior);
          const isWater = playerMode === "surf" || MB.MetatileBehavior_IsSurfable(behavior);
          if (isGrass || isWater) {
            if (gameSave.party.length === 0) {
              const hit = findMapAt(playerX, playerY);
              const curMap = hit ? hit[0] : "";
              if (curMap.includes("ROUTE29") || curMap.includes("NEW_BARK")) {
                dialogManager.show("Prof. Elm", [
                  "Wait! Do not enter the tall grass without a Pokémon!",
                  { text: " Visit my lab in New Bark Town to choose your starter.", strong: true }
                ]);
                playerMoving = false;
                avatarAnimator?.stop(state.playerChar, playerMode, playerDir, viewerClock.tick);
                updatePlayerDisplay();
                return;
              }
            } else if (Math.random() < 0.12) {
              isStepping = true;
              playerMoving = false;
              avatarAnimator?.stop(state.playerChar, playerMode, playerDir, viewerClock.tick);
              updatePlayerDisplay();
              const hit = findMapAt(playerX, playerY);
              const curMap = hit ? hit[0] : "";
              const wildOptions = isWater ? JOHTO_WILD_MONS[curMap]?.water : JOHTO_WILD_MONS[curMap]?.land;
              const speciesList = wildOptions && wildOptions.length > 0 ? wildOptions : (isWater ? [C.SPECIES_TENTACOOL] : [C.SPECIES_SENTRET, C.SPECIES_PIDGEY]);
              const species = speciesList[Math.floor(Math.random() * speciesList.length)]!;
              let level = 3;
              if (curMap.includes("ROUTE29") || curMap.includes("NEW_BARK") || curMap.includes("CHERRYGROVE")) level = Math.floor(Math.random() * 3) + 2;
              else if (curMap.includes("ROUTE30") || curMap.includes("ROUTE31")) level = Math.floor(Math.random() * 3) + 3;
              else if (curMap.includes("ROUTE32") || curMap.includes("ROUTE33")) level = Math.floor(Math.random() * 4) + 6;
              else if (curMap.includes("ROUTE34") || curMap.includes("ROUTE35") || curMap.includes("ILEX")) level = Math.floor(Math.random() * 4) + 10;
              else if (curMap.includes("ROUTE38") || curMap.includes("ROUTE39") || curMap.includes("LAKE")) level = Math.floor(Math.random() * 5) + 14;
              else if (isWater) level = Math.floor(Math.random() * 6) + 15;
              else level = Math.floor(Math.random() * 5) + 4;

              const enemy = createMon(species, level);
              const nav = navigationSnapshot();
              void engineInteraction.startWildBattle(enemy, nav).catch(error => {
                console.error("Encuentro salvaje Johto", error);
              }).finally(() => {
                isStepping = false;
                playerMoving = false;
                avatarAnimator?.stop(state.playerChar, playerMode, playerDir, viewerClock.tick);
                updatePlayerDisplay();
              });
              return;
            }
          }
        }

        if (!dialogManager.isOpen()) {
          processPlayerStep();
        } else {
          playerMoving = false;
          updatePlayerDisplay();
        }
      }
    };
    cancelPlayerMotion = viewerClock.subscribe(frame => animateStep(frame.tick));
  } else {
    if (HOENN) hoennBikeTracker.reset();
    const frontEnt = entityManager.findAt(targetX, targetY);
    if (frontEnt && !frontEnt.hidden && (frontEnt.element.graphics === "OBJ_EVENT_GFX_PUSHABLE_BOULDER" || frontEnt.graphicsId === C.OBJ_EVENT_GFX_PUSHABLE_BOULDER)) {
      if (tryPushBoulder(frontEnt, playerDir)) return;
    }
    if (!isStepping) {
      isStepping = true;
      playerMoving = true;
      stepRunning = false;
      audioController.playWallBump();
      playerStep = (playerStep + 1) % 4;
      const basePxX = (playerX - minX) * TILE;
      const basePxY = (playerY - minY) * TILE;
      const bumpDist = 3;
      const bumpDuration = avatarAnimator ? (playerMode === "bike" ? 16 : 32) * GBA_FRAME_MS : 90;
      avatarAnimator?.begin(state.playerChar, playerMode, playerDir, "bump", viewerClock.tick);
      const bumpStartTick = viewerClock.tick;

      const animateBump = (tick: number) => {
        const elapsed = (tick - bumpStartTick) * GBA_FRAME_MS;
        const t = Math.min(1, elapsed / bumpDuration);
        const offset = avatarAnimator ? 0 : Math.sin(t * Math.PI) * bumpDist;
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
          avatarAnimator?.stop(state.playerChar, playerMode, playerDir, viewerClock.tick);
          updatePlayerDisplay();
        }
      };
      cancelPlayerMotion = viewerClock.subscribe(frame => animateBump(frame.tick));
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

  // Puertas: abren el interior de destino en el visor de interiores (los exteriores se centran en el mundo).
  const doors = els.filter((e) => e.layer === "puerta" && e.destMap);
  if (doors.length > 0) {
    const box = document.createElement("div");
    box.style.cssText = "margin-top:12px;display:flex;flex-direction:column;gap:6px;";
    for (const d of doors) {
      const btn = document.createElement("button");
      btn.className = "btn";
      const exterior = d.destMap! in index.maps;
      const destTitle = (JOHTO ? formatJohtoInteriorName(d.destMap!) : undefined) ?? d.destName ?? d.destMap;
      btn.textContent = `${exterior ? "Ir a" : "Enter"} ${destTitle}`;
      btn.addEventListener("click", () => {
        if (exterior) centerOnMap(d.destMap!);
        else void interiorViewer.open(d.destMap!);
      });
      box.appendChild(btn);
    }
    panel.appendChild(box);
  }
}

/** Original warp triggers; animated doors are tested in front even when their map tile is solid. */
function tryNavigationWarp(phase: "input" | "front" | "step", direction: Direction): boolean {
  const point = phase === "front" ? { x: playerX, y: playerY - 1 } : { x: playerX, y: playerY };
  if (phase === "front" && direction !== "north") return false;
  if (phase === "step" && blockedArrival === `${point.x},${point.y}`) return false;
  const found = findMapAt(point.x, point.y);
  if (!found) return false;
  const [id, info] = found;
  const header = mapHeaders.get(id);
  if (!header) return false;
  const warpId = warpAt(header, point.x - info.x, point.y - info.y, playerElevation);
  if (warpId < 0) return false;
  const behavior = worldGrid.behaviorAt(point.x, point.y);
  let active = phase === "front" ? isWarpDoorBehavior(behavior)
    : phase === "input" ? inputWarpBehavior(behavior, direction) : stepWarpBehavior(behavior);
  if (!active && phase === "step" && navigationMap !== null && warpId >= 0) {
    active = true;
  }
  if (!active) return false;
  void followNavigationWarp(header, warpId, phase);
  return true;
}

/** A held walk bypasses collision on the arrival door itself, as Task_ExitDoor/ExitNonAnimDoor do. */
async function walkWarpStep(direction: Direction): Promise<void> {
  const dx = direction === "west" ? -1 : direction === "east" ? 1 : 0;
  const dy = direction === "north" ? -1 : direction === "south" ? 1 : 0;
  const x = playerVisualX, y = playerVisualY, started = viewerClock.tick;
  playerDir = direction; isStepping = true;
  avatarAnimator?.begin(state.playerChar, playerMode, direction, "walk", started);
  const offsets = avatarAnimator?.offsets("walk");
  const duration = offsets ? offsets.length * GBA_FRAME_MS : 160;
  await new Promise<void>(resolve => {
    const unsubscribe = viewerClock.subscribe(frame => {
      const elapsed = frame.tick - started;
      const progress = offsets ? (elapsed >= offsets.length ? 1 : offsets[Math.max(0, elapsed - 1)]! / TILE) : Math.min(1, (elapsed * GBA_FRAME_MS) / duration);
      playerVisualX = x + dx * TILE * progress;
      playerVisualY = groundVisualY = y + dy * TILE * progress;
      updatePlayerDisplay();
      if (progress < 1) return;
      unsubscribe(); playerX += dx; playerY += dy; isStepping = false;
      const elevation = worldGrid.elevationAt(playerX,playerY);
      if (elevation !== 0 && elevation !== 15) playerElevation = elevation;
      if (elevation !== 15) playerCurrentElevation = elevation & 0xf;
      avatarAnimator?.stop(state.playerChar, playerMode, direction, frame.tick);
      updatePlayerDisplay();
      resolve();
    });
  });
}

/** Task_StairWarp / UpdateStairsMovement and ExitStairsMovement from field_fadetransition.c.
 * The camera follows the map anchor; x2/y2 offset only the sprite, in signed fixed point.
 */
function startStairMovement(behavior: number, exit: boolean): () => void {
  const [speedX,speedY]=GetStairsMovementDirection(behavior),speed={x:speedX,y:speedY},started=viewerClock.tick;
  let x=exit?speed.x*16:0,y=exit?speed.y*16:0,timer=exit?16:0;
  warpPriority=exit?null:1;isStepping=true;
  avatarAnimator!.begin(state.playerChar,playerMode,playerDir,exit?"turn":"walk",started);
  const display=()=>{
    warpOffsetX=x>>5;warpOffsetY=y>>5;
    updatePlayerDisplay();
    playerEl!.dataset.warpMotion=JSON.stringify({phase:exit?"exit":"entry",tick:viewerClock.tick-started,
      x:warpOffsetX,y:warpOffsetY,speedX:speed.x,speedY:speed.y});
  };
  display();
  const off=viewerClock.subscribe(()=>{
    if(exit){if(timer>0){x-=speed.x;y-=speed.y;timer--;}
      if(timer===8)avatarAnimator!.stop(state.playerChar,playerMode,playerDir,viewerClock.tick);
    }
    else{if(speed.y>0||timer>6)y+=speed.y;x+=speed.x;timer++;}
    display();
  });
  return ()=>{off();warpOffsetX=warpOffsetY=0;warpPriority=null;isStepping=false;
    avatarAnimator!.stop(state.playerChar,playerMode,playerDir,viewerClock.tick);
    delete playerEl!.dataset.warpMotion;updatePlayerDisplay();
  };
}

const warpTasks=new TaskManager();
let teleportFixedPriority=false,teleportSubpriority=0,teleportSubsprites=0,teleportFaceTick=-1;
const warpDirections=["south","south","north","west","east"] as const;
const warpDirectionIds={south:C.DIR_SOUTH,north:C.DIR_NORTH,west:C.DIR_WEST,east:C.DIR_EAST};
const warpActor: TeleportObject & FallObject & {sprite:{x2:number}}={
  get invisible(){return playerWarpHidden;},set invisible(value){playerWarpHidden=value;},
  triggerGroundEffectsOnMove:false,triggerGroundEffectsOnStop:false,landingJump:false,
  get facingDirection(){return warpDirectionIds[playerDir];},
  set facingDirection(direction){playerDir=warpDirections[direction]!;},
  get fixedPriority(){return teleportFixedPriority;},set fixedPriority(value){teleportFixedPriority=value;},
  sprite:{
    get centerToCornerVecY(){return -parseFloat(playerEl!.style.height)/2;},
    get x2(){return warpOffsetX;},set x2(value){warpOffsetX=value;},
    get y2(){return warpOffsetY;},set y2(value){warpOffsetY=value;},
    get priority(){return warpPriority??cdata<number[]>("event_object_movement","sElevationToPriority")[playerElevation]!;},
    set priority(value){warpPriority=value;},
    get subpriority(){return teleportSubpriority;},set subpriority(value){teleportSubpriority=value;},
    get subspriteMode(){return teleportSubsprites;},set subspriteMode(value){teleportSubsprites=value;},
  },
};
const navigationTeleport=new TeleportAnimation({
  object:()=>warpActor,
  // The native 240x160 camera centers the tile at y80: the 32px sprite center is y72.
  // Keep that virtual anchor when the viewer reveals extra tiles around the native view.
  screenY:()=>C.DISPLAY_HEIGHT/2-TILE/2,
  clearHeldMovement:()=>stepTarget===null,
  heldMovementFinished:()=>viewerClock.tick>teleportFaceTick,
  face:direction=>{playerDir=warpDirections[direction]!;teleportFaceTick=viewerClock.tick;
    avatarAnimator!.stop(state.playerChar,playerMode,playerDir,viewerClock.tick);},
},warpTasks);
async function animateTeleport(incoming: boolean): Promise<void> {
  const started=viewerClock.tick;isStepping=true;
  if(incoming)navigationTeleport.StartTeleportInPlayerAnim();else navigationTeleport.StartTeleportWarpOutPlayerAnim();
  const display=()=>{updatePlayerDisplay();playerEl!.dataset.warpMotion=JSON.stringify({phase:incoming?"teleport-in":"teleport-out",
    tick:viewerClock.tick-started,x:warpOffsetX,y:warpOffsetY,direction:playerDir,priority:warpActor.sprite.priority});};
  display();
  await new Promise<void>(resolve=>{const off=viewerClock.subscribe(()=>{
    warpTasks.run();display();
    if(incoming?navigationTeleport.WaitTeleportInPlayerAnim():navigationTeleport.WaitTeleportWarpOutPlayerAnim())return;
    off();isStepping=false;delete playerEl!.dataset.warpMotion;resolve();
  });});
}

const navigationFall=new FallWarpAnimation({
  object:()=>warpActor,screenY:()=>C.DISPLAY_HEIGHT/2-TILE/2,
  preventStep:value=>{fallPreventStep=value;},
  face:direction=>{playerDir=warpDirections[direction]!;avatarAnimator!.stop(state.playerChar,playerMode,playerDir,viewerClock.tick);},
  weatherFinished:()=>!warpVisuals!.isFading,playSound:id=>audioController.playSE(id),
  beginPan:()=>{warpCameraY=0;},pan:y=>{warpCameraY=y;},
  finish:()=>{warpCameraY=0;
    const map=findMapAt(playerX,playerY)?.[0];
    if((map==="MAP_SEAFOAM_ISLANDS_B3F"||map==="MAP_SEAFOAM_ISLANDS_B4F")&&MB.MetatileBehavior_IsSurfable(worldGrid.behaviorAt(playerX,playerY)))playerMode="surf";
  },
},warpTasks);
async function animateFallArrival(): Promise<void> {
  const started=viewerClock.tick;isStepping=true;
  warpActor.triggerGroundEffectsOnMove=warpActor.triggerGroundEffectsOnStop=warpActor.landingJump=false;
  navigationFall.start();
  await new Promise<void>(resolve=>{const off=viewerClock.subscribe(()=>{
    warpTasks.run();
    if(!warpActor.fixedPriority)warpPriority=null;
    const actor={x:playerX,y:playerY,previousX:playerX,previousY:playerY,direction:playerDir,previousDirection:playerDir,
      elevation:playerElevation,priority:warpActor.sprite.priority,vehicle:playerMode,landingJump:warpActor.landingJump};
    if(warpActor.triggerGroundEffectsOnMove){fieldEffects.onGroundStep("begin",actor);warpActor.triggerGroundEffectsOnMove=false;}
    if(warpActor.triggerGroundEffectsOnStop){fieldEffects.onGroundStep("finish",actor);warpActor.triggerGroundEffectsOnStop=false;}
    updatePlayerDisplay();playerEl!.dataset.warpMotion=JSON.stringify({phase:"fall-in",tick:viewerClock.tick-started,
      stage:navigationFall.stage,y:warpOffsetY,pan:warpCameraY,invisible:playerWarpHidden,priority:warpActor.sprite.priority,vehicle:playerMode});
    if(navigationFall.active)return;
    off();isStepping=false;delete playerEl!.dataset.warpMotion;resolve();
  });});
}
async function animateFallDeparture(): Promise<void> {
  // hole.inc EventScript_DoFallWarp. Controls are already locked by followNavigationWarp.
  // delay's native callback yields one frame before bytecode resumes (script.c RunScriptCommand).
  await warpVisuals!.wait(20+1);playerWarpHidden=true;updatePlayerDisplay();
  // SetInvisible executes, movement reaches STEP_END, then waitmovement resumes bytecode.
  await warpVisuals!.wait(3);audioController.playSE(C.SE_FALL);
  await warpVisuals!.wait(60+1);
}

let escalatorFade: Promise<void> | null = null, escalatorFadeDone = false, escalatorWarped = false, escalatorFaceTick = -1, escalatorFadeMode = 0;
let escalatorMetatileIds: Record<string, number> | null = null;
const navigationEscalator = new EscalatorWarpAnimation({
  sprite: () => warpActor.sprite,
  freezeObjects: () => {}, unfreezeObjects: () => {},
  playerMovementReady: () => stepTarget === null,
  holdFacing: () => {},
  faceRight: () => { playerDir = "east"; escalatorFaceTick = viewerClock.tick;
    avatarAnimator!.stop(state.playerChar, playerMode, playerDir, viewerClock.tick); },
  playerMovementFinished: () => viewerClock.tick > escalatorFaceTick,
  walkRight: () => {},
  playEscalatorSound: () => audioController.playSE(C.SE_ESCALATOR),
  beginFadeOut: () => { escalatorFadeDone = false;
    escalatorFade = warpVisuals!.fadeScreen(escalatorFadeMode).then(() => { escalatorFadeDone = true; }); },
  fadeFinished: () => escalatorFadeDone,
  warpIntoMap: () => { escalatorWarped = true; },
  destinationIsDownEscalator: () => worldGrid.behaviorAt(playerX, playerY) === C.MB_DOWN_ESCALATOR,
  beginWarpIn: () => {}, unlockControls: () => {}, questLog: () => {},
}, new EscalatorTiles({
  metatileIdAt: (x, y) => worldGrid.getMetatile(x, y),
  setMetatileIdAt: (x, y, id) => paintNavigationMetatile(x, y, id),
}, () => ({ x: playerX, y: playerY }), warpTasks, name => {
  const id = escalatorMetatileIds?.[name];
  if (id === undefined) throw Error(`Missing metatile constant ${name}`);
  return id;
}), warpTasks);
async function animateEscalator(outgoing: boolean, behavior: number): Promise<void> {
  const started = viewerClock.tick; isStepping = true;
  escalatorWarped = false; escalatorFaceTick = viewerClock.tick;
  if (outgoing) navigationEscalator.StartEscalatorWarp(behavior, 10); else navigationEscalator.FieldCB_EscalatorWarpIn();
  await new Promise<void>(resolve => {
    const off = viewerClock.subscribe(() => {
      warpTasks.run(); updatePlayerDisplay();
      playerEl!.dataset.warpMotion = JSON.stringify({ phase: outgoing ? "escalator-out" : "escalator-in",
        tick: viewerClock.tick - started, stage: navigationEscalator.stage, x: warpOffsetX, y: warpOffsetY });
      if (outgoing ? !escalatorWarped : navigationEscalator.active) return;
      off(); isStepping = false; delete playerEl!.dataset.warpMotion; resolve();
    });
  });
}

/** Source elevator destination scripts; DOM menu adapts presentation, not floor/warp data. */
function tryElevatorPanel(x:number,y:number):boolean {
  if(HOENN||JOHTO||isStepping||warpBusy||elevatorBusy)return false;
  const found=findMapAt(playerX,playerY);if(!found)return false;
  const [mapId,info]=found,definition=elevators[mapId];if(!definition)return false;
  if(!definition.panels.some(p=>p.x===x-info.x&&p.y===y-info.y&&(p.elevation===0||p.elevation===playerElevation)))return false;
  keysDown.clear();playerRunning=false;
  if(definition.requiredFlag&&!state.eventFlags.has(definition.requiredFlag)){
    dialogManager.show("Elevator",[definition.deniedText!]);return true;
  }
  const address=navigationWarps.returnAddress;
  if(!address||definition.floors[address.mapId]===undefined){
    dialogManager.show("Elevator",["Enter from a floor to set the return destination."]);return true;
  }
  elevatorBusy=true;
  void (async()=>{
    try{
      const from=definition.floors[address.mapId]!;
      const current=definition.choices.findIndex(c=>c.floor===from);
      const selected=await elevatorMenu.choose(definition.choices.map(c=>c.label),current);
      if(selected===null)return;
      const choice=definition.choices[selected]!;
      if(!choice.destination)return; // Trainer Tower SelectRoof intentionally just closes the menu.
      navigationWarps.restore(choice.destination); // setdynamicwarp precedes the same-floor branch.
      if(choice.floor===from)return;
      await animateNavigationElevator(from,choice.floor);
      if(choice.autoExit)await exitTrainerTowerElevator(mapHeaders.get(mapId)!,choice);
    }catch(error){console.error("Navigation elevator",error);dialogManager.show("Elevator",[String(error)]);}
    finally{elevatorBusy=false;keysDown.clear();warpCameraY=0;updatePlayerDisplay();writeHash();}
  })();
  return true;
}

async function animateNavigationElevator(from:number,to:number):Promise<void>{
  await loadCData("field_specials");
  const found=findMapAt(playerX,playerY);if(!found)throw Error("Elevator map missing");
  const info=found[1],scheduler=new TaskManager();
  const animation=new ElevatorAnimation({
    stopCameraPanning:()=>{warpCameraY=0;},pan:(_x,y)=>{warpCameraY=y;},
    restoreCameraPanning:()=>{warpCameraY=0;},resumeScript:()=>{},
    playSE:id=>audioController.playSE(id),
    setMetatile:(x,y,value)=>paintNavigationMetatile(info.x+x-MAP_OFFSET,info.y+y-MAP_OFFSET,value),
    // paintNavigationMetatile redraws each changed cell immediately.
    drawMap:()=>{},
  },scheduler);
  // The awaiting navigation event replaces ScriptContext_Enable; window tasks finish independently.
  animation.AnimateElevator(from,to);
  await new Promise<void>(resolve=>{
    const off=viewerClock.subscribe(()=>{
      scheduler.run();updatePlayerDisplay();
      if(!scheduler.tasks.some(t=>t.isActive)){off();resolve();}
    });
  });
}
async function exitTrainerTowerElevator(source:MapHeader,choice:ElevatorChoice):Promise<void>{
  // TrainerTower_Elevator/scripts.inc: delay25, faster in-place down, delay16, down/right/right/down, warp.
  await warpVisuals!.wait(25);
  playerDir="south";avatarAnimator!.begin(state.playerChar,playerMode,playerDir,"inPlaceFaster",viewerClock.tick);
  await warpVisuals!.wait(4);avatarAnimator!.stop(state.playerChar,playerMode,playerDir,viewerClock.tick);
  await warpVisuals!.wait(16);
  for(const direction of ["south","east","east","south"] as const)await walkWarpStep(direction);
  await followNavigationWarp(source,0,"input",choice.destination!);
}

async function followNavigationWarp(source: MapHeader, warpId: number, phase: "input" | "front" | "step", address?: WarpAddress): Promise<void> {
  if (warpBusy) return;
  warpBusy = true; content.setAttribute("aria-busy","true"); keysDown.clear(); playerMoving = false;
  const old = { map: navigationMap, x: playerX, y: playerY, direction: playerDir, vehicle: playerMode, dynamic: navigationWarps.returnAddress };
  const sourceBehavior = worldGrid.behaviorAt(playerX, playerY);
  const falling = phase === "step" && (
    MB.MetatileBehavior_IsFallWarp(sourceBehavior)
    || MBEmerald.MetatileBehavior_IsCrackedFloorHole(sourceBehavior)
    || MBEmerald.MetatileBehavior_IsMtPyreHole(sourceBehavior)
  );
  const teleport=phase==="step"&&MB.MetatileBehavior_IsWarpPad(sourceBehavior);
  const escalator=phase==="step"&&MB.MetatileBehavior_IsEscalator(sourceBehavior);
  let switched = false;
  let door: ViewerDoorAnimation | null = null;
  let stopStairs: (()=>void) | null = null;
  try {
    let destination = address ? await navigationWarps.resolveAddress(address) : await navigationWarps.resolve(source, warpId);
    if (HOENN && destination.header.id.includes("SHOAL_CAVE")) {
      const tide = getShoalTide();
      const tideDest = getShoalCaveTideDestination(destination.header.id, tide);
      if (tideDest && tideDest !== destination.header.id) {
        destination = await navigationWarps.resolveAddress({ mapId: tideDest, warpId: destination.warpId, x: destination.x, y: destination.y });
      }
    }
    let cavePreview = false;
    if (!HOENN && !JOHTO) {
      await loadCData("map_preview_screen");
      cavePreview = source.regionMapSection !== destination.header.regionMapSection
        && cdata<Array<{mapsec:number;type:number}>>("map_preview_screen","sMapPreviewScreenData")
          .some(row=>row.mapsec===destination.header.regionMapSection&&row.type===C.MPS_TYPE_CAVE);
    }
    if (phase === "front") {
      const sourceInfo = findMapAt(playerX,playerY)![1];
      const entry = source.warps[warpId]!;
      const resource = fillSources.get(source.id);
      if (!resource || !avatarDepth || !warpVisuals) throw Error("Door source is not resident");
      door = await ViewerDoorAnimation.create(resource,worldGrid,avatarDepth,content,
        sourceInfo.x+entry.x,sourceInfo.y+entry.y,minX,minY,viewerClock);
      audioController.playSE(door.sound);
      await door.animate(true);
      await walkWarpStep("north");
      playerWarpHidden=true;updatePlayerDisplay();
      await door.animate(false);door.dispose();door=null;
    }
    if(phase==="input"&&MB.MetatileBehavior_IsDirectionalStairWarp(worldGrid.behaviorAt(playerX,playerY))){
      if(playerMode==="bike"){
        playerMode="walk";avatarAnimator?.stop(state.playerChar,playerMode,playerDir,viewerClock.tick);
        updatePlayerDisplay();await warpVisuals!.wait(12);
      }
      stopStairs=startStairMovement(worldGrid.behaviorAt(playerX,playerY),false);
      audioController.playSE(C.SE_EXIT);await warpVisuals!.wait(12);
    }
    if(falling)await animateFallDeparture();
    if(teleport){audioController.playSE(C.SE_WARP_IN);await animateTeleport(false);playerWarpHidden=true;updatePlayerDisplay();}
    const fadeOut=!cavePreview&&MapTransitionIsEnter(source.mapType,destination.header.mapType)?FADE_TO_WHITE:FADE_TO_BLACK;
    if(escalator){
      escalatorMetatileIds??=await fetch("/fr/constants.json").then(r=>r.json() as Promise<Record<string,number>>);
      // Task_EscalatorWarpFieldEffect starts the fade itself and keeps animating until it finishes.
      escalatorFadeMode=fadeOut;escalatorFade=null;escalatorFadeDone=false;
      await animateEscalator(true,sourceBehavior);await escalatorFade;
    }else await warpVisuals!.fadeScreen(fadeOut);
    stopStairs?.();stopStairs=null;
    viewerClock.pause("warp");
    content.style.visibility = "hidden";
    resetExploreSession();warpOffsetX=warpOffsetY=0;warpPriority=null;teleportFixedPriority=false;
    if (enterViewerEventMap(destination.mapId, true)) { entityManager.resetRemovedObjects(); objectSpawns.reset(); }
    await changeNavigationWorld(destination.mapId); switched = true;
    const info = index.maps[destination.mapId]!;
    if(destination.arrival.x<0||destination.arrival.y<0||destination.arrival.x>=info.width||destination.arrival.y>=info.height)throw Error("Warp coordinates outside destination layout");
    playerX = info.x + destination.arrival.x; playerY = info.y + destination.arrival.y;
    playerElevation = worldGrid.elevationAt(playerX, playerY);
    if (playerElevation === 15) playerElevation = 0;
    playerCurrentElevation = playerElevation;
    const behavior = worldGrid.behaviorAt(playerX, playerY);
    playerDir = warpArrivalDirection(behavior,playerDir);
    forcedNavigation.reset(playerDir);
    if(falling)playerMode="walk";
    if (!destination.header.allowCycling && playerMode === "bike") playerMode = "walk";
    if (playerMode === "surf" && !worldGrid.isWaterTile(playerX, playerY)) playerMode = "walk";
    playerVisualX = (playerX - minX) * TILE; playerVisualY = groundVisualY = (playerY - minY) * TILE;
    playerActive = true;
    await preloadExplorationSprites();
    navigationWarps.commit(destination);
    blockedArrival = `${playerX},${playerY}`;
    viewerClock.resume("warp"); content.style.visibility = "";
    const fromWhite=MapTransitionIsExit(source.mapType,destination.header.mapType);
    const isEnter = MapTransitionIsEnter(source.mapType, destination.header.mapType);
    if (isEnter) {
      playerDir = "north";
    }
    if (falling) {
      playerWarpHidden=true;updatePlayerDisplay();
      await Promise.all([warpVisuals!.fadeScreen(fromWhite?FADE_FROM_WHITE:FADE_FROM_BLACK),animateFallArrival()]);
    } else if (teleport) {
      playerWarpHidden=false;updatePlayerDisplay();audioController.playSE(C.SE_WARP_OUT);
      await Promise.all([warpVisuals!.fadeScreen(fromWhite?FADE_FROM_WHITE:FADE_FROM_BLACK),animateTeleport(true)]);
    } else if (escalator) {
      // FieldCB_EscalatorWarpIn: fade in while the rider slides onto the escalator, then walk right.
      playerWarpHidden=false;updatePlayerDisplay();
      await Promise.all([warpVisuals!.fadeScreen(fromWhite?FADE_FROM_WHITE:FADE_FROM_BLACK),animateEscalator(false,behavior)]);
      await walkWarpStep("east");
    } else if (isWarpDoorBehavior(behavior) && !isEnter) {
      playerWarpHidden=true;updatePlayerDisplay();
      const resource=fillSources.get(destination.mapId);
      if(!resource||!avatarDepth)throw Error("Arrival door is not resident");
      door=await ViewerDoorAnimation.create(resource,worldGrid,avatarDepth,content,playerX,playerY,minX,minY,viewerClock);
      const wipe=warpVisuals!.outwardWipe();
      const fade=warpVisuals!.fadeScreen(fromWhite?FADE_FROM_WHITE:FADE_FROM_BLACK,3);
      await warpVisuals!.wait(25);
      audioController.playSE(door.sound);await door.animate(true);
      playerWarpHidden=false;updatePlayerDisplay();
      const walking=walkWarpStep("south");
      await warpVisuals!.wait(14);await door.animate(false);
      await Promise.all([walking,fade,wipe]);door.dispose();door=null;
    } else {
      const nonAnimDoor = MB.MetatileBehavior_IsNonAnimDoor(behavior) || MBEmerald.MetatileBehavior_IsNonAnimDoor(behavior);
      playerWarpHidden=nonAnimDoor;updatePlayerDisplay();
      const fade=warpVisuals!.fadeScreen(fromWhite?FADE_FROM_WHITE:FADE_FROM_BLACK);
      if(MB.MetatileBehavior_IsDirectionalStairWarp(behavior)){
        stopStairs=startStairMovement(behavior,true);await warpVisuals!.wait(17);stopStairs();stopStairs=null;
      }
      await fade;
      playerWarpHidden=false;updatePlayerDisplay();
      if (nonAnimDoor) await walkWarpStep(playerDir);
    }
    blockedArrival = `${playerX},${playerY}`;
    fieldEffects.onGroundStep("spawn", { x:playerX,y:playerY,previousX:playerX,previousY:playerY,direction:playerDir,previousDirection:playerDir,
      landingJump:false,vehicle:playerMode,elevation:playerElevation,priority:(HOENN||JOHTO)?(hasCData("event_object_movement","sElevationToPriority")?cdata<number[]>("event_object_movement","sElevationToPriority")[playerElevation]??2:2):cdata<number[]>("event_object_movement","sElevationToPriority")[playerElevation] });
    updatePlayerDisplay(); writeHash();
  } catch (error) {
    console.error("Navigation warp", error);
    navigationWarps.restore(old.dynamic);
    if (switched || !playerActive) {
      await changeNavigationWorld(old.map ?? source.id);
      playerX = old.x; playerY = old.y; playerDir = old.direction; playerMode = old.vehicle;
      playerElevation = worldGrid.elevationAt(playerX, playerY);playerCurrentElevation = playerElevation;
      playerVisualX = (playerX-minX)*TILE; playerVisualY = groundVisualY = (playerY-minY)*TILE; playerActive = true;
    }
    panel.textContent = `Unable to change maps: ${String(error)}`;
  } finally {
    stopStairs?.();door?.dispose();navigationTeleport.reset();navigationFall.reset();navigationEscalator.reset();fallPreventStep=false;warpCameraY=0;warpOffsetX=warpOffsetY=0;warpPriority=null;teleportFixedPriority=false;
    warpVisuals?.clear();playerWarpHidden=false;
    viewerClock.resume("warp"); content.style.visibility = "";
    warpBusy = false; content.setAttribute("aria-busy","false"); playerMoving = false; updatePlayerDisplay(); writeHash();
  }
}

async function build(): Promise<void> {
  state.loadStored();
  parseHash();
  if (startExplore) { document.body.classList.add("exploring"); document.body.setAttribute("aria-busy", "true"); }
  const mapsRoot = JOHTO ? "/hns" : HOENN ? "/emerald" : "/fr";
  const mapsReady = fetch(`${mapsRoot}/maps.json`).then(async response => {
    if (!response.ok) throw new Error(`maps.json: HTTP ${response.status}`);
    return (await response.json()).maps as typeof allMaps;
  });
  const jumpReady = !startExplore ? Promise.resolve() : loadCData("event_object_movement").then(() => {
    jumpArc = cdata<number[]>("event_object_movement", "sJumpY_High");
    if (jumpArc.length !== 16 || jumpArc.some(value => !Number.isInteger(value))) throw new Error("Invalid source jump arc");
  });

  if (loadingText) loadingText.textContent = `Downloading map index for ${GAME_NAME}…`;
  const avatarReady = startExplore ? ((HOENN || JOHTO) ? jumpReady.then(async () => {
    avatarDepth = new AvatarDepth(content);
    warpVisuals = new ViewerWarpVisuals(document.getElementById("main")!, viewerClock);
    try {
      jumpShadow = await JumpShadow.create(content);
    } catch (e) {
      console.warn("No jump shadow in " + GAME_NAME, e);
    }
  }) : fetch("/fr/objects.json").then(async response => {
    if (!response.ok) throw new Error(`objects.json: HTTP ${response.status}`);
    const data = await response.json() as AvatarData;
    avatarAnimator = new AvatarAnimator(data);
    await avatarAnimator.preload();
    surfSupport = await SurfSupport.create(content);
    jumpShadow = await JumpShadow.create(content);
    await jumpReady;
    playerReflection = await PlayerReflection.create(data,content,viewerClock.tick);
    avatarDepth = new AvatarDepth(content);
    warpVisuals = new ViewerWarpVisuals(document.getElementById("main")!,viewerClock);
  })) : Promise.resolve();
  const elevatorReady = (HOENN || JOHTO) ? Promise.resolve() : loadElevators().then(data=>{elevators=data;});
  const [,worldData] = await Promise.all([elevatorReady, JOHTO ? fetchJohtoIndex() : (HOENN ? fetchHoennIndex() : fetchWorldIndex()), mapsReady, jumpReady, avatarReady]);
  if (HOENN || JOHTO) await loadHoennGfx("/emerald");
  exteriorWorld = worldData;
  index = worldData.index;
  minX = worldData.minX;
  minY = worldData.minY;
  if (!HOENN && !JOHTO && startExplore) {
    const explicitExternalMap = startMapId && startMapId !== "MAP_PALLET_TOWN_PLAYERS_HOUSE_2F";
    await initializeViewerSession(index.initialFlags, {
      forceTemporary: !!explicitExternalMap,
      gender: state.playerChar === "leaf" ? C.FEMALE : C.MALE,
    });
  } else if (HOENN && startExplore) {
    await initializeHoennRegion();
  } else if (JOHTO && startExplore) {
    initializeHoennSessionFlags(index.initialFlags);
  }

  streaming = startExplore;
  if (streaming) {
    if (startX !== null) startX *= 2 / initialZoom;
    if (startY !== null) startY *= 2 / initialZoom;
    initialZoom = 2;
  }
  worldGrid = new WorldGrid(index.world.width, index.world.height, minX, minY, streaming);
  entityManager = new EntityManager(content, minX, minY);
  dialogManager = new DialogManager();
  elevatorMenu = new ElevatorMenu();
  interiorViewer = new InteriorViewer({
    isExterior: (mapId) => mapId in index.maps,
    showExterior: (mapId) => { centerOnMap(mapId); },
    mapName: (mapId) => allMaps[mapId]?.name,
  });
  // Sonda de pruebas (tools/playtest/smoke/interiors.job.mjs): abre cualquier interior sin pasar por la UI.
  (window as unknown as { frInterior?: InteriorViewer }).frInterior = interiorViewer;
  const effectsReady = ViewerFieldEffects.create(worldGrid, viewerClock, HOENN || JOHTO);
  [allMaps, fieldEffects] = await Promise.all([mapsReady, effectsReady, jumpReady]).then(([maps, effects]) => [maps, effects] as const);
  let disposeEffects = installFieldFxRenderer(fieldEffects, content, minX, minY);
  let disposeEffectsSound = fieldEffects.subscribe(event => { if (event.type === "sound") audioController.playSE(event.id); });
  const unbindVisibility = bindViewerClockVisibility();
  const unsubscribeSimulation = viewerClock.subscribe(frame => {
    audioController.frame(Boolean(engineInteraction?.open));
    // One GBA frame of exploration; the engine counts its own frames while the clock is paused for it.
    if (!HOENN && !JOHTO) PlayTimeCounter_Update();
    playerReflection?.tick(frame.tick);
    if(playerActive&&!interiorViewer.isOpen())avatarDepth?.update(playerVisualX,isStepping?groundVisualY:playerVisualY,minX,minY,playerElevation);
    if (playerActive && playerEl && avatarAnimator && !isStepping && !interiorViewer.isOpen()) {
      const bob = surfSupport?.update(playerMode === "surf", playerDir, playerVisualX, playerVisualY, frame.tick) ?? 0;
      playerEl.style.top = `${playerVisualY - 16 + bob}px`;
      fieldEffects.setActorVisual({xPx:playerVisualX+minX*TILE,groundYPx:playerVisualY+minY*TILE,height:32,elevation:playerElevation});
      playerReflection?.update(avatarAnimator.frame(state.playerChar,playerMode,playerDir,frame.tick),worldGrid,
        {x:playerX,y:playerY},{x:playerX,y:playerY},playerVisualX,playerVisualY,bob,minX,minY,frame.tick);
    }
    if (playerActive && syncEntityPresence()) updateEntitiesView();
    if (playerActive && !interiorViewer.isOpen()) entityManager.updateAutonomousBehaviors(frame.elapsedMs, playerX, playerY, worldGrid);
    if (weatherOverlay && playerActive && !interiorViewer.isOpen()) {
      const screenX = (playerVisualX + minX * TILE) * camera.zoom - viewport.scrollLeft + (TILE * camera.zoom) / 2;
      const screenY = (playerVisualY + minY * TILE) * camera.zoom - viewport.scrollTop + (TILE * camera.zoom) / 2;
      weatherOverlay.update(screenX, screenY, camera.zoom);
    }
  });
  window.addEventListener("pagehide", event => {
    if (event.persisted) { viewerClock.pause("pagehide"); return; }
    sectorLoader?.dispose(); sectorBorder?.dispose(); explorationUi?.dispose(); mapPopup?.dispose(); weatherOverlay?.dispose();
    resetExploreSession(); surfSupport?.dispose(); jumpShadow?.dispose(); playerReflection?.dispose(); avatarDepth?.dispose(); warpVisuals?.dispose(); disposeEffects(); disposeEffectsSound(); unbindVisibility(); unsubscribeSimulation(); animController?.stop();
  });
  window.addEventListener("pageshow", () => viewerClock.resume("pagehide"));

  const byPair = new Map<string, string[]>();
  const layoutsByMap = new Map<string, Awaited<ReturnType<typeof rom.loadLayout>>>();

  if (loadingText) loadingText.textContent = "Loading map layouts…";
  const mapEntries = Object.entries(index.maps);
  const loadedLayouts = streaming ? [] : await Promise.all(
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
    viewerClock,
    renderer => { sectorBorder?.invalidate(renderer); avatarDepth?.invalidate(); if(playerActive)avatarDepth?.update(playerVisualX,isStepping?groundVisualY:playerVisualY,minX,minY,playerElevation); updateSectorBorder(); }
  );

  let contextData: Rom | null = null;
  const renderMap = async (id: string): Promise<SectorResource> => {
    const info = index.maps[id];
    // A private ROM cache belongs to this sector and dies with it (no shared engine cache eviction).
    const data = contextData ?? (streaming ? new Rom() : rom);
    const layout = layoutsByMap.get(id) ?? await data.loadLayout(info.layout);
    if (!mapHeaders.has(id)) mapHeaders.set(id, await data.loadMap(id));
    // The atlas index omits ordinary static NPCs. Hoenn interactions need the exported objects;
    // Kanto additionally exposes its source port sailor for the adapted unified-world ferry.
    if (streaming && !JOHTO && (HOENN || id === "MAP_VERMILION_CITY")) {
      const elements = elementsByMap.get(id) ?? [];
      for (const object of mapHeaders.get(id)!.objects) {
        if (object.clone || (!HOENN && object.scriptName !== "VermilionCity_EventScript_FerrySailor")) continue;
        let element = elements.find(e => e.localId === object.localId);
        if (!element) { element = cloneElement(id, object); elements.push(element); }
        if (!entityManager.entities.some(e => e.element.map === id && e.element.localId === object.localId)) {
          const dir: Direction = element.direction === "up" ? "north" : element.direction === "left" ? "west" : element.direction === "right" ? "east" : "south";
          entityManager.addEntity(element, info.x + object.x, info.y + object.y, dir);
        }
      }
      elementsByMap.set(id, elements);
    }
    if(streaming&&!HOENN&&!JOHTO){
      const header=mapHeaders.get(id)!;
      for(const entry of header.objects){
        if(!entry.clone)continue;
        const target=mapHeaders.get(entry.targetMap)??await data.loadMap(entry.targetMap);
        mapHeaders.set(entry.targetMap,target);
        const source=target.objects[entry.targetLocalId-1],origin=index.maps[entry.targetMap];
        if(!source||source.clone||!origin)throw Error(`Clone without a template: ${id} -> ${entry.targetMap}#${entry.targetLocalId}`);
        if(origin.x+source.x!==info.x+entry.x||origin.y+source.y!==info.y+entry.y)throw Error(`Clone outside the connection: ${id}`);
        if(!entityManager.entities.some(e=>e.element.map===entry.targetMap&&e.element.localId===source.localId)){
          const element=cloneElement(entry.targetMap,source);
          const dir:Direction=element.direction==='up'?'north':element.direction==='left'?'west':element.direction==='right'?'east':'south';
          entityManager.addEntity(element,origin.x+source.x,origin.y+source.y,dir);
        }
      }
    }
    const grid = streaming ? new WorldGrid(info.width, info.height, info.x, info.y) : worldGrid;
    const [primary, secondary] = await Promise.all([data.loadTileset(layout.primary), data.loadTileset(layout.secondary)]);
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

    let animated: AnimatedMap | undefined;
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
      if (streaming && y % 16 === 15) await new Promise<void>(resolve => setTimeout(resolve, 0));
      for (let x = 0; x < info.width; x++) {
        const block = layout.blocks[y * info.width + x]!;
        const mt = block & 0x3ff;
        const { bottom, top } = renderer.metatile(mt);
        bctx.drawImage(bottom, x * TILE, y * TILE);
        bctx.drawImage(top, x * TILE, y * TILE);
        const hasCollision = ((block & 0xc00) >> 10) !== 0;
        if (!streaming && hasCollision) mark(ctxFor("colision"), x, y, LAYER_COLORS.colision);
        const beh = behaviorOf(primary.attributes, secondary.attributes, mt);
        const isWater = BEHAVIOR_TESTS.water(beh);
        const isGrass = BEHAVIOR_TESTS.grass(beh);
        const isSand = BEHAVIOR_TESTS.sand(beh);
        if (!streaming && isWater) mark(ctxFor("agua"), x, y, LAYER_COLORS.agua);

        const gwx = info.x + x;
        const gwy = info.y + y;
        if (grid.inBounds(gwx, gwy)) {
          const idx = grid.idx(gwx, gwy);
          grid.behaviors[idx] = beh;
          grid.elevations[idx] = block >>> 12;
          grid.solid[idx] = hasCollision ? 1 : 0;
          if (isWater) grid.water[idx] = 1;
          if (isGrass) grid.grass[idx] = 1;
          if (isSand) grid.sand[idx] = 1;
          grid.metatiles[idx] = mt;
        }

        let arrow: string | undefined;
        let ledgeVal = 0;
        if (BEHAVIOR_TESTS.jumpEast(beh)) {
          arrow = "E";
          ledgeVal = 4;
        } else if (BEHAVIOR_TESTS.jumpWest(beh)) {
          arrow = "W";
          ledgeVal = 3;
        } else if (BEHAVIOR_TESTS.jumpSouth(beh)) {
          arrow = "S";
          ledgeVal = 1;
        } else if (BEHAVIOR_TESTS.jumpNorth(beh)) {
          arrow = "N";
          ledgeVal = 2;
        }
        if (arrow) {
          if (!streaming) mark(ctxFor("salientes"), x, y, LAYER_COLORS.salientes, arrow);
          if (grid.inBounds(gwx, gwy)) {
            grid.ledge[grid.idx(gwx, gwy)] = ledgeVal;
          }
        }
      }
    }

    for (const e of elementsByMap.get(id) ?? []) {
      const egwx = info.x + e.x;
      const egwy = info.y + e.y;
      const isSolidEntity = e.layer !== "puerta" && e.layer !== "activador";
      if (isSolidEntity && grid.inBounds(egwx, egwy)) {
        if (!streaming) grid.npc[grid.idx(egwx, egwy)] = 1;

        let dir: Direction = "south";
        if (e.direction === "up") dir = "north";
        else if (e.direction === "down") dir = "south";
        else if (e.direction === "left") dir = "west";
        else if (e.direction === "right") dir = "east";

        if (!streaming) entityManager.addEntity(e, egwx, egwy, dir);
      }

      if (streaming) continue;
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

    for (const t of streaming ? [] : triggersByMap.get(id) ?? []) {
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
        animated = entry;
        animController.addMap(entry);
      }
    }

    fillSources.set(id, { info, layout, renderer });
    metatilePainters.set(id, { info, layout, renderer, bctx, grid, primary, secondary });
    avatarDepth?.add(id,{x:info.x,y:info.y,width:info.width,height:info.height,blocks:layout.blocks,renderer});
    if (streaming) {
      // Object instances may have moved or been added since this sector unloaded.
      for (const ent of entityManager.entities) {
        if (ent.element.map!==id||ent.removed||!isViewerObjectPresent(ent.element)||!objectSpawns.present(ent.element)||!grid.inBounds(ent.gx,ent.gy)) continue;
        grid.npc[grid.idx(ent.gx,ent.gy)]=1;
      }
      worldGrid.addSector(id, grid);
    }
    content.appendChild(wrap);

    return { bytes: grid.retainedBytes + [...wrap.querySelectorAll("canvas")].reduce((sum, c) => sum + c.width * c.height * 4, 0),
      dispose() {
        wrap.remove();
        for (const c of wrap.querySelectorAll("canvas")) { c.width = 0; c.height = 0; }
        if (animated) animController.removeMap(animated);
        worldGrid.removeSector(id);
        fillSources.delete(id);
        metatilePainters.delete(id);
        avatarDepth?.remove(id);
      } };
  };
  if (streaming) {
    // Lightweight object state persists independently of sector graphics/collision buffers.
    for (const e of index.elements) {
      const info = index.maps[e.map];
      if (!info || e.layer === "puerta" || e.layer === "activador") continue;
      const dir: Direction = e.direction === "up" ? "north" : e.direction === "left" ? "west" : e.direction === "right" ? "east" : "south";
      entityManager.addEntity(e, info.x + e.x, info.y + e.y, dir);
    }
    sectorBorder = new SectorBorder(content);
    sectorLoader = new SectorLoader(renderMap, () => { updateEntitiesView(); updateSectorBorder(); if(playerActive)updatePlayerDisplay(); });
  } else {
    let processedCount = 0;
    for (const ids of byPair.values()) for (const id of ids) {
      await renderMap(id);
      if (loadingText) loadingText.textContent = `Rendering maps (${++processedCount}/${mapEntries.length})…`;
    }
  }

  if (!streaming) {
    const fillResult = renderWorldFill(index, minX, minY, fillSources, state.fillBiomeOverride);
    fillNearest = fillResult.nearest;
    content.prepend(fillResult.canvas);
  }
  applyFillMode();

  const exteriorEntities = entityManager;
  let changeWorldChain: Promise<void> = Promise.resolve();
  const executeChangeNavigationWorld = async (mapId: string): Promise<void> => {
    if (!streaming) throw new Error("Playable interiors require Explore mode");
    const exterior = !!exteriorWorld.index.maps[mapId];
    if (!exterior && navigationMap === mapId && worldGrid.isLoaded(index.maps[mapId]!.x, index.maps[mapId]!.y)) return;
    if (exterior && navigationMap === null && worldGrid.isLoaded(index.maps[mapId]!.x, index.maps[mapId]!.y)) return;
    let next = exteriorWorld;
    let data: Rom | null = null;
    if (!exterior) {
      data = new Rom();
      const header = mapHeaders.get(mapId) ?? await data.loadMap(mapId);
      mapHeaders.set(mapId, header);
      const objects: Element[] = header.objects.flatMap(o => o.clone ? [] : [{
        map: mapId, x:o.x, y:o.y, localId:o.localId, flag:o.flag, graphics:o.graphicsName, movementType:o.movementType, layer:"npc",
        direction: o.movementType === C.MOVEMENT_TYPE_FACE_UP ? "up" : o.movementType === C.MOVEMENT_TYPE_FACE_LEFT ? "left" : o.movementType === C.MOVEMENT_TYPE_FACE_RIGHT ? "right" : "down",
      }]);
      elementsByMap.set(mapId, objects);
      const layout = await data.loadLayout(header.layout);
      const padding = 32;
      const indoorTriggers: Trigger[] = header.coords.map(c => ({
        map: mapId,
        x: c.x,
        y: c.y,
        var: rom.nameOf("VAR_", c.var) ?? String(c.var),
        value: c.value,
        script: c.scriptName ?? "",
      }));
      next = { minX: -padding, minY: -padding, index: {
        ...exteriorWorld.index,
        world: { width: layout.width + padding*2, height: layout.height + padding*2, origin: mapId },
        maps: { [mapId]: { x:0,y:0,width:layout.width,height:layout.height,layout:header.layout,
          title:(JOHTO ? formatJohtoInteriorName(mapId) : undefined) ?? header.name,section:header.regionMapSectionName,music:header.music,musicName:header.musicName,weather:header.weather } },
        elements: [], triggers: indoorTriggers, conflicts: [],
      } };
    }
    // Drain any asynchronous sector before replacing the globals its renderer uses.
    playerActive = false;
    sectorUpdateQueued = false;
    const previousLoader = sectorLoader;
    sectorLoader = null;
    previousLoader?.dispose();
    await previousLoader?.settled();
    sectorBorder?.dispose(); sectorBorder = null;
    entityManager.dispose();
    disposeEffects(); disposeEffectsSound(); fieldEffects.resetSession();
    index = next.index; minX = next.minX; minY = next.minY;
    navigationMap = exterior ? null : mapId;
    contextData = data; layoutsByMap.clear(); fillSources = new Map();
    worldGrid = new WorldGrid(index.world.width,index.world.height,minX,minY,true);
    exteriorEntities.resetRemovedObjects();
    entityManager = exterior ? exteriorEntities : new EntityManager(content,minX,minY);
    if (!exterior) for (const e of elementsByMap.get(mapId) ?? []) {
      entityManager.addEntity(e,e.x,e.y,e.direction === "up" ? "north" : e.direction === "left" ? "west" : e.direction === "right" ? "east" : "south");
    }
    fieldEffects = await ViewerFieldEffects.create(worldGrid, viewerClock, HOENN || JOHTO);
    disposeEffects = installFieldFxRenderer(fieldEffects,content,minX,minY);
    disposeEffectsSound = fieldEffects.subscribe(event => {if(event.type === "sound")audioController.playSE(event.id);});
    camera.configure(index.world.width*TILE,index.world.height*TILE,camera.zoom);
    if (!exterior) {
      const info = next.index.maps[mapId]!;
      viewport.scrollLeft = ((info.x - minX) * TILE + (info.width * TILE) / 2) * camera.zoom - viewport.clientWidth / 2;
      viewport.scrollTop = ((info.y - minY) * TILE + (info.height * TILE) / 2) * camera.zoom - viewport.clientHeight / 2;
    }
    minimapController?.setWorld(index,minX,minY);
    sectorBorder = new SectorBorder(content);
    sectorLoader = new SectorLoader(renderMap, () => { if (!warpBusy) {updateEntitiesView();updateSectorBorder();if(playerActive)updatePlayerDisplay();} });
    await sectorLoader.update([mapId]);
    if (!worldGrid.isLoaded(index.maps[mapId]!.x,index.maps[mapId]!.y)) throw new Error(sectorLoader.error || `Map not loaded: ${mapId}`);
    content.dataset.navigationMap = mapId;
  };
  changeNavigationWorld = mapId => {
    changeWorldChain = changeWorldChain.then(() => executeChangeNavigationWorld(mapId), () => executeChangeNavigationWorld(mapId));
    return changeWorldChain;
  };

  const worldW = index.world.width * TILE;
  const worldH = index.world.height * TILE;
  camera.configure(worldW, worldH, initialZoom);
  if (selection) {
    if (selection.x < minX || selection.y < minY || selection.x >= minX + index.world.width || selection.y >= minY + index.world.height) selection = null;
    else showAt((selection.x - minX) * TILE, (selection.y - minY) * TILE);
  }

  if (startX !== null) viewport.scrollLeft = startX;
  if (startY !== null) viewport.scrollTop = startY;

  if (streaming) {
    if (startPlayer) { const id = findMapAt(startPlayer.x, startPlayer.y)?.[0]; if (id) centerOnMap(id); }
    else if (startMapId && index.maps[startMapId]) centerOnMap(startMapId);
    else if (startX === null) centerOnMap("MAP_PALLET_TOWN");
    await requestSectors();
  }
  applyLayerVisibility();

  if (state.audio) {
    audioController.enable();
    checkCurrentMapMusic();
  }


}

function applyViewerObjects(states: ViewerObjectState[]): void {
  for (const state of states) {
    const info=index.maps[state.mapId];
    const template=(rom.cachedMap(state.mapId)??mapHeaders.get(state.mapId))?.objects.find(o=>!o.clone&&o.localId===state.localId);
    if (!info||!template||template.clone) continue;
    const element:Element={map:state.mapId,localId:template.localId,x:template.x,y:template.y,flag:template.flag,graphics:template.graphicsName,movementType:template.movementType,layer:'npc',
      direction:template.movementType===C.MOVEMENT_TYPE_FACE_UP?'up':template.movementType===C.MOVEMENT_TYPE_FACE_LEFT?'left':template.movementType===C.MOVEMENT_TYPE_FACE_RIGHT?'right':'down'};
    entityManager.applyObjectState(state,element,info.x,info.y);
    if(!state.removed)objectSpawns.adopt(element);
  }
}

function readViewerMapObjects(mapId: string): ViewerObjectState[] {
  const header=mapHeaders.get(mapId)??rom.cachedMap(mapId);
  if(!header)return [];
  const identities=new Set(header.objects.map(o=>o.clone?`${o.targetMap}:${o.targetLocalId}`:`${mapId}:${o.localId}`));
  return entityManager.entities.filter(e=>e.element.localId!==undefined&&identities.has(`${e.element.map}:${e.element.localId}`)&&(e.engineState||objectSpawns.isActive(e.element))).flatMap(e=>{
    const owner=index.maps[e.element.map];
    return owner?[{
      mapId:e.element.map,localId:e.element.localId!,x:e.gx-owner.x,y:e.gy-owner.y,
      direction:e.dir,invisible:!!e.scriptInvisible,removed:!!e.removed||!isViewerObjectPresent(e.element),
      ...(e.graphicsId !== undefined ? { graphicsId: e.graphicsId } : {}),
      ...(e.elevation !== undefined ? { elevation: e.elevation } : {}),
      ...(e.movementType !== undefined ? { movementType: e.movementType } : e.element.movementType !== undefined ? { movementType: e.element.movementType } : {}),
    }]:[];
  });
}

function setupUi(): void {
  engineInteraction = new EngineInteraction({
    pause: pauseInteraction,
    project: (canvas, game) => {
      const info=index.maps[game.overworld.header.id];
      if(!info)return;
      canvas.style.cssText=`position:absolute;pointer-events:none;image-rendering:pixelated;left:${(info.x-minX-MAP_OFFSET)*TILE+game.overworld.camX}px;top:${(info.y-minY-MAP_OFFSET)*TILE+game.overworld.camY}px;width:240px;height:160px;z-index:25`;
      if(canvas.parentElement!==content)content.append(canvas);
    },
    relocate: nav => relocateViewer(nav),
    mapOrigin: mapId=>index.maps[mapId],
    readObjects: readViewerMapObjects,
    syncObjects: states => {
      const mapId=viewerEventMap();
      if(mapId)storeViewerObjects(mapId,states);
      applyViewerObjects(states);
      updateEntitiesView();
    },
    setBike: on => { if (on !== (playerMode === "bike")) toggleBike(); },
    setVehicle: vehicle => {
      if (vehicle === playerMode) return;
      if (vehicle === "surf") {
        if (playerMode === "bike") toggleBike();
        playerMode = "surf";
      } else if (vehicle === "bike") {
        if (playerMode === "surf") playerMode = "walk";
        if (playerMode !== "bike") toggleBike();
      } else {
        if (playerMode === "bike") toggleBike();
        playerMode = "walk";
      }
      updatePlayerDisplay();
      checkCurrentMapMusic();
    },
    onSetMetatile: (mapId, lx, ly, metatileId) => {
      const origin = index.maps[mapId];
      if (origin) paintNavigationMetatile(origin.x + lx, origin.y + ly, metatileId);
    },
    hideObjects: (hidden,mapId,localId) => {
      if(playerEl)playerEl.style.visibility=hidden?"hidden":"";
      if (!localId && !hidden) {
        for (const e of entityManager.entities) if (e.el && (!mapId || e.element.map === mapId)) e.el.style.visibility = "";
        return;
      }
      const ent=entityManager.entities.find(e=>e.element.map===mapId&&e.element.localId===localId);
      if(ent?.el)ent.el.style.visibility=hidden?"hidden":"";
    },
    onBattleStart: async () => {
      await playBattleTransition();
    },
  });
  mapPopup = new MapNamePopup(document.body);
  weatherOverlay = new WeatherOverlay(document.body);
  explorationUi = new ExplorationUi({
    region: JOHTO ? "johto" : HOENN ? "hoenn" : "kanto",
    save: saveCurrentSession,
    continue: () => JOHTO ? Promise.reject(Error("Saving is not available in Johto yet")) : HOENN ? continueHoennSession() : continueViewerSession(),
    newGame: async () => {
      if (!HOENN && !JOHTO) {
        initDefinitiveViewerSession(index.initialFlags, state.playerChar === "leaf" ? C.FEMALE : C.MALE);
        const nav = viewerCheckpoint()!;
        await changeNavigationWorld(nav.mapId);
        await rom.loadMap(nav.mapId);
        { entityManager.resetRemovedObjects(); objectSpawns.reset(); }
        applyViewerObjects(savedViewerObjects(nav.mapId));
        const info = index.maps[nav.mapId]!;
        navigationWarps.restore(nav.dynamic);
        await startExploration(info.x + nav.x, info.y + nav.y);
        playerDir = nav.direction; updatePlayerDisplay(); writeHash();
      } else {
        const startMap = JOHTO ? index.maps["MAP_NEW_BARK_TOWN"] : index.maps["MAP_LITTLEROOT_TOWN"];
        if (startMap) {
          const spawnX = JOHTO ? startMap.x + 20 : startMap.x + 8;
          const spawnY = JOHTO ? startMap.y + 12 : startMap.y + 8;
          await startExploration(spawnX, spawnY);
          playerDir = "south"; updatePlayerDisplay(); writeHash();
        }
      }
    },
    pause: paused => {
      keysDown.clear(); playerRunning = false;
      if (paused) viewerClock.pause("explore-menu"); else viewerClock.resume("explore-menu");
    },
    resize: () => {
      if (playerActive && !exploreManualZoom) camera.setZoom(exploreAutoZoom());
      if (playerActive) updatePlayerDisplay();
      scheduleSectors();
    },
    exit: () => document.getElementById("mode-viewer-btn")?.click(),
    startMenu: () => {
      // Hoenn: the FireRed start menu screens are not connected to Emerald content.
      if (HOENN || !engineInteraction || engineInteraction.open || !playerActive || isStepping || warpBusy || elevatorBusy || dialogManager.isOpen()) return;
      void engineInteraction.showStartMenu(navigationSnapshot(), playerMode === "bike" ? "bike" : playerMode === "surf" ? "surf" : "walk").catch(error => dialogManager.show("Menu", [String(error)]));
    },
    stats: () => ({ sectors: sectorLoader?.ids.length ?? Object.keys(index.maps).length,
      bytes: (sectorLoader?.bytes ?? 0) + (sectorBorder?.bytes ?? 0) + (avatarDepth?.bytes ?? 0), pending: sectorLoader?.pending ?? 0, error: sectorLoader?.error ?? "" }),
    onRayquazaCinematic: () => void runSkyPillarRayquazaCinematic(hoennCinematicHost),
    onClashCinematic: () => void runSootopolisClashCinematic(hoennCinematicHost),
    onCaveCinematic: () => void runCaveOfOriginRumbleCinematic(hoennCinematicHost),
  });
  window.addEventListener("explore-scale", event => {
    exploreManualZoom = (event as CustomEvent<number>).detail;
    setZoom(exploreManualZoom || exploreAutoZoom());
    if (playerActive) updatePlayerDisplay();
    scheduleSectors();
  });
  setupGameSelect();
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
    if (HOENN) {
      const redOpt = charSelect.querySelector('option[value="red"]');
      const leafOpt = charSelect.querySelector('option[value="leaf"]');
      if (redOpt) redOpt.textContent = "Brendan";
      if (leafOpt) leafOpt.textContent = "May";
    } else if (JOHTO) {
      const redOpt = charSelect.querySelector('option[value="red"]');
      const leafOpt = charSelect.querySelector('option[value="leaf"]');
      if (redOpt) redOpt.textContent = "Ethan";
      if (leafOpt) leafOpt.textContent = "Lyra";
    }
    charSelect.value = state.playerChar;
    charSelect.addEventListener("change", () => {
      state.playerChar = (charSelect.value as "red" | "leaf") || "red";
      if (!HOENN && !JOHTO && playerActive) gameSave.playerGender = state.playerChar === "leaf" ? C.FEMALE : C.MALE;
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
    if (btn) btn.textContent = `Layers (${state.activeLayers.size}/${LAYERS.length}) ▾`;
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

  // El buscador incluye los interiores (no están en el lienzo del mundo): al elegirlos se abre su visor.
  const searchable: KantoIndex = { ...index, maps: { ...index.maps } };
  for (const [id, m] of Object.entries(allMaps)) {
    if (id in searchable.maps) continue;
    searchable.maps[id] = { x: 0, y: 0, width: 0, height: 0, layout: m.layout, title: (JOHTO ? formatJohtoInteriorName(id) : undefined) ?? m.name, section: m.section };
  }
  setupSearch(searchable, searchInput, searchResults, (mapId) => {
    if (mapId in index.maps) centerOnMap(mapId);
    else void interiorViewer.open(mapId);
  });

  const modeViewerBtn = document.getElementById("mode-viewer-btn");
  const modeExploreBtn = document.getElementById("mode-explore-btn");
  const bikeBtn = document.getElementById("bike-btn");

  modeViewerBtn?.addEventListener("click", () => {
    stopExploration();
    let back: string | null = null;
    try { back = sessionStorage.getItem("atlas-explore-return"); } catch { /* Storage may be unavailable. */ }
    if (back) {
      const saved = new URL(back, location.href);
      if (saved.origin === location.origin && saved.pathname === "/maps.html") { location.href = saved.href; return; }
    }
    const target = new URL("/maps.html", location.href);
    target.searchParams.set("game", GAME);
    const view = new URLSearchParams({ x: String(Math.round(viewport.scrollLeft)), y: String(Math.round(viewport.scrollTop)), z: String(camera.zoom) });
    target.hash = `world&${view}`;
    location.href = target.href;
  });
  modeExploreBtn?.addEventListener("click", () => { void startExploration(); });
  bikeBtn?.addEventListener("click", () => toggleBike());

  window.addEventListener("keydown", (e) => {
    if (engineInteraction?.open || elevatorBusy || elevatorMenu?.open) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return;
    const key = e.key.toLowerCase();
    if (warpBusy && ["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d","b","z","enter"," "].includes(key)) { e.preventDefault(); return; }

    if (playerActive && (explorationUi?.paused || interiorViewer.isOpen())) return;
    if (key === "m") {
      toggleAudio();
      return;
    }
    if (key === "b" && playerActive) {
      toggleBike();
      return;
    }
    if (key === "v" && playerActive && HOENN) {
      e.preventDefault();
      toggleDive();
      return;
    }
    if (key === "x" && playerActive && HOENN && playerMode === "bike" && state.bikeType === "acro") {
      e.preventDefault();
      hoennAcroBikeTracker.setBButton(true);
      triggerAcroHop();
      return;
    }
    if ((key === "backspace" || key === "f") && playerActive && !HOENN && !JOHTO && engineInteraction && !isStepping && !warpBusy && !elevatorBusy && !dialogManager.isOpen()) {
      e.preventDefault();
      void engineInteraction.useRegisteredKeyItem(navigationSnapshot());
      return;
    }
    if (key === "u" && playerActive && !HOENN && !JOHTO && engineInteraction && !isStepping && !warpBusy && !elevatorBusy && !dialogManager.isOpen()) {
      e.preventDefault();
      void engineInteraction.useSweetScent(navigationSnapshot());
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

        if (tryElevatorPanel(fx,fy)) return;
        let frontEnt = entityManager.findAt(fx, fy);
        // field_control_avatar.c GetInteractedObjectEventScript: reach NPC across MB_COUNTER.
        if (!frontEnt && MB.MetatileBehavior_IsCounter(worldGrid.behaviorAt(fx, fy))) {
          const dx=fx-playerX, dy=fy-playerY;
          frontEnt = entityManager.findAt(fx+dx,fy+dy);
        }
        if (frontEnt) {
          interactWithEntity(frontEnt);
          return;
        }
        if (JOHTO) {
          if (tryReadSign(fx, fy)) return;
          if (tryNavigationWarp("front", playerDir)) return;
        }
        // Signs, PCs, shelves and other metatile/background-event scripts of the engine.
        if (HOENN) {
          const curBh = worldGrid.behaviorAt(playerX, playerY);
          const hit = findMapAt(playerX, playerY);
          const curMap = hit ? hit[0] : "";
          if (isDiveableWater(curBh) || curMap.includes("UNDERWATER") || mapHeaders.get(curMap)?.mapType === 5) {
            toggleDive();
            return;
          }
        }
        if (engineInteraction && !isStepping && !warpBusy && !elevatorBusy) {
          void engineInteraction.interactFront(navigationSnapshot(), playerMode === "surf").catch(error => console.error("Interaction", error));
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
    if (key === "shift" || key === "x") {
      playerRunning = false;
      if (HOENN) hoennAcroBikeTracker.setBButton(false);
    }
    if (!isStepping && !["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].some((k) => keysDown.has(k))) {
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
    if (playerActive) return;
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
    scheduleSectors();
    minimapController?.updateRadar();
    updateEntitiesView();
    checkCurrentMapMusic();
    scheduleHashWrite();
  });

  document.getElementById("zoom-in")!.addEventListener("click", () => setZoom(camera.zoom * 1.25));
  document.getElementById("zoom-out")!.addEventListener("click", () => setZoom(camera.zoom * 0.8));
}

build()
  .then(async () => {
    setupUi();
    updateMeta();
    if (startMapId && !startExplore) {
      if (startMapId in index.maps) centerOnMap(startMapId);
      else void interiorViewer.open(startMapId);
    }
    if (startExplore) {
      if (!JOHTO && queryParams.get("ferry") === "1") {
        // ADAPTATION: regional ferry arrivals, separate from either game's original ships.
        const destination = ferryDestination(HOENN ? "hoenn" : "kanto");
        const map = index.maps[destination.mapId];
        if (!map) throw Error("The ferry destination is unavailable");
        await startExploration(map.x + destination.x, map.y + destination.y);
        playerDir = destination.direction;
        updatePlayerDisplay();
        await pendingMapEntry;
        if (!saveCurrentSession()) throw Error("Unable to save the ferry arrival");
        const arrived = new URL(location.href);
        arrived.searchParams.delete("ferry");
        history.replaceState(null, "", arrived);
        writeHash();
      } else if (HOENN && queryParams.get("continue") === "1") {
        await continueHoennSession();
      } else if (!HOENN && !JOHTO) {
        const explicitExternalMap = startMapId && startMapId !== "MAP_PALLET_TOWN_PLAYERS_HOUSE_2F";
        await initializeViewerSession(index.initialFlags, {
          forceTemporary: !!explicitExternalMap,
          gender: state.playerChar === "leaf" ? C.FEMALE : C.MALE,
        });
        if (startMapId && !index.maps[startMapId]) await changeNavigationWorld(startMapId);
        const checkpoint = viewerCheckpoint();
        if (checkpoint && (!startMapId || startMapId === checkpoint.mapId)) {
          await rom.loadMap(checkpoint.mapId);
          applyViewerObjects(savedViewerObjects(checkpoint.mapId));
        }
        const valid = startPlayer && startPlayer.x >= minX && startPlayer.y >= minY
          && startPlayer.x < minX + index.world.width && startPlayer.y < minY + index.world.height;
        if (!startPlayer && viewerCheckpoint()) await continueViewerSession();
        else await startExploration(valid ? startPlayer!.x : undefined, valid ? startPlayer!.y : undefined);
      } else {
        const valid = startPlayer && startPlayer.x >= minX && startPlayer.y >= minY
          && startPlayer.x < minX + index.world.width && startPlayer.y < minY + index.world.height;
        if (HOENN && !startPlayer && !startMapId && viewerCheckpoint()) await continueHoennSession();
        else await startExploration(valid ? startPlayer!.x : undefined, valid ? startPlayer!.y : undefined);
      }
    }
    document.body.removeAttribute("aria-busy");
    performance.mark("viewer-interactive");
    if (loadingOverlay) { loadingOverlay.classList.add("hidden"); setTimeout(() => loadingOverlay.remove(), 400); }
  })
  .catch((err) => {
    const message = `Unable to load the map viewer: ${String(err)}`;
    panel.textContent = message;
    document.body.removeAttribute("aria-busy");
    if (loadingOverlay) {
      if (loadingText) loadingText.textContent = message;
      loadingOverlay.querySelector(".loading-spinner")?.remove();
      const retry = document.createElement("button");
      retry.className = "btn"; retry.textContent = "Retry";
      retry.addEventListener("click", () => location.reload());
      loadingOverlay.append(retry);
    }
    console.error(err);
  });
