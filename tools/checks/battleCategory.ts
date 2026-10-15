// Characterization check for the six places that decide the physical/special category from the move's
// type: CalculateBaseDamage (damage.ts), Cmd_accuracycheck (Hustle) and Cmd_datahpupdate (Counter /
// Mirror Coat bookkeeping). See unified-world/DISENO-REGLAS.md, steps 0 and 1.
//
// What this proves: the behaviour of those functions over a fixed grid of inputs is unchanged by a refactor.
// What it does NOT prove: that the behaviour matches the GBA. The reference was recorded from this port, not from
// the C (the differential oracle in tools/oracle does not cover these functions). State set by hand is PREPARED.
//
// Run: npm run check:battle-category            (compares with tools/checks/battleCategory.reference.json)
//      npm run check:battle-category -- --write (re-record the reference; only after an intended change)

import './setupNodeGbaMock.ts';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import * as C from '../../src/games/firered/generated/constants.ts';
import { rom } from '../../src/core/rom.ts';
import { registerCData, cdata } from '../../src/core/hw/assets.ts';
import { preloadBattleAssets } from '../../src/games/firered/battle/preload.ts';
import { bs, ROM_BASE } from '../../src/core/battle/bscript.ts';
import { seedRng } from '../../src/core/random.ts';
import { CalculateBaseDamage } from '../../src/core/battle/damage.ts';
import { Cmd_accuracycheck, Cmd_datahpupdate } from '../../src/core/battle/cmds/part1.ts';
import { gBattleScriptingCommandsTable } from '../../src/core/battle/cmds/index.ts';
import {
  G, gBattleMons, gBattleStruct, gProtectStructs, gSpecialStatuses, resetBattleStructs,
} from '../../src/core/battle/globals.ts';

const root = process.cwd() + '/public';
const REFERENCE = process.cwd() + '/tools/checks/battleCategory.reference.json';
const WRITE = process.argv.includes('--write');

(globalThis as any).fetch = async (url: string) => {
  let norm = String(url).replace(/^\/?/, '/');
  if (!norm.startsWith('/fr/')) norm = '/fr' + norm;
  const path = root + norm;
  if (!existsSync(path)) throw new Error(`fetch 404: ${url} -> ${path}`);
  const buf = readFileSync(path);
  return {
    ok: true,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    text: async () => buf.toString('utf8'),
  };
};

async function initData(): Promise<void> {
  const fr = root + '/fr/';
  rom.constants = JSON.parse(readFileSync(fr + 'constants.json', 'utf8'));
  rom.charmap = JSON.parse(readFileSync(fr + 'charmap.json', 'utf8'));
  rom.strings = JSON.parse(readFileSync(fr + 'data/strings.json', 'utf8'));
  rom.battleStrings = JSON.parse(readFileSync(fr + 'data/battle_strings.json', 'utf8'));
  const speciesRaw = JSON.parse(readFileSync(fr + 'data/species.json', 'utf8'));
  rom.species = speciesRaw.species;
  rom.pokedex = speciesRaw.pokedex;
  rom.expTables = speciesRaw.exp;
  const movesRaw = JSON.parse(readFileSync(fr + 'data/moves.json', 'utf8'));
  rom.moves = movesRaw.moves;
  rom.abilities = movesRaw.abilities;
  rom.natures = movesRaw.natures;
  rom.trainerClasses = movesRaw.trainerClasses;
  rom.types = movesRaw.types;
  rom.typeEffectiveness = movesRaw.typeEffectiveness;
  rom.trainers = JSON.parse(readFileSync(fr + 'data/trainers.json', 'utf8'));
  const itemsRaw = JSON.parse(readFileSync(fr + 'data/items.json', 'utf8'));
  rom.items = itemsRaw.items;
  rom.itemEffects = itemsRaw.effects;
  rom.fonts = JSON.parse(readFileSync(fr + 'gfx/fonts.json', 'utf8'));
  registerCData('berry', JSON.parse(readFileSync(fr + 'cdata/berry.json', 'utf8')).defs);
  registerCData('text', JSON.parse(readFileSync(fr + 'cdata/text.json', 'utf8')).defs);
  registerCData('text_printer', JSON.parse(readFileSync(fr + 'cdata/text_printer.json', 'utf8')).defs);
  await preloadBattleAssets();
}

// ------------------------------------------------------------------------------------------------ helpers

const MOVES = Array.from({ length: C.MOVES_COUNT }, (_, i) => i).filter((m) => m > 0);
const digest = (lines: string[]): string => createHash('sha256').update(lines.join('\n')).digest('hex');

