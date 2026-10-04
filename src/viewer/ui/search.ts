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

export function setupSearch(
  index: KantoIndex,
  searchInput: HTMLInputElement,
  resultsEl: HTMLElement,
  onSelectMap: (mapId: string) => void
): SearchController {
  const mapEntries = Object.entries(index.maps).map(([id, m]) => ({
    id,
    title: m.title || id,
    section: m.section || "",
    searchKey: normalize(`${id} ${m.title || ""} ${m.section || ""}`),
  }));

  let selectedIdx = -1;
  let currentMatches: typeof mapEntries = [];

  const renderResults = () => {
    resultsEl.innerHTML = "";
    if (currentMatches.length === 0) {
      resultsEl.style.display = "none";
      return;
    }

    resultsEl.style.display = "flex";
    currentMatches.forEach((m, idx) => {
      const item = document.createElement("div");
      item.className = "search-item" + (idx === selectedIdx ? " selected" : "");
      item.innerHTML = `<span>${m.title}</span><span class="search-item-id">${m.id}</span>`;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        onSelectMap(m.id);
        resultsEl.style.display = "none";
        searchInput.value = m.title;
      });
      resultsEl.appendChild(item);
    });
  };

  const updateSearch = () => {
    const q = normalize(searchInput.value.trim());
    if (!q) {
      currentMatches = [];
      resultsEl.style.display = "none";
      return;
    }
    currentMatches = mapEntries.filter((m) => m.searchKey.includes(q)).slice(0, 10);
    selectedIdx = currentMatches.length > 0 ? 0 : -1;
    renderResults();
  };

  searchInput.addEventListener("input", updateSearch);

  searchInput.addEventListener("keydown", (e) => {
    if (resultsEl.style.display === "none" || currentMatches.length === 0) {
      if (e.key === "Enter") {
        updateSearch();
        if (currentMatches.length > 0) {
          onSelectMap(currentMatches[0]!.id);
          resultsEl.style.display = "none";
        }
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
        onSelectMap(currentMatches[selectedIdx]!.id);
        searchInput.value = currentMatches[selectedIdx]!.title;
        resultsEl.style.display = "none";
      }
    } else if (e.key === "Escape") {
      resultsEl.style.display = "none";
    }
  });

  searchInput.addEventListener("blur", () => {
    // Retraso para permitir mousedown
    setTimeout(() => {
      resultsEl.style.display = "none";
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
        onSelectMap(currentMatches[0]!.id);
        resultsEl.style.display = "none";
        return true;
      }
      return false;
    },
  };
}
