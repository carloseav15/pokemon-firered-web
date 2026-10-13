// pokemon_storage_system_data.c: cursor movement, picking up / placing / shifting mons, the released-mon checks,
// the display-mon text buffers, the four per-area input handlers and the selection menu.
import { sound } from "./audio/sound";
import * as C from "./generated/constants";
import { ConvertIntToDecimalStringN, StringCopyPadded, StringFill, StringGet_Nickname } from "./generated/stringUtil";
import { STR_CONV_MODE_LEFT_ALIGN } from "./gba/charmap";
import { FONT_NORMAL_COPY_1 } from "./gba/font";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, joy, L_BUTTON, R_BUTTON, SELECT_BUTTON, START_BUTTON } from "./gba/input";
import { LoadSpritePalettes, LoadSpriteSheets, IndexOfSpritePaletteTag, CreateSprite, gSprites, MAX_SPRITES, StartSpriteAnim, type Sprite, type SpriteTemplate } from "./hw/sprite";
import { incbin } from "./hw/assets";
import { oamData, gDummySpriteAffineAnimTable, gDummySpriteAnimTable, ANIMCMD_FRAME, ANIMCMD_JUMP, ANIMCMD_END } from "./hw/sprite";
import {
  ClearStdWindowAndFrameToTransparent, DrawStdFrameWithCustomTileAndPalette, Menu_GetCursorPos, Menu_InitCursor, Menu_MoveCursor,
  PrintTextArray,
} from "./hw/menu";
import { ClearWindowTilemap, AddWindow, RemoveWindow } from "./hw/window";
import { ScheduleBgCopyTilemapToVram, CopyItemName } from "./hw/menuHelpers";
import { GetMonSpritePalFromSpeciesAndPersonality } from "./pokemon/pics";
import {
  GetGenderFromSpeciesAndPersonality, GetMonData, GetMonGender, MonRestorePP, SetMonData, zeroMon, type Mon,
} from "./pokemon/mon";
import { isMailItem } from "./pokemon/mail";
import { speciesName } from "./pokemon/pokemon";
import {
  BoxMonAtToMon, GetAndCopyBoxMonDataAt, GetBoxedMonPtr, GetCurrentBoxMonData, SetBoxMonAt, SetCurrentBoxMonData, StorageGetCurrentBox,
  ZeroBoxMonAt,
} from "./pokemon/storage";
import { rom } from "./rom";
import { save } from "./save";
import { GetLastViewedMonIndex } from "./pokemonSummaryScreen";
import {
  CHANGE_GRAB, CHANGE_PLACE, CHANGE_SHIFT, CURSOR_AREA_BOX_TITLE, CURSOR_AREA_BUTTONS, CURSOR_AREA_IN_BOX, CURSOR_AREA_IN_PARTY,
  GFXTAG_CURSOR, GFXTAG_CURSOR_SHADOW, gS, IN_BOX_COLUMNS, IN_BOX_COUNT, INPUT_BOX_OPTIONS, INPUT_CLOSE_BOX, INPUT_DEPOSIT, INPUT_GIVE_ITEM,
  INPUT_HIDE_PARTY, INPUT_IN_MENU, INPUT_MOVE_CURSOR, INPUT_MOVE_MON, INPUT_MULTIMOVE_CHANGE_SELECTION, INPUT_MULTIMOVE_GRAB_SELECTION,
  INPUT_MULTIMOVE_MOVE_MONS, INPUT_MULTIMOVE_PLACE_MONS, INPUT_MULTIMOVE_SINGLE, INPUT_MULTIMOVE_START, INPUT_MULTIMOVE_UNABLE, INPUT_NONE,
  INPUT_PLACE_MON, INPUT_PRESSED_B, INPUT_SCROLL_LEFT, INPUT_SCROLL_RIGHT, INPUT_SHIFT_MON, INPUT_SHOW_PARTY, INPUT_SWITCH_ITEMS,
  INPUT_TAKE_ITEM, INPUT_WITHDRAW, MENU_TEXT_BAG, MENU_TEXT_CANCEL, MENU_TEXT_GIVE, MENU_TEXT_GIVE2, MENU_TEXT_INFO, MENU_TEXT_JUMP,
  MENU_TEXT_MARK, MENU_TEXT_MOVE, MENU_TEXT_NAME, MENU_TEXT_PLACE, MENU_TEXT_RELEASE, MENU_TEXT_SHIFT, MENU_TEXT_STORE, MENU_TEXT_SUMMARY,
  MENU_TEXT_SWITCH, MENU_TEXT_TAKE, MENU_TEXT_WALLPAPER, MENU_TEXT_WITHDRAW, MODE_BOX, MODE_MOVE, MODE_PARTY, OPTION_DEPOSIT,
  OPTION_MOVE_ITEMS, OPTION_MOVE_MONS, PALTAG_MISC_1, PALTAG_MISC_2, PARTY_SIZE, RELEASE_MON_ALLOWED, RELEASE_MON_NOT_ALLOWED,
  RELEASE_MON_UNDETERMINED, sParty, TOTAL_BOXES_COUNT,
} from "./storageSystemInternal";
import {
  AnimateBoxScrollArrows, CreateBoxMonIconAtPos, CreateMovingMonIcon, DestroyMovingMonIcon, DestroyPartyMonIcon, DestroyReleaseMonIcon,
  DoReleaseMonAnim, SetMovingMonPriority, SetMovingMonSprite, SetPlacedMonSprite, SetShiftMonSpritePtr, ShiftMons,
  TryHideReleaseMonSprite,
} from "./storageSystemGraphics";
import { GetFirstFreeBoxSpot } from "./menus/storageMenu";
import {
  IsActiveItemMoving, IsItemIconAnimActive, MultiMove_CanPlaceSelection, MultiMove_GetOriginPosition, MultiMove_TryMoveGroup,
  TryHideItemIconAtPos, TryLoadItemIconAtPos,
} from "./storageSystemMisc";

const DISPLAY_WIDTH = 240;
const DISPLAY_HEIGHT = 160;

let sMonBeingCarried: Mon = zeroMon();
let sCursorArea = 0;
let sCursorPosition = 0;
let sIsMonBeingMoved = false;
let sMovingMonOrigBoxId = 0;
let sMovingMonOrigBoxPos = 0;
let sInMultiMoveMode = false;
let sSavedCursorPosition = 0;

// Modes for selecting and moving Pokémon in the box.
const MOVE_MODE_NORMAL = 0;
const MOVE_MODE_MULTIPLE_SELECTING = 1;
const MOVE_MODE_MULTIPLE_MOVING = 2;

const JOY_NEW = (bits: number): boolean => (joy.newKeys & bits) !== 0;
const JOY_REPT = (bits: number): boolean => (joy.repeated & bits) !== 0;
const JOY_HELD = (bits: number): boolean => (joy.held & bits) !== 0;

/** CountPartyMons (pokemon_storage_system_menu.c), over the six working slots. */
export function CountPartyMons(): number {
  let count = 0;
  for (let i = 0; i < PARTY_SIZE; i++) if (GetMonData(sParty[i], C.MON_DATA_SPECIES) !== C.SPECIES_NONE) count++;
  return count;
}

/** CountPartyAliveNonEggMonsExcept (pokemon_storage_system_menu.c), over the six working slots. */
export function CountPartyAliveNonEggMonsExcept(slotToIgnore: number): number {
  let count = 0;
  for (let i = 0; i < PARTY_SIZE; i++) {
    if (i !== slotToIgnore && GetMonData(sParty[i], C.MON_DATA_SPECIES_OR_EGG) !== C.SPECIES_EGG
      && GetMonData(sParty[i], C.MON_DATA_SPECIES_OR_EGG) !== C.SPECIES_NONE && GetMonData(sParty[i], C.MON_DATA_HP) !== 0) count++;
  }
  return count;
}

/** InitCursor (pokemon_storage_system_data.c). */
export function InitCursor(): void {
  if (gS().boxOption !== OPTION_DEPOSIT) sCursorArea = CURSOR_AREA_IN_BOX;
  else sCursorArea = CURSOR_AREA_IN_PARTY;
  sCursorPosition = 0;
  sIsMonBeingMoved = false;
  sMovingMonOrigBoxId = 0;
  sMovingMonOrigBoxPos = 0;
  sInMultiMoveMode = false;
  ClearSavedCursorPos();
  CreateCursorSprites();
  gS().cursorPrevPartyPos = 1;
  gS().inBoxMovingMode = MOVE_MODE_NORMAL;
  TrySetDisplayMonData();
}

/** InitCursorOnReopen (pokemon_storage_system_data.c). */
export function InitCursorOnReopen(): void {
  CreateCursorSprites();
  ReshowDisplayMon();
  gS().cursorPrevPartyPos = 1;
  gS().inBoxMovingMode = MOVE_MODE_NORMAL;
  if (sIsMonBeingMoved) {
    gS().movingMon = sMonBeingCarried;
    CreateMovingMonIcon();
  }
}

