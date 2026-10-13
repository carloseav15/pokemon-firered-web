// help_system_util.c: the help overlay's video state machine (RunHelpSystemCallback), its BG tilemap
// helpers, text renderer and list-menu cursor. The overlay draws into gDecompressionBuffer (BG char
// block 3 image: tile data plus the screen at 0x3800) and commits it to VRAM like the C DMA copies.
import { sound } from "./audio/sound";
import * as C from "./generated/constants";
import { FONT_FEMALE, FONT_SMALL, GetKeypadIconSheet, KEYPAD_ICONS, glyph, GetStringWidth } from "./gba/font";
import { L_BUTTON, R_BUTTON, A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, joy } from "./gba/input";
import { GenerateFontHalfRowLookupTable, GetLastTextColor, RestoreTextColors, SaveTextColors } from "./gba/textPrinter";
import { incbin, incbin16, loadCData, preloadIncbin } from "./hw/assets";
import { GetGpuReg, SetGpuReg } from "./hw/gpu";
import { FillBitmapRect4Bit } from "./hw/window";
import { GetFontAttribute } from "./hw/menu";
import { gMain } from "./hw/runtime";
import {
  BGCNT_16COLOR, DISPCNT_BG0_ON, ppu, REG_OFFSET_BG0CNT, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS,
  REG_OFFSET_BLDCNT, REG_OFFSET_DISPCNT,
} from "./hw/ppu";
import { rom } from "./rom";
import { flagGet, save } from "./save";
import {
  GetHelpSystemMenuLevel, HelpSystem_IsSinglePlayer, HelpSystem_PrintTopicLabel, HelpSystem_UpdateHasntSeenIntro,
  HelpSystemSubroutine_PrintWelcomeMessage, HelpSystemSubroutine_WelcomeEndGotoMenu, IsHelpSystemEnabled,
  IsHelpSystemToggleWithRButtonDisabled, RunHelpMenuSubroutine,
} from "./helpSystem";

const BG_CHAR_SIZE = 0x4000;
const BG_CHAR_ADDR_3 = 3 * BG_CHAR_SIZE;
const TILES_SYMBOL = "help_system_util.c:sTiles";
const PALS_SYMBOL = "help_system_util.c:sPals";

/** struct ListMenuItem as used by the help list (label is 0xFF-terminated game text). */
export type HelpListMenuItem = { label: Uint8Array; index: number };

/** struct HelpSystemListMenu. */
export type HelpSystemListMenu = {
  sub: { items: HelpListMenuItem[]; totalItems: number; maxShowed: number; left: number; top: number };
  itemsAbove: number;
  cursorPos: number;
  state: number;
};

type HelpSystemVideoState = {
  savedVblankCb: (() => void) | null;
  savedHblankCb: (() => void) | null;
  savedDispCnt: number;
  savedBg0Cnt: number;
  savedBg0Hofs: number;
  savedBg0Vofs: number;
  savedBldCnt: number;
  savedTextColor: { fgColor: number; bgColor: number; shadowColor: number };
  state: number;
};

export const gDisableHelpSystemVolumeReduce = { value: 0 };
let sDelayTimer = 0;
let sInHelpSystem = 0;
const sMapTilesBackup = new Uint8Array(BG_CHAR_SIZE);
const gDecompressionBuffer = new Uint8Array(BG_CHAR_SIZE);
const sVideoState: HelpSystemVideoState = {
  savedVblankCb: null, savedHblankCb: null, savedDispCnt: 0, savedBg0Cnt: 0, savedBg0Hofs: 0, savedBg0Vofs: 0,
  savedBldCnt: 0, savedTextColor: { fgColor: 0, bgColor: 0, shadowColor: 0 }, state: 0,
};
export const gHelpSystemListMenu: HelpSystemListMenu = {
  sub: { items: [], totalItems: 0, maxShowed: 0, left: 0, top: 0 }, itemsAbove: 0, cursorPos: 0, state: 0,
};
export const gHelpSystemListMenuItems: HelpListMenuItem[] = Array.from({ length: 52 }, () => ({ label: Uint8Array.of(0xff), index: 0 }));

let assetsReady = false;
/** The overlay's INCBIN tiles/palette are exported packs; RunHelpSystemCallback stays idle until they load. */
export async function preloadHelpSystem(): Promise<void> {
  await Promise.all([preloadIncbin([TILES_SYMBOL, PALS_SYMBOL]), loadCData("help_system")]);
  assetsReady = true;
}

