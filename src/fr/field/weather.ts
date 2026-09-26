// Partial port of field_weather.c and field_weather_util.c.
// Overworld weather state, rain, fog drift, sandstorm and ash. Gamma tables
// and palette application are ported; weather-aware fades and drought palettes
// remain partial. The live stub count is generated in PENDING.md §3b.

import { rom } from "../rom";
import { incrementGameStat, save } from "../save";
import { hasIncbin, incbin, incbin16 } from "../hw/assets";
import { spriteSheet } from "./gfx4bpp";
import type { Overworld } from "./overworld";
import type { Rgb, TileRenderer } from "./tileRenderer";
import { sound } from "../audio/sound";
import * as C from "../generated/constants";
import * as WE from "./weatherEffects";
import { BlendPalette, GET_B, GET_G, GET_R, gPlttBufferFaded, gPlttBufferUnfaded } from "../hw/palette";

const GAMMA_STEP_DELAY = 20;

/** Gamma targets per engine weather id (InitVars in field_weather_effects.c). */
export const GAMMA_TARGETS = [0, 0, 0, 3, 3, 3, 0, 0, 0, 0, 0, 3, 0, 3, 0, 0];

/** Sprite brightness approximation of each gamma step (tiles use exact tables). */
export const SPRITE_BRIGHTNESS = [1, 0.96, 0.9, 0.77];

export let gWeather = {
  currWeather: 0,
  nextWeather: 0,
  rainStrength: 0,
  weatherGfxLoaded: false,
  gammaIndex: 0,
  gammaTargetIndex: 0,
  gammaStepDelay: 0,
  gammaStepFrameCounter: 0,
  gammaShifts: [] as number[][],
  altGammaShifts: [] as number[][],
  altGammaSpritePalIndex: 0xff,
  palProcessingState: 0,
  fadeDestColor: 0,
  fadeScreenCounter: 0,
  paletteFadeDelay: 0,
  weatherChangeComplete: true,
  blendCoeff: 0,
  targetBlendCoeff: 0,
  currBlendEVA: 0,
  currBlendEVB: 0,
  targetBlendEVA: 0,
  targetBlendEVB: 0,
};

