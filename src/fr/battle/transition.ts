// Port of battle_transition.c: the pre-battle screen effect (BattleTransition_StartOnField).
//
// Active effects include the shared intro, trainer mugshots, angled wipes,
// clockwise wipe, slice, white bars, Poké Balls trail, and several other
// transition families below. Remaining IDs use the existing black-fade fallback.
//
// Adaptation: the C manipulates the live GBA WIN0H/WININ/WINOUT registers
// over the still-running PPU. In this port the overworld renders on the
// separate Canvas2D `gba/` layer (not `hw/ppu.ts`), so there is no live BG
// to window over once the transition starts. Instead this snapshots the
// current field frame once and clips that snapshot per scanline using the
// exact same InitBlackWipe/UpdateBlackWipe coordinates and per-frame timing
// as the C; only the rendering backend (canvas clip vs. hardware window)
// differs.

import type { Scene } from "../game";
import * as C from "../generated/constants";
import { paletteFade, FADE_TO_BLACK, RGB_BLACK } from "../gba/fade";
import type { Pokemon } from "../pokemon/pokemon";
import { rom } from "../rom";
import { incbin, incbin16 } from "../hw/assets";
import { save } from "../save";
import type { Overworld } from "../field/overworld";
import { MetatileBehavior_IsSurfable } from "../generated/metatileBehavior";
import { Sin, gSineTable } from "../hw/trig";
import { random as Random } from "../random";
import { MugshotTransitionEffect } from "./mugshotTransition";

const TRANSITION_TYPE_NORMAL = 0;
const TRANSITION_TYPE_CAVE = 1;
const TRANSITION_TYPE_FLASH = 2;
const TRANSITION_TYPE_WATER = 3;

// [TRANSITION_TYPE_*] = [enemy weaker, enemy not weaker]
const sBattleTransitionTable_Wild: number[][] = [
  [C.B_TRANSITION_SLICE, C.B_TRANSITION_WHITE_BARS_FADE],
  [C.B_TRANSITION_CLOCKWISE_WIPE, C.B_TRANSITION_GRID_SQUARES],
  [C.B_TRANSITION_BLUR, C.B_TRANSITION_GRID_SQUARES],
  [C.B_TRANSITION_WAVE, C.B_TRANSITION_RIPPLE],
];
const sBattleTransitionTable_Trainer: number[][] = [
  [C.B_TRANSITION_POKEBALLS_TRAIL, C.B_TRANSITION_ANGLED_WIPES],
  [C.B_TRANSITION_SHUFFLE, C.B_TRANSITION_BIG_POKEBALL],
  [C.B_TRANSITION_BLUR, C.B_TRANSITION_GRID_SQUARES],
  [C.B_TRANSITION_SWIRL, C.B_TRANSITION_RIPPLE],
];

/** GetBattleTransitionTypeByMap */
function GetBattleTransitionTypeByMap(ow: Overworld): number {
  const p = ow.player.object;
  const behavior = ow.map.behaviorAt(p.currentCoords.x, p.currentCoords.y);
  if (ow.flashLevel) return TRANSITION_TYPE_FLASH;
  if (MetatileBehavior_IsSurfable(behavior)) return TRANSITION_TYPE_WATER;
  if (ow.header.mapType === C.MAP_TYPE_UNDERGROUND) return TRANSITION_TYPE_CAVE;
  if (ow.header.mapType === C.MAP_TYPE_UNDERWATER) return TRANSITION_TYPE_WATER;
  return TRANSITION_TYPE_NORMAL;
}

function GetSumOfPlayerPartyLevel(numMons: number): number {
  let sum = 0, remaining = numMons;
  for (const mon of save.party) {
    if (mon.isEgg || mon.species === 0 || mon.hp === 0) continue;
    sum = (sum + mon.level) & 0xff;
    if (--remaining === 0) break;
  }
  return sum;
}

function GetSumOfEnemyPartyLevel(trainerId: number, numMons: number): number {
  const party = rom.trainers[trainerId]?.party ?? [];
  let sum = 0;
  const count = Math.min(numMons, party.length);
  for (let i = 0; i < count; i++) sum = (sum + party[i]!.level) & 0xff;
  return sum;
}

/** GetWildBattleTransition */
export function GetWildBattleTransition(ow: Overworld, enemyParty: Pokemon[]): number {
  const type = GetBattleTransitionTypeByMap(ow);
  const enemyLevel = enemyParty[0]?.level ?? 0;
  const playerLevel = GetSumOfPlayerPartyLevel(1);
  return sBattleTransitionTable_Wild[type]![enemyLevel < playerLevel ? 0 : 1]!;
}

/** GetTrainerBattleTransition */
export function GetTrainerBattleTransition(ow: Overworld, trainerId: number): number {
  const trainer = rom.trainers[trainerId];
  if (trainerId === C.TRAINER_SECRET_BASE || trainer?.class === rom.c("TRAINER_CLASS_CHAMPION")) return C.B_TRANSITION_BLUE;
  if (trainer?.class === rom.c("TRAINER_CLASS_ELITE_FOUR")) {
    if (trainerId === C.TRAINER_ELITE_FOUR_LORELEI || trainerId === C.TRAINER_ELITE_FOUR_LORELEI_2) return C.B_TRANSITION_LORELEI;
    if (trainerId === C.TRAINER_ELITE_FOUR_BRUNO || trainerId === C.TRAINER_ELITE_FOUR_BRUNO_2) return C.B_TRANSITION_BRUNO;
    if (trainerId === C.TRAINER_ELITE_FOUR_AGATHA || trainerId === C.TRAINER_ELITE_FOUR_AGATHA_2) return C.B_TRANSITION_AGATHA;
    if (trainerId === C.TRAINER_ELITE_FOUR_LANCE || trainerId === C.TRAINER_ELITE_FOUR_LANCE_2) return C.B_TRANSITION_LANCE;
    return C.B_TRANSITION_BLUE;
  }
  const minPartyCount = trainer?.double === 1 ? 2 : 1;
  const type = GetBattleTransitionTypeByMap(ow);
  const enemyLevel = GetSumOfEnemyPartyLevel(trainerId, minPartyCount);
  const playerLevel = GetSumOfPlayerPartyLevel(minPartyCount);
  return sBattleTransitionTable_Trainer[type]![enemyLevel < playerLevel ? 0 : 1]!;
}

// ---------------------------------------------------------------- rendering

const DISPLAY_WIDTH = 240, DISPLAY_HEIGHT = 160;

/** InitBlackWipe / UpdateBlackWipe: a Bresenham-style pair of coordinates walking toward (endX, endY). */
class BlackWipe {
  startX = 0; startY = 0; currX = 0; currY = 0; endX = 0; endY = 0;
  xMove = 0; yMove = 0; xDist = 0; yDist = 0; temp = 0;

  init(startX: number, startY: number, endX: number, endY: number, stepX: number, stepY: number): void {
    this.startX = this.currX = startX;
    this.startY = this.currY = startY;
    this.endX = endX; this.endY = endY;
    this.xMove = stepX; this.yMove = stepY;
    this.xDist = endX - startX;
    if (this.xDist < 0) { this.xDist = -this.xDist; this.xMove = -stepX; }
    this.yDist = endY - startY;
    if (this.yDist < 0) { this.yDist = -this.yDist; this.yMove = -stepY; }
    this.temp = 0;
  }

  /** Returns true once both coordinates have reached their end. */
  update(xExact: boolean, yExact: boolean): boolean {
    if (this.xDist > this.yDist) {
      this.currX += this.xMove;
      this.temp += this.yDist;
      if (this.temp > this.xDist) { this.currY += this.yMove; this.temp -= this.xDist; }
    } else {
      this.currY += this.yMove;
      this.temp += this.xDist;
      if (this.temp > this.yDist) { this.currX += this.xMove; this.temp -= this.yDist; }
    }
    let finished = 0;
    if ((this.xMove > 0 && this.currX >= this.endX) || (this.xMove < 0 && this.currX <= this.endX)) {
      finished++;
      if (xExact) this.currX = this.endX;
    }
    if ((this.yMove > 0 && this.currY >= this.endY) || (this.yMove < 0 && this.currY <= this.endY)) {
      finished++;
      if (yExact) this.currY = this.endY;
    }
    return finished === 2;
  }
}

const WIN_RANGE = (a: number, b: number) => [Math.max(0, Math.min(255, a)), Math.max(0, Math.min(255, b))] as const;

