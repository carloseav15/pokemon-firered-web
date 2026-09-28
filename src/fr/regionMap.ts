// region_map.c: the Town Map (REGIONMAP_TYPE_NORMAL, with the open/close
// animation, dungeon previews and the Kanto/Sevii switch menu), the wall map
// (REGIONMAP_TYPE_WALL, special ShowTownMap) and the Fly map
// (REGIONMAP_TYPE_FLY). Runs on the hardware layer under gMain; the caller
// owns the surrounding HwScene and gets control back through `done`.

import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { FONT_NORMAL, FONT_SMALL } from "./gba/font";
import { joy, A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, SELECT_BUTTON, START_BUTTON } from "./gba/input";
import { tasks, type TaskFunc } from "./gba/tasks";
import { cdata, incbin, incbin16, loadCData, preloadPacks, symName, type SymRef } from "./hw/assets";
import {
  BG_COORD_SET, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyToBgTilemapBufferRect, FillBgTilemapBufferRect, FillBgTilemapBufferRect_Palette0,
  HideBg, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg,
} from "./hw/bg";
import { animsFrom, oamFrom } from "./hw/cdataSprite";
import { ClearGpuRegBits, GetGpuReg, SetGpuReg } from "./hw/gpu";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalettes, gPaletteFade, LoadPalette, PALETTES_ALL, ResetPaletteFade, RGB_BLACK, TintPalette_CustomTone,
  TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import {
  BLDCNT_EFFECT_BLEND, BLDCNT_EFFECT_DARKEN, BLDCNT_EFFECT_LIGHTEN, BLDCNT_EFFECT_NONE, BLDCNT_TGT1_BD, BLDCNT_TGT1_BG0, BLDCNT_TGT1_BG1, BLDCNT_TGT1_BG2,
  BLDCNT_TGT1_BG3, BLDCNT_TGT1_OBJ, BLDCNT_TGT2_BG0, BLDCNT_TGT2_BG1, BLDCNT_TGT2_BG3, BLDCNT_TGT2_OBJ, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu,
  REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WIN1H, REG_OFFSET_WIN1V,
  REG_OFFSET_WININ, REG_OFFSET_WINOUT, WIN_RANGE, WININ_WIN0_ALL, WININ_WIN0_BG0, WININ_WIN0_BG1, WININ_WIN0_BG3, WININ_WIN0_BG_ALL, WININ_WIN0_CLR,
  WININ_WIN0_OBJ, WININ_WIN1_BG0, WININ_WIN1_BG2, WININ_WIN1_BG3, WININ_WIN1_CLR, WININ_WIN1_OBJ,
} from "./hw/ppu";
import { SetHBlankCallback, SetMainCallback2, SetVBlankCallback } from "./hw/runtime";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, DestroySprite, FreeAllSpritePalettes, FreeSpritePaletteByTag, FreeSpriteTilesByTag, gDummySpriteAffineAnimTable,
  gSprites, LoadOam, LoadSpritePalette, LoadSpriteSheet, ProcessSpriteCopyRequests, ResetSpriteData, SpriteCallbackDummy, StartSpriteAnim, type Sprite,
  type SpriteCallback, type SpriteTemplate,
} from "./hw/sprite";
import { AddTextPrinterParameterized3, DeactivateAllTextPrinters } from "./hw/text";
import {
  ClearWindowTilemap, COPYWIN_FULL, COPYWIN_GFX, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PIXEL_FILL, PutWindowTilemap,
  type WindowTemplate,
} from "./hw/window";
import { rom } from "./rom";
import { flagGet, save, type WarpData } from "./save";
import type { Game } from "./game";
import type { MapHeader } from "./rom";

const MAP_WIDTH = 22, MAP_HEIGHT = 15;
const CANCEL_BUTTON_X = 21, CANCEL_BUTTON_Y = 13;
const SWITCH_BUTTON_X = 21, SWITCH_BUTTON_Y = 11;

export const REGIONMAP_TYPE_NORMAL = 0, REGIONMAP_TYPE_WALL = 1, REGIONMAP_TYPE_FLY = 2;
const REGIONMAP_KANTO = 0, REGIONMAP_SEVII123 = 1, REGIONMAP_SEVII45 = 2, REGIONMAP_SEVII67 = 3, REGIONMAP_COUNT = 4;
const MAPSECTYPE_NONE = 0, MAPSECTYPE_ROUTE = 1, MAPSECTYPE_VISITED = 2, MAPSECTYPE_NOT_VISITED = 3, MAPSECTYPE_UNKNOWN = 4;
const LAYER_MAP = 0, LAYER_DUNGEON = 1;
const WIN_MAP_NAME = 0, WIN_DUNGEON_NAME = 1, WIN_MAP_PREVIEW = 2, WIN_TOPBAR_LEFT = 3, WIN_TOPBAR_RIGHT = 4;
const CLEAR_NAME = 2;
const MAP_INPUT_NONE = 0, MAP_INPUT_MOVE_START = 1, MAP_INPUT_MOVE_CONT = 2, MAP_INPUT_MOVE_END = 3, MAP_INPUT_A_BUTTON = 4, MAP_INPUT_SWITCH = 5, MAP_INPUT_CANCEL = 6;
const MAPPERM_HAS_SWITCH_BUTTON = 0, MAPPERM_HAS_MAP_PREVIEW = 1, MAPPERM_HAS_OPEN_ANIM = 2, MAPPERM_HAS_FLY_DESTINATIONS = 3;
const MAPEDGE_TOP_LEFT = 0, MAPEDGE_MID_LEFT = 1, MAPEDGE_BOT_LEFT = 2, MAPEDGE_TOP_RIGHT = 3, MAPEDGE_MID_RIGHT = 4, MAPEDGE_BOT_RIGHT = 5;
const NUM_MAP_EDGES = 6, NUM_ICONS = 25;

type GpuWindowParams = { left: number; top: number; right: number; bottom: number };

const rd = <T>(name: string): T => cdata<T>("region_map", name);
const sym = (name: string): SymRef => ({ $sym: name });
const text = (name: string): Uint8Array => rom.text(name);
const pal16 = (name: string): Uint16Array => incbin16(name);

// ---------------------------------------------------------------- state

type RegionMap = {
  mapName: Uint8Array; dungeonName: Uint8Array;
  layouts: Uint16Array[];
  bgTilemapBuffers: Uint16Array[];
  type: number;
  permissions: boolean[];
  selectedRegion: number; playersRegion: number;
  mainState: number; openState: number; loadGfxState: number;
  mainTask: TaskFunc;
  savedCallback: () => void;
  /** SELECT closes the map only when opened from the field (savedCallback == CB2_ReturnToField). */
  selectCloses: boolean;
};
type SwitchMapMenu = {
  switchMapTiles: Uint8Array; switchMapTilemap: Uint16Array;
  cursorSubsprite: Array<{ tiles: Uint8Array; sprite: Sprite | null; tileTag: number; palTag: number; x: number }>;
  mainState: number; cursorLoadState: number; currentSelection: number; chosenRegion: number; maxSelection: number; alpha: number; yOffset: number;
  exitTask: TaskFunc; highlight: GpuWindowParams; blendY: number;
};
type MapPreviewScreen = { mapsec: number; type: number; flagId: number; tilesptr: SymRef; tilemapptr: SymRef; palptr: SymRef };
type DungeonMapPreview = {
  tiles: Uint8Array; tilemap: Uint16Array; mapPreviewInfo: MapPreviewScreen; savedTask: TaskFunc;
  mainState: number; drawState: number; loadState: number; updateCounter: number; timer: number; palette: Uint16Array;
  red: number; green: number; blue: number; blendY: number; left: number; top: number; right: number; bottom: number;
  leftIncrement: number; topIncrement: number; rightIncrement: number; bottomIncrement: number;
};
type MapEdge = { tiles: Uint8Array; sprite: Sprite | null; x: number; y: number; tileTag: number; palTag: number };
type MapOpenCloseAnim = {
  mapEdges: MapEdge[]; tiles: Uint8Array; tilemap: Uint16Array; exitTask: TaskFunc;
  openState: number; loadGfxState: number; moveState: number; closeState: number; blendY: number;
};
type MapCursor = {
  x: number; y: number; spriteX: number; spriteY: number; horizontalMove: number; verticalMove: number; moveCounter: number; snapId: number;
  inputHandler: () => number; selectedMapsec: number; selectedMapsecType: number; selectedDungeonType: number;
  sprite: Sprite | null; tileTag: number; palTag: number; tiles: Uint8Array;
};
type PlayerIcon = { x: number; y: number; sprite: Sprite | null; tileTag: number; palTag: number; tiles: Uint8Array };
type MapIconSprite = { region: number; sprite: Sprite | null; tileTag: number; palTag: number };
type MapIcons = { dungeonIconTiles: Uint8Array; flyIconTiles: Uint8Array; dungeonIcons: MapIconSprite[]; flyIcons: MapIconSprite[]; state: number; exitTask: TaskFunc };
type RegionMapGpuRegs = { bldcnt: number; bldy: number; bldalpha: number; winin: number; winout: number; win0h: number; win1h: number; win0v: number; win1v: number };
type FlyMap = { state: number; selectedDestination: boolean };

let sRegionMap: RegionMap | null = null;
let sSwitchMapMenu: SwitchMapMenu | null = null;
let sDungeonMapPreview: DungeonMapPreview | null = null;
let sMapOpenCloseAnim: MapOpenCloseAnim | null = null;
let sMapCursor: MapCursor | null = null;
let sPlayerIcon: PlayerIcon | null = null;
let sMapIcons: MapIcons | null = null;
const sRegionMapGpuRegs: Array<RegionMapGpuRegs | null> = [null, null, null];
let sFlyMap: FlyMap | null = null;
let sGame: Game | null = null;
let sFlyDone: ((selected: boolean) => void) | null = null;

const rm = (): RegionMap => sRegionMap!;
const cursor = (): MapCursor => sMapCursor!;

// ---------------------------------------------------------------- entry points

const CDATA = ["region_map", "map_preview_screen"];
const PACKS = ["graphics_region_map", "graphics_map_preview"];

/** Loads the data the map reads synchronously: its graphics and the warp maps behind the player position. */
async function prepare(): Promise<void> {
  await Promise.all([loadCData(...CDATA), preloadPacks(PACKS)]);
  const warps = [save.location, save.escapeWarp, save.dynamicWarp];
  await Promise.all(warps.map(async (w) => {
    const id = rom.mapIdByNum((w.mapGroup << 8) | w.mapNum);
    if (!id) return;
    try {
      const header = await rom.loadMap(id);
      await rom.loadLayout(header.layout);
    } catch { /* an unset warp has no map */ }
  }));
}

/**
 * InitRegionMapWithExitCB(REGIONMAP_TYPE_NORMAL or _WALL, cb). `fromField`
 * matches savedCallback == CB2_ReturnToField (SELECT also closes the map).
 */
export function openRegionMap(game: Game, type: number, done: () => void, fromField = false): void {
  sGame = game;
  void prepare().then(() => InitRegionMapWithExitCB(type, done, fromField));
}

/**
 * CB2_OpenFlyMap from the party menu. `done(true)` after a destination was
 * chosen and the warp set (ReturnToFieldFromFlyMapSelect follows),
 * `done(false)` for CB2_ReturnToPartyMenuFromFlyMap.
 */
export function openFlyMap(game: Game, done: (selected: boolean) => void): void {
  sGame = game;
  sFlyDone = done;
  void prepare().then(() => {
    InitFlyMap();
    InitRegionMap(REGIONMAP_TYPE_FLY, () => {});
  });
}

// ---------------------------------------------------------------- init

function RegionMap_DarkenPalette(pal: Uint16Array, size: number, tint: number): void {
  for (let i = 0; i < size; i++) {
    let r = pal[i] & 0x1f, g = (pal[i] >> 5) & 0x1f, b = (pal[i] >> 10) & 0x1f;
    r = ((Math.trunc((r << 8) / 100)) * tint) >> 8;
    g = ((Math.trunc((g << 8) / 100)) * tint) >> 8;
    b = ((Math.trunc((b << 8) / 100)) * tint) >> 8;
    pal[i] = r | (g << 5) | (b << 10);
  }
}

function TintMapEdgesPalette(): void {
  const regionPal = pal16("sRegionMap_Pal");
  const mapEdgesPal = regionPal.slice(0x20, 0x30);
  RegionMap_DarkenPalette(mapEdgesPal, 16, 95);
  LoadPalette(mapEdgesPal, BG_PLTT_ID(2), 32);
  LoadPalette(regionPal.subarray(0x2f, 0x30), BG_PLTT_ID(2) + 15, 2);
}

function newRegionMap(type: number, cb: () => void, fromField: boolean): RegionMap {
  return {
    mapName: new Uint8Array(0), dungeonName: new Uint8Array(0),
    layouts: Array.from({ length: REGIONMAP_COUNT + 1 }, () => new Uint16Array(600)),
    bgTilemapBuffers: Array.from({ length: 3 }, () => new Uint16Array(0x400)),
    type, permissions: [false, false, false, false], selectedRegion: 0, playersRegion: 0,
    mainState: 0, openState: 0, loadGfxState: 0, mainTask: Task_RegionMap, savedCallback: cb, selectCloses: fromField,
  };
}

function InitRegionMap(type: number, cb: () => void): void {
  sRegionMap = newRegionMap(type, cb, false);
  sGame!.overworld.gExitStairsMovementDisabled = true;
  InitRegionMapType();
  SetMainCallback2(CB2_OpenRegionMap);
}

function InitRegionMapWithExitCB(type: number, cb: () => void, fromField: boolean): void {
  sRegionMap = newRegionMap(type, cb, fromField);
  sGame!.overworld.gExitStairsMovementDisabled = true;
  InitRegionMapType();
  SetMainCallback2(CB2_OpenRegionMap);
}

