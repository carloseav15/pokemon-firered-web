// teachy_tv.c: the Teachy TV key item. A menu of six programs; each plays a narrated scene of the Pokédude walking
// across a Route 1 backdrop, then runs a scripted demo battle (battle_controller_pokedude.c) or opens the bag with
// a fixed set of items.
import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { A_BUTTON, B_BUTTON, JOY_NEW, SELECT_BUTTON } from "./gba/input";
import { FONT_MALE, FONT_NORMAL } from "./gba/font";
import { tasks } from "./gba/tasks";
import { textFlags } from "./gba/textPrinter";
import { cdata, incbin, incbin16, loadCData, preloadPacks, symName, type SymRef } from "./hw/assets";
import {
  BG_COORD_ADD, BG_COORD_SET, BG_COORD_SUB, type BgTemplate, ChangeBgX, ChangeBgY, CopyToBgTilemapBufferRect_ChangePalette,
  FillBgTilemapBufferRect_Palette0, GetBgTilemapBuffer, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg,
} from "./hw/bg";
import { affineAnimsFrom, animsFrom, oamFrom, subspriteTablesFrom } from "./hw/cdataSprite";
import { SetGpuReg } from "./hw/gpu";
import {
  DestroyListMenuTask, ListMenuGetScrollAndRow, ListMenuInit, ListMenu_ProcessInput, RemoveScrollIndicatorArrowPair, AddScrollIndicatorArrowPair,
  type ListMenu, type ListMenuItem, type ListMenuTemplate, type ScrollArrowsTemplate,
} from "./hw/listMenu";
import {
  ClearScheduledBgCopiesToVram, DoScheduledBgTilemapCopiesToVram, GetTextSpeedSetting, ResetAllBgsCoordinatesAndBgCntRegs,
  RunTextPrinters_CheckActive, ScheduleBgCopyTilemapToVram, SetVBlankHBlankCallbacksToNull,
} from "./hw/menuHelpers";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalettes, gPaletteFade, LoadPalette, PALETTES_ALL, PLTT_SIZE_4BPP, ResetPaletteFade, RGB_BLACK,
  TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import { REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT } from "./hw/ppu";
import { gMain, SetMainCallback2, SetVBlankCallback, type MainCallback } from "./hw/runtime";
import { ScanlineEffect_Stop } from "./hw/scanline";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, DestroySprite, FreeAllSpritePalettes, gSprites, LoadOam, LoadSpritePalette,
  ProcessSpriteCopyRequests, ResetSpriteData, SeekSpriteAnim, SetSubspriteTables, SpriteCallbackDummy, StartSpriteAnim, type Sprite,
  type SpriteFrameImage, type SpriteTemplate,
} from "./hw/sprite";
import { AddTextPrinterParameterized2, DeactivateAllTextPrinters } from "./hw/text";
import {
  ClearWindowTilemap, COPYWIN_GFX, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PutWindowTilemap, type WindowTemplate,
} from "./hw/window";
import { InitPokedudeBagRegister, InitPokedudeBagTMs } from "./bagMenu";
import { SetHelpContextDontCheckBattle } from "./helpSystem";
import { CreateObjectGraphicsSprite } from "./objectEventGraphics";
import { checkBagHasItem } from "./pokemon/items";
import { rom } from "./rom";
import { random as Random } from "./random";
import { save, SV, varSet } from "./save";
import { StartBattleFromHwScene } from "./battle/host";
import { InitPokedudePartyAndOpponent } from "./battle/controller_pokedude";
import { BattleTransitionScene } from "./battle/transition";
import { PlayMapChosenOrBattleBGM } from "./pokemon/battleMusic";
import { G } from "./battle/globals";
import type { Game } from "./game";
import { LoadPlayerParty, SavePlayerParty } from "./loadSave";

export const TTVSCR_BATTLE = 0;
export const TTVSCR_STATUS = 1;
export const TTVSCR_MATCHUPS = 2;
export const TTVSCR_CATCHING = 3;
export const TTVSCR_TMS = 4;
export const TTVSCR_REGISTER = 5;

const BG_SCREEN_SIZE = 0x800;
const F = "teachy_tv";
const tt = <T>(name: string): T => cdata<T>(F, name);

/** struct TeachyTvCtrlBlk */
type TeachyTvCtrlBlk = { callback: MainCallback | null; mode: number; whichScript: number; scrollOffset: number; selectedRow: number };

/** struct TeachyTvBuf */
type TeachyTvBuf = {
  savedCallback: MainCallback | null;
  screenTilemap: Uint16Array;
  buffer2: Uint16Array;
  buffer3: Uint16Array;
  titleTilemap: Uint16Array;
  grassAnimCounterLo: number;
  grassAnimCounterHi: number;
  grassAnimDisabled: number;
  scrollIndicatorArrowPairId: number;
};

const sStaticResources: TeachyTvCtrlBlk = { callback: null, mode: 0, whichScript: 0, scrollOffset: 0, selectedRow: 0 };
let sResources: TeachyTvBuf | null = null;

/** Browser adaptation: the Game and the hardware scene hosting the screen (for the pre-battle transition and the exit). */
let sHost: { game: Game; scene: Game["scene"] } | null = null;
/** Replaces the C's `callback != CB2_BagMenuFromStartMenu` identity check on SELECT. */
let sFromStartMenuBag = false;

const R = (): TeachyTvBuf => sResources!;

type TTVCmd = (taskId: number) => void;