/** GetCursorCoordsByPos (pokemon_storage_system_data.c). */
function GetCursorCoordsByPos(cursorArea: number, cursorPosition: number): [number, number] {
  let x = 0;
  let y = 0;
  switch (cursorArea) {
    case CURSOR_AREA_IN_BOX:
      x = (cursorPosition % IN_BOX_COLUMNS) * 24 + 100;
      y = Math.trunc(cursorPosition / IN_BOX_COLUMNS) * 24 + 32;
      break;
    case CURSOR_AREA_IN_PARTY:
      if (cursorPosition === 0) {
        x = 104;
        y = 52;
      } else if (cursorPosition === PARTY_SIZE) {
        x = 152;
        y = 132;
      } else {
        x = 152;
        y = (cursorPosition - 1) * 24 + 4;
      }
      break;
    case CURSOR_AREA_BOX_TITLE:
      x = 162;
      y = 12;
      break;
    case CURSOR_AREA_BUTTONS:
      y = sIsMonBeingMoved ? 8 : 14;
      x = cursorPosition * 88 + 120;
      break;
    case 4:
      x = 160;
      y = 96;
      break;
  }
  return [x, y];
}

/** GetSpeciesAtCursorPosition (pokemon_storage_system_data.c). */
function GetSpeciesAtCursorPosition(): number {
  switch (sCursorArea) {
    case CURSOR_AREA_IN_PARTY:
      return GetMonData(sParty[sCursorPosition] ?? zeroMon(), C.MON_DATA_SPECIES);
    case CURSOR_AREA_IN_BOX:
      return GetCurrentBoxMonData(sCursorPosition, C.MON_DATA_SPECIES);
    default:
      return C.SPECIES_NONE;
  }
}

/** UpdateCursorPos (pokemon_storage_system_data.c). */
export function UpdateCursorPos(): boolean {
  const g = gS();
  const cursor = g.cursorSprite!;
  if (g.cursorMoveSteps === 0) {
    if (g.boxOption !== OPTION_MOVE_ITEMS) return false;
    return IsItemIconAnimActive();
  } else if (--g.cursorMoveSteps !== 0) {
    // Update position toward target
    g.cursorNewX += g.cursorSpeedX;
    g.cursorNewY += g.cursorSpeedY;
    cursor.x = g.cursorNewX >> 8;
    cursor.y = g.cursorNewY >> 8;
    // Limit cursor on right
    if (cursor.x > DISPLAY_WIDTH + 16) {
      const tmp = cursor.x - (DISPLAY_WIDTH + 16);
      cursor.x = tmp + 64;
    }
    // Limit cursor on left
    if (cursor.x < 64) {
      const tmp = 64 - cursor.x;
      cursor.x = DISPLAY_WIDTH + 16 - tmp;
    }
    // Limit cursor on bottom
    if (cursor.y > DISPLAY_HEIGHT + 16) {
      const tmp = cursor.y - (DISPLAY_HEIGHT + 16);
      cursor.y = tmp - 16;
    }
    // Limit cursor on top
    if (cursor.y < -16) {
      const tmp = -16 - cursor.y;
      cursor.y = DISPLAY_HEIGHT + 16 - tmp;
    }
    // Cursor flips vertically when moving on/off the top buttons
    if (g.cursorFlipTimer && --g.cursorFlipTimer === 0) cursor.vFlip = cursor.vFlip === 0 ? 1 : 0;
  } else {
    // Time is up for cursor movement, make sure it's exactly at target
    cursor.x = g.cursorTargetX;
    cursor.y = g.cursorTargetY;
    DoCursorNewPosUpdate();
  }
  return true;
}

/** InitNewCursorPos (pokemon_storage_system_data.c). */
function InitNewCursorPos(newCursorArea: number, newCursorPosition: number): void {
  const [x, y] = GetCursorCoordsByPos(newCursorArea, newCursorPosition);
  gS().newCursorArea = newCursorArea;
  gS().newCursorPosition = newCursorPosition;
  gS().cursorTargetX = x;
  gS().cursorTargetY = y;
}

/** InitCursorMove (pokemon_storage_system_data.c). */
function InitCursorMove(): void {
  const g = gS();
  let yDistance: number;
  let xDistance: number;
  if (g.cursorVerticalWrap !== 0 || g.cursorHorizontalWrap !== 0) g.cursorMoveSteps = 12;
  else g.cursorMoveSteps = 6;
  if (g.cursorFlipTimer) g.cursorFlipTimer = Math.trunc(g.cursorMoveSteps / 2);
  switch (g.cursorVerticalWrap) {
    default:
      yDistance = g.cursorTargetY - g.cursorSprite!.y;
      break;
    case -1:
      yDistance = g.cursorTargetY - 192 - g.cursorSprite!.y;
      break;
    case 1:
      yDistance = g.cursorTargetY + 192 - g.cursorSprite!.y;
      break;
  }
  switch (g.cursorHorizontalWrap) {
    default:
      xDistance = g.cursorTargetX - g.cursorSprite!.x;
      break;
    case -1:
      xDistance = g.cursorTargetX - 192 - g.cursorSprite!.x;
      break;
    case 1:
      xDistance = g.cursorTargetX + 192 - g.cursorSprite!.x;
      break;
  }
  yDistance <<= 8;
  xDistance <<= 8;
  g.cursorSpeedX = Math.trunc(xDistance / g.cursorMoveSteps);
  g.cursorSpeedY = Math.trunc(yDistance / g.cursorMoveSteps);
  g.cursorNewX = g.cursorSprite!.x << 8;
  g.cursorNewY = g.cursorSprite!.y << 8;
}

/** SetCursorPosition (pokemon_storage_system_data.c). */
function SetCursorPosition(newCursorArea: number, newCursorPosition: number): void {
  const g = gS();
  InitNewCursorPos(newCursorArea, newCursorPosition);
  InitCursorMove();
  if (g.boxOption !== OPTION_MOVE_ITEMS) {
    if (g.inBoxMovingMode === MOVE_MODE_NORMAL && !sIsMonBeingMoved) StartSpriteAnim(g.cursorSprite!, 1);
  } else if (!IsActiveItemMoving()) {
    StartSpriteAnim(g.cursorSprite!, 1);
  }
  if (g.boxOption === OPTION_MOVE_ITEMS) {
    if (sCursorArea === CURSOR_AREA_IN_BOX) TryHideItemIconAtPos(CURSOR_AREA_IN_BOX, sCursorPosition);
    else if (sCursorArea === CURSOR_AREA_IN_PARTY) TryHideItemIconAtPos(CURSOR_AREA_IN_PARTY, sCursorPosition);
    if (newCursorArea === CURSOR_AREA_IN_BOX) TryLoadItemIconAtPos(newCursorArea, newCursorPosition);
    else if (newCursorArea === CURSOR_AREA_IN_PARTY) TryLoadItemIconAtPos(newCursorArea, newCursorPosition);
  }
  if (newCursorArea === CURSOR_AREA_IN_PARTY && sCursorArea !== CURSOR_AREA_IN_PARTY) {
    g.cursorPrevPartyPos = 1;
    g.cursorShadowSprite!.invisible = true;
  }
  switch (newCursorArea) {
    case CURSOR_AREA_IN_PARTY:
    case CURSOR_AREA_BOX_TITLE:
    case CURSOR_AREA_BUTTONS:
      g.cursorSprite!.oam.priority = 1;
      g.cursorShadowSprite!.invisible = true;
      g.cursorShadowSprite!.oam.priority = 1;
      break;
    case CURSOR_AREA_IN_BOX:
      if (g.inBoxMovingMode !== MOVE_MODE_NORMAL) {
        g.cursorSprite!.oam.priority = 0;
        g.cursorShadowSprite!.invisible = true;
      } else {
        g.cursorSprite!.oam.priority = 2;
        if (sCursorArea === CURSOR_AREA_IN_BOX && sIsMonBeingMoved) SetMovingMonPriority(2);
      }
      break;
  }
}

/** DoCursorNewPosUpdate (pokemon_storage_system_data.c). */
function DoCursorNewPosUpdate(): void {
  const g = gS();
  sCursorArea = g.newCursorArea;
  sCursorPosition = g.newCursorPosition;
  if (g.boxOption !== OPTION_MOVE_ITEMS) {
    if (g.inBoxMovingMode === MOVE_MODE_NORMAL && !sIsMonBeingMoved) StartSpriteAnim(g.cursorSprite!, 1);
  } else if (!IsActiveItemMoving()) {
    StartSpriteAnim(g.cursorSprite!, 1);
  }
  TrySetDisplayMonData();
  switch (sCursorArea) {
    case CURSOR_AREA_BUTTONS:
      SetMovingMonPriority(1);
      break;
    case CURSOR_AREA_BOX_TITLE:
      AnimateBoxScrollArrows(true);
      break;
    case CURSOR_AREA_IN_PARTY:
      g.cursorShadowSprite!.subpriority = 13;
      SetMovingMonPriority(1);
      break;
    case CURSOR_AREA_IN_BOX:
      if (g.inBoxMovingMode === MOVE_MODE_NORMAL) {
        g.cursorSprite!.oam.priority = 1;
        g.cursorShadowSprite!.oam.priority = 2;
        g.cursorShadowSprite!.subpriority = 21;
        g.cursorShadowSprite!.invisible = false;
        SetMovingMonPriority(2);
      }
      break;
  }
}

/** SetCursorInParty (pokemon_storage_system_data.c). */
export function SetCursorInParty(): void {
  let partyCount: number;
  if (!sIsMonBeingMoved) {
    partyCount = 0;
  } else {
    partyCount = CountPartyMons();
    if (partyCount >= PARTY_SIZE) partyCount = PARTY_SIZE - 1;
  }
  if (gS().cursorSprite!.vFlip) gS().cursorFlipTimer = 1;
  SetCursorPosition(CURSOR_AREA_IN_PARTY, partyCount);
}

/** SetCursorBoxPosition (pokemon_storage_system_data.c). */
export function SetCursorBoxPosition(cursorBoxPosition: number): void {
  SetCursorPosition(CURSOR_AREA_IN_BOX, cursorBoxPosition);
}

