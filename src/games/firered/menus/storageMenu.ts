// Port of pokemon_storage_system_menu.c (all 29 C functions).
// Faithful port of the PC storage menu and ChooseBox menu:
// - Task_PCMainMenu state machine (STATE_LOAD, STATE_FADE_IN, STATE_HANDLE_INPUT, STATE_ERROR_MSG, STATE_ENTER_PC)
// - Main PC menu window (sWindowTemplate_MainMenu) with options WITHDRAW, DEPOSIT, MOVE POKéMON, MOVE ITEMS, SEE YA!
// - Party count checks and error messages (gText_PartyFull, gText_JustOnePkmn)
// - Box selection popup (ChooseBoxMenu) with sprite corners, sliding arrows, box name and count string formatting
// - Party and box counting functions: CountMonsInBox, CountPartyMons, CountPartyNonEggMons, etc.
// - Integration with pokemon/storage.ts rules for the underlying box operations.

// pokemon_storage_system_menu.c: the PC main menu (Task_PCMainMenu), the tile-buffer text helpers, the party/box counters and
// the Deposit/Jump "choose box" popup. The box screen itself (EnterPokeStorage) is storageSystemTasks.ts.
//
// Browser adaptation: Task_PCMainMenu runs on the overworld's canvas windows (the field stays visible behind the menu, as
// on hardware), and entering the box screen hosts the hardware scene through fieldMenu; CB2_ExitPokeStorage returns to
// the field and re-opens the main menu (FieldTask_ReturnToPcMenu).

import type { Game } from "../game";
import { tasks } from "../gba/tasks";
import { DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP, A_BUTTON, B_BUTTON, JOY_NEW } from "../gba/input";
import { sound } from "../audio/sound";
import { save, varGet, SV } from "../save";
import * as C from "../generated/constants";
import { rom } from "../rom";
import { incbin } from "../hw/assets";
import { FONT_NORMAL, FONT_NORMAL_COPY_1 } from "../gba/font";
import { printText, TEXT_COLOR_DARK_GRAY, TEXT_COLOR_LIGHT_GRAY, TEXT_COLOR_WHITE } from "../gba/textPrinter";
import { Window } from "../gba/window";
import { paletteFade, FADE_FROM_BLACK, FADE_TO_BLACK, RGB_BLACK } from "../gba/fade";
import { Menu, MENU_NOTHING_CHOSEN } from "./menu";
import { MENU_B_PRESSED } from "../hw/menu";
import { GetMenuCursorDimensionByFont } from "../hw/menu";
import { StringCopy, StringLength_Multibyte, ConvertIntToDecimalStringN } from "../generated/stringUtil";
import { STR_CONV_MODE_RIGHT_ALIGN, CHAR_SPACE, EOS, encode } from "../gba/charmap";
import { GetBoxMonDataAt, GetBoxNamePtr } from "../pokemon/storage";
import { resetPokemonStorageSystem } from "../pokemon/storage";
import { AddWindow, FillWindowPixelBuffer, gWindows, PIXEL_FILL, RemoveWindow, type WindowTemplate } from "../hw/window";
import { AddTextPrinterParameterized4 } from "../hw/text";
import { affineAnimsFrom, animsFrom, oamFrom } from "../hw/cdataSprite";
import {
  CreateSprite, DestroySprite, FreeSpritePaletteByTag, FreeSpriteTilesByTag, GetSpriteTileStartByTag, gDummySpriteAffineAnimTable,
  gDummySpriteAnimTable, gSprites, LoadSpritePalette, LoadSpriteSheets, oamData, SPRITE_SHAPE, SPRITE_SIZE, SpriteCallbackDummy,
  StartSpriteAnim, type Sprite, type SpriteTemplate,
} from "../hw/sprite";
import { ppu } from "../hw/ppu";
import { fieldMenu } from "./fieldMenus";
import { CreateChooseBoxArrows } from "../storageSystemGraphics";
import { EnterPokeStorage, GetCurrentBoxOption, preloadStorageSystem } from "../storageSystemTasks";
import {
  BOX_NAME_LENGTH, BOXID_CANCELED, BOXID_NONE_CHOSEN, type ChooseBoxMenu, IN_BOX_COUNT, OPTION_DEPOSIT, OPTION_EXIT, OPTION_WITHDRAW,
  OPTIONS_COUNT, PARTY_SIZE, TOTAL_BOXES_COUNT,
} from "../storageSystemInternal";

