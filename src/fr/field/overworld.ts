// Port of overworld.c + field_camera.c: map loading from warps and camera
// transitions, the per-frame field callbacks, and BG/OBJ composition.

import * as MB from "../generated/metatileBehavior";
import * as C from "../generated/constants";
import { paletteFade, FADE_FROM_BLACK, FADE_FROM_WHITE, FADE_TO_BLACK, FADE_TO_WHITE, RGB_BLACK, RGB_WHITE } from "../gba/fade";
import { gPlttBufferFaded } from "../hw/palette";
import { joy } from "../gba/input";
import { SpriteManager } from "../gba/sprite";
import { tasks } from "../gba/tasks";
import { Window, WindowLayer, stdPalette } from "../gba/window";
import { FONT_NORMAL } from "../gba/font";
import { expandPlaceholders } from "../gba/charmap";
import { TextPrinter, textFlags } from "../gba/textPrinter";
import { sound } from "../audio/sound";
import { rom, type MapHeader, type MapObjectTemplate } from "../rom";
import { clearTempFieldEventData, flagClear, flagGet, save, SV, varGet, varSet, type WarpData } from "../save";
import { FieldMap, GetIncomingConnection, GetMapBorderIdAt, loadMap, MAP_OFFSET, METATILE_ATTRIBUTE_LAYER_TYPE, CONNECTION_EAST, CONNECTION_INVALID, CONNECTION_NONE, CONNECTION_NORTH, CONNECTION_SOUTH, CONNECTION_WEST, type LoadedConnection, type LoadedMap } from "./fieldmap";
import { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST, DIRECTION_VECTORS, ObjectEvents, setVarGetter, type ObjectEvent } from "./objectEvents";
import { TileRenderer, TilesetAnimator } from "./tileRenderer";
import { PlayerAvatar, PlayerGetDestCoords, PLAYER_AVATAR_FLAG_ON_FOOT, PLAYER_AVATAR_FLAG_SURFING } from "./playerAvatar";
import { FieldControl } from "./fieldControl";
import { FieldMessageBox } from "./messageBox";
import { DoorAnimator } from "./doors";
import { DoOutwardBarnDoorWipe, FieldEffects, MAX_FLASH_LEVEL, Task_BarnDoorWipe, WriteFlashScanlineEffectBuffer } from "./fieldEffects";
import { ScanlineEffect_SetParams, SCANLINE_EFFECT_DMACNT_16BIT } from "../hw/scanline";
import { REG_OFFSET_WIN0H } from "../hw/ppu";
import { MapNamePopup } from "./mapNamePopup";
import { MapPreviewManager, MapHasPreviewScreen_HandleQLState2, MPS_TYPE_CAVE, MPS_TYPE_FOREST, CB2_DoChangeMap } from "../mapPreviewScreen";
import { ScriptContext } from "../script/context";
import type { Game } from "../game";
import { mapResetTrainerRematches } from "./vsSeeker";
import { onCameraTransitionForRoamer, onWarpForRoamer } from "../pokemon/roamer";
import { TrySetMapSaveWarpStatus } from "../pokemon/saveLocation";
import { TryRegenerateRenewableHiddenItems } from "../renewableHiddenItems";
import { PerStepCallback } from "./fieldTasks";

import { gQuestLogState, QuestLog_CheckDepartingIndoorsMap, QuestLog_InitPalettesBackup, QuestLog_ShouldEndSceneOnMapChange, QuestLog_TryRecordDepartedLocation } from "../questLogEvents";
import { QL_TryStopSurfing } from "../questLogObjects";
import { IsWeatherNotFadingIn, PlayRainStoppingSoundEffect } from "./weather";

/** GetPostCameraMoveMapBorderId (fieldmap.c). */
function GetPostCameraMoveMapBorderId(x: number, y: number, map: FieldMap): number {
  return GetMapBorderIdAt(save.pos.x + MAP_OFFSET + x, save.pos.y + MAP_OFFSET + y, map);
}

/** SetPositionFromConnection (fieldmap.c). */
function SetPositionFromConnection(connection: LoadedConnection, direction: number, x: number, y: number): void {
  switch (direction) {
    case CONNECTION_EAST: save.pos.x = -x; save.pos.y -= connection.offset; break;
    case CONNECTION_WEST: save.pos.x = connection.layout.width; save.pos.y -= connection.offset; break;
    case CONNECTION_SOUTH: save.pos.x -= connection.offset; save.pos.y = -y; break;
    case CONNECTION_NORTH: save.pos.x -= connection.offset; save.pos.y = connection.layout.height; break;
  }
  save.pos.x = (save.pos.x << 16) >> 16;
  save.pos.y = (save.pos.y << 16) >> 16;
}

export const MAP_SCRIPT_ON_LOAD = 1;
export const MAP_SCRIPT_ON_FRAME_TABLE = 2;
export const MAP_SCRIPT_ON_TRANSITION = 3;
export const MAP_SCRIPT_ON_WARP_INTO_MAP_TABLE = 4;
export const MAP_SCRIPT_ON_RESUME = 5;
export const MAP_SCRIPT_ON_DIVE_WARP = 6;
export const MAP_SCRIPT_ON_RETURN_TO_FIELD = 7;

/** ResetCyclingRoadChallengeData (field_specials.c) is deliberately empty in the decomp. */
export function ResetCyclingRoadChallengeData(): void {}

/** heal_location.c GetHealLocation: heal location IDs are one-based; NONE/out-of-range returns null. */
export function GetHealLocation(id: number): { mapGroup: number; mapNum: number; x: number; y: number } | null {
  if (id === rom.constants.HEAL_LOCATION_NONE || id > rom.healLocations.heal_locations.length) return null;
  const entry = rom.healLocations.heal_locations[id - 1];
  if (!entry) return null;
  const num = rom.mapNum(entry.map);
  return { mapGroup: num >> 8, mapNum: num & 0xff, x: entry.x, y: entry.y };
}

/** GetHealLocationIndexFromMapGroupAndNum (heal_location.c), returning one-based IDs. */
export function GetHealLocationIndexFromMapGroupAndNum(mapGroup: number, mapNum: number): number {
  const locations = rom.healLocations.heal_locations;
  for (let i = 0; i < locations.length; i++) {
    const map = rom.mapNum(locations[i].map);
    if ((map >>> 8) === mapGroup && (map & 0xff) === mapNum) return i + 1;
  }
  return rom.constants.HEAL_LOCATION_NONE;
}

/** GetHealLocationPointerFromMapGroupAndNum (heal_location.c). */
export function GetHealLocationPointerFromMapGroupAndNum(mapGroup: number, mapNum: number): ReturnType<typeof GetHealLocation> {
  return GetHealLocation(GetHealLocationIndexFromMapGroupAndNum(mapGroup, mapNum));
}

/** SetWhiteoutRespawnHealerNpcAsLastTalked (heal_location.c). */
export function SetWhiteoutRespawnHealerNpcAsLastTalked(healLocationIdx: number): number {
  const entry = rom.healLocations.heal_locations[healLocationIdx - 1];
  const localId = entry?.respawn_npc ? rom.c(entry.respawn_npc) : 0;
  varSet(SV.LAST_TALKED, localId);
  return localId;
}

const MAP_TYPE = { NONE: 0, TOWN: 1, CITY: 2, ROUTE: 3, UNDERGROUND: 4, UNDERWATER: 5, OCEAN_ROUTE: 6, UNKNOWN: 7, INDOOR: 8, SECRET_BASE: 9 };

/** palette_bg_faded_fill_black (field_fadetransition.c): PLTT_SIZE is 0x200 bytes. */
function palette_bg_faded_fill_black(): void {
  gPlttBufferFaded.fill(C.RGB_BLACK, 0, 0x200 / 2);
  paletteFade.fill(RGB_BLACK);
}

/** palette_bg_faded_fill_white (field_fadetransition.c). */
function palette_bg_faded_fill_white(): void {
  gPlttBufferFaded.fill(C.RGB_WHITE, 0, 0x200 / 2);
  paletteFade.fill(RGB_WHITE);
}

export function isMapTypeOutdoors(type: number): boolean {
  return type === MAP_TYPE.ROUTE || type === MAP_TYPE.TOWN || type === MAP_TYPE.UNDERWATER || type === MAP_TYPE.CITY || type === MAP_TYPE.OCEAN_ROUTE;
}

/** Overworld_MapTypeAllowsTeleportAndFly (overworld.c). */
export function Overworld_MapTypeAllowsTeleportAndFly(mapType: number): boolean {
  return mapType === MAP_TYPE.ROUTE || mapType === MAP_TYPE.TOWN || mapType === MAP_TYPE.OCEAN_ROUTE || mapType === MAP_TYPE.CITY;
}

/** IsMapTypeIndoors (overworld.c). */
export function IsMapTypeIndoors(mapType: number): boolean {
  return mapType === MAP_TYPE.INDOOR || mapType === MAP_TYPE.SECRET_BASE;
}

// MapTransitionIsEnter / MapTransitionIsExit (fldeff_flash.c): mirror the
// explicit sTransitionTypes rows instead of treating unknown map types as valid.
const FLASH_TRANSITION_SURFACE_TYPES = new Set([
  MAP_TYPE.TOWN, MAP_TYPE.CITY, MAP_TYPE.ROUTE, MAP_TYPE.UNDERWATER,
  MAP_TYPE.OCEAN_ROUTE, MAP_TYPE.UNKNOWN, MAP_TYPE.INDOOR, MAP_TYPE.SECRET_BASE,
]);

export function MapTransitionIsEnter(fromType: number, toType: number): boolean {
  return toType === MAP_TYPE.UNDERGROUND && FLASH_TRANSITION_SURFACE_TYPES.has(fromType);
}

export function MapTransitionIsExit(fromType: number, toType: number): boolean {
  return fromType === MAP_TYPE.UNDERGROUND && FLASH_TRANSITION_SURFACE_TYPES.has(toType);
}

export function dummyWarp(): WarpData {
  return { mapGroup: 0x7f, mapNum: 0x7f, warpId: -1, x: -1, y: -1 };
}

