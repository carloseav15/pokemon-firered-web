// pokemon.c: which music the battle plays (GetBattleBGM / PlayBattleBGM / PlayMapChosenOrBattleBGM).
import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { G } from "../battle/globals";
import { rom } from "../rom";

/** GetBattleBGM */
export function GetBattleBGM(): number {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_KYOGRE_GROUDON) return C.MUS_VS_WILD;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_REGI) return C.MUS_RS_VS_TRAINER;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) return C.MUS_RS_VS_TRAINER;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) {
    switch (rom.trainers[G.gTrainerBattleOpponent_A]?.class) {
      case C.TRAINER_CLASS_CHAMPION:
        return C.MUS_VS_CHAMPION;
      case C.TRAINER_CLASS_LEADER:
      case C.TRAINER_CLASS_ELITE_FOUR:
        return C.MUS_VS_GYM_LEADER;
      case C.TRAINER_CLASS_BOSS:
      case C.TRAINER_CLASS_TEAM_ROCKET:
      case C.TRAINER_CLASS_COOLTRAINER:
      case C.TRAINER_CLASS_GENTLEMAN:
      case C.TRAINER_CLASS_RIVAL_LATE:
      default:
        return C.MUS_VS_TRAINER;
    }
  }
  return C.MUS_VS_WILD;
}

/** PlayBattleBGM */
export function PlayBattleBGM(): void {
  sound.resetMapMusic();
  sound.playBattleBGM(GetBattleBGM());
}

/** PlayMapChosenOrBattleBGM */
export function PlayMapChosenOrBattleBGM(songId: number): void {
  sound.resetMapMusic();
  if (songId) sound.playNewMapMusic(songId);
  else sound.playNewMapMusic(GetBattleBGM());
}
