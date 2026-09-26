// list_menu.c (ListMenuInit, ListMenu_ProcessInput, scrolling and printing)
// and menu_indicators.c (scroll indicator arrows, red outline / arrow cursors).
// The C keeps these structs in gTasks[].data; here they live beside the task id.

import { sound } from "../audio/sound";
import * as C from "../generated/constants";
import { joy, A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, L_BUTTON, R_BUTTON, JOY_NEW } from "../gba/input";
import { tasks } from "../gba/tasks";
import { rom } from "../rom";
import { incbin } from "./assets";
import { FONTATTR_MAX_LETTER_HEIGHT, GetFontAttribute, GetMenuCursorDimensionByFont } from "./menu";
import { LoadPalette, OBJ_PLTT_ID } from "./palette";
import {
  AnimateSprite, ANIMCMD_END, ANIMCMD_FRAME, CreateSprite, DestroySprite, FreeSpritePaletteByTag, FreeSpriteTilesByTag, gDummySpriteAffineAnimTable, gDummySpriteTemplate,
  gSprites, LoadSpritePalette, LoadSpriteSheet, oamData, SetSubspriteTables, StartSpriteAnim, TAG_NONE, type Sprite, type SpriteTemplate, type Subsprite,
} from "./sprite";
import { AddTextPrinterParameterized4 } from "./text";
import { gSineTable } from "./trig";
import { GetValidMonIconPalettePtr } from "../pokemonIcon";
import { ClearStdWindowAndFrame, LoadUserWindowGfx } from "./menu";
import { DrawTextBorderOuter } from "./menuHelpers";
import {
  AddWindow, BlitBitmapRectToWindow, BlitBitmapToWindow, ClearWindowTilemap, COPYWIN_GFX, COPYWIN_MAP, CopyWindowToVram, FillWindowPixelBuffer,
  FillWindowPixelRect, GetWindowAttribute, PIXEL_FILL, PutWindowRectTilemapOverridePalette, PutWindowTilemap, RemoveWindow, ScrollWindow,
  SetWindowAttribute, WINDOW_HEIGHT, WINDOW_TILEMAP_LEFT, WINDOW_TILEMAP_TOP, WINDOW_WIDTH, type WindowTemplate,
} from "./window";

export const LIST_NOTHING_CHOSEN = -1;
export const LIST_CANCEL = -2;
export const LIST_HEADER = -3;
export const LIST_NO_MULTIPLE_SCROLL = 0, LIST_MULTIPLE_SCROLL_DPAD = 1, LIST_MULTIPLE_SCROLL_L_R = 2;
export const SCROLL_ARROW_LEFT = 0, SCROLL_ARROW_RIGHT = 1, SCROLL_ARROW_UP = 2, SCROLL_ARROW_DOWN = 3;

export type ListMenuItem = { label: ArrayLike<number>; index: number };
export type ListMenuTemplate = {
  items: ListMenuItem[];
  moveCursorFunc: ((itemIndex: number, onInit: boolean, list: ListMenu) => void) | null;
  itemPrintFunc: ((windowId: number, itemId: number, y: number) => void) | null;
  totalItems: number;
  maxShowed: number;
  windowId: number;
  header_X: number;
  item_X: number;
  cursor_X: number;
  upText_Y: number;
  cursorPal: number;
  fillValue: number;
  cursorShadowPal: number;
  lettersSpacing: number;
  itemVerticalPadding: number;
  scrollMultiple: number;
  fontId: number;
  cursorKind: number;
  /** Draw target; defaults to the hardware window `windowId`. */
  surface?: ListSurface;
};

/** The window operations list_menu.c uses, so field (canvas) windows can host a ListMenu too. */
export interface ListSurface {
  readonly left: number; readonly top: number; readonly width: number; readonly height: number;
  fill(fillValue: number): void;
  fillRect(fillValue: number, x: number, y: number, w: number, h: number): void;
  /** ScrollWindow: direction 0 moves the contents up, 1 down. */
  scroll(direction: number, distance: number, fillValue: number): void;
  print(fontId: number, x: number, y: number, letterSpacing: number, colors: [number, number, number], str: ArrayLike<number>): void;
  copy(): void;
}

export function hwListSurface(windowId: number): ListSurface {
  return {
    get left() { return GetWindowAttribute(windowId, WINDOW_TILEMAP_LEFT); },
    get top() { return GetWindowAttribute(windowId, WINDOW_TILEMAP_TOP); },
    get width() { return GetWindowAttribute(windowId, WINDOW_WIDTH); },
    get height() { return GetWindowAttribute(windowId, WINDOW_HEIGHT); },
    fill: (v) => FillWindowPixelBuffer(windowId, v),
    fillRect: (v, x, y, w, h) => FillWindowPixelRect(windowId, v, x, y, w, h),
    scroll: (dir, dist, v) => ScrollWindow(windowId, dir, dist, v),
    print: (fontId, x, y, spacing, colors, str) => AddTextPrinterParameterized4(windowId, fontId, x, y, spacing, 0, colors, -1, str),
    copy: () => CopyWindowToVram(windowId, COPYWIN_GFX),
  };
}