/** One transition's per-frame state machine. Returns true when finished (ready for FadeScreenBlack). */
interface Effect {
  /** Window bounds per scanline: [left, right) is drawn from the snapshot; outside is black. */
  readonly rowBounds?: [number, number][];
  /** Horizontal displacement offset per scanline (for sliding slices). */
  readonly rowOffsets?: number[];
  /** True when the window itself is the black area instead of the visible area (ClockwiseWipe's polarity). */
  readonly invertWindow?: boolean;
  /** Advance one VBlank frame. Returns true once the wipe is done and FadeScreenBlack should start. */
  tick(): boolean;
  /** True when the effect's own C state machine already completed the fade to black. */
  readonly completesScreenFade?: boolean;
  /** True when the C effect starts and advances its own palette fade while running. */
  readonly updatesPaletteFade?: boolean;
  /** Optional custom per-frame renderer when an effect does more than basic window clipping. */
  render?(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void;
}

const NUM_ANGLED_WIPES = 7;
// startX, startY, endX, endY, yDirection (0 = down, 1 = up)
const sAngledWipes_MoveData: [number, number, number, number, number][] = [
  [56, 0, 0, DISPLAY_HEIGHT, 0],
  [104, DISPLAY_HEIGHT, DISPLAY_WIDTH, 88, 1],
  [DISPLAY_WIDTH, 72, 56, 0, 1],
  [0, 32, 144, DISPLAY_HEIGHT, 0],
  [144, DISPLAY_HEIGHT, 184, 0, 1],
  [56, 0, 168, DISPLAY_HEIGHT, 0],
  [168, DISPLAY_HEIGHT, 48, 0, 1],
];
const sAngledWipes_EndDelays = [1, 1, 1, 1, 1, 1, 0];

class AngledWipesEffect implements Effect {
  readonly rowBounds: [number, number][] = Array.from({ length: DISPLAY_HEIGHT }, () => [0, DISPLAY_WIDTH]);
  readonly invertWindow = false;
  readonly workingRowBounds: [number, number][] = Array.from({ length: DISPLAY_HEIGHT }, () => [0, DISPLAY_WIDTH]);
  state = 0;
  wipe = new BlackWipe();
  wipeId = 0;
  dir = 0;
  delay = 0;
  vblankDma = false;
  done = false;

  tick(): boolean {
    return Task_AngledWipes(this);
  }
}

/** Task_AngledWipes (battle_transition.c): run C task states until one yields a frame. */
function Task_AngledWipes(effect: AngledWipesEffect): boolean {
  let keepRunning: boolean;
  do {
    switch (effect.state) {
      case 0: keepRunning = AngledWipes_Init(effect); break;
      case 1: keepRunning = AngledWipes_SetWipeData(effect); break;
      case 2: keepRunning = AngledWipes_DoWipe(effect); break;
      case 3: keepRunning = AngledWipes_TryEnd(effect); break;
      case 4: keepRunning = AngledWipes_StartNext(effect); break;
      default: keepRunning = false; break;
    }
  } while (keepRunning);
  VBlankCB_AngledWipes(effect);
  return effect.done;
}

/** AngledWipes_Init (battle_transition.c); scanline tables become Canvas row bounds. */
function AngledWipes_Init(effect: AngledWipesEffect): boolean {
  for (let y = 0; y < DISPLAY_HEIGHT; y++) {
    effect.workingRowBounds[y] = [0, DISPLAY_WIDTH];
    effect.rowBounds[y] = [0, DISPLAY_WIDTH];
  }
  effect.vblankDma = false;
  effect.state++;
  return true;
}

/** AngledWipes_SetWipeData (battle_transition.c). */
function AngledWipes_SetWipeData(effect: AngledWipesEffect): boolean {
  const [startX, startY, endX, endY, direction] = sAngledWipes_MoveData[effect.wipeId]!;
  effect.wipe.init(startX, startY, endX, endY, 1, 1);
  effect.dir = direction;
  effect.state++;
  return true;
}

/** AngledWipes_DoWipe (battle_transition.c): update up to 16 Bresenham scanlines. */
function AngledWipes_DoWipe(effect: AngledWipesEffect): boolean {
  effect.vblankDma = false;
  let finished = false;
  for (let i = 0; i < 16; i++) {
    // C's scanline buffer has slack past DISPLAY_HEIGHT; ignore the off-screen row at y=160.
    const y = effect.wipe.currY;
    if (y >= 0 && y < DISPLAY_HEIGHT) {
      let [left, right] = effect.workingRowBounds[y]!;
      if (effect.dir === 0) {
        if (left < effect.wipe.currX) left = effect.wipe.currX;
        if (left > right) left = right;
      } else {
        if (right > effect.wipe.currX) right = effect.wipe.currX;
        if (right <= left) right = left;
      }
      effect.workingRowBounds[y] = [left, right];
    }
    if (finished) {
      effect.state++;
      break;
    }
    finished = effect.wipe.update(true, true);
  }
  effect.vblankDma = true;
  return false;
}

/** AngledWipes_TryEnd (battle_transition.c). */
function AngledWipes_TryEnd(effect: AngledWipesEffect): boolean {
  if (++effect.wipeId < NUM_ANGLED_WIPES) {
    effect.state++;
    effect.delay = sAngledWipes_EndDelays[effect.wipeId - 1]!;
    return true;
  }
  effect.done = true;
  return false;
}

/** AngledWipes_StartNext (battle_transition.c). */
function AngledWipes_StartNext(effect: AngledWipesEffect): boolean {
  if (--effect.delay === 0) {
    effect.state = 1;
    return true;
  }
  return false;
}

/** VBlankCB_AngledWipes (battle_transition.c), adapted to copy scanline bounds for Canvas. */
function VBlankCB_AngledWipes(effect: AngledWipesEffect): void {
  if (!effect.vblankDma) return;
  for (let y = 0; y < DISPLAY_HEIGHT; y++) effect.rowBounds[y] = [...effect.workingRowBounds[y]!];
}

class ClockwiseWipeEffect implements Effect {
  readonly rowBounds: [number, number][] = Array.from({ length: DISPLAY_HEIGHT }, () => [DISPLAY_WIDTH + 3, DISPLAY_WIDTH + 4]);
  readonly invertWindow = true;
  readonly completesScreenFade = true;
  readonly workingRowBounds: [number, number][] = Array.from({ length: DISPLAY_HEIGHT }, () => [DISPLAY_WIDTH + 3, DISPLAY_WIDTH + 4]);
  state: "init" | "topRight" | "right" | "bottom" | "left" | "topLeft" | "end" | "done" = "init";
  private wipe = new BlackWipe();
  private endX = DISPLAY_WIDTH / 2;
  private endY = 0;
  private dmaPending = false;

  private setRow(y: number, left: number, right: number): void {
    if (y >= 0 && y < DISPLAY_HEIGHT) this.workingRowBounds[y] = [left, right];
  }

  private getRow(y: number): [number, number] {
    return y >= 0 && y < DISPLAY_HEIGHT ? this.workingRowBounds[y]! : [DISPLAY_WIDTH + 3, DISPLAY_WIDTH + 4];
  }

  tick(): boolean {
    return Task_ClockwiseWipe(this);
  }

  runTask(): boolean {
    let continueTask: boolean;
    do {
      switch (this.state) {
        case "init": continueTask = ClockwiseWipe_Init(this); break;
        case "topRight": continueTask = ClockwiseWipe_TopRight(this); break;
        case "right": continueTask = ClockwiseWipe_Right(this); break;
        case "bottom": continueTask = ClockwiseWipe_Bottom(this); break;
        case "left": continueTask = ClockwiseWipe_Left(this); break;
        case "topLeft": continueTask = ClockwiseWipe_TopLeft(this); break;
        case "end": continueTask = ClockwiseWipe_End(this); break;
        default: continueTask = false; break;
      }
    } while (continueTask);
    VBlankCB_ClockwiseWipe(this);
    return this.state === "done";
  }

  initialize(): boolean {
    this.endX = DISPLAY_WIDTH / 2;
    this.endY = 0;
    this.state = "topRight";
    return true;
  }

  copyScanlineBuffer(): void {
    if (this.dmaPending) for (let y = 0; y < DISPLAY_HEIGHT; y++) this.rowBounds[y] = [...this.workingRowBounds[y]!];
  }

  stepTopRight(): boolean {
    this.dmaPending = false;
      InitBlackWipe(this.wipe, DISPLAY_WIDTH / 2, DISPLAY_HEIGHT / 2, this.endX, -1, 1, 1);
      do {
        this.setRow(this.wipe.currY, DISPLAY_WIDTH / 2, this.wipe.currX + 1);
      } while (!UpdateBlackWipe(this.wipe, true, true));
      this.endX += 32;
      if (this.endX >= DISPLAY_WIDTH) { this.endY = 0; this.state = "right"; }
    this.dmaPending = true;
      return false;
  }