/** True while the overlay owns the screen (sInHelpSystem); the frame loop skips the game callbacks and draws the PPU. */
export function IsHelpSystemActive(): boolean {
  return sInHelpSystem !== 0 && sVideoState.state >= 2;
}

/** RunHelpSystemCallback (help_system_util.c). */
export function RunHelpSystemCallback(): number {
  const sPals = (): Uint16Array => incbin16(PALS_SYMBOL);
  switch (sVideoState.state) {
    case 0:
      sInHelpSystem = 0;
      if (save.options.buttonMode !== C.OPTIONS_BUTTON_MODE_HELP) return 0;
      if ((joy.newKeys & R_BUTTON) !== 0 && IsHelpSystemToggleWithRButtonDisabled()) return 0;
      if ((joy.newKeys & (L_BUTTON | R_BUTTON)) !== 0) {
        if (!assetsReady) return 0;
        if (!HelpSystem_IsSinglePlayer() || !IsHelpSystemEnabled()) {
          sound.playSE(C.SE_HELP_ERROR);
          return 0;
        }
        sound.playSE(C.SE_HELP_OPEN);
        if (!gDisableHelpSystemVolumeReduce.value) sound.setBgmVolume(0x80);
        SaveCallbacks();
        sInHelpSystem = 1;
        sVideoState.state = 1;
      }
      break;
    case 1:
      SaveMapTiles();
      SaveMapGPURegs();
      SaveMapTextColors();
      ppu.pltt[0] = sPals()[15];
      SetGpuReg(REG_OFFSET_DISPCNT, 0);
      sVideoState.state = 2;
      break;
    case 2: {
      ppu.vram.fill(0, BG_CHAR_ADDR_3, BG_CHAR_ADDR_3 + BG_CHAR_SIZE);
      const pals = sPals();
      ppu.pltt.set(pals.subarray(0, Math.min(pals.length, ppu.pltt.length)), 0);
      const tiles = incbin(TILES_SYMBOL);
      gDecompressionBuffer.set(tiles.subarray(0, Math.min(tiles.length, BG_CHAR_SIZE - 0x3ee0)), 0x3ee0);
      sVideoState.state = 3;
      break;
    }
    case 3:
      HS_BufferFillMapWithTile1FF();
      HelpSystem_FillPanel3();
      HelpSystem_FillPanel2();
      HelpSystem_PrintTextInTopLeftCorner(rom.text("gString_Help"));
      HS_ShowOrHideWordHELPinTopLeft(1);
      if (HelpSystem_UpdateHasntSeenIntro()) HelpSystemSubroutine_PrintWelcomeMessage(gHelpSystemListMenu, gHelpSystemListMenuItems);
      else HelpSystemSubroutine_WelcomeEndGotoMenu(gHelpSystemListMenu, gHelpSystemListMenuItems);
      HS_ShowOrHideHeaderAndFooterLines_Lighter(1);
      HS_ShowOrHideVerticalBlackBarsAlongSides(1);
      CommitTilemap();
      sVideoState.state = 4;
      break;
    case 4:
      SetGpuReg(REG_OFFSET_BLDCNT, 0);
      SetGpuReg(REG_OFFSET_BG0HOFS, 0);
      SetGpuReg(REG_OFFSET_BG0VOFS, 0);
      // BGCNT_PRIORITY(0) | BGCNT_CHARBASE(3) | BGCNT_16COLOR | BGCNT_SCREENBASE(31)
      SetGpuReg(REG_OFFSET_BG0CNT, (3 << 2) | BGCNT_16COLOR | (31 << 8));
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_BG0_ON);
      sVideoState.state = 5;
      break;
    case 5:
      if (!RunHelpMenuSubroutine(gHelpSystemListMenu, gHelpSystemListMenuItems)) {
        sound.playSE(C.SE_HELP_CLOSE);
        sVideoState.state = 6;
      }
      break;
    case 6:
      SetGpuReg(REG_OFFSET_DISPCNT, 0);
      RestoreMapTiles();
      ppu.pltt.fill(sPals()[15]);
      sVideoState.state = 7;
      break;
    case 7:
      if (!gDisableHelpSystemVolumeReduce.value) sound.setBgmVolume(0x100);
      RestoreMapTextColors();
      RestoreGPURegs();
      sVideoState.state = 8;
      break;
    case 8:
      RestoreCallbacks();
      sInHelpSystem = 0;
      sVideoState.state = 0;
      break;
  }
  return sVideoState.state;
}

