// easy_chat_3.c: Easy Chat screen graphics: BG/window setup, the phrase frame, the group / alphabet / word
// menus drawn in window 2, the cursor and helper sprites, and the numbered interface commands that
// easy_chat_2.c issues through EasyChatInterfaceCommand_Setup/Run.
import * as C from "./generated/constants";
import { encode } from "./gba/charmap";
import { FONT_NORMAL_COPY_1, stringWidth as GetStringWidth } from "./gba/font";
import { cdata, incbin, incbin16, preloadIncbin, loadCData, type SymRef } from "./hw/assets";
import { templateFrom, type CSpriteTemplate } from "./hw/cdataSprite";
import {
  BG_COORD_ADD, BG_COORD_SET, type BgTemplate, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyToBgTilemapBuffer,
  FillBgTilemapBufferRect, FillBgTilemapBufferRect_Palette0, GetBgY, HideBg, InitBgsFromTemplates, IsDma3ManagerBusyWithBgCopy,
  ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg,
} from "./hw/bg";
import { SetGpuReg } from "./hw/gpu";
import { CreateYesNoMenu, LoadUserWindowGfx } from "./hw/menu";
import { DecompressAndLoadBgGfxUsingHeap, DrawTextBorderOuter } from "./hw/menuHelpers";
import { LoadPalette, ResetPaletteFade } from "./hw/palette";
import {
  DISPCNT_MODE_0, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, DISPCNT_WIN0_ON, ppu, REG_OFFSET_DISPCNT, REG_OFFSET_WIN0H,
  REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT, WIN_RANGE,
} from "./hw/ppu";
import {
  CreateSprite, DestroySprite, LoadSpritePalettes, LoadSpriteSheet, MAX_SPRITES, StartSpriteAnim, gSprites,
  type Sprite, type SpriteCallback,
} from "./hw/sprite";
import { AddTextPrinterParameterized, AddTextPrinterParameterized3, DeactivateAllTextPrinters } from "./hw/text";
import {
  AddWindow, CopyWindowToVram, FillWindowPixelBuffer, FillWindowPixelRect, InitWindows, PIXEL_FILL, PutWindowTilemap,
  COPYWIN_FULL, COPYWIN_GFX, type WindowTemplate,
} from "./hw/window";
import { rom } from "./rom";
import {
  GetECSelectGroupCursorCoords, GetECSelectGroupRowsAbove, GetECSelectWordCursorCoords, GetECSelectWordNumRows,
  GetECSelectWordRowsAbove, GetEasyChatConfirmCancelText, GetEasyChatConfirmDeletionText, GetEasyChatConfirmText,
  GetEasyChatInstructionsText, GetEasyChatScreenFrameId, GetEasyChatWordBuffer, GetMainCursorColumn, GetMainCursorRow,
  GetNumColumns, GetNumRows, GetTitleText, IsEasyChatAlphaMode, ShouldDrawECDownArrow, ShouldDrawECUpArrow,
} from "./easyChat2";
import {
  CopyEasyChatWord, CopyEasyChatWordPadded, GetDisplayedWordByIndex, GetEasyChatWordGroupName, GetSelectedGroupByIndex,
} from "./easyChat";

const symbols = [
  "easy_chat_3.c:sTriangleCursor_Pal", "easy_chat_3.c:sRectangleCursor_Pal", "easy_chat_3.c:sTriangleCursor_Gfx",
  "easy_chat_3.c:sScrollIndicator_Gfx", "easy_chat_3.c:sStartSelectButtons_Gfx", "easy_chat_3.c:sRSInterviewFrame_Pal",
  "easy_chat_3.c:sRSInterviewFrame_Gfx", "easy_chat_3.c:sTextInputFrameOrange_Pal", "easy_chat_3.c:sTextInputFrameGreen_Pal",
  "easy_chat_3.c:sTextInputFrame_Gfx", "easy_chat_3.c:sTitleText_Pal", "easy_chat_3.c:sText_Pal",
  "gEasyChatWindow_Pal", "gEasyChatWindow_Gfx", "gEasyChatWindow_Tilemap", "gEasyChatButtonWindow_Pal",
  "gEasyChatButtonWindow_Gfx", "gEasyChatMode_Gfx", "gEasyChatRectangleCursor_Gfx",
];

/** Loads the screen's INCBIN packs and cdata tables (easy_chat_2/3.c constant data). */
export async function preloadEasyChatScreen(): Promise<void> {
  await Promise.all([preloadIncbin(symbols), loadCData("easy_chat_2", "easy_chat_3", "strings")]);
}

// enum: sprite sheet tags
const GFXTAG_TRIANGLE_CURSOR = 0;
const GFXTAG_RECTANGLE_CURSOR = 1;
const GFXTAG_SCROLL_INDICATOR = 2;
const GFXTAG_START_SELECT_BUTTONS = 3;
const GFXTAG_MODE_WINDOW = 4;
const GFXTAG_RS_INTERVIEW_FRAME = 5;
const GFXTAG_BUTTON_WINDOW = 6;

const RECTCURSOR_ANIM_ON_GROUP = 0;
const RECTCURSOR_ANIM_ON_BUTTON = 1;
const RECTCURSOR_ANIM_ON_OTHERS = 2;
const RECTCURSOR_ANIM_ON_LETTER = 3;

const MODEWINDOW_ANIM_TO_GROUP = 1;
const MODEWINDOW_ANIM_TO_ALPHABET = 2;
const MODEWINDOW_ANIM_TO_HIDDEN = 3;
const MODEWINDOW_ANIM_TRANSITION = 4;

const NUM_ALPHABET_COLUMNS = 7;
const BG_SCREEN_SIZE = 0x800;
const BG_PLTT_ID = (n: number): number => n * 16;
const PLTT_SIZE_4BPP = 32;

type EasyChatPhraseFrameDimensions = { left: number; top: number; width: number; height: number };

/** struct ECWork. */
type ECWork = {
  state: number;
  windowId: number;
  id: number;
  frameAnimIdx: number;
  frameAnimTarget: number;
  frameAnimDelta: number;
  modeIconState: number;
  ecPrintBuffer: number[];
  ecPaddedWordBuffer: number[];
  bg2ScrollRow: number;
  tgtBgY: number;
  deltaBgY: number;
  selectDestFieldCursorSprite: Sprite | null;
  rectCursorSpriteRight: Sprite | null;
  rectCursorSpriteLeft: Sprite | null;
  selectWordCursorSprite: Sprite | null;
  selectGroupHelpSprite: Sprite | null;
  modeIconsSprite: Sprite | null;
  upTriangleCursorSprite: Sprite | null;
  downTriangleCursorSprite: Sprite | null;
  startPgUpButtonSprite: Sprite | null;
  selectPgDnButtonSprite: Sprite | null;
  bg1TilemapBuffer: Uint16Array;
  bg3TilemapBuffer: Uint16Array;
};

let sEasyChatGraphicsResources: ECWork | null = null;
const R = (): ECWork => sEasyChatGraphicsResources!;

function ec3<T>(name: string): T {
  return cdata<T>("easy_chat_3", name);
}

function phraseFrame(frameId: number): EasyChatPhraseFrameDimensions {
  return ec3<EasyChatPhraseFrameDimensions[]>("sPhraseFrameDimensions")[frameId];
}

const spriteCallbacks: Record<string, SpriteCallback> = {
  SpriteCB_BounceCursor: (sprite) => SpriteCB_BounceCursor(sprite),
};

function sTemplate(name: string): ReturnType<typeof templateFrom> {
  return templateFrom(ec3<CSpriteTemplate>(name), spriteCallbacks);
}

/** InitEasyChatGraphicsWork (easy_chat_3.c). */
export function InitEasyChatGraphicsWork(): boolean {
  return InitEasyChatGraphicsWork_Internal();
}

