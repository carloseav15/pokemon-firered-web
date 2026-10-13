// pokemon_storage_system_misc.c: the multi-move (selection box) state machine, the held-item icon sprites,
// the item info window and the (functionally unused) UnkUtil transfer queue.
import * as C from "./generated/constants";
import { AddTextPrinterParameterized5 } from "./hw/text";
import {
  BG_ATTR_BASETILE, BG_COORD_ADD, BG_COORD_SET, BG_ATTR_PALETTEMODE, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, FillBgTilemapBufferRect,
  FillBgTilemapBufferRect_Palette0, GetBgAttribute, HideBg, IsDma3ManagerBusyWithBgCopy, LoadBgTiles, SetBgAttribute, ShowBg,
  WriteSequenceToBgTilemapBuffer,
} from "./hw/bg";
import { ClearGpuRegBits, SetGpuRegBits } from "./hw/gpu";
import { ScheduleBgCopyTilemapToVram } from "./hw/menuHelpers";
import { GetTextWindowPalette } from "./hw/menu";
import { BG_PLTT_ID, BlendPalettes, LoadPalette, OBJ_PLTT_ID, PLTT_SIZE_4BPP, RGB_WHITE } from "./hw/palette";
import { ppu, REG_OFFSET_BG0CNT } from "./hw/ppu";
import {
  AllocSpritePalette, CreateSprite, GetSpriteTileStartByTag, gSprites, LoadSpriteSheet, ST_OAM_OBJ_BLEND, ST_OAM_OBJ_NORMAL, StartSpriteAffineAnim,
  SpriteCallbackDummy, type Sprite, type SpriteTemplate,
} from "./hw/sprite";
import { affineAnimsFrom, animsFrom, oamFrom } from "./hw/cdataSprite";
import { cdata } from "./hw/assets";
import { gSineTable } from "./hw/trig";
import {
  AddWindow8Bit, BlitBitmapRectToWindow4BitTo8Bit, COPYWIN_FULL, COPYWIN_GFX, CopyWindowToVram8Bit, FillWindowPixelBuffer, FillWindowPixelBuffer8Bit,
  FillWindowPixelRect8Bit, PIXEL_FILL, PutWindowTilemap, WINDOW_NONE, type WindowTemplate,
} from "./hw/window";
import { GetItemIconGfxPtr, ItemId_GetDescription } from "./bagMenu";
import { FONT_NORMAL } from "./gba/font";
import { ItemId_GetName } from "./pokemon/items";
import { GetMonData, SetMonData, type Mon } from "./pokemon/mon";
import { GetBoxedMonPtr, GetCurrentBoxMonData, SetBoxMonAt, SetCurrentBoxMonData, StorageGetCurrentBox, ZeroBoxMonAt } from "./pokemon/storage";
import { GetMonIconPtr, GetValidMonIconPalIndex, LoadMonIconPalettesAt } from "./pokemonIcon";
import {
  CreateBoxMonIconAtPos, DestroyBoxMonIconAtPosition, SetBoxMonIconObjMode, SetPartyMonIconObjMode,
} from "./storageSystemGraphics";
import {
  DoMonPlaceChange, GetCursorBoxColumnAndRow, InitMultiMonPlaceChange, SetCursorPriorityTo1, StartCursorAnim, UpdateCursorPos,
} from "./storageSystemData";
import {
  CURSOR_ANIM_BOUNCE, CURSOR_ANIM_FIST, CURSOR_ANIM_OPEN, CURSOR_AREA_BOX_TITLE, CURSOR_AREA_IN_BOX, CURSOR_AREA_IN_PARTY, gS,
  GFXTAG_ITEM_ICON_0, IN_BOX_COLUMNS, IN_BOX_COUNT, ITEM_ANIM_APPEAR, ITEM_ANIM_DISAPPEAR, ITEM_ANIM_LARGE, ITEM_ANIM_PICK_UP, ITEM_ANIM_PUT_AWAY,
  ITEM_ANIM_PUT_DOWN, MAX_ITEM_ICONS, MULTIMOVE_CHANGE_SELECTION, MULTIMOVE_GRAB_SELECTION, MULTIMOVE_MOVE_MONS, MULTIMOVE_PLACE_MONS,
  MULTIMOVE_SINGLE, MULTIMOVE_START, OPTION_MOVE_ITEMS, PALTAG_ITEM_ICON_0, sParty,
} from "./storageSystemInternal";
import { incbin } from "./hw/assets";

const OBJ_VRAM0 = 0x10000;
const TILE_SIZE_4BPP = 32;
const CURSOR_AREA_IN_HAND = CURSOR_AREA_BOX_TITLE;
const BGCNT_256COLOR = 1 << 7;

type MultiMoveState = {
  funcId: number;
  state: number;
  fromColumn: number;
  fromRow: number;
  toColumn: number;
  toRow: number;
  cursorColumn: number;
  cursorRow: number;
  minColumn: number;
  minRow: number;
  columnsTotal: number;
  rowsTotal: number;
  bgX: number;
  bgY: number;
  bgMoveSteps: number;
  boxMons: Mon[];
};

let sMultiMove: MultiMoveState | null = null;

const sWindowTemplate_MultiMove = (): WindowTemplate => cdata<WindowTemplate>("pokemon_storage_system_misc", "sWindowTemplate_MultiMove");

/** MultiMove_Init */
export function MultiMove_Init(): boolean {
  sMultiMove = {
    funcId: 0, state: 0, fromColumn: 0, fromRow: 0, toColumn: 0, toRow: 0, cursorColumn: 0, cursorRow: 0, minColumn: 0, minRow: 0,
    columnsTotal: 0, rowsTotal: 0, bgX: 0, bgY: 0, bgMoveSteps: 0, boxMons: [],
  };
  gS().multiMoveWindowId = AddWindow8Bit(sWindowTemplate_MultiMove());
  if (gS().multiMoveWindowId !== WINDOW_NONE) {
    FillWindowPixelBuffer(gS().multiMoveWindowId, PIXEL_FILL(0));
    return true;
  }
  return false;
}

