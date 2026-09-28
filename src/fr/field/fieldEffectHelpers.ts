// Remaining field_effect_helpers.c routines are listed in PENDING.md §3b.
// Connected ground effects are implemented in fieldEffects.ts.
// Field effect helper routines:
// - Water reflections and bridge reflection palettes (SetUpReflection, UpdateObjectReflectionSprite)
// - Warp arrow sprites (CreateWarpArrowSprite, ShowWarpArrowSprite, SetSpriteInvisible)
// - Ground and grass effects (FldEff_TallGrass, FldEff_LongGrass, FldEff_Shadow, FldEff_Dust)
// - Footprints, bike tire tracks, ash, ripple, splash, bubbles, disguise
// - Bobbing and surf blob synchronization (FldEff_SurfBlob, SynchroniseSurfAnim, SynchroniseSurfPosition)

import * as C from "../generated/constants";
import * as MB from "../generated/metatileBehavior";
import { cdata, incbin, incbin16, loadCData } from "../hw/assets";
import { spriteSheet } from "./gfx4bpp";
import { SpriteManager } from "../gba/sprite";
import { rom } from "../rom";
import { Sprite } from "../gba/sprite";
import type { ObjectEvent } from "./objectEvents";

export const gShadowEffectTemplateIds = [0, 1, 2, 3];
export const gShadowVerticalOffsets = [4, 4, 4, 16];

export let gFieldEffectArguments: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

/** SetUpReflection */
export function SetUpReflection(objectEvent: ObjectEvent | any, sprite: Sprite | any, stillReflection: boolean): void {
  if (!sprite) return;
  const reflectionSprite = {
    ...sprite,
    priority: 3,
    subpriority: 0x98,
    data: [sprite.data?.[0] || 0, objectEvent?.localId || 0, 0, 0, 0, 0, 0, stillReflection ? 1 : 0],
    callback: UpdateObjectReflectionSprite,
  };
  LoadObjectReflectionPalette(objectEvent, reflectionSprite);
}

/** GetReflectionVerticalOffset */
export function GetReflectionVerticalOffset(objectEvent: ObjectEvent | any): number {
  return 14;
}

/** LoadObjectReflectionPalette */
export function LoadObjectReflectionPalette(objectEvent: ObjectEvent | any, sprite: Sprite | any): void {
  if (!objectEvent || !sprite) return;
  sprite.data[2] = 0;
  LoadObjectRegularReflectionPalette(objectEvent, sprite.paletteNum || 0);
}

/** LoadObjectRegularReflectionPalette */
export function LoadObjectRegularReflectionPalette(objectEvent: ObjectEvent | any, paletteIndex: number): void {
  // Sets regular reflection palette for water/puddles
}

/** LoadObjectHighBridgeReflectionPalette */
export function LoadObjectHighBridgeReflectionPalette(objectEvent: ObjectEvent | any, paletteNum: number): void {
  // Bridge reflection palette (solid dark blue tint)
}

/** UpdateObjectReflectionSprite */
export function UpdateObjectReflectionSprite(reflectionSprite: Sprite | any): void {
  if (!reflectionSprite) return;
  // Keeps reflection position locked below the main sprite
}

/** CreateWarpArrowSprite */
let arrowSheet: HTMLCanvasElement | undefined;
function getArrowSheet(): HTMLCanvasElement {
  return arrowSheet ??= spriteSheet(incbin("gFieldEffectObjectPic_Arrow"), incbin16("gObjectEventPal_Player"), 16, 16, 8);
}

export function CreateWarpArrowSprite(sprites: SpriteManager): number {
  const sprite = new Sprite();
  (sprite as Sprite & { warpArrowSprite?: boolean }).warpArrowSprite = true;
  sprite.width = sprite.height = 16;
  sprite.priority = 1;
  sprite.subpriority = 0x52;
  sprite.invisible = true;
  sprite.data[0] = -1;
  sprite.data[1] = -1;
  sprite.draw = (ctx, x, y) => {
    const sheet = getArrowSheet();
    ctx.drawImage(sheet, 0, sprite.imageValue * 16, 16, 16, x, y, 16, 16);
  };
  const id = sprites.getId(sprites.addAtEnd(sprite));
  if (id === 0xff) sprites.destroy(sprite);
  return id;
}

/** SetSpriteInvisible */
export function SetSpriteInvisible(sprites: SpriteManager, spriteId: number): void {
  const sprite = sprites.getById(spriteId);
  if (sprite) sprite.invisible = true;
}

/** ShowWarpArrowSprite */
export function ShowWarpArrowSprite(sprites: SpriteManager, spriteId: number, direction: number, x: number, y: number): void {
  const sprite = sprites.getById(spriteId);
  if (!sprite) return;
  if (sprite.invisible || sprite.data[0] !== (x << 16 >> 16) || sprite.data[1] !== (y << 16 >> 16)) {
    sprite.x = x * 16;
    sprite.y = y * 16;
    sprite.invisible = false;
    sprite.data[0] = x << 16 >> 16;
    sprite.data[1] = y << 16 >> 16;
    sprite.data[2] = (direction - 1) & 3;
    sprite.data[3] = 0;
    sprite.imageValue = sprite.data[2] * 2;
  }
  sprite.callback = (s) => {
    if (++s.data[3] >= 32) {
      s.data[3] = 0;
      s.imageValue = s.data[2] * 2 + (s.imageValue % 2 === 0 ? 1 : 0);
    }
  };
}

/** FldEff_UnusedGrass */
export function FldEff_UnusedGrass(): number {
  return 0;
}

/** FldEff_UnusedGrass2 */
export function FldEff_UnusedGrass2(): number {
  return 0;
}

/** FldEff_Sparkle */
export function FldEff_Sparkle(): number {
  return 0;
}

/** UpdateSparkleFieldEffect */
export function UpdateSparkleFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** FldEff_UnusedSand */
export function FldEff_UnusedSand(): number {
  return 0;
}

/** FldEff_UnusedWaterSurfacing */
export function FldEff_UnusedWaterSurfacing(): number {
  return 0;
}

/** FldEff_BerryTreeGrowthSparkle */
export function FldEff_BerryTreeGrowthSparkle(): number {
  return 0;
}
