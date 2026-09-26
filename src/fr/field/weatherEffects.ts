// Partial port of field_weather_effects.c (87/93 functions have bodies).
// Field weather particle sprites, animations, movement updates and controllers:
// Clouds, Sunny, Drought, Rain, Thunderstorm, Downpour, Snow, Fog (H/D), Ash, Sandstorm, Shade, Bubbles.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { random } from "../random";
import { DroughtStateInit, DroughtStateRun, gWeather, LoadDroughtWeatherPalettes, ResetDroughtWeatherPaletteLoading, SetRainStrengthFromSoundEffect, Weather_SetBlendCoeffs, Weather_SetTargetBlendCoeffs, Weather_UpdateBlend } from "./weather";
import type { Sprite } from "../gba/sprite";
import { spriteState } from "../hw/sprite";
import { gSineTable } from "../hw/trig";

export const MAX_RAIN_SPRITES = 24;
export const NUM_CLOUD_SPRITES = 3;
export const NUM_FOG_HORIZONTAL_SPRITES = 20;
export const NUM_ASH_SPRITES = 20;
export const NUM_FOG_DIAGONAL_SPRITES = 20;
export const NUM_SANDSTORM_SPRITES = 20;
export const NUM_SWIRL_SANDSTORM_SPRITES = 5;

export const GFXTAG_CLOUD = 0x1200;
export const GFXTAG_FOG_H = 0x1201;
export const GFXTAG_ASH = 0x1202;
export const GFXTAG_FOG_D = 0x1203;
export const GFXTAG_SANDSTORM = 0x1204;
export const GFXTAG_BUBBLE = 0x1205;
export const GFXTAG_RAIN = 0x1206;
export const PALTAG_WEATHER = 0x1200;

export interface WeatherSpriteRecord {
  x: number;
  y: number;
  x2: number;
  y2: number;
  invisible: boolean;
  data: number[];
  callback?: (s: WeatherSpriteRecord) => void;
  animEnded?: boolean;
  animCmdIndex?: number;
  coordOffsetEnabled?: boolean;
}

export function createWeatherSpriteRecord(x = 0, y = 0): WeatherSpriteRecord {
  return {
    x,
    y,
    x2: 0,
    y2: 0,
    invisible: false,
    data: new Array(8).fill(0),
    coordOffsetEnabled: false,
  };
}

export const weatherSprites = {
  cloudSprites: [] as WeatherSpriteRecord[],
  rainSprites: [] as WeatherSpriteRecord[],
  snowflakeSprites: [] as WeatherSpriteRecord[],
  fogHSprites: [] as WeatherSpriteRecord[],
  ashSprites: [] as WeatherSpriteRecord[],
  fogDSprites: [] as WeatherSpriteRecord[],
  sandstormSprites1: [] as WeatherSpriteRecord[],
  sandstormSprites2: [] as WeatherSpriteRecord[],
  bubbleSprites: [] as WeatherSpriteRecord[],
};

// -----------------------------------------------------------------------------
// WEATHER_SUNNY_CLOUDS
// -----------------------------------------------------------------------------

export const sCloudSpriteMapCoords = [
  { x: 0, y: 66 },
  { x: 5, y: 73 },
  { x: 10, y: 78 },
];

export function Clouds_InitVars(): void {
  gWeather.gammaTargetIndex = 0;
  gWeather.gammaStepDelay = 20;
  gWeather.weatherGfxLoaded = false;
  (gWeather as any).initStep = 0;
  if (!(gWeather as any).cloudSpritesCreated) {
    Weather_SetBlendCoeffs(0, 16);
  }
}

export function Clouds_InitAll(): void {
  Clouds_InitVars();
  while (!gWeather.weatherGfxLoaded) {
    Clouds_Main();
  }
}

export function Clouds_Main(): void {
  const w = gWeather as any;
  switch (w.initStep) {
    case 0:
      CreateCloudSprites();
      w.initStep++;
      break;
    case 1:
      Weather_SetTargetBlendCoeffs(12, 8, 1);
      w.initStep++;
      break;
    case 2:
      if (Weather_UpdateBlend()) {
        gWeather.weatherGfxLoaded = true;
        w.initStep++;
      }
      break;
  }
}

