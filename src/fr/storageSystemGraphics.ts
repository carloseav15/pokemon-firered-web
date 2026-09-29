// pokemon_storage_system_graphics.c: box mon / party icons, icon scrolling between boxes, release and shift
// animations, wallpaper loading, box titles and the box scroll arrows.
import * as C from "./generated/constants";
import { StringCopyPadded } from "./generated/stringUtil";
import { FONT_NORMAL_COPY_1, GetStringWidth } from "./gba/font";
import { tasks } from "./gba/tasks";
import { cdata, incbin, incbin16, symName } from "./hw/assets";
import {
  CopyBgTilemapBufferToVram, CopyRectToBgTilemapBufferRect, FillBgTilemapBufferRect, IsDma3ManagerBusyWithBgCopy, LoadBgTiles,
  SetBgTilemapBuffer, ShowBg,
} from "./hw/bg";
import { affineAnimsFrom, animsFrom, oamFrom } from "./hw/cdataSprite";
import { SetGpuReg } from "./hw/gpu";
import { FuncIsActiveTask } from "./hw/menuHelpers";
import {
  BeginNormalPaletteFade, BG_PLTT_ID, gPlttBufferUnfaded, LoadPalette, OBJ_PLTT_ID, PLTT_SIZE_4BPP, RGB_WHITEALPHA,
  UpdatePaletteFade,
} from "./hw/palette";
import { ppu, REG_OFFSET_BG2CNT } from "./hw/ppu";
import {
  CreateSprite, DestroySprite, FreeOamMatrix, FreeSpriteTilesByTag, gDummySpriteAffineAnimTable, gSprites, IndexOfSpritePaletteTag,
  InitSpriteAffineAnim, LoadSpritePalettes, LoadSpriteSheet, MAX_SPRITES, ST_OAM_AFFINE_NORMAL, ST_OAM_OBJ_BLEND, StartSpriteAffineAnim,
  StartSpriteAnim, SpriteCallbackDummy, type Sprite, type SpriteTemplate,
} from "./hw/sprite";
import { gSineTable } from "./hw/trig";
import { GetIconSpecies, GetMonIconPaletteIndexFromSpecies, GetMonIconTiles, LoadMonIconPalettes } from "./pokemonIcon";
import { GetBoxMonDataAt, GetBoxNamePtr, GetBoxWallpaper, GetCurrentBoxMonData, SetBoxWallpaper, StorageGetCurrentBox } from "./pokemon/storage";
import { GetMonData } from "./pokemon/mon";
import { DrawTextWindowAndBufferTiles } from "./menus/storageMenu";
import { IsCursorInBox, IsCursorOnBoxTitle } from "./storageSystemData";
import {
  BOX_NAME_LENGTH, gS, GFXTAG_BOX_SCROLL_ARROW, GFXTAG_BOX_TITLE, GFXTAG_BOX_TITLE_ALT, GFXTAG_MON_ICON, IN_BOX_COLUMNS, IN_BOX_COUNT,
  IN_BOX_ROWS, MAX_MON_ICONS, MODE_BOX, MODE_MOVE, MODE_PARTY, OPTION_MOVE_ITEMS, PALTAG_BOX_TITLE, PALTAG_MISC_2, PALTAG_MON_ICON_0,
  PARTY_SIZE, RELEASE_ANIM_COME_BACK, RELEASE_ANIM_RELEASE, sParty, TOTAL_BOXES_COUNT, type SpriteSlot,
} from "./storageSystemInternal";

const DISPLAY_WIDTH = 240;
const OBJ_VRAM0 = 0x10000;
const TILE_SIZE_4BPP = 32;
const F = "pokemon_storage_system_graphics";
const sym = (name: string) => ({ $sym: name });
const rd = <T>(name: string): T => cdata<T>(F, name);
const bin = (name: string): Uint8Array => incbin(`${F}.c:${name}`);

type WallpaperEntry = { tiles: Uint8Array; tileMap: Uint16Array; palettes: Uint16Array };

/** sWallpapers: tiles / tilemap / palettes of each wallpaper, in the C table order. */
function Wallpaper(wallpaperId: number): WallpaperEntry {
  const e = rd<Array<{ tiles: unknown; tileMap: unknown; palettes: { $expr: string } }>>("sWallpapers")[wallpaperId];
  const palName = e.palettes.$expr.replace(/^\*\s*/, "");
  return { tiles: bin(symName(e.tiles)!), tileMap: incbin16(`${F}.c:${symName(e.tileMap)!}`), palettes: incbin16(`${F}.c:${palName}`) };
}

const boxTitleColors = (wallpaperId: number): number[] => rd<number[][]>("sBoxTitleColors")[wallpaperId];

function sMonIconTemplate(): SpriteTemplate {
  return {
    tileTag: GFXTAG_MON_ICON, paletteTag: PALTAG_MON_ICON_0, oam: oamFrom(sym("sOamData_MonIcon")), anims: animsFrom(0), images: null,
    affineAnims: gDummySpriteAffineAnimTable, callback: SpriteCallbackDummy,
  };
}

const sBoxTitleTemplate = (): SpriteTemplate => ({
  tileTag: GFXTAG_BOX_TITLE, paletteTag: PALTAG_BOX_TITLE, oam: oamFrom(sym("sOamData_BoxTitle")), anims: animsFrom(sym("sAnims_BoxTitle")),
  images: null, affineAnims: gDummySpriteAffineAnimTable, callback: SpriteCallbackDummy,
});

const sBoxScrollArrowTemplate = (): SpriteTemplate => ({
  tileTag: GFXTAG_BOX_SCROLL_ARROW, paletteTag: PALTAG_MISC_2, oam: oamFrom(sym("sOamData_BoxScrollArrow")),
  anims: animsFrom(sym("sAnims_BoxScrollArrow")), images: null, affineAnims: gDummySpriteAffineAnimTable, callback: SpriteCB_BoxScrollArrow,
});