export { BOXID_CANCELED, BOXID_NONE_CHOSEN, IN_BOX_COUNT, OPTIONS_COUNT, PARTY_SIZE, TOTAL_BOXES_COUNT };

const TEXT_DYNAMIC_COLOR_5 = 14;
const TEXT_DYNAMIC_COLOR_6 = 15;

let sPreviousBoxOption = 0;
let sChooseBoxMenu: ChooseBoxMenu | null = null;
/** How the box screen hands the player back to the field (the fieldMenu scene's `close`). */
let sReturnToField: (() => void) | null = null;

const sMainMenuTexts = [
  { text: "gText_WithdrawPokemon", desc: "gText_WithdrawMonDescription" },
  { text: "gText_DepositPokemon", desc: "gText_DepositMonDescription" },
  { text: "gText_MovePokemon", desc: "gText_MoveMonDescription" },
  { text: "gText_MoveItems", desc: "gText_MoveItemsDescription" },
  { text: "gText_SeeYa", desc: "gText_SeeYaDescription" },
];

const sWindowTemplate_MainMenu = (): WindowTemplate => ({ bg: 0, tilemapLeft: 1, tilemapTop: 1, width: 17, height: 10, paletteNum: 15, baseBlock: 0x001 });

/** DrawTextWindowAndBufferTiles: render `string` into a 24x2 tile window and copy its first tiles into `dst`. */
export function DrawTextWindowAndBufferTiles(
  string: ArrayLike<number>,
  dst: Uint8Array,
  zero1: number,
  zero2: number,
  _unused: unknown,
  bytesToBuffer: number,
): void {
  const winTemplate: WindowTemplate = { bg: 0, tilemapLeft: 0, tilemapTop: 0, width: 24, height: 2, paletteNum: 0, baseBlock: 0 };
  const windowId = AddWindow(winTemplate);
  FillWindowPixelBuffer(windowId, PIXEL_FILL(zero2));
  const tileData = gWindows[windowId].tileData!;
  let tileData1 = 0;
  let tileData2 = winTemplate.width * 32;
  const txtColor = [!zero1 ? C.TEXT_COLOR_TRANSPARENT : zero2, TEXT_DYNAMIC_COLOR_6, TEXT_DYNAMIC_COLOR_5];
  AddTextPrinterParameterized4(windowId, FONT_NORMAL_COPY_1, 0, 2, 0, 0, txtColor, -1, string);
  let tileBytesToBuffer = bytesToBuffer;
  if (tileBytesToBuffer > 6) tileBytesToBuffer = 6;
  const remainingBytes = bytesToBuffer - 6;
  let d = 0;
  if (tileBytesToBuffer > 0) {
    for (let i = tileBytesToBuffer; i !== 0; i--) {
      dst.set(tileData.subarray(tileData1, tileData1 + 0x80), d);
      dst.set(tileData.subarray(tileData2, tileData2 + 0x80), d + 0x80);
      tileData1 += 0x80;
      tileData2 += 0x80;
      d += 0x100;
    }
  }
  // Never used. bytesToBuffer is always passed <= 6, so remainingBytes is always <= 0 here
  if (remainingBytes > 0) dst.fill((zero2 << 4) | zero2, d, d + remainingBytes * 0x100);
  RemoveWindow(windowId);
}

/** PrintStringToBufferCopyNow: render `string` into a temporary window and copy both tile rows into `dst`. */
export function PrintStringToBufferCopyNow(
  string: ArrayLike<number>,
  dst: Uint8Array,
  offset: number,
  bgColor: number,
  fgColor: number,
  shadowColor: number,
  _unused: unknown,
): void {
  const winTemplate: WindowTemplate = { bg: 0, tilemapLeft: 0, tilemapTop: 0, width: StringLength_Multibyte(string), height: 2, paletteNum: 0, baseBlock: 0 };
  const size = winTemplate.width * 32;
  const windowId = AddWindow(winTemplate);
  FillWindowPixelBuffer(windowId, PIXEL_FILL(bgColor));
  const tileData = gWindows[windowId].tileData!;
  const txtColor = [bgColor, fgColor, shadowColor];
  AddTextPrinterParameterized4(windowId, FONT_NORMAL_COPY_1, 0, 2, 0, 0, txtColor, -1, string);
  dst.set(tileData.subarray(0, size), 0);
  dst.set(tileData.subarray(size, size * 2), offset);
  RemoveWindow(windowId);
}

