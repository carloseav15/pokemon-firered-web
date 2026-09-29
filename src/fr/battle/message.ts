// battle_message.c: battle string selection, placeholder expansion, text windows and the PREPARE_*_BUFFER macros.

import * as C from "../generated/constants";
import { cdata, incbin16, symName } from "../hw/assets";
import { flagGet } from "../save";
import { gPlttBufferFaded, gPlttBufferUnfaded } from "../hw/palette";
import { AddTextPrinter } from "../hw/text";
import { CopyWindowToVram, COPYWIN_FULL, FillWindowPixelBuffer, PutWindowTilemap } from "../hw/window";
import { getTextSpeedSetting, textFlags } from "../gba/textPrinter";
import { GetStringWidth } from "../gba/font";
import { battleHost } from "./host";
import { rom, b64 } from "../rom";
import { save } from "../save";
import { intToDecimal, STR_CONV_MODE_LEFT_ALIGN } from "../gba/charmap";
import {
  G, gBattleBufferA, gBattleMons, gBattleResources, gBattleScripting, gBattleStruct, gBattleTextBuff1, gBattleTextBuff2, gBattleTextBuff3, gBattlerPartyIndexes,
  gDisplayedStringBattle, gMoveSelectionCursor,
} from "./globals";
import { GetBattlerAtPosition, GetBattlerSide } from "./util";
import { GetMonData, GetSecretBaseTrainerNameIndex, gEnemyParty, playerMon } from "../pokemon/mon";

export const B_BUFF_STRING = 0;
export const B_BUFF_NUMBER = 1;
export const B_BUFF_MOVE = 2;
export const B_BUFF_TYPE = 3;
export const B_BUFF_MON_NICK_WITH_PREFIX = 4;
export const B_BUFF_STAT = 5;
export const B_BUFF_SPECIES = 6;
export const B_BUFF_MON_NICK = 7;
export const B_BUFF_NEGATIVE_FLAVOR = 8;
export const B_BUFF_ABILITY = 9;
export const B_BUFF_ITEM = 10;
export const B_BUFF_PLACEHOLDER_BEGIN = 0xfd;
export const B_BUFF_EOS = 0xff;

const EOS = 0xff;
const TEXT_BUFF_ARRAY_COUNT = 16;

/** A static u8 string from battle_message.c. */
function S(name: string): number[] {
  return cdata<number[]>("battle_message", name);
}

/** Resolve a pointer entry of a const u8 *const table to its string bytes. */
function symStr(v: unknown): number[] {
  const name = symName(v);
  if (!name) return [EOS];
  return cdata<number[] | undefined>("battle_message", name) ?? Array.from(rom.text(name));
}

// ---------------------------------------------------------------- PREPARE_*_BUFFER (battle_message.h)

type Buf = Uint8Array;

export function PREPARE_FLAVOR_BUFFER(buf: Buf, flavorId: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_NEGATIVE_FLAVOR, flavorId, EOS]);
}
export function PREPARE_STAT_BUFFER(buf: Buf, statId: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_STAT, statId, EOS]);
}
export function PREPARE_ABILITY_BUFFER(buf: Buf, abilityId: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_ABILITY, abilityId, EOS]);
}
export function PREPARE_TYPE_BUFFER(buf: Buf, typeId: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_TYPE, typeId, EOS]);
}
export function PREPARE_BYTE_NUMBER_BUFFER(buf: Buf, maxDigits: number, number: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_NUMBER, 1, maxDigits, number & 0xff, EOS]);
}
export function PREPARE_HWORD_NUMBER_BUFFER(buf: Buf, maxDigits: number, number: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_NUMBER, 2, maxDigits, number & 0xff, (number >> 8) & 0xff, EOS]);
}
export function PREPARE_WORD_NUMBER_BUFFER(buf: Buf, maxDigits: number, number: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_NUMBER, 4, maxDigits, number & 0xff, (number >> 8) & 0xff, (number >> 16) & 0xff, (number >>> 24) & 0xff, EOS]);
}
export function PREPARE_STRING_BUFFER(buf: Buf, stringId: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_STRING, stringId & 0xff, (stringId >> 8) & 0xff, EOS]);
}
export function PREPARE_MOVE_BUFFER(buf: Buf, move: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_MOVE, move & 0xff, (move >> 8) & 0xff, EOS]);
}
export function PREPARE_ITEM_BUFFER(buf: Buf, item: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_ITEM, item & 0xff, (item >> 8) & 0xff, EOS]);
}
export function PREPARE_SPECIES_BUFFER(buf: Buf, species: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_SPECIES, species & 0xff, (species >> 8) & 0xff, EOS]);
}
export function PREPARE_MON_NICK_WITH_PREFIX_BUFFER(buf: Buf, battler: number, partyId: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_MON_NICK_WITH_PREFIX, battler, partyId, EOS]);
}
export function PREPARE_MON_NICK_BUFFER(buf: Buf, battler: number, partyId: number): void {
  buf.set([B_BUFF_PLACEHOLDER_BEGIN, B_BUFF_MON_NICK, battler, partyId, EOS]);
}

