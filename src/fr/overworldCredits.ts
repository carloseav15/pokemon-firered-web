// overworld.c (credits part): Overworld_DoScrollSceneForCredits,
// Overworld_CreditsMainCB, SetUpScrollSceneForCredits, MapLdr_Credits,
// CameraCB_CreditsPan, Task_OvwldCredits_FadeOut/WaitFade, and the
// field_camera.c view drawing they need (DrawWholeMapView / DrawMetatile) —
// the map scrolls behind the credits text as hardware BGs.
// The tileset animations of the loaded map run (tileset_anims.c:
// InitTilesetAnimations / UpdateTilesetAnimations, writing into ppu.vram).
// Adaptations:
//  - The maps come from a preloaded cache (preloadCreditsMaps) and are drawn
//    from FieldMap + CopyMapTilesetsToHw instead of the field's own VRAM.
//  - Object events (NPCs) and the player avatar of the loaded map are not run:
//    the C's MapLdr_Credits never calls InitObjectEventsLocal/TrySpawnObjectEvents,
//    so the scrolls show the map without its NPCs, as in the original.
//  - Weather and field tasks (StartWeather/ResumePausedWeather/SetUpFieldTasks,
//    skipped in MapLdr_Credits case 1) are not run: every sOverworldMapScenes map
//    is WEATHER_SUNNY (visual no-op by design: Sunny_Main is empty) and the field
//    tasks are a dummy per-step callback plus ambient cries, with no visible effect
//    on these maps. ON_TRANSITION scripts are likewise skipped: they only touch
//    object positions/flags and the world map, invisible without object events.
//  - The camera is a pixel offset (gFieldCamera.x/y) scrolled with the C's
//    speed/length commands; BGxHOFS/VOFS are that offset modulo the 256-pixel
//    tilemap (metatiles are drawn wrapped into the 32x32 tilemap).
//  - The first scene (Indigo Plateau) shows the map the field currently has,
//    centered on the player (CreditsShowCurrentField).
// Needs loadCData("credits") and preloadCreditsMaps().

import { tasks } from "./gba/tasks";
import { SetGlobalFieldTintMode } from "./field/fieldPalette";
import { cdata } from "./hw/assets";
import {
  ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, InitBgsFromTemplates, ResetBgsAndClearDma3BusyFlags, SetBgAttribute, SetBgTilemapBuffer, ShowBg, BG_ATTR_MOSAIC,
  type BgTemplate,
} from "./hw/bg";
import { SetGpuReg } from "./hw/gpu";
import { BeginNormalPaletteFade, gPaletteFade, PALETTES_ALL, RGB_BLACK } from "./hw/palette";
import {
  DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BG1HOFS, REG_OFFSET_BG1VOFS, REG_OFFSET_BG2HOFS, REG_OFFSET_BG2VOFS,
  REG_OFFSET_BG3HOFS, REG_OFFSET_BG3VOFS, REG_OFFSET_BLDCNT, REG_OFFSET_DISPCNT, ppu,
} from "./hw/ppu";
import { gMain, SetMainCallback2 } from "./hw/runtime";
import { AnimateSprites, BuildOamBuffer } from "./hw/sprite";
import { UpdatePaletteFade } from "./hw/palette";
import { DoScheduledBgTilemapCopiesToVram } from "./hw/menuHelpers";
import { FieldMap, loadMap, METATILE_ATTRIBUTE_LAYER_TYPE, NUM_METATILES_IN_PRIMARY, type LoadedMap } from "./field/fieldmap";
import { CopyMapTilesetsToHw } from "./field/hwTilesets";
import { rom } from "./rom";

export type CreditsOverworldCmd = { unk_0: number; unk_2: number; unk_4: number };

const CREDITSOVWLDCMD_FB = 0xfb;
const CREDITSOVWLDCMD_FC = 0xfc;
const CREDITSOVWLDCMD_END = 0xfd;
const CREDITSOVWLDCMD_LOADMAP = 0xfe;
const CREDITSOVWLDCMD_FF = 0xff;