/** CountMonsInBox */
export function CountMonsInBox(boxId: number): number {
  let count = 0;
  for (let i = 0; i < IN_BOX_COUNT; i++) {
    if (GetBoxMonDataAt(boxId, i, C.MON_DATA_SPECIES) !== C.SPECIES_NONE) count++;
  }
  return count;
}

/** GetFirstFreeBoxSpot */
export function GetFirstFreeBoxSpot(boxId: number): number {
  for (let i = 0; i < IN_BOX_COUNT; i++) {
    if (GetBoxMonDataAt(boxId, i, C.MON_DATA_SPECIES) === C.SPECIES_NONE) return i;
  }
  return -1; // all spots are taken
}

/** CountPartyNonEggMons */
export function CountPartyNonEggMons(): number {
  let count = 0;
  for (let i = 0; i < PARTY_SIZE; i++) {
    const mon = save.party[i];
    if (mon?.species && !mon.isEgg) count++;
  }
  return count;
}

/** CountPartyAliveNonEggMonsExcept */
export function CountPartyAliveNonEggMonsExcept(slotToIgnore: number): number {
  let count = 0;
  for (let i = 0; i < PARTY_SIZE; i++) {
    if (i === slotToIgnore) continue;
    const mon = save.party[i];
    if (mon?.species && !mon.isEgg && (mon.hp ?? 1) > 0) count++;
  }
  return count;
}

/** CountPartyAliveNonEggMons_IgnoreVar0x8004Slot */
export function CountPartyAliveNonEggMons_IgnoreVar0x8004Slot(): number {
  const slot = varGet(SV.x8004);
  return CountPartyAliveNonEggMonsExcept(slot);
}

/** CountPartyMons */
export function CountPartyMons(): number {
  let count = 0;
  for (let i = 0; i < PARTY_SIZE; i++) {
    if (save.party[i]?.species) count++;
  }
  return count;
}

/** StringCopyAndFillWithSpaces */
export function StringCopyAndFillWithSpaces(dst: Uint8Array, src: ArrayLike<number>, n: number): number {
  let str = StringCopy(dst, src);
  for (; str < n; str++) dst[str] = CHAR_SPACE;
  dst[str] = EOS;
  return str;
}

/** UnusedWriteRectCpu */
export function UnusedWriteRectCpu(
  dest: Uint16Array,
  dest_left: number,
  dest_top: number,
  src: Uint16Array,
  src_left: number,
  src_top: number,
  dest_width: number,
  dest_height: number,
  src_width: number,
): void {
  for (let i = 0; i < dest_height; i++) {
    const dstIdx = (dest_top + i) * 0x20 + dest_left;
    const srcIdx = (src_top + i) * src_width + src_left;
    for (let j = 0; j < dest_width; j++) {
      dest[dstIdx + j] = src[srcIdx + j] || 0;
    }
  }
}

/** UnusedWriteRectDma */
export function UnusedWriteRectDma(
  dest: Uint16Array,
  dest_left: number,
  dest_top: number,
  width: number,
  height: number,
): void {
  for (let i = 0; i < height; i++) {
    const dstIdx = (dest_top + i) * 0x20 + dest_left;
    dest.fill(0, dstIdx, dstIdx + width);
  }
}

const STATE_LOAD = 0;
const STATE_FADE_IN = 1;
const STATE_HANDLE_INPUT = 2;
const STATE_ERROR_MSG = 3;
const STATE_ENTER_PC = 4;

let activeGameInstance: Game | null = null;
let currentPcWindowId = { id: 0 };

