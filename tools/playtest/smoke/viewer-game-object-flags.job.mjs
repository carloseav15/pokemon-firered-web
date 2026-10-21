// PREPARED: outdoor URL adjacent to Pewter's gym guide; flag mutations below
// deliberately test the generic presence rule, not a simulated Brock victory.
// New-session initial hide flags, actual keyboard collision, reversible visibility,
// save/reload and an interior with a numeric flag are observed independently.
export default async function run(ctx) {
 const p = ctx.page;
 const url = new URL('viewer.html#modo=explore&mapa=MAP_PEWTER_CITY&px=31&py=-180',process.env.PW_BASE??'http://localhost:5173');
 const ready = async () => { await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length); await p.waitForTimeout(1000); };
 await p.goto(url.href); await ready();
 const npc = id => p.locator(`.world-npc[data-map="MAP_PEWTER_CITY"][data-local-id="${id}"]`);
 const position = () => p.evaluate(()=>{const h=new URLSearchParams(location.hash.slice(1));return [Number(h.get('px')),Number(h.get('py'))];});
 const press = async key => {await p.locator('#viewport').focus();await p.keyboard.down(key);await p.waitForTimeout(200);await p.keyboard.up(key);await p.waitForTimeout(700);};
 const expect = (ok,label) => {if(!ok)throw Error(label);};
 await npc(5).waitFor({state:'visible'});
 expect(await npc(7).count()===0,'Running Shoes aide visible before source flag is cleared');
 const initial = await position();
 await press('ArrowLeft');
 expect(JSON.stringify(await position())===JSON.stringify(initial),'Visible guide did not block walking '+JSON.stringify({initial,after:await position()}));
 await p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');s.flagSet(C.FLAG_HIDE_PEWTER_CITY_GYM_GUIDE);s.flagClear(C.FLAG_HIDE_PEWTER_CITY_RUNNING_SHOES_GUY);});
 await npc(5).waitFor({state:'detached'});await npc(7).waitFor({state:'visible'});
 await press('z');
 expect(!await p.locator('dialog[open]').count()&&!await p.locator('#engine-interaction').isVisible(),'Hidden guide remained interactive');
 await press('ArrowLeft');
 expect((await position())[0]===30,'Hidden guide still blocks walking');
 await press('ArrowRight');expect((await position())[0]===31,'Did not return beside guide '+JSON.stringify(await position()));
 await p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');s.flagClear(C.FLAG_HIDE_PEWTER_CITY_GYM_GUIDE);s.flagSet(C.FLAG_HIDE_PEWTER_CITY_RUNNING_SHOES_GUY);});
 await npc(5).waitFor({state:'visible'});await npc(7).waitFor({state:'detached'});
 await press('ArrowLeft');expect((await position())[0]===31,'Restored guide no longer blocks walking');
 // Save the changed state, opposite to the initial flags. Loading an existing
 // save must not reapply the new-session flags and undo this progression input.
 await p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');s.flagSet(C.FLAG_HIDE_PEWTER_CITY_GYM_GUIDE);s.flagClear(C.FLAG_HIDE_PEWTER_CITY_RUNNING_SHOES_GUY);});
 await npc(5).waitFor({state:'detached'});await npc(7).waitFor({state:'visible'});
 await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-save').click();await p.keyboard.press('Escape');
 await p.reload();await ready();
 await npc(7).waitFor({state:'visible'});expect(await npc(5).count()===0,'Save/reload lost changed object flags');
 // Interior templates must be retained while hidden, then appear without reload.
 // PREPARED: hide the real Pewter museum scientist before entering that map.
 const setup = await p.evaluate(async()=>{const {rom}=await import('/src/core/rom.ts');const s=await import('/src/games/firered/save.ts');const h=await rom.loadMap('MAP_PEWTER_CITY_MUSEUM_1F');const o=h.objects.find(o=>!o.clone&&o.flag);if(!o)throw Error('No conditional museum template');s.flagSet(o.flag);return {id:o.localId,flag:o.flag,x:o.x,y:o.y};});
 // Persist test precondition through full navigation; no presence result is prepared.
 await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-save').click();await p.keyboard.press('Escape');
 const interior=new URL(`viewer.html#modo=explore&mapa=MAP_PEWTER_CITY_MUSEUM_1F&px=${setup.x+1}&py=${setup.y}`,url);
 await p.goto(interior.href);await p.reload();await ready();
 const object=p.locator(`.world-npc[data-map="MAP_PEWTER_CITY_MUSEUM_1F"][data-local-id="${setup.id}"]`);
 expect(await object.count()===0,'Hidden interior object rendered');
 await p.evaluate(async flag=>{const s=await import('/src/games/firered/save.ts');s.flagClear(flag);},setup.flag);
 await object.waitFor({state:'visible'});
 await p.evaluate(async flag=>{const s=await import('/src/games/firered/save.ts');s.flagSet(flag);},setup.flag);
 await object.waitFor({state:'detached'});
 return {initialFlags:'source new-session flags',outdoor:'visibility/collision/interaction/reversible/save-reload PASS',interior:{...setup,presence:'hide/show/hide without reload PASS'},prepared:'URL starts and explicit flag inputs; not Brock progression',errors:ctx.errors()};
}
