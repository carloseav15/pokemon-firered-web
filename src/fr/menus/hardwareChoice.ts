// Shared hardware-window adapter for menu logic while dedicated party/summary
// graphics are being ported. Runs under gMain, pauses battle callbacks and
// returns only after an explicit selection or allowed cancellation.
import { encode } from "../gba/charmap";
import { joy, A_BUTTON, B_BUTTON, DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT } from "../gba/input";
import { FONT_NORMAL } from "../gba/font";
import { InitGpuRegManager, SetGpuReg } from "../hw/gpu";
import { InitBgsFromTemplates, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg } from "../hw/bg";
import { gMain, SetMainCallback1, SetMainCallback2, SetHBlankCallback, SetVBlankCallback } from "../hw/runtime";
import { DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_DISPCNT } from "../hw/ppu";
import { LoadPalette, ResetPaletteFade, TransferPlttBuffer } from "../hw/palette";
import { FONTATTR_MAX_LETTER_HEIGHT, GetFontAttribute, GetTextWindowPalette } from "../hw/menu";
import {
  AddScrollIndicatorArrowPairParameterized, DestroyListMenuTask, LIST_CANCEL, LIST_MULTIPLE_SCROLL_DPAD, ListMenu_ProcessInput, ListMenuDefaultCursorMoveFunc,
  ListMenuGetScrollAndRow, ListMenuInit, listMenuTemplate, ListMenuOverrideSetColors, RemoveScrollIndicatorArrowPair, SCROLL_ARROW_UP,
  StepScrollIndicatorArrowPair, type ListMenuItem,
} from "../hw/listMenu";
import { BuildOamBuffer, gSprites, LoadOam, ProcessSpriteCopyRequests } from "../hw/sprite";
import { DeactivateAllTextPrinters, AddTextPrinterParameterized2, AddTextPrinterParameterized3, IsTextPrinterActive, RunTextPrinters } from "../hw/text";
import { getTextSpeedSetting } from "../gba/textPrinter";
import { COPYWIN_FULL, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PIXEL_FILL, PutWindowTilemap } from "../hw/window";
import { sound } from "../audio/sound";

export type HardwareChoice = { label: string | ArrayLike<number>; value: number; disabled?: boolean };

const CHOICE_ROWS = 7;
const CHOICE_ARROW_TAG = 0x5a10;

/**
 * A titled list on the source ListMenu (list_menu.c): printed selector arrow,
 * 16px rows, D-pad paging and the red scroll indicator arrows
 * (menu_indicators.c). Disabled rows print grey and ignore A. Only this
 * menu's own sprites animate while it is open; any sprites of the calling
 * screen stay hidden until it closes.
 */
