// title_screen.c (FireRed): CB2_InitTitleScreen and the INIT / FLASHSPRITE /
// FADEIN / RUN / RESTART / CRY scene machine with the flame spawner, slash
// sprite and press-start blink, as tasks on the TS hardware layer. LeafGreen
// branches (leaves, streaks) are not built. IntroTitle only drives the frame
// loop and reports where the title hands off.
import { sound } from "./audio/sound";
import * as C from "./generated/constants";
import { cdata, incbin, loadCData, preloadIncbin } from "./hw/assets";
import { type BgTemplate, ChangeBgX, BG_COORD_SET, HideBg, InitBgsFromTemplates, LoadBgTilemap, LoadBgTiles, ShowBg } from "./hw/bg";
import { tasks } from "./gba/tasks";
import { A_BUTTON, B_BUTTON, DPAD_UP, joy, SELECT_BUTTON, START_BUTTON } from "./gba/input";
import { gMain, GetTimer1Low, SetMainCallback2, SetVBlankCallback, StartTimer1 } from "./hw/runtime";
import { ClearGpuRegBits, CopyBufferedValuesToGpuRegs, InitGpuRegManager, SetGpuReg, SetGpuRegBits } from "./hw/gpu";
import { ResetBgPositions } from "./hw/menuHelpers";
import {
  BeginNormalPaletteFade, BlendPalettes, BlendPalettesGradually, DestroyBlendPalettesGraduallyTask, gPaletteFade,
  IsBlendPalettesGraduallyTaskActive, LoadPalette, PALETTES_ALL, PALETTES_BG,
  ResetPaletteFade, ResetPaletteFadeControl, RGB, RGB_BLACK, RGB_WHITE, TintPalette_GrayScale2,
  TransferPlttBuffer, UpdatePaletteFade, gPlttBufferFaded, gPlttBufferUnfaded,
} from "./hw/palette";
import {
  BLDCNT_EFFECT_LIGHTEN, BLDCNT_TGT1_BG0, BLDCNT_TGT1_BG1,
  DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, DISPCNT_OBJWIN_ON, DISPCNT_WIN0_ON, DISPCNT_WIN1_ON,
  DISPLAY_HEIGHT, DISPLAY_WIDTH, ppu,
  REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BG1HOFS, REG_OFFSET_BG1VOFS,
  REG_OFFSET_BG2HOFS, REG_OFFSET_BG2VOFS, REG_OFFSET_BG3HOFS, REG_OFFSET_BG3VOFS,
  REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT,
  REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT,
  WIN_RANGE, WININ_WIN0_ALL,
  WINOUT_WIN01_BG0, WINOUT_WIN01_BG1, WINOUT_WIN01_BG2, WINOUT_WIN01_BG3,
  WINOUT_WIN01_BG_ALL, WINOUT_WIN01_CLR, WINOUT_WIN01_OBJ, WINOUT_WINOBJ_ALL,
} from "./hw/ppu";
import {
  SCANLINE_EFFECT_DMACNT_16BIT, ScanlineEffect_Clear, ScanlineEffect_InitHBlankDmaTransfer, ScanlineEffect_SetParams,
  ScanlineEffect_Stop, gScanlineEffect, gScanlineEffectRegBuffers,
} from "./hw/scanline";
import {
  ANIMCMD_END, ANIMCMD_FRAME, ANIMCMD_JUMP, AnimateSprites,
  BuildOamBuffer, CreateSprite, DestroySprite, FreeAllSpritePalettes, gDummySpriteAffineAnimTable,
  gDummySpriteAnimTable, gSprites, IndexOfSpritePaletteTag, LoadOam, LoadSpritePalette,
  LoadSpriteSheet, MAX_SPRITES, oamData, ProcessSpriteCopyRequests, ResetSpriteData,
  SpriteCallbackDummy, StartSpriteAnim,
  type AnimCmd, type OamData, type Sprite, type SpriteTemplate,
} from "./hw/sprite";

// help_system.c pulls in the quest log and field modules, which must not load before start-up finishes
// (circular imports); preload() imports it once and the title screen calls it through this handle.
let helpSystem: typeof import("./helpSystem") | null = null;

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

// enum TitleScreenScene
const TITLESCREENSCENE_INIT = 0;
const TITLESCREENSCENE_FLASHSPRITE = 1;
const TITLESCREENSCENE_FADEIN = 2;
const TITLESCREENSCENE_RUN = 3;
const TITLESCREENSCENE_RESTART = 4;
const TITLESCREENSCENE_CRY = 5;

const TITLE_SPECIES = C.SPECIES_CHARIZARD;
const TASK_NONE = 0xff;

// enum: sprite tile / palette tags
const TILE_TAG_FLAME_OR_LEAF = 0;
const TILE_TAG_BLANK_OR_STREAK = 1;
const TILE_TAG_BLANK = 2;
const TILE_TAG_SLASH = 3;
const PAL_TAG_DEFAULT = 0;
const PAL_TAG_SLASH = 2;

const BG_PLTT_ID = (n: number): number => n * 16;
const PLTT_SIZE_4BPP = 32;
const RGB_TITLE = RGB(30, 30, 31);

const KEYSTROKE_DELSAVE = B_BUTTON | SELECT_BUTTON | DPAD_UP;
const KEYSTROKE_BERRY_FIX = B_BUTTON | SELECT_BUTTON;
const sStreakYPositions = [40, 80, 110, 60, 90, 70, 100, 50];