function InitRegionMapType(): void {
  const r = rm();
  SetMainMapTask(r.type === REGIONMAP_TYPE_FLY ? Task_FlyMap : Task_RegionMap);
  const perms = rd<number[][]>("sRegionMapPermissions")[r.type];
  for (let i = 0; i < 4; i++) r.permissions[i] = !!perms[i];
  if (!flagGet(C.FLAG_SYS_SEVII_MAP_123)) r.permissions[MAPPERM_HAS_SWITCH_BUTTON] = false;
  let region = REGIONMAP_KANTO;
  const section = sGame!.overworld.header.regionMapSection;
  if (section >= C.SEVII_MAPSEC_START) {
    const sevii = rd<number[][]>("sSeviiMapsecs");
    for (let j = 0; region === REGIONMAP_KANTO && j < sevii.length; j++) {
      for (let i = 0; sevii[j][i] !== C.MAPSEC_NONE && i < sevii[j].length; i++) {
        if (section === sevii[j][i]) { region = j + 1; break; }
      }
    }
  }
  r.selectedRegion = region;
  SetRegionMapPlayerIsOn(region);
}

function CB2_OpenRegionMap(): void {
  const r = rm();
  switch (r.openState) {
    case 0: NullVBlankHBlankCallbacks(); break;
    case 1: InitRegionMapBgs(); break;
    case 2: ResetOamForRegionMap(); break;
    case 3: if (!LoadRegionMapGfx()) return; break;
    case 4:
      FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 30, 20);
      CopyBgTilemapBufferToVram(1);
      break;
    case 5:
      BufferRegionMapBg(0, r.layouts[r.selectedRegion]);
      CopyBgTilemapBufferToVram(0);
      if (r.type !== REGIONMAP_TYPE_NORMAL) {
        BufferRegionMapBg(1, r.layouts[REGIONMAP_COUNT]);
        CopyBgTilemapBufferToVram(1);
      }
      break;
    case 6: DisplayCurrentMapName(); PutWindowTilemap(WIN_MAP_NAME); break;
    case 7: DisplayCurrentDungeonName(); PutWindowTilemap(WIN_DUNGEON_NAME); break;
    case 8: if (GetRegionMapPermission(MAPPERM_HAS_OPEN_ANIM)) SetBg0andBg3Hidden(true); break;
    default:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
      CreateMainMapTask();
      SetRegionMapVBlankCB();
      break;
  }
  r.openState++;
}

function LoadRegionMapGfx(): boolean {
  const r = rm();
  switch (r.loadGfxState) {
    case 0: LoadPalette(pal16("sTopBar_Pal"), BG_PLTT_ID(12), 32); break;
    case 1: {
      const regionPal = pal16("sRegionMap_Pal");
      LoadPalette(regionPal, 0, regionPal.length * 2);
      TintMapEdgesPalette();
      if (r.type !== REGIONMAP_TYPE_NORMAL) {
        const white = pal16("sTopBar_Pal").subarray(15, 16);
        for (let i = 0; i < 5; i++) LoadPalette(white, BG_PLTT_ID(i), 2);
      }
      break;
    }
    case 2: break; // ResetTempTileDataBuffers
    case 3: {
      const gfx = incbin("sRegionMap_Gfx");
      LoadBgTiles(0, gfx, gfx.length, 0);
      if (r.type !== REGIONMAP_TYPE_NORMAL) { const bg = incbin("sBackground_Gfx"); LoadBgTiles(1, bg, bg.length, 0); }
      break;
    }
    case 4: break; // FreeTempTileDataBuffersIfPossible
    case 5: r.layouts[REGIONMAP_KANTO].set(pal16("sKanto_Tilemap").subarray(0, 600)); break;
    case 6: r.layouts[REGIONMAP_SEVII123].set(pal16("sSevii123_Tilemap").subarray(0, 600)); break;
    case 7: r.layouts[REGIONMAP_SEVII45].set(pal16("sSevii45_Tilemap").subarray(0, 600)); break;
    case 8: r.layouts[REGIONMAP_SEVII67].set(pal16("sSevii67_Tilemap").subarray(0, 600)); break;
    default:
      r.layouts[REGIONMAP_COUNT].set(pal16("sBackground_Tilemap").subarray(0, 600));
      return true;
  }
  r.loadGfxState++;
  return false;
}

function CreateMainMapTask(): void {
  tasks.create(rm().mainTask, 0);
  SetMainCallback2(CB2_RegionMap);
}

function SelectedMapsecSEEnabled(): boolean {
  return GetSelectedMapSection(GetSelectedRegionMap(), LAYER_MAP, GetMapCursorY(), GetMapCursorX()) !== C.MAPSEC_ROUTE_4_POKECENTER;
}

function PlaySEForSelectedMapsec(): void {
  if (!SelectedMapsecSEEnabled()) return;
  if ((GetSelectedMapsecType(LAYER_MAP) !== MAPSECTYPE_ROUTE && GetSelectedMapsecType(LAYER_MAP) !== MAPSECTYPE_NONE)
    || (GetSelectedMapsecType(LAYER_DUNGEON) !== MAPSECTYPE_ROUTE && GetSelectedMapsecType(LAYER_DUNGEON) !== MAPSECTYPE_NONE))
    sound.playSE(C.SE_DEX_SCROLL);
  if (GetMapCursorX() === SWITCH_BUTTON_X && GetMapCursorY() === SWITCH_BUTTON_Y && GetRegionMapPermission(MAPPERM_HAS_SWITCH_BUTTON))
    sound.playSE(C.SE_M_SPIT_UP);
  else if (GetMapCursorX() === CANCEL_BUTTON_X && GetMapCursorY() === CANCEL_BUTTON_Y)
    sound.playSE(C.SE_M_SPIT_UP);
}

function Task_RegionMap(taskId: number): void {
  const r = rm();
  switch (r.mainState) {
    case 0:
      InitMapIcons(GetSelectedRegionMap(), taskId, GetMainMapTask());
      CreateMapCursor(0, 0);
      CreatePlayerIcon(1, 1);
      r.mainState++;
      break;
    case 1:
      if (r.permissions[MAPPERM_HAS_OPEN_ANIM]) {
        InitMapOpenAnim(taskId, GetMainMapTask());
      } else {
        ShowBg(0); ShowBg(3); ShowBg(1);
        PrintTopBarTextLeft(text("gText_RegionMap_DPadMove"));
        PrintTopBarTextRight(text("gText_RegionMap_Space"));
        ClearOrDrawTopBar(false);
        SetPlayerIconInvisibility(false);
        SetMapCursorInvisibility(false);
        SetFlyIconInvisibility(GetSelectedRegionMap(), NUM_ICONS, false);
        SetDungeonIconInvisibility(GetSelectedRegionMap(), NUM_ICONS, false);
      }
      r.mainState++;
      break;
    case 2:
      if (!gPaletteFade.active) {
        DisplayCurrentMapName(); PutWindowTilemap(WIN_MAP_NAME);
        DisplayCurrentDungeonName(); PutWindowTilemap(WIN_DUNGEON_NAME);
        r.mainState++;
      }
      break;
    case 3:
      switch (GetRegionMapInput()) {
        case MAP_INPUT_MOVE_START: ResetCursorSnap(); break;
        case MAP_INPUT_MOVE_CONT: break;
        case MAP_INPUT_MOVE_END:
          DisplayCurrentMapName();
          DisplayCurrentDungeonName();
          DrawDungeonNameBox();
          PlaySEForSelectedMapsec();
          if (GetDungeonMapsecUnderCursor() !== C.MAPSEC_NONE) {
            if (GetRegionMapPermission(MAPPERM_HAS_MAP_PREVIEW)) {
              PrintTopBarTextRight(text(GetSelectedMapsecType(LAYER_DUNGEON) === MAPSECTYPE_VISITED ? "gText_RegionMap_AButtonGuide" : "gText_RegionMap_Space"));
            }
          } else if (GetMapCursorX() === SWITCH_BUTTON_X && GetMapCursorY() === SWITCH_BUTTON_Y && GetRegionMapPermission(MAPPERM_HAS_SWITCH_BUTTON)) {
            PrintTopBarTextRight(text("gText_RegionMap_AButtonSwitch"));
          } else if (GetMapCursorX() === CANCEL_BUTTON_X && GetMapCursorY() === CANCEL_BUTTON_Y) {
            PrintTopBarTextRight(text("gText_RegionMap_AButtonCancel"));
          } else {
            PrintTopBarTextRight(text("gText_RegionMap_Space"));
          }
          break;
        case MAP_INPUT_A_BUTTON:
          if (GetSelectedMapsecType(LAYER_DUNGEON) === MAPSECTYPE_VISITED && r.permissions[MAPPERM_HAS_MAP_PREVIEW])
            InitDungeonMapPreview(0, taskId, SaveMainMapTask);
          break;
        case MAP_INPUT_SWITCH:
          InitSwitchMapMenu(r.selectedRegion, taskId, SaveMainMapTask);
          break;
        case MAP_INPUT_CANCEL:
          r.mainState++;
          break;
      }
      break;
    case 4:
      // Either way one step: the close animation returns here for the fade.
      if (GetRegionMapPermission(MAPPERM_HAS_OPEN_ANIM)) DoMapCloseAnim(taskId);
      r.mainState++;
      break;
    case 5:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      r.mainState++;
      break;
    default:
      if (!gPaletteFade.active) FreeRegionMap(taskId);
      break;
  }
}

function SaveMainMapTask(taskId: number): void {
  tasks.setFunc(taskId, GetMainMapTask());
}

function FreeRegionMap(taskId: number): void {
  if (GetRegionMapPermission(MAPPERM_HAS_OPEN_ANIM)) FreeMapOpenCloseAnim();
  FreeMapIcons();
  FreeMapCursor();
  FreePlayerIcon();
  FreeAndResetGpuRegs();
  tasks.destroy(taskId);
  FreeAllWindowBuffers();
  const cb = rm().savedCallback;
  SetVBlankCallback(null);
  SetMainCallback2(null);
  sRegionMap = null;
  cb();
}

function CB2_RegionMap(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

function VBlankCB_RegionMap(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function NullVBlankHBlankCallbacks(): void {
  SetVBlankCallback(null);
  SetHBlankCallback(null);
}

function SetRegionMapVBlankCB(): void {
  SetVBlankCallback(VBlankCB_RegionMap);
}

function InitRegionMapBgs(): void {
  ppu.vram.fill(0); ppu.oam.fill(0); ppu.pltt.fill(0);
  SetGpuReg(REG_OFFSET_DISPCNT, 0);
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, rd("sRegionMapBgTemplates"));
  for (let bg = 0; bg < 4; bg++) { ChangeBgX(bg, 0, BG_COORD_SET); ChangeBgY(bg, 0, BG_COORD_SET); }
  InitWindows(rd<WindowTemplate[]>("sRegionMapWindowTemplates"));
  DeactivateAllTextPrinters();
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | 0x2000 | 0x4000); // MODE_0 | OBJ_1D_MAP | WIN0_ON | WIN1_ON
  SetBgTilemapBuffers();
  UpdateMapsecNameBox();
}

function SetBgTilemapBuffers(): void {
  for (let bg = 0; bg < 3; bg++) SetBgTilemapBuffer(bg, rm().bgTilemapBuffers[bg]);
}

function ResetOamForRegionMap(): void {
  ResetSpriteData();
  ResetPaletteFade();
  FreeAllSpritePalettes();
  tasks.reset();
}

function SetBg0andBg3Hidden(hide: boolean): void {
  if (hide) { HideBg(0); HideBg(3); } else { ShowBg(0); ShowBg(3); }
}

function UpdateMapsecNameBox(): void {
  const dims = rd<GpuWindowParams[]>("sMapsecNameWindowDims");
  ResetGpuRegs();
  SetBldCnt(0, BLDCNT_TGT1_BG0 | BLDCNT_TGT1_OBJ, BLDCNT_EFFECT_DARKEN);
  SetBldY(BLDCNT_TGT1_BG1 | BLDCNT_TGT1_BG2);
  SetWinIn(WININ_WIN0_BG0 | WININ_WIN0_BG3 | WININ_WIN0_OBJ | WININ_WIN0_CLR, (WININ_WIN1_BG0 | WININ_WIN1_BG3 | WININ_WIN1_OBJ | WININ_WIN1_CLR) >> 8);
  SetWinOut(WINOUT_WIN01_BG0 | WINOUT_WIN01_BG1 | WINOUT_WIN01_BG3 | WINOUT_WIN01_OBJ);
  SetGpuWindowDims(0, dims[WIN_MAP_NAME]);
  SetGpuWindowDims(1, dims[WIN_DUNGEON_NAME]);
  SetDispCnt(0, false);
  if (GetDungeonMapsecUnderCursor() !== C.MAPSEC_NONE) SetDispCnt(1, false);
}

function DisplayCurrentMapName(): void {
  const dims = rd<GpuWindowParams[]>("sMapsecNameWindowDims");
  ClearWindowTilemap(WIN_MAP_NAME);
  FillWindowPixelBuffer(WIN_MAP_NAME, PIXEL_FILL(0));
  if (GetMapsecUnderCursor() === C.MAPSEC_NONE) {
    SetGpuWindowDims(0, dims[CLEAR_NAME]);
  } else {
    rm().mapName = GetMapName(GetMapsecUnderCursor(), 0);
    AddTextPrinterParameterized3(WIN_MAP_NAME, FONT_NORMAL, 2, 2, rd("sTextColor_White"), 0, rm().mapName);
    PutWindowTilemap(WIN_MAP_NAME);
    CopyWindowToVram(WIN_MAP_NAME, COPYWIN_GFX);
    SetGpuWindowDims(0, dims[WIN_MAP_NAME]);
  }
}

function DrawDungeonNameBox(): void {
  SetGpuWindowDims(1, rd<GpuWindowParams[]>("sMapsecNameWindowDims")[WIN_DUNGEON_NAME]);
}

