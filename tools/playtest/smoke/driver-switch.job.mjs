export default async function(ctx) {
  await ctx.loadSave('mtmoon-1f');
  const result=await ctx.runEval(`
    const sv=frDebug.save.save,C=H.C;
    // PREPARED input: vulnerable Ivysaur lead, healthy Pidgey reserve, no medicine.
    // This tests an actual voluntary switch; no outcome/foe/damage is prepared.
    [sv.party[0],sv.party[1]]=[sv.party[1],sv.party[0]];
    sv.party[0].hp=10;sv.bag.items=[];
    const prepared={party:H.party(),items:[],order:'Ivysaur,Pidgey'};
    for(let i=0;i<200&&!H.inBattle();i++)await frDebug.walk(i%2?'D':'U',1);
    if(!H.inBattle())throw new Error('no cave encounter');
    const b=await H.battle('auto',0,500);
    if(!b.trace.some(t=>t.action==='switch'&&t.target===1))throw new Error('no voluntary switch: '+JSON.stringify(b));
    if(!b.trace.some(t=>t.action==='move'&&t.active===1))throw new Error('replacement never fought: '+JSON.stringify(b));
    let medicineAfterSwitch=null;
    if(H.inBattle()) {
      if(!await H.until(()=>H.G.gBattlerControllerFuncs[0]?.name==='HandleInputChooseAction','B',300))throw new Error('no action after switch test');
      // PREPARED additional medical input after the real switch: injury and one Potion.
      const active=H.G.gBattleMons[0],slot=sv.party.findIndex(m=>m.personality===active.personality);
      const other=sv.party.find(m=>m.personality!==active.personality),otherHp=other.hp;
      sv.party[slot].hp=6;active.hp=6;sv.bag.items.push({item:C.ITEM_POTION,quantity:1});
      medicineAfterSwitch=await H.useItem(C.ITEM_POTION,slot,{battle:true});
      if(!medicineAfterSwitch.ok||other.hp!==otherHp||H.countItem(C.ITEM_POTION)!==0)throw new Error('medicine after switch failed: '+JSON.stringify(medicineAfterSwitch));
    }
    // This case asserts the switch and a real attack, not victory of a weak prepared team.
    const escape=H.inBattle()?await H.battle('run',0,1000):null;
    if(escape && (escape.stuck||escape.outcome!==C.B_OUTCOME_RAN))throw new Error('diagnostic could not escape: '+JSON.stringify({flags:H.G.G.gBattleTypeFlags,escape,state:H.st()}));
    return {prepared,medicalInputAfterSwitch:{hp:6,potions:1},b,medicineAfterSwitch,escape,limits:['switch and attack only; no victory claim']};
  `);
  if(ctx.errors().length)throw new Error(ctx.errors().join('; '));
  return result;
}