export function openHardwareChoice(title: string | ArrayLike<number>, choices: HardwareChoice[], canCancel: boolean, done: (value: number | null) => void): void {
  const titleBytes = typeof title === "string" ? encode(title) : title;
  const callback1 = gMain.callback1;
  SetMainCallback1(null);
  SetMainCallback2(() => {
    SetVBlankCallback(null); SetHBlankCallback(null);
    InitGpuRegManager(); FreeAllWindowBuffers(); DeactivateAllTextPrinters(); ResetPaletteFade();
    ppu.vram.fill(0); ppu.oam.fill(0);
    ResetBgsAndClearDma3BusyFlags(false);
    InitBgsFromTemplates(0, [{bg: 0, charBaseIndex: 0, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0}]);
    SetBgTilemapBuffer(0, new Uint16Array(1024));
    InitWindows([
      {bg: 0, tilemapLeft: 1, tilemapTop: 1, width: 28, height: 2, paletteNum: 15, baseBlock: 1},
      {bg: 0, tilemapLeft: 1, tilemapTop: 4, width: 28, height: 2 * CHOICE_ROWS, paletteNum: 15, baseBlock: 1 + 28 * 2},
    ]);
    LoadPalette(GetTextWindowPalette(0), 240, 32);
    SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_ON | DISPCNT_OBJ_1D_MAP); ShowBg(0);

    const hidden = gSprites.filter((sp) => sp.inUse && !sp.invisible);
    for (const sp of hidden) sp.invisible = true;

    const rows = canCancel ? [...choices, {label: "CANCEL", value: -1}] : choices;
    const items: ListMenuItem[] = rows.map((row, index) => ({label: typeof row.label === "string" ? encode(row.label) : row.label, index}));
    FillWindowPixelBuffer(0, PIXEL_FILL(1));
    AddTextPrinterParameterized3(0, FONT_NORMAL, 4, 1, [1, 2, 3], 0, titleBytes);
    PutWindowTilemap(0); CopyWindowToVram(0, COPYWIN_FULL);
    const rowHeight = GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT) + 2;
    const listTaskId = ListMenuInit(listMenuTemplate({
      items, windowId: 1, totalItems: items.length, maxShowed: CHOICE_ROWS, item_X: 12, cursor_X: 2, upText_Y: 1,
      itemVerticalPadding: 2, fontId: FONT_NORMAL, scrollMultiple: LIST_MULTIPLE_SCROLL_DPAD, moveCursorFunc: ListMenuDefaultCursorMoveFunc,
      itemPrintFunc: (_windowId, index) => { if (rows[index]?.disabled) ListMenuOverrideSetColors(3, 1, 2); },
    }), 0, 0);
    const shown = Math.min(CHOICE_ROWS, items.length);
    const arrows = items.length > CHOICE_ROWS
      ? AddScrollIndicatorArrowPairParameterized(SCROLL_ARROW_UP, 120, 4 * 8 - 4, 4 * 8 + shown * rowHeight + 4, items.length - CHOICE_ROWS,
        CHOICE_ARROW_TAG, CHOICE_ARROW_TAG, () => ListMenuGetScrollAndRow(listTaskId).cursorPos)
      : null;

    const finish = (value: number | null): void => {
      if (arrows !== null) RemoveScrollIndicatorArrowPair(arrows);
      DestroyListMenuTask(listTaskId);
      for (const sp of hidden) if (sp.inUse) sp.invisible = false;
      FreeAllWindowBuffers(); SetVBlankCallback(null); SetMainCallback1(callback1);
      SetMainCallback2(null);
      done(value);
    };
    SetVBlankCallback(() => { LoadOam(); ProcessSpriteCopyRequests(); TransferPlttBuffer(); });
    SetMainCallback2(() => {
      const input = ListMenu_ProcessInput(listTaskId);
      if (input === LIST_CANCEL) {
        if (canCancel) { sound.playSE(sound.SE_SELECT); finish(null); return; }
      } else if (input >= 0) {
        const choice = rows[input];
        if (choice && !choice.disabled) { sound.playSE(sound.SE_SELECT); finish(choice.value === -1 ? null : choice.value); return; }
      }
      if (arrows !== null) StepScrollIndicatorArrowPair(arrows);
      BuildOamBuffer();
    });
  });
}

/**
 * A dialogue-style message printed at the player's text speed (the GBA string
 * keeps its \p / {PAUSE_UNTIL_PRESS} controls). Calls `next` once the text is
 * done and A or B has been pressed.
 */