const partySlot = (i: number): SpriteSlot => ({ get: () => gS().partySprites[i], set: (s) => { gS().partySprites[i] = s; } });
const boxSlot = (i: number): SpriteSlot => ({ get: () => gS().boxMonsSprites[i], set: (s) => { gS().boxMonsSprites[i] = s; } });
const movingSlot = (): SpriteSlot => ({ get: () => gS().movingMonSprite, set: (s) => { gS().movingMonSprite = s; } });

/** InitMonIconFields */
export function InitMonIconFields(): void {
  const g = gS();
  LoadMonIconPalettes();
  for (let i = 0; i < MAX_MON_ICONS; i++) g.numIconsPerSpecies[i] = 0;
  for (let i = 0; i < MAX_MON_ICONS; i++) g.iconSpeciesList[i] = C.SPECIES_NONE;
  for (let i = 0; i < PARTY_SIZE; i++) g.partySprites[i] = null;
  for (let i = 0; i < IN_BOX_COUNT; i++) g.boxMonsSprites[i] = null;
  g.movingMonSprite = null;
}

function GetMonIconPriorityByCursorArea(): number {
  return IsCursorInBox() ? 2 : 1;
}

/** CreateMovingMonIcon */
export function CreateMovingMonIcon(): void {
  const g = gS();
  const personality = GetMonData(g.movingMon, C.MON_DATA_PERSONALITY);
  const species = GetMonData(g.movingMon, C.MON_DATA_SPECIES_OR_EGG);
  const priority = GetMonIconPriorityByCursorArea();
  g.movingMonSprite = CreateMonIconSprite(species, personality, 0, 0, priority, 7);
  g.movingMonSprite!.callback = SpriteCB_HeldMon;
}

function InitBoxMonSprites(boxId: number): void {
  const g = gS();
  let boxPosition = 0;
  let count = 0;
  for (let i = 0; i < IN_BOX_ROWS; i++) {
    for (let j = 0; j < IN_BOX_COLUMNS; j++) {
      const species = GetBoxMonDataAt(boxId, boxPosition, C.MON_DATA_SPECIES_OR_EGG);
      if (species !== C.SPECIES_NONE) {
        const personality = GetBoxMonDataAt(boxId, boxPosition, C.MON_DATA_PERSONALITY);
        g.boxMonsSprites[count] = CreateMonIconSprite(species, personality, 8 * (3 * j) + 100, 8 * (3 * i) + 44, 2, 19 - j);
      } else {
        g.boxMonsSprites[count] = null;
      }
      boxPosition++;
      count++;
    }
  }
  if (g.boxOption === OPTION_MOVE_ITEMS) {
    for (boxPosition = 0; boxPosition < IN_BOX_COUNT; boxPosition++) {
      if (GetBoxMonDataAt(boxId, boxPosition, C.MON_DATA_HELD_ITEM) === 0) g.boxMonsSprites[boxPosition]!.oam.objMode = ST_OAM_OBJ_BLEND;
    }
  }
}

/** CreateBoxMonIconAtPos */
export function CreateBoxMonIconAtPos(boxPosition: number): void {
  const g = gS();
  const species = GetCurrentBoxMonData(boxPosition, C.MON_DATA_SPECIES_OR_EGG);
  if (species !== C.SPECIES_NONE) {
    const x = 8 * (3 * (boxPosition % IN_BOX_COLUMNS)) + 100;
    const y = 8 * (3 * ((boxPosition / IN_BOX_COLUMNS) | 0)) + 44;
    const personality = GetCurrentBoxMonData(boxPosition, C.MON_DATA_PERSONALITY);
    g.boxMonsSprites[boxPosition] = CreateMonIconSprite(species, personality, x, y, 2, 19 - (boxPosition % IN_BOX_COLUMNS));
    if (g.boxOption === OPTION_MOVE_ITEMS) g.boxMonsSprites[boxPosition]!.oam.objMode = ST_OAM_OBJ_BLEND;
  }
}

// Box mon icon scroll sprite data.
const sDistance = 1;
const sSpeed = 2;
const sDestX = 3;
const sDelay = 4;
const sPosX = 5;

function StartBoxMonIconsScrollOut(speed: number): void {
  const g = gS();
  for (let i = 0; i < IN_BOX_COUNT; i++) {
    const sprite = g.boxMonsSprites[i];
    if (sprite) {
      sprite.data[sSpeed] = speed;
      sprite.data[sDelay] = 1;
      sprite.callback = SpriteCB_BoxMonIconScrollOut;
    }
  }
}

function SpriteCB_BoxMonIconScrollIn(sprite: Sprite): void {
  if (sprite.data[sDistance] !== 0) {
    sprite.data[sDistance]--;
    sprite.x += sprite.data[sSpeed];
  } else {
    gS().iconScrollNumIncoming--;
    sprite.x = sprite.data[sDestX];
    sprite.callback = SpriteCallbackDummy;
  }
}

function SpriteCB_BoxMonIconScrollOut(sprite: Sprite): void {
  if (sprite.data[sDelay] !== 0) {
    sprite.data[sDelay]--;
  } else {
    sprite.x += sprite.data[sSpeed];
    sprite.data[sPosX] = sprite.x + sprite.x2;
    // Check if mon icon has scrolled out of view of the box area
    if (sprite.data[sPosX] <= 68 || sprite.data[sPosX] >= 252) sprite.callback = SpriteCallbackDummy;
  }
}

function DestroyAllIconsInColumn(column: number): void {
  const g = gS();
  let boxPosition = column;
  for (let row = 0; row < IN_BOX_ROWS; row++) {
    if (g.boxMonsSprites[boxPosition]) {
      DestroyBoxMonIcon(g.boxMonsSprites[boxPosition]!);
      g.boxMonsSprites[boxPosition] = null;
    }
    boxPosition += IN_BOX_COLUMNS;
  }
}

