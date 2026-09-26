// field_message_box.c: the dialogue window (window 0) used by scripts.

import { expandPlaceholders, stringVars } from "../gba/charmap";
import { menuHelperHooks } from "../hw/menuHelpers";
import { FONT_BRAILLE, FONT_FEMALE, FONT_MALE, FONT_NORMAL } from "../gba/font";
import { getTextSpeedSetting, TextPrinter, textFlags, TEXT_COLOR_BLUE, TEXT_COLOR_DARK_GRAY, TEXT_COLOR_LIGHT_GRAY, TEXT_COLOR_RED, TEXT_COLOR_WHITE } from "../gba/textPrinter";
import { Window } from "../gba/window";
import { rom } from "../rom";
import { SV, varGet } from "../save";
import * as C from "../generated/constants";
import { GetColorFromTextColorTable } from "../dynamicPlaceholderTextUtil";
import type { Overworld } from "./overworld";

export const FIELD_MESSAGE_BOX_HIDDEN = C.FIELD_MESSAGE_BOX_HIDDEN;
export const FIELD_MESSAGE_BOX_UNUSED = C.FIELD_MESSAGE_BOX_UNUSED;
export const FIELD_MESSAGE_BOX_NORMAL = C.FIELD_MESSAGE_BOX_NORMAL;
export const FIELD_MESSAGE_BOX_AUTO_SCROLL = C.FIELD_MESSAGE_BOX_AUTO_SCROLL;

const NPC_TEXT_COLOR_MALE = 0, NPC_TEXT_COLOR_FEMALE = 1, NPC_TEXT_COLOR_NEUTRAL = 3, NPC_TEXT_COLOR_DEFAULT = 0xff;

export class FieldMessageBox {
  type = FIELD_MESSAGE_BOX_HIDDEN;
  window?: Window;
  printer?: TextPrinter;
  private drawState = -1;

  constructor(private readonly ow: Overworld) {
    menuHelperHooks.contextNpcGetTextColor = () => this.npcTextColor();
    this.InitFieldMessageBox();
  }

  InitFieldMessageBox(): void {
    this.type = FIELD_MESSAGE_BOX_HIDDEN;
    this.window = undefined;
    this.printer = undefined;
    this.drawState = -1;
    textFlags.canABSpeedUpPrint = false;
    textFlags.useAlternateDownArrow = false;
    textFlags.autoScroll = false;
  }

  reset(): void { this.InitFieldMessageBox(); }

  private ensureWindow(): Window {
    if (!this.window || !this.ow.windows.windows.includes(this.window)) {
      this.window = new Window(2, 15, 26, 4);
      this.ow.windows.add(this.window);
    }
    return this.window;
  }

  /** ContextNpcGetTextColor */
  private npcTextColor(): number {
    const color = varGet(SV.TEXT_COLOR);
    if (color !== NPC_TEXT_COLOR_DEFAULT) return color;
    if (this.ow.selectedObject === 0) return NPC_TEXT_COLOR_NEUTRAL;
    const object = this.ow.objects.objects[this.ow.selectedObject];
    if (!object) return NPC_TEXT_COLOR_NEUTRAL;
    let gfx = object.graphicsId;
    const base = rom.constants.OBJ_EVENT_GFX_VAR_0 ?? 0xef;
    if (gfx >= base) gfx = varGet(rom.c("VAR_OBJ_GFX_ID_0") + gfx - base);
    return GetColorFromTextColorTable(gfx);
  }

  /** ShowFieldMessage */
  ShowFieldMessage(str: ArrayLike<number>): boolean {
    if (this.type !== FIELD_MESSAGE_BOX_HIDDEN) return false;
    this.type = FIELD_MESSAGE_BOX_NORMAL;
    this.ExpandStringAndStartDrawFieldMessageBox(str);
    return true;
  }

  ShowFieldAutoScrollMessage(str: ArrayLike<number>): boolean {
    if (this.type !== FIELD_MESSAGE_BOX_HIDDEN) return false;
    this.type = FIELD_MESSAGE_BOX_AUTO_SCROLL;
    this.ExpandStringAndStartDrawFieldMessageBox(str);
    return true;
  }

  ForceShowFieldAutoScrollMessage(str: ArrayLike<number>): boolean {
    this.type = FIELD_MESSAGE_BOX_AUTO_SCROLL;
    this.ExpandStringAndStartDrawFieldMessageBox(str);
    return true;
  }