const TTVcmds: Record<string, TTVCmd> = {};
const scriptOf = (name: string): TTVCmd[] => tt<SymRef[]>(name).map((ref) => TTVcmds[symName(ref)!]);

/** Load the graphics and Route 1 layout the screen reads. */
export async function preloadTeachyTv(): Promise<void> {
  await Promise.all([
    loadCData(F, "graphics", "strings", "event_object_movement", "data", "trainer_pokemon_sprites").catch(() => loadCData(F, "graphics", "strings", "event_object_movement", "data")),
    preloadPacks(["graphics_teachy_tv", "graphics_object_events", "graphics_text_window", "graphics_fonts", "graphics_field_effects", "graphics_interface", "graphics_field_effect_objects", "graphics_pokemon_storage", "graphics_pokedude", "graphics_battle_interface", "pokemon"]).catch(() => undefined),
  ]);
  const layout = await rom.loadLayout("LAYOUT_ROUTE1");
  await Promise.all([rom.loadTileset(layout.primary), rom.loadTileset(layout.secondary)]);
}

function TeachyTvCallback(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  DoScheduledBgTilemapCopiesToVram();
  UpdatePaletteFade();
}

function TeachyTvVblankHandler(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

/** InitTeachyTvController */
export function InitTeachyTvController(mode: number, cb: MainCallback | null, fromStartMenuBag = false): void {
  sStaticResources.mode = mode;
  sStaticResources.callback = cb;
  sFromStartMenuBag = fromStartMenuBag;
  if (mode === 0) {
    sStaticResources.scrollOffset = 0;
    sStaticResources.selectedRow = 0;
    sStaticResources.whichScript = TTVSCR_BATTLE;
  }
  if (mode === 1) sStaticResources.mode = 0;
  SetMainCallback2(TeachyTvMainCallback);
}

/** CB2_ReturnToTeachyTV */
export function CB2_ReturnToTeachyTV(): void {
  if (sStaticResources.mode === 1) InitTeachyTvController(1, sStaticResources.callback, sFromStartMenuBag);
  else InitTeachyTvController(2, sStaticResources.callback, sFromStartMenuBag);
}

/** SetTeachyTvControllerModeToResume */
export function SetTeachyTvControllerModeToResume(): void {
  sStaticResources.mode = 1;
}

/** Open the Teachy TV as a hardware scene hosted by the field (the caller has already entered it). */
export function StartTeachyTv(game: Game, done: () => void, fromStartMenuBag = false): void {
  void preloadTeachyTv().then(() => {
    sHost = { game, scene: game.scene };
    InitTeachyTvController(0, done, fromStartMenuBag);
  });
}

function TeachyTvMainCallback(): void {
  switch (gMain.state) {
    case 0:
      sResources = {
        savedCallback: null, screenTilemap: new Uint16Array(BG_SCREEN_SIZE), buffer2: new Uint16Array(BG_SCREEN_SIZE),
        buffer3: new Uint16Array(BG_SCREEN_SIZE), titleTilemap: new Uint16Array(BG_SCREEN_SIZE), grassAnimCounterLo: 0, grassAnimCounterHi: 0,
        grassAnimDisabled: 0, scrollIndicatorArrowPairId: 0xff,
      };
      SetVBlankHBlankCallbacksToNull();
      ClearScheduledBgCopiesToVram();
      ScanlineEffect_Stop();
      FreeAllSpritePalettes();
      ResetPaletteFade();
      ResetSpriteData();
      tasks.reset();
      TeachyTvSetupBg();
      TeachyTvLoadGraphic();
      gMain.state++;
      break;
    case 1: {
      // FreeTempTileDataBuffersIfPossible: the browser backend copies tile data at once.
      TeachyTvCreateAndRenderRbox();
      TeachyTvInitIo();
      if (sStaticResources.mode === 2) {
        const taskId = tasks.create(TeachyTvPostBattleFadeControl, 0);
        tasks.tasks[taskId].data[1] = TeachyTvSetupObjEventAndOam();
        TeachyTvSetupPostBattleWindowAndObj(taskId);
      } else {
        const taskId = tasks.create(TeachyTvOptionListController, 0);
        tasks.tasks[taskId].data[0] = TeachyTvSetupWindow();
        tasks.tasks[taskId].data[1] = TeachyTvSetupObjEventAndOam();
        TeachyTvSetupScrollIndicatorArrowPair();
        sound.playNewMapMusic(C.MUS_TEACHY_TV_MENU);
        TeachyTvSetWindowRegs();
      }
      ScheduleBgCopyTilemapToVram(0);
      ScheduleBgCopyTilemapToVram(1);
      ScheduleBgCopyTilemapToVram(2);
      ScheduleBgCopyTilemapToVram(3);
      SetHelpContextDontCheckBattle(C.HELPCONTEXT_BAG);
      BlendPalettes(PALETTES_ALL, 0x10, 0);
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0x10, 0, 0);
      SetVBlankCallback(TeachyTvVblankHandler);
      SetMainCallback2(TeachyTvCallback);
      break;
    }
  }
}

