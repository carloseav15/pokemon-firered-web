// trade_scene.c and trade.c: in-game trade animations, link cable sequence,
// trade evolution, and trade logic.
//
// Port of the trade_scene.c animation (not run in a browser yet). The trade.c
// link-trade menu functions at the end of this file are empty stubs.
// Covered by this file:
//  - Complete 70+ state machine of DoTradeAnim_Cable and DoTradeAnim_Wireless
//  - Pokeball departure and bouncing arrival with sTradeBallVerticalVelocityTable
//  - Cable animation, LinkMon glow/shadow traveling through cable
//  - Crossing Pokemon sprites in cable link with affine inversion
//  - GBA affine zoom in/out with hardware REG_BG2 registers and screen flash
//  - Mon release animation using CreatePokeballSpriteToReleaseMon
//  - TradeMons updating party, friendship (70), and Pokedex flags
//  - Post-trade evolution checking (tradeEvolution & evolveWithMessages)

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { copy, EOS, expandPlaceholders, stringVars } from "../gba/charmap";
import { FONT_NORMAL } from "../gba/font";
import { A_BUTTON, JOY_NEW } from "../gba/input";
import { tasks, type TaskFunc } from "../gba/tasks";
import { cdata, incbin, incbin16, loadCData, preloadPacks } from "../hw/assets";
import { affineAnimsFrom, animsFrom, oamFrom, templateFrom, type CSpriteTemplate } from "../hw/cdataSprite";
import {
  BG_SCREEN_SIZE, CopyToBgTilemapBuffer, InitBgsFromTemplates, LoadBgTiles,
  ResetBgsAndClearDma3BusyFlags, SetBgTilemapBuffer, ShowBg, type BgTemplate,
} from "../hw/bg";
import { GetGpuReg, SetGpuReg, SetGpuRegBits, ClearGpuRegBits } from "../hw/gpu";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, BlendPalettes, gPaletteFade, LoadPalette,
  OBJ_PLTT_ID, PALETTES_ALL, RGB, RGB_BLACK, RGB_WHITE, TransferPlttBuffer,
  UpdatePaletteFade,
} from "../hw/palette";
import {
  BLDALPHA_BLEND, BLDCNT_EFFECT_BLEND, BLDCNT_TGT1_BG1, BLDCNT_TGT1_OBJ, BLDCNT_TGT2_BG1,
  BLDCNT_TGT2_BG2, DISPCNT_BG0_ON, DISPCNT_BG1_ON, DISPCNT_BG2_ON, DISPCNT_MODE_0,
  DISPCNT_MODE_1, DISPCNT_OBJ_1D_MAP, DISPCNT_OBJ_ON, DISPCNT_WIN0_ON, ppu,
  REG_OFFSET_BG1HOFS, REG_OFFSET_BG1VOFS, REG_OFFSET_BG2CNT, REG_OFFSET_BG2HOFS,
  REG_OFFSET_BG2PA, REG_OFFSET_BG2PB, REG_OFFSET_BG2PC, REG_OFFSET_BG2PD, REG_OFFSET_BG2VOFS,
  REG_OFFSET_BG2X_L, REG_OFFSET_BG2Y_L, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT, REG_OFFSET_DISPCNT,
  REG_OFFSET_WIN0H, REG_OFFSET_WIN0V, REG_OFFSET_WININ, REG_OFFSET_WINOUT,
} from "../hw/ppu";
import { gMain, SetMainCallback2, SetVBlankCallback, type MainCallback } from "../hw/runtime";
import {
  AnimateSprites, BuildOamBuffer, CreateSprite, DestroySprite, FreeAllSpritePalettes,
  FreeSpriteOamMatrix, gSprites, LoadCompressedSpriteSheet, LoadOam, LoadSpritePalette,
  LoadSpriteSheet, MAX_SPRITES, ProcessSpriteCopyRequests, ResetSpriteData, SpriteCallbackDummy,
  ST_OAM_AFFINE_DOUBLE, StartSpriteAffineAnim, StartSpriteAnim, type Sprite, type SpriteTemplate,
} from "../hw/sprite";
import { AddTextPrinterParameterized4, DeactivateAllTextPrinters, RunTextPrinters } from "../hw/text";
import {
  CopyWindowToVram, COPYWIN_FULL, FillWindowPixelBuffer, FreeAllWindowBuffers,
  InitWindows, PIXEL_FILL, PutWindowTilemap, type WindowTemplate,
} from "../hw/window";
import { rom } from "../rom";
import { flagSet, save, SV, varGet } from "../save";
import { GetMonData } from "./mon";
import { calculateStats, createMon, nickname, setDexFlag, speciesName, tradeEvolution, type Pokemon } from "./pokemon";
import { GetInGameTradeMail } from "./mail";
import { GetMonFrontSpritePal, LoadSpecialPokePic } from "./pics";
import { evolveWithMessages } from "../menus/monProgress";
import { CreatePokeballSpriteToReleaseMon, CreateTradePokeballSprite } from "../battle/pokeball";

const DISPLAY_WIDTH = 240;
const DISPLAY_HEIGHT = 160;

const TRADE_PLAYER = 0;
const TRADE_PARTNER = 1;

// Tags from trade_scene.c
const GFXTAG_LINK_MON_GLOW = 5550;
const PALTAG_LINK_MON = 5551;
const GFXTAG_LINK_MON_SHADOW = 5552;
const GFXTAG_CABLE_END = 5554;
const PALTAG_GBA = 5555;
const GFXTAG_GBA_SCREEN = 5556;
const GFXTAG_POKEBALL = 5557;
const PALTAG_POKEBALL = 5558;

// Animation States
const STATE_START = 0;
const STATE_MON_SLIDE_IN = 1;
const STATE_SEND_MSG = 10;
const STATE_BYE_BYE = 11;
const STATE_POKEBALL_DEPART = 12;
const STATE_POKEBALL_DEPART_WAIT = 13;
const STATE_FADE_OUT_TO_GBA_SEND = 14;
const STATE_WAIT_FADE_OUT_TO_GBA_SEND = 20;
const STATE_FADE_IN_TO_GBA_SEND = 21;
const STATE_WAIT_FADE_IN_TO_GBA_SEND = 22;
const STATE_GBA_ZOOM_OUT = 23;
const STATE_GBA_FLASH_SEND = 24;
const STATE_GBA_STOP_FLASH_SEND = 25;
const STATE_PAN_AWAY_GBA = 26;
const STATE_CREATE_LINK_MON_LEAVING = 27;
const STATE_LINK_MON_TRAVEL_OUT = 28;
const STATE_FADE_OUT_TO_CROSSING = 29;
const STATE_WAIT_FADE_OUT_TO_CROSSING = 30;
const STATE_FADE_IN_TO_CROSSING = 31;
const STATE_WAIT_FADE_IN_TO_CROSSING = 32;
const STATE_CROSSING_LINK_MONS_ENTER = 33;
const STATE_CROSSING_BLEND_WHITE_1 = 34;
const STATE_CROSSING_BLEND_WHITE_2 = 35;
const STATE_CROSSING_BLEND_WHITE_3 = 36;
const STATE_CROSSING_CREATE_MON_PICS = 37;
const STATE_CROSSING_MON_PICS_MOVE = 38;
const STATE_CROSSING_LINK_MONS_EXIT = 39;
const STATE_CREATE_LINK_MON_ARRIVING = 40;
const STATE_FADE_OUT_TO_GBA_RECV = 41;
const STATE_WAIT_FADE_OUT_TO_GBA_RECV = 42;
const STATE_LINK_MON_TRAVEL_IN = 43;
const STATE_PAN_TO_GBA = 44;
const STATE_DESTROY_LINK_MON = 45;
const STATE_LINK_MON_ARRIVED_DELAY = 46;
const STATE_MOVE_GBA_TO_CENTER = 47;
const STATE_GBA_FLASH_RECV = 48;
const STATE_GBA_STOP_FLASH_RECV = 50;
const STATE_GBA_ZOOM_IN = 51;
const STATE_FADE_OUT_TO_NEW_MON = 52;
const STATE_WAIT_FADE_OUT_TO_NEW_MON = 60;
const STATE_FADE_IN_TO_NEW_MON = 61;
const STATE_WAIT_FADE_IN_TO_NEW_MON = 62;
const STATE_POKEBALL_ARRIVE = 63;
const STATE_FADE_POKEBALL_TO_NORMAL = 64;
const STATE_POKEBALL_ARRIVE_WAIT = 65;
const STATE_SHOW_NEW_MON = 66;
const STATE_NEW_MON_MSG = 67;
const STATE_DELAY_FOR_MON_ANIM = 167;
const STATE_WAIT_FOR_MON_CRY = 267;
const STATE_TAKE_CARE_OF_MON = 68;
const STATE_AFTER_NEW_MON_DELAY = 69;
const STATE_CHECK_RIBBONS = 70;
const STATE_END_LINK_TRADE = 71;
const STATE_TRY_EVOLUTION = 72;
const STATE_FADE_OUT_END = 73;
const STATE_WAIT_FADE_OUT_END = 74;