function isDummyWarp(w: WarpData): boolean {
  return (w.mapGroup === 0x7f || w.mapGroup === 0xff) && (w.mapNum === 0x7f || w.mapNum === 0xff) && w.warpId === -1;
}

export type FieldCallback = () => void;

export class Overworld {
  readonly map = new FieldMap();
  loaded!: LoadedMap;
  renderer?: TileRenderer;
  animator?: TilesetAnimator;
  readonly sprites = new SpriteManager();
  readonly windows = new WindowLayer();
  readonly objects: ObjectEvents;
  readonly player: PlayerAvatar;
  readonly control: FieldControl;
  readonly script = new ScriptContext(this);
  readonly messageBox: FieldMessageBox;
  readonly doors: DoorAnimator;
  readonly effects: FieldEffects;
  readonly mapName: MapNamePopup;
  readonly mapPreview: MapPreviewManager;
  readonly stepCallback: PerStepCallback;
  private mapCache = new Map<string, Promise<LoadedMap>>();
  private bgMosaicCanvas?: HTMLCanvasElement;
  private bgMosaicContext?: CanvasRenderingContext2D;
  private whiteOutWindow?: Window;
  private whiteOutPrinter?: TextPrinter;
  warpDestination: WarpData = dummyWarp();
  lastUsedWarp: WarpData = dummyWarp();
  fixedDiveWarp: WarpData = dummyWarp();
  fixedHoleWarp: WarpData = dummyWarp();
  fieldCallback: FieldCallback | null = null;
  /** gFieldCallback2: runs during map load until it returns true */
  fieldCallback2: (() => boolean) | null = null;
  controlsLocked = false;
  /** Camera pixel position (world coords of screen top-left). */
  camX = 0;
  camY = 0;
  /** Camera pan (sHorizontalCameraPan / sVerticalCameraPan - 32). */
  panX = 0;
  panY = 0;
  private cameraPanningCallback: (() => void) | null = null;
  private bikeCameraAheadPanback = false;
  private bikeCameraPanFlag = false;
  /** Camera tracks this object (the player by default). */
  cameraTarget: ObjectEvent | null = null;
  cameraObject: { x: number; y: number } | null = null;
  gExitStairsMovementDisabled = false;
  flashLevel = 0;
  private loadState = 0;
  private loadPromise?: Promise<LoadedMap>;
  private loadError?: unknown;
  initialAvatar = { direction: DIR_SOUTH, transitionFlags: PLAYER_AVATAR_FLAG_ON_FOOT, hasDirectionSet: false };
  savedMusic = 0;
  /** Set when a map-changing event needs the load callback (CB2_LoadMap) */
  pendingLoad = false;
  /** Selected object (gSelectedObjectEvent) */
  selectedObject = 0;
  /** Field-wide hooks for other modules (battle start etc.) */
  onFrame: Array<() => void> = [];

  constructor(readonly game: Game) {
    setVarGetter(varGet);
    this.objects = new ObjectEvents({
      map: () => this.map,
      playerDestCoords: () => {
        const p = this.objects.player();
        return p ? { ...p.currentCoords } : { x: 0, y: 0 };
      },
      playerIsRunning: () => this.player.isDashing(),
      cameraObjectReset: (object) => { if (this.cameraTarget === object) this.updateCameraPixels(); },
      playerInfo: () => {
        const p = this.objects.player();
        if (!p) return undefined;
        return { facing: p.facingDirection, movementDirection: p.movementDirection, movementActionId: p.movementActionId, copyableMovement: p.playerCopyableMovement, tileTransitionState: this.player.tileTransitionState };
      },
      groundEffect: (object, kind) => this.effects.groundEffect(object, kind),
      emote: (object, kind) => this.effects.startEmoteForObjectEvent(object, kind),
      playSE: (name) => sound.playSE(sound.c(name)),
      cameraCanMove: (direction) => this.CanCameraMoveInDirection(direction),
      registerSprite: (sprite) => this.sprites.getId(this.sprites.add(sprite)),
      unregisterSprite: (sprite) => this.sprites.destroy(sprite),
      cameraOffset: () => ({ x: this.camX, y: this.camY }),
      startDisguise: (object, kind) => this.effects.StartDisguiseFieldEffect(object, kind),
      startDisguiseReveal: (object) => this.effects.StartRevealDisguise(object),
      isDisguiseRevealFinished: (object) => this.effects.UpdateRevealDisguise(object),
    });
    this.player = new PlayerAvatar(this);
    this.control = new FieldControl(this);
    this.messageBox = new FieldMessageBox(this);
    this.doors = new DoorAnimator(this);
    this.effects = new FieldEffects(this);
    this.mapName = new MapNamePopup(this);
    this.mapPreview = new MapPreviewManager(this);
    this.stepCallback = new PerStepCallback(this);
  }

  get header(): MapHeader {
    return this.loaded.header;
  }

  get mapId(): string {
    return this.loaded.header.id;
  }

  LockPlayerFieldControls(): void { this.controlsLocked = true; }
  UnlockPlayerFieldControls(): void { this.controlsLocked = false; }
  ArePlayerFieldControlsLocked(): boolean { return this.controlsLocked; }

  // ---------------------------------------------------------------- map data

  fetchMap(mapId: string): Promise<LoadedMap> {
    let promise = this.mapCache.get(mapId);
    if (!promise) {
      promise = loadMap(mapId);
      this.mapCache.set(mapId, promise);
    }
    return promise;
  }

  /** Load a map and prefetch its neighbours so camera transitions are synchronous. */
  async prepareMap(mapId: string): Promise<LoadedMap> {
    const loaded = await this.fetchMap(mapId);
    this.syncLoaded.set(loaded.header.id, loaded);
    const neighbours = await Promise.all(loaded.connections.map((c) => this.fetchMap(c.mapId)));
    for (const n of neighbours) this.syncLoaded.set(n.header.id, n);
    return loaded;
  }

  mapIdForWarp(w: WarpData): string {
    const id = rom.mapIdByNum(((w.mapGroup & 0xff) << 8) | (w.mapNum & 0xff));
    if (!id) throw new Error(`unknown map ${w.mapGroup}.${w.mapNum}`);
    return id;
  }

  // ---------------------------------------------------------------- warps

  /** SetWarpData (overworld.c): arguments are truncated to the source s8 fields. */
  private SetWarpData(warp: WarpData, mapGroup: number, mapNum: number, warpId: number, x: number, y: number): void {
    const s8 = (value: number): number => (value << 24) >> 24;
    warp.mapGroup = s8(mapGroup); warp.mapNum = s8(mapNum); warp.warpId = s8(warpId);
    warp.x = s8(x); warp.y = s8(y);
  }

  /** SetWarpDestination (overworld.c). */
  SetWarpDestination(mapGroup: number, mapNum: number, warpId: number, x: number, y: number): void {
    this.SetWarpData(this.warpDestination, mapGroup, mapNum, warpId, x, y);
  }

  setWarpDestination(mapGroup: number, mapNum: number, warpId: number, x: number, y: number): void {
    this.SetWarpDestination(mapGroup, mapNum, warpId, x, y);
  }

  /** SetWarpDestinationToMapWarp (overworld.c). */
  SetWarpDestinationToMapWarp(mapGroup: number, mapNum: number, warpId: number): void {
    this.SetWarpDestination(mapGroup, mapNum, warpId, -1, -1);
  }

  setWarpDestinationToMapWarp(mapGroup: number, mapNum: number, warpId: number): void {
    this.SetWarpDestinationToMapWarp(mapGroup, mapNum, warpId);
  }

  /** SetDynamicWarp (overworld.c); the current player coordinates are saved. */
  SetDynamicWarp(_unused: number, mapGroup: number, mapNum: number, warpId: number): void {
    this.SetWarpData(save.dynamicWarp, mapGroup, mapNum, warpId, save.pos.x, save.pos.y);
  }

  /** SetDynamicWarpWithCoords (overworld.c). */
  SetDynamicWarpWithCoords(_unused: number, mapGroup: number, mapNum: number, warpId: number, x: number, y: number): void {
    this.SetWarpData(save.dynamicWarp, mapGroup, mapNum, warpId, x, y);
  }

  /** SetWarpDestinationToDynamicWarp (overworld.c). */
  SetWarpDestinationToDynamicWarp(_unusedWarpId: number): void { this.warpDestination = { ...save.dynamicWarp }; }

  /** SetWarpDestinationToEscapeWarp (overworld.c). */
  SetWarpDestinationToEscapeWarp(): void { this.warpDestination = { ...save.escapeWarp }; }

  /** SetEscapeWarp (overworld.c). */
  SetEscapeWarp(mapGroup: number, mapNum: number, warpId: number, x: number, y: number): void {
    this.SetWarpData(save.escapeWarp, mapGroup, mapNum, warpId, x, y);
  }

  /** SetFixedDiveWarp and SetFixedHoleWarp (overworld.c). */
  SetFixedDiveWarp(mapGroup: number, mapNum: number, warpId: number, x: number, y: number): void {
    this.SetWarpData(this.fixedDiveWarp, mapGroup, mapNum, warpId, x, y);
  }
  SetFixedHoleWarp(mapGroup: number, mapNum: number, warpId: number, x: number, y: number): void {
    this.SetWarpData(this.fixedHoleWarp, mapGroup, mapNum, warpId, x, y);
  }
  SetWarpDestinationToFixedHoleWarp(x: number, y: number): void {
    if (isDummyWarp(this.fixedHoleWarp)) this.warpDestination = { ...this.lastUsedWarp };
    else this.SetWarpDestination(this.fixedHoleWarp.mapGroup, this.fixedHoleWarp.mapNum, -1, x, y);
  }

