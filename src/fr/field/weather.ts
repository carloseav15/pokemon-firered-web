// Partial port of field_weather.c and field_weather_util.c.
// Overworld weather state, rain, fog drift, sandstorm and ash. The hardware
// palette fade dispatcher, rain, drought gamma state machine and horizontal-fog
// paths are partial; FRLG's disabled drought palette loader stalls its init.
// Canvas2D integration and weather sprites remain incomplete.
// The live stub count is generated in PENDING.md §3b.

import { random } from "../random";
import { incrementGameStat, save } from "../save";
import { hasIncbin, incbin, incbin16 } from "../hw/assets";
import { spriteSheet } from "./gfx4bpp";
import type { Overworld } from "./overworld";
import type { Rgb, TileRenderer } from "./tileRenderer";
import { sound } from "../audio/sound";
import * as C from "../generated/constants";
import * as WE from "./weatherEffects";
import { gSineTable } from "../hw/trig";
import { SetGpuReg } from "../hw/gpu";
import { BLDALPHA_BLEND, REG_OFFSET_BLDALPHA } from "../hw/ppu";
import { BeginNormalPaletteFade, BlendPalette, BlendPalettesAt, GET_B, GET_G, GET_R, gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, LoadPalette, OBJ_PLTT_ID, PALETTES_ALL, RGB, RGB_BLACK, RGB_WHITEALPHA } from "../hw/palette";

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
  readyForInit: false,
  initStep: 0,
  gammaIndex: 0,
  gammaTargetIndex: 0,
  gammaStepDelay: 0,
  gammaStepFrameCounter: 0,
  gammaShifts: [] as number[][],
  altGammaShifts: [] as number[][],
  altGammaSpritePalIndex: 0xff,
  weatherPicSpritePalIndex: 0,
  palProcessingState: C.WEATHER_PAL_STATE_IDLE,
  fadeDestColor: 0,
  fadeScreenCounter: 0,
  fadeInCounter: 0,
  fadeInActive: 0,
  lightenedFogSpritePals: [] as number[],
  lightenedFogSpritePalsCount: 0,
  droughtBrightnessStage: 0,
  droughtLastBrightnessStage: 0,
  droughtTimer: 0,
  droughtState: 0,
  loadDroughtPalsIndex: 0,
  loadDroughtPalsOffset: 0,
  paletteFadeDelay: 0,
  weatherChangeComplete: true,
  blendCoeff: 0,
  targetBlendCoeff: 0,
  currBlendEVA: 0,
  currBlendEVB: 0,
  targetBlendEVA: 0,
  targetBlendEVB: 0,
  blendDelay: 0,
  blendFrameCounter: 0,
  blendUpdateCounter: 0,
  weatherTaskFunc: "init" as "init" | "main",
};
let sDroughtFrameDelay = 0;

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

const WEATHER_CYCLE_ROUTE119 = [C.WEATHER_SUNNY, C.WEATHER_RAIN, C.WEATHER_RAIN_THUNDERSTORM, C.WEATHER_RAIN];
const WEATHER_CYCLE_ROUTE123 = [C.WEATHER_SUNNY, C.WEATHER_SUNNY, C.WEATHER_RAIN, C.WEATHER_SUNNY];

/** TranslateWeatherNum (field_weather_util.c), including the saved route-cycle stage. */
function translate(weather: number): number {
  switch (weather & 0xff) {
    case C.WEATHER_NONE:
    case C.WEATHER_SUNNY_CLOUDS:
    case C.WEATHER_SUNNY:
    case C.WEATHER_RAIN:
    case C.WEATHER_SNOW:
    case C.WEATHER_RAIN_THUNDERSTORM:
    case C.WEATHER_FOG_HORIZONTAL:
    case C.WEATHER_VOLCANIC_ASH:
    case C.WEATHER_SANDSTORM:
    case C.WEATHER_FOG_DIAGONAL:
    case C.WEATHER_UNDERWATER:
    case C.WEATHER_SHADE:
    case C.WEATHER_DROUGHT:
    case C.WEATHER_DOWNPOUR:
    case C.WEATHER_UNDERWATER_BUBBLES:
      return weather & 0xff;
    case C.WEATHER_ROUTE119_CYCLE:
    case C.WEATHER_ROUTE123_CYCLE: {
      const stage = ((save.weatherCycleStage ?? 0) & 0xffff) % 4;
      return (weather & 0xff) === C.WEATHER_ROUTE119_CYCLE ? WEATHER_CYCLE_ROUTE119[stage] : WEATHER_CYCLE_ROUTE123[stage];
    }
    default:
      return C.WEATHER_NONE;
  }
}

