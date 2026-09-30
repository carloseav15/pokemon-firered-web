// trainer_tower.c — records family: the sTrainerTowerState data block built from the local
// (e-Reader substitute) tower data, the saved record validation, and the time board printed
// by the battle records screen. Needs cdata "trainer_tower_sets" (preloadField) and
// "battle_message" (preloadBattleAssets), both loaded at boot.

import { STRING_VAR4_LENGTH, stringVars } from "./gba/stringBuffers";
import { ConvertEasyChatWordsToString } from "./easyChat";
import { encode } from "./gba/charmap";
import { GetStringWidth, FONT_NORMAL } from "./gba/font";
import { addBagItem } from "./pokemon/items";
import { CopyItemName } from "./hw/menuHelpers";
import { GetMonData, ZeroEnemyPartyMons, gEnemyParty, CreateBattleTowerMon, type BattleTowerPokemon, playerMon, type Mon } from "./pokemon/mon";
import { GetMonsStateToDoubles } from "./pokemon/scriptPokemonUtil";
import { SetVBlankCounter1Ptr, DisableVBlankCounter1 } from "./hw/runtime";
import { AddWindow, RemoveWindow, type WindowTemplate } from "./hw/window";
import { LoadStdWindowFrameGfx, DrawStdWindowFrame, ClearStdWindowAndFrameToTransparent } from "./hw/menu";
import { AddTextPrinterParameterized } from "./hw/text";
import { BattleSetup_GetBattleTowerBattleTransition } from "./battle/battleSetup";
import { sound } from "./audio/sound";
import { G } from "./battle/globals";
import { type ScriptRunner } from "./script/context";
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
import { save, SV, varGet, varSet, type TrainerTowerSave } from "./save";

/** trainer_tower.c struct TrainerTowerState. */
interface TrainerTowerState {
  floorIdx: number;
  data: EReaderTrainerTowerSet;
}

interface TrainerTowerOpponent {
  name: number[];
  speechWin: number[]; speechLose: number[]; speechWin2: number[]; speechLose2: number[];
  battleType: number; facilityClass: number; textColor: number;
}

/** trainer_tower.c static EWRAM_DATA struct TrainerTowerState * sTrainerTowerState. */
let sTrainerTowerState: TrainerTowerState | null = null;
let sTrainerTowerOpponent: TrainerTowerOpponent | null = null;
let sTrainerTowerResultsWindow = 0xff;

type TrainerTowerFunction = (ctx: ScriptRunner) => void;

function curFloor(): TrainerTowerFloor {
  return sTrainerTowerState!.data.floors[sTrainerTowerState!.floorIdx]!;
}

function floorTrainer(index: number) {
  return curFloor().trainers[index]!;
}

function setResult(value: number): void { varSet(SV.RESULT, value); }

function trainerInfo<T extends { facilityClass: number }>(challengeType: number): T[] {
  return cdata<T[]>("trainer_tower", challengeType === C.CHALLENGE_TYPE_DOUBLE ? "sDoubleBattleTrainerInfo" : "sSingleBattleTrainerInfo");
}

function trainerGender(challengeType: number, facilityClass: number, opponentIdx: number): number {
  if (challengeType === C.CHALLENGE_TYPE_KNOCKOUT) {
    const singles = cdata<Array<{ facilityClass: number; gender: number }>>("trainer_tower", "sSingleBattleTrainerInfo");
    return singles.find((item) => item.facilityClass === facilityClass)?.gender ?? C.MALE;
  }
  const table = trainerInfo<{ facilityClass: number; gender: number; gender1?: number; gender2?: number }>(challengeType);
  const row = table.find((item) => item.facilityClass === facilityClass);
  if (!row) return C.MALE;
  if (challengeType === C.CHALLENGE_TYPE_DOUBLE) return opponentIdx ? row.gender2 ?? C.MALE : row.gender1 ?? C.MALE;
  return row.gender ?? C.MALE;
}

function SetTrainerTowerTextColor(challengeType: number, facilityClass: number, opponentIdx = 0): void {
  varSet(SV.PREV_TEXT_COLOR, varGet(SV.TEXT_COLOR));
  varSet(SV.TEXT_COLOR, trainerGender(challengeType, facilityClass, opponentIdx));
}
function TrainerTowerGetOpponentTextColor(challengeType: number, facilityClass: number): void {
  SetTrainerTowerTextColor(challengeType, facilityClass, varGet(C.VAR_TEMP_3));
}