export function Clouds_Finish(): boolean {
  const w = gWeather as any;
  switch (w.finishStep || 0) {
    case 0:
      Weather_SetTargetBlendCoeffs(0, 16, 1);
      w.finishStep = 1;
      return true;
    case 1:
      if (Weather_UpdateBlend()) {
        DestroyCloudSprites();
        w.finishStep = 2;
      }
      return true;
  }
  return false;
}

export function CreateCloudSprites(): void {
  const w = gWeather as any;
  if (w.cloudSpritesCreated) return;
  weatherSprites.cloudSprites = [];
  for (let i = 0; i < NUM_CLOUD_SPRITES; i++) {
    const s = createWeatherSpriteRecord(sCloudSpriteMapCoords[i].x * 16, sCloudSpriteMapCoords[i].y * 16);
    s.callback = UpdateCloudSprite;
    s.coordOffsetEnabled = true;
    weatherSprites.cloudSprites.push(s);
  }
  w.cloudSpritesCreated = true;
}

export function DestroyCloudSprites(): void {
  const w = gWeather as any;
  if (!w.cloudSpritesCreated) return;
  weatherSprites.cloudSprites = [];
  w.cloudSpritesCreated = false;
}

export function UpdateCloudSprite(sprite: WeatherSpriteRecord): void {
  sprite.data[0] = (sprite.data[0] + 1) & 1;
  if (sprite.data[0]) sprite.x--;
}

// -----------------------------------------------------------------------------
// WEATHER_SUNNY
// -----------------------------------------------------------------------------

export function Sunny_InitVars(): void {
  gWeather.gammaTargetIndex = 0;
  gWeather.gammaStepDelay = 20;
}

export function Sunny_InitAll(): void {
  Sunny_InitVars();
}

export function Sunny_Main(): void {}

export function Sunny_Finish(): boolean {
  return false;
}

// -----------------------------------------------------------------------------
// WEATHER_DROUGHT
// -----------------------------------------------------------------------------

export function Drought_InitVars(): void {
  gWeather.initStep = 0;
  gWeather.weatherGfxLoaded = false;
  gWeather.gammaTargetIndex = 0;
  gWeather.gammaStepDelay = 0;
}

export function Drought_InitAll(): void {
  Drought_InitVars();
  // In FRLG, LoadDroughtWeatherPalette is a no-op, so the C init loop stays in
  // step 2. Preserve that behavior; do not invoke this blocking path headlessly.
  while (!gWeather.weatherGfxLoaded) {
    Drought_Main();
  }
}

export function Drought_Main(): void {
  switch (gWeather.initStep) {
    case 0:
      if (gWeather.palProcessingState !== C.WEATHER_PAL_STATE_CHANGING_WEATHER) gWeather.initStep++;
      break;
    case 1:
      ResetDroughtWeatherPaletteLoading();
      gWeather.initStep++;
      break;
    case 2:
      if (!LoadDroughtWeatherPalettes()) gWeather.initStep++;
      break;
    case 3:
      DroughtStateInit();
      gWeather.initStep++;
      break;
    case 4:
      DroughtStateRun();
      if (gWeather.droughtBrightnessStage === 6) {
        gWeather.weatherGfxLoaded = true;
        gWeather.initStep++;
      }
      break;
    default:
      DroughtStateRun();
      break;
  }
}

export function Drought_Finish(): boolean {
  return false;
}

export function StartDroughtWeatherBlend(): void {
  Weather_SetBlendCoeffs(0, 16);
  Weather_SetTargetBlendCoeffs(10, 6, 2);
}

export function UpdateDroughtBlend(taskId: number): void {
  Weather_UpdateBlend();
}

// -----------------------------------------------------------------------------
// WEATHER_RAIN / THUNDERSTORM / DOWNPOUR
// -----------------------------------------------------------------------------

