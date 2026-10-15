// PREPARED interior start in front of a 1x2 door; real keyboard, source door tiles/cadence/fades observed.
// Defaults: Celadon Department Store 1F elevator door (warp 6 at 6,1) -> elevator.
import {readFileSync} from 'node:fs';
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';
 const sourceMap=process.env.PW_DOOR_MAP??'MAP_CELADON_CITY_DEPARTMENT_STORE_1F',warpId=Number(process.env.PW_DOOR_WARP??6);
 const header=JSON.parse(readFileSync(`public/fr/maps/${sourceMap}.json`,'utf8')),warp=header.warps[warpId];
 await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  if(!/^https?:$/.test(location.protocol))return;
  window.largeDoor={animations:[],frames:[],fades:[],sizes:new Set(),pixelChecks:0,pixelErrors:[],maps:[]};
  void Promise.all([import('/src/viewer/render/warpVisuals.ts'),import('/src/viewer/clock.ts')]).then(([{ViewerDoorAnimation},clock])=>{
   const draw=ViewerDoorAnimation.prototype.draw;
   ViewerDoorAnimation.prototype.draw=function(){
    draw.call(this);
    const probe=window.largeDoor,c=this.canvas.getContext('2d'),renderer=this.animator.ow.renderer;
    for(const [key,entry]of this.animator.drawn){
     probe.sizes.add(entry.door.size);
     const [,y]=key.split(',').map(Number),pixels=c.getImageData(0,(y-this.y+1)*16,16,16).data;
     for(let py=0;py<16;py++)for(let px=0;px<16;px++){
      const quadrant=(py>=8?2:0)+(px>=8?1:0),tile=entry.tileOffset+quadrant;
      const byte=entry.frameTiles[tile*32+(py%8)*4+((px%8)>>1)],index=px&1?byte>>4:byte&15;
      const palette=entry.door.palettes[(entry.door.size===1&&entry.tileOffset===4?4:0)+quadrant];
      const expected=index?renderer.palettes[palette][index]:[0,0,0],i=(py*16+px)*4;
      if(expected.some((v,k)=>pixels[i+k]!==v)||pixels[i+3]!==255)probe.pixelErrors.push({px,py,key});
      probe.pixelChecks++;
     }
    }
   };
   const animate=ViewerDoorAnimation.prototype.animate;
   ViewerDoorAnimation.prototype.animate=async function(open){
    const event={open,start:clock.viewerClock.tick};window.largeDoor.animations.push(event);
    await animate.call(this,open);event.end=clock.viewerClock.tick;
   };
  });
  new MutationObserver(()=>{const m=document.querySelector('#content')?.dataset.navigationMap;const a=window.largeDoor.maps;if(m&&a.at(-1)!==m)a.push(m);}).observe(document,{subtree:true,attributes:true,childList:true});
  const sample=()=>{const probe=window.largeDoor,door=document.querySelector('.navigation-door'),fade=document.querySelector('.navigation-fade');
   if(door){const c=door.getContext('2d');probe.frames.push({cells:JSON.parse(door.dataset.cells??'[]').length,pixels:[...c.getImageData(0,0,16,32).data].filter((v,i)=>i%4===3&&v).length});}
   if(fade&&fade.style.display!=='none')probe.fades.push(Number(fade.dataset.level));
   requestAnimationFrame(sample);};requestAnimationFrame(sample);
 });
 await p.goto(new URL(`viewer.html#modo=explore&mapa=${sourceMap}&px=${warp.x}&py=${warp.y+1}`,process.env.PW_BASE).href);
 await p.waitForFunction(()=>!document.body.hasAttribute('aria-busy')&&document.querySelector('#player-sprite'));await p.waitForTimeout(1500);
 if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await p.waitForTimeout(800);}
 await p.keyboard.press('ArrowUp');await p.waitForTimeout(300);
 await p.keyboard.down('ArrowUp');await p.waitForTimeout(25);await p.keyboard.up('ArrowUp');
 await p.waitForFunction(m=>new URLSearchParams(location.hash.slice(1)).get('mapa')===m,warp.destMap,{timeout:20000});
 await p.waitForFunction(()=>document.body.getAttribute('aria-busy')!=='true'&&!document.querySelector('.navigation-door'),{timeout:20000});await p.waitForTimeout(600);
 const review=await p.evaluate(()=>({...window.largeDoor,sizes:[...window.largeDoor.sizes]}));
 if(!review.animations.length||review.animations.some(a=>a.end===undefined))throw Error('Missing door observations '+JSON.stringify(review.animations));
 if(!review.sizes.includes(1))throw Error('Door was not the 1x2 graphic '+JSON.stringify(review.sizes));
 if(review.pixelErrors.length||!review.pixelChecks)throw Error('Door packed tile pixels differ '+JSON.stringify(review.pixelErrors.slice(0,5)));
 const frames=await p.evaluate(async()=>{const {cdata}=await import('/src/core/hw/assets.ts');
  return Object.fromEntries(['OpenSmall','CloseSmall','OpenLarge','CloseLarge'].map(n=>[n,cdata('field_door','sDoorAnimFrames_'+n).filter(f=>typeof f.duration==='number').reduce((s,f)=>s+f.duration+1,0)]));});
 for(const a of review.animations)if(a.end-a.start!==(a.open?frames.OpenLarge:frames.CloseLarge))throw Error('Large door C cadence differs '+JSON.stringify({a,frames}));
 if(!review.frames.some(f=>f.cells&&f.pixels))throw Error('Door graphics absent');
 if(!review.fades.includes(16)||!review.fades.some(n=>n>0&&n<16))throw Error('Fade was instantaneous');
 await ctx.shot(`door-large-${character}`);
 return{character,source:sourceMap,dest:warp.destMap,animations:review.animations,pixelChecks:review.pixelChecks,sizes:review.sizes,frames,
  note:'PREPARED interior start; real keyboard, 1x2 door graphics against sDoorGraphics tiles and sDoorAnimFrames_*Large, fades. No global ROM parity claim.'};
}
