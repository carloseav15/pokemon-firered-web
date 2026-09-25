// pokedex_screen.c: the FireRed Pokédex. Top menu (list modes, habitat
// categories, search orders), numerical/characteristic lists, habitat pages
// with the page-turn effect, the entry page with zoom frame, the area page
// (area_markers + size comparison), and the post-capture registration page.
// Adaptations: sPokedexScreenData is a plain object; Alloc'd tilemaps and
// list items are typed arrays; pointer out-params become returned values.
// The help system (SetHelpContext) is out of scope. PlayCry_NormalNoDucking
// plays the cry at its normal volume. ListMenuGetScrollAndRow on the
// destroyed mode-select list (states 5/6 of the ordered lists) reads the
// list now occupying that task slot, as the C does with the stale task data.

import { sound } from "./audio/sound";
import { FONT_NORMAL, FONT_NORMAL_COPY_1, FONT_SMALL, stringWidth } from "./gba/font";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, joy, L_BUTTON, R_BUTTON, START_BUTTON } from "./gba/input";
import { intToDecimal, STR_CONV_MODE_RIGHT_ALIGN } from "./gba/charmap";
import { tasks } from "./gba/tasks";
import * as C from "./generated/constants";
import { cdata, incbin, incbin16, loadCData, preloadPacks, symName, type SymRef } from "./hw/assets";
import {
  BG_SCREEN_SIZE, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, CopyToBgTilemapBufferRect_ChangePalette, FillBgTilemapBufferRect,
  FillBgTilemapBufferRect_Palette0, GetBgTilemapBuffer, HideBg, IsDma3ManagerBusyWithBgCopy, InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags,
  SetBgTilemapBuffer, ShowBg, type BgTemplate,
} from "./hw/bg";
import { ClearGpuRegBits, SetGpuReg, SetGpuRegBits } from "./hw/gpu";
import {
  AddScrollIndicatorArrowPair, BlitMenuInfoIcon, DestroyListMenuTask, ListMenu_DrawMonIconGraphics, ListMenu_ProcessInput, ListMenuAddCursorObjectInternal,
  ListMenuDefaultCursorMoveFunc, ListMenuGetScrollAndRow, ListMenuInit, ListMenuInitInRect, ListMenuLoadStdPalAt, listMenuOf, ListMenuOverrideSetColors,
  ListMenuRemoveCursorObject, ListMenuUpdateCursorObject, RemoveScrollIndicatorArrowPair, type CursorStruct, type ListMenu, type ListMenuItem,
  type ListMenuTemplate, type ListMenuWindowRect, type ScrollArrowsTemplate,
} from "./hw/listMenu";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BG_PLTT_OFFSET, gPaletteFade, LoadPalette, OBJ_PLTT_ID, PALETTES_ALL, PLTT_ID, PLTT_SIZE_4BPP, PLTT_SIZEOF,
  ResetPaletteFade, RGB_BLACK, RGB_WHITEALPHA, TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import { DISPCNT_WIN0_ON, DISPCNT_WIN1_ON, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT } from "./hw/ppu";
import { gMain, SetMainCallback2, SetVBlankCallback, type MainCallback } from "./hw/runtime";
import { ScanlineEffect_Stop } from "./hw/scanline";
import { AnimateSprites, BuildOamBuffer, gSprites, LoadOam, ProcessSpriteCopyRequests, ResetSpriteData, SetOamMatrix, ST_OAM_AFFINE_NORMAL } from "./hw/sprite";
import { AddTextPrinter, AddTextPrinterParameterized4, DeactivateAllTextPrinters, RunTextPrinters } from "./hw/text";
import {
  AddWindow, BlitBitmapRectToWindow, COPYWIN_GFX, CopyToWindowPixelBuffer, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers,
  GetWindowAttribute, InitWindows, PIXEL_FILL, PutWindowTilemap, RemoveWindow, SetWindowAttribute, WINDOW_TILEMAP_TOP, type WindowTemplate,
} from "./hw/window";
import {
  CreatePokedexAreaMarkers, DestroyPokedexAreaMarkers, GetNumPokedexAreaMarkers, GetUnlockedSeviiAreas, loadPokedexAreaData,
} from "./pokedexArea";
import { GetSetPokedexFlag } from "./pokemon/mon_extra";
import { NationalPokedexNumToSpecies, SpeciesToNationalPokedexNum } from "./pokemon/mon";
import { speciesName } from "./pokemon/pokemon";
import { GetMonIconPtr, GetValidMonIconPalettePtr } from "./pokemonIcon";
import { rom } from "./rom";
import { flagGet, save, varGet } from "./save";
import {
  CreateMonPicSprite_HandleDeoxys, CreateTrainerPicSprite, FreeAndDestroyMonPicSprite, FreeAndDestroyTrainerPicSprite, LoadMonPicInWindow,
  PlayerGenderToFrontTrainerPicId, ResetAllPicSprites,
} from "./trainerPokemonSprites";

const TAG_AREA_MARKERS = 2001;

const TEXT_LEFT = 0;
const TEXT_CENTER = 1;
const TEXT_RIGHT = 2;

const EOS = 0xff;
const CHAR_SPACE = 0x00;
const TEXT_SKIP_DRAW = 0xff;
const BG_TILE_H_FLIP = (n: number) => 0x400 | n;
const BG_TILE_V_FLIP = (n: number) => 0x800 | n;
const BG_TILE_H_V_FLIP = (n: number) => 0xc00 | n;
const DEX_MODE = (order: number) => C.DEX_CATEGORY_COUNT + order;

type PokedexScreenData = {
  taskId: number;
  state: number;
  data: [number, number];
  areaMarkersTaskId: number;
  unlockedCategories: number;
  modeSelectInput: number;
  modeSelectItemsAbove: number;
  modeSelectCursorPos: number;
  modeSelectWindowId: number;
  selectionIconWindowId: number;
  dexCountsWindowId: number;
  modeSelectListMenuId: number;
  pageSpecies: number[];
  categoryMonWindowIds: number[];
  categoryMonInfoWindowIds: number[];
  category: number;
  firstPageInCategory: number;
  lastPageInCategory: number;
  pageNum: number;
  numMonsOnPage: number;
  categoryCursorPosInPage: number;
  categoryPageSelectionCursorTimer: number;
  parentOfCategoryMenu: number;
  characteristicMenuInput: number;
  kantoOrderMenuItemsAbove: number;
  kantoOrderMenuCursorPos: number;
  characteristicOrderMenuItemsAbove: number;
  characteristicOrderMenuCursorPos: number;
  nationalOrderMenuItemsAbove: number;
  nationalOrderMenuCursorPos: number;
  numericalOrderWindowId: number;
  orderedListMenuTaskId: number;
  dexOrderId: number;
  listItems: ListMenuItem[];
  orderedDexCount: number;
  windowIds: number[];
  dexSpecies: number;
  bgBufsMem: Uint16Array | null;
  scrollArrowsTaskId: number;
  categoryPageCursorTaskId: number;
  modeSelectCursorPosBak: number;
  unlockedSeviiAreas: number;
  numSeenKanto: number;
  numOwnedKanto: number;
  numSeenNational: number;
  numOwnedNational: number;
};

type PokedexEntry = {
  categoryName: number[]; height: number; weight: number; description: SymRef; unusedDescription: SymRef;
  pokemonScale: number; pokemonOffset: number; trainerScale: number; trainerOffset: number;
};
type PokedexCategoryPage = { species: number[]; count: number };
type PokedexCategory = { page: PokedexCategoryPage[]; count: number };
type CListMenuItem = { label: SymRef; index: number };
type CListMenuTemplate = Omit<ListMenuTemplate, "items" | "moveCursorFunc" | "itemPrintFunc"> & { items: SymRef };

let sPokedexScreenData: PokedexScreenData = null!;
/** CB2_ReturnToFieldWithOpenMenu for the start-menu entry. */
let sReturnToField: MainCallback = null;

// ---------------------------------------------------------------- data

const rd = <T>(name: string) => cdata<T>("pokedex_screen", name);
const txt = (name: string) => rom.text(name);
const symText = (ref: unknown) => rom.text(symName(ref)!);

const sBgTemplates = () => rd<BgTemplate[]>("sBgTemplates");
const sWindowTemplates = () => rd<WindowTemplate[]>("sWindowTemplates");
const win = (name: string) => ({ ...rd<WindowTemplate>(name) });
const sCategoryPageIconCoords = (numSlots: number) => rd<number[][]>(symName(rd<SymRef[]>("sCategoryPageIconCoords")[numSlots])!);
const sDexScreen_CategoryCursorPals = () => rd<number[]>("sDexScreen_CategoryCursorPals");
const sKantoDexPalette = () => incbin16("sKantoDexPalette");
const sNationalDexPalette = () => incbin16("sNationalDexPalette");

let gPokedexEntriesCache: PokedexEntry[] | null = null;
function gPokedexEntries(): PokedexEntry[] {
  return (gPokedexEntriesCache ??= rd<PokedexEntry[]>("gPokedexEntries"));
}

let gDexCategoriesCache: PokedexCategory[] | null = null;
/** gDexCategories: {page table, NELEMS} pairs whose counts are exported as sizeof expressions. */
function gDexCategories(): PokedexCategory[] {
  return (gDexCategoriesCache ??= rd<Array<[SymRef, unknown]>>("gDexCategories").map(([pages]) => {
    const page = rd<Array<{ species: SymRef }>>(symName(pages)!).map((p) => {
      const species = rd<number[]>(symName(p.species)!);
      return { species, count: species.length };
    });
    return { page, count: page.length };
  }));
}

function listItemsFrom(name: string): ListMenuItem[] {
  return rd<CListMenuItem[]>(name).map((it) => ({ label: symText(it.label), index: it.index }));
}

function listTemplateFrom(name: string, items: ListMenuItem[], moveCursorFunc: ListMenuTemplate["moveCursorFunc"], itemPrintFunc: ListMenuTemplate["itemPrintFunc"]): ListMenuTemplate {
  const t = rd<CListMenuTemplate>(name);
  return { ...t, items, moveCursorFunc, itemPrintFunc };
}

/** Preloads every graphics pack and cdata file the Pokédex reads. */
export async function preloadPokedexScreen(): Promise<void> {
  await Promise.all([
    loadCData("pokedex_screen", "data", "pokemon", "pokemon_icon"),
    loadPokedexAreaData(),
    preloadPacks(["graphics_pokedex", "graphics_interface", "graphics_trainers", "pokemon"]),
  ]);
}

export function IsNationalPokedexEnabled(): boolean {
  return varGet(C.VAR_NATIONAL_DEX) === 0x6258 && flagGet(C.FLAG_SYS_NATIONAL_DEX);
}

// ---------------------------------------------------------------- main callbacks

function VBlankCB(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function CB2_PokedexScreen(): void {
  if (!gPaletteFade.active || IsDma3ManagerBusyWithBgCopy()) {
    tasks.run();
    RunTextPrinters();
    AnimateSprites();
    BuildOamBuffer();
  } else {
    UpdatePaletteFade();
  }
}

function DexScreen_LoadResources(): void {
  const natDex = IsNationalPokedexEnabled();
  SetVBlankCallback(null);
  ResetPaletteFade();
  ResetSpriteData();
  tasks.reset();
  ScanlineEffect_Stop();
  ResetBgsAndClearDma3BusyFlags(true);
  InitBgsFromTemplates(0, sBgTemplates());
  SetBgTilemapBuffer(3, new Uint16Array(BG_SCREEN_SIZE / 2));
  SetBgTilemapBuffer(2, new Uint16Array(BG_SCREEN_SIZE / 2));
  SetBgTilemapBuffer(1, new Uint16Array(BG_SCREEN_SIZE / 2));
  SetBgTilemapBuffer(0, new Uint16Array(BG_SCREEN_SIZE / 2));
  if (natDex) LoadBgTiles(3, incbin("sNatDexTiles"), BG_SCREEN_SIZE, 0);
  else LoadBgTiles(3, incbin("sKantoDexTiles"), BG_SCREEN_SIZE, 0);
  InitWindows(sWindowTemplates());
  DeactivateAllTextPrinters();
  SetVBlankCallback(VBlankCB);
  const taskId = tasks.create(Task_PokedexScreen, 0);
  sPokedexScreenData = initialState();
  sPokedexScreenData.taskId = taskId;
  sPokedexScreenData.listItems = Array.from({ length: C.NATIONAL_DEX_COUNT }, () => ({ label: [EOS], index: 0 }));
  sPokedexScreenData.numSeenNational = DexScreen_GetDexCount(C.FLAG_GET_SEEN, 1);
  sPokedexScreenData.numOwnedNational = DexScreen_GetDexCount(C.FLAG_GET_CAUGHT, 1);
  sPokedexScreenData.numSeenKanto = DexScreen_GetDexCount(C.FLAG_GET_SEEN, 0);
  sPokedexScreenData.numOwnedKanto = DexScreen_GetDexCount(C.FLAG_GET_CAUGHT, 0);
  sound.setBgmVolume(0x80);
  ChangeBgX(0, 0, 0);
  ChangeBgY(0, 0, 0);
  ChangeBgX(1, 0, 0);
  ChangeBgY(1, 0, 0);
  ChangeBgX(2, 0, 0);
  ChangeBgY(2, 0, 0);
  ChangeBgX(3, 0, 0);
  ChangeBgY(3, 0, 0);
  gPaletteFade.bufferTransferDisabled = true;
  if (natDex) LoadPalette(sNationalDexPalette(), BG_PLTT_ID(0), 0x200);
  else LoadPalette(sKantoDexPalette(), BG_PLTT_ID(0), 0x200);
  FillBgTilemapBufferRect(3, 0x001, 0, 0, 32, 32, 0);
  FillBgTilemapBufferRect(2, 0x000, 0, 0, 32, 32, 17);
  FillBgTilemapBufferRect(1, 0x000, 0, 0, 32, 32, 17);
  FillBgTilemapBufferRect(0, 0x003, 0, 0, 32, 2, 15);
  FillBgTilemapBufferRect(0, 0x000, 0, 2, 32, 16, 17);
  FillBgTilemapBufferRect(0, 0x003, 0, 18, 32, 2, 15);
}

/** sDexScreenDataInitialState: u8 window ids of -1 are 0xFF; the u16 species slots are 0xFFFF. */
function initialState(): PokedexScreenData {
  return {
    taskId: 0, state: 0, data: [0, 0], areaMarkersTaskId: 0, unlockedCategories: 0, modeSelectInput: 0,
    modeSelectItemsAbove: 1, modeSelectCursorPos: 0,
    modeSelectWindowId: 0xff, selectionIconWindowId: 0xff, dexCountsWindowId: 0xff, modeSelectListMenuId: 0,
    pageSpecies: [0xffff, 0xffff, 0xffff, 0xffff],
    categoryMonWindowIds: [0xff, 0xff, 0xff, 0xff],
    categoryMonInfoWindowIds: [0xff, 0xff, 0xff, 0xff],
    category: 0, firstPageInCategory: 0, lastPageInCategory: 0, pageNum: 0, numMonsOnPage: 0, categoryCursorPosInPage: 0,
    categoryPageSelectionCursorTimer: 0, parentOfCategoryMenu: 0, characteristicMenuInput: 0,
    kantoOrderMenuItemsAbove: 0, kantoOrderMenuCursorPos: 0, characteristicOrderMenuItemsAbove: 0, characteristicOrderMenuCursorPos: 0,
    nationalOrderMenuItemsAbove: 0, nationalOrderMenuCursorPos: 0,
    numericalOrderWindowId: 0xff, orderedListMenuTaskId: 0, dexOrderId: 0, listItems: [], orderedDexCount: 0,
    windowIds: new Array(16).fill(0xff), dexSpecies: 0, bgBufsMem: null,
    scrollArrowsTaskId: 0xff, categoryPageCursorTaskId: 0xff, modeSelectCursorPosBak: 0, unlockedSeviiAreas: 0,
    numSeenKanto: 0, numOwnedKanto: 0, numSeenNational: 0, numOwnedNational: 0,
  };
}

function CB2_OpenPokedexFromStartMenu(): void {
  DexScreen_LoadResources();
  ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON | DISPCNT_WIN1_ON);
  SetGpuReg(REG_OFFSET_BLDCNT, 0);
  SetGpuReg(REG_OFFSET_BLDALPHA, 0);
  SetGpuReg(REG_OFFSET_BLDY, 0);
  SetMainCallback2(CB2_PokedexScreen);
}