// ---------------------------------------------------------------- string id tables

const idTable = (name: string) => cdata<number[]>("battle_message", name);
export const gMissStringIds = () => idTable("gMissStringIds");
export const gTrappingMoves = () => idTable("gTrappingMoves");
export const gStringIdTable = idTable;

// ---------------------------------------------------------------- BufferStringBattle

type MsgData = {
  currentMove: number; originallyUsedMove: number; lastItem: number; lastAbility: number; scrActive: number; bakScriptPartyIdx: number;
  hpScale: number; itemEffectBattler: number; moveType: number; abilities: number[];
};

let sBattleMsgData: MsgData = {
  currentMove: 0, originallyUsedMove: 0, lastItem: 0, lastAbility: 0, scrActive: 0, bakScriptPartyIdx: 0, hpScale: 0, itemEffectBattler: 0, moveType: 0,
  abilities: [0, 0, 0, 0],
};
const sBattlerAbilities = [0, 0, 0, 0];

function readMsgData(buf: Uint8Array, o: number): MsgData {
  const u16 = (i: number) => buf[o + i] | (buf[o + i + 1] << 8);
  return {
    currentMove: u16(0), originallyUsedMove: u16(2), lastItem: u16(4), lastAbility: buf[o + 6], scrActive: buf[o + 7], bakScriptPartyIdx: buf[o + 8],
    hpScale: buf[o + 9], itemEffectBattler: buf[o + 10], moveType: buf[o + 11], abilities: [buf[o + 12], buf[o + 13], buf[o + 14], buf[o + 15]],
  };
}

function copyStr(dst: Uint8Array, src: ArrayLike<number>): void {
  let i = 0;
  for (; i < src.length && src[i] !== EOS && i < dst.length - 1; i++) dst[i] = src[i];
  dst[i] = EOS;
}

