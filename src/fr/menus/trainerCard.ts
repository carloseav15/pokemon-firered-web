// Port of trainer_card.c from pokefirered (1959 lines).
// Faithful port to GBA hardware layer (HwScene / PPU / scanline / bg / window / palette).
//
// Background mapping:
//   BG0: priority 2, char base 0, map base 27 - card front/back tilemap
//   BG1: priority 0, char base 2, map base 29 - text windows
//   BG2: priority 3, char base 0, map base 30 - card background grid pattern
//   BG3: priority 1, char base 0, map base 31, baseTile 192 - badges, stars, trainer pic, mon icons
//
// Windows:
//   Window 0: (2, 15), 26x4 - link wait box
//   Window 1: (1, 1), 27x18 - main card text (Name, ID, Money, Pokedex, Time with blinking colon)
//   Window 2: (19, 5), 9x10 on BG3 - front trainer pic (Red/Leaf)
//
// Features:
//   - Authentic card flip 3D perspective distortion using scanline effect on BG0 & WIN0V
//   - Audio effects: SE_CARD_OPEN, SE_CARD_FLIP, SE_CARD_FLIPPING
//   - Star colors: Blue (0), Green (1), Bronze (2), Silver (3), Gold (4)
//   - Female palette tint for Leaf
//   - Kanto Badges 1-8 drawn on BG3 as 2x2 tile blocks
//   - Hall of Fame records & debut time on back
//   - Blinking play time colon (60 frames cycle)

import { sound } from "../audio/sound";
import { concat, copy, intToDecimal, length, STR_CONV_MODE_LEADING_ZEROS, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "../gba/charmap";
import { FONT_NORMAL } from "../gba/font";
import { A_BUTTON, B_BUTTON, joy } from "../gba/input";
import { tasks, TAIL_SENTINEL } from "../gba/tasks";
import * as C from "../generated/constants";
import { cdata, incbin, incbin16, loadCData, preloadPacks, symName, type SymRef } from "../hw/assets";
import {
  ChangeBgX, ChangeBgY, CopyBgTilemapBufferToVram, FillBgTilemapBufferRect, FillBgTilemapBufferRect_Palette0,
  InitBgsFromTemplates, LoadBgTiles, ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, HideBg,
  WriteSequenceToBgTilemapBuffer, type BgTemplate,
} from "../hw/bg";
import { SetGpuReg } from "../hw/gpu";
import { LoadStdWindowFrameGfx } from "../hw/menu";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, LoadPalette, PALETTES_ALL, PLTT_SIZE_4BPP, ResetPaletteFade,
  RGB_BLACK, TintPalette_CustomTone, TintPalette_SepiaTone, TransferPlttBuffer, UpdatePaletteFade,
} from "../hw/palette";
import {
  ppu, REG_OFFSET_BG0CNT, REG_OFFSET_BG0HOFS, REG_OFFSET_BG0VOFS, REG_OFFSET_BG1CNT, REG_OFFSET_BG1HOFS,
  REG_OFFSET_BG1VOFS, REG_OFFSET_BG2CNT, REG_OFFSET_BG2HOFS, REG_OFFSET_BG2VOFS, REG_OFFSET_BG3CNT,
  REG_OFFSET_BG3HOFS, REG_OFFSET_BG3VOFS, REG_OFFSET_BLDCNT, REG_OFFSET_BLDY, REG_OFFSET_DISPCNT,
  REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT,
  DISPCNT_BG_ALL_ON, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, DISPCNT_WIN0_ON,
  BLDCNT_EFFECT_DARKEN, BLDCNT_TGT1_BG0, WIN_RANGE,
  WININ_WIN0_BG_ALL, WININ_WIN0_CLR, WININ_WIN0_OBJ,
  WINOUT_WIN01_BG1, WINOUT_WIN01_BG2, WINOUT_WIN01_BG3, WINOUT_WIN01_OBJ,
} from "../hw/ppu";
import { gMain, SetHBlankCallback, SetMainCallback2, SetVBlankCallback } from "../hw/runtime";
import { gScanlineEffectRegBuffers, ScanlineEffect_Clear, ScanlineEffect_Stop } from "../hw/scanline";
import { AddTextPrinterParameterized3, DeactivateAllTextPrinters } from "../hw/text";
import {
  BlitBitmapRectToWindow, COPYWIN_FULL, CopyWindowToVram, FillWindowPixelBuffer, FillWindowPixelRect,
  FreeAllWindowBuffers, InitWindows, PIXEL_FILL, PutWindowTilemap, type WindowTemplate,
} from "../hw/window";
import { GetKantoPokedexCount, GetNationalPokedexCount, HasAllKantoMons, HasAllMons } from "../pokemon/pokemon";
import { GetIconSpecies, GetMonIconPaletteIndexFromSpecies, GetMonIconTiles } from "../pokemonIcon";
import { MailSpeciesToSpecies } from "../pokemon/mail";
import { rom } from "../rom";
import { flagGet, GetGameStat, IsNationalPokedexEnabled, save, varGet } from "../save";

const CARD_TYPE_FRLG = 0;
const TEXT_SKIP_DRAW = 0xff;

// Text IDs for strings buffer
const TRAINER_CARD_STRING_NAME = 0;
const TRAINER_CARD_STRING_HOF_TIME = 1;
const TRAINER_CARD_STRING_LINK_RECORD = 2;
const TRAINER_CARD_STRING_WIN_LOSS = 3;
const TRAINER_CARD_STRING_LINK_WINS = 4;
const TRAINER_CARD_STRING_LINK_LOSSES = 5;
const TRAINER_CARD_STRING_TRADES = 6;
const TRAINER_CARD_STRING_TRADE_COUNT = 7;
const TRAINER_CARD_STRING_BERRY_CRUSH = 8;
const TRAINER_CARD_STRING_BERRY_CRUSH_COUNT = 9;
const TRAINER_CARD_STRING_UNION_ROOM = 10;
const TRAINER_CARD_STRING_UNION_ROOM_NUM = 11;

// Task states for Task_TrainerCard
const STATE_HANDLE_INPUT_FRONT = 10;
const STATE_HANDLE_INPUT_BACK = 11;
const STATE_WAIT_FLIP_TO_BACK = 12;
const STATE_WAIT_FLIP_TO_FRONT = 13;
const STATE_CLOSE_CARD = 14;

export function MailSpeciesToIconSpecies(species: number): number {
  const { species: s, unownLetter } = MailSpeciesToSpecies(species);
  if (s === C.SPECIES_UNOWN) {
    if (unownLetter === 0) return C.SPECIES_UNOWN;
    return C.SPECIES_UNOWN_B - 1 + unownLetter;
  }
  if (species > C.SPECIES_UNOWN_B - 1) return C.SPECIES_NONE;
  return GetIconSpecies(species, 0);
}

interface TrainerCardFields {
  gender: number;
  stars: number;
  hasPokedex: boolean;
  caughtAllHoenn: boolean;
  hasAllPaintings: boolean;
  hofDebutHours: number;
  hofDebutMinutes: number;
  hofDebutSeconds: number;
  caughtMonsCount: number;
  trainerId: number;
  playTimeHours: number;
  playTimeMinutes: number;
  linkBattleWins: number;
  linkBattleLosses: number;
  battleTowerWins: number;
  battleTowerStraightWins: number;
  contestsWithFriends: number;
  pokeblocksWithFriends: number;
  pokemonTrades: number;
  money: number;
  easyChatProfile: number[];
  playerName: Uint8Array;
  version: number;
  hasAllFrontierSymbols: boolean;
  berryCrushPoints: number;
  unionRoomNum: number;
  berriesPicked: number;
  jumpsInRow: number;
  shouldDrawStickers: boolean;
  hasAllMons: boolean;
  monIconTint: number;
  facilityClass: number;
  stickers: number[];
  monSpecies: number[];
}