type ExtractedAnim = { frame?: { imageValue: number; duration: number }; jump?: { target: number } };
type SymRef = { $sym: string };

function animList(name: string): AnimCmd[][] {
  return cdata<SymRef[]>("title_screen", name).map(({ $sym }) =>
    cdata<ExtractedAnim[]>("title_screen", $sym).map((cmd) =>
      cmd.frame ? ANIMCMD_FRAME(cmd.frame.imageValue, cmd.frame.duration) :
        cmd.jump ? ANIMCMD_JUMP(cmd.jump.target) : ANIMCMD_END));
}

const templateCache = new Map<string, SpriteTemplate>();
function spriteTemplate(name: string, oamName: string, animName: string | null): SpriteTemplate {
  let template = templateCache.get(name);
  if (!template) {
    const def = cdata<{ tileTag: number; paletteTag: number }>("title_screen", name);
    template = {
      tileTag: def.tileTag,
      paletteTag: def.paletteTag,
      oam: oamData(cdata<OamData>("title_screen", oamName)),
      anims: animName ? animList(animName) : gDummySpriteAnimTable,
      images: null,
      affineAnims: gDummySpriteAffineAnimTable,
      callback: SpriteCallbackDummy,
    };
    templateCache.set(name, template);
  }
  return template;
}

/** INCBIN_U16 palette as halfwords. */
function palWords(symbol: string): Uint16Array {
  const bytes = incbin(symbol);
  const out = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
  return out;
}

let sTitleScreenTimerTaskId = TASK_NONE;
/** Where the title hands off; the browser start-up stage reads this instead of the C SetMainCallback2 targets. */
let sExit: "menu" | "clearsave" | "copyright" | null = null;

// ---------------------------------------------------------------- init

/** CB2_InitTitleScreen (title_screen.c): its three states run back to back in one call. */
export function CB2_InitTitleScreen(): void {
  // gMain.state 0
  SetVBlankCallback(null);
  StartTimer1();
  tasks.reset();
  ResetSpriteData();
  FreeAllSpritePalettes();
  ResetPaletteFade();
  ResetGpuRegs();
  ppu.resetIo();
  InitGpuRegManager();
  ppu.vram.fill(0);
  ppu.oam.fill(0);
  ppu.pltt.fill(0);
  ScanlineEffect_Clear();
  InitBgsFromTemplates(0, cdata<BgTemplate[]>("title_screen", "sBgTemplates"));
  SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
  sTitleScreenTimerTaskId = TASK_NONE;
  // gMain.state 1: BG0 logo (8bpp), BG1 box art, BG2 copyright/press-start, BG3 border.
  const load = (bg: number, tiles: string, map: string): void => {
    LoadBgTiles(bg, incbin(tiles), incbin(tiles).length, 0);
    LoadBgTilemap(bg, incbin(map), incbin(map).length, 0);
  };
  LoadPalette(incbin("gGraphics_TitleScreen_GameTitleLogoPals"), BG_PLTT_ID(0), 13 * PLTT_SIZE_4BPP);
  load(0, "gGraphics_TitleScreen_GameTitleLogoTiles", "gGraphics_TitleScreen_GameTitleLogoMap");
  LoadPalette(incbin("gGraphics_TitleScreen_BoxArtMonPals"), BG_PLTT_ID(13), PLTT_SIZE_4BPP);
  load(1, "gGraphics_TitleScreen_BoxArtMonTiles", "gGraphics_TitleScreen_BoxArtMonMap");
  LoadPalette(incbin("gGraphics_TitleScreen_BackgroundPals"), BG_PLTT_ID(15), PLTT_SIZE_4BPP);
  load(2, "gGraphics_TitleScreen_CopyrightPressStartTiles", "gGraphics_TitleScreen_CopyrightPressStartMap");
  LoadPalette(incbin("gGraphics_TitleScreen_BackgroundPals"), BG_PLTT_ID(14), PLTT_SIZE_4BPP);
  load(3, "title_screen.c:sBorderBgTiles", "title_screen.c:sBorderBgMap");
  LoadSpriteGfxAndPals();
  // gMain.state 2 (FreeTempTileDataBuffersIfPossible is always false: DMA copies are synchronous).
  BlendPalettes(PALETTES_BG, 16, RGB_BLACK);
  tasks.create(Task_TitleScreenMain, 4);
  sTitleScreenTimerTaskId = tasks.create(Task_TitleScreenTimer, 2);
  SetVBlankCallback(VBlankCB);
  SetMainCallback2(CB2_TitleScreenRun);
  sExit = null;
  try {
    sound.playBGM(C.MUS_TITLE); // m4aSongNumStart(MUS_TITLE)
  } catch {
    // No audio backend during start-up.
  }
}

/** ResetGpuRegs (title_screen.c). */
function ResetGpuRegs(): void {
  SetGpuReg(REG_OFFSET_DISPCNT, 0);
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  SetGpuReg(REG_OFFSET_BLDALPHA, 0);
  SetGpuReg(REG_OFFSET_BLDY, 0);
  SetGpuReg(REG_OFFSET_BG0HOFS, 0);
  SetGpuReg(REG_OFFSET_BG0VOFS, 0);
  SetGpuReg(REG_OFFSET_BG1HOFS, 0);
  SetGpuReg(REG_OFFSET_BG1VOFS, 0);
  SetGpuReg(REG_OFFSET_BG2HOFS, 0);
  SetGpuReg(REG_OFFSET_BG2VOFS, 0);
  SetGpuReg(REG_OFFSET_BG3HOFS, 0);
  SetGpuReg(REG_OFFSET_BG3VOFS, 0);
}

