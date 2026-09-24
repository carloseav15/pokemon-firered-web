// intro.c: IntroCB_Scene2 and its forest/close-up pan tasks.
import { cdata, incbin, loadCData, preloadIncbin } from "./hw/assets";
import {
  BG_COORD_ADD, BG_COORD_SET, BG_COORD_SUB, type BgTemplate,
  ChangeBgX, ChangeBgY, HideBg, InitBgsFromTemplates,
  LoadBgTilemap, LoadBgTiles, ShowBg,
} from "./hw/bg";
import { CopyBufferedValuesToGpuRegs } from "./hw/gpu";
import {
  BeginNormalPaletteFade, BlendPalettes, gPaletteFade, LoadPalette,
  PALETTES_ALL, RGB_WHITE, TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import { ppu } from "./hw/ppu";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, DestroySprite,
  gDummySpriteAffineAnimTable, gDummySpriteAnimTable, gSprites,
  LoadOam, LoadSpritePalette, LoadSpriteSheet, MAX_SPRITES,
  oamData, ResetSpriteData, SpriteCallbackDummy,
  type OamData, type SpriteTemplate,
} from "./hw/sprite";

const symbols = [
  "sScene2_Bg_Gfx", "sScene2_Bg_Map", "sScene2_Bg_Pal",
  "sScene2_Plants_Gfx", "sScene2_Plants_Map",
  "sScene2_NidorinoClose_Gfx", "sScene2_NidorinoClose_Map", "sScene2_NidorinoClose_Pal",
  "sScene2_GengarClose_Gfx", "sScene2_GengarClose_Map", "sGengar_Pal",
  "sScene2_Gengar_Gfx", "sScene2_Nidorino_Gfx", "sNidorino_Pal",
];

type ExtractedTemplate = { tileTag: number; paletteTag: number };

function loadBg(bg: number, gfx: string, map: string): void {
  LoadBgTiles(bg, incbin(gfx), incbin(gfx).length, 0);
  LoadBgTilemap(bg, incbin(map), incbin(map).length, 0);
}

function spriteTemplate(name: string): SpriteTemplate {
  const def = cdata<ExtractedTemplate>("intro", name);
  return {
    tileTag: def.tileTag,
    paletteTag: def.paletteTag,
    oam: oamData(cdata<OamData>("intro", "sOam_Scene2_Mons")),
    anims: gDummySpriteAnimTable,
    images: null,
    affineAnims: gDummySpriteAffineAnimTable,
    callback: SpriteCallbackDummy,
  };
}

export class IntroScene2 {
  private state = 0;
  private timer = 0;
  private gengarSprite = MAX_SPRITES;
  private nidorinoSprite = MAX_SPRITES;
  done = false;

  static async preload(): Promise<void> {
    await Promise.all([preloadIncbin(symbols), loadCData("intro")]);
  }

  begin(): void {
    this.state = 0;
    this.timer = 0;
    this.done = false;
    this.gengarSprite = MAX_SPRITES;
    this.nidorinoSprite = MAX_SPRITES;
    // The source loads these fight sprite sheets during Scene 1; our preload
    // is asynchronous, so install them here before their first visible frame.
    ResetSpriteData();
    LoadSpriteSheet({ data: incbin("sScene2_Gengar_Gfx"), size: 2048, tag: 6 });
    LoadSpriteSheet({ data: incbin("sScene2_Nidorino_Gfx"), size: 2048, tag: 7 });
    LoadSpritePalette({ data: incbin("sGengar_Pal"), tag: 6 });
    LoadSpritePalette({ data: incbin("sNidorino_Pal"), tag: 7 });
  }

  update(): void {
    if (this.done) return;
    // RunTasks precedes the intro callback in CB2_Intro. The pan tasks were
    // created in state 1, and the close-up pan begins after state 4.
    if (this.state >= 2 && this.state <= 4) {
      ChangeBgX(3, 0xe0, BG_COORD_SUB);
      ChangeBgX(0, 0x110, BG_COORD_ADD);
    } else if (this.state === 6) {
      ChangeBgY(2, 0x20, BG_COORD_ADD);
      ChangeBgY(1, 0x24, BG_COORD_SUB);
    }

    switch (this.state) {
      case 0:
        BlendPalettes(PALETTES_ALL & ~1, 16, RGB_WHITE);
        InitBgsFromTemplates(0, cdata<BgTemplate[]>("intro", "sBgTemplates_Scene2"));
        loadBg(3, "sScene2_Bg_Gfx", "sScene2_Bg_Map");
        ShowBg(3);
        this.state++;
        break;
      case 1:
        LoadPalette(incbin("sScene2_Bg_Pal"), 16, incbin("sScene2_Bg_Pal").length);
        LoadPalette(incbin("sGengar_Pal"), 5 * 16, 32);
        LoadPalette(incbin("sScene2_NidorinoClose_Pal"), 6 * 16, 32);
        BlendPalettes(PALETTES_ALL & ~1, 16, RGB_WHITE);
        loadBg(0, "sScene2_Plants_Gfx", "sScene2_Plants_Map");
        loadBg(1, "sScene2_NidorinoClose_Gfx", "sScene2_NidorinoClose_Map");
        loadBg(2, "sScene2_GengarClose_Gfx", "sScene2_GengarClose_Map");
        for (let bg = 0; bg < 4; bg++) {
          ChangeBgX(bg, 0, BG_COORD_SET);
          ChangeBgY(bg, 0, BG_COORD_SET);
        }
        ShowBg(0);
        HideBg(1);
        HideBg(2);
        ChangeBgY(2, 0x1ce00, BG_COORD_SET);
        ChangeBgY(1, 0x2800, BG_COORD_SET);
        this.nidorinoSprite = CreateSprite(spriteTemplate("sSpriteTemplate_Scene2_Nidorino"), 168, 80, 11);
        this.gengarSprite = CreateSprite(spriteTemplate("sSpriteTemplate_Scene2_Gengar"), 72, 80, 12);
        this.state++;
        break;
      case 2:
        BeginNormalPaletteFade(PALETTES_ALL & ~1, -2, 16, 0, RGB_WHITE);
        this.state++;
        break;
      case 3:
        if (!gPaletteFade.active) { this.timer = 0; this.state++; }
        break;
      case 4:
        if (++this.timer >= 60) {
          this.destroyWideShotSprites();
          ChangeBgY(3, 0x10000, BG_COORD_SET);
          HideBg(0);
          ShowBg(3);
          ShowBg(1);
          ShowBg(2);
          this.state++;
        }
        break;
      case 5:
        this.timer = 0;
        this.state++;
        break;
      case 6:
        if (++this.timer >= 60) this.done = true;
        break;
    }
    AnimateSprites();
    BuildOamBuffer();
    LoadOam();
    UpdatePaletteFade();
    CopyBufferedValuesToGpuRegs();
    TransferPlttBuffer();
  }

  private destroyWideShotSprites(): void {
    if (this.nidorinoSprite !== MAX_SPRITES) DestroySprite(gSprites[this.nidorinoSprite]);
    if (this.gengarSprite !== MAX_SPRITES) DestroySprite(gSprites[this.gengarSprite]);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.putImageData(ppu.renderFrame(), 0, 0);
  }
}