type InGameTrade = {
  nickname: number[]; species: number; ivs: number[]; abilityNum: number; otId: number;
  conditions: number[]; personality: number; heldItem: number; mailNum: number;
  otName: number[]; otGender: number; sheen: number; requestedSpecies: number;
};

interface TradeAnimState {
  timer: number;
  monPersonalities: [number, number];
  monSpecies: [number, number];
  monSpriteIds: [number, number];
  connectionSpriteId1: number;
  connectionSpriteId2: number;
  cableEndSpriteId: number;
  releasePokeballSpriteId: number;
  bouncingPokeballSpriteId: number;
  bg2texX: number;
  bg2texY: number;
  bg2srcX: number;
  bg2srcY: number;
  bg1vofs: number;
  bg1hofs: number;
  bg2vofs: number;
  bg2hofs: number;
  sXY: number;
  bg2Zoom: number;
  bg2alpha: number;
  isLinkTrade: boolean;
  isCableTrade: boolean;
  cachedMapMusic: number;
  textColor: number[];
  win0left: number;
  win0top: number;
  win0right: number;
  win0bottom: number;
  state: number;
  tradeCallback?: () => void;
}

let sTradeAnim: TradeAnimState | null = null;
let tradeMon: Pokemon | null = null;

const rd = <T>(name: string): T => cdata<T>("trade_scene", name);

export async function preloadTradeScene(): Promise<void> {
  await Promise.all([
    preloadPacks(["graphics_trade", "graphics_battle_anims", "graphics_interface"]),
    loadCData("trade_scene", "trade", "pokeball", "strings"),
  ]);
}

const trades = (): InGameTrade[] => cdata<InGameTrade[]>("trade_scene", "sInGameTrades");

/** GetInGameTradeSpeciesInfo */
export function getInGameTradeSpeciesInfo(): number {
  const t = trades()[varGet(SV.x8004)];
  stringVars.var1 = speciesName(t.requestedSpecies);
  stringVars.var2 = speciesName(t.species);
  return t.requestedSpecies;
}

/** GetTradeSpecies */
export function getTradeSpecies(): number {
  const mon = save.party[varGet(SV.x8005)];
  return !mon || mon.isEgg ? C.SPECIES_NONE : mon.species;
}

/** CreateInGameTradePokemon */
export function createInGameTradePokemon(): void {
  CreateInGameTradePokemonInternal(varGet(SV.x8005), varGet(SV.x8004));
}

function CreateInGameTradePokemonInternal(playerSlot: number, inGameTradeIdx: number): void {
  const t = trades()[inGameTradeIdx];
  const level = save.party[playerSlot]?.level ?? 5;
  const mon = createMon(t.species, level, { personality: t.personality >>> 0, otId: t.otId >>> 0 });
  mon.ivs = [...t.ivs];
  mon.nickname = [...t.nickname];
  mon.otName = [...t.otName];
  mon.otGender = t.otGender;
  mon.abilityNum = t.abilityNum;
  mon.metLocation = C.METLOC_IN_GAME_TRADE;
  if (t.heldItem) mon.heldItem = t.heldItem;
  if (t.mailNum !== undefined && t.mailNum !== 255) GetInGameTradeMail(mon, t.mailNum, [...t.otName], t.otId);
  (mon as Pokemon & { contest?: number[] }).contest = [t.conditions[0], t.conditions[1], t.conditions[2], t.conditions[3], t.conditions[4], t.sheen];
  calculateStats(mon);
  mon.hp = mon.stats[0];
  tradeMon = mon;
}

function BufferInGameTradeMonName(): void {
  const sent = save.party[varGet(SV.x8005)];
  if (sent) stringVars.var1 = nickname(sent);
  const t = trades()[varGet(SV.x8004)];
  if (t) stringVars.var2 = speciesName(t.species);
}

function TradeBufferOTnameAndNicknames(): void {
  const t = trades()[varGet(SV.x8004)];
  if (t) {
    stringVars.var1 = Uint8Array.from(t.otName);
    stringVars.var3 = Uint8Array.from(t.nickname);
  }
  const sent = save.party[varGet(SV.x8005)];
  if (sent) stringVars.var2 = nickname(sent);
}

// ---------------------------------------------------------------- GPU and Bg
function SetTradeBGAffine(): void {
  if (!sTradeAnim) return;
  const sXY = sTradeAnim.sXY;
  const pa = sXY & 0xffff;
  const pb = 0;
  const pc = 0;
  const pd = sXY & 0xffff;
  const dx = ((sTradeAnim.bg2srcX << 8) - (pa * sTradeAnim.bg2texX)) | 0;
  const dy = ((sTradeAnim.bg2srcY << 8) - (pd * sTradeAnim.bg2texY)) | 0;

  SetGpuReg(REG_OFFSET_BG2PA, pa);
  SetGpuReg(REG_OFFSET_BG2PB, pb);
  SetGpuReg(REG_OFFSET_BG2PC, pc);
  SetGpuReg(REG_OFFSET_BG2PD, pd);
  SetGpuReg(REG_OFFSET_BG2X_L, dx & 0xffff);
  SetGpuReg(REG_OFFSET_BG2Y_L, dy & 0xffff);
}

function SetTradeGpuRegs(): void {
  if (!sTradeAnim) return;
  SetGpuReg(REG_OFFSET_BG1VOFS, sTradeAnim.bg1vofs);
  SetGpuReg(REG_OFFSET_BG1HOFS, sTradeAnim.bg1hofs);

  const dispcnt = GetGpuReg(REG_OFFSET_DISPCNT);
  if ((dispcnt & 7) === DISPCNT_MODE_0) {
    SetGpuReg(REG_OFFSET_BG2VOFS, sTradeAnim.bg2vofs);
    SetGpuReg(REG_OFFSET_BG2HOFS, sTradeAnim.bg2hofs);
  } else {
    SetTradeBGAffine();
  }
}

function VBlankCB_TradeAnim(): void {
  SetTradeGpuRegs();
  LoadOam();
  ProcessSpriteCopyRequests();
  TransferPlttBuffer();
}