const surf = (list: ListMenu): ListSurface => (list.template.surface ??= hwListSurface(list.template.windowId));
export type ListMenu = { template: ListMenuTemplate; cursorPos: number; itemsAbove: number; taskId: number };
export type ListMenuWindowRect = { x: number; y: number; width: number; height: number; palNum: number };

const lists = new Map<number, ListMenu>();
const TAIL_SENTINEL = 0xff;

/** gListMenuOverride */
const override = { cursorPal: 0, fillValue: 0, cursorShadowPal: 0, lettersSpacing: 0, fontId: 0, enabled: false };

export function listMenuOf(taskId: number): ListMenu {
  const list = lists.get(taskId);
  if (!list) throw new Error(`no list menu in task ${taskId}`);
  return list;
}

export function ListMenuInit(template: ListMenuTemplate, cursorPos: number, itemsAbove: number): number {
  const taskId = ListMenuInitInternal(template, cursorPos, itemsAbove);
  PutWindowTilemap(template.windowId);
  CopyWindowToVram(template.windowId, COPYWIN_GFX);
  return taskId;
}

/** ListMenuInit for a template whose `surface` is not a hardware window (no tilemap to put). */
export function ListMenuInitOnSurface(template: ListMenuTemplate, cursorPos: number, itemsAbove: number): number {
  const taskId = ListMenuInitInternal(template, cursorPos, itemsAbove);
  surf(listMenuOf(taskId)).copy();
  return taskId;
}

export function ListMenuInitInRect(template: ListMenuTemplate, rects: ListMenuWindowRect[], cursorPos: number, itemsAbove: number): number {
  const taskId = ListMenuInitInternal(template, cursorPos, itemsAbove);
  for (const r of rects) {
    if (r.palNum === 0xff) break;
    PutWindowRectTilemapOverridePalette(template.windowId, r.x, r.y, r.width, r.height, r.palNum);
  }
  CopyWindowToVram(template.windowId, COPYWIN_GFX);
  return taskId;
}

export function ListMenu_ProcessInput(listTaskId: number): number {
  const list = listMenuOf(listTaskId);
  if (joy.newKeys & A_BUTTON) return list.template.items[list.cursorPos + list.itemsAbove].index;
  if (joy.newKeys & B_BUTTON) return LIST_CANCEL;
  if (joy.repeated & DPAD_UP) { ListMenuChangeSelection(list, true, 1, false); return LIST_NOTHING_CHOSEN; }
  if (joy.repeated & DPAD_DOWN) { ListMenuChangeSelection(list, true, 1, true); return LIST_NOTHING_CHOSEN; }
  let left = false, right = false;
  if (list.template.scrollMultiple === LIST_MULTIPLE_SCROLL_DPAD) { left = !!(joy.repeated & DPAD_LEFT); right = !!(joy.repeated & DPAD_RIGHT); }
  else if (list.template.scrollMultiple === LIST_MULTIPLE_SCROLL_L_R) { left = !!(joy.repeated & L_BUTTON); right = !!(joy.repeated & R_BUTTON); }
  if (left) { ListMenuChangeSelection(list, true, list.template.maxShowed, false); return LIST_NOTHING_CHOSEN; }
  if (right) { ListMenuChangeSelection(list, true, list.template.maxShowed, true); return LIST_NOTHING_CHOSEN; }
  return LIST_NOTHING_CHOSEN;
}

/** list_menu.c ListMenuDummyTask is intentionally empty in the source. */
export function ListMenuDummyTask(_taskId: number): void {}

type MysteryGiftMenuState = { state: number; windowId: number; listTaskId: number; currentItemId: number };
const mysteryGiftMenu: MysteryGiftMenuState = { state: 0, windowId: -1, listTaskId: -1, currentItemId: LIST_NOTHING_CHOSEN };

/** DoMysteryGiftListMenu: C's three-step window/list lifecycle, called once per frame. */
export function DoMysteryGiftListMenu(windowTemplate: WindowTemplate, listMenuTemplate: ListMenuTemplate, mode: number, tileNum: number, palOffset: number): number {
  switch (mysteryGiftMenu.state) {
    case 0:
      mysteryGiftMenu.windowId = AddWindow(windowTemplate);
      if (mode === 2) LoadUserWindowGfx(mysteryGiftMenu.windowId, tileNum, palOffset);
      if (mode === 1 || mode === 2) DrawTextBorderOuter(mysteryGiftMenu.windowId, tileNum, palOffset / 16);
      mysteryGiftMenu.listTaskId = ListMenuInit({ ...listMenuTemplate, windowId: mysteryGiftMenu.windowId }, 0, 0);
      CopyWindowToVram(mysteryGiftMenu.windowId, COPYWIN_MAP);
      mysteryGiftMenu.currentItemId = LIST_NOTHING_CHOSEN;
      mysteryGiftMenu.state = 1;
      break;
    case 1:
      mysteryGiftMenu.currentItemId = ListMenu_ProcessInput(mysteryGiftMenu.listTaskId);
      if (JOY_NEW(A_BUTTON)) mysteryGiftMenu.state = 2;
      if (JOY_NEW(B_BUTTON)) {
        mysteryGiftMenu.currentItemId = LIST_CANCEL;
        mysteryGiftMenu.state = 2;
      }
      if (mysteryGiftMenu.state === 2) {
        if (mode === 0) ClearWindowTilemap(mysteryGiftMenu.windowId);
        else if (mode === 1 || mode === 2) ClearStdWindowAndFrame(mysteryGiftMenu.windowId, false);
        CopyWindowToVram(mysteryGiftMenu.windowId, COPYWIN_MAP);
      }
      break;
    case 2: {
      const result = mysteryGiftMenu.currentItemId;
      DestroyListMenuTask(mysteryGiftMenu.listTaskId);
      RemoveWindow(mysteryGiftMenu.windowId);
      mysteryGiftMenu.state = 0;
      return result;
    }
  }
  return LIST_NOTHING_CHOSEN;
}

