// battle_script_commands.c, commands 0x5C-0xAA (hitanimation .. copymovepermanently).

import * as C from "../../generated/constants";
import { sound } from "../../audio/sound";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_UP, JOY_NEW } from "../../gba/input";
import { ShowBg, SetBgAttribute, BG_ATTR_PRIORITY, IsDma3ManagerBusyWithBgCopy } from "../../hw/bg";
import { gMain } from "../../hw/runtime";
import { ClearWindowTilemap, COPYWIN_FULL, COPYWIN_GFX, COPYWIN_MAP, CopyWindowToVram, CopyToWindowPixelBuffer, PutWindowTilemap } from "../../hw/window";
import { LoadPalette, BG_PLTT_ID } from "../../hw/palette";
import { incbin, incbin16 } from "../../hw/assets";
import { CreateSprite, DestroySprite, FreeSpritePaletteByTag, FreeSpriteTilesByTag, LoadSpritePalette, LoadSpriteSheet, gSprites, type Sprite, type SpriteTemplate } from "../../hw/sprite";
import { random } from "../../random";
import { rom } from "../../rom";
import { save } from "../../save";
import { BS, BattleScriptPush, r16, r32, r8, scriptTable } from "../bscript";
import {
  G, gActionsByTurnOrder, gBattleBufferB, gBattleCommunication, gBattleMons, gBattleResources, gBattleScripting, gBattleStruct,
  gBattleTextBuff1, gBattleTextBuff2, gBattlerPartyIndexes, gBitTable, gDisableStructs, gEnigmaBerries, gLastHitBy,
  gLastHitByType, gLastLandedMoves, gLastMoves, gLastPrintedMoves, gLastResultingMoves, gLockedMoves, gProtectStructs,
  gSideStatuses, gSideTimers, gSpecialStatuses, gStatuses3, gTakenDmg, gWishFutureKnock,
} from "../globals";
import {
  GET_BATTLER_SIDE, GET_STAT_BUFF_VALUE, HITMARKER_FAINTED, IS_BATTLER_OF_TYPE, IS_BATTLE_TYPE_GHOST_WITHOUT_SCOPE, SET_BATTLER_TYPE,
  STATUS1_SLEEP_TURN, STATUS2_BIDE_TURN, STATUS2_INFATUATED_WITH, STATUS3_ALWAYS_HITS_TURN, TYPE_EFFECT_ATK_TYPE, TYPE_EFFECT_DEF_TYPE,
  TYPE_EFFECT_MULTIPLIER, div, gBattleMoves, GET_STAT_BUFF_ID,
} from "../macros";
import { GetMonData, GetGenderFromSpeciesAndPersonality, gEnemyParty, playerMon, type Mon, GetMonGender } from "../../pokemon/mon";
import {
  CancelMultiTurnMoves, CountAliveMonsInBattle, GetAbilityBySpecies, GetBattlerAtPosition, GetBattlerForBattleScript, GetBattlerPosition,
  GetBattlerSide, GetMoveTarget, ItemId_GetHoldEffect, ItemId_GetHoldEffectParam, MarkBattlerForControllerExec, RecordAbilityBattle,
  RecordItemEffectBattle, ResetSentPokesToOpponentValue, WEATHER_HAS_EFFECT,
} from "../util";
import {
  BtlController_EmitDrawPartyStatusSummary, BtlController_EmitGetMonData, BtlController_EmitHealthBarUpdate, BtlController_EmitHidePartyStatusSummary,
  BtlController_EmitHitAnimation, BtlController_EmitResetActionMoveSelection, BtlController_EmitReturnMonToBall, BtlController_EmitSetMonData,
  BtlController_EmitSpriteInvisibility, BtlController_EmitStatusAnimation, BtlController_EmitStatusIconUpdate, BUFFER_A,
} from "../controllers";
import {
  BattlePutTextOnWindow, BattleCreateYesNoCursorAt, BattleDestroyYesNoCursorAt, HandleBattleWindow, PREPARE_BYTE_NUMBER_BUFFER,
  PREPARE_HWORD_NUMBER_BUFFER, PREPARE_MON_NICK_BUFFER, PREPARE_MOVE_BUFFER, PREPARE_SPECIES_BUFFER, PREPARE_STAT_BUFFER,
  PREPARE_TYPE_BUFFER, PREPARE_WORD_NUMBER_BUFFER, B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_STRING, B_BUFF_EOS,
} from "../message";
import { CalculateBaseDamage } from "../damage";
import { IsRunningFromBattleImpossible, TryRunFromBattle, UpdatePartyOwnerOnSwitch_NonMulti } from "../main";
import { IsTwoTurnsMove, T } from "./helpers";
import { JumpIfMoveFailed, u16bytes, u32bytes } from "./part1";
import { AddMoney, ComputeWhiteOutMoneyLoss, IncrementGameStat, IsFanfareTaskInactive, PokemonUseItemEffects } from "../ext";
import { DrawLevelUpWindowPg1, DrawLevelUpWindowPg2, GetMonLevelUpWindowStats } from "../ext";
import { GetMonIconPtr, GetValidMonIconPalettePtr } from "../ext";
import { AddTextPrinter } from "../../hw/text";
import { FONT_SMALL } from "../../gba/font";
import { TEXT_COLOR_DARK_GRAY, TEXT_COLOR_TRANSPARENT, TEXT_COLOR_WHITE, TEXT_SKIP_DRAW } from "../../gba/textPrinter";
import { EOS, encode, intToDecimal, STR_CONV_MODE_LEFT_ALIGN } from "../../gba/charmap";
import { oamData, SPRITE_SHAPE, SPRITE_SIZE, gDummySpriteAnimTable, gDummySpriteAffineAnimTable } from "../../hw/sprite";

const cur = () => G.gBattlescriptCurrInstr;
const adv = (n: number) => { G.gBattlescriptCurrInstr += n; };
const WINDOW_CLEAR = 1 << 0;
const WINDOW_BG1 = 1 << 7;
const LEVEL_UP_BANNER_START = 416;
const LEVEL_UP_BANNER_END = 512;
const TAG_LVLUP_BANNER_MON_ICON = 55130;

function holdEffectOf(battler: number): [number, number] {
  if (gBattleMons[battler].item === C.ITEM_ENIGMA_BERRY) return [gEnigmaBerries[battler].holdEffect, gEnigmaBerries[battler].holdEffectParam];
  return [ItemId_GetHoldEffect(gBattleMons[battler].item), ItemId_GetHoldEffectParam(gBattleMons[battler].item)];
}

function partyOf(battler: number): (i: number) => Mon {
  return GetBattlerSide(battler) === C.B_SIDE_PLAYER ? playerMon : (i) => gEnemyParty[i];
}

export function Cmd_hitanimation(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  const b = G.gActiveBattler;
  if (G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) {
    adv(2);
  } else if (!(G.gHitMarker & C.HITMARKER_IGNORE_SUBSTITUTE) || !(gBattleMons[b].status2 & C.STATUS2_SUBSTITUTE) || gDisableStructs[b].substituteHP === 0) {
    BtlController_EmitHitAnimation(BUFFER_A);
    MarkBattlerForControllerExec(b);
    adv(2);
  } else {
    adv(2);
  }
}

export function Cmd_getmoneyreward(): void {
  let moneyReward: number;
  if (G.gBattleOutcome === C.B_OUTCOME_WON) {
    const trainer = rom.trainers[G.gTrainerBattleOpponent_A];
    const lastMonLevel = trainer.party[trainer.party.length - 1]?.level ?? 0;
    let value = 0;
    for (const [classId, v] of rom.trainerMoney) {
      if (classId === 0xff) { value = v; break; }
      if (classId === trainer.class) { value = v; break; }
    }
    moneyReward = 4 * lastMonLevel * gBattleStruct.moneyMultiplier * (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE ? 2 : 1) * value;
    AddMoney(moneyReward);
  } else {
    moneyReward = ComputeWhiteOutMoneyLoss();
  }
  PREPARE_WORD_NUMBER_BUFFER(gBattleTextBuff1, 5, moneyReward);
  if (moneyReward) adv(5);
  else G.gBattlescriptCurrInstr = r32(cur() + 1);
}

export function Cmd_updatebattlermoves(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  switch (gBattleCommunication[0]) {
    case 0:
      BtlController_EmitGetMonData(BUFFER_A, C.REQUEST_ALL_BATTLE, 0);
      MarkBattlerForControllerExec(G.gActiveBattler);
      gBattleCommunication[0]++;
      break;
    case 1:
      if (G.gBattleControllerExecFlags === 0) {
        const buf = gBattleBufferB[G.gActiveBattler];
        for (let i = 0; i < 4; i++) {
          gBattleMons[G.gActiveBattler].moves[i] = buf[4 + 0x0c + i * 2] | (buf[4 + 0x0c + i * 2 + 1] << 8);
          gBattleMons[G.gActiveBattler].pp[i] = buf[4 + 0x24 + i];
        }
        adv(2);
      }
      break;
  }
}

export function Cmd_swapattackerwithtarget(): void {
  G.gActiveBattler = G.gBattlerAttacker;
  G.gBattlerAttacker = G.gBattlerTarget;
  G.gBattlerTarget = G.gActiveBattler;
  if (G.gHitMarker & C.HITMARKER_SWAP_ATTACKER_TARGET) G.gHitMarker &= ~C.HITMARKER_SWAP_ATTACKER_TARGET;
  else G.gHitMarker |= C.HITMARKER_SWAP_ATTACKER_TARGET;
  adv(1);
}

export function Cmd_incrementgamestat(): void {
  if (GetBattlerSide(G.gBattlerAttacker) === C.B_SIDE_PLAYER) IncrementGameStat(r8(cur() + 1));
  adv(2);
}

export function hpStatusesOf(party: (i: number) => Mon): Array<{ hp: number; status: number }> {
  const out: Array<{ hp: number; status: number }> = [];
  for (let i = 0; i < 6; i++) {
    const mon = party(i);
    const s = GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG);
    if (s === C.SPECIES_NONE || s === C.SPECIES_EGG) out.push({ hp: 0xffff, status: 0 });
    else out.push({ hp: GetMonData(mon, C.MON_DATA_HP), status: GetMonData(mon, C.MON_DATA_STATUS) });
  }
  return out;
}

export function Cmd_drawpartystatussummary(): void {
  if (G.gBattleControllerExecFlags) return;
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  BtlController_EmitDrawPartyStatusSummary(BUFFER_A, hpStatusesOf(partyOf(G.gActiveBattler)), 1);
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(2);
}

