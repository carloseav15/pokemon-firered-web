// battle_controllers.c: battler setup and the Emit* buffer protocol between the battle engine and controllers.

import * as C from "../generated/constants";
import {
  G, gActionSelectionCursor, gBattleBufferA, gBattleBufferB, gBattleMons, gBattlePartyCurrentOrder, gBattleScripting, gBattleStruct,
  gBattleTextBuff1, gBattleTextBuff2, gBattleTextBuff3, gBattlerControllerFuncs, gBattlerPartyIndexes, gBattlerPositions, gMoveSelectionCursor,
  gLinkBattleSendBuffer, gLinkBattleRecvBuffer, gBitTable,
} from "./globals";
import { gBattleMoves } from "./macros";
import { WEATHER_HAS_EFFECT2 } from "./util";
import { BeginBattleIntro } from "./main";
import { GetMonData, gEnemyParty, playerMon } from "../pokemon/mon";
import type { DisableStruct } from "../generated/structs";
import { ClearBattleAnimationVars, ClearBattleMonForms } from "./gfx_sfx_util";
import { BattleAI_HandleItemUseBeforeAISetup } from "./ai";
import { BufferBattlePartyCurrentOrderBySide } from "./ext";
import { SetControllerToPlayer } from "./controller_player";
import { SetControllerToOpponent } from "./controller_opponent";
import { SetControllerToOakOrOldMan } from "./controller_oak_old_man";
import { SetControllerToSafari } from "./controller_safari";
import { MarkBattlerReceivedLinkData } from "./util";
import { tasks } from "../gba/tasks";
import {
  gLinkPlayers, GetLinkPlayerCount, getReceivedRemoteLinkPlayers, getWirelessCommType,
  setWirelessCommTypeToRfu, linkTransport, gBlockRecvBuffer,
} from "../linkState";

export const BUFFER_A = 0;
export const BUFFER_B = 1;
const PARTY_SIZE = 6;

/** gUnusedControllerStruct (battle_controllers.c), used by legacy player command handlers. */
export const gUnusedControllerStruct = { unk: 0, flag: 0 };

export type HpAndStatus = { hp: number; status: number };
export type ChooseMoveStruct = { moves: number[]; currentPp: number[]; maxPp: number[]; species: number; monType1: number; monType2: number };
export const CHOOSE_MOVE_STRUCT_SIZE = 20;
export const BATTLE_MSG_DATA_SIZE = 64;

export function BattleControllerDummy(): void {}

export function SetUpBattleVars(): void {
  G.gBattleMainFunc = BeginBattleIntroDummy;
  for (let i = 0; i < C.MAX_BATTLERS_COUNT; i++) {
    gBattlerControllerFuncs[i] = BattleControllerDummy;
    gBattlerPositions[i] = 0xff;
    gActionSelectionCursor[i] = 0;
    gMoveSelectionCursor[i] = 0;
  }
  HandleLinkBattleSetup();
  G.gBattleControllerExecFlags = 0;
  ClearBattleAnimationVars();
  ClearBattleMonForms();
  BattleAI_HandleItemUseBeforeAISetup();
}

function BeginBattleIntroDummy(): void {}

export function InitBattleControllers(): void {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK)
    InitLinkBtlControllers();
  else
    InitSinglePlayerBtlControllers();
  SetBattlePartyIds();
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI)) {
    for (let i = 0; i < G.gBattlersCount; i++) BufferBattlePartyCurrentOrderBySide(i, 0);
  }
}

function InitSinglePlayerBtlControllers(): void {
  G.gBattleMainFunc = BeginBattleIntro;
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE)) {
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI) gBattlerControllerFuncs[0] = SetControllerToSafari;
    else if (G.gBattleTypeFlags & (C.BATTLE_TYPE_OLD_MAN_TUTORIAL | C.BATTLE_TYPE_FIRST_BATTLE)) gBattlerControllerFuncs[0] = SetControllerToOakOrOldMan;
    else gBattlerControllerFuncs[0] = SetControllerToPlayer;
    gBattlerPositions[0] = C.B_POSITION_PLAYER_LEFT;
    gBattlerControllerFuncs[1] = SetControllerToOpponent;
    gBattlerPositions[1] = C.B_POSITION_OPPONENT_LEFT;
    G.gBattlersCount = 2;
  } else {
    gBattlerControllerFuncs[0] = SetControllerToPlayer;
    gBattlerPositions[0] = C.B_POSITION_PLAYER_LEFT;
    gBattlerControllerFuncs[1] = SetControllerToOpponent;
    gBattlerPositions[1] = C.B_POSITION_OPPONENT_LEFT;
    gBattlerControllerFuncs[2] = SetControllerToPlayer;
    gBattlerPositions[2] = C.B_POSITION_PLAYER_RIGHT;
    gBattlerControllerFuncs[3] = SetControllerToOpponent;
    gBattlerPositions[3] = C.B_POSITION_OPPONENT_RIGHT;
    G.gBattlersCount = C.MAX_BATTLERS_COUNT;
  }
}

