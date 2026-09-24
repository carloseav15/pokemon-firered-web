// Emulated EWRAM for the battle globals that the battle scripts address by
// pointer (e.g. `jumpifbyte CMP_EQUAL, gBattleCommunication + 1, ...`), plus
// byte-backed structs that the C code copies with memcpy (BattlePokemon).

export const RAM_BASE = 0x02000000;
export const ram = new Uint8Array(0x1000);
export const ramView = new DataView(ram.buffer);

type Kind = "u8" | "s8" | "u16" | "s16" | "u32" | "s32";
const SIZES: Record<Kind, number> = { u8: 1, s8: 1, u16: 2, s16: 2, u32: 4, s32: 4 };

let next = 0;
/** symbol name -> offset in `ram` */
export const ramSymbols = new Map<string, number>();

export function alloc(name: string, size: number, align = 4): number {
  next = (next + align - 1) & ~(align - 1);
  const offset = next;
  next += size;
  if (next > ram.length) throw new Error("battle RAM exhausted");
  ramSymbols.set(name, offset);
  return offset;
}

export function read(kind: Kind, offset: number): number {
  switch (kind) {
    case "u8": return ram[offset];
    case "s8": return ramView.getInt8(offset);
    case "u16": return ramView.getUint16(offset, true);
    case "s16": return ramView.getInt16(offset, true);
    case "u32": return ramView.getUint32(offset, true);
    case "s32": return ramView.getInt32(offset, true);
  }
}

export function write(kind: Kind, offset: number, value: number): void {
  switch (kind) {
    case "u8": case "s8": ram[offset] = value & 0xff; break;
    case "u16": case "s16": ramView.setUint16(offset, value & 0xffff, true); break;
    case "u32": case "s32": ramView.setUint32(offset, value >>> 0, true); break;
  }
}

/** Define scalar RAM globals on `target` as accessor properties. */
export function defineScalars<T extends object>(target: T, defs: Record<string, Kind>): void {
  for (const [name, kind] of Object.entries(defs)) {
    const offset = alloc(name, SIZES[kind], SIZES[kind]);
    Object.defineProperty(target, name, {
      get: () => read(kind, offset),
      set: (v: number) => write(kind, offset, v),
      enumerable: true,
    });
  }
}

export function allocU8Array(name: string, count: number): Uint8Array {
  const offset = alloc(name, count, 4);
  return ram.subarray(offset, offset + count);
}

export function allocU16Array(name: string, count: number): Uint16Array {
  const offset = alloc(name, count * 2, 4);
  return new Uint16Array(ram.buffer, offset, count);
}

// ---------------------------------------------------------------- byte structs

export type FieldKind = Kind | { bits: [Kind, number, number] };

/**
 * A struct view over bytes. Fields are [offset, kind] or bitfields
 * [offset, container kind, bit, width].
 */
export class ByteStruct {
  readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  protected u8(o: number): number { return this.bytes[o]; }
  protected s8(o: number): number { return this.view.getInt8(o); }
  protected u16(o: number): number { return this.view.getUint16(o, true); }
  protected s16(o: number): number { return this.view.getInt16(o, true); }
  protected u32(o: number): number { return this.view.getUint32(o, true); }
  protected set8(o: number, v: number): void { this.bytes[o] = v & 0xff; }
  protected set16(o: number, v: number): void { this.view.setUint16(o, v & 0xffff, true); }
  protected set32(o: number, v: number): void { this.view.setUint32(o, v >>> 0, true); }
  protected bits(o: number, bit: number, width: number): number {
    return (this.view.getUint32(o, true) >>> bit) & ((1 << width) - 1);
  }
  protected setBits(o: number, bit: number, width: number, v: number): void {
    const mask = ((1 << width) - 1) << bit;
    this.view.setUint32(o, ((this.view.getUint32(o, true) & ~mask) | ((v << bit) & mask)) >>> 0, true);
  }

  /** Bitfield access that never reads past the end of the struct. */
  protected getBitsAt(o: number, shift: number, width: number): number {
    let v = 0;
    const n = Math.min(4, this.bytes.length - o);
    for (let i = 0; i < n; i++) v |= this.bytes[o + i] << (8 * i);
    return (v >>> shift) & (width >= 32 ? 0xffffffff : (1 << width) - 1);
  }

  protected setBitsAt(o: number, shift: number, width: number, value: number): void {
    const n = Math.min(4, this.bytes.length - o);
    let v = 0;
    for (let i = 0; i < n; i++) v |= this.bytes[o + i] << (8 * i);
    const mask = (width >= 32 ? 0xffffffff : ((1 << width) - 1)) << shift;
    v = (v & ~mask) | ((value << shift) & mask);
    for (let i = 0; i < n; i++) this.bytes[o + i] = (v >>> (8 * i)) & 0xff;
  }

  copyFrom(src: ByteStruct | Uint8Array): void {
    this.bytes.set(src instanceof ByteStruct ? src.bytes : src.subarray(0, this.bytes.length));
  }

  clear(): void {
    this.bytes.fill(0);
  }
}