export function Cmd_hidepartystatussummary(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  BtlController_EmitHidePartyStatusSummary(BUFFER_A);
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(2);
}

export function Cmd_jumptocalledmove(): void {
  if (r8(cur() + 1)) G.gCurrentMove = G.gCalledMove;
  else G.gChosenMove = G.gCurrentMove = G.gCalledMove;
  G.gBattlescriptCurrInstr = scriptTable("gBattleScriptsForMoveEffects", gBattleMoves(G.gCurrentMove).effect);
}

function canAnimateStatus(b: number): boolean {
  return !(gStatuses3[b] & C.STATUS3_SEMI_INVULNERABLE) && gDisableStructs[b].substituteHP === 0 && !(G.gHitMarker & C.HITMARKER_NO_ANIMATIONS);
}

export function Cmd_statusanimation(): void {
  if (G.gBattleControllerExecFlags === 0) {
    G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
    if (canAnimateStatus(G.gActiveBattler)) {
      BtlController_EmitStatusAnimation(BUFFER_A, false, gBattleMons[G.gActiveBattler].status1);
      MarkBattlerForControllerExec(G.gActiveBattler);
    }
    adv(2);
  }
}

export function Cmd_status2animation(): void {
  if (G.gBattleControllerExecFlags === 0) {
    G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
    const wanted = r32(cur() + 2);
    if (canAnimateStatus(G.gActiveBattler)) {
      BtlController_EmitStatusAnimation(BUFFER_A, true, gBattleMons[G.gActiveBattler].status2 & wanted);
      MarkBattlerForControllerExec(G.gActiveBattler);
    }
    adv(6);
  }
}

export function Cmd_chosenstatusanimation(): void {
  if (G.gBattleControllerExecFlags === 0) {
    G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
    const wanted = r32(cur() + 3);
    if (canAnimateStatus(G.gActiveBattler)) {
      BtlController_EmitStatusAnimation(BUFFER_A, !!r8(cur() + 2), wanted);
      MarkBattlerForControllerExec(G.gActiveBattler);
    }
    adv(7);
  }
}

export function Cmd_yesnobox(): void {
  switch (gBattleCommunication[0]) {
    case 0:
      HandleBattleWindow(23, 8, 29, 13, 0);
      BattlePutTextOnWindow(rom.text("gText_BattleYesNoChoice"), C.B_WIN_YESNO);
      gBattleCommunication[0]++;
      gBattleCommunication[C.CURSOR_POSITION] = 0;
      BattleCreateYesNoCursorAt();
      break;
    case 1:
      if (JOY_NEW(DPAD_UP) && gBattleCommunication[C.CURSOR_POSITION] !== 0) {
        sound.playSE(C.SE_SELECT);
        BattleDestroyYesNoCursorAt();
        gBattleCommunication[C.CURSOR_POSITION] = 0;
        BattleCreateYesNoCursorAt();
      }
      if (JOY_NEW(DPAD_DOWN) && gBattleCommunication[C.CURSOR_POSITION] === 0) {
        sound.playSE(C.SE_SELECT);
        BattleDestroyYesNoCursorAt();
        gBattleCommunication[C.CURSOR_POSITION] = 1;
        BattleCreateYesNoCursorAt();
      }
      if (JOY_NEW(B_BUTTON)) {
        gBattleCommunication[C.CURSOR_POSITION] = 1;
        sound.playSE(C.SE_SELECT);
        HandleBattleWindow(23, 8, 29, 13, WINDOW_CLEAR);
        adv(1);
      } else if (JOY_NEW(A_BUTTON)) {
        sound.playSE(C.SE_SELECT);
        HandleBattleWindow(23, 8, 29, 13, WINDOW_CLEAR);
        adv(1);
      }
      break;
  }
}

export function Cmd_cancelallactions(): void {
  for (let i = 0; i < G.gBattlersCount; i++) gActionsByTurnOrder[i] = C.B_ACTION_CANCEL_PARTNER;
  adv(1);
}

export function Cmd_adjustsetdamage(): void {
  const t = G.gBattlerTarget;
  const [holdEffect, param] = holdEffectOf(t);
  G.gPotentialItemEffectBattler = t;
  if (holdEffect === C.HOLD_EFFECT_FOCUS_BAND && random() % 100 < param) {
    RecordItemEffectBattle(t, holdEffect);
    gSpecialStatuses[t].focusBanded = 1;
  }
  if (!(gBattleMons[t].status2 & C.STATUS2_SUBSTITUTE)
    && (gBattleMoves(G.gCurrentMove).effect === C.EFFECT_FALSE_SWIPE || gProtectStructs[t].endured || gSpecialStatuses[t].focusBanded)
    && gBattleMons[t].hp <= G.gBattleMoveDamage) {
    G.gBattleMoveDamage = gBattleMons[t].hp - 1;
    if (gProtectStructs[t].endured) {
      G.gMoveResultFlags |= C.MOVE_RESULT_FOE_ENDURED;
    } else if (gSpecialStatuses[t].focusBanded) {
      G.gMoveResultFlags |= C.MOVE_RESULT_FOE_HUNG_ON;
      G.gLastUsedItem = gBattleMons[t].item;
    }
  }
  adv(1);
}

export function Cmd_removeitem(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  const b = G.gActiveBattler;
  gBattleStruct.usedHeldItems[b] = gBattleMons[b].item;
  gBattleMons[b].item = C.ITEM_NONE;
  BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_HELDITEM_BATTLE, 0, 2, u16bytes(0));
  MarkBattlerForControllerExec(b);
  adv(2);
}

export function Cmd_atknameinbuff1(): void {
  PREPARE_MON_NICK_BUFFER(gBattleTextBuff1, G.gBattlerAttacker, gBattlerPartyIndexes[G.gBattlerAttacker]);
  adv(1);
}

export function IsMonGettingExpSentOut(): boolean {
  if (gBattlerPartyIndexes[0] === gBattleStruct.expGetterMonId) return true;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && gBattlerPartyIndexes[2] === gBattleStruct.expGetterMonId) return true;
  return false;
}

/** battle_script_commands.c DrawLevelUpWindow1: render the first stat page for the EXP recipient. */
function DrawLevelUpWindow1(): void {
  const curStats = GetMonLevelUpWindowStats(playerMon(gBattleStruct.expGetterMonId));
  DrawLevelUpWindowPg1(C.B_WIN_LEVEL_UP_BOX, gBattleResources.beforeLvlUp.stats, curStats, C.TEXT_DYNAMIC_COLOR_5, C.TEXT_DYNAMIC_COLOR_4, C.TEXT_DYNAMIC_COLOR_6);
}

/** battle_script_commands.c DrawLevelUpWindow2: render the second stat page for the EXP recipient. */
function DrawLevelUpWindow2(): void {
  const curStats = GetMonLevelUpWindowStats(playerMon(gBattleStruct.expGetterMonId));
  DrawLevelUpWindowPg2(C.B_WIN_LEVEL_UP_BOX, curStats, C.TEXT_DYNAMIC_COLOR_5, C.TEXT_DYNAMIC_COLOR_4, C.TEXT_DYNAMIC_COLOR_6);
}

export function Cmd_drawlvlupbox(): void {
  const s = gBattleScripting;
  if (s.drawlvlupboxState === 0) s.drawlvlupboxState = IsMonGettingExpSentOut() ? 3 : 1;
  switch (s.drawlvlupboxState) {
    case 1:
      G.gBattle_BG2_Y = 96;
      SetBgAttribute(2, BG_ATTR_PRIORITY, 0);
      ShowBg(2);
      InitLevelUpBanner();
      s.drawlvlupboxState = 2;
      break;
    case 2:
      if (!SlideInLevelUpBanner()) s.drawlvlupboxState = 3;
      break;
    case 3:
      G.gBattle_BG1_X = 0;
      G.gBattle_BG1_Y = 256;
      SetBgAttribute(0, BG_ATTR_PRIORITY, 1);
      SetBgAttribute(1, BG_ATTR_PRIORITY, 0);
      ShowBg(0);
      ShowBg(1);
      HandleBattleWindow(18, 7, 29, 19, WINDOW_BG1);
      s.drawlvlupboxState = 4;
      break;
    case 4: {
      DrawLevelUpWindow1();
      PutWindowTilemap(C.B_WIN_LEVEL_UP_BOX);
      CopyWindowToVram(C.B_WIN_LEVEL_UP_BOX, COPYWIN_FULL);
      s.drawlvlupboxState++;
      break;
    }
    case 5:
    case 7:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        G.gBattle_BG1_Y = 0;
        s.drawlvlupboxState++;
      }
      break;
    case 6:
      if (gMain.newKeys !== 0) {
        sound.playSE(C.SE_SELECT);
        DrawLevelUpWindow2();
        CopyWindowToVram(C.B_WIN_LEVEL_UP_BOX, COPYWIN_GFX);
        s.drawlvlupboxState++;
      }
      break;
    case 8:
      if (gMain.newKeys !== 0) {
        sound.playSE(C.SE_SELECT);
        HandleBattleWindow(18, 7, 29, 19, WINDOW_BG1 | WINDOW_CLEAR);
        s.drawlvlupboxState++;
      }
      break;
    case 9:
      if (!SlideOutLevelUpBanner()) {
        ClearWindowTilemap(C.B_WIN_LEVEL_UP_BANNER);
        CopyWindowToVram(C.B_WIN_LEVEL_UP_BANNER, COPYWIN_MAP);
        ClearWindowTilemap(C.B_WIN_LEVEL_UP_BOX);
        CopyWindowToVram(C.B_WIN_LEVEL_UP_BOX, COPYWIN_MAP);
        SetBgAttribute(2, BG_ATTR_PRIORITY, 2);
        ShowBg(2);
        s.drawlvlupboxState = 10;
      }
      break;
    case 10:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        SetBgAttribute(0, BG_ATTR_PRIORITY, 0);
        SetBgAttribute(1, BG_ATTR_PRIORITY, 1);
        ShowBg(0);
        ShowBg(1);
        adv(1);
      }
      break;
  }
}

function InitLevelUpBanner(): void {
  G.gBattle_BG2_Y = 0;
  G.gBattle_BG2_X = LEVEL_UP_BANNER_START;
  const pal = incbin16("sLevelUpBanner_Pal");
  LoadPalette(pal, BG_PLTT_ID(6), pal.length * 2);
  CopyToWindowPixelBuffer(C.B_WIN_LEVEL_UP_BANNER, incbin("sLevelUpBanner_Gfx"), 0, 0);
  PutWindowTilemap(C.B_WIN_LEVEL_UP_BANNER);
  CopyWindowToVram(C.B_WIN_LEVEL_UP_BANNER, COPYWIN_FULL);
  PutMonIconOnLvlUpBanner();
}

