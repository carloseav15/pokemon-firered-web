// PREPARED injuries, PP and stock are inputs only. All healing, switching and
// attacks go through the game's real menus; no outcome or save is fabricated.
export default async function(ctx) {
  await ctx.loadSave('mtmoon-1f');
  const battle = await ctx.runEval(`
    const sv=frDebug.save.save,C=H.C;
    [sv.party[0],sv.party[1]]=[sv.party[1],sv.party[0]];
    const lead=sv.party[0],reserve=sv.party[1];
    lead.hp=lead.stats[0];
    lead.moves.forEach((id,i)=>{if(H.rom.moves[id]?.power>1)lead.pp[i]=0;});
    reserve.hp=Math.floor(reserve.stats[0]/2);
    sv.bag.items=[{item:C.ITEM_POTION,quantity:1}];
    const identity=[reserve.personality,reserve.otId],hp0=reserve.hp,max=reserve.stats[0];
    const prepared={party:H.resources().party,items:[...sv.bag.items]};
    for(let i=0;i<200&&!H.inBattle();i++)await frDebug.walk(i%2?'D':'U',1);
    if(!H.inBattle())throw new Error('no cave encounter');
    if(!await H.until(()=>H.G.gBattlerControllerFuncs[0]?.name==='HandleInputChooseAction','A',300))throw new Error('action menu missing');
    // PREPARED stock variation at the same real action menu: without medicine
    // the unhealthy reserve must not be treated as recovered or switched in.
    sv.bag.items=[];
    const unavailable=H.battleDecision();
    if(unavailable.action!=='run'||unavailable.reason!=='resources exhausted in wild battle')throw new Error('missing medicine bypassed resource guard: '+JSON.stringify(unavailable));
    sv.bag.items=[{item:C.ITEM_POTION,quantity:1}];
    const b=await H.battle('auto',0,500);
    const index=b.trace.findIndex(t=>t.action==='item'&&t.reason==='recover attacking reserve');
    const medicine=b.trace[index];
    if(index<0||medicine.personality!==identity[0]||medicine.otId!==identity[1]||!medicine.used?.ok)throw new Error('reserve medicine missing: '+JSON.stringify(b));
    if(medicine.used.after.party[1].hp!==Math.min(max,hp0+20)||H.countItem(C.ITEM_POTION)!==0)throw new Error('wrong reserve healing/consumption');
    const switchIndex=b.trace.findIndex((t,i)=>i>index&&t.action==='switch'&&t.personality===identity[0]);
    if(switchIndex<0||!b.trace.some((t,i)=>i>switchIndex&&t.action==='move'&&t.active===1))throw new Error('healed reserve never switched/attacked: '+JSON.stringify(b));
    const escape=H.inBattle()?await H.battle('run',0,1000):null;
    if(escape&&(escape.stuck||escape.outcome!==C.B_OUTCOME_RAN))throw new Error('diagnostic escape failed');
    return {prepared,unavailable,b,escape,limits:['recovery, switch and attack; no route or trainer victory claim']};
  `);
  await ctx.loadSave('pewter-pc');
  const nurse = await ctx.runEval(`
    const sv=frDebug.save.save,results=[];
    for(const speed of [0,1,2]) {
      // PREPARED multi-member damage, poison and used PP at each text speed.
      sv.options.textSpeed=speed;
      const expected=sv.party.filter(m=>m.species).map(m=>({hp:m.stats[0],pp:m.moves.map((id,i)=>id?H.rom.moves[id].pp+Math.floor(H.rom.moves[id].pp*20*((m.ppBonuses>>(i*2))&3)/100):0)}));
      for(const m of sv.party.filter(m=>m.species)){m.hp=Math.max(1,m.hp-5);m.status=H.C.STATUS1_POISON;m.pp=m.pp.map(p=>Math.max(0,p-1));}
      const r=await H.heal({leave:false});
      if(!r.ok||!H.fieldFree())throw new Error('nurse speed '+speed+': '+JSON.stringify(r));
      sv.party.filter(m=>m.species).forEach((m,i)=>{if(m.hp!==expected[i].hp||m.status||JSON.stringify(m.pp)!==JSON.stringify(expected[i].pp))throw new Error('incomplete multi-member cure');});
      results.push({speed,result:r});
    }
    const exit=await H.heal();
    const wrongMap=await H.heal({leave:false});
    if(!exit.ok||wrongMap.ok||wrongMap.note!=='not a standard pokemon center')throw new Error('nurse failed exit/map guard');
    return {results,exit,wrongMap};
  `);
  if(ctx.errors().length)throw new Error(ctx.errors().join('; '));
  return {battle,nurse};
}