function TeachyTvSetupBg(): void {
  ResetAllBgsCoordinatesAndBgCntRegs();
  ResetBgsAndClearDma3BusyFlags(0);
  InitBgsFromTemplates(0, tt<BgTemplate[]>("sBgTemplates"), 4);
  SetBgTilemapBuffer(1, R().screenTilemap);
  SetBgTilemapBuffer(2, R().buffer2);
  SetBgTilemapBuffer(3, R().buffer3);
  SetGpuReg(REG_OFFSET_DISPCNT, 0x3040);
  ShowBg(0);
  ShowBg(1);
  ShowBg(2);
  ShowBg(3);
  ChangeBgX(3, 0x1000, BG_COORD_SUB);
  ChangeBgY(3, 0x2800, BG_COORD_ADD);
  R().grassAnimCounterLo = 0;
  R().grassAnimCounterHi = 3;
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
}

function TeachyTvLoadGraphic(): void {
  const src = RGB_BLACK;
  const tiles = incbin("gTeachyTv_Gfx");
  LoadBgTiles(1, tiles, tiles.length, 0);
  R().screenTilemap.set(incbin16("gTeachyTvScreen_Tilemap").subarray(0, BG_SCREEN_SIZE));
  R().titleTilemap.set(incbin16("gTeachyTvTitle_Tilemap").subarray(0, BG_SCREEN_SIZE));
  LoadPalette(incbin16("gTeachyTv_Pal"), BG_PLTT_ID(0), 4 * PLTT_SIZE_4BPP);
  LoadPalette([src], BG_PLTT_ID(0), 2);
  LoadSpritePalette({ data: incbin16("event_object_movement.c:gFieldEffectObjectPalette1"), tag: C.FLDEFF_PAL_TAG_GENERAL_1 });
  TeachyTvLoadBg3Map(R().buffer3);
}

function TeachyTvCreateAndRenderRbox(): void {
  InitWindows(tt<WindowTemplate[]>("sWindowTemplates"));
  DeactivateAllTextPrinters();
  FillWindowPixelBuffer(0, 0xcc);
  PutWindowTilemap(0);
  PutWindowTilemap(1);
  CopyWindowToVram(0, COPYWIN_GFX);
}

function TeachyTvSetupWindow(): number {
  const template: ListMenuTemplate = { ...tt<ListMenuTemplate>("sListMenuTemplate") };
  const resolveItems = (name: string): ListMenuItem[] => tt<Array<{ label: SymRef; index: number }>>(name).map((i) => ({ label: rom.text(symName(i.label)!), index: i.index }));
  template.items = resolveItems("sListMenuItems");
  template.windowId = 1;
  template.moveCursorFunc = TeachyTvAudioByInput;
  if (!checkBagHasItem(C.ITEM_TM_CASE, 1)) {
    template.items = resolveItems("sListMenuItems_NoTMCase");
    template.totalItems = 5;
    template.maxShowed = 5;
    template.upText_Y = (template.upText_Y + 8) & 0xf;
  }
  return ListMenuInit(template, sStaticResources.scrollOffset, sStaticResources.selectedRow);
}

function TeachyTvSetupScrollIndicatorArrowPair(): void {
  if (!checkBagHasItem(C.ITEM_TM_CASE, 1)) {
    R().scrollIndicatorArrowPairId = 0xff;
  } else {
    R().scrollIndicatorArrowPairId = AddScrollIndicatorArrowPair(tt<ScrollArrowsTemplate>("sScrollIndicatorArrowPair"), () => sStaticResources.scrollOffset);
  }
}

function TeachyTvRemoveScrollIndicatorArrowPair(): void {
  if (R().scrollIndicatorArrowPairId !== 0xff) {
    RemoveScrollIndicatorArrowPair(R().scrollIndicatorArrowPairId);
    R().scrollIndicatorArrowPairId = 0xff;
  }
}

function TeachyTvAudioByInput(_notUsed: number, play: boolean, _notUsedAlt: ListMenu): void {
  if (play !== true) sound.playSE(C.SE_SELECT);
}

function TeachyTvInitIo(): void {
  SetGpuReg(REG_OFFSET_WININ, 0x3f);
  SetGpuReg(REG_OFFSET_WINOUT, 0x1f);
  SetGpuReg(REG_OFFSET_BLDCNT, 0xcc);
  SetGpuReg(REG_OFFSET_BLDY, 0x5);
}

function TeachyTvSetupObjEventAndOam(): number {
  const objId = CreateObjectGraphicsSprite(C.OBJ_EVENT_GFX_TEACHY_TV_HOST, SpriteCallbackDummy, 0, 0, 8);
  gSprites[objId].oam.priority = 2;
  gSprites[objId].invisible = true;
  return objId;
}

function TeachyTvSetSpriteCoordsAndSwitchFrame(objId: number, x: number, y: number, frame: number): void {
  gSprites[objId].x2 = x;
  gSprites[objId].y2 = y;
  gSprites[objId].invisible = false;
  StartSpriteAnim(gSprites[objId], frame);
}

function TeachyTvSetWindowRegs(): void {
  SetGpuReg(REG_OFFSET_WIN0V, 0xc64);
  SetGpuReg(REG_OFFSET_WIN0H, 0x1cd4);
}

function TeachyTvClearWindowRegs(): void {
  SetGpuReg(REG_OFFSET_WIN0V, 0x0);
  SetGpuReg(REG_OFFSET_WIN0H, 0x0);
}

function TeachyTvBg2AnimController(): void {
  const tilemapBuffer = GetBgTilemapBuffer(2)!;
  for (let i = 1; i < 13; i++) {
    for (let j = 2; j < 28; j++) tilemapBuffer[32 * i + j] = (((Random() & 3) << 10) + 0x301f) & 0xffff;
  }
  ScheduleBgCopyTilemapToVram(2);
}