  /** SetContinueGameWarp family (overworld.c). */
  private SetContinueGameWarp(mapGroup: number, mapNum: number, warpId: number, x: number, y: number): void {
    this.SetWarpData(save.continueGameWarp, mapGroup, mapNum, warpId, x, y);
  }
  SetWarpDestinationToContinueGameWarp(): void { this.warpDestination = { ...save.continueGameWarp }; }
  SetContinueGameWarpToHealLocation(healLocationId: number): void {
    const heal = this.healLocation(healLocationId);
    if (heal) this.SetContinueGameWarp(heal.mapGroup, heal.mapNum, -1, heal.x, heal.y);
  }
  SetContinueGameWarpToDynamicWarp(_unused: number): void { save.continueGameWarp = { ...save.dynamicWarp }; }

  SetWarpDestinationToHealLocation(healLocationId: number): void {
    const heal = this.healLocation(healLocationId);
    if (heal) this.SetWarpDestination(heal.mapGroup, heal.mapNum, -1, heal.x, heal.y);
  }
  setWarpDestinationToHealLocation(healLocationId: number): void { this.SetWarpDestinationToHealLocation(healLocationId); }

  /** Per-map resets shared by LoadMapFromWarp and LoadMapFromCameraTransition. */
  private onMapLoad(): void {
    this.objects.ClearVirtualObjects();
    this.stepCallback.reset();
    ResetCyclingRoadChallengeData();
    mapResetTrainerRematches(this.game);
    TryRegenerateRenewableHiddenItems(save.location.mapGroup, save.location.mapNum);
  }

  /** Overworld_ResetStateAfterFly / Teleport / DigEscRope / WhitingOut */
  resetStateAfterWarpOut(): void {
    this.resetInitialPlayerAvatarState();
    const c = rom.constants;
    flagClear(c.FLAG_SYS_ON_CYCLING_ROAD);
    varSet(c.VAR_MAP_SCENE_ROUTE16, 0);
    flagClear(c.FLAG_SYS_CRUISE_MODE);
    flagClear(c.FLAG_SYS_SAFARI_MODE);
    varSet(c.VAR_MAP_SCENE_FUCHSIA_CITY_SAFARI_ZONE_ENTRANCE, 0);
    flagClear(c.FLAG_SYS_USE_STRENGTH);
    flagClear(c.FLAG_SYS_FLASH_ACTIVE);
    flagClear(c.FLAG_SYS_QL_DEPARTED);
    varSet(c.VAR_QL_ENTRANCE, 0);
  }
  resetStateAfterTeleport(): void { this.resetStateAfterWarpOut(); }
  resetStateAfterDigEscRope(): void { this.resetStateAfterWarpOut(); }
  resetStateAfterFly(): void { this.resetStateAfterWarpOut(); }

  /** SetWarpDestinationToLastHealLocation */
  SetWarpDestinationToLastHealLocation(): void {
    this.warpDestination = { ...save.lastHealLocation };
  }
  setWarpDestinationToLastHealLocation(): void { this.SetWarpDestinationToLastHealLocation(); }

  SetLastHealLocationWarp(healLocationId: number): void {
    const heal = this.healLocation(healLocationId);
    if (heal) this.SetWarpData(save.lastHealLocation, heal.mapGroup, heal.mapNum, -1, heal.x, heal.y);
  }
  setLastHealLocationWarp(healLocationId: number): void { this.SetLastHealLocationWarp(healLocationId); }

  healLocation(id: number): { mapGroup: number; mapNum: number; x: number; y: number } | undefined {
    return GetHealLocation(id) ?? undefined;
  }

  /** SetWhiteoutRespawnWarpAndHealerNpc (heal_location.c). */
  SetWhiteoutRespawnWarpAndHealerNpc(): { warp: WarpData; healerLocalId: number; atHome: boolean } {
    if (varGet(rom.constants.VAR_MAP_SCENE_TRAINER_TOWER) === 1) {
      const towerSave = save as typeof save & { trainerTower?: Array<{ spokeToOwner?: boolean }>; towerChallengeId?: number };
      const spokeToOwner = towerSave.trainerTower?.[towerSave.towerChallengeId ?? 0]?.spokeToOwner ?? false;
      if (!spokeToOwner) varSet(rom.constants.VAR_MAP_SCENE_TRAINER_TOWER, 0);
      varSet(SV.LAST_TALKED, 1);
      return {
        warp: { mapGroup: rom.c("MAP_TRAINER_TOWER_LOBBY") >>> 8, mapNum: rom.c("MAP_TRAINER_TOWER_LOBBY") & 0xff, warpId: -1, x: 4, y: 11 },
        healerLocalId: 1,
        atHome: false,
      };
    }
    const last = save.lastHealLocation;
    const healLocationIdx = GetHealLocationIndexFromMapGroupAndNum(last.mapGroup, last.mapNum);
    if (healLocationIdx === rom.constants.HEAL_LOCATION_NONE) {
      return { warp: { ...this.warpDestination }, healerLocalId: 0, atHome: false };
    }
    const entry = rom.healLocations.heal_locations[healLocationIdx - 1];
    const location = GetHealLocationPointerFromMapGroupAndNum(last.mapGroup, last.mapNum);
    if (!entry || !location) return { warp: { ...this.warpDestination }, healerLocalId: 0, atHome: false };

    const respawnMap = entry.respawn_map ?? entry.map;
    const mapNum = rom.mapNum(respawnMap);
    // These exceptions are the exact coordinates selected in heal_location.c;
    // all other centers use the source's default (7, 4).
    const specialPositions: Record<string, [number, number]> = {
      MAP_PALLET_TOWN_PLAYERS_HOUSE_1F: [8, 5],
      MAP_INDIGO_PLATEAU_POKEMON_CENTER_1F: [13, 12],
      MAP_ONE_ISLAND_POKEMON_CENTER_1F: [5, 4],
      MAP_TRAINER_TOWER_LOBBY: [4, 11],
    };
    const [x, y] = specialPositions[respawnMap] ?? [7, 4];
    if (respawnMap === "MAP_TRAINER_TOWER_LOBBY") varSet(rom.constants.VAR_MAP_SCENE_TRAINER_TOWER, 0);
    const home = respawnMap === "MAP_PALLET_TOWN_PLAYERS_HOUSE_1F";
    const healerLocalId = SetWhiteoutRespawnHealerNpcAsLastTalked(healLocationIdx);
    return {
      warp: { mapGroup: mapNum >> 8, mapNum: mapNum & 0xff, warpId: -1, x, y },
      healerLocalId,
      atHome: home,
    };
  }

  updateEscapeWarp(x: number, y: number): void {
    const current = this.header.mapType;
    let destType = MAP_TYPE.NONE;
    try {
      const destId = this.mapIdForWarp(this.warpDestination);
      const cached = this.mapCache.get(destId);
      void cached;
      destType = rom.mapIndex.maps[destId] ? this.peekMapType(destId) : MAP_TYPE.NONE;
    } catch { /* ignore */ }
    if (isMapTypeOutdoors(current) && !isMapTypeOutdoors(destType) && this.mapId !== "MAP_VIRIDIAN_FOREST") {
      const delta = this.player.object.facingDirection !== DIR_SOUTH ? 1 : 0;
      this.SetEscapeWarp(save.location.mapGroup, save.location.mapNum, -1, x - 7, y - 7 + delta);
    }
  }

  private mapTypes = new Map<string, number>();
  peekMapType(mapId: string): number {
    return this.mapTypes.get(mapId) ?? MAP_TYPE.INDOOR;
  }

  /** WarpIntoMap: ApplyCurrentWarp + LoadCurrentMapData + SetPlayerCoordsFromWarp (after data is loaded). */
  private applyCurrentWarp(): void {
    this.lastUsedWarp = { ...save.location };
    save.location = { ...this.warpDestination };
    this.fixedDiveWarp = dummyWarp();
    this.fixedHoleWarp = dummyWarp();
  }

  private setPlayerCoordsFromWarp(header: MapHeader, width: number, height: number): void {
    const w = save.location;
    if (w.warpId >= 0 && w.warpId < header.warps.length) {
      save.pos = { x: header.warps[w.warpId].x, y: header.warps[w.warpId].y };
    } else if (w.x >= 0 && w.y >= 0) {
      save.pos = { x: w.x, y: w.y };
    } else {
      save.pos = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
    }
  }

  /** Begin CB2_LoadMap for the current warp destination. */
  warpIntoMapAndLoad(): void {
    this.applyCurrentWarp();
    this.loadState = 0;
    this.loadPromise = undefined;
    this.game.setCallbacks(null, () => this.cb2LoadMap());
  }

  // ---------------------------------------------------------------- loading

  private cb2LoadMap(): void {
    switch (this.loadState) {
      case 0: {
        const mapId = this.mapIdForWarp(save.location);
        this.loadError = undefined;
        this.loadPromise = this.prepareMap(mapId);
        this.loadPromise.then(() => { this.loadState = 2; }, (error) => { this.loadError = error; console.error(error); });
        this.loadState = 1;
        break;
      }
      case 1:
        // waiting for data
        break;
      case 2:
        this.loadState = 3;
        void this.loadPromise!.then((loaded) => {
          this.finishMapLoad(loaded);
        });
        break;
    }
  }

  private finishMapLoad(loaded: LoadedMap): void {
    this.setPlayerCoordsFromWarp(loaded.header, loaded.layout.width, loaded.layout.height);
    this.loadMapFromWarp(loaded);
    QuestLog_InitPalettesBackup();
    this.resumeMap();
    // C checks whether playback must advance here; the browser port currently
    // uses the call to cut recording in Quest Log-disabled locations.
    QuestLog_ShouldEndSceneOnMapChange();
    this.initObjectEventsLocal();
    if (gQuestLogState !== C.QL_STATE_PLAYBACK) {
      QuestLog_CheckDepartingIndoorsMap();
      QuestLog_TryRecordDepartedLocation();
    }
    this.initView();
    QL_TryStopSurfing();
    const prevSection = this.lastUsedWarpSection();
    const currSection = this.header.regionMapSection;
    const questLogState = (this.game as unknown as { questLogState?: number }).questLogState;
    const ranMapTransition = CB2_DoChangeMap(() => this.TryDoMapTransition(prevSection, currSection, questLogState));
    if (!ranMapTransition && this.header.showMapName && prevSection !== currSection) {
      this.mapName.show(false);
    }
    this.runFieldCallback();
    this.game.setCallbacks(() => this.cb1(), () => this.cb2());
  }