export function DestroyListMenuTask(listTaskId: number): { cursorPos: number; itemsAbove: number } {
  const list = listMenuOf(listTaskId);
  if (list.taskId !== TAIL_SENTINEL) ListMenuRemoveCursorObject(list.taskId, list.template.cursorKind - 2);
  lists.delete(listTaskId);
  tasks.destroy(listTaskId);
  return { cursorPos: list.cursorPos, itemsAbove: list.itemsAbove };
}

export function RedrawListMenu(listTaskId: number): void {
  const list = listMenuOf(listTaskId);
  surf(list).fill(PIXEL_FILL(list.template.fillValue));
  ListMenuPrintEntries(list, list.cursorPos, 0, list.template.maxShowed);
  ListMenuDrawCursor(list);
  surf(list).copy();
}

export function ListMenuGetScrollAndRow(listTaskId: number): { cursorPos: number; itemsAbove: number } {
  const list = listMenuOf(listTaskId);
  return { cursorPos: list.cursorPos, itemsAbove: list.itemsAbove };
}

export function ListMenuGetYCoordForPrintingArrowCursor(listTaskId: number): number {
  const list = listMenuOf(listTaskId);
  const yMultiplier = GetFontAttribute(list.template.fontId, FONTATTR_MAX_LETTER_HEIGHT) + list.template.itemVerticalPadding;
  return list.itemsAbove * yMultiplier + list.template.upText_Y;
}

/** ChangeListMenuPals. */
export function ChangeListMenuPals(listTaskId: number, cursorPal: number, fillValue: number, cursorShadowPal: number): void {
  const template = listMenuOf(listTaskId).template;
  template.cursorPal = cursorPal;
  template.fillValue = fillValue;
  template.cursorShadowPal = cursorShadowPal;
}

/** ChangeListMenuCoords. */
export function ChangeListMenuCoords(listTaskId: number, x: number, y: number): void {
  const windowId = listMenuOf(listTaskId).template.windowId;
  SetWindowAttribute(windowId, WINDOW_TILEMAP_LEFT, x);
  SetWindowAttribute(windowId, WINDOW_TILEMAP_TOP, y);
}

/** ListMenuTestInput: process a single up/down input without drawing or callbacks. */
export function ListMenuTestInput(template: ListMenuTemplate, cursorPos: number, itemsAbove: number, keys: number): { result: number; cursorPos: number; itemsAbove: number } {
  const list: ListMenu = { template: { ...template }, cursorPos, itemsAbove, taskId: TAIL_SENTINEL };
  if (keys === DPAD_UP) ListMenuChangeSelection(list, false, 1, false);
  if (keys === DPAD_DOWN) ListMenuChangeSelection(list, false, 1, true);
  return { result: LIST_NOTHING_CHOSEN, cursorPos: list.cursorPos, itemsAbove: list.itemsAbove };
}

/** ListMenuGetCurrentItemArrayId. */
export function ListMenuGetCurrentItemArrayId(listTaskId: number): number {
  const list = listMenuOf(listTaskId);
  return list.cursorPos + list.itemsAbove;
}

/** ListMenuGetTemplateField (list_menu.h LISTFIELD_* order). */
export function ListMenuGetTemplateField(taskId: number, field: number): unknown {
  const t = listMenuOf(taskId).template;
  const fields: unknown[] = [t.moveCursorFunc, t.moveCursorFunc, t.totalItems, t.maxShowed, t.windowId, t.header_X, t.item_X,
    t.cursor_X, t.upText_Y, t.cursorPal, t.fillValue, t.cursorShadowPal, t.lettersSpacing, t.itemVerticalPadding, t.scrollMultiple, t.fontId, t.cursorKind];
  return fields[field] ?? 0;
}

/** ListMenu_LoadMonIconPalette. */
export function ListMenu_LoadMonIconPalette(palOffset: number, speciesId: number): void {
  LoadPalette(GetValidMonIconPalettePtr(speciesId), palOffset, 32);
}

