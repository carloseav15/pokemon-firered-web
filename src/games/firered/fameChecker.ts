// fame_checker.c: the Fame Checker key item screen: person list, flavor-text icon panels, pick mode with the
// spinning Pokéball and person picture, and the unlock state kept in the save (fameChecker[]).
import * as C from "./generated/constants";
import { sound } from "./audio/sound";
import { expandPlaceholders } from "./gba/charmap";
import { FONT_NORMAL, FONT_SMALL, GetStringWidth } from "./gba/font";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, JOY_NEW, SELECT_BUTTON, START_BUTTON } from "./gba/input";
import { tasks } from "./gba/tasks";
import { cdata, incbin, incbin16, loadCData, preloadPacks, symName, type SymRef } from "./hw/assets";
import {
  type BgTemplate, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyToBgTilemapBufferRect, CopyToBgTilemapBufferRect_ChangePalette,
  FillBgTilemapBufferRect, GetBgX, InitBgsFromTemplates, IsDma3ManagerBusyWithBgCopy, LoadBgTiles, ResetBgsAndClearDma3BusyFlags,
  SetBgTilemapBuffer, ShowBg,
} from "./hw/bg";
import { templateFrom, type CSpriteTemplate } from "./hw/cdataSprite";
import { SetGpuReg } from "./hw/gpu";
import {
  AddScrollIndicatorArrowPair, DestroyListMenuTask, ListMenuGetScrollAndRow, ListMenuGetYCoordForPrintingArrowCursor, ListMenuInit,
  ListMenu_ProcessInput, RemoveScrollIndicatorArrowPair, type ListMenu, type ListMenuItem, type ListMenuTemplate, type ScrollArrowsTemplate,
} from "./hw/listMenu";
import { DrawDialogueFrame, GetTextWindowPalette, LoadStdWindowFrameGfx } from "./hw/menu";
import { GetTextSpeedSetting } from "./hw/menuHelpers";
import {
  BeginNormalPaletteFade, gPaletteFade, LoadPalette, OBJ_PLTT_ID, PALETTES_ALL, ResetPaletteFade, TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import {
  BLDCNT_EFFECT_BLEND, BLDCNT_TGT2_BD, BLDCNT_TGT2_BG0, BLDCNT_TGT2_BG1, BLDCNT_TGT2_BG2, BLDCNT_TGT2_BG3, BLDCNT_TGT2_OBJ,
  DISPCNT_BG0_ON, DISPCNT_BG1_ON, DISPCNT_BG2_ON, DISPCNT_BG3_ON, DISPCNT_MODE_0, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, ppu,
  REG_OFFSET_BG0CNT, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BG1CNT, REG_OFFSET_BG1HOFS, REG_OFFSET_BG1VOFS,
  REG_OFFSET_BG2CNT, REG_OFFSET_BG2HOFS, REG_OFFSET_BG2VOFS, REG_OFFSET_BG3CNT, REG_OFFSET_BG3HOFS, REG_OFFSET_BG3VOFS,
  REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V,
  REG_OFFSET_WININ, REG_OFFSET_WINOUT,
} from "./hw/ppu";
import { SetMainCallback2, SetVBlankCallback, gMain } from "./hw/runtime";
import { ScanlineEffect_Stop } from "./hw/scanline";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, DestroySprite, FreeSpriteOamMatrix, FreeSpritePaletteByTag, FreeSpriteTilesByTag,
  LoadOam, LoadSpritePalette, LoadSpriteSheet, MAX_SPRITES, ProcessSpriteCopyRequests, ResetSpriteData, ST_OAM_OBJ_BLEND,
  ST_OAM_OBJ_NORMAL, gSprites, type Sprite,
} from "./hw/sprite";
import { AddTextPrinterParameterized2, AddTextPrinterParameterized4, DeactivateAllTextPrinters, IsTextPrinterActive, RunTextPrinters } from "./hw/text";
import {
  ClearWindowTilemap, COPYWIN_FULL, COPYWIN_GFX, CopyWindowToVram, FillWindowPixelBuffer, FillWindowPixelRect, FreeAllWindowBuffers,
  InitWindows, PIXEL_FILL, PutWindowTilemap, RemoveWindow, type WindowTemplate,
} from "./hw/window";
import { CreateFameCheckerObject, InitObjectEventPalettes } from "./objectEventGraphics";
import { rom } from "./rom";
import { flagGet, save, SV, varGet, varSet } from "./save";
import { CreateTrainerPicSprite, FreeAndDestroyTrainerPicSprite, ResetAllPicSprites } from "./trainerPokemonSprites";
import { spriteState } from "./hw/sprite";

export const NUM_FAMECHECKER_PERSONS = 16;
export const FCPICKSTATE_NO_DRAW = 0;
export const FCPICKSTATE_SILHOUETTE = 1;
export const FCPICKSTATE_COLORED = 2;

export const FCWINDOWID_LIST = 0;
export const FCWINDOWID_UIHELP = 1;
export const FCWINDOWID_MSGBOX = 2;
export const FCWINDOWID_ICONDESC = 3;

const SPRITETAG_SELECTOR_CURSOR = 1000;
const SPRITETAG_QUESTION_MARK = 1001;
const SPRITETAG_SPINNING_POKEBALL = 1002;
const SPRITETAG_SCROLL_INDICATORS = 1004;
const SPRITETAG_DAISY = 1006;
const SPRITETAG_FUJI = 1007;
const SPRITETAG_OAK = 1008;
const SPRITETAG_BILL = 1009;

const FC_NONTRAINER_START = 0xfe00;
const TAG_NONE = 0xffff;
const BG_PLTT_ID = (n: number): number => n * 16;
const PLTT_SIZE_4BPP = 32;
const TASK_NONE = 0xff;

export interface FameEntry {
  pickState: number;
  flavorTextFlags: number;
}

/** gSaveBlock1Ptr->fameChecker. */
export function fameChecker(): FameEntry[] {
  const s = save as unknown as { fameChecker?: FameEntry[] };
  if (!s.fameChecker) {
    s.fameChecker = Array.from({ length: NUM_FAMECHECKER_PERSONS }, () => ({ pickState: FCPICKSTATE_NO_DRAW, flavorTextFlags: 0 }));
    s.fameChecker[C.FAMECHECKER_OAK].pickState = FCPICKSTATE_COLORED;
  }
  return s.fameChecker;
}

/** struct FameCheckerData. */
type FameCheckerData = {
  savedCallback: (() => void) | null;
  /** savedCallback == CB2_BagMenuFromStartMenu (the Fame Checker was opened from the start-menu bag). */
  fromStartMenuBag: boolean;
  listMenuTopIdx: number;
  scrollIndicatorPairTaskId: number;
  personHasUnlockedPanels: boolean;
  inPickMode: boolean;
  numUnlockedPersons: number;
  listMenuTaskId: number;
  listMenuCurIdx: number;
  listMenuTopIdx2: number;
  listMenuDrawnSelIdx: number;
  unlockedPersons: number[];
  spriteIds: number[];
  viewingFlavorText: boolean;
  pickModeOverCancel: boolean;
};

