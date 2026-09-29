// script_menu.c: yes/no boxes, multichoice lists, money/coins boxes and the
// picture box used by showmonpic.

import { sound } from "../audio/sound";
import { expandPlaceholders, intToDecimal, stringVars, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "../gba/charmap";
import { FONT_NORMAL, FONT_NORMAL_COPY_1, FONT_SMALL, stringWidth } from "../gba/font";
import { paletteFade } from "../gba/fade";
import { Sprite } from "../gba/sprite";
import { tasks } from "../gba/tasks";
import { printText } from "../gba/textPrinter";
import { Window } from "../gba/window";
import { DATA_ROOT, rom } from "../rom";
import { cdata, symName, type SymRef } from "../hw/assets";
import { flagGet, save, SV, varGet, varSet } from "../save";
import { joy, A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_UP } from "../gba/input";
import { GridMenu, Menu, MENU_B_PRESSED, MENU_NOTHING_CHOSEN } from "./menu";
import {
  DestroyListMenuTask, LIST_CANCEL, LIST_NO_MULTIPLE_SCROLL, LIST_NOTHING_CHOSEN, ListMenu_ProcessInput, ListMenuGetScrollAndRow, ListMenuInitOnSurface,
  listMenuTemplate, SCROLL_ARROW_UP,
} from "../hw/listMenu";
import { addFieldScrollArrows, fieldListSurface } from "./fieldListMenu";
import type { Overworld } from "../field/overworld";
import { GetCoins } from "../pokemon/items";
import { LISTMENU_BADGES, LISTMENU_SILPHCO_FLOORS, LISTMENU_ROCKET_HIDEOUT_FLOORS, LISTMENU_DEPT_STORE_FLOORS, LISTMENU_WIRELESS_LECTURE_HEADERS, LISTMENU_BERRY_POWDER, LISTMENU_TRAINER_TOWER_FLOORS } from "../generated/constants";

const SCR_MENU_UNSET = 0xff;
const SCR_MENU_CANCEL = 127;

const MC_HEIGHTS = [1, 2, 4, 6, 7, 9, 11, 13, 14];

export class ScriptMenu {
  private moneyWindow?: Window;
  private coinsWindow?: Window;
  private picTask = -1;
  private picState = 0;

  constructor(private readonly getOw: () => Overworld) {}

  private get ow(): Overworld {
    return this.getOw();
  }

  frameType(): number {
    return save.options.frameType ?? 0;
  }

  /** CreateWindowFromRect (script_menu.c): source coordinates exclude the border. */
  CreateWindowFromRect(left: number, top: number, width: number, height: number): Window {
    const window = new Window(left + 1, top + 1, width, height);
    this.ow.windows.add(window);
    return window;
  }

  /** CreateWindowFromRect + SetStdWindowBorderStyle */
  createFramedWindow(left: number, top: number, width: number, height: number): Window {
    const window = this.CreateWindowFromRect(left, top, width, height);
    window.frame = "std";
    window.frameType = this.frameType();
    window.fill(1);
    return window;
  }

  removeWindow(window: Window | undefined): void {
    this.ow.windows.remove(window);
  }

  DestroyScriptMenuWindow(window: Window | undefined): void {
    if (!window) return;
    window.fill(0);
    window.markDirty();
    this.removeWindow(window);
  }

  ScriptMenu_YesNo(_left: number, _top: number, defaultChoice = 0): boolean {
    if (tasks.isActive(this.Task_YesNoMenu_HandleInput)) return false;
    varSet(SV.RESULT, SCR_MENU_UNSET);
    const window = new Window(21, 9, 6, 4);
    window.frame = "std";
    window.frameType = this.frameType();
    window.fill(1);
    printText(window, FONT_NORMAL, rom.text("gText_YesNo"), 10, 2);
    this.ow.windows.add(window);
    const menu = new Menu(window, FONT_NORMAL, 0, 2, 14, 2, defaultChoice);
    const id = tasks.create(this.Task_YesNoMenu_HandleInput, 80);
    this.yesNoState.set(id, { window, menu, timer: 0 });
    return true;
  }

  private yesNoState = new Map<number, { window: Window; menu: Menu; timer: number }>();

  private Task_YesNoMenu_HandleInput = (taskId: number): void => {
    const state = this.yesNoState.get(taskId);
    if (!state) { tasks.destroy(taskId); return; }
    if (state.timer < 5) { state.timer++; return; }
    const input = state.menu.processInputNoWrap();
    if (input === MENU_NOTHING_CHOSEN) return;
    this.DestroyScriptMenuWindow(state.window);
    if (input === MENU_B_PRESSED || input === 1) {
      sound.playSE(sound.SE_SELECT);
      varSet(SV.RESULT, 0);
    } else {
      varSet(SV.RESULT, 1);
    }
    this.yesNoState.delete(taskId);
    tasks.destroy(taskId);
    this.ow.script.ScriptContext_Enable();
  };

  private listTexts(id: number): Uint8Array[] {
    const list = (rom.scriptMenu.multichoice[String(id)] ?? []) as string[];
    return list.map((sym) => expandPlaceholders(rom.text(sym)));
  }

  private GetStringTilesWide(text: Uint8Array): number {
    return Math.floor((stringWidth(FONT_NORMAL_COPY_1, text, 0) + 7) / 8);
  }

  private GetMenuWidthFromList(items: Uint8Array[]): number {
    let width = this.GetStringTilesWide(items[0]);
    for (let i = 1; i < items.length; i++) width = Math.max(width, this.GetStringTilesWide(items[i]));
    return width;
  }

  ScriptMenu_Multichoice(left: number, top: number, id: number, ignoreB: boolean): boolean {
    if (tasks.isActive(this.Task_MultichoiceMenu_HandleInput)) return false;
    varSet(SV.RESULT, SCR_MENU_UNSET);
    this.DrawVerticalMultichoiceMenu(left, top, id, ignoreB, 0);
    return true;
  }

  ScriptMenu_MultichoiceWithDefault(left: number, top: number, id: number, ignoreB: boolean, initPos: number): boolean {
    if (tasks.isActive(this.Task_MultichoiceMenu_HandleInput)) return false;
    varSet(SV.RESULT, SCR_MENU_UNSET);
    this.DrawVerticalMultichoiceMenu(left, top, id, ignoreB, initPos);
    return true;
  }

  private GetMCWindowHeight(count: number): number { return MC_HEIGHTS[count] ?? 1; }

  private DrawVerticalMultichoiceMenu(left: number, top: number, id: number, ignoreB: boolean, initPos: number): void {
    const texts = this.listTexts(id);
    const count = texts.length;
    let strWidth = 0;
    for (const t of texts) strWidth = Math.max(strWidth, stringWidth(FONT_NORMAL, t, 0));
    const width = Math.floor((strWidth + 9) / 8) + 1;
    if (left + width > 28) left = 28 - width;
    const height = this.GetMCWindowHeight(count);
    const window = this.createFramedWindow(left, top, width, height);
    texts.forEach((t, i) => printText(window, FONT_NORMAL, t, 8, 2 + i * 14));
    const menu = new Menu(window, FONT_NORMAL, 0, 2, 14, count, initPos);
    this.CreateMCMenuInputHandlerTask(ignoreB, count, window, menu);
  }

  private mcState = new Map<number, { window: Window; menu: Menu; ignoreB: boolean; wrap: boolean }>();

  private CreateMCMenuInputHandlerTask(ignoreB: boolean, count: number, window: Window, menu: Menu): void {
    const taskId = tasks.create(this.Task_MultichoiceMenu_HandleInput, 80);
    this.mcState.set(taskId, { window, menu, ignoreB, wrap: count > 3 });
  }

  private Task_MultichoiceMenu_HandleInput = (taskId: number): void => {
    const state = this.mcState.get(taskId);
    if (!state) { tasks.destroy(taskId); return; }
    if (paletteFade.active) return;
    const input = state.wrap ? state.menu.processInput() : state.menu.processInputNoWrap();
    if (input === MENU_NOTHING_CHOSEN) return;
    if (input === MENU_B_PRESSED) {
      if (state.ignoreB) return;
      sound.playSE(sound.SE_SELECT);
      varSet(SV.RESULT, SCR_MENU_CANCEL);
    } else {
      varSet(SV.RESULT, input);
    }
    this.DestroyScriptMenuWindow(state.window);
    this.mcState.delete(taskId);
    tasks.destroy(taskId);
    this.ow.script.ScriptContext_Enable();
  };

  /** A multichoice built from explicit text symbols (CreateWindowFromRect + CreateMCMenuInputHandlerTask). */
  customChoice(symbols: string[], left: number, top: number, width: number, height: number): void {
    varSet(SV.RESULT, SCR_MENU_UNSET);
    const window = this.createFramedWindow(left, top, width, height);
    symbols.forEach((sym, i) => printText(window, FONT_NORMAL, expandPlaceholders(rom.text(sym)), 8, i * 16 + 2));
    const menu = new Menu(window, FONT_NORMAL, 0, 2, 16, symbols.length, 0);
    this.CreateMCMenuInputHandlerTask(false, symbols.length, window, menu);
  }

  ScriptMenu_MultichoiceGrid(left: number, top: number, id: number, ignoreB: boolean, columns: number): boolean {
    if (tasks.isActive(this.Hask_MultichoiceGridMenu_HandleInput)) return false;
    varSet(SV.RESULT, SCR_MENU_UNSET);
    const texts = this.listTexts(id);
    const width = this.GetMenuWidthFromList(texts) + 1;
    const rows = Math.floor(texts.length / columns);
    const window = this.createFramedWindow(left, top, width * columns, rows * 2);
    texts.forEach((t, i) => printText(window, FONT_NORMAL_COPY_1, t, (i % columns) * width * 8 + 8, Math.floor(i / columns) * 16 + 1));
    const menu = new GridMenu(window, FONT_NORMAL_COPY_1, 0, 1, width * 8, 16, columns, rows);
    const id2 = tasks.create(this.Hask_MultichoiceGridMenu_HandleInput, 80);
    this.gridState.set(id2, { window, menu, ignoreB });
    return true;
  }

  private gridState = new Map<number, { window: Window; menu: GridMenu; ignoreB: boolean }>();

  private Hask_MultichoiceGridMenu_HandleInput = (taskId: number): void => {
    const state = this.gridState.get(taskId);
    if (!state) { tasks.destroy(taskId); return; }
    const input = state.menu.processInput();
    if (input === MENU_NOTHING_CHOSEN) return;
    if (input === MENU_B_PRESSED) {
      if (state.ignoreB) return;
      sound.playSE(sound.SE_SELECT);
      varSet(SV.RESULT, SCR_MENU_CANCEL);
    } else varSet(SV.RESULT, input);
    this.DestroyScriptMenuWindow(state.window);
    this.gridState.delete(taskId);
    tasks.destroy(taskId);
    this.ow.script.ScriptContext_Enable();
  };

  // ---------------------------------------------------------------- money / coins

  showMoneyBox(x: number, y: number): void {
    this.hideMoneyBox();
    const window = new Window(x + 1, y + 1, 8, 3);
    window.frame = "stdwin";
    this.moneyWindow = window;
    this.ow.windows.add(window);
    this.updateMoneyBox();
  }

  updateMoneyBox(): void {
    const window = this.moneyWindow;
    if (!window) return;
    window.fill(1);
    printText(window, FONT_NORMAL, rom.text("gText_TrainerCardMoney"), 0, 0);
    stringVars.var1 = intToDecimal(save.money, STR_CONV_MODE_LEFT_ALIGN, 6);
    const text = expandPlaceholders(rom.text("gText_PokedollarVar1"));
    printText(window, FONT_SMALL, text, 64 - stringWidth(FONT_SMALL, text, 0), 12);
  }

  hideMoneyBox(): void {
    this.removeWindow(this.moneyWindow);
    this.moneyWindow = undefined;
  }

  showCoinsBox(x: number, y: number): void {
    this.hideCoinsBox();
    const window = new Window(x + 1, y + 1, 8, 3);
    window.frame = "stdwin";
    this.coinsWindow = window;
    this.ow.windows.add(window);
    this.updateCoinsBox();
  }

  updateCoinsBox(): void {
    const window = this.coinsWindow;
    if (!window) return;
    window.fill(1);
    printText(window, FONT_NORMAL, rom.text("gText_Coins_2"), 0, 0);
    stringVars.var1 = intToDecimal(GetCoins(), STR_CONV_MODE_RIGHT_ALIGN, 4);
    const text = expandPlaceholders(rom.text("gText_Coins"));
    printText(window, FONT_SMALL, text, 64 - stringWidth(FONT_SMALL, text, 0), 12);
  }

  hideCoinsBox(): void {
    this.removeWindow(this.coinsWindow);
    this.coinsWindow = undefined;
  }

  // ---------------------------------------------------------------- mon pic box

  private picWindow?: Window;
  private picSprite?: Sprite;

  ScriptMenu_ShowPokemonPic(species: number, x: number, y: number): boolean {
    if (this.picTask >= 0 && tasks.tasks[this.picTask]?.isActive) return false;
    this.picWindow = this.createFramedWindow(x, y, 8, 8);
    const sprite = new Sprite();
    sprite.frameImages = [{ url: `${DATA_ROOT}/gfx/pokemon/front/${species}.png`, index: 0, width: 64, height: 64 }];
    sprite.width = 64;
    sprite.height = 64;
    sprite.centerToCornerVecX = -32;
    sprite.centerToCornerVecY = -32;
    sprite.x = 8 * x + 40;
    sprite.y = 8 * y + 40;
    sprite.coordOffsetEnabled = false;
    sprite.priority = 0;
    sprite.aboveWindows = true;
    this.picSprite = sprite;
    this.ow.sprites.add(sprite);
    this.picState = 0;
    this.picTask = tasks.create(this.Task_ScriptShowMonPic, 80);
    return true;
  }

  private Task_ScriptShowMonPic = (taskId: number): void => {
    switch (this.picState) {
      case 0: this.picState = 1; break;
      case 1: break;
      case 2:
        if (this.picSprite) this.ow.sprites.destroy(this.picSprite);
        this.picSprite = undefined;
        this.picState = 3;
        break;
      case 3:
        this.DestroyScriptMenuWindow(this.picWindow);
        this.picWindow = undefined;
        tasks.destroy(taskId);
        this.picTask = -1;
        break;
    }
  };

  ScriptMenu_HidePokemonPic(): (() => boolean) | null {
    if (this.picTask < 0 || !tasks.tasks[this.picTask]?.isActive) return null;
    this.picState++;
    return this.PicboxWait;
  }

  private PicboxWait = (): boolean => this.picTask < 0;

  PicboxCancel(): void {
    if (this.picTask < 0 || !tasks.tasks[this.picTask]?.isActive) return;
    if (this.picState < 3 && this.picSprite) this.ow.sprites.destroy(this.picSprite);
    this.picSprite = undefined;
    this.DestroyScriptMenuWindow(this.picWindow);
    this.picWindow = undefined;
    tasks.destroy(this.picTask);
    this.picTask = -1;
  }

  // ---------------------------------------------------------------- field_specials.c ListMenu

  /** sElevatorScroll / sElevatorCursorPos (InitElevatorFloorSelectMenuPos) */
  elevatorScroll = 0;
  elevatorCursorPos = 0;
  private scriptListState = new Map<number, { which: number; window?: Window; listTaskId: number; removeArrows?: () => void; scroll: number }>();
  private suspendedListTaskId = -1;

  /** ListMenu: field_specials.c; create the C task and its data[0..15]. */
  ListMenu(): void {
    const which = varGet(SV.x8004);
    const layouts: Record<number, number[]> = {
      [LISTMENU_BADGES]: [4, 9, 1, 1, 12, 7, 1],
      [LISTMENU_SILPHCO_FLOORS]: [7, 12, 1, 1, 8, 12, 0],
      [LISTMENU_ROCKET_HIDEOUT_FLOORS]: [4, 4, 1, 1, 8, 8, 0],
      [LISTMENU_DEPT_STORE_FLOORS]: [4, 6, 1, 1, 8, 8, 0],
      [LISTMENU_WIRELESS_LECTURE_HEADERS]: [4, 4, 1, 1, 17, 8, 1],
      [LISTMENU_BERRY_POWDER]: [7, 12, 16, 1, 17, 12, 0],
      [LISTMENU_TRAINER_TOWER_FLOORS]: [3, 3, 1, 1, 8, 6, 0],
    };
    const layout = layouts[which];
    if (!layout) {
      if (which !== 99) { varSet(SV.RESULT, SCR_MENU_CANCEL); this.ow.script.ScriptContext_Enable(); }
      return;
    }
    const id = tasks.create((taskId) => this.Task_CreateScriptListMenu(taskId), 8);
    const data = tasks.data(id);
    data.splice(0, 7, ...layout);
    data[15] = id;
    if (which === LISTMENU_SILPHCO_FLOORS) { data[7] = this.elevatorScroll; data[8] = this.elevatorCursorPos; }
    this.scriptListState.set(id, { which, listTaskId: -1, scroll: 0 });
  }

  /** CreateScriptListMenu: set every field from sFieldSpecialsListMenuTemplate. */
  private CreateScriptListMenu(items: { label: Uint8Array; index: number }[], maxShowed: number, windowId: number, window: Window, moveCursorFunc: () => void) {
    return listMenuTemplate({ items, windowId, surface: fieldListSurface(window), totalItems: items.length, maxShowed,
      item_X: 8, cursor_X: 0, upText_Y: 0, cursorPal: 2, fillValue: 1, cursorShadowPal: 3, lettersSpacing: 1, itemVerticalPadding: 0,
      scrollMultiple: LIST_NO_MULTIPLE_SCROLL, fontId: FONT_NORMAL, cursorKind: 0, moveCursorFunc });
  }

  private Task_CreateScriptListMenu(taskId: number): void {
    const data = tasks.data(taskId), state = this.scriptListState.get(taskId);
    if (!state) return;
    this.ow.controlsLocked = true;
    state.scroll = state.which === LISTMENU_SILPHCO_FLOORS ? this.elevatorScroll : 0;
    const labels = cdata<SymRef[][]>("field_specials", "sListMenuLabels")[state.which] ?? [];
    const items = labels.slice(0, data[1]).map((ref, index) => ({ label: expandPlaceholders(rom.text(symName(ref)!)), index }));
    let maxWidth = 0;
    for (const item of items) maxWidth = Math.max(maxWidth, stringWidth(FONT_NORMAL, item.label, 0));
    data[4] = Math.floor((maxWidth + 9) / 8) + 1;
    if (data[2] + data[4] > 29) data[2] = 29 - data[4];
    const window = new Window(data[2], data[3], data[4], data[5]);
    window.frame = "std"; window.frameType = this.frameType();
    this.ow.windows.add(window); state.window = window;
    const template = this.CreateScriptListMenu(items, data[0], 0, window, () => this.ScriptListMenuMoveCursorFunction(taskId));
    state.listTaskId = ListMenuInitOnSurface(template, data[7], data[8]);
    this.Task_CreateMenuRemoveScrollIndicatorArrowPair(taskId);
    tasks.setFunc(taskId, this.Task_ListMenuHandleInput);
  }

  private Task_ListMenuHandleInput = (taskId: number): void => {
    const state = this.scriptListState.get(taskId);
    if (!state) return;
    const input = ListMenu_ProcessInput(state.listTaskId);
    if (input === LIST_NOTHING_CHOSEN) return;
    sound.playSE(sound.SE_SELECT);
    if (input === LIST_CANCEL) { varSet(SV.RESULT, SCR_MENU_CANCEL); this.Task_DestroyListMenu(taskId); return; }
    varSet(SV.RESULT, input);
    const data = tasks.data(taskId);
    if (data[6] === 0 || input === data[1] - 1) this.Task_DestroyListMenu(taskId);
    else {
      this.Task_ListMenuRemoveScrollIndicatorArrowPair(taskId);
      this.suspendedListTaskId = taskId;
      tasks.setFunc(taskId, this.Task_SuspendListMenu);
      this.ow.script.ScriptContext_Enable();
    }
  };

  private Task_DestroyListMenu(taskId: number): void {
    const state = this.scriptListState.get(taskId);
    if (state) {
      this.Task_ListMenuRemoveScrollIndicatorArrowPair(taskId);
      DestroyListMenuTask(state.listTaskId);
      if (state.window) { state.window.fill(0); state.window.markDirty(); this.removeWindow(state.window); }
      this.scriptListState.delete(taskId);
    }
    if (this.suspendedListTaskId === taskId) this.suspendedListTaskId = -1;
    tasks.destroy(taskId);
    this.ow.script.ScriptContext_Enable();
  }

  private Task_SuspendListMenu = (taskId: number): void => {
    const data = tasks.data(taskId);
    if (data[6] === 2) { data[6] = 1; tasks.setFunc(taskId, this.Task_RedrawScrollArrowsAndWaitInput); }
  };

  /** ReturnToListMenu */
  returnToListMenu(): void {
    const taskId = this.suspendedListTaskId;
    if (taskId < 0 || !tasks.tasks[taskId]?.isActive) { this.ow.script.ScriptContext_Enable(); return; }
    tasks.data(taskId)[6]++;
  }

  private Task_RedrawScrollArrowsAndWaitInput = (taskId: number): void => {
    this.ow.controlsLocked = true;
    const state = this.scriptListState.get(taskId);
    if (!state) return;
    this.Task_CreateMenuRemoveScrollIndicatorArrowPair(taskId);
    tasks.setFunc(taskId, this.Task_ListMenuHandleInput);
  };

  private Task_CreateMenuRemoveScrollIndicatorArrowPair(taskId: number): void {
    const data = tasks.data(taskId), state = this.scriptListState.get(taskId);
    if (data[0] === data[1] || !state?.window) return;
    const x = 4 * data[4] + 8 * data[2];
    state.removeArrows = addFieldScrollArrows(this.ow, SCROLL_ARROW_UP, x, 8, 8 * data[5] + 10, data[1] - data[0], () => state.scroll);
  }

  private Task_ListMenuRemoveScrollIndicatorArrowPair(taskId: number): void {
    const state = this.scriptListState.get(taskId);
    state?.removeArrows?.();
    if (state) state.removeArrows = undefined;
  }

  private ScriptListMenuMoveCursorFunction(taskId: number): void {
    sound.playSE(sound.SE_SELECT);
    const listTaskId = this.scriptListState.get(taskId)?.listTaskId ?? -1;
    if (listTaskId < 0) return;
    const above = ListMenuGetScrollAndRow(listTaskId).itemsAbove;
    const state = this.scriptListState.get(taskId);
    if (state) state.scroll = above;
  }

  private brailleSprite?: Sprite;

  /** BrailleCursorToggle: the blinking text cursor used while reading braille. */
  brailleCursor(x: number, y: number, create: boolean): void {
    if (this.brailleSprite) { this.ow.sprites.destroy(this.brailleSprite); this.brailleSprite = undefined; }
    if (!create) return;
    const s = new Sprite();
    s.width = 8; s.height = 16; s.x = x; s.y = y; s.coordOffsetEnabled = false; s.priority = 0; s.aboveWindows = true;
    let t = 0;
    s.draw = (ctx, dx, dy) => { if ((t >> 4) & 1) return; ctx.fillStyle = "#606060"; ctx.fillRect(dx, dy + 12, 8, 2); };
    s.callback = () => { t++; };
    this.brailleSprite = s;
    this.ow.sprites.add(s);
  }

  /** script_menu.c CreatePCMenu / CreatePCMenuWindow */
  CreatePCMenu(): boolean {
    if (tasks.isActive(this.Task_MultichoiceMenu_HandleInput)) return false;
    varSet(SV.RESULT, SCR_MENU_UNSET);
    this.CreatePCMenuWindow();
    return true;
  }

  private CreatePCMenuWindow(): void {
    const k = rom.constants;
    const dex = flagGet(k.FLAG_SYS_POKEDEX_GET);
    const clear = flagGet(k.FLAG_SYS_GAME_CLEAR);
    const numItems = clear ? 5 : dex ? 4 : 3;
    const pcTextTiles = this.GetStringTilesWide(expandPlaceholders(rom.text("gText_SPc")));
    const width = pcTextTiles === 9 || pcTextTiles === 10 || dex ? 14 : 13;
    const window = this.createFramedWindow(0, 0, width, clear ? 10 : numItems * 2);
    printText(window, FONT_NORMAL, rom.text(flagGet(k.FLAG_SYS_NOT_SOMEONES_PC) ? "gText_BillSPc" : "gText_SomeoneSPc"), 8, 2);
    printText(window, FONT_NORMAL, expandPlaceholders(rom.text("gText_SPc")), 8, 18);
    if (clear) {
      printText(window, FONT_NORMAL, rom.text("gText_ProfOakSPc"), 8, 34);
      printText(window, FONT_NORMAL, rom.text("gText_HallOfFame_2"), 8, 50);
      printText(window, FONT_NORMAL, rom.text("gText_LogOff"), 8, 66);
    } else {
      if (dex) printText(window, FONT_NORMAL, rom.text("gText_ProfOakSPc"), 8, 34);
      printText(window, FONT_NORMAL, rom.text("gText_LogOff"), 8, 2 + 16 * (numItems - 1));
    }
    const menu = new Menu(window, FONT_NORMAL, 0, 2, 16, numItems, 0);
    this.CreateMCMenuInputHandlerTask(false, numItems, window, menu);
  }

  /** ScriptMenu_DisplayPCStartupPrompt: print the PC prompt when returning from Hall of Fame PC. */
  ScriptMenu_DisplayPCStartupPrompt(): void {
    this.ow.messageBox.show(rom.text("Text_AccessWhichPC"));
  }
}