function SlideInLevelUpBanner(): boolean {
  if (IsDma3ManagerBusyWithBgCopy()) return true;
  if (G.gBattle_BG2_X === LEVEL_UP_BANNER_END) return false;
  if (G.gBattle_BG2_X === LEVEL_UP_BANNER_START) DrawLevelUpBannerText();
  G.gBattle_BG2_X += 8;
  if (G.gBattle_BG2_X >= LEVEL_UP_BANNER_END) G.gBattle_BG2_X = LEVEL_UP_BANNER_END;
  return G.gBattle_BG2_X !== LEVEL_UP_BANNER_END;
}

function DrawLevelUpBannerText(): void {
  const mon = playerMon(gBattleStruct.expGetterMonId);
  const monLevel = GetMonData(mon, C.MON_DATA_LEVEL);
  const monGender = GetMonGender(mon);
  const nick: number[] = [];
  GetMonData(mon, C.MON_DATA_NICKNAME, nick);
  const template = { windowId: C.B_WIN_LEVEL_UP_BANNER, fontId: FONT_SMALL, x: 32, y: 0, letterSpacing: 0, lineSpacing: 0, fgColor: TEXT_COLOR_WHITE, bgColor: TEXT_COLOR_TRANSPARENT, shadowColor: TEXT_COLOR_DARK_GRAY };
  AddTextPrinter(template, nick, TEXT_SKIP_DRAW, null);
  const str: number[] = new Array(32).fill(EOS);
  str[0] = C.CHAR_EXTRA_SYMBOL;
  str[1] = C.CHAR_LV_2;
  str[2] = 0;
  let p = 3;
  for (const d of intToDecimal(monLevel, STR_CONV_MODE_LEFT_ALIGN, 3)) {
    if (d === EOS) break;
    str[p++] = d;
  }
  for (let k = 0; k < 5; k++) str[p++] = 0;
  str[p] = EOS;
  if (monGender !== C.MON_GENDERLESS) {
    p = 7;
    const codes = monGender === C.MON_MALE
      ? [C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_COLOR, C.TEXT_DYNAMIC_COLOR_3, C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_SHADOW, C.TEXT_DYNAMIC_COLOR_4, C.CHAR_MALE]
      : [C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_COLOR, C.TEXT_DYNAMIC_COLOR_5, C.EXT_CTRL_CODE_BEGIN, C.EXT_CTRL_CODE_SHADOW, C.TEXT_DYNAMIC_COLOR_6, C.CHAR_FEMALE];
    for (const c of codes) str[p++] = c;
    str[p++] = EOS;
  }
  AddTextPrinter({ ...template, y: 10 }, str, TEXT_SKIP_DRAW, null);
  CopyWindowToVram(C.B_WIN_LEVEL_UP_BANNER, COPYWIN_GFX);
  void encode;
}

function SlideOutLevelUpBanner(): boolean {
  if (G.gBattle_BG2_X === LEVEL_UP_BANNER_START) return false;
  if (G.gBattle_BG2_X - 16 < LEVEL_UP_BANNER_START) G.gBattle_BG2_X = LEVEL_UP_BANNER_START;
  else G.gBattle_BG2_X -= 16;
  return G.gBattle_BG2_X !== LEVEL_UP_BANNER_START;
}

const SpriteCB_MonIconOnLvlUpBanner = (sprite: Sprite): void => {
  sprite.x2 = sprite.data[1] - G.gBattle_BG2_X;
  if (sprite.x2 !== 0) {
    sprite.data[0] = 1;
  } else if (sprite.data[0]) {
    DestroySprite(sprite);
    FreeSpriteTilesByTag(TAG_LVLUP_BANNER_MON_ICON);
    FreeSpritePaletteByTag(TAG_LVLUP_BANNER_MON_ICON);
  }
};

const sSpriteTemplate_MonIconOnLvlUpBanner: SpriteTemplate = {
  tileTag: TAG_LVLUP_BANNER_MON_ICON,
  paletteTag: TAG_LVLUP_BANNER_MON_ICON,
  oam: oamData({ shape: SPRITE_SHAPE("32x32"), size: SPRITE_SIZE("32x32"), priority: 0 }),
  anims: gDummySpriteAnimTable,
  images: null,
  affineAnims: gDummySpriteAffineAnimTable,
  callback: SpriteCB_MonIconOnLvlUpBanner,
};

function PutMonIconOnLvlUpBanner(): void {
  const mon = playerMon(gBattleStruct.expGetterMonId);
  const species = GetMonData(mon, C.MON_DATA_SPECIES);
  const personality = GetMonData(mon, C.MON_DATA_PERSONALITY);
  LoadSpriteSheet({ data: GetMonIconPtr(species, personality, 1), size: 0x200, tag: TAG_LVLUP_BANNER_MON_ICON });
  LoadSpritePalette({ data: GetValidMonIconPalettePtr(species), tag: TAG_LVLUP_BANNER_MON_ICON });
  const spriteId = CreateSprite(sSpriteTemplate_MonIconOnLvlUpBanner, 256, 10, 0);
  gSprites[spriteId].data[0] = 0;
  gSprites[spriteId].data[1] = G.gBattle_BG2_X;
}

export function Cmd_resetsentmonsvalue(): void {
  ResetSentPokesToOpponentValue();
  adv(1);
}

export function Cmd_setatktoplayer0(): void {
  G.gBattlerAttacker = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
  adv(1);
}

export function Cmd_makevisible(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  BtlController_EmitSpriteInvisibility(BUFFER_A, false);
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(2);
}

export function Cmd_recordlastability(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  RecordAbilityBattle(G.gActiveBattler, G.gLastUsedAbility);
  adv(1); // original bug: the battler byte is re-read as the next command
}

export function BufferMoveToLearnIntoBattleTextBuff2(): void {
  PREPARE_MOVE_BUFFER(gBattleTextBuff2, G.gMoveToLearn);
}

export function Cmd_buffermovetolearn(): void {
  BufferMoveToLearnIntoBattleTextBuff2();
  adv(1);
}

export function Cmd_jumpifplayerran(): void {
  if (TryRunFromBattle(G.gBattlerFainted)) G.gBattlescriptCurrInstr = r32(cur() + 1);
  else adv(5);
}

export function Cmd_hpthresholds(): void {
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE)) {
    G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
    const opp = G.gActiveBattler ^ C.BIT_SIDE;
    let result = div(gBattleMons[opp].hp * 100, gBattleMons[opp].maxHP);
    if (result === 0) result = 1;
    if (result > 69 || gBattleMons[opp].hp === 0) gBattleStruct.hpScale = 0;
    else if (result > 39) gBattleStruct.hpScale = 1;
    else if (result > 9) gBattleStruct.hpScale = 2;
    else gBattleStruct.hpScale = 3;
  }
  adv(2);
}

export function Cmd_hpthresholds2(): void {
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE)) {
    G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
    const opp = G.gActiveBattler ^ C.BIT_SIDE;
    const hpSwitchout = gBattleStruct.hpOnSwitchout[GetBattlerSide(opp)] & 0xff;
    const result = hpSwitchout ? div((hpSwitchout - gBattleMons[opp].hp) * 100, hpSwitchout) : 0;
    if (gBattleMons[opp].hp >= hpSwitchout) gBattleStruct.hpScale = 0;
    else if (result <= 29) gBattleStruct.hpScale = 1;
    else if (result <= 69) gBattleStruct.hpScale = 2;
    else gBattleStruct.hpScale = 3;
  }
  adv(2);
}

export function Cmd_useitemonopponent(): void {
  G.gBattlerInMenuId = G.gBattlerAttacker;
  PokemonUseItemEffects(gEnemyParty[gBattlerPartyIndexes[G.gBattlerAttacker]], G.gLastUsedItem, gBattlerPartyIndexes[G.gBattlerAttacker], 0, true);
  adv(1);
}

