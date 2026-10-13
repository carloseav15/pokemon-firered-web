// Comparación de datos exportados entre FireRed (public/fr) y Emerald (public/emerald): especies, movimientos,
// objetos y entrenadores. Es lógica pura (sin DOM) para poder verificarla contra una segunda implementación.
//
// Los ids numéricos pueden cambiar entre juegos (objetos, efectos), así que los campos que apuntan a otra tabla se
// comparan por NOMBRE de constante, no por número.

export type Raw = {
  species: any; // data/species.json
  moves: any; // data/moves.json
  items: any; // data/items.json
  trainers: any[]; // data/trainers.json
  constants: Record<string, number>; // constants.json
  charmap: { chars: Record<string, number> }; // charmap.json
};

export type FieldDiff = { field: string; a: string; b: string };
export type Row = { key: string; id: number; nameA: string | null; nameB: string | null; diffs: FieldDiff[]; onlyIn?: "A" | "B" };

/** Decodifica una cadena del juego (bytes en base64, terminada en 0xFF) con el charmap. */
export function makeDecoder(charmap: Raw["charmap"]): (b64: string) => string {
  const rev = new Map<number, string>();
  for (const [ch, byte] of Object.entries(charmap.chars)) if (!rev.has(byte) && ch.length === 1 && ch.charCodeAt(0) < 0x3000) rev.set(byte, ch);
  return (b64) => {
    const bin = atob(b64);
    let out = "";
    for (let i = 0; i < bin.length; i++) {
      const b = bin.charCodeAt(i);
      if (b === 0xff) break;
      if (b === 0xfc) { i += 1; continue; }
      if (b === 0xfa || b === 0xfb || b === 0xfe) { out += " "; continue; }
      out += rev.get(b) ?? "?";
    }
    return out;
  };
}

/** value -> every constant name with that value; aliases (EGG_GROUP_UNDISCOVERED / NO_EGGS_DISCOVERED) share a value. */
function reverseConstants(c: Record<string, number>, prefix: string): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (const [k, v] of Object.entries(c)) {
    if (!k.startsWith(prefix)) continue;
    const list = m.get(v) ?? [];
    list.push(k.slice(prefix.length));
    m.set(v, list);
  }
  return m;
}

export type GameData = {
  speciesName: (id: number) => string;
  moveName: (id: number) => string;
  itemName: (id: number) => string;
  decode: (b64: string) => string;
  raw: Raw;
  type: (id: number) => string;
  ability: (id: number) => string;
  effect: (id: number) => string;
  holdEffect: (id: number) => string;
  growth: (id: number) => string;
  eggGroup: (id: number) => string;
  pocket: (id: number) => string;
  trainerClass: (id: number) => string;
};

export function prepare(raw: Raw): GameData {
  const decode = makeDecoder(raw.charmap);
  const types = (raw.moves.types as string[]).map((s) => decode(s));
  const abilities = (raw.moves.abilities as { name: string }[]).map((a) => decode(a.name));
  const classes = (raw.moves.trainerClasses as string[]).map((s) => decode(s));
  const moveNames = (raw.moves.moves as { name: string }[]).map((m) => decode(m.name));
  const speciesNames = (raw.species.species as { name: string }[]).map((s) => decode(s.name));
  const itemById = new Map<number, string>();
  for (const it of raw.items.items as { id: number; const: string; name: string }[]) itemById.set(it.id, it.const.replace(/^ITEM_/, ""));
  const effect = reverseConstants(raw.constants, "EFFECT_");
  const hold = reverseConstants(raw.constants, "HOLD_EFFECT_");
  const growth = reverseConstants(raw.constants, "GROWTH_");
  const egg = reverseConstants(raw.constants, "EGG_GROUP_");
  const pocket = reverseConstants(raw.constants, "POCKET_");
  // "A|B" when a value has aliases; the comparison treats two names as equal when they share an alias.
  const nm = (m: Map<number, string[]>, id: number) => m.get(id)?.slice().sort().join("|") ?? `#${id}`;
  return {
    decode,
    raw,
    speciesName: (id) => speciesNames[id] ?? `#${id}`,
    moveName: (id) => (id === 0 ? "—" : moveNames[id] ?? `#${id}`),
    itemName: (id) => (id === 0 ? "—" : itemById.get(id) ?? `#${id}`),
    type: (id) => types[id] ?? `#${id}`,
    ability: (id) => abilities[id] ?? `#${id}`,
    effect: (id) => nm(effect, id),
    holdEffect: (id) => nm(hold, id),
    growth: (id) => nm(growth, id),
    eggGroup: (id) => nm(egg, id),
    // FireRed y Emerald nombran distinto el mismo bolsillo (TM_CASE / TM_HM, BERRY_POUCH / BERRIES).
    pocket: (id) => nm(pocket, id).replace("TM_CASE", "TM_HM").replace("BERRY_POUCH", "BERRIES"),
    trainerClass: (id) => classes[id] ?? `#${id}`,
  };
}

