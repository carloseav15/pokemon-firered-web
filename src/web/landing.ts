// Lógica de cliente para la Landing Page de Pokémon Odyssey.
import { loadSaveSummary, type ParsedSaveSummary } from "./saveSummary";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function renderSaveCard(summary: ParsedSaveSummary): void {
  const container = document.getElementById("save-card-slot");
  if (!container) return;

  if (!summary.exists) {
    container.innerHTML = `
      <div class="save-card empty">
        <div class="empty-save-content">
          <div class="empty-icon">🎮</div>
          <div class="empty-text">
            <h3>Start your journey</h3>
            <p>No saved game found in this browser. Open FireRed to begin your adventure.</p>
          </div>
        </div>
        <div class="save-actions-group">
          <a href="/play.html" class="btn-resume-story">
            <span>▶ Play</span>
          </a>
          <a href="/world.html" class="btn-resume-world">
            <span>🗺️ World Map</span>
          </a>
        </div>
      </div>
    `;
    return;
  }

  // Si existe partida guardada
  const spriteFile = summary.gender === "female"
    ? "/fr/objects/greennormal__player.png"
    : "/fr/objects/rednormal__player.png";

  const badgesHtml = summary.badges
    .map((earned, idx) => `<span class="badge-dot ${earned ? "earned" : ""}" title="Badge ${idx + 1}: ${earned ? "Earned" : "Not earned"}"></span>`)
    .join("");

  container.innerHTML = `
    <div class="save-card">
      <div class="trainer-avatar-box">
        <div style="width: 32px; height: 64px; overflow: hidden; position: relative;">
          <img src="${spriteFile}" alt="${escapeHtml(summary.playerName)}" class="trainer-sprite-img" style="position: absolute; left: 0; top: 0;" />
        </div>
      </div>

      <div class="save-info-group">
        <div class="save-header-row">
          <span class="save-trainer-name">${escapeHtml(summary.playerName)}</span>
          <span class="save-trainer-id">ID: ${summary.trainerId}</span>
          <span class="save-location-badge">📍 ${escapeHtml(summary.locationName)}</span>
        </div>

        <div class="save-stats-grid">
          <div class="save-stat-item">
            <span class="stat-label">Party</span>
            <span class="stat-value">⚡ ${summary.partyCount} / 6</span>
          </div>
          <div class="save-stat-item">
            <span class="stat-label">Badges</span>
            <div class="badges-row">
              ${badgesHtml}
            </div>
          </div>
          <div class="save-stat-item">
            <span class="stat-label">Money</span>
            <span class="stat-value money">₽ ${new Intl.NumberFormat("en-US").format(summary.money)}</span>
          </div>
          <div class="save-stat-item">
            <span class="stat-label">Play time</span>
            <span class="stat-value">${summary.timePlayedStr}</span>
          </div>
        </div>
      </div>

      <div class="save-actions-group">
        <a href="${summary.continueUrl}" class="btn-resume-story" id="btn-continue-story">
          <span>▶ Continue</span>
        </a>
        <a href="/world.html" class="btn-resume-world" id="btn-continue-world">
          <span>🗺️ World Map</span>
        </a>
      </div>
    </div>
  `;
}

function setupControlsModal(): void {
  const dialog = document.getElementById("controls-dialog") as HTMLDialogElement | null;
  const openBtn = document.getElementById("btn-open-controls");
  const closeBtn = document.getElementById("close-dialog-btn");

  if (!dialog) return;

  openBtn?.addEventListener("click", () => dialog.showModal());
  closeBtn?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLElement && e.target.matches("input, textarea, select, [contenteditable]")) return;
    if (e.key === "h" || e.key === "H") {
      if (dialog.open) dialog.close();
      else dialog.showModal();
    }
  });
}

async function initLanding(): Promise<void> {
  setupControlsModal();
  renderSaveCard(await loadSaveSummary());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initLanding());
} else {
  void initLanding();
}