export function Cmd_various(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  switch (r8(cur() + 2)) {
    case C.VARIOUS_CANCEL_MULTI_TURN_MOVES:
      CancelMultiTurnMoves(G.gActiveBattler);
      break;
    case C.VARIOUS_SET_MAGIC_COAT_TARGET: {
      G.gBattlerAttacker = G.gBattlerTarget;
      const side = GetBattlerSide(G.gBattlerAttacker) ^ C.BIT_SIDE;
      if (gSideTimers[side].followmeTimer !== 0 && gBattleMons[gSideTimers[side].followmeTarget].hp !== 0) G.gBattlerTarget = gSideTimers[side].followmeTarget;
      else G.gBattlerTarget = G.gActiveBattler;
      break;
    }
    case C.VARIOUS_IS_RUNNING_IMPOSSIBLE:
      gBattleCommunication[0] = IsRunningFromBattleImpossible();
      break;
    case C.VARIOUS_GET_MOVE_TARGET:
      G.gBattlerTarget = GetMoveTarget(G.gCurrentMove, C.NO_TARGET_OVERRIDE);
      break;
    case C.VARIOUS_GET_BATTLER_FAINTED:
      gBattleCommunication[0] = G.gHitMarker & HITMARKER_FAINTED(G.gActiveBattler) ? 1 : 0;
      break;
    case C.VARIOUS_RESET_INTIMIDATE_TRACE_BITS:
      gSpecialStatuses[G.gActiveBattler].intimidatedMon = 0;
      gSpecialStatuses[G.gActiveBattler].traced = 0;
      break;
    case C.VARIOUS_UPDATE_CHOICE_MOVE_ON_LVL_UP:
      if (gBattlerPartyIndexes[0] === gBattleStruct.expGetterMonId || gBattlerPartyIndexes[2] === gBattleStruct.expGetterMonId) {
        G.gActiveBattler = gBattlerPartyIndexes[0] === gBattleStruct.expGetterMonId ? 0 : 2;
        const choiced = gBattleStruct.choicedMove;
        let i = 0;
        for (; i < 4; i++) if (gBattleMons[G.gActiveBattler].moves[i] === choiced[G.gActiveBattler]) break;
        if (i === 4) choiced[G.gActiveBattler] = C.MOVE_NONE;
      }
      break;
    case C.VARIOUS_RESET_PLAYER_FAINTED:
      if (!(G.gBattleTypeFlags & (C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_DOUBLE)) && G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER && gBattleMons[0].hp !== 0 && gBattleMons[1].hp !== 0)
        G.gHitMarker &= ~C.HITMARKER_PLAYER_FAINTED;
      break;
    case C.VARIOUS_GET_BATTLERS_FOR_RECALL: {
      gBattleCommunication[C.MULTISTRING_CHOOSER] = 0;
      let i = 0;
      for (G.gActiveBattler = 1; G.gActiveBattler < 4; G.gActiveBattler += 2) {
        if (G.gActiveBattler < G.gBattlersCount && gBattleMons[G.gActiveBattler].hp !== 0) gBattleCommunication[C.MULTISTRING_CHOOSER] |= gBitTable[i];
        i++;
      }
      break;
    }
    case C.VARIOUS_RETURN_OPPONENT_MON1:
      G.gActiveBattler = 1;
      if (gBattleMons[1].hp !== 0) {
        BtlController_EmitReturnMonToBall(BUFFER_A, false);
        MarkBattlerForControllerExec(1);
      }
      break;
    case C.VARIOUS_RETURN_OPPONENT_MON2:
      if (G.gBattlersCount > 3) {
        G.gActiveBattler = 3;
        if (gBattleMons[3].hp !== 0) {
          BtlController_EmitReturnMonToBall(BUFFER_A, false);
          MarkBattlerForControllerExec(3);
        }
      }
      break;
    case C.VARIOUS_CHECK_POKEFLUTE: {
      gBattleCommunication[C.MULTISTRING_CHOOSER] = 0;
      for (let i = 0; i < G.gBattlersCount; i++) {
        if (gBattleMons[i].ability !== C.ABILITY_SOUNDPROOF) {
          gBattleMons[i].status1 &= ~C.STATUS1_SLEEP;
          gBattleMons[i].status2 &= ~C.STATUS2_NIGHTMARE;
        }
      }
      const check = (party: (i: number) => Mon) => {
        let mask = 0;
        for (let i = 0; i < 6; i++) {
          const mon = party(i);
          const species = GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG);
          const abilityNum = GetMonData(mon, C.MON_DATA_ABILITY_NUM);
          const status = GetMonData(mon, C.MON_DATA_STATUS);
          if (species !== C.SPECIES_NONE && species !== C.SPECIES_EGG && status & C.AILMENT_FNT && GetAbilityBySpecies(species, abilityNum) !== C.ABILITY_SOUNDPROOF) mask |= 1 << i;
        }
        return mask;
      };
      let mask = check(playerMon);
      if (mask) {
        G.gActiveBattler = GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT);
        BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_STATUS_BATTLE, mask, 4, u32bytes(0));
        MarkBattlerForControllerExec(G.gActiveBattler);
        gBattleCommunication[C.MULTISTRING_CHOOSER] = 1;
      }
      mask = check((i) => gEnemyParty[i]);
      if (mask) {
        G.gActiveBattler = GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT);
        BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_STATUS_BATTLE, mask, 4, u32bytes(0));
        MarkBattlerForControllerExec(G.gActiveBattler);
        gBattleCommunication[5] = 1;
      }
      break;
    }
    case C.VARIOUS_WAIT_FANFARE:
      if (!IsFanfareTaskInactive()) return;
      break;
  }
  adv(3);
}

export function Cmd_setprotectlike(): void {
  let notLastTurn = true;
  const a = G.gBattlerAttacker;
  const lastMove = gLastResultingMoves[a];
  if (lastMove !== C.MOVE_PROTECT && lastMove !== C.MOVE_DETECT && lastMove !== C.MOVE_ENDURE) gDisableStructs[a].protectUses = 0;
  if (G.gCurrentTurnActionNumber === G.gBattlersCount - 1) notLastTurn = false;
  if (T.protectSuccessRates[gDisableStructs[a].protectUses] >= random() && notLastTurn) {
    if (gBattleMoves(G.gCurrentMove).effect === C.EFFECT_PROTECT) {
      gProtectStructs[a].protected = 1;
      gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_PROTECTED_ITSELF;
    }
    if (gBattleMoves(G.gCurrentMove).effect === C.EFFECT_ENDURE) {
      gProtectStructs[a].endured = 1;
      gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_BRACED_ITSELF;
    }
    gDisableStructs[a].protectUses++;
  } else {
    gDisableStructs[a].protectUses = 0;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_PROTECT_FAILED;
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
  }
  adv(1);
}

export function Cmd_tryexplosion(): void {
  if (G.gBattleControllerExecFlags) return;
  for (G.gBattlerTarget = 0; G.gBattlerTarget < G.gBattlersCount; G.gBattlerTarget++) if (gBattleMons[G.gBattlerTarget].ability === C.ABILITY_DAMP) break;
  if (G.gBattlerTarget === G.gBattlersCount) {
    G.gActiveBattler = G.gBattlerAttacker;
    G.gBattleMoveDamage = gBattleMons[G.gActiveBattler].hp;
    BtlController_EmitHealthBarUpdate(BUFFER_A, C.INSTANT_HP_BAR_DROP);
    MarkBattlerForControllerExec(G.gActiveBattler);
    adv(1);
    for (G.gBattlerTarget = 0; G.gBattlerTarget < G.gBattlersCount; G.gBattlerTarget++) {
      if (G.gBattlerTarget === G.gBattlerAttacker) continue;
      if (!(G.gAbsentBattlerFlags & gBitTable[G.gBattlerTarget])) break;
    }
  } else {
    G.gLastUsedAbility = C.ABILITY_DAMP;
    RecordAbilityBattle(G.gBattlerTarget, gBattleMons[G.gBattlerTarget].ability);
    G.gBattlescriptCurrInstr = BS("BattleScript_DampStopsExplosion");
  }
}

export function Cmd_setatkhptozero(): void {
  if (G.gBattleControllerExecFlags) return;
  G.gActiveBattler = G.gBattlerAttacker;
  gBattleMons[G.gActiveBattler].hp = 0;
  BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_HP_BATTLE, 0, 2, u16bytes(0));
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(1);
}

export function Cmd_jumpifnexttargetvalid(): void {
  const jump = r32(cur() + 1);
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
    for (G.gBattlerTarget++; ; G.gBattlerTarget++) {
      if (G.gBattlerTarget === G.gBattlerAttacker) continue;
      if (!(G.gAbsentBattlerFlags & gBitTable[G.gBattlerTarget])) break;
    }
    if (G.gBattlerTarget >= G.gBattlersCount) adv(5);
    else G.gBattlescriptCurrInstr = jump;
  } else {
    adv(5);
  }
}

export function Cmd_tryhealhalfhealth(): void {
  const fail = r32(cur() + 1);
  if (r8(cur() + 5) === C.BS_ATTACKER) G.gBattlerTarget = G.gBattlerAttacker;
  G.gBattleMoveDamage = div(gBattleMons[G.gBattlerTarget].maxHP, 2);
  if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
  G.gBattleMoveDamage *= -1;
  if (gBattleMons[G.gBattlerTarget].hp === gBattleMons[G.gBattlerTarget].maxHP) G.gBattlescriptCurrInstr = fail;
  else adv(6);
}

export function Cmd_trymirrormove(): void {
  const valid: number[] = [];
  const from = gBattleStruct.lastTakenMoveFrom;
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (i !== G.gBattlerAttacker) {
      const o = i * 2 + G.gBattlerAttacker * 8;
      const move = from[o] | (from[o + 1] << 8);
      if (move !== C.MOVE_NONE && move !== C.MOVE_UNAVAILABLE) valid.push(move);
    }
  }
  const ltm = gBattleStruct.lastTakenMove;
  const move = ltm[G.gBattlerAttacker * 2] | (ltm[G.gBattlerAttacker * 2 + 1] << 8);
  if (move !== C.MOVE_NONE && move !== C.MOVE_UNAVAILABLE) {
    G.gHitMarker &= ~C.HITMARKER_ATTACKSTRING_PRINTED;
    G.gCurrentMove = move;
    G.gBattlerTarget = GetMoveTarget(G.gCurrentMove, C.NO_TARGET_OVERRIDE);
    G.gBattlescriptCurrInstr = scriptTable("gBattleScriptsForMoveEffects", gBattleMoves(G.gCurrentMove).effect);
  } else if (valid.length !== 0) {
    G.gHitMarker &= ~C.HITMARKER_ATTACKSTRING_PRINTED;
    G.gCurrentMove = valid[random() % valid.length];
    G.gBattlerTarget = GetMoveTarget(G.gCurrentMove, C.NO_TARGET_OVERRIDE);
    G.gBattlescriptCurrInstr = scriptTable("gBattleScriptsForMoveEffects", gBattleMoves(G.gCurrentMove).effect);
  } else {
    gSpecialStatuses[G.gBattlerAttacker].ppNotAffectedByPressure = 1;
    adv(1);
  }
}

export function Cmd_setrain(): void {
  if (G.gBattleWeather & C.B_WEATHER_RAIN) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_WEATHER_FAILED;
  } else {
    G.gBattleWeather = C.B_WEATHER_RAIN_TEMPORARY;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STARTED_RAIN;
    gWishFutureKnock.weatherDuration = 5;
  }
  adv(1);
}

export function Cmd_setreflect(): void {
  const side = GET_BATTLER_SIDE(G.gBattlerAttacker);
  if (gSideStatuses[side] & C.SIDE_STATUS_REFLECT) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SIDE_STATUS_FAILED;
  } else {
    gSideStatuses[side] |= C.SIDE_STATUS_REFLECT;
    gSideTimers[side].reflectTimer = 5;
    gSideTimers[side].reflectBattlerId = G.gBattlerAttacker;
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && CountAliveMonsInBattle(C.BATTLE_ALIVE_ATK_SIDE) === 2) gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SET_REFLECT_DOUBLE;
    else gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SET_REFLECT_SINGLE;
  }
  adv(1);
}

export function Cmd_setseeded(): void {
  const t = G.gBattlerTarget;
  if (G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT || gStatuses3[t] & C.STATUS3_LEECHSEED) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_LEECH_SEED_MISS;
  } else if (IS_BATTLER_OF_TYPE(t, C.TYPE_GRASS)) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_LEECH_SEED_FAIL;
  } else {
    gStatuses3[t] |= G.gBattlerAttacker;
    gStatuses3[t] |= C.STATUS3_LEECHSEED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_LEECH_SEED_SET;
  }
  adv(1);
}

