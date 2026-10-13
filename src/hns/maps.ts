export {};
// Independent static map catalog. Data generated from the pinned HnS source; no game scripts execute.
type Event = { x: number; y: number; dest_map?: string; dest_warp_id?: string; script?: string; graphics_id?: string; movement_type?: string; flag?: string; var?: string; var_value?: string; type?: string };
type Connection = { map: string; direction: string; offset: number };
type MapData = { id: string; name: string; w: number; h: number; image: string | null; unavailable?: string; layout: string; primary: string; secondary: string; type: string; section: string; music: string; connections: Connection[]; warps: Event[]; objects: Event[]; bgs: Event[]; coords: Event[] };
type Rect = { id: string; x: number; y: number; w: number; h: number };
type Chunk = { x: number; y: number; w: number; h: number; file: string };
type Catalog = { _meta: { commit: string; limitations: string[] }; maps: Record<string, MapData>; world: { w: number; h: number; maps: Rect[]; chunks: Chunk[]; conflicts: unknown[]; unavailable: string[]; overview: string } };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = $<HTMLDivElement>("viewport");
const stage = $<HTMLDivElement>("stage");
const sizer = $<HTMLDivElement>("sizer");
const meta = $("meta");
const detail = $("detail");
const list = $("list");
const search = $<HTMLInputElement>("search");
const filter = $<HTMLSelectElement>("filter");
const zoom = $<HTMLSelectElement>("zoom");
const events = $<HTMLInputElement>("events");
const back = $<HTMLButtonElement>("back");
let catalog: Catalog;
let current = "world";
const historyStack: string[] = [];
const chunkImages = new Map<string, HTMLImageElement>();
let updatePending = false;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const label = (m: MapData) => m.name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ");
const link = (id: string, text?: string) => catalog.maps[id] ? `<a href="#${encodeURIComponent(id)}">${esc(text ?? label(catalog.maps[id]))}</a>` : `<span>${esc(id)} (destino dinámico o ausente)</span>`;

function renderList(): void {
  const q = search.value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const connected = new Set(catalog.world.maps.map(m => m.id));
  const maps = Object.values(catalog.maps).filter(m =>
    (filter.value !== "rendered" || m.image) && (filter.value !== "world" || connected.has(m.id)) &&
    `${m.name}${m.id}${m.primary}${m.secondary}`.toLowerCase().replace(/[^a-z0-9]/g, "").includes(q));
  maps.sort((a, b) => a.name.localeCompare(b.name));
  $("count").textContent = `${maps.length} resultados · ${Object.values(catalog.maps).filter(m => m.image).length} renderizados / ${Object.keys(catalog.maps).length} en la fuente`;
  list.innerHTML = maps.map(m => `<a class="map${current === m.id ? " selected" : ""}" href="#${encodeURIComponent(m.id)}">${esc(label(m))}<small>${m.w}×${m.h} · ${m.image ? m.type.replace("MAP_TYPE_", "") : "Sin render: datos incompatibles"}</small></a>`).join("");
}

function resize(): void {
  const z = Number(zoom.value);
  stage.dataset.zoom = String(z);
  const m = catalog.maps[current];
  const w = current === "world" ? catalog.world.w : m.w * 16;
  const h = current === "world" ? catalog.world.h : m.h * 16;
  sizer.style.width = `${w * z}px`; sizer.style.height = `${h * z}px`;
  stage.style.width = `${w}px`; stage.style.height = `${h}px`; stage.style.transform = `scale(${z})`;
  if (current === "world") updateWorldImages();
}