export function BufferStringBattle(stringId: number): void {
  const buf = gBattleBufferA[G.gActiveBattler];
  sBattleMsgData = readMsgData(buf, 4);
  const d = sBattleMsgData;
  G.gLastUsedItem = d.lastItem;
  G.gLastUsedAbility = d.lastAbility;
  gBattleScripting.battler = d.scrActive;
  gBattleStruct.scriptPartyIdx = d.bakScriptPartyIdx;
  gBattleStruct.hpScale = d.hpScale;
  G.gPotentialItemEffectBattler = d.itemEffectBattler;
  gBattleStruct.stringMoveType = d.moveType;
  for (let i = 0; i < C.MAX_BATTLERS_COUNT; i++) sBattlerAbilities[i] = d.abilities[i];
  for (let i = 0; i < TEXT_BUFF_ARRAY_COUNT; i++) {
    gBattleTextBuff1[i] = buf[4 + 16 + i];
    gBattleTextBuff2[i] = buf[4 + 32 + i];
    gBattleTextBuff3[i] = buf[4 + 48 + i];
  }
  const flags = G.gBattleTypeFlags;
  const opp = G.gTrainerBattleOpponent_A;
  let str: number[];
  switch (stringId) {
    case C.STRINGID_INTROMSG:
      if (flags & C.BATTLE_TYPE_TRAINER) {
        if (flags & C.BATTLE_TYPE_LINK) {
          if (flags & C.BATTLE_TYPE_MULTI) str = S("sText_TwoLinkTrainersWantToBattle");
          else str = opp === C.TRAINER_UNION_ROOM ? S("sText_Trainer1WantsToBattle") : S("sText_LinkTrainerWantsToBattle");
        } else {
          str = S("sText_Trainer1WantsToBattle");
        }
      } else if (flags & C.BATTLE_TYPE_GHOST) {
        str = flags & C.BATTLE_TYPE_GHOST_UNVEILED ? S("sText_TheGhostAppeared") : S("sText_GhostAppearedCantId");
      } else if (flags & C.BATTLE_TYPE_LEGENDARY) str = S("sText_WildPkmnAppeared2");
      else if (flags & C.BATTLE_TYPE_DOUBLE) str = S("sText_TwoWildPkmnAppeared");
      else if (flags & C.BATTLE_TYPE_OLD_MAN_TUTORIAL) str = S("sText_WildPkmnAppearedPause");
      else str = S("sText_WildPkmnAppeared");
      break;
    case C.STRINGID_INTROSENDOUT:
      if (GetBattlerSide(G.gActiveBattler) === C.B_SIDE_PLAYER) {
        if (flags & C.BATTLE_TYPE_DOUBLE) str = flags & C.BATTLE_TYPE_MULTI ? S("sText_LinkPartnerSentOutPkmnGoPkmn") : S("sText_GoTwoPkmn");
        else str = S("sText_GoPkmn");
      } else if (flags & C.BATTLE_TYPE_DOUBLE) {
        if (flags & C.BATTLE_TYPE_MULTI) str = S("sText_TwoLinkTrainersSentOutPkmn");
        else if (flags & C.BATTLE_TYPE_LINK) str = S("sText_LinkTrainerSentOutTwoPkmn");
        else str = S("sText_Trainer1SentOutTwoPkmn");
      } else if (!(flags & C.BATTLE_TYPE_LINK) || opp === C.TRAINER_UNION_ROOM) {
        str = S("sText_Trainer1SentOutPkmn");
      } else {
        str = S("sText_LinkTrainerSentOutPkmn");
      }
      break;
    case C.STRINGID_RETURNMON:
      if (GetBattlerSide(G.gActiveBattler) === C.B_SIDE_PLAYER) {
        const hp = gBattleStruct.hpScale;
        if (hp === 0) str = S("sText_PkmnThatsEnough");
        else if (hp === 1 || flags & C.BATTLE_TYPE_DOUBLE) str = S("sText_PkmnComeBack");
        else if (hp === 2) str = S("sText_PkmnOkComeBack");
        else str = S("sText_PkmnGoodComeBack");
      } else if (opp === C.TRAINER_LINK_OPPONENT) {
        str = flags & C.BATTLE_TYPE_MULTI ? S("sText_LinkTrainer2WithdrewPkmn") : S("sText_LinkTrainer1WithdrewPkmn");
      } else {
        str = S("sText_Trainer1WithdrewPkmn");
      }
      break;
    case C.STRINGID_SWITCHINMON:
      if (GetBattlerSide(gBattleScripting.battler) === C.B_SIDE_PLAYER) {
        const hp = gBattleStruct.hpScale;
        if (hp === 0 || flags & C.BATTLE_TYPE_DOUBLE) str = S("sText_GoPkmn2");
        else if (hp === 1) str = S("sText_DoItPkmn");
        else if (hp === 2) str = S("sText_GoForItPkmn");
        else str = S("sText_YourFoesWeakGetEmPkmn");
      } else if (flags & C.BATTLE_TYPE_LINK) {
        if (flags & C.BATTLE_TYPE_MULTI) str = S("sText_LinkTrainerMultiSentOutPkmn");
        else if (opp === C.TRAINER_UNION_ROOM) str = S("sText_Trainer1SentOutPkmn2");
        else str = S("sText_LinkTrainerSentOutPkmn2");
      } else {
        str = S("sText_Trainer1SentOutPkmn2");
      }
      break;
    case C.STRINGID_USEDMOVE:
      ChooseMoveUsedParticle(gBattleTextBuff1);
      if (d.currentMove >= C.MOVES_COUNT) copyStr(gBattleTextBuff2, symStr(cdata<unknown[]>("battle_message", "sATypeMove_Table")[gBattleStruct.stringMoveType]));
      else copyStr(gBattleTextBuff2, b64(rom.moves[d.currentMove].name));
      ChooseTypeOfMoveUsedString(gBattleTextBuff2);
      str = S("sText_AttackerUsedX");
      break;
    case C.STRINGID_BATTLEEND: {
      const b1 = gBattleTextBuff1;
      const oppSide = GetBattlerSide(G.gActiveBattler) === C.B_SIDE_OPPONENT;
      if (b1[0] & C.B_OUTCOME_LINK_BATTLE_RAN) {
        b1[0] &= ~C.B_OUTCOME_LINK_BATTLE_RAN;
        if (oppSide && b1[0] !== C.B_OUTCOME_DREW) b1[0] ^= C.B_OUTCOME_LOST | C.B_OUTCOME_WON;
        if (b1[0] === C.B_OUTCOME_LOST || b1[0] === C.B_OUTCOME_DREW) str = S("sText_GotAwaySafely");
        else if (flags & C.BATTLE_TYPE_MULTI) str = S("sText_TwoWildFled");
        else if (opp === C.TRAINER_UNION_ROOM) str = S("sText_Trainer1Fled");
        else str = S("sText_WildFled");
      } else {
        if (oppSide && b1[0] !== C.B_OUTCOME_DREW) b1[0] ^= C.B_OUTCOME_LOST | C.B_OUTCOME_WON;
        const pick = (won: string, lost: string, drew: string) => S(b1[0] === C.B_OUTCOME_WON ? won : b1[0] === C.B_OUTCOME_LOST ? lost : drew);
        if (flags & C.BATTLE_TYPE_MULTI) str = pick("sText_TwoLinkTrainersDefeated", "sText_PlayerLostToTwo", "sText_PlayerBattledToDrawVsTwo");
        else if (opp === C.TRAINER_UNION_ROOM) str = pick("sText_PlayerDefeatedLinkTrainerTrainer1", "sText_PlayerLostAgainstTrainer1", "sText_PlayerBattledToDrawTrainer1");
        else str = pick("sText_PlayerDefeatedLinkTrainer", "sText_PlayerLostAgainstLinkTrainer", "sText_PlayerBattledToDrawLinkTrainer");
      }
      break;
    }
    default:
      if (stringId >= C.BATTLESTRINGS_COUNT) {
        gDisplayedStringBattle[0] = EOS;
        return;
      }
      str = symStr(cdata<unknown[]>("battle_message", "gBattleStringsTable")[stringId - C.BATTLESTRINGS_TABLE_START]);
      break;
  }
  BattleStringExpandPlaceholdersToDisplayedString(str);
}

