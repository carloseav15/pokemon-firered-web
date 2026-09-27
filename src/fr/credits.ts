// credits.c: the ending credits — the staff text scripted over the scrolling
// overworld maps (letterbox WIN0 with a darkened band), the running player /
// rival sprites, the four Pokémon scenes (Charizard, Venusaur, Blastoise,
// Pikachu), the copyright / THE END screens and the final wait.
// Adaptations:
//  - The scene is a hardware scene hosted by fieldMenu; its first background is
//    the map the field shows at the Indigo Plateau (overworldCredits.ts).
//  - The map scrolls (Overworld_DoScrollSceneForCredits) draw static maps: no
//    NPCs, weather or tileset animations (see overworldCredits.ts).
//  - The `while (!DoOverworldMapScrollScene()) {}` of the map-with-sprites case
//    runs the (synchronous) scroll set-up frame by frame.
//  - SoftReset(RESET_ALL) reloads the page (back to the title screen).
// Needs preloadCredits() first.

import { sound } from "./audio/sound";
import { FONT_NORMAL, FONT_NORMAL_COPY_1 } from "./gba/font";
import { A_BUTTON, JOY_NEW } from "./gba/input";
import { tasks } from "./gba/tasks";
import * as C from "./generated/constants";
import { cdata, incbin, incbin16, loadCData, preloadPacks } from "./hw/assets";
import { templateFrom, type CSpriteTemplate } from "./hw/cdataSprite";
import {
  BG_COORD_SET, BG_SCREEN_SIZE, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, FillBgTilemapBufferRect, HideBg, InitBgsFromTemplates, LoadBgTiles, LoadBgTilemap,
  ResetBgsAndClearDma3BusyFlags, SetBgAffine, SetBgTilemapBuffer, ShowBg, type BgTemplate,
} from "./hw/bg";
import { ClearGpuRegBits, GetGpuReg, SetGpuReg, SetGpuRegBits } from "./hw/gpu";
import { Menu_LoadStdPalAt } from "./hw/menu";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, OBJ_PLTT_ID, PALETTES_ALL, PLTT_SIZE_4BPP, ResetPaletteFade,
  RGB_BLACK, RGB_WHITE, TransferPlttBuffer,
} from "./hw/palette";
import {
  BLDALPHA_BLEND, BLDCNT_EFFECT_DARKEN, BLDCNT_TGT1_BG1, BLDCNT_TGT1_BG2, BLDCNT_TGT1_BG3, DISPCNT_WIN0_ON, DISPCNT_WIN1_ON, DISPLAY_HEIGHT, DISPLAY_WIDTH,
  REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT, WIN_RANGE,
} from "./hw/ppu";
import { SetHBlankCallback, SetMainCallback2, SetVBlankCallback } from "./hw/runtime";
import { LoadCompressedSpriteSheet } from "./decompress";
import {
  CreateSprite, DestroySprite, FreeSpriteTilesByTag, gSprites, LoadOam, ProcessSpriteCopyRequests, ResetSpriteData, TAG_NONE,
} from "./hw/sprite";
import { AddTextPrinterParameterized4 } from "./hw/text";
import {
  AddWindow, COPYWIN_FULL, COPYWIN_GFX, CopyToWindowPixelBuffer, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PIXEL_FILL, PutWindowTilemap,
  RemoveWindow, type WindowTemplate,
} from "./hw/window";
import { InitStandardTextBoxWindows } from "./hw/menu";
import {
  CreditsShowCurrentField, DrawCurrentFieldForCredits, FadeSelectedPals, gFieldCamera, Overworld_CreditsIdleCB, Overworld_CreditsMainCB,
  Overworld_DoScrollSceneForCredits, preloadCreditsMaps, type CreditsOverworldCmd,
} from "./overworldCredits";
import { LoadMonPicInWindow } from "./trainerPokemonSprites";
import { FieldMap } from "./field/fieldmap";
import type { Game } from "./game";
import { fieldMenu } from "./menus/fieldMenus";
import { flagClear, save } from "./save";

const TASK_NONE = 0xff;

enum CreditsSceneIdx {
  CREDITSSCENE_INIT_WIN0 = 0,
  CREDITSSCENE_SETUP_DARKEN_EFFECT,
  CREDITSSCENE_OPEN_WIN0,
  CREDITSSCENE_LOAD_PLAYER_SPRITE_AT_INDIGO,
  CREDITSSCENE_PRINT_TITLE_STAFF,
  CREDITSSCENE_WAIT_TITLE_STAFF,
  CREDITSSCENE_EXEC_CMD,
  CREDITSSCENE_PRINT_ADDPRINTER1,
  CREDITSSCENE_PRINT_ADDPRINTER2,
  CREDITSSCENE_PRINT_DELAY,
  CREDITSSCENE_MAPNEXT_DESTROYWINDOW,
  CREDITSSCENE_MAPNEXT_LOADMAP,
  CREDITSSCENE_MAP_LOADMAP_CREATESPRITES,
  CREDITSSCENE_MON_DESTROY_ASSETS,
  CREDITSSCENE_MON_SHOW,
  CREDITSSCENE_THEEND_DESTROY_ASSETS,
  CREDITSSCENE_THEEND_SHOW,
  CREDITSSCENE_WAITBUTTON,
  CREDITSSCENE_TERMINATE,
}

