// Port of itemfinder.c: hidden-item search, connected-map coordinate mapping,
// response tasks, and arrow/star callbacks. The field Canvas draws the source
// 4bpp sprite sheet through a small palette/rendering adaptation.

import * as C from "../generated/constants";
import { sound } from "../audio/sound";
import { cdata, incbin, loadCData, preloadIncbin } from "../hw/assets";
import { Sprite, type Sprite as FieldSprite } from "../gba/sprite";
import { rom, type MapBgEvent, type MapHeader } from "../rom";
import { flagGet, SV, varSet } from "../save";
import { tasks } from "../gba/tasks";
import { joy, A_BUTTON, B_BUTTON } from "../gba/input";
import { TV_PrintIntToStringVar } from "../gba/charmap";
import { DIR_EAST, DIR_NONE, DIR_NORTH, DIR_SOUTH, DIR_WEST, type ObjectEvent } from "../field/objectEvents";
import { GetMapConnectionAtPos, CONNECTION_EAST, CONNECTION_NORTH, CONNECTION_SOUTH, CONNECTION_WEST, MAP_OFFSET, type LoadedConnection } from "../field/fieldmap";
import { canvas, rgb555 } from "../field/gfx4bpp";
import { EncodeHiddenItemData, GetHiddenItemAttr } from "../field/hiddenItem";
import type { Game } from "../game";

type HiddenItem = Extract<MapBgEvent, { type: "hidden_item" }>;
type ItemFinderContext = { game: Game; player: ObjectEvent; underfoot: boolean; afterMessage?: (taskId: number) => void };
const contexts = new Map<number, ItemFinderContext>();

const tItemX = 0, tItemY = 1, tHiddenItemFound = 2, tDingTimer = 3;
const tNumDingsRemaining = 4, tDingNum = 5, tUnderfoot = 6, tStartSpriteId = 7;
const SPRITE_CENTER_X = 120, SPRITE_CENTER_Y = 76;
let spriteFrames: HTMLCanvasElement[] | undefined;

type CAnimFrame = { frame?: { imageValue: number; duration: number }; type?: number };

/** Entry installed by ItemUseOutOfBattle_Itemfinder's field callback. */
export async function startItemFinder(game: Game): Promise<void> {
  await Promise.all([
    loadCData("itemfinder"),
    preloadIncbin(["itemfinder.c:sArrowAndStarSpriteTiles"]),
  ]);
  const taskId = tasks.create(() => {}, 80);
  ItemUseOnFieldCB_Itemfinder(game, taskId);
}

/** ItemUseOnFieldCB_Itemfinder from itemfinder.c. */
export function ItemUseOnFieldCB_Itemfinder(game: Game, taskId: number): void {
  const data = tasks.data(taskId);
  for (let i = 0; i < 16; i++) data[i] = 0;
  contexts.set(taskId, { game, player: game.overworld.player.object, underfoot: false });
  if (HiddenItemIsWithinRangeOfPlayer(game, taskId)) {
    if (data[tUnderfoot]) tasks.setFunc(taskId, Task_ItemfinderUnderfootSoundsAndAnims);
    else tasks.setFunc(taskId, Task_ItemfinderResponseSoundsAndAnims);
  } else {
    DisplayItemMessageOnField(taskId, game, rom.text("gText_NopeTheresNoResponse"), Task_NoResponse_CleanUp);
  }
}

function context(taskId: number): ItemFinderContext {
  const value = contexts.get(taskId);
  if (!value) throw new Error(`missing Item Finder task context ${taskId}`);
  return value;
}

function Task_NoResponse_CleanUp(taskId: number): void {
  const { game, player } = context(taskId);
  releasePlayer(game, player);
  contexts.delete(taskId);
  tasks.destroy(taskId);
}

function Task_ItemfinderResponseSoundsAndAnims(taskId: number): void {
  const data = tasks.data(taskId), { game } = context(taskId);
  if (data[tDingTimer]! % 25 === 0) {
    const direction = GetPlayerDirectionTowardsHiddenItem(data[tItemX]!, data[tItemY]!);
    if (data[tNumDingsRemaining] === 0) {
      tasks.setFunc(taskId, Task_ItemfinderResponsePrintMessage);
      return;
    }
    sound.playSE(C.SE_ITEMFINDER);
    CreateArrowSprite(game, data[tDingNum]!, direction);
    data[tDingNum]!++;
    data[tNumDingsRemaining]!--;
  }
  data[tDingTimer]!++;
}