function ListMenuInitInternal(template: ListMenuTemplate, cursorPos: number, itemsAbove: number): number {
  const taskId = tasks.create(() => {}, 0);
  const list: ListMenu = { template: { ...template }, cursorPos, itemsAbove, taskId: TAIL_SENTINEL };
  lists.set(taskId, list);
  Object.assign(override, { cursorPal: template.cursorPal, fillValue: template.fillValue, cursorShadowPal: template.cursorShadowPal,
    lettersSpacing: template.lettersSpacing, fontId: template.fontId, enabled: false });
  if (list.template.totalItems < list.template.maxShowed) list.template.maxShowed = list.template.totalItems;
  surf(list).fill(PIXEL_FILL(list.template.fillValue));
  ListMenuPrintEntries(list, list.cursorPos, 0, list.template.maxShowed);
  ListMenuDrawCursor(list);
  ListMenuCallSelectionChangedCallback(list, true);
  return taskId;
}

function ListMenuPrint(list: ListMenu, str: ArrayLike<number>, x: number, y: number): void {
  if (override.enabled) {
    surf(list).print(override.fontId, x, y, override.lettersSpacing, [override.fillValue, override.cursorPal, override.cursorShadowPal], str);
    override.enabled = false;
  } else {
    const t = list.template;
    surf(list).print(t.fontId, x, y, t.lettersSpacing, [t.fillValue, t.cursorPal, t.cursorShadowPal], str);
  }
}

function ListMenuPrintEntries(list: ListMenu, startIndex: number, yOffset: number, count: number): void {
  const t = list.template;
  const yMultiplier = GetFontAttribute(t.fontId, FONTATTR_MAX_LETTER_HEIGHT) + t.itemVerticalPadding;
  for (let i = 0; i < count; i++) {
    const item = t.items[startIndex];
    const x = item.index !== LIST_HEADER ? t.item_X : t.header_X;
    const y = (yOffset + i) * yMultiplier + t.upText_Y;
    t.itemPrintFunc?.(t.windowId, item.index, y);
    ListMenuPrint(list, item.label, x, y);
    startIndex++;
  }
}

function ListMenuDrawCursor(list: ListMenu): void {
  const t = list.template;
  const yMultiplier = GetFontAttribute(t.fontId, FONTATTR_MAX_LETTER_HEIGHT) + t.itemVerticalPadding;
  const x = t.cursor_X;
  const y = list.itemsAbove * yMultiplier + t.upText_Y;
  switch (t.cursorKind) {
    case 0: ListMenuPrint(list, rom.text("gText_SelectorArrow2"), x, y); break;
    case 1: break;
    case 2:
      if (list.taskId === TAIL_SENTINEL) list.taskId = ListMenuAddCursorObject(list, 0);
      ListMenuUpdateCursorObject(list.taskId, surf(list).left * 8 - 1, surf(list).top * 8 + y - 1, 0);
      break;
    case 3:
      if (list.taskId === TAIL_SENTINEL) list.taskId = ListMenuAddCursorObject(list, 1);
      ListMenuUpdateCursorObject(list.taskId, surf(list).left * 8 + x, surf(list).top * 8 + y, 1);
      break;
  }
}

function ListMenuAddCursorObject(list: ListMenu, cursorKind: number): number {
  return ListMenuAddCursorObjectInternal({
    left: 0, top: 160, rowWidth: surf(list).width * 8 + 2,
    rowHeight: GetFontAttribute(list.template.fontId, FONTATTR_MAX_LETTER_HEIGHT) + 2, tileTag: 0x4000, palTag: TAG_NONE, palNum: 15,
  }, cursorKind);
}

function ListMenuErasePrintedCursor(list: ListMenu, itemsAbove: number): void {
  const t = list.template;
  if (t.cursorKind !== 0) return;
  const yMultiplier = GetFontAttribute(t.fontId, FONTATTR_MAX_LETTER_HEIGHT) + t.itemVerticalPadding;
  surf(list).fillRect(PIXEL_FILL(t.fillValue), t.cursor_X, itemsAbove * yMultiplier + t.upText_Y,
    GetMenuCursorDimensionByFont(t.fontId, 0), GetMenuCursorDimensionByFont(t.fontId, 1));
}