/** ClearSavedCursorPos (pokemon_storage_system_data.c). */
export function ClearSavedCursorPos(): void {
  sSavedCursorPosition = 0;
}

/** SaveCursorPos (pokemon_storage_system_data.c). */
export function SaveCursorPos(): void {
  sSavedCursorPosition = sCursorPosition;
}

/** GetSavedCursorPos (pokemon_storage_system_data.c). */
export function GetSavedCursorPos(): number {
  return sSavedCursorPosition;
}

/** InitMonPlaceChange (pokemon_storage_system_data.c). */
export function InitMonPlaceChange(type: number): void {
  const placeChangeFuncs: Record<number, () => boolean> = {
    [CHANGE_GRAB]: MonPlaceChange_Grab,
    [CHANGE_PLACE]: MonPlaceChange_Place,
    [CHANGE_SHIFT]: MonPlaceChange_Shift,
  };
  gS().monPlaceChangeFunc = placeChangeFuncs[type];
  gS().monPlaceChangeState = 0;
}

/** InitMultiMonPlaceChange (pokemon_storage_system_data.c). */
export function InitMultiMonPlaceChange(moveCursorUp: boolean): void {
  if (!moveCursorUp) gS().monPlaceChangeFunc = MonPlaceChange_DoMoveCursorDown;
  else gS().monPlaceChangeFunc = MonPlaceChange_DoMoveCursorUp;
  gS().monPlaceChangeState = 0;
}

/** DoMonPlaceChange (pokemon_storage_system_data.c). */
export function DoMonPlaceChange(): boolean {
  return gS().monPlaceChangeFunc!();
}

/** MonPlaceChange_Grab (pokemon_storage_system_data.c). */
function MonPlaceChange_Grab(): boolean {
  const g = gS();
  switch (g.monPlaceChangeState) {
    case 0:
      if (sIsMonBeingMoved) return false;
      StartSpriteAnim(g.cursorSprite!, 2);
      g.monPlaceChangeState++;
      break;
    case 1:
      if (!MonPlaceChange_MoveCursorDown()) {
        StartSpriteAnim(g.cursorSprite!, 3);
        MoveMon();
        g.monPlaceChangeState++;
      }
      break;
    case 2:
      if (!MonPlaceChange_MoveCursorUp()) g.monPlaceChangeState++;
      break;
    case 3:
      return false;
  }
  return true;
}

/** MonPlaceChange_Place (pokemon_storage_system_data.c). */
function MonPlaceChange_Place(): boolean {
  const g = gS();
  switch (g.monPlaceChangeState) {
    case 0:
      if (!MonPlaceChange_MoveCursorDown()) {
        StartSpriteAnim(g.cursorSprite!, 2);
        PlaceMon();
        g.monPlaceChangeState++;
      }
      break;
    case 1:
      if (!MonPlaceChange_MoveCursorUp()) {
        StartSpriteAnim(g.cursorSprite!, 0);
        g.monPlaceChangeState++;
      }
      break;
    case 2:
      return false;
  }
  return true;
}

/** MonPlaceChange_Shift (pokemon_storage_system_data.c). */
function MonPlaceChange_Shift(): boolean {
  const g = gS();
  switch (g.monPlaceChangeState) {
    case 0:
      switch (sCursorArea) {
        case CURSOR_AREA_IN_PARTY:
          g.shiftBoxId = TOTAL_BOXES_COUNT;
          break;
        case CURSOR_AREA_IN_BOX:
          g.shiftBoxId = StorageGetCurrentBox();
          break;
        default:
          return false;
      }
      StartSpriteAnim(g.cursorSprite!, 2);
      SetShiftMonSpritePtr(g.shiftBoxId, sCursorPosition);
      g.monPlaceChangeState++;
      break;
    case 1:
      if (!ShiftMons()) {
        StartSpriteAnim(g.cursorSprite!, 3);
        SetShiftedMonData(g.shiftBoxId, sCursorPosition);
        g.monPlaceChangeState++;
      }
      break;
    case 2:
      return false;
  }
  return true;
}

/** MonPlaceChange_DoMoveCursorDown (pokemon_storage_system_data.c). */
function MonPlaceChange_DoMoveCursorDown(): boolean {
  return MonPlaceChange_MoveCursorDown();
}

/** MonPlaceChange_DoMoveCursorUp (pokemon_storage_system_data.c). */
function MonPlaceChange_DoMoveCursorUp(): boolean {
  return MonPlaceChange_MoveCursorUp();
}

/** MonPlaceChange_MoveCursorDown (pokemon_storage_system_data.c). */
function MonPlaceChange_MoveCursorDown(): boolean {
  const cursor = gS().cursorSprite!;
  switch (cursor.y2) {
    default:
      cursor.y2++;
      break;
    case 0:
      cursor.y2++;
      break;
    case 8: // Cursor has reached bottom
      return false;
  }
  return true;
}

/** MonPlaceChange_MoveCursorUp (pokemon_storage_system_data.c). */
function MonPlaceChange_MoveCursorUp(): boolean {
  const cursor = gS().cursorSprite!;
  switch (cursor.y2) {
    case 0: // Cursor has reached top
      return false;
    default:
      cursor.y2--;
      break;
  }
  return true;
}

/** MoveMon (pokemon_storage_system_data.c). */
function MoveMon(): void {
  switch (sCursorArea) {
    case CURSOR_AREA_IN_PARTY:
      SetMovedMonData(TOTAL_BOXES_COUNT, sCursorPosition);
      SetMovingMonSprite(MODE_PARTY, sCursorPosition);
      break;
    case CURSOR_AREA_IN_BOX:
      if (gS().inBoxMovingMode === MOVE_MODE_NORMAL) {
        SetMovedMonData(StorageGetCurrentBox(), sCursorPosition);
        SetMovingMonSprite(MODE_BOX, sCursorPosition);
      }
      break;
    default:
      return;
  }
  sIsMonBeingMoved = true;
}

/** PlaceMon (pokemon_storage_system_data.c). */
function PlaceMon(): void {
  switch (sCursorArea) {
    case CURSOR_AREA_IN_PARTY:
      SetPlacedMonData(TOTAL_BOXES_COUNT, sCursorPosition);
      SetPlacedMonSprite(TOTAL_BOXES_COUNT, sCursorPosition);
      break;
    case CURSOR_AREA_IN_BOX: {
      const boxId = StorageGetCurrentBox();
      SetPlacedMonData(boxId, sCursorPosition);
      SetPlacedMonSprite(boxId, sCursorPosition);
      break;
    }
    default:
      return;
  }
  sIsMonBeingMoved = false;
}

/** DoTrySetDisplayMonData (pokemon_storage_system_data.c). */
export function DoTrySetDisplayMonData(): void {
  TrySetDisplayMonData();
}

/** SetMovedMonData (pokemon_storage_system_data.c). */
function SetMovedMonData(boxId: number, position: number): void {
  if (boxId === TOTAL_BOXES_COUNT) {
    gS().movingMon = sParty[sCursorPosition];
  } else {
    const mon = zeroMon();
    BoxMonAtToMon(boxId, position, mon);
    gS().movingMon = mon;
  }
  PurgeMonOrBoxMon(boxId, position);
  sMovingMonOrigBoxId = boxId;
  sMovingMonOrigBoxPos = position;
}

/** SetPlacedMonData (pokemon_storage_system_data.c). */
function SetPlacedMonData(boxId: number, position: number): void {
  if (boxId === TOTAL_BOXES_COUNT) {
    sParty[position] = gS().movingMon;
  } else {
    MonRestorePP(gS().movingMon);
    SetBoxMonAt(boxId, position, gS().movingMon);
  }
}

/** PurgeMonOrBoxMon (pokemon_storage_system_data.c). */
function PurgeMonOrBoxMon(boxId: number, position: number): void {
  if (boxId === TOTAL_BOXES_COUNT) sParty[position] = zeroMon();
  else ZeroBoxMonAt(boxId, position);
}

/** SetShiftedMonData (pokemon_storage_system_data.c). */
function SetShiftedMonData(boxId: number, position: number): void {
  const g = gS();
  if (boxId === TOTAL_BOXES_COUNT) {
    g.tempMon = sParty[position];
  } else {
    const mon = zeroMon();
    BoxMonAtToMon(boxId, position, mon);
    g.tempMon = mon;
  }
  SetPlacedMonData(boxId, position);
  g.movingMon = g.tempMon;
  SetDisplayMonData(g.movingMon, MODE_PARTY);
  sMovingMonOrigBoxId = boxId;
  sMovingMonOrigBoxPos = position;
}

/** TryStorePartyMonInBox (pokemon_storage_system_data.c). */
export function TryStorePartyMonInBox(boxId: number): boolean {
  const boxPosition = GetFirstFreeBoxSpot(boxId);
  if (boxPosition === -1) return false;
  if (sIsMonBeingMoved) {
    SetPlacedMonData(boxId, boxPosition);
    DestroyMovingMonIcon();
    sIsMonBeingMoved = false;
  } else {
    SetMovedMonData(TOTAL_BOXES_COUNT, sCursorPosition);
    SetPlacedMonData(boxId, boxPosition);
    DestroyPartyMonIcon(sCursorPosition);
  }
  if (boxId === StorageGetCurrentBox()) CreateBoxMonIconAtPos(boxPosition);
  StartSpriteAnim(gS().cursorSprite!, 1);
  return true;
}