/** LoadEasyChatGraphics (easy_chat_3.c). */
export function LoadEasyChatGraphics(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      ResetBgsAndClearDma3BusyFlags(0);
      InitBgsFromTemplates(0, ec3<BgTemplate[]>("sEasyChatBgTemplates"));
      SetBgTilemapBuffer(3, r.bg3TilemapBuffer);
      SetBgTilemapBuffer(1, r.bg1TilemapBuffer);
      InitWindows(ec3<WindowTemplate[]>("sEasyChatWindowTemplates"));
      DeactivateAllTextPrinters();
      LoadEasyChatPals();
      SetGpuRegsForEasyChatInit();
      ppu.oam.fill(0, 0, 0x400 >> 1);
      break;
    case 1:
      DecompressAndLoadBgGfxUsingHeap(3, incbin("gEasyChatWindow_Gfx"), incbin("gEasyChatWindow_Gfx").length, 0, 0);
      CopyToBgTilemapBuffer(3, incbin16("gEasyChatWindow_Tilemap"), 0, 0);
      CreatePhraseFrameWindow();
      CreateFooterWindow();
      CopyBgTilemapBufferToVram(3);
      break;
    case 2:
      DrawECFrameInTilemapBuffer(r.bg1TilemapBuffer);
      DecompressAndLoadBgGfxUsingHeap(1, incbin("easy_chat_3.c:sTextInputFrame_Gfx"), incbin("easy_chat_3.c:sTextInputFrame_Gfx").length, 0, 0);
      CopyBgTilemapBufferToVram(1);
      break;
    case 3:
      PrintTitleText();
      PrintECInstructionsText();
      PrintECFields();
      PutWin2TilemapAndCopyToVram();
      break;
    case 4:
      LoadSpriteGfx();
      CreateSelectDestFieldCursorSprite();
      break;
    case 5:
      if (IsDma3ManagerBusyWithBgCopy()) return true;
      SetRegWin0Coords(0, 0, 0, 0);
      SetGpuReg(REG_OFFSET_WININ, WIN_RANGE(0, 63));
      SetGpuReg(REG_OFFSET_WINOUT, WIN_RANGE(0, 59));
      ShowBg(3);
      ShowBg(1);
      ShowBg(2);
      ShowBg(0);
      CreateVerticalScrollArrowSprites();
      CreateStartSelectButtonsSprites();
      break;
    default:
      return false;
  }
  r.state++;
  return true;
}

/** DestroyEasyChatGraphicsResources (easy_chat_3.c). */
export function DestroyEasyChatGraphicsResources(): void {
  sEasyChatGraphicsResources = null;
}

/** EasyChatInterfaceCommand_Setup (easy_chat_3.c). */
export function EasyChatInterfaceCommand_Setup(id: number): void {
  R().id = id;
  R().state = 0;
  EasyChatInterfaceCommand_Run();
}

/** EasyChatInterfaceCommand_Run (easy_chat_3.c). */
export function EasyChatInterfaceCommand_Run(): boolean {
  switch (R().id) {
    case 0: return false;
    case 1: return ECInterfaceCmd_01();
    case 2: return ECInterfaceCmd_02();
    case 3: return ECInterfaceCmd_03();
    case 4: return ECInterfaceCmd_04();
    case 5: return ECInterfaceCmd_05();
    case 6: return ECInterfaceCmd_06();
    case 7: return ECInterfaceCmd_07();
    case 8: return ECInterfaceCmd_08();
    case 9: return ECInterfaceCmd_09();
    case 10: return ECInterfaceCmd_10();
    case 11: return ECInterfaceCmd_11();
    case 12: return ECInterfaceCmd_12();
    case 13: return ECInterfaceCmd_13();
    case 14: return ECInterfaceCmd_14();
    case 15: return ECInterfaceCmd_15();
    case 16: return ECInterfaceCmd_16();
    case 17: return ECInterfaceCmd_17();
    case 18: return ECInterfaceCmd_18();
    case 19: return ECInterfaceCmd_19();
    case 20: return ECInterfaceCmd_20();
    case 21: return ECInterfaceCmd_21();
    case 22: return ECInterfaceCmd_22();
    default: return false;
  }
}

/** ECInterfaceCmd_01: reprint the phrase fields. */
function ECInterfaceCmd_01(): boolean {
  switch (R().state) {
    case 0:
      PrintECFields();
      R().state++;
      break;
    case 1:
      return IsDma3ManagerBusyWithBgCopy();
  }
  return true;
}

/** ECInterfaceCmd_02: move the destination-field cursor to the selected word. */
function ECInterfaceCmd_02(): boolean {
  const ecWordBuffer = GetEasyChatWordBuffer();
  const frameId = GetEasyChatScreenFrameId();
  const cursorColumn = GetMainCursorColumn();
  const cursorRow = GetMainCursorRow();
  const numColumns = GetNumColumns();
  let index = cursorRow * numColumns;
  let var1 = 8 * phraseFrame(frameId).left + 13;
  for (let i = 0; i < cursorColumn; i++) {
    let stringWidth: number;
    if (ecWordBuffer[index] === 0xffff) {
      stringWidth = GetStringWidth(FONT_NORMAL_COPY_1, ec3<number[]>("sText_Underscore"), 0) * 7;
    } else {
      stringWidth = GetStringWidth(FONT_NORMAL_COPY_1, ecWordBytes(ecWordBuffer[index]), 0);
    }
    const trueStringWidth = stringWidth + 17;
    var1 += trueStringWidth;
    index++;
  }
  const var2 = 8 * (phraseFrame(frameId).top + cursorRow * 2 + 1) + 1;
  SetSelectDestFieldCursorSpritePosAndResetAnim(var1, var2);
  return false;
}

/** ECInterfaceCmd_03: move the cursor to the footer buttons. */
function ECInterfaceCmd_03(): boolean {
  let xOffset: number;
  switch (GetMainCursorColumn()) {
    case 0: xOffset = 28; break;
    case 1: xOffset = 115; break;
    case 2: xOffset = 191; break;
    default: return false;
  }
  SetSelectDestFieldCursorSpritePosAndResetAnim(xOffset, 97);
  return false;
}

/** ECInterfaceCmd_05: quit-editing confirmation. */
function ECInterfaceCmd_05(): boolean {
  switch (R().state) {
    case 0:
      FreezeSelectDestFieldCursorSprite();
      PrintECInterfaceTextById(2);
      EC_CreateYesNoMenuWithInitialCursorPos(1);
      R().state++;
      break;
    case 1:
      return IsDma3ManagerBusyWithBgCopy();
  }
  return true;
}

/** ECInterfaceCmd_06: confirm-message prompt. */
function ECInterfaceCmd_06(): boolean {
  switch (R().state) {
    case 0:
      FreezeSelectDestFieldCursorSprite();
      PrintECInterfaceTextById(3);
      EC_CreateYesNoMenuWithInitialCursorPos(0);
      R().state++;
      break;
    case 1:
      return IsDma3ManagerBusyWithBgCopy();
  }
  return true;
}

/** ECInterfaceCmd_04: delete-all confirmation. */
function ECInterfaceCmd_04(): boolean {
  switch (R().state) {
    case 0:
      FreezeSelectDestFieldCursorSprite();
      PrintECInterfaceTextById(1);
      EC_CreateYesNoMenuWithInitialCursorPos(1);
      R().state++;
      break;
    case 1:
      return IsDma3ManagerBusyWithBgCopy();
  }
  return true;
}

/** ECInterfaceCmd_07: back to the instructions after a "No". */
function ECInterfaceCmd_07(): boolean {
  switch (R().state) {
    case 0:
      UnfreezeSelectDestFieldCursorSprite();
      PrintECInterfaceTextById(0);
      ShowBg(0);
      R().state++;
      break;
    case 1:
      return IsDma3ManagerBusyWithBgCopy();
  }
  return true;
}