function ListMenuUpdateSelectedRowIndexAndScrollOffset(list: ListMenu, movingDown: boolean): number {
  const t = list.template;
  let itemsAbove = list.itemsAbove;
  const cursorPos = list.cursorPos;
  let newRow: number, newScroll: number;
  if (!movingDown) {
    newRow = t.maxShowed === 1 ? 0 : t.maxShowed - (Math.floor(t.maxShowed / 2) + (t.maxShowed % 2)) - 1;
    if (cursorPos === 0) {
      while (itemsAbove !== 0) {
        itemsAbove--;
        if (t.items[cursorPos + itemsAbove].index !== LIST_HEADER) { list.itemsAbove = itemsAbove; return 1; }
      }
      return 0;
    }
    while (itemsAbove > newRow) {
      itemsAbove--;
      if (t.items[cursorPos + itemsAbove].index !== LIST_HEADER) { list.itemsAbove = itemsAbove; return 1; }
    }
    newScroll = cursorPos - 1;
  } else {
    newRow = t.maxShowed === 1 ? 0 : Math.floor(t.maxShowed / 2) + (t.maxShowed % 2);
    if (cursorPos === t.totalItems - t.maxShowed) {
      while (itemsAbove < t.maxShowed - 1) {
        itemsAbove++;
        if (t.items[cursorPos + itemsAbove].index !== LIST_HEADER) { list.itemsAbove = itemsAbove; return 1; }
      }
      return 0;
    }
    while (itemsAbove < newRow) {
      itemsAbove++;
      if (t.items[cursorPos + itemsAbove].index !== LIST_HEADER) { list.itemsAbove = itemsAbove; return 1; }
    }
    newScroll = cursorPos + 1;
  }
  list.itemsAbove = newRow;
  list.cursorPos = newScroll;
  return 2;
}

function ListMenuScroll(list: ListMenu, count: number, movingDown: boolean): void {
  const t = list.template;
  if (count >= t.maxShowed) {
    surf(list).fill(PIXEL_FILL(t.fillValue));
    ListMenuPrintEntries(list, list.cursorPos, 0, t.maxShowed);
    return;
  }
  const yMultiplier = GetFontAttribute(t.fontId, FONTATTR_MAX_LETTER_HEIGHT) + t.itemVerticalPadding;
  if (!movingDown) {
    surf(list).scroll(1, count * yMultiplier, PIXEL_FILL(t.fillValue));
    ListMenuPrintEntries(list, list.cursorPos, 0, count);
    const y = t.maxShowed * yMultiplier + t.upText_Y;
    surf(list).fillRect(PIXEL_FILL(t.fillValue), 0, y, surf(list).width * 8, surf(list).height * 8 - y);
  } else {
    surf(list).scroll(0, count * yMultiplier, PIXEL_FILL(t.fillValue));
    ListMenuPrintEntries(list, list.cursorPos + (t.maxShowed - count), t.maxShowed - count, count);
    surf(list).fillRect(PIXEL_FILL(t.fillValue), 0, 0, surf(list).width * 8, t.upText_Y);
  }
}

function ListMenuChangeSelection(list: ListMenu, update: boolean, count: number, movingDown: boolean): boolean {
  const oldSelectedRow = list.itemsAbove;
  let cursorCount = 0, selectionChange = 0;
  for (let i = 0; i < count; i++) {
    do {
      const ret = ListMenuUpdateSelectedRowIndexAndScrollOffset(list, movingDown);
      selectionChange |= ret;
      if (ret !== 2) break;
      cursorCount++;
    } while (list.template.items[list.cursorPos + list.itemsAbove].index === LIST_HEADER);
  }
  if (update) {
    switch (selectionChange) {
      case 0: return true;
      case 1:
        ListMenuErasePrintedCursor(list, oldSelectedRow);
        ListMenuDrawCursor(list);
        ListMenuCallSelectionChangedCallback(list, false);
        surf(list).copy();
        break;
      default:
        ListMenuErasePrintedCursor(list, oldSelectedRow);
        ListMenuScroll(list, cursorCount, movingDown);
        ListMenuDrawCursor(list);
        ListMenuCallSelectionChangedCallback(list, false);
        surf(list).copy();
        break;
    }
  }
  return false;
}

function ListMenuCallSelectionChangedCallback(list: ListMenu, onInit: boolean): void {
  list.template.moveCursorFunc?.(list.template.items[list.cursorPos + list.itemsAbove].index, onInit, list);
}

export function ListMenuOverrideSetColors(cursorPal: number, fillValue: number, cursorShadowPal: number): void {
  Object.assign(override, { cursorPal, fillValue, cursorShadowPal, enabled: true });
}

export function ListMenuDefaultCursorMoveFunc(_itemIndex: number, onInit: boolean): void {
  if (!onInit) sound.playSE(C.SE_SELECT);
}

export function ListMenuSetTemplateField(taskId: number, field: keyof ListMenuTemplate, value: never): void {
  (listMenuOf(taskId).template as Record<string, unknown>)[field] = value;
}

/** ListMenu_DrawMonIconGraphics */
export function ListMenu_DrawMonIconGraphics(windowId: number, iconPixels: Uint8Array, x: number, y: number): void {
  BlitBitmapToWindow(windowId, iconPixels, x, y, 32, 32);
}

/** ListMenuLoadStdPalAt */
export function ListMenuLoadStdPalAt(palOffset: number, palId: number): void {
  LoadPalette(incbin(palId === 1 ? "gMenuInfoElements2_Pal" : "gMenuInfoElements1_Pal"), palOffset, 32);
}

