export class WorldGrid {
  readonly width: number;
  readonly height: number;
  readonly minX: number;
  readonly minY: number;

  readonly solid: Uint8Array;
  readonly water: Uint8Array;
  readonly ledge: Uint8Array;
  readonly grass: Uint8Array;
  readonly sand: Uint8Array;
  readonly npc: Uint8Array;
  readonly behaviors: Uint8Array;
  readonly elevations: Uint8Array;
  readonly metatiles: Int16Array;

  private readonly sectors = new Map<string, WorldGrid>();

  constructor(width: number, height: number, minX: number, minY: number, private readonly sectorMode = false) {
    this.width = width;
    this.height = height;
    this.minX = minX;
    this.minY = minY;

    const size = sectorMode ? 0 : width * height;
    this.solid = new Uint8Array(size).fill(1); // por defecto vacío = sólido
    this.water = new Uint8Array(size);
    this.ledge = new Uint8Array(size);
    this.grass = new Uint8Array(size);
    this.sand = new Uint8Array(size);
    this.npc = new Uint8Array(size);
    this.behaviors = new Uint8Array(size);
    this.elevations = new Uint8Array(size);
    this.metatiles = new Int16Array(size).fill(-1);
  }

  /** Sparse exterior world: only resident map grids own collision/behavior buffers. */
  addSector(id: string, grid: WorldGrid): void { this.sectors.set(id, grid); }
  removeSector(id: string): void { this.sectors.delete(id); }
  get retainedBytes(): number {
    return this.solid.byteLength + this.water.byteLength + this.ledge.byteLength + this.grass.byteLength
      + this.sand.byteLength + this.npc.byteLength + this.behaviors.byteLength + this.elevations.byteLength + this.metatiles.byteLength
      + [...this.sectors.values()].reduce((sum, grid) => sum + grid.retainedBytes, 0);
  }
  private sectorAt(gx: number, gy: number): WorldGrid | undefined {
    for (const grid of this.sectors.values()) if (grid.inBounds(gx, gy)) return grid;
    return undefined;
  }
  isLoaded(gx: number, gy: number): boolean {
    return this.sectorMode ? !!this.sectorAt(gx, gy) : this.inBounds(gx, gy);
  }
  behaviorAt(gx: number, gy: number): number {
    if (this.sectorMode) return this.sectorAt(gx, gy)?.behaviorAt(gx, gy) ?? 0;
    return this.inBounds(gx, gy) ? this.behaviors[this.idx(gx, gy)]! : 0;
  }

  /** MapGridGetElevationAt: 0 is neutral, 15 preserves the actor's previous elevation. */
  elevationAt(gx: number, gy: number): number {
    if (this.sectorMode) return this.sectorAt(gx, gy)?.elevationAt(gx, gy) ?? 15;
    return this.inBounds(gx, gy) ? this.elevations[this.idx(gx, gy)]! : 15;
  }

  inBounds(gx: number, gy: number): boolean {
    const lx = gx - this.minX;
    const ly = gy - this.minY;
    return lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
  }

  idx(gx: number, gy: number): number {
    const lx = gx - this.minX;
    const ly = gy - this.minY;
    return ly * this.width + lx;
  }

  isWaterTile(gx: number, gy: number): boolean {
    if (this.sectorMode) return this.sectorAt(gx, gy)?.isWaterTile(gx, gy) ?? false;
    if (!this.inBounds(gx, gy)) return false;
    return this.water[this.idx(gx, gy)] === 1;
  }

  isGrassTile(gx: number, gy: number): boolean {
    if (this.sectorMode) return this.sectorAt(gx, gy)?.isGrassTile(gx, gy) ?? false;
    if (!this.inBounds(gx, gy)) return false;
    return this.grass[this.idx(gx, gy)] === 1;
  }

  isSandTile(gx: number, gy: number): boolean {
    if (this.sectorMode) return this.sectorAt(gx, gy)?.isSandTile(gx, gy) ?? false;
    if (!this.inBounds(gx, gy)) return false;
    return this.sand[this.idx(gx, gy)] === 1;
  }

  ledgeDirection(gx: number, gy: number): number {
    if (this.sectorMode) return this.sectorAt(gx, gy)?.ledgeDirection(gx, gy) ?? 0;
    if (!this.inBounds(gx, gy)) return 0;
    return this.ledge[this.idx(gx, gy)]!;
  }

  isWalkable(gx: number, gy: number, mode: "walk" | "bike" | "surf"): boolean {
    if (this.sectorMode) return this.sectorAt(gx, gy)?.isWalkable(gx, gy, mode) ?? false;
    if (!this.inBounds(gx, gy)) return false;
    const i = this.idx(gx, gy);
    if (this.npc[i] === 1) return false;
    const solid = this.solid[i] === 1;
    const water = this.water[i] === 1;

    if (mode === "surf") {
      return water || !solid;
    }
    return !solid && !water;
  }

  getMetatile(gx: number, gy: number): number {
    if (this.sectorMode) return this.sectorAt(gx, gy)?.getMetatile(gx, gy) ?? -1;
    if (!this.inBounds(gx, gy)) return -1;
    return this.metatiles[this.idx(gx, gy)]!;
  }
}
