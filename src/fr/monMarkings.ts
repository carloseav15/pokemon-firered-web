// Port of pokefirered src/mon_markings.c to TypeScript.
// Displays and handles interactive mon markings menu (circle, square, triangle, heart)
// with cursor, OK/Cancel confirmation, and combo sprites.

import { sound } from "./audio/sound";
import { A_BUTTON, B_BUTTON, DPAD_DOWN, DPAD_UP, JOY_NEW } from "./gba/input";
import { cdata, incbin, incbin16 } from "./hw/assets";
import { animsFrom, oamFrom } from "./hw/cdataSprite";
import { GetUserWindowGraphics } from "./hw/menu";
import {
  CalcCenterToCornerVec, CreateSprite, DestroySprite, FreeSpritePaletteByTag, FreeSpriteTilesByTag,
  gDummySpriteAffineAnimTable, gSprites, LoadSpritePalette, LoadSpriteSheet,
  SPRITE_SHAPE, SPRITE_SIZE, ST_OAM_AFFINE_OFF, StartSpriteAnim, type Sprite, type SpriteTemplate,
} from "./hw/sprite";
import { save } from "./save";

export const NUM_MON_MARKINGS = 4;

export const ANIM_CURSOR = NUM_MON_MARKINGS * 2; // 8
export const ANIM_TEXT = ANIM_CURSOR + 1;        // 9

export const SELECTION_OK = NUM_MON_MARKINGS;      // 4
export const SELECTION_CANCEL = SELECTION_OK + 1; // 5

const TILE_SIZE_4BPP = 32;

export interface MonMarkingsMenu {
  baseTileTag: number;
  basePaletteTag: number;
  markings: number; // bit flags (0..15)
  cursorPos: number; // 0..3: markings, 4: OK, 5: Cancel
  markingsArray: boolean[]; // length 4
  cursorBaseY: number;
  spriteSheetLoadRequired: boolean;
  windowSprites: (Sprite | null)[]; // length 2
  markingSprites: (Sprite | null)[]; // length 4
  cursorSprite: Sprite | null;
  textSprite: Sprite | null;
  frameTiles: Uint8Array;
  framePalette: Uint16Array;
  windowSpriteTiles: Uint8Array; // 0x1000 bytes
  tileLoadState: number;
}

let sMenu: MonMarkingsMenu | null = null;

export function CreateMonMarkingsMenu(baseTileTag = 0x1000, basePaletteTag = 0x1000): MonMarkingsMenu {
  return {
    baseTileTag,
    basePaletteTag,
    markings: 0,
    cursorPos: 0,
    markingsArray: [false, false, false, false],
    cursorBaseY: 0,
    spriteSheetLoadRequired: false,
    windowSprites: [null, null],
    markingSprites: [null, null, null, null],
    cursorSprite: null,
    textSprite: null,
    frameTiles: new Uint8Array(0x120),
    framePalette: new Uint16Array(16),
    windowSpriteTiles: new Uint8Array(0x1000),
    tileLoadState: 0,
  };
}

export function InitMonMarkingsMenu(ptr: MonMarkingsMenu): void {
  sMenu = ptr;
}

export function GetCurrentMonMarkingsMenu(): MonMarkingsMenu | null {
  return sMenu;
}

function BufferMenuWindowTiles(): void {
  if (!sMenu) return;
  const frame = GetUserWindowGraphics(save.options.frameType);
  sMenu.frameTiles = frame.tiles;
  sMenu.framePalette = frame.palette;
  sMenu.tileLoadState = 0;
  sMenu.windowSpriteTiles.fill(0);
}

function BufferMenuFrameTiles(): boolean {
  if (!sMenu) return false;
  const destOffset = sMenu.tileLoadState * 0x100;
  const dest = sMenu.windowSpriteTiles.subarray(destOffset, destOffset + 0x100);
  const src = sMenu.frameTiles;

  switch (sMenu.tileLoadState) {
    case 0:
      // Top row: tile 0, 6 copies of tile 1, tile 2
      dest.set(src.subarray(0, TILE_SIZE_4BPP), 0);
      for (let i = 0; i < 6; i++) {
        dest.set(src.subarray(TILE_SIZE_4BPP, TILE_SIZE_4BPP * 2), TILE_SIZE_4BPP * (i + 1));
      }
      dest.set(src.subarray(TILE_SIZE_4BPP * 2, TILE_SIZE_4BPP * 3), TILE_SIZE_4BPP * 7);
      sMenu.tileLoadState++;
      break;

    default:
      // Middle rows (1..12): tile 3, 6 copies of tile 4, tile 5
      dest.set(src.subarray(TILE_SIZE_4BPP * 3, TILE_SIZE_4BPP * 4), 0);
      for (let i = 0; i < 6; i++) {
        dest.set(src.subarray(TILE_SIZE_4BPP * 4, TILE_SIZE_4BPP * 5), TILE_SIZE_4BPP * (i + 1));
      }
      dest.set(src.subarray(TILE_SIZE_4BPP * 5, TILE_SIZE_4BPP * 6), TILE_SIZE_4BPP * 7);
      sMenu.tileLoadState++;
      break;

    case 13:
      // Bottom row: tile 6, 6 copies of tile 7, tile 8
      dest.set(src.subarray(TILE_SIZE_4BPP * 6, TILE_SIZE_4BPP * 7), 0);
      for (let i = 0; i < 6; i++) {
        dest.set(src.subarray(TILE_SIZE_4BPP * 7, TILE_SIZE_4BPP * 8), TILE_SIZE_4BPP * (i + 1));
      }
      dest.set(src.subarray(TILE_SIZE_4BPP * 8, TILE_SIZE_4BPP * 9), TILE_SIZE_4BPP * 7);
      sMenu.tileLoadState++;
      return false;

    case 14:
      return false;
  }

  return true;
}