function SetBattlePartyIds(): void {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI) return;
  for (let i = 0; i < G.gBattlersCount; i++) {
    const party = (gBattlerPositions[i] & C.BIT_SIDE) === C.B_SIDE_PLAYER ? playerMon : (j: number) => gEnemyParty[j];
    for (let j = 0; j < PARTY_SIZE; j++) {
      const mon = party(j);
      const ok = GetMonData(mon, C.MON_DATA_HP) !== 0
        && (i < 2 || (gBattlerPositions[i] & C.BIT_SIDE) !== C.B_SIDE_PLAYER ? GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG) : GetMonData(mon, C.MON_DATA_SPECIES)) !== C.SPECIES_NONE
        && GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG) !== C.SPECIES_EGG
        && !GetMonData(mon, C.MON_DATA_IS_EGG)
        && (i < 2 || gBattlerPartyIndexes[i - 2] !== j);
      if (ok) {
        gBattlerPartyIndexes[i] = j;
        break;
      }
    }
  }
}

let sLinkSendTaskId = 0;
let sLinkReceiveTaskId = 0;

export function HandleLinkBattleSetup(): void {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) {
    if (getWirelessCommType())
      setWirelessCommTypeToRfu();
    if (!getReceivedRemoteLinkPlayers())
      linkTransport.initCommChannel();
    tasks.create(linkTransport.waitConnection, 0);
    CreateTasksForSendRecvLinkBuffers();
  }
}

const fnLinkOpponent = BattleControllerDummy;
const fnLinkPartner = BattleControllerDummy;

export function InitLinkBtlControllers(): void {
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE)) {
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_IS_MASTER) {
      G.gBattleMainFunc = BeginBattleIntro;
      gBattlerControllerFuncs[0] = SetControllerToPlayer;
      gBattlerPositions[0] = C.B_POSITION_PLAYER_LEFT;
      gBattlerControllerFuncs[1] = fnLinkOpponent;
      gBattlerPositions[1] = C.B_POSITION_OPPONENT_LEFT;
      G.gBattlersCount = 2;
    } else {
      gBattlerControllerFuncs[1] = SetControllerToPlayer;
      gBattlerPositions[1] = C.B_POSITION_PLAYER_LEFT;
      gBattlerControllerFuncs[0] = fnLinkOpponent;
      gBattlerPositions[0] = C.B_POSITION_OPPONENT_LEFT;
      G.gBattlersCount = 2;
    }
  } else if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI) && (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE)) {
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_IS_MASTER) {
      G.gBattleMainFunc = BeginBattleIntro;
      gBattlerControllerFuncs[0] = SetControllerToPlayer;
      gBattlerPositions[0] = C.B_POSITION_PLAYER_LEFT;
      gBattlerControllerFuncs[1] = fnLinkOpponent;
      gBattlerPositions[1] = C.B_POSITION_OPPONENT_LEFT;
      gBattlerControllerFuncs[2] = SetControllerToPlayer;
      gBattlerPositions[2] = C.B_POSITION_PLAYER_RIGHT;
      gBattlerControllerFuncs[3] = fnLinkOpponent;
      gBattlerPositions[3] = C.B_POSITION_OPPONENT_RIGHT;
      G.gBattlersCount = C.MAX_BATTLERS_COUNT;
    } else {
      gBattlerControllerFuncs[1] = SetControllerToPlayer;
      gBattlerPositions[1] = C.B_POSITION_PLAYER_LEFT;
      gBattlerControllerFuncs[0] = fnLinkOpponent;
      gBattlerPositions[0] = C.B_POSITION_OPPONENT_LEFT;
      gBattlerControllerFuncs[3] = SetControllerToPlayer;
      gBattlerPositions[3] = C.B_POSITION_PLAYER_RIGHT;
      gBattlerControllerFuncs[2] = fnLinkOpponent;
      gBattlerPositions[2] = C.B_POSITION_OPPONENT_RIGHT;
      G.gBattlersCount = C.MAX_BATTLERS_COUNT;
    }
  } else {
    const multiplayerId = linkTransport.localPlayerId();
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_IS_MASTER)
      G.gBattleMainFunc = BeginBattleIntro;

    for (let i = 0; i < C.MAX_BATTLERS_COUNT; i++) {
      switch (gLinkPlayers[i].id) {
        case 0:
        case 3:
          BufferBattlePartyCurrentOrderBySide(gLinkPlayers[i].id, 0);
          break;
        case 1:
        case 2:
          BufferBattlePartyCurrentOrderBySide(gLinkPlayers[i].id, 1);
          break;
      }

      if (i === multiplayerId) {
        gBattlerControllerFuncs[gLinkPlayers[i].id] = SetControllerToPlayer;
        switch (gLinkPlayers[i].id) {
          case 0:
          case 3:
            gBattlerPositions[gLinkPlayers[i].id] = C.B_POSITION_PLAYER_LEFT;
            gBattlerPartyIndexes[gLinkPlayers[i].id] = C.B_POSITION_PLAYER_LEFT;
            break;
          case 1:
          case 2:
            gBattlerPositions[gLinkPlayers[i].id] = C.B_POSITION_PLAYER_RIGHT;
            gBattlerPartyIndexes[gLinkPlayers[i].id] = 3;
            break;
        }
      } else {
        if ((!(gLinkPlayers[i].id & 1) && !(gLinkPlayers[multiplayerId].id & 1))
          || ((gLinkPlayers[i].id & 1) && (gLinkPlayers[multiplayerId].id & 1))) {
          gBattlerControllerFuncs[gLinkPlayers[i].id] = fnLinkPartner;
          switch (gLinkPlayers[i].id) {
            case 0:
            case 3:
              gBattlerPositions[gLinkPlayers[i].id] = C.B_POSITION_PLAYER_LEFT;
              gBattlerPartyIndexes[gLinkPlayers[i].id] = C.B_POSITION_PLAYER_LEFT;
              break;
            case 1:
            case 2:
              gBattlerPositions[gLinkPlayers[i].id] = C.B_POSITION_PLAYER_RIGHT;
              gBattlerPartyIndexes[gLinkPlayers[i].id] = C.B_POSITION_OPPONENT_RIGHT;
              break;
          }
        } else {
          gBattlerControllerFuncs[gLinkPlayers[i].id] = fnLinkOpponent;
          switch (gLinkPlayers[i].id) {
            case 0:
            case 3:
              gBattlerPositions[gLinkPlayers[i].id] = C.B_POSITION_OPPONENT_LEFT;
              gBattlerPartyIndexes[gLinkPlayers[i].id] = C.B_POSITION_PLAYER_LEFT;
              break;
            case 1:
            case 2:
              gBattlerPositions[gLinkPlayers[i].id] = C.B_POSITION_OPPONENT_RIGHT;
              gBattlerPartyIndexes[gLinkPlayers[i].id] = C.B_POSITION_OPPONENT_RIGHT;
              break;
          }
        }
      }
    }

    G.gBattlersCount = C.MAX_BATTLERS_COUNT;
  }
}

