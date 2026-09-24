// battle_interface.c: healthboxes, HP/EXP bars and the party status summary (ball tray).
// Graphics are written straight into OBJ VRAM like the original CpuCopy32 calls.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { tasks } from "../gba/tasks";
import { cdata, incbin } from "../hw/assets";
import { SetGpuReg } from "../hw/gpu";
import { FillPalette, gPlttBufferUnfaded, LoadPalette, OBJ_PLTT_ID, OBJ_PLTT_OFFSET, PLTT_ID, PLTT_SIZE_4BPP, RGB } from "../hw/palette";
import { BLDALPHA_BLEND, BLDCNT_EFFECT_BLEND, BLDCNT_TGT2_ALL, OBJ_VRAM0, ppu, REG_OFFSET_BLDALPHA, REG_OFFSET_BLDCNT } from "../hw/ppu";
import {
  AllocSpritePalette, CreateSprite, CreateSpriteAtEnd, DestroySprite, DestroySpriteAndFreeResources, FreeSpritePaletteByTag, gDummySpriteAffineAnimTable,
  gDummySpriteAnimTable, gSprites, IndexOfSpritePaletteTag, LoadSpritePalette, LoadSpriteSheet, oamData, SetSubspriteTables, ST_OAM_HFLIP,
  ST_OAM_OBJ_BLEND, SPRITE_SHAPE, SPRITE_SIZE, SpriteCallbackDummy, SUBSPRITES_IGNORE_PRIORITY, TILE_SIZE_4BPP,
  type Sprite, type Subsprite, type SubspriteTable, type SpriteTemplate,
} from "../hw/sprite";
import { AddTextPrinterParameterized4 } from "../hw/text";
import { AddWindow, FillWindowPixelBuffer, gWindows, PIXEL_FILL, RemoveWindow, type WindowTemplate } from "../hw/window";
import { EOS, intToDecimal, STR_CONV_MODE_LEFT_ALIGN, STR_CONV_MODE_RIGHT_ALIGN } from "../gba/charmap";
import { FONT_SMALL, stringWidth } from "../gba/font";
import { rom, b64 } from "../rom";
import { GetMonData, GetMonGender, GetNature, gEnemyParty, playerMon, SpeciesToNationalPokedexNum, type Mon } from "../pokemon/mon";
import { GetSetPokedexFlag } from "../pokemon/mon_extra";
import { G, gBattlerPartyIndexes, gBattlerPositions, gBattleSpritesDataPtr, gBattleStruct, gDisplayedStringBattle, gHealthboxSpriteIds, gMonSpritesGfxPtr } from "./globals";
import { GetBattlerPosition, GetBattlerSide } from "./util";

import { LoadBattleBarGfx } from "./gfx_sfx_util";

export { StartHealthboxSlideIn } from "./pokeball";
export { LoadBattleBarGfx };

const B_INTERFACE_GFX_TRANSPARENT = 0;
const B_INTERFACE_GFX_HP_BAR_HP_TEXT = 1;
const B_INTERFACE_GFX_HP_BAR_GREEN = 3;
const B_INTERFACE_GFX_EXP_BAR = 12;
const B_INTERFACE_GFX_STATUS_PSN_BATTLER0 = 21;
const B_INTERFACE_GFX_STATUS_PAR_BATTLER0 = 24;
const B_INTERFACE_GFX_STATUS_SLP_BATTLER0 = 27;
const B_INTERFACE_GFX_STATUS_FRZ_BATTLER0 = 30;
const B_INTERFACE_GFX_STATUS_BRN_BATTLER0 = 33;
const B_INTERFACE_GFX_STATUS_NONE = 39;
const B_INTERFACE_GFX_SAFARI_HEALTHBOX_0 = 43;
const B_INTERFACE_GFX_SAFARI_HEALTHBOX_1 = 44;
const B_INTERFACE_GFX_SAFARI_HEALTHBOX_2 = 45;
const B_INTERFACE_GFX_HP_BAR_YELLOW = 47;
const B_INTERFACE_GFX_HP_BAR_RED = 56;
const B_INTERFACE_GFX_HP_BAR_LEFT_BORDER = 65;
const B_INTERFACE_GFX_BALL_PARTY_SUMMARY = 66;
const B_INTERFACE_GFX_BALL_CAUGHT = 70;
const B_INTERFACE_GFX_STATUS_PSN_BATTLER1 = 71;
const B_INTERFACE_GFX_STATUS_PAR_BATTLER1 = 74;
const B_INTERFACE_GFX_STATUS_SLP_BATTLER1 = 77;
const B_INTERFACE_GFX_STATUS_FRZ_BATTLER1 = 80;
const B_INTERFACE_GFX_STATUS_BRN_BATTLER1 = 83;
const B_INTERFACE_GFX_STATUS_PSN_BATTLER2 = 86;
const B_INTERFACE_GFX_STATUS_PAR_BATTLER2 = 89;
const B_INTERFACE_GFX_STATUS_SLP_BATTLER2 = 92;
const B_INTERFACE_GFX_STATUS_FRZ_BATTLER2 = 95;
const B_INTERFACE_GFX_STATUS_BRN_BATTLER2 = 98;
const B_INTERFACE_GFX_STATUS_PSN_BATTLER3 = 101;
const B_INTERFACE_GFX_STATUS_PAR_BATTLER3 = 104;
const B_INTERFACE_GFX_STATUS_SLP_BATTLER3 = 107;
const B_INTERFACE_GFX_STATUS_FRZ_BATTLER3 = 110;
const B_INTERFACE_GFX_STATUS_BRN_BATTLER3 = 113;
const B_INTERFACE_GFX_BOTTOM_RIGHT_CORNER_HP_AS_TEXT = 116;
const B_INTERFACE_GFX_BOTTOM_RIGHT_CORNER_HP_AS_BAR = 117;

const B_HEALTHBAR_NUM_PIXELS = 48;
const B_HEALTHBAR_NUM_TILES = B_HEALTHBAR_NUM_PIXELS / 8;
const B_EXPBAR_NUM_PIXELS = 64;
const B_EXPBAR_NUM_TILES = B_EXPBAR_NUM_PIXELS / 8;

const DISPLAY_WIDTH = 240;

// ---------------------------------------------------------------- VRAM helpers

const gfx = () => incbin("gBattleInterface_Gfx");
/** GetBattleInterfaceGfxPtr(elementId) + byteOffset */
const gfxPtr = (elementId: number, byteOffset = 0) => ({ buf: gfx(), off: elementId * TILE_SIZE_4BPP + byteOffset });
type Ptr = { buf: Uint8Array; off: number };

function CpuCopy32(src: Ptr, dest: number, size: number): void {
  ppu.vram.set(src.buf.subarray(src.off, src.off + size), dest);
}
function CpuFill32(value: number, dest: number, size: number): void {
  ppu.vram.fill(value, dest, dest + size);
}
const tileAddr = (tileNum: number) => OBJ_VRAM0 + tileNum * TILE_SIZE_4BPP;

// ---------------------------------------------------------------- templates

const sOamData_Healthbox = oamData({ shape: SPRITE_SHAPE("64x32"), size: SPRITE_SIZE("64x32"), priority: 1 });
const sOamData_Healthbar = oamData({ shape: SPRITE_SHAPE("32x8"), size: SPRITE_SIZE("32x8"), priority: 1 });
const sOamData_PartySummaryBall = oamData({ shape: SPRITE_SHAPE("8x8"), size: SPRITE_SIZE("8x8"), priority: 1 });

function template(tileTag: number, paletteTag: number, oam: typeof sOamData_Healthbox, callback: (s: Sprite) => void): SpriteTemplate {
  return { tileTag, paletteTag, oam, anims: gDummySpriteAnimTable, images: null, affineAnims: gDummySpriteAffineAnimTable, callback };
}

const sHealthboxPlayerSpriteTemplates = [
  template(C.TAG_HEALTHBOX_PLAYER1_TILE, C.TAG_HEALTHBOX_PAL, sOamData_Healthbox, SpriteCallbackDummy),
  template(C.TAG_HEALTHBOX_PLAYER2_TILE, C.TAG_HEALTHBOX_PAL, sOamData_Healthbox, SpriteCallbackDummy),
];
const sHealthboxOpponentSpriteTemplates = [
  template(C.TAG_HEALTHBOX_OPPONENT1_TILE, C.TAG_HEALTHBOX_PAL, sOamData_Healthbox, SpriteCallbackDummy),
  template(C.TAG_HEALTHBOX_OPPONENT2_TILE, C.TAG_HEALTHBOX_PAL, sOamData_Healthbox, SpriteCallbackDummy),
];
const sHealthboxSafariSpriteTemplate = template(C.TAG_HEALTHBOX_SAFARI_TILE, C.TAG_HEALTHBOX_PAL, sOamData_Healthbox, SpriteCallbackDummy);

const sHealthbarSpriteTemplates = [
  template(C.TAG_HEALTHBAR_PLAYER1_TILE, C.TAG_HEALTHBAR_PAL, sOamData_Healthbar, (s) => SpriteCB_HealthBar(s)),
  template(C.TAG_HEALTHBAR_OPPONENT1_TILE, C.TAG_HEALTHBAR_PAL, sOamData_Healthbar, (s) => SpriteCB_HealthBar(s)),
  template(C.TAG_HEALTHBAR_PLAYER2_TILE, C.TAG_HEALTHBAR_PAL, sOamData_Healthbar, (s) => SpriteCB_HealthBar(s)),
  template(C.TAG_HEALTHBAR_OPPONENT2_TILE, C.TAG_HEALTHBAR_PAL, sOamData_Healthbar, (s) => SpriteCB_HealthBar(s)),
];

