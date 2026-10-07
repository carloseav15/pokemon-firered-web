// Player automation policy, not a port of the opponent AI or a damage oracle.
// Inputs are live BattlePokemon + ROM data exported from the decomp.
export function typeMultiplier(type, foe, table, C) {
  if (type === C.TYPE_GROUND && foe.ability === C.ABILITY_LEVITATE
      || type === C.TYPE_WATER && foe.ability === C.ABILITY_WATER_ABSORB
      || type === C.TYPE_ELECTRIC && foe.ability === C.ABILITY_VOLT_ABSORB
      || type === C.TYPE_FIRE && foe.ability === C.ABILITY_FLASH_FIRE) return 0;
  let multiplier = 1;
  for (let i = 0; i < table.length; i += 3) {
    const [attack, defense, factor] = table.slice(i, i + 3);
    if (attack === C.TYPE_ENDTABLE) break;
    // battle_main.c: the marker introduces Normal/Fighting -> Ghost immunity.
    if (attack === C.TYPE_FORESIGHT) {
      if (foe.status2 & C.STATUS2_FORESIGHT) break;
      continue;
    }
    if (attack === type && (defense === foe.type1 || defense === foe.type2)) multiplier *= factor / 10;
  }
  if (foe.ability === C.ABILITY_WONDER_GUARD && multiplier <= 1) return 0;
  return multiplier;
}

export function rankMoves(mon, foe, rom, C, restrictions = {}) {
  const ranked = [];
  for (let slot = 0; slot < 4; slot++) {
    const id = mon.moves[slot], move = rom.moves[id];
    // Fixed/variable-damage power=1 and status moves require another policy.
    if (!id || !move || move.power <= 1 || mon.pp[slot] <= 0
        || restrictions.disabledMove === id
        || restrictions.encoredMove && restrictions.encoredMove !== id) continue;
    const effectiveness = typeMultiplier(move.type, foe, rom.typeEffectiveness, C);
    if (effectiveness <= 0) continue;
    const physical = move.type < C.TYPE_MYSTERY;
    const stage = (m, index) => {
      const value = m.statStages?.[index] ?? C.DEFAULT_STAT_STAGE;
      return value >= C.DEFAULT_STAT_STAGE ? (2 + value - C.DEFAULT_STAT_STAGE) / 2 : 2 / (2 + C.DEFAULT_STAT_STAGE - value);
    };
    let attack = (physical ? mon.attack : mon.spAttack) * stage(mon, physical ? C.STAT_ATK : C.STAT_SPATK);
    const defense = (physical ? foe.defense : foe.spDefense) * stage(foe, physical ? C.STAT_DEF : C.STAT_SPDEF);
    if (physical && mon.status1 & C.STATUS1_BURN && mon.ability !== C.ABILITY_GUTS) attack /= 2;
    const stab = move.type === mon.type1 || move.type === mon.type2 ? 1.5 : 1;
    const score = move.power * (move.accuracy || 100) / 100 * stab * effectiveness * Math.max(1, attack) / Math.max(1, defense);
    ranked.push({ slot, move: id, pp: mon.pp[slot], effectiveness, score });
  }
  return ranked.sort((a, b) => b.score - a.score || b.pp - a.pp || a.slot - b.slot);
}

export function hpItem(mon, bag, C) {
  if (mon.hp <= 0 || mon.hp >= mon.maxHP) return null;
  const missing = mon.maxHP - mon.hp;
  const items = [[C.ITEM_POTION, 20], [C.ITEM_SUPER_POTION, 50], [C.ITEM_HYPER_POTION, 200], [C.ITEM_MAX_POTION, mon.maxHP]];
  const available = items.filter(([id]) => bag.some(e => e.item === id && e.quantity > 0));
  const picked = available.find(([, hp]) => hp >= missing) ?? available.at(-1);
  return picked ? { item: picked[0], restores: Math.min(missing, picked[1]) } : null;
}

export function statusItem(status, bag, C) {
  const cures = [[C.STATUS1_POISON | C.STATUS1_TOXIC_POISON, C.ITEM_ANTIDOTE],
    [C.STATUS1_PARALYSIS, C.ITEM_PARALYZE_HEAL], [C.STATUS1_BURN, C.ITEM_BURN_HEAL],
    [C.STATUS1_FREEZE, C.ITEM_ICE_HEAL], [C.STATUS1_SLEEP, C.ITEM_AWAKENING]];
  for (const [mask, item] of cures) if (status & mask && bag.some(e => e.item === item && e.quantity > 0)) return item;
  return null;
}

