// Port of battle_transition.c: the pre-battle screen effect (BattleTransition_StartOnField).
//
// Scope for this pass: the shared intro (double gray blink, Task_Intro /
// TransitionIntro_FadeToGray / TransitionIntro_FadeFromGray) plus four named effects:
// - B_TRANSITION_ANGLED_WIPES (trainer/normal pick when enemy not weaker)
// - B_TRANSITION_CLOCKWISE_WIPE (wild/cave pick when enemy weaker, e.g. Mt. Moon)
// - B_TRANSITION_SLICE (wild/normal pick when enemy weaker, e.g. Route 1-3)
// - B_TRANSITION_WHITE_BARS_FADE (wild/normal pick when enemy not weaker)
// Every other B_TRANSITION_* id still gets the intro blink, then falls back to the
// plain black fade the port already used.
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
import { paletteFade, FADE_TO_BLACK } from "../gba/fade";
import type { Pokemon } from "../pokemon/pokemon";
import { rom } from "../rom";
import { save } from "../save";
import type { Overworld } from "../field/overworld";
import { MetatileBehavior_IsSurfable } from "../generated/metatileBehavior";
import { Sin, gSineTable } from "../hw/trig";

const MAP_TYPE_UNDERGROUND = 4;
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
function getBattleTransitionTypeByMap(ow: Overworld): number {
  const p = ow.player.object;
  const behavior = ow.map.behaviorAt(p.currentCoords.x, p.currentCoords.y);
  if (ow.flashLevel) return TRANSITION_TYPE_FLASH;
  if (MetatileBehavior_IsSurfable(behavior)) return TRANSITION_TYPE_WATER;
  if (ow.header.mapType === MAP_TYPE_UNDERGROUND) return TRANSITION_TYPE_CAVE;
  return TRANSITION_TYPE_NORMAL;
}

function sumPlayerPartyLevel(numMons: number): number {
  let sum = 0, remaining = numMons;
  for (const mon of save.party) {
    if (mon.isEgg || mon.species === 0 || mon.hp === 0) continue;
    sum += mon.level;
    if (--remaining === 0) break;
  }
  return sum;
}

function sumEnemyPartyLevel(enemyParty: Pokemon[], numMons: number): number {
  let sum = 0;
  for (let i = 0; i < numMons && i < enemyParty.length; i++) sum += enemyParty[i]!.level;
  return sum;
}

/** GetWildBattleTransition */
export function getWildBattleTransition(ow: Overworld, enemyParty: Pokemon[]): number {
  const type = getBattleTransitionTypeByMap(ow);
  const enemyLevel = enemyParty[0]?.level ?? 0;
  const playerLevel = sumPlayerPartyLevel(1);
  return sBattleTransitionTable_Wild[type]![enemyLevel < playerLevel ? 0 : 1]!;
}

/** GetTrainerBattleTransition */
export function getTrainerBattleTransition(ow: Overworld, trainerId: number, isDouble: boolean, enemyParty: Pokemon[]): number {
  const trainer = rom.trainers[trainerId];
  if (trainer?.class === rom.c("TRAINER_CLASS_ELITE_FOUR") || trainer?.class === rom.c("TRAINER_CLASS_CHAMPION")) {
    return C.B_TRANSITION_BLUE; // Not ported: dedicated mugshot transitions (Lorelei/Bruno/Agatha/Lance/Blue).
  }
  const minPartyCount = isDouble ? 2 : 1;
  const type = getBattleTransitionTypeByMap(ow);
  const enemyLevel = sumEnemyPartyLevel(enemyParty, minPartyCount);
  const playerLevel = sumPlayerPartyLevel(minPartyCount);
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
  private state: "setWipeData" | "doWipe" | "tryEnd" | "startNext" = "setWipeData";
  private wipe = new BlackWipe();
  private wipeId = 0;
  private dir = 0;
  private delay = 0;

  tick(): boolean {
    for (;;) {
      if (this.state === "setWipeData") {
        const [sx, sy, ex, ey, dir] = sAngledWipes_MoveData[this.wipeId]!;
        this.wipe.init(sx, sy, ex, ey, 1, 1);
        this.dir = dir;
        this.state = "doWipe";
        continue;
      }
      if (this.state === "doWipe") {
        let finished = false;
        for (let i = 0; i < 16; i++) {
          // The C's scanline buffer has slack past DISPLAY_HEIGHT; a wipe's start/end Y can
          // legally sit one row past the last visible one, so skip writes that land there.
          const y = this.wipe.currY;
          if (y >= 0 && y < DISPLAY_HEIGHT) {
            let [left, right] = this.rowBounds[y]!;
            if (this.dir === 0) {
              if (left < this.wipe.currX) left = this.wipe.currX;
              if (left > right) left = right;
            } else {
              if (right > this.wipe.currX) right = this.wipe.currX;
              if (right <= left) right = left;
            }
            this.rowBounds[y] = [left, right];
          }
          if (finished) { this.state = "tryEnd"; break; }
          finished = this.wipe.update(true, true);
        }
        return false;
      }
      if (this.state === "tryEnd") {
        this.wipeId++;
        if (this.wipeId < NUM_ANGLED_WIPES) {
          this.delay = sAngledWipes_EndDelays[this.wipeId - 1]!;
          this.state = "startNext";
          continue;
        }
        return true;
      }
      // startNext
      if (--this.delay === 0) { this.state = "setWipeData"; continue; }
      return false;
    }
  }
}

