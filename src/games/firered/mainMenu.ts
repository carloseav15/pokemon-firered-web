// main_menu.c (FireRed): CONTINUE / NEW GAME / MYSTERY GIFT with the continue stats window,
// user window frame, WIN0 highlight over a darkened screen and the palette fades.
// Save-status error screens other than "no save" are not reachable with localStorage saves.

import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_UP, JOY_NEW } from "./gba/input";
import { tasks } from "./gba/tasks";
import { intToDecimal, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_LEFT_ALIGN } from "./gba/charmap";
import { cdata, incbin, loadCData, preloadIncbin } from "./hw/assets";
import {
  ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, FillBgTilemapBufferRect, FillBgTilemapBufferRect_Palette0, InitBgsFromTemplates, LoadBgTiles,
  ResetBgsAndClearDma3BusyFlags, ShowBg, type BgTemplate,
} from "./hw/bg";
import { InitGpuRegManager, SetGpuReg } from "./hw/gpu";
import { BeginNormalPaletteFade, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, PALETTES_ALL, ResetPaletteFade, RGB, RGB_BLACK,
  TransferPlttBuffer, UpdatePaletteFade } from "./hw/palette";
import {
  BLDCNT_EFFECT_DARKEN, BLDCNT_TGT1_BD, BLDCNT_TGT1_BG0, BLDCNT_TGT1_BG1, BLDCNT_TGT1_BG2, BLDCNT_TGT1_BG3, BLDCNT_TGT1_OBJ, DISPCNT_OBJ_1D_MAP,
  DISPCNT_OBJ_ON, DISPCNT_WIN0_ON, ppu, REG_OFFSET_BG0CNT, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BG1CNT, REG_OFFSET_BG1HOFS,
  REG_OFFSET_BG1VOFS, REG_OFFSET_BG2CNT, REG_OFFSET_BG2HOFS, REG_OFFSET_BG2VOFS, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY,
  REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT,
} from "./hw/ppu";
import { gMain, renderHw, runHwFrame, SetMainCallback2, SetVBlankCallback } from "./hw/runtime";
import { ScanlineEffect_Stop } from "./hw/scanline";
import { AnimateSprites, BuildOamBuffer, FreeAllSpritePalettes, LoadOam, ProcessSpriteCopyRequests, ResetSpriteData } from "./hw/sprite";
import { AddTextPrinterParameterized3, DeactivateAllTextPrinters, IsTextPrinterActive, RunTextPrinters } from "./hw/text";
import { ClearWindowTilemap, CopyWindowToVram, COPYWIN_FULL, COPYWIN_GFX, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PutWindowTilemap,
  DUMMY_WIN_TEMPLATE, PIXEL_FILL, type WindowTemplate } from "./hw/window";
import { flagGet, save, saveStore, setSave, varGet } from "./save";

const FONT_NORMAL = 2;
const MAIN_MENU_NEWGAME = 0, MAIN_MENU_CONTINUE = 1, MAIN_MENU_MYSTERYGIFT = 2;
const WIN_NEWGAME_ONLY = 0, WIN_CONTINUE = 1, WIN_NEWGAME = 2, WIN_MYSTERYGIFT = 3, WIN_ERROR = 4;
const WIN_RANGE = (a: number, b: number) => ((a << 8) | b) & 0xffff;
const DARKEN = BLDCNT_TGT1_BG0 | BLDCNT_TGT1_BG1 | BLDCNT_TGT1_BG2 | BLDCNT_TGT1_BG3 | BLDCNT_TGT1_OBJ | BLDCNT_TGT1_BD | BLDCNT_EFFECT_DARKEN;

const sWindowTemplate: WindowTemplate[] = [
  { bg: 0, tilemapLeft: 3, tilemapTop: 1, width: 24, height: 2, paletteNum: 15, baseBlock: 0x001 },
  { bg: 0, tilemapLeft: 3, tilemapTop: 1, width: 24, height: 10, paletteNum: 15, baseBlock: 0x001 },
  { bg: 0, tilemapLeft: 3, tilemapTop: 13, width: 24, height: 2, paletteNum: 15, baseBlock: 0x0f1 },
  { bg: 0, tilemapLeft: 3, tilemapTop: 17, width: 24, height: 2, paletteNum: 15, baseBlock: 0x121 },
  { bg: 0, tilemapLeft: 3, tilemapTop: 15, width: 24, height: 4, paletteNum: 15, baseBlock: 0x001 },
  DUMMY_WIN_TEMPLATE,
];