export function Cmd_manipulatedamage(): void {
  switch (r8(cur() + 1)) {
    case C.DMG_CHANGE_SIGN:
      G.gBattleMoveDamage *= -1;
      break;
    case C.DMG_RECOIL_FROM_MISS:
      G.gBattleMoveDamage = div(G.gBattleMoveDamage, 2);
      if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
      if (div(gBattleMons[G.gBattlerTarget].maxHP, 2) < G.gBattleMoveDamage) G.gBattleMoveDamage = div(gBattleMons[G.gBattlerTarget].maxHP, 2);
      break;
    case C.DMG_DOUBLED:
      G.gBattleMoveDamage *= 2;
      break;
  }
  adv(2);
}

export function Cmd_trysetrest(): void {
  const fail = r32(cur() + 1);
  G.gActiveBattler = G.gBattlerTarget = G.gBattlerAttacker;
  const t = G.gBattlerTarget;
  G.gBattleMoveDamage = gBattleMons[t].maxHP * -1;
  if (gBattleMons[t].hp === gBattleMons[t].maxHP) {
    G.gBattlescriptCurrInstr = fail;
  } else {
    if (gBattleMons[t].status1 & (~C.STATUS1_SLEEP & 0xff)) gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_REST_STATUSED;
    else gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_REST;
    gBattleMons[t].status1 = STATUS1_SLEEP_TURN(3);
    BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_STATUS_BATTLE, 0, 4, u32bytes(gBattleMons[t].status1));
    MarkBattlerForControllerExec(G.gActiveBattler);
    adv(5);
  }
}

export function Cmd_jumpifnotfirstturn(): void {
  const fail = r32(cur() + 1);
  if (gDisableStructs[G.gBattlerAttacker].isFirstTurn) adv(5);
  else G.gBattlescriptCurrInstr = fail;
}

export function Cmd_nop(): void {
  adv(1);
}

export function UproarWakeUpCheck(battlerId: number): boolean {
  let i = 0;
  for (; i < G.gBattlersCount; i++) {
    if (!(gBattleMons[i].status2 & C.STATUS2_UPROAR) || gBattleMons[battlerId].ability === C.ABILITY_SOUNDPROOF) continue;
    gBattleScripting.battler = i;
    if (G.gBattlerTarget === 0xff) G.gBattlerTarget = i;
    else if (G.gBattlerTarget === i) gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_CANT_SLEEP_UPROAR;
    else gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_UPROAR_KEPT_AWAKE;
    break;
  }
  return i !== G.gBattlersCount;
}

export function Cmd_jumpifcantmakeasleep(): void {
  const jump = r32(cur() + 1);
  const t = G.gBattlerTarget;
  if (UproarWakeUpCheck(t)) {
    G.gBattlescriptCurrInstr = jump;
  } else if (gBattleMons[t].ability === C.ABILITY_INSOMNIA || gBattleMons[t].ability === C.ABILITY_VITAL_SPIRIT) {
    G.gLastUsedAbility = gBattleMons[t].ability;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STAYED_AWAKE_USING;
    G.gBattlescriptCurrInstr = jump;
    RecordAbilityBattle(t, G.gLastUsedAbility);
  } else {
    adv(5);
  }
}

export function Cmd_stockpile(): void {
  const a = G.gBattlerAttacker;
  if (gDisableStructs[a].stockpileCounter === 3) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_CANT_STOCKPILE;
  } else {
    gDisableStructs[a].stockpileCounter++;
    PREPARE_BYTE_NUMBER_BUFFER(gBattleTextBuff1, 1, gDisableStructs[a].stockpileCounter);
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STOCKPILED;
  }
  adv(1);
}

export function Cmd_stockpiletobasedamage(): void {
  const jump = r32(cur() + 1);
  const a = G.gBattlerAttacker;
  if (gDisableStructs[a].stockpileCounter === 0) {
    G.gBattlescriptCurrInstr = jump;
  } else {
    if (gBattleCommunication[C.MISS_TYPE] !== C.B_MSG_PROTECTED) {
      G.gBattleMoveDamage = CalculateBaseDamage(gBattleMons[a], gBattleMons[G.gBattlerTarget], G.gCurrentMove, gSideStatuses[GET_BATTLER_SIDE(G.gBattlerTarget)], 0, 0, a, G.gBattlerTarget)
        * gDisableStructs[a].stockpileCounter;
      gBattleScripting.animTurn = gDisableStructs[a].stockpileCounter;
      if (gProtectStructs[a].helpingHand) G.gBattleMoveDamage = div(G.gBattleMoveDamage * 15, 10);
    }
    gDisableStructs[a].stockpileCounter = 0;
    adv(5);
  }
}

export function Cmd_stockpiletohpheal(): void {
  const jump = r32(cur() + 1);
  const a = G.gBattlerAttacker;
  if (gDisableStructs[a].stockpileCounter === 0) {
    G.gBattlescriptCurrInstr = jump;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SWALLOW_FAILED;
  } else if (gBattleMons[a].maxHP === gBattleMons[a].hp) {
    gDisableStructs[a].stockpileCounter = 0;
    G.gBattlescriptCurrInstr = jump;
    G.gBattlerTarget = a;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SWALLOW_FULL_HP;
  } else {
    G.gBattleMoveDamage = div(gBattleMons[a].maxHP, 1 << (3 - gDisableStructs[a].stockpileCounter));
    if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
    G.gBattleMoveDamage *= -1;
    gBattleScripting.animTurn = gDisableStructs[a].stockpileCounter;
    gDisableStructs[a].stockpileCounter = 0;
    adv(5);
    G.gBattlerTarget = a;
  }
}

export function Cmd_negativedamage(): void {
  G.gBattleMoveDamage = -div(G.gHpDealt, 2);
  if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = -1;
  adv(1);
}

const STAT_CHANGE_WORKED = 0;
const STAT_CHANGE_DIDNT_WORK = 1;

function JumpIfMoveAffectedByProtect(move: number): boolean {
  if (gProtectStructs[G.gBattlerTarget].protected && gBattleMoves(G.gCurrentMove).flags & C.FLAG_PROTECT_AFFECTED) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    JumpIfMoveFailed(7, move);
    gBattleCommunication[C.MISS_TYPE] = C.B_MSG_PROTECTED;
    return true;
  }
  return false;
}

function statText(stringIds: number[]): void {
  gBattleTextBuff2[0] = B_BUFF_PLACEHOLDER_BEGIN;
  let index = 1;
  for (const id of stringIds) {
    gBattleTextBuff2[index++] = B_BUFF_STRING;
    gBattleTextBuff2[index++] = id & 0xff;
    gBattleTextBuff2[index++] = (id >> 8) & 0xff;
  }
  gBattleTextBuff2[index] = B_BUFF_EOS;
}

export function ChangeStatBuffs(statValue: number, statId: number, flags: number, BS_ptr: number): number {
  statValue = (statValue << 24) >> 24;
  let certain = false;
  let notProtectAffected = false;
  G.gActiveBattler = flags & C.MOVE_EFFECT_AFFECTS_USER ? G.gBattlerAttacker : G.gBattlerTarget;
  const b = G.gActiveBattler;
  flags &= ~C.MOVE_EFFECT_AFFECTS_USER;
  if (flags & C.MOVE_EFFECT_CERTAIN) certain = true;
  flags &= ~C.MOVE_EFFECT_CERTAIN;
  if (flags & C.STAT_CHANGE_NOT_PROTECT_AFFECTED) notProtectAffected = true;
  flags &= ~C.STAT_CHANGE_NOT_PROTECT_AFFECTED;
  PREPARE_STAT_BUFFER(gBattleTextBuff1, statId);
  if (statValue <= -1) {
    if (gSideTimers[GET_BATTLER_SIDE(b)].mistTimer && !certain && G.gCurrentMove !== C.MOVE_CURSE) {
      if (flags === C.STAT_CHANGE_ALLOW_PTR) {
        if (gSpecialStatuses[b].statLowered) {
          G.gBattlescriptCurrInstr = BS_ptr;
        } else {
          BattleScriptPush(BS_ptr);
          gBattleScripting.battler = b;
          G.gBattlescriptCurrInstr = BS("BattleScript_MistProtected");
          gSpecialStatuses[b].statLowered = 1;
        }
      }
      return STAT_CHANGE_DIDNT_WORK;
    } else if (G.gCurrentMove !== C.MOVE_CURSE && !notProtectAffected && JumpIfMoveAffectedByProtect(0)) {
      G.gBattlescriptCurrInstr = BS("BattleScript_ButItFailed");
      return STAT_CHANGE_DIDNT_WORK;
    } else if ((gBattleMons[b].ability === C.ABILITY_CLEAR_BODY || gBattleMons[b].ability === C.ABILITY_WHITE_SMOKE) && !certain && G.gCurrentMove !== C.MOVE_CURSE) {
      if (flags === C.STAT_CHANGE_ALLOW_PTR) {
        if (gSpecialStatuses[b].statLowered) {
          G.gBattlescriptCurrInstr = BS_ptr;
        } else {
          BattleScriptPush(BS_ptr);
          gBattleScripting.battler = b;
          G.gBattlescriptCurrInstr = BS("BattleScript_AbilityNoStatLoss");
          G.gLastUsedAbility = gBattleMons[b].ability;
          RecordAbilityBattle(b, G.gLastUsedAbility);
          gSpecialStatuses[b].statLowered = 1;
        }
      }
      return STAT_CHANGE_DIDNT_WORK;
    } else if ((gBattleMons[b].ability === C.ABILITY_KEEN_EYE && !certain && statId === C.STAT_ACC)
      || (gBattleMons[b].ability === C.ABILITY_HYPER_CUTTER && !certain && statId === C.STAT_ATK)) {
      if (flags === C.STAT_CHANGE_ALLOW_PTR) {
        BattleScriptPush(BS_ptr);
        gBattleScripting.battler = b;
        G.gBattlescriptCurrInstr = BS("BattleScript_AbilityNoSpecificStatLoss");
        G.gLastUsedAbility = gBattleMons[b].ability;
        RecordAbilityBattle(b, G.gLastUsedAbility);
      }
      return STAT_CHANGE_DIDNT_WORK;
    } else if (gBattleMons[b].ability === C.ABILITY_SHIELD_DUST && flags === 0) {
      return STAT_CHANGE_DIDNT_WORK;
    } else {
      statValue = -GET_STAT_BUFF_VALUE(statValue);
      statText(statValue === -2 ? [C.STRINGID_STATHARSHLY, C.STRINGID_STATFELL] : [C.STRINGID_STATFELL]);
      if (gBattleMons[b].statStages[statId] === C.MIN_STAT_STAGE) gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STAT_WONT_DECREASE;
      else gBattleCommunication[C.MULTISTRING_CHOOSER] = G.gBattlerTarget === b ? 1 : 0;
    }
  } else {
    statValue = GET_STAT_BUFF_VALUE(statValue);
    statText(statValue === 2 ? [C.STRINGID_STATSHARPLY, C.STRINGID_STATROSE] : [C.STRINGID_STATROSE]);
    if (gBattleMons[b].statStages[statId] === C.MAX_STAT_STAGE) gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STAT_WONT_INCREASE;
    else gBattleCommunication[C.MULTISTRING_CHOOSER] = G.gBattlerTarget === b ? 1 : 0;
  }
  gBattleMons[b].statStages[statId] += statValue;
  if (gBattleMons[b].statStages[statId] < C.MIN_STAT_STAGE) gBattleMons[b].statStages[statId] = C.MIN_STAT_STAGE;
  if (gBattleMons[b].statStages[statId] > C.MAX_STAT_STAGE) gBattleMons[b].statStages[statId] = C.MAX_STAT_STAGE;
  if (gBattleCommunication[C.MULTISTRING_CHOOSER] === C.B_MSG_STAT_WONT_INCREASE && flags & C.STAT_CHANGE_ALLOW_PTR) G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
  if (gBattleCommunication[C.MULTISTRING_CHOOSER] === C.B_MSG_STAT_WONT_INCREASE && !(flags & C.STAT_CHANGE_ALLOW_PTR)) return STAT_CHANGE_DIDNT_WORK;
  return STAT_CHANGE_WORKED;
}

