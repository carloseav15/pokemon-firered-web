// pokeemerald field_specials.c ShowScrollableMultichoice and its list-menu task (the scrolling menus of the Slateport
// Berry Powder vendor, the SS Tidal destinations, the Battle Tent rules, ...). The window and list menu are the engine's field
// list menu; the scroll arrows are its red-arrow pair.
// GAP: the Battle Frontier ids (Exchange Corner, Receptionist, Move Tutor) also draw item icons and description windows
// (FillFrontierExchangeCornerWindowAndItemIcon, ShowBattleFrontierTutorWindow...), which are not ported: those ids stop.
// tKeepOpenAfterSelect is FALSE for every id in the C source, so its keep-open branch (never run there) is not ported either.
import { sound } from "@core/audio/sound";
import { expandPlaceholders } from "@core/gba/charmap";
import { FONT_NORMAL, GetStringWidth } from "@core/gba/font";
import { tasks } from "@core/gba/tasks";
import { Window } from "@core/gba/window";
import { cdata } from "@core/hw/assets";
import {
  DestroyListMenuTask, LIST_CANCEL, LIST_NO_MULTIPLE_SCROLL, LIST_NOTHING_CHOSEN, ListMenu_ProcessInput, ListMenuGetScrollAndRow,
  ListMenuInitOnSurface, listMenuTemplate, SCROLL_ARROW_UP,
} from "@core/hw/listMenu";
import { rom } from "@core/rom";
import type { ScriptRunner } from "@core/script/context";
import { addFieldScrollArrows, fieldListSurface } from "@game/menus/fieldListMenu";
import { ConvertPixelWidthToTileWidth, MAX_MULTICHOICE_WIDTH } from "@game/menus/scriptMenu";
import { SV, varGet, varSet } from "@game/save";

const MAX_SCROLL_MULTI_ON_SCREEN = 6;
const MULTI_B_PRESSED = 127;
const SCROLL_MULTI_BF_EXCHANGE_CORNER_DECOR_VENDOR_1 = 3, SCROLL_MULTI_BF_EXCHANGE_CORNER_HOLD_ITEM_VENDOR = 6;
const SCROLL_MULTI_BF_RECEPTIONIST = 8, SCROLL_MULTI_BF_MOVE_TUTOR_1 = 9, SCROLL_MULTI_BF_MOVE_TUTOR_2 = 10;

// Task data (field_specials.c tMaxItemsOnScreen... tTaskId)
const tMaxItemsOnScreen = 0, tNumItems = 1, tLeft = 2, tTop = 3, tWidth = 4, tHeight = 5, tScrollOffset = 7, tSelectedRow = 8;
const tScrollMultiId = 11, tListTaskId = 14;

/** The per-id switch of ShowScrollableMultichoice: [tMaxItemsOnScreen, tNumItems, tLeft, tTop, tWidth, tHeight]. */
const SCROLL_MULTI_LAYOUT: Record<number, [number, number, number, number, number, number]> = {
  0: [1, 1, 1, 1, 1, 1], // SCROLL_MULTI_NONE
  1: [MAX_SCROLL_MULTI_ON_SCREEN - 1, 8, 1, 1, 9, 10], // GLASS_WORKSHOP_VENDOR
  2: [MAX_SCROLL_MULTI_ON_SCREEN, 12, 1, 1, 7, 12], // POKEMON_FAN_CLUB_RATER
  3: [MAX_SCROLL_MULTI_ON_SCREEN, 11, 14, 1, 15, 12], // BF_EXCHANGE_CORNER_DECOR_VENDOR_1
  4: [MAX_SCROLL_MULTI_ON_SCREEN, 6, 14, 1, 15, 12], // BF_EXCHANGE_CORNER_DECOR_VENDOR_2
  5: [MAX_SCROLL_MULTI_ON_SCREEN, 7, 14, 1, 15, 12], // BF_EXCHANGE_CORNER_VITAMIN_VENDOR
  6: [MAX_SCROLL_MULTI_ON_SCREEN, 10, 14, 1, 15, 12], // BF_EXCHANGE_CORNER_HOLD_ITEM_VENDOR
  7: [MAX_SCROLL_MULTI_ON_SCREEN, 12, 15, 1, 14, 12], // BERRY_POWDER_VENDOR
  8: [MAX_SCROLL_MULTI_ON_SCREEN, 10, 17, 1, 11, 12], // BF_RECEPTIONIST
  9: [MAX_SCROLL_MULTI_ON_SCREEN, 11, 15, 1, 14, 12], // BF_MOVE_TUTOR_1 (falls into the BF_MOVE_TUTOR_2 case)
  10: [MAX_SCROLL_MULTI_ON_SCREEN, 11, 15, 1, 14, 12], // BF_MOVE_TUTOR_2
  11: [MAX_SCROLL_MULTI_ON_SCREEN, 7, 19, 1, 10, 12], // SS_TIDAL_DESTINATION
  12: [MAX_SCROLL_MULTI_ON_SCREEN, 7, 17, 1, 12, 12], // BATTLE_TENT_RULES
};

