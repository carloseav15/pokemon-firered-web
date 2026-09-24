// gMain.heldKeys / newKeys / newAndRepeatedKeys (main.c ReadKeys).

export const A_BUTTON = 0x0001;
export const B_BUTTON = 0x0002;
export const SELECT_BUTTON = 0x0004;
export const START_BUTTON = 0x0008;
export const DPAD_RIGHT = 0x0010;
export const DPAD_LEFT = 0x0020;
export const DPAD_UP = 0x0040;
export const DPAD_DOWN = 0x0080;
export const R_BUTTON = 0x0100;
export const L_BUTTON = 0x0200;
export const DPAD_ANY = DPAD_RIGHT | DPAD_LEFT | DPAD_UP | DPAD_DOWN;

const KEYMAP: Record<string, number> = {
  KeyZ: A_BUTTON,
  KeyA: A_BUTTON,
  Space: A_BUTTON,
  KeyX: B_BUTTON,
  KeyB: B_BUTTON,
  Escape: B_BUTTON,
  Backspace: SELECT_BUTTON,
  ShiftRight: SELECT_BUTTON,
  ShiftLeft: SELECT_BUTTON,
  Enter: START_BUTTON,
  ArrowRight: DPAD_RIGHT,
  ArrowLeft: DPAD_LEFT,
  ArrowUp: DPAD_UP,
  ArrowDown: DPAD_DOWN,
  KeyQ: L_BUTTON,
  KeyW: R_BUTTON,
};

class Joypad {
  private raw = 0;
  /** Keys pressed since the last poll, so taps shorter than a frame still count. */
  private latched = 0;
  held = 0;
  newKeys = 0;
  repeated = 0;
  private repeatCounter = 0;
  private attached = false;
  /** Called on key events that should unlock audio playback. */
  onUserGesture?: () => void;

  attach(target: Window = window): void {
    if (this.attached) return;
    this.attached = true;
    target.addEventListener("keydown", (event) => {
      const bit = KEYMAP[event.code];
      this.onUserGesture?.();
      if (bit === undefined) return;
      event.preventDefault();
      this.raw |= bit;
      this.latched |= bit;
    });
    target.addEventListener("keyup", (event) => {
      const bit = KEYMAP[event.code];
      if (bit === undefined) return;
      event.preventDefault();
      this.raw &= ~bit;
    });
    target.addEventListener("blur", () => { this.raw = 0; });
  }

  /** ReadKeys: once per frame. Repeat: 40 frames initial, then every 5. */
  poll(): void {
    const keyInput = this.raw | this.latched;
    this.latched = 0;
    this.newKeys = keyInput & ~this.held;
    this.repeated = this.newKeys;
    if (keyInput !== 0 && this.held === keyInput) {
      this.repeatCounter--;
      if (this.repeatCounter === 0) {
        this.repeated = keyInput;
        this.repeatCounter = 5;
      }
    } else {
      this.repeatCounter = 40;
    }
    this.held = keyInput;
  }

  /** Inject presses for tests/automation. */
  press(bits: number): void { this.raw |= bits; this.latched |= bits; }
  release(bits: number): void { this.raw &= ~bits; }
}

export const joy = new Joypad();

export const JOY_NEW = (bits: number) => (joy.newKeys & bits) !== 0;
export const JOY_HELD = (bits: number) => (joy.held & bits) !== 0;
export const JOY_REPEAT = (bits: number) => (joy.repeated & bits) !== 0;
