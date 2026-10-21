// Página de la Pokédex comparada (dex.html). Datos: public/fr y public/emerald; sprites de cada juego.
import { prepare } from "./diff";
import type { Raw } from "./diff";
import { buildCard, locationsIndex, speciesIds } from "./dex";
import type { Card, DexSource, Location } from "./dex";
import { activateSpriteSections, loadSpriteIndex, otherSourcesHtml, thumbOf } from "./dexSprites";
import type { SpriteIndex } from "./dexSprites";

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
let spriteIndex: SpriteIndex | null = null;
/** Especies nacionales sin datos de juego (más allá de FireRed/Emerald): solo sprites de otras fuentes. */
let extras: number[] = [];
const prettyName = (n: number) => (spriteIndex?.names?.[String(n)] ?? `#${n}`).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

type SpriteKind = "front" | "front_shiny" | "back" | "back_shiny" | "icon" | "footprint" | "front_anim";
const sprite = (root: string, kind: SpriteKind, id: number) => `${root}/gfx/pokemon/${kind}/${id}.png`;

function ul(items: string[], empty = "—"): string {
  return items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<span class="none">${empty}</span>`;
}

function locs(l: Location[]): string {
  if (!l.length) return `<span class="none">no wild encounters in this game</span>`;
  const rows = l
    .slice()
    .sort((x, y) => x.map.localeCompare(y.map))
    .map((x) => `${x.map} · ${x.kind} · Lv${x.min === x.max ? x.min : `${x.min}-${x.max}`} · ${x.chance}%`);
  return ul(rows);
}

function dl(items: { label: string; value: string }[]): string {
  return `<dl>${items.map((i) => `<dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd>`).join("")}</dl>`;
}

function showExtra(nat: number): void {
  selected = -nat;
  document.querySelectorAll(".tile").forEach((t) => t.classList.toggle("sel", (t as HTMLElement).dataset.extra === String(nat)));
  detailEl.innerHTML = `<h2>#${String(nat).padStart(3, "0")} ${esc(prettyName(nat))}</h2>
    <p class="none">No FireRed or Emerald data; sprites from other sources only.</p>
    <h3>Sprites from other games</h3><div id="others"></div>`;
  history.replaceState(null, "", `#n${nat}`);
  const others = document.getElementById("others")!;
  others.innerHTML = otherSourcesHtml(spriteIndex, nat);
  activateSpriteSections(others);
}

// ---- Animaciones de movimientos (motor FireRed incrustado: /?fr=anims, ver src/games/firered/animHarness.ts) ----
type FrAnim = { ready: Promise<void>; play(move: number): Promise<void>; status(): { ready: boolean; playing: boolean; error: string | null } };
const DEFAULT_TARGET = 16; // PIDGEY en FireRed

function animPanelHtml(id: number): string {
  const sp = A.game.raw.species.species[id];
  const own = (sp.learnset as number[][]).map(([lv, m]) => ({ lv: lv!, m: m! }));
  const seen = new Set<number>();
  const learn = own.filter((x) => (seen.has(x.m) ? false : (seen.add(x.m), true)));
  const allMoves = (A.game.raw.moves.moves as unknown[]).map((_m, i) => i).filter((i) => i > 0 && !seen.has(i));
  const opt = (m: number, lv?: number) => `<option value="${m}">${lv !== undefined ? `Nv${lv} · ` : ""}${esc(A.game.moveName(m))}</option>`;
  const targets = ids.map((i) => `<option value="${i}" ${i === DEFAULT_TARGET ? "selected" : ""}>${esc(A.game.speciesName(i))}</option>`).join("");
  return `<h3>Move animations (FireRed engine)</h3>
    <div class="animPanel" data-species="${id}">
      <div class="animBar">
        <button class="animOpen" type="button">Open game window</button>
        <span class="none animMsg">Load the FireRed engine in a window; FireRed species only.</span>
      </div>
      <div class="animBody" hidden>
        <div class="animCtl">
          <label>Move <select class="animMove"><optgroup label="Learned by level">${learn.map((x) => opt(x.m, x.lv)).join("")}</optgroup>
            <optgroup label="Other moves">${allMoves.map((m) => opt(m)).join("")}</optgroup></select></label>
          <button class="animPlay" type="button">Play</button>
          <label>Opponent <select class="animTarget">${targets}</select></label>
        </div>
        <iframe class="animFrame" title="FireRed engine" width="480" height="320" loading="lazy"></iframe>
      </div>
    </div>`;
}

