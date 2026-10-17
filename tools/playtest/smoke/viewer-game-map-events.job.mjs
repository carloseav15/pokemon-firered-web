// PREPARED: Pallet house door URL plus temporary/permanent flags and vars as
// explicit inputs. Only the real door warp may perform the observed reset.
export default async function run(ctx) {
 const p=ctx.page;
 await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_PALLET_TOWN_PLAYERS_HOUSE_1F&px=4&py=7',process.env.PW_BASE??'http://localhost:5173').href);
 await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
 await p.waitForTimeout(1500);
 await p.evaluate(async()=>{const S=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');S.flagSet(C.FLAG_TEMP_1);S.varSet(C.TEMP_VARS_START+1,123);S.flagSet(C.FLAG_SYS_USE_STRENGTH);S.flagSet(C.FLAG_BADGE01_GET);S.varSet(C.VAR_MAP_SCENE_PEWTER_CITY,1);});
 const state=()=>p.evaluate(async()=>{const S=await import('/src/games/firered/save.ts');const C=await import('/src/games/firered/generated/constants.ts');const {viewerEventMap}=await import('/src/viewer/mapEvents.ts');return {map:viewerEventMap(),temp:S.flagGet(C.FLAG_TEMP_1),tempVar:S.varGet(C.TEMP_VARS_START+1),strength:S.flagGet(C.FLAG_SYS_USE_STRENGTH),badge:S.flagGet(C.FLAG_BADGE01_GET),scene:S.varGet(C.VAR_MAP_SCENE_PEWTER_CITY)};});
 // Open/close the source menu on the same map. It must keep the input state.
 await p.locator('#explore-game-menu').click();await p.locator('#engine-interaction').waitFor({state:'visible'});await p.waitForTimeout(2000);
 await p.keyboard.press('x');await p.locator('#engine-interaction').waitFor({state:'hidden'});
 const menu=await state();
 if(!menu.temp||menu.tempVar!==123||!menu.strength)throw Error('Menu cleared map temporaries '+JSON.stringify(menu));
 await p.locator('#viewport').focus();
 for(let i=0;i<4;i++){
  if((await state()).map==='MAP_PALLET_TOWN')break;
  await p.keyboard.down('ArrowDown');await p.waitForTimeout(200);await p.keyboard.up('ArrowDown');await p.waitForTimeout(1000);
 }
 await p.waitForFunction(async()=>{const {viewerEventMap}=await import('/src/viewer/mapEvents.ts');return viewerEventMap()==='MAP_PALLET_TOWN';});
 const arrival=await state();
 if(arrival.temp||arrival.tempVar!==0||arrival.strength||!arrival.badge||arrival.scene!==1)throw Error('Wrong warp reset '+JSON.stringify(arrival));
 return {menu,arrival,scope:'real door warp and menu; input flags/vars PREPARED',errors:ctx.errors()};
}