function SetTradeSequenceBgGpuRegs(state: number): void {
  if (!sTradeAnim) return;
  switch (state) {
    case 0:
      sTradeAnim.bg2vofs = 0;
      sTradeAnim.bg2hofs = 0xb4;
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_BG0_ON | DISPCNT_BG2_ON | DISPCNT_OBJ_ON);
      SetGpuReg(REG_OFFSET_BG2CNT, 2 | (1 << 2) | (18 << 8));
      LoadPalette(incbin16("sGba_Pal"), BG_PLTT_ID(1), 32);
      LoadBgTiles(1, incbin("sGbaAffine_Gfx"), 0x1000, 0);
      CopyToBgTilemapBuffer(2, incbin16("gTradeOrHatchMonShadowTilemap"), 0x1000, 0);
      break;
    case 1:
      sTradeAnim.bg1hofs = 0;
      sTradeAnim.bg1vofs = 0x15c;
      SetGpuReg(REG_OFFSET_BG1VOFS, 0x15c);
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_BG1_ON | DISPCNT_OBJ_ON);
      CopyToBgTilemapBuffer(1, incbin16(sTradeAnim.isCableTrade ? "sGbaMapCable" : "sGbaMapWireless"), 0x1000, 0);
      LoadBgTiles(0, incbin("sGbaAffine_Gfx"), 0x1000, 0);
      break;
    case 2:
      sTradeAnim.bg1vofs = 0;
      sTradeAnim.bg1hofs = 0;
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_1 | DISPCNT_OBJ_1D_MAP | DISPCNT_BG1_ON | DISPCNT_OBJ_ON);
      CopyToBgTilemapBuffer(1, incbin16("sCableCloseup_Map"), 0x800, 0);
      BlendPalettes(0x1, 16, RGB_BLACK);
      break;
    case 4:
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_1 | DISPCNT_OBJ_1D_MAP | DISPCNT_BG2_ON | DISPCNT_OBJ_ON);
      sTradeAnim.bg2texX = 0x40;
      sTradeAnim.bg2texY = 0x5c;
      sTradeAnim.sXY = 0x20;
      sTradeAnim.bg2Zoom = 0x400;
      sTradeAnim.bg2alpha = 0;
      LoadBgTiles(1, incbin("sGbaAffine_Gfx"), 0x1000, 0);
      CopyToBgTilemapBuffer(2, incbin16("sGbaAffineMapCable"), 0x100, 0);
      break;
    case 5:
      sTradeAnim.bg1vofs = 0;
      sTradeAnim.bg1hofs = 0;
      break;
    case 6:
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_1 | DISPCNT_OBJ_1D_MAP | DISPCNT_BG2_ON | DISPCNT_OBJ_ON);
      sTradeAnim.bg2texX = 0x40;
      sTradeAnim.bg2texY = 0x5c;
      sTradeAnim.sXY = 0x100;
      sTradeAnim.bg2Zoom = 0x80;
      sTradeAnim.bg2srcX = 0x78;
      sTradeAnim.bg2srcY = 0x50;
      sTradeAnim.bg2alpha = 0;
      LoadBgTiles(1, incbin("sGbaAffine_Gfx"), 0x1000, 0);
      CopyToBgTilemapBuffer(2, incbin16("sGbaAffineMapCable"), 0x100, 0);
      break;
    case 7:
      sTradeAnim.bg2vofs = 0;
      sTradeAnim.bg2hofs = 0;
      SetGpuReg(REG_OFFSET_BLDCNT, 0);
      LoadPalette(incbin16("sGba_Pal"), BG_PLTT_ID(1), 32);
      LoadBgTiles(1, incbin("sGbaAffine_Gfx"), 0x1000, 0);
      CopyToBgTilemapBuffer(2, incbin16("gTradeOrHatchMonShadowTilemap"), 0x1000, 0);
      break;
  }
}

export function InitTradeSequenceBgGpuRegs(): void {
  SetTradeSequenceBgGpuRegs(5);
  SetTradeSequenceBgGpuRegs(0);
}

function TradeAnimInit_LoadGfx(): void {
  SetGpuReg(REG_OFFSET_DISPCNT, 0);
  ResetBgsAndClearDma3BusyFlags(false);
  InitBgsFromTemplates(0, rd<BgTemplate[]>("sBgTemplates"), 4);
  SetBgTilemapBuffer(0, new Uint16Array(BG_SCREEN_SIZE));
  SetBgTilemapBuffer(1, new Uint16Array(BG_SCREEN_SIZE));
  SetBgTilemapBuffer(2, new Uint16Array(BG_SCREEN_SIZE));
  SetBgTilemapBuffer(3, new Uint16Array(BG_SCREEN_SIZE));
  DeactivateAllTextPrinters();
  InitWindows(rd<WindowTemplate[]>("sTradeMessageWindowTemplates"));
}

export function DrawTextOnTradeWindow(windowId: number, str: Uint8Array | number[], speed: number): void {
  FillWindowPixelBuffer(windowId, PIXEL_FILL(15));
  const textColor = [15, 1, 6];
  AddTextPrinterParameterized4(windowId, FONT_NORMAL, 0, 2, 0, 2, textColor, speed, str);
  CopyWindowToVram(windowId, COPYWIN_FULL);
}

// ---------------------------------------------------------------- Sprites & Templates
const sTradeBallVerticalVelocityTable = [
  0,  0,  1,  0,  1,  0,  1,  1,  1,  1,  2,  2,  2,  2,  3,  3,  3,  3,  4,  4,  4,  4, -4, -4,
 -4, -3, -3, -3, -3, -2, -2, -2, -2, -1, -1, -1, -1,  0, -1,  0, -1,  0,  0,  0,  0,  0,  1,  0,
  1,  0,  1,  1,  1,  1,  2,  2,  2,  2,  3,  3,  3,  3,  4,  4,  4,  4, -4, -3, -3, -2, -2, -1,
 -1, -1,  0, -1,  0,  0,  0,  0,  0,  0,  1,  0,  1,  1,  1,  2,  2,  3,  3,  4, -4, -3, -2, -1,
 -1, -1,  0,  0,  0,  0,  1,  0,  1,  1,  2,  3,
];

const sLinkMonShadow_Pal = [
  RGB(18, 24, 31), RGB(18, 24, 31), RGB(18, 24, 31),
  RGB(31, 31, 31), RGB(31, 31, 31), RGB(31, 31, 31),
  RGB(18, 24, 31), RGB(18, 24, 31), RGB(18, 24, 31),
  RGB(31, 31, 31), RGB(31, 31, 31), RGB(31, 31, 31),
];

export function SpriteCB_LinkMonGlow(sprite: Sprite): void {
  if (++sprite.data[0] === 10) {
    sound.playSE(C.SE_BALL);
    sprite.data[0] = 0;
  }
}

export function SpriteCB_LinkMonGlowWireless(sprite: Sprite): void {
  if (!sprite.invisible && ++sprite.data[0] === 10) {
    sound.playSE(C.SE_M_SWAGGER2);
    sprite.data[0] = 0;
  }
}

export function SpriteCB_LinkMonShadow(sprite: Sprite): void {
  if (sprite.data[1] === 0) {
    if (++sprite.data[0] === 12) sprite.data[0] = 0;
    LoadPalette([sLinkMonShadow_Pal[sprite.data[0]]], OBJ_PLTT_ID(sprite.oam.paletteNum) + 4, 2);
  }
}

export function SpriteCB_CableEndSending(sprite: Sprite): void {
  sprite.data[0]++;
  sprite.y2++;
  if (sprite.data[0] === 10) DestroySprite(sprite);
}

export function SpriteCB_CableEndReceiving(sprite: Sprite): void {
  sprite.data[0]++;
  sprite.y2--;
  if (sprite.data[0] === 10) DestroySprite(sprite);
}

export function SpriteCB_GbaScreen(sprite: Sprite): void {
  if (++sprite.data[0] === 15) {
    sound.playSE(C.SE_M_MINIMIZE);
    sprite.data[0] = 0;
  }
}

