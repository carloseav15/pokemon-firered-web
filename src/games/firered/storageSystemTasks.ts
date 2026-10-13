// pokemon_storage_system_tasks.c: EnterPokeStorage, the Task_* state machines of the box screen, the display-mon panel,
// the party menu slide, the close-box button, the messages and the quest log events.
import { sound } from "./audio/sound";
import * as C from "./generated/constants";
import { addBagItem, removeBagItem } from "./pokemon/items";
import { StringCopy } from "./generated/stringUtil";
import { CHAR_SPACE, EOS } from "./gba/charmap";
import { FONT_NORMAL, FONT_NORMAL_COPY_1, FONT_SMALL } from "./gba/font";
import { A_BUTTON, B_BUTTON, DPAD_ANY, joy, JOY_NEW } from "./gba/input";
import { tasks } from "./gba/tasks";
import { TEXT_SKIP_DRAW } from "./gba/textPrinter";
import { cdata, incbin, incbin16, loadCData, preloadPacks, symName } from "./hw/assets";
import {
  BG_COORD_ADD, BG_COORD_SUB, type BgTemplate, ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, FillBgTilemapBufferRect,
  FillBgTilemapBufferRect_Palette0, InitBgsFromTemplates, IsDma3ManagerBusyWithBgCopy, LoadBgTiles, SetBgTilemapBuffer, ShowBg,
} from "./hw/bg";
import { templateFrom, type CSpriteTemplate } from "./hw/cdataSprite";
import { SetGpuReg } from "./hw/gpu";
import {
  ClearStdWindowAndFrameToTransparent, CreateYesNoMenu, LoadStdWindowGfx, LoadUserWindowGfx, MENU_B_PRESSED, MENU_NOTHING_CHOSEN,
  Menu_MoveCursorNoWrapAround, Menu_ProcessInputNoWrapClearOnChoose,
} from "./hw/menu";
import { ClearScheduledBgCopiesToVram, DoScheduledBgTilemapCopiesToVram, DrawTextBorderOuter, ScheduleBgCopyTilemapToVram } from "./hw/menuHelpers";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalettes, LoadPalette, OBJ_PLTT_ID, PALETTES_ALL, PLTT_SIZE_4BPP, RGB_BLACK, ResetPaletteFade,
  TransferPlttBuffer, UpdatePaletteFade,
} from "./hw/palette";
import {
  ppu, REG_OFFSET_BG0CNT, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BG1CNT, REG_OFFSET_BG1HOFS,
  REG_OFFSET_BG1VOFS, REG_OFFSET_BG2HOFS, REG_OFFSET_BG2VOFS, REG_OFFSET_BG3CNT, REG_OFFSET_BG3HOFS, REG_OFFSET_BG3VOFS,
  REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_DISPCNT, REG_OFFSET_MOSAIC,
} from "./hw/ppu";
import { SetMainCallback2, SetVBlankCallback } from "./hw/runtime";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, FreeAllSpritePalettes, FreeSpritePaletteByTag, FreeSpriteTileRanges, FreeSpriteTilesByTag,
  gSprites, LoadOam, LoadSpritePalette, LoadSpriteSheet, MAX_SPRITES, ProcessSpriteCopyRequests, ResetSpriteData, SpriteCallbackDummy,
  spriteState, StartSpriteAnim, StartSpriteAnimIfDifferent, GetSpriteTileStartByTag, type Sprite,
} from "./hw/sprite";
import { TilemapUtil_Free, TilemapUtil_Init, TilemapUtil_Move, TilemapUtil_SetPos, TilemapUtil_SetRect, TilemapUtil_SetTilemap, TilemapUtil_Update } from "./hw/tilemapUtil";
import { AddTextPrinterParameterized, DeactivateAllTextPrinters } from "./hw/text";
import {
  ClearWindowTilemap, COPYWIN_GFX, CopyWindowToVram, FillWindowPixelBuffer, FreeAllWindowBuffers, InitWindows, PIXEL_FILL, PutWindowTilemap, type WindowTemplate,
} from "./hw/window";
import { ResetBgsAndClearDma3BusyFlags } from "./hw/bg";
import { DynamicPlaceholderTextUtil_ExpandPlaceholders, DynamicPlaceholderTextUtil_Reset, DynamicPlaceholderTextUtil_SetPlaceholderPtr } from "./dynamicPlaceholderTextUtil";
import { GoToBagMenu } from "./bagMenu";
import { SetHelpContext } from "./helpSystem";
import { CreateMonMarkingsMenu, BufferMonMarkingsMenuTiles, CreateMonMarkingComboSprite, FreeMonMarkingsMenu, HandleMonMarkingsMenuInput, InitMonMarkingsMenu, OpenMonMarkingsMenu, UpdateMonMarkingTiles } from "./monMarkings";
import { DoNamingScreen } from "./namingScreen";
import { BeginPCScreenEffect_TurnOff, BeginPCScreenEffect_TurnOn, IsPCScreenEffectRunning_TurnOff, IsPCScreenEffectRunning_TurnOn } from "./pcScreenEffect";
import { GetMonData, SetMonData, zeroMon } from "./pokemon/mon";
import { isMailItem as ItemIsMail } from "./pokemon/mail";
import { LoadSpecialPokePic } from "./pokemon/pics";
import { GetBoxNamePtr, GetCurrentBoxMonData, SetCurrentBox, SetCurrentBoxMonData, StorageGetCurrentBox } from "./pokemon/storage";
import { ShowPokemonSummaryScreen } from "./pokemonSummaryScreen";
import { SetQuestLogEvent } from "./questLogEvents";
import { rom } from "./rom";
import { bagResult } from "./bagMenu";
import { flagClear, varSet } from "./save";
import {
  BOXID_CANCELED, BOXID_NONE_CHOSEN, CHANGE_GRAB, CHANGE_PLACE, CHANGE_SHIFT, CURSOR_ANIM_BOUNCE, CURSOR_ANIM_FIST, CURSOR_ANIM_OPEN,
  CURSOR_AREA_IN_BOX, CURSOR_AREA_IN_PARTY, gS, GFXTAG_CHOOSE_BOX_MENU_CENTER, GFXTAG_DISPLAY_MON, GFXTAG_MARKING_COMBO,
  GFXTAG_MARKING_MENU, GFXTAG_WAVEFORM, INPUT_BOX_OPTIONS, INPUT_CLOSE_BOX, INPUT_DEPOSIT, INPUT_GIVE_ITEM, INPUT_HIDE_PARTY,
  INPUT_IN_MENU, INPUT_MOVE_CURSOR, INPUT_MOVE_MON, INPUT_MULTIMOVE_CHANGE_SELECTION, INPUT_MULTIMOVE_GRAB_SELECTION,
  INPUT_MULTIMOVE_MOVE_MONS, INPUT_MULTIMOVE_PLACE_MONS, INPUT_MULTIMOVE_SINGLE, INPUT_MULTIMOVE_START, INPUT_MULTIMOVE_UNABLE,
  INPUT_PLACE_MON, INPUT_PRESSED_B, INPUT_SCROLL_LEFT, INPUT_SCROLL_RIGHT, INPUT_SHIFT_MON, INPUT_SHOW_PARTY, INPUT_SWITCH_ITEMS,
  INPUT_TAKE_ITEM, INPUT_WITHDRAW, LoadPartySlots, MENU_TEXT_BAG, MENU_TEXT_CANCEL, MENU_TEXT_CITY, MENU_TEXT_ETCETERA, MENU_TEXT_FOREST,
  MENU_TEXT_GIVE, MENU_TEXT_GIVE2, MENU_TEXT_INFO, MENU_TEXT_JUMP, MENU_TEXT_MARK, MENU_TEXT_MOVE, MENU_TEXT_NAME, MENU_TEXT_PLACE,
  MENU_TEXT_RELEASE, MENU_TEXT_SCENERY_1, MENU_TEXT_SCENERY_2, MENU_TEXT_SCENERY_3, MENU_TEXT_SHIFT, MENU_TEXT_STORE, MENU_TEXT_SUMMARY,
  MENU_TEXT_SWITCH, MENU_TEXT_TAKE, MENU_TEXT_WALLPAPER, MENU_TEXT_WITHDRAW, MODE_MOVE, MULTIMOVE_CHANGE_SELECTION,
  MULTIMOVE_GRAB_SELECTION, MULTIMOVE_MOVE_MONS, MULTIMOVE_PLACE_MONS, MULTIMOVE_SINGLE, MULTIMOVE_START, OPTION_DEPOSIT,
  OPTION_MOVE_ITEMS, OPTION_MOVE_MONS, PALTAG_DISPLAY_MON, PALTAG_MARKING_COMBO, PALTAG_MARKING_MENU, PALTAG_MISC_1, PALTAG_MISC_2,
  PARTY_SIZE, RELEASE_MON_ALLOWED, RELEASE_MON_NOT_ALLOWED, sParty, stState, StorePartySlots, TOTAL_BOXES_COUNT, type PokemonStorageSystemData,
} from "./storageSystemInternal";
import {
  AddMenu, CanMovePartyMon, CanShiftMon, ClearSavedCursorPos, CompactPartySlots, DoMonPlaceChange, DoTrySetDisplayMonData,
  GetBoxCursorPosition, GetMovingMonOriginalBoxId, GetSavedCursorPos, HandleInput, HandleMenuInput, InitCanReleaseMonVars,
  InitCursor, InitCursorOnReopen, InitMenu, InitMonPlaceChange, InitReleaseMon, InitSummaryScreenData, IsCursorOnBoxTitle,
  IsCursorOnCloseBox, IsMenuLoading, IsMonBeingMoved, LoadSavedMovingMon, ReleaseMon, RemoveMenu, ResetSelectionAfterDeposit, RunCanReleaseMon,
  SaveCursorPos, SaveMovingMon, SetCursorBoxPosition, SetCursorInParty, SetMenuText, SetMonMarkings, SetSelectionAfterSummaryScreen,
  StartCursorAnim, TryHideItemAtCursor, TryHideReleaseMon, TryShowItemAtCursor, TrySetCursorFistAnim, TryStorePartyMonInBox, UpdateCursorPos,
} from "./storageSystemData";
import {
  AnimateBoxScrollArrows, CompactPartySprites, CreateInitBoxTask, CreatePartyMonsSprites, DestroyAllPartyMonIcons, DoReleaseMonComeBackAnim,
  DoWallpaperGfxChange, GetNumPartySpritesCompacting, InitMonIconFields, IsInitBoxActive, MovePartySprites, ResetReleaseMonSpritePtr,
  ScrollToBox, SetMovingMonPriority, SetUpScrollToBox, SetWallpaperForCurrentBox,
} from "./storageSystemGraphics";
import {
  CreateItemIconSprites, GetMovingItem, GetMovingItemName, InitItemIconInCursor, InitItemInfoWindow, IsActiveItemMoving, IsItemIconAnimActive,
  Item_FromMonToMoving, Item_GiveMovingToMon, Item_SwitchMonsWithMoving, Item_TakeMons, MoveHeldItemWithPartyMenu, MoveItemFromCursorToBag,
  MultiMove_Free, MultiMove_Init, MultiMove_RunFunction, MultiMove_SetFunction, PrintItemDescription, TryLoadItemIconAtPos,
  UnkUtil_Init, UnkUtil_Run, UpdateItemInfoWindowSlideIn, UpdateItemInfoWindowSlideOut,
  type UnkUtil, type UnkUtilData,
} from "./storageSystemMisc";
import {
  CB2_ExitPokeStorage, CreateChooseBoxMenuSprites, DestroyChooseBoxMenuSprites, FreeBoxSelectionPopupSpriteGfx, HandleBoxChooseSelectionInput,
  LoadChooseBoxMenuGfx,
} from "./menus/storageMenu";