  stepRight(): boolean {
    this.dmaPending = false;
      InitBlackWipe(this.wipe, DISPLAY_WIDTH / 2, DISPLAY_HEIGHT / 2, DISPLAY_WIDTH, this.endY, 1, 1);
      let start = 0, end = 0, finished = false;
      for (;;) {
        start = DISPLAY_WIDTH / 2;
        end = this.wipe.currX + 1;
        if (this.endY >= DISPLAY_HEIGHT / 2) { start = this.wipe.currX; end = DISPLAY_WIDTH; }
        this.setRow(this.wipe.currY, start, end);
        if (finished) break;
        finished = UpdateBlackWipe(this.wipe, true, true);
      }
      this.endY += 16;
      if (this.endY >= DISPLAY_HEIGHT) { this.endX = DISPLAY_WIDTH; this.state = "bottom"; }
      else while (this.wipe.currY < this.endY) { this.wipe.currY++; this.setRow(this.wipe.currY, start, end); }
    this.dmaPending = true;
      return false;
  }

  stepBottom(): boolean {
    this.dmaPending = false;
      InitBlackWipe(this.wipe, DISPLAY_WIDTH / 2, DISPLAY_HEIGHT / 2, this.endX, DISPLAY_HEIGHT, 1, 1);
      do {
        this.setRow(this.wipe.currY, this.wipe.currX, DISPLAY_WIDTH);
      } while (!UpdateBlackWipe(this.wipe, true, true));
      this.endX -= 32;
      if (this.endX <= 0) { this.endY = DISPLAY_HEIGHT; this.state = "left"; }
    this.dmaPending = true;
      return false;
  }

  stepLeft(): boolean {
    this.dmaPending = false;
      InitBlackWipe(this.wipe, DISPLAY_WIDTH / 2, DISPLAY_HEIGHT / 2, 0, this.endY, 1, 1);
      let start = 0, end = 0, finished = false;
      for (;;) {
        end = this.getRow(this.wipe.currY)[1];
        start = this.wipe.currX;
        if (this.endY <= DISPLAY_HEIGHT / 2) { start = DISPLAY_WIDTH / 2; end = this.wipe.currX; }
        this.setRow(this.wipe.currY, start, end);
        if (finished) break;
        finished = UpdateBlackWipe(this.wipe, true, true);
      }
      this.endY -= 16;
      if (this.endY <= 0) { this.endX = 0; this.state = "topLeft"; }
      else while (this.wipe.currY > this.endY) { this.wipe.currY--; this.setRow(this.wipe.currY, start, end); }
    this.dmaPending = true;
      return false;
  }

  stepTopLeft(): boolean {
    this.dmaPending = false;
    InitBlackWipe(this.wipe, 120, 80, this.endX, 0, 1, 1);
    let finished2 = false;
    do {
      let start = DISPLAY_WIDTH / 2, end = this.wipe.currX;
      if (this.wipe.currX >= 120) { start = 0; end = DISPLAY_WIDTH; }
      this.setRow(this.wipe.currY, start, end);
      finished2 = UpdateBlackWipe(this.wipe, true, true);
    } while (!finished2);
    this.endX += 32;
    if (this.wipe.currX > DISPLAY_WIDTH / 2) this.state = "end";
    this.dmaPending = true;
    return false;
  }

  end(): boolean {
    FadeScreenBlack();
    this.state = "done";
    return false;
  }
}

function Task_ClockwiseWipe(effect: ClockwiseWipeEffect): boolean { return effect.runTask(); }
function ClockwiseWipe_Init(effect: ClockwiseWipeEffect): boolean { return effect.initialize(); }
function ClockwiseWipe_TopRight(effect: ClockwiseWipeEffect): boolean { return effect.stepTopRight(); }
function ClockwiseWipe_Right(effect: ClockwiseWipeEffect): boolean { return effect.stepRight(); }
function ClockwiseWipe_Bottom(effect: ClockwiseWipeEffect): boolean { return effect.stepBottom(); }
function ClockwiseWipe_Left(effect: ClockwiseWipeEffect): boolean { return effect.stepLeft(); }
function ClockwiseWipe_TopLeft(effect: ClockwiseWipeEffect): boolean { return effect.stepTopLeft(); }
function ClockwiseWipe_End(effect: ClockwiseWipeEffect): boolean { return effect.end(); }
function VBlankCB_ClockwiseWipe(effect: ClockwiseWipeEffect): void { effect.copyScanlineBuffer(); }
function FadeScreenBlack(): void { paletteFade.fill(RGB_BLACK); }
function InitBlackWipe(wipe: BlackWipe, startX: number, startY: number, endX: number, endY: number, stepX: number, stepY: number): void {
  wipe.init(startX, startY, endX, endY, stepX, stepY);
}
function UpdateBlackWipe(wipe: BlackWipe, xExact: boolean, yExact: boolean): boolean { return wipe.update(xExact, yExact); }

class SliceEffect implements Effect {
  readonly rowBounds: [number, number][] = Array.from({ length: DISPLAY_HEIGHT }, () => [0, DISPLAY_WIDTH]);
  readonly workingRowBounds: [number, number][] = Array.from({ length: DISPLAY_HEIGHT }, () => [0, DISPLAY_WIDTH]);
  readonly rowOffsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);
  readonly workingOffsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);
  readonly invertWindow = false;
  readonly completesScreenFade = true;
  state: "init" | "main" | "end" | "done" = "init";
  effectX = 0;
  speed = 0;
  accel = 0;
  cameraX = 0;
  vblankDma = false;

  tick(): boolean {
    return Task_Slice(this);
  }

  runTask(): boolean {
    let continueTask: boolean;
    do {
      switch (this.state) {
        case "init": continueTask = Slice_Init(this); break;
        case "main": continueTask = Slice_Main(this); break;
        default: continueTask = Slice_End(this); break;
      }
    } while (continueTask);
    if (this.state !== "done") VBlankCB_Slice(this);
    return this.state === "done";
  }

  initialize(): boolean {
    this.speed = 1 << 8;
    this.accel = 1;
    this.state = "main";
    return true;
  }

  updateMain(): boolean {
    this.vblankDma = false;
    this.effectX += this.speed >> 8;
    if (this.effectX > DISPLAY_WIDTH) this.effectX = DISPLAY_WIDTH;
    if (this.speed <= 0xFFF) this.speed += this.accel;
    if (this.accel < 128) this.accel <<= 1;

    for (let i = 0; i < DISPLAY_HEIGHT; i++) {
      if (i & 1) {
        this.workingOffsets[i] = this.cameraX + this.effectX;
        this.workingRowBounds[i] = [0, DISPLAY_WIDTH - this.effectX];
      } else {
        this.workingOffsets[i] = this.cameraX - this.effectX;
        this.workingRowBounds[i] = [this.effectX, DISPLAY_WIDTH + 1];
      }
    }
    if (this.effectX >= DISPLAY_WIDTH) this.state = "end";
    this.vblankDma = true;
    return false;
  }

  end(): boolean {
    FadeScreenBlack();
    this.state = "done";
    return false;
  }

  vblank(): void {
    if (!this.vblankDma) return;
    for (let i = 0; i < DISPLAY_HEIGHT; i++) {
      this.rowBounds[i] = [...this.workingRowBounds[i]!];
      this.rowOffsets[i] = this.workingOffsets[i]!;
    }
    this.vblankDma = false;
  }

  hblank(scanline: number): number { return this.rowOffsets[scanline] ?? 0; }
}

function Task_Slice(effect: SliceEffect): boolean { return effect.runTask(); }
function Slice_Init(effect: SliceEffect): boolean { return effect.initialize(); }
function Slice_Main(effect: SliceEffect): boolean { return effect.updateMain(); }
function Slice_End(effect: SliceEffect): boolean { return effect.end(); }
function VBlankCB_Slice(effect: SliceEffect): void { effect.vblank(); }
function HBlankCB_Slice(effect: SliceEffect, scanline: number): number { return effect.hblank(scanline); }

const NUM_WHITE_BARS = 6;
const WHITE_BAR_HEIGHT = 1 + Math.floor(DISPLAY_HEIGHT / NUM_WHITE_BARS); // 27
const sWhiteBarsFade_StartDelays = [0, 9, 15, 6, 12, 3];
const FADE_TARGET = 16 << 8;

interface WhiteBar {
  y: number;
  x: number;
  fade: number;
  delay: number;
  finished: boolean;
  main: boolean;
  active: boolean;
}

class WhiteBarsFadeEffect implements Effect {
  readonly completesScreenFade = true;
  bars: WhiteBar[] = [];
  state: "init" | "startBars" | "waitBars" | "blendToBlack" | "end" | "done" = "init";
  readonly scanlineBldY = new Uint16Array(DISPLAY_HEIGHT);
  readonly workingBldY = new Uint16Array(DISPLAY_HEIGHT);
  readonly scanlineWin0H = new Uint16Array(DISPLAY_HEIGHT).fill(DISPLAY_WIDTH);
  readonly workingWin0H = new Uint16Array(DISPLAY_HEIGHT).fill(DISPLAY_WIDTH);
  vblankDma = false;
  counter = 0;
  blackBldY = 0;
  appliedBlackBldY = 0;

  tick(): boolean {
    return Task_WhiteBarsFade(this);
  }

