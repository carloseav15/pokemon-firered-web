// More gSpecials entries, each ported from its home file: field_specials.c,
// pokemon_size_record.c, party_menu_specials.c, berry_powder.c,
// trainer_fan_club.c, field_tasks.c, ss_anne.c, special_field_anim.c,
// script_menu.c and the link/record stubs of cable_club.c (no link hardware:
// every link attempt reports LINKUP_CONNECTION_ERROR, as an unplugged cable does).

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { concat, encode, expandPlaceholders, intToDecimal, stringVars, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "../gba/charmap";
import { FONT_SMALL } from "../gba/font";
import { tasks } from "../gba/tasks";
import { printText } from "../gba/textPrinter";
import { Window } from "../gba/window";
import { cdata, incbin } from "../hw/assets";
import { BG_PLTT_ID } from "../hw/palette";
import { random } from "../random";
import { rom } from "../rom";
import { flagClear, flagGet, flagSet, GetGameStat, save, SV, varGet, varSet } from "../save";
import { Sprite } from "../gba/sprite";
import { MAP_OFFSET, MAPGRID_COLLISION_MASK } from "../field/fieldmap";
import { rgb555, spriteSheet } from "../field/gfx4bpp";
import { adjustFriendship, getDexFlag, leadMonIndex, nickname, speciesName, type Pokemon } from "../pokemon/pokemon";
import { GetPokedexHeightWeight } from "../battle/ext";
import { setFlavorTextFlagFromSpecialVars, updatePickStateFromSpecialVar8005 } from "../menus/keyItemScreens";
import { SetPostgameFlags } from "../pokemon/saveLocation";
import { CheckPartyMonHasHeldItem } from "../pokemon/scriptPokemonUtil";
import { HasAtLeastOneBerry as Item_HasAtLeastOneBerry } from "../pokemon/items";
import { GetBerryNameByBerryType, ItemIdToBerryType } from "../pokemon/berry";
import { getBoxName, getPCBoxToSendMon, shouldShowBoxWasFullMessage } from "../pokemon/storage";
import { CalculatePlayerPartyCount, GetMonData, gPPUpGetMask, playerMon, RemoveMonPPBonus, SetMonData, SetMonMoveSlot, type Mon } from "../pokemon/mon";
import { SpeciesToMailSpecies } from "../pokemon/mail";
import type { ScriptRunner } from "./context";

type Special = (ctx: ScriptRunner) => number | void;

/** ScriptContext_Enable from a task on the next frame (after the script's waitstate). */
function enableLater(ctx: ScriptRunner, frames = 1): void {
  let n = frames;
  const id = tasks.create(() => {
    if (--n > 0) return;
    tasks.destroy(id);
    ctx.ow.script.ScriptContext_Enable();
  }, 80);
}

/** party_menu_specials.c ShiftMoveSlot: move and PP Up bits travel with a move. */
function ShiftMoveSlot(mon: (typeof save.party)[number], slotTo: number, slotFrom: number): void {
  const moveTo = mon.moves[slotTo], moveFrom = mon.moves[slotFrom];
  const ppTo = mon.pp[slotTo], ppFrom = mon.pp[slotFrom];
  const bonusTo = (mon.ppBonuses & gPPUpGetMask[slotTo]) >> (slotTo * 2);
  const bonusFrom = (mon.ppBonuses & gPPUpGetMask[slotFrom]) >> (slotFrom * 2);
  mon.ppBonuses &= ~gPPUpGetMask[slotTo];
  mon.ppBonuses &= ~gPPUpGetMask[slotFrom];
  mon.ppBonuses |= (bonusTo << (slotFrom * 2)) + (bonusFrom << (slotTo * 2));
  mon.moves[slotTo] = moveFrom;
  mon.moves[slotFrom] = moveTo;
  mon.pp[slotTo] = ppFrom;
  mon.pp[slotFrom] = ppTo;
}

/** UpdateTrainerCardPhotoIcons (field_specials.c). */
function UpdateTrainerCardPhotoIcons(): void {
  const iconVars = [
    C.VAR_TRAINER_CARD_MON_ICON_1,
    C.VAR_TRAINER_CARD_MON_ICON_2,
    C.VAR_TRAINER_CARD_MON_ICON_3,
    C.VAR_TRAINER_CARD_MON_ICON_4,
    C.VAR_TRAINER_CARD_MON_ICON_5,
    C.VAR_TRAINER_CARD_MON_ICON_6,
  ];
  const partyCount = CalculatePlayerPartyCount();
  for (let i = 0; i < iconVars.length; i++) {
    let species = C.SPECIES_NONE;
    let personality = 0;
    if (i < partyCount) {
      const mon = playerMon(i);
      species = GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG);
      personality = GetMonData(mon, C.MON_DATA_PERSONALITY);
    }
    varSet(iconVars[i], SpeciesToMailSpecies(species, personality));
  }
  varSet(C.VAR_TRAINER_CARD_MON_ICON_TINT_IDX, varGet(SV.x8004));
}

const LINKUP_CONNECTION_ERROR = 6;
const mapIs = (name: string): boolean => {
  const num = rom.c(name);
  return save.location.mapGroup === num >> 8 && save.location.mapNum === (num & 0xff);
};
const playTimeHours = (): number => Math.floor(save.playTimeFrames / 60 / 3600);

// ---------------------------------------------------------------- pokemon_size_record.c

const sBigMonSizeTable = [
  [290, 1, 0], [300, 1, 10], [400, 2, 110], [500, 4, 310], [600, 20, 710], [700, 50, 2710], [800, 100, 7710], [900, 150, 17710],
  [1000, 150, 32710], [1100, 100, 47710], [1200, 50, 57710], [1300, 20, 62710], [1400, 5, 64710], [1500, 2, 65210], [1600, 1, 65410], [1700, 1, 65510],
];

function GetMonSizeHash(mon: Pokemon): number {
  const p = mon.personality & 0xffff;
  const iv = (i: number) => (mon.ivs[i] ?? 0) & 0xf;
  // ivs: [hp, atk, def, speed, spatk, spdef]
  const hibyte = (((iv(1) ^ iv(2)) * iv(0)) ^ (p & 0xff)) >>> 0;
  const lobyte = (((iv(4) ^ iv(5)) * iv(3)) ^ (p >> 8)) >>> 0;
  return ((hibyte << 8) + lobyte) & 0xffff;
}

function TranslateBigMonSizeTableIndex(size: number): number {
  for (let i = 1; i < 15; i++) if ((size & 0xffff) < sBigMonSizeTable[i][2]) return i - 1;
  return 15;
}

function GetMonSize(species: number, b: number): number {
  const height = GetPokedexHeightWeight(rom.species[species].national, 0);
  const index = TranslateBigMonSizeTableIndex(b);
  const [base, div, start] = sBigMonSizeTable[index];
  const unk0 = base + Math.trunc(((b & 0xffff) - start) / div);
  return Math.trunc((height * unk0) / 10) >>> 0;
}

/** FormatMonSizeRecord (UNITS_IMPERIAL from include/config.h). */
function FormatMonSizeRecord(size: number): Uint8Array {
  const inches = Math.trunc(((size >>> 0) * 100) / 254) >>> 0;
  return concat(intToDecimal(Math.trunc(inches / 10), STR_CONV_MODE_LEFT_ALIGN, 8), rom.text("gText_DecimalPoint"),
    intToDecimal(inches % 10, STR_CONV_MODE_LEFT_ALIGN, 1));
}

