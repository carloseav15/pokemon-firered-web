// battle_anim_smokescreen.c: the four-quadrant Smokescreen impact cloud.
// The enemy shadow sheet/template of this file are used by gfx_sfx_util.ts.

import { cdata, incbin, symName, type SymRef } from "../../hw/assets";
import { templateFrom, type CSpriteTemplate } from "../../hw/cdataSprite";
import {
  AnimateSprite, CreateInvisibleSprite, CreateSprite, DestroySprite, FreeSpritePaletteByTag, FreeSpriteTilesByTag,
  GetSpriteTileStartByTag, gSprites, LoadSpritePalette, LoadSpriteSheet, SpriteCallbackDummy, StartSpriteAnim, type Sprite,
  type SpriteTemplate,
} from "../../hw/sprite";
import { registerAnimSpriteCallbacks } from "../animRegistry";

// SmokescreenImpact main sprite data
const sActiveSprites = 0;
const sPersist = 1;
// Impact sprite data
const sMainSpriteId = 0;

type SheetDef = { data: SymRef; size: number; tag: number };
type PaletteDef = { data: SymRef; tag: number };

const sheet = () => cdata<SheetDef>("battle_anim_smokescreen", "sSmokescreenImpactSpriteSheet");
const palette = () => cdata<PaletteDef>("battle_anim_smokescreen", "sSmokescreenImpactSpritePalette");

let sTemplate: SpriteTemplate | null = null;
function sSmokescreenImpactSpriteTemplate(): SpriteTemplate {
  return (sTemplate ??= templateFrom(cdata<CSpriteTemplate>("battle_anim_smokescreen", "sSmokescreenImpactSpriteTemplate"), { SpriteCB_SmokescreenImpact }));
}

export function SmokescreenImpact(x: number, y: number, persist: boolean): number {
  if (GetSpriteTileStartByTag(sheet().tag) === 0xffff) {
    LoadSpriteSheet({ data: incbin(symName(sheet().data)!), size: sheet().size, tag: sheet().tag });
    LoadSpritePalette({ data: incbin(symName(palette().data)!), tag: palette().tag });
  }
  const mainSpriteId = CreateInvisibleSprite(SpriteCB_SmokescreenImpactMain);
  const mainSprite = gSprites[mainSpriteId];
  mainSprite.data[sPersist] = persist ? 1 : 0;

  // Top left sprite
  const spriteId1 = CreateSprite(sSmokescreenImpactSpriteTemplate(), x - 16, y - 16, 2);
  gSprites[spriteId1].data[sMainSpriteId] = mainSpriteId;
  mainSprite.data[sActiveSprites]++;
  AnimateSprite(gSprites[spriteId1]);

  // Top right sprite
  const spriteId2 = CreateSprite(sSmokescreenImpactSpriteTemplate(), x, y - 16, 2);
  gSprites[spriteId2].data[sMainSpriteId] = mainSpriteId;
  mainSprite.data[sActiveSprites]++;
  StartSpriteAnim(gSprites[spriteId2], 1);
  AnimateSprite(gSprites[spriteId2]);

  // Bottom left sprite
  const spriteId3 = CreateSprite(sSmokescreenImpactSpriteTemplate(), x - 16, y, 2);
  gSprites[spriteId3].data[sMainSpriteId] = mainSpriteId;
  mainSprite.data[sActiveSprites]++;
  StartSpriteAnim(gSprites[spriteId3], 2);
  AnimateSprite(gSprites[spriteId3]);

  // Bottom right sprite
  const spriteId4 = CreateSprite(sSmokescreenImpactSpriteTemplate(), x, y, 2);
  gSprites[spriteId4].data[sMainSpriteId] = mainSpriteId;
  mainSprite.data[sActiveSprites]++;
  StartSpriteAnim(gSprites[spriteId4], 3);
  AnimateSprite(gSprites[spriteId4]);

  return mainSpriteId;
}

function SpriteCB_SmokescreenImpactMain(sprite: Sprite): void {
  if (sprite.data[sActiveSprites] === 0) {
    FreeSpriteTilesByTag(sheet().tag);
    FreeSpritePaletteByTag(palette().tag);
    if (!sprite.data[sPersist]) DestroySprite(sprite);
    else sprite.callback = SpriteCallbackDummy;
  }
}

function SpriteCB_SmokescreenImpact(sprite: Sprite): void {
  if (sprite.animEnded) {
    gSprites[sprite.data[sMainSpriteId]].data[sActiveSprites]--;
    DestroySprite(sprite);
  }
}

registerAnimSpriteCallbacks({ SpriteCB_SmokescreenImpact });