/** Build one of field_weather.c's normal or alternate gamma tables. */
function buildGammaShiftTable(alternate: boolean): number[][] {
  const table: number[][] = Array.from({ length: 19 }, () => new Array(32).fill(0));
  for (let v2 = 0; v2 < 32; v2++) {
    let v4 = v2 << 8;
    const v5 = alternate ? 0 : (v2 << 8) / 16;
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

/** BuildGammaShiftTables (field_weather.c). */
export function BuildGammaShiftTables(): number[][] {
  return buildGammaShiftTable(false);
}

export const buildGammaTable = BuildGammaShiftTables;
export const GAMMA_TABLE = BuildGammaShiftTables();
export const GAMMA_TABLE_ALT = buildGammaShiftTable(true);

const GAMMA_NONE = 0;
const GAMMA_NORMAL = 1;
const GAMMA_ALT = 2;
const BASE_PALETTE_GAMMA_TYPES = [
  GAMMA_NORMAL, GAMMA_NORMAL, GAMMA_NORMAL, GAMMA_NORMAL,
  GAMMA_NORMAL, GAMMA_NORMAL, GAMMA_NORMAL, GAMMA_NORMAL,
  GAMMA_NORMAL, GAMMA_NORMAL, GAMMA_NORMAL, GAMMA_NORMAL,
  GAMMA_NORMAL, GAMMA_NONE, GAMMA_NONE, GAMMA_NONE,
  GAMMA_ALT, GAMMA_NORMAL, GAMMA_ALT, GAMMA_ALT,
  GAMMA_ALT, GAMMA_ALT, GAMMA_NORMAL, GAMMA_NORMAL,
  GAMMA_NORMAL, GAMMA_NORMAL, GAMMA_ALT, GAMMA_NORMAL,
  GAMMA_NORMAL, GAMMA_NORMAL, GAMMA_NORMAL, GAMMA_NORMAL,
];
let paletteGammaTypes = [...BASE_PALETTE_GAMMA_TYPES];

gWeather.gammaShifts = GAMMA_TABLE;
gWeather.altGammaShifts = GAMMA_TABLE_ALT;

const to8bit = (v: number): number => Math.min(255, Math.round((v * 255) / 31));

/** TranslateWeatherNum (ROUTE119/123 cycles never occur in FRLG). */
function translate(weather: number): number {
  weather &= 0xff;
  if (weather >= 0 && weather <= 15) return weather;
  return rom.c("WEATHER_NONE") ?? 0;
}

/** SetCurrentAndNextWeather */
export function SetCurrentAndNextWeather(weather: number): void {
  gWeather.currWeather = weather;
  gWeather.nextWeather = weather;
}

/** SetCurrentAndNextWeatherNoDelay */
export function SetCurrentAndNextWeatherNoDelay(weather: number): void {
  SetCurrentAndNextWeather(weather);
}

/** SetNextWeather */
export function SetNextWeather(weather: number): void {
  gWeather.nextWeather = weather;
}

/** GetCurrentWeather */
export function GetCurrentWeather(): number {
  return gWeather.currWeather;
}

/** SetFieldWeather */
export function SetFieldWeather(weather: number): void {
  SetCurrentAndNextWeather(weather);
}

/** StartWeather */
export function StartWeather(): void {
  SetCurrentAndNextWeather(gWeather.nextWeather);
}

/** Task_WeatherInit */
export function Task_WeatherInit(): void {
  // Weather initialization task
}

/** Task_WeatherMain */
export function Task_WeatherMain(): void {
  UpdateWeatherGammaShift();
}

/** None_Init */
export function None_Init(): void {}

/** None_Main */
export function None_Main(): void {}

/** None_Finish */
export function None_Finish(): boolean {
  return true;
}

export interface WeatherCallbacks {
  initVars: () => void;
  main: () => void;
  initAll: () => void;
  finish: () => boolean;
}

export const sWeatherFuncs: WeatherCallbacks[] = [
  { initVars: None_Init, main: None_Main, initAll: None_Init, finish: None_Finish },
  { initVars: WE.Clouds_InitVars, main: WE.Clouds_Main, initAll: WE.Clouds_InitAll, finish: WE.Clouds_Finish },
  { initVars: WE.Sunny_InitVars, main: WE.Sunny_Main, initAll: WE.Sunny_InitAll, finish: WE.Sunny_Finish },
  { initVars: WE.Rain_InitVars, main: WE.Rain_Main, initAll: WE.Rain_InitAll, finish: WE.Rain_Finish },
  { initVars: WE.Snow_InitVars, main: WE.Snow_Main, initAll: WE.Snow_InitAll, finish: WE.Snow_Finish },
  { initVars: WE.Thunderstorm_InitVars, main: WE.Thunderstorm_Main, initAll: WE.Thunderstorm_InitAll, finish: WE.Thunderstorm_Finish },
  { initVars: WE.FogHorizontal_InitVars, main: WE.FogHorizontal_Main, initAll: WE.FogHorizontal_InitAll, finish: WE.FogHorizontal_Finish },
  { initVars: WE.Ash_InitVars, main: WE.Ash_Main, initAll: WE.Ash_InitAll, finish: WE.Ash_Finish },
  { initVars: WE.Sandstorm_InitVars, main: WE.Sandstorm_Main, initAll: WE.Sandstorm_InitAll, finish: WE.Sandstorm_Finish },
  { initVars: WE.FogDiagonal_InitVars, main: WE.FogDiagonal_Main, initAll: WE.FogDiagonal_InitAll, finish: WE.FogDiagonal_Finish },
  { initVars: WE.FogHorizontal_InitVars, main: WE.FogHorizontal_Main, initAll: WE.FogHorizontal_InitAll, finish: WE.FogHorizontal_Finish },
  { initVars: WE.Shade_InitVars, main: WE.Shade_Main, initAll: WE.Shade_InitAll, finish: WE.Shade_Finish },
  { initVars: WE.Drought_InitVars, main: WE.Drought_Main, initAll: WE.Drought_InitAll, finish: WE.Drought_Finish },
  { initVars: WE.Downpour_InitVars, main: WE.Thunderstorm_Main, initAll: WE.Downpour_InitAll, finish: WE.Thunderstorm_Finish },
  { initVars: WE.Bubbles_InitVars, main: WE.Bubbles_Main, initAll: WE.Bubbles_InitAll, finish: WE.Bubbles_Finish },
];

/** UpdateWeatherGammaShift */
export function UpdateWeatherGammaShift(): void {
  if (gWeather.gammaIndex !== gWeather.gammaTargetIndex) {
    if (++gWeather.gammaStepFrameCounter >= GAMMA_STEP_DELAY) {
      gWeather.gammaStepFrameCounter = 0;
      gWeather.gammaIndex += gWeather.gammaIndex < gWeather.gammaTargetIndex ? 1 : -1;
    }
  }
}

/** ApplyGammaShift (field_weather.c). Negative gamma is dummied out in FRLG. */
export function ApplyGammaShift(startPalIndex: number, numPalettes: number, gammaIndex: number): void {
  const signedGammaIndex = (gammaIndex << 24) >> 24; // C parameter type: s8.
  if (signedGammaIndex < 0) return;

  const firstPalette = startPalIndex & 0xff;
  const endPalette = firstPalette + (numPalettes & 0xff);
  const firstColor = firstPalette * 16;
  if (signedGammaIndex === 0) {
    const endColor = firstColor + (numPalettes & 0xff) * 16;
    for (let colorIndex = firstColor; colorIndex < endColor; colorIndex++) {
      gPlttBufferFaded[colorIndex] = gPlttBufferUnfaded[colorIndex] ?? 0;
    }
    return;
  }

  const row = signedGammaIndex - 1;
  for (let paletteIndex = firstPalette; paletteIndex < endPalette; paletteIndex++) {
    const colorOffset = paletteIndex * 16;
    if (paletteGammaTypes[paletteIndex] === GAMMA_NONE) {
      for (let i = 0; i < 16; i++) {
        gPlttBufferFaded[colorOffset + i] = gPlttBufferUnfaded[colorOffset + i] ?? 0;
      }
      continue;
    }

    const useAlternate = paletteGammaTypes[paletteIndex] === GAMMA_ALT
      || paletteIndex - 16 === gWeather.altGammaSpritePalIndex;
    const gammaTable = (useAlternate ? gWeather.altGammaShifts : gWeather.gammaShifts)[row];
    if (!gammaTable) continue;
    for (let i = 0; i < 16; i++) {
      const color = gPlttBufferUnfaded[colorOffset + i] ?? 0;
      const r = gammaTable[color & 0x1f] ?? 0;
      const green = gammaTable[(color >>> 5) & 0x1f] ?? 0;
      const b = gammaTable[(color >>> 10) & 0x1f] ?? 0;
      gPlttBufferFaded[colorOffset + i] = (b << 10) | (green << 5) | r;
    }
  }
}

/** ApplyGammaShiftWithBlend (field_weather.c). */
export function ApplyGammaShiftWithBlend(
  startPalIndex: number,
  numPalettes: number,
  gammaIndex: number,
  blendCoeff: number,
  blendColor: number,
): void {
  const firstPalette = startPalIndex & 0xff;
  const endPalette = firstPalette + (numPalettes & 0xff);
  const row = ((gammaIndex << 24) >> 24) - 1; // C parameter type: s8.
  const coefficient = blendCoeff & 0xff;
  const color = blendColor & 0xffff;
  const blendR = GET_R(color);
  const blendG = GET_G(color);
  const blendB = GET_B(color);

  for (let paletteIndex = firstPalette; paletteIndex < endPalette; paletteIndex++) {
    const colorOffset = paletteIndex * 16;
    if (paletteGammaTypes[paletteIndex] === GAMMA_NONE) {
      BlendPalette(colorOffset, 16, coefficient, color);
      continue;
    }

    const gammaTable = (paletteGammaTypes[paletteIndex] === GAMMA_NORMAL
      ? gWeather.gammaShifts
      : gWeather.altGammaShifts)[row];
    if (!gammaTable) continue;
    for (let i = 0; i < 16; i++) {
      const baseColor = gPlttBufferUnfaded[colorOffset + i] ?? 0;
      const gammaR = gammaTable[GET_R(baseColor)] ?? 0;
      const gammaG = gammaTable[GET_G(baseColor)] ?? 0;
      const gammaB = gammaTable[GET_B(baseColor)] ?? 0;
      const r = gammaR + (((blendR - gammaR) * coefficient) >> 4);
      const g = gammaG + (((blendG - gammaG) * coefficient) >> 4);
      const b = gammaB + (((blendB - gammaB) * coefficient) >> 4);
      gPlttBufferFaded[colorOffset + i] = (b << 10) | (g << 5) | r;
    }
  }
}

/** ApplyDroughtGammaShiftWithBlend */
export function ApplyDroughtGammaShiftWithBlend(gammaIndex: number, blendCoeff: number, blendColor: number): void {}

/** FadeInScreenWithWeather */
export function FadeInScreenWithWeather(): void {}

/** FadeInScreen_RainShowShade (field_weather.c). */
export function FadeInScreen_RainShowShade(): boolean {
  if (gWeather.fadeScreenCounter === 16) return false;

  gWeather.fadeScreenCounter++;
  if (gWeather.fadeScreenCounter >= 16) {
    ApplyGammaShift(0, 32, 3);
    gWeather.fadeScreenCounter = 16;
    return false;
  }

  ApplyGammaShiftWithBlend(0, 32, 3, 16 - gWeather.fadeScreenCounter, gWeather.fadeDestColor);
  return true;
}

/** FadeInScreen_Drought */
export function FadeInScreen_Drought(): boolean {
  return true;
}

/** FadeInScreen_FogHorizontal */
export function FadeInScreen_FogHorizontal(): boolean {
  return true;
}

/** DoNothing */
export function DoNothing(): void {}

/** ApplyFogBlend */
export function ApplyFogBlend(blendCoeff: number, blendColor: number): void {}

/** LightenSpritePaletteInFog */
export function LightenSpritePaletteInFog(paletteIndex: number): boolean {
  return false;
}

/** MarkFogSpritePalToLighten */
export function MarkFogSpritePalToLighten(paletteIndex: number): void {}

/** IsWeatherChangeComplete */
export function IsWeatherChangeComplete(): boolean {
  return gWeather.weatherChangeComplete;
}

/** IsWeatherFadingIn */
export function IsWeatherFadingIn(): boolean {
  return !gWeather.weatherChangeComplete;
}

/** IsWeatherNotFadingIn */
export function IsWeatherNotFadingIn(): boolean {
  return gWeather.weatherChangeComplete;
}

/** PlayRainStoppingSoundEffect */
export function PlayRainStoppingSoundEffect(): void {
  sound.playSE(C.SE_RAIN);
}

/** SetRainStrengthFromSoundEffect (field_weather.c). */
export function SetRainStrengthFromSoundEffect(soundEffect: number): void {
  if (gWeather.palProcessingState === C.WEATHER_PAL_STATE_SCREEN_FADING_OUT) return;

  switch (soundEffect & 0xffff) {
    case C.SE_RAIN:
      gWeather.rainStrength = 0;
      break;
    case C.SE_DOWNPOUR:
      gWeather.rainStrength = 1;
      break;
    case C.SE_THUNDERSTORM:
      gWeather.rainStrength = 2;
      break;
    default:
      return;
  }

  sound.playSE(soundEffect & 0xffff);
}

/** PreservePaletteInWeather (field_weather.c). */
export function PreservePaletteInWeather(paletteIndex: number): void {
  paletteGammaTypes = [...BASE_PALETTE_GAMMA_TYPES];
  if (paletteIndex >= 0 && paletteIndex < paletteGammaTypes.length) paletteGammaTypes[paletteIndex] = GAMMA_NONE;
}

/** ResetPreservedPalettesInWeather (field_weather.c). */
export function ResetPreservedPalettesInWeather(): void {
  paletteGammaTypes = [...BASE_PALETTE_GAMMA_TYPES];
}

/** UpdateSpritePaletteWithWeather */
export function UpdateSpritePaletteWithWeather(paletteIndex: number): void {}

/** WeatherBeginGammaFade */
export function WeatherBeginGammaFade(gammaIndex: number, gammaTarget: number, stepDelay: number): void {
  gWeather.gammaIndex = gammaIndex;
  gWeather.gammaTargetIndex = gammaTarget;
  gWeather.gammaStepDelay = stepDelay;
}

/** WeatherProcessingIdle */
export function WeatherProcessingIdle(): boolean {
  return true;
}

/** WeatherShiftGammaIfPalStateIdle */
export function WeatherShiftGammaIfPalStateIdle(): void {
  UpdateWeatherGammaShift();
}

/** Weather_SetBlendCoeffs */
export function Weather_SetBlendCoeffs(eva: number, evb: number): void {
  gWeather.currBlendEVA = eva;
  gWeather.currBlendEVB = evb;
}

/** Weather_SetTargetBlendCoeffs */
export function Weather_SetTargetBlendCoeffs(eva: number, evb: number, delay: number): void {
  gWeather.targetBlendEVA = eva;
  gWeather.targetBlendEVB = evb;
}

/** Weather_UpdateBlend */
export function Weather_UpdateBlend(): boolean {
  return true;
}

/** DroughtStateInit */
export function DroughtStateInit(): void {}

/** DroughtStateRun */
export function DroughtStateRun(): void {}

/** LoadDroughtWeatherPalette */
export function LoadDroughtWeatherPalette(): void {}

/** LoadDroughtWeatherPalettes */
export function LoadDroughtWeatherPalettes(): void {}

/** ResetDroughtWeatherPaletteLoading */
export function ResetDroughtWeatherPaletteLoading(): void {}

/** SetDroughtGamma */
export function SetDroughtGamma(): void {}

/** SetWeatherScreenFadeOut */
export function SetWeatherScreenFadeOut(): void {
  gWeather.palProcessingState = C.WEATHER_PAL_STATE_SCREEN_FADING_OUT;
}

/** SlightlyDarkenPalsInWeather */
export function SlightlyDarkenPalsInWeather(startPalIndex: number, numPalettes: number): void {}

/** FadeScreen */
export function FadeScreen(mode: number, delay: number): void {}

/** FadeSelectedPals */
export function FadeSelectedPals(bitmask: number, delay: number): void {}

/** LoadCustomWeatherSpritePalette */
export function LoadCustomWeatherSpritePalette(palette: any): void {}

/** ApplyWeatherGammaShiftToPal */
export function ApplyWeatherGammaShiftToPal(paletteIndex: number): void {}

export class FieldWeather {
  saved = 0;
  current = 0;
  next = 0;
  gammaIndex = 0;
  gammaTarget = 0;
  private stepCounter = 0;
  private fogScroll = 0;
  private fogTick = 0;
  private rainTick = 0;
  private rainDrops: Array<{ x: number; y: number; speed: number; len: number }> = [];
  private sandParticles: Array<{ x: number; y: number; speed: number }> = [];
  private fogCanvas?: HTMLCanvasElement;
  private boundRenderer?: TileRenderer;
  private appliedGamma = -1;

  constructor() {
    // Initialize rain drops
    for (let i = 0; i < 24; i++) {
      this.rainDrops.push({
        x: Math.random() * 240,
        y: Math.random() * 160,
        speed: 6 + Math.random() * 4,
        len: 8 + Math.random() * 6,
      });
    }
    // Initialize sandstorm particles
    for (let i = 0; i < 30; i++) {
      this.sandParticles.push({
        x: Math.random() * 240,
        y: Math.random() * 160,
        speed: 5 + Math.random() * 5,
      });
    }
  }

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
    if (weather !== old && (weather === C.WEATHER_RAIN || weather === C.WEATHER_RAIN_THUNDERSTORM)) {
      incrementGameStat(C.GAME_STAT_GOT_RAINED_ON);
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
      SetCurrentAndNextWeather(this.current);
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

    // Advance weather particle positions
    const isRain = this.current === (rom.c("WEATHER_RAIN") ?? 3) || this.current === (rom.c("WEATHER_RAIN_THUNDERSTORM") ?? 5);
    const isSand = this.current === (rom.c("WEATHER_SANDSTORM") ?? 8);
    const isFog = this.current === (rom.c("WEATHER_FOG_HORIZONTAL") ?? 6) || this.current === (rom.c("WEATHER_FOG_DIAGONAL") ?? 7);

    if (isRain) {
      for (const drop of this.rainDrops) {
        drop.x -= 2;
        drop.y += drop.speed;
        if (drop.y > 160) {
          drop.y = -10;
          drop.x = Math.random() * 260;
        }
      }
    }

    if (isSand) {
      for (const p of this.sandParticles) {
        p.x -= p.speed;
        p.y += p.speed * 0.5;
        if (p.x < -10 || p.y > 170) {
          p.x = 250 + Math.random() * 20;
          p.y = Math.random() * 160;
        }
      }
    }

    if (isFog) {
      if (++this.fogTick > 3) {
        this.fogTick = 0;
        this.fogScroll++;
      }
    }
  }

  /** Render weather overlays (rain drops, sandstorm, fog, ash). */
  renderFog(ctx: CanvasRenderingContext2D, camX: number): void {
    const isFogH = this.current === (rom.c("WEATHER_FOG_HORIZONTAL") ?? 6);
    const isFogD = this.current === (rom.c("WEATHER_FOG_DIAGONAL") ?? 7);
    const isRain = this.current === (rom.c("WEATHER_RAIN") ?? 3) || this.current === (rom.c("WEATHER_RAIN_THUNDERSTORM") ?? 5);
    const isSand = this.current === (rom.c("WEATHER_SANDSTORM") ?? 8);
    const isAsh = this.current === (rom.c("WEATHER_VOLCANIC_ASH") ?? 9);

    if (isFogH || isFogD) {
      const canvas = this.fogCanvas ??= this.buildFogCanvas();
      if (canvas) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        const off = (((camX + this.fogScroll) % 64) + 64) % 64;
        for (let x = -off; x < 240; x += 64) {
          for (let y = 0; y < 160; y += 64) ctx.drawImage(canvas, x, y);
        }
        ctx.restore();
      }
    }

    if (isRain) {
      ctx.save();
      ctx.strokeStyle = "rgba(180, 210, 255, 0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const drop of this.rainDrops) {
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 3, drop.y + drop.len);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (isSand) {
      ctx.save();
      ctx.fillStyle = "rgba(210, 180, 120, 0.6)";
      for (const p of this.sandParticles) {
        ctx.fillRect(p.x, p.y, 2, 2);
      }
      ctx.restore();
    }

    if (isAsh) {
      ctx.save();
      ctx.fillStyle = "rgba(220, 220, 230, 0.5)";
      for (let i = 0; i < 15; i++) {
        const ax = ((i * 19 + this.fogScroll * 2) % 240);
        const ay = ((i * 23 + this.fogScroll * 3) % 160);
        ctx.fillRect(ax, ay, 2, 2);
      }
      ctx.restore();
    }
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