const F = "pokemon_storage_system_tasks";
const sc = <T>(name: string): T => cdata<T>(F, name);
const tbin = (name: string): Uint8Array => incbin(`${F}.c:${name}`);
const tbin16 = (name: string): Uint16Array => incbin16(`${F}.c:${name}`);
const PlaySE = (song: number): void => sound.playSE(song);
const OBJ_VRAM0 = 0x10000;
const BG_SCREEN_ADDR = (n: number): number => n * 0x800;

let sInPartyMenu = false;
let sCurrentBoxOption = 0;
let sDepositBoxId = 0;
let sWhichToReshow = 0;
let sLastUsedBox = 0;
let sMovingItemId: number = C.ITEM_NONE;

const TILEMAP_PKMN_DATA = 0; // The "Pkmn Data" text at the top of the display
const TILEMAP_PARTY_MENU = 1;
const TILEMAP_CLOSE_BUTTON = 2;
const TILEMAP_COUNT = 3;

const SCREEN_CHANGE_EXIT_BOX = 0;
const SCREEN_CHANGE_SUMMARY_SCREEN = 1;
const SCREEN_CHANGE_NAME_BOX = 2;
const SCREEN_CHANGE_ITEM_FROM_BAG = 3;

const MSG_EXIT_BOX = 0;
const MSG_WHAT_YOU_DO = 1;
const MSG_PICK_A_THEME = 2;
const MSG_PICK_A_WALLPAPER = 3;
const MSG_IS_SELECTED = 4;
const MSG_JUMP_TO_WHICH_BOX = 5;
const MSG_DEPOSIT_IN_WHICH_BOX = 6;
const MSG_WAS_DEPOSITED = 7;
const MSG_BOX_IS_FULL = 8;
const MSG_RELEASE_POKE = 9;
const MSG_WAS_RELEASED = 10;
const MSG_BYE_BYE = 11;
const MSG_MARK_POKE = 12;
const MSG_LAST_POKE = 13;
const MSG_PARTY_FULL = 14;
const MSG_HOLDING_POKE = 15;
const MSG_WHICH_ONE_WILL_TAKE = 16;
const MSG_CANT_RELEASE_EGG = 17;
const MSG_CONTINUE_BOX = 18;
const MSG_CAME_BACK = 19;
const MSG_WORRIED = 20;
const MSG_SURPRISE = 21;
const MSG_PLEASE_REMOVE_MAIL = 22;
const MSG_IS_SELECTED2 = 23;
const MSG_GIVE_TO_MON = 24;
const MSG_PLACED_IN_BAG = 25;
const MSG_BAG_FULL = 26;
const MSG_PUT_IN_BAG = 27;
const MSG_ITEM_IS_HELD = 28;
const MSG_CHANGED_TO_ITEM = 29;
const MSG_CANT_STORE_MAIL = 30;

const MSG_FMT_NONE = 0;
const MSG_FMT_MON_NAME_1 = 1;
const MSG_FMT_MON_NAME_2 = 2;
const MSG_FMT_MON_NAME_3 = 3;
const MSG_FMT_RELEASE_MON_1 = 4;
const MSG_FMT_RELEASE_MON_2 = 5;
const MSG_FMT_RELEASE_MON_3 = 6;
const MSG_FMT_ITEM_NAME = 7;

/** Load the cdata and INCBIN packs the box screen reads. */
export async function preloadStorageSystem(): Promise<void> {
  await Promise.all([
    loadCData(
      "pokemon_storage_system_data", "pokemon_storage_system_graphics", "pokemon_storage_system_misc", "pokemon_storage_system_tasks",
      "pokemon_storage_system_menu", "mon_markings", "pokemon_icon", "graphics", "strings", "text_window_graphics", "trig", "tilemap_util",
    ).catch(() => loadCData(
      "pokemon_storage_system_data", "pokemon_storage_system_graphics", "pokemon_storage_system_misc", "pokemon_storage_system_tasks",
      "pokemon_storage_system_menu", "mon_markings", "pokemon_icon", "graphics", "strings", "text_window_graphics", "trig",
    )),
    preloadPacks(["graphics_pokemon_storage", "graphics_mon_markings", "graphics_text_window", "graphics_fonts", "graphics_interface", "graphics_items", "graphics_pokemon", "pokemon", "data"]).catch(() => undefined),
  ]);
}

/** A fresh PokemonStorageSystemData (the C Alloc zero-fills it). */
function NewStorageSystemData(): PokemonStorageSystemData {
  const nulls = <T>(n: number): Array<T | null> => new Array<T | null>(n).fill(null);
  return {
    state: 0, boxOption: 0, screenChangeType: 0, isReopening: false, taskId: 0,
    partyMenuTilemapBuffer: new Uint16Array(0x108), partyMenuY: 0, partyMenuMoveTimer: 0, showPartyMenuState: 0,
    closeBoxFlashing: false, closeBoxFlashTimer: 0, closeBoxFlashState: false, newCurrBoxId: 0, bg2_X: 0, scrollSpeed: 0, scrollTimer: 0,
    wallpaperOffset: 0, boxTitleTiles: new Uint8Array(512), boxTitleCycleId: 0, boxTitlePal: new Uint16Array(16), boxTitlePalOffset: 0,
    boxTitleAltPalOffset: 0, curBoxTitleSprites: nulls<Sprite>(2), nextBoxTitleSprites: nulls<Sprite>(2), arrowSprites: nulls<Sprite>(2),
    wallpaperPalBits: 0, wallpaperSetId: 0, wallpaperId: 0, wallpaperTilemap: new Uint16Array(360), wallpaperChangeState: 0, scrollState: 0,
    scrollToBoxId: 0, scrollDirection: 0, wallpaperLoadState: 0, wallpaperLoadBoxId: 0, wallpaperLoadDir: 0, movingMonSprite: null,
    partySprites: nulls<Sprite>(PARTY_SIZE), boxMonsSprites: nulls<Sprite>(C.IN_BOX_COUNT), shiftMonSpritePtr: null, releaseMonSpritePtr: null,
    numIconsPerSpecies: new Array(40).fill(0), iconSpeciesList: new Array(40).fill(0), boxSpecies: new Array(C.IN_BOX_COUNT).fill(0),
    boxPersonalities: new Array(C.IN_BOX_COUNT).fill(0), incomingBoxId: 0, shiftTimer: 0, numPartySpritesToCompact: 0, iconScrollDistance: 0,
    iconScrollPos: 0, iconScrollSpeed: 0, iconScrollNumIncoming: 0, iconScrollCurColumn: 0, iconScrollDirection: 0, iconScrollState: 0,
    iconScrollToBoxId: 0, menuWindow: { bg: 0, tilemapLeft: 0, tilemapTop: 0, width: 0, height: 0, paletteNum: 0, baseBlock: 0 },
    menuItems: Array.from({ length: 7 }, () => ({ text: new Uint8Array(0), textId: 0 })), menuItemsCount: 0, menuWidth: 0, menuWindowId: 0,
    cursorSprite: null, cursorShadowSprite: null, cursorNewX: 0, cursorNewY: 0, cursorSpeedX: 0, cursorSpeedY: 0, cursorTargetX: 0,
    cursorTargetY: 0, cursorMoveSteps: 0, cursorVerticalWrap: 0, cursorHorizontalWrap: 0, newCursorArea: 0, newCursorPosition: 0,
    cursorPrevPartyPos: 0, cursorFlipTimer: 0, cursorPalNums: [0, 0], displayMonPalette: null, displayMonPersonality: 0, displayMonSpecies: 0,
    displayMonItemId: 0, setMosaic: false, displayMonMarkings: 0, displayMonLevel: 0, displayMonIsEgg: false,
    displayMonNickname: new Uint8Array(C.POKEMON_NAME_LENGTH + 1).fill(EOS), displayMonTexts: Array.from({ length: 4 }, () => new Uint8Array(36).fill(EOS)),
    monPlaceChangeFunc: null, monPlaceChangeState: 0, shiftBoxId: 0, markingComboSprite: null, waveformSprites: nulls<Sprite>(2),
    markingComboTilesPtr: 0, markMenu: CreateMonMarkingsMenu(),
    chooseBoxMenu: {
      menuSprite: null, menuCornerSprites: nulls<Sprite>(4), arrowSprites: nulls<Sprite>(2), strbuf: new Uint8Array(20).fill(EOS),
      loadedPalette: false, tileTag: 0, paletteTag: 0, curBox: 0, subpriority: 0,
    },
    movingMon: zeroMon(), tempMon: zeroMon(), releaseMonStatus: 0, releaseMonStatusResolved: false, isSurfMon: false, isDiveMon: false,
    releaseCheckBoxId: 0, releaseCheckBoxPos: 0, releaseBoxId: 0, releaseBoxPos: 0, releaseCheckState: 0, restrictedMoveList: [0, 0, 0],
    summaryLastIndex: 0, summaryCursorPos: 0, summaryScreenMode: 0, summaryMons: [], actionText: new Uint8Array(40).fill(EOS),
    boxTitleText: new Uint8Array(40).fill(EOS), releaseMonName: new Uint8Array(C.POKEMON_NAME_LENGTH + 1).fill(EOS), itemName: new Uint8Array(20).fill(EOS),
    inBoxMovingMode: 0, multiMoveWindowId: 0,
    itemIcons: Array.from({ length: 3 }, () => ({ sprite: null, tiles: 0, palIndex: 0, cursorArea: 0, cursorPos: 0, active: false })),
    movingItemId: 0, itemInfoWindowOffset: 0, questLogData: { species1: 0, species2: 0, box1: 0, box2: 0 }, displayMonPalOffset: 0,
    displayMonTilePtr: 0, displayMonSprite: null, displayMonPalBuffer: new Uint16Array(0x20), tileBuffer: new Uint8Array(0x800),
    itemIconBuffer: new Uint8Array(0x200), wallpaperBgTilemapBuffer: new Uint16Array(0x800), menuTilemapBuffer: new Uint16Array(0x400),
  };
}

let sUnkUtil: UnkUtil = { data: [], max: 8, numActive: 0 };
const sUnkUtilData: UnkUtilData[] = Array.from({ length: 8 }, () => ({ size: 0, height: 0, unk: 0, func: () => {} }));

function VBlankCB_PokeStorage(): void {
  LoadOam();
  ProcessSpriteCopyRequests();
  UnkUtil_Run();
  TransferPlttBuffer();
  // gStorage is NULL between FreePokeStorageData and the next screen's VBlank callback; the C reads unmapped memory there.
  if (stState.gStorage) SetGpuReg(REG_OFFSET_BG2HOFS, stState.gStorage.bg2_X);
}

function CB2_PokeStorage(): void {
  tasks.run();
  // Task_ChangeScreen frees gStorage; the rest of this frame would read it through a null pointer (harmless on hardware).
  if (stState.gStorage === null) return;
  DoScheduledBgTilemapCopiesToVram();
  ScrollBackground();
  UpdateCloseBoxButtonFlash();
  AnimateSprites();
  BuildOamBuffer();
}

