// pokeemerald/src/rotating_tile_puzzle.c, complete file (including the normally unreachable
// unsaved-object branch). State belongs to the Overworld, as the C allocation belongs to a session.
import type { Overworld } from '@core/field/overworld';
import { MAP_OFFSET, MapGridGetMetatileIdAt } from '@core/field/fieldmap';
import { rom } from '@core/rom';
import * as C from './generated/constants';
import { EmeraldRotatingTileMovement, emeraldMovement } from './rotatingTileMovement';

const sMovement_ShiftRight = [C.MOVEMENT_ACTION_LOCK_ANIM, C.MOVEMENT_ACTION_WALK_NORMAL_RIGHT, C.MOVEMENT_ACTION_UNLOCK_ANIM, C.MOVEMENT_ACTION_STEP_END];
const sMovement_ShiftDown = [C.MOVEMENT_ACTION_LOCK_ANIM, C.MOVEMENT_ACTION_WALK_NORMAL_DOWN, C.MOVEMENT_ACTION_UNLOCK_ANIM, C.MOVEMENT_ACTION_STEP_END];
const sMovement_ShiftLeft = [C.MOVEMENT_ACTION_LOCK_ANIM, C.MOVEMENT_ACTION_WALK_NORMAL_LEFT, C.MOVEMENT_ACTION_UNLOCK_ANIM, C.MOVEMENT_ACTION_STEP_END];
const sMovement_ShiftUp = [C.MOVEMENT_ACTION_LOCK_ANIM, C.MOVEMENT_ACTION_WALK_NORMAL_UP, C.MOVEMENT_ACTION_UNLOCK_ANIM, C.MOVEMENT_ACTION_STEP_END];
const sMovement_FaceRight = [C.MOVEMENT_ACTION_FACE_RIGHT, C.MOVEMENT_ACTION_STEP_END];
const sMovement_FaceDown = [C.MOVEMENT_ACTION_FACE_DOWN, C.MOVEMENT_ACTION_STEP_END];
const sMovement_FaceLeft = [C.MOVEMENT_ACTION_FACE_LEFT, C.MOVEMENT_ACTION_STEP_END];
const sMovement_FaceUp = [C.MOVEMENT_ACTION_FACE_UP, C.MOVEMENT_ACTION_STEP_END];
const ROTATE_COUNTERCLOCKWISE = 0, ROTATE_CLOCKWISE = 1, ROTATE_NONE = 2;
const s8 = (n: number): number => (n << 24) >> 24;
const s16 = (n: number): number => (n << 16) >> 16;
type Puzzle = { objects: { eventTemplateId: number; prevPuzzleTileNum: number }[]; isTrickHouse: number };

export class RotatingTilePuzzle {
  private sRotatingTilePuzzle: Puzzle | null = null;
  private readonly movement: EmeraldRotatingTileMovement;
  constructor(private readonly ow: Overworld) { this.movement = emeraldMovement(ow); }

  InitRotatingTilePuzzle(isTrickHouse: number): void {
    this.sRotatingTilePuzzle ??= { objects: [], isTrickHouse: 0 };
    this.sRotatingTilePuzzle.isTrickHouse = isTrickHouse & 0xff;
  }

  FreeRotatingTilePuzzle(): void {
    this.sRotatingTilePuzzle = null;
    // GetObjectEventIdByLocalIdAndMap ignores map IDs for LOCALID_PLAYER.
    const player = this.ow.objects.byLocalIdAndMap(C.LOCALID_PLAYER, 0, 0);
    if (player) this.ow.objects.ObjectEventClearHeldMovementIfFinished(player);
    this.ow.game.scriptMovement.ScriptMovement_UnfreezeObjectEvents();
  }

  MoveRotatingTileObjects(puzzleNumber: number): number {
    const puzzle = this.sRotatingTilePuzzle!;
    const templates = this.ow.objects.templates;
    let localId = C.LOCALID_NONE;
    for (let i = 0; i < C.OBJECT_EVENT_TEMPLATES_COUNT; i++) {
      // TS stores only the map's actual templates; C's remaining zeroed slots have localId=0.
      const object = templates[i];
      if (!object) continue;
      const metatile = MapGridGetMetatileIdAt(s16(object.x + MAP_OFFSET), s16(object.y + MAP_OFFSET), this.ow.map);
      const start = rom.c(puzzle.isTrickHouse ? 'METATILE_TrickHousePuzzle_Arrow_YellowOnWhite_Right' : 'METATILE_MossdeepGym_YellowArrow_Right');
      // Preserve the original Mossdeep threshold even in Trick House. C division truncates
      // toward zero, then converts to u8; do not substitute floor or a corrected threshold.
      if (metatile < rom.c('METATILE_MossdeepGym_YellowArrow_Right')) continue;
      const row = Math.trunc((metatile - start) / C.METATILE_ROW_WIDTH) & 0xff;
      if (row >= 5 || row !== (puzzleNumber & 0xff)) continue;
      const tile = ((metatile - start) % C.METATILE_ROW_WIDTH) & 0xff;
      if (tile >= 4) continue;
      const delta = [[1, 0], [0, 1], [-1, 0], [0, -1]][tile]!;
      const script = [sMovement_ShiftRight, sMovement_ShiftDown, sMovement_ShiftLeft, sMovement_ShiftUp][tile]!;
      object.x = s16(object.x + delta[0]!);
      object.y = s16(object.y + delta[1]!);
      if (this.ow.objects.byLocalIdAndMap(object.localId, this.ow.objects.mapNum, this.ow.objects.mapGroup)) {
        this.SaveRotatingTileObject(i, tile);
        localId = object.localId;
        this.movement.start(localId, this.ow.objects.mapNum, this.ow.objects.mapGroup, script);
      } else this.TurnUnsavedRotatingTileObject(i, tile);
    }
    return localId;
  }

