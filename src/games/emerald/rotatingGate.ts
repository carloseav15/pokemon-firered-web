// pokeemerald rotating_gate.c: the rotating gate puzzles of Fortree City Gym and Trick House puzzle 6 (puzzle state,
// the specials and the movement collision functions).
//
// GAP (graphics): the gate sprites are not created. The C file draws each gate as an affine OAM sprite
// (RotatingGate_CreateGate, SpriteCallback_RotatingGate, RotatingGatePuzzleCameraUpdate, LoadRotatingGatePics); the
// sprite palette slot 2 they use and the viewer renderer that would draw them are not wired, so
// sRotatingGate_GateSpriteIds stays all MAX_SPRITES (the state C reaches when no gate is inside the viewport) and
// RotatingGate_TriggerRotationAnimation finds no sprite to animate. The puzzle state, the arm geometry and the
// collision results are the C ones. The viewer does not call the collision functions yet.
import { cdata } from "@core/hw/assets";
import { MapGridGetCollisionAt, MAP_OFFSET } from "@core/field/fieldmap";
import type { FieldMap } from "@core/field/fieldmap";
import { save, varGet, varSet } from "@game/save";
import * as EM from "./generated/constants";

const ROTATING_GATE_PUZZLE_MAX = 12;
const GATE_ARM_MAX_LENGTH = 2;
const MAX_SPRITES = 64;
const GATE_ROT_NONE = 255;

const GATE_ARM_NORTH = 0, GATE_ARM_WEST = 3;
const GATE_ORIENTATION_270 = 3, GATE_ORIENTATION_MAX = 4;
const ROTATE_ANTICLOCKWISE = 1, ROTATE_CLOCKWISE = 2;
const PUZZLE_NONE = 0, PUZZLE_FORTREE_CITY_GYM = 1, PUZZLE_ROUTE110_TRICK_HOUSE_PUZZLE6 = 2;

type RotatingGatePuzzle = { x: number; y: number; shape: number; orientation: number };
type Coords8 = { x: number; y: number };

const rg = <T>(name: string): T => cdata<T>("em:rotating_gate", name);

let sRotatingGate_PuzzleConfig: RotatingGatePuzzle[] = [];
let sRotatingGate_PuzzleCount = 0;
const sRotatingGate_GateSpriteIds: number[] = new Array(ROTATING_GATE_PUZZLE_MAX - 1).fill(MAX_SPRITES);

/** rotating_gate.c GetCurrentMapRotatingGatePuzzleType */
function GetCurrentMapRotatingGatePuzzleType(): number {
  if (save.location.mapGroup === (EM.MAP_FORTREE_CITY_GYM >> 8) && save.location.mapNum === (EM.MAP_FORTREE_CITY_GYM & 0xff))
    return PUZZLE_FORTREE_CITY_GYM;
  if (save.location.mapGroup === (EM.MAP_ROUTE110_TRICK_HOUSE_PUZZLE6 >> 8) && save.location.mapNum === (EM.MAP_ROUTE110_TRICK_HOUSE_PUZZLE6 & 0xff))
    return PUZZLE_ROUTE110_TRICK_HOUSE_PUZZLE6;
  return PUZZLE_NONE;
}

// The orientation of each gate is a byte of the temp vars (GetVarPointer(VAR_TEMP_0) read as a u8 array, little endian).
function getGateByte(i: number): number { return (varGet(EM.VAR_TEMP_0 + (i >> 1)) >> (8 * (i & 1))) & 0xff; }
function setGateByte(i: number, value: number): void {
  const id = EM.VAR_TEMP_0 + (i >> 1), shift = 8 * (i & 1);
  varSet(id, (varGet(id) & ~(0xff << shift)) | ((value & 0xff) << shift));
}

/** rotating_gate.c RotatingGate_ResetAllGateOrientations */
function RotatingGate_ResetAllGateOrientations(): void {
  for (let i = 0; i < sRotatingGate_PuzzleCount; i++) setGateByte(i, sRotatingGate_PuzzleConfig[i]!.orientation);
}