function Task_ItemfinderUnderfootSoundsAndAnims(taskId: number): void {
  const data = tasks.data(taskId), { game } = context(taskId);
  if (data[tDingTimer]! % 25 === 0) {
    if (data[tNumDingsRemaining] === 0) {
      tasks.setFunc(taskId, Task_ItemfinderUnderfootPrintMessage);
      return;
    }
    sound.playSE(C.SE_ITEMFINDER);
    data[tStartSpriteId] = CreateStarSprite(game);
    data[tDingNum]!++;
    data[tNumDingsRemaining]!--;
  }
  data[tDingTimer]!++;
}

function HiddenItemIsWithinRangeOfPlayer(game: Game, taskId: number): boolean {
  const data = tasks.data(taskId), player = context(taskId).player;
  const x = player.currentCoords.x, y = player.currentCoords.y;
  data[tHiddenItemFound] = 0;
  for (const bg of game.overworld.header.bgs) {
    if (bg.type !== "hidden_item") continue;
    const hiddenItem = EncodeHiddenItemData(bg);
    const flag = GetHiddenItemAttr(hiddenItem, C.HIDDEN_ITEM_FLAG);
    if (flagGet(flag)) continue;
    const dx = bg.x + MAP_OFFSET - x, dy = bg.y + MAP_OFFSET - y;
    if (GetHiddenItemAttr(hiddenItem, C.HIDDEN_ITEM_UNDERFOOT) === 1) {
      if (dx === 0 && dy === 0) {
        SetUnderfootHiddenItem(taskId, bg);
        return true;
      }
    } else if (dx >= -7 && dx <= 7 && dy >= -5 && dy <= 5) {
      RegisterHiddenItemRelativeCoordsIfCloser(taskId, dx, dy);
    }
  }
  FindHiddenItemsInConnectedMaps(game, taskId);
  if (data[tHiddenItemFound]) {
    SetNormalHiddenItem(taskId);
    return true;
  }
  return false;
}

function SetUnderfootHiddenItem(taskId: number, hiddenItem: HiddenItem): void {
  const data = tasks.data(taskId);
  const raw = EncodeHiddenItemData(hiddenItem);
  const item = GetHiddenItemAttr(raw, C.HIDDEN_ITEM_ITEM);
  varSet(SV.x8004, GetHiddenItemAttr(raw, C.HIDDEN_ITEM_FLAG));
  varSet(SV.x8005, item);
  TV_PrintIntToStringVar(0, item);
  // itemfinder.c deliberately ignores the map event quantity for underfoot items.
  varSet(SV.x8006, 1);
  data[tHiddenItemFound] = 1;
  data[tItemX] = 0;
  data[tItemY] = 0;
  data[tNumDingsRemaining] = 3;
  data[tUnderfoot] = 1;
  context(taskId).underfoot = true;
}

function SetNormalHiddenItem(taskId: number): void {
  const data = tasks.data(taskId);
  const absX = Math.abs(data[tItemX]!), absY = Math.abs(data[tItemY]!);
  if (data[tItemX] === 0 && data[tItemY] === 0) data[tNumDingsRemaining] = 4;
  else data[tNumDingsRemaining] = Math.max(absX, absY) > 3 ? 2 : 4;
}

function HiddenItemAtPos(events: MapHeader["bgs"], x: number, y: number): boolean {
  for (const bg of events) {
    if (bg.type !== "hidden_item" || x !== bg.x || y !== bg.y) continue;
    const raw = EncodeHiddenItemData(bg);
    return GetHiddenItemAttr(raw, C.HIDDEN_ITEM_UNDERFOOT) !== 1 && !flagGet(GetHiddenItemAttr(raw, C.HIDDEN_ITEM_FLAG));
  }
  return false;
}