const sub = (x: number, dims: string, tileOffset: number): Subsprite => ({ x, y: 0, shape: SPRITE_SHAPE(dims), size: SPRITE_SIZE(dims), tileOffset, priority: 1 });
const table = (subsprites: Subsprite[]): SubspriteTable => ({ subspriteCount: subsprites.length, subsprites });

const sHealthBar_SubspriteTable: SubspriteTable[] = [
  table([sub(-16, "32x8", 0), sub(16, "32x8", 4)]),
  table([sub(-16, "32x8", 0), sub(16, "32x8", 4), sub(-32, "8x8", 8)]),
];
const sStatusSummaryBar_SubspriteTable_Enter = [table([sub(-96, "32x8", 0), sub(-64, "32x8", 4), sub(-32, "32x8", 8), sub(0, "32x8", 12)])];
const sStatusSummaryBar_SubspriteTable_Exit = [
  table([sub(-96, "32x8", 0), sub(-64, "32x8", 4), sub(-32, "32x8", 8), sub(0, "32x8", 8), sub(32, "32x8", 8), sub(64, "32x8", 12)]),
];

const sPartySummaryBarSpriteSheets = [
  { sym: "gBattleInterface_PartySummaryBar_Gfx", size: 16 * TILE_SIZE_4BPP, tag: C.TAG_PARTY_SUMMARY_BAR_PLAYER_TILE },
  { sym: "gBattleInterface_PartySummaryBar_Gfx", size: 16 * TILE_SIZE_4BPP, tag: C.TAG_PARTY_SUMMARY_BAR_OPPONENT_TILE },
];
const sPartySummaryBarPalTags = [C.TAG_PARTY_SUMMARY_BAR_PLAYER_PAL, C.TAG_PARTY_SUMMARY_BAR_OPPONENT_PAL];
const sPartySummaryBallPalTags = [C.TAG_PARTY_SUMMARY_BALL_PLAYER_PAL, C.TAG_PARTY_SUMMARY_BALL_OPPONENT_PAL];
const sPartySummaryBallTileTags = [C.TAG_PARTY_SUMMARY_BALL_PLAYER_TILE, C.TAG_PARTY_SUMMARY_BALL_OPPONENT_TILE];

const sPartySummaryBarSpriteTemplates = [
  template(C.TAG_PARTY_SUMMARY_BAR_PLAYER_TILE, C.TAG_PARTY_SUMMARY_BAR_PLAYER_PAL, sOamData_Healthbox, (s) => SpriteCB_PartySummaryBar(s)),
  template(C.TAG_PARTY_SUMMARY_BAR_OPPONENT_TILE, C.TAG_PARTY_SUMMARY_BAR_OPPONENT_PAL, sOamData_Healthbox, (s) => SpriteCB_PartySummaryBar(s)),
];
const sPartySummaryBallSpriteTemplates = [
  template(C.TAG_PARTY_SUMMARY_BALL_PLAYER_TILE, C.TAG_PARTY_SUMMARY_BALL_PLAYER_PAL, sOamData_PartySummaryBall, (s) => SpriteCB_PartySummaryBall_OnBattleStart(s)),
  template(C.TAG_PARTY_SUMMARY_BALL_OPPONENT_TILE, C.TAG_PARTY_SUMMARY_BALL_OPPONENT_PAL, sOamData_PartySummaryBall, (s) => SpriteCB_PartySummaryBall_OnBattleStart(s)),
];

// ---------------------------------------------------------------- healthbox sprites

// main (left) healthbox sprite: sHealthboxOtherSpriteId = oam.affineParam, sHealthBarSpriteId = data[5], sBattlerId = data[6]
// other (right) healthbox sprite: sHealthboxSpriteId = data[5]
// healthbar sprite: sHealthboxSpriteId = data[5], sHealthbarType = data[6]
const HEALTHBAR_TYPE_PLAYER_SINGLE = 0;
const HEALTHBAR_TYPE_PLAYER_DOUBLE = 1;
const HEALTHBAR_TYPE_OPPONENT = 2;

const IsDoubleBattle = () => !!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE);
const battlerOf = (healthboxSpriteId: number) => gSprites[healthboxSpriteId].data[6];
const healthBarOf = (healthboxSpriteId: number) => gSprites[healthboxSpriteId].data[5];
const otherOf = (healthboxSpriteId: number) => gSprites[healthboxSpriteId].oam.affineParam;
const partyMonOf = (battler: number): Mon => (GetBattlerSide(battler) === C.B_SIDE_PLAYER ? playerMon(gBattlerPartyIndexes[battler]) : gEnemyParty[gBattlerPartyIndexes[battler]]);

export function CreateBattlerHealthboxSprites(battlerId: number): number {
  let healthbarType = HEALTHBAR_TYPE_PLAYER_SINGLE;
  let healthboxSpriteId: number;
  let healthboxOtherSpriteId: number;
  if (!IsDoubleBattle()) {
    if (GetBattlerSide(battlerId) === C.B_SIDE_PLAYER) {
      healthboxSpriteId = CreateSprite(sHealthboxPlayerSpriteTemplates[0], 240, 160, 1);
      healthboxOtherSpriteId = CreateSpriteAtEnd(sHealthboxPlayerSpriteTemplates[0], 240, 160, 1);
      gSprites[healthboxSpriteId].oam.shape = SPRITE_SHAPE("64x64");
      gSprites[healthboxOtherSpriteId].oam.shape = SPRITE_SHAPE("64x64");
      gSprites[healthboxOtherSpriteId].oam.tileNum += 2 * TILE_SIZE_4BPP;
    } else {
      healthboxSpriteId = CreateSprite(sHealthboxOpponentSpriteTemplates[0], 240, 160, 1);
      healthboxOtherSpriteId = CreateSpriteAtEnd(sHealthboxOpponentSpriteTemplates[0], 240, 160, 1);
      gSprites[healthboxOtherSpriteId].oam.tileNum += 1 * TILE_SIZE_4BPP;
      healthbarType = HEALTHBAR_TYPE_OPPONENT;
    }
  } else {
    const templates = GetBattlerSide(battlerId) === C.B_SIDE_PLAYER ? sHealthboxPlayerSpriteTemplates : sHealthboxOpponentSpriteTemplates;
    healthboxSpriteId = CreateSprite(templates[GetBattlerPosition(battlerId) >> 1], 240, 160, 1);
    healthboxOtherSpriteId = CreateSpriteAtEnd(templates[GetBattlerPosition(battlerId) >> 1], 240, 160, 1);
    gSprites[healthboxOtherSpriteId].oam.tileNum += 1 * TILE_SIZE_4BPP;
    healthbarType = GetBattlerSide(battlerId) === C.B_SIDE_PLAYER ? HEALTHBAR_TYPE_PLAYER_DOUBLE : HEALTHBAR_TYPE_OPPONENT;
  }
  gSprites[healthboxSpriteId].oam.affineParam = healthboxOtherSpriteId;
  gSprites[healthboxOtherSpriteId].data[5] = healthboxSpriteId;
  gSprites[healthboxOtherSpriteId].callback = SpriteCB_HealthBoxOther;

  const healthbarSpriteId = CreateSpriteAtEnd(sHealthbarSpriteTemplates[gBattlerPositions[battlerId]], 140, 60, 0);
  const healthbarSprite = gSprites[healthbarSpriteId];
  SetSubspriteTables(healthbarSprite, [sHealthBar_SubspriteTable[GetBattlerSide(battlerId)]]);
  healthbarSprite.subspriteMode = SUBSPRITES_IGNORE_PRIORITY;
  healthbarSprite.oam.priority = 1;
  CpuCopy32(gfxPtr(B_INTERFACE_GFX_HP_BAR_HP_TEXT), tileAddr(healthbarSprite.oam.tileNum), 2 * TILE_SIZE_4BPP);

  gSprites[healthboxSpriteId].data[5] = healthbarSpriteId;
  gSprites[healthboxSpriteId].data[6] = battlerId;
  gSprites[healthboxSpriteId].invisible = true;
  gSprites[healthboxOtherSpriteId].invisible = true;
  healthbarSprite.data[5] = healthboxSpriteId;
  healthbarSprite.data[6] = healthbarType;
  healthbarSprite.invisible = true;
  return healthboxSpriteId;
}

export function CreateSafariPlayerHealthboxSprites(): number {
  const healthboxSpriteId = CreateSprite(sHealthboxSafariSpriteTemplate, 240, 160, 1);
  const healthboxOtherSpriteId = CreateSpriteAtEnd(sHealthboxSafariSpriteTemplate, 240, 160, 1);
  gSprites[healthboxSpriteId].oam.shape = SPRITE_SHAPE("64x64");
  gSprites[healthboxOtherSpriteId].oam.shape = SPRITE_SHAPE("64x64");
  gSprites[healthboxOtherSpriteId].oam.tileNum += 2 * TILE_SIZE_4BPP;
  gSprites[healthboxSpriteId].oam.affineParam = healthboxOtherSpriteId;
  gSprites[healthboxOtherSpriteId].data[5] = healthboxSpriteId;
  gSprites[healthboxOtherSpriteId].callback = SpriteCB_HealthBoxOther;
  return healthboxSpriteId;
}

function SpriteCB_HealthBar(sprite: Sprite): void {
  const box = gSprites[sprite.data[5]];
  switch (sprite.data[6]) {
    case HEALTHBAR_TYPE_PLAYER_SINGLE:
    case HEALTHBAR_TYPE_PLAYER_DOUBLE:
      sprite.x = box.x + 16;
      sprite.y = box.y;
      break;
    default:
      sprite.x = box.x + 8;
      sprite.y = box.y;
      break;
  }
  sprite.x2 = box.x2;
  sprite.y2 = box.y2;
}

function SpriteCB_HealthBoxOther(sprite: Sprite): void {
  const box = gSprites[sprite.data[5]];
  sprite.x = box.x + 64;
  sprite.y = box.y;
  sprite.x2 = box.x2;
  sprite.y2 = box.y2;
}

