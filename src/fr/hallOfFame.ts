// hall_of_fame.c + hof_pc.c: the Hall of Fame induction screen (each mon flies in and is
// introduced, applause and confetti, the player's trainer card) and the HALL OF
// FAME PC viewer.
// Adaptations:
//  - Teams live in save.hallOfFame (HofMon[6] per team, empty slots have
//    species SPECIES_NONE) instead of the Hall of Fame save sectors:
//    LoadGameSave/TrySavingData(SAVE_HALL_OF_FAME) become reads/writes of that
//    array and Game.writeSave; an empty list stands for a failed LoadGameSave
//    (the "corrupted" screen).
//  - The pointer to HallofFameTeam (sHofMonPtr) is a HofMon[6]; saved teams
//    for the PC viewer are an array of them.
//  - The screen is a hardware scene hosted by fieldMenu; leaving it either
//    warps to the credits (SetWarpsToRollCredits) or returns to the PC menu
//    (ReturnFromHallOfFamePC).
//  - Quest Log (SaveQuestLogData) and the help system are out of scope.
//  - Cry playback uses decoded species samples; it does not model the GBA's cry tables and parameters.
// Needs preloadHallOfFame().

import { IsCryPlayingOrClearCrySongs, sound, StopCryAndClearCrySongs } from "./audio/sound";
import { concat, EOS, expandPlaceholders as expand, intToDecimal, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_LEFT_ALIGN, stringVars } from "./gba/charmap";
import { FONT_NORMAL, stringWidth as stringWidthOf } from "./gba/font";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_UP, JOY_NEW } from "./gba/input";
import { tasks } from "./gba/tasks";
import * as C from "./generated/constants";
import { cdata, incbin, incbin16, loadCData, preloadPacks } from "./hw/assets";
import { templateFrom, type CSpriteTemplate } from "./hw/cdataSprite";
import {
  ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, FillBgTilemapBufferRect_Palette0, HideBg, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags,
  SetBgTilemapBuffer, ShowBg, UnsetBgTilemapBuffer, type BgTemplate,
} from "./hw/bg";
import { SetGpuReg } from "./hw/gpu";
import {
  ClearDialogWindowAndFrame, CreateTopBarWindowLoadPalette, DestroyTopBarWindow, DrawDialogueFrame, DrawStdFrameWithCustomTileAndPalette, FONTATTR_LETTER_SPACING,
  GetFontAttribute, InitStandardTextBoxWindows, InitTextBoxGfxAndPrinters, LoadStdWindowGfx, TopBarWindowPrintString, TopBarWindowPrintTwoStrings,
} from "./hw/menu";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalettes, BlendPalettesUnfaded, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, PALETTES_ALL,
  PALETTES_OBJECTS, ResetPaletteFade, RGB, RGB_BLACK, TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import {
  BLDALPHA_BLEND, BLDCNT_EFFECT_BLEND, BLDCNT_TGT1_BG1, BLDCNT_TGT2_ALL, DISPCNT_MODE_0, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu, REG_OFFSET_BLDALPHA,
  REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT,
} from "./hw/ppu";
import { gMain, SetMainCallback2, SetVBlankCallback } from "./hw/runtime";
import { ScanlineEffect_Stop } from "./hw/scanline";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, DestroySprite, FreeAllSpritePalettes, gSprites, LoadCompressedSpriteSheet, LoadOam, LoadSpritePalette,
  MAX_SPRITES, ProcessSpriteCopyRequests, ResetSpriteData, spriteState, StartSpriteAnim, type Sprite,
} from "./hw/sprite";
import { AddTextPrinterParameterized2, AddTextPrinterParameterized3, AddTextPrinterParameterized4, RunTextPrinters } from "./hw/text";
import { gSineTable } from "./hw/trig";
import {
  AddWindow, CopyWindowToVram, COPYWIN_FULL, FillWindowPixelBuffer, FreeAllWindowBuffers, PIXEL_FILL, PutWindowTilemap, type WindowTemplate,
} from "./hw/window";
import { BeginPCScreenEffect_TurnOff, BeginPCScreenEffect_TurnOn, IsPCScreenEffectRunning_TurnOff, IsPCScreenEffectRunning_TurnOn } from "./pcScreenEffect";
import { GetGenderFromSpeciesAndPersonality, SpeciesToNationalPokedexNum, playerMon } from "./pokemon/mon";
import { speciesName } from "./pokemon/pokemon";
import { random } from "./random";
import { GetGameStat, save } from "./save";
import {
  CreateMonPicSprite_HandleDeoxys, CreateTrainerPicSprite, FreeAndDestroyMonPicSprite, FreeAndDestroyTrainerPicSprite, PlayerGenderToFrontTrainerPicId,
  ResetAllPicSprites,
} from "./trainerPokemonSprites";
import { IsNationalPokedexEnabled } from "./pokedexScreen";
import type { Game } from "./game";
import { fieldMenu } from "./menus/fieldMenus";
import { SetWarpsToRollCredits } from "./postBattleEventFuncs";

export const HALL_OF_FAME_MAX_TEAMS = 50;
const HALL_OF_FAME_BG_PAL = RGB(22, 24, 29);
const PARTY_SIZE = 6;

/** struct HallofFameMon */
export type HofMon = { tid: number; personality: number; species: number; lvl: number; nick: number[] };

