// Access to the exported decomp binaries (INCBIN symbols) and constant C data
// (cdata). Packs/files are fetched asynchronously once, then read
// synchronously by ported code, the way the C code reads ROM data.

import { DATA_ROOT } from "../rom";

type IncbinIndex = { packs: Record<string, number>; symbols: Record<string, [string, number, number]> };

let index: IncbinIndex | undefined;
const packs = new Map<string, Uint8Array>();
const packLoads = new Map<string, Promise<void>>();
const cdataFiles = new Map<string, Record<string, { type: string | null; value: unknown }>>();
const cdataLoads = new Map<string, Promise<void>>();

export async function loadIncbinIndex(): Promise<void> {
  if (index) return;
  const response = await fetch(`${DATA_ROOT}/incbin/index.json`);
  index = await response.json();
}

function entry(symbol: string): [string, number, number] {
  if (!index) throw new Error("incbin index not loaded");
  const e = index.symbols[symbol];
  if (!e) throw new Error(`unknown INCBIN symbol ${symbol}`);
  return e;
}

export function hasIncbin(symbol: string): boolean {
  return !!index?.symbols[symbol];
}

export async function loadPack(name: string): Promise<void> {
  if (packs.has(name)) return;
  let p = packLoads.get(name);
  if (!p) {
    p = fetch(`${DATA_ROOT}/incbin/${name}.bin`).then(async (r) => {
      if (!r.ok) throw new Error(`missing incbin pack ${name}`);
      packs.set(name, new Uint8Array(await r.arrayBuffer()));
    });
    packLoads.set(name, p);
  }
  await p;
}

/** Make sure the packs holding these symbols are loaded. */
export async function preloadIncbin(symbols: string[]): Promise<void> {
  await loadIncbinIndex();
  const names = new Set<string>();
  for (const s of symbols) if (index!.symbols[s]) names.add(index!.symbols[s][0]);
  await Promise.all([...names].map(loadPack));
}

export async function preloadPacks(names: string[]): Promise<void> {
  await loadIncbinIndex();
  await Promise.all(names.map(loadPack));
}

/** The bytes of an INCBIN symbol (uncompressed). */
export function incbin(symbol: string): Uint8Array {
  const [pack, offset, size] = entry(symbol);
  const data = packs.get(pack);
  if (!data) throw new Error(`incbin pack ${pack} not loaded (for ${symbol})`);
  return data.subarray(offset, offset + size);
}

export function incbinSize(symbol: string): number {
  return entry(symbol)[2];
}

/** The data of an INCBIN symbol as u16 values (palettes, tilemaps). */
export function incbin16(symbol: string): Uint16Array {
  const bytes = incbin(symbol);
  const out = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
  return out;
}

// ---------------------------------------------------------------- cdata

export async function loadCData(...files: string[]): Promise<void> {
  await Promise.all(files.map((file) => {
    if (cdataFiles.has(file)) return Promise.resolve();
    let p = cdataLoads.get(file);
    if (!p) {
      p = fetch(`${DATA_ROOT}/cdata/${file}.json`).then(async (r) => {
        if (!r.ok) throw new Error(`missing cdata ${file}`);
        const json = await r.json();
        cdataFiles.set(file, json.defs);
      });
      cdataLoads.set(file, p);
    }
    return p;
  }));
}

/** A constant C definition from a decomp source file (e.g. cdata("battle_bg", "sBattleBgTemplates")). */
export function cdata<T = unknown>(file: string, name: string): T {
  const defs = cdataFiles.get(file);
  if (!defs) throw new Error(`cdata ${file} not loaded`);
  const def = defs[name];
  if (!def) throw new Error(`cdata ${file}:${name} not found`);
  return def.value as T;
}

export function hasCData(file: string, name: string): boolean {
  return !!cdataFiles.get(file)?.[name];
}

/** Find a definition in any loaded cdata file. */
export function cdataAny<T = unknown>(name: string): T | undefined {
  for (const defs of cdataFiles.values()) if (defs[name]) return defs[name].value as T;
  return undefined;
}

export function registerCData(file: string, defs: Record<string, { type: string | null; value: unknown }>): void {
  cdataFiles.set(file, defs);
}

export function registerIncbinIndex(idx: IncbinIndex): void {
  index = idx;
}

export function registerPack(name: string, data: Uint8Array): void {
  packs.set(name, data);
}

export type SymRef = { $sym: string; index?: number; offset?: number; expr?: string };

export function isSym(v: unknown): v is SymRef {
  return typeof v === "object" && v !== null && "$sym" in v;
}

export function symName(v: unknown): string | null {
  return isSym(v) ? v.$sym : null;
}