/** SaveCallbacks (help_system_util.c); the HBlank DMA0 stop is implicit (no HBlank handler is registered). */
export function SaveCallbacks(): void {
  sVideoState.savedVblankCb = gMain.vblankCallback;
  sVideoState.savedHblankCb = gMain.hblankCallback;
  gMain.vblankCallback = null;
  gMain.hblankCallback = null;
}

/** SaveMapGPURegs (help_system_util.c). */
export function SaveMapGPURegs(): void {
  sVideoState.savedDispCnt = GetGpuReg(REG_OFFSET_DISPCNT);
  sVideoState.savedBg0Cnt = GetGpuReg(REG_OFFSET_BG0CNT);
  sVideoState.savedBg0Hofs = GetGpuReg(REG_OFFSET_BG0HOFS);
  sVideoState.savedBg0Vofs = GetGpuReg(REG_OFFSET_BG0VOFS);
  sVideoState.savedBldCnt = GetGpuReg(REG_OFFSET_BLDCNT);
}

/** SaveMapTiles (help_system_util.c). */
export function SaveMapTiles(): void {
  sMapTilesBackup.set(ppu.vram.subarray(BG_CHAR_ADDR_3, BG_CHAR_ADDR_3 + BG_CHAR_SIZE));
}

/** SaveMapTextColors (help_system_util.c). */
export function SaveMapTextColors(): void {
  sVideoState.savedTextColor = SaveTextColors();
}

/** RestoreCallbacks (help_system_util.c). */
export function RestoreCallbacks(): void {
  gMain.vblankCallback = sVideoState.savedVblankCb;
  gMain.hblankCallback = sVideoState.savedHblankCb;
}

/** RestoreGPURegs (help_system_util.c). */
export function RestoreGPURegs(): void {
  SetGpuReg(REG_OFFSET_BLDCNT, sVideoState.savedBldCnt);
  SetGpuReg(REG_OFFSET_BG0HOFS, sVideoState.savedBg0Hofs);
  SetGpuReg(REG_OFFSET_BG0VOFS, sVideoState.savedBg0Vofs);
  SetGpuReg(REG_OFFSET_BG0CNT, sVideoState.savedBg0Cnt);
  SetGpuReg(REG_OFFSET_DISPCNT, sVideoState.savedDispCnt);
}

/** RestoreMapTiles (help_system_util.c). */
export function RestoreMapTiles(): void {
  ppu.vram.set(sMapTilesBackup, BG_CHAR_ADDR_3);
}

/** RestoreMapTextColors (help_system_util.c). */
export function RestoreMapTextColors(): void {
  const c = sVideoState.savedTextColor;
  RestoreTextColors(c.fgColor, c.bgColor, c.shadowColor);
}

/** CommitTilemap (help_system_util.c): copy gDecompressionBuffer into BG char block 3. */
export function CommitTilemap(): void {
  ppu.vram.set(gDecompressionBuffer, BG_CHAR_ADDR_3);
}

/** HS_DrawBgTilemapRect (help_system_util.c). */
export function HS_DrawBgTilemapRect(baseTile: number, left: number, top: number, width: number, height: number, increment: number): void {
  const view = new DataView(gDecompressionBuffer.buffer, gDecompressionBuffer.byteOffset);
  for (let i = top; i < top + height; i++) {
    for (let j = left; j < left + width; j++) {
      view.setUint16(0x3800 + 64 * i + 2 * j, baseTile & 0xffff, true);
      baseTile = (baseTile + increment) & 0xffff;
    }
  }
  CommitTilemap();
}

/** HS_BufferFillMapWithTile1FF (help_system_util.c). */
export function HS_BufferFillMapWithTile1FF(): void {
  HS_DrawBgTilemapRect(0x1ff, 0, 0, 30, 20, 0);
}

/** HS_ShowOrHideWordHELPinTopLeft (help_system_util.c). */
export function HS_ShowOrHideWordHELPinTopLeft(mode: number): void {
  switch (mode) {
    case 0: HS_DrawBgTilemapRect(0x1ff, 1, 0, 7, 2, 0); break;
    case 1: HS_DrawBgTilemapRect(0x1e8, 1, 0, 7, 2, 1); break;
  }
}

/** HS_ShowOrHideControlsGuideInTopRight (help_system_util.c). */
export function HS_ShowOrHideControlsGuideInTopRight(mode: number): void {
  switch (mode) {
    case 0: HS_DrawBgTilemapRect(0x1ff, 13, 0, 16, 2, 0); break;
    case 1: HS_DrawBgTilemapRect(0x1a0, 13, 0, 16, 2, 1); break;
  }
}

