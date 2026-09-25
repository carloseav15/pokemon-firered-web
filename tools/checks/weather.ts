// Headless check for field_weather.c port (weather.ts)
// Run with: npm run check:weather

import './setupNodeGbaMock.ts';
import assert from 'node:assert/strict';
import * as Weather from '../../src/fr/field/weather.ts';

console.log('--- 1. Testing field_weather gamma table construction ---');
const table = Weather.BuildGammaShiftTables();
assert.equal(table.length, 19, 'Gamma shift table must have 19 rows');
assert.equal(table[0].length, 32, 'Each row must have 32 color levels');
console.log('✓ BuildGammaShiftTables verified');

console.log('--- 2. Testing field_weather 50/50 functions presence & state ---');
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

console.log('✓ Weather transitions and state updates verified');
console.log('--- weather check passed successfully! ---');