class ClockwiseWipeEffect implements Effect {
  readonly rowBounds: [number, number][] = Array.from({ length: DISPLAY_HEIGHT }, () => [DISPLAY_WIDTH + 3, DISPLAY_WIDTH + 4]);
  readonly invertWindow = true;
  private state: "topRight" | "right" | "bottom" | "left" | "topLeft" = "topRight";
  private wipe = new BlackWipe();
  private endX = DISPLAY_WIDTH / 2;
  private endY = 0;

  private setRow(y: number, left: number, right: number): void {
    if (y >= 0 && y < DISPLAY_HEIGHT) this.rowBounds[y] = [left, right];
  }

  private getRow(y: number): [number, number] {
    return y >= 0 && y < DISPLAY_HEIGHT ? this.rowBounds[y]! : [DISPLAY_WIDTH + 3, DISPLAY_WIDTH + 4];
  }

  tick(): boolean {
    if (this.state === "topRight") {
      this.wipe.init(DISPLAY_WIDTH / 2, DISPLAY_HEIGHT / 2, this.endX, -1, 1, 1);
      do {
        this.setRow(this.wipe.currY, DISPLAY_WIDTH / 2, this.wipe.currX + 1);
      } while (!this.wipe.update(true, true));
      this.endX += 32;
      if (this.endX >= DISPLAY_WIDTH) { this.endY = 0; this.state = "right"; }
      return false;
    }
    if (this.state === "right") {
      this.wipe.init(DISPLAY_WIDTH / 2, DISPLAY_HEIGHT / 2, DISPLAY_WIDTH, this.endY, 1, 1);
      let start = 0, end = 0, finished = false;
      for (;;) {
        start = DISPLAY_WIDTH / 2;
        end = this.wipe.currX + 1;
        if (this.endY >= DISPLAY_HEIGHT / 2) { start = this.wipe.currX; end = DISPLAY_WIDTH; }
        this.setRow(this.wipe.currY, start, end);
        if (finished) break;
        finished = this.wipe.update(true, true);
      }
      this.endY += 16;
      if (this.endY >= DISPLAY_HEIGHT) { this.endX = DISPLAY_WIDTH; this.state = "bottom"; }
      else while (this.wipe.currY < this.endY) { this.wipe.currY++; this.setRow(this.wipe.currY, start, end); }
      return false;
    }
    if (this.state === "bottom") {
      this.wipe.init(DISPLAY_WIDTH / 2, DISPLAY_HEIGHT / 2, this.endX, DISPLAY_HEIGHT, 1, 1);
      do {
        this.setRow(this.wipe.currY, this.wipe.currX, DISPLAY_WIDTH);
      } while (!this.wipe.update(true, true));
      this.endX -= 32;
      if (this.endX <= 0) { this.endY = DISPLAY_HEIGHT; this.state = "left"; }
      return false;
    }
    if (this.state === "left") {
      this.wipe.init(DISPLAY_WIDTH / 2, DISPLAY_HEIGHT / 2, 0, this.endY, 1, 1);
      let start = 0, end = 0, finished = false;
      for (;;) {
        end = this.getRow(this.wipe.currY)[1];
        start = this.wipe.currX;
        if (this.endY <= DISPLAY_HEIGHT / 2) { start = DISPLAY_WIDTH / 2; end = this.wipe.currX; }
        this.setRow(this.wipe.currY, start, end);
        if (finished) break;
        finished = this.wipe.update(true, true);
      }
      this.endY -= 16;
      if (this.endY <= 0) { this.endX = 0; this.state = "topLeft"; }
      else while (this.wipe.currY > this.endY) { this.wipe.currY--; this.setRow(this.wipe.currY, start, end); }
      return false;
    }
    // topLeft
    this.wipe.init(120, 80, this.endX, 0, 1, 1);
    let finished2 = false;
    do {
      let start = DISPLAY_WIDTH / 2, end = this.wipe.currX;
      if (this.wipe.currX >= 120) { start = 0; end = DISPLAY_WIDTH; }
      this.setRow(this.wipe.currY, start, end);
      finished2 = this.wipe.update(true, true);
    } while (!finished2);
    this.endX += 32;
    return this.wipe.currX > DISPLAY_WIDTH / 2;
  }
}