/** MultiMove_Free */
export function MultiMove_Free(): void {
  sMultiMove = null;
}

/** MultiMove_SetFunction */
export function MultiMove_SetFunction(funcId: number): void {
  sMultiMove!.funcId = funcId;
  sMultiMove!.state = 0;
}

/** MultiMove_RunFunction */
export function MultiMove_RunFunction(): boolean {
  switch (sMultiMove!.funcId) {
    case MULTIMOVE_START: return MultiMove_Function_Start();
    case MULTIMOVE_SINGLE: return MultiMove_Function_Single();
    case MULTIMOVE_CHANGE_SELECTION: return MultiMove_Function_ChangeSelection();
    case MULTIMOVE_GRAB_SELECTION: return MultiMove_Function_GrabSelection();
    case MULTIMOVE_MOVE_MONS: return MultiMove_Function_MoveMons();
    case MULTIMOVE_PLACE_MONS: return MultiMove_Function_PlaceMons();
  }
  return false;
}

function MultiMove_Function_Start(): boolean {
  const m = sMultiMove!;
  switch (m.state) {
    case 0:
      HideBg(0);
      LoadMonIconPalettesAt(BG_PLTT_ID(8));
      m.state++;
      break;
    case 1:
      [m.fromColumn, m.fromRow] = GetCursorBoxColumnAndRow();
      m.toColumn = m.fromColumn;
      m.toRow = m.fromRow;
      ChangeBgX(0, -1024, BG_COORD_SET);
      ChangeBgY(0, -1024, BG_COORD_SET);
      FillBgTilemapBufferRect_Palette0(0, 0, 0, 0, 32, 32);
      FillWindowPixelBuffer8Bit(gS().multiMoveWindowId, PIXEL_FILL(0));
      MultiMove_SetIconToBg(m.fromColumn, m.fromRow);
      SetBgAttribute(0, BG_ATTR_PALETTEMODE, 1);
      PutWindowTilemap(gS().multiMoveWindowId);
      CopyWindowToVram8Bit(gS().multiMoveWindowId, COPYWIN_FULL);
      BlendPalettes(0x3f00, 8, RGB_WHITE);
      StartCursorAnim(CURSOR_ANIM_OPEN);
      SetGpuRegBits(REG_OFFSET_BG0CNT, BGCNT_256COLOR);
      m.state++;
      break;
    case 2:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        ShowBg(0);
        return false;
      }
      break;
  }
  return true;
}

function MultiMove_Function_Single(): boolean {
  const m = sMultiMove!;
  switch (m.state) {
    case 0:
      HideBg(0);
      m.state++;
      break;
    case 1:
      MultiMove_ResetBg();
      StartCursorAnim(CURSOR_ANIM_BOUNCE);
      m.state++;
      break;
    case 2:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        SetCursorPriorityTo1();
        LoadPalette(GetTextWindowPalette(3), BG_PLTT_ID(13), PLTT_SIZE_4BPP);
        ShowBg(0);
        return false;
      }
      break;
  }
  return true;
}

function MultiMove_Function_ChangeSelection(): boolean {
  const m = sMultiMove!;
  switch (m.state) {
    case 0:
      if (!UpdateCursorPos()) {
        [m.cursorColumn, m.cursorRow] = GetCursorBoxColumnAndRow();
        MultiMove_UpdateSelectedIcons();
        m.toColumn = m.cursorColumn;
        m.toRow = m.cursorRow;
        CopyWindowToVram8Bit(gS().multiMoveWindowId, COPYWIN_GFX);
        m.state++;
      }
      break;
    case 1:
      return IsDma3ManagerBusyWithBgCopy();
  }
  return true;
}

function MultiMove_Function_GrabSelection(): boolean {
  const m = sMultiMove!;
  switch (m.state) {
    case 0:
      MultiMove_GetMonsFromSelection();
      MultiMove_RemoveMonsFromBox();
      InitMultiMonPlaceChange(false);
      m.state++;
      break;
    case 1:
      if (!DoMonPlaceChange()) {
        StartCursorAnim(CURSOR_ANIM_FIST);
        MultiMove_InitBg(0, 256, 8);
        InitMultiMonPlaceChange(true);
        m.state++;
      }
      break;
    case 2: {
      const movingBg = MultiMove_UpdateBg();
      const movingMon = DoMonPlaceChange();
      if (!movingBg && !movingMon) return false;
      break;
    }
  }
  return true;
}

function MultiMove_Function_MoveMons(): boolean {
  const movingCursor = UpdateCursorPos();
  const movingBg = MultiMove_UpdateBg();
  return !(!movingCursor && !movingBg);
}

function MultiMove_Function_PlaceMons(): boolean {
  const m = sMultiMove!;
  switch (m.state) {
    case 0:
      MultiMove_SetPlacedMonData();
      MultiMove_InitBg(0, -256, 8);
      InitMultiMonPlaceChange(false);
      m.state++;
      break;
    case 1:
      if (!DoMonPlaceChange() && !MultiMove_UpdateBg()) {
        MultiMove_CreatePlacedMonIcons();
        StartCursorAnim(CURSOR_ANIM_OPEN);
        InitMultiMonPlaceChange(true);
        HideBg(0);
        m.state++;
      }
      break;
    case 2:
      if (!DoMonPlaceChange()) {
        StartCursorAnim(CURSOR_ANIM_BOUNCE);
        MultiMove_ResetBg();
        m.state++;
      }
      break;
    case 3:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        LoadPalette(GetTextWindowPalette(3), BG_PLTT_ID(13), PLTT_SIZE_4BPP);
        SetCursorPriorityTo1();
        ShowBg(0);
        return false;
      }
      break;
  }
  return true;
}

