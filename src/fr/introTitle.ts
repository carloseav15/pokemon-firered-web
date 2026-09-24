// title_screen.c (FireRed): CB2_InitTitleScreen and the INIT / FLASHSPRITE /
// FADEIN / RUN / CRY scene machine with flame spawner, slash sweep and
// press-start blink. Runs through the same TS hardware layer as the intro.
import { sound } from "./audio/sound";
import { cdata, incbin, loadCData, preloadIncbin } from "./hw/assets";
import { type BgTemplate, HideBg, InitBgsFromTemplates, LoadBgTilemap, LoadBgTiles, ShowBg } from "./hw/bg";
import { tasks } from "./gba/tasks";
import { B_BUTTON, DPAD_UP, joy, SELECT_BUTTON } from "./gba/input";
import { ClearGpuRegBits, CopyBufferedValuesToGpuRegs, InitGpuRegManager, SetGpuReg, SetGpuRegBits } from "./hw/gpu";
import {
  BeginNormalPaletteFade, BlendPalettes, BlendPalettesGradually, DestroyBlendPalettesGraduallyTask, gPaletteFade,
  IsBlendPalettesGraduallyTaskActive, LoadPalette, PALETTES_ALL, PALETTES_BG,
  ResetPaletteFade, RGB, RGB_BLACK, RGB_WHITE, TintPalette_GrayScale2,
  TransferPlttBuffer, UpdatePaletteFade, gPlttBufferFaded, gPlttBufferUnfaded,
} from "./hw/palette";
import {
  BLDCNT_EFFECT_LIGHTEN, BLDCNT_TGT1_BG0, BLDCNT_TGT1_BG1,
  DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, DISPCNT_OBJWIN_ON, DISPCNT_WIN0_ON, DISPCNT_WIN1_ON, ppu,
  REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT,
  REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT,
  WIN_RANGE, WININ_WIN0_ALL,
  WINOUT_WIN01_BG0, WINOUT_WIN01_BG1, WINOUT_WIN01_BG2, WINOUT_WIN01_BG3,
  WINOUT_WIN01_BG_ALL, WINOUT_WIN01_CLR, WINOUT_WIN01_OBJ, WINOUT_WINOBJ_ALL,
} from "./hw/ppu";
import {
  ANIMCMD_END, ANIMCMD_FRAME, ANIMCMD_JUMP, AnimateSprites,
  BuildOamBuffer, CreateSprite, DestroySprite, gDummySpriteAffineAnimTable,
  gDummySpriteAnimTable, gSprites, LoadOam, LoadSpritePalette,
  LoadSpriteSheet, MAX_SPRITES, oamData, ResetSpriteData,
  SpriteCallbackDummy, StartSpriteAnim,
  type AnimCmd, type OamData, type Sprite, type SpriteTemplate,
} from "./hw/sprite";

const symbols = [
  "gGraphics_TitleScreen_GameTitleLogoPals", "gGraphics_TitleScreen_GameTitleLogoTiles",
  "gGraphics_TitleScreen_GameTitleLogoMap", "gGraphics_TitleScreen_BoxArtMonPals",
  "gGraphics_TitleScreen_BoxArtMonTiles", "gGraphics_TitleScreen_BoxArtMonMap",
  "gGraphics_TitleScreen_BackgroundPals", "gGraphics_TitleScreen_CopyrightPressStartTiles",
  "gGraphics_TitleScreen_CopyrightPressStartMap",
  "title_screen.c:sBorderBgTiles", "title_screen.c:sBorderBgMap",
  "title_screen.c:sFlames_Gfx", "title_screen.c:sBlankFlames_Gfx",
  "title_screen.c:sFlames_Pal", "title_screen.c:sSlash_Gfx",
  "gTitleScreen_Slash_Pal", "gTitleScreen_BlankSprite_Tiles",
];

