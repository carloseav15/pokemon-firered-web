// Headless check for battle_controllers.c link functions and buffer transfer.
import "./setupNodeGbaMock.ts";
import assert from "node:assert/strict";
import * as C from "../../src/fr/generated/constants.ts";
import { tasks } from "../../src/fr/gba/tasks.ts";
import {
  G, gBattleBufferA, gBattleBufferB, gBattlerControllerFuncs,
  gBattlerPositions, gLinkBattleSendBuffer, gLinkBattleRecvBuffer,
} from "../../src/fr/battle/globals.ts";
import {
  BUFFER_A, BUFFER_B,
  HandleLinkBattleSetup,
  InitLinkBtlControllers,
  CreateTasksForSendRecvLinkBuffers,
  PrepareBufferDataTransferLink,
  Task_HandleSendLinkBuffersData,
  TryReceiveLinkBattleData,
  Task_HandleCopyReceivedLinkBuffersData,
} from "../../src/fr/battle/controllers.ts";
import {
  gLinkPlayers, SetReceivedRemoteLinkPlayers, linkTransport, gBlockRecvBuffer,
} from "../../src/fr/linkState.ts";

tasks.reset();

// 1. Test HandleLinkBattleSetup and CreateTasksForSendRecvLinkBuffers
G.gBattleTypeFlags = C.BATTLE_TYPE_LINK;
SetReceivedRemoteLinkPlayers(1);
HandleLinkBattleSetup();

// Verify that the send and receive tasks were created
const activeTasks = tasks.tasks.filter((t) => t.isActive);
assert.ok(activeTasks.length >= 2, "HandleLinkBattleSetup creates send and receive tasks");

// The setup tasks were asserted above; start from a clean table so the
// transfer tests below exercise exactly one send and one receive task.
tasks.reset();

// 2. Test InitLinkBtlControllers for Single Battle (Master)
G.gBattleTypeFlags = C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_IS_MASTER;
InitLinkBtlControllers();
assert.equal(G.gBattlersCount, 2, "Single link battle has 2 battlers");
assert.equal(gBattlerPositions[0], C.B_POSITION_PLAYER_LEFT);
assert.equal(gBattlerPositions[1], C.B_POSITION_OPPONENT_LEFT);
assert.ok(typeof gBattlerControllerFuncs[0] === "function");
assert.ok(typeof gBattlerControllerFuncs[1] === "function");

// 3. Test InitLinkBtlControllers for Double Battle (Non-Master)
G.gBattleTypeFlags = C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_DOUBLE;
InitLinkBtlControllers();
assert.equal(G.gBattlersCount, C.MAX_BATTLERS_COUNT, "Double link battle has 4 battlers");
assert.equal(gBattlerPositions[1], C.B_POSITION_PLAYER_LEFT);
assert.equal(gBattlerPositions[0], C.B_POSITION_OPPONENT_LEFT);
assert.equal(gBattlerPositions[3], C.B_POSITION_PLAYER_RIGHT);
assert.equal(gBattlerPositions[2], C.B_POSITION_OPPONENT_RIGHT);

// 4. Test PrepareBufferDataTransferLink
CreateTasksForSendRecvLinkBuffers();
G.gActiveBattler = 0;
G.gBattlerAttacker = 1;
G.gBattlerTarget = 2;
G.gAbsentBattlerFlags = 0;
G.gEffectBattler = 3;

const testPayload = [0x12, 0x34, 0x56, 0x78];
PrepareBufferDataTransferLink(BUFFER_A, testPayload.length, testPayload);