  private lastUsedWarpSection(): number {
    try {
      const id = this.mapIdForWarp(this.lastUsedWarp);
      return this.sectionCache.get(id) ?? -1;
    } catch {
      return -1;
    }
  }

  /** TryDoMapTransition (fldeff_flash.c): choose the source preview/transition when the region changes. */
  private TryDoMapTransition(fromSection: number, toSection: number, questLogState?: number): boolean {
    if (fromSection !== toSection) {
      if (MapHasPreviewScreen_HandleQLState2(toSection, MPS_TYPE_FOREST, questLogState)) {
        this.mapPreview.MapPreview_StartForestTransition(toSection);
        return true;
      }
      if (MapHasPreviewScreen_HandleQLState2(toSection, MPS_TYPE_CAVE, questLogState)) {
        this.mapPreview.RunMapPreviewScreen(toSection);
        return true;
      }
    }
    const fromType = this.lastUsedWarpType();
    if (MapTransitionIsEnter(fromType, this.header.mapType)) {
      this.mapPreview.FlashTransition_Enter();
      return true;
    }
    if (MapTransitionIsExit(fromType, this.header.mapType)) {
      this.mapPreview.FlashTransition_Exit();
      return true;
    }
    return false;
  }

  private sectionCache = new Map<string, number>();

  /** LoadMapFromWarp */
  private loadMapFromWarp(loaded: LoadedMap): void {
    this.loaded = loaded;
    this.mapTypes.set(loaded.header.id, loaded.header.mapType);
    this.sectionCache.set(loaded.header.id, loaded.header.regionMapSection);
    for (const c of loaded.connections) this.mapTypes.set(c.mapId, c.header.mapType);
    this.loadObjEventTemplatesFromHeader();
    const outdoors = isMapTypeOutdoors(this.header.mapType);
    clearTempFieldEventData();
    this.effects.resetEncounterImmunity();
    this.game.weather.SetSavedWeatherFromCurrMapHeader(this.loaded.header.weather);
    this.onMapLoad();
    onWarpForRoamer();
    TrySetMapSaveWarpStatus();
    if (outdoors && "FLAG_SYS_FLASH_ACTIVE" in rom.constants) flagClear(rom.c("FLAG_SYS_FLASH_ACTIVE"));
    this.setDefaultFlashLevel();
    this.savedMusic = 0;
    this.RunOnTransitionMapScript();
    this.initMap();
    this.game.weather.DoCurrentWeather();
  }

  private setDefaultFlashLevel(): void {
    if (!this.header.requiresFlash) this.flashLevel = 0;
    else if (flagGet(rom.constants.FLAG_SYS_FLASH_ACTIVE ?? 0)) this.flashLevel = 0;
    else this.flashLevel = MAX_FLASH_LEVEL; // gMaxFlashLevel
    if (this.flashLevel !== 0) {
      WriteFlashScanlineEffectBuffer(this.flashLevel);
      ScanlineEffect_SetParams({ dmaDest: REG_OFFSET_WIN0H, dmaControl: SCANLINE_EFFECT_DMACNT_16BIT, initState: 1 });
    }
  }

  /** PrintWhiteOutRecoveryMessage from field_screen_effect.c, adapted to the Canvas window layer. */
  private PrintWhiteOutRecoveryMessage(taskId: number, textSymbol: string, x: number, y: number): boolean {
    const d = tasks.data(taskId);
    switch (d[2]) {
      case 0: {
        const text = expandPlaceholders(rom.text(textSymbol));
        textFlags.canABSpeedUpPrint = false;
        const window = this.whiteOutWindow!;
        this.whiteOutPrinter = new TextPrinter(window, FONT_NORMAL, text, {
          x: x * 8, y: y * 8, speed: 2, fg: 1, bg: 0, shadow: 2, letterSpacing: 1, lineSpacing: 0,
        });
        d[2] = 1;
        break;
      }
      case 1:
        this.whiteOutPrinter?.run();
        if (!this.whiteOutPrinter?.active) {
          d[2] = 0;
          return true;
        }
        break;
    }
    return false;
  }

  /** Task_RushInjuredPokemonToCenter from field_screen_effect.c. */
  private Task_RushInjuredPokemonToCenter(taskId: number): void {
    const d = tasks.data(taskId);
    switch (d[0]) {
      case 0: {
        this.whiteOutWindow = new Window(0, 5, 30, 11, stdPalette(0));
        this.whiteOutWindow.fill(0);
        this.windows.add(this.whiteOutWindow);
        const pallet = GetHealLocation(rom.c("HEAL_LOCATION_PALLET_TOWN"));
        const last = save.lastHealLocation;
        const atHome = !!pallet && last.mapGroup === pallet.mapGroup && last.mapNum === pallet.mapNum
          && last.warpId === -1 && last.x === pallet.x && last.y === pallet.y;
        d[1] = atHome ? 1 : 0;
        d[0] = atHome ? 4 : 1;
        break;
      }
      case 1:
      case 4:
        if (this.PrintWhiteOutRecoveryMessage(taskId, d[0] === 1 ? "gText_PlayerScurriedToCenter" : "gText_PlayerScurriedBackHome", 2, 8)) {
          this.objects.turn(this.player.object, DIR_NORTH);
          d[0]++;
        }
        break;
      case 2:
      case 5:
        if (this.whiteOutWindow) this.windows.remove(this.whiteOutWindow);
        this.whiteOutWindow = undefined;
        this.whiteOutPrinter = undefined;
        paletteFade.fill(RGB_BLACK);
        this.fadeInFromBlack();
        d[0]++;
        break;
      case 3:
      case 6:
        if (!paletteFade.active) {
          tasks.destroy(taskId);
          this.script.ScriptContext_SetupScript(rom.label(d[0] === 3 ? "EventScript_AfterWhiteOutHeal" : "EventScript_AfterWhiteOutMomHeal"));
        }
        break;
    }
  }

  /** FieldCB_RushInjuredPokemonToCenter from field_screen_effect.c. */
  FieldCB_RushInjuredPokemonToCenter(): void {
    this.controlsLocked = true;
    paletteFade.fill(RGB_BLACK);
    tasks.create((taskId) => this.Task_RushInjuredPokemonToCenter(taskId), 10);
  }

  /** InitMap: InitMapLayoutData + ON_LOAD */
  private initMap(): void {
    this.map.init(this.loaded);
    this.map.onChange = () => this.renderer?.invalidate();
    this.RunOnLoadMapScript();
  }

  loadObjEventTemplatesFromHeader(): void {
    const templates: MapObjectTemplate[] = [];
    for (const obj of this.header.objects) {
      if (obj.clone) continue; // clones only mirror NPCs of the connected map
      templates.push({ ...obj });
    }
    this.objects.templates = templates;
    this.objects.mapNum = save.location.mapNum;
    this.objects.mapGroup = save.location.mapGroup;
  }

  /** ResumeMap */
  private resumeMap(): void {
    tasks.reset();
    this.sprites.clear();
    this.windows.clear();
    paletteFade.clear();
    this.InstallCameraPanAheadCallback();
    this.effects.reset();
    this.game.weather.resumePausedWeather();
    this.messageBox.reset();
    this.RunOnResumeMapScript();
  }

  /** InitObjectEventsLocal + SetCameraToTrackPlayer */
  private initObjectEventsLocal(): void {
    this.objects.removeAll();
    const x = save.pos.x + MAP_OFFSET;
    const y = save.pos.y + MAP_OFFSET;
    const state = this.getInitialPlayerAvatarState();
    this.player.InitPlayerAvatar(x, y, state.direction, save.playerGender);
    this.player.setTransitionFlags(state.transitionFlags);
    this.resetInitialPlayerAvatarState();
    this.objects.trySpawnInView(save.pos.x, save.pos.y);
    this.syncObjectSprites();
    this.player.InitWarpArrowSprite();
    this.tryRunOnWarpIntoMapScript();
    this.cameraTarget = this.player.object;
    this.cameraObject = null;
    this.InstallCameraPanAheadCallback();
    this.updateCameraPixels();
  }

  private initView(): void {
    this.renderer = new TileRenderer(this.loaded.primary, this.loaded.secondary);
    this.animator = new TilesetAnimator(this.renderer);
    this.doors.reset();
  }

  private getInitialPlayerAvatarState(): { direction: number; transitionFlags: number } {
    const behavior = this.map.behaviorAt(save.pos.x + 7, save.pos.y + 7);
    const mapType = this.header.mapType;
    const s = this.initialAvatar;
    let flags = PLAYER_AVATAR_FLAG_ON_FOOT;
    if (mapType !== MAP_TYPE.INDOOR && flagGet(rom.constants.FLAG_SYS_CRUISE_MODE ?? 0)) flags = PLAYER_AVATAR_FLAG_ON_FOOT;
    else if (MB.MetatileBehavior_IsSurfable(behavior) && !this.isSurfableInSeafoamIslands(behavior)) flags = PLAYER_AVATAR_FLAG_SURFING;
    else if (!this.header.allowCycling) flags = PLAYER_AVATAR_FLAG_ON_FOOT;
    else flags = s.transitionFlags === 2 || s.transitionFlags === 4 ? s.transitionFlags : PLAYER_AVATAR_FLAG_ON_FOOT;
    let direction = DIR_SOUTH;
    if (MB.MetatileBehavior_IsNonAnimDoor(behavior) || MB.MetatileBehavior_IsWarpDoor_2(behavior)) direction = DIR_SOUTH;
    else if (MB.MetatileBehavior_IsSouthArrowWarp(behavior)) direction = DIR_NORTH;
    else if (MB.MetatileBehavior_IsNorthArrowWarp(behavior)) direction = DIR_SOUTH;
    else if (MB.MetatileBehavior_IsWestArrowWarp(behavior)) direction = DIR_EAST;
    else if (MB.MetatileBehavior_IsEastArrowWarp(behavior)) direction = DIR_WEST;
    else if (MB.MetatileBehavior_IsDirectionalUpRightStairWarp(behavior) || MB.MetatileBehavior_IsDirectionalDownRightStairWarp(behavior)) direction = DIR_WEST;
    else if (MB.MetatileBehavior_IsDirectionalUpLeftStairWarp(behavior) || MB.MetatileBehavior_IsDirectionalDownLeftStairWarp(behavior)) direction = DIR_EAST;
    else if (MB.MetatileBehavior_IsLadder(behavior)) direction = s.direction;
    else if (s.hasDirectionSet) direction = s.direction;
    return { direction, transitionFlags: flags };
  }