export function BufferMonMarkingsMenuTiles(): void {
  BufferMenuWindowTiles();
  while (BufferMenuFrameTiles()) {
    // processes all 14 rows into windowSpriteTiles
  }
}

export function OpenMonMarkingsMenu(markings: number, x: number, y: number): void {
  if (!sMenu) return;
  sMenu.cursorPos = 0;
  sMenu.markings = markings & 0x0f;
  for (let i = 0; i < NUM_MON_MARKINGS; i++) {
    sMenu.markingsArray[i] = ((sMenu.markings >> i) & 1) !== 0;
  }
  CreateMonMarkingsMenuSprites(x, y, sMenu.baseTileTag, sMenu.basePaletteTag);
}

export function FreeMonMarkingsMenu(): void {
  if (!sMenu) return;
  for (let i = 0; i < 3; i++) {
    FreeSpriteTilesByTag(sMenu.baseTileTag + i);
  }
  FreeSpritePaletteByTag(sMenu.basePaletteTag);
  FreeSpritePaletteByTag(sMenu.basePaletteTag + 1);

  for (let i = 0; i < sMenu.windowSprites.length; i++) {
    const s = sMenu.windowSprites[i];
    if (s) DestroySprite(s);
    sMenu.windowSprites[i] = null;
  }

  for (let i = 0; i < NUM_MON_MARKINGS; i++) {
    const s = sMenu.markingSprites[i];
    if (s) DestroySprite(s);
    sMenu.markingSprites[i] = null;
  }

  if (sMenu.cursorSprite) {
    DestroySprite(sMenu.cursorSprite);
    sMenu.cursorSprite = null;
  }

  if (sMenu.textSprite) {
    DestroySprite(sMenu.textSprite);
    sMenu.textSprite = null;
  }
}

export function HandleMonMarkingsMenuInput(): boolean {
  if (!sMenu) return false;

  if (JOY_NEW(DPAD_UP)) {
    sound.playSE(sound.c("SE_SELECT"));
    if (--sMenu.cursorPos < 0) sMenu.cursorPos = SELECTION_CANCEL;
    return true;
  }

  if (JOY_NEW(DPAD_DOWN)) {
    sound.playSE(sound.c("SE_SELECT"));
    if (++sMenu.cursorPos > SELECTION_CANCEL) sMenu.cursorPos = 0;
    return true;
  }

  if (JOY_NEW(A_BUTTON)) {
    sound.playSE(sound.c("SE_SELECT"));

    switch (sMenu.cursorPos) {
      case SELECTION_OK:
        sMenu.markings = 0;
        for (let i = 0; i < NUM_MON_MARKINGS; i++) {
          sMenu.markings |= (sMenu.markingsArray[i] ? 1 : 0) << i;
        }
        return false;

      case SELECTION_CANCEL:
        return false;
    }

    sMenu.markingsArray[sMenu.cursorPos] = !sMenu.markingsArray[sMenu.cursorPos];
    return true;
  }

  if (JOY_NEW(B_BUTTON)) {
    sound.playSE(sound.c("SE_SELECT"));
    return false;
  }

  return true;
}

function SpriteCB_Marking(sprite: Sprite): void {
  if (!sMenu) return;
  const markingId = sprite.data[0];
  if (sMenu.markingsArray[markingId]) {
    StartSpriteAnim(sprite, 2 * markingId + 1); // Set marking 'on'
  } else {
    StartSpriteAnim(sprite, 2 * markingId);     // Set marking 'off'
  }
}

function SpriteCB_Cursor(sprite: Sprite): void {
  if (!sMenu) return;
  sprite.y = 16 * sMenu.cursorPos + sprite.data[0];
}

