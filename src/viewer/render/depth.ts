import type { TileRenderer } from "@core/field/tileRenderer";
import { ExtractMetatileAttribute, METATILE_ATTRIBUTE_LAYER_TYPE, NUM_METATILES_IN_PRIMARY } from "@core/field/fieldmap";
import { cdata } from "@core/hw/assets";
import * as C from "../../games/firered/generated/constants";

type Sector={x:number;y:number;width:number;height:number;blocks:Uint16Array;renderer:TileRenderer};
/** field_camera.c DrawMetatile: BG1 is middle (priority2), BG2 is upper (priority1).
 * Rebuild only the 8x8 metatiles around the avatar; keep the atlas base unchanged.
 */
export class AvatarDepth {
  private readonly sectors=new Map<string,Sector>();
  private readonly middle=document.createElement("canvas");
  private readonly upper=document.createElement("canvas");
  private key="";
  constructor(content:HTMLElement){
    for(const [node,name,z]of [[this.middle,"middle","23"],[this.upper,"upper","27"]] as const){
      node.width=node.height=128;node.className=`field-fx avatar-depth depth-${name}`;node.style.zIndex=z;
      node.style.display="none";content.appendChild(node);
    }
  }
  get bytes():number{return 2*128*128*4;}
  add(id:string,sector:Sector):void{this.sectors.set(id,sector);this.invalidate();}
  remove(id:string):void{this.sectors.delete(id);this.invalidate();}
  invalidate():void{this.key="";}
  hide():void{this.middle.style.display=this.upper.style.display="none";}
  elevationAt(x:number,y:number):number{
    for(const s of this.sectors.values())if(x>=s.x&&y>=s.y&&x<s.x+s.width&&y<s.y+s.height)return s.blocks[(y-s.y)*s.width+x-s.x]!>>>12;
    return 15;
  }
  update(x:number,y:number,minX:number,minY:number,elevation:number):void{
    const priority=cdata<number[]>("event_object_movement","sElevationToPriority")[elevation]!;
    this.middle.style.display=this.upper.style.display="block";
    // Same-priority OBJ precedes BG. Upper BG is behind priority0/1 actors.
    this.upper.style.zIndex=priority<=1?"23":"27";
    const left=Math.floor((x-48)/16)*16,top=Math.floor((y-48)/16)*16;
    this.upper.dataset.depth=JSON.stringify({left,top,priority,elevation,sectors:this.sectors.size});
    const key=`${left},${top}`;if(this.key===key)return;this.key=key;
    const mc=this.middle.getContext("2d")!,uc=this.upper.getContext("2d")!;
    mc.clearRect(0,0,128,128);uc.clearRect(0,0,128,128);
    for(const node of [this.middle,this.upper]){node.style.left=`${left}px`;node.style.top=`${top}px`;}
    for(let gy=top/16+minY;gy<top/16+minY+8;gy++)for(let gx=left/16+minX;gx<left/16+minX+8;gx++){
      for(const s of this.sectors.values()){
        if(gx<s.x||gy<s.y||gx>=s.x+s.width||gy>=s.y+s.height)continue;
        const mt=s.blocks[(gy-s.y)*s.width+gx-s.x]!&0x3ff;
        const attrs=mt<NUM_METATILES_IN_PRIMARY?s.renderer.primary.attributes[mt]:s.renderer.secondary.attributes[mt-NUM_METATILES_IN_PRIMARY];
        const layer=ExtractMetatileAttribute(attrs??0,METATILE_ATTRIBUTE_LAYER_TYPE);
        const {bottom,top:upper}=s.renderer.metatile(mt),dx=(gx-minX)*16-left,dy=(gy-minY)*16-top;
        if(layer===C.METATILE_LAYER_TYPE_COVERED)mc.drawImage(upper,dx,dy);
        else if(layer===C.METATILE_LAYER_TYPE_NORMAL){mc.drawImage(bottom,dx,dy);uc.drawImage(upper,dx,dy);}
        else if(layer===C.METATILE_LAYER_TYPE_SPLIT)uc.drawImage(upper,dx,dy);
        else throw Error(`Unsupported metatile layer ${layer}`);
        break;
      }
    }
    this.upper.dataset.depth=JSON.stringify({left,top,priority,elevation,sectors:this.sectors.size});
  }
  dispose():void{this.sectors.clear();this.middle.remove();this.upper.remove();}
}
