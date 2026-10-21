import { joy } from "@core/gba/input";
import { sound } from "@core/audio/sound";
import { TouchControls } from "./touchControls";

export type DisplayMode = "console" | "fullscreen" | "extended";

const STORAGE_MODE_KEY = "fr_display_mode";
const STORAGE_AUDIO_MUTED = "fr_audio_muted";

export class ResponsiveManager {
  private currentMode: DisplayMode = "console";
  private isMuted = false;
  private touchControls: TouchControls | null = null;

  constructor() {
    const savedMode = localStorage.getItem(STORAGE_MODE_KEY) as DisplayMode | null;
    if (savedMode === "console" || savedMode === "fullscreen") {
      this.currentMode = savedMode;
    }
    this.isMuted = localStorage.getItem(STORAGE_AUDIO_MUTED) === "true";
  }

  init(): void {
    this.applyMode(this.currentMode);
    this.setupModeSelector();
    this.setupAudioToggle();
    this.setupHelpModal();
    this.setupFullscreenNative();
    this.setupTouchControls();
    this.setupKeyboardShortcuts();
  }

  private applyMode(mode: DisplayMode): void {
    if (mode === "extended") {
      window.location.href = "/world.html";
      return;
    }

    this.currentMode = mode;
    localStorage.setItem(STORAGE_MODE_KEY, mode);

    document.body.classList.remove("mode-console", "mode-fullscreen");
    document.body.classList.add(`mode-${mode}`);

    // Actualizar botones de la barra de modos
    const buttons = document.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(".view-btn");
    buttons.forEach((btn) => {
      const btnMode = btn.dataset.mode;
      if (btnMode === mode) {
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
      } else {
        btn.classList.remove("active");
        btn.setAttribute("aria-selected", "false");
      }
    });
  }

  private setupModeSelector(): void {
    const consoleBtn = document.getElementById("mode-console-btn");
    const fullscreenBtn = document.getElementById("mode-fullscreen-btn");
    const extendedBtn = document.getElementById("mode-extended-btn");

    consoleBtn?.addEventListener("click", () => this.applyMode("console"));
    fullscreenBtn?.addEventListener("click", () => this.applyMode("fullscreen"));
    extendedBtn?.addEventListener("click", (e) => {
      // El link href="/viewer.html" funciona por defecto, aseguramos navegación
      e.preventDefault();
      this.applyMode("extended");
    });
  }

  private setupAudioToggle(): void {
    const audioBtn = document.getElementById("toggle-audio-btn");
    if (!audioBtn) return;

    const updateAudioButton = () => {
      audioBtn.textContent = this.isMuted ? "🔇" : "🔊";
      audioBtn.title = this.isMuted ? "Unmute sound (M)" : "Mute sound (M)";
      audioBtn.classList.toggle("muted", this.isMuted);

      // Silenciar en backend de audio si está disponible
      const backend = sound.backend as unknown as { master?: number; out?: GainNode } | undefined;
      if (backend) {
        if (backend.master !== undefined) {
          backend.master = this.isMuted ? 0 : 1;
        }
        if (backend.out?.gain) {
          backend.out.gain.value = this.isMuted ? 0 : 1;
        }
      }
    };

    updateAudioButton();

    audioBtn.addEventListener("click", () => {
      this.isMuted = !this.isMuted;
      localStorage.setItem(STORAGE_AUDIO_MUTED, String(this.isMuted));
      joy.onUserGesture?.();
      updateAudioButton();
    });
  }

  private setupHelpModal(): void {
    const helpBtn = document.getElementById("toggle-help-btn");
    const dialog = document.getElementById("controls-dialog") as HTMLDialogElement | null;
    const closeBtn = document.getElementById("close-dialog-btn");

    helpBtn?.addEventListener("click", () => {
      if (dialog?.open) dialog.close();
      else dialog?.showModal();
    });

    closeBtn?.addEventListener("click", () => {
      dialog?.close();
    });

    dialog?.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  private setupFullscreenNative(): void {
    const fsBtn = document.getElementById("toggle-fs-native-btn");
    if (!fsBtn) return;

    fsBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen().catch(() => {});
      } else {
        void document.exitFullscreen().catch(() => {});
      }
    });

    document.addEventListener("fullscreenchange", () => {
      fsBtn.textContent = document.fullscreenElement ? "🗗" : "⛶";
      fsBtn.title = document.fullscreenElement
        ? "Exit fullscreen (Esc)"
        : "Browser fullscreen";
    });
  }

  private setupKeyboardShortcuts(): void {
    window.addEventListener("keydown", (e) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      const key = e.key.toLowerCase();
      if (key === "m") {
        const audioBtn = document.getElementById("toggle-audio-btn");
        audioBtn?.click();
      } else if (key === "h" || key === "?") {
        const helpBtn = document.getElementById("toggle-help-btn");
        helpBtn?.click();
      }
    });
  }

  private setupTouchControls(): void {
    const touchOverlay = document.getElementById("virtual-touch-controls");
    this.touchControls = new TouchControls({
      container: touchOverlay,
      hapticFeedback: true,
    });

    const toggleTouchBtn = document.getElementById("toggle-touch-btn");
    toggleTouchBtn?.addEventListener("click", () => {
      const isVis = this.touchControls?.toggle();
      toggleTouchBtn.classList.toggle("active", isVis);
      joy.onUserGesture?.();
    });

    if (this.touchControls.visible) {
      toggleTouchBtn?.classList.add("active");
    }
  }
}