const METATILE_LAYER_TYPE_NORMAL = 0;
const METATILE_LAYER_TYPE_COVERED = 1;
const METATILE_LAYER_TYPE_SPLIT = 2;

/** sOverworldBgTemplates (BG0 text, BG1 top, BG2 middle, BG3 bottom). */
const sOverworldBgTemplates: BgTemplate[] = [
  { bg: 0, charBaseIndex: 2, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0 },
  { bg: 1, charBaseIndex: 0, mapBaseIndex: 29, screenSize: 0, paletteMode: 0, priority: 1, baseTile: 0 },
  { bg: 2, charBaseIndex: 0, mapBaseIndex: 28, screenSize: 0, paletteMode: 0, priority: 2, baseTile: 0 },
  { bg: 3, charBaseIndex: 0, mapBaseIndex: 30, screenSize: 0, paletteMode: 0, priority: 3, baseTile: 0 },
];

type CameraObject = { x: number; y: number; movementSpeedX: number; movementSpeedY: number; callback: (() => void) | null };
export const gFieldCamera: CameraObject = { x: 0, y: 0, movementSpeedX: 0, movementSpeedY: 0, callback: null };

let sCreditsOverworld_Script: CreditsOverworldCmd[] = [];
let sCreditsOverworld_CmdLength = 0;
let sCreditsOverworld_CmdIndex = 0;

/** Map view: the FieldMap being drawn and gBGTilemapBuffers1/2/3. */
let sMap: FieldMap | null = null;
let gBGTilemapBuffers1 = new Uint16Array(0x400);
let gBGTilemapBuffers2 = new Uint16Array(0x400);
let gBGTilemapBuffers3 = new Uint16Array(0x400);
let sDrawnMetaX = 0x7fffffff;
let sDrawnMetaY = 0x7fffffff;

const sMapCache = new Map<string, LoadedMap>();
/** The map the field currently shows, for the first (Indigo Plateau) scene. */
let sCurrentFieldMap: { map: FieldMap; playerX: number; playerY: number } | null = null;

const sOverworldMapScenes = () => cdata<{ $sym: string }[]>("credits", "sOverworldMapScenes").map((r) => cdata<CreditsOverworldCmd[]>("credits", r.$sym));

const mapIdOf = (group: number, num: number): string => {
  const id = rom.mapIdByNum((group << 8) | num);
  if (!id) throw new Error(`credits: unknown map ${group}.${num}`);
  return id;
};

/** Loads the maps the credits scroll over. */
export async function preloadCreditsMaps(): Promise<void> {
  for (const script of sOverworldMapScenes()) {
    const id = mapIdOf(script[0].unk_2, script[0].unk_4);
    if (!sMapCache.has(id)) sMapCache.set(id, await loadMap(id));
  }
}

/** Registers the map/player position of the field for the credits' first scene. */
export function CreditsShowCurrentField(map: FieldMap, playerX: number, playerY: number): void {
  sCurrentFieldMap = { map, playerX, playerY };
}

function FadeSelectedPals(mode: number, delay: number, selectedPalettes: number): void {
  if (mode === 1) BeginNormalPaletteFade(selectedPalettes, delay, 0, 16, RGB_BLACK); // FADE_TO_BLACK
  else BeginNormalPaletteFade(selectedPalettes, delay, 16, 0, RGB_BLACK); // FADE_FROM_BLACK
}
export { FadeSelectedPals };

// ---------------------------------------------------------------- field_camera.c view drawing

