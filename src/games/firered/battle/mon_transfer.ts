// CopyPlayerMonData / SetPlayerMonData, shared by the player, opponent and Oak/old man controllers
// (they only differ in which party they read from).

import * as C from "../generated/constants";
import { BattlePokemon } from "../generated/structs";
import { G, gBattleBufferA, gBattlerPartyIndexes } from "./globals";
import { GetMonData, SetMonData, type Mon } from "../pokemon/mon";

const MOVE_PP_INFO_SIZE = 14; // u16 moves[4]; u8 pp[4]; u8 ppBonuses; (+pad)

/** REQUEST_* id -> [MON_DATA_* field, byte width] for the requests that copy a single value. */
const SIMPLE: Record<number, [number, number]> = {
  [C.REQUEST_SPECIES_BATTLE]: [C.MON_DATA_SPECIES, 2],
  [C.REQUEST_HELDITEM_BATTLE]: [C.MON_DATA_HELD_ITEM, 2],
  [C.REQUEST_OTID_BATTLE]: [C.MON_DATA_OT_ID, 3],
  [C.REQUEST_EXP_BATTLE]: [C.MON_DATA_EXP, 3],
  [C.REQUEST_HP_EV_BATTLE]: [C.MON_DATA_HP_EV, 1],
  [C.REQUEST_ATK_EV_BATTLE]: [C.MON_DATA_ATK_EV, 1],
  [C.REQUEST_DEF_EV_BATTLE]: [C.MON_DATA_DEF_EV, 1],
  [C.REQUEST_SPEED_EV_BATTLE]: [C.MON_DATA_SPEED_EV, 1],
  [C.REQUEST_SPATK_EV_BATTLE]: [C.MON_DATA_SPATK_EV, 1],
  [C.REQUEST_SPDEF_EV_BATTLE]: [C.MON_DATA_SPDEF_EV, 1],
  [C.REQUEST_FRIENDSHIP_BATTLE]: [C.MON_DATA_FRIENDSHIP, 1],
  [C.REQUEST_POKERUS_BATTLE]: [C.MON_DATA_POKERUS, 1],
  [C.REQUEST_MET_LOCATION_BATTLE]: [C.MON_DATA_MET_LOCATION, 1],
  [C.REQUEST_MET_LEVEL_BATTLE]: [C.MON_DATA_MET_LEVEL, 1],
  [C.REQUEST_MET_GAME_BATTLE]: [C.MON_DATA_MET_GAME, 1],
  [C.REQUEST_POKEBALL_BATTLE]: [C.MON_DATA_POKEBALL, 1],
  [C.REQUEST_HP_IV_BATTLE]: [C.MON_DATA_HP_IV, 1],
  [C.REQUEST_ATK_IV_BATTLE]: [C.MON_DATA_ATK_IV, 1],
  [C.REQUEST_DEF_IV_BATTLE]: [C.MON_DATA_DEF_IV, 1],
  [C.REQUEST_SPEED_IV_BATTLE]: [C.MON_DATA_SPEED_IV, 1],
  [C.REQUEST_SPATK_IV_BATTLE]: [C.MON_DATA_SPATK_IV, 1],
  [C.REQUEST_SPDEF_IV_BATTLE]: [C.MON_DATA_SPDEF_IV, 1],
  [C.REQUEST_PERSONALITY_BATTLE]: [C.MON_DATA_PERSONALITY, 4],
  [C.REQUEST_CHECKSUM_BATTLE]: [C.MON_DATA_CHECKSUM, 2],
  [C.REQUEST_STATUS_BATTLE]: [C.MON_DATA_STATUS, 4],
  [C.REQUEST_LEVEL_BATTLE]: [C.MON_DATA_LEVEL, 1],
  [C.REQUEST_HP_BATTLE]: [C.MON_DATA_HP, 2],
  [C.REQUEST_MAX_HP_BATTLE]: [C.MON_DATA_MAX_HP, 2],
  [C.REQUEST_ATK_BATTLE]: [C.MON_DATA_ATK, 2],
  [C.REQUEST_DEF_BATTLE]: [C.MON_DATA_DEF, 2],
  [C.REQUEST_SPEED_BATTLE]: [C.MON_DATA_SPEED, 2],
  [C.REQUEST_SPATK_BATTLE]: [C.MON_DATA_SPATK, 2],
  [C.REQUEST_SPDEF_BATTLE]: [C.MON_DATA_SPDEF, 2],
  [C.REQUEST_COOL_BATTLE]: [C.MON_DATA_COOL, 1],
  [C.REQUEST_BEAUTY_BATTLE]: [C.MON_DATA_BEAUTY, 1],
  [C.REQUEST_CUTE_BATTLE]: [C.MON_DATA_CUTE, 1],
  [C.REQUEST_SMART_BATTLE]: [C.MON_DATA_SMART, 1],
  [C.REQUEST_TOUGH_BATTLE]: [C.MON_DATA_TOUGH, 1],
  [C.REQUEST_SHEEN_BATTLE]: [C.MON_DATA_SHEEN, 1],
  [C.REQUEST_COOL_RIBBON_BATTLE]: [C.MON_DATA_COOL_RIBBON, 1],
  [C.REQUEST_BEAUTY_RIBBON_BATTLE]: [C.MON_DATA_BEAUTY_RIBBON, 1],
  [C.REQUEST_CUTE_RIBBON_BATTLE]: [C.MON_DATA_CUTE_RIBBON, 1],
  [C.REQUEST_SMART_RIBBON_BATTLE]: [C.MON_DATA_SMART_RIBBON, 1],
  [C.REQUEST_TOUGH_RIBBON_BATTLE]: [C.MON_DATA_TOUGH_RIBBON, 1],
};