function convertTowerSpeech(words: readonly number[]): Uint8Array {
  let text = encode(ConvertEasyChatWordsToString(words, 3, 2));
  if (GetStringWidth(FONT_NORMAL, text, -1) > 196) {
    text = encode(ConvertEasyChatWordsToString(words, 2, 3));
    let i = 0;
    while (text[i++] !== C.CHAR_NEWLINE && i < text.length) { /* skip first line */ }
    while (text[i] !== C.CHAR_NEWLINE && i < text.length) i++;
    if (text[i] === C.CHAR_NEWLINE) text[i] = C.CHAR_PROMPT_SCROLL;
  }
  return text;
}
function TT_ConvertEasyChatMessageToString(words: readonly number[]): Uint8Array { return convertTowerSpeech(words); }

function BufferTowerOpponentSpeech(): void {
  const trainerId = varGet(SV.x8006);
  const kind = varGet(SV.x8005);
  const floor = curFloor();
  const facilityClass = floor.challengeType === C.CHALLENGE_TYPE_DOUBLE ? floor.trainers[0]!.facilityClass : floorTrainer(trainerId).facilityClass;
  switch (kind) {
    case C.TRAINER_TOWER_TEXT_INTRO: TrainerTowerGetOpponentTextColor(floor.challengeType, facilityClass); stringVars.var4 = TT_ConvertEasyChatMessageToString(floorTrainer(trainerId).speechBefore); break;
    case C.TRAINER_TOWER_TEXT_PLAYER_LOST: TrainerTowerGetOpponentTextColor(floor.challengeType, facilityClass); stringVars.var4 = TT_ConvertEasyChatMessageToString(floorTrainer(trainerId).speechWin); break;
    case C.TRAINER_TOWER_TEXT_PLAYER_WON: TrainerTowerGetOpponentTextColor(floor.challengeType, facilityClass); stringVars.var4 = TT_ConvertEasyChatMessageToString(floorTrainer(trainerId).speechLose); break;
    case C.TRAINER_TOWER_TEXT_AFTER: stringVars.var4 = TT_ConvertEasyChatMessageToString(floorTrainer(trainerId).speechAfter); break;
  }
}

const sSingleBattleChallengeMonIdxs = [[0,2],[1,3],[2,4],[3,5],[4,1],[5,2],[0,3],[1,4]];
const sDoubleBattleChallengeMonIdxs = [[0,1],[1,3],[2,0],[3,4],[4,2],[5,2],[0,3],[1,5]];
const sKnockoutChallengeMonIdxs = [[0,2,4],[1,3,5],[2,3,1],[3,4,0],[4,1,2],[5,0,3],[0,5,2],[1,4,5]];

function GetPartyMaxLevel(): number {
  let topLevel = 0;
  for (let i = 0; i < C.PARTY_SIZE; i++) {
    const mon = playerMon(i);
    if (GetMonData(mon, C.MON_DATA_SPECIES) !== C.SPECIES_NONE && GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG) !== C.SPECIES_EGG)
      topLevel = Math.max(topLevel, GetMonData(mon, C.MON_DATA_LEVEL));
  }
  return topLevel;
}

function BuildEnemyParty(): Mon[] {
  const trainerIdx = varGet(C.VAR_TEMP_1);
  const level = GetPartyMaxLevel();
  const floorIdx = currentTrainerTower().floorsCleared;
  ZeroEnemyPartyMons();
  const make = (slot: number, trainer: number, monIdx: number) => {
    const raw = floorTrainer(trainer).mons[monIdx] as Partial<BattleTowerPokemon>;
    raw.level = level;
    const src: BattleTowerPokemon = {
      species: raw.species ?? C.SPECIES_NONE, heldItem: raw.heldItem ?? C.ITEM_NONE,
      moves: raw.moves ?? [0, 0, 0, 0], level, ppBonuses: raw.ppBonuses ?? 0,
      hpEV: raw.hpEV ?? 0, attackEV: raw.attackEV ?? 0, defenseEV: raw.defenseEV ?? 0,
      speedEV: raw.speedEV ?? 0, spAttackEV: raw.spAttackEV ?? 0, spDefenseEV: raw.spDefenseEV ?? 0,
      otId: raw.otId ?? 0, hpIV: raw.hpIV ?? 0, attackIV: raw.attackIV ?? 0, defenseIV: raw.defenseIV ?? 0,
      speedIV: raw.speedIV ?? 0, spAttackIV: raw.spAttackIV ?? 0, spDefenseIV: raw.spDefenseIV ?? 0,
      abilityNum: raw.abilityNum ?? 0, personality: raw.personality ?? 0, nickname: raw.nickname ?? [C.EOS],
      friendship: raw.friendship ?? 0,
    };
    CreateBattleTowerMon(gEnemyParty[slot]!, src);
  };
  switch (curFloor().challengeType) {
    case C.CHALLENGE_TYPE_DOUBLE:
      make(0, 0, sDoubleBattleChallengeMonIdxs[floorIdx]![0]!);
      make(1, 1, sDoubleBattleChallengeMonIdxs[floorIdx]![1]!);
      break;
    case C.CHALLENGE_TYPE_KNOCKOUT:
      make(0, trainerIdx, sKnockoutChallengeMonIdxs[floorIdx]![trainerIdx]!);
      break;
    default:
      make(0, trainerIdx, sSingleBattleChallengeMonIdxs[floorIdx]![0]!);
      make(1, trainerIdx, sSingleBattleChallengeMonIdxs[floorIdx]![1]!);
      break;
  }
  // C writes the level into the loaded floor record; that record is recopied from ROM
  // whenever SetUpTrainerTowerDataStruct runs.
  return gEnemyParty.filter((mon) => mon.species !== C.SPECIES_NONE);
}