/** sDummyHofMon */
const sDummyHofMon = (): HofMon => ({ tid: 0x03ea03ea, personality: 0, species: C.SPECIES_NONE, lvl: 0, nick: new Array(C.POKEMON_NAME_LENGTH).fill(0x00) });

/** save.hallOfFame teams as HofMon[6] (pads shorter, older entries). */
export function GetSavedHofTeams(): HofMon[][] {
  const s = save as unknown as { hallOfFame?: HofMon[][] };
  s.hallOfFame ??= [];
  for (const team of s.hallOfFame) while (team.length < PARTY_SIZE) team.push({ ...sDummyHofMon(), tid: 0 });
  return s.hallOfFame;
}

let sSelectedPaletteIndices = 0;
let sHofMonPtr: HofMon[] = null!;
let sSavedTeams: HofMon[][] = [];
let sHofGfxPtr: { state: number; tilemap1: Uint16Array; tilemap2: Uint16Array } | null = null;

// The scene's exit, set by the entry points below.
let sGame: Game = null!;
let sCloseScene: (() => void) | null = null;

const rd = <T>(name: string) => cdata<T>("hall_of_fame", name);
const txt = (name: string): Uint8Array => Uint8Array.from(cdata<number[]>("strings", name));
const sHof_BgTemplates = () => rd<BgTemplate[]>("sHof_BgTemplates");
const sWindowTemplate = () => rd<WindowTemplate>("sWindowTemplate");
const sTextColors = () => rd<number[][]>("sTextColors");
const sHallOfFame_MonFullTeamPositions = () => rd<number[][]>("sHallOfFame_MonFullTeamPositions");
const sHallOfFame_MonHalfTeamPositions = () => rd<number[][]>("sHallOfFame_MonHalfTeamPositions");

/** Loads the data this screen reads. */
export function preloadHallOfFame(): Promise<unknown> {
  return Promise.all([
    loadCData("hall_of_fame", "strings", "text_window_graphics", "pokemon", "trainer_pokemon_sprites"),
    preloadPacks(["graphics_hall_of_fame", "graphics_misc", "graphics_text_window", "graphics_fonts", "graphics_interface", "graphics_trainers", "pokemon"]),
  ]);
}

function VBlankCB_HofIdle(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function CB2_HofIdle(): void {
  tasks.run();
  RunTextPrinters();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

function InitHallOfFameScreen(): boolean {
  switch (gMain.state) {
    case 0:
      // gHelpSystemEnabled = FALSE: the help system is out of scope.
      SetVBlankCallback(null);
      ClearVramOamPltt_LoadHofPal();
      sHofGfxPtr = { state: 0, tilemap1: new Uint16Array(0x800), tilemap2: new Uint16Array(0x800) };
      gMain.state = 1;
      break;
    case 1:
      HofInit_ResetGpuBuffersAndLoadConfettiGfx();
      gMain.state++;
      break;
    case 2:
      SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG1 | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_ALL);
      SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16, 7));
      SetGpuReg(REG_OFFSET_BLDY, 0);
      Hof_InitBgs();
      sHofGfxPtr!.state = 0;
      gMain.state++;
      break;
    case 3:
      if (!DrawHofBackground()) {
        SetVBlankCallback(VBlankCB_HofIdle);
        BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
        gMain.state++;
      }
      break;
    case 4:
      UpdatePaletteFade();
      if (!gPaletteFade.active) {
        SetMainCallback2(CB2_HofIdle);
        sound.playBGM(C.MUS_HALL_OF_FAME);
        return false;
      }
      break;
  }
  return true;
}

/** CB2_DoHallOfFameScreen */
export function CB2_DoHallOfFameScreen(): void {
  if (!InitHallOfFameScreen()) {
    const taskId = tasks.create(Task_Hof_InitMonData, 0);
    tasks.tasks[taskId].data[0] = 0; // FALSE
    sHofMonPtr = Array.from({ length: PARTY_SIZE }, sDummyHofMon);
  }
}

/** CB2_DoHallOfFameScreenDontSaveData */
export function CB2_DoHallOfFameScreenDontSaveData(): void {
  if (!InitHallOfFameScreen()) {
    const taskId = tasks.create(Task_Hof_InitMonData, 0);
    tasks.tasks[taskId].data[0] = 1; // TRUE
  }
}

/** Entry from EnterHallOfFame (post_battle_event_funcs.c): runs CB2_DoHallOfFameScreen in a hosted scene. */
export function BeginHallOfFameScreen(game: Game, dontSaveData: boolean): void {
  sGame = game;
  void preloadHallOfFame().then(() => {
    fieldMenu(game, (close) => {
      sCloseScene = close;
      SetMainCallback2(dontSaveData ? CB2_DoHallOfFameScreenDontSaveData : CB2_DoHallOfFameScreen);
    }, false);
  });
}