enum CreditsScrCmd {
  CREDITSSCRCMD_PRINT = 0,
  CREDITSSCRCMD_MAPNEXT,
  CREDITSSCRCMD_MAP,
  CREDITSSCRCMD_MON,
  CREDITSSCRCMD_THEENDGFX,
  CREDITSSCRCMD_WAITBUTTON,
}

enum CreditsMon {
  CREDITSMON_CHARIZARD = 0,
  CREDITSMON_VENUSAUR,
  CREDITSMON_BLASTOISE,
  CREDITSMON_PIKACHU,
}

const GFXTAG_CHARACTER = 0x2000; // Player/Rival
const GFXTAG_GROUND = 0x2001;

type CreditsResources = {
  mainseqno: number;
  subseqno: number;
  taskId: number;
  timer: number;
  scrcmdidx: number;
  canSpeedThrough: number;
  whichMon: number;
  windowId: number;
  windowIsActive: boolean;
  creditsMonTimer: number;
  unk_0E: number;
  ovwldseqno: { value: number };
  unk_1D: number;
};

type CreditsScrcmd = { cmd: number; param: number; duration: number };
type CreditsTextHeader = { title: { $sym: string }; names: { $sym: string }; unused: number };

type CreditsTaskData = {
  spriteMoveCmd: number;
  characterSpriteId: number;
  characterTilesTag: number;
  characterPalTag: number;
  groundSpriteId: number;
  groundTilesTag: number;
  groundPalTag: number;
};

let sCreditsMgr: CreditsResources = null!;
const sCreditsTaskData = new Map<number, CreditsTaskData>();

const rd = <T>(name: string) => cdata<T>("credits", name);
const str = (ref: { $sym: string }) => Uint8Array.from(cdata<number[]>("strings", ref.$sym));
const TITLE_TEXT = () => Uint8Array.from(cdata<number[]>("strings", "gString_PokemonFireRed_Staff"));

const sBgTemplates_MonSceneOrTheEnd = () => rd<BgTemplate[]>("sBgTemplates_MonSceneOrTheEnd");
const sCreditsScript = () => rd<CreditsScrcmd[]>("sCreditsScript");
const sCreditsTexts = () => rd<CreditsTextHeader[]>("sCreditsTexts");
const sTextColor_Header = () => rd<number[]>("sTextColor_Header");
const sTextColor_Regular = () => rd<number[]>("sTextColor_Regular");
const sCreditsWindowTemplate = () => rd<WindowTemplate>("sCreditsWindowTemplate");
const sPlayerRivalSpriteParams = () => rd<number[][]>("sPlayerRivalSpriteParams");
const sOverworldMapScenes = () => rd<{ $sym: string }[]>("sOverworldMapScenes").map((r) => rd<CreditsOverworldCmd[]>(r.$sym));

const sSpriteCallbacks = {};

/** Loads the data the credits read. */
export function preloadCredits(): Promise<unknown> {
  return Promise.all([
    loadCData("credits", "strings", "text_window_graphics", "pokemon", "trainer_pokemon_sprites", "event_object_movement", "graphics"),
    preloadPacks(["graphics_credits", "graphics_text_window", "graphics_fonts", "graphics_interface", "pokemon"]),
  ]).then(() => preloadCreditsMaps());
}

/** DoCredits (through the field's scene host). */
export function DoCredits(game: Game): void {
  void preloadCredits().then(() => {
    fieldMenu(game, (close) => {
      void close; // the credits end with SoftReset
      // The first background is the field's map (the C draws over the field's own BGs).
      const p = game.overworld.objects.player();
      CreditsShowCurrentField(game.overworld.map as FieldMap, p?.currentCoords.x ?? 11, p?.currentCoords.y ?? 6);
      SetVBlankCallback(null);
      SetHBlankCallback(null);
      ResetPaletteFade();
      InitStandardTextBoxWindows();
      DrawCurrentFieldForCredits();
      Menu_LoadStdPalAt(BG_PLTT_ID(15));
      DoCreditsInit();
    }, false);
  });
}

function DoCreditsInit(): void {
  sCreditsMgr = {
    mainseqno: 0, subseqno: 0, taskId: 0, timer: 0, scrcmdidx: 0, canSpeedThrough: 0, whichMon: 0, windowId: 0, windowIsActive: false, creditsMonTimer: 0, unk_0E: 0,
    ovwldseqno: { value: 0 }, unk_1D: 0,
  };
  tasks.reset();
  sCreditsMgr.taskId = TASK_NONE;
  sCreditsMgr.unk_1D = 0;
  ResetSpriteData();
  SetVBlankCallback(VBlankCB);
  SetMainCallback2(CB2_Credits);
}

