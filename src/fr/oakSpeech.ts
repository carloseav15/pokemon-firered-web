// oak_speech.c: the new game scene — controls guide, Pikachu intro, Professor Oak's speech, gender
// choice, player / rival naming and the shrinking exit — on the GBA hardware layer (gMain + tasks).

import * as C from "./generated/constants";
import { DoNamingScreen, preloadNamingScreen } from "./namingScreen";
import { sound } from "./audio/sound";
import { tasks } from "./gba/tasks";
import { A_BUTTON, B_BUTTON, JOY_NEW } from "./gba/input";
import { decode, EOS, expandPlaceholders } from "./gba/charmap";
import { FONT_MALE, FONT_NORMAL } from "./gba/font";
import { getTextSpeedSetting, textFlags, TEXT_COLOR_DARK_GRAY, TEXT_COLOR_LIGHT_GRAY, TEXT_COLOR_WHITE } from "./gba/textPrinter";
import { cdata, hasCData, incbin, loadCData, preloadPacks } from "./hw/assets";
import { templateFrom, type CSpriteTemplate } from "./hw/cdataSprite";
import {
  BG_ATTR_WRAPAROUND, BG_COORD_SET, BG_COORD_SUB, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyRectToBgTilemapBufferRect, CopyToBgTilemapBuffer,
  CopyToBgTilemapBufferRect, FillBgTilemapBufferRect, FillBgTilemapBufferRect_Palette0, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags,
  SetBgAffine, SetBgAttribute, SetBgTilemapBuffer, ShowBg, type BgTemplate,
} from "./hw/bg";
import { ClearGpuRegBits, SetGpuReg, SetGpuRegBits } from "./hw/gpu";
import {
  ClearDialogWindowAndFrame, ClearStdWindowAndFrameToTransparent, ClearTopBarWindow, CreateTextCursorSprite, CreateTopBarWindowLoadPalette, CreateYesNoMenu,
  DestroyTextCursorSprite, DestroyTopBarWindow, DrawDialogueFrame, DrawStdFrameWithCustomTileAndPalette, FONTATTR_MAX_LETTER_HEIGHT, GetFontAttribute,
  GetStdWindowBaseTileNum, GetTextWindowPalette, InitStandardTextBoxWindows, InitTextBoxGfxAndPrinters, MENU_B_PRESSED, MENU_NOTHING_CHOSEN, Menu_InitCursor,
  Menu_LoadStdPalAt, Menu_ProcessInput, Menu_ProcessInputNoWrapAround, Menu_ProcessInputNoWrapClearOnChoose, TopBarWindowPrintString,
  TopBarWindowPrintTwoStrings,
} from "./hw/menu";
import {
  BeginNormalPaletteFade, BlendPalette, BlendPalettes, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, PALETTES_ALL, PALETTES_OBJECTS,
  ResetPaletteFade, RGB_BLACK, RGB_WHITE, TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import {
  DISPCNT_MODE_0, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, DISPCNT_WIN0_ON, ppu, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT,
  REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WIN1H, REG_OFFSET_WIN1V, REG_OFFSET_WININ, REG_OFFSET_WINOUT, BLDALPHA_BLEND, BLDCNT_EFFECT_BLEND,
  BLDCNT_TGT1_BG0, BLDCNT_TGT1_BG2, BLDCNT_TGT2_BG1, BLDCNT_TGT2_OBJ, WININ_WIN0_BG_ALL, WININ_WIN0_CLR, WININ_WIN0_OBJ, WINOUT_WIN01_BG_ALL, WINOUT_WIN01_OBJ,
} from "./hw/ppu";
import { gMain, renderHw, runHwFrame, SetHBlankCallback, SetMainCallback2, SetVBlankCallback } from "./hw/runtime";
import { ScanlineEffect_Stop } from "./hw/scanline";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, DestroySprite, FreeAllSpritePalettes, FreeSpritePaletteByTag, FreeSpriteTilesByTag, gSprites, LoadOam,
  LoadSpritePalette, LoadSpriteSheet, ProcessSpriteCopyRequests, ResetSpriteData, SpriteCallbackDummy, spriteState, ST_OAM_OBJ_BLEND, type Sprite,
  type SpriteTemplate,
} from "./hw/sprite";
import { AddTextPrinterParameterized, AddTextPrinterParameterized2, AddTextPrinterParameterized3, AddTextPrinterParameterized4, IsTextPrinterActive, RunTextPrinters } from "./hw/text";
import { AddWindow, ClearWindowTilemap, CopyWindowToVram, COPYWIN_FULL, FillWindowPixelBuffer, FreeAllWindowBuffers, PIXEL_FILL, PutWindowTilemap, RemoveWindow, type WindowTemplate } from "./hw/window";
import { random } from "./random";
import { Q_8_8_inv } from "./mathUtil";
import { rom } from "./rom";
import { gMonFrontPicTable, DecompressPicFromTable, symPalette } from "./pokemon/pics";
import { gMonSpritesGfxPtr } from "./battle/globals";
import { gMultiuseSpriteTemplate, SetMultiuseSpriteTemplateToPokemon } from "./battle/anim";
import { CreatePokeballSpriteToReleaseMon, CreateTradePokeballSprite } from "./battle/pokeball";
import { preloadBattleAssets } from "./battle/preload";

const INTRO_SPECIES = C.SPECIES_NIDORAN_F;
const MALE = 0;
const FEMALE = 1;

const WIN_INTRO_TEXTBOX = 0;
const WIN_INTRO_BOYGIRL = 1;
const WIN_INTRO_YESNO = 2;
const WIN_INTRO_NAMES = 3;

const CONTROLS_GUIDE_PAGE_1 = 0;
const CONTROLS_GUIDE_PAGE_2 = 1;
const CONTROLS_GUIDE_PAGE_3 = 2;
const NUM_CONTROLS_GUIDE_PAGES = 3;
const NUM_CONTROLS_GUIDE_PAGE_1_WINDOWS = 1;
const NUM_CONTROLS_GUIDE_PAGES_2_3_WINDOWS = 3;

const PIKACHU_INTRO_PAGE_1 = 0;
const NUM_PIKACHU_INTRO_PAGES = 3;

const GFX_TAG_PLATFORM = 0x1000;
const GFX_TAG_PIKACHU = 0x1001;
const GFX_TAG_PIKACHU_EARS = 0x1002;
const GFX_TAG_PIKACHU_EYES = 0x1003;
const PAL_TAG_PLATFORM = 0x1000;
const PAL_TAG_PIKACHU = 0x1001;

const SPRITE_TYPE_PIKACHU = 0;
const SPRITE_TYPE_PLATFORM = 1;
const NUM_PIKACHU_PLATFORM_SPRITES = 3;

const MALE_PLAYER_PIC = 0;
const FEMALE_PLAYER_PIC = 1;
const RIVAL_PIC = 2;
const OAK_PIC = 3;

// Task data
const tSpriteTimer = 0;
const tTrainerPicPosX = 1;
const tTrainerPicFadeState = 2;
const tTimer = 3;
const tNidoranFSpriteId = 4;
const tTextCursorSpriteId = 5;
const tPokeBallSpriteId = 6;
const tPikachuPlatformSpriteId = (i: number) => 7 + i;
const tMenuWindowId = 13;
const tTextboxWindowId = 14;
const tDelta = 15;
const tBlendTarget = 15;
const tNameNotConfirmed = 15;

const oak = (name: string) => cdata<unknown>("oak_speech", name);
/** A string from the C string data (strings.c / oak_speech.c) or the assembled text blob. */
function text(label: string): Uint8Array {
  for (const file of ["strings", "oak_speech"]) if (hasCData(file, label)) return Uint8Array.from(cdata<number[]>(file, label));
  return rom.text(label);
}
const s16 = (v: number) => (v << 16) >> 16;

/** sOakSpeechResources */
const res = {
  hasPlayerBeenNamed: false,
  currentPage: 0,
  windowIds: [0, 0, 0, 0],
  textColor: [0, 0, 0],
  textSpeed: 0,
  bg2TilemapBuffer: new Uint16Array(0x200),
  bg1TilemapBuffer: new Uint16Array(0x400),
};