function DisplayCurrentDungeonName(): void {
  SetDispCnt(1, true);
  ClearWindowTilemap(WIN_DUNGEON_NAME);
  const mapsecId = GetDungeonMapsecUnderCursor();
  if (mapsecId !== C.MAPSEC_NONE) {
    SetDispCnt(1, false);
    FillWindowPixelBuffer(WIN_DUNGEON_NAME, PIXEL_FILL(0));
    rm().dungeonName = mapNameBytes(mapsecId);
    const colors = [rd<number[]>("sTextColor_Green"), rd<number[]>("sTextColor_Red")][GetSelectedMapsecType(LAYER_DUNGEON) - 2] ?? rd<number[]>("sTextColor_Red");
    AddTextPrinterParameterized3(WIN_DUNGEON_NAME, FONT_NORMAL, 12, 2, colors, 0, rm().dungeonName);
    PutWindowTilemap(WIN_DUNGEON_NAME);
    CopyWindowToVram(WIN_DUNGEON_NAME, COPYWIN_FULL);
  }
}

function ClearMapsecNameText(): void {
  FillWindowPixelBuffer(WIN_MAP_NAME, PIXEL_FILL(0));
  CopyWindowToVram(WIN_MAP_NAME, COPYWIN_FULL);
  FillWindowPixelBuffer(WIN_DUNGEON_NAME, PIXEL_FILL(0));
  CopyWindowToVram(WIN_DUNGEON_NAME, COPYWIN_FULL);
}

function BufferRegionMapBg(bg: number, map: Uint16Array): void {
  const buffer = rm().bgTilemapBuffers[bg];
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 32; j++) buffer[32 * i + j] = j < 30 ? map[30 * i + j] : map[0];
  }
  if (rm().permissions[MAPPERM_HAS_SWITCH_BUTTON]) {
    WriteSequence(0, 0x0f0, 0x18, 14, 3, 1, 0x3, 0x001);
    WriteSequence(0, 0x100, 0x18, 15, 3, 1, 0x3, 0x001);
    WriteSequence(0, 0x110, 0x18, 16, 3, 1, 0x3, 0x001);
  }
  const whichMap = sSwitchMapMenu ? sSwitchMapMenu.currentSelection : rm().selectedRegion;
  if (whichMap === REGIONMAP_SEVII45 && !flagGet(C.FLAG_WORLD_MAP_NAVEL_ROCK_EXTERIOR)) FillBgTilemapBufferRect_Palette0(0, 0x003, 13, 11, 3, 2);
  if (whichMap === REGIONMAP_SEVII67 && !flagGet(C.FLAG_WORLD_MAP_BIRTH_ISLAND_EXTERIOR)) FillBgTilemapBufferRect_Palette0(0, 0x003, 21, 16, 3, 3);
}

/** WriteSequenceToBgTilemapBuffer into the region map's own buffer (bg 0). */
function WriteSequence(bg: number, firstTileNum: number, x: number, y: number, width: number, height: number, paletteSlot: number, tileNumDelta: number): void {
  const buffer = rm().bgTilemapBuffers[bg];
  let tile = firstTileNum;
  for (let yy = y; yy < y + height; yy++) {
    for (let xx = x; xx < x + width; xx++) {
      buffer[yy * 32 + xx] = (tile & 0x3ff) | (paletteSlot << 12);
      tile = (tile & 0xfc00) + ((tile + tileNumDelta) & 0x3ff);
    }
  }
}

function GetRegionMapPermission(attr: number): boolean { return rm().permissions[attr]; }
function SetMainMapTask(taskFunc: TaskFunc): void { rm().mainTask = taskFunc; }
function GetMainMapTask(): TaskFunc { return rm().mainTask; }
function GetSelectedRegionMap(): number { return rm().selectedRegion; }
function GetRegionMapPlayerIsOn(): number { return rm().playersRegion; }
function SetSelectedRegionMap(region: number): void { rm().selectedRegion = region; }
function SetRegionMapPlayerIsOn(region: number): void { rm().playersRegion = region & 0xff; }

// ---------------------------------------------------------------- switch map menu

function InitSwitchMapMenu(whichMap: number, taskId: number, taskFunc: TaskFunc): void {
  let maxSelection = 0;
  if (flagGet(C.FLAG_SYS_SEVII_MAP_4567)) maxSelection = 3;
  else if (flagGet(C.FLAG_SYS_SEVII_MAP_123)) maxSelection = 1;
  let tilemap: string, yOffset: number;
  switch (maxSelection) {
    case 1: tilemap = "sSwitchMap_KantoSevii123_Tilemap"; yOffset = 6; break;
    case 2: tilemap = "sSwitchMap_KantoSeviiAll2_Tilemap"; yOffset = 4; break;
    default: tilemap = "sSwitchMap_KantoSeviiAll_Tilemap"; yOffset = 3; break;
  }
  sSwitchMapMenu = {
    switchMapTiles: incbin("sSwitchMapMenu_Gfx"), switchMapTilemap: pal16(tilemap),
    cursorSubsprite: [
      { tiles: new Uint8Array(0), sprite: null, tileTag: 0, palTag: 0, x: 88 },
      { tiles: new Uint8Array(0), sprite: null, tileTag: 0, palTag: 0, x: 152 },
    ],
    mainState: 0, cursorLoadState: 0, currentSelection: whichMap, chosenRegion: GetRegionMapPlayerIsOn(), maxSelection, alpha: 0, yOffset,
    exitTask: taskFunc, highlight: { left: 0, top: 0, right: 0, bottom: 0 }, blendY: 0,
  };
  SaveRegionMapGpuRegs(0);
  PrintTopBarTextRight(text("gText_RegionMap_AButtonOK"));
  tasks.setFunc(taskId, Task_SwitchMapMenu);
}

function ResetGpuRegsForSwitchMapMenu(): void {
  ResetGpuRegs();
  SetBldCnt((BLDCNT_TGT2_BG0 | BLDCNT_TGT2_BG1 | BLDCNT_TGT2_BG3 | BLDCNT_TGT2_OBJ) >> 8, BLDCNT_TGT1_BG2, BLDCNT_EFFECT_BLEND);
  SetBldAlpha(16 - sSwitchMapMenu!.alpha, sSwitchMapMenu!.alpha);
}

function FadeSwitchMapMenuIn(): boolean {
  const m = sSwitchMapMenu!;
  if (m.alpha < 16) { SetBldAlpha(16 - m.alpha, m.alpha); m.alpha += 2; return false; }
  return true;
}

function FadeSwitchMapMenuOut(): boolean {
  const m = sSwitchMapMenu!;
  if (m.alpha >= 2) { m.alpha -= 2; SetBldAlpha(16 - m.alpha, m.alpha); return false; }
  return true;
}

function Task_SwitchMapMenu(taskId: number): void {
  const m = sSwitchMapMenu!;
  switch (m.mainState) {
    case 0: NullVBlankHBlankCallbacks(); PrintTopBarTextLeft(text("gText_RegionMap_UpDownPick")); m.mainState++; break;
    case 1: LoadBgTiles(2, m.switchMapTiles, m.switchMapTiles.length, 0); m.mainState++; break;
    case 2: LoadSwitchMapTilemap(2, m.switchMapTilemap); CopyBgTilemapBufferToVram(2); m.mainState++; break;
    case 3: ClearMapsecNameText(); m.mainState++; break;
    case 4: ResetGpuRegsForSwitchMapMenu(); ShowBg(2); m.mainState++; break;
    case 5: SetRegionMapVBlankCB(); m.mainState++; break;
    case 6: if (FadeSwitchMapMenuIn()) { SetGpuRegsToDimScreen(); m.mainState++; } break;
    case 7: if (DimScreenForSwitchMapMenu()) m.mainState++; break;
    case 8: if (CreateSwitchMapCursor()) m.mainState++; break;
    case 9:
      if (HandleSwitchMapInput()) {
        SetSelectedRegionMap(m.currentSelection);
        if (GetRegionMapPlayerIsOn() === m.currentSelection) {
          SetPlayerIconInvisibility(false);
          SetFlyIconInvisibility(m.currentSelection, NUM_ICONS, false);
          SetDungeonIconInvisibility(m.currentSelection, NUM_ICONS, false);
        }
        m.mainState++;
      }
      break;
    case 10: if (BrightenScreenForSwitchMapMenu()) { FreeSwitchMapCursor(); ResetGpuRegsForSwitchMapMenu(); m.mainState++; } break;
    case 11: if (FadeSwitchMapMenuOut()) m.mainState++; break;
    case 12: SetMapCursorInvisibility(false); m.mainState++; break;
    default: FreeSwitchMapMenu(taskId); break;
  }
}

function FreeSwitchMapMenu(taskId: number): void {
  tasks.setFunc(taskId, sSwitchMapMenu!.exitTask);
  HideBg(2);
  PrintTopBarTextLeft(text("gText_RegionMap_DPadMove"));
  PrintTopBarTextRight(text("gText_RegionMap_AButtonSwitch"));
  UpdateMapsecNameBox();
  DrawDungeonNameBox();
  SetGpuWindowDims(0, rd<GpuWindowParams[]>("sMapsecNameWindowDims")[CLEAR_NAME]);
  sSwitchMapMenu = null;
}

function BrightenScreenForSwitchMapMenu(): boolean {
  const m = sSwitchMapMenu!;
  if (m.blendY !== 0) { m.blendY--; SetGpuReg(REG_OFFSET_BLDY, m.blendY); return false; }
  SetGpuReg(REG_OFFSET_BLDY, 0);
  return true;
}

function LoadSwitchMapTilemap(bg: number, map: Uint16Array): void {
  const buffer = rm().bgTilemapBuffers[bg];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 32; j++) buffer[32 * i + j] = j < 30 ? map[30 * i + j] : map[0];
}

function highlightDims(): GpuWindowParams {
  const m = sSwitchMapMenu!;
  m.highlight.left = 72;
  m.highlight.top = 8 * (m.yOffset + 4 * m.currentSelection);
  m.highlight.right = 168;
  m.highlight.bottom = m.highlight.top + 32;
  return { ...m.highlight };
}

function SetGpuRegsToDimScreen(): void {
  const data = highlightDims();
  ResetGpuRegs();
  SetBldCnt(0, BLDCNT_TGT1_BG0 | BLDCNT_TGT1_BG2 | BLDCNT_TGT1_OBJ, BLDCNT_EFFECT_DARKEN);
  SetWinIn(WININ_WIN0_BG_ALL | WININ_WIN0_OBJ, (WININ_WIN1_BG0 | WININ_WIN1_BG2 | WININ_WIN1_OBJ) >> 8);
  SetWinOut(WINOUT_WIN01_BG_ALL | WINOUT_WIN01_OBJ | WINOUT_WIN01_CLR);
  SetDispCnt(1, false);
  SetGpuWindowDims(1, data);
}

function DimScreenForSwitchMapMenu(): boolean {
  const m = sSwitchMapMenu!;
  if (m.blendY < 6) { m.blendY++; SetBldY(m.blendY); return false; }
  return true;
}

function HandleSwitchMapInput(): boolean {
  const m = sSwitchMapMenu!;
  let changedSelection = false;
  const data = highlightDims();
  if (joy.newKeys & DPAD_UP && m.currentSelection !== 0) { sound.playSE(C.SE_BAG_CURSOR); m.currentSelection--; changedSelection = true; }
  if (joy.newKeys & DPAD_DOWN && m.currentSelection < m.maxSelection) { sound.playSE(C.SE_BAG_CURSOR); m.currentSelection++; changedSelection = true; }
  if (joy.newKeys & A_BUTTON && m.blendY === 6) {
    sound.playSE(C.SE_M_SWIFT);
    m.chosenRegion = m.currentSelection;
    return true;
  }
  if (joy.newKeys & B_BUTTON) {
    m.currentSelection = m.chosenRegion;
    BufferRegionMapBg(0, rm().layouts[m.currentSelection]);
    CopyBgTilemapBufferToVram(0);
    SetFlyIconInvisibility(0xff, NUM_ICONS, true);
    SetDungeonIconInvisibility(0xff, NUM_ICONS, true);
    return true;
  }
  if (changedSelection) {
    BufferRegionMapBg(0, rm().layouts[m.currentSelection]);
    PrintTopBarTextRight(text("gText_RegionMap_AButtonOK"));
    CopyBgTilemapBufferToVram(0);
    CopyBgTilemapBufferToVram(3);
    SetFlyIconInvisibility(0xff, NUM_ICONS, true);
    SetDungeonIconInvisibility(0xff, NUM_ICONS, true);
    SetFlyIconInvisibility(m.currentSelection, NUM_ICONS, false);
    SetDungeonIconInvisibility(m.currentSelection, NUM_ICONS, false);
  }
  SetPlayerIconInvisibility(m.currentSelection !== GetRegionMapPlayerIsOn());
  SetGpuWindowDims(1, data);
  return false;
}

const SpriteCB_SwitchMapCursor: SpriteCallback = (sprite) => { sprite.y = sSwitchMapMenu!.highlight.top + 16; };

function CreateSwitchMapCursor(): boolean {
  const m = sSwitchMapMenu!;
  switch (m.cursorLoadState) {
    case 0: m.cursorSubsprite[0].tiles = incbin("sSwitchMapCursorLeft_Gfx"); break;
    case 1: m.cursorSubsprite[1].tiles = incbin("sSwitchMapCursorRight_Gfx"); break;
    case 2: CreateSwitchMapCursorSubsprite(0, 2, 2); CreateSwitchMapCursorSubsprite(1, 3, 3); break;
    default: return true;
  }
  m.cursorLoadState++;
  return false;
}

function spriteTemplate(tileTag: number, palTag: number, oam: string, anims: string | null, callback: SpriteCallback): SpriteTemplate {
  return {
    tileTag, paletteTag: palTag, oam: oamFrom(sym(oam)), anims: animsFrom(anims ? sym(anims) : 0), images: null,
    affineAnims: gDummySpriteAffineAnimTable, callback,
  };
}

