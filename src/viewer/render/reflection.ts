import { loadTrig } from "@core/hw/trig";
import { cdata, symName } from "@core/hw/assets";
import { loadImage } from "@core/gba/sprite";
import { Sprite, InitSpriteAffineAnim, StartSpriteAffineAnim, AnimateSprite, FreeOamMatrix,
  AFFINEANIMCMD_FRAME, AFFINEANIMCMD_JUMP, ST_OAM_AFFINE_NORMAL, gOamMatrices, type AffineAnimCmd } from "@core/hw/sprite";
import * as MB from "../../games/firered/generated/metatileBehavior";
import type { WorldGrid } from "../data/worldGrid";
import type { AvatarData } from "./avatar";

type Point = Readonly<{x:number;y:number}>;
type Frame = {width:number;height:number;hFlip:boolean;reflection: [string,number] | undefined};
/** ObjectEventCheckForReflectiveSurface: two rows, current before previous; width=1 in FR. */
export function reflectionType(grid: Pick<WorldGrid,"behaviorAt">, current:Point, previous:Point): number {
  for(let dy=1;dy<=2;dy++) for(const p of [current,previous]) {
    const b=grid.behaviorAt(p.x,p.y+dy);
    if(MB.MetatileBehavior_IsIce(b)) return 1;
    if(MB.MetatileBehavior_IsReflective(b)) return 2;
  }
  return 0;
}

/** Source palette/frame copy and affine interpreter; reflective-tile clipping adapts BG priority
 * to the viewer's flattened map canvas. Full BG/elevation compositing remains separate work.
 */
export class PlayerReflection {
  private readonly canvas=document.createElement("canvas");
  private readonly ctx=this.canvas.getContext("2d")!;
  private readonly distortions:Sprite[]=[];
  private lastTick:number;
  private constructor(private readonly images:Map<string,HTMLImageElement>,content:HTMLElement,tick:number) {
    this.lastTick=tick;
    this.canvas.width=this.canvas.height=64;
    this.canvas.className="field-fx player-reflection";
    this.canvas.style.zIndex="22";
    this.hide(); content.appendChild(this.canvas);
    const refs=cdata<unknown[]>("event_object_movement","sAffineAnims_ReflectionDistortion");
    for(let i=0;i<2;i++) {
      const sprite=new Sprite(i);sprite.oam.affineMode=ST_OAM_AFFINE_NORMAL;
      const name=symName(refs[i]);if(!name)throw Error("Missing reflection affine symbol");
      const raw=cdata<Array<{frame?:{xScale:number;yScale:number;rotation:number;duration:number};jump?:{target:number}}>>("event_object_movement",name);
      const commands:AffineAnimCmd[]=raw.map(cmd=>{
        if(cmd.frame){const f=cmd.frame;return AFFINEANIMCMD_FRAME(f.xScale,f.yScale,f.rotation,f.duration);}
        if(cmd.jump)return AFFINEANIMCMD_JUMP(cmd.jump.target);
        throw Error(`Unsupported reflection affine command ${name}`);
      });
      sprite.affineAnims=[commands];InitSpriteAffineAnim(sprite);StartSpriteAffineAnim(sprite,0);
      AnimateSprite(sprite);this.distortions.push(sprite);
    }
  }
  static async create(data:AvatarData,content:HTMLElement,tick:number):Promise<PlayerReflection> {
    await loadTrig();
    const files=new Set(Object.values(data.gfx).filter(g=>/OBJ_EVENT_GFX_(RED|GREEN)_(NORMAL|BIKE|SURF)$/.test(g.name)).flatMap(g=>g.reflectionFrames.map(f=>f[0])));
    const pairs=await Promise.all([...files].map(async file=>[file,await loadImage(`/fr/${file}`)] as const));
    return new PlayerReflection(new Map(pairs),content,tick);
  }
  hide():void {this.canvas.style.display="none";}
  tick(tick:number):void {
    while(this.lastTick<tick){for(const s of this.distortions)AnimateSprite(s);this.lastTick++;}
  }
  update(frame:Frame,grid:WorldGrid,current:Point,previous:Point,x:number,groundY:number,y2:number,minX:number,minY:number,tick:number):void {
    this.tick(tick);
    const type=reflectionType(grid,current,previous);
    if(!type||!frame.reflection){this.hide();return;}
    const [file,index]=frame.reflection,image=this.images.get(file);
    if(!image)throw Error(`Reflection image was not preloaded: ${file}`);
    const left=x+8-32,top=groundY+14-y2+frame.height/2-32;
    Object.assign(this.canvas.style,{display:"block",left:`${left}px`,top:`${top}px`});
    const ctx=this.ctx;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,64,64);ctx.save();ctx.beginPath();
    // The map is flattened in this viewer: reproduce the exposed water/ice area as a mask.
    for(let gy=Math.floor(top/16)+minY;gy<=Math.floor((top+63)/16)+minY;gy++)
      for(let gx=Math.floor(left/16)+minX;gx<=Math.floor((left+63)/16)+minX;gx++)
        if(MB.MetatileBehavior_IsReflective(grid.behaviorAt(gx,gy)))ctx.rect((gx-minX)*16-left,(gy-minY)*16-top,16,16);
    ctx.clip();ctx.translate(32,32);ctx.imageSmoothingEnabled=false;
    if(type===1)ctx.scale(frame.hFlip?-1:1,-1);
    else {
      const m=gOamMatrices[this.distortions[frame.hFlip?1:0]!.oam.matrixNum]!;
      const det=m.a*m.d-m.b*m.c;
      if(!det)throw Error("Singular reflection matrix: check source trig initialization");
      ctx.transform(m.d*256/det,-m.c*256/det,-m.b*256/det,m.a*256/det,0,0);
    }
    ctx.drawImage(image,index*frame.width,0,frame.width,frame.height,-frame.width/2,-frame.height/2,frame.width,frame.height);ctx.restore();
    const affine = type===2 ? {...gOamMatrices[this.distortions[frame.hFlip?1:0]!.oam.matrixNum]!} : null;
    this.canvas.dataset.reflection=JSON.stringify({type,file,index,hFlip:frame.hFlip,y2,current,previous,affine});
  }
  dispose():void {for(const s of this.distortions)FreeOamMatrix(s.oam.matrixNum);this.canvas.remove();}
}
