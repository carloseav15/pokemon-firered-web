// link.c / overworld.c: source-shaped receive-queue and link-session state.
// The browser has no cable/RFU transport yet. The future transport adapter
// feeds complete per-frame player command rows through ReceiveLinkCommand and
// registers the exact CB1 callback it installs in gMain.

import * as C from "./generated/constants";
import { gMain, type MainCallback } from "./hw/runtime";

const CMD_LENGTH = 8; // link.h
const QUEUE_CAPACITY = 50; // link.h
const OVERWORLD_RECV_QUEUE_MAX = 3; // link.h

export interface LinkPlayer {
  version: number;
  lp_field_2: number;
  trainerId: number;
  name: number[];
  progressFlags: number;
  neverRead: number;
  progressFlagsCopy: number;
  gender: number;
  linkType: number;
  id: number;
  language: number;
}

export const gLinkPlayers: LinkPlayer[] = Array.from({ length: 5 }, (_, i) => ({
  version: 0,
  lp_field_2: 0,
  trainerId: 0,
  name: new Array(8).fill(0xff),
  progressFlags: 0,
  neverRead: 0,
  progressFlagsCopy: 0,
  gender: 0,
  linkType: 0,
  id: i,
  language: 0,
}));

type LinkRecvCommandRows = Uint16Array[];

class LinkRecvQueue {
  private readonly commands: LinkRecvCommandRows[] = [];

  enqueue(rows: readonly Uint16Array[]): boolean {
    if (this.commands.length >= QUEUE_CAPACITY) return false;
    if (rows.some((row) => row.length !== CMD_LENGTH))
      throw new RangeError(`link receive command rows must contain ${CMD_LENGTH} halfwords`);
    if (!rows.some((row) => row.some((value) => value !== 0))) return false;
    this.commands.push(rows.map((row) => row.slice()));
    return true;
  }

  dequeue(): LinkRecvCommandRows | undefined {
    return this.commands.shift();
  }

  get length(): number { return this.commands.length; }

  clear(): void { this.commands.length = 0; }
}

const cableRecvQueue = new LinkRecvQueue();
const rfuRecvQueue = new LinkRecvQueue();
let wirelessCommType = 0;
let receivedRemoteLinkPlayers = 0;
let linkStateUpdateCallback: MainCallback = null;
let sReceivingFromLink = false;

/** link.c gWirelessCommType. Zero selects the cable queue; nonzero selects RFU. */
export function SetWirelessCommType(value: number): void { wirelessCommType = value & 0xff; }

/** link.c gReceivedRemoteLinkPlayers (bool8), updated when peers are accepted. */
export function SetReceivedRemoteLinkPlayers(value: number): void { receivedRemoteLinkPlayers = value !== 0 ? 1 : 0; }

/** Register the callback identity installed as gMain.callback1 by the link layer. */
export function RegisterLinkStateUpdateCallback(callback: Exclude<MainCallback, null>): void {
  linkStateUpdateCallback = callback;
}

/** IsUpdateLinkStateCBActive (overworld.c). */
export function IsUpdateLinkStateCBActive(): boolean {
  return linkStateUpdateCallback !== null && gMain.callback1 === linkStateUpdateCallback;
}

/** MenuHelpers_IsLinkActive (menu_helpers.c). */
export function IsLinkSessionActive(): boolean {
  return IsUpdateLinkStateCBActive() || receivedRemoteLinkPlayers === 1;
}

/** Receive one complete CMD_LENGTH-halfword row for each connected player. */
export function ReceiveLinkCommand(rows: readonly Uint16Array[]): boolean {
  return (wirelessCommType !== 0 ? rfuRecvQueue : cableRecvQueue).enqueue(rows);
}

/** Consume one command set as DequeueRecvCmds does; an empty queue returns undefined. */
export function DequeueLinkCommand(): LinkRecvCommandRows | undefined {
  return (wirelessCommType !== 0 ? rfuRecvQueue : cableRecvQueue).dequeue();
}

/** link.c GetLinkRecvQueueLength. */
export function GetLinkRecvQueueLength(): number {
  return wirelessCommType !== 0 ? rfuRecvQueue.length : cableRecvQueue.length;
}

/** link.c IsLinkRecvQueueAtOverworldMax. */
export function IsLinkRecvQueueAtOverworldMax(): boolean {
  return GetLinkRecvQueueLength() >= OVERWORLD_RECV_QUEUE_MAX;
}

/** overworld.c Overworld_LinkRecvQueueLengthMoreThan2. */
export function Overworld_LinkRecvQueueLengthMoreThan2(): boolean {
  if (!IsUpdateLinkStateCBActive()) return false;
  sReceivingFromLink = GetLinkRecvQueueLength() >= OVERWORLD_RECV_QUEUE_MAX;
  return sReceivingFromLink;
}

