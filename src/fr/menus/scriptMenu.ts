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
import { save, SV, varSet } from "../save";
import { GridMenu, Menu, MENU_B_PRESSED, MENU_NOTHING_CHOSEN } from "./menu";
import type { Overworld } from "../field/overworld";

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

  /** CreateWindowFromRect + SetStdWindowBorderStyle */
  createFramedWindow(left: number, top: number, width: number, height: number): Window {
    const window = new Window(left + 1, top + 1, width, height);
    window.frame = "std";
    window.frameType = this.frameType();
    window.fill(1);
    this.ow.windows.add(window);
    return window;
  }

  removeWindow(window: Window | undefined): void {
    this.ow.windows.remove(window);
  }

  yesNo(_left: number, _top: number): boolean {
    if (tasks.isActive(this.yesNoTask)) return false;
    varSet(SV.RESULT, SCR_MENU_UNSET);
    const window = new Window(21, 9, 6, 4);
    window.frame = "std";
    window.frameType = this.frameType();
    window.fill(1);
    printText(window, FONT_NORMAL, rom.text("gText_YesNo"), 10, 2);
    this.ow.windows.add(window);
    const menu = new Menu(window, FONT_NORMAL, 0, 2, 14, 2, 0);
    const id = tasks.create(this.yesNoTask, 80);
    this.yesNoState.set(id, { window, menu, timer: 0 });
    return true;
  }

  private yesNoState = new Map<number, { window: Window; menu: Menu; timer: number }>();

  private yesNoTask = (taskId: number): void => {
    const state = this.yesNoState.get(taskId);
    if (!state) { tasks.destroy(taskId); return; }
    if (state.timer < 5) { state.timer++; return; }
    const input = state.menu.processInputNoWrap();
    if (input === MENU_NOTHING_CHOSEN) return;
    this.removeWindow(state.window);
    if (input === MENU_B_PRESSED || input === 1) {
      sound.playSE(sound.SE_SELECT);
      varSet(SV.RESULT, 0);
    } else {
      varSet(SV.RESULT, 1);
    }
    this.yesNoState.delete(taskId);
    tasks.destroy(taskId);
    this.ow.script.enable();
  };

  private listTexts(id: number): Uint8Array[] {
    const list = (rom.scriptMenu.multichoice[String(id)] ?? []) as string[];
    return list.map((sym) => expandPlaceholders(rom.text(sym)));
  }

  multichoice(left: number, top: number, id: number, ignoreB: boolean, initPos: number): boolean {
    if (tasks.isActive(this.multichoiceTask)) return false;
    varSet(SV.RESULT, SCR_MENU_UNSET);
    const texts = this.listTexts(id);
    const count = texts.length;
    let strWidth = 0;
    for (const t of texts) strWidth = Math.max(strWidth, stringWidth(FONT_NORMAL, t, 0));
    const width = Math.floor((strWidth + 9) / 8) + 1;
    if (left + width > 28) left = 28 - width;
    const height = MC_HEIGHTS[count] ?? 1;
    const window = this.createFramedWindow(left, top, width, height);
    texts.forEach((t, i) => printText(window, FONT_NORMAL, t, 8, 2 + i * 14));
    const menu = new Menu(window, FONT_NORMAL, 0, 2, 14, count, initPos);
    const taskId = tasks.create(this.multichoiceTask, 80);
    this.mcState.set(taskId, { window, menu, ignoreB, wrap: count > 3 });
    return true;
  }

  private mcState = new Map<number, { window: Window; menu: Menu; ignoreB: boolean; wrap: boolean }>();

  private multichoiceTask = (taskId: number): void => {
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
    this.removeWindow(state.window);
    this.mcState.delete(taskId);
    tasks.destroy(taskId);
    this.ow.script.enable();
  };

  multichoiceGrid(left: number, top: number, id: number, ignoreB: boolean, columns: number): boolean {
    varSet(SV.RESULT, SCR_MENU_UNSET);
    const texts = this.listTexts(id);
    let widest = 0;
    for (const t of texts) widest = Math.max(widest, Math.floor((stringWidth(FONT_NORMAL_COPY_1, t, 0) + 7) / 8));
    const width = widest + 1;
    const rows = Math.floor(texts.length / columns);
    const window = this.createFramedWindow(left, top, width * columns, rows * 2);
    texts.forEach((t, i) => printText(window, FONT_NORMAL_COPY_1, t, (i % columns) * width * 8 + 8, Math.floor(i / columns) * 16 + 1));
    const menu = new GridMenu(window, FONT_NORMAL_COPY_1, 0, 1, width * 8, 16, columns, rows);
    const id2 = tasks.create(() => {
      const input = menu.processInput();
      if (input === MENU_NOTHING_CHOSEN) return;
      if (input === MENU_B_PRESSED) {
        if (ignoreB) return;
        sound.playSE(sound.SE_SELECT);
        varSet(SV.RESULT, SCR_MENU_CANCEL);
      } else varSet(SV.RESULT, input);
      this.removeWindow(window);
      tasks.destroy(id2);
      this.ow.script.enable();
    }, 80);
    return true;
  }

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
    stringVars.var1 = intToDecimal(save.coins, STR_CONV_MODE_RIGHT_ALIGN, 4);
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

  showMonPic(species: number, x: number, y: number): void {
    if (this.picTask >= 0 && tasks.tasks[this.picTask]?.isActive) return;
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
    this.picTask = tasks.create(() => {
      switch (this.picState) {
        case 0: this.picState = 1; break;
        case 1: break;
        case 2: this.ow.sprites.destroy(this.picSprite); this.picState = 3; break;
        case 3: this.removeWindow(this.picWindow); tasks.destroy(this.picTask); this.picTask = -1; break;
      }
    }, 80);
  }

  hideMonPic(): (() => boolean) | null {
    if (this.picTask < 0 || !tasks.tasks[this.picTask]?.isActive) return null;
    this.picState++;
    return () => this.picTask < 0;
  }

  listMenu(): void {
    varSet(SV.RESULT, SCR_MENU_CANCEL);
    this.ow.script.enable();
  }

  pcMenu(): void {
    this.ow.game.openPlayerPC(false);
  }
}