/** ResetSelectionAfterDeposit (pokemon_storage_system_data.c). */
export function ResetSelectionAfterDeposit(): void {
  StartSpriteAnim(gS().cursorSprite!, 0);
  TrySetDisplayMonData();
}

/** InitReleaseMon (pokemon_storage_system_data.c). */
export function InitReleaseMon(): void {
  let mode: number;
  if (sIsMonBeingMoved) mode = MODE_MOVE;
  else if (sCursorArea === CURSOR_AREA_IN_PARTY) mode = MODE_PARTY;
  else mode = MODE_BOX;
  DoReleaseMonAnim(mode, sCursorPosition);
  gS().releaseMonName.set(gS().displayMonNickname.subarray(0, gS().releaseMonName.length));
}

/** TryHideReleaseMon (pokemon_storage_system_data.c). */
export function TryHideReleaseMon(): boolean {
  if (!TryHideReleaseMonSprite()) {
    StartSpriteAnim(gS().cursorSprite!, 0);
    return false;
  }
  return true;
}

/** ReleaseMon (pokemon_storage_system_data.c). */
export function ReleaseMon(): void {
  DestroyReleaseMonIcon();
  if (sIsMonBeingMoved) {
    sIsMonBeingMoved = false;
  } else {
    const boxId = sCursorArea === CURSOR_AREA_IN_PARTY ? TOTAL_BOXES_COUNT : StorageGetCurrentBox();
    PurgeMonOrBoxMon(boxId, sCursorPosition);
  }
  TrySetDisplayMonData();
}

/** TrySetCursorFistAnim (pokemon_storage_system_data.c). */
export function TrySetCursorFistAnim(): void {
  if (sIsMonBeingMoved) StartSpriteAnim(gS().cursorSprite!, 3);
}

/** InitCanReleaseMonVars (pokemon_storage_system_data.c). */
export function InitCanReleaseMonVars(): void {
  const g = gS();
  if (sIsMonBeingMoved) {
    g.tempMon = g.movingMon;
    g.releaseBoxId = -1;
    g.releaseBoxPos = -1;
  } else {
    if (sCursorArea === CURSOR_AREA_IN_PARTY) {
      g.tempMon = sParty[sCursorPosition];
      g.releaseBoxId = TOTAL_BOXES_COUNT;
    } else {
      const mon = zeroMon();
      BoxMonAtToMon(StorageGetCurrentBox(), sCursorPosition, mon);
      g.tempMon = mon;
      g.releaseBoxId = StorageGetCurrentBox();
    }
    g.releaseBoxPos = sCursorPosition;
  }
  g.isSurfMon = false;
  g.isDiveMon = false;
  g.restrictedMoveList[0] = C.MOVE_SURF;
  g.restrictedMoveList[1] = C.MOVE_DIVE;
  g.restrictedMoveList[2] = C.MOVES_COUNT;
  const knownMoveFlags = GetMonData(g.tempMon, C.MON_DATA_KNOWN_MOVES, g.restrictedMoveList);
  g.isSurfMon = (knownMoveFlags & 1) !== 0;
  g.isDiveMon = ((knownMoveFlags >> 1) & 1) !== 0;
  if (g.isSurfMon || g.isDiveMon) {
    g.releaseMonStatusResolved = false;
  } else {
    g.releaseMonStatusResolved = true;
    g.releaseMonStatus = RELEASE_MON_ALLOWED;
  }
  g.releaseCheckState = 0;
}

/** RunCanReleaseMon (pokemon_storage_system_data.c). */
export function RunCanReleaseMon(): number {
  const g = gS();
  if (g.releaseMonStatusResolved) return g.releaseMonStatus;
  switch (g.releaseCheckState) {
    case 0:
      for (let i = 0; i < PARTY_SIZE; i++) {
        if (g.releaseBoxId !== TOTAL_BOXES_COUNT || g.releaseBoxPos !== i) {
          const knownMoveFlags = GetMonData(sParty[i], C.MON_DATA_KNOWN_MOVES, g.restrictedMoveList);
          if (knownMoveFlags & 1) g.isSurfMon = false;
          if (knownMoveFlags & 2) g.isDiveMon = false;
        }
      }
      if (!(g.isSurfMon || g.isDiveMon)) {
        g.releaseMonStatusResolved = true;
        g.releaseMonStatus = RELEASE_MON_ALLOWED;
      } else {
        g.releaseCheckBoxId = 0;
        g.releaseCheckBoxPos = 0;
        g.releaseCheckState++;
      }
      break;
    case 1:
      // for some reason, check only 5 mons in box each time this function is called
      for (let i = 0; i < 5; i++) {
        const knownMoveFlags = GetAndCopyBoxMonDataAt(g.releaseCheckBoxId, g.releaseCheckBoxPos, C.MON_DATA_KNOWN_MOVES, g.restrictedMoveList);
        if (knownMoveFlags !== 0 && !(g.releaseBoxId === g.releaseCheckBoxId && g.releaseBoxPos === g.releaseCheckBoxPos)) {
          if (knownMoveFlags & 1) g.isSurfMon = false;
          if (knownMoveFlags & 2) g.isDiveMon = false;
        }
        if (++g.releaseCheckBoxPos >= IN_BOX_COUNT) {
          g.releaseCheckBoxPos = 0;
          if (++g.releaseCheckBoxId >= TOTAL_BOXES_COUNT) {
            g.releaseMonStatusResolved = true;
            g.releaseMonStatus = RELEASE_MON_NOT_ALLOWED;
            break;
          }
        }
      }
      if (!(g.isSurfMon || g.isDiveMon)) {
        g.releaseMonStatusResolved = true;
        g.releaseMonStatus = RELEASE_MON_ALLOWED;
      }
      break;
  }
  return RELEASE_MON_UNDETERMINED;
}

/** SaveMovingMon (pokemon_storage_system_data.c). */
export function SaveMovingMon(): void {
  if (sIsMonBeingMoved) sMonBeingCarried = gS().movingMon;
}

/** LoadSavedMovingMon (pokemon_storage_system_data.c). */
export function LoadSavedMovingMon(): void {
  if (sIsMonBeingMoved) gS().movingMon = sMonBeingCarried;
}

/** InitSummaryScreenData (pokemon_storage_system_data.c). */
export function InitSummaryScreenData(): void {
  const g = gS();
  if (sIsMonBeingMoved) {
    SaveMovingMon();
    g.summaryMons = [sMonBeingCarried];
    g.summaryCursorPos = 0;
    g.summaryLastIndex = 0;
    g.summaryScreenMode = C.PSS_MODE_NORMAL;
  } else if (sCursorArea === CURSOR_AREA_IN_PARTY) {
    g.summaryMons = sParty;
    g.summaryCursorPos = sCursorPosition;
    g.summaryLastIndex = CountPartyMons() - 1;
    g.summaryScreenMode = C.PSS_MODE_NORMAL;
  } else {
    g.summaryMons = save.boxes[StorageGetCurrentBox()] as Mon[];
    g.summaryCursorPos = sCursorPosition;
    g.summaryLastIndex = IN_BOX_COUNT - 1;
    g.summaryScreenMode = C.PSS_MODE_BOX;
  }
}

/** SetSelectionAfterSummaryScreen (pokemon_storage_system_data.c). */
export function SetSelectionAfterSummaryScreen(): void {
  if (sIsMonBeingMoved) LoadSavedMovingMon();
  else sCursorPosition = GetLastViewedMonIndex();
}

/** CompactPartySlots (pokemon_storage_system_data.c). */
export function CompactPartySlots(): number {
  let retVal = -1;
  let last = 0;
  for (let i = 0; i < PARTY_SIZE; i++) {
    const species = GetMonData(sParty[i], C.MON_DATA_SPECIES);
    if (species !== C.SPECIES_NONE) {
      if (i !== last) sParty[last] = sParty[i];
      last++;
    } else if (retVal === -1) {
      retVal = i;
    }
  }
  for (; last < PARTY_SIZE; last++) sParty[last] = zeroMon();
  return retVal;
}

/** SetMonMarkings (pokemon_storage_system_data.c). */
export function SetMonMarkings(markings: number): void {
  gS().displayMonMarkings = markings;
  if (sIsMonBeingMoved) {
    SetMonData(gS().movingMon, C.MON_DATA_MARKINGS, markings);
  } else {
    if (sCursorArea === CURSOR_AREA_IN_PARTY) SetMonData(sParty[sCursorPosition], C.MON_DATA_MARKINGS, markings);
    if (sCursorArea === CURSOR_AREA_IN_BOX) SetCurrentBoxMonData(sCursorPosition, C.MON_DATA_MARKINGS, markings);
  }
}

/** CanMovePartyMon (pokemon_storage_system_data.c). */
export function CanMovePartyMon(): boolean {
  return sCursorArea === CURSOR_AREA_IN_PARTY && !sIsMonBeingMoved && CountPartyAliveNonEggMonsExcept(sCursorPosition) === 0;
}

/** CanShiftMon (pokemon_storage_system_data.c). */
export function CanShiftMon(): boolean {
  if (sIsMonBeingMoved) {
    if (sCursorArea === CURSOR_AREA_IN_PARTY && CountPartyAliveNonEggMonsExcept(sCursorPosition) === 0) {
      if (gS().displayMonIsEgg || GetMonData(gS().movingMon, C.MON_DATA_HP) === 0) return false;
    }
    return true;
  }
  return false;
}

/** IsMonBeingMoved (pokemon_storage_system_data.c). */
export function IsMonBeingMoved(): boolean {
  return sIsMonBeingMoved;
}

