// Name → function tables for battle animation scripts. The assembled scripts
// (data/battle_anim_scripts.s) reference sprite templates, visual tasks and
// sound tasks by symbol; each ported battle_anim_*.c module registers its
// SpriteCB/AnimTask functions here under the C name, so `createsprite` can
// resolve a template's callback and `createvisualtask` its task function.

import type { SpriteCallback } from "../hw/sprite";

export type AnimTaskFunc = (taskId: number) => void;

export const ANIM_SPRITE_CALLBACKS: Record<string, SpriteCallback> = {};
export const ANIM_TASK_FUNCS: Record<string, AnimTaskFunc> = {};

export function registerAnimSpriteCallbacks(callbacks: Record<string, SpriteCallback>): void {
  Object.assign(ANIM_SPRITE_CALLBACKS, callbacks);
}

export function registerAnimTasks(funcs: Record<string, AnimTaskFunc>): void {
  Object.assign(ANIM_TASK_FUNCS, funcs);
}
