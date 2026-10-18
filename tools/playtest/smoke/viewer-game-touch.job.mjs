// PREPARED: touch controls enabled through the saved explore preference (the
// default on coarse-pointer devices), URL starts in Pallet Town, at Viridian's
// nurse counter and in Route 1 grass with a 1 HP lead for the battle. No
// keyboard is used: every action is a pointer press on the on-screen pad
// (ui/touchPad.ts), which feeds the same key events to the viewer and engine.
// Run with PW_TIMEOUT_MS=580000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
export default async function run(ctx){
 const p=ctx.page;
 await p.setViewportSize({width:812,height:375});
 await p.addInitScript(()=>{try{const k='pokemon-explore-prefs';const v=JSON.parse(localStorage.getItem(k)||'{}');v.touch=true;localStorage.setItem(k,JSON.stringify(v));}catch{}});
 const open=async(hash)=>{await p.goto(new URL('viewer.html#modo=explore&'+hash,BASE).href);await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);await p.waitForTimeout(5000);};
 const center=async(sel)=>{const b=await p.locator(sel).boundingBox();if(!b)throw Error('missing '+sel);return {x:b.x+b.width/2,y:b.y+b.height/2};};
 const tap=async(sel,ms=120)=>{const c=await center(sel);await p.mouse.move(c.x,c.y);await p.mouse.down();await p.waitForTimeout(ms);await p.mouse.up();await p.waitForTimeout(500);};
 const holdDir=async(dir,ms)=>{await tap(`#touch-pad .touch-dpad-${dir}`,ms);};
 const tasks=()=>p.evaluate(async()=>{const {tasks}=await import('/src/core/gba/tasks.ts');return tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name);});
 const pos=()=>p.evaluate(()=>location.hash.match(/px=(-?\d+)&py=(-?\d+)/)?.slice(1).join(','));
 const visible=()=>p.locator('#engine-interaction').isVisible();
 const out={};

 // 1. Pad shown; D-pad walks; START opens the source start menu; B closes it.
 await open('mapa=MAP_PALLET_TOWN&px=12&py=9');
 if(!await p.locator('#touch-pad').isVisible())throw Error('Touch pad hidden');
 await ctx.shot('pad');
 const before=await pos();
 await holdDir('left',1100);
 out.walk={before,after:await pos()};
 if(out.walk.after===before)throw Error('D-pad did not move the player');
 await tap('#touch-pad .touch-start');
 for(let i=0;i<20&&!(await tasks()).includes('startInput');i++)await p.waitForTimeout(250);
 if(!(await tasks()).includes('startInput'))throw Error('START did not open the start menu');
 await ctx.shot('start-menu');
 await tap('#touch-pad .touch-b');
 await p.locator('#engine-interaction').waitFor({state:'hidden',timeout:10000});

 // 2. A talks to the nurse; A answers YES and advances to the heal.
 await open('mapa=MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F&px=7&py=4');
 await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');save.party[0].hp=1;});
 await holdDir('up',200);await tap('#touch-pad .touch-a');
 await p.locator('#engine-interaction').waitFor({state:'visible',timeout:15000});
 for(let i=0;i<60&&await visible();i++)await tap('#touch-pad .touch-a',80);
 const healed=await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return save.party[0].hp===save.party[0].stats[0];});
 if(!healed)throw Error('Nurse heal with A failed');
 out.nurse='healed';

 // 3. A wild battle played with A only ends in a white-out (1 HP lead).
 await open('mapa=MAP_ROUTE1&px=14&py=-14');
 await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');save.party[0].hp=1;});
 let legs=0;for(;legs<80&&!await visible();legs++)await holdDir(legs%2?'up':'down',600);
 if(!await visible())throw Error('No encounter while walking with the D-pad');
 await ctx.shot('battle');
 for(let i=0;i<300&&await visible();i++)await tap('#touch-pad .touch-a',80);
 if(await visible())throw Error('Battle did not end with A presses');
 // The white-out moves the viewer to the respawn house; let it load.
 await p.waitForTimeout(4000);
 out.battle={legs,place:await p.locator('#explore-location').innerText()};
 if(!/PlayersHouse/.test(out.battle.place))throw Error('Not at the respawn point after the white-out '+out.battle.place);
 return {...out,errors:ctx.errors()};
}