function CreateSwitchMapCursorSubsprite(whichSprite: number, tileTag: number, palTag: number): void {
  const m = sSwitchMapMenu!;
  const sub = m.cursorSubsprite[whichSprite];
  sub.tileTag = tileTag;
  sub.palTag = palTag;
  LoadSpriteSheet({ data: sub.tiles, size: 0x400, tag: tileTag });
  LoadSpritePalette({ data: incbin("sSwitchMapCursor_Pal"), tag: palTag });
  const spriteId = CreateSprite(spriteTemplate(tileTag, palTag, "sOamData_SwitchMapCursor", "sAnims_SwitchMapCursor", SpriteCB_SwitchMapCursor),
    sub.x, 8 * (m.yOffset + 4 * m.currentSelection), 0);
  sub.sprite = gSprites[spriteId];
  sub.sprite.invisible = false;
}

function FreeSwitchMapCursor(): void {
  for (const sub of sSwitchMapMenu!.cursorSubsprite) {
    if (sub.sprite) {
      DestroySprite(sub.sprite);
      FreeSpriteTilesByTag(sub.tileTag);
      FreeSpritePaletteByTag(sub.palTag);
    }
  }
}

// ---------------------------------------------------------------- dungeon map preview

type DungeonMapInfo = { id: number; name: SymRef; desc: SymRef };

function GetDungeonFlavorText(mapsec: number): Uint8Array {
  const info = rd<DungeonMapInfo[]>("sDungeonInfo").find((d) => d.id === mapsec);
  return text(info ? symName(info.desc)! : "gText_RegionMap_NoData");
}

function GetDungeonName(mapsec: number): Uint8Array {
  const info = rd<DungeonMapInfo[]>("sDungeonInfo").find((d) => d.id === mapsec);
  return info ? Uint8Array.from(rd<number[]>(symName(info.name)!)) : text("gText_RegionMap_NoData");
}

function GetDungeonMapPreviewScreenInfo(mapsec: number): MapPreviewScreen | undefined {
  return cdata<MapPreviewScreen[]>("map_preview_screen", "sMapPreviewScreenData").find((s) => s.mapsec === mapsec);
}

function InitDungeonMapPreview(_unused: number, taskId: number, taskFunc: TaskFunc): void {
  let mapsec = GetDungeonMapsecUnderCursor();
  if (mapsec === C.MAPSEC_TANOBY_CHAMBERS) mapsec = C.MAPSEC_MONEAN_CHAMBER;
  const info = GetDungeonMapPreviewScreenInfo(mapsec) ?? GetDungeonMapPreviewScreenInfo(C.MAPSEC_ROCK_TUNNEL)!;
  sDungeonMapPreview = {
    tiles: new Uint8Array(0), tilemap: new Uint16Array(640), mapPreviewInfo: info, savedTask: taskFunc,
    mainState: 0, drawState: 0, loadState: 0, updateCounter: 0, timer: 0, palette: new Uint16Array(0x30),
    red: 0, green: 0, blue: 0, blendY: 0, left: 0, top: 0, right: 0, bottom: 0, leftIncrement: 0, topIncrement: 0, rightIncrement: 0, bottomIncrement: 0,
  };
  SaveRegionMapGpuRegs(0);
  ResetGpuRegs();
  ClearMapsecNameText();
  tasks.setFunc(taskId, Task_DungeonMapPreview);
}

function LoadMapPreviewGfx(): boolean {
  const p = sDungeonMapPreview!;
  switch (p.loadState) {
    case 0: p.tiles = incbin(symName(p.mapPreviewInfo.tilesptr)!); break;
    case 1: { const map = pal16(symName(p.mapPreviewInfo.tilemapptr)!); p.tilemap.set(map.subarray(0, 640)); break; }
    case 2: LoadBgTiles(2, p.tiles, p.tiles.length, 0); break;
    case 3: LoadPalette(pal16(symName(p.mapPreviewInfo.palptr)!), BG_PLTT_ID(13), 3 * 32); break;
    default: return true;
  }
  p.loadState++;
  return false;
}

function Task_DungeonMapPreview(taskId: number): void {
  const p = sDungeonMapPreview!;
  switch (p.mainState) {
    case 0: NullVBlankHBlankCallbacks(); p.mainState++; break;
    case 1: if (LoadMapPreviewGfx()) p.mainState++; break;
    case 2: InitScreenForDungeonMapPreview(); PrintTopBarTextRight(text("gText_RegionMap_AButtonCancel2")); p.mainState++; break;
    case 3: CopyMapPreviewTilemapToBgTilemapBuffer(2, p.tilemap); CopyBgTilemapBufferToVram(2); p.mainState++; break;
    case 4: ShowBg(2); p.mainState++; break;
    case 5: SetRegionMapVBlankCB(); p.mainState++; break;
    case 6: if (UpdateDungeonMapPreview(false)) p.mainState++; break;
    case 7: tasks.setFunc(taskId, Task_DrawDungeonMapPreviewFlavorText); break;
    case 8: if (UpdateDungeonMapPreview(true)) p.mainState++; break;
    case 9: FreeDungeonMapPreview(taskId); break;
  }
}

/** CopyMapPreviewTilemapToBgTilemapBuffer (region_map.c); C deliberately targets BG2. */
function CopyMapPreviewTilemapToBgTilemapBuffer(_bgId: number, tilemap: ArrayLike<number>): void {
  CopyToBgTilemapBufferRect(2, tilemap, 0, 0, 32, 20);
}

function Task_DrawDungeonMapPreviewFlavorText(taskId: number): void {
  const p = sDungeonMapPreview!;
  switch (p.drawState) {
    case 0: p.red = 0x0133; p.green = 0x0100; p.blue = 0x00f0; p.drawState++; break;
    case 1: if (p.timer++ > 40) { p.timer = 0; p.drawState++; } break;
    case 2:
      FillWindowPixelBuffer(WIN_MAP_PREVIEW, PIXEL_FILL(0));
      CopyWindowToVram(WIN_MAP_PREVIEW, COPYWIN_FULL);
      PutWindowTilemap(WIN_MAP_PREVIEW);
      p.drawState++;
      break;
    case 3:
      if (p.timer > 25) {
        AddTextPrinterParameterized3(WIN_MAP_PREVIEW, FONT_NORMAL, 4, 0, rd("sTextColor_Green"), -1, GetDungeonName(GetDungeonMapsecUnderCursor()));
        AddTextPrinterParameterized3(WIN_MAP_PREVIEW, FONT_NORMAL, 2, 14, rd("sTextColor_White"), -1, GetDungeonFlavorText(GetDungeonMapsecUnderCursor()));
        CopyWindowToVram(WIN_MAP_PREVIEW, COPYWIN_FULL);
        p.drawState++;
      } else if (p.timer > 20) {
        p.red = (p.red - 6) & 0xffff;
        p.green = (p.green - 5) & 0xffff;
        p.blue = (p.blue - 5) & 0xffff;
        p.palette.set(pal16(symName(p.mapPreviewInfo.palptr)!).subarray(0, 0x30));
        TintPalette_CustomTone(p.palette, 48, p.red, p.green, p.blue);
        LoadPalette(p.palette, BG_PLTT_ID(13), p.palette.length * 2);
      }
      p.timer++;
      break;
    case 4:
      if (joy.newKeys & (A_BUTTON | B_BUTTON)) {
        FillWindowPixelBuffer(WIN_MAP_PREVIEW, PIXEL_FILL(0));
        CopyWindowToVram(WIN_MAP_PREVIEW, COPYWIN_FULL);
        p.mainState++;
        p.drawState++;
      }
      break;
    default:
      tasks.setFunc(taskId, Task_DungeonMapPreview);
      break;
  }
}

function FreeDungeonMapPreview(taskId: number): void {
  tasks.setFunc(taskId, sDungeonMapPreview!.savedTask);
  HideBg(2);
  SetRegionMapGpuRegs(0);
  DisplayCurrentMapName();
  DisplayCurrentDungeonName();
  UpdateMapsecNameBox();
  DrawDungeonNameBox();
  PrintTopBarTextRight(text("gText_RegionMap_AButtonGuide"));
  sDungeonMapPreview = null;
}

function InitScreenForDungeonMapPreview(): void {
  const p = sDungeonMapPreview!;
  ResetGpuRegs();
  SetBldCnt(0, BLDCNT_TGT1_BG0 | BLDCNT_TGT1_OBJ, BLDCNT_EFFECT_DARKEN);
  SetBldY(p.blendY);
  SetWinIn(0, (WININ_WIN1_BG0 | WININ_WIN1_BG2 | WININ_WIN1_BG3) >> 8);
  SetWinOut(WINOUT_WIN01_BG0 | WINOUT_WIN01_BG1 | WINOUT_WIN01_BG3 | WINOUT_WIN01_OBJ | WINOUT_WIN01_CLR);
  SetDispCnt(1, false);
  const x = GetMapCursorX(), y = GetMapCursorY();
  p.left = 8 * x + 32;
  p.top = 8 * y + 24;
  p.right = p.left + 8;
  p.bottom = p.top + 8;
  // u16 fields: negative increments wrap, and the updates below wrap the same way.
  p.leftIncrement = Math.trunc((16 - p.left) / 8) & 0xffff;
  p.topIncrement = Math.trunc((32 - p.top) / 8) & 0xffff;
  p.rightIncrement = Math.trunc((224 - p.right) / 8) & 0xffff;
  p.bottomIncrement = Math.trunc((136 - p.bottom) / 8) & 0xffff;
}

function UpdateDungeonMapPreview(closing: boolean): boolean {
  const p = sDungeonMapPreview!;
  if (!closing) {
    if (p.updateCounter < 8) {
      p.left = (p.left + p.leftIncrement) & 0xffff;
      p.top = (p.top + p.topIncrement) & 0xffff;
      p.right = (p.right + p.rightIncrement) & 0xffff;
      p.bottom = (p.bottom + p.bottomIncrement) & 0xffff;
      p.updateCounter++;
      if (p.blendY < 6) p.blendY++;
    } else return true;
  } else {
    if (p.updateCounter === 0) return true;
    p.left = (p.left - p.leftIncrement) & 0xffff;
    p.top = (p.top - p.topIncrement) & 0xffff;
    p.right = (p.right - p.rightIncrement) & 0xffff;
    p.bottom = (p.bottom - p.bottomIncrement) & 0xffff;
    p.updateCounter--;
    if (p.blendY > 0) p.blendY--;
  }
  SetGpuWindowDims(1, { left: p.left, top: p.top, right: p.right, bottom: p.bottom });
  SetBldY(p.blendY);
  return false;
}

// ---------------------------------------------------------------- open / close animation

function CreateMapEdgeSprite(mapEdgeNum: number, tileTag: number, palTag: number): void {
  const edge = sMapOpenCloseAnim!.mapEdges[mapEdgeNum];
  edge.tileTag = tileTag;
  edge.palTag = palTag;
  LoadSpriteSheet({ data: edge.tiles, size: 0x400, tag: tileTag });
  LoadSpritePalette({ data: incbin("sMapEdge_Pal"), tag: palTag });
  const spriteId = CreateSprite(spriteTemplate(tileTag, palTag, "sOamData_MapEdge", "sAnims_MapEdge", SpriteCB_MapEdge), edge.x, edge.y, 0);
  edge.sprite = gSprites[spriteId];
  edge.sprite.invisible = true;
}

/** SpriteCB_MapEdge (region_map.c) is the original empty sprite callback. */
function SpriteCB_MapEdge(_sprite: Sprite): void {}

function InitMapOpenAnim(taskId: number, taskFunc: TaskFunc): void {
  sMapOpenCloseAnim = {
    mapEdges: Array.from({ length: NUM_MAP_EDGES }, (_, i) => ({
      tiles: new Uint8Array(0), sprite: null, x: 32 * Math.floor(i / 3) + 104, y: 64 * (i % 3) + 40, tileTag: 0, palTag: 0,
    })),
    tiles: new Uint8Array(0), tilemap: new Uint16Array(600), exitTask: taskFunc, openState: 0, loadGfxState: 0, moveState: 0, closeState: 0, blendY: 0,
  };
  SaveRegionMapGpuRegs(0);
  ResetGpuRegs();
  InitScreenForMapOpenAnim();
  SetBg0andBg3Hidden(true);
  tasks.setFunc(taskId, Task_MapOpenAnim);
}

function SetMapEdgeInvisibility(mapEdgeNum: number, invisible: boolean): void {
  const edges = sMapOpenCloseAnim!.mapEdges;
  if (mapEdgeNum === NUM_MAP_EDGES) { for (const e of edges) if (e.sprite) e.sprite.invisible = invisible; }
  else if (edges[mapEdgeNum].sprite) edges[mapEdgeNum].sprite!.invisible = invisible;
}

const MAP_EDGE_GFX = ["sMapEdge_TopLeft", "sMapEdge_MidLeft", "sMapEdge_BottomLeft", "sMapEdge_TopRight", "sMapEdge_MidRight", "sMapEdge_BottomRight"];

function LoadMapEdgeGfx(): boolean {
  const a = sMapOpenCloseAnim!;
  if (a.loadGfxState < NUM_MAP_EDGES) {
    a.mapEdges[a.loadGfxState].tiles = incbin(MAP_EDGE_GFX[a.loadGfxState]);
    CreateMapEdgeSprite(a.loadGfxState, 4 + a.loadGfxState, 4 + a.loadGfxState);
  } else {
    switch (a.loadGfxState) {
      case 6: a.tiles = incbin("sMapEdge_Gfx"); break;
      case 7: a.tilemap.set(pal16("sMapEdge_Tilemap").subarray(0, 600)); break;
      case 8: LoadBgTiles(1, a.tiles, Math.min(a.tiles.length, 0x800), 0); break;
      default: return true;
    }
  }
  a.loadGfxState++;
  return false;
}