interface TrainerCardData {
  mainState: number;
  printState: number;
  gfxLoadState: number;
  bgPalLoadState: number;
  flipDrawState: number;
  isLink: boolean;
  timeColonBlinkTimer: number;
  timeColonInvisible: boolean;
  onBack: boolean;
  allowDMACopy: boolean;
  hasPokedex: boolean;
  hasHofResult: boolean;
  hasLinkResults: boolean;
  hasBattleTowerWins: boolean;
  var_E: boolean;
  var_F: boolean;
  hasTrades: boolean;
  hasBadge: boolean[];
  strings: Uint8Array[];
  monIconPals: Uint16Array;
  flipBlendY: number;
  cardType: number;
  callback2: (() => void) | null;
  trainerCard: TrainerCardFields;
  frontTilemap: Uint16Array;
  backTilemap: Uint16Array;
  bgTilemap: Uint16Array;
  badgeTiles: Uint8Array;
  stickerTiles: Uint16Array;
  cardTiles: Uint8Array;
  cardTilemapBuffer: Uint16Array;
  bgTilemapBuffer: Uint16Array;
  cardTop: number;
  timeColonNeedDraw: boolean;
  language: number;
}

let sTrainerCardDataPtr: TrainerCardData | null = null;

function emptyTrainerCard(): TrainerCardFields {
  return {
    gender: 0,
    stars: 0,
    hasPokedex: false,
    caughtAllHoenn: false,
    hasAllPaintings: false,
    hofDebutHours: 0,
    hofDebutMinutes: 0,
    hofDebutSeconds: 0,
    caughtMonsCount: 0,
    trainerId: 0,
    playTimeHours: 0,
    playTimeMinutes: 0,
    linkBattleWins: 0,
    linkBattleLosses: 0,
    battleTowerWins: 0,
    battleTowerStraightWins: 0,
    contestsWithFriends: 0,
    pokeblocksWithFriends: 0,
    pokemonTrades: 0,
    money: 0,
    easyChatProfile: [0, 0, 0, 0],
    playerName: new Uint8Array(0),
    version: C.VERSION_FIRE_RED,
    hasAllFrontierSymbols: false,
    berryCrushPoints: 0,
    unionRoomNum: 0,
    berriesPicked: 0,
    jumpsInRow: 0,
    shouldDrawStickers: false,
    hasAllMons: false,
    monIconTint: 0,
    facilityClass: 0,
    stickers: [0, 0, 0],
    monSpecies: [0, 0, 0, 0, 0, 0],
  };
}

function emptyData(): TrainerCardData {
  return {
    mainState: 0,
    printState: 0,
    gfxLoadState: 0,
    bgPalLoadState: 0,
    flipDrawState: 0,
    isLink: false,
    timeColonBlinkTimer: 0,
    timeColonInvisible: false,
    onBack: false,
    allowDMACopy: false,
    hasPokedex: false,
    hasHofResult: false,
    hasLinkResults: false,
    hasBattleTowerWins: false,
    var_E: false,
    var_F: false,
    hasTrades: false,
    hasBadge: new Array(8).fill(false),
    strings: Array.from({ length: 12 }, () => new Uint8Array(0)),
    monIconPals: new Uint16Array(96),
    flipBlendY: 0,
    cardType: CARD_TYPE_FRLG,
    callback2: null,
    trainerCard: emptyTrainerCard(),
    frontTilemap: new Uint16Array(600),
    backTilemap: new Uint16Array(600),
    bgTilemap: new Uint16Array(600),
    badgeTiles: new Uint8Array(1024),
    stickerTiles: new Uint16Array(256),
    cardTiles: new Uint8Array(0x1800),
    cardTilemapBuffer: new Uint16Array(2048),
    bgTilemapBuffer: new Uint16Array(1024),
    cardTop: 0,
    timeColonNeedDraw: false,
    language: 2, // English
  };
}

// ---------------------------------------------------------------- Card Data Setup

function SetPlayerCardData(card: TrainerCardFields, _cardType: number): void {
  const c = rom.constants;
  card.gender = save.playerGender;

  const totalSeconds = Math.floor(save.playTimeFrames / 60);
  card.playTimeHours = Math.min(999, Math.floor(totalSeconds / 3600));
  card.playTimeMinutes = Math.floor(totalSeconds / 60) % 60;

  const enteredHof = GetGameStat(c.GAME_STAT_ENTERED_HOF) > 0;
  const playTime = enteredHof ? GetGameStat(c.GAME_STAT_FIRST_HOF_PLAY_TIME) : 0;
  card.hofDebutHours = Math.min(999, playTime >>> 16);
  card.hofDebutMinutes = (playTime >>> 8) & 0xff;
  card.hofDebutSeconds = playTime & 0xff;

  card.hasPokedex = flagGet(c.FLAG_SYS_POKEDEX_GET);
  card.caughtAllHoenn = false;
  card.caughtMonsCount = GetCaughtMonsCount();

  card.trainerId = save.trainerId & 0xffff;
  card.linkBattleWins = GetCappedGameStat(c.GAME_STAT_LINK_BATTLE_WINS, 9999);
  card.linkBattleLosses = GetCappedGameStat(c.GAME_STAT_LINK_BATTLE_LOSSES, 9999);
  card.pokemonTrades = GetCappedGameStat(c.GAME_STAT_POKEMON_TRADES, 0xffff);

  card.battleTowerWins = 0;
  card.battleTowerStraightWins = 0;
  card.contestsWithFriends = 0;
  card.pokeblocksWithFriends = 0;
  card.hasAllPaintings = false;

  card.money = save.money;
  card.playerName = Uint8Array.from(save.playerName);
}

/** GetCappedGameStat (trainer_card.c): both parameters and the result are unsigned 32-bit values. */
function GetCappedGameStat(statId: number, maxValue: number): number {
  const statValue = GetGameStat(statId & 0xff) >>> 0;
  return Math.min(maxValue >>> 0, statValue) >>> 0;
}

/** GetCaughtMonsCount (trainer_card.c): the active National Dex chooses the national count. */
function GetCaughtMonsCount(): number {
  return (IsNationalPokedexEnabled()
    ? GetNationalPokedexCount(C.FLAG_GET_CAUGHT)
    : GetKantoPokedexCount(C.FLAG_GET_CAUGHT)) & 0xffff;
}