/** MultiMove_TryMoveGroup */
export function MultiMove_TryMoveGroup(dir: number): boolean {
  const m = sMultiMove!;
  switch (dir) {
    case 0: // up
      if (m.minRow === 0) return false;
      m.minRow--;
      MultiMove_InitBg(0, 1024, 6);
      break;
    case 1: // down
      if (m.minRow + m.rowsTotal >= 5) return false;
      m.minRow++;
      MultiMove_InitBg(0, -1024, 6);
      break;
    case 2: // left
      if (m.minColumn === 0) return false;
      m.minColumn--;
      MultiMove_InitBg(1024, 0, 6);
      break;
    case 3: // right
      if (m.minColumn + m.columnsTotal > 5) return false;
      m.minColumn++;
      MultiMove_InitBg(-1024, 0, 6);
      break;
  }
  return true;
}

function MultiMove_UpdateSelectedIcons(): void {
  const m = sMultiMove!;
  const columnChange = Math.abs(m.fromColumn - m.cursorColumn) - Math.abs(m.fromColumn - m.toColumn);
  const rowChange = Math.abs(m.fromRow - m.cursorRow) - Math.abs(m.fromRow - m.toRow);
  if (columnChange > 0) MultiMove_SelectColumn(m.cursorColumn, m.fromRow, m.toRow);
  if (columnChange < 0) {
    MultiMove_DeselectColumn(m.toColumn, m.fromRow, m.toRow);
    MultiMove_SelectColumn(m.cursorColumn, m.fromRow, m.toRow);
  }
  if (rowChange > 0) MultiMove_SelectRow(m.cursorRow, m.fromColumn, m.toColumn);
  if (rowChange < 0) {
    MultiMove_DeselectRow(m.toRow, m.fromColumn, m.toColumn);
    MultiMove_SelectRow(m.cursorRow, m.fromColumn, m.toColumn);
  }
}

function MultiMove_SelectColumn(column: number, minRow: number, maxRow: number): void {
  if (minRow > maxRow) [minRow, maxRow] = [maxRow, minRow];
  while (minRow <= maxRow) MultiMove_SetIconToBg(column, minRow++);
}

function MultiMove_SelectRow(row: number, minColumn: number, maxColumn: number): void {
  if (minColumn > maxColumn) [minColumn, maxColumn] = [maxColumn, minColumn];
  while (minColumn <= maxColumn) MultiMove_SetIconToBg(minColumn++, row);
}

function MultiMove_DeselectColumn(column: number, minRow: number, maxRow: number): void {
  if (minRow > maxRow) [minRow, maxRow] = [maxRow, minRow];
  while (minRow <= maxRow) MultiMove_ClearIconFromBg(column, minRow++);
}

function MultiMove_DeselectRow(row: number, minColumn: number, maxColumn: number): void {
  if (minColumn > maxColumn) [minColumn, maxColumn] = [maxColumn, minColumn];
  while (minColumn <= maxColumn) MultiMove_ClearIconFromBg(minColumn++, row);
}

function MultiMove_SetIconToBg(x: number, y: number): void {
  const position = x + IN_BOX_COLUMNS * y;
  const species = GetCurrentBoxMonData(position, C.MON_DATA_SPECIES_OR_EGG);
  const personality = GetCurrentBoxMonData(position, C.MON_DATA_PERSONALITY);
  if (species !== C.SPECIES_NONE) {
    const iconGfx = GetMonIconPtr(species, personality, 1);
    const palNum = GetValidMonIconPalIndex(species) + 8;
    BlitBitmapRectToWindow4BitTo8Bit(gS().multiMoveWindowId, iconGfx, 0, 0, 32, 32, 24 * x, 24 * y, 32, 32, palNum);
  }
}

function MultiMove_ClearIconFromBg(x: number, y: number): void {
  const position = x + IN_BOX_COLUMNS * y;
  const species = GetCurrentBoxMonData(position, C.MON_DATA_SPECIES_OR_EGG);
  if (species !== C.SPECIES_NONE) FillWindowPixelRect8Bit(gS().multiMoveWindowId, PIXEL_FILL(0), 24 * x, 24 * y, 32, 32);
}

function MultiMove_InitBg(bgX: number, bgY: number, duration: number): void {
  const m = sMultiMove!;
  m.bgX = bgX & 0xffff;
  m.bgY = bgY & 0xffff;
  m.bgMoveSteps = duration;
}

function MultiMove_UpdateBg(): number {
  const m = sMultiMove!;
  if (m.bgMoveSteps !== 0) {
    ChangeBgX(0, m.bgX, BG_COORD_ADD);
    ChangeBgY(0, m.bgY, BG_COORD_ADD);
    m.bgMoveSteps--;
  }
  return m.bgMoveSteps;
}

function MultiMove_GetMonsFromSelection(): void {
  const m = sMultiMove!;
  m.minColumn = Math.min(m.fromColumn, m.toColumn);
  m.minRow = Math.min(m.fromRow, m.toRow);
  m.columnsTotal = Math.abs(m.fromColumn - m.toColumn) + 1;
  m.rowsTotal = Math.abs(m.fromRow - m.toRow) + 1;
  const boxId = StorageGetCurrentBox();
  let monArrayId = 0;
  const columnCount = m.minColumn + m.columnsTotal;
  const rowCount = m.minRow + m.rowsTotal;
  for (let i = m.minRow; i < rowCount; i++) {
    let boxPosition = IN_BOX_COLUMNS * i + m.minColumn;
    for (let j = m.minColumn; j < columnCount; j++) {
      const boxMon = GetBoxedMonPtr(boxId, boxPosition);
      if (boxMon) m.boxMons[monArrayId] = structuredClone(boxMon) as Mon;
      monArrayId++;
      boxPosition++;
    }
  }
}