  private isSurfableInSeafoamIslands(behavior: number): boolean {
    return MB.MetatileBehavior_IsSurfable(behavior) && (this.mapId === "MAP_SEAFOAM_ISLANDS_B3F" || this.mapId === "MAP_SEAFOAM_ISLANDS_B4F");
  }

  resetInitialPlayerAvatarState(): void {
    this.initialAvatar = { direction: DIR_SOUTH, transitionFlags: PLAYER_AVATAR_FLAG_ON_FOOT, hasDirectionSet: false };
  }

  setInitialPlayerAvatarStateWithDirection(direction: number): void {
    this.initialAvatar = { direction, transitionFlags: PLAYER_AVATAR_FLAG_ON_FOOT, hasDirectionSet: true };
  }

  storeInitialPlayerAvatarState(): void {
    this.initialAvatar = { direction: this.player.object.facingDirection, transitionFlags: this.player.flags & 0x0f || PLAYER_AVATAR_FLAG_ON_FOOT, hasDirectionSet: false };
  }

  // ---------------------------------------------------------------- map scripts

  private MapHeaderGetScriptTable(tag: number): number {
    let p = this.header.mapScripts;
    if (!p) return 0;
    for (let guard = 0; guard < 16; guard++) {
      const t = rom.u8(p);
      if (t === 0) return 0;
      if (t === tag) return rom.u32(p + 1);
      p += 5;
    }
    return 0;
  }

  private MapHeaderRunScriptType(tag: number): void {
    const ptr = this.MapHeaderGetScriptTable(tag);
    if (ptr) this.script.RunScriptImmediately(ptr);
  }

  RunOnLoadMapScript(): void { this.MapHeaderRunScriptType(MAP_SCRIPT_ON_LOAD); }
  RunOnTransitionMapScript(): void { this.MapHeaderRunScriptType(MAP_SCRIPT_ON_TRANSITION); }
  RunOnResumeMapScript(): void { this.MapHeaderRunScriptType(MAP_SCRIPT_ON_RESUME); }
  RunOnReturnToFieldMapScript(): void { this.MapHeaderRunScriptType(MAP_SCRIPT_ON_RETURN_TO_FIELD); }
  RunOnDiveWarpMapScript(): void { this.MapHeaderRunScriptType(MAP_SCRIPT_ON_DIVE_WARP); }

  /** MapHeaderCheckScriptTable */
  private MapHeaderCheckScriptTable(tag: number): number {
    let ptr = this.MapHeaderGetScriptTable(tag);
    if (!ptr) return 0;
    for (let guard = 0; guard < 64; guard++) {
      const var1 = rom.u16(ptr);
      if (!var1) return 0;
      const var2 = rom.u16(ptr + 2);
      if (varGet(var1) === varGet(var2)) return rom.u32(ptr + 4);
      ptr += 8;
    }
    return 0;
  }

  tryRunOnFrameMapScript(): boolean {
    const ptr = this.MapHeaderCheckScriptTable(MAP_SCRIPT_ON_FRAME_TABLE);
    if (!ptr) return false;
    this.script.ScriptContext_SetupScript(ptr);
    return true;
  }

  tryRunOnWarpIntoMapScript(): void {
    const ptr = this.MapHeaderCheckScriptTable(MAP_SCRIPT_ON_WARP_INTO_MAP_TABLE);
    if (ptr) this.script.RunScriptImmediately(ptr);
  }

  // ---------------------------------------------------------------- field callbacks

  private runFieldCallback(): void {
    if (this.fieldCallback2) {
      // Only used by special cases; run once here.
      if (this.fieldCallback2()) { this.fieldCallback2 = null; this.fieldCallback = null; }
      return;
    }
    const callback = this.fieldCallback ?? (() => this.fieldCBDefaultWarpExit());
    this.fieldCallback = null;
    callback();
  }

  /** gDisableMapMusicChangeOnMapLoad == MUSIC_DISABLE_KEEP for the next load. */
  keepMusicOnNextLoad = false;

  playSpecialMapMusic(): void {
    if (this.keepMusicOnNextLoad) { this.keepMusicOnNextLoad = false; return; }
    const music = this.savedMusic || this.header.music;
    if (music && music !== sound.currentBGM) sound.playNewMapMusic(music);
  }

  fieldCBDefaultWarpExit(): void {
    this.playSpecialMapMusic();
    this.setUpWarpExitTask(false);
    this.controlsLocked = true;
  }

  fieldCBWarpExitFadeFromBlack(): void {
    this.playSpecialMapMusic();
    this.setUpWarpExitTask(true);
    this.controlsLocked = true;
  }

  /** FieldCB_ContinueScriptHandleMusic (field_fadetransition.c). */
  FieldCB_ContinueScriptHandleMusic(): void {
    this.continueScriptAfterFade(true);
  }

  /** FieldCB_ContinueScript (field_fadetransition.c). */
  FieldCB_ContinueScript(): void {
    this.continueScriptAfterFade(false);
  }

  private continueScriptAfterFade(handleMusic: boolean): void {
    if (handleMusic) this.playSpecialMapMusic();
    this.controlsLocked = true;
    this.fadeInFromBlack();
    tasks.create((taskId) => this.Task_ContinueScript(taskId), 10);
  }

  /** Task_ContinueScript (field_fadetransition.c). */
  private Task_ContinueScript(taskId: number): void {
    if (!paletteFade.active) {
      tasks.destroy(taskId);
      this.script.ScriptContext_Enable();
    }
  }

  fadeInFromBlack(): void {
    palette_bg_faded_fill_black();
    paletteFade.fadeScreen(FADE_FROM_BLACK, 0);
    palette_bg_faded_fill_black();
  }

  warpFadeInScreen(delay = 0): void {
    const lastType = this.lastUsedWarpType();
    if (MapTransitionIsExit(lastType, this.header.mapType)) {
      palette_bg_faded_fill_white();
      paletteFade.fadeScreen(FADE_FROM_WHITE, delay);
      palette_bg_faded_fill_white();
    } else {
      palette_bg_faded_fill_black();
      paletteFade.fadeScreen(FADE_FROM_BLACK, delay);
      palette_bg_faded_fill_black();
    }
  }

  /** ExitWarpFadeInScreen (field_fadetransition.c). */
  private ExitWarpFadeInScreen(playerNotMoving: boolean): void {
    if (!playerNotMoving) this.warpFadeInScreen();
    else this.fadeInFromBlack();
  }

  /** WarpFadeInScreenWithDelay (field_fadetransition.c). */
  private WarpFadeInScreenWithDelay(delay: number): void {
    this.warpFadeInScreen(delay);
  }

  warpFadeOutScreen(): void {
    let destType = MAP_TYPE.NONE;
    try { destType = this.peekMapType(this.mapIdForWarp(this.warpDestination)); } catch { /* keep */ }
    if (MapTransitionIsEnter(this.header.mapType, destType)) paletteFade.fadeScreen(FADE_TO_WHITE, 0);
    else paletteFade.fadeScreen(FADE_TO_BLACK, 0);
  }

  /** WaitWarpFadeOutScreen (field_fadetransition.c). */
  private WaitWarpFadeOutScreen(): boolean {
    return paletteFade.active;
  }

  private lastUsedWarpType(): number {
    try { return this.peekMapType(this.mapIdForWarp(this.lastUsedWarp)); } catch { return MAP_TYPE.NONE; }
  }

  /** SetUpWarpExitTask */
  private setUpWarpExitTask(playerNotMoving: boolean): void {
    if (this.mapPreview.isActive() || !this.mapPreview.ForestMapPreviewScreenIsRunning()) return;
    const p = this.player.object;
    const behavior = this.map.behaviorAt(p.currentCoords.x, p.currentCoords.y);
    if (MB.MetatileBehavior_IsWarpDoor_2(behavior)) {
      paletteFade.fill(MapTransitionIsExit(this.lastUsedWarpType(), this.header.mapType) ? RGB_WHITE : RGB_BLACK);
      this.startExitDoorTask();
      this.gExitStairsMovementDisabled = false;
      return;
    }
    this.ExitWarpFadeInScreen(playerNotMoving);
    if (MB.MetatileBehavior_IsNonAnimDoor(behavior)) this.startExitNonAnimDoorTask();
    else if (MB.MetatileBehavior_IsDirectionalStairWarp(behavior) && !this.gExitStairsMovementDisabled) this.startExitStairsTask();
    else this.startExitNonDoorTask();
    this.gExitStairsMovementDisabled = false;
  }

  /** FieldFadeTransitionBackgroundEffectIsFinished (field_fadetransition.c). */
  private FieldFadeTransitionBackgroundEffectIsFinished(): boolean {
    return IsWeatherNotFadingIn() && this.mapPreview.ForestMapPreviewScreenIsRunning();
  }

  /** GetStairsMovementDirection (field_fadetransition.c); C narrows behavior to u8. */
  private GetStairsMovementDirection(metatileBehavior: number): [number, number] {
    const behavior = metatileBehavior & 0xff;
    if (MB.MetatileBehavior_IsDirectionalUpRightStairWarp(behavior)) return [16, -10];
    if (MB.MetatileBehavior_IsDirectionalUpLeftStairWarp(behavior)) return [-17, -10];
    if (MB.MetatileBehavior_IsDirectionalDownRightStairWarp(behavior)) return [17, 3];
    if (MB.MetatileBehavior_IsDirectionalDownLeftStairWarp(behavior)) return [-17, 3];
    return [0, 0];
  }

