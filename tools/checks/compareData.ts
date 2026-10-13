// Counts of FireRed/Emerald differences as computed by src/compare/diff.ts, printed as JSON for
// tools/checks/compare_data.py, which recomputes them with an independent implementation.
import { readFileSync } from "node:fs";
import { compareItems, compareMoves, compareSpecies, prepare } from "../../src/compare/diff";
import type { GameData, Raw, Row } from "../../src/compare/diff";

function load(root: string): GameData {
  const j = (p: string) => JSON.parse(readFileSync(`public/${root}/${p}`, "utf8"));
  return prepare({
    species: j("data/species.json"), moves: j("data/moves.json"), items: j("data/items.json"),
    trainers: j("data/trainers.json"), constants: j("constants.json"), charmap: j("charmap.json"),
  } as Raw);
}

const A = load("fr");
const B = load("emerald");
const withField = (rows: Row[], match: (f: string) => boolean) => rows.filter((r) => r.diffs.some((d) => match(d.field))).length;
const species = compareSpecies(A, B);
const moves = compareMoves(A, B);
const items = compareItems(A, B);
console.log(JSON.stringify({
  species: {
    total: species.length,
    egg: withField(species, (f) => f === "Grupos huevo"),
    learn: withField(species, (f) => f === "Movimientos por nivel"),
    held: withField(species, (f) => f === "Objetos salvajes"),
    tutor: withField(species, (f) => f === "Tutor"),
    tmhm: withField(species, (f) => f === "MT/MO"),
    stats: withField(species, (f) => f.startsWith("Base ")),
    types: withField(species, (f) => f === "Tipos"),
    abil: withField(species, (f) => f === "Habilidades"),
    evo: withField(species, (f) => f.startsWith("Evoluciones")),
    catch: withField(species, (f) => f === "Ratio de captura"),
  },
  moves: {
    total: moves.length,
    desc: withField(moves, (f) => f === "Descripción"),
    flags: withField(moves, (f) => f === "Flags"),
    acc: withField(moves, (f) => f === "Precisión"),
    power: withField(moves, (f) => f === "Potencia"),
    pp: withField(moves, (f) => f === "PP"),
    effect: withField(moves, (f) => f === "Efecto"),
    type: withField(moves, (f) => f === "Tipo"),
  },
  items: {
    total: items.length,
    only: items.filter((r) => r.onlyIn).length,
    both: items.filter((r) => !r.onlyIn).length,
    price: withField(items, (f) => f === "Precio"),
    desc: withField(items, (f) => f === "Descripción"),
    battle: withField(items, (f) => f === "Uso en combate"),
  },
}));