/** HS_ShowOrHideMainWindowText (help_system_util.c). */
export function HS_ShowOrHideMainWindowText(mode: number): void {
  switch (mode) {
    case 0: HS_DrawBgTilemapRect(0x1ff, 2, 3, 26, 16, 0); break;
    case 1: HS_DrawBgTilemapRect(0x000, 2, 3, 26, 16, 1); break;
  }
}

/** HS_SetMainWindowBgBrightness (help_system_util.c). */
export function HS_SetMainWindowBgBrightness(mode: number): void {
  switch (mode) {
    case 0: HS_DrawBgTilemapRect(0x1ff, 1, 3, 28, 16, 0); break; // Brighter
    case 1: HS_DrawBgTilemapRect(0x1fa, 1, 3, 28, 17, 0); break; // Darker
  }
}

/** HS_ShowOrHideToplevelTooltipWindow (help_system_util.c). */
export function HS_ShowOrHideToplevelTooltipWindow(mode: number): void {
  switch (mode) {
    case 0: HS_DrawBgTilemapRect(0x1ff, 2, 14, 26, 5, 0); break;
    case 1: HS_DrawBgTilemapRect(0x11e, 2, 14, 26, 5, 1); break;
  }
}

/** HS_ShowOrHideHeaderAndFooterLines_Lighter (help_system_util.c). */
export function HS_ShowOrHideHeaderAndFooterLines_Lighter(mode: number): void {
  switch (mode) {
    case 0:
      HS_DrawBgTilemapRect(0x1ff, 1, 2, 28, 1, 0);
      HS_DrawBgTilemapRect(0x1ff, 1, 19, 28, 1, 0);
      break;
    case 1:
      HS_DrawBgTilemapRect(0x1f7, 1, 2, 28, 1, 0);
      HS_DrawBgTilemapRect(0x1f8, 1, 19, 28, 1, 0);
      break;
  }
}

/** HS_ShowOrHideHeaderAndFooterLines_Darker (help_system_util.c). */
export function HS_ShowOrHideHeaderAndFooterLines_Darker(mode: number): void {
  switch (mode) {
    case 0:
      HS_DrawBgTilemapRect(0x1ff, 1, 2, 28, 1, 0);
      HS_DrawBgTilemapRect(0x1ff, 1, 19, 28, 1, 0);
      break;
    case 1:
      HS_DrawBgTilemapRect(0x1fb, 1, 2, 28, 1, 0);
      HS_DrawBgTilemapRect(0x1fc, 1, 19, 28, 1, 0);
      break;
  }
}

/** HS_ShowOrHideVerticalBlackBarsAlongSides (help_system_util.c). */
export function HS_ShowOrHideVerticalBlackBarsAlongSides(mode: number): void {
  switch (mode) {
    case 0:
      HS_DrawBgTilemapRect(0x1ff, 0, 0, 1, 20, 0);
      HS_DrawBgTilemapRect(0x1ff, 29, 0, 1, 20, 0);
      break;
    case 1:
      HS_DrawBgTilemapRect(0x1f9, 0, 0, 1, 20, 0);
      HS_DrawBgTilemapRect(0x1f9, 29, 0, 1, 20, 0);
      break;
  }
}

/** HS_ShowOrHideHeaderLine_Darker_FooterStyle (help_system_util.c). */
export function HS_ShowOrHideHeaderLine_Darker_FooterStyle(mode: number): void {
  switch (mode) {
    case 0: HS_DrawBgTilemapRect(0x1ff, 1, 5, 28, 1, 0); break;
    case 1: HS_DrawBgTilemapRect(0x1fc, 1, 5, 28, 1, 0); break;
  }
}

/** HS_ShowOrHideScrollArrows (help_system_util.c). */
export function HS_ShowOrHideScrollArrows(which: number, mode: number): void {
  switch (mode) {
    case 0:
      HS_DrawBgTilemapRect(0x1ff, 28, 3, 1, 1, 0);
      HS_DrawBgTilemapRect(0x1ff, 28, 18, 1, 1, 0);
      break;
    case 1:
      if (which === 0) HS_DrawBgTilemapRect(0x1fe, 28, 3, 1, 1, 0); // top
      else HS_DrawBgTilemapRect(0x1fd, 28, 18, 1, 1, 0); // bottom
      break;
  }
}