function TrainerCard_GenerateCardForLinkPlayer(card: TrainerCardFields): void {
  const c = rom.constants;
  card.version = C.VERSION_FIRE_RED;
  SetPlayerCardData(card, CARD_TYPE_FRLG);

  let stars = 0;
  if (card.hofDebutHours !== 0 || card.hofDebutMinutes !== 0 || card.hofDebutSeconds !== 0) {
    stars = 1;
  }

  // HasAllKantoMons: 150 caught
  const hasKanto = HasAllKantoMons();
  card.caughtAllHoenn = hasKanto;
  // HasAllMons: 380 caught (excluding Mew, Lugia, Ho-Oh, Celebi, Jirachi, Deoxys)
  const hasAll = HasAllMons();
  card.hasAllMons = hasAll;

  card.berriesPicked = 0;
  card.jumpsInRow = 0;
  card.berryCrushPoints = Math.min(0xffff, GetGameStat(c.GAME_STAT_BERRY_CRUSH_POINTS));
  card.unionRoomNum = Math.min(0xffff, GetGameStat(c.GAME_STAT_NUM_UNION_ROOM_BATTLES));
  card.shouldDrawStickers = true;

  if (card.caughtAllHoenn) stars++;
  if (card.hasAllMons) stars++;
  if (card.berriesPicked >= 200 && card.jumpsInRow >= 200) stars++;
  card.stars = Math.min(4, stars);

  card.facilityClass = card.gender === C.FEMALE ? C.FACILITY_CLASS_LEAF : C.FACILITY_CLASS_RED;

  card.stickers[0] = varGet(C.VAR_HOF_BRAG_STATE) ?? 0;
  card.stickers[1] = varGet(C.VAR_EGG_BRAG_STATE) ?? 0;
  card.stickers[2] = varGet(C.VAR_LINK_WIN_BRAG_STATE) ?? 0;

  card.monIconTint = varGet(C.VAR_TRAINER_CARD_MON_ICON_TINT_IDX) ?? 0;

  card.monSpecies[0] = MailSpeciesToIconSpecies(varGet(C.VAR_TRAINER_CARD_MON_ICON_1) ?? 0);
  card.monSpecies[1] = MailSpeciesToIconSpecies(varGet(C.VAR_TRAINER_CARD_MON_ICON_2) ?? 0);
  card.monSpecies[2] = MailSpeciesToIconSpecies(varGet(C.VAR_TRAINER_CARD_MON_ICON_3) ?? 0);
  card.monSpecies[3] = MailSpeciesToIconSpecies(varGet(C.VAR_TRAINER_CARD_MON_ICON_4) ?? 0);
  card.monSpecies[4] = MailSpeciesToIconSpecies(varGet(C.VAR_TRAINER_CARD_MON_ICON_5) ?? 0);
  card.monSpecies[5] = MailSpeciesToIconSpecies(varGet(C.VAR_TRAINER_CARD_MON_ICON_6) ?? 0);
}

function SetDataFromTrainerCard(): void {
  if (!sTrainerCardDataPtr) return;
  const d = sTrainerCardDataPtr;
  d.hasPokedex = d.trainerCard.hasPokedex;
  d.hasHofResult = d.trainerCard.hofDebutHours !== 0 || d.trainerCard.hofDebutMinutes !== 0 || d.trainerCard.hofDebutSeconds !== 0;
  d.hasLinkResults = d.trainerCard.linkBattleWins !== 0 || d.trainerCard.linkBattleLosses !== 0;
  d.hasTrades = d.trainerCard.pokemonTrades !== 0;

  const baseBadge = rom.constants.FLAG_BADGE01_GET ?? C.FLAG_BADGE01_GET;
  for (let i = 0; i < 8; i++) {
    d.hasBadge[i] = flagGet(baseBadge + i);
  }
}

function InitTrainerCardData(): void {
  if (!sTrainerCardDataPtr) return;
  const d = sTrainerCardDataPtr;
  d.mainState = 0;
  d.timeColonBlinkTimer = 0;
  d.timeColonInvisible = false;
  d.onBack = false;
  d.flipBlendY = 0;
  d.cardType = CARD_TYPE_FRLG;
  d.timeColonNeedDraw = false;
  d.allowDMACopy = false;
  d.printState = 0;
  d.gfxLoadState = 0;
  d.bgPalLoadState = 0;
  d.flipDrawState = 0;
}

// ---------------------------------------------------------------- GPU and Text

const sTrainerCardTextColors = [0, 2, 3];
const sTrainerCardStatColors = [0, 4, 5];
const sTimeColonInvisibleTextColors = [0, 0, 0];

function ResetGpuRegs(): void {
  SetVBlankCallback(null);
  SetHBlankCallback(null);
  SetGpuReg(REG_OFFSET_DISPCNT, 0);
}

/** DmaClearOam (trainer_card.c): clear the complete 0x400-byte GBA OAM region. */
function DmaClearOam(): void {
  ppu.oam.fill(0);
}

/** DmaClearPltt (trainer_card.c): clear the complete 0x400-byte GBA palette RAM region. */
function DmaClearPltt(): void {
  ppu.pltt.fill(0);
}

function ResetBgRegs(): void {
  SetGpuReg(REG_OFFSET_BG0CNT, 0);
  SetGpuReg(REG_OFFSET_BG1CNT, 0);
  SetGpuReg(REG_OFFSET_BG2CNT, 0);
  SetGpuReg(REG_OFFSET_BG3CNT, 0);
  SetGpuReg(REG_OFFSET_BG0HOFS, 0);
  SetGpuReg(REG_OFFSET_BG0VOFS, 0);
  SetGpuReg(REG_OFFSET_BG1HOFS, 0);
  SetGpuReg(REG_OFFSET_BG1VOFS, 0);
  SetGpuReg(REG_OFFSET_BG2HOFS, 0);
  SetGpuReg(REG_OFFSET_BG2VOFS, 0);
  SetGpuReg(REG_OFFSET_BG3HOFS, 0);
  SetGpuReg(REG_OFFSET_BG3VOFS, 0);
}

function HandleGpuRegs(): void {
  ShowBg(0);
  ShowBg(1);
  ShowBg(2);
  ShowBg(3);
  SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON | DISPCNT_OBJ_ON | DISPCNT_OBJ_1D_MAP | DISPCNT_BG_ALL_ON);
  SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT1_BG0 | BLDCNT_EFFECT_DARKEN);
  SetGpuReg(REG_OFFSET_BLDY, 0);
  SetGpuReg(REG_OFFSET_WININ, WININ_WIN0_BG_ALL | WININ_WIN0_OBJ | WININ_WIN0_CLR);
  SetGpuReg(REG_OFFSET_WINOUT, WINOUT_WIN01_BG1 | WINOUT_WIN01_BG2 | WINOUT_WIN01_BG3 | WINOUT_WIN01_OBJ);
  SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(0, 160));
  SetGpuReg(REG_OFFSET_WIN0H, WIN_RANGE(0, 240));
}

function UpdateCardFlipRegs(cardTop: number): void {
  if (!sTrainerCardDataPtr) return;
  let blendY = Math.trunc((cardTop + 40) / 10);
  if (blendY <= 4) blendY = 0;
  sTrainerCardDataPtr.flipBlendY = blendY;
  SetGpuReg(REG_OFFSET_BLDY, sTrainerCardDataPtr.flipBlendY);
  SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(sTrainerCardDataPtr.cardTop, 160 - sTrainerCardDataPtr.cardTop));
}

function InitBgsAndWindows(): void {
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, cdata<BgTemplate[]>("trainer_card", "sTrainerCardBgTemplates"));
  ChangeBgX(0, 0, 0);
  ChangeBgY(0, 0, 0);
  ChangeBgX(1, 0, 0);
  ChangeBgY(1, 0, 0);
  ChangeBgX(2, 0, 0);
  ChangeBgY(2, 0, 0);
  ChangeBgX(3, 0, 0);
  ChangeBgY(3, 0, 0);
  InitWindows(cdata<WindowTemplate[]>("trainer_card", "sTrainerCardWindowTemplates"));
  DeactivateAllTextPrinters();
}

function DrawTrainerCardWindow(windowId: number): void {
  PutWindowTilemap(windowId);
  CopyWindowToVram(windowId, COPYWIN_FULL);
}