  ShowFieldMessageFromBuffer(): boolean {
    if (this.type !== FIELD_MESSAGE_BOX_HIDDEN) return false;
    this.type = FIELD_MESSAGE_BOX_NORMAL;
    this.StartDrawFieldMessageBox();
    return true;
  }

  show(str: ArrayLike<number>, autoScroll = false): boolean {
    return autoScroll ? this.ShowFieldAutoScrollMessage(str) : this.ShowFieldMessage(str);
  }

  ExpandStringAndStartDrawFieldMessageBox(str: ArrayLike<number>): void {
    const text = expandPlaceholders(str);
    stringVars.var4 = text;
    this.StartPrinter(text);
    this.CreateTask_DrawFieldMessageBox();
  }

  StartDrawFieldMessageBox(): void {
    this.StartPrinter(Uint8Array.from(stringVars.var4));
    this.CreateTask_DrawFieldMessageBox();
  }

  CreateTask_DrawFieldMessageBox(): void { this.drawState = 0; }

  DestroyTask_DrawFieldMessageBox(): void { this.drawState = -1; }

  private StartPrinter(text: Uint8Array): void {
    const window = this.ensureWindow();
    textFlags.canABSpeedUpPrint = true;
    const color = this.npcTextColor();
    let font = FONT_NORMAL;
    let fg = TEXT_COLOR_DARK_GRAY;
    if (color === NPC_TEXT_COLOR_MALE) { font = FONT_MALE; fg = TEXT_COLOR_BLUE; }
    else if (color === NPC_TEXT_COLOR_FEMALE) { font = FONT_FEMALE; fg = TEXT_COLOR_RED; }
    // Task_DrawFieldMessageBox: frame drawn on the next frames; the printer
    // starts right away as in AddTextPrinterDiffStyle.
    window.frame = this.ow.control.msgIsSignpost ? "signpost" : "dialogue";
    window.fill(TEXT_COLOR_WHITE);
    window.visible = false;
    this.printer = new TextPrinter(window, font, text, { x: 0, y: 1, speed: getTextSpeedSetting(), fg, bg: TEXT_COLOR_WHITE, shadow: TEXT_COLOR_LIGHT_GRAY });
  }

  /**
   * scrcmd.c ScrCmd_braillemessage: LoadStdWindowFrameGfx, DrawDialogueFrame(0, 1) and an
   * instant FONT_BRAILLE printer on window 0. The message box mode is left untouched.
   */
  showBraille(str: ArrayLike<number>): void {
    const window = this.ensureWindow();
    window.frame = "dialogue";
    window.fill(TEXT_COLOR_WHITE);
    window.visible = true;
    new TextPrinter(window, FONT_BRAILLE, str, { x: 0, y: 1, speed: 0 });
  }

  /** Runs the printer and the draw task every frame. */
  Task_DrawFieldMessageBox(): void {
    if (this.drawState < 0) return;
    this.printer?.run();
    switch (this.drawState) {
      case 0: {
        const questLog = this.ow.game as unknown as { questLogState?: number };
        if (questLog.questLogState === C.QL_STATE_PLAYBACK) textFlags.autoScroll = true;
        this.window!.frame = this.ow.control.msgIsSignpost ? "signpost" : "dialogue";
        this.drawState++;
        break;
      }
      case 1:
        if (this.window) this.window.visible = true;
        this.drawState++;
        break;
      case 2:
        if (!this.printer?.active) {
          this.type = FIELD_MESSAGE_BOX_HIDDEN;
          this.DestroyTask_DrawFieldMessageBox();
        }
        break;
    }
  }

  update(): void { this.Task_DrawFieldMessageBox(); }

  /** HideFieldMessageBox */
  HideFieldMessageBox(): void {
    this.DestroyTask_DrawFieldMessageBox();
    this.printer = undefined;
    if (this.window) {
      this.ow.windows.remove(this.window);
      this.window = undefined;
    }
    this.type = FIELD_MESSAGE_BOX_HIDDEN;
  }

  hide(): void { this.HideFieldMessageBox(); }

  GetFieldMessageBoxType(): number { return this.type; }

  IsFieldMessageBoxHidden(): boolean {
    return this.type === FIELD_MESSAGE_BOX_HIDDEN;
  }

  isHidden(): boolean { return this.IsFieldMessageBoxHidden(); }

  ReplaceFieldMessageWithFrame(): void {
    this.DestroyTask_DrawFieldMessageBox();
    const window = this.ensureWindow();
    window.frame = "std";
    window.visible = true;
    this.type = FIELD_MESSAGE_BOX_HIDDEN;
  }
}