/** gSaveBlock2Ptr / gSaveBlock1Ptr fields the scene writes. */
export const newGameProfile = { playerGender: MALE, playerName: [EOS] as number[], rivalName: [EOS] as number[] };

// ---------------------------------------------------------------- callbacks

function VBlankCB_NewGameScene(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function CB2_NewGameScene(): void {
  tasks.run();
  RunTextPrinters();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

let finished = false;

/** CB2_NewGame: the scene is over, the game starts. */
function CB2_NewGame(): void {
  finished = true;
  SetMainCallback2(null);
}

export class OakSpeech {
  static preload(): Promise<unknown> {
    return Promise.all([
      rom.load(),
      preloadNamingScreen(),
      loadCData("oak_speech", "strings", "text_window_graphics", "menu"),
      preloadPacks(["graphics_oak_speech", "graphics_text_window", "graphics_fonts", "graphics_interface", "pokemon"]),
      preloadBattleAssets(),
    ]);
  }

  get done(): boolean {
    return finished;
  }

  get result(): { playerName: string; gender: number; rivalName: string } {
    return { playerName: decode(newGameProfile.playerName), gender: newGameProfile.playerGender, rivalName: decode(newGameProfile.rivalName) };
  }

  StartNewGameScene(): void {
    finished = false;
    gPlttBufferUnfaded[0] = RGB_BLACK;
    gPlttBufferFaded[0] = RGB_BLACK;
    tasks.reset();
    gMain.state = 0;
    tasks.create(Task_NewGameScene, 0);
    SetMainCallback2(CB2_NewGameScene);
  }

  update(): void {
    runHwFrame();
  }

  render(ctx: CanvasRenderingContext2D): void {
    renderHw(ctx);
  }
}

function Task_NewGameScene(taskId: number): void {
  const t = tasks.tasks[taskId];
  switch (gMain.state) {
    case 0:
      SetVBlankCallback(null);
      SetHBlankCallback(null);
      ppu.vram.fill(0);
      ppu.oam.fill(0);
      ppu.pltt.fill(0, 1);
      ResetPaletteFade();
      ScanlineEffect_Stop();
      ResetSpriteData();
      FreeAllSpritePalettes();
      break;
    case 1:
      // AllocZeroed(sOakSpeechResources) + CreateMonSpritesGfxManager
      res.hasPlayerBeenNamed = false;
      res.currentPage = 0;
      res.windowIds.fill(0);
      res.bg1TilemapBuffer.fill(0);
      res.bg2TilemapBuffer.fill(0);
      break;
    case 2:
      for (const reg of [REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WIN1H, REG_OFFSET_WIN1V, REG_OFFSET_WININ, REG_OFFSET_WINOUT, REG_OFFSET_BLDCNT, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDY]) SetGpuReg(reg, 0);
      break;
    case 3:
      resetBgs();
      break;
    case 4:
      gPaletteFade.bufferTransferDisabled = true;
      InitStandardTextBoxWindows();
      InitTextBoxGfxAndPrinters();
      Menu_LoadStdPalAt(13 * 16);
      LoadPalette(incbin("sOakSpeech_Background_Pals"), 0, incbin("sOakSpeech_Background_Pals").length);
      LoadPalette(GetTextWindowPalette(2).subarray(30, 32), 0, 2);
      break;
    case 5:
      res.textSpeed = getTextSpeedSetting();
      textFlags.canABSpeedUpPrint = true;
      LoadBgTiles(1, incbin("sControlsGuide_PikachuIntro_Background_Tiles"), incbin("sControlsGuide_PikachuIntro_Background_Tiles").length, 0);
      break;
    case 6:
      ClearDialogWindowAndFrame(WIN_INTRO_TEXTBOX, true);
      FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 32, 32);
      CopyBgTilemapBufferToVram(1);
      break;
    case 7:
      CreateTopBarWindowLoadPalette(0, 30, 0, 13, 0x1c4);
      FillBgTilemapBufferRect_Palette0(1, 0xd00f, 0, 0, 30, 2);
      FillBgTilemapBufferRect_Palette0(1, 0xd002, 0, 2, 30, 1);
      FillBgTilemapBufferRect_Palette0(1, 0xd00e, 0, 19, 30, 1);
      ControlsGuide_LoadPage1();
      gPaletteFade.bufferTransferDisabled = false;
      t.data[tTextCursorSpriteId] = CreateTextCursorSprite(0, 230, 149, 0, 0);
      BlendPalettes(PALETTES_ALL, 16, RGB_BLACK);
      break;
    case 10:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
      ShowBg(0);
      ShowBg(1);
      SetVBlankCallback(VBlankCB_NewGameScene);
      sound.playBGM(C.MUS_NEW_GAME_INSTRUCT);
      t.func = Task_ControlsGuide_HandleInput;
      gMain.state = 0;
      return;
  }
  gMain.state++;
}

function resetBgs(): void {
  ResetBgsAndClearDma3BusyFlags(0);
  InitBgsFromTemplates(1, oak("sBgTemplates") as BgTemplate[]);
  SetBgTilemapBuffer(1, res.bg1TilemapBuffer);
  SetBgTilemapBuffer(2, res.bg2TilemapBuffer);
  ChangeBgX(1, 0, BG_COORD_SET);
  ChangeBgY(1, 0, BG_COORD_SET);
  ChangeBgX(2, 0, BG_COORD_SET);
  ChangeBgY(2, 0, BG_COORD_SET);
  spriteState.gSpriteCoordOffsetX = 0;
  spriteState.gSpriteCoordOffsetY = 0;
}

// ---------------------------------------------------------------- controls guide

const controlsGuideWindows = (page: number) => (oak(["sControlsGuide_WindowTemplate_Page1", "sControlsGuide_WindowTemplate_Page2", "sControlsGuide_WindowTemplate_Page3"][page]) as WindowTemplate[]);
const sTextColor_White = () => oak("sTextColor_White") as number[];
const sTextColor_DarkGray = () => oak("sTextColor_DarkGray") as number[];
const symText = (ref: unknown) => text((ref as { $sym: string }).$sym);

function ControlsGuide_LoadPage1(): void {
  TopBarWindowPrintTwoStrings(text("gText_Controls"), text("gText_ABUTTONNext"), false, 0, true);
  res.windowIds[0] = AddWindow(controlsGuideWindows(res.currentPage)[0]);
  PutWindowTilemap(res.windowIds[0]);
  FillWindowPixelBuffer(res.windowIds[0], PIXEL_FILL(0));
  AddTextPrinterParameterized4(res.windowIds[0], FONT_NORMAL, 2, 0, 1, 1, sTextColor_White(), 0, text("gControlsGuide_Text_Intro"));
  CopyWindowToVram(res.windowIds[0], COPYWIN_FULL);
  FillBgTilemapBufferRect_Palette0(1, 0x3000, 1, 3, 5, 16);
  CopyBgTilemapBufferToVram(1);
}

function Task_ControlsGuide_LoadPage(taskId: number): void {
  const page2Or3 = res.currentPage - 1;
  if (res.currentPage === CONTROLS_GUIDE_PAGE_1) {
    ControlsGuide_LoadPage1();
  } else {
    TopBarWindowPrintString(text("gText_ABUTTONNext_BBUTTONBack"), 0, true);
    const strings = oak("sControlsGuide_Pages2And3_Strings") as unknown[];
    for (let w = 0; w < NUM_CONTROLS_GUIDE_PAGES_2_3_WINDOWS; w++) {
      res.windowIds[w] = AddWindow(controlsGuideWindows(res.currentPage)[w]);
      PutWindowTilemap(res.windowIds[w]);
      FillWindowPixelBuffer(res.windowIds[w], PIXEL_FILL(0));
      AddTextPrinterParameterized4(res.windowIds[w], FONT_NORMAL, 6, 0, 1, 1, sTextColor_White(), 0, symText(strings[w + page2Or3 * 3]));
      CopyWindowToVram(res.windowIds[w], COPYWIN_FULL);
    }
    const tilemap = incbin(res.currentPage === CONTROLS_GUIDE_PAGE_2 ? "sControlsGuide_Tilemap_Page2" : "sControlsGuide_Tilemap_Page3");
    CopyToBgTilemapBufferRect(1, new Uint16Array(tilemap.buffer.slice(tilemap.byteOffset, tilemap.byteOffset + tilemap.length)), 1, 3, 5, 16);
    CopyBgTilemapBufferToVram(1);
  }
  BeginNormalPaletteFade((PALETTES_OBJECTS | 0xdfff) >>> 0, -1, 16, 0, textWindowPal2Color15());
  tasks.tasks[taskId].func = Task_ControlsGuide_HandleInput;
}

function textWindowPal2Color15(): number {
  const p = GetTextWindowPalette(2);
  return p[30] | (p[31] << 8);
}

function Task_ControlsGuide_HandleInput(taskId: number): void {
  if (gPaletteFade.active || !JOY_NEW(A_BUTTON | B_BUTTON)) return;
  const t = tasks.tasks[taskId];
  if (JOY_NEW(A_BUTTON)) {
    t.data[tDelta] = 1;
    if (res.currentPage < CONTROLS_GUIDE_PAGE_3) BeginNormalPaletteFade((PALETTES_OBJECTS | 0xdfff) >>> 0, -1, 0, 16, textWindowPal2Color15());
  } else {
    if (res.currentPage === CONTROLS_GUIDE_PAGE_1) return;
    t.data[tDelta] = -1;
    BeginNormalPaletteFade((PALETTES_OBJECTS | 0xdfff) >>> 0, -1, 0, 16, textWindowPal2Color15());
  }
  sound.playSE(C.SE_SELECT);
  t.func = Task_ControlsGuide_ChangePage;
}

function Task_ControlsGuide_ChangePage(taskId: number): void {
  if (gPaletteFade.active) return;
  const t = tasks.tasks[taskId];
  const numWindows = res.currentPage === CONTROLS_GUIDE_PAGE_1 ? NUM_CONTROLS_GUIDE_PAGE_1_WINDOWS : NUM_CONTROLS_GUIDE_PAGES_2_3_WINDOWS;
  res.currentPage = (res.currentPage + t.data[tDelta]) & 0xffff;
  if (res.currentPage < NUM_CONTROLS_GUIDE_PAGES) {
    for (let i = 0; i < numWindows; i++) {
      FillWindowPixelBuffer(res.windowIds[i], PIXEL_FILL(0));
      ClearWindowTilemap(res.windowIds[i]);
      CopyWindowToVram(res.windowIds[i], COPYWIN_FULL);
      RemoveWindow(res.windowIds[i]);
      res.windowIds[i] = 0;
    }
    t.func = Task_ControlsGuide_LoadPage;
  } else {
    BeginNormalPaletteFade(PALETTES_ALL, 2, 0, 16, 0);
    t.func = Task_ControlsGuide_Clear;
  }
}

function Task_ControlsGuide_Clear(taskId: number): void {
  if (gPaletteFade.active) return;
  const t = tasks.tasks[taskId];
  for (let i = 0; i < NUM_CONTROLS_GUIDE_PAGES_2_3_WINDOWS; i++) {
    FillWindowPixelBuffer(res.windowIds[i], PIXEL_FILL(0));
    ClearWindowTilemap(res.windowIds[i]);
    CopyWindowToVram(res.windowIds[i], COPYWIN_FULL);
    RemoveWindow(res.windowIds[i]);
    res.windowIds[i] = 0;
  }
  FillBgTilemapBufferRect_Palette0(1, 0, 0, 2, 30, 18);
  CopyBgTilemapBufferToVram(1);
  DestroyTextCursorSprite(t.data[tTextCursorSpriteId]);
  res.windowIds[0] = RGB_BLACK;
  LoadPalette([RGB_BLACK], 0, 2);
  t.data[tTimer] = 32;
  t.func = Task_PikachuIntro_LoadPage1;
}

// ---------------------------------------------------------------- Pikachu intro

const PIKACHU_INTRO_SET_GPU_REGS = 0;
const PIKACHU_INTRO_HANDLE_INPUT = 1;
const PIKACHU_INTRO_PRINT_PAGE_TEXT = 2;
const PIKACHU_INTRO_FADE_IN_PAGE = 3;
const PIKACHU_INTRO_EXIT = 4;

const introWindows = () => oak("sIntro_WindowTemplates") as WindowTemplate[];
const pikachuString = (page: number) => symText((oak("sPikachuIntro_Strings") as unknown[])[page]);

function Task_PikachuIntro_LoadPage1(taskId: number): void {
  const t = tasks.tasks[taskId];
  const d = t.data;
  if (d[tTimer] !== 0) {
    d[tTimer]--;
    return;
  }
  sound.playBGM(C.MUS_NEW_GAME_INTRO);
  ClearTopBarWindow();
  TopBarWindowPrintString(text("gText_ABUTTONNext"), 0, true);
  const tm = incbin("sPikachuIntro_Background_Tilemap");
  CopyToBgTilemapBufferRect(1, new Uint16Array(tm.buffer.slice(tm.byteOffset, tm.byteOffset + tm.length)), 0, 2, 30, 19);
  CopyBgTilemapBufferToVram(1);
  d[tTextboxWindowId] = AddWindow(introWindows()[WIN_INTRO_TEXTBOX]);
  PutWindowTilemap(d[tTextboxWindowId]);
  FillWindowPixelBuffer(d[tTextboxWindowId], PIXEL_FILL(0));
  CopyWindowToVram(d[tTextboxWindowId], COPYWIN_FULL);
  res.currentPage = PIKACHU_INTRO_PAGE_1;
  gMain.state = PIKACHU_INTRO_SET_GPU_REGS;
  d[tBlendTarget] = 16;
  AddTextPrinterParameterized4(d[tTextboxWindowId], FONT_NORMAL, 3, 5, 1, 0, sTextColor_DarkGray(), 0, pikachuString(PIKACHU_INTRO_PAGE_1));
  d[tTextCursorSpriteId] = CreateTextCursorSprite(0, 226, 145, 0, 0);
  gSprites[d[tTextCursorSpriteId]].oam.objMode = ST_OAM_OBJ_BLEND;
  gSprites[d[tTextCursorSpriteId]].oam.priority = 0;
  CreatePikachuOrPlatformSprites(taskId, SPRITE_TYPE_PIKACHU);
  BeginNormalPaletteFade(PALETTES_ALL, 2, 16, 0, 0);
  t.func = Task_PikachuIntro_HandleInput;
}

function Task_PikachuIntro_HandleInput(taskId: number): void {
  const t = tasks.tasks[taskId];
  const d = t.data;
  switch (gMain.state) {
    case PIKACHU_INTRO_SET_GPU_REGS:
      if (!gPaletteFade.active) {
        SetGpuReg(REG_OFFSET_WIN0H, 240);
        SetGpuReg(REG_OFFSET_WIN0V, (16 << 8) | 160);
        SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_BG_ALL | WININ_WIN0_CLR | WININ_WIN0_OBJ);
        SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG_ALL | WINOUT_WIN01_OBJ);
        SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
        gMain.state = PIKACHU_INTRO_HANDLE_INPUT;
      }
      break;
    case PIKACHU_INTRO_HANDLE_INPUT:
      if (JOY_NEW(A_BUTTON | B_BUTTON)) {
        if (JOY_NEW(A_BUTTON)) {
          res.currentPage++;
        } else if (res.currentPage !== PIKACHU_INTRO_PAGE_1) {
          res.currentPage--;
        } else {
          break;
        }
        sound.playSE(C.SE_SELECT);
        if (res.currentPage === NUM_PIKACHU_INTRO_PAGES) {
          gMain.state = PIKACHU_INTRO_EXIT;
        } else {
          SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG0 | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_BG1);
          SetGpuReg(REG_OFFSET_BLDALPHA, (16 - d[tBlendTarget]) | d[tBlendTarget]);
          gMain.state++;
        }
      }
      break;
    case PIKACHU_INTRO_PRINT_PAGE_TEXT:
      d[tBlendTarget] -= 2;
      SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[tBlendTarget], 16 - d[tBlendTarget]));
      if (d[tBlendTarget] <= 0) {
        FillWindowPixelBuffer(d[tTextboxWindowId], PIXEL_FILL(0));
        AddTextPrinterParameterized4(d[tTextboxWindowId], FONT_NORMAL, 3, 5, 1, 0, sTextColor_DarkGray(), 0, pikachuString(res.currentPage));
        ClearTopBarWindow();
        TopBarWindowPrintString(text(res.currentPage === PIKACHU_INTRO_PAGE_1 ? "gText_ABUTTONNext" : "gText_ABUTTONNext_BBUTTONBack"), 0, true);
        gMain.state++;
      }
      break;
    case PIKACHU_INTRO_FADE_IN_PAGE:
      d[tBlendTarget] += 2;
      SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(d[tBlendTarget], 16 - d[tBlendTarget]));
      if (d[tBlendTarget] >= 16) {
        d[tBlendTarget] = 16;
        SetGpuReg(REG_OFFSET_BLDCNT, 0);
        SetGpuReg(REG_OFFSET_BLDALPHA, 0);
        gMain.state = PIKACHU_INTRO_HANDLE_INPUT;
      }
      break;
    case PIKACHU_INTRO_EXIT:
      DestroyTextCursorSprite(d[tTextCursorSpriteId]);
      sound.playBGM(C.MUS_NEW_GAME_EXIT);
      d[tBlendTarget] = 24;
      gMain.state++;
      break;
    default:
      if (d[tBlendTarget] !== 0) {
        d[tBlendTarget]--;
      } else {
        gMain.state = 0;
        res.currentPage = 0;
        SetGpuReg(REG_OFFSET_WIN0H, 0);
        SetGpuReg(REG_OFFSET_WIN0V, 0);
        SetGpuReg(REG_OFFSET_WININ, 0);
        SetGpuReg(REG_OFFSET_WINOUT, 0);
        ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
        BeginNormalPaletteFade(PALETTES_ALL, 2, 0, 16, RGB_BLACK);
        t.func = Task_PikachuIntro_Clear;
      }
      break;
  }
}