export function SetBattleBarStruct(battlerId: number, healthboxSpriteId: number, maxVal: number, oldVal: number, receivedValue: number): void {
  const bar = gBattleSpritesDataPtr.battleBars[battlerId];
  bar.healthboxSpriteId = healthboxSpriteId;
  bar.maxValue = maxVal;
  bar.oldValue = oldVal;
  bar.receivedValue = receivedValue;
  bar.currValue = -32768;
}

export function SetHealthboxSpriteInvisible(healthboxSpriteId: number): void {
  gSprites[healthboxSpriteId].invisible = true;
  gSprites[healthBarOf(healthboxSpriteId)].invisible = true;
  gSprites[otherOf(healthboxSpriteId)].invisible = true;
}

export function SetHealthboxSpriteVisible(healthboxSpriteId: number): void {
  gSprites[healthboxSpriteId].invisible = false;
  gSprites[healthBarOf(healthboxSpriteId)].invisible = false;
  gSprites[otherOf(healthboxSpriteId)].invisible = false;
}

function UpdateSpritePos(spriteId: number, x: number, y: number): void {
  gSprites[spriteId].x = x;
  gSprites[spriteId].y = y;
}

export function DestoryHealthboxSprite(healthboxSpriteId: number): void {
  DestroySprite(gSprites[otherOf(healthboxSpriteId)]);
  DestroySprite(gSprites[healthBarOf(healthboxSpriteId)]);
  DestroySprite(gSprites[healthboxSpriteId]);
}

export function DummyBattleInterfaceFunc(_healthboxSpriteId: number, _isDoubleBattleBattlerOnly: boolean): void {}

export function UpdateOamPriorityInAllHealthboxes(priority: number): void {
  for (let i = 0; i < G.gBattlersCount; i++) {
    const id = gHealthboxSpriteIds[i];
    gSprites[id].oam.priority = priority;
    gSprites[otherOf(id)].oam.priority = priority;
    gSprites[healthBarOf(id)].oam.priority = priority;
  }
}

export function InitBattlerHealthboxCoords(battler: number): void {
  let x = 0;
  let y = 0;
  if (!IsDoubleBattle()) {
    if (GetBattlerSide(battler) !== C.B_SIDE_PLAYER) [x, y] = [44, 30];
    else [x, y] = [158, 88];
  } else {
    switch (GetBattlerPosition(battler)) {
      case C.B_POSITION_PLAYER_LEFT: [x, y] = [159, 75]; break;
      case C.B_POSITION_PLAYER_RIGHT: [x, y] = [171, 100]; break;
      case C.B_POSITION_OPPONENT_LEFT: [x, y] = [44, 19]; break;
      case C.B_POSITION_OPPONENT_RIGHT: [x, y] = [32, 44]; break;
    }
  }
  UpdateSpritePos(gHealthboxSpriteIds[battler], x, y);
}

// ---------------------------------------------------------------- healthbox text

/** ConvertIntToDecimalStringN into dest at offset; returns the index of the written EOS. */
function writeNumber(dest: number[], at: number, value: number, mode: number, digits: number): number {
  const s = intToDecimal(value, mode, digits);
  let i = 0;
  for (; s[i] !== EOS; i++) dest[at + i] = s[i];
  dest[at + i] = EOS;
  return at + i;
}

function UpdateLvlInHealthbox(healthboxSpriteId: number, lvl: number): void {
  const text = [C.CHAR_EXTRA_SYMBOL, C.CHAR_LV_2];
  const end = writeNumber(text, 2, lvl, STR_CONV_MODE_LEFT_ALIGN, 3);
  const xPos = 5 * (3 - (end - 2));
  const win = AddTextPrinterAndCreateWindowOnHealthbox(text, xPos, 3);
  const spriteTileNum = gSprites[healthboxSpriteId].oam.tileNum * TILE_SIZE_4BPP;
  let objVram: number;
  if (GetBattlerSide(battlerOf(healthboxSpriteId)) === C.B_SIDE_PLAYER) objVram = OBJ_VRAM0 + spriteTileNum + (!IsDoubleBattle() ? 0x820 : 0x420);
  else objVram = OBJ_VRAM0 + spriteTileNum + 0x400;
  TextIntoHealthboxObject(objVram, win.tileData, 3);
  RemoveWindowOnHealthbox(win.windowId);
}

export function UpdateHpTextInHealthbox(healthboxSpriteId: number, value: number, maxOrCurrent: number): void {
  value = (value << 16) >> 16;
  if (GetBattlerSide(battlerOf(healthboxSpriteId)) === C.B_SIDE_PLAYER && !IsDoubleBattle()) {
    const text: number[] = [];
    const spriteTileNum = gSprites[healthboxSpriteId].oam.tileNum;
    if (maxOrCurrent !== C.HP_CURRENT) {
      writeNumber(text, 0, value, STR_CONV_MODE_RIGHT_ALIGN, 3);
      const win = AddTextPrinterAndCreateWindowOnHealthbox(text, 0, 5);
      TextIntoHealthboxObject(OBJ_VRAM0 + spriteTileNum * TILE_SIZE_4BPP + 0xa40, win.tileData, 2);
      RemoveWindowOnHealthbox(win.windowId);
    } else {
      const end = writeNumber(text, 0, value, STR_CONV_MODE_RIGHT_ALIGN, 3);
      text[end] = C.CHAR_SLASH;
      text[end + 1] = EOS;
      const win = AddTextPrinterAndCreateWindowOnHealthbox(text, 4, 5);
      TextIntoHealthboxObject(OBJ_VRAM0 + spriteTileNum * TILE_SIZE_4BPP + 0x2e0, win.tileData, 1);
      TextIntoHealthboxObject(OBJ_VRAM0 + spriteTileNum * TILE_SIZE_4BPP + 0xa00, win.tileData.subarray(0x20), 2);
      RemoveWindowOnHealthbox(win.windowId);
    }
  } else {
    const battler = battlerOf(healthboxSpriteId);
    if (IsDoubleBattle() || GetBattlerSide(battler) === C.B_SIDE_OPPONENT) {
      UpdateHpTextInHealthboxInDoubles(healthboxSpriteId, value, maxOrCurrent);
    } else {
      // Only reachable in the Japanese release (HP as text outside of double battles).
      const text = [C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_COLOR, 1, C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_HIGHLIGHT, 2];
      const v = GetBattlerSide(battler) === C.B_SIDE_PLAYER ? (maxOrCurrent === C.HP_CURRENT ? 29 : 89) : maxOrCurrent === C.HP_CURRENT ? 20 : 48;
      writeNumber(text, 6, value, STR_CONV_MODE_RIGHT_ALIGN, 3);
      RenderTextHandleBold(gMonSpritesGfxPtr.barFontGfx, 0, text);
      for (let i = 0; i < 3; i++) {
        CpuCopy32({ buf: gMonSpritesGfxPtr.barFontGfx, off: i * 64 + 32 }, tileAddr(gSprites[healthboxSpriteId].oam.tileNum + v + i), TILE_SIZE_4BPP);
      }
    }
  }
}

function UpdateHpTextInHealthboxInDoubles(healthboxSpriteId: number, value: number, maxOrCurrent: number): void {
  const text = [C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_COLOR, 1, C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_HIGHLIGHT, 0];
  const battlerId = battlerOf(healthboxSpriteId);
  if (!gBattleSpritesDataPtr.battlerData[battlerId].hpNumbersNoBars) return;
  const v = maxOrCurrent === C.HP_CURRENT ? 0 : 4;
  const healthBarSpriteId = healthBarOf(healthboxSpriteId);
  const end = writeNumber(text, 6, value, STR_CONV_MODE_RIGHT_ALIGN, 3);
  if (maxOrCurrent === C.HP_CURRENT) {
    text[end] = C.CHAR_SLASH;
    text[end + 1] = EOS;
  }
  const font = gMonSpritesGfxPtr.barFontGfx;
  RenderTextHandleBold(font, 0, text);
  const barTile = gSprites[healthBarSpriteId].oam.tileNum;
  for (let i = v; i < v + 3; i++) {
    const src = { buf: font, off: (i - v) * 64 + 32 };
    if (i < 3) CpuCopy32(src, tileAddr(1 + barTile + i), TILE_SIZE_4BPP);
    else CpuCopy32(src, OBJ_VRAM0 + 0x20 + (i + barTile) * TILE_SIZE_4BPP, TILE_SIZE_4BPP);
  }
  if (maxOrCurrent === C.HP_CURRENT) {
    CpuCopy32({ buf: font, off: 224 }, tileAddr(barTile + 4), TILE_SIZE_4BPP);
    CpuFill32(0, tileAddr(barTile), TILE_SIZE_4BPP);
  } else if (GetBattlerSide(battlerId) === C.B_SIDE_PLAYER) {
    CpuCopy32(gfxPtr(B_INTERFACE_GFX_BOTTOM_RIGHT_CORNER_HP_AS_TEXT), tileAddr(gSprites[healthboxSpriteId].oam.tileNum + 52), TILE_SIZE_4BPP);
  }
}

