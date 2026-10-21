// PREPARED entry URL only; exported terrain, real keyboard and live context changes.
export default async function run(ctx) {
  const p=ctx.page;
  const {sourceMap='MAP_PALLET_TOWN',interiorMap='MAP_PALLET_TOWN_PLAYERS_HOUSE_1F',x=6,y=8}=ctx.doorFixture??{};
  await p.setViewportSize({width:1280,height:720});
  await p.addInitScript(()=>{
    window.interiorNavigation={positions:[],grids:[]};
    if(!/^https?:$/.test(location.protocol))return;
    void import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{
      const original=ViewerFieldEffects.prototype.onGroundStep;
      ViewerFieldEffects.prototype.onGroundStep=function(phase,actor){
        const probe=window.interiorNavigation;
        if(!probe.grids.includes(this.grid))probe.grids.push(this.grid);
        if(phase==='spawn'||phase==='finish')probe.positions.push({...actor,phase,map:document.querySelector('#content')?.dataset.navigationMap??'exterior'});
        return original.call(this,phase,actor);
      };
    });
  });
  await p.goto(new URL(`viewer.html#modo=explore&mapa=${sourceMap}&px=${x}&py=${y}`,process.env.PW_BASE).href);
  await p.waitForFunction(()=>window.interiorNavigation?.positions.length);
  const idle=()=>p.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')!=='true'&&!JSON.parse(document.querySelector('#player-sprite').dataset.animation).moving);
  const press=async key=>{await idle();await p.keyboard.press(key);await p.waitForTimeout(40);await idle();};
  const character=process.env.PW_CHARACTER??'red';
  if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await idle();}
  // Facing changes use native eight-tick turns before a subsequent input moves.
  await press('ArrowUp');await press('ArrowUp');
  await p.waitForFunction(map=>window.interiorNavigation.positions.at(-1)?.phase==='spawn'&&window.interiorNavigation.positions.at(-1)?.map===map,interiorMap);
  await idle();
  const entry=await p.evaluate(()=>({at:window.interiorNavigation.positions.at(-1),maps:[...document.querySelectorAll('.map')].map(el=>el.dataset.map),oldBytes:window.interiorNavigation.grids[0].retainedBytes,hash:location.hash,overlay:document.querySelector('#interior').style.display}));
  if(entry.maps.length!==1||entry.oldBytes!==0||entry.overlay!=='none')throw Error('Interior retained exterior or opened consultation '+JSON.stringify(entry));
  await ctx.shot('house-entry');
  await ctx.onInteriorEntry?.();
  await p.reload();
  await p.waitForFunction(map=>window.interiorNavigation?.positions.at(-1)?.map===map,interiorMap);
  await idle();
  const reload=await p.evaluate(()=>({at:window.interiorNavigation.positions.at(-1),maps:[...document.querySelectorAll('.map')].map(el=>el.dataset.map)}));
  if(reload.at.x!==entry.at.x||reload.at.y!==entry.at.y||reload.maps.length!==1)throw Error('Interior reload lost context '+JSON.stringify(reload));
  // Walk away from the exit, then back through the native south arrow warp.
  await press('ArrowUp');await press('ArrowUp');
  const moved=await p.evaluate(()=>window.interiorNavigation.positions.at(-1));
  if(moved.y>=entry.at.y)throw Error('Did not walk inside '+JSON.stringify({entry,moved,debug:await p.evaluate(()=>({animation:document.querySelector('#player-sprite').dataset.animation,active:document.activeElement?.outerHTML,positions:window.interiorNavigation.positions,hash:location.hash,grid:window.interiorNavigation.grids.at(-1).behaviorAt(4,8)}))}));
  for(let n=0;n<5;n++){
    if(await p.evaluate(map=>window.interiorNavigation.positions.at(-1).map===map,sourceMap))break;
    await press('ArrowDown');
    await idle();
  }
  await p.waitForFunction(map=>window.interiorNavigation.positions.at(-1)?.phase==='spawn'&&window.interiorNavigation.positions.at(-1)?.map===map,sourceMap).catch(async e=>{throw Error(String(e)+' '+JSON.stringify(await p.evaluate(()=>({positions:window.interiorNavigation.positions,animation:document.querySelector('#player-sprite').dataset.animation,hash:location.hash,panel:document.querySelector('#panel').textContent}))));});
  const exit=await p.evaluate(()=>({at:window.interiorNavigation.positions.at(-1),maps:[...document.querySelectorAll('.map')].map(el=>el.dataset.map),hash:location.hash,grids:window.interiorNavigation.grids.map(g=>g.retainedBytes)}));
  if(exit.at.x!==x||exit.at.y!==y)throw Error('Wrong exterior arrival '+JSON.stringify(exit));
  await ctx.shot('house-exit');
  return {entry,reload,moved,exit,note:'PREPARED exterior URL; real keyboard/warps, same renderer, no reload. Door graphics/fades have a separate observer job; other maps/transitions remain pending.'};
}
