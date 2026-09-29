// pokemon_storage_system_internal.h: shared constants, types and the gStorage state of the PC box screen.
import * as C from "./generated/constants";
import { type MonMarkingsMenu } from "./monMarkings";
import { type Mon, zeroMon } from "./pokemon/mon";
import { save } from "./save";
import type { Sprite } from "./hw/sprite";
import type { WindowTemplate } from "./hw/window";

export const TOTAL_BOXES_COUNT = C.TOTAL_BOXES_COUNT;
export const IN_BOX_ROWS = C.IN_BOX_ROWS;
export const IN_BOX_COLUMNS = C.IN_BOX_COLUMNS;
export const IN_BOX_COUNT = C.IN_BOX_COUNT;
export const BOX_NAME_LENGTH = C.BOX_NAME_LENGTH;
export const PARTY_SIZE = C.PARTY_SIZE;
export const MAX_MON_ICONS = Math.max(IN_BOX_COUNT + PARTY_SIZE + 1, 40);
export const MAX_ITEM_ICONS = 3;

// enum: box options
export const OPTION_WITHDRAW = 0;
export const OPTION_DEPOSIT = 1;
export const OPTION_MOVE_MONS = 2;
export const OPTION_MOVE_ITEMS = 3;
export const OPTION_EXIT = 4;
export const OPTIONS_COUNT = 5;

// enum: menu texts
export const MENU_TEXT_CANCEL = 0;
export const MENU_TEXT_STORE = 1;
export const MENU_TEXT_WITHDRAW = 2;
export const MENU_TEXT_MOVE = 3;
export const MENU_TEXT_SHIFT = 4;
export const MENU_TEXT_PLACE = 5;
export const MENU_TEXT_SUMMARY = 6;
export const MENU_TEXT_RELEASE = 7;
export const MENU_TEXT_MARK = 8;
export const MENU_TEXT_JUMP = 9;
export const MENU_TEXT_WALLPAPER = 10;
export const MENU_TEXT_NAME = 11;
export const MENU_TEXT_TAKE = 12;
export const MENU_TEXT_GIVE = 13;
export const MENU_TEXT_GIVE2 = 14;
export const MENU_TEXT_SWITCH = 15;
export const MENU_TEXT_BAG = 16;
export const MENU_TEXT_INFO = 17;
export const MENU_TEXT_SCENERY_1 = 18;
export const MENU_TEXT_SCENERY_2 = 19;
export const MENU_TEXT_SCENERY_3 = 20;
export const MENU_TEXT_ETCETERA = 21;
export const MENU_TEXT_FOREST = 22;
export const MENU_TEXT_CITY = 23;
export const MENU_TEXT_DESERT = 24;
export const MENU_TEXT_SAVANNA = 25;
export const MENU_TEXT_CRAG = 26;
export const MENU_TEXT_VOLCANO = 27;
export const MENU_TEXT_SNOW = 28;
export const MENU_TEXT_CAVE = 29;
export const MENU_TEXT_BEACH = 30;
export const MENU_TEXT_SEAFLOOR = 31;
export const MENU_TEXT_RIVER = 32;
export const MENU_TEXT_SKY = 33;
export const MENU_TEXT_POLKADOT = 34;
export const MENU_TEXT_POKECENTER = 35;
export const MENU_TEXT_MACHINE = 36;
export const MENU_TEXT_SIMPLE = 37;

// enum: input handler results
export const INPUT_NONE = 0;
export const INPUT_MOVE_CURSOR = 1;
export const INPUT_CLOSE_BOX = 4;
export const INPUT_SHOW_PARTY = 5;
export const INPUT_HIDE_PARTY = 6;
export const INPUT_BOX_OPTIONS = 7;
export const INPUT_IN_MENU = 8;
export const INPUT_SCROLL_RIGHT = 9;
export const INPUT_SCROLL_LEFT = 10;
export const INPUT_DEPOSIT = 11;
export const INPUT_WITHDRAW = 12;
export const INPUT_MOVE_MON = 13;
export const INPUT_SHIFT_MON = 14;
export const INPUT_PLACE_MON = 15;
export const INPUT_TAKE_ITEM = 16;
export const INPUT_GIVE_ITEM = 17;
export const INPUT_SWITCH_ITEMS = 18;
export const INPUT_PRESSED_B = 19;
export const INPUT_MULTIMOVE_START = 20;
export const INPUT_MULTIMOVE_CHANGE_SELECTION = 21;
export const INPUT_MULTIMOVE_SINGLE = 22;
export const INPUT_MULTIMOVE_GRAB_SELECTION = 23;
export const INPUT_MULTIMOVE_UNABLE = 24;
export const INPUT_MULTIMOVE_MOVE_MONS = 25;
export const INPUT_MULTIMOVE_PLACE_MONS = 26;

export const RELEASE_MON_NOT_ALLOWED = 0;
export const RELEASE_MON_ALLOWED = 1;
export const RELEASE_MON_UNDETERMINED = -1;