function InitTrainerTowerFloor(ctx: ScriptRunner): void {
  const layoutId = rom.mapIndex.layouts[GetCurrentFieldMap()?.header.layout ?? ""] ?? 0;
  if (layoutId - C.LAYOUT_TRAINER_TOWER_LOBBY > sTrainerTowerState!.data.numFloors) {
    setResult(3);
    ctx.ow.game.setMapLayoutIndex(C.LAYOUT_TRAINER_TOWER_ROOF);
    return;
  }
  setResult(curFloor().challengeType);
  const floorLayouts = cdata<number[][]>("trainer_tower", "sFloorLayouts");
  const nextLayout = floorLayouts[sTrainerTowerState!.floorIdx]![curFloor().challengeType]!;
  ctx.ow.game.setMapLayoutIndex(nextLayout);
  SetTrainerTowerNPCGraphics();
}

function SetTrainerTowerNPCGraphics(): void {
  const floor = curFloor();
  const singles = cdata<Array<{ objGfx: number; facilityClass: number }>>("trainer_tower", "sSingleBattleTrainerInfo");
  const doubles = cdata<Array<{ objGfx1: number; objGfx2: number; facilityClass: number }>>("trainer_tower", "sDoubleBattleTrainerInfo");
  const findSingle = (facilityClass: number) => singles.find((x) => x.facilityClass === facilityClass)?.objGfx ?? C.OBJ_EVENT_GFX_YOUNGSTER;
  if (floor.challengeType === C.CHALLENGE_TYPE_SINGLE) varSet(C.VAR_OBJ_GFX_ID_1, findSingle(floor.trainers[0]!.facilityClass));
  else if (floor.challengeType === C.CHALLENGE_TYPE_DOUBLE) {
    const row = doubles.find((x) => x.facilityClass === floor.trainers[0]!.facilityClass);
    varSet(C.VAR_OBJ_GFX_ID_0, row?.objGfx1 ?? C.OBJ_EVENT_GFX_YOUNGSTER);
    varSet(C.VAR_OBJ_GFX_ID_3, row?.objGfx2 ?? C.OBJ_EVENT_GFX_YOUNGSTER);
  } else if (floor.challengeType === C.CHALLENGE_TYPE_KNOCKOUT) {
    const vars = [C.VAR_OBJ_GFX_ID_2, C.VAR_OBJ_GFX_ID_0, C.VAR_OBJ_GFX_ID_1];
    for (let j = 0; j < C.MAX_TRAINERS_PER_FLOOR; j++) varSet(vars[j]!, findSingle(floor.trainers[j]!.facilityClass));
  }
}

