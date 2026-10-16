type Hooks = {
  gameStatus(): string[];
  save(): boolean;
  continue(): Promise<void>;
  pause(paused: boolean): void;
  resize(): void;
  exit(): void;
  stats(): { sectors: number; bytes: number; pending: number; error: string };
};

/** Presentation controls; pausing never advances the fixed GBA simulation. */
export class ExplorationUi {
  private readonly root = document.createElement("div");
  private readonly menu = document.createElement("dialog");
  private readonly location = document.createElement("span");
  private readonly notice = document.createElement("span");
  private readonly performance = document.createElement("output");
  private readonly observer: ResizeObserver;
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
    this.root.append(this.location, this.notice, this.performance, menuButton);
    this.menu.id = "explore-menu";
    this.menu.setAttribute("aria-labelledby", "explore-menu-title");
    this.menu.innerHTML = `<h2 id="explore-menu-title">Explorar Kanto</h2>
      <p>Flechas / WASD: caminar · Mayús: correr · B: bicicleta · Z: interactuar · M: audio.</p>
      <label>Personaje <select id="explore-character"><option value="red">Rojo</option><option value="leaf">Hoja</option></select></label>
      <label>Presentación <select id="explore-format"><option value="viewport">Todo el viewport</option><option value="wide">16:9</option></select></label>
      <label>Escala <select id="explore-scale"><option value="1">1×</option><option value="2" selected>2×</option><option value="3">3×</option><option value="4">4×</option></select></label>
      <label><input type="checkbox" id="explore-radar"> Mostrar minimapa</label>
      <label><input type="checkbox" id="explore-metrics"> Mostrar rendimiento</label>
      <div id="explore-party"></div><button class="btn" id="explore-save">Guardar partida</button><button class="btn" id="explore-continue">Continuar guardado</button><p id="explore-save-result" role="status"></p>
      <p id="explore-note">Navegación por exteriores e interiores en desarrollo. Historia y combates no se ejecutan aquí.</p>
      <div class="explore-actions"><button class="btn" id="explore-resume">Continuar</button><button class="btn" id="explore-fullscreen">Pantalla completa</button><button class="btn" id="explore-exit">Volver al atlas</button></div>`;
    document.body.append(this.root, this.menu);
    this.menu.querySelector("#explore-save")!.addEventListener("click", () => {
      this.menu.querySelector("#explore-save-result")!.textContent = this.hooks.save() ? "Partida guardada." : "No se pudo guardar la partida.";
    });
    this.menu.querySelector("#explore-continue")!.addEventListener("click", () => {
      this.menu.close();
      void this.hooks.continue().catch(error => { this.openMenu(); this.menu.querySelector("#explore-save-result")!.textContent = String(error); });
    });
    const character = this.menu.querySelector<HTMLSelectElement>("#explore-character")!;
    character.value = (document.getElementById("player-char") as HTMLSelectElement).value;
    character.addEventListener("change", () => {
      const original = document.getElementById("player-char") as HTMLSelectElement;
      original.value = character.value; original.dispatchEvent(new Event("change"));
    });
    this.menu.querySelector("#explore-format")!.addEventListener("change", event => {
      document.body.classList.toggle("explore-wide", (event.target as HTMLSelectElement).value === "wide");
      this.hooks.resize();
    });
    this.menu.querySelector("#explore-scale")!.addEventListener("change", event => {
      window.dispatchEvent(new CustomEvent("explore-scale", { detail: Number((event.target as HTMLSelectElement).value) }));
    });
    this.menu.querySelector("#explore-radar")!.addEventListener("change", event => {
      document.body.classList.toggle("explore-radar", (event.target as HTMLInputElement).checked);
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
    this.observer = new ResizeObserver(() => { if (this.active) this.hooks.resize(); });
    this.observer.observe(document.getElementById("viewport")!);
  }
  enter(): void {
    this.active = true;
    document.body.classList.add("exploring");
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
    document.body.classList.remove("exploring", "explore-wide", "explore-radar");
    this.root.hidden = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
  setLocation(name: string): void { if (this.location.textContent !== name) this.location.textContent = name; }
  private openMenu(): void {
    if (!this.active || this.menu.open || document.getElementById("engine-interaction")?.hidden === false) return;
    (this.menu.querySelector("#explore-character") as HTMLSelectElement).value = (document.getElementById("player-char") as HTMLSelectElement).value;
    const party = this.menu.querySelector("#explore-party")!; party.textContent = "";
    for (const line of this.hooks.gameStatus()) { const p=document.createElement("p"); p.textContent=line; party.append(p); }
    this.hooks.pause(true);
    this.menu.showModal();
  }
  private onKey = (event: KeyboardEvent): void => {
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
  dispose(): void { this.exit(); this.observer.disconnect(); window.removeEventListener("keydown", this.onKey, true); }
}
