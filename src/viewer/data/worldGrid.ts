export class WorldGrid {
  readonly width: number;
  readonly height: number;
  readonly minX: number;
  readonly minY: number;

  readonly solid: Uint8Array;
  readonly water: Uint8Array;
  readonly ledge: Uint8Array;
  readonly grass: Uint8Array;
  readonly npc: Uint8Array;
  readonly metatiles: Int16Array;

  constructor(width: number, height: number, minX: number, minY: number) {
    this.width = width;
    this.height = height;
    this.minX = minX;
    this.minY = minY;

    const size = width * height;
    this.solid = new Uint8Array(size).fill(1); // por defecto vacío = sólido
    this.water = new Uint8Array(size);
    this.ledge = new Uint8Array(size);
    this.grass = new Uint8Array(size);
    this.npc = new Uint8Array(size);
    this.metatiles = new Int16Array(size).fill(-1);
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
    if (!this.inBounds(gx, gy)) return false;
    return this.water[this.idx(gx, gy)] === 1;
  }

  isGrassTile(gx: number, gy: number): boolean {
    if (!this.inBounds(gx, gy)) return false;
    return this.grass[this.idx(gx, gy)] === 1;
  }

  ledgeDirection(gx: number, gy: number): number {
    if (!this.inBounds(gx, gy)) return 0;
    return this.ledge[this.idx(gx, gy)]!;
  }

  isWalkable(gx: number, gy: number, mode: "walk" | "bike" | "surf"): boolean {
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
    if (!this.inBounds(gx, gy)) return -1;
    return this.metatiles[this.idx(gx, gy)]!;
  }
}
