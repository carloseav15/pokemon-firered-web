// Biblioteca de quests (quests.html): flags, variables y misiones candidatas de FireRed y Emerald, a partir de
// public/viewer/quests_<juego>.json (tools/viewer/quest_index.py). La clasificación obligatoria/opcional es una
// sugerencia por nombre; las etiquetas manuales viven en tools/viewer/quest_tags.json.

type Script = { map: string; line: number; sets: string[]; clears: string[]; checks: string[]; varSets: [string, string][]; varChecks: string[]; items: string[]; mons: string[]; trainers: string[]; warps: string[]; calls: string[]; specials: string[] };
type FlagInfo = { kind: string; setBy: string[]; clearedBy: string[]; checkedBy: string[]; hides: { map: string; localId: number; graphics: string; script: string | null }[] };
type VarInfo = { setBy: [string, string][]; checkedBy: string[]; gates: { map: string; x: number; y: number; value: number; script: string | null }[] };
type Quest = { id: string; kind: string; start: string; map: string; maps: string[]; requiresFlags: string[]; requiresVars: string[]; effects: string[]; items: string[]; mons: string[]; trainers: string[]; warps: string[]; suggested: string; tagged: boolean; confidence?: string | null };
type Data = { scripts: Record<string, Script>; flags: Record<string, FlagInfo>; vars: Record<string, VarInfo>; quests: Quest[] };

// Keep source classification IDs and CSS classes; only their displayed names change.
const sourceLabels: Record<string, string> = {
  obligatoria: "required", opcional: "optional", evento: "event", desconocido: "unknown",
  media: "medium", baja: "low", alta: "high", "objeto-suelo": "ground item", entrenador: "trainer",
  medalla: "badge", regalo: "gift", combate: "battle",
  aparicion: "appearance", sistema: "system", visita: "visit", temporal: "temporary", otro: "other",
};
const displayLabel = (value: string) => sourceLabels[value] ?? value;

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const listEl = document.getElementById("list")!;
const detailEl = document.getElementById("detail")!;
const summaryEl = document.getElementById("summary")!;
const q = document.getElementById("q") as HTMLInputElement;
const kindSel = document.getElementById("kind") as HTMLSelectElement;
let game: "firered" | "emerald" = "firered";
let tab: "quests" | "flags" | "vars" = "quests";
let selected = "";
const cache = new Map<string, Data>();

async function data(): Promise<Data> {
  let d = cache.get(game);
  if (!d) {
    d = (await (await fetch(`/viewer/quests_${game}.json`)).json()) as Data;
    cache.set(game, d);
    if (!folderToId.has(game)) {
      const maps = (await (await fetch(`${game === "emerald" ? "/emerald" : "/fr"}/maps.json`)).json()) as { maps: Record<string, { name: string }> };
      folderToId.set(game, new Map(Object.entries(maps.maps).map(([id, m]) => [m.name, id])));
    }
  }
  return d;
}

const mapLink = (map: string) => `<a href="/viewer.html${game === "emerald" ? "?game=emerald" : ""}#mapa=${encodeURIComponent(mapIdOf(map))}">${esc(map)}</a>`;
// Los scripts guardan el nombre de carpeta del mapa (PalletTown); los mapas del visor usan MAP_PALLET_TOWN.
// Se resuelve con maps.json (nombre -> id) y, si no está, con una conversión por mayúsculas.
const folderToId = new Map<string, Map<string, string>>();
const mapIdOf = (folder: string) =>
  folderToId.get(game)?.get(folder) ?? "MAP_" + folder.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toUpperCase();

function flagLink(name: string): string {
  return `<a href="#" data-go="flags:${esc(name)}">${esc(name)}</a>`;
}
const ul = (items: string[], none = "—") => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : `<span class="none">${none}</span>`);
const scriptRef = (d: Data, label: string) => {
  const s = d.scripts[label];
  return s ? `${esc(label)} <span class="chip">${mapLink(s.map)}</span>` : esc(label);
};

function detailQuest(d: Data, qu: Quest): string {
  const s = d.scripts[qu.start];
  return `<h2>${esc(qu.id)}</h2>
    <span class="chip ${qu.suggested}">${displayLabel(qu.suggested)}${qu.tagged ? ` · tagged (confidence ${displayLabel(qu.confidence ?? "—")})` : " · no tag (name-based suggestion)"}</span> <span class="chip">${displayLabel(qu.kind)}</span>
    <h3>Where it starts</h3>${ul([`${scriptRef(d, qu.start)}${s ? ` · line ${s.line}` : ""}`])}
    <h3>Related maps</h3>${ul(qu.maps.map(mapLink))}
    <h3>Requirements (flags checked by the script)</h3>${ul(qu.requiresFlags.map(flagLink), "none detected")}
    <h3>Requirements (variables)</h3>${ul(qu.requiresVars.map((v) => `<a href="#" data-go="vars:${esc(v)}">${esc(v)}</a>`), "none detected")}
    <h3>Effects (flags set or cleared by the same script)</h3>${ul(qu.effects.map(flagLink), "none")}
    <h3>Rewards</h3>${ul([...qu.items, ...qu.mons].map(esc), "none detected")}
    <h3>Trainers</h3>${ul(qu.trainers.map(esc), "none")}
    <h3>Script warps</h3>${ul(qu.warps.map(esc), "none")}
    <h3>All scripts that activate it</h3>${ul((d.flags[qu.id]?.setBy ?? []).map((l) => scriptRef(d, l)))}`;
}