export const sRainSpriteCoords = [
  { x: 0, y: 0 }, { x: 0, y: 160 }, { x: 0, y: 64 }, { x: 144, y: 224 },
  { x: 144, y: 128 }, { x: 32, y: 32 }, { x: 32, y: 192 }, { x: 32, y: 96 },
  { x: 72, y: 128 }, { x: 72, y: 32 }, { x: 72, y: 192 }, { x: 216, y: 96 },
  { x: 216, y: 0 }, { x: 104, y: 160 }, { x: 104, y: 64 }, { x: 104, y: 224 },
  { x: 144, y: 0 }, { x: 144, y: 160 }, { x: 144, y: 64 }, { x: 32, y: 224 },
  { x: 32, y: 128 }, { x: 72, y: 32 }, { x: 72, y: 192 }, { x: 48, y: 96 },
];

export const sRainSpriteMovement = [
  [-0x68, 0xd0],
  [-0xa0, 0x140],
];

export const sRainSpriteFallingDurations = [
  [18, 7],
  [12, 10],
];

export function Rain_InitVars(): void {
  const w = gWeather as any;
  w.initStep = 0;
  gWeather.weatherGfxLoaded = false;
  w.rainSpriteVisibleCounter = 0;
  w.rainSpriteVisibleDelay = 8;
  w.isDownpour = false;
  w.targetRainSpriteCount = 10;
  gWeather.gammaTargetIndex = 3;
  gWeather.gammaStepDelay = 20;
  SetRainStrengthFromSoundEffect(C.SE_RAIN);
}

export function Rain_InitAll(): void {
  Rain_InitVars();
  while (!gWeather.weatherGfxLoaded) {
    Rain_Main();
  }
}

export function Rain_Main(): void {
  const w = gWeather as any;
  switch (w.initStep || 0) {
    case 0:
      LoadRainSpriteSheet();
      w.initStep++;
      break;
    case 1:
      if (!CreateRainSprite()) w.initStep++;
      break;
    case 2:
      if (!UpdateVisibleRainSprites()) {
        gWeather.weatherGfxLoaded = true;
        w.initStep++;
      }
      break;
  }
}

export function Rain_Finish(): boolean {
  const w = gWeather as any;
  switch (w.finishStep || 0) {
    case 0:
      if (w.rainSpriteCount > 0) {
        w.rainSpriteCount--;
        return true;
      }
      DestroyRainSprites();
      w.finishStep = 1;
      return true;
    case 1:
      return false;
  }
  return false;
}

export function LoadRainSpriteSheet(): void {}

export function CreateRainSprite(): boolean {
  const w = gWeather as any;
  if (!w.rainSpriteCount) w.rainSpriteCount = 0;
  if (w.rainSpriteCount >= (w.targetRainSpriteCount || 10)) return false;
  const idx = w.rainSpriteCount;
  const coord = sRainSpriteCoords[idx % sRainSpriteCoords.length];
  const s = createWeatherSpriteRecord(coord.x, coord.y);
  InitRainSpriteMovement(s, 0);
  s.callback = WaitRainSprite;
  weatherSprites.rainSprites.push(s);
  w.rainSpriteCount++;
  return w.rainSpriteCount < (w.targetRainSpriteCount || 10);
}

export function InitRainSpriteMovement(sprite: WeatherSpriteRecord, val: number): void {
  const isDownpour = !!(gWeather as any).isDownpour;
  const speed = sRainSpriteMovement[isDownpour ? 1 : 0];
  sprite.data[0] = speed[0];
  sprite.data[1] = speed[1];
  sprite.data[2] = sRainSpriteFallingDurations[isDownpour ? 1 : 0][0];
  sprite.data[3] = val;
}

export function WaitRainSprite(sprite: WeatherSpriteRecord): void {
  if (sprite.data[3] <= 0) {
    StartRainSpriteFall(sprite);
  } else {
    sprite.data[3]--;
  }
}

export function StartRainSpriteFall(sprite: WeatherSpriteRecord): void {
  sprite.invisible = false;
  sprite.callback = UpdateRainSprite;
}

