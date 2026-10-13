// Catálogo Gen 1-9 de pokeemerald-expansion (expansion.html). Datos: public/expansion/ (tools/viewer/expansion_catalog.py).
import { activateSpriteSections, loadSpriteIndex, otherSourcesHtml, thumbOf } from "./dexSprites";
import type { SpriteIndex } from "./dexSprites";

type Meta = { commit: string; config: Record<string, string>; note: string };
type Species = {
  key: string; name: string; nat: number; gen: number; types: string[]; base: number[]; abilities: number[]; catch: number; exp: number;
  ev: Record<string, number>; gender: number; eggCycles: number; friend: number; growth: string; eggGroups: string[]; color: string;
  height: number; weight: number; category: string; desc: string; level: number[][]; egg: number[]; other?: number[]; items: number[];
  evolutions: { method: string; param: string; to: number; if: string[][] }[]; flags: string[];
};
type Move = { key: string; name: string; desc?: string; effect?: string; power?: number; type?: string; acc?: number; pp?: number; prio?: number; cat?: string; target?: string; flags?: string[] };
type Ability = { key: string; name: string; desc?: string; ai?: number };
type Item = { key: string; name: string; desc?: string; price?: number; pocket?: string; hold?: string | null; use?: string | null };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pretty = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const $ = (id: string) => document.getElementById(id)!;
const rowsEl = $("rows"), filtersEl = $("filters"), detailEl = $("detail"), countEl = $("count"), noteEl = $("note");

let species: Species[] = [], moves: Move[] = [], abilities: Ability[] = [], items: Item[] = [];
let meta: Meta;
let sprites: SpriteIndex | null = null;
let tab: "s" | "m" | "a" | "i" = "s";
let current = "";
let defaultGen = 9;
let lsGen = 9;
const lsCache = new Map<number, Record<string, number[][]>>();
const state = { q: "", gen: "", type: "", forms: false, cat: "", pocket: "" };

const typeChip = (t: string | undefined | null) => (t ? `<span class="chip t-${t}">${esc(pretty(t))}</span>` : "");
const moveLink = (i: number) => (moves[i] ? `<a href="#m/${moves[i]!.key}" data-go="m/${moves[i]!.key}">${esc(moves[i]!.name)}</a>` : "?");
const speciesLink = (i: number) => (species[i] ? `<a href="#s/${species[i]!.key}" data-go="s/${species[i]!.key}">${esc(label(species[i]!))}</a>` : "?");

const baseKeyByNat = new Map<number, string>();
function label(s: Species): string {
  const base = baseKeyByNat.get(s.nat);
  if (!base || base === s.key) return s.name;
  const suffix = s.key.startsWith(base + "_") ? s.key.slice(base.length + 1) : s.key;
  return `${s.name} · ${pretty(suffix)}`;
}
const isBase = (s: Species) => baseKeyByNat.get(s.nat) === s.key;