const sMenuInfoIcons: Array<[number, number, number]> = [
  [12, 12, 0x00], [32, 12, 0x20], [32, 12, 0x64], [32, 12, 0x60], [32, 12, 0x80], [32, 12, 0x48], [32, 12, 0x44], [32, 12, 0x6c], [32, 12, 0x68],
  [32, 12, 0x88], [32, 12, 0xa4], [32, 12, 0x24], [32, 12, 0x28], [32, 12, 0x2c], [32, 12, 0x40], [32, 12, 0x84], [32, 12, 0x4c], [32, 12, 0xa0],
  [32, 12, 0x8c], [40, 12, 0xa8], [40, 12, 0xc0], [40, 12, 0xc8], [40, 12, 0xe0], [40, 12, 0xe8],
];

/** BlitMenuInfoIcon: type/category icons from gMenuInfoElements_Gfx (iconId = type + 1 for types). */
export function BlitMenuInfoIcon(windowId: number, iconId: number, x: number, y: number): void {
  const [w, h, offset] = sMenuInfoIcons[iconId] ?? sMenuInfoIcons[0];
  BlitBitmapRectToWindow(windowId, incbin("gMenuInfoElements_Gfx").subarray(offset * 32), 0, 0, 128, 128, x, y, w, h);
}

// ---------------------------------------------------------------- menu_indicators.c

export type ScrollArrowsTemplate = {
  firstArrowType: number; firstX: number; firstY: number; secondArrowType: number; secondX: number; secondY: number;
  fullyUpThreshold: number; fullyDownThreshold: number; tileTag: number; palTag: number; palNum: number;
};
export type CursorStruct = { left: number; top: number; rowWidth: number; rowHeight: number; tileTag: number; palTag: number; palNum: number };

const sScrollIndicatorTemplates = [
  { animNum: 0, bounceDir: 0, multiplier: 2, frequency: 8 },
  { animNum: 1, bounceDir: 0, multiplier: 2, frequency: -8 },
  { animNum: 2, bounceDir: 1, multiplier: 2, frequency: 8 },
  { animNum: 3, bounceDir: 1, multiplier: 2, frequency: -8 },
];

function SpriteCallback_ScrollIndicatorArrow(sprite: Sprite): void {
  if (sprite.data[0] === 0) { StartSpriteAnim(sprite, sprite.data[1]); sprite.data[0]++; return; }
  const offset = Math.trunc((gSineTable[sprite.data[5] & 0xff] * sprite.data[3]) / 256);
  if (sprite.data[2] === 0) sprite.x2 = offset; else sprite.y2 = offset;
  sprite.data[5] = (sprite.data[5] + sprite.data[4]) << 16 >> 16;
}

const sSpriteTemplate_ScrollArrowIndicator: SpriteTemplate = {
  tileTag: 0, paletteTag: 0, oam: oamData({ shape: 0, size: 1 }),
  anims: [[ANIMCMD_FRAME(0, 30), ANIMCMD_END], [ANIMCMD_FRAME(0, 30, 1, 0), ANIMCMD_END], [ANIMCMD_FRAME(4, 30), ANIMCMD_END], [ANIMCMD_FRAME(4, 30, 0, 1), ANIMCMD_END]],
  images: null, affineAnims: gDummySpriteAffineAnimTable, callback: SpriteCallback_ScrollIndicatorArrow,
};

function AddScrollIndicatorArrowObject(arrowDir: number, x: number, y: number, tileTag: number, palTag: number): number {
  const id = CreateSprite({ ...sSpriteTemplate_ScrollArrowIndicator, tileTag, paletteTag: palTag }, x, y, 0);
  const s = gSprites[id];
  const t = sScrollIndicatorTemplates[arrowDir];
  s.invisible = true;
  s.data[0] = 0; s.data[1] = t.animNum; s.data[2] = t.bounceDir; s.data[3] = t.multiplier; s.data[4] = t.frequency; s.data[5] = 0;
  return id;
}

type ScrollPair = { scrollOffset: () => number; fullyUp: number; fullyDown: number; top: number; bottom: number; tileTag: number; palTag: number };
const scrollPairs = new Map<number, ScrollPair>();

/** AddScrollIndicatorArrowPair: `scrollOffset` reads the pointed-to u16 each frame. */
export function AddScrollIndicatorArrowPair(info: ScrollArrowsTemplate, scrollOffset: () => number): number {
  const gfx = incbin("sRedArrowOtherGfx");
  LoadSpriteSheet({ data: gfx, size: 0x100, tag: info.tileTag });
  if (info.palTag === TAG_NONE) LoadPalette(incbin("sRedArrowPal"), OBJ_PLTT_ID(info.palNum), 32);
  else LoadSpritePalette({ data: incbin("sRedArrowPal"), tag: info.palTag });
  const pair: ScrollPair = {
    scrollOffset, fullyUp: info.fullyUpThreshold, fullyDown: info.fullyDownThreshold, tileTag: info.tileTag, palTag: info.palTag,
    top: AddScrollIndicatorArrowObject(info.firstArrowType, info.firstX, info.firstY, info.tileTag, info.palTag),
    bottom: AddScrollIndicatorArrowObject(info.secondArrowType, info.secondX, info.secondY, info.tileTag, info.palTag),
  };
  if (info.palTag === TAG_NONE) { gSprites[pair.top].oam.paletteNum = info.palNum; gSprites[pair.bottom].oam.paletteNum = info.palNum; }
  const taskId = tasks.create(Task_ScrollIndicatorArrowPair, 0);
  scrollPairs.set(taskId, pair);
  return taskId;
}