export function Cmd_statbuffchange(): void {
  const jump = r32(cur() + 2);
  if (ChangeStatBuffs(gBattleScripting.statChanger & 0xf0, GET_STAT_BUFF_ID(gBattleScripting.statChanger), r8(cur() + 1), jump) === STAT_CHANGE_WORKED) adv(6);
}

export function Cmd_normalisebuffs(): void {
  for (let i = 0; i < G.gBattlersCount; i++) for (let j = 0; j < C.NUM_BATTLE_STATS; j++) gBattleMons[i].statStages[j] = C.DEFAULT_STAT_STAGE;
  adv(1);
}

export function Cmd_setbide(): void {
  const a = G.gBattlerAttacker;
  gBattleMons[a].status2 |= C.STATUS2_MULTIPLETURNS;
  gLockedMoves[a] = G.gCurrentMove;
  gTakenDmg[a] = 0;
  gBattleMons[a].status2 |= STATUS2_BIDE_TURN(2);
  adv(1);
}

export function Cmd_confuseifrepeatingattackends(): void {
  if (!(gBattleMons[G.gBattlerAttacker].status2 & C.STATUS2_LOCK_CONFUSE)) gBattleCommunication[C.MOVE_EFFECT_BYTE] = C.MOVE_EFFECT_THRASH | C.MOVE_EFFECT_AFFECTS_USER;
  adv(1);
}

export function Cmd_setmultihitcounter(): void {
  const v = r8(cur() + 1);
  if (v) {
    G.gMultiHitCounter = v;
  } else {
    G.gMultiHitCounter = random() & 3;
    if (G.gMultiHitCounter > 1) G.gMultiHitCounter = (random() & 3) + 2;
    else G.gMultiHitCounter += 2;
  }
  adv(2);
}

export function Cmd_initmultihitstring(): void {
  PREPARE_BYTE_NUMBER_BUFFER(gBattleScripting.multihitString, 1, 0);
  adv(1);
}

function TryDoForceSwitchOut(): boolean {
  const a = G.gBattlerAttacker;
  const t = G.gBattlerTarget;
  if (gBattleMons[a].level >= gBattleMons[t].level) {
    gBattleStruct.battlerPartyIndexes[t] = gBattlerPartyIndexes[t];
  } else {
    const rnd = random() & 0xff;
    if ((((rnd * (gBattleMons[a].level + gBattleMons[t].level)) >> 8) + 1) <= div(gBattleMons[t].level, 4)) {
      G.gBattlescriptCurrInstr = r32(cur() + 1);
      return false;
    }
    gBattleStruct.battlerPartyIndexes[t] = gBattlerPartyIndexes[t];
  }
  G.gBattlescriptCurrInstr = BS("BattleScript_SuccessForceOut");
  return true;
}

const MON_CAN_BATTLE = (mon: Mon) => !!(GetMonData(mon, C.MON_DATA_SPECIES) && GetMonData(mon, C.MON_DATA_IS_EGG) !== 1 && GetMonData(mon, C.MON_DATA_HP));

export function Cmd_forcerandomswitch(): void {
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) {
    const party = partyOf(G.gBattlerTarget);
    let valid = 0;
    for (let i = 0; i < 6; i++) {
      const mon = party(i);
      if (GetMonData(mon, C.MON_DATA_SPECIES) !== C.SPECIES_NONE && !GetMonData(mon, C.MON_DATA_IS_EGG) && GetMonData(mon, C.MON_DATA_HP) !== 0) valid++;
    }
    if ((valid < 2 && (G.gBattleTypeFlags & (C.BATTLE_TYPE_DOUBLE | C.BATTLE_TYPE_MULTI)) !== C.BATTLE_TYPE_DOUBLE)
      || (valid < 3 && (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) && !(G.gBattleTypeFlags & C.BATTLE_TYPE_MULTI))) {
      G.gBattlescriptCurrInstr = r32(cur() + 1);
    } else if (TryDoForceSwitchOut()) {
      let i: number;
      const t = G.gBattlerTarget;
      if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
        do i = random() % 6;
        while (i === gBattlerPartyIndexes[t] || i === gBattlerPartyIndexes[t ^ 2] || !MON_CAN_BATTLE(party(i)));
      } else {
        do i = random() % 6;
        while (i === gBattlerPartyIndexes[t] || !MON_CAN_BATTLE(party(i)));
      }
      gBattleStruct.monToSwitchIntoId[t] = i;
      UpdatePartyOwnerOnSwitch_NonMulti(t);
    }
  } else {
    TryDoForceSwitchOut();
  }
}

export function Cmd_tryconversiontypechange(): void {
  const a = G.gBattlerAttacker;
  let validMoves = 0;
  while (validMoves < 4) {
    if (gBattleMons[a].moves[validMoves] === C.MOVE_NONE) break;
    validMoves++;
  }
  const typeOf = (slot: number) => {
    let t = gBattleMoves(gBattleMons[a].moves[slot]).type;
    if (t === C.TYPE_MYSTERY) t = IS_BATTLER_OF_TYPE(a, C.TYPE_GHOST) ? C.TYPE_GHOST : C.TYPE_NORMAL;
    return t;
  };
  let moveChecked = 0;
  for (; moveChecked < validMoves; moveChecked++) {
    const t = typeOf(moveChecked);
    if (t !== gBattleMons[a].type1 && t !== gBattleMons[a].type2) break;
  }
  if (moveChecked === validMoves) {
    G.gBattlescriptCurrInstr = r32(cur() + 1);
  } else {
    let moveType: number;
    do {
      while ((moveChecked = random() & 3) >= validMoves) { /* retry */ }
      moveType = typeOf(moveChecked);
    } while (moveType === gBattleMons[a].type1 || moveType === gBattleMons[a].type2);
    SET_BATTLER_TYPE(a, moveType);
    PREPARE_TYPE_BUFFER(gBattleTextBuff1, moveType);
    adv(5);
  }
}

export function Cmd_givepaydaymoney(): void {
  if (!(G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) && G.gPaydayMoney !== 0) {
    const bonus = G.gPaydayMoney * gBattleStruct.moneyMultiplier;
    AddMoney(bonus);
    PREPARE_HWORD_NUMBER_BUFFER(gBattleTextBuff1, 5, bonus);
    BattleScriptPush(cur() + 1);
    G.gBattlescriptCurrInstr = BS("BattleScript_PrintPayDayMoneyString");
  } else {
    adv(1);
  }
}

export function Cmd_setlightscreen(): void {
  const side = GET_BATTLER_SIDE(G.gBattlerAttacker);
  if (gSideStatuses[side] & C.SIDE_STATUS_LIGHTSCREEN) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SIDE_STATUS_FAILED;
  } else {
    gSideStatuses[side] |= C.SIDE_STATUS_LIGHTSCREEN;
    gSideTimers[side].lightscreenTimer = 5;
    gSideTimers[side].lightscreenBattlerId = G.gBattlerAttacker;
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && CountAliveMonsInBattle(C.BATTLE_ALIVE_ATK_SIDE) === 2) gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SET_LIGHTSCREEN_DOUBLE;
    else gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SET_LIGHTSCREEN_SINGLE;
  }
  adv(1);
}

export function Cmd_tryKO(): void {
  const t = G.gBattlerTarget;
  const a = G.gBattlerAttacker;
  const [holdEffect, param] = holdEffectOf(t);
  G.gPotentialItemEffectBattler = t;
  if (holdEffect === C.HOLD_EFFECT_FOCUS_BAND && random() % 100 < param) {
    RecordItemEffectBattle(t, C.HOLD_EFFECT_FOCUS_BAND);
    gSpecialStatuses[t].focusBanded = 1;
  }
  if (gBattleMons[t].ability === C.ABILITY_STURDY) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    G.gLastUsedAbility = C.ABILITY_STURDY;
    G.gBattlescriptCurrInstr = BS("BattleScript_SturdyPreventsOHKO");
    RecordAbilityBattle(t, C.ABILITY_STURDY);
    return;
  }
  let chance: boolean;
  const roll = () => {
    const c = (gBattleMoves(G.gCurrentMove).accuracy + (gBattleMons[a].level - gBattleMons[t].level)) & 0xffff;
    return (random() % 100) + 1 < c && gBattleMons[a].level >= gBattleMons[t].level;
  };
  if (!(gStatuses3[t] & C.STATUS3_ALWAYS_HITS)) chance = roll();
  else if (gDisableStructs[t].battlerWithSureHit === a && gBattleMons[a].level >= gBattleMons[t].level) chance = true;
  else chance = roll();
  if (chance) {
    if (gProtectStructs[t].endured) {
      G.gBattleMoveDamage = gBattleMons[t].hp - 1;
      G.gMoveResultFlags |= C.MOVE_RESULT_FOE_ENDURED;
    } else if (gSpecialStatuses[t].focusBanded) {
      G.gBattleMoveDamage = gBattleMons[t].hp - 1;
      G.gMoveResultFlags |= C.MOVE_RESULT_FOE_HUNG_ON;
      G.gLastUsedItem = gBattleMons[t].item;
    } else {
      G.gBattleMoveDamage = gBattleMons[t].hp;
      G.gMoveResultFlags |= C.MOVE_RESULT_ONE_HIT_KO;
    }
    adv(5);
  } else {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = gBattleMons[a].level >= gBattleMons[t].level ? C.B_MSG_KO_MISS : C.B_MSG_KO_UNAFFECTED;
    G.gBattlescriptCurrInstr = r32(cur() + 1);
  }
}