export function BattleStringExpandPlaceholdersToDisplayedString(src: ArrayLike<number>): number {
  return BattleStringExpandPlaceholders(src, gDisplayedStringBattle);
}

/** Compares the first 8 bytes of src with the Japanese status names and returns the English one. */
function TryGetStatusString(src: ArrayLike<number>, off: number): number[] | null {
  const status = [EOS - 0xff + 0x7f, 0, 0, 0, 0, 0, 0, 0].fill(0xff);
  for (let i = 0; i < 8 && src[off + i] !== EOS; i++) status[i] = src[off + i];
  const table = cdata<unknown[][]>("battle_main", "gStatusConditionStringsTable");
  for (const [jp, en] of table) {
    const jpBytes = cdata<number[]>("battle_main", symName(jp)!);
    let same = true;
    for (let i = 0; i < 8; i++) if ((jpBytes[i] ?? 0) !== status[i]) same = false;
    if (same) return symStr(en);
  }
  return null;
}

function strip(a: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length && a[i] !== EOS; i++) out.push(a[i]);
  return out;
}

/** GetMonData(NICKNAME) + StringGet_Nickname (truncate to POKEMON_NAME_LENGTH). */
function nickname(side: number, partyIdx: number): number[] {
  const mon = side === C.B_SIDE_PLAYER ? playerMon(partyIdx) : gEnemyParty[partyIdx];
  const text: number[] = [];
  GetMonData(mon, C.MON_DATA_NICKNAME, text);
  return strip(text).slice(0, C.POKEMON_NAME_LENGTH);
}

/** HANDLE_NICKNAME_STRING_CASE: prefix for the opposing side, then the nickname. */
function nicknameWithPrefix(battler: number, monIndex: number): number[] {
  const side = GetBattlerSide(battler);
  const out: number[] = [];
  if (side !== C.B_SIDE_PLAYER) out.push(...strip(S(G.gBattleTypeFlags & C.BATTLE_TYPE_TRAINER ? "sText_FoePkmnPrefix" : "sText_WildPkmnPrefix")));
  out.push(...nickname(side, monIndex));
  return out;
}

const abilityName = (id: number) => strip(b64(rom.abilities[id]?.name ?? rom.abilities[0].name));
const moveName = (id: number) => strip(b64(rom.moves[id].name));
const itemNameBytes = (id: number) => strip(rom.items[id] ? b64(rom.items[id].name) : [EOS]);

function ATypeMove(): number[] {
  return strip(symStr(cdata<unknown[]>("battle_message", "sATypeMove_Table")[gBattleStruct.stringMoveType]));
}

function trainerName(): number[] {
  const t = rom.trainers[G.gTrainerBattleOpponent_A];
  const cls = t?.class;
  if (cls === C.TRAINER_CLASS_RIVAL_EARLY || cls === C.TRAINER_CLASS_RIVAL_LATE || cls === C.TRAINER_CLASS_CHAMPION) return strip(save.rivalName);
  return t ? strip(b64(t.name)) : [];
}

/** gStringVar1-3 of the battle message (kept as separate scratch buffers). */
const stringVar = [[EOS], [EOS], [EOS]] as number[][];

