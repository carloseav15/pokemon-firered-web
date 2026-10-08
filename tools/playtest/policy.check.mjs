// Focused cases for tools/playtest/driver/policy.js with hand-picked values (independent of the driver run).
// Usage: node tools/playtest/policy.check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Policy } from "./driver/policy.js";
import { rankMoves } from "./strategy.js";

const text = readFileSync("src/fr/generated/constants.ts", "utf8");
const C = Object.fromEntries([...text.matchAll(/export const (\w+) = (\d+);/g)].map(m => [m[1], Number(m[2])]));
const rom = JSON.parse(readFileSync("public/fr/data/moves.json", "utf8"));
const deps = { C, rom, bestMoves: (mon) => rankMoves(mon, FOE, rom, C) };
const FOE = { type1: C.TYPE_NORMAL, type2: C.TYPE_NORMAL, ability: 0, status2: 0, defense: 20, spDefense: 20, statStages: undefined };
const mk = (over = {}) => ({ species: 1, isEgg: false, hp: 40, maxHP: 40, personality: 1, otId: 1, slot: 0, status1: 0,
  attack: 20, spAttack: 20, type1: C.TYPE_GRASS, type2: C.TYPE_POISON, moves: [C.MOVE_VINE_WHIP, 0, 0, 0], pp: [10, 0, 0, 0], ...over });
const slotMon = (slot, over) => { const m = mk({ slot, personality: 100 + slot, otId: 7, ...over }); return { ...m, battleMon: m }; };
const potions = [{ item: C.ITEM_POTION, quantity: 5 }];

// Low HP (8/40 <= 40%) with Potions: item with items allowed. With noItems and no replacement the old rule
// "low hp without medicine" applies: run from a wild battle, stop in a trainer battle; never an item.
const lead = mk({ hp: 8, personality: 1 });
const state = (over = {}) => ({ flags: 0, mon: lead, mons: [slotMon(0, { personality: 1, hp: 8 })], bag: potions, incoming: 0, ...over });
assert.equal(new Policy().battle(state(), deps).action, "item");
const noItems = new Policy({ noItems: true });
const d = noItems.battle(state(), deps);
assert.notEqual(d.action, "item");
assert.equal(d.action, "run");
assert.equal(noItems.battle(state({ flags: C.BATTLE_TYPE_TRAINER }), deps).action, "stop");
// Healthy enough (30/40): attacks, with or without items.
const healthy = mk({ hp: 30 });
assert.equal(noItems.battle(state({ mon: healthy, mons: [slotMon(0, { personality: 1, hp: 30 })] }), deps).action, "move");

// A fainted-attacker reserve that a Potion would make usable: recovery by item only when items are allowed.
const reserve = slotMon(1, { hp: 10, maxHP: 40, personality: 2 }); // +20 from a Potion = 30/40 = 0.75 >= 0.6
const rs = { mons: [slotMon(0, { personality: 1 }), reserve], active: mk({ personality: 1 }), bag: potions };
assert.equal(new Policy().recoverReplacement(rs, deps)?.item, C.ITEM_POTION);
assert.equal(noItems.recoverReplacement(rs, deps), null);
// Same reserve through battle(): active has no PP; with items -> item on the reserve, without -> no item at all.
const dry = mk({ pp: [0, 0, 0, 0], personality: 1 });
const dryState = { flags: 0, mon: dry, mons: [slotMon(0, { personality: 1, pp: [0, 0, 0, 0] }), reserve], bag: potions };
assert.equal(new Policy().battle(dryState, deps).action, "item");
assert.deepEqual(noItems.battle(dryState, deps).action, "run"); // wild battle, nothing left to try
assert.equal(noItems.battle({ ...dryState, flags: C.BATTLE_TYPE_TRAINER }, deps).action, "stop");

// Field preparation: 10/40 HP with Potions -> heal; with noItems -> retreat to a center, never a medicine.
const field = { mon: { hp: 10, maxHP: 40, attackPP: 20, status: 0 }, bag: potions, stock: 5 };
assert.equal(new Policy().prepare(field, deps).heal, C.ITEM_POTION);
const r = noItems.prepare(field, deps);
assert.equal(r.heal, null);
assert.match(r.retreat, /return to center/);
// Poisoned with an Antidote: cure only when allowed.
const poisoned = { mon: { hp: 40, maxHP: 40, attackPP: 20, status: C.STATUS1_POISON }, bag: [{ item: C.ITEM_ANTIDOTE, quantity: 1 }], stock: 0 };
assert.equal(new Policy().prepare(poisoned, deps).cure, C.ITEM_ANTIDOTE);
assert.match(noItems.prepare(poisoned, deps).retreat, /untreated status/);

// Declared Yes/No answers: only what the route states; undeclared stays undefined (the driver stops).
const answers = new Policy({ answers: { MtMoon_B2F_EventScript_DomeFossil: true, Other_Script: false } });
assert.equal(answers.scriptYesNo("MtMoon_B2F_EventScript_DomeFossil"), true);
assert.equal(answers.scriptYesNo("Other_Script"), false);
assert.equal(answers.scriptYesNo("Never_Declared"), undefined);
assert.equal(answers.battleYesNo("Cmd_trygivecaughtmonnick"), false);
assert.equal(new Policy().nickname(), false);
assert.equal(new Policy().catchWild(), false);

// Unsupported formats stop; options are shared by reference through set().
assert.equal(new Policy().battle(state({ flags: C.BATTLE_TYPE_DOUBLE }), deps).action, "stop");
const live = new Policy(); live.set({ noItems: true });
assert.equal(live.bag(potions).length, 0);
console.log("policy cases PASS (noItems across battle/recovery/field, declared answers, stops)");