function Task_PikachuIntro_Clear(taskId: number): void {
  if (gPaletteFade.active) return;
  const t = tasks.tasks[taskId];
  DestroyTopBarWindow();
  FillWindowPixelBuffer(t.data[tTextboxWindowId], PIXEL_FILL(0));
  ClearWindowTilemap(t.data[tTextboxWindowId]);
  CopyWindowToVram(t.data[tTextboxWindowId], COPYWIN_FULL);
  RemoveWindow(t.data[tTextboxWindowId]);
  t.data[tTextboxWindowId] = 0;
  FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 30, 20);
  CopyBgTilemapBufferToVram(1);
  DestroyPikachuOrPlatformSprites(taskId, SPRITE_TYPE_PIKACHU);
  t.data[tTimer] = 80;
  t.func = Task_OakSpeech_Init;
}

// ---------------------------------------------------------------- Oak speech

function loadOakBackground(): void {
  const tiles = incbin("sOakSpeech_Background_Tiles");
  LoadBgTiles(1, tiles, tiles.length, 0);
  CopyToBgTilemapBuffer(1, incbin("sOakSpeech_Background_Tilemap"), 0, 0);
  CopyBgTilemapBufferToVram(1);
}

function Task_OakSpeech_Init(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (t.data[tTimer] !== 0) {
    t.data[tTimer]--;
    return;
  }
  loadOakBackground();
  CreateNidoranFSprite(taskId);
  LoadTrainerPic(OAK_PIC, 0);
  CreatePikachuOrPlatformSprites(taskId, SPRITE_TYPE_PLATFORM);
  sound.playBGM(C.MUS_ROUTE24);
  BeginNormalPaletteFade(PALETTES_ALL, 5, 16, 0, RGB_BLACK);
  t.data[tTimer] = 80;
  ShowBg(2);
  t.func = Task_OakSpeech_WelcomeToTheWorld;
}

