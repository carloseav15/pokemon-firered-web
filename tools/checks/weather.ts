// Headless check for field_weather.c port (weather.ts)
// Run with: npm run check:weather

import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerCData } from '../../src/fr/hw/assets.ts';
import * as Trig from '../../src/fr/hw/trig.ts';
import * as Weather from '../../src/fr/field/weather.ts';
import { sound } from '../../src/fr/audio/sound.ts';
import { gPaletteFade, gPlttBufferFaded, gPlttBufferUnfaded, OBJ_PLTT_ID } from '../../src/fr/hw/palette.ts';
import { ppu } from '../../src/fr/hw/ppu.ts';
import * as C from '../../src/fr/generated/constants.ts';

const root = process.cwd() + '/public/fr/';
const trigCData = JSON.parse(readFileSync(root + 'cdata/trig.json', 'utf8'));
registerCData('trig', trigCData.defs);
Trig.initTrig();

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

console.log('--- 1a. Checking weather initialization and blend timing against field_weather.c ---');
const savedBlendState = {
  currBlendEVA: Weather.gWeather.currBlendEVA,
  currBlendEVB: Weather.gWeather.currBlendEVB,
  targetBlendEVA: Weather.gWeather.targetBlendEVA,
  targetBlendEVB: Weather.gWeather.targetBlendEVB,
  blendDelay: Weather.gWeather.blendDelay,
  blendFrameCounter: Weather.gWeather.blendFrameCounter,
  blendUpdateCounter: Weather.gWeather.blendUpdateCounter,
  gammaTargetIndex: Weather.gWeather.gammaTargetIndex,
  gammaStepDelay: Weather.gWeather.gammaStepDelay,
  readyForInit: Weather.gWeather.readyForInit,
  weatherTaskFunc: Weather.gWeather.weatherTaskFunc,
};
try {
  Weather.gWeather.currWeather = C.WEATHER_NONE;
  Weather.gWeather.gammaTargetIndex = 3;
  Weather.gWeather.gammaStepDelay = 8;
  Weather.gWeather.readyForInit = false;
  Weather.gWeather.weatherTaskFunc = 'init';
  Weather.Task_WeatherInit();
  assert.equal(Weather.gWeather.gammaTargetIndex, 3, 'Task_WeatherInit waits until readyForInit');
  Weather.gWeather.readyForInit = true;
  Weather.Task_WeatherInit();
  assert.equal(Weather.gWeather.gammaTargetIndex, 0, 'None_Init clears the gamma target');
  assert.equal(Weather.gWeather.gammaStepDelay, 0, 'None_Init clears the gamma delay');
  assert.equal(Weather.gWeather.weatherTaskFunc, 'main', 'Task_WeatherInit advances the task callback');
  assert.equal(Weather.None_Finish(), false, 'None_Finish tells the dispatcher that no cleanup remains');

  Weather.Weather_SetBlendCoeffs(0, 16);
  Weather.Weather_SetTargetBlendCoeffs(2, 14, 1);
  assert.equal(Weather.Weather_UpdateBlend(), false);
  assert.equal(Weather.Weather_UpdateBlend(), false);
  assert.deepEqual([Weather.gWeather.currBlendEVA, Weather.gWeather.currBlendEVB], [1, 16], 'first coefficient changes on the first eligible frame');
  Weather.Weather_UpdateBlend();
  assert.equal(Weather.Weather_UpdateBlend(), false);
  assert.deepEqual([Weather.gWeather.currBlendEVA, Weather.gWeather.currBlendEVB], [1, 15], 'second coefficient changes on the next eligible frame');
  Weather.Weather_UpdateBlend();
  Weather.Weather_UpdateBlend();
  Weather.Weather_UpdateBlend();
  assert.equal(Weather.Weather_UpdateBlend(), true, 'blend finishes only after both coefficients reach their targets');
  assert.deepEqual([Weather.gWeather.currBlendEVA, Weather.gWeather.currBlendEVB], [2, 14]);
} finally {
  Object.assign(Weather.gWeather, savedBlendState);
}
console.log('✓ Weather init readiness and alternating blend coefficients match field_weather.c');