class SliceEffect implements Effect {
  readonly rowBounds: [number, number][] = Array.from({ length: DISPLAY_HEIGHT }, () => [0, DISPLAY_WIDTH]);
  readonly rowOffsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);
  readonly invertWindow = false;
  private effectX = 0;
  private speed = 1 << 8;
  private accel = 1;

  tick(): boolean {
    this.effectX += this.speed >> 8;
    if (this.effectX > DISPLAY_WIDTH) this.effectX = DISPLAY_WIDTH;
    if (this.speed <= 0xFFF) this.speed += this.accel;
    if (this.accel < 128) this.accel <<= 1;

    for (let i = 0; i < DISPLAY_HEIGHT; i++) {
      if (i & 1) {
        // Odd rows: slide right, window is [0, DISPLAY_WIDTH - effectX)
        this.rowOffsets[i] = this.effectX;
        this.rowBounds[i] = [0, DISPLAY_WIDTH - this.effectX];
      } else {
        // Even rows: slide left, window is [effectX, DISPLAY_WIDTH)
        this.rowOffsets[i] = -this.effectX;
        this.rowBounds[i] = [this.effectX, DISPLAY_WIDTH];
      }
    }
    return this.effectX >= DISPLAY_WIDTH;
  }
}

const NUM_WHITE_BARS = 6;
const WHITE_BAR_HEIGHT = 1 + Math.floor(DISPLAY_HEIGHT / NUM_WHITE_BARS); // 27
const sWhiteBarsFade_StartDelays = [0, 9, 15, 6, 12, 3];
const FADE_TARGET = 16 << 8;

interface WhiteBar {
  y: number;
  height: number;
  x: number;
  fade: number;
  delay: number;
  finished: boolean;
}

class WhiteBarsFadeEffect implements Effect {
  private bars: WhiteBar[];
  private state: "bars" | "fadeToBlack" = "bars";
  private blackBlendCounter = 0;
  private blackBldY = 0;

  constructor() {
    this.bars = Array.from({ length: NUM_WHITE_BARS }, (_, i) => {
      const y = i * WHITE_BAR_HEIGHT;
      const height = i === NUM_WHITE_BARS - 1 ? DISPLAY_HEIGHT - y : WHITE_BAR_HEIGHT;
      return {
        y,
        height,
        x: DISPLAY_WIDTH,
        fade: 0,
        delay: sWhiteBarsFade_StartDelays[i]!,
        finished: false,
      };
    });
  }