function CB2_Credits(): void {
  switch (RollCredits()) {
    case 0:
      Overworld_CreditsIdleCB();
      break;
    case 1:
      if (sCreditsMgr.unk_1D & 1) Overworld_CreditsMainCB();
      else Overworld_CreditsIdleCB();
      sCreditsMgr.unk_1D++;
      break;
    case 2: {
      flagClear(C.FLAG_DONT_SHOW_MAP_NAME_POPUP);
      // gDisableMapMusicChangeOnMapLoad = MUSIC_DISABLE_OFF; Free(sCreditsMgr)
      // SoftReset(RESET_ALL): back to the title screen.
      window.location.reload();
      break;
    }
  }
}

function SwitchWin1OffWin0On(): void {
  ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN1_ON);
  SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
  SetGpuReg(REG_OFFSET_WININ, 0x1f3f);
  SetGpuReg(REG_OFFSET_WINOUT, 0x000e);
}

function InitBgDarkenEffect(): void {
  SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG1 | BLDCNT_TGT1_BG2 | BLDCNT_TGT1_BG3 | BLDCNT_EFFECT_DARKEN);
  SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16, 4));
  SetGpuReg(REG_OFFSET_BLDY, 10);
}

function CreateCreditsWindow(): void {
  sCreditsMgr.windowId = AddWindow(sCreditsWindowTemplate());
  FillWindowPixelBuffer(sCreditsMgr.windowId, PIXEL_FILL(0));
  PutWindowTilemap(sCreditsMgr.windowId);
  CopyWindowToVram(sCreditsMgr.windowId, COPYWIN_FULL);
  sCreditsMgr.windowIsActive = true;
}

function DestroyCreditsWindow(): void {
  if (sCreditsMgr.windowIsActive) {
    RemoveWindow(sCreditsMgr.windowId);
    // CleanupOverworldWindowsAndTilemaps()
    sCreditsMgr.windowIsActive = false;
  }
}

function DoOverworldMapScrollScene(_whichMon: number): boolean {
  switch (sCreditsMgr.subseqno) {
    case 0:
      // FlagSet(FLAG_DONT_SHOW_MAP_NAME_POPUP); gDisableMapMusicChangeOnMapLoad = MUSIC_DISABLE_KEEP;
      sCreditsMgr.ovwldseqno.value = 0;
      sCreditsMgr.subseqno++;
      // fallthrough
    case 1:
      if (!Overworld_DoScrollSceneForCredits(sCreditsMgr.ovwldseqno, sOverworldMapScenes()[sCreditsMgr.whichMon], 0)) return false;
      CreateCreditsWindow();
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, DISPLAY_WIDTH));
      SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(36, DISPLAY_HEIGHT - 36));
      SwitchWin1OffWin0On();
      InitBgDarkenEffect();
      Menu_LoadStdPalAt(BG_PLTT_ID(15));
      gPlttBufferUnfaded[BG_PLTT_ID(15) + 15] = RGB_BLACK;
      gPlttBufferFaded[BG_PLTT_ID(15) + 15] = RGB_BLACK;
      return true;
    default:
      return false;
  }
}

