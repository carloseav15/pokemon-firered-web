// Headless check for single-player quest_log_battle.c writes to saved scene scripts.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../src/fr/generated/constants.ts";
import { G, gBattleMons, gBattleResults } from "../../src/fr/battle/globals.ts";
import { gEnemyParty } from "../../src/fr/pokemon/mon.ts";
import { rom } from "../../src/fr/rom.ts";
import { flagSet, save } from "../../src/fr/save.ts";
import { QL_SkipCommand } from "../../src/fr/questLogEventBuffer.ts";
import {
  QuestLogEvents_HandleEndTrainerBattle,
  ResetQuestLog,
} from "../../src/fr/questLogEvents.ts";
import { TrySetQuestLogBattleEvent } from "../../src/fr/questLogBattle.ts";

// QL_StartRecordingAction snapshots a real map layout; supply the game's map index and a valid current map.
const mapIndex = JSON.parse(readFileSync(`${process.cwd()}/public/fr/maps.json`, "utf8"));
rom.mapIndex = mapIndex;
(rom as any).mapById = new Map(Object.entries(mapIndex.maps).map(([id, entry]: [string, any]) => [entry.num, id]));
const currentMapNum = mapIndex.maps.MAP_PEWTER_CITY_POKEMON_CENTER_1F.num;
save.location.mapGroup = currentMapNum >>> 8;
save.location.mapNum = currentMapNum & 0xff;
save.location.warpId = 0;

/** Read the C event record from the same save script used by Quest Log playback. */
function readSavedEvent(eventId: number): { actionIndex: number; payload: number[] } {
  const script = save.questLogScenes?.at(-1)?.script as number[] | undefined;
  assert.ok(script, "battle event creates a saved Quest Log scene script");
  for (let cursor = 0; cursor < script.length;) {
    const next = QL_SkipCommand(script, cursor);
    assert.ok(next !== null && next > cursor, `valid Quest Log command at script word ${cursor}`);
    if ((script[cursor]! & 0x0fff) === eventId) {
      return { actionIndex: script[cursor + 1]!, payload: script.slice(cursor + 2, next) };
    }
    cursor = next;
  }
  assert.fail(`event ${eventId} was not written to save.questLogScenes[].script`);
}

// Wild victory is recorded with only the defeated species and current map section.
ResetQuestLog();
flagSet(C.FLAG_SYS_GAME_CLEAR);
G.gBattleTypeFlags = 0;
G.gBattleOutcome = C.B_OUTCOME_WON;
gEnemyParty[0] = { species: C.SPECIES_PIDGEY } as any;
TrySetQuestLogBattleEvent();
let event = readSavedEvent(C.QL_EVENT_DEFEATED_WILD_MON);
assert.equal(event.actionIndex, 2, "event follows the two initial scene actions");
assert.deepEqual(event.payload, [C.SPECIES_PIDGEY, C.SPECIES_NONE, 1, 0]);

// Capture uses the same event and increments the caught count in its packed word.
ResetQuestLog();
flagSet(C.FLAG_SYS_GAME_CLEAR);
G.gBattleTypeFlags = 0;
G.gBattleOutcome = C.B_OUTCOME_CAUGHT;
gEnemyParty[0] = { species: C.SPECIES_RATTATA } as any;
TrySetQuestLogBattleEvent();
event = readSavedEvent(C.QL_EVENT_DEFEATED_WILD_MON);
assert.deepEqual(event.payload, [C.SPECIES_NONE, C.SPECIES_RATTATA, 0x100, 0]);

// Trainer results are deferred by TrySetQuestLogBattleEvent until battle setup closes.
ResetQuestLog();
flagSet(C.FLAG_SYS_GAME_CLEAR);
rom.trainers = [{ class: 0 } as any];
G.gBattleTypeFlags = C.BATTLE_TYPE_TRAINER;
G.gBattleOutcome = C.B_OUTCOME_WON;
G.gTrainerBattleOpponent_A = 0;
gBattleResults.lastOpponentSpecies = C.SPECIES_RATTATA;
gBattleMons[0].species = C.SPECIES_BULBASAUR;
gBattleMons[0].hp = 15;
gBattleMons[0].maxHP = 30;
TrySetQuestLogBattleEvent();
assert.equal(save.questLogScenes?.length, 0, "trainer result waits for battle-setup callback");
QuestLogEvents_HandleEndTrainerBattle();
event = readSavedEvent(C.QL_EVENT_DEFEATED_TRAINER);
assert.deepEqual(event.payload, [C.SPECIES_RATTATA, C.SPECIES_BULBASAUR, 0, 0x100]);

// Link battle event writing, names, and multi-player indexes are excluded: LINK is outside
// the single-player goal. The single-player writer must still reject a LINK battle.
ResetQuestLog();
G.gBattleTypeFlags = C.BATTLE_TYPE_LINK;
G.gBattleOutcome = C.B_OUTCOME_WON;
TrySetQuestLogBattleEvent();
assert.equal(save.questLogScenes?.length ?? 0, 0, "LINK battles do not enter the single-player writer");

console.log("PASS: single-player battle results are recorded in questLogScenes[].script; LINK writer omitted by scope.");