export function UpdateRainSprite(sprite: WeatherSpriteRecord): void {
  sprite.x += sprite.data[0] >> 4;
  sprite.y += sprite.data[1] >> 4;
  if (--sprite.data[2] <= 0) {
    // Rain splash then respawn
    sprite.invisible = true;
    const isDownpour = !!(gWeather as any).isDownpour;
    InitRainSpriteMovement(sprite, random() % sRainSpriteFallingDurations[isDownpour ? 1 : 0][1]);
    sprite.callback = WaitRainSprite;
  }
}

export function UpdateVisibleRainSprites(): boolean {
  const w = gWeather as any;
  if (++w.rainSpriteVisibleCounter >= w.rainSpriteVisibleDelay) {
    w.rainSpriteVisibleCounter = 0;
    if (w.curRainSpriteIndex < w.rainSpriteCount) {
      const s = weatherSprites.rainSprites[w.curRainSpriteIndex++];
      if (s) StartRainSpriteFall(s);
      return true;
    }
    return false;
  }
  return true;
}

export function DestroyRainSprites(): void {
  const w = gWeather as any;
  weatherSprites.rainSprites = [];
  w.rainSpriteCount = 0;
}

// -----------------------------------------------------------------------------
// WEATHER_SNOW
// -----------------------------------------------------------------------------

export function Snow_InitVars(): void {
  const w = gWeather as any;
  w.initStep = 0;
  gWeather.weatherGfxLoaded = false;
  gWeather.gammaTargetIndex = 3;
  gWeather.gammaStepDelay = 20;
  w.targetSnowflakeSpriteCount = 16;
  w.snowflakeSpriteCount = 0;
}

export function Snow_InitAll(): void {
  Snow_InitVars();
  while (!gWeather.weatherGfxLoaded) {
    Snow_Main();
  }
}

export function Snow_Main(): void {
  const w = gWeather as any;
  switch (w.initStep || 0) {
    case 0:
      if (!CreateSnowflakeSprite()) w.initStep++;
      break;
    case 1:
      if (!UpdateVisibleSnowflakeSprites()) {
        gWeather.weatherGfxLoaded = true;
        w.initStep++;
      }
      break;
  }
}

export function Snow_Finish(): boolean {
  return DestroySnowflakeSprite();
}

export function CreateSnowflakeSprite(): boolean {
  const w = gWeather as any;
  if (w.snowflakeSpriteCount >= (w.targetSnowflakeSpriteCount || 16)) return false;
  const s = createWeatherSpriteRecord(random() % 240, -(random() % 20));
  InitSnowflakeSpriteMovement(s);
  s.callback = WaitSnowflakeSprite;
  weatherSprites.snowflakeSprites.push(s);
  w.snowflakeSpriteCount++;
  return w.snowflakeSpriteCount < w.targetSnowflakeSpriteCount;
}

export function DestroySnowflakeSprite(): boolean {
  const w = gWeather as any;
  weatherSprites.snowflakeSprites = [];
  w.snowflakeSpriteCount = 0;
  return false;
}

export function InitSnowflakeSpriteMovement(sprite: WeatherSpriteRecord): void {
  sprite.data[0] = 1; // fall speed Y
  sprite.data[1] = 0; // sway counter
  sprite.data[2] = 20 + (random() % 30);
}

export function WaitSnowflakeSprite(sprite: WeatherSpriteRecord): void {
  sprite.callback = UpdateSnowflakeSprite;
}

export function UpdateSnowflakeSprite(sprite: WeatherSpriteRecord): void {
  sprite.y += sprite.data[0];
  sprite.data[1] = (sprite.data[1] + 1) & 0x1f;
  sprite.x += (sprite.data[1] & 8) ? 1 : -1;
  if (sprite.y > 170) {
    sprite.y = -10;
    sprite.x = random() % 240;
  }
}

export function UpdateVisibleSnowflakeSprites(): boolean {
  return false;
}

// -----------------------------------------------------------------------------
// WEATHER_THUNDERSTORM / DOWNPOUR
// -----------------------------------------------------------------------------