function TeachyTvSetupPostBattleWindowAndObj(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const objAddr = gSprites[data[1]];
  ClearWindowTilemap(1);
  TeachyTvClearWindowRegs();
  switch (sStaticResources.whichScript) {
    case TTVSCR_BATTLE:
    case TTVSCR_STATUS:
    case TTVSCR_MATCHUPS:
    case TTVSCR_CATCHING:
      TeachyTvSetSpriteCoordsAndSwitchFrame(data[1], 0x78, 0x38, 0);
      ChangeBgX(3, 0x3000, BG_COORD_ADD);
      ChangeBgY(3, 0x3000, BG_COORD_SUB);
      R().grassAnimCounterLo = (R().grassAnimCounterLo + 3) & 0xff;
      R().grassAnimCounterHi = (R().grassAnimCounterHi - 3) & 0xff;
      break;
    case TTVSCR_TMS:
    case TTVSCR_REGISTER:
      TeachyTvSetSpriteCoordsAndSwitchFrame(data[1], 0x78, 0x38, 0);
      break;
  }
  data[4] = 0;
  data[5] = 0;
  TeachyTvGrassAnimationMain(taskId, objAddr.x2, objAddr.y2, 0, true);
}

function TeachyTvInitTextPrinter(text: ArrayLike<number>): void {
  textFlags.autoScroll = false;
  AddTextPrinterParameterized2(0, FONT_MALE, text, GetTextSpeedSetting(), null, 1, 0xc, 3);
}

function TeachyTvFree(): void {
  sResources = null;
  FreeAllWindowBuffers();
}

function TeachyTvQuitBeginFade(taskId: number): void {
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0x10, 0);
  tasks.tasks[taskId].func = TeachyTvQuitFadeControlAndTaskDel;
}

/** Overworld_PlaySpecialMapMusic: the map's (or saved) music comes back when the field is re-entered. */
function Overworld_PlaySpecialMapMusic(): void {
  const ow = sHost?.game.overworld;
  const music = ow ? ow.savedMusic || ow.header.music : 0;
  if (music && music !== sound.currentBGM) sound.playNewMapMusic(music);
}

function TeachyTvQuitFadeControlAndTaskDel(taskId: number): void {
  if (!gPaletteFade.active) {
    if (R().savedCallback !== null) {
      SetMainCallback2(R().savedCallback);
    } else {
      Overworld_PlaySpecialMapMusic();
      SetMainCallback2(sStaticResources.callback);
    }
    TeachyTvFree();
    tasks.destroy(taskId);
  }
}

function TeachyTvOptionListController(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  TeachyTvBg2AnimController();
  if (!gPaletteFade.active) {
    const input = ListMenu_ProcessInput(data[0]);
    const pos = ListMenuGetScrollAndRow(data[0]);
    sStaticResources.scrollOffset = pos.cursorPos;
    sStaticResources.selectedRow = pos.itemsAbove;
    if (JOY_NEW(SELECT_BUTTON) && !sFromStartMenuBag) {
      sound.playSE(C.SE_SELECT);
      TeachyTvQuitBeginFade(taskId);
    } else {
      switch (input) {
        case -1:
          break;
        case -2:
          sound.playSE(C.SE_SELECT);
          TeachyTvQuitBeginFade(taskId);
          break;
        default: {
          sound.playSE(C.SE_SELECT);
          sStaticResources.whichScript = input;
          const last = DestroyListMenuTask(data[0]);
          sStaticResources.scrollOffset = last.cursorPos;
          sStaticResources.selectedRow = last.itemsAbove;
          TeachyTvClearWindowRegs();
          ClearWindowTilemap(1);
          ScheduleBgCopyTilemapToVram(0);
          TeachyTvRemoveScrollIndicatorArrowPair();
          data[3] = 0;
          data[2] = 0;
          tasks.tasks[taskId].func = TeachyTvRenderMsgAndSwitchClusterFuncs;
          break;
        }
      }
    }
  }
}

TTVcmds.TTVcmd_TransitionRenderBg2TeachyTvGraphicInitNpcPos = function TTVcmd_TransitionRenderBg2TeachyTvGraphicInitNpcPos(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  TeachyTvBg2AnimController();
  if (++data[2] > 63) {
    CopyToBgTilemapBufferRect_ChangePalette(2, R().titleTilemap, 0, 0, 0x20, 0x20, 0x11);
    TeachyTvSetSpriteCoordsAndSwitchFrame(data[1], 8, 0x38, 7);
    ScheduleBgCopyTilemapToVram(2);
    data[2] = 0;
    ++data[3];
    sound.playNewMapMusic(C.MUS_FOLLOW_ME);
  }
};

TTVcmds.TTVcmd_ClearBg2TeachyTvGraphic = function TTVcmd_ClearBg2TeachyTvGraphic(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (++data[2] === 134) {
    FillBgTilemapBufferRect_Palette0(2, 0, 2, 1, 0x1a, 0xc);
    ScheduleBgCopyTilemapToVram(2);
    data[2] = 0;
    ++data[3];
  }
};

TTVcmds.TTVcmd_NpcMoveAndSetupTextPrinter = function TTVcmd_NpcMoveAndSetupTextPrinter(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const spriteAddr = gSprites[data[1]];
  if (data[2] !== 35) {
    ++data[2];
  } else if (spriteAddr.x2 === 0x78) {
    StartSpriteAnim(gSprites[data[1]], 0);
    TeachyTvInitTextPrinter(rom.text("gTeachyTvText_PokedudeSaysHello"));
    data[2] = 0;
    ++data[3];
  } else {
    ++spriteAddr.x2;
  }
};