/** Start menu → Pokédex; `returnToField` is CB2_ReturnToFieldWithOpenMenu. */
export function openPokedexScreen(returnToField: () => void): void {
  void preloadPokedexScreen().then(() => {
    sReturnToField = returnToField;
    CB2_OpenPokedexFromStartMenu();
  });
}

function DoClosePokedex(): boolean {
  switch (gMain.state) {
    case 0:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      gMain.state++;
      return false;
    case 1:
      if (!gPaletteFade.active) gMain.state = 2;
      else UpdatePaletteFade();
      return false;
    case 2:
      sPokedexScreenData.listItems = [];
      FreeAllWindowBuffers();
      sound.setBgmVolume(0x100);
      break;
  }
  return true;
}

function CB2_ClosePokedex(): void {
  if (DoClosePokedex()) {
    SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON | DISPCNT_WIN1_ON);
    const cb = sReturnToField;
    sReturnToField = null;
    SetMainCallback2(null);
    cb?.();
  }
}

// ---------------------------------------------------------------- top menu

function Task_PokedexScreen(taskId: number): void {
  const d = sPokedexScreenData;
  switch (d.state) {
    case 0:
      d.unlockedCategories = 0;
      for (let i = 0; i < 9; i++) d.unlockedCategories |= (DexScreen_IsCategoryUnlocked(i) ? 1 : 0) << i;
      d.state = 2;
      break;
    case 1:
      RemoveScrollIndicatorArrowPair(d.scrollArrowsTaskId);
      d.modeSelectWindowId = DexScreen_RemoveWindow(d.modeSelectWindowId);
      d.selectionIconWindowId = DexScreen_RemoveWindow(d.selectionIconWindowId);
      d.dexCountsWindowId = DexScreen_RemoveWindow(d.dexCountsWindowId);
      SetMainCallback2(CB2_ClosePokedex);
      tasks.destroy(taskId);
      break;
    case 2:
      DexScreen_InitGfxForTopMenu();
      d.state = 3;
      break;
    case 3:
      CopyBgTilemapBufferToVram(3);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(0);
      d.state = 4;
      break;
    case 4:
      ShowBg(3);
      ShowBg(2);
      ShowBg(1);
      ShowBg(0);
      if (gPaletteFade.bufferTransferDisabled) {
        gPaletteFade.bufferTransferDisabled = false;
        BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 0, RGB_WHITEALPHA);
      } else {
        BeginNormalPaletteFade(~0x8000 >>> 0, 0, 16, 0, RGB_WHITEALPHA);
      }
      d.state = 5;
      break;
    case 5:
      d.modeSelectCursorPosBak = ListMenuGetScrollAndRow(d.modeSelectListMenuId).cursorPos;
      if (IsNationalPokedexEnabled())
        d.scrollArrowsTaskId = AddScrollIndicatorArrowPair(rd<ScrollArrowsTemplate>("sScrollArrowsTemplate_NatDex"), () => sPokedexScreenData.modeSelectCursorPosBak);
      else
        d.scrollArrowsTaskId = AddScrollIndicatorArrowPair(rd<ScrollArrowsTemplate>("sScrollArrowsTemplate_KantoDex"), () => sPokedexScreenData.modeSelectCursorPosBak);
      d.state = 6;
      break;
    case 6:
      d.modeSelectInput = ListMenu_ProcessInput(d.modeSelectListMenuId);
      d.modeSelectCursorPosBak = ListMenuGetScrollAndRow(d.modeSelectListMenuId).cursorPos;
      if (joy.newKeys & A_BUTTON) {
        switch (d.modeSelectInput) {
          case -2: // LIST_CANCEL
            d.state = 1;
            break;
          case C.DEX_CATEGORY_GRASSLAND:
          case C.DEX_CATEGORY_FOREST:
          case C.DEX_CATEGORY_WATERS_EDGE:
          case C.DEX_CATEGORY_SEA:
          case C.DEX_CATEGORY_CAVE:
          case C.DEX_CATEGORY_MOUNTAIN:
          case C.DEX_CATEGORY_ROUGH_TERRAIN:
          case C.DEX_CATEGORY_URBAN:
          case C.DEX_CATEGORY_RARE:
            if (DexScreen_IsCategoryUnlocked(d.modeSelectInput)) {
              RemoveScrollIndicatorArrowPair(d.scrollArrowsTaskId);
              d.category = d.modeSelectInput;
              BeginNormalPaletteFade(~0x8000 >>> 0, 0, 0, 16, RGB_WHITEALPHA);
              d.state = 7;
            }
            break;
          case DEX_MODE(C.DEX_ORDER_NUMERICAL_KANTO):
          case DEX_MODE(C.DEX_ORDER_NUMERICAL_NATIONAL):
            RemoveScrollIndicatorArrowPair(d.scrollArrowsTaskId);
            d.dexOrderId = d.modeSelectInput - C.DEX_CATEGORY_COUNT;
            BeginNormalPaletteFade(~0x8000 >>> 0, 0, 0, 16, RGB_WHITEALPHA);
            d.state = 9;
            break;
          case DEX_MODE(C.DEX_ORDER_ATOZ):
          case DEX_MODE(C.DEX_ORDER_TYPE):
          case DEX_MODE(C.DEX_ORDER_LIGHTEST):
          case DEX_MODE(C.DEX_ORDER_SMALLEST):
            RemoveScrollIndicatorArrowPair(d.scrollArrowsTaskId);
            d.dexOrderId = d.modeSelectInput - C.DEX_CATEGORY_COUNT;
            d.characteristicOrderMenuItemsAbove = d.characteristicOrderMenuCursorPos = 0;
            BeginNormalPaletteFade(~0x8000 >>> 0, 0, 0, 16, RGB_WHITEALPHA);
            d.state = 8;
            break;
        }
        break;
      }
      if (joy.newKeys & B_BUTTON) d.state = 1;
      break;
    case 7: {
      const r = DestroyListMenuTask(d.modeSelectListMenuId);
      d.modeSelectCursorPos = r.cursorPos;
      d.modeSelectItemsAbove = r.itemsAbove;
      FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 32, 20);
      CopyBgTilemapBufferToVram(1);
      d.modeSelectWindowId = DexScreen_RemoveWindow(d.modeSelectWindowId);
      d.selectionIconWindowId = DexScreen_RemoveWindow(d.selectionIconWindowId);
      d.dexCountsWindowId = DexScreen_RemoveWindow(d.dexCountsWindowId);
      d.pageNum = 0;
      d.categoryCursorPosInPage = 0;
      d.parentOfCategoryMenu = 0;
      tasks.tasks[taskId].func = Task_DexScreen_CategorySubmenu;
      d.state = 0;
      break;
    }
    case 8: {
      const r = DestroyListMenuTask(d.modeSelectListMenuId);
      d.modeSelectCursorPos = r.cursorPos;
      d.modeSelectItemsAbove = r.itemsAbove;
      HideBg(1);
      d.modeSelectWindowId = DexScreen_RemoveWindow(d.modeSelectWindowId);
      d.selectionIconWindowId = DexScreen_RemoveWindow(d.selectionIconWindowId);
      d.dexCountsWindowId = DexScreen_RemoveWindow(d.dexCountsWindowId);
      tasks.tasks[taskId].func = Task_DexScreen_CharacteristicOrder;
      d.state = 0;
      break;
    }
    case 9: {
      const r = DestroyListMenuTask(d.modeSelectListMenuId);
      d.modeSelectCursorPos = r.cursorPos;
      d.modeSelectItemsAbove = r.itemsAbove;
      HideBg(1);
      d.modeSelectWindowId = DexScreen_RemoveWindow(d.modeSelectWindowId);
      d.selectionIconWindowId = DexScreen_RemoveWindow(d.selectionIconWindowId);
      d.dexCountsWindowId = DexScreen_RemoveWindow(d.dexCountsWindowId);
      tasks.tasks[taskId].func = Task_DexScreen_NumericalOrder;
      d.state = 0;
      break;
    }
  }
}

function DexScreen_InitGfxForTopMenu(): void {
  const d = sPokedexScreenData;
  FillBgTilemapBufferRect(3, 0x00e, 0, 0, 30, 20, 0);
  FillBgTilemapBufferRect(2, 0x000, 0, 0, 30, 20, 17);
  FillBgTilemapBufferRect(1, 0x000, 0, 0, 30, 20, 17);
  d.modeSelectWindowId = AddWindow(win("sWindowTemplate_ModeSelect"));
  d.selectionIconWindowId = AddWindow(win("sWindowTemplate_SelectionIcon"));
  d.dexCountsWindowId = AddWindow(win("sWindowTemplate_DexCounts"));
  if (IsNationalPokedexEnabled()) {
    const listMenuTemplate = listTemplateFrom("sListMenuTemplate_NatDexModeSelect", listItemsFrom("sListMenuItems_NatDexModeSelect"), MoveCursorFunc_DexModeSelect, ItemPrintFunc_DexModeSelect);
    listMenuTemplate.windowId = d.modeSelectWindowId;
    d.modeSelectListMenuId = ListMenuInit(listMenuTemplate, d.modeSelectCursorPos, d.modeSelectItemsAbove);
    FillWindowPixelBuffer(d.dexCountsWindowId, PIXEL_FILL(0));
    DexScreen_AddTextPrinterParameterized(d.dexCountsWindowId, FONT_SMALL, txt("gText_Seen"), 0, 2, 0);
    DexScreen_AddTextPrinterParameterized(d.dexCountsWindowId, FONT_SMALL, txt("gText_Kanto"), 8, 13, 0);
    DexScreen_PrintNum3RightAlign(d.dexCountsWindowId, 0, d.numSeenKanto, 52, 13, 2);
    DexScreen_AddTextPrinterParameterized(d.dexCountsWindowId, FONT_SMALL, txt("gText_National"), 8, 24, 0);
    DexScreen_PrintNum3RightAlign(d.dexCountsWindowId, 0, d.numSeenNational, 52, 24, 2);
    DexScreen_AddTextPrinterParameterized(d.dexCountsWindowId, FONT_SMALL, txt("gText_Owned"), 0, 37, 0);
    DexScreen_AddTextPrinterParameterized(d.dexCountsWindowId, FONT_SMALL, txt("gText_Kanto"), 8, 48, 0);
    DexScreen_PrintNum3RightAlign(d.dexCountsWindowId, 0, d.numOwnedKanto, 52, 48, 2);
    DexScreen_AddTextPrinterParameterized(d.dexCountsWindowId, FONT_SMALL, txt("gText_National"), 8, 59, 0);
    DexScreen_PrintNum3RightAlign(d.dexCountsWindowId, 0, d.numOwnedNational, 52, 59, 2);
  } else {
    const listMenuTemplate = listTemplateFrom("sListMenuTemplate_KantoDexModeSelect", listItemsFrom("sListMenuItems_KantoDexModeSelect"), MoveCursorFunc_DexModeSelect, ItemPrintFunc_DexModeSelect);
    listMenuTemplate.windowId = d.modeSelectWindowId;
    d.modeSelectListMenuId = ListMenuInit(listMenuTemplate, d.modeSelectCursorPos, d.modeSelectItemsAbove);
    FillWindowPixelBuffer(d.dexCountsWindowId, PIXEL_FILL(0));
    DexScreen_AddTextPrinterParameterized(d.dexCountsWindowId, FONT_NORMAL_COPY_1, txt("gText_Seen"), 0, 9, 0);
    DexScreen_PrintNum3RightAlign(d.dexCountsWindowId, 1, d.numSeenKanto, 32, 21, 2);
    DexScreen_AddTextPrinterParameterized(d.dexCountsWindowId, FONT_NORMAL_COPY_1, txt("gText_Owned"), 0, 37, 0);
    DexScreen_PrintNum3RightAlign(d.dexCountsWindowId, 1, d.numOwnedKanto, 32, 49, 2);
  }
  FillWindowPixelBuffer(0, PIXEL_FILL(15));
  DexScreen_PrintStringWithAlignment(txt("gText_PokedexTableOfContents"), TEXT_CENTER);
  FillWindowPixelBuffer(1, PIXEL_FILL(15));
  DexScreen_PrintControlInfo(txt("gText_PickOK"));
  PutWindowTilemap(0);
  CopyWindowToVram(0, COPYWIN_GFX);
  PutWindowTilemap(1);
  CopyWindowToVram(1, COPYWIN_GFX);
  PutWindowTilemap(d.dexCountsWindowId);
  CopyWindowToVram(d.dexCountsWindowId, COPYWIN_GFX);
}