/** CreatePCMainMenu */
// Browser adaptation: window 0 (the field dialogue box) and the main menu
// window live on the canvas field layer (gba/window.ts), not on BG0.
let pcMenuWindow: Window | null = null;
let pcMenu: Menu | null = null;

function descWindow(game: Game): Window {
  const ow = game.overworld;
  // Window 0 is the script message box still showing Text_OpenedPkmnStorage.
  let w = ow.messageBox.window;
  if (!w || !ow.windows.windows.includes(w)) {
    w = new Window(2, 15, 26, 4);
    ow.windows.add(w);
    ow.messageBox.window = w;
  }
  w.frame = "dialogue";
  w.visible = true;
  return w;
}

/** FillWindowPixelBuffer(0, PIXEL_FILL(1)) + AddTextPrinterParameterized2(0, FONT_NORMAL, text, …, DARK_GRAY, WHITE, LIGHT_GRAY) */
function printPcMenuMessage(text: ArrayLike<number>): void {
  if (!activeGameInstance) return;
  const w = descWindow(activeGameInstance);
  w.fill(TEXT_COLOR_WHITE);
  printText(w, FONT_NORMAL, text, 0, 1, { fg: TEXT_COLOR_DARK_GRAY, bg: TEXT_COLOR_WHITE, shadow: TEXT_COLOR_LIGHT_GRAY });
}

/** CreatePCMainMenu: sWindowTemplate_MainMenu with a std frame, PrintTextArray and Menu_InitCursor. */
export function CreatePCMainMenu(whichMenu: number, windowIdPtr: { id: number }): void {
  if (!activeGameInstance) return;
  const t = sWindowTemplate_MainMenu();
  const w = new Window(t.tilemapLeft, t.tilemapTop, t.width, t.height);
  w.frame = "std";
  w.frameType = save.options.frameType;
  w.fill(1);
  // PrintTextArray(windowId, FONT_NORMAL, cursorWidth, 2, 16, …)
  const left = GetMenuCursorDimensionByFont(FONT_NORMAL, 0);
  sMainMenuTexts.forEach((item, i) => printText(w, FONT_NORMAL, rom.text(item.text), left, 2 + 16 * i));
  activeGameInstance.overworld.windows.add(w);
  pcMenuWindow = w;
  pcMenu = new Menu(w, FONT_NORMAL, 0, 2, 16, OPTIONS_COUNT, whichMenu);
  windowIdPtr.id = 1;
}

/** ClearStdWindowAndFrame(0) + ClearStdWindowAndFrame(tWindowId) */
function clearPcMainMenu(): void {
  const ow = activeGameInstance?.overworld;
  if (pcMenuWindow && ow) ow.windows.remove(pcMenuWindow);
  pcMenuWindow = null;
  pcMenu = null;
  ow?.messageBox.hide();
}

