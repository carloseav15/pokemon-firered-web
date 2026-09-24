// Converters from exported C initializers (cdata) to the sprite engine's structures:
// OamData, AnimCmd tables, AffineAnimCmd tables, SpriteTemplate and simple $expr values.

import { cdataAny, isSym, symName, type SymRef } from "./assets";
import {
  AFFINEANIMCMD_END, AFFINEANIMCMD_END_ALT, AFFINEANIMCMD_FRAME, AFFINEANIMCMD_JUMP, AFFINEANIMCMD_LOOP, ANIMCMD_END, ANIMCMD_FRAME, ANIMCMD_JUMP,
  ANIMCMD_LOOP, gDummySpriteAffineAnimTable, gDummySpriteAnimTable, oamData, SpriteCallbackDummy,
  type AffineAnimCmd, type AnimCmd, type OamData, type SpriteCallback, type SpriteFrameImage, type SpriteTemplate,
} from "./sprite";

type CAnimCmd = { frame?: { imageValue: number; duration: number; hFlip?: number; vFlip?: number }; loop?: { count: number }; jump?: { target: number }; type?: number };
type CAffineCmd = {
  frame?: { xScale: number; yScale: number; rotation: number; duration: number };
  loop?: { count: number }; jump?: { target: number }; end?: { val?: number }; type?: number;
};
export type CSpriteTemplate = {
  tileTag: number; paletteTag: number; oam: SymRef | 0; anims: SymRef | 0; images: SymRef | 0; affineAnims: SymRef | 0; callback: SymRef | 0;
};

/** Evaluates a constant C expression exported as {$expr} (integer semantics for the common cases). */
export function cexpr(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "$expr" in v) {
    const src = String((v as { $expr: string }).$expr);
    // Only constant arithmetic is expected here.
    if (!/^[\d\s()+\-*/%<>|&?:~^xa-fA-F]*$/.test(src)) throw new Error(`cexpr: unsupported ${src}`);
    const val = Function(`"use strict"; return (${src});`)() as number;
    return Math.trunc(val);
  }
  return 0;
}

function resolve<T>(ref: unknown): T | undefined {
  const name = symName(ref);
  return name ? cdataAny<T>(name) : undefined;
}

export function oamFrom(ref: unknown): OamData {
  const o = isSym(ref) ? resolve<Partial<OamData>>(ref) : (ref as Partial<OamData>);
  return oamData(o ?? {});
}

function animCmd(c: CAnimCmd): AnimCmd {
  if (c.frame) return ANIMCMD_FRAME(c.frame.imageValue, c.frame.duration, c.frame.hFlip ?? 0, c.frame.vFlip ?? 0);
  if (c.loop) return ANIMCMD_LOOP(c.loop.count);
  if (c.jump) return ANIMCMD_JUMP(c.jump.target);
  return ANIMCMD_END;
}

function affineCmd(c: CAffineCmd): AffineAnimCmd {
  if (c.frame) return AFFINEANIMCMD_FRAME(c.frame.xScale, c.frame.yScale, c.frame.rotation, c.frame.duration);
  if (c.loop) return AFFINEANIMCMD_LOOP(c.loop.count);
  if (c.jump) return AFFINEANIMCMD_JUMP(c.jump.target);
  if (c.end?.val) return AFFINEANIMCMD_END_ALT(c.end.val);
  return AFFINEANIMCMD_END;
}

export function animFrom(ref: unknown): AnimCmd[] {
  const cmds = isSym(ref) ? resolve<CAnimCmd[]>(ref) : (ref as CAnimCmd[]);
  return (cmds ?? [{}]).map(animCmd);
}

export function animsFrom(ref: unknown): AnimCmd[][] {
  if (!ref) return gDummySpriteAnimTable;
  const name = symName(ref);
  if (name === "gDummySpriteAnimTable") return gDummySpriteAnimTable;
  const table = resolve<unknown[]>(ref);
  if (!table) return gDummySpriteAnimTable;
  return table.map(animFrom);
}

export function affineAnimFrom(ref: unknown): AffineAnimCmd[] {
  const cmds = isSym(ref) ? resolve<CAffineCmd[]>(ref) : (ref as CAffineCmd[]);
  return (cmds ?? [{}]).map(affineCmd);
}

export function affineAnimsFrom(ref: unknown): AffineAnimCmd[][] {
  if (!ref) return gDummySpriteAffineAnimTable;
  const name = symName(ref);
  if (name === "gDummySpriteAffineAnimTable") return gDummySpriteAffineAnimTable;
  const table = resolve<unknown[]>(ref);
  if (!table) return gDummySpriteAffineAnimTable;
  return table.map(affineAnimFrom);
}

/**
 * Builds a SpriteTemplate from a C SpriteTemplate initializer. Callbacks are looked up by
 * symbol name in `callbacks`; unknown ones become SpriteCallbackDummy.
 */
export function templateFrom(t: CSpriteTemplate, callbacks: Record<string, SpriteCallback> = {}, images: SpriteFrameImage[] | null = null): SpriteTemplate {
  const cb = symName(t.callback);
  return {
    tileTag: t.tileTag,
    paletteTag: t.paletteTag,
    oam: oamFrom(t.oam),
    anims: animsFrom(t.anims),
    images,
    affineAnims: affineAnimsFrom(t.affineAnims),
    callback: (cb && callbacks[cb]) || SpriteCallbackDummy,
  };
}
