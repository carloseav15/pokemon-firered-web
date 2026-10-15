// PREPARED start beside real ledges. UpdateShadowFieldEffect removes the shadow when the object's current
// behaviour is tall grass or the current/previous one is surfable or reflective (FR ledges land only on
// ground or tall grass, so those are the two reachable outcomes).
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';await p.setViewportSize({width:1280,height:720});
 const {readFileSync}=await import('node:fs');
 const kanto=JSON.parse(readFileSync('public/viewer/kanto.json','utf8')).maps;
 const base=new URL('viewer.html',process.env.PW_BASE).href;
 await p.addInitScript(()=>{
  window.shadowProbe={seen:0,frames:0,jumps:0};
  if(!/^https?:$/.test(location.protocol))return;
  const poll=()=>{const s=document.querySelector('.jump-shadow'),a=document.querySelector('#player-sprite');
   if(a?.dataset.animation){const f=JSON.parse(a.dataset.animation);if(f.action==='jump'&&f.moving){window.shadowProbe.frames++;if(s&&s.style.display==='block')window.shadowProbe.seen++;}}
   requestAnimationFrame(poll);};requestAnimationFrame(poll);
 });
 const keys={MB_JUMP_SOUTH:'ArrowDown',MB_JUMP_NORTH:'ArrowUp',MB_JUMP_EAST:'ArrowRight',MB_JUMP_WEST:'ArrowLeft'};
 const cases=[
  {name:'ground-to-ground',map:'MAP_ROUTE9',x:23,y:3,dir:'MB_JUMP_SOUTH',shadow:true},
  {name:'ground-to-tall-grass',map:'MAP_ROUTE5',x:20,y:3,dir:'MB_JUMP_SOUTH',shadow:false},
  {name:'tall-grass-to-ground',map:'MAP_THREE_ISLAND_BERRY_FOREST',x:40,y:34,dir:'MB_JUMP_SOUTH',shadow:true},
  {name:'tall-grass-to-tall-grass',map:'MAP_SIX_ISLAND_RUIN_VALLEY',x:32,y:31,dir:'MB_JUMP_EAST',shadow:false},
 ];
 const results=[];
 for(const c of cases){
  const o=kanto[c.map]??{x:0,y:0};
  await p.goto('about:blank');await p.goto(base+`#modo=explore&mapa=${c.map}&px=${o.x+c.x}&py=${o.y+c.y}`);
  await p.waitForFunction(()=>!document.body.hasAttribute('aria-busy')&&document.querySelector('#player-sprite')?.dataset.animation,null,{timeout:30000});await p.waitForTimeout(1200);
  if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');await p.waitForTimeout(800);}
  const key=keys[c.dir];
  await p.keyboard.press(key);await p.waitForTimeout(300);
  await p.evaluate(()=>{Object.assign(window.shadowProbe,{seen:0,frames:0});});
  await p.keyboard.down(key);await p.waitForTimeout(25);await p.keyboard.up(key);
  await p.waitForFunction(()=>window.shadowProbe.frames>8,null,{timeout:10000}).catch(()=>{throw Error(`${c.name}: no ledge jump observed`);});
  await p.waitForTimeout(700);
  const r=await p.evaluate(()=>({...window.shadowProbe}));
  if(c.shadow&&r.seen<r.frames*0.8)throw Error(`${c.name}: shadow visible in ${r.seen}/${r.frames} jump frames, expected all`);
  if(!c.shadow&&r.seen!==0)throw Error(`${c.name}: shadow visible in ${r.seen}/${r.frames} frames, expected hidden`);
  results.push({...c,...r});
 }
 return{character,results,note:'PREPARED cells beside real ledges; real keyboard; DOM shadow sampled per jump frame. Surfable/reflective landings do not exist in FireRed ledges.'};
}
