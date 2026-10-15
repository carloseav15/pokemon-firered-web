// PREPARED entry URLs choose real terrain; no state/terrain is fabricated.
// PREPARED clock suspension only freezes an already-observed frame for screenshots.
import { mkdirSync } from 'node:fs';
export default async function run(ctx){
 const p=ctx.page;await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  if(!/^https?:$/.test(location.protocol))return;
  window.avatarProbe={events:[],samples:[]};
  void Promise.all([import('/src/viewer/fieldEffects.ts'),import('/src/viewer/clock.ts')]).then(([fx,clock])=>{
   window.avatarProbe.clock=clock.viewerClock;
   document.addEventListener('keydown',event=>{if(event.key.startsWith('Arrow'))window.avatarProbe.inputTick=clock.viewerClock.tick;},true);
   const on=fx.ViewerFieldEffects.prototype.onGroundStep;
   fx.ViewerFieldEffects.prototype.onGroundStep=function(phase,actor){window.avatarProbe.grid=this.grid;window.avatarProbe.events.push({...actor,phase,tick:clock.viewerClock.tick});return on.call(this,phase,actor);};
  });
  new MutationObserver(()=>{
   const el=document.querySelector('#player-sprite');if(!el?.dataset.animation)return;
   const frame=JSON.parse(el.dataset.animation);
   window.avatarProbe.samples.push({...frame,tick:window.avatarProbe.clock?.tick,sheet:el.style.backgroundImage,position:el.style.backgroundPosition,transform:el.style.transform,matrixX:new DOMMatrix(getComputedStyle(el).transform).a,matrixY:new DOMMatrix(getComputedStyle(el).transform).d});
  }).observe(document,{attributes:true,attributeFilter:['data-animation'],subtree:true});
 });
 const base=new URL('viewer.html',process.env.PW_BASE).href;
 await p.goto(base+'#modo=explore&mapa=MAP_PALLET_TOWN');
 await p.waitForFunction(()=>window.avatarProbe?.grid&&document.querySelector('#player-sprite')?.dataset.animation&&!document.body.hasAttribute('aria-busy'));
 const fixtures=await p.evaluate(async()=>{
  const g=window.avatarProbe.grid,idx=await(await fetch('/viewer/kanto.json')).json();
  const ds=[['south','ArrowDown',0,1],['north','ArrowUp',0,-1],['west','ArrowLeft',-1,0],['east','ArrowRight',1,0]],out={walk:{},surf:{},bump:null,jump:null};
  const doors=new Set(idx.elements.filter(e=>e.layer==='puerta').map(e=>`${idx.maps[e.map].x+e.x},${idx.maps[e.map].y+e.y}`));
  for(const [id,m]of Object.entries(idx.maps))for(let y=m.y;y<m.y+m.height;y++)for(let x=m.x;x<m.x+m.width;x++)for(const[d,key,dx,dy]of ds){
   if(!out.jump&&g.isWalkable(x,y,'walk')&&g.ledgeDirection(x+dx,y+dy)===({south:1,north:2,west:3,east:4})[d]&&g.isWalkable(x+dx*2,y+dy*2,'walk'))out.jump={x,y,key,direction:d,nx:x+dx*2,ny:y+dy*2};
   if(!out.bump&&id==='MAP_PALLET_TOWN'&&g.isWalkable(x,y,'walk')&&!g.ledgeDirection(x,y)&&g.isLoaded(x+dx,y+dy)&&!g.isWalkable(x+dx,y+dy,'walk')&&!g.isWaterTile(x+dx,y+dy)&&!g.ledgeDirection(x+dx,y+dy))out.bump={x,y,key,direction:d};
   if(!out.walk[d]&&id==='MAP_PALLET_TOWN'&&[0,1,2].every(n=>g.isWalkable(x+n*dx,y+n*dy,'walk')&&!g.ledgeDirection(x+n*dx,y+n*dy)&&!doors.has(`${x+n*dx},${y+n*dy}`)))out.walk[d]={x,y,key,dx,dy};
   if(!out.surf[d]&&[0,1,2].every(n=>g.isWaterTile(x+n*dx,y+n*dy)&&g.isWalkable(x+n*dx,y+n*dy,'surf')))out.surf[d]={x,y,key,dx,dy};
  }
  if(Object.keys(out.walk).length!==4||Object.keys(out.surf).length!==4)throw Error('Missing real directional terrain');return out;
 });
 const results=[];mkdirSync('output/playwright/avatar-review',{recursive:true});
 for(const character of ['red','leaf'])for(const mode of ['walk','run','bike','surf'])for(const direction of ['south','north','west','east']){
  const fixture=fixtures[mode==='surf'?'surf':'walk'][direction];
  await p.goto('about:blank');await p.goto(base+`#modo=explore&px=${fixture.x}&py=${fixture.y}`);
  await p.waitForFunction(()=>window.avatarProbe?.events.some(e=>e.phase==='spawn')&&!document.body.hasAttribute('aria-busy'));
  if(await p.locator('#player-char').inputValue()!==character){
   await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');
  }
  const read=()=>p.locator('#player-sprite').evaluate(el=>JSON.parse(el.dataset.animation));
  const initial=await read();
  if(initial.direction!==direction){
   const before=await p.locator('#player-sprite').evaluate(el=>[el.style.left,el.style.top]);
   await p.keyboard.press(fixture.key);await p.waitForFunction(()=>!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);
   const after=await p.locator('#player-sprite').evaluate(el=>[el.style.left,el.style.top]);
   if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Turn displaced avatar');
   if((await read()).direction!==direction)throw Error('Turn ignored');
  }
  if(mode==='bike')await p.keyboard.press('b');
  if(mode==='run')await p.keyboard.down('Shift');
  const expectedTicks=mode==='walk'?16:mode==='bike'?6:8;
  for(let step=1;step<=2;step++){
   const before=await p.evaluate(()=>{window.avatarProbe.samples=[];return window.avatarProbe.events.length;});
   await p.keyboard.down(fixture.key);await p.waitForTimeout(15);await p.keyboard.up(fixture.key);
   if(step===1){
    await p.waitForFunction(()=>JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);
    await p.evaluate(async()=>{const{viewerClock}=await import('/src/viewer/clock.ts');viewerClock.pause('PREPARED-avatar-capture');});
    await p.locator('#player-sprite').screenshot({path:`output/playwright/avatar-review/${character}-${mode}-${direction}.png`});
    await p.evaluate(async()=>{const{viewerClock}=await import('/src/viewer/clock.ts');viewerClock.resume('PREPARED-avatar-capture');});
   }
   await p.waitForFunction(n=>window.avatarProbe.events.slice(n).some(e=>e.phase==='finish'),before,{timeout:2500});
   await p.evaluate(async({before,mode,direction,character,expectedTicks})=>{
    const data=await(await fetch('/fr/objects.json')).json(),probe=window.avatarProbe,events=probe.events.slice(before);
    const begin=events.find(e=>e.phase==='begin'),end=events.find(e=>e.phase==='finish');
    if(end.tick-begin.tick!==expectedTicks)throw Error('Cadence mismatch '+JSON.stringify({mode,begin,end}));
    const name=`sAnim_${mode==='run'?'Run':mode==='surf'?'SurfFace':mode==='bike'?'GoFast':'Go'}${direction[0].toUpperCase()+direction.slice(1)}`;
    const commands=data.anims[name],gfx=Object.values(data.gfx).find(g=>g.name===`OBJ_EVENT_GFX_${character==='red'?'RED':'GREEN'}_${mode==='surf'?'SURF':mode==='bike'?'BIKE':'NORMAL'}`);
    const allowed=commands.filter(c=>c[0]==='F').map(c=>({file:gfx.frames[c[1]][0],index:gfx.frames[c[1]][1],flip:c[3]===1}));
    const live=probe.samples.filter(s=>s.moving);if(!live.length)throw Error('No live frames observed');
    for(const s of live){
     if(!allowed.some(a=>s.sheet.includes(a.file)&&parseFloat(s.position)===-a.index*gfx.width&&s.matrixX===(a.flip?-1:1)&&s.matrixY===1))throw Error('Rendered frame outside source sequence '+JSON.stringify({name,s,allowed}));
    }
   },{before,mode,direction,character,expectedTicks});
  }
  if(mode==='run')await p.keyboard.up('Shift');
  results.push({character,mode,direction,ticks:expectedTicks});
 }
 const collisions=[];
 for(const character of ['red','leaf'])for(const vehicle of ['walk','bike']){
  const f=fixtures.bump;
  await p.goto('about:blank');await p.goto(base+`#modo=explore&px=${f.x}&py=${f.y}`);
  await p.waitForFunction(()=>window.avatarProbe?.events.some(e=>e.phase==='spawn')&&!document.body.hasAttribute('aria-busy'));
  await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');
  if((await p.locator('#player-sprite').evaluate(el=>JSON.parse(el.dataset.animation))).direction!==f.direction){await p.keyboard.press(f.key);await p.waitForFunction(()=>!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);}
  if(vehicle==='bike')await p.keyboard.press('b');
  const original=await p.locator('#player-sprite').evaluate(el=>[el.style.left,el.style.top]);
  await p.evaluate(()=>window.avatarProbe.samples=[]);
  await p.keyboard.press(f.key);await p.waitForFunction(()=>window.avatarProbe.samples.some(s=>s.action==='bump'&&s.moving));
  await p.waitForFunction(()=>!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);
  const ticks=await p.evaluate(()=>{const samples=window.avatarProbe.samples.filter(s=>s.action==='bump');return samples.at(-1).tick-window.avatarProbe.inputTick;});
  const after=await p.locator('#player-sprite').evaluate(el=>[el.style.left,el.style.top]);
  if(ticks!==(vehicle==='bike'?16:32)||JSON.stringify(original)!==JSON.stringify(after))throw Error('Collision animation/timing mismatch '+JSON.stringify({character,vehicle,ticks,original,after}));
  collisions.push({character,vehicle,ticks});
 }
 const jumps=[];
 for(const character of ['red','leaf']){
  const f=fixtures.jump;if(!f)throw Error('No real ledge fixture');
  await p.goto('about:blank');await p.goto(base+`#modo=explore&px=${f.x}&py=${f.y}`);
  await p.waitForFunction(()=>window.avatarProbe?.events.some(e=>e.phase==='spawn')&&!document.body.hasAttribute('aria-busy'));
  await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');
  if((await p.locator('#player-sprite').evaluate(el=>JSON.parse(el.dataset.animation))).direction!==f.direction){await p.keyboard.press(f.key);await p.waitForFunction(()=>!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);}
  const n=await p.evaluate(()=>{window.avatarProbe.samples=[];return window.avatarProbe.events.length;});
  await p.keyboard.down(f.key);await p.waitForTimeout(20);await p.keyboard.up(f.key);await p.waitForTimeout(160);
  await p.evaluate(()=>window.avatarProbe.clock.pause('PREPARED-avatar-capture'));
  await p.locator('#player-sprite').screenshot({path:`output/playwright/avatar-review/${character}-jump.png`});
  await p.evaluate(()=>window.avatarProbe.clock.resume('PREPARED-avatar-capture'));
  await p.waitForFunction(n=>window.avatarProbe.events.slice(n).some(e=>e.phase==='finish'),n);
  const jump=await p.evaluate(({n,f,character})=>{
   const events=window.avatarProbe.events.slice(n),begin=events.find(e=>e.phase==='begin'),end=events.find(e=>e.phase==='finish');
   const samples=window.avatarProbe.samples.filter(s=>s.action==='jump'&&s.moving);
   if(!samples.length||samples.some(s=>!s.sheet.includes(character==='red'?'rednormal':'greennormal')))throw Error('Jump used wrong character graphics');
   if(end.tick-begin.tick!==32||end.x!==f.nx||end.y!==f.ny||!end.landingJump)throw Error('Jump cadence/destination mismatch');
   return{character,ticks:end.tick-begin.tick,direction:f.direction};
  },{n,f,character});jumps.push(jump);
 }
 if(ctx.errors().length)throw Error(ctx.errors().join(';'));
 return{cases:results,collisions,jumps,sourceSelections:results.length,turnsStayInPlace:true,note:'Real keys and terrain. PREPARED URL entry and temporary clock suspension solely for frame screenshots; cadence is measured in simulation ticks, not capture wall time.'};
}
