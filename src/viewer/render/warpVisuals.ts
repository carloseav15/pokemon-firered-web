import { DoorAnimator } from "@core/field/doors";
import { TaskManager } from "@core/gba/tasks";
import { PaletteFade, RGB_BLACK } from "@core/gba/fade";
import { loadCData } from "@core/hw/assets";
import type { Rom } from "@core/rom";
import type { ViewerClock } from "../clock";
import type { FillSource } from "./fill";
import type { WorldGrid } from "../data/worldGrid";
import type { AvatarDepth } from "./depth";

let doorData: Promise<Rom["doors"]> | null = null;
function loadDoors(): Promise<Rom["doors"]> {
  if (!doorData) doorData = Promise.all([loadCData("field_door"), fetch("/fr/gfx/doors.json").then(async r => {
    if (!r.ok) throw Error(`doors.json: HTTP ${r.status}`);
    return await r.json() as Rom["doors"];
  })]).then(([, data]) => data).catch(error => { doorData = null; throw error; });
  return doorData;
}

/** field_door.c, with its existing animator and an isolated task list on the viewer clock.
 * DrawDoorMetatileAt draws a COVERED replacement: BG3 graphics, BG1/BG2 transparent.
 */
export class ViewerDoorAnimation {
  private readonly canvas = document.createElement("canvas");
  private readonly scheduler = new TaskManager();
  private readonly animator: DoorAnimator;
  private readonly unsubscribe: () => void;
  private constructor(source: FillSource, grid: WorldGrid, private readonly depth: AvatarDepth,
    content: HTMLElement, private readonly x: number, private readonly y: number,
    minX: number, minY: number, private readonly clock: ViewerClock, data: Rom["doors"]) {
    const { info, layout, renderer } = source;
    this.animator = new DoorAnimator({ renderer, map: {
      behaviorAt: (x,y) => grid.behaviorAt(x,y),
      metatileIdAt: (x,y) => layout.blocks[(y-info.y)*layout.width+x-info.x]! & 0x3ff,
    } },this.scheduler,()=>data);
    this.canvas.width=16;this.canvas.height=32;this.canvas.className="field-fx navigation-door";
    this.canvas.style.cssText=`position:absolute;pointer-events:none;z-index:21;left:${(x-minX)*16}px;top:${(y-1-minY)*16}px`;
    content.appendChild(this.canvas);
    this.unsubscribe=clock.subscribe(()=>{this.scheduler.run();this.draw();});
  }
  static async create(source: FillSource, grid: WorldGrid, depth: AvatarDepth, content: HTMLElement,
    x: number, y: number, minX: number, minY: number, clock: ViewerClock): Promise<ViewerDoorAnimation> {
    return new ViewerDoorAnimation(source,grid,depth,content,x,y,minX,minY,clock,await loadDoors());
  }
  get sound(): number { return this.animator.GetDoorSoundEffect(this.x,this.y); }
  async animate(open: boolean): Promise<void> {
    const id=open?this.animator.FieldAnimateDoorOpen(this.x,this.y):this.animator.FieldAnimateDoorClose(this.x,this.y);
    if(id<0)throw Error(`Missing source door animation ${this.x},${this.y}`);
    await new Promise<void>(resolve=>{
      const off=this.clock.subscribe(()=>{if(!this.animator.FieldIsDoorAnimationRunning()){off();resolve();}});
    });
  }
  private draw(): void {
    const ctx=this.canvas.getContext("2d")!;ctx.clearRect(0,0,16,32);
    const cells=new Set<string>();
    for(let y=this.y-1;y<=this.y;y++)if(this.animator.isDoorDrawnAt(this.x,y)){
      ctx.fillStyle="black";ctx.fillRect(0,(y-this.y+1)*16,16,16);
      this.animator.renderTile(ctx,this.x,y,0,(y-this.y+1)*16);cells.add(`${this.x},${y}`);
    }
    this.canvas.dataset.cells=JSON.stringify([...cells]);
    this.depth.setReplacements(cells);
  }
  dispose(): void { this.unsubscribe();this.animator.reset();this.depth.setReplacements(new Set());this.canvas.remove(); }
}

/** Existing palette.c timeline and field_screen_effect.c barn-door window positions.
 * The full viewport is the viewer's display surface; blending retains the shared Canvas overlay adaptation.
 */
export class ViewerWarpVisuals {
  private readonly fade = new PaletteFade();
  private readonly overlay = document.createElement("div");
  private readonly left = document.createElement("div");
  private readonly right = document.createElement("div");
  constructor(main: HTMLElement, private readonly clock: ViewerClock) {
    this.overlay.className="navigation-fade";
    for(const el of [this.overlay,this.left,this.right]){
      el.style.cssText="position:absolute;inset:0;pointer-events:none;z-index:80;display:none;background:black";main.appendChild(el);
    }
    this.left.className="navigation-wipe-left";this.right.className="navigation-wipe-right";
  }
  wait(ticks: number): Promise<void> {
    const started=this.clock.tick;
    return new Promise(resolve=>{const off=this.clock.subscribe(frame=>{if(frame.tick-started>=ticks){off();resolve();}});});
  }
  get isFading(): boolean { return this.fade.active; }
  solid(): void { this.fade.fill(RGB_BLACK);this.paint(); }
  async fadeScreen(mode: number, delay=0): Promise<void> {
    this.fade.fadeScreen(mode,delay);this.paint();
    await new Promise<void>(resolve=>{const off=this.clock.subscribe(()=>{
      this.fade.update();this.paint();if(!this.fade.active){off();resolve();}
    });});
  }
  private paint(): void {
    this.overlay.style.display=this.fade.level?"block":"none";
    this.overlay.style.background=`rgb(${this.fade.color.join(",")})`;
    this.overlay.style.opacity=String(this.fade.level/16);
    this.overlay.dataset.level=String(this.fade.level);
  }
  async outwardWipe(): Promise<void> {
    // Task_BarnDoorWipe initializes windows, creates child on the next tick.
    this.left.style.display=this.right.style.display="block";
    this.left.style.right=this.right.style.left="50%";
    await this.wait(2);
    let offset=0;
    await new Promise<void>(resolve=>{const off=this.clock.subscribe(()=>{
      const lhs=120-offset;
      if(lhs<0){off();this.left.style.display=this.right.style.display="none";resolve();return;}
      this.left.style.right=`${100-lhs/240*100}%`;this.right.style.left=`${(240-lhs)/240*100}%`;
      offset+=lhs<90?4:2;
    });});
    await this.wait(2);
  }
  clear(): void { this.fade.clear();this.paint();this.left.style.display=this.right.style.display="none"; }
  dispose(): void { this.clear();this.overlay.remove();this.left.remove();this.right.remove(); }
}
