// safari_zone.c: Safari mode state and step scripts.

import * as C from "../generated/constants";
import { flagClear, flagGet, flagSet, incrementGameStat } from "../save";
import { rom } from "../rom";

type SafariGame = { safariSteps?: number; safariBalls: number };

export function GetSafariZoneFlag(): boolean {
  return flagGet(C.FLAG_SYS_SAFARI_MODE);
}

export function SetSafariZoneFlag(): void {
  flagSet(C.FLAG_SYS_SAFARI_MODE);
}

export function ResetSafariZoneFlag(): void {
  flagClear(C.FLAG_SYS_SAFARI_MODE);
}

export function EnterSafariMode(game: SafariGame): void {
  incrementGameStat(C.GAME_STAT_ENTERED_SAFARI_ZONE);
  SetSafariZoneFlag();
  game.safariBalls = 30;
  game.safariSteps = 600;
}

export function ExitSafariMode(game: SafariGame): void {
  ResetSafariZoneFlag();
  game.safariBalls = 0;
  game.safariSteps = 0;
}

export function SafariZoneTakeStep(game: SafariGame, setupScript: (script: number) => void): boolean {
  if (!GetSafariZoneFlag()) return false;
  game.safariSteps = ((game.safariSteps ?? 0) - 1) & 0xffff;
  if (game.safariSteps !== 0) return false;
  setupScript(rom.label("SafariZone_EventScript_TimesUp"));
  return true;
}

export function SafariZoneRetirePrompt(setupScript: (script: number) => void): void {
  setupScript(rom.label("SafariZone_EventScript_RetirePrompt"));
}
