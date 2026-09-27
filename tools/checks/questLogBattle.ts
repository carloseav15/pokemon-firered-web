// Headless check for quest_log_battle.c parity (trainer, wild, and link battle quest log events).
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import * as C from "../../src/fr/generated/constants.ts";
import { G, gBattleMons, gBattleResults, gBattleStruct } from "../../src/fr/battle/globals.ts";
import { gEnemyParty } from "../../src/fr/pokemon/mon.ts";
import { gLinkPlayers } from "../../src/fr/linkState.ts";
import { save } from "../../src/fr/save.ts";
import { getQuestLogEvents, QuestLogLinkBattleEvent, QuestLogWildBattleEvent } from "../../src/fr/questLogEvents.ts";
import {
  TrySetQuestLogBattleEvent,
  TrySetQuestLogLinkBattleEvent,
  GetLinkMultiBattlePlayerIndexes,
} from "../../src/fr/questLogBattle.ts";

save.questLogEvents = [];

// 1. Test wild battle victory
G.gBattleTypeFlags = 0;
G.gBattleOutcome = C.B_OUTCOME_WON;
gEnemyParty[0] = { species: C.SPECIES_PIDGEY } as any;
TrySetQuestLogBattleEvent();

let events = getQuestLogEvents();
assert.equal(events.length, 1, "One quest log event recorded");
assert.equal(events[0].eventId, C.QL_EVENT_DEFEATED_WILD_MON);
let wildData = events[0].data as QuestLogWildBattleEvent;
assert.equal(wildData.defeatedSpecies, C.SPECIES_PIDGEY);
assert.equal(wildData.caughtSpecies, C.SPECIES_NONE);

// 2. Test wild battle capture
G.gBattleOutcome = C.B_OUTCOME_CAUGHT;
gEnemyParty[0] = { species: C.SPECIES_RATTATA } as any;
TrySetQuestLogBattleEvent();

events = getQuestLogEvents();
assert.equal(events.length, 2);
assert.equal(events[1].eventId, C.QL_EVENT_DEFEATED_WILD_MON);
wildData = events[1].data as QuestLogWildBattleEvent;
assert.equal(wildData.defeatedSpecies, C.SPECIES_NONE);
assert.equal(wildData.caughtSpecies, C.SPECIES_RATTATA);

// 3. Test link battle single
G.gBattleTypeFlags = C.BATTLE_TYPE_LINK;
G.gBattleOutcome = C.B_OUTCOME_WON;
gBattleStruct.multiplayerId = 0;
gLinkPlayers[1].name = [1, 2, 3, 0xff];
TrySetQuestLogLinkBattleEvent();

events = getQuestLogEvents();
assert.equal(events.length, 3);
assert.equal(events[2].eventId, C.QL_EVENT_LINK_BATTLED_SINGLE);
let linkData = events[2].data as QuestLogLinkBattleEvent;
assert.equal(linkData.outcome, 0); // B_OUTCOME_WON - 1
assert.deepEqual(linkData.playerNames[0], [1, 2, 3, 0xff]);

// 4. Test link battle double
G.gBattleTypeFlags = C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_DOUBLE;
G.gBattleOutcome = C.B_OUTCOME_LOST;
TrySetQuestLogLinkBattleEvent();

events = getQuestLogEvents();
assert.equal(events.length, 4);
assert.equal(events[3].eventId, C.QL_EVENT_LINK_BATTLED_DOUBLE);
linkData = events[3].data as QuestLogLinkBattleEvent;
assert.equal(linkData.outcome, 1); // B_OUTCOME_LOST - 1

// 5. Test GetLinkMultiBattlePlayerIndexes & multi battle link event
// Player id = 0, partner id = 0 ^ 2 = 2, opponents = 1 and 3
for (let i = 0; i < 4; i++) {
  gLinkPlayers[i].id = i;
  gLinkPlayers[i].name = [10 + i, 0xff];
}
gBattleStruct.multiplayerId = 0;

const partnerIdx = { val: -1 };
const opponentIdxs: [number, number] = [-1, -1];
GetLinkMultiBattlePlayerIndexes(partnerIdx, opponentIdxs);
assert.equal(partnerIdx.val, 2, "Partner ID matching partnerId = 0 ^ 2 is index 2");
assert.equal(opponentIdxs[0], 1, "First opponent index is 1");
assert.equal(opponentIdxs[1], 3, "Second opponent index is 3");

G.gBattleTypeFlags = C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_MULTI;
G.gBattleOutcome = C.B_OUTCOME_DREW;
TrySetQuestLogLinkBattleEvent();

events = getQuestLogEvents();
assert.equal(events.length, 5);
assert.equal(events[4].eventId, C.QL_EVENT_LINK_BATTLED_MULTI);
linkData = events[4].data as QuestLogLinkBattleEvent;
assert.equal(linkData.outcome, 2); // B_OUTCOME_DREW - 1
assert.equal(linkData.playerNames.length, 3);
assert.deepEqual(linkData.playerNames[0], [12, 0xff]); // partner (idx 2)
assert.deepEqual(linkData.playerNames[1], [11, 0xff]); // opponent 0 (idx 1)
assert.deepEqual(linkData.playerNames[2], [13, 0xff]); // opponent 1 (idx 3)

console.log("PASS: quest_log_battle.c (3/3 functions) battle and link battle events verified.");
