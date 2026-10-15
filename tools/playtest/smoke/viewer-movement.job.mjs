// PREPARED entry URLs choose positions from real loaded Kanto terrain. No terrain,
// flags, vehicles or expected outcomes are injected; all actions use the keyboard.
export default async function run(ctx) {
 const p=ctx.page;
 await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  if(!/^https?:$/.test(location.protocol))return;
  window.motionProbe={events:[]};
  void Promise.all([import('/src/viewer/fieldEffects.ts'),import('/src/viewer/clock.ts')]).then(([fx,clock])=>{
   const on=fx.ViewerFieldEffects.prototype.onGroundStep;
   fx.ViewerFieldEffects.prototype.onGroundStep=function(phase,actor){window.motionProbe.grid=this.grid;window.motionProbe.events.push({...actor,phase,tick:clock.viewerClock.tick,at:performance.now()});return on.call(this,phase,actor);};
  });
 });
 const enter=async point=>{
  await p.goto('about:blank');
  await p.goto(new URL(`viewer.html#modo=explore&px=${point.x}&py=${point.y}`,process.env.PW_BASE).href);
  await p.waitForFunction(()=>window.motionProbe?.events.some(e=>e.phase==='spawn')&&!document.body.hasAttribute('aria-busy'));
 };
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PALLET_TOWN',process.env.PW_BASE).href);
 await p.waitForFunction(()=>window.motionProbe?.grid&&window.motionProbe.events.some(e=>e.phase==='spawn'));
 const cases=await p.evaluate(async()=>{
  const g=window.motionProbe.grid,idx=await(await fetch('/viewer/kanto.json')).json();
  const doors=new Set(idx.elements.filter(e=>e.layer==='puerta').map(e=>`${idx.maps[e.map].x+e.x},${idx.maps[e.map].y+e.y}`));
  const result={};const delta=[['ArrowDown',0,1,1],['ArrowUp',0,-1,2],['ArrowLeft',-1,0,3],['ArrowRight',1,0,4]];
  for(const [id,m] of Object.entries(idx.maps))for(let y=m.y;y<m.y+m.height;y++)for(let x=m.x;x<m.x+m.width;x++){
   if(!result.invalidSpawn&&id==='MAP_PALLET_TOWN'&&g.isLoaded(x,y)&&!g.isWalkable(x,y,'walk')&&!g.isWaterTile(x,y))result.invalidSpawn={x,y};
   if(!g.isWalkable(x,y,'walk')||g.ledgeDirection(x,y)||doors.has(`${x},${y}`))continue;
   for(const [key,dx,dy,ledge]of delta){
    const nx=x+dx,ny=y+dy;
    if(doors.has(`${nx},${ny}`))continue;
    if(!result.walk&&id==='MAP_PALLET_TOWN'&&g.isWalkable(nx,ny,'walk')&&!g.ledgeDirection(nx,ny))result.walk={x,y,nx,ny,key};
    if(!result.jump&&g.ledgeDirection(nx,ny)===ledge&&g.isWalkable(x+dx*2,y+dy*2,'walk'))result.jump={x,y,nx:x+dx*2,ny:y+dy*2,key};
    if(!result.surf&&g.isWaterTile(nx,ny)&&g.isWalkable(nx,ny,'surf'))result.surf={x,y,nx,ny,key};
   }
  }
  if(!result.walk||!result.jump||!result.surf)throw Error('Real-map cases missing '+JSON.stringify(result));
  return result;
 });
 const reverse={ArrowDown:'ArrowUp',ArrowUp:'ArrowDown',ArrowLeft:'ArrowRight',ArrowRight:'ArrowLeft'};
 const step=async(point,vehicle,inspectJump=false)=>{
  const before=await p.evaluate(()=>window.motionProbe.events.length);
  await p.keyboard.down(point.key);await p.waitForTimeout(20);await p.keyboard.up(point.key);
  if(inspectJump){
   await p.waitForTimeout(200);
   const arc=await p.evaluate(async before=>{
    const {viewerClock}=await import('/src/viewer/clock.ts');const {cdata}=await import('/src/core/hw/assets.ts');
    const begin=window.motionProbe.events.slice(before).find(e=>e.phase==='begin'),tick=viewerClock.tick-begin.tick;
    if(tick<1||tick>=32)throw Error('Missed jump inspection window');
    const idx=await(await fetch('/viewer/kanto.json')).json(),minY=Math.min(...Object.values(idx.maps).map(m=>m.y));
    // Tick/style sampled together below: a fetch must not separate the two observations.
    const liveTick=viewerClock.tick-begin.tick,offset=cdata('event_object_movement','sJumpY_High')[Math.min(15,(liveTick-1)>>1)];
    const expected=(begin.previousY-minY)*16+(begin.y-begin.previousY)*16*liveTick/32+offset-16;
    const actual=parseFloat(document.querySelector('#player-sprite').style.top);
    if(Math.abs(actual-expected)>.01)throw Error('Jump arc differs from exported C table '+JSON.stringify({liveTick,offset,expected,actual}));
    return {tick:liveTick,offset};
   },before);
   if(arc.offset>=0)throw Error('Jump remained on ground');
   await ctx.shot('ledge-midair');
  }
  await p.waitForFunction(({before})=>window.motionProbe.events.slice(before).some(e=>e.phase==='finish'),{before},{timeout:2500});
  return p.evaluate(({before,point,vehicle})=>{
   const events=window.motionProbe.events.slice(before),begin=events.find(e=>e.phase==='begin'),end=events.find(e=>e.phase==='finish');
   if(end.x!==point.nx||end.y!==point.ny||end.vehicle!==vehicle)throw Error('Unexpected movement '+JSON.stringify(events));
   return {ticks:end.tick-begin.tick,wallMs:end.at-begin.at,vehicle:end.vehicle,jump:end.landingJump};
  },{before,point,vehicle});
 };
 await enter(cases.invalidSpawn);
 const repairedSpawn=await p.evaluate(()=>{const e=window.motionProbe.events.find(e=>e.phase==='spawn');if(!window.motionProbe.grid.isWalkable(e.x,e.y,'walk'))throw Error('Invalid entry position accepted');return{x:e.x,y:e.y};});
 if(repairedSpawn.x===cases.invalidSpawn.x&&repairedSpawn.y===cases.invalidSpawn.y)throw Error('Blocked spawn was not repaired');
 await enter(cases.walk);const walk=await step(cases.walk,'walk');
 await enter(cases.walk);await p.keyboard.down('Shift');
 const count=await p.evaluate(()=>window.motionProbe.events.length);
 await p.keyboard.down(cases.walk.key);await p.waitForTimeout(20);await p.keyboard.up(cases.walk.key);await p.keyboard.up('Shift');
 const midRun=await p.locator('#player-sprite').evaluate(el=>({sheet:el.style.backgroundImage,frame:el.style.backgroundPosition}));
 if(!midRun.sheet.includes('surfrun')||midRun.frame==='0px 0px')throw Error('Running animation ended before tile movement: '+JSON.stringify(midRun));
 await p.waitForFunction(n=>window.motionProbe.events.slice(n).some(e=>e.phase==='finish'),count);
 const run=await p.evaluate(n=>{const a=window.motionProbe.events.slice(n);return{ticks:a.find(e=>e.phase==='finish').tick-a.find(e=>e.phase==='begin').tick};},count);
 await enter(cases.walk);await p.keyboard.press('b');
 // Attempt to change vehicle in flight; animation/duration must remain on the bike.
 const bikeBefore=await p.evaluate(()=>window.motionProbe.events.length);
 await p.keyboard.down(cases.walk.key);await p.waitForTimeout(20);await p.keyboard.up(cases.walk.key);await p.keyboard.press('b');
 if(!await p.locator('#player-sprite').evaluate(el=>el.style.backgroundImage.includes('bike')))throw Error('Bike changed in mid-step');
 await p.waitForFunction(n=>window.motionProbe.events.slice(n).some(e=>e.phase==='finish'),bikeBefore);
 const bike=await p.evaluate(n=>{const a=window.motionProbe.events.slice(n);return{ticks:a.find(e=>e.phase==='finish').tick-a.find(e=>e.phase==='begin').tick};},bikeBefore);
 if(!(bike.ticks<run.ticks&&run.ticks<walk.ticks))throw Error('Speed ordering '+JSON.stringify({walk,run,bike}));
 await enter(cases.jump);const jump=await step(cases.jump,'walk',true);
 if(!jump.jump||jump.ticks!==32)throw Error('Ledge timing/distance '+JSON.stringify(jump));
 const beforeWrong=await p.evaluate(()=>window.motionProbe.events.length);
 const beforeStyle=await p.locator('#player-sprite').evaluate(el=>[el.style.left,el.style.top]);
 await p.keyboard.press(reverse[cases.jump.key]);await p.waitForTimeout(200);
 if(await p.evaluate(n=>window.motionProbe.events.slice(n).some(e=>e.phase==='finish'),beforeWrong))throw Error('Ledge traversed in reverse');
 const afterStyle=await p.locator('#player-sprite').evaluate(el=>[el.style.left,el.style.top]);
 if(JSON.stringify(beforeStyle)!==JSON.stringify(afterStyle))throw Error('Blocked reverse jump moved avatar');
 await ctx.shot('ledge-landing');
 await enter(cases.surf);const surf=await step(cases.surf,'surf');
 if(!await p.locator('#player-sprite').evaluate(el=>el.style.backgroundImage.includes('surfrun')))throw Error('Surf sheet missing');
 await p.waitForFunction(point=>{const h=new URLSearchParams(location.hash.slice(1));return Number(h.get('px'))===point.nx&&Number(h.get('py'))===point.ny;},cases.surf);
 await p.reload();await p.waitForFunction(()=>window.motionProbe?.events.some(e=>e.phase==='spawn')&&!document.body.hasAttribute('aria-busy'));
 if(!await p.locator('#player-sprite').evaluate(el=>el.style.backgroundImage.includes('surfrun')))throw Error('Reload on water lost surf vehicle');
 const dismount=await step({x:cases.surf.nx,y:cases.surf.ny,nx:cases.surf.x,ny:cases.surf.y,key:reverse[cases.surf.key]},'walk');
 await ctx.shot('surf-return');
 if(ctx.errors().length)throw Error(ctx.errors().join(';'));
 return {cases,repairedSpawn,walk,run,bike,jump,surf,dismount,releaseKeepsRunAnimation:true,reverseLedgeBlocked:true,surfReload:true,note:'PREPARED start URLs, real exported terrain and keyboard. Automatic surf is a viewer adaptation; no HM/story or full movement parity claim.'};
}