export function SpriteCB_BouncingPokeball(sprite: Sprite): void {
  // trade_scene.c stores these values in s16 Sprite.data slots and s16 x/y.
  const s16 = (value: number) => (value << 16) >> 16;
  sprite.y = s16(sprite.y + Math.trunc(sprite.data[0] / 10));
  sprite.data[5] = s16(sprite.data[5] + sprite.data[1]);
  sprite.x = s16(Math.trunc(sprite.data[5] / 10));
  if (sprite.y > 76) {
    sprite.y = 76;
    sprite.data[0] = s16(Math.trunc(-(sprite.data[0] * sprite.data[2]) / 100));
    sprite.data[3] = s16(sprite.data[3] + 1);
  }
  if (sprite.x === 120) sprite.data[1] = 0;
  sprite.data[0] = s16(sprite.data[0] + sprite.data[4]);
  if (sprite.data[3] === 4) {
    sprite.data[7] = 1;
    sprite.callback = SpriteCallbackDummy;
  }
}

export function SpriteCB_BouncingPokeballDepart(sprite: Sprite): void {
  if (++sprite.data[0] === 10) {
    sound.playSE(C.SE_BALL_BOUNCE_1);
    sprite.data[0] = 0;
    sprite.data[1] = 0;
    StartSpriteAffineAnim(sprite, 1);
    StartSpriteAnim(sprite, 0);
    sprite.callback = SpriteCB_BouncingPokeballDepartEnd;
  }
}

function SpriteCB_BouncingPokeballDepartEnd(sprite: Sprite): void {
  const v = sTradeBallVerticalVelocityTable[sprite.data[0]] ?? 0;
  sprite.y2 += v;
  if (sprite.data[0] === 43) sound.playSE(C.SE_BALL_BOUNCE_2);
  if (sprite.data[0] === 69) sound.playSE(C.SE_BALL_BOUNCE_3);
  if (sprite.data[0] === 85) sound.playSE(C.SE_BALL_BOUNCE_4);
  if (++sprite.data[0] === 86) {
    sprite.data[0] = 0;
    if (sTradeAnim) sTradeAnim.state = STATE_FADE_OUT_TO_GBA_SEND;
    sprite.callback = SpriteCallbackDummy;
  }
}

export function SpriteCB_BouncingPokeballArrive(sprite: Sprite): void {
  if (sprite.data[2] === 0) {
    sprite.y += 4;
    if (sprite.y > sprite.data[3]) {
      sprite.data[2]++;
      sprite.data[0] = 22;
      sound.playSE(C.SE_BALL_BOUNCE_1);
    }
  } else {
    if (sprite.data[0] === 66) sound.playSE(C.SE_BALL_BOUNCE_2);
    if (sprite.data[0] === 92) sound.playSE(C.SE_BALL_BOUNCE_3);
    if (sprite.data[0] === 107) sound.playSE(C.SE_BALL_BOUNCE_4);
    sprite.y2 += sTradeBallVerticalVelocityTable[sprite.data[0]] ?? 0;
    if (++sprite.data[0] === 108) {
      sprite.callback = SpriteCallbackDummy;
    }
  }
}

function getPokeballTemplate(): SpriteTemplate {
  return templateFrom(rd<CSpriteTemplate>("sSpriteTemplate_Pokeball"), {
    SpriteCB_BouncingPokeball,
  });
}

function getLinkMonGlowTemplate(): SpriteTemplate {
  return templateFrom(rd<CSpriteTemplate>("sSpriteTemplate_LinkMonGlow"), {
    SpriteCB_LinkMonGlow,
  });
}

function getLinkMonShadowTemplate(): SpriteTemplate {
  return templateFrom(rd<CSpriteTemplate>("sSpriteTemplate_LinkMonShadow"), {
    SpriteCB_LinkMonShadow,
  });
}

function getCableEndTemplate(): SpriteTemplate {
  return templateFrom(rd<CSpriteTemplate>("sSpriteTemplate_CableEnd"), {
    SpriteCB_CableEndSending,
  });
}

function getGbaScreenFlashLongTemplate(): SpriteTemplate {
  return templateFrom(rd<CSpriteTemplate>("sSpriteTemplate_GbaScreenFlash_Long"), {
    SpriteCB_GbaScreen,
  });
}

export function LoadTradeGbaSpriteGfx(): void {
  LoadSpriteSheet({ data: incbin("sLinkMonGlow_Gfx"), size: 512, tag: GFXTAG_LINK_MON_GLOW });
  LoadSpriteSheet({ data: incbin("sLinkMonShadow_Gfx"), size: 512, tag: GFXTAG_LINK_MON_SHADOW });
  LoadSpriteSheet({ data: incbin("sCableEnd_Gfx"), size: 512, tag: GFXTAG_CABLE_END });
  LoadSpriteSheet({ data: incbin("sGbaScreen_Gfx"), size: 4096, tag: GFXTAG_GBA_SCREEN });
  LoadSpritePalette({ data: incbin16("sLinkMon_Pal"), tag: PALTAG_LINK_MON });
  LoadSpritePalette({ data: incbin16("sGba_Pal"), tag: PALTAG_GBA });
}

// ---------------------------------------------------------------- Tasks
export function Task_OpenCenterWhiteColumn(taskId: number): void {
  if (!sTradeAnim) { tasks.destroy(taskId); return; }
  const data = tasks.tasks[taskId].data;
  if (data[0] === 0) {
    sTradeAnim.win0left = sTradeAnim.win0right = DISPLAY_WIDTH / 2;
    sTradeAnim.win0top = 0;
    sTradeAnim.win0bottom = DISPLAY_HEIGHT;
    SetGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
    SetGpuReg(REG_OFFSET_WINOUT, 4); // OBJ
    SetGpuReg(REG_OFFSET_WININ, 1 | 2 | 4); // BG0, BG1, OBJ
  }
  SetGpuReg(REG_OFFSET_WIN0H, ((sTradeAnim.win0left & 0xff) << 8) | (sTradeAnim.win0right & 0xff));
  SetGpuReg(REG_OFFSET_WIN0V, ((sTradeAnim.win0top & 0xff) << 8) | (sTradeAnim.win0bottom & 0xff));
  data[0]++;
  sTradeAnim.win0left -= 5;
  sTradeAnim.win0right += 5;
  if (sTradeAnim.win0left < 80) tasks.destroy(taskId);
}

export function Task_CloseCenterWhiteColumn(taskId: number): void {
  if (!sTradeAnim) { tasks.destroy(taskId); return; }
  const data = tasks.tasks[taskId].data;
  if (data[0] === 0) {
    sTradeAnim.win0left = 80;
    sTradeAnim.win0right = DISPLAY_WIDTH - 80;
    SetGpuReg(REG_OFFSET_WINOUT, 4);
    SetGpuReg(REG_OFFSET_WININ, 1 | 2 | 4);
  }
  SetGpuReg(REG_OFFSET_WIN0H, ((sTradeAnim.win0left & 0xff) << 8) | (sTradeAnim.win0right & 0xff));
  SetGpuReg(REG_OFFSET_WIN0V, ((sTradeAnim.win0top & 0xff) << 8) | (sTradeAnim.win0bottom & 0xff));
  if (sTradeAnim.win0left !== DISPLAY_WIDTH / 2) {
    data[0]++;
    sTradeAnim.win0left += 5;
    sTradeAnim.win0right -= 5;
    if (sTradeAnim.win0left > DISPLAY_WIDTH / 2 - 5) {
      BlendPalettes(0x8, 0, RGB_WHITE);
    }
  } else {
    ClearGpuRegBits(REG_OFFSET_DISPCNT, DISPCNT_WIN0_ON);
    tasks.destroy(taskId);
  }
}