export function Thunderstorm_InitVars(): void {
  Rain_InitVars();
  const w = gWeather as any;
  w.targetRainSpriteCount = 16;
  w.thunderDelay = 40;
  w.thunderCounter = 0;
}

export function Thunderstorm_InitAll(): void {
  Thunderstorm_InitVars();
  while (!gWeather.weatherGfxLoaded) {
    Thunderstorm_Main();
  }
}

export function Downpour_InitVars(): void {
  Thunderstorm_InitVars();
  (gWeather as any).isDownpour = true;
}

export function Downpour_InitAll(): void {
  Downpour_InitVars();
  while (!gWeather.weatherGfxLoaded) {
    Thunderstorm_Main();
  }
}

export function Thunderstorm_Main(): void {
  Rain_Main();
  UpdateThunderSound();
}

export function Thunderstorm_Finish(): boolean {
  return Rain_Finish();
}

export function SetThunderCounter(max: number): void {
  (gWeather as any).thunderCounter = random() % max;
}

export function UpdateThunderSound(): void {
  const w = gWeather as any;
  if (!w.thunderCounter) SetThunderCounter(200);
  if (--w.thunderCounter === 0) {
    sound.playSE(C.SE_THUNDER);
    SetThunderCounter(400);
  }
}

// -----------------------------------------------------------------------------
// WEATHER_FOG_HORIZONTAL
// -----------------------------------------------------------------------------

export function FogHorizontal_InitVars(): void {
  const w = gWeather as any;
  w.initStep = 0;
  gWeather.weatherGfxLoaded = false;
  gWeather.gammaTargetIndex = 0;
  gWeather.gammaStepDelay = 20;
}

export function FogHorizontal_InitAll(): void {
  FogHorizontal_InitVars();
  while (!gWeather.weatherGfxLoaded) {
    FogHorizontal_Main();
  }
}

export function FogHorizontal_Main(): void {
  const w = gWeather as any;
  switch (w.initStep || 0) {
    case 0:
      CreateFogHorizontalSprites();
      w.initStep++;
      break;
    case 1:
      gWeather.weatherGfxLoaded = true;
      w.initStep++;
      break;
  }
}

export function FogHorizontal_Finish(): boolean {
  DestroyFogHorizontalSprites();
  return false;
}

export function CreateFogHorizontalSprites(): void {
  const w = gWeather as any;
  if (w.fogHSpritesCreated) return;
  weatherSprites.fogHSprites = [];
  for (let i = 0; i < NUM_FOG_HORIZONTAL_SPRITES; i++) {
    const s = createWeatherSpriteRecord((i * 48) % 240, (i * 32) % 160);
    s.callback = FogHorizontalSpriteCallback;
    weatherSprites.fogHSprites.push(s);
  }
  w.fogHSpritesCreated = true;
}

export function DestroyFogHorizontalSprites(): void {
  const w = gWeather as any;
  weatherSprites.fogHSprites = [];
  w.fogHSpritesCreated = false;
}

export function FogHorizontalSpriteCallback(sprite: WeatherSpriteRecord): void {
  sprite.x += 1;
  if (sprite.x > 250) sprite.x = -30;
}

// -----------------------------------------------------------------------------
// WEATHER_VOLCANIC_ASH
// -----------------------------------------------------------------------------

export function Ash_InitVars(): void {
  const w = gWeather as any;
  w.initStep = 0;
  gWeather.weatherGfxLoaded = false;
  gWeather.gammaTargetIndex = 0;
  gWeather.gammaStepDelay = 20;
}

export function Ash_InitAll(): void {
  Ash_InitVars();
  while (!gWeather.weatherGfxLoaded) {
    Ash_Main();
  }
}

export function Ash_Main(): void {
  const w = gWeather as any;
  switch (w.initStep || 0) {
    case 0:
      LoadAshSpriteSheet();
      w.initStep++;
      break;
    case 1:
      CreateAshSprites();
      w.initStep++;
      break;
    case 2:
      gWeather.weatherGfxLoaded = true;
      w.initStep++;
      break;
  }
}

export function Ash_Finish(): boolean {
  DestroyAshSprites();
  return false;
}

