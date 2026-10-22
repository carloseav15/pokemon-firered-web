// pokeemerald clock.c (time-based events) with rtc.c's CalcTimeDifference and RtcCalcLocalTime.
//
// ADAPTATION: the GBA RTC is the browser's local wall clock (days since 2000-01-01, like RtcGetDayCount),
// with a zero localTimeOffset. GAP: UpdatePerDay (VAR_DAYS driven daily events: ClearDailyFlags, TV, Dewford
// trends, Pokérus time, ...) is not ported, so DoTimeBasedEvents runs only UpdatePerMinute (berry growth).
import { flagGet, save } from "@game/save";
import * as EM from "./generated/constants";
import { BerryTreeTimeUpdate } from "./berry";

/** global.h struct Time (dayOfWeek is not part of the pokeemerald struct). */
export type Time = { days: number; hours: number; minutes: number; seconds: number };

const SECONDS_PER_MINUTE = 60, MINUTES_PER_HOUR = 60, HOURS_PER_DAY = 24;

/** gLocalTime */
export const gLocalTime: Time = { days: 0, hours: 0, minutes: 0, seconds: 0 };

/** rtc.c RtcCalcLocalTime */
export function RtcCalcLocalTime(now: Date = new Date()): void {
  gLocalTime.days = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(2000, 0, 1)) / 86400000);
  gLocalTime.hours = now.getHours();
  gLocalTime.minutes = now.getMinutes();
  gLocalTime.seconds = now.getSeconds();
}

/** rtc.c CalcTimeDifference */
export function CalcTimeDifference(result: Time, t1: Time, t2: Time): void {
  result.seconds = t2.seconds - t1.seconds;
  result.minutes = t2.minutes - t1.minutes;
  result.hours = t2.hours - t1.hours;
  result.days = t2.days - t1.days;
  if (result.seconds < 0) { result.seconds += SECONDS_PER_MINUTE; --result.minutes; }
  if (result.minutes < 0) { result.minutes += MINUTES_PER_HOUR; --result.hours; }
  if (result.hours < 0) { result.hours += HOURS_PER_DAY; --result.days; }
}

/** field_specials.c InPokemonCenter */
export function InPokemonCenter(): boolean {
  const sPokemonCenters = [
    EM.MAP_OLDALE_TOWN_POKEMON_CENTER_1F, EM.MAP_DEWFORD_TOWN_POKEMON_CENTER_1F, EM.MAP_LAVARIDGE_TOWN_POKEMON_CENTER_1F,
    EM.MAP_FALLARBOR_TOWN_POKEMON_CENTER_1F, EM.MAP_VERDANTURF_TOWN_POKEMON_CENTER_1F, EM.MAP_PACIFIDLOG_TOWN_POKEMON_CENTER_1F,
    EM.MAP_PETALBURG_CITY_POKEMON_CENTER_1F, EM.MAP_SLATEPORT_CITY_POKEMON_CENTER_1F, EM.MAP_MAUVILLE_CITY_POKEMON_CENTER_1F,
    EM.MAP_RUSTBORO_CITY_POKEMON_CENTER_1F, EM.MAP_FORTREE_CITY_POKEMON_CENTER_1F, EM.MAP_LILYCOVE_CITY_POKEMON_CENTER_1F,
    EM.MAP_MOSSDEEP_CITY_POKEMON_CENTER_1F, EM.MAP_SOOTOPOLIS_CITY_POKEMON_CENTER_1F, EM.MAP_EVER_GRANDE_CITY_POKEMON_CENTER_1F,
    EM.MAP_EVER_GRANDE_CITY_POKEMON_LEAGUE_1F, EM.MAP_BATTLE_FRONTIER_POKEMON_CENTER_1F, EM.MAP_BATTLE_COLOSSEUM_2P,
    EM.MAP_TRADE_CENTER, EM.MAP_RECORD_CORNER, EM.MAP_BATTLE_COLOSSEUM_4P,
  ];
  const here = ((save.location.mapGroup & 0xff) << 8) | (save.location.mapNum & 0xff);
  return sPokemonCenters.includes(here);
}

/** clock.c UpdatePerMinute */
function UpdatePerMinute(localTime: Time): void {
  const difference: Time = { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const last = save.lastBerryTreeUpdate ??= { days: 0, hours: 0, minutes: 0, seconds: 0 };
  CalcTimeDifference(difference, last, localTime);
  const minutes = 24 * 60 * difference.days + 60 * difference.hours + difference.minutes;
  if (minutes !== 0) {
    if (minutes >= 0) {
      BerryTreeTimeUpdate(minutes);
      save.lastBerryTreeUpdate = { ...localTime };
    }
  }
}

/** clock.c DoTimeBasedEvents (UpdatePerDay missing, see the file header). */
export function DoTimeBasedEvents(): void {
  if (flagGet(EM.FLAG_SYS_CLOCK_SET) && !InPokemonCenter()) {
    RtcCalcLocalTime();
    UpdatePerMinute(gLocalTime);
  }
}