function RollCredits(): number {
  const m = sCreditsMgr;
  let win0v0: number, win0v1: number;

  switch (m.mainseqno) {
    case CreditsSceneIdx.CREDITSSCENE_INIT_WIN0:
      SwitchWin1OffWin0On();
      SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, DISPLAY_WIDTH));
      SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(Math.trunc(DISPLAY_HEIGHT / 2) - 1, Math.trunc(DISPLAY_HEIGHT / 2) + 1));
      m.mainseqno = CreditsSceneIdx.CREDITSSCENE_SETUP_DARKEN_EFFECT;
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_SETUP_DARKEN_EFFECT:
      InitBgDarkenEffect();
      CreateCreditsWindow();
      Menu_LoadStdPalAt(BG_PLTT_ID(15));
      gPlttBufferUnfaded[BG_PLTT_ID(15) + 15] = RGB_BLACK;
      gPlttBufferFaded[BG_PLTT_ID(15) + 15] = RGB_BLACK;
      m.mainseqno = CreditsSceneIdx.CREDITSSCENE_OPEN_WIN0;
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_OPEN_WIN0:
      win0v0 = GetGpuReg(REG_OFFSET_WIN0V) >> 8;
      win0v1 = GetGpuReg(REG_OFFSET_WIN0V) & 0xff;
      if (win0v0 === 0x24) {
        m.timer = 0;
        m.mainseqno = CreditsSceneIdx.CREDITSSCENE_LOAD_PLAYER_SPRITE_AT_INDIGO;
      } else {
        win0v0--;
        win0v1++;
        SetGpuReg(REG_OFFSET_WIN0V, (win0v0 << 8) + win0v1);
      }
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_LOAD_PLAYER_SPRITE_AT_INDIGO:
      if (m.timer) {
        m.timer--;
        return 0;
      }
      LoadPlayerOrRivalSprite(0);
      m.timer = 100;
      m.mainseqno = CreditsSceneIdx.CREDITSSCENE_PRINT_TITLE_STAFF;
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_PRINT_TITLE_STAFF:
      if (m.timer) {
        m.timer--;
        return 0;
      }
      m.timer = 360;
      AddTextPrinterParameterized4(m.windowId, FONT_NORMAL_COPY_1, 0x08, 0x29, 1, 2, sTextColor_Header(), 0, TITLE_TEXT());
      m.mainseqno = CreditsSceneIdx.CREDITSSCENE_WAIT_TITLE_STAFF;
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_WAIT_TITLE_STAFF:
      if (m.timer) {
        m.timer--;
        return 0;
      }
      DestroyCreditsWindow();
      m.mainseqno = CreditsSceneIdx.CREDITSSCENE_EXEC_CMD;
      m.timer = 0;
      m.scrcmdidx = 0;
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_EXEC_CMD:
      if (m.timer !== 0) {
        m.timer--;
        return m.canSpeedThrough;
      }
      switch (sCreditsScript()[m.scrcmdidx].cmd) {
        case CreditsScrCmd.CREDITSSCRCMD_PRINT:
          BeginNormalPaletteFade(0x00008000, 0, 0, 16, RGB_BLACK);
          m.mainseqno = CreditsSceneIdx.CREDITSSCENE_PRINT_ADDPRINTER1;
          FillWindowPixelBuffer(m.windowId, PIXEL_FILL(0));
          return m.canSpeedThrough;
        case CreditsScrCmd.CREDITSSCRCMD_MAPNEXT:
          m.mainseqno = CreditsSceneIdx.CREDITSSCENE_MAPNEXT_DESTROYWINDOW;
          m.whichMon = sCreditsScript()[m.scrcmdidx].param;
          FadeSelectedPals(1, 0, 0x3fffffff);
          break;
        case CreditsScrCmd.CREDITSSCRCMD_MAP:
          m.mainseqno = CreditsSceneIdx.CREDITSSCENE_MAP_LOADMAP_CREATESPRITES;
          m.whichMon = sCreditsScript()[m.scrcmdidx].param;
          break;
        case CreditsScrCmd.CREDITSSCRCMD_MON:
          m.mainseqno = CreditsSceneIdx.CREDITSSCENE_MON_DESTROY_ASSETS;
          m.whichMon = sCreditsScript()[m.scrcmdidx].param;
          BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK); // FadeScreen(FADE_TO_BLACK, 0)
          break;
        case CreditsScrCmd.CREDITSSCRCMD_THEENDGFX:
          m.mainseqno = CreditsSceneIdx.CREDITSSCENE_THEEND_DESTROY_ASSETS;
          m.whichMon = sCreditsScript()[m.scrcmdidx].param;
          BeginNormalPaletteFade(PALETTES_ALL, 4, 0, 16, RGB_BLACK);
          break;
        case CreditsScrCmd.CREDITSSCRCMD_WAITBUTTON:
          m.mainseqno = CreditsSceneIdx.CREDITSSCENE_WAITBUTTON;
          break;
      }
      m.timer = sCreditsScript()[m.scrcmdidx].duration;
      m.scrcmdidx++;
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_PRINT_ADDPRINTER1:
      if (gPaletteFade.active) return m.canSpeedThrough;
      AddTextPrinterParameterized4(m.windowId, FONT_NORMAL_COPY_1, 2, 6, 0, 0, sTextColor_Header(), -1, str(sCreditsTexts()[sCreditsScript()[m.scrcmdidx].param].title));
      m.mainseqno = CreditsSceneIdx.CREDITSSCENE_PRINT_ADDPRINTER2;
      return m.canSpeedThrough;
    case CreditsSceneIdx.CREDITSSCENE_PRINT_ADDPRINTER2:
      AddTextPrinterParameterized4(m.windowId, FONT_NORMAL, 8, 6, 0, 0, sTextColor_Regular(), -1, str(sCreditsTexts()[sCreditsScript()[m.scrcmdidx].param].names));
      m.mainseqno = CreditsSceneIdx.CREDITSSCENE_PRINT_DELAY;
      return m.canSpeedThrough;
    case CreditsSceneIdx.CREDITSSCENE_PRINT_DELAY:
      CopyWindowToVram(m.windowId, COPYWIN_GFX);
      m.timer = sCreditsScript()[m.scrcmdidx].duration;
      m.scrcmdidx++;
      BeginNormalPaletteFade(0x00008000, 0, 16, 0, RGB_BLACK);
      m.mainseqno = CreditsSceneIdx.CREDITSSCENE_EXEC_CMD;
      return m.canSpeedThrough;
    case CreditsSceneIdx.CREDITSSCENE_MAPNEXT_DESTROYWINDOW:
      if (!gPaletteFade.active) {
        DestroyCreditsWindow();
        m.subseqno = 0;
        m.mainseqno = CreditsSceneIdx.CREDITSSCENE_MAPNEXT_LOADMAP;
      }
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_MAPNEXT_LOADMAP:
      if (DoOverworldMapScrollScene(m.whichMon)) {
        m.canSpeedThrough = 1;
        m.mainseqno = CreditsSceneIdx.CREDITSSCENE_EXEC_CMD;
      }
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_MAP_LOADMAP_CREATESPRITES:
      if (!gPaletteFade.active) {
        DestroyCreditsWindow();
        m.subseqno = 0;
        // while (!DoOverworldMapScrollScene(whichMon)) {}
        while (!DoOverworldMapScrollScene(m.whichMon)) { /* synchronous set-up */ }
        switch (m.whichMon) {
          case 3:
          default:
            win0v0 = 1;
            break;
          case 6:
            win0v0 = 2;
            break;
          case 9:
            win0v0 = 3;
            break;
          case 12:
            win0v0 = 4;
            break;
        }
        LoadPlayerOrRivalSprite(win0v0);
        m.canSpeedThrough = 1;
        m.mainseqno = CreditsSceneIdx.CREDITSSCENE_EXEC_CMD;
      }
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_MON_DESTROY_ASSETS:
      if (!gPaletteFade.active) {
        DestroyPlayerOrRivalSprite();
        DestroyCreditsWindow();
        m.subseqno = 0;
        m.canSpeedThrough = 0;
        m.mainseqno = CreditsSceneIdx.CREDITSSCENE_MON_SHOW;
      }
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_MON_SHOW:
      if (DoCreditsMonScene()) m.mainseqno = CreditsSceneIdx.CREDITSSCENE_EXEC_CMD;
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_THEEND_DESTROY_ASSETS:
      if (!gPaletteFade.active) {
        DestroyCreditsWindow();
        m.subseqno = 0;
        m.canSpeedThrough = 0;
        m.mainseqno = CreditsSceneIdx.CREDITSSCENE_THEEND_SHOW;
      }
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_THEEND_SHOW:
      if (DoCopyrightOrTheEndGfxScene()) m.mainseqno = CreditsSceneIdx.CREDITSSCENE_EXEC_CMD;
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_WAITBUTTON:
      if (JOY_NEW(A_BUTTON)) {
        BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_WHITE);
        m.mainseqno = CreditsSceneIdx.CREDITSSCENE_TERMINATE;
        return 0;
      }
      if (m.timer) {
        m.timer--;
      } else {
        m.mainseqno = CreditsSceneIdx.CREDITSSCENE_TERMINATE;
        BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_WHITE);
      }
      return 0;
    case CreditsSceneIdx.CREDITSSCENE_TERMINATE:
      if (!gPaletteFade.active) DestroyCreditsWindow();
      break;
  }
  return 2;
}