/** IsCursorOnBoxTitle (pokemon_storage_system_data.c). */
export function IsCursorOnBoxTitle(): boolean {
  return sCursorArea === CURSOR_AREA_BOX_TITLE;
}

/** IsCursorOnCloseBox (pokemon_storage_system_data.c). */
export function IsCursorOnCloseBox(): boolean {
  return sCursorArea === CURSOR_AREA_BUTTONS && sCursorPosition === 1;
}

/** IsCursorInBox (pokemon_storage_system_data.c). */
export function IsCursorInBox(): boolean {
  return sCursorArea === CURSOR_AREA_IN_BOX;
}

/** TrySetDisplayMonData (pokemon_storage_system_data.c). */
function TrySetDisplayMonData(): void {
  gS().setMosaic = !sIsMonBeingMoved;
  if (!sIsMonBeingMoved) {
    switch (sCursorArea) {
      case CURSOR_AREA_IN_PARTY:
        if (sCursorPosition < PARTY_SIZE) {
          SetDisplayMonData(sParty[sCursorPosition], MODE_PARTY);
          break;
        }
      // fallthrough
      case CURSOR_AREA_BUTTONS:
      case CURSOR_AREA_BOX_TITLE:
        SetDisplayMonData(null, MODE_MOVE);
        break;
      case CURSOR_AREA_IN_BOX:
        SetDisplayMonData(GetBoxedMonPtr(StorageGetCurrentBox(), sCursorPosition) as Mon | null, MODE_BOX);
        break;
    }
  }
}

/** ReshowDisplayMon (pokemon_storage_system_data.c). */
function ReshowDisplayMon(): void {
  if (sIsMonBeingMoved) SetDisplayMonData(sMonBeingCarried, MODE_PARTY);
  else TrySetDisplayMonData();
}

const CHAR_SPACE = 0x00;

/** SetDisplayMonData (pokemon_storage_system_data.c): fills the display-mon fields and the four text buffers. */
function SetDisplayMonData(pokemon: Mon | null, mode: number): void {
  const g = gS();
  let gender = C.MON_MALE;
  let sanityIsBagEgg = false;
  g.displayMonItemId = C.ITEM_NONE;
  if (mode === MODE_PARTY || mode === MODE_BOX) {
    const mon = pokemon as Mon;
    g.displayMonSpecies = GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG);
    if (g.displayMonSpecies !== C.SPECIES_NONE) {
      sanityIsBagEgg = GetMonData(mon, C.MON_DATA_SANITY_IS_BAD_EGG) !== 0;
      if (sanityIsBagEgg) g.displayMonIsEgg = true;
      else g.displayMonIsEgg = GetMonData(mon, C.MON_DATA_IS_EGG) !== 0;
      const nickname = new Uint8Array(g.displayMonNickname.length).fill(0xff);
      GetMonData(mon, C.MON_DATA_NICKNAME, nickname);
      StringGet_Nickname(nickname);
      g.displayMonNickname = nickname;
      g.displayMonLevel = GetMonData(mon, C.MON_DATA_LEVEL);
      g.displayMonMarkings = GetMonData(mon, C.MON_DATA_MARKINGS);
      g.displayMonPersonality = GetMonData(mon, C.MON_DATA_PERSONALITY);
      g.displayMonPalette = GetMonSpritePalFromSpeciesAndPersonality(g.displayMonSpecies, GetMonData(mon, C.MON_DATA_OT_ID), g.displayMonPersonality);
      gender = mode === MODE_PARTY ? GetMonGender(mon) : GetGenderFromSpeciesAndPersonality(g.displayMonSpecies, g.displayMonPersonality);
      g.displayMonItemId = GetMonData(mon, C.MON_DATA_HELD_ITEM);
    }
  } else {
    g.displayMonSpecies = C.SPECIES_NONE;
    g.displayMonItemId = C.ITEM_NONE;
  }
  const [nicknameText, speciesNameText, genderAndLevelText, itemNameText] = g.displayMonTexts;
  if (g.displayMonSpecies === C.SPECIES_NONE) {
    StringFill(g.displayMonNickname, CHAR_SPACE, 5);
    StringFill(nicknameText, CHAR_SPACE, 8);
    StringFill(speciesNameText, CHAR_SPACE, 8);
    StringFill(genderAndLevelText, CHAR_SPACE, 8);
    StringFill(itemNameText, CHAR_SPACE, 8);
  } else if (g.displayMonIsEgg) {
    if (sanityIsBagEgg) StringCopyPadded(nicknameText, g.displayMonNickname, CHAR_SPACE, 5);
    else StringCopyPadded(nicknameText, rom.text("gText_EggNickname"), CHAR_SPACE, 8);
    StringFill(speciesNameText, CHAR_SPACE, 8);
    StringFill(genderAndLevelText, CHAR_SPACE, 8);
    StringFill(itemNameText, CHAR_SPACE, 8);
  } else {
    if (g.displayMonSpecies === C.SPECIES_NIDORAN_F || g.displayMonSpecies === C.SPECIES_NIDORAN_M) gender = C.MON_GENDERLESS;
    // Buffer nickname
    StringCopyPadded(nicknameText, g.displayMonNickname, CHAR_SPACE, 5);
    // Buffer species name
    let txt = 0;
    speciesNameText[txt++] = C.CHAR_SLASH;
    StringCopyPadded(speciesNameText, speciesName(g.displayMonSpecies), CHAR_SPACE, 5, txt);
    // Buffer gender and level
    txt = 0;
    genderAndLevelText[txt++] = C.EXT_CTRL_CODE_BEGIN;
    genderAndLevelText[txt++] = C.EXT_CTRL_CODE_COLOR_HIGHLIGHT_SHADOW;
    switch (gender) {
      case C.MON_MALE:
        genderAndLevelText[txt++] = C.TEXT_COLOR_RED;
        genderAndLevelText[txt++] = C.TEXT_COLOR_WHITE;
        genderAndLevelText[txt++] = C.TEXT_COLOR_LIGHT_RED;
        genderAndLevelText[txt++] = C.CHAR_MALE;
        break;
      case C.MON_FEMALE:
        genderAndLevelText[txt++] = C.TEXT_COLOR_GREEN;
        genderAndLevelText[txt++] = C.TEXT_COLOR_WHITE;
        genderAndLevelText[txt++] = C.TEXT_COLOR_LIGHT_GREEN;
        genderAndLevelText[txt++] = C.CHAR_FEMALE;
        break;
      default:
        genderAndLevelText[txt++] = C.TEXT_COLOR_DARK_GRAY;
        genderAndLevelText[txt++] = C.TEXT_COLOR_WHITE;
        genderAndLevelText[txt++] = C.TEXT_COLOR_LIGHT_GRAY;
        genderAndLevelText[txt++] = CHAR_SPACE;
        break;
    }
    genderAndLevelText[txt++] = C.EXT_CTRL_CODE_BEGIN;
    genderAndLevelText[txt++] = C.EXT_CTRL_CODE_COLOR_HIGHLIGHT_SHADOW;
    genderAndLevelText[txt++] = C.TEXT_COLOR_DARK_GRAY;
    genderAndLevelText[txt++] = C.TEXT_COLOR_WHITE;
    genderAndLevelText[txt++] = C.TEXT_COLOR_LIGHT_GRAY;
    genderAndLevelText[txt++] = CHAR_SPACE;
    genderAndLevelText[txt++] = C.CHAR_EXTRA_SYMBOL;
    genderAndLevelText[txt++] = C.CHAR_LV_2;
    txt = ConvertIntToDecimalStringN(genderAndLevelText, g.displayMonLevel, STR_CONV_MODE_LEFT_ALIGN, 3, txt);
    genderAndLevelText[txt] = CHAR_SPACE;
    genderAndLevelText[txt + 1] = C.EOS;
    // Buffer item name
    if (g.displayMonItemId !== C.ITEM_NONE) StringCopyPadded(itemNameText, CopyItemName(g.displayMonItemId), CHAR_SPACE, 8);
    else StringFill(itemNameText, CHAR_SPACE, 8);
  }
}

/** HandleInput_InBox (pokemon_storage_system_data.c). */
function HandleInput_InBox(): number {
  switch (gS().inBoxMovingMode) {
    case MOVE_MODE_MULTIPLE_SELECTING:
      return HandleInput_InBox_GrabbingMultiple();
    case MOVE_MODE_MULTIPLE_MOVING:
      return HandleInput_InBox_MovingMultiple();
    case MOVE_MODE_NORMAL:
    default:
      return HandleInput_InBox_Normal();
  }
}

/** The menu-text-to-input mapping shared by the A-button handlers when multi-move mode is active. */
function InputFromFirstMenuText(): number {
  switch (GetMenuItemTextId(0)) {
    case MENU_TEXT_STORE: return INPUT_DEPOSIT;
    case MENU_TEXT_WITHDRAW: return INPUT_WITHDRAW;
    case MENU_TEXT_MOVE: return INPUT_MOVE_MON;
    case MENU_TEXT_SHIFT: return INPUT_SHIFT_MON;
    case MENU_TEXT_PLACE: return INPUT_PLACE_MON;
    case MENU_TEXT_TAKE: return INPUT_TAKE_ITEM;
    case MENU_TEXT_GIVE: return INPUT_GIVE_ITEM;
    case MENU_TEXT_SWITCH: return INPUT_SWITCH_ITEMS;
  }
  return -1;
}