const sTextColor1 = [10, 11, 12];
const sTextColor2 = [10, 1, 12];
const sBgTemplate: BgTemplate[] = [{ bg: 0, charBaseIndex: 0, mapBaseIndex: 30, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0 }];
const sMenuCursorYMax = [0, 1, 2];

const SYMBOLS = ["main_menu.c:sBg_Pal", "main_menu.c:sTextbox_Pal", "gStdTextWindow_Gfx",
  ...Array.from({ length: 10 }, (_, i) => [`sUserFrame_Type${i + 1}_Gfx`, `sUserFrame_Type${i + 1}_Pal`]).flat()];

export type MainMenuResult = "continue" | "newgame" | "title" | null;
let activeMainMenu: MainMenu | null = null;

/** CB2_InitMainMenu: begin the live main-menu scene. */
export function CB2_InitMainMenu(): void { activeMainMenu?.begin(); }

/** CB2_InitMainMenu_2: second C entry point, sharing MainMenuGpuInit's scene setup. */
export function CB2_InitMainMenu_2(): void { activeMainMenu?.MainMenuGpuInit(1); }

const text = (name: string) => cdata<number[]>("strings", name);

function concatStr(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length && a[i] !== 0xff; i++) out.push(a[i]);
  for (let i = 0; i < b.length && b[i] !== 0xff; i++) out.push(b[i]);
  out.push(0xff);
  return out;
}

export class MainMenu {
  result: MainMenuResult = null;
  private saveFileCorrupt = false;

  constructor() { activeMainMenu = this; }

  static async preload(): Promise<void> {
    await Promise.all([preloadIncbin(SYMBOLS), loadCData("strings")]);
  }

  /** CB2_InitMainMenu */
  begin(): void {
    this.result = null;
    this.saveFileCorrupt = false;
    if (saveStore.exists()) {
      const data = saveStore.load();
      if (data) setSave(data);
      else this.saveFileCorrupt = true;
    }
    InitGpuRegManager();
    this.MainMenuGpuInit();
  }

  update(): void {
    runHwFrame();
  }

  render(ctx: CanvasRenderingContext2D): void {
    renderHw(ctx);
  }