/** CB2_TitleScreenRun (title_screen.c). */
function CB2_TitleScreenRun(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

/** VBlankCB (title_screen.c). */
function VBlankCB(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
  ScanlineEffect_InitHBlankDmaTransfer();
  if (sTitleScreenTimerTaskId !== TASK_NONE) tasks.data(sTitleScreenTimerTaskId)[0]++;
}

/** Task_TitleScreenTimer (title_screen.c). */
function Task_TitleScreenTimer(taskId: number): void {
  const data = tasks.data(taskId);
  if (data[0] >= 2700) {
    sTitleScreenTimerTaskId = TASK_NONE;
    tasks.destroy(taskId);
  }
}

// task data for Task_TitleScreenMain and the scenes
const tSceneNum = 0;
const tState = 1;
const tHasCreatedBlankSprite = 5;
const tSlashSpriteId = 6;

/** Task_TitleScreenMain (title_screen.c). */
function Task_TitleScreenMain(taskId: number): void {
  const data = tasks.data(taskId);
  if ((joy.newKeys & (A_BUTTON | B_BUTTON | START_BUTTON)) !== 0
    && data[tSceneNum] !== TITLESCREENSCENE_RUN
    && data[tSceneNum] !== TITLESCREENSCENE_RESTART
    && data[tSceneNum] !== TITLESCREENSCENE_CRY) {
    ScheduleStopScanlineEffect();
    LoadMainTitleScreenPalsAndResetBgs();
    SetPalOnOrCreateBlankSprite(!!data[tHasCreatedBlankSprite]);
    SetTitleScreenScene(data, TITLESCREENSCENE_RUN);
  } else {
    sSceneFuncs[data[tSceneNum]](data);
  }
}

/** SetTitleScreenScene (title_screen.c). */
function SetTitleScreenScene(data: number[], sceneNum: number): void {
  data[tState] = 0;
  data[tSceneNum] = sceneNum;
}

/** SetTitleScreenScene_Init (title_screen.c). */
function SetTitleScreenScene_Init(data: number[]): void {
  HideBg(0);
  ShowBg(1);
  ShowBg(2);
  ShowBg(3);
  gScanlineEffectRegBuffers[0].fill(0, 0, 0xa0);
  gScanlineEffectRegBuffers[1].fill(0, 0, 0xa0);
  ScanlineEffect_SetParams({ dmaDest: REG_OFFSET_BLDY, dmaControl: SCANLINE_EFFECT_DMACNT_16BIT, initState: 1, unused9: 0 });
  SetTitleScreenScene(data, TITLESCREENSCENE_FLASHSPRITE);
}

/** SetTitleScreenScene_FlashSprite (title_screen.c). */
function SetTitleScreenScene_FlashSprite(data: number[]): void {
  switch (data[tState]) {
    case 0:
      SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG1 | BLDCNT_EFFECT_LIGHTEN);
      SetGpuReg(REG_OFFSET_BLDY, 0);
      data[2] = 128;
      UpdateScanlineEffectRegBuffer(data[2]);
      data[tState]++;
      break;
    case 1:
      data[2] -= 4;
      UpdateScanlineEffectRegBuffer(data[2]);
      if (data[2] < 0) {
        gScanlineEffect.state = 3;
        data[tState]++;
      }
      break;
    case 2:
      SetGpuReg(REG_OFFSET_BLDCNT, 0);
      SetGpuReg(REG_OFFSET_BLDY, 0);
      SetTitleScreenScene(data, TITLESCREENSCENE_FADEIN);
  }
}