/** ECInterfaceCmd_08: after "delete all": instructions and fields. */
function ECInterfaceCmd_08(): boolean {
  switch (R().state) {
    case 0:
      UnfreezeSelectDestFieldCursorSprite();
      PrintECInterfaceTextById(0);
      PrintECFields();
      R().state++;
    // Fall through
    case 1:
      return IsDma3ManagerBusyWithBgCopy();
  }
  return true;
}

/** ECInterfaceCmd_09: open the group / alphabet menu. */
function ECInterfaceCmd_09(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      FreezeSelectDestFieldCursorSprite();
      HideBg(0);
      SetRegWin0Coords(0, 0, 0, 0);
      PrintECGroupOrAlphaMenu();
      r.state++;
      break;
    case 1:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        StartWin2FrameAnim(0);
        r.state++;
      }
      break;
    case 2:
      if (!IsDma3ManagerBusyWithBgCopy() && !AnimateFrameResize()) r.state++;
      break;
    case 3:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        CreateSelectGroupHelpSprite();
        r.state++;
      }
      break;
    case 4:
      if (!AnimateSeletGroupModeAndHelpSpriteEnter()) {
        CreateRedRectangularCursorSpritePair();
        UpdateVerticalScrollArrowSpriteXPos(0);
        UpdateVerticalScrollArrowVisibility();
        r.state++;
        return false;
      }
      break;
    default:
      return false;
  }
  return true;
}

/** ECInterfaceCmd_10: close the group menu back to the fields. */
function ECInterfaceCmd_10(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      DestroyRedRectangularCursor();
      StartModeIconHidingAnimation();
      HideVerticalScrollArrowSprites();
      r.state++;
      break;
    case 1:
      if (RunModeIconHidingAnimation()) break;
      StartWin2FrameAnim(1);
      r.state++;
    // Fall through
    case 2:
      if (!AnimateFrameResize()) r.state++;
      break;
    case 3:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        UnfreezeSelectDestFieldCursorSprite();
        ShowBg(0);
        r.state++;
      }
      break;
    case 4:
      return false;
  }
  return true;
}

/** ECInterfaceCmd_22: toggle group / alphabet mode. */
function ECInterfaceCmd_22(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      DestroyRedRectangularCursor();
      HideVerticalScrollArrowSprites();
      ShrinkModeIconsSprite();
      StartWin2FrameAnim(5);
      r.state++;
      break;
    case 1:
      if (!AnimateFrameResize() && !ModeIconsSpriteAnimIsEnded()) {
        PrintECGroupOrAlphaMenu();
        r.state++;
      }
      break;
    case 2:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        StartWin2FrameAnim(6);
        ShowModeIconsSprite();
        r.state++;
      }
      break;
    case 3:
      if (!AnimateFrameResize() && !ModeIconsSpriteAnimIsEnded()) {
        UpdateVerticalScrollArrowVisibility();
        CreateRedRectangularCursorSpritePair();
        r.state++;
        return false;
      }
      break;
    case 4:
      return false;
  }
  return true;
}

/** ECInterfaceCmd_14: move the group cursor. */
function ECInterfaceCmd_14(): boolean {
  EC_MoveCursor();
  return false;
}

/** ECInterfaceCmd_15: scroll the group list down. */
function ECInterfaceCmd_15(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      ScheduleBg2VerticalScroll(1, 2);
      r.state++;
    // Fall through
    case 1:
      if (!AnimateBg2VerticalScroll()) {
        EC_MoveCursor();
        UpdateVerticalScrollArrowVisibility();
        return false;
      }
      break;
  }
  return true;
}

/** ECInterfaceCmd_16: scroll the group list up. */
function ECInterfaceCmd_16(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      ScheduleBg2VerticalScroll(-1, 2);
      r.state++;
    // Fall through
    case 1:
      if (!AnimateBg2VerticalScroll()) {
        UpdateVerticalScrollArrowVisibility();
        r.state++;
        return false;
      }
      break;
    case 2:
      return false;
  }
  return true;
}

/** ECInterfaceCmd_11: open the word list of a group. */
function ECInterfaceCmd_11(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      DestroyRedRectangularCursor();
      StartModeIconHidingAnimation();
      HideVerticalScrollArrowSprites();
      r.state++;
      break;
    case 1:
      if (!RunModeIconHidingAnimation()) {
        ClearWin2AndCopyToVram();
        r.state++;
      }
      break;
    case 2:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        StartWin2FrameAnim(2);
        r.state++;
      }
      break;
    case 3:
      if (!AnimateFrameResize()) {
        PrintECMenuById(2);
        r.state++;
      }
      break;
    case 4:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        CreateSelectWordCursorSprite();
        UpdateVerticalScrollArrowSpriteXPos(1);
        UpdateVerticalScrollArrowVisibility();
        UpdateStartSelectButtonSpriteVisibility();
        r.state++;
        return false;
      }
      break;
    case 5:
      return false;
  }
  return true;
}

/** ECInterfaceCmd_12: place the chosen word and return to the fields. */
function ECInterfaceCmd_12(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      PrintECFields();
      r.state++;
      break;
    case 1:
      DestroySelectWordCursorSprite();
      HideVerticalScrollArrowSprites();
      HideStartSelectButtonSprites();
      ClearWin2AndCopyToVram();
      r.state++;
      break;
    case 2:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        StartWin2FrameAnim(3);
        r.state++;
      }
      break;
    case 3:
      if (!AnimateFrameResize()) {
        ShowBg(0);
        r.state++;
      }
      break;
    case 4:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        UnfreezeSelectDestFieldCursorSprite();
        r.state++;
        return false;
      }
      break;
    case 5:
      return false;
  }
  return true;
}

/** ECInterfaceCmd_13: back from the word list to the group menu. */
function ECInterfaceCmd_13(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      DestroySelectWordCursorSprite();
      HideVerticalScrollArrowSprites();
      HideStartSelectButtonSprites();
      ClearWin2AndCopyToVram();
      r.state++;
      break;
    case 1:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        StartWin2FrameAnim(4);
        r.state++;
      }
      break;
    case 2:
      if (!AnimateFrameResize()) {
        PrintECGroupOrAlphaMenu();
        r.state++;
      }
      break;
    case 3:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        CreateSelectGroupHelpSprite();
        r.state++;
      }
      break;
    case 4:
      if (!AnimateSeletGroupModeAndHelpSpriteEnter()) {
        CreateRedRectangularCursorSpritePair();
        UpdateVerticalScrollArrowSpriteXPos(0);
        UpdateVerticalScrollArrowVisibility();
        r.state++;
        return false;
      }
      break;
  }
  return true;
}

/** ECInterfaceCmd_17: move the word cursor. */
function ECInterfaceCmd_17(): boolean {
  SetSelectWordCursorSpritePos();
  return false;
}

/** ECInterfaceCmd_19: scroll the word list down by a row. */
function ECInterfaceCmd_19(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      UpdateWin2PrintWordsScrollDown();
      r.state++;
      break;
    case 1:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        ScheduleBg2VerticalScroll(1, 2);
        r.state++;
      }
      break;
    case 2:
      if (!AnimateBg2VerticalScroll()) {
        SetSelectWordCursorSpritePos();
        UpdateVerticalScrollArrowVisibility();
        UpdateStartSelectButtonSpriteVisibility();
        r.state++;
        return false;
      }
      break;
    case 3:
      return false;
  }
  return true;
}