TTVcmds.TTVcmd_IdleIfTextPrinterIsActive = function TTVcmd_IdleIfTextPrinterIsActive(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (!RunTextPrinters_CheckActive(0)) ++data[3];
};

function TeachyTvRenderMsgAndSwitchClusterFuncs(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (JOY_NEW(B_BUTTON)) {
    R().grassAnimDisabled = 1;
    TeachyTvSetSpriteCoordsAndSwitchFrame(data[1], 0, 0, 0);
    FillWindowPixelBuffer(0, 0xcc);
    CopyWindowToVram(0, COPYWIN_GFX);
    TeachyTvClearBg1EndGraphicText();
    data[2] = 0;
    data[3] = 0;
    tasks.tasks[taskId].func = TTVcmd_End;
  } else {
    const array = ["sBattleScript", "sStatusScript", "sMatchupsScript", "sCatchingScript", "sTMsScript", "sRegisterKeyItemScript"];
    const cluster = scriptOf(array[sStaticResources.whichScript]);
    cluster[data[3]](taskId);
  }
}

TTVcmds.TTVcmd_TextPrinterSwitchStringByOptionChosen = function TTVcmd_TextPrinterSwitchStringByOptionChosen(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const texts = ["gTeachyTvText_BattleScript1", "gTeachyTvText_StatusScript1", "gTeachyTvText_MatchupsScript1", "gTeachyTvText_CatchingScript1", "gTeachyTvText_TMsScript1", "gTeachyTvText_RegisterScript1"];
  TeachyTvInitTextPrinter(rom.text(texts[sStaticResources.whichScript]));
  ++data[3];
};

TTVcmds.TTVcmd_TextPrinterSwitchStringByOptionChosen2 = function TTVcmd_TextPrinterSwitchStringByOptionChosen2(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const texts = ["gTeachyTvText_BattleScript2", "gTeachyTvText_StatusScript2", "gTeachyTvText_MatchupsScript2", "gTeachyTvText_CatchingScript2", "gTeachyTvText_TMsScript2", "gTeachyTvText_RegisterScript2"];
  TeachyTvInitTextPrinter(rom.text(texts[sStaticResources.whichScript]));
  ++data[3];
};

TTVcmds.TTVcmd_IdleIfTextPrinterIsActive2 = function TTVcmd_IdleIfTextPrinterIsActive2(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (!RunTextPrinters_CheckActive(0)) ++data[3];
};

TTVcmds.TTVcmd_EraseTextWindowIfKeyPressed = function TTVcmd_EraseTextWindowIfKeyPressed(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (JOY_NEW(A_BUTTON | B_BUTTON)) {
    FillWindowPixelBuffer(0, 0xcc);
    CopyWindowToVram(0, COPYWIN_GFX);
    ++data[3];
  }
};

TTVcmds.TTVcmd_StartAnimNpcWalkIntoGrass = function TTVcmd_StartAnimNpcWalkIntoGrass(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  StartSpriteAnim(gSprites[data[1]], 5);
  data[2] = 0;
  data[4] = 0;
  data[5] = 1;
  ++data[3];
};

TTVcmds.TTVcmd_DudeMoveUp = function TTVcmd_DudeMoveUp(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const obj = gSprites[data[1]];
  ChangeBgY(3, 0x100, BG_COORD_SUB);
  if (!(++data[2] & 0xf)) {
    R().grassAnimCounterHi = (R().grassAnimCounterHi - 1) & 0xff;
    TeachyTvGrassAnimationMain(taskId, obj.x2, obj.y2, 0, false);
  }
  if (data[2] === 48) {
    data[2] = 0;
    data[4] = -1;
    data[5] = 0;
    StartSpriteAnim(obj, 7);
    ++data[3];
  }
};

TTVcmds.TTVcmd_DudeMoveRight = function TTVcmd_DudeMoveRight(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const obj = gSprites[data[1]];
  ChangeBgX(3, 0x100, BG_COORD_ADD);
  if (!(++data[2] & 0xf)) R().grassAnimCounterLo = (R().grassAnimCounterLo + 1) & 0xff;
  if (!((data[2] + 8) & 0xf)) TeachyTvGrassAnimationMain(taskId, obj.x2 + 8, obj.y2, 0, false);
  if (data[2] === 0x30) {
    data[2] = 0;
    data[4] = 0;
    data[5] = 0;
    StartSpriteAnim(obj, 3);
    ++data[3];
  }
};

TTVcmds.TTVcmd_DudeTurnLeft = function TTVcmd_DudeTurnLeft(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const objAddr = gSprites[data[1]];
  StartSpriteAnim(objAddr, 6);
  ++data[3];
  data[4] = 0;
  data[5] = 0;
  TeachyTvGrassAnimationMain(taskId, objAddr.x2, objAddr.y2, 0, false);
};

TTVcmds.TTVcmd_DudeMoveLeft = function TTVcmd_DudeMoveLeft(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  const objAddr = gSprites[data[1]];
  if (!(objAddr.x2 & 0xf)) TeachyTvGrassAnimationMain(taskId, objAddr.x2 - 8, objAddr.y2, 0, false);
  if (objAddr.x2 === 8) ++data[3];
  else --objAddr.x2;
};