const EVO_METHOD: Record<string, string> = {
  LEVEL: "Subir de nivel", LEVEL_BATTLE_ONLY: "Subir de nivel (solo combate)", ITEM: "Usar", TRADE: "Intercambio", NONE: "Sin método (forma)",
  SPIN: "Girar (Alcremie)", BATTLE_END: "Fin de combate", SPLIT_FROM_EVO: "Se separa al evolucionar", SCRIPT_TRIGGER: "Evento especial",
};
const EVO_COND: Record<string, string> = {
  IF_TIME: "de", IF_NOT_TIME: "no de", IF_MIN_FRIENDSHIP: "con amistad alta", IF_HOLD_ITEM: "llevando", IF_KNOWS_MOVE: "conociendo",
  IF_KNOWS_MOVE_TYPE: "con un movimiento de tipo", IF_GENDER: "siendo", IF_REGION: "en la región", IF_NOT_REGION: "fuera de la región",
  IF_IN_MAP: "en el mapa", IF_IN_MAPSEC: "en la zona", IF_WEATHER: "con clima", IF_MIN_BEAUTY: "con belleza alta",
  IF_USED_MOVE_X_TIMES: "tras usar un movimiento varias veces", IF_CRITICAL_HITS_GE: "tras golpes críticos",
  IF_RECOIL_DAMAGE_GE: "tras daño de retroceso", IF_CURRENT_DAMAGE_GE: "con daño recibido", IF_BAG_ITEM_COUNT: "con objetos en la mochila",
  IF_SPECIES_IN_PARTY: "con una especie en el equipo", IF_TYPE_IN_PARTY: "con un tipo en el equipo",
  IF_TRADE_PARTNER_SPECIES: "intercambiando con", IF_DEFEAT_X_WITH_ITEMS: "derrotando con objetos", IF_MIN_OVERWORLD_STEPS: "tras pasos",
  IF_PID_MODULO_100_GT: "(personalidad)", IF_PID_MODULO_100_EQ: "(personalidad)", IF_PID_UPPER_MODULO_10_GT: "(personalidad)",
  IF_PID_UPPER_MODULO_10_LT: "(personalidad)",
};
function evoName(token: string): string {
  if (token.startsWith("ITEM_")) return items.find((i) => i.key === token.slice(5))?.name ?? pretty(token.slice(5));
  if (token.startsWith("MOVE_")) return moves.find((m) => m.key === token.slice(5))?.name ?? pretty(token.slice(5));
  if (token.startsWith("SPECIES_")) return pretty(token.slice(8));
  return pretty(token.replace(/^(TIME_|REGION_|TYPE_|MON_|WEATHER_|MAPSEC_|MAP_)/, ""));
}
function evoText(e: Species["evolutions"][number]): string {
  const base = e.method === "LEVEL" ? (e.param === "0" ? EVO_METHOD.LEVEL : `Nivel ${e.param}`)
    : e.method === "ITEM" ? `${EVO_METHOD.ITEM} ${evoName(e.param)}` : `${EVO_METHOD[e.method] ?? pretty(e.method)}${e.param !== "0" ? ` ${evoName(e.param)}` : ""}`;
  const conds = e.if.map(([k, v]) => `${EVO_COND[k!] ?? pretty(k!.replace(/^IF_/, ""))}${v && k !== "IF_MIN_FRIENDSHIP" ? ` ${evoName(v)}` : ""}`.trim());
  return conds.length ? `${base} (${conds.join(", ")})` : base;
}

// ---------------------------------------------------------------- lista
function listSpecies(): string {
  const q = state.q.toLowerCase();
  const out = species.filter((s) => {
    if (!s.nat) return false;
    if (!state.forms && !isBase(s)) return false;
    if (state.gen && String(s.gen) !== state.gen) return false;
    if (state.type && !s.types.includes(state.type)) return false;
    return !q || `${label(s)} ${s.nat} ${s.key}`.toLowerCase().includes(q);
  });
  countEl.textContent = `${out.length} de ${species.filter((s) => s.nat && (state.forms || isBase(s))).length}`;
  return out
    .map((s) => {
      const t = sprites ? thumbOf(sprites, s.nat) : null;
      const size = !t ? "" : t.n > 1 ? (t.axis === "y" ? `36px ${36 * t.n}px` : `${36 * t.n}px 36px`) : "36px 36px";
      const bg = t ? `style="background-image:url(${t.url});background-size:${size}"` : "";
      return `<div class="row${s.key === current ? " sel" : ""}" data-go="s/${s.key}"><div class="th" ${bg}></div><span>${esc(label(s))}</span><small>#${s.nat} · ${s.types.filter((x, i, a) => a.indexOf(x) === i).map(pretty).join("/")}</small></div>`;
    })
    .join("");
}
function listMoves(): string {
  const q = state.q.toLowerCase();
  const out = moves.filter((m) => m.name && (!state.type || m.type === state.type) && (!state.cat || m.cat === state.cat) && (!q || `${m.name} ${m.key}`.toLowerCase().includes(q)));
  countEl.textContent = `${out.length} de ${moves.filter((m) => m.name).length}`;
  return out.map((m) => `<div class="row${m.key === current ? " sel" : ""}" data-go="m/${m.key}"><span>${esc(m.name)}</span>${typeChip(m.type)}<small>${m.power ? `${m.power} · ` : ""}${m.acc ?? "—"}%</small></div>`).join("");
}
function listAbilities(): string {
  const q = state.q.toLowerCase();
  const out = abilities.filter((a) => a.name && (!q || `${a.name} ${a.desc ?? ""}`.toLowerCase().includes(q)));
  countEl.textContent = `${out.length} de ${abilities.length}`;
  return out.map((a) => `<div class="row${a.key === current ? " sel" : ""}" data-go="a/${a.key}"><span>${esc(a.name)}</span></div>`).join("");
}
function listItems(): string {
  const q = state.q.toLowerCase();
  const out = items.filter((i) => i.name && (!state.pocket || i.pocket === state.pocket) && (!q || `${i.name} ${i.key}`.toLowerCase().includes(q)));
  countEl.textContent = `${out.length} de ${items.length}`;
  return out.map((i) => `<div class="row${i.key === current ? " sel" : ""}" data-go="i/${i.key}"><span>${esc(i.name)}</span><small>${esc(pretty(i.pocket))}</small></div>`).join("");
}

