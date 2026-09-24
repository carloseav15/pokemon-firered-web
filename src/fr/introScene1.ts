// intro.c: IntroCB_Scene1, Scene1_Task_AnimateGrass and Scene1_Task_BgZoom.
import { cdata, incbin, loadCData, preloadIncbin } from "./hw/assets";
import {
  BG_COORD_SET, BG_COORD_SUB, type BgTemplate, ChangeBgY,
  HideBg, InitBgsFromTemplates, LoadBgTilemap, LoadBgTiles, ShowBg,
} from "./hw/bg";
import { CopyBufferedValuesToGpuRegs } from "./hw/gpu";
import {
  BeginNormalPaletteFade, BlendPalettes, gPaletteFade, LoadPalette,
  PALETTES_ALL, RGB_WHITE, TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import { ppu } from "./hw/ppu";

const symbols = [
  "sScene1_Grass_Pal", "sScene1_Bg_Pal", "sScene1_Bg_Gfx",
  "sScene1_Bg_Map", "sScene1_Grass_Gfx", "sScene1_Grass_Map",
];
const scenePalettes = (1 << 1) | (1 << 2);

export class IntroScene1 {
  private state = 0;
  private timer = 0;
  private grassTimer = 0;
  private grassFrame = 0;
  private grassScroll = 0;
  private zoomTimer = 0;
  private zoomFrame = 0;
  done = false;

  static async preload(): Promise<void> {
    await Promise.all([preloadIncbin(symbols), loadCData("intro")]);
  }

  begin(): void {
    this.state = 0;
    this.timer = 0;
    this.grassTimer = 0;
    this.grassFrame = 0;
    this.grassScroll = 0;
    this.zoomTimer = 0;
    this.zoomFrame = 0;
    this.done = false;
  }

  update(): void {
    if (this.done) return;
    if (this.state >= 3) this.animateGrass();
    if (this.state === 4 && this.timer >= 20) this.zoomBackground();

    // Source callbacks are invoked once per 60 Hz task frame. Decompression
    // and DMA are synchronous after preload in the browser hardware model.
    switch (this.state) {
      case 0:
        LoadPalette(incbin("sScene1_Grass_Pal"), 16, 32);
        LoadPalette(incbin("sScene1_Bg_Pal"), 32, 32);
        BlendPalettes(scenePalettes, 16, RGB_WHITE);
        InitBgsFromTemplates(0, cdata<BgTemplate[]>("intro", "sBgTemplates_Scene1"));
        LoadBgTiles(1, incbin("sScene1_Bg_Gfx"), incbin("sScene1_Bg_Gfx").length, 0);
        LoadBgTilemap(1, incbin("sScene1_Bg_Map"), incbin("sScene1_Bg_Map").length, 0);
        ShowBg(1);
        HideBg(0);
        HideBg(2);
        HideBg(3);
        this.state++;
        break;
      case 1:
        LoadBgTiles(0, incbin("sScene1_Grass_Gfx"), incbin("sScene1_Grass_Gfx").length, 0);
        LoadBgTilemap(0, incbin("sScene1_Grass_Map"), incbin("sScene1_Grass_Map").length, 0);
        ChangeBgY(0, 0, BG_COORD_SET);
        ChangeBgY(1, 0, BG_COORD_SET);
        this.state++;
        break;
      case 2:
        ShowBg(0);
        BeginNormalPaletteFade(scenePalettes, -2, 16, 0, RGB_WHITE);
        this.state++;
        break;
      case 3:
        if (!gPaletteFade.active) { this.timer = 0; this.state++; }
        break;
      case 4:
        if (++this.timer >= 30) {
          BlendPalettes(PALETTES_ALL & ~1, 16, RGB_WHITE);
          this.done = true;
        }
        break;
    }
    UpdatePaletteFade();
    CopyBufferedValuesToGpuRegs();
    TransferPlttBuffer();
  }

  private animateGrass(): void {
    if (++this.grassTimer > 5) {
      this.grassTimer = 0;
      this.grassFrame = (this.grassFrame + 1) % 3;
      ChangeBgY(0, this.grassFrame << 15, BG_COORD_SET);
    }
    if (this.state === 4 && this.timer >= 20) {
      this.grassScroll += 0x120;
      ChangeBgY(0, this.grassScroll, BG_COORD_SUB);
    }
  }

  private zoomBackground(): void {
    if (++this.zoomTimer > 3) {
      this.zoomTimer = 0;
      this.zoomFrame = Math.min(2, this.zoomFrame + 1);
      ChangeBgY(1, this.zoomFrame << 15, BG_COORD_SET);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.putImageData(ppu.renderFrame(), 0, 0);
  }
}