export function BattleStringExpandPlaceholders(src: ArrayLike<number>, dst: Uint8Array | number[]): number {
  let dstId = 0;
  let s = 0;
  const push = (bytes: ArrayLike<number>) => {
    for (let i = 0; i < bytes.length && bytes[i] !== EOS; i++) dst[dstId++] = bytes[i];
  };
  const prefix2 = (battler: number, ally: string, foe: string) => S(GetBattlerSide(battler) === C.B_SIDE_PLAYER ? ally : foe);
  while (src[s] !== EOS && s < src.length) {
    if (src[s] === C.PLACEHOLDER_BEGIN) {
      s++;
      const code = src[s];
      let toCpy: ArrayLike<number> = [EOS];
      switch (code) {
        case C.B_TXT_BUFF1:
          if (gBattleTextBuff1[0] === B_BUFF_PLACEHOLDER_BEGIN) {
            stringVar[0] = ExpandBattleTextBuffPlaceholders(gBattleTextBuff1);
            toCpy = stringVar[0];
          } else {
            toCpy = TryGetStatusString(gBattleTextBuff1, 0) ?? gBattleTextBuff1;
          }
          break;
        case C.B_TXT_BUFF2:
          if (gBattleTextBuff2[0] === B_BUFF_PLACEHOLDER_BEGIN) {
            stringVar[1] = ExpandBattleTextBuffPlaceholders(gBattleTextBuff2);
            toCpy = stringVar[1];
          } else toCpy = gBattleTextBuff2;
          break;
        case C.B_TXT_BUFF3:
          if (gBattleTextBuff3[0] === B_BUFF_PLACEHOLDER_BEGIN) {
            stringVar[2] = ExpandBattleTextBuffPlaceholders(gBattleTextBuff3);
            toCpy = stringVar[2];
          } else toCpy = gBattleTextBuff3;
          break;
        case C.B_TXT_COPY_VAR_1: toCpy = stringVar[0]; break;
        case C.B_TXT_COPY_VAR_2: toCpy = stringVar[1]; break;
        case C.B_TXT_COPY_VAR_3: toCpy = stringVar[2]; break;
        case C.B_TXT_PLAYER_MON1_NAME: toCpy = nickname(C.B_SIDE_PLAYER, gBattlerPartyIndexes[GetBattlerAtPosition(C.B_POSITION_PLAYER_LEFT)]); break;
        case C.B_TXT_OPPONENT_MON1_NAME: toCpy = nickname(C.B_SIDE_OPPONENT, gBattlerPartyIndexes[GetBattlerAtPosition(C.B_POSITION_OPPONENT_LEFT)]); break;
        case C.B_TXT_PLAYER_MON2_NAME: toCpy = nickname(C.B_SIDE_PLAYER, gBattlerPartyIndexes[GetBattlerAtPosition(C.B_POSITION_PLAYER_RIGHT)]); break;
        case C.B_TXT_OPPONENT_MON2_NAME: toCpy = nickname(C.B_SIDE_OPPONENT, gBattlerPartyIndexes[GetBattlerAtPosition(C.B_POSITION_OPPONENT_RIGHT)]); break;
        case C.B_TXT_ATK_NAME_WITH_PREFIX_MON1:
          toCpy = nicknameWithPrefix(G.gBattlerAttacker, gBattlerPartyIndexes[GetBattlerAtPosition(G.gBattlerAttacker & C.BIT_SIDE)]);
          break;
        case C.B_TXT_ATK_PARTNER_NAME:
          toCpy = nickname(GetBattlerSide(G.gBattlerAttacker), gBattlerPartyIndexes[GetBattlerAtPosition(G.gBattlerAttacker & C.BIT_SIDE) + 2]);
          break;
        case C.B_TXT_ATK_NAME_WITH_PREFIX: toCpy = nicknameWithPrefix(G.gBattlerAttacker, gBattlerPartyIndexes[G.gBattlerAttacker]); break;
        case C.B_TXT_DEF_NAME_WITH_PREFIX: toCpy = nicknameWithPrefix(G.gBattlerTarget, gBattlerPartyIndexes[G.gBattlerTarget]); break;
        case C.B_TXT_EFF_NAME_WITH_PREFIX: toCpy = nicknameWithPrefix(G.gEffectBattler, gBattlerPartyIndexes[G.gEffectBattler]); break;
        case C.B_TXT_ACTIVE_NAME_WITH_PREFIX: toCpy = nicknameWithPrefix(G.gActiveBattler, gBattlerPartyIndexes[G.gActiveBattler]); break;
        case C.B_TXT_SCR_ACTIVE_NAME_WITH_PREFIX:
          toCpy = nicknameWithPrefix(gBattleScripting.battler, gBattlerPartyIndexes[gBattleScripting.battler]);
          break;
        case C.B_TXT_CURRENT_MOVE:
          toCpy = sBattleMsgData.currentMove >= C.MOVES_COUNT ? ATypeMove() : moveName(sBattleMsgData.currentMove);
          break;
        case C.B_TXT_LAST_MOVE:
          toCpy = sBattleMsgData.originallyUsedMove >= C.MOVES_COUNT ? ATypeMove() : moveName(sBattleMsgData.originallyUsedMove);
          break;
        case C.B_TXT_LAST_ITEM: toCpy = itemNameBytes(G.gLastUsedItem); break;
        case C.B_TXT_LAST_ABILITY: toCpy = abilityName(G.gLastUsedAbility); break;
        case C.B_TXT_ATK_ABILITY: toCpy = abilityName(sBattlerAbilities[G.gBattlerAttacker]); break;
        case C.B_TXT_DEF_ABILITY: toCpy = abilityName(sBattlerAbilities[G.gBattlerTarget]); break;
        case C.B_TXT_SCR_ACTIVE_ABILITY: toCpy = abilityName(sBattlerAbilities[gBattleScripting.battler]); break;
        case C.B_TXT_EFF_ABILITY: toCpy = abilityName(sBattlerAbilities[G.gEffectBattler]); break;
        case C.B_TXT_TRAINER1_CLASS: {
          const cls = G.gTrainerBattleOpponent_A === C.TRAINER_SECRET_BASE
            ? GetSecretBaseTrainerNameIndex()
            : rom.trainers[G.gTrainerBattleOpponent_A]?.class ?? 0;
          toCpy = strip(b64(rom.trainerClasses[cls]));
          break;
        }
        case C.B_TXT_TRAINER1_NAME:
          toCpy = G.gTrainerBattleOpponent_A === C.TRAINER_SECRET_BASE
            ? strip(gBattleResources.secretBase.trainerName)
            : trainerName();
          break;
        case C.B_TXT_PLAYER_NAME: toCpy = save.playerName; break;
        case C.B_TXT_TRAINER1_LOSE_TEXT: toCpy = battleHost.trainerLoseText(); break;
        case C.B_TXT_TRAINER1_WIN_TEXT: toCpy = battleHost.trainerWonText(); break;
        case C.B_TXT_26: toCpy = nicknameWithPrefix(gBattleScripting.battler, gBattleStruct.scriptPartyIdx); break;
        case C.B_TXT_PC_CREATOR_NAME: toCpy = S(flagGet(C.FLAG_SYS_NOT_SOMEONES_PC) ? "sText_Bills" : "sText_Someones"); break;
        case C.B_TXT_ATK_PREFIX2: toCpy = prefix2(G.gBattlerAttacker, "sText_AllyPkmnPrefix2", "sText_FoePkmnPrefix3"); break;
        case C.B_TXT_DEF_PREFIX2: toCpy = prefix2(G.gBattlerTarget, "sText_AllyPkmnPrefix2", "sText_FoePkmnPrefix3"); break;
        case C.B_TXT_ATK_PREFIX1: toCpy = prefix2(G.gBattlerAttacker, "sText_AllyPkmnPrefix", "sText_FoePkmnPrefix2"); break;
        case C.B_TXT_DEF_PREFIX1: toCpy = prefix2(G.gBattlerTarget, "sText_AllyPkmnPrefix", "sText_FoePkmnPrefix2"); break;
        case C.B_TXT_ATK_PREFIX3: toCpy = prefix2(G.gBattlerAttacker, "sText_AllyPkmnPrefix3", "sText_FoePkmnPrefix4"); break;
        case C.B_TXT_DEF_PREFIX3: toCpy = prefix2(G.gBattlerTarget, "sText_AllyPkmnPrefix3", "sText_FoePkmnPrefix4"); break;
        // Link / Battle Tower / Trainer Tower names: not reachable without link play or those facilities.
      }
      push(toCpy);
      if (code === C.B_TXT_TRAINER1_LOSE_TEXT || code === C.B_TXT_TRAINER1_WIN_TEXT || code === C.B_TXT_TRAINER2_LOSE_TEXT || code === C.B_TXT_TRAINER2_WIN_TEXT) {
        dst[dstId++] = C.EXT_CTRL_CODE_BEGIN;
        dst[dstId++] = C.EXT_CTRL_CODE_PAUSE_UNTIL_PRESS;
      }
    } else {
      dst[dstId++] = src[s];
    }
    s++;
  }
  dst[dstId++] = EOS;
  return dstId;
}

