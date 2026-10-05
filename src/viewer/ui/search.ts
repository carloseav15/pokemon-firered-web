import type { KantoIndex } from "../types";

export type SearchController = {
  selectFirstMatch: () => boolean;
};

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function splitWords(str: string): string {
  return str
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2");
}

// Alias UI en español (solo búsqueda; no cambia IDs fuente ni el exportador).
const SP_TO_EN: Record<string, string> = {
  ruta: "route",
  paleta: "pallet",
  pueblo: "town",
  ciudad: "city",
  isla: "island",
  monte: "mountain",
  montana: "mountain",
  cueva: "cave",
  verde: "viridian",
  plateada: "pewter",
  celeste: "cerulean",
  carmin: "vermilion",
  lavanda: "lavender",
  azafran: "saffron",
  fucsia: "fuchsia",
  canela: "cinnabar",
  meseta: "plateau",
  anil: "indigo",
};

function aliasQuery(q: string): string {
  return q
    .split(" ")
    .map((t) => SP_TO_EN[t] ?? t)
    .join(" ");
}

// Alias completos en español por mapa (R1): nombres oficiales tal como los ve
// el usuario. Solo búsqueda; no cambian IDs fuente, títulos ni el exportador.
const MAP_ALIASES: Record<string, string[]> = {
  MAP_PALLET_TOWN: ["Pueblo Paleta"],
  MAP_VIRIDIAN_CITY: ["Ciudad Verde"],
  MAP_PEWTER_CITY: ["Ciudad Plateada"],
  MAP_CERULEAN_CITY: ["Ciudad Celeste"],
  MAP_VERMILION_CITY: ["Ciudad Carmín"],
  MAP_LAVENDER_TOWN: ["Pueblo Lavanda"],
  MAP_SAFFRON_CITY_CONNECTION: ["Ciudad Azafrán"],
  MAP_CELADON_CITY: ["Ciudad Azulona"],
  MAP_FUCHSIA_CITY: ["Ciudad Fucsia"],
  MAP_CINNABAR_ISLAND: ["Isla Canela"],
  MAP_INDIGO_PLATEAU_EXTERIOR: ["Meseta Añil"],
  MAP_ROUTE1: ["Ruta 1"],
  MAP_ROUTE2: ["Ruta 2"],
  MAP_ROUTE3: ["Ruta 3"],
  MAP_ROUTE4: ["Ruta 4"],
  MAP_ROUTE5: ["Ruta 5"],
  MAP_ROUTE6: ["Ruta 6"],
  MAP_ROUTE7: ["Ruta 7"],
  MAP_ROUTE8: ["Ruta 8"],
  MAP_ROUTE9: ["Ruta 9"],
  MAP_ROUTE10: ["Ruta 10"],
  MAP_ROUTE11: ["Ruta 11"],
  MAP_ROUTE12: ["Ruta 12"],
  MAP_ROUTE13: ["Ruta 13"],
  MAP_ROUTE14: ["Ruta 14"],
  MAP_ROUTE15: ["Ruta 15"],
  MAP_ROUTE16: ["Ruta 16"],
  MAP_ROUTE17: ["Ruta 17"],
  MAP_ROUTE18: ["Ruta 18"],
  MAP_ROUTE19: ["Ruta 19"],
  MAP_ROUTE20: ["Ruta 20"],
  MAP_ROUTE21_NORTH: ["Ruta 21 Norte"],
  MAP_ROUTE21_SOUTH: ["Ruta 21 Sur"],
  MAP_ROUTE22: ["Ruta 22"],
  MAP_ROUTE23: ["Ruta 23"],
  MAP_ROUTE24: ["Ruta 24"],
  MAP_ROUTE25: ["Ruta 25"],
};