TTVcmds.TTVcmd_RenderAndRemoveBg1EndGraphic = function TTVcmd_RenderAndRemoveBg1EndGraphic(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (!data[2]) {
    CopyToBgTilemapBufferRect_ChangePalette(1, tt<number[]>("sBg1EndGraphic"), 20, 10, 8, 2, 0x11);
    ScheduleBgCopyTilemapToVram(1);
  }
  if (++data[2] > 126) {
    TeachyTvClearBg1EndGraphicText();
    data[2] = 0;
    ++data[3];
  }
};

function TeachyTvClearBg1EndGraphicText(): void {
  FillBgTilemapBufferRect_Palette0(1, 0, 20, 10, 8, 2);
  ScheduleBgCopyTilemapToVram(1);
}

function TTVcmd_End(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (data[2] === 0) sound.playNewMapMusic(C.MUS_TEACHY_TV_MENU);
  TeachyTvBg2AnimController();
  if (++data[2] > 63) {
    data[2] = 0;
    data[3] = 0;
    data[0] = TeachyTvSetupWindow();
    tasks.tasks[taskId].func = TeachyTvOptionListController;
    PutWindowTilemap(0);
    TeachyTvSetupScrollIndicatorArrowPair();
    TeachyTvSetWindowRegs();
    ScheduleBgCopyTilemapToVram(0);
    ChangeBgX(3, 0x0, BG_COORD_SET);
    ChangeBgY(3, 0x0, BG_COORD_SET);
    ChangeBgX(3, 0x1000, BG_COORD_SUB);
    ChangeBgY(3, 0x2800, BG_COORD_ADD);
    R().grassAnimCounterLo = 0;
    R().grassAnimCounterHi = 3;
    R().grassAnimDisabled = 0;
  }
}
TTVcmds.TTVcmd_End = TTVcmd_End;

TTVcmds.TTVcmd_TaskBattleOrFadeByOptionChosen = function TTVcmd_TaskBattleOrFadeByOptionChosen(taskId: number): void {
  switch (sStaticResources.whichScript) {
    case TTVSCR_BATTLE:
    case TTVSCR_STATUS:
    case TTVSCR_MATCHUPS:
    case TTVSCR_CATCHING:
      TeachyTvPrepBattle(taskId);
      break;
    case TTVSCR_TMS:
    case TTVSCR_REGISTER:
      R().savedCallback = TeachyTvSetupBagItemsByOptionChosen;
      TeachyTvQuitBeginFade(taskId);
      break;
  }
};

function TeachyTvSetupBagItemsByOptionChosen(): void {
  if (sStaticResources.whichScript === TTVSCR_TMS) InitPokedudeBagTMs(() => CB2_ReturnToTeachyTV(), SetTeachyTvControllerModeToResume);
  else InitPokedudeBagRegister(() => CB2_ReturnToTeachyTV(), SetTeachyTvControllerModeToResume);
}

function TeachyTvPostBattleFadeControl(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  if (!gPaletteFade.active) {
    data[3] = tt<number[]>("sWhereToReturnToFromBattle")[sStaticResources.whichScript];
    tasks.tasks[taskId].func = TeachyTvRenderMsgAndSwitchClusterFuncs;
  }
}

function TeachyTvGrassAnimationMain(taskId: number, x: number, y: number, subpriority: number, mode: boolean): void {
  if (R().grassAnimDisabled !== 1 && TeachyTvGrassAnimationCheckIfNeedsToGenerateGrassObj(x - 0x10, y)) {
    const spriteId = CreateSprite(tallGrassTemplate(), 0, 0, subpriority);
    const obj = gSprites[spriteId];
    obj.x2 = x;
    obj.y2 = y + 8;
    obj.callback = TeachyTvGrassAnimationObjCallback;
    obj.data[0] = taskId;
    if (mode) {
      SeekSpriteAnim(obj, 4);
      obj.oam.priority = 2;
    } else {
      SetSubspriteTables(obj, subspriteTablesFrom(tt<unknown>("sSubspriteTableArray") as never));
      obj.subspriteTableNum = 0;
      obj.subspriteMode = 1;
    }
  }
}

/** gFieldEffectObjectTemplate_TallGrass with the callback replaced by TeachyTvGrassAnimationObjCallback. */
function tallGrassTemplate(): SpriteTemplate {
  const images: SpriteFrameImage[] = [0, 1, 2, 3, 4].map((frame) => ({ data: incbin("event_object_movement.c:gFieldEffectObjectPic_TallGrass").subarray(frame * 128, frame * 128 + 128), size: 128 }));
  return {
    tileTag: 0xffff, paletteTag: C.FLDEFF_PAL_TAG_GENERAL_1, oam: oamFrom({ $sym: "gObjectEventBaseOam_16x16" }), anims: animsFrom({ $sym: "sAnimTable_TallGrass" }),
    images, affineAnims: affineAnimsFrom(0), callback: SpriteCallbackDummy,
  };
}

function TeachyTvGrassAnimationObjCallback(sprite: Sprite): void {
  const data = tasks.tasks[sprite.data[0]].data;
  const objAddr = gSprites[data[1]];
  if (R().grassAnimDisabled === 1) {
    DestroySprite(sprite);
  } else {
    if (sprite.animCmdIndex === 0) sprite.subspriteTableNum = 1;
    else sprite.subspriteTableNum = 0;
    sprite.x2 += data[4];
    sprite.y2 += data[5];
    if (sprite.animEnded) {
      sprite.subpriority = 0;
      const diff1 = sprite.x2 - objAddr.x2;
      const diff2 = sprite.y2 - objAddr.y2;
      if (diff1 <= -16 || diff1 >= 16 || diff2 <= -16 || diff2 >= 24) DestroySprite(sprite);
    }
  }
}