/** EnterPokeStorage */
export function EnterPokeStorage(boxOption: number): void {
  tasks.reset();
  sCurrentBoxOption = boxOption;
  LoadPartySlots();
  stState.gStorage = NewStorageSystemData();
  const g = gS();
  g.boxOption = boxOption;
  g.isReopening = false;
  sMovingItemId = 0;
  g.state = 0;
  g.taskId = tasks.create(Task_InitPokeStorage, 3);
  SetHelpContext(C.HELPCONTEXT_BILLS_PC);
  sLastUsedBox = StorageGetCurrentBox();
  SetMainCallback2(CB2_PokeStorage);
}

/** CB2_ReturnToPokeStorage */
export function CB2_ReturnToPokeStorage(): void {
  tasks.reset();
  stState.gStorage = NewStorageSystemData();
  const g = gS();
  g.boxOption = sCurrentBoxOption;
  g.isReopening = true;
  g.state = 0;
  g.taskId = tasks.create(Task_InitPokeStorage, 3);
  SetHelpContext(C.HELPCONTEXT_BILLS_PC);
  SetMainCallback2(CB2_PokeStorage);
}

function ResetAllBgCoords(): void {
  SetGpuReg(REG_OFFSET_BG0HOFS, 0);
  SetGpuReg(REG_OFFSET_BG0VOFS, 0);
  SetGpuReg(REG_OFFSET_BG1HOFS, 0);
  SetGpuReg(REG_OFFSET_BG1VOFS, 0);
  SetGpuReg(REG_OFFSET_BG2HOFS, 0);
  SetGpuReg(REG_OFFSET_BG2VOFS, 0);
  SetGpuReg(REG_OFFSET_BG3HOFS, 0);
  SetGpuReg(REG_OFFSET_BG3VOFS, 0);
}

function ResetForPokeStorage(): void {
  ResetPaletteFade();
  ResetSpriteData();
  FreeSpriteTileRanges();
  FreeAllSpritePalettes();
  // ClearDma3Requests: the browser backend performs DMA copies immediately.
  spriteState.gReservedSpriteTileCount = 0x280;
  sUnkUtil = { data: sUnkUtilData, max: sUnkUtilData.length, numActive: 0 };
  UnkUtil_Init(sUnkUtil, sUnkUtilData, sUnkUtilData.length);
  joy.repeatStartDelay = 20; // gKeyRepeatStartDelay
  ClearScheduledBgCopiesToVram();
  TilemapUtil_Init(TILEMAP_COUNT);
  TilemapUtil_SetTilemap(TILEMAP_PKMN_DATA, 1, tbin16("sPkmnData_Tilemap"), 8, 4);
  TilemapUtil_SetPos(TILEMAP_PKMN_DATA, 1, 0);
  gS().closeBoxFlashing = false;
}

function InitStartingPosData(): void {
  ClearSavedCursorPos();
  sInPartyMenu = gS().boxOption === OPTION_DEPOSIT;
  sDepositBoxId = 0;
}

function SetMonIconTransparency(): void {
  if (gS().boxOption === OPTION_MOVE_ITEMS) {
    SetGpuReg(REG_OFFSET_BLDCNT, 0x3f00); // BLDCNT_TGT2_ALL
    SetGpuReg(REG_OFFSET_BLDALPHA, 7 | (11 << 8)); // BLDALPHA_BLEND(7, 11)
  }
  // DISPCNT_OBJ_ON | DISPCNT_BG_ALL_ON | DISPCNT_OBJ_1D_MAP
  SetGpuReg(REG_OFFSET_DISPCNT, 0x1000 | 0x0f00 | 0x0040);
}

function SetPokeStorageTask(newFunc: (taskId: number) => void): void {
  tasks.tasks[gS().taskId].func = newFunc;
  gS().state = 0;
}

function Task_InitPokeStorage(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      SetVBlankCallback(null);
      SetGpuReg(REG_OFFSET_DISPCNT, 0);
      // Browser adaptation: on hardware the field's BG setup is still in place when TilemapUtil_SetTilemap reads BG 1's
      // size/type; the fresh hardware scene starts from the same template layout instead.
      ResetBgsAndClearDma3BusyFlags(false);
      InitBgsFromTemplates(0, sc<BgTemplate[]>("sBgTemplates"));
      ResetForPokeStorage();
      if (g.isReopening) {
        switch (sWhichToReshow) {
          case SCREEN_CHANGE_NAME_BOX - 1:
            LoadSavedMovingMon();
            break;
          case SCREEN_CHANGE_SUMMARY_SCREEN - 1:
            SetSelectionAfterSummaryScreen();
            break;
          case SCREEN_CHANGE_ITEM_FROM_BAG - 1:
            GiveChosenBagItem();
            break;
        }
      }
      LoadPokeStorageMenuGfx();
      LoadsMiscSpritePalette();
      break;
    case 1:
      if (!InitPokeStorageWindows()) {
        SetPokeStorageTask(Task_ChangeScreen);
        return;
      }
      break;
    case 2:
      PutWindowTilemap(0);
      ClearWindowTilemap(1);
      ppu.vram.fill(0, 0, 0x200); // CpuFill32(0, VRAM, 0x200)
      LoadUserWindowGfx(1, 0xb, BG_PLTT_ID(14));
      break;
    case 3:
      ResetAllBgCoords();
      if (!g.isReopening) InitStartingPosData();
      break;
    case 4:
      InitMonIconFields();
      if (!g.isReopening) InitCursor();
      else InitCursorOnReopen();
      break;
    case 5:
      if (!MultiMove_Init()) {
        SetPokeStorageTask(Task_ChangeScreen);
        return;
      }
      SetScrollingBackground();
      InitPokeStorageBg0();
      break;
    case 6:
      InitPalettesAndSprites();
      break;
    case 7:
      InitSupplementalTilemaps();
      break;
    case 8:
      CreateInitBoxTask(StorageGetCurrentBox());
      break;
    case 9:
      if (IsInitBoxActive()) return;
      if (g.boxOption !== OPTION_MOVE_ITEMS) {
        g.markMenu.baseTileTag = GFXTAG_MARKING_MENU;
        g.markMenu.basePaletteTag = PALTAG_MARKING_MENU;
        InitMonMarkingsMenu(g.markMenu);
        BufferMonMarkingsMenuTiles();
      } else {
        CreateItemIconSprites();
        InitCursorItemIcon();
      }
      break;
    case 10:
      SetMonIconTransparency();
      if (!g.isReopening) {
        BlendPalettes(PALETTES_ALL, 16, RGB_BLACK);
        SetPokeStorageTask(Task_ShowPokeStorage);
      } else {
        BlendPalettes(PALETTES_ALL, 16, RGB_BLACK);
        SetPokeStorageTask(Task_ReshowPokeStorage);
      }
      SetVBlankCallback(VBlankCB_PokeStorage);
      return;
    default:
      return;
  }
  g.state++;
}

function Task_ShowPokeStorage(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      PlaySE(C.SE_PC_LOGIN);
      BeginPCScreenEffect_TurnOn(20, 0, 1);
      g.state++;
      break;
    case 1:
      if (!IsPCScreenEffectRunning_TurnOn()) SetPokeStorageTask(Task_PokeStorageMain);
      break;
  }
}

function Task_ReshowPokeStorage(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      BeginNormalPaletteFade(PALETTES_ALL, -1, 0x10, 0, RGB_BLACK);
      g.state++;
      break;
    case 1:
      if (!UpdatePaletteFade()) SetPokeStorageTask(Task_PokeStorageMain);
      break;
  }
}

function Task_PokeStorageMain(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      switch (HandleInput()) {
        case INPUT_MOVE_CURSOR:
          PlaySE(C.SE_SELECT);
          g.state = 1;
          break;
        case INPUT_SHOW_PARTY:
          if (g.boxOption !== OPTION_MOVE_MONS && g.boxOption !== OPTION_MOVE_ITEMS) {
            PrintStorageMessage(MSG_WHICH_ONE_WILL_TAKE);
            g.state = 3;
          } else {
            ClearSavedCursorPos();
            SetPokeStorageTask(Task_ShowPartyPokemon);
          }
          break;
        case INPUT_HIDE_PARTY:
          if (g.boxOption === OPTION_MOVE_MONS) {
            if (IsMonBeingMoved() && ItemIsMail(g.displayMonItemId)) g.state = 5;
            else SetPokeStorageTask(Task_HidePartyPokemon);
          } else if (g.boxOption === OPTION_MOVE_ITEMS) {
            SetPokeStorageTask(Task_HidePartyPokemon);
          }
          break;
        case INPUT_CLOSE_BOX:
          SetPokeStorageTask(Task_OnCloseBoxPressed);
          break;
        case INPUT_PRESSED_B:
          SetPokeStorageTask(Task_OnBPressed);
          break;
        case INPUT_BOX_OPTIONS:
          PlaySE(C.SE_SELECT);
          SetPokeStorageTask(Task_HandleBoxOptions);
          break;
        case INPUT_IN_MENU:
          SetPokeStorageTask(Task_OnSelectedMon);
          break;
        case INPUT_SCROLL_RIGHT:
          PlaySE(C.SE_SELECT);
          g.newCurrBoxId = StorageGetCurrentBox() + 1;
          if (g.newCurrBoxId >= TOTAL_BOXES_COUNT) g.newCurrBoxId = 0;
          if (g.boxOption !== OPTION_MOVE_ITEMS) {
            SetUpScrollToBox(g.newCurrBoxId);
            g.state = 2;
          } else {
            TryHideItemAtCursor();
            g.state = 10;
          }
          break;
        case INPUT_SCROLL_LEFT:
          PlaySE(C.SE_SELECT);
          g.newCurrBoxId = StorageGetCurrentBox() - 1;
          if (g.newCurrBoxId < 0) g.newCurrBoxId = TOTAL_BOXES_COUNT - 1;
          if (g.boxOption !== OPTION_MOVE_ITEMS) {
            SetUpScrollToBox(g.newCurrBoxId);
            g.state = 2;
          } else {
            TryHideItemAtCursor();
            g.state = 10;
          }
          break;
        case INPUT_DEPOSIT:
          if (!CanMovePartyMon()) {
            if (ItemIsMail(g.displayMonItemId)) {
              g.state = 5;
            } else {
              PlaySE(C.SE_SELECT);
              SetPokeStorageTask(Task_DepositMenu);
            }
          } else {
            g.state = 4;
          }
          break;
        case INPUT_MOVE_MON:
          if (CanMovePartyMon()) {
            g.state = 4;
          } else {
            PlaySE(C.SE_SELECT);
            SetPokeStorageTask(Task_MoveMon);
          }
          break;
        case INPUT_SHIFT_MON:
          if (!CanShiftMon()) {
            g.state = 4;
          } else {
            PlaySE(C.SE_SELECT);
            SetPokeStorageTask(Task_ShiftMon);
          }
          break;
        case INPUT_WITHDRAW:
          PlaySE(C.SE_SELECT);
          SetPokeStorageTask(Task_WithdrawMon);
          break;
        case INPUT_PLACE_MON:
          PlaySE(C.SE_SELECT);
          SetPokeStorageTask(Task_PlaceMon);
          break;
        case INPUT_TAKE_ITEM:
          PlaySE(C.SE_SELECT);
          SetPokeStorageTask(Task_TakeItemForMoving);
          break;
        case INPUT_GIVE_ITEM:
          PlaySE(C.SE_SELECT);
          SetPokeStorageTask(Task_GiveMovingItemToMon);
          break;
        case INPUT_SWITCH_ITEMS:
          PlaySE(C.SE_SELECT);
          SetPokeStorageTask(Task_SwitchSelectedItem);
          break;
        case INPUT_MULTIMOVE_START:
          PlaySE(C.SE_SELECT);
          MultiMove_SetFunction(MULTIMOVE_START);
          g.state = 7;
          break;
        case INPUT_MULTIMOVE_SINGLE:
          MultiMove_SetFunction(MULTIMOVE_SINGLE);
          g.state = 8;
          break;
        case INPUT_MULTIMOVE_CHANGE_SELECTION:
          PlaySE(C.SE_SELECT);
          MultiMove_SetFunction(MULTIMOVE_CHANGE_SELECTION);
          g.state = 9;
          break;
        case INPUT_MULTIMOVE_GRAB_SELECTION:
          MultiMove_SetFunction(MULTIMOVE_GRAB_SELECTION);
          g.state = 7;
          break;
        case INPUT_MULTIMOVE_MOVE_MONS:
          PlaySE(C.SE_SELECT);
          MultiMove_SetFunction(MULTIMOVE_MOVE_MONS);
          g.state = 9;
          break;
        case INPUT_MULTIMOVE_PLACE_MONS:
          PlaySE(C.SE_SELECT);
          SetPokeStorageQuestLogEvent(3);
          MultiMove_SetFunction(MULTIMOVE_PLACE_MONS);
          g.state = 7;
          break;
        case INPUT_MULTIMOVE_UNABLE:
          PlaySE(C.SE_FAILURE);
          break;
      }
      break;
    case 1:
      if (!UpdateCursorPos()) {
        if (IsCursorOnCloseBox()) StartFlashingCloseBoxButton();
        else StopFlashingCloseBoxButton();
        if (g.setMosaic) StartDisplayMonMosaic();
        g.state = 0;
      }
      break;
    case 2:
      if (!ScrollToBox()) {
        SetCurrentBox(g.newCurrBoxId);
        if (!sInPartyMenu && !IsMonBeingMoved()) {
          DoTrySetDisplayMonData();
          StartDisplayMonMosaic();
        }
        if (g.boxOption === OPTION_MOVE_ITEMS) {
          TryShowItemAtCursor();
          g.state = 11;
        } else {
          g.state = 0;
        }
      }
      break;
    case 3:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        g.state = 0;
      }
      break;
    case 4:
      PlaySE(C.SE_FAILURE);
      PrintStorageMessage(MSG_LAST_POKE);
      g.state = 6;
      break;
    case 5:
      PlaySE(C.SE_FAILURE);
      PrintStorageMessage(MSG_PLEASE_REMOVE_MAIL);
      g.state = 6;
      break;
    case 6:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
    case 7:
      if (!MultiMove_RunFunction()) g.state = 0;
      break;
    case 8:
      if (!MultiMove_RunFunction()) SetPokeStorageTask(Task_MoveMon);
      break;
    case 9:
      if (!MultiMove_RunFunction()) {
        if (g.setMosaic) StartDisplayMonMosaic();
        g.state = 0;
      }
      break;
    case 10:
      if (!IsItemIconAnimActive()) {
        SetUpScrollToBox(g.newCurrBoxId);
        g.state = 2;
      }
      break;
    case 11:
      if (!IsItemIconAnimActive()) g.state = 0;
      break;
  }
}