function InitScreenForMapOpenAnim(): void {
  const e = sMapOpenCloseAnim!.mapEdges;
  SetBldCnt(0, BLDCNT_TGT1_BG1, BLDCNT_EFFECT_NONE);
  SetWinIn(WININ_WIN0_BG1 | WININ_WIN0_OBJ, 0);
  SetWinOut(WINOUT_WIN01_OBJ);
  SetGpuWindowDims(0, { left: e[MAPEDGE_TOP_LEFT].x + 8, top: 16, right: e[MAPEDGE_TOP_RIGHT].x - 8, bottom: 160 });
  SetDispCnt(0, false);
}

function SetGpuRegsToFadeMapToWhite(): void {
  const data = rd<GpuWindowParams>("sMapWindowDim");
  ResetGpuRegs();
  SetBldCnt(BLDCNT_TGT2_BG1 >> 8, BLDCNT_TGT1_BG0 | BLDCNT_TGT1_BG3 | BLDCNT_TGT1_BD, BLDCNT_EFFECT_LIGHTEN);
  SetBldY(sMapOpenCloseAnim!.blendY);
  SetWinIn(WININ_WIN0_ALL & ~WININ_WIN0_BG3, 0);
  SetWinOut(WINOUT_WIN01_BG1 | WINOUT_WIN01_OBJ);
  SetGpuWindowDims(0, data);
  SetDispCnt(0, false);
}

function FreeMapOpenCloseAnim(): void {
  if (!sMapOpenCloseAnim) return;
  FreeMapEdgeSprites();
  sMapOpenCloseAnim = null;
}

function FreeMapEdgeSprites(): void {
  for (const e of sMapOpenCloseAnim!.mapEdges) {
    if (!e.sprite) continue;
    e.x = e.sprite.x;
    e.y = e.sprite.y;
    DestroySprite(e.sprite);
    FreeSpriteTilesByTag(e.tileTag);
    FreeSpritePaletteByTag(e.palTag);
    e.sprite = null;
  }
}

function Task_MapOpenAnim(taskId: number): void {
  const a = sMapOpenCloseAnim!;
  switch (a.openState) {
    case 0: NullVBlankHBlankCallbacks(); a.openState++; break;
    case 1: if (LoadMapEdgeGfx()) a.openState++; break;
    case 2: CopyToBgTilemapBufferRect(1, a.tilemap, 0, 0, 30, 20); a.openState++; break;
    case 3:
      CopyBgTilemapBufferToVram(1);
      BlendPalettes(PALETTES_ALL, 16, RGB_BLACK);
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
      SetRegionMapVBlankCB();
      a.openState++;
      break;
    case 4:
      ShowBg(0); ShowBg(3); ShowBg(1);
      SetMapEdgeInvisibility(NUM_MAP_EDGES, false);
      SetGpuWindowDimsToMapEdges();
      a.openState++;
      break;
    case 5: if (!gPaletteFade.active) { a.openState++; sound.playSE(C.SE_CARD_OPEN); } break;
    case 6: if (MoveMapEdgesOutward()) a.openState++; break;
    case 7: SetPlayerIconInvisibility(false); SetMapCursorInvisibility(false); a.openState++; break;
    case 8:
      a.blendY = 15;
      SetGpuRegsToFadeMapToWhite();
      SetBg0andBg3Hidden(false);
      SetFlyIconInvisibility(GetSelectedRegionMap(), NUM_ICONS, false);
      SetDungeonIconInvisibility(GetSelectedRegionMap(), NUM_ICONS, false);
      a.openState++;
      break;
    case 9:
      PrintTopBarTextLeft(text("gText_RegionMap_DPadMove"));
      PrintTopBarTextRight(text(GetSelectedMapsecType(LAYER_DUNGEON) !== MAPSECTYPE_VISITED ? "gText_RegionMap_Space" : "gText_RegionMap_AButtonGuide"));
      ClearOrDrawTopBar(false);
      a.openState++;
      break;
    case 10: {
      const white = pal16("sTopBar_Pal").subarray(15, 16);
      for (let i = 0; i < 5; i++) LoadPalette(white, BG_PLTT_ID(i), 2);
      a.openState++;
      break;
    }
    case 11:
      FillBgTilemapBufferRect(1, 0x002, 0, 1, 1, 1, 2);
      FillBgTilemapBufferRect(1, 0x003, 1, 1, 1, 1, 2);
      FillBgTilemapBufferRect(1, 0x03e, 28, 1, 1, 1, 2);
      FillBgTilemapBufferRect(1, 0x03f, 29, 1, 1, 1, 2);
      FillBgTilemapBufferRect(1, 0x03d, 2, 1, 26, 1, 2);
      CopyBgTilemapBufferToVram(1);
      sound.stopSE(C.SE_CARD_OPEN);
      sound.playSE(C.SE_ROTATING_GATE);
      a.openState++;
      break;
    case 12:
      if (a.blendY === 2) { SetMapEdgeInvisibility(NUM_MAP_EDGES, true); a.openState++; SetBldY(0); }
      else { a.blendY--; SetBldY(a.blendY); }
      break;
    case 13: SetRegionMapGpuRegs(0); DisplayCurrentDungeonName(); a.openState++; break;
    default: FreeMapEdgeSprites(); FinishMapOpenAnim(taskId); break;
  }
}

/** FinishMapOpenAnim (region_map.c). */
function FinishMapOpenAnim(taskId: number): void { tasks.setFunc(taskId, sMapOpenCloseAnim!.exitTask); }

function moveEdges(delta: number): void {
  const e = sMapOpenCloseAnim!.mapEdges;
  for (let i = 0; i < NUM_MAP_EDGES; i++) e[i].sprite!.x += i < 3 ? -delta : delta;
}

function edgeStep(moveState: number): number {
  if (moveState > 17) return 1;
  if (moveState > 14) return 2;
  if (moveState > 10) return 3;
  if (moveState > 6) return 5;
  return 8;
}

function MoveMapEdgesOutward(): boolean {
  const a = sMapOpenCloseAnim!;
  SetGpuWindowDimsToMapEdges();
  if (a.mapEdges[MAPEDGE_TOP_LEFT].sprite!.x === 0) return true;
  moveEdges(edgeStep(a.moveState));
  a.moveState++;
  return false;
}

function SetGpuWindowDimsToMapEdges(): void {
  const e = sMapOpenCloseAnim!.mapEdges;
  SetGpuWindowDims(0, { left: e[MAPEDGE_TOP_LEFT].sprite!.x, top: 16, right: e[MAPEDGE_TOP_RIGHT].sprite!.x, bottom: 160 });
}

function InitScreenForMapCloseAnim(): void {
  const e = sMapOpenCloseAnim!.mapEdges;
  SetBldCnt(0, BLDCNT_TGT1_BG1, BLDCNT_EFFECT_NONE);
  SetWinIn(WININ_WIN0_BG1 | WININ_WIN0_OBJ, 0);
  SetWinOut(WINOUT_WIN01_OBJ);
  SetGpuWindowDims(0, { left: e[MAPEDGE_TOP_LEFT].x + 16, top: 16, right: e[MAPEDGE_TOP_RIGHT].x - 16, bottom: 160 });
  SetDispCnt(0, false);
}

function DoMapCloseAnim(taskId: number): void {
  tasks.setFunc(taskId, Task_MapCloseAnim);
}

function CreateMapEdgeSprites(): void {
  for (let i = 0; i < NUM_MAP_EDGES; i++) CreateMapEdgeSprite(i, 4 + i, 4 + i);
}

function Task_MapCloseAnim(taskId: number): void {
  const a = sMapOpenCloseAnim!;
  switch (a.closeState) {
    case 0:
      ClearOrDrawTopBar(true);
      CopyWindowToVram(WIN_TOPBAR_LEFT, COPYWIN_FULL);
      CopyWindowToVram(WIN_TOPBAR_RIGHT, COPYWIN_FULL);
      a.closeState++;
      break;
    case 1: CreateMapEdgeSprites(); a.closeState++; break;
    case 2: { const p = pal16("sRegionMap_Pal"); LoadPalette(p, BG_PLTT_ID(0), p.length * 2); a.closeState++; break; }
    case 3:
      SetMapEdgeInvisibility(NUM_MAP_EDGES, false);
      SetPlayerIconInvisibility(true);
      SetMapCursorInvisibility(true);
      SetDungeonIconInvisibility(0xff, NUM_ICONS, true);
      SetFlyIconInvisibility(0xff, NUM_ICONS, true);
      a.moveState = 0;
      a.blendY = 0;
      a.closeState++;
      break;
    case 4: SetGpuRegsToFadeMapToWhite(); a.closeState++; break;
    case 5:
      if (a.blendY === 15) { SetBldY(a.blendY); a.closeState++; }
      else { a.blendY++; SetBldY(a.blendY); }
      break;
    case 6:
      InitScreenForMapCloseAnim();
      SetGpuWindowDimsToMapEdges();
      sound.playSE(C.SE_CARD_FLIPPING);
      a.closeState++;
      break;
    case 7: if (MoveMapEdgesInward()) a.closeState++; break;
    default: tasks.setFunc(taskId, a.exitTask); break;
  }
}

function MoveMapEdgesInward(): boolean {
  const a = sMapOpenCloseAnim!;
  SetGpuWindowDimsToMapEdges();
  if (a.mapEdges[MAPEDGE_TOP_LEFT].sprite!.x === 104) return true;
  moveEdges(-edgeStep(a.moveState));
  a.moveState++;
  return false;
}

// ---------------------------------------------------------------- cursor

const SpriteCB_MapCursor: SpriteCallback = (sprite) => {
  const c = cursor();
  if (c.moveCounter !== 0) {
    sprite.x += c.horizontalMove;
    sprite.y += c.verticalMove;
    c.moveCounter--;
  } else {
    c.sprite!.x = 8 * c.x + 36;
    c.sprite!.y = 8 * c.y + 36;
  }
};

function CreateMapCursor(tileTag: number, palTag: number): void {
  sMapCursor = {
    x: 0, y: 0, spriteX: 0, spriteY: 0, horizontalMove: 0, verticalMove: 0, moveCounter: 0, snapId: 0, inputHandler: HandleRegionMapInput,
    selectedMapsec: 0, selectedMapsecType: 0, selectedDungeonType: 0, sprite: null, tileTag, palTag, tiles: incbin("sMapCursor_Gfx"),
  };
  const c = sMapCursor;
  GetPlayerPositionOnRegionMap_HandleOverrides();
  c.spriteX = 8 * c.x + 36;
  c.spriteY = 8 * c.y + 36;
  c.inputHandler = HandleRegionMapInput;
  c.selectedMapsecType = GetMapsecType(c.selectedMapsec);
  c.selectedDungeonType = GetDungeonMapsecType(GetSelectedMapSection(GetSelectedRegionMap(), LAYER_DUNGEON, c.y, c.x));
  CreateMapCursorSprite();
}

function CreateMapCursorSprite(): void {
  const c = cursor();
  LoadSpriteSheet({ data: c.tiles, size: 0x100, tag: c.tileTag });
  LoadSpritePalette({ data: incbin("sMapCursor_Pal"), tag: c.palTag });
  const spriteId = CreateSprite(spriteTemplate(c.tileTag, c.palTag, "sOamData_MapCursor", "sAnims_MapCursor", SpriteCB_MapCursor), c.spriteX, c.spriteY, 0);
  c.sprite = gSprites[spriteId];
  SetMapCursorInvisibility(true);
}

function SetMapCursorInvisibility(invisible: boolean): void { cursor().sprite!.invisible = invisible; }
function ResetCursorSnap(): void { cursor().snapId = 0; }

function FreeMapCursor(): void {
  const c = sMapCursor;
  if (c?.sprite) {
    DestroySprite(c.sprite);
    FreeSpriteTilesByTag(c.tileTag);
    FreeSpritePaletteByTag(c.palTag);
  }
  sMapCursor = null;
}

function updateSelection(): void {
  const c = cursor();
  c.selectedMapsec = GetSelectedMapSection(GetSelectedRegionMap(), LAYER_MAP, c.y, c.x);
  c.selectedMapsecType = GetMapsecType(c.selectedMapsec);
  c.selectedDungeonType = GetDungeonMapsecType(GetSelectedMapSection(GetSelectedRegionMap(), LAYER_DUNGEON, c.y, c.x));
}

function HandleRegionMapInput(): number {
  const c = cursor();
  let input = MAP_INPUT_NONE;
  c.horizontalMove = 0;
  c.verticalMove = 0;
  if (joy.held & DPAD_UP && c.y > 0) { c.verticalMove = -2; input = MAP_INPUT_MOVE_START; }
  if (joy.held & DPAD_DOWN && c.y < MAP_HEIGHT - 1) { c.verticalMove = 2; input = MAP_INPUT_MOVE_START; }
  if (joy.held & DPAD_RIGHT && c.x < MAP_WIDTH - 1) { c.horizontalMove = 2; input = MAP_INPUT_MOVE_START; }
  if (joy.held & DPAD_LEFT && c.x > 0) { c.horizontalMove = -2; input = MAP_INPUT_MOVE_START; }
  if (joy.newKeys & A_BUTTON) {
    input = MAP_INPUT_A_BUTTON;
    if (c.x === CANCEL_BUTTON_X && c.y === CANCEL_BUTTON_Y) { sound.playSE(C.SE_M_HYPER_BEAM2); input = MAP_INPUT_CANCEL; }
    if (c.x === SWITCH_BUTTON_X && c.y === SWITCH_BUTTON_Y && GetRegionMapPermission(MAPPERM_HAS_SWITCH_BUTTON)) { sound.playSE(C.SE_M_HYPER_BEAM2); input = MAP_INPUT_SWITCH; }
  } else if (!(joy.newKeys & B_BUTTON)) {
    if (joy.repeated & START_BUTTON) {
      SnapToIconOrButton();
      updateSelection();
      return MAP_INPUT_MOVE_END;
    } else if (joy.newKeys & SELECT_BUTTON && rm().selectCloses) {
      input = MAP_INPUT_CANCEL;
    }
  } else {
    input = MAP_INPUT_CANCEL;
  }
  if (input === MAP_INPUT_MOVE_START) {
    c.moveCounter = 4;
    c.inputHandler = MoveMapCursor;
  }
  return input;
}