/** SetTitleScreenScene_FadeIn (title_screen.c). */
function SetTitleScreenScene_FadeIn(data: number[]): void {
  switch (data[tState]) {
    case 0:
      data[2] = 0;
      data[tState]++;
      break;
    case 1:
      data[2]++;
      if (data[2] > 10) {
        TintPalette_GrayScale2(gPlttBufferUnfaded.subarray(BG_PLTT_ID(13), BG_PLTT_ID(13) + 16), 16);
        BeginNormalPaletteFade(1 << 13, 9, 16, 0, RGB_BLACK);
        data[tState]++;
      }
      break;
    case 2:
      if (!gPaletteFade.active) {
        data[2] = 0;
        data[tState]++;
      }
      break;
    case 3:
      data[2]++;
      if (data[2] > 36) {
        tasks.create(Task_TitleScreen_SlideWin0, 3);
        BlendPalettesGradually(1 << 13, -4, 1, 16, RGB_TITLE, 0, 0);
        data[2] = 0;
        data[tState]++;
      }
      break;
    case 4:
      if (!IsBlendPalettesGraduallyTaskActive(0)) {
        BlendPalettesGradually(1 << 13, -4, 15, 0, RGB_TITLE, 0, 0);
        data[tState]++;
      }
      break;
    case 5:
      data[2]++;
      if (data[2] > 20) {
        data[2] = 0;
        BlendPalettesGradually(1 << 13, -4, 1, 16, RGB_TITLE, 0, 0);
        data[tState]++;
      }
      break;
    case 6:
      if (!IsBlendPalettesGraduallyTaskActive(0)) {
        BlendPalettesGradually(1 << 13, -4, 15, 0, RGB_TITLE, 0, 0);
        data[tState]++;
      }
      break;
    case 7:
      data[2]++;
      if (data[2] > 20) {
        data[2] = 0;
        BlendPalettesGradually(1 << 13, -3, 0, 16, RGB_TITLE, 0, 0);
        data[tState]++;
      }
      break;
    case 8:
      if (!IsBlendPalettesGraduallyTaskActive(0)) {
        data[tHasCreatedBlankSprite] = 1;
        const palettes = ((PALETTES_BG & ~(1 << 13) & ~(1 << 14) & ~(1 << 15)) | (0x10000 << CreateBlankSprite())) >>> 0;
        BlendPalettes(palettes, 16, RGB_TITLE);
        BeginNormalPaletteFade(palettes, 1, 16, 0, RGB_TITLE);
        ShowBg(0);
        gPlttBufferUnfaded.set(palWords("gGraphics_TitleScreen_BoxArtMonPals").subarray(0, 16), BG_PLTT_ID(13));
        BlendPalettesGradually(1 << 13, 1, 15, 0, RGB_TITLE, 0, 0);
        data[tState]++;
      }
      break;
    case 9:
      if (!IsBlendPalettesGraduallyTaskActive(0) && !gPaletteFade.active) SetTitleScreenScene(data, TITLESCREENSCENE_RUN);
      break;
  }
}

/** SetTitleScreenScene_Run (title_screen.c). */
function SetTitleScreenScene_Run(data: number[]): void {
  switch (data[tState]) {
    case 0:
      helpSystem?.SetHelpContext(C.HELPCONTEXT_TITLE_SCREEN);
      tasks.create(Task_TitleScreen_BlinkPressStart, 0);
      tasks.create(Task_FlameSpawner, 5);
      SetGpuRegsForTitleScreenRun();
      data[tSlashSpriteId] = CreateSlashSprite();
      helpSystem?.HelpSystem_Enable();
      data[tState]++;
    // fallthrough
    case 1:
      if ((joy.held & KEYSTROKE_DELSAVE) === KEYSTROKE_DELSAVE) {
        DeactivateSlashSprite(data[tSlashSpriteId]);
        tasks.destroy(tasks.findByFunc(Task_TitleScreenMain));
        SetMainCallback2(CB2_FadeOutTransitionToSaveClearScreen);
      } else if ((joy.held & KEYSTROKE_BERRY_FIX) === KEYSTROKE_BERRY_FIX) {
        DeactivateSlashSprite(data[tSlashSpriteId]);
        tasks.destroy(tasks.findByFunc(Task_TitleScreenMain));
        SetMainCallback2(CB2_FadeOutTransitionToBerryFix);
      } else if ((joy.newKeys & (A_BUTTON | START_BUTTON)) !== 0) {
        SetTitleScreenScene(data, TITLESCREENSCENE_CRY);
      } else if (!tasks.isActive(Task_TitleScreenTimer)) {
        SetTitleScreenScene(data, TITLESCREENSCENE_RESTART);
      }
      break;
  }
}

/** SetGpuRegsForTitleScreenRun (title_screen.c). */
function SetGpuRegsForTitleScreenRun(): void {
  SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_OBJWIN_ON);
  SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG_ALL | WINOUT_WIN01_OBJ | WINOUT_WINOBJ_ALL);
  SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG0 | BLDCNT_EFFECT_LIGHTEN);
  SetGpuReg(REG_OFFSET_BLDY, 13);
}

/** SetTitleScreenScene_Restart (title_screen.c). */
function SetTitleScreenScene_Restart(data: number[]): void {
  switch (data[tState]) {
    case 0:
      DeactivateSlashSprite(data[tSlashSpriteId]);
      data[tState]++;
      break;
    case 1:
      if (!gPaletteFade.active && !IsSlashSpriteDeactivated(data[tSlashSpriteId])) {
        sound.fadeOutMapMusic(10);
        BeginNormalPaletteFade(PALETTES_ALL, 3, 0, 0x10, RGB_BLACK);
        SignalEndTitleScreenPaletteSomethingTask();
        data[1]++;
      }
      break;
    case 2:
      if (sound.isNotWaitingForBGMStop() && !gPaletteFade.active) {
        tasks.destroy(tasks.findByFunc(Task_TitleScreen_BlinkPressStart));
        data[2] = 0;
        data[tState]++;
      }
      break;
    case 3:
      data[2]++;
      if (data[2] >= 20) {
        tasks.destroy(tasks.findByFunc(Task_TitleScreen_BlinkPressStart));
        data[tState]++;
      }
      break;
    case 4:
      helpSystem?.HelpSystem_Disable();
      tasks.destroy(tasks.findByFunc(Task_TitleScreenMain));
      CB2_InitCopyrightScreenAfterTitleScreen();
      break;
  }
}

/** CB2_InitCopyrightScreenAfterTitleScreen (intro.c): the start-up stage restarts the intro. */
function CB2_InitCopyrightScreenAfterTitleScreen(): void {
  sExit = "copyright";
  SetMainCallback2(null);
}