export function Cmd_damagetohalftargethp(): void {
  G.gBattleMoveDamage = div(gBattleMons[G.gBattlerTarget].hp, 2);
  if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
  adv(1);
}

export function Cmd_setsandstorm(): void {
  if (G.gBattleWeather & C.B_WEATHER_SANDSTORM) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_WEATHER_FAILED;
  } else {
    G.gBattleWeather = C.B_WEATHER_SANDSTORM_TEMPORARY;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STARTED_SANDSTORM;
    gWishFutureKnock.weatherDuration = 5;
  }
  adv(1);
}

export function Cmd_weatherdamage(): void {
  const a = G.gBattlerAttacker;
  if (IS_BATTLE_TYPE_GHOST_WITHOUT_SCOPE(G.gBattleTypeFlags) && GetBattlerSide(a) === C.B_SIDE_OPPONENT) {
    G.gBattleMoveDamage = 0;
    adv(1);
    return;
  }
  if (WEATHER_HAS_EFFECT()) {
    if (G.gBattleWeather & C.B_WEATHER_SANDSTORM) {
      const m = gBattleMons[a];
      if (m.type1 !== C.TYPE_ROCK && m.type1 !== C.TYPE_STEEL && m.type1 !== C.TYPE_GROUND && m.type2 !== C.TYPE_ROCK && m.type2 !== C.TYPE_STEEL && m.type2 !== C.TYPE_GROUND
        && m.ability !== C.ABILITY_SAND_VEIL && !(gStatuses3[a] & C.STATUS3_UNDERGROUND) && !(gStatuses3[a] & C.STATUS3_UNDERWATER)) {
        G.gBattleMoveDamage = div(m.maxHP, 16);
        if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
      } else {
        G.gBattleMoveDamage = 0;
      }
    }
    if (G.gBattleWeather & C.B_WEATHER_HAIL) {
      if (!IS_BATTLER_OF_TYPE(a, C.TYPE_ICE) && !(gStatuses3[a] & C.STATUS3_UNDERGROUND) && !(gStatuses3[a] & C.STATUS3_UNDERWATER)) {
        G.gBattleMoveDamage = div(gBattleMons[a].maxHP, 16);
        if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
      } else {
        G.gBattleMoveDamage = 0;
      }
    }
  } else {
    G.gBattleMoveDamage = 0;
  }
  if (G.gAbsentBattlerFlags & gBitTable[a]) G.gBattleMoveDamage = 0;
  adv(1);
}

export function Cmd_tryinfatuating(): void {
  const a = G.gBattlerAttacker;
  const t = G.gBattlerTarget;
  const monA = partyOf(a)(gBattlerPartyIndexes[a]);
  const monT = partyOf(t)(gBattlerPartyIndexes[t]);
  const gA = GetGenderFromSpeciesAndPersonality(GetMonData(monA, C.MON_DATA_SPECIES), GetMonData(monA, C.MON_DATA_PERSONALITY));
  const gT = GetGenderFromSpeciesAndPersonality(GetMonData(monT, C.MON_DATA_SPECIES), GetMonData(monT, C.MON_DATA_PERSONALITY));
  if (gBattleMons[t].ability === C.ABILITY_OBLIVIOUS) {
    G.gBattlescriptCurrInstr = BS("BattleScript_ObliviousPreventsAttraction");
    G.gLastUsedAbility = C.ABILITY_OBLIVIOUS;
    RecordAbilityBattle(t, C.ABILITY_OBLIVIOUS);
  } else if (gA === gT || gBattleMons[t].status2 & C.STATUS2_INFATUATION || gA === C.MON_GENDERLESS || gT === C.MON_GENDERLESS) {
    G.gBattlescriptCurrInstr = r32(cur() + 1);
  } else {
    gBattleMons[t].status2 |= STATUS2_INFATUATED_WITH(a);
    adv(5);
  }
}

export function Cmd_updatestatusicon(): void {
  if (G.gBattleControllerExecFlags) return;
  const arg = r8(cur() + 1);
  if (arg === C.BS_PLAYER2) {
    for (G.gActiveBattler = G.gBattleControllerExecFlags; G.gActiveBattler < G.gBattlersCount; G.gActiveBattler++) {
      if (!(G.gAbsentBattlerFlags & gBitTable[G.gActiveBattler])) {
        BtlController_EmitStatusIconUpdate(BUFFER_A, gBattleMons[G.gActiveBattler].status1, gBattleMons[G.gActiveBattler].status2);
        MarkBattlerForControllerExec(G.gActiveBattler);
      }
    }
  } else if (arg === C.BS_ATTACKER_WITH_PARTNER) {
    G.gActiveBattler = G.gBattlerAttacker;
    if (!(G.gAbsentBattlerFlags & gBitTable[G.gActiveBattler])) {
      BtlController_EmitStatusIconUpdate(BUFFER_A, gBattleMons[G.gActiveBattler].status1, gBattleMons[G.gActiveBattler].status2);
      MarkBattlerForControllerExec(G.gActiveBattler);
    }
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE) {
      G.gActiveBattler = GetBattlerAtPosition(GetBattlerPosition(G.gBattlerAttacker) ^ C.BIT_FLANK);
      if (!(G.gAbsentBattlerFlags & gBitTable[G.gActiveBattler])) {
        BtlController_EmitStatusIconUpdate(BUFFER_A, gBattleMons[G.gActiveBattler].status1, gBattleMons[G.gActiveBattler].status2);
        MarkBattlerForControllerExec(G.gActiveBattler);
      }
    }
  } else {
    G.gActiveBattler = GetBattlerForBattleScript(arg);
    BtlController_EmitStatusIconUpdate(BUFFER_A, gBattleMons[G.gActiveBattler].status1, gBattleMons[G.gActiveBattler].status2);
    MarkBattlerForControllerExec(G.gActiveBattler);
  }
  adv(2);
}

export function Cmd_setmist(): void {
  const side = GET_BATTLER_SIDE(G.gBattlerAttacker);
  if (gSideTimers[side].mistTimer) {
    G.gMoveResultFlags |= C.MOVE_RESULT_FAILED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_MIST_FAILED;
  } else {
    gSideTimers[side].mistTimer = 5;
    gSideTimers[side].mistBattlerId = G.gBattlerAttacker;
    gSideStatuses[side] |= C.SIDE_STATUS_MIST;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SET_MIST;
  }
  adv(1);
}

export function Cmd_setfocusenergy(): void {
  const a = G.gBattlerAttacker;
  if (gBattleMons[a].status2 & C.STATUS2_FOCUS_ENERGY) {
    G.gMoveResultFlags |= C.MOVE_RESULT_FAILED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_FOCUS_ENERGY_FAILED;
  } else {
    gBattleMons[a].status2 |= C.STATUS2_FOCUS_ENERGY;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_GETTING_PUMPED;
  }
  adv(1);
}

export function Cmd_transformdataexecution(): void {
  G.gChosenMove = C.MOVE_UNAVAILABLE;
  adv(1);
  const a = G.gBattlerAttacker;
  const t = G.gBattlerTarget;
  if (gBattleMons[t].status2 & C.STATUS2_TRANSFORMED || gStatuses3[t] & C.STATUS3_SEMI_INVULNERABLE) {
    G.gMoveResultFlags |= C.MOVE_RESULT_FAILED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_TRANSFORM_FAILED;
  } else {
    gBattleMons[a].status2 |= C.STATUS2_TRANSFORMED;
    gDisableStructs[a].disabledMove = C.MOVE_NONE;
    gDisableStructs[a].disableTimer = 0;
    gDisableStructs[a].transformedMonPersonality = gBattleMons[t].personality;
    gDisableStructs[a].mimickedMoves = 0;
    PREPARE_SPECIES_BUFFER(gBattleTextBuff1, gBattleMons[t].species);
    // copy everything up to offsetof(struct BattlePokemon, pp)
    gBattleMons[a].bytes.set(gBattleMons[t].bytes.subarray(0, 0x24), 0);
    for (let i = 0; i < 4; i++) {
      const pp = gBattleMoves(gBattleMons[a].moves[i]).pp;
      gBattleMons[a].pp[i] = pp < 5 ? pp : 5;
    }
    G.gActiveBattler = a;
    BtlController_EmitResetActionMoveSelection(BUFFER_A, C.RESET_MOVE_SELECTION);
    MarkBattlerForControllerExec(a);
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_TRANSFORMED;
  }
}

export function Cmd_setsubstitute(): void {
  const a = G.gBattlerAttacker;
  let hp = div(gBattleMons[a].maxHP, 4);
  if (hp === 0) hp = 1;
  if (gBattleMons[a].hp <= hp) {
    G.gBattleMoveDamage = 0;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SUBSTITUTE_FAILED;
  } else {
    G.gBattleMoveDamage = div(gBattleMons[a].maxHP, 4);
    if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
    gBattleMons[a].status2 |= C.STATUS2_SUBSTITUTE;
    gBattleMons[a].status2 &= ~C.STATUS2_WRAPPED;
    gDisableStructs[a].substituteHP = G.gBattleMoveDamage;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SET_SUBSTITUTE;
    G.gHitMarker |= C.HITMARKER_IGNORE_SUBSTITUTE;
  }
  adv(1);
}

const MIMIC_FORBIDDEN_END = 0xfffe;
const METRONOME_FORBIDDEN_END = 0xffff;

function IsMoveUncopyableByMimic(move: number): boolean {
  const t = T.movesForbiddenToCopy;
  let i = 0;
  for (; t[i] !== MIMIC_FORBIDDEN_END && t[i] !== move; i++) { /* scan */ }
  return t[i] !== MIMIC_FORBIDDEN_END;
}

