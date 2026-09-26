// Port of map_preview_screen.c and fldeff_flash.c cave transition:
// Forest and cave/dungeon preview screens shown when entering locations.
// Faithful translation of C data, durations, palette loading, tilemap stride,
// map name window and fade/blend transitions.

import { cdata, incbin, incbin16, symName } from "./hw/assets";
import { flagGet, flagSet } from "./save";
import { rom } from "./rom";
import { Window } from "./gba/window";
import { FONT_NORMAL, stringWidth } from "./gba/font";
import { printText, TEXT_COLOR_LIGHT_GRAY, TEXT_COLOR_RED, TEXT_COLOR_WHITE } from "./gba/textPrinter";
import { tilemapCanvas } from "./field/gfx4bpp";
import { FADE_FROM_BLACK, FADE_FROM_WHITE, FADE_TO_WHITE, paletteFade, RGB_BLACK } from "./gba/fade";
import { B_BUTTON, JOY_HELD } from "./gba/input";
import type { Overworld } from "./field/overworld";

export const MPS_VIRIDIAN_FOREST = 0;
export const MPS_MT_MOON = 1;
export const MPS_DIGLETTS_CAVE = 2;
export const MPS_ROCK_TUNNEL = 3;
export const MPS_POKEMON_TOWER = 4;
export const MPS_SAFARI_ZONE = 5;
export const MPS_SEAFOAM_ISLANDS = 6;
export const MPS_POKEMON_MANSION = 7;
export const MPS_ROCKET_HIDEOUT = 8;
export const MPS_SILPH_CO = 9;
export const MPS_VICTORY_ROAD = 10;
export const MPS_CERULEAN_CAVE = 11;
export const MPS_POWER_PLANT = 12;
export const MPS_MT_EMBER = 13;
export const MPS_ROCKET_WAREHOUSE = 14;
export const MPS_MONEAN_CHAMBER = 15;
export const MPS_DOTTED_HOLE = 16;
export const MPS_BERRY_FOREST = 17;
export const MPS_ICEFALL_CAVE = 18;
export const MPS_LOST_CAVE = 19;
export const MPS_ALTERING_CAVE = 20;
export const MPS_PATTERN_BUSH = 21;
export const MPS_LIPTOO_CHAMBER = 22;
export const MPS_WEEPTH_CHAMBER = 23;
export const MPS_TDILFORD_CHAMBER = 24;
export const MPS_SCUFIB_CHAMBER = 25;
export const MPS_RIXY_CHAMBER = 26;
export const MPS_VIAPOIS_CHAMBER = 27;
export const MPS_COUNT = 28;

export const MPS_TYPE_CAVE = 0;
export const MPS_TYPE_FOREST = 1;
export const MPS_TYPE_ANY = 2;

export interface MapPreviewScreen {
  mapsec: number;
  type: number;
  flagId: number;
  tilesptr: { $sym: string } | string;
  tilemapptr: { $sym: string } | string;
  palptr: { $sym: string } | string;
}

let sHasVisitedMapBefore = false;

export function getHasVisitedMapBefore(): boolean {
  return sHasVisitedMapBefore;
}

export function setHasVisitedMapBefore(val: boolean): void {
  sHasVisitedMapBefore = val;
}

function getSym(v: { $sym: string } | string): string {
  if (typeof v === "string") return v;
  return symName(v) ?? (v as any).$sym;
}

/** GetMapPreviewScreenIdx */
export function GetMapPreviewScreenIdx(mapsec: number): number {
  const data = cdata<MapPreviewScreen[]>("map_preview_screen", "sMapPreviewScreenData");
  for (let i = 0; i < MPS_COUNT && i < data.length; i++) {
    if (data[i].mapsec === mapsec) return i;
  }
  return MPS_COUNT;
}

/** MapHasPreviewScreen */
export function MapHasPreviewScreen(mapsec: number, type: number = MPS_TYPE_ANY): boolean {
  const idx = GetMapPreviewScreenIdx(mapsec);
  if (idx !== MPS_COUNT) {
    if (type === MPS_TYPE_ANY) return true;
    const data = cdata<MapPreviewScreen[]>("map_preview_screen", "sMapPreviewScreenData");
    return data[idx].type === type;
  }
  return false;
}

/** MapHasPreviewScreen_HandleQLState2 */
export function MapHasPreviewScreen_HandleQLState2(mapsec: number, type: number = MPS_TYPE_ANY, questLogState?: number): boolean {
  if (questLogState === rom.constants.QL_STATE_PLAYBACK) return false;
  return MapHasPreviewScreen(mapsec, type);
}