/** SetTitleScreenScene_Cry (title_screen.c). */
function SetTitleScreenScene_Cry(data: number[]): void {
  switch (data[tState]) {
    case 0:
      if (!gPaletteFade.active) {
        try {
          sound.PlayCry_Normal(TITLE_SPECIES, 0);
        } catch {
          // No audio backend during start-up; the 90-frame hold below stands in.
        }
        DeactivateSlashSprite(data[tSlashSpriteId]);
        data[2] = 0;
        data[tState]++;
      }
      break;
    case 1:
      if (data[2] < 90) {
        data[2]++;
      } else if (!IsSlashSpriteDeactivated(data[tSlashSpriteId])) {
        BeginNormalPaletteFade((PALETTES_ALL & ~(1 << 0x1c) & ~(1 << 0x1d) & ~(1 << 0x1e) & ~(1 << 0x1f)) >>> 0, 0, 0, 16, RGB_WHITE);
        SignalEndTitleScreenPaletteSomethingTask();
        sound.fadeOutBGM(4);
        data[tState]++;
      }
      break;
    case 2:
      if (!gPaletteFade.active) {
        // SeedRngAndSetTrainerId, save loading and CB2_InitMainMenu run in the start-up stage (main.c/startup.ts).
        sExit = "menu";
        SetMainCallback2(null);
        tasks.destroy(tasks.findByFunc(Task_TitleScreenMain));
      }
      break;
  }
}

const sSceneFuncs: Array<(data: number[]) => void> = [
  SetTitleScreenScene_Init,
  SetTitleScreenScene_FlashSprite,
  SetTitleScreenScene_FadeIn,
  SetTitleScreenScene_Run,
  SetTitleScreenScene_Restart,
  SetTitleScreenScene_Cry,
];

/** Task_TitleScreen_SlideWin0 (title_screen.c). */
function Task_TitleScreen_SlideWin0(taskId: number): void {
  const data = tasks.data(taskId);
  switch (data[0]) {
    case 0:
      SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
      SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_ALL);
      SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG0 | WINOUT_WIN01_BG1 | WINOUT_WIN01_BG2 | WINOUT_WIN01_OBJ | WINOUT_WIN01_CLR);
      SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(0, DISPLAY_HEIGHT));
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, 0));
      BlendPalettes(1 << 0xe, 0, RGB_BLACK);
      data[0]++;
      break;
    case 1:
      data[1] += 24 << 4;
      data[2] = data[1] >> 4;
      if (data[2] >= DISPLAY_WIDTH) {
        data[2] = DISPLAY_WIDTH;
        data[0]++;
      }
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, data[2]));
      break;
    case 2:
      data[3]++;
      if (data[3] >= 10) {
        data[3] = 0;
        data[0]++;
      }
      break;
    case 3:
      SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG0 | WINOUT_WIN01_BG1 | WINOUT_WIN01_BG3 | WINOUT_WIN01_OBJ | WINOUT_WIN01_CLR);
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(DISPLAY_WIDTH, DISPLAY_WIDTH));
      ChangeBgX(2, -0xf000, BG_COORD_SET);
      BlendPalettes(1 << 0xf, 0, RGB_BLACK);
      data[1] = (10 * 24) << 4;
      data[0]++;
      break;
    case 4:
      data[1] -= 24 << 4;
      data[2] = data[1] >> 4;
      if (data[2] <= 0) {
        data[2] = 0;
        data[0]++;
      }
      ChangeBgX(2, -data[2] << 8, BG_COORD_SET);
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(data[2], DISPLAY_WIDTH));
      break;
    case 5:
      ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
      tasks.destroy(taskId);
      break;
  }
}

/** Task_TitleScreen_BlinkPressStart (title_screen.c). */
function Task_TitleScreen_BlinkPressStart(taskId: number): void {
  const data = tasks.data(taskId);
  if (data[15] && gPaletteFade.active) data[14] = 1;
  if (data[14] && !gPaletteFade.active) {
    tasks.destroy(taskId);
  } else {
    if (!data[1]) data[2] = 60;
    else data[2] = 30;
    data[0]++;
    if (data[0] >= data[2]) {
      data[0] = 0;
      data[1] ^= 1;
      const pals = palWords("gGraphics_TitleScreen_BackgroundPals");
      for (let i = 0; i < 5; i++) {
        const value = data[1] ? pals[6] : pals[1 + i];
        gPlttBufferUnfaded[BG_PLTT_ID(15) + 1 + i] = value;
        gPlttBufferFaded[BG_PLTT_ID(15) + 1 + i] = value;
      }
      if (data[14]) BlendPalettes(0x00008000, gPaletteFade.y, gPaletteFade.blendColor);
    }
  }
}

/** SignalEndTitleScreenPaletteSomethingTask (title_screen.c). */
function SignalEndTitleScreenPaletteSomethingTask(): void {
  const taskId = tasks.findByFunc(Task_TitleScreen_BlinkPressStart);
  if (taskId !== TASK_NONE) tasks.data(taskId)[15] = 1;
}

/** UpdateScanlineEffectRegBuffer (title_screen.c). */
function UpdateScanlineEffectRegBuffer(y: number): void {
  const buffer = gScanlineEffectRegBuffers[gScanlineEffect.srcBuffer];
  if (y >= 0) buffer[y] = 16;
  for (let i = 0; i < 16; i++) {
    if (y + i >= 0) buffer[y + i] = 15 - i;
    if (y - i >= 0) buffer[y - i] = 15 - i;
  }
  for (let i = y + 16; i < 160; i++) {
    if (i >= 0) buffer[i] = 0;
  }
  for (let i = y - 16; i >= 0; i--) {
    if (i >= 0) buffer[i] = 0;
  }
}

