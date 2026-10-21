// PREPARED: Seafoam Islands 1F URL start below boulder 1, the Rainbow Badge and
// Strength on the lead, and the boulder flags Route20_OnTransition sets
// (1F boulders shown, B1F boulders hidden); the viewer only runs Pokémon Center
// transition scripts, so that story script is replaced by this precondition.
// Strength is activated by the source EventScript_StrengthBoulder; four pushes
// up and one push left drop the boulder into the MB_FALL_WARP hole at (21,8):
// field_control_avatar.c HandleBoulderFallThroughHole hides it on 1F and clears
// its reveal flag (FLAG_HIDE_SEAFOAM_B1F_BOULDER_1), so it appears on B1F.
// Run with PW_TIMEOUT_MS=300000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
export default async function run(ctx){
 const p=ctx.page;
 const hold=async(k,ms=130)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);await p.waitForTimeout(700);};
 const flags=()=>p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');
  return {strength:s.flagGet(C.FLAG_SYS_USE_STRENGTH),hide1F:s.flagGet(C.FLAG_HIDE_SEAFOAM_1F_BOULDER_1),hideB1F:s.flagGet(C.FLAG_HIDE_SEAFOAM_B1F_BOULDER_1)};});
 const boulder=(map)=>p.evaluate((m)=>{const el=document.querySelector(`.world-npc[data-map="${m}"][data-local-id="1"]`);return el?{left:el.style.left,top:el.style.top,hidden:el.classList.contains('hidden')||el.style.display==='none'}:null;},map);
 const pos=()=>p.evaluate(()=>location.hash.match(/px=(-?\d+)&py=(-?\d+)/)?.slice(1).join(','));

 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_SEAFOAM_ISLANDS_1F&px=22&py=13',BASE).href);await p.reload();
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');
  s.flagSet(C.FLAG_BADGE04_GET);s.save.party[0].moves[0]=C.MOVE_STRENGTH;s.save.party[0].pp[0]=15;
  s.flagClear(C.FLAG_HIDE_SEAFOAM_1F_BOULDER_1);s.flagSet(C.FLAG_HIDE_SEAFOAM_B1F_BOULDER_1);});
 await p.waitForTimeout(6000);await p.locator('#viewport').focus();
 const start={pos:await pos(),boulder:await boulder('MAP_SEAFOAM_ISLANDS_1F'),flags:await flags()};
 if(start.pos!=='22,13'||!start.boulder||start.boulder.hidden)throw Error('Bad start '+JSON.stringify(start));

 await hold('ArrowUp');await hold('z');
 await p.locator('#engine-interaction').waitFor({state:'visible',timeout:8000});
 for(let i=0;i<120&&await p.locator('#engine-interaction').isVisible();i++){await hold('z',100);}
 await p.locator('#engine-interaction').waitFor({state:'hidden',timeout:15000});
 if(!(await flags()).strength)throw Error('Strength not activated');

 await p.locator('#viewport').focus();
 // Each push moves boulder and player one tile; a press during the push animation is dropped.
 for(let i=0;i<8&&await pos()!=='22,9';i++){await hold('ArrowUp',300);await p.waitForTimeout(700);}
 const afterUp={pos:await pos(),boulder:await boulder('MAP_SEAFOAM_ISLANDS_1F')};
 if(afterUp.pos!=='22,9')throw Error('Push up sequence ended at '+JSON.stringify(afterUp));
 await ctx.shot('boulder-at-row-8');
 await hold('ArrowRight',300);await hold('ArrowUp',300);
 if(await pos()!=='23,8')throw Error('Could not get beside the boulder: '+await pos());
 await hold('ArrowLeft',300);await p.waitForTimeout(2500);
 await ctx.shot('after-fall');
 const after={pos:await pos(),boulder:await boulder('MAP_SEAFOAM_ISLANDS_1F'),flags:await flags()};
 if(!after.flags.hide1F||after.flags.hideB1F)throw Error('Boulder did not fall through the hole '+JSON.stringify(after));
 if(after.boulder&&!after.boulder.hidden)throw Error('Fallen boulder still shown on 1F '+JSON.stringify(after));

 // Save and open B1F: the revealed boulder is there, and 1F stays without it.
 await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-save').click();await p.keyboard.press('Escape');
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_SEAFOAM_ISLANDS_B1F&px=22&py=10',BASE).href);await p.reload();
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);await p.waitForTimeout(3000);
 const b1f=await boulder('MAP_SEAFOAM_ISLANDS_B1F');
 await ctx.shot('b1f');
 if(!b1f||b1f.hidden)throw Error('Boulder not revealed on B1F '+JSON.stringify(b1f));
 return {start,afterUp,after,b1f,errors:ctx.errors()};
}