function OakSpeechPrintMessage(str: ArrayLike<number>, speed: number): void {
  DrawDialogueFrame(WIN_INTRO_TEXTBOX, false);
  AddTextPrinterParameterized2(WIN_INTRO_TEXTBOX, FONT_MALE, expandPlaceholders(str), speed, null, TEXT_COLOR_DARK_GRAY, TEXT_COLOR_WHITE, TEXT_COLOR_LIGHT_GRAY);
  CopyWindowToVram(WIN_INTRO_TEXTBOX, COPYWIN_FULL);
}

function Task_OakSpeech_WelcomeToTheWorld(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (gPaletteFade.active) return;
  if (t.data[tTimer] !== 0) {
    t.data[tTimer]--;
  } else {
    OakSpeechPrintMessage(text("gOakSpeech_Text_WelcomeToTheWorld"), res.textSpeed);
    t.func = Task_OakSpeech_ThisWorld;
  }
}

function Task_OakSpeech_ThisWorld(taskId: number): void {
  if (IsTextPrinterActive(WIN_INTRO_TEXTBOX)) return;
  OakSpeechPrintMessage(text("gOakSpeech_Text_ThisWorld"), res.textSpeed);
  tasks.tasks[taskId].data[tTimer] = 30;
  tasks.tasks[taskId].func = Task_OakSpeech_ReleaseNidoranFFromPokeBall;
}

function Task_OakSpeech_ReleaseNidoranFFromPokeBall(taskId: number): void {
  if (IsTextPrinterActive(WIN_INTRO_TEXTBOX)) return;
  const t = tasks.tasks[taskId];
  if (t.data[tTimer] !== 0) t.data[tTimer]--;
  const spriteId = t.data[tNidoranFSpriteId];
  gSprites[spriteId].invisible = false;
  gSprites[spriteId].data[tSpriteTimer] = 0;
  CreatePokeballSpriteToReleaseMon(spriteId, gSprites[spriteId].oam.paletteNum, 100, 66, 0, 0, 32, 0xffff1fff);
  t.func = Task_OakSpeech_IsInhabitedFarAndWide;
  t.data[tTimer] = 0;
}

function Task_OakSpeech_IsInhabitedFarAndWide(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (sound.isCryFinished() && t.data[tTimer] >= 96) t.func = Task_OakSpeech_IStudyPokemon;
  if (t.data[tTimer] < 0x4000) {
    t.data[tTimer]++;
    if (t.data[tTimer] === 32) {
      OakSpeechPrintMessage(text("gOakSpeech_Text_IsInhabitedFarAndWide"), res.textSpeed);
      sound.PlayCry_Normal(INTRO_SPECIES, 0);
    }
  }
}

function Task_OakSpeech_IStudyPokemon(taskId: number): void {
  if (IsTextPrinterActive(WIN_INTRO_TEXTBOX)) return;
  OakSpeechPrintMessage(text("gOakSpeech_Text_IStudyPokemon"), res.textSpeed);
  tasks.tasks[taskId].func = Task_OakSpeech_ReturnNidoranFToPokeBall;
}

function Task_OakSpeech_ReturnNidoranFToPokeBall(taskId: number): void {
  if (IsTextPrinterActive(WIN_INTRO_TEXTBOX)) return;
  const t = tasks.tasks[taskId];
  ClearDialogWindowAndFrame(WIN_INTRO_TEXTBOX, true);
  const spriteId = t.data[tNidoranFSpriteId];
  t.data[tPokeBallSpriteId] = CreateTradePokeballSprite(spriteId, gSprites[spriteId].oam.paletteNum, 100, 66, 0, 0, 32, 0xffff1f3f);
  t.data[tTimer] = 48;
  t.data[tSpriteTimer] = 64;
  t.func = Task_OakSpeech_TellMeALittleAboutYourself;
}

