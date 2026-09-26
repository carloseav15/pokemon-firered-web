// quest_log_battle.c: record the single-player trainer and wild battle result.

import * as C from "./generated/constants";
import { rom } from "./rom";
import { currentRegionMapSection, GetMonData, gEnemyParty } from "./pokemon/mon";
import { G, gBattleMons, gBattleResults, gBattleStruct } from "./battle/globals";
import { GetBattlerAtPosition, GetBattlerSide } from "./battle/util";
import { SetQuestLogEvent } from "./questLogEvents";

/** TrySetQuestLogBattleEvent; called at HandleEndTurn_FinishBattle's terminal state. */
export function TrySetQuestLogBattleEvent(): void {
  if (G.gBattleTypeFlags & (C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_OLD_MAN_TUTORIAL | C.BATTLE_TYPE_POKEDUDE)) return;
  if (G.gBattleOutcome !== C.B_OUTCOME_WON && G.gBattleOutcome !== C.B_OUTCOME_CAUGHT) return;

  const mapSec = currentRegionMapSection();
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) {
    const trainerId = G.gTrainerBattleOpponent_A;
    const trainerClass = rom.trainers[trainerId]?.class ?? 0;
    let eventId = C.QL_EVENT_DEFEATED_TRAINER;
    if (trainerClass === C.TRAINER_CLASS_LEADER) eventId = C.QL_EVENT_DEFEATED_GYM_LEADER;
    else if (trainerClass === C.TRAINER_CLASS_CHAMPION) eventId = C.QL_EVENT_DEFEATED_CHAMPION;
    else if (trainerClass === C.TRAINER_CLASS_ELITE_FOUR) eventId = C.QL_EVENT_DEFEATED_E4_MEMBER;

    const playerLeft = gBattleMons[GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT)];
    let speciesPlayer = playerLeft.species;
    let playerEndingHP = playerLeft.hp;
    let playerMaxHP = playerLeft.maxHP;
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
      const playerRight = gBattleMons[GetBattlerAtPosition(C.B_POSITION_PLAYER_RIGHT)];
      const lastAttacker = gBattleStruct.lastAttackerToFaintOpponent;
      if (GetBattlerSide(lastAttacker) === C.B_SIDE_PLAYER) speciesPlayer = gBattleMons[lastAttacker].species;
      else if (playerLeft.hp !== 0) speciesPlayer = playerLeft.species;
      else speciesPlayer = playerRight.species;
      playerEndingHP += playerRight.hp;
      playerMaxHP += playerRight.maxHP;
    }

    // Preserve C's integer evaluation order: (maxHP / 3) * 2, then maxHP / 3.
    let hpFractionId = 0;
    if (playerEndingHP < Math.trunc(playerMaxHP / 3) * 2) hpFractionId++;
    if (playerEndingHP < Math.trunc(playerMaxHP / 3)) hpFractionId++;
    SetQuestLogEvent(eventId, {
      trainerId,
      speciesOpponent: gBattleResults.lastOpponentSpecies,
      speciesPlayer,
      mapSec,
      hpFractionId,
    });
    return;
  }

  const species = GetMonData(gEnemyParty[0], C.MON_DATA_SPECIES);
  SetQuestLogEvent(C.QL_EVENT_DEFEATED_WILD_MON, {
    defeatedSpecies: G.gBattleOutcome === C.B_OUTCOME_WON ? species : C.SPECIES_NONE,
    caughtSpecies: G.gBattleOutcome === C.B_OUTCOME_CAUGHT ? species : C.SPECIES_NONE,
    mapSec,
  });
}
