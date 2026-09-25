// More gSpecials entries, each ported from its home file: field_specials.c,
// pokemon_size_record.c, party_menu_specials.c, berry_powder.c,
// trainer_fan_club.c, field_tasks.c, ss_anne.c, special_field_anim.c,
// script_menu.c and the link/record stubs of cable_club.c (no link hardware:
// every link attempt reports LINKUP_CONNECTION_ERROR, as an unplugged cable does).

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { encode, expandPlaceholders, intToDecimal, stringVars, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "../gba/charmap";
import { FONT_SMALL } from "../gba/font";
import { tasks } from "../gba/tasks";
import { printText } from "../gba/textPrinter";
import { Window } from "../gba/window";
import { cdata, incbin } from "../hw/assets";
import { random } from "../random";
import { rom } from "../rom";
import { flagClear, flagGet, flagSet, save, SV, varGet, varSet } from "../save";
import { Sprite } from "../gba/sprite";
import { MAP_OFFSET } from "../field/fieldmap";
import { rgb555, spriteSheet } from "../field/gfx4bpp";
import { adjustFriendship, getDexFlag, leadMonIndex, nickname, speciesName, type Pokemon } from "../pokemon/pokemon";
import { GetPokedexHeightWeight } from "../battle/ext";
import { setFlavorTextFlagFromSpecialVars, updatePickStateFromSpecialVar8005 } from "../menus/keyItemScreens";
import { getBoxName, getPCBoxToSendMon, shouldShowBoxWasFullMessage } from "../pokemon/storage";
import type { ScriptRunner } from "./context";

type Special = (ctx: ScriptRunner) => number | void;

/** ScriptContext_Enable from a task on the next frame (after the script's waitstate). */
function enableLater(ctx: ScriptRunner, frames = 1): void {
  let n = frames;
  const id = tasks.create(() => {
    if (--n > 0) return;
    tasks.destroy(id);
    ctx.ow.script.enable();
  }, 80);
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

function monSizeHash(mon: Pokemon): number {
  const p = mon.personality & 0xffff;
  const iv = (i: number) => (mon.ivs[i] ?? 0) & 0xf;
  // ivs: [hp, atk, def, speed, spatk, spdef]
  const hibyte = (((iv(1) ^ iv(2)) * iv(0)) ^ (p & 0xff)) >>> 0;
  const lobyte = (((iv(4) ^ iv(5)) * iv(3)) ^ (p >> 8)) >>> 0;
  return ((hibyte << 8) + lobyte) & 0xffff;
}

function monSize(species: number, b: number): number {
  const height = GetPokedexHeightWeight(rom.species[species].national, 0);
  let i = 1;
  for (; i < 15; i++) if (b < sBigMonSizeTable[i][2]) break;
  const index = i < 15 ? i - 1 : i;
  const [base, div, start] = sBigMonSizeTable[index];
  const unk0 = base + Math.floor((b - start) / div);
  return Math.floor((height * unk0) / 10);
}

/** FormatMonSizeRecord (UNITS_IMPERIAL) */
function formatSize(size: number): Uint8Array {
  const inches = Math.floor((size * 100) / 254);
  return encode(`${Math.floor(inches / 10)}.${inches % 10}`);
}

function compareMonSize(species: number, recordVar: number): number {
  const index = varGet(SV.RESULT);
  if (index >= 6) return 0;
  const mon = save.party[index];
  if (!mon || mon.isEgg || mon.species !== species) return 1;
  const params = monSizeHash(mon);
  const newSize = monSize(species, params);
  const oldSize = monSize(species, varGet(recordVar));
  stringVars.var3 = formatSize(oldSize);
  stringVars.var2 = formatSize(newSize);
  if (newSize === oldSize) return 4;
  if (newSize < oldSize) return 2;
  varSet(recordVar, params);
  return 3;
}

function sizeRecordInfo(species: number, recordVar: number): void {
  stringVars.var3 = formatSize(monSize(species, varGet(recordVar)));
  stringVars.var1 = speciesName(species);
}

// ---------------------------------------------------------------- trainer_fan_club.c

function fanClub(): { timer: number; got: boolean; flags: number } {
  const v = varGet(C.VAR_FANCLUB_FAN_COUNTER);
  return { timer: v & 0x7f, got: !!(v & 0x80), flags: (v >> 8) & 0xff };
}
function setFanClub(f: { timer: number; got: boolean; flags: number }): void {
  varSet(C.VAR_FANCLUB_FAN_COUNTER, (f.timer & 0x7f) | (f.got ? 0x80 : 0) | ((f.flags & 0xff) << 8));
}
const numFans = (flags: number): number => { let n = 0; for (let i = 0; i < 8; i++) if (flags >> i & 1) n++; return n; };

function gainRandomFan(f: { flags: number }): void {
  const ids = [C.FANCLUB_MEMBER2, C.FANCLUB_MEMBER4, C.FANCLUB_MEMBER6, C.FANCLUB_MEMBER1, C.FANCLUB_MEMBER8, C.FANCLUB_MEMBER7, C.FANCLUB_MEMBER5, C.FANCLUB_MEMBER3];
  let idx = 0;
  for (let i = 0; i < 8; i++) {
    if (!(f.flags >> ids[i] & 1)) {
      idx = i;
      if (random() % 2) { f.flags |= 1 << ids[i]; return; }
    }
  }
  f.flags |= 1 << ids[idx];
}

function loseRandomFan(f: { flags: number }): void {
  const ids = [C.FANCLUB_MEMBER6, C.FANCLUB_MEMBER7, C.FANCLUB_MEMBER4, C.FANCLUB_MEMBER8, C.FANCLUB_MEMBER5, C.FANCLUB_MEMBER2, C.FANCLUB_MEMBER1, C.FANCLUB_MEMBER3];
  if (numFans(f.flags) === 1) return;
  let idx = 0;
  for (let i = 0; i < 8; i++) {
    if (f.flags >> ids[i] & 1) {
      idx = i;
      if (random() % 2) { f.flags ^= 1 << ids[i]; return; }
    }
  }
  if (f.flags >> ids[idx] & 1) f.flags ^= 1 << ids[idx];
}

function tryLoseFansFromPlayTime(f: { flags: number }): void {
  if (playTimeHours() >= 999) return;
  for (let i = 0; ; i++) {
    if (numFans(f.flags) < 5) { varSet(C.VAR_FANCLUB_LOSE_FAN_TIMER, playTimeHours()); break; }
    if (i === 8) break;
    const timer = varGet(C.VAR_FANCLUB_LOSE_FAN_TIMER);
    if (playTimeHours() - timer < 12) break;
    loseRandomFan(f);
    varSet(C.VAR_FANCLUB_LOSE_FAN_TIMER, varGet(C.VAR_FANCLUB_LOSE_FAN_TIMER) + 12);
  }
}

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

function animateElevator(ctx: ScriptRunner): void {
  const ow = ctx.ow;
  const from = varGet(SV.x8005), to = varGet(SV.x8006);
  const up = from > to ? 1 : 0;
  const nfloors = Math.min(8, Math.abs(from - to));
  const durations = [8, 16, 24, 32, 38, 46, 53, 56, 57];
  const windowDurations = [3, 6, 9, 12, 15, 18, 21, 24, 27];
  const total = durations[nfloors];
  let d1 = 0, d2 = 0, d4 = 1;
  sound.playSE(C.SE_ELEVATOR);
  const shake = tasks.create(() => {
    if (++d1 % 3 !== 0) return;
    d1 = 0;
    d2++;
    d4 = -d4;
    ow.panY = d4;
    if (d2 === total) {
      ow.panY = 0;
      sound.playSE(C.SE_DING_DONG);
      tasks.destroy(shake);
      ow.script.enable();
    }
  }, 9);
  // Task_AnimateElevatorWindowView: the window metatiles cycle every 6 frames.
  const k = rom.constants;
  const tiles = (row: string, i: number) => k[`METATILE_SilphCo_ElevatorWindow_${row}${i}`];
  const goingUp = [["Top", [0, 1, 2]], ["Mid", [0, 1, 2]], ["Bottom", [0, 1, 2]]] as const;
  const goingDown = [["Top", [0, 2, 1]], ["Mid", [0, 2, 1]], ["Bottom", [0, 2, 1]]] as const;
  if (tiles("Top", 0) === undefined) return;
  let w0 = 0, w1 = 0;
  const window = tasks.create(() => {
    if (w1 === 6) {
      w0++;
      const table = up ? goingDown : goingUp;
      for (let i = 0; i < 3; i++) {
        const [row, order] = table[i];
        for (let j = 0; j < 3; j++) ow.map.setMetatileIdAt(j + 1 + MAP_OFFSET, i + MAP_OFFSET, tiles(row, order[w0 % 3]) | 0x0c00);
      }
      ow.renderer?.invalidate();
      w1 = 0;
      if (w0 === windowDurations[nfloors]) tasks.destroy(window);
    }
    w1++;
  }, 8);
}

// ---------------------------------------------------------------- berry powder vendor

let powderWindow: Window | undefined;
function berryPowder(): number { return save.berryPowder ?? 0; }
/** GiveBerryPowder; Berry Crush is not yet ported, but this C API caps storage at 99,999. */
export function GiveBerryPowder(amountToAdd: number): boolean {
  const amount = ((berryPowder() >>> 0) + (amountToAdd >>> 0)) >>> 0;
  save.berryPowder = Math.min(amount, 99999);
  return amount <= 99999;
}
function drawPowder(): void {
  if (!powderWindow) return;
  powderWindow.fill(1);
  printText(powderWindow, FONT_SMALL, rom.text("gOtherText_Powder"), 0, 0);
  printText(powderWindow, FONT_SMALL, intToDecimal(berryPowder(), STR_CONV_MODE_RIGHT_ALIGN, 5), 39, 12);
}

// ---------------------------------------------------------------- SS Anne departure (ss_anne.c)

function ssAnneDeparture(ctx: ScriptRunner): void {
  const ow = ctx.ow;
  sound.playSE(C.SE_SS_ANNE_HORN);
  const pal = Array.from(incbinU16("gObjectEventPal_SSAnne"));
  const wakeTiles = incbin("sWakeTiles"), smokeTiles = incbin("sSmokeTiles");
  const wakeFrames = [0, 1].map((f) => spriteSheet(wakeTiles.subarray(f * 256, f * 256 + 256), pal, 16, 32));
  const smokeFrames = [0, 1, 2, 3].map((f) => spriteSheet(smokeTiles.subarray(f * 128, f * 128 + 128), pal, 16, 16));
  const boat = (): Sprite | undefined => ow.objects.byLocalIdAndMap(1, save.location.mapNum, save.location.mapGroup)?.sprite;
  let wait = 50, d1 = 0, d2 = 0, d3 = 0, state = 0;
  const makeWake = (): void => {
    const b = boat();
    if (!b) return;
    const s = new Sprite();
    s.width = 16; s.height = 32; s.centerToCornerVecX = -8; s.centerToCornerVecY = -16;
    s.priority = 2; s.subpriority = 0xff; s.y = 109; s.coordOffsetEnabled = false;
    s.anims = [[["F", 0, 12, 0, 0], ["F", 1, 12, 0, 0], ["J", 0]]];
    s.startAnim(0);
    s.draw = (c, x, y) => c.drawImage(wakeFrames[s.imageValue] ?? wakeFrames[0], x, y);
    s.callback = (sp) => {
      const bb = boat();
      if (!bb) { ow.sprites.destroy(sp); return; }
      sp.x = bb.x + bb.x2 + 80 + ow.sprites.offsetX;
      if (Math.floor(sp.data[0] / 6) < 22) sp.data[0]++;
      sp.x2 = Math.floor(sp.data[0] / 6);
      if (sp.x + sp.x2 < -18) ow.sprites.destroy(sp);
    };
    ow.sprites.add(s);
  };
  const makeSmoke = (): void => {
    const b = boat();
    if (!b) return;
    const x = b.x + b.x2 + 49 + ow.sprites.offsetX;
    if (x < -32) return;
    const s = new Sprite();
    s.width = 16; s.height = 16; s.centerToCornerVecX = -8; s.centerToCornerVecY = -8;
    s.x = x; s.y = 78; s.priority = 2; s.subpriority = 8; s.coordOffsetEnabled = false;
    s.anims = [[["F", 0, 10, 0, 0], ["F", 1, 20, 0, 0], ["F", 2, 20, 0, 0], ["F", 3, 30, 0, 0], ["E"]]];
    s.startAnim(0);
    s.draw = (c, dx, dy) => c.drawImage(smokeFrames[s.imageValue] ?? smokeFrames[0], dx, dy);
    s.callback = (sp) => { sp.data[0]++; sp.x2 = Math.floor(sp.data[0] / 4); if (sp.animEnded) ow.sprites.destroy(sp); };
    ow.sprites.add(s);
  };
  const id = tasks.create(() => {
    if (state === 0) {
      if (--wait === 0) { makeWake(); state = 1; }
      return;
    }
    if (state === 1) {
      d1++; d2++;
      if (d1 === 70) { d1 = 0; makeSmoke(); }
      const b = boat();
      if (!b || b.x + b.x2 < -120) { sound.playSE(C.SE_SS_ANNE_HORN); state = 2; return; }
      b.x2 = -Math.floor(d2 / 5);
      return;
    }
    if (++d3 === 40) { tasks.destroy(id); ctx.ow.script.enable(); }
  }, 8);
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
  CompareHeracrossSize: () => { varSet(SV.RESULT, compareMonSize(C.SPECIES_HERACROSS, C.VAR_HERACROSS_SIZE_RECORD)); },
  CompareMagikarpSize: () => { varSet(SV.RESULT, compareMonSize(C.SPECIES_MAGIKARP, C.VAR_MAGIKARP_SIZE_RECORD)); },
  GetHeracrossSizeRecordInfo: () => { sizeRecordInfo(C.SPECIES_HERACROSS, C.VAR_HERACROSS_SIZE_RECORD); },
  GetMagikarpSizeRecordInfo: () => { sizeRecordInfo(C.SPECIES_MAGIKARP, C.VAR_MAGIKARP_SIZE_RECORD); },
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
    const bonus = (i: number) => (mon.ppBonuses >> (i * 2)) & 3;
    const moves = [...mon.moves], pp = [...mon.pp], bonuses = [0, 1, 2, 3].map(bonus);
    moves.splice(slot, 1); pp.splice(slot, 1); bonuses.splice(slot, 1);
    moves.push(0); pp.push(0); bonuses.push(0);
    mon.moves = moves; mon.pp = pp;
    mon.ppBonuses = bonuses.reduce((acc, b, i) => acc | (b << (i * 2)), 0);
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
    const stat = (i: number) => save.gameStats[i] ?? 0;
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
  HasAtLeastOneBerry: () => (save.bag.berryPouch.some((s) => s.quantity > 0) ? 1 : 0),
  GetMartClerkObjectId: () => {
    for (const [g, n, id] of cdata<number[][]>("field_specials", "sMartMaps")) if (save.location.mapGroup === g && save.location.mapNum === n) return id;
    return 1;
  },
  UpdateLoreleiDollCollection: () => {
    const n = save.gameStats[C.GAME_STAT_ENTERED_HOF] ?? 0;
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
    const has = save.party.some((m) => m.heldItem === C.ITEM_ENIGMA_BERRY);
    if (has) stringVars.var1 = encode("ENIGMA");
    return has ? 1 : 0;
  },
  IsDodrioInParty: () => { varSet(SV.RESULT, save.party.some((m) => !m.isEgg && m.species === C.SPECIES_DODRIO) ? 1 : 0); },
  IsPokemonJumpSpeciesInParty: () => {
    const allowed = new Set(cdata<Array<{ species: number }>>("pokemon_jump", "sPokeJumpMons").map((e) => e.species));
    varSet(SV.RESULT, save.party.some((m) => !m.isEgg && allowed.has(m.species)) ? 1 : 0);
  },
  SetIcefallCaveCrackedIceMetatiles: (ctx) => {
    const coords = [[8, 3], [10, 5], [15, 5], [8, 9], [9, 9], [16, 9], [8, 10], [9, 10], [8, 14]];
    coords.forEach(([x, y], i) => { if (flagGet(i + 1)) ctx.ow.map.setMetatileIdAt(x + MAP_OFFSET, y + MAP_OFFSET, rom.c("METATILE_SeafoamIslands_CrackedIce")); });
  },
  SeafoamIslandsB4F_CurrentDumpsPlayerOnLand: (ctx) => { ctx.ow.player.createStopSurfingTask(C.DIR_NORTH); },
  IsPlayerNotInTrainerTowerLobby: () => (mapIs("MAP_TRAINER_TOWER_LOBBY") ? 0 : 1),
  DaisyMassageServices: () => {
    const mon = save.party[varGet(SV.x8004)];
    if (mon) adjustFriendship(mon, 3); // FRIENDSHIP_EVENT_MASSAGE: +3 at every tier
    varSet(C.VAR_MASSAGE_COOLDOWN_STEP_COUNTER, 0);
  },
  SetPostgameFlags: () => {
    const s = save as unknown as { specialSaveWarpFlags?: number; gcnLinkFlags?: number };
    s.specialSaveWarpFlags = (s.specialSaveWarpFlags ?? 0) | 0x80; // CHAMPION_SAVEWARP
    s.gcnLinkFlags = (s.gcnLinkFlags ?? 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 15);
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
  AnimateElevator: (ctx) => { animateElevator(ctx); },
  // berry powder
  Script_HasEnoughBerryPowder: () => (berryPowder() >= varGet(SV.x8004) ? 1 : 0),
  Script_TakeBerryPowder: () => {
    if (berryPowder() < varGet(SV.x8004)) return 0;
    save.berryPowder = berryPowder() - varGet(SV.x8004);
    return 1;
  },
  DisplayBerryPowderVendorMenu: (ctx) => {
    powderWindow = new Window(2, 2, 8, 3);
    powderWindow.frame = "std";
    powderWindow.frameType = save.options.frameType;
    ctx.ow.windows.add(powderWindow);
    drawPowder();
  },
  PrintPlayerBerryPowderAmount: () => { drawPowder(); },
  RemoveBerryPowderVendorMenu: (ctx) => { ctx.ow.windows.remove(powderWindow); powderWindow = undefined; },
  // trainer fan club
  Script_TryLoseFansFromPlayTimeAfterLinkBattle: () => {
    const f = fanClub();
    if (f.got) { tryLoseFansFromPlayTime(f); varSet(C.VAR_FANCLUB_LOSE_FAN_TIMER, playTimeHours()); setFanClub(f); }
  },
  Script_UpdateTrainerFanClubGameClear: () => {
    const f = fanClub();
    if (f.got) return;
    f.got = true;
    f.flags |= (1 << C.FANCLUB_MEMBER1) | (1 << C.FANCLUB_MEMBER2) | (1 << C.FANCLUB_MEMBER3);
    setFanClub(f);
    varSet(C.VAR_FANCLUB_LOSE_FAN_TIMER, playTimeHours());
    flagClear(C.FLAG_HIDE_SAFFRON_FAN_CLUB_BLACK_BELT);
    flagClear(C.FLAG_HIDE_SAFFRON_FAN_CLUB_ROCKER);
    flagClear(C.FLAG_HIDE_SAFFRON_FAN_CLUB_WOMAN);
    flagClear(C.FLAG_HIDE_SAFFRON_FAN_CLUB_BEAUTY);
    varSet(C.VAR_MAP_SCENE_SAFFRON_CITY_POKEMON_TRAINER_FAN_CLUB, 1);
  },
  Script_TryGainNewFanFromCounter: () => {
    const f = fanClub();
    if (varGet(C.VAR_MAP_SCENE_SAFFRON_CITY_POKEMON_TRAINER_FAN_CLUB) === 2) {
      const inc = [2, 1, 2, 1][varGet(SV.x8004)] ?? 1;
      if (f.timer + inc >= 20) {
        if (numFans(f.flags) < 3) { gainRandomFan(f); f.timer = 0; } else f.timer = 20;
      } else f.timer += inc;
    }
    setFanClub(f);
    return f.timer;
  },
  Script_GetNumFansOfPlayerInTrainerFanClub: () => numFans(fanClub().flags),
  Script_TryLoseFansFromPlayTime: () => { const f = fanClub(); tryLoseFansFromPlayTime(f); setFanClub(f); },
  Script_IsFanClubMemberFanOfPlayer: () => (fanClub().flags >> varGet(SV.x8004) & 1),
  Script_SetPlayerGotFirstFans: () => { const f = fanClub(); f.got = true; setFanClub(f); },
  Script_BufferFanClubTrainerName: () => {
    // No link battle records exist, so the NPC names are used (BufferFanClubTrainerName).
    const m = varGet(SV.x8004);
    const npc = m === C.FANCLUB_MEMBER5 ? 1 : m === C.FANCLUB_MEMBER7 ? 2 : 0;
    stringVars.var1 = npc === 1 ? rom.text("gText_LtSurge") : npc === 2 ? rom.text("gText_Koga") : Uint8Array.from(save.rivalName);
  },
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
  SetCableClubWarp: () => {},
  Script_ShowLinkTrainerCard: (ctx) => { enableLater(ctx); },
  StartSpecialBattle: (ctx) => { enableLater(ctx); },
  BufferEReaderTrainerGreeting: () => { stringVars.var1 = encode(""); },
  BufferEReaderTrainerName: () => { stringVars.var1 = encode(""); },
  SetEReaderTrainerGfxId: () => {},
  ShowEasyChatScreen: (ctx) => { enableLater(ctx); },
  ShowEasyChatMessage: () => {},
  // records (no link or minigame history exists)
  ShowBattleRecords: (ctx) => {
    stringVars.player = Uint8Array.from(save.playerName);
    stringVars.var1 = encode("0"); stringVars.var2 = encode("0"); stringVars.var3 = encode("0");
    const title = expandPlaceholders(rom.text("gString_BattleRecords_PlayersBattleResults"));
    const total = expandPlaceholders(rom.text("gString_BattleRecords_TotalRecord"));
    ctx.ow.game.showMessageThenEnable(Uint8Array.from([...title.subarray(0, title.indexOf(0xff)), 0xfe, ...total]));
  },
  ShowBerryCrushRankings: (ctx) => { ctx.ow.game.showMessageThenEnable(encode("BERRY CRUSH\n----")); },
  ShowDodrioBerryPickingRecords: (ctx) => { ctx.ow.game.showMessageThenEnable(Uint8Array.from([...rom.text("gText_BerryPickingRecords").filter((b) => b !== 0xff), 0xfe, ...encode("----")])); },
  ShowPokemonJumpRecords: (ctx) => { ctx.ow.game.showMessageThenEnable(Uint8Array.from([...rom.text("gText_PkmnJumpRecords").filter((b) => b !== 0xff), 0xfe, ...encode("----")])); },
  UpdateTrainerCardPhotoIcons: () => {},
  // Braille cursor (sBrailleTextCursorSpriteID)
  BrailleCursorToggle: (ctx) => { ctx.ow.game.scriptMenu.brailleCursor(varGet(SV.x8004) + 27, varGet(SV.x8005), varGet(SV.x8006) === 0); },
  // box name buffer
  BufferBoxName: () => { stringVars.var1 = getBoxName(varGet(SV.x8004)); },
};

void intToDecimal; void STR_CONV_MODE_LEFT_ALIGN;