const fmt = (v: unknown): string => (Array.isArray(v) ? v.join("/") : String(v));

/** Equal when every position shares at least one alias ("UNDISCOVERED|NO_EGGS_DISCOVERED" matches "NO_EGGS_DISCOVERED"). */
function sameAliased(x: string, y: string): boolean {
  const xs = x.split("/");
  const ys = y.split("/");
  if (xs.length !== ys.length) return false;
  return xs.every((p, i) => {
    const pa = new Set(p.split("|"));
    return ys[i]!.split("|").some((n) => pa.has(n));
  });
}

function bitSet(words: number[], names: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const w = words[Math.floor(i / 32)] ?? 0;
    if ((w >>> (i % 32)) & 1) out.push(names[i]!);
  }
  return out;
}

function setDiff(field: string, a: string[], b: string[]): FieldDiff | null {
  const sa = new Set(a);
  const sb = new Set(b);
  const onlyA = a.filter((x) => !sb.has(x));
  const onlyB = b.filter((x) => !sa.has(x));
  if (onlyA.length === 0 && onlyB.length === 0) return null;
  return { field, a: onlyA.length ? `solo A: ${onlyA.join(", ")}` : "—", b: onlyB.length ? `solo B: ${onlyB.join(", ")}` : "—" };
}

const STATS = ["PS", "Ataque", "Defensa", "Velocidad", "At. esp.", "Def. esp."];

export function compareSpecies(A: GameData, B: GameData): Row[] {
  const sa = A.raw.species.species as any[];
  const sb = B.raw.species.species as any[];
  const n = Math.max(sa.length, sb.length);
  const tmA = (A.raw.species.tmhmMoves as number[]).map((m) => A.moveName(m));
  const tmB = (B.raw.species.tmhmMoves as number[]).map((m) => B.moveName(m));
  const tuA = (A.raw.species.tutorMoves as number[]).map((m) => A.moveName(m));
  const tuB = (B.raw.species.tutorMoves as number[]).map((m) => B.moveName(m));
  const rows: Row[] = [];
  for (let id = 1; id < n; id++) {
    const a = sa[id];
    const b = sb[id];
    if (!a || !b) continue;
    const diffs: FieldDiff[] = [];
    const push = (field: string, x: unknown, y: unknown) => {
      const fx = fmt(x);
      const fy = fmt(y);
      if (fx !== fy) diffs.push({ field, a: fx, b: fy });
    };
    const pushAliased = (field: string, x: unknown, y: unknown) => {
      const fx = fmt(x);
      const fy = fmt(y);
      if (!sameAliased(fx, fy)) diffs.push({ field, a: fx.replace(/\|[A-Z_]+/g, ""), b: fy.replace(/\|[A-Z_]+/g, "") });
    };
    for (let i = 0; i < 6; i++) push(`Base ${STATS[i]}`, a.base[i], b.base[i]);
    push("Tipos", a.types.map(A.type), b.types.map(B.type));
    push("Ratio de captura", a.catchRate, b.catchRate);
    push("Exp. base", a.expYield, b.expYield);
    push("EV", a.evYield, b.evYield);
    push("Objetos salvajes", a.items.map(A.itemName), b.items.map(B.itemName));
    push("Ratio de género", a.genderRatio, b.genderRatio);
    push("Ciclos de huevo", a.eggCycles, b.eggCycles);
    push("Amistad", a.friendship, b.friendship);
    pushAliased("Crecimiento", A.growth(a.growthRate), B.growth(b.growthRate));
    pushAliased("Grupos huevo", a.eggGroups.map(A.eggGroup), b.eggGroups.map(B.eggGroup));
    push("Habilidades", a.abilities.map(A.ability), b.abilities.map(B.ability));
    const lv = (g: GameData, s: any) => (s.learnset as number[][]).map(([l, m]) => `Nv${l} ${g.moveName(m)}`).join(", ");
    push("Movimientos por nivel", lv(A, a), lv(B, b));
    const ev = (g: GameData, s: any) => (s.evolutions as number[][]).map(([m, p, t]) => `${m}:${p}→${g.speciesName(t)}`).join(", ");
    push("Evoluciones (método:parámetro)", ev(A, a), ev(B, b));
    const d1 = setDiff("MT/MO", bitSet(a.tmhm, tmA), bitSet(b.tmhm, tmB));
    if (d1) diffs.push(d1);
    const d2 = setDiff("Tutor", bitSet([a.tutor], tuA), bitSet([b.tutor], tuB));
    if (d2) diffs.push(d2);
    rows.push({ key: String(id), id, nameA: A.speciesName(id), nameB: B.speciesName(id), diffs });
  }
  return rows;
}