function MoveCursorFunc_DexModeSelect(itemIndex: number, onInit: boolean, _list: ListMenu): void {
  const d = sPokedexScreenData;
  if (!onInit) sound.playSE(C.SE_SELECT);
  if (itemIndex === -2) { // LIST_CANCEL
    CopyToWindowPixelBuffer(d.selectionIconWindowId, incbin("sTopMenuSelectionIconTiles_Cancel"), 0x000, 0x000);
    LoadPalette(incbin16("sTopMenuSelectionIconPals_Cancel"), BG_PLTT_ID(1), PLTT_SIZE_4BPP);
  } else {
    const gfx = rd<Array<{ tiles: SymRef; pal: SymRef }>>("sTopMenuSelectionIconGfxPtrs")[itemIndex];
    CopyToWindowPixelBuffer(d.selectionIconWindowId, incbin(symName(gfx.tiles)!), 0x000, 0x000);
    LoadPalette(incbin16(symName(gfx.pal)!), BG_PLTT_ID(1), PLTT_SIZE_4BPP);
  }
  PutWindowTilemap(d.selectionIconWindowId);
  CopyWindowToVram(d.selectionIconWindowId, COPYWIN_GFX);
}

function ItemPrintFunc_DexModeSelect(_windowId: number, itemId: number, _y: number): void {
  if (itemId >>> 0 >= C.DEX_CATEGORY_COUNT || sPokedexScreenData.unlockedCategories & (1 << itemId))
    ListMenuOverrideSetColors(C.TEXT_COLOR_WHITE, C.TEXT_COLOR_TRANSPARENT, C.TEXT_COLOR_LIGHT_GRAY);
  else
    ListMenuOverrideSetColors(C.TEXT_DYNAMIC_COLOR_1, C.TEXT_COLOR_TRANSPARENT, C.TEXT_DYNAMIC_COLOR_2);
}

// ---------------------------------------------------------------- ordered lists

/** ListMenuGetScrollAndRow on a list task id that may already be destroyed (see header). */
function scrollOfListTask(listTaskId: number, fallback: number): number {
  try {
    listMenuOf(listTaskId);
  } catch {
    return fallback;
  }
  return ListMenuGetScrollAndRow(listTaskId).cursorPos;
}

function Task_DexScreen_NumericalOrder(taskId: number): void {
  const d = sPokedexScreenData;
  switch (d.state) {
    case 0:
      ListMenuLoadStdPalAt(BG_PLTT_ID(1), 0);
      ListMenuLoadStdPalAt(BG_PLTT_ID(2), 1);
      d.orderedDexCount = DexScreen_CountMonsInOrderedList(d.dexOrderId);
      d.state = 2;
      break;
    case 1:
      DexScreen_DestroyDexOrderListMenu(d.dexOrderId);
      HideBg(1);
      d.numericalOrderWindowId = DexScreen_RemoveWindow(d.numericalOrderWindowId);
      tasks.tasks[taskId].func = Task_PokedexScreen;
      d.state = 0;
      break;
    case 2:
      DexScreen_InitGfxForNumericalOrderList();
      d.state = 3;
      break;
    case 3:
      CopyBgTilemapBufferToVram(3);
      CopyBgTilemapBufferToVram(1);
      d.state = 4;
      break;
    case 4:
      ShowBg(1);
      BeginNormalPaletteFade(~0x8000 >>> 0, 0, 16, 0, RGB_WHITEALPHA);
      d.state = 5;
      break;
    case 5:
      d.modeSelectCursorPosBak = scrollOfListTask(d.modeSelectListMenuId, d.modeSelectCursorPosBak);
      d.scrollArrowsTaskId = DexScreen_CreateDexOrderScrollArrows();
      d.state = 6;
      break;
    case 6:
      d.characteristicMenuInput = ListMenu_ProcessInput(d.orderedListMenuTaskId);
      d.modeSelectCursorPosBak = scrollOfListTask(d.modeSelectListMenuId, d.modeSelectCursorPosBak);
      if (joy.newKeys & A_BUTTON) {
        if ((d.characteristicMenuInput >> 16) & 1) {
          d.dexSpecies = d.characteristicMenuInput & 0xffff;
          RemoveScrollIndicatorArrowPair(d.scrollArrowsTaskId);
          BeginNormalPaletteFade(~0x8000 >>> 0, 0, 0, 16, RGB_WHITEALPHA);
          d.state = 7;
        }
      } else if (joy.newKeys & B_BUTTON) {
        RemoveScrollIndicatorArrowPair(d.scrollArrowsTaskId);
        BeginNormalPaletteFade(~0x8000 >>> 0, 0, 0, 16, RGB_WHITEALPHA);
        d.state = 1;
      }
      break;
    case 7:
      DexScreen_DestroyDexOrderListMenu(d.dexOrderId);
      FillBgTilemapBufferRect_Palette0(1, 0x000, 0, 0, 32, 20);
      CopyBgTilemapBufferToVram(1);
      d.numericalOrderWindowId = DexScreen_RemoveWindow(d.numericalOrderWindowId);
      tasks.tasks[taskId].func = Task_DexScreen_ShowMonPage;
      d.state = 0;
      break;
  }
}

function orderedListTemplate(): ListMenuTemplate {
  const d = sPokedexScreenData;
  const template = listTemplateFrom("sListMenuTemplate_OrderedListMenu", d.listItems, ListMenuDefaultCursorMoveFunc, ItemPrintFunc_OrderedListMenu);
  template.windowId = d.numericalOrderWindowId;
  template.totalItems = d.orderedDexCount;
  return template;
}

function DexScreen_InitGfxForNumericalOrderList(): void {
  const d = sPokedexScreenData;
  FillBgTilemapBufferRect(3, 0x00e, 0, 0, 30, 20, 0);
  FillBgTilemapBufferRect(1, 0x000, 0, 0, 32, 32, 17);
  d.numericalOrderWindowId = AddWindow(win("sWindowTemplate_OrderedListMenu"));
  DexScreen_InitListMenuForOrderedList(orderedListTemplate(), d.dexOrderId);
  FillWindowPixelBuffer(0, PIXEL_FILL(15));
  DexScreen_PrintStringWithAlignment(txt("gText_PokemonListNoColor"), TEXT_CENTER);
  FillWindowPixelBuffer(1, PIXEL_FILL(15));
  DexScreen_PrintControlInfo(txt("gText_PickOKExit"));
  CopyWindowToVram(0, COPYWIN_GFX);
  CopyWindowToVram(1, COPYWIN_GFX);
}

function Task_DexScreen_CharacteristicOrder(taskId: number): void {
  const d = sPokedexScreenData;
  switch (d.state) {
    case 0:
      ListMenuLoadStdPalAt(BG_PLTT_ID(1), 0);
      ListMenuLoadStdPalAt(BG_PLTT_ID(2), 1);
      d.orderedDexCount = DexScreen_CountMonsInOrderedList(d.dexOrderId);
      d.state = 2;
      break;
    case 1:
      DexScreen_DestroyDexOrderListMenu(d.dexOrderId);
      HideBg(1);
      d.numericalOrderWindowId = DexScreen_RemoveWindow(d.numericalOrderWindowId);
      tasks.tasks[taskId].func = Task_PokedexScreen;
      d.state = 0;
      break;
    case 2:
      DexScreen_CreateCharacteristicListMenu();
      d.state = 3;
      break;
    case 3:
      CopyBgTilemapBufferToVram(3);
      CopyBgTilemapBufferToVram(1);
      d.state = 4;
      break;
    case 4:
      ShowBg(1);
      BeginNormalPaletteFade(~0x8000 >>> 0, 0, 16, 0, RGB_WHITEALPHA);
      d.state = 5;
      break;
    case 5:
      d.modeSelectCursorPosBak = scrollOfListTask(d.modeSelectListMenuId, d.modeSelectCursorPosBak);
      d.scrollArrowsTaskId = DexScreen_CreateDexOrderScrollArrows();
      d.state = 6;
      break;
    case 6:
      d.characteristicMenuInput = ListMenu_ProcessInput(d.orderedListMenuTaskId);
      d.modeSelectCursorPosBak = scrollOfListTask(d.modeSelectListMenuId, d.modeSelectCursorPosBak);
      if (joy.newKeys & A_BUTTON) {
        if (((d.characteristicMenuInput >> 16) & 1) && !DexScreen_LookUpCategoryBySpecies(d.characteristicMenuInput & 0xffff)) {
          RemoveScrollIndicatorArrowPair(d.scrollArrowsTaskId);
          BeginNormalPaletteFade(~0x8000 >>> 0, 0, 0, 16, RGB_WHITEALPHA);
          d.state = 7;
        }
      } else if (joy.newKeys & B_BUTTON) {
        RemoveScrollIndicatorArrowPair(d.scrollArrowsTaskId);
        BeginNormalPaletteFade(~0x8000 >>> 0, 0, 0, 16, RGB_WHITEALPHA);
        d.state = 1;
      }
      break;
    case 7:
      DexScreen_DestroyDexOrderListMenu(d.dexOrderId);
      FillBgTilemapBufferRect_Palette0(1, 0x000, 0, 0, 32, 20);
      CopyBgTilemapBufferToVram(1);
      d.numericalOrderWindowId = DexScreen_RemoveWindow(d.numericalOrderWindowId);
      d.parentOfCategoryMenu = 1;
      tasks.tasks[taskId].func = Task_DexScreen_CategorySubmenu;
      d.state = 0;
      break;
  }
}

function DexScreen_CreateCharacteristicListMenu(): void {
  const d = sPokedexScreenData;
  FillBgTilemapBufferRect(3, 0x00e, 0, 0, 30, 20, 0);
  FillBgTilemapBufferRect(1, 0x000, 0, 0, 32, 32, 17);
  d.numericalOrderWindowId = AddWindow(win("sWindowTemplate_OrderedListMenu"));
  DexScreen_InitListMenuForOrderedList(orderedListTemplate(), d.dexOrderId);
  FillWindowPixelBuffer(0, PIXEL_FILL(15));
  DexScreen_PrintStringWithAlignment(txt("gText_SearchNoColor"), TEXT_CENTER);
  FillWindowPixelBuffer(1, PIXEL_FILL(15));
  DexScreen_PrintControlInfo(txt("gText_PickOKExit"));
  CopyWindowToVram(0, COPYWIN_GFX);
  CopyWindowToVram(1, COPYWIN_GFX);
}

function DexScreen_CountMonsInOrderedList(orderIdx: number): number {
  const d = sPokedexScreenData;
  const max_n = IsNationalPokedexEnabled() ? C.NATIONAL_DEX_COUNT : C.KANTO_DEX_COUNT;
  let ret = C.NATIONAL_DEX_NONE;
  const setItem = (i: number, ndex_num: number, caught: number, seen: number) => {
    d.listItems[i].label = speciesName(NationalPokedexNumToSpecies(ndex_num));
    d.listItems[i].index = (caught << 17) + (seen << 16) + NationalPokedexNumToSpecies(ndex_num);
  };
  const flags = (ndex_num: number) => [DexScreen_GetSetPokedexFlag(ndex_num, C.FLAG_GET_SEEN, false), DexScreen_GetSetPokedexFlag(ndex_num, C.FLAG_GET_CAUGHT, false)];

  switch (orderIdx) {
    default:
    case C.DEX_ORDER_NUMERICAL_KANTO:
      for (let i = 0; i < C.KANTO_DEX_COUNT; i++) {
        const ndex_num = i + 1;
        const [seen, caught] = flags(ndex_num);
        if (seen) {
          d.listItems[i].label = speciesName(NationalPokedexNumToSpecies(ndex_num));
          ret = ndex_num;
        } else {
          d.listItems[i].label = txt("gText_5Dashes");
        }
        d.listItems[i].index = (caught << 17) + (seen << 16) + NationalPokedexNumToSpecies(ndex_num);
      }
      break;
    case C.DEX_ORDER_ATOZ: {
      const order = rd<number[]>("gPokedexOrder_Alphabetical");
      for (let i = 0; i < C.NUM_SPECIES - 1; i++) {
        const ndex_num = order[i];
        if (ndex_num <= max_n) {
          const [seen, caught] = flags(ndex_num);
          if (seen) setItem(ret++, ndex_num, caught, seen);
        }
      }
      break;
    }
    case C.DEX_ORDER_TYPE: {
      const order = rd<number[]>("gPokedexOrder_Type");
      for (let i = 0; i < C.NUM_SPECIES - 1; i++) {
        const ndex_num = SpeciesToNationalPokedexNum(order[i]);
        if (ndex_num <= max_n) {
          const [seen, caught] = flags(ndex_num);
          if (caught) setItem(ret++, ndex_num, caught, seen);
        }
      }
      break;
    }
    case C.DEX_ORDER_LIGHTEST: {
      const order = rd<number[]>("gPokedexOrder_Weight");
      for (let i = 0; i < C.NATIONAL_DEX_COUNT; i++) {
        const ndex_num = order[i];
        if (ndex_num <= max_n) {
          const [seen, caught] = flags(ndex_num);
          if (caught) setItem(ret++, ndex_num, caught, seen);
        }
      }
      break;
    }
    case C.DEX_ORDER_SMALLEST: {
      const order = rd<number[]>("gPokedexOrder_Height");
      for (let i = 0; i < C.NATIONAL_DEX_COUNT; i++) {
        const ndex_num = order[i];
        if (ndex_num <= max_n) {
          const [seen, caught] = flags(ndex_num);
          if (caught) setItem(ret++, ndex_num, caught, seen);
        }
      }
      break;
    }
    case C.DEX_ORDER_NUMERICAL_NATIONAL:
      for (let i = 0; i < C.NATIONAL_DEX_COUNT; i++) {
        const ndex_num = i + 1;
        const [seen, caught] = flags(ndex_num);
        if (seen) {
          d.listItems[i].label = speciesName(NationalPokedexNumToSpecies(ndex_num));
          ret = ndex_num;
        } else {
          d.listItems[i].label = txt("gText_5Dashes");
        }
        d.listItems[i].index = (caught << 17) + (seen << 16) + NationalPokedexNumToSpecies(ndex_num);
      }
      break;
  }
  return ret;
}