let sBg3TilemapBuffer: Uint16Array | null = null;
let sBg1TilemapBuffer: Uint16Array | null = null;
let sBg2TilemapBuffer: Uint16Array | null = null;
/** fame_checker.c sFameCheckerData (static in C; exported for the headless check). */
export let sFameCheckerData: FameCheckerData | null = null;
let sListMenuItems: ListMenuItem[] = [];
let sLastMenuIdx = 0;
const gFameChecker_ListMenuTemplate: ListMenuTemplate = {
  items: [], moveCursorFunc: null, itemPrintFunc: null, totalItems: 0, maxShowed: 0, windowId: 0, header_X: 0, item_X: 0, cursor_X: 0,
  upText_Y: 0, cursorPal: 0, fillValue: 0, cursorShadowPal: 0, lettersSpacing: 0, itemVerticalPadding: 0, scrollMultiple: 0, fontId: 0, cursorKind: 0,
};
let gIconDescriptionBoxIsOpen = 0;

const D = (): FameCheckerData => sFameCheckerData!;
const fc = <T>(name: string): T => cdata<T>("fame_checker", name);

const sTextColor_White = (): number[] => fc<number[]>("sTextColor_White");
const sTextColor_DkGrey = (): number[] => fc<number[]>("sTextColor_DkGrey");
const sTextColor_Green = (): number[] => fc<number[]>("sTextColor_Green");
const sTrainerIdxs = (): number[] => fc<number[]>("sTrainerIdxs");

function textOf(ref: SymRef): Uint8Array {
  return rom.text(ref.$sym);
}

function tableText(name: string, index: number): Uint8Array {
  return textOf(fc<SymRef[]>(name)[index]);
}

const spriteCallbacks = {
  SpriteCB_FCSpinningPokeball: (sprite: Sprite) => SpriteCB_FCSpinningPokeball(sprite),
};
const spriteTemplate = (name: string) => templateFrom(fc<CSpriteTemplate>(name), spriteCallbacks);

/** Preload all required assets for the Fame Checker. */
export async function preloadFameCheckerAssets(): Promise<void> {
  await Promise.all([
    loadCData("fame_checker", "event_object_movement", "strings", "data"),
    preloadPacks(["graphics_fame_checker", "graphics_object_events", "pokemon", "graphics_text_window", "graphics_fonts"]),
  ]);
}

/** FC_VBlankCallback (fame_checker.c). */
function FC_VBlankCallback(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

/** MainCB2_FameCheckerMain (fame_checker.c). */
function MainCB2_FameCheckerMain(): void {
  tasks.run();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

/** UseFameChecker (fame_checker.c): `savedCallback` is what the C MainCallback would do once the screen closes. */
export function UseFameChecker(savedCallback: (() => void) | null, fromStartMenuBag = false): void {
  SetVBlankCallback(null);
  sFameCheckerData = {
    savedCallback, fromStartMenuBag, listMenuTopIdx: 0, scrollIndicatorPairTaskId: 0, personHasUnlockedPanels: false, inPickMode: false,
    numUnlockedPersons: 0, listMenuTaskId: 0, listMenuCurIdx: 0, listMenuTopIdx2: 0, listMenuDrawnSelIdx: 0,
    unlockedPersons: new Array(NUM_FAMECHECKER_PERSONS + 1).fill(0), spriteIds: new Array(6).fill(0), viewingFlavorText: false,
    pickModeOverCancel: false,
  };
  sound.playSE(C.SE_M_SWIFT);
  SetMainCallback2(MainCB2_LoadFameChecker);
}

/** MainCB2_LoadFameChecker (fame_checker.c). */
function MainCB2_LoadFameChecker(): void {
  switch (gMain.state) {
    case 0:
      SetVBlankCallback(null);
      FCSetup_ClearVideoRegisters();
      gMain.state++;
      break;
    case 1:
      FCSetup_ResetTasksAndSpriteResources();
      gMain.state++;
      break;
    case 2:
      sBg3TilemapBuffer = new Uint16Array(0x400); // 256x256
      sBg1TilemapBuffer = new Uint16Array(0x800); // 512x256
      sBg2TilemapBuffer = new Uint16Array(0x400); // 256x256
      ResetBgsAndClearDma3BusyFlags(0);
      InitBgsFromTemplates(0, fc<BgTemplate[]>("sUIBgTemplates"));
      SetBgTilemapBuffer(3, sBg3TilemapBuffer);
      SetBgTilemapBuffer(2, sBg2TilemapBuffer);
      SetBgTilemapBuffer(1, sBg1TilemapBuffer);
      FCSetup_ResetBGCoords();
      gMain.state++;
      break;
    case 3: {
      const tiles = incbin("gFameCheckerBgTiles");
      LoadBgTiles(3, tiles, tiles.length, 0);
      CopyToBgTilemapBufferRect(3, incbin16("gFameCheckerBg3Tilemap"), 0, 0, 32, 32);
      const pals = incbin("gFameCheckerBgPals");
      LoadPalette(pals.subarray(0, 2 * PLTT_SIZE_4BPP), BG_PLTT_ID(0), 2 * PLTT_SIZE_4BPP);
      LoadPalette(pals.subarray(PLTT_SIZE_4BPP, 2 * PLTT_SIZE_4BPP), BG_PLTT_ID(1), PLTT_SIZE_4BPP);
      CopyToBgTilemapBufferRect(2, incbin16("gFameCheckerBg2Tilemap"), 0, 0, 32, 32);
      CopyToBgTilemapBufferRect_ChangePalette(1, incbin16("fame_checker.c:sFameCheckerTilemap"), 30, 0, 32, 32, 0x11);
      LoadPalette(GetTextWindowPalette(2), BG_PLTT_ID(15), PLTT_SIZE_4BPP);
      gMain.state++;
      break;
    }
    case 4:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        ShowBg(0);
        ShowBg(1);
        ShowBg(2);
        ShowBg(3);
        CopyBgTilemapBufferToVram(3);
        CopyBgTilemapBufferToVram(2);
        CopyBgTilemapBufferToVram(1);
        gMain.state++;
      }
      break;
    case 5:
      InitWindows(fc<WindowTemplate[]>("sUIWindowTemplates"));
      DeactivateAllTextPrinters();
      Setup_DrawMsgAndListBoxes();
      sListMenuItems = Array.from({ length: 17 }, () => ({ label: Uint8Array.of(0xff), index: 0 }));
      FC_CreateListMenu();
      gMain.state++;
      break;
    case 6:
      LoadUISpriteSheetsAndPalettes();
      CreateAllFlavorTextIcons(C.FAMECHECKER_OAK);
      WipeMsgBoxAndTransfer();
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, 0);
      gMain.state++;
      break;
    case 7:
      FCSetup_TurnOnDisplay();
      SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_BG0 | BLDCNT_TGT2_BG1 | BLDCNT_TGT2_BG2 | BLDCNT_TGT2_BG3 | BLDCNT_TGT2_OBJ | BLDCNT_TGT2_BD);
      SetGpuReg(REG_OFFSET_BLDALPHA, 0x07);
      SetGpuReg(REG_OFFSET_BLDY, 0x08);
      SetVBlankCallback(FC_VBlankCallback);
      D().listMenuTopIdx = 0;
      FC_CreateScrollIndicatorArrowPair();
      UpdateInfoBoxTilemap(1, 4);
      tasks.create(Task_WaitFadeOnInit, 0x08);
      SetMainCallback2(MainCB2_FameCheckerMain);
      gMain.state = 0;
      break;
  }
}

