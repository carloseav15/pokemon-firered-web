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
import { save, SV, varGet, varSet } from "../save";
import { joy, A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_UP } from "../gba/input";
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

  /** A multichoice built from explicit text symbols (CreateWindowFromRect + CreateMCMenuInputHandlerTask). */
  customChoice(symbols: string[], left: number, top: number, width: number, height: number): void {
    varSet(SV.RESULT, SCR_MENU_UNSET);
    const window = this.createFramedWindow(left, top, width, height);
    symbols.forEach((sym, i) => printText(window, FONT_NORMAL, expandPlaceholders(rom.text(sym)), 8, i * 16 + 2));
    const menu = new Menu(window, FONT_NORMAL, 0, 2, 16, symbols.length, 0);
    const taskId = tasks.create(this.multichoiceTask, 80);
    this.mcState.set(taskId, { window, menu, ignoreB: false, wrap: symbols.length > 3 });
  }

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

  // ---------------------------------------------------------------- field_specials.c ListMenu

  /** sElevatorScroll / sElevatorCursorPos (InitElevatorFloorSelectMenuPos) */
  elevatorScroll = 0;
  elevatorCursorPos = 0;
  private listSuspended: { resume: () => void; pending: number } | null = null;

  /** special ListMenu: a scrolling list; badge and berry powder lists stay open (ReturnToListMenu). */
  listMenu(): void {
    const which = varGet(SV.x8004);
    const labels: Record<number, string[]> = {
      0: ["gText_BoulderBadge", "gText_CascadeBadge", "gText_ThunderBadge", "gText_RainbowBadge", "gText_SoulBadge", "gText_MarshBadge", "gText_VolcanoBadge", "gText_EarthBadge", "gOtherText_Exit"],
      1: ["gText_11F", "gText_10F", "gText_9F", "gText_8F", "gText_7F", "gText_6F", "gText_5F", "gText_4F", "gText_3F", "gText_2F", "gText_1F", "gOtherText_Exit"],
      2: ["gText_B1F", "gText_B2F", "gText_B4F", "gOtherText_Exit"],
      3: ["gText_5F", "gText_4F", "gText_3F", "gText_2F", "gText_1F", "gOtherText_Exit"],
      4: ["gText_LinkedGamePlay", "gText_DirectCorner", "gText_UnionRoom", "gOtherText_Quit"],
      5: ["gText_Energypowder_50", "gText_EnergyRoot_80", "gText_HealPowder_50", "gText_RevivalHerb_300", "gText_Protein_1000", "gText_Iron_1000",
        "gText_Carbos_1000", "gText_Calcium_1000", "gText_Zinc_1000", "gText_HpUp_1000", "gText_PpUp_3000", "gOtherText_Exit"],
      6: ["gText_Rooftop", "gText_B1F", "gOtherText_Exit"],
    };
    // [maxShowed, left, top, height, stays open]
    const layout: Record<number, [number, number, number, number, boolean]> = {
      0: [4, 1, 1, 7, true], 1: [7, 1, 1, 12, false], 2: [4, 1, 1, 8, false], 3: [4, 1, 1, 8, false],
      4: [4, 1, 1, 8, true], 5: [7, 16, 1, 12, false], 6: [3, 1, 1, 6, false],
    };
    if (!(which in labels)) { varSet(SV.RESULT, SCR_MENU_CANCEL); this.ow.script.enable(); return; }
    const items = labels[which].map((sym) => expandPlaceholders(rom.text(sym)));
    const [maxShowed, left0, top, height, staysOpen] = layout[which];
    let widest = 0;
    for (const t of items) widest = Math.max(widest, stringWidth(FONT_NORMAL, t, 0));
    const width = Math.floor((widest + 9) / 8) + 1;
    const left = left0 + width > 29 ? 29 - width : left0;
    let scroll = which === 1 ? this.elevatorScroll : 0;
    let cursor = which === 1 ? this.elevatorCursorPos : 0;
    this.ow.controlsLocked = true;
    const window = new Window(left, top, width, height);
    window.frame = "std";
    window.frameType = this.frameType();
    this.ow.windows.add(window);
    const lineHeight = 16;
    const draw = (): void => {
      window.fill(1);
      for (let i = 0; i < maxShowed && scroll + i < items.length; i++) {
        printText(window, FONT_NORMAL, items[scroll + i], 8, i * lineHeight + 1, { fg: 2, bg: 1, shadow: 3 });
      }
      printText(window, FONT_NORMAL, rom.text("gText_SelectorArrow2"), 0, (cursor) * lineHeight + 1);
    };
    draw();
    let active = true;
    const finish = (): void => {
      this.removeWindow(window);
      tasks.destroy(id);
      this.listSuspended = null;
      this.ow.script.enable();
    };
    const id = tasks.create(() => {
      if (!active) return;
      const index = scroll + cursor;
      if (joy.newKeys & A_BUTTON) {
        sound.playSE(sound.SE_SELECT);
        varSet(SV.RESULT, index);
        if (!staysOpen || index === items.length - 1) { finish(); return; }
        active = false;
        this.listSuspended = { resume: () => { active = true; }, pending: 0 };
        this.ow.script.enable();
        return;
      }
      if (joy.newKeys & B_BUTTON) {
        sound.playSE(sound.SE_SELECT);
        varSet(SV.RESULT, SCR_MENU_CANCEL);
        finish();
        return;
      }
      if (joy.repeated & DPAD_UP && index > 0) {
        if (cursor > 0) cursor--; else scroll--;
        sound.playSE(sound.SE_SELECT);
        draw();
      } else if (joy.repeated & DPAD_DOWN && index < items.length - 1) {
        if (cursor < maxShowed - 1) cursor++; else scroll++;
        sound.playSE(sound.SE_SELECT);
        draw();
      }
    }, 8);
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

  /** special ReturnToListMenu */
  returnToListMenu(): void {
    if (!this.listSuspended) { this.ow.script.enable(); return; }
    this.ow.controlsLocked = true;
    this.listSuspended.resume();
  }

  pcMenu(): void {
    this.ow.game.openPlayerPC(false);
  }
}