function DexScreen_InitListMenuForOrderedList(template: ListMenuTemplate, order: number): void {
  const d = sPokedexScreenData;
  const rects = rd<ListMenuWindowRect[]>("sListMenuRects_OrderedList");
  switch (order) {
    default:
    case C.DEX_ORDER_NUMERICAL_KANTO:
      d.orderedListMenuTaskId = ListMenuInitInRect(template, rects, d.kantoOrderMenuCursorPos, d.kantoOrderMenuItemsAbove);
      break;
    case C.DEX_ORDER_ATOZ:
    case C.DEX_ORDER_TYPE:
    case C.DEX_ORDER_LIGHTEST:
    case C.DEX_ORDER_SMALLEST:
      d.orderedListMenuTaskId = ListMenuInitInRect(template, rects, d.characteristicOrderMenuCursorPos, d.characteristicOrderMenuItemsAbove);
      break;
    case C.DEX_ORDER_NUMERICAL_NATIONAL:
      d.orderedListMenuTaskId = ListMenuInitInRect(template, rects, d.nationalOrderMenuCursorPos, d.nationalOrderMenuItemsAbove);
      break;
  }
}

function DexScreen_DestroyDexOrderListMenu(order: number): void {
  const d = sPokedexScreenData;
  const r = DestroyListMenuTask(d.orderedListMenuTaskId);
  switch (order) {
    default:
    case C.DEX_ORDER_NUMERICAL_KANTO:
      d.kantoOrderMenuCursorPos = r.cursorPos;
      d.kantoOrderMenuItemsAbove = r.itemsAbove;
      break;
    case C.DEX_ORDER_ATOZ:
    case C.DEX_ORDER_TYPE:
    case C.DEX_ORDER_LIGHTEST:
    case C.DEX_ORDER_SMALLEST:
      d.characteristicOrderMenuCursorPos = r.cursorPos;
      d.characteristicOrderMenuItemsAbove = r.itemsAbove;
      break;
    case C.DEX_ORDER_NUMERICAL_NATIONAL:
      d.nationalOrderMenuCursorPos = r.cursorPos;
      d.nationalOrderMenuItemsAbove = r.itemsAbove;
      break;
  }
}

function DexScreen_CreateDexOrderScrollArrows(): number {
  const d = sPokedexScreenData;
  const template = { ...rd<ScrollArrowsTemplate>("sDexOrderScrollArrowsTemplate") };
  const maxShowed = rd<CListMenuTemplate>("sListMenuTemplate_OrderedListMenu").maxShowed;
  if (d.orderedDexCount > maxShowed) template.fullyDownThreshold = d.orderedDexCount - maxShowed;
  else template.fullyDownThreshold = 0;
  return AddScrollIndicatorArrowPair(template, () => sPokedexScreenData.modeSelectCursorPosBak);
}

function ItemPrintFunc_OrderedListMenu(_windowId: number, itemId: number, y: number): void {
  const d = sPokedexScreenData;
  const species = itemId & 0xffff;
  const caught = (itemId >> 17) & 1;
  DexScreen_PrintMonDexNo(d.numericalOrderWindowId, FONT_SMALL, species, 12, y);
  if (caught) {
    BlitMenuInfoIcon(d.numericalOrderWindowId, C.MENU_INFO_ICON_CAUGHT, 0x28, y);
    const types = rom.species[species].types;
    const type1 = types[0];
    BlitMenuInfoIcon(d.numericalOrderWindowId, type1 + 1, 0x78, y);
    if (type1 !== types[1]) BlitMenuInfoIcon(d.numericalOrderWindowId, types[1] + 1, 0x98, y);
  }
}

// ---------------------------------------------------------------- habitat pages

function Task_DexScreen_CategorySubmenu(taskId: number): void {
  const d = sPokedexScreenData;
  let pageFlipCmd: number;
  switch (d.state) {
    case 0:
      HideBg(3);
      HideBg(2);
      HideBg(1);
      DexScreen_GetPageLimitsForCategory(d.category);
      if (d.pageNum < d.firstPageInCategory) d.pageNum = d.firstPageInCategory;
      d.state = 2;
      break;
    case 1:
      DexScreen_DestroyCategoryPageMonIconAndInfoWindows();
      HideBg(2);
      HideBg(1);
      switch (d.parentOfCategoryMenu) {
        case 0:
        default:
          tasks.tasks[taskId].func = Task_PokedexScreen;
          break;
        case 1:
          tasks.tasks[taskId].func = Task_DexScreen_CharacteristicOrder;
          break;
      }
      d.state = 0;
      break;
    case 2:
      DexScreen_CreateCategoryListGfx(false);
      CopyBgTilemapBufferToVram(3);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      DexScreen_CreateCategoryPageSelectionCursor(0xff);
      d.state = 3;
      break;
    case 3:
      BeginNormalPaletteFade(~0x8000 >>> 0, 0, 16, 0, RGB_WHITEALPHA);
      ShowBg(3);
      ShowBg(2);
      ShowBg(1);
      d.state = 4;
      break;
    case 4:
      d.scrollArrowsTaskId = DexScreen_CreateCategoryMenuScrollArrows();
      d.categoryPageCursorTaskId = ListMenuAddCursorObjectInternal(rd<CursorStruct>("sCursorStruct_CategoryPage"), 0);
      d.state = 5;
      break;
    case 5:
      DexScreen_CreateCategoryPageSelectionCursor(d.categoryCursorPosInPage);
      DexScreen_UpdateCategoryPageCursorObject(d.categoryPageCursorTaskId, d.categoryCursorPosInPage, d.numMonsOnPage);
      d.modeSelectCursorPosBak = d.pageNum;
      pageFlipCmd = 0;
      if ((joy.newKeys & A_BUTTON) && DexScreen_GetSetPokedexFlag(d.pageSpecies[d.categoryCursorPosInPage], C.FLAG_GET_SEEN, true)) {
        RemoveScrollIndicatorArrowPair(d.scrollArrowsTaskId);
        ListMenuRemoveCursorObject(d.categoryPageCursorTaskId, 0);
        d.state = 12;
        break;
      }
      if (!(joy.held & R_BUTTON) && (joy.repeated & DPAD_LEFT)) {
        if (d.categoryCursorPosInPage !== 0) {
          d.categoryCursorPosInPage--;
          sound.playSE(C.SE_SELECT);
          break;
        } else {
          pageFlipCmd = 1;
        }
      }
      if (!(joy.held & R_BUTTON) && (joy.repeated & DPAD_RIGHT)) {
        if (d.categoryCursorPosInPage < d.numMonsOnPage - 1) {
          d.categoryCursorPosInPage++;
          sound.playSE(C.SE_SELECT);
          break;
        } else {
          pageFlipCmd = 2;
        }
      }
      if (pageFlipCmd === 0) pageFlipCmd = DexScreen_InputHandler_GetShoulderInput();
      switch (pageFlipCmd) {
        case 0: // No action
          break;
        case 1: // Left
          while (d.pageNum > d.firstPageInCategory) {
            d.pageNum--;
            if (DexScreen_IsPageUnlocked(d.category, d.pageNum)) {
              d.state = 8;
              break;
            }
          }
          if (d.state !== 8) d.state = 6;
          break;
        case 2: // Right
          while (d.pageNum < d.lastPageInCategory - 1) {
            d.pageNum++;
            if (DexScreen_IsPageUnlocked(d.category, d.pageNum)) {
              d.state = 10;
              break;
            }
          }
          if (d.state !== 10) d.state = 6;
          break;
      }
      if (joy.newKeys & B_BUTTON) d.state = 6;
      break;
    case 6:
    case 7:
      RemoveScrollIndicatorArrowPair(d.scrollArrowsTaskId);
      ListMenuRemoveCursorObject(d.categoryPageCursorTaskId, 0);
      BeginNormalPaletteFade(~0x8000 >>> 0, 0, 0, 16, RGB_WHITEALPHA);
      d.state = 1;
      break;
    case 8:
    case 10:
      DexScreen_DestroyCategoryPageMonIconAndInfoWindows();
      DexScreen_CreateCategoryPageSelectionCursor(0xff);
      ListMenuUpdateCursorObject(d.categoryPageCursorTaskId, 0, 0xa0, 0);
      d.categoryPageSelectionCursorTimer = 0;
      d.data[0] = 0;
      d.state++;
      break;
    case 9:
      if (DexScreen_FlipCategoryPageInDirection(0)) {
        d.categoryCursorPosInPage = d.numMonsOnPage - 1;
        d.state = 5;
      }
      break;
    case 11:
      if (DexScreen_FlipCategoryPageInDirection(1)) {
        d.categoryCursorPosInPage = 0;
        d.state = 5;
      }
      break;
    case 12:
      d.dexSpecies = d.pageSpecies[d.categoryCursorPosInPage];
      sound.playSE(C.SE_SELECT);
      d.state = 14;
      break;
    case 13:
      RemoveDexPageWindows();
      d.state = 4;
      break;
    case 14:
      DexScreen_DrawMonDexPage(false);
      d.state = 15;
      break;
    case 15:
      d.data[0] = 0;
      d.data[1] = 0;
      d.state++;
    // fallthrough
    case 16:
      if (d.data[1] < 6) {
        if (d.data[0]) {
          DexScreen_DexPageZoomEffectFrame(0, d.data[1]);
          CopyBgTilemapBufferToVram(0);
          d.data[0] = 4;
          d.data[1]++;
        } else {
          d.data[0] = (d.data[0] - 1) & 0xff;
        }
      } else {
        FillBgTilemapBufferRect_Palette0(0, 0x000, 0, 2, 30, 16);
        CopyBgTilemapBufferToVram(3);
        CopyBgTilemapBufferToVram(2);
        CopyBgTilemapBufferToVram(1);
        CopyBgTilemapBufferToVram(0);
        PlayCry_NormalNoDucking(d.dexSpecies);
        d.data[0] = 0;
        d.state = 17;
      }
      break;
    case 17:
      if (joy.newKeys & A_BUTTON) {
        RemoveDexPageWindows();
        FillBgTilemapBufferRect_Palette0(1, 0x000, 0, 2, 30, 16);
        CopyBgTilemapBufferToVram(1);
        d.state = 21;
      } else if (joy.newKeys & B_BUTTON) {
        d.state = 18;
      } else {
        DexScreen_InputHandler_StartToCry();
      }
      break;
    case 18:
      DexScreen_CreateCategoryListGfx(false);
      DexScreen_DexPageZoomEffectFrame(0, 6);
      CopyBgTilemapBufferToVram(3);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(0);
      d.state = 19;
      break;
    case 19:
      d.data[0] = 0;
      d.data[1] = 6;
      d.state++;
    // fallthrough
    case 20:
      if (d.data[1]) {
        if (d.data[0]) {
          d.data[1]--;
          FillBgTilemapBufferRect_Palette0(0, 0x000, 0, 2, 30, 16);
          DexScreen_DexPageZoomEffectFrame(0, d.data[1]);
          CopyBgTilemapBufferToVram(0);
          d.data[0] = 1;
        } else {
          d.data[0] = (d.data[0] - 1) & 0xff;
        }
      } else {
        FillBgTilemapBufferRect_Palette0(0, 0x000, 0, 2, 30, 16);
        CopyBgTilemapBufferToVram(0);
        d.state = 13;
      }
      break;
    case 21:
      DexScreen_DrawMonAreaPage();
      d.state = 22;
      break;
    case 22:
      CopyBgTilemapBufferToVram(3);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(0);
      d.state = 23;
      break;
    case 23:
      if (joy.newKeys & A_BUTTON) {
        clearAreaPageBgs();
        d.state = 26;
      } else if (joy.newKeys & B_BUTTON) {
        clearAreaPageBgs();
        d.state = 24;
      } else {
        DexScreen_InputHandler_StartToCry();
      }
      break;
    case 24:
      DexScreen_DestroyAreaScreenResources();
      d.state = 25;
      break;
    case 25:
      DexScreen_DrawMonDexPage(false);
      CopyBgTilemapBufferToVram(3);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(0);
      d.state = 17;
      break;
    case 26:
      DexScreen_DestroyAreaScreenResources();
      d.state = 18;
      break;
  }
}

/** The three FillBgTilemapBufferRect_Palette0 + CopyBgTilemapBufferToVram pairs on leaving the area page. */
function clearAreaPageBgs(): void {
  FillBgTilemapBufferRect_Palette0(2, 0x000, 0, 2, 30, 16);
  FillBgTilemapBufferRect_Palette0(1, 0x000, 0, 2, 30, 16);
  FillBgTilemapBufferRect_Palette0(0, 0x000, 0, 2, 30, 16);
  CopyBgTilemapBufferToVram(2);
  CopyBgTilemapBufferToVram(1);
  CopyBgTilemapBufferToVram(0);
}

function DexScreen_CreateCategoryMenuScrollArrows(): number {
  const d = sPokedexScreenData;
  const template = { ...rd<ScrollArrowsTemplate>("sScrollArrowsTemplate_CategoryMenu") };
  template.fullyUpThreshold = d.firstPageInCategory;
  template.fullyDownThreshold = d.lastPageInCategory - 1;
  d.modeSelectCursorPosBak = d.pageNum;
  return AddScrollIndicatorArrowPair(template, () => sPokedexScreenData.modeSelectCursorPosBak);
}

/** Returns 1 to flip pages left, 2 to flip pages right, 0 for no action. */
function DexScreen_InputHandler_GetShoulderInput(): number {
  switch (save.options.buttonMode) {
    case C.OPTIONS_BUTTON_MODE_L_EQUALS_A:
      if ((gMain.heldKeys & R_BUTTON) && (gMain.newKeys & DPAD_LEFT)) return 1;
      else if ((gMain.heldKeys & R_BUTTON) && (gMain.newKeys & DPAD_RIGHT)) return 2;
      else return 0;
    case C.OPTIONS_BUTTON_MODE_LR:
      if (gMain.newKeys & L_BUTTON) return 1;
      else if (gMain.newKeys & R_BUTTON) return 2;
      else return 0;
    case C.OPTIONS_BUTTON_MODE_HELP:
    default:
      return 0;
  }
}

