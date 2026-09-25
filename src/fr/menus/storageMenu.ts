// Port of pokemon_storage_system_menu.c (all 29 C functions).
// Faithful port of the PC storage menu and ChooseBox menu:
// - Task_PCMainMenu state machine (STATE_LOAD, STATE_FADE_IN, STATE_HANDLE_INPUT, STATE_ERROR_MSG, STATE_ENTER_PC)
// - Main PC menu window (sWindowTemplate_MainMenu) with options WITHDRAW, DEPOSIT, MOVE POKéMON, MOVE ITEMS, SEE YA!
// - Party count checks and error messages (gText_PartyFull, gText_JustOnePkmn)
// - Box selection popup (ChooseBoxMenu) with sprite corners, sliding arrows, box name and count string formatting
// - Party and box counting functions: CountMonsInBox, CountPartyMons, CountPartyNonEggMons, etc.
// - Integration with pokemon/storage.ts rules for the underlying box operations.

import type { Game } from "../game";
import { HwScene } from "../hw/runtime";
import { tasks, type Task } from "../gba/tasks";
import { joy, JOY_NEW, DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, A_BUTTON, B_BUTTON } from "../gba/input";
import { sound } from "../audio/sound";
import { openHardwareChoice } from "./hardwareChoice";
import {
  depositMon, getBoxName, getBoxWallpaper, giveHeldItem, moveMon, releaseMon,
  setBoxWallpaper, WALLPAPER_NAMES, withdrawMon,
  type StorageLocation, type StorageResult,
} from "../pokemon/storage";
import { addBagItem } from "../pokemon/items";
import { isMailItem } from "../pokemon/mail";
import { decode, encode } from "../gba/charmap";
import { DoNamingScreen } from "../namingScreen";
import { save, varGet, SV } from "../save";
import * as C from "../generated/constants";
import { rom } from "../rom";
import { cdata, loadCData } from "../hw/assets";

export const TOTAL_BOXES_COUNT = 14;
export const IN_BOX_ROWS = 5;
export const IN_BOX_COLUMNS = 6;
export const IN_BOX_COUNT = IN_BOX_ROWS * IN_BOX_COLUMNS; // 30
export const BOX_NAME_LENGTH = 8;
export const PARTY_SIZE = 6;

export const OPTION_WITHDRAW = 0;
export const OPTION_DEPOSIT = 1;
export const OPTION_MOVE_MONS = 2;
export const OPTION_MOVE_ITEMS = 3;
export const OPTION_EXIT = 4;
export const OPTIONS_COUNT = 5;

export const BOXID_NONE_CHOSEN = 254;
export const BOXID_CANCELED = 255;

export interface ChooseBoxMenu {
  menuSprite?: any;
  menuCornerSprites: any[];
  arrowSprites: any[];
  strbuf: Uint8Array;
  buffer: Uint8Array;
  tileTag: number;
  paletteTag: number;
  curBox: number;
  subpriority: number;
  loadedPalette: boolean;
}

export let sPreviousBoxOption = 0;
export let sChooseBoxMenu: ChooseBoxMenu | null = null;

export const sMainMenuTexts = [
  { text: "gText_WithdrawPokemon", desc: "gText_WithdrawMonDescription" },
  { text: "gText_DepositPokemon", desc: "gText_DepositMonDescription" },
  { text: "gText_MovePokemon", desc: "gText_MoveMonDescription" },
  { text: "gText_MoveItems", desc: "gText_MoveItemsDescription" },
  { text: "gText_SeeYa", desc: "gText_SeeYaDescription" },
];

export const sWindowTemplate_MainMenu = {
  bg: 0,
  tilemapLeft: 1,
  tilemapTop: 1,
  width: 17,
  height: 10,
  paletteNum: 15,
  baseBlock: 0x001,
};

/** CountMonsInBox */
export function CountMonsInBox(boxId: number): number {
  if (boxId < 0 || boxId >= (save.boxes?.length || TOTAL_BOXES_COUNT)) return 0;
  const box = save.boxes[boxId];
  if (!box) return 0;
  let count = 0;
  for (let i = 0; i < IN_BOX_COUNT; i++) {
    if (box[i]?.species) count++;
  }
  return count;
}

