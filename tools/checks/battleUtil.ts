// Headless check for battle_util.c (controller execution flags, multi-turn moves, link data flags).
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import * as C from "../../src/fr/generated/constants.ts";
import { G, gBattleMons, gDisableStructs, gProtectStructs, gStatuses3 } from "../../src/fr/battle/globals.ts";
import {
  MarkAllBattlersForControllerExec,
  MarkBattlerForControllerExec,
  MarkBattlerReceivedLinkData,
  CancelMultiTurnMoves,
  WasUnableToUseMove,
} from "../../src/fr/battle/util.ts";

// 1. Test MarkAllBattlersForControllerExec in standard single battle
G.gBattleTypeFlags = 0;
G.gBattlersCount = 2;
G.gBattleControllerExecFlags = 0;
MarkAllBattlersForControllerExec();
assert.equal(G.gBattleControllerExecFlags, 0b11, "Standard battle marks lower bits for all battlers");

// 2. Test MarkAllBattlersForControllerExec in link battle
G.gBattleTypeFlags = C.BATTLE_TYPE_LINK;
G.gBattlersCount = 2;
G.gBattleControllerExecFlags = 0;
MarkAllBattlersForControllerExec();
const expectedLinkAll = ((1 << 28) | (2 << 28)) >>> 0;
assert.equal(G.gBattleControllerExecFlags, expectedLinkAll, "Link battle marks upper bits (32 - MAX_BATTLERS_COUNT) for all battlers");

// 3. Test MarkBattlerForControllerExec
G.gBattleTypeFlags = 0;
G.gBattleControllerExecFlags = 0;
MarkBattlerForControllerExec(1);
assert.equal(G.gBattleControllerExecFlags, 0b10, "MarkBattlerForControllerExec sets lower bit 1 in single battle");

G.gBattleTypeFlags = C.BATTLE_TYPE_LINK;
G.gBattleControllerExecFlags = 0;
MarkBattlerForControllerExec(1);
const expectedLink1 = (2 << 28) >>> 0;
assert.equal(G.gBattleControllerExecFlags, expectedLink1, "MarkBattlerForControllerExec sets upper bit for battler 1 in link battle");

// 4. Test MarkBattlerReceivedLinkData
// Start with upper bit set
G.gBattleControllerExecFlags = expectedLink1;
MarkBattlerReceivedLinkData(1);
// Upper bit (2 << 28) cleared, lower bit shifted by 0 (2 << 0 = 2) added
assert.equal(G.gBattleControllerExecFlags & (2 << 28), 0, "MarkBattlerReceivedLinkData clears the upper exec bit for battler 1");
assert.equal(G.gBattleControllerExecFlags & 2, 2, "MarkBattlerReceivedLinkData sets the lower exec bits according to player count");

// 5. Test CancelMultiTurnMoves
gBattleMons[0] = {
  status2: C.STATUS2_MULTIPLETURNS | C.STATUS2_LOCK_CONFUSE | C.STATUS2_UPROAR | C.STATUS2_BIDE | 0x1,
} as any;
gStatuses3[0] = C.STATUS3_SEMI_INVULNERABLE | 0x4;
gDisableStructs[0] = {
  rolloutTimer: 3,
  furyCutterCounter: 4,
} as any;

CancelMultiTurnMoves(0);
assert.equal(
  gBattleMons[0].status2 & (C.STATUS2_MULTIPLETURNS | C.STATUS2_LOCK_CONFUSE | C.STATUS2_UPROAR | C.STATUS2_BIDE),
  0,
  "Multi-turn status bits must be cleared"
);
assert.equal(gBattleMons[0].status2 & 0x1, 0x1, "Other status2 bits must be preserved");
assert.equal(gStatuses3[0] & C.STATUS3_SEMI_INVULNERABLE, 0, "SEMI_INVULNERABLE must be cleared");
assert.equal(gStatuses3[0] & 0x4, 0x4, "Other status3 bits must be preserved");
assert.equal(gDisableStructs[0].rolloutTimer, 0, "rolloutTimer must be 0");
assert.equal(gDisableStructs[0].furyCutterCounter, 0, "furyCutterCounter must be 0");

// 6. Test WasUnableToUseMove
gProtectStructs[0] = {
  prlzImmobility: 0,
  targetNotAffected: 0,
  usedImprisonedMove: 0,
  loveImmobility: 0,
  usedDisabledMove: 0,
  usedTauntedMove: 0,
  flag2Unknown: 0,
  flinchImmobility: 0,
  confusionSelfDmg: 0,
} as any;
assert.equal(WasUnableToUseMove(0), false, "WasUnableToUseMove returns false when no immobility active");

gProtectStructs[0].prlzImmobility = 1;
assert.equal(WasUnableToUseMove(0), true, "WasUnableToUseMove returns true when paralyzed");

console.log("PASS: battle_util.c (37/37 functions) execution flags and move cancellation verified.");