/** ECInterfaceCmd_18: scroll the word list up by a row. */
function ECInterfaceCmd_18(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      UpdateWin2PrintWordsScrollUp();
      r.state++;
      break;
    case 1:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        ScheduleBg2VerticalScroll(-1, 2);
        r.state++;
      }
      break;
    case 2:
      if (!AnimateBg2VerticalScroll()) {
        UpdateVerticalScrollArrowVisibility();
        UpdateStartSelectButtonSpriteVisibility();
        r.state++;
        return false;
      }
      break;
    case 3:
      return false;
  }
  return true;
}

/** ECInterfaceCmd_21: page the word list down. */
function ECInterfaceCmd_21(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      UpdateWin2PrintWordsScrollPageDown();
      r.state++;
      break;
    case 1:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        const direction = GetECSelectWordRowsAbove() - GetBg2ScrollRow();
        ScheduleBg2VerticalScroll(direction, 4);
        r.state++;
      }
      break;
    case 2:
      if (!AnimateBg2VerticalScroll()) {
        SetSelectWordCursorSpritePos();
        UpdateVerticalScrollArrowVisibility();
        UpdateStartSelectButtonSpriteVisibility();
        r.state++;
        return false;
      }
      break;
    case 3:
      return false;
  }
  return true;
}

/** ECInterfaceCmd_20: page the word list up. */
function ECInterfaceCmd_20(): boolean {
  const r = R();
  switch (r.state) {
    case 0:
      UpdateWin2PrintWordsScrollPageUp();
      r.state++;
      break;
    case 1:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        const direction = GetECSelectWordRowsAbove() - GetBg2ScrollRow();
        ScheduleBg2VerticalScroll(direction, 4);
        r.state++;
      }
      break;
    case 2:
      if (!AnimateBg2VerticalScroll()) {
        UpdateVerticalScrollArrowVisibility();
        UpdateStartSelectButtonSpriteVisibility();
        r.state++;
        return false;
      }
      break;
    case 3:
      return false;
  }
  return true;
}

/** InitEasyChatGraphicsWork_Internal (easy_chat_3.c): Alloc always succeeds. */
function InitEasyChatGraphicsWork_Internal(): boolean {
  sEasyChatGraphicsResources = {
    state: 0, windowId: 0, id: 0, frameAnimIdx: 0, frameAnimTarget: 0, frameAnimDelta: 0, modeIconState: 0,
    ecPrintBuffer: [], ecPaddedWordBuffer: [], bg2ScrollRow: 0, tgtBgY: 0, deltaBgY: 0,
    selectDestFieldCursorSprite: null, rectCursorSpriteRight: null, rectCursorSpriteLeft: null,
    selectWordCursorSprite: null, selectGroupHelpSprite: null, modeIconsSprite: null,
    upTriangleCursorSprite: null, downTriangleCursorSprite: null, startPgUpButtonSprite: null,
    selectPgDnButtonSprite: null,
    bg1TilemapBuffer: new Uint16Array(BG_SCREEN_SIZE / 2),
    bg3TilemapBuffer: new Uint16Array(BG_SCREEN_SIZE / 2),
  };
  return true;
}

/** SetGpuRegsForEasyChatInit (easy_chat_3.c). */
function SetGpuRegsForEasyChatInit(): void {
  for (const bg of [3, 1, 2, 0]) {
    ChangeBgX(bg, 0, BG_COORD_SET);
    ChangeBgY(bg, 0, BG_COORD_SET);
  }
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_OBJ_ON | DISPCNT_WIN0_ON);
}

/** LoadEasyChatPals (easy_chat_3.c). */
function LoadEasyChatPals(): void {
  ResetPaletteFade();
  LoadPalette(incbin("gEasyChatWindow_Pal"), BG_PLTT_ID(0), PLTT_SIZE_4BPP);
  const orange = incbin("easy_chat_3.c:sTextInputFrameOrange_Pal");
  const green = incbin("easy_chat_3.c:sTextInputFrameGreen_Pal");
  const title = incbin("easy_chat_3.c:sTitleText_Pal");
  const text = incbin("easy_chat_3.c:sText_Pal");
  LoadPalette(orange, BG_PLTT_ID(1), orange.length);
  LoadPalette(green, BG_PLTT_ID(4), green.length);
  LoadPalette(title, BG_PLTT_ID(10), title.length);
  LoadPalette(text, BG_PLTT_ID(11), text.length);
  LoadPalette(text, BG_PLTT_ID(15), text.length);
  LoadPalette(text, BG_PLTT_ID(3), text.length);
}

/** Game-text bytes (no terminator) of an easy-chat word, as CopyEasyChatWord writes them. */
function ecWordBytes(easyChatWord: number): number[] {
  const text = CopyEasyChatWord(easyChatWord) ?? "";
  const bytes = encode(text);
  const end = bytes.indexOf(0xff);
  return Array.from(end < 0 ? bytes : bytes.subarray(0, end));
}

/** PrintTitleText (easy_chat_3.c). */
function PrintTitleText(): void {
  const titleText = GetTitleText();
  if (titleText === null) return;
  const xOffset = Math.trunc((128 - GetStringWidth(FONT_NORMAL_COPY_1, titleText, 0)) / 2);
  FillWindowPixelBuffer(0, PIXEL_FILL(0));
  EC_AddTextPrinterParameterized2(0, FONT_NORMAL_COPY_1, titleText, xOffset, 0, C.TEXT_SKIP_DRAW, C.TEXT_COLOR_TRANSPARENT, C.TEXT_COLOR_DARK_GRAY, C.TEXT_COLOR_LIGHT_GRAY);
  PutWindowTilemap(0);
  CopyWindowToVram(0, COPYWIN_FULL);
}

/** EC_AddTextPrinterParameterized (easy_chat_3.c). */
function EC_AddTextPrinterParameterized(windowId: number, fontId: number, str: ArrayLike<number>, x: number, y: number, speed: number): void {
  if (fontId === FONT_NORMAL_COPY_1) y += 2;
  AddTextPrinterParameterized(windowId, fontId, str, x, y, speed, null);
}

/** EC_AddTextPrinterParameterized2 (easy_chat_3.c). */
function EC_AddTextPrinterParameterized2(windowId: number, fontId: number, str: ArrayLike<number>, x: number, y: number, speed: number, bg: number, fg: number, shadow: number): void {
  if (fontId === FONT_NORMAL_COPY_1) y += 2;
  AddTextPrinterParameterized3(windowId, fontId, x, y, [bg, fg, shadow], speed, str);
}

/** PrintECInstructionsText (easy_chat_3.c). */
function PrintECInstructionsText(): void {
  FillBgTilemapBufferRect(0, 0, 0, 0, 32, 20, 17);
  LoadUserWindowGfx(1, 1, BG_PLTT_ID(14));
  DrawTextBorderOuter(1, 1, 14);
  PrintECInterfaceTextById(0);
  PutWindowTilemap(1);
  CopyBgTilemapBufferToVram(0);
}

/** PrintECInterfaceTextById (easy_chat_3.c). */
function PrintECInterfaceTextById(direction: number): void {
  let text1: Uint8Array | null = null;
  let text2: Uint8Array | null = null;
  switch (direction) {
    case 0: [text1, text2] = GetEasyChatInstructionsText(); break;
    case 2: [text1, text2] = GetEasyChatConfirmCancelText(); break;
    case 3: [text1, text2] = GetEasyChatConfirmText(); break;
    case 1: [text1, text2] = GetEasyChatConfirmDeletionText(); break;
  }
  FillWindowPixelBuffer(1, PIXEL_FILL(1));
  if (text1) EC_AddTextPrinterParameterized(1, FONT_NORMAL_COPY_1, text1, 0, 0, C.TEXT_SKIP_DRAW);
  if (text2) EC_AddTextPrinterParameterized(1, FONT_NORMAL_COPY_1, text2, 0, 16, C.TEXT_SKIP_DRAW);
  CopyWindowToVram(1, COPYWIN_FULL);
}