function DrawCardScreenBackground(ptr: Uint16Array): void {
  if (!sTrainerCardDataPtr) return;
  const dst = sTrainerCardDataPtr.bgTilemapBuffer;
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 32; j++) {
      if (j < 30) dst[32 * i + j] = ptr[30 * i + j];
      else dst[32 * i + j] = ptr[0];
    }
  }
  CopyBgTilemapBufferToVram(2);
}

function DrawCardFrontOrBack(ptr: Uint16Array): void {
  if (!sTrainerCardDataPtr) return;
  const dst = sTrainerCardDataPtr.cardTilemapBuffer;
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 32; j++) {
      if (j < 30) dst[32 * i + j] = ptr[30 * i + j];
      else dst[32 * i + j] = ptr[0];
    }
  }
  CopyBgTilemapBufferToVram(0);
}

function DrawStarsAndBadgesOnCard(): void {
  if (!sTrainerCardDataPtr) return;
  const d = sTrainerCardDataPtr;
  let tileNum = 192;
  const palNum = 3;

  FillBgTilemapBufferRect(3, 143, 15, 7, d.trainerCard.stars, 1, 4);
  if (!d.isLink) {
    let x = 4;
    for (let i = 0; i < 8; i++, tileNum += 2, x += 3) {
      if (d.hasBadge[i]) {
        FillBgTilemapBufferRect(3, tileNum, x, 16, 1, 1, palNum);
        FillBgTilemapBufferRect(3, tileNum + 1, x + 1, 16, 1, 1, palNum);
        FillBgTilemapBufferRect(3, tileNum + 16, x, 17, 1, 1, palNum);
        FillBgTilemapBufferRect(3, tileNum + 17, x + 1, 17, 1, 1, palNum);
      }
    }
  }
  CopyBgTilemapBufferToVram(3);
}

function DrawCardBackStats(): void {
  if (!sTrainerCardDataPtr) return;
  const d = sTrainerCardDataPtr;
  if (d.cardType === CARD_TYPE_FRLG) {
    if (d.hasTrades) {
      FillBgTilemapBufferRect(3, 141, 26, 9, 1, 1, 1);
      FillBgTilemapBufferRect(3, 157, 26, 10, 1, 1, 1);
    }
    if (d.trainerCard.berryCrushPoints) {
      FillBgTilemapBufferRect(3, 141, 21, 13, 1, 1, 1);
      FillBgTilemapBufferRect(3, 157, 21, 14, 1, 1, 1);
    }
    if (d.trainerCard.unionRoomNum) {
      FillBgTilemapBufferRect(3, 141, 27, 11, 1, 1, 1);
      FillBgTilemapBufferRect(3, 157, 27, 12, 1, 1, 1);
    }
  }
  CopyBgTilemapBufferToVram(3);
}

function CreateTrainerCardTrainerPic(): void {
  if (!sTrainerCardDataPtr) return;
  const gender = sTrainerCardDataPtr.trainerCard.gender;
  const isFemale = gender !== C.MALE;
  const picBytes = isFemale ? incbin("gTrainerFrontPic_Leaf") : incbin("gTrainerFrontPic_Red");
  const palBytes = isFemale ? incbin16("gTrainerPalette_Leaf") : incbin16("gTrainerPalette_Red");

  BlitBitmapRectToWindow(2, picBytes, 0, 0, 64, 64, 13, 4, 64, 64);
  LoadPalette(palBytes, BG_PLTT_ID(8), 32);
}

function LoadMonIconGfx(): void {
  if (!sTrainerCardDataPtr) return;
  const d = sTrainerCardDataPtr;
  const iconPals = incbin16("gMonIconPalettes");
  d.monIconPals.fill(0);
  d.monIconPals.set(iconPals.subarray(0, Math.min(iconPals.length, d.monIconPals.length)));

  switch (d.trainerCard.monIconTint) {
    case C.MON_ICON_TINT_NORMAL:
      break;
    case C.MON_ICON_TINT_BLACK:
      TintPalette_CustomTone(d.monIconPals, 96, 0, 0, 0);
      break;
    case C.MON_ICON_TINT_PINK:
      TintPalette_CustomTone(d.monIconPals, 96, 500, 330, 310);
      break;
    case C.MON_ICON_TINT_SEPIA:
      TintPalette_SepiaTone(d.monIconPals, 96);
      break;
  }

  LoadPalette(d.monIconPals, BG_PLTT_ID(5), 192);
  for (let i = 0; i < 6; i++) {
    const sp = d.trainerCard.monSpecies[i];
    if (sp) {
      LoadBgTiles(3, GetMonIconTiles(sp, 0), 512, 16 * i + 32);
    }
  }
}

function LoadStickerGfx(): void {
  LoadPalette(incbin16("sTrainerCardStickerPal1"), BG_PLTT_ID(11), 32);
  LoadPalette(incbin16("sTrainerCardStickerPal2"), BG_PLTT_ID(12), 32);
  LoadPalette(incbin16("sTrainerCardStickerPal3"), BG_PLTT_ID(13), 32);
  LoadPalette(incbin16("sTrainerCardStickerPal4"), BG_PLTT_ID(14), 32);
  const stickerGfx = incbin("sTrainerCardStickers_Gfx");
  LoadBgTiles(3, stickerGfx, Math.min(1024, stickerGfx.length), 128);
}

function PrintStickersOnCard(): void {
  if (!sTrainerCardDataPtr) return;
  const d = sTrainerCardDataPtr;
  const palSlots = [11, 12, 13, 14];
  if (d.cardType === CARD_TYPE_FRLG && d.trainerCard.shouldDrawStickers) {
    for (let i = 0; i < 3; i++) {
      const sticker = d.trainerCard.stickers[i];
      if (sticker > 0 && sticker <= 4) {
        WriteSequenceToBgTilemapBuffer(3, i * 4 + 320, i * 3 + 2, 2, 2, 2, palSlots[sticker - 1], 1);
      }
    }
  }
}

function PrintPokemonIconsOnCard(): void {
  if (!sTrainerCardDataPtr) return;
  const d = sTrainerCardDataPtr;
  const paletteSlots = [5, 6, 7, 8, 9, 10];
  const xOffsets = [0, 4, 8, 12, 16, 20];
  if (d.cardType === CARD_TYPE_FRLG) {
    for (let i = 0; i < 6; i++) {
      const sp = d.trainerCard.monSpecies[i];
      if (sp) {
        const palIdx = GetMonIconPaletteIndexFromSpecies(sp);
        WriteSequenceToBgTilemapBuffer(3, 16 * i + 224, xOffsets[i] + 3, 15, 4, 4, paletteSlots[palIdx], 1);
      }
    }
  }
}

function LoadCardGfx(): boolean {
  if (!sTrainerCardDataPtr) return true;
  const d = sTrainerCardDataPtr;
  switch (d.gfxLoadState) {
    case 0:
      d.bgTilemap = incbin16("sKantoTrainerCardBg_Tilemap");
      break;
    case 1:
      d.backTilemap = incbin16("sKantoTrainerCardBack_Tilemap");
      break;
    case 2:
      d.frontTilemap = incbin16("sKantoTrainerCardFront_Tilemap");
      break;
    case 3:
      d.badgeTiles = incbin("sKantoTrainerCardBadges_Gfx");
      break;
    case 4:
      d.cardTiles = incbin("gKantoTrainerCard_Gfx");
      break;
    case 5:
      d.stickerTiles = incbin16("sTrainerCardStickers_Gfx");
      break;
    default:
      d.gfxLoadState = 0;
      return true;
  }
  d.gfxLoadState++;
  return false;
}