/** Prints the mon's nature, catch and flee rate (a debug feature reachable in Safari battles). */
function PrintSafariMonInfo(healthboxSpriteId: number, mon: Mon): void {
  const text = [C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_COLOR, 1, C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_HIGHLIGHT, 2];
  const font = gMonSpritesGfxPtr.barFontGfx;
  let barFontOff = 0x520 + GetBattlerPosition(battlerOf(healthboxSpriteId)) * 384;
  const nature = GetNature(mon);
  const natureName = b64(rom.natures[nature]);
  let n = 0;
  for (; natureName[n] !== EOS; n++) text[6 + n] = natureName[n];
  text[6 + n] = EOS;
  RenderTextHandleBold(font.subarray(barFontOff), 0, text);
  for (let j = 6, i = 0; i < 5; i++, j++) {
    let elementId: number;
    const c = text[j];
    if ((c >= 55 && c <= 74) || (c >= 135 && c <= 154)) elementId = B_INTERFACE_GFX_SAFARI_HEALTHBOX_1;
    else if ((c >= 75 && c <= 79) || (c >= 155 && c <= 159)) elementId = B_INTERFACE_GFX_SAFARI_HEALTHBOX_2;
    else elementId = B_INTERFACE_GFX_SAFARI_HEALTHBOX_0;
    const g = gfxPtr(elementId);
    font.set(g.buf.subarray(g.off, g.off + 0x20), barFontOff + i * 64);
  }
  const boxTile = gSprites[healthboxSpriteId].oam.tileNum;
  for (let j = 1; j < 6; j++) {
    const base = (j - (j >> 3) * 8) + (j >> 3) * 64;
    CpuCopy32({ buf: font, off: barFontOff }, tileAddr(boxTile + base), 0x20);
    barFontOff += 0x20;
    CpuCopy32({ buf: font, off: barFontOff }, tileAddr(8 + boxTile + base), 0x20);
    barFontOff += 0x20;
  }
  const healthBarSpriteId = healthBarOf(healthboxSpriteId);
  writeNumber(text, 6, gBattleStruct.safariCatchFactor, STR_CONV_MODE_RIGHT_ALIGN, 2);
  writeNumber(text, 9, gBattleStruct.safariEscapeFactor, STR_CONV_MODE_RIGHT_ALIGN, 2);
  text[5] = C.CHAR_SPACE;
  text[8] = C.CHAR_SLASH;
  RenderTextHandleBold(font, 0, text);
  const barTile = gSprites[healthBarSpriteId].oam.tileNum;
  for (let j = 0; j < 5; j++) {
    const src = { buf: font, off: 0x40 * j + 0x20 };
    if (j <= 1) CpuCopy32(src, tileAddr(barTile + 2 + j), 32);
    else CpuCopy32(src, OBJ_VRAM0 + 0xc0 + (j + barTile) * TILE_SIZE_4BPP, 32);
  }
}

export function SwapHpBarsWithHpText(): void {
  for (let i = 0; i < G.gBattlersCount; i++) {
    const boxId = gHealthboxSpriteIds[i];
    if (gSprites[boxId].callback !== SpriteCallbackDummy || GetBattlerSide(i) === C.B_SIDE_OPPONENT || (!IsDoubleBattle() && GetBattlerSide(i) === C.B_SIDE_PLAYER)) continue;
    const data = gBattleSpritesDataPtr.battlerData[i];
    data.hpNumbersNoBars ^= 1;
    const noBars = data.hpNumbersNoBars;
    const mon = partyMonOf(i);
    if (GetBattlerSide(i) === C.B_SIDE_PLAYER) {
      if (!IsDoubleBattle()) continue;
      if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI) continue;
      if (noBars) {
        CpuFill32(0, tileAddr(gSprites[healthBarOf(boxId)].oam.tileNum), 8 * TILE_SIZE_4BPP);
        UpdateHpTextInHealthboxInDoubles(boxId, GetMonData(mon, C.MON_DATA_HP), C.HP_CURRENT);
        UpdateHpTextInHealthboxInDoubles(boxId, GetMonData(mon, C.MON_DATA_MAX_HP), C.HP_MAX);
      } else {
        UpdateStatusIconInHealthbox(boxId);
        UpdateHealthboxAttribute(boxId, mon, C.HEALTHBOX_HEALTH_BAR);
        CpuCopy32(gfxPtr(B_INTERFACE_GFX_BOTTOM_RIGHT_CORNER_HP_AS_BAR), OBJ_VRAM0 + 0x680 + gSprites[boxId].oam.tileNum * TILE_SIZE_4BPP, TILE_SIZE_4BPP);
      }
    } else {
      if (noBars) {
        if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI) {
          PrintSafariMonInfo(boxId, mon);
        } else {
          CpuFill32(0, tileAddr(gSprites[healthBarOf(boxId)].oam.tileNum), 8 * TILE_SIZE_4BPP);
          UpdateHpTextInHealthboxInDoubles(boxId, GetMonData(mon, C.MON_DATA_HP), C.HP_CURRENT);
          UpdateHpTextInHealthboxInDoubles(boxId, GetMonData(mon, C.MON_DATA_MAX_HP), C.HP_MAX);
        }
      } else {
        UpdateStatusIconInHealthbox(boxId);
        UpdateHealthboxAttribute(boxId, mon, C.HEALTHBOX_HEALTH_BAR);
        if (G.gBattleTypeFlags & C.BATTLE_TYPE_SAFARI) UpdateHealthboxAttribute(boxId, mon, C.HEALTHBOX_NICK);
      }
    }
    gSprites[boxId].data[7] ^= 1;
  }
}

// ---------------------------------------------------------------- party status summary (ball tray)

// task: tBattler data[0], tSummaryBarSpriteId data[1], tBallIconSpriteId(n) data[3 + n], tIsBattleStart data[10], tTimer data[11], tBlendWeight data[15]
// summary bar sprite: sEnterSpeed data[0], sExitSpeed data[1]
// ball icon sprite: sSummaryBarSpriteId data[0], sTimer data[1], sIsOpponent data[2], sSpeed data[3], sIsEmptyBall data[7]

export type PartyHpAndStatus = { hp: number; status: number };

export function CreatePartyStatusSummarySprites(battlerId: number, partyInfo: PartyHpAndStatus[], isSwitchingMons: number | boolean, isBattleStart: number | boolean): number {
  let isOpponent: number;
  let x: number, y: number, x2: number, speed: number;
  if (!isSwitchingMons || GetBattlerPosition(battlerId) !== C.B_POSITION_OPPONENT_RIGHT) {
    if (GetBattlerSide(battlerId) === C.B_SIDE_PLAYER) {
      isOpponent = 0;
      [x, y, x2, speed] = [136, 96, 100, -5];
    } else {
      isOpponent = 1;
      [x, y] = !isSwitchingMons || !IsDoubleBattle() ? [104, 40] : [104, 16];
      [x2, speed] = [-100, 5];
    }
  } else {
    isOpponent = 1;
    [x, y, x2, speed] = [104, 40, -100, 5];
  }
  let nValidMons = 0;
  for (let i = 0; i < C.PARTY_SIZE; i++) if (partyInfo[i].hp !== C.HP_EMPTY_SLOT) nValidMons++;

  const sheet = sPartySummaryBarSpriteSheets[isOpponent];
  LoadSpriteSheet({ data: incbin(sheet.sym), size: sheet.size, tag: sheet.tag });
  const ballGfx = gfxPtr(B_INTERFACE_GFX_BALL_PARTY_SUMMARY);
  LoadSpriteSheet({ data: ballGfx.buf.subarray(ballGfx.off, ballGfx.off + 4 * TILE_SIZE_4BPP), size: 4 * TILE_SIZE_4BPP, tag: sPartySummaryBallTileTags[isOpponent] });
  LoadSpritePalette({ data: incbin16Pal("gBattleInterface_Healthbox_Pal"), tag: sPartySummaryBarPalTags[isOpponent] });
  LoadSpritePalette({ data: incbin16Pal("gBattleInterface_Healthbar_Pal"), tag: sPartySummaryBallPalTags[isOpponent] });

  const summaryBarSpriteId = CreateSprite(sPartySummaryBarSpriteTemplates[isOpponent], x, y, 10);
  SetSubspriteTables(gSprites[summaryBarSpriteId], sStatusSummaryBar_SubspriteTable_Enter);
  gSprites[summaryBarSpriteId].x2 = x2;
  gSprites[summaryBarSpriteId].data[0] = speed;
  if (isOpponent) {
    gSprites[summaryBarSpriteId].x -= 96;
    gSprites[summaryBarSpriteId].oam.matrixNum = ST_OAM_HFLIP;
  } else {
    gSprites[summaryBarSpriteId].x += 96;
  }

  const ballIconSpritesIds: number[] = [];
  for (let i = 0; i < C.PARTY_SIZE; i++) {
    const id = CreateSpriteAtEnd(sPartySummaryBallSpriteTemplates[isOpponent], x, y - 4, 9);
    ballIconSpritesIds[i] = id;
    const s = gSprites[id];
    if (!isBattleStart) s.callback = SpriteCB_PartySummaryBall_OnSwitchout;
    if (!isOpponent) {
      s.x2 = 0;
      s.y2 = 0;
    }
    s.data[0] = summaryBarSpriteId;
    if (!isOpponent) {
      s.x += 10 * i + 24;
      s.data[1] = i * 7 + 10;
      s.x2 = 120;
    } else {
      s.x -= 10 * (5 - i) + 24;
      s.data[1] = (6 - i) * 7 + 10;
      s.x2 = -120;
    }
    s.data[2] = isOpponent;
  }

  const markBall = (spriteIdx: number, info: PartyHpAndStatus, empty: boolean) => {
    const s = gSprites[ballIconSpritesIds[spriteIdx]];
    if (empty) {
      s.oam.tileNum += 1;
      s.data[7] = 1;
    } else if (info.hp === 0) {
      s.oam.tileNum += 3;
    } else if (info.status !== C.STATUS1_NONE) {
      s.oam.tileNum += 2;
    }
  };
  const multi = !!(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI);
  if (GetBattlerSide(battlerId) === C.B_SIDE_PLAYER) {
    for (let i = 0; i < C.PARTY_SIZE; i++) markBall(i, partyInfo[i], multi ? partyInfo[i].hp === C.HP_EMPTY_SLOT : i >= nValidMons);
  } else {
    for (let i = 0, s = 5; i < C.PARTY_SIZE; i++, s--) markBall(s, partyInfo[i], multi ? partyInfo[i].hp === C.HP_EMPTY_SLOT : i >= nValidMons);
  }

  const taskId = tasks.create(() => {}, 5);
  const t = tasks.tasks[taskId];
  t.data[0] = battlerId;
  t.data[1] = summaryBarSpriteId;
  for (let i = 0; i < C.PARTY_SIZE; i++) t.data[3 + i] = ballIconSpritesIds[i];
  t.data[10] = isBattleStart ? 1 : 0;
  sound.playSEWithPanning(C.SE_BALL_TRAY_ENTER, 0);
  return taskId;
}