/** Task_ScrollIndicatorArrowPair: hide an arrow once its end of the list is reached. */
export function Task_ScrollIndicatorArrowPair(taskId: number): void {
  const pair = scrollPairs.get(taskId);
  if (!pair) return;
  const cur = pair.scrollOffset();
  gSprites[pair.top].invisible = cur === pair.fullyUp;
  gSprites[pair.bottom].invisible = cur === pair.fullyDown;
}

/**
 * Runs one frame of a scroll-arrow pair alone (its task, sprite callbacks and
 * animation) for screens that must not advance other tasks or sprites.
 */
export function StepScrollIndicatorArrowPair(taskId: number): void {
  const pair = scrollPairs.get(taskId);
  if (!pair) return;
  Task_ScrollIndicatorArrowPair(taskId);
  for (const id of [pair.top, pair.bottom]) {
    const s = gSprites[id];
    s.callback(s);
    AnimateSprite(s);
  }
}

export function AddScrollIndicatorArrowPairParameterized(arrowType: number, commonPos: number, firstPos: number, secondPos: number, fullyDownThreshold: number, tileTag: number, palTag: number, scrollOffset: () => number): number {
  const vertical = arrowType === SCROLL_ARROW_UP || arrowType === SCROLL_ARROW_DOWN;
  return AddScrollIndicatorArrowPair({
    firstArrowType: vertical ? SCROLL_ARROW_UP : SCROLL_ARROW_LEFT, firstX: vertical ? commonPos : firstPos, firstY: vertical ? firstPos : commonPos,
    secondArrowType: vertical ? SCROLL_ARROW_DOWN : SCROLL_ARROW_RIGHT, secondX: vertical ? commonPos : secondPos, secondY: vertical ? secondPos : commonPos,
    fullyUpThreshold: 0, fullyDownThreshold, tileTag, palTag, palNum: 0,
  }, scrollOffset);
}

export function RemoveScrollIndicatorArrowPair(taskId: number): void {
  const pair = scrollPairs.get(taskId);
  if (!pair) return;
  if (pair.tileTag !== TAG_NONE) FreeSpriteTilesByTag(pair.tileTag);
  if (pair.palTag !== TAG_NONE) FreeSpritePaletteByTag(pair.palTag);
  DestroySprite(gSprites[pair.top]);
  DestroySprite(gSprites[pair.bottom]);
  scrollPairs.delete(taskId);
  tasks.destroy(taskId);
}

type CursorObject = { spriteId: number; tileTag: number; palTag: number };
const cursors = new Map<number, CursorObject>();

export function ListMenuAddCursorObjectInternal(cursor: CursorStruct, cursorKind: number): number {
  return cursorKind === 1 ? ListMenuAddRedArrowCursorObject(cursor) : ListMenuAddRedOutlineCursorObject(cursor);
}

export function ListMenuUpdateCursorObject(taskId: number, x: number, y: number, cursorKind: number): void {
  if (cursorKind === 0) ListMenuUpdateRedOutlineCursorObject(taskId, x, y);
  else if (cursorKind === 1) ListMenuUpdateRedArrowCursorObject(taskId, x, y);
}

/** Task_RedOutlineCursor is an intentionally empty task in menu_indicators.c. */
export function Task_RedOutlineCursor(_taskId: number): void {}

/** Task_RedArrowCursor is an intentionally empty task in menu_indicators.c. */
function Task_RedArrowCursor(_taskId: number): void {}

export function ListMenuRemoveCursorObject(taskId: number, cursorKind: number): void {
  if (cursorKind === 0) ListMenuRemoveRedOutlineCursorObject(taskId);
  else if (cursorKind === 1) ListMenuRemoveRedArrowCursorObject(taskId);
}

export function ListMenuGetRedOutlineCursorSpriteCount(rowWidth: number, rowHeight: number): number {
  return ListMenuSetUpRedOutlineCursorSpriteOamTable(rowWidth, rowHeight).length;
}

/** ListMenuUpdateRedOutlineCursorObject. */
export function ListMenuUpdateRedOutlineCursorObject(taskId: number, x: number, y: number): void {
  const c = cursors.get(taskId);
  if (!c) return;
  gSprites[c.spriteId].x = x + 120;
  gSprites[c.spriteId].y = y + 120;
}

/** ListMenuRemoveRedOutlineCursorObject. */
export function ListMenuRemoveRedOutlineCursorObject(taskId: number): void {
  removeCursorObject(taskId);
}

/** ListMenuUpdateRedArrowCursorObject. */
export function ListMenuUpdateRedArrowCursorObject(taskId: number, x: number, y: number): void {
  const c = cursors.get(taskId);
  if (!c) return;
  gSprites[c.spriteId].x = x;
  gSprites[c.spriteId].y = y;
}

