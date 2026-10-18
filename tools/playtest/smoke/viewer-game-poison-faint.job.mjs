// PREPARED: Route 1 path start (no grass); the poisoned lead with 2 HP, and in the
// first case a healthy second party member, are explicit preconditions.
// field_poison.c DoPoisonFieldEffect lowers HP on real steps; at 0 HP
// EventScript_FieldPoison runs TryFieldPoisonWhiteOut: the fainted mon loses
// its poison status ("fainted" message) and, only if no mon can fight, the
// script continues to EventScript_FieldWhiteOut (money loss, respawn, heal).
// Run with PW_TIMEOUT_MS=300000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
export default async function run(ctx){
 const p=ctx.page;
 const open=async(withPartner)=>{
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE1&px=14&py=-11',BASE).href);await p.reload();
  await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
  await p.evaluate(async(partner)=>{const {save}=await import('/src/games/firered/save.ts');const {createMon}=await import('/src/core/pokemon/pokemon.ts');
   save.party[0].status=8;save.party[0].hp=2;if(partner)save.party.push(createMon(16,7));},withPartner);
  await p.waitForTimeout(6000);await p.locator('#viewport').focus();
 };
 const snap=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');return JSON.parse(JSON.stringify({party:save.party.map(m=>({hp:m.hp,max:m.stats[0],status:m.status,friendship:m.friendship})),money:save.money,map:document.querySelector('#explore-location')?.textContent}));});
 const visible=()=>p.locator('#engine-interaction').isVisible();
 const hold=async(k,ms=420)=>{await p.keyboard.down(k);await p.waitForTimeout(ms);await p.keyboard.up(k);await p.waitForTimeout(150);};
 const walkUntilScript=async(label)=>{for(let i=0;i<24;i++){await hold(i%2?'ArrowUp':'ArrowDown');if(await visible())return i+1;}throw Error(label+': poison script did not start '+JSON.stringify(await snap()));};
 const finish=async(label)=>{await p.waitForTimeout(1500);await ctx.shot(label);for(let i=0;i<240&&await visible();i++){await p.keyboard.press('z');await p.waitForTimeout(500);}if(await visible())throw Error(label+': script did not end');await p.waitForTimeout(3000);};

 // 1. Lead faints from poison, the partner can fight: no white-out.
 await open(true);
 const before1=await snap();
 const steps1=await walkUntilScript('partner');
 await finish('fainted-with-partner');
 const after1=await snap();
 const lead=after1.party[0];
 if(lead.hp!==0||lead.status!==0)throw Error('Lead did not faint/lose poison '+JSON.stringify(after1));
 if(after1.map!=='Route1'||after1.money!==before1.money||after1.party[1].hp!==after1.party[1].max)throw Error('Unexpected white-out with a healthy partner '+JSON.stringify(after1));
 if(lead.friendship>=before1.party[0].friendship&&before1.party[0].friendship>0)throw Error('FRIENDSHIP_EVENT_FAINT_OUTSIDE_BATTLE not applied '+before1.party[0].friendship+'→'+lead.friendship);

 // 2. The only mon faints from poison: field white-out.
 await open(false);
 const before2=await snap();
 const steps2=await walkUntilScript('alone');
 await finish('fainted-alone');
 const after2=await snap();
 if(after2.map==='Route1'||after2.party[0].hp!==after2.party[0].max||after2.party[0].status!==0||after2.money>=before2.money)throw Error('Field white-out did not happen '+JSON.stringify(after2));
 return {steps1,steps2,after1:after1.party,whiteOut:{map:after2.map,money:[before2.money,after2.money]},errors:ctx.errors()};
}