function DoTrainerTowerBattle(ctx: ScriptRunner): void {
  const floor = curFloor();
  const double = floor.challengeType === C.CHALLENGE_TYPE_DOUBLE;
  const trainerId = varGet(C.VAR_TEMP_1);
  const trainer = floorTrainer(trainerId);
  const partner = floor.challengeType === C.CHALLENGE_TYPE_DOUBLE ? floorTrainer(trainerId + 1) : null;
  sTrainerTowerOpponent = {
    name: trainer.name.slice(0, 11), speechWin: trainer.speechWin, speechLose: trainer.speechLose,
    speechWin2: partner?.speechWin ?? [], speechLose2: partner?.speechLose ?? [],
    battleType: floor.challengeType, facilityClass: trainer.facilityClass, textColor: trainer.textColor,
  };
  G.gBattleTypeFlags = C.BATTLE_TYPE_TRAINER | C.BATTLE_TYPE_TRAINER_TOWER | (double ? C.BATTLE_TYPE_DOUBLE : 0);
  G.gTrainerBattleOpponent_A = 0;
  Task_DoTrainerTowerBattle(ctx, {
    kind: "trainer", trainerId: 0, enemyParty: BuildEnemyParty(), isDouble: double, isTrainerTower: true,
    music: 0, onEnd: (outcome) => { setResult(outcome); CB2_EndTrainerTowerBattle(ctx); },
  });
}

/** CB2_EndTrainerTowerBattle: Game.startBattle invokes this after its transition and cleanup. */
function CB2_EndTrainerTowerBattle(ctx: ScriptRunner): void {
  ctx.ow.game.returnToFieldContinueScript(true);
}

/** Task_DoTrainerTowerBattle: the generic battle host owns the transition task and battle callback. */
function Task_DoTrainerTowerBattle(ctx: ScriptRunner, request: Parameters<ScriptRunner["ow"]["game"]["startBattle"]>[0]): void {
  const transition = BattleSetup_GetBattleTowerBattleTransition();
  ctx.ow.game.startBattle({ ...request, transition });
}

function GetFloorAlreadyCleared(): void {
  const layout = rom.mapIndex.layouts[GetCurrentFieldMap()?.header.layout ?? ""] ?? 0;
  setResult(layout - C.LAYOUT_TRAINER_TOWER_1F === currentTrainerTower().floorsCleared
    && layout - C.LAYOUT_TRAINER_TOWER_LOBBY <= curFloor().floorIdx ? 0 : 1);
}
function TrainerTowerGetChallengeType(): void { if (!varGet(SV.x8005)) setResult(curFloor().challengeType); }
function TrainerTowerAddFloorCleared(): void { currentTrainerTower().floorsCleared = (currentTrainerTower().floorsCleared + 1) & 0xff; }

function StartTrainerTowerChallenge(): void {
  save.towerChallengeId = varGet(SV.x8005);
  if (save.towerChallengeId >= C.NUM_TOWER_CHALLENGE_TYPES) save.towerChallengeId = 0;
  ValidateOrResetCurTrainerTowerRecord();
  currentTrainerTower().validated = !ReadTrainerTowerAndValidate();
  currentTrainerTower().floorsCleared = 0;
  currentTrainerTower().timer = 0;
  currentTrainerTower().spokeToOwner = false;
  currentTrainerTower().checkedFinalTime = false;
  SetVBlankCounter1Ptr({ get value() { return currentTrainerTower().timer; }, set value(v: number) { currentTrainerTower().timer = v >>> 0; } });
}

function GetOwnerState(): void {
  DisableVBlankCounter1();
  setResult((currentTrainerTower().spokeToOwner ? 1 : 0) + (currentTrainerTower().receivedPrize && currentTrainerTower().checkedFinalTime ? 1 : 0));
  currentTrainerTower().spokeToOwner = true;
}
function TrainerTowerSetPlayerLost(): void { currentTrainerTower().hasLost = true; }
function GetTrainerTowerChallengeStatus(): void {
  const record = currentTrainerTower();
  if (record.hasLost) { record.hasLost = false; setResult(C.CHALLENGE_STATUS_LOST); }
  else if (record.unkA_4) { record.unkA_4 = false; setResult(C.CHALLENGE_STATUS_UNK); }
  else setResult(C.CHALLENGE_STATUS_NORMAL);
}

const sPrizeList = [C.ITEM_HP_UP,C.ITEM_PROTEIN,C.ITEM_IRON,C.ITEM_CARBOS,C.ITEM_CALCIUM,C.ITEM_ZINC,C.ITEM_BRIGHT_POWDER,C.ITEM_WHITE_HERB,C.ITEM_MENTAL_HERB,C.ITEM_CHOICE_BAND,C.ITEM_KINGS_ROCK,C.ITEM_SCOPE_LENS,C.ITEM_METAL_COAT,C.ITEM_DRAGON_SCALE,C.ITEM_UP_GRADE];
function GiveChallengePrize(): void {
  const itemId = sPrizeList[sTrainerTowerState!.data.floors[0]!.prize]!;
  if (currentTrainerTower().receivedPrize) setResult(2);
  else if (addBagItem(itemId, 1)) { stringVars.var2 = CopyItemName(itemId); currentTrainerTower().receivedPrize = true; setResult(0); }
  else setResult(1);
}

