// Observe native door timelines during the existing real keyboard/warp regression.
import {readFileSync} from 'node:fs';
import interiorNavigation from './viewer-interior-navigation.job.mjs';
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';
 await p.addInitScript(()=>{
  if(!/^https?:$/.test(location.protocol))return;
  window.doorReview={animations:[],frames:[],fades:[],wipes:[],pixelChecks:0,pixelErrors:[]};
  void Promise.all([import('/src/viewer/render/warpVisuals.ts'),import('/src/viewer/clock.ts')]).then(([{ViewerDoorAnimation},clock])=>{
   const draw=ViewerDoorAnimation.prototype.draw;
   ViewerDoorAnimation.prototype.draw=function(){
    draw.call(this);
    const probe=window.doorReview,c=this.canvas.getContext('2d'),renderer=this.animator.ow.renderer;
    for(const [key,entry]of this.animator.drawn){
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
    const event={open,start:clock.viewerClock.tick,map:document.querySelector('#content')?.dataset.navigationMap};
    window.doorReview.animations.push(event);await animate.call(this,open);event.end=clock.viewerClock.tick;
   };
  });
  const sample=()=>{
   const probe=window.doorReview,door=document.querySelector('.navigation-door'),fade=document.querySelector('.navigation-fade');
   if(door){const c=door.getContext('2d');probe.frames.push({cells:JSON.parse(door.dataset.cells??'[]'),
     pixels:[...c.getImageData(0,0,16,32).data].filter((v,i)=>i%4===3&&v).length,
     actorHidden:document.querySelector('#player-sprite')?.style.visibility==='hidden'});}
   if(fade&&fade.style.display!=='none')probe.fades.push(Number(fade.dataset.level));
   const left=document.querySelector('.navigation-wipe-left');if(left&&left.style.display!=='none')probe.wipes.push(left.style.right);
   requestAnimationFrame(sample);
  };requestAnimationFrame(sample);
 });
 let entry;
 const capture=(async()=>{
  await p.waitForFunction(()=>{const c=document.querySelector('.navigation-door');return c&&JSON.parse(c.dataset.cells??'[]').length;});
  await ctx.shot('door-opening-'+character);
 })();
 let doorFixture;
 if(process.env.PW_DOOR_MAP){
  const sourceMap=process.env.PW_DOOR_MAP,index=JSON.parse(readFileSync('public/viewer/kanto.json','utf8'));
  const header=JSON.parse(readFileSync(`public/fr/maps/${sourceMap}.json`,'utf8')),warp=header.warps[Number(process.env.PW_DOOR_WARP??0)];
  const origin=index.maps[sourceMap]??{x:0,y:0}; // contexts outside the continental atlas (Saffron City) use local coordinates
  doorFixture={sourceMap,interiorMap:warp.destMap,x:origin.x+warp.x,y:origin.y+warp.y+1};
 }
 const navigation=await interiorNavigation({...ctx,doorFixture,onInteriorEntry:async()=>{entry=await p.evaluate(()=>window.doorReview);}});
 await capture;
 const exit=await p.evaluate(()=>window.doorReview);
 const summarize=async(review,label)=>{
  if(!review?.animations.length)throw Error('Missing door observations '+label);
  if(review.pixelErrors.length||!review.pixelChecks)throw Error('Door packed tile pixels differ '+JSON.stringify(review.pixelErrors.slice(0,5)));
  const frames=await p.evaluate(async()=>{const {cdata}=await import('/src/core/hw/assets.ts');
   return Object.fromEntries(['OpenSmall','CloseSmall','OpenLarge','CloseLarge'].map(name=>[name,cdata('field_door','sDoorAnimFrames_'+name).filter(f=>typeof f.duration==='number').reduce((sum,f)=>sum+f.duration+1,0)]));});
  for(const a of review.animations)if(a.end-a.start!==(a.open?frames.OpenSmall:frames.CloseSmall))throw Error('Door C cadence differs '+JSON.stringify({a,frames}));
  if(!review.frames.some(f=>f.cells.length&&f.pixels)||!review.frames.some(f=>f.actorHidden))throw Error('Door graphics/hidden actor absent '+label);
  if(!review.fades.includes(16)||!review.fades.some(n=>n>0&&n<16))throw Error('Fade was instantaneous '+label);
  return{animations:review.animations,pixelChecks:review.pixelChecks,renderedFrames:review.frames.filter(f=>f.cells.length&&f.pixels).length,fadeLevels:[...new Set(review.fades)],wipeFrames:review.wipes.length};
 };
 const summaries={entry:await summarize(entry,'entry'),exit:await summarize(exit,'exit')};
 if(!exit.wipes.length||await p.locator('.navigation-door').count())throw Error('Arrival wipe absent or door retained');
 await ctx.shot('doors-complete');
 return{character,navigation,summaries,note:'PREPARED start URL; real keyboard, door graphics and source frame durations, fades, outward wipe, enter/reload/walk/exit. Shared palette overlay adapts blending; other door styles/maps remain to review.'};
}