function SetTrainerCardBgsAndPals(): boolean {
  if (!sTrainerCardDataPtr) return true;
  const d = sTrainerCardDataPtr;
  switch (d.bgPalLoadState) {
    case 0:
      LoadBgTiles(3, d.badgeTiles, d.badgeTiles.length, 0);
      break;
    case 1:
      LoadBgTiles(0, d.cardTiles, 0x1800, 0);
      break;
    case 2: {
      const palSyms = cdata<SymRef[]>("trainer_card", "sKantoTrainerCardPals");
      const sym = symName(palSyms[d.trainerCard.stars]);
      if (sym) LoadPalette(incbin16(sym), BG_PLTT_ID(0), 3 * PLTT_SIZE_4BPP);
      break;
    }
    case 3:
      LoadPalette(incbin16("sKantoTrainerCardBadges_Pal"), BG_PLTT_ID(3), 32);
      break;
    case 4:
      if (d.trainerCard.gender !== C.MALE) {
        LoadPalette(incbin16("sKantoTrainerCardFemaleBg_Pal"), BG_PLTT_ID(1), 32);
      }
      break;
    case 5:
      LoadPalette(incbin16("sTrainerCardStar_Pal"), BG_PLTT_ID(4), 32);
      break;
    case 6:
      SetBgTilemapBuffer(0, d.cardTilemapBuffer);
      SetBgTilemapBuffer(2, d.bgTilemapBuffer);
      break;
    default:
      FillBgTilemapBufferRect_Palette0(0, 0, 0, 0, 32, 32);
      FillBgTilemapBufferRect_Palette0(2, 0, 0, 0, 32, 32);
      FillBgTilemapBufferRect_Palette0(3, 0, 0, 0, 32, 32);
      return true;
  }
  d.bgPalLoadState++;
  return false;
}

// ---------------------------------------------------------------- Text Printing

function PrintNameOnCardFront(): void {
  if (!sTrainerCardDataPtr) return;
  const nameLabel = rom.text("gText_TrainerCardName");
  const fullName = concat(nameLabel, sTrainerCardDataPtr.trainerCard.playerName);
  AddTextPrinterParameterized3(1, FONT_NORMAL, 20, 29, sTrainerCardTextColors, TEXT_SKIP_DRAW, fullName);
}

function PrintIdOnCard(): void {
  if (!sTrainerCardDataPtr) return;
  const idLabel = rom.text("gText_TrainerCardIDNo");
  const idStr = intToDecimal(sTrainerCardDataPtr.trainerCard.trainerId, STR_CONV_MODE_LEADING_ZEROS, 5);
  const fullId = concat(idLabel, idStr);
  AddTextPrinterParameterized3(1, FONT_NORMAL, 142, 10, sTrainerCardTextColors, TEXT_SKIP_DRAW, fullId);
}

function PrintMoneyOnCard(): void {
  if (!sTrainerCardDataPtr) return;
  const yen = rom.text("gText_TrainerCardYen");
  const moneyVal = intToDecimal(sTrainerCardDataPtr.trainerCard.money, STR_CONV_MODE_LEFT_ALIGN, 6);
  const moneyWithYen = concat(yen, moneyVal);
  const len = length(moneyWithYen);
  const x = (134 - 6 * len) & 0xff;
  AddTextPrinterParameterized3(1, FONT_NORMAL, 20, 56, sTrainerCardTextColors, TEXT_SKIP_DRAW, rom.text("gText_TrainerCardMoney"));
  AddTextPrinterParameterized3(1, FONT_NORMAL, x, 56, sTrainerCardTextColors, TEXT_SKIP_DRAW, moneyWithYen);
}

function PrintPokedexOnCard(): void {
  if (!sTrainerCardDataPtr) return;
  if (sTrainerCardDataPtr.hasPokedex) {
    const dexVal = intToDecimal(sTrainerCardDataPtr.trainerCard.caughtMonsCount, STR_CONV_MODE_LEFT_ALIGN, 3);
    const len = length(dexVal);
    const x = (136 - 6 * len) & 0xff;
    AddTextPrinterParameterized3(1, FONT_NORMAL, 20, 72, sTrainerCardTextColors, TEXT_SKIP_DRAW, rom.text("gText_TrainerCardPokedex"));
    AddTextPrinterParameterized3(1, FONT_NORMAL, x, 72, sTrainerCardTextColors, TEXT_SKIP_DRAW, dexVal);
    AddTextPrinterParameterized3(1, FONT_NORMAL, 138, 72, sTrainerCardTextColors, TEXT_SKIP_DRAW, rom.text("gText_TrainerCardNull"));
  }
}

function PrintTimeOnCard(): void {
  if (!sTrainerCardDataPtr) return;
  const d = sTrainerCardDataPtr;
  const hours = Math.min(999, d.trainerCard.playTimeHours);
  const minutes = Math.min(59, d.trainerCard.playTimeMinutes);

  FillWindowPixelRect(1, PIXEL_FILL(0), 101, 88, 50, 12);
  AddTextPrinterParameterized3(1, FONT_NORMAL, 20, 88, sTrainerCardTextColors, TEXT_SKIP_DRAW, rom.text("gText_TrainerCardTime"));

  const bufHours = intToDecimal(hours, STR_CONV_MODE_RIGHT_ALIGN, 3);
  AddTextPrinterParameterized3(1, FONT_NORMAL, 101, 88, sTrainerCardTextColors, TEXT_SKIP_DRAW, bufHours);

  const colonColors = d.timeColonInvisible ? sTimeColonInvisibleTextColors : sTrainerCardTextColors;
  AddTextPrinterParameterized3(1, FONT_NORMAL, 119, 88, colonColors, TEXT_SKIP_DRAW, rom.text("gText_Colon2"));

  const bufMinutes = intToDecimal(minutes, STR_CONV_MODE_LEADING_ZEROS, 2);
  AddTextPrinterParameterized3(1, FONT_NORMAL, 124, 88, sTrainerCardTextColors, TEXT_SKIP_DRAW, bufMinutes);
}

function PrintAllOnCardFront(): boolean {
  if (!sTrainerCardDataPtr) return true;
  switch (sTrainerCardDataPtr.printState) {
    case 0:
      PrintNameOnCardFront();
      break;
    case 1:
      PrintIdOnCard();
      break;
    case 2:
      PrintMoneyOnCard();
      break;
    case 3:
      PrintPokedexOnCard();
      break;
    case 4:
      PrintTimeOnCard();
      break;
    case 5:
      break;
    default:
      sTrainerCardDataPtr.printState = 0;
      return true;
  }
  sTrainerCardDataPtr.printState++;
  return false;
}

