import { readFileSync, existsSync } from "node:fs";
import { rom } from "../../src/core/rom.ts";

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

if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement(tag: string) {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0, style: {},
          getContext: () => ({
            fillRect() {}, clearRect() {}, drawImage() {},
            createImageData: (w: number, h: number) => new (globalThis as any).ImageData(w, h),
            getImageData: () => ({ data: new Uint8ClampedArray(256 * 256 * 4) }),
            putImageData() {},
          }),
        };
      }
      return { style: {}, append() {}, remove() {} };
    },
    body: { append() {}, remove() {} },
    getElementById: () => null,
  };
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

const origFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.pathname : String(input?.url ?? input);
  if (urlStr.startsWith('/')) {
    const filePath = process.cwd() + '/public' + urlStr;
    if (existsSync(filePath)) {
      const content = readFileSync(filePath);
      return new Response(content, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return origFetch ? origFetch(input, init) : new Response('', { status: 404 });
}) as typeof fetch;
