// Port of overworld.c + field_camera.c: map loading from warps and camera
// transitions, the per-frame field callbacks, and BG/OBJ composition.

import * as MB from "../generated/metatileBehavior";
import { paletteFade, FADE_FROM_BLACK, FADE_FROM_WHITE, FADE_TO_BLACK, FADE_TO_WHITE, RGB_BLACK, RGB_WHITE } from "../gba/fade";
import { joy } from "../gba/input";
import { SpriteManager } from "../gba/sprite";
import { tasks } from "../gba/tasks";
import { WindowLayer } from "../gba/window";
import { sound } from "../audio/sound";
import { rom, type MapHeader, type MapObjectTemplate } from "../rom";
import { clearTempFieldEventData, flagClear, flagGet, save, varGet, varSet, type WarpData } from "../save";
import { FieldMap, loadMap, MAP_OFFSET, METATILE_ATTRIBUTE_LAYER_TYPE, CONNECTION_EAST, CONNECTION_INVALID, CONNECTION_NONE, CONNECTION_NORTH, CONNECTION_SOUTH, CONNECTION_WEST, type LoadedMap } from "./fieldmap";
import { DIR_EAST, DIR_NORTH, DIR_SOUTH, DIR_WEST, DIRECTION_VECTORS, ObjectEvents, setVarGetter, type ObjectEvent } from "./objectEvents";
import { TileRenderer, TilesetAnimator } from "./tileRenderer";
import { PlayerAvatar, PLAYER_AVATAR_FLAG_ON_FOOT, PLAYER_AVATAR_FLAG_SURFING } from "./playerAvatar";
import { FieldControl } from "./fieldControl";
import { FieldMessageBox } from "./messageBox";
import { DoorAnimator } from "./doors";
import { FieldEffects, MAX_FLASH_LEVEL } from "./fieldEffects";
import { MapNamePopup } from "./mapNamePopup";
import { MapPreviewManager, MapHasPreviewScreen_HandleQLState2, MPS_TYPE_CAVE, MPS_TYPE_FOREST } from "../mapPreviewScreen";
import { ScriptContext } from "../script/context";
import type { Game } from "../game";
import { mapResetTrainerRematches } from "./vsSeeker";
import { onCameraTransitionForRoamer, onWarpForRoamer } from "../pokemon/roamer";
import { TryRegenerateRenewableHiddenItems } from "../renewableHiddenItems";
import { PerStepCallback } from "./fieldTasks";

export const MAP_SCRIPT_ON_LOAD = 1;
export const MAP_SCRIPT_ON_FRAME_TABLE = 2;
export const MAP_SCRIPT_ON_TRANSITION = 3;
export const MAP_SCRIPT_ON_WARP_INTO_MAP_TABLE = 4;
export const MAP_SCRIPT_ON_RESUME = 5;
export const MAP_SCRIPT_ON_DIVE_WARP = 6;
export const MAP_SCRIPT_ON_RETURN_TO_FIELD = 7;

const MAP_TYPE = { NONE: 0, TOWN: 1, CITY: 2, ROUTE: 3, UNDERGROUND: 4, UNDERWATER: 5, OCEAN_ROUTE: 6, UNKNOWN: 7, INDOOR: 8, SECRET_BASE: 9 };

export function isMapTypeOutdoors(type: number): boolean {
  return type === MAP_TYPE.ROUTE || type === MAP_TYPE.TOWN || type === MAP_TYPE.UNDERWATER || type === MAP_TYPE.CITY || type === MAP_TYPE.OCEAN_ROUTE;
}

function mapTransitionIsEnter(from: number, to: number): boolean {
  return to === MAP_TYPE.UNDERGROUND && from !== MAP_TYPE.UNDERGROUND && from !== MAP_TYPE.NONE;
}