function CreateBoxMonIconsInColumn(column: number, distance: number, speed: number): number {
  const g = gS();
  let y = 44;
  const xDest = 8 * (3 * column) + 100;
  const x = (xDest - (distance + 1) * speed) & 0xffff;
  const subpriority = 19 - column;
  let count = 0;
  let boxPosition = column;
  for (let i = 0; i < IN_BOX_ROWS; i++) {
    if (g.boxSpecies[boxPosition] !== C.SPECIES_NONE) {
      const sprite = CreateMonIconSprite(g.boxSpecies[boxPosition], g.boxPersonalities[boxPosition], x, y, 2, subpriority);
      g.boxMonsSprites[boxPosition] = sprite;
      if (sprite) {
        sprite.data[sDistance] = distance;
        sprite.data[sSpeed] = speed;
        sprite.data[sDestX] = xDest;
        sprite.callback = SpriteCB_BoxMonIconScrollIn;
        if (g.boxOption === OPTION_MOVE_ITEMS && GetBoxMonDataAt(g.incomingBoxId, boxPosition, C.MON_DATA_HELD_ITEM) === 0) {
          sprite.oam.objMode = ST_OAM_OBJ_BLEND;
        }
        count++;
      }
    }
    boxPosition += IN_BOX_COLUMNS;
    y += 24;
  }
  return count;
}

function InitBoxMonIconScroll(boxId: number, direction: number): void {
  const g = gS();
  g.iconScrollState = 0;
  g.iconScrollToBoxId = boxId;
  g.iconScrollDirection = direction;
  g.iconScrollDistance = 32;
  g.iconScrollSpeed = -(6 * direction);
  g.iconScrollNumIncoming = 0;
  SetBoxSpeciesAndPersonalities(boxId);
  g.iconScrollCurColumn = direction > 0 ? 0 : IN_BOX_COLUMNS - 1;
  g.iconScrollPos = 24 * g.iconScrollCurColumn + 100;
  StartBoxMonIconsScrollOut(g.iconScrollSpeed);
}

function UpdateBoxMonIconScroll(): boolean {
  const g = gS();
  if (g.iconScrollDistance !== 0) g.iconScrollDistance--;
  switch (g.iconScrollState) {
    case 0:
      g.iconScrollPos += g.iconScrollSpeed;
      if (g.iconScrollPos <= 64 || g.iconScrollPos >= 252) {
        // A column of icons has gone offscreen, destroy them
        DestroyAllIconsInColumn(g.iconScrollCurColumn);
        g.iconScrollPos += g.iconScrollDirection * 24;
        g.iconScrollState++;
      }
      break;
    case 1:
      // Create the new incoming column of icons
      g.iconScrollPos += g.iconScrollSpeed;
      g.iconScrollNumIncoming += CreateBoxMonIconsInColumn(g.iconScrollCurColumn, g.iconScrollDistance, g.iconScrollSpeed);
      if ((g.iconScrollDirection > 0 && g.iconScrollCurColumn === IN_BOX_COLUMNS - 1) || (g.iconScrollDirection < 0 && g.iconScrollCurColumn === 0)) {
        // Scroll has reached final column
        g.iconScrollState++;
      } else {
        // Continue scrolling
        g.iconScrollCurColumn += g.iconScrollDirection;
        g.iconScrollState = 0;
      }
      break;
    case 2:
      // Wait to make sure all icons have arrived
      if (g.iconScrollNumIncoming === 0) {
        g.iconScrollDistance++;
        return false;
      }
      break;
    default:
      return false;
  }
  return true;
}

function SetBoxSpeciesAndPersonalities(boxId: number): void {
  const g = gS();
  let boxPosition = 0;
  for (let i = 0; i < IN_BOX_ROWS; i++) {
    for (let j = 0; j < IN_BOX_COLUMNS; j++) {
      g.boxSpecies[boxPosition] = GetBoxMonDataAt(boxId, boxPosition, C.MON_DATA_SPECIES_OR_EGG);
      if (g.boxSpecies[boxPosition] !== C.SPECIES_NONE) g.boxPersonalities[boxPosition] = GetBoxMonDataAt(boxId, boxPosition, C.MON_DATA_PERSONALITY);
      boxPosition++;
    }
  }
  g.incomingBoxId = boxId;
}

/** DestroyBoxMonIconAtPosition */
export function DestroyBoxMonIconAtPosition(boxPosition: number): void {
  const g = gS();
  if (g.boxMonsSprites[boxPosition]) {
    DestroyBoxMonIcon(g.boxMonsSprites[boxPosition]!);
    g.boxMonsSprites[boxPosition] = null;
  }
}

/** SetBoxMonIconObjMode */
export function SetBoxMonIconObjMode(boxPosition: number, objMode: number): void {
  const sprite = gS().boxMonsSprites[boxPosition];
  if (sprite) sprite.oam.objMode = objMode;
}

/** CreatePartyMonsSprites */
export function CreatePartyMonsSprites(visible: boolean): void {
  const g = gS();
  let species = GetMonData(sParty[0], C.MON_DATA_SPECIES_OR_EGG);
  let personality = GetMonData(sParty[0], C.MON_DATA_PERSONALITY);
  g.partySprites[0] = CreateMonIconSprite(species, personality, 104, 64, 1, 12);
  let count = 1;
  for (let i = 1; i < PARTY_SIZE; i++) {
    species = GetMonData(sParty[i], C.MON_DATA_SPECIES_OR_EGG);
    if (species !== C.SPECIES_NONE) {
      personality = GetMonData(sParty[i], C.MON_DATA_PERSONALITY);
      g.partySprites[i] = CreateMonIconSprite(species, personality, 152, 8 * (3 * (i - 1)) + 16, 1, 12);
      count++;
    } else {
      g.partySprites[i] = null;
    }
  }
  if (!visible) {
    for (let i = 0; i < count; i++) {
      g.partySprites[i]!.y -= 160;
      g.partySprites[i]!.invisible = true;
    }
  }
  if (g.boxOption === OPTION_MOVE_ITEMS) {
    for (let i = 0; i < PARTY_SIZE; i++) {
      if (g.partySprites[i] && GetMonData(sParty[i], C.MON_DATA_HELD_ITEM) === 0) g.partySprites[i]!.oam.objMode = ST_OAM_OBJ_BLEND;
    }
  }
}