function CheckFinalTime(): void {
  if (currentTrainerTower().checkedFinalTime) setResult(2);
  else if (GetTrainerTowerRecordTime(bestTimeRef(currentChallenge())) > currentTrainerTower().timer) {
    SetTrainerTowerRecordTime(bestTimeRef(currentChallenge()), currentTrainerTower().timer); setResult(0);
  } else setResult(1);
  currentTrainerTower().checkedFinalTime = true;
}

function TrainerTowerResumeTimer(): void {
  if (!currentTrainerTower().spokeToOwner) {
    if (currentTrainerTower().timer >= C.TRAINER_TOWER_MAX_TIME) currentTrainerTower().timer = C.TRAINER_TOWER_MAX_TIME;
    else SetVBlankCounter1Ptr({ get value() { return currentTrainerTower().timer; }, set value(v: number) { currentTrainerTower().timer = v >>> 0; } });
  }
}

function GetCurrentTime(): void {
  if (currentTrainerTower().timer >= C.TRAINER_TOWER_MAX_TIME) { DisableVBlankCounter1(); currentTrainerTower().timer = C.TRAINER_TOWER_MAX_TIME; }
  PrintTowerTime(currentTrainerTower().timer);
}
function TrainerTowerGetDoublesEligiblity(): void { setResult(GetMonsStateToDoubles()); }
function TrainerTowerGetNumFloors(): void {
  if (sTrainerTowerState!.data.numFloors !== sTrainerTowerState!.data.floors[0]!.floorIdx) {
    stringVars.var1 = intStringVar(sTrainerTowerState!.data.numFloors, C.STR_CONV_MODE_LEFT_ALIGN, 32); setResult(1);
  } else setResult(0);
}
function ShouldWarpToCounter(): void { setResult(0); }
function HasSpokenToOwner(): void { setResult(currentTrainerTower().spokeToOwner ? 1 : 0); }

function ShowResultsBoard(): void {
  ValidateOrResetCurTrainerTowerRecord();
  const templates = cdata<WindowTemplate[]>("trainer_tower", "sTimeBoardWindowTemplate");
  sTrainerTowerResultsWindow = AddWindow(templates[0]!);
  LoadStdWindowFrameGfx(); DrawStdWindowFrame(sTrainerTowerResultsWindow, false);
  AddTextPrinterParameterized(sTrainerTowerResultsWindow, C.FONT_NORMAL, rom.text("gText_TimeBoard"), 74, 0, C.TEXT_SKIP_DRAW, null);
  for (let i = 0; i < C.NUM_TOWER_CHALLENGE_TYPES; i++) {
    PrintTowerTime(GetTrainerTowerRecordTime(bestTimeRef(i)));
    const time = new Uint8Array(STRING_VAR4_LENGTH); StringExpandPlaceholders(time, rom.text("gText_XMinYZSec")); stringVars.var4 = time;
    AddTextPrinterParameterized(sTrainerTowerResultsWindow, C.FONT_NORMAL, challengeTypeText(i), 24, 36 + 20 * i, C.TEXT_SKIP_DRAW, null);
    AddTextPrinterParameterized(sTrainerTowerResultsWindow, C.FONT_NORMAL, time, 96, 46 + 20 * i, C.TEXT_SKIP_DRAW, null);
  }
  PutWindowTilemap(sTrainerTowerResultsWindow); CopyWindowToVram(sTrainerTowerResultsWindow, C.COPYWIN_FULL); varSet(C.VAR_TEMP_1, sTrainerTowerResultsWindow);
}

function CloseResultsBoard(): void {
  const windowId = varGet(C.VAR_TEMP_1); ClearStdWindowAndFrameToTransparent(windowId, true); RemoveWindow(windowId); sTrainerTowerResultsWindow = 0xff;
}

function PlayTrainerTowerEncounterMusic(): void {
  const trainerIdx = varGet(C.VAR_TEMP_1);
  const facilityClass = floorTrainer(trainerIdx).facilityClass;
  const trainerClass = cdata<number[]>("pokemon", "gFacilityClassToTrainerClass")[facilityClass]!;
  const lut = cdata<Array<{ facilityClass: number; musicId: number }>>("trainer_tower", "sTrainerEncounterMusicLUT");
  const musicId = lut.find((row) => row.facilityClass === trainerClass)?.musicId ?? 0;
  const songs = cdata<number[]>("trainer_tower", "sTrainerTowerEncounterMusic"); sound.playNewMapMusic(songs[musicId]!);
}