function BufferTextForCardBack(): void {
  if (!sTrainerCardDataPtr) return;
  const d = sTrainerCardDataPtr;
  BufferNameForCardBack();
  BufferHofDebutTime();

  if (d.hasLinkResults) {
    d.strings[TRAINER_CARD_STRING_LINK_RECORD] = rom.text("gText_LinkBattles");
    d.strings[TRAINER_CARD_STRING_WIN_LOSS] = rom.text("gText_WinLossRatio");
    d.strings[TRAINER_CARD_STRING_LINK_WINS] = intToDecimal(d.trainerCard.linkBattleWins, STR_CONV_MODE_RIGHT_ALIGN, 4);
    d.strings[TRAINER_CARD_STRING_LINK_LOSSES] = intToDecimal(d.trainerCard.linkBattleLosses, STR_CONV_MODE_RIGHT_ALIGN, 4);
  }

  if (d.hasTrades) {
    d.strings[TRAINER_CARD_STRING_TRADES] = rom.text("gText_PokemonTrades");
    d.strings[TRAINER_CARD_STRING_TRADE_COUNT] = intToDecimal(d.trainerCard.pokemonTrades, STR_CONV_MODE_RIGHT_ALIGN, 5);
  }

  if (d.trainerCard.berryCrushPoints) {
    d.strings[TRAINER_CARD_STRING_BERRY_CRUSH] = rom.text("gText_BerryCrushes");
    d.strings[TRAINER_CARD_STRING_BERRY_CRUSH_COUNT] = intToDecimal(d.trainerCard.berryCrushPoints, STR_CONV_MODE_RIGHT_ALIGN, 5);
  }

  if (d.trainerCard.unionRoomNum) {
    d.strings[TRAINER_CARD_STRING_UNION_ROOM] = rom.text("gText_UnionRoomTradesBattles");
    d.strings[TRAINER_CARD_STRING_UNION_ROOM_NUM] = intToDecimal(d.trainerCard.unionRoomNum, STR_CONV_MODE_RIGHT_ALIGN, 5);
  }
}

/** BufferNameForCardBack (trainer_card.c): copy the player name into the card-back string slot. */
function BufferNameForCardBack(): void {
  if (!sTrainerCardDataPtr) return;
  const d = sTrainerCardDataPtr;
  d.strings[TRAINER_CARD_STRING_NAME] = copy(d.trainerCard.playerName);
  if (d.cardType !== CARD_TYPE_FRLG) {
    d.strings[TRAINER_CARD_STRING_NAME] = concat(d.strings[TRAINER_CARD_STRING_NAME], rom.text("gText_Var1sTrainerCard"));
  }
}

/** BufferHofDebutTime (trainer_card.c): format hours and zero-padded minutes/seconds for the back. */
function BufferHofDebutTime(): void {
  if (!sTrainerCardDataPtr?.hasHofResult) return;
  const card = sTrainerCardDataPtr.trainerCard;
  const h = intToDecimal(card.hofDebutHours, STR_CONV_MODE_RIGHT_ALIGN, 3);
  const m = intToDecimal(card.hofDebutMinutes, STR_CONV_MODE_LEADING_ZEROS, 2);
  const s = intToDecimal(card.hofDebutSeconds, STR_CONV_MODE_LEADING_ZEROS, 2);
  const colon = rom.text("gText_Colon2");
  sTrainerCardDataPtr.strings[TRAINER_CARD_STRING_HOF_TIME] = concat(h, colon, m, colon, s);
}

function PrintNameOnCardBack(): void {
  if (!sTrainerCardDataPtr) return;
  AddTextPrinterParameterized3(1, FONT_NORMAL, 138, 11, sTrainerCardTextColors, TEXT_SKIP_DRAW, sTrainerCardDataPtr.strings[TRAINER_CARD_STRING_NAME]);
}

function PrintHofDebutTimeOnCard(): void {
  if (!sTrainerCardDataPtr || !sTrainerCardDataPtr.hasHofResult) return;
  AddTextPrinterParameterized3(1, FONT_NORMAL, 10, 35, sTrainerCardTextColors, TEXT_SKIP_DRAW, rom.text("gText_HallOfFameDebut"));
  AddTextPrinterParameterized3(1, FONT_NORMAL, 164, 35, sTrainerCardStatColors, TEXT_SKIP_DRAW, sTrainerCardDataPtr.strings[TRAINER_CARD_STRING_HOF_TIME]);
}

function PrintLinkBattleResultsOnCard(): void {
  if (!sTrainerCardDataPtr || !sTrainerCardDataPtr.hasLinkResults) return;
  const d = sTrainerCardDataPtr;
  AddTextPrinterParameterized3(1, FONT_NORMAL, 10, 51, sTrainerCardTextColors, TEXT_SKIP_DRAW, d.strings[TRAINER_CARD_STRING_LINK_RECORD]);
  AddTextPrinterParameterized3(1, FONT_NORMAL, 130, 51, sTrainerCardTextColors, TEXT_SKIP_DRAW, d.strings[TRAINER_CARD_STRING_WIN_LOSS]);
  AddTextPrinterParameterized3(1, FONT_NORMAL, 144, 51, sTrainerCardStatColors, TEXT_SKIP_DRAW, d.strings[TRAINER_CARD_STRING_LINK_WINS]);
  AddTextPrinterParameterized3(1, FONT_NORMAL, 192, 51, sTrainerCardStatColors, TEXT_SKIP_DRAW, d.strings[TRAINER_CARD_STRING_LINK_LOSSES]);
}

function PrintTradesStringOnCard(): void {
  if (!sTrainerCardDataPtr || !sTrainerCardDataPtr.hasTrades) return;
  const d = sTrainerCardDataPtr;
  AddTextPrinterParameterized3(1, FONT_NORMAL, 10, 67, sTrainerCardTextColors, TEXT_SKIP_DRAW, d.strings[TRAINER_CARD_STRING_TRADES]);
  AddTextPrinterParameterized3(1, FONT_NORMAL, 186, 67, sTrainerCardStatColors, TEXT_SKIP_DRAW, d.strings[TRAINER_CARD_STRING_TRADE_COUNT]);
}

function PrintUnionStringOnCard(): void {
  if (!sTrainerCardDataPtr || !sTrainerCardDataPtr.trainerCard.unionRoomNum) return;
  const d = sTrainerCardDataPtr;
  AddTextPrinterParameterized3(1, FONT_NORMAL, 10, 83, sTrainerCardTextColors, TEXT_SKIP_DRAW, d.strings[TRAINER_CARD_STRING_UNION_ROOM]);
  AddTextPrinterParameterized3(1, FONT_NORMAL, 186, 83, sTrainerCardStatColors, TEXT_SKIP_DRAW, d.strings[TRAINER_CARD_STRING_UNION_ROOM_NUM]);
}

function PrintBerryCrushStringOnCard(): void {
  if (!sTrainerCardDataPtr || !sTrainerCardDataPtr.trainerCard.berryCrushPoints) return;
  const d = sTrainerCardDataPtr;
  AddTextPrinterParameterized3(1, FONT_NORMAL, 10, 99, sTrainerCardTextColors, TEXT_SKIP_DRAW, d.strings[TRAINER_CARD_STRING_BERRY_CRUSH]);
  AddTextPrinterParameterized3(1, FONT_NORMAL, 186, 99, sTrainerCardStatColors, TEXT_SKIP_DRAW, d.strings[TRAINER_CARD_STRING_BERRY_CRUSH_COUNT]);
}

function PrintAllOnCardBack(): boolean {
  if (!sTrainerCardDataPtr) return true;
  switch (sTrainerCardDataPtr.printState) {
    case 0:
      PrintNameOnCardBack();
      break;
    case 1:
      PrintHofDebutTimeOnCard();
      break;
    case 2:
      PrintLinkBattleResultsOnCard();
      break;
    case 3:
      PrintTradesStringOnCard();
      break;
    case 4:
      PrintBerryCrushStringOnCard();
      break;
    case 5:
      PrintUnionStringOnCard();
      break;
    case 6:
      PrintPokemonIconsOnCard();
      break;
    case 7:
      PrintStickersOnCard();
      break;
    default:
      sTrainerCardDataPtr.printState = 0;
      return true;
  }
  sTrainerCardDataPtr.printState++;
  return false;
}