function Task_Hof_InitMonData(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  data[2] = 0;
  for (let i = 0; i < PARTY_SIZE; i++) {
    const mon = playerMon(i);
    if (mon.species !== C.SPECIES_NONE) {
      const nick = new Uint8Array(C.POKEMON_NAME_LENGTH + 1).fill(EOS);
      sHofMonPtr[i].species = mon.isEgg ? C.SPECIES_EGG : mon.species; // MON_DATA_SPECIES_OR_EGG
      sHofMonPtr[i].tid = mon.otId >>> 0;
      sHofMonPtr[i].personality = mon.personality >>> 0;
      sHofMonPtr[i].lvl = mon.level;
      for (let j = 0; j < C.POKEMON_NAME_LENGTH; j++) nick[j] = mon.nickname[j] ?? EOS;
      for (let j = 0; j < 10; j++) sHofMonPtr[i].nick[j] = nick[j];
      data[2]++;
    } else {
      sHofMonPtr[i].species = C.SPECIES_NONE;
      sHofMonPtr[i].tid = 0;
      sHofMonPtr[i].personality = 0;
      sHofMonPtr[i].lvl = 0;
      sHofMonPtr[i].nick[0] = EOS;
    }
  }
  sSelectedPaletteIndices = 0;
  data[1] = 0;
  data[4] = 0xff;
  for (let i = 0; i < 6; i++) data[i + 5] = 0xff;
  if (data[0]) tasks.tasks[taskId].func = Task_Hof_StartDisplayingMons;
  else tasks.tasks[taskId].func = Task_Hof_InitTeamSaveData;
}

function Task_Hof_InitTeamSaveData(taskId: number): void {
  // SaveQuestLogData(): out of scope. LoadGameSave(SAVE_HALL_OF_FAME): the saved teams.
  const teams = GetSavedHofTeams();
  let i: number;
  for (i = 0; i < HALL_OF_FAME_MAX_TEAMS; i++) {
    if (i >= teams.length || teams[i][0].species === C.SPECIES_NONE) break;
  }
  if (i >= HALL_OF_FAME_MAX_TEAMS) {
    teams.shift(); // every team moves one slot down; the last one is overwritten
  }
  teams.push(sHofMonPtr.map((m) => ({ ...m, nick: [...m.nick] })));

  DrawDialogueFrame(0, false);
  AddTextPrinterParameterized2(0, FONT_NORMAL, txt("gText_SavingDontTurnOffThePower2"), 0, null, C.TEXT_COLOR_DARK_GRAY, C.TEXT_COLOR_WHITE, C.TEXT_COLOR_LIGHT_GRAY);
  CopyWindowToVram(0, COPYWIN_FULL);
  tasks.tasks[taskId].func = Task_Hof_TrySaveData;
}

function Task_Hof_TrySaveData(taskId: number): void {
  // gGameContinueCallback = CB2_DoHallOfFameScreenDontSaveData; TrySavingData(SAVE_HALL_OF_FAME)
  sGame.writeSave(true);
  sound.playSE(C.SE_SAVE);
  tasks.tasks[taskId].func = Task_Hof_DelayAfterSave;
  tasks.tasks[taskId].data[3] = 32;
}

function Task_Hof_DelayAfterSave(taskId: number): void {
  if (tasks.tasks[taskId].data[3] !== 0) tasks.tasks[taskId].data[3]--;
  else tasks.tasks[taskId].func = Task_Hof_StartDisplayingMons;
}

function Task_Hof_StartDisplayingMons(taskId: number): void {
  tasks.tasks[taskId].func = Task_Hof_DisplayMon;
}

function Task_Hof_DisplayMon(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const currMonId = data[1];
  const currMon = sHofMonPtr[currMonId];
  let srcX: number, srcY: number, dstX: number, dstY: number;

  if (data[2] > 3) {
    [srcX, srcY, dstX, dstY] = sHallOfFame_MonFullTeamPositions()[currMonId];
  } else {
    [srcX, srcY, dstX, dstY] = sHallOfFame_MonHalfTeamPositions()[currMonId];
  }

  const spriteId = CreateMonPicSprite_HandleDeoxys(currMon.species, currMon.tid, currMon.personality, true, srcX, srcY, currMonId, 0xffff);
  gSprites[spriteId].data[1] = dstX;
  gSprites[spriteId].data[2] = dstY;
  gSprites[spriteId].data[0] = 0;
  gSprites[spriteId].callback = SpriteCB_GetOnScreen;
  data[5 + currMonId] = spriteId;
  ClearDialogWindowAndFrame(0, true);
  tasks.tasks[taskId].func = Task_Hof_PlayMonCryAndPrintInfo;
}

function Task_Hof_PlayMonCryAndPrintInfo(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const currMonId = data[1];
  const currMon = sHofMonPtr[currMonId];
  if (gSprites[data[5 + currMonId]].data[0]) {
    if (currMon.species !== C.SPECIES_EGG) sound.PlayCry_Normal(currMon.species, 0);
    HallOfFame_PrintMonInfo(currMon, 0, 14);
    data[3] = 120;
    tasks.tasks[taskId].func = Task_Hof_TryDisplayAnotherMon;
  }
}

function Task_Hof_TryDisplayAnotherMon(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const currPokeId = data[1];

  if (data[3] !== 0) {
    data[3]--;
  } else {
    sSelectedPaletteIndices = (sSelectedPaletteIndices | (0x10000 << gSprites[data[5 + currPokeId]].oam.paletteNum)) >>> 0;
    if (data[1] < PARTY_SIZE - 1 && sHofMonPtr[currPokeId + 1].species !== C.SPECIES_NONE) { // there is another pokemon to display
      data[1]++;
      BeginNormalPaletteFade(sSelectedPaletteIndices, 0, 12, 12, HALL_OF_FAME_BG_PAL);
      gSprites[data[5 + currPokeId]].oam.priority = 1;
      tasks.tasks[taskId].func = Task_Hof_DisplayMon;
    } else {
      tasks.tasks[taskId].func = Task_Hof_PaletteFadeAndPrintWelcomeText;
    }
  }
}