/** EC_CreateYesNoMenuWithInitialCursorPos (easy_chat_3.c). */
function EC_CreateYesNoMenuWithInitialCursorPos(initialCursorPos: number): void {
  CreateYesNoMenu(ec3<WindowTemplate>("sEasyChatYesNoWindowTemplate"), FONT_NORMAL_COPY_1, 0, 2, 0x001, 14, initialCursorPos);
}

/** CreatePhraseFrameWindow (easy_chat_3.c). */
function CreatePhraseFrameWindow(): void {
  const frame = phraseFrame(GetEasyChatScreenFrameId());
  R().windowId = AddWindow({
    bg: 3, tilemapLeft: frame.left, tilemapTop: frame.top, width: frame.width, height: frame.height,
    paletteNum: 11, baseBlock: 0x060,
  });
  PutWindowTilemap(R().windowId);
}

/** PrintECFields (easy_chat_3.c). */
function PrintECFields(): void {
  const r = R();
  const ecWord = GetEasyChatWordBuffer();
  const numColumns = GetNumColumns();
  const numRows = GetNumRows();
  const frameId = GetEasyChatScreenFrameId();
  const clear17 = ec3<number[]>("sText_Clear17").slice(0, -1);
  let index = 0;
  FillWindowPixelBuffer(r.windowId, PIXEL_FILL(1));
  for (let i = 0; i < numRows; i++) {
    const str: number[] = [...clear17];
    for (let j = 0; j < numColumns; j++) {
      if (ecWord[index] !== 0xffff) {
        str.push(...ecWordBytes(ecWord[index]));
        index++;
      } else {
        index++;
        // WriteColorChangeControlCode(str, 0, TEXT_COLOR_RED)
        str.push(C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_COLOR, C.TEXT_COLOR_RED);
        for (let k = 0; k < 7; k++) str.push(C.CHAR_EXTRA_SYMBOL, C.CHAR_UNDERSCORE);
        str.push(C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_COLOR, C.TEXT_COLOR_DARK_GRAY);
      }
      str.push(...clear17);
      if (frameId === 2) {
        if (j === 0 && i === 4) break;
      }
    }
    str.push(C.EOS);
    EC_AddTextPrinterParameterized(r.windowId, FONT_NORMAL_COPY_1, str, 0, i * 16, C.TEXT_SKIP_DRAW);
  }
  CopyWindowToVram(r.windowId, COPYWIN_FULL);
}

/** DrawECFrameInTilemapBuffer (easy_chat_3.c). */
function DrawECFrameInTilemapBuffer(tilemap: Uint16Array): void {
  const frameId = GetEasyChatScreenFrameId();
  const frame = phraseFrame(frameId);
  tilemap.fill(0);
  let x: number;
  let y: number;
  if (frameId === 2) {
    const right = frame.left + frame.width;
    const bottom = frame.top + frame.height;
    for (y = frame.top; y < bottom; y++) {
      x = frame.left - 1;
      tilemap[y * 32 + x] = 0x1005;
      x++;
      for (; x < right; x++) tilemap[y * 32 + x] = 0x1000;
      tilemap[y * 32 + x] = 0x1007;
    }
  } else {
    y = frame.top - 1;
    x = frame.left - 1;
    const right = frame.left + frame.width;
    const bottom = frame.top + frame.height;
    tilemap[y * 32 + x] = 0x1001;
    x++;
    for (; x < right; x++) tilemap[y * 32 + x] = 0x1002;
    tilemap[y * 32 + x] = 0x1003;
    y++;
    for (; y < bottom; y++) {
      x = frame.left - 1;
      tilemap[y * 32 + x] = 0x1005;
      x++;
      for (; x < right; x++) tilemap[y * 32 + x] = 0x1000;
      tilemap[y * 32 + x] = 0x1007;
    }
    x = frame.left - 1;
    tilemap[y * 32 + x] = 0x1009;
    x++;
    for (; x < right; x++) tilemap[y * 32 + x] = 0x100a;
    tilemap[y * 32 + x] = 0x100b;
  }
}

/** PutWin2TilemapAndCopyToVram (easy_chat_3.c). */
function PutWin2TilemapAndCopyToVram(): void {
  PutWindowTilemap(2);
  CopyBgTilemapBufferToVram(2);
}

/** PrintECMenuById (easy_chat_3.c). */
function PrintECMenuById(id: number): void {
  InitBg2Scroll();
  FillWindowPixelBuffer(2, PIXEL_FILL(1));
  switch (id) {
    case 0: PrintECGroupsMenu(); break;
    case 1: PrintEasyChatKeyboardText(); break;
    case 2: PrintECWordsMenu(); break;
  }
  CopyWindowToVram(2, COPYWIN_GFX);
}

/** PrintECGroupOrAlphaMenu (easy_chat_3.c). */
function PrintECGroupOrAlphaMenu(): void {
  if (!IsEasyChatAlphaMode()) PrintECMenuById(0);
  else PrintECMenuById(1);
}

/** PrintECGroupsMenu (easy_chat_3.c). */
function PrintECGroupsMenu(): void {
  let i = 0;
  let y = 96;
  for (;;) {
    for (let x = 0; x < 2; x++) {
      const groupId = GetSelectedGroupByIndex(i++);
      if (groupId === C.EC_NUM_GROUPS) {
        ScheduleBg2VerticalScroll(GetECSelectGroupRowsAbove(), 0);
        return;
      }
      EC_AddTextPrinterParameterized(2, FONT_NORMAL_COPY_1, encode(GetEasyChatWordGroupName(groupId)), x * 84 + 10, y, C.TEXT_SKIP_DRAW);
    }
    y += 16;
  }
}

/** PrintEasyChatKeyboardText (easy_chat_3.c). */
function PrintEasyChatKeyboardText(): void {
  const keyboard = ec3<SymRef[]>("sEasyChatKeyboardAlphabet");
  for (let i = 0; i < keyboard.length; i++) {
    EC_AddTextPrinterParameterized(2, FONT_NORMAL_COPY_1, rom.text(keyboard[i].$sym), 10, 96 + i * 16, C.TEXT_SKIP_DRAW);
  }
}

/** PrintECWordsMenu (easy_chat_3.c). */
function PrintECWordsMenu(): void {
  PrintECRowsWin2(0, 4);
}

/** UpdateWin2PrintWordsScrollDown (easy_chat_3.c). */
function UpdateWin2PrintWordsScrollDown(): void {
  const rowsAbove = (GetECSelectWordRowsAbove() + 3) & 0xff;
  ClearECRowsWin2(rowsAbove, 1);
  PrintECRowsWin2(rowsAbove, 1);
}

/** UpdateWin2PrintWordsScrollUp (easy_chat_3.c). */
function UpdateWin2PrintWordsScrollUp(): void {
  const rowsAbove = GetECSelectWordRowsAbove();
  ClearECRowsWin2(rowsAbove, 1);
  PrintECRowsWin2(rowsAbove, 1);
}

/** UpdateWin2PrintWordsScrollPageDown (easy_chat_3.c). */
function UpdateWin2PrintWordsScrollPageDown(): void {
  const row = GetECSelectWordRowsAbove();
  let maxrow = (row + 4) & 0xff;
  const numrowsplus1 = (GetECSelectWordNumRows() + 1) & 0xff;
  if (maxrow > numrowsplus1) maxrow = numrowsplus1;
  if (row < maxrow) {
    const remrow = maxrow - row;
    ClearECRowsWin2(row, remrow);
    PrintECRowsWin2(row, remrow);
  }
}