/** LoadUISpriteSheetsAndPalettes (fame_checker.c). */
function LoadUISpriteSheetsAndPalettes(): void {
  for (const sheet of fc<Array<{ data?: SymRef; size?: number; tag?: number }>>("sUISpriteSheets")) {
    if (!sheet.data) break;
    LoadSpriteSheet({ data: incbin(`fame_checker.c:${symName(sheet.data)}`), size: sheet.size!, tag: sheet.tag! });
  }
  for (const pal of fc<Array<{ data?: SymRef; tag?: number }>>("sUISpritePalettes")) {
    if (!pal.data) break;
    LoadSpritePalette({ data: incbin(`fame_checker.c:${symName(pal.data)}`), tag: pal.tag! });
  }
}

/** Task_WaitFadeOnInit (fame_checker.c). */
function Task_WaitFadeOnInit(taskId: number): void {
  if (!gPaletteFade.active) tasks.setFunc(taskId, Task_TopMenuHandleInput);
}

/** Task_TopMenuHandleInput (fame_checker.c). */
function Task_TopMenuHandleInput(taskId: number): void {
  const data = tasks.data(taskId);
  if (tasks.findByFunc(Task_FCOpenOrCloseInfoBox) === TASK_NONE) {
    RunTextPrinters();
    if (JOY_NEW(SELECT_BUTTON) && !D().inPickMode && !D().fromStartMenuBag) {
      tasks.setFunc(taskId, Task_StartToCloseFameChecker);
    } else if (JOY_NEW(START_BUTTON)) {
      const cursorPos = FameCheckerGetCursorY();
      if (TryExitPickMode(taskId)) {
        sound.playSE(C.SE_M_LOCK_ON);
      } else if (cursorPos !== D().numUnlockedPersons - 1) { // anything but CANCEL
        sound.playSE(C.SE_M_LOCK_ON);
        FillWindowPixelRect(FCWINDOWID_ICONDESC, PIXEL_FILL(0), 0, 0, 88, 32);
        FC_PutWindowTilemapAndCopyWindowToVramMode3(FCWINDOWID_ICONDESC);
        UpdateInfoBoxTilemap(2, 4);
        UpdateInfoBoxTilemap(1, 5);
        PrintUIHelp(1);
        data[2] = CreatePersonPicSprite(D().unlockedPersons[cursorPos]);
        gSprites[data[2]].x2 = 0xf0;
        gSprites[data[2]].data[0] = 1;
        data[3] = CreateSpinningPokeballSprite();
        gSprites[data[3]].x2 = 0xf0;
        gSprites[data[3]].data[0] = 1;
        tasks.setFunc(taskId, Task_EnterPickMode);
      }
    } else if (JOY_NEW(A_BUTTON)) {
      const cursorPos = ListMenu_ProcessInput(D().listMenuTaskId);
      if (cursorPos === D().numUnlockedPersons - 1) { // CANCEL
        tasks.setFunc(taskId, Task_StartToCloseFameChecker);
      } else if (D().inPickMode) {
        if (!IsTextPrinterActive(2) && HasUnlockedAllFlavorTextsForCurrentPerson()) GetPickModeText();
      } else if (D().personHasUnlockedPanels) {
        sound.playSE(C.SE_SELECT);
        data[0] = CreateFlavorTextIconSelectorCursorSprite(data[1]);
        for (let i = 0; i < 6; i++) {
          if (i !== data[1]) SetMessageSelectorIconObjMode(D().spriteIds[i], ST_OAM_OBJ_BLEND);
        }
        gIconDescriptionBoxIsOpen = 0xff;
        PlaceListMenuCursor(false);
        PrintUIHelp(2);
        if (gSprites[D().spriteIds[data[1]]].data[1] !== 0xff) { // not a ? tile
          PrintSelectedNameInBrightGreen(taskId);
          UpdateIconDescriptionBox(data[1]);
        }
        FreeListMenuSelectorArrowPairResources();
        tasks.setFunc(taskId, Task_FlavorTextDisplayHandleInput);
      }
    } else if (JOY_NEW(B_BUTTON)) {
      if (!TryExitPickMode(taskId)) tasks.setFunc(taskId, Task_StartToCloseFameChecker);
    } else {
      ListMenu_ProcessInput(D().listMenuTaskId);
    }
  }
}

/** TryExitPickMode (fame_checker.c). */
function TryExitPickMode(taskId: number): boolean {
  const data = tasks.data(taskId);
  if (D().inPickMode) {
    gSprites[data[2]].data[0] = 2;
    gSprites[data[2]].x2 += 10;
    gSprites[data[3]].data[0] = 2;
    gSprites[data[3]].x2 += 10;
    WipeMsgBoxAndTransfer();
    tasks.setFunc(taskId, Task_ExitPickMode);
    MessageBoxPrintEmptyText();
    D().pickModeOverCancel = false;
    return true;
  }
  return false;
}

/** MessageBoxPrintEmptyText (fame_checker.c). */
function MessageBoxPrintEmptyText(): void {
  AddTextPrinterParameterized2(FCWINDOWID_MSGBOX, FONT_NORMAL, rom.text("gFameCheckerText_ClearTextbox"), 0, null, C.TEXT_COLOR_DARK_GRAY, C.TEXT_COLOR_WHITE, C.TEXT_COLOR_LIGHT_GRAY);
}

/** Task_EnterPickMode (fame_checker.c). */
function Task_EnterPickMode(taskId: number): void {
  const data = tasks.data(taskId);
  if (gSprites[data[2]].data[0] === 0) {
    GetPickModeText();
    D().inPickMode = true;
    tasks.setFunc(taskId, Task_TopMenuHandleInput);
  } else {
    ChangeBgX(1, 0xa00, 1);
  }
}

/** Task_ExitPickMode (fame_checker.c). */
function Task_ExitPickMode(taskId: number): void {
  const data = tasks.data(taskId);
  if (GetBgX(1) !== 0) ChangeBgX(1, 0xa00, 2);
  else ChangeBgX(1, 0x000, 0);
  if (gSprites[data[2]].data[0] === 0) {
    if (D().personHasUnlockedPanels) PrintUIHelp(0);
    UpdateInfoBoxTilemap(1, 4);
    UpdateInfoBoxTilemap(2, 2);
    D().inPickMode = false;
    DestroyPersonPicSprite(taskId, FameCheckerGetCursorY());
    tasks.setFunc(taskId, Task_TopMenuHandleInput);
    gSprites[data[3]].callback = SpriteCB_DestroySpinningPokeball;
  }
}