/** GetDungeonMapPreviewScreenInfo */
export function GetDungeonMapPreviewScreenInfo(mapsec: number): MapPreviewScreen | null {
  const idx = GetMapPreviewScreenIdx(mapsec);
  if (idx === MPS_COUNT) return null;
  const data = cdata<MapPreviewScreen[]>("map_preview_screen", "sMapPreviewScreenData");
  return data[idx] ?? null;
}

/** MapPreview_SetFlag */
export function MapPreview_SetFlag(flagId: number): void {
  if (!flagGet(flagId)) {
    sHasVisitedMapBefore = true;
  } else {
    sHasVisitedMapBefore = false;
  }
  flagSet(flagId);
}

/** MapPreview_GetDuration */
export function MapPreview_GetDuration(mapsec: number): number {
  const idx = GetMapPreviewScreenIdx(mapsec);
  if (idx === MPS_COUNT) return 0;
  const data = cdata<MapPreviewScreen[]>("map_preview_screen", "sMapPreviewScreenData");
  const entry = data[idx];
  if (entry.type === MPS_TYPE_CAVE) {
    if (!flagGet(entry.flagId)) return 120;
    return 40;
  } else {
    if (sHasVisitedMapBefore) return 120;
    return 40;
  }
}

/** MapPreview_CreateMapNameWindow */
export function MapPreview_CreateMapNameWindow(mapsec: number): Window {
  const win = new Window(0, 0, 13, 2);
  win.fill(TEXT_COLOR_WHITE);
  const name = rom.regionMapName(mapsec);
  const width = stringWidth(FONT_NORMAL, name);
  const x = Math.max(0, Math.floor((104 - width) / 2));
  printText(win, FONT_NORMAL, name, x, 2, {
    fg: TEXT_COLOR_RED,
    bg: TEXT_COLOR_WHITE,
    shadow: TEXT_COLOR_LIGHT_GRAY,
  });
  return win;
}

/**
 * Builds the 240x160 canvas for a map preview image from its 4bpp tiles,
 * 32-tile wide screenbase tilemap and 16-color palettes (loaded at BG_PLTT_ID(13)).
 */
export function buildMapPreviewCanvas(info: MapPreviewScreen): HTMLCanvasElement {
  const tiles = incbin(getSym(info.tilesptr));
  const tilemap = incbin16(getSym(info.tilemapptr));
  const pal = incbin16(getSym(info.palptr));

  // In C: LoadPalette(sMapPreviewScreenData[idx].palptr, BG_PLTT_ID(13), 3 * PLTT_SIZE_4BPP);
  // BG_PLTT_ID(13) = 13 * 16 = 208
  const bgPalettes = new Uint16Array(256);
  bgPalettes.set(pal, 13 * 16);

  // Screen is 30x20 tiles (240x160 px), tilemap stride is 32 tiles per row
  return tilemapCanvas(tiles, tilemap, bgPalettes, 30, 20, true, 32);
}

/** MapPreview_LoadGfx: exported incbins make this browser load synchronous. */
export function MapPreview_LoadGfx(mapsec: number): HTMLCanvasElement | null {
  const info = GetDungeonMapPreviewScreenInfo(mapsec);
  return info ? buildMapPreviewCanvas(info) : null;
}

/**
 * Manages forest and cave preview screen transitions over the overworld.
 */
export class MapPreviewManager {
  private active = false;
  private isCave = false;
  private state = 0;
  private timer = 0;
  private duration = 0;
  private alpha = 1.0;
  private blendTarget1 = 16;
  private blendTarget2 = 0;
  private blendStep = 0;
  private previewCanvas?: HTMLCanvasElement;
  private window?: Window;
  private bgVisible = false;
  private graphicsLoading = false;
  private flashTransition: "enter" | "exit" | null = null;
  private flashState = 0;
  private flashFrame = 0;
  private flashAlpha = 0;
  private flashPalette = new Uint16Array(16);
  private flashPalette0 = new Uint16Array(16);
  private flashTiles?: Uint8Array;
  private flashTilemap?: Uint16Array;

  private loadFlashTransitionGfx(): void {
    this.flashTilemap = incbin16("sCaveTransitionTilemap");
    this.flashTiles = incbin("sCaveTransitionTiles");
    this.flashState = 0;
    this.flashFrame = 0;
    this.flashAlpha = 0;
  }

  /** FlashTransition_Enter: cave-pattern palette reveal, then blend it away. */
  FlashTransition_Enter(): void {
    this.flashTransition = "enter";
    this.flashState = 0;
    this.flashFrame = 0;
    this.loadFlashTransitionGfx();
  }

  /** FlashTransition_Exit: blend in the cave pattern, then hand off from white. */
  FlashTransition_Exit(): void {
    this.flashTransition = "exit";
    this.flashState = 0;
    this.flashFrame = 0;
    this.loadFlashTransitionGfx();
  }