/** GetSav1Weather (field_weather_util.c). */
export function GetSav1Weather(): number {
  return save.weather ?? C.WEATHER_NONE;
}

/** UpdateWeatherPerDay (field_weather_util.c), with u16 stage storage. */
export function UpdateWeatherPerDay(increment: number): void {
  save.weatherCycleStage = (((save.weatherCycleStage ?? 0) + increment) & 0xffff) % 4;
}

/** UpdateRainCounter (field_weather_util.c). */
function UpdateRainCounter(newWeather: number, oldWeather: number): void {
  if (newWeather !== oldWeather && (newWeather === C.WEATHER_RAIN || newWeather === C.WEATHER_RAIN_THUNDERSTORM)) {
    incrementGameStat(C.GAME_STAT_GOT_RAINED_ON);
  }
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
  if (!gWeather.readyForInit) return;
  sWeatherFuncs[gWeather.currWeather]?.initAll();
  gWeather.weatherTaskFunc = "main";
}

/** Task_WeatherMain */
export function Task_WeatherMain(): void {
  if (gWeather.currWeather !== gWeather.nextWeather) {
    if (!sWeatherFuncs[gWeather.currWeather]?.finish()) {
      sWeatherFuncs[gWeather.nextWeather]?.initVars();
      gWeather.gammaStepFrameCounter = 0;
      gWeather.palProcessingState = C.WEATHER_PAL_STATE_CHANGING_WEATHER;
      gWeather.currWeather = gWeather.nextWeather;
      gWeather.weatherChangeComplete = true;
    }
  } else {
    sWeatherFuncs[gWeather.currWeather]?.main();
  }

  switch (gWeather.palProcessingState) {
    case C.WEATHER_PAL_STATE_CHANGING_WEATHER: UpdateWeatherGammaShift(); break;
    case C.WEATHER_PAL_STATE_SCREEN_FADING_IN: FadeInScreenWithWeather(); break;
  }
}

/** None_Init */
export function None_Init(): void {
  gWeather.gammaTargetIndex = 0;
  gWeather.gammaStepDelay = 0;
}

/** None_Main */
export function None_Main(): void {}

