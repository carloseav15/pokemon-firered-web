// field_weather.c / field_weather_util.c: overworld weather state, gamma
// shifts and fog drift. Source drives per-weather sprite effects and hardware
// palette fades; this keeps the same saved/current/next state, gamma targets,
// 20-frame gamma stepping and fog scroll, with the gamma applied exactly to
// the software tile palettes (sprite dimming is a brightness approximation,
// and only fog-horizontal has an overlay - rain/snow/ash never occur in FRLG).

import { rom } from "../rom";
import { incrementGameStat, save } from "../save";
import { hasIncbin, incbin, incbin16 } from "../hw/assets";
import { spriteSheet } from "./gfx4bpp";
import type { Overworld } from "./overworld";
import type { Rgb, TileRenderer } from "./tileRenderer";

const GAMMA_STEP_DELAY = 20;

/** Gamma targets per engine weather id (InitVars in field_weather_effects.c). */
const GAMMA_TARGETS = [0, 0, 0, 3, 3, 3, 0, 0, 0, 0, 0, 3, 0, 3, 0, 0];

/** Sprite brightness approximation of each gamma step (tiles use exact tables). */
const SPRITE_BRIGHTNESS = [1, 0.96, 0.9, 0.77];

/** BuildGammaShiftTables (normal table): exact u16 port, rows 0..18. */
export function buildGammaTable(): number[][] {
  const table: number[][] = Array.from({ length: 19 }, () => new Array(32).fill(0));
  for (let v2 = 0; v2 < 32; v2++) {
    let v4 = v2 << 8;
    const v5 = (v2 << 8) / 16;
    let gammaIndex = 0;
    for (; gammaIndex <= 2; gammaIndex++) {
      v4 = v4 - v5;
      table[gammaIndex][v2] = v4 >> 8;
    }
    const v9 = v4;
    let v10 = 0x1f00 - v4;
    if (0x1f00 - v4 < 0) v10 += 0xf;
    const v11 = v10 >> 4;
    if (v2 < 12) {
      for (; gammaIndex < 19; gammaIndex++) {
        v4 += v11;
        const dunno = v4 - v9;
        if (dunno > 0) v4 -= Math.trunc(dunno / 2);
        const val = v4 >> 8;
        table[gammaIndex][v2] = val > 0x1f ? 0x1f : val;
      }
    } else {
      for (; gammaIndex < 19; gammaIndex++) {
        v4 += v11;
        const val = v4 >> 8;
        table[gammaIndex][v2] = val > 0x1f ? 0x1f : val;
      }
    }
  }
  return table;
}

const GAMMA_TABLE = buildGammaTable();

const to8bit = (v: number): number => Math.min(255, Math.round((v * 255) / 31));

/** TranslateWeatherNum (ROUTE119/123 cycles never occur in FRLG). */
function translate(weather: number): number {
  weather &= 0xff;
  if (weather >= 0 && weather <= 15) return weather;
  return rom.c("WEATHER_NONE") ?? 0;
}

export class FieldWeather {
  saved = 0;
  current = 0;
  next = 0;
  gammaIndex = 0;
  gammaTarget = 0;
  private stepCounter = 0;
  private fogScroll = 0;
  private fogTick = 0;
  private fogCanvas?: HTMLCanvasElement;
  private boundRenderer?: TileRenderer;
  private appliedGamma = -1;
  private appliedFilter: string | null | undefined = undefined;

  /** SetSavedWeatherFromCurrMapHeader */
  setSavedFromHeader(headerWeather: number): void {
    this.setSavedRaw(translate(headerWeather));
  }

  /** SetSavedWeather */
  setSaved(weather: number): void {
    this.setSavedRaw(translate(weather));
  }

  /** SetWeather: update the saved weather and immediately schedule it. */
  setWeather(weather: number): void {
    this.setSaved(weather);
    this.next = this.saved;
  }

  private setSavedRaw(weather: number): void {
    const old = this.saved;
    this.saved = weather;
    save.weather = weather;
    // UpdateRainCounter: entering rain or thunderstorm.
    const c = rom.constants;
    if (weather !== old && (weather === c.WEATHER_RAIN || weather === c.WEATHER_RAIN_THUNDERSTORM)) {
      incrementGameStat(c.GAME_STAT_GOT_RAINED_ON);
    }
  }

  /** DoCurrentWeather */
  doCurrent(): void {
    this.next = this.saved;
  }

  get spriteFilter(): string | null {
    if (this.gammaIndex <= 0) return null;
    return `brightness(${SPRITE_BRIGHTNESS[Math.min(this.gammaIndex, 3)] ?? 1})`;
  }

  /** Per-frame driver (Task_WeatherMain + UpdateWeatherGammaShift). */
  update(ow: Overworld): void {
    if (this.current !== this.next) {
      this.current = this.next;
      this.gammaTarget = GAMMA_TARGETS[this.current] ?? 0;
    }
    if (this.gammaIndex !== this.gammaTarget) {
      if (++this.stepCounter >= GAMMA_STEP_DELAY) {
        this.stepCounter = 0;
        this.gammaIndex += this.gammaIndex < this.gammaTarget ? 1 : -1;
      }
    }
    const renderer = ow.renderer;
    if (renderer && (renderer !== this.boundRenderer || this.gammaIndex !== this.appliedGamma)) {
      this.boundRenderer = renderer;
      this.appliedGamma = this.gammaIndex;
      renderer.tint = this.gammaIndex > 0 ? makeTint(this.gammaIndex) : null;
      renderer.invalidate();
    }
    const filter = this.spriteFilter;
    if (ow.sprites.filter !== filter) ow.sprites.filter = filter;
    if (this.current === (rom.c("WEATHER_FOG_HORIZONTAL") ?? 6)) {
      if (++this.fogTick > 3) {
        this.fogTick = 0;
        this.fogScroll++;
      }
    }
  }

  /** Fog-horizontal drift overlay (fog sprites + blend, approximated). */
  renderFog(ctx: CanvasRenderingContext2D, camX: number): void {
    if (this.current !== (rom.c("WEATHER_FOG_HORIZONTAL") ?? 6)) return;
    const canvas = this.fogCanvas ??= this.buildFogCanvas();
    if (!canvas) return;
    ctx.save();
    ctx.globalAlpha = 0.6;
    const off = (((camX + this.fogScroll) % 64) + 64) % 64;
    for (let x = -off; x < 240; x += 64) {
      for (let y = 0; y < 160; y += 64) ctx.drawImage(canvas, x, y);
    }
    ctx.restore();
  }

  private buildFogCanvas(): HTMLCanvasElement | undefined {
    try {
      if (!hasIncbin("gWeatherFogHorizontalTiles")) return undefined;
      const tiles = incbin("gWeatherFogHorizontalTiles");
      const pal = incbin16("gDefaultWeatherSpritePalette");
      return spriteSheet(tiles, pal, 64, 64, 1);
    } catch {
      return undefined;
    }
  }
}

function makeTint(gammaIndex: number): (c: Rgb) => Rgb {
  const row = GAMMA_TABLE[gammaIndex - 1] ?? GAMMA_TABLE[0];
  return (c: Rgb) => {
    const shift = (v: number): number => {
      const v5 = Math.min(31, Math.round((v * 31) / 255));
      return to8bit(row[v5] ?? v5);
    };
    return [shift(c[0] ?? 0), shift(c[1] ?? 0), shift(c[2] ?? 0)];
  };
}