function VBlankCB(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function LoadCreditsMonPic(whichMon: number): void {
  switch (whichMon) {
    case CreditsMon.CREDITSMON_CHARIZARD:
      InitWindows(rd<WindowTemplate[]>("sWindowTemplates_Charizard"));
      FillWindowPixelBuffer(0, PIXEL_FILL(0));
      LoadMonPicInWindow(C.SPECIES_CHARIZARD, C.SHINY_ODDS, 0, true, 10, 0);
      CopyToWindowPixelBuffer(1, incbin("credits.c:sCharizard1_Tiles"), 0, 0);
      CopyToWindowPixelBuffer(2, incbin("credits.c:sCharizard2_Tiles"), 0, 0);
      break;
    case CreditsMon.CREDITSMON_VENUSAUR:
      InitWindows(rd<WindowTemplate[]>("sWindowTemplates_Venusaur"));
      FillWindowPixelBuffer(0, PIXEL_FILL(0));
      LoadMonPicInWindow(C.SPECIES_VENUSAUR, C.SHINY_ODDS, 0, true, 10, 0);
      CopyToWindowPixelBuffer(1, incbin("credits.c:sVenusaur1_Tiles"), 0, 0);
      CopyToWindowPixelBuffer(2, incbin("credits.c:sVenusaur2_Tiles"), 0, 0);
      break;
    case CreditsMon.CREDITSMON_BLASTOISE:
      InitWindows(rd<WindowTemplate[]>("sWindowTemplates_Blastoise"));
      FillWindowPixelBuffer(0, PIXEL_FILL(0));
      LoadMonPicInWindow(C.SPECIES_BLASTOISE, C.SHINY_ODDS, 0, true, 10, 0);
      CopyToWindowPixelBuffer(1, incbin("credits.c:sBlastoise1_Tiles"), 0, 0);
      CopyToWindowPixelBuffer(2, incbin("credits.c:sBlastoise2_Tiles"), 0, 0);
      break;
    case CreditsMon.CREDITSMON_PIKACHU:
      InitWindows(rd<WindowTemplate[]>("sWindowTemplates_Pikachu"));
      FillWindowPixelBuffer(0, PIXEL_FILL(0));
      LoadMonPicInWindow(C.SPECIES_PIKACHU, C.SHINY_ODDS, 0, true, 10, 0);
      CopyToWindowPixelBuffer(1, incbin("credits.c:sPikachu1_Tiles"), 0, 0);
      CopyToWindowPixelBuffer(2, incbin("credits.c:sPikachu2_Tiles"), 0, 0);
      break;
  }
  CopyWindowToVram(0, COPYWIN_GFX);
  CopyWindowToVram(1, COPYWIN_GFX);
  CopyWindowToVram(2, COPYWIN_GFX);
}

function GetCreditsMonSpecies(whichMon: number): number {
  switch (whichMon) {
    case CreditsMon.CREDITSMON_CHARIZARD:
      return C.SPECIES_CHARIZARD;
    case CreditsMon.CREDITSMON_VENUSAUR:
      return C.SPECIES_VENUSAUR;
    case CreditsMon.CREDITSMON_BLASTOISE:
      return C.SPECIES_BLASTOISE;
    case CreditsMon.CREDITSMON_PIKACHU:
      return C.SPECIES_PIKACHU;
    default:
      return C.SPECIES_NONE;
  }
}

/** Resets what a scene change destroys (ResetSpriteData drops the camera object; ResetTasks drops its tasks). */
function ResetSceneState(): void {
  SetVBlankCallback(null);
  SetHBlankCallback(null);
  ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON | DISPCNT_WIN1_ON);
  SetGpuReg(REG_OFFSET_WININ, 0);
  SetGpuReg(REG_OFFSET_WINOUT, 0);
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  SetGpuReg(REG_OFFSET_BLDALPHA, 0);
  SetGpuReg(REG_OFFSET_BLDY, 0);
  ResetPaletteFade();
  ResetSpriteData();
  gFieldCamera.callback = null;
  gFieldCamera.movementSpeedX = 0;
  gFieldCamera.movementSpeedY = 0;
  tasks.reset();
  sCreditsMgr.taskId = TASK_NONE;
  sCreditsTaskData.clear();
}