/** ScheduleStopScanlineEffect (title_screen.c). */
function ScheduleStopScanlineEffect(): void {
  if (gScanlineEffect.state) gScanlineEffect.state = 3;
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  SetGpuReg(REG_OFFSET_BLDY, 0);
}

/** LoadMainTitleScreenPalsAndResetBgs (title_screen.c). */
function LoadMainTitleScreenPalsAndResetBgs(): void {
  const taskId = tasks.findByFunc(Task_TitleScreen_SlideWin0);
  if (taskId !== TASK_NONE) tasks.destroy(taskId);
  DestroyBlendPalettesGraduallyTask();
  ResetPaletteFadeControl();
  LoadPalette(incbin("gGraphics_TitleScreen_GameTitleLogoPals"), BG_PLTT_ID(0), 13 * PLTT_SIZE_4BPP);
  LoadPalette(incbin("gGraphics_TitleScreen_BoxArtMonPals"), BG_PLTT_ID(13), PLTT_SIZE_4BPP);
  LoadPalette(incbin("gGraphics_TitleScreen_BackgroundPals"), BG_PLTT_ID(15), PLTT_SIZE_4BPP);
  LoadPalette(incbin("gGraphics_TitleScreen_BackgroundPals"), BG_PLTT_ID(14), PLTT_SIZE_4BPP);
  ResetBgPositions();
  ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON | DISPCNT_WIN1_ON | DISPCNT_OBJWIN_ON);
  ShowBg(1);
  ShowBg(2);
  ShowBg(0);
  ShowBg(3);
}

/** CB2_FadeOutTransitionToSaveClearScreen (title_screen.c): CB2_SaveClearScreen_Init runs in the start-up stage. */
function CB2_FadeOutTransitionToSaveClearScreen(): void {
  if (!UpdatePaletteFade()) {
    sExit = "clearsave";
    SetMainCallback2(null);
  }
}

/** CB2_FadeOutTransitionToBerryFix (title_screen.c). */
function CB2_FadeOutTransitionToBerryFix(): void {
  if (!UpdatePaletteFade()) {
    sound.m4aMPlayAllStop();
    sExit = "clearsave";
    SetMainCallback2(null);
  }
}

/** LoadSpriteGfxAndPals (title_screen.c). */
function LoadSpriteGfxAndPals(): void {
  LoadSpriteSheet({ data: incbin("title_screen.c:sFlames_Gfx"), size: 0x500, tag: TILE_TAG_FLAME_OR_LEAF });
  LoadSpriteSheet({ data: incbin("title_screen.c:sBlankFlames_Gfx"), size: 0x500, tag: TILE_TAG_BLANK_OR_STREAK });
  LoadSpriteSheet({ data: incbin("gTitleScreen_BlankSprite_Tiles"), size: 0x400, tag: TILE_TAG_BLANK });
  LoadSpriteSheet({ data: incbin("title_screen.c:sSlash_Gfx"), size: 0x800, tag: TILE_TAG_SLASH });
  LoadSpritePalette({ data: incbin("title_screen.c:sFlames_Pal"), tag: PAL_TAG_DEFAULT });
  LoadSpritePalette({ data: incbin("gTitleScreen_Slash_Pal"), tag: PAL_TAG_SLASH });
}

// ---------------------------------------------------------------- flames

// sprite data for SpriteCallback_TitleScreenFlame
const sPosX = 0;
const sSpeedX = 1;
const sPosY = 2;
const sSpeedY = 3;

/** SpriteCallback_TitleScreenFlame (title_screen.c). */
function SpriteCallback_TitleScreenFlame(sprite: Sprite): void {
  const data = sprite.data;
  data[sPosX] -= data[sSpeedX];
  sprite.x = data[sPosX] >> 4;
  if (sprite.x < -8) {
    DestroySprite(sprite);
    return;
  }
  data[sPosY] += data[sSpeedY];
  sprite.y = data[sPosY] >> 4;
  if (sprite.y < 16 || sprite.y > 200) {
    DestroySprite(sprite);
    return;
  }
  if (sprite.animEnded) {
    DestroySprite(sprite);
    return;
  }
  if (data[7] !== 0 && --data[7] === 0) {
    StartSpriteAnim(sprite, 0);
    sprite.invisible = false;
  }
}

/** CreateFlameSprite (title_screen.c). */
function CreateFlameSprite(x: number, y: number, xspeed: number, yspeed: number, createFlame: boolean): boolean {
  const template = createFlame
    ? spriteTemplate("sSpriteTemplate_FlameOrLeaf", "sOamData_FlameOrLeaf", "sSpriteAnim_FlameOrLeaf")
    : spriteTemplate("sSpriteTemplate_BlankFlame", "sOamData_FlameOrLeaf", "sSpriteAnim_FlameOrLeaf");
  const spriteId = CreateSprite(template, x, y, 0);
  if (spriteId !== MAX_SPRITES) {
    const sprite = gSprites[spriteId];
    sprite.data[sPosX] = x * 16;
    sprite.data[sSpeedX] = xspeed;
    sprite.data[sPosY] = y * 16;
    sprite.data[sSpeedY] = yspeed;
    sprite.data[4] = 0;
    sprite.data[5] = (xspeed * yspeed) % 16;
    sprite.data[6] = createFlame ? 1 : 0;
    sprite.callback = SpriteCallback_TitleScreenFlame;
    return true;
  }
  return false;
}

