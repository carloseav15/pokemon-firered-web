// trainer_tower.c — records family: the sTrainerTowerState data block built from the local
// (e-Reader substitute) tower data, the saved record validation, and the time board printed
// by the battle records screen. Needs cdata "trainer_tower_sets" (preloadField) and
// "battle_message" (preloadBattleAssets), both loaded at boot.

import { STRING_VAR4_LENGTH, stringVars } from "./gba/stringBuffers";
import {
  CEReaderTool_LoadTrainerTower,
  ReadTrainerTowerAndValidate,
  type EReaderTrainerTowerSet,
  type EReaderTrainerTowerSetSubstruct,
  type TrainerTowerFloor,
} from "./cereaderTool";
import { GetCurrentFieldMap } from "./field/fieldmap";
import * as C from "./generated/constants";
import { ConvertIntToDecimalStringN, StringExpandPlaceholders } from "./generated/stringUtil";
import { cdata, symName } from "./hw/assets";
import { AddTextPrinterParameterized3 } from "./hw/text";
import { CopyWindowToVram, FillWindowPixelRect, PIXEL_FILL, PutWindowTilemap } from "./hw/window";
import { rom } from "./rom";
import { save, type TrainerTowerSave } from "./save";

/** trainer_tower.c struct TrainerTowerState. */
interface TrainerTowerState {
  floorIdx: number;
  data: EReaderTrainerTowerSet;
}

/** trainer_tower.c static EWRAM_DATA struct TrainerTowerState * sTrainerTowerState. */
let sTrainerTowerState: TrainerTowerState | null = null;

/** trainer_tower.c static const u8 sTextColors[]. */
const sTextColors = [C.TEXT_COLOR_TRANSPARENT, C.TEXT_COLOR_DARK_GRAY, C.TEXT_COLOR_LIGHT_GRAY];

/** gSaveBlock1Ptr->towerChallengeId. */
function currentChallenge(): number {
  return save.towerChallengeId;
}

/** gSaveBlock1Ptr->trainerTower[challengeType]. */
function trainerTowerRecord(challengeType: number): TrainerTowerSave {
  return save.trainerTower[challengeType];
}

/** trainer_tower.c `TRAINER_TOWER` (gSaveBlock1Ptr->trainerTower[gSaveBlock1Ptr->towerChallengeId]). */
function currentTrainerTower(): TrainerTowerSave {
  return trainerTowerRecord(currentChallenge());
}

/** &gSaveBlock1Ptr->trainerTower[challengeType].bestTime: the u32 * counter, boxed like the
 *  counter passed to SetVBlankCounter1Ptr so the XOR helpers can read and write it in place. */
function bestTimeRef(challengeType: number): { value: number } {
  const record = trainerTowerRecord(challengeType);
  return {
    get value(): number {
      return record.bestTime;
    },
    set value(value: number) {
      record.bestTime = value;
    },
  };
}

/** trainer_tower.c gTrainerTowerFloors[challengeType]: every exported row holds its eight
 *  floor pointers in table order (the JSON reuses the TrainerTowerFloor field names for the
 *  pointer slots). */
function challengeTypeFloors(challengeType: number): TrainerTowerFloor[] {
  const row = cdata<Array<Record<string, unknown>>>("trainer_tower_sets", "gTrainerTowerFloors")[challengeType];
  return Object.values(row).map((ref) => cdata<TrainerTowerFloor>("trainer_tower_sets", symName(ref)!));
}

/** trainer_tower.c SetUpTrainerTowerDataStruct's CalcByteArraySum(floors, sizeof(floors)).
 *  The export carries no raw struct bytes: a floor's bytes [0, 0x3DC) sum to its static
 *  .checksum (the same invariant ValidateTrainerTowerTrainer checks) and [0x3DC, 0x3E0) are
 *  that u32 stored little-endian, so the 8 x 0x3E0 sum follows from those two parts. */
function floorsChecksum(floors: TrainerTowerFloor[]): number {
  let sum = 0;
  for (const floor of floors) {
    const checksum = floor.checksum >>> 0;
    const tail = (checksum & 0xff) + ((checksum >>> 8) & 0xff) + ((checksum >>> 16) & 0xff) + ((checksum >>> 24) & 0xff);
    sum = (sum + checksum + tail) >>> 0;
  }
  return sum;
}

/** gTrainerTowerChallengeTypeTexts[challengeType] (battle_message.c string pointers). */
function challengeTypeText(challengeType: number): Uint8Array {
  const ref = cdata<unknown[]>("battle_message", "gTrainerTowerChallengeTypeTexts")[challengeType];
  return rom.text(symName(ref)!);
}

/** trainer_tower.c static u32 GetTrainerTowerRecordTime(u32 *counter). */
function GetTrainerTowerRecordTime(counter: { value: number }): number {
  return (counter.value ^ save.encryptionKey) >>> 0;
}

/** trainer_tower.c static void SetTrainerTowerRecordTime(u32 *counter, u32 value). */
function SetTrainerTowerRecordTime(counter: { value: number }, value: number): void {
  counter.value = (value ^ save.encryptionKey) >>> 0;
}

/** ConvertIntToDecimalStringN writing into a fresh buffer of the C gStringVarN capacity
 *  (string_util.c: gStringVar1[32], gStringVar2[20], gStringVar3[20]); the port assigns the
 *  whole buffer to stringVars instead of writing a fixed BSS array in place. */