  runTask(): boolean {
    let keepRunning: boolean;
    do {
      switch (this.state) {
        case "init": keepRunning = WhiteBarsFade_Init(this); break;
        case "startBars": keepRunning = WhiteBarsFade_StartBars(this); break;
        case "waitBars": keepRunning = WhiteBarsFade_WaitBars(this); break;
        case "blendToBlack": keepRunning = WhiteBarsFade_BlendToBlack(this); break;
        default: keepRunning = WhiteBarsFade_End(this); break;
      }
    } while (keepRunning);
    for (const bar of this.bars) SpriteCB_WhiteBarFade(this, bar);
    if (this.state === "blendToBlack" || this.state === "end") VBlankCB_WhiteBarsFade_Blend(this);
    else if (this.state !== "done") VBlankCB_WhiteBarsFade(this);
    return this.state === "done";
  }

  initialize(): boolean { this.state = "startBars"; return false; }

  startBars(): boolean {
    this.bars = Array.from({ length: NUM_WHITE_BARS }, (_, i) => ({
      y: i * WHITE_BAR_HEIGHT,
      x: DISPLAY_WIDTH,
      fade: 0,
      delay: sWhiteBarsFade_StartDelays[i]!,
      finished: false,
      main: i === NUM_WHITE_BARS - 1,
      active: true,
    }));
    this.state = "waitBars";
    return false;
  }

  waitBars(): boolean {
    this.vblankDma = false;
    if (this.counter >= NUM_WHITE_BARS) this.state = "blendToBlack";
    return false;
  }

  blendToBlack(): boolean {
    this.vblankDma = false;
    this.state = "end";
    this.blackBldY = 0;
    this.counter = 0;
    return false;
  }

  end(): boolean {
    this.counter += 480;
    this.blackBldY = this.counter >> 8;
    if (this.blackBldY > 16) {
      FadeScreenBlack();
      this.state = "done";
    }
    return false;
  }

  stepBar(bar: WhiteBar): void {
    if (!bar.active) return;
    if (bar.delay) {
      bar.delay--;
      if (bar.main) this.vblankDma = true;
      return;
    }
    const rows = bar.main ? WHITE_BAR_HEIGHT - 2 : WHITE_BAR_HEIGHT;
    for (let i = 0; i < rows && bar.y + i < DISPLAY_HEIGHT; i++) {
      this.workingBldY[bar.y + i] = bar.fade >> 8;
      this.workingWin0H[bar.y + i] = bar.x & 0xff;
    }
    if (bar.x === 0 && bar.fade === FADE_TARGET) bar.finished = true;
    bar.x -= 24;
    bar.fade += 192;
    if (bar.x < 0) bar.x = 0;
    if (bar.fade > FADE_TARGET) bar.fade = FADE_TARGET;
    if (bar.main) this.vblankDma = true;
    if (bar.finished && (!bar.main || this.counter > 4)) {
      this.counter++;
      bar.active = false;
    }
  }

  vblank(): void {
    if (this.state === "blendToBlack" || this.state === "end") {
      VBlankCB_WhiteBarsFade_Blend(this);
      return;
    }
    VBlankCB_WhiteBarsFade(this);
  }

  copyScanlineBuffers(): void {
    if (!this.vblankDma) return;
    for (let y = 0; y < DISPLAY_HEIGHT; y++) {
      this.scanlineBldY[y] = this.workingBldY[y]!;
      this.scanlineWin0H[y] = this.workingWin0H[y]!;
    }
  }

  hblank(scanline: number): number {
    const index = scanline === 227 ? 0 : scanline;
    return this.scanlineBldY[index] ?? 0;
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    if (this.state === "init" || this.state === "startBars" || this.state === "waitBars") {
      for (let y = 0; y < DISPLAY_HEIGHT; y++) {
        const right = Math.max(0, Math.min(DISPLAY_WIDTH, this.scanlineWin0H[y]!));
        ctx.drawImage(snapshot, 0, y, right, 1, 0, y, right, 1);
        const alpha = Math.min(1, HBlankCB_WhiteBarsFade(this, y) / 16);
        if (alpha > 0) {
          ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = "#fff";
          ctx.fillRect(0, y, right, 1); ctx.restore();
        }
        if (right < DISPLAY_WIDTH) {
          ctx.fillStyle = "#fff"; ctx.fillRect(right, y, DISPLAY_WIDTH - right, 1);
        }
      }
    } else {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
      const alpha = Math.min(1, this.appliedBlackBldY / 16);
      if (alpha > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
        ctx.restore();
      }
    }
  }
}

function Task_WhiteBarsFade(effect: WhiteBarsFadeEffect): boolean { return effect.runTask(); }
function WhiteBarsFade_Init(effect: WhiteBarsFadeEffect): boolean { return effect.initialize(); }
function WhiteBarsFade_StartBars(effect: WhiteBarsFadeEffect): boolean { return effect.startBars(); }
function WhiteBarsFade_WaitBars(effect: WhiteBarsFadeEffect): boolean { return effect.waitBars(); }
function WhiteBarsFade_BlendToBlack(effect: WhiteBarsFadeEffect): boolean { return effect.blendToBlack(); }
function WhiteBarsFade_End(effect: WhiteBarsFadeEffect): boolean { return effect.end(); }
function SpriteCB_WhiteBarFade(effect: WhiteBarsFadeEffect, bar: WhiteBar): void { effect.stepBar(bar); }
function VBlankCB_WhiteBarsFade(effect: WhiteBarsFadeEffect): void { effect.copyScanlineBuffers(); }
function VBlankCB_WhiteBarsFade_Blend(effect: WhiteBarsFadeEffect): void { effect.appliedBlackBldY = Math.min(effect.blackBldY, 16); }
function HBlankCB_WhiteBarsFade(effect: WhiteBarsFadeEffect, scanline: number): number { return effect.hblank(scanline); }

/** B_TRANSITION_GRID_SQUARES: Task_GridSquares / GridSquares_Main. */
class GridSquaresEffect implements Effect {
  delay = 0;
  shrinkStage = 0;
  state = 0;
  done = false;

  tick(): boolean {
    return Task_GridSquares(this);
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    ctx.drawImage(snapshot, 0, 0);
    if (this.shrinkStage <= 0) return;
    const stage = Math.min(14, this.shrinkStage);
    const size = Math.min(8, Math.round((stage * 8) / 11));
    ctx.fillStyle = "#000";
    if (stage >= 12) {
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
      return;
    }
    const offset = (8 - size) >> 1;
    for (let y = 0; y < 160; y += 8) {
      for (let x = 0; x < 240; x += 8) {
        ctx.fillRect(x + offset, y + offset, size, size);
      }
    }
  }
}

/** Task_GridSquares (battle_transition.c): dispatch task states until a state yields. */
function Task_GridSquares(effect: GridSquaresEffect): boolean {
  let keepRunning: boolean;
  do {
    switch (effect.state) {
      case 0: keepRunning = GridSquares_Init(effect); break;
      case 1: keepRunning = GridSquares_Main(effect); break;
      default: keepRunning = GridSquares_End(effect); break;
    }
  } while (keepRunning);
  return effect.done;
}

/** GridSquares_Init (battle_transition.c); the tilemap/GFX setup is represented by Canvas render. */
function GridSquares_Init(effect: GridSquaresEffect): boolean {
  effect.state++;
  return true;
}

/** GridSquares_Main (battle_transition.c): shrink every third task frame, then wait 15 frames. */
function GridSquares_Main(effect: GridSquaresEffect): boolean {
  if (effect.delay === 0) {
    effect.delay = 3;
    effect.shrinkStage++;
    if (effect.shrinkStage > 13) {
      effect.state++;
      effect.delay = 16;
    }
  }
  effect.delay--;
  return false;
}

/** GridSquares_End (battle_transition.c); the Canvas scene starts the shared black fade. */
function GridSquares_End(effect: GridSquaresEffect): boolean {
  if (--effect.delay === 0) effect.done = true;
  return false;
}

/** B_TRANSITION_SHUFFLE: Task_Shuffle / Shuffle_End. */
class ShuffleEffect implements Effect {
  readonly completesScreenFade = true;
  readonly updatesPaletteFade = true;
  readonly workingOffsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);
  readonly rowOffsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);
  state = 0;
  sinVal = 0;
  amplitude = 0;
  done = false;

  tick(): boolean {
    return Task_Shuffle(this);
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    for (let y = 0; y < DISPLAY_HEIGHT; y++) {
      const sourceY = y + HBlankCB_Shuffle(this, y);
      if (sourceY >= 0 && sourceY < DISPLAY_HEIGHT) {
        ctx.drawImage(snapshot, 0, sourceY, DISPLAY_WIDTH, 1, 0, y, DISPLAY_WIDTH, 1);
      }
    }
  }
}

/** Task_Shuffle (battle_transition.c): dispatch until the state waits for another frame. */
function Task_Shuffle(effect: ShuffleEffect): boolean {
  let keepRunning: boolean;
  do {
    keepRunning = effect.state === 0 ? Shuffle_Init(effect) : Shuffle_End(effect);
  } while (keepRunning);
  return effect.done;
}

