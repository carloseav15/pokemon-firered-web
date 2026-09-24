// trig.c: sine tables (filled from the decomp data at startup).

import { cdata, loadCData } from "./assets";

export let gSineTable: Int16Array = new Int16Array(320);
export let gSineDegreeTable: Int16Array = new Int16Array(180);

export function initTrig(): void {
  gSineTable = Int16Array.from(cdata<number[]>("trig", "gSineTable"));
  gSineDegreeTable = Int16Array.from(cdata<number[]>("trig", "gSineDegreeTable"));
}

export async function loadTrig(): Promise<void> {
  await loadCData("trig");
  initTrig();
}

const s16 = (v: number) => (v << 16) >> 16;

export function Sin(index: number, amplitude: number): number {
  return s16((amplitude * gSineTable[index]) >> 8);
}

export function Cos(index: number, amplitude: number): number {
  return s16((amplitude * gSineTable[index + 64]) >> 8);
}

export function Sin2(angle: number): number {
  angle &= 0xffff;
  const value = gSineDegreeTable[angle % 180];
  return ((angle / 180) | 0) & 1 ? -value : value;
}

export function Cos2(angle: number): number {
  return Sin2(angle + 90);
}

/** BIOS ArcTan (SWI 0x09): polynomial approximation, i is a 1.14 fixed-point tangent. */
function biosArcTan(i: number): number {
  const a = -(Math.imul(i, i) >> 14);
  let b = (Math.imul(0xa9, a) >> 14) + 0x390;
  b = (Math.imul(b, a) >> 14) + 0x91c;
  b = (Math.imul(b, a) >> 14) + 0xfb6;
  b = (Math.imul(b, a) >> 14) + 0x16aa;
  b = (Math.imul(b, a) >> 14) + 0x2081;
  b = (Math.imul(b, a) >> 14) + 0x3651;
  b = (Math.imul(b, a) >> 14) + 0xa2f9;
  return Math.imul(i, b) >> 16;
}

/** BIOS ArcTan2 (SWI 0x0A): angle of (x, y) in 0..0xFFFF. */
export function ArcTan2(x: number, y: number): number {
  x = (x << 16) >> 16;
  y = (y << 16) >> 16;
  const div = (n: number, d: number) => Math.trunc(n / d);
  let r: number;
  if (!y) r = x >= 0 ? 0 : 0x8000;
  else if (!x) r = y >= 0 ? 0x4000 : 0xc000;
  else if (y >= 0) {
    if (x >= 0) r = x >= y ? biosArcTan(div(y << 14, x)) : 0x4000 - biosArcTan(div(x << 14, y));
    else r = -x >= y ? biosArcTan(div(y << 14, x)) + 0x8000 : 0x4000 - biosArcTan(div(x << 14, y));
  } else if (x <= 0) {
    r = -x > -y ? biosArcTan(div(y << 14, x)) + 0x8000 : 0xc000 - biosArcTan(div(x << 14, y));
  } else {
    r = x >= -y ? biosArcTan(div(y << 14, x)) + 0x10000 : 0xc000 - biosArcTan(div(x << 14, y));
  }
  return r & 0xffff;
}