/** None_Finish */
export function None_Finish(): boolean {
  return false;
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
  if (gWeather.gammaIndex === gWeather.gammaTargetIndex) {
    gWeather.palProcessingState = C.WEATHER_PAL_STATE_IDLE;
  } else if ((gWeather.gammaStepFrameCounter = (gWeather.gammaStepFrameCounter + 1) & 0xff) >= gWeather.gammaStepDelay) {
    gWeather.gammaStepFrameCounter = 0;
    const gamma = (gWeather.gammaIndex << 24) >> 24;
    const target = (gWeather.gammaTargetIndex << 24) >> 24;
    gWeather.gammaIndex = gamma < target ? (gamma + 1 << 24) >> 24 : (gamma - 1 << 24) >> 24;
    ApplyGammaShift(0, 32, gWeather.gammaIndex);
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

/** ApplyDroughtGammaShiftWithBlend (field_weather.c; negative gamma is unused in FRLG). */
export function ApplyDroughtGammaShiftWithBlend(gammaIndex: number, blendCoeff: number, blendColor: number): void {
  // C transforms gammaIndex to a positive table index, but does not read it again.
  const droughtGammaIndex = -((gammaIndex << 24) >> 24) - 1;
  void droughtGammaIndex;

  const coefficient = blendCoeff & 0xff;
  const color = blendColor & 0xffff;
  const blendR = GET_R(color);
  const blendG = GET_G(color);
  const blendB = GET_B(color);

  for (let paletteIndex = 0; paletteIndex < 32; paletteIndex++) {
    const colorOffset = paletteIndex * 16;
    if (paletteGammaTypes[paletteIndex] === GAMMA_NONE) {
      BlendPalette(colorOffset, 16, coefficient, color);
      continue;
    }

    for (let i = 0; i < 16; i++) {
      const baseColor = gPlttBufferUnfaded[colorOffset + i] ?? 0;
      const r = GET_R(baseColor);
      const g = GET_G(baseColor);
      const b = GET_B(baseColor);
      const shiftedR = r + (((blendR - r) * coefficient) >> 4);
      const shiftedG = g + (((blendG - g) * coefficient) >> 4);
      const shiftedB = b + (((blendB - b) * coefficient) >> 4);
      gPlttBufferFaded[colorOffset + i] = (shiftedB << 10) | (shiftedG << 5) | shiftedR;
    }
  }
}

/** FadeInScreenWithWeather (field_weather.c). */
export function FadeInScreenWithWeather(): void {
  gWeather.fadeInCounter = (gWeather.fadeInCounter + 1) & 0xff;
  if (gWeather.fadeInCounter > 1) gWeather.fadeInActive = 0;

  switch (gWeather.currWeather) {
    case C.WEATHER_RAIN:
    case C.WEATHER_RAIN_THUNDERSTORM:
    case C.WEATHER_DOWNPOUR:
    case C.WEATHER_SNOW:
    case C.WEATHER_SHADE:
      if (!FadeInScreen_RainShowShade()) {
        gWeather.gammaIndex = 3;
        gWeather.palProcessingState = C.WEATHER_PAL_STATE_IDLE;
      }
      break;
    case C.WEATHER_DROUGHT:
      if (!FadeInScreen_Drought()) {
        gWeather.gammaIndex = -6;
        gWeather.palProcessingState = C.WEATHER_PAL_STATE_IDLE;
      }
      break;
    case C.WEATHER_FOG_HORIZONTAL:
      if (!FadeInScreen_FogHorizontal()) {
        gWeather.gammaIndex = 0;
        gWeather.palProcessingState = C.WEATHER_PAL_STATE_IDLE;
      }
      break;
    default:
      if (!gPaletteFade.active) {
        gWeather.gammaIndex = gWeather.gammaTargetIndex;
        gWeather.palProcessingState = C.WEATHER_PAL_STATE_IDLE;
      }
      break;
  }
}

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

/** FadeInScreen_Drought (field_weather.c). */
export function FadeInScreen_Drought(): boolean {
  if (gWeather.fadeScreenCounter === 16) return false;

  gWeather.fadeScreenCounter++;
  if (gWeather.fadeScreenCounter >= 16) {
    ApplyGammaShift(0, 32, -6);
    gWeather.fadeScreenCounter = 16;
    return false;
  }

  ApplyDroughtGammaShiftWithBlend(-6, 16 - gWeather.fadeScreenCounter, gWeather.fadeDestColor);
  return true;
}

/** FadeInScreen_FogHorizontal (field_weather.c). */
export function FadeInScreen_FogHorizontal(): boolean {
  if (gWeather.fadeScreenCounter === 16) return false;
  gWeather.fadeScreenCounter = (gWeather.fadeScreenCounter + 1) & 0xff;
  ApplyFogBlend(16 - gWeather.fadeScreenCounter, gWeather.fadeDestColor);
  return true;
}

/** DoNothing */
export function DoNothing(): void {}

/** ApplyFogBlend (field_weather.c). */
export function ApplyFogBlend(blendCoeff: number, blendColor: number): void {
  const coefficient = blendCoeff & 0xff;
  const color = blendColor & 0xffff;
  const blendR = GET_R(color);
  const blendG = GET_G(color);
  const blendB = GET_B(color);
  BlendPalette(0, 256, coefficient, color);

  for (let paletteIndex = 16; paletteIndex < 32; paletteIndex++) {
    const colorOffset = paletteIndex * 16;
    if (!LightenSpritePaletteInFog(paletteIndex)) {
      BlendPalette(colorOffset, 16, coefficient, color);
      continue;
    }

    for (let i = 0; i < 16; i++) {
      const baseColor = gPlttBufferUnfaded[colorOffset + i] ?? 0;
      let r = GET_R(baseColor);
      let g = GET_G(baseColor);
      let b = GET_B(baseColor);
      r += (((28 - r) * 3) >> 2);
      g += (((31 - g) * 3) >> 2);
      b += (((28 - b) * 3) >> 2);
      r += (((blendR - r) * coefficient) >> 4);
      g += (((blendG - g) * coefficient) >> 4);
      b += (((blendB - b) * coefficient) >> 4);
      gPlttBufferFaded[colorOffset + i] = (b << 10) | (g << 5) | r;
    }
  }
}

/** LightenSpritePaletteInFog */
export function LightenSpritePaletteInFog(paletteIndex: number): boolean {
  for (let i = 0; i < gWeather.lightenedFogSpritePalsCount; i++) {
    if (gWeather.lightenedFogSpritePals[i] === (paletteIndex & 0xff)) return true;
  }
  return false;
}

/** MarkFogSpritePalToLighten */
export function MarkFogSpritePalToLighten(paletteIndex: number): void {
  if (gWeather.lightenedFogSpritePalsCount < 6) {
    gWeather.lightenedFogSpritePals[gWeather.lightenedFogSpritePalsCount] = paletteIndex & 0xff;
    gWeather.lightenedFogSpritePalsCount++;
  }
}

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

/** UpdateSpritePaletteWithWeather (field_weather.c). */
export function UpdateSpritePaletteWithWeather(spritePaletteIndex: number): void {
  const paletteIndex = 16 + (spritePaletteIndex & 0xff);

  switch (gWeather.palProcessingState) {
    case C.WEATHER_PAL_STATE_SCREEN_FADING_IN:
      if (gWeather.fadeInActive !== 0) {
        if (gWeather.currWeather === C.WEATHER_FOG_HORIZONTAL) MarkFogSpritePalToLighten(paletteIndex);
        const colorOffset = OBJ_PLTT_ID(paletteIndex - 16);
        for (let i = 0; i < 16; i++) gPlttBufferFaded[colorOffset + i] = gWeather.fadeDestColor;
      }
      break;
    case C.WEATHER_PAL_STATE_SCREEN_FADING_OUT: {
      const colorOffset = OBJ_PLTT_ID(paletteIndex - 16);
      for (let i = 0; i < 16; i++) {
        gPlttBufferUnfaded[colorOffset + i] = gPlttBufferFaded[colorOffset + i] ?? 0;
      }
      BlendPalette(colorOffset, 16, gPaletteFade.y, gPaletteFade.blendColor);
      break;
    }
    default:
      if (gWeather.currWeather !== C.WEATHER_FOG_HORIZONTAL) {
        ApplyGammaShift(paletteIndex, 1, gWeather.gammaIndex);
      } else {
        BlendPalette(OBJ_PLTT_ID(paletteIndex - 16), 16, 12, RGB(28, 31, 28));
      }
      break;
  }
}

/** WeatherBeginGammaFade (field_weather.c). */
export function WeatherBeginGammaFade(gammaIndex: number, gammaTarget: number, stepDelay: number): void {
  if (gWeather.palProcessingState !== C.WEATHER_PAL_STATE_IDLE) return;

  gWeather.palProcessingState = C.WEATHER_PAL_STATE_CHANGING_WEATHER;
  gWeather.gammaIndex = (((gammaIndex & 0xff) << 24) >> 24);
  gWeather.gammaTargetIndex = (((gammaTarget & 0xff) << 24) >> 24);
  gWeather.gammaStepFrameCounter = 0;
  gWeather.gammaStepDelay = stepDelay & 0xff;
  WeatherShiftGammaIfPalStateIdle(gWeather.gammaIndex);
}

/** WeatherProcessingIdle */
export function WeatherProcessingIdle(): void {
  gWeather.palProcessingState = C.WEATHER_PAL_STATE_IDLE;
}

/** WeatherShiftGammaIfPalStateIdle (field_weather.c). */
export function WeatherShiftGammaIfPalStateIdle(gammaIndex: number): void {
  if (gWeather.palProcessingState !== C.WEATHER_PAL_STATE_IDLE) return;
  const signedGammaIndex = (gammaIndex << 24) >> 24;
  ApplyGammaShift(0, 32, signedGammaIndex);
  gWeather.gammaIndex = signedGammaIndex;
}

/** Weather_SetBlendCoeffs */
export function Weather_SetBlendCoeffs(eva: number, evb: number): void {
  const alpha = eva & 0xff;
  const beta = evb & 0xff;
  gWeather.currBlendEVA = alpha;
  gWeather.currBlendEVB = beta;
  gWeather.targetBlendEVA = alpha;
  gWeather.targetBlendEVB = beta;
  SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(alpha, beta));
}

/** Weather_SetTargetBlendCoeffs */
export function Weather_SetTargetBlendCoeffs(eva: number, evb: number, delay: number): void {
  gWeather.targetBlendEVA = eva & 0xff;
  gWeather.targetBlendEVB = evb & 0xff;
  gWeather.blendDelay = delay & 0xff;
  gWeather.blendFrameCounter = 0;
  gWeather.blendUpdateCounter = 0;
}

/** Weather_UpdateBlend */
export function Weather_UpdateBlend(): boolean {
  if (gWeather.currBlendEVA === gWeather.targetBlendEVA && gWeather.currBlendEVB === gWeather.targetBlendEVB) return true;

  gWeather.blendFrameCounter = (gWeather.blendFrameCounter + 1) & 0xff;
  if (gWeather.blendFrameCounter > gWeather.blendDelay) {
    gWeather.blendFrameCounter = 0;
    gWeather.blendUpdateCounter = (gWeather.blendUpdateCounter + 1) & 0xff;
    if (gWeather.blendUpdateCounter & 1) {
      if (gWeather.currBlendEVA < gWeather.targetBlendEVA) gWeather.currBlendEVA++;
      else if (gWeather.currBlendEVA > gWeather.targetBlendEVA) gWeather.currBlendEVA--;
    } else {
      if (gWeather.currBlendEVB < gWeather.targetBlendEVB) gWeather.currBlendEVB++;
      else if (gWeather.currBlendEVB > gWeather.targetBlendEVB) gWeather.currBlendEVB--;
    }
  }

  SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(gWeather.currBlendEVA, gWeather.currBlendEVB));
  return gWeather.currBlendEVA === gWeather.targetBlendEVA && gWeather.currBlendEVB === gWeather.targetBlendEVB;
}