/** 4bpp tile-layout pixel address in a `rowTiles`-tile-wide bitmap (BlitBitmapRect4Bit's addressing). */
function pixelAddr(x: number, y: number, rowTiles: number): number {
  return ((x >> 1) & 3) + ((x >> 3) << 5) + (((y >> 3) * rowTiles) << 5) + ((y & 7) << 2);
}

type Bitmap = { pixels: Uint8Array; width: number; height: number };

function putPixel(dest: Bitmap, x: number, y: number, value: number): void {
  const rowTiles = (dest.width + (dest.width & 7)) >> 3;
  const addr = pixelAddr(x, y, rowTiles);
  if (addr >= dest.pixels.length) return;
  const shift = (x & 1) << 2;
  dest.pixels[addr] = (value << shift) | (dest.pixels[addr] & (0xf0 >> shift));
}

/** DecompressAndRenderGlyph (help_system_util.c): the glyph is coloured with the last GenerateFontHalfRowLookupTable colours. */
export function DecompressAndRenderGlyph(fontId: number, code: number, dest: Bitmap, x: number, y: number): number {
  const g = glyph(fontId === FONT_SMALL ? FONT_SMALL : fontId === FONT_FEMALE ? FONT_FEMALE : 2, code);
  const colors = [GetLastTextColor(2), GetLastTextColor(0), GetLastTextColor(1)];
  for (let gy = 0; gy < g.height; gy++) {
    for (let gx = 0; gx < g.width; gx++) {
      const value = colors[g.pixels[gy * 16 + gx]] ?? 0;
      if (value === 0) continue; // BlitBitmapRect4Bit colour key 0
      if (x + gx < dest.width && y + gy < dest.height) putPixel(dest, x + gx, y + gy, value);
    }
  }
  return g.width;
}

/** HelpSystemRenderText (help_system_util.c): `dest` is a view into gDecompressionBuffer, `width`/`height` in tiles. */
export function HelpSystemRenderText(fontId: number, dest: Uint8Array, src: ArrayLike<number>, x: number, y: number, width: number, height: number): void {
  const bitmap: Bitmap = { pixels: dest, width: width * 8, height: height * 8 };
  const origX = x;
  let p = 0;
  const glyphHeight = (): number => glyph(fontId === FONT_SMALL ? FONT_SMALL : fontId === FONT_FEMALE ? FONT_FEMALE : 2, 0).height;
  for (;;) {
    let curChar = src[p++];
    switch (curChar) {
      case C.EOS:
        return;
      case C.CHAR_NEWLINE:
        x = origX;
        y += glyphHeight() + 1;
        break;
      case C.PLACEHOLDER_BEGIN:
        curChar = src[p++];
        if (curChar === C.PLACEHOLDER_ID_PLAYER) {
          for (let i = 0; i < 10; i++) {
            if (save.playerName[i] === C.EOS) break;
            x += DecompressAndRenderGlyph(fontId, save.playerName[i], bitmap, x, y);
          }
        } else if (curChar === C.PLACEHOLDER_ID_STRING_VAR_1) {
          const name = rom.text(flagGet(C.FLAG_SYS_NOT_SOMEONES_PC) ? "gString_Bill" : "gString_Someone");
          for (let i = 0; name[i] !== C.EOS; i++) x += DecompressAndRenderGlyph(fontId, name[i], bitmap, x, y);
        }
        break;
      case C.CHAR_PROMPT_SCROLL:
      case C.CHAR_PROMPT_CLEAR:
        x = origX;
        y += glyphHeight() + 1;
        break;
      case C.EXT_CTRL_CODE_BEGIN:
        curChar = src[p++];
        switch (curChar) {
          case C.EXT_CTRL_CODE_COLOR_HIGHLIGHT_SHADOW:
            p += 3;
            break;
          case C.EXT_CTRL_CODE_PLAY_BGM:
          case C.EXT_CTRL_CODE_PLAY_SE:
            p += 2;
            break;
          case C.EXT_CTRL_CODE_COLOR:
          case C.EXT_CTRL_CODE_HIGHLIGHT:
          case C.EXT_CTRL_CODE_SHADOW:
          case C.EXT_CTRL_CODE_PALETTE:
          case C.EXT_CTRL_CODE_FONT:
          case C.EXT_CTRL_CODE_PAUSE:
          case C.EXT_CTRL_CODE_ESCAPE:
          case C.EXT_CTRL_CODE_SHIFT_RIGHT:
          case C.EXT_CTRL_CODE_SHIFT_DOWN:
            p += 1;
            break;
          case C.EXT_CTRL_CODE_RESET_FONT:
          case C.EXT_CTRL_CODE_PAUSE_UNTIL_PRESS:
          case C.EXT_CTRL_CODE_WAIT_SE:
          case C.EXT_CTRL_CODE_FILL_WINDOW:
            break;
          case C.EXT_CTRL_CODE_CLEAR:
          case C.EXT_CTRL_CODE_SKIP:
            p++;
            break;
          case C.EXT_CTRL_CODE_CLEAR_TO: {
            const clearPixels = src[p] + origX - x;
            if (clearPixels > 0) {
              FillBitmapRect4Bit(bitmap, x, y, clearPixels, GetFontAttribute(fontId, C.FONTATTR_MAX_LETTER_HEIGHT), 0);
              x += clearPixels;
            }
            p++;
            break;
          }
          case C.EXT_CTRL_CODE_MIN_LETTER_SPACING:
            p++;
            break;
          case C.EXT_CTRL_CODE_JPN:
          case C.EXT_CTRL_CODE_ENG:
            break;
        }
        break;
      case C.CHAR_KEYPAD_ICON: {
        const icon = src[p++];
        const info = KEYPAD_ICONS[icon];
        if (info) {
          const sheet = GetKeypadIconSheet();
          const cols = sheet.width / 8;
          const sx = (info[0] % cols) * 8;
          const sy = Math.floor(info[0] / cols) * 8;
          for (let iy = 0; iy < info[2]; iy++) {
            for (let ix = 0; ix < info[1]; ix++) {
              const value = sheet.pixels[(sy + iy) * sheet.width + sx + ix] ?? 0;
              if (value !== 0 && x + ix < bitmap.width && y + iy < bitmap.height) putPixel(bitmap, x + ix, y + iy, value);
            }
          }
          x += info[1];
        }
        break;
      }
      case C.CHAR_EXTRA_SYMBOL:
        curChar = src[p++] + 0x100;
      // fallthrough
      default:
        if (curChar === C.CHAR_SPACE) x += fontId === FONT_SMALL ? 5 : 4;
        else x += DecompressAndRenderGlyph(fontId, curChar, bitmap, x, y);
        break;
    }
  }
}