  MainMenuGpuInit(_unused: number = 1): boolean {
    SetVBlankCallback(null);
    for (const reg of [REG_OFFSET_DISPCNT, REG_OFFSET_BG2CNT, REG_OFFSET_BG1CNT, REG_OFFSET_BG0CNT, REG_OFFSET_BG2HOFS, REG_OFFSET_BG2VOFS,
      REG_OFFSET_BG1HOFS, REG_OFFSET_BG1VOFS, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS]) SetGpuReg(reg, 0);
    ppu.vram.fill(0);
    ppu.oam.fill(0);
    ppu.pltt.fill(0, 2);
    ScanlineEffect_Stop();
    tasks.reset();
    ResetSpriteData();
    FreeAllSpritePalettes();
    ResetPaletteFade();
    ResetBgsAndClearDma3BusyFlags(false);
    InitBgsFromTemplates(0, sBgTemplate);
    for (let bg = 0; bg < 3; bg++) {
      ChangeBgX(bg, 0, 0);
      ChangeBgY(bg, 0, 0);
    }
    InitWindows(sWindowTemplate);
    DeactivateAllTextPrinters();
    LoadPalette(incbin("main_menu.c:sBg_Pal"), 0, 32);
    LoadPalette(incbin("main_menu.c:sTextbox_Pal"), 15 * 16, 32);
    for (const reg of [REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT, REG_OFFSET_BLDCNT, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDY]) SetGpuReg(reg, 0);
    SetMainCallback2(CB2_MainMenu);
    SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON | DISPCNT_WIN0_ON);
    const taskId = tasks.create((id) => this.Task_SetWin0BldRegsAndCheckSaveFile(id), 0);
    tasks.tasks[taskId].data[1] = 0;
    return false;
  }

  private setDarkenRegs(): void {
    SetGpuReg(REG_OFFSET_WIN0H, 0);
    SetGpuReg(REG_OFFSET_WIN0V, 0);
    SetGpuReg(REG_OFFSET_WININ, 0x0001);
    SetGpuReg(REG_OFFSET_WINOUT, 0x0021);
    SetGpuReg(REG_OFFSET_BLDCNT, DARKEN);
    SetGpuReg(REG_OFFSET_BLDALPHA, 0);
    SetGpuReg(REG_OFFSET_BLDY, 7);
  }

  private Task_SetWin0BldRegsAndCheckSaveFile(taskId: number): void {
    if (gPaletteFade.active) return;
    this.setDarkenRegs();
    const t = tasks.tasks[taskId];
    // SAVE_STATUS_OK when a save exists, SAVE_STATUS_EMPTY otherwise.
    LoadUserFrameToBg(0);
    if (this.saveFileCorrupt) {
      SetStdFrame0OnBg(0);
      t.data[0] = flagGet(C.FLAG_SYS_MYSTERY_GIFT_ENABLED) ? MAIN_MENU_MYSTERYGIFT : MAIN_MENU_CONTINUE;
      this.PrintSaveErrorStatus(taskId, text("gText_SaveFileCorrupted"));
      return;
    }
    if (saveStore.exists()) t.data[0] = flagGet(C.FLAG_SYS_MYSTERY_GIFT_ENABLED) ? MAIN_MENU_MYSTERYGIFT : MAIN_MENU_CONTINUE;
    else t.data[0] = MAIN_MENU_NEWGAME;
    t.func = (id) => this.Task_SetWin0BldRegsNoSaveFileCheck(id);
  }

  private Task_SetWin0BldRegsNoSaveFileCheck(taskId: number): void {
    if (gPaletteFade.active) return;
    this.setDarkenRegs();
    const t = tasks.tasks[taskId];
    if (t.data[0] === MAIN_MENU_NEWGAME) t.func = (id) => this.Task_ExecuteMainMenuSelection(id);
    else t.func = (id) => this.Task_WaitFadeAndPrintMainMenuText(id);
  }

  /** C's save-status error path, used when a browser save exists but cannot be decoded. */
  private PrintSaveErrorStatus(taskId: number, str: ArrayLike<number>): void {
    PrintMessageOnWindow4(str);
    tasks.tasks[taskId].func = (id) => this.Task_SaveErrorStatus_RunPrinterThenWaitButton(id);
    BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, 0xffff);
    ShowBg(0);
    SetVBlankCallback(VBlankCB_MainMenu);
  }

  private Task_SaveErrorStatus_RunPrinterThenWaitButton(taskId: number): void {
    if (gPaletteFade.active) return;
    RunTextPrinters();
    if (IsTextPrinterActive(WIN_ERROR) || !JOY_NEW(A_BUTTON)) return;
    const task = tasks.tasks[taskId];
    ClearWindowTilemap(WIN_ERROR);
    MainMenu_EraseWindow(sWindowTemplate[WIN_ERROR]);
    LoadUserFrameToBg(0);
    task.func = task.data[0] === MAIN_MENU_NEWGAME
      ? (id) => this.Task_SetWin0BldRegsNoSaveFileCheck(id)
      : (id) => this.Task_PrintMainMenuText(id);
  }

  private Task_WaitFadeAndPrintMainMenuText(taskId: number): void {
    if (!gPaletteFade.active) this.Task_PrintMainMenuText(taskId);
  }

  private Task_PrintMainMenuText(taskId: number): void {
    this.setDarkenRegs();
    const pal = save.playerGender === 0 ? RGB(4, 16, 31) : RGB(31, 3, 21);
    LoadPalette([pal], 15 * 16 + 1, 2);
    const t = tasks.tasks[taskId];
    const print = (win: number, str: ArrayLike<number>) => AddTextPrinterParameterized3(win, FONT_NORMAL, 2, 2, sTextColor1, -1, str);
    switch (t.data[0]) {
      case MAIN_MENU_NEWGAME:
      default:
        FillWindowPixelBuffer(WIN_NEWGAME_ONLY, PIXEL_FILL(10));
        print(WIN_NEWGAME_ONLY, text("gText_NewGame"));
        MainMenu_DrawWindow(sWindowTemplate[WIN_NEWGAME_ONLY]);
        PutWindowTilemap(WIN_NEWGAME_ONLY);
        CopyWindowToVram(WIN_NEWGAME_ONLY, COPYWIN_FULL);
        break;
      case MAIN_MENU_CONTINUE:
      case MAIN_MENU_MYSTERYGIFT: {
        const withGift = t.data[0] === MAIN_MENU_MYSTERYGIFT;
        FillWindowPixelBuffer(WIN_CONTINUE, PIXEL_FILL(10));
        FillWindowPixelBuffer(WIN_NEWGAME, PIXEL_FILL(10));
        if (withGift) FillWindowPixelBuffer(WIN_MYSTERYGIFT, PIXEL_FILL(10));
        print(WIN_CONTINUE, text("gText_Continue"));
        print(WIN_NEWGAME, text("gText_NewGame"));
        if (withGift) {
          t.data[10] = 1;
          print(WIN_MYSTERYGIFT, text("gText_MysteryGift"));
        }
        PrintContinueStats();
        MainMenu_DrawWindow(sWindowTemplate[WIN_CONTINUE]);
        MainMenu_DrawWindow(sWindowTemplate[WIN_NEWGAME]);
        if (withGift) MainMenu_DrawWindow(sWindowTemplate[WIN_MYSTERYGIFT]);
        PutWindowTilemap(WIN_CONTINUE);
        PutWindowTilemap(WIN_NEWGAME);
        if (withGift) PutWindowTilemap(WIN_MYSTERYGIFT);
        CopyWindowToVram(WIN_CONTINUE, COPYWIN_GFX);
        if (withGift) {
          CopyWindowToVram(WIN_NEWGAME, COPYWIN_GFX);
          CopyWindowToVram(WIN_MYSTERYGIFT, COPYWIN_FULL);
        } else {
          CopyWindowToVram(WIN_NEWGAME, COPYWIN_FULL);
        }
        break;
      }
    }
    t.func = (id) => this.Task_WaitDma3AndFadeIn(id);
  }

  private Task_WaitDma3AndFadeIn(taskId: number): void {
    tasks.tasks[taskId].func = (id) => this.Task_UpdateVisualSelection(id);
    BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, 0xffff);
    ShowBg(0);
    SetVBlankCallback(VBlankCB_MainMenu);
  }

  private Task_UpdateVisualSelection(taskId: number): void {
    const t = tasks.tasks[taskId];
    MoveWindowByMenuTypeAndCursorPos(t.data[0], t.data[1]);
    t.func = (id) => this.Task_HandleMenuInput(id);
  }

  private Task_HandleMenuInput(taskId: number): void {
    if (!gPaletteFade.active && this.HandleMenuInput(taskId))
      tasks.tasks[taskId].func = (id) => this.Task_UpdateVisualSelection(id);
  }

  private HandleMenuInput(taskId: number): boolean {
    const t = tasks.tasks[taskId];
    if (JOY_NEW(A_BUTTON)) {
      sound.playSE(C.SE_SELECT);
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      t.func = (id) => this.Task_ExecuteMainMenuSelection(id);
    } else if (JOY_NEW(B_BUTTON)) {
      sound.playSE(C.SE_SELECT);
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, 240));
      SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(0, 160));
      t.func = (id) => this.Task_ReturnToTileScreen(id);
    } else if (JOY_NEW(DPAD_UP) && t.data[1] > 0) {
      t.data[1]--;
      return true;
    } else if (JOY_NEW(DPAD_DOWN) && t.data[1] < sMenuCursorYMax[t.data[0]]) {
      t.data[1]++;
      return true;
    }
    return false;
  }

  private Task_ExecuteMainMenuSelection(taskId: number): void {
    if (gPaletteFade.active) return;
    const t = tasks.tasks[taskId];
    let action: number;
    switch (t.data[0]) {
      case MAIN_MENU_CONTINUE:
        action = t.data[1] === 1 ? MAIN_MENU_NEWGAME : MAIN_MENU_CONTINUE;
        break;
      case MAIN_MENU_MYSTERYGIFT:
        if (t.data[1] === 2) {
          // IsWirelessAdapterConnected() is always FALSE in the browser.
          SetStdFrame0OnBg(0);
          t.func = (id) => this.Task_MysteryGiftError(id);
          BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
          return;
        }
        action = t.data[1] === 1 ? MAIN_MENU_NEWGAME : MAIN_MENU_CONTINUE;
        break;
      default:
        action = MAIN_MENU_NEWGAME;
        break;
    }
    if (action === MAIN_MENU_CONTINUE) {
      gPlttBufferUnfaded[0] = RGB_BLACK;
      gPlttBufferFaded[0] = RGB_BLACK;
    }
    FreeAllWindowBuffers();
    tasks.destroy(taskId);
    this.exit(action === MAIN_MENU_CONTINUE ? "continue" : "newgame");
  }

  private Task_MysteryGiftError(taskId: number): void {
    const t = tasks.tasks[taskId];
    switch (t.data[9]) {
      case 0:
        FillBgTilemapBufferRect_Palette0(0, 0, 0, 0, 30, 20);
        PrintMessageOnWindow4(text(t.data[10] === 1 ? "gText_WirelessNotConnected" : "gText_MysteryGiftCantUse"));
        t.data[9]++;
        break;
      case 1:
        if (!gPaletteFade.active) t.data[9]++;
        break;
      case 2:
        RunTextPrinters();
        if (!IsTextPrinterActive(WIN_ERROR)) t.data[9]++;
        break;
      case 3:
        if (JOY_NEW(A_BUTTON | B_BUTTON)) {
          sound.playSE(C.SE_SELECT);
          BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
          t.func = (id) => this.Task_ReturnToTileScreen(id);
        }
        break;
    }
  }

  private Task_ReturnToTileScreen(taskId: number): void {
    if (gPaletteFade.active) return;
    tasks.destroy(taskId);
    this.exit("title");
  }

  private exit(result: MainMenuResult): void {
    SetMainCallback2(null);
    SetVBlankCallback(null);
    gMain.callback1 = null;
    this.result = result;
  }
}