function Task_Hof_PaletteFadeAndPrintWelcomeText(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  BeginNormalPaletteFade(PALETTES_OBJECTS, 0, 0, 0, RGB_BLACK);
  for (let i = 0; i < PARTY_SIZE; i++) {
    if (data[5 + i] !== 0xff) gSprites[data[5 + i]].oam.priority = 0;
  }

  HallOfFame_PrintWelcomeText(0, 15);
  sound.playSE(C.SE_APPLAUSE);
  data[3] = 400;
  tasks.tasks[taskId].func = Task_Hof_ApplauseAndConfetti;
}

function Task_Hof_ApplauseAndConfetti(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  if (data[3] !== 0) {
    data[3]--;
    if ((data[3] & 3) === 0 && data[3] > 110) Hof_SpawnConfetti();
  } else {
    for (let i = 0; i < PARTY_SIZE; i++) {
      if (data[5 + i] !== 0xff) gSprites[data[5 + i]].oam.priority = 1;
    }
    BeginNormalPaletteFade(sSelectedPaletteIndices, 0, 12, 12, HALL_OF_FAME_BG_PAL);
    FillWindowPixelBuffer(0, PIXEL_FILL(0));
    CopyWindowToVram(0, COPYWIN_FULL);
    data[3] = 7;
    tasks.tasks[taskId].func = Task_Hof_WaitBorderFadeAway;
  }
}

function Task_Hof_WaitBorderFadeAway(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (data[3] > 15) {
    tasks.tasks[taskId].func = Task_Hof_SpawnPlayerPic;
  } else {
    data[3]++;
    SetGpuReg(REG_OFFSET_BLDALPHA, 256 * data[3]);
  }
}

function Task_Hof_SpawnPlayerPic(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
  ShowBg(0);
  ShowBg(1);
  ShowBg(3);
  data[4] = CreateTrainerPicSprite(PlayerGenderToFrontTrainerPicId(save.playerGender, true), true, 0x78, 0x48, 6, 0xffff);
  AddWindow(sWindowTemplate());
  LoadStdWindowGfx(1, 0x21d, BG_PLTT_ID(13));
  data[3] = 120;
  tasks.tasks[taskId].func = Task_Hof_WaitAndPrintPlayerInfo;
}

function Task_Hof_WaitAndPrintPlayerInfo(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (data[3] !== 0) {
    data[3]--;
  } else if (gSprites[data[4]].x !== 192) {
    gSprites[data[4]].x++;
  } else {
    FillBgTilemapBufferRect_Palette0(0, 0, 0, 0, 0x20, 0x20);
    HallOfFame_PrintPlayerInfo(1, 2);
    DrawDialogueFrame(0, false);
    AddTextPrinterParameterized2(0, FONT_NORMAL, txt("gText_LeagueChamp"), 0, null, C.TEXT_COLOR_DARK_GRAY, C.TEXT_COLOR_WHITE, C.TEXT_COLOR_LIGHT_GRAY);
    CopyWindowToVram(0, COPYWIN_FULL);
    tasks.tasks[taskId].func = Task_Hof_ExitOnKeyPressed;
  }
}

function Task_Hof_ExitOnKeyPressed(taskId: number): void {
  if (JOY_NEW(A_BUTTON)) {
    sound.fadeOutBGM(4);
    tasks.tasks[taskId].func = Task_Hof_HandlePaletteOnExit;
  }
}

function Task_Hof_HandlePaletteOnExit(taskId: number): void {
  gPlttBufferUnfaded.set(gPlttBufferFaded); // CpuCopy16(gPlttBufferFaded, gPlttBufferUnfaded, PLTT_SIZE)
  BeginNormalPaletteFade(PALETTES_ALL, 8, 0, 16, RGB_BLACK);
  tasks.tasks[taskId].func = Task_Hof_HandleExit;
}

function Task_Hof_HandleExit(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (!gPaletteFade.active) {
    for (let i = 0; i < PARTY_SIZE; i++) {
      const spriteId = data[5 + i];
      if (spriteId !== 0xff) FreeAndDestroyMonPicSprite(spriteId);
    }

    FreeAndDestroyTrainerPicSprite(data[4]);
    HideBg(0);
    HideBg(1);
    HideBg(3);
    FreeAllWindowBuffers();
    UnsetBgTilemapBuffer(1);
    UnsetBgTilemapBuffer(3);
    ResetBgsAndClearDma3BusyFlags(false);
    tasks.destroy(taskId);

    sHofGfxPtr = null;
    sHofMonPtr = null!;

    // SetWarpsToRollCredits(): the scene closes and the game warps.
    SetMainCallback2(null);
    SetVBlankCallback(null);
    const close = sCloseScene;
    sCloseScene = null;
    close?.();
    SetWarpsToRollCredits(sGame);
  }
}

/** Entry from the PC (HallOfFamePCBeginFade → CB2_InitHofPC): the scene closes back to the PC menu. */
export function BeginHallOfFamePC(game: Game): void {
  sGame = game;
  void preloadHallOfFame().then(() => {
    fieldMenu(game, (close) => {
      sCloseScene = close;
      SetMainCallback2(CB2_InitHofPC);
    }, false);
  });
}