function region(offset: number): Uint8Array {
  return gDecompressionBuffer.subarray(offset);
}

function fill16(offset: number, value: number, bytes: number): void {
  for (let i = 0; i < bytes; i += 2) {
    gDecompressionBuffer[offset + i] = value & 0xff;
    gDecompressionBuffer[offset + i + 1] = value >> 8;
  }
}

/** HelpSystem_PrintTextInTopLeftCorner (help_system_util.c). */
export function HelpSystem_PrintTextInTopLeftCorner(str: ArrayLike<number>): void {
  GenerateFontHalfRowLookupTable(C.TEXT_COLOR_WHITE, C.TEXT_DYNAMIC_COLOR_6, C.TEXT_COLOR_DARK_GRAY);
  HelpSystemRenderText(5, region(0x3d00), str, 6, 2, 7, 2);
}

/** HelpSystem_PrintTextRightAlign_Row52 (help_system_util.c). */
export function HelpSystem_PrintTextRightAlign_Row52(str: ArrayLike<number>): void {
  const left = 0x7c - GetStringWidth(FONT_SMALL, str, 0);
  GenerateFontHalfRowLookupTable(C.TEXT_COLOR_WHITE, C.TEXT_DYNAMIC_COLOR_6, C.TEXT_COLOR_DARK_GRAY);
  HelpSystemRenderText(0, region(0x3400), str, left, 2, 16, 2);
}

/** HelpSystem_PrintTextAt (help_system_util.c). */
export function HelpSystem_PrintTextAt(str: ArrayLike<number>, x: number, y: number): void {
  GenerateFontHalfRowLookupTable(C.TEXT_COLOR_WHITE, C.TEXT_DYNAMIC_COLOR_6, C.TEXT_COLOR_DARK_GRAY);
  HelpSystemRenderText(2, region(0x0000), str, x, y, 26, 16);
}

/** HelpSystem_PrintQuestionAndAnswerPair (help_system_util.c). */
export function HelpSystem_PrintQuestionAndAnswerPair(question: ArrayLike<number>, answer: ArrayLike<number>): void {
  fill16(0x0000, 0xeeee, 0x3400);
  GenerateFontHalfRowLookupTable(C.TEXT_COLOR_WHITE, C.TEXT_DYNAMIC_COLOR_5, C.TEXT_COLOR_DARK_GRAY);
  HelpSystemRenderText(2, region(0x0000), question, 0, 0, 26, 16);
  HelpSystemRenderText(2, region(0x09c0), answer, 0, 0, 26, 13);
}

