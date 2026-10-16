// PREPARED: URL start at the Viridian Pokémon Center; the save slot is cleared first.
// SAVE from the source start menu must write the viewer slot with its checkpoint.
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F&px=7&py=6','http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.evaluate(()=>localStorage.removeItem('firered-viewer-game-v1'));
 const tap=async k=>{await p.keyboard.press(k);await p.waitForTimeout(800);};
 await p.locator('#viewport').focus();await tap('Enter');await p.waitForTimeout(1500);
 for(let i=0;i<4;i++)await tap('ArrowDown');
 await tap('z');await p.waitForTimeout(2500);await ctx.shot('save-ask');
 await tap('z');await p.waitForTimeout(1500);await ctx.shot('save-yes');
 for(let i=0;i<10;i++){await p.waitForTimeout(700);if(await p.evaluate(()=>!!localStorage.getItem('firered-viewer-game-v1')))break;await p.keyboard.press('z');}
 await p.waitForTimeout(1500);
 for(let i=0;i<10;i++){if(await p.locator('#engine-interaction').isHidden())break;await tap('z');}
 const v=await p.evaluate(()=>{const s=localStorage.getItem('firered-viewer-game-v1');return s?{len:s.length,nav:JSON.parse(s).viewerNavigation}:null;});
 if(!v||v.nav?.mapId!=='MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F')throw Error('Start-menu save missing '+JSON.stringify(v));
 return {saved:v.len,checkpoint:v.nav.mapId,errors:ctx.errors()};
}