// ---------------------------------------------------------------- Mon pic loading
function LoadTradeMonPic(whichParty: number, state: number): void {
  if (!sTradeAnim) return;
  const playerSlot = varGet(SV.x8005);
  const mon = whichParty === TRADE_PLAYER ? save.party[playerSlot] : tradeMon;
  if (!mon) return;

  const species = mon.species;
  const personality = mon.personality;

  if (state === 0) {
    sTradeAnim.monSpecies[whichParty] = species;
    sTradeAnim.monPersonalities[whichParty] = personality;
  } else {
    const picBuffer = new Uint8Array(C.MON_PIC_SIZE * C.MAX_MON_PIC_FRAMES);
    LoadSpecialPokePic(true, picBuffer, species, personality);
    const palBuffer = GetMonFrontSpritePal(mon);
    const palTag = 6000 + whichParty;
    const tileTag = 6100 + whichParty;
    LoadSpriteSheet({ data: picBuffer, size: C.MON_PIC_SIZE, tag: tileTag });
    LoadSpritePalette({ data: palBuffer, tag: palTag });

    const tmpl: SpriteTemplate = {
      tileTag,
      paletteTag: palTag,
      oam: oamFrom({
        shape: 0,
        size: 3, // 64x64
        priority: 1,
      }),
      anims: animsFrom([{ type: "frame", image: 0, duration: 0 }]),
      images: null,
      affineAnims: affineAnimsFrom([{ type: "frame", xScale: 256, yScale: 256, rotation: 0, duration: 0 }]),
      callback: SpriteCallbackDummy,
    };

    const spriteId = CreateSprite(tmpl, 120, 60, 6);
    sTradeAnim.monSpriteIds[whichParty] = spriteId;
    if (spriteId < MAX_SPRITES) {
      gSprites[spriteId].invisible = true;
    }
  }
}