export function CreateTasksForSendRecvLinkBuffers(): void {
  sLinkSendTaskId = tasks.create(Task_HandleSendLinkBuffersData, 0);
  tasks.tasks[sLinkSendTaskId].data[11] = 0;
  tasks.tasks[sLinkSendTaskId].data[12] = 0;
  tasks.tasks[sLinkSendTaskId].data[13] = 0;
  tasks.tasks[sLinkSendTaskId].data[14] = 0;
  tasks.tasks[sLinkSendTaskId].data[15] = 0;

  sLinkReceiveTaskId = tasks.create(Task_HandleCopyReceivedLinkBuffersData, 0);
  tasks.tasks[sLinkReceiveTaskId].data[12] = 0;
  tasks.tasks[sLinkReceiveTaskId].data[13] = 0;
  tasks.tasks[sLinkReceiveTaskId].data[14] = 0;
  tasks.tasks[sLinkReceiveTaskId].data[15] = 0;
}

const LINK_BUFF_BUFFER_ID = 0;
const LINK_BUFF_ACTIVE_BATTLER = 1;
const LINK_BUFF_ATTACKER = 2;
const LINK_BUFF_TARGET = 3;
const LINK_BUFF_SIZE_LO = 4;
const LINK_BUFF_SIZE_HI = 5;
const LINK_BUFF_ABSENT_BATTLER_FLAGS = 6;
const LINK_BUFF_EFFECT_BATTLER = 7;
const LINK_BUFF_DATA = 8;

