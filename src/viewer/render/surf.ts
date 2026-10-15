import { Sprite } from "@core/gba/sprite";
import type { AnimCmd } from "@core/rom";
import { loadEffectTemplate, type EffectTemplate } from "../data/fieldFxTemplates";
import type { Direction } from "./sprites";

/** FldEff_SurfBlob / SynchroniseSurfAnim / CreateBobbingEffect.
 * The C bob direction starts at zero: only animCmdIndex adds one pixel to the rider.
 * Navigation owns shore jumps; the support stays at the non-jumping ground position.
 */
export class SurfSupport {
  private readonly sprite = new Sprite();
  private readonly node = document.createElement("div");
  private lastTick = 0;
  private direction: Direction | null = null;
  constructor(private readonly template: EffectTemplate, content: HTMLElement) {
    this.sprite.anims = template.anims as AnimCmd[][];
    this.node.className = "field-fx surf-support";
    this.node.style.zIndex = "24";
    this.node.style.display = "none";
    content.appendChild(this.node);
  }
  static async create(content: HTMLElement): Promise<SurfSupport> {
    return new SurfSupport(await loadEffectTemplate("SurfBlob"), content);
  }
  setPriority(priority:number):void {this.node.style.zIndex=priority<=1?"29":"24";}
  hide(): void { this.node.style.display = "none"; this.direction = null; }
  update(visible: boolean, direction: Direction, x: number, y: number, tick: number): number {
    if (!visible) { this.hide(); return 0; }
    if (this.direction !== direction) {
      this.direction = direction;
      this.sprite.startAnim(({south:0,north:1,west:2,east:3})[direction]);
      this.sprite.animate();
      this.lastTick = tick;
    }
    while (this.lastTick < tick) { this.sprite.animate(); this.lastTick++; }
    const frame = this.template.frames[this.sprite.imageValue]!;
    Object.assign(this.node.style, {
      display:"block", left:`${x + 8 - frame.width / 2}px`, top:`${y - 8}px`,
      width:`${frame.width}px`, height:`${frame.height}px`,
      backgroundImage:`url("${frame.url}")`, backgroundRepeat:"no-repeat",
      backgroundPosition:`-${frame.sourceX}px -${frame.sourceY}px`,
      transform:`scale(${this.sprite.hFlip ? -1 : 1}, ${this.sprite.vFlip ? -1 : 1})`,
    });
    this.node.dataset.animation = JSON.stringify({direction, frame:this.sprite.imageValue, command:this.sprite.animCmdIndex});
    return this.sprite.animCmdIndex !== 0 ? 1 : 0;
  }
  dispose(): void { this.node.remove(); }
}
