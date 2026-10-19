// Lógica de cliente para la Landing Page de Pokémon Odyssey.
import { loadSaveSummary, type ParsedSaveSummary } from "./saveSummary";

function renderSaveCard(summary: ParsedSaveSummary): void {
  const container = document.getElementById("save-card-slot");
  if (!container) return;

  if (!summary.exists) {
    container.innerHTML = `
      <div class="save-card empty">
        <div class="empty-save-content">
          <div class="empty-icon">🎮</div>
          <div class="empty-text">
            <h3>Comienza tu aventura</h3>
            <p>No se ha detectado ninguna partida previa. Inicia tu expedición canónica con el Profesor Oak.</p>
          </div>
        </div>
        <div class="save-actions-group">
          <a href="/play.html" class="btn-resume-story">
            <span>✨ Nueva Partida</span>
          </a>
          <a href="/world.html" class="btn-resume-world">
            <span>🗺️ Explorar Mundo</span>
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
    .map((earned, idx) => `<span class="badge-dot ${earned ? "earned" : ""}" title="Medalla ${idx + 1}: ${earned ? "Obtenida" : "Pendiente"}"></span>`)
    .join("");

  container.innerHTML = `
    <div class="save-card">
      <div class="trainer-avatar-box">
        <div style="width: 16px; height: 32px; overflow: hidden; position: relative;">
          <img src="${spriteFile}" alt="${summary.playerName}" class="trainer-sprite-img" style="position: absolute; left: 0; top: 0;" />
        </div>
      </div>

      <div class="save-info-group">
        <div class="save-header-row">
          <span class="save-trainer-name">${summary.playerName}</span>
          <span class="save-trainer-id">ID: ${summary.trainerId}</span>
          <span class="save-location-badge">📍 ${summary.locationName}</span>
        </div>

        <div class="save-stats-grid">
          <div class="save-stat-item">
            <span class="stat-label">Equipo</span>
            <span class="stat-value">⚡ ${summary.partyCount} / 6</span>
          </div>
          <div class="save-stat-item">
            <span class="stat-label">Medallas</span>
            <div class="badges-row">
              ${badgesHtml}
            </div>
          </div>
          <div class="save-stat-item">
            <span class="stat-label">Fondos</span>
            <span class="stat-value money">₽ ${new Intl.NumberFormat("es-ES").format(summary.money)}</span>
          </div>
          <div class="save-stat-item">
            <span class="stat-label">Tiempo</span>
            <span class="stat-value">${summary.timePlayedStr}</span>
          </div>
        </div>
      </div>

      <div class="save-actions-group">
        <a href="/play.html" class="btn-resume-story" id="btn-continue-story">
          <span>▶ Continuar Historia</span>
        </a>
        <a href="/world.html" class="btn-resume-world" id="btn-continue-world">
          <span>🗺️ Modo Mundo Abierto</span>
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
    if (e.key === "h" || e.key === "H") {
      if (dialog.open) dialog.close();
      else dialog.showModal();
    }
  });
}

function initLanding(): void {
  const summary = loadSaveSummary();
  renderSaveCard(summary);
  setupControlsModal();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLanding);
} else {
  initLanding();
}