function incbin16Pal(sym: string): Uint16Array {
  const b = incbin(sym);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
}

export function Task_HidePartyStatusSummary(taskId: number): void {
  const t = tasks.tasks[taskId];
  const isBattleStart = t.data[10];
  const summaryBarSpriteId = t.data[1];
  const battlerId = t.data[0];
  const ballIconSpriteIds = Array.from({ length: C.PARTY_SIZE }, (_, i) => t.data[3 + i]);
  SetGpuReg(REG_OFFSET_BLDCNT, BLDCNT_TGT2_ALL | BLDCNT_EFFECT_BLEND);
  SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(16, 0));
  t.data[15] = 16;
  for (let i = 0; i < C.PARTY_SIZE; i++) gSprites[ballIconSpriteIds[i]].oam.objMode = ST_OAM_OBJ_BLEND;
  gSprites[summaryBarSpriteId].oam.objMode = ST_OAM_OBJ_BLEND;
  if (isBattleStart) {
    for (let i = 0; i < C.PARTY_SIZE; i++) {
      const s = gSprites[ballIconSpriteIds[GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER ? 5 - i : i]];
      s.data[1] = 7 * i;
      s.data[3] = 0;
      s.data[4] = 0;
      s.callback = SpriteCB_PartySummaryBall_Exit;
    }
    const bar = gSprites[summaryBarSpriteId];
    bar.data[0] = Math.trunc(bar.data[0] / 2);
    bar.data[1] = 0;
    bar.callback = SpriteCB_PartySummaryBar_Exit;
    SetSubspriteTables(bar, sStatusSummaryBar_SubspriteTable_Exit);
    t.func = Task_HidePartyStatusSummary_BattleStart_1;
  } else {
    t.func = Task_HidePartyStatusSummary_DuringBattle;
  }
}

function Task_HidePartyStatusSummary_BattleStart_1(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (t.data[11]++ % 2 === 0) {
    if (--t.data[15] < 0) return;
    SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(t.data[15], 16 - t.data[15]));
  }
  if (t.data[15] === 0) t.func = Task_HidePartyStatusSummary_BattleStart_2;
}

function destroySummarySprites(taskId: number): void {
  const t = tasks.tasks[taskId];
  DestroySpriteAndFreeResources(gSprites[t.data[1]]);
  DestroySpriteAndFreeResources(gSprites[t.data[3]]);
  for (let i = 1; i < C.PARTY_SIZE; i++) DestroySprite(gSprites[t.data[3 + i]]);
}

function Task_HidePartyStatusSummary_BattleStart_2(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (--t.data[15] === -1) {
    destroySummarySprites(taskId);
  } else if (t.data[15] === -3) {
    SetGpuReg(REG_OFFSET_BLDCNT, 0);
    SetGpuReg(REG_OFFSET_BLDALPHA, 0);
    tasks.destroy(taskId);
  }
}

function Task_HidePartyStatusSummary_DuringBattle(taskId: number): void {
  const t = tasks.tasks[taskId];
  if (--t.data[15] >= 0) {
    SetGpuReg(REG_OFFSET_BLDALPHA, BLDALPHA_BLEND(t.data[15], 16 - t.data[15]));
  } else if (t.data[15] === -1) {
    destroySummarySprites(taskId);
  } else if (t.data[15] === -3) {
    SetGpuReg(REG_OFFSET_BLDCNT, 0);
    SetGpuReg(REG_OFFSET_BLDALPHA, 0);
    tasks.destroy(taskId);
  }
}

function SpriteCB_PartySummaryBar(sprite: Sprite): void {
  if (sprite.x2 !== 0) sprite.x2 += sprite.data[0];
}

function SpriteCB_PartySummaryBar_Exit(sprite: Sprite): void {
  sprite.data[1] += 32;
  if (sprite.data[0] > 0) sprite.x2 += sprite.data[1] >> 4;
  else sprite.x2 -= sprite.data[1] >> 4;
  sprite.data[1] &= 0xf;
}

function ballSpeedStep(sprite: Sprite): number {
  const speed = ((sprite.data[3] & 0xffff) + 56) & 0xffff;
  sprite.data[3] = speed & 0xfff0;
  return speed >> 4;
}

function SpriteCB_PartySummaryBall_OnBattleStart(sprite: Sprite): void {
  if (sprite.data[1] > 0) {
    sprite.data[1]--;
    return;
  }
  const isOpponent = sprite.data[2];
  const step = ballSpeedStep(sprite);
  if (isOpponent) {
    sprite.x2 += step;
    if (sprite.x2 > 0) sprite.x2 = 0;
  } else {
    sprite.x2 -= step;
    if (sprite.x2 < 0) sprite.x2 = 0;
  }
  if (sprite.x2 === 0) {
    const pan = isOpponent ? C.SOUND_PAN_ATTACKER : C.SOUND_PAN_TARGET;
    sound.playSEWithPanning(sprite.data[7] ? C.SE_BALL_TRAY_EXIT : C.SE_BALL_TRAY_BALL, pan);
    sprite.callback = SpriteCallbackDummy;
  }
}

function SpriteCB_PartySummaryBall_Exit(sprite: Sprite): void {
  if (sprite.data[1] > 0) {
    sprite.data[1]--;
    return;
  }
  const step = ballSpeedStep(sprite);
  if (sprite.data[2]) sprite.x2 += step;
  else sprite.x2 -= step;
  if (sprite.x2 + sprite.x > DISPLAY_WIDTH + 8 || sprite.x2 + sprite.x < -8) {
    sprite.invisible = true;
    sprite.callback = SpriteCallbackDummy;
  }
}

function SpriteCB_PartySummaryBall_OnSwitchout(sprite: Sprite): void {
  const bar = gSprites[sprite.data[0]];
  sprite.x2 = bar.x2;
  sprite.y2 = bar.y2;
}

// ---------------------------------------------------------------- nickname / status / safari

const str = (name: string) => cdata<number[]>("strings", name);

function nicknameOf(mon: Mon): number[] {
  const raw: number[] = [];
  GetMonData(mon, C.MON_DATA_NICKNAME, raw);
  const out: number[] = [];
  for (let i = 0; i < raw.length && i < C.POKEMON_NAME_LENGTH && raw[i] !== EOS; i++) out.push(raw[i]);
  return out;
}

const sameString = (a: number[], b: ArrayLike<number>) => {
  let i = 0;
  for (; i < a.length; i++) if (a[i] !== b[i]) return false;
  return b[i] === EOS || b[i] === undefined;
};

/** pokemon.c CheckBattleTypeGhost */
export function CheckBattleTypeGhost(mon: Mon, battlerId: number): boolean {
  return !!(G.gBattleTypeFlags & C.BATTLE_TYPE_GHOST) && GetBattlerSide(battlerId) !== C.B_SIDE_PLAYER && sameString(nicknameOf(mon), str("gText_Ghost"));
}

export function UpdateNickInHealthbox(healthboxSpriteId: number, mon: Mon): void {
  const out: number[] = [C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_HIGHLIGHT, 2];
  const nickname = nicknameOf(mon);
  out.push(...nickname, C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_COLOR);
  let gender = GetMonGender(mon);
  const species = GetMonData(mon, C.MON_DATA_SPECIES);
  if ((species === C.SPECIES_NIDORAN_F || species === C.SPECIES_NIDORAN_M) && sameString(nickname, b64(rom.species[species].name))) gender = 100;
  if (CheckBattleTypeGhost(mon, battlerOf(healthboxSpriteId))) gender = 100;
  switch (gender) {
    default: out.push(C.TEXT_DYNAMIC_COLOR_2, EOS); break;
    case C.MON_MALE: out.push(C.TEXT_DYNAMIC_COLOR_2, C.CHAR_MALE, EOS); break;
    case C.MON_FEMALE: out.push(C.TEXT_DYNAMIC_COLOR_1, C.CHAR_FEMALE, EOS); break;
  }
  gDisplayedStringBattle.set(out);
  const win = AddTextPrinterAndCreateWindowOnHealthbox(gDisplayedStringBattle, 0, 3);
  const spriteTileNum = gSprites[healthboxSpriteId].oam.tileNum * TILE_SIZE_4BPP;
  if (GetBattlerSide(battlerOf(healthboxSpriteId)) === C.B_SIDE_PLAYER) {
    TextIntoHealthboxObject(OBJ_VRAM0 + 0x40 + spriteTileNum, win.tileData, 6);
    TextIntoHealthboxObject(OBJ_VRAM0 + spriteTileNum + (!IsDoubleBattle() ? 0x800 : 0x400), win.tileData.subarray(0xc0), 1);
  } else {
    TextIntoHealthboxObject(OBJ_VRAM0 + 0x20 + spriteTileNum, win.tileData, 7);
  }
  RemoveWindowOnHealthbox(win.windowId);
}