/** CB2_InitHofPC */
export function CB2_InitHofPC(): void {
  switch (gMain.state) {
    default:
    case 0:
      SetVBlankCallback(null);
      ClearVramOamPltt_LoadHofPal();
      sHofGfxPtr = { state: 0, tilemap1: new Uint16Array(0x800), tilemap2: new Uint16Array(0x800) };
      gMain.state = 1;
      break;
    case 1:
      HofInit_ResetGpuBuffersAndLoadConfettiGfx();
      gMain.state++;
      break;
    case 2:
      SetGpuReg(REG_OFFSET_BLDCNT, 0);
      SetGpuReg(REG_OFFSET_BLDALPHA, 0);
      SetGpuReg(REG_OFFSET_BLDY, 0);
      Hof_InitBgs();
      gMain.state++;
      break;
    case 3:
      if (!DrawHofBackground()) {
        BeginPCScreenEffect_TurnOn(0, 0, 0);
        SetVBlankCallback(VBlankCB_HofIdle);
        gMain.state++;
      }
      break;
    case 4:
      tasks.run();
      AnimateSprites();
      BuildOamBuffer();
      UpdatePaletteFade();
      if (!IsPCScreenEffectRunning_TurnOn()) gMain.state++;
      break;
    case 5:
      SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG1 | BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_ALL);
      SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16, 7));
      SetGpuReg(REG_OFFSET_BLDY, 0);
      tasks.create(Task_HofPC_CopySaveData, 0);
      sSavedTeams = [];
      SetMainCallback2(CB2_HofIdle);
      break;
  }
}

function Task_HofPC_CopySaveData(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  CreateTopBarWindowLoadPalette(0, 30, 0, 0x0c, 0x226);
  // LoadGameSave(SAVE_HALL_OF_FAME) != SAVE_STATUS_OK: no saved teams.
  if (GetSavedHofTeams().length === 0) {
    tasks.tasks[taskId].func = Task_HofPC_PrintDataIsCorrupted;
  } else {
    sSavedTeams = GetSavedHofTeams();
    let i: number;
    for (i = 0; i < HALL_OF_FAME_MAX_TEAMS; i++) {
      if (i >= sSavedTeams.length || sSavedTeams[i][0].species === C.SPECIES_NONE) break;
    }

    if (i < HALL_OF_FAME_MAX_TEAMS) data[0] = i - 1;
    else data[0] = HALL_OF_FAME_MAX_TEAMS - 1;

    data[1] = GetGameStat(C.GAME_STAT_ENTERED_HOF);

    tasks.tasks[taskId].func = Task_HofPC_DrawSpritesPrintText;
  }
}

function Task_HofPC_DrawSpritesPrintText(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const savedTeam = sSavedTeams[data[0]];

  sSelectedPaletteIndices = 0;
  data[2] = 0;
  data[4] = 0;

  for (let i = 0; i < PARTY_SIZE; i++) {
    if (savedTeam[i].species !== C.SPECIES_NONE) data[4]++;
  }

  for (let i = 0; i < PARTY_SIZE; i++) {
    const currMon = savedTeam[i];
    if (currMon.species !== C.SPECIES_NONE) {
      let posX: number, posY: number;

      if (data[4] > 3) {
        posX = sHallOfFame_MonFullTeamPositions()[i][2];
        posY = sHallOfFame_MonFullTeamPositions()[i][3];
      } else {
        posX = sHallOfFame_MonHalfTeamPositions()[i][2];
        posY = sHallOfFame_MonHalfTeamPositions()[i][3];
      }

      const spriteId = CreateMonPicSprite_HandleDeoxys(currMon.species, currMon.tid, currMon.personality, true, posX, posY, i, 0xffff);
      gSprites[spriteId].oam.priority = 1;
      data[5 + i] = spriteId;
    } else {
      data[5 + i] = 0xff;
    }
  }

  BlendPalettes(0xffff0000, 0xc, HALL_OF_FAME_BG_PAL);

  stringVars1(intToDecimal(data[1], STR_CONV_MODE_LEFT_ALIGN, 3));
  const hofNumber = expand(txt("gText_HOFNumber"));

  if (data[0] <= 0) TopBarWindowPrintTwoStrings(hofNumber, txt("gText_UPDOWNPick_ABUTTONBBUTTONCancel"), false, 0, true);
  else TopBarWindowPrintTwoStrings(hofNumber, txt("gText_UPDOWNPick_ABUTTONNext_BBUTTONBack"), false, 0, true);

  tasks.tasks[taskId].func = Task_HofPC_PrintMonInfo;
}

function Task_HofPC_PrintMonInfo(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const savedTeam = sSavedTeams[data[0]];

  for (let i = 0; i < PARTY_SIZE; i++) {
    const spriteId = data[5 + i];
    if (spriteId !== 0xff) gSprites[spriteId].oam.priority = 1;
  }

  const currMonId = data[5 + data[2]];
  gSprites[currMonId].oam.priority = 0;
  sSelectedPaletteIndices = ((0x10000 << gSprites[currMonId].oam.paletteNum) ^ 0xffff0000) >>> 0;
  BlendPalettesUnfaded(sSelectedPaletteIndices, 0xc, HALL_OF_FAME_BG_PAL);

  const currMon = savedTeam[data[2]];
  if (currMon.species !== C.SPECIES_EGG) {
    StopCryAndClearCrySongs();
    sound.PlayCry_Normal(currMon.species, 0);
  }
  HallOfFame_PrintMonInfo(currMon, 0, 14);

  tasks.tasks[taskId].func = Task_HofPC_HandleInput;
}