export function setupSearch(
  index: KantoIndex,
  searchInput: HTMLInputElement,
  resultsEl: HTMLElement,
  onSelectMap: (mapId: string) => void
): SearchController {
  searchInput.setAttribute("role", "combobox");
  searchInput.setAttribute("aria-expanded", "false");
  searchInput.setAttribute("aria-controls", resultsEl.id || "search-results");
  searchInput.setAttribute("aria-autocomplete", "list");
  resultsEl.setAttribute("role", "listbox");

  const mapEntries = Object.entries(index.maps).map(([id, m]) => {
    const title = m.title || "";
    const section = m.section || "";
    const raw = `${id} ${title} ${section}`;
    const key = normalize(`${raw} ${splitWords(raw)}`);
    const aliases = (MAP_ALIASES[id] ?? []).map((a) => normalize(a));
    return {
      id,
      title: m.title || id,
      key,
      keyNospace: key.replace(/ /g, ""),
      idNorm: normalize(id),
      idNospace: normalize(id).replace(/ /g, ""),
      titleNorm: normalize(title),
      titleNospace: normalize(title).replace(/ /g, ""),
      aliases,
      aliasesNospace: aliases.map((a) => a.replace(/ /g, "")),
    };
  });

  let selectedIdx = -1;
  let currentMatches: typeof mapEntries = [];
  let lastQuery = "";

  const setExpanded = (open: boolean) => {
    searchInput.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) searchInput.removeAttribute("aria-activedescendant");
  };

  const hideResults = () => {
    resultsEl.style.display = "none";
    setExpanded(false);
  };

  const choose = (m: (typeof mapEntries)[number]) => {
    onSelectMap(m.id);
    hideResults();
    searchInput.value = m.title;
  };

  const renderResults = () => {
    resultsEl.textContent = "";
    if (currentMatches.length === 0) {
      if (lastQuery) {
        // Consulta no vacía sin coincidencias: feedback visible, sin callback.
        const item = document.createElement("div");
        item.className = "search-item no-results";
        item.setAttribute("role", "option");
        item.setAttribute("aria-disabled", "true");
        item.setAttribute("aria-selected", "false");
        item.textContent = "Sin resultados";
        resultsEl.appendChild(item);
        resultsEl.style.display = "flex";
        setExpanded(true);
        // R2: no hay opción seleccionable; el atributo no debe apuntar al nodo eliminado.
        searchInput.removeAttribute("aria-activedescendant");
      } else {
        hideResults();
      }
      return;
    }

    resultsEl.style.display = "flex";
    setExpanded(true);
    currentMatches.forEach((m, idx) => {
      const item = document.createElement("div");
      item.className = "search-item" + (idx === selectedIdx ? " selected" : "");
      item.id = `search-opt-${m.id}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", idx === selectedIdx ? "true" : "false");
      const titleSpan = document.createElement("span");
      titleSpan.textContent = m.title;
      const idSpan = document.createElement("span");
      idSpan.className = "search-item-id";
      idSpan.textContent = m.id;
      item.appendChild(titleSpan);
      item.appendChild(idSpan);
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        choose(m);
      });
      resultsEl.appendChild(item);
    });
    const active = currentMatches[selectedIdx];
    if (active) searchInput.setAttribute("aria-activedescendant", `search-opt-${active.id}`);
    else searchInput.removeAttribute("aria-activedescendant");
  };

  const scoreEntry = (
    m: (typeof mapEntries)[number],
    q: string,
    qNospace: string
  ): number => {
    // Coincidencia exacta de ID/título/alias (ignorando espacios) > prefijo > subcadena.
    const names = [m.idNorm, m.titleNorm, ...m.aliases];
    const namesNospace = [m.idNospace, m.titleNospace, ...m.aliasesNospace];
    if (names.includes(q) || namesNospace.includes(qNospace)) return 4;
    if (names.some((n) => n.startsWith(q)) || namesNospace.some((n) => n.startsWith(qNospace)))
      return 3;
    if (m.key.includes(q)) return 2;
    if (m.keyNospace.includes(qNospace)) return 1;
    return 0;
  };

  const updateSearch = () => {
    const q = normalize(searchInput.value.trim());
    lastQuery = q;
    if (!q) {
      currentMatches = [];
      selectedIdx = -1;
      hideResults();
      return;
    }
    const qNospace = q.replace(/ /g, "");
    const aq = aliasQuery(q);
    const aqNospace = aq.replace(/ /g, "");
    const scored = mapEntries
      .map((m) => ({ m, s: Math.max(scoreEntry(m, q, qNospace), aq !== q ? scoreEntry(m, aq, aqNospace) : 0) }))
      .filter((e) => e.s > 0)
      .sort((a, b) => b.s - a.s || (a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0));
    currentMatches = scored.map((e) => e.m).slice(0, 10);
    selectedIdx = currentMatches.length > 0 ? 0 : -1;
    renderResults();
  };

  searchInput.addEventListener("input", updateSearch);

  searchInput.addEventListener("keydown", (e) => {
    if (resultsEl.style.display === "none" || currentMatches.length === 0) {
      if (e.key === "Enter") {
        updateSearch();
        if (currentMatches.length > 0) {
          choose(currentMatches[0]!);
        }
      } else if (e.key === "Escape") {
        hideResults();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % currentMatches.length;
      renderResults();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + currentMatches.length) % currentMatches.length;
      renderResults();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < currentMatches.length) {
        choose(currentMatches[selectedIdx]!);
      }
    } else if (e.key === "Escape") {
      hideResults();
    }
  });

  searchInput.addEventListener("blur", () => {
    // Retraso para permitir mousedown
    setTimeout(() => {
      hideResults();
    }, 150);
  });

  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim().length > 0) {
      updateSearch();
    }
  });

  return {
    selectFirstMatch(): boolean {
      updateSearch();
      if (currentMatches.length > 0) {
        choose(currentMatches[0]!);
        return true;
      }
      return false;
    },
  };
}
