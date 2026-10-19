// Componente unificado de controles táctiles virtuales para Pokémon Odyssey (Single Source of Truth).
import {
  A_BUTTON, B_BUTTON, SELECT_BUTTON, START_BUTTON,
  DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT,
  L_BUTTON, R_BUTTON, joy,
} from "@core/gba/input";

export type TouchButtonId = "a" | "b" | "select" | "start" | "l" | "r";
export type TouchDirection = "up" | "down" | "left" | "right";

interface KeySpec {
  bit: number;
  code: string;
  key: string;
}

const BUTTON_SPECS: Record<TouchButtonId, { bit: number; code: string; key: string; label: string; extraKeys?: { code: string; key: string }[] }> = {
  a: { bit: A_BUTTON, code: "KeyZ", key: "z", label: "A" },
  // B emite también Shift para permitir correr en el visor mientras se mantiene pulsado.
  b: { bit: B_BUTTON, code: "KeyX", key: "x", label: "B", extraKeys: [{ code: "", key: "Shift" }] },
  select: { bit: SELECT_BUTTON, code: "Space", key: " ", label: "SELECT", extraKeys: [{ code: "Backspace", key: "Backspace" }] },
  start: { bit: START_BUTTON, code: "Enter", key: "Enter", label: "START" },
  l: { bit: L_BUTTON, code: "KeyQ", key: "q", label: "L" },
  r: { bit: R_BUTTON, code: "KeyE", key: "e", label: "R" },
};

const DIRECTION_SPECS: Record<TouchDirection, KeySpec> = {
  up: { bit: DPAD_UP, code: "ArrowUp", key: "ArrowUp" },
  down: { bit: DPAD_DOWN, code: "ArrowDown", key: "ArrowDown" },
  left: { bit: DPAD_LEFT, code: "ArrowLeft", key: "ArrowLeft" },
  right: { bit: DPAD_RIGHT, code: "ArrowRight", key: "ArrowRight" },
};

function sendEvent(type: "keydown" | "keyup", code: string, key: string): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
}

export interface TouchControlsOptions {
  container?: HTMLElement | null;
  autoDetect?: boolean;
  hapticFeedback?: boolean;
}

export class TouchControls {
  readonly root: HTMLElement;
  private isVisible = false;
  private currentDirection: TouchDirection | null = null;
  private dpadPointerId: number | null = null;
  private readonly heldPointerKeys = new Map<number, { bit: number; code: string; key: string; extraKeys?: { code: string; key: string }[] }>();
  private readonly haptic: boolean;

  constructor(options?: TouchControlsOptions) {
    this.haptic = options?.hapticFeedback ?? true;

    // Si ya existe un elemento en el DOM (#virtual-touch-controls o #touch-pad), lo reutilizamos
    const existing = options?.container || document.getElementById("virtual-touch-controls") || document.getElementById("touch-pad");
    if (existing) {
      this.root = existing;
    } else {
      this.root = this.buildTouchOverlay();
      document.body.appendChild(this.root);
    }

    this.setupListeners();

    if (options?.autoDetect !== false) {
      const isTouch =
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia("(pointer: coarse)").matches;
      this.show(isTouch);
    } else {
      this.show(false);
    }
  }

  show(visible: boolean): void {
    this.isVisible = visible;
    this.root.hidden = !visible;
    this.root.setAttribute("aria-hidden", (!visible).toString());
    if (!visible) {
      this.releaseAll();
    }
  }

  toggle(): boolean {
    this.show(!this.isVisible);
    return this.isVisible;
  }

  get visible(): boolean {
    return this.isVisible;
  }

  private buildTouchOverlay(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.id = "virtual-touch-controls";
    wrap.className = "virtual-touch-controls";
    wrap.innerHTML = `
      <div class="touch-shoulder-row">
        <button type="button" class="touch-btn touch-shoulder touch-l" data-btn="l" aria-label="Botón L">L</button>
        <button type="button" class="touch-btn touch-shoulder touch-r" data-btn="r" aria-label="Botón R">R</button>
      </div>
      <div class="touch-dpad-wrap">
        <div class="touch-dpad" id="touch-dpad" role="group" aria-label="Cruceta direccional">
          <div class="dpad-center"></div>
          <button type="button" class="dpad-arm dpad-up" data-dir="up" aria-label="Arriba">▲</button>
          <button type="button" class="dpad-arm dpad-right" data-dir="right" aria-label="Derecha">►</button>
          <button type="button" class="dpad-arm dpad-down" data-dir="down" aria-label="Abajo">▼</button>
          <button type="button" class="dpad-arm dpad-left" data-dir="left" aria-label="Izquierda">◄</button>
        </div>
      </div>
      <div class="touch-menu-btns">
        <button type="button" class="touch-btn touch-pill touch-select" data-btn="select" aria-label="Select">SELECT</button>
        <button type="button" class="touch-btn touch-pill touch-start" data-btn="start" aria-label="Start">START</button>
      </div>
      <div class="touch-action-btns">
        <button type="button" class="touch-btn touch-round touch-b" data-btn="b" aria-label="Botón B">B</button>
        <button type="button" class="touch-btn touch-round touch-a" data-btn="a" aria-label="Botón A">A</button>
      </div>
    `;
    return wrap;
  }