/** Width SetMonData reads through its pointer argument for each field. */
function setWidth(field: number): number {
  switch (field) {
    case C.MON_DATA_EXP: case C.MON_DATA_PERSONALITY: case C.MON_DATA_OT_ID: case C.MON_DATA_STATUS:
      return 4;
    case C.MON_DATA_SPECIES: case C.MON_DATA_HELD_ITEM: case C.MON_DATA_HP: case C.MON_DATA_MAX_HP: case C.MON_DATA_ATK:
    case C.MON_DATA_DEF: case C.MON_DATA_SPEED: case C.MON_DATA_SPATK: case C.MON_DATA_SPDEF: case C.MON_DATA_CHECKSUM:
      return 2;
    default:
      if (field >= C.MON_DATA_MOVE1 && field <= C.MON_DATA_MOVE4) return 2;
      return 1;
  }
}

function readLE(buf: Uint8Array, off: number, width: number): number {
  let v = 0;
  for (let i = 0; i < width; i++) v |= buf[off + i] << (8 * i);
  return v >>> 0;
}

function writeLE(dst: Uint8Array, off: number, value: number, width: number): void {
  for (let i = 0; i < width; i++) dst[off + i] = (value >>> (8 * i)) & 0xff;
}

function copyNickname(dst: Uint8Array, src: number[]): void {
  // StringCopy_Nickname: copies up to POKEMON_NAME_LENGTH chars then EOS
  let i = 0;
  for (; i < C.POKEMON_NAME_LENGTH && src[i] !== 0xff && src[i] !== undefined; i++) dst[i] = src[i];
  dst[i] = 0xff;
}

