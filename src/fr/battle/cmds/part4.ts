// battle_script_commands.c, commands 0xAB-0xF7 and the battle window helpers.

import * as C from "../../generated/constants";
import { sound } from "../../audio/sound";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_UP, JOY_NEW } from "../../gba/input";
import { CopyBgTilemapBufferToVram, CopyToBgTilemapBufferRect_ChangePalette, IsDma3ManagerBusyWithBgCopy, ShowBg } from "../../hw/bg";
import { BeginFastPaletteFade, BeginNormalPaletteFade, gPaletteFade, gPlttBufferFaded, PALETTES_ALL, RGB_BLACK, RGB_WHITE } from "../../hw/palette";
import { gMain, SetVBlankCallback } from "../../hw/runtime";
import { FreeAllWindowBuffers } from "../../hw/window";
import { ppu } from "../../hw/ppu";
import { tasks } from "../../gba/tasks";
import { random } from "../../random";
import { rom } from "../../rom";
import { flagGet, varGet } from "../../save";
import { stringVars } from "../../gba/charmap";
import { BS, BattleScriptPush, r32, r8, scriptTable } from "../bscript";
import {
  G, gActionsByTurnOrder, gBattleCommunication, gBattleMons, gBattleResults, gBattleScripting, gBattleStruct, gBattleTextBuff1,
  gBattleTextBuff2, gBattlerByTurnOrder, gBattlerPartyIndexes, gBitTable, gChosenActionByBattler, gChosenMoveByBattler,
  gDisableStructs, gLastMoves, gLockedMoves, gProtectStructs, gSideStatuses, gSideTimers, gSpecialStatuses, gStatuses3,
  gWishFutureKnock,
} from "../globals";
import { GET_BATTLER_SIDE, IS_BATTLER_OF_TYPE, SET_BATTLER_TYPE, STATUS3_YAWN_TURN, div, gBattleMoves, F_DYNAMIC_TYPE_1, F_DYNAMIC_TYPE_2 } from "../macros";
import { CalculatePlayerPartyCount, GetMonData, GetMonGender, SetMonData, gEnemyParty, playerMon, type Mon, SpeciesToNationalPokedexNum } from "../../pokemon/mon";
import {
  CancelMultiTurnMoves, CastformDataTypeChange, CheckMoveLimitations, GetAbilityBySpecies, GetBattlerAtPosition, GetBattlerForBattleScript,
  GetBattlerPosition, GetBattlerSide, GetMoveTarget, MarkBattlerForControllerExec, PressurePPLoseOnUsingImprison,
  PressurePPLoseOnUsingPerishSong, RecordAbilityBattle, WEATHER_HAS_EFFECT, BattleScriptPushCursorAndCallback, GetScaledHPFraction,
} from "../util";
import { BtlController_EmitBallThrowAnim, BtlController_EmitBattleAnimation, BtlController_EmitHealthBarUpdate, BtlController_EmitSetMonData, BUFFER_A } from "../controllers";
import {
  BattlePutTextOnWindow, PREPARE_ABILITY_BUFFER, PREPARE_BYTE_NUMBER_BUFFER, PREPARE_ITEM_BUFFER, PREPARE_MON_NICK_WITH_PREFIX_BUFFER,
  PREPARE_MOVE_BUFFER, PREPARE_TYPE_BUFFER, B_BUFF_EOS, B_BUFF_MOVE, B_BUFF_PLACEHOLDER_BEGIN,
} from "../message";
import { CalculateBaseDamage } from "../damage";
import { IS_ITEM_MAIL, u16bytes, u32bytes } from "./part1";
import { IsInvalidForSleepTalkOrAssist, IsTwoTurnsMove, T } from "./helpers";
import { BattleMainCB2, VBlankCB_Battle } from "../main_init";
import { InitBattleBgsVideo, LoadBattleTextboxAndBackground } from "../bg";
import {
  CreateMonPicSprite_HandleDeoxys, DexScreen_RegisterMonToPokedex, DoNamingScreen, GetBoxNamePtr, GetPCBoxToSendMon, GetPokedexHeightWeight,
  GetSetPokedexFlag, GiveMonToPlayer, ShouldShowBoxWasFullMessage, GetCurrentMapType,
} from "../ext";
import { HandleSetPokedexFlag } from "../../pokemon/mon_extra";

const cur = () => G.gBattlescriptCurrInstr;
const adv = (n: number) => { G.gBattlescriptCurrInstr += n; };
const jumpTo = (offset: number) => { G.gBattlescriptCurrInstr = r32(cur() + offset); };
export const WINDOW_CLEAR = 1 << 0;
export const WINDOW_BG1 = 1 << 7;

function partyOf(battler: number): (i: number) => Mon {
  return GetBattlerSide(battler) === C.B_SIDE_PLAYER ? playerMon : (i) => gEnemyParty[i];
}

export function Cmd_trychoosesleeptalkmove(): void {
  const a = G.gBattlerAttacker;
  let unusable = 0;
  for (let i = 0; i < 4; i++) {
    const m = gBattleMons[a].moves[i];
    if (IsInvalidForSleepTalkOrAssist(m) || m === C.MOVE_FOCUS_PUNCH || m === C.MOVE_UPROAR || IsTwoTurnsMove(m)) unusable |= gBitTable[i];
  }
  unusable = CheckMoveLimitations(a, unusable, ~C.MOVE_LIMITATION_PP & 0xff) & 0xff;
  if (unusable === (1 << 4) - 1) {
    adv(5);
  } else {
    let pos: number;
    do pos = random() & 3;
    while (gBitTable[pos] & unusable);
    G.gCalledMove = gBattleMons[a].moves[pos];
    G.gCurrMovePos = pos;
    G.gHitMarker &= ~C.HITMARKER_ATTACKSTRING_PRINTED;
    G.gBattlerTarget = GetMoveTarget(G.gCalledMove, C.NO_TARGET_OVERRIDE);
    jumpTo(1);
  }
}

export function Cmd_setdestinybond(): void {
  gBattleMons[G.gBattlerAttacker].status2 |= C.STATUS2_DESTINY_BOND;
  adv(1);
}

export function Cmd_trysetdestinybondtohappen(): void {
  const sideA = GetBattlerSide(G.gBattlerAttacker);
  const sideT = GetBattlerSide(G.gBattlerTarget);
  if (gBattleMons[G.gBattlerTarget].status2 & C.STATUS2_DESTINY_BOND && sideA !== sideT && !(G.gHitMarker & C.HITMARKER_GRUDGE)) G.gHitMarker |= C.HITMARKER_DESTINYBOND;
  adv(1);
}

export function Cmd_remaininghptopower(): void {
  const hpFraction = GetScaledHPFraction(gBattleMons[G.gBattlerAttacker].hp, gBattleMons[G.gBattlerAttacker].maxHP, 48);
  const t = T.flailHpScaleToPowerTable;
  let i = 0;
  for (; i < t.length; i += 2) if (hpFraction <= t[i]) break;
  G.gDynamicBasePower = t[i + 1];
  adv(1);
}

export function Cmd_tryspiteppreduce(): void {
  const t = G.gBattlerTarget;
  const last = gLastMoves[t];
  if (last !== C.MOVE_NONE && last !== C.MOVE_UNAVAILABLE) {
    let i = 0;
    for (; i < 4; i++) if (last === gBattleMons[t].moves[i]) break;
    if (i !== 4 && gBattleMons[t].pp[i] > 1) {
      let ppToDeduct = (random() & 3) + 2;
      if (gBattleMons[t].pp[i] < ppToDeduct) ppToDeduct = gBattleMons[t].pp[i];
      PREPARE_MOVE_BUFFER(gBattleTextBuff1, last);
      PREPARE_BYTE_NUMBER_BUFFER(gBattleTextBuff2, 1, ppToDeduct);
      gBattleMons[t].pp[i] -= ppToDeduct;
      G.gActiveBattler = t;
      if (!(gDisableStructs[t].mimickedMoves & gBitTable[i]) && !(gBattleMons[t].status2 & C.STATUS2_TRANSFORMED)) {
        BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_PPMOVE1_BATTLE + i, 0, 1, [gBattleMons[t].pp[i]]);
        MarkBattlerForControllerExec(t);
      }
      adv(5);
      if (gBattleMons[t].pp[i] === 0) CancelMultiTurnMoves(t);
    } else {
      jumpTo(1);
    }
  } else {
    jumpTo(1);
  }
}

