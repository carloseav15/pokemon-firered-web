// Biblioteca visual (library.html): entrenadores con su retrato y equipo, objetos con su icono y los gráficos de
// objetos de mapa (NPC, cartas de objeto, árboles…) de FireRed y Emerald. Solo lectura de public/<juego>.
import { prepare } from "./diff";
import type { GameData, Raw } from "./diff";

type Loaded = { root: string; game: GameData; objects: Record<string, { name: string; width: number; height: number; frames: [string, number][] }> };

async function load(root: string): Promise<Loaded> {
  const j = async (p: string) => (await fetch(`${root}/${p}`)).json();
  const [species, moves, items, trainers, constants, charmap, objs] = await Promise.all([
    j("data/species.json"), j("data/moves.json"), j("data/items.json"), j("data/trainers.json"), j("constants.json"), j("charmap.json"), j("objects.json"),
  ]);
  return { root, game: prepare({ species, moves, items, trainers, constants, charmap } as Raw), objects: objs.gfx };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const out = document.getElementById("out")!;
const summary = document.getElementById("summary")!;
const q = document.getElementById("q") as HTMLInputElement;
let tab = "trainers";
let root = "/fr";
const data = new Map<string, Loaded>();

function trainers(L: Loaded, term: string): string[] {
  const g = L.game;
  const list = (g.raw.trainers as any[]).map((t, id) => ({ t, id }));
  const cards: string[] = [];
  for (const { t, id } of list) {
    const name = g.decode(t.name);
    const cls = g.trainerClass(t.class);
    if (!name && !t.party.length) continue;
    if (term && !`${cls} ${name} ${t.party.map((p: any) => g.speciesName(p.species)).join(" ")}`.toLowerCase().includes(term)) continue;
    const party = (t.party as any[])
      .map((p) => `<div class="mon" title="${esc(g.speciesName(p.species))} Lv${p.level}"><div class="ic" style="background-image:url(${L.root}/gfx/pokemon/icon/${p.species}.png)"></div>Nv${p.level}</div>`)
      .join("");
    cards.push(`<div class="card"><div class="pic"><img loading="lazy" src="${L.root}/gfx/trainers/front/${t.pic}.png" alt="" onerror="this.style.display='none'" /></div>
      <h4>${esc(cls)} ${esc(name)}</h4><small>#${id}${t.double ? " · double" : ""} · AI ${t.ai}</small><div class="party">${party}</div></div>`);
  }
  return cards;
}

function items(L: Loaded, term: string): string[] {
  const g = L.game;
  const cards: string[] = [];
  for (const it of g.raw.items.items as any[]) {
    if (/^ITEM_[0-9A-F]{3}$/.test(it.const) || it.const === "ITEM_NONE") continue;
    const name = g.decode(it.name);
    const desc = g.decode(it.description);
    if (term && !`${name} ${it.const} ${desc}`.toLowerCase().includes(term)) continue;
    cards.push(`<div class="card item"><img class="ic" loading="lazy" src="${L.root}/gfx/items/${it.id}.png" alt="" onerror="this.style.visibility='hidden'" />
      <div><h4>${esc(name)}</h4><small>${esc(it.const)} · ¥${it.price}</small><div>${esc(desc)}</div></div></div>`);
  }
  return cards;
}

function npcs(L: Loaded, term: string): string[] {
  const cards: string[] = [];
  for (const g of Object.values(L.objects)) {
    if (g.frames.length === 0) continue;
    if (term && !g.name.toLowerCase().includes(term)) continue;
    const [file, frame] = g.frames[0]!;
    const zoom = g.height > 32 ? 1.5 : 3;
    cards.push(`<div class="card"><div class="npc"><div style="width:${g.width * zoom}px;height:${g.height * zoom}px;background-image:url(${L.root}/${file});background-size:auto 100%;background-position:-${frame * g.width * zoom}px 0"></div></div>
      <h4>${esc(g.name.replace("OBJ_EVENT_GFX_", ""))}</h4><small>${g.width}×${g.height} · ${g.frames.length} frames</small></div>`);
  }
  return cards;
}

function render(): void {
  const L = data.get(root);
  if (!L) return;
  const term = q.value.trim().toLowerCase();
  const cards = tab === "trainers" ? trainers(L, term) : tab === "items" ? items(L, term) : npcs(L, term);
  const label = { trainers: "Trainers", items: "Items", npcs: "Map object graphics" }[tab]!;
  summary.textContent = `${label} of ${root === "/fr" ? "FireRed" : "Emerald"}: ${cards.length}.`;
  out.innerHTML = cards.join("");
  (window as unknown as { frLibrary: unknown }).frLibrary = { tab, root, shown: cards.length };
}

for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-tab]")) {
  b.addEventListener("click", () => {
    tab = b.dataset.tab!;
    document.querySelectorAll("button[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
    render();
  });
}
for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-game]")) {
  b.addEventListener("click", () => {
    root = b.dataset.game!;
    document.querySelectorAll("button[data-game]").forEach((x) => x.classList.toggle("on", x === b));
    render();
  });
}
q.addEventListener("input", render);

(async () => {
  for (const r of ["/fr", "/emerald"]) data.set(r, await load(r));
  render();
})().catch((e) => { summary.textContent = `Error: ${String(e)}. Have public/fr and public/emerald been exported?`; });
