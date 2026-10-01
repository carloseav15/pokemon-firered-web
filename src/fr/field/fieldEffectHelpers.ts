// field_effect_helpers.c routines kept for the inventory. Only the warp arrows
// are wired (playerAvatar.ts); the connected ground effects live in
// fieldEffects.ts. Contents:
// - Water reflections and bridge reflection palettes (SetUpReflection,
//   UpdateObjectReflectionSprite): live in C via GroundEffect_WaterReflection/
//   GroundEffect_IceReflection, superseded in TS by fieldEffects.ts
//   updateObjectReflection, so these helpers have no TS caller.
// - Warp arrow sprites (CreateWarpArrowSprite, ShowWarpArrowSprite, SetSpriteInvisible)
// - FldEff_UnusedGrass/UnusedGrass2/UnusedSand/UnusedWaterSurfacing/Sparkle/
//   BerryTreeGrowthSparkle: no FieldEffectStart(id) caller in C either.

import * as C from "../generated/constants";
import * as MB from "../generated/metatileBehavior";
import { cdata, incbin, incbin16, loadCData } from "../hw/assets";
import { spriteSheet } from "./gfx4bpp";
import { SpriteManager } from "../gba/sprite";
import { DATA_ROOT, rom } from "../rom";
import { Sprite } from "../gba/sprite";
import { graphicsInfo, type ObjectEvent } from "./objectEvents";
import { fieldFxTemplate } from "./fieldEffects";

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
    // Not part of the C struct: this disconnected mirror has no gObjectEvents/gSprites arrays to
    // resolve reflectionSprite->data[0]/data[1] against, so it carries the two references directly.
    linkedObjectEvent: objectEvent,
    mainSprite: sprite,
    callback: UpdateObjectReflectionSprite,
  };
  LoadObjectReflectionPalette(objectEvent, reflectionSprite);
}

/** GetReflectionVerticalOffset */
export function GetReflectionVerticalOffset(objectEvent: ObjectEvent | any): number {
  return graphicsInfo(objectEvent.graphicsId).height - 2;
}

/** LoadObjectReflectionPalette */
export function LoadObjectReflectionPalette(objectEvent: ObjectEvent | any, sprite: Sprite | any): void {
  if (!objectEvent || !sprite) return;
  sprite.data[2] = 0;
  // MetatileBehavior_GetBridgeType (metatile_behavior.c) always returns FALSE in FRLG, so the C's
  // high-bridge branch (Route 120, Hoenn-only) never runs here; LoadObjectRegularReflectionPalette
  // is the only reachable branch.
  LoadObjectRegularReflectionPalette(objectEvent, sprite.paletteNum || 0);
}

/** LoadObjectRegularReflectionPalette. The tinted reflection palette itself is pre-baked per
 * graphics id into GetObjectEventGraphicsInfo(...).reflectionFrames (tools/decomp/step_objects.py's
 * reflection_palette_tag, mirroring gPlayerReflectionPaletteSets/gSpecialObjectReflectionPaletteSets/
 * gReflectionEffectPaletteMap) instead of PatchObjectPalette patching GBA palette RAM at runtime. */
export function LoadObjectRegularReflectionPalette(objectEvent: ObjectEvent | any, paletteIndex: number): void {
  const info = graphicsInfo(objectEvent.graphicsId);
  if (info.reflectionFrames.length > 0) {
    objectEvent.reflectionPaletteNum = paletteIndex;
  }
}

/** LoadObjectHighBridgeReflectionPalette. Solid dark-blue bridge tint (Route 120), likewise
 * pre-baked into bridgeReflectionFrames; unreachable in FRLG (see LoadObjectReflectionPalette). */
export function LoadObjectHighBridgeReflectionPalette(objectEvent: ObjectEvent | any, paletteNum: number): void {
  const info = graphicsInfo(objectEvent.graphicsId);
  if (info.bridgeReflectionFrames.length > 0) {
    objectEvent.reflectionPaletteNum = paletteNum;
  }
}