function DrawMetatile(metatileLayerType: number, tiles: Uint16Array, offset: number): void {
  const put = (buf: Uint16Array, a: number, b: number, c: number, d: number) => {
    buf[offset] = a;
    buf[offset + 1] = b;
    buf[offset + 0x20] = c;
    buf[offset + 0x21] = d;
  };
  switch (metatileLayerType) {
    case METATILE_LAYER_TYPE_SPLIT:
      put(gBGTilemapBuffers3, tiles[0], tiles[1], tiles[2], tiles[3]);
      put(gBGTilemapBuffers1, 0, 0, 0, 0);
      put(gBGTilemapBuffers2, tiles[4], tiles[5], tiles[6], tiles[7]);
      break;
    case METATILE_LAYER_TYPE_COVERED:
      put(gBGTilemapBuffers3, tiles[0], tiles[1], tiles[2], tiles[3]);
      put(gBGTilemapBuffers1, tiles[4], tiles[5], tiles[6], tiles[7]);
      put(gBGTilemapBuffers2, 0, 0, 0, 0);
      break;
    case METATILE_LAYER_TYPE_NORMAL:
    default:
      // Draw garbage to the bottom background layer.
      put(gBGTilemapBuffers3, 0x3014, 0x3014, 0x3014, 0x3014);
      put(gBGTilemapBuffers1, tiles[0], tiles[1], tiles[2], tiles[3]);
      put(gBGTilemapBuffers2, tiles[4], tiles[5], tiles[6], tiles[7]);
      break;
  }
}

function DrawMetatileAt(x: number, y: number): void {
  const map = sMap!;
  let metatileId = map.metatileIdAt(x, y);
  if (metatileId > 1024) metatileId = 0;
  let tiles: Uint16Array;
  if (metatileId < NUM_METATILES_IN_PRIMARY) {
    tiles = map.loaded.primary.metatiles.subarray(metatileId * 8, metatileId * 8 + 8);
  } else {
    const local = (metatileId - NUM_METATILES_IN_PRIMARY) * 8;
    tiles = map.loaded.secondary.metatiles.subarray(local, local + 8);
  }
  const offset = (y & 15) * 2 * 0x20 + (x & 15) * 2;
  DrawMetatile(map.attributeAt(x, y, METATILE_ATTRIBUTE_LAYER_TYPE), tiles, offset);
}

/** DrawWholeMapView: the metatiles under the camera, wrapped into the 32x32 tilemaps. */
function DrawWholeMapView(): void {
  const metaX = gFieldCamera.x >> 4;
  const metaY = gFieldCamera.y >> 4;
  for (let j = 0; j < 12; j++) {
    for (let i = 0; i < 16; i++) DrawMetatileAt(metaX + i, metaY + j);
  }
  sDrawnMetaX = metaX;
  sDrawnMetaY = metaY;
  CopyBgTilemapBufferToVram(1);
  CopyBgTilemapBufferToVram(2);
  CopyBgTilemapBufferToVram(3);
}

/** FieldUpdateBgTilemapScroll */
function FieldUpdateBgTilemapScroll(): void {
  const hofs = gFieldCamera.x & 0xff;
  const vofs = gFieldCamera.y & 0xff;
  SetGpuReg(REG_OFFSET_BG1HOFS, hofs);
  SetGpuReg(REG_OFFSET_BG1VOFS, vofs);
  SetGpuReg(REG_OFFSET_BG2HOFS, hofs);
  SetGpuReg(REG_OFFSET_BG2VOFS, vofs);
  SetGpuReg(REG_OFFSET_BG3HOFS, hofs);
  SetGpuReg(REG_OFFSET_BG3VOFS, vofs);
}

/** CameraUpdateNoObjectRefresh: moves the view by the camera speed and redraws newly visible metatiles. */
function CameraUpdateNoObjectRefresh(): void {
  gFieldCamera.x += gFieldCamera.movementSpeedX;
  gFieldCamera.y += gFieldCamera.movementSpeedY;
  if (sMap && ((gFieldCamera.x >> 4) !== sDrawnMetaX || (gFieldCamera.y >> 4) !== sDrawnMetaY)) DrawWholeMapView();
  FieldUpdateBgTilemapScroll();
}

