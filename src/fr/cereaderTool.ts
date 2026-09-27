// cereader_tool.c: validation and save/load sector routines for e-Reader Trainer Tower sets.
import * as C from "./generated/constants";
import { save } from "./save";

export const SEC30_SIZE = 0xfa4;
export const SEC31_SIZE = 0x344;
export const SECTOR_SIZE = 4096;

export interface TrainerTowerTrainer {
  name: number[];
  facilityClass: number;
  textColor: number;
  speechBefore: number[];
  speechWin: number[];
  speechLose: number[];
  speechAfter: number[];
  mons: any[];
}

export interface TrainerTowerFloor {
  id: number;
  floorIdx: number;
  challengeType: number;
  prize: number;
  trainers: TrainerTowerTrainer[];
  checksum: number;
  rawBytes?: Uint8Array;
}

export interface EReaderTrainerTowerSet {
  numFloors: number;
  id: number;
  dummy: number;
  checksum: number;
  floors: TrainerTowerFloor[];
  rawFloorsBytes?: Uint8Array;
}

export function CalcByteArraySum(data: Uint8Array | number[]): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) >>> 0;
  }
  return sum;
}

let sTrainerTowerSaveSector1 = new Uint8Array(SECTOR_SIZE);
let sTrainerTowerSaveSector2 = new Uint8Array(SECTOR_SIZE);
let sLoadedTrainerTowerSet: EReaderTrainerTowerSet | null = null;

/** GetTrainerHillUnkVal (cereader_tool.c). */
export function GetTrainerHillUnkVal(): number {
  const tower = (save as unknown as { trainerTower?: Array<{ unk9?: number }> }).trainerTower;
  const unk9 = tower?.[0]?.unk9 ?? 0;
  return (unk9 + 1) % 256;
}

/** ValidateTrainerTowerTrainer (cereader_tool.c). */
export function ValidateTrainerTowerTrainer(floor: TrainerTowerFloor): boolean {
  if (floor.floorIdx < 1 || floor.floorIdx > C.MAX_TRAINER_TOWER_FLOORS) return false;
  if (floor.challengeType > C.CHALLENGE_TYPE_KNOCKOUT) return false;
  if (floor.rawBytes) {
    const sum = CalcByteArraySum(floor.rawBytes.subarray(0, 0x3dc));
    if (sum !== floor.checksum) return false;
  }
  return true;
}

/** ValidateTrainerTowerData (cereader_tool.c). */
export function ValidateTrainerTowerData(ttdata: EReaderTrainerTowerSet): boolean {
  const numFloors = ttdata.numFloors;
  if (numFloors < 1 || numFloors > C.MAX_TRAINER_TOWER_FLOORS) return false;
  for (let i = 0; i < numFloors; i++) {
    if (!ValidateTrainerTowerTrainer(ttdata.floors[i])) return false;
  }
  if (ttdata.rawFloorsBytes) {
    const sum = CalcByteArraySum(ttdata.rawFloorsBytes);
    if (sum !== ttdata.checksum) return false;
  }
  return true;
}

/** CEReaderTool_SaveTrainerTower_r (cereader_tool.c). */
export function CEReaderTool_SaveTrainerTower_r(ttdata: EReaderTrainerTowerSet, buffer: Uint8Array): boolean {
  buffer.fill(0);
  buffer[1] = GetTrainerHillUnkVal();
  sTrainerTowerSaveSector1.set(buffer.subarray(0, SECTOR_SIZE));
  sLoadedTrainerTowerSet = ttdata;
  return true;
}

/** CEReaderTool_SaveTrainerTower (cereader_tool.c). */
export function CEReaderTool_SaveTrainerTower(ttdata: EReaderTrainerTowerSet): boolean {
  const buffer = new Uint8Array(SECTOR_SIZE);
  return CEReaderTool_SaveTrainerTower_r(ttdata, buffer);
}

/** CEReaderTool_LoadTrainerTower_r (cereader_tool.c). */
export function CEReaderTool_LoadTrainerTower_r(ttdata: EReaderTrainerTowerSet, _buffer: Uint8Array): boolean {
  if (!sLoadedTrainerTowerSet) return false;
  Object.assign(ttdata, sLoadedTrainerTowerSet);
  if (!ValidateTrainerTowerData(ttdata)) return false;
  return true;
}

/** CEReaderTool_LoadTrainerTower (cereader_tool.c). */
export function CEReaderTool_LoadTrainerTower(ttdata: EReaderTrainerTowerSet): boolean {
  const buffer = new Uint8Array(SECTOR_SIZE);
  return CEReaderTool_LoadTrainerTower_r(ttdata, buffer);
}

/** ReadTrainerTowerAndValidate (cereader_tool.c). */
export function ReadTrainerTowerAndValidate(): boolean {
  // Stubbed out in FireRed C. Populated in Emerald.
  return false;
}