function MultiMove_RemoveMonsFromBox(): void {
  const m = sMultiMove!;
  const columnCount = m.minColumn + m.columnsTotal;
  const rowCount = m.minRow + m.rowsTotal;
  const boxId = StorageGetCurrentBox();
  for (let i = m.minRow; i < rowCount; i++) {
    let boxPosition = IN_BOX_COLUMNS * i + m.minColumn;
    for (let j = m.minColumn; j < columnCount; j++) {
      DestroyBoxMonIconAtPosition(boxPosition);
      ZeroBoxMonAt(boxId, boxPosition);
      boxPosition++;
    }
  }
}

function MultiMove_CreatePlacedMonIcons(): void {
  const m = sMultiMove!;
  const columnCount = m.minColumn + m.columnsTotal;
  const rowCount = m.minRow + m.rowsTotal;
  let monArrayId = 0;
  for (let i = m.minRow; i < rowCount; i++) {
    let boxPosition = IN_BOX_COLUMNS * i + m.minColumn;
    for (let j = m.minColumn; j < columnCount; j++) {
      if (GetMonData(m.boxMons[monArrayId], C.MON_DATA_SANITY_HAS_SPECIES)) CreateBoxMonIconAtPos(boxPosition);
      monArrayId++;
      boxPosition++;
    }
  }
}

function MultiMove_SetPlacedMonData(): void {
  const m = sMultiMove!;
  const columnCount = m.minColumn + m.columnsTotal;
  const rowCount = m.minRow + m.rowsTotal;
  const boxId = StorageGetCurrentBox();
  let monArrayId = 0;
  for (let i = m.minRow; i < rowCount; i++) {
    let boxPosition = IN_BOX_COLUMNS * i + m.minColumn;
    for (let j = m.minColumn; j < columnCount; j++) {
      if (GetMonData(m.boxMons[monArrayId], C.MON_DATA_SANITY_HAS_SPECIES)) SetBoxMonAt(boxId, boxPosition, m.boxMons[monArrayId]);
      boxPosition++;
      monArrayId++;
    }
  }
}

function MultiMove_ResetBg(): void {
  ChangeBgX(0, 0, BG_COORD_SET);
  ChangeBgY(0, 0, BG_COORD_SET);
  SetBgAttribute(0, BG_ATTR_PALETTEMODE, 0);
  ClearGpuRegBits(REG_OFFSET_BG0CNT, BGCNT_256COLOR);
  FillBgTilemapBufferRect_Palette0(0, 0, 0, 0, 32, 32);
  CopyBgTilemapBufferToVram(0);
}

/** MultiMove_GetOriginPosition */
export function MultiMove_GetOriginPosition(): number {
  return IN_BOX_COLUMNS * sMultiMove!.fromRow + sMultiMove!.fromColumn;
}

/** MultiMove_CanPlaceSelection */
export function MultiMove_CanPlaceSelection(): boolean {
  const m = sMultiMove!;
  const columnCount = m.minColumn + m.columnsTotal;
  const rowCount = m.minRow + m.rowsTotal;
  let monArrayId = 0;
  for (let i = m.minRow; i < rowCount; i++) {
    let boxPosition = IN_BOX_COLUMNS * i + m.minColumn;
    for (let j = m.minColumn; j < columnCount; j++) {
      if (GetMonData(m.boxMons[monArrayId], C.MON_DATA_SANITY_HAS_SPECIES) && GetCurrentBoxMonData(boxPosition, C.MON_DATA_SANITY_HAS_SPECIES)) return false;
      monArrayId++;
      boxPosition++;
    }
  }
  return true;
}

// IDs for the item icon sprite callbacks
const ITEM_CB_WAIT_ANIM = 0;
const ITEM_CB_TO_HAND = 1;
const ITEM_CB_TO_MON = 2;
const ITEM_CB_SWAP_TO_HAND = 3;
const ITEM_CB_SWAP_TO_MON = 4;
const ITEM_CB_HIDE_PARTY = 7;

const sItemIconTemplate = (): SpriteTemplate => ({
  tileTag: GFXTAG_ITEM_ICON_0, paletteTag: PALTAG_ITEM_ICON_0, oam: oamFrom({ $sym: "sOamData_ItemIcon" }), anims: animsFrom(0),
  images: null, affineAnims: affineAnimsFrom({ $sym: "sAffineAnims_ItemIcon" }), callback: SpriteCallbackDummy,
});

/** CreateItemIconSprites */
export function CreateItemIconSprites(): void {
  const g = gS();
  if (g.boxOption === OPTION_MOVE_ITEMS) {
    const spriteTemplate = sItemIconTemplate();
    for (let i = 0; i < MAX_ITEM_ICONS; i++) {
      LoadSpriteSheet({ data: new Uint8Array(0x200), size: 0x200, tag: GFXTAG_ITEM_ICON_0 + i });
      g.itemIcons[i].tiles = GetSpriteTileStartByTag(GFXTAG_ITEM_ICON_0 + i) * TILE_SIZE_4BPP + OBJ_VRAM0;
      g.itemIcons[i].palIndex = OBJ_PLTT_ID(AllocSpritePalette(PALTAG_ITEM_ICON_0 + i));
      spriteTemplate.tileTag = GFXTAG_ITEM_ICON_0 + i;
      spriteTemplate.paletteTag = PALTAG_ITEM_ICON_0 + i;
      const spriteId = CreateSprite(spriteTemplate, 0, 0, 11);
      g.itemIcons[i].sprite = gSprites[spriteId];
      g.itemIcons[i].sprite!.invisible = true;
      g.itemIcons[i].active = false;
    }
  }
  g.movingItemId = C.ITEM_NONE;
}