// ---------------------------------------------------------------- tileset_anims.c

const TILE_SIZE_4BPP = 32;

let sPrimaryTilesetAnimCounter = 0;
let sPrimaryTilesetAnimCounterMax = 0;
let sPrimaryTilesetAnimCallback: ((timer: number) => void) | null = null;
let sSecondaryTilesetAnimCounter = 0;
let sSecondaryTilesetAnimCounterMax = 0;
let sSecondaryTilesetAnimCallback: ((timer: number) => void) | null = null;
type TilesetAnimTransfer = { src: Uint8Array; dest: number; size: number };
const sTilesetDMA3TransferBuffer: TilesetAnimTransfer[] = [];

/** ResetTilesetAnimBuffer. */
function ResetTilesetAnimBuffer(): void {
  sTilesetDMA3TransferBuffer.length = 0;
}

/** AppendTilesetAnimToBuffer. Synchronous ppu.vram write is the browser's DMA3 transfer. */
function AppendTilesetAnimToBuffer(src: Uint8Array | undefined, destTile: number, size: number): void {
  if (!src || sTilesetDMA3TransferBuffer.length >= 20) return;
  sTilesetDMA3TransferBuffer.push({ src, dest: destTile * TILE_SIZE_4BPP, size });
}

/** TransferTilesetAnimsBuffer. */
function TransferTilesetAnimsBuffer(): void {
  for (const transfer of sTilesetDMA3TransferBuffer)
    ppu.vram.set(transfer.src.subarray(0, transfer.size), transfer.dest);
  sTilesetDMA3TransferBuffer.length = 0;
}

function QueueAnimTiles_General_Flower(timer: number): void {
  const frames = sMap?.loaded.primary.anims["flower"];
  if (frames?.length) AppendTilesetAnimToBuffer(frames[timer % frames.length], 508, 4 * TILE_SIZE_4BPP);
}

function QueueAnimTiles_General_Water_Current_LandWatersEdge(timer: number): void {
  const frames = sMap?.loaded.primary.anims["water_current_landwatersedge"];
  if (frames?.length) AppendTilesetAnimToBuffer(frames[timer % frames.length], 416, 48 * TILE_SIZE_4BPP);
}

function QueueAnimTiles_General_SandWatersEdge(timer: number): void {
  const frames = sMap?.loaded.primary.anims["sandwatersedge"];
  if (frames?.length) AppendTilesetAnimToBuffer(frames[timer % frames.length], 464, 18 * TILE_SIZE_4BPP);
}

function TilesetAnim_General(timer: number): void {
  // C divides integers (u16); JS must truncate or frames[timer / 16] is undefined.
  if (timer % 8 === 0) QueueAnimTiles_General_SandWatersEdge(Math.trunc(timer / 8));
  if (timer % 16 === 1) QueueAnimTiles_General_Water_Current_LandWatersEdge(Math.trunc(timer / 16));
  if (timer % 16 === 2) QueueAnimTiles_General_Flower(Math.trunc(timer / 16));
}

/** InitTilesetAnim_General. */
function InitTilesetAnim_General(): void {
  sPrimaryTilesetAnimCounter = 0;
  sPrimaryTilesetAnimCounterMax = 640;
  sPrimaryTilesetAnimCallback = TilesetAnim_General;
}

function QueueAnimTiles_CeladonCity_Fountain(timer: number): void {
  const frames = sMap?.loaded.secondary.anims["fountain"];
  if (frames?.length) AppendTilesetAnimToBuffer(frames[timer % frames.length], 744, 8 * TILE_SIZE_4BPP);
}

function TilesetAnim_CeladonCity(timer: number): void {
  if (timer % 12 === 0) QueueAnimTiles_CeladonCity_Fountain(Math.trunc(timer / 12));
}