function HiddenItemInConnectedMapAtPos(game: Game, connection: LoadedConnection, x: number, y: number): boolean {
  const current = game.overworld.map.layout;
  let localX: number, localY: number, localLength: number, localOffset: number;
  switch (connection.direction) {
    case CONNECTION_NORTH:
      localOffset = connection.offset + MAP_OFFSET;
      localX = x - localOffset;
      localLength = connection.layout.height - MAP_OFFSET;
      localY = localLength + y;
      break;
    case CONNECTION_SOUTH:
      localOffset = connection.offset + MAP_OFFSET;
      localX = x - localOffset;
      localLength = current.height + MAP_OFFSET;
      localY = y - localLength;
      break;
    case CONNECTION_WEST:
      localLength = connection.layout.width - MAP_OFFSET;
      localX = localLength + x;
      localOffset = connection.offset + MAP_OFFSET;
      localY = y - localOffset;
      break;
    case CONNECTION_EAST:
      localLength = current.width + MAP_OFFSET;
      localX = x - localLength;
      localOffset = connection.offset + MAP_OFFSET;
      localY = y - localOffset;
      break;
    default: return false;
  }
  // The C temporaries are u16, then HiddenItemAtPos receives s16 parameters.
  return HiddenItemAtPos(connection.header.bgs, signed16(unsigned16(localX)), signed16(unsigned16(localY)));
}

function FindHiddenItemsInConnectedMaps(game: Game, taskId: number): void {
  const player = context(taskId).player;
  const x = player.currentCoords.x, y = player.currentCoords.y;
  const width = game.overworld.map.layout.width + MAP_OFFSET;
  const height = game.overworld.map.layout.height + MAP_OFFSET;
  for (let curX = x - 7; curX <= x + 7; curX++) {
    for (let curY = y - 5; curY <= y + 5; curY++) {
      if (curX < MAP_OFFSET || curX >= width || curY < MAP_OFFSET || curY >= height) {
        const connection = GetMapConnectionAtPos(curX, curY, game.overworld.map);
        if (connection && HiddenItemInConnectedMapAtPos(game, connection, curX, curY))
          RegisterHiddenItemRelativeCoordsIfCloser(taskId, curX - x, curY - y);
      }
    }
  }
}

function RegisterHiddenItemRelativeCoordsIfCloser(taskId: number, dx: number, dy: number): void {
  const data = tasks.data(taskId);
  if (!data[tHiddenItemFound]) {
    data[tItemX] = dx; data[tItemY] = dy; data[tHiddenItemFound] = 1;
    return;
  }
  const oldX = Math.abs(data[tItemX]!), oldY = Math.abs(data[tItemY]!);
  const nextX = Math.abs(dx), nextY = Math.abs(dy);
  if (oldX + oldY > nextX + nextY || (oldX + oldY === nextX + nextY && (oldY > nextY || (oldY === nextY && data[tItemY]! < dy)))) {
    data[tItemX] = dx; data[tItemY] = dy;
  }
}

function GetPlayerDirectionTowardsHiddenItem(itemX: number, itemY: number): number {
  if (itemX === 0 && itemY === 0) return DIR_NONE;
  const abX = Math.abs(itemX), abY = Math.abs(itemY);
  if (abX > abY) return itemX < 0 ? DIR_EAST : DIR_NORTH;
  if (abX < abY) return itemY < 0 ? DIR_SOUTH : DIR_WEST;
  if (abX === abY) return itemY < 0 ? DIR_SOUTH : DIR_WEST;
  return DIR_NONE;
}

function Task_ItemfinderResponsePrintMessage(taskId: number): void {
  const { game } = context(taskId);
  DisplayItemMessageOnField(taskId, game, rom.text("gText_ItemfinderResponding"), Task_ItemfinderResponseCleanUp);
}

function Task_ItemfinderResponseCleanUp(taskId: number): void {
  const { game, player } = context(taskId);
  DestroyArrowAndStarTiles();
  releasePlayer(game, player);
  contexts.delete(taskId);
  tasks.destroy(taskId);
}

function Task_ItemfinderUnderfootPrintMessage(taskId: number): void {
  const { game } = context(taskId);
  DisplayItemMessageOnField(taskId, game, rom.text("gText_ItemfinderShakingWildly"), Task_ItemfinderUnderfootDigUpItem);
}

