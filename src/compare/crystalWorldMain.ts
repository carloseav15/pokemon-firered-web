// Mapa del mundo de Crystal (crystal-world.html). Datos: public/crystal/world/ (tools/viewer/crystal_world.py).
type Entry = { name: string; x: number; y: number; w: number; h: number; section: string; landmark: string; environment: string };
type Tile = { file: string; x: number; y: number; w: number; h: number };
type World = {
  w: number; h: number; blockPx: number; tile: number; tiles: Tile[]; maps: Entry[];
  sections: { name: string; conflicts: unknown[] }[]; overlaps: string[][]; unplaced: string[]; note: string;
};

const view = document.getElementById("view")!;
const sizer = document.getElementById("sizer")!;
const worldEl = document.getElementById("world")!;
const side = document.getElementById("side")!;
const zoomSel = document.getElementById("zoom") as HTMLSelectElement;
const labelsChk = document.getElementById("labels") as HTMLInputElement;
const townsChk = document.getElementById("towns") as HTMLInputElement;
const tip = document.getElementById("tip")!;
const info = document.getElementById("info")!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
let world: World;

const BP = 32;
const spaced = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2");

function draw(): void {
  const z = Number(zoomSel.value);
  const W = world.w * BP;
  const H = world.h * BP;
  sizer.style.width = `${W * z}px`;
  sizer.style.height = `${H * z}px`;
  worldEl.style.width = `${W}px`;
  worldEl.style.height = `${H}px`;
  worldEl.style.transform = `scale(${z})`;
  const parts: string[] = [];
  if (z < 0.5) parts.push(`<img src="/crystal/world/overview.png" style="left:0;top:0;width:${W}px;height:${H}px" alt="" />`);
  else for (const t of world.tiles) parts.push(`<img loading="lazy" src="/crystal/world/${t.file}" style="left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px" alt="" />`);
  const onlyTowns = townsChk.checked;
  const fs = Math.max(14, Math.round(14 / z));
  for (const m of world.maps) {
    const x = m.x * BP, y = m.y * BP, w = m.w * BP, h = m.h * BP;
    parts.push(`<a class="rect" href="/crystal.html#${m.name}" data-n="${m.name}" data-i="${esc(`${spaced(m.name)} · ${m.w}×${m.h} · ${m.section}`)}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></a>`);
    const isTown = m.environment === "TOWN";
    if (labelsChk.checked && (!onlyTowns || isTown) && (isTown || z >= 0.25)) {
      parts.push(`<div class="lbl" style="left:${x + 8}px;top:${y + 6}px;font-size:${isTown ? fs : Math.round(fs * 0.7)}px">${esc(spaced(m.name))}</div>`);
    }
  }
  worldEl.innerHTML = parts.join("");
}

function jump(name: string): void {
  const m = world.maps.find((e) => e.name === name);
  if (!m) return;
  const z = Number(zoomSel.value);
  view.scrollTo({ left: (m.x + m.w / 2) * BP * z - view.clientWidth / 2, top: (m.y + m.h / 2) * BP * z - view.clientHeight / 2, behavior: "smooth" });
}

function sideList(): void {
  const groups = new Map<string, Entry[]>();
  for (const m of world.maps) (groups.get(m.section) ?? groups.set(m.section, []).get(m.section)!).push(m);
  side.innerHTML = [...groups.entries()]
    .map(([s, ms]) => {
      const towns = ms.filter((m) => m.environment === "TOWN").sort((a, b) => a.name.localeCompare(b.name));
      const routes = ms.filter((m) => m.environment !== "TOWN").sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const it = (m: Entry) => `<div class="it" data-n="${m.name}">${esc(spaced(m.name))}</div>`;
      return `<h4>${esc(s)} · pueblos y ciudades</h4>${towns.map(it).join("")}<h4>${esc(s)} · rutas y otros</h4>${routes.map(it).join("")}`;
    })
    .join("");
}

side.addEventListener("click", (e) => {
  const n = (e.target as HTMLElement).closest<HTMLElement>("[data-n]")?.dataset.n;
  if (n) jump(n);
});
zoomSel.addEventListener("change", () => {
  const cx = (view.scrollLeft + view.clientWidth / 2) / Number(worldEl.style.transform.match(/scale\(([\d.]+)\)/)![1]);
  const cy = (view.scrollTop + view.clientHeight / 2) / Number(worldEl.style.transform.match(/scale\(([\d.]+)\)/)![1]);
  draw();
  const z = Number(zoomSel.value);
  view.scrollTo(cx * z - view.clientWidth / 2, cy * z - view.clientHeight / 2);
});
labelsChk.addEventListener("change", draw);
townsChk.addEventListener("change", draw);

// arrastrar para desplazar; la rueda con Ctrl/⌘ cambia el zoom
let drag: { x: number; y: number; l: number; t: number; moved: boolean } | null = null;
view.addEventListener("mousedown", (e) => {
  drag = { x: e.clientX, y: e.clientY, l: view.scrollLeft, t: view.scrollTop, moved: false };
  view.classList.add("drag");
});
window.addEventListener("mousemove", (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    view.scrollLeft = drag.l - dx;
    view.scrollTop = drag.t - dy;
  }
  const r = (e.target as HTMLElement).closest?.<HTMLElement>(".rect");
  if (r && !drag?.moved) {
    tip.style.display = "block";
    tip.textContent = r.dataset.i ?? "";
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY + 14}px`;
  } else tip.style.display = "none";
});
window.addEventListener("mouseup", () => {
  view.classList.remove("drag");
  setTimeout(() => (drag = null), 0);
});
view.addEventListener("click", (e) => {
  if (drag?.moved) e.preventDefault();
});

(async () => {
  const res = await fetch("/crystal/world/world.json");
  if (!res.ok) throw new Error("falta public/crystal/world: npm run crystal:maps && npm run crystal:world");
  world = (await res.json()) as World;
  info.textContent = `${world.maps.length} mapas conectados · ${world.w}×${world.h} bloques · ${world.overlaps.length} solapes del decomp`;
  sideList();
  draw();
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash) setTimeout(() => jump(hash), 50);
  (window as unknown as { crystalWorld: unknown }).crystalWorld = { world, jump };
})().catch((e) => {
  view.innerHTML = `<p style="padding:20px;color:#9ca3af">Error: ${esc(String(e))}</p>`;
});