function InitTilesetAnim_CeladonCity(): void {
  sSecondaryTilesetAnimCounter = 0;
  sSecondaryTilesetAnimCounterMax = 120;
  sSecondaryTilesetAnimCallback = TilesetAnim_CeladonCity;
}

function _InitPrimaryTilesetAnimation(): void {
  sPrimaryTilesetAnimCounter = 0;
  sPrimaryTilesetAnimCounterMax = 0;
  sPrimaryTilesetAnimCallback = null;
  if (sMap?.loaded.primary.callback === "InitTilesetAnim_General") InitTilesetAnim_General();
}

function _InitSecondaryTilesetAnimation(): void {
  sSecondaryTilesetAnimCounter = 0;
  sSecondaryTilesetAnimCounterMax = 0;
  sSecondaryTilesetAnimCallback = null;
  // Only InitTilesetAnim_CeladonCity is reachable: every credits map uses
  // gTileset_General as primary, and Celadon City is the only credits secondary
  // with an animation callback.
  if (sMap?.loaded.secondary.callback === "InitTilesetAnim_CeladonCity") InitTilesetAnim_CeladonCity();
}

/** InitTilesetAnimations. */
function InitTilesetAnimations(): void {
  ResetTilesetAnimBuffer();
  _InitPrimaryTilesetAnimation();
  _InitSecondaryTilesetAnimation();
}

/** UpdateTilesetAnimations. */
function UpdateTilesetAnimations(): void {
  ResetTilesetAnimBuffer();
  if (++sPrimaryTilesetAnimCounter >= sPrimaryTilesetAnimCounterMax) sPrimaryTilesetAnimCounter = 0;
  if (++sSecondaryTilesetAnimCounter >= sSecondaryTilesetAnimCounterMax) sSecondaryTilesetAnimCounter = 0;
  sPrimaryTilesetAnimCallback?.(sPrimaryTilesetAnimCounter);
  sSecondaryTilesetAnimCallback?.(sSecondaryTilesetAnimCounter);
  TransferTilesetAnimsBuffer();
}

/** Overworld_CreditsMainCB */
export function Overworld_CreditsMainCB(): void {
  const fading = !!gPaletteFade.active;
  void fading; // SetVBlankCallback(NULL)/SetFieldVBlankCallback: the credits' own VBlank stays installed.
  tasks.run();
  gFieldCamera.callback?.(); // the camera object's sprite callback, run by AnimateSprites
  AnimateSprites();
  CameraUpdateNoObjectRefresh();
  BuildOamBuffer();
  UpdatePaletteFade();
  UpdateTilesetAnimations();
  DoScheduledBgTilemapCopiesToVram();
}

/** Frames without map scroll (credits.c CB2_Credits case 0): RunTasks, AnimateSprites,
 * BuildOamBuffer, UpdatePaletteFade. The C freezes the pan while a new scroll
 * scene loads (MAPNEXT_LOADMAP returns 0); running CameraCB here reads the new
 * scene's command buffer using the previous scene's index and skips its LOADMAP. */