/** link.c GetLinkPlayerCount. */
export function GetLinkPlayerCount(): number {
  return receivedRemoteLinkPlayers !== 0 ? 2 : 1;
}

/** Reset link adapter state when a cable/RFU session closes. */
export function ResetLinkState(): void {
  cableRecvQueue.clear();
  rfuRecvQueue.clear();
  wirelessCommType = 0;
  receivedRemoteLinkPlayers = 0;
  linkStateUpdateCallback = null;
  sReceivingFromLink = false;
}

// ---------------------------------------------------------------------------
// Adapter helpers for link battle controllers.
// The web port has no active link transport; linkTransport exposes safe
// single-player hooks without declaring premature stubs for unported link.c.
// ---------------------------------------------------------------------------

/** link.c gReceivedRemoteLinkPlayers accessor. */
export function getReceivedRemoteLinkPlayers(): number { return receivedRemoteLinkPlayers; }

/** link.c gWirelessCommType accessor. */
export function getWirelessCommType(): number { return wirelessCommType; }

/** link.c SetWirelessCommType1 helper. */
export function setWirelessCommTypeToRfu(): void { wirelessCommType = 1; }

export const linkTransport = {
  rawSendPacket(_mask: number, _src: Uint8Array, _size: number): void {},
  commDone(): boolean { return true; },
  isHost(): boolean { return true; },
  localPlayerId(): number { return 0; },
  otherPeersMask(): number { return 0; },
  recvStatus(): number { return 0; },
  clearRecvFlag(_who: number): void {},
  stepLinkState(): void {},
  cleanupRfu(): void {},
  initCommChannel(): void {},
  waitConnection(_taskId: number): void {},
};

/** link.c gBlockRecvBuffer. 4 players × BLOCK_BUFFER_SIZE/2 halfwords. */
const BLOCK_BUFFER_SIZE = 0x100;
export const gBlockRecvBuffer: Uint16Array[] = Array.from({ length: 4 }, () => new Uint16Array(BLOCK_BUFFER_SIZE / 2));

// ---------------------------------------------------------------------------
// overworld.c link key/facing helpers, generated with clang_codegen from the C
// body and given the C constant names. The link command handlers that call
// them (HandleLinkPlayerKeyInput, FacingHandler_*, SetKeyInterceptCallback
// users) are not ported, so no runtime path reaches these yet.
// ---------------------------------------------------------------------------

/** overworld.c enum LinkFacing (file-local in the C). */
export const FACING_NONE = 0;
export const FACING_UP = 1;
export const FACING_DOWN = 2;
export const FACING_LEFT = 3;
export const FACING_RIGHT = 4;
export const FACING_FORCED_UP = 7;
export const FACING_FORCED_DOWN = 8;
export const FACING_FORCED_LEFT = 9;
export const FACING_FORCED_RIGHT = 10;

/** overworld.c GetDirectionForDpadKey. */
export function GetDirectionForDpadKey(a1: number): number {
  switch (a1 & 0xffff) {
    case C.LINK_KEY_CODE_DPAD_RIGHT:
      return FACING_RIGHT;
    case C.LINK_KEY_CODE_DPAD_LEFT:
      return FACING_LEFT;
    case C.LINK_KEY_CODE_DPAD_UP:
      return FACING_UP;
    case C.LINK_KEY_CODE_DPAD_DOWN:
      return FACING_DOWN;
    default:
      return FACING_NONE;
  }
}

/** overworld.c FlipVerticalAndClearForced. */
export function FlipVerticalAndClearForced(newFacing: number, oldFacing: number): number {
  switch (newFacing & 0xff) {
    case FACING_UP:
    case FACING_FORCED_UP:
      return C.DIR_NORTH;
    case FACING_DOWN:
    case FACING_FORCED_DOWN:
      return C.DIR_SOUTH;
    case FACING_LEFT:
    case FACING_FORCED_LEFT:
      return C.DIR_WEST;
    case FACING_RIGHT:
    case FACING_FORCED_RIGHT:
      return C.DIR_EAST;
  }
  return oldFacing & 0xff;
}

/** overworld.c KeyInterCB_SendNothing. */
export function KeyInterCB_SendNothing(_key: number): number {
  return C.LINK_KEY_CODE_EMPTY;
}

/** overworld.c KeyInterCB_SendNothing_2 (duplicate of KeyInterCB_SendNothing in the C). */
export function KeyInterCB_SendNothing_2(_key: number): number {
  return C.LINK_KEY_CODE_EMPTY;
}
