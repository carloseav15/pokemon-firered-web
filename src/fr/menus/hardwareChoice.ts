// Shared hardware-window adapter for menu logic while dedicated party/summary
// graphics are being ported. Runs under gMain, pauses battle callbacks and
// returns only after an explicit selection or allowed cancellation.
import { encode } from "../gba/charmap";
import { joy, A_BUTTON, B_BUTTON, DPAD_UP, DPAD_DOWN } from "../gba/input";
import { FONT_NORMAL } from "../gba/font";
import { InitGpuRegManager, SetGpuReg } from "../hw/gpu";
import { InitBgsFromTemplates, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg } from "../hw/bg";
import { gMain, SetMainCallback1, SetMainCallback2, SetHBlankCallback, SetVBlankCallback } from "../hw/runtime";
import { ppu, REG_OFFSET_DISPCNT } from "../hw/ppu";
import { LoadPalette, ResetPaletteFade, TransferPlttBuffer } from "../hw/palette";
import { GetTextWindowPalette } from "../hw/menu";
import { DeactivateAllTextPrinters, AddTextPrinterParameterized3 } from "../hw/text";
import { COPYWIN_FULL, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PutWindowTilemap } from "../hw/window";
import { sound } from "../audio/sound";

export type HardwareChoice = { label: string; value: number; disabled?: boolean };
export function openHardwareChoice(title: string, choices: HardwareChoice[], canCancel: boolean, done: (value: number | null) => void): void {
  const callback1 = gMain.callback1;
  SetMainCallback1(null);
  SetMainCallback2(() => {
    SetVBlankCallback(null); SetHBlankCallback(null);
    InitGpuRegManager(); FreeAllWindowBuffers(); DeactivateAllTextPrinters(); ResetPaletteFade();
    ppu.vram.fill(0); ppu.oam.fill(0);
    ResetBgsAndClearDma3BusyFlags(false);
    InitBgsFromTemplates(0, [{bg: 0, charBaseIndex: 0, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0}]);
    SetBgTilemapBuffer(0, new Uint16Array(1024));
    InitWindows([{bg: 0, tilemapLeft: 1, tilemapTop: 1, width: 28, height: 18, paletteNum: 15, baseBlock: 1}]);
    LoadPalette(GetTextWindowPalette(0), 240, 32);
    SetGpuReg(REG_OFFSET_DISPCNT, 0); ShowBg(0);
    let cursor = 0, scroll = 0;
    const rows = canCancel ? [...choices, {label: "CANCEL", value: -1}] : choices;
    const draw = (): void => {
      FillWindowPixelBuffer(0, 0x11);
      AddTextPrinterParameterized3(0, FONT_NORMAL, 4, 0, [1, 2, 3], 0, encode(title));
      if (cursor < scroll) scroll = cursor;
      if (cursor >= scroll + 7) scroll = cursor - 6;
      rows.slice(scroll, scroll + 7).forEach((choice, i) => AddTextPrinterParameterized3(0, FONT_NORMAL, 4, 26 + i * 16, choice.disabled ? [1, 3, 2] : [1, 2, 3], 0, encode(`${cursor === scroll + i ? ">" : " "} ${choice.label}`)));
      PutWindowTilemap(0); CopyWindowToVram(0, COPYWIN_FULL);
    };
    const finish = (value: number | null): void => {
      FreeAllWindowBuffers(); SetVBlankCallback(null); SetMainCallback1(callback1);
      SetMainCallback2(null);
      done(value);
    };
    draw();
    SetVBlankCallback(TransferPlttBuffer);
    SetMainCallback2(() => {
      if (canCancel && joy.newKeys & B_BUTTON) { finish(null); return; }
      if (joy.newKeys & A_BUTTON) {
        const choice = rows[cursor];
        if (choice && !choice.disabled) { sound.playSE(sound.SE_SELECT); finish(choice.value === -1 ? null : choice.value); }
        return;
      }
      if (joy.repeated & DPAD_UP) { cursor = Math.max(0, cursor - 1); draw(); }
      else if (joy.repeated & DPAD_DOWN) { cursor = Math.min(rows.length - 1, cursor + 1); draw(); }
    });
  });
}