export function Cmd_healpartystatus(): void {
  let toHeal = 0;
  const a = G.gBattlerAttacker;
  if (G.gCurrentMove === C.MOVE_HEAL_BELL) {
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_BELL;
    const party = partyOf(a);
    if (gBattleMons[a].ability !== C.ABILITY_SOUNDPROOF) {
      gBattleMons[a].status1 = 0;
      gBattleMons[a].status2 &= ~C.STATUS2_NIGHTMARE;
    } else {
      RecordAbilityBattle(a, gBattleMons[a].ability);
      gBattleCommunication[C.MULTISTRING_CHOOSER] |= C.B_MSG_BELL_SOUNDPROOF_ATTACKER;
    }
    G.gActiveBattler = gBattleScripting.battler = GetBattlerAtPosition(GetBattlerPosition(a) ^ C.BIT_FLANK);
    const p = G.gActiveBattler;
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && !(G.gAbsentBattlerFlags & gBitTable[p])) {
      if (gBattleMons[p].ability !== C.ABILITY_SOUNDPROOF) {
        gBattleMons[p].status1 = 0;
        gBattleMons[p].status2 &= ~C.STATUS2_NIGHTMARE;
      } else {
        RecordAbilityBattle(p, gBattleMons[p].ability);
        gBattleCommunication[C.MULTISTRING_CHOOSER] |= C.B_MSG_BELL_SOUNDPROOF_PARTNER;
      }
    }
    for (let i = 0; i < 6; i++) {
      const mon = party(i);
      const species = GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG);
      const abilityNum = GetMonData(mon, C.MON_DATA_ABILITY_NUM);
      if (species !== C.SPECIES_NONE && species !== C.SPECIES_EGG) {
        let ability: number;
        if (gBattlerPartyIndexes[a] === i) ability = gBattleMons[a].ability;
        else if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && gBattlerPartyIndexes[p] === i && !(G.gAbsentBattlerFlags & gBitTable[p])) ability = gBattleMons[p].ability;
        else ability = GetAbilityBySpecies(species, abilityNum);
        if (ability !== C.ABILITY_SOUNDPROOF) toHeal |= 1 << i;
      }
    }
  } else {
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SOOTHING_AROMA;
    toHeal = (1 << 6) - 1;
    gBattleMons[a].status1 = 0;
    gBattleMons[a].status2 &= ~C.STATUS2_NIGHTMARE;
    G.gActiveBattler = GetBattlerAtPosition(GetBattlerPosition(a) ^ C.BIT_FLANK);
    if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && !(G.gAbsentBattlerFlags & gBitTable[G.gActiveBattler])) {
      gBattleMons[G.gActiveBattler].status1 = 0;
      gBattleMons[G.gActiveBattler].status2 &= ~C.STATUS2_NIGHTMARE;
    }
  }
  if (toHeal) {
    G.gActiveBattler = a;
    BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_STATUS_BATTLE, toHeal, 4, u32bytes(0));
    MarkBattlerForControllerExec(a);
  }
  adv(1);
}

export function Cmd_cursetarget(): void {
  const t = G.gBattlerTarget;
  if (gBattleMons[t].status2 & C.STATUS2_CURSED) {
    jumpTo(1);
  } else {
    gBattleMons[t].status2 |= C.STATUS2_CURSED;
    G.gBattleMoveDamage = div(gBattleMons[G.gBattlerAttacker].maxHP, 2);
    if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
    adv(5);
  }
}

export function Cmd_trysetspikes(): void {
  const side = GetBattlerSide(G.gBattlerAttacker) ^ C.BIT_SIDE;
  if (gSideTimers[side].spikesAmount === 3) {
    gSpecialStatuses[G.gBattlerAttacker].ppNotAffectedByPressure = 1;
    jumpTo(1);
  } else {
    gSideStatuses[side] |= C.SIDE_STATUS_SPIKES;
    gSideTimers[side].spikesAmount++;
    adv(5);
  }
}

export function Cmd_setforesight(): void {
  gBattleMons[G.gBattlerTarget].status2 |= C.STATUS2_FORESIGHT;
  adv(1);
}

export function Cmd_trysetperishsong(): void {
  let notAffected = 0;
  for (let i = 0; i < G.gBattlersCount; i++) {
    if (gStatuses3[i] & C.STATUS3_PERISH_SONG || gBattleMons[i].ability === C.ABILITY_SOUNDPROOF) {
      notAffected++;
    } else {
      gStatuses3[i] |= C.STATUS3_PERISH_SONG;
      gDisableStructs[i].perishSongTimer = 3;
      gDisableStructs[i].perishSongTimerStartValue = 3;
    }
  }
  PressurePPLoseOnUsingPerishSong(G.gBattlerAttacker);
  if (notAffected === G.gBattlersCount) jumpTo(1);
  else adv(5);
}

export function Cmd_rolloutdamagecalculation(): void {
  const a = G.gBattlerAttacker;
  if (G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) {
    CancelMultiTurnMoves(a);
    G.gBattlescriptCurrInstr = BS("BattleScript_MoveMissedPause");
    return;
  }
  if (!(gBattleMons[a].status2 & C.STATUS2_MULTIPLETURNS)) {
    gDisableStructs[a].rolloutTimer = 5;
    gDisableStructs[a].rolloutTimerStartValue = 5;
    gBattleMons[a].status2 |= C.STATUS2_MULTIPLETURNS;
    gLockedMoves[a] = G.gCurrentMove;
  }
  gDisableStructs[a].rolloutTimer = (gDisableStructs[a].rolloutTimer - 1) & 0xf;
  if (gDisableStructs[a].rolloutTimer === 0) gBattleMons[a].status2 &= ~C.STATUS2_MULTIPLETURNS;
  G.gDynamicBasePower = gBattleMoves(G.gCurrentMove).power;
  for (let i = 1; i < 5 - gDisableStructs[a].rolloutTimer; i++) G.gDynamicBasePower *= 2;
  if (gBattleMons[a].status2 & C.STATUS2_DEFENSE_CURL) G.gDynamicBasePower *= 2;
  adv(1);
}

export function Cmd_jumpifconfusedandstatmaxed(): void {
  if (gBattleMons[G.gBattlerTarget].status2 & C.STATUS2_CONFUSION && gBattleMons[G.gBattlerTarget].statStages[r8(cur() + 1)] === C.MAX_STAT_STAGE) jumpTo(2);
  else adv(6);
}

export function Cmd_furycuttercalc(): void {
  const a = G.gBattlerAttacker;
  if (G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) {
    gDisableStructs[a].furyCutterCounter = 0;
    G.gBattlescriptCurrInstr = BS("BattleScript_MoveMissedPause");
  } else {
    if (gDisableStructs[a].furyCutterCounter !== 5) gDisableStructs[a].furyCutterCounter++;
    G.gDynamicBasePower = gBattleMoves(G.gCurrentMove).power;
    for (let i = 1; i < gDisableStructs[a].furyCutterCounter; i++) G.gDynamicBasePower *= 2;
    adv(1);
  }
}

export function Cmd_friendshiptodamagecalculation(): void {
  const f = gBattleMons[G.gBattlerAttacker].friendship;
  if (gBattleMoves(G.gCurrentMove).effect === C.EFFECT_RETURN) G.gDynamicBasePower = div(10 * f, 25);
  else G.gDynamicBasePower = div(10 * (255 - f), 25);
  adv(1);
}

export function Cmd_presentdamagecalculation(): void {
  const rand = random() & 0xff;
  const t = G.gBattlerTarget;
  if (rand < 102) G.gDynamicBasePower = 40;
  else if (rand < 178) G.gDynamicBasePower = 80;
  else if (rand < 204) G.gDynamicBasePower = 120;
  else {
    G.gBattleMoveDamage = div(gBattleMons[t].maxHP, 4);
    if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
    G.gBattleMoveDamage *= -1;
  }
  if (rand < 204) G.gBattlescriptCurrInstr = BS("BattleScript_HitFromCritCalc");
  else if (gBattleMons[t].maxHP === gBattleMons[t].hp) G.gBattlescriptCurrInstr = BS("BattleScript_AlreadyAtFullHp");
  else {
    G.gMoveResultFlags &= ~C.MOVE_RESULT_DOESNT_AFFECT_FOE;
    G.gBattlescriptCurrInstr = BS("BattleScript_PresentHealTarget");
  }
}

