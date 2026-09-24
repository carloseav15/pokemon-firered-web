// option_menu.c: option values, wraparound and CloseAndSaveOptionMenu semantics.
import type { SaveData } from "../save";
import { A_BUTTON, B_BUTTON, DPAD_RIGHT, DPAD_LEFT, DPAD_UP, DPAD_DOWN } from "../gba/input";
export const OPTION_COUNTS = [3, 2, 2, 2, 3, 10, 0] as const;
export const OPTION_LABELS = ["TEXT SPEED", "BATTLE SCENE", "BATTLE STYLE", "SOUND", "BUTTON MODE", "FRAME", "CANCEL"] as const;
const CHOICES = [["SLOW", "MID", "FAST"], ["ON", "OFF"], ["SHIFT", "SET"], ["MONO", "STEREO"], ["HELP", "LR", "L=A"]];

export class OptionsModel {
  cursor = 0;
  readonly values: number[];
  constructor(private options: SaveData["options"]) {
    this.values = [options.textSpeed, options.battleScene ? 0 : 1, options.battleStyle, options.sound, options.buttonMode, options.frameType, 0];
  }
  label(row: number): string { return row < 5 ? CHOICES[row][this.values[row]] : row === 5 ? `TYPE ${String(this.values[row] + 1).padStart(2, "0")}` : ""; }
  input(pressed: number, repeated: number): "none" | "change" | "close" {
    if (repeated & (DPAD_RIGHT | DPAD_LEFT)) {
      const count = OPTION_COUNTS[this.cursor];
      if (count) this.values[this.cursor] = (this.values[this.cursor] + (repeated & DPAD_RIGHT ? 1 : count - 1)) % count;
      return count ? "change" : "none";
    }
    if (repeated & DPAD_UP) { this.cursor = (this.cursor + 6) % 7; return "change"; }
    if (repeated & DPAD_DOWN) { this.cursor = (this.cursor + 1) % 7; return "change"; }
    // Both A and B close and save in FireRed, regardless of the selected row.
    if (pressed & (A_BUTTON | B_BUTTON)) { this.commit(); return "close"; }
    return "none";
  }
  commit(): void {
    const [textSpeed, sceneOff, battleStyle, sound, buttonMode, frameType] = this.values;
    Object.assign(this.options, {textSpeed, battleScene: !sceneOff, battleStyle, sound, buttonMode, frameType});
  }
}
