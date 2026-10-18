// PREPARED: Route 1 path URL start (no precondition on the party).
// Every option is changed in the source option menu (option_menu.c:
// OptionMenu_ProcessInput, counts {3,2,2,2,3,10}) and closed with B, which runs
// CloseAndSaveOptionMenu. Checked: save.options, the live copies the port keeps
// (text speed, button mode), persistence after save/reload, and that the next
// wild battle reads battle scene/style from the save (battle_main.c).
// Run with PW_TIMEOUT_MS=300000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
// [right presses per item in menu order]: text speed, scene, style, sound, button mode, frame.
const RIGHTS=[1,1,1,1,2,3];
const EXPECTED={textSpeed:2,battleScene:false,battleStyle:1,sound:1,buttonMode:2,frameType:3};
export default async function run(ctx){
 const p=ctx.page;
 const open=async()=>{await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE1&px=14&py=-11',BASE).href);await p.reload();await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);await p.waitForTimeout(6000);};
 const live=()=>p.evaluate(async()=>{const {save}=await import('/src/games/firered/save.ts');const {textOptions}=await import('/src/core/gba/textPrinter.ts');const {joy}=await import('/src/core/gba/input.ts');return {options:JSON.parse(JSON.stringify(save.options)),textSpeed:textOptions.speed,buttonMode:joy.buttonMode};});
 const state=()=>p.evaluate(async()=>{const {gMain}=await import('/src/core/hw/runtime.ts');const {tasks}=await import('/src/core/gba/tasks.ts');return {cb2:gMain.callback2?.name??'',tasks:tasks.tasks.filter(t=>t.isActive).map(t=>t.func.name)};});
 const waitFor=async(label,pred)=>{for(let i=0;i<60;i++){const s=await state();if(pred(s)){await p.waitForTimeout(400);return s;}await p.waitForTimeout(300);}await ctx.shot('stuck-'+label);throw Error('stuck '+label+' '+JSON.stringify(await state()));};
 const press=async(k)=>{await p.keyboard.down(k);await p.waitForTimeout(100);await p.keyboard.up(k);await p.waitForTimeout(450);};
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

 await open();
 const initial=await live();
 await p.locator('#viewport').focus();
 await press('Enter');
 await waitFor('start',s=>s.tasks.includes('startInput'));
 for(let i=0;i<5;i++)await press('ArrowDown');                     // POKEDEX..OPTION
 await press('z');
 await waitFor('option',s=>s.tasks.some(t=>t.includes('Option')));
 await p.waitForTimeout(800);
 for(const n of RIGHTS){for(let i=0;i<n;i++)await press('ArrowRight');await press('ArrowDown');}
 await ctx.shot('options-changed');
 await press('x');
 await waitFor('start2',s=>s.tasks.includes('startInput'));
 const changed=await live();
 await press('x');await p.locator('#engine-interaction').waitFor({state:'hidden',timeout:10000});
 if(!same(changed.options,EXPECTED))throw Error('Options not saved as chosen '+JSON.stringify({initial,changed}));
 if(changed.textSpeed!==2||changed.buttonMode!==2)throw Error('Live option copies not updated '+JSON.stringify(changed));

 await p.getByRole('button',{name:'Menú · Esc'}).click();await p.locator('#explore-save').click();await p.keyboard.press('Escape');
 await open();
 // The live copies follow the save once the engine runs a frame (Game.frame).
 await p.locator('#viewport').focus();await press('Enter');
 await waitFor('start-reload',s=>s.tasks.includes('startInput'));
 const persisted=await live();
 await press('x');await p.locator('#engine-interaction').waitFor({state:'hidden',timeout:10000});
 if(!same(persisted.options,EXPECTED)||persisted.textSpeed!==2||persisted.buttonMode!==2)throw Error('Options not persisted '+JSON.stringify(persisted));

 // Next wild battle reads the scene/style options at battle start.
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_ROUTE1&px=14&py=-14',BASE).href);await p.reload();
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);await p.waitForTimeout(3000);
 await p.locator('#viewport').focus();
 const visible=()=>p.locator('#engine-interaction').isVisible();
 for(let s=0;s<400&&!await visible();s++){const k=(s>>2)%2?'ArrowUp':'ArrowDown';await p.keyboard.down(k);await p.waitForTimeout(150);await p.keyboard.up(k);await p.waitForTimeout(320);}
 if(!await visible())throw Error('No encounter');
 await waitFor('battle',s=>s.cb2==='BattleMainCB2');
 const battle=await p.evaluate(async()=>{const C=await import('/src/games/firered/generated/constants.ts');const {G,gBattleScripting}=await import('/src/core/battle/globals.ts');return {noAnims:(G.gHitMarker&C.HITMARKER_NO_ANIMATIONS)!==0,battleStyle:gBattleScripting.battleStyle};});
 if(!battle.noAnims||battle.battleStyle!==1)throw Error('Battle did not read options '+JSON.stringify(battle));
 return {initial:initial.options,persisted:persisted.options,battle,errors:ctx.errors()};
}