export function Cmd_setsafeguard(): void {
  const side = GET_BATTLER_SIDE(G.gBattlerAttacker);
  if (gSideStatuses[side] & C.SIDE_STATUS_SAFEGUARD) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SIDE_STATUS_FAILED;
  } else {
    gSideStatuses[side] |= C.SIDE_STATUS_SAFEGUARD;
    gSideTimers[side].safeguardTimer = 5;
    gSideTimers[side].safeguardBattlerId = G.gBattlerAttacker;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SET_SAFEGUARD;
  }
  adv(1);
}

export function Cmd_magnitudedamagecalculation(): void {
  let magnitude = random() % 100;
  const table: Array<[number, number, number]> = [[5, 10, 4], [15, 30, 5], [35, 50, 6], [65, 70, 7], [85, 90, 8], [95, 110, 9]];
  let found = false;
  for (const [limit, power, mag] of table) {
    if (magnitude < limit) {
      G.gDynamicBasePower = power;
      magnitude = mag;
      found = true;
      break;
    }
  }
  if (!found) {
    G.gDynamicBasePower = 150;
    magnitude = 10;
  }
  PREPARE_BYTE_NUMBER_BUFFER(gBattleTextBuff1, 2, magnitude);
  for (G.gBattlerTarget = 0; G.gBattlerTarget < G.gBattlersCount; G.gBattlerTarget++) {
    if (G.gBattlerTarget === G.gBattlerAttacker) continue;
    if (!(G.gAbsentBattlerFlags & gBitTable[G.gBattlerTarget])) break;
  }
  adv(1);
}

export function Cmd_jumpifnopursuitswitchdmg(): void {
  const playerSide = GetBattlerSide(G.gBattlerAttacker) === C.B_SIDE_PLAYER;
  if (G.gMultiHitCounter === 1) G.gBattlerTarget = GetBattlerAtPosition(playerSide ? C.B_POSITION_OPPONENT_LEFT : C.B_POSITION_PLAYER_LEFT);
  else G.gBattlerTarget = GetBattlerAtPosition(playerSide ? C.B_POSITION_OPPONENT_RIGHT : C.B_POSITION_PLAYER_RIGHT);
  const t = G.gBattlerTarget;
  if (gChosenActionByBattler[t] === C.B_ACTION_USE_MOVE && G.gBattlerAttacker === gBattleStruct.moveTarget[t]
    && !(gBattleMons[t].status1 & (C.STATUS1_SLEEP | C.STATUS1_FREEZE)) && gBattleMons[G.gBattlerAttacker].hp
    && !gDisableStructs[t].truantCounter && gChosenMoveByBattler[t] === C.MOVE_PURSUIT) {
    for (let i = 0; i < G.gBattlersCount; i++) if (gBattlerByTurnOrder[i] === t) gActionsByTurnOrder[i] = C.B_ACTION_TRY_FINISH;
    G.gCurrentMove = C.MOVE_PURSUIT;
    G.gCurrMovePos = G.gChosenMovePos = gBattleStruct.chosenMovePositions[t];
    adv(5);
    gBattleScripting.animTurn = 1;
    G.gHitMarker &= ~C.HITMARKER_ATTACKSTRING_PRINTED;
  } else {
    jumpTo(1);
  }
}

export function Cmd_setsunny(): void {
  if (G.gBattleWeather & C.B_WEATHER_SUN) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_WEATHER_FAILED;
  } else {
    G.gBattleWeather = C.B_WEATHER_SUN_TEMPORARY;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STARTED_SUNLIGHT;
    gWishFutureKnock.weatherDuration = 5;
  }
  adv(1);
}

export function Cmd_maxattackhalvehp(): void {
  const a = G.gBattlerAttacker;
  let halfHp = div(gBattleMons[a].maxHP, 2);
  if (!halfHp) halfHp = 1;
  if (gBattleMons[a].statStages[C.STAT_ATK] < C.MAX_STAT_STAGE && gBattleMons[a].hp > halfHp) {
    gBattleMons[a].statStages[C.STAT_ATK] = C.MAX_STAT_STAGE;
    G.gBattleMoveDamage = div(gBattleMons[a].maxHP, 2);
    if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
    adv(5);
  } else {
    jumpTo(1);
  }
}

export function Cmd_copyfoestats(): void {
  for (let i = 0; i < C.NUM_BATTLE_STATS; i++) gBattleMons[G.gBattlerAttacker].statStages[i] = gBattleMons[G.gBattlerTarget].statStages[i];
  adv(5);
}

export function Cmd_rapidspinfree(): void {
  const a = G.gBattlerAttacker;
  if (gBattleMons[a].status2 & C.STATUS2_WRAPPED) {
    gBattleScripting.battler = G.gBattlerTarget;
    gBattleMons[a].status2 &= ~C.STATUS2_WRAPPED;
    G.gBattlerTarget = gBattleStruct.wrappedBy[a];
    gBattleTextBuff1[0] = B_BUFF_PLACEHOLDER_BEGIN;
    gBattleTextBuff1[1] = B_BUFF_MOVE;
    gBattleTextBuff1[2] = gBattleStruct.wrappedMove[a * 2 + 0];
    gBattleTextBuff1[3] = gBattleStruct.wrappedMove[a * 2 + 1];
    gBattleTextBuff1[4] = B_BUFF_EOS;
    BattleScriptPush(cur());
    G.gBattlescriptCurrInstr = BS("BattleScript_WrapFree");
  } else if (gStatuses3[a] & C.STATUS3_LEECHSEED) {
    gStatuses3[a] &= ~C.STATUS3_LEECHSEED;
    gStatuses3[a] &= ~C.STATUS3_LEECHSEED_BATTLER;
    BattleScriptPush(cur());
    G.gBattlescriptCurrInstr = BS("BattleScript_LeechSeedFree");
  } else if (gSideStatuses[GetBattlerSide(a)] & C.SIDE_STATUS_SPIKES) {
    gSideStatuses[GetBattlerSide(a)] &= ~C.SIDE_STATUS_SPIKES;
    gSideTimers[GetBattlerSide(a)].spikesAmount = 0;
    BattleScriptPush(cur());
    G.gBattlescriptCurrInstr = BS("BattleScript_SpikesFree");
  } else {
    adv(1);
  }
}

export function Cmd_setdefensecurlbit(): void {
  gBattleMons[G.gBattlerAttacker].status2 |= C.STATUS2_DEFENSE_CURL;
  adv(1);
}

export function Cmd_recoverbasedonsunlight(): void {
  const a = G.gBattlerAttacker;
  G.gBattlerTarget = a;
  if (gBattleMons[a].hp !== gBattleMons[a].maxHP) {
    if (G.gBattleWeather === 0 || !WEATHER_HAS_EFFECT()) G.gBattleMoveDamage = div(gBattleMons[a].maxHP, 2);
    else if (G.gBattleWeather & C.B_WEATHER_SUN) G.gBattleMoveDamage = div(20 * gBattleMons[a].maxHP, 30);
    else G.gBattleMoveDamage = div(gBattleMons[a].maxHP, 4);
    if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
    G.gBattleMoveDamage *= -1;
    adv(5);
  } else {
    jumpTo(1);
  }
}

export function Cmd_hiddenpowercalc(): void {
  const m = gBattleMons[G.gBattlerAttacker];
  const powerBits = ((m.hpIV & 2) >> 1) | (m.attackIV & 2) | ((m.defenseIV & 2) << 1) | ((m.speedIV & 2) << 2) | ((m.spAttackIV & 2) << 3) | ((m.spDefenseIV & 2) << 4);
  const typeBits = (m.hpIV & 1) | ((m.attackIV & 1) << 1) | ((m.defenseIV & 1) << 2) | ((m.speedIV & 1) << 3) | ((m.spAttackIV & 1) << 4) | ((m.spDefenseIV & 1) << 5);
  G.gDynamicBasePower = div(40 * powerBits, 63) + 30;
  let type = div((C.NUMBER_OF_MON_TYPES - 3) * typeBits, 63) + 1;
  if (type >= C.TYPE_MYSTERY) type++;
  gBattleStruct.dynamicMoveType = type | F_DYNAMIC_TYPE_1 | F_DYNAMIC_TYPE_2;
  adv(1);
}

export function Cmd_selectfirstvalidtarget(): void {
  for (G.gBattlerTarget = 0; G.gBattlerTarget < G.gBattlersCount; G.gBattlerTarget++) {
    if (G.gBattlerTarget === G.gBattlerAttacker) continue;
    if (!(G.gAbsentBattlerFlags & gBitTable[G.gBattlerTarget])) break;
  }
  adv(1);
}