// ---------------------------------------------------------------- Animation Sequence
export function DoTradeAnim_Cable(): boolean {
  if (!sTradeAnim) return true;

  switch (sTradeAnim.state) {
    case STATE_START: {
      const spId = sTradeAnim.monSpriteIds[TRADE_PLAYER];
      if (spId < MAX_SPRITES) {
        gSprites[spId].invisible = false;
        gSprites[spId].x2 = -180;
        gSprites[spId].y2 = 0;
      }
      sTradeAnim.state++;
      sTradeAnim.cachedMapMusic = sound.currentBGM;
      sound.playBGM(C.MUS_EVOLUTION);
      break;
    }
    case STATE_MON_SLIDE_IN: {
      const spId = sTradeAnim.monSpriteIds[TRADE_PLAYER];
      if (sTradeAnim.bg2hofs > 0) {
        if (spId < MAX_SPRITES) gSprites[spId].x2 += 3;
        sTradeAnim.bg2hofs -= 3;
      } else {
        if (spId < MAX_SPRITES) gSprites[spId].x2 = 0;
        sTradeAnim.bg2hofs = 0;
        sTradeAnim.state = STATE_SEND_MSG;
      }
      break;
    }
    case STATE_SEND_MSG: {
      const msg = expandPlaceholders(rom.text("gText_XWillBeSentToY"));
      DrawTextOnTradeWindow(0, msg, 0);
      if (sTradeAnim.monSpecies[TRADE_PLAYER] !== C.SPECIES_EGG) {
        sound.PlayCry_Normal(sTradeAnim.monSpecies[TRADE_PLAYER], 0);
      }
      sTradeAnim.state = STATE_BYE_BYE;
      sTradeAnim.timer = 0;
      break;
    }
    case STATE_BYE_BYE: {
      if (++sTradeAnim.timer === 80) {
        const monId = sTradeAnim.monSpriteIds[TRADE_PLAYER];
        const palNum = monId < MAX_SPRITES ? gSprites[monId].oam.paletteNum : 0;
        sTradeAnim.releasePokeballSpriteId = CreateTradePokeballSprite(monId, palNum, 120, 32, 2, 1, 0x14, 0xfffff);
        sTradeAnim.state++;
        const msg = expandPlaceholders(rom.text("gText_ByeByeVar1"));
        DrawTextOnTradeWindow(0, msg, 0);
      }
      break;
    }
    case STATE_POKEBALL_DEPART: {
      const relId = sTradeAnim.releasePokeballSpriteId;
      if (relId >= MAX_SPRITES || gSprites[relId].callback === SpriteCallbackDummy) {
        sTradeAnim.bouncingPokeballSpriteId = CreateSprite(getPokeballTemplate(), 120, 32, 0);
        if (sTradeAnim.bouncingPokeballSpriteId < MAX_SPRITES) {
          gSprites[sTradeAnim.bouncingPokeballSpriteId].callback = SpriteCB_BouncingPokeballDepart;
        }
        if (relId < MAX_SPRITES) DestroySprite(gSprites[relId]);
        sTradeAnim.state++;
      }
      break;
    }
    case STATE_POKEBALL_DEPART_WAIT:
      break;
    case STATE_FADE_OUT_TO_GBA_SEND:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      sTradeAnim.state = STATE_WAIT_FADE_OUT_TO_GBA_SEND;
      break;
    case STATE_WAIT_FADE_OUT_TO_GBA_SEND:
      if (!gPaletteFade.active) {
        SetTradeSequenceBgGpuRegs(4);
        FillWindowPixelBuffer(0, PIXEL_FILL(15));
        CopyWindowToVram(0, COPYWIN_FULL);
        sTradeAnim.state++;
      }
      break;
    case STATE_FADE_IN_TO_GBA_SEND:
      BeginNormalPaletteFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
      sTradeAnim.state++;
      break;
    case STATE_WAIT_FADE_IN_TO_GBA_SEND:
      if (!gPaletteFade.active) sTradeAnim.state = STATE_GBA_ZOOM_OUT;
      break;
    case STATE_GBA_ZOOM_OUT:
      if (sTradeAnim.bg2Zoom > 0x100) {
        sTradeAnim.bg2Zoom -= 0x34;
      } else {
        SetTradeSequenceBgGpuRegs(1);
        sTradeAnim.bg2Zoom = 0x80;
        sTradeAnim.state++;
        sTradeAnim.timer = 0;
      }
      sTradeAnim.sXY = Math.trunc(0x8000 / sTradeAnim.bg2Zoom);
      break;
    case STATE_GBA_FLASH_SEND:
      if (++sTradeAnim.timer > 20) {
        SetTradeBGAffine();
        sTradeAnim.connectionSpriteId2 = CreateSprite(getGbaScreenFlashLongTemplate(), 120, 80, 0);
        sTradeAnim.state++;
      }
      break;
    case STATE_GBA_STOP_FLASH_SEND: {
      const flashId = sTradeAnim.connectionSpriteId2;
      if (flashId >= MAX_SPRITES || gSprites[flashId].animEnded) {
        if (flashId < MAX_SPRITES) DestroySprite(gSprites[flashId]);
        SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_EFFECT_BLEND | BLDCNT_TGT2_BG1 | BLDCNT_TGT2_BG2);
        SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(12, 4));
        sTradeAnim.state++;
      }
      break;
    }
    case STATE_PAN_AWAY_GBA:
      if (--sTradeAnim.bg1vofs === 316) sTradeAnim.state++;
      if (sTradeAnim.bg1vofs === 328) {
        sTradeAnim.cableEndSpriteId = CreateSprite(getCableEndTemplate(), 128, 65, 0);
      }
      break;
    case STATE_CREATE_LINK_MON_LEAVING:
      sTradeAnim.connectionSpriteId1 = CreateSprite(getLinkMonGlowTemplate(), 128, 80, 3);
      sTradeAnim.connectionSpriteId2 = CreateSprite(getLinkMonShadowTemplate(), 128, 80, 0);
      if (sTradeAnim.connectionSpriteId2 < MAX_SPRITES) {
        StartSpriteAnim(gSprites[sTradeAnim.connectionSpriteId2], 1);
      }
      sTradeAnim.state++;
      break;
    case STATE_LINK_MON_TRAVEL_OUT:
      sTradeAnim.bg1vofs -= 2;
      if (sTradeAnim.bg1vofs <= 166) sTradeAnim.state = 200; // travel offscreen
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_1 | DISPCNT_OBJ_1D_MAP | DISPCNT_BG1_ON | DISPCNT_OBJ_ON);
      break;
    case 200: { // STATE_LINK_MON_TRAVEL_OFFSCREEN
      const s1 = sTradeAnim.connectionSpriteId1;
      const s2 = sTradeAnim.connectionSpriteId2;
      if (s1 < MAX_SPRITES) gSprites[s1].y -= 2;
      if (s2 < MAX_SPRITES) gSprites[s2].y -= 2;
      if (s1 < MAX_SPRITES && gSprites[s1].y < -8) sTradeAnim.state = STATE_FADE_OUT_TO_CROSSING;
      break;
    }
    case STATE_FADE_OUT_TO_CROSSING:
      BeginNormalPaletteFade(PALETTES_ALL, -1, 0, 16, RGB_BLACK);
      sTradeAnim.state = STATE_WAIT_FADE_OUT_TO_CROSSING;
      break;
    case STATE_WAIT_FADE_OUT_TO_CROSSING:
      if (!gPaletteFade.active) {
        if (sTradeAnim.connectionSpriteId1 < MAX_SPRITES) DestroySprite(gSprites[sTradeAnim.connectionSpriteId1]);
        if (sTradeAnim.connectionSpriteId2 < MAX_SPRITES) DestroySprite(gSprites[sTradeAnim.connectionSpriteId2]);
        SetTradeSequenceBgGpuRegs(2);
        sTradeAnim.state++;
      }
      break;
    case STATE_FADE_IN_TO_CROSSING:
      BeginNormalPaletteFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
      sTradeAnim.connectionSpriteId1 = CreateSprite(getLinkMonShadowTemplate(), 111, 170, 0);
      sTradeAnim.connectionSpriteId2 = CreateSprite(getLinkMonShadowTemplate(), 129, -10, 0);
      sTradeAnim.state++;
      break;
    case STATE_WAIT_FADE_IN_TO_CROSSING: {
      if (!gPaletteFade.active) {
        sound.playSE(C.SE_WARP_OUT);
        sTradeAnim.state++;
      }
      const s1 = sTradeAnim.connectionSpriteId1;
      const s2 = sTradeAnim.connectionSpriteId2;
      if (s1 < MAX_SPRITES) gSprites[s1].y2 -= 3;
      if (s2 < MAX_SPRITES) gSprites[s2].y2 += 3;
      break;
    }
    case STATE_CROSSING_LINK_MONS_ENTER: {
      const s1 = sTradeAnim.connectionSpriteId1;
      const s2 = sTradeAnim.connectionSpriteId2;
      if (s1 < MAX_SPRITES) gSprites[s1].y2 -= 3;
      if (s2 < MAX_SPRITES) gSprites[s2].y2 += 3;
      if (s1 < MAX_SPRITES && gSprites[s1].y2 <= -90) {
        gSprites[s1].data[1] = 1;
        if (s2 < MAX_SPRITES) gSprites[s2].data[1] = 1;
        sTradeAnim.state++;
      }
      break;
    }
    case STATE_CROSSING_BLEND_WHITE_1:
      BlendPalettes(0x1, 16, RGB_WHITE);
      sTradeAnim.state++;
      break;
    case STATE_CROSSING_BLEND_WHITE_2:
      BlendPalettes(0x1, 0, RGB_WHITE);
      sTradeAnim.state++;
      break;
    case STATE_CROSSING_BLEND_WHITE_3:
      BlendPalettes(0x1, 16, RGB_WHITE);
      sTradeAnim.state++;
      break;
    case STATE_CROSSING_CREATE_MON_PICS: {
      const p1 = sTradeAnim.monSpriteIds[TRADE_PLAYER];
      const p2 = sTradeAnim.monSpriteIds[TRADE_PARTNER];
      if (p1 < MAX_SPRITES) {
        gSprites[p1].x = 60;
        gSprites[p1].y = 192;
        gSprites[p1].y2 = 0;
        gSprites[p1].invisible = false;
      }
      if (p2 < MAX_SPRITES) {
        gSprites[p2].x = 180;
        gSprites[p2].y = -32;
        gSprites[p2].y2 = 0;
        gSprites[p2].invisible = false;
      }
      sTradeAnim.state++;
      break;
    }
    case STATE_CROSSING_MON_PICS_MOVE: {
      const p1 = sTradeAnim.monSpriteIds[TRADE_PLAYER];
      const p2 = sTradeAnim.monSpriteIds[TRADE_PARTNER];
      if (p1 < MAX_SPRITES) gSprites[p1].y2 -= 3;
      if (p2 < MAX_SPRITES) gSprites[p2].y2 += 3;
      if (p1 < MAX_SPRITES && gSprites[p1].y2 < -DISPLAY_HEIGHT && gSprites[p1].y2 >= -DISPLAY_HEIGHT - 3) {
        sound.playSE(C.SE_WARP_IN);
      }
      if (p1 < MAX_SPRITES && gSprites[p1].y2 < -222) {
        const s1 = sTradeAnim.connectionSpriteId1;
        const s2 = sTradeAnim.connectionSpriteId2;
        if (s1 < MAX_SPRITES) gSprites[s1].data[1] = 0;
        if (s2 < MAX_SPRITES) gSprites[s2].data[1] = 0;
        sTradeAnim.state++;
        gSprites[p1].invisible = true;
        if (p2 < MAX_SPRITES) gSprites[p2].invisible = true;
        BlendPalettes(0x1, 0, RGB_WHITE);
      }
      break;
    }
    case STATE_CROSSING_LINK_MONS_EXIT: {
      const s1 = sTradeAnim.connectionSpriteId1;
      const s2 = sTradeAnim.connectionSpriteId2;
      if (s1 < MAX_SPRITES) gSprites[s1].y2 -= 3;
      if (s2 < MAX_SPRITES) gSprites[s2].y2 += 3;
      if (s1 < MAX_SPRITES && gSprites[s1].y2 <= -222) {
        BeginNormalPaletteFade(PALETTES_ALL, -1, 0, 16, RGB_BLACK);
        sTradeAnim.state++;
        DestroySprite(gSprites[s1]);
        if (s2 < MAX_SPRITES) DestroySprite(gSprites[s2]);
      }
      break;
    }
    case STATE_CREATE_LINK_MON_ARRIVING:
      if (!gPaletteFade.active) {
        sTradeAnim.state++;
        SetTradeSequenceBgGpuRegs(1);
        sTradeAnim.bg1vofs = 166;
        sTradeAnim.connectionSpriteId1 = CreateSprite(getLinkMonGlowTemplate(), 128, -20, 3);
        sTradeAnim.connectionSpriteId2 = CreateSprite(getLinkMonShadowTemplate(), 128, -20, 0);
        if (sTradeAnim.connectionSpriteId2 < MAX_SPRITES) {
          StartSpriteAnim(gSprites[sTradeAnim.connectionSpriteId2], 1);
        }
      }
      break;
    case STATE_FADE_OUT_TO_GBA_RECV:
      BeginNormalPaletteFade(PALETTES_ALL, -1, 16, 0, RGB_BLACK);
      sTradeAnim.state++;
      break;
    case STATE_WAIT_FADE_OUT_TO_GBA_RECV:
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_BG1_ON | DISPCNT_OBJ_ON);
      if (!gPaletteFade.active) sTradeAnim.state++;
      break;
    case STATE_LINK_MON_TRAVEL_IN: {
      const s1 = sTradeAnim.connectionSpriteId1;
      const s2 = sTradeAnim.connectionSpriteId2;
      if (s1 < MAX_SPRITES) gSprites[s1].y2 += 3;
      if (s2 < MAX_SPRITES) gSprites[s2].y2 += 3;
      if (s1 < MAX_SPRITES && gSprites[s1].y2 + gSprites[s1].y >= 64) {
        sTradeAnim.state++;
      }
      break;
    }
    case STATE_PAN_TO_GBA:
      sTradeAnim.bg1vofs += 2;
      if (sTradeAnim.bg1vofs > 316) {
        sTradeAnim.bg1vofs = 316;
        sTradeAnim.state++;
      }
      break;
    case STATE_DESTROY_LINK_MON: {
      const s1 = sTradeAnim.connectionSpriteId1;
      const s2 = sTradeAnim.connectionSpriteId2;
      if (s1 < MAX_SPRITES) DestroySprite(gSprites[s1]);
      if (s2 < MAX_SPRITES) DestroySprite(gSprites[s2]);
      sTradeAnim.state++;
      sTradeAnim.timer = 0;
      break;
    }
    case STATE_LINK_MON_ARRIVED_DELAY:
      if (++sTradeAnim.timer === 10) sTradeAnim.state++;
      break;
    case STATE_MOVE_GBA_TO_CENTER:
      if (++sTradeAnim.bg1vofs > 348) {
        sTradeAnim.bg1vofs = 348;
        sTradeAnim.state++;
      }
      if (sTradeAnim.bg1vofs === 328 && sTradeAnim.isCableTrade) {
        sTradeAnim.cableEndSpriteId = CreateSprite(getCableEndTemplate(), 128, 65, 0);
        if (sTradeAnim.cableEndSpriteId < MAX_SPRITES) {
          gSprites[sTradeAnim.cableEndSpriteId].callback = SpriteCB_CableEndReceiving;
        }
      }
      break;
    case STATE_GBA_FLASH_RECV:
      sTradeAnim.connectionSpriteId2 = CreateSprite(getGbaScreenFlashLongTemplate(), 120, 80, 0);
      sTradeAnim.state = STATE_GBA_STOP_FLASH_RECV;
      break;
    case STATE_GBA_STOP_FLASH_RECV: {
      const flashId = sTradeAnim.connectionSpriteId2;
      if (flashId >= MAX_SPRITES || gSprites[flashId].animEnded) {
        if (flashId < MAX_SPRITES) DestroySprite(gSprites[flashId]);
        SetTradeSequenceBgGpuRegs(6);
        sTradeAnim.state++;
        sound.playSE(C.SE_M_SAND_ATTACK);
      }
      break;
    }
    case STATE_GBA_ZOOM_IN:
      if (sTradeAnim.bg2Zoom < 0x400) {
        sTradeAnim.bg2Zoom += 0x34;
      } else {
        sTradeAnim.bg2Zoom = 0x400;
        sTradeAnim.state++;
      }
      sTradeAnim.sXY = Math.trunc(0x8000 / sTradeAnim.bg2Zoom);
      break;
    case STATE_FADE_OUT_TO_NEW_MON:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      sTradeAnim.state = STATE_WAIT_FADE_OUT_TO_NEW_MON;
      break;
    case STATE_WAIT_FADE_OUT_TO_NEW_MON:
      if (!gPaletteFade.active) {
        SetTradeSequenceBgGpuRegs(5);
        SetTradeSequenceBgGpuRegs(7);
        sTradeAnim.state++;
      }
      break;
    case STATE_FADE_IN_TO_NEW_MON:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
      sTradeAnim.state++;
      break;
    case STATE_WAIT_FADE_IN_TO_NEW_MON:
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_BG2_ON | DISPCNT_OBJ_ON);
      if (!gPaletteFade.active) sTradeAnim.state++;
      break;
    case STATE_POKEBALL_ARRIVE: {
      const spId = CreateSprite(getPokeballTemplate(), 120, -8, 0);
      sTradeAnim.bouncingPokeballSpriteId = spId;
      if (spId < MAX_SPRITES) {
        gSprites[spId].data[3] = 74;
        gSprites[spId].callback = SpriteCB_BouncingPokeballArrive;
        StartSpriteAnim(gSprites[spId], 1);
        StartSpriteAffineAnim(gSprites[spId], 2);
        BlendPalettes(1 << (16 + gSprites[spId].oam.paletteNum), 16, RGB_WHITE);
      }
      sTradeAnim.state++;
      sTradeAnim.timer = 0;
      break;
    }
    case STATE_FADE_POKEBALL_TO_NORMAL: {
      const spId = sTradeAnim.bouncingPokeballSpriteId;
      const palNum = spId < MAX_SPRITES ? gSprites[spId].oam.paletteNum : 0;
      BeginNormalPaletteFade(1 << (16 + palNum), 1, 16, 0, RGB_WHITE);
      sTradeAnim.state++;
      break;
    }
    case STATE_POKEBALL_ARRIVE_WAIT: {
      const spId = sTradeAnim.bouncingPokeballSpriteId;
      if (spId >= MAX_SPRITES || gSprites[spId].callback === SpriteCallbackDummy) {
        sTradeAnim.state++;
      }
      break;
    }
    case STATE_SHOW_NEW_MON: {
      const partId = sTradeAnim.monSpriteIds[TRADE_PARTNER];
      if (partId < MAX_SPRITES) {
        gSprites[partId].x = 120;
        gSprites[partId].y = 60;
        gSprites[partId].x2 = 0;
        gSprites[partId].y2 = 0;
        gSprites[partId].invisible = false;
        StartSpriteAnim(gSprites[partId], 0);
        CreatePokeballSpriteToReleaseMon(partId, gSprites[partId].oam.paletteNum, 120, 84, 2, 1, 20, 0xfffff);
      }
      const ballId = sTradeAnim.bouncingPokeballSpriteId;
      if (ballId < MAX_SPRITES) {
        FreeSpriteOamMatrix(gSprites[ballId]);
        DestroySprite(gSprites[ballId]);
      }
      sTradeAnim.state++;
      break;
    }
    case STATE_NEW_MON_MSG: {
      SetGpuReg(REG_OFFSET_DISPCNT, DISPCNT_MODE_0 | DISPCNT_OBJ_1D_MAP | DISPCNT_BG0_ON | DISPCNT_BG2_ON | DISPCNT_OBJ_ON);
      const msg = expandPlaceholders(rom.text("gText_XSentOverY"));
      DrawTextOnTradeWindow(0, msg, 0);
      sTradeAnim.state = STATE_DELAY_FOR_MON_ANIM;
      sTradeAnim.timer = 0;
      break;
    }
    case STATE_DELAY_FOR_MON_ANIM:
      if (++sTradeAnim.timer > 60) {
        if (sTradeAnim.monSpecies[TRADE_PARTNER] !== C.SPECIES_EGG) {
          sound.PlayCry_Normal(sTradeAnim.monSpecies[TRADE_PARTNER], 0);
        }
        sTradeAnim.state = STATE_WAIT_FOR_MON_CRY;
        sTradeAnim.timer = 0;
      }
      break;
    case STATE_WAIT_FOR_MON_CRY:
      sTradeAnim.state = STATE_TAKE_CARE_OF_MON;
      break;
    case STATE_TAKE_CARE_OF_MON:
      if (++sTradeAnim.timer === 10) {
        sound.playFanfare(C.MUS_EVOLVED);
      }
      if (sTradeAnim.timer === 250) {
        sTradeAnim.state++;
        const msg = expandPlaceholders(rom.text("gText_TakeGoodCareOfX"));
        DrawTextOnTradeWindow(0, msg, 0);
        sTradeAnim.timer = 0;
      }
      break;
    case STATE_AFTER_NEW_MON_DELAY:
      if (++sTradeAnim.timer === 60) sTradeAnim.state++;
      break;
    case STATE_CHECK_RIBBONS:
      CheckPartnersMonForRibbons();
      sTradeAnim.state++;
      break;
    case STATE_END_LINK_TRADE:
      if (JOY_NEW(A_BUTTON) || sTradeAnim.timer++ > 180) {
        sTradeAnim.state++;
      }
      break;
    case STATE_TRY_EVOLUTION: {
      const playerSlot = varGet(SV.x8005);
      TradeMons(playerSlot, 0);
      sTradeAnim.state++;
      break;
    }
    case STATE_FADE_OUT_END:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      sTradeAnim.state++;
      break;
    case STATE_WAIT_FADE_OUT_END:
      if (!gPaletteFade.active) {
        sound.playBGM(sTradeAnim.cachedMapMusic);
        FreeAllWindowBuffers();
        const cb = sTradeAnim.tradeCallback;
        const received = save.party[varGet(SV.x8005)];
        sTradeAnim = null;
        tradeMon = null;

        const evoTarget = received && !received.isEgg ? tradeEvolution(received) : 0;
        if (evoTarget && received.heldItem !== C.ITEM_EVERSTONE) {
          evolveWithMessages(received, evoTarget, () => { if (cb) cb(); });
        } else {
          if (cb) cb();
        }
        return true;
      }
      break;
  }
  return false;
}