const PAL_LOGO = 0;
const PAL_BOXART = 13;
const PAL_BORDER = 14;
const PAL_PRESS_START = 15;
const BOXART_MASK = 1 << PAL_BOXART;
const TITLE_TIMEOUT = 2700;
// title_screen.c: KEYSTROKE_DELSAVE. KEYSTROKE_BERRY_FIX (B + SELECT) opens the GBA-link Berry Program Update,
// which cannot run in a browser, so that combination is ignored.
const KEYSTROKE_DELSAVE = B_BUTTON | SELECT_BUTTON | DPAD_UP;

type ExtractedAnim = { frame?: { imageValue: number; duration: number }; jump?: { target: number } };
type SymRef = { $sym: string };

function animList(name: string): AnimCmd[][] {
  return cdata<SymRef[]>("title_screen", name).map(({ $sym }) =>
    cdata<ExtractedAnim[]>("title_screen", $sym).map((cmd) =>
      cmd.frame ? ANIMCMD_FRAME(cmd.frame.imageValue, cmd.frame.duration) :
        cmd.jump ? ANIMCMD_JUMP(cmd.jump.target) : ANIMCMD_END));
}

function spriteTemplate(name: string, oamName: string, animName: string | null): SpriteTemplate {
  const def = cdata<{ tileTag: number; paletteTag: number }>("title_screen", name);
  return {
    tileTag: def.tileTag,
    paletteTag: def.paletteTag,
    oam: oamData(cdata<OamData>("title_screen", oamName)),
    anims: animName ? animList(animName) : gDummySpriteAnimTable,
    images: null,
    affineAnims: gDummySpriteAffineAnimTable,
    callback: SpriteCallbackDummy,
  };
}

type Scene = "init" | "flash" | "fadein" | "run" | "cry" | "menu";

const TITLE_TONE = RGB(30, 30, 31);

export class IntroTitle {
  private scene: Scene = "init";
  private state = 0;
  private timer = 0;
  private counter = 0;
  private frames = 0;
  private flamesOn = false;
  private blinkOn = false;
  private blinkFrame = 0;
  private blinkShown = false;
  private slashId = MAX_SPRITES;
  private slashTimer = 540;
  private slashState = 0;
  private slashDeactivate = false;
  private spawnerTimer = 0;
  private spawnerDelay = 0;
  private spawnerSeed = 30840;
  private spawnerOffsetX = 0;
  done = false;

  static async preload(): Promise<void> {
    await Promise.all([preloadIncbin(symbols), loadCData("title_screen")]);
  }