console.log('--- 2. Applying gamma and running weather fade state paths ---');
const paletteRangeStart = 0;
const paletteRangeEnd = 32 * 16;
const savedUnfaded = gPlttBufferUnfaded.slice(paletteRangeStart, paletteRangeEnd);
const savedFaded = gPlttBufferFaded.slice(paletteRangeStart, paletteRangeEnd);
const savedAltPalette = Weather.gWeather.altGammaSpritePalIndex;
const savedFadeCounter = Weather.gWeather.fadeScreenCounter;
const savedFadeColor = Weather.gWeather.fadeDestColor;
const savedWeatherFrameState = {
  palProcessingState: Weather.gWeather.palProcessingState,
  currWeather: Weather.gWeather.currWeather,
  nextWeather: Weather.gWeather.nextWeather,
  gammaIndex: Weather.gWeather.gammaIndex,
  gammaTargetIndex: Weather.gWeather.gammaTargetIndex,
  gammaStepFrameCounter: Weather.gWeather.gammaStepFrameCounter,
  gammaStepDelay: Weather.gWeather.gammaStepDelay,
  fadeInCounter: Weather.gWeather.fadeInCounter,
  fadeInActive: Weather.gWeather.fadeInActive,
  readyForInit: Weather.gWeather.readyForInit,
  currBlendEVA: Weather.gWeather.currBlendEVA,
  currBlendEVB: Weather.gWeather.currBlendEVB,
  lightenedFogSpritePals: [...Weather.gWeather.lightenedFogSpritePals],
  lightenedFogSpritePalsCount: Weather.gWeather.lightenedFogSpritePalsCount,
  droughtBrightnessStage: Weather.gWeather.droughtBrightnessStage,
  droughtLastBrightnessStage: Weather.gWeather.droughtLastBrightnessStage,
  droughtTimer: Weather.gWeather.droughtTimer,
  droughtState: Weather.gWeather.droughtState,
  initStep: Weather.gWeather.initStep,
  loadDroughtPalsIndex: Weather.gWeather.loadDroughtPalsIndex,
  loadDroughtPalsOffset: Weather.gWeather.loadDroughtPalsOffset,
  weatherPicSpritePalIndex: Weather.gWeather.weatherPicSpritePalIndex,
};
const savedPaletteFadeState = { ...gPaletteFade };
const savedPpuPalette = ppu.pltt.slice();
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

  Weather.gWeather.fadeScreenCounter = 0;
  assert.equal(Weather.FadeInScreen_Drought(), true, 'drought fade starts by blending palette colors');
  assert.equal(gPlttBufferFaded[0], 0x0421, 'drought blends the original color toward black');
  for (let frame = 1; frame < 15; frame++) assert.equal(Weather.FadeInScreen_Drought(), true);
  assert.equal(Weather.FadeInScreen_Drought(), false, 'drought fade ends after the sixteenth frame');
  assert.equal(Weather.gWeather.fadeScreenCounter, 16);
  assert.equal(gPlttBufferFaded[0], 0x3def, 'FRLG negative-gamma completion leaves the preceding blended palette');

  // PREPARED by hand: this headless check initializes the weather state and palette buffers directly.
  Weather.gWeather.palProcessingState = C.WEATHER_PAL_STATE_IDLE;
  Weather.WeatherBeginGammaFade(0, 2, 1);
  assert.equal(Weather.gWeather.palProcessingState, C.WEATHER_PAL_STATE_CHANGING_WEATHER);
  Weather.Task_WeatherMain();
  assert.equal(Weather.gWeather.gammaIndex, 1);
  assert.equal(gPlttBufferFaded[0], 0x3def, 'Task_WeatherMain applies each changing gamma step');
  Weather.Task_WeatherMain();
  assert.equal(Weather.gWeather.gammaIndex, 2);
  Weather.Task_WeatherMain();
  assert.equal(Weather.gWeather.palProcessingState, C.WEATHER_PAL_STATE_IDLE, 'gamma state returns to idle on the following frame');

  Weather.gWeather.currWeather = C.WEATHER_RAIN;
  Weather.gWeather.nextWeather = C.WEATHER_RAIN;
  Weather.gWeather.fadeScreenCounter = 0;
  Weather.gWeather.fadeInCounter = 0;
  Weather.gWeather.fadeInActive = 1;
  Weather.gWeather.palProcessingState = C.WEATHER_PAL_STATE_SCREEN_FADING_IN;
  for (let frame = 0; frame < 16; frame++) Weather.Task_WeatherMain();
  assert.equal(Weather.gWeather.gammaIndex, 3, 'weather dispatcher selects the rain/shade path');
  assert.equal(Weather.gWeather.palProcessingState, C.WEATHER_PAL_STATE_IDLE);
  assert.equal(Weather.gWeather.fadeInActive, 0, 'fade-in active flag clears after its second frame');

  Weather.gWeather.currWeather = C.WEATHER_FOG_HORIZONTAL;
  Weather.gWeather.nextWeather = C.WEATHER_FOG_HORIZONTAL;
  Weather.gWeather.fadeScreenCounter = 0;
  Weather.gWeather.fadeInCounter = 0;
  Weather.gWeather.fadeInActive = 1;
  Weather.gWeather.palProcessingState = C.WEATHER_PAL_STATE_SCREEN_FADING_IN;
  Weather.MarkFogSpritePalToLighten(16);
  for (let frame = 0; frame < 16; frame++) Weather.Task_WeatherMain();
  assert.equal(Weather.gWeather.palProcessingState, C.WEATHER_PAL_STATE_SCREEN_FADING_IN, 'fog fade remains active on its sixteenth call');
  Weather.Task_WeatherMain();
  assert.equal(Weather.gWeather.gammaIndex, 0, 'fog dispatcher sets gamma to zero at completion');
  assert.equal(Weather.gWeather.palProcessingState, C.WEATHER_PAL_STATE_IDLE);
  assert.equal(gPlttBufferFaded[16 * 16], 0x6779, 'fog fade lightens the marked sprite palette');

  // PREPARED by hand: invoke the C palette hook with each palette-processing state.
  Weather.gWeather.currWeather = C.WEATHER_FOG_HORIZONTAL;
  Weather.gWeather.palProcessingState = C.WEATHER_PAL_STATE_SCREEN_FADING_IN;
  Weather.gWeather.fadeInActive = 1;
  Weather.gWeather.fadeDestColor = 0x1234;
  Weather.UpdateSpritePaletteWithWeather(4);
  assert.equal(gPlttBufferFaded[OBJ_PLTT_ID(4)], 0x1234, 'sprite palette is filled with the fade destination');
  assert.equal(Weather.LightenSpritePaletteInFog(20), true, 'fog fade registers the sprite palette for lightening');

  Weather.gWeather.palProcessingState = C.WEATHER_PAL_STATE_SCREEN_FADING_OUT;
  gPaletteFade.y = 8;
  gPaletteFade.blendColor = 0;
  gPlttBufferFaded[OBJ_PLTT_ID(5)] = 0x4210;
  Weather.UpdateSpritePaletteWithWeather(5);
  assert.equal(gPlttBufferUnfaded[OBJ_PLTT_ID(5)], 0x4210, 'fade-out snapshots the faded color as the new source');
  assert.equal(gPlttBufferFaded[OBJ_PLTT_ID(5)], 0x2108, 'fade-out blends the new sprite palette');

  Weather.gWeather.currWeather = C.WEATHER_RAIN;
  Weather.gWeather.palProcessingState = C.WEATHER_PAL_STATE_IDLE;
  Weather.gWeather.gammaIndex = 1;
  gPlttBufferUnfaded[OBJ_PLTT_ID(6)] = 0x4210;
  Weather.UpdateSpritePaletteWithWeather(6);
  assert.equal(gPlttBufferFaded[OBJ_PLTT_ID(6)], 0x3def, 'normal weather applies gamma to a new sprite palette');
  gPlttBufferUnfaded[7 * 16] = 0x4210;
  Weather.ApplyWeatherGammaShiftToPal(7);
  assert.equal(gPlttBufferFaded[7 * 16], 0x3def, 'map palette gamma helper uses the current weather index');

  // PREPARED by hand: exercise the C helper used by cloud and sandstorm setup.
  Weather.gWeather.currWeather = C.WEATHER_NONE;
  Weather.gWeather.gammaIndex = 0;
  Weather.gWeather.weatherPicSpritePalIndex = 7;
  const customWeatherPalette = Uint16Array.from({ length: 16 }, (_, i) => 0x4000 | i);
  Weather.LoadCustomWeatherSpritePalette(customWeatherPalette);
  assert.equal(gPlttBufferUnfaded[OBJ_PLTT_ID(7)], customWeatherPalette[0], 'custom weather palette loads into the allocated OBJ slot');
  assert.equal(gPlttBufferFaded[OBJ_PLTT_ID(7)], customWeatherPalette[0], 'weather gamma hook updates the faded OBJ palette after loading');
  console.log('✓ Sprite/map palette weather hooks exercised');

  Weather.gWeather.currWeather = C.WEATHER_RAIN;
  Weather.gWeather.palProcessingState = C.WEATHER_PAL_STATE_IDLE;
  Weather.gWeather.fadeScreenCounter = 9;
  Weather.gWeather.readyForInit = false;
  gPaletteFade.active = false;
  Weather.FadeScreen(C.FADE_FROM_BLACK, 0);
  assert.equal(Weather.gWeather.palProcessingState, C.WEATHER_PAL_STATE_SCREEN_FADING_IN);
  assert.equal(Weather.gWeather.fadeScreenCounter, 0, 'weather palette fade-in resets its own counter');
  assert.equal(Weather.gWeather.fadeInActive, 1);
  assert.equal(Weather.gWeather.fadeInCounter, 0);
  assert.equal(Weather.gWeather.readyForInit, true);
  assert.equal(gPaletteFade.active, false, 'weather palette fade-in bypasses the normal palette fade');

  gPlttBufferFaded.fill(0x4210, paletteRangeStart, paletteRangeEnd);
  Weather.FadeScreen(C.FADE_TO_WHITE, -1);
  assert.equal(gPlttBufferUnfaded[0], 0x4210, 'weather fade-out copies faded colors into its source buffer');
  assert.equal(Weather.gWeather.palProcessingState, C.WEATHER_PAL_STATE_SCREEN_FADING_OUT);
  assert.equal(gPaletteFade.active, true, 'fade-out also starts the normal palette fade');

  Weather.gWeather.currWeather = C.WEATHER_NONE;
  gPaletteFade.active = false;
  Weather.FadeSelectedPals(C.FADE_FROM_WHITE, -2, 0x00020001);
  assert.equal(gPaletteFade.multipurpose1, 0x00020001, 'selected-palette fade forwards the C u32 mask');
  assert.equal(gPaletteFade.blendColor, 0x7fff, 'white-alpha fade uses the GBA white blend color');
  assert.equal(Weather.gWeather.palProcessingState, C.WEATHER_PAL_STATE_SCREEN_FADING_IN);

  const questPalette = new Uint16Array([0x4210]);
  Weather.gWeather.currWeather = C.WEATHER_RAIN;
  Weather.SlightlyDarkenPalsInWeather(questPalette, questPalette, 1);
  assert.equal(questPalette[0], 0x35ad, 'rain applies BlendPalettesAt black coefficient 3 to the supplied palette buffer');
  Weather.gWeather.currWeather = C.WEATHER_FOG_HORIZONTAL;
  const unchangedPalette = new Uint16Array([0x4210]);
  Weather.SlightlyDarkenPalsInWeather(unchangedPalette, unchangedPalette, 1);
  assert.equal(unchangedPalette[0], 0x4210, 'weather outside the C switch leaves this palette unchanged');

  // PREPARED by hand: initialize the C drought state against exported trig-table data.
  assert.equal(Trig.gSineTable.length, 320, 'the decomp trig table is loaded');
  Weather.gWeather.palProcessingState = C.WEATHER_PAL_STATE_IDLE;
  Weather.DroughtStateInit();
  assert.equal(Weather.gWeather.droughtBrightnessStage, 0);
  assert.equal(Weather.gWeather.droughtTimer, 0);
  assert.equal(Weather.gWeather.droughtState, 0);
  assert.equal(Weather.gWeather.droughtLastBrightnessStage, 0);
  for (let frame = 0; frame < 36; frame++) Weather.DroughtStateRun();
  assert.equal(Weather.gWeather.droughtBrightnessStage, 6, 'drought ramps through six brightness stages');
  assert.equal(Weather.gWeather.droughtLastBrightnessStage, 6);
  assert.equal(Weather.gWeather.droughtState, 1, 'drought enters the oscillation state');
  assert.equal(Weather.gWeather.droughtTimer, 60);
  assert.equal(Weather.gWeather.gammaIndex, -6, 'negative drought gamma is recorded while palette application remains FRLG-dummied');

  Weather.DroughtStateRun();
  const expectedDroughtStage = (((Trig.gSineTable[63] - 1) >> 6) + 2);
  assert.equal(Weather.gWeather.droughtTimer, 63);
  assert.equal(Weather.gWeather.droughtBrightnessStage, expectedDroughtStage, 'oscillation reads gSineTable using the C fixed-point formula');
  assert.equal(Weather.gWeather.gammaIndex, -expectedDroughtStage - 1);

  Weather.gWeather.droughtState = 2;
  Weather.gWeather.droughtBrightnessStage = 4;
  Weather.gWeather.droughtTimer = 5;
  Weather.DroughtStateRun();
  assert.equal(Weather.gWeather.droughtBrightnessStage, 3, 'ramp-down decrements the stage before applying gamma');
  assert.equal(Weather.gWeather.droughtState, 0, 'ramp-down returns to state 0 at brightness stage 3');
  assert.equal(Weather.gWeather.droughtTimer, 0);
  console.log('✓ Drought ramp, sine-table oscillation and ramp-down state paths exercised');

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
  Object.assign(Weather.gWeather, savedWeatherFrameState);
  Object.assign(gPaletteFade, savedPaletteFadeState);
  ppu.pltt.set(savedPpuPalette);
  Weather.ResetPreservedPalettesInWeather();
}
console.log('✓ Gamma task and rain, drought and fog fade paths exercised on palette buffers');

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

