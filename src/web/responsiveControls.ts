// Control y gestión de visualización responsive y controles web (PC y táctil).
import {
  A_BUTTON, B_BUTTON, SELECT_BUTTON, START_BUTTON,
  DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT,
  L_BUTTON, R_BUTTON, joy,
} from "@core/gba/input";
import { sound } from "@core/audio/sound";

export type DisplayMode = "console" | "fullscreen" | "extended";

const STORAGE_MODE_KEY = "fr_display_mode";
const STORAGE_AUDIO_MUTED = "fr_audio_muted";

function sendKeyEvent(type: "keydown" | "keyup", code: string, key: string): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
}

export class ResponsiveManager {
  private currentMode: DisplayMode = "console";
  private isMuted = false;
  private touchVisible = false;
  private dpadPointerId: number | null = null;
  private activeDpadDir: "up" | "down" | "left" | "right" | null = null;
  private readonly heldPointerKeys = new Map<number, { bit: number; code: string; key: string }>();

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
      window.location.href = "/viewer.html";
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
      audioBtn.title = this.isMuted ? "Activar sonido (M)" : "Silenciar sonido (M)";
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
        ? "Salir de pantalla completa (Esc / F11)"
        : "Pantalla completa del navegador (F11)";
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
    const toggleTouchBtn = document.getElementById("toggle-touch-btn");

    // Detección táctil inicial
    const isTouchDevice =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches;

    this.touchVisible = isTouchDevice;
    this.updateTouchVisibility();

    toggleTouchBtn?.addEventListener("click", () => {
      this.touchVisible = !this.touchVisible;
      this.updateTouchVisibility();
      joy.onUserGesture?.();
    });

    if (!touchOverlay) return;

    // Configuración de botones de acción
    const buttonMap: Record<string, { bit: number; code: string; key: string }> = {
      a: { bit: A_BUTTON, code: "KeyZ", key: "z" },
      b: { bit: B_BUTTON, code: "KeyX", key: "x" },
      select: { bit: SELECT_BUTTON, code: "Space", key: " " },
      start: { bit: START_BUTTON, code: "Enter", key: "Enter" },
      l: { bit: L_BUTTON, code: "KeyQ", key: "q" },
      r: { bit: R_BUTTON, code: "KeyE", key: "e" },
    };

    const actionButtons = touchOverlay.querySelectorAll<HTMLButtonElement>("[data-btn]");
    actionButtons.forEach((btn) => {
      const btnId = btn.dataset.btn;
      if (!btnId || !buttonMap[btnId]) return;
      const spec = buttonMap[btnId]!;

      const handlePress = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        btn.setPointerCapture(e.pointerId);
        btn.classList.add("pressed");
        this.heldPointerKeys.set(e.pointerId, spec);

        joy.onUserGesture?.();
        joy.press(spec.bit);
        sendKeyEvent("keydown", spec.code, spec.key);

        if ("vibrate" in navigator) {
          try { navigator.vibrate(8); } catch {}
        }
      };

      const handleRelease = (e: PointerEvent) => {
        const held = this.heldPointerKeys.get(e.pointerId);
        if (!held) return;
        this.heldPointerKeys.delete(e.pointerId);
        btn.classList.remove("pressed");

        joy.release(spec.bit);
        sendKeyEvent("keyup", spec.code, spec.key);
      };

      btn.addEventListener("pointerdown", handlePress);
      btn.addEventListener("pointerup", handleRelease);
      btn.addEventListener("pointercancel", handleRelease);
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    // Configuración de la cruceta táctil (D-Pad)
    const dpad = document.getElementById("touch-dpad");
    if (!dpad) return;

    const dirMap: Record<"up" | "down" | "left" | "right", { bit: number; code: string; key: string }> = {
      up: { bit: DPAD_UP, code: "ArrowUp", key: "ArrowUp" },
      down: { bit: DPAD_DOWN, code: "ArrowDown", key: "ArrowDown" },
      left: { bit: DPAD_LEFT, code: "ArrowLeft", key: "ArrowLeft" },
      right: { bit: DPAD_RIGHT, code: "ArrowRight", key: "ArrowRight" },
    };

    const setDirection = (newDir: "up" | "down" | "left" | "right" | null) => {
      if (newDir === this.activeDpadDir) return;

      if (this.activeDpadDir) {
        const prev = dirMap[this.activeDpadDir];
        joy.release(prev.bit);
        sendKeyEvent("keyup", prev.code, prev.key);
        dpad.dataset.direction = "";
      }

      this.activeDpadDir = newDir;

      if (newDir) {
        const next = dirMap[newDir];
        joy.onUserGesture?.();
        joy.press(next.bit);
        sendKeyEvent("keydown", next.code, next.key);
        dpad.dataset.direction = newDir;
        if ("vibrate" in navigator) {
          try { navigator.vibrate(6); } catch {}
        }
      }
    };

    const handleDpadAim = (e: PointerEvent) => {
      const rect = dpad.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const dist = Math.hypot(dx, dy);

      // Dead zone (zona muerta en el centro para reposar el pulgar sin caminar)
      if (dist < rect.width * 0.15) {
        setDirection(null);
        return;
      }

      // Determinar eje dominante
      if (Math.abs(dx) > Math.abs(dy)) {
        setDirection(dx > 0 ? "right" : "left");
      } else {
        setDirection(dy > 0 ? "down" : "up");
      }
    };

    dpad.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dpad.setPointerCapture(e.pointerId);
      this.dpadPointerId = e.pointerId;
      handleDpadAim(e);
    });

    dpad.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.dpadPointerId) {
        handleDpadAim(e);
      }
    });

    const endDpad = (e: PointerEvent) => {
      if (e.pointerId !== this.dpadPointerId) return;
      this.dpadPointerId = null;
      setDirection(null);
    };

    dpad.addEventListener("pointerup", endDpad);
    dpad.addEventListener("pointercancel", endDpad);
    dpad.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private updateTouchVisibility(): void {
    const touchOverlay = document.getElementById("virtual-touch-controls");
    const toggleTouchBtn = document.getElementById("toggle-touch-btn");

    if (touchOverlay) {
      touchOverlay.hidden = !this.touchVisible;
      touchOverlay.setAttribute("aria-hidden", String(!this.touchVisible));
    }

    if (toggleTouchBtn) {
      toggleTouchBtn.classList.toggle("active", this.touchVisible);
    }
  }
}