function ExpandBattleTextBuffPlaceholders(src: Uint8Array): number[] {
  const dst: number[] = [];
  let i = 1;
  const u16 = (o: number) => src[o] | (src[o + 1] << 8);
  while (src[i] !== B_BUFF_EOS && i < src.length) {
    switch (src[i]) {
      case B_BUFF_STRING:
        dst.push(...strip(symStr(cdata<unknown[]>("battle_message", "gBattleStringsTable")[u16(i + 1) - C.BATTLESTRINGS_TABLE_START])));
        i += 3;
        break;
      case B_BUFF_NUMBER: {
        const size = src[i + 1];
        let value = 0;
        if (size === 1) value = src[i + 3];
        else if (size === 2) value = u16(i + 3);
        else if (size === 4) value = (u16(i + 3) | (u16(i + 5) << 16)) >>> 0;
        // ConvertIntToDecimalStringN writes at the start of dst (it does not append)
        dst.length = 0;
        dst.push(...strip(intToDecimal(value, STR_CONV_MODE_LEFT_ALIGN, src[i + 2])));
        i += size + 3;
        break;
      }
      case B_BUFF_MOVE:
        dst.push(...moveName(u16(i + 1)));
        i += 3;
        break;
      case B_BUFF_TYPE:
        dst.push(...strip(b64(rom.typeNames[src[i + 1]])));
        i += 2;
        break;
      case B_BUFF_MON_NICK_WITH_PREFIX:
        dst.push(...nicknameWithPrefix(src[i + 1], src[i + 2]));
        i += 3;
        break;
      case B_BUFF_STAT:
        dst.push(...strip(symStr(cdata<unknown[]>("battle_message", "gStatNamesTable")[src[i + 1]])));
        i += 2;
        break;
      case B_BUFF_SPECIES:
        // GetSpeciesName overwrites dst
        dst.length = 0;
        dst.push(...strip(b64(rom.species[u16(i + 1)].name)));
        i += 3;
        break;
      case B_BUFF_MON_NICK:
        dst.length = 0;
        dst.push(...nickname(GetBattlerSide(src[i + 1]), src[i + 2]));
        i += 3;
        break;
      case B_BUFF_NEGATIVE_FLAVOR:
        dst.push(...strip(symStr(cdata<unknown[]>("battle_message", "gPokeblockWasTooXStringTable")[src[i + 1]])));
        i += 2;
        break;
      case B_BUFF_ABILITY:
        dst.push(...abilityName(src[i + 1]));
        i += 2;
        break;
      case B_BUFF_ITEM:
        // CopyItemName overwrites dst
        dst.length = 0;
        dst.push(...itemNameBytes(u16(i + 1)));
        i += 3;
        break;
      default:
        i++;
        break;
    }
  }
  dst.push(EOS);
  return dst;
}