const s16 = (value: number): number => (value << 16) >> 16;

/** SetDroughtGamma (field_weather.c). */
export function SetDroughtGamma(gammaIndex: number): void {
  const droughtGamma = (gammaIndex << 24) >> 24;
  WeatherShiftGammaIfPalStateIdle(-droughtGamma - 1);
}

/** DroughtStateInit (field_weather.c). */
export function DroughtStateInit(): void {
  gWeather.droughtBrightnessStage = 0;
  gWeather.droughtTimer = 0;
  gWeather.droughtState = 0;
  gWeather.droughtLastBrightnessStage = 0;
  sDroughtFrameDelay = 5;
}

/** DroughtStateRun (field_weather.c). */
export function DroughtStateRun(): void {
  switch (gWeather.droughtState) {
    case 0: {
      gWeather.droughtTimer = s16(gWeather.droughtTimer + 1);
      if (gWeather.droughtTimer > sDroughtFrameDelay) {
        gWeather.droughtTimer = 0;
        const stage = s16(gWeather.droughtBrightnessStage);
        gWeather.droughtBrightnessStage = s16(stage + 1);
        SetDroughtGamma(stage);
        if (gWeather.droughtBrightnessStage > 5) {
          gWeather.droughtLastBrightnessStage = gWeather.droughtBrightnessStage;
          gWeather.droughtState = 1;
          gWeather.droughtTimer = 60;
        }
      }
      break;
    }
    case 1: {
      gWeather.droughtTimer = (gWeather.droughtTimer + 3) & 0x7f;
      gWeather.droughtBrightnessStage = s16(((((gSineTable[gWeather.droughtTimer] ?? 0) - 1) >> 6) + 2));
      if (gWeather.droughtBrightnessStage !== gWeather.droughtLastBrightnessStage) {
        SetDroughtGamma(gWeather.droughtBrightnessStage);
      }
      gWeather.droughtLastBrightnessStage = gWeather.droughtBrightnessStage;
      break;
    }
    case 2: {
      gWeather.droughtTimer = s16(gWeather.droughtTimer + 1);
      if (gWeather.droughtTimer > sDroughtFrameDelay) {
        gWeather.droughtTimer = 0;
        gWeather.droughtBrightnessStage = s16(gWeather.droughtBrightnessStage - 1);
        SetDroughtGamma(gWeather.droughtBrightnessStage);
        if (gWeather.droughtBrightnessStage === 3) gWeather.droughtState = 0;
      }
      break;
    }
  }
}

