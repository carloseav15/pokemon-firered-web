// Headless check for field_weather.c port (weather.ts)
// Run with: npm run check:weather

import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import * as Weather from '../../src/fr/field/weather.ts';
import { sound } from '../../src/fr/audio/sound.ts';
import { gPlttBufferFaded, gPlttBufferUnfaded } from '../../src/fr/hw/palette.ts';
import * as C from '../../src/fr/generated/constants.ts';

console.log('--- 0. Testing rain sound state and fade-out guard ---');
const playedRainSounds: number[] = [];
const originalPlaySE = sound.playSE.bind(sound);
const originalPalState = Weather.gWeather.palProcessingState;
const originalRainStrength = Weather.gWeather.rainStrength;
sound.playSE = (soundEffect: number): void => { playedRainSounds.push(soundEffect); };
try {
  for (const [soundEffect, strength] of [
    [C.SE_RAIN, 0],
    [C.SE_DOWNPOUR, 1],
    [C.SE_THUNDERSTORM, 2],
  ]) {
    Weather.gWeather.palProcessingState = C.WEATHER_PAL_STATE_IDLE;
    Weather.SetRainStrengthFromSoundEffect(soundEffect);
    assert.equal(Weather.gWeather.rainStrength, strength);
    assert.equal(playedRainSounds.at(-1), soundEffect);
  }

  const playedCount = playedRainSounds.length;
  Weather.SetRainStrengthFromSoundEffect(0xffff);
  assert.equal(Weather.gWeather.rainStrength, 2, 'unknown effects preserve the last rain strength');
  assert.equal(playedRainSounds.length, playedCount, 'unknown effects are not played');

  Weather.SetWeatherScreenFadeOut();
  Weather.SetRainStrengthFromSoundEffect(C.SE_RAIN);
  assert.equal(Weather.gWeather.rainStrength, 2, 'screen fade-out blocks rain strength changes');
  assert.equal(playedRainSounds.length, playedCount);
} finally {
  sound.playSE = originalPlaySE;
  Weather.gWeather.palProcessingState = originalPalState;
  Weather.gWeather.rainStrength = originalRainStrength;
}
console.log('✓ rain strength and fade-out guard match field_weather.c');

console.log('--- 1. Checking field_weather gamma table shape ---');
const table = Weather.BuildGammaShiftTables();
assert.equal(table.length, 19, 'Gamma shift table must have 19 rows');
assert.equal(table[0].length, 32, 'Each row must have 32 color levels');
assert.equal(table[0][16], 15, 'Normal row 0 dims level 16 by one');
assert.equal(Weather.GAMMA_TABLE_ALT[0][16], 16, 'Alternate row 0 preserves level 16');
console.log('✓ Normal and alternate gamma table vectors checked');

console.log('--- 2. Exercising ApplyGammaShift against palette buffers ---');
const paletteRangeStart = 0;
const paletteRangeEnd = 32 * 16;
const savedUnfaded = gPlttBufferUnfaded.slice(paletteRangeStart, paletteRangeEnd);
const savedFaded = gPlttBufferFaded.slice(paletteRangeStart, paletteRangeEnd);
const savedAltPalette = Weather.gWeather.altGammaSpritePalIndex;
const savedFadeCounter = Weather.gWeather.fadeScreenCounter;
const savedFadeColor = Weather.gWeather.fadeDestColor;
try {
  gPlttBufferUnfaded.fill(0x4210, paletteRangeStart, paletteRangeEnd);
  gPlttBufferFaded.fill(0, paletteRangeStart, paletteRangeEnd);
  Weather.gWeather.altGammaSpritePalIndex = 1;
  Weather.ResetPreservedPalettesInWeather();
  Weather.ApplyGammaShift(0, 32, 1);

  assert.equal(gPlttBufferFaded[0], 0x3def, 'normal BG palettes use the normal table');
  assert.equal(gPlttBufferFaded[17 * 16], 0x4210, 'alternate sprite override uses the alternate table');
  assert.equal(gPlttBufferFaded[13 * 16], 0x4210, 'GAMMA_NONE palettes copy unfaded colors');
  assert.equal(gPlttBufferFaded[16 * 16], 0x4210, 'GAMMA_ALT sprite palettes use the alternate table');

  Weather.ApplyGammaShiftWithBlend(0, 32, 1, 8, 0);
  assert.equal(gPlttBufferFaded[0], 0x1ce7, 'normal gamma is applied before half blending');
  assert.equal(gPlttBufferFaded[13 * 16], 0x2108, 'GAMMA_NONE blends from the original palette');
  assert.equal(gPlttBufferFaded[16 * 16], 0x2108, 'alternate gamma is applied before half blending');

  Weather.gWeather.fadeScreenCounter = 0;
  Weather.gWeather.fadeDestColor = 0;
  for (let frame = 0; frame < 15; frame++) {
    assert.equal(Weather.FadeInScreen_RainShowShade(), true, `rain fade continues on frame ${frame + 1}`);
  }
  assert.equal(Weather.FadeInScreen_RainShowShade(), false, 'rain fade ends after the sixteenth frame');
  assert.equal(Weather.gWeather.fadeScreenCounter, 16);
  assert.equal(gPlttBufferFaded[0], 0x35ad, 'last rain fade step applies gamma index 3');
  assert.equal(Weather.FadeInScreen_RainShowShade(), false, 'completed rain fade stays complete');

  Weather.PreservePaletteInWeather(0);
  Weather.ApplyGammaShift(0, 1, 1);
  assert.equal(gPlttBufferFaded[0], 0x4210, 'preserved palettes bypass gamma shifts');
  Weather.ResetPreservedPalettesInWeather();
  Weather.ApplyGammaShift(0, 1, 0);
  assert.equal(gPlttBufferFaded[0], 0x4210, 'gamma zero restores the unfaded palette');
  gPlttBufferFaded[0] = 0x1234;
  Weather.ApplyGammaShift(0, 1, -1);
  assert.equal(gPlttBufferFaded[0], 0x1234, 'negative gamma is a no-op in FRLG');
} finally {
  gPlttBufferUnfaded.set(savedUnfaded, paletteRangeStart);
  gPlttBufferFaded.set(savedFaded, paletteRangeStart);
  Weather.gWeather.altGammaSpritePalIndex = savedAltPalette;
  Weather.gWeather.fadeScreenCounter = savedFadeCounter;
  Weather.gWeather.fadeDestColor = savedFadeColor;
  Weather.ResetPreservedPalettesInWeather();
}
console.log('✓ ApplyGammaShift palette routing and buffer writes exercised');