/** UpdateWin2PrintWordsScrollPageUp (easy_chat_3.c). */
function UpdateWin2PrintWordsScrollPageUp(): void {
  const row = GetECSelectWordRowsAbove();
  const maxrow = GetBg2ScrollRow() & 0xff;
  if (row < maxrow) {
    const remrow = maxrow - row;
    ClearECRowsWin2(row, remrow);
    PrintECRowsWin2(row, remrow);
  }
}

/** PrintECRowsWin2 (easy_chat_3.c). */
function PrintECRowsWin2(row: number, remrow: number): void {
  let ecWordIdx = row * 2;
  let y = (row * 16 + 96) & 0xff;
  for (let i = 0; i < remrow; i++) {
    for (let j = 0; j < 2; j++) {
      const y_ = ((y << 18) >>> 18) & 0xff; // C: u8 y_ = y << 18 >> 18 (low 14 bits, then u8)
      const easyChatWord = GetDisplayedWordByIndex(ecWordIdx++);
      if (easyChatWord !== 0xffff) {
        const padded = encode(CopyEasyChatWordPadded(easyChatWord, 0));
        EC_AddTextPrinterParameterized(2, FONT_NORMAL_COPY_1, padded, (j * 13 + 3) * 8, y_, C.TEXT_SKIP_DRAW);
      }
    }
    y += 16;
  }
  CopyWindowToVram(2, COPYWIN_GFX);
}

/** ClearECRowsWin2 (easy_chat_3.c). */
function ClearECRowsWin2(row: number, remrow: number): void {
  const y = (row * 16 + 96) & 0xff;
  let heightToBottom = remrow * 16;
  const totalHeight = y + heightToBottom;
  let heightWrappedAround: number;
  if (totalHeight > 255) {
    heightWrappedAround = totalHeight - 256;
    heightToBottom = 256 - y;
  } else {
    heightWrappedAround = 0;
  }
  FillWindowPixelRect(2, PIXEL_FILL(1), 0, y, 224, heightToBottom);
  if (heightWrappedAround) FillWindowPixelRect(2, PIXEL_FILL(1), 0, 0, 224, heightWrappedAround);
}

/** ClearWin2AndCopyToVram (easy_chat_3.c). */
function ClearWin2AndCopyToVram(): void {
  FillWindowPixelBuffer(2, PIXEL_FILL(1));
  CopyWindowToVram(2, COPYWIN_GFX);
}

/** StartWin2FrameAnim (easy_chat_3.c). */
function StartWin2FrameAnim(animNo: number): void {
  const r = R();
  switch (animNo) {
    case 0: r.frameAnimIdx = 0; r.frameAnimTarget = 10; break;
    case 1: r.frameAnimIdx = 9; r.frameAnimTarget = 0; break;
    case 2: r.frameAnimIdx = 11; r.frameAnimTarget = 17; break;
    case 3: r.frameAnimIdx = 17; r.frameAnimTarget = 0; break;
    case 4: r.frameAnimIdx = 17; r.frameAnimTarget = 10; break;
    case 5: r.frameAnimIdx = 18; r.frameAnimTarget = 22; break;
    case 6: r.frameAnimIdx = 22; r.frameAnimTarget = 18; break;
  }
  r.frameAnimDelta = r.frameAnimIdx < r.frameAnimTarget ? 1 : -1;
}

/** AnimateFrameResize (easy_chat_3.c). */
function AnimateFrameResize(): boolean {
  const r = R();
  if (r.frameAnimIdx === r.frameAnimTarget) return false;
  r.frameAnimIdx += r.frameAnimDelta;
  RedrawFrameByIndex(r.frameAnimIdx);
  return r.frameAnimIdx !== r.frameAnimTarget;
}

/** sRedrawFrameRects: RedrawFrameByRect arguments per RedrawFrameByIndex case (1..22). */
const sFrameRects: Record<number, [number, number, number, number]> = {
  1: [11, 14, 3, 2], 2: [9, 14, 7, 2], 3: [7, 14, 11, 2], 4: [5, 14, 15, 2], 5: [3, 14, 19, 2], 6: [1, 14, 23, 2],
  7: [1, 13, 23, 4], 8: [1, 12, 23, 6], 9: [1, 11, 23, 8], 10: [1, 10, 23, 10], 11: [1, 10, 24, 10],
  12: [1, 10, 25, 10], 13: [1, 10, 26, 10], 14: [1, 10, 27, 10], 15: [1, 10, 28, 10], 16: [1, 10, 29, 10],
  17: [0, 10, 30, 10], 18: [1, 10, 23, 10], 19: [1, 11, 23, 8], 20: [1, 12, 23, 6], 21: [1, 13, 23, 4], 22: [1, 14, 23, 2],
};

/** RedrawFrameByIndex (easy_chat_3.c). */
function RedrawFrameByIndex(direction: number): void {
  FillBgTilemapBufferRect_Palette0(1, 0, 0, 10, 30, 10);
  const rect = sFrameRects[direction];
  if (rect) RedrawFrameByRect(rect[0], rect[1], rect[2], rect[3]);
  CopyBgTilemapBufferToVram(1);
}

/** RedrawFrameByRect (easy_chat_3.c). */
function RedrawFrameByRect(left: number, top: number, width: number, height: number): void {
  const tilemap = R().bg1TilemapBuffer;
  const right = left + width - 1;
  const bottom = top + height - 1;
  let x = left;
  let y = top;
  tilemap[y * 32 + x] = 0x4001;
  x++;
  for (; x < right; x++) tilemap[y * 32 + x] = 0x4002;
  tilemap[y * 32 + x] = 0x4003;
  y++;
  for (; y < bottom; y++) {
    tilemap[y * 32 + left] = 0x4005;
    x = left + 1;
    for (; x < right; x++) tilemap[y * 32 + x] = 0x4000;
    tilemap[y * 32 + x] = 0x4007;
  }
  tilemap[y * 32 + left] = 0x4009;
  x = left + 1;
  for (; x < right; x++) tilemap[y * 32 + x] = 0x400a;
  tilemap[y * 32 + x] = 0x400b;
  SetRegWin0Coords((left + 1) * 8, (top + 1) * 8, (width - 2) * 8, (height - 2) * 8);
}

/** InitBg2Scroll (easy_chat_3.c). */
function InitBg2Scroll(): void {
  ChangeBgY(2, 0x800, BG_COORD_SET);
  R().bg2ScrollRow = 0;
}

/** ScheduleBg2VerticalScroll (easy_chat_3.c). */
function ScheduleBg2VerticalScroll(direction: number, speed: number): void {
  const r = R();
  let bgY = GetBgY(2);
  r.bg2ScrollRow += direction;
  const totalDelta = direction * 16;
  bgY += totalDelta << 8;
  if (speed) {
    r.tgtBgY = bgY;
    r.deltaBgY = speed * 256;
    if (totalDelta < 0) r.deltaBgY = -r.deltaBgY;
  } else {
    ChangeBgY(2, bgY, BG_COORD_SET);
  }
}

/** AnimateBg2VerticalScroll (easy_chat_3.c). */
function AnimateBg2VerticalScroll(): boolean {
  const r = R();
  if (GetBgY(2) === r.tgtBgY) return false;
  ChangeBgY(2, r.deltaBgY, BG_COORD_ADD);
  return true;
}

/** GetBg2ScrollRow (easy_chat_3.c). */
function GetBg2ScrollRow(): number {
  return R().bg2ScrollRow;
}

/** SetRegWin0Coords (easy_chat_3.c). */
function SetRegWin0Coords(left: number, top: number, width: number, height: number): void {
  SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(left & 0xff, (left & 0xff) + (width & 0xff)));
  SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(top & 0xff, (top & 0xff) + (height & 0xff)));
}