function CompareMonSize(species: number, recordVar: number): number {
  const index = varGet(SV.RESULT);
  if (index >= 6) return 0;
  const mon = save.party[index];
  if (!mon || mon.isEgg || mon.species !== species) return 1;
  const params = GetMonSizeHash(mon);
  const newSize = GetMonSize(species, params);
  const oldSize = GetMonSize(species, varGet(recordVar));
  stringVars.var3 = FormatMonSizeRecord(oldSize);
  stringVars.var2 = FormatMonSizeRecord(newSize);
  if (newSize === oldSize) return 4;
  if (newSize < oldSize) return 2;
  varSet(recordVar, params);
  return 3;
}

function GetMonSizeRecordInfo(species: number, recordVar: number): void {
  stringVars.var3 = FormatMonSizeRecord(GetMonSize(species, varGet(recordVar)));
  stringVars.var1 = speciesName(species);
}

const sGiftRibbonsMonDataIds = [C.MON_DATA_MARINE_RIBBON, C.MON_DATA_LAND_RIBBON, C.MON_DATA_SKY_RIBBON,
  C.MON_DATA_COUNTRY_RIBBON, C.MON_DATA_NATIONAL_RIBBON, C.MON_DATA_EARTH_RIBBON, C.MON_DATA_WORLD_RIBBON];

/** mystery_event_script.c MEScrCmd_giveribbon → pokemon_size_record.c. */
export function GiveGiftRibbonToParty(index: number, ribbonId: number): void {
  index &= 0xff;
  ribbonId &= 0xff;
  if (index >= C.GIFT_RIBBONS_COUNT || ribbonId >= 65) return;
  const block = save as unknown as { giftRibbons?: number[] };
  block.giftRibbons ??= new Array(C.GIFT_RIBBONS_COUNT).fill(0);
  block.giftRibbons[index] = ribbonId & 0xff;
  // The C stack array is seven entries but its guard allows indices through 10.
  // The seven defined entries are deterministic; higher indices read beyond it.
  const monDataId = sGiftRibbonsMonDataIds[index];
  if (monDataId === undefined) return;
  let gotRibbon = false;
  for (const mon of save.party as Mon[]) {
    if (mon.species === C.SPECIES_NONE || mon.isEgg) continue;
    SetMonData(mon, monDataId, 1);
    gotRibbon = true;
  }
  if (gotRibbon) flagSet(C.FLAG_SYS_RIBBON_GET);
}

// ---------------------------------------------------------------- trainer_fan_club.c

type TrainerFanClubData = { timer: number; gotInitialFans: boolean; fanFlags: number };

function fanClub(): TrainerFanClubData {
  const value = varGet(C.VAR_FANCLUB_FAN_COUNTER);
  return { timer: value & 0x7f, gotInitialFans: !!(value & 0x80), fanFlags: (value >>> 8) & 0xff };
}

function setFanClub(data: TrainerFanClubData): void {
  varSet(C.VAR_FANCLUB_FAN_COUNTER, (data.timer & 0x7f) | (data.gotInitialFans ? 0x80 : 0) | ((data.fanFlags & 0xff) << 8));
}

/** ResetTrainerFanClub. */
export function ResetTrainerFanClub(): void {
  varSet(C.VAR_FANCLUB_FAN_COUNTER, 0);
  varSet(C.VAR_FANCLUB_LOSE_FAN_TIMER, 0);
}

/** GetNumFansOfPlayerInTrainerFanClub. */
export function GetNumFansOfPlayerInTrainerFanClub(data: TrainerFanClubData = fanClub()): number {
  let count = 0;
  for (let id = 0; id < 8; id++) if ((data.fanFlags >>> id) & 1) count++;
  return count;
}

/** DidPlayerGetFirstFans. */
export function DidPlayerGetFirstFans(data: TrainerFanClubData = fanClub()): boolean {
  const gotInitialFans = !!data.gotInitialFans;
  return gotInitialFans;
}

/** SetPlayerGotFirstFans. */
export function SetPlayerGotFirstFans(data: TrainerFanClubData): void { data.gotInitialFans = true; }

/** SetInitialFansOfPlayer. The repeated MEMBER1 set is present in the C and is idempotent. */
export function SetInitialFansOfPlayer(data: TrainerFanClubData): void {
  data.fanFlags |= (1 << C.FANCLUB_MEMBER1) | (1 << C.FANCLUB_MEMBER2) | (1 << C.FANCLUB_MEMBER3);
}

/** PlayerGainRandomTrainerFan: walk the C's priority list with its one-bit RNG gate. */
export function PlayerGainRandomTrainerFan(data: TrainerFanClubData): number {
  const ids = [C.FANCLUB_MEMBER2, C.FANCLUB_MEMBER4, C.FANCLUB_MEMBER6, C.FANCLUB_MEMBER1, C.FANCLUB_MEMBER8, C.FANCLUB_MEMBER7, C.FANCLUB_MEMBER5, C.FANCLUB_MEMBER3];
  let index = 0;
  for (let i = 0; i < ids.length; i++) {
    if (!((data.fanFlags >>> ids[i]) & 1)) {
      index = i;
      if (random() % 2) { data.fanFlags |= 1 << ids[i]; return ids[i]; }
    }
  }
  data.fanFlags |= 1 << ids[index];
  return ids[index];
}

/** PlayerLoseRandomTrainerFan: preserve one fan and use the source priority/RNG order. */
export function PlayerLoseRandomTrainerFan(data: TrainerFanClubData): number {
  const ids = [C.FANCLUB_MEMBER6, C.FANCLUB_MEMBER7, C.FANCLUB_MEMBER4, C.FANCLUB_MEMBER8, C.FANCLUB_MEMBER5, C.FANCLUB_MEMBER2, C.FANCLUB_MEMBER1, C.FANCLUB_MEMBER3];
  if (GetNumFansOfPlayerInTrainerFanClub(data) === 1) return 0;
  let index = 0;
  for (let i = 0; i < ids.length; i++) {
    if ((data.fanFlags >>> ids[i]) & 1) {
      index = i;
      if (random() % 2) { data.fanFlags ^= 1 << ids[i]; return ids[i]; }
    }
  }
  if ((data.fanFlags >>> ids[index]) & 1) data.fanFlags ^= 1 << ids[index];
  return ids[index];
}

/** TryLoseFansFromPlayTime. */
export function TryLoseFansFromPlayTime(data: TrainerFanClubData): void {
  const hours = playTimeHours();
  if (hours >= 999) return;
  for (let i = 0; ; i++) {
    if (GetNumFansOfPlayerInTrainerFanClub(data) < 5) { varSet(C.VAR_FANCLUB_LOSE_FAN_TIMER, hours); break; }
    if (i === 8) break;
    const timer = varGet(C.VAR_FANCLUB_LOSE_FAN_TIMER);
    if (hours - timer < 12) break;
    PlayerLoseRandomTrainerFan(data);
    varSet(C.VAR_FANCLUB_LOSE_FAN_TIMER, timer + 12);
  }
}

/** TryLoseFansFromPlayTimeAfterLinkBattle. */
export function TryLoseFansFromPlayTimeAfterLinkBattle(data: TrainerFanClubData): void {
  if (DidPlayerGetFirstFans(data)) {
    TryLoseFansFromPlayTime(data);
    varSet(C.VAR_FANCLUB_LOSE_FAN_TIMER, playTimeHours());
  }
}