  /** ExitStairsMovement (field_fadetransition.c), using task data slots 1..5 as s16. */
  private ExitStairsMovement(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    const player = this.player.object;
    const behavior = this.map.behaviorAt(player.currentCoords.x, player.currentCoords.y);
    const direction = (MB.MetatileBehavior_IsDirectionalDownRightStairWarp(behavior)
      || MB.MetatileBehavior_IsDirectionalUpRightStairWarp(behavior)) ? DIR_WEST : DIR_EAST;
    this.objects.forceSetHeldMovement(player, direction === DIR_WEST
      ? C.MOVEMENT_ACTION_WALK_IN_PLACE_FAST_LEFT
      : C.MOVEMENT_ACTION_WALK_IN_PLACE_FAST_RIGHT);
    const [speedX, speedY] = this.GetStairsMovementDirection(behavior);
    data[3] = speedX * 16;
    data[4] = speedY * 16;
    data[5] = 16;
    player.sprite.x2 = data[3] >> 5;
    player.sprite.y2 = data[4] >> 5;
    data[1] = -speedX;
    data[2] = -speedY;
  }

  /** WaitStairExitMovementFinished (field_fadetransition.c). */
  private WaitStairExitMovementFinished(taskId: number): boolean {
    const data = tasks.tasks[taskId].data;
    const sprite = this.player.object.sprite;
    if (data[5] !== 0) {
      data[3] += data[1];
      data[4] += data[2];
      sprite.x2 = data[3] >> 5;
      sprite.y2 = data[4] >> 5;
      data[5]--;
      return true;
    }
    sprite.x2 = 0;
    sprite.y2 = 0;
    return false;
  }

  /** Task_ExitStairs (field_fadetransition.c). */
  private Task_ExitStairs(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    if (data[0] === 0) {
      this.playSpecialMapMusic();
      this.warpFadeInScreen();
      this.controlsLocked = true;
      this.ExitStairsMovement(taskId);
      data[0]++;
    } else if (data[0] === 1) {
      if (!this.WaitStairExitMovementFinished(taskId)) data[0]++;
    } else if (this.FieldFadeTransitionBackgroundEffectIsFinished()) {
      // CameraObjectReset1: this renderer tracks the player directly and has no camera-object sprite.
      this.cameraTarget = this.player.object;
      this.cameraObject = null;
      this.controlsLocked = false;
      tasks.destroy(taskId);
    }
  }

  private startExitStairsTask(): void {
    tasks.create((taskId) => this.Task_ExitStairs(taskId), 10);
  }

  private startExitDoorTask(): void {
    tasks.create((taskId) => this.Task_ExitDoor(taskId), 10);
  }

  /** SetPlayerVisibility (field_fadetransition.c). */
  private SetPlayerVisibility(visible: boolean): void {
    this.player.SetPlayerInvisibility(!visible);
  }

  /** Task_ExitDoor (field_fadetransition.c), with the C task data slots. */
  private Task_ExitDoor(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    const player = this.player.object;
    if (data[0] === 0) data[0] = 5;
    switch (data[0]) {
      case 5:
        this.SetPlayerVisibility(false);
        this.objects.freezeAll();
        DoOutwardBarnDoorWipe();
        this.WarpFadeInScreenWithDelay(3);
        data[0] = 6;
        break;
      case 6:
        data[15]++;
        if (data[15] === 25) {
          data[2] = player.currentCoords.x;
          data[3] = player.currentCoords.y;
          sound.playSE(this.doors.GetDoorSoundEffect(data[2], data[3]));
          this.doors.FieldAnimateDoorOpen(data[2], data[3]);
          data[0] = 7;
        }
        break;
      case 7:
        if (!this.doors.FieldIsDoorAnimationRunning()) {
          data[12] = player.currentCoords.x;
          data[13] = player.currentCoords.y;
          this.SetPlayerVisibility(true);
          this.objects.setHeldMovement(player, C.MOVEMENT_ACTION_WALK_NORMAL_DOWN);
          data[0] = 8;
        }
        break;
      case 8:
        data[14]++;
        if (data[14] === 14) {
          this.doors.FieldAnimateDoorClose(data[12], data[13]);
          data[0] = 9;
        }
        break;
      case 9:
        if (this.FieldFadeTransitionBackgroundEffectIsFinished()
            && this.player.isStandingStill()
            && !this.doors.FieldIsDoorAnimationRunning()
            && !tasks.isActive(Task_BarnDoorWipe)) {
          this.objects.ObjectEventClearHeldMovementIfFinished(player);
          data[0] = 4;
        }
        break;
      case 4:
        this.objects.unfreezeAll();
        this.controlsLocked = false;
        tasks.destroy(taskId);
        break;
    }
  }

  private startExitNonAnimDoorTask(): void {
    tasks.create((taskId) => this.Task_ExitNonAnimDoor(taskId), 10);
  }

  /** Task_ExitNonAnimDoor (field_fadetransition.c). */
  private Task_ExitNonAnimDoor(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    const player = this.player.object;
    switch (data[0]) {
      case 0:
        this.SetPlayerVisibility(false);
        this.objects.freezeAll();
        data[2] = player.currentCoords.x;
        data[3] = player.currentCoords.y;
        data[0] = 1;
        break;
      case 1:
        if (this.FieldFadeTransitionBackgroundEffectIsFinished()) {
          this.SetPlayerVisibility(true);
          this.objects.setHeldMovement(player, this.GetWalkNormalMovementAction(player.facingDirection));
          data[0] = 2;
        }
        break;
      case 2:
        if (this.player.isStandingStill()) data[0] = 3;
        break;
      case 3:
        this.objects.unfreezeAll();
        this.controlsLocked = false;
        tasks.destroy(taskId);
        break;
    }
  }

  private GetWalkNormalMovementAction(direction: number): number {
    if (direction === DIR_NORTH) return C.MOVEMENT_ACTION_WALK_NORMAL_UP;
    if (direction === DIR_WEST) return C.MOVEMENT_ACTION_WALK_NORMAL_LEFT;
    if (direction === DIR_EAST) return C.MOVEMENT_ACTION_WALK_NORMAL_RIGHT;
    return C.MOVEMENT_ACTION_WALK_NORMAL_DOWN;
  }

  private startExitNonDoorTask(): void {
    tasks.create((taskId) => this.Task_ExitNonDoor(taskId), 10);
  }

  /** Task_ExitNonDoor (field_fadetransition.c). */
  private Task_ExitNonDoor(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    if (data[0] === 0) {
      this.objects.freezeAll();
      this.controlsLocked = true;
      data[0]++;
    } else if (this.FieldFadeTransitionBackgroundEffectIsFinished()) {
      this.objects.unfreezeAll();
      this.controlsLocked = false;
      tasks.destroy(taskId);
    }
  }

  // Warp starters (field_fadetransition.c)

  /** DoWarp */
  doWarp(playExitSE = true): void {
    this.controlsLocked = true;
    this.tryFadeOutOldMapMusic();
    this.warpFadeOutScreen();
    if (playExitSE) sound.playSE(sound.c("SE_EXIT"));
    this.fieldCallback = () => this.fieldCBDefaultWarpExit();
    this.startTeleport2WarpTask();
  }

  doDiveWarp(): void {
    this.doWarp(false);
  }

  /** FieldCB_SafariZoneRanOutOfBalls (field_fadetransition.c). */
  FieldCB_SafariZoneRanOutOfBalls(): void {
    this.controlsLocked = true;
    this.playSpecialMapMusic();
    this.fadeInFromBlack();
    tasks.create((taskId) => this.Task_SafariZoneRanOutOfBalls(taskId), 10);
  }

  /** Task_SafariZoneRanOutOfBalls (field_fadetransition.c). */
  private Task_SafariZoneRanOutOfBalls(taskId: number): void {
    if (!this.FieldFadeTransitionBackgroundEffectIsFinished()) return;
    this.UnlockPlayerFieldControls();
    tasks.destroy(taskId);
    this.objects.ObjectEventClearHeldMovementIfFinished(this.player.object);
    this.game.scriptMovement.unfreezeAndStop();
    this.objects.unfreezeAll();
  }

  doFallWarp(): void {
    this.doWarp(false);
    this.fieldCallback = () => this.fieldCBFallWarpExit();
  }

  private fieldCBFallWarpExit(): void {
    this.playSpecialMapMusic();
    this.warpFadeInScreen();
    this.controlsLocked = true;
    this.objects.freezeAll();
    const p = this.player.object;
    this.player.SetPlayerInvisibility(true);
    let state = 0;
    let fallY = -160;
    const id = tasks.create(() => {
      switch (state) {
        case 0:
          if (!paletteFade.active) { this.player.SetPlayerInvisibility(false); state = 1; }
          break;
        case 1:
          fallY += 8;
          p.sprite.y2 = Math.min(0, fallY);
          if (fallY >= 0) { p.sprite.y2 = 0; sound.playSE(sound.c("SE_M_STRENGTH")); state = 2; }
          break;
        case 2:
          this.objects.unfreezeAll();
          this.controlsLocked = false;
          tasks.destroy(id);
          break;
      }
    }, 10);
  }

  doDoorWarp(): void {
    this.controlsLocked = true;
    this.fieldCallback = () => this.fieldCBDefaultWarpExit();
    tasks.create((taskId) => this.Task_DoorWarp(taskId), 10);
  }