function Task_ItemfinderUnderfootDigUpItem(taskId: number): void {
  const { game } = context(taskId);
  DestroyArrowAndStarTiles();
  contexts.delete(taskId);
  tasks.destroy(taskId);
  game.overworld.script.ScriptContext_SetupScript(rom.label("EventScript_ItemfinderDigUpUnderfootItem"));
  game.overworld.controlsLocked = true;
}

function releasePlayer(game: Game, player: ObjectEvent): void {
  game.overworld.objects.ObjectEventClearHeldMovementIfFinished(player);
  game.overworld.objects.unfreezeAll();
  game.overworld.controlsLocked = false;
}

/** DisplayItemMessageOnField: keep the field task active until A/B closes the dialog. */
function DisplayItemMessageOnField(taskId: number, game: Game, text: ArrayLike<number>, next: (taskId: number) => void): void {
  const ow = game.overworld;
  ow.control.MsgSetNotSignpost();
  ow.messageBox.show(text);
  context(taskId).afterMessage = next;
  tasks.setFunc(taskId, Task_WaitItemfinderMessage);
}

function Task_WaitItemfinderMessage(taskId: number): void {
  const { game, afterMessage } = context(taskId);
  const box = game.overworld.messageBox;
  if (!box.isHidden() || !(joy.newKeys & (A_BUTTON | B_BUTTON))) return;
  box.hide();
  context(taskId).afterMessage = undefined;
  afterMessage?.(taskId);
}

function LoadArrowAndStarTiles(): void {
  // C LoadSpriteSheet(&sArrowAndStarSpriteSheet); decoded for field Canvas.
  spriteFrames ??= decodeItemFinderSpriteSheet(incbin("itemfinder.c:sArrowAndStarSpriteTiles"));
}

function DestroyArrowAndStarTiles(): void {
  // C frees the tagged OBJ tile allocation; Canvas sprites keep their source
  // frame until their own C callback destroys them.
  spriteFrames = undefined;
}

function CreateArrowSprite(game: Game, animNum: number, direction: number): FieldSprite {
  const sprite = createItemFinderSprite(game, animNum, SpriteCallback_Arrow);
  const data = sprite.data;
  data[7] = animNum; data[0] = 0; data[3] = 0; data[4] = 0; data[5] = SPRITE_CENTER_X; data[6] = SPRITE_CENTER_Y;
  switch (direction) {
    case DIR_NONE:
      switch (game.overworld.player.object.facingDirection) {
        case DIR_WEST: data[1] = -100; data[2] = 0; data[8] = 0; break;
        case DIR_NORTH: data[1] = 0; data[2] = -100; data[8] = 192; break;
        case DIR_EAST: data[1] = 100; data[2] = 0; data[8] = 128; break;
        case DIR_SOUTH: data[1] = 0; data[2] = 100; data[8] = 64; break;
      }
      break;
    case DIR_SOUTH: data[1] = 0; data[2] = -100; data[8] = 192; break;
    case DIR_NORTH: data[1] = 100; data[2] = 0; data[8] = 128; break;
    case DIR_WEST: data[1] = 0; data[2] = 100; data[8] = 64; break;
    case DIR_EAST: data[1] = -100; data[2] = 0; data[8] = 0; break;
  }
  return sprite;
}

function SpriteCallback_Arrow(sprite: FieldSprite): void {
  sprite.data[3]! += sprite.data[1]!;
  sprite.data[4]! += sprite.data[2]!;
  sprite.x = sprite.data[5]! + (sprite.data[3]! >> 8);
  sprite.y = sprite.data[6]! + (sprite.data[4]! >> 8);
  if (sprite.x <= 104 || sprite.x > 132 || sprite.y <= 60 || sprite.y > 88)
    sprite.callback = SpriteCallback_DestroyArrow;
}

function SpriteCallback_DestroyArrow(sprite: FieldSprite): void { destroyItemFinderSprite(sprite); }