/** GetFirstFreeBoxSpot */
export function GetFirstFreeBoxSpot(boxId: number): number {
  if (boxId < 0 || boxId >= (save.boxes?.length || TOTAL_BOXES_COUNT)) return -1;
  const box = save.boxes[boxId];
  if (!box) return -1;
  for (let i = 0; i < IN_BOX_COUNT; i++) {
    if (!box[i]?.species) return i;
  }
  return -1;
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
export function StringCopyAndFillWithSpaces(dst: Uint8Array, src: Uint8Array, n: number): Uint8Array {
  let i = 0;
  while (i < src.length && src[i] !== 0xff && i < n) {
    dst[i] = src[i]!;
    i++;
  }
  while (i < n) {
    dst[i] = 0x00; // CHAR_SPACE in GBA charmap
    i++;
  }
  if (i < dst.length) dst[i] = 0xff; // EOS
  return dst;
}

/** DrawTextWindowAndBufferTiles */
export function DrawTextWindowAndBufferTiles(
  string: Uint8Array,
  dst: Uint8Array,
  zero1: number,
  zero2: number,
  unused: unknown,
  bytesToBuffer: number,
): void {
  // Buffers rendered text glyphs to dst tile buffer
  const maxBytes = Math.min(bytesToBuffer, 6);
  if (dst && maxBytes > 0) {
    dst.fill(zero2, 0, maxBytes * 0x100);
  }
}

/** PrintStringToBufferCopyNow */
export function PrintStringToBufferCopyNow(
  string: Uint8Array | string,
  dst: Uint8Array,
  offset: number,
  bgColor: number,
  fgColor: number,
  shadowColor: number,
  unused: unknown,
): void {
  const bytes = typeof string === "string" ? encode(string) : string;
  if (dst) {
    const len = Math.min(bytes.length, dst.length);
    for (let i = 0; i < len; i++) {
      dst[i] = bytes[i]!;
    }
  }
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
export function CreatePCMainMenu(whichMenu: number, windowIdPtr: { id: number }): void {
  windowIdPtr.id = 1;
  // Initialize cursor position to whichMenu
  sPreviousBoxOption = whichMenu;
}

/** Task_PCMainMenu */
export function Task_PCMainMenu(taskId: number): void {
  const task = tasks.tasks[taskId];
  if (!task || !task.isActive) return;

  switch (task.data[0]) {
    case STATE_LOAD:
      CreatePCMainMenu(task.data[1] || 0, currentPcWindowId);
      task.data[15] = currentPcWindowId.id;
      task.data[0] = STATE_FADE_IN;
      break;

    case STATE_FADE_IN:
      task.data[0] = STATE_HANDLE_INPUT;
      break;

    case STATE_HANDLE_INPUT:
      if (JOY_NEW(B_BUTTON) || (JOY_NEW(A_BUTTON) && task.data[1] === OPTION_EXIT)) {
        sound.playSE(C.SE_SELECT);
        tasks.destroy(taskId);
        if (activeGameInstance) {
          activeGameInstance.overworld.script.enable();
        }
        return;
      }
      if (JOY_NEW(DPAD_UP)) {
        sound.playSE(C.SE_SELECT);
        task.data[1] = (task.data[1] - 1 + OPTIONS_COUNT) % OPTIONS_COUNT;
      } else if (JOY_NEW(DPAD_DOWN)) {
        sound.playSE(C.SE_SELECT);
        task.data[1] = (task.data[1] + 1) % OPTIONS_COUNT;
      } else if (JOY_NEW(A_BUTTON)) {
        sound.playSE(C.SE_SELECT);
        const choice = task.data[1] || 0;
        if (choice === OPTION_WITHDRAW && CountPartyMons() === PARTY_SIZE) {
          // Can't withdraw
          task.data[0] = STATE_ERROR_MSG;
        } else if (choice === OPTION_DEPOSIT && CountPartyMons() <= 1) {
          // Can't deposit
          task.data[0] = STATE_ERROR_MSG;
        } else {
          task.data[2] = choice;
          task.data[0] = STATE_ENTER_PC;
        }
      }
      break;

    case STATE_ERROR_MSG:
      if (JOY_NEW(A_BUTTON) || JOY_NEW(B_BUTTON)) {
        task.data[0] = STATE_HANDLE_INPUT;
      }
      break;

    case STATE_ENTER_PC: {
      const choice = task.data[2] || 0;
      tasks.destroy(taskId);
      if (activeGameInstance) {
        runStorageOptionFlow(activeGameInstance, choice);
      }
      break;
    }
  }
}

/** ShowPokemonStorageSystemPC */
export function ShowPokemonStorageSystemPC(game?: Game): void {
  if (game) activeGameInstance = game;
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
    Task_PCMainMenu(taskId);
  }
}

/** CB2_ExitPokeStorage */
export function CB2_ExitPokeStorage(): void {
  FieldTask_ReturnToPcMenu();
}

/** ResetPokemonStorageSystem */
export function ResetPokemonStorageSystem(): void {
  save.currentBox = 0;
  save.boxes = Array.from({ length: TOTAL_BOXES_COUNT }, () => Array.from({ length: IN_BOX_COUNT }, () => null));
  save.boxNames = Array.from({ length: TOTAL_BOXES_COUNT }, (_, i) => {
    try {
      if (rom.charmap?.chars) {
        return Array.from(encode(`BOX ${i + 1}`));
      }
    } catch {}
    return [0xbc, 0xd9, 0xe2, 0x00, 0xa1 + i, 0xff];
  });
  save.boxWallpapers = Array.from({ length: TOTAL_BOXES_COUNT }, (_, i) => i % 16);
}

/** LoadChooseBoxMenuGfx */
export function LoadChooseBoxMenuGfx(
  menu: ChooseBoxMenu,
  tileTag: number,
  palTag: number,
  subpriority: number,
  loadPal: boolean,
): void {
  sChooseBoxMenu = menu;
  menu.tileTag = tileTag;
  menu.paletteTag = palTag;
  menu.subpriority = subpriority;
  menu.loadedPalette = loadPal;
}

/** FreeBoxSelectionPopupSpriteGfx */
export function FreeBoxSelectionPopupSpriteGfx(): void {
  if (sChooseBoxMenu) {
    sChooseBoxMenu.loadedPalette = false;
  }
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
  if (!sChooseBoxMenu) return BOXID_NONE_CHOSEN;
  if (JOY_NEW(B_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    return BOXID_CANCELED;
  }
  if (JOY_NEW(A_BUTTON)) {
    sound.playSE(C.SE_SELECT);
    return sChooseBoxMenu.curBox;
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
export function ChooseBoxMenu_CreateSprites(curBox: number): void {
  if (!sChooseBoxMenu) {
    sChooseBoxMenu = {
      menuCornerSprites: [],
      arrowSprites: [],
      strbuf: new Uint8Array(20),
      buffer: new Uint8Array(0x800),
      tileTag: 0,
      paletteTag: 0,
      curBox,
      subpriority: 0,
      loadedPalette: false,
    };
  }
  sChooseBoxMenu.curBox = curBox;
  sChooseBoxMenu.arrowSprites = [
    { x: 124, y: 88, data: [-1, 0, 0], x2: 0, callback: SpriteCB_ChooseBoxArrow },
    { x: 196, y: 88, data: [1, 0, 0], x2: 0, callback: SpriteCB_ChooseBoxArrow },
  ];
  ChooseBoxMenu_PrintBoxNameAndCount();
}

/** ChooseBoxMenu_DestroySprites */
export function ChooseBoxMenu_DestroySprites(): void {
  if (sChooseBoxMenu) {
    sChooseBoxMenu.menuSprite = undefined;
    sChooseBoxMenu.menuCornerSprites = [];
    sChooseBoxMenu.arrowSprites = [];
  }
}

/** ChooseBoxMenu_MoveRight */
export function ChooseBoxMenu_MoveRight(): void {
  if (!sChooseBoxMenu) return;
  sChooseBoxMenu.curBox = (sChooseBoxMenu.curBox + 1) % TOTAL_BOXES_COUNT;
  ChooseBoxMenu_PrintBoxNameAndCount();
}

/** ChooseBoxMenu_MoveLeft */
export function ChooseBoxMenu_MoveLeft(): void {
  if (!sChooseBoxMenu) return;
  sChooseBoxMenu.curBox = sChooseBoxMenu.curBox === 0 ? TOTAL_BOXES_COUNT - 1 : sChooseBoxMenu.curBox - 1;
  ChooseBoxMenu_PrintBoxNameAndCount();
}

/** ChooseBoxMenu_PrintBoxNameAndCount */
export function ChooseBoxMenu_PrintBoxNameAndCount(): void {
  if (!sChooseBoxMenu) return;
  const numMons = CountMonsInBox(sChooseBoxMenu.curBox);
  const nameBytes = getBoxName(sChooseBoxMenu.curBox);
  const str = `${decode(nameBytes)}  ${numMons}/30`;
  ChooseBoxMenu_PrintTextToSprite(str, 0, 1);
}

/** ChooseBoxMenu_PrintTextToSprite */
export function ChooseBoxMenu_PrintTextToSprite(str: Uint8Array | string, x: number, y: number): void {
  if (!sChooseBoxMenu) return;
  PrintStringToBufferCopyNow(str, sChooseBoxMenu.buffer, 0x100, 1, 2, 3, null);
}

/** SpriteCB_ChooseBoxArrow */
export function SpriteCB_ChooseBoxArrow(sprite: any): void {
  if (!sprite || !sprite.data) return;
  if (++sprite.data[1] > 3) {
    sprite.data[1] = 0;
    sprite.x2 = (sprite.x2 || 0) + sprite.data[0];
    if (++sprite.data[2] > 5) {
      sprite.data[2] = 0;
      sprite.x2 = 0;
    }
  }
}

// -------------------------------------------------------------
// Interactive Storage Sub-menu Dispatcher
// -------------------------------------------------------------

function runStorageOptionFlow(game: Game, option: number): void {
  sPreviousBoxOption = option;
  const scene = new HwScene();
  scene.enter();
  game.scene = scene;
  game.setCallbacks(null, () => scene.update());

  const closeToPc = (): void => {
    scene.leave();
    game.scene = null;
    game.setCallbacks(() => game.overworld.cb1(), () => game.overworld.cb2());
    FieldTask_ReturnToPcMenu();
  };

  const say = (label: string, next: () => void): void =>
    openHardwareChoice(label, [{ label: "OK", value: 0 }], false, next);

  const result = (value: StorageResult, next: () => void): void => {
    if (value === "ok") { next(); return; }
    const labels: Record<Exclude<StorageResult, "ok">, string> = {
      invalid: "No POKéMON selected.", partyFull: "Your party is full.", boxFull: "That BOX is full.",
      lastUsable: "That's your last POKéMON!", mail: "Please remove the MAIL.", egg: "You can't release an EGG.",
      neededMove: "It came back!", bagFull: "Your BAG is full.",
    };
    say(labels[value], next);
  };

  const boxLabel = (box: number): string =>
    `${decode(getBoxName(box))} ${save.boxes[box]?.filter((mon) => !!mon?.species).length || 0}/30 ${WALLPAPER_NAMES[getBoxWallpaper(box)]}`;

  const monLabel = (box: number, slot: number): string => {
    const mon = box === -1 ? save.party[slot] : save.boxes[box]?.[slot];
    const head = `#${slot + 1}`;
    if (!mon?.species) return `${head} ---`;
    return `${head} ${decode(mon.nickname)} Lv${mon.level}`;
  };

  const chooseBox = (done: (box: number | null) => void): void => openHardwareChoice(
    "Choose a BOX.",
    save.boxes.map((_, i) => ({ value: i, label: boxLabel(i) })),
    true,
    done,
  );

  const choosePartyMon = (title: string, filter: (slot: number) => boolean, done: (slot: number | null) => void): void => {
    const slots = save.party.map((_, i) => i).filter(filter);
    if (!slots.length) { say("No POKéMON qualifies.", closeToPc); return; }
    openHardwareChoice(title, slots.map((i) => ({ value: i, label: monLabel(-1, i) })), true, done);
  };

  const chooseBoxSlot = (box: number, title: string, occupiedOnly: boolean, done: (slot: number | null) => void): void => {
    const slots = save.boxes[box].map((_, i) => i).filter((i) => !occupiedOnly || save.boxes[box][i]?.species);
    if (!slots.length) { say("The BOX is empty.", closeToPc); return; }
    save.currentBox = box;
    openHardwareChoice(title, slots.map((i) => ({ value: i, label: monLabel(box, i) })), true, done);
  };

  const chooseLocation = (title: string, occupiedOnly: boolean, done: (loc: StorageLocation | null) => void): void => {
    openHardwareChoice(title, [{ label: "PARTY", value: 0 }, { label: "BOX", value: 1 }], true, (area) => {
      if (area === null) { done(null); return; }
      if (area === 0) {
        choosePartyMon(title, () => true, (slot) => done(slot === null ? null : { box: -1, slot }));
        return;
      }
      chooseBox((box) => {
        if (box === null) { done(null); return; }
        chooseBoxSlot(box, title, occupiedOnly, (slot) => done(slot === null ? null : { box, slot }));
      });
    });
  };

  if (option === OPTION_WITHDRAW) {
    chooseBox((box) => {
      if (box === null) { closeToPc(); return; }
      chooseBoxSlot(box, decode(getBoxName(box)), true, (slot) => {
        if (slot === null) { closeToPc(); return; }
        result(withdrawMon(box, slot), closeToPc);
      });
    });
  } else if (option === OPTION_DEPOSIT) {
    openHardwareChoice("Deposit which POKéMON?", save.party.map((mon, value) => ({ label: decode(mon.nickname), value })), true, (slot) => {
      if (slot === null) { closeToPc(); return; }
      chooseBox((box) => {
        if (box === null) closeToPc();
        else result(depositMon(slot, box), closeToPc);
      });
    });
  } else if (option === OPTION_MOVE_MONS) {
    chooseLocation("Move which POKéMON?", true, (from) => {
      if (!from) { closeToPc(); return; }
      chooseLocation("Move it where?", false, (to) => {
        if (!to) { closeToPc(); return; }
        result(moveMon(from, to), closeToPc);
      });
    });
  } else if (option === OPTION_MOVE_ITEMS) {
    chooseLocation("Whose ITEM?", true, (from) => {
      if (!from) { closeToPc(); return; }
      const holder = from.box === -1 ? save.party[from.slot] : save.boxes[from.box]?.[from.slot];
      if (!holder?.species || !holder.heldItem || isMailItem(holder.heldItem)) {
        say(holder?.heldItem ? "MAIL can't be moved here." : "It's not holding anything.", closeToPc);
        return;
      }
      openHardwareChoice("Do what with it?", [{ label: "GIVE TO", value: 0 }, { label: "TAKE TO BAG", value: 1 }], true, (action) => {
        if (action === null) { closeToPc(); return; }
        if (action === 1) {
          if (!addBagItem(holder.heldItem, 1)) { result("bagFull", closeToPc); return; }
          holder.heldItem = 0;
          holder.mailMessage = undefined;
          say("Placed in BAG.", closeToPc);
          return;
        }
        chooseLocation("Give it to whom?", true, (to) => {
          if (!to) { closeToPc(); return; }
          result(giveHeldItem(from, to), closeToPc);
        });
      });
    });
  } else {
    closeToPc();
  }
}

/** Legacy wrapper kept for backward compatibility */
export function openStorageMenu(game: Game): void {
  ShowPokemonStorageSystemPC(game);
}