export function Overworld_CreditsIdleCB(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

// ---------------------------------------------------------------- scroll scene

/** Overworld_DoScrollSceneForCredits */
export function Overworld_DoScrollSceneForCredits(state_p: { value: number }, script: CreditsOverworldCmd[], tintMode: number): boolean {
  SetGlobalFieldTintMode(tintMode);
  sCreditsOverworld_Script = script;
  return SetUpScrollSceneForCredits(state_p, 0);
}

function SetUpScrollSceneForCredits(state: { value: number }, _unused: number): boolean {
  switch (state.value) {
    case 0:
      sCreditsOverworld_CmdIndex = 0;
      sCreditsOverworld_CmdLength = 0;
      state.value++;
      return false;
    case 1: {
      const group = sCreditsOverworld_Script[sCreditsOverworld_CmdIndex].unk_2;
      const num = sCreditsOverworld_Script[sCreditsOverworld_CmdIndex].unk_4;
      sCreditsOverworld_CmdIndex++;
      const x = sCreditsOverworld_Script[sCreditsOverworld_CmdIndex].unk_0;
      const y = sCreditsOverworld_Script[sCreditsOverworld_CmdIndex].unk_2;
      sCreditsOverworld_CmdLength = sCreditsOverworld_Script[sCreditsOverworld_CmdIndex].unk_4;
      // WarpIntoMap(): the map of the warp destination, from the preloaded cache.
      const id = mapIdOf(group, num);
      const loaded = sMapCache.get(id);
      if (!loaded) throw new Error(`credits: map ${id} not preloaded`);
      const map = new FieldMap();
      map.init(loaded);
      sMap = map;
      gFieldCamera.x = x * 16 - 112;
      gFieldCamera.y = y * 16 - 72;
      gFieldCamera.movementSpeedX = 0;
      gFieldCamera.movementSpeedY = 0;
      gFieldCamera.callback = null;
      // gPaletteFade.bufferTransferDisabled = TRUE; ScriptContext_Init(); UnlockPlayerFieldControls(); SetMainCallback1(NULL)
      gMain.state = 0;
      state.value++;
      return false;
    }
    case 2:
      if (FieldCB2_Credits_WaitFade()) break;
      if (MapLdr_Credits()) {
        state.value++;
        return false;
      }
      break;
    case 3:
      gFieldCamera.callback = CameraCB_CreditsPan; // SetFieldVBlankCallback(): the credits keep their VBlank
      state.value = 0;
      return true;
  }
  return false;
}

/** FieldCB2_Credits_WaitFade (overworld.c): hold map loading during the previous fade. */
export function FieldCB2_Credits_WaitFade(): boolean {
  return !!gPaletteFade.active;
}

function MapLdr_Credits(): boolean {
  switch (gMain.state) {
    case 0:
      // InitOverworldBgs_NoResetHeap(); LoadMapFromWarp(FALSE)
      ResetBgsAndClearDma3BusyFlags(false);
      InitBgsFromTemplates(0, sOverworldBgTemplates);
      SetBgAttribute(1, BG_ATTR_MOSAIC, 1);
      SetBgAttribute(2, BG_ATTR_MOSAIC, 1);
      SetBgAttribute(3, BG_ATTR_MOSAIC, 1);
      gBGTilemapBuffers2 = new Uint16Array(0x400);
      gBGTilemapBuffers1 = new Uint16Array(0x400);
      gBGTilemapBuffers3 = new Uint16Array(0x400);
      SetBgTilemapBuffer(1, gBGTilemapBuffers2);
      SetBgTilemapBuffer(2, gBGTilemapBuffers1);
      SetBgTilemapBuffer(3, gBGTilemapBuffers3);
      gMain.state++;
      break;
    case 1:
      // ScanlineEffect_Clear, ResetAllPicSprites, camera/weather/field task setup, RunOnResumeMapScript: not run.
      gMain.state++;
      break;
    case 2:
      // InitCurrentFlashLevelScanlineEffect(); InitOverworldGraphicsRegisters()
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
      SetGpuReg(REG_OFFSET_BLDCNT, 0);
      SetGpuReg(REG_OFFSET_BG0HOFS, 0);
      SetGpuReg(REG_OFFSET_BG0VOFS, 0);
      ShowBg(0);
      ShowBg(1);
      ShowBg(2);
      ShowBg(3);
      ChangeBgX(0, 0, 0);
      ChangeBgY(0, 0, 0);
      gMain.state++;
      break;
    case 3:
      // move_tilemap_camera_to_upper_left_corner()
      gMain.state++;
      break;
    case 4:
      // CopyPrimaryTilesetToVram + CopySecondaryTilesetToVram + LoadMapTilesetPalettes
      CopyMapTilesetsToHw(sMap!.loaded.primary, sMap!.loaded.secondary);
      gMain.state++;
      break;
    case 5:
      gMain.state++;
      break;
    case 6:
      gMain.state++;
      break;
    case 7:
      DrawWholeMapView();
      FieldUpdateBgTilemapScroll();
      gMain.state++;
      break;
    case 8:
      InitTilesetAnimations();
      // gPaletteFade.bufferTransferDisabled = FALSE;
      FadeSelectedPals(0, 0, 0x3fffffff); // FADE_FROM_BLACK
      gMain.state++;
      break;
    default:
      return true;
  }
  return false;
}

/** The first credits scene draws the map the field is showing, centered on the player. */
export function DrawCurrentFieldForCredits(): void {
  const cur = sCurrentFieldMap!;
  sMap = cur.map;
  gFieldCamera.x = cur.playerX * 16 - 112;
  gFieldCamera.y = cur.playerY * 16 - 72;
  gFieldCamera.movementSpeedX = 0;
  gFieldCamera.movementSpeedY = 0;
  gFieldCamera.callback = null;
  gBGTilemapBuffers2 = new Uint16Array(0x400);
  gBGTilemapBuffers1 = new Uint16Array(0x400);
  gBGTilemapBuffers3 = new Uint16Array(0x400);
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, sOverworldBgTemplates);
  SetBgTilemapBuffer(1, gBGTilemapBuffers2);
  SetBgTilemapBuffer(2, gBGTilemapBuffers1);
  SetBgTilemapBuffer(3, gBGTilemapBuffers3);
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  ShowBg(0);
  ShowBg(1);
  ShowBg(2);
  ShowBg(3);
  CopyMapTilesetsToHw(cur.map.loaded.primary, cur.map.loaded.secondary);
  DrawWholeMapView();
  FieldUpdateBgTilemapScroll();
  InitTilesetAnimations();
}