/** HelpSystem_PrintTopicMouseoverDescription (help_system_util.c). */
export function HelpSystem_PrintTopicMouseoverDescription(str: ArrayLike<number>): void {
  fill16(0x23c0, 0x1111, 0x1040);
  GenerateFontHalfRowLookupTable(C.TEXT_COLOR_DARK_GRAY, C.TEXT_COLOR_WHITE, C.TEXT_COLOR_LIGHT_GRAY);
  HelpSystemRenderText(2, region(0x23c0), str, 2, 6, 26, 5);
}

/** HelpSystem_FillPanel3 (help_system_util.c). */
export function HelpSystem_FillPanel3(): void {
  fill16(0x3d00, 0xffff, 0x1c0);
}

/** HelpSystem_FillPanel2 (help_system_util.c). */
export function HelpSystem_FillPanel2(): void {
  fill16(0x3400, 0xffff, 0x400);
}

/** HelpSystem_FillPanel1 (help_system_util.c). */
export function HelpSystem_FillPanel1(): void {
  fill16(0x0000, 0xffff, 0x3400);
}

/** HelpSystem_InitListMenuController (help_system_util.c); `a0` is the same object as gHelpSystemListMenu in every caller. */
export function HelpSystem_InitListMenuController(a0: HelpSystemListMenu, a1: number, a2: number): void {
  gHelpSystemListMenu.sub = a0.sub;
  gHelpSystemListMenu.itemsAbove = a1;
  gHelpSystemListMenu.cursorPos = a2;
  gHelpSystemListMenu.state = 0;
  if (gHelpSystemListMenu.sub.totalItems < gHelpSystemListMenu.sub.maxShowed) gHelpSystemListMenu.sub.maxShowed = gHelpSystemListMenu.sub.totalItems;
  HS_ShowOrHideMainWindowText(0);
  HelpSystem_FillPanel1();
  PrintListMenuItems();
  PlaceListMenuCursor();
}

/** HelpSystem_SetInputDelay (help_system_util.c). */
export function HelpSystem_SetInputDelay(a0: number): void {
  sDelayTimer = a0 & 0xff;
}

/** HelpSystem_GetMenuInput (help_system_util.c). */
export function HelpSystem_GetMenuInput(): number {
  if (sDelayTimer !== 0) {
    sDelayTimer--;
    return -1;
  } else if (joy.newKeys & A_BUTTON) {
    sound.playSE(C.SE_SELECT);
    return gHelpSystemListMenu.sub.items[gHelpSystemListMenu.itemsAbove + gHelpSystemListMenu.cursorPos].index;
  } else if (joy.newKeys & B_BUTTON) {
    sound.playSE(C.SE_SELECT);
    return -2;
  } else if (joy.newKeys & (L_BUTTON | R_BUTTON)) {
    return -6;
  } else if (joy.repeated & DPAD_UP) {
    if (!MoveCursor(1, 0)) sound.playSE(C.SE_SELECT);
    return -4;
  } else if (joy.repeated & DPAD_DOWN) {
    if (!MoveCursor(1, 1)) sound.playSE(C.SE_SELECT);
    return -5;
  } else if (joy.repeated & DPAD_LEFT) {
    if (!MoveCursor(7, 0)) sound.playSE(C.SE_SELECT);
    return -4;
  } else if (joy.repeated & DPAD_RIGHT) {
    if (!MoveCursor(7, 1)) sound.playSE(C.SE_SELECT);
    return -5;
  }
  return -1;
}

/** HS_UpdateMenuScrollArrows (help_system_util.c). */
export function HS_UpdateMenuScrollArrows(): void {
  const topItemIdx = (gHelpSystemListMenu.sub.totalItems - 7) & 0xff;
  if (gHelpSystemListMenu.sub.totalItems > 7) {
    const cursorPos = gHelpSystemListMenu.itemsAbove + gHelpSystemListMenu.cursorPos;
    HS_ShowOrHideScrollArrows(0, 0); // Hide both
    if (cursorPos === 0) HS_ShowOrHideScrollArrows(1, 1); // Show bottom
    else if (gHelpSystemListMenu.itemsAbove === 0 && gHelpSystemListMenu.cursorPos !== 0) HS_ShowOrHideScrollArrows(1, 1);
    else if (gHelpSystemListMenu.itemsAbove === topItemIdx) HS_ShowOrHideScrollArrows(0, 1); // Show top
    else if (gHelpSystemListMenu.itemsAbove !== 0) {
      HS_ShowOrHideScrollArrows(0, 1);
      HS_ShowOrHideScrollArrows(1, 1);
    }
  }
}

