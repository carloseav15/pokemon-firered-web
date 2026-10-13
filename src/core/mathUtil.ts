// math_util.c: fixed-point arithmetic helpers.

const s16 = (value: number): number => (value << 16) >> 16;
const s32 = (value: number): number => value | 0;
const asS64 = (value: number): bigint => BigInt(s32(value));

export function Q_8_8_mul(x: number, y: number): number {
  return s16(Math.trunc((s16(x) * s16(y)) / 0x100));
}

export function Q_N_S_mul(s: number, x: number, y: number): number {
  return s16(Math.trunc((s16(x) * s16(y)) / (2 ** (s & 0xff))));
}

export function Q_24_8_mul(x: number, y: number): number {
  const product = asS64(x) * asS64(y);
  return s32(Number(product / 0x100n));
}

export function Q_8_8_div(x: number, y: number): number {
  y = s16(y);
  return y === 0 ? 0 : s16(Math.trunc((s16(x) << 8) / y));
}

export function Q_N_S_div(s: number, x: number, y: number): number {
  y = s16(y);
  return y === 0 ? 0 : s16(Math.trunc(((s16(x) << (s & 31)) | 0) / y));
}

export function Q_24_8_div(x: number, y: number): number {
  const divisor = asS64(y);
  if (divisor === 0n) return 0;
  return s32(Number((asS64(x) * 0x100n) / divisor));
}

export function Q_8_8_inv(y: number): number {
  return s16(Math.trunc(0x10000 / s16(y)));
}

export function Q_N_S_inv(s: number, y: number): number {
  return s16(Math.trunc((0x100 << (s & 31)) / s16(y)));
}

export function Q_24_8_inv(y: number): number {
  return s32(Math.trunc(0x10000 / s32(y)));
}