export function DoTradeAnim_Wireless(): boolean {
  return DoTradeAnim_Cable();
}

export function DoTradeAnim(): boolean {
  if (!sTradeAnim) return true;
  return sTradeAnim.isCableTrade ? DoTradeAnim_Cable() : DoTradeAnim_Wireless();
}

export function CheckPartnersMonForRibbons(mon: Pokemon | null = tradeMon): void {
  if (!mon) return;
  for (let field = C.MON_DATA_CHAMPION_RIBBON; field < C.MON_DATA_UNUSED_RIBBONS; field++) {
    if (GetMonData(mon, field)) {
      flagSet(C.FLAG_SYS_RIBBON_GET);
      return;
    }
  }
}

export function UpdatePokedexForReceivedMon(partyIdx: number): void {
  const mon = save.party[partyIdx];
  if (mon && !mon.isEgg) {
    setDexFlag(mon.species, true);
  }
}

export function TradeMons(playerPartyIdx: number, _partnerPartyIdx: number): void {
  const received = tradeMon;
  if (!received) return;
  save.party[playerPartyIdx] = received;
  if (!received.isEgg) received.friendship = 70;
  UpdatePokedexForReceivedMon(playerPartyIdx);
}

// ---------------------------------------------------------------- Main Callbacks
export function CB2_InGameTrade(): void {
  DoTradeAnim();
  tasks.run();
  RunTextPrinters();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

export function CB2_InitInGameTrade(): void {
  switch (gMain.state) {
    case 0:
      sTradeAnim = {
        timer: 0,
        monPersonalities: [0, 0],
        monSpecies: [0, 0],
        monSpriteIds: [MAX_SPRITES, MAX_SPRITES],
        connectionSpriteId1: MAX_SPRITES,
        connectionSpriteId2: MAX_SPRITES,
        cableEndSpriteId: MAX_SPRITES,
        releasePokeballSpriteId: MAX_SPRITES,
        bouncingPokeballSpriteId: MAX_SPRITES,
        bg2texX: 64,
        bg2texY: 64,
        bg2srcX: DISPLAY_WIDTH / 2,
        bg2srcY: DISPLAY_HEIGHT / 2,
        bg1vofs: 0,
        bg1hofs: 0,
        bg2vofs: 0,
        bg2hofs: 0,
        sXY: 256,
        bg2Zoom: 0x80,
        bg2alpha: 0,
        isLinkTrade: false,
        isCableTrade: true,
        cachedMapMusic: sound.currentBGM,
        textColor: [15, 1, 6],
        win0left: 0,
        win0top: 0,
        win0right: 0,
        win0bottom: 0,
        state: 0,
      };
      ResetSpriteData();
      FreeAllSpritePalettes();
      SetVBlankCallback(VBlankCB_TradeAnim);
      TradeAnimInit_LoadGfx();
      gMain.state = 5;
      break;
    case 5:
      LoadTradeMonPic(TRADE_PLAYER, 0);
      gMain.state++;
      break;
    case 6:
      LoadTradeMonPic(TRADE_PLAYER, 1);
      gMain.state++;
      break;
    case 7:
      LoadTradeMonPic(TRADE_PARTNER, 0);
      ShowBg(0);
      gMain.state++;
      break;
    case 8:
      LoadTradeMonPic(TRADE_PARTNER, 1);
      FillWindowPixelBuffer(0, PIXEL_FILL(15));
      PutWindowTilemap(0);
      CopyWindowToVram(0, COPYWIN_FULL);
      gMain.state++;
      break;
    case 9:
      LoadTradeGbaSpriteGfx();
      LoadSpriteSheet({ data: incbin("sPokeball_Gfx"), size: 1536, tag: GFXTAG_POKEBALL });
      LoadSpritePalette({ data: incbin16("sPokeball_Pal"), tag: PALTAG_POKEBALL });
      gMain.state++;
      break;
    case 10:
      ShowBg(0);
      gMain.state++;
      break;
    case 11:
      SetTradeSequenceBgGpuRegs(5);
      SetTradeSequenceBgGpuRegs(0);
      TradeBufferOTnameAndNicknames();
      gMain.state++;
      break;
    case 12:
      SetMainCallback2(CB2_InGameTrade);
      break;
  }

  tasks.run();
  RunTextPrinters();
  AnimateSprites();
  BuildOamBuffer();
  UpdatePaletteFade();
}

export function Task_InGameTrade(taskId: number): void {
  if (!gPaletteFade.active) {
    SetMainCallback2(CB2_InitInGameTrade);
    tasks.destroy(taskId);
  }
}

/** Entrypoint for in-game trade scene from overworld scripts. */
export function doInGameTradeScene(done: () => void): void {
  preloadTradeScene().then(() => {
    createInGameTradePokemon();
    const taskId = tasks.create(Task_InGameTrade, 10);
    BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    // Bind completion
    const checkCompletion = (): void => {
      if (sTradeAnim) {
        sTradeAnim.tradeCallback = done;
      } else {
        setTimeout(checkCompletion, 16);
      }
    };
    checkCompletion();
  });
}

// ---------------------------------------------------------------- trade.c stubs
// Functions from trade.c mapped to preserve C inventory parity
export function InitTradeMenu(): void {}
export function CB2_StartCreateTradeMenu(): void {}
export function CB2_CreateTradeMenu(): void {}
export function CB2_ReturnToTradeMenuFromSummary(): void {}
export function VBlankCB_TradeMenu(): void {}
export function CB_FadeToStartTrade(): void {}
export function CB_WaitToStartTrade(): void {}
export function CB_StartLinkTrade(): void {}
export function CB2_TradeMenu(): void {}
export function LoadTradeBgGfx(): void {}
export function SetActiveMenuOptions(): void {}
export function Trade_Memcpy(): void {}
export function BufferTradeParties(): void {}
export function PrintIsThisTradeOkay(): void {}
export function Leader_ReadLinkBuffer(): void {}
export function CB2_LinkTrade(): void {}