export function PrepareBufferDataTransferLink(bufferId: number, size: number, data: ArrayLike<number>): void {
  const alignedSize = size - (size % 4) + 4;
  const sendTask = tasks.tasks[sLinkSendTaskId];
  if (sendTask.data[14] + alignedSize + LINK_BUFF_DATA + 1 > C.BATTLE_BUFFER_LINK_SIZE) {
    sendTask.data[12] = sendTask.data[14];
    sendTask.data[14] = 0;
  }
  const offset = sendTask.data[14];
  gLinkBattleSendBuffer[offset + LINK_BUFF_BUFFER_ID] = bufferId;
  gLinkBattleSendBuffer[offset + LINK_BUFF_ACTIVE_BATTLER] = G.gActiveBattler;
  gLinkBattleSendBuffer[offset + LINK_BUFF_ATTACKER] = G.gBattlerAttacker;
  gLinkBattleSendBuffer[offset + LINK_BUFF_TARGET] = G.gBattlerTarget;
  gLinkBattleSendBuffer[offset + LINK_BUFF_SIZE_LO] = alignedSize & 0xff;
  gLinkBattleSendBuffer[offset + LINK_BUFF_SIZE_HI] = (alignedSize & 0xff00) >> 8;
  gLinkBattleSendBuffer[offset + LINK_BUFF_ABSENT_BATTLER_FLAGS] = G.gAbsentBattlerFlags;
  gLinkBattleSendBuffer[offset + LINK_BUFF_EFFECT_BATTLER] = G.gEffectBattler;

  for (let i = 0; i < size; i++) {
    gLinkBattleSendBuffer[offset + LINK_BUFF_DATA + i] = data[i];
  }

  sendTask.data[14] = offset + alignedSize + LINK_BUFF_DATA;
}

export function Task_HandleSendLinkBuffersData(taskId: number): void {
  const task = tasks.tasks[taskId];
  let blockSize: number;
  let playerCount: number;

  switch (task.data[11]) {
    case 0:
      task.data[10] = 100;
      task.data[11]++;
      break;
    case 1:
      task.data[10]--;
      if (task.data[10] === 0) {
        task.data[11]++;
        if (getReceivedRemoteLinkPlayers())
          task.data[11] = 3;
      }
      break;
    case 2:
      playerCount = GetLinkPlayerCount();
      if (((G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI) && playerCount > 3) || (!(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI) && playerCount > 1)) {
        if (linkTransport.isHost()) {
          linkTransport.stepLinkState();
          task.data[11]++;
        } else {
          task.data[11]++;
        }
      }
      break;
    case 3:
      if (task.data[15] !== task.data[14]) {
        if (task.data[13] === 0) {
          if (task.data[15] > task.data[14] && task.data[15] === task.data[12]) {
            task.data[12] = 0;
            task.data[15] = 0;
          }
          blockSize = (gLinkBattleSendBuffer[task.data[15] + LINK_BUFF_SIZE_LO] | (gLinkBattleSendBuffer[task.data[15] + LINK_BUFF_SIZE_HI] << 8)) + LINK_BUFF_DATA;
          linkTransport.rawSendPacket(linkTransport.otherPeersMask(), gLinkBattleSendBuffer.subarray(task.data[15]), blockSize);
          task.data[11]++;
        } else {
          task.data[13]--;
          break;
        }
      }
      break;
    case 4:
      if (linkTransport.commDone()) {
        blockSize = gLinkBattleSendBuffer[task.data[15] + LINK_BUFF_SIZE_LO] | (gLinkBattleSendBuffer[task.data[15] + LINK_BUFF_SIZE_HI] << 8);
        task.data[13] = 5;
        task.data[15] = task.data[15] + blockSize + LINK_BUFF_DATA;
        task.data[11] = 3;
      }
      break;
    case 5:
      if (--task.data[13] === 0) {
        task.data[13] = 5;
        task.data[11] = 3;
      }
      break;
  }
}

export function TryReceiveLinkBattleData(): void {
  if (getReceivedRemoteLinkPlayers() !== 0 && (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK_IN_BATTLE) && (gLinkPlayers[0].linkType === 0x2211)) {
    linkTransport.cleanupRfu();
    const count = GetLinkPlayerCount();
    const recvTask = tasks.tasks[sLinkReceiveTaskId];
    for (let i = 0; i < count; i++) {
      if (linkTransport.recvStatus() & gBitTable[i]) {
        linkTransport.clearRecvFlag(i);
        const dataSize = gBlockRecvBuffer[i][2];
        if (recvTask.data[14] + 9 + dataSize > 0x1000) {
          recvTask.data[12] = recvTask.data[14];
          recvTask.data[14] = 0;
        }
        const destOffset = recvTask.data[14];
        const src = new Uint8Array(gBlockRecvBuffer[i].buffer, gBlockRecvBuffer[i].byteOffset);
        for (let j = 0; j < dataSize + 8; j++) {
          gLinkBattleRecvBuffer[destOffset + j] = src[j];
        }
        recvTask.data[14] = destOffset + dataSize + 8;
      }
    }
  }
}