  tick(): boolean {
    if (this.state === "bars") {
      let allFinished = true;
      for (const bar of this.bars) {
        if (bar.delay > 0) {
          bar.delay--;
          allFinished = false;
        } else {
          if (bar.x === 0 && bar.fade === FADE_TARGET) {
            bar.finished = true;
          } else {
            allFinished = false;
            bar.x = Math.max(0, bar.x - 24);
            bar.fade = Math.min(FADE_TARGET, bar.fade + 192);
          }
        }
      }
      if (allFinished) {
        this.state = "fadeToBlack";
      }
      return false;
    }
    // fadeToBlack (WhiteBarsFade_End)
    this.blackBlendCounter += 480;
    this.blackBldY = this.blackBlendCounter >> 8;
    return this.blackBldY > 16;
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    if (this.state === "bars") {
      for (const bar of this.bars) {
        // Left portion: game snapshot with lighten blend
        if (bar.x > 0) {
          ctx.drawImage(snapshot, 0, bar.y, bar.x, bar.height, 0, bar.y, bar.x, bar.height);
          const alpha = (bar.fade >> 8) / 16;
          if (alpha > 0) {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, bar.y, bar.x, bar.height);
            ctx.restore();
          }
        }
        // Right portion: white bar that has passed
        if (bar.x < DISPLAY_WIDTH) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(bar.x, bar.y, DISPLAY_WIDTH - bar.x, bar.height);
        }
      }
    } else {
      // Fade white screen to black
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
      const alpha = Math.min(1, this.blackBldY / 16);
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

/** B_TRANSITION_GRID_SQUARES: Task_GridSquares / GridSquares_Main. */
class GridSquaresEffect implements Effect {
  private delay = 0;
  private shrinkStage = 0;
  private endDelay = 16;
  private state = 0;

  tick(): boolean {
    if (this.state === 0) {
      if (this.delay <= 0) {
        this.delay = 3;
        this.shrinkStage++;
        if (this.shrinkStage > 13) {
          this.state = 1;
        }
      } else {
        this.delay--;
      }
      return false;
    }
    return --this.endDelay <= 0;
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

/** B_TRANSITION_SHUFFLE: Task_Shuffle / Shuffle_End. */
class ShuffleEffect implements Effect {
  private sinVal = 0;
  private amplitude = 0;
  private fadeFrame = 0;
  private maxFadeFrames = 64;

  tick(): boolean {
    this.sinVal += 4224;
    this.amplitude += 384;
    this.fadeFrame++;
    return this.fadeFrame >= this.maxFadeFrames;
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    const amp = this.amplitude >> 8;
    let sin = this.sinVal;
    for (let y = 0; y < DISPLAY_HEIGHT; y++, sin += 4224) {
      const shift = Math.round(Math.sin((sin & 0xffff) * ((2 * Math.PI) / 65536)) * amp);
      ctx.drawImage(snapshot, 0, y, DISPLAY_WIDTH, 1, shift, y, DISPLAY_WIDTH, 1);
      if (shift > 0) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, y, shift, 1);
      } else if (shift < 0) {
        ctx.fillStyle = "#000";
        ctx.fillRect(DISPLAY_WIDTH + shift, y, -shift, 1);
      }
    }
    const alpha = Math.min(1, this.fadeFrame / (this.maxFadeFrames * 0.75));
    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
      ctx.restore();
    }
  }
}

/** B_TRANSITION_BIG_POKEBALL: Task_BigPokeball / PatternWeave_CircularMask. */
class BigPokeballEffect implements Effect {
  private radius = 0;
  private radiusDelta = 3;
  private closing = false;
  private done = false;

  tick(): boolean {
    if (!this.closing) {
      this.radius += this.radiusDelta;
      if (this.radius >= 140) {
        this.closing = true;
      }
    } else {
      this.radius -= 6;
      if (this.radius <= 0) {
        this.done = true;
        return true;
      }
    }
    return false;
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    if (this.done) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
      return;
    }
    ctx.drawImage(snapshot, 0, 0);
    // Draw outer black mask leaving circular Poké Ball aperture
    const cx = DISPLAY_WIDTH / 2;
    const cy = DISPLAY_HEIGHT / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    ctx.arc(cx, cy, Math.max(0, this.radius), 0, Math.PI * 2, true);
    ctx.fillStyle = "#000";
    ctx.fill();

    // Poké Ball band and center button inside the circle
    if (this.radius > 15) {
      ctx.beginPath();
      ctx.arc(cx, cy, this.radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(cx - this.radius, cy - 4, this.radius * 2, 8);

      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }
    ctx.restore();
  }
}

function safeSin(index: number, amplitude: number): number {
  const idx = index & 0xff;
  if (gSineTable && gSineTable.length >= 256 && gSineTable[64] !== 0) {
    return Sin(idx, amplitude);
  }
  return Math.round(amplitude * Math.sin((idx * 2 * Math.PI) / 256));
}