// ---------------------------------------------------------------- entry page from a list

function Task_DexScreen_ShowMonPage(taskId: number): void {
  const d = sPokedexScreenData;
  switch (d.state) {
    case 0:
      HideBg(3);
      HideBg(2);
      HideBg(1);
      d.state = 2;
      break;
    case 1:
      HideBg(2);
      HideBg(1);
      tasks.tasks[taskId].func = Task_DexScreen_NumericalOrder;
      d.state = 0;
      break;
    case 2:
      d.numMonsOnPage = 1;
      DexScreen_DrawMonDexPage(false);
      d.state = 3;
      break;
    case 3:
      CopyBgTilemapBufferToVram(3);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(0);
      PlayCry_NormalNoDucking(d.dexSpecies);
      d.state = 4;
      break;
    case 4:
      BeginNormalPaletteFade(~0x8000 >>> 0, 0, 16, 0, RGB_WHITEALPHA);
      ShowBg(3);
      ShowBg(2);
      ShowBg(1);
      d.state = 5;
      break;
    case 5:
      if (joy.newKeys & A_BUTTON) {
        RemoveDexPageWindows();
        FillBgTilemapBufferRect_Palette0(1, 0x000, 0, 2, 30, 16);
        CopyBgTilemapBufferToVram(1);
        d.state = 7;
      } else if (joy.newKeys & B_BUTTON) {
        RemoveDexPageWindows();
        BeginNormalPaletteFade(~0x8000 >>> 0, 0, 0, 16, RGB_WHITEALPHA);
        d.state = 1;
      } else if ((joy.newKeys & DPAD_UP) && DexScreen_TryScrollMonsVertical(1)) {
        RemoveDexPageWindows();
        BeginNormalPaletteFade(~0x8000 >>> 0, 0, 0, 16, RGB_WHITEALPHA);
        d.state = 6;
      } else if ((joy.newKeys & DPAD_DOWN) && DexScreen_TryScrollMonsVertical(0)) {
        RemoveDexPageWindows();
        BeginNormalPaletteFade(~0x8000 >>> 0, 0, 0, 16, RGB_WHITEALPHA);
        d.state = 6;
      } else {
        DexScreen_InputHandler_StartToCry();
      }
      break;
    case 6:
      HideBg(2);
      HideBg(1);
      d.dexSpecies = d.characteristicMenuInput & 0xffff;
      d.state = 2;
      break;
    case 7:
      DexScreen_DrawMonAreaPage();
      d.state = 8;
      break;
    case 8:
      CopyBgTilemapBufferToVram(3);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(0);
      d.state = 9;
      break;
    case 9:
      if (joy.newKeys & A_BUTTON) {
        BeginNormalPaletteFade(~0x8000 >>> 0, 0, 0, 16, RGB_WHITEALPHA);
        d.state = 12;
      } else if (joy.newKeys & B_BUTTON) {
        clearAreaPageBgs();
        d.state = 10;
      } else {
        DexScreen_InputHandler_StartToCry();
      }
      break;
    case 10:
      DexScreen_DestroyAreaScreenResources();
      d.state = 11;
      break;
    case 11:
      DexScreen_DrawMonDexPage(false);
      CopyBgTilemapBufferToVram(3);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(0);
      d.state = 5;
      break;
    case 12:
      DexScreen_DestroyAreaScreenResources();
      FillBgTilemapBufferRect_Palette0(0, 0x000, 0, 2, 30, 16);
      CopyBgTilemapBufferToVram(0);
      d.state = 1;
      break;
  }
}

function DexScreen_TryScrollMonsVertical(direction: number): boolean {
  const d = sPokedexScreenData;
  let cursorKey: "kantoOrderMenuCursorPos" | "characteristicOrderMenuCursorPos" | "nationalOrderMenuCursorPos";
  let itemsAboveKey: "kantoOrderMenuItemsAbove" | "characteristicOrderMenuItemsAbove" | "nationalOrderMenuItemsAbove";
  switch (d.dexOrderId) {
    default:
    case C.DEX_ORDER_NUMERICAL_KANTO:
      cursorKey = "kantoOrderMenuCursorPos";
      itemsAboveKey = "kantoOrderMenuItemsAbove";
      break;
    case C.DEX_ORDER_ATOZ:
    case C.DEX_ORDER_TYPE:
    case C.DEX_ORDER_LIGHTEST:
    case C.DEX_ORDER_SMALLEST:
      cursorKey = "characteristicOrderMenuCursorPos";
      itemsAboveKey = "characteristicOrderMenuItemsAbove";
      break;
    case C.DEX_ORDER_NUMERICAL_NATIONAL:
      cursorKey = "nationalOrderMenuCursorPos";
      itemsAboveKey = "nationalOrderMenuItemsAbove";
      break;
  }

  let selectedIndex = d[cursorKey] + d[itemsAboveKey];
  if (direction) { // Seek up
    if (selectedIndex === 0) return false;
    selectedIndex--;
    while (selectedIndex >= 0) {
      if ((d.listItems[selectedIndex].index >> 16) & 1) break;
      selectedIndex--;
    }
    if (selectedIndex < 0) return false;
  } else { // Seek down
    if (selectedIndex === d.orderedDexCount - 1) return false;
    selectedIndex++;
    while (selectedIndex < d.orderedDexCount) {
      if ((d.listItems[selectedIndex].index >> 16) & 1) break;
      selectedIndex++;
    }
    if (selectedIndex >= d.orderedDexCount) return false;
  }
  d.characteristicMenuInput = d.listItems[selectedIndex].index;

  if (d.orderedDexCount > 9) {
    if (selectedIndex < 4) {
      d[cursorKey] = 0;
      d[itemsAboveKey] = selectedIndex;
    } else if (selectedIndex >= d.orderedDexCount - 4) {
      d[cursorKey] = d.orderedDexCount - 9;
      d[itemsAboveKey] = selectedIndex + 9 - d.orderedDexCount;
    } else {
      d[cursorKey] = selectedIndex - 4;
      d[itemsAboveKey] = 4;
    }
  } else {
    d[cursorKey] = 0;
    d[itemsAboveKey] = selectedIndex;
  }
  return true;
}

// ---------------------------------------------------------------- printing helpers

/** DexScreen_RemoveWindow(u8 *windowId_p): returns the new value to store (0xFF). */
function DexScreen_RemoveWindow(windowId: number): number {
  if (windowId !== 0xff) RemoveWindow(windowId);
  return 0xff;
}

function DexScreen_AddTextPrinterParameterized(windowId: number, fontId: number, str: ArrayLike<number>, x: number, y: number, colorIdx: number): void {
  const textColor = [0, 0, 0];
  switch (colorIdx) {
    case 0: textColor[0] = 0; textColor[1] = 1; textColor[2] = 3; break;
    case 1: textColor[0] = 0; textColor[1] = 5; textColor[2] = 1; break;
    case 2: textColor[0] = 0; textColor[1] = 15; textColor[2] = 14; break;
    case 3: textColor[0] = 0; textColor[1] = 11; textColor[2] = 1; break;
    case 4: textColor[0] = 0; textColor[1] = 1; textColor[2] = 2; break;
  }
  AddTextPrinterParameterized4(windowId, fontId, x & 0xff, y & 0xff, fontId === FONT_SMALL ? 0 : 1, 0, textColor, -1, str);
}

function DexScreen_PrintNum3LeadingZeroes(windowId: number, fontId: number, num: number, x: number, y: number, colorIdx: number): void {
  const buff = [0, 0, 0, EOS];
  buff[0] = Math.trunc(num / 100) + C.CHAR_0;
  num %= 100;
  buff[1] = Math.trunc(num / 10) + C.CHAR_0;
  buff[2] = (num % 10) + C.CHAR_0;
  DexScreen_AddTextPrinterParameterized(windowId, fontId, buff, x, y, colorIdx);
}

function DexScreen_PrintNum3RightAlign(windowId: number, fontId: number, num: number, x: number, y: number, colorIdx: number): void {
  const buff = [0, 0, 0, EOS];
  buff[0] = Math.trunc(num / 100) + C.CHAR_0;
  num %= 100;
  buff[1] = Math.trunc(num / 10) + C.CHAR_0;
  buff[2] = (num % 10) + C.CHAR_0;
  for (let i = 0; i < 3; i++) {
    if (buff[i] !== C.CHAR_0) break;
    buff[i] = CHAR_SPACE;
  }
  DexScreen_AddTextPrinterParameterized(windowId, fontId, buff, x, y, colorIdx);
}

function DexScreen_GetDefaultPersonality(species: number): number {
  const dex = save as unknown as { unownPersonality?: number; spindaPersonality?: number };
  switch (species) {
    case C.SPECIES_SPINDA: return dex.spindaPersonality ?? 0;
    case C.SPECIES_UNOWN: return dex.unownPersonality ?? 0;
    default: return 0;
  }
}

function DexScreen_LoadMonPicInWindow(windowId: number, species: number, paletteOffset: number): void {
  LoadMonPicInWindow(species, C.SHINY_ODDS, DexScreen_GetDefaultPersonality(species), true, paletteOffset >> 4, windowId);
}

function DexScreen_PrintMonDexNo(windowId: number, fontId: number, species: number, x: number, y: number): void {
  const dexNum = SpeciesToNationalPokedexNum(species);
  DexScreen_AddTextPrinterParameterized(windowId, fontId, txt("gText_PokedexNo"), x, y, 0);
  DexScreen_PrintNum3LeadingZeroes(windowId, fontId, dexNum, x + 9, y, 0);
}

export function DexScreen_GetSetPokedexFlag(nationalDexNo: number, caseId: number, indexIsSpecies: boolean): number {
  if (indexIsSpecies) nationalDexNo = SpeciesToNationalPokedexNum(nationalDexNo);
  return GetSetPokedexFlag(nationalDexNo & 0xffff, caseId);
}

function DexScreen_GetDexCount(caseId: number, whichDex: number): number {
  let count = 0;
  switch (whichDex) {
    case 0: // Kanto
      for (let i = 0; i < C.KANTO_DEX_COUNT; i++) if (DexScreen_GetSetPokedexFlag(i + 1, caseId, false)) count++;
      break;
    case 1: // National
      for (let i = 0; i < C.NATIONAL_DEX_COUNT; i++) if (DexScreen_GetSetPokedexFlag(i + 1, caseId, false)) count++;
      break;
  }
  return count;
}

function DexScreen_PrintControlInfo(src: ArrayLike<number>): void {
  DexScreen_AddTextPrinterParameterized(1, FONT_SMALL, src, 236 - stringWidth(FONT_SMALL, src, 0), 2, 4);
}

function DexScreen_DrawMonPicInCategoryPage(species: number, slot: number, numSlots: number): boolean {
  const d = sPokedexScreenData;
  numSlots--;
  const coords = sCategoryPageIconCoords(numSlots)[slot];
  CopyToBgTilemapBufferRect_ChangePalette(3, incbin16("sCategoryPageIconWindowBg"), coords[0], coords[1], 8, 8, slot + 5);
  if (d.categoryMonWindowIds[slot] === 0xff) {
    const template = win("sWindowTemplate_CategoryMonIcon");
    template.tilemapLeft = coords[0];
    template.tilemapTop = coords[1];
    template.paletteNum = slot + 1;
    template.baseBlock = slot * 64 + 8;
    d.categoryMonWindowIds[slot] = AddWindow(template);
    FillWindowPixelBuffer(d.categoryMonWindowIds[slot], PIXEL_FILL(0));
    DexScreen_LoadMonPicInWindow(d.categoryMonWindowIds[slot], species, slot * 16 + 16);
    PutWindowTilemap(d.categoryMonWindowIds[slot]);
    CopyWindowToVram(d.categoryMonWindowIds[slot], COPYWIN_GFX);
  } else {
    PutWindowTilemap(d.categoryMonWindowIds[slot]);
  }

  if (d.categoryMonInfoWindowIds[slot] === 0xff) {
    if (species !== C.SPECIES_NONE) {
      const template = win("sWindowTemplate_CategoryMonInfo");
      template.tilemapLeft = coords[2];
      template.tilemapTop = coords[3];
      template.baseBlock = slot * 40 + 0x108;
      d.categoryMonInfoWindowIds[slot] = AddWindow(template);
      CopyToWindowPixelBuffer(d.categoryMonInfoWindowIds[slot], incbin("sCategoryMonInfoBgTiles"), 0, 0);
      DexScreen_PrintMonDexNo(d.categoryMonInfoWindowIds[slot], FONT_SMALL, species, 12, 0);
      DexScreen_AddTextPrinterParameterized(d.categoryMonInfoWindowIds[slot], FONT_NORMAL, speciesName(species), 2, 13, 0);
      if (DexScreen_GetSetPokedexFlag(species, C.FLAG_GET_CAUGHT, true))
        BlitBitmapRectToWindow(d.categoryMonInfoWindowIds[slot], incbin("sDexScreen_CaughtIcon"), 0, 0, 8, 8, 2, 3, 8, 8);
      PutWindowTilemap(d.categoryMonInfoWindowIds[slot]);
      CopyWindowToVram(d.categoryMonInfoWindowIds[slot], COPYWIN_GFX);
    }
  } else {
    PutWindowTilemap(d.categoryMonInfoWindowIds[slot]);
  }
  return true;
}

function DexScreen_DestroyCategoryPageMonIconAndInfoWindows(): void {
  const d = sPokedexScreenData;
  for (let i = 0; i < 4; i++) {
    d.categoryMonWindowIds[i] = DexScreen_RemoveWindow(d.categoryMonWindowIds[i]);
    d.categoryMonInfoWindowIds[i] = DexScreen_RemoveWindow(d.categoryMonInfoWindowIds[i]);
  }
}

function DexScreen_PrintCategoryPageNumbers(_windowId: number, currentPage: number, totalPages: number, _x: number, _y: number): void {
  const buffer = [
    ...stripEos(txt("gText_Page")),
    ...stripEos(intToDecimal(currentPage, STR_CONV_MODE_RIGHT_ALIGN, 2)),
    C.CHAR_SLASH,
    ...stripEos(intToDecimal(totalPages, STR_CONV_MODE_RIGHT_ALIGN, 2)),
    EOS,
  ];
  DexScreen_PrintStringWithAlignment(buffer, TEXT_RIGHT);
}

