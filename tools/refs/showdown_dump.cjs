// Dump Pokémon Showdown's per-generation data (gen3..gen9) as JSON on stdout.
// Run by tools/refs/showdown_gens.py inside the pinned checkout after `node build`;
// argv[2] is the checkout path. Handlers are stored as short hashes of their source
// so behaviour changes are visible without copying code.
"use strict";
const crypto = require("crypto");
const path = require("path");
const { Dex } = require(path.resolve(process.argv[2], "dist/sim/dex"));

const GENS = [3, 4, 5, 6, 7, 8, 9];
const hash = (text) => crypto.createHash("sha1").update(text).digest("hex").slice(0, 10);

function handlers(obj, prefix = "") {
  const out = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    if (typeof value === "function") out[prefix + key] = hash(String(value));
    else if (key === "condition" && value && typeof value === "object") Object.assign(out, handlers(value, "condition."));
  }
  return out;
}

const plain = (value) => JSON.parse(JSON.stringify(value ?? null));

function move(m) {
  return {
    num: m.num, gen: m.gen, isNonstandard: m.isNonstandard ?? null,
    type: m.type, category: m.category, basePower: m.basePower,
    accuracy: m.accuracy === true ? "always" : m.accuracy, pp: m.pp, priority: m.priority,
    target: m.target, flags: Object.keys(m.flags).sort(), critRatio: m.critRatio ?? 1,
    secondaries: plain(m.secondaries), self: plain(m.self), drain: plain(m.drain), recoil: plain(m.recoil),
    multihit: plain(m.multihit), ohko: plain(m.ohko), handlers: handlers(m),
  };
}
const ability = (a) => ({ num: a.num, gen: a.gen, isNonstandard: a.isNonstandard ?? null, flags: Object.keys(a.flags || {}).sort(), handlers: handlers(a) });
const item = (i) => ({
  num: i.num, gen: i.gen, isNonstandard: i.isNonstandard ?? null, fling: plain(i.fling),
  naturalGift: plain(i.naturalGift), handlers: handlers(i),
});
const species = (s) => ({
  num: s.num, gen: s.gen, isNonstandard: s.isNonstandard ?? null, types: s.types,
  baseStats: s.baseStats, abilities: plain(s.abilities),
});

const out = { moves: {}, abilities: {}, items: {}, species: {}, types: {} };
for (const gen of GENS) {
  const dex = Dex.mod(`gen${gen}`);
  const key = `gen${gen}`;
  for (const m of dex.moves.all()) (out.moves[m.id] ||= {})[key] = move(m);
  for (const a of dex.abilities.all()) (out.abilities[a.id] ||= {})[key] = ability(a);
  for (const i of dex.items.all()) (out.items[i.id] ||= {})[key] = item(i);
  for (const s of dex.species.all()) if (!s.forme && s.num > 0) (out.species[s.id] ||= {})[key] = species(s);
  for (const t of dex.types.all()) if (t.exists) (out.types[t.id] ||= {})[key] = plain(t.damageTaken);
}
process.stdout.write(JSON.stringify(out));