// Player policy for a full moveset: the attack ranking above only uses damaging moves, so a move's value is its
// expected power (power x accuracy x STAB); status and fixed-damage moves are worth 0 to it. HM moves are never
// offered (IsHMMove2 refuses them in the C). Returns the slot to forget, or -1 to keep the current moves.
export function moveValue(moveId, types, rom) {
  const move = rom.moves[moveId];
  if (!moveId || !move || move.power <= 1) return 0;
  const stab = types.includes(move.type) ? 1.5 : 1;
  return move.power * (move.accuracy || 100) / 100 * stab;
}

export function chooseMoveToForget(moves, newMove, types, rom, C) {
  const hm = [C.MOVE_CUT, C.MOVE_FLY, C.MOVE_SURF, C.MOVE_STRENGTH, C.MOVE_FLASH, C.MOVE_ROCK_SMASH, C.MOVE_WATERFALL, C.MOVE_DIVE];
  const gain = moveValue(newMove, types, rom);
  let worst = -1, worstValue = Infinity;
  for (let slot = 0; slot < 4; slot++) {
    if (!moves[slot] || hm.includes(moves[slot])) continue;
    const value = moveValue(moves[slot], types, rom);
    if (value < worstValue) { worst = slot; worstValue = value; }
  }
  return worst >= 0 && gain > worstValue ? worst : -1;
}

// Strength estimate before a trainer battle. Not the battle engine: expected damage with the Gen 3 formula
// (no crits, mean random roll 0.925, accuracy as expectation), damaging moves only, no items, abilities only
// through typeMultiplier, no switching except after a faint, faster side first. Used to decide whether to train.
export function estimateDamage(att, def, moveId, rom, C) {
  const move = rom.moves[moveId];
  if (!moveId || !move || move.power <= 1) return 0;
  const eff = typeMultiplier(move.type, def, rom.typeEffectiveness, C);
  if (eff <= 0) return 0;
  const physical = move.type < C.TYPE_MYSTERY;
  const a = physical ? att.attack : att.spAttack, d = physical ? def.defense : def.spDefense;
  let dmg = Math.floor(Math.floor(Math.floor(2 * att.level / 5 + 2) * move.power * a / Math.max(1, d)) / 50) + 2;
  if (move.type === att.type1 || move.type === att.type2) dmg *= 1.5;
  return dmg * eff * 0.925 * (move.accuracy || 100) / 100;
}

export function simulateBattle(ours, foes, rom, C) {
  const team = ours.map(m => ({ ...m })), enemy = foes.map(m => ({ ...m }));
  const best = (a, d) => Math.max(0, ...a.moves.map(id => estimateDamage(a, d, id, rom, C)));
  const log = [];
  let active = team.find(m => m.hp > 0), fi = 0, turns = 0;
  while (active && fi < enemy.length && turns < 300) {
    const foe = enemy[fi], out = best(active, foe), inc = best(foe, active);
    if (out === 0 && inc === 0) { log.push({ stalemate: [active.species, foe.species] }); break; }
    const order = active.speed >= foe.speed ? [[active, foe, out], [foe, active, inc]] : [[foe, active, inc], [active, foe, out]];
    for (const [, target, dmg] of order) {
      if (active.hp <= 0 || foe.hp <= 0) break;
      target.hp = Math.max(0, target.hp - dmg);
    }
    turns++;
    if (foe.hp <= 0) { log.push({ ko: foe.species, by: active.species, turns }); fi++; }
    if (active.hp <= 0) {
      log.push({ fainted: active.species, against: foe.species, turns });
      // Next member: best margin against the current foe (share of its HP dealt minus share of own HP taken per turn).
      const next = enemy[fi], margin = (m) => next ? best(m, next) / Math.max(1, next.hp) - best(next, m) / Math.max(1, m.hp) : 0;
      active = team.filter(m => m.hp > 0).sort((x, y) => margin(y) - margin(x))[0];
    }
  }
  const hpLeft = team.reduce((n, m) => n + m.hp, 0) / Math.max(1, team.reduce((n, m) => n + m.maxHP, 0));
  const win = fi >= enemy.length;
  return { win, hpLeft: Math.round(hpLeft * 100) / 100, foesLeft: enemy.length - fi, turns, log,
    verdict: win && hpLeft >= 0.35 ? "favorable" : win ? "risky" : "unfavorable" };
}