function stripEos(s: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length && s[i] !== EOS; i++) out.push(s[i]);
  return out;
}

function DexScreen_CreateCategoryListGfx(justRegistered: boolean): boolean {
  const d = sPokedexScreenData;
  FillBgTilemapBufferRect_Palette0(3, 2, 0, 0, 30, 20);
  FillBgTilemapBufferRect_Palette0(2, 0, 0, 0, 32, 20);
  FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 32, 20);
  DexScreen_CreateCategoryPageSpeciesList(d.category, d.pageNum);
  FillWindowPixelBuffer(0, PIXEL_FILL(15));
  const categoryName = symText(rd<SymRef[]>("sDexCategoryNamePtrs")[d.category]);
  if (justRegistered) {
    DexScreen_PrintStringWithAlignment(categoryName, TEXT_CENTER);
  } else {
    DexScreen_PrintStringWithAlignment(categoryName, TEXT_LEFT);
    DexScreen_PrintCategoryPageNumbers(0, DexScreen_PageNumberToRenderablePages(d.pageNum), DexScreen_PageNumberToRenderablePages(d.lastPageInCategory - 1), 160, 2);
  }
  CopyWindowToVram(0, COPYWIN_GFX);
  FillWindowPixelBuffer(1, PIXEL_FILL(15));
  if (!justRegistered) DexScreen_PrintControlInfo(txt("gText_PickFlipPageCheckCancel"));
  CopyWindowToVram(1, COPYWIN_GFX);
  for (let i = 0; i < 4; i++) {
    if (d.pageSpecies[i] !== 0xffff) DexScreen_DrawMonPicInCategoryPage(d.pageSpecies[i], i, d.numMonsOnPage);
  }
  return false;
}

function DexScreen_CreateCategoryPageSelectionCursor(cursorPos: number): void {
  const d = sPokedexScreenData;
  const pals = sDexScreen_CategoryCursorPals();
  const load = (idx: number, offset: number) => LoadPalette([pals[idx]], offset, PLTT_SIZEOF(1));
  if (cursorPos === 0xff) {
    for (let i = 0; i < 4; i++) {
      load(0, PLTT_ID(i) + PLTT_ID(5) + 2 + BG_PLTT_OFFSET);
      load(1, PLTT_ID(i) + PLTT_ID(5) + 8 + BG_PLTT_OFFSET);
    }
    load(0, 0x141);
    d.categoryPageSelectionCursorTimer = 0;
  } else {
    d.categoryPageSelectionCursorTimer++;
    if (d.categoryPageSelectionCursorTimer === 16) d.categoryPageSelectionCursorTimer = 0;
    const palIdx = d.categoryPageSelectionCursorTimer >> 2;
    for (let i = 0; i < 4; i++) {
      if (i === cursorPos) {
        load(2 * palIdx + 2, PLTT_ID(i) + PLTT_ID(5) + 2 + BG_PLTT_OFFSET);
        load(2 * palIdx + 3, PLTT_ID(i) + PLTT_ID(5) + 8 + BG_PLTT_OFFSET);
      } else {
        load(0, PLTT_ID(i) + PLTT_ID(5) + 2 + BG_PLTT_OFFSET);
        load(1, PLTT_ID(i) + PLTT_ID(5) + 8 + BG_PLTT_OFFSET);
      }
    }
    load(2 * palIdx + 2, OBJ_PLTT_ID(4) + 1);
  }
}

function DexScreen_UpdateCategoryPageCursorObject(taskId: number, cursorPos: number, numMonsInPage: number): void {
  numMonsInPage = (numMonsInPage - 1) & 0xff;
  const coords = sCategoryPageIconCoords(numMonsInPage)[cursorPos];
  ListMenuUpdateCursorObject(taskId, coords[2] * 8, coords[3] * 8, 0);
}

function DexPage_TileBuffer_CopyCol(srcBuf: Uint16Array, srcOffset: number, srcCol: number, dstBuf: Uint16Array, dstCol: number): boolean {
  for (let i = 0; i < 20; i++) dstBuf[dstCol + i * 32] = srcBuf[srcOffset + srcCol + i * 32];
  return false;
}

function DexPage_TileBuffer_FillCol(tileNo: number, tileBuf: Uint16Array, x: number): boolean {
  for (let i = 0; i < 20; i++) tileBuf[x + i * 32] = tileNo;
  return false;
}

function DexScreen_TurnCategoryPage_BgEffect(page: number): boolean {
  const d = sPokedexScreenData;
  const bg1buff = GetBgTilemapBuffer(1)!;
  const bg2buff = GetBgTilemapBuffer(2)!;
  const bg3buff = GetBgTilemapBuffer(3)!;
  const mem = d.bgBufsMem!;
  const columns = rd<number[][]>("sDexScreenPageTurnColumns")[page];
  for (let dstCol = 0; dstCol < 30; dstCol++) {
    const srcCol = columns[dstCol];
    if (srcCol === 30) {
      DexPage_TileBuffer_FillCol(0x000, bg1buff, dstCol);
      DexPage_TileBuffer_FillCol(0x000, bg2buff, dstCol);
      DexPage_TileBuffer_FillCol(0x00c, bg3buff, dstCol);
    } else {
      DexPage_TileBuffer_CopyCol(mem, 0x800, srcCol, bg1buff, dstCol);
      DexPage_TileBuffer_CopyCol(mem, 0x400, srcCol, bg2buff, dstCol);
      DexPage_TileBuffer_CopyCol(mem, 0x000, srcCol, bg3buff, dstCol);
    }
  }
  CopyBgTilemapBufferToVram(1);
  CopyBgTilemapBufferToVram(2);
  CopyBgTilemapBufferToVram(3);
  return false;
}

function saveCategoryBgs(mem: Uint16Array): void {
  mem.set(GetBgTilemapBuffer(3)!.subarray(0, 0x400), 0 * BG_SCREEN_SIZE / 2);
  mem.set(GetBgTilemapBuffer(2)!.subarray(0, 0x400), 1 * BG_SCREEN_SIZE / 2);
  mem.set(GetBgTilemapBuffer(1)!.subarray(0, 0x400), 2 * BG_SCREEN_SIZE / 2);
}

/** Direction = 0: Left; 1: Right */
function DexScreen_FlipCategoryPageInDirection(direction: number): boolean {
  const d = sPokedexScreenData;
  const color = IsNationalPokedexEnabled() ? sNationalDexPalette()[7] : sKantoDexPalette()[7];
  switch (d.data[0]) {
    case 0:
      d.bgBufsMem = new Uint16Array(3 * BG_SCREEN_SIZE / 2);
      if (direction) d.data[0] = 6;
      else d.data[0] = 2;
      break;
    case 1:
      d.bgBufsMem = null;
      return true;
    // Go left
    case 2:
      BeginNormalPaletteFade(0x00007fff, 0, 0, 16, color);
      d.data[0]++;
      break;
    case 3:
      FillBgTilemapBufferRect_Palette0(3, 0x00c, 0, 0, 30, 20);
      FillBgTilemapBufferRect_Palette0(2, 0x000, 0, 0, 32, 20);
      FillBgTilemapBufferRect_Palette0(1, 0x000, 0, 0, 32, 20);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(3);
      d.data[0]++;
      break;
    case 4:
      BeginNormalPaletteFade(0x00007fff, 0, 0, 0, color);
      DexScreen_CreateCategoryListGfx(false);
      saveCategoryBgs(d.bgBufsMem!);
      FillBgTilemapBufferRect_Palette0(3, 0x00c, 0, 0, 30, 20);
      FillBgTilemapBufferRect_Palette0(2, 0x000, 0, 0, 32, 20);
      FillBgTilemapBufferRect_Palette0(1, 0x000, 0, 0, 32, 20);
      d.data[1] = 0;
      d.data[0]++;
      sound.playSE(C.SE_BALL_TRAY_ENTER);
      break;
    case 5:
      if (d.data[1] < 10) {
        DexScreen_TurnCategoryPage_BgEffect(d.data[1]);
        d.data[1]++;
      } else {
        d.data[0] = 1;
      }
      break;
    // Go right
    case 6:
      saveCategoryBgs(d.bgBufsMem!);
      d.data[1] = 9;
      d.data[0]++;
      sound.playSE(C.SE_BALL_TRAY_ENTER);
      break;
    case 7:
      if (d.data[1] !== 0) {
        DexScreen_TurnCategoryPage_BgEffect(d.data[1]);
        d.data[1]--;
      } else {
        // Non-BUGFIX build: passes data[0] (7) instead of page 0.
        DexScreen_TurnCategoryPage_BgEffect(d.data[0]);
        BeginNormalPaletteFade(0x00007fff, 0, 16, 16, color);
        d.data[0]++;
      }
      break;
    case 8:
      gPaletteFade.bufferTransferDisabled = true;
      DexScreen_CreateCategoryListGfx(false);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(3);
      d.data[0]++;
      break;
    case 9:
      gPaletteFade.bufferTransferDisabled = false;
      BeginNormalPaletteFade(0x00007fff, 0, 16, 0, color);
      d.data[0] = 1;
      break;
  }
  return false;
}

/** Scale from 0 to 6 */
export function DexScreen_DexPageZoomEffectFrame(bg: number, scale: number): void {
  const d = sPokedexScreenData;
  let tileLeft: number, tileTop: number;
  if (!d.numMonsOnPage) {
    const coords = sCategoryPageIconCoords(0)[0];
    tileLeft = coords[2];
    tileTop = coords[3];
  } else {
    const coords = sCategoryPageIconCoords(d.numMonsOnPage - 1)[d.categoryCursorPosInPage];
    tileLeft = coords[2];
    tileTop = coords[3];
  }

  let width = (6 + scale * 4) & 0xff;
  let height = (3 + scale * 2) & 0xff;
  if (width >= 28) width = 28; // Make sure it's not wider than the screen
  if (height >= 14) height = 14; // Make sure it's not taller than the screen

  let left = tileLeft - Math.trunc((scale * 4) / 2);
  let top = tileTop - Math.trunc((scale * 2) / 2);
  if (left + width + 2 >= 30) left -= (left + width + 2) - 30; // Don't wrap right...
  else if (left < 0) left = 0; // ... left ...
  if (top + height + 2 >= 18) top -= (top + height + 2) - 18; // ... down ...
  else if (top < 2) top = 2; // or up.

  const divY = (top + 1) + (Math.trunc(height / 2) + 1); // The horizontal divider

  // Top edge
  FillBgTilemapBufferRect_Palette0(bg, 4, left, top, 1, 1);
  FillBgTilemapBufferRect_Palette0(bg, 5, left + 1, top, width, 1);
  FillBgTilemapBufferRect_Palette0(bg, BG_TILE_H_FLIP(4), left + 1 + width, top, 1, 1);

  // Bottom edge
  FillBgTilemapBufferRect_Palette0(bg, 10, left, top + 1 + height, 1, 1);
  FillBgTilemapBufferRect_Palette0(bg, 11, left + 1, top + 1 + height, width, 1);
  FillBgTilemapBufferRect_Palette0(bg, BG_TILE_H_FLIP(10), left + 1 + width, top + 1 + height, 1, 1);

  // Left edge
  FillBgTilemapBufferRect_Palette0(bg, 6, left, top + 1, 1, divY - top - 1);
  FillBgTilemapBufferRect_Palette0(bg, 7, left, divY, 1, 1);
  FillBgTilemapBufferRect_Palette0(bg, 9, left, divY + 1, 1, top + height - divY);

  // Right edge
  FillBgTilemapBufferRect_Palette0(bg, BG_TILE_H_FLIP(6), left + 1 + width, top + 1, 1, divY - top - 1);
  FillBgTilemapBufferRect_Palette0(bg, BG_TILE_H_FLIP(7), left + 1 + width, divY, 1, 1);
  FillBgTilemapBufferRect_Palette0(bg, BG_TILE_H_FLIP(9), left + 1 + width, divY + 1, 1, top + height - divY);

  // Interior
  FillBgTilemapBufferRect_Palette0(bg, 1, left + 1, top + 1, width, divY - top - 1);
  FillBgTilemapBufferRect_Palette0(bg, 8, left + 1, divY, width, 1);
  FillBgTilemapBufferRect_Palette0(bg, 2, left + 1, divY + 1, width, top + height - divY);
}

// ---------------------------------------------------------------- entry page

export function DexScreen_PrintMonCategory(windowId: number, species: number, x: number, y: number): void {
  species = SpeciesToNationalPokedexNum(species);
  // categoryName is u8[12]; the exported initializer stops at EOS and C zero-fills the rest.
  const categoryName = [...gPokedexEntries()[species].categoryName];
  while (categoryName.length < 12) categoryName.push(0);
  const categoryStr: number[] = [];
  let index = 0;
  if (DexScreen_GetSetPokedexFlag(species, C.FLAG_GET_CAUGHT, false)) {
    // REVISION == 0 stops at CHAR_SPACE.
    while (categoryName[index] !== CHAR_SPACE && index < 11) {
      categoryStr[index] = categoryName[index];
      index++;
    }
  } else {
    while (index < 11) {
      categoryStr[index] = C.CHAR_QUESTION_MARK;
      index++;
    }
  }
  categoryStr[index] = EOS;

  DexScreen_AddTextPrinterParameterized(windowId, FONT_SMALL, categoryStr, x, y, 0);
  x += stringWidth(FONT_SMALL, categoryStr, 0);
  DexScreen_AddTextPrinterParameterized(windowId, FONT_SMALL, txt("gText_PokedexPokemon"), x, y, 0);
}