function grammarCounter(): number {
  const table = cdata<number[]>("battle_message", "sGrammarMoveUsedTable");
  let counter = 0;
  let i = 0;
  while (counter !== 4) {
    if (table[i] === 0) counter++;
    if (table[i++] === sBattleMsgData.currentMove) break;
  }
  return counter;
}

function ChooseMoveUsedParticle(textBuff: Uint8Array): void {
  const counter = grammarCounter();
  if (counter <= 2) copyStr(textBuff, S("sText_SpaceIs"));
  else if (counter <= 4) copyStr(textBuff, S("sText_ApostropheS"));
}

function ChooseTypeOfMoveUsedString(dst: Uint8Array): void {
  let end = 0;
  while (dst[end] !== EOS) end++;
  const marks = ["sText_ExclamationMark", "sText_ExclamationMark2", "sText_ExclamationMark3", "sText_ExclamationMark4", "sText_ExclamationMark5"];
  const str = S(marks[grammarCounter()]);
  let i = 0;
  for (; i < str.length && str[i] !== EOS && end + i < dst.length - 1; i++) dst[end + i] = str[i];
  dst[end + i] = EOS;
}

// ---------------------------------------------------------------- text windows

type BattleWindowText = { fillValue: number; fontId: number; x: number; y: number; letterSpacing: number; lineSpacing: number; speed: number;
  fgColor: number; bgColor: number; shadowColor: number };

const sTextOnWindowsInfo_Normal = (): BattleWindowText[] => cdata<BattleWindowText[]>("battle_message", "sTextOnWindowsInfo_Normal");

/** ContextNpcGetTextColor for the opponent trainer: NPC_TEXT_COLOR_MALE / FEMALE -> FONT_MALE / FONT_FEMALE. */
function npcContextFont(): number {
  return rom.trainers[G.gTrainerBattleOpponent_A]?.female ? C.FONT_FEMALE : C.FONT_MALE;
}

