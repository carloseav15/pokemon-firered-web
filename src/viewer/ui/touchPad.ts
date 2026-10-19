// On-screen GBA buttons for touch devices. Each button produces the same
// keyboard events a physical keyboard does, so the viewer (event.key) and the
// engine Joypad (event.code, KEYMAP in core/gba/input.ts) need no second input
// path. B also holds Shift for the viewer, matching "hold B to run".

type KeySpec = { key: string; code: string };
type Button = { id: string; label: string; keys: KeySpec[] };

const BUTTONS: Button[] = [
  { id: "a", label: "A", keys: [{ key: "z", code: "KeyZ" }] },
  // code "" keeps Shift out of KEYMAP (ShiftLeft/Right are SELECT there).
  { id: "b", label: "B", keys: [{ key: "x", code: "KeyX" }, { key: "Shift", code: "" }] },
  { id: "start", label: "START", keys: [{ key: "Enter", code: "Enter" }] },
  { id: "select", label: "SELECT", keys: [{ key: " ", code: "Space" }, { key: "Backspace", code: "Backspace" }] },
  // key "Unidentified": the viewer reads W/A/S/D as movement, the engine reads only the code.
  { id: "l", label: "L", keys: [{ key: "Unidentified", code: "KeyQ" }] },
  { id: "r", label: "R", keys: [{ key: "Unidentified", code: "KeyE" }] },
];
const DIRECTIONS: Record<"up" | "down" | "left" | "right", KeySpec> = {
  up: { key: "ArrowUp", code: "ArrowUp" },
  down: { key: "ArrowDown", code: "ArrowDown" },
  left: { key: "ArrowLeft", code: "ArrowLeft" },
  right: { key: "ArrowRight", code: "ArrowRight" },
};
type Direction = keyof typeof DIRECTIONS;

function send(type: "keydown" | "keyup", spec: KeySpec): void {
  window.dispatchEvent(new KeyboardEvent(type, { key: spec.key, code: spec.code, bubbles: true, cancelable: true }));
}

export class TouchPad {
  readonly root = document.createElement("div");
  private readonly held = new Map<number, KeySpec[]>();
  private direction: Direction | null = null;
  private dpadPointer: number | null = null;

  constructor() {
    this.root.id = "touch-pad";
    this.root.hidden = true;
    this.root.setAttribute("aria-hidden", "true");
    const dpad = document.createElement("div");
    dpad.className = "touch-dpad";
    for (const dir of Object.keys(DIRECTIONS)) {
      const arm = document.createElement("span");
      arm.className = `touch-dpad-${dir}`;
      dpad.append(arm);
    }
    dpad.addEventListener("pointerdown", (event) => {
      event.preventDefault(); event.stopPropagation();
      dpad.setPointerCapture(event.pointerId);
      this.dpadPointer = event.pointerId;
      this.aim(dpad, event);
    });
    dpad.addEventListener("pointermove", (event) => { if (event.pointerId === this.dpadPointer) this.aim(dpad, event); });
    const endDpad = (event: PointerEvent) => {
      if (event.pointerId !== this.dpadPointer) return;
      this.dpadPointer = null;
      this.setDirection(null);
    };
    dpad.addEventListener("pointerup", endDpad);
    dpad.addEventListener("pointercancel", endDpad);
    this.root.append(dpad);

    for (const button of BUTTONS) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `touch-btn touch-${button.id}`;
      el.textContent = button.label;
      el.tabIndex = -1;
      el.addEventListener("pointerdown", (event) => {
        event.preventDefault(); event.stopPropagation();
        el.setPointerCapture(event.pointerId);
        el.classList.add("pressed");
        this.held.set(event.pointerId, button.keys);
        for (const spec of button.keys) send("keydown", spec);
      });
      const end = (event: PointerEvent) => {
        const keys = this.held.get(event.pointerId);
        if (!keys) return;
        this.held.delete(event.pointerId);
        el.classList.remove("pressed");
        for (const spec of keys) send("keyup", spec);
      };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
      el.addEventListener("contextmenu", (event) => event.preventDefault());
      this.root.append(el);
    }
    document.body.append(this.root);
  }

  show(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) this.releaseAll();
  }

  private aim(dpad: HTMLElement, event: PointerEvent): void {
    const box = dpad.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    // A small dead zone in the centre keeps a resting thumb from walking.
    if (Math.hypot(dx, dy) < box.width * 0.12) { this.setDirection(null); return; }
    this.setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  }

  private setDirection(direction: Direction | null): void {
    if (direction === this.direction) return;
    if (this.direction) send("keyup", DIRECTIONS[this.direction]);
    this.direction = direction;
    this.root.dataset.direction = direction ?? "";
    if (direction) send("keydown", DIRECTIONS[direction]);
  }

  private releaseAll(): void {
    this.setDirection(null);
    for (const keys of this.held.values()) for (const spec of keys) send("keyup", spec);
    this.held.clear();
    for (const el of this.root.querySelectorAll(".pressed")) el.classList.remove("pressed");
  }
}