export function DexScreen_PrintMonHeight(windowId: number, species: number, x: number, y: number): void {
  species = SpeciesToNationalPokedexNum(species);
  const height = gPokedexEntries()[species].height;
  const labelText = txt("gText_HT");
  const buffer: number[] = [];
  buffer.push(C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_MIN_LETTER_SPACING, 5, CHAR_SPACE);

  if (DexScreen_GetSetPokedexFlag(species, C.FLAG_GET_CAUGHT, false)) {
    let inches = Math.trunc((10000 * height) / 254); // actually tenths of inches here
    if (inches % 10 >= 5) inches += 10;
    const feet = Math.trunc(inches / 120);
    inches = Math.trunc((inches - feet * 120) / 10);
    if (Math.trunc(feet / 10) === 0) {
      buffer.push(0, feet + C.CHAR_0);
    } else {
      buffer.push(Math.trunc(feet / 10) + C.CHAR_0, (feet % 10) + C.CHAR_0);
    }
    buffer.push(C.CHAR_SGL_QUOTE_RIGHT, Math.trunc(inches / 10) + C.CHAR_0, (inches % 10) + C.CHAR_0, C.CHAR_DBL_QUOTE_RIGHT, EOS);
  } else {
    buffer.push(C.CHAR_QUESTION_MARK, C.CHAR_QUESTION_MARK, C.CHAR_SGL_QUOTE_RIGHT, C.CHAR_QUESTION_MARK, C.CHAR_QUESTION_MARK, C.CHAR_DBL_QUOTE_RIGHT);
  }
  buffer.push(EOS);
  DexScreen_AddTextPrinterParameterized(windowId, FONT_SMALL, labelText, x, y, 0);
  x += 30;
  DexScreen_AddTextPrinterParameterized(windowId, FONT_SMALL, buffer, x, y, 0);
}

export function DexScreen_PrintMonWeight(windowId: number, species: number, x: number, y: number): void {
  species = SpeciesToNationalPokedexNum(species);
  const weight = gPokedexEntries()[species].weight;
  const labelText = txt("gText_WT");
  const lbsText = txt("gText_Lbs");
  const buffer: number[] = [C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_MIN_LETTER_SPACING, 5];

  if (DexScreen_GetSetPokedexFlag(species, C.FLAG_GET_CAUGHT, false)) {
    let lbs = Math.trunc((weight * 100000) / 4536); // Convert to hundredths of lb
    // Round up to the nearest 0.1 lb
    if (lbs % 10 >= 5) lbs += 10;
    let output = false;
    for (const div of [100000, 10000, 1000]) {
      const digit = Math.trunc(lbs / div) + C.CHAR_0;
      if (digit === C.CHAR_0 && !output) {
        buffer.push(CHAR_SPACE);
      } else {
        output = true;
        buffer.push(digit);
      }
      lbs %= div;
    }
    buffer.push(Math.trunc(lbs / 100) + C.CHAR_0);
    lbs %= 100;
    buffer.push(C.CHAR_PERIOD, Math.trunc(lbs / 10) + C.CHAR_0);
  } else {
    buffer.push(C.CHAR_QUESTION_MARK, C.CHAR_QUESTION_MARK, C.CHAR_QUESTION_MARK, C.CHAR_QUESTION_MARK, C.CHAR_PERIOD, C.CHAR_QUESTION_MARK);
  }
  buffer.push(CHAR_SPACE, C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_MIN_LETTER_SPACING, 0);
  const i = buffer.length;
  let j = 0;
  for (; j < 33 - i && lbsText[j] !== EOS; j++) buffer[i + j] = lbsText[j];
  buffer[i + j] = EOS;
  DexScreen_AddTextPrinterParameterized(windowId, FONT_SMALL, labelText, x, y, 0);
  x += 30;
  DexScreen_AddTextPrinterParameterized(windowId, FONT_SMALL, buffer, x, y, 0);
}

export function DexScreen_PrintMonFlavorText(windowId: number, species: number, x: number, y: number): void {
  species = SpeciesToNationalPokedexNum(species);
  if (DexScreen_GetSetPokedexFlag(species, C.FLAG_GET_CAUGHT, false)) {
    const description = rd<number[]>(symName(gPokedexEntries()[species].description)!);
    const length = stringWidth(FONT_NORMAL, description, 0) & 0xffff;
    const xCenter = x + Math.trunc((240 - length) / 2);
    if (xCenter > 0) x = xCenter & 0xff;
    else x = 0;
    AddTextPrinter({
      windowId, fontId: FONT_NORMAL, letterSpacing: 1, lineSpacing: 0, fgColor: 1, bgColor: 0, shadowColor: 2,
      x, y, currentX: x, currentY: y,
    }, description, TEXT_SKIP_DRAW, null);
  }
}

export function DexScreen_DrawMonFootprint(windowId: number, species: number, x: number, y: number): void {
  if (!DexScreen_GetSetPokedexFlag(species, C.FLAG_GET_CAUGHT, true)) return;
  const footprint = incbin(symName(rd<SymRef[]>("gMonFootprintTable")[species])!);
  const buffer = new Uint8Array(128); // gDecompressionBuffer
  let tileIdx = 0;
  // Expand 1bpp to 4bpp
  for (let i = 0; i < 32; i++) {
    const footprintPixel = footprint[i];
    for (let j = 0; j < 8 / 2; j++) {
      let footprintTile = 0;
      if (footprintPixel & (1 << (j * 2))) footprintTile |= 0x01;
      if (footprintPixel & (2 << (j * 2))) footprintTile |= 0x10;
      buffer[tileIdx] = footprintTile;
      tileIdx++;
    }
  }
  BlitBitmapRectToWindow(windowId, buffer, 0, 0, 16, 16, x, y, 16, 16);
}

function DexScreen_DrawMonDexPage(justRegistered: boolean): number {
  const d = sPokedexScreenData;
  DexScreen_DexPageZoomEffectFrame(3, 6);
  FillBgTilemapBufferRect_Palette0(2, 0, 0, 0, 30, 20);
  FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 30, 20);
  FillBgTilemapBufferRect_Palette0(0, 0, 0, 2, 30, 16);

  d.windowIds[0] = AddWindow(win("sWindowTemplate_DexEntry_MonPic"));
  d.windowIds[1] = AddWindow(win("sWindowTemplate_DexEntry_SpeciesStats"));
  d.windowIds[2] = AddWindow(win("sWindowTemplate_DexEntry_FlavorText"));

  // Mon pic
  FillWindowPixelBuffer(d.windowIds[0], PIXEL_FILL(0));
  DexScreen_LoadMonPicInWindow(d.windowIds[0], d.dexSpecies, 144);
  PutWindowTilemap(d.windowIds[0]);
  CopyWindowToVram(d.windowIds[0], COPYWIN_GFX);

  // Species stats
  FillWindowPixelBuffer(d.windowIds[1], PIXEL_FILL(0));
  DexScreen_PrintMonDexNo(d.windowIds[1], FONT_SMALL, d.dexSpecies, 0, 8);
  DexScreen_AddTextPrinterParameterized(d.windowIds[1], FONT_NORMAL, speciesName(d.dexSpecies), 28, 8, 0);
  DexScreen_PrintMonCategory(d.windowIds[1], d.dexSpecies, 0, 24);
  DexScreen_PrintMonHeight(d.windowIds[1], d.dexSpecies, 0, 36);
  DexScreen_PrintMonWeight(d.windowIds[1], d.dexSpecies, 0, 48);
  DexScreen_DrawMonFootprint(d.windowIds[1], d.dexSpecies, 88, 40);
  PutWindowTilemap(d.windowIds[1]);
  CopyWindowToVram(d.windowIds[1], COPYWIN_GFX);

  // Dex entry
  FillWindowPixelBuffer(d.windowIds[2], PIXEL_FILL(0));
  DexScreen_PrintMonFlavorText(d.windowIds[2], d.dexSpecies, 0, 8);
  PutWindowTilemap(d.windowIds[2]);
  CopyWindowToVram(d.windowIds[2], COPYWIN_GFX);

  // Control info
  FillWindowPixelBuffer(1, PIXEL_FILL(15));
  if (justRegistered === false) {
    DexScreen_AddTextPrinterParameterized(1, FONT_SMALL, txt("gText_Cry"), 8, 2, 4);
    DexScreen_PrintControlInfo(txt("gText_NextDataCancel"));
  } else {
    // Just registered
    DexScreen_PrintControlInfo(txt("gText_Next"));
  }
  PutWindowTilemap(1);
  CopyWindowToVram(1, COPYWIN_GFX);
  return 1;
}

export function RemoveDexPageWindows(): number {
  const d = sPokedexScreenData;
  d.windowIds[0] = DexScreen_RemoveWindow(d.windowIds[0]);
  d.windowIds[1] = DexScreen_RemoveWindow(d.windowIds[1]);
  d.windowIds[2] = DexScreen_RemoveWindow(d.windowIds[2]);
  return 0;
}

// ---------------------------------------------------------------- area page

export function DexScreen_DrawMonAreaPage(): number {
  const d = sPokedexScreenData;
  const species = d.dexSpecies;
  const speciesId = SpeciesToNationalPokedexNum(species);
  const monIsCaught = DexScreen_GetSetPokedexFlag(species, C.FLAG_GET_CAUGHT, true);
  let width = 28;
  let height = 14;
  let left = 0;
  let top = 2;

  FillBgTilemapBufferRect_Palette0(3, 4, left, top, 1, 1);
  FillBgTilemapBufferRect_Palette0(3, BG_TILE_H_FLIP(4), left + 1 + width, top, 1, 1);
  FillBgTilemapBufferRect_Palette0(3, BG_TILE_V_FLIP(4), left, top + 1 + height, 1, 1);
  FillBgTilemapBufferRect_Palette0(3, BG_TILE_H_V_FLIP(4), left + 1 + width, top + 1 + height, 1, 1);
  FillBgTilemapBufferRect_Palette0(3, 5, left + 1, top, width, 1);
  FillBgTilemapBufferRect_Palette0(3, BG_TILE_V_FLIP(5), left + 1, top + 1 + height, width, 1);
  FillBgTilemapBufferRect_Palette0(3, 6, left, top + 1, 1, height);
  FillBgTilemapBufferRect_Palette0(3, BG_TILE_H_FLIP(6), left + 1 + width, top + 1, 1, height);
  FillBgTilemapBufferRect_Palette0(3, 1, left + 1, top + 1, width, height);
  FillBgTilemapBufferRect_Palette0(0, 0, 0, 2, 30, 16);

  width = 10;
  height = 6;
  left = 1;
  top = 9;

  FillBgTilemapBufferRect_Palette0(0, 29, left, top, 1, 1);
  FillBgTilemapBufferRect_Palette0(0, BG_TILE_H_FLIP(29), left + 1 + width, top, 1, 1);
  FillBgTilemapBufferRect_Palette0(0, BG_TILE_V_FLIP(29), left, top + 1 + height, 1, 1);
  FillBgTilemapBufferRect_Palette0(0, BG_TILE_H_V_FLIP(29), left + 1 + width, top + 1 + height, 1, 1);
  FillBgTilemapBufferRect_Palette0(0, 30, left + 1, top, width, 1);
  FillBgTilemapBufferRect_Palette0(0, BG_TILE_V_FLIP(30), left + 1, top + 1 + height, width, 1);
  FillBgTilemapBufferRect_Palette0(0, 31, left, top + 1, 1, height);
  FillBgTilemapBufferRect_Palette0(0, BG_TILE_H_FLIP(31), left + 1 + width, top + 1, 1, height);
  FillBgTilemapBufferRect_Palette0(2, 0, 0, 0, 30, 20);
  FillBgTilemapBufferRect_Palette0(1, 0, 0, 0, 30, 20);

  d.unlockedSeviiAreas = GetUnlockedSeviiAreas();
  let kantoMapVoff = 4;
  // If any of the postgame islands are unlocked, Kanto map needs to be flush with the
  // top of the screen.
  for (let i = 3; i < 7; i++) if ((d.unlockedSeviiAreas >> i) & 1) kantoMapVoff = 0;

  d.windowIds[0] = AddWindow(win("sWindowTemplate_AreaMap_Kanto"));
  CopyToWindowPixelBuffer(d.windowIds[0], incbin("sTilemap_AreaMap_Kanto"), 0, 0);
  SetWindowAttribute(d.windowIds[0], WINDOW_TILEMAP_TOP, GetWindowAttribute(d.windowIds[0], WINDOW_TILEMAP_TOP) + kantoMapVoff);
  PutWindowTilemap(d.windowIds[0]);
  const islands = rd<Array<[SymRef, SymRef]>>("sAreaMapStructs_SeviiIslands");
  for (let i = 0; i < 7; i++) {
    if ((d.unlockedSeviiAreas >> i) & 1) {
      d.windowIds[i + 1] = AddWindow(win(symName(islands[i][0])!));
      CopyToWindowPixelBuffer(d.windowIds[i + 1], incbin(symName(islands[i][1])!), 0, 0);
      SetWindowAttribute(d.windowIds[i + 1], WINDOW_TILEMAP_TOP, GetWindowAttribute(d.windowIds[i + 1], WINDOW_TILEMAP_TOP) + kantoMapVoff);
      PutWindowTilemap(d.windowIds[i + 1]);
      CopyWindowToVram(d.windowIds[i + 1], COPYWIN_GFX);
    }
  }
  d.windowIds[8] = AddWindow(win("sWindowTemplate_AreaMap_SpeciesName"));
  d.windowIds[9] = AddWindow(win("sWindowTemplate_AreaMap_Size"));
  d.windowIds[10] = AddWindow(win("sWindowTemplate_AreaMap_Area"));
  d.windowIds[11] = AddWindow(win("sWindowTemplate_AreaMap_MonIcon"));
  d.windowIds[12] = AddWindow(win("sWindowTemplate_AreaMap_MonTypes"));

  // Draw the mon icon
  FillWindowPixelBuffer(d.windowIds[11], PIXEL_FILL(0));
  LoadPalette(GetValidMonIconPalettePtr(species), BG_PLTT_ID(10), PLTT_SIZE_4BPP); // ListMenu_LoadMonIconPalette
  ListMenu_DrawMonIconGraphics(d.windowIds[11], GetMonIconPtr(species, DexScreen_GetDefaultPersonality(species), 1), 0, 0);
  PutWindowTilemap(d.windowIds[11]);
  CopyWindowToVram(d.windowIds[11], COPYWIN_GFX);

  // Print "Size"
  FillWindowPixelBuffer(d.windowIds[9], PIXEL_FILL(0));
  {
    const sizeText = txt("gText_Size");
    const strWidth = stringWidth(FONT_SMALL, sizeText, 0);
    DexScreen_AddTextPrinterParameterized(d.windowIds[9], FONT_SMALL, sizeText, Math.trunc((win("sWindowTemplate_AreaMap_Size").width * 8 - strWidth) / 2), 4, 0);
  }
  PutWindowTilemap(d.windowIds[9]);
  CopyWindowToVram(d.windowIds[9], COPYWIN_GFX);

  // Print "Area"
  FillWindowPixelBuffer(d.windowIds[10], PIXEL_FILL(0));
  {
    const areaText = txt("gText_Area");
    const strWidth = stringWidth(FONT_SMALL, areaText, 0);
    DexScreen_AddTextPrinterParameterized(d.windowIds[10], FONT_SMALL, areaText, Math.trunc((win("sWindowTemplate_AreaMap_Area").width * 8 - strWidth) / 2), 4, 0);
  }
  SetWindowAttribute(d.windowIds[10], WINDOW_TILEMAP_TOP, GetWindowAttribute(d.windowIds[10], WINDOW_TILEMAP_TOP) + kantoMapVoff);
  PutWindowTilemap(d.windowIds[10]);
  CopyWindowToVram(d.windowIds[10], COPYWIN_GFX);

  // Print species name
  FillWindowPixelBuffer(d.windowIds[8], PIXEL_FILL(0));
  DexScreen_PrintMonDexNo(d.windowIds[8], FONT_SMALL, species, 0, 0);
  DexScreen_AddTextPrinterParameterized(d.windowIds[8], FONT_NORMAL, speciesName(species), 3, 12, 0);
  PutWindowTilemap(d.windowIds[8]);
  CopyWindowToVram(d.windowIds[8], COPYWIN_GFX);

  // Type icons
  FillWindowPixelBuffer(d.windowIds[12], PIXEL_FILL(0));
  ListMenuLoadStdPalAt(BG_PLTT_ID(11), 1);

  if (monIsCaught) {
    const types = rom.species[species].types;
    BlitMenuInfoIcon(d.windowIds[12], 1 + types[0], 0, 1);
    if (types[0] !== types[1]) BlitMenuInfoIcon(d.windowIds[12], 1 + types[1], 32, 1);
  }
  PutWindowTilemap(d.windowIds[12]);
  CopyWindowToVram(d.windowIds[12], COPYWIN_GFX);

  // Show size comparison
  ResetAllPicSprites();
  LoadPalette(incbin16("sPalette_Silhouette"), OBJ_PLTT_ID(2), PLTT_SIZE_4BPP);

  if (monIsCaught) {
    const entry = gPokedexEntries()[speciesId];
    d.windowIds[14] = CreateMonPicSprite_HandleDeoxys(species, C.SHINY_ODDS, DexScreen_GetDefaultPersonality(species), true, 40, 104, 0, 0xffff) & 0xff;
    const monSprite = gSprites[d.windowIds[14]];
    monSprite.oam.paletteNum = 2;
    monSprite.oam.affineMode = ST_OAM_AFFINE_NORMAL;
    monSprite.oam.matrixNum = 2;
    monSprite.oam.priority = 1;
    monSprite.y2 = entry.pokemonOffset;
    SetOamMatrix(2, entry.pokemonScale, 0, 0, entry.pokemonScale);
    d.windowIds[15] = CreateTrainerPicSprite(PlayerGenderToFrontTrainerPicId(save.playerGender, true), true, 80, 104, 0, 0xffff) & 0xff;
    const trainerSprite = gSprites[d.windowIds[15]];
    trainerSprite.oam.paletteNum = 2;
    trainerSprite.oam.affineMode = ST_OAM_AFFINE_NORMAL;
    trainerSprite.oam.matrixNum = 1;
    trainerSprite.oam.priority = 1;
    trainerSprite.y2 = entry.trainerOffset;
    SetOamMatrix(1, entry.trainerScale, 0, 0, entry.trainerScale);
  } else {
    d.windowIds[14] = 0xff;
    d.windowIds[15] = 0xff;
  }

  // Create the area markers
  d.areaMarkersTaskId = CreatePokedexAreaMarkers(species, TAG_AREA_MARKERS, 3, kantoMapVoff * 8);
  if (GetNumPokedexAreaMarkers(d.areaMarkersTaskId) === 0) {
    // No markers, display "Area Unknown"
    BlitBitmapRectToWindow(d.windowIds[0], incbin("sBlitTiles_WideEllipse"), 0, 0, 88, 16, 4, 28, 88, 16);
    const areaUnknown = txt("gText_AreaUnknown");
    const strWidth = stringWidth(FONT_SMALL, areaUnknown, 0);
    DexScreen_AddTextPrinterParameterized(d.windowIds[0], FONT_SMALL, areaUnknown, Math.trunc((96 - strWidth) / 2), 29, 0);
  }
  CopyWindowToVram(d.windowIds[0], COPYWIN_GFX);

  // Draw the control info
  FillWindowPixelBuffer(1, PIXEL_FILL(15));
  DexScreen_AddTextPrinterParameterized(1, FONT_SMALL, txt("gText_Cry"), 8, 2, 4);
  DexScreen_PrintControlInfo(txt("gText_CancelPreviousData"));
  PutWindowTilemap(1);
  CopyWindowToVram(1, COPYWIN_GFX);
  return 1;
}