/** Task_Wave / Wave_Main: Sine wave window wipe from left to right. */
class WaveEffect implements Effect {
  readonly rowBounds: [number, number][] = [];
  private tX = 0;
  private tSinIndex = 0;

  constructor() {
    for (let i = 0; i < DISPLAY_HEIGHT; i++) {
      this.rowBounds.push([0, DISPLAY_WIDTH]);
    }
  }

  tick(): boolean {
    this.tSinIndex = (this.tSinIndex + 16) & 0xff;
    this.tX += 8;
    let sinIndex = this.tSinIndex;
    let finished = true;

    for (let i = 0; i < DISPLAY_HEIGHT; i++) {
      let x = this.tX + safeSin(sinIndex, 40);
      sinIndex = (sinIndex + 4) & 0xff;
      if (x < 0) x = 0;
      if (x > DISPLAY_WIDTH) x = DISPLAY_WIDTH;
      this.rowBounds[i] = [x, DISPLAY_WIDTH];
      if (x < DISPLAY_WIDTH) finished = false;
    }
    return finished;
  }
}

/** Task_Ripple / Ripple_Main: Vertical scanline sinusoidal ripple, then fade to black. */
class RippleEffect implements Effect {
  private sinVal = 0;
  private amplitude = 0;
  private timer = 0;
  private blackLevel = 0;
  private readonly offsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);

  tick(): boolean {
    const amp = this.amplitude >> 8;
    let sVal = this.sinVal;
    const speed = 384;
    this.sinVal = (this.sinVal + 0x400) & 0xffff;
    if (this.amplitude <= 0x1fff) this.amplitude += 384;

    for (let i = 0; i < DISPLAY_HEIGHT; i++) {
      const sinIndex = (sVal >> 8) & 0xff;
      sVal = (sVal + speed) & 0xffff;
      this.offsets[i] = safeSin(sinIndex, amp);
    }

    this.timer++;
    if (this.timer >= 41) {
      this.blackLevel = Math.min(16, this.blackLevel + 1);
      if (this.blackLevel >= 16) return true;
    }
    return false;
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    for (let y = 0; y < DISPLAY_HEIGHT; y++) {
      const ofs = this.offsets[y] || 0;
      const sy = Math.max(0, Math.min(DISPLAY_HEIGHT - 1, y + ofs));
      ctx.drawImage(snapshot, 0, sy, DISPLAY_WIDTH, 1, 0, y, DISPLAY_WIDTH, 1);
    }
    if (this.blackLevel > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${this.blackLevel / 16})`;
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    }
  }
}

/** Task_Swirl / Swirl_End: Horizontal scanline sinusoidal swirl with simultaneous fade to black. */
class SwirlEffect implements Effect {
  private sinIndex = 0;
  private amplitude = 0;
  private blackLevel = 0;
  private timer = 0;
  private readonly offsets: number[] = new Array(DISPLAY_HEIGHT).fill(0);

  tick(): boolean {
    this.sinIndex = (this.sinIndex + 4) & 0xff;
    this.amplitude += 8;
    for (let y = 0; y < DISPLAY_HEIGHT; y++) {
      this.offsets[y] = safeSin((this.sinIndex + y * 2) & 0xff, this.amplitude);
    }
    this.timer++;
    if (this.timer % 4 === 0) {
      this.blackLevel = Math.min(16, this.blackLevel + 1);
    }
    return this.blackLevel >= 16;
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    for (let y = 0; y < DISPLAY_HEIGHT; y++) {
      const ofs = this.offsets[y] || 0;
      ctx.drawImage(snapshot, 0, y, DISPLAY_WIDTH, 1, ofs, y, DISPLAY_WIDTH, 1);
      if (ofs > 0) {
        ctx.drawImage(snapshot, DISPLAY_WIDTH - ofs, y, ofs, 1, 0, y, ofs, 1);
      } else if (ofs < 0) {
        ctx.drawImage(snapshot, 0, y, -ofs, 1, DISPLAY_WIDTH + ofs, y, -ofs, 1);
      }
    }
    if (this.blackLevel > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${this.blackLevel / 16})`;
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    }
  }
}

/** Task_Blur / Blur_Main: GBA mosaic zoom and fade to black. */
class BlurEffect implements Effect {
  private delay = 2;
  private counter = 0;
  private blackLevel = 0;