/** CompactPartySprites */
export function CompactPartySprites(): void {
  const g = gS();
  g.numPartySpritesToCompact = 0;
  for (let i = 0, targetPartyId = 0; i < PARTY_SIZE; i++) {
    if (g.partySprites[i]) {
      if (i !== targetPartyId) {
        MovePartySpriteToNextSlot(g.partySprites[i]!, targetPartyId);
        g.partySprites[i] = null;
        g.numPartySpritesToCompact++;
      }
      targetPartyId++;
    }
  }
}

/** GetNumPartySpritesCompacting */
export function GetNumPartySpritesCompacting(): number {
  return gS().numPartySpritesToCompact;
}

// Party sprite compaction data.
const sPartyId = 1;
const sMonX = 2;
const sMonY = 3;
const sSpeedX = 4;
const sSpeedY = 5;
const sMoveSteps = 6;

function MovePartySpriteToNextSlot(sprite: Sprite, partyId: number): void {
  let x: number;
  let y: number;
  sprite.data[sPartyId] = partyId;
  if (partyId === 0) {
    x = 104;
    y = 64;
  } else {
    x = 152;
    y = 8 * (3 * (partyId - 1)) + 16;
  }
  sprite.data[sMonX] = (sprite.x & 0xffff) * 8;
  sprite.data[sMonY] = (sprite.y & 0xffff) * 8;
  sprite.data[sSpeedX] = ((x * 8 - sprite.data[sMonX]) / 8) | 0;
  sprite.data[sSpeedY] = ((y * 8 - sprite.data[sMonY]) / 8) | 0;
  sprite.data[sMoveSteps] = 8;
  sprite.callback = SpriteCB_MovePartySpriteToNextSlot;
}

function SpriteCB_MovePartySpriteToNextSlot(sprite: Sprite): void {
  if (sprite.data[sMoveSteps] !== 0) {
    sprite.data[sMonX] += sprite.data[sSpeedX];
    const x = sprite.data[sMonX];
    sprite.data[sMonY] += sprite.data[sSpeedY];
    const y = sprite.data[sMonY];
    sprite.x = ((x & 0xffff) / 8) | 0;
    sprite.y = ((y & 0xffff) / 8) | 0;
    sprite.data[sMoveSteps]--;
  } else {
    if (sprite.data[sPartyId] === 0) {
      sprite.x = 104;
      sprite.y = 64;
    } else {
      sprite.x = 152;
      sprite.y = 8 * (3 * (sprite.data[sPartyId] - 1)) + 16;
    }
    sprite.callback = SpriteCallbackDummy;
    gS().partySprites[sprite.data[sPartyId]] = sprite;
    gS().numPartySpritesToCompact--;
  }
}

/** DestroyMovingMonIcon */
export function DestroyMovingMonIcon(): void {
  const g = gS();
  if (g.movingMonSprite) {
    DestroyBoxMonIcon(g.movingMonSprite);
    g.movingMonSprite = null;
  }
}

/** MovePartySprites */
export function MovePartySprites(yDelta: number): void {
  const g = gS();
  for (let i = 0; i < PARTY_SIZE; i++) {
    const sprite = g.partySprites[i];
    if (sprite) {
      sprite.y += yDelta;
      let posY = (sprite.y + sprite.y2 + sprite.centerToCornerVecY) & 0xffff;
      posY += 16;
      sprite.invisible = posY > 192;
    }
  }
}

/** DestroyPartyMonIcon */
export function DestroyPartyMonIcon(partyId: number): void {
  const g = gS();
  if (g.partySprites[partyId]) {
    DestroyBoxMonIcon(g.partySprites[partyId]!);
    g.partySprites[partyId] = null;
  }
}

/** DestroyAllPartyMonIcons */
export function DestroyAllPartyMonIcons(): void {
  const g = gS();
  for (let i = 0; i < PARTY_SIZE; i++) {
    if (g.partySprites[i]) {
      DestroyBoxMonIcon(g.partySprites[i]!);
      g.partySprites[i] = null;
    }
  }
}

/** SetPartyMonIconObjMode */
export function SetPartyMonIconObjMode(partyId: number, objMode: number): void {
  const sprite = gS().partySprites[partyId];
  if (sprite) sprite.oam.objMode = objMode;
}

/** SetMovingMonSprite */
export function SetMovingMonSprite(mode: number, id: number): void {
  const g = gS();
  if (mode === MODE_PARTY) {
    g.movingMonSprite = g.partySprites[id];
    g.partySprites[id] = null;
  } else if (mode === MODE_BOX) {
    g.movingMonSprite = g.boxMonsSprites[id];
    g.boxMonsSprites[id] = null;
  } else {
    return;
  }
  g.movingMonSprite!.callback = SpriteCB_HeldMon;
  g.movingMonSprite!.oam.priority = GetMonIconPriorityByCursorArea();
  g.movingMonSprite!.subpriority = 7;
}

/** SetPlacedMonSprite */
export function SetPlacedMonSprite(boxId: number, position: number): void {
  const g = gS();
  if (boxId === TOTAL_BOXES_COUNT) {
    // party mon
    g.partySprites[position] = g.movingMonSprite;
    g.partySprites[position]!.oam.priority = 1;
    g.partySprites[position]!.subpriority = 12;
  } else {
    g.boxMonsSprites[position] = g.movingMonSprite;
    g.boxMonsSprites[position]!.oam.priority = 2;
    g.boxMonsSprites[position]!.subpriority = 19 - (position % IN_BOX_COLUMNS);
  }
  g.movingMonSprite!.callback = SpriteCallbackDummy;
  g.movingMonSprite = null;
}

/** SetShiftMonSpritePtr */
export function SetShiftMonSpritePtr(boxId: number, position: number): void {
  const g = gS();
  g.shiftMonSpritePtr = boxId === TOTAL_BOXES_COUNT ? partySlot(position) : boxSlot(position);
  g.movingMonSprite!.callback = SpriteCallbackDummy;
  g.shiftTimer = 0;
}