/** TryLoadItemIconAtPos */
export function TryLoadItemIconAtPos(cursorArea: number, cursorPos: number): void {
  let heldItem: number;
  if (gS().boxOption !== OPTION_MOVE_ITEMS || IsItemIconAtPosition(cursorArea, cursorPos)) return;
  switch (cursorArea) {
    case CURSOR_AREA_IN_BOX:
      if (!GetCurrentBoxMonData(cursorPos, C.MON_DATA_SANITY_HAS_SPECIES)) return;
      heldItem = GetCurrentBoxMonData(cursorPos, C.MON_DATA_HELD_ITEM);
      break;
    case CURSOR_AREA_IN_PARTY:
      if (!GetMonData(sParty[cursorPos], C.MON_DATA_SANITY_HAS_SPECIES)) return;
      heldItem = GetMonData(sParty[cursorPos], C.MON_DATA_HELD_ITEM);
      break;
    default:
      return;
  }
  if (heldItem !== C.ITEM_NONE) {
    const tiles = GetItemIconPic(heldItem);
    const pal = GetItemIconPalette(heldItem);
    const id = GetNewItemIconIdx();
    SetItemIconPosition(id, cursorArea, cursorPos);
    LoadItemIconGfx(id, tiles, pal);
    SetItemIconAffineAnim(id, ITEM_ANIM_APPEAR);
    SetItemIconActive(id, true);
  }
}

/** TryHideItemIconAtPos */
export function TryHideItemIconAtPos(cursorArea: number, cursorPos: number): void {
  if (gS().boxOption !== OPTION_MOVE_ITEMS) return;
  const id = GetItemIconIdxByPosition(cursorArea, cursorPos);
  SetItemIconAffineAnim(id, ITEM_ANIM_DISAPPEAR);
  SetItemIconCallback(id, ITEM_CB_WAIT_ANIM, cursorArea, cursorPos);
}

/** Item_FromMonToMoving */
export function Item_FromMonToMoving(cursorArea: number, cursorPos: number): void {
  const g = gS();
  if (g.boxOption !== OPTION_MOVE_ITEMS) return;
  const id = GetItemIconIdxByPosition(cursorArea, cursorPos);
  const item = 0;
  SetItemIconAffineAnim(id, ITEM_ANIM_PICK_UP);
  SetItemIconCallback(id, ITEM_CB_TO_HAND, cursorArea, cursorPos);
  SetItemIconPosition(id, CURSOR_AREA_IN_HAND, 0);
  if (cursorArea === CURSOR_AREA_IN_BOX) {
    SetCurrentBoxMonData(cursorPos, C.MON_DATA_HELD_ITEM, item);
    SetBoxMonIconObjMode(cursorPos, ST_OAM_OBJ_BLEND);
  } else {
    SetMonData(sParty[cursorPos], C.MON_DATA_HELD_ITEM, item);
    SetPartyMonIconObjMode(cursorPos, ST_OAM_OBJ_BLEND);
  }
  g.movingItemId = g.displayMonItemId;
}

/** InitItemIconInCursor */
export function InitItemIconInCursor(item: number): void {
  const tiles = GetItemIconPic(item);
  const pal = GetItemIconPalette(item);
  const id = GetNewItemIconIdx();
  LoadItemIconGfx(id, tiles, pal);
  SetItemIconAffineAnim(id, ITEM_ANIM_LARGE);
  SetItemIconCallback(id, ITEM_CB_TO_HAND, 0, 0);
  SetItemIconPosition(id, CURSOR_AREA_IN_HAND, 0);
  SetItemIconActive(id, true);
  gS().movingItemId = item;
}

/** Item_SwitchMonsWithMoving */
export function Item_SwitchMonsWithMoving(cursorArea: number, cursorPos: number): void {
  const g = gS();
  if (g.boxOption !== OPTION_MOVE_ITEMS) return;
  let id = GetItemIconIdxByPosition(cursorArea, cursorPos);
  SetItemIconAffineAnim(id, ITEM_ANIM_PICK_UP);
  SetItemIconCallback(id, ITEM_CB_SWAP_TO_HAND, CURSOR_AREA_IN_HAND, 0);
  let item: number;
  if (cursorArea === CURSOR_AREA_IN_BOX) {
    item = GetCurrentBoxMonData(cursorPos, C.MON_DATA_HELD_ITEM);
    SetCurrentBoxMonData(cursorPos, C.MON_DATA_HELD_ITEM, g.movingItemId);
    g.movingItemId = item;
  } else {
    item = GetMonData(sParty[cursorPos], C.MON_DATA_HELD_ITEM);
    SetMonData(sParty[cursorPos], C.MON_DATA_HELD_ITEM, g.movingItemId);
    g.movingItemId = item;
  }
  id = GetItemIconIdxByPosition(2, 0);
  SetItemIconAffineAnim(id, ITEM_ANIM_PUT_DOWN);
  SetItemIconCallback(id, ITEM_CB_SWAP_TO_MON, cursorArea, cursorPos);
}

/** Item_GiveMovingToMon */
export function Item_GiveMovingToMon(cursorArea: number, cursorPos: number): void {
  const g = gS();
  if (g.boxOption !== OPTION_MOVE_ITEMS) return;
  const id = GetItemIconIdxByPosition(2, 0);
  SetItemIconAffineAnim(id, ITEM_ANIM_PUT_DOWN);
  SetItemIconCallback(id, ITEM_CB_TO_MON, cursorArea, cursorPos);
  if (cursorArea === CURSOR_AREA_IN_BOX) {
    SetCurrentBoxMonData(cursorPos, C.MON_DATA_HELD_ITEM, g.movingItemId);
    SetBoxMonIconObjMode(cursorPos, ST_OAM_OBJ_NORMAL);
  } else {
    SetMonData(sParty[cursorPos], C.MON_DATA_HELD_ITEM, g.movingItemId);
    SetPartyMonIconObjMode(cursorPos, ST_OAM_OBJ_NORMAL);
  }
}