export function Task_HandleCopyReceivedLinkBuffersData(taskId: number): void {
  const task = tasks.tasks[taskId];
  if (task.data[15] !== task.data[14]) {
    if (task.data[15] > task.data[14] && task.data[15] === task.data[12]) {
      task.data[12] = 0;
      task.data[15] = 0;
    }
    const offset = task.data[15];
    const battlerId = gLinkBattleRecvBuffer[offset + LINK_BUFF_ACTIVE_BATTLER];
    const blockSize = gLinkBattleRecvBuffer[offset + LINK_BUFF_SIZE_LO] | (gLinkBattleRecvBuffer[offset + LINK_BUFF_SIZE_HI] << 8);

    switch (gLinkBattleRecvBuffer[offset + 0]) {
      case 0:
        if (G.gBattleControllerExecFlags & gBitTable[battlerId])
          return;

        gBattleBufferA[battlerId].set(gLinkBattleRecvBuffer.subarray(offset + LINK_BUFF_DATA, offset + LINK_BUFF_DATA + blockSize));
        MarkBattlerReceivedLinkData(battlerId);

        if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_IS_MASTER)) {
          G.gBattlerAttacker = gLinkBattleRecvBuffer[offset + LINK_BUFF_ATTACKER];
          G.gBattlerTarget = gLinkBattleRecvBuffer[offset + LINK_BUFF_TARGET];
          G.gAbsentBattlerFlags = gLinkBattleRecvBuffer[offset + LINK_BUFF_ABSENT_BATTLER_FLAGS];
          G.gEffectBattler = gLinkBattleRecvBuffer[offset + LINK_BUFF_EFFECT_BATTLER];
        }
        break;
      case 1:
        gBattleBufferB[battlerId].set(gLinkBattleRecvBuffer.subarray(offset + LINK_BUFF_DATA, offset + LINK_BUFF_DATA + blockSize));
        break;
      case 2:
        const v = gLinkBattleRecvBuffer[offset + LINK_BUFF_DATA];
        G.gBattleControllerExecFlags = (G.gBattleControllerExecFlags & ~(gBitTable[battlerId] << (v * 4))) >>> 0;
        break;
    }

    task.data[15] = offset + blockSize + LINK_BUFF_DATA;
  }
}

const sBattleBuffersTransferData = new Uint8Array(0x100);

function PrepareBufferDataTransfer(bufferId: number, data: Uint8Array, size: number): void {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) {
    PrepareBufferDataTransferLink(bufferId, size, data);
  } else {
    const dst = bufferId === BUFFER_A ? gBattleBufferA[G.gActiveBattler] : gBattleBufferB[G.gActiveBattler];
    dst.set(data.subarray(0, size));
  }
}

function put(bufferId: number, bytes: number[], size = bytes.length): void {
  const d = sBattleBuffersTransferData;
  for (let i = 0; i < bytes.length; i++) d[i] = bytes[i] & 0xff;
  PrepareBufferDataTransfer(bufferId, d, size);
}

function cmd4(bufferId: number, c: number): void {
  put(bufferId, [c, c, c, c]);
}

// Remaining non-link command serializers from battle_controllers.c. The DMA
// destination is represented by its GBA u32 address; browser memory pointers
// are never serialized as host addresses.
export function BtlController_EmitGetRawMonData(bufferId: number, monId: number, bytes: number): void {
  put(bufferId, [C.CONTROLLER_GETRAWMONDATA, monId, bytes, 0]);
}

export function BtlController_EmitSetRawMonData(bufferId: number, monId: number, bytes: number, data: ArrayLike<number>): void {
  const arr = [C.CONTROLLER_SETRAWMONDATA, monId, bytes];
  for (let i = 0; i < bytes; i++) arr.push(data[i] ?? 0);
  put(bufferId, arr, bytes + 3);
}

export function BtlController_EmitPaletteFade(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_PALETTEFADE); }
export function BtlController_EmitSuccessBallThrowAnim(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_SUCCESSBALLTHROWANIM); }

export function BtlController_EmitPause(bufferId: number, toWait: number, data: ArrayLike<number>): void {
  const arr = [C.CONTROLLER_PAUSE, toWait];
  for (let i = 0; i < toWait * 3; i++) arr.push(data[i] ?? 0);
  put(bufferId, arr, toWait * 3 + 2);
}

export function BtlController_EmitUnknownYesNoBox(bufferId: number, arg1: number): void {
  put(bufferId, [C.CONTROLLER_UNKNOWNYESNOBOX, arg1]);
}

export function BtlController_EmitCmd23(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_23); }
export function BtlController_EmitStatusXor(bufferId: number, value: number): void { put(bufferId, [C.CONTROLLER_STATUSXOR, value]); }

export function BtlController_EmitDMA3Transfer(bufferId: number, dstAddress: number, size: number, data: ArrayLike<number>): void {
  const address = dstAddress >>> 0;
  const arr = [C.CONTROLLER_DMA3TRANSFER, address, address >>> 8, address >>> 16, address >>> 24, size, size >>> 8];
  for (let i = 0; i < size; i++) arr.push(data[i] ?? 0);
  put(bufferId, arr, size + 7);
}