/** Shuffle_Init (battle_transition.c). */
function Shuffle_Init(effect: ShuffleEffect): boolean {
  effect.sinVal = 0;
  effect.amplitude = 0;
  effect.workingOffsets.fill(0);
  effect.rowOffsets.fill(0);
  paletteFade.fadeScreen(FADE_TO_BLACK, 4);
  effect.state++;
  return false;
}

/** Shuffle_End (battle_transition.c): update sine-table vertical offsets until C palette fade ends. */
function Shuffle_End(effect: ShuffleEffect): boolean {
  const amplitude = effect.amplitude >> 8;
  let sinVal = effect.sinVal & 0xffff;
  effect.sinVal = (effect.sinVal + 4224) & 0xffff;
  effect.amplitude = (effect.amplitude + 384) << 16 >> 16;
  for (let y = 0; y < DISPLAY_HEIGHT; y++) {
    effect.workingOffsets[y] = safeSin(sinVal >>> 8, amplitude);
    sinVal = (sinVal + 4224) & 0xffff;
  }
  if (!paletteFade.active) effect.done = true;
  VBlankCB_Shuffle(effect);
  return false;
}

/** VBlankCB_Shuffle (battle_transition.c), adapted to commit offsets for Canvas. */
function VBlankCB_Shuffle(effect: ShuffleEffect): void {
  for (let y = 0; y < DISPLAY_HEIGHT; y++) effect.rowOffsets[y] = effect.workingOffsets[y]!;
}

/** HBlankCB_Shuffle (battle_transition.c); Canvas consumes this per-row BG offset. */
function HBlankCB_Shuffle(effect: ShuffleEffect, scanline: number): number {
  return effect.rowOffsets[scanline] ?? 0;
}