/** Task_FlavorTextDisplayHandleInput (fame_checker.c). */
function Task_FlavorTextDisplayHandleInput(taskId: number): void {
  const data = tasks.data(taskId);
  RunTextPrinters();
  if (JOY_NEW(A_BUTTON) && !IsTextPrinterActive(2)) {
    const spriteId = D().spriteIds[data[1]];
    if (gSprites[spriteId].data[1] !== 0xff) PrintSelectedNameInBrightGreen(taskId);
  }
  if (JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    for (let i = 0; i < 6; i++) SetMessageSelectorIconObjMode(D().spriteIds[i], ST_OAM_OBJ_NORMAL);
    WipeMsgBoxAndTransfer();
    gSprites[data[0]].callback = SpriteCB_DestroyFlavorTextIconSelectorCursor;
    if (gIconDescriptionBoxIsOpen !== 0xff) UpdateIconDescriptionBoxOff();
    PlaceListMenuCursor(true);
    PrintUIHelp(0);
    FC_CreateScrollIndicatorArrowPair();
    MessageBoxPrintEmptyText();
    tasks.setFunc(taskId, Task_TopMenuHandleInput);
  } else if (JOY_NEW(DPAD_UP) || JOY_NEW(DPAD_DOWN)) {
    if (data[1] >= 3) {
      data[1] -= 3;
      FC_MoveSelectorCursor(taskId, 0, -0x1b);
    } else {
      data[1] += 3;
      FC_MoveSelectorCursor(taskId, 0, +0x1b);
    }
  } else if (JOY_NEW(DPAD_LEFT)) {
    if (data[1] === 0 || data[1] % 3 === 0) {
      data[1] += 2;
      FC_MoveSelectorCursor(taskId, +0x5e, 0);
    } else {
      data[1]--;
      FC_MoveSelectorCursor(taskId, -0x2f, 0);
    }
  } else if (JOY_NEW(DPAD_RIGHT)) {
    if ((data[1] + 1) % 3 === 0) {
      data[1] -= 2;
      FC_MoveSelectorCursor(taskId, -0x5e, 0);
    } else {
      data[1]++;
      FC_MoveSelectorCursor(taskId, +0x2f, 0);
    }
  }
}

/** FC_MoveSelectorCursor (fame_checker.c). */
function FC_MoveSelectorCursor(taskId: number, dx: number, dy: number): void {
  const data = tasks.data(taskId);
  sound.playSE(C.SE_M_SWAGGER2);
  gSprites[data[0]].x += dx;
  gSprites[data[0]].y += dy;
  for (let i = 0; i < 6; i++) SetMessageSelectorIconObjMode(D().spriteIds[i], ST_OAM_OBJ_BLEND);
  FillWindowPixelRect(FCWINDOWID_MSGBOX, PIXEL_FILL(1), 0, 0, 0xd0, 0x20);
  MessageBoxPrintEmptyText();
  if (SetMessageSelectorIconObjMode(D().spriteIds[data[1]], ST_OAM_OBJ_NORMAL)) {
    PrintSelectedNameInBrightGreen(taskId);
    UpdateIconDescriptionBox(data[1]);
  } else if (gIconDescriptionBoxIsOpen !== 0xff) {
    UpdateIconDescriptionBoxOff();
  }
}

/** GetPickModeText (fame_checker.c). */
function GetPickModeText(): void {
  let whichText = 0;
  const who = FameCheckerGetCursorY();
  if (fameChecker()[D().unlockedPersons[who]].pickState !== FCPICKSTATE_COLORED) {
    WipeMsgBoxAndTransfer();
    MessageBoxPrintEmptyText();
  } else {
    FillWindowPixelRect(FCWINDOWID_MSGBOX, PIXEL_FILL(1), 0, 0, 0xd0, 0x20);
    if (HasUnlockedAllFlavorTextsForCurrentPerson()) whichText = NUM_FAMECHECKER_PERSONS;
    const text = expandPlaceholders(tableText("sFameCheckerNameAndQuotesPointers", D().unlockedPersons[who] + whichText));
    AddTextPrinterParameterized2(FCWINDOWID_MSGBOX, FONT_NORMAL, text, GetTextSpeedSetting(), null, C.TEXT_COLOR_DARK_GRAY, C.TEXT_COLOR_WHITE, C.TEXT_COLOR_LIGHT_GRAY);
    FC_PutWindowTilemapAndCopyWindowToVramMode3(FCWINDOWID_MSGBOX);
  }
}

/** PrintSelectedNameInBrightGreen (fame_checker.c). */
function PrintSelectedNameInBrightGreen(taskId: number): void {
  const data = tasks.data(taskId);
  const cursorPos = FameCheckerGetCursorY();
  FillWindowPixelRect(FCWINDOWID_MSGBOX, PIXEL_FILL(1), 0, 0, 0xd0, 0x20);
  const text = expandPlaceholders(tableText("sFameCheckerFlavorTextPointers", D().unlockedPersons[cursorPos] * 6 + data[1]));
  AddTextPrinterParameterized2(FCWINDOWID_MSGBOX, FONT_NORMAL, text, GetTextSpeedSetting(), null, C.TEXT_COLOR_DARK_GRAY, C.TEXT_COLOR_WHITE, C.TEXT_COLOR_LIGHT_GRAY);
  FC_PutWindowTilemapAndCopyWindowToVramMode3(FCWINDOWID_MSGBOX);
}

/** WipeMsgBoxAndTransfer (fame_checker.c). */
function WipeMsgBoxAndTransfer(): void {
  FillWindowPixelRect(FCWINDOWID_MSGBOX, PIXEL_FILL(1), 0, 0, 0xd0, 0x20);
  FC_PutWindowTilemapAndCopyWindowToVramMode3(FCWINDOWID_MSGBOX);
}

/** Setup_DrawMsgAndListBoxes (fame_checker.c). */
function Setup_DrawMsgAndListBoxes(): void {
  LoadStdWindowFrameGfx();
  DrawDialogueFrame(FCWINDOWID_MSGBOX, true);
  FC_PutWindowTilemapAndCopyWindowToVramMode3(FCWINDOWID_MSGBOX);
  FC_PutWindowTilemapAndCopyWindowToVramMode3(FCWINDOWID_LIST);
}

/** FC_PutWindowTilemapAndCopyWindowToVramMode3 (fame_checker.c). */
function FC_PutWindowTilemapAndCopyWindowToVramMode3(windowId: number): void {
  PutWindowTilemap(windowId);
  CopyWindowToVram(windowId, COPYWIN_FULL);
}

/** SetMessageSelectorIconObjMode (fame_checker.c). */
function SetMessageSelectorIconObjMode(spriteId: number, objMode: number): boolean {
  if (gSprites[spriteId].data[1] !== 0xff) {
    gSprites[spriteId].oam.objMode = objMode;
    return true;
  }
  return false;
}

/** Task_StartToCloseFameChecker (fame_checker.c). */
function Task_StartToCloseFameChecker(taskId: number): void {
  sound.playSE(C.SE_M_SWIFT);
  BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, 0);
  tasks.setFunc(taskId, Task_DestroyAssetsAndCloseFameChecker);
}

/** Task_DestroyAssetsAndCloseFameChecker (fame_checker.c). */
function Task_DestroyAssetsAndCloseFameChecker(taskId: number): void {
  if (!gPaletteFade.active) {
    const data = tasks.data(taskId);
    if (D().inPickMode) {
      DestroyPersonPicSprite(taskId, FameCheckerGetCursorY());
      FreeSpriteOamMatrix(gSprites[data[3]]);
      DestroySprite(gSprites[data[3]]);
    }
    for (let i = 0; i < 6; i++) DestroySprite(gSprites[D().spriteIds[i]]);
    FreeNonTrainerPicTiles();
    FreeSpinningPokeballSpriteResources();
    FreeSelectionCursorSpriteResources();
    FreeQuestionMarkSpriteResources();
    FreeListMenuSelectorArrowPairResources();
    const savedCallback = D().savedCallback;
    DestroyListMenuTask(D().listMenuTaskId);
    sBg3TilemapBuffer = null;
    sBg1TilemapBuffer = null;
    sBg2TilemapBuffer = null;
    sFameCheckerData = null;
    sListMenuItems = [];
    FC_DestroyWindow(FCWINDOWID_LIST);
    FC_DestroyWindow(FCWINDOWID_UIHELP);
    FC_DestroyWindow(FCWINDOWID_MSGBOX);
    FC_DestroyWindow(FCWINDOWID_ICONDESC);
    FreeAllWindowBuffers();
    tasks.destroy(taskId);
    // SetMainCallback2(sFameCheckerData->savedCallback): the caller's return path runs now.
    SetMainCallback2(null);
    savedCallback?.();
  }
}