/** Task_PCMainMenu (tState = data[0], tSelectedOption = data[1], tInput = data[2], tNextOption = data[3]) */
export function Task_PCMainMenu(taskId: number): void {
  const task = tasks.tasks[taskId];
  if (!task || !task.isActive) return;

  switch (task.data[0]) {
    case STATE_LOAD:
      CreatePCMainMenu(task.data[1], currentPcWindowId);
      task.data[15] = currentPcWindowId.id;
      printPcMenuMessage(rom.text(sMainMenuTexts[task.data[1]]!.desc));
      task.data[0]++;
      break;

    case STATE_FADE_IN:
      // IsWeatherNotFadingIn
      if (!paletteFade.active) task.data[0]++;
      break;

    case STATE_HANDLE_INPUT: {
      if (!pcMenu) return;
      task.data[2] = pcMenu.processInput();
      switch (task.data[2]) {
        case MENU_NOTHING_CHOSEN:
          task.data[3] = task.data[1];
          if (JOY_NEW(DPAD_UP) && --task.data[3] < 0) task.data[3] = OPTIONS_COUNT - 1;
          if (JOY_NEW(DPAD_DOWN) && ++task.data[3] > OPTIONS_COUNT - 1) task.data[3] = 0;
          if (task.data[1] !== task.data[3]) {
            task.data[1] = task.data[3];
            printPcMenuMessage(rom.text(sMainMenuTexts[task.data[1]]!.desc));
          }
          break;
        case MENU_B_PRESSED:
        case OPTION_EXIT:
          clearPcMainMenu();
          tasks.destroy(taskId);
          // UnlockPlayerFieldControls + ScriptContext_Enable
          activeGameInstance?.overworld.script.ScriptContext_Enable();
          break;
        default:
          if (task.data[2] === OPTION_WITHDRAW && CountPartyMons() === PARTY_SIZE) {
            printPcMenuMessage(rom.text("gText_PartyFull"));
            task.data[0] = STATE_ERROR_MSG;
          } else if (task.data[2] === OPTION_DEPOSIT && CountPartyMons() === 1) {
            printPcMenuMessage(rom.text("gText_JustOnePkmn"));
            task.data[0] = STATE_ERROR_MSG;
          } else {
            paletteFade.fadeScreen(FADE_TO_BLACK, 0);
            task.data[0] = STATE_ENTER_PC;
          }
          break;
      }
      break;
    }

    case STATE_ERROR_MSG:
      if (JOY_NEW(A_BUTTON | B_BUTTON)) {
        printPcMenuMessage(rom.text(sMainMenuTexts[task.data[1]]!.desc));
        task.data[0] = STATE_HANDLE_INPUT;
      } else if (JOY_NEW(DPAD_UP)) {
        pcMenu?.move(-1, true);
        task.data[1] = pcMenu?.cursorPos ?? 0;
        printPcMenuMessage(rom.text(sMainMenuTexts[task.data[1]]!.desc));
        task.data[0] = STATE_HANDLE_INPUT;
      } else if (JOY_NEW(DPAD_DOWN)) {
        pcMenu?.move(1, true);
        task.data[1] = pcMenu?.cursorPos ?? 0;
        printPcMenuMessage(rom.text(sMainMenuTexts[task.data[1]]!.desc));
        task.data[0] = STATE_HANDLE_INPUT;
      }
      break;

    case STATE_ENTER_PC:
      if (!paletteFade.active) {
        // CleanupOverworldWindowsAndTilemaps + EnterPokeStorage
        const choice = task.data[2];
        clearPcMainMenu();
        tasks.destroy(taskId);
        // The storage screen loads its own palettes (ResetPaletteFade in its
        // init); the canvas field fade must not stay over it.
        paletteFade.clear();
        if (activeGameInstance) EnterPokeStorageScene(activeGameInstance, choice);
      }
      break;
  }
}

/** ShowPokemonStorageSystemPC */
export function ShowPokemonStorageSystemPC(game?: Game): void {
  if (game) activeGameInstance = game;
  void preloadStorageSystem(); // the box screen's data loads while the main menu is up
  const taskId = tasks.create(Task_PCMainMenu, 80);
  const task = tasks.tasks[taskId];
  if (task) {
    task.data[0] = STATE_LOAD;
    task.data[1] = 0;
  }
}

/** FieldTask_ReturnToPcMenu */
export function FieldTask_ReturnToPcMenu(): void {
  const taskId = tasks.create(Task_PCMainMenu, 80);
  const task = tasks.tasks[taskId];
  if (task) {
    task.data[0] = STATE_LOAD;
    task.data[1] = sPreviousBoxOption;
    // CB2_ReturnToField fades the field back in; STATE_FADE_IN waits for it.
    paletteFade.fadeScreen(FADE_FROM_BLACK, 0);
    Task_PCMainMenu(taskId);
  }
}

/** Host the box screen in a hardware scene (EnterPokeStorage), returning to the PC menu when it closes. */
function EnterPokeStorageScene(game: Game, option: number): void {
  sPreviousBoxOption = option;
  void preloadStorageSystem().then(() => {
    fieldMenu(game, (close) => {
      sReturnToField = () => {
        // CB2_ReturnToField: the field comes back from black (FieldTask_ReturnToPcMenu fades it in).
        paletteFade.fill(RGB_BLACK);
        close();
        FieldTask_ReturnToPcMenu();
      };
      EnterPokeStorage(option);
    }, false);
  });
}

/** CB2_ExitPokeStorage */
export function CB2_ExitPokeStorage(): void {
  sPreviousBoxOption = GetCurrentBoxOption();
  const returnToField = sReturnToField;
  sReturnToField = null;
  returnToField?.();
}

