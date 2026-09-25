// Shared glue for the battle_anim_*.c ports: C globals as short aliases, the
// contest check (no contests in FireRed's battle engine), SE panning and
// template lookup for sprites that the C code creates directly with
// CreateSprite(&gSomeTemplate, ...).

import { sound } from "../../audio/sound";
import { tasks } from "../../gba/tasks";
import { cdataAny } from "../../hw/assets";
import { templateFrom, type CSpriteTemplate } from "../../hw/cdataSprite";
import type { SpriteTemplate } from "../../hw/sprite";
import { ANIM_SPRITE_CALLBACKS } from "../animRegistry";

export { gBattleAnimArgs } from "../animArgs";
export const gTasks = tasks.tasks;

/** battle_anim.c IsContest: FRLG never runs contest animations. */
export function IsContest(): boolean {
  return false;
}

/** sound.c PlaySE12WithPanning / PlaySE1WithPanning / PlaySE2WithPanning. */
export function PlaySE12WithPanning(song: number, pan: number): void {
  sound.playSEWithPanning(song, pan);
}
export const PlaySE1WithPanning = PlaySE12WithPanning;
export const PlaySE2WithPanning = PlaySE12WithPanning;

export function PlaySE(song: number): void {
  sound.playSE(song);
}

const templates = new Map<string, SpriteTemplate>();

/** A C `const struct SpriteTemplate` by symbol, with callbacks resolved through the anim registry. */
export function animTemplate(name: string): SpriteTemplate {
  let t = templates.get(name);
  if (!t) {
    const source = cdataAny<CSpriteTemplate>(name);
    if (!source) throw new Error(`battle anim sprite template not loaded: ${name}`);
    t = templateFrom(source, ANIM_SPRITE_CALLBACKS);
    templates.set(name, t);
  }
  return t;
}

/** s16 wraparound for task data (gTasks[].data is s16 in the C). */
export function s16(v: number): number {
  return (v << 16) >> 16;
}