function Task_ShowPartyPokemon(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      SetUpDoShowPartyMenu();
      g.state++;
      break;
    case 1:
      if (!DoShowPartyMenu()) SetPokeStorageTask(Task_PokeStorageMain);
      break;
  }
}

function Task_HidePartyPokemon(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      PlaySE(C.SE_SELECT);
      SetUpHidePartyMenu();
      g.state++;
      break;
    case 1:
      if (!HidePartyMenu()) {
        SetCursorBoxPosition(GetSavedCursorPos());
        g.state++;
      }
      break;
    case 2:
      if (!UpdateCursorPos()) {
        if (g.setMosaic) StartDisplayMonMosaic();
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
  }
}

function Task_OnSelectedMon(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      if (!IsDisplayMonMosaicActive()) {
        PlaySE(C.SE_SELECT);
        if (g.boxOption !== OPTION_MOVE_ITEMS) PrintStorageMessage(MSG_IS_SELECTED);
        else if (IsActiveItemMoving() || g.displayMonItemId !== 0) PrintStorageMessage(MSG_IS_SELECTED2);
        else PrintStorageMessage(MSG_GIVE_TO_MON);
        AddMenu();
        g.state = 1;
      }
      break;
    case 1:
      if (!IsMenuLoading()) g.state = 2;
      break;
    case 2:
      switch (HandleMenuInput()) {
        case MENU_B_PRESSED:
        case MENU_TEXT_CANCEL:
          ClearBottomWindow();
          SetPokeStorageTask(Task_PokeStorageMain);
          break;
        case MENU_TEXT_MOVE:
          if (CanMovePartyMon()) {
            g.state = 3;
          } else {
            PlaySE(C.SE_SELECT);
            ClearBottomWindow();
            SetPokeStorageTask(Task_MoveMon);
          }
          break;
        case MENU_TEXT_PLACE:
          PlaySE(C.SE_SELECT);
          ClearBottomWindow();
          SetPokeStorageTask(Task_PlaceMon);
          break;
        case MENU_TEXT_SHIFT:
          if (!CanShiftMon()) {
            g.state = 3;
          } else {
            PlaySE(C.SE_SELECT);
            ClearBottomWindow();
            SetPokeStorageTask(Task_ShiftMon);
          }
          break;
        case MENU_TEXT_WITHDRAW:
          PlaySE(C.SE_SELECT);
          ClearBottomWindow();
          SetPokeStorageTask(Task_WithdrawMon);
          break;
        case MENU_TEXT_STORE:
          if (CanMovePartyMon()) {
            g.state = 3;
          } else if (ItemIsMail(g.displayMonItemId)) {
            g.state = 4;
          } else {
            PlaySE(C.SE_SELECT);
            ClearBottomWindow();
            SetPokeStorageTask(Task_DepositMenu);
          }
          break;
        case MENU_TEXT_RELEASE:
          if (CanMovePartyMon()) {
            g.state = 3;
          } else if (g.displayMonIsEgg) {
            g.state = 5;
          } else if (ItemIsMail(g.displayMonItemId)) {
            g.state = 4;
          } else {
            PlaySE(C.SE_SELECT);
            SetPokeStorageTask(Task_ReleaseMon);
          }
          break;
        case MENU_TEXT_SUMMARY:
          PlaySE(C.SE_SELECT);
          SetPokeStorageTask(Task_ShowMonSummary);
          break;
        case MENU_TEXT_MARK:
          PlaySE(C.SE_SELECT);
          SetPokeStorageTask(Task_ShowMarkMenu);
          break;
        case MENU_TEXT_TAKE:
          PlaySE(C.SE_SELECT);
          SetPokeStorageTask(Task_TakeItemForMoving);
          break;
        case MENU_TEXT_GIVE:
          PlaySE(C.SE_SELECT);
          SetPokeStorageTask(Task_GiveMovingItemToMon);
          break;
        case MENU_TEXT_BAG:
          SetPokeStorageTask(Task_ItemToBag);
          break;
        case MENU_TEXT_SWITCH:
          SetPokeStorageTask(Task_SwitchSelectedItem);
          break;
        case MENU_TEXT_GIVE2:
          SetPokeStorageTask(Task_GiveItemFromBag);
          break;
        case MENU_TEXT_INFO:
          SetPokeStorageTask(Task_ShowItemInfo);
          break;
      }
      break;
    case 3:
      PlaySE(C.SE_FAILURE);
      PrintStorageMessage(MSG_LAST_POKE);
      g.state = 6;
      break;
    case 5:
      PlaySE(C.SE_FAILURE);
      PrintStorageMessage(MSG_CANT_RELEASE_EGG);
      g.state = 6;
      break;
    case 4:
      PlaySE(C.SE_FAILURE);
      PrintStorageMessage(MSG_PLEASE_REMOVE_MAIL);
      g.state = 6;
      break;
    case 6:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
  }
}

function Task_MoveMon(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      InitMonPlaceChange(CHANGE_GRAB);
      g.state++;
      break;
    case 1:
      if (!DoMonPlaceChange()) {
        if (sInPartyMenu) SetPokeStorageTask(Task_HandleMovingMonFromParty);
        else SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
  }
}

function Task_PlaceMon(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      SetPokeStorageQuestLogEvent(1);
      InitMonPlaceChange(CHANGE_PLACE);
      g.state++;
      break;
    case 1:
      if (!DoMonPlaceChange()) {
        if (sInPartyMenu) SetPokeStorageTask(Task_HandleMovingMonFromParty);
        else SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
  }
}

function Task_ShiftMon(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      SetPokeStorageQuestLogEvent(0);
      InitMonPlaceChange(CHANGE_SHIFT);
      g.state++;
      break;
    case 1:
      if (!DoMonPlaceChange()) {
        StartDisplayMonMosaic();
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
  }
}

function Task_WithdrawMon(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      if (CountSlotsInUse() === PARTY_SIZE) {
        PrintStorageMessage(MSG_PARTY_FULL);
        g.state = 1;
      } else {
        SaveCursorPos();
        InitMonPlaceChange(CHANGE_GRAB);
        g.state = 2;
      }
      break;
    case 1:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
    case 2:
      if (!DoMonPlaceChange()) {
        SetMovingMonPriority(1);
        SetUpDoShowPartyMenu();
        g.state++;
      }
      break;
    case 3:
      if (!DoShowPartyMenu()) {
        SetPokeStorageQuestLogEvent(1);
        InitMonPlaceChange(CHANGE_PLACE);
        g.state++;
      }
      break;
    case 4:
      if (!DoMonPlaceChange()) {
        UpdatePartySlotColors();
        g.state++;
      }
      break;
    case 5:
      SetPokeStorageTask(Task_HidePartyPokemon);
      break;
  }
}

/** CalculatePlayerPartyCount over the six working slots. */
function CountSlotsInUse(): number {
  let count = 0;
  for (let i = 0; i < PARTY_SIZE; i++) if (GetMonData(sParty[i], C.MON_DATA_SPECIES) !== C.SPECIES_NONE) count++;
  return count;
}