export function LoadAshSpriteSheet(): void {}

export function CreateAshSprites(): void {
  const w = gWeather as any;
  if (w.ashSpritesCreated) return;
  weatherSprites.ashSprites = [];
  for (let i = 0; i < NUM_ASH_SPRITES; i++) {
    const s = createWeatherSpriteRecord(random() % 240, random() % 160);
    s.callback = UpdateAshSprite;
    weatherSprites.ashSprites.push(s);
  }
  w.ashSpritesCreated = true;
}

export function DestroyAshSprites(): void {
  const w = gWeather as any;
  weatherSprites.ashSprites = [];
  w.ashSpritesCreated = false;
}

export function UpdateAshSprite(sprite: WeatherSpriteRecord): void {
  sprite.y += 1;
  sprite.x += (sprite.data[0]++ & 4) ? 1 : -1;
  if (sprite.y > 170) {
    sprite.y = -10;
    sprite.x = random() % 240;
  }
}

// -----------------------------------------------------------------------------
// WEATHER_FOG_DIAGONAL
// -----------------------------------------------------------------------------

export function FogDiagonal_InitVars(): void {
  gWeather.initStep = 0;
  gWeather.weatherGfxLoaded = false;
  gWeather.gammaTargetIndex = 0;
  gWeather.gammaStepDelay = 20;
  gWeather.fogHScrollCounter = 0;
  gWeather.fogHScrollOffset = 1;
  if (!gWeather.fogDSpritesCreated) {
    gWeather.fogDScrollXCounter = 0;
    gWeather.fogDScrollYCounter = 0;
    gWeather.fogDXOffset = 0;
    gWeather.fogDYOffset = 0;
    gWeather.fogDBaseSpritesX = 0;
    gWeather.fogDPosY = 0;
    Weather_SetBlendCoeffs(0, 16);
  }
}

export function FogDiagonal_InitAll(): void {
  FogDiagonal_InitVars();
  while (!gWeather.weatherGfxLoaded) {
    FogDiagonal_Main();
  }
}

export function FogDiagonal_Main(): void {
  UpdateFogDiagonalMovement();
  switch (gWeather.initStep) {
    case 0:
      CreateFogDiagonalSprites();
      gWeather.initStep++;
      break;
    case 1:
      Weather_SetTargetBlendCoeffs(12, 8, 8);
      gWeather.initStep++;
      break;
    case 2:
      if (Weather_UpdateBlend()) {
        gWeather.weatherGfxLoaded = true;
        gWeather.initStep++;
      }
      break;
  }
}

export function FogDiagonal_Finish(): boolean {
  UpdateFogDiagonalMovement();
  switch (gWeather.finishStep) {
    case 0:
      Weather_SetTargetBlendCoeffs(0, 16, 1);
      gWeather.finishStep++;
      break;
    case 1:
      if (Weather_UpdateBlend()) gWeather.finishStep++;
      break;
    case 2:
      DestroyFogDiagonalSprites();
      gWeather.finishStep++;
      break;
    default:
      return false;
  }
  return true;
}

export function UpdateFogDiagonalMovement(): void {
  gWeather.fogDScrollXCounter = (gWeather.fogDScrollXCounter + 1) & 0xffff;
  if (gWeather.fogDScrollXCounter > 2) {
    gWeather.fogDXOffset = (gWeather.fogDXOffset + 1) & 0xffff;
    gWeather.fogDScrollXCounter = 0;
  }
  gWeather.fogDScrollYCounter = (gWeather.fogDScrollYCounter + 1) & 0xffff;
  if (gWeather.fogDScrollYCounter > 4) {
    gWeather.fogDYOffset = (gWeather.fogDYOffset + 1) & 0xffff;
    gWeather.fogDScrollYCounter = 0;
  }
  gWeather.fogDBaseSpritesX = (spriteState.gSpriteCoordOffsetX - gWeather.fogDXOffset) & 0xff;
  gWeather.fogDPosY = (spriteState.gSpriteCoordOffsetY + gWeather.fogDYOffset) & 0xffff;
}