export function CopyMonData(mon: Mon, request: number, dst: Uint8Array, offset: number): number {
  const simple = SIMPLE[request];
  if (simple) {
    writeLE(dst, offset, GetMonData(mon, simple[0]), simple[1]);
    return simple[1];
  }
  switch (request) {
    case C.REQUEST_ALL_BATTLE: {
      const bm = new BattlePokemon(new Uint8Array(BattlePokemon.SIZE));
      bm.species = GetMonData(mon, C.MON_DATA_SPECIES);
      bm.item = GetMonData(mon, C.MON_DATA_HELD_ITEM);
      for (let i = 0; i < 4; i++) {
        bm.moves[i] = GetMonData(mon, C.MON_DATA_MOVE1 + i);
        bm.pp[i] = GetMonData(mon, C.MON_DATA_PP1 + i);
      }
      bm.ppBonuses = GetMonData(mon, C.MON_DATA_PP_BONUSES);
      bm.friendship = GetMonData(mon, C.MON_DATA_FRIENDSHIP);
      bm.experience = GetMonData(mon, C.MON_DATA_EXP);
      bm.hpIV = GetMonData(mon, C.MON_DATA_HP_IV);
      bm.attackIV = GetMonData(mon, C.MON_DATA_ATK_IV);
      bm.defenseIV = GetMonData(mon, C.MON_DATA_DEF_IV);
      bm.speedIV = GetMonData(mon, C.MON_DATA_SPEED_IV);
      bm.spAttackIV = GetMonData(mon, C.MON_DATA_SPATK_IV);
      bm.spDefenseIV = GetMonData(mon, C.MON_DATA_SPDEF_IV);
      bm.personality = GetMonData(mon, C.MON_DATA_PERSONALITY);
      bm.status1 = GetMonData(mon, C.MON_DATA_STATUS);
      bm.level = GetMonData(mon, C.MON_DATA_LEVEL);
      bm.hp = GetMonData(mon, C.MON_DATA_HP);
      bm.maxHP = GetMonData(mon, C.MON_DATA_MAX_HP);
      bm.attack = GetMonData(mon, C.MON_DATA_ATK);
      bm.defense = GetMonData(mon, C.MON_DATA_DEF);
      bm.speed = GetMonData(mon, C.MON_DATA_SPEED);
      bm.spAttack = GetMonData(mon, C.MON_DATA_SPATK);
      bm.spDefense = GetMonData(mon, C.MON_DATA_SPDEF);
      bm.isEgg = GetMonData(mon, C.MON_DATA_IS_EGG);
      bm.abilityNum = GetMonData(mon, C.MON_DATA_ABILITY_NUM);
      bm.otId = GetMonData(mon, C.MON_DATA_OT_ID);
      const nick: number[] = [];
      GetMonData(mon, C.MON_DATA_NICKNAME, nick);
      copyNickname(bm.nickname, nick);
      const ot: number[] = [];
      GetMonData(mon, C.MON_DATA_OT_NAME, ot);
      bm.otName.set(ot.slice(0, bm.otName.length));
      dst.set(bm.bytes, offset);
      return BattlePokemon.SIZE;
    }
    case C.REQUEST_MOVES_PP_BATTLE: {
      for (let i = 0; i < 4; i++) {
        writeLE(dst, offset + i * 2, GetMonData(mon, C.MON_DATA_MOVE1 + i), 2);
        dst[offset + 8 + i] = GetMonData(mon, C.MON_DATA_PP1 + i);
      }
      dst[offset + 12] = GetMonData(mon, C.MON_DATA_PP_BONUSES);
      dst[offset + 13] = 0;
      return MOVE_PP_INFO_SIZE;
    }
    case C.REQUEST_MOVE1_BATTLE: case C.REQUEST_MOVE2_BATTLE: case C.REQUEST_MOVE3_BATTLE: case C.REQUEST_MOVE4_BATTLE:
      writeLE(dst, offset, GetMonData(mon, C.MON_DATA_MOVE1 + request - C.REQUEST_MOVE1_BATTLE), 2);
      return 2;
    case C.REQUEST_PP_DATA_BATTLE:
      for (let i = 0; i < 4; i++) dst[offset + i] = GetMonData(mon, C.MON_DATA_PP1 + i);
      dst[offset + 4] = GetMonData(mon, C.MON_DATA_PP_BONUSES);
      return 5;
    case C.REQUEST_PPMOVE1_BATTLE: case C.REQUEST_PPMOVE2_BATTLE: case C.REQUEST_PPMOVE3_BATTLE: case C.REQUEST_PPMOVE4_BATTLE:
      dst[offset] = GetMonData(mon, C.MON_DATA_PP1 + request - C.REQUEST_PPMOVE1_BATTLE);
      return 1;
    case C.REQUEST_ALL_IVS_BATTLE:
      dst[offset] = GetMonData(mon, C.MON_DATA_HP_IV);
      dst[offset + 1] = GetMonData(mon, C.MON_DATA_ATK_IV);
      dst[offset + 2] = GetMonData(mon, C.MON_DATA_DEF_IV);
      dst[offset + 3] = GetMonData(mon, C.MON_DATA_SPEED_IV);
      dst[offset + 4] = GetMonData(mon, C.MON_DATA_SPATK_IV);
      dst[offset + 5] = GetMonData(mon, C.MON_DATA_SPDEF_IV);
      return 6;
  }
  return 0;
}

/** Handles CONTROLLER_GETMONDATA for a party accessor; returns [data, size]. */
export function HandleGetMonData(
  party: (i: number) => Mon,
  copy = (monId: number, dst: Uint8Array, offset: number): number => CopyMonData(party(monId), gBattleBufferA[G.gActiveBattler][1], dst, offset),
): [Uint8Array, number] {
  const b = G.gActiveBattler;
  const buf = gBattleBufferA[b];
  const out = new Uint8Array(0x200);
  let size = 0;
  if (buf[2] === 0) {
    size += copy(gBattlerPartyIndexes[b], out, size);
  } else {
    let monToCheck = buf[2];
    for (let i = 0; i < 6; i++) {
      if (monToCheck & 1) size += copy(i, out, size);
      monToCheck >>= 1;
    }
  }
  return [out, size];
}


function setField(mon: Mon, field: number, buf: Uint8Array, off: number): void {
  SetMonData(mon, field, readLE(buf, off, setWidth(field)));
}