function Task_OakSpeech_TellMeALittleAboutYourself(taskId: number): void {
  const t = tasks.tasks[taskId];
  const d = t.data;
  if (d[tSpriteTimer] !== 0) {
    if (d[tSpriteTimer] < 24) gSprites[d[tNidoranFSpriteId]].y--;
    d[tSpriteTimer]--;
    return;
  }
  if (d[tTimer] === 48) {
    DestroySprite(gSprites[d[tNidoranFSpriteId]]);
    DestroySprite(gSprites[d[tPokeBallSpriteId]]);
  }
  if (d[tTimer] !== 0) {
    d[tTimer]--;
  } else {
    OakSpeechPrintMessage(text("gOakSpeech_Text_TellMeALittleAboutYourself"), res.textSpeed);
    t.func = Task_OakSpeech_FadeOutOak;
  }
}

function Task_OakSpeech_FadeOutOak(taskId: number): void {
  if (IsTextPrinterActive(WIN_INTRO_TEXTBOX)) return;
  ClearDialogWindowAndFrame(WIN_INTRO_TEXTBOX, true);
  CreateFadeInTask(taskId, 2);
  tasks.tasks[taskId].data[tTimer] = 48;
  tasks.tasks[taskId].func = Task_OakSpeech_AskPlayerGender;
}

function Task_OakSpeech_AskPlayerGender(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (t.data[tTrainerPicFadeState] === 0) return;
  if (t.data[tTimer] !== 0) {
    t.data[tTimer]--;
  } else {
    t.data[tTrainerPicPosX] = -60;
    ClearTrainerPic();
    OakSpeechPrintMessage(text("gOakSpeech_Text_AskPlayerGender"), res.textSpeed);
    t.func = Task_OakSpeech_ShowGenderOptions;
  }
}

function Task_OakSpeech_ShowGenderOptions(taskId: number): void {
  if (IsTextPrinterActive(WIN_INTRO_TEXTBOX)) return;
  const t = tasks.tasks[taskId];
  t.data[tMenuWindowId] = AddWindow(introWindows()[WIN_INTRO_BOYGIRL]);
  const w = t.data[tMenuWindowId];
  PutWindowTilemap(w);
  DrawStdFrameWithCustomTileAndPalette(w, true, GetStdWindowBaseTileNum(), 14);
  FillWindowPixelBuffer(w, PIXEL_FILL(1));
  res.textColor = [1, 2, 3];
  AddTextPrinterParameterized3(w, FONT_NORMAL, 8, 1, res.textColor, 0, text("gText_Boy"));
  AddTextPrinterParameterized3(w, FONT_NORMAL, 8, 17, res.textColor, 0, text("gText_Girl"));
  Menu_InitCursor(w, FONT_NORMAL, 0, 1, GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT) + 2, 2, 0);
  CopyWindowToVram(w, COPYWIN_FULL);
  t.func = Task_OakSpeech_HandleGenderInput;
}

function Task_OakSpeech_HandleGenderInput(taskId: number): void {
  switch (Menu_ProcessInputNoWrapAround()) {
    case 0: newGameProfile.playerGender = MALE; break;
    case 1: newGameProfile.playerGender = FEMALE; break;
    case MENU_B_PRESSED:
    case MENU_NOTHING_CHOSEN:
      return;
  }
  tasks.tasks[taskId].func = Task_OakSpeech_ClearGenderWindows;
}

function Task_OakSpeech_ClearGenderWindows(taskId: number): void {
  const t = tasks.tasks[taskId];
  ClearStdWindowAndFrameToTransparent(t.data[tMenuWindowId], true);
  RemoveWindow(t.data[tMenuWindowId]);
  t.data[tMenuWindowId] = WIN_INTRO_TEXTBOX;
  ClearDialogWindowAndFrame(t.data[tMenuWindowId], true);
  FillBgTilemapBufferRect_Palette0(0, 0, 0, 0, 30, 20);
  CopyBgTilemapBufferToVram(0);
  t.func = Task_OakSpeech_LoadPlayerPic;
}

function Task_OakSpeech_LoadPlayerPic(taskId: number): void {
  LoadTrainerPic(newGameProfile.playerGender === MALE ? MALE_PLAYER_PIC : FEMALE_PLAYER_PIC, 0);
  CreateFadeOutTask(taskId, 2);
  tasks.tasks[taskId].data[tTimer] = 32;
  tasks.tasks[taskId].func = Task_OakSpeech_YourNameWhatIsIt;
}

function Task_OakSpeech_YourNameWhatIsIt(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (t.data[tTrainerPicFadeState] === 0) return;
  if (t.data[tTimer] !== 0) {
    t.data[tTimer]--;
  } else {
    t.data[tTrainerPicPosX] = 0;
    OakSpeechPrintMessage(text("gOakSpeech_Text_YourNameWhatIsIt"), res.textSpeed);
    t.func = Task_OakSpeech_FadeOutForPlayerNamingScreen;
  }
}

function Task_OakSpeech_FadeOutForPlayerNamingScreen(taskId: number): void {
  if (IsTextPrinterActive(WIN_INTRO_TEXTBOX)) return;
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
  res.hasPlayerBeenNamed = false;
  tasks.tasks[taskId].func = Task_OakSpeech_DoNamingScreen;
}

function Task_OakSpeech_MoveRivalDisplayNameOptions(taskId: number): void {
  if (IsTextPrinterActive(WIN_INTRO_TEXTBOX)) return;
  const t = tasks.tasks[taskId];
  if (t.data[tTrainerPicPosX] > -60) {
    t.data[tTrainerPicPosX] -= 2;
    spriteState.gSpriteCoordOffsetX += 2;
    ChangeBgX(2, 0x200, BG_COORD_SUB);
  } else {
    t.data[tTrainerPicPosX] = -60;
    PrintNameChoiceOptions(taskId, res.hasPlayerBeenNamed);
    t.func = Task_OakSpeech_HandleRivalNameInput;
  }
}

function Task_OakSpeech_RepeatNameQuestion(taskId: number): void {
  PrintNameChoiceOptions(taskId, res.hasPlayerBeenNamed);
  OakSpeechPrintMessage(text(res.hasPlayerBeenNamed ? "gOakSpeech_Text_YourRivalsNameWhatWasIt" : "gOakSpeech_Text_YourNameWhatIsIt"), 0);
  tasks.tasks[taskId].func = Task_OakSpeech_HandleRivalNameInput;
}

function Task_OakSpeech_HandleRivalNameInput(taskId: number): void {
  const t = tasks.tasks[taskId];
  const input = Menu_ProcessInput();
  switch (input) {
    case 0:
      sound.playSE(C.SE_SELECT);
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      t.func = Task_OakSpeech_DoNamingScreen;
      break;
    case 1:
    case 2:
    case 3:
    case 4:
      sound.playSE(C.SE_SELECT);
      ClearStdWindowAndFrameToTransparent(t.data[tMenuWindowId], true);
      RemoveWindow(t.data[tMenuWindowId]);
      GetDefaultName(res.hasPlayerBeenNamed, input - 1);
      t.data[tNameNotConfirmed] = 1;
      t.func = Task_OakSpeech_ConfirmName;
      break;
  }
}

function Task_OakSpeech_DoNamingScreen(taskId: number): void {
  if (gPaletteFade.active) return;
  const t = tasks.tasks[taskId];
  GetDefaultName(res.hasPlayerBeenNamed, 0);
  if (!res.hasPlayerBeenNamed) {
    DoNamingScreen(C.NAMING_SCREEN_PLAYER, newGameProfile.playerName, 0, newGameProfile.playerGender, 0, CB2_ReturnFromNamingScreen);
  } else {
    ClearStdWindowAndFrameToTransparent(t.data[tMenuWindowId], true);
    RemoveWindow(t.data[tMenuWindowId]);
    DoNamingScreen(C.NAMING_SCREEN_RIVAL, newGameProfile.rivalName, 0, 0, 0, CB2_ReturnFromNamingScreen);
  }
  DestroyPikachuOrPlatformSprites(taskId, SPRITE_TYPE_PLATFORM);
  FreeAllWindowBuffers();
  // The naming screen takes over (it resets the task list); this task ends with the scene.
  tasks.destroy(taskId);
}