function MoveMapCursor(): number {
  const c = cursor();
  if (c.moveCounter !== 0) return MAP_INPUT_MOVE_CONT;
  if (c.horizontalMove > 0) c.x++;
  if (c.horizontalMove < 0) c.x--;
  if (c.verticalMove > 0) c.y++;
  if (c.verticalMove < 0) c.y--;
  updateSelection();
  c.inputHandler = HandleRegionMapInput;
  return MAP_INPUT_MOVE_END;
}

function GetRegionMapInput(): number { return cursor().inputHandler(); }

function SnapToIconOrButton(): void {
  const c = cursor();
  if (GetRegionMapPermission(MAPPERM_HAS_SWITCH_BUTTON)) {
    c.snapId = (c.snapId + 1) % 3;
    if (c.snapId === 0 && GetSelectedRegionMap() !== GetRegionMapPlayerIsOn()) c.snapId++;
    switch (c.snapId) {
      case 1: c.x = SWITCH_BUTTON_X; c.y = SWITCH_BUTTON_Y; break;
      case 2: c.y = CANCEL_BUTTON_Y; c.x = CANCEL_BUTTON_X; break;
      default: c.x = GetPlayerIconX(); c.y = GetPlayerIconY(); break;
    }
  } else {
    c.snapId = (c.snapId + 1) % 2;
    if (c.snapId === 1) { c.y = CANCEL_BUTTON_Y; c.x = CANCEL_BUTTON_X; }
    else { c.x = GetPlayerIconX(); c.y = GetPlayerIconY(); }
  }
  c.sprite!.x = 8 * c.x + 36;
  c.sprite!.y = 8 * c.y + 36;
  c.selectedMapsec = GetSelectedMapSection(GetSelectedRegionMap(), LAYER_MAP, c.y, c.x);
}

function GetMapCursorX(): number { return cursor().x; }
function GetMapCursorY(): number { return cursor().y; }

function GetMapsecUnderCursor(): number {
  const c = sMapCursor;
  if (!c || c.y < 0 || c.y >= MAP_HEIGHT || c.x < 0 || c.x >= MAP_WIDTH) return C.MAPSEC_NONE;
  let mapsec = GetSelectedMapSection(GetSelectedRegionMap(), LAYER_MAP, c.y, c.x);
  if ((mapsec === C.MAPSEC_NAVEL_ROCK || mapsec === C.MAPSEC_BIRTH_ISLAND) && !flagGet(C.FLAG_WORLD_MAP_NAVEL_ROCK_EXTERIOR)) mapsec = C.MAPSEC_NONE;
  return mapsec;
}

function GetDungeonMapsecUnderCursor(): number {
  const c = sMapCursor;
  if (!c || c.y < 0 || c.y >= MAP_HEIGHT || c.x < 0 || c.x >= MAP_WIDTH) return C.MAPSEC_NONE;
  let mapsec = GetSelectedMapSection(GetSelectedRegionMap(), LAYER_DUNGEON, c.y, c.x);
  if (mapsec === C.MAPSEC_CERULEAN_CAVE && !flagGet(C.FLAG_SYS_CAN_LINK_WITH_RS)) mapsec = C.MAPSEC_NONE;
  return mapsec;
}

// GetMapsecType / GetDungeonMapsecType: the visited flag of each town and dungeon.
const TOWN_FLAGS: Array<[string, string]> = [
  ["MAPSEC_PALLET_TOWN", "FLAG_WORLD_MAP_PALLET_TOWN"], ["MAPSEC_VIRIDIAN_CITY", "FLAG_WORLD_MAP_VIRIDIAN_CITY"],
  ["MAPSEC_PEWTER_CITY", "FLAG_WORLD_MAP_PEWTER_CITY"], ["MAPSEC_CERULEAN_CITY", "FLAG_WORLD_MAP_CERULEAN_CITY"],
  ["MAPSEC_LAVENDER_TOWN", "FLAG_WORLD_MAP_LAVENDER_TOWN"], ["MAPSEC_VERMILION_CITY", "FLAG_WORLD_MAP_VERMILION_CITY"],
  ["MAPSEC_CELADON_CITY", "FLAG_WORLD_MAP_CELADON_CITY"], ["MAPSEC_FUCHSIA_CITY", "FLAG_WORLD_MAP_FUCHSIA_CITY"],
  ["MAPSEC_CINNABAR_ISLAND", "FLAG_WORLD_MAP_CINNABAR_ISLAND"], ["MAPSEC_INDIGO_PLATEAU", "FLAG_WORLD_MAP_INDIGO_PLATEAU_EXTERIOR"],
  ["MAPSEC_SAFFRON_CITY", "FLAG_WORLD_MAP_SAFFRON_CITY"], ["MAPSEC_ONE_ISLAND", "FLAG_WORLD_MAP_ONE_ISLAND"],
  ["MAPSEC_TWO_ISLAND", "FLAG_WORLD_MAP_TWO_ISLAND"], ["MAPSEC_THREE_ISLAND", "FLAG_WORLD_MAP_THREE_ISLAND"],
  ["MAPSEC_FOUR_ISLAND", "FLAG_WORLD_MAP_FOUR_ISLAND"], ["MAPSEC_FIVE_ISLAND", "FLAG_WORLD_MAP_FIVE_ISLAND"],
  ["MAPSEC_SEVEN_ISLAND", "FLAG_WORLD_MAP_SEVEN_ISLAND"], ["MAPSEC_SIX_ISLAND", "FLAG_WORLD_MAP_SIX_ISLAND"],
  ["MAPSEC_ROUTE_10_POKECENTER", "FLAG_WORLD_MAP_ROUTE10_POKEMON_CENTER_1F"],
];
const DUNGEON_FLAGS: Array<[string, string]> = [
  ["MAPSEC_VIRIDIAN_FOREST", "FLAG_WORLD_MAP_VIRIDIAN_FOREST"], ["MAPSEC_MT_MOON", "FLAG_WORLD_MAP_MT_MOON_1F"],
  ["MAPSEC_S_S_ANNE", "FLAG_WORLD_MAP_SSANNE_EXTERIOR"], ["MAPSEC_UNDERGROUND_PATH", "FLAG_WORLD_MAP_UNDERGROUND_PATH_NORTH_SOUTH_TUNNEL"],
  ["MAPSEC_UNDERGROUND_PATH_2", "FLAG_WORLD_MAP_UNDERGROUND_PATH_EAST_WEST_TUNNEL"], ["MAPSEC_DIGLETTS_CAVE", "FLAG_WORLD_MAP_DIGLETTS_CAVE_B1F"],
  ["MAPSEC_KANTO_VICTORY_ROAD", "FLAG_WORLD_MAP_VICTORY_ROAD_1F"], ["MAPSEC_ROCKET_HIDEOUT", "FLAG_WORLD_MAP_ROCKET_HIDEOUT_B1F"],
  ["MAPSEC_SILPH_CO", "FLAG_WORLD_MAP_SILPH_CO_1F"], ["MAPSEC_POKEMON_MANSION", "FLAG_WORLD_MAP_POKEMON_MANSION_1F"],
  ["MAPSEC_KANTO_SAFARI_ZONE", "FLAG_WORLD_MAP_SAFARI_ZONE_CENTER"], ["MAPSEC_POKEMON_LEAGUE", "FLAG_WORLD_MAP_POKEMON_LEAGUE_LORELEIS_ROOM"],
  ["MAPSEC_ROCK_TUNNEL", "FLAG_WORLD_MAP_ROCK_TUNNEL_1F"], ["MAPSEC_SEAFOAM_ISLANDS", "FLAG_WORLD_MAP_SEAFOAM_ISLANDS_1F"],
  ["MAPSEC_POKEMON_TOWER", "FLAG_WORLD_MAP_POKEMON_TOWER_1F"], ["MAPSEC_CERULEAN_CAVE", "FLAG_WORLD_MAP_CERULEAN_CAVE_1F"],
  ["MAPSEC_POWER_PLANT", "FLAG_WORLD_MAP_POWER_PLANT"], ["MAPSEC_NAVEL_ROCK", "FLAG_WORLD_MAP_NAVEL_ROCK_EXTERIOR"],
  ["MAPSEC_MT_EMBER", "FLAG_WORLD_MAP_MT_EMBER_EXTERIOR"], ["MAPSEC_BERRY_FOREST", "FLAG_WORLD_MAP_THREE_ISLAND_BERRY_FOREST"],
  ["MAPSEC_ICEFALL_CAVE", "FLAG_WORLD_MAP_FOUR_ISLAND_ICEFALL_CAVE_ENTRANCE"], ["MAPSEC_ROCKET_WAREHOUSE", "FLAG_WORLD_MAP_FIVE_ISLAND_ROCKET_WAREHOUSE"],
  ["MAPSEC_TRAINER_TOWER_2", "FLAG_WORLD_MAP_TRAINER_TOWER_LOBBY"], ["MAPSEC_DOTTED_HOLE", "FLAG_WORLD_MAP_SIX_ISLAND_DOTTED_HOLE_1F"],
  ["MAPSEC_LOST_CAVE", "FLAG_WORLD_MAP_FIVE_ISLAND_LOST_CAVE_ENTRANCE"], ["MAPSEC_PATTERN_BUSH", "FLAG_WORLD_MAP_SIX_ISLAND_PATTERN_BUSH"],
  ["MAPSEC_ALTERING_CAVE", "FLAG_WORLD_MAP_SIX_ISLAND_ALTERING_CAVE"], ["MAPSEC_TANOBY_CHAMBERS", "FLAG_WORLD_MAP_SEVEN_ISLAND_TANOBY_RUINS_MONEAN_CHAMBER"],
  ["MAPSEC_THREE_ISLE_PATH", "FLAG_WORLD_MAP_THREE_ISLAND_DUNSPARCE_TUNNEL"], ["MAPSEC_TANOBY_KEY", "FLAG_WORLD_MAP_SEVEN_ISLAND_SEVAULT_CANYON_TANOBY_KEY"],
  ["MAPSEC_BIRTH_ISLAND", "FLAG_WORLD_MAP_BIRTH_ISLAND_EXTERIOR"],
];
let townFlags: Map<number, number> | null = null;
let dungeonFlags: Map<number, number> | null = null;
const flagTable = (pairs: Array<[string, string]>): Map<number, number> => new Map(pairs.map(([s, f]) => [rom.c(s), rom.c(f)]));

function GetMapsecType(mapsec: number): number {
  townFlags ??= flagTable(TOWN_FLAGS);
  if (mapsec === C.MAPSEC_ROUTE_4_POKECENTER) {
    if (!GetRegionMapPermission(MAPPERM_HAS_FLY_DESTINATIONS)) return MAPSECTYPE_NONE;
    return flagGet(C.FLAG_WORLD_MAP_ROUTE4_POKEMON_CENTER_1F) ? MAPSECTYPE_VISITED : MAPSECTYPE_NOT_VISITED;
  }
  const flag = townFlags.get(mapsec);
  if (flag !== undefined) return flagGet(flag) ? MAPSECTYPE_VISITED : MAPSECTYPE_NOT_VISITED;
  return mapsec === C.MAPSEC_NONE ? MAPSECTYPE_NONE : MAPSECTYPE_ROUTE;
}

function GetDungeonMapsecType(mapsec: number): number {
  dungeonFlags ??= flagTable(DUNGEON_FLAGS);
  if (mapsec === C.MAPSEC_NONE) return MAPSECTYPE_NONE;
  const flag = dungeonFlags.get(mapsec);
  if (flag !== undefined) return flagGet(flag) ? MAPSECTYPE_VISITED : MAPSECTYPE_NOT_VISITED;
  return MAPSECTYPE_ROUTE;
}

function GetSelectedMapsecType(layer: number): number {
  return layer === LAYER_DUNGEON ? cursor().selectedDungeonType : cursor().selectedMapsecType;
}

// ---------------------------------------------------------------- player position

function headerOfWarp(w: WarpData): MapHeader | undefined {
  const id = rom.mapIdByNum((w.mapGroup << 8) | w.mapNum);
  return id ? rom.cachedMap(id) : undefined;
}

function layoutSize(header: MapHeader | undefined): { width: number; height: number } {
  const layout = header ? rom.cachedLayout(header.layout) : undefined;
  return { width: layout?.width ?? 1, height: layout?.height ?? 1 };
}

function GetPlayerCurrentMapSectionId(): number {
  return headerOfWarp(save.location)?.regionMapSection ?? sGame!.overworld.header.regionMapSection;
}