export function Cmd_trysetfutureattack(): void {
  const t = G.gBattlerTarget;
  const a = G.gBattlerAttacker;
  const w = gWishFutureKnock;
  if (w.futureSightCounter[t] !== 0) {
    jumpTo(1);
  } else {
    w.futureSightMove[t] = G.gCurrentMove;
    w.futureSightAttacker[t] = a;
    w.futureSightCounter[t] = 3;
    w.futureSightDmg[t] = CalculateBaseDamage(gBattleMons[a], gBattleMons[t], G.gCurrentMove, gSideStatuses[GET_BATTLER_SIDE(t)], 0, 0, a, t);
    if (gProtectStructs[a].helpingHand) w.futureSightDmg[t] = div(w.futureSightDmg[t] * 15, 10);
    gBattleCommunication[C.MULTISTRING_CHOOSER] = G.gCurrentMove === C.MOVE_DOOM_DESIRE ? C.B_MSG_DOOM_DESIRE : C.B_MSG_FUTURE_SIGHT;
    adv(5);
  }
}

export function Cmd_trydobeatup(): void {
  const party = partyOf(G.gBattlerAttacker);
  if (gBattleMons[G.gBattlerTarget].hp === 0) {
    jumpTo(1);
    return;
  }
  const beforeLoop = gBattleCommunication[0];
  for (; gBattleCommunication[0] < 6; gBattleCommunication[0]++) {
    const mon = party(gBattleCommunication[0]);
    if (GetMonData(mon, C.MON_DATA_HP) && GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG) && GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG) !== C.SPECIES_EGG && !GetMonData(mon, C.MON_DATA_STATUS)) break;
  }
  if (gBattleCommunication[0] < 6) {
    PREPARE_MON_NICK_WITH_PREFIX_BUFFER(gBattleTextBuff1, G.gBattlerAttacker, gBattleCommunication[0]);
    adv(9);
    const mon = party(gBattleCommunication[0]);
    let dmg = rom.species[GetMonData(mon, C.MON_DATA_SPECIES)].base[C.STAT_ATK];
    dmg *= gBattleMoves(G.gCurrentMove).power;
    dmg *= div(GetMonData(mon, C.MON_DATA_LEVEL) * 2, 5) + 2;
    dmg = div(dmg, rom.species[gBattleMons[G.gBattlerTarget].species].base[C.STAT_DEF]);
    dmg = div(dmg, 50) + 2;
    if (gProtectStructs[G.gBattlerAttacker].helpingHand) dmg = div(dmg * 15, 10);
    G.gBattleMoveDamage = dmg;
    gBattleCommunication[0]++;
  } else if (beforeLoop !== 0) {
    jumpTo(1);
  } else {
    jumpTo(5);
  }
}

export function Cmd_setsemiinvulnerablebit(): void {
  const a = G.gBattlerAttacker;
  switch (G.gCurrentMove) {
    case C.MOVE_FLY: case C.MOVE_BOUNCE: gStatuses3[a] |= C.STATUS3_ON_AIR; break;
    case C.MOVE_DIG: gStatuses3[a] |= C.STATUS3_UNDERGROUND; break;
    case C.MOVE_DIVE: gStatuses3[a] |= C.STATUS3_UNDERWATER; break;
  }
  adv(1);
}

export function Cmd_clearsemiinvulnerablebit(): void {
  const a = G.gBattlerAttacker;
  switch (G.gCurrentMove) {
    case C.MOVE_FLY: case C.MOVE_BOUNCE: gStatuses3[a] &= ~C.STATUS3_ON_AIR; break;
    case C.MOVE_DIG: gStatuses3[a] &= ~C.STATUS3_UNDERGROUND; break;
    case C.MOVE_DIVE: gStatuses3[a] &= ~C.STATUS3_UNDERWATER; break;
  }
  adv(1);
}

export function Cmd_setminimize(): void {
  if (G.gHitMarker & C.HITMARKER_OBEYS) gStatuses3[G.gBattlerAttacker] |= C.STATUS3_MINIMIZED;
  adv(1);
}

export function Cmd_sethail(): void {
  if (G.gBattleWeather & C.B_WEATHER_HAIL) {
    G.gMoveResultFlags |= C.MOVE_RESULT_MISSED;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_WEATHER_FAILED;
  } else {
    G.gBattleWeather = C.B_WEATHER_HAIL_TEMPORARY;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_STARTED_HAIL;
    gWishFutureKnock.weatherDuration = 5;
  }
  adv(1);
}

export function Cmd_trymemento(): void {
  const t = G.gBattlerTarget;
  if (gBattleMons[t].statStages[C.STAT_ATK] === C.MIN_STAT_STAGE && gBattleMons[t].statStages[C.STAT_SPATK] === C.MIN_STAT_STAGE && gBattleCommunication[C.MISS_TYPE] !== C.B_MSG_PROTECTED) {
    jumpTo(1);
  } else {
    G.gActiveBattler = G.gBattlerAttacker;
    G.gBattleMoveDamage = gBattleMons[G.gActiveBattler].hp;
    BtlController_EmitHealthBarUpdate(BUFFER_A, C.INSTANT_HP_BAR_DROP);
    MarkBattlerForControllerExec(G.gActiveBattler);
    adv(5);
  }
}

export function Cmd_setforcedtarget(): void {
  const side = GetBattlerSide(G.gBattlerAttacker);
  gSideTimers[side].followmeTimer = 1;
  gSideTimers[side].followmeTarget = G.gBattlerAttacker;
  adv(1);
}

export function Cmd_setcharge(): void {
  const a = G.gBattlerAttacker;
  gStatuses3[a] |= C.STATUS3_CHARGED_UP;
  gDisableStructs[a].chargeTimer = 2;
  gDisableStructs[a].chargeTimerStartValue = 2;
  adv(1);
}

export function Cmd_callterrainattack(): void {
  G.gHitMarker &= ~C.HITMARKER_ATTACKSTRING_PRINTED;
  G.gCurrentMove = T.naturePowerMoves[G.gBattleTerrain];
  G.gBattlerTarget = GetMoveTarget(G.gCurrentMove, C.NO_TARGET_OVERRIDE);
  BattleScriptPush(scriptTable("gBattleScriptsForMoveEffects", gBattleMoves(G.gCurrentMove).effect));
  adv(1);
}

export function Cmd_cureifburnedparalysedorpoisoned(): void {
  const a = G.gBattlerAttacker;
  if (gBattleMons[a].status1 & (C.STATUS1_POISON | C.STATUS1_BURN | C.STATUS1_PARALYSIS | C.STATUS1_TOXIC_POISON)) {
    gBattleMons[a].status1 = 0;
    adv(5);
    G.gActiveBattler = a;
    BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_STATUS_BATTLE, 0, 4, u32bytes(0));
    MarkBattlerForControllerExec(a);
  } else {
    jumpTo(1);
  }
}

export function Cmd_settorment(): void {
  const t = G.gBattlerTarget;
  if (gBattleMons[t].status2 & C.STATUS2_TORMENT) {
    jumpTo(1);
  } else {
    gBattleMons[t].status2 |= C.STATUS2_TORMENT;
    adv(5);
  }
}

export function Cmd_jumpifnodamage(): void {
  const p = gProtectStructs[G.gBattlerAttacker];
  if (p.physicalDmg || p.specialDmg) adv(5);
  else jumpTo(1);
}

export function Cmd_settaunt(): void {
  const t = G.gBattlerTarget;
  if (gDisableStructs[t].tauntTimer === 0) {
    gDisableStructs[t].tauntTimer = 2;
    gDisableStructs[t].tauntTimer2 = 2;
    adv(5);
  } else {
    jumpTo(1);
  }
}

export function Cmd_trysethelpinghand(): void {
  G.gBattlerTarget = GetBattlerAtPosition(GetBattlerPosition(G.gBattlerAttacker) ^ C.BIT_FLANK);
  const t = G.gBattlerTarget;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && !(G.gAbsentBattlerFlags & gBitTable[t]) && !gProtectStructs[G.gBattlerAttacker].helpingHand && !gProtectStructs[t].helpingHand) {
    gProtectStructs[t].helpingHand = 1;
    adv(5);
  } else {
    jumpTo(1);
  }
}