function DoCreditsMonScene(): boolean {
  const m = sCreditsMgr;
  switch (m.subseqno) {
    case 0:
      ResetSceneState();
      ResetBgsAndClearDma3BusyFlags(true);
      InitBgsFromTemplates(1, sBgTemplates_MonSceneOrTheEnd());
      SetBgTilemapBuffer(0, new Uint16Array(BG_SCREEN_SIZE / 2));
      ChangeBgX(0, 0, BG_COORD_SET);
      ChangeBgY(0, 0, BG_COORD_SET);
      ChangeBgX(1, 0, BG_COORD_SET);
      ChangeBgY(1, 0, BG_COORD_SET);
      m.creditsMonTimer = 0;
      m.unk_0E = 0;
      SetBgAffine(2, 0x8000, 0x8000, 0x78, 0x50, m.creditsMonTimer, m.creditsMonTimer, 0);
      LoadBgTiles(1, incbin("gCreditsMonPokeball_Tiles"), 0x2000, 0);
      LoadBgTiles(2, incbin("credits.c:sCreditsMonCircle_Tiles"), 0x2000, 0);
      LoadBgTilemap(1, incbin("gCreditsMonPokeball_Tilemap"), 0x500, 0);
      LoadBgTilemap(2, incbin("credits.c:sCreditsMonCircle_Tilemap"), 0x400, 0);
      LoadPalette(incbin16("gCreditsMonPokeball_Pals").subarray(m.whichMon * 16, m.whichMon * 16 + 16), BG_PLTT_ID(0), PLTT_SIZE_4BPP);
      LoadPalette(incbin16("credits.c:sCreditsMonCircle_Pal"), BG_PLTT_ID(15), 32);
      LoadCreditsMonPic(m.whichMon);
      SetVBlankCallback(VBlankCB);
      m.subseqno++;
      break;
    case 1:
      FillBgTilemapBufferRect(0, 0, 0, 0, 32, 32, 17);
      PutWindowTilemap(0);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(0);
      m.subseqno++;
      break;
    case 2:
      ShowBg(2);
      ShowBg(0);
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
      m.creditsMonTimer = 40;
      m.subseqno++;
      break;
    case 3:
      if (m.creditsMonTimer !== 0) m.creditsMonTimer--;
      else m.subseqno++;
      break;
    case 4:
      if (!gPaletteFade.active) {
        m.creditsMonTimer = 8;
        m.unk_0E = 1;
        m.subseqno++;
      }
      break;
    case 5:
      if (m.creditsMonTimer !== 0) {
        m.creditsMonTimer--;
      } else {
        if (m.unk_0E < 3) {
          PutWindowTilemap(m.unk_0E);
          CopyBgTilemapBufferToVram(0);
          m.creditsMonTimer = 4;
          m.unk_0E++;
        } else {
          m.subseqno++;
        }
      }
      break;
    case 6:
      if (m.creditsMonTimer < 256) {
        m.creditsMonTimer += 16;
        SetBgAffine(2, 0x8000, 0x8000, 0x78, 0x50, m.creditsMonTimer, m.creditsMonTimer, 0);
      } else {
        SetBgAffine(2, 0x8000, 0x8000, 0x78, 0x50, 0x100, 0x100, 0);
        m.creditsMonTimer = 32;
        m.subseqno++;
      }
      break;
    case 7:
      if (m.creditsMonTimer !== 0) {
        m.creditsMonTimer--;
      } else {
        HideBg(2);
        ShowBg(1);
        sound.PlayCry_NormalNoDucking(GetCreditsMonSpecies(m.whichMon), 0, C.CRY_VOLUME_RS, C.CRY_PRIORITY_NORMAL);
        m.creditsMonTimer = 128;
        m.subseqno++;
      }
      break;
    case 8:
      if (m.creditsMonTimer !== 0) {
        m.creditsMonTimer--;
      } else {
        BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        m.subseqno++;
      }
      break;
    case 9:
      if (!gPaletteFade.active) {
        FreeAllWindowBuffers();
        // Free(GetBgTilemapBuffer(0))
        m.subseqno = 0;
        return true;
      }
      break;
  }
  return false;
}