/** Item_TakeMons */
export function Item_TakeMons(cursorArea: number, cursorPos: number): void {
  if (gS().boxOption !== OPTION_MOVE_ITEMS) return;
  const item = C.ITEM_NONE;
  const id = GetItemIconIdxByPosition(cursorArea, cursorPos);
  SetItemIconAffineAnim(id, ITEM_ANIM_DISAPPEAR);
  SetItemIconCallback(id, ITEM_CB_WAIT_ANIM, cursorArea, cursorPos);
  if (cursorArea === CURSOR_AREA_IN_BOX) {
    SetCurrentBoxMonData(cursorPos, C.MON_DATA_HELD_ITEM, item);
    SetBoxMonIconObjMode(cursorPos, ST_OAM_OBJ_BLEND);
  } else {
    SetMonData(sParty[cursorPos], C.MON_DATA_HELD_ITEM, item);
    SetPartyMonIconObjMode(cursorPos, ST_OAM_OBJ_BLEND);
  }
}

/** MoveItemFromCursorToBag */
export function MoveItemFromCursorToBag(): void {
  if (gS().boxOption === OPTION_MOVE_ITEMS) {
    const id = GetItemIconIdxByPosition(CURSOR_AREA_IN_HAND, 0);
    SetItemIconAffineAnim(id, ITEM_ANIM_PUT_AWAY);
    SetItemIconCallback(id, ITEM_CB_WAIT_ANIM, 2, 0);
  }
}

/**
 * MoveHeldItemWithPartyMenu: the party menu is being closed; if the cursor is on a Pokémon that has a held item
 * make sure it slides up along with the closing menu.
 */
export function MoveHeldItemWithPartyMenu(): void {
  const g = gS();
  if (g.boxOption !== OPTION_MOVE_ITEMS) return;
  for (let i = 0; i < MAX_ITEM_ICONS; i++) {
    if (g.itemIcons[i].active && g.itemIcons[i].cursorArea === CURSOR_AREA_IN_PARTY) SetItemIconCallback(i, ITEM_CB_HIDE_PARTY, 2, 0);
  }
}

/** IsItemIconAnimActive */
export function IsItemIconAnimActive(): boolean {
  const g = gS();
  for (let i = 0; i < MAX_ITEM_ICONS; i++) {
    if (g.itemIcons[i].active) {
      const sprite = g.itemIcons[i].sprite!;
      if (!sprite.affineAnimEnded && sprite.affineAnimBeginning) return true;
      if (sprite.callback !== SpriteCallbackDummy && sprite.callback !== SpriteCB_ItemIcon_SetPosToCursor) return true;
    }
  }
  return false;
}

/** IsActiveItemMoving */
export function IsActiveItemMoving(): boolean {
  const g = gS();
  if (g.boxOption === OPTION_MOVE_ITEMS) {
    for (let i = 0; i < MAX_ITEM_ICONS; i++) {
      if (g.itemIcons[i].active && g.itemIcons[i].cursorArea === CURSOR_AREA_BOX_TITLE) return true;
    }
  }
  return false;
}

/** GetMovingItemName */
export function GetMovingItemName(): ArrayLike<number> {
  return ItemId_GetName(gS().movingItemId);
}

/** GetMovingItem */
export function GetMovingItem(): number {
  return gS().movingItemId;
}

function GetNewItemIconIdx(): number {
  const g = gS();
  for (let i = 0; i < MAX_ITEM_ICONS; i++) {
    if (!g.itemIcons[i].active) {
      g.itemIcons[i].active = true;
      return i;
    }
  }
  return MAX_ITEM_ICONS;
}

function IsItemIconAtPosition(cursorArea: number, cursorPos: number): boolean {
  const g = gS();
  for (let i = 0; i < MAX_ITEM_ICONS; i++) {
    if (g.itemIcons[i].active && g.itemIcons[i].cursorArea === cursorArea && g.itemIcons[i].cursorPos === cursorPos) return true;
  }
  return false;
}

function GetItemIconIdxByPosition(cursorArea: number, cursorPos: number): number {
  const g = gS();
  for (let i = 0; i < MAX_ITEM_ICONS; i++) {
    if (g.itemIcons[i].active && g.itemIcons[i].cursorArea === cursorArea && g.itemIcons[i].cursorPos === cursorPos) return i;
  }
  return MAX_ITEM_ICONS;
}

function GetItemIconIdxBySprite(sprite: Sprite): number {
  const g = gS();
  for (let i = 0; i < MAX_ITEM_ICONS; i++) {
    if (g.itemIcons[i].active && g.itemIcons[i].sprite === sprite) return i;
  }
  return MAX_ITEM_ICONS;
}

function SetItemIconPosition(id: number, cursorArea: number, cursorPos: number): void {
  const g = gS();
  if (id >= MAX_ITEM_ICONS) return;
  const sprite = g.itemIcons[id].sprite!;
  switch (cursorArea) {
    case CURSOR_AREA_IN_BOX: {
      const row = cursorPos % IN_BOX_COLUMNS;
      const column = (cursorPos / IN_BOX_COLUMNS) | 0;
      sprite.x = 24 * row + 112;
      sprite.y = 24 * column + 56;
      sprite.oam.priority = 2;
      break;
    }
    case CURSOR_AREA_IN_PARTY:
      if (cursorPos === 0) {
        sprite.x = 116;
        sprite.y = 76;
      } else {
        sprite.x = 164;
        sprite.y = 24 * (cursorPos - 1) + 28;
      }
      sprite.oam.priority = 1;
      break;
  }
  g.itemIcons[id].cursorArea = cursorArea;
  g.itemIcons[id].cursorPos = cursorPos;
}