  private updateFlashTransition(): void {
    if (!this.flashTransition) return;
    if (this.flashTransition === "enter") {
      switch (this.flashState) {
        case 0: this.Task_FlashTransition_Enter_0(); break;
        case 1: this.Task_FlashTransition_Enter_1(); break;
        case 2: this.Task_FlashTransition_Enter_2(); break;
        case 3: this.Task_FlashTransition_Enter_3(); break;
      }
    } else {
      switch (this.flashState) {
        case 0: this.Task_FlashTransition_Exit_0(); break;
        case 1: this.Task_FlashTransition_Exit_1(); break;
        case 2: this.Task_FlashTransition_Exit_2(); break;
        case 3: this.Task_FlashTransition_Exit_3(); break;
        case 4: this.Task_FlashTransition_Exit_4(); break;
      }
    }
  }

  private Task_FlashTransition_Enter_0(): void { this.flashState = 1; }

  private Task_FlashTransition_Enter_1(): void {
    this.flashPalette.fill(0x7fff);
    this.flashPalette0.fill(0);
    this.flashAlpha = 0;
    this.flashFrame = 0;
    this.flashState = 2;
  }

  private Task_FlashTransition_Enter_2(): void {
    const colors = incbin16("sCaveTransitionPalette");
    if (this.flashFrame < 16) {
      this.flashPalette.set(colors.subarray(15 - this.flashFrame, 16), 0);
      this.flashFrame += 2;
    } else {
      this.flashAlpha = 16;
      this.flashState = 3;
      this.flashFrame = 0;
    }
  }

  private Task_FlashTransition_Enter_3(): void {
    this.flashAlpha = 16 - this.flashFrame;
    if (this.flashAlpha !== 0) this.flashFrame++;
    else {
      this.flashPalette0.fill(0);
      this.flashTransition = null;
    }
  }

  private Task_FlashTransition_Exit_0(): void { this.flashState = 1; }

  private Task_FlashTransition_Exit_1(): void {
    this.flashPalette.fill(0x7fff);
    this.flashPalette0.fill(0);
    this.flashPalette.set(incbin16("sCaveTransitionPalette").subarray(8, 16), 0);
    this.flashAlpha = 0;
    this.flashFrame = 0;
    this.flashState = 2;
  }

  private Task_FlashTransition_Exit_2(): void {
    this.flashAlpha = this.flashFrame;
    if (this.flashFrame <= 16) this.flashFrame++;
    else {
      this.flashState = 3;
      this.flashFrame = 0;
    }
  }

  private Task_FlashTransition_Exit_3(): void {
    if (this.flashFrame < 8) {
      this.flashPalette.set(incbin16("sCaveTransitionPalette").subarray(this.flashFrame + 8, 16), 0);
      this.flashFrame++;
    } else {
      this.flashPalette0.fill(0x7fff);
      this.flashState = 4;
      this.flashFrame = 8;
      this.flashAlpha = 16;
    }
  }

  private Task_FlashTransition_Exit_4(): void {
    if (this.flashFrame !== 0) this.flashFrame--;
    else this.flashTransition = null;
  }

  constructor(private readonly ow: Overworld) {}

  isActive(): boolean {
    return this.active;
  }

  /** Canvas equivalent of InitBgsFromTemplates + ShowBg(0). */
  MapPreview_InitBgs(): void {
    this.bgVisible = true;
  }

  /**
   * Canvas equivalent of the C BG palette/tile/tilemap loads. Assets are
   * already exported and the tilemap is composed immediately, so it returns
   * once the bitmap exists instead of reserving BG/VRAM buffers.
   */
  MapPreview_LoadGfx(mapsec: number): void {
    this.graphicsLoading = true;
    this.previewCanvas = MapPreview_LoadGfx(mapsec) ?? undefined;
    this.graphicsLoading = false;
  }

  /** C's temp-tile-buffer completion query; this Canvas load completes inline. */
  MapPreview_IsGfxLoadFinished(): boolean {
    return !this.graphicsLoading && this.previewCanvas !== undefined;
  }

  /** MapPreview_Unload: release the Canvas bitmap and its map-name window. */
  MapPreview_Unload(): void {
    this.previewCanvas = undefined;
    this.window = undefined;
    this.bgVisible = false;
  }

  /** ForestMapPreviewScreenIsRunning has an inverted C return convention. */
  ForestMapPreviewScreenIsRunning(): boolean {
    return !this.active || this.isCave;
  }

  MapPreview_StartForestTransition(mapsec: number): void {
    const info = GetDungeonMapPreviewScreenInfo(mapsec);
    if (!info) return;

    this.active = true;
    this.isCave = false;
    this.state = 0;
    this.timer = 0;
    this.alpha = 1.0;
    this.blendTarget1 = 16;
    this.blendTarget2 = 0;
    this.blendStep = 0;

    this.duration = MapPreview_GetDuration(mapsec);
    MapPreview_SetFlag(info.flagId);
    this.MapPreview_InitBgs();
    this.MapPreview_LoadGfx(mapsec);
    this.window = MapPreview_CreateMapNameWindow(mapsec);

    this.ow.controlsLocked = true;
    this.ow.objects.freezeAll();

    // Start with screen black and fade in
    paletteFade.fill(RGB_BLACK);
    paletteFade.fadeScreen(FADE_FROM_BLACK, 0);
  }