/** LoadDroughtWeatherPalette (empty in FRLG; its C parameters remain unchanged). */
export function LoadDroughtWeatherPalette(gammaIndex: { value: number }, paletteOffset: { value: number }): void {
  void gammaIndex;
  void paletteOffset;
}

/** LoadDroughtWeatherPalettes (field_weather.c). */
export function LoadDroughtWeatherPalettes(): boolean {
  if (gWeather.loadDroughtPalsIndex < 32) {
    const gammaIndex = { value: gWeather.loadDroughtPalsIndex };
    const paletteOffset = { value: gWeather.loadDroughtPalsOffset };
    LoadDroughtWeatherPalette(gammaIndex, paletteOffset);
    gWeather.loadDroughtPalsIndex = (gammaIndex.value << 24) >> 24;
    gWeather.loadDroughtPalsOffset = paletteOffset.value & 0xff;
    if (gWeather.loadDroughtPalsIndex < 32) return true;
  }
  return false;
}

/** ResetDroughtWeatherPaletteLoading (field_weather.c). */
export function ResetDroughtWeatherPaletteLoading(): void {
  gWeather.loadDroughtPalsIndex = 1;
  gWeather.loadDroughtPalsOffset = 1;
}

/** SetWeatherScreenFadeOut */
export function SetWeatherScreenFadeOut(): void {
  gWeather.palProcessingState = C.WEATHER_PAL_STATE_SCREEN_FADING_OUT;
}

