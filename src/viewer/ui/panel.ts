import type { Element, KantoIndex, Trigger, Writer } from "../types";
import { BIOME_NAMES, LAYER_LABELS } from "../constants";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function writerText(w: Writer): string {
  if ("value" in w && !("action" in w)) return `valor ${w.value}`;
  if (w.action === "add") return `+= ${w.value}`;
  if (w.action === "copy") return `= ${w.from}`;
  return w.action;
}

function writersHtml(index: KantoIndex, key: string | number): string {
  const list = index.writers[String(key)] ?? [];
  if (list.length === 0) return "<p>Sin referencias en los scripts analizados.</p>";
  return `<ul>${list
    .map((w) => `<li>${escapeHtml(writerText(w))} — ${escapeHtml(w.map)}, <i>${escapeHtml(w.label)}</i>, línea ${w.line}</li>`)
    .join("")}</ul>`;
}

export function renderBiomePanel(
  panel: HTMLElement,
  biomeIdx: number,
  mx: number,
  my: number
): void {
  if (biomeIdx >= 0 && biomeIdx < BIOME_NAMES.length) {
    panel.innerHTML = `<h2>Exterior de Kanto</h2><p><span class="badge badge-trigger">BIOMA</span> ${escapeHtml(
      BIOME_NAMES[biomeIdx]
    )}</p><p style="color:#71717a">Coordenadas mundo: (${mx}, ${my}) · No es transitable.</p>`;
    appendCopyButton(panel, `mundo(${mx},${my})`);
  } else {
    panel.innerHTML = `<h2>Exterior de Kanto</h2><p>Fuera de los mapas.</p><p style="color:#71717a">Coordenadas mundo: (${mx}, ${my}).</p>`;
    appendCopyButton(panel, `mundo(${mx},${my})`);
  }
}

function appendCopyButton(panel: HTMLElement, text: string): void {
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.setAttribute("style", "width:100%;margin-top:8px");
  btn.textContent = "⧉ Copiar coordenadas";
  const live = document.createElement("p");
  live.className = "copy-feedback";
  live.setAttribute("role", "status");
  btn.addEventListener("click", async () => {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
        throw new Error("clipboard indisponible");
      }
      await navigator.clipboard.writeText(text);
      live.textContent = "Coordenadas copiadas.";
    } catch {
      live.textContent = "No se pudo copiar al portapapeles.";
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
  let html = `<h2>${escapeHtml(mapInfo?.title ?? id)}</h2><p style="color:#a1a1aa;margin-bottom:8px">Casilla local: <b>(${lx}, ${ly})</b> · Mundo: (${mx}, ${my})${musicLabel}</p>`;
  if (els.length === 0 && trs.length === 0) {
    html += "<p style='color:#71717a'>Sin elementos del índice en esta casilla.</p>";
  }

  for (const e of els) {
    let badgeClass = "badge-flag";
    if (e.layer === "entrenador") badgeClass = "badge-trainer";
    else if (e.layer === "puerta") badgeClass = "badge-warp";
    const layerLabel = (LAYER_LABELS as Record<string, string>)[e.layer] ?? e.layer;

    html += `<h3><span class="badge ${badgeClass}">${escapeHtml(layerLabel)}</span> <code class="layer-id">${escapeHtml(
      e.layer
    )}</code>${e.localId !== undefined ? ` #${e.localId}` : ""}</h3>`;
    if (e.graphics) html += `<p><b>Gráficos:</b> <code>${escapeHtml(e.graphics)}</code></p>`;

    if (e.flag !== undefined) {
      const line = typeof e.flag === "string" ? index.initialFlags[e.flag] : undefined;
      const initStatus = e.startsHidden && line !== undefined ? "Oculto" : "Visible";
      html += `<p><b>Flag:</b> <code>${escapeHtml(String(e.flag))}</code> (Estado inicial de referencia: <span class="badge badge-flag">${initStatus}</span>)</p>${writersHtml(
        index,
        e.flag
      )}`;
    }
    if (e.movedByScript) html += "<p><i>Se mueve por script (setobjectxyperm).</i></p>";
    if (e.trainer) html += `<p><b>Combate:</b> <code>${escapeHtml(e.trainer)}</code></p>`;
    if (e.trainerRange !== undefined) {
      html += e.direction
        ? `<p><b>Rango de visión:</b> ${e.trainerRange} casillas hacia <b>${escapeHtml(e.direction)}</b>.</p>`
        : `<p><b>Rango de visión:</b> ${e.trainerRange} casillas (dirección variable en juego).</p>`;
    }
    if (e.destMap) {
      const exterior = e.destMap in index.maps;
      html += exterior
        ? `<p><span class="badge badge-warp">DESTINO</span> ${escapeHtml(e.destMap)} (exterior)</p>`
        : `<p><span class="badge badge-warp">DESTINO</span> ${escapeHtml(e.destMap)} — interior: <i>${escapeHtml(
            e.destName ?? e.destMap
          )}</i></p>`;
    }
  }

  for (const t of trs) {
    html += `<h3><span class="badge badge-trigger">ACTIVADOR</span></h3><p><b>Condición:</b> <code>${escapeHtml(
      t.var
    )} == ${t.value}</code></p><p><b>Script:</b> <code>${escapeHtml(t.script)}</code></p>${writersHtml(index, t.var)}`;
  }

  panel.innerHTML = html;
  if (onNavigate) {
    const destinations = new Set(els.filter(e => e.layer === "puerta" && e.destMap && e.destMap in index.maps).map(e => e.destMap!));
    for (const destination of destinations) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = `Ver destino: ${index.maps[destination]?.title ?? destination}`;
      btn.addEventListener("click", () => onNavigate(destination));
      panel.appendChild(btn);
    }
  }
  appendCopyButton(panel, `${id} local(${lx},${ly}) mundo(${mx},${my})`);
  if (onExploreHere) {
    const wrap = document.createElement("div");
    wrap.setAttribute("style", "margin-top:16px");
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.setAttribute("style", "width:100%;background:#0284c7;color:#fff;border-color:#0369a1;font-weight:600");
    btn.textContent = "🚶 Ir aquí con el avatar";
    btn.addEventListener("click", onExploreHere);
    wrap.appendChild(btn);
    panel.appendChild(wrap);
  }
}
