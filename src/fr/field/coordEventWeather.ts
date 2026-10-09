// coord_event_weather.c: weather coord events. Every handler is dummied out in
// FireRed ("it's always sunny in Viridian"), so the table only has to match.

import * as C from "../generated/constants";

function WeatherCoordEvent_SunnyClouds(): void {}
function WeatherCoordEvent_Sunny(): void {}
function WeatherCoordEvent_Rain(): void {}
function WeatherCoordEvent_Snow(): void {}
function WeatherCoordEvent_RainThunderstorm(): void {}
function WeatherCoordEvent_FogHorizontal(): void {}
function WeatherCoordEvent_VolcanicAsh(): void {}
function WeatherCoordEvent_Sandstorm(): void {}
function WeatherCoordEvent_FogDiagonal(): void {}
function WeatherCoordEvent_Underwater(): void {}
function WeatherCoordEvent_Shade(): void {}
function WeatherCoordEvent_Route119Cycle(): void {}
function WeatherCoordEvent_Route123Cycle(): void {}

const sWeatherCoordEventFuncs: { weatherId: number; callback: () => void }[] = [
  { weatherId: C.WEATHER_SUNNY_CLOUDS, callback: WeatherCoordEvent_SunnyClouds },
  { weatherId: C.WEATHER_SUNNY, callback: WeatherCoordEvent_Sunny },
  { weatherId: C.WEATHER_RAIN, callback: WeatherCoordEvent_Rain },
  { weatherId: C.WEATHER_SNOW, callback: WeatherCoordEvent_Snow },
  { weatherId: C.WEATHER_RAIN_THUNDERSTORM, callback: WeatherCoordEvent_RainThunderstorm },
  { weatherId: C.WEATHER_FOG_HORIZONTAL, callback: WeatherCoordEvent_FogHorizontal },
  { weatherId: C.WEATHER_VOLCANIC_ASH, callback: WeatherCoordEvent_VolcanicAsh },
  { weatherId: C.WEATHER_SANDSTORM, callback: WeatherCoordEvent_Sandstorm },
  { weatherId: C.WEATHER_FOG_DIAGONAL, callback: WeatherCoordEvent_FogDiagonal },
  { weatherId: C.WEATHER_UNDERWATER, callback: WeatherCoordEvent_Underwater },
  { weatherId: C.WEATHER_SHADE, callback: WeatherCoordEvent_Shade },
  { weatherId: C.WEATHER_ROUTE119_CYCLE, callback: WeatherCoordEvent_Route119Cycle },
  { weatherId: C.WEATHER_ROUTE123_CYCLE, callback: WeatherCoordEvent_Route123Cycle },
];

// pokeemerald's coord_event_weather.c: the table is keyed by COORD_EVENT_WEATHER_* and every handler is
// SetWeather(WEATHER_*). The WEATHER_* values are the same in both games. FireRed keeps the dummied table above; the
// Emerald table runs only after the game wiring registers its SetWeather (UseEmeraldCoordEventWeather).
const sCoordEventWeatherFuncsEmerald: { coordEventWeather: number; weather: number }[] = [
  { coordEventWeather: C.COORD_EVENT_WEATHER_SUNNY_CLOUDS, weather: C.WEATHER_SUNNY_CLOUDS },
  { coordEventWeather: C.COORD_EVENT_WEATHER_SUNNY, weather: C.WEATHER_SUNNY },
  { coordEventWeather: C.COORD_EVENT_WEATHER_RAIN, weather: C.WEATHER_RAIN },
  { coordEventWeather: C.COORD_EVENT_WEATHER_SNOW, weather: C.WEATHER_SNOW },
  { coordEventWeather: C.COORD_EVENT_WEATHER_RAIN_THUNDERSTORM, weather: C.WEATHER_RAIN_THUNDERSTORM },
  { coordEventWeather: C.COORD_EVENT_WEATHER_FOG_HORIZONTAL, weather: C.WEATHER_FOG_HORIZONTAL },
  { coordEventWeather: C.COORD_EVENT_WEATHER_FOG_DIAGONAL, weather: C.WEATHER_FOG_DIAGONAL },
  { coordEventWeather: C.COORD_EVENT_WEATHER_VOLCANIC_ASH, weather: C.WEATHER_VOLCANIC_ASH },
  { coordEventWeather: C.COORD_EVENT_WEATHER_SANDSTORM, weather: C.WEATHER_SANDSTORM },
  { coordEventWeather: C.COORD_EVENT_WEATHER_SHADE, weather: C.WEATHER_SHADE },
  { coordEventWeather: C.COORD_EVENT_WEATHER_DROUGHT, weather: C.WEATHER_DROUGHT },
  { coordEventWeather: C.COORD_EVENT_WEATHER_ROUTE119_CYCLE, weather: C.WEATHER_ROUTE119_CYCLE },
  { coordEventWeather: C.COORD_EVENT_WEATHER_ROUTE123_CYCLE, weather: C.WEATHER_ROUTE123_CYCLE },
];

let setWeatherEmerald: ((weather: number) => void) | null = null;

/** Switches DoCoordEventWeather to pokeemerald's table; pass the game's SetWeather, or null for FireRed's dummied one. */
export function UseEmeraldCoordEventWeather(setWeather: ((weather: number) => void) | null): void {
  setWeatherEmerald = setWeather;
}

export function DoCoordEventWeather(weatherId: number): void {
  weatherId &= 0xff;
  if (setWeatherEmerald) {
    for (const entry of sCoordEventWeatherFuncsEmerald) {
      if (entry.coordEventWeather === weatherId) {
        setWeatherEmerald(entry.weather);
        return;
      }
    }
    return;
  }
  for (const entry of sWeatherCoordEventFuncs) {
    if (entry.weatherId === weatherId) {
      entry.callback();
      return;
    }
  }
}