  tick(): boolean {
    if (this.delay !== 0) {
      this.delay--;
    } else {
      this.delay = 2;
      this.counter++;
      if (this.counter >= 10) {
        this.blackLevel = Math.min(16, this.blackLevel + 2);
      }
      if (this.counter > 14 && this.blackLevel >= 16) {
        return true;
      }
    }
    return false;
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

/** Task_PokeballsTrail / SpriteCB_FldEffPokeballTrail: 5 Pokéballs sliding horizontally wiping trails. */
class PokeballsTrailEffect implements Effect {
  private balls: Array<{ x: number; y: number; side: number; delay: number; speed: number; prevX: number; active: boolean }>;
  private trails: boolean[][];
  private done = false;

  constructor() {
    const delays = [0, 16, 32, 8, 24];
    const speeds = [8, -8];
    const startX = [-16, DISPLAY_WIDTH + 16];
    let side = 0;
    this.balls = [];
    for (let i = 0; i < 5; i++, side ^= 1) {
      this.balls.push({
        x: startX[side]!,
        y: i * 32 + 16,
        side,
        delay: delays[i]!,
        speed: speeds[side]!,
        prevX: -1,
        active: true,
      });
    }
    this.trails = Array.from({ length: 5 }, () => new Array(30).fill(false));
  }

  tick(): boolean {
    let anyActive = false;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i]!;
      if (!b.active) continue;
      if (b.delay > 0) {
        b.delay--;
        anyActive = true;
        continue;
      }
      const posX = b.x >> 3;
      if (posX >= 0 && posX < 30 && posX !== b.prevX) {
        b.prevX = posX;
        this.trails[i]![posX] = true;
      }
      b.x += b.speed;
      if (b.x < -24 || b.x > DISPLAY_WIDTH + 24) {
        b.active = false;
      } else {
        anyActive = true;
      }
    }
    if (!anyActive) {
      this.done = true;
      return true;
    }
    return false;
  }

  render(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement): void {
    if (this.done) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT);
      return;
    }
    ctx.drawImage(snapshot, 0, 0);

    ctx.fillStyle = "#000";
    for (let i = 0; i < 5; i++) {
      const y = i * 32;
      for (let col = 0; col < 30; col++) {
        if (this.trails[i]![col]) {
          ctx.fillRect(col * 8, y, 8, 32);
        }
      }
    }

    for (const b of this.balls) {
      if (!b.active || b.delay > 0) continue;
      if (b.x < -16 || b.x > DISPLAY_WIDTH + 16) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 9, Math.PI, 0);
      ctx.fillStyle = "#e03020";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI);
      ctx.fillStyle = "#f8f8f8";
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.fillRect(-9, -2, 18, 4);
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.restore();
    }
  }
}

/** Task_BattleTransition_Intro: two gray blinks (BlendPalettes toward RGB(11,11,11)) before the main effect. */
class IntroBlink {
  private blend = 0;
  private growing = true;
  private fades = 2;
  done = false;

  /** BlendPalette level for this frame, 0..16 toward gray, or null once finished. */
  tick(): number | null {
    if (this.done) return null;
    if (this.growing) {
      this.blend = Math.min(16, this.blend + 2);
      if (this.blend >= 16) this.growing = false;
    } else {
      this.blend = Math.max(0, this.blend - 2);
      if (this.blend === 0) {
        if (--this.fades === 0) { this.done = true; return null; }
        this.growing = true;
      }
    }
    return this.blend;
  }
}

const GRAY = [88, 88, 88]; // RGB(11, 11, 11)

export class BattleTransitionScene implements Scene {
  private readonly snapshot: HTMLCanvasElement;
  private intro: IntroBlink | null = new IntroBlink();
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
      : null;
    this.hadEffect = this.effect !== null;
  }

  update(): void {
    if (this.done) return;
    if (this.intro) {
      const blend = this.intro.tick();
      if (blend === null) { this.intro = null; this.introBlend = 0; } else this.introBlend = blend;
      return;
    }
    if (this.effect) {
      if (this.effect.tick()) this.effect = null; // main effect finished; fade to black below
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
          const ofs = rowOffsets ? rowOffsets[y]! : 0;
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