function GetPlayerPositionOnRegionMap(): void {
  const c = cursor();
  const ow = sGame!.overworld;
  const current = ow.header;
  let size: { width: number; height: number };
  let x: number, y: number;
  switch (current.mapType) {
    case C.MAP_TYPE_UNDERGROUND:
    case C.MAP_TYPE_UNKNOWN: {
      const header = headerOfWarp(save.escapeWarp);
      c.selectedMapsec = header?.regionMapSection ?? current.regionMapSection;
      size = layoutSize(header);
      x = save.escapeWarp.x; y = save.escapeWarp.y;
      break;
    }
    case C.MAP_TYPE_SECRET_BASE: {
      const header = headerOfWarp(save.dynamicWarp);
      c.selectedMapsec = header?.regionMapSection ?? current.regionMapSection;
      size = layoutSize(header);
      x = save.dynamicWarp.x; y = save.dynamicWarp.y;
      break;
    }
    case C.MAP_TYPE_INDOOR: {
      let warp: WarpData;
      if ((c.selectedMapsec = current.regionMapSection) !== C.MAPSEC_SPECIAL_AREA) {
        warp = save.escapeWarp;
      } else {
        warp = save.dynamicWarp;
        c.selectedMapsec = headerOfWarp(warp)?.regionMapSection ?? current.regionMapSection;
      }
      size = layoutSize(headerOfWarp(warp));
      x = warp.x; y = warp.y;
      break;
    }
    default: {
      c.selectedMapsec = current.regionMapSection;
      size = layoutSize(current);
      const pos = ow.player.object.currentCoords;
      x = pos.x - 7; y = pos.y - 7;
      break;
    }
  }
  const idx = c.selectedMapsec - C.KANTO_MAPSEC_START;
  const dims = rd<number[][]>("sMapSectionDimensions")[idx] ?? [1, 1];
  const corners = rd<number[][]>("sMapSectionTopLeftCorners")[idx] ?? [0, 0];
  x &= 0xffff; y &= 0xffff;
  let divisor = Math.floor(size.width / dims[0]) || 1;
  x = Math.floor(x / divisor);
  if (x >= dims[0]) x = dims[0] - 1;
  divisor = Math.floor(size.height / dims[1]) || 1;
  y = Math.floor(y / divisor);
  if (y >= dims[1]) y = dims[1] - 1;
  c.x = x + corners[0];
  c.y = y + corners[1];
}

function GetPlayerPositionOnRegionMap_HandleOverrides(): void {
  const c = cursor();
  const mapNum = save.location.mapNum;
  const num = (id: number): number => id & 0xff;
  const set = (x: number, y: number): void => { c.x = x; c.y = y; };
  switch (GetPlayerCurrentMapSectionId()) {
    case C.MAPSEC_KANTO_SAFARI_ZONE: set(12, 12); break;
    case C.MAPSEC_SILPH_CO: set(14, 6); break;
    case C.MAPSEC_POKEMON_MANSION: set(4, 14); break;
    case C.MAPSEC_POKEMON_TOWER: set(18, 6); break;
    case C.MAPSEC_POWER_PLANT: set(18, 4); break;
    case C.MAPSEC_S_S_ANNE: set(14, 9); break;
    case C.MAPSEC_POKEMON_LEAGUE: set(2, 3); break;
    case C.MAPSEC_ROCKET_HIDEOUT: set(11, 6); break;
    case C.MAPSEC_UNDERGROUND_PATH: set(14, mapNum === num(C.MAP_UNDERGROUND_PATH_NORTH_ENTRANCE) ? 5 : 7); break;
    case C.MAPSEC_UNDERGROUND_PATH_2: set(mapNum === num(C.MAP_UNDERGROUND_PATH_EAST_ENTRANCE) ? 15 : 12, 6); break;
    case C.MAPSEC_BIRTH_ISLAND: set(18, 13); break;
    case C.MAPSEC_NAVEL_ROCK: set(10, 8); break;
    case C.MAPSEC_TRAINER_TOWER_2: set(5, 6); break;
    case C.MAPSEC_MT_EMBER: set(2, 3); break;
    case C.MAPSEC_BERRY_FOREST: set(14, 12); break;
    case C.MAPSEC_PATTERN_BUSH: set(17, 3); break;
    case C.MAPSEC_ROCKET_WAREHOUSE: set(17, 11); break;
    case C.MAPSEC_DILFORD_CHAMBER:
    case C.MAPSEC_LIPTOO_CHAMBER:
    case C.MAPSEC_MONEAN_CHAMBER:
    case C.MAPSEC_RIXY_CHAMBER:
    case C.MAPSEC_SCUFIB_CHAMBER:
    case C.MAPSEC_TANOBY_CHAMBERS:
    case C.MAPSEC_VIAPOIS_CHAMBER:
    case C.MAPSEC_WEEPTH_CHAMBER: set(9, 12); break;
    case C.MAPSEC_DOTTED_HOLE: set(16, 8); break;
    case C.MAPSEC_VIRIDIAN_FOREST: set(4, 6); break;
    case C.MAPSEC_ROUTE_2:
      if (mapNum === num(C.MAP_PALLET_TOWN)) set(4, 7);
      else if (mapNum === num(C.MAP_CERULEAN_CITY)) set(4, 5);
      else GetPlayerPositionOnRegionMap();
      break;
    case C.MAPSEC_ROUTE_21:
      if (mapNum === num(C.MAP_ROUTE21_NORTH)) set(4, 12);
      else if (mapNum === num(C.MAP_ROUTE21_SOUTH)) set(4, 13);
      break;
    case C.MAPSEC_ROUTE_5:
      if (mapNum === num(C.MAP_VIRIDIAN_CITY)) set(14, 5); else GetPlayerPositionOnRegionMap();
      break;
    case C.MAPSEC_ROUTE_6:
      if (mapNum === num(C.MAP_PALLET_TOWN)) set(14, 7); else GetPlayerPositionOnRegionMap();
      break;
    case C.MAPSEC_ROUTE_7:
      if (mapNum === num(C.MAP_PALLET_TOWN)) set(13, 6); else GetPlayerPositionOnRegionMap();
      break;
    case C.MAPSEC_ROUTE_8:
      if (mapNum === num(C.MAP_PALLET_TOWN)) set(15, 6); else GetPlayerPositionOnRegionMap();
      break;
    default: GetPlayerPositionOnRegionMap(); break;
  }
  c.selectedMapsec = GetSelectedMapSection(GetSelectedRegionMap(), LAYER_MAP, c.y, c.x);
}

const SECTION_TABLES = ["sRegionMapSections_Kanto", "sRegionMapSections_Sevii123", "sRegionMapSections_Sevii45", "sRegionMapSections_Sevii67"];

function GetSelectedMapSection(whichMap: number, layer: number, y: number, x: number): number {
  const table = SECTION_TABLES[whichMap];
  if (!table) return C.MAPSEC_NONE;
  return rd<number[][][]>(table)[layer]?.[y]?.[x] ?? C.MAPSEC_NONE;
}

// ---------------------------------------------------------------- player icon

function CreatePlayerIcon(tileTag: number, palTag: number): void {
  const female = save.playerGender === C.FEMALE;
  sPlayerIcon = { x: GetMapCursorX(), y: GetMapCursorY(), sprite: null, tileTag, palTag, tiles: incbin(female ? "sPlayerIcon_Leaf" : "sPlayerIcon_Red") };
  CreatePlayerIconSprite();
}

function CreatePlayerIconSprite(): void {
  const p = sPlayerIcon!;
  LoadSpriteSheet({ data: p.tiles, size: 0x80, tag: p.tileTag });
  LoadSpritePalette({ data: incbin(save.playerGender === C.FEMALE ? "sPlayerIcon_LeafPal" : "sPlayerIcon_RedPal"), tag: p.palTag });
  const spriteId = CreateSprite(spriteTemplate(p.tileTag, p.palTag, "sOamData_PlayerIcon", "sAnims_PlayerIcon", SpriteCallbackDummy), 8 * p.x + 36, 8 * p.y + 36, 2);
  p.sprite = gSprites[spriteId];
  SetPlayerIconInvisibility(true);
}

function SetPlayerIconInvisibility(invisible: boolean): void { sPlayerIcon!.sprite!.invisible = invisible; }

function FreePlayerIcon(): void {
  const p = sPlayerIcon;
  if (p?.sprite) {
    DestroySprite(p.sprite);
    FreeSpriteTilesByTag(p.tileTag);
    FreeSpritePaletteByTag(p.palTag);
  }
  sPlayerIcon = null;
}

function GetPlayerIconX(): number { return sPlayerIcon!.x; }
function GetPlayerIconY(): number { return sPlayerIcon!.y; }

// ---------------------------------------------------------------- map icons

function InitMapIcons(_whichMap: number, taskId: number, taskFunc: TaskFunc): void {
  const blank = (): MapIconSprite => ({ region: 0, sprite: null, tileTag: 0, palTag: 0 });
  sMapIcons = {
    dungeonIconTiles: incbin("sDungeonIcon"), flyIconTiles: incbin("sFlyIcon"),
    dungeonIcons: Array.from({ length: NUM_ICONS }, blank), flyIcons: Array.from({ length: NUM_ICONS }, blank), state: 0, exitTask: taskFunc,
  };
  tasks.setFunc(taskId, LoadMapIcons);
}

function LoadMapIcons(taskId: number): void {
  const m = sMapIcons!;
  switch (m.state) {
    case 0: NullVBlankHBlankCallbacks(); m.state++; break;
    case 1: CreateDungeonIcons(); m.state++; break;
    case 2: CreateFlyIcons(); m.state++; break;
    case 3: BlendPalettes(PALETTES_ALL, 16, RGB_BLACK); BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK); m.state++; break;
    case 4: SetRegionMapVBlankCB(); m.state++; break;
    default:
      SetGpuReg(REG_OFFSET_DISPCNT, GetGpuReg(REG_OFFSET_DISPCNT) | DISPCNT_OBJ_ON);
      FinishMapIconLoad(taskId);
      break;
  }
}

/** FinishMapIconLoad (region_map.c). */
function FinishMapIconLoad(taskId: number): void { tasks.setFunc(taskId, sMapIcons!.exitTask); }

function CreateFlyIconSprite(whichMap: number, numIcons: number, x: number, y: number, tileTag: number, palTag: number): void {
  const m = sMapIcons!;
  LoadSpriteSheet({ data: m.flyIconTiles, size: 0x100, tag: tileTag });
  LoadSpritePalette({ data: incbin("sMiscIcon_Pal"), tag: palTag });
  const spriteId = CreateSprite(spriteTemplate(tileTag, palTag, "sOamData_FlyIcon", "sAnims_FlyIcon", SpriteCallbackDummy), 8 * x + 36, 8 * y + 36, 1);
  const icon = m.flyIcons[numIcons];
  icon.sprite = gSprites[spriteId];
  icon.sprite.invisible = true;
  icon.region = whichMap;
  icon.tileTag = tileTag;
  icon.palTag = palTag;
}

function CreateDungeonIconSprite(whichMap: number, numIcons: number, x: number, y: number, tileTag: number, palTag: number): void {
  const m = sMapIcons!;
  LoadSpriteSheet({ data: m.dungeonIconTiles, size: 0x40, tag: tileTag });
  LoadSpritePalette({ data: incbin("sMiscIcon_Pal"), tag: palTag });
  const mapsec = GetSelectedMapSection(whichMap, LAYER_MAP, y, x);
  // A dungeon on a town square is pushed to its bottom right corner.
  const offset = (GetMapsecType(mapsec) === MAPSECTYPE_VISITED || GetMapsecType(mapsec) === MAPSECTYPE_NOT_VISITED) && mapsec !== C.MAPSEC_ROUTE_10_POKECENTER ? 2 : 0;
  const spriteId = CreateSprite(spriteTemplate(tileTag, palTag, "sOamData_DungeonIcon", "sAnims_DungeonIcon", SpriteCallbackDummy),
    8 * x + 36 + offset, 8 * y + 36 + offset, 3);
  const icon = m.dungeonIcons[numIcons];
  icon.sprite = gSprites[spriteId];
  icon.sprite.invisible = true;
  icon.region = whichMap;
  icon.tileTag = tileTag;
  icon.palTag = palTag;
}

function CreateFlyIcons(): void {
  let numIcons = 0;
  if (!GetRegionMapPermission(MAPPERM_HAS_FLY_DESTINATIONS)) return;
  for (let i = 0; i < REGIONMAP_COUNT; i++) {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (numIcons < NUM_ICONS && GetMapsecType(GetSelectedMapSection(i, LAYER_MAP, y, x)) === MAPSECTYPE_VISITED) {
          CreateFlyIconSprite(i, numIcons, x, y, numIcons + 10, 10);
          numIcons++;
        }
      }
    }
  }
}

function CreateDungeonIcons(): void {
  let numIcons = 0;
  for (let i = 0; i < REGIONMAP_COUNT; i++) {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const mapsec = GetSelectedMapSection(i, LAYER_DUNGEON, y, x);
        if (mapsec === C.MAPSEC_NONE) continue;
        if (mapsec === C.MAPSEC_CERULEAN_CAVE && !flagGet(C.FLAG_SYS_CAN_LINK_WITH_RS)) continue;
        if (numIcons >= NUM_ICONS) continue;
        CreateDungeonIconSprite(i, numIcons, x, y, numIcons + 35, 10);
        if (GetDungeonMapsecType(mapsec) !== MAPSECTYPE_VISITED) StartSpriteAnim(sMapIcons!.dungeonIcons[numIcons].sprite!, 1);
        numIcons++;
      }
    }
  }
}

function setIconInvisibility(icons: MapIconSprite[], whichMap: number, invisible: boolean): void {
  for (const icon of icons) if (icon.sprite && (icon.region === whichMap || whichMap === 0xff)) icon.sprite.invisible = invisible;
}

function SetFlyIconInvisibility(whichMap: number, _iconNum: number, invisible: boolean): void {
  if (sMapIcons) setIconInvisibility(sMapIcons.flyIcons, whichMap, invisible);
}

function SetDungeonIconInvisibility(whichMap: number, _iconNum: number, invisible: boolean): void {
  if (sMapIcons) setIconInvisibility(sMapIcons.dungeonIcons, whichMap, invisible);
}

function FreeMapIcons(): void {
  if (!sMapIcons) return;
  for (const icon of [...sMapIcons.flyIcons, ...sMapIcons.dungeonIcons]) {
    if (!icon.sprite) continue;
    DestroySprite(icon.sprite);
    FreeSpriteTilesByTag(icon.tileTag);
    FreeSpritePaletteByTag(icon.palTag);
  }
  sMapIcons = null;
}

// ---------------------------------------------------------------- GPU registers