/** ResetPokemonStorageSystem */
export function ResetPokemonStorageSystem(): void {
  resetPokemonStorageSystem();
}

/** LoadChooseBoxMenuGfx */
export function LoadChooseBoxMenuGfx(menu: ChooseBoxMenu, tileTag: number, palTag: number, subpriority: number, loadPal: boolean): void {
  const g = "pokemon_storage_system_menu.c:";
  if (loadPal) LoadSpritePalette({ data: incbin(g + "sChooseBoxMenu_Pal"), tag: palTag }); // Always false
  LoadSpriteSheets([
    { data: incbin(g + "sChooseBoxMenuCenter_Gfx"), size: 0x800, tag: tileTag },
    { data: incbin(g + "sChooseBoxMenuCorners_Gfx"), size: 0x180, tag: tileTag + 1 },
  ]);
  sChooseBoxMenu = menu;
  menu.tileTag = tileTag;
  menu.paletteTag = palTag;
  menu.subpriority = subpriority;
  menu.loadedPalette = loadPal;
}

/** FreeBoxSelectionPopupSpriteGfx */
export function FreeBoxSelectionPopupSpriteGfx(): void {
  if (sChooseBoxMenu!.loadedPalette) FreeSpritePaletteByTag(sChooseBoxMenu!.paletteTag);
  FreeSpriteTilesByTag(sChooseBoxMenu!.tileTag);
  FreeSpriteTilesByTag(sChooseBoxMenu!.tileTag + 1);
}

/** CreateChooseBoxMenuSprites */
export function CreateChooseBoxMenuSprites(curBox: number): void {
  ChooseBoxMenu_CreateSprites(curBox);
}

/** DestroyChooseBoxMenuSprites */
export function DestroyChooseBoxMenuSprites(): void {
  ChooseBoxMenu_DestroySprites();
}

