// field_message_box.c: the dialogue window (window 0) used by scripts.

import { expandPlaceholders, stringVars } from "../gba/charmap";
import { FONT_FEMALE, FONT_MALE, FONT_NORMAL } from "../gba/font";
import { getTextSpeedSetting, TextPrinter, textFlags, TEXT_COLOR_BLUE, TEXT_COLOR_DARK_GRAY, TEXT_COLOR_LIGHT_GRAY, TEXT_COLOR_RED, TEXT_COLOR_WHITE } from "../gba/textPrinter";
import { Window } from "../gba/window";
import { rom } from "../rom";
import { SV, varGet } from "../save";
import type { Overworld } from "./overworld";

export const FIELD_MESSAGE_BOX_HIDDEN = 0;
export const FIELD_MESSAGE_BOX_NORMAL = 1;
export const FIELD_MESSAGE_BOX_AUTO_SCROLL = 2;

const NPC_TEXT_COLOR_MALE = 0, NPC_TEXT_COLOR_FEMALE = 1, NPC_TEXT_COLOR_NEUTRAL = 3, NPC_TEXT_COLOR_DEFAULT = 0xff;

let textColorTable: number[] | undefined;

export class FieldMessageBox {
  type = FIELD_MESSAGE_BOX_HIDDEN;
  window?: Window;
  printer?: TextPrinter;
  private drawState = -1;

  constructor(private readonly ow: Overworld) {}

  reset(): void {
    this.type = FIELD_MESSAGE_BOX_HIDDEN;
    this.window = undefined;
    this.printer = undefined;
    this.drawState = -1;
    textFlags.canABSpeedUpPrint = false;
    textFlags.useAlternateDownArrow = false;
    textFlags.autoScroll = false;
  }

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
    if (!textColorTable) textColorTable = (rom as unknown as { scriptMenu: { textColors: number[] } }).scriptMenu.textColors;
    const byte = textColorTable[gfx >> 1];
    if (byte === undefined) return NPC_TEXT_COLOR_NEUTRAL;
    return (byte >> ((gfx & 1) << 2)) & 0xf;
  }

  /** ShowFieldMessage */
  show(str: ArrayLike<number>, autoScroll = false): boolean {
    if (this.type !== FIELD_MESSAGE_BOX_HIDDEN) return false;
    const text = expandPlaceholders(str);
    stringVars.var4 = text;
    this.type = autoScroll ? FIELD_MESSAGE_BOX_AUTO_SCROLL : FIELD_MESSAGE_BOX_NORMAL;
    this.startPrinter(text);
    return true;
  }

  private startPrinter(text: Uint8Array): void {
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
    window.visible = true;
    this.printer = new TextPrinter(window, font, text, { x: 0, y: 1, speed: getTextSpeedSetting(), fg, bg: TEXT_COLOR_WHITE, shadow: TEXT_COLOR_LIGHT_GRAY });
    this.drawState = 0;
  }

  /** Runs the printer and the draw task every frame. */
  update(): void {
    if (this.drawState < 0) return;
    this.printer?.run();
    if (this.drawState === 0) this.drawState = 1;
    else if (this.drawState === 1) this.drawState = 2;
    else if (this.drawState === 2 && !(this.printer?.active)) {
      this.type = FIELD_MESSAGE_BOX_HIDDEN;
      this.drawState = -1;
    }
  }

  /** HideFieldMessageBox */
  hide(): void {
    this.drawState = -1;
    this.printer = undefined;
    if (this.window) {
      this.ow.windows.remove(this.window);
      this.window = undefined;
    }
    this.type = FIELD_MESSAGE_BOX_HIDDEN;
  }

  isHidden(): boolean {
    return this.type === FIELD_MESSAGE_BOX_HIDDEN;
  }
}
