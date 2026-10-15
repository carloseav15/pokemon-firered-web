export type SectorBounds = { x: number; y: number; width: number; height: number };
export type SectorResource = { bytes: number; dispose(): void };

/** Serial loads, latest viewport wins. No discarded request can repopulate a distant sector. */
export class SectorLoader {
  private readonly resident = new Map<string, SectorResource>();
  private wanted: string[] = [];
  private running: Promise<void> | null = null;
  private stopped = false;
  error = "";
  private retryAfter = 0;
  constructor(private readonly load: (id: string) => Promise<SectorResource>, private readonly changed: () => void = () => {}, private readonly now: () => number = () => performance.now()) {}
  get ids(): string[] { return [...this.resident.keys()]; }
  get bytes(): number { return [...this.resident.values()].reduce((sum, entry) => sum + entry.bytes, 0); }
  get pending(): number { return this.wanted.filter(id => !this.resident.has(id)).length; }
  update(ids: string[]): Promise<void> {
    this.wanted = [...new Set(ids)];
    for (const [id, entry] of this.resident) if (!this.wanted.includes(id)) {
      entry.dispose(); this.resident.delete(id);
    }
    if (!this.running && !this.stopped && this.now() >= this.retryAfter) this.running = this.pump().finally(() => { this.running = null; });
    return this.running ?? Promise.resolve();
  }
  private async pump(): Promise<void> {
    while (!this.stopped) {
      const id = this.wanted.find(id => !this.resident.has(id));
      if (!id) break;
      try {
        const entry = await this.load(id);
        if (this.stopped || !this.wanted.includes(id)) entry.dispose();
        else this.resident.set(id, entry);
        this.error = "";
      } catch (error) {
        this.error = `No se pudo cargar ${id}: ${String(error)}`;
        this.retryAfter = this.now() + 1000;
        this.changed();
        break; // Back off repeated viewport updates after a network/decoding failure.
      }
      this.changed();
      // Let input/paint run between map builds.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }
  dispose(): void {
    this.stopped = true;
    for (const entry of this.resident.values()) entry.dispose();
    this.resident.clear(); this.wanted = [];
  }
  /** Wait for a discarded asynchronous load to release its resources before replacing the world. */
  async settled(): Promise<void> { await this.running; }
}

export function nearbySectors(maps: Record<string, SectorBounds>, view: SectorBounds, margin = 256): string[] {
  const cx = view.x + view.width / 2, cy = view.y + view.height / 2;
  return Object.entries(maps).filter(([, m]) => m.x < view.x + view.width + margin && m.y < view.y + view.height + margin
    && m.x + m.width > view.x - margin && m.y + m.height > view.y - margin)
    .sort(([, a], [, b]) => Math.hypot(a.x + a.width / 2 - cx, a.y + a.height / 2 - cy)
      - Math.hypot(b.x + b.width / 2 - cx, b.y + b.height / 2 - cy)).map(([id]) => id);
}