// ---------------------------------------------------------------- Blinking Colon & VBlank

function BlinkTimeColon(): void {
  if (!sTrainerCardDataPtr) return;
  if (++sTrainerCardDataPtr.timeColonBlinkTimer > 60) {
    sTrainerCardDataPtr.timeColonBlinkTimer = 0;
    sTrainerCardDataPtr.timeColonInvisible = !sTrainerCardDataPtr.timeColonInvisible;
    sTrainerCardDataPtr.timeColonNeedDraw = true;
  }
}

function VBlankCB_TrainerCard(): void {
  TransferPlttBuffer();
  BlinkTimeColon();
  if (sTrainerCardDataPtr && sTrainerCardDataPtr.allowDMACopy) {
    gScanlineEffectRegBuffers[1].set(gScanlineEffectRegBuffers[0].subarray(0, 160));
  }
}

function HBlankCB_TrainerCard(): void {
  const line = ppu.vcount & 0xff;
  if (line < 160) {
    ppu.setReg(REG_OFFSET_BG0VOFS, gScanlineEffectRegBuffers[1][line]);
  }
}

// ---------------------------------------------------------------- Card Flip Tasks

function Task_BeginCardFlip(taskId: number): boolean {
  HideBg(1);
  HideBg(3);
  ScanlineEffect_Stop();
  ScanlineEffect_Clear();
  for (let i = 0; i < 160; i++) gScanlineEffectRegBuffers[1][i] = 0;
  tasks.tasks[taskId].data[0]++; // tFlipState++
  return false;
}

function Task_AnimateCardFlipDown(taskId: number): boolean {
  if (!sTrainerCardDataPtr) return false;
  sTrainerCardDataPtr.allowDMACopy = false;
  if (tasks.tasks[taskId].data[1] >= 77) {
    tasks.tasks[taskId].data[1] = 77;
  } else {
    tasks.tasks[taskId].data[1] += 7;
  }

  sTrainerCardDataPtr.cardTop = tasks.tasks[taskId].data[1];
  UpdateCardFlipRegs(tasks.tasks[taskId].data[1]);

  const r7 = tasks.tasks[taskId].data[1];
  const r9 = 160 - r7;
  const r4 = Math.max(1, r9 - r7);
  let r6 = (-r7 << 16) | 0;
  let r5 = (Math.trunc(0xa00000 / r4) + 0xffff0000) | 0;
  const var_24 = (r6 + Math.imul(r5, r4)) | 0;
  const r10 = Math.trunc(r5 / r4);
  r5 = (r5 * 2) | 0;

  let i = 0;
  for (; i < r7; i++) {
    gScanlineEffectRegBuffers[0][i] = (-i) & 0xffff;
  }
  for (; i < r9; i++) {
    const v = (r6 >> 16) & 0xffff;
    r6 = (r6 + r5) | 0;
    r5 = (r5 - r10) | 0;
    gScanlineEffectRegBuffers[0][i] = v;
  }
  const lastV = (var_24 >> 16) & 0xffff;
  for (; i < 160; i++) {
    gScanlineEffectRegBuffers[0][i] = lastV;
  }

  sTrainerCardDataPtr.allowDMACopy = true;
  if (tasks.tasks[taskId].data[1] >= 77) {
    tasks.tasks[taskId].data[0]++; // tFlipState++
  }
  return false;
}

function Task_DrawFlippedCardSide(taskId: number): boolean {
  if (!sTrainerCardDataPtr) return false;
  const d = sTrainerCardDataPtr;
  d.allowDMACopy = false;
  while (true) {
    switch (d.flipDrawState) {
      case 0:
        FillWindowPixelBuffer(1, PIXEL_FILL(0));
        FillBgTilemapBufferRect_Palette0(3, 0, 0, 0, 32, 32);
        break;
      case 1:
        if (!d.onBack) {
          if (!PrintAllOnCardBack()) return false;
        } else {
          if (!PrintAllOnCardFront()) return false;
        }
        break;
      case 2:
        if (!d.onBack) {
          DrawCardFrontOrBack(d.backTilemap);
        } else {
          DrawTrainerCardWindow(1);
        }
        break;
      case 3:
        if (!d.onBack) {
          DrawCardBackStats();
        } else {
          FillWindowPixelBuffer(2, PIXEL_FILL(0));
        }
        break;
      case 4:
        if (d.onBack) {
          CreateTrainerCardTrainerPic();
        }
        break;
      default:
        tasks.tasks[taskId].data[0]++; // tFlipState++
        d.allowDMACopy = true;
        d.flipDrawState = 0;
        return false;
    }
    d.flipDrawState++;
  }
}

function Task_SetCardFlipped(taskId: number): boolean {
  if (!sTrainerCardDataPtr) return false;
  const d = sTrainerCardDataPtr;
  d.allowDMACopy = false;

  if (d.onBack) {
    DrawTrainerCardWindow(2);
    DrawCardScreenBackground(d.bgTilemap);
    DrawCardFrontOrBack(d.frontTilemap);
    DrawStarsAndBadgesOnCard();
  }

  DrawTrainerCardWindow(1);
  d.onBack = !d.onBack;
  tasks.tasks[taskId].data[0]++; // tFlipState++
  d.allowDMACopy = true;
  sound.playSE(sound.c("SE_CARD_FLIPPING"));
  return false;
}

function Task_AnimateCardFlipUp(taskId: number): boolean {
  if (!sTrainerCardDataPtr) return false;
  sTrainerCardDataPtr.allowDMACopy = false;
  if (tasks.tasks[taskId].data[1] <= 5) {
    tasks.tasks[taskId].data[1] = 0;
  } else {
    tasks.tasks[taskId].data[1] -= 5;
  }

  sTrainerCardDataPtr.cardTop = tasks.tasks[taskId].data[1];
  UpdateCardFlipRegs(tasks.tasks[taskId].data[1]);

  const r7 = tasks.tasks[taskId].data[1];
  const r9 = 160 - r7;
  const r4 = Math.max(1, r9 - r7);
  let r6 = (-r7 << 16) | 0;
  let r5 = (Math.trunc(0xa00000 / r4) + 0xffff0000) | 0;
  const var_24 = (r6 + Math.imul(r5, r4)) | 0;
  const r10 = Math.trunc(r5 / r4);
  r5 = (r5 * 2) | 0;

  let i = 0;
  for (; i < r7; i++) {
    gScanlineEffectRegBuffers[0][i] = (-i) & 0xffff;
  }
  for (; i < r9; i++) {
    const v = (r6 >> 16) & 0xffff;
    r6 = (r6 + r5) | 0;
    r5 = (r5 - r10) | 0;
    gScanlineEffectRegBuffers[0][i] = v;
  }
  const lastV = (var_24 >> 16) & 0xffff;
  for (; i < 160; i++) {
    gScanlineEffectRegBuffers[0][i] = lastV;
  }

  sTrainerCardDataPtr.allowDMACopy = true;
  if (tasks.tasks[taskId].data[1] <= 0) {
    tasks.tasks[taskId].data[0]++; // tFlipState++
  }
  return false;
}

function Task_EndCardFlip(taskId: number): boolean {
  ShowBg(1);
  ShowBg(3);
  SetHBlankCallback(null);
  ppu.setReg(REG_OFFSET_BG0VOFS, 0);
  SetGpuReg(REG_OFFSET_WIN0V, WIN_RANGE(0, 160));
  SetGpuReg(REG_OFFSET_BLDY, 0);
  tasks.destroy(taskId);
  return false;
}