export function SetMonDataFromBuffer(mon: Mon): void {
  const buf = gBattleBufferA[G.gActiveBattler];
  const request = buf[1];
  const simple = SIMPLE[request];
  if (simple) {
    setField(mon, simple[0], buf, 3);
    return;
  }
  switch (request) {
    case C.REQUEST_ALL_BATTLE: {
      const bm = new BattlePokemon(buf.slice(3, 3 + BattlePokemon.SIZE));
      SetMonData(mon, C.MON_DATA_SPECIES, bm.species);
      SetMonData(mon, C.MON_DATA_HELD_ITEM, bm.item);
      for (let i = 0; i < 4; i++) {
        SetMonData(mon, C.MON_DATA_MOVE1 + i, bm.moves[i]);
        SetMonData(mon, C.MON_DATA_PP1 + i, bm.pp[i]);
      }
      SetMonData(mon, C.MON_DATA_PP_BONUSES, bm.ppBonuses);
      SetMonData(mon, C.MON_DATA_FRIENDSHIP, bm.friendship);
      SetMonData(mon, C.MON_DATA_EXP, bm.experience);
      SetMonData(mon, C.MON_DATA_HP_IV, bm.hpIV);
      SetMonData(mon, C.MON_DATA_ATK_IV, bm.attackIV);
      SetMonData(mon, C.MON_DATA_DEF_IV, bm.defenseIV);
      SetMonData(mon, C.MON_DATA_SPEED_IV, bm.speedIV);
      SetMonData(mon, C.MON_DATA_SPATK_IV, bm.spAttackIV);
      SetMonData(mon, C.MON_DATA_SPDEF_IV, bm.spDefenseIV);
      SetMonData(mon, C.MON_DATA_PERSONALITY, bm.personality);
      SetMonData(mon, C.MON_DATA_STATUS, bm.status1);
      SetMonData(mon, C.MON_DATA_LEVEL, bm.level);
      SetMonData(mon, C.MON_DATA_HP, bm.hp);
      SetMonData(mon, C.MON_DATA_MAX_HP, bm.maxHP);
      SetMonData(mon, C.MON_DATA_ATK, bm.attack);
      SetMonData(mon, C.MON_DATA_DEF, bm.defense);
      SetMonData(mon, C.MON_DATA_SPEED, bm.speed);
      SetMonData(mon, C.MON_DATA_SPATK, bm.spAttack);
      SetMonData(mon, C.MON_DATA_SPDEF, bm.spDefense);
      break;
    }
    case C.REQUEST_MOVES_PP_BATTLE:
      for (let i = 0; i < 4; i++) {
        SetMonData(mon, C.MON_DATA_MOVE1 + i, readLE(buf, 3 + i * 2, 2));
        SetMonData(mon, C.MON_DATA_PP1 + i, buf[3 + 8 + i]);
      }
      SetMonData(mon, C.MON_DATA_PP_BONUSES, buf[3 + 12]);
      break;
    case C.REQUEST_MOVE1_BATTLE: case C.REQUEST_MOVE2_BATTLE: case C.REQUEST_MOVE3_BATTLE: case C.REQUEST_MOVE4_BATTLE:
      setField(mon, C.MON_DATA_MOVE1 + request - C.REQUEST_MOVE1_BATTLE, buf, 3);
      break;
    case C.REQUEST_PP_DATA_BATTLE:
      for (let i = 0; i < 4; i++) SetMonData(mon, C.MON_DATA_PP1 + i, buf[3 + i]);
      SetMonData(mon, C.MON_DATA_PP_BONUSES, buf[7]);
      break;
    case C.REQUEST_PPMOVE1_BATTLE: case C.REQUEST_PPMOVE2_BATTLE: case C.REQUEST_PPMOVE3_BATTLE: case C.REQUEST_PPMOVE4_BATTLE:
      SetMonData(mon, C.MON_DATA_PP1 + request - C.REQUEST_PPMOVE1_BATTLE, buf[3]);
      break;
    case C.REQUEST_ALL_IVS_BATTLE: {
      const fields = [C.MON_DATA_HP_IV, C.MON_DATA_ATK_IV, C.MON_DATA_DEF_IV, C.MON_DATA_SPEED_IV, C.MON_DATA_SPATK_IV, C.MON_DATA_SPDEF_IV];
      fields.forEach((f, i) => SetMonData(mon, f, buf[3 + i]));
      break;
    }
  }
}

/** Handles CONTROLLER_SETMONDATA for a party accessor. */
export function HandleSetMonData(
  party: (i: number) => Mon,
  set = (monId: number): void => SetMonDataFromBuffer(party(monId)),
): void {
  const buf = gBattleBufferA[G.gActiveBattler];
  if (buf[2] === 0) {
    set(gBattlerPartyIndexes[G.gActiveBattler]);
  } else {
    let monToCheck = buf[2];
    for (let i = 0; i < 6; i++) {
      if (monToCheck & 1) set(i);
      monToCheck >>= 1;
    }
  }
}
