export default async function(ctx) {
  await ctx.loadSave('route2-north');
  const wild=await ctx.runEval(`
    const C=H.C,sv=frDebug.save.save;
    // PREPARED: injury and medicine stock before the encounter, never a result.
    sv.party[0].hp=12;
    const p=sv.bag.items.find(e=>e.item===C.ITEM_POTION);
    if(p)p.quantity=2;else sv.bag.items.push({item:C.ITEM_POTION,quantity:2});
    const prepared={hp:12,potions:2};
    for(let i=0;i<160&&!H.inBattle();i++) await frDebug.walk(i%2?'D':'U',1);
    if(!H.inBattle())throw new Error('no encounter');
    const b=await H.battle('auto',0,3000);
    if(b.stuck||b.outcome!==C.B_OUTCOME_WON)throw new Error('auto wild failed: '+JSON.stringify(b));
    if(!b.trace.some(t=>t.action==='item'&&t.item===C.ITEM_POTION&&t.used?.ok))throw new Error('no real Potion: '+JSON.stringify(b));
    if(!b.trace.some(t=>t.action==='move'&&t.move===C.MOVE_VINE_WHIP))throw new Error('did not select damaging move');
    return {prepared,b};
  `);
  await ctx.loadSave('gym-camper');
  const trainer=await ctx.runEval(`
    const C=H.C;
    const talk=await H.talk(6,5);
    if(talk.note)throw new Error('cannot reach Brock: '+JSON.stringify(talk));
    for(let i=0;i<120&&!H.inBattle();i++){await frDebug.press('A',4);await frDebug.wait(20);}
    if(!H.inBattle())throw new Error('Brock never started');
    const b=await H.battle('auto',0,4000);
    if(b.stuck||b.outcome!==C.B_OUTCOME_WON)throw new Error('auto Brock failed: '+JSON.stringify(b));
    if(b.trace.some(t=>t.action==='run')||!b.trace.some(t=>t.move===C.MOVE_VINE_WHIP&&t.effectiveness===4))throw new Error('trainer decision incorrect');
    await H.idle(3000,true);
    const fl=frDebug.save.save.flags;
    if(!((fl[C.FLAG_BADGE01_GET>>3]>>(C.FLAG_BADGE01_GET&7))&1))throw new Error('no badge');
    return b;
  `);
  if(ctx.errors().length)throw new Error(ctx.errors().join('; '));
  return {wild,trainer,limits:['early single battles','PREPARED wild injury/stock','no route completion claim']};
}