function Task_HofPC_HandleInput(taskId: number): void {
  const data = tasks.tasks[taskId].data;

  if (JOY_NEW(A_BUTTON)) {
    if (data[0] !== 0) { // prepare another team to view
      data[0]--;
      for (let i = 0; i < 6; i++) {
        const spriteId = data[5 + i];
        if (spriteId !== 0xff) FreeAndDestroyMonPicSprite(spriteId);
      }
      if (data[1] !== 0) data[1]--;
      tasks.tasks[taskId].func = Task_HofPC_DrawSpritesPrintText;
    } else { // no more teams to view, turn off hall of fame PC
      if (IsCryPlayingOrClearCrySongs()) {
        StopCryAndClearCrySongs();
        sound.setBgmVolume(0x100);
      }
      tasks.tasks[taskId].func = Task_HofPC_HandlePaletteOnExit;
    }
  } else if (JOY_NEW(B_BUTTON)) { // turn off hall of fame PC
    if (IsCryPlayingOrClearCrySongs()) {
      StopCryAndClearCrySongs();
      sound.setBgmVolume(0x100);
    }
    tasks.tasks[taskId].func = Task_HofPC_HandlePaletteOnExit;
  } else if (JOY_NEW(DPAD_UP) && data[2] !== 0) { // change mon -1
    data[2]--;
    tasks.tasks[taskId].func = Task_HofPC_PrintMonInfo;
  } else if (JOY_NEW(DPAD_DOWN) && data[2] < data[4] - 1) { // change mon +1
    data[2]++;
    tasks.tasks[taskId].func = Task_HofPC_PrintMonInfo;
  }
}

function Task_HofPC_HandlePaletteOnExit(taskId: number): void {
  gPlttBufferUnfaded.set(gPlttBufferFaded);
  BeginPCScreenEffect_TurnOff(0, 0, 0);
  tasks.tasks[taskId].func = Task_HofPC_HandleExit;
}

function Task_HofPC_HandleExit(taskId: number): void {
  if (!IsPCScreenEffectRunning_TurnOff()) {
    HideBg(0);
    HideBg(1);
    HideBg(3);
    DestroyTopBarWindow();
    FreeAllWindowBuffers();
    UnsetBgTilemapBuffer(1);
    UnsetBgTilemapBuffer(3);
    ResetBgsAndClearDma3BusyFlags(false);
    tasks.destroy(taskId);

    sHofGfxPtr = null;
    sSavedTeams = [];

    // ReturnFromHallOfFamePC(): back to the PC menu.
    SetMainCallback2(null);
    SetVBlankCallback(null);
    const close = sCloseScene;
    sCloseScene = null;
    close?.();
    sGame.scriptMenu.pcMenu();
  }
}

function Task_HofPC_PrintDataIsCorrupted(taskId: number): void {
  TopBarWindowPrintString(txt("gText_ABUTTONExit"), 8, true);
  DrawDialogueFrame(0, false);
  AddTextPrinterParameterized2(0, FONT_NORMAL, txt("gText_HOFCorrupted"), 0, null, C.TEXT_COLOR_DARK_GRAY, C.TEXT_COLOR_WHITE, C.TEXT_COLOR_LIGHT_GRAY);
  CopyWindowToVram(0, COPYWIN_FULL);
  tasks.tasks[taskId].func = Task_HofPC_ExitOnButtonPress;
}

function Task_HofPC_ExitOnButtonPress(taskId: number): void {
  if (JOY_NEW(A_BUTTON)) tasks.tasks[taskId].func = Task_HofPC_HandlePaletteOnExit;
}

// gStringVar1 for StringExpandPlaceholders(gStringVar4, gText_HOFNumber)
function stringVars1(s: Uint8Array): void {
  stringVars.var1 = s;
}

function HallOfFame_PrintWelcomeText(_not: number, _used: number): void {
  const x = Math.trunc((0xd0 - stringWidthOf(FONT_NORMAL, txt("gText_WelcomeToHOF"), 0)) / 2) & 0xff;
  FillWindowPixelBuffer(0, PIXEL_FILL(0));
  PutWindowTilemap(0);
  AddTextPrinterParameterized3(0, FONT_NORMAL, x, 1, sTextColors()[0], 0, txt("gText_WelcomeToHOF"));
  CopyWindowToVram(0, COPYWIN_FULL);
}

const CHAR_0 = 0xa1, CHAR_QUESTION_MARK = 0xac, CHAR_SLASH = 0xba, CHAR_MALE = 0xb5, CHAR_FEMALE = 0xb6, CHAR_SPACE = 0x00, CHAR_COLON = 0xf0;

