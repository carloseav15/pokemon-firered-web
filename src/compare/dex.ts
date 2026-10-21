// Ficha de especie «tipo Pokédex» con datos de FireRed y Emerald: primero lo que comparten, después lo exclusivo de
// cada juego. Lógica pura sobre los datos exportados (sin DOM); ver ./dexMain.ts para la página.

import type { GameData } from "./diff";

export type Location = { map: string; kind: string; min: number; max: number; chance: number };
export type DexSource = {
  game: GameData;
  wild: { rates: Record<string, number[]>; maps: Record<string, Record<string, { rate: number; mons: number[][] }>> };
  mapNames: Record<string, string>;
};

export type Item = { label: string; value: string };
export type Card = {
  id: number;
  national: number;
  nameA: string;
  nameB: string;
  common: Item[];
  commonLevelMoves: string[];
  commonTm: string[];
  commonTutor: string[];
  onlyA: Item[];
  onlyB: Item[];
  levelMovesA: string[];
  levelMovesB: string[];
  tmA: string[];
  tmB: string[];
  tutorA: string[];
  tutorB: string[];
  locA: Location[];
  locB: Location[];
};

const STATS = ["HP", "Attack", "Defense", "Speed", "Sp. Atk", "Sp. Def"];
const KIND: Record<string, string> = { land_mons: "Grass", water_mons: "Water", rock_smash_mons: "Rock Smash", fishing_mons: "Fishing" };

function bits(words: number[], names: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < names.length; i++) if (((words[Math.floor(i / 32)] ?? 0) >>> (i % 32)) & 1) out.push(names[i]!);
  return out;
}

export function locationsIndex(src: DexSource): Map<number, Location[]> {
  const idx = new Map<number, Location[]>();
  for (const [mapId, kinds] of Object.entries(src.wild.maps)) {
    for (const [kind, enc] of Object.entries(kinds)) {
      const rates = src.wild.rates[kind] ?? [];
      const bySpecies = new Map<number, Location>();
      enc.mons.forEach(([min, max, species], slot) => {
        const cur = bySpecies.get(species!);
        const chance = rates[slot] ?? 0;
        if (cur) {
          cur.min = Math.min(cur.min, min!);
          cur.max = Math.max(cur.max, max!);
          cur.chance += chance;
        } else bySpecies.set(species!, { map: src.mapNames[mapId] ?? mapId, kind: KIND[kind] ?? kind, min: min!, max: max!, chance });
      });
      for (const [sp, loc] of bySpecies) {
        const l = idx.get(sp) ?? [];
        l.push(loc);
        idx.set(sp, l);
      }
    }
  }
  return idx;
}

export function speciesIds(A: DexSource, B: DexSource): number[] {
  const out: number[] = [];
  const n = Math.min(A.game.raw.species.species.length, B.game.raw.species.species.length);
  for (let i = 1; i < n; i++) {
    const nm = A.game.speciesName(i);
    if (nm && nm !== "?" && !/^\?+$/.test(nm) && !nm.startsWith("-") && A.game.raw.species.species[i].national) out.push(i);
  }
  return out;
}

export function buildCard(A: DexSource, B: DexSource, id: number, locA: Map<number, Location[]>, locB: Map<number, Location[]>): Card {
  const ga = A.game;
  const gb = B.game;
  const a = ga.raw.species.species[id];
  const b = gb.raw.species.species[id];
  const common: Item[] = [];
  const onlyA: Item[] = [];
  const onlyB: Item[] = [];
  const cmp = (label: string, x: string, y: string, same = x === y) => {
    if (same) common.push({ label, value: x });
    else {
      onlyA.push({ label, value: x });
      onlyB.push({ label, value: y });
    }
  };
  cmp("Types", a.types.map(ga.type).join(" / "), b.types.map(gb.type).join(" / "));
  cmp("Base", a.base.map((v: number, i: number) => `${STATS[i]} ${v}`).join(" · "), b.base.map((v: number, i: number) => `${STATS[i]} ${v}`).join(" · "));
  cmp("Abilities", a.abilities.map(ga.ability).join(" / "), b.abilities.map(gb.ability).join(" / "));
  cmp("Catch rate", String(a.catchRate), String(b.catchRate));
  cmp("Exp. base", String(a.expYield), String(b.expYield));
  cmp("EV", a.evYield.join("/"), b.evYield.join("/"));
  cmp("Gender ratio", String(a.genderRatio), String(b.genderRatio));
  cmp("Egg cycles", String(a.eggCycles), String(b.eggCycles));
  cmp("Friendship", String(a.friendship), String(b.friendship));
  const ea = a.eggGroups.map(ga.eggGroup);
  const eb = b.eggGroups.map(gb.eggGroup);
  const aliasSame = ea.length === eb.length && ea.every((p: string, i: number) => p.split("|").some((n) => eb[i]!.split("|").includes(n)));
  cmp("Egg groups", ea.map((s: string) => s.split("|")[0]).join(" / "), eb.map((s: string) => s.split("|")[0]).join(" / "), aliasSame);
  const ha = a.items.map(ga.itemName).join(" / ");
  const hb = b.items.map(gb.itemName).join(" / ");
  cmp("Held items in the wild", ha, hb);
  const evo = (g: GameData, s: any) => (s.evolutions as number[][]).map(([m, p, t]) => `${g.speciesName(t!)} (${m}:${p})`).join(", ") || "—";
  cmp("Evolutions", evo(ga, a), evo(gb, b));

  const national = a.national as number;
  const pa = ga.raw.species.pokedex[national];
  const pb = gb.raw.species.pokedex[national];
  if (pa && pb) {
    cmp("Category", ga.decode(pa.category), gb.decode(pb.category));
    cmp("Height / weight", `${pa.height / 10} m · ${pa.weight / 10} kg`, `${pb.height / 10} m · ${pb.weight / 10} kg`);
    cmp("Pokédex entry", ga.decode(pa.description), gb.decode(pb.description));
  }

  const lv = (g: GameData, s: any) => (s.learnset as number[][]).map(([l, m]) => `Nv${l} ${g.moveName(m!)}`);
  const la = lv(ga, a);
  const lb = lv(gb, b);
  const sb = new Set(lb);
  const sa = new Set(la);
  const tmA = (ga.raw.species.tmhmMoves as number[]).map((m) => ga.moveName(m));
  const tmB = (gb.raw.species.tmhmMoves as number[]).map((m) => gb.moveName(m));
  const tuA = (ga.raw.species.tutorMoves as number[]).map((m) => ga.moveName(m));
  const tuB = (gb.raw.species.tutorMoves as number[]).map((m) => gb.moveName(m));
  const ta = bits(a.tmhm, tmA);
  const tb = bits(b.tmhm, tmB);
  const ua = bits([a.tutor], tuA);
  const ub = bits([b.tutor], tuB);
  const only = (x: string[], y: string[]) => x.filter((v) => !new Set(y).has(v));
  return {
    id, national, nameA: ga.speciesName(id), nameB: gb.speciesName(id),
    common, commonLevelMoves: la.filter((m) => sb.has(m)),
    commonTm: ta.filter((m) => tb.includes(m)), commonTutor: ua.filter((m) => ub.includes(m)),
    onlyA, onlyB,
    levelMovesA: la.filter((m) => !sb.has(m)), levelMovesB: lb.filter((m) => !sa.has(m)),
    tmA: only(ta, tb), tmB: only(tb, ta), tutorA: only(ua, ub), tutorB: only(ub, ua),
    locA: locA.get(id) ?? [], locB: locB.get(id) ?? [],
  };
}
