// map_name_popup.c: the region name box that slides in from the top.

import { b64, rom } from "../rom";
import { flagGet } from "../save";
import { concat, encode } from "../gba/charmap";
import { FONT_NORMAL, stringWidth } from "../gba/font";
import { printText } from "../gba/textPrinter";
import { Window } from "../gba/window";
import type { Overworld } from "./overworld";

const FLOOR_ROOFTOP = 127;

export class MapNamePopup {
  private state = -1;
  private timer = 0;
  private pos = 0;
  private reshow = false;
  private window?: Window;
  private palIntoFadedBuffer = false;

  constructor(private readonly ow: Overworld) {}

  private MapNamePopupAppendFloorNum(dest: Uint8Array, floorNum: number): Uint8Array {
    if (floorNum === 0) return dest;
    if (floorNum === FLOOR_ROOFTOP) return concat(dest, concat(encode(" "), rom.text("gText_Rooftop2")));
    const suffix = floorNum < 0 ? ` B${-floorNum}F` : ` ${floorNum}F`;
    return concat(dest, encode(suffix));
  }

  mapName(): Uint8Array {
    const section = this.ow.header.regionMapSectionName;
    const entry = rom.regionMap.find((e) => e.id === section);
    let name = entry ? b64(entry.name) : encode("");
    const floor = this.ow.header.floorNumber;
    if (floor) {
      name = this.MapNamePopupAppendFloorNum(name, floor);
    }
    return name;
  }

  ShowMapNamePopup(palIntoFadedBuffer: boolean): void {
    if (flagGet(rom.constants.FLAG_DONT_SHOW_MAP_NAME_POPUP ?? 0)
      || this.isQuestLogPlayback()) return;
    if (this.state < 0) {
      this.state = 0;
      this.pos = 0;
      this.palIntoFadedBuffer = palIntoFadedBuffer;
    } else {
      if (this.state !== 4) this.state = 4;
      this.reshow = true;
    }
  }

  show(palIntoFadedBuffer: boolean): void { this.ShowMapNamePopup(palIntoFadedBuffer); }

  private isQuestLogPlayback(): boolean {
    const state = (this.ow.game as unknown as { questLogState?: number }).questLogState;
    return state !== undefined && state >= C_QL_PLAYBACK && state <= (rom.constants.QL_STATE_PLAYBACK_LAST ?? C_QL_PLAYBACK);
  }

  DismissMapNamePopup(): void {
    if (this.state >= 0 && this.state < 6) this.state = 6;
  }
  dismiss(): void { this.DismissMapNamePopup(); }

  IsMapNamePopupTaskActive(): boolean {
    return this.state >= 0;
  }
  isActive(): boolean { return this.IsMapNamePopupTaskActive(); }

  private MapNamePopupCreateWindow(_palIntoFadedBuffer: boolean): void {
    const floor = this.ow.header.floorNumber;
    const width = floor ? (floor === FLOOR_ROOFTOP ? 22 : 19) : 14;
    this.window = new Window(1, 29, width, 2);
    this.window.frame = "stdwin";
    this.MapNamePopupPrintMapNameOnWindow();
  }

  private MapNamePopupPrintMapNameOnWindow(): void { this.print(); }

  private print(): void {
    if (!this.window) return;
    const floor = this.ow.header.floorNumber;
    const maxWidth = floor ? (floor === FLOOR_ROOFTOP ? 176 : 152) : 112;
    const name = this.mapName();
    const x = Math.max(0, Math.floor((maxWidth - stringWidth(FONT_NORMAL, name)) / 2));
    this.window.fill(1);
    printText(this.window, FONT_NORMAL, name, x, 2);
  }

  Task_MapNamePopup(): void {
    switch (this.state) {
      case 0:
        this.MapNamePopupCreateWindow(this.palIntoFadedBuffer);
        this.state = 1;
        break;
      case 1:
        // Canvas window/tilemap copies are synchronous, so C's DMA wait is clear.
      case 2:
        this.pos -= 2;
        if (this.pos <= -24) { this.state = 3; this.timer = 0; }
        break;
      case 3:
        if (++this.timer > 120) { this.timer = 0; this.state = 4; }
        break;
      case 4:
        this.pos += 2;
        if (this.pos >= 0) {
          if (this.reshow) {
            this.MapNamePopupPrintMapNameOnWindow();
            this.state = 1;
            this.reshow = false;
          } else {
            this.state = 6;
          }
        }
        break;
      case 6:
        this.window?.fill(0);
        this.state = 7;
        break;
      case 7:
        this.window = undefined;
        this.state = 8;
        break;
      case 8:
        this.state = -1;
        break;
    }
  }

  update(): void { this.Task_MapNamePopup(); }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.window || this.state < 1) return;
    // BG0 scrolled by pos: rows 28..31 wrap to the top of the screen.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 240, 160);
    ctx.clip();
    ctx.translate(0, -256 - this.pos);
    this.window.render(ctx);
    ctx.restore();
  }
}

const C_QL_PLAYBACK = rom.constants.QL_STATE_PLAYBACK ?? -1;