/** UpdateTrainerFanClubGameClear. */
export function UpdateTrainerFanClubGameClear(data: TrainerFanClubData): void {
  if (data.gotInitialFans) return;
  SetPlayerGotFirstFans(data);
  SetInitialFansOfPlayer(data);
  varSet(C.VAR_FANCLUB_LOSE_FAN_TIMER, playTimeHours());
  for (const flag of [C.FLAG_HIDE_SAFFRON_FAN_CLUB_BLACK_BELT, C.FLAG_HIDE_SAFFRON_FAN_CLUB_ROCKER, C.FLAG_HIDE_SAFFRON_FAN_CLUB_WOMAN, C.FLAG_HIDE_SAFFRON_FAN_CLUB_BEAUTY]) flagClear(flag);
  varSet(C.VAR_MAP_SCENE_SAFFRON_CITY_POKEMON_TRAINER_FAN_CLUB, 1);
}

/** TryGainNewFanFromCounter. */
export function TryGainNewFanFromCounter(data: TrainerFanClubData, counter: number): number {
  if (varGet(C.VAR_MAP_SCENE_SAFFRON_CITY_POKEMON_TRAINER_FAN_CLUB) === 2) {
    const increment = [2, 1, 2, 1][counter] ?? 0;
    if (data.timer + increment >= 20) {
      if (GetNumFansOfPlayerInTrainerFanClub(data) < 3) { PlayerGainRandomTrainerFan(data); data.timer = 0; }
      else data.timer = 20;
    } else data.timer += increment;
  }
  return data.timer;
}

/** IsFanClubMemberFanOfPlayer. */
export function IsFanClubMemberFanOfPlayer(data: TrainerFanClubData, member: number): boolean {
  return !!((data.fanFlags >>> member) & 1);
}

/** BufferFanClubTrainerName: use a saved link trainer name when present, otherwise the NPC fallback. */
export function BufferFanClubTrainerName(linkNames: ArrayLike<ArrayLike<number>>, whichLinkTrainer: number, whichNPCTrainer: number): Uint8Array {
  const name = linkNames[whichLinkTrainer];
  if (name && name[0] !== 0xff) {
    const result = Array.from(name).slice(0, C.PLAYER_NAME_LENGTH);
    result.push(0xff);
    if (result[0] === C.EXT_CTRL_CODE_BEGIN && result[1] === C.EXT_CTRL_CODE_JPN) {
      let end = result.indexOf(0xff);
      if (end < 0) end = result.length;
      result.splice(end, 0, C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_ENG);
    }
    return Uint8Array.from(result);
  }
  return Uint8Array.from(whichNPCTrainer === 1 ? rom.text("gText_LtSurge") : whichNPCTrainer === 2 ? rom.text("gText_Koga") : save.rivalName);
}

/** UpdateTrainerFansAfterLinkBattle. Link battle callers provide the C battle outcome. */
export function UpdateTrainerFansAfterLinkBattle(data: TrainerFanClubData, battleOutcome: number): void {
  if (varGet(C.VAR_MAP_SCENE_SAFFRON_CITY_POKEMON_TRAINER_FAN_CLUB) !== 2) return;
  TryLoseFansFromPlayTimeAfterLinkBattle(data);
  if (battleOutcome === C.B_OUTCOME_WON) PlayerGainRandomTrainerFan(data);
  else PlayerLoseRandomTrainerFan(data);
}

export function Script_TryLoseFansFromPlayTimeAfterLinkBattle(): void { const data = fanClub(); TryLoseFansFromPlayTimeAfterLinkBattle(data); setFanClub(data); }
export function Script_UpdateTrainerFanClubGameClear(): void { const data = fanClub(); UpdateTrainerFanClubGameClear(data); setFanClub(data); }
export function Script_TryGainNewFanFromCounter(): number { const data = fanClub(); const value = TryGainNewFanFromCounter(data, varGet(SV.x8004)); setFanClub(data); return value; }
export function Script_GetNumFansOfPlayerInTrainerFanClub(): number { return GetNumFansOfPlayerInTrainerFanClub(); }
export function Script_TryLoseFansFromPlayTime(): void { const data = fanClub(); TryLoseFansFromPlayTime(data); setFanClub(data); }
export function Script_IsFanClubMemberFanOfPlayer(): number { return IsFanClubMemberFanOfPlayer(fanClub(), varGet(SV.x8004)) ? 1 : 0; }
export function Script_SetPlayerGotFirstFans(): void { const data = fanClub(); SetPlayerGotFirstFans(data); setFanClub(data); }
export function Script_BufferFanClubTrainerName(): void {
  const member = varGet(SV.x8004);
  const npc = member === C.FANCLUB_MEMBER5 ? 1 : member === C.FANCLUB_MEMBER7 ? 2 : 0;
  stringVars.var1 = BufferFanClubTrainerName([], 0, npc);
}
export function Special_UpdateTrainerFansAfterLinkBattle(battleOutcome: number): void { const data = fanClub(); UpdateTrainerFansAfterLinkBattle(data, battleOutcome); setFanClub(data); }

// ---------------------------------------------------------------- elevators (field_specials.c)

function elevatorFloor(): number {
  const w = save.dynamicWarp;
  const group = (name: string) => rom.c(name) >> 8;
  const num = (name: string) => rom.c(name) & 0xff;
  let floor = 4;
  if (w.mapGroup === group("MAP_ROCKET_HIDEOUT_B1F")) {
    const table: Array<[string, number]> = [["MAP_SILPH_CO_1F", 4], ["MAP_SILPH_CO_2F", 5], ["MAP_SILPH_CO_3F", 6], ["MAP_SILPH_CO_4F", 7], ["MAP_SILPH_CO_5F", 8],
      ["MAP_SILPH_CO_6F", 9], ["MAP_SILPH_CO_7F", 10], ["MAP_SILPH_CO_8F", 11], ["MAP_SILPH_CO_9F", 12], ["MAP_SILPH_CO_10F", 13], ["MAP_SILPH_CO_11F", 14],
      ["MAP_ROCKET_HIDEOUT_B1F", 3], ["MAP_ROCKET_HIDEOUT_B2F", 2], ["MAP_ROCKET_HIDEOUT_B4F", 0]];
    for (const [m, f] of table) if (w.mapNum === num(m)) floor = f;
  }
  if (w.mapGroup === group("MAP_CELADON_CITY_DEPARTMENT_STORE_1F")) {
    for (let i = 1; i <= 5; i++) if (w.mapNum === num(`MAP_CELADON_CITY_DEPARTMENT_STORE_${i}F`)) floor = 3 + i;
  }
  if (w.mapGroup === group("MAP_TRAINER_TOWER_1F")) {
    for (const m of ["1F", "2F", "3F", "4F", "5F", "6F", "7F", "8F", "ROOF"]) if (w.mapNum === num(`MAP_TRAINER_TOWER_${m}`)) floor = 15;
    if (w.mapNum === num("MAP_TRAINER_TOWER_LOBBY")) floor = 3;
  }
  return floor;
}

