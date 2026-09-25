// Port of battle_transition.c: the pre-battle screen effect (BattleTransition_StartOnField).
//
// Scope for this pass: the shared intro (double gray blink, Task_Intro /
// TransitionIntro_FadeToGray / TransitionIntro_FadeFromGray) plus two of the
// eighteen named effects: B_TRANSITION_ANGLED_WIPES (the trainer/normal
// pick when the enemy is not weaker) and B_TRANSITION_CLOCKWISE_WIPE (the
// wild/cave pick when the enemy is weaker, used on Mt. Moon). Every other
// B_TRANSITION_* id still gets the intro blink, then falls back to the
// plain black fade the port already used for every battle start.
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
  readonly rowBounds: [number, number][];
  /** True when the window itself is the black area instead of the visible area (ClockwiseWipe's polarity). */
  readonly invertWindow: boolean;
  /** Advance one VBlank frame. Returns true once the wipe is done and FadeScreenBlack should start. */
  tick(): boolean;
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
      const { rowBounds, invertWindow } = this.effect;
      for (let y = 0; y < DISPLAY_HEIGHT; y++) {
        const [rawLeft, rawRight] = rowBounds[y]!;
        const [left, right] = WIN_RANGE(rawLeft, rawRight);
        if (invertWindow) {
          if (left > 0) ctx.drawImage(this.snapshot, 0, y, left, 1, 0, y, left, 1);
          if (right < DISPLAY_WIDTH) ctx.drawImage(this.snapshot, right, y, DISPLAY_WIDTH - right, 1, right, y, DISPLAY_WIDTH - right, 1);
        } else if (right > left) {
          ctx.drawImage(this.snapshot, left, y, right - left, 1, left, y, right - left, 1);
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