function Task_DepositMenu(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      PrintStorageMessage(MSG_DEPOSIT_IN_WHICH_BOX);
      LoadChooseBoxMenuGfx(g.chooseBoxMenu, GFXTAG_CHOOSE_BOX_MENU_CENTER, PALTAG_MISC_1, 3, false);
      CreateChooseBoxMenuSprites(sDepositBoxId);
      g.state++;
      break;
    case 1: {
      const boxId = HandleBoxChooseSelectionInput();
      switch (boxId) {
        case BOXID_NONE_CHOSEN:
          break;
        case BOXID_CANCELED:
          ClearBottomWindow();
          DestroyChooseBoxMenuSprites();
          FreeBoxSelectionPopupSpriteGfx();
          SetPokeStorageTask(Task_PokeStorageMain);
          break;
        default:
          if (TryStorePartyMonInBox(boxId)) {
            sDepositBoxId = boxId;
            SetPokeStorageQuestLogEvent(2);
            ClearBottomWindow();
            DestroyChooseBoxMenuSprites();
            FreeBoxSelectionPopupSpriteGfx();
            g.state = 2;
          } else {
            PrintStorageMessage(MSG_BOX_IS_FULL);
            g.state = 4;
          }
          break;
      }
      break;
    }
    case 2:
      CompactPartySlots();
      CompactPartySprites();
      g.state++;
      break;
    case 3:
      if (GetNumPartySpritesCompacting() === 0) {
        ResetSelectionAfterDeposit();
        StartDisplayMonMosaic();
        UpdatePartySlotColors();
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
    case 4:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        PrintStorageMessage(MSG_DEPOSIT_IN_WHICH_BOX);
        g.state = 1;
      }
      break;
  }
}

function Task_ReleaseMon(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      PrintStorageMessage(MSG_RELEASE_POKE);
      ShowYesNoWindow(1);
      g.state++;
    // fallthrough
    case 1:
      switch (Menu_ProcessInputNoWrapClearOnChoose()) {
        case MENU_B_PRESSED:
        case 1:
          ClearBottomWindow();
          SetPokeStorageTask(Task_PokeStorageMain);
          break;
        case 0:
          ClearBottomWindow();
          InitCanReleaseMonVars();
          InitReleaseMon();
          g.state++;
          break;
      }
      break;
    case 2:
      RunCanReleaseMon();
      if (!TryHideReleaseMon()) {
        for (;;) {
          // keep checking until status is no longer RELEASE_MON_UNDETERMINED
          const canReleaseStatus = RunCanReleaseMon();
          if (canReleaseStatus === RELEASE_MON_ALLOWED) {
            g.state++;
            break;
          } else if (canReleaseStatus === RELEASE_MON_NOT_ALLOWED) {
            g.state = 8; // Can't release the mon.
            break;
          }
        }
      }
      break;
    case 3:
      ReleaseMon();
      RefreshDisplayMonData();
      PrintStorageMessage(MSG_WAS_RELEASED);
      g.state++;
      break;
    case 4:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        PrintStorageMessage(MSG_BYE_BYE);
        g.state++;
      }
      break;
    case 5:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        if (sInPartyMenu) {
          CompactPartySlots();
          CompactPartySprites();
          g.state++;
        } else {
          g.state = 7;
        }
      }
      break;
    case 6:
      if (GetNumPartySpritesCompacting() === 0) {
        DoTrySetDisplayMonData();
        StartDisplayMonMosaic();
        UpdatePartySlotColors();
        g.state++;
      }
      break;
    case 7:
      SetPokeStorageTask(Task_PokeStorageMain);
      break;
    case 8:
      // Start "can't release" sequence
      PrintStorageMessage(MSG_WAS_RELEASED);
      g.state++;
      break;
    case 9:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        PrintStorageMessage(MSG_SURPRISE);
        g.state++;
      }
      break;
    case 10:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        DoReleaseMonComeBackAnim();
        g.state++;
      }
      break;
    case 11:
      if (!ResetReleaseMonSpritePtr()) {
        TrySetCursorFistAnim();
        PrintStorageMessage(MSG_CAME_BACK);
        g.state++;
      }
      break;
    case 12:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        PrintStorageMessage(MSG_WORRIED);
        g.state++;
      }
      break;
    case 13:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
  }
}

function Task_ShowMarkMenu(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      PrintStorageMessage(MSG_MARK_POKE);
      g.markMenu.markings = g.displayMonMarkings;
      OpenMonMarkingsMenu(g.displayMonMarkings, 176, 16);
      g.state++;
      break;
    case 1:
      if (!HandleMonMarkingsMenuInput()) {
        FreeMonMarkingsMenu();
        ClearBottomWindow();
        SetMonMarkings(g.markMenu.markings);
        RefreshDisplayMonData();
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
  }
}

function Task_TakeItemForMoving(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      if (!ItemIsMail(g.displayMonItemId)) {
        ClearBottomWindow();
        g.state++;
      } else {
        SetPokeStorageTask(Task_PrintCantStoreMail);
      }
      break;
    case 1:
      StartCursorAnim(CURSOR_ANIM_OPEN);
      Item_FromMonToMoving(sInPartyMenu ? CURSOR_AREA_IN_PARTY : CURSOR_AREA_IN_BOX, GetBoxCursorPosition());
      g.state++;
      break;
    case 2:
      if (!IsItemIconAnimActive()) {
        StartCursorAnim(CURSOR_ANIM_FIST);
        ClearBottomWindow();
        DoTrySetDisplayMonData();
        PrintDisplayMonInfo();
        g.state++;
      }
      break;
    case 3:
      if (!IsDma3ManagerBusyWithBgCopy()) SetPokeStorageTask(Task_PokeStorageMain);
      break;
  }
}

function Task_GiveMovingItemToMon(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      ClearBottomWindow();
      g.state++;
      break;
    case 1:
      StartCursorAnim(CURSOR_ANIM_OPEN);
      Item_GiveMovingToMon(sInPartyMenu ? CURSOR_AREA_IN_PARTY : CURSOR_AREA_IN_BOX, GetBoxCursorPosition());
      g.state++;
      break;
    case 2:
      if (!IsItemIconAnimActive()) {
        StartCursorAnim(CURSOR_ANIM_BOUNCE);
        DoTrySetDisplayMonData();
        PrintDisplayMonInfo();
        PrintStorageMessage(MSG_ITEM_IS_HELD);
        g.state++;
      }
      break;
    case 3:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        g.state++;
      }
      break;
    case 4:
      if (!IsDma3ManagerBusyWithBgCopy()) SetPokeStorageTask(Task_PokeStorageMain);
      break;
  }
}

function Task_ItemToBag(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      if (!addBagItem(g.displayMonItemId, 1)) {
        PlaySE(C.SE_FAILURE);
        PrintStorageMessage(MSG_BAG_FULL);
        g.state = 3;
      } else {
        PlaySE(C.SE_SELECT);
        Item_TakeMons(sInPartyMenu ? CURSOR_AREA_IN_PARTY : CURSOR_AREA_IN_BOX, GetBoxCursorPosition());
        g.state = 1;
      }
      break;
    case 1:
      if (!IsItemIconAnimActive()) {
        PrintStorageMessage(MSG_PLACED_IN_BAG);
        g.state = 2;
      }
      break;
    case 2:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        DoTrySetDisplayMonData();
        PrintDisplayMonInfo();
        g.state = 4;
      }
      break;
    case 4:
      if (!IsDma3ManagerBusyWithBgCopy()) SetPokeStorageTask(Task_PokeStorageMain);
      break;
    case 3:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
  }
}

function Task_SwitchSelectedItem(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      if (!ItemIsMail(g.displayMonItemId)) {
        ClearBottomWindow();
        g.state++;
      } else {
        SetPokeStorageTask(Task_PrintCantStoreMail);
      }
      break;
    case 1:
      StartCursorAnim(CURSOR_ANIM_OPEN);
      Item_SwitchMonsWithMoving(sInPartyMenu ? CURSOR_AREA_IN_PARTY : CURSOR_AREA_IN_BOX, GetBoxCursorPosition());
      g.state++;
      break;
    case 2:
      if (!IsItemIconAnimActive()) {
        StartCursorAnim(CURSOR_ANIM_FIST);
        DoTrySetDisplayMonData();
        PrintDisplayMonInfo();
        PrintStorageMessage(MSG_CHANGED_TO_ITEM);
        g.state++;
      }
      break;
    case 3:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        g.state++;
      }
      break;
    case 4:
      if (!IsDma3ManagerBusyWithBgCopy()) SetPokeStorageTask(Task_PokeStorageMain);
      break;
  }
}

function Task_ShowItemInfo(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      ClearBottomWindow();
      g.state++;
      break;
    case 1:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        PlaySE(C.SE_WIN_OPEN);
        PrintItemDescription();
        InitItemInfoWindow();
        g.state++;
      }
      break;
    case 2:
      if (!UpdateItemInfoWindowSlideIn()) g.state++;
      break;
    case 3:
      if (!IsDma3ManagerBusyWithBgCopy()) g.state++;
      break;
    case 4:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        PlaySE(C.SE_WIN_OPEN);
        g.state++;
      }
      break;
    case 5:
      if (!UpdateItemInfoWindowSlideOut()) g.state++;
      break;
    case 6:
      if (!IsDma3ManagerBusyWithBgCopy()) SetPokeStorageTask(Task_PokeStorageMain);
      break;
  }
}

function Task_CloseBoxWhileHoldingItem(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      PlaySE(C.SE_SELECT);
      PrintStorageMessage(MSG_PUT_IN_BAG);
      ShowYesNoWindow(0);
      g.state = 1;
      break;
    case 1:
      switch (Menu_ProcessInputNoWrapClearOnChoose()) {
        case MENU_B_PRESSED:
        case 1:
          ClearBottomWindow();
          SetPokeStorageTask(Task_PokeStorageMain);
          break;
        case 0:
          if (addBagItem(g.movingItemId, 1)) {
            ClearBottomWindow();
            g.state = 3;
          } else {
            PrintStorageMessage(MSG_BAG_FULL);
            g.state = 2;
          }
          break;
      }
      break;
    case 2:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        g.state = 5;
      }
      break;
    case 3:
      MoveItemFromCursorToBag();
      g.state = 4;
      break;
    case 4:
      if (!IsItemIconAnimActive()) {
        StartCursorAnim(CURSOR_ANIM_BOUNCE);
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
    case 5:
      if (!IsDma3ManagerBusyWithBgCopy()) SetPokeStorageTask(Task_PokeStorageMain);
      break;
  }
}

function Task_HandleMovingMonFromParty(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      CompactPartySlots();
      CompactPartySprites();
      g.state++;
      break;
    case 1:
      if (GetNumPartySpritesCompacting() === 0) {
        UpdatePartySlotColors();
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
  }
}

function Task_PrintCantStoreMail(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      PrintStorageMessage(MSG_CANT_STORE_MAIL);
      g.state++;
      break;
    case 1:
      if (!IsDma3ManagerBusyWithBgCopy()) g.state++;
      break;
    case 2:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        g.state++;
      }
      break;
    case 3:
      if (!IsDma3ManagerBusyWithBgCopy()) SetPokeStorageTask(Task_PokeStorageMain);
      break;
  }
}

function Task_HandleBoxOptions(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      PrintStorageMessage(MSG_WHAT_YOU_DO);
      AddMenu();
      g.state++;
      break;
    case 1:
      if (IsMenuLoading()) return;
      g.state++;
    // fallthrough
    case 2:
      switch (HandleMenuInput()) {
        case MENU_B_PRESSED:
        case MENU_TEXT_CANCEL:
          AnimateBoxScrollArrows(true);
          ClearBottomWindow();
          SetPokeStorageTask(Task_PokeStorageMain);
          break;
        case MENU_TEXT_NAME:
          PlaySE(C.SE_SELECT);
          SetPokeStorageTask(Task_NameBox);
          break;
        case MENU_TEXT_WALLPAPER:
          PlaySE(C.SE_SELECT);
          ClearBottomWindow();
          SetPokeStorageTask(Task_HandleWallpapers);
          break;
        case MENU_TEXT_JUMP:
          PlaySE(C.SE_SELECT);
          ClearBottomWindow();
          SetPokeStorageTask(Task_JumpBox);
          break;
      }
      break;
  }
}