function initElevatorFloorSelectMenuPos(ctx: ScriptRunner): number {
  const menu = ctx.ow.game.scriptMenu;
  const w = save.dynamicWarp;
  const group = (name: string) => rom.c(name) >> 8;
  const num = (name: string) => rom.c(name) & 0xff;
  let scroll = 0, cursor = 0;
  if (w.mapGroup === group("MAP_ROCKET_HIDEOUT_B1F")) {
    const table: Array<[string, number, number]> = [["MAP_SILPH_CO_11F", 0, 0], ["MAP_SILPH_CO_10F", 0, 1], ["MAP_SILPH_CO_9F", 0, 2], ["MAP_SILPH_CO_8F", 0, 3],
      ["MAP_SILPH_CO_7F", 0, 4], ["MAP_SILPH_CO_6F", 1, 4], ["MAP_SILPH_CO_5F", 2, 4], ["MAP_SILPH_CO_4F", 3, 4], ["MAP_SILPH_CO_3F", 4, 4], ["MAP_SILPH_CO_2F", 5, 4],
      ["MAP_SILPH_CO_1F", 5, 5], ["MAP_ROCKET_HIDEOUT_B1F", 0, 0], ["MAP_ROCKET_HIDEOUT_B2F", 0, 1], ["MAP_ROCKET_HIDEOUT_B4F", 0, 2]];
    for (const [m, s, c] of table) if (w.mapNum === num(m)) { scroll = s; cursor = c; }
  }
  if (w.mapGroup === group("MAP_CELADON_CITY_DEPARTMENT_STORE_1F")) {
    for (let i = 1; i <= 5; i++) if (w.mapNum === num(`MAP_CELADON_CITY_DEPARTMENT_STORE_${i}F`)) { scroll = 0; cursor = 5 - i; }
  }
  if (w.mapGroup === group("MAP_TRAINER_TOWER_1F")) {
    for (const m of ["1F", "2F", "3F", "4F", "5F", "6F", "7F", "8F", "ROOF"]) if (w.mapNum === num(`MAP_TRAINER_TOWER_${m}`)) { scroll = 0; cursor = 0; }
    if (w.mapNum === num("MAP_TRAINER_TOWER_LOBBY")) { scroll = 0; cursor = 1; }
  }
  menu.elevatorScroll = scroll;
  menu.elevatorCursorPos = cursor;
  return cursor;
}

const FLOOR_NAMES = ["gText_B4F", "gText_B3F", "gText_B2F", "gText_B1F", "gText_1F", "gText_2F", "gText_3F", "gText_4F", "gText_5F", "gText_6F",
  "gText_7F", "gText_8F", "gText_9F", "gText_10F", "gText_11F", "gText_Rooftop"];
let floorWindow: Window | undefined;

/** AnimateElevator (field_specials.c). */
function AnimateElevator(ctx: ScriptRunner): void {
  const ow = ctx.ow;
  const from = varGet(SV.x8005), to = varGet(SV.x8006);
  const data = tasks.tasks[tasks.create((taskId) => Task_ElevatorShake(taskId, ctx), 9)].data;
  data[1] = 0;
  data[2] = 0;
  data[4] = 1;
  let nfloors: number;
  if (from > to) {
    nfloors = from - to;
    data[6] = 1;
  } else {
    nfloors = to - from;
    data[6] = 0;
  }
  if (nfloors > 8) nfloors = 8;
  data[5] = cdata<number[]>("field_specials", "sElevatorAnimationDuration")[nfloors];
  ow.SetCameraPanningCallback(null);
  AnimateElevatorWindowView(nfloors, data[6]!, ctx);
  sound.playSE(C.SE_ELEVATOR);
}

/** Task_ElevatorShake (field_specials.c). */
function Task_ElevatorShake(taskId: number, ctx: ScriptRunner): void {
  const data = tasks.tasks[taskId].data;
  data[1] = data[1]! + 1;
  if (data[1]! % 3 !== 0) return;
  data[1] = 0;
  data[2] = data[2]! + 1;
  data[4] = -data[4]!;
  ctx.ow.SetCameraPanning(0, data[4]!);
  if (data[2] === data[5]) {
    sound.playSE(C.SE_DING_DONG);
    tasks.destroy(taskId);
    ctx.ow.script.ScriptContext_Enable();
    ctx.ow.InstallCameraPanAheadCallback();
  }
}

/** AnimateElevatorWindowView (field_specials.c). */
let elevatorWindowTaskId: number | undefined;
function AnimateElevatorWindowView(nfloors: number, direction: number, ctx: ScriptRunner): void {
  if (elevatorWindowTaskId !== undefined && tasks.tasks[elevatorWindowTaskId]?.isActive) return;
  const taskId = tasks.create((id) => Task_AnimateElevatorWindowView(id, ctx), 8);
  elevatorWindowTaskId = taskId;
  const data = tasks.tasks[taskId].data;
  data[0] = 0;
  data[1] = 0;
  data[2] = direction;
  data[3] = cdata<number[]>("field_specials", "sElevatorWindowAnimDuration")[nfloors]!;
}

/** Task_AnimateElevatorWindowView (field_specials.c). */
function Task_AnimateElevatorWindowView(taskId: number, ctx: ScriptRunner): void {
  const data = tasks.tasks[taskId].data;
  if (data[1] === 6) {
    data[0] = data[0]! + 1;
    const tables = cdata<number[][]>("field_specials", data[2] === 0
      ? "sElevatorWindowMetatilesGoingUp" : "sElevatorWindowMetatilesGoingDown");
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        ctx.ow.map.setMetatileIdAt(j + 1 + MAP_OFFSET, i + MAP_OFFSET,
          tables[i]![data[0]! % 3]! | MAPGRID_COLLISION_MASK);
      }
    }
    ctx.ow.renderer?.invalidate();
    data[1] = 0;
    if (data[0] === data[3]) {
      tasks.destroy(taskId);
      elevatorWindowTaskId = undefined;
    }
  }
  data[1] = data[1]! + 1;
}

// ---------------------------------------------------------------- berry powder vendor

let powderWindow: Window | undefined;
/** DecryptBerryPowder: browser saves keep this value in plaintext, not XORed. */
export function DecryptBerryPowder(powder: number): number { return powder >>> 0; }

/** SetBerryPowder: the web SaveData stores the logical amount directly. */
export function SetBerryPowder(amount: number): void { save.berryPowder = amount >>> 0; }

/** Re-key adaptation: preserve the logical amount while keeping plaintext storage. */
export function ApplyNewEncryptionKeyToBerryPowder(_encryptionKey: number): void {
  SetBerryPowder(DecryptBerryPowder(save.berryPowder ?? 0));
}

/** GetBerryPowder (berry_powder.c). */
export function GetBerryPowder(): number { return DecryptBerryPowder(save.berryPowder ?? 0); }

/** HasEnoughBerryPowder (berry_powder.c). */
function HasEnoughBerryPowder(cost: number): boolean { return GetBerryPowder() >= (cost >>> 0); }

/** TakeBerryPowder (berry_powder.c). */
function TakeBerryPowder(cost: number): boolean {
  if (!HasEnoughBerryPowder(cost)) return false;
  SetBerryPowder((GetBerryPowder() - (cost >>> 0)) >>> 0);
  return true;
}

/** GiveBerryPowder; Berry Crush is not yet ported, but this C API caps storage at 99,999. */
export function GiveBerryPowder(amountToAdd: number): boolean {
  const amount = (GetBerryPowder() + (amountToAdd >>> 0)) >>> 0;
  SetBerryPowder(Math.min(amount, 99999));
  return amount <= 99999;
}

