import { cdata } from "@core/hw/assets";
import * as C from "../../games/firered/generated/constants";
import type { ActorVisual, FieldEffectSpawn } from "../fieldEffects";
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
  private age = 0;
  private releaseRequested = false;
  private disposed = false;
  private actorVisual:ActorVisual|null=null;

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
    this.node.dataset.effectName = spawn.template.name;
    this.node.dataset.effectId = String(spawn.id);
    this.node.dataset.effectGeneration = String(spawn.generation);
    content.appendChild(this.node);
    this.resolveCommand(true);
  }

  /** Advance one GBA tick. */
  tick(): void {
    if (this.disposed || this.lastError) return;
    const lifetime = this.spawn.lifetime;
    if (lifetime) {
      this.age++;
      if (this.age >= lifetime.endTick) { this.dispose(); return; }
      if (this.age > lifetime.holdTicks) {
        this.node.style.visibility = (this.age - lifetime.holdTicks) % 2 ? "hidden" : "visible";
      }
    }
    if(this.actorVisual)this.setActor(this.actorVisual);
    if (this.ended) return;
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
    if(this.spawn.followPlayer){this.dispose();return;}
    this.releaseRequested = true;
    if (this.ended || this.lastError) this.dispose();
  }

  setActor(actor:ActorVisual):void {
    this.actorVisual=actor;
    if(this.spawn.followPlayer){
      this.node.style.left=`${actor.xPx-this.minX*TILE-(this.spawn.template.size[0]-TILE)/2}px`;
      // UpdateHotSpringsWaterFieldEffect: y = (height >> 1) + linked.y - 8, below the avatar's feet line.
      const hotSprings=this.spawn.template.name==="HotSpringsWater"?(actor.height>>1)-8:0;
      this.node.style.top=`${actor.groundYPx-this.minY*TILE+12+hotSprings-this.spawn.template.size[1]/2}px`;
    }
    if(this.spawn.template.name!=="TallGrass")return;
    const base=cdata<number[]>("event_object_movement","sElevationToSubpriority");
    const actorCenter=actor.groundYPx+TILE-actor.height/2;
    // Use the native camera's center for ordering near the avatar in the expanded viewer.
    const offset=C.DISPLAY_HEIGHT/2-actorCenter;
    const priority=(bottom:number,elevation:number,extra:number)=>(base[elevation]??0)+((16-(((bottom+offset+8)&255)>>4))<<1)+extra;
    const grassY=this.spawn.position.yPx,grassX=this.spawn.position.xPx+8;
    let sub=priority(grassY+16,this.spawn.elevation??0,this.cmdIndex===0?4:0);
    const playerSub=priority(actor.groundYPx+16,actor.elevation,1);
    const ylo=grassY+16,yhi=ylo-actor.height/2;
    if(grassX-8<actor.xPx+8&&grassX+8>actor.xPx+8
      &&(actorCenter-actor.height/2<yhi||actorCenter-actor.height/2<ylo)&&actorCenter>yhi&&sub<=playerSub)sub=playerSub+2;
    this.node.style.zIndex=sub<=playerSub?"26":"24";
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
        this.node.dataset.effectCommand = String(this.cmdIndex);
        this.remaining = frame[2] + (initial && this.firstCommand ? this.spawn.initialExtraTicks : 0);
        if(this.actorVisual)this.setActor(this.actorVisual);
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
    if ((!this.spawn.retainUntilLeave && !this.spawn.lifetime) || this.releaseRequested) this.dispose();
  }

  private fail(reason: string): void {
    this.lastError = { template: this.spawn.template.name, reason };
    console.error(`[fieldfx] ${this.spawn.template.name}: ${reason}`);
    this.dispose();
  }
}
