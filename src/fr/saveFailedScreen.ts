// Port of save_failed_screen.c: the flash backup memory recovery screen.
// Executed if physical flash save sectors are damaged or when recovering save data.

import * as C from "./generated/constants";
import { incbin } from "./hw/assets";
import { rom } from "./rom";
import { joy, A_BUTTON } from "./gba/input";
import { RGB_BLACK, LoadPalette } from "./hw/palette";
import { ppu, REG_OFFSET_DISPCNT, DISPCNT_BG0_ON, REG_OFFSET_BG0CNT, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BLDCNT } from "./hw/ppu";
import { SetGpuReg } from "./hw/gpu";
import { AddWindow, PutWindowTilemap, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, PIXEL_FILL, COPYWIN_FULL } from "./hw/window";
import { AddTextPrinterParameterized3, DeactivateAllTextPrinters } from "./hw/text";
import { FONT_NORMAL } from "./gba/font";
import { sound } from "./audio/sound";

export let sIsInSaveFailedScreen = false;
let sSaveType = C.SAVE_NORMAL;
let sSaveFailedScreenState = 0;
export let gSaveAttemptStatus = C.SAVE_STATUS_OK;
export let gDamagedSaveSectors = 0;

let sWindowId = -1;
let sSavedGpuRegs = new Uint16Array(64);

export function SetNotInSaveFailedScreen(): void {
  sIsInSaveFailedScreen = false;
}

export function DoSaveFailedScreen(saveType: number): void {
  sSaveType = saveType;
  sIsInSaveFailedScreen = true;
}

function BlankPalettes(): void {
  ppu.pltt.fill(RGB_BLACK);
}

function RequestDmaCopyFromScreenBuffer(): void {
  // GBA DMA3 copy from decompression buffer to BG screen addr
}

function RequestDmaCopyFromCharBuffer(): void {
  // GBA DMA3 copy from decompression buffer to BG char addr
}

function FillBgMapBufferRect(_baseBlock: number, _left: number, _top: number, _width: number, _height: number, _blockOffset: number): void {
  RequestDmaCopyFromScreenBuffer();
}

function UpdateMapBufferWithText(): void {
  FillBgMapBufferRect(0x001, 1, 5, 28, 10, 0x001);
}

function ClearMapBuffer(): void {
  FillBgMapBufferRect(0x000, 0, 0, 30, 20, 0x000);
}

function PrintTextOnSaveFailedScreen(str: number[] | Uint8Array): void {
  if (sWindowId < 0) {
    sWindowId = AddWindow({ bg: 0, tilemapLeft: 1, tilemapTop: 5, width: 28, height: 10, paletteNum: 0, baseBlock: 1 });
  }
  FillWindowPixelBuffer(sWindowId, PIXEL_FILL(0));
  AddTextPrinterParameterized3(sWindowId, FONT_NORMAL, 0, 0, [0, 1, 2], 0, str);
  PutWindowTilemap(sWindowId);
  CopyWindowToVram(sWindowId, COPYWIN_FULL);
  RequestDmaCopyFromCharBuffer();
}

function VerifySectorWipe(_sector: number): boolean {
  return false;
}

function WipeSector(sector: number): boolean {
  let result = false;
  let i = 0;
  while (i < 130) {
    result = VerifySectorWipe(sector);
    i++;
    if (!result) break;
  }
  return result;
}

function WipeDamagedSectors(damagedSectors: number): boolean {
  for (let i = 0; i < 32; i++) {
    if (damagedSectors & (1 << i)) {
      if (!WipeSector(i)) {
        damagedSectors &= ~(1 << i);
      }
    }
  }
  return damagedSectors !== 0;
}

function TryWipeDamagedSectors(): boolean {
  for (let i = 0; gDamagedSaveSectors !== 0 && i < 3; i++) {
    if (WipeDamagedSectors(gDamagedSaveSectors)) return false;
  }
  return gDamagedSaveSectors === 0;
}

export function RunSaveFailedScreen(): boolean {
  switch (sSaveFailedScreenState) {
    case 0:
      if (!sIsInSaveFailedScreen) return false;
      sound.setBgmVolume(128);
      sSaveFailedScreenState = 1;
      break;
    case 1:
      sSavedGpuRegs.set(ppu.io);
      BlankPalettes();
      SetGpuReg(REG_OFFSET_DISPCNT, 0);
      sSaveFailedScreenState = 2;
      break;
    case 2: {
      const pal = incbin("save_failed_screen.c:sSaveFailedScreenPals");
      LoadPalette(pal, 0, pal.length);
      sSaveFailedScreenState = 3;
      break;
    }
    case 3:
      ClearMapBuffer();
      PrintTextOnSaveFailedScreen(rom.text("gText_SaveFailedCheckingBackup"));
      UpdateMapBufferWithText();
      sSaveFailedScreenState = 4;
      break;
    case 4:
      SetGpuReg(REG_OFFSET_BLDCNT, 0);
      SetGpuReg(REG_OFFSET_BG0HOFS, 0);
      SetGpuReg(REG_OFFSET_BG0VOFS, 0);
      SetGpuReg(REG_OFFSET_BG0CNT, 0);
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_BG0_ON);
      sSaveFailedScreenState = 5;
      break;
    case 5:
      if (TryWipeDamagedSectors()) {
        gSaveAttemptStatus = C.SAVE_STATUS_OK;
        PrintTextOnSaveFailedScreen(rom.text("gText_SaveCompletePressA"));
      } else {
        gSaveAttemptStatus = C.SAVE_STATUS_ERROR;
        PrintTextOnSaveFailedScreen(rom.text("gText_BackupMemoryDamaged"));
      }
      sSaveFailedScreenState = 6;
      break;
    case 6:
      if (joy.newKeys & A_BUTTON) sSaveFailedScreenState = 7;
      break;
    case 7:
      SetGpuReg(REG_OFFSET_DISPCNT, 0);
      if (sWindowId >= 0) {
        FreeAllWindowBuffers();
        DeactivateAllTextPrinters();
        sWindowId = -1;
      }
      BlankPalettes();
      sSaveFailedScreenState = 8;
      break;
    case 8:
      sound.setBgmVolume(256);
      ppu.io.set(sSavedGpuRegs);
      sIsInSaveFailedScreen = false;
      sSaveFailedScreenState = 0;
      break;
  }
  return true;
}