export function compareMoves(A: GameData, B: GameData): Row[] {
  const ma = A.raw.moves.moves as any[];
  const mb = B.raw.moves.moves as any[];
  const rows: Row[] = [];
  for (let i = 1; i < Math.max(ma.length, mb.length); i++) {
    const a = ma[i];
    const b = mb[i];
    if (!a || !b) continue;
    const diffs: FieldDiff[] = [];
    const push = (field: string, x: unknown, y: unknown) => {
      const fx = fmt(x);
      const fy = fmt(y);
      if (fx !== fy) diffs.push({ field, a: fx, b: fy });
    };
    const pushAliased = (field: string, x: unknown, y: unknown) => {
      const fx = fmt(x);
      const fy = fmt(y);
      if (!sameAliased(fx, fy)) diffs.push({ field, a: fx.replace(/\|[A-Z_]+/g, ""), b: fy.replace(/\|[A-Z_]+/g, "") });
    };
    push("Nombre", A.decode(a.name), B.decode(b.name));
    pushAliased("Efecto", A.effect(a.effect), B.effect(b.effect));
    push("Potencia", a.power, b.power);
    push("Tipo", A.type(a.type), B.type(b.type));
    push("Precisión", a.accuracy, b.accuracy);
    push("PP", a.pp, b.pp);
    push("Prob. efecto", a.chance, b.chance);
    push("Objetivo", a.target, b.target);
    push("Prioridad", a.priority, b.priority);
    push("Flags", a.flags, b.flags);
    push("Descripción", A.decode(a.description), B.decode(b.description));
    rows.push({ key: String(i), id: i, nameA: A.decode(a.name), nameB: B.decode(b.name), diffs });
  }
  return rows;
}

export function compareItems(A: GameData, B: GameData): Row[] {
  const ia = new Map<string, any>();
  const ib = new Map<string, any>();
  for (const it of A.raw.items.items as any[]) ia.set(it.const, it);
  for (const it of B.raw.items.items as any[]) ib.set(it.const, it);
  const keys = [...new Set([...ia.keys(), ...ib.keys()])].filter((k) => !/^ITEM_[0-9A-F]{3}$/.test(k) && k !== "ITEM_NONE");
  const rows: Row[] = [];
  for (const k of keys) {
    const a = ia.get(k);
    const b = ib.get(k);
    const idForSort = a?.id ?? b.id;
    if (!a || !b) {
      rows.push({ key: k, id: idForSort, nameA: a ? A.decode(a.name) : null, nameB: b ? B.decode(b.name) : null, diffs: [], onlyIn: a ? "A" : "B" });
      continue;
    }
    const diffs: FieldDiff[] = [];
    const push = (field: string, x: unknown, y: unknown) => {
      const fx = fmt(x);
      const fy = fmt(y);
      if (fx !== fy) diffs.push({ field, a: fx, b: fy });
    };
    const pushAliased = (field: string, x: unknown, y: unknown) => {
      const fx = fmt(x);
      const fy = fmt(y);
      if (!sameAliased(fx, fy)) diffs.push({ field, a: fx.replace(/\|[A-Z_]+/g, ""), b: fy.replace(/\|[A-Z_]+/g, "") });
    };
    push("Nombre", A.decode(a.name), B.decode(b.name));
    push("Precio", a.price, b.price);
    pushAliased("Efecto al llevarlo", A.holdEffect(a.holdEffect), B.holdEffect(b.holdEffect));
    push("Parámetro", a.holdEffectParam, b.holdEffectParam);
    pushAliased("Bolsillo", A.pocket(a.pocket), B.pocket(b.pocket));
    push("Importancia", a.importance, b.importance);
    // type / fieldUseFunc se omiten: FireRed y Emerald nombran distinto esas funciones (FieldUseFunc_* / ItemUseOutOfBattle_*).
    push("Uso en combate", a.battleUsage, b.battleUsage);
    push("Descripción", A.decode(a.description), B.decode(b.description));
    rows.push({ key: k, id: idForSort, nameA: A.decode(a.name), nameB: B.decode(b.name), diffs });
  }
  return rows.sort((x, y) => x.id - y.id);
}

export type TrainerView = { id: number; cls: string; name: string; double: boolean; party: string };

export function trainerList(G: GameData): TrainerView[] {
  return (G.raw.trainers as any[]).map((t, id) => ({
    id,
    cls: G.trainerClass(t.class),
    name: G.decode(t.name),
    double: !!t.double,
    party: (t.party as any[]).map((p) => `${G.speciesName(p.species)} Nv${p.level}`).join(", "),
  })).filter((t) => t.name !== "" || t.party !== "");
}

/** Entrenadores que existen con la misma clase y nombre en los dos juegos (los ids no coinciden entre juegos). */
export function trainerOverlap(a: TrainerView[], b: TrainerView[]): Array<{ cls: string; name: string; a: TrainerView; b: TrainerView }> {
  const mb = new Map<string, TrainerView>();
  for (const t of b) if (t.name) mb.set(`${t.cls}|${t.name}`, t);
  const out: Array<{ cls: string; name: string; a: TrainerView; b: TrainerView }> = [];
  for (const t of a) {
    const o = t.name ? mb.get(`${t.cls}|${t.name}`) : undefined;
    if (o) out.push({ cls: t.cls, name: t.name, a: t, b: o });
  }
  return out;
}