export function CreateFogDiagonalSprites(): void {
  const w = gWeather as any;
  if (w.fogDSpritesCreated) return;
  weatherSprites.fogDSprites = [];
  for (let i = 0; i < NUM_FOG_DIAGONAL_SPRITES; i++) {
    const s = createWeatherSpriteRecord((i * 40) % 240, (i * 30) % 160);
    s.callback = UpdateFogDiagonalSprite;
    weatherSprites.fogDSprites.push(s);
  }
  w.fogDSpritesCreated = true;
}

export function DestroyFogDiagonalSprites(): void {
  const w = gWeather as any;
  weatherSprites.fogDSprites = [];
  w.fogDSpritesCreated = false;
}

export function UpdateFogDiagonalSprite(sprite: WeatherSpriteRecord): void {
  sprite.x += 1;
  sprite.y += 1;
  if (sprite.x > 250) sprite.x = -30;
  if (sprite.y > 170) sprite.y = -30;
}

// -----------------------------------------------------------------------------
// WEATHER_SANDSTORM
// -----------------------------------------------------------------------------

export function Sandstorm_InitVars(): void {
  gWeather.initStep = 0;
  gWeather.weatherGfxLoaded = false;
  gWeather.gammaTargetIndex = 0;
  gWeather.gammaStepDelay = 20;
  if (!gWeather.sandstormSpritesCreated) {
    gWeather.sandstormXOffset = 0;
    gWeather.sandstormYOffset = 0;
    gWeather.sandstormWaveIndex = 8;
    gWeather.sandstormWaveCounter = 0;
    Weather_SetBlendCoeffs(0, 16);
  }
}

export function Sandstorm_InitAll(): void {
  Sandstorm_InitVars();
  while (!gWeather.weatherGfxLoaded) {
    Sandstorm_Main();
  }
}

export function Sandstorm_Main(): void {
  UpdateSandstormMovement();
  UpdateSandstormWaveIndex();
  if (gWeather.sandstormWaveIndex >= 0x80 - 0x20) gWeather.sandstormWaveIndex = 0x20;
  switch (gWeather.initStep) {
    case 0:
      CreateSandstormSprites();
      CreateSwirlSandstormSprites();
      gWeather.initStep++;
      break;
    case 1:
      Weather_SetTargetBlendCoeffs(16, 0, 0);
      gWeather.initStep++;
      break;
    case 2:
      if (Weather_UpdateBlend()) {
        gWeather.weatherGfxLoaded = true;
        gWeather.initStep++;
      }
      break;
  }
}

export function Sandstorm_Finish(): boolean {
  UpdateSandstormMovement();
  UpdateSandstormWaveIndex();
  switch (gWeather.finishStep) {
    case 0:
      Weather_SetTargetBlendCoeffs(0, 16, 0);
      gWeather.finishStep++;
      break;
    case 1:
      if (Weather_UpdateBlend()) gWeather.finishStep++;
      break;
    case 2:
      DestroySandstormSprites();
      gWeather.finishStep++;
      break;
    default:
      return false;
  }
  return true;
}

export function UpdateSandstormWaveIndex(): void {
  const oldCounter = gWeather.sandstormWaveCounter;
  gWeather.sandstormWaveCounter = (oldCounter + 1) & 0xffff;
  if (oldCounter > 4) {
    gWeather.sandstormWaveIndex = (gWeather.sandstormWaveIndex + 1) & 0xffff;
    gWeather.sandstormWaveCounter = 0;
  }
}

export function UpdateSandstormMovement(): void {
  const sine = gSineTable[gWeather.sandstormWaveIndex] ?? 0;
  gWeather.sandstormXOffset = (gWeather.sandstormXOffset - sine * 4) >>> 0;
  gWeather.sandstormYOffset = (gWeather.sandstormYOffset - sine) >>> 0;
  gWeather.sandstormBaseSpritesX = (spriteState.gSpriteCoordOffsetX + (gWeather.sandstormXOffset >>> 8)) & 0xff;
  gWeather.sandstormPosY = (spriteState.gSpriteCoordOffsetY + (gWeather.sandstormYOffset >>> 8)) & 0xffff;
}

