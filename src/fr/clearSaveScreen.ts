// clear_save_data_screen.c: "Clear all save data areas?" YES/NO, reached from the title screen
// with UP + B + SELECT. YES erases the save; both answers soft-reset to the copyright screen.

import { sound } from "./audio/sound";
import { tasks } from "./gba/tasks";
import { cdata, incbin, loadCData, preloadIncbin } from "./hw/assets";
import { ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, InitBgsFromTemplates, ResetBgsAndClearDma3BusyFlags, ShowBg, type BgTemplate } from "./hw/bg";
import { InitGpuRegManager, SetGpuReg } from "./hw/gpu";
import {
  CreateYesNoMenu, DestroyYesNoMenu, DrawStdFrameWithCustomTileAndPalette, LoadStdWindowGfx, MENU_B_PRESSED, MENU_NOTHING_CHOSEN,
  Menu_ProcessInputNoWrapClearOnChoose,
} from "./hw/menu";
import { BeginNormalPaletteFade, gPaletteFade, PALETTES_ALL, ResetPaletteFade, RGB_BLACK, RGB_WHITEALPHA, TransferPlttBuffer, UpdatePaletteFade } from "./hw/palette";
import { DISPCNT_MODE_0, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT } from "./hw/ppu";
import { renderHw, runHwFrame, SetMainCallback2, SetVBlankCallback } from "./hw/runtime";
import { AnimateSprites, BuildOamBuffer, LoadOam, ProcessSpriteCopyRequests, ResetSpriteData } from "./hw/sprite";
import { AddTextPrinterParameterized4, DeactivateAllTextPrinters } from "./hw/text";
import { CopyWindowToVram, COPYWIN_FULL, COPYWIN_GFX, DUMMY_WIN_TEMPLATE, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PIXEL_FILL,
  type WindowTemplate } from "./hw/window";
import { saveStore } from "./save";

const FONT_NORMAL = 2;
const TEXT_COLOR_WHITE = 1, TEXT_COLOR_DARK_GRAY = 2, TEXT_COLOR_LIGHT_GRAY = 3;
const SE_SELECT = 5;

const sBgTemplates: BgTemplate[] = [{ bg: 0, charBaseIndex: 0, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0 }];
const sWindowTemplates: WindowTemplate[] = [
  { bg: 0, tilemapLeft: 3, tilemapTop: 5, width: 6, height: 4, paletteNum: 15, baseBlock: 0x00a },
  { bg: 0, tilemapLeft: 3, tilemapTop: 15, width: 23, height: 4, paletteNum: 15, baseBlock: 0x022 },
  DUMMY_WIN_TEMPLATE,
];
const sTextColor = [TEXT_COLOR_WHITE, TEXT_COLOR_DARK_GRAY, TEXT_COLOR_LIGHT_GRAY];
const text = (name: string) => cdata<number[]>("strings", name);

export class ClearSaveScreen {
  /** Set when DoSoftReset is reached. */
  done = false;
  private state = { unk0: 0, unk1: 0, unk2: 0 };

  static async preload(): Promise<void> {
    await Promise.all([preloadIncbin(["gStdTextWindow_Gfx", "gTextWindowPalettes"]), loadCData("strings")]);
  }

  /** CB2_SaveClearScreen_Init */
  begin(): void {
    this.done = false;
    this.state = { unk0: 0, unk1: 0, unk2: 0 };
    InitGpuRegManager();
    this.CB2_Sub_SaveClearScreen_Init();
    tasks.create((id) => this.Task_DrawClearSaveDataScreen(id), 0);
    SetMainCallback2(CB2_RunClearSaveDataScreen);
  }

  update(): void {
    runHwFrame();
  }

  render(ctx: CanvasRenderingContext2D): void {
    renderHw(ctx);
  }

  private Task_DrawClearSaveDataScreen(taskId: number): void {
    switch (this.state.unk1) {
      case 0:
        BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        break;
      case 1:
        if (gPaletteFade.active) return;
        SetVBlankCallback(null);
        break;
      case 2:
        SaveClearScreen_GpuInit();
        break;
      case 3:
        LoadStdWindowGfx(0, 0x001, 15 * 16);
        LoadStdWindowGfx(1, 0x001, 15 * 16);
        break;
      case 4:
        DrawStdFrameWithCustomTileAndPalette(1, true, 0x001, 15);
        AddTextPrinterParameterized4(1, FONT_NORMAL, 0, 3, 1, 1, sTextColor, 0, text("gText_ClearAllSaveData"));
        CopyWindowToVram(1, COPYWIN_GFX);
        break;
      case 5:
        CreateYesNoMenu(sWindowTemplates[0], FONT_NORMAL, 0, 2, 0x001, 15, 1);
        CopyBgTilemapBufferToVram(0);
        break;
      default:
        BeginNormalPaletteFade(0xffff, 0, 16, 0, RGB_WHITEALPHA);
        SetVBlankCallback(VBlankCB_WaitYesNo);
        tasks.tasks[taskId].func = (id) => this.Task_HandleYesNoMenu(id);
        break;
    }
    this.state.unk1++;
  }

  private CB2_Sub_SaveClearScreen_Init(): void {
    ResetSpriteData();
    ResetPaletteFade();
    tasks.reset();
  }

  private Task_HandleYesNoMenu(taskId: number): void {
    if (this.state.unk0 === 0) {
      switch (Menu_ProcessInputNoWrapClearOnChoose()) {
        case MENU_B_PRESSED:
        case 1:
          sound.playSE(SE_SELECT);
          break;
        case 0:
          sound.playSE(SE_SELECT);
          FillWindowPixelBuffer(1, PIXEL_FILL(1));
          AddTextPrinterParameterized4(1, FONT_NORMAL, 0, 3, 1, 1, sTextColor, 0, text("gText_ClearingData"));
          CopyWindowToVram(1, COPYWIN_FULL);
          saveStore.clear();
          break;
        case MENU_NOTHING_CHOSEN:
        default:
          return;
      }
      this.state.unk0++;
    } else {
      this.Task_CleanUpAndSoftReset(taskId);
    }
  }

  private Task_CleanUpAndSoftReset(taskId: number): void {
    switch (this.state.unk2) {
      case 0:
        BeginNormalPaletteFade(0xffff, 0, 0, 16, RGB_WHITEALPHA);
        this.state.unk2++;
        break;
      case 1:
        if (!gPaletteFade.active) {
          DestroyYesNoMenu();
          tasks.destroy(taskId);
          FreeAllWindowBuffers();
          SetMainCallback2(null);
          SetVBlankCallback(null);
          this.done = true; // DoSoftReset
        }
        break;
    }
  }
}

function CB2_RunClearSaveDataScreen(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

function VBlankCB_WaitYesNo(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function SaveClearScreen_GpuInit(): void {
  ppu.vram.fill(0);
  ppu.oam.fill(0);
  ppu.pltt.fill(0);
  SetGpuReg(REG_OFFSET_DISPCNT, 0);
  SetGpuReg(REG_OFFSET_BLDY, 0);
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, sBgTemplates);
  for (let bg = 0; bg < 4; bg++) {
    ChangeBgX(bg, 0, 0);
    ChangeBgY(bg, 0, 0);
  }
  InitWindows(sWindowTemplates);
  DeactivateAllTextPrinters();
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
  ShowBg(0);
}

void incbin;