function renderFilters(): void {
  const types = ["NORMAL", "FIRE", "WATER", "ELECTRIC", "GRASS", "ICE", "FIGHTING", "POISON", "GROUND", "FLYING", "PSYCHIC", "BUG", "ROCK", "GHOST", "DRAGON", "DARK", "STEEL", "FAIRY"];
  const typeSel = `<select data-f="type"><option value="">Tipo</option>${types.map((t) => `<option value="${t}" ${state.type === t ? "selected" : ""}>${pretty(t)}</option>`).join("")}</select>`;
  const search = `<input type="search" data-f="q" placeholder="Buscar…" value="${esc(state.q)}" />`;
  if (tab === "s") {
    filtersEl.innerHTML = search + `<select data-f="gen"><option value="">Generación</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => `<option value="${g}" ${state.gen === String(g) ? "selected" : ""}>Gen ${g}</option>`).join("")}</select>` + typeSel +
      `<label><input type="checkbox" data-f="forms" ${state.forms ? "checked" : ""} /> con formas</label>`;
  } else if (tab === "m") {
    filtersEl.innerHTML = search + typeSel + `<select data-f="cat"><option value="">Categoría</option>${["PHYSICAL", "SPECIAL", "STATUS"].map((c) => `<option value="${c}" ${state.cat === c ? "selected" : ""}>${pretty(c)}</option>`).join("")}</select>`;
  } else if (tab === "i") {
    const pockets = [...new Set(items.map((i) => i.pocket).filter(Boolean))] as string[];
    filtersEl.innerHTML = search + `<select data-f="pocket"><option value="">Bolsillo</option>${pockets.map((p) => `<option value="${p}" ${state.pocket === p ? "selected" : ""}>${pretty(p)}</option>`).join("")}</select>`;
  } else filtersEl.innerHTML = search;
}
function renderList(): void {
  rowsEl.innerHTML = { s: listSpecies, m: listMoves, a: listAbilities, i: listItems }[tab]();
}

// ---------------------------------------------------------------- fichas
const STAT_NAMES = ["PS", "Ataque", "Defensa", "At. esp.", "Def. esp.", "Velocidad"];
const statColor = (v: number) => (v >= 130 ? "#22c55e" : v >= 100 ? "#84cc16" : v >= 70 ? "#eab308" : v >= 50 ? "#f97316" : "#ef4444");

function moveTable(list: { lv?: number; m: number }[]): string {
  if (!list.length) return `<span class="none">ninguno</span>`;
  const rows = list.map(({ lv, m }) => {
    const mv = moves[m];
    return `<tr class="mv"><td>${lv === undefined ? "" : `Nv ${lv}`}</td><td>${moveLink(m)}</td><td>${typeChip(mv?.type)}</td><td class="meta">${esc(pretty(mv?.cat))}</td><td>${mv?.power || "—"}</td><td>${mv?.acc ? `${mv.acc}%` : "—"}</td><td>${mv?.pp ?? ""}</td></tr>`;
  });
  return `<table><tr><th></th><th>Movimiento</th><th>Tipo</th><th>Cat.</th><th>Pot.</th><th>Prec.</th><th>PP</th></tr>${rows.join("")}</table>`;
}

