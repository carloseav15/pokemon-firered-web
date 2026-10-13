// cable_car_util.c: tilemap fill/copy helpers that wrap around a 32×32 map.
// FireRed keeps the file from RS but nothing calls these static helpers.

export function CableCarUtil_FillWrapped(dest: Uint16Array, value: number, left: number, top: number, width: number, height: number): void {
  let y = top & 0xff;
  for (let i = 0; i < height; i++) {
    let x = left & 0xff;
    for (let j = 0; j < width; j++) {
      dest[y * 32 + x] = value & 0xffff;
      x = (x + 1) % 32;
    }
    y = (y + 1) % 32;
  }
}

export function CableCarUtil_CopyWrapped(dest: Uint16Array, src: ArrayLike<number>, left: number, top: number, width: number, height: number): void {
  let s = 0;
  let y = top & 0xff;
  for (let i = 0; i < height; i++) {
    let x = left & 0xff;
    for (let j = 0; j < width; j++) {
      dest[y * 32 + x] = src[s++]! & 0xffff;
      x = (x + 1) % 32;
    }
    y = (y + 1) % 32;
  }
}
