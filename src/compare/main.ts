// Comparador FireRed / Emerald: especies, movimientos, objetos y entrenadores desde los datos exportados
// (public/fr, public/emerald). Solo lectura; la lógica está en ./diff.ts.
import { compareItems, compareMoves, compareSpecies, prepare, trainerList, trainerOverlap } from "./diff";
import type { GameData, Raw, Row, TrainerView } from "./diff";

async function load(root: string): Promise<GameData> {
  const j = async (p: string) => (await fetch(`${root}/${p}`)).json();
  const [species, moves, items, trainers, constants, charmap] = await Promise.all([
    j("data/species.json"), j("data/moves.json"), j("data/items.json"), j("data/trainers.json"), j("constants.json"), j("charmap.json"),
  ]);
  return prepare({ species, moves, items, trainers, constants, charmap } as Raw);
}

const out = document.getElementById("out")!;
const summary = document.getElementById("summary")!;
const q = document.getElementById("q") as HTMLInputElement;
const onlyDiff = document.getElementById("onlyDiff") as HTMLInputElement;
let tab = "species";
let A: GameData;
let B: GameData;
const cache = new Map<string, Row[]>();

function rowsFor(t: string): Row[] {
  let r = cache.get(t);
  if (!r) {
    r = t === "species" ? compareSpecies(A, B) : t === "moves" ? compareMoves(A, B) : compareItems(A, B);
    cache.set(t, r);
  }
  return r;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

function renderRows(rows: Row[], label: string): void {
  const term = q.value.trim().toLowerCase();
  const diffCount = rows.filter((r) => r.diffs.length > 0 || r.onlyIn).length;
  let shown = rows.filter((r) => !onlyDiff.checked || r.diffs.length > 0 || r.onlyIn);
  if (term) shown = shown.filter((r) => `${r.nameA ?? ""} ${r.nameB ?? ""} ${r.key}`.toLowerCase().includes(term));
  summary.textContent = `${label}: ${rows.length} comparados, ${diffCount} con diferencias; mostrando ${shown.length}.`;
  const body = shown.map((r) => {
    const name = r.nameA === r.nameB || r.nameB === null ? esc(r.nameA ?? "") : r.nameA === null ? esc(r.nameB) : `${esc(r.nameA)} <span class="b">/ ${esc(r.nameB)}</span>`;
    const detail = r.onlyIn
      ? `<span class="only">solo en ${r.onlyIn === "A" ? "FireRed" : "Emerald"}</span>`
      : r.diffs.length === 0
        ? `<span class="only">sin diferencias</span>`
        : r.diffs.map((d) => `<span class="chip"><em>${esc(d.field)}:</em> <span class="a">${esc(d.a)}</span> → <span class="b">${esc(d.b)}</span></span>`).join("");
    return `<tr><td class="id">${esc(r.key.replace(/^ITEM_/, ""))}</td><td>${name}</td><td>${detail}</td></tr>`;
  }).join("");
  out.innerHTML = `<table><thead><tr><th>Id</th><th>Nombre</th><th>Diferencias</th></tr></thead><tbody>${body}</tbody></table>`;
}

function renderTrainers(): void {
  const la = trainerList(A);
  const lb = trainerList(B);
  const term = q.value.trim().toLowerCase();
  const filt = (l: TrainerView[]) => (term ? l.filter((t) => `${t.cls} ${t.name} ${t.party}`.toLowerCase().includes(term)) : l);
  const overlap = trainerOverlap(la, lb);
  summary.textContent = `Entrenadores: FireRed ${la.length}, Emerald ${lb.length}; ${overlap.length} comparten clase y nombre. Los ids no coinciden entre juegos.`;
  const table = (l: TrainerView[], cls: string) =>
    `<table><thead><tr><th>Id</th><th class="${cls}">Clase / nombre</th><th>Equipo</th></tr></thead><tbody>${l
      .map((t) => `<tr><td class="id">${t.id}</td><td>${esc(t.cls)} <strong>${esc(t.name)}</strong>${t.double ? " (doble)" : ""}</td><td>${esc(t.party)}</td></tr>`)
      .join("")}</tbody></table>`;
  const ov = overlap.length
    ? `<h3>Misma clase y nombre en ambos juegos (${overlap.length})</h3><table><thead><tr><th>Clase / nombre</th><th class="a">FireRed</th><th class="b">Emerald</th></tr></thead><tbody>${overlap
        .map((o) => `<tr><td>${esc(o.cls)} <strong>${esc(o.name)}</strong></td><td>${esc(o.a.party)}</td><td>${esc(o.b.party)}</td></tr>`)
        .join("")}</tbody></table>`
    : "";
  out.innerHTML = `${ov}<div class="trainers"><div><h3 class="a">FireRed</h3>${table(filt(la), "a")}</div><div><h3 class="b">Emerald</h3>${table(filt(lb), "b")}</div></div>`;
}

function render(): void {
  if (!A || !B) return;
  if (tab === "trainers") renderTrainers();
  else renderRows(rowsFor(tab), { species: "Pokémon", moves: "Movimientos", items: "Objetos" }[tab]!);
  (window as unknown as { frCompare: unknown }).frCompare = {
    tab, species: rowsFor("species"), moves: rowsFor("moves"), items: rowsFor("items"),
  };
}

for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-tab]")) {
  b.addEventListener("click", () => {
    tab = b.dataset.tab!;
    document.querySelectorAll("button[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
    render();
  });
}
q.addEventListener("input", render);
onlyDiff.addEventListener("change", render);

(async () => {
  [A, B] = await Promise.all([load("/fr"), load("/emerald")]);
  render();
})().catch((e) => { summary.textContent = `Error: ${String(e)}. ¿Están exportados public/fr y public/emerald?`; });