function showSpecies(key: string): void {
  const s = species.find((x) => x.key === key);
  if (!s) return;
  current = key;
  const total = s.base.reduce((a, b) => a + b, 0);
  const sibs = species.filter((x) => x.nat === s.nat && x.key !== s.key);
  const fallbackDesc = s.desc || species.find((x) => x.nat === s.nat && x.desc)?.desc || "";
  const ab = s.abilities.map((a, i) => (a >= 0 ? `<div>${i === 2 ? "Oculta: " : ""}<b>${esc(abilities[a]!.name)}</b> <span class="meta">${esc(abilities[a]!.desc ?? "")}</span></div>` : "")).join("");
  const genderTxt = s.gender === 255 ? "Sin género" : s.gender === 0 ? "Solo macho" : s.gender === 254 ? "Solo hembra" : `${((s.gender / 255) * 100).toFixed(1)} % hembra`;
  const evs = Object.entries(s.ev).map(([k, v]) => `${v} ${pretty(k)}`).join(", ") || "—";
  const evoFrom = species.filter((x) => x.evolutions.some((e) => e.to === species.indexOf(s)));
  detailEl.innerHTML = `
    <h2>#${String(s.nat).padStart(3, "0")} ${esc(label(s))}</h2>
    <div>${[...new Set(s.types)].map(typeChip).join("")} <span class="chip flat">Gen ${s.gen}</span> ${s.flags.map((f) => `<span class="chip flat">${esc(pretty(f.replace(/^is/, "")))}</span>`).join("")}
      <span class="meta">${esc(s.category)}</span></div>
    ${fallbackDesc ? `<p>${esc(fallbackDesc)}</p>` : ""}
    <div class="cols">
      <div>
        <h3>Estadísticas base (total ${total})</h3>
        <div class="stats">${s.base.map((v, i) => `<span>${STAT_NAMES[i]}</span><b>${v}</b><div class="bar"><i style="width:${Math.min(100, (v / 255) * 100)}%;background:${statColor(v)}"></i></div>`).join("")}</div>
        <h3>Habilidades</h3>${ab || `<span class="none">—</span>`}
      </div>
      <div>
        <h3>Datos</h3>
        <dl><dt>Altura / peso</dt><dd>${(s.height / 10).toFixed(1)} m · ${(s.weight / 10).toFixed(1)} kg</dd>
        <dt>Ratio de captura</dt><dd>${s.catch}</dd><dt>Exp. base</dt><dd>${s.exp}</dd><dt>EV al derrotarlo</dt><dd>${esc(evs)}</dd>
        <dt>Género</dt><dd>${genderTxt}</dd><dt>Ciclos de huevo</dt><dd>${s.eggCycles}</dd><dt>Amistad base</dt><dd>${s.friend}</dd>
        <dt>Crecimiento</dt><dd>${esc(pretty(s.growth))}</dd><dt>Grupos huevo</dt><dd>${[...new Set(s.eggGroups)].map((g) => esc(pretty(g))).join(" / ")}</dd>
        <dt>Color</dt><dd>${esc(pretty(s.color))}</dd>
        <dt>Objetos salvajes</dt><dd>${s.items.map((i) => (i >= 0 ? esc(items[i]!.name) : "—")).join(" / ")}</dd></dl>
      </div>
    </div>
    <h3>Evolución</h3>
    ${evoFrom.length ? `<div>Viene de: ${evoFrom.map((x) => speciesLink(species.indexOf(x))).join(", ")}</div>` : ""}
    ${s.evolutions.length ? `<ul>${s.evolutions.map((e) => `<li>${speciesLink(e.to)} — ${esc(evoText(e))}</li>`).join("")}</ul>` : `<span class="none">no evoluciona</span>`}
    ${sibs.length ? `<h3>Otras formas</h3><div>${sibs.map((x) => `<a class="chip flat" href="#s/${x.key}" data-go="s/${x.key}">${esc(label(x))}</a>`).join("")}</div>` : ""}
    <h3>Sprites de las fuentes</h3><div id="others"></div>
    <h3>Movimientos por nivel <select id="lsgen">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => `<option value="${g}" ${g === lsGen ? "selected" : ""}>Gen ${g}${g === defaultGen ? " (por defecto)" : ""}</option>`).join("")}</select></h3>
    <div id="levelBox"></div>
    <h3>Movimientos huevo (${s.egg.length})</h3>${moveTable(s.egg.map((m) => ({ m })))}
    <h3>Otros (MT, tutor y similares) (${(s.other ?? []).length})</h3>${moveTable((s.other ?? []).map((m) => ({ m })))}`;
  const others = $("others");
  others.innerHTML = otherSourcesHtml(sprites, s.nat);
  activateSpriteSections(others);
  void renderLevel(s);
}