export function TryAddPokeballIconToHealthbox(healthboxSpriteId: number, noStatus: boolean): void {
  if (G.gBattleTypeFlags & (C.BATTLE_TYPE_FIRST_BATTLE | C.BATTLE_TYPE_OLD_MAN_TUTORIAL | C.BATTLE_TYPE_POKEDUDE)) return;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) return;
  const battlerId = battlerOf(healthboxSpriteId);
  if (GetBattlerSide(battlerId) === C.B_SIDE_PLAYER) return;
  const mon = gEnemyParty[gBattlerPartyIndexes[battlerId]];
  if (CheckBattleTypeGhost(mon, battlerId)) return;
  if (!GetSetPokedexFlag(SpeciesToNationalPokedexNum(GetMonData(mon, C.MON_DATA_SPECIES)), C.FLAG_GET_CAUGHT)) return;
  const dest = tileAddr(gSprites[healthBarOf(healthboxSpriteId)].oam.tileNum + 8);
  if (noStatus) CpuCopy32(gfxPtr(B_INTERFACE_GFX_BALL_CAUGHT), dest, TILE_SIZE_4BPP);
  else CpuFill32(0, dest, TILE_SIZE_4BPP);
}

const PAL_STATUS_PSN = 0, PAL_STATUS_PAR = 1, PAL_STATUS_SLP = 2, PAL_STATUS_FRZ = 3, PAL_STATUS_BRN = 4;
const sStatusIconColors = [RGB(24, 12, 24), RGB(23, 23, 3), RGB(20, 20, 17), RGB(17, 22, 28), RGB(28, 14, 10)];

function UpdateStatusIconInHealthbox(healthboxSpriteId: number): void {
  const battlerId = battlerOf(healthboxSpriteId);
  const healthBarSpriteId = healthBarOf(healthboxSpriteId);
  let tileNumAdder: number;
  const status = GetMonData(partyMonOf(battlerId), C.MON_DATA_STATUS);
  if (GetBattlerSide(battlerId) === C.B_SIDE_PLAYER) tileNumAdder = !IsDoubleBattle() ? 0x1a : 0x12;
  else tileNumAdder = 0x11;
  let statusElementId: number;
  let statusPalId: number;
  if (status & C.STATUS1_SLEEP) [statusElementId, statusPalId] = [GetStatusIconForBattlerId(B_INTERFACE_GFX_STATUS_SLP_BATTLER0, battlerId), PAL_STATUS_SLP];
  else if (status & C.STATUS1_PSN_ANY) [statusElementId, statusPalId] = [GetStatusIconForBattlerId(B_INTERFACE_GFX_STATUS_PSN_BATTLER0, battlerId), PAL_STATUS_PSN];
  else if (status & C.STATUS1_BURN) [statusElementId, statusPalId] = [GetStatusIconForBattlerId(B_INTERFACE_GFX_STATUS_BRN_BATTLER0, battlerId), PAL_STATUS_BRN];
  else if (status & C.STATUS1_FREEZE) [statusElementId, statusPalId] = [GetStatusIconForBattlerId(B_INTERFACE_GFX_STATUS_FRZ_BATTLER0, battlerId), PAL_STATUS_FRZ];
  else if (status & C.STATUS1_PARALYSIS) [statusElementId, statusPalId] = [GetStatusIconForBattlerId(B_INTERFACE_GFX_STATUS_PAR_BATTLER0, battlerId), PAL_STATUS_PAR];
  else {
    for (let i = 0; i < 3; i++) CpuCopy32(gfxPtr(B_INTERFACE_GFX_STATUS_NONE), tileAddr(gSprites[healthboxSpriteId].oam.tileNum + tileNumAdder + i), TILE_SIZE_4BPP);
    if (!gBattleSpritesDataPtr.battlerData[battlerId].hpNumbersNoBars) {
      CpuCopy32(gfxPtr(B_INTERFACE_GFX_HP_BAR_HP_TEXT), tileAddr(gSprites[healthBarSpriteId].oam.tileNum), 2 * TILE_SIZE_4BPP);
    }
    TryAddPokeballIconToHealthbox(healthboxSpriteId, true);
    return;
  }
  const pltAdder = PLTT_ID(gSprites[healthboxSpriteId].oam.paletteNum) + battlerId + 12;
  FillPalette(sStatusIconColors[statusPalId], pltAdder + OBJ_PLTT_OFFSET, 2);
  // CpuCopy16 into OBJ_PLTT: the port's palette RAM is the faded buffer after TransferPlttBuffer.
  ppu.pltt[OBJ_PLTT_OFFSET + pltAdder] = gPlttBufferUnfaded[OBJ_PLTT_OFFSET + pltAdder];
  CpuCopy32(gfxPtr(statusElementId), tileAddr(gSprites[healthboxSpriteId].oam.tileNum + tileNumAdder), 3 * TILE_SIZE_4BPP);
  if (IsDoubleBattle() || GetBattlerSide(battlerId) === C.B_SIDE_OPPONENT) {
    if (!gBattleSpritesDataPtr.battlerData[battlerId].hpNumbersNoBars) {
      CpuCopy32(gfxPtr(B_INTERFACE_GFX_TRANSPARENT), tileAddr(gSprites[healthBarSpriteId].oam.tileNum), TILE_SIZE_4BPP);
      CpuCopy32(gfxPtr(B_INTERFACE_GFX_HP_BAR_LEFT_BORDER), tileAddr(gSprites[healthBarSpriteId].oam.tileNum + 1), TILE_SIZE_4BPP);
    }
  }
  TryAddPokeballIconToHealthbox(healthboxSpriteId, false);
}

function GetStatusIconForBattlerId(statusElementId: number, battlerId: number): number {
  const table: Record<number, number[]> = {
    [B_INTERFACE_GFX_STATUS_PSN_BATTLER0]: [B_INTERFACE_GFX_STATUS_PSN_BATTLER0, B_INTERFACE_GFX_STATUS_PSN_BATTLER1, B_INTERFACE_GFX_STATUS_PSN_BATTLER2, B_INTERFACE_GFX_STATUS_PSN_BATTLER3],
    [B_INTERFACE_GFX_STATUS_PAR_BATTLER0]: [B_INTERFACE_GFX_STATUS_PAR_BATTLER0, B_INTERFACE_GFX_STATUS_PAR_BATTLER1, B_INTERFACE_GFX_STATUS_PAR_BATTLER2, B_INTERFACE_GFX_STATUS_PAR_BATTLER3],
    [B_INTERFACE_GFX_STATUS_SLP_BATTLER0]: [B_INTERFACE_GFX_STATUS_SLP_BATTLER0, B_INTERFACE_GFX_STATUS_SLP_BATTLER1, B_INTERFACE_GFX_STATUS_SLP_BATTLER2, B_INTERFACE_GFX_STATUS_SLP_BATTLER3],
    [B_INTERFACE_GFX_STATUS_FRZ_BATTLER0]: [B_INTERFACE_GFX_STATUS_FRZ_BATTLER0, B_INTERFACE_GFX_STATUS_FRZ_BATTLER1, B_INTERFACE_GFX_STATUS_FRZ_BATTLER2, B_INTERFACE_GFX_STATUS_FRZ_BATTLER3],
    [B_INTERFACE_GFX_STATUS_BRN_BATTLER0]: [B_INTERFACE_GFX_STATUS_BRN_BATTLER0, B_INTERFACE_GFX_STATUS_BRN_BATTLER1, B_INTERFACE_GFX_STATUS_BRN_BATTLER2, B_INTERFACE_GFX_STATUS_BRN_BATTLER3],
  };
  const row = table[statusElementId];
  return row ? row[Math.min(battlerId, 3)] : statusElementId;
}

function UpdateSafariBallsTextOnHealthbox(healthboxSpriteId: number): void {
  const win = AddTextPrinterAndCreateWindowOnHealthbox(str("gText_SafariBalls"), 0, 3);
  const spriteTileNum = gSprites[healthboxSpriteId].oam.tileNum * TILE_SIZE_4BPP;
  TextIntoHealthboxObject(OBJ_VRAM0 + 0x40 + spriteTileNum, win.tileData, 6);
  TextIntoHealthboxObject(OBJ_VRAM0 + 0x800 + spriteTileNum, win.tileData.subarray(0xc0), 2);
  RemoveWindowOnHealthbox(win.windowId);
}

function UpdateLeftNoOfBallsTextOnHealthbox(healthboxSpriteId: number): void {
  const text: number[] = [];
  const prefix = str("gText_HighlightRed_Left");
  let n = 0;
  for (; prefix[n] !== EOS; n++) text[n] = prefix[n];
  writeNumber(text, n, G.gNumSafariBalls, STR_CONV_MODE_LEFT_ALIGN, 2);
  const win = AddTextPrinterAndCreateWindowOnHealthbox(text, 47 - stringWidth(FONT_SMALL, text, 0), 3);
  const spriteTileNum = gSprites[healthboxSpriteId].oam.tileNum * TILE_SIZE_4BPP;
  SafariTextIntoHealthboxObject(OBJ_VRAM0 + 0x2c0 + spriteTileNum, win.tileData, 2);
  SafariTextIntoHealthboxObject(OBJ_VRAM0 + 0xa00 + spriteTileNum, win.tileData.subarray(0x40), 4);
  RemoveWindowOnHealthbox(win.windowId);
}

// ---------------------------------------------------------------- UpdateHealthboxAttribute / bars