/** B_TRANSITION_BIG_POKEBALL: Task_BigPokeball / PatternWeave_CircularMask. */
class BigPokeballEffect implements Effect {
  readonly completesScreenFade = true;
  phase: "init" | "setGfx" | "blend1" | "blend2" | "finish" | "mask" | "done" = "init";
  private blendEva = 0;
  private blendEvb = 16;
  private blendDelay = 0;
  private sinIndex = 0;
  private amplitude = 0x4000;
  private radius = 0;
  private radiusDelta = 0;
  private dmaPending = false;
  appliedEva = 0;
  appliedEvb = 16;
  readonly rowOffsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);
  readonly workingRowOffsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);
  readonly maskBounds: [number, number][] = Array.from({ length: DISPLAY_HEIGHT }, () => [10, 10]);
  private readonly gfx = incbin("sBigPokeball_Gfx");
  private readonly tilemap = incbin16("sBigPokeball_Tilemap");
  private readonly palette = incbin16("sFieldEffectPal_Pokeball");
  private readonly pixels = this.BuildBigPokeballPixels();

  commitWinAndBlend(): void {
    this.appliedEva = this.blendEva;
    this.appliedEvb = this.blendEvb;
  }

  private BigPokeball_Init(): void {
    this.phase = "setGfx";
    this.blendEva = 0; this.blendEvb = 16; this.blendDelay = 0;
    this.sinIndex = 0; this.amplitude = 0x4000;
    this.dmaPending = false;
    this.rowOffsets.fill(0);
    this.workingRowOffsets.fill(0);
    this.appliedEva = 0;
    this.appliedEvb = 16;
  }

  tick(): boolean {
    return Task_BigPokeball(this);
  }

  runTask(): boolean {
    let continueTask: boolean;
    do {
      switch (this.phase) {
        case "init": this.BigPokeball_Init(); continueTask = false; break;
        case "setGfx": continueTask = this.BigPokeball_SetGfx(); break;
        case "blend1": continueTask = this.PatternWeave_Blend1(); break;
        case "blend2": continueTask = this.PatternWeave_Blend2(); break;
        case "finish": continueTask = this.PatternWeave_FinishAppear(); break;
        case "mask": continueTask = this.PatternWeave_CircularMask(); break;
        default: continueTask = false; break;
      }
    } while (continueTask);
    if (this.phase === "mask" || this.phase === "done") VBlankCB_CircularMask(this);
    else VBlankCB_PatternWeave(this);
    return this.phase === "done";
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    if (this.phase === "done") {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
      return;
    }
    const image = ctx.createImageData(DISPLAY_WIDTH, DISPLAY_HEIGHT);
    const base = this.phase === "mask" ? null : snapshot.getContext("2d")!.getImageData(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT).data;
    const eva = this.appliedEva;
    const evb = this.appliedEvb;
    for (let y = 0; y < DISPLAY_HEIGHT; y++) {
      const wave = this.rowOffsets[y]!;
      const row = y * DISPLAY_WIDTH;
      for (let x = 0; x < DISPLAY_WIDTH; x++) {
        if ((this.phase as string === "mask" || this.phase as string === "done") && (x < this.maskBounds[y]![0] || x >= this.maskBounds[y]![1])) continue;
        const sx = Math.max(0, Math.min(DISPLAY_WIDTH - 1, x + wave));
        const color = this.pixels[y * DISPLAY_WIDTH + sx]!;
        const p = (row + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          const bg = Math.round(color[channel]! * 31 / 255);
          const field = base ? Math.round(base[p + channel]! * 31 / 255) : 0;
          image.data[p + channel] = Math.min(31, Math.floor((bg * eva + field * evb) / 16)) * 255 / 31;
        }
        image.data[p + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  private BigPokeball_SetGfx(): boolean {
    SetSinWave(this.workingRowOffsets, 0, this.sinIndex, 132, this.amplitude >> 8, DISPLAY_HEIGHT);
    this.phase = "blend1";
    this.dmaPending = true;
    return true;
  }

  private BuildBigPokeballPixels(): [number, number, number][] {
    const result: [number, number, number][] = Array.from({ length: DISPLAY_WIDTH * DISPLAY_HEIGHT }, () => [0, 0, 0]);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 30; x++) {
      const entry = this.tilemap[y * 30 + x] ?? 0;
      const tile = entry & 0x3ff;
      const hflip = (entry & 0x400) !== 0, vflip = (entry & 0x800) !== 0;
      for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
        const tx = hflip ? 7 - px : px, ty = vflip ? 7 - py : py;
        const n = tile * 32 + ty * 4 + (tx >> 1);
        const packed = this.gfx[n] ?? 0;
        const index = (tx & 1) ? packed >> 4 : packed & 15;
        const rgb = this.palette[index] ?? 0;
        result[(y * 8 + py) * DISPLAY_WIDTH + x * 8 + px] = [((rgb & 31) * 255 / 31) | 0, (((rgb >> 5) & 31) * 255 / 31) | 0, (((rgb >> 10) & 31) * 255 / 31) | 0];
      }
    }
    return result;
  }

  commitPatternWeaveRows(): void {
    if (!this.dmaPending) return;
    for (let y = 0; y < DISPLAY_HEIGHT; y++) this.rowOffsets[y] = this.workingRowOffsets[y]!;
    this.dmaPending = false;
  }

  commitCircularMask(): void {
    const scanlines = new Uint16Array(DISPLAY_HEIGHT);
    SetCircularMask(scanlines, DISPLAY_WIDTH / 2, DISPLAY_HEIGHT / 2, this.radius);
    for (let y = 0; y < DISPLAY_HEIGHT; y++) {
      const packed = scanlines[y]!;
      this.maskBounds[y] = [(packed >> 8) & 0xff, packed & 0xff];
    }
    this.dmaPending = false;
  }

  private PatternWeave_Blend1(): boolean {
    if (this.blendDelay === 0 || --this.blendDelay === 0) {
      this.blendEva++;
      this.blendDelay = 1; // C's condition resets to one, so EVA advances every frame.
    }
    this.sinIndex = (this.sinIndex + 12) & 0xffff;
    this.amplitude -= 384;
    SetSinWave(this.workingRowOffsets, 0, this.sinIndex, 132, this.amplitude >> 8, DISPLAY_HEIGHT);
    this.dmaPending = true;
    if (this.blendEva > 15) this.phase = "blend2";
    return false;
  }

  private PatternWeave_Blend2(): boolean {
    if (this.blendDelay === 0 || --this.blendDelay === 0) {
      this.blendEvb--;
      this.blendDelay = 2;
    }
    if (this.amplitude > 0) {
      this.sinIndex = (this.sinIndex + 12) & 0xffff;
      this.amplitude -= 384;
    } else this.amplitude = 0;
    SetSinWave(this.workingRowOffsets, 0, this.sinIndex, 132, this.amplitude >> 8, DISPLAY_HEIGHT);
    this.dmaPending = true;
    if (this.blendEvb === 0) this.phase = "finish";
    return false;
  }

  private PatternWeave_FinishAppear(): boolean {
    if (this.amplitude > 0) {
      this.sinIndex = (this.sinIndex + 12) & 0xffff;
      this.amplitude -= 384;
    } else this.amplitude = 0;
    SetSinWave(this.workingRowOffsets, 0, this.sinIndex, 132, this.amplitude >> 8, DISPLAY_HEIGHT);
    this.dmaPending = true;
    if (this.amplitude <= 0) {
      this.phase = "mask";
      this.radius = DISPLAY_HEIGHT;
      this.radiusDelta = 1 << 8;
    }
    return false;
  }

  private PatternWeave_CircularMask(): boolean {
    this.dmaPending = false;
    if (this.radiusDelta < (8 << 8)) this.radiusDelta += (1 << 8);
    if (this.radius !== 0) this.radius = Math.max(0, this.radius - (this.radiusDelta >> 8));
    if (this.radius === 0) { this.phase = "done"; return true; }
    return false;
  }
}

function SetSinWave(buffer: number[], offset: number, index: number, frequency: number, amplitude: number, bufSize: number): void {
  let sinIndex = index;
  for (let i = 0; i < bufSize; i++, sinIndex += frequency)
    buffer[i] = offset + safeSin(sinIndex & 0xff, amplitude);
}

function SetCircularMask(buffer: Uint16Array, x: number, y: number, radius: number): void {
  buffer.fill(0x0a0a);
  for (let i = 0; i < 64; i++) {
    const sinResult = safeSin(i, radius);
    const cosResult = safeSin(i + 64, radius);
    let leftX = x - sinResult, rightX = x + sinResult;
    let topY = y - cosResult, bottomY = y + cosResult;
    if (leftX < 0) leftX = 0;
    if (rightX > DISPLAY_WIDTH) rightX = DISPLAY_WIDTH;
    if (topY < 0) topY = 0;
    if (bottomY > DISPLAY_HEIGHT - 1) bottomY = DISPLAY_HEIGHT - 1;
    const winVal = ((leftX << 8) | rightX) & 0xffff;
    buffer[topY] = winVal;
    buffer[bottomY] = winVal;
    const nextCos = safeSin(i + 65, radius);
    let nextTopY = y - nextCos, nextBottomY = y + nextCos;
    if (nextTopY < 0) nextTopY = 0;
    if (nextBottomY > DISPLAY_HEIGHT - 1) nextBottomY = DISPLAY_HEIGHT - 1;
    while (topY > nextTopY) buffer[--topY] = winVal;
    while (topY < nextTopY) buffer[++topY] = winVal;
    while (bottomY > nextBottomY) buffer[--bottomY] = winVal;
    while (bottomY < nextBottomY) buffer[++bottomY] = winVal;
  }
}

function Task_BigPokeball(effect: BigPokeballEffect): boolean {
  return effect.runTask();
}

function VBlankCB_SetWinAndBlend(effect: BigPokeballEffect): void {
  effect.commitWinAndBlend();
}

function VBlankCB_PatternWeave(effect: BigPokeballEffect): void {
  VBlankCB_SetWinAndBlend(effect);
  effect.commitPatternWeaveRows();
}

function VBlankCB_CircularMask(effect: BigPokeballEffect): void {
  VBlankCB_SetWinAndBlend(effect);
  effect.commitCircularMask();
}

function safeSin(index: number, amplitude: number): number {
  const idx = index & 0xff;
  if (gSineTable && gSineTable.length >= 256 && gSineTable[64] !== 0) {
    return Sin(idx, amplitude);
  }
  return Math.round(amplitude * Math.sin((idx * 2 * Math.PI) / 256));
}

/** Task_Wave: Sine wave window wipe from left to right. */
class WaveEffect implements Effect {
  readonly rowBounds: [number, number][] = Array.from({ length: DISPLAY_HEIGHT }, () => [0, DISPLAY_WIDTH]);
  readonly workingRowBounds: [number, number][] = Array.from({ length: DISPLAY_HEIGHT }, () => [DISPLAY_WIDTH + 2, DISPLAY_WIDTH + 4]);
  state = 0;
  tX = 0;
  tSinIndex = 0;
  vblankDma = false;
  done = false;

  tick(): boolean {
    return Task_Wave(this);
  }
}

/** Task_Wave (battle_transition.c): run the C state table until it yields a frame. */
function Task_Wave(effect: WaveEffect): boolean {
  let keepRunning: boolean;
  do {
    switch (effect.state) {
      case 0: keepRunning = Wave_Init(effect); break;
      case 1: keepRunning = Wave_Main(effect); break;
      default: keepRunning = Wave_End(effect); break;
    }
  } while (keepRunning);
  VBlankCB_Wave(effect);
  return effect.done;
}

/** Wave_Init (battle_transition.c). */
function Wave_Init(effect: WaveEffect): boolean {
  effect.vblankDma = false;
  effect.state++;
  return true;
}

/** Wave_Main (battle_transition.c): compute the u8 sine index and clipped WIN0H per scanline. */
function Wave_Main(effect: WaveEffect): boolean {
  effect.vblankDma = false;
  effect.tSinIndex = (effect.tSinIndex + 16) & 0xffff;
  effect.tX = (effect.tX + 8) | 0;
  let sinIndex = effect.tSinIndex & 0xff;
  let finished = true;
  for (let i = 0; i < DISPLAY_HEIGHT; i++) {
    let x = effect.tX + safeSin(sinIndex, 40);
    sinIndex = (sinIndex + 4) & 0xff;
    if (x < 0) x = 0;
    if (x > DISPLAY_WIDTH) x = DISPLAY_WIDTH;
    effect.workingRowBounds[i] = [x, DISPLAY_WIDTH + 1];
    if (x < DISPLAY_WIDTH) finished = false;
  }
  if (finished) effect.state++;
  effect.vblankDma = true;
  return false;
}

/** Wave_End (battle_transition.c); the Canvas scene performs the shared black fade. */
function Wave_End(effect: WaveEffect): boolean {
  effect.done = true;
  return false;
}

/** VBlankCB_Wave (battle_transition.c), adapted to commit scanline bounds for Canvas. */
function VBlankCB_Wave(effect: WaveEffect): void {
  if (!effect.vblankDma) return;
  for (let y = 0; y < DISPLAY_HEIGHT; y++) effect.rowBounds[y] = [...effect.workingRowBounds[y]!];
}

/** Task_Ripple / Ripple_Main: Vertical scanline sinusoidal ripple, then fade to black. */
class RippleEffect implements Effect {
  readonly updatesPaletteFade = true;
  readonly completesScreenFade = true;
  state = 0;
  sinVal = 0;
  amplitude = 0;
  timer = 0;
  fadeStarted = false;
  dmaPending = false;
  done = false;
  readonly offsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);
  readonly workingOffsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);

  tick(): boolean {
    return Task_Ripple(this);
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    for (let y = 0; y < DISPLAY_HEIGHT; y++) {
      const ofs = HBlankCB_Ripple(this, y);
      const sy = Math.max(0, Math.min(DISPLAY_HEIGHT - 1, y + ofs));
      ctx.drawImage(snapshot, 0, sy, DISPLAY_WIDTH, 1, 0, y, DISPLAY_WIDTH, 1);
    }
  }
}

/** Task_Ripple (battle_transition.c): Ripple_Init continues directly into Ripple_Main. */
function Task_Ripple(effect: RippleEffect): boolean {
  if (effect.state === 0 && !Ripple_Init(effect)) return effect.done;
  return Ripple_Main(effect);
}

/** Ripple_Init (battle_transition.c): initialize both scanline buffers at the snapshot origin. */
function Ripple_Init(effect: RippleEffect): boolean {
  effect.offsets.fill(0);
  effect.workingOffsets.fill(0);
  effect.dmaPending = false;
  effect.state++;
  return true;
}

/** Ripple_Main (battle_transition.c): update vertical offsets, then fade after 41 frames. */
function Ripple_Main(effect: RippleEffect): boolean {
  effect.dmaPending = false;
  const amplitude = effect.amplitude >> 8;
  let sinVal = effect.sinVal;
  const speed = 384;
  effect.sinVal = (effect.sinVal + 0x400) & 0xffff;
  if (effect.amplitude <= 0x1fff) effect.amplitude = (effect.amplitude + 384) & 0xffff;
  for (let i = 0; i < DISPLAY_HEIGHT; i++) {
    effect.workingOffsets[i] = safeSin((sinVal >> 8) & 0xff, amplitude);
    sinVal = (sinVal + speed) & 0xffff;
  }
  if (++effect.timer === 41) {
    effect.fadeStarted = true;
    paletteFade.fadeScreen(FADE_TO_BLACK, -8);
  }
  if (effect.fadeStarted && !paletteFade.active) effect.done = true;
  effect.dmaPending = true;
  VBlankCB_Ripple(effect);
  return effect.done;
}

