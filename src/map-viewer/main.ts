import { loadSource } from "./sources";
import { gameId, SOURCES } from "./types";
import type { GameId, Layer, MapDetail, Source } from "./types";
import { nearTextures, TEXTURE_BUDGET, textureBytes, TexturePool } from "./textures";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = $<HTMLDivElement>("viewport"), stage = $("stage"), sizer = $("sizer"), annotations = $("annotations");
const gameSelect = $<HTMLSelectElement>("game"), zoom = $<HTMLSelectElement>("zoom"), time = $<HTMLSelectElement>("time");
const search = $<HTMLInputElement>("search"), filter = $<HTMLSelectElement>("filter"), back = $<HTMLButtonElement>("back");
const regionSelect = $<HTMLSelectElement>("region");
const labels = $<HTMLInputElement>("labels"), events = $<HTMLInputElement>("events");
const meta = $("meta"), detail = $("detail"), list = $("list"), explore = $<HTMLAnchorElement>("explore");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const layers = new Set<Layer>(["base", "sprites"]);
let source: Source | null = null, sourceController = new AbortController(), detailController = new AbortController();
let current = "world", mapDetail: MapDetail | null = null, frame: number | null = null, sourceEpoch = 0, listLimit = 100;
let currentGame = gameId(new URLSearchParams(location.search).get("game"));
type Position = { map: string; zoom: string; x: number; y: number };
const historyStack: Position[] = [], remembered = new Map<GameId, Position>();
const pool = new TexturePool(stage, url => { meta.textContent = `No se pudo cargar ${url}. Check the data in Atlas.`; });
const position = (): Position => ({ map: current, zoom: zoom.value, x: viewport.scrollLeft, y: viewport.scrollTop });