/** PrintListMenuItems (help_system_util.c). */
export function PrintListMenuItems(): void {
  const glyphHeight = GetFontAttribute(2, C.FONTATTR_MAX_LETTER_HEIGHT) + 1;
  let r5 = gHelpSystemListMenu.itemsAbove;
  for (let i = 0; i < gHelpSystemListMenu.sub.maxShowed; i++) {
    const x = gHelpSystemListMenu.sub.left + 8;
    const y = gHelpSystemListMenu.sub.top + glyphHeight * i;
    HelpSystem_PrintTextAt(gHelpSystemListMenu.sub.items[r5].label, x, y);
    r5++;
  }
}

/** PlaceListMenuCursor (help_system_util.c). */
export function PlaceListMenuCursor(): void {
  const glyphHeight = GetFontAttribute(2, C.FONTATTR_MAX_LETTER_HEIGHT) + 1;
  const x = gHelpSystemListMenu.sub.left;
  const y = gHelpSystemListMenu.sub.top + glyphHeight * gHelpSystemListMenu.cursorPos;
  HelpSystem_PrintTextAt(rom.text("gText_SelectorArrow2"), x, y);
}

/** HS_RemoveSelectionCursorAt (help_system_util.c). */
export function HS_RemoveSelectionCursorAt(i: number): void {
  const glyphHeight = GetFontAttribute(2, C.FONTATTR_MAX_LETTER_HEIGHT) + 1;
  const x = gHelpSystemListMenu.sub.left;
  const y = gHelpSystemListMenu.sub.top + i * glyphHeight;
  HelpSystem_PrintTextAt(rom.text("gString_HelpSystem_ClearTo8"), x, y);
}

/** TryMoveCursor1 (help_system_util.c). */
export function TryMoveCursor1(dirn: number): number {
  const menu = gHelpSystemListMenu;
  let midPoint: number;
  if (dirn === 0) {
    if (menu.sub.maxShowed === 1) midPoint = 0;
    else midPoint = menu.sub.maxShowed - (Math.trunc(menu.sub.maxShowed / 2) + (menu.sub.maxShowed & 1)) - 1;
    if (menu.itemsAbove === 0) {
      if (menu.cursorPos !== 0) {
        menu.cursorPos--;
        return 1;
      }
      return 0;
    }
    if (menu.cursorPos > midPoint) {
      menu.cursorPos--;
      return 1;
    }
    menu.itemsAbove--;
    return 2;
  }
  if (menu.sub.maxShowed === 1) midPoint = 0;
  else midPoint = Math.trunc(menu.sub.maxShowed / 2) + (menu.sub.maxShowed & 1);
  if (menu.itemsAbove === menu.sub.totalItems - menu.sub.maxShowed) {
    if (menu.cursorPos < menu.sub.maxShowed - 1) {
      menu.cursorPos++;
      return 1;
    }
    return 0;
  } else if (menu.cursorPos < midPoint) {
    menu.cursorPos++;
    return 1;
  }
  menu.itemsAbove++;
  return 2;
}

/** MoveCursor (help_system_util.c): returns TRUE when nothing moved. */
export function MoveCursor(by: number, dirn: number): boolean {
  const r7 = gHelpSystemListMenu.cursorPos;
  let flags = 0;
  for (let i = 0; i < by; i++) flags |= TryMoveCursor1(dirn);
  switch (flags) {
    case 1:
      // changed cursorPos only
      HS_RemoveSelectionCursorAt(r7);
      PlaceListMenuCursor();
      CommitTilemap();
      break;
    case 2:
    case 3:
      // changed itemsAbove
      if (GetHelpSystemMenuLevel() === 1) {
        HelpSystem_SetInputDelay(2);
        HelpSystem_FillPanel1();
        PrintListMenuItems();
        PlaceListMenuCursor();
        HelpSystem_PrintTopicLabel();
        HS_UpdateMenuScrollArrows();
      } else {
        HS_ShowOrHideMainWindowText(0);
        HelpSystem_FillPanel1();
        PrintListMenuItems();
        PlaceListMenuCursor();
        HS_ShowOrHideMainWindowText(1);
      }
      CommitTilemap();
      break;
    default:
      // neither changed
      return true;
  }
  return false;
}
