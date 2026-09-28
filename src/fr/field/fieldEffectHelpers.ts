// Skeleton of field_effect_helpers.c: the 76 C names exist, but 62 are stubs
// (`return 0;` / empty) and nothing imports this module yet; the live field
// effects are still in fieldEffects.ts. See PENDING.md §3b.
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

export const gFadeFootprintsTireTracksFuncs = [
  FadeFootprintsTireTracks_Step0,
  FadeFootprintsTireTracks_Step1,
];

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

/** FldEff_Shadow */
export function FldEff_Shadow(): number {
  return 0;
}

/** UpdateShadowFieldEffect */
export function UpdateShadowFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** FldEff_TallGrass */
export function FldEff_TallGrass(): number {
  return 0;
}

/** UpdateTallGrassFieldEffect */
export function UpdateTallGrassFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** FldEff_JumpTallGrass */
export function FldEff_JumpTallGrass(): number {
  return 0;
}

/** FindTallGrassFieldEffectSpriteId */
export function FindTallGrassFieldEffectSpriteId(
  localId: number,
  mapNum: number,
  mapGroup: number,
  x: number,
  y: number,
): number {
  return 0xff;
}

/** UpdateGrassFieldEffectSubpriority */
export function UpdateGrassFieldEffectSubpriority(sprite: Sprite | any, z: number, offset: number): void {
  if (!sprite) return;
  sprite.subpriority = (z - offset) & 0xff;
}

/** FldEff_ShortGrass */
export function FldEff_ShortGrass(): number {
  return 0;
}

/** UpdateShortGrassFieldEffect */
export function UpdateShortGrassFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** FldEff_LongGrass */
export function FldEff_LongGrass(): number {
  return 0;
}

/** UpdateLongGrassFieldEffect */
export function UpdateLongGrassFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** FldEff_JumpLongGrass */
export function FldEff_JumpLongGrass(): number {
  return 0;
}

/** FldEff_UnusedGrass */
export function FldEff_UnusedGrass(): number {
  return 0;
}

/** FldEff_UnusedGrass2 */
export function FldEff_UnusedGrass2(): number {
  return 0;
}

/** FldEff_SandFootprints */
export function FldEff_SandFootprints(): number {
  return 0;
}

/** FldEff_DeepSandFootprints */
export function FldEff_DeepSandFootprints(): number {
  return 0;
}

/** FldEff_BikeTireTracks */
export function FldEff_BikeTireTracks(): number {
  return 0;
}

/** UpdateFootprintsTireTracksFieldEffect */
export function UpdateFootprintsTireTracksFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
  if (sprite.data && sprite.data[0] < gFadeFootprintsTireTracksFuncs.length) {
    gFadeFootprintsTireTracksFuncs[sprite.data[0]](sprite);
  }
}

/** FadeFootprintsTireTracks_Step0 */
export function FadeFootprintsTireTracks_Step0(sprite: Sprite | any): void {
  if (!sprite) return;
  if (++sprite.data[1] > 40) {
    sprite.data[0] = 1;
    sprite.data[1] = 0;
  }
}

/** FadeFootprintsTireTracks_Step1 */
export function FadeFootprintsTireTracks_Step1(sprite: Sprite | any): void {
  if (!sprite) return;
  sprite.data[1]++;
  sprite.invisible = (sprite.data[1] & 1) === 1;
  if (sprite.data[1] > 16) {
    sprite.invisible = true;
  }
}

/** FldEff_SurfBlob */
export function FldEff_SurfBlob(): number {
  return 0;
}

/** UpdateSurfBlobFieldEffect */
export function UpdateSurfBlobFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** SynchroniseSurfAnim */
export function SynchroniseSurfAnim(objectEvent: ObjectEvent | any, sprite: Sprite | any): void {
  if (!sprite || !objectEvent) return;
}

/** SynchroniseSurfPosition */
export function SynchroniseSurfPosition(objectEvent: ObjectEvent | any, sprite: Sprite | any): void {
  if (!sprite || !objectEvent) return;
}

/** CreateBobbingEffect */
export function CreateBobbingEffect(objectEvent: ObjectEvent | any, linkedSprite: Sprite | any, sprite: Sprite | any): void {
  if (!sprite) return;
}