export function Cmd_tryswapitems(): void {
  const a = G.gBattlerAttacker;
  const t = G.gBattlerTarget;
  const special = G.gBattleTypeFlags & (C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_BATTLE_TOWER | C.BATTLE_TYPE_EREADER_TRAINER);
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER_TOWER || (GetBattlerSide(a) === C.B_SIDE_OPPONENT && !special && G.gTrainerBattleOpponent_A !== C.TRAINER_SECRET_BASE)) {
    jumpTo(1);
    return;
  }
  const sideA = GetBattlerSide(a);
  const sideT = GetBattlerSide(t);
  if (!special && G.gTrainerBattleOpponent_A !== C.TRAINER_SECRET_BASE
    && (gWishFutureKnock.knockedOffMons[sideA] & gBitTable[gBattlerPartyIndexes[a]] || gWishFutureKnock.knockedOffMons[sideT] & gBitTable[gBattlerPartyIndexes[t]])) {
    jumpTo(1);
  } else if ((gBattleMons[a].item === C.ITEM_NONE && gBattleMons[t].item === C.ITEM_NONE) || gBattleMons[a].item === C.ITEM_ENIGMA_BERRY
    || gBattleMons[t].item === C.ITEM_ENIGMA_BERRY || IS_ITEM_MAIL(gBattleMons[a].item) || IS_ITEM_MAIL(gBattleMons[t].item)) {
    jumpTo(1);
  } else if (gBattleMons[t].ability === C.ABILITY_STICKY_HOLD) {
    G.gBattlescriptCurrInstr = BS("BattleScript_StickyHoldActivates");
    G.gLastUsedAbility = gBattleMons[t].ability;
    RecordAbilityBattle(t, G.gLastUsedAbility);
  } else {
    const changed = gBattleStruct.changedItems;
    const oldItemAtk = gBattleMons[a].item;
    changed[a] = gBattleMons[t].item;
    gBattleMons[a].item = C.ITEM_NONE;
    gBattleMons[t].item = oldItemAtk;
    G.gActiveBattler = a;
    BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_HELDITEM_BATTLE, 0, 2, u16bytes(changed[a]));
    MarkBattlerForControllerExec(a);
    G.gActiveBattler = t;
    BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_HELDITEM_BATTLE, 0, 2, u16bytes(gBattleMons[t].item));
    MarkBattlerForControllerExec(t);
    gBattleStruct.choicedMove[t] = 0;
    gBattleStruct.choicedMove[a] = 0;
    adv(5);
    PREPARE_ITEM_BUFFER(gBattleTextBuff1, changed[a]);
    PREPARE_ITEM_BUFFER(gBattleTextBuff2, oldItemAtk);
    if (oldItemAtk !== C.ITEM_NONE && changed[a] !== C.ITEM_NONE) gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_ITEM_SWAP_BOTH;
    else if (oldItemAtk === C.ITEM_NONE && changed[a] !== C.ITEM_NONE) gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_ITEM_SWAP_TAKEN;
    else gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_ITEM_SWAP_GIVEN;
  }
}

export function Cmd_trycopyability(): void {
  const t = G.gBattlerTarget;
  if (gBattleMons[t].ability !== C.ABILITY_NONE && gBattleMons[t].ability !== C.ABILITY_WONDER_GUARD) {
    gBattleMons[G.gBattlerAttacker].ability = gBattleMons[t].ability;
    G.gLastUsedAbility = gBattleMons[t].ability;
    adv(5);
  } else {
    jumpTo(1);
  }
}

export function Cmd_trywish(): void {
  const w = gWishFutureKnock;
  switch (r8(cur() + 1)) {
    case 0:
      if (w.wishCounter[G.gBattlerAttacker] === 0) {
        w.wishCounter[G.gBattlerAttacker] = 2;
        w.wishMonId[G.gBattlerAttacker] = gBattlerPartyIndexes[G.gBattlerAttacker];
        adv(6);
      } else {
        jumpTo(2);
      }
      break;
    case 1: {
      const t = G.gBattlerTarget;
      PREPARE_MON_NICK_WITH_PREFIX_BUFFER(gBattleTextBuff1, t, w.wishMonId[t]);
      G.gBattleMoveDamage = div(gBattleMons[t].maxHP, 2);
      if (G.gBattleMoveDamage === 0) G.gBattleMoveDamage = 1;
      G.gBattleMoveDamage *= -1;
      if (gBattleMons[t].hp === gBattleMons[t].maxHP) jumpTo(2);
      else adv(6);
      break;
    }
  }
}

export function Cmd_trysetroots(): void {
  const a = G.gBattlerAttacker;
  if (gStatuses3[a] & C.STATUS3_ROOTED) {
    jumpTo(1);
  } else {
    gStatuses3[a] |= C.STATUS3_ROOTED;
    adv(5);
  }
}

export function Cmd_doubledamagedealtifdamaged(): void {
  const p = gProtectStructs[G.gBattlerAttacker];
  if ((p.physicalDmg !== 0 && p.physicalBattlerId === G.gBattlerTarget) || (p.specialDmg !== 0 && p.specialBattlerId === G.gBattlerTarget)) gBattleScripting.dmgMultiplier = 2;
  adv(1);
}

export function Cmd_setyawn(): void {
  const t = G.gBattlerTarget;
  if (gStatuses3[t] & C.STATUS3_YAWN || gBattleMons[t].status1 & C.STATUS1_ANY) {
    jumpTo(1);
  } else {
    gStatuses3[t] |= STATUS3_YAWN_TURN(2);
    adv(5);
  }
}

export function Cmd_setdamagetohealthdifference(): void {
  const t = G.gBattlerTarget;
  const a = G.gBattlerAttacker;
  if (gBattleMons[t].hp <= gBattleMons[a].hp) {
    jumpTo(1);
  } else {
    G.gBattleMoveDamage = gBattleMons[t].hp - gBattleMons[a].hp;
    adv(5);
  }
}

export function Cmd_scaledamagebyhealthratio(): void {
  if (G.gDynamicBasePower === 0) {
    const power = gBattleMoves(G.gCurrentMove).power & 0xff;
    const a = G.gBattlerAttacker;
    G.gDynamicBasePower = div(gBattleMons[a].hp * power, gBattleMons[a].maxHP);
    if (G.gDynamicBasePower === 0) G.gDynamicBasePower = 1;
  }
  adv(1);
}

export function Cmd_tryswapabilities(): void {
  const a = G.gBattlerAttacker;
  const t = G.gBattlerTarget;
  if ((gBattleMons[a].ability === C.ABILITY_NONE && gBattleMons[t].ability === C.ABILITY_NONE) || gBattleMons[a].ability === C.ABILITY_WONDER_GUARD
    || gBattleMons[t].ability === C.ABILITY_WONDER_GUARD || G.gMoveResultFlags & C.MOVE_RESULT_NO_EFFECT) {
    jumpTo(1);
  } else {
    const abilityAtk = gBattleMons[a].ability;
    gBattleMons[a].ability = gBattleMons[t].ability;
    gBattleMons[t].ability = abilityAtk;
    adv(5);
  }
}

export function Cmd_tryimprison(): void {
  const a = G.gBattlerAttacker;
  if (gStatuses3[a] & C.STATUS3_IMPRISONED_OTHERS) {
    jumpTo(1);
    return;
  }
  const sideA = GetBattlerSide(a);
  PressurePPLoseOnUsingImprison(a);
  let battlerId = 0;
  for (; battlerId < G.gBattlersCount; battlerId++) {
    if (sideA !== GetBattlerSide(battlerId)) {
      let moveId = 0;
      for (; moveId < 4; moveId++) {
        let i = 0;
        for (; i < 4; i++) if (gBattleMons[a].moves[moveId] === gBattleMons[battlerId].moves[i] && gBattleMons[a].moves[moveId] !== C.MOVE_NONE) break;
        if (i !== 4) break;
      }
      if (moveId !== 4) {
        gStatuses3[a] |= C.STATUS3_IMPRISONED_OTHERS;
        adv(5);
        break;
      }
    }
  }
  if (battlerId === G.gBattlersCount) jumpTo(1);
}

export function Cmd_trysetgrudge(): void {
  const a = G.gBattlerAttacker;
  if (gStatuses3[a] & C.STATUS3_GRUDGE) {
    jumpTo(1);
  } else {
    gStatuses3[a] |= C.STATUS3_GRUDGE;
    adv(5);
  }
}

export function Cmd_weightdamagecalculation(): void {
  const t = T.weightToDamageTable;
  let i = 0;
  for (; t[i] !== 0xffff; i += 2) if (t[i] > GetPokedexHeightWeight(SpeciesToNationalPokedexNum(gBattleMons[G.gBattlerTarget].species), 1)) break;
  G.gDynamicBasePower = t[i] !== 0xffff ? t[i + 1] : 120;
  adv(1);
}

const ASSIST_FORBIDDEN_END = 0xffff;