/** The script context of the running menu (the C tasks reach ScriptContext_Enable and the field through globals). */
let sCtx: ScriptRunner | null = null;

/** field_specials.c sScrollableMultichoice_ScrollOffset */
let sScrollableMultichoice_ScrollOffset = 0;
type ListState = { window: Window; listTaskId: number; removeArrows?: () => void };
const states = new Map<number, ListState>();

/** field_specials.c ShowScrollableMultichoice (waitstate=1: the task re-enables the script) */
export function ShowScrollableMultichoice(ctx: ScriptRunner): void {
  const id = varGet(SV.x8004);
  const layout = SCROLL_MULTI_LAYOUT[id];
  if (!layout) throw Error(`ShowScrollableMultichoice: scroll multichoice ${id} does not exist`);
  const isFrontierId = (id >= SCROLL_MULTI_BF_EXCHANGE_CORNER_DECOR_VENDOR_1 && id <= SCROLL_MULTI_BF_EXCHANGE_CORNER_HOLD_ITEM_VENDOR)
    || id === SCROLL_MULTI_BF_RECEPTIONIST || id === SCROLL_MULTI_BF_MOVE_TUTOR_1 || id === SCROLL_MULTI_BF_MOVE_TUTOR_2;
  if (isFrontierId) throw Error(`ShowScrollableMultichoice: the Battle Frontier item/tutor windows of scroll multichoice ${id} are not ported`);
  sCtx = ctx;
  const taskId = tasks.create(Task_ShowScrollableMultichoice, 8);
  const data = tasks.data(taskId);
  data[tScrollMultiId] = id;
  [data[tMaxItemsOnScreen], data[tNumItems], data[tLeft], data[tTop], data[tWidth], data[tHeight]] = layout;
}

/** field_specials.c Task_ShowScrollableMultichoice */
function Task_ShowScrollableMultichoice(taskId: number): void {
  const ctx = sCtx!;
  const data = tasks.data(taskId);
  ctx.ow.controlsLocked = true; // LockPlayerFieldControls
  sScrollableMultichoice_ScrollOffset = 0;
  const options = cdata<Array<Array<{ $sym: string }>>>("em:field_specials", "sScrollableMultichoiceOptions")[data[tScrollMultiId]!]!;
  const items: { label: Uint8Array; index: number }[] = [];
  let width = 0;
  for (let i = 0; i < data[tNumItems]!; i++) {
    const text = expandPlaceholders(rom.text(options[i]!.$sym));
    items.push({ label: text, index: i });
    width = Math.max(width, GetStringWidth(FONT_NORMAL, text, 0)); // DisplayTextAndGetWidth
  }
  data[tWidth] = ConvertPixelWidthToTileWidth(width);
  if (data[tLeft]! + data[tWidth]! > MAX_MULTICHOICE_WIDTH + 1) {
    const adjustedLeft = MAX_MULTICHOICE_WIDTH + 1 - data[tWidth]!;
    data[tLeft] = adjustedLeft < 0 ? 0 : adjustedLeft;
  }
  const window = new Window(data[tLeft]!, data[tTop]!, data[tWidth]!, data[tHeight]!);
  window.frame = "std"; window.frameType = ctx.ow.game.scriptMenu.frameType();
  ctx.ow.windows.add(window);
  const state: ListState = { window, listTaskId: -1 };
  states.set(taskId, state);
  const template = listMenuTemplate({
    items, windowId: 0, surface: fieldListSurface(window), totalItems: data[tNumItems]!, maxShowed: data[tMaxItemsOnScreen]!,
    item_X: 8, cursor_X: 0, upText_Y: 1, cursorPal: 2, fillValue: 1, cursorShadowPal: 3, lettersSpacing: 0, itemVerticalPadding: 0,
    scrollMultiple: LIST_NO_MULTIPLE_SCROLL, fontId: FONT_NORMAL, cursorKind: 0,
    moveCursorFunc: () => ScrollableMultichoice_MoveCursor(taskId),
  });
  ScrollableMultichoice_UpdateScrollArrows(ctx, taskId);
  state.listTaskId = ListMenuInitOnSurface(template, data[tScrollOffset]!, data[tSelectedRow]!);
  data[tListTaskId] = state.listTaskId;
  tasks.setFunc(taskId, ScrollableMultichoice_ProcessInput);
}