function Task_OakSpeech_ConfirmName(taskId: number): void {
  if (gPaletteFade.active) return;
  const t = tasks.tasks[taskId];
  if (t.data[tNameNotConfirmed] === 1) {
    OakSpeechPrintMessage(text(res.hasPlayerBeenNamed ? "gOakSpeech_Text_ConfirmRivalName" : "gOakSpeech_Text_SoYourNameIsPlayer"), res.textSpeed);
    t.data[tNameNotConfirmed] = 0;
    t.data[tTimer] = 25;
  } else if (!IsTextPrinterActive(WIN_INTRO_TEXTBOX)) {
    if (t.data[tTimer] !== 0) {
      t.data[tTimer]--;
    } else {
      CreateYesNoMenu(introWindows()[WIN_INTRO_YESNO], FONT_NORMAL, 0, 2, GetStdWindowBaseTileNum(), 14, 0);
      t.func = Task_OakSpeech_HandleConfirmNameInput;
    }
  }
}

function Task_OakSpeech_HandleConfirmNameInput(taskId: number): void {
  const t = tasks.tasks[taskId];
  switch (Menu_ProcessInputNoWrapClearOnChoose()) {
    case 0:
      sound.playSE(C.SE_SELECT);
      t.data[tTimer] = 40;
      if (!res.hasPlayerBeenNamed) {
        ClearDialogWindowAndFrame(WIN_INTRO_TEXTBOX, true);
        CreateFadeInTask(taskId, 2);
        t.func = Task_OakSpeech_FadeOutPlayerPic;
      } else {
        OakSpeechPrintMessage(text("gOakSpeech_Text_RememberRivalsName"), res.textSpeed);
        t.func = Task_OakSpeech_FadeOutRivalPic;
      }
      break;
    case 1:
    case MENU_B_PRESSED:
      sound.playSE(C.SE_SELECT);
      t.func = res.hasPlayerBeenNamed ? Task_OakSpeech_RepeatNameQuestion : Task_OakSpeech_FadeOutForPlayerNamingScreen;
      break;
  }
}

function Task_OakSpeech_FadeOutPlayerPic(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (t.data[tTrainerPicFadeState] === 0) return;
  ClearTrainerPic();
  if (t.data[tTimer] !== 0) t.data[tTimer]--;
  else t.func = Task_OakSpeech_FadeInRivalPic;
}

function Task_OakSpeech_FadeOutRivalPic(taskId: number): void {
  if (IsTextPrinterActive(WIN_INTRO_TEXTBOX)) return;
  ClearDialogWindowAndFrame(WIN_INTRO_TEXTBOX, true);
  CreateFadeInTask(taskId, 2);
  tasks.tasks[taskId].func = Task_OakSpeech_ReshowPlayersPic;
}

function Task_OakSpeech_FadeInRivalPic(taskId: number): void {
  ChangeBgX(2, 0, BG_COORD_SET);
  tasks.tasks[taskId].data[tTrainerPicPosX] = 0;
  spriteState.gSpriteCoordOffsetX = 0;
  LoadTrainerPic(RIVAL_PIC, 0);
  CreateFadeOutTask(taskId, 2);
  tasks.tasks[taskId].func = Task_OakSpeech_AskRivalsName;
}

function Task_OakSpeech_AskRivalsName(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (t.data[tTrainerPicFadeState] === 0) return;
  OakSpeechPrintMessage(text("gOakSpeech_Text_WhatWasHisName"), res.textSpeed);
  res.hasPlayerBeenNamed = true;
  t.func = Task_OakSpeech_MoveRivalDisplayNameOptions;
}

function Task_OakSpeech_ReshowPlayersPic(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (t.data[tTrainerPicFadeState] === 0) return;
  ClearTrainerPic();
  if (t.data[tTimer] !== 0) {
    t.data[tTimer]--;
  } else {
    LoadTrainerPic(newGameProfile.playerGender === MALE ? MALE_PLAYER_PIC : FEMALE_PLAYER_PIC, 0);
    t.data[tTrainerPicPosX] = 0;
    spriteState.gSpriteCoordOffsetX = 0;
    ChangeBgX(2, 0, BG_COORD_SET);
    CreateFadeOutTask(taskId, 2);
    t.func = Task_OakSpeech_LetsGo;
  }
}

function Task_OakSpeech_LetsGo(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (t.data[tTrainerPicFadeState] === 0) return;
  OakSpeechPrintMessage(text("gOakSpeech_Text_LetsGo"), res.textSpeed);
  t.data[tTimer] = 30;
  t.func = Task_OakSpeech_FadeOutBGM;
}

function Task_OakSpeech_FadeOutBGM(taskId: number): void {
  if (IsTextPrinterActive(WIN_INTRO_TEXTBOX)) return;
  const t = tasks.tasks[taskId];
  if (t.data[tTimer] !== 0) {
    t.data[tTimer]--;
  } else {
    sound.fadeOutBGM(4);
    t.func = Task_OakSpeech_SetUpExitAnimation;
  }
}

// ---------------------------------------------------------------- exit animation (res.currentPage is the shrink timer)

function Task_OakSpeech_SetUpExitAnimation(taskId: number): void {
  res.currentPage = 0;
  Task_OakSpeech_SetUpDestroyPlatformSprites(taskId);
  Task_OakSpeech_SetUpFadePlayerPicWhite(taskId);
  Task_OakSpeech_SetUpShrinkPlayerPic(taskId);
}

function Task_OakSpeech_SetUpShrinkPlayerPic(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  SetBgAttribute(2, BG_ATTR_WRAPAROUND, 1);
  d[0] = 0;
  d[1] = 0;
  d[2] = 256;
  d[15] = 0;
  tasks.tasks[taskId].func = Task_OakSpeech_ShrinkPlayerPic;
}

function Task_OakSpeech_ShrinkPlayerPic(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  res.currentPage++;
  if (res.currentPage % 20 === 0) {
    if (res.currentPage === 40) sound.playSE(C.SE_WARP_IN);
    const oldScaleDelta = d[2] & 0xffff;
    d[2] -= 32;
    const x = Q_8_8_inv(oldScaleDelta - 8);
    const y = Q_8_8_inv(d[2] - 16);
    SetBgAffine(2, 0x7800, 0x5400, 120, 84, x, y, 0);
    if (d[2] <= 96) {
      d[15] = 1;
      d[0] = 36;
      tasks.tasks[taskId].func = Task_OakSpeech_FadePlayerPicToBlack;
    }
  }
}

function Task_OakSpeech_SetUpDestroyPlatformSprites(_taskId: number): void {
  const taskId2 = tasks.create(Task_OakSpeech_DestroyPlatformSprites, 1);
  const d = tasks.tasks[taskId2].data;
  d[0] = 0;
  d[1] = 0;
  d[2] = 0;
  d[15] = 0;
  BeginNormalPaletteFade((PALETTES_OBJECTS | 0x0fcf) >>> 0, 4, 0, 16, RGB_BLACK);
}

function Task_OakSpeech_DestroyPlatformSprites(taskId: number): void {
  if (gPaletteFade.active) return;
  const d = tasks.tasks[taskId].data;
  if (d[1] !== 0) {
    tasks.destroy(taskId);
    // Bug in the original: this task's data[7..9] were never set, so only sprite 0 is destroyed.
    DestroyPikachuOrPlatformSprites(taskId, SPRITE_TYPE_PLATFORM);
  } else {
    d[1]++;
    BeginNormalPaletteFade(0xf000, 0, 0, 16, RGB_BLACK);
  }
}

function Task_OakSpeech_SetUpFadePlayerPicWhite(_taskId: number): void {
  const taskId2 = tasks.create(Task_OakSpeech_FadePlayerPicWhite, 2);
  const d = tasks.tasks[taskId2].data;
  d[0] = 8;
  d[1] = 0;
  d[2] = 8;
  d[14] = 0;
  d[15] = 0;
}

function Task_OakSpeech_FadePlayerPicWhite(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  if (d[0] !== 0) {
    d[0]--;
    return;
  }
  if (d[1] <= 0 && d[2] !== 0) d[2]--;
  BlendPalette(4 * 16, 0x20, d[14], RGB_WHITE);
  d[14]++;
  d[1] = s16(d[1] - 1);
  d[0] = d[2];
  if (d[14] > 14) {
    for (let i = 0; i < 32; i++) {
      gPlttBufferFaded[i + 4 * 16] = RGB_WHITE;
      gPlttBufferUnfaded[i + 4 * 16] = RGB_WHITE;
    }
    tasks.destroy(taskId);
  }
}

