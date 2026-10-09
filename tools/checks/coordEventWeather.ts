// DoCoordEventWeather: FireRed's table is dummied out; pokeemerald's (registered by the game wiring) calls SetWeather.
import assert from "node:assert/strict";
import * as C from "../../src/fr/generated/constants";
import { DoCoordEventWeather, UseEmeraldCoordEventWeather } from "../../src/fr/field/coordEventWeather";

const calls: number[] = [];

// Default (FireRed): nothing happens for any id.
for (let id = 0; id < 256; id++) DoCoordEventWeather(id);
assert.deepEqual(calls, []);

// Emerald: coord_event_weather.c maps COORD_EVENT_WEATHER_* to SetWeather(WEATHER_*).
UseEmeraldCoordEventWeather((weather) => calls.push(weather));
const expected: [number, number][] = [
  [C.COORD_EVENT_WEATHER_SUNNY_CLOUDS, C.WEATHER_SUNNY_CLOUDS], [C.COORD_EVENT_WEATHER_SUNNY, C.WEATHER_SUNNY],
  [C.COORD_EVENT_WEATHER_RAIN, C.WEATHER_RAIN], [C.COORD_EVENT_WEATHER_SNOW, C.WEATHER_SNOW],
  [C.COORD_EVENT_WEATHER_RAIN_THUNDERSTORM, C.WEATHER_RAIN_THUNDERSTORM],
  [C.COORD_EVENT_WEATHER_FOG_HORIZONTAL, C.WEATHER_FOG_HORIZONTAL], [C.COORD_EVENT_WEATHER_FOG_DIAGONAL, C.WEATHER_FOG_DIAGONAL],
  [C.COORD_EVENT_WEATHER_VOLCANIC_ASH, C.WEATHER_VOLCANIC_ASH], [C.COORD_EVENT_WEATHER_SANDSTORM, C.WEATHER_SANDSTORM],
  [C.COORD_EVENT_WEATHER_SHADE, C.WEATHER_SHADE], [C.COORD_EVENT_WEATHER_DROUGHT, C.WEATHER_DROUGHT],
  [C.COORD_EVENT_WEATHER_ROUTE119_CYCLE, C.WEATHER_ROUTE119_CYCLE], [C.COORD_EVENT_WEATHER_ROUTE123_CYCLE, C.WEATHER_ROUTE123_CYCLE],
];
for (const [coordId, weather] of expected) {
  calls.length = 0;
  DoCoordEventWeather(coordId);
  assert.deepEqual(calls, [weather], `coord event weather ${coordId}`);
}
// Ids outside the table do nothing (the C loop falls through), and the high byte is ignored (u8 parameter).
calls.length = 0;
DoCoordEventWeather(0);
DoCoordEventWeather(99);
assert.deepEqual(calls, []);
DoCoordEventWeather(0x100 | C.COORD_EVENT_WEATHER_RAIN);
assert.deepEqual(calls, [C.WEATHER_RAIN]);

UseEmeraldCoordEventWeather(null);
calls.length = 0;
DoCoordEventWeather(C.COORD_EVENT_WEATHER_RAIN);
assert.deepEqual(calls, []);
console.log("PASS: coord event weather (FireRed dummied, Emerald table).");