export function UpdateHealthboxAttribute(healthboxSpriteId: number, mon: Mon, elementId: number): void {
  const battlerId = battlerOf(healthboxSpriteId);
  if (GetBattlerSide(battlerId) === C.B_SIDE_PLAYER) {
    if (elementId === C.HEALTHBOX_LEVEL || elementId === C.HEALTHBOX_ALL) UpdateLvlInHealthbox(healthboxSpriteId, GetMonData(mon, C.MON_DATA_LEVEL));
    if (elementId === C.HEALTHBOX_CURRENT_HP || elementId === C.HEALTHBOX_ALL) UpdateHpTextInHealthbox(healthboxSpriteId, GetMonData(mon, C.MON_DATA_HP), C.HP_CURRENT);
    if (elementId === C.HEALTHBOX_MAX_HP || elementId === C.HEALTHBOX_ALL) UpdateHpTextInHealthbox(healthboxSpriteId, GetMonData(mon, C.MON_DATA_MAX_HP), C.HP_MAX);
    if (elementId === C.HEALTHBOX_HEALTH_BAR || elementId === C.HEALTHBOX_ALL) {
      LoadBattleBarGfx(0);
      SetBattleBarStruct(battlerId, healthboxSpriteId, GetMonData(mon, C.MON_DATA_MAX_HP), GetMonData(mon, C.MON_DATA_HP), 0);
      MoveBattleBar(battlerId, healthboxSpriteId, C.HEALTH_BAR, 0);
    }
    const isDoubles = IsDoubleBattle() ? 1 : 0;
    if (!isDoubles && (elementId === C.HEALTHBOX_EXP_BAR || elementId === C.HEALTHBOX_ALL)) {
      LoadBattleBarGfx(3);
      const species = GetMonData(mon, C.MON_DATA_SPECIES);
      const level = GetMonData(mon, C.MON_DATA_LEVEL);
      const exp = GetMonData(mon, C.MON_DATA_EXP);
      const table = rom.expTables[rom.species[species].growthRate];
      const currLevelExp = table[level];
      SetBattleBarStruct(battlerId, healthboxSpriteId, table[level + 1] - currLevelExp, exp - currLevelExp, isDoubles);
      MoveBattleBar(battlerId, healthboxSpriteId, C.EXP_BAR, 0);
    }
    if (elementId === C.HEALTHBOX_NICK || elementId === C.HEALTHBOX_ALL) UpdateNickInHealthbox(healthboxSpriteId, mon);
    if (elementId === C.HEALTHBOX_STATUS_ICON || elementId === C.HEALTHBOX_ALL) UpdateStatusIconInHealthbox(healthboxSpriteId);
    if (elementId === C.HEALTHBOX_SAFARI_ALL_TEXT) UpdateSafariBallsTextOnHealthbox(healthboxSpriteId);
    if (elementId === C.HEALTHBOX_SAFARI_ALL_TEXT || elementId === C.HEALTHBOX_SAFARI_BALLS_TEXT) UpdateLeftNoOfBallsTextOnHealthbox(healthboxSpriteId);
  } else {
    if (elementId === C.HEALTHBOX_LEVEL || elementId === C.HEALTHBOX_ALL) UpdateLvlInHealthbox(healthboxSpriteId, GetMonData(mon, C.MON_DATA_LEVEL));
    if (elementId === C.HEALTHBOX_HEALTH_BAR || elementId === C.HEALTHBOX_ALL) {
      LoadBattleBarGfx(0);
      SetBattleBarStruct(battlerId, healthboxSpriteId, GetMonData(mon, C.MON_DATA_MAX_HP), GetMonData(mon, C.MON_DATA_HP), 0);
      MoveBattleBar(battlerId, healthboxSpriteId, C.HEALTH_BAR, 0);
    }
    if (elementId === C.HEALTHBOX_NICK || elementId === C.HEALTHBOX_ALL) UpdateNickInHealthbox(healthboxSpriteId, mon);
    if (elementId === C.HEALTHBOX_STATUS_ICON || elementId === C.HEALTHBOX_ALL) UpdateStatusIconInHealthbox(healthboxSpriteId);
  }
}

export function MoveBattleBar(battlerId: number, _healthboxSpriteId: number, whichBar: number, _unused: number): number {
  const bar = gBattleSpritesDataPtr.battleBars[battlerId];
  const curr = { value: bar.currValue };
  let currentBarValue: number;
  if (whichBar === C.HEALTH_BAR) {
    currentBarValue = CalcNewBarValue(bar.maxValue, bar.oldValue, bar.receivedValue, curr, B_HEALTHBAR_NUM_TILES, 1);
  } else {
    let increment = GetReceivedValueInPixels(bar.oldValue, bar.receivedValue, bar.maxValue, B_EXPBAR_NUM_TILES);
    if (increment === 0) increment = 1;
    increment = Math.abs(Math.trunc(bar.receivedValue / increment)) & 0xffff;
    currentBarValue = CalcNewBarValue(bar.maxValue, bar.oldValue, bar.receivedValue, curr, B_EXPBAR_NUM_TILES, increment);
  }
  bar.currValue = curr.value;
  if (whichBar === C.EXP_BAR || (whichBar === C.HEALTH_BAR && !gBattleSpritesDataPtr.battlerData[battlerId].hpNumbersNoBars)) MoveBattleBarGraphically(battlerId, whichBar);
  if (currentBarValue === -1) bar.currValue = 0;
  return currentBarValue;
}

function MoveBattleBarGraphically(battlerId: number, whichBar: number): void {
  const bar = gBattleSpritesDataPtr.battleBars[battlerId];
  const filledPixels = new Uint8Array(Math.max(B_HEALTHBAR_NUM_TILES, B_EXPBAR_NUM_TILES));
  const curr = { value: bar.currValue };
  switch (whichBar) {
    case C.HEALTH_BAR: {
      const total = CalcBarFilledPixels(bar.maxValue, bar.oldValue, bar.receivedValue, curr, filledPixels, B_HEALTHBAR_NUM_TILES);
      let barElementId: number;
      if (total > (B_HEALTHBAR_NUM_PIXELS * 50) / 100) barElementId = B_INTERFACE_GFX_HP_BAR_GREEN;
      else if (total > Math.trunc((B_HEALTHBAR_NUM_PIXELS * 20) / 100)) barElementId = B_INTERFACE_GFX_HP_BAR_YELLOW;
      else barElementId = B_INTERFACE_GFX_HP_BAR_RED;
      for (let i = 0; i < B_HEALTHBAR_NUM_TILES; i++) {
        const healthbarTile = gSprites[gSprites[bar.healthboxSpriteId].data[5]].oam.tileNum;
        const src = gfxPtr(barElementId, filledPixels[i] * TILE_SIZE_4BPP);
        if (i < 2) CpuCopy32(src, tileAddr(healthbarTile + 2 + i), TILE_SIZE_4BPP);
        else CpuCopy32(src, OBJ_VRAM0 + 64 + (i + healthbarTile) * TILE_SIZE_4BPP, TILE_SIZE_4BPP);
      }
      break;
    }
    case C.EXP_BAR: {
      CalcBarFilledPixels(bar.maxValue, bar.oldValue, bar.receivedValue, curr, filledPixels, B_EXPBAR_NUM_TILES);
      const level = GetMonData(playerMon(gBattlerPartyIndexes[battlerId]), C.MON_DATA_LEVEL);
      if (level === C.MAX_LEVEL) filledPixels.fill(0);
      const boxTile = gSprites[bar.healthboxSpriteId].oam.tileNum;
      for (let i = 0; i < B_EXPBAR_NUM_TILES; i++) {
        const src = gfxPtr(B_INTERFACE_GFX_EXP_BAR, filledPixels[i] * TILE_SIZE_4BPP);
        if (i < 4) CpuCopy32(src, tileAddr(boxTile + 36 + i), TILE_SIZE_4BPP);
        else CpuCopy32(src, OBJ_VRAM0 + 0xb80 + (i + boxTile) * TILE_SIZE_4BPP, TILE_SIZE_4BPP);
      }
      break;
    }
  }
}

const Q_24_8 = (n: number) => n * 256;
const Q_24_8_TO_INT = (n: number) => n >> 8;

function CalcNewBarValue(maxValue: number, oldValue: number, receivedValue: number, currValue: { value: number }, totalPixels: number, increment: number): number {
  totalPixels = (totalPixels * 8) & 0xff;
  if (currValue.value === -32768) currValue.value = maxValue < totalPixels ? Q_24_8(oldValue) : oldValue;
  let newValue = oldValue - receivedValue;
  if (newValue < 0) newValue = 0;
  else if (newValue > maxValue) newValue = maxValue;
  if (maxValue < totalPixels) {
    if (newValue === Q_24_8_TO_INT(currValue.value) && (currValue.value & 0xff) === 0) return -1;
  } else if (newValue === currValue.value) {
    return -1;
  }
  let ret: number;
  if (maxValue < totalPixels) {
    const incrementInQ = Math.trunc(Q_24_8(maxValue) / totalPixels);
    if (receivedValue < 0) {
      currValue.value += incrementInQ;
      ret = Q_24_8_TO_INT(currValue.value);
      if (ret >= newValue) {
        currValue.value = Q_24_8(newValue);
        ret = newValue;
      }
    } else {
      currValue.value -= incrementInQ;
      ret = Q_24_8_TO_INT(currValue.value);
      if ((currValue.value & 0xff) > 0) ret++;
      if (ret <= newValue) {
        currValue.value = Q_24_8(newValue);
        ret = newValue;
      }
    }
  } else if (receivedValue < 0) {
    currValue.value += increment;
    if (currValue.value > newValue) currValue.value = newValue;
    ret = currValue.value;
  } else {
    currValue.value -= increment;
    if (currValue.value < newValue) currValue.value = newValue;
    ret = currValue.value;
  }
  return ret;
}

