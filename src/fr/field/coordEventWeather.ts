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

export function DoCoordEventWeather(weatherId: number): void {
  weatherId &= 0xff;
  for (const entry of sWeatherCoordEventFuncs) {
    if (entry.weatherId === weatherId) {
      entry.callback();
      return;
    }
  }
}