function CreateMonMarkingsMenuSprites(x: number, y: number, baseTileTag: number, basePaletteTag: number): void {
  if (!sMenu) return;

  LoadSpriteSheet({ data: sMenu.windowSpriteTiles, size: 0x1000, tag: baseTileTag });
  LoadSpriteSheet({ data: incbin("gMonMarkingsMenu_Gfx"), size: 0x320, tag: baseTileTag + 1 });

  LoadSpritePalette({ data: sMenu.framePalette, tag: basePaletteTag });
  LoadSpritePalette({ data: incbin16("gMonMarkingsMenu_Pal"), tag: basePaletteTag + 1 });

  const oamMenuWindow = oamFrom(cdata("mon_markings", "sOamData_MenuWindow"));
  const animsMenuWindow = animsFrom(cdata("mon_markings", "sAnims_MenuWindow"));
  const oam8x8 = oamFrom(cdata("mon_markings", "sOamData_8x8"));
  const animsMenuSprite = animsFrom(cdata("mon_markings", "sAnims_MenuSprite"));

  const template: SpriteTemplate = {
    tileTag: baseTileTag,
    paletteTag: basePaletteTag,
    oam: oamMenuWindow,
    anims: animsMenuWindow,
    images: null,
    affineAnims: gDummySpriteAffineAnimTable,
    callback: () => {},
  };

  // Create window sprites (upper half y+32, lower half y+96)
  for (let i = 0; i < sMenu.windowSprites.length; i++) {
    const spriteId = CreateSprite(template, x + 32, y + 32, 1);
    sMenu.windowSprites[i] = gSprites[spriteId];
    StartSpriteAnim(gSprites[spriteId], i);
  }
  if (sMenu.windowSprites[1]) {
    sMenu.windowSprites[1].y = y + 96;
  }

  // Create marking sprites (4 markings at y + 16 + 16 * i)
  template.tileTag++;
  template.paletteTag++;
  template.anims = animsMenuSprite;
  template.callback = SpriteCB_Marking;
  template.oam = oam8x8;
  for (let i = 0; i < NUM_MON_MARKINGS; i++) {
    const spriteId = CreateSprite(template, x + 32, y + 16 + 16 * i, 0);
    sMenu.markingSprites[i] = gSprites[spriteId];
    gSprites[spriteId].data[0] = i; // sMarkingId
  }

  // Create OK/Cancel text sprite
  template.callback = () => {};
  const textSpriteId = CreateSprite(template, 0, 0, 0);
  const textSprite = gSprites[textSpriteId];
  sMenu.textSprite = textSprite;
  textSprite.oam.shape = SPRITE_SHAPE("32x32");
  textSprite.oam.size = SPRITE_SIZE("32x32");
  StartSpriteAnim(textSprite, ANIM_TEXT);
  textSprite.x = x + 32;
  textSprite.y = y + 80;
  CalcCenterToCornerVec(textSprite, SPRITE_SHAPE("32x16"), SPRITE_SIZE("32x16"), ST_OAM_AFFINE_OFF);

  // Create cursor sprite
  template.callback = SpriteCB_Cursor;
  const cursorSpriteId = CreateSprite(template, x + 12, 0, 0);
  const cursorSprite = gSprites[cursorSpriteId];
  sMenu.cursorSprite = cursorSprite;
  cursorSprite.data[0] = y + 16; // sCursorYOffset
  StartSpriteAnim(cursorSprite, ANIM_CURSOR);
}

/**
 * Creates a mon marking combination sprite with a spritesheet that holds every possible combination (16),
 * used by the summary screen / Pokénav.
 */
export function CreateMonMarkingAllCombosSprite(tileTag: number, paletteTag: number, palette: Uint16Array | null = null): Sprite | null {
  const pal = palette ?? incbin16("sMonMarkings_Pal");
  return CreateMarkingComboSprite(tileTag, paletteTag, pal, 1 << NUM_MON_MARKINGS);
}

/**
 * Creates a mon marking combination sprite with a spritesheet that holds only one combination,
 * used for the currently selected PC mon.
 */
export function CreateMonMarkingComboSprite(tileTag: number, paletteTag: number, palette: Uint16Array | null = null): Sprite | null {
  const pal = palette ?? incbin16("sMonMarkings_Pal");
  return CreateMarkingComboSprite(tileTag, paletteTag, pal, 1);
}

function CreateMarkingComboSprite(tileTag: number, paletteTag: number, palette: Uint16Array, size: number): Sprite | null {
  const oam = oamFrom(cdata("mon_markings", "sOamData_MarkingCombo"));
  const anims = animsFrom(cdata("mon_markings", "sAnims_MarkingCombo"));

  const template: SpriteTemplate = {
    tileTag,
    paletteTag,
    oam,
    anims,
    images: null,
    affineAnims: gDummySpriteAffineAnimTable,
    callback: () => {},
  };

  LoadSpriteSheet({ data: incbin("sMonMarkings_Gfx"), size: size * 0x80, tag: tileTag });
  LoadSpritePalette({ data: palette, tag: paletteTag });

  const spriteId = CreateSprite(template, 0, 0, 0);
  return gSprites[spriteId] ?? null;
}

/**
 * Update what combination is shown, used for sprites created with CreateMonMarkingComboSprite.
 */
export function UpdateMonMarkingTiles(markings: number, dest: Uint8Array): void {
  const gfx = incbin("sMonMarkings_Gfx");
  const offset = (markings & 0x0f) * 0x80;
  dest.set(gfx.subarray(offset, offset + 0x80));
}
