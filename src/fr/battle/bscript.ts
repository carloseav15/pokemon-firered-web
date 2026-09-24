// Battle script bytecode (assembled from data/battle_scripts_*.s) and
// pointer resolution for script operands: RAM symbols (gBattleCommunication+1,
// sB_ANIM_TURN, ...) map into the emulated RAM, const tables (gStatUpStringIds,
// ...) map to data exported from the decomp.

import { DATA_ROOT } from "../rom";
import { cdataAny } from "../hw/assets";
import { ram, ramSymbols, ramView } from "./ram";
import { G, gBattleResources } from "./globals";

export const ROM_BASE = 0x08000000;
export const EXTERN_BASE = 0x0f000000;

type ScriptMeta = { labels: Record<string, number>; externals: string[]; externShift: number };

export const bs = {
  blob: new Uint8Array(0) as Uint8Array,
  view: new DataView(new ArrayBuffer(0)) as DataView,
  meta: { labels: {}, externals: [], externShift: 12 } as ScriptMeta,
  ai: new Uint8Array(0) as Uint8Array,
  aiView: new DataView(new ArrayBuffer(0)) as DataView,
  aiMeta: { labels: {}, externals: [], externShift: 12 } as ScriptMeta,
  anims: new Uint8Array(0) as Uint8Array,
  animsView: new DataView(new ArrayBuffer(0)) as DataView,
  animsMeta: { labels: {}, externals: [], externShift: 12 } as ScriptMeta,
};

