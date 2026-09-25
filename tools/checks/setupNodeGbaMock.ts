// Polyfill minimal browser globals needed by GBA HW in Node.js headless checks

if (typeof (globalThis as any).ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  };
}

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}