function TeachyTvGrassAnimationCheckIfNeedsToGenerateGrassObj(x: number, y: number): number {
  if (x < 0 || y < 0) return 0;
  const arr = tt<number[]>("sGrassAnimArray");
  const high = ((y >> 4) + R().grassAnimCounterHi) << 4;
  const low = (x >> 4) + R().grassAnimCounterLo;
  return arr[high + low] ?? 0;
}

function TeachyTvPrepBattle(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  TeachyTvFree();
  varSet(SV.x8004, sStaticResources.whichScript);
  SavePlayerParty();
  InitPokedudePartyAndOpponent();
  PlayMapChosenOrBattleBGM(C.MUS_DUMMY);
  if (sStaticResources.whichScript === TTVSCR_BATTLE) data[6] = C.B_TRANSITION_WHITE_BARS_FADE;
  else data[6] = C.B_TRANSITION_SLICE;
  data[7] = 0;
  tasks.tasks[taskId].func = TeachyTvPreBattleAnimAndSetBattleCallback;
}

let sTransitionDone = false;

function TeachyTvPreBattleAnimAndSetBattleCallback(taskId: number): void {
  const data = tasks.tasks[taskId].data;
  switch (data[7]) {
    case 0: {
      // BattleTransition_StartOnField: the field's canvas transition scene snapshots the frame drawn so far.
      const host = sHost!;
      sTransitionDone = false;
      host.game.scene = new BattleTransitionScene(data[6], host.game.ctx, () => { sTransitionDone = true; });
      host.game.setCallbacks(null, () => host.game.scene?.update());
      ++data[7];
      break;
    }
    case 1:
      if (sTransitionDone) {
        const host = sHost!;
        host.game.scene = host.scene;
        host.game.setCallbacks(null, () => host.scene?.update());
        StartBattleFromHwScene(TeachyTvRestorePlayerPartyCallback);
        tasks.destroy(taskId);
      }
      break;
  }
}

function TeachyTvRestorePlayerPartyCallback(): void {
  LoadPlayerParty();
  if (G.gBattleOutcome === C.B_OUTCOME_DREW) SetTeachyTvControllerModeToResume();
  else sound.playNewMapMusic(C.MUS_FOLLOW_ME);
  CB2_ReturnToTeachyTV();
}

/** TeachyTvLoadBg3Map: draw the top-left part of Route 1 into BG3, with one tile per distinct metatile. */
function TeachyTvLoadBg3Map(buffer: Uint16Array): void {
  const layout = rom.cachedLayout("LAYOUT_ROUTE1")!;
  const primary = rom.cachedTileset(layout.primary)!;
  const secondary = rom.cachedTileset(layout.secondary)!;
  const blockIndicesBuffer = new Uint16Array(0x400);
  const tilesetsBuffer = new Uint8Array(C.NUM_TILES_TOTAL * 32);
  const palIndicesBuffer = new Uint8Array(16).fill(0xff);
  let numMapTilesRows = 0;

  TeachyTvLoadMapTilesetToBuffer(primary.tiles, tilesetsBuffer, 0, C.NUM_TILES_IN_PRIMARY);
  TeachyTvLoadMapTilesetToBuffer(secondary.tiles, tilesetsBuffer, C.NUM_TILES_IN_PRIMARY * 32, C.NUM_TILES_TOTAL - C.NUM_TILES_IN_PRIMARY);

  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 16; j++) {
      const currentBlockIdx = layout.blocks[8 + (i + 6) * layout.width + j] & 0x3ff;
      let k: number;
      for (k = 0; k < (i << 4) + j; k++) {
        if (blockIndicesBuffer[k] === 0) break;
        if (blockIndicesBuffer[k] === currentBlockIdx) break;
      }
      if (blockIndicesBuffer[k] === 0) {
        blockIndicesBuffer[k] = currentBlockIdx;
        numMapTilesRows++;
      }
      TeachyTvPushBackNewMapPalIndexArrayEntry(primary.metatiles, secondary.metatiles, buffer, 64 * i + 2 * j, palIndicesBuffer, currentBlockIdx, k);
    }
  }

  const bgTiles = new Uint8Array(numMapTilesRows * 0x80);
  const mapTilesRowBuffer = new Uint8Array(0x80);
  for (let i = 0; i < numMapTilesRows; i++) {
    mapTilesRowBuffer.fill(0);
    if (blockIndicesBuffer[i] < C.NUM_METATILES_IN_PRIMARY) {
      TeachyTvComputeMapTilesFromTilesetAndMetaTiles(primary.metatiles, blockIndicesBuffer[i] * 8, mapTilesRowBuffer, tilesetsBuffer);
    } else {
      TeachyTvComputeMapTilesFromTilesetAndMetaTiles(secondary.metatiles, (blockIndicesBuffer[i] - C.NUM_METATILES_IN_PRIMARY) * 8, mapTilesRowBuffer, tilesetsBuffer);
    }
    bgTiles.set(mapTilesRowBuffer, i * 0x80);
  }
  LoadBgTiles(3, bgTiles, numMapTilesRows * 0x80, 0);
  TeachyTvLoadMapPalette(primary.palettes, secondary.palettes, palIndicesBuffer);
}