console.log('--- 3. Exercising weather transition state API ---');
Weather.SetCurrentAndNextWeather(3); // Rain
assert.equal(Weather.GetCurrentWeather(), 3);

Weather.SetNextWeather(8); // Sandstorm
assert.equal(Weather.gWeather.nextWeather, 8);

Weather.StartWeather();
assert.equal(Weather.GetCurrentWeather(), 8);

const fw = new Weather.FieldWeather();
fw.setWeather(3);
assert.equal(fw.current, 0); // next scheduled, transitions in update
assert.equal(fw.next, 3);

console.log('✓ Current/next weather state updates exercised');

console.log('--- 4. Exercising selected weather particle lifecycles ---');
import * as WE from '../../src/fr/field/weatherEffects.ts';

// Clouds
WE.Clouds_InitAll();
assert.equal(WE.weatherSprites.cloudSprites.length, WE.NUM_CLOUD_SPRITES, 'Cloud sprites created');
while (WE.Clouds_Finish()) {}
assert.equal(WE.weatherSprites.cloudSprites.length, 0, 'Cloud sprites destroyed on finish');

// Rain
WE.Rain_InitAll();
assert.ok(WE.weatherSprites.rainSprites.length > 0, 'Rain sprites created');
while (WE.Rain_Finish()) {}

// Sandstorm
WE.Sandstorm_InitAll();
assert.equal(WE.weatherSprites.sandstormSprites1.length, WE.NUM_SANDSTORM_SPRITES, 'Sandstorm particles created');
assert.equal(WE.weatherSprites.sandstormSprites2.length, WE.NUM_SWIRL_SANDSTORM_SPRITES, 'Sandstorm swirl particles created');
WE.Sandstorm_Finish();
assert.equal(WE.weatherSprites.sandstormSprites1.length, 0, 'Sandstorm particles destroyed on finish');

// Ash
WE.Ash_InitAll();
assert.equal(WE.weatherSprites.ashSprites.length, WE.NUM_ASH_SPRITES, 'Ash particles created');
WE.Ash_Finish();
assert.equal(WE.weatherSprites.ashSprites.length, 0, 'Ash particles destroyed on finish');

// Fog Horizontal & Diagonal
WE.FogHorizontal_InitAll();
assert.equal(WE.weatherSprites.fogHSprites.length, WE.NUM_FOG_HORIZONTAL_SPRITES, 'Fog H particles created');
WE.FogHorizontal_Finish();

WE.FogDiagonal_InitAll();
assert.equal(WE.weatherSprites.fogDSprites.length, WE.NUM_FOG_DIAGONAL_SPRITES, 'Fog D particles created');
WE.FogDiagonal_Finish();

console.log('✓ Selected cloud, rain, sandstorm, ash and fog lifecycle paths exercised');
console.log('--- selected weather checks passed; this does not claim full module parity ---');
