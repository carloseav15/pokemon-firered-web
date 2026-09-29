// post_battle_event_funcs.c: EnterHallOfFame (heal, set the clear flag and
// first-clear time, the Hall of Fame ribbon and event tickets, the continue
// warp) and hand-off to hall_of_fame.c's screen; SetWarpsToRollCredits
// (hall_of_fame.c) lives here because it needs the overworld warp API.

import * as C from "./generated/constants";
import { flagGet, flagSet, GetGameStat, incrementGameStat, save, SetGameStat, varSet } from "./save";
import { healMon, type Pokemon } from "./pokemon/pokemon";
import { addBagItem, checkBagHasItem } from "./pokemon/items";
import { rom } from "./rom";
import type { Game } from "./game";
import { BeginHallOfFameScreen } from "./hallOfFame";

/** EnterHallOfFame followed by CB2_DoHallOfFameScreen. */
export function enterHallOfFame(game: Game): void {
  const ow = game.overworld;
  for (const mon of save.party) healMon(mon);
  const hadHallOfFameRecords = flagGet(C.FLAG_SYS_GAME_CLEAR);
  flagSet(C.FLAG_SYS_GAME_CLEAR);
  if (!GetGameStat(C.GAME_STAT_FIRST_HOF_PLAY_TIME)) {
    const secs = Math.floor(save.playTimeFrames / 60);
    SetGameStat(C.GAME_STAT_FIRST_HOF_PLAY_TIME, (Math.floor(secs / 3600) << 16) | ((Math.floor(secs / 60) % 60) << 8) | (secs % 60));
  }
  // SetContinueGameWarpStatus + SetContinueGameWarpToHealLocation(HEAL_LOCATION_PALLET_TOWN)
  (save as unknown as { continueGameWarpActive?: boolean }).continueGameWarpActive = true;
  ow.SetContinueGameWarpToHealLocation(C.HEAL_LOCATION_PALLET_TOWN);
  let ribbon = false;
  for (const mon of save.party) {
    if (mon.isEgg) continue;
    const m = mon as Pokemon & { ribbons?: number[] };
    m.ribbons ??= [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (!m.ribbons[5]) { m.ribbons[5] = 1; ribbon = true; }
  }
  if (ribbon) {
    incrementGameStat(C.GAME_STAT_RECEIVED_RIBBONS);
    flagSet(C.FLAG_SYS_RIBBON_GET);
    // REVISION >= 0xA: event tickets are granted with the first ribbon-awarding
    // Hall of Fame entry, unless the Aurora Ticket is already in the bag. Like
    // the C, the unlock flags are set regardless of the bag result.
    if (!checkBagHasItem(C.ITEM_AURORA_TICKET, 1)) {
      addBagItem(C.ITEM_AURORA_TICKET, 1);
      flagSet(C.FLAG_ENABLE_SHIP_BIRTH_ISLAND);
      flagSet(C.FLAG_RECEIVED_AURORA_TICKET);
      addBagItem(C.ITEM_MYSTIC_TICKET, 1);
      flagSet(C.FLAG_ENABLE_SHIP_NAVEL_ROCK);
      flagSet(C.FLAG_RECEIVED_MYSTIC_TICKET);
    }
  }
  ow.script.ScriptContext_Stop();
  // On the first clear the C clears the Hall of Fame sectors before writing the first team.
  if (!hadHallOfFameRecords) (save as unknown as { hallOfFame?: unknown[] }).hallOfFame = [];
  BeginHallOfFameScreen(game, false);
}

/** SetWarpsToRollCredits */
export function SetWarpsToRollCredits(game: Game): void {
  const ow = game.overworld;
  varSet(C.VAR_MAP_SCENE_INDIGO_PLATEAU_EXTERIOR, 1);
  flagSet(C.FLAG_DONT_SHOW_MAP_NAME_POPUP);
  const num = rom.c("MAP_INDIGO_PLATEAU_EXTERIOR");
  ow.keepMusicOnNextLoad = true; // gDisableMapMusicChangeOnMapLoad = 2
  ow.setWarpDestination(num >> 8, num & 0xff, -1, 11, 6);
  ow.DoWarp();
  ow.resetInitialPlayerAvatarState();
}
