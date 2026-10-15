// Characterization check for the six places that decide the physical/special category from the move's
// type: CalculateBaseDamage (damage.ts), Cmd_accuracycheck (Hustle) and Cmd_datahpupdate (Counter /
// Mirror Coat bookkeeping). See unified-world/DISENO-REGLAS.md, steps 0 to 2.
// Steps 0-1: the default (gen3) profile is pinned to a reference recorded before the refactor.
// Step 2: the unified profile (Gen 4 per-move category) is checked against the data files and the damage formula.
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
import { setBattleRulesProfile } from '../../src/core/battle/rules.ts';
import { GetWhoStrikesFirst } from '../../src/core/battle/main.ts';
import { flagSet, flagClear, setSave, newSaveData } from '../../src/games/firered/save.ts';
import { MOVE_CATEGORIES_GEN4 } from '../../src/core/battle/data/moveCategoriesGen4.ts';
import { Cmd_accuracycheck, Cmd_datahpupdate } from '../../src/core/battle/cmds/part1.ts';
import { gBattleScriptingCommandsTable } from '../../src/core/battle/cmds/index.ts';
import {
  G, gBattleMons, gBattleStruct, gProtectStructs, gSpecialStatuses, gBattlerPositions, resetBattleStructs,
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

// ------------------------------------------------------------------------------------------------ unified profile
// Expected values below are computed from the data files or from the documented damage formula, never copied
// from a run of the code under test.

const normName = (s: string): string => {
  const n = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ({ vicegrip: 'visegrip', hijumpkick: 'highjumpkick', smellingsalt: 'smellingsalts', faintattack: 'feintattack' } as Record<string, string>)[n] ?? n;
};
const HIDDEN_POWER = C.MOVE_HIDDEN_POWER;
const typeIsPhysical = (t: number): boolean => t < C.TYPE_MYSTERY;

function moveOfLine(line: string): number {
  const m = /(?:^|\|)[mt](\d+)\|/.exec(line);
  assert.ok(m, `cannot read the move of case ${line}`);
  return Number(m![1]);
}

function unifiedChecks(): void {
  // 1. The table is the one the data files give.
  const plat = JSON.parse(readFileSync('refs/platinum/moves.json', 'utf8')).data as Array<{ id: number; name: string; class: string }>;
  const letter: Record<string, string> = { CLASS_PHYSICAL: 'P', CLASS_SPECIAL: 'S', CLASS_STATUS: '-' };
  const expected = '-' + Array.from({ length: C.MOVES_COUNT - 1 }, (_, i) => letter[plat.find((m) => m.id === i + 1)!.class]).join('');
  assert.equal(MOVE_CATEGORIES_GEN4, expected, 'moveCategoriesGen4.ts is stale: run tools/rules/move_categories.py');

  // 2. The moves whose category differs from the type rule are exactly the Gen 4 changes Showdown lists
  //    (plus Hidden Power, whose type is variable and which the type rule cannot classify).
  const changed = new Set<number>();
  for (let m = 1; m < C.MOVES_COUNT; m++) {
    const c = MOVE_CATEGORIES_GEN4[m];
    if (c === '-' || rom.moves[m].power === 0) continue;
    if ((c === 'P') !== typeIsPhysical(rom.moves[m].type)) changed.add(m);
  }
  const sd = JSON.parse(readFileSync('refs/showdown/gen_changes.json', 'utf8'));
  const sdMoves = (sd.data ?? sd).moves as Record<string, { changes: Record<string, { category?: string }> }>;
  const byName = new Map(plat.map((m) => [normName(m.name), m.id]));
  const showdownChanged = new Set<number>();
  for (const [key, rec] of Object.entries(sdMoves)) {
    if (rec.changes.gen4?.category) showdownChanged.add(byName.get(normName(key))!);
  }
  assert.equal(showdownChanged.size, 53, 'Showdown lists 53 Gen 4 category changes');
  const unexplained = [...changed].filter((m) => m !== HIDDEN_POWER && !showdownChanged.has(m));
  const missing = [...showdownChanged].filter((m) => !changed.has(m));
  assert.deepEqual([unexplained, missing], [[], []], 'overlay differs from the Showdown Gen 4 changes');
  assert.ok(changed.has(HIDDEN_POWER) && changed.size === 54, `expected 53 + Hidden Power, got ${changed.size}`);

  // 3. Damage follows the move's category. Independent restatement of the non-modifier path of CalculateBaseDamage:
  //    ((A * power * (2L/5 + 2)) / D) / 50, minimum 1, plus 2.
  const formula = (level: number, power: number, atk: number, def: number): number => {
    let d = atk * power;
    d *= Math.trunc((2 * level) / 5) + 2;
    d = Math.trunc(d / def);
    d = Math.trunc(d / 50);
    if (d === 0) d = 1;
    return d + 2;
  };
  const A = 200, S = 20, D = 100, L = 50;
  const dmg = (move: number): number => {
    setMon(0, { attack: A, spAttack: S, level: L }); setMon(1, { defense: D, spDefense: D });
    G.gBattleTypeFlags = 0; G.gBattlersCount = 2; G.gCurrentMove = move; G.gCritMultiplier = 1; G.gBattleWeather = 0;
    return CalculateBaseDamage(gBattleMons[0], gBattleMons[1], move, 0, 0, 0, 0, 1);
  };
  const power = (m: number): number => rom.moves[m].power;
  setBattleRulesProfile('gen3');
  assert.equal(dmg(C.MOVE_TACKLE), formula(L, power(C.MOVE_TACKLE), A, D), 'formula restatement must match gen3 (Normal = physical)');
  assert.equal(dmg(C.MOVE_FLAMETHROWER), formula(L, power(C.MOVE_FLAMETHROWER), S, D), 'formula restatement must match gen3 (Fire = special)');
  assert.equal(dmg(C.MOVE_CRUNCH), formula(L, power(C.MOVE_CRUNCH), S, D), 'gen3: Dark is special');
  assert.equal(dmg(C.MOVE_SHADOW_BALL), formula(L, power(C.MOVE_SHADOW_BALL), A, D), 'gen3: Ghost is physical');
  setBattleRulesProfile('unified');
  assert.equal(dmg(C.MOVE_TACKLE), formula(L, power(C.MOVE_TACKLE), A, D), 'unified: Tackle stays physical');
  assert.equal(dmg(C.MOVE_FLAMETHROWER), formula(L, power(C.MOVE_FLAMETHROWER), S, D), 'unified: Flamethrower stays special');
  assert.equal(dmg(C.MOVE_CRUNCH), formula(L, power(C.MOVE_CRUNCH), A, D), 'unified: Crunch becomes physical');
  assert.equal(dmg(C.MOVE_SHADOW_BALL), formula(L, power(C.MOVE_SHADOW_BALL), S, D), 'unified: Shadow Ball becomes special');

  // 4. Counter / Mirror Coat bookkeeping follows the category.
  const hpAddr = findDataHpUpdate();
  const hit = (move: number): { physical: number; special: number } => {
    resetBattleStructs();
    G.gBattleTypeFlags = 0; G.gBattlersCount = 2; G.gBattlerAttacker = 0; G.gBattlerTarget = 1;
    setMon(0, {}); setMon(1, {});
    G.gCurrentMove = move; gBattleStruct.dynamicMoveType = 0; G.gHitMarker = 0; G.gMoveResultFlags = 0;
    G.gBattleMoveDamage = 20; G.gBattleControllerExecFlags = 0; G.gBattlescriptCurrInstr = hpAddr;
    Cmd_datahpupdate();
    return { physical: (gProtectStructs[1] as any).physicalDmg, special: (gProtectStructs[1] as any).specialDmg };
  };
  setBattleRulesProfile('gen3');
  assert.deepEqual(hit(C.MOVE_CRUNCH), { physical: 0, special: 20 }, 'gen3: Crunch is recorded as special damage');
  setBattleRulesProfile('unified');
  assert.deepEqual(hit(C.MOVE_CRUNCH), { physical: 20, special: 0 }, 'unified: Crunch is recorded as physical damage');
  assert.deepEqual(hit(C.MOVE_SHADOW_BALL), { physical: 0, special: 20 }, 'unified: Shadow Ball is recorded as special damage');

  // 5. Hustle penalises physical moves by category: with accuracy 100 a miss can only come from the 80 % factor.
  const addr = findAccuracyCheck();
  const misses = (move: number): number => {
    let n = 0;
    for (let seed = 0; seed < 300; seed++) {
      resetBattleStructs();
      G.gBattleTypeFlags = 0; G.gBattlersCount = 2; G.gBattlerAttacker = 0; G.gBattlerTarget = 1;
      setMon(0, { ability: C.ABILITY_HUSTLE }); setMon(1, {});
      G.gCurrentMove = move; gBattleStruct.dynamicMoveType = 0; G.gMoveResultFlags = 0; G.gBattleWeather = 0;
      G.gBattlescriptCurrInstr = addr;
      seedRng(seed * 31 + 7);
      Cmd_accuracycheck();
      if (G.gMoveResultFlags & C.MOVE_RESULT_MISSED) n++;
    }
    return n;
  };
  assert.equal(rom.moves[C.MOVE_CRUNCH].accuracy, 100);
  setBattleRulesProfile('gen3');
  assert.equal(misses(C.MOVE_CRUNCH), 0, 'gen3: Crunch (Dark, special) is not affected by Hustle');
  setBattleRulesProfile('unified');
  assert.ok(misses(C.MOVE_CRUNCH) > 0, 'unified: Crunch (physical) is affected by Hustle');
  assert.ok(misses(C.MOVE_TACKLE) > 0, 'unified: Tackle (physical) is affected by Hustle');

  // 6. Outside the changed set, both profiles agree on the whole damage grid (status moves included);
  //    inside it, they must differ somewhere, or this comparison proves nothing. The typeOverride grid ("t" lines)
  //    is compared separately in 6b: there the gen3 category follows the overridden type and the unified one does not.
  const unifiedLines = damageCases();
  setBattleRulesProfile('gen3');
  assert.equal(unifiedLines.length, damage.length);
  let outsideDiff = 0, insideDiff = 0;
  for (let i = 0; i < damage.length; i++) {
    if (damage[i].startsWith('t') || unifiedLines[i] === damage[i]) continue;
    if (changed.has(moveOfLine(damage[i]))) insideDiff++;
    else outsideDiff++;
  }
  assert.equal(outsideDiff, 0, 'unified profile changes damage for a move whose category did not change');
  assert.ok(insideDiff > 1000, `unified profile barely changes the changed moves (${insideDiff} cases)`);

  // 6b. With a type override, the unified result depends on the move, not on the type: constant over the 17 real
  //     types, and a "???" type (id 9) still deals no damage, as in gen3.
  const tRows = (lines: string[]): Map<string, number> => new Map(lines.filter((l) => l.startsWith('t')).map((l) => {
    const p = l.split('|');
    return [`${p[0]}|${p[1]}|${p[2]}`, Number(p[3])] as [string, number];
  }));
  const gen3T = tRows(damage), uniT = tRows(unifiedLines);
  for (const move of [C.MOVE_TACKLE, C.MOVE_HIDDEN_POWER, C.MOVE_FLAMETHROWER]) {
    for (const crit of ['c1', 'c2']) {
      const real = new Set<number>();
      for (let t = 0; t <= 17; t++) if (t !== C.TYPE_MYSTERY) real.add(uniT.get(`t${move}|type${t}|${crit}`)!);
      assert.equal(real.size, 1, `unified: move ${move} damage depends on the overridden type`);
      assert.equal(uniT.get(`t${move}|type${C.TYPE_MYSTERY}|${crit}`), gen3T.get(`t${move}|type${C.TYPE_MYSTERY}|${crit}`),
        `unified: a ??? type must still deal no damage (move ${move})`);
    }
  }

  // 6c. Badges give no stat boosts under unified; under gen3 they give +10 %. Expected values come from the formula.
  //     The badge flags are set by hand (PREPARED) and cleared afterwards so later digests are not contaminated.
  setSave(newSaveData('RED', 0, 'GREEN'));
  gBattlerPositions[0] = 0; gBattlerPositions[1] = 1;      // PREPARED: battler 0 is the player's, 1 the opponent's
  const boosted = (v: number): number => Math.trunc((v * 110) / 100);
  const withBadges = (flags: number[], fn: () => void): void => {
    for (const f of flags) flagSet(f);                      // PREPARED
    try { fn(); } finally { for (const f of flags) flagClear(f); }
  };
  const dmgSides = (move: number, atk: number, def: number, stats: Record<string, number>): number => {
    setMon(atk, { attack: stats.attack, spAttack: stats.spAttack, level: L });
    setMon(def, { defense: stats.defense, spDefense: stats.spDefense });
    G.gBattleTypeFlags = 0; G.gBattlersCount = 2; G.gCurrentMove = move; G.gCritMultiplier = 1; G.gBattleWeather = 0;
    return CalculateBaseDamage(gBattleMons[atk], gBattleMons[def], move, 0, 0, 0, atk, def);
  };
  const base = { attack: 100, spAttack: 100, defense: 100, spDefense: 100 };
  const pTackle = power(C.MOVE_TACKLE), pFlame = power(C.MOVE_FLAMETHROWER);
  const cases: Array<{ name: string; flag: number; run: () => number; boostedValue: number; plainValue: number }> = [
    { name: 'attack (badge 1)', flag: C.FLAG_BADGE01_GET, run: () => dmgSides(C.MOVE_TACKLE, 0, 1, base),
      boostedValue: formula(L, pTackle, boosted(100), 100), plainValue: formula(L, pTackle, 100, 100) },
    { name: 'defense (badge 5)', flag: C.FLAG_BADGE05_GET, run: () => dmgSides(C.MOVE_TACKLE, 1, 0, base),
      boostedValue: formula(L, pTackle, 100, boosted(100)), plainValue: formula(L, pTackle, 100, 100) },
    { name: 'sp. attack (badge 7)', flag: C.FLAG_BADGE07_GET, run: () => dmgSides(C.MOVE_FLAMETHROWER, 0, 1, base),
      boostedValue: formula(L, pFlame, boosted(100), 100), plainValue: formula(L, pFlame, 100, 100) },
    { name: 'sp. defense (badge 7)', flag: C.FLAG_BADGE07_GET, run: () => dmgSides(C.MOVE_FLAMETHROWER, 1, 0, base),
      boostedValue: formula(L, pFlame, 100, boosted(100)), plainValue: formula(L, pFlame, 100, 100) },
  ];
  for (const c of cases) {
    setBattleRulesProfile('gen3');
    assert.equal(c.run(), c.plainValue, `${c.name}: no badge, gen3`);
    withBadges([c.flag], () => assert.equal(c.run(), c.boostedValue, `${c.name}: gen3 must apply the +10 %`));
    setBattleRulesProfile('unified');
    withBadges([c.flag], () => assert.equal(c.run(), c.plainValue, `${c.name}: unified must not apply the boost`));
  }
  // Speed (badge 3): player 100 against opponent 105. A +10 % boost makes the player faster (strikes first = 0).
  const first = (): number => {
    setMon(0, {}); setMon(1, {});
    (gBattleMons[0] as any).speed = 100; (gBattleMons[1] as any).speed = 105;
    G.gBattleTypeFlags = 0; G.gBattlersCount = 2; G.gBattleWeather = 0;
    return GetWhoStrikesFirst(0, 1, true);
  };
  setBattleRulesProfile('gen3');
  assert.equal(first(), 1, 'speed: without the badge the opponent is faster');
  withBadges([C.FLAG_BADGE03_GET], () => assert.equal(first(), 0, 'speed: gen3 badge 3 makes the player faster'));
  setBattleRulesProfile('unified');
  withBadges([C.FLAG_BADGE03_GET], () => assert.equal(first(), 1, 'speed: unified ignores badge 3'));
  setBattleRulesProfile('gen3');

  // 7. Switching back leaves no residue.
  assert.equal(digest(damageCases()), result.damage.sha256, 'gen3 behaviour changed after using the unified profile');
  console.log(`unified profile PASS (53 Gen 4 category changes + Hidden Power; badge boosts off; ${insideDiff} damage cases differ, 0 outside the set)`);
}

try {
  unifiedChecks();
} finally {
  setBattleRulesProfile('gen3');
}
