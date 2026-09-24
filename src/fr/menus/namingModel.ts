// naming_screen.c: text buffer, keyboard pages and input rules. Graphics are
// owned by namingScreen.ts; all characters/templates come from exported C data.
import { cdata } from "../hw/assets";
import { CHAR_SPACE, EOS } from "../gba/charmap";
import { A_BUTTON, B_BUTTON, SELECT_BUTTON, START_BUTTON, DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT } from "../gba/input";

export type NameBuffer = { length: number; [index: number]: number };
export type NamingTemplate = {
  copyExistingString: number; maxChars: number; iconFunction: number;
  addGenderIcon: number; initialPage: number; title: { $sym: string };
};
export type NamingAction = "none" | "move" | "character" | "delete" | "page" | "confirm";
const data = <T>(name: string) => cdata<T>("naming_screen", name);

export class NamingModel {
  readonly template: NamingTemplate;
  readonly text: Uint8Array;
  page: number;
  x = 0;
  y = 0;
  private buttonRow = 0;

  constructor(readonly type: number, readonly destination: NameBuffer) {
    const ref = data<Array<{ $sym: string }>>("sNamingScreenTemplates")[type];
    if (!ref) throw new Error(`Unknown naming template ${type}`);
    this.template = data<NamingTemplate>(ref.$sym);
    this.page = this.template.initialPage;
    this.text = new Uint8Array(this.template.maxChars + 1).fill(EOS);
    if (this.template.copyExistingString) {
      for (let i = 0; i < this.template.maxChars && i < destination.length && destination[i] !== EOS; i++) this.text[i] = destination[i];
    }
  }

  get keyboardId(): number { return data<number[]>("sPageToKeyboardId")[this.page]; }
  get columns(): number { return data<number[]>("sPageColumnCounts")[this.keyboardId]; }
  get columnPositions(): number[] { return data<number[][]>("sPageColumnXPos")[this.keyboardId]; }
  get caret(): number {
    const end = this.text.indexOf(EOS);
    return Math.min(end < 0 ? this.template.maxChars : end, this.template.maxChars - 1);
  }
  private get previousCaret(): number {
    for (let i = this.template.maxChars - 1; i > 0; i--) if (this.text[i] !== EOS) return i;
    return 0;
  }
  get onButton(): boolean { return this.x === this.columns; }

  moveToOK(): void { this.x = this.columns; this.y = 2; }

  swapPage(): void {
    const onButton = this.onButton;
    this.page = (this.page + 1) % 3;
    this.x = onButton ? this.columns : Math.min(this.x, this.columns - 1);
  }

  deleteCharacter(): void { this.text[this.previousCaret] = EOS; }

  addCharacter(): void {
    // C pads the short rows of sKeyboardChars[3][4][8] with zero/CHAR_SPACE.
    const rows = data<number[][][]>("sKeyboardChars");
    this.text[this.caret] = rows[this.keyboardId][this.y][this.x] ?? CHAR_SPACE;
    if (this.previousCaret === this.template.maxChars - 1) this.moveToOK();
  }

  save(): void {
    if (!this.text.some(ch => ch !== EOS && ch !== CHAR_SPACE)) return;
    // SaveInputText tests for non-whitespace but copies the whole buffer,
    // including leading spaces. It does not trim the name.
    for (let i = 0; i <= this.template.maxChars; i++) {
      this.destination[i] = this.text[i];
      if (this.text[i] === EOS) break;
    }
  }

  input(pressed: number, repeated: number): NamingAction {
    // Input_Enabled gives A, B, SELECT and START priority over the D-pad.
    if (pressed & A_BUTTON) {
      if (!this.onButton) { this.addCharacter(); return "character"; }
      if (this.y === 0) { this.swapPage(); return "page"; }
      if (this.y === 1) { this.deleteCharacter(); return "delete"; }
      this.save();
      return "confirm";
    }
    if (pressed & B_BUTTON) { this.deleteCharacter(); return "delete"; }
    if (pressed & SELECT_BUTTON) { this.swapPage(); return "page"; }
    if (pressed & START_BUTTON) { this.moveToOK(); return "move"; }
    let dx = 0, dy = 0;
    if (repeated & DPAD_UP) dy = -1;
    if (repeated & DPAD_DOWN) dy = 1;
    if (repeated & DPAD_LEFT) { dx = -1; dy = 0; }
    if (repeated & DPAD_RIGHT) { dx = 1; dy = 0; }
    if (!dx && !dy) return "none";
    const previousX = this.x;
    this.x += dx;
    this.y += dy;
    if (this.x < 0) this.x = this.columns;
    if (this.x > this.columns) this.x = 0;
    if (dx) {
      if (this.onButton) {
        this.buttonRow = this.y;
        this.y = [0, 1, 1, 2][this.y];
      } else if (previousX === this.columns) {
        this.y = this.y === 1 ? this.buttonRow : [0, 0, 3][this.y];
      }
    }
    const rows = this.onButton ? 3 : 4;
    if (this.y < 0) this.y = rows - 1;
    if (this.y >= rows) this.y = 0;
    if (this.onButton) {
      if (this.y === 0) this.buttonRow = 1;
      else if (this.y === 2) this.buttonRow = 2;
    }
    return "move";
  }
}
