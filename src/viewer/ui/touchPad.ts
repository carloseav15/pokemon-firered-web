// Adaptador retrocompatible que delega en el componente único TouchControls.
import { TouchControls } from "../../web/touchControls";

export class TouchPad {
  private readonly controls: TouchControls;

  get root(): HTMLElement {
    return this.controls.root;
  }

  constructor() {
    this.controls = new TouchControls({ autoDetect: false });
  }

  show(visible: boolean): void {
    this.controls.show(visible);
  }
}
