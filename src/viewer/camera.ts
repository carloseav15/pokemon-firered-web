// World pixels remain unscaled; the stage alone reserves the scaled scroll extent.
export class ViewerCamera {
  zoom = 1;
  private width = 0;
  private height = 0;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly stage: HTMLElement,
    private readonly content: HTMLElement,
  ) {}

  configure(width: number, height: number, zoom: number): void {
    this.width = width;
    this.height = height;
    this.content.style.width = `${width}px`;
    this.content.style.height = `${height}px`;
    this.applyZoom(zoom);
  }

  clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.viewport.clientLeft + this.viewport.scrollLeft) / this.zoom,
      y: (clientY - rect.top - this.viewport.clientTop + this.viewport.scrollTop) / this.zoom,
    };
  }

  setZoom(next: number, ax = this.viewport.clientWidth / 2, ay = this.viewport.clientHeight / 2): void {
    if (!Number.isFinite(next)) return;
    const x = (this.viewport.scrollLeft + ax) / this.zoom;
    const y = (this.viewport.scrollTop + ay) / this.zoom;
    this.applyZoom(next);
    // Native scroll clamping handles anchors near a world edge.
    this.viewport.scrollLeft = x * this.zoom - ax;
    this.viewport.scrollTop = y * this.zoom - ay;
  }

  private applyZoom(next: number): void {
    this.zoom = Math.round(Math.min(4, Math.max(0.25, next)) * 1000) / 1000;
    this.stage.style.width = `${this.width * this.zoom}px`;
    this.stage.style.height = `${this.height * this.zoom}px`;
    this.content.style.transform = `scale(${this.zoom})`;
  }
}