function LoadItemIconGfx(id: number, itemTiles: Uint8Array, itemPal: Uint8Array): void {
  const g = gS();
  if (id >= MAX_ITEM_ICONS) return;
  g.itemIconBuffer.fill(0, 0, 0x200);
  g.tileBuffer.set(itemTiles.subarray(0, Math.min(itemTiles.length, g.tileBuffer.length)));
  for (let i = 0; i < 3; i++) g.itemIconBuffer.set(g.tileBuffer.subarray(i * 0x60, i * 0x60 + 0x60), i * 0x80);
  ppu.vram.set(g.itemIconBuffer.subarray(0, 0x200), g.itemIcons[id].tiles);
  g.itemIconBuffer.set(itemPal.subarray(0, 32));
  LoadPalette(new Uint16Array(g.itemIconBuffer.buffer, g.itemIconBuffer.byteOffset, 16), g.itemIcons[id].palIndex, PLTT_SIZE_4BPP);
}

function SetItemIconAffineAnim(id: number, animNum: number): void {
  if (id >= MAX_ITEM_ICONS) return;
  StartSpriteAffineAnim(gS().itemIcons[id].sprite!, animNum);
}

// Item icon sprite data
const sItemIconId = 0;
const sState = 0;
const sCursorArea = 6;
const sCursorPos = 7;

function SetItemIconCallback(id: number, callbackId: number, cursorArea: number, cursorPos: number): void {
  if (id >= MAX_ITEM_ICONS) return;
  const sprite = gS().itemIcons[id].sprite!;
  switch (callbackId) {
    case ITEM_CB_WAIT_ANIM:
      sprite.data[sItemIconId] = id;
      sprite.callback = SpriteCB_ItemIcon_WaitAnim;
      break;
    case ITEM_CB_TO_HAND:
      sprite.data[sState] = 0;
      sprite.callback = SpriteCB_ItemIcon_ToHand;
      break;
    case ITEM_CB_TO_MON:
      sprite.data[sState] = 0;
      sprite.data[sCursorArea] = cursorArea;
      sprite.data[sCursorPos] = cursorPos;
      sprite.callback = SpriteCB_ItemIcon_ToMon;
      break;
    case ITEM_CB_SWAP_TO_HAND:
      sprite.data[sState] = 0;
      sprite.callback = SpriteCB_ItemIcon_SwapToHand;
      sprite.data[sCursorArea] = cursorArea;
      sprite.data[sCursorPos] = cursorPos;
      break;
    case ITEM_CB_SWAP_TO_MON:
      sprite.data[sState] = 0;
      sprite.data[sCursorArea] = cursorArea;
      sprite.data[sCursorPos] = cursorPos;
      sprite.callback = SpriteCB_ItemIcon_SwapToMon;
      break;
    case ITEM_CB_HIDE_PARTY:
      // If cursor is on a Pokémon with a held item and the player closes the party menu, have the held item
      // follow the Pokémon as the menu slides out
      sprite.callback = SpriteCB_ItemIcon_HideParty;
      break;
  }
}

function SetItemIconActive(id: number, show: boolean): void {
  if (id >= MAX_ITEM_ICONS) return;
  gS().itemIcons[id].active = show;
  gS().itemIcons[id].sprite!.invisible = !show;
}

function GetItemIconPic(itemId: number): Uint8Array {
  return GetItemIconGfxPtr(itemId, 0);
}

function GetItemIconPalette(itemId: number): Uint8Array {
  return GetItemIconGfxPtr(itemId, 1);
}

/** PrintItemDescription */
export function PrintItemDescription(): void {
  const g = gS();
  const description = IsActiveItemMoving() ? ItemId_GetDescription(g.movingItemId) : ItemId_GetDescription(g.displayMonItemId);
  FillWindowPixelBuffer(2, PIXEL_FILL(1));
  AddTextPrinterParameterized5(2, FONT_NORMAL, description, 2, 0, 0, null, 0, 0);
}

/** InitItemInfoWindow */
export function InitItemInfoWindow(): void {
  gS().itemInfoWindowOffset = 25;
  LoadBgTiles(0, incbin("pokemon_storage_system_misc.c:sItemInfoFrame_Gfx"), 0x80, 0x1a4);
  DrawItemInfoWindow(0);
}

/** UpdateItemInfoWindowSlideIn */
export function UpdateItemInfoWindowSlideIn(): boolean {
  const g = gS();
  if (g.itemInfoWindowOffset === 0) return false;
  g.itemInfoWindowOffset--;
  const pos = 25 - g.itemInfoWindowOffset;
  for (let i = 0; i < pos; i++) {
    WriteSequenceToBgTilemapBuffer(0, GetBgAttribute(0, BG_ATTR_BASETILE) + 0x14 + g.itemInfoWindowOffset + i, i, 12, 1, 8, 15, 25);
  }
  DrawItemInfoWindow(pos);
  return g.itemInfoWindowOffset !== 0;
}

/** UpdateItemInfoWindowSlideOut */
export function UpdateItemInfoWindowSlideOut(): boolean {
  const g = gS();
  if (g.itemInfoWindowOffset === 25) return false;
  if (g.itemInfoWindowOffset === 0) FillBgTilemapBufferRect(0, 0, 25, 11, 1, 10, 17);
  g.itemInfoWindowOffset++;
  const pos = 25 - g.itemInfoWindowOffset;
  for (let i = 0; i < pos; i++) {
    WriteSequenceToBgTilemapBuffer(0, GetBgAttribute(0, BG_ATTR_BASETILE) + 0x14 + g.itemInfoWindowOffset + i, i, 12, 1, 8, 15, 25);
  }
  DrawItemInfoWindow(pos);
  FillBgTilemapBufferRect(0, 0, pos, 11, 1, 10, 17);
  return g.itemInfoWindowOffset !== 25;
}

function DrawItemInfoWindow(x: number): void {
  if (x !== 0) {
    FillBgTilemapBufferRect(0, 0x1a4, 0, 0xb, x, 1, 15);
    FillBgTilemapBufferRect(0, 0x9a4, 0, 0x14, x, 1, 15);
  }
  FillBgTilemapBufferRect(0, 0x1a5, x, 0xc, 1, 8, 15);
  FillBgTilemapBufferRect(0, 0x1a6, x, 0xb, 1, 1, 15);
  FillBgTilemapBufferRect(0, 0x1a7, x, 0x14, 1, 1, 15);
  ScheduleBgCopyTilemapToVram(0);
}

