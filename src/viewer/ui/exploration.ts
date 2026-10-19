import { TouchPad } from "./touchPad";

type Hooks = {
  save(): boolean;
  continue(): Promise<void>;
  newGame?(): Promise<void> | void;
  pause(paused: boolean): void;
  resize(): void;
  exit(): void;
  startMenu(): void;
  stats(): { sectors: number; bytes: number; pending: number; error: string };
};

const PREFS_KEY = "pokemon-explore-prefs";
type ExplorePrefs = { format?: string; scale?: string; radar?: boolean; clean?: boolean; touch?: boolean };
function readPrefs(): ExplorePrefs {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as ExplorePrefs; } catch { return {}; }
}
function writePrefs(prefs: ExplorePrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

/** Presentation controls; pausing never advances the fixed GBA simulation. */
export class ExplorationUi {
  private readonly root = document.createElement("div");
  private readonly menu = document.createElement("dialog");
  private readonly location = document.createElement("span");
  private readonly notice = document.createElement("span");
  private readonly performance = document.createElement("output");
  private readonly observer: ResizeObserver;
  private readonly touchPad = new TouchPad();
  private frame: number | null = null;
  private previous = 0;
  private samples: number[] = [];
  private since = 0;
  private active = false;
  get paused(): boolean { return this.menu.open; }
  constructor(private readonly hooks: Hooks) {
    this.root.id = "explore-hud";
    this.root.hidden = true;
    const menuButton = document.createElement("button");
    menuButton.className = "btn";
    menuButton.textContent = "Menú · Esc";
    menuButton.addEventListener("click", () => this.openMenu());
    this.location.id = "explore-location";
    this.performance.id = "explore-performance";
    this.performance.hidden = true;
    this.notice.setAttribute("role", "status");
    this.notice.id = "explore-loading";
    const gameMenuButton = document.createElement("button");
    gameMenuButton.className = "btn";
    gameMenuButton.id = "explore-game-menu";
    gameMenuButton.textContent = "Juego · Intro";
    gameMenuButton.addEventListener("click", () => this.openGameMenu());
    this.root.append(this.location, this.notice, this.performance, gameMenuButton, menuButton);
    this.menu.id = "explore-menu";
    this.menu.setAttribute("aria-labelledby", "explore-menu-title");
    this.menu.innerHTML = `<h2 id="explore-menu-title">Explorar Kanto</h2>
      <p>Flechas / WASD: caminar · Mayús: correr · B: bicicleta · Z: interactuar · M: audio · H: HUD. En pantallas táctiles, cruceta y botones en pantalla.</p>
      <label>Personaje <select id="explore-character"><option value="red">Rojo</option><option value="leaf">Hoja</option></select></label>
      <label>Presentación <select id="explore-format"><option value="viewport">Todo el viewport</option><option value="wide">16:9</option><option value="gba">GBA 3:2 (15×10)</option></select></label>
      <label>Escala <select id="explore-scale"><option value="auto" selected>Auto (GBA)</option><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option><option value="5">5×</option><option value="6">6×</option></select></label>
      <label><input type="checkbox" id="explore-radar"> Mostrar minimapa</label>
      <label><input type="checkbox" id="explore-clean"> Ocultar barra superior (H)</label>
      <label><input type="checkbox" id="explore-touch"> Controles táctiles (cruceta, A, B, START, SELECT, L, R)</label>
      <label><input type="checkbox" id="explore-metrics"> Mostrar rendimiento</label>
      <button class="btn" id="explore-open-game-menu">Abrir menú del juego</button><button class="btn" id="explore-save">Guardar partida</button><button class="btn" id="explore-continue">Continuar guardado</button><button class="btn" id="explore-new-game">Nueva partida</button><p id="explore-save-result" role="status"></p>
      <p id="explore-note">Navegación por exteriores e interiores en desarrollo. Equipo, mochila y demás opciones están en Juego · Intro. Historia general con inicio definitivo en Paleta.</p>
      <div class="explore-actions"><button class="btn" id="explore-resume">Continuar</button><button class="btn" id="explore-fullscreen">Pantalla completa</button><button class="btn" id="explore-exit">Volver al atlas</button></div>`;
    document.body.append(this.root, this.menu);
    const prefs = readPrefs();
    const formatSelect = this.menu.querySelector<HTMLSelectElement>("#explore-format")!;
    const scaleSelect = this.menu.querySelector<HTMLSelectElement>("#explore-scale")!;
    const radarInput = this.menu.querySelector<HTMLInputElement>("#explore-radar")!;
    const cleanInput = this.menu.querySelector<HTMLInputElement>("#explore-clean")!;
    if (prefs.format === "wide" || prefs.format === "gba" || prefs.format === "viewport") formatSelect.value = prefs.format;
    if (prefs.scale && ["auto", "1", "2", "3", "4", "5", "6"].includes(prefs.scale)) scaleSelect.value = prefs.scale;
    if (prefs.radar) radarInput.checked = true;
    if (prefs.clean) cleanInput.checked = true;
    const touchInput = this.menu.querySelector<HTMLInputElement>("#explore-touch")!;
    // Default: on for touch screens (coarse pointer), until the player chooses.
    touchInput.checked = prefs.touch ?? window.matchMedia("(pointer: coarse)").matches;
    const saveCurrentPrefs = () => writePrefs({
      format: formatSelect.value,
      scale: scaleSelect.value,
      radar: radarInput.checked,
      clean: cleanInput.checked,
      touch: touchInput.checked,
    });
    this.menu.querySelector("#explore-open-game-menu")!.addEventListener("click", () => {
      this.menu.close();
      this.openGameMenu();
    });
    this.menu.querySelector("#explore-save")!.addEventListener("click", () => {
      this.menu.querySelector("#explore-save-result")!.textContent = this.hooks.save() ? "Partida guardada." : "No se pudo guardar la partida.";
    });
    this.menu.querySelector("#explore-continue")!.addEventListener("click", () => {
      this.menu.close();
      void this.hooks.continue().catch(error => { this.openMenu(); this.menu.querySelector("#explore-save-result")!.textContent = String(error); });
    });
    this.menu.querySelector("#explore-new-game")!.addEventListener("click", () => {
      if (!confirm("¿Comenzar una nueva partida desde el inicio de la historia en Pueblo Paleta? Se reemplazará el guardado actual.")) return;
      this.menu.close();
      void Promise.resolve(this.hooks.newGame?.()).catch(error => { this.openMenu(); this.menu.querySelector("#explore-save-result")!.textContent = String(error); });
    });
    const character = this.menu.querySelector<HTMLSelectElement>("#explore-character")!;
    character.value = (document.getElementById("player-char") as HTMLSelectElement).value;
    character.addEventListener("change", () => {
      const original = document.getElementById("player-char") as HTMLSelectElement;
      original.value = character.value; original.dispatchEvent(new Event("change"));
    });
    formatSelect.addEventListener("change", () => {
      this.applyPresentation();
      saveCurrentPrefs();
      this.hooks.resize();
    });
    scaleSelect.addEventListener("change", () => {
      const raw = scaleSelect.value;
      saveCurrentPrefs();
      window.dispatchEvent(new CustomEvent("explore-scale", { detail: raw === "auto" ? 0 : Number(raw) }));
    });
    radarInput.addEventListener("change", () => {
      this.applyPresentation();
      saveCurrentPrefs();
    });
    cleanInput.addEventListener("change", () => {
      this.applyPresentation();
      saveCurrentPrefs();
    });
    touchInput.addEventListener("change", () => {
      this.applyPresentation();
      saveCurrentPrefs();
    });
    this.menu.querySelector("#explore-metrics")!.addEventListener("change", event => {
      this.performance.hidden = !(event.target as HTMLInputElement).checked;
    });
    this.menu.querySelector("#explore-resume")!.addEventListener("click", () => this.menu.close());
    this.menu.querySelector("#explore-exit")!.addEventListener("click", () => this.hooks.exit());
    this.menu.querySelector("#explore-fullscreen")!.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch { this.menu.querySelector("#explore-note")!.textContent = "Pantalla completa no disponible; puedes continuar usando todo el viewport."; }
    });
    this.menu.addEventListener("close", () => {
      this.hooks.pause(false); this.previous = 0; this.samples = []; this.since = 0;
      (document.getElementById("viewport") as HTMLElement).focus({ preventScroll: true });
    });
    window.addEventListener("keydown", this.onKey, true);
    window.addEventListener("resize", this.onWindowResize);
    this.observer = new ResizeObserver(() => { if (this.active) this.hooks.resize(); });
    this.observer.observe(document.getElementById("viewport")!);
  }
  private onWindowResize = (): void => { if (this.active) this.hooks.resize(); };
  private applyPresentation(): void {
    const format = (this.menu.querySelector("#explore-format") as HTMLSelectElement).value;
    const radar = (this.menu.querySelector("#explore-radar") as HTMLInputElement).checked;
    const clean = (this.menu.querySelector("#explore-clean") as HTMLInputElement).checked;
    document.body.classList.toggle("explore-wide", this.active && format === "wide");
    document.body.classList.toggle("explore-gba", this.active && format === "gba");
    document.body.classList.toggle("explore-radar", this.active && radar);
    document.body.classList.toggle("explore-clean", this.active && clean);
    const touch = (this.menu.querySelector("#explore-touch") as HTMLInputElement).checked;
    document.body.classList.toggle("explore-touch", this.active && touch);
    this.touchPad.show(this.active && touch);
  }
  enter(): void {
    this.active = true;
    document.body.classList.add("exploring");
    this.applyPresentation();
    const rawScale = (this.menu.querySelector("#explore-scale") as HTMLSelectElement).value;
    if (rawScale !== "auto") window.dispatchEvent(new CustomEvent("explore-scale", { detail: Number(rawScale) }));
    this.root.hidden = false;
    const viewport = document.getElementById("viewport")!;
    viewport.tabIndex = 0;
    viewport.focus({ preventScroll: true });
    if (this.frame === null) this.frame = requestAnimationFrame(this.measure);
  }
  exit(): void {
    this.active = false;
    if (this.menu.open) this.menu.close();
    this.hooks.pause(false);
    document.body.classList.remove("exploring", "explore-wide", "explore-gba", "explore-radar", "explore-clean", "explore-touch");
    this.touchPad.show(false);
    this.root.hidden = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
  setLocation(name: string): void { if (this.location.textContent !== name) this.location.textContent = name; }
  private openMenu(): void {
    if (!this.active || this.menu.open || document.getElementById("engine-interaction")?.hidden === false) return;
    (this.menu.querySelector("#explore-character") as HTMLSelectElement).value = (document.getElementById("player-char") as HTMLSelectElement).value;
    this.hooks.pause(true);
    this.menu.showModal();
  }
  /** START: the source start menu (Pokédex, party, bag, save, options). */
  private openGameMenu(): void {
    if (!this.active || this.menu.open || document.getElementById("engine-interaction")?.hidden === false || document.querySelector("dialog[open]")) return;
    this.hooks.startMenu();
  }
  private onKey = (event: KeyboardEvent): void => {
    const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
    if (this.active && !this.menu.open && event.key.toLowerCase() === "h" && !event.repeat && tag !== "input" && tag !== "select" && tag !== "textarea"
      && document.getElementById("engine-interaction")?.hidden !== false && !document.querySelector("dialog[open]")) {
      const cleanInput = this.menu.querySelector<HTMLInputElement>("#explore-clean")!;
      cleanInput.checked = !cleanInput.checked;
      cleanInput.dispatchEvent(new Event("change"));
      return;
    }
    // START inside an engine screen (naming screen OK, Pokédex search...) belongs to the engine.
    if (this.active && event.key === "Enter" && !event.repeat && !(event.target instanceof HTMLButtonElement)
      && document.getElementById("interior")?.style.display === "none" && document.getElementById("engine-interaction")?.hidden !== false) { event.preventDefault(); event.stopImmediatePropagation(); this.openGameMenu(); return; }
    if (!this.active || document.getElementById("engine-interaction")?.hidden === false || event.key !== "Escape" || document.querySelector("dialog[open]") || this.menu.open || document.getElementById("interior")?.style.display !== "none") return;
    event.preventDefault(); event.stopImmediatePropagation(); this.openMenu();
  };
  private measure = (now: number): void => {
    this.frame = null;
    if (!this.active) return;
    if (this.paused || document.hidden) { this.previous = 0; this.samples = []; this.since = 0; }
    else {
      if (!this.since) this.since = now;
      if (this.previous) this.samples.push(now - this.previous);
      this.previous = now;
      if (now - this.since >= 1000 && this.samples.length) {
        const times = [...this.samples].sort((a, b) => a - b);
        const avg = this.samples.reduce((sum, dt) => sum + dt, 0) / times.length;
        const stats = this.hooks.stats();
        this.notice.textContent = stats.error || (stats.pending ? "Preparando entorno…" : "");
        const sample = { fps: 1000 / avg, p95: times[Math.ceil(times.length * 0.95) - 1]!, max: times[times.length - 1]!, ...stats };
        // Observational diagnostics: RAF intervals, not proof of GPU presentation or ROM parity.
        this.performance.value = `${sample.fps.toFixed(0)} FPS · p95 ${sample.p95.toFixed(1)} ms · máx ${sample.max.toFixed(1)} ms · ${stats.sectors} mapas · ${(stats.bytes / 1048576).toFixed(1)} MiB*${stats.pending ? ` · cargando ${stats.pending}` : ""}${stats.error ? ` · ${stats.error}` : ""}`;
        this.performance.title = "*Buffers de colisión y canvas residentes estimados; excluye cachés del navegador/GPU, tilesets y sprites. FPS mide intervalos RAF.";
        this.performance.dataset.sample = JSON.stringify(sample);
        this.samples = []; this.since = now;
      }
    }
    this.frame = requestAnimationFrame(this.measure);
  };
  dispose(): void { this.exit(); this.observer.disconnect(); window.removeEventListener("keydown", this.onKey, true); window.removeEventListener("resize", this.onWindowResize); }
}