export function Cmd_mimicattackcopy(): void {
  G.gChosenMove = C.MOVE_UNAVAILABLE;
  const a = G.gBattlerAttacker;
  const last = gLastMoves[G.gBattlerTarget];
  if (IsMoveUncopyableByMimic(last) || gBattleMons[a].status2 & C.STATUS2_TRANSFORMED || last === C.MOVE_NONE || last === C.MOVE_UNAVAILABLE) {
    G.gBattlescriptCurrInstr = r32(cur() + 1);
    return;
  }
  let i = 0;
  for (; i < 4; i++) if (gBattleMons[a].moves[i] === last) break;
  if (i === 4) {
    gBattleMons[a].moves[G.gCurrMovePos] = last;
    const pp = gBattleMoves(last).pp;
    gBattleMons[a].pp[G.gCurrMovePos] = pp < 5 ? pp : 5;
    PREPARE_MOVE_BUFFER(gBattleTextBuff1, last);
    gDisableStructs[a].mimickedMoves |= gBitTable[G.gCurrMovePos];
    adv(5);
  } else {
    G.gBattlescriptCurrInstr = r32(cur() + 1);
  }
}

export function Cmd_metronome(): void {
  const t = T.movesForbiddenToCopy;
  for (;;) {
    G.gCurrentMove = (random() & 0x1ff) + 1;
    if (G.gCurrentMove >= C.MOVES_COUNT) continue;
    let i = -1;
    for (;;) {
      i++;
      if (t[i] === G.gCurrentMove) break;
      if (t[i] === METRONOME_FORBIDDEN_END) break;
    }
    if (t[i] === METRONOME_FORBIDDEN_END) {
      G.gHitMarker &= ~C.HITMARKER_ATTACKSTRING_PRINTED;
      G.gBattlescriptCurrInstr = scriptTable("gBattleScriptsForMoveEffects", gBattleMoves(G.gCurrentMove).effect);
      G.gBattlerTarget = GetMoveTarget(G.gCurrentMove, C.NO_TARGET_OVERRIDE);
      return;
    }
  }
}

export function Cmd_dmgtolevel(): void {
  G.gBattleMoveDamage = gBattleMons[G.gBattlerAttacker].level;
  adv(1);
}

export function Cmd_psywavedamageeffect(): void {
  let randDamage: number;
  while ((randDamage = random() % 16) > 10) { /* reroll */ }
  randDamage *= 10;
  G.gBattleMoveDamage = div(gBattleMons[G.gBattlerAttacker].level * (randDamage + 50), 100);
  adv(1);
}

function counterLike(dmg: number, battlerId: number): void {
  const sideAttacker = GetBattlerSide(G.gBattlerAttacker);
  const sideTarget = GetBattlerSide(battlerId);
  if (dmg && sideAttacker !== sideTarget && gBattleMons[battlerId].hp) {
    G.gBattleMoveDamage = dmg * 2;
    if (gSideTimers[sideTarget].followmeTimer && gBattleMons[gSideTimers[sideTarget].followmeTarget].hp) G.gBattlerTarget = gSideTimers[sideTarget].followmeTarget;
    else G.gBattlerTarget = battlerId;
    adv(5);
  } else {
    gSpecialStatuses[G.gBattlerAttacker].ppNotAffectedByPressure = 1;
    G.gBattlescriptCurrInstr = r32(cur() + 1);
  }
}

export function Cmd_counterdamagecalculator(): void {
  const p = gProtectStructs[G.gBattlerAttacker];
  counterLike(p.physicalDmg, p.physicalBattlerId);
}

export function Cmd_mirrorcoatdamagecalculator(): void {
  const p = gProtectStructs[G.gBattlerAttacker];
  counterLike(p.specialDmg, p.specialBattlerId);
}

export function Cmd_disablelastusedattack(): void {
  const t = G.gBattlerTarget;
  let i = 0;
  for (; i < 4; i++) if (gBattleMons[t].moves[i] === gLastMoves[t]) break;
  if (gDisableStructs[t].disabledMove === C.MOVE_NONE && i !== 4 && gBattleMons[t].pp[i] !== 0) {
    PREPARE_MOVE_BUFFER(gBattleTextBuff1, gBattleMons[t].moves[i]);
    gDisableStructs[t].disabledMove = gBattleMons[t].moves[i];
    gDisableStructs[t].disableTimer = (random() & 3) + 2;
    gDisableStructs[t].disableTimerStartValue = gDisableStructs[t].disableTimer;
    adv(5);
  } else {
    G.gBattlescriptCurrInstr = r32(cur() + 1);
  }
}

export function Cmd_trysetencore(): void {
  const t = G.gBattlerTarget;
  let i = 0;
  for (; i < 4; i++) if (gBattleMons[t].moves[i] === gLastMoves[t]) break;
  if (gLastMoves[t] === C.MOVE_STRUGGLE || gLastMoves[t] === C.MOVE_ENCORE || gLastMoves[t] === C.MOVE_MIRROR_MOVE) i = 4;
  if (gDisableStructs[t].encoredMove === C.MOVE_NONE && i !== 4 && gBattleMons[t].pp[i] !== 0) {
    gDisableStructs[t].encoredMove = gBattleMons[t].moves[i];
    gDisableStructs[t].encoredMovePos = i;
    gDisableStructs[t].encoreTimer = (random() & 3) + 3;
    gDisableStructs[t].encoreTimerStartValue = gDisableStructs[t].encoreTimer;
    adv(5);
  } else {
    G.gBattlescriptCurrInstr = r32(cur() + 1);
  }
}

export function Cmd_painsplitdmgcalc(): void {
  const a = G.gBattlerAttacker;
  const t = G.gBattlerTarget;
  if (!(gBattleMons[t].status2 & C.STATUS2_SUBSTITUTE)) {
    const hpDiff = div(gBattleMons[a].hp + gBattleMons[t].hp, 2);
    const painSplitHp = gBattleMons[t].hp - hpDiff;
    G.gBattleMoveDamage = painSplitHp;
    gBattleScripting.painSplitHp = painSplitHp;
    G.gBattleMoveDamage = gBattleMons[a].hp - hpDiff;
    gSpecialStatuses[t].dmg = 0xffff;
    adv(5);
  } else {
    G.gBattlescriptCurrInstr = r32(cur() + 1);
  }
}

export function Cmd_settypetorandomresistance(): void {
  const a = G.gBattlerAttacker;
  const landed = gLastLandedMoves[a];
  const size = rom.typeEffectiveness.length;
  if (landed === C.MOVE_NONE || landed === C.MOVE_UNAVAILABLE) {
    G.gBattlescriptCurrInstr = r32(cur() + 1);
  } else if (IsTwoTurnsMove(landed) && gBattleMons[gLastHitBy[a]].status2 & C.STATUS2_MULTIPLETURNS) {
    G.gBattlescriptCurrInstr = r32(cur() + 1);
  } else {
    let i = 0;
    for (let rands = 0; rands < 1000; rands++) {
      while ((i = random() % 128) > div(size, 3)) { /* reroll */ }
      i *= 3;
      if (TYPE_EFFECT_ATK_TYPE(i) === gLastHitByType[a] && TYPE_EFFECT_MULTIPLIER(i) <= C.TYPE_MUL_NOT_EFFECTIVE && !IS_BATTLER_OF_TYPE(a, TYPE_EFFECT_DEF_TYPE(i))) {
        SET_BATTLER_TYPE(a, TYPE_EFFECT_DEF_TYPE(i));
        PREPARE_TYPE_BUFFER(gBattleTextBuff1, TYPE_EFFECT_DEF_TYPE(i));
        adv(5);
        return;
      }
    }
    for (let j = 0, rands = 0; rands < size; j += 3, rands += 3) {
      const atk = TYPE_EFFECT_ATK_TYPE(j);
      if (atk === C.TYPE_ENDTABLE || atk === C.TYPE_FORESIGHT) continue;
      if (atk === gLastHitByType[a] && TYPE_EFFECT_MULTIPLIER(j) <= 5 && !IS_BATTLER_OF_TYPE(a, TYPE_EFFECT_DEF_TYPE(i))) {
        SET_BATTLER_TYPE(a, TYPE_EFFECT_DEF_TYPE(rands));
        PREPARE_TYPE_BUFFER(gBattleTextBuff1, TYPE_EFFECT_DEF_TYPE(rands));
        adv(5);
        return;
      }
    }
    G.gBattlescriptCurrInstr = r32(cur() + 1);
  }
}

export function Cmd_setalwayshitflag(): void {
  const t = G.gBattlerTarget;
  gStatuses3[t] &= ~C.STATUS3_ALWAYS_HITS;
  gStatuses3[t] |= STATUS3_ALWAYS_HITS_TURN(2);
  gDisableStructs[t].battlerWithSureHit = G.gBattlerAttacker;
  adv(1);
}

export function Cmd_copymovepermanently(): void {
  G.gChosenMove = C.MOVE_UNAVAILABLE;
  const a = G.gBattlerAttacker;
  const last = gLastPrintedMoves[G.gBattlerTarget];
  if (!(gBattleMons[a].status2 & C.STATUS2_TRANSFORMED) && last !== C.MOVE_STRUGGLE && last !== C.MOVE_NONE && last !== C.MOVE_UNAVAILABLE && last !== C.MOVE_SKETCH) {
    let i = 0;
    for (; i < 4; i++) {
      if (gBattleMons[a].moves[i] === C.MOVE_SKETCH) continue;
      if (gBattleMons[a].moves[i] === last) break;
    }
    if (i !== 4) {
      G.gBattlescriptCurrInstr = r32(cur() + 1);
    } else {
      gBattleMons[a].moves[G.gCurrMovePos] = last;
      gBattleMons[a].pp[G.gCurrMovePos] = gBattleMoves(last).pp;
      G.gActiveBattler = a;
      // struct MovePpInfo { u16 moves[4]; u8 pp[4]; u8 ppBonuses; }
      const data: number[] = [];
      for (let k = 0; k < 4; k++) data.push(gBattleMons[a].moves[k] & 0xff, (gBattleMons[a].moves[k] >> 8) & 0xff);
      for (let k = 0; k < 4; k++) data.push(gBattleMons[a].pp[k]);
      data.push(gBattleMons[a].ppBonuses, 0, 0, 0);
      BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_MOVES_PP_BATTLE, 0, 16, data);
      MarkBattlerForControllerExec(a);
      PREPARE_MOVE_BUFFER(gBattleTextBuff1, last);
      adv(5);
    }
  } else {
    G.gBattlescriptCurrInstr = r32(cur() + 1);
  }
}