function CameraCB_CreditsPan(): void {
  const camera = gFieldCamera;
  if (sCreditsOverworld_CmdLength === 0) {
    sCreditsOverworld_CmdIndex++;
    switch (sCreditsOverworld_Script[sCreditsOverworld_CmdIndex].unk_0) {
      case CREDITSOVWLDCMD_FC:
      case CREDITSOVWLDCMD_LOADMAP:
        return;
      case CREDITSOVWLDCMD_FF:
        camera.movementSpeedX = 0;
        camera.movementSpeedY = 0;
        camera.callback = null;
        tasks.create(Task_OvwldCredits_FadeOut, 0);
        return;
      case CREDITSOVWLDCMD_FB:
        camera.movementSpeedX = 0;
        camera.movementSpeedY = 0;
        camera.callback = null;
        break;
      case CREDITSOVWLDCMD_END:
        camera.movementSpeedX = 0;
        camera.movementSpeedY = 0;
        camera.callback = null;
        return;
      default:
        sCreditsOverworld_CmdLength = sCreditsOverworld_Script[sCreditsOverworld_CmdIndex].unk_4;
        camera.movementSpeedX = sCreditsOverworld_Script[sCreditsOverworld_CmdIndex].unk_0;
        camera.movementSpeedY = sCreditsOverworld_Script[sCreditsOverworld_CmdIndex].unk_2;
        break;
    }
  }
  if (sCreditsOverworld_Script[sCreditsOverworld_CmdIndex].unk_0 === 0xff) {
    camera.movementSpeedX = 0;
    camera.movementSpeedY = 0;
  } else {
    sCreditsOverworld_CmdLength--;
  }
}

function Task_OvwldCredits_FadeOut(taskId: number): void {
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
  tasks.tasks[taskId].func = Task_OvwldCredits_WaitFade;
}

function Task_OvwldCredits_WaitFade(taskId: number): void {
  if (!gPaletteFade.active) {
    // CleanupOverworldWindowsAndTilemaps(); SetMainCallback2(CB2_LoadMap): unused by the credits script.
    SetMainCallback2(null);
    tasks.destroy(taskId);
  }
}