function CreateStarSprite(game: Game): number {
  const sprite = createItemFinderSprite(game, 4, SpriteCallback_Star);
  sprite.data[7] = 0; sprite.data[0] = 0; sprite.data[3] = 0; sprite.data[4] = 0;
  sprite.data[5] = SPRITE_CENTER_X; sprite.data[6] = SPRITE_CENTER_Y;
  sprite.data[1] = 0; sprite.data[2] = -100; sprite.data[8] = 0;
  return game.overworld.sprites.sprites.indexOf(sprite);
}

function SpriteCallback_Star(sprite: FieldSprite): void {
  sprite.data[3]! += sprite.data[1]!;
  sprite.data[4]! += sprite.data[2]!;
  sprite.x = sprite.data[5]! + (sprite.data[3]! >> 8);
  sprite.y = sprite.data[6]! + (sprite.data[4]! >> 8);
  if (sprite.x <= 104 || sprite.x > 132 || sprite.y <= 60 || sprite.y > 88)
    sprite.callback = SpriteCallback_DestroyStar;
}

function SpriteCallback_DestroyStar(sprite: FieldSprite): void { destroyItemFinderSprite(sprite); }

function destroyItemFinderSprite(sprite: FieldSprite): void {
  const destroy = (sprite as FieldSprite & { itemFinderDestroy?: () => void }).itemFinderDestroy;
  if (destroy) destroy(); else sprite.destroyed = true;
}

function createItemFinderSprite(game: Game, animNum: number, callback: (sprite: FieldSprite) => void): FieldSprite {
  const sprite = new Sprite();
  const source = cdata<CAnimFrame[]>("itemfinder", animNum === 4 ? "sStarAnim" : `sArrowAnim${animNum}`);
  const frame = source.find((entry) => entry.frame)?.frame;
  const imageValue = frame?.imageValue ?? 0;
  sprite.anims = [source.map((entry) => entry.frame
    ? ["F", entry.frame.imageValue, entry.frame.duration, 0, 0]
    : ["E"]) as FieldSprite["anims"][number]];
  sprite.imageValue = imageValue;
  sprite.animNum = 0;
  sprite.x = SPRITE_CENTER_X; sprite.y = SPRITE_CENTER_Y;
  sprite.width = 16; sprite.height = 16;
  sprite.centerToCornerVecX = -8; sprite.centerToCornerVecY = -8;
  sprite.coordOffsetEnabled = false;
  sprite.priority = 0; sprite.subpriority = 0;
  sprite.callback = callback;
  (sprite as FieldSprite & { itemFinderSprite?: boolean }).itemFinderSprite = true;
  if (!spriteFrames) LoadArrowAndStarTiles();
  const frames = spriteFrames;
  sprite.draw = (ctx, x, y) => {
    const frameImage = frames![Math.floor(sprite.imageValue / 4)] ?? frames![0]!;
    ctx.save();
    ctx.translate(x + 8, y + 8);
    ctx.rotate((sprite.data[8]! / 256) * Math.PI * 2);
    ctx.drawImage(frameImage, -8, -8);
    ctx.restore();
  };
  game.overworld.sprites.add(sprite);
  (sprite as FieldSprite & { itemFinderDestroy?: () => void }).itemFinderDestroy = () => game.overworld.sprites.destroy(sprite);
  return sprite;
}

function decodeItemFinderSpriteSheet(tiles: Uint8Array): HTMLCanvasElement[] {
  return Array.from({ length: 5 }, (_, frame) => {
    const out = canvas(16, 16), ctx = out.getContext("2d")!, image = ctx.createImageData(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const tile = frame * 4 + (y >> 3) * 2 + (x >> 3);
      const packed = tiles[tile * 32 + (y & 7) * 4 + ((x & 7) >> 1)] ?? 0;
      const index = (x & 1) ? packed >> 4 : packed & 15;
      if (!index) continue;
      // The C sheet has no private palette and selects OBJ palette slot 0.
      // Canvas field rendering preserves transparency and uses white for it.
      const [r, g, b] = rgb555(0x7fff), offset = (y * 16 + x) * 4;
      image.data[offset] = r; image.data[offset + 1] = g; image.data[offset + 2] = b; image.data[offset + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return out;
  });
}

function unsigned16(value: number): number { return value & 0xffff; }
function signed16(value: number): number { return (value << 16) >> 16; }