/** HandleInput_InBox_Normal (pokemon_storage_system_data.c). */
function HandleInput_InBox_Normal(): number {
  const g = gS();
  let input: number;
  let cursorArea = sCursorArea;
  let cursorPosition = sCursorPosition;
  g.cursorVerticalWrap = 0;
  g.cursorHorizontalWrap = 0;
  g.cursorFlipTimer = 0;
  if (JOY_REPT(DPAD_UP)) {
    input = INPUT_MOVE_CURSOR;
    if (sCursorPosition >= IN_BOX_COLUMNS) {
      cursorPosition -= IN_BOX_COLUMNS;
    } else {
      cursorArea = CURSOR_AREA_BOX_TITLE;
      cursorPosition = 0;
    }
  } else if (JOY_REPT(DPAD_DOWN)) {
    input = INPUT_MOVE_CURSOR;
    cursorPosition += IN_BOX_COLUMNS;
    if (cursorPosition >= IN_BOX_COUNT) {
      cursorArea = CURSOR_AREA_BUTTONS;
      cursorPosition -= IN_BOX_COUNT;
      cursorPosition = Math.trunc(cursorPosition / 3);
      g.cursorVerticalWrap = 1;
      g.cursorFlipTimer = 1;
    }
  } else if (JOY_REPT(DPAD_LEFT)) {
    input = INPUT_MOVE_CURSOR;
    if (sCursorPosition % IN_BOX_COLUMNS !== 0) {
      cursorPosition--;
    } else {
      g.cursorHorizontalWrap = -1;
      cursorPosition += IN_BOX_COLUMNS - 1;
    }
  } else if (JOY_REPT(DPAD_RIGHT)) {
    input = INPUT_MOVE_CURSOR;
    if ((sCursorPosition + 1) % IN_BOX_COLUMNS !== 0) {
      cursorPosition++;
    } else {
      g.cursorHorizontalWrap = 1;
      cursorPosition -= IN_BOX_COLUMNS - 1;
    }
  } else if (JOY_NEW(START_BUTTON)) {
    input = INPUT_MOVE_CURSOR;
    cursorArea = CURSOR_AREA_BOX_TITLE;
    cursorPosition = 0;
  } else {
    if (JOY_NEW(A_BUTTON) && SetSelectionMenuTexts()) {
      if (!sInMultiMoveMode) return INPUT_IN_MENU;
      if (g.boxOption !== OPTION_MOVE_MONS || sIsMonBeingMoved === true) {
        const result = InputFromFirstMenuText();
        if (result !== -1) return result;
      } else {
        g.inBoxMovingMode = MOVE_MODE_MULTIPLE_SELECTING;
        return INPUT_MULTIMOVE_START;
      }
    }
    if (JOY_NEW(B_BUTTON)) return INPUT_PRESSED_B;
    if (save.options.buttonMode === C.OPTIONS_BUTTON_MODE_LR) {
      if (JOY_HELD(L_BUTTON)) return INPUT_SCROLL_LEFT;
      if (JOY_HELD(R_BUTTON)) return INPUT_SCROLL_RIGHT;
    }
    if (JOY_NEW(SELECT_BUTTON)) {
      ToggleCursorMultiMoveMode();
      return INPUT_NONE;
    }
    input = INPUT_NONE;
  }
  if (input !== INPUT_NONE) SetCursorPosition(cursorArea, cursorPosition);
  return input;
}

/** HandleInput_InBox_GrabbingMultiple (pokemon_storage_system_data.c). */
function HandleInput_InBox_GrabbingMultiple(): number {
  const g = gS();
  if (JOY_HELD(A_BUTTON)) {
    if (JOY_REPT(DPAD_UP)) {
      if (Math.trunc(sCursorPosition / IN_BOX_COLUMNS) !== 0) {
        SetCursorPosition(CURSOR_AREA_IN_BOX, sCursorPosition - IN_BOX_COLUMNS);
        return INPUT_MULTIMOVE_CHANGE_SELECTION;
      }
      return INPUT_MULTIMOVE_UNABLE;
    } else if (JOY_REPT(DPAD_DOWN)) {
      if (sCursorPosition + IN_BOX_COLUMNS < IN_BOX_COUNT) {
        SetCursorPosition(CURSOR_AREA_IN_BOX, sCursorPosition + IN_BOX_COLUMNS);
        return INPUT_MULTIMOVE_CHANGE_SELECTION;
      }
      return INPUT_MULTIMOVE_UNABLE;
    } else if (JOY_REPT(DPAD_LEFT)) {
      if (sCursorPosition % IN_BOX_COLUMNS !== 0) {
        SetCursorPosition(CURSOR_AREA_IN_BOX, sCursorPosition - 1);
        return INPUT_MULTIMOVE_CHANGE_SELECTION;
      }
      return INPUT_MULTIMOVE_UNABLE;
    } else if (JOY_REPT(DPAD_RIGHT)) {
      if ((sCursorPosition + 1) % IN_BOX_COLUMNS !== 0) {
        SetCursorPosition(CURSOR_AREA_IN_BOX, sCursorPosition + 1);
        return INPUT_MULTIMOVE_CHANGE_SELECTION;
      }
      return INPUT_MULTIMOVE_UNABLE;
    }
    return INPUT_NONE;
  }
  if (MultiMove_GetOriginPosition() === sCursorPosition) {
    g.inBoxMovingMode = MOVE_MODE_NORMAL;
    g.cursorShadowSprite!.invisible = false;
    return INPUT_MULTIMOVE_SINGLE;
  }
  sIsMonBeingMoved = g.displayMonSpecies !== C.SPECIES_NONE;
  g.inBoxMovingMode = MOVE_MODE_MULTIPLE_MOVING;
  sMovingMonOrigBoxId = StorageGetCurrentBox();
  return INPUT_MULTIMOVE_GRAB_SELECTION;
}

/** HandleInput_InBox_MovingMultiple (pokemon_storage_system_data.c). */
function HandleInput_InBox_MovingMultiple(): number {
  const g = gS();
  if (JOY_REPT(DPAD_UP)) {
    if (MultiMove_TryMoveGroup(0)) {
      SetCursorPosition(CURSOR_AREA_IN_BOX, sCursorPosition - IN_BOX_COLUMNS);
      return INPUT_MULTIMOVE_MOVE_MONS;
    }
    return INPUT_MULTIMOVE_UNABLE;
  } else if (JOY_REPT(DPAD_DOWN)) {
    if (MultiMove_TryMoveGroup(1)) {
      SetCursorPosition(CURSOR_AREA_IN_BOX, sCursorPosition + IN_BOX_COLUMNS);
      return INPUT_MULTIMOVE_MOVE_MONS;
    }
    return INPUT_MULTIMOVE_UNABLE;
  } else if (JOY_REPT(DPAD_LEFT)) {
    if (MultiMove_TryMoveGroup(2)) {
      SetCursorPosition(CURSOR_AREA_IN_BOX, sCursorPosition - 1);
      return INPUT_MULTIMOVE_MOVE_MONS;
    }
    return INPUT_SCROLL_LEFT;
  } else if (JOY_REPT(DPAD_RIGHT)) {
    if (MultiMove_TryMoveGroup(3)) {
      SetCursorPosition(CURSOR_AREA_IN_BOX, sCursorPosition + 1);
      return INPUT_MULTIMOVE_MOVE_MONS;
    }
    return INPUT_SCROLL_RIGHT;
  } else if (JOY_NEW(A_BUTTON)) {
    if (MultiMove_CanPlaceSelection()) {
      sIsMonBeingMoved = false;
      g.inBoxMovingMode = MOVE_MODE_NORMAL;
      return INPUT_MULTIMOVE_PLACE_MONS;
    }
    return INPUT_MULTIMOVE_UNABLE;
  } else if (JOY_NEW(B_BUTTON)) {
    return INPUT_MULTIMOVE_UNABLE;
  }
  if (save.options.buttonMode === C.OPTIONS_BUTTON_MODE_LR) {
    if (JOY_HELD(L_BUTTON)) return INPUT_SCROLL_LEFT;
    if (JOY_HELD(R_BUTTON)) return INPUT_SCROLL_RIGHT;
  }
  return INPUT_NONE;
}

/** HandleInput_InParty (pokemon_storage_system_data.c). */
function HandleInput_InParty(): number {
  const g = gS();
  let input = INPUT_NONE;
  let gotoBox = false;
  let cursorArea = sCursorArea;
  let cursorPosition = sCursorPosition;
  g.cursorHorizontalWrap = 0;
  g.cursorVerticalWrap = 0;
  g.cursorFlipTimer = 0;
  if (JOY_REPT(DPAD_UP)) {
    if (--cursorPosition < 0) cursorPosition = PARTY_SIZE;
    if (cursorPosition !== sCursorPosition) input = INPUT_MOVE_CURSOR;
  } else if (JOY_REPT(DPAD_DOWN)) {
    if (++cursorPosition > PARTY_SIZE) cursorPosition = 0;
    if (cursorPosition !== sCursorPosition) input = INPUT_MOVE_CURSOR;
  } else if (JOY_REPT(DPAD_LEFT) && sCursorPosition !== 0) {
    input = INPUT_MOVE_CURSOR;
    g.cursorPrevPartyPos = sCursorPosition;
    cursorPosition = 0;
  } else if (JOY_REPT(DPAD_RIGHT)) {
    if (sCursorPosition === 0) {
      input = INPUT_MOVE_CURSOR;
      cursorPosition = g.cursorPrevPartyPos;
    } else {
      input = INPUT_HIDE_PARTY;
      cursorArea = CURSOR_AREA_IN_BOX;
      cursorPosition = 0;
    }
  } else {
    if (JOY_NEW(A_BUTTON)) {
      if (sCursorPosition === PARTY_SIZE) {
        if (g.boxOption === OPTION_DEPOSIT) return INPUT_CLOSE_BOX;
        gotoBox = true;
      } else if (SetSelectionMenuTexts()) {
        if (!sInMultiMoveMode) return INPUT_IN_MENU;
        const result = InputFromFirstMenuText();
        if (result !== -1) return result;
      }
    }
    if (JOY_NEW(B_BUTTON)) {
      if (g.boxOption === OPTION_DEPOSIT) return INPUT_PRESSED_B;
      gotoBox = true;
    }
    if (gotoBox) {
      input = INPUT_HIDE_PARTY;
      cursorArea = CURSOR_AREA_IN_BOX;
      cursorPosition = 0;
    } else if (JOY_NEW(SELECT_BUTTON)) {
      ToggleCursorMultiMoveMode();
      return INPUT_NONE;
    }
  }
  if (input !== INPUT_NONE && input !== INPUT_HIDE_PARTY) SetCursorPosition(cursorArea, cursorPosition);
  return input;
}