  RunMapPreviewScreen(mapsec: number): void {
    const info = GetDungeonMapPreviewScreenInfo(mapsec);
    if (!info) return;

    this.active = true;
    this.isCave = true;
    this.state = 0;
    this.timer = 0;
    this.alpha = 1.0;

    this.duration = MapPreview_GetDuration(mapsec);
    MapPreview_SetFlag(info.flagId);

    this.MapPreview_InitBgs();
    this.MapPreview_LoadGfx(mapsec);
    this.window = MapPreview_CreateMapNameWindow(mapsec);

    this.ow.controlsLocked = true;
    this.ow.objects.freezeAll();

    // Palettes start all black, fade in from black
    paletteFade.fill(RGB_BLACK);
    paletteFade.fadeScreen(FADE_FROM_BLACK, 0);
  }

  update(): void {
    this.updateFlashTransition();
    if (!this.active) return;

    if (!this.isCave) {
      this.Task_RunMapPreviewScreenForest();
    } else {
      this.Task_MapPreviewScreen_0();
    }
  }

  private Task_RunMapPreviewScreenForest(): void {
    switch (this.state) {
      case 0: // Waiting for fade in from black
        if (this.MapPreview_IsGfxLoadFinished() && !paletteFade.active) {
          this.ow.playSpecialMapMusic();
          this.state = 1;
          this.timer = 0;
        }
        break;
      case 1: // Holding preview for duration
        this.timer++;
        if (this.timer > this.duration) {
          this.timer = 0;
          this.blendStep = 0;
          this.state = 2;
        }
        break;
      case 2: // Blending out over overworld: EVA 16->0, EVB 0->16 (matching C switch data[1] % 3)
        switch (this.blendStep) {
          case 0:
            this.blendTarget2++;
            if (this.blendTarget2 > 16) this.blendTarget2 = 16;
            break;
          case 1:
            this.blendTarget1--;
            if (this.blendTarget1 < 0) this.blendTarget1 = 0;
            break;
        }
        this.blendStep = (this.blendStep + 1) % 3;
        this.alpha = this.blendTarget1 / 16;
        if (this.blendTarget1 === 0 && this.blendTarget2 === 16) {
          this.state = 3;
        }
        break;
      case 3: // Complete
        this.active = false;
        this.MapPreview_Unload();
        this.ow.objects.unfreezeAll();
        this.ow.controlsLocked = false;
        break;
    }
  }

  private Task_MapPreviewScreen_0(): void {
    switch (this.state) {
      case 0: // Waiting for fade in from black
        if (this.MapPreview_IsGfxLoadFinished() && !paletteFade.active) {
          this.ow.playSpecialMapMusic();
          this.state = 1;
          this.timer = 0;
        }
        break;
      case 1: // Holding preview for duration, JOY_HELD(B_BUTTON) skips
        this.timer++;
        if (this.timer > this.duration || JOY_HELD(B_BUTTON)) {
          // Begin fade out to white
          paletteFade.fadeScreen(FADE_TO_WHITE, 0);
          this.state = 2;
        }
        break;
      case 2: // Waiting for fade to white to finish
        if (!paletteFade.active) {
          // Preview is hidden under white; now fade from white into cave overworld
          this.MapPreview_Unload();
          paletteFade.fadeScreen(FADE_FROM_WHITE, 0);
          this.state = 3;
        }
        break;
      case 3: // Waiting for fade from white to finish
        if (!paletteFade.active) {
          this.active = false;
          this.ow.objects.unfreezeAll();
          this.ow.controlsLocked = false;
        }
        break;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.flashTransition && this.flashTiles && this.flashTilemap) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha / 16;
      const palettes = new Uint16Array(256);
      palettes.set(this.flashPalette0, 0);
      palettes.set(this.flashPalette, 14 * 16);
      ctx.drawImage(tilemapCanvas(this.flashTiles, this.flashTilemap, palettes, 30, 20, true, 32), 0, 0);
      ctx.restore();
    }
    if (!this.active || !this.bgVisible || !this.previewCanvas) return;

    ctx.save();
    if (!this.isCave && this.state === 2) {
      ctx.globalAlpha = Math.max(0, Math.min(1, this.alpha));
    }
    ctx.drawImage(this.previewCanvas, 0, 0);
    if (this.window) {
      this.window.render(ctx);
    }
    ctx.restore();
  }

}