function HallOfFame_PrintMonInfo(currMon: HofMon, _unused1: number, _unused2: number): void {
  FillWindowPixelBuffer(0, PIXEL_FILL(0));
  PutWindowTilemap(0);

  // dex number
  if (currMon.species !== C.SPECIES_EGG) {
    let dexNumber = SpeciesToPokedexNum(currMon.species);
    const text: number[] = [];
    if (dexNumber !== 0xffff) {
      text[0] = Math.trunc(dexNumber / 100) + CHAR_0;
      dexNumber %= 100;
      text[1] = Math.trunc(dexNumber / 10) + CHAR_0;
      text[2] = (dexNumber % 10) + CHAR_0;
    } else {
      text[0] = text[1] = text[2] = CHAR_QUESTION_MARK;
    }
    text[3] = EOS;
    AddTextPrinterParameterized3(0, FONT_NORMAL, 16, 1, sTextColors()[0], 0, concat(txt("gText_Number"), text));
  }

  // nick, species names, gender and lvl
  const nick: number[] = [];
  if (currMon.nick[0] !== EOS) {
    for (let i = 0; i < 10 && currMon.nick[i] !== EOS; i++) nick.push(currMon.nick[i]);
  }
  nick.push(EOS);
  const width = stringWidthOf(FONT_NORMAL, nick, GetFontAttribute(FONT_NORMAL, FONTATTR_LETTER_SPACING));
  let x: number;
  if (currMon.species === C.SPECIES_EGG) x = 0x80 - Math.trunc(width / 2);
  else x = 0x80 - width;
  AddTextPrinterParameterized3(0, FONT_NORMAL, x, 1, sTextColors()[0], 0, nick);
  if (currMon.species !== C.SPECIES_EGG) {
    let gender: number;
    if (currMon.species === C.SPECIES_NIDORAN_M || currMon.species === C.SPECIES_NIDORAN_F) gender = C.MON_GENDERLESS;
    else gender = GetGenderFromSpeciesAndPersonality(currMon.species, currMon.personality);
    let genderChar: number;
    switch (gender) {
      case C.MON_MALE:
        genderChar = CHAR_MALE;
        break;
      case C.MON_FEMALE:
        genderChar = CHAR_FEMALE;
        break;
      default:
        genderChar = CHAR_SPACE;
        break;
    }
    AddTextPrinterParameterized3(0, FONT_NORMAL, 0x80, 1, sTextColors()[0], 0, concat([CHAR_SLASH], speciesName(currMon.species), [genderChar]));

    AddTextPrinterParameterized3(0, FONT_NORMAL, 0x20, 0x11, sTextColors()[0], 0,
      concat(txt("gText_Level"), intToDecimal(currMon.lvl, STR_CONV_MODE_LEFT_ALIGN, 3)));

    AddTextPrinterParameterized3(0, FONT_NORMAL, 0x60, 0x11, sTextColors()[0], 0,
      concat(txt("gText_IDNumber"), intToDecimal(currMon.tid & 0xffff, STR_CONV_MODE_LEADING_ZEROS, 5)));
  }
  CopyWindowToVram(0, COPYWIN_FULL);
}

/** SpeciesToPokedexNum: the national number, or 0xFFFF when it is outside the Kanto dex without the National Dex. */
function SpeciesToPokedexNum(species: number): number {
  const nationalNum = SpeciesToNationalPokedexNum(species);
  if (IsNationalPokedexEnabled()) return nationalNum;
  if (nationalNum <= C.KANTO_DEX_COUNT) return nationalNum;
  return 0xffff;
}

function HallOfFame_PrintPlayerInfo(_unused1: number, _unused2: number): void {
  const textWidth = sWindowTemplate().width * 8 - 6;

  FillWindowPixelBuffer(1, PIXEL_FILL(1));
  PutWindowTilemap(1);
  DrawStdFrameWithCustomTileAndPalette(1, false, 0x21d, 13);
  AddTextPrinterParameterized4(1, FONT_NORMAL, 4, 3, 0, 0, sTextColors()[1], 0, txt("gText_Name"));

  const playerName = Uint8Array.from(save.playerName);
  AddTextPrinterParameterized3(1, FONT_NORMAL, textWidth - stringWidthOf(FONT_NORMAL, playerName, 0), 3, sTextColors()[1], 0, playerName);

  const trainerId = save.trainerId & 0xffff;
  AddTextPrinterParameterized3(1, FONT_NORMAL, 4, 18, sTextColors()[1], 0, txt("gText_IDNumber"));
  const idText = [
    Math.trunc((trainerId % 100000) / 10000) + CHAR_0,
    Math.trunc((trainerId % 10000) / 1000) + CHAR_0,
    Math.trunc((trainerId % 1000) / 100) + CHAR_0,
    Math.trunc((trainerId % 100) / 10) + CHAR_0,
    (trainerId % 10) + CHAR_0,
    EOS,
  ];
  AddTextPrinterParameterized3(1, FONT_NORMAL, textWidth - 30, 18, sTextColors()[1], 0, idText);

  AddTextPrinterParameterized3(1, FONT_NORMAL, 4, 32, sTextColors()[1], 0, txt("gText_MainMenuTime"));
  const seconds = Math.trunc(save.playTimeFrames / 60);
  const playTimeHours = Math.trunc(seconds / 3600);
  const playTimeMinutes = Math.trunc(seconds / 60) % 60;
  const time: number[] = [];
  time[0] = Math.trunc(playTimeHours / 100) + CHAR_0;
  time[1] = Math.trunc((playTimeHours % 100) / 10) + CHAR_0;
  time[2] = (playTimeHours % 10) + CHAR_0;

  if (time[0] === CHAR_0) time[0] = CHAR_SPACE;
  if (time[0] === CHAR_SPACE && time[1] === CHAR_0) time[1] = CHAR_SPACE;

  time[3] = CHAR_COLON;
  time[4] = Math.trunc((playTimeMinutes % 100) / 10) + CHAR_0;
  time[5] = (playTimeMinutes % 10) + CHAR_0;
  time[6] = EOS;

  AddTextPrinterParameterized3(1, FONT_NORMAL, textWidth - 36, 32, sTextColors()[1], 0, time);

  CopyWindowToVram(1, COPYWIN_FULL);
}