/** HandleInput_BoxTitle (pokemon_storage_system_data.c). */
function HandleInput_BoxTitle(): number {
  const g = gS();
  let input: number;
  let cursorArea = sCursorArea;
  let cursorPosition = sCursorPosition;
  g.cursorHorizontalWrap = 0;
  g.cursorVerticalWrap = 0;
  g.cursorFlipTimer = 0;
  if (JOY_REPT(DPAD_UP)) {
    input = INPUT_MOVE_CURSOR;
    cursorArea = CURSOR_AREA_BUTTONS;
    cursorPosition = 0;
    g.cursorFlipTimer = 1;
  } else if (JOY_REPT(DPAD_DOWN)) {
    input = INPUT_MOVE_CURSOR;
    cursorArea = CURSOR_AREA_IN_BOX;
    cursorPosition = 2;
  } else {
    if (JOY_HELD(DPAD_LEFT)) return INPUT_SCROLL_LEFT;
    if (JOY_HELD(DPAD_RIGHT)) return INPUT_SCROLL_RIGHT;
    if (save.options.buttonMode === C.OPTIONS_BUTTON_MODE_LR) {
      if (JOY_HELD(L_BUTTON)) return INPUT_SCROLL_LEFT;
      if (JOY_HELD(R_BUTTON)) return INPUT_SCROLL_RIGHT;
    }
    if (JOY_NEW(A_BUTTON)) {
      AnimateBoxScrollArrows(false);
      AddBoxMenu();
      return INPUT_BOX_OPTIONS;
    }
    if (JOY_NEW(B_BUTTON)) return INPUT_PRESSED_B;
    if (JOY_NEW(SELECT_BUTTON)) {
      ToggleCursorMultiMoveMode();
      return INPUT_NONE;
    }
    input = INPUT_NONE;
  }
  if (input !== INPUT_NONE) {
    if (cursorArea !== CURSOR_AREA_BOX_TITLE) AnimateBoxScrollArrows(false);
    SetCursorPosition(cursorArea, cursorPosition);
  }
  return input;
}

/** HandleInput_OnButtons (pokemon_storage_system_data.c). */
function HandleInput_OnButtons(): number {
  const g = gS();
  let input: number;
  let cursorArea = sCursorArea;
  let cursorPosition = sCursorPosition;
  g.cursorHorizontalWrap = 0;
  g.cursorVerticalWrap = 0;
  g.cursorFlipTimer = 0;
  if (JOY_REPT(DPAD_UP)) {
    input = INPUT_MOVE_CURSOR;
    cursorArea = CURSOR_AREA_IN_BOX;
    g.cursorVerticalWrap = -1;
    if (sCursorPosition === 0) cursorPosition = IN_BOX_COUNT - 1 - 5;
    else cursorPosition = IN_BOX_COUNT - 1;
    g.cursorFlipTimer = 1;
  } else if (JOY_REPT(DPAD_DOWN | START_BUTTON)) {
    input = INPUT_MOVE_CURSOR;
    cursorArea = CURSOR_AREA_BOX_TITLE;
    cursorPosition = 0;
    g.cursorFlipTimer = 1;
  } else if (JOY_REPT(DPAD_LEFT)) {
    input = INPUT_MOVE_CURSOR;
    if (--cursorPosition < 0) cursorPosition = 1;
  } else if (JOY_REPT(DPAD_RIGHT)) {
    input = INPUT_MOVE_CURSOR;
    if (++cursorPosition > 1) cursorPosition = 0;
  } else {
    if (JOY_NEW(A_BUTTON)) return cursorPosition === 0 ? INPUT_SHOW_PARTY : INPUT_CLOSE_BOX;
    if (JOY_NEW(B_BUTTON)) return INPUT_PRESSED_B;
    if (JOY_NEW(SELECT_BUTTON)) {
      ToggleCursorMultiMoveMode();
      return INPUT_NONE;
    }
    input = INPUT_NONE;
  }
  if (input !== INPUT_NONE) SetCursorPosition(cursorArea, cursorPosition);
  return input;
}

/** HandleInput (pokemon_storage_system_data.c). */
export function HandleInput(): number {
  const inputFuncs: Array<{ func: () => number; area: number }> = [
    { func: HandleInput_InBox, area: CURSOR_AREA_IN_BOX },
    { func: HandleInput_InParty, area: CURSOR_AREA_IN_PARTY },
    { func: HandleInput_BoxTitle, area: CURSOR_AREA_BOX_TITLE },
    { func: HandleInput_OnButtons, area: CURSOR_AREA_BUTTONS },
  ];
  for (const entry of inputFuncs) if (entry.area === sCursorArea) return entry.func();
  return INPUT_NONE;
}

/** AddBoxMenu (pokemon_storage_system_data.c). */
function AddBoxMenu(): void {
  InitMenu();
  SetMenuText(MENU_TEXT_JUMP);
  SetMenuText(MENU_TEXT_WALLPAPER);
  SetMenuText(MENU_TEXT_NAME);
  SetMenuText(MENU_TEXT_CANCEL);
}

/** SetSelectionMenuTexts (pokemon_storage_system_data.c). */
function SetSelectionMenuTexts(): boolean {
  InitMenu();
  if (gS().boxOption !== OPTION_MOVE_ITEMS) return SetMenuTextsForMon();
  return SetMenuTextsForItem();
}

/** SetMenuTextsForMon (pokemon_storage_system_data.c). */
function SetMenuTextsForMon(): boolean {
  const species = GetSpeciesAtCursorPosition();
  switch (gS().boxOption) {
    case OPTION_DEPOSIT:
      if (species !== C.SPECIES_NONE) SetMenuText(MENU_TEXT_STORE);
      else return false;
      break;
    case 0: // OPTION_WITHDRAW
      if (species !== C.SPECIES_NONE) SetMenuText(MENU_TEXT_WITHDRAW);
      else return false;
      break;
    case OPTION_MOVE_MONS:
      if (sIsMonBeingMoved) {
        if (species !== C.SPECIES_NONE) SetMenuText(MENU_TEXT_SHIFT);
        else SetMenuText(MENU_TEXT_PLACE);
      } else if (species !== C.SPECIES_NONE) {
        SetMenuText(MENU_TEXT_MOVE);
      } else {
        return false;
      }
      break;
    case OPTION_MOVE_ITEMS:
    default:
      return false;
  }
  SetMenuText(MENU_TEXT_SUMMARY);
  if (gS().boxOption === OPTION_MOVE_MONS) {
    if (!sCursorArea) SetMenuText(MENU_TEXT_WITHDRAW);
    else SetMenuText(MENU_TEXT_STORE);
  }
  SetMenuText(MENU_TEXT_MARK);
  SetMenuText(MENU_TEXT_RELEASE);
  SetMenuText(MENU_TEXT_CANCEL);
  return true;
}

/** SetMenuTextsForItem (pokemon_storage_system_data.c). */
function SetMenuTextsForItem(): boolean {
  const g = gS();
  if (g.displayMonSpecies === C.SPECIES_EGG) return false;
  if (!IsActiveItemMoving()) {
    if (g.displayMonItemId === C.ITEM_NONE) {
      if (g.displayMonSpecies === C.SPECIES_NONE) return false;
      SetMenuText(MENU_TEXT_GIVE2);
    } else {
      if (!isMailItem(g.displayMonItemId)) {
        SetMenuText(MENU_TEXT_TAKE);
        SetMenuText(MENU_TEXT_BAG);
      }
      SetMenuText(MENU_TEXT_INFO);
    }
  } else if (g.displayMonItemId === C.ITEM_NONE) {
    if (g.displayMonSpecies === C.SPECIES_NONE) return false;
    SetMenuText(MENU_TEXT_GIVE);
  } else {
    if (isMailItem(g.displayMonItemId)) return false;
    SetMenuText(MENU_TEXT_SWITCH);
  }
  SetMenuText(MENU_TEXT_CANCEL);
  return true;
}

/** SpriteCB_CursorShadow (pokemon_storage_system_data.c). */
function SpriteCB_CursorShadow(sprite: Sprite): void {
  sprite.x = gS().cursorSprite!.x;
  sprite.y = gS().cursorSprite!.y + 20;
}