function Task_HandleWallpapers(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      AddWallpaperSetsMenu();
      PrintStorageMessage(MSG_PICK_A_THEME);
      g.state++;
      break;
    case 1:
      if (!IsMenuLoading()) g.state++;
      break;
    case 2:
      g.wallpaperSetId = HandleMenuInput();
      switch (g.wallpaperSetId) {
        case MENU_B_PRESSED:
          AnimateBoxScrollArrows(true);
          ClearBottomWindow();
          SetPokeStorageTask(Task_PokeStorageMain);
          break;
        case MENU_TEXT_SCENERY_1:
        case MENU_TEXT_SCENERY_2:
        case MENU_TEXT_SCENERY_3:
        case MENU_TEXT_ETCETERA:
          PlaySE(C.SE_SELECT);
          RemoveMenu();
          g.wallpaperSetId -= MENU_TEXT_SCENERY_1;
          g.state++;
          break;
      }
      break;
    case 3:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        AddWallpapersMenu(g.wallpaperSetId);
        PrintStorageMessage(MSG_PICK_A_WALLPAPER);
        g.state++;
      }
      break;
    case 4:
      g.wallpaperId = HandleMenuInput();
      switch (g.wallpaperId) {
        case MENU_NOTHING_CHOSEN:
          break;
        case MENU_B_PRESSED:
          ClearBottomWindow();
          g.state = 0;
          break;
        default:
          PlaySE(C.SE_SELECT);
          ClearBottomWindow();
          g.wallpaperId -= MENU_TEXT_FOREST;
          SetWallpaperForCurrentBox(g.wallpaperId);
          g.state++;
          break;
      }
      break;
    case 5:
      if (!DoWallpaperGfxChange()) {
        AnimateBoxScrollArrows(true);
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
  }
}

function Task_JumpBox(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      PrintStorageMessage(MSG_JUMP_TO_WHICH_BOX);
      LoadChooseBoxMenuGfx(g.chooseBoxMenu, GFXTAG_CHOOSE_BOX_MENU_CENTER, PALTAG_MISC_1, 3, false);
      CreateChooseBoxMenuSprites(StorageGetCurrentBox());
      g.state++;
      break;
    case 1:
      g.newCurrBoxId = HandleBoxChooseSelectionInput();
      switch (g.newCurrBoxId) {
        case BOXID_NONE_CHOSEN:
          break;
        default:
          ClearBottomWindow();
          DestroyChooseBoxMenuSprites();
          FreeBoxSelectionPopupSpriteGfx();
          if (g.newCurrBoxId === BOXID_CANCELED || g.newCurrBoxId === StorageGetCurrentBox()) {
            AnimateBoxScrollArrows(true);
            SetPokeStorageTask(Task_PokeStorageMain);
          } else {
            g.state++;
          }
          break;
      }
      break;
    case 2:
      SetUpScrollToBox(g.newCurrBoxId);
      g.state++;
      break;
    case 3:
      if (!ScrollToBox()) {
        SetCurrentBox(g.newCurrBoxId);
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
  }
}

function Task_NameBox(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      SaveMovingMon();
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      g.state++;
      break;
    case 1:
      if (!UpdatePaletteFade()) {
        sWhichToReshow = SCREEN_CHANGE_NAME_BOX - 1;
        g.screenChangeType = SCREEN_CHANGE_NAME_BOX;
        SetPokeStorageTask(Task_ChangeScreen);
      }
      break;
  }
}

function Task_ShowMonSummary(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      InitSummaryScreenData();
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      g.state++;
      break;
    case 1:
      if (!UpdatePaletteFade()) {
        sWhichToReshow = SCREEN_CHANGE_SUMMARY_SCREEN - 1;
        g.screenChangeType = SCREEN_CHANGE_SUMMARY_SCREEN;
        SetPokeStorageTask(Task_ChangeScreen);
      }
      break;
  }
}

function Task_GiveItemFromBag(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      g.state++;
      break;
    case 1:
      if (!UpdatePaletteFade()) {
        sWhichToReshow = SCREEN_CHANGE_ITEM_FROM_BAG - 1;
        g.screenChangeType = SCREEN_CHANGE_ITEM_FROM_BAG;
        SetPokeStorageTask(Task_ChangeScreen);
      }
      break;
  }
}

function Task_OnCloseBoxPressed(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      if (IsMonBeingMoved()) {
        PlaySE(C.SE_FAILURE);
        PrintStorageMessage(MSG_HOLDING_POKE);
        g.state = 1;
      } else if (IsActiveItemMoving()) {
        SetPokeStorageTask(Task_CloseBoxWhileHoldingItem);
      } else {
        PlaySE(C.SE_SELECT);
        PrintStorageMessage(MSG_EXIT_BOX);
        ShowYesNoWindow(0);
        g.state = 2;
      }
      break;
    case 1:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
    case 2:
      switch (Menu_ProcessInputNoWrapClearOnChoose()) {
        case MENU_B_PRESSED:
        case 1:
          ClearBottomWindow();
          SetPokeStorageTask(Task_PokeStorageMain);
          break;
        case 0:
          PlaySE(C.SE_PC_OFF);
          ClearBottomWindow();
          g.state++;
          break;
      }
      break;
    case 3:
      BeginPCScreenEffect_TurnOff(20, 0, 1);
      g.state++;
      break;
    case 4:
      if (!IsPCScreenEffectRunning_TurnOff()) {
        UpdateBoxToSendMons();
        g.screenChangeType = SCREEN_CHANGE_EXIT_BOX;
        SetPokeStorageTask(Task_ChangeScreen);
      }
      break;
  }
}

function Task_OnBPressed(_taskId: number): void {
  const g = gS();
  switch (g.state) {
    case 0:
      if (IsMonBeingMoved()) {
        PlaySE(C.SE_FAILURE);
        PrintStorageMessage(MSG_HOLDING_POKE);
        g.state = 1;
      } else if (IsActiveItemMoving()) {
        SetPokeStorageTask(Task_CloseBoxWhileHoldingItem);
      } else {
        PlaySE(C.SE_SELECT);
        PrintStorageMessage(MSG_CONTINUE_BOX);
        ShowYesNoWindow(0);
        g.state = 2;
      }
      break;
    case 1:
      if (JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY)) {
        ClearBottomWindow();
        SetPokeStorageTask(Task_PokeStorageMain);
      }
      break;
    case 2:
      switch (Menu_ProcessInputNoWrapClearOnChoose()) {
        case 0:
          ClearBottomWindow();
          SetPokeStorageTask(Task_PokeStorageMain);
          break;
        case 1:
        case MENU_B_PRESSED:
          PlaySE(C.SE_PC_OFF);
          ClearBottomWindow();
          g.state++;
          break;
      }
      break;
    case 3:
      BeginPCScreenEffect_TurnOff(20, 0, 0);
      g.state++;
      break;
    case 4:
      if (!IsPCScreenEffectRunning_TurnOff()) {
        UpdateBoxToSendMons();
        g.screenChangeType = SCREEN_CHANGE_EXIT_BOX;
        SetPokeStorageTask(Task_ChangeScreen);
      }
      break;
  }
}

function Task_ChangeScreen(taskId: number): void {
  const g = gS();
  const screenChangeType = g.screenChangeType;
  if (g.boxOption === OPTION_MOVE_ITEMS && IsActiveItemMoving()) sMovingItemId = GetMovingItem();
  else sMovingItemId = C.ITEM_NONE;

  switch (screenChangeType) {
    case SCREEN_CHANGE_SUMMARY_SCREEN: {
      const party = g.summaryMons;
      const cursorPos = g.summaryCursorPos;
      const lastIndex = g.summaryLastIndex;
      const mode = g.summaryScreenMode;
      FreePokeStorageData();
      ShowPokemonSummaryScreen(party, cursorPos, lastIndex, CB2_ReturnToPokeStorage, mode);
      break;
    }
    case SCREEN_CHANGE_NAME_BOX:
      FreePokeStorageData();
      DoNamingScreen(C.NAMING_SCREEN_BOX, GetBoxNamePtr(StorageGetCurrentBox())!, 0, 0, 0, CB2_ReturnToPokeStorage);
      break;
    case SCREEN_CHANGE_ITEM_FROM_BAG:
      FreePokeStorageData();
      GoToBagMenu(C.ITEMMENULOCATION_PCBOX, C.OPEN_BAG_ITEMS, CB2_ReturnToPokeStorage);
      break;
    case SCREEN_CHANGE_EXIT_BOX:
    default:
      // gPlayerPartyCount = CalculatePlayerPartyCount(): the six working slots go back to the save's party.
      StorePartySlots();
      joy.repeatStartDelay = 40; // gKeyRepeatStartDelay is restored by the field on return
      FreePokeStorageData();
      SetMainCallback2(CB2_ExitPokeStorage);
      break;
  }
  tasks.destroy(taskId);
}

function GiveChosenBagItem(): void {
  const item = bagResult.itemId;
  if (item !== C.ITEM_NONE) {
    const id = GetBoxCursorPosition();
    if (sInPartyMenu) SetMonData(sParty[id], C.MON_DATA_HELD_ITEM, item);
    else SetCurrentBoxMonData(id, C.MON_DATA_HELD_ITEM, item);
    removeBagItem(item, 1);
  }
}

function FreePokeStorageData(): void {
  TilemapUtil_Free();
  MultiMove_Free();
  stState.gStorage = null;
  FreeAllWindowBuffers();
}

function SetScrollingBackground(): void {
  // BGCNT_PRIORITY(3) | BGCNT_CHARBASE(3) | BGCNT_16COLOR | BGCNT_SCREENBASE(31)
  SetGpuReg(REG_OFFSET_BG3CNT, 3 | (3 << 2) | (31 << 8));
  const tiles = tbin("sScrollingBg_Gfx");
  LoadBgTiles(3, tiles, tiles.length, 0);
  const tilemap = tbin("sScrollingBg_Tilemap");
  ppu.vram.set(tilemap, BG_SCREEN_ADDR(31)); // LZ77UnCompVram(sScrollingBg_Tilemap, BG_SCREEN_ADDR(31))
}

function ScrollBackground(): void {
  ChangeBgX(3, 128, BG_COORD_ADD);
  ChangeBgY(3, 128, BG_COORD_SUB);
}

function LoadPokeStorageMenuGfx(): void {
  const templates = sc<BgTemplate[]>("sBgTemplates");
  InitBgsFromTemplates(0, templates, templates.length);
  const menuGfx = incbin("gPokeStorageMenu_Gfx");
  LoadBgTiles(1, menuGfx, menuGfx.length, 0);
  gS().menuTilemapBuffer.set(incbin16(`${F}.c:sMenu_Tilemap`).subarray(0, 0x280));
  SetBgTilemapBuffer(1, gS().menuTilemapBuffer);
  ShowBg(1);
  ScheduleBgCopyTilemapToVram(1);
}

function InitPokeStorageWindows(): boolean {
  if (!InitWindows(sc<WindowTemplate[]>("sWindowTemplates"))) return false;
  DeactivateAllTextPrinters();
  return true;
}