// Verify buffer contents
// LINK_BUFF_BUFFER_ID = 0, LINK_BUFF_ACTIVE_BATTLER = 1, LINK_BUFF_ATTACKER = 2,
// LINK_BUFF_TARGET = 3, LINK_BUFF_SIZE_LO = 4, LINK_BUFF_SIZE_HI = 5,
// LINK_BUFF_ABSENT = 6, LINK_BUFF_EFFECT = 7, LINK_BUFF_DATA = 8
assert.equal(gLinkBattleSendBuffer[0], BUFFER_A);
assert.equal(gLinkBattleSendBuffer[1], 0); // ActiveBattler
assert.equal(gLinkBattleSendBuffer[2], 1); // Attacker
assert.equal(gLinkBattleSendBuffer[3], 2); // Target
assert.equal(gLinkBattleSendBuffer[7], 3); // EffectBattler
assert.equal(gLinkBattleSendBuffer[8], 0x12);
assert.equal(gLinkBattleSendBuffer[9], 0x34);
assert.equal(gLinkBattleSendBuffer[10], 0x56);
assert.equal(gLinkBattleSendBuffer[11], 0x78);

// 5. Test Task_HandleCopyReceivedLinkBuffersData
// Setup received data in gLinkBattleRecvBuffer
// Buffer ID = 0 (BUFFER_A), ActiveBattler = 0, size = 4
gLinkBattleRecvBuffer[0] = BUFFER_A;
gLinkBattleRecvBuffer[1] = 0; // battler 0
gLinkBattleRecvBuffer[2] = 1; // attacker
gLinkBattleRecvBuffer[3] = 2; // target
gLinkBattleRecvBuffer[4] = 4; // size lo
gLinkBattleRecvBuffer[5] = 0; // size hi
gLinkBattleRecvBuffer[6] = 0; // absent flags
gLinkBattleRecvBuffer[7] = 3; // effect battler
gLinkBattleRecvBuffer[8] = 0xAA;
gLinkBattleRecvBuffer[9] = 0xBB;
gLinkBattleRecvBuffer[10] = 0xCC;
gLinkBattleRecvBuffer[11] = 0xDD;

const recvTaskId = tasks.findByFunc(Task_HandleCopyReceivedLinkBuffersData);
assert.ok(tasks.tasks[recvTaskId].isActive, "receive task created by CreateTasksForSendRecvLinkBuffers");
tasks.tasks[recvTaskId].data[14] = 12 + 4; // head (data available)
tasks.tasks[recvTaskId].data[15] = 0;      // tail

G.gBattleControllerExecFlags = 0;
Task_HandleCopyReceivedLinkBuffersData(recvTaskId);

// Verify that buffer A of battler 0 received the payload
assert.equal(gBattleBufferA[0][0], 0xAA);
assert.equal(gBattleBufferA[0][1], 0xBB);
assert.equal(gBattleBufferA[0][2], 0xCC);
assert.equal(gBattleBufferA[0][3], 0xDD);
assert.equal(tasks.tasks[recvTaskId].data[15], 12, "receive tail advanced by size + LINK_BUFF_DATA");

// 6. BUFFER_B packet queued behind the first one
gLinkBattleRecvBuffer[12] = BUFFER_B;
gLinkBattleRecvBuffer[13] = 0; // active battler
gLinkBattleRecvBuffer[14] = 1; // attacker
gLinkBattleRecvBuffer[15] = 2; // target
gLinkBattleRecvBuffer[16] = 4; // size lo
gLinkBattleRecvBuffer[17] = 0; // size hi
gLinkBattleRecvBuffer[20] = 0x55;
gLinkBattleRecvBuffer[21] = 0x66;
gLinkBattleRecvBuffer[22] = 0x77;
gLinkBattleRecvBuffer[23] = 0x88;
tasks.tasks[recvTaskId].data[14] = 12 + 4 + 8;
G.gBattleControllerExecFlags = 0;
Task_HandleCopyReceivedLinkBuffersData(recvTaskId);
assert.equal(gBattleBufferB[0][0], 0x55);
assert.equal(gBattleBufferB[0][1], 0x66);
assert.equal(gBattleBufferB[0][2], 0x77);
assert.equal(gBattleBufferB[0][3], 0x88);
assert.equal(tasks.tasks[recvTaskId].data[15], 24, "receive tail advanced past the BUFFER_B packet");

// 7. Task_HandleSendLinkBuffersData: countdown, hand over, advance
const sendTaskId = tasks.findByFunc(Task_HandleSendLinkBuffersData);
const sendTask = tasks.tasks[sendTaskId];
assert.ok(sendTask.isActive, "send task created by CreateTasksForSendRecvLinkBuffers");