function DoCopyrightOrTheEndGfxScene(): boolean {
  const m = sCreditsMgr;
  switch (m.subseqno) {
    case 0: {
      ResetSceneState();
      ResetBgsAndClearDma3BusyFlags(true);
      InitBgsFromTemplates(0, sBgTemplates_MonSceneOrTheEnd(), 1);
      ChangeBgX(0, 0, BG_COORD_SET);
      ChangeBgY(0, 0, BG_COORD_SET);
      const header = rd<{ tiles: { $sym: string }; map: { $sym: string }; palette: { $sym: string } }[]>("sCopyrightOrTheEndGfxHeaders")[m.whichMon];
      LoadBgTiles(0, incbin(header.tiles.$sym), 0x2000, 0);
      LoadBgTilemap(0, incbin(header.map.$sym), 0x800, 0);
      LoadPalette(incbin16(header.palette.$sym), BG_PLTT_ID(0), 16 * PLTT_SIZE_4BPP);
      SetVBlankCallback(VBlankCB);
      m.subseqno++;
      break;
    }
    case 1:
      CopyBgTilemapBufferToVram(0);
      m.subseqno++;
      break;
    case 2:
      ShowBg(0);
      if (m.whichMon !== 0) BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0, RGB_BLACK);
      else BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
      m.subseqno++;
      break;
    case 3:
      if (!gPaletteFade.active) {
        m.subseqno = 0;
        return true;
      }
      break;
  }
  return false;
}

function Task_MovePlayerAndGroundSprites(taskId: number): void {
  const data = sCreditsTaskData.get(taskId)!;
  switch (data.spriteMoveCmd) {
    case 0:
      break;
    case 1:
      if (gSprites[data.characterSpriteId].x !== 0xd0) {
        gSprites[data.characterSpriteId].x--;
        gSprites[data.groundSpriteId].x--;
      } else {
        data.spriteMoveCmd = 0;
      }
      break;
    case 2:
      if (sCreditsMgr.unk_1D & 1) {
        if (gSprites[data.characterSpriteId].y !== 0x50) {
          gSprites[data.characterSpriteId].y--;
          gSprites[data.groundSpriteId].y--;
        } else {
          data.spriteMoveCmd = 0;
        }
      }
      break;
    case 3:
      if (sCreditsMgr.mainseqno === 15) {
        gSprites[data.characterSpriteId].x--;
        gSprites[data.groundSpriteId].x--;
      }
      break;
  }
}

function DestroyPlayerOrRivalSprite(): void {
  if (sCreditsMgr.taskId !== TASK_NONE) {
    const data = sCreditsTaskData.get(sCreditsMgr.taskId)!;
    FreeSpriteTilesByTag(data.characterTilesTag);
    DestroySprite(gSprites[data.characterSpriteId]);
    FreeSpriteTilesByTag(data.groundTilesTag);
    DestroySprite(gSprites[data.groundSpriteId]);
    tasks.destroy(sCreditsMgr.taskId);
    sCreditsTaskData.delete(sCreditsMgr.taskId);
    sCreditsMgr.taskId = TASK_NONE;
  }
}

