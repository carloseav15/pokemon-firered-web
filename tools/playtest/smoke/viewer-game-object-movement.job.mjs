// PREPARED: gym URL and Lv40 Blastoise with Surf as explicit battle inputs.
// Liam's approach, battle, reward and final position are produced by the engine.
export default async function run(ctx) {
 const p=ctx.page;
 await p.addInitScript(()=>{if(!/^https?:$/.test(location.protocol))return;import('/src/viewer/fieldEffects.ts').then(({ViewerFieldEffects})=>{const on=ViewerFieldEffects.prototype.onGroundStep;ViewerFieldEffects.prototype.onGroundStep=function(phase,actor){window.objectMoveGrid=this.grid;return on.call(this,phase,actor);};});});
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PEWTER_CITY_GYM&px=6&py=10',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.evaluate(async()=>{const S=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');const {createMon}=await import('/src/core/pokemon/pokemon.ts');S.save.party[0]=createMon(C.SPECIES_BLASTOISE,40);S.save.party[0].moves[0]=C.MOVE_SURF;S.save.party[0].pp[0]=15;});
 await p.waitForTimeout(4500);
 const {readFileSync}=await import('node:fs');
 const header=JSON.parse(readFileSync('public/fr/maps/MAP_PEWTER_CITY_GYM.json','utf8'));
 const liam=header.objects.find(o=>o.scriptName?.endsWith('_Liam'));
 if(!liam)throw Error('Missing source trainer');
 const npc=p.locator(`.world-npc[data-map="${header.id}"][data-local-id="${liam.localId}"]`);
 const pose=()=>npc.evaluate(el=>{const map=document.querySelector(`.map[data-map="${el.dataset.map}"]`);return {x:(parseFloat(el.style.left)-parseFloat(map.style.left)+Math.max(0,parseFloat(el.style.width)-16)/2)/16,y:(parseFloat(el.style.top)-parseFloat(map.style.top)+parseFloat(el.style.height)-16)/16,flip:el.style.transform};});
 const pos=()=>p.evaluate(()=>{const h=new URLSearchParams(location.hash.slice(1));return {x:Number(h.get('px')),y:Number(h.get('py'))};});
 const press=async(key,ms=200)=>{await p.keyboard.down(key);await p.waitForTimeout(ms);await p.keyboard.up(key);await p.waitForTimeout(600);};
 await p.locator('#viewport').focus();
 for(let i=0;i<6&&!await p.locator('#engine-interaction').isVisible();i++)await press('ArrowUp');
 await p.locator('#engine-interaction').waitFor({state:'visible'});
 for(let i=0;i<180&&await p.locator('#engine-interaction').isVisible();i++)await press('z',100);
 await p.locator('#engine-interaction').waitFor({state:'hidden'});
 await npc.waitFor({state:'visible'});
 const after=await pose(),player=await pos();
 const money=await p.evaluate(async()=>(await import('/src/games/firered/save.ts')).save.money);
 if(money<=3000||after.x!==player.x-1||after.y!==player.y||after.x===liam.x)throw Error('Approach not reflected '+JSON.stringify({after,player,liam,money}));
 // A subsequent source menu must hydrate the moved object rather than reset it.
 await p.locator('#explore-game-menu').click();await p.locator('#engine-interaction').waitFor({state:'visible'});await p.waitForTimeout(2000);
 await press('x',100);await p.locator('#engine-interaction').waitFor({state:'hidden'});
 const afterMenu=await pose();if(JSON.stringify(afterMenu)!==JSON.stringify(after))throw Error('Menu reset trainer pose '+JSON.stringify({after,afterMenu}));
 await p.locator('#viewport').focus();await press('ArrowLeft');
 if(JSON.stringify(await pos())!==JSON.stringify(player))throw Error('Moved trainer failed to block its destination tile');
 // Observe the actual grid to plan around the gym rocks; inputs still walk the
 // route. A stale occupied old tile produces no route and must fail the check.
 const layout=JSON.parse(readFileSync(`public/fr/layouts/${header.layout}.json`,'utf8'));
 const path=await p.evaluate(({start,target,width,height})=>{
  const grid=window.objectMoveGrid,queue=[{...start,path:[]}],seen=new Set([`${start.x},${start.y}`]);
  if(!grid)throw Error('No observed field grid');
  for(let i=0;i<queue.length;i++){const at=queue[i];if(at.x===target.x&&at.y===target.y)return at.path;
   for(const [dx,dy,key] of [[0,1,'ArrowDown'],[-1,0,'ArrowLeft'],[0,-1,'ArrowUp'],[1,0,'ArrowRight']]){
    const x=at.x+dx,y=at.y+dy,k=`${x},${y}`;
    if(x<0||y<0||x>=width||y>=height||seen.has(k)||!grid.isWalkable(x,y,'walk'))continue;
    seen.add(k);queue.push({x,y,path:[...at.path,key]});
   }
  }return null;
 },{start:await pos(),target:{x:liam.x,y:liam.y},width:layout.width,height:layout.height});
 if(!path)throw Error('Old trainer tile inaccessible in observed collision grid');
 for(const key of path)await press(key);
 const oldTile=await pos();
 if(oldTile.x!==liam.x||oldTile.y!==liam.y)throw Error('Old trainer tile remained occupied '+JSON.stringify({oldTile,liam}));
 return {source:{x:liam.x,y:liam.y},after,afterMenu,oldTile,path,money,prepared:'URL/team/move; no movement, victory or reward prepared',errors:ctx.errors()};
}