function ClearVramOamPltt_LoadHofPal(): void {
  ppu.vram.fill(0);
  ppu.oam.fill(0);
  ppu.pltt.fill(0);
  gPlttBufferUnfaded.fill(0);
  gPlttBufferFaded.fill(0);

  ResetPaletteFade();
  LoadPalette(incbin16("sHallOfFame_Pal"), BG_PLTT_ID(0), 32);
}

function HofInit_ResetGpuBuffersAndLoadConfettiGfx(): void {
  ScanlineEffect_Stop();
  tasks.reset();
  ResetSpriteData();
  // ResetTempTileDataBuffers(): none in the port.
  ResetAllPicSprites();
  FreeAllSpritePalettes();
  spriteState.gReservedSpritePaletteCount = 8;
  const sheets = rd<{ data: { $sym: string }; size: number; tag: number }[]>("sHallOfFame_ConfettiSpriteSheet");
  LoadCompressedSpriteSheet({ data: incbin(sheets[0].data.$sym), size: sheets[0].size, tag: sheets[0].tag });
  const palettes = rd<{ data: { $sym: string }; tag: number }[]>("sHallOfFame_ConfettiSpritePalette");
  LoadSpritePalette({ data: incbin(palettes[0].data.$sym), tag: palettes[0].tag });
}

function Hof_InitBgs(): void {
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, sHof_BgTemplates());
  SetBgTilemapBuffer(1, sHofGfxPtr!.tilemap1);
  SetBgTilemapBuffer(3, sHofGfxPtr!.tilemap2);
  ChangeBgX(0, 0, 0);
  ChangeBgY(0, 0, 0);
  ChangeBgX(1, 0, 0);
  ChangeBgY(1, 0, 0);
  ChangeBgX(3, 0, 0);
  ChangeBgY(3, 0, 0);
}

function DrawHofBackground(): boolean {
  switch (sHofGfxPtr!.state) {
    case 0: {
      const gfx = incbin("sHallOfFame_Gfx"); // DecompressAndCopyTileDataToVram(1, sHallOfFame_Gfx, 0, 0, 0)
      LoadBgTiles(1, gfx, gfx.length, 0);
      break;
    }
    case 1:
      // FreeTempTileDataBuffersIfPossible() is FALSE: nothing pending.
      break;
    case 2:
      FillBgTilemapBufferRect_Palette0(1, 1, 0, 0, 0x20, 2);
      FillBgTilemapBufferRect_Palette0(1, 0, 0, 3, 0x20, 0xb);
      FillBgTilemapBufferRect_Palette0(1, 1, 0, 0xe, 0x20, 6);
      FillBgTilemapBufferRect_Palette0(3, 2, 0, 0, 0x20, 0x20);

      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(3);
      break;
    case 3:
      InitStandardTextBoxWindows();
      InitTextBoxGfxAndPrinters();
      break;
    case 4:
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON);
      ShowBg(0);
      ShowBg(1);
      ShowBg(3);
      sHofGfxPtr!.state = 0;
      return false;
  }

  sHofGfxPtr!.state++;
  return true;
}

function SpriteCB_EndGetOnScreen(_sprite: Sprite): void {
}

function SpriteCB_GetOnScreen(sprite: Sprite): void {
  if (sprite.x !== sprite.data[1] || sprite.y !== sprite.data[2]) {
    if (sprite.x < sprite.data[1]) sprite.x += 15;
    if (sprite.x > sprite.data[1]) sprite.x -= 15;

    if (sprite.y < sprite.data[2]) sprite.y += 10;
    if (sprite.y > sprite.data[2]) sprite.y -= 10;
  } else {
    sprite.data[0] = 1;
    sprite.callback = SpriteCB_EndGetOnScreen;
  }
}

function SpriteCB_Confetti(sprite: Sprite): void {
  if (sprite.y2 > 120) {
    DestroySprite(sprite);
  } else {
    sprite.y2++;
    sprite.y2 += sprite.data[1];

    const tableID = sprite.data[0] & 0xff;
    const rand = (random() % 4) + 8;
    sprite.x2 = Math.trunc((rand * gSineTable[tableID]) / 256);

    sprite.data[0] += 4;
  }
}

function Hof_SpawnConfetti(): boolean {
  const posX = random() % 240;
  const posY = -(random() % 8);

  const template = templateFrom(rd<CSpriteTemplate>("sSpriteTemplate_Confetti"), { SpriteCB_Confetti });
  const spriteId = CreateSprite(template, posX, posY, 0);
  if (spriteId === MAX_SPRITES) return false;
  const sprite = gSprites[spriteId];

  StartSpriteAnim(sprite, random() % 17);

  if (random() & 3) sprite.data[1] = 0;
  else sprite.data[1] = 1;

  return false;
}