function LoadPlayerOrRivalSprite(whichScene: number): void {
  if (sCreditsMgr.taskId === TASK_NONE) {
    const taskId = tasks.create(Task_MovePlayerAndGroundSprites, 0);
    const data: CreditsTaskData = {
      spriteMoveCmd: 0, characterSpriteId: 0, characterTilesTag: 0, characterPalTag: 0, groundSpriteId: 0, groundTilesTag: 0, groundPalTag: 0,
    };
    sCreditsTaskData.set(taskId, data);
    sCreditsMgr.taskId = taskId;
    const params = sPlayerRivalSpriteParams()[whichScene];
    let x: number, y: number;
    switch (params[2]) {
      default:
      case 0:
        x = DISPLAY_WIDTH - 32;
        y = Math.trunc(DISPLAY_HEIGHT / 2);
        break;
      case 1:
        x = DISPLAY_WIDTH + 32;
        y = Math.trunc(DISPLAY_HEIGHT / 2);
        break;
      case 2:
        x = DISPLAY_WIDTH - 32;
        y = DISPLAY_HEIGHT;
        break;
    }
    data.spriteMoveCmd = params[2];
    data.characterTilesTag = GFXTAG_CHARACTER;
    data.characterPalTag = TAG_NONE;
    switch (params[0]) {
      case 0:
        // Player
        if (save.playerGender === C.MALE) {
          LoadCompressedSpriteSheet({ data: incbin("credits.c:sPlayerMale_Tiles"), size: 0x3000, tag: data.characterTilesTag });
          LoadPalette(incbin16("credits.c:sPlayerMale_Pal"), OBJ_PLTT_ID(15), 32);
        } else {
          LoadCompressedSpriteSheet({ data: incbin("credits.c:sPlayerFemale_Tiles"), size: 0x3000, tag: data.characterTilesTag });
          LoadPalette(incbin16("credits.c:sPlayerFemale_Pal"), OBJ_PLTT_ID(15), 32);
        }
        break;
      case 1:
        // Rival
        LoadCompressedSpriteSheet({ data: incbin("credits.c:sRival_Tiles"), size: 0x3000, tag: data.characterTilesTag });
        LoadPalette(incbin16("credits.c:sRival_Pal"), OBJ_PLTT_ID(15), 32);
        break;
    }
    const characterTemplate = { ...templateFrom(rd<CSpriteTemplate>("sPlayerOrRivalSpriteTemplate"), sSpriteCallbacks), tileTag: data.characterTilesTag, paletteTag: TAG_NONE };
    data.characterSpriteId = CreateSprite(characterTemplate, x, y, 0);
    gSprites[data.characterSpriteId].oam.paletteNum = 15;
    gSprites[data.characterSpriteId].subpriority = 0;

    data.groundTilesTag = GFXTAG_GROUND;
    data.groundPalTag = TAG_NONE;
    let templateName: string;
    switch (params[1]) {
      default:
      case 0:
        LoadCompressedSpriteSheet({ data: incbin("credits.c:sGround_Grass_Tiles"), size: 0x3000, tag: data.groundTilesTag });
        LoadPalette(incbin16("credits.c:sGround_Grass_Pal"), OBJ_PLTT_ID(14), 32);
        templateName = "sGroundSpriteTemplate_Running";
        break;
      case 1:
        LoadCompressedSpriteSheet({ data: incbin("credits.c:sGround_Grass_Tiles"), size: 0x3000, tag: data.groundTilesTag });
        LoadPalette(incbin16("credits.c:sGround_Grass_Pal"), OBJ_PLTT_ID(14), 32);
        templateName = "sGroundSpriteTemplate_Static";
        break;
      case 2:
        LoadCompressedSpriteSheet({ data: incbin("credits.c:sGround_Dirt_Tiles"), size: 0x3000, tag: data.groundTilesTag });
        LoadPalette(incbin16("credits.c:sGround_Dirt_Pal"), OBJ_PLTT_ID(14), 32);
        templateName = "sGroundSpriteTemplate_Running";
        break;
      case 3:
        LoadCompressedSpriteSheet({ data: incbin("credits.c:sGround_City_Tiles"), size: 0x3000, tag: data.groundTilesTag });
        LoadPalette(incbin16("credits.c:sGround_City_Pal"), OBJ_PLTT_ID(14), 32);
        templateName = "sGroundSpriteTemplate_Running";
        break;
    }
    const groundTemplate = { ...templateFrom(rd<CSpriteTemplate>(templateName), sSpriteCallbacks), tileTag: data.groundTilesTag, paletteTag: TAG_NONE };
    data.groundSpriteId = CreateSprite(groundTemplate, x, y + 38, 0);
    gSprites[data.groundSpriteId].oam.paletteNum = 14;
    gSprites[data.groundSpriteId].subpriority = 1;
  }
}
