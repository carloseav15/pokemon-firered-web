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
export type NamingAction = "none" | "move" | "moveToOK" | "character" | "delete" | "page" | "confirm";
const data = <T>(name: string) => cdata<T>("naming_screen", name);

type KeyboardKeyRole = "character" | "page" | "backspace" | "ok";

/** GetCurrentPageColumnCount (naming_screen.c). */
export function GetCurrentPageColumnCount(model: NamingModel): number {
  const keyboardId = model.keyboardId;
  return data<number[]>("sPageColumnCounts")[keyboardId] ?? 0;
}

/** CurrentPageToNextKeyboardId (naming_screen.c); model.page adapts sNamingScreen->currentPage. */
export function CurrentPageToNextKeyboardId(model: NamingModel): number {
  return data<number[]>("sPageToNextKeyboardId")[model.page] ?? 0;
}

/** CurrentPageToKeyboardId (naming_screen.c); model.page adapts sNamingScreen->currentPage. */
export function CurrentPageToKeyboardId(model: NamingModel): number {
  return data<number[]>("sPageToKeyboardId")[model.page] ?? 0;
}

/** GetTextEntryPosition (naming_screen.c). */
export function GetTextEntryPosition(model: NamingModel): number {
  for (let i = 0; i < model.template.maxChars; i++) {
    if (model.text[i] === EOS) return i;
  }
  return model.template.maxChars - 1;
}

/** GetCharAtKeyboardPos (naming_screen.c): read the u8 cell from sKeyboardChars. */
export function GetCharAtKeyboardPos(model: NamingModel, x: number, y: number): number {
  return (data<number[][][]>("sKeyboardChars")[model.keyboardId][y]?.[x] ?? EOS) & 0xff;
}

/** BufferCharacter (naming_screen.c): store one u8 at the current text caret. */
export function BufferCharacter(model: NamingModel, character: number): void {
  model.text[GetTextEntryPosition(model)] = character & 0xff;
}

/** GetPreviousTextCaretPosition (naming_screen.c). */
export function GetPreviousTextCaretPosition(model: NamingModel): number {
  for (let i = model.template.maxChars - 1; i > 0; i--) {
    if (model.text[i] !== EOS) return i;
  }
  return 0;
}

/** GetKeyRoleAtCursorPos (naming_screen.c). */
export function GetKeyRoleAtCursorPos(model: NamingModel): KeyboardKeyRole {
  if (model.x < GetCurrentPageColumnCount(model)) return "character";
  const buttonRoles: KeyboardKeyRole[] = ["page", "backspace", "ok"];
  return buttonRoles[model.y] ?? "page";
}

/** MoveCursorToOKButton (naming_screen.c). */
export function MoveCursorToOKButton(model: NamingModel): void {
  model.moveToOK();
}

/** DeleteTextCharacter (naming_screen.c). */
export function DeleteTextCharacter(model: NamingModel): void {
  model.deleteCharacter();
}

/** AddTextCharacter (naming_screen.c); returns true when the text buffer is full. */
export function AddTextCharacter(model: NamingModel): boolean {
  BufferCharacter(model, GetCharAtKeyboardPos(model, model.x, model.y));
  return GetPreviousTextCaretPosition(model) === model.template.maxChars - 1;
}

/** SaveInputText (naming_screen.c): leave an all-space buffer untouched and copy maxChars + 1 bytes. */
export function SaveInputText(model: NamingModel): void {
  for (let i = 0; i < model.template.maxChars; i++) {
    if (model.text[i] !== CHAR_SPACE && model.text[i] !== EOS) {
      for (let j = 0; j <= model.template.maxChars; j++) model.destination[j] = model.text[j]!;
      return;
    }
  }
}

/** SwapKeyboardPage (naming_screen.c). */
export function SwapKeyboardPage(model: NamingModel): void {
  model.swapPage();
}

/** KeyboardKeyHandler_Character (naming_screen.c). */
export function KeyboardKeyHandler_Character(model: NamingModel, pressed: number): NamingAction {
  if (!(pressed & A_BUTTON)) return "none";
  if (AddTextCharacter(model)) return "moveToOK";
  return "character";
}