export const MODE_PARTY = 0;
export const MODE_BOX = 1;
export const MODE_MOVE = 2;

export const CURSOR_AREA_IN_BOX = 0;
export const CURSOR_AREA_IN_PARTY = 1;
export const CURSOR_AREA_BOX_TITLE = 2;
export const CURSOR_AREA_BUTTONS = 3;
export const CURSOR_AREA_IN_HAND = CURSOR_AREA_BOX_TITLE;

export const CHANGE_GRAB = 0;
export const CHANGE_PLACE = 1;
export const CHANGE_SHIFT = 2;

export const MULTIMOVE_START = 0;
export const MULTIMOVE_SINGLE = 1;
export const MULTIMOVE_CHANGE_SELECTION = 2;
export const MULTIMOVE_GRAB_SELECTION = 3;
export const MULTIMOVE_MOVE_MONS = 4;
export const MULTIMOVE_PLACE_MONS = 5;

export const PALTAG_MON_ICON_0 = 56000;
export const PALTAG_DISPLAY_MON = 56006;
export const PALTAG_MISC_1 = 56007;
export const PALTAG_MARKING_COMBO = 56008;
export const PALTAG_BOX_TITLE = 56009;
export const PALTAG_MISC_2 = 56010;
export const PALTAG_ITEM_ICON_0 = 56011;
export const PALTAG_MARKING_MENU = 56014;

export const GFXTAG_CURSOR = 0;
export const GFXTAG_CURSOR_SHADOW = 1;
export const GFXTAG_DISPLAY_MON = 2;
export const GFXTAG_BOX_TITLE = 3;
export const GFXTAG_BOX_TITLE_ALT = 4;
export const GFXTAG_WAVEFORM = 5;
export const GFXTAG_BOX_SCROLL_ARROW = 6;
export const GFXTAG_ITEM_ICON_0 = 7;
export const GFXTAG_CHOOSE_BOX_MENU_CENTER = 10;
export const GFXTAG_CHOOSE_BOX_MENU_CORNERS = 11;
export const GFXTAG_MARKING_MENU = 13;
export const GFXTAG_MARKING_COMBO = 16;
export const GFXTAG_MON_ICON = 18;

export const BOXID_NONE_CHOSEN = 200;
export const BOXID_CANCELED = 201;

export const CURSOR_ANIM_BOUNCE = 0;
export const CURSOR_ANIM_STILL = 1;
export const CURSOR_ANIM_OPEN = 2;
export const CURSOR_ANIM_FIST = 3;

export const RELEASE_ANIM_RELEASE = 0;
export const RELEASE_ANIM_COME_BACK = 1;

export const ITEM_ANIM_NONE = 0;
export const ITEM_ANIM_APPEAR = 1;
export const ITEM_ANIM_DISAPPEAR = 2;
export const ITEM_ANIM_PICK_UP = 3;
export const ITEM_ANIM_PUT_DOWN = 4;
export const ITEM_ANIM_PUT_AWAY = 5;
export const ITEM_ANIM_LARGE = 6;

/** struct StorageMenu. */
export type StorageMenu = { text: Uint8Array; textId: number };

/** struct ChooseBoxMenu. */
export type ChooseBoxMenu = {
  menuSprite: Sprite | null;
  menuCornerSprites: Array<Sprite | null>;
  arrowSprites: Array<Sprite | null>;
  strbuf: Uint8Array;
  loadedPalette: boolean;
  tileTag: number;
  paletteTag: number;
  curBox: number;
  subpriority: number;
};

/** struct PokeStorageItemIcon. */
export type PokeStorageItemIcon = {
  sprite: Sprite | null;
  /** OBJ VRAM byte offset of the icon's tiles. */
  tiles: number;
  palIndex: number;
  cursorArea: number;
  cursorPos: number;
  active: boolean;
};

/** struct QuestLogEvent_MovedBoxMon. */
export type QuestLogMovedBoxMon = { species1: number; species2: number; box1: number; box2: number };

/** A sprite slot addressed by the C `struct Sprite **` pointers (shiftMonSpritePtr / releaseMonSpritePtr). */
export type SpriteSlot = { get: () => Sprite | null; set: (sprite: Sprite | null) => void };