  private setupListeners(): void {
    // 1. Botones de acción
    const buttons = this.root.querySelectorAll<HTMLButtonElement>("[data-btn]");
    buttons.forEach((btn) => {
      const btnId = btn.dataset.btn as TouchButtonId | undefined;
      if (!btnId || !BUTTON_SPECS[btnId]) return;
      const spec = BUTTON_SPECS[btnId];

      const onPress = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        btn.setPointerCapture(e.pointerId);
        btn.classList.add("pressed");
        this.heldPointerKeys.set(e.pointerId, spec);

        joy.onUserGesture?.();
        joy.press(spec.bit);
        sendEvent("keydown", spec.code, spec.key);
        if (spec.extraKeys) {
          for (const extra of spec.extraKeys) sendEvent("keydown", extra.code, extra.key);
        }

        if (this.haptic && "vibrate" in navigator) {
          try { navigator.vibrate(8); } catch {}
        }
      };

      const onRelease = (e: PointerEvent) => {
        const held = this.heldPointerKeys.get(e.pointerId);
        if (!held) return;
        this.heldPointerKeys.delete(e.pointerId);
        btn.classList.remove("pressed");

        joy.release(held.bit);
        sendEvent("keyup", held.code, held.key);
        if (held.extraKeys) {
          for (const extra of held.extraKeys) sendEvent("keyup", extra.code, extra.key);
        }
      };

      btn.addEventListener("pointerdown", onPress);
      btn.addEventListener("pointerup", onRelease);
      btn.addEventListener("pointercancel", onRelease);
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    // 2. D-Pad con zona muerta en el centro para descansar el pulgar
    const dpad = this.root.querySelector<HTMLElement>(".touch-dpad");
    if (dpad) {
      dpad.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dpad.setPointerCapture(e.pointerId);
        this.dpadPointerId = e.pointerId;
        joy.onUserGesture?.();
        this.updateDpadFromPointer(dpad, e);
      });

      dpad.addEventListener("pointermove", (e) => {
        if (e.pointerId === this.dpadPointerId) {
          this.updateDpadFromPointer(dpad, e);
        }
      });

      const onDpadEnd = (e: PointerEvent) => {
        if (e.pointerId !== this.dpadPointerId) return;
        this.dpadPointerId = null;
        this.setDirection(null);
      };

      dpad.addEventListener("pointerup", onDpadEnd);
      dpad.addEventListener("pointercancel", onDpadEnd);
      dpad.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  }

  private updateDpadFromPointer(dpad: HTMLElement, e: PointerEvent): void {
    const rect = dpad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const dist = Math.hypot(dx, dy);

    // Zona muerta central (15% del radio)
    if (dist < rect.width * 0.15) {
      this.setDirection(null);
      return;
    }

    // Ángulo en grados (-180 a 180)
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    let dir: TouchDirection;
    if (angle >= -45 && angle < 45) {
      dir = "right";
    } else if (angle >= 45 && angle < 135) {
      dir = "down";
    } else if (angle >= -135 && angle < -45) {
      dir = "up";
    } else {
      dir = "left";
    }

    this.setDirection(dir);
  }

  private setDirection(newDir: TouchDirection | null): void {
    if (newDir === this.currentDirection) return;

    if (this.currentDirection) {
      const prev = DIRECTION_SPECS[this.currentDirection];
      joy.release(prev.bit);
      sendEvent("keyup", prev.code, prev.key);
      const arm = this.root.querySelector(`.dpad-${this.currentDirection}`);
      arm?.classList.remove("active");
    }

    this.currentDirection = newDir;
    this.root.dataset.direction = newDir ?? "";

    if (newDir) {
      const next = DIRECTION_SPECS[newDir];
      joy.press(next.bit);
      sendEvent("keydown", next.code, next.key);
      const arm = this.root.querySelector(`.dpad-${newDir}`);
      arm?.classList.add("active");

      if (this.haptic && "vibrate" in navigator) {
        try { navigator.vibrate(6); } catch {}
      }
    }
  }

  private releaseAll(): void {
    this.setDirection(null);
    for (const held of this.heldPointerKeys.values()) {
      joy.release(held.bit);
      sendEvent("keyup", held.code, held.key);
      if (held.extraKeys) {
        for (const extra of held.extraKeys) sendEvent("keyup", extra.code, extra.key);
      }
    }
    this.heldPointerKeys.clear();

    const pressedBtns = this.root.querySelectorAll(".pressed");
    pressedBtns.forEach((b) => b.classList.remove("pressed"));
  }
}