function CalcBarFilledPixels(maxValue: number, oldValue: number, receivedValue: number, currValue: { value: number }, filledPixels: Uint8Array, numTiles: number): number {
  let newValue = oldValue - receivedValue;
  if (newValue < 0) newValue = 0;
  else if (newValue > maxValue) newValue = maxValue;
  const totalPixels = numTiles * 8;
  for (let i = 0; i < numTiles; i++) filledPixels[i] = 0;
  let numPixelsToFill: number;
  if (maxValue < totalPixels) numPixelsToFill = Q_24_8_TO_INT(Math.trunc((currValue.value * totalPixels) / maxValue)) & 0xff;
  else numPixelsToFill = Math.trunc((currValue.value * totalPixels) / maxValue) & 0xff;
  let totalFilledPixels = numPixelsToFill;
  if (numPixelsToFill === 0 && newValue > 0) {
    filledPixels[0] = 1;
    totalFilledPixels = 1;
  } else {
    for (let i = 0; i < numTiles; i++) {
      if (numPixelsToFill >= 8) {
        filledPixels[i] = 8;
      } else {
        filledPixels[i] = numPixelsToFill;
        break;
      }
      numPixelsToFill -= 8;
    }
  }
  return totalFilledPixels;
}

function GetReceivedValueInPixels(oldValue: number, receivedValue: number, maxValue: number, totalPixels: number): number {
  totalPixels *= 8;
  let newVal = oldValue - receivedValue;
  if (newVal < 0) newVal = 0;
  else if (newVal > maxValue) newVal = maxValue;
  const s8 = (v: number) => (v << 24) >> 24;
  const oldToMax = s8(Math.trunc((oldValue * totalPixels) / maxValue));
  const newToMax = s8(Math.trunc((newVal * totalPixels) / maxValue));
  return Math.abs(oldToMax - newToMax) & 0xff;
}

export function GetScaledHPFraction(hp: number, maxhp: number, scale: number): number {
  const result = Math.trunc((hp * scale) / maxhp) & 0xff;
  if (result === 0 && hp > 0) return 1;
  return result;
}

export function GetHPBarLevel(hp: number, maxhp: number): number {
  if (hp === maxhp) return C.HP_BAR_FULL;
  const fraction = GetScaledHPFraction(hp, maxhp, B_HEALTHBAR_NUM_PIXELS);
  if (fraction > (B_HEALTHBAR_NUM_PIXELS * 50) / 100) return C.HP_BAR_GREEN;
  if (fraction > Math.trunc((B_HEALTHBAR_NUM_PIXELS * 20) / 100)) return C.HP_BAR_YELLOW;
  if (fraction > 0) return C.HP_BAR_RED;
  return C.HP_BAR_EMPTY;
}

// ---------------------------------------------------------------- healthbox text windows

const sHealthboxWindowTemplate: WindowTemplate = { bg: 0, tilemapLeft: 0, tilemapTop: 0, width: 8, height: 2, paletteNum: 0, baseBlock: 0 };

function AddTextPrinterAndCreateWindowOnHealthbox(s: ArrayLike<number>, x: number, y: number): { windowId: number; tileData: Uint8Array } {
  const winId = AddWindow({ ...sHealthboxWindowTemplate });
  FillWindowPixelBuffer(winId, PIXEL_FILL(2));
  AddTextPrinterParameterized4(winId, FONT_SMALL, x, y, 0, 0, [2, 1, 3], -1, s);
  return { windowId: winId, tileData: gWindows[winId].tileData! };
}

function RemoveWindowOnHealthbox(windowId: number): void {
  RemoveWindow(windowId);
}

function TextIntoHealthboxObject(dest: number, windowTileData: Uint8Array, windowWidth: number): void {
  // + 256 skips the top 4 blank rows of sHealthboxWindowTemplate
  ppu.vram.set(windowTileData.subarray(256, 256 + windowWidth * TILE_SIZE_4BPP), dest + 256);
  let src = 0;
  for (; windowWidth > 0; windowWidth--, dest += 32, src += 32) ppu.vram.set(windowTileData.subarray(src + 20, src + 32), dest + 20);
}

function SafariTextIntoHealthboxObject(dest: number, windowTileData: Uint8Array, windowWidth: number): void {
  ppu.vram.set(windowTileData.subarray(0, windowWidth * TILE_SIZE_4BPP), dest);
  ppu.vram.set(windowTileData.subarray(256, 256 + windowWidth * TILE_SIZE_4BPP), dest + 256);
}

// ---------------------------------------------------------------- text.c RenderTextHandleBold

/** Renders str with the bold (Japanese) font as 8x16 glyphs: each char writes its top and bottom tile (0x40 bytes). */
function RenderTextHandleBold(pixels: Uint8Array, _fontId: number, s: ArrayLike<number>): void {
  let fg = 1, bg = 0, shadow = 3;
  const glyphs = incbin("sFontBoldJapaneseGlyphs");
  let out = 0;
  const tile = (glyphU16: number, dest: number) => {
    for (let row = 0; row < 8; row++) {
      const o = (glyphU16 + row) * 2;
      const halves = [glyphs[o + 1], glyphs[o]];
      for (let h = 0; h < 2; h++) {
        for (let p = 0; p < 4; p++) {
          const v = (halves[h] >> (6 - 2 * p)) & 3;
          const color = v === 1 ? fg : v === 2 ? shadow : bg;
          const x = h * 4 + p;
          const idx = dest + row * 4 + (x >> 1);
          pixels[idx] = x & 1 ? (pixels[idx] & 0x0f) | (color << 4) : (pixels[idx] & 0xf0) | color;
        }
      }
    }
  };
  for (let pos = 0; ; ) {
    const c = s[pos++];
    if (c === EOS || c === undefined) break;
    if (c === C.EXT_CTRL_CODE_BEGIN) {
      const code = s[pos++];
      switch (code) {
        case C.EXT_CTRL_CODE_COLOR_HIGHLIGHT_SHADOW: fg = s[pos++]; bg = s[pos++]; shadow = s[pos++]; continue;
        case C.EXT_CTRL_CODE_COLOR: fg = s[pos++]; continue;
        case C.EXT_CTRL_CODE_HIGHLIGHT: bg = s[pos++]; continue;
        case C.EXT_CTRL_CODE_SHADOW: shadow = s[pos++]; continue;
        case C.EXT_CTRL_CODE_FONT: pos++; continue;
        case C.EXT_CTRL_CODE_PLAY_BGM:
        case C.EXT_CTRL_CODE_PLAY_SE: pos += 2; continue;
        case C.EXT_CTRL_CODE_PALETTE:
        case C.EXT_CTRL_CODE_PAUSE:
        case C.EXT_CTRL_CODE_ESCAPE:
        case C.EXT_CTRL_CODE_SHIFT_RIGHT:
        case C.EXT_CTRL_CODE_SHIFT_DOWN:
        case C.EXT_CTRL_CODE_CLEAR:
        case C.EXT_CTRL_CODE_SKIP:
        case C.EXT_CTRL_CODE_CLEAR_TO:
        case C.EXT_CTRL_CODE_MIN_LETTER_SPACING: pos++; continue;
        default: continue;
      }
    }
    if (c === C.CHAR_DYNAMIC || c === C.CHAR_KEYPAD_ICON || c === C.CHAR_EXTRA_SYMBOL || c === C.PLACEHOLDER_BEGIN) {
      pos++;
      continue;
    }
    if (c === C.CHAR_PROMPT_SCROLL || c === C.CHAR_PROMPT_CLEAR || c === C.CHAR_NEWLINE) continue;
    const base = 0x100 * (c >> 4) + 0x8 * (c & 0xf);
    tile(base, out); // DecompressGlyph_Bold: top tile -> gGlyphInfo.pixels, copied to pixels
    tile(base + 0x80, out + 0x20); // bottom tile -> gGlyphInfo.pixels + 0x40, copied to pixels + 0x20
    out += 0x40;
  }
}

// ---------------------------------------------------------------- battle_anim_special.c healthbox level-up palettes

export function DoLoadHealthboxPalsForLevelUp(battler: number): [number, number] {
  const healthBoxSpriteId = gHealthboxSpriteIds[battler];
  const spriteId1 = gSprites[healthBoxSpriteId].oam.affineParam;
  const spriteId2 = gSprites[healthBoxSpriteId].data[5];
  const paletteId1 = AllocSpritePalette(C.TAG_HEALTHBOX_PALS_1);
  const paletteId2 = AllocSpritePalette(C.TAG_HEALTHBOX_PALS_2);
  const offset1 = OBJ_PLTT_ID(gSprites[healthBoxSpriteId].oam.paletteNum);
  const offset2 = OBJ_PLTT_ID(gSprites[spriteId2].oam.paletteNum);
  LoadPalette(gPlttBufferUnfaded.slice(offset1, offset1 + 16), OBJ_PLTT_ID(paletteId1), PLTT_SIZE_4BPP);
  LoadPalette(gPlttBufferUnfaded.slice(offset2, offset2 + 16), OBJ_PLTT_ID(paletteId2), PLTT_SIZE_4BPP);
  gSprites[healthBoxSpriteId].oam.paletteNum = paletteId1;
  gSprites[spriteId1].oam.paletteNum = paletteId1;
  gSprites[spriteId2].oam.paletteNum = paletteId2;
  return [paletteId1, paletteId2];
}

export function DoFreeHealthboxPalsForLevelUp(battler: number): void {
  const healthBoxSpriteId = gHealthboxSpriteIds[battler];
  const spriteId1 = gSprites[healthBoxSpriteId].oam.affineParam;
  const spriteId2 = gSprites[healthBoxSpriteId].data[5];
  FreeSpritePaletteByTag(C.TAG_HEALTHBOX_PALS_1);
  FreeSpritePaletteByTag(C.TAG_HEALTHBOX_PALS_2);
  const paletteId1 = IndexOfSpritePaletteTag(C.TAG_HEALTHBOX_PAL);
  const paletteId2 = IndexOfSpritePaletteTag(C.TAG_HEALTHBAR_PAL);
  gSprites[healthBoxSpriteId].oam.paletteNum = paletteId1;
  gSprites[spriteId1].oam.paletteNum = paletteId1;
  gSprites[spriteId2].oam.paletteNum = paletteId2;
}
