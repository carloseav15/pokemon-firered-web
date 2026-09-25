// diploma.c: the Pokédex completion diploma (Kanto, or National with every mon).

import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { FONT_NORMAL, stringWidth } from "./gba/font";
import { joy, A_BUTTON } from "./gba/input";
import { tasks } from "./gba/tasks";
import { incbin } from "./hw/assets";
import { BG_COORD_SET, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer, FillBgTilemapBufferRect_Palette0, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg } from "./hw/bg";
import { InitGpuRegManager, SetGpuReg } from "./hw/gpu";
import { BeginNormalPaletteFade, gPaletteFade, LoadPalette, PALETTES_ALL, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade } from "./hw/palette";
import { DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_BG1HOFS, REG_OFFSET_DISPCNT } from "./hw/ppu";
import { HwScene, SetMainCallback2, SetVBlankCallback } from "./hw/runtime";
import { AnimateSprites, BuildOamBuffer, FreeAllSpritePalettes, LoadOam, ProcessSpriteCopyRequests, ResetSpriteData } from "./hw/sprite";
import { AddTextPrinterParameterized3, DeactivateAllTextPrinters } from "./hw/text";
import { FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PutWindowTilemap } from "./hw/window";
import { rom } from "./rom";
import { save } from "./save";
import { hasAllNationalDexSpecies } from "./pokemon/pokemon";
import type { Game } from "./game";

/** DynamicPlaceholderTextUtil_ExpandPlaceholders: F7 nn → placeholder nn. */
function expandDynamic(src: Uint8Array, placeholders: Uint8Array[]): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < src.length && src[i] !== 0xff; i++) {
    if (src[i] === 0xf7) { for (const b of placeholders[src[++i]] ?? []) { if (b === 0xff) break; out.push(b); } }
    else out.push(src[i]);
  }
  out.push(0xff);
  return Uint8Array.from(out);
}

/** ShowDiploma → CB2_ShowDiploma; the script resumes on return (CB2_ReturnToFieldFromDiploma). */
export function showDiploma(game: Game): void {
  const ow = game.overworld;
  ow.script.stop();
  const scene = new HwScene();
  scene.enter();
  game.scene = scene;
  game.setCallbacks(null, () => scene.update());
  const hasAllMons = hasAllNationalDexSpecies();
  let initState = 0, mainState = 0;
  const finish = (): void => {
    FreeAllWindowBuffers();
    scene.leave();
    game.scene = null;
    game.setCallbacks(() => ow.cb1(), () => ow.cb2());
    ow.fieldCBContinueScript(true);
  };
  const input = (id: number): void => {
    if (mainState === 0) { if (sound.isFanfareTaskInactive()) mainState = 1; }
    else if (mainState === 1) { if (joy.newKeys & A_BUTTON) { BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK); mainState = 2; } }
    else if (!gPaletteFade.active) { tasks.destroy(id); finish(); }
  };
  const init = (id: number): void => {
    switch (initState) {
      case 0: SetVBlankCallback(null); break;
      case 1:
        ppu.vram.fill(0); ppu.oam.fill(0); ppu.pltt.fill(0);
        InitGpuRegManager();
        SetGpuReg(REG_OFFSET_DISPCNT, 0);
        ResetBgsAndClearDma3BusyFlags(false);
        InitBgsFromTemplates(0, [
          { bg: 0, charBaseIndex: 0, mapBaseIndex: 31, screenSize: 0, paletteMode: 0, priority: 0, baseTile: 1 },
          { bg: 1, charBaseIndex: 1, mapBaseIndex: 29, screenSize: 1, paletteMode: 0, priority: 1, baseTile: 0 },
        ]);
        for (let bg = 0; bg < 4; bg++) { ChangeBgX(bg, 0, BG_COORD_SET); ChangeBgY(bg, 0, BG_COORD_SET); }
        InitWindows([{ bg: 0, tilemapLeft: 0, tilemapTop: 2, width: 29, height: 16, paletteNum: 15, baseBlock: 0 }]);
        DeactivateAllTextPrinters();
        SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
        SetBgTilemapBuffer(1, new Uint16Array(0x800));
        ShowBg(0); ShowBg(1);
        FillBgTilemapBufferRect_Palette0(0, 0, 0, 0, 30, 20);
        FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 30, 20);
        break;
      case 2: {
        const gfx = incbin("sDiplomaGfx");
        LoadBgTiles(1, gfx, gfx.length, 0);
        LoadPalette(incbin("sDiplomaPal"), 0, incbin("sDiplomaPal").length);
        break;
      }
      case 3: {
        const map = incbin("sDiplomaTilemap");
        const words = new Uint16Array(map.length >> 1);
        for (let i = 0; i < words.length; i++) words[i] = map[i * 2] | (map[i * 2 + 1] << 8);
        CopyToBgTilemapBuffer(1, words, 0, 0);
        break;
      }
      case 4: SetGpuReg(REG_OFFSET_BG1HOFS, hasAllMons ? 0x100 : 0); break;
      case 5: {
        const colors = [0, 2, 3];
        const placeholders = [Uint8Array.from(save.playerName), rom.text(hasAllMons ? "gText_Diploma_National" : "gText_Diploma_Kanto")];
        FillWindowPixelBuffer(0, 0);
        let str = expandDynamic(rom.text("gText_Diploma_Player"), placeholders);
        AddTextPrinterParameterized3(0, FONT_NORMAL, 120 - Math.floor(stringWidth(FONT_NORMAL, str, -1) / 2), 4, colors, -1, str);
        str = expandDynamic(rom.text("gText_Diploma_ThisDocument"), placeholders);
        AddTextPrinterParameterized3(0, FONT_NORMAL, 120 - Math.floor(stringWidth(FONT_NORMAL, str, -1) / 2), 30, colors, -1, str);
        AddTextPrinterParameterized3(0, FONT_NORMAL, 120, 105, colors, 0, rom.text("gText_Diploma_GameFreak"));
        PutWindowTilemap(0);
        break;
      }
      case 6: CopyBgTilemapBufferToVram(0); CopyBgTilemapBufferToVram(1); break;
      case 7: BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK); break;
      case 8: SetVBlankCallback(() => { LoadOam(); ProcessSpriteCopyRequests(); TransferPlttBuffer(); }); break;
      default:
        if (gPaletteFade.active) break;
        sound.playFanfare(C.MUS_OBTAIN_BADGE);
        tasks.setFunc(id, input);
    }
    initState++;
  };
  ResetSpriteData(); ResetPaletteFade(); FreeAllSpritePalettes(); tasks.reset();
  tasks.create(init, 0);
  SetMainCallback2(() => { tasks.run(); AnimateSprites(); BuildOamBuffer(); UpdatePaletteFade(); });
}