function TeachyTvLoadMapTilesetToBuffer(tiles: Uint8Array, dstBuffer: Uint8Array, dstOffset: number, size: number): void {
  // The exporter decompresses tilesets, so both `isCompressed` branches of the C reduce to this copy.
  dstBuffer.set(tiles.subarray(0, 0x20 * size), dstOffset);
}

function TeachyTvPushBackNewMapPalIndexArrayEntry(
  primaryMetatiles: Uint16Array,
  secondaryMetatiles: Uint16Array,
  buf1: Uint16Array,
  base: number,
  palIndexArray: Uint8Array,
  mapEntry: number,
  offset: number,
): void {
  let metaTiles: Uint16Array;
  let index: number;
  if (mapEntry < C.NUM_METATILES_IN_PRIMARY) {
    metaTiles = primaryMetatiles;
    index = 8 * mapEntry;
  } else {
    metaTiles = secondaryMetatiles;
    index = 8 * (mapEntry - C.NUM_METATILES_IN_PRIMARY);
  }
  buf1[base] = ((TeachyTvComputePalIndexArrayEntryByMetaTile(palIndexArray, metaTiles[index]) << 12) + 4 * offset) & 0xffff;
  buf1[base + 1] = ((TeachyTvComputePalIndexArrayEntryByMetaTile(palIndexArray, metaTiles[index + 1]) << 12) + 4 * offset + 1) & 0xffff;
  buf1[base + 32] = ((TeachyTvComputePalIndexArrayEntryByMetaTile(palIndexArray, metaTiles[index + 2]) << 12) + 4 * offset + 2) & 0xffff;
  buf1[base + 33] = ((TeachyTvComputePalIndexArrayEntryByMetaTile(palIndexArray, metaTiles[index + 3]) << 12) + 4 * offset + 3) & 0xffff;
}

function TeachyTvComputeMapTilesFromTilesetAndMetaTiles(metaTilesArray: Uint16Array, mIndex: number, blockBuf: Uint8Array, tileset: Uint8Array): void {
  const m = (k: number): number => metaTilesArray[mIndex + k];
  const single = (offset: number, entry: number): void =>
    TeachyTvComputeSingleMapTileBlockFromTilesetAndMetaTiles(blockBuf, offset, tileset, 0x20 * (entry & 0x3ff), (entry >> 10) & 3);
  single(0, m(0));
  single(0, m(4));
  single(0x20, m(1));
  single(0x20, m(5));
  single(0x40, m(2));
  single(0x40, m(6));
  single(0x60, m(3));
  single(0x60, m(7));
}

function TeachyTvComputeSingleMapTileBlockFromTilesetAndMetaTiles(blockBuf: Uint8Array, blockOffset: number, tileset: Uint8Array, tileOffset: number, metaTile: number): void {
  let buffer = tileset.slice(tileOffset, tileOffset + 0x20);
  let src = new Uint8Array(0x20);
  if (metaTile & 1) {
    for (let i = 0; i < 8; ++i) {
      for (let j = 0; j < 4; ++j) {
        const offset = (j - 3) & 0xffffffff;
        const value = buffer[(i << 2) - offset];
        src[(i << 2) + j] = ((value & 0xf) << 4) + ((value & 0xf0) >> 4);
      }
    }
    buffer = src.slice();
  }
  if (metaTile & 2) {
    src = new Uint8Array(0x20);
    for (let i = 0; i < 8; ++i) src.set(buffer.subarray(4 * (7 - i), 4 * (7 - i) + 4), 4 * i);
    buffer = src.slice();
  }
  for (let i = 0; i < 32; ++i) {
    if (buffer[i] & 0xf0) blockBuf[blockOffset + i] = (blockBuf[blockOffset + i] & 0xf) + (buffer[i] & 0xf0);
    if (buffer[i] & 0xf) blockBuf[blockOffset + i] = (blockBuf[blockOffset + i] & 0xf0) + (buffer[i] & 0xf);
  }
}

function TeachyTvComputePalIndexArrayEntryByMetaTile(palIndexArrayBuf: Uint8Array, metaTile: number): number {
  let i = 0;
  const pal = metaTile >> 12;
  const firstEntry = palIndexArrayBuf[0];
  if (firstEntry !== pal) {
    if (firstEntry === 0xff) {
      palIndexArrayBuf[0] = pal;
    } else {
      while (++i < 16) {
        const temp = palIndexArrayBuf[i];
        if (temp === pal) break;
        if (temp === 0xff) {
          palIndexArrayBuf[i] = pal;
          break;
        }
      }
    }
  }
  return 0xf - i;
}

function TeachyTvLoadMapPalette(primaryPalettes: number[][][], secondaryPalettes: number[][][], palIndexArray: Uint8Array): void {
  const rgb555 = (c: number[]): number => ((c[0] >> 3) & 31) | (((c[1] >> 3) & 31) << 5) | (((c[2] >> 3) & 31) << 10);
  for (let i = 0; i < 16; i++) {
    if (palIndexArray[i] === 0xff) break;
    const dest = (palIndexArray[i] >= C.NUM_PALS_IN_PRIMARY ? secondaryPalettes : primaryPalettes)[palIndexArray[i]];
    LoadPalette(dest.map(rgb555), BG_PLTT_ID(15 - i), PLTT_SIZE_4BPP);
  }
}