function intStringVar(value: number, mode: number, capacity: number): Uint8Array {
  const buffer = new Uint8Array(capacity);
  ConvertIntToDecimalStringN(buffer, value, mode, 2);
  return buffer;
}

/** trainer_tower.c PRINT_TOWER_TIME: frame count split into gStringVar1/2/3 as mm, ss and cc. */
function PrintTowerTime(src: number): void {
  let frames = src | 0;
  const minutes = Math.trunc(frames / (60 * 60));
  frames %= 60 * 60;
  const seconds = Math.trunc(frames / 60);
  frames %= 60;
  const centiseconds = Math.trunc((frames * 168) / 100);
  stringVars.var1 = intStringVar(minutes, C.STR_CONV_MODE_RIGHT_ALIGN, 32);
  stringVars.var2 = intStringVar(seconds, C.STR_CONV_MODE_RIGHT_ALIGN, 20);
  stringVars.var3 = intStringVar(centiseconds, C.STR_CONV_MODE_LEADING_ZEROS, 20);
}

/** trainer_tower.c static void SetUpTrainerTowerDataStruct. */
function SetUpTrainerTowerDataStruct(): void {
  const challengeType = currentChallenge();
  const map = GetCurrentFieldMap();
  const mapLayoutId = map ? (rom.mapIndex.layouts[map.header.layout] ?? 0) : 0;
  const state: TrainerTowerState = {
    // u8 floorIdx: gMapHeader.mapLayoutId - LAYOUT_TRAINER_TOWER_1F wraps like the C assignment.
    floorIdx: (mapLayoutId - C.LAYOUT_TRAINER_TOWER_1F) & 0xff,
    // AllocZeroed: the data set starts zeroed before either branch fills it.
    data: { numFloors: 0, id: 0, dummy: 0, checksum: 0, floors: [] },
  };
  sTrainerTowerState = state;
  if (ReadTrainerTowerAndValidate()) {
    CEReaderTool_LoadTrainerTower(state.data);
    return;
  }
  const header = cdata<EReaderTrainerTowerSetSubstruct>("trainer_tower_sets", "gTrainerTowerLocalHeader");
  state.data.numFloors = header.numFloors;
  state.data.id = header.id;
  state.data.dummy = header.dummy ?? 0;
  state.data.checksum = header.checksum ?? 0;
  const floors_p = challengeTypeFloors(challengeType);
  for (let i = 0; i < C.MAX_TRAINER_TOWER_FLOORS; i++) {
    state.data.floors[i] = structuredClone(floors_p[i]);
  }
  state.data.checksum = floorsChecksum(state.data.floors);
  ValidateOrResetCurTrainerTowerRecord();
}

/** trainer_tower.c static void FreeTrainerTowerDataStruct (FREE_AND_SET_NULL). */
function FreeTrainerTowerDataStruct(): void {
  sTrainerTowerState = null;
}

/** trainer_tower.c static void ValidateOrResetCurTrainerTowerRecord. */
function ValidateOrResetCurTrainerTowerRecord(): void {
  const record = currentTrainerTower();
  const data = sTrainerTowerState!.data;
  if (record.unk9 !== data.id) {
    record.unk9 = data.id;
    SetTrainerTowerRecordTime(bestTimeRef(currentChallenge()), C.TRAINER_TOWER_MAX_TIME);
    record.receivedPrize = false;
  }
}

/** trainer_tower.c void PrintTrainerTowerRecords. */
export function PrintTrainerTowerRecords(): void {
  const windowId = 0;
  SetUpTrainerTowerDataStruct();
  FillWindowPixelRect(0, PIXEL_FILL(0), 0, 0, 216, 144);
  ValidateOrResetCurTrainerTowerRecord();
  AddTextPrinterParameterized3(0, C.FONT_NORMAL, 0x4a, 0, sTextColors, 0, rom.text("gText_TimeBoard"));
  for (let i = 0; i < C.NUM_TOWER_CHALLENGE_TYPES; i++) {
    PrintTowerTime(GetTrainerTowerRecordTime(bestTimeRef(i)));
    const time = new Uint8Array(STRING_VAR4_LENGTH);
    StringExpandPlaceholders(time, rom.text("gText_XMinYZSec"));
    stringVars.var4 = time;
    AddTextPrinterParameterized3(windowId, C.FONT_NORMAL, 0x18, 0x24 + 0x14 * i, sTextColors, 0, challengeTypeText(i));
    AddTextPrinterParameterized3(windowId, C.FONT_NORMAL, 0x60, 0x24 + 0x14 * i, sTextColors, 0, time);
  }
  PutWindowTilemap(windowId);
  CopyWindowToVram(windowId, C.COPYWIN_FULL);
  FreeTrainerTowerDataStruct();
}

/** trainer_tower.c void ResetTrainerTowerResults (called by new_game.c NewGameInitData). */
export function ResetTrainerTowerResults(): void {
  for (let i = 0; i < C.NUM_TOWER_CHALLENGE_TYPES; i++) {
    SetTrainerTowerRecordTime(bestTimeRef(i), C.TRAINER_TOWER_MAX_TIME);
  }
}
