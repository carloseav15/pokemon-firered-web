// mail.c ReadMail view as a field-menu adapter: the mail item name, its
// message lines and the author. Source draws the mail paper backgrounds and
// per-type layouts; this keeps the same text while that presentation is
// pending.

import { encode } from "../gba/charmap";
import { FONT_NORMAL } from "../gba/font";
import { A_BUTTON, B_BUTTON, joy } from "../gba/input";
import { InitBgsFromTemplates, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg } from "../hw/bg";
import { InitGpuRegManager, SetGpuReg } from "../hw/gpu";
import { GetTextWindowPalette } from "../hw/menu";
import { LoadPalette, ResetPaletteFade, TransferPlttBuffer } from "../hw/palette";
import { ppu, REG_OFFSET_DISPCNT } from "../hw/ppu";
import { gMain, SetHBlankCallback, SetMainCallback1, SetMainCallback2, SetVBlankCallback } from "../hw/runtime";
import { AddTextPrinterParameterized3 } from "../hw/text";
import { COPYWIN_FULL, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PutWindowTilemap } from "../hw/window";

export function openMailView(title: string, lines: string[], author: string, done: () => void): void {
  const callback1 = gMain.callback1;
  SetMainCallback1(null);
  SetMainCallback2(() => {
    SetVBlankCallback(null); SetHBlankCallback(null);
    InitGpuRegManager(); FreeAllWindowBuffers();
    ppu.vram.fill(0); ppu.oam.fill(0);
    ResetBgsAndClearDma3BusyFlags(false);
    InitBgsFromTemplates(0, [{ bg: 0, charBaseIndex: 0, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 0 }]);
    SetBgTilemapBuffer(0, new Uint16Array(1024));
    InitWindows([{ bg: 0, tilemapLeft: 1, tilemapTop: 1, width: 28, height: 18, paletteNum: 15, baseBlock: 1 }]);
    LoadPalette(GetTextWindowPalette(0), 240, 32);
    SetGpuReg(REG_OFFSET_DISPCNT, 0); ShowBg(0);
    const rows = [...lines];
    if (author !== "") rows.push(`FROM ${author}`);
    rows.push("A/B:EXIT");
    const draw = (): void => {
      FillWindowPixelBuffer(0, 0x11);
      AddTextPrinterParameterized3(0, FONT_NORMAL, 4, 0, [1, 2, 3], 0, encode(title));
      rows.forEach((row, i) =>
        AddTextPrinterParameterized3(0, FONT_NORMAL, 4, 26 + i * 16, [1, 2, 3], 0, encode(row)));
      PutWindowTilemap(0); CopyWindowToVram(0, COPYWIN_FULL);
    };
    const finish = (): void => {
      FreeAllWindowBuffers(); SetVBlankCallback(null); SetMainCallback1(callback1);
      SetMainCallback2(null);
      done();
    };
    draw();
    SetVBlankCallback(TransferPlttBuffer);
    SetMainCallback2(() => {
      if (joy.newKeys & (A_BUTTON | B_BUTTON)) finish();
    });
  });
}