function mapLink(id: string, text?: string, warp?: string, referenceUrl?: string): string {
  if (!source?.maps.has(id) && referenceUrl) return `<a class="reference" href="${esc(referenceUrl)}">${esc(text ?? id)} · alternative source</a>`;
  if (!source?.maps.has(id)) return `<span>${esc(text ?? id)} (dynamic or missing destination)</span>`;
  return `<a href="#mapa=${encodeURIComponent(id)}${warp != null ? `&warp=${encodeURIComponent(warp)}` : ""}">${esc(text ?? source.maps.get(id)!.name)}</a>`;
}
function renderList(): void {
  if (!source) return;
  const term = search.value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const connected = new Set(source.world.rects.map(r => r.id));
  const maps = [...source.maps.values()].filter(m => (regionSelect.value === "all" || !source!.regions || m.region === regionSelect.value) && (filter.value !== "available" || m.available) && (filter.value !== "world" || connected.has(m.id)) && m.searchable.includes(term)).sort((a, b) => a.name.localeCompare(b.name));
  $("count").textContent = `${maps.length} results · ${[...source.maps.values()].filter(m => m.available).length}/${source.maps.size} available`;
  list.innerHTML = maps.slice(0, listLimit).map(m => `<a class="map${m.id === current ? " selected" : ""}" href="#mapa=${encodeURIComponent(m.id)}">${esc(m.name)}<small>${m.width}×${m.height} px${m.available ? "" : " · Not rendered"}</small></a>`).join("");
  $("more").hidden = maps.length <= listLimit;
}
function resize(): void {
  if (!source) return;
  stage.dataset.zoom = zoom.value;
  const z = Number(zoom.value), m = source.maps.get(current);
  const w = m?.width ?? source.world.width, h = m?.height ?? source.world.height;
  sizer.style.width = `${w * z}px`; sizer.style.height = `${h * z}px`;
  stage.style.width = `${w}px`; stage.style.height = `${h}px`; stage.style.transform = `scale(${z})`;
}
function update(): void {
  if (!source) return;
  const view = { x: viewport.scrollLeft, y: viewport.scrollTop, width: viewport.clientWidth, height: viewport.clientHeight, zoom: Number(zoom.value) };
  const overviewZoom = Math.min(.5, 2048 / Math.max(source.world.width, source.world.height) * 1.5);
  let textures = nearTextures(source.textures(current, time.value, layers, current === "world" && view.zoom <= overviewZoom), view);
  if (textures.reduce((n, t) => n + textureBytes(t), 0) > TEXTURE_BUDGET && current === "world") {
    textures = source.textures(current, time.value, layers, true);
  }
  try { pool.render(textures); } catch (error) { meta.textContent = String(error); }
  $("budget").textContent = `${pool.activeCount} visible images · ${(pool.retainedBytes / 1048576).toFixed(1)} estimated retained MiB (limit 96)`;
  const z = view.zoom;
  const regionFrames = current === "world" && source.regions ? source.regions.map(r => `<div class="region-outline" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px"><button data-region="${esc(r.id)}" title="${esc(r.title)} · ${esc(r.version)}" style="font-size:${14 / z}px;max-width:${r.w}px;overflow:hidden;text-overflow:ellipsis">${esc(r.id === "sevii" ? "Sevii" : r.title)}</button></div>`).join("") : "";
  const rects = current === "world" ? source.world.rects.filter(r => r.x < view.x / z + view.width / z && r.y < view.y / z + view.height / z && r.x + r.w > view.x / z && r.y + r.h > view.y / z) : [];
  annotations.innerHTML = regionFrames + rects.map(r => `<a class="rect${source!.maps.get(r.id)!.available ? "" : " unavailable"}" href="#mapa=${encodeURIComponent(r.id)}" title="${esc(source!.maps.get(r.id)!.name)}" aria-label="${esc(source!.maps.get(r.id)!.name)}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px">${labels.checked && (z >= .125 || r.w * z >= 120) ? `<span style="font-size:${12 / z}px">${esc(source!.maps.get(r.id)!.name)}</span>` : ""}</a>`).join("");
  if (mapDetail && events.checked && current !== "world") {
    annotations.innerHTML += mapDetail.events.map(e => {
      const title = `${e.kind} #${e.index} (${e.x}, ${e.y}) · ${e.destination ?? e.details.scriptName ?? e.details.script ?? e.details.graphics_id ?? e.details.sprite ?? ""}`;
      const attrs = `class="marker ${e.kind === "object" ? "object" : e.kind}" style="left:${e.x * 16}px;top:${e.y * 16}px" title="${esc(title)}" aria-label="${esc(title)}"`;
      return e.kind === "warp" && e.destination && source!.maps.has(e.destination) ? `<a ${attrs} href="#mapa=${encodeURIComponent(e.destination)}${e.destinationWarp != null ? `&warp=${encodeURIComponent(e.destinationWarp)}` : ""}"></a>` : `<button ${attrs} data-event="${e.kind}:${e.index}"></button>`;
    }).join("");
  }
  if (source.exploreLink) {
    const link = source.exploreLink(current, zoom.value);
    explore.hidden = !link;
    if (link) explore.href = link;
    return;
  }
  explore.hidden = !source.capabilities.explore || (current !== "world" && !source.world.rects.some(r => r.id === current));
  if (explore.hidden) return;
  const params = new URLSearchParams({ modo: "explore", z: zoom.value });
  if (current !== "world") params.set("mapa", current);
  else { params.set("x", String(Math.round(view.x))); params.set("y", String(Math.round(view.y))); }
  explore.href = `/viewer.html${source.game === "emerald" ? "?game=emerald" : ""}#${params}`;
}
function scheduleUpdate(): void {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => { frame = null; update(); });
}
function renderDetail(): void {
  if (!source || !mapDetail) return;
  const m = source.maps.get(current)!;
  const journeys = source.journeys?.filter(j => j.a === current || j.b === current ||
    ((m.originId?.includes("HARBOR") || m.originId === "MAP_OLIVINE_CITY_PORT_INSIDE") &&
      (mapDetail!.events.some(e => e.destination === j.a || e.destination === j.b) ||
       (m.originId === "MAP_OLIVINE_CITY_PORT_INSIDE" && j.a === "johto/MAP_OLIVINE_CITY")))) ?? [];
  detail.innerHTML = `${m.level ? `<p>${m.level === "underwater" ? "Submarino" : m.level === "interior" ? "Interior" : "Surface"}${m.positionPending ? " · location awaiting verification; access through entrances or search" : ""}</p>` : ""}${m.level && m.level !== "surface" ? '<button data-surface-return>Return to surface</button>' : ""}${m.available ? "" : `<p class="error">No image: ${esc(m.unavailable)}. Data is retained without approximate graphics.</p>`}
    <p>${Object.entries(mapDetail.info).map(([k, v]) => `${esc(k)}: ${esc(Array.isArray(v) ? v.join(", ") : v)}`).join(" · ")}</p>
    <h2>Connections</h2><div class="links">${mapDetail.connections.map(c => mapLink(c.destination, `${c.direction === "dive" ? "Sumergirse" : c.direction === "emerge" ? "Emerger" : c.direction} → ${source!.maps.get(c.destination)?.name ?? c.destination} (offset ${c.offset})${m.region && source!.maps.get(c.destination)?.region && m.originGame !== source!.maps.get(c.destination)?.originGame ? " · referencia entre fuentes" : ""}`, undefined, c.referenceUrl)).join("") || "No connections"}</div>
    <h2>Doors and warps</h2><div class="links">${mapDetail.events.filter(e => e.kind === "warp").map(e => mapLink(e.destination!, `#${e.index} (${e.x}, ${e.y}) → ${source!.maps.get(e.destination!)?.name ?? e.destination} ${e.details.atlasPolicy ? "· referencia entre fuentes" : e.destinationWarp != null ? `#${e.destinationWarp}` : ""}`, e.destinationWarp, e.referenceUrl)).join("") || "No warps"}</div>
    ${journeys.length ? `<h2>Ports and reference travel</h2><div class="links">${journeys.map(j => `<button data-journey="${esc(j.id)}">${esc(j.label)}${j.kind === "project-navigation" ? " · proyecto" : ""}</button>`).join("")}</div>` : ""}
    <h2>Items and events</h2><table class="event-table">${mapDetail.events.map(e => `<tr tabindex="-1" data-event-row="${e.kind}:${e.index}"><td>${esc(e.kind)} #${e.index}</td><td>(${e.x}, ${e.y})</td><td>${esc(JSON.stringify(e.details))}</td></tr>`).join("")}</table>`;
}
async function show(id: string, restore?: Position, arrival?: string, remember = true): Promise<void> {
  if (!source) return;
  if (id !== "world" && !source.maps.has(id)) { meta.textContent = `Unknown map: ${id}`; renderList(); return; }
  const previousMap = current;
  if (id !== current && !restore && remember) historyStack.push(position());
  const worldRestore = id === "world" ? [...historyStack].reverse().find(p => p.map === "world") : undefined;
  const viewRestore = restore ?? worldRestore;
  detailController.abort(); detailController = new AbortController();
  const signal = detailController.signal, epoch = sourceEpoch;
  current = id; mapDetail = null;
  const selectedRegion = source.maps.get(id)?.region;
  if (selectedRegion) regionSelect.value = selectedRegion; back.disabled = !historyStack.length;
  if (viewRestore) zoom.value = viewRestore.zoom;
  else if (id !== "world" && previousMap === "world") {
    const map = source.maps.get(id)!;
    const fit = Math.min(2, viewport.clientWidth / map.width, viewport.clientHeight / map.height);
    const options = [...zoom.options].map(o => Number(o.value)).filter(z => z <= fit).sort((a, b) => b - a);
    zoom.value = String(options[0] ?? .125);
  }
  events.disabled = id === "world";
  annotations.replaceChildren(); detail.replaceChildren(); resize();
  const inspector = source.inspector(id);
  $("inspector").hidden = !inspector;
  if (inspector) $("inspector").setAttribute("href", inspector);
  if (id === "world") {
    meta.textContent = `${source.title} · ${source.world.rects.length} ${source.regions ? "surface maps" : "connected maps"}`;
    detail.innerHTML = `<p>${esc(source.world.notes)}</p>${source.journeys ? `<h2>Atlas travel</h2><div class="links">${source.journeys.map(j => `<button data-journey="${esc(j.id)}">${esc(j.label)}${j.kind === "project-navigation" ? " · proyecto" : j.kind === "source-navigation" ? " · referencia FireRed" : " · referencia HnS"}</button>`).join("")}</div>` : ""}`;
    if (source.places?.length) detail.innerHTML += `<h2>Islands and surface destinations</h2><div class="links">${source.places.map(p => mapLink(p.id, p.label)).join("")}</div>`;
    const origin = source.world.rects.find(r => r.id === source!.world.origin);
    const z = Number(zoom.value);
    viewport.scrollTo(viewRestore?.x ?? Math.max(0, (origin ? origin.x + origin.w / 2 : 0) * z - viewport.clientWidth / 2), viewRestore?.y ?? Math.max(0, (origin ? origin.y + origin.h / 2 : 0) * z - viewport.clientHeight / 2));
  } else {
    const m = source.maps.get(id)!;
    meta.textContent = `${m.name} · ${m.width}×${m.height} px · Loading details…`;
    viewport.scrollTo(restore?.x ?? 0, restore?.y ?? 0);
  }
  update(); renderList();
  if (id === "world") return;
  try {
    const result = await source.details(id, signal);
    if (signal.aborted || epoch !== sourceEpoch || current !== id) return;
    mapDetail = result;
    const m = source.maps.get(id)!;
    meta.textContent = `${m.name} · ${m.width}×${m.height} px · ${m.id}`;
    renderDetail();
    if (arrival != null && !restore) {
      // Crystal warp IDs are 1-based; GBA ones are 0-based.
      const index = Number(arrival) - (source.game === "crystal" ? 1 : 0);
      const warp = result.events.find(e => e.kind === "warp" && e.index === index);
      if (warp) { const z = Number(zoom.value); viewport.scrollTo((warp.x * 16 + 8) * z - viewport.clientWidth / 2, (warp.y * 16 + 8) * z - viewport.clientHeight / 2); }
    }
    update();
  } catch (error) {
    if (!signal.aborted) { meta.textContent = `Unable to load map details: ${String(error)}`; detail.innerHTML = `<p class="error">${esc(error)}</p>`; }
  }
}
function fitZoom(fit: number): string {
  const existing = [...zoom.options].map(o => Number(o.value)).filter(z => z <= fit).sort((a, b) => b - a)[0];
  if (existing != null) return String(existing);
  const value = Math.pow(2, Math.floor(Math.log2(Math.max(fit, 1 / 1024))));
  zoom.add(new Option(`${value}×`, String(value)));
  return String(value);
}
function hashTarget(): { id: string; arrival?: string; restore?: Position } {
  const raw = location.hash.slice(1), params = new URLSearchParams(raw);
  const id = params.get("mapa") ?? (raw && !raw.includes("=") && raw !== "world" ? decodeURIComponent(raw) : "world");
  const z = params.get("z");
  if (z && Number.isFinite(Number(z)) && Number(z) >= 1 / 1024 && Number(z) <= 4 && ![...zoom.options].some(o => o.value === z)) zoom.add(new Option(`${z}×`, z));
  const restore = params.has("x") && params.has("y") && z && [...zoom.options].some(o => o.value === z) ? { map: id, zoom: z, x: Math.max(0, Number(params.get("x")) || 0), y: Math.max(0, Number(params.get("y")) || 0) } : undefined;
  if (source?.regions && params.get("region") === "all") {
    regionSelect.value = "all";
    const fit = Math.min(viewport.clientWidth / source.world.width, viewport.clientHeight / source.world.height);
    const value = fitZoom(fit);
    return { id: "world", restore: { map: "world", zoom: String(value), x: 0, y: 0 } };
  }
  if (source?.game === "world" && params.get("region") === "underwater") return { id: "hoenn/MAP_UNDERWATER_ROUTE124" };
  const region = source?.regions?.find(r => r.id === params.get("region"));
  if (region && id === "world") {
    const fit = Math.min(1, viewport.clientWidth / region.w);
    const value = Number(fitZoom(fit));
    regionSelect.value = region.id;
    return { id, restore: { map: "world", zoom: String(value), x: Math.max(0, (region.x + region.w / 2) * value - viewport.clientWidth / 2), y: Math.max(0, region.y * value) } };
  }
  return { id, arrival: params.get("warp") ?? undefined, restore };
}
async function changeSource(game: GameId): Promise<void> {
  if (source) remembered.set(currentGame, position());
  currentGame = game; sourceEpoch++; const epoch = sourceEpoch;
  sourceController.abort(); sourceController = new AbortController(); detailController.abort();
  source = null; pool.clear(); annotations.replaceChildren(); detail.replaceChildren(); list.replaceChildren(); historyStack.length = 0; current = "world";
  meta.textContent = "Loading catalog…"; $("count").textContent = "Loading…"; explore.hidden = true; back.disabled = true;
  try {
    const next = await loadSource(game, sourceController.signal);
    if (epoch !== sourceEpoch) return;
    source = next;
    document.title = `Map browser · ${source.title}`; gameSelect.value = game;
    regionSelect.innerHTML = '<option value="all">All regions</option>' + (source.regions ?? []).map(r => `<option value="${esc(r.id)}">${esc(r.title)}</option>`).join("");
    $("region-wrap").hidden = !source.regions;
    explore.hidden = !source.capabilities.explore;
    $("time-wrap").hidden = !source.capabilities.times.length;
    $("sprites-wrap").hidden = !source.capabilities.sprites;
    $("collision-wrap").hidden = !source.capabilities.collision;
    $("source").textContent = `${source.title} · ${source.game === "world" ? source.commit : `source ${source.commit.slice(0, 10)}`}`;
    $("limits").textContent = source.limitations;
    const target = hashTarget(), stored = remembered.get(game);
    if (source.game === "world" && !stored && !target.restore && target.id === "world") {
      const fit = Math.min(viewport.clientWidth / source.world.width, viewport.clientHeight / source.world.height);
      const value = fitZoom(fit);
      target.restore = { map: "world", zoom: String(value), x: 0, y: 0 };
    }
    await show(stored?.map ?? target.id, stored ?? target.restore, target.arrival, false);
  } catch (error) { if (epoch === sourceEpoch) { meta.textContent = String(error); $("count").textContent = "Data unavailable"; } }
}
function go(id: string): void {
  const hash = id === "world" ? "#world" : `#mapa=${encodeURIComponent(id)}`;
  if (location.hash === hash) void show(id); else location.hash = hash;
}
for (const s of SOURCES) gameSelect.add(new Option(`${s.id === "world" ? "" : "Variant · "}${s.label}`, s.id));
gameSelect.value = currentGame;
gameSelect.addEventListener("change", () => {
  const game = gameId(gameSelect.value), url = new URL(location.href);
  url.searchParams.set("game", game); url.hash = ""; history.replaceState(null, "", url);
  listLimit = 100; search.value = ""; void changeSource(game);
});
regionSelect.addEventListener("change", () => {
  listLimit = 100;
  const hash = regionSelect.value === "all" ? "#region=all" : `#region=${encodeURIComponent(regionSelect.value)}`;
  if (location.hash === hash) { const target = hashTarget(); void show(target.id, target.restore); }
  else location.hash = hash;
});
detail.addEventListener("click", e => {
  if ((e.target as HTMLElement).closest("[data-surface-return]")) {
    const previous = [...historyStack].reverse().find(p => source?.maps.get(p.map)?.level === "surface");
    const emerge = mapDetail?.connections.find(c => c.direction === "emerge" && source?.maps.get(c.destination)?.level === "surface")?.destination;
    const entrance = mapDetail?.events.find(e => e.kind === "warp" && e.destination && source?.maps.get(e.destination)?.level === "surface")?.destination;
    const destination = source?.maps.get(current)?.level === "underwater"
      ? emerge ?? previous?.map ?? entrance : previous?.map ?? entrance ?? emerge;
    if (destination) go(destination);
    else { regionSelect.value = source?.maps.get(current)?.region ?? "all"; regionSelect.dispatchEvent(new Event("change")); }
    return;
  }
  const target = (e.target as HTMLElement).closest<HTMLElement>("[data-journey]");
  if (!target || !source?.journeys) return;
  const journey = source.journeys.find(j => j.id === target.dataset.journey)!;
  detail.innerHTML = `<h2>${esc(journey.label)}</h2><p>${esc(journey.description ?? (journey.kind === "project-navigation" ? "Project-proposed link for navigating between atlas regions." : "Heart & Soul includes travel between Olivine and Vermilion. Here the destinations are adapted to each region's main version."))}</p><div class="links">${mapLink(journey.a)}${mapLink(journey.b)}</div><p>These links change the atlas location; they do not execute in-game travel.</p>`;
});
window.addEventListener("hashchange", () => { const target = hashTarget(); void show(target.id, target.restore, target.arrival); });
$("world-btn").addEventListener("click", () => go("world"));
back.addEventListener("click", () => { const previous = historyStack.pop(); if (!previous) return; history.replaceState(null, "", previous.map === "world" ? "#world" : `#mapa=${encodeURIComponent(previous.map)}`); void show(previous.map, previous); });
for (const control of [search, filter]) control.addEventListener(control === search ? "input" : "change", () => { listLimit = 100; renderList(); });
$("more").addEventListener("click", () => { listLimit += 100; renderList(); });
zoom.addEventListener("change", () => {
  const previous = Number(stage.dataset.zoom ?? 1), z = Number(zoom.value);
  const x = (viewport.scrollLeft + viewport.clientWidth / 2) / previous, y = (viewport.scrollTop + viewport.clientHeight / 2) / previous;
  resize(); viewport.scrollTo(x * z - viewport.clientWidth / 2, y * z - viewport.clientHeight / 2); stage.dataset.zoom = zoom.value; scheduleUpdate();
});
time.addEventListener("change", () => { pool.clear(); scheduleUpdate(); });
for (const input of document.querySelectorAll<HTMLInputElement>("[data-layer]")) input.addEventListener("change", () => { const layer = input.dataset.layer as Layer; if (input.checked) layers.add(layer); else layers.delete(layer); scheduleUpdate(); });
for (const input of [events, labels]) input.addEventListener("change", scheduleUpdate);
viewport.addEventListener("scroll", scheduleUpdate);
new ResizeObserver(scheduleUpdate).observe(viewport);
let suppressClick = false;
let drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null;
viewport.addEventListener("pointerdown", e => {
  if (e.button !== 0 || e.pointerType !== "mouse" || (e.target as HTMLElement).closest("button")) return;
  suppressClick = false;
  drag = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false };
  viewport.classList.add("dragging");
});
viewport.addEventListener("pointermove", e => { if (!drag) return; drag.moved ||= Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4; if (drag.moved) { viewport.setPointerCapture(e.pointerId); suppressClick = true; } viewport.scrollTo(drag.left - e.clientX + drag.x, drag.top - e.clientY + drag.y); });
for (const event of ["pointerup", "pointercancel"]) viewport.addEventListener(event, () => { drag = null; viewport.classList.remove("dragging"); });
viewport.addEventListener("dragstart", e => e.preventDefault());
viewport.addEventListener("click", e => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; } }, true);
annotations.addEventListener("click", e => {
  const regionButton = (e.target as HTMLElement).closest<HTMLElement>("[data-region]");
  if (regionButton) { regionSelect.value = regionButton.dataset.region!; regionSelect.dispatchEvent(new Event("change")); return; }
  const button = (e.target as HTMLElement).closest<HTMLElement>("[data-event]");
  if (!button) return;
  const row = [...detail.querySelectorAll<HTMLElement>("[data-event-row]")].find(r => r.dataset.eventRow === button.dataset.event);
  row?.scrollIntoView({ block: "nearest" }); row?.focus();
});
window.addEventListener("pagehide", () => { sourceController.abort(); detailController.abort(); pool.clear(); if (frame !== null) cancelAnimationFrame(frame); frame = null; });
window.addEventListener("pageshow", e => {
  if (!e.persisted) return;
  if (!source) void changeSource(currentGame);
  else if (current !== "world" && !mapDetail) void show(current, position());
  else scheduleUpdate();
});
void changeSource(currentGame);

// Preserve the atlas selection/camera when returning from the separate exploration page.
explore.addEventListener("click", () => {
  try { sessionStorage.setItem("atlas-explore-return", location.pathname + location.search + location.hash); } catch { /* Navigation also works without storage. */ }
});
