// intro.c: CB2_SetUpIntro and the Game Freak scene's BG, window, logo-art,
// Presents (rev1) and star/sparkle sprite callbacks.
import { cdata, incbin, loadCData, preloadIncbin } from "./hw/assets";
import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { type BgTemplate, InitBgsFromTemplates, LoadBgTilemap, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, ShowBg, HideBg } from "./hw/bg";
import { CopyBufferedValuesToGpuRegs, InitGpuRegManager, SetGpuReg, SetGpuRegBits } from "./hw/gpu";
import { IsBlendTaskActive, StartBlendTask } from "./hw/menu";
import { BlendPalettes, LoadPalette, PALETTES_ALL, ResetPaletteFade, RGB_BLACK, TransferPlttBuffer } from "./hw/palette";
import {
  BLDCNT_EFFECT_BLEND, BLDCNT_TGT1_BG2, BLDCNT_TGT1_OBJ, BLDCNT_TGT2_ALL,
  DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, DISPCNT_WIN1_ON, ppu,
  REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_DISPCNT,
  REG_OFFSET_WIN1H, REG_OFFSET_WIN1V, REG_OFFSET_WININ, REG_OFFSET_WINOUT,
  WININ_WIN1_ALL, WIN_RANGE,
} from "./hw/ppu";
import {
  BlitBitmapToWindow, COPYWIN_FULL, COPYWIN_GFX, FillWindowPixelBuffer,
  InitWindows, PIXEL_FILL, PutWindowTilemap, type WindowTemplate,
  CopyWindowToVram,
} from "./hw/window";
import {
  ANIMCMD_END, ANIMCMD_FRAME, ANIMCMD_JUMP, AnimateSprites,
  BuildOamBuffer, CreateSprite, DestroySprite, gDummySpriteAffineAnimTable,
  gDummySpriteAnimTable, gSprites, LoadOam, LoadSpritePalette,
  LoadSpriteSheet, MAX_SPRITES, oamData, ResetSpriteData, FreeAllSpritePalettes,
  SpriteCallbackDummy, StartSpriteAnim,
  type AnimCmd, type OamData, type Sprite, type SpriteTemplate,
} from "./hw/sprite";
import { gSineTable } from "./hw/trig";

const symbols = [
  "sGameFreakBg_Gfx", "sGameFreakBg_Map", "sGameFreakBg_Pal",
  "sGameFreakLogo_Pal", "sGameFreakText_Gfx", "sGameFreakLogo_Gfx",
  "sPresents_Gfx",
  "intro.c:sStar_Gfx", "intro.c:sStar_Pal", "sSparklesSmall_Gfx", "sSparklesBig_Gfx",
  "sSparkles_Pal",
];

type ExtractedAnim = { frame?: { imageValue: number; duration: number }; jump?: { target: number }; type?: number };
type SymRef = { $sym: string };
type Coord = { x: number; y: number };

function animations(name: string): AnimCmd[][] {
  return cdata<SymRef[]>("intro", name).map(({ $sym }) =>
    cdata<ExtractedAnim[]>("intro", $sym).map((cmd) =>
      cmd.frame ? ANIMCMD_FRAME(cmd.frame.imageValue, cmd.frame.duration) :
        cmd.jump ? ANIMCMD_JUMP(cmd.jump.target) : ANIMCMD_END));
}

function spriteTemplate(name: string, oamName: string, animName: string | null, callback: (sprite: Sprite) => void): SpriteTemplate {
  const def = cdata<{ tileTag: number; paletteTag: number }>("intro", name);
  return {
    tileTag: def.tileTag,
    paletteTag: def.paletteTag,
    oam: oamData(cdata<OamData>("intro", oamName)),
    anims: animName ? animations(animName) : gDummySpriteAnimTable,
    images: null,
    affineAnims: gDummySpriteAffineAnimTable,
    callback,
  };
}

type Callback = "open" | "star" | "name" | "logo";

/** intro.c startup and per-frame callback driver entrypoints. */
export function StartIntroSequence(scene: IntroGameFreak): void { scene.begin(); }
export function SetIntroCB(scene: IntroGameFreak, callback: Callback): void { scene.setIntroCallback(callback); }
export function Task_CallIntroCallback(scene: IntroGameFreak): void { scene.callIntroCallback(); }
export function CB2_Intro(scene: IntroGameFreak): void { scene.updateFrame(); }

