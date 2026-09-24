// intro.c: the copyright screen, excluding the GameCube serial multiboot path.
// Uses the extracted INCBIN bytes and the browser GBA register/VRAM model.
import { incbin, preloadIncbin } from "./hw/assets";
import { copyToVram } from "./hw/bg";
import { CopyBufferedValuesToGpuRegs, InitGpuRegManager, SetGpuReg } from "./hw/gpu";
import {
  BeginNormalPaletteFade, gPaletteFade, LoadPalette, PALETTES_ALL,
  ResetPaletteFade, RGB_BLACK, RGB_WHITEALPHA, TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import {
  DISPCNT_BG0_ON, DISPCNT_OBJ_1D_MAP, ppu, REG_OFFSET_BG0CNT,
  REG_OFFSET_BLDCNT, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT,
} from "./hw/ppu";

const symbols = ["sCopyright_Gfx", "sCopyright_Map", "sCopyright_Pal"];

export class IntroCopyright {
  private frame = 0;
  private fadingOut = false;
  done = false;

  static async preload(): Promise<void> {
    await preloadIncbin(symbols);
  }

  begin(): void {
    this.frame = 0;
    this.fadingOut = false;
    this.done = false;
    InitGpuRegManager();
    ResetPaletteFade();
    ppu.resetIo();
    ppu.vram.fill(0);
    ppu.oam.fill(0);
    ppu.pltt.fill(0);
    SetGpuReg(REG_OFFSET_BLDCNT, 0);
    SetGpuReg(REG_OFFSET_BLDALPHA, 0);
    SetGpuReg(REG_OFFSET_BLDY, 0);
    copyToVram(incbin("sCopyright_Gfx"), 0, incbin("sCopyright_Gfx").length);
    copyToVram(incbin("sCopyright_Map"), 7 * 0x800, incbin("sCopyright_Map").length);
    LoadPalette(incbin("sCopyright_Pal"), 0, 32);
    // BGCNT_PRIORITY(0) | BGCNT_CHARBASE(0) | BGCNT_16COLOR | BGCNT_SCREENBASE(7)
    SetGpuReg(REG_OFFSET_BG0CNT, 7 << 8);
    SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_BG0_ON);
    CopyBufferedValuesToGpuRegs();
    BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_WHITEALPHA);
    TransferPlttBuffer();
  }

  update(): void {
    if (this.done) return;
    this.frame++;
    UpdatePaletteFade();
    TransferPlttBuffer();
    if (this.frame === 140) {
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      this.fadingOut = true;
    }
    if (this.fadingOut && !gPaletteFade.active) this.done = true;
    CopyBufferedValuesToGpuRegs();
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.putImageData(ppu.renderFrame(), 0, 0);
  }
}