  TurnRotatingTileObjects(): void {
    const puzzle = this.sRotatingTilePuzzle;
    if (!puzzle) return;
    const start = rom.c(puzzle.isTrickHouse ? 'METATILE_TrickHousePuzzle_Arrow_YellowOnWhite_Right' : 'METATILE_MossdeepGym_YellowArrow_Right');
    for (const saved of puzzle.objects) {
      const template = this.ow.objects.templates[saved.eventTemplateId]!;
      const metatile = MapGridGetMetatileIdAt(s16(template.x + MAP_OFFSET), s16(template.y + MAP_OFFSET), this.ow.map);
      const difference = s8((((metatile - start) % C.METATILE_ROW_WIDTH) & 0xff) - saved.prevPuzzleTileNum);
      let rotation: number;
      if (difference < 0 || difference === 3) rotation = difference === -3 ? ROTATE_CLOCKWISE : ROTATE_COUNTERCLOCKWISE;
      else rotation = difference > 0 ? ROTATE_CLOCKWISE : ROTATE_NONE;
      const object = this.ow.objects.byLocalIdAndMap(template.localId, this.ow.objects.mapNum, this.ow.objects.mapGroup);
      if (!object || rotation === ROTATE_NONE) continue;
      const directions: Record<number, number> = rotation === ROTATE_COUNTERCLOCKWISE
        ? { [C.DIR_EAST]: C.DIR_NORTH, [C.DIR_SOUTH]: C.DIR_EAST, [C.DIR_WEST]: C.DIR_SOUTH, [C.DIR_NORTH]: C.DIR_WEST }
        : { [C.DIR_EAST]: C.DIR_SOUTH, [C.DIR_SOUTH]: C.DIR_WEST, [C.DIR_WEST]: C.DIR_NORTH, [C.DIR_NORTH]: C.DIR_EAST };
      const direction = directions[object.facingDirection];
      if (direction === undefined) continue;
      const turns: Record<number, { type: number; script: number[] }> = {
        [C.DIR_NORTH]: { type: C.MOVEMENT_TYPE_FACE_UP, script: sMovement_FaceUp },
        [C.DIR_SOUTH]: { type: C.MOVEMENT_TYPE_FACE_DOWN, script: sMovement_FaceDown },
        [C.DIR_EAST]: { type: C.MOVEMENT_TYPE_FACE_RIGHT, script: sMovement_FaceRight },
        [C.DIR_WEST]: { type: C.MOVEMENT_TYPE_FACE_LEFT, script: sMovement_FaceLeft },
      };
      const turn = turns[direction]!;
      template.movementType = turn.type;
      this.movement.start(template.localId, this.ow.objects.mapNum, this.ow.objects.mapGroup, turn.script);
    }
  }

  private SaveRotatingTileObject(eventTemplateId: number, puzzleTileNum: number): void {
    this.sRotatingTilePuzzle!.objects.push({ eventTemplateId: eventTemplateId & 0xff, prevPuzzleTileNum: puzzleTileNum & 0xff });
  }

  private TurnUnsavedRotatingTileObject(eventTemplateId: number, puzzleTileNum: number): void {
    const template = this.ow.objects.templates[eventTemplateId]!;
    const metatile = MapGridGetMetatileIdAt(s16(template.x + MAP_OFFSET), s16(template.y + MAP_OFFSET), this.ow.map);
    const start = rom.c(this.sRotatingTilePuzzle!.isTrickHouse ? 'METATILE_TrickHousePuzzle_Arrow_YellowOnWhite_Right' : 'METATILE_MossdeepGym_YellowArrow_Right');
    const difference = s8((((metatile - start) % C.METATILE_ROW_WIDTH) & 0xff) - puzzleTileNum);
    const rotation = difference < 0 || difference === 3 ? ROTATE_COUNTERCLOCKWISE
      : difference > 0 || difference === -3 ? ROTATE_CLOCKWISE : ROTATE_NONE;
    const types = [C.MOVEMENT_TYPE_FACE_RIGHT, C.MOVEMENT_TYPE_FACE_DOWN, C.MOVEMENT_TYPE_FACE_LEFT, C.MOVEMENT_TYPE_FACE_UP];
    const at = types.indexOf(template.movementType);
    if (at >= 0 && rotation !== ROTATE_NONE) template.movementType = types[(at + (rotation === ROTATE_COUNTERCLOCKWISE ? 3 : 1)) % 4]!;
  }
}