/** HandleBoxChooseSelectionInput */
export function HandleBoxChooseSelectionInput(): number {
  if (JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    return BOXID_CANCELED;
  }
  if (JOY_NEW(A_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    return sChooseBoxMenu!.curBox;
  }
  if (JOY_NEW(DPAD_LEFT)) {
    sound.playSE(C.SE_SELECT);
    ChooseBoxMenu_MoveLeft();
  } else if (JOY_NEW(DPAD_RIGHT)) {
    sound.playSE(C.SE_SELECT);
    ChooseBoxMenu_MoveRight();
  }
  return BOXID_NONE_CHOSEN;
}

/** ChooseBoxMenu_CreateSprites */
function ChooseBoxMenu_CreateSprites(curBox: number): void {
  const m = sChooseBoxMenu!;
  const sText_OutOf30 = encode("/30");
  const oamCenter = oamData({ size: SPRITE_SIZE("64x64"), paletteNum: 1 });
  const oamCorner = oamData({ shape: SPRITE_SHAPE("8x32"), size: SPRITE_SIZE("8x32"), paletteNum: 1 });
  const template: SpriteTemplate = {
    tileTag: m.tileTag, paletteTag: m.paletteTag, oam: oamCenter, anims: gDummySpriteAnimTable, images: null,
    affineAnims: gDummySpriteAffineAnimTable, callback: SpriteCallbackDummy,
  };
  m.curBox = curBox;
  let spriteId = CreateSprite(template, 160, 96, 0);
  m.menuSprite = gSprites[spriteId];

  template.oam = oamCorner;
  template.tileTag = m.tileTag + 1;
  template.anims = animsFrom({ $sym: "sAnims_ChooseBoxMenu" });
  for (let i = 0; i < m.menuCornerSprites.length; i++) {
    // corner sprites are created in order of top left, bottom left, top right, bottom right
    spriteId = CreateSprite(template, 124, 80, m.subpriority); // place at top left
    const corner = gSprites[spriteId];
    m.menuCornerSprites[i] = corner;
    let animNum = 0;
    if (i & 2) {
      corner.x = 196; // move to right
      animNum = 2;
    }
    if (i & 1) {
      corner.y = 112; // move to bottom
      corner.oam.size = SPRITE_SIZE("8x16");
      animNum++;
    }
    StartSpriteAnim(corner, animNum);
  }
  for (let i = 0; i < m.arrowSprites.length; i++) {
    m.arrowSprites[i] = CreateChooseBoxArrows(72 * i + 124, 88, i, 0, m.subpriority);
    if (m.arrowSprites[i]) {
      m.arrowSprites[i]!.data[0] = i === 0 ? -1 : 1;
      m.arrowSprites[i]!.callback = SpriteCB_ChooseBoxArrow;
    }
  }
  ChooseBoxMenu_PrintBoxNameAndCount();
  ChooseBoxMenu_PrintTextToSprite(sText_OutOf30, 5, 3);
}

/** ChooseBoxMenu_DestroySprites */
function ChooseBoxMenu_DestroySprites(): void {
  const m = sChooseBoxMenu!;
  if (m.menuSprite) {
    DestroySprite(m.menuSprite);
    m.menuSprite = null;
  }
  for (let i = 0; i < m.menuCornerSprites.length; i++) {
    if (m.menuCornerSprites[i]) {
      DestroySprite(m.menuCornerSprites[i]!);
      m.menuCornerSprites[i] = null;
    }
  }
  for (let i = 0; i < m.arrowSprites.length; i++) {
    if (m.arrowSprites[i]) DestroySprite(m.arrowSprites[i]!);
  }
}

/** ChooseBoxMenu_MoveRight */
function ChooseBoxMenu_MoveRight(): void {
  const m = sChooseBoxMenu!;
  if (++m.curBox >= TOTAL_BOXES_COUNT) m.curBox = 0;
  ChooseBoxMenu_PrintBoxNameAndCount();
}

/** ChooseBoxMenu_MoveLeft */
function ChooseBoxMenu_MoveLeft(): void {
  const m = sChooseBoxMenu!;
  m.curBox = m.curBox === 0 ? TOTAL_BOXES_COUNT - 1 : m.curBox - 1;
  ChooseBoxMenu_PrintBoxNameAndCount();
}

/** ChooseBoxMenu_PrintBoxNameAndCount */
function ChooseBoxMenu_PrintBoxNameAndCount(): void {
  const m = sChooseBoxMenu!;
  const numMonInBox = CountMonsInBox(m.curBox);
  let boxName = StringCopy(m.strbuf, GetBoxNamePtr(m.curBox)!);
  while (boxName < BOX_NAME_LENGTH) m.strbuf[boxName++] = CHAR_SPACE;
  m.strbuf[boxName] = EOS;
  ChooseBoxMenu_PrintTextToSprite(m.strbuf, 0, 1);
  ConvertIntToDecimalStringN(m.strbuf, numMonInBox, STR_CONV_MODE_RIGHT_ALIGN, 2);
  ChooseBoxMenu_PrintTextToSprite(m.strbuf, 3, 3);
}

/** ChooseBoxMenu_PrintTextToSprite: the text is rendered straight into the popup sprite's tiles in OBJ VRAM. */
function ChooseBoxMenu_PrintTextToSprite(str: ArrayLike<number>, x: number, y: number): void {
  const OBJ_VRAM0 = 0x10000;
  const dst = ppu.vram.subarray(OBJ_VRAM0 + GetSpriteTileStartByTag(sChooseBoxMenu!.tileTag) * 32 + 256 * y + 32 * x);
  PrintStringToBufferCopyNow(str, dst, 0x100, C.TEXT_COLOR_RED, TEXT_DYNAMIC_COLOR_6, TEXT_DYNAMIC_COLOR_5, null);
}

/** SpriteCB_ChooseBoxArrow */
function SpriteCB_ChooseBoxArrow(sprite: Sprite): void {
  if (++sprite.data[1] > 3) {
    sprite.data[1] = 0;
    sprite.x2 += sprite.data[0];
    if (++sprite.data[2] > 5) {
      sprite.data[2] = 0;
      sprite.x2 = 0;
    }
  }
}

/** ShowPokemonStorageSystemPC entry used by the PC script special. */
export function openStorageMenu(game: Game): void {
  ShowPokemonStorageSystemPC(game);
}
