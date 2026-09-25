// event_object_movement.c (partial): creating a hardware sprite from an object
// event's graphics info — GetObjectEventGraphicsInfo,
// CopyObjectGraphicsInfoToSpriteTemplate, CreateObjectGraphicsSprite and the
// object palette loading (LoadObjectEventPalette, TryLoadObjectPalette,
// FindObjectEventPaletteIndexByTag). Used by screens that draw NPCs on the
// hardware layer (the shop's map view). The Quest Log playback callback
// (QL_UpdateObject) is out of scope. The graphics id must already be resolved
// (no OBJ_EVENT_GFX_VARS). Needs loadCData("event_object_movement") and
// preloadPacks(["graphics_object_events"]).

import { cdata, incbin, symName, type SymRef } from "./hw/assets";
import { affineAnimsFrom, animsFrom, oamFrom } from "./hw/cdataSprite";
import {
  CreateSprite, IndexOfSpritePaletteTag, LoadSpritePalette, MAX_SPRITES, gSprites, SetSubspriteTables, SUBSPRITES_IGNORE_PRIORITY, TAG_NONE,
  type Sprite, type SpriteCallback, type SpriteFrameImage, type SpriteTemplate, type Subsprite, type SubspriteTable,
} from "./hw/sprite";

export type ObjectEventGraphicsInfo = {
  tileTag: number; paletteTag: number; reflectionPaletteTag: number; size: number; width: number; height: number; paletteSlot: number;
  shadowSize: number; inanimate: number; disableReflectionPaletteLoad: number; tracks: number;
  oam: SymRef; subspriteTables: SymRef | 0; anims: SymRef; images: SymRef | 0; affineAnims: SymRef;
};

const OBJ_EVENT_PAL_TAG_NONE = 0x11ff;

const rd = <T>(name: string) => cdata<T>("event_object_movement", name);
type PaletteEntry = { data: SymRef; tag: number };
const sObjectEventSpritePalettes = () => rd<PaletteEntry[]>("sObjectEventSpritePalettes");

/** GetObjectEventGraphicsInfo (for an already resolved graphicsId). */
export function GetObjectEventGraphicsInfo(graphicsId: number): ObjectEventGraphicsInfo {
  const pointers = rd<SymRef[]>("gObjectEventGraphicsInfoPointers");
  if (graphicsId >= pointers.length) graphicsId = 0;
  return rd<ObjectEventGraphicsInfo>(symName(pointers[graphicsId])!);
}

function imagesFrom(ref: SymRef | 0): SpriteFrameImage[] | null {
  if (!ref) return null;
  const frames = rd<{ data: SymRef; size: number }[]>(symName(ref)!);
  return frames.map((f) => {
    const bytes = incbin(symName(f.data)!);
    const offset = f.data.offset ?? 0;
    return { data: bytes.subarray(offset, offset + f.size), size: f.size };
  });
}

function subspriteTablesFrom(ref: SymRef | 0): SubspriteTable[] | null {
  if (!ref) return null;
  const tables = rd<{ subspriteCount: number; subsprites: SymRef | 0 }[]>(symName(ref)!);
  return tables.map((t) => ({
    subspriteCount: t.subspriteCount,
    subsprites: t.subsprites ? rd<Subsprite[]>(symName(t.subsprites)!) : null,
  }));
}

/** CopyObjectGraphicsInfoToSpriteTemplate */
export function CopyObjectGraphicsInfoToSpriteTemplate(
  graphicsId: number, callback: SpriteCallback,
): { spriteTemplate: SpriteTemplate; subspriteTables: SubspriteTable[] | null } {
  const graphicsInfo = GetObjectEventGraphicsInfo(graphicsId);
  return {
    spriteTemplate: {
      tileTag: graphicsInfo.tileTag,
      paletteTag: graphicsInfo.paletteTag,
      oam: oamFrom(graphicsInfo.oam),
      anims: animsFrom(graphicsInfo.anims),
      images: imagesFrom(graphicsInfo.images),
      affineAnims: affineAnimsFrom(graphicsInfo.affineAnims),
      callback,
    },
    subspriteTables: subspriteTablesFrom(graphicsInfo.subspriteTables),
  };
}

/** CreateObjectGraphicsSprite */
export function CreateObjectGraphicsSprite(graphicsId: number, callback: SpriteCallback, x: number, y: number, subpriority: number): number {
  const { spriteTemplate, subspriteTables } = CopyObjectGraphicsInfoToSpriteTemplate(graphicsId, callback);
  if (spriteTemplate.paletteTag !== TAG_NONE) LoadObjectEventPalette(spriteTemplate.paletteTag);

  const spriteId = CreateSprite(spriteTemplate, x, y, subpriority);
  if (spriteId !== MAX_SPRITES && subspriteTables !== null) {
    SetSubspriteTables(gSprites[spriteId] as Sprite, subspriteTables);
    gSprites[spriteId].subspriteMode = SUBSPRITES_IGNORE_PRIORITY;
  }
  return spriteId;
}

/** LoadObjectEventPalette */
export function LoadObjectEventPalette(paletteTag: number): void {
  const i = FindObjectEventPaletteIndexByTag(paletteTag);

  // Source (no BUGFIX): the index is compared against the tag sentinel, always true.
  if (i !== OBJ_EVENT_PAL_TAG_NONE) {
    TryLoadObjectPalette(sObjectEventSpritePalettes()[i]);
  }
}

/** TryLoadObjectPalette */
function TryLoadObjectPalette(spritePalette: PaletteEntry): number {
  if (IndexOfSpritePaletteTag(spritePalette.tag) !== 0xff) {
    // Already loaded
    return 0xff;
  }
  return LoadSpritePalette({ data: incbin(symName(spritePalette.data)!), tag: spritePalette.tag });
}

/** FindObjectEventPaletteIndexByTag (0xFF when missing; the source then indexes past the table, so callers must pass valid tags). */
function FindObjectEventPaletteIndexByTag(tag: number): number {
  const palettes = sObjectEventSpritePalettes();
  for (let i = 0; i < palettes.length; i++) {
    // The terminator initializer {OBJ_EVENT_PAL_TAG_NONE} is exported as an empty entry.
    if (palettes[i].tag === undefined || palettes[i].tag === OBJ_EVENT_PAL_TAG_NONE) break;
    if (palettes[i].tag === tag) return i;
  }
  return 0xff;
}
