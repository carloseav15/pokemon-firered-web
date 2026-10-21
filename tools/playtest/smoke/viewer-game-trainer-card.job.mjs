// PREPARED: Viridian Center URL start; the Boulder Badge flag and 12345 money are
// explicit preconditions so the card has data to show. The card is opened from
// the source start menu (PLAYER) and driven with keys through trainer_card.c
// Task_TrainerCard: A flips to the back, B flips to the front, B closes and
// returns to the start menu. Screenshots of both sides are for review. Play
// time must advance while exploring and in the engine, and survive save/reload.
// Run with PW_TIMEOUT_MS=300000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
const FRONT=10, BACK=11; // STATE_HANDLE_INPUT_FRONT / STATE_HANDLE_INPUT_BACK
export default async function run(ctx){
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F&px=7&py=6',BASE).href);
 await p.reload();
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.evaluate(async()=>{const s=await import('/src/games/firered/save.ts');s.flagSet(2080);s.save.money=12345;});
 await p.waitForTimeout(6000);
 const card=()=>p.evaluate(async()=>{const {GetTrainerCardMainState}=await import('/src/core/menus/trainerCard.ts');const {tasks}=await import('/src/core/gba/tasks.ts');let st=-1;try{st=GetTrainerCardMainState();}catch{}return {state:st,tasks:tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name)};});
 const waitFor=async(label,pred)=>{for(let i=0;i<60;i++){const s=await card();if(pred(s)){await p.waitForTimeout(500);return s;}await p.waitForTimeout(250);}await ctx.shot('stuck-'+label);throw Error('stuck '+label+' '+JSON.stringify(await card()));};
 const press=async(k)=>{await p.keyboard.down(k);await p.waitForTimeout(100);await p.keyboard.up(k);await p.waitForTimeout(400);};
 // Play time runs during exploration (viewer clock) and inside the engine.
 const frames=()=>p.evaluate(async()=>(await import('/src/games/firered/save.ts')).save.playTimeFrames);
 const t0=await frames();await p.waitForTimeout(3000);const t1=await frames();
 if(t1-t0<120)throw Error('Play time not counting during exploration '+t0+'→'+t1);
 await p.locator('#viewport').focus();
 await press('Enter');
 await waitFor('start',s=>s.tasks.includes('startInput'));
 for(let i=0;i<3;i++)await press('ArrowDown');                     // POKEDEX..PLAYER
 await press('z');
 await waitFor('front',s=>s.tasks.includes('Task_TrainerCard')&&s.state===FRONT);
 await ctx.shot('card-front');
 await press('z');
 await waitFor('back',s=>s.state===BACK);
 await ctx.shot('card-back');
 await press('x');
 await waitFor('front-again',s=>s.state===FRONT);
 await press('x');
 await waitFor('closed',s=>!s.tasks.includes('Task_TrainerCard')&&s.tasks.includes('startInput'));
 await press('x');
 await p.locator('#engine-interaction').waitFor({state:'hidden',timeout:10000});
 const t2=await frames();
 if(t2<=t1)throw Error('Play time not counting in the engine '+t1+'→'+t2);
 await p.getByRole('button',{name:"Menu · Esc"}).click();await p.locator('#explore-save').click();await p.keyboard.press('Escape');
 await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 const t3=await frames();
 if(t3<t2)throw Error('Play time not persisted '+t2+'→'+t3);
 return {playTime:{t0,t1,t2,t3},errors:ctx.errors()};
}