/** ListMenuRemoveRedArrowCursorObject. */
export function ListMenuRemoveRedArrowCursorObject(taskId: number): void {
  removeCursorObject(taskId);
}

function removeCursorObject(taskId: number): void {
  const c = cursors.get(taskId);
  if (!c) return;
  if (c.tileTag !== TAG_NONE) FreeSpriteTilesByTag(c.tileTag);
  if (c.palTag !== TAG_NONE) FreeSpritePaletteByTag(c.palTag);
  DestroySprite(gSprites[c.spriteId]);
  cursors.delete(taskId);
  tasks.destroy(taskId);
}

function loadCursorGfx(cursor: CursorStruct, gfx: string, size: number): void {
  LoadSpriteSheet({ data: incbin(gfx), size, tag: cursor.tileTag });
  if (cursor.palTag === TAG_NONE) LoadPalette(incbin("sRedArrowPal"), OBJ_PLTT_ID(cursor.palNum), 32);
  else LoadSpritePalette({ data: incbin("sRedArrowPal"), tag: cursor.palTag });
}

/** ListMenuSetUpRedOutlineCursorSpriteOamTable */
export function ListMenuSetUpRedOutlineCursorSpriteOamTable(rowWidth: number, rowHeight: number): Subsprite[] {
  const sub = (tile: number, x: number, y: number): Subsprite => ({ x: (x << 24) >> 24, y: (y << 24) >> 24, shape: 0, size: 0, tileOffset: tile, priority: 0 });
  const out = [sub(0, 136, 136), sub(1, rowWidth + 128, 136), sub(6, 136, rowHeight + 128), sub(7, rowWidth + 128, rowHeight + 128)];
  if (rowWidth > 16) for (let i = 8; i < rowWidth - 8; i += 8) { out.push(sub(2, i - 120, 136)); out.push(sub(5, i - 120, rowHeight + 128)); }
  if (rowHeight > 16) for (let j = 8; j < rowHeight - 8; j += 8) { out.push(sub(3, 136, j - 120)); out.push(sub(4, rowWidth + 128, j - 120)); }
  return out;
}

export function ListMenuAddRedOutlineCursorObject(cursor: CursorStruct): number {
  loadCursorGfx(cursor, "sSelectorOutlineGfx", 0x100);
  const taskId = tasks.create(Task_RedOutlineCursor, 0);
  const spriteId = CreateSprite({ ...gDummySpriteTemplate, tileTag: cursor.tileTag, paletteTag: cursor.palTag }, cursor.left + 120, cursor.top + 120, 0);
  const s = gSprites[spriteId];
  const subsprites = ListMenuSetUpRedOutlineCursorSpriteOamTable(cursor.rowWidth, cursor.rowHeight);
  SetSubspriteTables(s, [{ subspriteCount: subsprites.length, subsprites }]);
  s.oam.priority = 0;
  s.subpriority = 0;
  s.subspriteTableNum = 0;
  if (cursor.palTag === TAG_NONE) s.oam.paletteNum = cursor.palNum;
  cursors.set(taskId, { spriteId, tileTag: cursor.tileTag, palTag: cursor.palTag });
  return taskId;
}

function SpriteCallback_RedArrowCursor(sp: Sprite): void {
  sp.x2 = Math.trunc(gSineTable[sp.data[0] & 0xff] / 64);
  sp.data[0] = (sp.data[0] + 8) & 0xffff;
}

function ListMenuAddRedArrowCursorObject(cursor: CursorStruct): number {
  loadCursorGfx(cursor, "sRedArrowGfx", 0x80);
  const taskId = tasks.create(Task_RedArrowCursor, 0);
  const spriteId = CreateSprite({
    tileTag: cursor.tileTag, paletteTag: cursor.palTag, oam: oamData({ shape: 0, size: 1 }), anims: [[ANIMCMD_FRAME(0, 30), ANIMCMD_END]],
    images: null, affineAnims: gDummySpriteAffineAnimTable,
    callback: SpriteCallback_RedArrowCursor,
  }, cursor.left, cursor.top, 0);
  gSprites[spriteId].x2 = 8;
  gSprites[spriteId].y2 = 8;
  if (cursor.palTag === TAG_NONE) gSprites[spriteId].oam.paletteNum = cursor.palNum;
  cursors.set(taskId, { spriteId, tileTag: cursor.tileTag, palTag: cursor.palTag });
  return taskId;
}

/** Common ListMenuTemplate defaults for templates built in code. */
export function listMenuTemplate(partial: Partial<ListMenuTemplate> & Pick<ListMenuTemplate, "items" | "windowId">): ListMenuTemplate {
  return {
    moveCursorFunc: null, itemPrintFunc: null, totalItems: partial.items.length, maxShowed: partial.items.length, header_X: 0, item_X: 8, cursor_X: 0,
    upText_Y: 1, cursorPal: 2, fillValue: 1, cursorShadowPal: 3, lettersSpacing: 0, itemVerticalPadding: 0, scrollMultiple: LIST_NO_MULTIPLE_SCROLL,
    fontId: 2, cursorKind: 0, ...partial,
  };
}
