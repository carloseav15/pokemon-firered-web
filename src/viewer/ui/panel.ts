import type { Element, KantoIndex, Trigger, Writer } from "../types";
import { BIOME_NAMES, LAYER_LABELS } from "../constants";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function writerText(w: Writer): string {
  if ("value" in w && !("action" in w)) return `value ${w.value}`;
  if (w.action === "add") return `+= ${w.value}`;
  if (w.action === "copy") return `= ${w.from}`;
  return w.action;
}

function writersHtml(index: KantoIndex, key: string | number): string {
  const list = index.writers[String(key)] ?? [];
  if (list.length === 0) return "<p>No references in the analyzed scripts.</p>";
  return `<ul>${list
    .map((w) => `<li>${escapeHtml(writerText(w))} — ${escapeHtml(w.map)}, <i>${escapeHtml(w.label)}</i>, line ${w.line}</li>`)
    .join("")}</ul>`;
}

export function renderBiomePanel(
  panel: HTMLElement,
  biomeIdx: number,
  mx: number,
  my: number
): void {
  if (biomeIdx >= 0 && biomeIdx < BIOME_NAMES.length) {
    panel.innerHTML = `<h2>Outside the maps</h2><p><span class="badge badge-trigger">BIOME</span> ${escapeHtml(
      BIOME_NAMES[biomeIdx]
    )}</p><p style="color:#71717a">World coordinates: (${mx}, ${my}) · Not walkable.</p>`;
    appendCopyButton(panel, `world(${mx},${my})`);
  } else {
    panel.innerHTML = `<h2>Outside the maps</h2><p>Outside map boundaries.</p><p style="color:#71717a">World coordinates: (${mx}, ${my}).</p>`;
    appendCopyButton(panel, `world(${mx},${my})`);
  }
}

function appendCopyButton(panel: HTMLElement, text: string): void {
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.setAttribute("style", "width:100%;margin-top:8px");
  btn.textContent = "⧉ Copy coordinates";
  const live = document.createElement("p");
  live.className = "copy-feedback";
  live.setAttribute("role", "status");
  btn.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(text);
      live.textContent = "Coordinates copied.";
    } catch {
      live.textContent = "Unable to copy to the clipboard.";
    }
  });
  panel.appendChild(btn);
  panel.appendChild(live);
}

export function renderTilePanel(
  panel: HTMLElement,
  index: KantoIndex,
  id: string,
  lx: number,
  ly: number,
  mx: number,
  my: number,
  els: Element[],
  trs: Trigger[],
  onExploreHere?: () => void,
  onNavigate?: (mapId: string) => void
): void {
  const mapInfo = index.maps[id];
  const musicLabel = mapInfo?.musicName ? ` · 🎵 ${escapeHtml(mapInfo.musicName)}` : "";
  let html = `<h2>${escapeHtml(mapInfo?.title ?? id)}</h2><p style="color:#a1a1aa;margin-bottom:8px">Local tile: <b>(${lx}, ${ly})</b> · World: (${mx}, ${my})${musicLabel}</p>`;
  if (els.length === 0 && trs.length === 0) {
    html += "<p style='color:#71717a'>No indexed elements on this tile.</p>";
  }

  for (const e of els) {
    let badgeClass = "badge-flag";
    if (e.layer === "entrenador") badgeClass = "badge-trainer";
    else if (e.layer === "puerta") badgeClass = "badge-warp";
    const layerLabel = (LAYER_LABELS as Record<string, string>)[e.layer] ?? e.layer;

    html += `<h3><span class="badge ${badgeClass}">${escapeHtml(layerLabel)}</span> <code class="layer-id">${escapeHtml(
      e.layer
    )}</code>${e.localId !== undefined ? ` #${e.localId}` : ""}</h3>`;
    if (e.graphics) html += `<p><b>Graphics:</b> <code>${escapeHtml(e.graphics)}</code></p>`;

    if (e.flag !== undefined) {
      const line = typeof e.flag === "string" ? index.initialFlags[e.flag] : undefined;
      const initStatus = e.startsHidden && line !== undefined ? "Hidden" : "Visible";
      html += `<p><b>Flag:</b> <code>${escapeHtml(String(e.flag))}</code> (Reference starting state: <span class="badge badge-flag">${initStatus}</span>)</p>${writersHtml(
        index,
        e.flag
      )}`;
    }
    if (e.movedByScript) html += "<p><i>Moved by a script (setobjectxyperm).</i></p>";
    if (e.trainer) html += `<p><b>Battle:</b> <code>${escapeHtml(e.trainer)}</code></p>`;
    if (e.trainerRange !== undefined) {
      html += e.direction
        ? `<p><b>Sight range:</b> ${e.trainerRange} tiles toward <b>${escapeHtml(e.direction)}</b>.</p>`
        : `<p><b>Sight range:</b> ${e.trainerRange} tiles (direction varies in game).</p>`;
    }
    if (e.destMap) {
      const exterior = e.destMap in index.maps;
      html += exterior
        ? `<p><span class="badge badge-warp">DESTINATION</span> ${escapeHtml(e.destMap)} (exterior)</p>`
        : `<p><span class="badge badge-warp">DESTINATION</span> ${escapeHtml(e.destMap)} — interior: <i>${escapeHtml(
            e.destName ?? e.destMap
          )}</i></p>`;
    }
  }

  for (const t of trs) {
    html += `<h3><span class="badge badge-trigger">TRIGGER</span></h3><p><b>Condition:</b> <code>${escapeHtml(
      t.var
    )} == ${t.value}</code></p><p><b>Script:</b> <code>${escapeHtml(t.script)}</code></p>${writersHtml(index, t.var)}`;
  }

  panel.innerHTML = html;
  if (onNavigate) {
    const destinations = new Set(els.filter(e => e.layer === "puerta" && e.destMap && e.destMap in index.maps).map(e => e.destMap!));
    for (const destination of destinations) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = `View destination: ${index.maps[destination]?.title ?? destination}`;
      btn.addEventListener("click", () => onNavigate(destination));
      panel.appendChild(btn);
    }
  }
  appendCopyButton(panel, `${id} local(${lx},${ly}) world(${mx},${my})`);
  if (onExploreHere) {
    const wrap = document.createElement("div");
    wrap.setAttribute("style", "margin-top:16px");
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.setAttribute("style", "width:100%;background:#0284c7;color:#fff;border-color:#0369a1;font-weight:600");
    btn.textContent = "🚶 Walk here";
    btn.addEventListener("click", onExploreHere);
    wrap.appendChild(btn);
    panel.appendChild(wrap);
  }
}