  begin(): void {
    this.exitTo = "menu";
    this.scene = "init";
    this.state = 0;
    this.timer = 0;
    this.counter = 0;
    this.frames = 0;
    this.flamesOn = false;
    this.blinkOn = false;
    this.blinkFrame = 0;
    this.blinkShown = false;
    this.slashId = MAX_SPRITES;
    this.slashTimer = 540;
    this.slashState = 0;
    this.slashDeactivate = false;
    this.spawnerTimer = 0;
    this.spawnerDelay = 0;
    this.spawnerSeed = 30840;
    this.spawnerOffsetX = 0;
    this.done = false;
    // CB2_InitTitleScreen case 0.
    ppu.resetIo();
    ppu.vram.fill(0);
    ppu.oam.fill(0);
    ppu.pltt.fill(0);
    InitGpuRegManager();
    ResetPaletteFade();
    ResetSpriteData();
    DestroyBlendPalettesGraduallyTask();
    InitBgsFromTemplates(0, cdata<BgTemplate[]>("title_screen", "sBgTemplates"));
    SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
    // CB2_InitTitleScreen case 1: BG0 logo (8bpp), BG1 box art, BG2
    // copyright/press-start, BG3 border.
    LoadPalette(incbin("gGraphics_TitleScreen_GameTitleLogoPals"), PAL_LOGO * 16, 13 * 32);
    LoadBgTiles(0, incbin("gGraphics_TitleScreen_GameTitleLogoTiles"), incbin("gGraphics_TitleScreen_GameTitleLogoTiles").length, 0);
    LoadBgTilemap(0, incbin("gGraphics_TitleScreen_GameTitleLogoMap"), incbin("gGraphics_TitleScreen_GameTitleLogoMap").length, 0);
    LoadPalette(incbin("gGraphics_TitleScreen_BoxArtMonPals"), PAL_BOXART * 16, 32);
    LoadBgTiles(1, incbin("gGraphics_TitleScreen_BoxArtMonTiles"), incbin("gGraphics_TitleScreen_BoxArtMonTiles").length, 0);
    LoadBgTilemap(1, incbin("gGraphics_TitleScreen_BoxArtMonMap"), incbin("gGraphics_TitleScreen_BoxArtMonMap").length, 0);
    LoadPalette(incbin("gGraphics_TitleScreen_BackgroundPals"), PAL_PRESS_START * 16, 32);
    LoadBgTiles(2, incbin("gGraphics_TitleScreen_CopyrightPressStartTiles"), incbin("gGraphics_TitleScreen_CopyrightPressStartTiles").length, 0);
    LoadBgTilemap(2, incbin("gGraphics_TitleScreen_CopyrightPressStartMap"), incbin("gGraphics_TitleScreen_CopyrightPressStartMap").length, 0);
    LoadPalette(incbin("gGraphics_TitleScreen_BackgroundPals"), PAL_BORDER * 16, 32);
    LoadBgTiles(3, incbin("title_screen.c:sBorderBgTiles"), incbin("title_screen.c:sBorderBgTiles").length, 0);
    LoadBgTilemap(3, incbin("title_screen.c:sBorderBgMap"), incbin("title_screen.c:sBorderBgMap").length, 0);
    LoadSpriteSheet({ data: incbin("title_screen.c:sFlames_Gfx"), size: 0x500, tag: 0 });
    LoadSpriteSheet({ data: incbin("title_screen.c:sBlankFlames_Gfx"), size: 0x500, tag: 1 });
    LoadSpriteSheet({ data: incbin("gTitleScreen_BlankSprite_Tiles"), size: 0x400, tag: 2 });
    LoadSpriteSheet({ data: incbin("title_screen.c:sSlash_Gfx"), size: 0x800, tag: 3 });
    LoadSpritePalette({ data: incbin("title_screen.c:sFlames_Pal"), tag: 0 });
    LoadSpritePalette({ data: incbin("gTitleScreen_Slash_Pal"), tag: 2 });
    // CB2_InitTitleScreen case 2.
    BlendPalettes(PALETTES_BG, 16, RGB_BLACK);
  }