// C's loop uses songId as a byte count and overflows its 0x100-byte scratch
// buffer for values above 253. Keep its wire format while surfacing that C bug
// deterministically instead of corrupting adjacent JavaScript memory.
export function BtlController_EmitPlayBGM(bufferId: number, songId: number, data: ArrayLike<number>): void {
  if (songId > 253) throw new RangeError("battle_controllers.c EmitPlayBGM exceeds its 0x100-byte transfer buffer");
  const arr = [C.CONTROLLER_PLAYBGM, songId, songId >>> 8];
  for (let i = 0; i < songId; i++) arr.push(data[i] ?? 0);
  put(bufferId, arr, songId + 3);
}

export function BtlController_EmitCmd32(bufferId: number, size: number, data: ArrayLike<number>): void {
  const arr = [C.CONTROLLER_32, size, size >>> 8];
  for (let i = 0; i < size; i++) arr.push(data[i] ?? 0);
  put(bufferId, arr, size + 3);
}

export function BtlController_EmitClearUnkVar(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_CLEARUNKVAR); }
export function BtlController_EmitSetUnkVar(bufferId: number, value: number): void { put(bufferId, [C.CONTROLLER_SETUNKVAR, value]); }
export function BtlController_EmitClearUnkFlag(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_CLEARUNKFLAG); }
export function BtlController_EmitToggleUnkFlag(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_TOGGLEUNKFLAG); }

export function BtlController_EmitGetMonData(bufferId: number, requestId: number, monToCheck: number): void {
  put(bufferId, [C.CONTROLLER_GETMONDATA, requestId, monToCheck, 0]);
}

export function BtlController_EmitSetMonData(bufferId: number, requestId: number, monToCheck: number, bytes: number, data: ArrayLike<number>): void {
  const arr = [C.CONTROLLER_SETMONDATA, requestId, monToCheck];
  for (let i = 0; i < bytes; i++) arr.push(data[i] ?? 0);
  put(bufferId, arr, 3 + bytes);
}

export function BtlController_EmitLoadMonSprite(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_LOADMONSPRITE); }

export function BtlController_EmitSwitchInAnim(bufferId: number, partyId: number, dontClearSubstituteBit: boolean | number): void {
  put(bufferId, [C.CONTROLLER_SWITCHINANIM, partyId, dontClearSubstituteBit ? 1 : 0, 5]);
}

export function BtlController_EmitReturnMonToBall(bufferId: number, skipAnim: boolean | number): void {
  put(bufferId, [C.CONTROLLER_RETURNMONTOBALL, skipAnim ? 1 : 0]);
}

export function BtlController_EmitDrawTrainerPic(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_DRAWTRAINERPIC); }
export function BtlController_EmitTrainerSlide(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_TRAINERSLIDE); }
export function BtlController_EmitTrainerSlideBack(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_TRAINERSLIDEBACK); }
export function BtlController_EmitFaintAnimation(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_FAINTANIMATION); }

export function BtlController_EmitBallThrowAnim(bufferId: number, caseId: number): void {
  put(bufferId, [C.CONTROLLER_BALLTHROWANIM, caseId]);
}

export function BtlController_EmitMoveAnimation(bufferId: number, move: number, turnOfMove: number, movePower: number, dmg: number, friendship: number, disable: DisableStruct): void {
  const arr = [
    C.CONTROLLER_MOVEANIMATION, move, move >> 8, turnOfMove, movePower, movePower >> 8, dmg, dmg >> 8, dmg >> 16, dmg >>> 24, friendship,
    G.gMultiHitCounter,
  ];
  if (WEATHER_HAS_EFFECT2()) arr.push(G.gBattleWeather, G.gBattleWeather >> 8);
  else arr.push(0, 0);
  arr.push(0, 0);
  for (let i = 0; i < disable.bytes.length; i++) arr.push(disable.bytes[i]);
  put(bufferId, arr);
}

function battleMsgData(withExtras: boolean): number[] {
  const b = new Uint8Array(BATTLE_MSG_DATA_SIZE);
  const v = new DataView(b.buffer);
  v.setUint16(0, G.gCurrentMove, true);
  v.setUint16(2, G.gChosenMove, true);
  v.setUint16(4, G.gLastUsedItem, true);
  b[6] = G.gLastUsedAbility;
  b[7] = gBattleScripting.battler;
  b[8] = gBattleStruct.scriptPartyIdx;
  if (withExtras) {
    b[9] = gBattleStruct.hpScale;
    b[10] = G.gPotentialItemEffectBattler;
    b[11] = gBattleMoves(G.gCurrentMove).type;
  }
  for (let i = 0; i < C.MAX_BATTLERS_COUNT; i++) b[12 + i] = gBattleMons[i].ability;
  for (let i = 0; i < 16; i++) {
    b[16 + i] = gBattleTextBuff1[i];
    b[32 + i] = gBattleTextBuff2[i];
    b[48 + i] = gBattleTextBuff3[i];
  }
  return Array.from(b);
}

