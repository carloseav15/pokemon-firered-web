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

// ADAPTATION (Hoenn, DATA_ROOT "/emerald"): the FireRed engine draws its own interface (message
// and menu frames, shop, battle backgrounds...). Symbols the Emerald export lacks resolve to the
// FireRed export instead of failing; each one is recorded in incbinFallbacks so the borrowed
// FireRed presentation stays identifiable. Emerald symbols always win when both exist.
const FALLBACK_PREFIX = "fr:";
const EMERALD_PREFIX = "em:";
export const incbinFallbacks = new Set<string>();
let fallbackIndex: IncbinIndex | undefined;

export async function loadIncbinIndex(): Promise<void> {
  if (index) return;
  const root = DATA_ROOT === "/hns" ? "/fr" : DATA_ROOT;
  const [own, fallback] = await Promise.all([
    fetch(`${root}/incbin/index.json`).then(r => r.json() as Promise<IncbinIndex>),
    DATA_ROOT === "/emerald" ? fetch("/fr/incbin/index.json").then(r => r.json() as Promise<IncbinIndex>) : undefined,
  ]);
  fallbackIndex = fallback;
  index = own;
}

function fallbackEntry(symbol: string): [string, number, number] | undefined {
  const e = fallbackIndex?.symbols[symbol];
  return e && [FALLBACK_PREFIX + e[0], e[1], e[2]];
}

function entry(symbol: string): [string, number, number] {
  if (!index) throw new Error("incbin index not loaded");
  const e = index.symbols[symbol];
  if (e) return e;
  const f = fallbackEntry(symbol);
  if (!f) throw new Error(`unknown INCBIN symbol ${symbol}`);
  incbinFallbacks.add(symbol);
  return f;
}

export function hasIncbin(symbol: string): boolean {
  return !!index?.symbols[symbol] || !!fallbackIndex?.symbols[symbol];
}

export async function loadPack(name: string): Promise<void> {
  if (packs.has(name)) return;
  let p = packLoads.get(name);
  if (!p) {
    const fallback = name.startsWith(FALLBACK_PREFIX);
    const root = fallback ? "/fr" : DATA_ROOT === "/hns" ? "/fr" : DATA_ROOT;
    const file = fallback ? name.slice(FALLBACK_PREFIX.length) : name;
    p = fetch(`${root}/incbin/${file}.bin`).then(async (r) => {
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
  for (const s of symbols) {
    const e = index!.symbols[s] ?? fallbackEntry(s);
    if (e) names.add(e[0]);
  }
  await Promise.all([...names].map(loadPack));
}

/** Load packs by name. With a FireRed fallback index, the FireRed pack of the same name loads too
 * (or alone, if the Emerald export lacks it), so its fallback symbols are readable synchronously. */
export async function preloadPacks(names: string[]): Promise<void> {
  await loadIncbinIndex();
  await Promise.all(names.flatMap(name => {
    const own = name in index!.packs, fallback = !!fallbackIndex && name in fallbackIndex.packs;
    return [own || !fallback ? loadPack(name) : undefined, fallback ? loadPack(FALLBACK_PREFIX + name) : undefined];
  }));
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

// ADAPTATION (Hoenn): C data of the FireRed engine's own modules. With Emerald content these keep
// FireRed's data: the shop screens (pokeemerald's files of the same name describe a different screen),
// the battle engine (battle_*.c, pokeball.c) and pokemon.c, whose sprite templates belong to that
// engine (its shared tables, e.g. sHoennToNationalOrder and gStatStageRatios, hold the same values in
// both games). Every name read this way is recorded in cdataFallbacks.
const FIRERED_UI_CDATA = new Set(["shop", "buy_menu_helpers", "pokemon", "pokeball"]);
/** The FireRed battle engine's C data (battle_*.c), except battle_bg, whose environment table is pokeemerald's (bg.ts). */
const isFireRedEngineCData = (file: string): boolean => FIRERED_UI_CDATA.has(file) || (file.startsWith("battle_") && file !== "battle_bg");
export const cdataFallbacks = new Set<string>();
const fallbackCDataFiles = new Set<string>();

export async function loadCData(...files: string[]): Promise<void> {
  await Promise.all(files.map((file) => {
    if (cdataFiles.has(file)) return Promise.resolve();
    let p = cdataLoads.get(file);
    if (!p) {
      // "fr:<file>" names the FireRed file explicitly, next to another game's file of the same name.
      const explicitFr = file.startsWith(FALLBACK_PREFIX);
      // "em:<file>" names pokeemerald's file next to the FireRed engine's file of the same name (battle_setup).
      const explicitEm = file.startsWith(EMERALD_PREFIX);
      const root = explicitFr ? "/fr" : explicitEm ? "/emerald" : DATA_ROOT === "/hns" ? "/emerald" : DATA_ROOT === "/emerald" && isFireRedEngineCData(file) ? "/fr" : DATA_ROOT;
      if (root !== DATA_ROOT && DATA_ROOT === "/emerald") fallbackCDataFiles.add(file);
      // A dev server answers a missing file with its HTML page (200): that is a missing file too.
      const found = (r: Response) => r.ok && !(r.headers.get("content-type") ?? "").includes("text/html");
      p = fetch(`${root}/cdata/${explicitFr ? file.slice(FALLBACK_PREFIX.length) : explicitEm ? file.slice(EMERALD_PREFIX.length) : file}.json`).then(async (r) => {
        if (!found(r)) {
          if (root !== "/fr" && !explicitEm) {
            const fallback = await fetch(`/fr/cdata/${file}.json`);
            if (found(fallback)) {
              const json = await fallback.json();
              if (DATA_ROOT === "/emerald") fallbackCDataFiles.add(file);
              cdataFiles.set(file, json.defs);
              return;
            }
          }
          throw new Error(`missing cdata ${file}`);
        }
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
  if (fallbackCDataFiles.has(file)) cdataFallbacks.add(`${file}:${name}`);
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