export function openHardwareMessage(message: ArrayLike<number>, next: () => void): void {
  const callback1 = gMain.callback1;
  SetMainCallback1(null);
  SetMainCallback2(() => {
    SetVBlankCallback(null); SetHBlankCallback(null);
    InitGpuRegManager(); FreeAllWindowBuffers(); DeactivateAllTextPrinters(); ResetPaletteFade();
    ppu.vram.fill(0); ppu.oam.fill(0);
    ResetBgsAndClearDma3BusyFlags(false);
    InitBgsFromTemplates(0, [{bg: 0, charBaseIndex: 0, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0}]);
    SetBgTilemapBuffer(0, new Uint16Array(1024));
    InitWindows([{bg: 0, tilemapLeft: 2, tilemapTop: 15, width: 26, height: 4, paletteNum: 15, baseBlock: 1}]);
    LoadPalette(GetTextWindowPalette(0), 240, 32);
    SetGpuReg(REG_OFFSET_DISPCNT, 0); ShowBg(0);
    FillWindowPixelBuffer(0, 0x11);
    PutWindowTilemap(0); CopyWindowToVram(0, COPYWIN_FULL);
    AddTextPrinterParameterized2(0, FONT_NORMAL, message, getTextSpeedSetting(), null, 2, 1, 3);
    SetVBlankCallback(TransferPlttBuffer);
    SetMainCallback2(() => {
      RunTextPrinters();
      CopyWindowToVram(0, COPYWIN_FULL);
      if (IsTextPrinterActive(0)) return;
      if (joy.newKeys & (A_BUTTON | B_BUTTON)) {
        FreeAllWindowBuffers(); SetVBlankCallback(null); SetMainCallback1(callback1);
        SetMainCallback2(null);
        next();
      }
    });
  });
}

/** The ×NN quantity selector (item_menu.c / item_pc.c): up/down ±1, left/right ±10. */
export function openHardwareQuantity(title: string | ArrayLike<number>, max: number, done: (value: number | null) => void): void {
  const titleBytes = typeof title === "string" ? encode(title) : title;
  const callback1 = gMain.callback1;
  SetMainCallback1(null);
  SetMainCallback2(() => {
    SetVBlankCallback(null); SetHBlankCallback(null);
    InitGpuRegManager(); FreeAllWindowBuffers(); DeactivateAllTextPrinters(); ResetPaletteFade();
    ppu.vram.fill(0); ppu.oam.fill(0);
    ResetBgsAndClearDma3BusyFlags(false);
    InitBgsFromTemplates(0, [{bg: 0, charBaseIndex: 0, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0}]);
    SetBgTilemapBuffer(0, new Uint16Array(1024));
    InitWindows([{bg: 0, tilemapLeft: 1, tilemapTop: 1, width: 28, height: 6, paletteNum: 15, baseBlock: 1}]);
    LoadPalette(GetTextWindowPalette(0), 240, 32);
    SetGpuReg(REG_OFFSET_DISPCNT, 0); ShowBg(0);
    let value = 1;
    const draw = (): void => {
      FillWindowPixelBuffer(0, 0x11);
      AddTextPrinterParameterized3(0, FONT_NORMAL, 4, 0, [1, 2, 3], 0, titleBytes);
      AddTextPrinterParameterized3(0, FONT_NORMAL, 4, 26, [1, 2, 3], 0, encode(`×${String(value).padStart(String(max).length, "0")}`));
      PutWindowTilemap(0); CopyWindowToVram(0, COPYWIN_FULL);
    };
    const finish = (v: number | null): void => {
      FreeAllWindowBuffers(); SetVBlankCallback(null); SetMainCallback1(callback1);
      SetMainCallback2(null);
      done(v);
    };
    draw();
    SetVBlankCallback(TransferPlttBuffer);
    SetMainCallback2(() => {
      if (joy.newKeys & B_BUTTON) { sound.playSE(sound.SE_SELECT); finish(null); return; }
      if (joy.newKeys & A_BUTTON) { sound.playSE(sound.SE_SELECT); finish(value); return; }
      const old = value;
      if (joy.repeated & DPAD_UP) value = value >= max ? 1 : value + 1;
      else if (joy.repeated & DPAD_DOWN) value = value <= 1 ? max : value - 1;
      else if (joy.repeated & DPAD_RIGHT) value = Math.min(max, value + 10);
      else if (joy.repeated & DPAD_LEFT) value = Math.max(1, value - 10);
      if (value !== old) { sound.playSE(sound.SE_SELECT); draw(); }
    });
  });
}