export function BtlController_EmitPrintString(bufferId: number, stringID: number): void {
  put(bufferId, [C.CONTROLLER_PRINTSTRING, G.gBattleOutcome, stringID, stringID >> 8, ...battleMsgData(true)]);
}

export function BtlController_EmitPrintSelectionString(bufferId: number, stringID: number): void {
  put(bufferId, [C.CONTROLLER_PRINTSTRINGPLAYERONLY, C.CONTROLLER_PRINTSTRINGPLAYERONLY, stringID, stringID >> 8, ...battleMsgData(false)]);
}

export function BtlController_EmitChooseAction(bufferId: number, action: number, itemId: number): void {
  put(bufferId, [C.CONTROLLER_CHOOSEACTION, action, itemId, itemId >> 8]);
}

export function encodeChooseMoveStruct(s: ChooseMoveStruct): number[] {
  const b = new Uint8Array(CHOOSE_MOVE_STRUCT_SIZE);
  const v = new DataView(b.buffer);
  for (let i = 0; i < 4; i++) {
    v.setUint16(i * 2, s.moves[i] ?? 0, true);
    b[8 + i] = s.currentPp[i] ?? 0;
    b[12 + i] = s.maxPp[i] ?? 0;
  }
  v.setUint16(16, s.species, true);
  b[18] = s.monType1;
  b[19] = s.monType2;
  return Array.from(b);
}

export function decodeChooseMoveStruct(buf: Uint8Array, offset: number): ChooseMoveStruct {
  const v = new DataView(buf.buffer, buf.byteOffset + offset, CHOOSE_MOVE_STRUCT_SIZE);
  const s: ChooseMoveStruct = { moves: [], currentPp: [], maxPp: [], species: v.getUint16(16, true), monType1: v.getUint8(18), monType2: v.getUint8(19) };
  for (let i = 0; i < 4; i++) {
    s.moves[i] = v.getUint16(i * 2, true);
    s.currentPp[i] = v.getUint8(8 + i);
    s.maxPp[i] = v.getUint8(12 + i);
  }
  return s;
}

export function BtlController_EmitChooseMove(bufferId: number, isDoubleBattle: boolean, noPpNumber: boolean, movePpData: ChooseMoveStruct): void {
  put(bufferId, [C.CONTROLLER_CHOOSEMOVE, isDoubleBattle ? 1 : 0, noPpNumber ? 1 : 0, 0, ...encodeChooseMoveStruct(movePpData)]);
}

export function BtlController_EmitChooseItem(bufferId: number, battlePartyOrder: ArrayLike<number>): void {
  put(bufferId, [C.CONTROLLER_OPENBAG, battlePartyOrder[0], battlePartyOrder[1], battlePartyOrder[2]]);
}

export function BtlController_EmitChoosePokemon(bufferId: number, caseId: number, slotId: number, abilityId: number, data: ArrayLike<number>): void {
  put(bufferId, [C.CONTROLLER_CHOOSEPOKEMON, caseId, slotId, abilityId, data[0], data[1], data[2], 0]);
}

export function BtlController_EmitHealthBarUpdate(bufferId: number, hpValue: number): void {
  put(bufferId, [C.CONTROLLER_HEALTHBARUPDATE, 0, hpValue, (hpValue >> 8) & 0xff]);
}

export function BtlController_EmitExpUpdate(bufferId: number, partyId: number, expPoints: number): void {
  put(bufferId, [C.CONTROLLER_EXPUPDATE, partyId, expPoints, (expPoints >> 8) & 0xff]);
}

export function BtlController_EmitStatusIconUpdate(bufferId: number, status1: number, status2: number): void {
  put(bufferId, [C.CONTROLLER_STATUSICONUPDATE, status1, status1 >> 8, status1 >> 16, status1 >>> 24, status2, status2 >> 8, status2 >> 16, status2 >>> 24]);
}

export function BtlController_EmitStatusAnimation(bufferId: number, status2: boolean | number, status: number): void {
  put(bufferId, [C.CONTROLLER_STATUSANIMATION, status2 ? 1 : 0, status, status >> 8, status >> 16, status >>> 24]);
}