function CB2_MainMenu(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

function VBlankCB_MainMenu(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function MoveWindowByMenuTypeAndCursorPos(menuType: number, cursorPos: number): void {
  let top: number;
  let bot: number;
  SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(18, 222));
  if (menuType === MAIN_MENU_NEWGAME) {
    top = 0x00;
    bot = 0x20;
  } else if (cursorPos === 1) {
    top = 0x60;
    bot = 0x80;
  } else if (cursorPos === 2) {
    top = 0x80;
    bot = 0xa0;
  } else {
    top = 0x00;
    bot = 0x60;
  }
  SetGpuReg(REG_OFFSET_WIN0V, (((top + 2) << 8) | (bot - 2)) & 0xffff);
}

function PrintMessageOnWindow4(str: ArrayLike<number>): void {
  FillWindowPixelBuffer(WIN_ERROR, PIXEL_FILL(10));
  MainMenu_DrawWindow(sWindowTemplate[WIN_ERROR]);
  AddTextPrinterParameterized3(WIN_ERROR, FONT_NORMAL, 0, 2, sTextColor1, 2, str);
  PutWindowTilemap(WIN_ERROR);
  CopyWindowToVram(WIN_ERROR, COPYWIN_GFX);
  SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(19, 221));
  SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(115, 157));
}

