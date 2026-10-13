// Página de la Pokédex comparada (dex.html). Datos: public/fr y public/emerald; sprites de cada juego.
import { prepare } from "./diff";
import type { Raw } from "./diff";
import { buildCard, locationsIndex, speciesIds } from "./dex";
import type { Card, DexSource, Location } from "./dex";

async function load(root: string): Promise<DexSource> {
  const j = async (p: string) => (await fetch(`${root}/${p}`)).json();
  const [species, moves, items, trainers, constants, charmap, wild, maps] = await Promise.all([
    j("data/species.json"), j("data/moves.json"), j("data/items.json"), j("data/trainers.json"), j("constants.json"), j("charmap.json"),
    j("data/wild.json"), j("maps.json"),
  ]);
  const mapNames: Record<string, string> = {};
  for (const [id, m] of Object.entries(maps.maps as Record<string, { name: string }>)) mapNames[id] = m.name;
  return { game: prepare({ species, moves, items, trainers, constants, charmap } as Raw), wild, mapNames };
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const listEl = document.getElementById("list")!;
const detailEl = document.getElementById("detail")!;
const q = document.getElementById("q") as HTMLInputElement;
const countEl = document.getElementById("count")!;
let A: DexSource;
let B: DexSource;
let locA: Map<number, Location[]>;
let locB: Map<number, Location[]>;
let ids: number[] = [];
let selected = 0;

type SpriteKind = "front" | "front_shiny" | "back" | "back_shiny" | "icon" | "footprint" | "front_anim";
const sprite = (root: string, kind: SpriteKind, id: number) => `${root}/gfx/pokemon/${kind}/${id}.png`;

function ul(items: string[], empty = "—"): string {
  return items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<span class="none">${empty}</span>`;
}

function locs(l: Location[]): string {
  if (!l.length) return `<span class="none">sin encuentros salvajes en este juego</span>`;
  const rows = l
    .slice()
    .sort((x, y) => x.map.localeCompare(y.map))
    .map((x) => `${x.map} · ${x.kind} · Nv${x.min === x.max ? x.min : `${x.min}-${x.max}`} · ${x.chance}%`);
  return ul(rows);
}

function dl(items: { label: string; value: string }[]): string {
  return `<dl>${items.map((i) => `<dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd>`).join("")}</dl>`;
}

function show(id: number): void {
  selected = id;
  document.querySelectorAll(".tile").forEach((t) => t.classList.toggle("sel", (t as HTMLElement).dataset.id === String(id)));
  const c: Card = buildCard(A, B, id, locA, locB);
  const sameName = c.nameA === c.nameB;
  // Cada sprite oculta su casilla si el juego no lo tiene (p. ej. la hoja animada solo existe en Emerald).
  const spr = (root: string, kind: SpriteKind, label: string) => {
    const url = sprite(root, kind, id);
    if (kind === "icon") {
      // Hoja de 32x64: dos fotogramas de 32x32 que se alternan.
      return `<div class="sprite"><div class="icon" style="background-image:url(${url})"></div>${label}<img src="${url}" alt="" style="display:none" onerror="this.parentElement.style.display='none'" /></div>`;
    }
    if (kind === "front_anim") {
      return `<div class="sprite"><div class="anim" style="background-image:url(${url})"></div>${label}<img src="${url}" alt="" style="display:none" onerror="this.parentElement.style.display='none'" /></div>`;
    }
    const cls = kind === "footprint" ? ' class="foot"' : "";
    return `<div class="sprite"><img${cls} src="${url}" alt="" onerror="this.parentElement.style.display='none'" />${label}</div>`;
  };
  detailEl.innerHTML = `
    <h2>#${String(c.national).padStart(3, "0")} ${esc(c.nameA)}${sameName ? "" : ` <span style="color:var(--b)">/ ${esc(c.nameB)}</span>`}</h2>
    <div class="sprites">
      ${spr("/fr", "front", "FireRed")}${spr("/fr", "front_shiny", "FireRed · variocolor")}
      ${spr("/fr", "back", "FireRed · espalda")}${spr("/fr", "back_shiny", "FireRed · espalda variocolor")}
      ${spr("/fr", "icon", "FireRed · icono")}${spr("/fr", "footprint", "FireRed · huella")}
    </div>
    <div class="sprites">
      ${spr("/emerald", "front", "Emerald")}${spr("/emerald", "front_shiny", "Emerald · variocolor")}
      ${spr("/emerald", "front_anim", "Emerald · animación")}
      ${spr("/emerald", "back", "Emerald · espalda")}${spr("/emerald", "back_shiny", "Emerald · espalda variocolor")}
      ${spr("/emerald", "icon", "Emerald · icono")}${spr("/emerald", "footprint", "Emerald · huella")}
    </div>
    <h3>En común</h3>
    ${dl(c.common)}
    <h3>Movimientos por nivel en común</h3>${ul(c.commonLevelMoves)}
    <div class="cols">
      <div><h3>MT/MO en común</h3>${ul(c.commonTm, "ninguna")}</div>
      <div><h3>Tutor en común</h3>${ul(c.commonTutor, "ninguno")}</div>
    </div>
    <div class="cols">
      <div>
        <h3 class="a">Solo FireRed</h3>
        ${c.onlyA.length ? dl(c.onlyA) : `<p class="none">Sin datos distintos.</p>`}
        <h4>Movimientos por nivel exclusivos</h4>${ul(c.levelMovesA)}
        <h4>MT/MO exclusivas</h4>${ul(c.tmA)}
        <h4>Tutor exclusivo</h4>${ul(c.tutorA)}
        <h4>Dónde aparece</h4>${locs(c.locA)}
      </div>
      <div>
        <h3 class="b">Solo Emerald</h3>
        ${c.onlyB.length ? dl(c.onlyB) : `<p class="none">Sin datos distintos.</p>`}
        <h4>Movimientos por nivel exclusivos</h4>${ul(c.levelMovesB)}
        <h4>MT/MO exclusivas</h4>${ul(c.tmB)}
        <h4>Tutor exclusivo</h4>${ul(c.tutorB)}
        <h4>Dónde aparece</h4>${locs(c.locB)}
      </div>
    </div>`;
  history.replaceState(null, "", `#${id}`);
}

function renderList(): void {
  const term = q.value.trim().toLowerCase();
  const shown = ids.filter((id) => {
    if (!term) return true;
    const nat = A.game.raw.species.species[id].national;
    return `${A.game.speciesName(id)} ${B.game.speciesName(id)} ${nat}`.toLowerCase().includes(term);
  });
  countEl.textContent = `${shown.length} de ${ids.length}`;
  listEl.innerHTML = shown
    .map((id) => `<div class="tile" data-id="${id}"><img loading="lazy" src="${sprite("/fr", "front", id)}" alt="" /><span>#${A.game.raw.species.species[id].national}</span><span>${esc(A.game.speciesName(id))}</span></div>`)
    .join("");
}

listEl.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>(".tile");
  if (t) show(Number(t.dataset.id));
});
q.addEventListener("input", renderList);

(async () => {
  [A, B] = await Promise.all([load("/fr"), load("/emerald")]);
  locA = locationsIndex(A);
  locB = locationsIndex(B);
  ids = speciesIds(A, B);
  renderList();
  const fromHash = Number(location.hash.slice(1));
  show(ids.includes(fromHash) ? fromHash : ids[0]!);
  (window as unknown as { frDex: unknown }).frDex = { ids, card: (id: number) => buildCard(A, B, id, locA, locB), selected: () => selected };
})().catch((e) => { detailEl.innerHTML = `<p class="none">Error: ${esc(String(e))}. ¿Están exportados public/fr y public/emerald?</p>`; });
