// PREPARED interior URL; real exported staircase and keyboard movement.
export default async function run(ctx){
 const p=ctx.page;
 await p.addInitScript(()=>{
  window.stairNavigation=[];
  if(!/^https?:$/.test(location.protocol))return;
  void import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{
   const on=ViewerFieldEffects.prototype.onGroundStep;
   ViewerFieldEffects.prototype.onGroundStep=function(phase,actor){if(phase==='spawn'||phase==='finish')window.stairNavigation.push({...actor,phase,map:document.querySelector('#content')?.dataset.navigationMap});return on.call(this,phase,actor);};
  });
 });
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PALLET_TOWN_PLAYERS_HOUSE_1F&px=9&py=2',process.env.PW_BASE).href);
 const idle=()=>p.waitForFunction(()=>document.body.classList.contains('exploring')&&document.querySelector('#content')?.getAttribute('aria-busy')!=='true'&&document.querySelector('#player-sprite')?.dataset.animation&&!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);
 await p.waitForFunction(()=>window.stairNavigation.length);await idle();
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
 return {upstairs,downstairs,note:'Real directional stair triggers and destinations; diagonal visual transition still pending.'};
}
