import { readFileSync, existsSync } from "node:fs";
import { rom } from "../../src/fr/rom.ts";

const constsPath = process.cwd() + "/public/fr/constants.json";
if (existsSync(constsPath) && !rom.constants) {
  rom.constants = JSON.parse(readFileSync(constsPath, "utf8"));
}

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

if (typeof (globalThis as any).Image === 'undefined') {
  (globalThis as any).Image = class Image {
    width = 16;
    height = 16;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_val: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  };
}
