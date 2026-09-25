// tilemap_util.c: moving/clipping views into three Pokémon Storage System
// tilemaps ("PKMN Data" text, party menu, close box button). A tilemap is a
// Uint16Array for text BGs (tileSize 2) or a Uint8Array for affine BGs
// (tileSize 1); offsets are kept in bytes like the C and divided on use.

import { BG_ATTR_BGTYPE, BG_ATTR_SCREENSIZE, CopyToBgTilemapBufferRect, GetBgAttribute } from "./bg";

type TilemapUtil_RectData = { x: number; y: number; width: number; height: number; destX: number; destY: number };

type TilemapUtil = {
  prev: TilemapUtil_RectData; // Only read in unused function
  cur: TilemapUtil_RectData;
  savedTilemap: ArrayLike<number> | null; // Only written in unused function
  tilemap: ArrayLike<number> | null;
  altWidth: number; // Never read
  altHeight: number; // Never read
  width: number;
  height: number;
  rowSize: number; // Never read
  tileSize: number;
  bg: number;
  active: boolean; // Only read in unused function
};

let sTilemapUtil: TilemapUtil[] = [];
let sNumTilemapUtilIds = 0;

const sTilemapDimensions = [
  [{ width: 256, height: 256 }, { width: 512, height: 256 }, { width: 256, height: 512 }, { width: 512, height: 512 }],
  [{ width: 128, height: 128 }, { width: 256, height: 256 }, { width: 512, height: 512 }, { width: 1024, height: 1024 }],
];

const s16 = (v: number) => (v << 16) >> 16;
const u16 = (v: number) => v & 0xffff;
const emptyRect = (): TilemapUtil_RectData => ({ x: 0, y: 0, width: 0, height: 0, destX: 0, destY: 0 });

export function TilemapUtil_Init(numTilemapIds: number): void {
  sTilemapUtil = Array.from({ length: numTilemapIds & 0xff }, () => ({
    prev: emptyRect(), cur: emptyRect(), savedTilemap: null, tilemap: null, altWidth: 0, altHeight: 0,
    width: 0, height: 0, rowSize: 0, tileSize: 0, bg: 0, active: false,
  }));
  sNumTilemapUtilIds = numTilemapIds & 0xff;
}

export function TilemapUtil_Free(): void {
  sTilemapUtil = [];
}

// Unused
export function TilemapUtil_UpdateAll(): void {
  for (let i = 0; i < sNumTilemapUtilIds; i++) {
    if (sTilemapUtil[i]!.active) TilemapUtil_Update(i);
  }
}

export function TilemapUtil_SetTilemap(tilemapId: number, bg: number, tilemap: ArrayLike<number>, width: number, height: number): void {
  if (tilemapId < sNumTilemapUtilIds) {
    const t = sTilemapUtil[tilemapId]!;
    t.savedTilemap = null;
    t.tilemap = tilemap;
    t.bg = bg;
    t.width = u16(width);
    t.height = u16(height);
    const screenSize = GetBgAttribute(bg, BG_ATTR_SCREENSIZE);
    const bgType = GetBgAttribute(bg, BG_ATTR_BGTYPE);
    t.altWidth = sTilemapDimensions[bgType]![screenSize]!.width;
    t.altHeight = sTilemapDimensions[bgType]![screenSize]!.height;
    t.tileSize = bgType !== 0 ? 1 : 2;
    t.rowSize = u16(width * t.tileSize);
    t.cur = { x: 0, y: 0, width: t.width, height: t.height, destX: 0, destY: 0 };
    t.prev = { ...t.cur };
    t.active = true;
  }
}

// Unused
export function TilemapUtil_SetSavedMap(tilemapId: number, tilemap: ArrayLike<number>): void {
  if (tilemapId < sNumTilemapUtilIds) {
    sTilemapUtil[tilemapId]!.savedTilemap = tilemap;
    sTilemapUtil[tilemapId]!.active = true;
  }
}

export function TilemapUtil_SetPos(tilemapId: number, destX: number, destY: number): void {
  if (tilemapId < sNumTilemapUtilIds) {
    sTilemapUtil[tilemapId]!.cur.destX = s16(destX);
    sTilemapUtil[tilemapId]!.cur.destY = s16(destY);
    sTilemapUtil[tilemapId]!.active = true;
  }
}

export function TilemapUtil_SetRect(tilemapId: number, x: number, y: number, width: number, height: number): void {
  if (tilemapId < sNumTilemapUtilIds) {
    const cur = sTilemapUtil[tilemapId]!.cur;
    cur.x = s16(x);
    cur.y = s16(y);
    cur.width = u16(width);
    cur.height = u16(height);
    sTilemapUtil[tilemapId]!.active = true;
  }
}

export function TilemapUtil_Move(tilemapId: number, mode: number, param: number): void {
  if (tilemapId < sNumTilemapUtilIds) {
    const cur = sTilemapUtil[tilemapId]!.cur;
    param = (param << 24) >> 24;
    switch (mode) {
    case 0:
      cur.destX = s16(cur.destX + param);
      cur.width = u16(cur.width - param);
      break;
    case 1:
      cur.x = s16(cur.x + param);
      cur.width = u16(cur.width + param);
      break;
    case 2:
      cur.destY = s16(cur.destY + param);
      cur.height = u16(cur.height - param);
      break;
    case 3: // this is the only mode ever used
      cur.y = s16(cur.y - param);
      cur.height = u16(cur.height + param);
      break;
    case 4:
      cur.destX = s16(cur.destX + param);
      break;
    case 5:
      cur.destY = s16(cur.destY + param);
      break;
    }
    sTilemapUtil[tilemapId]!.active = true;
  }
}

export function TilemapUtil_Update(tilemapId: number): void {
  if (tilemapId < sNumTilemapUtilIds) {
    const t = sTilemapUtil[tilemapId]!;
    if (t.savedTilemap !== null) TilemapUtil_DrawPrev(tilemapId); // Always false
    TilemapUtil_Draw(tilemapId);
    t.prev = { ...t.cur };
  }
}

function drawRows(t: TilemapUtil, src: ArrayLike<number>, rowSize: number, start: number, rect: TilemapUtil_RectData): void {
  const unit = t.tileSize; // bytes per tilemap entry
  let offset = start;
  for (let i = 0; i < rect.height; i++) {
    const from = offset / unit;
    const row = Array.from({ length: rect.width }, (_, k) => src[from + k] ?? 0);
    CopyToBgTilemapBufferRect(t.bg, row, rect.destX, rect.destY + i, rect.width, 1);
    offset += rowSize;
  }
}

// Never called, see TilemapUtil_Update
function TilemapUtil_DrawPrev(tilemapId: number): void {
  const t = sTilemapUtil[tilemapId]!;
  const rowSize = t.tileSize * t.altWidth;
  drawRows(t, t.savedTilemap!, rowSize, rowSize * t.prev.destY + t.prev.destX * t.tileSize, t.prev);
}

function TilemapUtil_Draw(tilemapId: number): void {
  const t = sTilemapUtil[tilemapId]!;
  const rowSize = t.tileSize * t.width;
  drawRows(t, t.tilemap!, rowSize, rowSize * t.cur.y + t.cur.x * t.tileSize, t.cur);
}