/** LoadSpriteGfx (easy_chat_3.c). */
function LoadSpriteGfx(): void {
  const tri = incbin("easy_chat_3.c:sTriangleCursor_Gfx");
  const scroll = incbin("easy_chat_3.c:sScrollIndicator_Gfx");
  const buttons = incbin("easy_chat_3.c:sStartSelectButtons_Gfx");
  LoadSpriteSheet({ data: tri, size: 0x20, tag: GFXTAG_TRIANGLE_CURSOR });
  LoadSpriteSheet({ data: scroll, size: 0x100, tag: GFXTAG_SCROLL_INDICATOR });
  LoadSpriteSheet({ data: buttons, size: 0x100, tag: GFXTAG_START_SELECT_BUTTONS });
  LoadSpritePalettes([
    { data: incbin("easy_chat_3.c:sTriangleCursor_Pal"), tag: 0 },
    { data: incbin("easy_chat_3.c:sRectangleCursor_Pal"), tag: 1 },
    { data: incbin("gEasyChatButtonWindow_Pal"), tag: 2 }, // generated from the button window, used for various UI parts
    { data: incbin("easy_chat_3.c:sRSInterviewFrame_Pal"), tag: 3 },
  ]);
  LoadSpriteSheet({ data: incbin("easy_chat_3.c:sRSInterviewFrame_Gfx"), size: 0x800, tag: GFXTAG_RS_INTERVIEW_FRAME });
  LoadSpriteSheet({ data: incbin("gEasyChatRectangleCursor_Gfx"), size: 0x1000, tag: GFXTAG_RECTANGLE_CURSOR });
  LoadSpriteSheet({ data: incbin("gEasyChatButtonWindow_Gfx"), size: 0x800, tag: GFXTAG_BUTTON_WINDOW });
  LoadSpriteSheet({ data: incbin("gEasyChatMode_Gfx"), size: 0x1000, tag: GFXTAG_MODE_WINDOW });
}

/** CreateSelectDestFieldCursorSprite (easy_chat_3.c). */
function CreateSelectDestFieldCursorSprite(): void {
  const frame = phraseFrame(GetEasyChatScreenFrameId());
  const x = frame.left * 8 + 13;
  const y = (frame.top + 1) * 8 + 1;
  const spriteId = CreateSprite(sTemplate("sSpriteTemplate_TriangleCursor"), x, y, 2);
  R().selectDestFieldCursorSprite = gSprites[spriteId];
  gSprites[spriteId].data[1] = 1;
}

/** SpriteCB_BounceCursor (easy_chat_3.c). */
function SpriteCB_BounceCursor(sprite: Sprite): void {
  if (sprite.data[1]) {
    if (++sprite.data[0] > 2) {
      sprite.data[0] = 0;
      if (++sprite.x2 > 0) sprite.x2 = -6;
    }
  }
}

/** SetSelectDestFieldCursorSpritePosAndResetAnim (easy_chat_3.c). */
function SetSelectDestFieldCursorSpritePosAndResetAnim(x: number, y: number): void {
  const sprite = R().selectDestFieldCursorSprite!;
  sprite.x = x & 0xff;
  sprite.y = y & 0xff;
  sprite.x2 = 0;
  sprite.data[0] = 0;
}

/** FreezeSelectDestFieldCursorSprite (easy_chat_3.c). */
function FreezeSelectDestFieldCursorSprite(): void {
  const sprite = R().selectDestFieldCursorSprite!;
  sprite.data[0] = 0;
  sprite.data[1] = 0;
  sprite.x2 = 0;
}

/** UnfreezeSelectDestFieldCursorSprite (easy_chat_3.c). */
function UnfreezeSelectDestFieldCursorSprite(): void {
  R().selectDestFieldCursorSprite!.data[1] = 1;
}

/** CreateRedRectangularCursorSpritePair (easy_chat_3.c). */
function CreateRedRectangularCursorSpritePair(): void {
  const r = R();
  let spriteId = CreateSprite(sTemplate("sSpriteTemplate_RectangleCursor"), 0, 0, 3);
  r.rectCursorSpriteRight = gSprites[spriteId];
  r.rectCursorSpriteRight.x2 = 32;
  spriteId = CreateSprite(sTemplate("sSpriteTemplate_RectangleCursor"), 0, 0, 3);
  r.rectCursorSpriteLeft = gSprites[spriteId];
  r.rectCursorSpriteLeft.x2 = -32;
  r.rectCursorSpriteRight.hFlip = 1;
  EC_MoveCursor();
}

/** DestroyRedRectangularCursor (easy_chat_3.c). */
function DestroyRedRectangularCursor(): void {
  const r = R();
  DestroySprite(r.rectCursorSpriteRight!);
  r.rectCursorSpriteRight = null;
  DestroySprite(r.rectCursorSpriteLeft!);
  r.rectCursorSpriteLeft = null;
}

/** EC_MoveCursor (easy_chat_3.c). */
function EC_MoveCursor(): void {
  const r = R();
  if (r.rectCursorSpriteRight && r.rectCursorSpriteLeft) {
    const [x, y] = GetECSelectGroupCursorCoords();
    if (!IsEasyChatAlphaMode()) MoveCursor_Group(x, y);
    else MoveCursor_Alpha(x, y);
  }
}

function placeRectCursor(anim: number, x: number, y: number): void {
  const r = R();
  for (const sprite of [r.rectCursorSpriteRight!, r.rectCursorSpriteLeft!]) {
    StartSpriteAnim(sprite, anim);
    sprite.x = x;
    sprite.y = y;
  }
}

/** MoveCursor_Group (easy_chat_3.c). */
function MoveCursor_Group(x: number, y: number): void {
  if (x !== -1) placeRectCursor(RECTCURSOR_ANIM_ON_GROUP, x * 84 + 58, y * 16 + 96);
  else placeRectCursor(RECTCURSOR_ANIM_ON_BUTTON, 216, y * 16 + 112);
}

/** MoveCursor_Alpha (easy_chat_3.c). */
function MoveCursor_Alpha(cursorX: number, cursorY: number): void {
  if (cursorX !== -1) {
    const y = cursorY * 16 + 96;
    let x = 32;
    let anim: number;
    if (cursorX === 6 && cursorY === 0) {
      x = 157;
      anim = RECTCURSOR_ANIM_ON_OTHERS;
    } else {
      const offsets = ec3<number[]>("sAlphabetKeyboardColumnOffsets");
      x += offsets[cursorX < NUM_ALPHABET_COLUMNS ? cursorX : 0];
      anim = RECTCURSOR_ANIM_ON_LETTER;
    }
    placeRectCursor(anim, x, y);
  } else {
    placeRectCursor(RECTCURSOR_ANIM_ON_BUTTON, 216, cursorY * 16 + 112);
  }
}

/** CreateSelectWordCursorSprite (easy_chat_3.c). */
function CreateSelectWordCursorSprite(): void {
  const spriteId = CreateSprite(sTemplate("sSpriteTemplate_TriangleCursor"), 0, 0, 4);
  const sprite = gSprites[spriteId];
  R().selectWordCursorSprite = sprite;
  sprite.callback = SpriteCB_SelectWordCursorSprite;
  sprite.oam.priority = 2;
  SetSelectWordCursorSpritePos();
}

/** SpriteCB_SelectWordCursorSprite (easy_chat_3.c). */
function SpriteCB_SelectWordCursorSprite(sprite: Sprite): void {
  if (++sprite.data[0] > 2) {
    sprite.data[0] = 0;
    if (++sprite.x2 > 0) sprite.x2 = -6;
  }
}

/** SetSelectWordCursorSpritePos (easy_chat_3.c). */
function SetSelectWordCursorSpritePos(): void {
  const [cursorX, cursorY] = GetECSelectWordCursorCoords();
  const x = (cursorX * 13 + 3) & 0xff;
  const y = (cursorY * 2 + 11) & 0xff;
  SetSelectWordCursorSpritePosExplicit(x, y);
}