function LoadsMiscSpritePalette(): void {
  LoadSpritePalette({ data: tbin16("sPokeStorageMisc2Pal"), tag: PALTAG_MISC_2 });
}

function InitPalettesAndSprites(): void {
  const g = gS();
  LoadPalette(incbin16("gPokeStorageInterface_Pal"), BG_PLTT_ID(0), PLTT_SIZE_4BPP);
  LoadPalette(incbin16("gPokeStorageInterface_NoDisplayMon_Pal"), BG_PLTT_ID(2), PLTT_SIZE_4BPP);
  LoadPalette(tbin16("sItemInfoFrame_Pal"), BG_PLTT_ID(15), PLTT_SIZE_4BPP);
  if (g.boxOption !== OPTION_MOVE_ITEMS) LoadPalette(tbin16("sScrollingBg_Pal"), BG_PLTT_ID(3), PLTT_SIZE_4BPP);
  else LoadPalette(tbin16("sScrollingBgMoveItems_Pal"), BG_PLTT_ID(3), PLTT_SIZE_4BPP);
  // BGCNT_PRIORITY(1) | BGCNT_CHARBASE(1) | BGCNT_16COLOR | BGCNT_SCREENBASE(30)
  SetGpuReg(REG_OFFSET_BG1CNT, 1 | (1 << 2) | (30 << 8));
  CreateDisplayMonSprite();
  CreateMarkingComboSprite();
  CreateWaveformSprites();
  RefreshDisplayMonData();
}

function CreateMarkingComboSprite(): void {
  const g = gS();
  g.markingComboSprite = CreateMonMarkingComboSprite(GFXTAG_MARKING_COMBO, PALTAG_MARKING_COMBO, null);
  g.markingComboSprite!.oam.priority = 1;
  g.markingComboSprite!.subpriority = 1;
  g.markingComboSprite!.x = 40;
  g.markingComboSprite!.y = 150;
  g.markingComboTilesPtr = OBJ_VRAM0 + 32 * GetSpriteTileStartByTag(GFXTAG_MARKING_COMBO);
}

function CreateWaveformSprites(): void {
  const g = gS();
  const sheet = sc<{ size: number }>("sWaveformSpriteSheet");
  LoadSpriteSheet({ data: tbin("sWaveform_Gfx"), size: sheet.size, tag: GFXTAG_WAVEFORM });
  const template = templateFrom(sc<CSpriteTemplate>("sSpriteTemplate_Waveform"));
  for (let i = 0; i < 2; i++) {
    const spriteId = CreateSprite(template, i * 63 + 8, 9, 2);
    g.waveformSprites[i] = gSprites[spriteId];
  }
}

function RefreshDisplayMonData(): void {
  const g = gS();
  LoadDisplayMonGfx(g.displayMonSpecies, g.displayMonPersonality);
  PrintDisplayMonInfo();
  UpdateWaveformAnimation();
  ScheduleBgCopyTilemapToVram(0);
}

function StartDisplayMonMosaic(): void {
  const g = gS();
  RefreshDisplayMonData();
  if (g.displayMonSprite) {
    g.displayMonSprite.oam.mosaic = 1;
    g.displayMonSprite.data[0] = 10;
    g.displayMonSprite.data[1] = 1;
    g.displayMonSprite.callback = SpriteCB_DisplayMonMosaic;
    SetGpuReg(REG_OFFSET_MOSAIC, (g.displayMonSprite.data[0] << 12) | (g.displayMonSprite.data[0] << 8));
  }
}

function IsDisplayMonMosaicActive(): boolean {
  return !!gS().displayMonSprite!.oam.mosaic;
}

function SpriteCB_DisplayMonMosaic(sprite: Sprite): void {
  sprite.data[0] -= sprite.data[1];
  if (sprite.data[0] < 0) sprite.data[0] = 0;
  SetGpuReg(REG_OFFSET_MOSAIC, (sprite.data[0] << 12) | (sprite.data[0] << 8));
  if (sprite.data[0] === 0) {
    sprite.oam.mosaic = 0;
    sprite.callback = SpriteCallbackDummy;
  }
}

function CreateDisplayMonSprite(): void {
  const g = gS();
  const template = templateFrom(sc<CSpriteTemplate>("sSpriteTemplate_DisplayMon"));
  g.tileBuffer.fill(0, 0, C.MON_PIC_SIZE);
  g.displayMonPalBuffer.fill(0, 0, 0x10);
  g.displayMonSprite = null;
  do {
    const tileStart = LoadSpriteSheet({ data: g.tileBuffer, size: C.MON_PIC_SIZE, tag: GFXTAG_DISPLAY_MON });
    if (tileStart === 0) break;
    const palSlot = LoadSpritePalette({ data: g.displayMonPalBuffer, tag: PALTAG_DISPLAY_MON });
    if (palSlot === 0xff) break;
    const spriteId = CreateSprite(template, 40, 48, 0);
    if (spriteId === MAX_SPRITES) break;
    g.displayMonSprite = gSprites[spriteId];
    g.displayMonPalOffset = OBJ_PLTT_ID(palSlot);
    g.displayMonTilePtr = OBJ_VRAM0 + tileStart * 32;
  } while (false);
  if (g.displayMonSprite === null) {
    FreeSpriteTilesByTag(GFXTAG_DISPLAY_MON);
    FreeSpritePaletteByTag(PALTAG_DISPLAY_MON);
  }
}

function LoadDisplayMonGfx(species: number, personality: number): void {
  const g = gS();
  if (g.displayMonSprite === null) return;
  if (species !== C.SPECIES_NONE) {
    LoadSpecialPokePic(true, g.tileBuffer, species, personality); // HandleLoadSpecialPokePic(&gMonFrontPicTable[species], …)
    if (g.displayMonPalette) g.displayMonPalBuffer.set(g.displayMonPalette.subarray(0, 0x10));
    ppu.vram.set(g.tileBuffer.subarray(0, 0x800), g.displayMonTilePtr);
    LoadPalette(g.displayMonPalBuffer, g.displayMonPalOffset, PLTT_SIZE_4BPP);
    g.displayMonSprite.invisible = false;
  } else {
    g.displayMonSprite.invisible = true;
  }
}

function PrintDisplayMonInfo(): void {
  const g = gS();
  FillWindowPixelBuffer(0, PIXEL_FILL(1));
  if (g.boxOption !== OPTION_MOVE_ITEMS) {
    let y = 0;
    for (let i = 0; i < 3; i++, y += 14) AddTextPrinterParameterized(0, FONT_NORMAL, g.displayMonTexts[i], i === 2 ? 10 : 6, y, TEXT_SKIP_DRAW, null);
    AddTextPrinterParameterized(0, FONT_SMALL, g.displayMonTexts[3], 6, y + 2, TEXT_SKIP_DRAW, null);
  } else {
    AddTextPrinterParameterized(0, FONT_SMALL, g.displayMonTexts[3], 6, 0, TEXT_SKIP_DRAW, null);
    let y = 15;
    for (let i = 0; i < 3; i++, y += 14) AddTextPrinterParameterized(0, FONT_NORMAL, g.displayMonTexts[i], i === 2 ? 10 : 6, y, TEXT_SKIP_DRAW, null);
  }
  CopyWindowToVram(0, COPYWIN_GFX);
  if (g.displayMonSpecies !== C.SPECIES_NONE) {
    UpdateMonMarkingTiles(g.displayMonMarkings, ppu.vram.subarray(g.markingComboTilesPtr, g.markingComboTilesPtr + 0x80));
    g.markingComboSprite!.invisible = false;
  } else {
    g.markingComboSprite!.invisible = true;
  }
}

function UpdateWaveformAnimation(): void {
  const g = gS();
  if (g.displayMonSpecies !== C.SPECIES_NONE) {
    TilemapUtil_SetRect(TILEMAP_PKMN_DATA, 0, 0, 8, 2);
    for (let i = 0; i < 2; i++) StartSpriteAnimIfDifferent(g.waveformSprites[i]!, i * 2 + 1);
  } else {
    TilemapUtil_SetRect(TILEMAP_PKMN_DATA, 0, 2, 8, 2);
    for (let i = 0; i < 2; i++) StartSpriteAnim(g.waveformSprites[i]!, i * 2);
  }
  TilemapUtil_Update(TILEMAP_PKMN_DATA);
  ScheduleBgCopyTilemapToVram(1);
}

function InitSupplementalTilemaps(): void {
  const g = gS();
  g.partyMenuTilemapBuffer.set(incbin16("gPokeStoragePartyMenu_Tilemap").subarray(0, 0x108));
  LoadPalette(incbin16("gPokeStoragePartyMenu_Pal"), BG_PLTT_ID(1), PLTT_SIZE_4BPP);
  TilemapUtil_SetTilemap(TILEMAP_PARTY_MENU, 1, g.partyMenuTilemapBuffer, 12, 22);
  TilemapUtil_SetTilemap(TILEMAP_CLOSE_BUTTON, 1, tbin16("sCloseBoxButton_Tilemap"), 9, 4);
  TilemapUtil_SetPos(TILEMAP_PARTY_MENU, 10, 0);
  TilemapUtil_SetPos(TILEMAP_CLOSE_BUTTON, 21, 0);
  SetPartySlotTilemaps();
  if (sInPartyMenu) {
    UpdateCloseBoxButtonTilemap(true);
    CreatePartyMonsSprites(true);
    TilemapUtil_Update(TILEMAP_CLOSE_BUTTON);
    TilemapUtil_Update(TILEMAP_PARTY_MENU);
  } else {
    TilemapUtil_SetRect(TILEMAP_PARTY_MENU, 0, 20, 12, 2);
    UpdateCloseBoxButtonTilemap(true);
    TilemapUtil_Update(TILEMAP_PARTY_MENU);
    TilemapUtil_Update(TILEMAP_CLOSE_BUTTON);
  }
  ScheduleBgCopyTilemapToVram(1);
  g.closeBoxFlashing = false;
}

function SetUpShowPartyMenu(): void {
  const g = gS();
  g.partyMenuY = 2;
  g.partyMenuMoveTimer = 0;
  CreatePartyMonsSprites(false);
}

function ShowPartyMenu(): boolean {
  const g = gS();
  if (g.partyMenuMoveTimer === 20) return false;
  g.partyMenuY++;
  TilemapUtil_Move(TILEMAP_PARTY_MENU, 3, 1);
  TilemapUtil_Update(TILEMAP_PARTY_MENU);
  ScheduleBgCopyTilemapToVram(1);
  MovePartySprites(8);
  if (++g.partyMenuMoveTimer === 20) {
    sInPartyMenu = true;
    return false;
  }
  return true;
}

function SetUpHidePartyMenu(): void {
  const g = gS();
  g.partyMenuY = 22;
  g.partyMenuMoveTimer = 0;
  if (g.boxOption === OPTION_MOVE_ITEMS) MoveHeldItemWithPartyMenu();
}