/** SetSurfBlob_BobState */
export function SetSurfBlob_BobState(spriteId: number, state: number): void {
  // Sets bobbing state for surfing blob
}

/** GetSurfBlob_BobState */
export function GetSurfBlob_BobState(spriteId: number): number {
  return 0;
}

/** SetSurfBlob_DontSyncAnim */
export function SetSurfBlob_DontSyncAnim(spriteId: number, dontSync: boolean): void {
  // Controls animation synchronization
}

/** GetSurfBlob_DontSyncAnim */
export function GetSurfBlob_DontSyncAnim(spriteId: number): boolean {
  return false;
}

/** SetSurfBlob_PlayerOffset */
export function SetSurfBlob_PlayerOffset(spriteId: number, hasOffset: boolean, offset: number): void {
  // Sets player vertical offset while surfing
}

/** GetSurfBlob_HasPlayerOffset */
export function GetSurfBlob_HasPlayerOffset(spriteId: number): boolean {
  return false;
}

/** StartUnderwaterSurfBlobBobbing */
export function StartUnderwaterSurfBlobBobbing(spriteId: number): void {
  // Starts bobbing motion for dive / underwater blob
}

/** SpriteCB_UnderwaterSurfBlob */
export function SpriteCB_UnderwaterSurfBlob(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** FldEff_Dust */
export function FldEff_Dust(): number {
  return 0;
}

/** FldEff_Ripple */
export function FldEff_Ripple(): number {
  return 0;
}

/** FldEff_Splash */
export function FldEff_Splash(): number {
  return 0;
}

/** UpdateSplashFieldEffect */
export function UpdateSplashFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** FldEff_JumpSmallSplash */
export function FldEff_JumpSmallSplash(): number {
  return 0;
}

/** FldEff_JumpBigSplash */
export function FldEff_JumpBigSplash(): number {
  return 0;
}

/** FldEff_FeetInFlowingWater */
export function FldEff_FeetInFlowingWater(): number {
  return 0;
}

/** UpdateFeetInFlowingWaterFieldEffect */
export function UpdateFeetInFlowingWaterFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** FldEff_HotSpringsWater */
export function FldEff_HotSpringsWater(): number {
  return 0;
}

/** UpdateHotSpringsWaterFieldEffect */
export function UpdateHotSpringsWaterFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** FldEff_Bubbles */
export function FldEff_Bubbles(): number {
  return 0;
}

/** UpdateBubblesFieldEffect */
export function UpdateBubblesFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** FldEff_Sparkle */
export function FldEff_Sparkle(): number {
  return 0;
}

/** UpdateSparkleFieldEffect */
export function UpdateSparkleFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** FldEff_SandPile */
export function FldEff_SandPile(): number {
  return 0;
}

/** UpdateSandPileFieldEffect */
export function UpdateSandPileFieldEffect(sprite: Sprite | any): void {
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

/** ShowDisguiseFieldEffect */
export function ShowDisguiseFieldEffect(fldEff: number, templateIdx: number, paletteNum: number): number {
  return 0;
}

/** ShowSandDisguiseFieldEffect */
export function ShowSandDisguiseFieldEffect(): number {
  return ShowDisguiseFieldEffect(C.FLDEFF_SAND_DISGUISE, 0, 0);
}

/** ShowMountainDisguiseFieldEffect */
export function ShowMountainDisguiseFieldEffect(): number {
  return ShowDisguiseFieldEffect(C.FLDEFF_MOUNTAIN_DISGUISE, 1, 0);
}

/** ShowTreeDisguiseFieldEffect */
export function ShowTreeDisguiseFieldEffect(): number {
  return ShowDisguiseFieldEffect(C.FLDEFF_TREE_DISGUISE, 2, 0);
}

/** UpdateDisguiseFieldEffect */
export function UpdateDisguiseFieldEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** StartRevealDisguise */
export function StartRevealDisguise(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** UpdateRevealDisguise */
export function UpdateRevealDisguise(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** UpdateJumpImpactEffect */
export function UpdateJumpImpactEffect(sprite: Sprite | any): void {
  if (!sprite) return;
}

/** WaitFieldEffectSpriteAnim */
export function WaitFieldEffectSpriteAnim(sprite: Sprite | any): void {
  if (!sprite) return;
}