/** intro.c Game Freak star and text sparkle helpers. */
export function GFScene_LoadGfxCreateStar(scene: IntroGameFreak): void { scene.loadGfxCreateStar(); }
export function GFScene_CreateStarSparkle(scene: IntroGameFreak, x: number, y: number, random: number): void {
  scene.createStarSparkle(x, y, random);
}
export function GFScene_StartNameSparklesSmall(scene: IntroGameFreak): void { scene.startNameSparklesSmall(); }
export function GFScene_Task_NameSparklesSmall(scene: IntroGameFreak): void { scene.taskNameSparklesSmall(); }
export function GFScene_StartNameSparklesBig(scene: IntroGameFreak): void { scene.startNameSparklesBig(); }
export function GFScene_Task_NameSparklesBig(scene: IntroGameFreak): void { scene.taskNameSparklesBig(); }
export function GFScene_CreateLogoSprite(scene: IntroGameFreak): number { return scene.createLogoSprite(); }
export function GFScene_CreatePresentsSprite(scene: IntroGameFreak): void { scene.createPresentsSprites(); }
export function SpriteCB_Star(scene: IntroGameFreak, sprite: Sprite): void { scene.spriteCallbackStar(sprite); }
export function SpriteCB_SparklesSmall_Star(scene: IntroGameFreak, sprite: Sprite): void { scene.spriteCallbackStarSparkle(sprite); }
export function SpriteCB_SparklesSmall_Name(scene: IntroGameFreak, sprite: Sprite): void { scene.spriteCallbackNameSparkle(sprite); }
export function SpriteCB_SparklesBig(_scene: IntroGameFreak, sprite: Sprite): void {
  if (sprite.animEnded) DestroySprite(sprite);
}

export class IntroGameFreak {
  private callback: Callback = "open";
  private state = 0;
  private timer = 0;
  private blendFrame = 0;
  private sparkleYMod = 0;
  private starSparkleSeed = 354128453;
  private smallSparkleIndex = 0;
  private smallSparkleLoops = 0;
  private smallSparkleTimer = 0;
  private smallSparkleTask = false;
  private bigSparkleIndex = 0;
  private bigSparkleCount = 0;
  private bigSparkleTimer = 0;
  private bigSparkleTask = false;
  done = false;

  static async preload(): Promise<void> {
    await Promise.all([preloadIncbin(symbols), loadCData("intro")]);
  }

  begin(): void {
    this.callback = "open";
    this.state = 0;
    this.timer = 0;
    this.done = false;
    this.logoSprite = -1;
    this.smallSparkleIndex = this.smallSparkleLoops = this.smallSparkleTimer = 0;
    this.bigSparkleIndex = this.bigSparkleCount = this.bigSparkleTimer = 0;
    this.smallSparkleTask = this.bigSparkleTask = false;
    ppu.resetIo();
    ppu.vram.fill(0);
    ppu.oam.fill(0);
    ppu.pltt.fill(0);
    InitGpuRegManager();
    ResetPaletteFade();
    ResetSpriteData();
    ResetBgsAndClearDma3BusyFlags(false);
    InitBgsFromTemplates(0, cdata<BgTemplate[]>("intro", "sBgTemplates_GameFreakScene"));
    SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
    LoadPalette(incbin("sGameFreakBg_Pal"), 0, 32);
    LoadBgTiles(3, incbin("sGameFreakBg_Gfx"), incbin("sGameFreakBg_Gfx").length, 0);
    LoadBgTilemap(3, incbin("sGameFreakBg_Map"), incbin("sGameFreakBg_Map").length, 0);
    LoadPalette(incbin("sGameFreakLogo_Pal"), 13 * 16, 32);
    LoadSpriteSheet({ data: incbin("intro.c:sStar_Gfx"), size: 0x80, tag: 0 });
    LoadSpriteSheet({ data: incbin("sSparklesSmall_Gfx"), size: 0x80, tag: 1 });
    LoadSpriteSheet({ data: incbin("sSparklesBig_Gfx"), size: 0x800, tag: 2 });
    LoadSpriteSheet({ data: incbin("sGameFreakLogo_Gfx"), size: 0x400, tag: 3 });
    LoadSpriteSheet({ data: incbin("sPresents_Gfx"), size: 0x100, tag: 4 });
    LoadSpritePalette({ data: incbin("intro.c:sStar_Pal"), tag: 0 });
    LoadSpritePalette({ data: incbin("sSparkles_Pal"), tag: 1 });
    LoadSpritePalette({ data: incbin("sGameFreakLogo_Pal"), tag: 3 });

    InitWindows(cdata<WindowTemplate[]>("intro", "sWindowTemplates"));
    FillWindowPixelBuffer(0, PIXEL_FILL(0));
    BlitBitmapToWindow(0, incbin("sGameFreakText_Gfx"), 0, 40, 144, 16);
    PutWindowTilemap(0);
    CopyWindowToVram(0, COPYWIN_FULL);
    BlendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    TransferPlttBuffer();
    CopyBufferedValuesToGpuRegs();
  }

