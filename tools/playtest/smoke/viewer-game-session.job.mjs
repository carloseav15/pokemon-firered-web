// PREPARED: URL starts at Viridian's nurse counter; initial injury is an explicit
// precondition, never a prepared heal/purchase result. All interactions use keys.
export default async function run(ctx) {
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F&px=7&py=4',process.env.PW_BASE??'http://127.0.0.1:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const snapshot=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return JSON.parse(JSON.stringify(save));});
 if(process.env.PW_CHARACTER==='leaf'){
  await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-character').selectOption('leaf');await p.keyboard.press('Escape');
 }
 let s=await snapshot();const initial=structuredClone(s);
 if(s.party.length!==1||![1,4,7,25].includes(s.party[0].species)||s.party[0].level!==5||s.money!==3000||s.bag.pokeBalls[0]?.quantity!==5)throw Error('Temporary start mismatch');
 await p.getByRole('button',{name:"Menu · Esc"}).click();
 if(await p.locator('#explore-party').count())throw Error('Provisional party/bag list still present');
 await p.getByRole('button',{name:"Save game",exact:true}).click();
 if(!await p.locator('#explore-save-result').innerText().then(t=>t.includes("saved")))throw Error('Save failed');
 await p.keyboard.press('Escape');
 await p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');save.party[0].hp=1;save.party[0].status=8;save.party[0].pp.fill(0);});
 const worldBefore=await p.evaluate(()=>({maps:[...document.querySelectorAll('.map')].map(e=>e.dataset.map),scroll:[document.querySelector('#viewport').scrollLeft,document.querySelector('#viewport').scrollTop]}));
 await p.locator('#viewport').focus(); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(400); await p.keyboard.press('z');
 await p.locator('#engine-interaction').waitFor({state:'visible'});
 await p.waitForFunction(()=>document.querySelector('#engine-interaction')?.dataset.scriptActive==='true',{timeout:20000});
 await p.waitForTimeout(3000);
 const native=await p.evaluate(()=>({tag:document.querySelector('#engine-interaction').tagName,maps:[...document.querySelectorAll('.map')].map(e=>e.dataset.map),scroll:[document.querySelector('#viewport').scrollLeft,document.querySelector('#viewport').scrollTop],sprites:!!document.querySelector('#interaction-sprites')}));
 if(native.tag==='DIALOG'||!native.sprites||JSON.stringify(native.maps)!==JSON.stringify(worldBefore.maps)||JSON.stringify(native.scroll)!==JSON.stringify(worldBefore.scroll))throw Error('Interaction replaced the world '+JSON.stringify(native));
 await p.getByRole('button',{name:"Menu · Esc"}).click();
 if(await p.locator('#explore-menu').evaluate(e=>e.open))throw Error('Exploration menu opened during NPC interaction');
 await ctx.shot('nurse-dialog');
 // Source MULTICHOICE_YES_NO: default YES; give text printer time, then accept.
 await p.keyboard.press('z'); await p.waitForTimeout(1000); await p.keyboard.press('z');
 for(let i=0;i<16;i++){await p.waitForTimeout(700);await p.keyboard.press('z');if((await snapshot()).party[0].hp>1)break;}
 await ctx.shot('after-heal');
 s=await snapshot();if(s.party[0].hp!==s.party[0].stats[0]||s.party[0].status!==0||JSON.stringify(s.party[0].pp)!==JSON.stringify(initial.party[0].pp))throw Error('Nurse did not heal '+JSON.stringify(s.party[0]));
 for(let i=0;i<60;i++){if(await p.locator('#engine-interaction').getAttribute('data-script-active')==='false')break;await p.keyboard.press('z');await p.waitForTimeout(500);}
 await ctx.shot('before-return'); await p.locator('#engine-interaction').waitFor({state:'hidden'});
 await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-continue').click();
 await p.waitForTimeout(1500);
 s=await snapshot();if(s.party[0].hp!==s.party[0].stats[0])throw Error('Saved initial hp mismatch');
 await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 s=await snapshot();if(s.money!==3000||JSON.stringify(s.party)!==JSON.stringify(initial.party)||s.bag.pokeBalls[0]?.quantity!==5)throw Error('Continue mismatch');
 return {provisionalPartyBagList:'removed',healing:'source NPC bytecode; injury PREPARED',saveContinue:'PASS',errors:ctx.errors()};
}