/** FC_DestroyWindow (fame_checker.c). */
function FC_DestroyWindow(windowId: number): void {
  FillWindowPixelBuffer(windowId, 0);
  ClearWindowTilemap(windowId);
  CopyWindowToVram(windowId, COPYWIN_GFX);
  RemoveWindow(windowId);
}

/** AdjustGiovanniIndexIfBeatenInGym (fame_checker.c). */
export function AdjustGiovanniIndexIfBeatenInGym(a0: number): number {
  a0 &= 0xff;
  if (flagGet(C.TRAINER_FLAGS_START + C.TRAINER_LEADER_GIOVANNI)) {
    if (a0 === 9) return C.FAMECHECKER_GIOVANNI;
    if (a0 > 9) return (a0 - 1) & 0xff;
  }
  return a0;
}

/** PrintUIHelp (fame_checker.c). */
function PrintUIHelp(state: number): void {
  let src = rom.text("gFameCheckerText_MainScreenUI");
  if (state !== 0) {
    src = rom.text("gFameCheckerText_FlavorTextUI");
    if (state === 1) src = rom.text("gFameCheckerText_PickScreenUI");
  }
  const width = GetStringWidth(FONT_SMALL, src, 0);
  FillWindowPixelRect(FCWINDOWID_UIHELP, PIXEL_FILL(0), 0, 0, 0xc0, 0x10);
  AddTextPrinterParameterized4(FCWINDOWID_UIHELP, FONT_SMALL, 188 - width, 0, 0, 2, sTextColor_White(), -1, src);
  FC_PutWindowTilemapAndCopyWindowToVramMode3(FCWINDOWID_UIHELP);
}

/** DestroyAllFlavorTextIcons (fame_checker.c). */
function DestroyAllFlavorTextIcons(): void {
  for (let i = 0; i < 6; i++) DestroySprite(gSprites[D().spriteIds[i]]);
}

/** CreateAllFlavorTextIcons (fame_checker.c). */
function CreateAllFlavorTextIcons(who: number): boolean {
  let result = false;
  const gfxIds = fc<number[]>("sFameCheckerArrayNpcGraphicsIds");
  for (let i = 0; i < 6; i++) {
    if ((fameChecker()[D().unlockedPersons[who]].flavorTextFlags >> i) & 1) {
      D().spriteIds[i] = CreateFameCheckerObject(gfxIds[D().unlockedPersons[who] * 6 + i], i, 47 * (i % 3) + 0x72, 27 * Math.trunc(i / 3) + 0x2f);
      result = true;
    } else {
      D().spriteIds[i] = PlaceQuestionMarkTile(47 * (i % 3) + 0x72, 27 * Math.trunc(i / 3) + 0x1f);
      gSprites[D().spriteIds[i]].data[1] = 0xff;
    }
  }
  if (result) {
    D().personHasUnlockedPanels = true;
    if (D().inPickMode) PrintUIHelp(1);
    else PrintUIHelp(0);
  } else {
    D().personHasUnlockedPanels = false;
    PrintUIHelp(1);
  }
  return result;
}

/** ResetFameChecker (fame_checker.c). */
export function ResetFameChecker(): void {
  const entries = fameChecker();
  for (let i = 0; i < NUM_FAMECHECKER_PERSONS; i++) {
    entries[i].pickState = FCPICKSTATE_NO_DRAW;
    entries[i].flavorTextFlags = 0;
  }
  entries[C.FAMECHECKER_OAK].pickState = FCPICKSTATE_COLORED;
}
export const resetFameChecker = ResetFameChecker;

/** FullyUnlockFameChecker (fame_checker.c). */
export function FullyUnlockFameChecker(): void {
  const entries = fameChecker();
  for (let i = 0; i < NUM_FAMECHECKER_PERSONS; i++) {
    entries[i].pickState = FCPICKSTATE_COLORED;
    for (let j = 0; j < 6; j++) entries[i].flavorTextFlags |= 1 << j;
  }
}
export const fullyUnlockFameChecker = FullyUnlockFameChecker;

/** FCSetup_ClearVideoRegisters (fame_checker.c). */
function FCSetup_ClearVideoRegisters(): void {
  ppu.vram.fill(0);
  ppu.oam.fill(0);
  ppu.pltt.fill(0);
  for (const reg of [
    REG_OFFSET_DISPCNT, REG_OFFSET_BG0CNT, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BG1CNT, REG_OFFSET_BG1HOFS,
    REG_OFFSET_BG1VOFS, REG_OFFSET_BG2CNT, REG_OFFSET_BG2HOFS, REG_OFFSET_BG2VOFS, REG_OFFSET_BG3CNT, REG_OFFSET_BG3HOFS,
    REG_OFFSET_BG3VOFS, REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT, REG_OFFSET_BLDCNT,
    REG_OFFSET_BLDALPHA, REG_OFFSET_BLDY,
  ]) SetGpuReg(reg, 0);
}

/** FCSetup_ResetTasksAndSpriteResources (fame_checker.c). */
function FCSetup_ResetTasksAndSpriteResources(): void {
  ScanlineEffect_Stop();
  tasks.reset();
  ResetSpriteData();
  ResetAllPicSprites();
  ResetPaletteFade();
  InitObjectEventPalettes(0);
  spriteState.gReservedSpritePaletteCount = 7;
}

/** FCSetup_TurnOnDisplay (fame_checker.c). */
function FCSetup_TurnOnDisplay(): void {
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_BG0_ON | DISPCNT_BG1_ON | DISPCNT_BG2_ON | DISPCNT_BG3_ON | DISPCNT_OBJ_ON);
}

/** FCSetup_ResetBGCoords (fame_checker.c). */
function FCSetup_ResetBGCoords(): void {
  for (let bg = 0; bg < 4; bg++) {
    ChangeBgX(bg, 0, 0);
    ChangeBgY(bg, 0, 0);
  }
}

/** SetFlavorTextFlagFromSpecialVars (fame_checker.c). */
export function SetFlavorTextFlagFromSpecialVars(): void {
  if (varGet(SV.x8004) < NUM_FAMECHECKER_PERSONS && varGet(SV.x8005) < 6) {
    fameChecker()[varGet(SV.x8004)].flavorTextFlags |= 1 << varGet(SV.x8005);
    varSet(SV.x8005, FCPICKSTATE_SILHOUETTE);
    UpdatePickStateFromSpecialVar8005();
  }
}
export const setFlavorTextFlagFromSpecialVars = SetFlavorTextFlagFromSpecialVars;

