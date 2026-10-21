// Línea argumental (story.html): capítulos en orden oficial de rutas con las escenas (variables de progreso) de cada
// uno, a partir de public/viewer/story_<juego>.json (tools/viewer/story_index.py).
type Step = { value: string; scripts: { label: string; map: string }[]; requires: string[] };
type Scene = { var: string; maps: string[]; steps: Step[]; gates: { map: string; x: number; y: number; value: number; script: string | null }[]; checkedBy: string[] };
type Story = { chapters: { index: number; title: string; scenes: Scene[] }[]; unplaced: Scene[] };

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const out = document.getElementById("out")!;
const q = document.getElementById("q") as HTMLInputElement;
let game: "firered" | "emerald" = "firered";
const cache = new Map<string, Story>();
const folderToId = new Map<string, Map<string, string>>();

async function load(): Promise<Story> {
  let s = cache.get(game);
  if (!s) {
    s = (await (await fetch(`/viewer/story_${game}.json`)).json()) as Story;
    cache.set(game, s);
    const maps = (await (await fetch(`${game === "emerald" ? "/emerald" : "/fr"}/maps.json`)).json()) as { maps: Record<string, { name: string }> };
    folderToId.set(game, new Map(Object.entries(maps.maps).map(([id, m]) => [m.name, id])));
  }
  return s;
}

const idOf = (folder: string) => folderToId.get(game)?.get(folder) ?? "MAP_" + folder.toUpperCase();
const mapLink = (folder: string) => `<a href="/viewer.html${game === "emerald" ? "?game=emerald" : ""}#mapa=${encodeURIComponent(idOf(folder))}">${esc(folder)}</a>`;

function sceneHtml(s: Scene): string {
  const steps = s.steps.map((st) => {
    const scripts = st.scripts.map((x) => `${esc(x.label)} <span class="mut">(${mapLink(x.map)})</span>`).join("<br>");
    const gates = s.gates.filter((g) => String(g.value) === st.value).map((g) => `${mapLink(g.map)} (${g.x},${g.y})${g.script ? ` → ${esc(g.script)}` : ""}`);
    const req = st.requires.length ? `<div class="mut">checks: ${st.requires.map(esc).join(", ")}</div>` : "";
    return `<div class="step"><code>${esc(st.value)}</code> ← ${scripts}${gates.length ? `<div class="mut">waited for by: ${gates.join("; ")}</div>` : ""}${req}</div>`;
  }).join("");
  const waits = s.gates.filter((g) => !s.steps.some((st) => st.value === String(g.value)));
  const extra = waits.length ? `<div class="mut">Events that wait for other values: ${waits.map((g) => `${mapLink(g.map)} (${g.x},${g.y}) = ${g.value}`).join("; ")}</div>` : "";
  return `<div class="scene"><h4>${esc(s.var)}</h4><div class="mut">Maps: ${s.maps.map(mapLink).join(", ")}</div>${steps}${extra}</div>`;
}

async function render(): Promise<void> {
  const story = await load();
  const term = q.value.trim().toLowerCase();
  const match = (s: Scene) => !term || `${s.var} ${s.maps.join(" ")} ${s.steps.flatMap((t) => t.scripts.map((x) => x.label)).join(" ")}`.toLowerCase().includes(term);
  const parts: string[] = [];
  let shown = 0;
  for (const c of story.chapters) {
    const scenes = c.scenes.filter(match);
    if (!scenes.length) continue;
    shown += scenes.length;
    parts.push(`<details class="ch" ${term ? "open" : ""}><summary>${c.index + 1}. ${esc(c.title)}<small>${scenes.length} scene${scenes.length === 1 ? "" : "s"}</small></summary>${scenes.map(sceneHtml).join("")}</details>`);
  }
  const un = story.unplaced.filter(match);
  if (un.length) {
    shown += un.length;
    parts.push(`<details class="ch" ${term ? "open" : ""}><summary>Not placed on the route<small>${un.length} (link, cable, records and others)</small></summary>${un.map(sceneHtml).join("")}</details>`);
  }
  out.innerHTML = parts.join("") || `<p class="mut">No results.</p>`;
  (window as unknown as { frStory: unknown }).frStory = { game, chapters: story.chapters.filter((c) => c.scenes.length).length, scenes: shown };
}

for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-game]")) {
  b.addEventListener("click", () => {
    game = b.dataset.game as typeof game;
    document.querySelectorAll("button[data-game]").forEach((x) => x.classList.toggle("on", x === b));
    void render();
  });
}
q.addEventListener("input", () => void render());
void render().catch((e) => { out.innerHTML = `<p class="mut">Error: ${esc(String(e))}. Have you run tools/viewer/story_index.py?</p>`; });

export {};