/** CallTrainerTowerFunc (trainer_tower.c): dispatch by VAR_0x8004, with shared setup/free lifetime. */
export function CallTrainerTowerFunc(ctx: ScriptRunner): void {
  SetUpTrainerTowerDataStruct();
  const handlers: TrainerTowerFunction[] = [
    InitTrainerTowerFloor, BufferTowerOpponentSpeech, DoTrainerTowerBattle,
    TrainerTowerGetChallengeType, TrainerTowerAddFloorCleared, GetFloorAlreadyCleared,
    StartTrainerTowerChallenge, GetOwnerState, GiveChallengePrize, CheckFinalTime,
    TrainerTowerResumeTimer, TrainerTowerSetPlayerLost, GetTrainerTowerChallengeStatus,
    GetCurrentTime, ShowResultsBoard, CloseResultsBoard, TrainerTowerGetDoublesEligiblity,
    TrainerTowerGetNumFloors, ShouldWarpToCounter, PlayTrainerTowerEncounterMusic, HasSpokenToOwner,
  ];
  try { handlers[varGet(SV.x8004)]?.(ctx); }
  finally { FreeTrainerTowerDataStruct(); }
}

export function GetTrainerTowerOpponentClass(): number {
  return cdata<number[]>("pokemon", "gFacilityClassToTrainerClass")[sTrainerTowerOpponent?.facilityClass ?? 0] ?? 0;
}
export function GetTrainerTowerOpponentPic(): number {
  return cdata<number[]>("pokemon", "gFacilityClassToPicIndex")[sTrainerTowerOpponent?.facilityClass ?? 0] ?? 0;
}
export function GetTrainerTowerTrainerFrontSpriteId(): number { return GetTrainerTowerOpponentPic(); }
export function GetTrainerTowerOpponentGender(): number {
  return sTrainerTowerOpponent ? trainerGender(sTrainerTowerOpponent.battleType, sTrainerTowerOpponent.facilityClass, varGet(C.VAR_TEMP_3)) : C.MALE;
}
export function GetTrainerTowerOpponentName(): Uint8Array { return Uint8Array.from([...(sTrainerTowerOpponent?.name ?? []), C.EOS]); }
export function InitTrainerTowerBattleStruct(): void {
  SetUpTrainerTowerDataStruct();
  const trainer = floorTrainer(varGet(C.VAR_TEMP_1));
  const trainerId = varGet(C.VAR_TEMP_1);
  const partner = curFloor().challengeType === C.CHALLENGE_TYPE_DOUBLE ? floorTrainer(trainerId + 1) : null;
  sTrainerTowerOpponent = { name: trainer.name.slice(0, 11), speechWin: [...trainer.speechWin], speechLose: [...trainer.speechLose], speechWin2: [...(partner?.speechWin ?? [])], speechLose2: [...(partner?.speechLose ?? [])], battleType: curFloor().challengeType, facilityClass: trainer.facilityClass, textColor: trainer.textColor };
  SetVBlankCounter1Ptr({ get value() { return currentTrainerTower().timer; }, set value(v: number) { currentTrainerTower().timer = v >>> 0; } });
  FreeTrainerTowerDataStruct();
}
export function FreeTrainerTowerBattleStruct(): void { sTrainerTowerOpponent = null; }
export function GetTrainerTowerOpponentWinText(opponentIdx: number): Uint8Array {
  if (!sTrainerTowerOpponent) return new Uint8Array([C.EOS]);
  varSet(C.VAR_TEMP_3, opponentIdx); SetTrainerTowerTextColor(sTrainerTowerOpponent.battleType, sTrainerTowerOpponent.facilityClass, opponentIdx);
  return convertTowerSpeech(opponentIdx ? sTrainerTowerOpponent.speechWin2 : sTrainerTowerOpponent.speechWin);
}
export function GetTrainerTowerOpponentLoseText(opponentIdx: number): Uint8Array {
  if (!sTrainerTowerOpponent) return new Uint8Array([C.EOS]);
  varSet(C.VAR_TEMP_3, opponentIdx); SetTrainerTowerTextColor(sTrainerTowerOpponent.battleType, sTrainerTowerOpponent.facilityClass, opponentIdx);
  return convertTowerSpeech(opponentIdx ? sTrainerTowerOpponent.speechLose2 : sTrainerTowerOpponent.speechLose);
}

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