/** KeyboardKeyHandler_Page (naming_screen.c). */
export function KeyboardKeyHandler_Page(model: NamingModel, pressed: number): NamingAction {
  if (!(pressed & A_BUTTON)) return "none";
  return "page";
}

/** KeyboardKeyHandler_Backspace (naming_screen.c). */
export function KeyboardKeyHandler_Backspace(model: NamingModel, pressed: number): NamingAction {
  if (!(pressed & A_BUTTON)) return "none";
  DeleteTextCharacter(model);
  return "delete";
}

/** KeyboardKeyHandler_OK (naming_screen.c). */
export function KeyboardKeyHandler_OK(model: NamingModel, pressed: number): NamingAction {
  if (!(pressed & A_BUTTON)) return "none";
  return "confirm";
}

/** HandleDpadMovement (naming_screen.c). */
export function HandleDpadMovement(model: NamingModel, repeated: number): NamingAction {
  let dx = 0, dy = 0;
  if (repeated & DPAD_UP) dy = -1;
  if (repeated & DPAD_DOWN) dy = 1;
  if (repeated & DPAD_LEFT) { dx = -1; dy = 0; }
  if (repeated & DPAD_RIGHT) { dx = 1; dy = 0; }
  if (!dx && !dy) return "none";

  const previousX = model.x;
  model.x += dx;
  model.y += dy;
  if (model.x < 0) model.x = GetCurrentPageColumnCount(model);
  if (model.x > GetCurrentPageColumnCount(model)) model.x = 0;
  if (dx) {
    if (model.onButton) {
      model.buttonRow = model.y;
      model.y = [0, 1, 1, 2][model.y] ?? 0;
    } else if (previousX === GetCurrentPageColumnCount(model)) {
      model.y = model.y === 1 ? model.buttonRow : [0, 0, 3][model.y] ?? 0;
    }
  }

  const buttonColumn = model.onButton;
  const rowCount = buttonColumn ? 3 : 4;
  if (model.y < 0) model.y = rowCount - 1;
  if (model.y >= rowCount) model.y = 0;
  if (buttonColumn) {
    if (model.y === 0) model.buttonRow = 1;
    else if (model.y === 2) model.buttonRow = 2;
  }
  return "move";
}

/** HandleKeyboardEvent (naming_screen.c), including the C key priority. */
export function HandleKeyboardEvent(model: NamingModel, pressed: number, repeated: number): NamingAction {
  if (pressed & A_BUTTON) {
    switch (GetKeyRoleAtCursorPos(model)) {
      case "character": return KeyboardKeyHandler_Character(model, pressed);
      case "page": return KeyboardKeyHandler_Page(model, pressed);
      case "backspace": return KeyboardKeyHandler_Backspace(model, pressed);
      case "ok": return KeyboardKeyHandler_OK(model, pressed);
    }
  }
  if (pressed & B_BUTTON) {
    DeleteTextCharacter(model);
    return "delete";
  }
  if (pressed & SELECT_BUTTON) {
    return "page";
  }
  if (pressed & START_BUTTON) {
    MoveCursorToOKButton(model);
    return "move";
  }
  return HandleDpadMovement(model, repeated);
}

export class NamingModel {
  readonly template: NamingTemplate;
  readonly text: Uint8Array;
  page: number;
  x = 0;
  y = 0;
  /** tButtonId in Task_HandleInput: keyboard row to restore from the button column. */
  buttonRow = 0;

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

  get keyboardId(): number { return CurrentPageToKeyboardId(this); }
  get columns(): number { return data<number[]>("sPageColumnCounts")[this.keyboardId]; }
  get columnPositions(): number[] { return data<number[][]>("sPageColumnXPos")[this.keyboardId]; }
  get caret(): number { return GetTextEntryPosition(this); }
  get onButton(): boolean { return this.x === this.columns; }

  moveToOK(): void { this.x = this.columns; this.y = 2; }

  swapPage(): void {
    const onButton = this.onButton;
    this.page = (this.page + 1) % 3;
    this.x = onButton ? this.columns : Math.min(this.x, this.columns - 1);
  }

  deleteCharacter(): void { this.text[GetPreviousTextCaretPosition(this)] = EOS; }

  input(pressed: number, repeated: number): NamingAction {
    return HandleKeyboardEvent(this, pressed, repeated);
  }
}