/** VBlankCB_Ripple (battle_transition.c): commit pending offsets to the displayed rows. */
function VBlankCB_Ripple(effect: RippleEffect): void {
  if (!effect.dmaPending) return;
  for (let i = 0; i < DISPLAY_HEIGHT; i++) effect.offsets[i] = effect.workingOffsets[i]!;
}

/** HBlankCB_Ripple (battle_transition.c): return the vertical BG offset for this scanline. */
function HBlankCB_Ripple(effect: RippleEffect, scanline: number): number {
  return effect.offsets[scanline] ?? 0;
}

/** Task_Swirl / Swirl_End: Horizontal scanline sinusoidal swirl with simultaneous fade to black. */
class SwirlEffect implements Effect {
  readonly updatesPaletteFade = true;
  readonly completesScreenFade = true;
  state = 0;
  sinIndex = 0;
  amplitude = 0;
  dmaPending = false;
  done = false;
  readonly offsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);
  readonly workingOffsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);

  tick(): boolean {
    return Task_Swirl(this);
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    for (let y = 0; y < DISPLAY_HEIGHT; y++) {
      const ofs = HBlankCB_Swirl(this, y);
      ctx.drawImage(snapshot, 0, y, DISPLAY_WIDTH, 1, ofs, y, DISPLAY_WIDTH, 1);
      if (ofs > 0) {
        ctx.drawImage(snapshot, DISPLAY_WIDTH - ofs, y, ofs, 1, 0, y, ofs, 1);
      } else if (ofs < 0) {
        ctx.drawImage(snapshot, 0, y, -ofs, 1, DISPLAY_WIDTH + ofs, y, -ofs, 1);
      }
    }
  }
}

/** Task_Swirl (battle_transition.c): dispatch the init state, then yield each frame. */
function Task_Swirl(effect: SwirlEffect): boolean {
  if (effect.state === 0) return Swirl_Init(effect);
  return Swirl_End(effect);
}

/** Swirl_Init (battle_transition.c): the two GBA scanline buffers map to Canvas row offsets. */
function Swirl_Init(effect: SwirlEffect): boolean {
  effect.offsets.fill(0);
  effect.workingOffsets.fill(0);
  effect.dmaPending = false;
  paletteFade.fadeScreen(FADE_TO_BLACK, 4);
  effect.state++;
  return false;
}

/** Swirl_End (battle_transition.c): advance the sine wave and wait for the palette fade. */
function Swirl_End(effect: SwirlEffect): boolean {
  effect.dmaPending = false;
  effect.sinIndex = (effect.sinIndex + 4) & 0xffff;
  effect.amplitude = (effect.amplitude + 8) & 0xffff;
  for (let y = 0; y < DISPLAY_HEIGHT; y++) {
    effect.workingOffsets[y] = safeSin((effect.sinIndex + y * 2) & 0xff, effect.amplitude);
  }
  if (!paletteFade.active) effect.done = true;
  effect.dmaPending = true;
  VBlankCB_Swirl(effect);
  return effect.done;
}

/** VBlankCB_Swirl (battle_transition.c): copy the prepared scanline offsets. */
function VBlankCB_Swirl(effect: SwirlEffect): void {
  if (!effect.dmaPending) return;
  for (let y = 0; y < DISPLAY_HEIGHT; y++) effect.offsets[y] = effect.workingOffsets[y]!;
}

/** HBlankCB_Swirl (battle_transition.c): apply the committed BG offset for the current scanline. */
function HBlankCB_Swirl(effect: SwirlEffect, scanline: number): number {
  return effect.offsets[scanline] ?? 0;
}

/** Task_Blur / Blur_Main: GBA mosaic zoom and fade to black. */
class BlurEffect implements Effect {
  readonly completesScreenFade = true;
  delay = 0;
  counter = 0;
  blackLevel = 0;
  state = 0;
  fadeStarted = false;
  done = false;