// task data for Task_FlameSpawner
const tFlameState = 0;
const tTimer = 1;
const tDelay = 2;
const tOff_Seed = 3; // data[3] and data[4]
const tOffsetX = 5;

/** Task_FlameSpawner (title_screen.c). */
function Task_FlameSpawner(taskId: number): void {
  const data = tasks.data(taskId);
  switch (data[tFlameState]) {
    case 0:
      TitleScreen_srand(taskId, tOff_Seed, 30840);
      data[tFlameState]++;
      break;
    case 1:
      data[tTimer]++;
      if (data[tTimer] >= data[tDelay]) {
        data[tTimer] = 0;
        TitleScreen_rand(taskId, tOff_Seed);
        data[tDelay] = 18;
        let xspeed = (TitleScreen_rand(taskId, tOff_Seed) % 4) - 2;
        let yspeed = (TitleScreen_rand(taskId, tOff_Seed) % 8) - 16;
        const y = (TitleScreen_rand(taskId, tOff_Seed) % 3) + 116;
        const x = TitleScreen_rand(taskId, tOff_Seed) % DISPLAY_WIDTH;
        const positions = cdata<number[]>("title_screen", "sFlameXPositions");
        CreateFlameSprite(x, y, xspeed, yspeed, (TitleScreen_rand(taskId, tOff_Seed) % 16) >= 8);
        for (let i = 0; i < 15; i++) {
          CreateFlameSprite(data[tOffsetX] + positions[i], y, xspeed, yspeed, true);
          xspeed = (TitleScreen_rand(taskId, tOff_Seed) % 4) - 2;
          yspeed = (TitleScreen_rand(taskId, tOff_Seed) % 8) - 16;
        }
        data[tOffsetX]++;
        if (data[tOffsetX] > 3) data[tOffsetX] = 0;
      }
  }
}

/** TitleScreen_srand (title_screen.c). */
function TitleScreen_srand(taskId: number, field: number, seed: number): void {
  tasks.setWordArg(taskId, field, seed);
}

/** TitleScreen_rand (title_screen.c): ISO_RANDOMIZE1. */
function TitleScreen_rand(taskId: number, field: number): number {
  let rngval = tasks.getWordArg(taskId, field);
  rngval = (Math.imul(rngval, 1103515245) + 24691) >>> 0;
  tasks.setWordArg(taskId, field, rngval);
  return rngval >>> 16;
}

// ---------------------------------------------------------------- leaves & streaks (LeafGreen)

/** SpriteCallback_TitleScreenLeaf (title_screen.c). */
function SpriteCallback_TitleScreenLeaf(sprite: Sprite): void {
  const data = sprite.data;
  data[sPosX] -= data[sSpeedX];
  sprite.x = data[sPosX] >> 4;
  if (sprite.x < -8) {
    DestroySprite(sprite);
    return;
  }
  data[sPosY] += data[sSpeedY];
  sprite.y = data[sPosY] >> 4;
  if (sprite.y < 16 || sprite.y > 200) {
    DestroySprite(sprite);
    return;
  }
  if (!data[5]) {
    data[6]++;
    let r2 = data[sSpeedX] * data[6];
    let r1 = data[sSpeedY] * data[6];
    r2 = (r2 * r2) >> 4;
    r1 = (r1 * r1) >> 4;
    if (r2 + r1 >= 81 << 4) {
      data[5] = 1;
    }
  }
}

/** CreateLeafSprite (title_screen.c). */
function CreateLeafSprite(y: number, xspeed: number, yspeed: number): void {
  const template = spriteTemplate("sSpriteTemplate_FlameOrLeaf", "sOamData_FlameOrLeaf", "sSpriteAnim_FlameOrLeaf");
  const spriteId = CreateSprite(template, DISPLAY_WIDTH, y, 0);
  if (spriteId !== MAX_SPRITES) {
    const sprite = gSprites[spriteId];
    sprite.data[sPosX] = DISPLAY_WIDTH * 16;
    sprite.data[sSpeedX] = xspeed;
    sprite.data[sPosY] = y * 16;
    sprite.data[sSpeedY] = yspeed;
    sprite.callback = SpriteCallback_TitleScreenLeaf;
  }
}

/** SpriteCallback_Streak (title_screen.c). */
function SpriteCallback_Streak(sprite: Sprite): void {
  sprite.x -= 7;
  if (sprite.x < -16) {
    sprite.x = DISPLAY_WIDTH + 16;
    sprite.data[7]++;
    if (sprite.data[7] >= sStreakYPositions.length) {
      sprite.data[7] = 0;
    }
    sprite.y = sStreakYPositions[sprite.data[7]];
  }
}

/** CreateStreakSprites (title_screen.c). */
function CreateStreakSprites(): void {
  const template = spriteTemplate("sSpriteTemplate_BlankFlame", "sOamData_FlameOrLeaf", null);
  for (let i = 0; i < 4; i++) {
    const spriteId = CreateSprite(template, DISPLAY_WIDTH + 16 + 40 * i, sStreakYPositions[i], 0xff);
    if (spriteId !== MAX_SPRITES) {
      gSprites[spriteId].data[7] = i;
      gSprites[spriteId].callback = SpriteCallback_Streak;
    }
  }
}