const sTrainerCardFlipTasks = [
  Task_BeginCardFlip,
  Task_AnimateCardFlipDown,
  Task_DrawFlippedCardSide,
  Task_SetCardFlipped,
  Task_AnimateCardFlipUp,
  Task_EndCardFlip,
];

function Task_DoCardFlipTask(taskId: number): void {
  while (sTrainerCardFlipTasks[tasks.tasks[taskId].data[0]](taskId)) {
    // continues while step returns true
  }
}

function FlipTrainerCard(): void {
  const taskId = tasks.create(Task_DoCardFlipTask, 0);
  Task_DoCardFlipTask(taskId);
  SetHBlankCallback(HBlankCB_TrainerCard);
}

function IsCardFlipTaskActive(): boolean {
  return tasks.findByFunc(Task_DoCardFlipTask) === TAIL_SENTINEL;
}

// ---------------------------------------------------------------- Main Scene Task

function Task_TrainerCard(taskId: number): void {
  if (!sTrainerCardDataPtr) return;
  const d = sTrainerCardDataPtr;

  switch (d.mainState) {
    case 0:
      FillWindowPixelBuffer(1, PIXEL_FILL(0));
      d.mainState++;
      break;
    case 1:
      if (PrintAllOnCardFront()) d.mainState++;
      break;
    case 2:
      DrawTrainerCardWindow(1);
      d.mainState++;
      break;
    case 3:
      FillWindowPixelBuffer(2, PIXEL_FILL(0));
      CreateTrainerCardTrainerPic();
      DrawTrainerCardWindow(2);
      d.mainState++;
      break;
    case 4:
      DrawCardScreenBackground(d.bgTilemap);
      d.mainState++;
      break;
    case 5:
      DrawCardFrontOrBack(d.frontTilemap);
      d.mainState++;
      break;
    case 6:
      DrawStarsAndBadgesOnCard();
      d.mainState++;
      break;
    case 7:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
      SetVBlankCallback(VBlankCB_TrainerCard);
      d.mainState++;
      break;
    case 8:
      if (!UpdatePaletteFade()) {
        sound.playSE(sound.c("SE_CARD_OPEN"));
        d.mainState = STATE_HANDLE_INPUT_FRONT;
      }
      break;
    case STATE_HANDLE_INPUT_FRONT:
      if (d.timeColonNeedDraw) {
        PrintTimeOnCard();
        DrawTrainerCardWindow(1);
        d.timeColonNeedDraw = false;
      }
      if (joy.newKeys & A_BUTTON) {
        FlipTrainerCard();
        sound.playSE(sound.c("SE_CARD_FLIP"));
        d.mainState = STATE_WAIT_FLIP_TO_BACK;
      } else if (joy.newKeys & B_BUTTON) {
        BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        d.mainState = STATE_CLOSE_CARD;
      }
      break;
    case STATE_WAIT_FLIP_TO_BACK:
      if (IsCardFlipTaskActive()) {
        sound.playSE(sound.c("SE_CARD_OPEN"));
        d.mainState = STATE_HANDLE_INPUT_BACK;
      }
      break;
    case STATE_HANDLE_INPUT_BACK:
      if (joy.newKeys & B_BUTTON) {
        FlipTrainerCard();
        sound.playSE(sound.c("SE_CARD_FLIP"));
        d.mainState = STATE_WAIT_FLIP_TO_FRONT;
      } else if (joy.newKeys & A_BUTTON) {
        BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        d.mainState = STATE_CLOSE_CARD;
      }
      break;
    case STATE_WAIT_FLIP_TO_FRONT:
      if (IsCardFlipTaskActive()) {
        d.mainState = STATE_HANDLE_INPUT_FRONT;
        sound.playSE(sound.c("SE_CARD_OPEN"));
      }
      break;
    case STATE_CLOSE_CARD:
      if (!UpdatePaletteFade()) {
        CloseTrainerCard(taskId);
      }
      break;
  }
}

function CloseTrainerCard(taskId: number): void {
  const cb = sTrainerCardDataPtr?.callback2 ?? null;
  SetMainCallback2(cb);
  FreeAllWindowBuffers();
  tasks.destroy(taskId);
  SetHBlankCallback(null);
  SetVBlankCallback(null);
  sTrainerCardDataPtr = null;
  if (cb) cb();
}

function CB2_TrainerCard(): void {
  tasks.run();
  UpdatePaletteFade();
}

function SetTrainerCardCB2(): void {
  SetMainCallback2(CB2_TrainerCard);
}

function SetUpTrainerCardTask(): void {
  tasks.reset();
  ScanlineEffect_Stop();
  tasks.create(Task_TrainerCard, 0);
  InitTrainerCardData();
  SetDataFromTrainerCard();
}

function CB2_InitTrainerCard(): void {
  switch (gMain.state) {
    case 0:
      ResetGpuRegs();
      SetUpTrainerCardTask();
      gMain.state++;
      break;
    case 1:
      gMain.state++;
      break;
    case 2:
      DmaClearOam();
      gMain.state++;
      break;
    case 3:
      DmaClearPltt();
      gMain.state++;
      break;
    case 4:
      ResetBgRegs();
      gMain.state++;
      break;
    case 5:
      InitBgsAndWindows();
      gMain.state++;
      break;
    case 6:
      LoadStdWindowFrameGfx();
      gMain.state++;
      break;
    case 7:
      LoadMonIconGfx();
      gMain.state++;
      break;
    case 8:
      if (LoadCardGfx()) gMain.state++;
      break;
    case 9:
      LoadStickerGfx();
      gMain.state++;
      break;
    case 10:
      HandleGpuRegs();
      gMain.state++;
      break;
    case 11:
      BufferTextForCardBack();
      gMain.state++;
      break;
    case 12:
      if (SetTrainerCardBgsAndPals()) gMain.state++;
      break;
    case 13:
      gMain.state++;
      break;
    default:
      SetTrainerCardCB2();
      break;
  }
}

// ---------------------------------------------------------------- Entry Points

/**
 * ShowPlayerTrainerCard from trainer_card.c.
 */
export function ShowPlayerTrainerCard(callback: (() => void) | null = null): void {
  sTrainerCardDataPtr = emptyData();
  sTrainerCardDataPtr.callback2 = callback;
  sTrainerCardDataPtr.isLink = false;
  sTrainerCardDataPtr.language = 2; // English
  TrainerCard_GenerateCardForLinkPlayer(sTrainerCardDataPtr.trainerCard);
  SetMainCallback2(CB2_InitTrainerCard);
}

/**
 * Returns player's star count (0 to 4).
 */
export function GetTrainerCardStars(): number {
  const card = emptyTrainerCard();
  TrainerCard_GenerateCardForLinkPlayer(card);
  return card.stars;
}

export function GetTrainerCardMainState(): number {
  return sTrainerCardDataPtr?.mainState ?? -1;
}

/**
 * Field-menu adapter entry point: loads necessary packs/cdata and opens the Trainer Card.
 */
export function openTrainerCardScreen(done: () => void): void {
  void (async () => {
    await preloadPacks([
      "graphics_trainer_card",
      "graphics_trainers",
      "pokemon",
      "graphics_interface",
      "graphics_text_window",
    ]);
    await loadCData("trainer_card");
    await loadCData("pokemon_icon");
    await loadCData("text_window_graphics");
    ShowPlayerTrainerCard(done);
  })();
}