export function Cmd_assistattackselect(): void {
  const party = GET_BATTLER_SIDE(G.gBattlerAttacker) !== C.B_SIDE_PLAYER ? (i: number) => gEnemyParty[i] : playerMon;
  const raw = gBattleStruct.assistPossibleMoves;
  const valid: number[] = [];
  let n = 0;
  const forbidden = T.movesForbiddenToCopy;
  for (let monId = 0; monId < 6; monId++) {
    if (monId === gBattlerPartyIndexes[G.gBattlerAttacker]) continue;
    const mon = party(monId);
    const s = GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG);
    if (s === C.SPECIES_NONE || s === C.SPECIES_EGG) continue;
    for (let moveId = 0; moveId < 4; moveId++) {
      const move = GetMonData(mon, C.MON_DATA_MOVE1 + moveId);
      if (IsInvalidForSleepTalkOrAssist(move)) continue;
      let i = 0;
      for (; forbidden[i] !== ASSIST_FORBIDDEN_END && move !== forbidden[i]; i++) { /* scan */ }
      if (forbidden[i] !== ASSIST_FORBIDDEN_END) continue;
      if (move === C.MOVE_NONE) continue;
      raw[n * 2] = move & 0xff;
      raw[n * 2 + 1] = move >> 8;
      valid[n++] = move;
    }
  }
  if (n) {
    G.gHitMarker &= ~C.HITMARKER_ATTACKSTRING_PRINTED;
    G.gCalledMove = valid[((random() & 0xff) * n) >> 8];
    G.gBattlerTarget = GetMoveTarget(G.gCalledMove, C.NO_TARGET_OVERRIDE);
    adv(5);
  } else {
    jumpTo(1);
  }
}

export function Cmd_trysetmagiccoat(): void {
  G.gBattlerTarget = G.gBattlerAttacker;
  gSpecialStatuses[G.gBattlerAttacker].ppNotAffectedByPressure = 1;
  if (G.gCurrentTurnActionNumber === G.gBattlersCount - 1) {
    jumpTo(1);
  } else {
    gProtectStructs[G.gBattlerAttacker].bounceMove = 1;
    adv(5);
  }
}

export function Cmd_trysetsnatch(): void {
  gSpecialStatuses[G.gBattlerAttacker].ppNotAffectedByPressure = 1;
  if (G.gCurrentTurnActionNumber === G.gBattlersCount - 1) {
    jumpTo(1);
  } else {
    gProtectStructs[G.gBattlerAttacker].stealMove = 1;
    adv(5);
  }
}

export function Cmd_trygetintimidatetarget(): void {
  gBattleScripting.battler = gBattleStruct.intimidateBattler;
  const side = GetBattlerSide(gBattleScripting.battler);
  PREPARE_ABILITY_BUFFER(gBattleTextBuff1, gBattleMons[gBattleScripting.battler].ability);
  for (; G.gBattlerTarget < G.gBattlersCount; G.gBattlerTarget++) {
    if (GetBattlerSide(G.gBattlerTarget) === side) continue;
    if (!(G.gAbsentBattlerFlags & gBitTable[G.gBattlerTarget])) break;
  }
  if (G.gBattlerTarget >= G.gBattlersCount) jumpTo(1);
  else adv(5);
}

export function Cmd_switchoutabilities(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  const b = G.gActiveBattler;
  if (gBattleMons[b].ability === C.ABILITY_NATURAL_CURE) {
    gBattleMons[b].status1 = 0;
    BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_STATUS_BATTLE, gBitTable[gBattleStruct.battlerPartyIndexes[b]], 4, u32bytes(0));
    MarkBattlerForControllerExec(b);
  }
  adv(2);
}

export function Cmd_jumpifhasnohp(): void {
  G.gActiveBattler = GetBattlerForBattleScript(r8(cur() + 1));
  if (gBattleMons[G.gActiveBattler].hp === 0) jumpTo(2);
  else adv(6);
}

export function Cmd_getsecretpowereffect(): void {
  const MEB = C.MOVE_EFFECT_BYTE;
  switch (G.gBattleTerrain) {
    case C.BATTLE_TERRAIN_GRASS: gBattleCommunication[MEB] = C.MOVE_EFFECT_POISON; break;
    case C.BATTLE_TERRAIN_LONG_GRASS: gBattleCommunication[MEB] = C.MOVE_EFFECT_SLEEP; break;
    case C.BATTLE_TERRAIN_SAND: gBattleCommunication[MEB] = C.MOVE_EFFECT_ACC_MINUS_1; break;
    case C.BATTLE_TERRAIN_UNDERWATER: gBattleCommunication[MEB] = C.MOVE_EFFECT_DEF_MINUS_1; break;
    case C.BATTLE_TERRAIN_WATER: gBattleCommunication[MEB] = C.MOVE_EFFECT_ATK_MINUS_1; break;
    case C.BATTLE_TERRAIN_POND: gBattleCommunication[MEB] = C.MOVE_EFFECT_SPD_MINUS_1; break;
    case C.BATTLE_TERRAIN_MOUNTAIN: gBattleCommunication[MEB] = C.MOVE_EFFECT_CONFUSION; break;
    case C.BATTLE_TERRAIN_CAVE: gBattleCommunication[MEB] = C.MOVE_EFFECT_FLINCH; break;
    default: gBattleCommunication[MEB] = C.MOVE_EFFECT_PARALYSIS; break;
  }
  adv(1);
}

export function Cmd_pickup(): void {
  const items = T.pickupItems;
  for (let i = 0; i < 6; i++) {
    const mon = playerMon(i);
    const species = GetMonData(mon, C.MON_DATA_SPECIES_OR_EGG);
    const heldItem = GetMonData(mon, C.MON_DATA_HELD_ITEM);
    const info = rom.species[species];
    const ability = GetMonData(mon, C.MON_DATA_ABILITY_NUM) !== C.ABILITY_NONE ? info?.abilities[1] : info?.abilities[0];
    if (ability === C.ABILITY_PICKUP && species !== C.SPECIES_NONE && species !== C.SPECIES_EGG && heldItem === C.ITEM_NONE && !(random() % 10)) {
      const r = random() % 100;
      let j = 0;
      for (; j < 15; j++) if (items[j].chance > r) break;
      SetMonData(mon, C.MON_DATA_HELD_ITEM, items[j].itemId);
    }
  }
  adv(1);
}

export function Cmd_docastformchangeanimation(): void {
  G.gActiveBattler = gBattleScripting.battler;
  if (gBattleMons[G.gActiveBattler].status2 & C.STATUS2_SUBSTITUTE) gBattleStruct.formToChangeInto |= C.CASTFORM_SUBSTITUTE;
  BtlController_EmitBattleAnimation(BUFFER_A, C.B_ANIM_CASTFORM_CHANGE, gBattleStruct.formToChangeInto);
  MarkBattlerForControllerExec(G.gActiveBattler);
  adv(1);
}

export function Cmd_trycastformdatachange(): void {
  adv(1);
  const form = CastformDataTypeChange(gBattleScripting.battler);
  if (form) {
    BattleScriptPushCursorAndCallback(BS("BattleScript_CastformChange"));
    gBattleStruct.formToChangeInto = form - 1;
  }
}

export function Cmd_settypebasedhalvers(): void {
  let worked = false;
  const a = G.gBattlerAttacker;
  if (gBattleMoves(G.gCurrentMove).effect === C.EFFECT_MUD_SPORT) {
    if (!(gStatuses3[a] & C.STATUS3_MUDSPORT)) {
      gStatuses3[a] |= C.STATUS3_MUDSPORT;
      gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_WEAKEN_ELECTRIC;
      worked = true;
    }
  } else if (!(gStatuses3[a] & C.STATUS3_WATERSPORT)) {
    gStatuses3[a] |= C.STATUS3_WATERSPORT;
    gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_WEAKEN_FIRE;
    worked = true;
  }
  if (worked) adv(5);
  else jumpTo(1);
}

export function Cmd_setweatherballtype(): void {
  if (WEATHER_HAS_EFFECT()) {
    if (G.gBattleWeather & C.B_WEATHER_ANY) gBattleScripting.dmgMultiplier = 2;
    let type = C.TYPE_NORMAL;
    if (G.gBattleWeather & C.B_WEATHER_RAIN) type = C.TYPE_WATER;
    else if (G.gBattleWeather & C.B_WEATHER_SANDSTORM) type = C.TYPE_ROCK;
    else if (G.gBattleWeather & C.B_WEATHER_SUN) type = C.TYPE_FIRE;
    else if (G.gBattleWeather & C.B_WEATHER_HAIL) type = C.TYPE_ICE;
    gBattleStruct.dynamicMoveType = type | F_DYNAMIC_TYPE_2;
  }
  adv(1);
}