/** windowId: upper 2 bits are text flags (0x40 NPC context font, 0x80 no window clear). */
export function BattlePutTextOnWindow(text: ArrayLike<number>, windowIdWithFlags: number): void {
  const textFlagsBits = windowIdWithFlags & 0xc0;
  const windowId = windowIdWithFlags & 0x3f;
  const info = sTextOnWindowsInfo_Normal()[windowId];
  if (!(textFlagsBits & 0x80)) FillWindowPixelBuffer(windowId, info.fillValue);
  const fontId = textFlagsBits & 0x40 ? npcContextFont() : info.fontId;
  let x: number;
  switch (windowId) {
    case C.B_WIN_VS_PLAYER: case C.B_WIN_VS_OPPONENT: case C.B_WIN_VS_MULTI_PLAYER_1: case C.B_WIN_VS_MULTI_PLAYER_2:
    case C.B_WIN_VS_MULTI_PLAYER_3: case C.B_WIN_VS_MULTI_PLAYER_4:
      x = Math.trunc((48 - GetStringWidth(info.fontId, text, info.letterSpacing)) / 2);
      break;
    case C.B_WIN_VS_OUTCOME_DRAW: case C.B_WIN_VS_OUTCOME_LEFT: case C.B_WIN_VS_OUTCOME_RIGHT:
      x = Math.trunc((64 - GetStringWidth(info.fontId, text, info.letterSpacing)) / 2);
      break;
    default:
      x = info.x;
      break;
  }
  if (x < 0) x = 0;
  textFlags.useAlternateDownArrow = windowId !== C.B_WIN_OAK_OLD_MAN;
  textFlags.autoScroll = !!(G.gBattleTypeFlags & C.BATTLE_TYPE_LINK) || (!!(G.gBattleTypeFlags & C.BATTLE_TYPE_POKEDUDE) && windowId !== C.B_WIN_OAK_OLD_MAN);
  let speed: number;
  if (windowId === C.B_WIN_MSG || windowId === C.B_WIN_OAK_OLD_MAN) {
    speed = G.gBattleTypeFlags & C.BATTLE_TYPE_LINK ? 1 : getTextSpeedSetting();
    textFlags.canABSpeedUpPrint = true;
  } else {
    speed = info.speed;
    textFlags.canABSpeedUpPrint = false;
  }
  AddTextPrinter({ windowId, fontId, x, y: info.y, letterSpacing: info.letterSpacing, lineSpacing: info.lineSpacing, fgColor: info.fgColor,
    bgColor: info.bgColor, shadowColor: info.shadowColor }, text, speed, null);
  if (!(textFlagsBits & 0x80)) {
    PutWindowTilemap(windowId);
    CopyWindowToVram(windowId, COPYWIN_FULL);
  }
}

export function BattleStringShouldBeColored(stringId: number): boolean {
  return stringId === C.STRINGID_TRAINER1LOSETEXT || stringId === C.STRINGID_TRAINER2LOSETEXT
    || stringId === C.STRINGID_TRAINER1WINTEXT || stringId === C.STRINGID_TRAINER2WINTEXT;
}

export function SetPpNumbersPaletteInMoveSelection(): void {
  const b = G.gActiveBattler;
  const buf = gBattleBufferA[b];
  const cur = buf[4 + 8 + gMoveSelectionCursor[b]];
  const max = buf[4 + 12 + gMoveSelectionCursor[b]];
  const pal = incbin16("gPPTextPalette");
  const v = GetCurrentPpToMaxPpState(cur, max);
  const p5 = 5 * 16;
  gPlttBufferUnfaded[p5 + 12] = pal[v * 2 + 0];
  gPlttBufferUnfaded[p5 + 11] = pal[v * 2 + 1];
  gPlttBufferFaded[p5 + 12] = gPlttBufferUnfaded[p5 + 12];
  gPlttBufferFaded[p5 + 11] = gPlttBufferUnfaded[p5 + 11];
}

export function GetCurrentPpToMaxPpState(currentPp: number, maxPp: number): number {
  if (maxPp === currentPp) return 3;
  if (maxPp <= 2) return currentPp > 1 ? 3 : 2 - currentPp;
  if (maxPp <= 7) return currentPp > 2 ? 3 : 2 - currentPp;
  if (currentPp === 0) return 2;
  if (currentPp <= Math.trunc(maxPp / 4)) return 1;
  if (currentPp > Math.trunc(maxPp / 2)) return 3;
  return 0;
}

// battle_script_commands.c helpers used from here and from the controllers
export { HandleBattleWindow, BattleCreateYesNoCursorAt, BattleDestroyYesNoCursorAt } from "./cmds/part4";
export { PrepareStringBattle } from "./util";