/** CreateCursorSprites (pokemon_storage_system_data.c). */
function CreateCursorSprites(): void {
  const g = gS();
  const spriteSheets = [
    { data: incbin("pokemon_storage_system_data.c:sHandCursorTiles"), size: 0x800, tag: GFXTAG_CURSOR },
    { data: incbin("pokemon_storage_system_data.c:sHandCursorShadowTiles"), size: 0x80, tag: GFXTAG_CURSOR_SHADOW },
  ];
  LoadSpriteSheets(spriteSheets);
  LoadSpritePalettes([{ data: incbin("pokemon_storage_system_data.c:sPokeStorageMisc1Pal"), tag: PALTAG_MISC_1 }]);
  g.cursorPalNums[0] = IndexOfSpritePaletteTag(PALTAG_MISC_2);
  g.cursorPalNums[1] = IndexOfSpritePaletteTag(PALTAG_MISC_1);

  const sOamData_Cursor = oamData({ shape: 0, size: 2, priority: 1 });
  const sOamData_CursorShadow = oamData({ shape: 0, size: 1, priority: 1 });
  const sAnims_Cursor = [
    [ANIMCMD_FRAME(0, 30), ANIMCMD_FRAME(16, 30), ANIMCMD_JUMP(0)],
    [ANIMCMD_FRAME(0, 5), ANIMCMD_END],
    [ANIMCMD_FRAME(32, 5), ANIMCMD_END],
    [ANIMCMD_FRAME(48, 5), ANIMCMD_END],
  ];
  const cursorTemplate: SpriteTemplate = {
    tileTag: GFXTAG_CURSOR, paletteTag: PALTAG_MISC_2, oam: sOamData_Cursor, anims: sAnims_Cursor, images: null,
    affineAnims: gDummySpriteAffineAnimTable, callback: () => {},
  };
  const shadowTemplate: SpriteTemplate = {
    tileTag: GFXTAG_CURSOR_SHADOW, paletteTag: PALTAG_MISC_2, oam: sOamData_CursorShadow, anims: gDummySpriteAnimTable, images: null,
    affineAnims: gDummySpriteAffineAnimTable, callback: SpriteCB_CursorShadow,
  };
  const [x, y] = GetCursorCoordsByPos(sCursorArea, sCursorPosition);
  let spriteId = CreateSprite(cursorTemplate, x, y, 6);
  if (spriteId !== MAX_SPRITES) {
    g.cursorSprite = gSprites[spriteId];
    g.cursorSprite.oam.paletteNum = g.cursorPalNums[sInMultiMoveMode ? 1 : 0];
    g.cursorSprite.oam.priority = 1;
    if (sIsMonBeingMoved) StartSpriteAnim(g.cursorSprite, 3);
  } else {
    g.cursorSprite = null;
  }
  let subpriority: number;
  let priority: number;
  if (sCursorArea === CURSOR_AREA_IN_PARTY) {
    subpriority = 13;
    priority = 1;
  } else {
    subpriority = 21;
    priority = 2;
  }
  spriteId = CreateSprite(shadowTemplate, 0, 0, subpriority);
  if (spriteId !== MAX_SPRITES) {
    g.cursorShadowSprite = gSprites[spriteId];
    g.cursorShadowSprite.oam.priority = priority;
    if (sCursorArea) g.cursorShadowSprite.invisible = true;
  } else {
    g.cursorShadowSprite = null;
  }
}

/** ToggleCursorMultiMoveMode (pokemon_storage_system_data.c). */
function ToggleCursorMultiMoveMode(): void {
  sInMultiMoveMode = !sInMultiMoveMode;
  gS().cursorSprite!.oam.paletteNum = gS().cursorPalNums[sInMultiMoveMode ? 1 : 0];
}

/** GetBoxCursorPosition (pokemon_storage_system_data.c). */
export function GetBoxCursorPosition(): number {
  return sCursorPosition;
}

/** GetCursorBoxColumnAndRow (pokemon_storage_system_data.c). */
export function GetCursorBoxColumnAndRow(): [number, number] {
  if (sCursorArea === CURSOR_AREA_IN_BOX) return [sCursorPosition % IN_BOX_COLUMNS, Math.trunc(sCursorPosition / IN_BOX_COLUMNS)];
  return [0, 0];
}

/** StartCursorAnim (pokemon_storage_system_data.c). */
export function StartCursorAnim(animNum: number): void {
  StartSpriteAnim(gS().cursorSprite!, animNum);
}

/** GetMovingMonOriginalBoxId (pokemon_storage_system_data.c). */
export function GetMovingMonOriginalBoxId(): number {
  return sMovingMonOrigBoxId;
}

/** SetCursorPriorityTo1 (pokemon_storage_system_data.c). */
export function SetCursorPriorityTo1(): void {
  gS().cursorSprite!.oam.priority = 1;
}

/** TryHideItemAtCursor (pokemon_storage_system_data.c). */
export function TryHideItemAtCursor(): void {
  if (sCursorArea === CURSOR_AREA_IN_BOX) TryHideItemIconAtPos(CURSOR_AREA_IN_BOX, sCursorPosition);
}

/** TryShowItemAtCursor (pokemon_storage_system_data.c). */
export function TryShowItemAtCursor(): void {
  if (sCursorArea === CURSOR_AREA_IN_BOX) TryLoadItemIconAtPos(CURSOR_AREA_IN_BOX, sCursorPosition);
}

/** sMenuTexts (pokemon_storage_system_data.c), indexed by MENU_TEXT_*. */
const sMenuTextNames = [
  "gPCText_Cancel", "gPCText_Store", "gPCText_Withdraw", "gPCText_Move", "gPCText_Shift", "gPCText_Place", "gPCText_Summary",
  "gPCText_Release", "gPCText_Mark", "gPCText_Jump", "gPCText_Wallpaper", "gPCText_Name", "gPCText_Take", "gPCText_Give", "gPCText_Give",
  "gPCText_Switch", "gPCText_Bag", "gPCText_Info", "gPCText_Scenery1", "gPCText_Scenery2", "gPCText_Scenery3", "gPCText_Etcetera",
  "gPCText_Forest", "gPCText_City", "gPCText_Desert", "gPCText_Savanna", "gPCText_Crag", "gPCText_Volcano", "gPCText_Snow",
  "gPCText_Cave", "gPCText_Beach", "gPCText_Seafloor", "gPCText_River", "gPCText_Sky", "gPCText_PolkaDot", "gPCText_Pokecenter",
  "gPCText_Machine", "gPCText_Simple",
];

/** InitMenu (pokemon_storage_system_data.c). */
export function InitMenu(): void {
  const g = gS();
  g.menuItemsCount = 0;
  g.menuWidth = 0;
  g.menuWindow = { ...g.menuWindow, bg: 0, paletteNum: 15, baseBlock: 92 };
}

/** SetMenuText (pokemon_storage_system_data.c). */
export function SetMenuText(textId: number): void {
  const g = gS();
  if (g.menuItemsCount < g.menuItems.length) {
    const text = rom.text(sMenuTextNames[textId]);
    g.menuItems[g.menuItemsCount] = { text, textId };
    let len = 0;
    while (text[len] !== C.EOS) len++;
    if (len > g.menuWidth) g.menuWidth = len;
    g.menuItemsCount++;
  }
}

/** GetMenuItemTextId (pokemon_storage_system_data.c). */
export function GetMenuItemTextId(menuIndex: number): number {
  if (menuIndex >= gS().menuItemsCount) return C.MENU_B_PRESSED;
  return gS().menuItems[menuIndex].textId;
}

/** AddMenu (pokemon_storage_system_data.c). */
export function AddMenu(): void {
  const g = gS();
  const width = g.menuWidth + 2;
  const height = 2 * g.menuItemsCount;
  g.menuWindow = { ...g.menuWindow, width, height, tilemapLeft: 29 - width, tilemapTop: 15 - height };
  g.menuWindowId = AddWindow(g.menuWindow);
  ClearWindowTilemap(g.menuWindowId);
  DrawStdFrameWithCustomTileAndPalette(g.menuWindowId, false, 11, 14);
  PrintTextArray(g.menuWindowId, FONT_NORMAL_COPY_1, 8, 2, 16, g.menuItemsCount, g.menuItems);
  Menu_InitCursor(g.menuWindowId, FONT_NORMAL_COPY_1, 0, 2, 16, g.menuItemsCount, 0);
  ScheduleBgCopyTilemapToVram(0);
}

/** IsMenuLoading (pokemon_storage_system_data.c): stubbed out debug code in the source. */
export function IsMenuLoading(): boolean {
  return false;
}

/** HandleMenuInput (pokemon_storage_system_data.c). */
export function HandleMenuInput(): number {
  let input: number = C.MENU_NOTHING_CHOSEN;
  if (JOY_NEW(A_BUTTON)) {
    input = Menu_GetCursorPos();
  } else {
    if (JOY_NEW(B_BUTTON)) {
      sound.playSE(C.SE_SELECT);
      input = C.MENU_B_PRESSED;
    }
    if (JOY_NEW(DPAD_UP)) {
      sound.playSE(C.SE_SELECT);
      Menu_MoveCursor(-1);
    } else if (JOY_NEW(DPAD_DOWN)) {
      sound.playSE(C.SE_SELECT);
      Menu_MoveCursor(1);
    }
  }
  if (input !== C.MENU_NOTHING_CHOSEN) RemoveMenu();
  if (input >= 0) input = gS().menuItems[input].textId;
  return input;
}

/** RemoveMenu (pokemon_storage_system_data.c). */
export function RemoveMenu(): void {
  ClearStdWindowAndFrameToTransparent(gS().menuWindowId, true);
  RemoveWindow(gS().menuWindowId);
}