/** ShiftMons */
export function ShiftMons(): boolean {
  const g = gS();
  if (g.shiftTimer === 16) return false;
  g.shiftTimer++;
  const shifted = g.shiftMonSpritePtr!.get()!;
  if (g.shiftTimer & 1) {
    shifted.y--;
    g.movingMonSprite!.y++;
  }
  shifted.x2 = (gSineTable[g.shiftTimer * 8] / 16) | 0;
  g.movingMonSprite!.x2 = -((gSineTable[g.shiftTimer * 8] / 16) | 0);
  if (g.shiftTimer === 8) {
    g.movingMonSprite!.oam.priority = shifted.oam.priority;
    g.movingMonSprite!.subpriority = shifted.subpriority;
    shifted.oam.priority = GetMonIconPriorityByCursorArea();
    shifted.subpriority = 7;
  }
  if (g.shiftTimer === 16) {
    const sprite = g.movingMonSprite!;
    g.movingMonSprite = shifted;
    g.shiftMonSpritePtr!.set(sprite);
    g.movingMonSprite.callback = SpriteCB_HeldMon;
    sprite.callback = SpriteCallbackDummy;
  }
  return true;
}

/** DoReleaseMonAnim */
export function DoReleaseMonAnim(mode: number, position: number): void {
  const g = gS();
  switch (mode) {
    case MODE_PARTY: g.releaseMonSpritePtr = partySlot(position); break;
    case MODE_BOX: g.releaseMonSpritePtr = boxSlot(position); break;
    case MODE_MOVE: g.releaseMonSpritePtr = movingSlot(); break;
    default: return;
  }
  const sprite = g.releaseMonSpritePtr.get();
  if (sprite) {
    InitSpriteAffineAnim(sprite);
    sprite.oam.affineMode = ST_OAM_AFFINE_NORMAL;
    sprite.affineAnims = affineAnimsFrom(sym("sAffineAnims_ReleaseMon"));
    StartSpriteAffineAnim(sprite, RELEASE_ANIM_RELEASE);
  }
}

/** TryHideReleaseMonSprite */
export function TryHideReleaseMonSprite(): boolean {
  const sprite = gS().releaseMonSpritePtr!.get();
  if (!sprite || sprite.invisible) return false;
  if (sprite.affineAnimEnded) sprite.invisible = true;
  return true;
}

/** DestroyReleaseMonIcon */
export function DestroyReleaseMonIcon(): void {
  const slot = gS().releaseMonSpritePtr!;
  const sprite = slot.get();
  if (sprite) {
    FreeOamMatrix(sprite.oam.matrixNum);
    DestroyBoxMonIcon(sprite);
    slot.set(null);
  }
}

/** DoReleaseMonComeBackAnim */
export function DoReleaseMonComeBackAnim(): void {
  const sprite = gS().releaseMonSpritePtr!.get();
  if (sprite) {
    sprite.invisible = false;
    StartSpriteAffineAnim(sprite, RELEASE_ANIM_COME_BACK);
  }
}

/** ResetReleaseMonSpritePtr */
export function ResetReleaseMonSpritePtr(): boolean {
  const g = gS();
  if (g.releaseMonSpritePtr === null) return false;
  if (g.releaseMonSpritePtr.get()!.affineAnimEnded) g.releaseMonSpritePtr = null;
  return true;
}

/** SetMovingMonPriority */
export function SetMovingMonPriority(priority: number): void {
  // The C writes through movingMonSprite unconditionally; with no mon in hand that store lands in unmapped memory.
  const sprite = gS().movingMonSprite;
  if (sprite) sprite.oam.priority = priority;
}

function SpriteCB_HeldMon(sprite: Sprite): void {
  const cursor = gS().cursorSprite!;
  sprite.x = cursor.x;
  sprite.y = cursor.y + cursor.y2 + 4;
}

function TryLoadMonIconTiles(species: number): number {
  const g = gS();
  let i: number;
  // Find the currently-allocated slot
  for (i = 0; i < MAX_MON_ICONS; i++) if (g.iconSpeciesList[i] === species) break;
  if (i === MAX_MON_ICONS) {
    // Find the first empty slot
    for (i = 0; i < MAX_MON_ICONS; i++) if (g.iconSpeciesList[i] === C.SPECIES_NONE) break;
    if (i === MAX_MON_ICONS) return 0xffff;
  }
  g.iconSpeciesList[i] = species;
  g.numIconsPerSpecies[i]++;
  const offset = 16 * i;
  ppu.vram.set(GetMonIconTiles(species, true).subarray(0, 0x200), OBJ_VRAM0 + offset * TILE_SIZE_4BPP);
  return offset;
}

function RemoveSpeciesFromIconList(species: number): void {
  const g = gS();
  for (let i = 0; i < MAX_MON_ICONS; i++) {
    if (g.iconSpeciesList[i] === species) {
      if (--g.numIconsPerSpecies[i] === 0) g.iconSpeciesList[i] = C.SPECIES_NONE;
      break;
    }
  }
}

/** CreateMonIconSprite */
export function CreateMonIconSprite(species: number, personality: number, x: number, y: number, oamPriority: number, subpriority: number): Sprite | null {
  const template = sMonIconTemplate();
  species = GetIconSpecies(species, personality);
  template.paletteTag = PALTAG_MON_ICON_0 + GetMonIconPaletteIndexFromSpecies(species);
  const tileNum = TryLoadMonIconTiles(species);
  if (tileNum === 0xffff) return null;
  const spriteId = CreateSprite(template, x, y, subpriority);
  if (spriteId === MAX_SPRITES) {
    RemoveSpeciesFromIconList(species);
    return null;
  }
  gSprites[spriteId].oam.tileNum = tileNum;
  gSprites[spriteId].oam.priority = oamPriority;
  gSprites[spriteId].data[0] = species;
  return gSprites[spriteId];
}