let animToken = 0;
function bindAnimPanel(root: HTMLElement): void {
  const panel = root.querySelector<HTMLElement>(".animPanel");
  if (!panel) return;
  const species = Number(panel.dataset.species);
  const q = <T extends Element>(c: string) => panel.querySelector<T>(c)!;
  const msg = q<HTMLElement>(".animMsg");
  const frame = q<HTMLIFrameElement>(".animFrame");
  const move = q<HTMLSelectElement>(".animMove");
  const target = q<HTMLSelectElement>(".animTarget");
  const playBtn = q<HTMLButtonElement>(".animPlay");
  let api: FrAnim | null = null;
  let loading = false;
  const load = async (): Promise<void> => {
    const token = ++animToken;
    loading = true;
    api = null;
    playBtn.disabled = true;
    msg.textContent = "Loading game engine…";
    frame.src = `/play.html?fr=anims&a=${species}&t=${target.value}`;
    await new Promise<void>((res) => frame.addEventListener("load", () => res(), { once: true }));
    const win = frame.contentWindow as (Window & { frAnim?: FrAnim }) | null;
    for (let i = 0; i < 400 && !win?.frAnim; i++) await new Promise((r) => setTimeout(r, 50));
    if (token !== animToken) return;
    try {
      await win!.frAnim!.ready;
      api = win!.frAnim!;
      msg.textContent = "Ready. Choose a move and press Play.";
      playBtn.disabled = false;
    } catch (e) {
      msg.textContent = `Unable to set up the battle: ${String(e)}`;
    }
    loading = false;
  };
  const play = async (): Promise<void> => {
    if (!api) return;
    playBtn.disabled = true;
    try {
      await api.play(Number(move.value));
    } catch (e) {
      msg.textContent = `Error: ${String(e)}`;
    }
    playBtn.disabled = false;
  };
  q<HTMLButtonElement>(".animOpen").addEventListener("click", () => {
    q<HTMLElement>(".animBody").hidden = false;
    q<HTMLButtonElement>(".animOpen").hidden = true;
    void load();
  });
  playBtn.addEventListener("click", () => void play());
  move.addEventListener("change", () => void play());
  target.addEventListener("change", () => {
    if (!loading) void load();
  });
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
      ${spr("/fr", "front", "FireRed")}${spr("/fr", "front_shiny", "FireRed · shiny")}
      ${spr("/fr", "back", "FireRed · back")}${spr("/fr", "back_shiny", "FireRed · back shiny")}
      ${spr("/fr", "icon", "FireRed · icono")}${spr("/fr", "footprint", "FireRed · huella")}
    </div>
    <div class="sprites">
      ${spr("/emerald", "front", "Emerald")}${spr("/emerald", "front_shiny", "Emerald · shiny")}
      ${spr("/emerald", "front_anim", "Emerald · animation")}
      ${spr("/emerald", "back", "Emerald · back")}${spr("/emerald", "back_shiny", "Emerald · back shiny")}
      ${spr("/emerald", "icon", "Emerald · icono")}${spr("/emerald", "footprint", "Emerald · huella")}
    </div>
    <h3>Sprites from other games</h3>
    <div id="others"><p class="none">Loading…</p></div>
    ${animPanelHtml(id)}
    <h3>Shared</h3>
    ${dl(c.common)}
    <h3>Level-up moves shared</h3>${ul(c.commonLevelMoves)}
    <div class="cols">
      <div><h3>TM/HM shared</h3>${ul(c.commonTm, "none")}</div>
      <div><h3>Tutor shared</h3>${ul(c.commonTutor, "none")}</div>
    </div>
    <div class="cols">
      <div>
        <h3 class="a">FireRed only</h3>
        ${c.onlyA.length ? dl(c.onlyA) : `<p class="none">No different data.</p>`}
        <h4>Game-specific level-up moves</h4>${ul(c.levelMovesA)}
        <h4>Game-specific TM/HM</h4>${ul(c.tmA)}
        <h4>Game-specific tutor</h4>${ul(c.tutorA)}
        <h4>Where to find it</h4>${locs(c.locA)}
      </div>
      <div>
        <h3 class="b">Emerald only</h3>
        ${c.onlyB.length ? dl(c.onlyB) : `<p class="none">No different data.</p>`}
        <h4>Game-specific level-up moves</h4>${ul(c.levelMovesB)}
        <h4>Game-specific TM/HM</h4>${ul(c.tmB)}
        <h4>Game-specific tutor</h4>${ul(c.tutorB)}
        <h4>Where to find it</h4>${locs(c.locB)}
      </div>
    </div>`;
  history.replaceState(null, "", `#${id}`);
  animToken++; // cancela una carga pendiente de otra ficha
  bindAnimPanel(detailEl);
  const others = document.getElementById("others")!;
  loadSpriteIndex().then((index) => {
    if (selected !== id) return;
    others.innerHTML = otherSourcesHtml(index, c.national);
    activateSpriteSections(others);
  });
}