/** PrintBerryPowderAmount (berry_powder.c), adapted to the Canvas field window. */
function PrintBerryPowderAmount(window: Window, amount: number, x: number, y: number, _speed: number): void {
  printText(window, FONT_SMALL, intToDecimal(amount >>> 0, STR_CONV_MODE_RIGHT_ALIGN, 5), x, y);
}

/** DrawPlayerPowderAmount (berry_powder.c), using the field window's selected frame. */
function DrawPlayerPowderAmount(window: Window, _baseBlock: number, _palette: number, amount: number): void {
  window.frame = "std";
  window.frameType = save.options.frameType;
  window.fill(1);
  printText(window, FONT_SMALL, rom.text("gOtherText_Powder"), 0, 0);
  PrintBerryPowderAmount(window, amount, 39, 12, 0);
}

/** Script_HasEnoughBerryPowder (berry_powder.c). */
function Script_HasEnoughBerryPowder(): number {
  return HasEnoughBerryPowder(varGet(SV.x8004)) ? 1 : 0;
}

/** Script_TakeBerryPowder (berry_powder.c). */
function Script_TakeBerryPowder(): number {
  return TakeBerryPowder(varGet(SV.x8004)) ? 1 : 0;
}

/** DisplayBerryPowderVendorMenu (berry_powder.c), adapted to a Canvas field window. */
function DisplayBerryPowderVendorMenu(ctx: ScriptRunner): void {
  powderWindow = new Window(2, 2, 8, 3);
  ctx.ow.windows.add(powderWindow);
  DrawPlayerPowderAmount(powderWindow, 0x21d, BG_PLTT_ID(13), GetBerryPowder());
}

/** PrintPlayerBerryPowderAmount (berry_powder.c). */
function PrintPlayerBerryPowderAmount(): void {
  if (powderWindow) PrintBerryPowderAmount(powderWindow, GetBerryPowder(), 39, 12, 0);
}

/** RemoveBerryPowderVendorMenu (berry_powder.c). */
function RemoveBerryPowderVendorMenu(ctx: ScriptRunner): void {
  if (powderWindow) ctx.ow.windows.remove(powderWindow);
  powderWindow = undefined;
}

// ---------------------------------------------------------------- SS Anne departure (ss_anne.c)

type SSAnneDeparture = {
  ctx: ScriptRunner; wait: number; smokeTimer: number; travelTimer: number; finishTimer: number;
  wakeFrames: HTMLCanvasElement[]; smokeFrames: HTMLCanvasElement[];
};
const ssAnneTasks = new Map<number, SSAnneDeparture>();
const ssAnneSprites = new WeakMap<Sprite, SSAnneDeparture>();

function ssAnneDeparture(ctx: ScriptRunner): void { DoSSAnneDepartureCutscene(ctx); }

/** DoSSAnneDepartureCutscene (ss_anne.c). */
export function DoSSAnneDepartureCutscene(ctx: ScriptRunner): void {
  sound.playSE(C.SE_SS_ANNE_HORN);
  const pal = Array.from(incbinU16("gObjectEventPal_SSAnne"));
  const wakeTiles = incbin("sWakeTiles"), smokeTiles = incbin("sSmokeTiles");
  const departure: SSAnneDeparture = {
    ctx, wait: 50, smokeTimer: 0, travelTimer: 0, finishTimer: 0,
    wakeFrames: [0, 1].map((f) => spriteSheet(wakeTiles.subarray(f * 256, f * 256 + 256), pal, 16, 32)),
    smokeFrames: [0, 1, 2, 3].map((f) => spriteSheet(smokeTiles.subarray(f * 128, f * 128 + 128), pal, 16, 16)),
  };
  ssAnneTasks.set(tasks.create(Task_SSAnneInit, 8), departure);
}

function ssAnneBoat(d: SSAnneDeparture): Sprite | undefined {
  return d.ctx.ow.objects.byLocalIdAndMap(1, save.location.mapNum, save.location.mapGroup)?.sprite;
}

/** Task_SSAnneInit: wait 50 frames before creating the wake. */
export function Task_SSAnneInit(taskId: number): void {
  const d = ssAnneTasks.get(taskId);
  if (!d || --d.wait !== 0) return;
  CreateWakeBehindBoat(taskId);
  tasks.tasks[taskId].func = Task_SSAnneRun;
}

/** Task_SSAnneRun: animate the boat and emit smoke every 70 frames. */
export function Task_SSAnneRun(taskId: number): void {
  const d = ssAnneTasks.get(taskId);
  if (!d) return;
  d.smokeTimer++; d.travelTimer++;
  if (d.smokeTimer === 70) { d.smokeTimer = 0; CreateSmokeSprite(taskId); }
  const boat = ssAnneBoat(d);
  if (!boat || boat.x + boat.x2 < -120) {
    sound.playSE(C.SE_SS_ANNE_HORN);
    tasks.tasks[taskId].func = Task_SSAnneFinish;
  } else boat.x2 = -Math.floor(d.travelTimer / 5);
}

/** Task_SSAnneFinish: release the script after the C's 40-frame delay. */
export function Task_SSAnneFinish(taskId: number): void {
  const d = ssAnneTasks.get(taskId);
  if (!d || ++d.finishTimer !== 40) return;
  // Canvas sprites retain decoded frames directly, so the GBA tile-tag frees have no browser resource.
  ssAnneTasks.delete(taskId);
  tasks.destroy(taskId);
  d.ctx.ow.script.ScriptContext_Enable();
}

/** CreateWakeBehindBoat. */
export function CreateWakeBehindBoat(taskId: number): void {
  const d = ssAnneTasks.get(taskId), boat = d && ssAnneBoat(d);
  if (!d || !boat) return;
  const s = new Sprite();
  s.width = 16; s.height = 32; s.centerToCornerVecX = -8; s.centerToCornerVecY = -16;
  s.priority = 2; s.subpriority = 0xff; s.y = 109; s.coordOffsetEnabled = false;
  s.anims = [[['F', 0, 12, 0, 0], ['F', 1, 12, 0, 0], ['J', 0]]];
  s.startAnim(0);
  s.draw = (c, x, y) => c.drawImage(d.wakeFrames[s.imageValue] ?? d.wakeFrames[0], x, y);
  ssAnneSprites.set(s, d);
  s.callback = WakeSpriteCallback;
  d.ctx.ow.sprites.add(s);
}

/** WakeSpriteCallback. */
export function WakeSpriteCallback(s: Sprite): void {
  const d = ssAnneSprites.get(s);
  if (!d) return;
  const boat = ssAnneBoat(d);
  if (!boat) { d.ctx.ow.sprites.destroy(s); return; }
  s.x = boat.x + boat.x2 + 80 + d.ctx.ow.sprites.offsetX;
  if (Math.floor(s.data[0] / 6) < 22) s.data[0]++;
  s.x2 = Math.floor(s.data[0] / 6);
  if (s.x + s.x2 < -18) d.ctx.ow.sprites.destroy(s);
}