  /** Task_DoorWarp (field_fadetransition.c). */
  private Task_DoorWarp(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    const x = data[2]!, y = data[3]!;
    const player = this.player.object;
    switch (data[0]) {
        case 0:
          this.objects.freezeAll();
          ({ x: data[2], y: data[3] } = PlayerGetDestCoords());
          sound.playSE(this.doors.GetDoorSoundEffect(data[2]!, data[3]! - 1));
          data[1] = this.doors.FieldAnimateDoorOpen(data[2]!, data[3]! - 1);
          data[0] = 1;
          break;
        case 1:
          if (data[1]! < 0 || !tasks.tasks[data[1]!]?.isActive) {
            this.objects.clearHeldMovementIfActive(player);
            this.objects.setHeldMovement(player, C.MOVEMENT_ACTION_WALK_NORMAL_UP);
            data[0] = 2;
          }
          break;
        case 2:
          if (this.player.isStandingStill()) {
            data[1] = this.doors.FieldAnimateDoorClose(x, y - 1);
            this.objects.ObjectEventClearHeldMovementIfFinished(player);
            this.player.SetPlayerInvisibility(true);
            data[0] = 3;
          }
          break;
        case 3:
          if (data[1]! < 0 || !tasks.tasks[data[1]!]?.isActive) data[0] = 4;
          break;
        case 4:
          this.tryFadeOutOldMapMusic();
          this.warpFadeOutScreen();
          PlayRainStoppingSoundEffect();
          data[0] = 0;
          tasks.setFunc(taskId, (id) => this.Task_Teleport2Warp(id));
          break;
    }
  }

  doTeleportWarp(): void {
    this.controlsLocked = true;
    this.tryFadeOutOldMapMusic();
    this.fieldCallback = () => this.fieldCBTeleportWarpIn();
    tasks.create((taskId) => this.Task_TeleportWarp(taskId), 10);
  }

  /** Task_TeleportWarp (field_fadetransition.c). */
  private Task_TeleportWarp(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    switch (data[0]) {
        case 0:
          this.objects.freezeAll();
          this.controlsLocked = true;
          sound.playSE(sound.c("SE_WARP_IN"));
          this.player.StartTeleportWarpOutPlayerAnim();
          data[0]++;
          break;
        case 1:
          if (!this.player.WaitTeleportWarpOutPlayerAnim()) { this.warpFadeOutScreen(); data[0]++; }
          break;
        case 2:
          if (!this.WaitWarpFadeOutScreen() && sound.isBGMPausedOrStopped()) data[0]++;
          break;
        case 3:
          this.warpIntoMapAndLoad();
          tasks.destroy(taskId);
          break;
    }
  }

  /** DoTeleport2Warp (field_fadetransition.c): warp with the teleport-in callback only. */
  DoTeleport2Warp(): void {
    this.controlsLocked = true;
    this.startTeleport2WarpTask();
    this.fieldCallback = () => this.fieldCBTeleportWarpIn();
  }

  fieldCBTeleportWarpIn(): void {
    this.playSpecialMapMusic();
    this.warpFadeInScreen();
    sound.playSE(sound.c("SE_WARP_OUT"));
    this.controlsLocked = true;
    tasks.create((taskId) => this.Task_TeleportWarpIn(taskId), 10);
  }

  /** Task_TeleportWarpIn (field_fadetransition.c). */
  private Task_TeleportWarpIn(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    switch (data[0]) {
      case 0:
        this.objects.freezeAll();
        this.controlsLocked = true;
        this.player.StartTeleportInPlayerAnim();
        data[0]++;
        break;
      case 1:
        if (this.FieldFadeTransitionBackgroundEffectIsFinished() && !this.player.WaitTeleportInPlayerAnim()) {
          this.objects.unfreezeAll();
          this.controlsLocked = false;
          tasks.destroy(taskId);
        }
        break;
    }
  }

  doStairWarp(behavior: number, delay: number): void {
    const taskId = tasks.create((id) => this.Task_StairWarp(id), 10);
    tasks.tasks[taskId].data[1] = behavior & 0xffff;
    tasks.tasks[taskId].data[15] = delay & 0xffff;
    this.Task_StairWarp(taskId);
  }

  /** ForceStairsMovement (field_fadetransition.c). */
  private ForceStairsMovement(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    const player = this.player.object;
    const direction = player.facingDirection;
    const action = direction === DIR_NORTH ? C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_UP
      : direction === DIR_WEST ? C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_LEFT
        : direction === DIR_EAST ? C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_RIGHT
          : C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_DOWN;
    this.objects.forceSetHeldMovement(player, action);
    const [speedX, speedY] = this.GetStairsMovementDirection(data[1]);
    data[2] = speedX;
    data[3] = speedY;
  }

  /** UpdateStairsMovement (field_fadetransition.c), with C s16 task-data slots. */
  private UpdateStairsMovement(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    const player = this.player.object;
    if (data[3] > 0 || data[6] > 6) data[5] += data[3];
    data[4] += data[2];
    data[6]++;
    player.sprite.x2 = data[4] >> 5;
    player.sprite.y2 = data[5] >> 5;
    if (player.heldMovementFinished) {
      const direction = player.facingDirection;
      const action = direction === DIR_NORTH ? C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_UP
        : direction === DIR_WEST ? C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_LEFT
          : direction === DIR_EAST ? C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_RIGHT
            : C.MOVEMENT_ACTION_WALK_IN_PLACE_NORMAL_DOWN;
      this.objects.forceSetHeldMovement(player, action);
    }
  }

  /** Task_StairWarp (field_fadetransition.c), preserving its immediate state-0 call. */
  private Task_StairWarp(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    const player = this.player.object;
    switch (data[0]) {
      case 0:
        this.controlsLocked = true;
        this.objects.freezeAll();
        // CameraObjectReset2 has no object-camera sprite in the Canvas overworld.
        data[0]++;
        break;
      case 1:
        if (!this.objects.isMovementOverridden(player) || this.objects.ObjectEventClearHeldMovementIfFinished(player)) {
          if (data[15] !== 0) data[15]--;
          else {
            this.tryFadeOutOldMapMusic();
            PlayRainStoppingSoundEffect();
            player.sprite.priority = 1;
            this.ForceStairsMovement(taskId);
            sound.playSE(sound.c("SE_EXIT"));
            data[0]++;
          }
        }
        break;
      case 2:
        this.UpdateStairsMovement(taskId);
        data[15]++;
        if (data[15] >= 12) {
          this.warpFadeOutScreen();
          data[0]++;
        }
        break;
      case 3:
        this.UpdateStairsMovement(taskId);
        if (!this.WaitWarpFadeOutScreen() && sound.isBGMPausedOrStopped()) data[0]++;
        break;
      default:
        this.fieldCallback = () => this.fieldCBDefaultWarpExit();
        this.warpIntoMapAndLoad();
        tasks.destroy(taskId);
        break;
    }
  }

  private startTeleport2WarpTask(): void {
    tasks.create((taskId) => this.Task_Teleport2Warp(taskId), 10);
  }

  /** Task_Teleport2Warp (field_fadetransition.c). */
  private Task_Teleport2Warp(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    switch (data[0]) {
        case 0:
          this.objects.freezeAll();
          this.controlsLocked = true;
          data[0]++;
          break;
        case 1:
          if (!paletteFade.active && sound.isBGMPausedOrStopped()) data[0]++;
          break;
        case 2:
          tasks.destroy(taskId);
          this.warpIntoMapAndLoad();
          break;
    }
  }

  /** TryFadeOutOldMapMusic */
  tryFadeOutOldMapMusic(): void {
    if (flagGet(rom.constants.FLAG_DONT_TRANSITION_MUSIC ?? 0)) return;
    const destMusic = this.destinationMusic();
    if (destMusic !== undefined && destMusic !== sound.currentBGM) sound.fadeOutMapMusic(this.destinationMusicFadeoutSpeed());
  }

  /** GetWarpDestinationMusic: music of the map header at warpDestination, when already cached. */
  private destinationMusic(): number | undefined {
    try {
      const dest = this.mapIdForWarp(this.warpDestination);
      return rom.cachedMap(dest)?.music;
    } catch {
      return undefined;
    }
  }

  /** GetMapMusicFadeoutSpeed */
  private destinationMusicFadeoutSpeed(): number {
    try {
      const dest = this.mapIdForWarp(this.warpDestination);
      return IsMapTypeIndoors(this.peekMapType(dest)) ? 2 : 4;
    } catch {
      return 4;
    }
  }

  // ---------------------------------------------------------------- camera

  CanCameraMoveInDirection(direction: number): boolean {
    const [dx, dy] = DIRECTION_VECTORS[direction];
    return GetPostCameraMoveMapBorderId(dx, dy, this.map) !== CONNECTION_INVALID;
  }

  /** CameraMove: returns true when the map changed. */
  private CameraMove(dx: number, dy: number): boolean {
    const direction = GetPostCameraMoveMapBorderId(dx, dy, this.map);
    if (direction === CONNECTION_NONE || direction === CONNECTION_INVALID) {
      save.pos.x = ((save.pos.x + dx) << 16) >> 16;
      save.pos.y = ((save.pos.y + dy) << 16) >> 16;
      return false;
    }
    const oldX = save.pos.x;
    const oldY = save.pos.y;
    const connection = GetIncomingConnection(direction, save.pos.x, save.pos.y, this.map);
    if (!connection) {
      save.pos.x = ((save.pos.x + dx) << 16) >> 16;
      save.pos.y = ((save.pos.y + dy) << 16) >> 16;
      return false;
    }
    SetPositionFromConnection(connection, direction, dx, dy);
    const num = rom.mapNum(connection.mapId);
    this.loadMapFromCameraTransition(num >> 8, num & 0xff, connection.mapId);
    const shiftX = oldX - save.pos.x;
    const shiftY = oldY - save.pos.y;
    save.pos.x = ((save.pos.x + dx) << 16) >> 16;
    save.pos.y = ((save.pos.y + dy) << 16) >> 16;
    this.objects.shiftAll(shiftX, shiftY);
    this.camX -= shiftX * 16;
    this.camY -= shiftY * 16;
    this.effects.shift(shiftX, shiftY);
    this.doors.reset();
    return true;
  }