/** Learnset por nivel de la generación elegida (la de P_LVL_UP_LEARNSETS viene en species.json). */
async function renderLevel(s: Species): Promise<void> {
  const box = document.getElementById("levelBox");
  if (!box) return;
  let list: number[][] = s.level;
  if (lsGen !== defaultGen) {
    let data = lsCache.get(lsGen);
    if (!data) {
      data = ((await (await fetch(`/expansion/learnsets_gen${lsGen}.json`)).json()) as { data: Record<string, number[][]> }).data;
      lsCache.set(lsGen, data);
    }
    list = data[s.key] ?? [];
  }
  if (current !== s.key) return;
  box.innerHTML = `<div class="meta">${list.length} movimientos${lsGen !== defaultGen ? " · tabla de esa generación del propio proyecto" : ""}</div>` + moveTable(list.map(([lv, m]) => ({ lv: lv!, m: m! })));
}

function showMove(key: string): void {
  const idx = moves.findIndex((m) => m.key === key);
  const m = moves[idx];
  if (!m) return;
  current = key;
  const learners = species.filter((s) => s.nat && (s.level.some(([, mm]) => mm === idx) || s.egg.includes(idx) || (s.other ?? []).includes(idx)));
  const how = (s: Species) => (s.level.some(([, mm]) => mm === idx) ? `Nv ${s.level.filter(([, mm]) => mm === idx).map(([l]) => l).join("/")}` : s.egg.includes(idx) ? "huevo" : "otro");
  detailEl.innerHTML = `
    <h2>${esc(m.name)}</h2>
    <div>${typeChip(m.type)} <span class="chip flat">${esc(pretty(m.cat))}</span> ${(m.flags ?? []).map((f) => `<span class="chip flat">${esc(pretty(f))}</span>`).join("")}</div>
    <p>${esc(m.desc ?? "")}</p>
    <dl><dt>Potencia</dt><dd>${m.power || "—"}</dd><dt>Precisión</dt><dd>${m.acc ? `${m.acc} %` : "—"}</dd><dt>PP</dt><dd>${m.pp ?? "—"}</dd>
    <dt>Prioridad</dt><dd>${m.prio ?? 0}</dd><dt>Objetivo</dt><dd>${esc(pretty(m.target))}</dd><dt>Efecto</dt><dd>${esc(pretty(m.effect))}</dd></dl>
    <h3>Pokémon que lo aprenden (${learners.length})</h3>
    ${learners.length ? `<div>${learners.slice(0, 400).map((s) => `<a class="chip flat" href="#s/${s.key}" data-go="s/${s.key}">${esc(label(s))} · ${how(s)}</a>`).join("")}${learners.length > 400 ? " …" : ""}</div>` : `<span class="none">ninguno</span>`}`;
}

function showAbility(key: string): void {
  const idx = abilities.findIndex((a) => a.key === key);
  const a = abilities[idx];
  if (!a) return;
  current = key;
  const who = species.filter((s) => s.nat && s.abilities.includes(idx));
  detailEl.innerHTML = `
    <h2>${esc(a.name)}</h2><p>${esc(a.desc ?? "")}</p>
    <dl><dt>Valoración de la IA</dt><dd>${a.ai ?? "—"}</dd></dl>
    <h3>Pokémon con esta habilidad (${who.length})</h3>
    <div>${who.slice(0, 500).map((s) => `<a class="chip flat" href="#s/${s.key}" data-go="s/${s.key}">${esc(label(s))}${s.abilities[2] === idx ? " (oculta)" : ""}</a>`).join("")}</div>`;
}

