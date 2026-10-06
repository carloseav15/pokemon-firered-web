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
