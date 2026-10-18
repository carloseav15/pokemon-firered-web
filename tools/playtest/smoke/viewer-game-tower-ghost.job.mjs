// PREPARED: Pokémon Tower 3F URL start in the west corridor (out of the
// Channelers' sight) and, for the second case, the Silph Scope in the bag.
// Wild encounters there go through battle_setup.c StartWildBattle:
// CheckSilphScopeInPokemonTower → DoGhostBattle (BATTLE_TYPE_GHOST, enemy
// nicknamed GHOST) without the Scope; with it, a normal wild battle with the
// real species (Gastly/Haunter/Cubone). The player runs from each battle.
// Run with PW_TIMEOUT_MS=580000.
const BASE=process.env.PW_BASE??'http://localhost:5173';
export default async function run(ctx){
 const p=ctx.page, out={};
 const visible=()=>p.locator('#engine-interaction').isVisible();
 const battle=()=>p.evaluate(async()=>{const C=await import('/src/games/firered/generated/constants.ts');const {G,gBattlerControllerFuncs}=await import('/src/core/battle/globals.ts');const {gEnemyParty}=await import('/src/core/pokemon/mon.ts');const {gMain}=await import('/src/core/hw/runtime.ts');
  const e=gEnemyParty[0];return {inBattle:Boolean(gMain.inBattle),ghost:(G.gBattleTypeFlags&C.BATTLE_TYPE_GHOST)!==0,unveiled:(G.gBattleTypeFlags&C.BATTLE_TYPE_GHOST_UNVEILED)!==0,species:e?.species,nickname:e?Array.from(e.nickname??[]).slice(0,6):null,ready:gBattlerControllerFuncs[0]?.name==='HandleInputChooseAction'};});
 const press=async(k,ms=450)=>{await p.keyboard.press(k);await p.waitForTimeout(ms);};
 const encounter=async(label,scope)=>{
  await p.goto(new URL('viewer.html#modo=explore&mapa=MAP_POKEMON_TOWER_3F&px=5&py=11',BASE).href);await p.reload();
  await p.waitForFunction(()=>performance.getEntriesByName('viewer-interactive').length);
  if(scope)await p.evaluate(async()=>{const {addBagItem}=await import('/src/core/pokemon/items.ts');const C=await import('/src/games/firered/generated/constants.ts');addBagItem(C.ITEM_SILPH_SCOPE,1);});
  await p.waitForTimeout(5000);await p.locator('#viewport').focus();
  let steps=0;
  for(;steps<600&&!await visible();steps++){const k=(steps>>2)%2?'ArrowUp':'ArrowDown';await p.keyboard.down(k);await p.waitForTimeout(150);await p.keyboard.up(k);await p.waitForTimeout(250);}
  if(!await visible())throw Error(label+': no encounter');
  let b;for(let i=0;i<120;i++){b=await battle();if(b.inBattle&&b.ready)break;await press('z',500);}
  if(!b?.ready){await ctx.shot('stuck-'+label);throw Error(label+': no action menu '+JSON.stringify(b));}
  await ctx.shot(label);
  // RUN is the bottom-right action.
  await press('ArrowDown');await press('ArrowRight');await press('z',1200);
  for(let i=0;i<60&&await visible();i++)await press('z',500);
  if(await visible())throw Error(label+': battle did not end');
  return {steps,...b};
 };
 // gText_Ghost in the charmap ("GHOST").
 const GHOST=[0xC1,0xC2,0xC9,0xCD,0xCE,0xFF];
 out.noScope=await encounter('ghost',false);
 if(!out.noScope.ghost||out.noScope.unveiled||JSON.stringify(out.noScope.nickname)!==JSON.stringify(GHOST))throw Error('Not a ghost battle '+JSON.stringify(out.noScope));
 out.scope=await encounter('scope',true);
 if(out.scope.ghost||![92,93,104].includes(out.scope.species))throw Error('Silph Scope battle not normal '+JSON.stringify(out.scope));
 return {...out,errors:ctx.errors()};
}