export function Cmd_tryrecycleitem(): void {
  G.gActiveBattler = G.gBattlerAttacker;
  const b = G.gActiveBattler;
  const used = gBattleStruct.usedHeldItems;
  if (used[b] !== C.ITEM_NONE && gBattleMons[b].item === C.ITEM_NONE) {
    G.gLastUsedItem = used[b];
    used[b] = C.ITEM_NONE;
    gBattleMons[b].item = G.gLastUsedItem;
    BtlController_EmitSetMonData(BUFFER_A, C.REQUEST_HELDITEM_BATTLE, 0, 2, u16bytes(gBattleMons[b].item));
    MarkBattlerForControllerExec(b);
    adv(5);
  } else {
    jumpTo(1);
  }
}

export function Cmd_settypetoterrain(): void {
  const type = T.terrainToType[G.gBattleTerrain];
  if (!IS_BATTLER_OF_TYPE(G.gBattlerAttacker, type)) {
    SET_BATTLER_TYPE(G.gBattlerAttacker, type);
    PREPARE_TYPE_BUFFER(gBattleTextBuff1, type);
    adv(5);
  } else {
    jumpTo(1);
  }
}

export function Cmd_pursuitdoubles(): void {
  G.gActiveBattler = GetBattlerAtPosition(GetBattlerPosition(G.gBattlerAttacker) ^ C.BIT_FLANK);
  const b = G.gActiveBattler;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_DOUBLE && !(G.gAbsentBattlerFlags & gBitTable[b]) && gChosenActionByBattler[b] === C.B_ACTION_USE_MOVE && gChosenMoveByBattler[b] === C.MOVE_PURSUIT) {
    gActionsByTurnOrder[b] = C.B_ACTION_TRY_FINISH;
    G.gCurrentMove = C.MOVE_PURSUIT;
    adv(5);
    gBattleScripting.animTurn = 1;
    gBattleScripting.pursuitDoublesAttacker = G.gBattlerAttacker;
    G.gBattlerAttacker = b;
  } else {
    jumpTo(1);
  }
}

export function Cmd_snatchsetbattlers(): void {
  G.gEffectBattler = G.gBattlerAttacker;
  if (G.gBattlerAttacker === G.gBattlerTarget) G.gBattlerAttacker = G.gBattlerTarget = gBattleScripting.battler;
  else G.gBattlerTarget = gBattleScripting.battler;
  gBattleScripting.battler = G.gEffectBattler;
  adv(1);
}

export function Cmd_removelightscreenreflect(): void {
  const side = GetBattlerSide(G.gBattlerAttacker) ^ C.BIT_SIDE;
  if (gSideTimers[side].reflectTimer || gSideTimers[side].lightscreenTimer) {
    gSideStatuses[side] &= ~C.SIDE_STATUS_REFLECT;
    gSideStatuses[side] &= ~C.SIDE_STATUS_LIGHTSCREEN;
    gSideTimers[side].reflectTimer = 0;
    gSideTimers[side].lightscreenTimer = 0;
    gBattleScripting.animTurn = 1;
    gBattleScripting.animTargetsHit = 1;
  } else {
    gBattleScripting.animTurn = 0;
    gBattleScripting.animTargetsHit = 0;
  }
  adv(1);
}

function Sqrt(num: number): number {
  return Math.floor(Math.sqrt(num >>> 0));
}

export function Cmd_handleballthrow(): void {
  let ballMultiplier = 0;
  if (G.gBattleControllerExecFlags) return;
  G.gActiveBattler = G.gBattlerAttacker;
  G.gBattlerTarget = G.gBattlerAttacker ^ C.BIT_SIDE;
  const t = G.gBattlerTarget;
  if (G.gBattleTypeFlags & C.BATTLE_TYPE_GHOST) {
    BtlController_EmitBallThrowAnim(BUFFER_A, C.BALL_GHOST_DODGE);
    MarkBattlerForControllerExec(G.gActiveBattler);
    G.gBattlescriptCurrInstr = BS("BattleScript_GhostBallDodge");
  } else if (G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER) {
    BtlController_EmitBallThrowAnim(BUFFER_A, C.BALL_TRAINER_BLOCK);
    MarkBattlerForControllerExec(G.gActiveBattler);
    G.gBattlescriptCurrInstr = BS("BattleScript_TrainerBallBlock");
  } else if (G.gBattleTypeFlags & (C.BATTLE_TYPE_POKEDUDE | C.BATTLE_TYPE_OLD_MAN_TUTORIAL)) {
    BtlController_EmitBallThrowAnim(BUFFER_A, C.BALL_3_SHAKES_SUCCESS);
    MarkBattlerForControllerExec(G.gActiveBattler);
    G.gBattlescriptCurrInstr = BS("BattleScript_OldMan_Pokedude_CaughtMessage");
  } else {
    const item = G.gLastUsedItem;
    const catchRate = item === C.ITEM_SAFARI_BALL ? div(gBattleStruct.safariCatchFactor * 1275, 100) & 0xff : rom.species[gBattleMons[t].species].catchRate;
    if (item > C.ITEM_SAFARI_BALL) {
      switch (item) {
        case C.ITEM_NET_BALL:
          ballMultiplier = IS_BATTLER_OF_TYPE(t, C.TYPE_WATER) || IS_BATTLER_OF_TYPE(t, C.TYPE_BUG) ? 30 : 10;
          break;
        case C.ITEM_DIVE_BALL:
          ballMultiplier = GetCurrentMapType() === C.MAP_TYPE_UNDERWATER ? 35 : 10;
          break;
        case C.ITEM_NEST_BALL:
          if (gBattleMons[t].level < 40) {
            ballMultiplier = 40 - gBattleMons[t].level;
            if (ballMultiplier <= 9) ballMultiplier = 10;
          } else {
            ballMultiplier = 10;
          }
          break;
        case C.ITEM_REPEAT_BALL:
          ballMultiplier = GetSetPokedexFlag(SpeciesToNationalPokedexNum(gBattleMons[t].species), C.FLAG_GET_CAUGHT) ? 30 : 10;
          break;
        case C.ITEM_TIMER_BALL:
          ballMultiplier = gBattleResults.battleTurnCounter + 10;
          if (ballMultiplier > 40) ballMultiplier = 40;
          break;
        case C.ITEM_LUXURY_BALL:
        case C.ITEM_PREMIER_BALL:
          ballMultiplier = 10;
          break;
      }
    } else {
      ballMultiplier = T.ballCatchBonuses[item - C.ITEM_ULTRA_BALL];
    }
    let odds = div(div(catchRate * ballMultiplier, 10) * (gBattleMons[t].maxHP * 3 - gBattleMons[t].hp * 2), 3 * gBattleMons[t].maxHP) >>> 0;
    if (gBattleMons[t].status1 & (C.STATUS1_SLEEP | C.STATUS1_FREEZE)) odds *= 2;
    if (gBattleMons[t].status1 & (C.STATUS1_POISON | C.STATUS1_BURN | C.STATUS1_PARALYSIS | C.STATUS1_TOXIC_POISON)) odds = div(odds * 15, 10);
    if (item !== C.ITEM_SAFARI_BALL) {
      if (item === C.ITEM_MASTER_BALL) gBattleResults.usedMasterBall = 1;
      else if (gBattleResults.catchAttempts[item - C.ITEM_ULTRA_BALL] < 255) gBattleResults.catchAttempts[item - C.ITEM_ULTRA_BALL]++;
    }
    const caught = () => {
      G.gBattlescriptCurrInstr = BS("BattleScript_SuccessBallThrow");
      SetMonData(gEnemyParty[gBattlerPartyIndexes[t]], C.MON_DATA_POKEBALL, G.gLastUsedItem);
      gBattleCommunication[C.MULTISTRING_CHOOSER] = CalculatePlayerPartyCount() === 6 ? 0 : 1;
    };
    if (odds > 254) {
      BtlController_EmitBallThrowAnim(BUFFER_A, C.BALL_3_SHAKES_SUCCESS);
      MarkBattlerForControllerExec(G.gActiveBattler);
      caught();
    } else {
      odds = Sqrt(Sqrt(Math.trunc(16711680 / odds)));
      odds = Math.trunc(1048560 / odds);
      let shakes = 0;
      for (; shakes < C.BALL_3_SHAKES_SUCCESS && random() < odds; shakes++) { /* shake */ }
      if (item === C.ITEM_MASTER_BALL) shakes = C.BALL_3_SHAKES_SUCCESS;
      BtlController_EmitBallThrowAnim(BUFFER_A, shakes);
      MarkBattlerForControllerExec(G.gActiveBattler);
      if (shakes === C.BALL_3_SHAKES_SUCCESS) {
        caught();
      } else {
        gBattleCommunication[C.MULTISTRING_CHOOSER] = shakes;
        G.gBattlescriptCurrInstr = BS("BattleScript_ShakeBallThrow");
      }
    }
  }
}