export function CreateSandstormSprites(): void {
  const w = gWeather as any;
  if (w.sandstormSpritesCreated) return;
  weatherSprites.sandstormSprites1 = [];
  for (let i = 0; i < NUM_SANDSTORM_SPRITES; i++) {
    const s = createWeatherSpriteRecord(random() % 240, random() % 160);
    s.callback = UpdateSandstormSprite;
    weatherSprites.sandstormSprites1.push(s);
  }
  w.sandstormSpritesCreated = true;
}

export function CreateSwirlSandstormSprites(): void {
  const w = gWeather as any;
  if (w.sandstormSwirlSpritesCreated) return;
  weatherSprites.sandstormSprites2 = [];
  for (let i = 0; i < NUM_SWIRL_SANDSTORM_SPRITES; i++) {
    const s = createWeatherSpriteRecord(random() % 240, random() % 160);
    s.callback = UpdateSandstormSwirlSprite;
    weatherSprites.sandstormSprites2.push(s);
  }
  w.sandstormSwirlSpritesCreated = true;
}

export function DestroySandstormSprites(): void {
  const w = gWeather as any;
  weatherSprites.sandstormSprites1 = [];
  weatherSprites.sandstormSprites2 = [];
  w.sandstormSpritesCreated = false;
  w.sandstormSwirlSpritesCreated = false;
}

export function UpdateSandstormSprite(sprite: WeatherSpriteRecord): void {
  sprite.x -= 3;
  sprite.y += 1;
  if (sprite.x < -20) sprite.x = 250;
  if (sprite.y > 170) sprite.y = -10;
}

export function WaitSandSwirlSpriteEntrance(sprite: WeatherSpriteRecord): void {
  sprite.callback = UpdateSandstormSwirlSprite;
}

export function UpdateSandstormSwirlSprite(sprite: WeatherSpriteRecord): void {
  sprite.x -= 4;
  sprite.y += 2;
  if (sprite.x < -20) sprite.x = 250;
  if (sprite.y > 170) sprite.y = -10;
}

// -----------------------------------------------------------------------------
// WEATHER_SHADE
// -----------------------------------------------------------------------------

export function Shade_InitVars(): void {
  gWeather.gammaTargetIndex = 3;
  gWeather.gammaStepDelay = 20;
}

export function Shade_InitAll(): void {
  Shade_InitVars();
}

export function Shade_Main(): void {}

export function Shade_Finish(): boolean {
  return false;
}

// -----------------------------------------------------------------------------
// WEATHER_BUBBLES
// -----------------------------------------------------------------------------

export function Bubbles_InitVars(): void {
  const w = gWeather as any;
  w.initStep = 0;
  gWeather.weatherGfxLoaded = false;
  gWeather.gammaTargetIndex = 0;
  gWeather.gammaStepDelay = 20;
}

export function Bubbles_InitAll(): void {
  Bubbles_InitVars();
  while (!gWeather.weatherGfxLoaded) {
    Bubbles_Main();
  }
}

export function Bubbles_Main(): void {
  const w = gWeather as any;
  switch (w.initStep || 0) {
    case 0:
      CreateBubbleSprite(0);
      w.initStep++;
      break;
    case 1:
      gWeather.weatherGfxLoaded = true;
      w.initStep++;
      break;
  }
}

export function Bubbles_Finish(): boolean {
  DestroyBubbleSprites();
  return false;
}

export function CreateBubbleSprite(coordsIndex: number): void {
  const s = createWeatherSpriteRecord(random() % 240, 160);
  s.callback = UpdateBubbleSprite;
  weatherSprites.bubbleSprites.push(s);
}

export function DestroyBubbleSprites(): void {
  weatherSprites.bubbleSprites = [];
}

export function UpdateBubbleSprite(sprite: WeatherSpriteRecord): void {
  sprite.y -= 1;
  sprite.x += (sprite.data[0]++ & 4) ? 1 : -1;
  if (sprite.y < -10) sprite.y = 170;
}