function mapTransitionIsExit(from: number, to: number): boolean {
  return from === MAP_TYPE.UNDERGROUND && to !== MAP_TYPE.UNDERGROUND && to !== MAP_TYPE.NONE;
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
  /** Camera tracks this object (the player by default). */
  cameraTarget: ObjectEvent | null = null;
  cameraObject: { x: number; y: number } | null = null;
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
      playerInfo: () => {
        const p = this.objects.player();
        if (!p) return undefined;
        return { facing: p.facingDirection, movementDirection: p.movementDirection, previous: p.previousCoords, current: p.currentCoords, heldMovement: p.heldMovementActive && !p.heldMovementFinished };
      },
      groundEffect: (object, kind) => this.effects.groundEffect(object, kind),
      emote: (object, kind) => this.effects.emote(object, kind),
      playSE: (name) => sound.playSE(sound.c(name)),
      cameraCanMove: (direction) => this.canCameraMoveInDirection(direction),
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

  setWarpDestination(mapGroup: number, mapNum: number, warpId: number, x: number, y: number): void {
    this.warpDestination = { mapGroup, mapNum, warpId: warpId === 0xff ? -1 : warpId, x: x === 0xffff || x > 0x7fff ? -1 : x, y: y === 0xffff || y > 0x7fff ? -1 : y };
  }

  setWarpDestinationToMapWarp(mapGroup: number, mapNum: number, warpId: number): void {
    this.setWarpDestination(mapGroup, mapNum, warpId, -1, -1);
  }

  setWarpDestinationToHealLocation(healLocationId: number): void {
    const heal = this.healLocation(healLocationId);
    if (heal) this.setWarpDestination(heal.mapGroup, heal.mapNum, -1, heal.x, heal.y);
  }

  /** Per-map resets shared by LoadMapFromWarp and LoadMapFromCameraTransition. */
  private onMapLoad(): void {
    this.stepCallback.reset();
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
  setWarpDestinationToLastHealLocation(): void {
    this.warpDestination = { ...save.lastHealLocation };
  }

  setLastHealLocationWarp(healLocationId: number): void {
    const heal = this.healLocation(healLocationId);
    if (heal) save.lastHealLocation = { mapGroup: heal.mapGroup, mapNum: heal.mapNum, warpId: -1, x: heal.x, y: heal.y };
  }

  healLocation(id: number): { mapGroup: number; mapNum: number; x: number; y: number } | undefined {
    const entry = rom.healLocations.heal_locations[id - 1];
    if (!entry) return undefined;
    const num = rom.mapNum(entry.map);
    return { mapGroup: num >> 8, mapNum: num & 0xff, x: entry.x, y: entry.y };
  }

  /** SetWhiteoutRespawnWarpAndHealerNpc (heal_location.c). */
  whiteOutRespawn(): { warp: WarpData; healerLocalId: number; atHome: boolean } {
    const last = save.lastHealLocation;
    const locations = rom.healLocations.heal_locations;
    const matched = locations.find((candidate) => {
      const num = rom.mapNum(candidate.map);
      return (num >> 8) === last.mapGroup && (num & 0xff) === last.mapNum;
    });
    const entry = matched ?? locations.find((candidate) => candidate.id === "HEAL_LOCATION_PALLET_TOWN");
    if (!entry) throw new Error("FireRed heal-location table is empty");

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
    const home = entry.id === "HEAL_LOCATION_PALLET_TOWN"
      && (!matched || (last.warpId === -1 && last.x === entry.x && last.y === entry.y));
    return {
      warp: { mapGroup: mapNum >> 8, mapNum: mapNum & 0xff, warpId: -1, x, y },
      healerLocalId: entry.respawn_npc ? rom.c(entry.respawn_npc) : 0,
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
      save.escapeWarp = { mapGroup: save.location.mapGroup, mapNum: save.location.mapNum, warpId: -1, x: x - 7, y: y - 7 + delta };
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
    this.resumeMap();
    this.initObjectEventsLocal();
    this.initView();
    const prevSection = this.lastUsedWarpSection();
    const currSection = this.header.regionMapSection;
    if (prevSection !== currSection && MapHasPreviewScreen_HandleQLState2(currSection, MPS_TYPE_FOREST)) {
      this.mapPreview.startForest(currSection);
    } else if (prevSection !== currSection && MapHasPreviewScreen_HandleQLState2(currSection, MPS_TYPE_CAVE)) {
      this.mapPreview.startCave(currSection);
    } else if (this.header.showMapName && prevSection !== currSection) {
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
    this.game.weather.setSavedFromHeader(this.loaded.header.weather);
    this.onMapLoad();
    onWarpForRoamer();
    if (outdoors && "FLAG_SYS_FLASH_ACTIVE" in rom.constants) flagClear(rom.c("FLAG_SYS_FLASH_ACTIVE"));
    this.setDefaultFlashLevel();
    this.savedMusic = 0;
    this.runMapScriptImmediately(MAP_SCRIPT_ON_TRANSITION);
    this.initMap();
    this.game.weather.doCurrent();
  }

  private setDefaultFlashLevel(): void {
    if (!this.header.requiresFlash) this.flashLevel = 0;
    else if (flagGet(rom.constants.FLAG_SYS_FLASH_ACTIVE ?? 0)) this.flashLevel = 0;
    else this.flashLevel = MAX_FLASH_LEVEL; // gMaxFlashLevel
  }

  /** InitMap: InitMapLayoutData + ON_LOAD */
  private initMap(): void {
    this.map.init(this.loaded);
    this.map.onChange = () => this.renderer?.invalidate();
    this.runMapScriptImmediately(MAP_SCRIPT_ON_LOAD);
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
    this.panX = 0;
    this.panY = 0;
    this.effects.reset();
    this.messageBox.reset();
    this.runMapScriptImmediately(MAP_SCRIPT_ON_RESUME);
  }

  /** InitObjectEventsLocal + SetCameraToTrackPlayer */
  private initObjectEventsLocal(): void {
    this.objects.removeAll();
    const x = save.pos.x + MAP_OFFSET;
    const y = save.pos.y + MAP_OFFSET;
    const state = this.getInitialPlayerAvatarState();
    this.player.init(x, y, state.direction, save.playerGender);
    this.player.setTransitionFlags(state.transitionFlags);
    this.resetInitialPlayerAvatarState();
    this.objects.trySpawnInView(save.pos.x, save.pos.y);
    this.syncObjectSprites();
    this.tryRunOnWarpIntoMapScript();
    this.cameraTarget = this.player.object;
    this.cameraObject = null;
    this.updateCameraPixels();
  }

  private initView(): void {
    this.renderer = new TileRenderer(this.loaded.primary, this.loaded.secondary);
    this.animator = new TilesetAnimator(this.renderer);
    this.animator.prime();
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

  private mapScriptTable(tag: number): number {
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

  runMapScriptImmediately(tag: number): void {
    const ptr = this.mapScriptTable(tag);
    if (ptr) this.script.runImmediately(ptr);
  }

  /** MapHeaderCheckScriptTable */
  private checkScriptTable(tag: number): number {
    let ptr = this.mapScriptTable(tag);
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
    const ptr = this.checkScriptTable(MAP_SCRIPT_ON_FRAME_TABLE);
    if (!ptr) return false;
    this.script.setupScript(ptr);
    return true;
  }

  tryRunOnWarpIntoMapScript(): void {
    const ptr = this.checkScriptTable(MAP_SCRIPT_ON_WARP_INTO_MAP_TABLE);
    if (ptr) this.script.runImmediately(ptr);
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

  fieldCBContinueScript(handleMusic = false): void {
    if (handleMusic) this.playSpecialMapMusic();
    this.controlsLocked = true;
    this.fadeInFromBlack();
    const id = tasks.create(() => {
      if (!paletteFade.active) {
        tasks.destroy(id);
        this.script.enable();
      }
    }, 10);
  }

  fadeInFromBlack(): void {
    paletteFade.fill(RGB_BLACK);
    paletteFade.fadeScreen(FADE_FROM_BLACK, 0);
  }

  warpFadeInScreen(delay = 0): void {
    const lastType = this.lastUsedWarpType();
    if (mapTransitionIsExit(lastType, this.header.mapType)) {
      paletteFade.fill(RGB_WHITE);
      paletteFade.fadeScreen(FADE_FROM_WHITE, delay);
    } else {
      paletteFade.fill(RGB_BLACK);
      paletteFade.fadeScreen(FADE_FROM_BLACK, delay);
    }
  }

  warpFadeOutScreen(): void {
    let destType = MAP_TYPE.NONE;
    try { destType = this.peekMapType(this.mapIdForWarp(this.warpDestination)); } catch { /* keep */ }
    if (mapTransitionIsEnter(this.header.mapType, destType)) paletteFade.fadeScreen(FADE_TO_WHITE, 0);
    else paletteFade.fadeScreen(FADE_TO_BLACK, 0);
  }

  private lastUsedWarpType(): number {
    try { return this.peekMapType(this.mapIdForWarp(this.lastUsedWarp)); } catch { return MAP_TYPE.NONE; }
  }

  /** SetUpWarpExitTask */
  private setUpWarpExitTask(playerNotMoving: boolean): void {
    if (this.mapPreview.isActive()) return;
    const p = this.player.object;
    const behavior = this.map.behaviorAt(p.currentCoords.x, p.currentCoords.y);
    if (MB.MetatileBehavior_IsWarpDoor_2(behavior)) {
      paletteFade.fill(mapTransitionIsExit(this.lastUsedWarpType(), this.header.mapType) ? RGB_WHITE : RGB_BLACK);
      this.startExitDoorTask();
      return;
    }
    if (!playerNotMoving) this.warpFadeInScreen();
    else this.fadeInFromBlack();
    if (MB.MetatileBehavior_IsNonAnimDoor(behavior)) this.startExitNonAnimDoorTask();
    else this.startExitNonDoorTask();
  }

  private startExitDoorTask(): void {
    let state = 5;
    let timer = 0;
    let walkTimer = 0;
    let doorX = 0, doorY = 0;
    const id = tasks.create(() => {
      const p = this.player.object;
      switch (state) {
        case 5:
          p.invisible = true;
          this.objects.freezeAll();
          this.warpFadeInScreen(3);
          state = 6;
          break;
        case 6:
          if (++timer === 25) {
            doorX = p.currentCoords.x;
            doorY = p.currentCoords.y;
            sound.playSE(this.doors.soundEffect(doorX, doorY));
            this.doors.animateOpen(doorX, doorY);
            state = 7;
          }
          break;
        case 7:
          if (!this.doors.isRunning()) {
            p.invisible = false;
            this.objects.setHeldMovement(p, 0x10);
            state = 8;
          }
          break;
        case 8:
          if (++walkTimer === 14) {
            this.doors.animateClose(doorX, doorY);
            state = 9;
          }
          break;
        case 9:
          if (!paletteFade.active && this.player.isStandingStill() && !this.doors.isRunning()) {
            this.objects.clearHeldMovementIfFinished(p);
            state = 4;
          }
          break;
        case 4:
          this.objects.unfreezeAll();
          this.controlsLocked = false;
          tasks.destroy(id);
          break;
      }
    }, 10);
  }

  private startExitNonAnimDoorTask(): void {
    let state = 0;
    const id = tasks.create(() => {
      const p = this.player.object;
      switch (state) {
        case 0:
          p.invisible = true;
          this.objects.freezeAll();
          state = 1;
          break;
        case 1:
          if (!paletteFade.active) {
            p.invisible = false;
            this.objects.setHeldMovement(p, 0x10 + Math.max(0, p.facingDirection - 1));
            state = 2;
          }
          break;
        case 2:
          if (this.player.isStandingStill()) state = 3;
          break;
        case 3:
          this.objects.unfreezeAll();
          this.controlsLocked = false;
          tasks.destroy(id);
          break;
      }
    }, 10);
  }

  private startExitNonDoorTask(): void {
    let state = 0;
    const id = tasks.create(() => {
      if (state === 0) {
        this.objects.freezeAll();
        this.controlsLocked = true;
        state = 1;
      } else if (!paletteFade.active) {
        this.objects.unfreezeAll();
        this.controlsLocked = false;
        tasks.destroy(id);
      }
    }, 10);
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
    p.invisible = true;
    let state = 0;
    let fallY = -160;
    const id = tasks.create(() => {
      switch (state) {
        case 0:
          if (!paletteFade.active) { p.invisible = false; state = 1; }
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
    let state = 0;
    let x = 0, y = 0;
    const id = tasks.create(() => {
      const p = this.player.object;
      switch (state) {
        case 0:
          this.objects.freezeAll();
          x = p.currentCoords.x;
          y = p.currentCoords.y;
          sound.playSE(this.doors.soundEffect(x, y - 1));
          this.doors.animateOpen(x, y - 1);
          state = 1;
          break;
        case 1:
          if (!this.doors.isRunning()) {
            this.objects.clearHeldMovementIfActive(p);
            this.objects.setHeldMovement(p, 0x11);
            state = 2;
          }
          break;
        case 2:
          if (this.player.isStandingStill()) {
            this.doors.animateClose(x, y - 1);
            this.objects.clearHeldMovementIfFinished(p);
            p.invisible = true;
            state = 3;
          }
          break;
        case 3:
          if (!this.doors.isRunning()) state = 4;
          break;
        case 4:
          this.tryFadeOutOldMapMusic();
          this.warpFadeOutScreen();
          tasks.destroy(id);
          this.startTeleport2WarpTask();
          break;
      }
    }, 10);
  }

  doTeleportWarp(): void {
    this.controlsLocked = true;
    this.tryFadeOutOldMapMusic();
    this.fieldCallback = () => this.fieldCBTeleportWarpIn();
    let state = 0;
    let timer = 0;
    const id = tasks.create(() => {
      const p = this.player.object;
      switch (state) {
        case 0:
          this.objects.freezeAll();
          sound.playSE(sound.c("SE_WARP_IN"));
          state = 1;
          break;
        case 1:
          // Spin and rise (StartTeleportWarpOutPlayerAnim)
          timer++;
          if (timer % 4 === 0) this.objects.turn(p, [DIR_SOUTH, DIR_WEST, DIR_NORTH, DIR_EAST][(timer / 4) & 3]);
          if (timer > 16) p.sprite.y2 -= 4;
          if (timer >= 48) { this.warpFadeOutScreen(); state = 2; }
          break;
        case 2:
          if (!paletteFade.active) { tasks.destroy(id); this.warpIntoMapAndLoad(); }
          break;
      }
    }, 10);
  }

  fieldCBTeleportWarpIn(): void {
    this.playSpecialMapMusic();
    this.warpFadeInScreen();
    sound.playSE(sound.c("SE_WARP_OUT"));
    this.controlsLocked = true;
    const p = this.player.object;
    p.sprite.y2 = -80;
    let timer = 0;
    const id = tasks.create(() => {
      this.objects.freezeAll();
      timer++;
      p.sprite.y2 = Math.min(0, p.sprite.y2 + 4);
      if (timer % 4 === 0) this.objects.turn(p, [DIR_SOUTH, DIR_EAST, DIR_NORTH, DIR_WEST][(timer / 4) & 3]);
      if (p.sprite.y2 === 0 && timer >= 32 && !paletteFade.active) {
        this.objects.turn(p, DIR_SOUTH);
        this.objects.unfreezeAll();
        this.controlsLocked = false;
        tasks.destroy(id);
      }
    }, 10);
  }

  doStairWarp(behavior: number, delay: number): void {
    let state = 0;
    let wait = delay;
    let timer = 0;
    let ox = 0, oy = 0;
    let speedX = 0, speedY = 0;
    const id = tasks.create(() => {
      const p = this.player.object;
      switch (state) {
        case 0:
          this.controlsLocked = true;
          this.objects.freezeAll();
          state = 1;
          break;
        case 1:
          if (!this.objects.isMovementOverridden(p) || this.objects.clearHeldMovementIfFinished(p)) {
            if (wait > 0) { wait--; break; }
            this.tryFadeOutOldMapMusic();
            p.sprite.priority = 1;
            // ForceStairsMovement
            if (MB.MetatileBehavior_IsDirectionalUpRightStairWarp(behavior)) { speedX = 16; speedY = -10; this.objects.setHeldMovement(p, 0x9e); }
            else if (MB.MetatileBehavior_IsDirectionalUpLeftStairWarp(behavior)) { speedX = -17; speedY = -10; this.objects.setHeldMovement(p, 0x9d); }
            else if (MB.MetatileBehavior_IsDirectionalDownRightStairWarp(behavior)) { speedX = 17; speedY = 3; this.objects.setHeldMovement(p, 0x9e); }
            else { speedX = -17; speedY = 3; this.objects.setHeldMovement(p, 0x9d); }
            sound.playSE(sound.c("SE_EXIT"));
            state = 2;
          }
          break;
        case 2:
        case 3:
          if (speedY > 0 || timer > 6) oy += speedY;
          ox += speedX;
          timer++;
          p.sprite.x2 = ox >> 5;
          p.sprite.y2 = oy >> 5;
          if (state === 2 && timer >= 12) { this.warpFadeOutScreen(); state = 3; }
          else if (state === 3 && !paletteFade.active) {
            tasks.destroy(id);
            this.fieldCallback = () => this.fieldCBDefaultWarpExit();
            this.warpIntoMapAndLoad();
          }
          break;
      }
    }, 10);
  }

  private startTeleport2WarpTask(): void {
    let state = 0;
    const id = tasks.create(() => {
      switch (state) {
        case 0:
          this.objects.freezeAll();
          this.controlsLocked = true;
          state = 1;
          break;
        case 1:
          if (!paletteFade.active && sound.isBGMPausedOrStopped()) state = 2;
          break;
        case 2:
          tasks.destroy(id);
          this.warpIntoMapAndLoad();
          break;
      }
    }, 10);
  }

  tryFadeOutOldMapMusic(): void {
    let music = this.header.music;
    try {
      const dest = this.mapIdForWarp(this.warpDestination);
      const cached = rom.mapIndex.maps[dest];
      void cached;
    } catch { /* ignore */ }
    const destMusic = this.destinationMusic();
    if (destMusic !== undefined && destMusic !== sound.currentBGM) sound.fadeOutBGM(4);
    void music;
  }

  private destinationMusic(): number | undefined {
    try {
      const dest = this.mapIdForWarp(this.warpDestination);
      const cachedPromise = this.mapCache.get(dest);
      void cachedPromise;
      return undefined;
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------- camera

  canCameraMoveInDirection(direction: number): boolean {
    const [dx, dy] = DIRECTION_VECTORS[direction];
    return this.map.borderIdAt(save.pos.x + MAP_OFFSET + dx, save.pos.y + MAP_OFFSET + dy) !== CONNECTION_INVALID;
  }

  /** CameraMove: returns true when the map changed. */
  private cameraMove(dx: number, dy: number): boolean {
    const direction = this.map.borderIdAt(save.pos.x + MAP_OFFSET + dx, save.pos.y + MAP_OFFSET + dy);
    if (direction === CONNECTION_NONE || direction === CONNECTION_INVALID) {
      save.pos.x += dx;
      save.pos.y += dy;
      return false;
    }
    const oldX = save.pos.x;
    const oldY = save.pos.y;
    const connection = this.map.incomingConnection(direction, save.pos.x, save.pos.y);
    if (!connection) {
      save.pos.x += dx;
      save.pos.y += dy;
      return false;
    }
    switch (direction) {
      case CONNECTION_EAST: save.pos.x = -dx; save.pos.y -= connection.offset; break;
      case CONNECTION_WEST: save.pos.x = connection.layout.width; save.pos.y -= connection.offset; break;
      case CONNECTION_SOUTH: save.pos.x -= connection.offset; save.pos.y = -dy; break;
      case CONNECTION_NORTH: save.pos.x -= connection.offset; save.pos.y = connection.layout.height; break;
    }
    const num = rom.mapNum(connection.mapId);
    this.loadMapFromCameraTransition(num >> 8, num & 0xff, connection.mapId);
    const shiftX = oldX - save.pos.x;
    const shiftY = oldY - save.pos.y;
    save.pos.x += dx;
    save.pos.y += dy;
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
    this.game.weather.setSavedFromHeader(this.loaded.header.weather);
    this.onMapLoad();
    onCameraTransitionForRoamer();
    this.setDefaultFlashLevel();
    this.savedMusic = 0;
    this.runMapScriptImmediately(MAP_SCRIPT_ON_TRANSITION);
    this.initMap();
    this.renderer = new TileRenderer(loaded.primary, loaded.secondary);
    this.animator = new TilesetAnimator(this.renderer);
    this.animator.prime();
    this.game.weather.doCurrent();
    this.runMapScriptImmediately(MAP_SCRIPT_ON_RESUME);
    if (this.sectionCache.get(prevHeader.id) !== loaded.header.regionMapSection && loaded.header.showMapName) this.mapName.show(true);
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
      this.cameraMove(dx, dy);
      this.objects.trySpawnInView(save.pos.x, save.pos.y);
      this.objects.removeOutsideView(save.pos.x, save.pos.y);
      this.syncObjectSprites();
    }
    this.updateCameraPixels();
  }

  updateCameraPixels(): void {
    if (this.cameraObject) {
      this.camX = this.cameraObject.x - 120;
      this.camY = this.cameraObject.y - 72;
    } else if (this.cameraTarget) {
      const s = this.cameraTarget.sprite;
      this.camX = s.x - 120 + this.panX;
      this.camY = s.y + s.centerToCornerVecY + 16 - 72 + this.panY;
    }
    this.sprites.offsetX = -this.camX;
    this.sprites.offsetY = -this.camY;
  }

  /** Keep object sprites registered in the sprite manager. */
  syncObjectSprites(): void {
    const live = new Set(this.objects.list.map((o) => o.sprite));
    for (const s of [...this.sprites.sprites]) {
      if ((s as unknown as { objectSprite?: boolean }).objectSprite && !live.has(s)) this.sprites.destroy(s);
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
    this.script.runScript();
    tasks.run();
    this.syncObjectSprites();
    this.objects.update(-this.camX, -this.camY);
    this.objects.runGroundEffects();
    this.effects.update();
    this.game.weather.update(this);
    this.sprites.update();
    this.cameraUpdate();
    this.messageBox.update();
    this.mapName.update();
    this.mapPreview.update();
    paletteFade.update();
    this.animator?.update();
    this.doors.update();
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
    const drawLayer = (i: number) => { for (const [c, x, y] of layers[i]) ctx.drawImage(c, x, y); };
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
  }
}