export function Cmd_givecaughtmon(): void {
  const enemy = gEnemyParty[gBattlerPartyIndexes[G.gBattlerAttacker ^ C.BIT_SIDE]];
  if (GiveMonToPlayer(enemy) !== C.MON_GIVEN_TO_PARTY) {
    const nick: number[] = [];
    GetMonData(enemy, C.MON_DATA_NICKNAME, nick);
    if (!ShouldShowBoxWasFullMessage()) {
      gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SENT_SOMEONES_PC;
      stringVars.var1 = GetBoxNamePtr(varGet(C.VAR_PC_BOX_TO_SEND_MON));
      stringVars.var2 = Uint8Array.from(nick);
    } else {
      stringVars.var1 = GetBoxNamePtr(varGet(C.VAR_PC_BOX_TO_SEND_MON));
      stringVars.var2 = Uint8Array.from(nick);
      stringVars.var3 = GetBoxNamePtr(GetPCBoxToSendMon());
      gBattleCommunication[C.MULTISTRING_CHOOSER] = C.B_MSG_SOMEONES_BOX_FULL;
    }
    if (flagGet(C.FLAG_SYS_NOT_SOMEONES_PC)) gBattleCommunication[C.MULTISTRING_CHOOSER]++;
  }
  gBattleResults.caughtMonSpecies = gBattleMons[G.gBattlerAttacker ^ C.BIT_SIDE].species;
  GetMonData(enemy, C.MON_DATA_NICKNAME, gBattleResults.caughtMonNick);
  adv(1);
}

export function Cmd_trysetcaughtmondexflags(): void {
  const species = GetMonData(gEnemyParty[0], C.MON_DATA_SPECIES);
  const personality = GetMonData(gEnemyParty[0], C.MON_DATA_PERSONALITY);
  if (GetSetPokedexFlag(SpeciesToNationalPokedexNum(species), C.FLAG_GET_CAUGHT)) {
    jumpTo(1);
  } else {
    HandleSetPokedexFlag(SpeciesToNationalPokedexNum(species), C.FLAG_SET_CAUGHT, personality);
    adv(5);
  }
}

export function Cmd_displaydexinfo(): void {
  const species = GetMonData(gEnemyParty[0], C.MON_DATA_SPECIES);
  switch (gBattleCommunication[0]) {
    case 0:
      BeginNormalPaletteFade(PALETTES_ALL, 0, 0, 16, RGB_WHITE);
      gBattleCommunication[0]++;
      break;
    case 1:
      if (!gPaletteFade.active) {
        FreeAllWindowBuffers();
        gBattleCommunication[C.TASK_ID] = DexScreen_RegisterMonToPokedex(species);
        gBattleCommunication[0]++;
      }
      break;
    case 2:
      if (!gPaletteFade.active && gMain.callback2 === BattleMainCB2 && !tasks.tasks[gBattleCommunication[C.TASK_ID]]?.isActive) {
        ppu.vram.fill(0);
        SetVBlankCallback(VBlankCB_Battle);
        gBattleCommunication[0]++;
      }
      break;
    case 3:
      InitBattleBgsVideo();
      LoadBattleTextboxAndBackground();
      G.gBattle_BG3_X = 256;
      gBattleCommunication[0]++;
      break;
    case 4:
      if (!IsDma3ManagerBusyWithBgCopy()) {
        CreateMonPicSprite_HandleDeoxys(species, gBattleMons[C.B_POSITION_OPPONENT_LEFT].otId, gBattleMons[C.B_POSITION_OPPONENT_LEFT].personality, true, 120, 64, 0, 0xffff);
        gPlttBufferFaded.fill(0, 0, 0x100);
        BeginNormalPaletteFade(0x1ffff, 0, 16, 0, RGB_BLACK);
        ShowBg(0);
        ShowBg(3);
        gBattleCommunication[0]++;
      }
      break;
    case 5:
      if (!gPaletteFade.active) adv(1);
      break;
  }
}

/** HandleBattleWindow: draws (or clears) a menu frame on BG0/BG1 tilemaps. */
export function HandleBattleWindow(xStart: number, yStart: number, xEnd: number, yEnd: number, flags: number): void {
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      let v: number;
      if (y === yStart) v = x === xStart ? 0x1022 : x === xEnd ? 0x1024 : 0x1023;
      else if (y === yEnd) v = x === xStart ? 0x1028 : x === xEnd ? 0x102a : 0x1029;
      else v = x === xStart ? 0x1025 : x === xEnd ? 0x1027 : 0x1026;
      if (flags & WINDOW_CLEAR) v = 0;
      CopyToBgTilemapBufferRect_ChangePalette(flags & WINDOW_BG1 ? 1 : 0, [v], x, y, 1, 1, 0x11);
    }
  }
  CopyBgTilemapBufferToVram(1);
}

export function BattleCreateYesNoCursorAt(): void {
  CopyToBgTilemapBufferRect_ChangePalette(0, [1, 2], 0x18, 9 + 2 * gBattleCommunication[1], 1, 2, 0x11);
  CopyBgTilemapBufferToVram(0);
}

export function BattleDestroyYesNoCursorAt(): void {
  CopyToBgTilemapBufferRect_ChangePalette(0, [32, 32], 0x18, 9 + 2 * gBattleCommunication[1], 1, 2, 0x11);
  CopyBgTilemapBufferToVram(0);
}

export function Cmd_trygivecaughtmonnick(): void {
  const enemy = gEnemyParty[gBattlerPartyIndexes[G.gBattlerAttacker ^ C.BIT_SIDE]];
  switch (gBattleCommunication[C.MULTIUSE_STATE]) {
    case 0:
      HandleBattleWindow(23, 8, 29, 13, 0);
      BattlePutTextOnWindow(rom.text("gText_BattleYesNoChoice"), C.B_WIN_YESNO);
      gBattleCommunication[C.MULTIUSE_STATE]++;
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
      if (JOY_NEW(A_BUTTON)) {
        sound.playSE(C.SE_SELECT);
        if (gBattleCommunication[C.CURSOR_POSITION] === 0) {
          gBattleCommunication[C.MULTIUSE_STATE]++;
          BeginFastPaletteFade(3);
        } else {
          gBattleCommunication[C.MULTIUSE_STATE] = 4;
        }
      } else if (JOY_NEW(B_BUTTON)) {
        sound.playSE(C.SE_SELECT);
        gBattleCommunication[C.MULTIUSE_STATE] = 4;
      }
      break;
    case 2:
      if (!gPaletteFade.active) {
        GetMonData(enemy, C.MON_DATA_NICKNAME, gBattleStruct.caughtMonNick);
        FreeAllWindowBuffers();
        DoNamingScreen(C.NAMING_SCREEN_CAUGHT_MON, gBattleStruct.caughtMonNick, GetMonData(enemy, C.MON_DATA_SPECIES), GetMonGender(enemy), GetMonData(enemy, C.MON_DATA_PERSONALITY), BattleMainCB2);
        gBattleCommunication[C.MULTIUSE_STATE]++;
      }
      break;
    case 3:
      if (gMain.callback2 === BattleMainCB2 && !gPaletteFade.active) {
        SetMonData(enemy, C.MON_DATA_NICKNAME, gBattleStruct.caughtMonNick);
        jumpTo(1);
      }
      break;
    case 4:
      if (CalculatePlayerPartyCount() === 6) adv(5);
      else jumpTo(1);
      break;
  }
}

export function Cmd_subattackerhpbydmg(): void {
  gBattleMons[G.gBattlerAttacker].hp -= G.gBattleMoveDamage;
  adv(1);
}

export function Cmd_removeattackerstatus1(): void {
  gBattleMons[G.gBattlerAttacker].status1 = 0;
  adv(1);
}

export function Cmd_finishaction(): void {
  G.gCurrentActionFuncId = C.B_ACTION_FINISHED;
}

export function Cmd_finishturn(): void {
  G.gCurrentActionFuncId = C.B_ACTION_FINISHED;
  G.gCurrentTurnActionNumber = G.gBattlersCount;
}