/** UpdatePickStateFromSpecialVar8005 (fame_checker.c). */
export function UpdatePickStateFromSpecialVar8005(): void {
  if (varGet(SV.x8004) < NUM_FAMECHECKER_PERSONS && varGet(SV.x8005) < 3) {
    if (varGet(SV.x8005) === FCPICKSTATE_NO_DRAW) return;
    if (varGet(SV.x8005) === FCPICKSTATE_SILHOUETTE && fameChecker()[varGet(SV.x8004)].pickState === FCPICKSTATE_COLORED) return;
    fameChecker()[varGet(SV.x8004)].pickState = varGet(SV.x8005);
  }
}
export const updatePickStateFromSpecialVar8005 = UpdatePickStateFromSpecialVar8005;

/** HasUnlockedAllFlavorTextsForCurrentPerson (fame_checker.c). */
function HasUnlockedAllFlavorTextsForCurrentPerson(): boolean {
  const who = D().unlockedPersons[FameCheckerGetCursorY()];
  for (let i = 0; i < 6; i++) if (!((fameChecker()[who].flavorTextFlags >> i) & 1)) return false;
  return true;
}

/** FreeSelectionCursorSpriteResources (fame_checker.c). */
function FreeSelectionCursorSpriteResources(): void {
  FreeSpriteTilesByTag(SPRITETAG_SELECTOR_CURSOR);
  FreeSpritePaletteByTag(SPRITETAG_SELECTOR_CURSOR);
}

/** CreateFlavorTextIconSelectorCursorSprite (fame_checker.c). */
function CreateFlavorTextIconSelectorCursorSprite(where: number): number {
  const y = 34 + 27 * (where >= 3 ? 1 : 0);
  const x = 114 + 47 * (where % 3);
  return CreateSprite(spriteTemplate("sSpriteTemplate_SelectorCursor"), x, y, 0);
}

/** SpriteCB_DestroyFlavorTextIconSelectorCursor (fame_checker.c). */
function SpriteCB_DestroyFlavorTextIconSelectorCursor(sprite: Sprite): void {
  DestroySprite(sprite);
}

/** FreeQuestionMarkSpriteResources (fame_checker.c). */
function FreeQuestionMarkSpriteResources(): void {
  FreeSpriteTilesByTag(SPRITETAG_QUESTION_MARK);
}

/** PlaceQuestionMarkTile (fame_checker.c). */
function PlaceQuestionMarkTile(x: number, y: number): number {
  const spriteId = CreateSprite(spriteTemplate("sQuestionMarkTileSpriteTemplate"), x, y, 8);
  gSprites[spriteId].oam.priority = 2;
  gSprites[spriteId].oam.paletteNum = 2;
  return spriteId;
}

/** FreeSpinningPokeballSpriteResources (fame_checker.c). */
function FreeSpinningPokeballSpriteResources(): void {
  FreeSpriteTilesByTag(SPRITETAG_SPINNING_POKEBALL);
  FreeSpritePaletteByTag(SPRITETAG_SPINNING_POKEBALL);
}

/** CreateSpinningPokeballSprite (fame_checker.c). */
function CreateSpinningPokeballSprite(): number {
  return CreateSprite(spriteTemplate("sSpinningPokeballSpriteTemplate"), 0xe2, 0x42, 0);
}

/** SpriteCB_DestroySpinningPokeball (fame_checker.c). */
function SpriteCB_DestroySpinningPokeball(sprite: Sprite): void {
  FreeSpriteOamMatrix(sprite);
  DestroySprite(sprite);
}

/** FreeNonTrainerPicTiles (fame_checker.c). */
function FreeNonTrainerPicTiles(): void {
  FreeSpriteTilesByTag(SPRITETAG_DAISY);
  FreeSpriteTilesByTag(SPRITETAG_FUJI);
  FreeSpriteTilesByTag(SPRITETAG_OAK);
  FreeSpriteTilesByTag(SPRITETAG_BILL);
}

/** SpriteCB_FCSpinningPokeball (fame_checker.c). */
function SpriteCB_FCSpinningPokeball(sprite: Sprite): void {
  if (sprite.data[0] === 1) {
    if (sprite.x2 - 10 < 0) {
      sprite.x2 = 0;
      sprite.data[0] = 0;
    } else {
      sprite.x2 -= 10;
    }
  } else if (sprite.data[0] === 2) {
    if (sprite.x2 > 240) {
      sprite.x2 = 240;
      sprite.data[0] = 0;
    } else {
      sprite.x2 += 10;
    }
  }
}

const PERSON_PAL_NUM = 6;
const PERSON_X = 148;
const PERSON_Y = 66;

/** CreatePersonPicSprite (fame_checker.c). */
function CreatePersonPicSprite(fcPersonIdx: number): number {
  let spriteId: number;
  const loadPersonPal = (symbol: string): void => {
    const pal = incbin(`fame_checker.c:${symbol}`);
    LoadPalette(pal, OBJ_PLTT_ID(PERSON_PAL_NUM), pal.length);
    gSprites[spriteId].oam.paletteNum = PERSON_PAL_NUM;
  };
  if (fcPersonIdx === C.FAMECHECKER_DAISY) {
    spriteId = CreateSprite(spriteTemplate("sDaisySpriteTemplate"), PERSON_X, PERSON_Y, 0);
    loadPersonPal("sDaisySpritePalette");
  } else if (fcPersonIdx === C.FAMECHECKER_MRFUJI) {
    spriteId = CreateSprite(spriteTemplate("sFujiSpriteTemplate"), PERSON_X, PERSON_Y, 0);
    loadPersonPal("sFujiSpritePalette");
  } else if (fcPersonIdx === C.FAMECHECKER_OAK) {
    spriteId = CreateSprite(spriteTemplate("sOakSpriteTemplate"), PERSON_X, PERSON_Y, 0);
    loadPersonPal("sOakSpritePalette");
  } else if (fcPersonIdx === C.FAMECHECKER_BILL) {
    spriteId = CreateSprite(spriteTemplate("sBillSpriteTemplate"), PERSON_X, PERSON_Y, 0);
    loadPersonPal("sBillSpritePalette");
  } else {
    spriteId = CreateTrainerPicSprite(fc<number[]>("sFameCheckerTrainerPicIdxs")[fcPersonIdx], true, PERSON_X, PERSON_Y, PERSON_PAL_NUM, TAG_NONE);
  }
  gSprites[spriteId].callback = SpriteCB_FCSpinningPokeball;
  if (fameChecker()[fcPersonIdx].pickState === FCPICKSTATE_SILHOUETTE) {
    const pal = incbin("fame_checker.c:sSilhouettePalette");
    LoadPalette(pal, OBJ_PLTT_ID(PERSON_PAL_NUM), pal.length);
  }
  return spriteId;
}

/** DestroyPersonPicSprite (fame_checker.c). */
function DestroyPersonPicSprite(taskId: number, who: number): void {
  const data = tasks.data(taskId);
  let whoCopy = who;
  if (who === D().numUnlockedPersons - 1) whoCopy = who - 1;
  const person = D().unlockedPersons[whoCopy];
  if (person === C.FAMECHECKER_DAISY || person === C.FAMECHECKER_MRFUJI || person === C.FAMECHECKER_OAK || person === C.FAMECHECKER_BILL) {
    DestroySprite(gSprites[data[2]]);
  } else {
    FreeAndDestroyTrainerPicSprite(data[2]);
  }
}

