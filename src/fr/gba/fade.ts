// gPaletteFade: BeginNormalPaletteFade / UpdateNormalPaletteFade and
// FadeScreen. The blend is applied as a full-screen overlay, which matches
// BlendPalette (c + (blend - c) * y / 16) for whole-screen fades.

export const FADE_FROM_BLACK = 0;
export const FADE_TO_BLACK = 1;
export const FADE_FROM_WHITE = 2;
export const FADE_TO_WHITE = 3;

export const RGB_BLACK = [0, 0, 0];
export const RGB_WHITE = [255, 255, 255];

class PaletteFade {
  active = false;
  y = 0;
  targetY = 0;
  deltaY = 2;
  delay = 0;
  delayCounter = 0;
  color = RGB_BLACK;
  yDec = false;
  private toggle = false;
  private finishing = false;
  private finishCounter = 0;
  /** Level applied to the frame (0..16), kept after the fade ends. */
  level = 0;
  /** Palettes affected: "all" or "bg" (used by a few effects). */
  target: "all" | "bg" | "obj" = "all";

  begin(delay: number, startY: number, targetY: number, color: number[], target: "all" | "bg" | "obj" = "all"): boolean {
    if (this.active) return false;
    this.deltaY = 2;
    if (delay < 0) {
      this.deltaY += -delay;
      delay = 0;
    }
    this.delay = delay;
    this.delayCounter = delay;
    this.y = startY;
    this.targetY = targetY;
    this.color = color;
    this.active = true;
    this.yDec = startY >= targetY;
    this.toggle = false;
    this.finishing = false;
    this.target = target;
    this.level = startY;
    this.update();
    return true;
  }

  /** FadeScreen from field_weather.c */
  fadeScreen(mode: number, delay: number): void {
    switch (mode) {
      case FADE_FROM_BLACK: this.begin(delay, 16, 0, RGB_BLACK); break;
      case FADE_TO_BLACK: this.begin(delay, 0, 16, RGB_BLACK); break;
      case FADE_FROM_WHITE: this.begin(delay, 16, 0, RGB_WHITE); break;
      case FADE_TO_WHITE: this.begin(delay, 0, 16, RGB_WHITE); break;
    }
  }

  /** Instantly show a solid color (palette_bg_faded_fill_black etc). */
  fill(color: number[]): void {
    this.color = color;
    this.level = 16;
    this.y = 16;
  }

  clear(): void {
    this.active = false;
    this.level = 0;
    this.y = 0;
  }

  update(): void {
    if (!this.active) return;
    if (this.finishing) {
      // IsSoftwarePaletteFadeFinishing: two extra frames before inactive.
      if (++this.finishCounter >= 2) {
        this.active = false;
        this.finishing = false;
      }
      return;
    }
    if (!this.toggle) {
      if (this.delayCounter < this.delay) {
        this.delayCounter++;
        return;
      }
      this.delayCounter = 0;
    }
    this.level = this.y;
    this.toggle = !this.toggle;
    if (!this.toggle) {
      if (this.y === this.targetY) {
        this.finishing = true;
        this.finishCounter = 0;
      } else if (!this.yDec) {
        this.y = Math.min(this.targetY, this.y + this.deltaY);
      } else {
        this.y = Math.max(this.targetY, this.y - this.deltaY);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.level <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.level / 16);
    ctx.fillStyle = `rgb(${this.color[0]},${this.color[1]},${this.color[2]})`;
    ctx.fillRect(0, 0, 240, 160);
    ctx.restore();
  }
}

export const paletteFade = new PaletteFade();