/** Task_LeafSpawner (title_screen.c). */
function Task_LeafSpawner(taskId: number): void {
  const data = tasks.data(taskId);
  switch (data[tFlameState]) {
    case 0:
      CreateStreakSprites();
      TitleScreen_srand(taskId, tOff_Seed, 30840);
      data[tFlameState]++;
      break;
    case 1:
      data[tTimer]++;
      if (data[tTimer] >= data[tDelay]) {
        data[tTimer] = 0;
        data[tDelay] = (TitleScreen_rand(taskId, tOff_Seed) % 6) + 6;
        const rval = TitleScreen_rand(taskId, tOff_Seed) % 30;
        let xspeed = 16;
        if (rval >= 6) {
          xspeed = 48;
          if (rval < 12) {
            xspeed = 24;
          }
        }
        const yspeed = (TitleScreen_rand(taskId, tOff_Seed) % 4) - 2;
        const y = (TitleScreen_rand(taskId, tOff_Seed) % 88) + 32;
        CreateLeafSprite(y, xspeed, yspeed);
      }
      break;
  }
}

// ---------------------------------------------------------------- blank sprite and slash

/** CreateBlankSprite (title_screen.c). */
function CreateBlankSprite(): number {
  CreateSprite(spriteTemplate("sSpriteTemplate_BlankSprite", "sOamData_BlankSprite", null), 24, 144, 0);
  return IndexOfSpritePaletteTag(PAL_TAG_SLASH);
}

/** SetPalOnOrCreateBlankSprite (title_screen.c). */
function SetPalOnOrCreateBlankSprite(hasCreatedBlankSprite: boolean): void {
  if (hasCreatedBlankSprite) {
    const palIdx = IndexOfSpritePaletteTag(PAL_TAG_SLASH);
    LoadPalette(incbin("gTitleScreen_Slash_Pal"), 256 + palIdx * 16, PLTT_SIZE_4BPP);
  } else {
    CreateBlankSprite();
  }
}

// sprite data for SpriteCallback_Slash
const sState = 0;
const sTimer = 1;
const sDeactivate = 2;

/** CreateSlashSprite (title_screen.c). */
function CreateSlashSprite(): number {
  const spriteId = CreateSprite(spriteTemplate("sSlashSpriteTemplate", "sOamData_SlashSprite", null), -32, 27, 1);
  if (spriteId !== MAX_SPRITES) {
    gSprites[spriteId].callback = SpriteCallback_Slash;
    gSprites[spriteId].data[sTimer] = 540;
  }
  return spriteId;
}

/** DeactivateSlashSprite (title_screen.c). */
function DeactivateSlashSprite(spriteId: number): void {
  if (spriteId !== MAX_SPRITES) gSprites[spriteId].data[sDeactivate] = 1;
}

/** IsSlashSpriteDeactivated (title_screen.c): TRUE while the sprite has not reached state 2. */
function IsSlashSpriteDeactivated(spriteId: number): boolean {
  if (spriteId !== MAX_SPRITES) return (gSprites[spriteId].data[sState] ^ 2) !== 0;
  return false;
}

/** SpriteCallback_Slash (title_screen.c). */
function SpriteCallback_Slash(sprite: Sprite): void {
  const data = sprite.data;
  switch (data[sState]) {
    case 0:
      if (data[sDeactivate]) {
        sprite.invisible = true;
        data[sState] = 2;
      }
      data[sTimer]--;
      if (data[sTimer] === 0) {
        sprite.invisible = false;
        data[sState] = 1;
      }
      break;
    case 1:
      sprite.x += 9;
      if (sprite.x === 67) sprite.y -= 7;
      if (sprite.x === 148) sprite.y += 7;
      if (sprite.x > DISPLAY_WIDTH + 32) {
        sprite.invisible = true;
        if (data[sDeactivate]) {
          data[sState] = 2;
        } else {
          sprite.x = -32;
          data[sTimer] = 540;
          data[sState] = 0;
        }
      }
      break;
    case 2:
      break;
  }
}

// ---------------------------------------------------------------- start-up driver

/** Frame driver for the start-up stage: main.c CallCallbacks followed by the VBlank interrupt. */
export class IntroTitle {
  done = false;

  static async preload(): Promise<void> {
    await Promise.all([preloadIncbin(symbols), loadCData("title_screen")]);
    helpSystem = await import("./helpSystem");
  }

  /** Where the title hands off when done: main menu, save-clear screen, or the intro again. */
  get exitTo(): "menu" | "clearsave" | "copyright" {
    return sExit ?? "menu";
  }

  /** Low 16 bits of the Timer1 read, used to seed the RNG. */
  get timer1Low(): number {
    return GetTimer1Low();
  }

  begin(): void {
    this.done = false;
    CB2_InitTitleScreen();
  }

  update(): void {
    if (this.done) return;
    gMain.callback2?.();
    if (sExit !== null && gMain.callback2 === null) {
      this.done = true;
      CopyBufferedValuesToGpuRegs();
      TransferPlttBuffer();
      return;
    }
    gMain.vblankCallback?.();
    CopyBufferedValuesToGpuRegs();
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.putImageData(ppu.renderFrame(), 0, 0);
  }
}