function PrintContinueStats(): void {
  const label = (y: number, str: ArrayLike<number>) => AddTextPrinterParameterized3(WIN_CONTINUE, FONT_NORMAL, 2, y, sTextColor2, -1, str);
  const value = (y: number, str: ArrayLike<number>) => AddTextPrinterParameterized3(WIN_CONTINUE, FONT_NORMAL, 62, y, sTextColor2, -1, str);
  PrintPlayerName(label, value);
  PrintDexCount(label, value);
  PrintPlayTime(label, value);
  PrintBadgeCount(label, value);
}

type ContinueStatsPrinter = (y: number, str: ArrayLike<number>) => void;

function PrintPlayerName(label: ContinueStatsPrinter, value: ContinueStatsPrinter): void {
  label(18, text("gText_Player"));
  const name = save.playerName.slice(0, C.PLAYER_NAME_LENGTH);
  value(18, [...name, 0xff]);
}

function PrintDexCount(label: ContinueStatsPrinter, value: ContinueStatsPrinter): void {
  if (flagGet(C.FLAG_SYS_POKEDEX_GET)) {
    const national = varGet(C.VAR_NATIONAL_DEX) === 0x6258 && flagGet(C.FLAG_SYS_NATIONAL_DEX);
    const limit = national ? C.NATIONAL_DEX_COUNT : C.KANTO_DEX_COUNT;
    let count = 0;
    for (let n = 0; n < limit; n++) {
      const mask = 1 << (n & 7);
      if (save.pokedexCaught[n >> 3] & mask && save.pokedexSeen[n >> 3] & mask) count++;
    }
    label(50, text("gText_Pokedex"));
    value(50, concatStr(intToDecimal(count, STR_CONV_MODE_LEFT_ALIGN, 3), text("gTextJPDummy_Hiki")));
  }
}