function DestroyBoxMonIcon(sprite: Sprite): void {
  RemoveSpeciesFromIconList(sprite.data[0]);
  DestroySprite(sprite);
}

// Task_InitBox data
const tState = 0;
const tDmaIdx = 1;
const tBoxId = 2;

/** CreateInitBoxTask */
export function CreateInitBoxTask(boxId: number): void {
  const taskId = tasks.create(Task_InitBox, 2);
  tasks.tasks[taskId].data[tBoxId] = boxId;
}

/** IsInitBoxActive */
export function IsInitBoxActive(): boolean {
  return FuncIsActiveTask(Task_InitBox);
}

function Task_InitBox(taskId: number): void {
  const g = gS();
  const task = tasks.tasks[taskId];
  switch (task.data[tState]) {
    case 0:
      g.wallpaperOffset = 0;
      g.bg2_X = 0;
      // RequestDma3Fill(0, wallpaperBgTilemapBuffer): the DMA completes at once in the browser backend.
      g.wallpaperBgTilemapBuffer.fill(0);
      task.data[tDmaIdx] = 0;
      break;
    case 1:
      SetBgTilemapBuffer(2, g.wallpaperBgTilemapBuffer);
      ShowBg(2);
      break;
    case 2:
      LoadWallpaperGfx(task.data[tBoxId], 0);
      break;
    case 3:
      if (!WaitForWallpaperGfxLoad()) return;
      InitBoxTitle(task.data[tBoxId]);
      CreateBoxScrollArrows();
      InitBoxMonSprites(task.data[tBoxId]);
      // BGCNT_PRIORITY(2) | BGCNT_CHARBASE(2) | BGCNT_SCREENBASE(27) | BGCNT_TXT512x256
      SetGpuReg(REG_OFFSET_BG2CNT, 2 | (2 << 2) | (27 << 8) | (1 << 14));
      break;
    case 4:
      tasks.destroy(taskId);
      break;
    default:
      task.data[tState] = 0;
      return;
  }
  task.data[tState]++;
}

/** SetUpScrollToBox */
export function SetUpScrollToBox(boxId: number): void {
  const g = gS();
  const direction = DetermineBoxScrollDirection(boxId);
  g.scrollSpeed = direction > 0 ? 6 : -6;
  g.scrollTimer = 32;
  g.scrollToBoxId = boxId;
  g.scrollDirection = direction;
  g.scrollState = 0;
}

/** ScrollToBox */
export function ScrollToBox(): boolean {
  const g = gS();
  let isStillScrolling: boolean;
  switch (g.scrollState) {
    case 0:
      LoadWallpaperGfx(g.scrollToBoxId, g.scrollDirection);
      g.scrollState++;
    // fallthrough
    case 1:
      if (!WaitForWallpaperGfxLoad()) return true;
      InitBoxMonIconScroll(g.scrollToBoxId, g.scrollDirection);
      CreateIncomingBoxTitle(g.scrollToBoxId, g.scrollDirection);
      StartBoxScrollArrowsSlide(g.scrollDirection);
      break;
    case 2:
      isStillScrolling = UpdateBoxMonIconScroll();
      if (g.scrollTimer !== 0) {
        g.bg2_X = (g.bg2_X + g.scrollSpeed) & 0xffff;
        if (--g.scrollTimer !== 0) return true;
        CycleBoxTitleSprites();
        StopBoxScrollArrowsSlide();
      }
      return isStillScrolling;
  }
  g.scrollState++;
  return true;
}

function DetermineBoxScrollDirection(boxId: number): number {
  let currentBox = StorageGetCurrentBox();
  let i: number;
  for (i = 0; currentBox !== boxId; i++) {
    currentBox++;
    if (currentBox >= TOTAL_BOXES_COUNT) currentBox = 0;
  }
  return i < TOTAL_BOXES_COUNT / 2 ? 1 : -1;
}

/** SetWallpaperForCurrentBox */
export function SetWallpaperForCurrentBox(wallpaperId: number): void {
  SetBoxWallpaper(StorageGetCurrentBox(), wallpaperId);
  gS().wallpaperChangeState = 0;
}

/** DoWallpaperGfxChange */
export function DoWallpaperGfxChange(): boolean {
  const g = gS();
  switch (g.wallpaperChangeState) {
    case 0:
      BeginNormalPaletteFade(g.wallpaperPalBits, 1, 0, 16, RGB_WHITEALPHA);
      g.wallpaperChangeState++;
      break;
    case 1:
      if (!UpdatePaletteFade()) {
        LoadWallpaperGfx(StorageGetCurrentBox(), 0);
        g.wallpaperChangeState++;
      }
      break;
    case 2:
      if (WaitForWallpaperGfxLoad()) {
        CycleBoxTitleColor();
        BeginNormalPaletteFade(g.wallpaperPalBits, 1, 16, 0, RGB_WHITEALPHA);
        g.wallpaperChangeState++;
      }
      break;
    case 3:
      if (!UpdatePaletteFade()) g.wallpaperChangeState++;
      break;
    case 4:
      return false;
  }
  return true;
}

function LoadWallpaperGfx(boxId: number, direction: number): void {
  const g = gS();
  g.wallpaperLoadState = 0;
  g.wallpaperLoadBoxId = boxId;
  g.wallpaperLoadDir = direction;
  if (g.wallpaperLoadDir !== 0) {
    g.wallpaperOffset = g.wallpaperOffset ? 0 : 1;
    TrimOldWallpaper(g.wallpaperBgTilemapBuffer);
  }
  const wallpaperId = GetBoxWallpaper(g.wallpaperLoadBoxId);
  const wallpaper = Wallpaper(wallpaperId);
  g.wallpaperTilemap.set(wallpaper.tileMap.subarray(0, g.wallpaperTilemap.length));
  DrawWallpaper(g.wallpaperBgTilemapBuffer, g.wallpaperTilemap, g.wallpaperLoadDir, g.wallpaperOffset);
  const palOffset = BG_PLTT_ID(4) + BG_PLTT_ID(g.wallpaperOffset * 2);
  if (g.wallpaperLoadDir !== 0) {
    LoadPalette(wallpaper.palettes, palOffset, 2 * PLTT_SIZE_4BPP);
  } else {
    // CpuCopy16 into the unfaded buffer only
    gPlttBufferUnfaded.set(wallpaper.palettes.subarray(0, 32), palOffset);
  }
  // DecompressAndLoadBgGfxUsingHeap(2, tiles, 0, 256 * wallpaperOffset, 0)
  LoadBgTiles(2, wallpaper.tiles, wallpaper.tiles.length, 256 * g.wallpaperOffset);
  CopyBgTilemapBufferToVram(2);
}