/** UpdateIconDescriptionBox (fame_checker.c). */
function UpdateIconDescriptionBox(whichText: number): void {
  const idx = 6 * D().unlockedPersons[FameCheckerGetCursorY()] + whichText;
  HandleFlavorTextModeSwitch(true);
  gIconDescriptionBoxIsOpen = 1;
  FillWindowPixelRect(FCWINDOWID_ICONDESC, PIXEL_FILL(0), 0, 0, 0x58, 0x20);
  const location = tableText("sFlavorTextOriginLocationTexts", idx);
  let width = Math.trunc((0x54 - GetStringWidth(FONT_SMALL, location, 0)) / 2);
  AddTextPrinterParameterized4(FCWINDOWID_ICONDESC, FONT_SMALL, width, 0, 0, 2, sTextColor_DkGrey(), -1, location);
  const objectName = expandPlaceholders(tableText("sFlavorTextOriginObjectNameTexts", idx));
  width = Math.trunc((0x54 - GetStringWidth(FONT_SMALL, objectName, 0)) / 2);
  AddTextPrinterParameterized4(FCWINDOWID_ICONDESC, FONT_SMALL, width, 10, 0, 2, sTextColor_DkGrey(), -1, objectName);
  FC_PutWindowTilemapAndCopyWindowToVramMode3(FCWINDOWID_ICONDESC);
}

/** UpdateIconDescriptionBoxOff (fame_checker.c). */
function UpdateIconDescriptionBoxOff(): void {
  HandleFlavorTextModeSwitch(false);
  gIconDescriptionBoxIsOpen = 0xff;
}

/** FC_CreateListMenu (fame_checker.c). */
function FC_CreateListMenu(): void {
  InitListMenuTemplate();
  D().numUnlockedPersons = FC_PopulateListMenu();
  D().listMenuTaskId = ListMenuInit(gFameChecker_ListMenuTemplate, 0, 0);
  FC_PutWindowTilemapAndCopyWindowToVramMode3_2(FCWINDOWID_LIST);
}

/** InitListMenuTemplate (fame_checker.c). */
function InitListMenuTemplate(): void {
  const t = gFameChecker_ListMenuTemplate;
  t.items = sListMenuItems;
  t.moveCursorFunc = FC_MoveCursorFunc;
  t.itemPrintFunc = null;
  t.totalItems = 1;
  t.maxShowed = 1;
  t.windowId = FCWINDOWID_LIST;
  t.header_X = 0;
  t.item_X = 8;
  t.cursor_X = 0;
  t.upText_Y = 4;
  t.cursorPal = 2;
  t.fillValue = 0;
  t.cursorShadowPal = 3;
  t.lettersSpacing = 0;
  t.itemVerticalPadding = 0;
  t.scrollMultiple = 0;
  t.fontId = FONT_NORMAL;
  t.cursorKind = 0;
}

/** FC_MoveCursorFunc (fame_checker.c). */
function FC_MoveCursorFunc(itemIndex: number, onInit: boolean, _list: ListMenu): void {
  sLastMenuIdx = 0;
  const personIdx = D().listMenuTopIdx2 + D().listMenuDrawnSelIdx;
  FC_DoMoveCursor(itemIndex, onInit);
  const taskId = tasks.findByFunc(Task_TopMenuHandleInput);
  if (taskId !== TASK_NONE) {
    const data = tasks.data(taskId);
    sound.playSE(C.SE_SELECT);
    data[1] = 0;
    const listMenuTopIdx = ListMenuGetScrollAndRow(D().listMenuTaskId).cursorPos;
    D().listMenuTopIdx = listMenuTopIdx;
    if (itemIndex !== D().numUnlockedPersons - 1) {
      DestroyAllFlavorTextIcons();
      CreateAllFlavorTextIcons(itemIndex);
      if (D().inPickMode) {
        if (!D().pickModeOverCancel) {
          DestroyPersonPicSprite(taskId, personIdx);
          sLastMenuIdx = itemIndex;
          tasks.setFunc(taskId, Task_SwitchToPickMode);
        } else {
          gSprites[data[2]].invisible = false;
          D().pickModeOverCancel = false;
          gSprites[data[2]].data[0] = 0;
          GetPickModeText();
        }
      } else {
        FillWindowPixelRect(FCWINDOWID_MSGBOX, PIXEL_FILL(1), 0, 0, 0xd0, 0x20);
        FC_PutWindowTilemapAndCopyWindowToVramMode3(FCWINDOWID_MSGBOX);
      }
    } else {
      PrintCancelDescription();
      if (D().inPickMode) {
        gSprites[data[2]].invisible = true;
        D().pickModeOverCancel = true;
      } else {
        for (let i = 0; i < 6; i++) gSprites[D().spriteIds[i]].invisible = true;
      }
    }
  }
}

/** Task_SwitchToPickMode (fame_checker.c). */
function Task_SwitchToPickMode(taskId: number): void {
  const data = tasks.data(taskId);
  data[2] = CreatePersonPicSprite(D().unlockedPersons[sLastMenuIdx]);
  gSprites[data[2]].data[0] = 0;
  GetPickModeText();
  tasks.setFunc(taskId, Task_TopMenuHandleInput);
}

/** PrintCancelDescription (fame_checker.c). */
function PrintCancelDescription(): void {
  FillWindowPixelRect(FCWINDOWID_MSGBOX, PIXEL_FILL(1), 0, 0, 0xd0, 0x20);
  AddTextPrinterParameterized2(FCWINDOWID_MSGBOX, FONT_NORMAL, rom.text("gFameCheckerText_FameCheckerWillBeClosed"), 0, null, C.TEXT_COLOR_DARK_GRAY, C.TEXT_COLOR_WHITE, C.TEXT_COLOR_LIGHT_GRAY);
  FC_PutWindowTilemapAndCopyWindowToVramMode3(FCWINDOWID_MSGBOX);
}

/** FC_DoMoveCursor (fame_checker.c). */
function FC_DoMoveCursor(itemIndex: number, onInit: boolean): void {
  const { cursorPos: listY, itemsAbove: cursorY } = ListMenuGetScrollAndRow(D().listMenuTaskId);
  const who = listY + cursorY;
  AddTextPrinterParameterized4(FCWINDOWID_LIST, FONT_NORMAL, 8, 14 * cursorY + 4, 0, 0, sTextColor_Green(), 0, sListMenuItems[itemIndex].label);
  if (!onInit) {
    if (listY < D().listMenuTopIdx2) D().listMenuDrawnSelIdx++;
    else if (listY > D().listMenuTopIdx2 && who !== D().numUnlockedPersons - 1) D().listMenuDrawnSelIdx--;
    AddTextPrinterParameterized4(FCWINDOWID_LIST, FONT_NORMAL, 8, 14 * D().listMenuDrawnSelIdx + 4, 0, 0, sTextColor_DkGrey(), 0, sListMenuItems[D().listMenuCurIdx].label);
  }
  D().listMenuCurIdx = itemIndex;
  D().listMenuDrawnSelIdx = cursorY;
  D().listMenuTopIdx2 = listY;
}