function HidePartyMenu(): boolean {
  const g = gS();
  if (g.partyMenuMoveTimer !== 20) {
    g.partyMenuY--;
    TilemapUtil_Move(TILEMAP_PARTY_MENU, 3, -1);
    TilemapUtil_Update(TILEMAP_PARTY_MENU);
    FillBgTilemapBufferRect_Palette0(1, 0x100, 10, g.partyMenuY, 12, 1);
    MovePartySprites(-8);
    if (++g.partyMenuMoveTimer !== 20) {
      ScheduleBgCopyTilemapToVram(1);
      return true;
    }
    sInPartyMenu = false;
    DestroyAllPartyMonIcons();
    CompactPartySlots();
    TilemapUtil_SetRect(TILEMAP_CLOSE_BUTTON, 0, 0, 9, 2);
    TilemapUtil_Update(TILEMAP_CLOSE_BUTTON);
    ScheduleBgCopyTilemapToVram(1);
    return false;
  }
  return false;
}

function UpdateCloseBoxButtonTilemap(normal: boolean): void {
  if (normal) TilemapUtil_SetRect(TILEMAP_CLOSE_BUTTON, 0, 0, 9, 2);
  else TilemapUtil_SetRect(TILEMAP_CLOSE_BUTTON, 0, 2, 9, 2);
  TilemapUtil_Update(TILEMAP_CLOSE_BUTTON);
  ScheduleBgCopyTilemapToVram(1);
}

function StartFlashingCloseBoxButton(): void {
  const g = gS();
  g.closeBoxFlashing = true;
  g.closeBoxFlashTimer = 30;
  g.closeBoxFlashState = true;
}

function StopFlashingCloseBoxButton(): void {
  const g = gS();
  if (g.closeBoxFlashing) {
    g.closeBoxFlashing = false;
    UpdateCloseBoxButtonTilemap(true);
  }
}

function UpdateCloseBoxButtonFlash(): void {
  const g = stState.gStorage;
  if (!g) return;
  if (g.closeBoxFlashing && ++g.closeBoxFlashTimer > 30) {
    g.closeBoxFlashTimer = 0;
    g.closeBoxFlashState = !g.closeBoxFlashState;
    UpdateCloseBoxButtonTilemap(g.closeBoxFlashState);
  }
}

function SetPartySlotTilemaps(): void {
  // Skips first party slot, it should always be drawn as if it has a Pokémon in it
  for (let i = 1; i < PARTY_SIZE; i++) {
    const species = GetMonData(sParty[i], C.MON_DATA_SPECIES);
    SetPartySlotTilemap(i, species !== C.SPECIES_NONE);
  }
}

function SetPartySlotTilemap(pos: number, isFilled: boolean): void {
  const g = gS();
  const tilemap = isFilled ? tbin16("sPartySlotFilled_Tilemap") : tbin16("sPartySlotEmpty_Tilemap");
  let index = 3 * (3 * (pos - 1) + 1);
  index *= 4;
  index += 7;
  let src = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) g.partyMenuTilemapBuffer[index + j] = tilemap[src + j];
    src += 4;
    index += 12;
  }
}

function UpdatePartySlotColors(): void {
  SetPartySlotTilemaps();
  TilemapUtil_SetRect(TILEMAP_PARTY_MENU, 0, 0, 12, 22);
  TilemapUtil_Update(TILEMAP_PARTY_MENU);
  ScheduleBgCopyTilemapToVram(1);
}

function SetUpDoShowPartyMenu(): void {
  gS().showPartyMenuState = 0;
  PlaySE(C.SE_WIN_OPEN);
  SetUpShowPartyMenu();
}

function DoShowPartyMenu(): boolean {
  const g = gS();
  switch (g.showPartyMenuState) {
    case 0:
      if (!ShowPartyMenu()) {
        SetCursorInParty();
        g.showPartyMenuState++;
      }
      break;
    case 1:
      if (!UpdateCursorPos()) {
        if (g.setMosaic) StartDisplayMonMosaic();
        g.showPartyMenuState++;
      }
      break;
    case 2:
      return false;
  }
  return true;
}

function InitPokeStorageBg0(): void {
  // BGCNT_PRIORITY(0) | BGCNT_CHARBASE(0) | BGCNT_SCREENBASE(29)
  SetGpuReg(REG_OFFSET_BG0CNT, 0 | (0 << 2) | (29 << 8));
  LoadStdWindowGfx(1, 2, BG_PLTT_ID(13));
  FillBgTilemapBufferRect(0, 0, 0, 0, 32, 20, 17);
  CopyBgTilemapBufferToVram(0);
}

function PrintStorageMessage(id: number): void {
  const g = gS();
  const msg = sc<Array<{ text: unknown; format: number }>>("sMessages")[id];
  DynamicPlaceholderTextUtil_Reset();
  switch (msg.format) {
    case MSG_FMT_NONE:
      break;
    case MSG_FMT_MON_NAME_1:
    case MSG_FMT_MON_NAME_2:
    case MSG_FMT_MON_NAME_3:
      DynamicPlaceholderTextUtil_SetPlaceholderPtr(0, g.displayMonNickname);
      break;
    case MSG_FMT_RELEASE_MON_1:
    case MSG_FMT_RELEASE_MON_2:
    case MSG_FMT_RELEASE_MON_3:
      DynamicPlaceholderTextUtil_SetPlaceholderPtr(0, g.releaseMonName);
      break;
    case MSG_FMT_ITEM_NAME: {
      g.itemName.fill(EOS);
      let end = StringCopy(g.itemName, IsActiveItemMoving() ? GetMovingItemName() : g.displayMonTexts[3]);
      while (end > 0 && g.itemName[end - 1] === CHAR_SPACE) end--;
      g.itemName[end] = EOS;
      DynamicPlaceholderTextUtil_SetPlaceholderPtr(0, g.itemName);
      break;
    }
  }
  g.actionText = DynamicPlaceholderTextUtil_ExpandPlaceholders(rom.text(symName(msg.text)!));
  FillWindowPixelBuffer(1, PIXEL_FILL(1));
  AddTextPrinterParameterized(1, FONT_NORMAL_COPY_1, g.actionText, 0, 2, TEXT_SKIP_DRAW, null);
  DrawTextBorderOuter(1, 2, 13);
  PutWindowTilemap(1);
  CopyWindowToVram(1, COPYWIN_GFX);
  ScheduleBgCopyTilemapToVram(0);
}

function ShowYesNoWindow(cursorPos: number): void {
  CreateYesNoMenu(sc<WindowTemplate>("sYesNoWindowTemplate"), FONT_NORMAL_COPY_1, 0, 2, 11, 14, 1);
  Menu_MoveCursorNoWrapAround(cursorPos);
}

function ClearBottomWindow(): void {
  ClearStdWindowAndFrameToTransparent(1, false);
  ScheduleBgCopyTilemapToVram(0);
}

function AddWallpaperSetsMenu(): void {
  InitMenu();
  SetMenuText(MENU_TEXT_SCENERY_1);
  SetMenuText(MENU_TEXT_SCENERY_2);
  SetMenuText(MENU_TEXT_SCENERY_3);
  SetMenuText(MENU_TEXT_ETCETERA);
  AddMenu();
}

function AddWallpapersMenu(wallpaperSet: number): void {
  InitMenu();
  // The four wallpapers of each set are consecutive from MENU_TEXT_FOREST.
  const first = [MENU_TEXT_FOREST, MENU_TEXT_FOREST + 4, MENU_TEXT_FOREST + 8, MENU_TEXT_FOREST + 12][wallpaperSet];
  if (first !== undefined) {
    // 0: FOREST CITY DESERT SAVANNA; 1: CRAG VOLCANO SNOW CAVE; 2: BEACH SEAFLOOR RIVER SKY; 3: POLKADOT POKECENTER MACHINE SIMPLE
    for (let i = 0; i < 4; i++) SetMenuText(first + i);
  }
  AddMenu();
}

/** GetCurrentBoxOption */
export function GetCurrentBoxOption(): number {
  return sCurrentBoxOption;
}

function InitCursorItemIcon(): void {
  if (!IsCursorOnBoxTitle()) {
    if (sInPartyMenu) TryLoadItemIconAtPos(CURSOR_AREA_IN_PARTY, GetBoxCursorPosition());
    else TryLoadItemIconAtPos(CURSOR_AREA_IN_BOX, GetBoxCursorPosition());
  }
  if (sMovingItemId !== C.ITEM_NONE) {
    InitItemIconInCursor(sMovingItemId);
    StartCursorAnim(CURSOR_ANIM_FIST);
  }
}

function SetPokeStorageQuestLogEvent(action: number): void {
  const g = gS();
  let event: number;
  const box1 = GetMovingMonOriginalBoxId();
  const species1 = g.displayMonSpecies;
  let species2: number;
  let box2: number;
  if (sInPartyMenu) {
    box2 = TOTAL_BOXES_COUNT;
    species2 = GetMonData(sParty[GetBoxCursorPosition()], C.MON_DATA_SPECIES_OR_EGG);
  } else {
    box2 = StorageGetCurrentBox();
    species2 = GetCurrentBoxMonData(GetBoxCursorPosition(), C.MON_DATA_SPECIES_OR_EGG);
  }
  const questLogData = g.questLogData;
  switch (action) {
    default:
      return;
    case 0:
      if (sInPartyMenu) {
        if (box1 === TOTAL_BOXES_COUNT) return;
        event = C.QL_EVENT_SWITCHED_PARTY_MON_FOR_PC_MON;
      } else if (box1 === TOTAL_BOXES_COUNT) {
        // Should upmerge but doesn't
        event = C.QL_EVENT_SWITCHED_PARTY_MON_FOR_PC_MON;
      } else {
        event = box1 !== box2 ? C.QL_EVENT_SWITCHED_MONS_BETWEEN_BOXES : C.QL_EVENT_SWITCHED_MONS_WITHIN_BOX;
      }
      questLogData.species1 = species1;
      questLogData.species2 = species2;
      questLogData.box1 = box1;
      questLogData.box2 = box2;
      break;
    case 1:
      questLogData.species1 = species1;
      questLogData.species2 = C.SPECIES_NONE;
      questLogData.box1 = box1;
      questLogData.box2 = 0xff;
      if (sInPartyMenu) {
        if (box1 === TOTAL_BOXES_COUNT) return;
        event = C.QL_EVENT_WITHDREW_MON_PC;
      } else if (box1 === TOTAL_BOXES_COUNT) {
        event = C.QL_EVENT_DEPOSITED_MON_PC;
        questLogData.box1 = box2;
      } else if (box1 !== box2) {
        event = C.QL_EVENT_MOVED_MON_BETWEEN_BOXES;
        questLogData.box2 = box2;
      } else {
        event = C.QL_EVENT_MOVED_MON_WITHIN_BOX;
      }
      break;
    case 2:
      event = C.QL_EVENT_DEPOSITED_MON_PC;
      questLogData.species1 = species1;
      questLogData.species2 = C.SPECIES_NONE;
      questLogData.box1 = sDepositBoxId;
      questLogData.box2 = 0xff;
      break;
    case 3:
      event = C.QL_EVENT_SWITCHED_MULTIPLE_MONS;
      questLogData.species1 = C.SPECIES_NONE;
      questLogData.species2 = C.SPECIES_NONE;
      questLogData.box1 = box1;
      questLogData.box2 = box2;
      break;
  }
  SetQuestLogEvent(event, questLogData as never);
}

function UpdateBoxToSendMons(): void {
  if (sLastUsedBox !== StorageGetCurrentBox()) {
    flagClear(C.FLAG_SHOWN_BOX_WAS_FULL_MESSAGE);
    varSet(C.VAR_PC_BOX_TO_SEND_MON, StorageGetCurrentBox());
  }
}