/** CreateSmokeSprite. */
export function CreateSmokeSprite(taskId: number): void {
  const d = ssAnneTasks.get(taskId), boat = d && ssAnneBoat(d);
  if (!d || !boat) return;
  const x = ((boat.x + boat.x2 + 49 + d.ctx.ow.sprites.offsetX) << 16) >> 16;
  if (x < -32) return;
  const s = new Sprite();
  s.width = 16; s.height = 16; s.centerToCornerVecX = -8; s.centerToCornerVecY = -8;
  s.x = x; s.y = 78; s.priority = 2; s.subpriority = 8; s.coordOffsetEnabled = false;
  s.anims = [[['F', 0, 10, 0, 0], ['F', 1, 20, 0, 0], ['F', 2, 20, 0, 0], ['F', 3, 30, 0, 0], ['E']]];
  s.startAnim(0);
  s.draw = (c, dx, dy) => c.drawImage(d.smokeFrames[s.imageValue] ?? d.smokeFrames[0], dx, dy);
  ssAnneSprites.set(s, d);
  s.callback = SmokeSpriteCallback;
  d.ctx.ow.sprites.add(s);
}

/** SmokeSpriteCallback. */
export function SmokeSpriteCallback(s: Sprite): void {
  const d = ssAnneSprites.get(s);
  if (!d) return;
  s.data[0]++;
  s.x2 = Math.floor(s.data[0] / 4);
  if (s.animEnded) d.ctx.ow.sprites.destroy(s);
}