function detailFlag(d: Data, name: string): string {
  const f = d.flags[name];
  if (!f) return `<p class="none">No information for ${esc(name)}.</p>`;
  const hid = f.hides.map((h) => `${mapLink(h.map)} · #${h.localId} ${esc(h.graphics.replace("OBJ_EVENT_GFX_", ""))}${h.script ? ` · ${esc(h.script)}` : ""}`);
  return `<h2>${esc(name)}</h2><span class="chip">${displayLabel(f.kind)}</span>
    <h3>Set by (setflag)</h3>${ul(f.setBy.map((l) => scriptRef(d, l)), "no script")}
    <h3>Cleared by (clearflag)</h3>${ul(f.clearedBy.map((l) => scriptRef(d, l)), "no script")}
    <h3>Checked by</h3>${ul(f.checkedBy.map((l) => scriptRef(d, l)), "no script")}
    <h3>Map items that depend on it (appear or disappear)</h3>${ul(hid, "none")}`;
}

function detailVar(d: Data, name: string): string {
  const v = d.vars[name];
  if (!v) return `<p class="none">No information for ${esc(name)}.</p>`;
  const sets = v.setBy.map(([l, val]) => `${esc(val)} ← ${scriptRef(d, l)}`);
  const gates = v.gates.map((g) => `${mapLink(g.map)} (${g.x},${g.y}) with value ${g.value}${g.script ? ` → ${esc(g.script)}` : ""}`);
  return `<h2>${esc(name)}</h2>
    <h3>Assigned values</h3>${ul(sets, "no setvar")}
    <h3>Checked by</h3>${ul(v.checkedBy.map((l) => scriptRef(d, l)), "no script")}
    <h3>Coordinate events that wait for a value</h3>${ul(gates, "none")}`;
}

async function render(): Promise<void> {
  const d = await data();
  const term = q.value.trim().toLowerCase();
  const kind = kindSel.value;
  let rows: { id: string; right: string; chip?: string }[] = [];
  if (tab === "quests") {
    rows = d.quests.filter((x) => (!kind || x.kind === kind || x.suggested === kind) && (!term || `${x.id} ${x.map} ${x.start} ${x.items.join(" ")} ${x.trainers.join(" ")}`.toLowerCase().includes(term)))
      .map((x) => ({ id: x.id, right: x.map, chip: x.suggested }));
  } else if (tab === "flags") {
    rows = Object.entries(d.flags).filter(([n, f]) => (!kind || f.kind === kind) && (!term || n.toLowerCase().includes(term)))
      .map(([n, f]) => ({ id: n, right: `${displayLabel(f.kind)} · ${f.setBy.length} sets · ${f.checkedBy.length} checks` }));
  } else {
    rows = Object.entries(d.vars).filter(([n]) => !term || n.toLowerCase().includes(term))
      .map(([n, v]) => ({ id: n, right: `${v.setBy.length} assignments · ${v.gates.length} events` }));
  }
  summaryEl.textContent = `${{ quests: "Quests", flags: "Flags", vars: "Variables" }[tab]} of ${game === "emerald" ? "Emerald" : "FireRed"}: ${rows.length}`
    + (tab === "quests" ? ` (${d.quests.length} candidates; classification = name-based suggestion)` : "");
  listEl.innerHTML = rows.map((r) => `<div class="row${r.id === selected ? " sel" : ""}" data-id="${esc(r.id)}">${r.chip ? `<span class="chip ${r.chip}">${displayLabel(r.chip)}</span>` : ""}<span>${esc(r.id)}</span><small>${esc(r.right)}</small></div>`).join("");
  (window as unknown as { frQuests: unknown }).frQuests = { game, tab, shown: rows.length, total: tab === "quests" ? d.quests.length : tab === "flags" ? Object.keys(d.flags).length : Object.keys(d.vars).length };
}

async function show(id: string): Promise<void> {
  selected = id;
  const d = await data();
  detailEl.innerHTML = tab === "quests" ? detailQuest(d, d.quests.find((x) => x.id === id)!) : tab === "flags" ? detailFlag(d, id) : detailVar(d, id);
  listEl.querySelectorAll(".row").forEach((r) => r.classList.toggle("sel", (r as HTMLElement).dataset.id === id));
}

listEl.addEventListener("click", (e) => {
  const r = (e.target as HTMLElement).closest<HTMLElement>(".row");
  if (r) void show(r.dataset.id!);
});
detailEl.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-go]");
  if (!a) return;
  e.preventDefault();
  const [t, id] = a.dataset.go!.split(":", 2) as ["flags" | "vars", string];
  tab = t;
  document.querySelectorAll("button[data-tab]").forEach((b) => b.classList.toggle("on", (b as HTMLElement).dataset.tab === t));
  void render().then(() => show(id));
});
for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-tab]")) {
  b.addEventListener("click", () => {
    tab = b.dataset.tab as typeof tab;
    document.querySelectorAll("button[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
    selected = "";
    detailEl.innerHTML = `<p class="none">Select an entry.</p>`;
    void render();
  });
}
for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-game]")) {
  b.addEventListener("click", () => {
    game = b.dataset.game as typeof game;
    document.querySelectorAll("button[data-game]").forEach((x) => x.classList.toggle("on", x === b));
    selected = "";
    detailEl.innerHTML = `<p class="none">Select an entry.</p>`;
    void render();
  });
}
for (const k of ["obligatoria", "opcional", "sidequest", "postgame", "evento", "desconocido", "badge", "regalo", "combate", "aparicion", "sistema", "visita", "temporal", "objeto-suelo", "entrenador", "otro"]) {
  const o = document.createElement("option");
  o.value = k;
  o.textContent = displayLabel(k);
  kindSel.appendChild(o);
}
q.addEventListener("input", () => void render());
kindSel.addEventListener("change", () => void render());
void render().catch((e) => { summaryEl.textContent = `Error: ${String(e)}. Have you run tools/viewer/quest_index.py?`; });

export {};