/** SlightlyDarkenPalsInWeather (field_weather.c). */
export function SlightlyDarkenPalsInWeather(palbuf: Uint16Array, _unused: Uint16Array, size: number): void {
  switch (gWeather.currWeather) {
    case C.WEATHER_RAIN:
    case C.WEATHER_SNOW:
    case C.WEATHER_RAIN_THUNDERSTORM:
    case C.WEATHER_SHADE:
    case C.WEATHER_DOWNPOUR:
      BlendPalettesAt(palbuf, RGB_BLACK, 3, size >>> 0);
      break;
  }
}

/** Weather-aware FADE_FROM/TO_* palette transition from field_weather.c. */
function fadeWeatherScreen(mode: number, delay: number, selectedPalettes: number): void {
  let fadeColor: number;
  let fadeOut: boolean;
  switch (mode & 0xff) {
    case C.FADE_FROM_BLACK:
      fadeColor = RGB_BLACK;
      fadeOut = false;
      break;
    case C.FADE_FROM_WHITE:
      fadeColor = RGB_WHITEALPHA;
      fadeOut = false;
      break;
    case C.FADE_TO_BLACK:
      fadeColor = RGB_BLACK;
      fadeOut = true;
      break;
    case C.FADE_TO_WHITE:
      fadeColor = RGB_WHITEALPHA;
      fadeOut = true;
      break;
    default:
      return;
  }

  const weatherUsesPaletteFade = [
    C.WEATHER_RAIN,
    C.WEATHER_RAIN_THUNDERSTORM,
    C.WEATHER_DOWNPOUR,
    C.WEATHER_SNOW,
    C.WEATHER_FOG_HORIZONTAL,
    C.WEATHER_SHADE,
    C.WEATHER_DROUGHT,
  ].includes(gWeather.currWeather);
  const paletteMask = selectedPalettes >>> 0;
  const signedDelay = (delay << 24) >> 24;

  if (fadeOut) {
    if (weatherUsesPaletteFade) gPlttBufferUnfaded.set(gPlttBufferFaded);
    BeginNormalPaletteFade(paletteMask, signedDelay, 0, 16, fadeColor);
    gWeather.palProcessingState = C.WEATHER_PAL_STATE_SCREEN_FADING_OUT;
  } else {
    gWeather.fadeDestColor = fadeColor;
    if (weatherUsesPaletteFade) gWeather.fadeScreenCounter = 0;
    else BeginNormalPaletteFade(paletteMask, signedDelay, 16, 0, fadeColor);

    gWeather.palProcessingState = C.WEATHER_PAL_STATE_SCREEN_FADING_IN;
    gWeather.fadeInActive = 1;
    gWeather.fadeInCounter = 0;
    Weather_SetBlendCoeffs(gWeather.currBlendEVA, gWeather.currBlendEVB);
    gWeather.readyForInit = true;
  }
}