function Task_OakSpeech_FadePlayerPicToBlack(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (t.data[0] !== 0) {
    t.data[0]--;
  } else {
    BeginNormalPaletteFade(0x0030, 2, 0, 16, RGB_BLACK);
    t.func = Task_OakSpeech_WaitForFade;
  }
}

function Task_OakSpeech_WaitForFade(taskId: number): void {
  if (!gPaletteFade.active) tasks.tasks[taskId].func = Task_OakSpeech_FreeResources;
}

function Task_OakSpeech_FreeResources(taskId: number): void {
  FreeAllWindowBuffers();
  textFlags.canABSpeedUpPrint = false;
  SetMainCallback2(CB2_NewGame);
  tasks.destroy(taskId);
}

// ---------------------------------------------------------------- return from the naming screen

function CB2_ReturnFromNamingScreen(): void {
  switch (gMain.state) {
    case 0:
      SetVBlankCallback(null);
      ppu.vram.fill(0);
      ppu.oam.fill(0);
      ppu.pltt.fill(RGB_BLACK, 1);
      ResetPaletteFade();
      ScanlineEffect_Stop();
      ResetSpriteData();
      FreeAllSpritePalettes();
      tasks.reset();
      break;
    case 1:
      resetBgs();
      break;
    case 2:
      for (const reg of [REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT, REG_OFFSET_BLDCNT, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDY]) SetGpuReg(reg, 0);
      break;
    case 3: {
      FreeAllWindowBuffers();
      InitStandardTextBoxWindows();
      InitTextBoxGfxAndPrinters();
      // The original reads 48 colors past the background palette (into the following tile data);
      // the player / rival pics overwrite that range with their own colors afterwards.
      const pals = incbin("sOakSpeech_Background_Pals");
      const after = incbin("sOakSpeech_Background_Tiles");
      const buf = new Uint8Array(pals.length + 96);
      buf.set(pals);
      buf.set(after.subarray(0, 96), pals.length);
      LoadPalette(buf, 0, buf.length);
      break;
    }
    case 4: {
      const tiles = incbin("sOakSpeech_Background_Tiles");
      LoadBgTiles(1, tiles, tiles.length, 0);
      break;
    }
    case 5:
      FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 30, 20);
      CopyToBgTilemapBuffer(1, incbin("sOakSpeech_Background_Tilemap"), 0, 0);
      FillBgTilemapBufferRect_Palette0(2, 0, 0, 0, 30, 20);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(2);
      break;
    case 6: {
      const taskId = tasks.create(Task_OakSpeech_ConfirmName, 0);
      if (!res.hasPlayerBeenNamed) LoadTrainerPic(newGameProfile.playerGender === MALE ? MALE_PLAYER_PIC : FEMALE_PLAYER_PIC, 0);
      else LoadTrainerPic(RIVAL_PIC, 0);
      tasks.tasks[taskId].data[tTrainerPicPosX] = -60;
      spriteState.gSpriteCoordOffsetX += 60;
      ChangeBgX(2, 0xffffc400 | 0, BG_COORD_SET);
      CreatePikachuOrPlatformSprites(taskId, SPRITE_TYPE_PLATFORM);
      tasks.tasks[taskId].data[tNameNotConfirmed] = 1;
      break;
    }
    case 7:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
      ShowBg(0);
      ShowBg(1);
      ShowBg(2);
      SetVBlankCallback(VBlankCB_NewGameScene);
      textFlags.canABSpeedUpPrint = true;
      SetMainCallback2(CB2_NewGameScene);
      return;
  }
  gMain.state++;
}

/** Entry point used by the naming screen when it finishes. */
export function returnFromNamingScreen(): void {
  gMain.state = 0;
  SetMainCallback2(CB2_ReturnFromNamingScreen);
}

// ---------------------------------------------------------------- sprites and pics

function CreateNidoranFSprite(taskId: number): void {
  DecompressPicFromTable(gMonFrontPicTable()[INTRO_SPECIES], gMonSpritesGfxPtr.sprites[0], INTRO_SPECIES);
  const pal = cdata<Array<{ data: unknown; tag: number }>>("data", "gMonPaletteTable")[INTRO_SPECIES];
  LoadSpritePalette({ data: symPalette(pal.data), tag: pal.tag });
  SetMultiuseSpriteTemplateToPokemon(INTRO_SPECIES, 0);
  const spriteId = CreateSprite(gMultiuseSpriteTemplate(), 96, 96, 1);
  gSprites[spriteId].callback = SpriteCallbackDummy;
  gSprites[spriteId].oam.priority = 1;
  gSprites[spriteId].invisible = true;
  tasks.tasks[taskId].data[tNidoranFSpriteId] = spriteId;
}

function SpriteCB_Pikachu(sprite: Sprite): void {
  sprite.y2 = gSprites[sprite.data[0]].animCmdIndex;
}

let pikachuTemplates: SpriteTemplate[] | null = null;
let platformTemplates: SpriteTemplate[] | null = null;

function CreatePikachuOrPlatformSprites(taskId: number, spriteType: number): void {
  const d = tasks.tasks[taskId].data;
  switch (spriteType) {
    case SPRITE_TYPE_PIKACHU: {
      for (const [sym, size, tag] of [["sPikachuIntro_PikachuBody_Gfx", 0x400, GFX_TAG_PIKACHU], ["sPikachuIntro_PikachuEars_Gfx", 0x200, GFX_TAG_PIKACHU_EARS], ["sPikachuIntro_PikachuEyes_Gfx", 0x80, GFX_TAG_PIKACHU_EYES]] as const) {
        LoadSpriteSheet({ data: incbin(sym), size, tag });
      }
      LoadSpritePalette({ data: symPalette({ $sym: "sPikachuIntro_Pikachu_Pal" }), tag: PAL_TAG_PIKACHU });
      pikachuTemplates ??= (oak("sPikachuIntro_Pikachu_SpriteTemplates") as CSpriteTemplate[]).map((t) => templateFrom(t));
      let spriteId = CreateSprite(pikachuTemplates[0], 16, 17, 2);
      gSprites[spriteId].oam.priority = 0;
      d[tPikachuPlatformSpriteId(0)] = spriteId;
      spriteId = CreateSprite(pikachuTemplates[1], 16, 9, 3);
      gSprites[spriteId].oam.priority = 0;
      gSprites[spriteId].data[0] = d[tPikachuPlatformSpriteId(0)];
      gSprites[spriteId].callback = SpriteCB_Pikachu;
      d[tPikachuPlatformSpriteId(1)] = spriteId;
      spriteId = CreateSprite(pikachuTemplates[2], 24, 13, 1);
      gSprites[spriteId].oam.priority = 0;
      gSprites[spriteId].data[0] = d[tPikachuPlatformSpriteId(0)];
      gSprites[spriteId].callback = SpriteCB_Pikachu;
      d[tPikachuPlatformSpriteId(2)] = spriteId;
      break;
    }
    case SPRITE_TYPE_PLATFORM: {
      LoadSpriteSheet({ data: incbin("sOakSpeech_Platform_Gfx"), size: 0x600, tag: GFX_TAG_PLATFORM });
      LoadSpritePalette({ data: symPalette({ $sym: "sOakSpeech_Platform_Pal" }), tag: PAL_TAG_PLATFORM });
      platformTemplates ??= (oak("sOakSpeech_Platform_SpriteTemplates") as CSpriteTemplate[]).map((t) => templateFrom(t));
      for (let i = 0; i < NUM_PIKACHU_PLATFORM_SPRITES; i++) {
        const spriteId = CreateSprite(platformTemplates[i], i * 32 + 88, 112, 1);
        gSprites[spriteId].oam.priority = 2;
        gSprites[spriteId].animPaused = true;
        gSprites[spriteId].coordOffsetEnabled = true;
        d[tPikachuPlatformSpriteId(i)] = spriteId;
      }
      break;
    }
  }
}

