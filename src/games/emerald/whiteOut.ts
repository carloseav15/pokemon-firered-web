// pokeemerald/src/overworld.c: the complete DoWhiteOut and its reset helper.
// The viewer supplies the asynchronous WarpIntoMap boundary; the state rules are Emerald's.
import { flagClear, save, varGet, varSet } from '@game/save';
import { healMon } from '@core/pokemon/pokemon';
import * as EM from './generated/constants';
import type { WarpData } from '@game/save';

export type EmeraldWhiteOutHost = {
  runScript(name: string): void;
  resetInitialPlayerAvatarState(): void;
  warpIntoMap(destination: WarpData): void;
};

/** overworld.c Overworld_ResetStateAfterWhiteOut (not FireRed's reset). */
export function Overworld_ResetStateAfterWhiteOut(host: Pick<EmeraldWhiteOutHost, 'resetInitialPlayerAvatarState'>): void {
  host.resetInitialPlayerAvatarState();
  flagClear(EM.FLAG_SYS_CYCLING_ROAD);
  flagClear(EM.FLAG_SYS_CRUISE_MODE);
  flagClear(EM.FLAG_SYS_SAFARI_MODE);
  flagClear(EM.FLAG_SYS_USE_STRENGTH);
  flagClear(EM.FLAG_SYS_USE_FLASH);
  if (varGet(EM.VAR_SHOULD_END_ABNORMAL_WEATHER) === 1) {
    varSet(EM.VAR_SHOULD_END_ABNORMAL_WEATHER, 0);
    varSet(EM.VAR_ABNORMAL_WEATHER_LOCATION, EM.ABNORMAL_WEATHER_NONE);
  }
}

/** overworld.c DoWhiteOut: run the source reset script, halve money, heal, reset and warp. */
export function DoWhiteOut(host: EmeraldWhiteOutHost): void {
  host.runScript('EventScript_WhiteOut');
  save.money = Math.floor(save.money / 2);
  for (const mon of save.party) healMon(mon);
  Overworld_ResetStateAfterWhiteOut(host);
  // SetWarpDestinationToLastHealLocation copies the warp, including its source coordinates.
  host.warpIntoMap({ ...save.lastHealLocation });
}