function incbinU16(symbol: string): Uint16Array {
  const b = incbin(symbol);
  const out = new Uint16Array(b.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = b[i * 2] | (b[i * 2 + 1] << 8);
  return out;
}

// ---------------------------------------------------------------- Pokémon League lighting

let leagueTask = -1;
function leagueLighting(ctx: ScriptRunner): void {
  const ow = ctx.ow;
  const champion = mapIs("MAP_POKEMON_LEAGUE_CHAMPIONS_ROOM");
  const palettes = incbinU16(champion ? "sChampionRoomLightingPalettes" : "sEliteFourLightingPalettes");
  const timers = cdata<number[]>("field_specials", champion ? "sChampionRoomLightingTimers" : "sEliteFourLightingTimers");
  const count = champion ? 8 : 11;
  const apply = (i: number): void => {
    const colors = Array.from(palettes.subarray(i * 16, i * 16 + 16), (c) => rgb555(c));
    ow.renderer?.setPalette(7, colors);
  };
  if (leagueTask >= 0) tasks.destroy(leagueTask);
  if (flagGet(C.FLAG_TEMP_3)) {
    leagueTask = tasks.create(() => {
      if (!flagGet(C.FLAG_TEMP_4)) return;
      apply(champion ? 8 : 11);
      tasks.destroy(leagueTask);
      leagueTask = -1;
    }, 8);
    return;
  }
  let d0 = timers[0], d1 = 0;
  apply(0);
  leagueTask = tasks.create(() => {
    if (!flagGet(C.FLAG_TEMP_2) || flagGet(C.FLAG_TEMP_5)) return;
    if (--d0 !== 0) return;
    if (++d1 === count) d1 = 0;
    d0 = timers[d1];
    apply(d1);
  }, 8);
}

// ---------------------------------------------------------------- museum fossil pic (script_menu.c)

let fossilPic: { window: Window; sprite: Sprite; state: number } | undefined;

// ---------------------------------------------------------------- the table

export const EXTRA_SPECIALS: Record<string, Special> = {
  // fame checker
  SetFlavorTextFlagFromSpecialVars: () => { setFlavorTextFlagFromSpecialVars(); },
  UpdatePickStateFromSpecialVar8005: () => { updatePickStateFromSpecialVar8005(); },
  // size records
  CompareHeracrossSize: () => { varSet(SV.RESULT, CompareMonSize(C.SPECIES_HERACROSS, C.VAR_HERACROSS_SIZE_RECORD)); },
  CompareMagikarpSize: () => { varSet(SV.RESULT, CompareMonSize(C.SPECIES_MAGIKARP, C.VAR_MAGIKARP_SIZE_RECORD)); },
  GetHeracrossSizeRecordInfo: () => { GetMonSizeRecordInfo(C.SPECIES_HERACROSS, C.VAR_HERACROSS_SIZE_RECORD); },
  GetMagikarpSizeRecordInfo: () => { GetMonSizeRecordInfo(C.SPECIES_MAGIKARP, C.VAR_MAGIKARP_SIZE_RECORD); },
  GiveGiftRibbonToParty: () => { GiveGiftRibbonToParty(varGet(SV.x8004), varGet(SV.x8005)); },
  // move deleter (party_menu_specials.c)
  GetNumMovesSelectedMonHas: () => { varSet(SV.RESULT, (save.party[varGet(SV.x8004)]?.moves ?? []).filter(Boolean).length); },
  BufferMoveDeleterNicknameAndMove: () => {
    const mon = save.party[varGet(SV.x8004)];
    if (!mon) return;
    stringVars.var1 = nickname(mon);
    stringVars.var2 = rom.moveName(mon.moves[varGet(SV.x8005)]);
  },
  MoveDeleterForgetMove: () => {
    const mon = save.party[varGet(SV.x8004)];
    const slot = varGet(SV.x8005);
    if (!mon) return;
    SetMonMoveSlot(mon, C.MOVE_NONE, slot);
    RemoveMonPPBonus(mon, slot);
    for (let i = slot; i < C.MAX_MON_MOVES - 1; i++) ShiftMoveSlot(mon, i, i + 1);
  },
  SelectMoveDeleterMove: (ctx) => { ctx.ow.game.selectMoveDeleterMove(); },
  // field_specials.c
  PlayerPartyContainsSpeciesWithPlayerID: () => (save.party.some((m) => (m.isEgg ? C.SPECIES_EGG : m.species) === varGet(SV.x8004) && m.otId === save.trainerId) ? 1 : 0),
  SampleResortGorgeousMonAndReward: () => {
    const requested = varGet(C.VAR_RESORT_GORGEOUS_REQUESTED_MON);
    if (requested === 0 || requested === 0xffff) {
      let species = 1;
      let found = false;
      for (let i = 0; i < 100 && !found; i++) {
        species = (random() % (C.NUM_SPECIES - 1)) + 1;
        if (getDexFlag(species, false)) found = true;
      }
      while (!found && !getDexFlag(species, false)) species = species === C.SPECIES_BULBASAUR ? C.NUM_SPECIES - 1 : species - 1;
      varSet(C.VAR_RESORT_GORGEOUS_REQUESTED_MON, species);
      const rewards = cdata<number[]>("field_specials", "sResortGorgeousDeluxeRewards");
      varSet(C.VAR_RESORT_GORGEOUS_REWARD, random() % 100 >= 30 ? C.ITEM_LUXURY_BALL : rewards[random() % rewards.length]);
      varSet(C.VAR_RESORT_GOREGEOUS_STEP_COUNTER, 0);
    }
    stringVars.var1 = speciesName(varGet(C.VAR_RESORT_GORGEOUS_REQUESTED_MON));
  },
  StickerManGetBragFlags: () => {
    const stat = (i: number) => GetGameStat(i);
    varSet(SV.x8004, stat(C.GAME_STAT_ENTERED_HOF));
    varSet(SV.x8005, Math.min(0xffff, stat(C.GAME_STAT_HATCHED_EGGS)));
    varSet(SV.x8006, stat(C.GAME_STAT_LINK_BATTLE_WINS));
    return (varGet(SV.x8004) ? 1 : 0) | (varGet(SV.x8005) ? 2 : 0) | (varGet(SV.x8006) ? 4 : 0);
  },
  ChangeBoxPokemonNickname: (ctx) => { ctx.ow.game.changeBoxNickname(varGet(SV.MON_BOX_ID), varGet(SV.MON_BOX_POS)); },
  CapeBrinkGetMoveToTeachLeadPokemon: () => {
    const lead = leadMonIndex();
    varSet(SV.x8007, lead);
    const mon = save.party[lead];
    if (!mon) return 0;
    const species = [C.SPECIES_VENUSAUR, C.SPECIES_CHARIZARD, C.SPECIES_BLASTOISE];
    const tutor = species.indexOf(mon.isEgg ? C.SPECIES_EGG : mon.species);
    if (tutor < 0 || mon.friendship !== 255) return 0;
    const [move, tutorId, flag] = [
      [C.MOVE_FRENZY_PLANT, C.MOVETUTOR_FRENZY_PLANT, C.FLAG_TUTOR_FRENZY_PLANT],
      [C.MOVE_BLAST_BURN, C.MOVETUTOR_BLAST_BURN, C.FLAG_TUTOR_BLAST_BURN],
      [C.MOVE_HYDRO_CANNON, C.MOVETUTOR_HYDRO_CANNON, C.FLAG_TUTOR_HYDRO_CANNON],
    ][tutor];
    stringVars.var2 = rom.moveName(move);
    varSet(SV.x8005, tutorId);
    if (flagGet(flag)) return 0;
    varSet(SV.x8006, mon.moves.filter(Boolean).length);
    return 1;
  },
  HasLearnedAllMovesFromCapeBrinkTutor: () => {
    const tutor = varGet(SV.x8005);
    if (tutor === C.MOVETUTOR_FRENZY_PLANT) flagSet(C.FLAG_TUTOR_FRENZY_PLANT);
    else if (tutor === C.MOVETUTOR_BLAST_BURN) flagSet(C.FLAG_TUTOR_BLAST_BURN);
    else flagSet(C.FLAG_TUTOR_HYDRO_CANNON);
    return flagGet(C.FLAG_TUTOR_FRENZY_PLANT) && flagGet(C.FLAG_TUTOR_BLAST_BURN) && flagGet(C.FLAG_TUTOR_HYDRO_CANNON) ? 1 : 0;
  },
  TeachMoveRelearnerMove: (ctx) => { ctx.ow.game.openMoveRelearner(); },
  HasAtLeastOneBerry: () => Item_HasAtLeastOneBerry(),
  GetMartClerkObjectId: () => {
    for (const [g, n, id] of cdata<number[][]>("field_specials", "sMartMaps")) if (save.location.mapGroup === g && save.location.mapNum === n) return id;
    return 1;
  },
  UpdateLoreleiDollCollection: () => {
    const n = GetGameStat(C.GAME_STAT_ENTERED_HOF);
    if (n < 25) return;
    flagClear(C.FLAG_HIDE_LORELEI_HOUSE_MEOWTH_DOLL);
    if (n >= 50) flagClear(C.FLAG_HIDE_LORELEI_HOUSE_CHANSEY_DOLL);
    if (n >= 75) flagClear(C.FLAG_HIDE_LORELEIS_HOUSE_NIDORAN_F_DOLL);
    if (n >= 100) flagClear(C.FLAG_HIDE_LORELEI_HOUSE_JIGGLYPUFF_DOLL);
    if (n >= 125) flagClear(C.FLAG_HIDE_LORELEIS_HOUSE_NIDORAN_M_DOLL);
    if (n >= 150) flagClear(C.FLAG_HIDE_LORELEIS_HOUSE_FEAROW_DOLL);
    if (n >= 175) flagClear(C.FLAG_HIDE_LORELEIS_HOUSE_PIDGEOT_DOLL);
    if (n >= 200) flagClear(C.FLAG_HIDE_LORELEIS_HOUSE_LAPRAS_DOLL);
  },
  IsBadEggInParty: () => 0, // a Bad Egg only arises from checksum corruption, which the web save cannot produce
  DoesPartyHaveEnigmaBerry: () => {
    const has = CheckPartyMonHasHeldItem(C.ITEM_ENIGMA_BERRY);
    if (has) GetBerryNameByBerryType(ItemIdToBerryType(C.ITEM_ENIGMA_BERRY), stringVars.var1);
    return has ? 1 : 0;
  },
  IsDodrioInParty: () => { varSet(SV.RESULT, save.party.some((m) => !m.isEgg && m.species === C.SPECIES_DODRIO) ? 1 : 0); },
  IsPokemonJumpSpeciesInParty: () => {
    const allowed = new Set(cdata<Array<{ species: number }>>("pokemon_jump", "sPokeJumpMons").map((e) => e.species));
    varSet(SV.RESULT, save.party.some((m) => !m.isEgg && allowed.has(m.species)) ? 1 : 0);
  },
  SetIcefallCaveCrackedIceMetatiles: (ctx) => {
    ctx.ow.stepCallback.SetIcefallCaveCrackedIceMetatiles();
  },
  SeafoamIslandsB4F_CurrentDumpsPlayerOnLand: (ctx) => { ctx.ow.player.createStopSurfingTask(C.DIR_NORTH); },
  IsPlayerNotInTrainerTowerLobby: () => (mapIs("MAP_TRAINER_TOWER_LOBBY") ? 0 : 1),
  DaisyMassageServices: () => {
    const mon = save.party[varGet(SV.x8004)];
    if (mon) adjustFriendship(mon, 3); // FRIENDSHIP_EVENT_MASSAGE: +3 at every tier
    varSet(C.VAR_MASSAGE_COOLDOWN_STEP_COUNTER, 0);
  },
  SetPostgameFlags: () => {
    SetPostgameFlags();
  },
  // elevators
  GetElevatorFloor: () => { varSet(C.VAR_ELEVATOR_FLOOR, elevatorFloor()); },
  InitElevatorFloorSelectMenuPos: (ctx) => initElevatorFloorSelectMenuPos(ctx),
  DrawElevatorCurrentFloorWindow: (ctx) => {
    const window = new Window(22, 2, 7, 4);
    window.frame = "std";
    window.frameType = save.options.frameType;
    window.fill(1);
    printText(window, 2, rom.text("gText_NowOn"), 0, 2);
    const name = rom.text(FLOOR_NAMES[varGet(SV.x8005)] ?? "gText_1F");
    printText(window, 2, name, 56 - Math.min(56, name.length * 6), 16);
    ctx.ow.windows.add(window);
    floorWindow = window;
  },
  CloseElevatorCurrentFloorWindow: (ctx) => { ctx.ow.windows.remove(floorWindow); floorWindow = undefined; },
  AnimateElevator: (ctx) => { AnimateElevator(ctx); },
  // berry powder
  Script_HasEnoughBerryPowder: () => Script_HasEnoughBerryPowder(),
  Script_TakeBerryPowder: () => Script_TakeBerryPowder(),
  DisplayBerryPowderVendorMenu: (ctx) => DisplayBerryPowderVendorMenu(ctx),
  PrintPlayerBerryPowderAmount: () => PrintPlayerBerryPowderAmount(),
  RemoveBerryPowderVendorMenu: (ctx) => RemoveBerryPowderVendorMenu(ctx),
  // trainer fan club
  ResetTrainerFanClub: () => ResetTrainerFanClub(),
  Script_TryLoseFansFromPlayTimeAfterLinkBattle: () => Script_TryLoseFansFromPlayTimeAfterLinkBattle(),
  Script_UpdateTrainerFanClubGameClear: () => Script_UpdateTrainerFanClubGameClear(),
  Script_TryGainNewFanFromCounter: () => Script_TryGainNewFanFromCounter(),
  Script_GetNumFansOfPlayerInTrainerFanClub: () => Script_GetNumFansOfPlayerInTrainerFanClub(),
  Script_TryLoseFansFromPlayTime: () => Script_TryLoseFansFromPlayTime(),
  Script_IsFanClubMemberFanOfPlayer: () => Script_IsFanClubMemberFanOfPlayer(),
  Script_SetPlayerGotFirstFans: () => Script_SetPlayerGotFirstFans(),
  Script_BufferFanClubTrainerName: () => Script_BufferFanClubTrainerName(),
  Special_UpdateTrainerFansAfterLinkBattle: (ctx) => Special_UpdateTrainerFansAfterLinkBattle(ctx.ow.game.battleOutcome),
  // storage
  ShouldShowBoxWasFullMessage: () => (shouldShowBoxWasFullMessage() ? 1 : 0),
  GetPCBoxToSendMon: () => getPCBoxToSendMon(),
  // cutscenes and field animations
  DoSSAnneDepartureCutscene: (ctx) => { ssAnneDeparture(ctx); },
  DoPokemonLeagueLightingEffect: (ctx) => { leagueLighting(ctx); },
  LoopWingFlapSound: () => {
    let flaps = 0, timer = 0;
    sound.playSE(C.SE_M_WING_ATTACK);
    const count = varGet(SV.x8004), delay = varGet(SV.x8005);
    const id = tasks.create(() => {
      if (++timer === delay) { flaps++; timer = 0; sound.playSE(C.SE_M_WING_ATTACK); }
      if (flaps === count - 1) tasks.destroy(id);
    }, 8);
  },
  DoFallWarp: (ctx) => { ctx.ow.doFallWarp(); },
  OpenMuseumFossilPic: (ctx) => {
    const species = varGet(SV.x8004);
    if (species !== C.SPECIES_KABUTOPS && species !== C.SPECIES_AERODACTYL) return 0;
    const name = species === C.SPECIES_KABUTOPS ? "Kabutops" : "Aerodactyl";
    const x = varGet(SV.x8005), y = varGet(SV.x8006);
    const window = ctx.ow.game.scriptMenu.createFramedWindow(x, y, 8, 8);
    const tiles = incbin(`sMuseum${name}SprTiles`);
    const pal = incbinU16(`sMuseum${name}SprPalette`);
    const image = spriteSheet(tiles, pal, 64, 64);
    const sprite = new Sprite();
    sprite.width = 64; sprite.height = 64; sprite.centerToCornerVecX = -32; sprite.centerToCornerVecY = -32;
    sprite.x = x * 8 + 40; sprite.y = y * 8 + 40; sprite.coordOffsetEnabled = false; sprite.priority = 0; sprite.aboveWindows = true;
    sprite.draw = (c, dx, dy) => c.drawImage(image, dx, dy);
    ctx.ow.sprites.add(sprite);
    fossilPic = { window, sprite, state: 0 };
    return 1;
  },
  CloseMuseumFossilPic: (ctx) => {
    if (!fossilPic) return 0;
    ctx.ow.sprites.destroy(fossilPic.sprite);
    ctx.ow.game.scriptMenu.removeWindow(fossilPic.window);
    fossilPic = undefined;
    return 1;
  },
  // link, wireless and e-Reader: no hardware
  IsWirelessAdapterConnected: () => 0,
  TryBattleLinkup: (ctx) => { varSet(SV.RESULT, LINKUP_CONNECTION_ERROR); enableLater(ctx); },
  TryTradeLinkup: (ctx) => { varSet(SV.RESULT, LINKUP_CONNECTION_ERROR); enableLater(ctx); },
  TryBecomeLinkLeader: (ctx) => { varSet(SV.RESULT, LINKUP_CONNECTION_ERROR); enableLater(ctx); },
  TryJoinLinkGroup: (ctx) => { varSet(SV.RESULT, LINKUP_CONNECTION_ERROR); enableLater(ctx); },
  CloseLink: () => {},
  CleanupLinkRoomState: () => {},
  ExitLinkRoom: () => {},
  ReturnFromLinkRoom: (ctx) => { enableLater(ctx); },
  RunUnionRoom: (ctx) => { enableLater(ctx); },
  Script_ResetUnionRoomTrade: () => {},
  BufferUnionRoomPlayerName: () => { stringVars.var1 = Uint8Array.from(save.playerName); },
  ChooseMonForWirelessMinigame: (ctx) => { varSet(SV.RESULT, 0); enableLater(ctx); },
  ShowWirelessCommunicationScreen: (ctx) => { enableLater(ctx); },
  EnterColosseumPlayerSpot: (ctx) => { enableLater(ctx); },
  EnterTradeSeat: (ctx) => { enableLater(ctx); },
  DoCableClubWarp: (ctx) => { enableLater(ctx); },
  Script_ShowLinkTrainerCard: (ctx) => { enableLater(ctx); },
  StartSpecialBattle: (ctx) => { enableLater(ctx); },
  BufferEReaderTrainerGreeting: () => { stringVars.var1 = encode(""); },
  BufferEReaderTrainerName: () => { stringVars.var1 = encode(""); },
  ShowEasyChatScreen: (ctx) => { enableLater(ctx); },
  // records (no link or minigame history exists)
  ShowBattleRecords: (ctx) => {
    stringVars.var1 = encode("0"); stringVars.var2 = encode("0"); stringVars.var3 = encode("0");
    const title = expandPlaceholders(rom.text("gString_BattleRecords_PlayersBattleResults"));
    const total = expandPlaceholders(rom.text("gString_BattleRecords_TotalRecord"));
    ctx.ow.game.showMessageThenEnable(Uint8Array.from([...title.subarray(0, title.indexOf(0xff)), 0xfe, ...total]));
  },
  ShowBerryCrushRankings: (ctx) => { ctx.ow.game.showMessageThenEnable(encode("BERRY CRUSH\n----")); },
  ShowDodrioBerryPickingRecords: (ctx) => { ctx.ow.game.showMessageThenEnable(Uint8Array.from([...rom.text("gText_BerryPickingRecords").filter((b) => b !== 0xff), 0xfe, ...encode("----")])); },
  ShowPokemonJumpRecords: (ctx) => { ctx.ow.game.showMessageThenEnable(Uint8Array.from([...rom.text("gText_PkmnJumpRecords").filter((b) => b !== 0xff), 0xfe, ...encode("----")])); },
  UpdateTrainerCardPhotoIcons: () => { UpdateTrainerCardPhotoIcons(); },
  // Braille cursor (sBrailleTextCursorSpriteID)
  BrailleCursorToggle: (ctx) => { ctx.ow.game.scriptMenu.brailleCursor(varGet(SV.x8004) + 27, varGet(SV.x8005), varGet(SV.x8006) === 0); },
  // box name buffer
  BufferBoxName: () => { stringVars.var1 = getBoxName(varGet(SV.x8004)); },
};

void intToDecimal; void STR_CONV_MODE_LEFT_ALIGN;