Task_HandleSendLinkBuffersData(sendTaskId); // case 0
assert.equal(sendTask.data[10], 100, "case 0 arms the 100-frame wait");
assert.equal(sendTask.data[11], 1);

sendTask.data[10] = 1;
Task_HandleSendLinkBuffersData(sendTaskId); // case 1: gReceivedRemoteLinkPlayers is set
assert.equal(sendTask.data[11], 3, "linked peers jump straight past case 2");

const sentPackets: { mask: number; size: number }[] = [];
const prevRawSend = linkTransport.rawSendPacket;
linkTransport.rawSendPacket = (mask, _src, size) => { sentPackets.push({ mask, size }); };
Task_HandleSendLinkBuffersData(sendTaskId); // case 3: queued packet handed to the transport
assert.deepEqual(sentPackets, [{ mask: 0, size: 16 }], "aligned payload + header sent (size 8 + LINK_BUFF_DATA 8)");
assert.equal(sendTask.data[11], 4);

Task_HandleSendLinkBuffersData(sendTaskId); // case 4: transport finished
linkTransport.rawSendPacket = prevRawSend;
assert.equal(sendTask.data[15], 16, "send tail advanced by size + LINK_BUFF_DATA");
assert.equal(sendTask.data[11], 3, "back to case 3 for the next packet");

// 8. TryReceiveLinkBattleData: gBlockRecvBuffer → gLinkBattleRecvBuffer
G.gBattleTypeFlags = C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_LINK_IN_BATTLE;
gLinkPlayers[0].linkType = 0x2211;
gBlockRecvBuffer[0].fill(0);
gBlockRecvBuffer[0][2] = 4; // dataSize, read as a halfword like the C
const blockBytes = new Uint8Array(gBlockRecvBuffer[0].buffer);
blockBytes[8] = 0xd0;
blockBytes[9] = 0x0e;
blockBytes[10] = 0x0f;
blockBytes[11] = 0xee;
tasks.tasks[recvTaskId].data[12] = 0;
tasks.tasks[recvTaskId].data[14] = 0;
tasks.tasks[recvTaskId].data[15] = 0;

let clearedWho = -1;
const prevRecvStatus = linkTransport.recvStatus;
const prevClearRecvFlag = linkTransport.clearRecvFlag;
const receiveOnce = () => {
  linkTransport.recvStatus = () => 1;
  linkTransport.clearRecvFlag = (who) => { clearedWho = who; };
  TryReceiveLinkBattleData();
  linkTransport.recvStatus = prevRecvStatus;
  linkTransport.clearRecvFlag = prevClearRecvFlag;
};

receiveOnce();
assert.equal(clearedWho, 0, "only the player whose block bit is set is consumed");
assert.equal(tasks.tasks[recvTaskId].data[14], 4 + 8, "receive head advanced by dataSize + 8");
for (let i = 0; i < 12; i++) {
  assert.equal(gLinkBattleRecvBuffer[i], blockBytes[i], `copied byte ${i}`);
}

// 8b. The head wraps to 0 when it would pass BATTLE_BUFFER_LINK_SIZE
gBlockRecvBuffer[0][2] = 0x20; // dataSize 32 → 41 bytes with the header
tasks.tasks[recvTaskId].data[14] = 0x0ff0;
clearedWho = -1;
receiveOnce();
assert.equal(clearedWho, 0, "wrap path consumes the block too");
assert.equal(tasks.tasks[recvTaskId].data[12], 0x0ff0, "wrap keeps the old head for the tail check");
assert.equal(tasks.tasks[recvTaskId].data[14], 0x20 + 8, "wrap restarts the head at 0");

console.log(
  "battleControllers headless check PASS" +
  "\n  PREPARED by hand: gBattleTypeFlags, gLinkPlayers[0].linkType, gBlockRecvBuffer payload," +
  "\n  task data[10..15] and gLinkBattleRecvBuffer packet headers (inputs, not results).",
);