/** field_specials.c ScrollableMultichoice_MoveCursor (the Battle Frontier description hooks are the recorded gap) */
function ScrollableMultichoice_MoveCursor(taskId: number): void {
  sound.playSE(sound.c("SE_SELECT"));
  const state = states.get(taskId);
  if (state && state.listTaskId >= 0) sScrollableMultichoice_ScrollOffset = ListMenuGetScrollAndRow(state.listTaskId).itemsAbove;
}

/** field_specials.c ScrollableMultichoice_ProcessInput */
function ScrollableMultichoice_ProcessInput(taskId: number): void {
  const ctx = sCtx!;
  const state = states.get(taskId)!;
  const input = ListMenu_ProcessInput(state.listTaskId);
  switch (input) {
    case LIST_NOTHING_CHOSEN:
      break;
    case LIST_CANCEL:
      varSet(SV.RESULT, MULTI_B_PRESSED);
      sound.playSE(sound.c("SE_SELECT"));
      CloseScrollableMultichoice(ctx, taskId);
      break;
    default:
      varSet(SV.RESULT, input);
      sound.playSE(sound.c("SE_SELECT"));
      CloseScrollableMultichoice(ctx, taskId); // tKeepOpenAfterSelect is FALSE for every scroll multichoice
      break;
  }
}

/** field_specials.c CloseScrollableMultichoice */
function CloseScrollableMultichoice(ctx: ScriptRunner, taskId: number): void {
  const state = states.get(taskId)!;
  ScrollableMultichoice_RemoveScrollArrows(taskId);
  DestroyListMenuTask(state.listTaskId);
  state.window.fill(0);
  state.window.markDirty();
  ctx.ow.windows.remove(state.window);
  states.delete(taskId);
  tasks.destroy(taskId);
  ctx.ow.script.ScriptContext_Enable();
}

/** field_specials.c ScrollableMultichoice_UpdateScrollArrows: arrows only when more items than fit on screen */
function ScrollableMultichoice_UpdateScrollArrows(ctx: ScriptRunner, taskId: number): void {
  const data = tasks.data(taskId);
  if (data[tMaxItemsOnScreen] !== data[tNumItems]) {
    const x = Math.trunc(data[tWidth]! / 2) * 8 + 12 + (data[tLeft]! - 1) * 8;
    states.get(taskId)!.removeArrows = addFieldScrollArrows(ctx.ow, SCROLL_ARROW_UP, x, 8, data[tHeight]! * 8 + 10,
      data[tNumItems]! - data[tMaxItemsOnScreen]!, () => sScrollableMultichoice_ScrollOffset);
  }
}

/** field_specials.c ScrollableMultichoice_RemoveScrollArrows */
function ScrollableMultichoice_RemoveScrollArrows(taskId: number): void {
  const state = states.get(taskId);
  state?.removeArrows?.();
  if (state) state.removeArrows = undefined;
}

/** field_specials.c ScrollableMultichoice_TryReturnToList: with no suspended list (tKeepOpenAfterSelect is never set) it just continues the script. */
export function ScrollableMultichoice_TryReturnToList(ctx: ScriptRunner): void { ctx.ow.script.ScriptContext_Enable(); }