  setIntroCallback(callback: Callback): void {
    this.callback = callback;
    this.state = 0;
    this.timer = 0;
  }

  update(): void { CB2_Intro(this); }

  updateFrame(): void {
    if (this.done) return;
    Task_CallIntroCallback(this);
    AnimateSprites();
    BuildOamBuffer();
    LoadOam();
    CopyBufferedValuesToGpuRegs();
    TransferPlttBuffer();
  }

  callIntroCallback(): void {
    if (this.smallSparkleTask) GFScene_Task_NameSparklesSmall(this);
    if (this.bigSparkleTask) GFScene_Task_NameSparklesBig(this);
    if (this.callback === "open") IntroCB_GF_OpenWindow(this);
    else if (this.callback === "star") IntroCB_GF_Star(this);
    else if (this.callback === "name") IntroCB_GF_RevealName(this);
    else IntroCB_GF_RevealLogo(this);
  }

  openWindow(): void {
    // IntroCB_GF_OpenWindow, states 0-2.
    if (this.state === 0) {
      this.timer = 0;
      SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN1_ON);
      SetGpuReg(REG_OFFSET_WININ, WININ_WIN1_ALL);
      SetGpuReg(REG_OFFSET_WINOUT, 0);
      SetGpuReg(REG_OFFSET_WIN1H, 240);
      SetGpuReg(REG_OFFSET_WIN1V, 0);
      this.state++;
    } else if (this.state === 1) {
      ShowBg(3);
      BlendPalettes(PALETTES_ALL, 0, RGB_BLACK);
      this.state++;
    } else {
      this.timer = Math.min(48, this.timer + 8);
      SetGpuReg(REG_OFFSET_WIN1V, WIN_RANGE(80 - this.timer, 80 + this.timer));
      if (this.timer === 48) SetIntroCB(this, "star");
    }
  }

  starTiming(): void {
    // IntroCB_GF_Star.
    if (this.state === 0) {
      sound.playSE(C.MUS_GAME_FREAK);
      GFScene_LoadGfxCreateStar(this);
      this.state = 1;
      this.timer = 0;
    }
    else if (this.state === 1 && ++this.timer === 30) {
      GFScene_StartNameSparklesSmall(this);
      this.state = 2;
      this.timer = 0;
    }
    else if (this.state === 2 && ++this.timer === 90) SetIntroCB(this, "name");
  }

  private createStar(): void {
    const id = CreateSprite(spriteTemplate("sSpriteTemplate_Star", "sOam_Star", null,
      (sprite) => SpriteCB_Star(this, sprite)), 248, 55, 0);
    if (id === MAX_SPRITES) return;
    const data = gSprites[id].data;
    data[0] = 248 << 4;
    data[1] = 55 << 4;
    data[2] = 96;
    data[3] = 16;
    const seed = this.starSparkleSeed;
    data[6] = seed & 0xffff;
    data[7] = seed >>> 16;
  }

  loadGfxCreateStar(): void { this.createStar(); }

  spriteCallbackStar(sprite: Sprite): void {
    const data = sprite.data;
    data[0] -= data[2];
    data[1] += data[3];
    data[4] += 48;
    sprite.x = data[0] >> 4;
    sprite.y = data[1] >> 4;
    sprite.y2 = gSineTable[((data[4] >> 4) + 64) & 0xff] >> 5;
    data[5]++;
    if (data[5] % 8) {
      const previous = ((data[7] & 0xffff) << 16) | (data[6] & 0xffff);
      const next = (Math.imul(1103515245, previous) + 24691) >>> 0;
      data[6] = next & 0xffff;
      data[7] = next >>> 16;
      GFScene_CreateStarSparkle(this, sprite.x, sprite.y + sprite.y2, next >>> 16);
    }
    if (sprite.x < -8) DestroySprite(sprite);
  }

  createStarSparkle(x: number, y: number, random: number): void {
    const xMod = (random & 7) + 2;
    const yMod = this.sparkleYMod;
    if (++this.sparkleYMod > 3) this.sparkleYMod = -3;
    x += xMod;
    y += yMod;
    if (x <= 0 || x >= 240) return;
    const id = CreateSprite(spriteTemplate("sSpriteTemplate_SparklesSmall", "sOam_SparklesSmall",
      "sAnims_SparklesSmall", (sprite) => SpriteCB_SparklesSmall_Star(this, sprite)), x, y, 1);
    if (id === MAX_SPRITES) return;
    const data = gSprites[id].data;
    data[0] = x << 5;
    data[1] = y << 5;
    data[2] = xMod;
    data[3] = yMod;
  }

  spriteCallbackStarSparkle(sprite: Sprite): void {
    const data = sprite.data;
    data[0] += data[2];
    data[1] += data[3];
    data[5] += ++data[4];
    data[7]++;
    sprite.x = (data[0] & 0xffff) >> 5;
    sprite.y = data[1] >> 5;
    // sStarSparklesGravityShift is zero throughout this source sequence.
    if (data[7] > 90) {
      sprite.invisible = !sprite.invisible;
      if (data[7] > 120) DestroySprite(sprite);
    }
    if (sprite.y + sprite.y2 < 0 || sprite.y + sprite.y2 > 160) DestroySprite(sprite);
  }

  startNameSparklesSmall(): void {
    this.smallSparkleTask = true;
    this.smallSparkleIndex = this.smallSparkleLoops = this.smallSparkleTimer = 0;
  }

  taskNameSparklesSmall(): void {
    const coords = cdata<Coord[]>("intro", "sTextSparkleCoords");
    if (++this.smallSparkleTimer > 6) {
      this.smallSparkleTimer = 0;
      const point = coords[this.smallSparkleIndex];
      const id = CreateSprite(spriteTemplate("sSpriteTemplate_SparklesSmall", "sOam_SparklesSmall",
        "sAnims_SparklesSmall", (sprite) => SpriteCB_SparklesSmall_Name(this, sprite)), point.x, point.y, 2);
      if (id !== MAX_SPRITES) {
        const sprite = gSprites[id];
        StartSpriteAnim(sprite, 1);
        sprite.data[1] = point.y << 4;
        sprite.data[2] = 120;
        sprite.data[3] = this.smallSparkleLoops;
      }
      if (++this.smallSparkleIndex >= coords.length) {
        if (++this.smallSparkleLoops > 1) this.smallSparkleTask = false;
        else this.smallSparkleIndex = 0;
      }
    }
  }

  startNameSparklesBig(): void {
    this.bigSparkleTask = true;
    this.bigSparkleIndex = this.bigSparkleCount = this.bigSparkleTimer = 0;
  }

  taskNameSparklesBig(): void {
    const coords = cdata<Coord[]>("intro", "sTextSparkleCoords");
    if (this.bigSparkleTimer === 0) {
      const point = coords[this.bigSparkleIndex];
      CreateSprite(spriteTemplate("sSpriteTemplate_SparklesBig", "sOam_SparklesBig",
        "sAnims_SparklesBig", (sprite) => SpriteCB_SparklesBig(this, sprite)), point.x, point.y, 3);
      this.bigSparkleIndex = (this.bigSparkleIndex + 4) % coords.length;
      if (++this.bigSparkleCount >= coords.length) this.bigSparkleTask = false;
    }
    if (++this.bigSparkleTimer > 9) this.bigSparkleTimer = 0;
  }

  spriteCallbackNameSparkle(sprite: Sprite): void {
    const data = sprite.data;
    if (data[2]) {
      data[2]--;
      data[1]++;
      sprite.y = data[1] >> 4;
      if (sprite.y > 86) { sprite.y = 74; data[1] = 74 << 4; }
      if (sprite.animEnded) {
        if (data[0] === 0) {
          sprite.x += 26;
          if (sprite.x > 188) { sprite.x = 376 - sprite.x; data[0] = 1; }
        } else {
          sprite.x -= 26;
          if (sprite.x < 52) { sprite.x = 104 - sprite.x; data[0] = 0; }
        }
        StartSpriteAnim(sprite, 1);
      }
    } else {
      if (data[3]) DestroySprite(sprite);
      if (sprite.animEnded) StartSpriteAnim(sprite, 0);
      data[1] += 4;
      sprite.y = data[1] >> 4;
      if (++data[4] > 50) DestroySprite(sprite);
    }
  }

  revealName(): void {
    // IntroCB_GF_RevealName; BG2 fades in over the already visible BG3.
    if (this.state === 0) {
      GFScene_StartNameSparklesBig(this);
      this.state = 1;
      this.timer = 0;
    }
    else if (this.state === 1 && ++this.timer >= 40) this.state = 2;
    else if (this.state === 2) {
      SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG2 | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_ALL);
      SetGpuReg(REG_OFFSET_BLDALPHA, 16 << 8);
      ShowBg(2);
      this.blendFrame = 0;
      this.state = 3;
    } else if (this.state === 3) {
      this.blend(48, false);
      if (this.blendFrame >= 48) { SetGpuReg(REG_OFFSET_BLDCNT, 0); this.state = 4; this.timer = 0; }
    } else if (++this.timer > 50) SetIntroCB(this, "logo");
  }

  private logoSprite = -1;

  createLogoSprite(): number {
    // GFScene_CreateLogoSprite: 32x64 art sprite at (120, 70).
    const id = CreateSprite(spriteTemplate("sSpriteTemplate_GameFreakLogoArt", "sOam_GameFreakLogo",
      null, SpriteCallbackDummy), 120, 70, 4);
    this.logoSprite = id === MAX_SPRITES ? -1 : id;
    return this.logoSprite;
  }

  createPresentsSprites(): void {
    // GFScene_CreatePresentsSprite (REVISION >= 1): two 32x8 text sprites.
    for (let i = 0; i < 2; i++) {
      const id = CreateSprite(spriteTemplate("sSpriteTemplate_Presents", "sOam_PresentsText",
        null, SpriteCallbackDummy), 104 + 32 * i, 108, 5);
      if (id !== MAX_SPRITES) gSprites[id].oam.tileNum += i * 4;
    }
  }

  revealLogo(): void {
    // IntroCB_GF_RevealLogo, states 0-7.
    if (this.state === 0) {
      SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_OBJ | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_ALL);
      StartBlendTask(0, 16, 16, 0, 16, 0);
      this.timer = 0;
      this.logoSprite = -1;
      this.state = 1;
    } else if (this.state === 1) {
      this.logoSprite = GFScene_CreateLogoSprite(this);
      this.state = 2;
    } else if (this.state === 2) {
      if (!IsBlendTaskActive()) {
        BlitBitmapToWindow(0, incbin("sGameFreakLogo_Gfx"), 0x38, 0x06, 0x20, 0x40);
        BlitBitmapToWindow(0, incbin("sGameFreakText_Gfx"), 0, 0x28, 0x90, 0x10);
        CopyWindowToVram(0, COPYWIN_GFX);
        this.state = 3;
      }
    } else if (this.state === 3) {
      // CopyWindowToVram is synchronous here, so the DMA-busy wait is trivially satisfied.
      if (this.logoSprite >= 0) { DestroySprite(gSprites[this.logoSprite]); this.logoSprite = -1; }
      GFScene_CreatePresentsSprite(this);
      this.timer = 0;
      this.state = 4;
    } else if (this.state === 4) {
      if (++this.timer > 90) {
        SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG2 | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_ALL);
        StartBlendTask(16, 0, 0, 16, 20, 0);
        this.state = 5;
      }
    } else if (this.state === 5) {
      if (!IsBlendTaskActive()) {
        HideBg(2);
        this.state = 6;
      }
    } else if (this.state === 6) {
      ResetSpriteData();
      FreeAllSpritePalettes();
      this.timer = 0;
      this.state = 7;
    } else if (++this.timer > 20) {
      SetGpuReg(REG_OFFSET_BLDCNT, 0);
      this.done = true;
    }
  }

  private blend(duration: number, reverse: boolean): void {
    this.blendFrame = Math.min(duration, this.blendFrame + 1);
    const alpha = Math.round(this.blendFrame * 16 / duration);
    SetGpuReg(REG_OFFSET_BLDALPHA, reverse ? ((16 - alpha) | (alpha << 8)) : (alpha | ((16 - alpha) << 8)));
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.putImageData(ppu.renderFrame(), 0, 0);
  }
}

/** intro.c callback adapters; Startup's frame loop dispatches these active callbacks. */
export function IntroCB_GF_OpenWindow(intro: IntroGameFreak): void { intro.openWindow(); }
export function IntroCB_GF_Star(intro: IntroGameFreak): void { intro.starTiming(); }
export function IntroCB_GF_RevealName(intro: IntroGameFreak): void { intro.revealName(); }
export function IntroCB_GF_RevealLogo(intro: IntroGameFreak): void { intro.revealLogo(); }