function PrintPlayTime(label: ContinueStatsPrinter, value: ContinueStatsPrinter): void {
  const totalMinutes = Math.floor(save.playTimeFrames / 3600);
  const hours = Math.min(999, Math.floor(totalMinutes / 60));
  const minutes = hours === 999 ? 59 : totalMinutes % 60;
  label(34, text("gText_Time"));
  const time = concatStr(intToDecimal(hours, STR_CONV_MODE_LEFT_ALIGN, 3), [C.CHAR_COLON, 0xff]);
  value(34, concatStr(time, intToDecimal(minutes, STR_CONV_MODE_LEADING_ZEROS, 2)));
}

function PrintBadgeCount(label: ContinueStatsPrinter, value: ContinueStatsPrinter): void {
  let badges = 0;
  for (let f = C.FLAG_BADGE01_GET; f < C.FLAG_BADGE01_GET + 8; f++) if (flagGet(f)) badges++;
  label(66, text("gText_Badges"));
  value(66, concatStr(intToDecimal(badges, STR_CONV_MODE_LEADING_ZEROS, 1), text("gTextJPDummy_Ko")));
}

function LoadUserFrameToBg(bgId: number): void {
  const type = save.options.frameType < 10 ? save.options.frameType : 0;
  LoadBgTiles(bgId, incbin(`sUserFrame_Type${type + 1}_Gfx`), 0x120, 0x1b1);
  LoadPalette(incbin(`sUserFrame_Type${type + 1}_Pal`), 2 * 16, 32);
  MainMenu_EraseWindow(sWindowTemplate[WIN_ERROR]);
}

/** SetStdFrame0OnBg -> LoadStdWindowGfx(window 0, 0x1B1, BG_PLTT_ID(2)) */
function SetStdFrame0OnBg(bgId: number): void {
  LoadBgTiles(bgId, incbin("gStdTextWindow_Gfx"), 0x120, 0x1b1);
  // GetTextWindowPalette(3) is the standard window palette; the frame palette already loaded is kept.
  MainMenu_EraseWindow(sWindowTemplate[WIN_ERROR]);
}

function MainMenu_DrawWindow(w: WindowTemplate): void {
  const F = (tile: number, x: number, y: number, width: number, height: number) => FillBgTilemapBufferRect(w.bg, tile, x, y, width, height, 2);
  F(0x1b1, w.tilemapLeft - 1, w.tilemapTop - 1, 1, 1);
  F(0x1b2, w.tilemapLeft, w.tilemapTop - 1, w.width, w.height);
  F(0x1b3, w.tilemapLeft + w.width, w.tilemapTop - 1, 1, 1);
  F(0x1b4, w.tilemapLeft - 1, w.tilemapTop, 1, w.height);
  F(0x1b6, w.tilemapLeft + w.width, w.tilemapTop, 1, w.height);
  F(0x1b7, w.tilemapLeft - 1, w.tilemapTop + w.height, 1, 1);
  F(0x1b8, w.tilemapLeft, w.tilemapTop + w.height, w.width, 1);
  F(0x1b9, w.tilemapLeft + w.width, w.tilemapTop + w.height, 1, 1);
  CopyBgTilemapBufferToVram(w.bg);
}

function MainMenu_EraseWindow(w: WindowTemplate): void {
  FillBgTilemapBufferRect(w.bg, 0, w.tilemapLeft - 1, w.tilemapTop - 1, w.tilemapLeft + w.width + 1, w.tilemapTop + w.height + 1, 2);
  CopyBgTilemapBufferToVram(w.bg);
}

void ClearWindowTilemap;
