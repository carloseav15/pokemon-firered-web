// random.c: the GBA linear congruential generator.

let seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;

export function random(): number {
  seed = (Math.imul(seed, 1103515245) + 24691) >>> 0;
  return seed >>> 16;
}

export function random32(): number {
  return ((random() << 16) | random()) >>> 0;
}

export function seedRng(value: number): void {
  seed = value >>> 0;
}