function WaitForWallpaperGfxLoad(): boolean {
  return !IsDma3ManagerBusyWithBgCopy();
}

function DrawWallpaper(_unused: Uint16Array, tilemap: Uint16Array, direction: number, offset: number): void {
  const g = gS();
  const paletteNum = offset * 2 + 3;
  let x = (((g.bg2_X / 8) | 0) + 10 + direction * 24) & 0x3f;
  CopyRectToBgTilemapBufferRect(2, tilemap, 0, 0, 20, 18, x, 2, 20, 18, 17, offset << 8, paletteNum);
  if (direction === 0) return;
  else if (direction > 0) x += 20;
  else x -= 4;
  FillBgTilemapBufferRect(2, 0, x, 2, 4, 18, 17);
}

function TrimOldWallpaper(tilemapBuffer: Uint16Array): void {
  const g = gS();
  let right = (((g.bg2_X / 8) | 0) + 10 + 20) & 0x3f;
  let dest = right < 32 ? right + 0x260 : right + 0x640;
  for (let i = 0; i < 44; i++) {
    tilemapBuffer[dest++] = 0;
    right = (right + 1) & 0x3f;
    if (right === 0) dest -= 0x420;
    if (right === 32) dest += 0x3e0;
  }
}

function InitBoxTitle(boxId: number): void {
  const g = gS();
  const wallpaperId = GetBoxWallpaper(boxId);
  const colors = boxTitleColors(wallpaperId);
  g.boxTitlePal[14] = colors[0];
  g.boxTitlePal[15] = colors[1];
  LoadSpritePalettes([{ data: g.boxTitlePal, tag: PALTAG_BOX_TITLE }]);
  g.wallpaperPalBits = 0x3f0;

  let tagIndex = IndexOfSpritePaletteTag(PALTAG_BOX_TITLE);
  g.boxTitlePalOffset = OBJ_PLTT_ID(tagIndex) + 14;
  g.wallpaperPalBits = (g.wallpaperPalBits | ((1 << 16) << tagIndex)) >>> 0;

  tagIndex = IndexOfSpritePaletteTag(PALTAG_BOX_TITLE);
  g.boxTitleAltPalOffset = OBJ_PLTT_ID(tagIndex) + 14;
  g.wallpaperPalBits = (g.wallpaperPalBits | ((1 << 16) << tagIndex)) >>> 0;

  StringCopyPadded(g.boxTitleText, GetBoxNamePtr(boxId)!, 0, 8);
  DrawTextWindowAndBufferTiles(g.boxTitleText, g.boxTitleTiles, 0, 0, null, 2);
  LoadSpriteSheet({ data: g.boxTitleTiles, size: 0x200, tag: GFXTAG_BOX_TITLE });
  const x = GetBoxTitleBaseX(GetBoxNamePtr(boxId)!);
  for (let i = 0; i < 2; i++) {
    const spriteId = CreateSprite(sBoxTitleTemplate(), x + i * 32, 28, 24);
    g.curBoxTitleSprites[i] = gSprites[spriteId];
    StartSpriteAnim(g.curBoxTitleSprites[i]!, i);
  }
  g.boxTitleCycleId = 0;
}

function CreateIncomingBoxTitle(boxId: number, direction: number): void {
  const g = gS();
  const spriteSheet = { data: g.boxTitleTiles, size: 0x200, tag: GFXTAG_BOX_TITLE };
  const template = sBoxTitleTemplate();
  g.boxTitleCycleId = g.boxTitleCycleId ? 0 : 1;
  const palOffset = g.boxTitlePalOffset;
  if (g.boxTitleCycleId === 0) {
    spriteSheet.tag = GFXTAG_BOX_TITLE;
  } else {
    spriteSheet.tag = GFXTAG_BOX_TITLE_ALT;
    template.tileTag = GFXTAG_BOX_TITLE_ALT;
    template.paletteTag = PALTAG_BOX_TITLE;
  }
  StringCopyPadded(g.boxTitleText, GetBoxNamePtr(boxId)!, 0, BOX_NAME_LENGTH);
  DrawTextWindowAndBufferTiles(g.boxTitleText, g.boxTitleTiles, 0, 0, null, 2);
  LoadSpriteSheet(spriteSheet);
  LoadPalette(boxTitleColors(GetBoxWallpaper(boxId)), palOffset, 4);
  const x = GetBoxTitleBaseX(GetBoxNamePtr(boxId)!);
  const adjustedX = x + direction * 192;
  // Title is split across two sprites
  for (let i = 0; i < 2; i++) {
    const spriteId = CreateSprite(template, i * 32 + adjustedX, 28, 24);
    const next = gSprites[spriteId];
    g.nextBoxTitleSprites[i] = next;
    next.data[0] = -direction * 6;
    next.data[1] = i * 32 + x;
    next.data[2] = 0;
    next.callback = SpriteCB_IncomingBoxTitle;
    StartSpriteAnim(next, i);

    g.curBoxTitleSprites[i]!.data[0] = -direction * 6;
    g.curBoxTitleSprites[i]!.data[1] = 1;
    g.curBoxTitleSprites[i]!.callback = SpriteCB_OutgoingBoxTitle;
  }
}

