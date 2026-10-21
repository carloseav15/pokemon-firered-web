// PREPARED starts at the source door; all entry/panel/menu/exit steps use real keyboard.
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';
 await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  window.elevatorProbe={starts:[],writes:[],pans:[],resumes:[]};
  if(!/^https?:$/.test(location.protocol))return;
  Promise.all([import('/src/core/field/elevatorAnimation.ts'),import('/src/viewer/clock.ts')]).then(([{ElevatorAnimation},{viewerClock}])=>{
   const original=ElevatorAnimation.prototype.AnimateElevator;
   ElevatorAnimation.prototype.AnimateElevator=function(from,to){
    const probe=window.elevatorProbe;probe.starts.push({from,to,tick:viewerClock.tick});
    for(const [name,key]of [['setMetatile','writes'],['pan','pans'],['resumeScript','resumes']]){
     const fn=this.host[name];this.host[name]=(...args)=>{probe[key].push({args,tick:viewerClock.tick});return fn(...args);};
    }
    return original.call(this,from,to);
   };
  });
 });
 const source=process.env.PW_ELEVATOR_MAP??'MAP_CELADON_CITY_DEPARTMENT_STORE_1F';
 const dest=process.env.PW_ELEVATOR_DEST??'MAP_CELADON_CITY_DEPARTMENT_STORE_5F';
 const {readFileSync}=await import('node:fs');
 const header=JSON.parse(readFileSync(`public/fr/maps/${source}.json`,'utf8'));
 const specs=JSON.parse(readFileSync('public/viewer/elevators.json','utf8')).elevators;
 const candidates=header.warps.filter(w=>w.destMap.endsWith('_ELEVATOR'));
 const departure=specs[candidates[0].destMap].choices.find(c=>c.destination?.mapId===source)?.destination;
 const entry=candidates.find(w=>w.x===departure?.x&&w.y===departure?.y)??candidates[0];
 const cabin=entry.destMap;
 await p.goto(new URL(`viewer.html#modo=explore&mapa=${source}&px=${entry.x}&py=${entry.y+1}`,process.env.PW_BASE).href);
 const ready=()=>p.waitForFunction(()=>!document.body.hasAttribute('aria-busy')&&performance.getEntriesByName('viewer-interactive').length&&document.querySelector('#player-sprite'));
 await ready();await p.waitForTimeout(1000);
 if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await p.waitForTimeout(500);}
 await p.locator('#viewport').focus();
 // Two taps: turn in place first, then walk through the animated door.
 const tap=async key=>{await p.keyboard.down(key);await p.waitForTimeout(25);await p.keyboard.up(key);await p.waitForTimeout(700);};
 await tap('ArrowUp');await tap('ArrowUp');
 await p.waitForFunction(m=>new URLSearchParams(location.hash.slice(1)).get('mapa')===m,cabin,{timeout:20000}).catch(async()=>{await ctx.shot('entry-failed');throw Error('Cabin entry failed '+JSON.stringify(await p.evaluate(()=>({hash:location.hash,text:document.body.innerText.slice(0,800),content:document.querySelector('#content')?.dataset,animation:document.querySelector('#player-sprite')?.dataset.animation}))));});
 await p.waitForFunction(()=>document.querySelector('#content')?.getAttribute('aria-busy')!=='true');
 const pos=()=>p.evaluate(()=>{const q=new URLSearchParams(location.hash.slice(1));return [Number(q.get('px')),Number(q.get('py'))];});
 const move=async key=>{const before=await pos();for(let i=0;i<2;i++){await tap(key);if(JSON.stringify(await pos())!==JSON.stringify(before))return;}throw Error('Step blocked '+JSON.stringify({key,before}));};
 // PISTA INCORRECTA: row 2 is solid in all four source layouts. Stand at (0,3), facing panel (0,2).
 await move('ArrowUp');await move('ArrowUp');await move('ArrowLeft');await move('ArrowLeft');
 if(process.env.PW_ELEVATOR_UNLOCKED)await p.evaluate(async()=>{const {state}=await import('/src/viewer/state.ts');state.eventFlags.add('FLAG_CAN_USE_ROCKET_HIDEOUT_LIFT');});
 await tap('ArrowUp');await p.keyboard.press('z');
 if(source.startsWith('MAP_ROCKET_')&&!process.env.PW_ELEVATOR_UNLOCKED){
   await p.waitForFunction(()=>document.querySelector('#dialog-box')?.classList.contains('open'));
   const text=await p.locator('#dialog-text').innerText();if(!text.includes('need a key'))throw Error(text);
   return{character,source,locked:true,note:'Actual no-key branch; no progress flags fabricated.'};
 }
 const menu=p.locator('#elevator-menu');await menu.waitFor({state:'visible',timeout:6000}).catch(async()=>{await ctx.shot('menu-failed');throw Error('Panel did not open '+JSON.stringify({at:await pos(),text:await p.locator('#dialog-text').innerText(),hash:await p.evaluate(()=>location.hash)}));});
 const atPanel=await pos();await p.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
 if(JSON.stringify(atPanel)!==JSON.stringify(await pos()))throw Error('Cancel moved player');
 await p.keyboard.press('z');await menu.waitFor({state:'visible'});
 await p.keyboard.press('Enter');await menu.waitFor({state:'hidden'});await p.waitForTimeout(400);
 if((await p.evaluate(()=>window.elevatorProbe.starts.length))!==0)throw Error('Same-floor selection animated');
 await p.keyboard.press('z');await menu.waitFor({state:'visible'});
 // Select with keyboard relative to the source menu's current floor cursor.
 const labels=await menu.locator('button').allTextContents();
 const target=process.env.PW_ELEVATOR_LABEL??'5F';
 const selected=labels.indexOf(target);if(selected<0)throw Error('Missing target '+labels);
 const active=await p.evaluate(()=>[...document.querySelectorAll('#elevator-menu button')].indexOf(document.activeElement));
 for(let i=active;i>selected;i--)await p.keyboard.press('ArrowUp');
 for(let i=active;i<selected;i++)await p.keyboard.press('ArrowDown');
 await p.keyboard.press('Enter');await menu.waitFor({state:'hidden'});
 await p.waitForFunction(m=>new URLSearchParams(location.hash.slice(1)).get('retorno')===m,dest,{timeout:20000});
 await p.waitForTimeout(4000);
 const observation=await p.evaluate(()=>window.elevatorProbe);
 const defs=JSON.parse(readFileSync('public/fr/cdata/field_specials.json','utf8')).defs;
 if(observation.starts.length!==1||observation.resumes.length!==1)throw Error('Animation was not observed '+JSON.stringify(observation));
 const start=observation.starts[0],difference=Math.min(Math.abs(start.from-start.to),8);
 const duration=defs.sElevatorAnimationDuration.value[difference]*3;
 if(observation.resumes[0].tick-start.tick!==duration)throw Error('Browser elevator duration differs '+JSON.stringify({observation,duration}));
 if(observation.writes.length!==defs.sElevatorWindowAnimDuration.value[difference]*9)throw Error('Missing window metatiles');
 const table=defs[start.from>start.to?'sElevatorWindowMetatilesGoingDown':'sElevatorWindowMetatilesGoingUp'].value;
 observation.writes.forEach((w,i)=>{
  const row=Math.floor((i%9)/3),col=i%3,phase=(Math.floor(i/9)+1)%3;
  if(JSON.stringify(w.args)!==JSON.stringify([8+col,7+row,table[row][phase]|0xc00]))throw Error('C window cell differs '+JSON.stringify(w));
 });

 if(specs[cabin].choices[selected]?.autoExit){
   await p.waitForFunction(m=>new URLSearchParams(location.hash.slice(1)).get('mapa')===m,dest,{timeout:20000});
   return{character,source,cabin,dest,arrival:await pos(),autoExit:true,animation:{ticks:duration,windowWrites:observation.writes.length},note:'PREPARED roof start. Source automatic lobby departure sequence through navigation adapter; no Trainer Tower event VM.'};
 }
 const q=await p.evaluate(()=>Object.fromEntries(new URLSearchParams(location.hash.slice(1))));
 if(q.retornoWarp!=='-1')throw Error('Destination must use source coordinates '+JSON.stringify(q));
 await p.reload();await ready();await p.waitForTimeout(600);
 if((await p.evaluate(()=>new URLSearchParams(location.hash.slice(1)).get('retorno')))!==dest)throw Error('Reload lost selected floor');
 // Back from the panel to the cabin exit arrow (2,5); another down input triggers it.
 await move('ArrowRight');await move('ArrowRight');await move('ArrowDown');await move('ArrowDown');await tap('ArrowDown');
 await p.waitForFunction(m=>new URLSearchParams(location.hash.slice(1)).get('mapa')===m,dest,{timeout:20000});
 await p.waitForFunction(()=>document.querySelector('#content')?.getAttribute('aria-busy')!=='true');
 const arrival=await pos();await ctx.shot(`elevator-${character}`);
 return{character,source,cabin,dest,arrival,cancel:true,reload:true,animation:{ticks:duration,windowWrites:observation.writes.length},note:'PREPARED door start. Real keyboard entry, panel, menu, cancel, selection, reload and departure; DOM menu adapts presentation. No general story VM/ROM parity claim.'};
}