/** rotating_gate.c RotatingGate_GetGateOrientation / RotatingGate_SetGateOrientation */
function RotatingGate_GetGateOrientation(gateId: number): number { return getGateByte(gateId); }
function RotatingGate_SetGateOrientation(gateId: number, orientation: number): void { setGateByte(gateId, orientation); }

/** rotating_gate.c RotatingGate_RotateInDirection */
function RotatingGate_RotateInDirection(gateId: number, rotationDirection: number): void {
  let orientation = RotatingGate_GetGateOrientation(gateId);
  if (rotationDirection === ROTATE_ANTICLOCKWISE) {
    if (orientation) orientation--;
    else orientation = GATE_ORIENTATION_270;
  } else {
    orientation++;
    orientation = orientation % GATE_ORIENTATION_MAX;
  }
  RotatingGate_SetGateOrientation(gateId, orientation);
}

/** rotating_gate.c RotatingGate_LoadPuzzleConfig */
function RotatingGate_LoadPuzzleConfig(): void {
  switch (GetCurrentMapRotatingGatePuzzleType()) {
    case PUZZLE_FORTREE_CITY_GYM:
      sRotatingGate_PuzzleConfig = rg<RotatingGatePuzzle[]>("sRotatingGate_FortreePuzzleConfig");
      sRotatingGate_PuzzleCount = sRotatingGate_PuzzleConfig.length;
      break;
    case PUZZLE_ROUTE110_TRICK_HOUSE_PUZZLE6:
      sRotatingGate_PuzzleConfig = rg<RotatingGatePuzzle[]>("sRotatingGate_TrickHousePuzzleConfig");
      sRotatingGate_PuzzleCount = sRotatingGate_PuzzleConfig.length;
      break;
    case PUZZLE_NONE:
    default:
      return;
  }
  for (let i = 0; i < ROTATING_GATE_PUZZLE_MAX - 1; i++) sRotatingGate_GateSpriteIds[i] = MAX_SPRITES;
}

/** rotating_gate.c RotatingGate_CanRotate: no arm tile of the rotated gate may be a wall (collision == 1). */
function RotatingGate_CanRotate(gateId: number, rotationDirection: number, map: FieldMap | null): boolean {
  let armPos: Coords8[];
  if (rotationDirection === ROTATE_ANTICLOCKWISE) armPos = rg<Coords8[]>("sRotatingGate_ArmPositionsAntiClockwiseRotation");
  else if (rotationDirection === ROTATE_CLOCKWISE) armPos = rg<Coords8[]>("sRotatingGate_ArmPositionsClockwiseRotation");
  else return false;

  const orientation = RotatingGate_GetGateOrientation(gateId);
  const shape = sRotatingGate_PuzzleConfig[gateId]!.shape;
  const x = sRotatingGate_PuzzleConfig[gateId]!.x + MAP_OFFSET;
  const y = sRotatingGate_PuzzleConfig[gateId]!.y + MAP_OFFSET;
  const armLayout = rg<number[][]>("sRotatingGate_ArmLayout");

  // Loop through the gate's "arms" clockwise (north, south, east, west)
  for (let i = GATE_ARM_NORTH; i <= GATE_ARM_WEST; i++) {
    // Ensure that no part of the arm collides with the map
    for (let j = 0; j < GATE_ARM_MAX_LENGTH; j++) {
      const armIndex = 2 * ((orientation + i) % 4) + j;
      if (armLayout[shape]![2 * i + j]) {
        if (MapGridGetCollisionAt(x + armPos[armIndex]!.x, y + armPos[armIndex]!.y, map) === 1) return false;
      }
    }
  }
  return true;
}

/** rotating_gate.c RotatingGate_HasArm */
function RotatingGate_HasArm(gateId: number, armInfo: number): number {
  const arm = Math.trunc(armInfo / 2);
  const isLongArm = armInfo % 2;
  const armOrientation = (((arm - RotatingGate_GetGateOrientation(gateId) + 4) % 4) << 24) >> 24; // s8
  const shape = sRotatingGate_PuzzleConfig[gateId]!.shape;
  return rg<number[][]>("sRotatingGate_ArmLayout")[shape]![armOrientation * 2 + isLongArm]!;
}