function showItem(key: string): void {
  const idx = items.findIndex((i) => i.key === key);
  const i = items[idx];
  if (!i) return;
  current = key;
  const holders = species.filter((s) => s.nat && s.items.includes(idx));
  detailEl.innerHTML = `
    <h2>${esc(i.name)}</h2><p>${esc(i.desc ?? "")}</p>
    <dl><dt>Precio</dt><dd>${i.price ?? "—"}</dd><dt>Bolsillo</dt><dd>${esc(pretty(i.pocket))}</dd>
    <dt>Efecto al llevarlo</dt><dd>${esc(pretty(i.hold))}</dd><dt>Uso en combate</dt><dd>${esc(pretty(i.use))}</dd></dl>
    ${holders.length ? `<h3>Lo llevan en estado salvaje</h3><div>${holders.map((s) => `<a class="chip flat" href="#s/${s.key}" data-go="s/${s.key}">${esc(label(s))}</a>`).join("")}</div>` : ""}`;
}

function go(path: string): void {
  const [t, key] = path.split("/") as ["s" | "m" | "a" | "i", string];
  if (t !== tab) {
    tab = t;
    document.querySelectorAll<HTMLElement>("button.tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
    state.q = "";
    renderFilters();
  }
  current = key ?? "";
  if (key) ({ s: showSpecies, m: showMove, a: showAbility, i: showItem })[t](key);
  history.replaceState(null, "", `#${path}`);
  renderList();
  rowsEl.querySelector(".row.sel")?.scrollIntoView({ block: "nearest" });
}

document.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-go]");
  if (el) {
    e.preventDefault();
    go(el.dataset.go!);
    return;
  }
  const t = (e.target as HTMLElement).closest<HTMLElement>("button.tab");
  if (t) go(`${t.dataset.tab}/`);
});
detailEl.addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement;
  if (t.id === "lsgen") {
    lsGen = Number(t.value);
    const sp = species.find((x) => x.key === current);
    if (sp) void renderLevel(sp);
  }
});
filtersEl.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  const f = t.dataset.f as keyof typeof state;
  if (!f) return;
  (state as Record<string, string | boolean>)[f] = t instanceof HTMLInputElement && t.type === "checkbox" ? t.checked : t.value;
  renderList();
});

(async () => {
  const get = async (n: string) => (await fetch(`/expansion/${n}.json`)).json() as Promise<{ _meta: Meta; data: unknown[] }>;
  const [sp, mv, ab, it] = await Promise.all([get("species"), get("moves"), get("abilities"), get("items")]).catch(() => {
    throw new Error("faltan datos: npm run refs:fetch -- pokeemerald-expansion && npm run expansion:catalog");
  });
  species = sp.data as Species[];
  moves = mv.data as Move[];
  abilities = ab.data as Ability[];
  items = it.data as Item[];
  meta = sp._meta;
  defaultGen = Number((sp._meta as unknown as { defaultLearnsetGen?: number }).defaultLearnsetGen ?? 9);
  lsGen = defaultGen;
  for (const s of species) if (s.nat && !baseKeyByNat.has(s.nat)) baseKeyByNat.set(s.nat, s.key);
  sprites = await loadSpriteIndex();
  const cfg = Object.entries(meta.config).filter(([k]) => /^(GEN_LATEST|P_UPDATED_STATS|P_UPDATED_TYPES|B_UPDATED_MOVE_DATA)$/.test(k)).map(([k, v]) => `${k} = ${v}`).join(" · ");
  noteEl.textContent = `Datos de pokeemerald-expansion @${meta.commit.slice(0, 8)} con su configuración por defecto (${cfg}). No es la fuente de verdad de ningún juego: los valores son los del proyecto, no los de una generación concreta.`;
  renderFilters();
  const h = location.hash.slice(1);
  go(/^[smai]\/./.test(h) ? h : "s/BULBASAUR");
  window.addEventListener("hashchange", () => {
    const n = location.hash.slice(1);
    if (/^[smai]\/./.test(n) && n.split("/")[1] !== current) go(n);
  });
})().catch((e) => {
  detailEl.innerHTML = `<p class="none">Error: ${esc(String(e))}</p>`;
});