  /** Button during INIT/FLASH/FADEIN: skip straight to RUN (Task_TitleScreenMain). */
  skipToRun(): void {
    if (this.scene === "run" || this.scene === "cry") return;
    // LoadMainTitleScreenPalsAndResetBgs: kill the slide/fade helpers, clear
    // windows, restore palettes and BGs.
    DestroyBlendPalettesGraduallyTask();
    SetGpuReg(REG_OFFSET_BLDCNT, 0);
    SetGpuReg(REG_OFFSET_BLDY, 0);
    LoadPalette(incbin("gGraphics_TitleScreen_GameTitleLogoPals"), PAL_LOGO * 16, 13 * 32);
    LoadPalette(incbin("gGraphics_TitleScreen_BoxArtMonPals"), PAL_BOXART * 16, 32);
    LoadPalette(incbin("gGraphics_TitleScreen_BackgroundPals"), PAL_PRESS_START * 16, 32);
    LoadPalette(incbin("gGraphics_TitleScreen_BackgroundPals"), PAL_BORDER * 16, 32);
    ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON | DISPCNT_WIN1_ON | DISPCNT_OBJWIN_ON);
    SetGpuReg(REG_OFFSET_WININ, 0);
    SetGpuReg(REG_OFFSET_WINOUT, 0);
    SetGpuReg(REG_OFFSET_WIN0H, 0);
    SetGpuReg(REG_OFFSET_WIN0V, 0);
    ShowBg(1);
    ShowBg(2);
    ShowBg(0);
    ShowBg(3);
    CreateSprite(spriteTemplate("sSpriteTemplate_BlankSprite", "sOamData_BlankSprite", null), 24, 144, 0);
    this.next("run");
  }

  /** Clean static backdrop behind the main-menu box (CB2_InitMainMenu stand-in). */
  toMenuBackdrop(): void {
    DestroyBlendPalettesGraduallyTask();
    ResetPaletteFade();
    ResetSpriteData();
    LoadPalette(incbin("gGraphics_TitleScreen_GameTitleLogoPals"), PAL_LOGO * 16, 13 * 32);
    LoadPalette(incbin("gGraphics_TitleScreen_BoxArtMonPals"), PAL_BOXART * 16, 32);
    LoadPalette(incbin("gGraphics_TitleScreen_BackgroundPals"), PAL_PRESS_START * 16, 32);
    LoadPalette(incbin("gGraphics_TitleScreen_BackgroundPals"), PAL_BORDER * 16, 32);
    ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON | DISPCNT_WIN1_ON | DISPCNT_OBJWIN_ON);
    SetGpuReg(REG_OFFSET_BLDCNT, 0);
    SetGpuReg(REG_OFFSET_BLDY, 0);
    SetGpuReg(REG_OFFSET_WININ, 0);
    SetGpuReg(REG_OFFSET_WINOUT, 0);
    ShowBg(1);
    ShowBg(2);
    ShowBg(0);
    ShowBg(3);
    this.flamesOn = false;
    this.blinkOn = false;
    this.scene = "menu";
    this.state = 0;
    this.done = true;
    CopyBufferedValuesToGpuRegs();
    TransferPlttBuffer();
  }

  /** A/START during RUN: enter the CRY scene (PlayCry is a placeholder until audio). */
  /** Where the title hands off when done: main menu, save-clear screen, or the intro again. */
  exitTo: "menu" | "clearsave" | "copyright" = "menu";

  pressStart(): void {
    if (this.scene === "run") {
      this.scene = "cry";
      this.state = 0;
      this.timer = 0;
      this.counter = 0;
    }
  }

  get inRun(): boolean {
    return this.scene === "run";
  }

  update(): void {
    if (this.done) return;
    this.frames++;
    // CB2_TitleScreenRun runs tasks before the scene callbacks.
    tasks.run();
    if (this.scene === "init") this.updateInit();
    else if (this.scene === "flash") this.updateFlash();
    else if (this.scene === "fadein") this.updateFadeIn();
    else if (this.scene === "run") this.updateRun();
    else if (this.scene === "cry") this.updateCry();
    else {
      CopyBufferedValuesToGpuRegs();
      TransferPlttBuffer();
      return;
    }
    if (this.flamesOn) this.updateFlameSpawner();
    if (this.blinkOn) this.updateBlink();
    this.updateSlash();
    AnimateSprites();
    BuildOamBuffer();
    LoadOam();
    UpdatePaletteFade();
    CopyBufferedValuesToGpuRegs();
    TransferPlttBuffer();
  }

  private next(scene: Scene): void {
    this.scene = scene;
    this.state = 0;
    this.timer = 0;
    this.counter = 0;
  }

  // ---------------------------------------------------------- INIT / FLASH

  private updateInit(): void {
    // SetTitleScreenScene_Init: hide logo, show art layers.
    HideBg(0);
    ShowBg(1);
    ShowBg(2);
    ShowBg(3);
    this.next("flash");
  }

  private updateFlash(): void {
    // SetTitleScreenScene_FlashSprite: white lighten band sweeping upward.
    if (this.state === 0) {
      SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG1 | BLDCNT_EFFECT_LIGHTEN);
      SetGpuReg(REG_OFFSET_BLDY, 0);
      this.counter = 128;
      this.state = 1;
    } else if (this.state === 1) {
      this.counter -= 4;
      SetGpuReg(REG_OFFSET_BLDY, Math.max(0, Math.min(16, 16 - Math.max(0, this.counter >> 3))));
      if (this.counter < 0) this.state = 2;
    } else {
      SetGpuReg(REG_OFFSET_BLDCNT, 0);
      SetGpuReg(REG_OFFSET_BLDY, 0);
      this.next("fadein");
    }
  }

  // --------------------------------------------------------------- FADE IN

  private updateFadeIn(): void {
    // Abbreviated SetTitleScreenScene_FadeIn: gray box art, fade from black,
    // WIN0 slide reveal of the logo, then full-color box art and RUN.
    switch (this.state) {
      case 0:
        this.counter = 0;
        this.state = 1;
        break;
      case 1:
        if (++this.counter > 10) {
          TintPalette_GrayScale2(gPlttBufferUnfaded.subarray(PAL_BOXART * 16, PAL_BOXART * 16 + 16), 16);
          BeginNormalPaletteFade(BOXART_MASK, 9, 16, 0, RGB_BLACK);
          this.state = 2;
        }
        break;
      case 2:
        if (!gPaletteFade.active) {
          this.counter = 0;
          this.state = 3;
        }
        break;
      case 3:
        if (++this.counter > 36) {
          SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
          SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_ALL);
          SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG0 | WINOUT_WIN01_BG1 | WINOUT_WIN01_BG2 | WINOUT_WIN01_OBJ | WINOUT_WIN01_CLR);
          SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(0, 160));
          SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, 0));
          this.counter = 0;
          BlendPalettesGradually(BOXART_MASK, -4, 1, 16, TITLE_TONE, 0, 0);
          this.state = 4;
        }
        break;
      case 4: {
        // SlideWin0 phases 1-2: reveal 0 -> 240.
        this.counter += 24;
        const w = Math.min(240, this.counter);
        SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, w));
        if (w >= 240 && !IsBlendPalettesGraduallyTaskActive(0)) {
          SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG0 | WINOUT_WIN01_BG1 | WINOUT_WIN01_BG3 | WINOUT_WIN01_OBJ | WINOUT_WIN01_CLR);
          SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(240, 240));
          this.counter = 10 * 24;
          this.state = 5;
        }
        break;
      }
      case 5: {
        // SlideWin0 phases 4-5: cover 240 -> 0 while BG2 scrolls.
        this.counter -= 24;
        const w = Math.max(0, this.counter);
        SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(w, 240));
        if (w <= 0) {
          // SlideWin0 state 5: the reveal is done, WIN0 goes off.
          ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
          SetGpuReg(REG_OFFSET_BLDCNT, 0);
          this.counter = 0;
          BlendPalettesGradually(BOXART_MASK, -4, 15, 0, TITLE_TONE, 0, 0);
          this.state = 6;
        }
        break;
      }
      case 6:
        if (!IsBlendPalettesGraduallyTaskActive(0)) {
          this.counter = 0;
          BlendPalettesGradually(BOXART_MASK, -3, 0, 16, TITLE_TONE, 0, 0);
          this.state = 7;
        }
        break;
      case 7:
        if (!IsBlendPalettesGraduallyTaskActive(0)) {
          BlendPalettes(PALETTES_BG & ~(1 << PAL_BOXART) & ~(1 << PAL_BORDER) & ~(1 << PAL_PRESS_START), 16, TITLE_TONE);
          BeginNormalPaletteFade(PALETTES_BG & ~(1 << PAL_BOXART) & ~(1 << PAL_BORDER) & ~(1 << PAL_PRESS_START), 1, 16, 0, TITLE_TONE);
          ShowBg(0);
          LoadPalette(incbin("gGraphics_TitleScreen_BoxArtMonPals"), PAL_BOXART * 16, 32);
          BlendPalettesGradually(BOXART_MASK, 1, 15, 0, TITLE_TONE, 0, 0);
          this.state = 8;
        }
        break;
      case 8:
        if (!IsBlendPalettesGraduallyTaskActive(0) && !gPaletteFade.active) this.next("run");
        break;
    }
  }

  // ------------------------------------------------------------------- RUN

  private updateRun(): void {
    if (this.state === 0) {
      // SetTitleScreenScene_Run: blink task, flame spawner, slash sprite.
      this.blinkOn = true;
      this.blinkFrame = 0;
      this.blinkShown = false;
      this.flamesOn = true;
      this.spawnerTimer = 0;
      this.spawnerDelay = 0;
      this.spawnerSeed = 30840;
      SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_OBJWIN_ON);
      SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG_ALL | WINOUT_WIN01_OBJ | WINOUT_WINOBJ_ALL);
      SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG0 | BLDCNT_EFFECT_LIGHTEN);
      SetGpuReg(REG_OFFSET_BLDY, 13);
      this.createSlash();
      this.state = 1;
    } else if (this.state === 1 && (joy.held & KEYSTROKE_DELSAVE) === KEYSTROKE_DELSAVE) {
      // CB2_FadeOutTransitionToSaveClearScreen (no fade is running, so it switches at once).
      this.slashDeactivate = true;
      this.flamesOn = false;
      this.blinkOn = false;
      this.exitTo = "clearsave";
      this.done = true;
    } else if (this.state === 1 && this.frames >= TITLE_TIMEOUT) {
      // SetTitleScreenScene_Restart: fade out, then CB2_InitCopyrightScreenAfterTitleScreen.
      BeginNormalPaletteFade(PALETTES_ALL, 3, 0, 16, RGB_BLACK);
      this.flamesOn = false;
      this.blinkOn = false;
      this.slashDeactivate = true;
      this.state = 2;
    } else if (this.state === 2 && !gPaletteFade.active) {
      this.exitTo = "copyright";
      this.done = true;
    }
  }

  private updateBlink(): void {
    // Task_TitleScreen_BlinkPressStart: 60 off / 30 on palette swap on BG pal 15.
    const target = this.blinkShown ? 30 : 60;
    if (++this.blinkFrame >= target) {
      this.blinkFrame = 0;
      this.blinkShown = !this.blinkShown;
      const base = incbin("gGraphics_TitleScreen_BackgroundPals");
      for (let i = 0; i < 5; i++) {
        // The source writes both buffers; only the faded one reaches the screen.
        const value = this.blinkShown
          ? base[12] | (base[13] << 8)
          : base[2 + i * 2] | (base[3 + i * 2] << 8);
        gPlttBufferUnfaded[PAL_PRESS_START * 16 + 1 + i] = value;
        gPlttBufferFaded[PAL_PRESS_START * 16 + 1 + i] = value;
      }
      TransferPlttBuffer();
    }
  }

  private rand(): number {
    this.spawnerSeed = (Math.imul(this.spawnerSeed, 1103515245) + 24691) >>> 0;
    return this.spawnerSeed >>> 16;
  }

  private updateFlameSpawner(): void {
    // Task_FlameSpawner (FireRed): a burst of up to 16 flames every 18 frames.
    if (++this.spawnerTimer < this.spawnerDelay) return;
    this.spawnerTimer = 0;
    this.rand();
    this.spawnerDelay = 18;
    let xspeed = (this.rand() % 4) - 2;
    let yspeed = (this.rand() % 8) - 16;
    const y = (this.rand() % 3) + 116;
    const x = this.rand() % 240;
    const positions = cdata<number[]>("title_screen", "sFlameXPositions");
    this.createFlame(x, y, xspeed, yspeed, (this.rand() % 16) >= 8);
    for (let i = 0; i < 15; i++) {
      this.createFlame(this.spawnerOffsetX + positions[i], y, xspeed, yspeed, true);
      xspeed = (this.rand() % 4) - 2;
      yspeed = (this.rand() % 8) - 16;
    }
    this.spawnerOffsetX = (this.spawnerOffsetX + 1) % 4;
  }

  private createFlame(x: number, y: number, xspeed: number, yspeed: number, flame: boolean): void {
    const id = CreateSprite(
      spriteTemplate(flame ? "sSpriteTemplate_FlameOrLeaf" : "sSpriteTemplate_BlankFlame", "sOamData_FlameOrLeaf", "sSpriteAnim_FlameOrLeaf"),
      x, y, 0);
    if (id === MAX_SPRITES) return;
    const sprite = gSprites[id];
    const data = sprite.data;
    data[0] = x * 16;
    data[1] = xspeed;
    data[2] = y * 16;
    data[3] = yspeed;
    data[4] = 0;
    data[5] = (xspeed * yspeed) % 16;
    data[6] = flame ? 1 : 0;
    sprite.callback = (s) => this.flameCallback(s);
    if (!flame) {
      sprite.invisible = true;
      data[7] = 4;
    }
  }

  private flameCallback(sprite: Sprite): void {
    // SpriteCallback_TitleScreenFlame.
    const data = sprite.data;
    data[0] -= data[1];
    sprite.x = data[0] >> 4;
    if (sprite.x < -8) { DestroySprite(sprite); return; }
    data[2] += data[3];
    sprite.y = data[2] >> 4;
    if (sprite.y < 16 || sprite.y > 200) { DestroySprite(sprite); return; }
    if (sprite.animEnded) { DestroySprite(sprite); return; }
    if (data[7] !== 0 && --data[7] === 0) {
      StartSpriteAnim(sprite, 0);
      sprite.invisible = false;
    }
  }

  private createSlash(): void {
    // CreateSlashSprite: OBJ-window slash sweeping every 540 frames.
    const id = CreateSprite(spriteTemplate("sSlashSpriteTemplate", "sOamData_SlashSprite", null), -32, 27, 1);
    this.slashId = id;
    if (id === MAX_SPRITES) return;
    this.slashTimer = 540;
    this.slashState = 0;
    this.slashDeactivate = false;
  }

  private updateSlash(): void {
    if (this.slashId === MAX_SPRITES) return;
    const sprite = gSprites[this.slashId];
    if (this.slashState === 0) {
      if (this.slashDeactivate) {
        sprite.invisible = true;
        this.slashState = 2;
      }
      if (--this.slashTimer === 0) {
        sprite.invisible = false;
        this.slashState = 1;
      }
    } else if (this.slashState === 1) {
      sprite.x += 9;
      if (sprite.x === 67) sprite.y -= 7;
      if (sprite.x === 148) sprite.y += 7;
      if (sprite.x > 240 + 32) {
        sprite.invisible = true;
        if (this.slashDeactivate) this.slashState = 2;
        else {
          sprite.x = -32;
          this.slashTimer = 540;
          this.slashState = 0;
        }
      }
    }
  }

  // ------------------------------------------------------------------- CRY

  private updateCry(): void {
    // SetTitleScreenScene_Cry: Charizard cry placeholder, white fade, menu.
    if (this.state === 0) {
      if (!gPaletteFade.active) {
        try {
          sound.playCry(6, 0);
        } catch {
          // No audio backend during startup; the 90-frame hold stands in.
        }
        this.slashDeactivate = true;
        this.counter = 0;
        this.state = 1;
      }
    } else if (this.state === 1) {
      if (++this.counter >= 90) {
        BeginNormalPaletteFade(PALETTES_ALL & ~0x1c000000, 0, 0, 16, RGB_WHITE);
        this.state = 2;
      }
    } else if (!gPaletteFade.active) {
      this.done = true;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.putImageData(ppu.renderFrame(), 0, 0);
  }
}
