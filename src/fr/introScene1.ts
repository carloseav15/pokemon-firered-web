// intro.c: IntroCB_Scene1, Scene1_Task_AnimateGrass and Scene1_Task_BgZoom.
import { cdata, incbin, loadCData, preloadIncbin } from "./hw/assets";
import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import {
  BG_COORD_SET, BG_COORD_SUB, type BgTemplate, ChangeBgY,
  HideBg, InitBgsFromTemplates, LoadBgTilemap, LoadBgTiles, ShowBg,
} from "./hw/bg";
import { CopyBufferedValuesToGpuRegs } from "./hw/gpu";
import {
  BeginNormalPaletteFade, BlendPalettes, gPaletteFade, LoadPalette,
  PALETTES_ALL, RGB_WHITE, TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import { LoadSpritePalette, LoadSpriteSheet } from "./hw/sprite";
import { ppu } from "./hw/ppu";

const symbols = [
  "sScene1_Grass_Pal", "sScene1_Bg_Pal", "sScene1_Bg_Gfx",
  "sScene1_Bg_Map", "sScene1_Grass_Gfx", "sScene1_Grass_Map",
  "sScene2_Gengar_Gfx", "sScene2_Nidorino_Gfx", "sGengar_Pal", "sNidorino_Pal",
  "sScene3_Nidorino_Gfx", "sScene3_Grass_Gfx", "sScene3_Grass_Pal", "sScene3_GengarStatic_Gfx",
  "sScene3_Swipe_Gfx", "sScene3_Swipe_Pal", "sScene3_RecoilDust_Gfx", "sScene3_RecoilDust_Pal",
];
const scenePalettes = (1 << 1) | (1 << 2);

/** intro.c Scene 1 callbacks, adapted to the owning browser screen state. */
export function IntroCB_Scene1(scene: IntroScene1): void { scene.updateScene(); }
export function Scene1_Task_AnimateGrass(scene: IntroScene1): void { scene.animateGrassTask(); }
export function Scene1_StartGrassScrolling(scene: IntroScene1): void { scene.startGrassScrolling(); }
export function Scene1_Task_BgZoom(scene: IntroScene1): void { scene.animateBackgroundZoom(); }
/** intro.c LoadFightSceneSpriteGraphics; scene 2/3 reload after their sprite reset. */
export function LoadFightSceneSpriteGraphics(): void {
  LoadSpriteSheet({ data: incbin("sScene2_Gengar_Gfx"), size: 0x800, tag: 6 });
  LoadSpriteSheet({ data: incbin("sScene2_Nidorino_Gfx"), size: 0x800, tag: 7 });
  LoadSpriteSheet({ data: incbin("sScene3_Nidorino_Gfx"), size: 0x2800, tag: 5 });
  LoadSpriteSheet({ data: incbin("sScene3_Grass_Gfx"), size: 0x800, tag: 8 });
  LoadSpriteSheet({ data: incbin("sScene3_GengarStatic_Gfx"), size: 0x1800, tag: 9 });
  LoadSpriteSheet({ data: incbin("sScene3_Swipe_Gfx"), size: 0xa00, tag: 10 });
  LoadSpriteSheet({ data: incbin("sScene3_RecoilDust_Gfx"), size: 0x200, tag: 11 });
  LoadSpritePalette({ data: incbin("sGengar_Pal"), tag: 6 });
  LoadSpritePalette({ data: incbin("sNidorino_Pal"), tag: 7 });
  LoadSpritePalette({ data: incbin("sScene3_Grass_Pal"), tag: 8 });
  LoadSpritePalette({ data: incbin("sScene3_Swipe_Pal"), tag: 10 });
  LoadSpritePalette({ data: incbin("sScene3_RecoilDust_Pal"), tag: 11 });
}

export class IntroScene1 {
  private state = 0;
  private timer = 0;
  private grassTimer = 0;
  private grassFrame = 0;
  private grassScroll = 0;
  private grassTaskActive = false;
  private grassExiting = false;
  private zoomTimer = 0;
  private zoomFrame = 0;
  private zoomTaskActive = false;
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
    this.grassTaskActive = false;
    this.grassExiting = false;
    this.zoomTimer = 0;
    this.zoomFrame = 0;
    this.zoomTaskActive = false;
    this.done = false;
  }

  update(): void {
    if (this.done) return;
    if (this.grassTaskActive) Scene1_Task_AnimateGrass(this);
    if (this.zoomTaskActive) Scene1_Task_BgZoom(this);
    IntroCB_Scene1(this);
    UpdatePaletteFade();
    CopyBufferedValuesToGpuRegs();
    TransferPlttBuffer();
  }

  updateScene(): void {
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
        LoadFightSceneSpriteGraphics();
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
        this.grassTaskActive = true;
        this.state++;
        break;
      case 3:
        if (!gPaletteFade.active) {
          sound.playBGM(C.MUS_INTRO_FIGHT);
          this.timer = 0;
          this.state++;
        }
        break;
      case 4:
        if (++this.timer === 20) {
          this.zoomTaskActive = true;
          Scene1_StartGrassScrolling(this);
        }
        if (this.timer >= 30) {
          BlendPalettes(PALETTES_ALL & ~1, 16, RGB_WHITE);
          this.grassTaskActive = false;
          this.zoomTaskActive = false;
          this.done = true;
        }
        break;
    }
  }

  animateGrassTask(): void {
    if (++this.grassTimer > 5) {
      this.grassTimer = 0;
      this.grassFrame = (this.grassFrame + 1) % 3;
      ChangeBgY(0, this.grassFrame << 15, BG_COORD_SET);
    }
    if (this.grassExiting) {
      this.grassScroll += 0x120;
      ChangeBgY(0, this.grassScroll, BG_COORD_SUB);
    }
  }

  startGrassScrolling(): void {
    this.grassExiting = true;
  }

  animateBackgroundZoom(): void {
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