function CycleBoxTitleSprites(): void {
  const g = gS();
  if (g.boxTitleCycleId === 0) FreeSpriteTilesByTag(GFXTAG_BOX_TITLE_ALT);
  else FreeSpriteTilesByTag(GFXTAG_BOX_TITLE);
  g.curBoxTitleSprites[0] = g.nextBoxTitleSprites[0];
  g.curBoxTitleSprites[1] = g.nextBoxTitleSprites[1];
}

function SpriteCB_IncomingBoxTitle(sprite: Sprite): void {
  if (sprite.data[2] !== 0) {
    sprite.data[2]--;
  } else {
    sprite.x += sprite.data[0];
    if (sprite.x === sprite.data[1]) sprite.callback = SpriteCallbackDummy;
  }
}

function SpriteCB_OutgoingBoxTitle(sprite: Sprite): void {
  if (sprite.data[1] !== 0) {
    sprite.data[1]--;
  } else {
    sprite.x += sprite.data[0];
    sprite.data[2] = sprite.x + sprite.x2;
    if (sprite.data[2] < 0x40 || sprite.data[2] > 0x100) DestroySprite(sprite);
  }
}

function CycleBoxTitleColor(): void {
  const g = gS();
  const wallpaperId = GetBoxWallpaper(StorageGetCurrentBox());
  const colors = boxTitleColors(wallpaperId);
  const offset = g.boxTitleCycleId === 0 ? g.boxTitlePalOffset : g.boxTitleAltPalOffset;
  gPlttBufferUnfaded[offset] = colors[0];
  gPlttBufferUnfaded[offset + 1] = colors[1];
}

function GetBoxTitleBaseX(string: ArrayLike<number>): number {
  return DISPLAY_WIDTH - 64 - ((GetStringWidth(FONT_NORMAL_COPY_1, string, 0) / 2) | 0);
}

// Box scroll arrow sprite data
const arrowState = 0;
const arrowTimer = 1;
const arrowSpeed = 3;

function CreateBoxScrollArrows(): void {
  const g = gS();
  LoadSpriteSheet({ data: bin("sBoxScrollArrow_Gfx"), size: 0x0080, tag: GFXTAG_BOX_SCROLL_ARROW });
  for (let i = 0; i < 2; i++) {
    const spriteId = CreateSprite(sBoxScrollArrowTemplate(), 92 + i * 136, 28, 22);
    if (spriteId !== MAX_SPRITES) {
      const sprite = gSprites[spriteId];
      StartSpriteAnim(sprite, i);
      sprite.data[arrowSpeed] = i === 0 ? -1 : 1;
      g.arrowSprites[i] = sprite;
    }
  }
  if (IsCursorOnBoxTitle()) AnimateBoxScrollArrows(true);
}

// Slide box scroll arrows horizontally for box change
function StartBoxScrollArrowsSlide(direction: number): void {
  const a = gS().arrowSprites;
  for (let i = 0; i < 2; i++) {
    a[i]!.x2 = 0;
    a[i]!.data[arrowState] = 2;
  }
  if (direction < 0) {
    a[0]!.data[arrowTimer] = 29;
    a[1]!.data[arrowTimer] = 5;
    a[0]!.data[2] = 72;
    a[1]!.data[2] = 72;
  } else {
    a[0]!.data[arrowTimer] = 5;
    a[1]!.data[arrowTimer] = 29;
    a[0]!.data[2] = DISPLAY_WIDTH + 8;
    a[1]!.data[2] = DISPLAY_WIDTH + 8;
  }
  a[0]!.data[7] = 0;
  a[1]!.data[7] = 1;
}

// New box's scroll arrows have entered, stop sliding and set their position
function StopBoxScrollArrowsSlide(): void {
  const a = gS().arrowSprites;
  for (let i = 0; i < 2; i++) {
    a[i]!.x = 136 * i + 92;
    a[i]!.x2 = 0;
    a[i]!.invisible = false;
  }
  AnimateBoxScrollArrows(true);
}

/** AnimateBoxScrollArrows: bounce scroll arrows while the title is selected. */
export function AnimateBoxScrollArrows(animate: boolean): void {
  const a = gS().arrowSprites;
  if (animate) {
    // Start arrows moving
    for (let i = 0; i < 2; i++) {
      a[i]!.data[arrowState] = 1;
      a[i]!.data[arrowTimer] = 0;
      a[i]!.data[2] = 0;
      a[i]!.data[4] = 0;
    }
  } else {
    // Stop arrows moving
    for (let i = 0; i < 2; i++) a[i]!.data[arrowState] = 0;
  }
}

function SpriteCB_BoxScrollArrow(sprite: Sprite): void {
  switch (sprite.data[arrowState]) {
    case 0:
      sprite.x2 = 0;
      break;
    case 1:
      if (++sprite.data[arrowTimer] > 3) {
        sprite.data[arrowTimer] = 0;
        sprite.x2 += sprite.data[arrowSpeed];
        if (++sprite.data[2] > 5) {
          sprite.data[2] = 0;
          sprite.x2 = 0;
        }
      }
      break;
    case 2:
      sprite.data[arrowState] = 3;
      break;
    case 3:
      sprite.x -= gS().scrollSpeed;
      if (sprite.x <= 72 || sprite.x >= DISPLAY_WIDTH + 8) sprite.invisible = true;
      if (--sprite.data[arrowTimer] === 0) {
        sprite.x = sprite.data[2];
        sprite.invisible = false;
        sprite.data[arrowState] = 4;
      }
      break;
    case 4:
      sprite.x -= gS().scrollSpeed;
      break;
  }
}

/** CreateChooseBoxArrows: arrows for Deposit/Jump Box selection. */
export function CreateChooseBoxArrows(x: number, y: number, animId: number, priority: number, subpriority: number): Sprite | null {
  const spriteId = CreateSprite(sBoxScrollArrowTemplate(), x, y, subpriority);
  if (spriteId === MAX_SPRITES) return null;
  animId %= 2;
  StartSpriteAnim(gSprites[spriteId], animId);
  gSprites[spriteId].oam.priority = priority;
  gSprites[spriteId].callback = SpriteCallbackDummy;
  return gSprites[spriteId];
}
