export {};
// Visor de mapas de Pokémon Crystal (crystal.html). Datos: public/crystal/ (tools/viewer/crystal_maps.py).
type Warp = { x: number; y: number; dest: string; destConst: string; warp: number };
type Bg = { x: number; y: number; kind: string; script: string };
type Obj = { x: number; y: number; sprite: string; move: string; pal?: string; type: string; script: string; flag: string };
type Coord = { x: number; y: number; scene: string; script: string };
type Conn = { direction: string; map: string; mapId: string; offset: number };
type CrystalMap = {
  name: string; w: number; h: number; tileset: string; environment: string; landmark: string; music: string; group: number;
  connections: Conn[]; warps: Warp[]; bgs: Bg[]; objects: Obj[]; coords: Coord[]; objLayer?: boolean;
  palette: string; default: string; times: string[]; objTimes: string[];
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const listEl = document.getElementById("list")!;
const detailEl = document.getElementById("detail")!;
const q = document.getElementById("q") as HTMLInputElement;
const countEl = document.getElementById("count")!;
let maps: CrystalMap[] = [];
let byName = new Map<string, CrystalMap>();
let current = "";
let zoom = 1;
let time = "day";
const TIME_LABEL: Record<string, string> = { morn: "Mañana", day: "Día", nite: "Noche", dark: "Oscuro" };
/** Variante de hora disponible para un mapa: la elegida si existe; si no, la fija del mapa. */
const timeOf = (m: CrystalMap) => (m.times.includes(time) ? time : m.default);
const mapImg = (m: CrystalMap) => { const t = timeOf(m); return `/crystal/maps/${m.name}${t === m.default ? "" : `_${t}`}.png`; };
const objImg = (m: CrystalMap) => { const t = timeOf(m); return `/crystal/maps/${m.name}_obj${t !== m.default && m.objTimes.includes(t) ? `_${t}` : ""}.png`; };
const layers = { sprites: true, warp: true, bg: true, obj: true, coord: false };

const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const link = (name: string) => (byName.has(name) ? `<a href="#${name}" data-map="${name}">${esc(name)}</a>` : esc(name));

function renderList(): void {
  const term = q.value.trim().toLowerCase();
  const shown = maps.filter((m) => !term || `${m.name} ${m.tileset} ${m.landmark}`.toLowerCase().includes(term));
  countEl.textContent = `${shown.length} de ${maps.length}`;
  const byLandmark = new Map<string, CrystalMap[]>();
  for (const m of shown) {
    const l = byLandmark.get(m.landmark) ?? [];
    l.push(m);
    byLandmark.set(m.landmark, l);
  }
  listEl.innerHTML = [...byLandmark.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([lm, ms]) => `<div class="grp">${esc(pretty(lm))}</div>${ms.map((m) => `<div class="row${m.name === current ? " sel" : ""}" data-map="${m.name}">${esc(m.name)}<small>${m.w}×${m.h}</small></div>`).join("")}`)
    .join("");
}

function markers(m: CrystalMap): string {
  const box = (x: number, y: number, cls: string, title: string, extra = "") =>
    `<div class="mk ${cls}" title="${esc(title)}" style="left:${x * 16 * zoom}px;top:${y * 16 * zoom}px;width:${16 * zoom}px;height:${16 * zoom}px" ${extra}></div>`;
  const out: string[] = [];
  if (layers.warp) m.warps.forEach((w) => out.push(box(w.x, w.y, "warp", `Warp → ${w.dest} #${w.warp}`, `data-dest="${w.dest}"`)));
  if (layers.bg) m.bgs.forEach((b) => out.push(box(b.x, b.y, "bg", `${b.kind} · ${b.script}`)));
  if (layers.obj) m.objects.forEach((o) => out.push(box(o.x, o.y, "obj", `${o.sprite} · ${o.script} · ${o.flag}`)));
  if (layers.coord) m.coords.forEach((c) => out.push(box(c.x, c.y, "coord", `Escena ${c.scene} · ${c.script}`)));
  return out.join("");
}

function show(name: string): void {
  const m = byName.get(name);
  if (!m) return;
  current = name;
  document.querySelectorAll(".row").forEach((r) => r.classList.toggle("sel", (r as HTMLElement).dataset.map === name));
  const conns = m.connections.length
    ? `<ul>${m.connections.map((c) => `<li>${esc(c.direction)} → ${link(c.map)} <span class="meta">(desplazamiento ${c.offset})</span></li>`).join("")}</ul>`
    : `<span class="none">sin conexiones</span>`;
  const row = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  detailEl.innerHTML = `
    <h2>${esc(m.name)}</h2>
    <div class="meta">${esc(pretty(m.landmark))} · tileset ${esc(m.tileset)} · ${esc(m.environment)} · música ${esc(pretty(m.music))} · grupo ${m.group} · ${m.w}×${m.h} bloques</div>
    <div class="bar">
      ${m.times.length > 1 ? `<label>Hora <select id="time">${["morn", "day", "nite"].map((t) => `<option value="${t}" ${t === timeOf(m) ? "selected" : ""}>${TIME_LABEL[t]}</option>`).join("")}</select></label>` : `<span class="meta">hora fija: ${TIME_LABEL[m.default]} (PALETTE_${m.palette})</span>`}
      <label>Zoom <select id="zoom">${[1, 2, 3].map((z) => `<option value="${z}" ${z === zoom ? "selected" : ""}>${z}×</option>`).join("")}</select></label>
      <label><input type="checkbox" data-layer="sprites" ${layers.sprites ? "checked" : ""} /> sprites de objetos</label>
      <label><input type="checkbox" data-layer="warp" ${layers.warp ? "checked" : ""} /> <span class="dot" style="border-color:#38bdf8"></span>warps (${m.warps.length})</label>
      <label><input type="checkbox" data-layer="bg" ${layers.bg ? "checked" : ""} /> <span class="dot" style="border-color:#facc15"></span>carteles y eventos (${m.bgs.length})</label>
      <label><input type="checkbox" data-layer="obj" ${layers.obj ? "checked" : ""} /> <span class="dot" style="border-color:#f87171"></span>objetos (${m.objects.length})</label>
      <label><input type="checkbox" data-layer="coord" ${layers.coord ? "checked" : ""} /> <span class="dot" style="border-color:#c084fc"></span>escenas (${m.coords.length})</label>
    </div>
    <div class="stage" id="stage"><img src="${mapImg(m)}" width="${m.w * 32 * zoom}" height="${m.h * 32 * zoom}" alt="${esc(m.name)}" />${layers.sprites && m.objLayer ? `<img class="spr" src="${objImg(m)}" width="${m.w * 32 * zoom}" height="${m.h * 32 * zoom}" alt="" />` : ""}<span id="mks">${markers(m)}</span></div>
    <h3>Conexiones</h3>${conns}
    <h3>Warps</h3>${m.warps.length ? `<table>${m.warps.map((w, i) => row([`#${i + 1}`, `(${w.x}, ${w.y})`, `→ ${link(w.dest)} #${w.warp}`])).join("")}</table>` : `<span class="none">ninguno</span>`}
    <h3>Carteles y eventos de fondo</h3>${m.bgs.length ? `<table>${m.bgs.map((b) => row([`(${b.x}, ${b.y})`, esc(b.kind), esc(b.script)])).join("")}</table>` : `<span class="none">ninguno</span>`}
    <h3>Objetos</h3>${m.objects.length ? `<table>${m.objects.map((o) => row([`(${o.x}, ${o.y})`, esc(o.sprite), esc(o.move), esc(o.type), esc(o.script), `<span class="meta">${esc(o.flag)}</span>`])).join("")}</table>` : `<span class="none">ninguno</span>`}
    <h3>Eventos por coordenada</h3>${m.coords.length ? `<table>${m.coords.map((c) => row([`(${c.x}, ${c.y})`, esc(c.scene), esc(c.script)])).join("")}</table>` : `<span class="none">ninguno</span>`}`;
  history.replaceState(null, "", `#${name}`);
}

document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const a = t.closest<HTMLElement>("[data-map]");
  if (a) {
    e.preventDefault();
    show(a.dataset.map!);
    return;
  }
  const w = t.closest<HTMLElement>(".mk.warp");
  if (w?.dataset.dest && byName.has(w.dataset.dest)) show(w.dataset.dest);
});
detailEl.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.id === "time") {
    time = t.value;
    show(current);
  } else if (t.id === "zoom") {
    zoom = Number(t.value);
    show(current);
  } else if (t instanceof HTMLInputElement && t.dataset.layer) {
    layers[t.dataset.layer as keyof typeof layers] = t.checked;
    show(current);
  }
});
q.addEventListener("input", renderList);

(async () => {
  const res = await fetch("/crystal/maps.json");
  if (!res.ok) throw new Error("falta public/crystal: npm run refs:fetch -- pokecrystal && npm run crystal:maps");
  maps = ((await res.json()) as { maps: CrystalMap[] }).maps.sort((a, b) => a.name.localeCompare(b.name));
  byName = new Map(maps.map((m) => [m.name, m]));
  renderList();
  const hash = location.hash.slice(1);
  show(byName.has(hash) ? hash : "NewBarkTown");
  window.addEventListener("hashchange", () => byName.has(location.hash.slice(1)) && show(location.hash.slice(1)));
  (window as unknown as { crystalMaps: unknown }).crystalMaps = { maps, show: (n: string) => show(n) };
})().catch((e) => {
  detailEl.innerHTML = `<p class="none">Error: ${esc(String(e))}</p>`;
});