export function BtlController_EmitDataTransfer(bufferId: number, size: number, data: ArrayLike<number>): void {
  const arr = [C.CONTROLLER_DATATRANSFER, C.CONTROLLER_DATATRANSFER, size, size >> 8];
  for (let i = 0; i < size; i++) arr.push(data[i]);
  put(bufferId, arr);
}

export function BtlController_EmitTwoReturnValues(bufferId: number, ret8: number, ret16: number): void {
  put(bufferId, [C.CONTROLLER_TWORETURNVALUES, ret8, ret16, ret16 >> 8]);
}

export function BtlController_EmitChosenMonReturnValue(bufferId: number, partyId: number, battlePartyOrder: ArrayLike<number>): void {
  const arr = [C.CONTROLLER_CHOSENMONRETURNVALUE, partyId];
  for (let i = 0; i < gBattlePartyCurrentOrder.length; i++) arr.push(battlePartyOrder[i]);
  put(bufferId, arr);
}

export function BtlController_EmitOneReturnValue(bufferId: number, ret: number): void {
  put(bufferId, [C.CONTROLLER_ONERETURNVALUE, ret, ret >> 8, 0]);
}

export function BtlController_EmitOneReturnValue_Duplicate(bufferId: number, ret: number): void {
  put(bufferId, [C.CONTROLLER_ONERETURNVALUE_DUPLICATE, ret, ret >> 8, 0]);
}

export function BtlController_EmitHitAnimation(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_HITANIMATION); }
export function BtlController_EmitCantSwitch(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_CANTSWITCH); }

export function BtlController_EmitPlaySE(bufferId: number, songId: number): void {
  put(bufferId, [C.CONTROLLER_PLAYSE, songId, songId >> 8, 0]);
}

export function BtlController_EmitPlayFanfare(bufferId: number, songId: number): void {
  put(bufferId, [C.CONTROLLER_PLAYFANFARE, songId, songId >> 8, 0]);
}

export function BtlController_EmitFaintingCry(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_FAINTINGCRY); }

export function BtlController_EmitIntroSlide(bufferId: number, terrainId: number): void {
  put(bufferId, [C.CONTROLLER_INTROSLIDE, terrainId]);
}

export function BtlController_EmitIntroTrainerBallThrow(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_INTROTRAINERBALLTHROW); }

export function BtlController_EmitDrawPartyStatusSummary(bufferId: number, hpAndStatus: HpAndStatus[], flags: number): void {
  const arr = [C.CONTROLLER_DRAWPARTYSTATUSSUMMARY, flags & ~C.PARTY_SUMM_SKIP_DRAW_DELAY, (flags & C.PARTY_SUMM_SKIP_DRAW_DELAY) >> 7, C.CONTROLLER_DRAWPARTYSTATUSSUMMARY];
  for (let i = 0; i < PARTY_SIZE; i++) {
    const { hp, status } = hpAndStatus[i];
    arr.push(hp, hp >> 8, 0, 0, status, status >> 8, status >> 16, status >>> 24);
  }
  put(bufferId, arr);
}

export function decodeHpAndStatus(buf: Uint8Array, offset: number): HpAndStatus[] {
  const v = new DataView(buf.buffer, buf.byteOffset + offset, 8 * PARTY_SIZE);
  return Array.from({ length: PARTY_SIZE }, (_, i) => ({ hp: v.getUint16(i * 8, true), status: v.getUint32(i * 8 + 4, true) }));
}

export function BtlController_EmitHidePartyStatusSummary(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_HIDEPARTYSTATUSSUMMARY); }
export function BtlController_EmitEndBounceEffect(bufferId: number): void { cmd4(bufferId, C.CONTROLLER_ENDBOUNCE); }

export function BtlController_EmitSpriteInvisibility(bufferId: number, isInvisible: boolean | number): void {
  put(bufferId, [C.CONTROLLER_SPRITEINVISIBILITY, isInvisible ? 1 : 0, C.CONTROLLER_SPRITEINVISIBILITY, C.CONTROLLER_SPRITEINVISIBILITY]);
}

export function BtlController_EmitBattleAnimation(bufferId: number, animationId: number, argument: number): void {
  put(bufferId, [C.CONTROLLER_BATTLEANIMATION, animationId, argument, argument >> 8]);
}

export function BtlController_EmitLinkStandbyMsg(bufferId: number, mode: number): void {
  put(bufferId, [C.CONTROLLER_LINKSTANDBYMSG, mode]);
}

export function BtlController_EmitResetActionMoveSelection(bufferId: number, caseId: number): void {
  put(bufferId, [C.CONTROLLER_RESETACTIONMOVESELECTION, caseId]);
}

export function BtlController_EmitEndLinkBattle(bufferId: number, battleOutcome: number): void {
  put(bufferId, [C.CONTROLLER_ENDLINKBATTLE, battleOutcome]);
}
