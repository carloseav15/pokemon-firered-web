import type { FieldEffectSpawn } from "../fieldEffects";
import type { ViewerAnimCmd } from "../data/fieldFxTemplates";
import { TILE } from "../constants";

export type EffectPresenterError = Readonly<{ template: string; reason: string }>;

type FrameCmd = readonly ["F", number, number, 0 | 1, 0 | 1];
type JumpCmd = readonly ["J", number];
type EndCmd = readonly ["E"];

function asFrame(cmd: ViewerAnimCmd): FrameCmd | null {
  return cmd[0] === "F" ? (cmd as FrameCmd) : null;
}

function asJump(cmd: ViewerAnimCmd): JumpCmd | null {
  return cmd[0] === "J" ? (cmd as JumpCmd) : null;
}

function asEnd(cmd: ViewerAnimCmd): EndCmd | null {
  return cmd[0] === "E" ? (cmd as EndCmd) : null;
}

/**
 * Presents one spawned template effect. One GBA tick per tick() call; the
 * renderer drives ticks from viewerClock. Frames, sizes, order, durations and
 * flips come from the template only: nothing is copied to a manual table and
 * no orientation is assumed (indices resolve on the real asset layout).
 */
export class EffectPresenter {
  lastError: EffectPresenterError | null = null;

  private readonly node: HTMLElement;
  private readonly anims: readonly ViewerAnimCmd[] = [];
  private cmdIndex = 0;
  private remaining = 0;
  private firstCommand = true;
  private ended = false;
  private disposed = false;

  constructor(
    private readonly spawn: FieldEffectSpawn,
    private readonly content: HTMLElement,
    private readonly minX: number,
    private readonly minY: number,
    private readonly onDone: () => void,
  ) {
    const anims = spawn.template.anims[spawn.animation];
    this.node = document.createElement("div");
    if (!anims) {
      this.fail(`animation ${spawn.animation} missing`);
      return;
    }
    this.anims = anims;
    if (spawn.startCommand < 0 || spawn.startCommand >= anims.length) {
      this.fail(`startCommand ${spawn.startCommand} out of range`);
      return;
    }
    this.cmdIndex = spawn.startCommand;
    this.node.className = "field-fx";
    this.node.style.left = `${spawn.position.xPx - minX * TILE}px`;
    this.node.style.top = `${spawn.position.yPx - minY * TILE}px`;
    this.node.style.zIndex = String(spawn.priority.domZIndex);
    this.node.dataset.effectId = String(spawn.id);
    this.node.dataset.effectGeneration = String(spawn.generation);
    content.appendChild(this.node);
    this.resolveCommand(true);
  }

  /** Advance one GBA tick. */
  tick(): void {
    if (this.ended || this.disposed || this.lastError) return;
    if (this.remaining > 0) this.remaining--;
    if (this.remaining === 0) {
      this.cmdIndex++;
      this.firstCommand = false;
      this.resolveCommand(false);
    }
  }

  /** Retire: finish first when the animation has not ended, then remove. */
  release(): void {
    if (this.disposed) return;
    if (!this.ended && !this.lastError) this.complete();
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.node.remove();
    this.onDone();
  }

  private resolveCommand(initial: boolean): void {
    const seen = new Set<number>();
    for (;;) {
      const cmd = this.anims[this.cmdIndex];
      if (!cmd) {
        this.fail(`command ${this.cmdIndex} missing`);
        return;
      }
      const jump = asJump(cmd);
      if (jump) {
        if (seen.has(this.cmdIndex)) {
          this.fail(`jump cycle at command ${this.cmdIndex}`);
          return;
        }
        seen.add(this.cmdIndex);
        if (jump[1] < 0 || jump[1] >= this.anims.length) {
          this.fail(`jump target ${jump[1]} out of range`);
          return;
        }
        this.cmdIndex = jump[1];
        continue;
      }
      const frame = asFrame(cmd);
      if (frame) {
        const rect = this.spawn.template.frames[frame[1]];
        if (!rect) {
          this.fail(`frame ${frame[1]} missing`);
          return;
        }
        this.node.style.width = `${rect.width}px`;
        this.node.style.height = `${rect.height}px`;
        this.node.style.backgroundImage = `url("${rect.url}")`;
        this.node.style.backgroundRepeat = "no-repeat";
        this.node.style.backgroundPosition = `-${rect.sourceX}px -${rect.sourceY}px`;
        this.node.style.transform = `scaleX(${frame[3] ? -1 : 1}) scaleY(${frame[4] ? -1 : 1})`;
        this.remaining = frame[2] + (initial && this.firstCommand ? this.spawn.initialExtraTicks : 0);
        return;
      }
      if (asEnd(cmd)) {
        this.complete();
        return;
      }
      this.fail(`unsupported command ${JSON.stringify(cmd)}`);
      return;
    }
  }

  private complete(): void {
    this.ended = true;
    // retainUntilLeave keeps the final frame until release(); otherwise remove now.
    if (!this.spawn.retainUntilLeave) this.dispose();
  }

  private fail(reason: string): void {
    this.lastError = { template: this.spawn.template.name, reason };
    console.error(`[fieldfx] ${this.spawn.template.name}: ${reason}`);
    this.dispose();
  }
}
