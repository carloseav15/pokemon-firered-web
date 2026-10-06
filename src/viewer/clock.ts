import { GBA_FRAME_MS } from "./constants";

export type ViewerTick = Readonly<{ tick: number; elapsedMs: number; deltaMs: number; wallTimeMs: number }>;
export type ClockHost = {
  request: (callback: (now: number) => void) => number;
  cancel: (id: number) => void;
};

/** One fixed GBA timeline. Suspension discards wall time, never session time. */
export class ViewerClock {
  private listeners = new Set<(frame: ViewerTick) => void>();
  private pauses = new Set<string>();
  private handle: number | null = null;
  private last: number | null = null;
  private accumulator = 0;
  private frame = 0;
  constructor(private readonly host: ClockHost = {
    request: callback => requestAnimationFrame(callback),
    cancel: id => cancelAnimationFrame(id),
  }) {}

  get tick(): number { return this.frame; }
  get elapsedMs(): number { return this.frame * GBA_FRAME_MS; }
  get paused(): boolean { return this.pauses.size > 0; }
  get subscriberCount(): number { return this.listeners.size; }

  subscribe(listener: (frame: ViewerTick) => void): () => void {
    this.listeners.add(listener);
    this.schedule();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.suspend();
    };
  }

  pause(reason = "manual"): void { this.pauses.add(reason); this.suspend(); }
  resume(reason = "manual"): void { this.pauses.delete(reason); this.schedule(); }

  private suspend(): void {
    if (this.handle !== null) this.host.cancel(this.handle);
    this.handle = null;
    this.last = null;
    this.accumulator = 0;
  }
  private schedule(): void {
    if (this.handle === null && !this.paused && this.listeners.size) this.handle = this.host.request(this.advance);
  }
  private advance = (now: number): void => {
    this.handle = null;
    if (this.paused || !this.listeners.size) return;
    if (this.last !== null) this.accumulator += Math.min(Math.max(0, now - this.last), GBA_FRAME_MS * 8);
    this.last = now;
    // Snapshot once: subscriptions created inside a tick start on the next tick.
    while (this.accumulator + 1e-9 >= GBA_FRAME_MS && !this.paused && this.listeners.size) {
      this.accumulator -= GBA_FRAME_MS;
      const frame = Object.freeze({ tick: ++this.frame, elapsedMs: this.elapsedMs, deltaMs: GBA_FRAME_MS, wallTimeMs: now });
      for (const listener of [...this.listeners]) {
        if (this.listeners.has(listener)) {
          try { listener(frame); } catch (error) { console.error("ViewerClock subscriber", error); }
        }
        if (this.paused) break;
      }
    }
    this.schedule();
  };
}

export const viewerClock = new ViewerClock();
export function bindViewerClockVisibility(clock = viewerClock): () => void {
  const update = () => document.hidden ? clock.pause("visibility") : clock.resume("visibility");
  document.addEventListener("visibilitychange", update);
  update();
  return () => { document.removeEventListener("visibilitychange", update); clock.resume("visibility"); };
}
