export type InputButton = "up" | "down" | "left" | "right" | "action" | "cancel" | "menu";

export class InputState {
  private held = new Set<InputButton>();
  private pressed = new Set<InputButton>();

  press(button: InputButton): void {
    if (!this.held.has(button)) this.pressed.add(button);
    this.held.add(button);
  }

  release(button: InputButton): void {
    this.held.delete(button);
  }

  isHeld(button: InputButton): boolean {
    return this.held.has(button);
  }

  wasPressed(button: InputButton): boolean {
    return this.pressed.has(button);
  }

  endFrame(): void {
    this.pressed.clear();
  }

  clear(): void {
    this.held.clear();
    this.pressed.clear();
  }
}