async function fetchBin(path: string): Promise<Uint8Array> {
  const r = await fetch(`${DATA_ROOT}/${path}`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function loadBattleScripts(): Promise<void> {
  if (bs.blob.length) return;
  const [blob, meta, ai, aiMeta, anims, animsMeta] = await Promise.all([
    fetchBin("battle/scripts.bin"), fetch(`${DATA_ROOT}/battle/scripts.json`).then((r) => r.json()),
    fetchBin("battle/ai.bin"), fetch(`${DATA_ROOT}/battle/ai.json`).then((r) => r.json()),
    fetchBin("battle/anims.bin"), fetch(`${DATA_ROOT}/battle/anims.json`).then((r) => r.json()),
  ]);
  bs.blob = blob;
  bs.view = new DataView(blob.buffer);
  bs.meta = meta;
  bs.ai = ai;
  bs.aiView = new DataView(ai.buffer);
  bs.aiMeta = aiMeta;
  bs.anims = anims;
  bs.animsView = new DataView(anims.buffer);
  bs.animsMeta = animsMeta;
}

/** Address of a battle script label (BattleScript_*). */
export function BS(label: string): number {
  const off = bs.meta.labels[label];
  if (off === undefined) throw new Error(`unknown battle script ${label}`);
  return ROM_BASE + off;
}

export function AIS(label: string): number {
  const off = bs.aiMeta.labels[label];
  if (off === undefined) throw new Error(`unknown AI script ${label}`);
  return ROM_BASE + off;
}

export function ANIMS(label: string): number {
  const off = bs.animsMeta.labels[label];
  if (off === undefined) throw new Error(`unknown anim script ${label}`);
  return ROM_BASE + off;
}

// ---------------------------------------------------------------- script reads (T1_READ_*)

export function r8(addr: number): number {
  return bs.blob[addr - ROM_BASE];
}
export function r16(addr: number): number {
  const o = addr - ROM_BASE;
  return bs.blob[o] | (bs.blob[o + 1] << 8);
}
export function r32(addr: number): number {
  const o = addr - ROM_BASE;
  return (bs.blob[o] | (bs.blob[o + 1] << 8) | (bs.blob[o + 2] << 16) | (bs.blob[o + 3] << 24)) >>> 0;
}
/** T1_READ_PTR */
export const rptr = r32;

/** Read a pointer table in the battle script blob (e.g. gBattleScriptsForMoveEffects[i]). */
export function scriptTable(label: string, index: number): number {
  return r32(BS(label) + index * 4);
}

// ---------------------------------------------------------------- operand pointers

export type ResolvedPtr = { kind: "ram"; offset: number } | { kind: "table"; name: string; data: number[]; offset: number } | { kind: "script"; addr: number };

function externOf(ptr: number, meta: ScriptMeta): { name: string; addend: number } {
  const rel = ptr - EXTERN_BASE;
  return { name: meta.externals[rel >>> meta.externShift], addend: rel & ((1 << meta.externShift) - 1) };
}

/** RAM symbols the scripts address that are not declared through ram.ts directly. */
const RAM_ALIASES: Record<string, string> = {};

export function resolvePtr(ptr: number, meta: ScriptMeta = bs.meta): ResolvedPtr {
  if (ptr >= EXTERN_BASE) {
    const { name, addend } = externOf(ptr, meta);
    const sym = RAM_ALIASES[name] ?? name;
    const off = ramSymbols.get(sym);
    if (off !== undefined) return { kind: "ram", offset: off + addend };
    const table = cdataAny<number[]>(name);
    if (Array.isArray(table)) return { kind: "table", name, data: table, offset: addend };
    throw new Error(`unresolved battle script symbol ${name}+${addend}`);
  }
  return { kind: "script", addr: ptr };
}

export function memRead8(ptr: number): number {
  const p = resolvePtr(ptr);
  if (p.kind === "ram") return ram[p.offset];
  if (p.kind === "table") return byteOfTable(p.data, p.offset);
  return r8(p.addr);
}

export function memRead16(ptr: number): number {
  const p = resolvePtr(ptr);
  if (p.kind === "ram") return ramView.getUint16(p.offset, true);
  if (p.kind === "table") return p.data[p.offset >> 1] & 0xffff;
  return r16(p.addr);
}

export function memRead32(ptr: number): number {
  const p = resolvePtr(ptr);
  if (p.kind === "ram") return ramView.getUint32(p.offset, true);
  if (p.kind === "table") return p.data[p.offset >> 2] >>> 0;
  return r32(p.addr);
}

export function memWrite8(ptr: number, v: number): void {
  const p = resolvePtr(ptr);
  if (p.kind !== "ram") throw new Error("write to ROM");
  ram[p.offset] = v & 0xff;
}

export function memWrite16(ptr: number, v: number): void {
  const p = resolvePtr(ptr);
  if (p.kind !== "ram") throw new Error("write to ROM");
  ramView.setUint16(p.offset, v & 0xffff, true);
}

export function memWrite32(ptr: number, v: number): void {
  const p = resolvePtr(ptr);
  if (p.kind !== "ram") throw new Error("write to ROM");
  ramView.setUint32(p.offset, v >>> 0, true);
}

function byteOfTable(data: number[], offset: number): number {
  // Tables exported from cdata are u16 arrays in practice (StringIds).
  const v = data[offset >> 1] ?? 0;
  return offset & 1 ? (v >> 8) & 0xff : v & 0xff;
}

/** printfromtable: u16 string id table entry. */
export function tableU16(ptr: number, index: number): number {
  const p = resolvePtr(ptr);
  if (p.kind === "table") return p.data[(p.offset >> 1) + index] & 0xffff;
  if (p.kind === "ram") return ramView.getUint16(p.offset + index * 2, true);
  return r16(p.addr + index * 2);
}

// ---------------------------------------------------------------- script cursor stack

export function BattleScriptPush(ptr: number): void {
  const s = batStack();
  s.ptr[s.size++] = ptr;
}

export function BattleScriptPushCursor(): void {
  const s = batStack();
  s.ptr[s.size++] = G.gBattlescriptCurrInstr;
}

export function BattleScriptPop(): void {
  const s = batStack();
  G.gBattlescriptCurrInstr = s.ptr[--s.size];
}

function batStack(): { ptr: Uint32Array; size: number } {
  return gBattleResources.battleScriptsStack;
}