function SpriteCB_ItemIcon_WaitAnim(sprite: Sprite): void {
  if (sprite.affineAnimEnded) {
    SetItemIconActive(sprite.data[sItemIconId], false);
    sprite.callback = SpriteCallbackDummy;
  }
}

function SpriteCB_ItemIcon_ToHand(sprite: Sprite): void {
  switch (sprite.data[sState]) {
    case 0:
      sprite.data[1] = sprite.x << 4;
      sprite.data[2] = sprite.y << 4;
      sprite.data[3] = 10;
      sprite.data[4] = 21;
      sprite.data[5] = 0;
      sprite.data[sState]++;
    // fallthrough
    case 1:
      sprite.data[1] -= sprite.data[3];
      sprite.data[2] -= sprite.data[4];
      sprite.x = sprite.data[1] >> 4;
      sprite.y = sprite.data[2] >> 4;
      if (++sprite.data[5] > 11) sprite.callback = SpriteCB_ItemIcon_SetPosToCursor;
      break;
  }
}

function SpriteCB_ItemIcon_SetPosToCursor(sprite: Sprite): void {
  const cursor = gS().cursorSprite!;
  sprite.x = cursor.x + 4;
  sprite.y = cursor.y + cursor.y2 + 8;
  sprite.oam.priority = cursor.oam.priority;
}

function SpriteCB_ItemIcon_ToMon(sprite: Sprite): void {
  switch (sprite.data[sState]) {
    case 0:
      sprite.data[1] = sprite.x << 4;
      sprite.data[2] = sprite.y << 4;
      sprite.data[3] = 10;
      sprite.data[4] = 21;
      sprite.data[5] = 0;
      sprite.data[sState]++;
    // fallthrough
    case 1:
      sprite.data[1] += sprite.data[3];
      sprite.data[2] += sprite.data[4];
      sprite.x = sprite.data[1] >> 4;
      sprite.y = sprite.data[2] >> 4;
      if (++sprite.data[5] > 11) {
        SetItemIconPosition(GetItemIconIdxBySprite(sprite), sprite.data[sCursorArea], sprite.data[sCursorPos]);
        sprite.callback = SpriteCallbackDummy;
      }
      break;
  }
}

function SpriteCB_ItemIcon_SwapToHand(sprite: Sprite): void {
  switch (sprite.data[sState]) {
    case 0:
      sprite.data[1] = sprite.x << 4;
      sprite.data[2] = sprite.y << 4;
      sprite.data[3] = 10;
      sprite.data[4] = 21;
      sprite.data[5] = 0;
      sprite.data[sState]++;
    // fallthrough
    case 1:
      sprite.data[1] -= sprite.data[3];
      sprite.data[2] -= sprite.data[4];
      sprite.x = sprite.data[1] >> 4;
      sprite.y = sprite.data[2] >> 4;
      sprite.x2 = gSineTable[sprite.data[5] * 8] >> 4;
      if (++sprite.data[5] > 11) {
        SetItemIconPosition(GetItemIconIdxBySprite(sprite), sprite.data[sCursorArea], sprite.data[sCursorPos]);
        sprite.x2 = 0;
        sprite.callback = SpriteCB_ItemIcon_SetPosToCursor;
      }
      break;
  }
}

function SpriteCB_ItemIcon_SwapToMon(sprite: Sprite): void {
  switch (sprite.data[sState]) {
    case 0:
      sprite.data[1] = sprite.x << 4;
      sprite.data[2] = sprite.y << 4;
      sprite.data[3] = 10;
      sprite.data[4] = 21;
      sprite.data[5] = 0;
      sprite.data[sState]++;
    // fallthrough
    case 1:
      sprite.data[1] += sprite.data[3];
      sprite.data[2] += sprite.data[4];
      sprite.x = sprite.data[1] >> 4;
      sprite.y = sprite.data[2] >> 4;
      sprite.x2 = -(gSineTable[sprite.data[5] * 8] >> 4);
      if (++sprite.data[5] > 11) {
        SetItemIconPosition(GetItemIconIdxBySprite(sprite), sprite.data[sCursorArea], sprite.data[sCursorPos]);
        sprite.callback = SpriteCallbackDummy;
        sprite.x2 = 0;
      }
      break;
  }
}

function SpriteCB_ItemIcon_HideParty(sprite: Sprite): void {
  sprite.y -= 8;
  if (sprite.y + sprite.y2 < -16) {
    sprite.callback = SpriteCallbackDummy;
    SetItemIconActive(GetItemIconIdxBySprite(sprite), false);
  }
}

// Some data transfer utility that goes functionally unused. It gets initialized with UnkUtil_Init, and run every
// vblank in Pokémon Storage with UnkUtil_Run, but neither of the Add functions are ever used, so UnkUtil_Run
// performs no actions.
export type UnkUtilData = { size: number; height: number; unk: number; func: (data: UnkUtilData) => void };
export type UnkUtil = { data: UnkUtilData[]; max: number; numActive: number };

let sUnkUtil: UnkUtil | null = null;

/** UnkUtil_Init */
export function UnkUtil_Init(util: UnkUtil, data: UnkUtilData[], max: number): void {
  sUnkUtil = util;
  util.data = data;
  util.max = max;
  util.numActive = 0;
}

/** UnkUtil_Run */
export function UnkUtil_Run(): void {
  if (sUnkUtil && sUnkUtil.numActive) {
    for (let i = 0; i < sUnkUtil.numActive; i++) {
      const data = sUnkUtil.data[i];
      data.func(data);
    }
    sUnkUtil.numActive = 0;
  }
}