/** UpdateObjectReflectionSprite */
export function UpdateObjectReflectionSprite(reflectionSprite: Sprite | any): void {
  if (!reflectionSprite) return;
  const objectEvent: (ObjectEvent & Record<string, any>) | undefined = reflectionSprite.linkedObjectEvent;
  const mainSprite: (Sprite & Record<string, any>) | undefined = reflectionSprite.mainSprite;
  if (!objectEvent || !mainSprite || !objectEvent.active || !objectEvent.hasReflection || objectEvent.localId !== reflectionSprite.data[1]) {
    reflectionSprite.inUse = false;
    return;
  }
  reflectionSprite.frameImages = mainSprite.frameImages;
  reflectionSprite.imageValue = mainSprite.imageValue;
  reflectionSprite.subspriteTableNum = mainSprite.subspriteTableNum;
  reflectionSprite.invisible = mainSprite.invisible;
  reflectionSprite.x = mainSprite.x;
  // reflectionSprite.data[2] holds an additional vertical offset, used by the high bridges on Route 120
  reflectionSprite.y = mainSprite.y + GetReflectionVerticalOffset(objectEvent) + reflectionSprite.data[2];
  reflectionSprite.centerToCornerVecX = mainSprite.centerToCornerVecX;
  reflectionSprite.centerToCornerVecY = mainSprite.centerToCornerVecY;
  reflectionSprite.x2 = mainSprite.x2;
  reflectionSprite.y2 = -mainSprite.y2;
  reflectionSprite.coordOffsetEnabled = mainSprite.coordOffsetEnabled;

  // Check if the reflection is not still.
  if (!reflectionSprite.data[7]) {
    // Mirrors the main sprite's facing (the C picks matrixNum 0/1; this port uses hFlip directly).
    reflectionSprite.hFlip = mainSprite.hFlip;
  }
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

/** SetSpritePosToOffsetMapCoords (event_object_movement.c): converts map tile coords to the
 * absolute map-pixel space this port's sprites use (the map renderer, not each sprite, applies
 * camera scroll), in place on gFieldEffectArguments like the C's s16* out params. */
function SetSpritePosToOffsetMapCoords(args: number[], xIndex: number, yIndex: number, dx: number, dy: number): void {
  args[xIndex] = ((args[xIndex]! << 16) >> 16) * 16 + dx;
  args[yIndex] = ((args[yIndex]! << 16) >> 16) * 16 + dy;
}

/** CreateSpriteAtEnd(gFieldEffectObjectTemplatePointers[...], x, y, subpriority) for the field
 * effect templates exported from field_effect_objects.h into fieldfx.json (fieldFxTemplate). */
function createFxSprite(sprites: SpriteManager, templateName: string, x: number, y: number, subpriority: number): Sprite | undefined {
  const template = fieldFxTemplate(templateName);
  if (!template) return undefined;
  const sprite = new Sprite();
  sprite.frameImages = template.frames.map(([file, index, w, h]) => ({ url: `${DATA_ROOT}/${file}`, index, width: w, height: h }));
  sprite.anims = template.anims.length ? template.anims : [[["F", 0, 1, 0, 0], ["E"]]];
  const [w, h] = template.size ?? [template.frames[0]?.[2] ?? 16, template.frames[0]?.[3] ?? 16];
  sprite.width = w;
  sprite.height = h;
  sprite.centerToCornerVecX = -(w >> 1);
  sprite.centerToCornerVecY = -(h >> 1);
  sprite.x = x;
  sprite.y = y;
  sprite.subpriority = subpriority & 0xff;
  sprite.startAnim(0);
  sprites.addAtEnd(sprite);
  return sprite;
}

/** FldEff_UnusedGrass */
export function FldEff_UnusedGrass(sprites: SpriteManager): number {
  SetSpritePosToOffsetMapCoords(gFieldEffectArguments, 0, 1, 8, 8);
  const sprite = createFxSprite(sprites, "UnusedGrass", gFieldEffectArguments[0]!, gFieldEffectArguments[1]!, gFieldEffectArguments[2]!);
  if (sprite) {
    sprite.coordOffsetEnabled = true;
    sprite.priority = gFieldEffectArguments[3]! & 0xff;
    sprite.data[0] = C.FLDEFF_UNUSED_GRASS;
  }
  return 0;
}

/** FldEff_UnusedGrass2 */
export function FldEff_UnusedGrass2(sprites: SpriteManager): number {
  SetSpritePosToOffsetMapCoords(gFieldEffectArguments, 0, 1, 8, 8);
  const sprite = createFxSprite(sprites, "UnusedGrass2", gFieldEffectArguments[0]!, gFieldEffectArguments[1]!, gFieldEffectArguments[2]!);
  if (sprite) {
    sprite.coordOffsetEnabled = true;
    sprite.priority = gFieldEffectArguments[3]! & 0xff;
    sprite.data[0] = C.FLDEFF_UNUSED_GRASS_2;
  }
  return 0;
}

/** FldEff_Sparkle */
export function FldEff_Sparkle(sprites: SpriteManager): number {
  gFieldEffectArguments[0] = ((gFieldEffectArguments[0]! << 16) >> 16) + 7;
  gFieldEffectArguments[1] = ((gFieldEffectArguments[1]! << 16) >> 16) + 7;
  SetSpritePosToOffsetMapCoords(gFieldEffectArguments, 0, 1, 8, 8);
  const sprite = createFxSprite(sprites, "SmallSparkle", gFieldEffectArguments[0]!, gFieldEffectArguments[1]!, 0x52);
  if (sprite) {
    sprite.priority = gFieldEffectArguments[2]! & 0xff;
    sprite.coordOffsetEnabled = true;
    sprite.callback = (s: Sprite) => UpdateSparkleFieldEffect(s, sprites);
  }
  return 0;
}

/** UpdateSparkleFieldEffect. `sprites` is not part of the C signature (a plain sprite callback);
 * it is threaded through by FldEff_Sparkle's closure so this disconnected mirror can still perform
 * FieldEffectStop's DestroySprite side effect without a global gSprites pool. */
export function UpdateSparkleFieldEffect(sprite: Sprite | any, sprites?: SpriteManager): void {
  if (!sprite) return;
  if (sprite.data[0] === 0) {
    if (sprite.animEnded) {
      sprite.invisible = true;
      sprite.data[0]++;
    }
    if (sprite.data[0] === 0) return;
  }
  if (++sprite.data[1] > 34) {
    sprites?.destroy(sprite);
  }
}

/** FldEff_UnusedSand */
export function FldEff_UnusedSand(sprites: SpriteManager): number {
  SetSpritePosToOffsetMapCoords(gFieldEffectArguments, 0, 1, 8, 8);
  const sprite = createFxSprite(sprites, "UnusedSand", gFieldEffectArguments[0]!, gFieldEffectArguments[1]!, gFieldEffectArguments[2]!);
  if (sprite) {
    sprite.coordOffsetEnabled = true;
    sprite.priority = gFieldEffectArguments[3]! & 0xff;
    sprite.data[0] = C.FLDEFF_UNUSED_SAND;
  }
  return 0;
}

/** FldEff_UnusedWaterSurfacing */
export function FldEff_UnusedWaterSurfacing(sprites: SpriteManager): number {
  SetSpritePosToOffsetMapCoords(gFieldEffectArguments, 0, 1, 8, 8);
  const sprite = createFxSprite(sprites, "WaterSurfacing", gFieldEffectArguments[0]!, gFieldEffectArguments[1]!, gFieldEffectArguments[2]!);
  if (sprite) {
    sprite.coordOffsetEnabled = true;
    sprite.priority = gFieldEffectArguments[3]! & 0xff;
    sprite.data[0] = C.FLDEFF_UNUSED_WATER_SURFACING;
  }
  return 0;
}

/** FldEff_BerryTreeGrowthSparkle */
export function FldEff_BerryTreeGrowthSparkle(): number {
  return 0;
}