export function DexScreen_DestroyAreaScreenResources(): number {
  const d = sPokedexScreenData;
  DestroyPokedexAreaMarkers(d.areaMarkersTaskId);
  for (let i = 0; i < 13; i++) d.windowIds[i] = DexScreen_RemoveWindow(d.windowIds[i]);
  if (d.windowIds[15] !== 0xff) FreeAndDestroyTrainerPicSprite(d.windowIds[15]);
  if (d.windowIds[14] !== 0xff) FreeAndDestroyMonPicSprite(d.windowIds[14]);
  return 0;
}

// ---------------------------------------------------------------- categories

function DexScreen_CanShowMonInDex(species: number): boolean {
  if (IsNationalPokedexEnabled() === true) return true;
  if (SpeciesToNationalPokedexNum(species) <= C.KANTO_DEX_COUNT) return true;
  return false;
}

function DexScreen_IsPageUnlocked(categoryNum: number, pageNum: number): boolean {
  const page = gDexCategories()[categoryNum].page[pageNum];
  const count = page.count;
  for (let i = 0; i < 4; i++) {
    if (i < count) {
      const species = page.species[i];
      if (DexScreen_CanShowMonInDex(species) === true && DexScreen_GetSetPokedexFlag(species, C.FLAG_GET_SEEN, true)) return true;
    }
  }
  return false;
}

function DexScreen_IsCategoryUnlocked(categoryNum: number): boolean {
  const count = gDexCategories()[categoryNum].count;
  for (let i = 0; i < count; i++) if (DexScreen_IsPageUnlocked(categoryNum, i)) return true;
  return false;
}

export function DexScreen_CreateCategoryPageSpeciesList(categoryNum: number, pageNum: number): void {
  const d = sPokedexScreenData;
  const page = gDexCategories()[categoryNum].page[pageNum];
  const count = page.count;
  d.numMonsOnPage = 0;
  for (let i = 0; i < 4; i++) d.pageSpecies[i] = 0xffff;
  for (let i = 0; i < count; i++) {
    const species = page.species[i];
    if (DexScreen_CanShowMonInDex(species) === true && DexScreen_GetSetPokedexFlag(species, C.FLAG_GET_SEEN, true)) {
      d.pageSpecies[d.numMonsOnPage] = page.species[i];
      d.numMonsOnPage++;
    }
  }
}

function DexScreen_GetPageLimitsForCategory(category: number): boolean {
  const d = sPokedexScreenData;
  const count = gDexCategories()[category].count;
  let firstPage = 0xff;
  let lastPage = 0xff;
  for (let i = 0; i < count; i++) {
    if (DexScreen_IsPageUnlocked(category, i)) {
      if (firstPage === 0xff) firstPage = i;
      lastPage = i;
    }
  }
  if (lastPage !== 0xff) {
    d.firstPageInCategory = firstPage;
    d.lastPageInCategory = lastPage + 1;
    return false;
  } else {
    d.firstPageInCategory = 0;
    d.lastPageInCategory = 0;
    return true;
  }
}

function DexScreen_LookUpCategoryBySpecies(species: number): boolean {
  const d = sPokedexScreenData;
  const categories = gDexCategories();
  for (let i = 0; i < categories.length; i++) {
    const categoryCount = categories[i].count;
    for (let j = 0; j < categoryCount; j++) {
      const page = categories[i].page[j];
      for (let k = 0, posInPage = 0; k < page.count; k++) {
        const dexSpecies = page.species[k];
        if (species === dexSpecies) {
          d.category = i;
          d.pageNum = j;
          d.categoryCursorPosInPage = posInPage;
          return false;
        }
        if (DexScreen_CanShowMonInDex(dexSpecies) === true && DexScreen_GetSetPokedexFlag(dexSpecies, C.FLAG_GET_SEEN, true)) posInPage++;
      }
    }
  }
  return true;
}

function DexScreen_PageNumberToRenderablePages(page: number): number {
  let count = 0;
  for (let i = 0; i < page; i++) if (DexScreen_IsPageUnlocked(sPokedexScreenData.category, i)) count++;
  return count + 1;
}

function PlayCry_NormalNoDucking(species: number): void {
  sound.playCry(species, 0);
}

function DexScreen_InputHandler_StartToCry(): void {
  if (joy.newKeys & START_BUTTON) PlayCry_NormalNoDucking(sPokedexScreenData.dexSpecies);
}

// ---------------------------------------------------------------- registration after a capture

/** Called by the battle's displaydexinfo; returns the task to wait on. Needs preloadPokedexScreen first. */
export function DexScreen_RegisterMonToPokedex(species: number): number {
  DexScreen_GetSetPokedexFlag(species, C.FLAG_SET_SEEN, true);
  DexScreen_GetSetPokedexFlag(species, C.FLAG_SET_CAUGHT, true);

  if (!IsNationalPokedexEnabled() && SpeciesToNationalPokedexNum(species) > C.KANTO_DEX_COUNT)
    return tasks.create(Task_DexScreen_RegisterNonKantoMonBeforeNationalDex, 0);

  DexScreen_LoadResources();
  tasks.tasks[sPokedexScreenData.taskId].func = Task_DexScreen_RegisterMonToPokedex;
  DexScreen_LookUpCategoryBySpecies(species);
  return sPokedexScreenData.taskId;
}

function Task_DexScreen_RegisterNonKantoMonBeforeNationalDex(taskId: number): void {
  tasks.destroy(taskId);
}

function Task_DexScreen_RegisterMonToPokedex(taskId: number): void {
  const d = sPokedexScreenData;
  switch (d.state) {
    case 0:
      DexScreen_GetPageLimitsForCategory(d.category);
      if (d.pageNum < d.firstPageInCategory) d.pageNum = d.firstPageInCategory;
      d.state = 3;
      break;
    case 1:
      RemoveDexPageWindows();
      DexScreen_DestroyCategoryPageMonIconAndInfoWindows();
      gMain.state = 0;
      d.state = 2;
      break;
    case 2:
      if (DoClosePokedex()) tasks.destroy(taskId);
      break;
    case 3:
      DexScreen_CreateCategoryListGfx(true);
      PutWindowTilemap(0);
      PutWindowTilemap(1);
      CopyBgTilemapBufferToVram(3);
      CopyBgTilemapBufferToVram(2);
      CopyBgTilemapBufferToVram(1);
      CopyBgTilemapBufferToVram(0);
      DexScreen_CreateCategoryPageSelectionCursor(0xff);
      d.state = 4;
      break;
    case 4:
      gPaletteFade.bufferTransferDisabled = false;
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, 0xffff);
      ShowBg(3);
      ShowBg(2);
      ShowBg(1);
      ShowBg(0);
      d.state = 5;
      break;
    case 5:
      tasks.tasks[taskId].data[0] = 30;
      d.categoryPageCursorTaskId = ListMenuAddCursorObjectInternal(rd<CursorStruct>("sCursorStruct_CategoryPage"), 0);
      d.state = 6;
      break;
    case 6:
      DexScreen_CreateCategoryPageSelectionCursor(d.categoryCursorPosInPage);
      DexScreen_UpdateCategoryPageCursorObject(d.categoryPageCursorTaskId, d.categoryCursorPosInPage, d.numMonsOnPage);
      if (tasks.tasks[taskId].data[0]) {
        tasks.tasks[taskId].data[0]--;
      } else {
        ListMenuRemoveCursorObject(d.categoryPageCursorTaskId, 0);
        d.state = 7;
      }
      break;
    case 7:
      d.dexSpecies = d.pageSpecies[d.categoryCursorPosInPage];
      d.state = 8;
      break;
    case 8:
      DexScreen_DrawMonDexPage(true);
      d.state = 9;
      break;
    case 9:
      d.data[0] = 0;
      d.data[1] = 0;
      d.state++;
    // fallthrough
    case 10:
      if (d.data[1] < 6) {
        if (d.data[0]) {
          DexScreen_DexPageZoomEffectFrame(0, d.data[1]);
          CopyBgTilemapBufferToVram(0);
          d.data[0] = 4;
          d.data[1]++;
        } else {
          d.data[0] = (d.data[0] - 1) & 0xff;
        }
      } else {
        FillBgTilemapBufferRect_Palette0(0, 0, 0, 2, 30, 16);
        CopyBgTilemapBufferToVram(3);
        CopyBgTilemapBufferToVram(2);
        CopyBgTilemapBufferToVram(1);
        CopyBgTilemapBufferToVram(0);
        PlayCry_NormalNoDucking(d.dexSpecies);
        d.data[0] = 0;
        d.state = 11;
      }
      break;
    case 11:
      if (joy.newKeys & (A_BUTTON | B_BUTTON)) d.state = 2;
      break;
  }
}

export function DexScreen_PrintStringWithAlignment(str: ArrayLike<number>, mode: number): void {
  let x: number;
  switch (mode) {
    case TEXT_LEFT:
      x = 8;
      break;
    case TEXT_CENTER:
      x = ((240 - stringWidth(FONT_NORMAL, str, 0)) >>> 0) / 2;
      break;
    case TEXT_RIGHT:
    default:
      x = 232 - stringWidth(FONT_NORMAL, str, 0);
      break;
  }
  DexScreen_AddTextPrinterParameterized(0, FONT_NORMAL, str, Math.trunc(x), 2, 4);
}