  tick(): boolean {
    return Task_Blur(this);
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    const mosaic = Math.max(1, (this.counter & 0xf) + 1);
    const sw = Math.max(1, Math.floor(DISPLAY_WIDTH / mosaic));
    const sh = Math.max(1, Math.floor(DISPLAY_HEIGHT / mosaic));

    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(snapshot, 0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT, 0, 0, sw, sh);
    ctx.drawImage(ctx.canvas, 0, 0, sw, sh, 0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    ctx.imageSmoothingEnabled = prevSmoothing;

    if (this.blackLevel > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${this.blackLevel / 16})`;
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    }
  }
}

/** Task_Blur (battle_transition.c): dispatch task states while preserving task-frame delays. */
function Task_Blur(effect: BlurEffect): boolean {
  if (effect.fadeStarted && effect.blackLevel < 16) effect.blackLevel++;
  let keepRunning: boolean;
  do {
    switch (effect.state) {
      case 0: keepRunning = Blur_Init(effect); break;
      case 1: keepRunning = Blur_Main(effect); break;
      default: keepRunning = Blur_End(effect); break;
    }
  } while (keepRunning);
  return effect.done;
}

/** Blur_Init (battle_transition.c); Canvas rendering supplies the mosaic effect. */
function Blur_Init(effect: BlurEffect): boolean {
  effect.state++;
  return true;
}

/** Blur_Main (battle_transition.c). */
function Blur_Main(effect: BlurEffect): boolean {
  if (effect.delay !== 0) {
    effect.delay--;
  } else {
    effect.delay = 2;
    if (++effect.counter === 10) effect.fadeStarted = true;
    if (effect.counter > 14) effect.state++;
  }
  return false;
}

/** Blur_End (battle_transition.c): wait for the fade started by Blur_Main. */
function Blur_End(effect: BlurEffect): boolean {
  if (effect.blackLevel >= 16) effect.done = true;
  return false;
}

/** Task_PokeballsTrail / SpriteCB_FldEffPokeballTrail: 5 Pokéballs sliding horizontally wiping trails. */
class PokeballsTrailEffect implements Effect {
  private balls: Array<{ x: number; y: number; side: number; delay: number; speed: number; prevX: number; rotation: number; active: boolean }>;
  private trails: boolean[][][];
  private readonly ballImage: HTMLCanvasElement;
  private state: "init" | "main" | "end" = "init";
  private done = false;

  constructor() {
    this.ballImage = this.FldEff_PokeballTrail_LoadSpriteImage();
    this.balls = [];
    this.trails = Array.from({ length: 5 }, () => Array.from({ length: 20 }, () => new Array(30).fill(false)));
  }

  tick(): boolean {
    return this.Task_PokeballsTrail();
  }

  private Task_PokeballsTrail(): boolean {
    if (this.state === "init") { this.PokeballsTrail_Init(); this.state = "main"; return false; }
    if (this.state === "main") { this.PokeballsTrail_Main(); this.state = "end"; return false; }
    this.PokeballsTrail_End();
    return this.done;
  }

  private PokeballsTrail_Init(): void {
    // C loads the two-tile trail sheet and palette before starting its five field effects.
    this.balls = [];
  }

  private PokeballsTrail_Main(): void {
    const delays = [0, 16, 32, 8, 24];
    const speeds = [8, -8];
    const startX = [-16, 256];
    let side = Random() & 1;
    for (let i = 0; i < 5; i++, side ^= 1) {
      this.FldEff_PokeballTrail(startX[side]!, i * 32 + 16, side, delays[i]!, speeds[side]!);
    }
  }

  private FldEff_PokeballTrail(x: number, y: number, side: number, delay: number, speed: number): 0 {
    this.balls.push({ x, y, side, delay, speed, prevX: -1, rotation: 0, active: true });
    return 0; // FieldEffectStart callback returns FALSE in C.
  }

  private SpriteCB_FldEffPokeballTrail(b: (typeof this.balls)[number], trailIndex: number): void {
    if (!b.active) return;
    b.rotation = (b.rotation + (b.side === 0 ? -4 : 4)) & 0xff;
    if (b.delay !== 0) {
      b.delay--;
      return;
    }
    if (b.x >= 0 && b.x <= DISPLAY_WIDTH) {
      const posX = b.x >> 3;
      const posY = b.y >> 3;
      if (posX !== b.prevX) {
        b.prevX = posX;
        // C's SET_TILE writes tile 1 in rows posY-2 through posY+1 (palette 15).
        for (let dy = posY - 2; dy <= posY + 1; dy++) {
          if (dy >= 0 && dy < 20 && posX >= 0 && posX < 30) this.trails[trailIndex]![dy]![posX] = true;
        }
      }
    }
    b.x += b.speed;
    if (b.x < -15 || b.x > DISPLAY_WIDTH + 15) b.active = false;
  }

  private PokeballsTrail_End(): void {
    let anyActive = false;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i]!;
      this.SpriteCB_FldEffPokeballTrail(b, i);
      if (b.active) anyActive = true;
    }
    if (!anyActive) this.done = true;
  }

  private FldEff_PokeballTrail_LoadSpriteImage(): HTMLCanvasElement {
    const gfx = incbin("sSlidingPokeball_Gfx");
    const palette = incbin16("sFieldEffectPal_Pokeball");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(32, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const tile = (y >> 3) * 4 + (x >> 3);
      const byteIndex = tile * 32 + (y & 7) * 4 + ((x & 7) >> 1);
      const packed = gfx[byteIndex] ?? 0;
      const colorIndex = (x & 1) ? packed >> 4 : packed & 15;
      const color = palette[colorIndex] ?? 0;
      const p = (y * 32 + x) * 4;
      image.data[p] = ((color & 31) * 255 / 31) | 0;
      image.data[p + 1] = (((color >> 5) & 31) * 255 / 31) | 0;
      image.data[p + 2] = (((color >> 10) & 31) * 255 / 31) | 0;
      image.data[p + 3] = colorIndex === 0 ? 0 : 255;
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    if (this.done) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
      return;
    }
    ctx.drawImage(snapshot, 0, 0);

    ctx.fillStyle = "#000";
    for (const trail of this.trails) for (let row = 0; row < 20; row++) for (let col = 0; col < 30; col++) {
      if (trail[row]![col]) ctx.fillRect(col * 8, row * 8, 8, 8);
    }

    for (const b of this.balls) {
      if (!b.active || b.delay > 0) continue;
      if (b.x < -16 || b.x > DISPLAY_WIDTH + 16) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rotation * (2 * Math.PI / 256));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.ballImage, -16, -16);
      ctx.restore();
    }
  }
}

/** Task_BattleTransition_Intro: two gray blinks (BlendPalettes toward RGB(11,11,11)) before the main effect. */
class IntroBlink {
  private blend = 0;
  private state = 0;
  private delayTimer: number;
  private numFades: number;
  done = false;

  constructor(
    private readonly fadeToGrayDelay: number,
    private readonly fadeFromGrayDelay: number,
    numFades: number,
    private readonly fadeToGraySpeed: number,
    private readonly fadeFromGraySpeed: number,
  ) {
    this.numFades = numFades;
    this.delayTimer = fadeToGrayDelay;
  }

  /** Task_BattleTransition_Intro dispatches one TransitionIntro stage per frame. */
  Task_BattleTransition_Intro(): number | null {
    if (this.done) return null;
    if (this.state === 0) this.TransitionIntro_FadeToGray();
    else this.TransitionIntro_FadeFromGray();
    return this.done ? null : this.blend;
  }

  /** TransitionIntro_FadeToGray: C task data[7] blend and data[6] delay. */
  private TransitionIntro_FadeToGray(): void {
    if (this.delayTimer === 0 || --this.delayTimer === 0) {
      this.delayTimer = this.fadeToGrayDelay;
      this.blend += this.fadeToGraySpeed;
      if (this.blend > 16) this.blend = 16;
    }
    if (this.blend >= 16) {
      this.state++;
      this.delayTimer = this.fadeFromGrayDelay;
    }
  }

  /** TransitionIntro_FadeFromGray: finish each pulse or begin the next one. */
  private TransitionIntro_FadeFromGray(): void {
    if (this.delayTimer === 0 || --this.delayTimer === 0) {
      this.delayTimer = this.fadeFromGrayDelay;
      this.blend -= this.fadeFromGraySpeed;
      if (this.blend < 0) this.blend = 0;
    }
    if (this.blend === 0) {
      if (--this.numFades === 0) this.done = true;
      else { this.delayTimer = this.fadeToGrayDelay; this.state = 0; }
    }
  }

  /** IsIntroTaskDone (battle_transition.c). */
  IsIntroTaskDone(): boolean { return this.done; }
}

/** CreateIntroTask (battle_transition.c): defaults match the shared transition intro. */
function CreateIntroTask(fadeToGrayDelay: number, fadeFromGrayDelay: number, numFades: number, fadeToGraySpeed: number, fadeFromGraySpeed: number): IntroBlink {
  return new IntroBlink(fadeToGrayDelay, fadeFromGrayDelay, numFades, fadeToGraySpeed, fadeFromGraySpeed);
}

const GRAY = [88, 88, 88]; // RGB(11, 11, 11)

export class BattleTransitionScene implements Scene {
  private readonly snapshot: HTMLCanvasElement;
  private intro: IntroBlink | null = CreateIntroTask(0, 0, 2, 2, 2);
  private introBlend = 0;
  private effect: Effect | null;
  private readonly hadEffect: boolean;
  private done = false;

  constructor(transitionId: number, sourceCtx: CanvasRenderingContext2D, private readonly onDone: () => void) {
    this.snapshot = document.createElement("canvas");
    this.snapshot.width = DISPLAY_WIDTH;
    this.snapshot.height = DISPLAY_HEIGHT;
    this.snapshot.getContext("2d")!.drawImage(sourceCtx.canvas, 0, 0);
    this.effect = transitionId === C.B_TRANSITION_ANGLED_WIPES ? new AngledWipesEffect()
      : transitionId === C.B_TRANSITION_CLOCKWISE_WIPE ? new ClockwiseWipeEffect()
      : transitionId === C.B_TRANSITION_SLICE ? new SliceEffect()
      : transitionId === C.B_TRANSITION_WHITE_BARS_FADE ? new WhiteBarsFadeEffect()
      : transitionId === C.B_TRANSITION_GRID_SQUARES ? new GridSquaresEffect()
      : transitionId === C.B_TRANSITION_SHUFFLE ? new ShuffleEffect()
      : transitionId === C.B_TRANSITION_BIG_POKEBALL ? new BigPokeballEffect()
      : transitionId === C.B_TRANSITION_WAVE ? new WaveEffect()
      : transitionId === C.B_TRANSITION_RIPPLE ? new RippleEffect()
      : transitionId === C.B_TRANSITION_SWIRL ? new SwirlEffect()
      : transitionId === C.B_TRANSITION_BLUR ? new BlurEffect()
      : transitionId === C.B_TRANSITION_POKEBALLS_TRAIL ? new PokeballsTrailEffect()
      : transitionId >= C.B_TRANSITION_LORELEI && transitionId <= C.B_TRANSITION_BLUE ? new MugshotTransitionEffect(transitionId, save.playerGender)
      : null;
    this.hadEffect = this.effect !== null;
  }

  update(): void {
    if (this.done) return;
    if (this.intro) {
      const blend = this.intro.Task_BattleTransition_Intro();
      if (this.intro.IsIntroTaskDone()) this.intro = null;
      if (blend === null) { this.intro = null; this.introBlend = 0; } else this.introBlend = blend;
      return;
    }
    if (this.effect) {
      const effect = this.effect;
      const effectFinished = effect.tick();
      if (effect.updatesPaletteFade) paletteFade.update();
      if (effectFinished) {
        const alreadyFaded = effect.completesScreenFade === true;
        this.effect = null;
        if (alreadyFaded) {
          this.done = true;
          this.onDone();
        }
      }
      return;
    }
    if (!paletteFade.active && paletteFade.level < 16) { paletteFade.fadeScreen(FADE_TO_BLACK, 0); return; }
    if (paletteFade.active) { paletteFade.update(); return; }
    this.done = true;
    this.onDone();
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    if (this.effect) {
      if (this.effect.render) {
        this.effect.render(ctx, this.snapshot);
      } else if (this.effect.rowBounds) {
        const { rowBounds, invertWindow, rowOffsets } = this.effect;
        for (let y = 0; y < DISPLAY_HEIGHT; y++) {
          const [rawLeft, rawRight] = rowBounds[y]!;
          const [left, right] = WIN_RANGE(rawLeft, rawRight);
          const ofs = this.effect instanceof SliceEffect ? HBlankCB_Slice(this.effect, y) : rowOffsets ? rowOffsets[y]! : 0;
          if (invertWindow) {
            if (left > 0) ctx.drawImage(this.snapshot, 0, y, left, 1, 0, y, left, 1);
            if (right < DISPLAY_WIDTH) ctx.drawImage(this.snapshot, right, y, DISPLAY_WIDTH - right, 1, right, y, DISPLAY_WIDTH - right, 1);
          } else if (right > left) {
            const w = right - left;
            const sx = Math.max(0, Math.min(DISPLAY_WIDTH - w, left + ofs));
            ctx.drawImage(this.snapshot, sx, y, w, 1, left, y, w, 1);
          }
        }
      }
    } else if (!this.hadEffect && !this.done) {
      // No wipe implemented for this transition id: keep the pre-existing plain-fade behavior.
      ctx.drawImage(this.snapshot, 0, 0);
    }
    // Gray blink and the closing black fade are both a flat alpha overlay, like gba/fade.ts's paletteFade.
    if (this.introBlend > 0) {
      ctx.save();
      ctx.globalAlpha = this.introBlend / 16;
      ctx.fillStyle = `rgb(${GRAY[0]},${GRAY[1]},${GRAY[2]})`;
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
      ctx.restore();
    }
    paletteFade.render(ctx);
  }
}