function updateWorldImages(): void {
  if (current !== "world") return;
  const z = Number(zoom.value);
  const lowDetail = z < 0.5;
  const wanted = lowDetail ? [{ file: catalog.world.overview, x: 0, y: 0, w: catalog.world.w, h: catalog.world.h }] : catalog.world.chunks.filter(c => {
    const margin = 256 / z;
    const x = viewport.scrollLeft / z, y = viewport.scrollTop / z;
    return c.x < x + viewport.clientWidth / z + margin && c.y < y + viewport.clientHeight / z + margin && c.x + c.w > x - margin && c.y + c.h > y - margin;
  });
  const keys = new Set(wanted.map(c => c.file));
  for (const [key, image] of chunkImages) if (!keys.has(key)) { image.remove(); chunkImages.delete(key); }
  for (const c of wanted) {
    if (chunkImages.has(c.file)) continue;
    const img = document.createElement("img");
    img.alt = ""; img.src = `/hns/${c.file}`; img.decoding = "async";
    Object.assign(img.style, { left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px` });
    img.addEventListener("error", () => { meta.textContent = `No se pudo cargar ${c.file}. Regenera con npm run hns:maps.`; });
    stage.prepend(img); chunkImages.set(c.file, img);
  }
}

function markers(m: MapData): string {
  if (!events.checked) return "";
  const groups: [string, Event[]][] = [["warp", m.warps], ["object", m.objects], ["bg", m.bgs], ["coord", m.coords]];
  return groups.flatMap(([kind, entries]) => entries.map((e, i) => {
    const title = kind === "warp" ? `Puerta #${i} → ${e.dest_map} #${e.dest_warp_id}` : `${kind} #${i} · ${e.graphics_id ?? ""} · ${e.script ?? "sin script"}`;
    const style = `left:${e.x * 16}px;top:${e.y * 16}px`;
    if (kind === "warp" && e.dest_map && catalog.maps[e.dest_map]) return `<a class="marker warp" style="${style}" href="#${encodeURIComponent(e.dest_map)}" title="${esc(title)}" aria-label="${esc(title)}"></a>`;
    return `<span class="marker ${kind}" style="${style}" title="${esc(title)}"></span>`;
  })).join("");
}