function setMon(b: number, f: Partial<Record<'attack' | 'defense' | 'spAttack' | 'spDefense' | 'level' | 'hp' | 'maxHP' | 'ability' | 'status1' | 'item' | 'species', number>>): void {
  const m = gBattleMons[b] as any;
  m.attack = 100; m.defense = 100; m.spAttack = 100; m.spDefense = 100; m.level = 50; m.hp = 100; m.maxHP = 100;
  m.ability = 0; m.status1 = 0; m.status2 = 0; m.item = 0; m.species = C.SPECIES_BULBASAUR;
  for (let s = 0; s < 8; s++) m.statStages[s] = C.DEFAULT_STAT_STAGE;
  Object.assign(m, f);
}

/** Items whose hold effect appears in sHoldEffectToType, one per effect (data-driven, not hand-picked). */
function typeBoostItems(): Array<{ item: number; effect: number; type: number }> {
  const table = cdata<Array<[number, number]>>('pokemon', 'sHoldEffectToType');
  const out: Array<{ item: number; effect: number; type: number }> = [];
  for (const [effect, type] of table) {
    const item = rom.items.findIndex((it: any, i: number) => i > 0 && it?.holdEffect === effect);
    if (item > 0) out.push({ item, effect, type });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ cases

function damageCases(): string[] {
  const lines: string[] = [];
  const attackers = [
    { name: 'plain', f: { attack: 100, spAttack: 60, level: 50 } },
    { name: 'hustle', f: { attack: 60, spAttack: 100, level: 30, ability: C.ABILITY_HUSTLE } },
    { name: 'guts-burn', f: { attack: 90, spAttack: 90, level: 40, ability: C.ABILITY_GUTS, status1: C.STATUS1_BURN } },
    { name: 'burn', f: { attack: 130, spAttack: 80, level: 100, status1: C.STATUS1_BURN } },
  ];
  const defenders = [
    { name: 'balanced', f: { defense: 80, spDefense: 90 } },
    { name: 'thickfat', f: { defense: 200, spDefense: 50, ability: C.ABILITY_THICK_FAT } },
  ];
  const sides = [0, C.SIDE_STATUS_REFLECT, C.SIDE_STATUS_LIGHTSCREEN];
  const weathers = [0, C.B_WEATHER_RAIN_TEMPORARY, C.B_WEATHER_SUN];
  G.gBattleTypeFlags = 0;
  G.gBattlersCount = 2;
  for (const move of MOVES) {
    if (rom.moves[move].power === 0) continue;
    for (const a of attackers) for (const d of defenders) for (const side of sides) for (const crit of [1, 2]) for (const w of weathers) {
      setMon(0, a.f); setMon(1, d.f);
      G.gCurrentMove = move; G.gCritMultiplier = crit; G.gBattleWeather = w;
      const dmg = CalculateBaseDamage(gBattleMons[0], gBattleMons[1], move, side, 0, 0, 0, 1);
      lines.push(`m${move}|${a.name}|${d.name}|s${side}|c${crit}|w${w}|${dmg}`);
    }
  }
  // Every type value on both sides of the category boundary, through typeOverride, with a fixed move.
  for (const move of [C.MOVE_TACKLE, C.MOVE_HIDDEN_POWER, C.MOVE_FLAMETHROWER]) {
    for (let type = 0; type <= 17; type++) {
      for (const crit of [1, 2]) {
        setMon(0, { attack: 111, spAttack: 77, level: 55 }); setMon(1, { defense: 66, spDefense: 99 });
        G.gCurrentMove = move; G.gCritMultiplier = crit; G.gBattleWeather = 0;
        lines.push(`t${move}|type${type}|c${crit}|${CalculateBaseDamage(gBattleMons[0], gBattleMons[1], move, 0, 0, type, 0, 1)}`);
      }
    }
  }
  // Type-boost held items: the item chooses Attack or Sp. Attack from the move's type.
  for (const { item, effect, type } of typeBoostItems()) {
    for (const move of MOVES) {
      if (rom.moves[move].power === 0 || rom.moves[move].type !== type) continue;
      setMon(0, { attack: 100, spAttack: 100, level: 50, item }); setMon(1, { defense: 100, spDefense: 100 });
      G.gCurrentMove = move; G.gCritMultiplier = 1; G.gBattleWeather = 0;
      lines.push(`i${item}/${effect}|m${move}|${CalculateBaseDamage(gBattleMons[0], gBattleMons[1], move, 0, 0, 0, 0, 1)}`);
    }
  }
  return lines;
}

function findAccuracyCheck(): number {
  const idx = gBattleScriptingCommandsTable.findIndex((f) => f === Cmd_accuracycheck);
  assert.ok(idx >= 0);
  const acc = C.ACC_CURR_MOVE & 0xffff;
  for (let o = 0; o < bs.blob.length - 7; o++) {
    if (bs.blob[o] !== idx) continue;
    const move = bs.blob[o + 5] | (bs.blob[o + 6] << 8);
    const ptr = (bs.blob[o + 1] | (bs.blob[o + 2] << 8) | (bs.blob[o + 3] << 16) | (bs.blob[o + 4] << 24)) >>> 0;
    if (move === acc && ptr >= ROM_BASE && ptr < ROM_BASE + bs.blob.length) return ROM_BASE + o;
  }
  throw new Error('no accuracycheck ACC_CURR_MOVE instruction found');
}

function accuracyRun(): string[] {
  const addr = findAccuracyCheck();
  const lines: string[] = [];
  for (const move of MOVES) {
    for (const ability of [0, C.ABILITY_HUSTLE]) {
      for (let seed = 0; seed < 8; seed++) {
        resetBattleStructs();
        G.gBattleTypeFlags = 0; G.gBattlersCount = 2; G.gBattlerAttacker = 0; G.gBattlerTarget = 1;
        setMon(0, { ability }); setMon(1, {});
        G.gCurrentMove = move; gBattleStruct.dynamicMoveType = 0; G.gMoveResultFlags = 0; G.gBattleWeather = 0;
        G.gBattlescriptCurrInstr = addr;
        seedRng(seed * 977 + 13);
        Cmd_accuracycheck();
        lines.push(`m${move}|a${ability}|s${seed}|miss${G.gMoveResultFlags & C.MOVE_RESULT_MISSED ? 1 : 0}|pc${G.gBattlescriptCurrInstr - addr}`);
      }
    }
  }
  return lines;
}

function findDataHpUpdate(): number {
  const idx = gBattleScriptingCommandsTable.findIndex((f) => f === Cmd_datahpupdate);
  assert.ok(idx >= 0);
  for (let o = 0; o < bs.blob.length - 2; o++) {
    if (bs.blob[o] === idx && bs.blob[o + 1] === C.BS_TARGET) return ROM_BASE + o;
  }
  throw new Error('no datahpupdate BS_TARGET instruction found');
}

function hpUpdateRun(): string[] {
  const addr = findDataHpUpdate();
  const lines: string[] = [];
  for (const move of MOVES) {
    for (const passive of [0, C.HITMARKER_PASSIVE_DAMAGE]) {
      for (const dyn of [0, C.TYPE_FIRE, C.TYPE_NORMAL, C.TYPE_GHOST, C.TYPE_DARK]) {
        resetBattleStructs();
        G.gBattleTypeFlags = 0; G.gBattlersCount = 2; G.gBattlerAttacker = 0; G.gBattlerTarget = 1;
        setMon(0, {}); setMon(1, {});
        G.gCurrentMove = move; gBattleStruct.dynamicMoveType = dyn ? (dyn | (1 << 7)) & 0xff & ~(1 << 6) : 0;
        G.gHitMarker = passive; G.gMoveResultFlags = 0; G.gBattleMoveDamage = 20; G.gBattleControllerExecFlags = 0;
        G.gBattlescriptCurrInstr = addr;
        Cmd_datahpupdate();
        const p = gProtectStructs[1] as any;
        const s = gSpecialStatuses[1] as any;
        lines.push(`m${move}|p${passive}|d${dyn}|${p.physicalDmg},${p.specialDmg},${p.physicalBattlerId},${p.specialBattlerId}|` +
                   `${s.physicalDmg},${s.specialDmg},${s.physicalBattlerId},${s.specialBattlerId}|hp${(gBattleMons[1] as any).hp}`);
      }
    }
  }
  return lines;
}

// ------------------------------------------------------------------------------------------------ main

await initData();
const damage = damageCases();
const accuracy = accuracyRun();
const hpupdate = hpUpdateRun();

const result = {
  note: 'recorded from the TypeScript port (not from the C); see header of tools/checks/battleCategory.ts',
  damage: { cases: damage.length, sha256: digest(damage) },
  accuracy: { cases: accuracy.length, sha256: digest(accuracy) },
  hpupdate: { cases: hpupdate.length, sha256: digest(hpupdate) },
};

// Sanity: the grid must actually exercise both branches and both bookkeeping paths, or it proves nothing.
const dmgNonZero = damage.filter((l) => !l.endsWith('|2')).length;
assert.ok(damage.length > 20000, `damage grid too small: ${damage.length}`);
assert.ok(dmgNonZero > 0);
assert.ok(accuracy.some((l) => l.includes('miss1')) && accuracy.some((l) => l.includes('miss0')), 'accuracy grid never varies');
assert.ok(hpupdate.some((l) => /\|\d+,0,/.test(l)) && hpupdate.some((l) => /\|0,\d+,/.test(l)), 'hpupdate grid must hit both physical and special');

if (WRITE) {
  writeFileSync(REFERENCE, JSON.stringify(result, null, 2) + '\n');
  console.log('reference written:', JSON.stringify(result));
} else {
  const ref = JSON.parse(readFileSync(REFERENCE, 'utf8'));
  for (const k of ['damage', 'accuracy', 'hpupdate'] as const) {
    assert.deepEqual(result[k], ref[k], `${k}: behaviour differs from the recorded reference`);
  }
  console.log(`battle category characterization PASS (${damage.length} damage, ${accuracy.length} accuracy, ${hpupdate.length} hpupdate cases)`);
}
