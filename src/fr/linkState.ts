// link.c / overworld.c: source-shaped receive-queue and link-session state.
// The browser has no cable/RFU transport yet. The future transport adapter
// feeds complete per-frame player command rows through ReceiveLinkCommand and
// registers the exact CB1 callback it installs in gMain.

import { gMain, type MainCallback } from "./hw/runtime";

const CMD_LENGTH = 8; // link.h
const QUEUE_CAPACITY = 50; // link.h
const OVERWORLD_RECV_QUEUE_MAX = 3; // link.h

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

/** Reset link adapter state when a cable/RFU session closes. */
export function ResetLinkState(): void {
  cableRecvQueue.clear();
  rfuRecvQueue.clear();
  wirelessCommType = 0;
  receivedRemoteLinkPlayers = 0;
  linkStateUpdateCallback = null;
  sReceivingFromLink = false;
}