function show(id: string, remember = true): void {
  if (id !== "world" && !catalog.maps[id]) {
    meta.textContent = `Mapa desconocido: ${id}`; return;
  }
  if (remember && current !== id) historyStack.push(current);
  events.disabled = id === "world";
  current = id; back.disabled = historyStack.length === 0;
  stage.replaceChildren(); chunkImages.clear(); viewport.scrollTo(0, 0);
  if (id === "world") {
    meta.textContent = `Johto / Kanto · ${catalog.world.maps.length} mapas conectados · ${catalog.world.conflicts.length} discrepancias de conexión · ${catalog.world.unavailable.length} mapa(s) sin render`;
    stage.innerHTML = catalog.world.maps.map(r => `<a class="rect${catalog.maps[r.id].image ? "" : " unavailable"}" href="#${encodeURIComponent(r.id)}" title="${esc(label(catalog.maps[r.id]))}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px"><span>${esc(label(catalog.maps[r.id]))}</span></a>`).join("");
    detail.innerHTML = `<p>Exteriores colocados según las conexiones de HnS. Incluye variantes y áreas especiales; los solapes de la fuente se conservan. Haz clic en un mapa para consultar sus puertas e interiores.</p>`;
    resize();
    const start = catalog.world.maps.find(m => m.id === "MAP_NEW_BARK_TOWN")!;
    const z = Number(zoom.value);
    viewport.scrollTo(Math.max(0, (start.x+start.w/2)*z-viewport.clientWidth/2), Math.max(0, (start.y+start.h/2)*z-viewport.clientHeight/2));
    updateWorldImages();
  } else {
    const m = catalog.maps[id];
    meta.textContent = `${label(m)} · ${m.w}×${m.h} · ${m.id}`;
    stage.innerHTML = m.image ? `<img class="map-image" src="/hns/${esc(m.image)}" width="${m.w*16}" height="${m.h*16}" alt="${esc(label(m))}" />${markers(m)}` : "";
    detail.innerHTML = `${m.image ? "" : `<p class="error">Este mapa de la fuente no se puede renderizar con el perfil de HnS: ${esc(m.unavailable ?? "datos incompatibles")}. No se sustituye por una aproximación.</p>`}
      <p>${esc(m.primary)} + ${esc(m.secondary)} · ${esc(m.music)} · ${esc(m.section)}</p>
      <h2>Conexiones</h2><div class="links">${m.connections.map(c => link(c.map, `${c.direction} → ${catalog.maps[c.map] ? label(catalog.maps[c.map]) : c.map}`)).join("") || "Sin conexiones"}</div>
      <h2>Puertas y warps (${m.warps.length})</h2><div class="links">${m.warps.map((e,i) => link(e.dest_map!, `#${i} (${e.x}, ${e.y}) → ${catalog.maps[e.dest_map!] ? label(catalog.maps[e.dest_map!]) : e.dest_map} #${e.dest_warp_id}`)).join("") || "Sin warps"}</div>
      <h2>Objetos (${m.objects.length}) y eventos (${m.bgs.length+m.coords.length})</h2><table>${[...m.objects,...m.bgs,...m.coords].map(e => `<tr><td>(${e.x}, ${e.y})</td><td>${esc(e.graphics_id ?? e.type ?? "coord")}</td><td>${esc(e.script ?? "sin script")}</td><td>${esc(e.flag ?? e.var ?? "")}</td></tr>`).join("")}</table>`;
    resize();
  }
  renderList();
}

function go(id: string): void {
  const hash = `#${encodeURIComponent(id)}`;
  if (location.hash === hash) show(id); else location.hash = hash;
}
window.addEventListener("hashchange", () => { if (catalog) show(decodeURIComponent(location.hash.slice(1)) || "world"); });
$("world-btn").addEventListener("click", () => go("world"));
back.addEventListener("click", () => {
  const id = historyStack.pop();
  if (!id) return;
  history.replaceState(null, "", `#${encodeURIComponent(id)}`); show(id, false);
});
search.addEventListener("input", () => { if (catalog) renderList(); });
filter.addEventListener("change", () => { if (catalog) renderList(); });
zoom.addEventListener("change", () => {
  if (!catalog) return;
  const old = Number(stage.dataset.zoom ?? "1"), z = Number(zoom.value);
  const x = (viewport.scrollLeft+viewport.clientWidth/2)/old;
  const y = (viewport.scrollTop+viewport.clientHeight/2)/old;
  resize(); viewport.scrollTo(x*z-viewport.clientWidth/2, y*z-viewport.clientHeight/2);
  stage.dataset.zoom = String(z); updateWorldImages();
});
events.addEventListener("change", () => { if (catalog) show(current, false); });
viewport.addEventListener("scroll", () => {
  if (updatePending || !catalog) return;
  updatePending = true; requestAnimationFrame(() => { updatePending = false; updateWorldImages(); });
});
new ResizeObserver(() => { if (catalog) updateWorldImages(); }).observe(viewport);
let drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null;
viewport.addEventListener("pointerdown", e => {
  if (e.button !== 0 || (e.target as HTMLElement).closest("a,button")) return;
  drag = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false };
  viewport.setPointerCapture(e.pointerId); viewport.classList.add("dragging");
});
viewport.addEventListener("pointermove", e => {
  if (!drag) return;
  const dx = e.clientX-drag.x, dy = e.clientY-drag.y;
  drag.moved ||= Math.abs(dx)+Math.abs(dy)>4;
  viewport.scrollTo(drag.left-dx, drag.top-dy);
});
for (const event of ["pointerup", "pointercancel"]) viewport.addEventListener(event, () => { drag = null; viewport.classList.remove("dragging"); });
$("region").addEventListener("change", e => {
  const value = (e.target as HTMLSelectElement).value;
  if (value === "hns") return;
  location.href = value === "crystal" ? "/crystal-world.html" : `/viewer.html${value === "emerald" ? "?game=emerald" : ""}`;
});
(async () => {
  try {
    const response = await fetch("/hns/maps.json");
    if (!response.ok) throw new Error("Faltan los datos: npm run refs:fetch -- pokemon-hns && npm run hns:maps");
    catalog = await response.json() as Catalog;
    $("source").textContent = `Fuente fijada: ${catalog._meta.commit.slice(0, 10)}`;
    show(decodeURIComponent(location.hash.slice(1)) || "world", false);
  } catch (error) {
    meta.textContent = String(error); meta.classList.add("error"); $("count").textContent = "Datos no disponibles";
  }
})();