/** SetSelectWordCursorSpritePosExplicit (easy_chat_3.c). */
function SetSelectWordCursorSpritePosExplicit(x: number, y: number): void {
  const sprite = R().selectWordCursorSprite;
  if (sprite) {
    sprite.x = x * 8 + 4;
    sprite.y = (y + 1) * 8 + 1;
    sprite.x2 = 0;
    sprite.data[0] = 0;
  }
}

/** DestroySelectWordCursorSprite (easy_chat_3.c). */
function DestroySelectWordCursorSprite(): void {
  const r = R();
  if (r.selectWordCursorSprite) {
    DestroySprite(r.selectWordCursorSprite);
    r.selectWordCursorSprite = null;
  }
}

/** CreateSelectGroupHelpSprite (easy_chat_3.c). */
function CreateSelectGroupHelpSprite(): void {
  const r = R();
  let spriteId = CreateSprite(sTemplate("sSpriteTemplate_ButtonWindow"), 208, 128, 6);
  r.selectGroupHelpSprite = gSprites[spriteId];
  r.selectGroupHelpSprite.x2 = -64;
  spriteId = CreateSprite(sTemplate("sSpriteTemplate_ModeWindow"), 208, 80, 5);
  r.modeIconsSprite = gSprites[spriteId];
  r.modeIconState = 0;
}

/** AnimateSeletGroupModeAndHelpSpriteEnter (easy_chat_3.c). */
function AnimateSeletGroupModeAndHelpSpriteEnter(): boolean {
  const r = R();
  switch (r.modeIconState) {
    case 0:
      r.selectGroupHelpSprite!.x2 += 8;
      if (r.selectGroupHelpSprite!.x2 >= 0) {
        r.selectGroupHelpSprite!.x2 = 0;
        if (!IsEasyChatAlphaMode()) StartSpriteAnim(r.modeIconsSprite!, MODEWINDOW_ANIM_TO_GROUP);
        else StartSpriteAnim(r.modeIconsSprite!, MODEWINDOW_ANIM_TO_ALPHABET);
        r.modeIconState++;
      }
      break;
    case 1:
      if (r.modeIconsSprite!.animEnded) {
        r.modeIconState = 2;
        return false;
      }
      break;
    default:
      return false;
  }
  return true;
}

/** StartModeIconHidingAnimation (easy_chat_3.c). */
function StartModeIconHidingAnimation(): void {
  R().modeIconState = 0;
  StartSpriteAnim(R().modeIconsSprite!, MODEWINDOW_ANIM_TO_HIDDEN);
}

/** RunModeIconHidingAnimation (easy_chat_3.c). */
function RunModeIconHidingAnimation(): boolean {
  const r = R();
  switch (r.modeIconState) {
    case 0:
      if (r.modeIconsSprite!.animEnded) r.modeIconState = 1;
      break;
    case 1:
      r.selectGroupHelpSprite!.x2 -= 8;
      if (r.selectGroupHelpSprite!.x2 <= -64) {
        DestroySprite(r.modeIconsSprite!);
        DestroySprite(r.selectGroupHelpSprite!);
        r.modeIconsSprite = null;
        r.selectGroupHelpSprite = null;
        r.modeIconState++;
        return false;
      }
      break;
    default:
      return false;
  }
  return true;
}

/** ShrinkModeIconsSprite (easy_chat_3.c). */
function ShrinkModeIconsSprite(): void {
  StartSpriteAnim(R().modeIconsSprite!, MODEWINDOW_ANIM_TRANSITION);
}

/** ShowModeIconsSprite (easy_chat_3.c). */
function ShowModeIconsSprite(): void {
  if (!IsEasyChatAlphaMode()) StartSpriteAnim(R().modeIconsSprite!, MODEWINDOW_ANIM_TO_GROUP);
  else StartSpriteAnim(R().modeIconsSprite!, MODEWINDOW_ANIM_TO_ALPHABET);
}

/** ModeIconsSpriteAnimIsEnded (easy_chat_3.c): TRUE while the animation is still running. */
function ModeIconsSpriteAnimIsEnded(): boolean {
  return !R().modeIconsSprite!.animEnded;
}

/** CreateVerticalScrollArrowSprites (easy_chat_3.c). */
function CreateVerticalScrollArrowSprites(): void {
  const r = R();
  let spriteId = CreateSprite(sTemplate("sSpriteTemplate_ScrollIndicator"), 96, 80, 0);
  if (spriteId !== MAX_SPRITES) r.upTriangleCursorSprite = gSprites[spriteId];
  spriteId = CreateSprite(sTemplate("sSpriteTemplate_ScrollIndicator"), 96, 156, 0);
  if (spriteId !== MAX_SPRITES) {
    r.downTriangleCursorSprite = gSprites[spriteId];
    r.downTriangleCursorSprite.vFlip = 1;
  }
  HideVerticalScrollArrowSprites();
}

/** UpdateVerticalScrollArrowVisibility (easy_chat_3.c). */
function UpdateVerticalScrollArrowVisibility(): void {
  R().upTriangleCursorSprite!.invisible = !ShouldDrawECUpArrow();
  R().downTriangleCursorSprite!.invisible = !ShouldDrawECDownArrow();
}

/** HideVerticalScrollArrowSprites (easy_chat_3.c). */
function HideVerticalScrollArrowSprites(): void {
  R().upTriangleCursorSprite!.invisible = true;
  R().downTriangleCursorSprite!.invisible = true;
}

/** UpdateVerticalScrollArrowSpriteXPos (easy_chat_3.c). */
function UpdateVerticalScrollArrowSpriteXPos(direction: number): void {
  const x = !direction ? 96 : 120; // group select / word select
  R().upTriangleCursorSprite!.x = x;
  R().downTriangleCursorSprite!.x = x;
}

/** CreateStartSelectButtonsSprites (easy_chat_3.c). */
function CreateStartSelectButtonsSprites(): void {
  const r = R();
  let spriteId = CreateSprite(sTemplate("sSpriteTemplate_StartSelectButtons"), 220, 84, 1);
  if (spriteId !== MAX_SPRITES) r.startPgUpButtonSprite = gSprites[spriteId];
  spriteId = CreateSprite(sTemplate("sSpriteTemplate_StartSelectButtons"), 220, 156, 1);
  if (spriteId !== MAX_SPRITES) {
    r.selectPgDnButtonSprite = gSprites[spriteId];
    StartSpriteAnim(r.selectPgDnButtonSprite, 1);
  }
  HideStartSelectButtonSprites();
}

/** UpdateStartSelectButtonSpriteVisibility (easy_chat_3.c). */
function UpdateStartSelectButtonSpriteVisibility(): void {
  R().startPgUpButtonSprite!.invisible = !ShouldDrawECUpArrow();
  R().selectPgDnButtonSprite!.invisible = !ShouldDrawECDownArrow();
}

/** HideStartSelectButtonSprites (easy_chat_3.c). */
function HideStartSelectButtonSprites(): void {
  R().startPgUpButtonSprite!.invisible = true;
  R().selectPgDnButtonSprite!.invisible = true;
}

/** CreateFooterWindow (easy_chat_3.c). */
function CreateFooterWindow(): void {
  const windowId = AddWindow({ bg: 3, tilemapLeft: 4, tilemapTop: 11, width: 24, height: 2, paletteNum: 11, baseBlock: 0x030 });
  FillWindowPixelBuffer(windowId, PIXEL_FILL(1));
  EC_AddTextPrinterParameterized(windowId, FONT_NORMAL_COPY_1, rom.text("gText_DelAllCancelOk"), 0, 0, 0);
  PutWindowTilemap(windowId);
}