/** rotating_gate.c RotatingGate_TriggerRotationAnimation: with no gate sprite (see the file header) it has nothing to start. */
function RotatingGate_TriggerRotationAnimation(gateId: number, _rotationDirection: number): void {
  if (sRotatingGate_GateSpriteIds[gateId] !== MAX_SPRITES) throw Error("RotatingGate_TriggerRotationAnimation: gate sprites are not ported");
}

/** rotating_gate.c RotatingGate_GetRotationInfo (direction is a DIR_* value) */
function RotatingGate_GetRotationInfo(direction: number, x: number, y: number): number {
  let table: number[];
  if (direction === EM.DIR_NORTH) table = rg<number[]>("sRotatingGate_RotationInfoNorth");
  else if (direction === EM.DIR_SOUTH) table = rg<number[]>("sRotatingGate_RotationInfoSouth");
  else if (direction === EM.DIR_WEST) table = rg<number[]>("sRotatingGate_RotationInfoWest");
  else if (direction === EM.DIR_EAST) table = rg<number[]>("sRotatingGate_RotationInfoEast");
  else return GATE_ROT_NONE;
  return table[y * 4 + x]!;
}

/** rotating_gate.c RotatingGate_InitPuzzle */
export function RotatingGate_InitPuzzle(): void {
  if (GetCurrentMapRotatingGatePuzzleType()) {
    RotatingGate_LoadPuzzleConfig();
    RotatingGate_ResetAllGateOrientations();
  }
}

/** rotating_gate.c RotatingGate_InitPuzzleAndGraphics: LoadRotatingGatePics and RotatingGate_CreateGatesWithinViewport are the
 * graphics gap of the file header; the puzzle configuration is loaded. */
export function RotatingGate_InitPuzzleAndGraphics(): void {
  if (GetCurrentMapRotatingGatePuzzleType()) RotatingGate_LoadPuzzleConfig();
}

/** The gate whose collision window holds (x, y), with the rotation the movement would start, as both collision functions read it. */
function gateAt(direction: number, x: number, y: number, visit: (gateIndex: number, rotationDirection: number) => boolean | undefined): boolean {
  for (let i = 0; i < sRotatingGate_PuzzleCount; i++) {
    const gateX = sRotatingGate_PuzzleConfig[i]!.x + MAP_OFFSET;
    const gateY = sRotatingGate_PuzzleConfig[i]!.y + MAP_OFFSET;
    if (gateX - 2 <= x && x <= gateX + 1 && gateY - 2 <= y && y <= gateY + 1) {
      const centerX = x - gateX + 2;
      const centerY = y - gateY + 2;
      const rotationInfo = RotatingGate_GetRotationInfo(direction, centerX, centerY);
      if (rotationInfo !== GATE_ROT_NONE) {
        const rotationDirection = (rotationInfo & 0xf0) >> 4;
        const armInfo = rotationInfo & 0xf;
        if (RotatingGate_HasArm(i, armInfo)) {
          const result = visit(i, rotationDirection);
          if (result !== undefined) return result;
        }
      }
    }
  }
  return false;
}

/** rotating_gate.c CheckForRotatingGatePuzzleCollision: TRUE when the arm cannot rotate, otherwise the gate rotates (state) and the step goes on. */
export function CheckForRotatingGatePuzzleCollision(direction: number, x: number, y: number, map: FieldMap | null): boolean {
  if (!GetCurrentMapRotatingGatePuzzleType()) return false;
  return gateAt(direction, x, y, (i, rotationDirection) => {
    if (RotatingGate_CanRotate(i, rotationDirection, map)) {
      RotatingGate_TriggerRotationAnimation(i, rotationDirection);
      RotatingGate_RotateInDirection(i, rotationDirection);
      return false;
    }
    return true;
  });
}

/** rotating_gate.c CheckForRotatingGatePuzzleCollisionWithoutAnimation: the same test without rotating or animating the gate. */
export function CheckForRotatingGatePuzzleCollisionWithoutAnimation(direction: number, x: number, y: number, map: FieldMap | null): boolean {
  if (!GetCurrentMapRotatingGatePuzzleType()) return false;
  return gateAt(direction, x, y, (i, rotationDirection) => (!RotatingGate_CanRotate(i, rotationDirection, map) ? true : undefined));
}

