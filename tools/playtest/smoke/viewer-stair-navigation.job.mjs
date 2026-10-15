// PREPARED interior URL; real exported staircase and keyboard movement.
export default async function run(ctx){
 const p=ctx.page;
 await p.addInitScript(()=>{
  window.stairNavigation=[];window.stairFrames=[];
  new MutationObserver(records=>{for(const r of records){const el=r.target;if(el.dataset.warpMotion){const motion=JSON.parse(el.dataset.warpMotion);
    window.stairFrames.push({...motion,map:document.querySelector('#content')?.dataset.navigationMap,priority:el.style.zIndex,moving:JSON.parse(el.dataset.animation).moving});}}}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-warp-motion']});
  if(!/^https?:$/.test(location.protocol))return;
  void import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{
   const on=ViewerFieldEffects.prototype.onGroundStep;
   ViewerFieldEffects.prototype.onGroundStep=function(phase,actor){if(phase==='spawn'||phase==='finish')window.stairNavigation.push({...actor,phase,map:document.querySelector('#content')?.dataset.navigationMap});return on.call(this,phase,actor);};
  });
 });
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PALLET_TOWN_PLAYERS_HOUSE_1F&px=9&py=2',process.env.PW_BASE).href);
 const idle=()=>p.waitForFunction(()=>document.body.classList.contains('exploring')&&document.querySelector('#content')?.getAttribute('aria-busy')!=='true'&&document.querySelector('#player-sprite')?.dataset.animation&&!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);
 await p.waitForFunction(()=>window.stairNavigation.length);await idle();
 const character=process.env.PW_CHARACTER??'red';
 if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await idle();}
 const press=async key=>{await p.keyboard.press(key);await p.waitForTimeout(40);await idle();};
 await press('ArrowRight');await press('ArrowRight');await press('ArrowRight');
 await p.waitForFunction(()=>window.stairNavigation.at(-1)?.map==='MAP_PALLET_TOWN_PLAYERS_HOUSE_2F');await idle();
 const upstairs=await p.evaluate(()=>window.stairNavigation.at(-1));
 if(upstairs.x!==10||upstairs.y!==2||upstairs.direction!=='east')throw Error('Wrong staircase arrival '+JSON.stringify(upstairs));
 await p.waitForTimeout(350);
 if(await p.evaluate(()=>window.stairNavigation.at(-1).map)!==upstairs.map)throw Error('Immediate staircase bounce');
 await ctx.shot('upstairs');await press('ArrowLeft');
 await p.waitForFunction(()=>window.stairNavigation.at(-1)?.map==='MAP_PALLET_TOWN_PLAYERS_HOUSE_1F');await idle();
 const downstairs=await p.evaluate(()=>window.stairNavigation.at(-1));
 if(downstairs.x!==10||downstairs.y!==2||downstairs.direction!=='west')throw Error('Wrong return staircase '+JSON.stringify(downstairs));
 const frames=await p.evaluate(()=>window.stairFrames);
 for(const frame of frames){
  const {tick,speedX,speedY,phase}=frame;
  const expectedX=(speedX*(phase==='exit'?Math.max(0,16-tick):tick))>>5;
  const expectedY=(speedY*(phase==='exit'?Math.max(0,16-tick):speedY>0?tick:Math.max(0,tick-7)))>>5;
  if(frame.x!==expectedX||frame.y!==expectedY||phase==='entry'&&frame.priority!=='30'||phase==='exit'&&tick>=8&&frame.moving)throw Error('Stair fixed-point motion/priority differs '+JSON.stringify(frame));
 }
 for(const map of [upstairs.map,downstairs.map])for(const phase of ['entry','exit']){
  if(!frames.some(f=>f.map===map&&f.phase===phase&&f.tick>0))throw Error('Missing native stair animation '+JSON.stringify({map,phase}));
 }
 return {character,upstairs,downstairs,frames,note:'PREPARED interior URL; real keyboard, source stair triggers, fixed-point sprite offsets and priority, fade and no bounce; other maps/stair styles remain to traverse.'};
}