// PREPARED by hand: Drought_Main is advanced directly through its C init states.
const savedDroughtInitState = {
  palProcessingState: Weather.gWeather.palProcessingState,
  weatherGfxLoaded: Weather.gWeather.weatherGfxLoaded,
  initStep: Weather.gWeather.initStep,
  loadDroughtPalsIndex: Weather.gWeather.loadDroughtPalsIndex,
  loadDroughtPalsOffset: Weather.gWeather.loadDroughtPalsOffset,
};
Weather.gWeather.palProcessingState = C.WEATHER_PAL_STATE_IDLE;
WE.Drought_InitVars();
WE.Drought_Main();
assert.equal(Weather.gWeather.initStep, 1, 'drought waits for weather gamma changes to stop');
WE.Drought_Main();
assert.equal(Weather.gWeather.initStep, 2);
WE.Drought_Main();
assert.equal(Weather.gWeather.initStep, 2, 'FRLG dummy palette loader leaves the C loading index unchanged');
assert.equal(Weather.gWeather.loadDroughtPalsIndex, 1);
assert.equal(Weather.gWeather.weatherGfxLoaded, false, 'drought init remains pending while the dummied C loader returns true');
Object.assign(Weather.gWeather, savedDroughtInitState);

console.log('✓ Selected cloud, rain, sandstorm, ash and fog lifecycle paths exercised');
console.log('--- selected weather checks passed; this does not claim full module parity ---');