/** struct PokemonStorageSystemData (the fields the port reads). */
export type PokemonStorageSystemData = {
  state: number;
  boxOption: number;
  screenChangeType: number;
  isReopening: boolean;
  taskId: number;
  partyMenuTilemapBuffer: Uint16Array;
  partyMenuY: number;
  partyMenuMoveTimer: number;
  showPartyMenuState: number;
  closeBoxFlashing: boolean;
  closeBoxFlashTimer: number;
  closeBoxFlashState: boolean;
  newCurrBoxId: number;
  bg2_X: number;
  scrollSpeed: number;
  scrollTimer: number;
  wallpaperOffset: number;
  boxTitleTiles: Uint8Array;
  boxTitleCycleId: number;
  boxTitlePal: Uint16Array;
  boxTitlePalOffset: number;
  boxTitleAltPalOffset: number;
  curBoxTitleSprites: Array<Sprite | null>;
  nextBoxTitleSprites: Array<Sprite | null>;
  arrowSprites: Array<Sprite | null>;
  wallpaperPalBits: number;
  wallpaperSetId: number;
  wallpaperId: number;
  wallpaperTilemap: Uint16Array;
  wallpaperChangeState: number;
  scrollState: number;
  scrollToBoxId: number;
  scrollDirection: number;
  wallpaperLoadState: number;
  wallpaperLoadBoxId: number;
  wallpaperLoadDir: number;
  movingMonSprite: Sprite | null;
  partySprites: Array<Sprite | null>;
  boxMonsSprites: Array<Sprite | null>;
  shiftMonSpritePtr: SpriteSlot | null;
  releaseMonSpritePtr: SpriteSlot | null;
  numIconsPerSpecies: number[];
  iconSpeciesList: number[];
  boxSpecies: number[];
  boxPersonalities: number[];
  incomingBoxId: number;
  shiftTimer: number;
  numPartySpritesToCompact: number;
  iconScrollDistance: number;
  iconScrollPos: number;
  iconScrollSpeed: number;
  iconScrollNumIncoming: number;
  iconScrollCurColumn: number;
  iconScrollDirection: number;
  iconScrollState: number;
  iconScrollToBoxId: number;
  menuWindow: WindowTemplate;
  menuItems: StorageMenu[];
  menuItemsCount: number;
  menuWidth: number;
  menuWindowId: number;
  cursorSprite: Sprite | null;
  cursorShadowSprite: Sprite | null;
  cursorNewX: number;
  cursorNewY: number;
  cursorSpeedX: number;
  cursorSpeedY: number;
  cursorTargetX: number;
  cursorTargetY: number;
  cursorMoveSteps: number;
  cursorVerticalWrap: number;
  cursorHorizontalWrap: number;
  newCursorArea: number;
  newCursorPosition: number;
  cursorPrevPartyPos: number;
  cursorFlipTimer: number;
  cursorPalNums: number[];
  displayMonPalette: Uint16Array | null;
  displayMonPersonality: number;
  displayMonSpecies: number;
  displayMonItemId: number;
  setMosaic: boolean;
  displayMonMarkings: number;
  displayMonLevel: number;
  displayMonIsEgg: boolean;
  displayMonNickname: Uint8Array;
  displayMonTexts: Uint8Array[];
  monPlaceChangeFunc: (() => boolean) | null;
  monPlaceChangeState: number;
  shiftBoxId: number;
  markingComboSprite: Sprite | null;
  waveformSprites: Array<Sprite | null>;
  markingComboTilesPtr: number;
  markMenu: MonMarkingsMenu;
  chooseBoxMenu: ChooseBoxMenu;
  movingMon: Mon;
  tempMon: Mon;
  releaseMonStatus: number;
  releaseMonStatusResolved: boolean;
  isSurfMon: boolean;
  isDiveMon: boolean;
  releaseCheckBoxId: number;
  releaseCheckBoxPos: number;
  releaseBoxId: number;
  releaseBoxPos: number;
  releaseCheckState: number;
  restrictedMoveList: number[];
  summaryLastIndex: number;
  summaryCursorPos: number;
  summaryScreenMode: number;
  /** summaryMonPtr: the party slots or the current box, as the summary screen's `party` list. */
  summaryMons: Mon[];
  actionText: Uint8Array;
  boxTitleText: Uint8Array;
  releaseMonName: Uint8Array;
  itemName: Uint8Array;
  inBoxMovingMode: number;
  multiMoveWindowId: number;
  itemIcons: PokeStorageItemIcon[];
  movingItemId: number;
  itemInfoWindowOffset: number;
  questLogData: QuestLogMovedBoxMon;
  displayMonPalOffset: number;
  displayMonTilePtr: number;
  displayMonSprite: Sprite | null;
  displayMonPalBuffer: Uint16Array;
  tileBuffer: Uint8Array;
  itemIconBuffer: Uint8Array;
  wallpaperBgTilemapBuffer: Uint16Array;
  menuTilemapBuffer: Uint16Array;
};

export const stState = { gStorage: null as PokemonStorageSystemData | null };

/** gStorage (the screen's data block); only valid between EnterPokeStorage and FreePokeStorageData. */
export function gS(): PokemonStorageSystemData {
  return stState.gStorage!;
}

/** The six party slots the screen edits (gPlayerParty with its empty slots); written back with StorePartySlots. */
export const sParty: Mon[] = Array.from({ length: PARTY_SIZE }, zeroMon);

/** Load gPlayerParty into the six-slot working array. */
export function LoadPartySlots(): void {
  for (let i = 0; i < PARTY_SIZE; i++) sParty[i] = (save.party[i] as Mon | undefined) ?? zeroMon();
}

/** Write the working slots back into the save's party (empty slots dropped, order kept). */
export function StorePartySlots(): void {
  save.party = sParty.filter((mon) => mon.species !== 0);
}
