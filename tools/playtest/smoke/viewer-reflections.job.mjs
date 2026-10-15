// PREPARED entry URLs from the movement driver; terrain, frames and input are real.
import movement from './viewer-movement.job.mjs';
export default async function run(ctx){
 const motion=await movement(ctx),p=ctx.page;
 if(await p.locator('.player-reflection').evaluate(el=>el.style.display!=='none'))throw Error('Unexpected reflection at the non-reflective Pallet canal');
 const base=new URL('viewer.html',process.env.PW_BASE).href;
 await p.goto('about:blank');await p.goto(base+'#modo=explore&mapa=MAP_VIRIDIAN_CITY');
 await p.waitForFunction(()=>window.motionProbe?.grid&&window.motionProbe.events.some(e=>e.phase==='spawn'));
 const shore=await p.evaluate(async()=>{
  const g=window.motionProbe.grid,{MetatileBehavior_IsReflective}=await import('/src/games/firered/generated/metatileBehavior.ts');
  for(let y=g.minY;y<g.minY+g.height;y++)for(let x=g.minX;x<g.minX+g.width;x++)
   if(g.isLoaded(x,y)&&g.isWalkable(x,y,'walk')&&!g.isWaterTile(x,y)&&MetatileBehavior_IsReflective(g.behaviorAt(x,y+1)))return{x,y};
  throw Error('No real reflective shoreline in resident maps');
 });
 await p.goto('about:blank');await p.goto(base+`#modo=explore&px=${shore.x}&py=${shore.y}`);
 await p.waitForFunction(()=>window.motionProbe?.events.some(e=>e.phase==='spawn')&&!document.body.hasAttribute('aria-busy'));
 if(await p.locator('#player-char').inputValue()!==motion.character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(motion.character);await p.keyboard.press('Escape');}
 await p.waitForFunction(()=>document.querySelector('.player-reflection')?.style.display==='block');
 const directions=[];
 for(const [direction,key]of [['south','ArrowDown'],['north','ArrowUp'],['west','ArrowLeft'],['east','ArrowRight']]){
  const current=await p.locator('#player-sprite').evaluate(el=>JSON.parse(el.dataset.animation).direction);
  if(current!==direction){await p.keyboard.press(key);await p.waitForFunction(()=>!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);}
  const result=await p.evaluate(async direction=>{
   const el=document.querySelector('.player-reflection'),player=document.querySelector('#player-sprite'),g=window.motionProbe.grid;
   const source=JSON.parse(player.dataset.animation),copy=JSON.parse(el.dataset.reflection);
   if(!copy.affine||copy.affine.d>=0||(copy.hFlip?copy.affine.a>=0:copy.affine.a<=0))throw Error('Reflection affine orientation differs from C');
   if(copy.file!==source.reflection[0]||copy.index!==source.reflection[1]||copy.hFlip!==source.hFlip)throw Error('Reflection diverged from source frame');
   const ctx=el.getContext('2d'),data=ctx.getImageData(0,0,64,64).data,left=parseFloat(el.style.left),top=parseFloat(el.style.top);
   const {MetatileBehavior_IsReflective}=await import('/src/games/firered/generated/metatileBehavior.ts');
   let pixels=0;
   for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(data[(y*64+x)*4+3]){
    pixels++;const gx=Math.floor((left+x+.5)/16)+g.minX,gy=Math.floor((top+y+.5)/16)+g.minY;
    if(!MetatileBehavior_IsReflective(g.behaviorAt(gx,gy)))throw Error('Reflection leaked onto land');
   }
   if(!pixels)throw Error('Empty reflection canvas');
   const variants=new Set(),matrices=new Set();
   for(let n=0;n<100;n++){await new Promise(requestAnimationFrame);variants.add(el.toDataURL());matrices.add(JSON.stringify(JSON.parse(el.dataset.reflection).affine));}
   if(matrices.size<2)throw Error('Water affine matrix did not animate '+JSON.stringify({copy,last:el.dataset.reflection,matrices:[...matrices]}));
   return{direction,pixels,variants:variants.size,matrices:matrices.size,palette:copy.file};
  },direction);
  await ctx.shot(`reflection-${direction}`);directions.push(result);
 }
 await p.keyboard.press('b');
 await p.waitForFunction(()=>JSON.parse(document.querySelector('.player-reflection').dataset.reflection).file.includes('bike'));
 const bike=await p.locator('.player-reflection').evaluate(el=>JSON.parse(el.dataset.reflection).file);
 await ctx.shot('reflection-bike');await p.keyboard.press('b');
 await p.keyboard.press('ArrowDown');await p.waitForFunction(()=>!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);
 const before=await p.evaluate(()=>window.motionProbe.events.length);
 await p.keyboard.press('ArrowDown');
 await p.waitForFunction(n=>window.motionProbe.events.slice(n).some(e=>e.phase==='finish'),before);
 const surf=await p.evaluate(async()=>{
  const el=document.querySelector('.player-reflection'),offsets=new Set();
  if(el.style.display!=='block')throw Error('Surf reflection missing on reflective pond');
  for(let i=0;i<115;i++){await new Promise(requestAnimationFrame);const c=JSON.parse(el.dataset.reflection);offsets.add(c.y2);
   const a=JSON.parse(document.querySelector('#player-sprite').dataset.animation);
   if(c.file!==a.reflection[0]||c.index!==a.reflection[1])throw Error('Surf reflection frame mismatch');
  }
  if(!offsets.has(0)||!offsets.has(1))throw Error('Surf reflection did not follow rider bob');
  return{file:JSON.parse(el.dataset.reflection).file,offsets:[...offsets]};
 });
 await ctx.shot('reflection-surf');
 await p.getByRole('button',{name:'Menú · Esc'}).click();
 const paused=await p.locator('.player-reflection').evaluate(el=>el.toDataURL());await p.waitForTimeout(150);
 if(await p.locator('.player-reflection').evaluate(el=>el.toDataURL())!==paused)throw Error('Reflection changed during pause');
 await p.keyboard.press('Escape');
 return{character:motion.character,shore,directions,bike,surf,pause:true,nonReflectivePallet:true,note:'Real keyboard/terrain and exported palette; reflective tile mask adapts flattened BG priority, not full elevation parity.'};
}