/** FadeScreen (field_weather.c), selecting every BG and OBJ palette. */
export function FadeScreen(mode: number, delay: number): void {
  fadeWeatherScreen(mode, delay, PALETTES_ALL);
}

/** FadeSelectedPals (field_weather.c). Parameter order matches the C API. */
export function FadeSelectedPals(mode: number, delay: number, selectedPalettes: number): void {
  fadeWeatherScreen(mode, delay, selectedPalettes);
}

/** LoadCustomWeatherSpritePalette (field_weather.c). */
export function LoadCustomWeatherSpritePalette(palette: ArrayLike<number>): void {
  LoadPalette(palette, OBJ_PLTT_ID(gWeather.weatherPicSpritePalIndex), 32);
  UpdateSpritePaletteWithWeather(gWeather.weatherPicSpritePalIndex);
}

/** ApplyWeatherGammaShiftToPal (field_weather.c). */
export function ApplyWeatherGammaShiftToPal(paletteIndex: number): void {
  ApplyGammaShift(paletteIndex, 1, gWeather.gammaIndex);
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
        x: (random() / 0x10000) * 240,
        y: (random() / 0x10000) * 160,
        speed: 6 + (random() / 0x10000) * 4,
        len: 8 + (random() / 0x10000) * 6,
      });
    }
    // Initialize sandstorm particles
    for (let i = 0; i < 30; i++) {
      this.sandParticles.push({
        x: (random() / 0x10000) * 240,
        y: (random() / 0x10000) * 160,
        speed: 5 + (random() / 0x10000) * 5,
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
    UpdateRainCounter(weather, old);
  }

  /** DoCurrentWeather */
  doCurrent(): void {
    this.next = this.saved;
  }

  /** ResumePausedWeather (field_weather_util.c). */
  resumePausedWeather(): void {
    this.current = this.saved;
    this.next = this.saved;
  }

  /** SetWeather_Unused (field_weather_util.c). */
  setWeatherUnused(weather: number): void {
    this.setSaved(weather);
    this.current = this.saved;
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
    const isRain = this.current === C.WEATHER_RAIN || this.current === C.WEATHER_RAIN_THUNDERSTORM;
    const isSand = this.current === C.WEATHER_SANDSTORM;
    const isFog = this.current === C.WEATHER_FOG_HORIZONTAL || this.current === C.WEATHER_FOG_DIAGONAL;

    if (isRain) {
      for (const drop of this.rainDrops) {
        drop.x -= 2;
        drop.y += drop.speed;
        if (drop.y > 160) {
          drop.y = -10;
          drop.x = (random() / 0x10000) * 260;
        }
      }
    }

    if (isSand) {
      for (const p of this.sandParticles) {
        p.x -= p.speed;
        p.y += p.speed * 0.5;
        if (p.x < -10 || p.y > 170) {
          p.x = 250 + (random() / 0x10000) * 20;
          p.y = (random() / 0x10000) * 160;
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
    const isFogH = this.current === C.WEATHER_FOG_HORIZONTAL;
    const isFogD = this.current === C.WEATHER_FOG_DIAGONAL;
    const isRain = this.current === C.WEATHER_RAIN || this.current === C.WEATHER_RAIN_THUNDERSTORM;
    const isSand = this.current === C.WEATHER_SANDSTORM;
    const isAsh = this.current === C.WEATHER_VOLCANIC_ASH;

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
