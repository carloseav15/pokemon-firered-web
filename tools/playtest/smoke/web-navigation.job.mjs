import { readFileSync } from 'node:fs';
// Run with tools/playtest/pw.mjs against Vite or a served production build.
const base=process.env.PW_BASE ?? 'http://localhost:5173/';
const assert=(condition,message)=>{if(!condition)throw Error(message);};
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(base);
 await p.getByRole('navigation',{name:'Main navigation'}).waitFor();
 await p.getByRole('link',{name:'▶ Play',exact:true}).waitFor();
 const nav=()=>p.locator('[data-site-navigation]');
 assert(await nav().getByRole('link').count()===5,'Missing primary links');
 assert(await nav().getByRole('link',{name:'Home',exact:true}).getAttribute('aria-current')==='page','Home not current');
 await p.getByRole('button',{name:'Keyboard help'}).click();
 assert(await p.locator('#controls-dialog').evaluate(e=>e.open),'Help not open');
 await p.keyboard.press('Escape');
 assert(!await p.locator('#controls-dialog').evaluate(e=>e.open),'Help not closed');
 await p.keyboard.press('Control+Home');
 await ctx.shot('home-desktop');
 await nav().getByRole('link',{name:'Tools',exact:true}).click();
 await p.getByRole('heading',{name:'Tools',exact:true}).waitFor();
 const toolLinks=await p.locator('main a').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
 for(const path of toolLinks){const r=await p.request.get(new URL(path,base).href);assert(r.ok(),`Tools link ${path}: ${r.status()}`);assert((await r.text()).includes('<!doctype html>'),`Not HTML: ${path}`);}
 await p.setViewportSize({width:390,height:844});
 await ctx.shot('tools-mobile');
 await nav().getByRole('link',{name:'Home',exact:true}).click();
 assert(await nav().getByRole('link',{name:'Tools',exact:true}).isVisible(),'Tools hidden on mobile');
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Home horizontal overflow');
 const playBounds=await p.getByRole('link',{name:'▶ Play',exact:true}).boundingBox();
 assert(playBounds && playBounds.x>=0 && playBounds.x+playBounds.width<=390,'Play button clipped on mobile');
 await ctx.shot('home-mobile');
 // PREPARED: load an existing game checkpoint to verify read-only summary and routing.
 const save=JSON.parse(readFileSync('tools/playtest/saves/pewter.json','utf8'));
 const raw=JSON.stringify(save);
 await p.evaluate(raw=>localStorage.setItem('firered-save-v1',raw),raw);
 await p.reload();
 await p.getByRole('link',{name:'▶ Continue',exact:true}).waitFor();
 assert(await p.locator('#btn-continue-story').getAttribute('href')==='/play.html?fr=continue','Console continue route');
 const mins=Math.floor(save.playTimeFrames/3600);
 assert((await p.locator('#save-card-slot').innerText()).includes(`${Math.floor(mins/60)}h ${(mins%60).toString().padStart(2,'0')}m`),'Incorrect play time');
 assert(await p.evaluate(()=>localStorage.getItem('firered-save-v1'))===raw,'Summary modified save');
 // PREPARED: same checkpoint in the legacy viewer slot; no gameplay result is claimed.
 const viewer={...save,viewerNavigation:{mapId:'MAP_PEWTER_CITY_POKEMON_CENTER_1F',x:7,y:4,direction:'north',dynamic:null}};
 const viewerRaw=JSON.stringify(viewer);
 await p.evaluate(raw=>{localStorage.setItem('firered-save-v1','{broken');localStorage.setItem('firered-viewer-game-v1',raw);},viewerRaw);
 await p.reload();
 await p.getByRole('link',{name:'▶ Continue',exact:true}).waitFor();
 assert(await p.locator('#btn-continue-story').getAttribute('href')==='/world.html#modo=explore','Viewer fallback continue route');
 assert((await p.locator('#save-card-slot').innerText()).includes('Pewter City'),'English saved location');
 assert(await p.evaluate(()=>localStorage.getItem('firered-viewer-game-v1'))===viewerRaw,'Summary modified viewer save');
 await ctx.shot('home-continue-mobile');
 await p.evaluate(()=>{localStorage.removeItem('firered-save-v1');localStorage.removeItem('firered-viewer-game-v1');});
 await p.setViewportSize({width:1280,height:800});
 for(const [path,current] of [['play.html','play'],['world.html','world'],['dex.html','dex'],['maps.html','tools'],['atlas.html','tools']]){
  await p.goto(new URL(path,base).href);
  await p.locator(`[data-site-navigation="${current}"] a[aria-current="page"]`).waitFor();
  assert(await nav().getByRole('link').count()===5,`Navigation: ${path}`);
  if(path==='play.html'){
   await ctx.shot('play-desktop');
   await p.setViewportSize({width:390,height:844});
   assert(await nav().getByRole('link',{name:'Tools',exact:true}).isVisible(),'Play mobile nav');
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Play overflow');
   const fits=await nav().evaluate(e=>{const n=e.getBoundingClientRect(),h=e.closest('header').getBoundingClientRect();return n.bottom<=h.bottom;});
   assert(fits,'Play navigation covers game screen');
   await ctx.shot('play-mobile');
   await p.setViewportSize({width:1280,height:800});
  }
 }
 return {navigation:'PASS',toolsLinks:toolLinks.length,mobile:'390px',saveSummary:'PREPARED checkpoint; read-only, play time, fallback and destinations PASS',scope:'Entry navigation only; no full-game or interregional-continuity claim',errors:ctx.errors()};
}