function renderList(): void {
  const term = q.value.trim().toLowerCase();
  const shown = ids.filter((id) => {
    if (!term) return true;
    const nat = A.game.raw.species.species[id].national;
    return `${A.game.speciesName(id)} ${B.game.speciesName(id)} ${nat}`.toLowerCase().includes(term);
  });
  countEl.textContent = `${shown.length} of ${ids.length}`;
  const ex = extras.filter((n) => !term || `${prettyName(n)} ${n}`.toLowerCase().includes(term));
  const exTiles = ex
    .map((n) => {
      const t = spriteIndex ? thumbOf(spriteIndex, n) : null;
      const size = !t ? "" : t.n > 1 ? (t.axis === "y" ? `56px ${56 * t.n}px` : `${56 * t.n}px 56px`) : "56px 56px";
      const bg = t ? `style="background:url(${t.url}) 0 0/${size} no-repeat"` : "";
      return `<div class="tile" data-extra="${n}"><div class="thumb" ${bg}></div><span>#${n}</span><span>${esc(prettyName(n))}</span></div>`;
    })
    .join("");
  countEl.textContent = `${shown.length + ex.length} of ${ids.length + extras.length}`;
  listEl.innerHTML = shown
    .map((id) => `<div class="tile" data-id="${id}"><img loading="lazy" src="${sprite("/fr", "front", id)}" alt="" /><span>#${A.game.raw.species.species[id].national}</span><span>${esc(A.game.speciesName(id))}</span></div>`)
    .join("") + exTiles;
}

listEl.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>(".tile");
  if (!t) return;
  if (t.dataset.extra) showExtra(Number(t.dataset.extra));
  else show(Number(t.dataset.id));
});
q.addEventListener("input", renderList);

(async () => {
  [A, B] = await Promise.all([load("/fr"), load("/emerald")]);
  locA = locationsIndex(A);
  locB = locationsIndex(B);
  ids = speciesIds(A, B);
  spriteIndex = await loadSpriteIndex();
  const covered = new Set(ids.map((i) => A.game.raw.species.species[i].national as number));
  extras = spriteIndex ? Object.keys(spriteIndex.species).map(Number).filter((n) => !covered.has(n)).sort((a, b) => a - b) : [];
  renderList();
  const hash = location.hash.slice(1);
  if (hash.startsWith("n") && extras.includes(Number(hash.slice(1)))) showExtra(Number(hash.slice(1)));
  else {
    const fromHash = Number(hash);
    show(ids.includes(fromHash) ? fromHash : ids[0]!);
  }
  (window as unknown as { frDex: unknown }).frDex = { ids, card: (id: number) => buildCard(A, B, id, locA, locB), selected: () => selected };
})().catch((e) => { detailEl.innerHTML = `<p class="none">Error: ${esc(String(e))}. Have public/fr and public/emerald been exported?</p>`; });
