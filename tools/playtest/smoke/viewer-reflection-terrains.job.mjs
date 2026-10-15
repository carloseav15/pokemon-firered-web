// PREPARED entry URLs; terrain, avatar frames and the reflection mask are the real viewer's.
// Reflection per terrain (ObjectEventCheckForReflectiveSurface): ice mirrors (type 1), water-like behaviours
// distort with the affine matrix (type 2); rows y+1 and y+2 of the current/previous cell are inspected.
export default async function run(ctx){
 const p=ctx.page,character=process.env.PW_CHARACTER??'red';await p.setViewportSize({width:1280,height:720});
 await p.addInitScript(()=>{
  window.reflProbe={grid:null,spawns:0};
  if(!/^https?:$/.test(location.protocol))return;
  import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{
   const on=ViewerFieldEffects.prototype.onGroundStep;
   ViewerFieldEffects.prototype.onGroundStep=function(phase,a){window.reflProbe.grid=this.grid;if(phase==='spawn')window.reflProbe.spawns++;return on.call(this,phase,a);};
  });
 });
 const {readFileSync}=await import('node:fs');
 const kanto=JSON.parse(readFileSync('public/viewer/kanto.json','utf8')).maps;
 const base=new URL('viewer.html',process.env.PW_BASE).href;
 const cases=[
  {name:'pond',map:'MAP_CELADON_CITY',behavior:'MB_POND_WATER',type:2,bike:true},
  {name:'ice-hall',map:'MAP_POKEMON_LEAGUE_HALL_OF_FAME',behavior:'MB_ICE',type:1,onSurface:true},
  {name:'ice-cave',map:'MAP_FOUR_ISLAND_ICEFALL_CAVE_B1F',behavior:'MB_ICE',type:1,onSurface:true},
  {name:'cycling-road-water',map:'MAP_ROUTE17',behavior:'MB_CYCLING_ROAD_WATER',type:2,bike:true},
  {name:'puddle',map:'MAP_FOUR_ISLAND',behavior:'MB_PUDDLE',type:2,bike:true},
 ];
 const results=[];
 for(const c of cases){
  const origin=kanto[c.map]??{x:0,y:0};
  await p.goto('about:blank');await p.goto(base+`#modo=explore&mapa=${c.map}`);
  await p.waitForFunction(()=>window.reflProbe?.spawns&&window.reflProbe.grid&&!document.body.hasAttribute('aria-busy'),null,{timeout:30000});
  const fixture=await p.evaluate(async({behavior,ox,oy,w,h,onSurface})=>{
   const g=window.reflProbe.grid,C=await import('/src/games/firered/generated/metatileBehavior.ts');
   const id=C[behavior];if(typeof id!=='number')throw Error('Unknown behavior '+behavior);
   const found={positive:null,negative:null};
   for(let y=oy;y<oy+h-2;y++)for(let x=ox;x<ox+w;x++){
    if(!g.isLoaded(x,y)||!g.isWalkable(x,y,'walk')||g.isWaterTile(x,y))continue;
    // Ice has no land edge below it: the avatar stands on the ice and is mirrored by the ice below.
    const reflectiveHere=C.MetatileBehavior_IsReflective(g.behaviorAt(x,y));
    if(reflectiveHere&&!onSurface)continue;
    if(g.behaviorAt(x,y+1)===id&&g.isLoaded(x,y+1)&&!found.positive)found.positive={x,y};
    const rows=[1,2].map(d=>C.MetatileBehavior_IsReflective(g.behaviorAt(x,y+d)));
    const near=[[-1,0],[1,0],[0,-1]].some(([dx,dy])=>[1,2].some(d=>C.MetatileBehavior_IsReflective(g.behaviorAt(x+dx,y+dy+d))));
    if(!reflectiveHere&&!rows[0]&&!rows[1]&&!near&&!found.negative)found.negative={x,y};
    if(found.positive&&found.negative)return found;
   }
   if(found.positive)return found;
   throw Error('No walkable cell above '+behavior+' in resident maps');
  },{behavior:c.behavior,onSurface:!!c.onSurface,ox:origin.x,oy:origin.y,w:(kanto[c.map]?.width)??64,h:(kanto[c.map]?.height)??64});
  const probe=async point=>{
   await p.goto('about:blank');await p.goto(base+`#modo=explore&mapa=${c.map}&px=${point.x}&py=${point.y}`);
   await p.waitForFunction(()=>window.reflProbe?.spawns&&!document.body.hasAttribute('aria-busy'),null,{timeout:30000});
   if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');}
   await p.waitForTimeout(700);
   return p.evaluate(async()=>{
    const el=document.querySelector('.player-reflection'),player=document.querySelector('#player-sprite'),g=window.reflProbe.grid;
    if(el.style.display==='none')return{shown:false};
    const source=JSON.parse(player.dataset.animation),copy=JSON.parse(el.dataset.reflection);
    const data=el.getContext('2d').getImageData(0,0,64,64).data,left=parseFloat(el.style.left),top=parseFloat(el.style.top);
    const {MetatileBehavior_IsReflective}=await import('/src/games/firered/generated/metatileBehavior.ts');
    let pixels=0,leaked=0;
    for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(data[(y*64+x)*4+3]){
     pixels++;if(!MetatileBehavior_IsReflective(g.behaviorAt(Math.floor((left+x+.5)/16)+g.minX,Math.floor((top+y+.5)/16)+g.minY)))leaked++;
    }
    return{shown:true,type:copy.type,affine:!!copy.affine,sameFrame:copy.file===source.reflection[0]&&copy.index===source.reflection[1]&&copy.hFlip===source.hFlip,pixels,leaked};
   });
  };
  const shown=await probe(fixture.positive);
  if(!shown.shown)throw Error(`${c.name}: no reflection above real ${c.behavior} `+JSON.stringify(fixture.positive));
  if(shown.type!==c.type)throw Error(`${c.name}: reflection type ${shown.type}, expected ${c.type}`);
  if(shown.affine!==(c.type===2))throw Error(`${c.name}: affine distortion presence differs for type ${c.type}`);
  if(!shown.sameFrame)throw Error(`${c.name}: reflection frame diverged from the avatar frame`);
  if(!shown.pixels||shown.leaked)throw Error(`${c.name}: mask pixels=${shown.pixels} leaked=${shown.leaked}`);
  await ctx.shot(`reflection-${c.name}-${character}`);
  let bike=null;
  if(c.bike){
   await p.keyboard.press('b');await p.waitForTimeout(500);
   bike=await p.evaluate(()=>{const el=document.querySelector('.player-reflection'),a=JSON.parse(document.querySelector('#player-sprite').dataset.animation);
    if(el.style.display==='none')return{shown:false,graphics:a.graphics};
    const r=JSON.parse(el.dataset.reflection);
    return{shown:true,type:r.type,file:r.file,sameFrame:r.file===a.reflection[0]&&r.index===a.reflection[1],graphics:a.graphics};});
   if(!/BIKE/i.test(bike.graphics))throw Error(`${c.name}: bike was not mounted (${bike.graphics})`);
   if(!bike.shown||bike.type!==c.type||!/bike/i.test(bike.file)||!bike.sameFrame)throw Error(`${c.name}: bike reflection differs `+JSON.stringify(bike));
   await p.keyboard.press('b');await p.waitForTimeout(200);
  }
  let negative=null;
  if(fixture.negative){negative=await probe(fixture.negative);if(negative.shown)throw Error(`${c.name}: reflection shown without reflective terrain `+JSON.stringify(fixture.negative));}
  results.push({...c,at:fixture.positive,shown,bike,negativeChecked:!!negative||!!fixture.negative});
 }
 const surfCases=[
  {name:'surf-pond',map:'MAP_CELADON_CITY',behavior:'MB_POND_WATER',shown:true,type:2},
  {name:'surf-ocean',map:'MAP_ROUTE19',behavior:'MB_OCEAN_WATER',shown:false},
 ];
 const surf=[];
 for(const c of surfCases){
  const origin=kanto[c.map];
  await p.goto('about:blank');await p.goto(base+`#modo=explore&mapa=${c.map}`);
  await p.waitForFunction(()=>window.reflProbe?.spawns&&window.reflProbe.grid&&!document.body.hasAttribute('aria-busy'),null,{timeout:30000});
  const cell=await p.evaluate(async({behavior,ox,oy,w,h,expectShown})=>{
   const g=window.reflProbe.grid,C=await import('/src/games/firered/generated/metatileBehavior.ts'),id=C[behavior];
   for(let y=oy;y<oy+h-3;y++)for(let x=ox;x<ox+w;x++){
    if(!g.isLoaded(x,y)||g.behaviorAt(x,y)!==id||!g.isWalkable(x,y,'surf'))continue;
    const refl=[0,1,2].map(d=>C.MetatileBehavior_IsReflective(g.behaviorAt(x,y+d)));
    const rows=[1,2].some(d=>C.MetatileBehavior_IsReflective(g.behaviorAt(x,y+d)));
    if(expectShown?(g.behaviorAt(x,y+1)===id):(!refl[0]&&!refl[1]&&!refl[2]&&!rows))return{x,y};
   }
   throw Error('No surf cell for '+behavior);
  },{behavior:c.behavior,ox:origin.x,oy:origin.y,w:origin.width,h:origin.height,expectShown:c.shown});
  await p.goto('about:blank');await p.goto(base+`#modo=explore&mapa=${c.map}&px=${cell.x}&py=${cell.y}`);
  await p.waitForFunction(()=>window.reflProbe?.spawns&&!document.body.hasAttribute('aria-busy'),null,{timeout:30000});
  if(await p.locator('#player-char').inputValue()!==character){await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-character').selectOption(character);await p.keyboard.press('Escape');}
  await p.waitForTimeout(900);
  const r=await p.evaluate(()=>{const el=document.querySelector('.player-reflection'),a=JSON.parse(document.querySelector('#player-sprite').dataset.animation);
   if(el.style.display==='none')return{shown:false,graphics:a.graphics};const x=JSON.parse(el.dataset.reflection);
   return{shown:true,type:x.type,file:x.file,sameFrame:x.file===a.reflection[0]&&x.index===a.reflection[1],graphics:a.graphics};});
  if(!/SURF/i.test(r.graphics))throw Error(`${c.name}: avatar is not surfing (${r.graphics})`);
  if(r.shown!==c.shown)throw Error(`${c.name}: reflection shown=${r.shown}, expected ${c.shown} at `+JSON.stringify(cell));
  if(c.shown&&(r.type!==c.type||!/surf/i.test(r.file)||!r.sameFrame))throw Error(`${c.name}: surf reflection differs `+JSON.stringify(r));
  surf.push({...c,cell,...r});
 }
 return{character,results,surf,note:'PREPARED start cells on unmodified exported terrain; frames, type, affine presence and land-leak mask checked. Elevation/BG-priority parity is not claimed.'};
}