function SaveRegionMapGpuRegs(idx: number): boolean {
  if (sRegionMapGpuRegs[idx]) return false;
  sRegionMapGpuRegs[idx] = {
    bldcnt: GetGpuReg(REG_OFFSET_BLDCNT), bldy: GetGpuReg(REG_OFFSET_BLDY), bldalpha: GetGpuReg(REG_OFFSET_BLDALPHA),
    winin: GetGpuReg(REG_OFFSET_WININ), winout: GetGpuReg(REG_OFFSET_WINOUT), win0h: GetGpuReg(REG_OFFSET_WIN0H),
    win1h: GetGpuReg(REG_OFFSET_WIN1H), win0v: GetGpuReg(REG_OFFSET_WIN0V), win1v: GetGpuReg(REG_OFFSET_WIN1V),
  };
  return true;
}

function SetRegionMapGpuRegs(idx: number): boolean {
  const r = sRegionMapGpuRegs[idx];
  if (!r) return false;
  SetGpuReg(REG_OFFSET_BLDCNT, r.bldcnt);
  SetGpuReg(REG_OFFSET_BLDY, r.bldy);
  SetGpuReg(REG_OFFSET_BLDALPHA, r.bldalpha);
  SetGpuReg(REG_OFFSET_WININ, r.winin);
  SetGpuReg(REG_OFFSET_WINOUT, r.winout);
  SetGpuReg(REG_OFFSET_WIN0H, r.win0h);
  SetGpuReg(REG_OFFSET_WIN1H, r.win1h);
  SetGpuReg(REG_OFFSET_WIN0V, r.win0v);
  SetGpuReg(REG_OFFSET_WIN1V, r.win1v);
  sRegionMapGpuRegs[idx] = null;
  return true;
}

function ResetGpuRegs(): void {
  const zero = { left: 0, top: 0, right: 0, bottom: 0 };
  SetBldCnt(0, 0, BLDCNT_EFFECT_NONE);
  SetBldY(0);
  SetGpuWindowDims(0, zero);
  SetGpuWindowDims(1, zero);
  SetWinIn(0, 0);
  SetDispCnt(0, true);
  SetDispCnt(1, true);
}

function SetBldCnt(tgt2: number, tgt1: number, effect: number): void { SetGpuReg(REG_OFFSET_BLDCNT, (tgt2 << 8) | tgt1 | effect); }
function SetBldY(tgt: number): void { SetGpuReg(REG_OFFSET_BLDY, tgt); }
function SetBldAlpha(tgt2: number, tgt1: number): void { SetGpuReg(REG_OFFSET_BLDALPHA, (tgt2 << 8) | tgt1); }
function SetWinIn(b: number, a: number): void { SetGpuReg(REG_OFFSET_WININ, (a << 8) | b); }
function SetWinOut(regval: number): void { SetGpuReg(REG_OFFSET_WINOUT, regval); }

function SetDispCnt(idx: number, clear: boolean): void {
  const flag = rd<number[]>("sWinFlags")[idx];
  if (clear) ClearGpuRegBits(REG_OFFSET_DISPCNT, flag);
  else SetGpuReg(REG_OFFSET_DISPCNT, GetGpuReg(REG_OFFSET_DISPCNT) | flag);
}

function SetGpuWindowDims(winIdx: number, data: GpuWindowParams): void {
  const regs = rd<number[][]>("sWinRegs")[winIdx];
  SetGpuReg(regs[0], WIN_RANGE(data.top, data.bottom));
  SetGpuReg(regs[1], WIN_RANGE(data.left, data.right));
}

function FreeAndResetGpuRegs(): void {
  FreeRegionMapGpuRegs();
  ResetGpuRegs();
}

/** FreeRegionMapGpuRegs (region_map.c); release each saved register snapshot. */
function FreeRegionMapGpuRegs(): void {
  sRegionMapGpuRegs.fill(null);
}

// WINOUT_WIN01_* (outside both windows) bits.
const WINOUT_WIN01_BG0 = 1 << 0, WINOUT_WIN01_BG1 = 1 << 1, WINOUT_WIN01_BG3 = 1 << 3, WINOUT_WIN01_BG_ALL = 0xf;
const WINOUT_WIN01_OBJ = 1 << 4, WINOUT_WIN01_CLR = 1 << 5;

// ---------------------------------------------------------------- names and top bar

function mapNameBytes(mapsec: number): Uint8Array {
  const names = rd<SymRef[]>("sMapNames");
  const ref = names[mapsec - C.KANTO_MAPSEC_START];
  return ref ? Uint8Array.from(rd<number[]>(symName(ref)!)) : Uint8Array.of(0xff);
}

/** IsCeladonDeptStoreMapsec (region_map.c): use the department label only from its floors, outside the map UI. */
function IsCeladonDeptStoreMapsec(mapsec: number): boolean {
  if (sRegionMap !== null || (mapsec & 0xffff) !== C.MAPSEC_CELADON_CITY) return false;
  const firstFloor = C.MAP_CELADON_CITY_DEPARTMENT_STORE_1F;
  if (save.location.mapGroup !== (firstFloor >>> 8)) return false;
  const floors = [C.MAP_CELADON_CITY_DEPARTMENT_STORE_1F, C.MAP_CELADON_CITY_DEPARTMENT_STORE_2F,
    C.MAP_CELADON_CITY_DEPARTMENT_STORE_3F, C.MAP_CELADON_CITY_DEPARTMENT_STORE_4F,
    C.MAP_CELADON_CITY_DEPARTMENT_STORE_5F, C.MAP_CELADON_CITY_DEPARTMENT_STORE_ROOF,
    C.MAP_CELADON_CITY_DEPARTMENT_STORE_ELEVATOR];
  return floors.some((map) => save.location.mapNum === (map & 0xff));
}

/** GetMapName while the region map is open; the special Celadon department label is suppressed. */
function GetMapName(mapsec: number, fill: number): Uint8Array {
  mapsec &= 0xffff;
  const idx = mapsec - C.KANTO_MAPSEC_START;
  if (idx < 0 || idx >= C.MAPSEC_NONE - C.KANTO_MAPSEC_START) return Uint8Array.from([...new Array(fill || 18).fill(0x00), 0xff]);
  const name = Array.from(IsCeladonDeptStoreMapsec(mapsec) ? rd<number[]>("sMapsecName_CELADON_DEPT_") : mapNameBytes(mapsec));
  const end = name.indexOf(0xff);
  const out = name.slice(0, end < 0 ? name.length : end);
  if (fill) while (out.length < fill) out.push(0x00);
  out.push(0xff);
  return Uint8Array.from(out);
}

/** GetMapNameGeneric (region_map.c); copies the EOS string and returns the one-past-EOS destination view. */
export function GetMapNameGeneric(dest: Uint8Array, mapsec: number): Uint8Array {
  const name = GetMapName(mapsec, 0);
  dest.set(name.subarray(0, dest.length));
  return dest.subarray(Math.min(name.length, dest.length));
}

/** GetMapNameGeneric_ (region_map.c) is the same destination-buffer helper. */
export function GetMapNameGeneric_(dest: Uint8Array, mapsec: number): Uint8Array { return GetMapNameGeneric(dest, mapsec); }

/** Byte-array form for TypeScript call sites that model the C string destination inline. */
export function getMapNameGenericBytes(mapsec: number): Uint8Array {
  const dest = new Uint8Array(64).fill(0xff);
  GetMapNameGeneric(dest, mapsec);
  return dest.subarray(0, dest.indexOf(0xff) + 1);
}

function PrintTopBarTextLeft(str: Uint8Array): void {
  FillWindowPixelBuffer(WIN_TOPBAR_LEFT, PIXEL_FILL(rm().permissions[MAPPERM_HAS_OPEN_ANIM] ? 0 : 15));
  AddTextPrinterParameterized3(WIN_TOPBAR_LEFT, FONT_SMALL, 0, 0, rd("sTextColors"), 0, str);
  CopyWindowToVram(WIN_TOPBAR_LEFT, COPYWIN_GFX);
}

function PrintTopBarTextRight(str: Uint8Array): void {
  FillWindowPixelBuffer(WIN_TOPBAR_RIGHT, PIXEL_FILL(rm().permissions[MAPPERM_HAS_OPEN_ANIM] ? 0 : 15));
  AddTextPrinterParameterized3(WIN_TOPBAR_RIGHT, FONT_SMALL, 0, 0, rd("sTextColors"), 0, str);
  CopyWindowToVram(WIN_TOPBAR_RIGHT, COPYWIN_FULL);
}

function ClearOrDrawTopBar(clear: boolean): void {
  if (!clear) { PutWindowTilemap(WIN_TOPBAR_LEFT); PutWindowTilemap(WIN_TOPBAR_RIGHT); }
  else { ClearWindowTilemap(WIN_TOPBAR_LEFT); ClearWindowTilemap(WIN_TOPBAR_RIGHT); }
}

// ---------------------------------------------------------------- fly map

function Task_FlyMap(taskId: number): void {
  const f = sFlyMap!;
  switch (f.state) {
    case 0:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
      InitMapIcons(GetSelectedRegionMap(), taskId, rm().mainTask);
      CreateMapCursor(0, 0);
      CreatePlayerIcon(1, 1);
      SetMapCursorInvisibility(false);
      SetPlayerIconInvisibility(false);
      f.state++;
      break;
    case 1:
      if (GetRegionMapPermission(MAPPERM_HAS_OPEN_ANIM)) {
        InitMapOpenAnim(taskId, rm().mainTask);
      } else {
        ShowBg(0); ShowBg(3); ShowBg(1);
        PrintTopBarTextLeft(text("gText_RegionMap_DPadMove"));
        SetFlyIconInvisibility(GetSelectedRegionMap(), NUM_ICONS, false);
        SetDungeonIconInvisibility(GetSelectedRegionMap(), NUM_ICONS, false);
      }
      f.state++;
      break;
    case 2:
      PrintTopBarTextRight(text("gText_RegionMap_AButtonOK"));
      ClearOrDrawTopBar(false);
      f.state++;
      break;
    case 3:
      if (!gPaletteFade.active) {
        DisplayCurrentMapName(); PutWindowTilemap(WIN_MAP_NAME);
        DisplayCurrentDungeonName(); PutWindowTilemap(WIN_DUNGEON_NAME);
        f.state++;
      }
      break;
    case 4:
      switch (GetRegionMapInput()) {
        case MAP_INPUT_MOVE_START:
        case MAP_INPUT_MOVE_CONT:
          break;
        case MAP_INPUT_CANCEL:
          f.state = 6;
          break;
        case MAP_INPUT_MOVE_END:
          if (GetSelectedMapsecType(LAYER_MAP) === MAPSECTYPE_VISITED) sound.playSE(C.SE_DEX_PAGE);
          else PlaySEForSelectedMapsec();
          ResetCursorSnap();
          DisplayCurrentMapName();
          DisplayCurrentDungeonName();
          DrawDungeonNameBox();
          if (GetMapCursorX() === CANCEL_BUTTON_X && GetMapCursorY() === CANCEL_BUTTON_Y) {
            sound.playSE(C.SE_M_SPIT_UP);
            PrintTopBarTextRight(text("gText_RegionMap_AButtonCancel"));
          } else if (GetSelectedMapsecType(LAYER_MAP) === MAPSECTYPE_VISITED || GetSelectedMapsecType(LAYER_MAP) === MAPSECTYPE_UNKNOWN) {
            PrintTopBarTextRight(text("gText_RegionMap_AButtonOK"));
          } else {
            PrintTopBarTextRight(text("gText_RegionMap_Space"));
          }
          break;
        case MAP_INPUT_A_BUTTON:
          if ((GetSelectedMapsecType(LAYER_MAP) === MAPSECTYPE_VISITED || GetSelectedMapsecType(LAYER_MAP) === MAPSECTYPE_UNKNOWN)
            && GetRegionMapPermission(MAPPERM_HAS_FLY_DESTINATIONS)) {
            const mapType = sGame!.overworld.header.mapType;
            if (mapType === C.MAP_TYPE_UNDERGROUND || mapType === C.MAP_TYPE_INDOOR) {
              f.selectedDestination = false;
            } else {
              sound.playSE(C.SE_USE_ITEM);
              f.selectedDestination = true;
            }
            f.state++;
          }
          break;
        case MAP_INPUT_SWITCH:
          InitSwitchMapMenu(GetSelectedRegionMap(), taskId, SaveMainMapTask);
          break;
      }
      break;
    case 5:
      if (GetRegionMapPermission(MAPPERM_HAS_OPEN_ANIM)) DoMapCloseAnim(taskId);
      f.state++;
      break;
    case 6:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      f.state++;
      break;
    default:
      if (!gPaletteFade.active) {
        if (f.selectedDestination) SetFlyWarpDestination(GetMapsecUnderCursor());
        FreeFlyMap(taskId);
      }
      break;
  }
}

function InitFlyMap(): void {
  sFlyMap = { state: 0, selectedDestination: false };
}

function FreeFlyMap(taskId: number): void {
  if (GetRegionMapPermission(MAPPERM_HAS_OPEN_ANIM)) FreeMapOpenCloseAnim();
  FreeMapIcons();
  FreeMapCursor();
  FreePlayerIcon();
  FreeAndResetGpuRegs();
  FreeRegionMapForFlyMap();
  tasks.destroy(taskId);
  FreeAllWindowBuffers();
  const selected = sFlyMap!.selectedDestination;
  sFlyMap = null;
  SetVBlankCallback(null);
  SetMainCallback2(null);
  const done = sFlyDone;
  sFlyDone = null;
  done?.(selected);
}

/** FreeRegionMapForFlyMap (region_map.c); the fly map frees this state separately. */
function FreeRegionMapForFlyMap(): void { sRegionMap = null; }

function SetFlyWarpDestination(mapsec: number): void {
  const dest = rd<number[][]>("sMapFlyDestinations")[mapsec - C.KANTO_MAPSEC_START];
  const ow = sGame!.overworld;
  if (!dest) return;
  if (dest[2]) ow.setWarpDestinationToHealLocation(dest[2]);
  else ow.setWarpDestinationToMapWarp(dest[0], dest[1], -1);
}