/** FC_PopulateListMenu (fame_checker.c). */
function FC_PopulateListMenu(): number {
  let nitems = 0;
  const nonTrainerNames = fc<SymRef[]>("sNonTrainerNamePointers");
  for (let i = 0; i < NUM_FAMECHECKER_PERSONS; i++) {
    const fameCheckerIdx = AdjustGiovanniIndexIfBeatenInGym(i);
    if (fameChecker()[fameCheckerIdx].pickState !== FCPICKSTATE_NO_DRAW) {
      const trainerIdx = sTrainerIdxs()[fameCheckerIdx];
      if (trainerIdx < FC_NONTRAINER_START) {
        const name = Uint8Array.from(atob(rom.trainers[trainerIdx].name), (ch) => ch.charCodeAt(0));
        sListMenuItems[nitems].label = name[name.length - 1] === 0xff ? name : Uint8Array.from([...name, 0xff]);
        sListMenuItems[nitems].index = nitems;
      } else {
        sListMenuItems[nitems].label = textOf(nonTrainerNames[trainerIdx - FC_NONTRAINER_START]);
        sListMenuItems[nitems].index = nitems;
      }
      D().unlockedPersons[nitems] = fameCheckerIdx;
      nitems++;
    }
  }
  sListMenuItems[nitems].label = rom.text("gFameCheckerText_Cancel");
  sListMenuItems[nitems].index = nitems;
  D().unlockedPersons[nitems] = 0xff;
  nitems++;
  gFameChecker_ListMenuTemplate.totalItems = nitems;
  if (nitems < 5) gFameChecker_ListMenuTemplate.maxShowed = nitems;
  else gFameChecker_ListMenuTemplate.maxShowed = 5;
  return nitems;
}

/** FC_PutWindowTilemapAndCopyWindowToVramMode3_2 (fame_checker.c). */
function FC_PutWindowTilemapAndCopyWindowToVramMode3_2(windowId: number): void {
  PutWindowTilemap(windowId);
  CopyWindowToVram(windowId, COPYWIN_FULL);
}

/** FC_CreateScrollIndicatorArrowPair (fame_checker.c). */
function FC_CreateScrollIndicatorArrowPair(): void {
  const template: ScrollArrowsTemplate = {
    firstArrowType: 2, firstX: 40, firstY: 26, secondArrowType: 3, secondX: 40, secondY: 100, fullyUpThreshold: 0, fullyDownThreshold: 0,
    tileTag: SPRITETAG_SCROLL_INDICATORS, palTag: 0xffff, palNum: 1,
  };
  if (D().numUnlockedPersons > 5) {
    template.fullyUpThreshold = 0;
    template.fullyDownThreshold = D().numUnlockedPersons - 5;
    D().scrollIndicatorPairTaskId = AddScrollIndicatorArrowPair(template, () => D().listMenuTopIdx);
  }
}

/** FreeListMenuSelectorArrowPairResources (fame_checker.c). */
function FreeListMenuSelectorArrowPairResources(): void {
  if (D().numUnlockedPersons > 5) RemoveScrollIndicatorArrowPair(D().scrollIndicatorPairTaskId);
}

/** FameCheckerGetCursorY (fame_checker.c). */
function FameCheckerGetCursorY(): number {
  const { cursorPos: listY, itemsAbove: cursorY } = ListMenuGetScrollAndRow(D().listMenuTaskId);
  return listY + cursorY;
}

/** HandleFlavorTextModeSwitch (fame_checker.c). */
function HandleFlavorTextModeSwitch(state: boolean): void {
  if (D().viewingFlavorText !== state) {
    let taskId = tasks.findByFunc(Task_FCOpenOrCloseInfoBox);
    if (taskId === TASK_NONE) taskId = tasks.create(Task_FCOpenOrCloseInfoBox, 8);
    const data = tasks.data(taskId);
    data[0] = 0;
    data[1] = 4;
    if (state) {
      data[2] = 1;
      D().viewingFlavorText = true;
    } else {
      data[2] = 4;
      D().viewingFlavorText = false;
    }
  }
}

/** Task_FCOpenOrCloseInfoBox (fame_checker.c). */
function Task_FCOpenOrCloseInfoBox(taskId: number): void {
  const data = tasks.data(taskId);
  switch (data[0]) {
    case 0:
      if (--data[1] === 0) {
        UpdateInfoBoxTilemap(1, 0);
        data[1] = 4;
        data[0]++;
      }
      break;
    case 1:
      if (--data[1] === 0) {
        UpdateInfoBoxTilemap(1, data[2]);
        tasks.destroy(taskId);
      }
      break;
  }
}

/** UpdateInfoBoxTilemap (fame_checker.c). */
function UpdateInfoBoxTilemap(bg: number, state: number): void {
  const fill = (tile: number, x: number, y: number, w: number, h: number): void => FillBgTilemapBufferRect(bg, tile, x, y, w, h, 1);
  if (state === 0 || state === 3) {
    fill(0x8c, 14, 10, 1, 1);
    fill(0xa1, 15, 10, 10, 1);
    fill(0x8d, 25, 10, 1, 1);
    fill(0x8e, 26, 10, 1, 1);
    fill(0x8f, 14, 11, 1, 1);
    fill(0x00, 15, 11, 11, 1);
    fill(0x90, 26, 11, 1, 1);
    fill(0x91, 14, 12, 1, 1);
    fill(0xa3, 15, 12, 10, 1);
    fill(0x92, 25, 12, 1, 1);
    fill(0x93, 26, 12, 1, 1);
  } else if (state === 1) {
    fill(0x9b, 14, 10, 1, 1);
    fill(0x9c, 15, 10, 11, 1);
    fill(0x96, 26, 10, 1, 1);
    fill(0x9d, 14, 11, 1, 1);
    fill(0x00, 15, 11, 11, 1);
    fill(0x90, 26, 11, 1, 1);
    fill(0x9e, 14, 12, 1, 1);
    fill(0x9f, 15, 12, 11, 1);
    fill(0x99, 26, 12, 1, 1);
  } else if (state === 2) {
    fill(0x94, 14, 10, 1, 1);
    fill(0x95, 15, 10, 11, 1);
    fill(0x96, 26, 10, 1, 1);
    fill(0x8f, 14, 11, 1, 1);
    fill(0x9a, 15, 11, 11, 1);
    fill(0x90, 26, 11, 1, 1);
    fill(0x97, 14, 12, 1, 1);
    fill(0x98, 15, 12, 11, 1);
    fill(0x99, 26, 12, 1, 1);
  } else if (state === 4) {
    fill(0x83, 14, 10, 1, 1);
    fill(0xa0, 15, 10, 10, 1);
    fill(0x84, 25, 10, 1, 1);
    fill(0x85, 26, 10, 1, 1);
    fill(0x86, 14, 11, 1, 1);
    fill(0xa2, 15, 11, 10, 1);
    fill(0x87, 25, 11, 1, 1);
    fill(0x88, 26, 11, 1, 1);
    fill(0x83, 14, 12, 1, 1);
    fill(0xa0, 15, 12, 10, 1);
    fill(0x84, 25, 12, 1, 1);
    fill(0x85, 26, 12, 1, 1);
  } else if (state === 5) {
    fill(0x00, 14, 10, 13, 3);
  }
  CopyBgTilemapBufferToVram(bg);
}

/** PlaceListMenuCursor (fame_checker.c). */
function PlaceListMenuCursor(isActive: boolean): void {
  const cursorY = ListMenuGetYCoordForPrintingArrowCursor(D().listMenuTaskId);
  AddTextPrinterParameterized4(FCWINDOWID_LIST, FONT_NORMAL, 0, cursorY, 0, 0, isActive ? sTextColor_DkGrey() : sTextColor_White(), 0, rom.text("gText_SelectorArrow2"));
}