  /** LoadMapFromCameraTransition */
  private loadMapFromCameraTransition(mapGroup: number, mapNum: number, mapId: string): void {
    this.setWarpDestination(mapGroup, mapNum, -1, -1, -1);
    const prevHeader = this.header;
    const pending = this.mapCache.get(mapId);
    // The map was prefetched with its neighbours in prepareMap.
    let loaded: LoadedMap | undefined;
    void pending?.then((value) => { loaded = value; });
    const sync = this.syncLoaded.get(mapId);
    if (!sync) throw new Error(`map ${mapId} not prefetched`);
    loaded = sync;
    // Overworld_TryMapConnectionMusicTransition
    if (loaded.header.music !== prevHeader.music && loaded.header.music !== sound.currentBGM) sound.playNewMapMusic(loaded.header.music);
    this.applyCurrentWarp();
    this.loaded = loaded;
    this.mapTypes.set(loaded.header.id, loaded.header.mapType);
    this.sectionCache.set(loaded.header.id, loaded.header.regionMapSection);
    this.loadObjEventTemplatesFromHeader();
    clearTempFieldEventData();
    this.effects.resetEncounterImmunity();
    this.game.weather.SetSavedWeatherFromCurrMapHeader(this.loaded.header.weather);
    this.onMapLoad();
    onCameraTransitionForRoamer();
    TrySetMapSaveWarpStatus();
    this.setDefaultFlashLevel();
    this.savedMusic = 0;
    this.RunOnTransitionMapScript();
    this.initMap();
    this.renderer = new TileRenderer(loaded.primary, loaded.secondary);
    this.animator = new TilesetAnimator(this.renderer);
    this.game.weather.DoCurrentWeather();
    this.RunOnResumeMapScript();
    if (this.sectionCache.get(prevHeader.id) !== loaded.header.regionMapSection) this.mapName.show(true);
    // Prefetch the next ring of neighbours.
    void this.prepareMap(loaded.header.id).then((l) => this.rememberLoaded(l));
  }

  private syncLoaded = new Map<string, LoadedMap>();
  rememberLoaded(loaded: LoadedMap): void {
    this.syncLoaded.set(loaded.header.id, loaded);
    for (const c of loaded.connections) void this.fetchMap(c.mapId).then((l) => this.syncLoaded.set(l.header.id, l));
  }

  /** CameraUpdate: move the tile camera when the tracked object starts a step. */
  private cameraUpdate(): void {
    const target = this.cameraTarget;
    if (!target) return;
    const tx = target.currentCoords.x - MAP_OFFSET;
    const ty = target.currentCoords.y - MAP_OFFSET;
    const dx = Math.sign(tx - save.pos.x);
    const dy = Math.sign(ty - save.pos.y);
    if (dx !== 0 || dy !== 0) {
      this.CameraMove(dx, dy);
      this.objects.trySpawnInView(save.pos.x, save.pos.y);
      this.objects.removeOutsideView(save.pos.x, save.pos.y);
      this.syncObjectSprites();
    }
    this.updateCameraPixels();
  }

  updateCameraPixels(): void {
    this.cameraPanningCallback?.();
    if (this.cameraObject) {
      this.camX = this.cameraObject.x - 120;
      this.camY = this.cameraObject.y - 72;
    } else if (this.cameraTarget) {
      const s = this.cameraTarget.sprite;
      this.camX = s.x - 120 + this.panX;
      this.camY = s.y + s.centerToCornerVecY + 16 - 72 + this.panY;
    }
    this.UpdateCameraPanning();
  }

  /** UpdateCameraPanning (field_camera.c): publish the camera displacement to every field sprite. */
  UpdateCameraPanning(): void {
    this.sprites.offsetX = -this.camX;
    this.sprites.offsetY = -this.camY;
  }

  /** SetCameraPanning (field_camera.c): horizontal pan and vertical pan relative to the GBA's +32 baseline. */
  SetCameraPanning(horizontal: number, vertical: number): void {
    this.panX = horizontal;
    this.panY = vertical;
  }

  /** SetCameraPanningCallback (field_camera.c). */
  SetCameraPanningCallback(callback: (() => void) | null): void {
    this.cameraPanningCallback = callback;
  }

  /** InstallCameraPanAheadCallback (field_camera.c). Bike pan-back is disabled in FireRed. */
  InstallCameraPanAheadCallback(): void {
    this.cameraPanningCallback = () => {
      if (!this.bikeCameraAheadPanback) {
        this.InstallCameraPanAheadCallback();
        return;
      }
      const player = this.player.object;
      if (this.player.tileTransitionState === 1) {
        this.bikeCameraPanFlag = !this.bikeCameraPanFlag;
        if (!this.bikeCameraPanFlag) return;
      } else {
        this.bikeCameraPanFlag = false;
      }
      const direction = player.movementDirection;
      if (direction === DIR_NORTH) this.panY = Math.max(-40, this.panY - 2);
      else if (direction === DIR_SOUTH) this.panY = Math.min(40, this.panY + 2);
      else if (this.panY < 0) this.panY = Math.min(0, this.panY + 2);
      else if (this.panY > 0) this.panY = Math.max(0, this.panY - 2);
    };
    this.bikeCameraPanFlag = false;
    this.panX = 0;
    this.panY = 0;
  }

  /** Keep object sprites registered in the sprite manager. */
  syncObjectSprites(): void {
    const live = new Set(this.objects.list.map((o) => o.sprite));
    const liveArrowIds = new Set(this.objects.list.map((o) => o.warpArrowSpriteId));
    for (const s of [...this.sprites.sprites]) {
      if ((s as unknown as { objectSprite?: boolean }).objectSprite && !live.has(s)) this.sprites.destroy(s);
      if ((s as unknown as { warpArrowSprite?: boolean }).warpArrowSprite && !liveArrowIds.has(this.sprites.getId(s))) this.sprites.destroy(s);
    }
    for (const o of this.objects.list) {
      if (!this.sprites.sprites.includes(o.sprite)) {
        (o.sprite as unknown as { objectSprite?: boolean }).objectSprite = true;
        this.sprites.add(o.sprite);
      }
    }
  }

  // ---------------------------------------------------------------- frame

  /** CB1_Overworld */
  cb1(): void {
    this.control.processFrame(joy.newKeys, joy.held);
  }

  /** CB2_Overworld / OverworldBasic */
  cb2(): void {
    this.script.ScriptContext_RunScript();
    tasks.run();
    this.syncObjectSprites();
    this.objects.update(-this.camX, -this.camY);
    this.effects.update();
    this.game.weather.update(this);
    this.sprites.update();
    this.cameraUpdate();
    this.messageBox.update();
    this.mapName.update();
    this.mapPreview.update();
    paletteFade.update();
    this.animator?.update();
    for (const hook of this.onFrame) hook();
  }

  // ---------------------------------------------------------------- render

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 240, 160);
    if (!this.renderer || !this.loaded) return;
    const camX = Math.round(this.camX);
    const camY = Math.round(this.camY);
    const startX = Math.floor(camX / 16);
    const startY = Math.floor(camY / 16);
    const layers: Array<Array<[HTMLCanvasElement, number, number]>> = [[], [], []]; // BG3, BG2, BG1
    for (let my = startY; my <= startY + 11; my++) {
      for (let mx = startX; mx <= startX + 15; mx++) {
        const id = this.map.metatileIdAt(mx, my);
        const layerType = this.map.metatileAttribute(id, METATILE_ATTRIBUTE_LAYER_TYPE);
        const tiles = this.renderer.metatile(id);
        const sx = mx * 16 - camX;
        const sy = my * 16 - camY;
        if (layerType === 1) { // COVERED
          layers[0].push([tiles.bottom, sx, sy]);
          layers[1].push([tiles.top, sx, sy]);
        } else if (layerType === 2) { // SPLIT
          layers[0].push([tiles.bottom, sx, sy]);
          layers[2].push([tiles.top, sx, sy]);
        } else {
          layers[1].push([tiles.bottom, sx, sy]);
          layers[2].push([tiles.top, sx, sy]);
        }
      }
    }
    const drawLayer = (i: number) => {
      const entries = layers[i];
      const mosaicValue = this.effects.poisonMosaicValue;
      if (mosaicValue === 0) {
        for (const [c, x, y] of entries) ctx.drawImage(c, x, y);
        return;
      }
      // AdjustBgMosaic applies to BGs only. Compose one BG layer, sample each
      // screen-aligned mosaic block from its top-left pixel, then composite it.
      const canvas = this.bgMosaicCanvas ??= document.createElement("canvas");
      canvas.width = 240; canvas.height = 160;
      const mosaicCtx = this.bgMosaicContext ??= canvas.getContext("2d", { willReadFrequently: true })!;
      mosaicCtx.clearRect(0, 0, 240, 160);
      for (const [tile, x, y] of entries) mosaicCtx.drawImage(tile, x, y);
      const image = mosaicCtx.getImageData(0, 0, 240, 160);
      const pixels = image.data, blockSize = mosaicValue + 1;
      for (let y = 0; y < 160; y += blockSize) {
        for (let x = 0; x < 240; x += blockSize) {
          const sample = (y * 240 + x) * 4;
          const r = pixels[sample], g = pixels[sample + 1], b = pixels[sample + 2], a = pixels[sample + 3];
          for (let dy = 0; dy < blockSize && y + dy < 160; dy++) {
            for (let dx = 0; dx < blockSize && x + dx < 240; dx++) {
              const dest = ((y + dy) * 240 + x + dx) * 4;
              pixels[dest] = r; pixels[dest + 1] = g; pixels[dest + 2] = b; pixels[dest + 3] = a;
            }
          }
        }
      }
      mosaicCtx.putImageData(image, 0, 0);
      ctx.drawImage(canvas, 0, 0);
    };
    drawLayer(0);
    this.sprites.render(ctx, 3);
    drawLayer(1);
    this.doors.render(ctx, camX, camY);
    this.effects.renderBelow(ctx);
    this.sprites.render(ctx, 2);
    drawLayer(2);
    this.sprites.render(ctx, 1);
    this.effects.renderFlash(ctx);
    this.effects.renderOverlays(ctx);
    this.windows.render(ctx);
    this.mapName.render(ctx);
    this.sprites.render(ctx, 0);
    this.sprites.render(ctx, 0, true);
    this.mapPreview.render(ctx);
    paletteFade.render(ctx);
    // Whiteout recovery text uses the window palette after the field palettes
    // have been filled black, as in the C window's separately loaded palette.
    this.whiteOutWindow?.render(ctx);
  }
}
