// PREPARED start beside the directional stairs of Route 16 North Entrance 1F; bike is mounted with the real B key.
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  window.bikeProbe={frames:[]};
  if(!/^https?:$/.test(location.protocol))return;
  import('/src/viewer/clock.ts').then(({viewerClock})=>{
   const sample=()=>{const el=document.querySelector('#player-sprite');
    if(el?.dataset.animation){const a=JSON.parse(el.dataset.animation),w=el.dataset.warpMotion?JSON.parse(el.dataset.warpMotion):null;
     const f=window.bikeProbe.frames,last=f.at(-1);
     if(!last||last.graphics!==a.graphics||last.action!==a.action||last.moving!==a.moving||(last.phase??null)!==(w?.phase??null))
      f.push({tick:viewerClock.tick,graphics:a.graphics,action:a.action,moving:a.moving,direction:a.direction,phase:w?.phase??null,speedX:w?.speedX,speedY:w?.speedY});}
    requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
 });
 const mapOf=()=>p.evaluate(()=>new URLSearchParams(location.hash.slice(1)).get('mapa'));
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE16_NORTH_ENTRANCE_1F&px=8&py=16',process.env.PW_BASE).href);
 await p.waitForFunction(()=>!document.body.hasAttribute('aria-busy')&&document.querySelector('#player-sprite'));await p.waitForTimeout(1500);
 if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await p.waitForTimeout(800);}
 await p.keyboard.press('b');await p.waitForTimeout(400);
 const mounted=await p.evaluate(()=>JSON.parse(document.querySelector('#player-sprite').dataset.animation).graphics);
 if(!/BIKE/i.test(mounted))throw Error('Bike was not mounted: '+mounted);
 await p.evaluate(()=>{window.bikeProbe.frames=[];});
 // Step onto the stair tile first; the directional warp fires on the next input toward it.
 await p.keyboard.down('ArrowRight');await p.waitForTimeout(25);await p.keyboard.up('ArrowRight');
 await p.waitForTimeout(700);
 await p.evaluate(()=>{window.bikeProbe.frames=[];});
 await p.keyboard.down('ArrowRight');await p.waitForTimeout(25);await p.keyboard.up('ArrowRight');
 await p.waitForFunction(m=>new URLSearchParams(location.hash.slice(1)).get('mapa')===m,'MAP_ROUTE16_NORTH_ENTRANCE_2F',{timeout:20000});
 await p.waitForFunction(()=>!document.querySelector('#player-sprite').dataset.warpMotion,{timeout:20000});await p.waitForTimeout(400);
 const frames=await p.evaluate(()=>window.bikeProbe.frames);
 const stair=frames.filter(f=>f.phase==='entry'||f.phase==='exit');
 if(!stair.length)throw Error('No directional stair motion '+JSON.stringify(frames));
 const entry=frames.find(f=>f.phase==='entry'),dismount=frames.find(f=>!/BIKE/i.test(f.graphics));
 if(!entry||!dismount)throw Error('Missing dismount or stair entry '+JSON.stringify(frames));
 // PlayerNotOnBikeTurningInPlace-style wait: field_fadetransition.c waits 12 ticks after leaving the bike.
 const wait=entry.tick-dismount.tick;
 if(wait!==12)throw Error('Bike dismount wait differs from the source 12 ticks: '+wait+' '+JSON.stringify(frames));
 const after=await p.evaluate(()=>JSON.parse(document.querySelector('#player-sprite').dataset.animation).graphics);
 if(/BIKE/i.test(after))throw Error('Bike persisted after directional stairs: '+after);
 await ctx.shot(`bike-stairs-${character}`);
 return{character,map:await mapOf(),mounted,after,entry:entry&&{tick:entry.tick,speedX:entry.speedX,speedY:entry.speedY},
  dismountTick:dismount.tick,wait,frames:frames.slice(0,12),
  note:'PREPARED start; bike mounted with the real B key, stairs entered with the real keyboard. Source dismount wait is 12 ticks (field_fadetransition.c); no global ROM parity claim.'};
}