function DestroyPikachuOrPlatformSprites(taskId: number, spriteType: number): void {
  const d = tasks.tasks[taskId].data;
  for (let i = 0; i < NUM_PIKACHU_PLATFORM_SPRITES; i++) DestroySprite(gSprites[d[tPikachuPlatformSpriteId(i)] ?? 0]);
  if (spriteType === SPRITE_TYPE_PIKACHU) {
    FreeSpriteTilesByTag(GFX_TAG_PIKACHU_EYES);
    FreeSpriteTilesByTag(GFX_TAG_PIKACHU_EARS);
    FreeSpriteTilesByTag(GFX_TAG_PIKACHU);
    FreeSpritePaletteByTag(PAL_TAG_PIKACHU);
  } else {
    FreeSpriteTilesByTag(GFX_TAG_PLATFORM);
    FreeSpritePaletteByTag(PAL_TAG_PLATFORM);
  }
}

function LoadTrainerPic(whichPic: number, tileOffset: number): void {
  const pics: Record<number, [string, string, number]> = {
    [MALE_PLAYER_PIC]: ["sOakSpeech_Red_Pal", "sOakSpeech_Red_Tiles", 4],
    [FEMALE_PLAYER_PIC]: ["sOakSpeech_Leaf_Pal", "sOakSpeech_Leaf_Tiles", 4],
    [RIVAL_PIC]: ["sOakSpeech_Rival_Pal", "sOakSpeech_Rival_Tiles", 6],
    [OAK_PIC]: ["sOakSpeech_Oak_Pal", "sOakSpeech_Oak_Tiles", 6],
  };
  const pic = pics[whichPic];
  if (!pic) return;
  const pal = incbin(pic[0]);
  LoadPalette(pal, pic[2] * 16, pal.length);
  ppu.vram.set(incbin(pic[1]), 0x600 + tileOffset);
  const tilemap = Uint8Array.from({ length: 0x60 }, (_, i) => i);
  FillBgTilemapBufferRect(2, 0, 0, 0, 32, 32, 16);
  CopyRectToBgTilemapBufferRect(2, tilemap, 0, 0, 8, 12, 11, 2, 8, 12, 16, (tileOffset >> 6) + 24, 0);
  CopyBgTilemapBufferToVram(2);
}

function ClearTrainerPic(): void {
  FillBgTilemapBufferRect(2, 0, 11, 1, 8, 12, 16);
  CopyBgTilemapBufferToVram(2);
}

// Fade tasks: tParentTaskId data[0], tBlendTarget1 data[1], tBlendTarget2 data[2], tUnusedState data[3], tFadeTimer data[4]

function Task_SlowFadeIn(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  if (d[1] === 0) {
    tasks.tasks[d[0]].data[tTrainerPicFadeState] = 1;
    tasks.destroy(taskId);
    for (let i = 0; i < NUM_PIKACHU_PLATFORM_SPRITES; i++) gSprites[d[tPikachuPlatformSpriteId(i)]].invisible = true;
  } else if (d[4] !== 0) {
    d[4]--;
  } else {
    d[4] = d[tTimer];
    d[1]--;
    d[2]++;
    if (d[1] === 8) for (let i = 0; i < NUM_PIKACHU_PLATFORM_SPRITES; i++) gSprites[d[tPikachuPlatformSpriteId(i)]].invisible = !gSprites[d[tPikachuPlatformSpriteId(i)]].invisible;
    SetGpuReg(REG_OFFSET_BLDALPHA, d[2] * 256 + d[1]);
  }
}

function CreateFadeInTask(taskId: number, delay: number): void {
  SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG2 | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_BG1 | BLDCNT_TGT2_OBJ);
  SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16, 0));
  SetGpuReg(REG_OFFSET_BLDY, 0);
  tasks.tasks[taskId].data[tTrainerPicFadeState] = 0;
  const taskId2 = tasks.create(Task_SlowFadeIn, 0);
  const d = tasks.tasks[taskId2].data;
  d[0] = taskId;
  d[1] = 16;
  d[2] = 0;
  d[3] = delay;
  d[4] = delay;
  for (let i = 0; i < NUM_PIKACHU_PLATFORM_SPRITES; i++) d[tPikachuPlatformSpriteId(i)] = tasks.tasks[taskId].data[tPikachuPlatformSpriteId(i)];
}

function Task_SlowFadeOut(taskId: number): void {
  const d = tasks.tasks[taskId].data;
  if (d[1] === 16) {
    if (!gPaletteFade.active) {
      tasks.tasks[d[0]].data[tTrainerPicFadeState] = 1;
      tasks.destroy(taskId);
    }
  } else if (d[4] !== 0) {
    d[4]--;
  } else {
    d[4] = d[tTimer];
    d[1] += 2;
    d[2] -= 2;
    if (d[1] === 8) for (let i = 0; i < NUM_PIKACHU_PLATFORM_SPRITES; i++) gSprites[d[tPikachuPlatformSpriteId(i)]].invisible = !gSprites[d[tPikachuPlatformSpriteId(i)]].invisible;
    SetGpuReg(REG_OFFSET_BLDALPHA, d[2] * 256 + d[1]);
  }
}

function CreateFadeOutTask(taskId: number, delay: number): void {
  SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG2 | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_BG1 | BLDCNT_TGT2_OBJ);
  SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(0, 16));
  SetGpuReg(REG_OFFSET_BLDY, 0);
  tasks.tasks[taskId].data[tTrainerPicFadeState] = 0;
  const taskId2 = tasks.create(Task_SlowFadeOut, 0);
  const d = tasks.tasks[taskId2].data;
  d[0] = taskId;
  d[1] = 0;
  d[2] = 16;
  d[3] = delay;
  d[4] = delay;
  for (let i = 0; i < NUM_PIKACHU_PLATFORM_SPRITES; i++) d[tPikachuPlatformSpriteId(i)] = tasks.tasks[taskId].data[tPikachuPlatformSpriteId(i)];
}

// ---------------------------------------------------------------- names

const nameList = (name: string) => (oak(name) as unknown[]).map(symText);

function PrintNameChoiceOptions(taskId: number, hasPlayerBeenNamed: boolean): void {
  const d = tasks.tasks[taskId].data;
  d[tMenuWindowId] = AddWindow(introWindows()[WIN_INTRO_NAMES]);
  PutWindowTilemap(d[tMenuWindowId]);
  DrawStdFrameWithCustomTileAndPalette(d[tMenuWindowId], true, GetStdWindowBaseTileNum(), 14);
  FillWindowPixelBuffer(d[tMenuWindowId], PIXEL_FILL(1));
  AddTextPrinterParameterized(d[tMenuWindowId], FONT_NORMAL, text("gOtherText_NewName"), 8, 1, 0, null);
  const textPtrs = !hasPlayerBeenNamed ? nameList(newGameProfile.playerGender === MALE ? "sMaleNameChoices" : "sFemaleNameChoices") : nameList("sRivalNameChoices");
  const count = nameList("sRivalNameChoices").length;
  for (let i = 0; i < count; i++) AddTextPrinterParameterized(d[tMenuWindowId], FONT_NORMAL, textPtrs[i], 8, 16 * (i + 1) + 1, 0, null);
  Menu_InitCursor(d[tMenuWindowId], FONT_NORMAL, 0, 1, 16, 5, 0);
  CopyWindowToVram(d[tMenuWindowId], COPYWIN_FULL);
}

function GetDefaultName(hasPlayerBeenNamed: boolean, rivalNameChoice: number): void {
  let src: Uint8Array;
  let dest: number[];
  if (!hasPlayerBeenNamed) {
    const list = nameList(newGameProfile.playerGender === MALE ? "sMaleNameChoices" : "sFemaleNameChoices");
    src = list[random() % list.length];
    dest = newGameProfile.playerName;
  } else {
    src = nameList("sRivalNameChoices")[rivalNameChoice];
    dest = newGameProfile.rivalName;
  }
  dest.length = 0;
  let i = 0;
  for (; i < C.PLAYER_NAME_LENGTH && src[i] !== EOS; i++) dest.push(src[i]);
  for (; i < C.PLAYER_NAME_LENGTH + 1; i++) dest.push(EOS);
}
