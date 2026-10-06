// PREPARED inputs only: hurt/poison/used PP and medicine stock in memory.
// No final HP, outcome, experience or flags are set. No save fixture is edited.
export default async function(ctx) {
  await ctx.loadSave('pewter-pc');
  const field = await ctx.runEval(`
    const C = H.C, sv = frDebug.save.save;
    const original = sv.party.map(m => [m.species, m.personality, m.otId]);
    const leadHp = sv.party[0].hp;
    sv.party[1].hp = 6;
    sv.party[1].status = C.STATUS1_POISON;
    const existing = sv.bag.items.find(e => e.item === C.ITEM_ANTIDOTE);
    if (existing) existing.quantity = 1; else sv.bag.items.push({item:C.ITEM_ANTIDOTE,quantity:1});
    const prepared = {target:1,hp:6,status:C.STATUS1_POISON,antidotes:1};
    const poison = await H.useItem(C.ITEM_ANTIDOTE, 1);
    if (!poison.ok || sv.party[1].status !== 0 || H.countItem(C.ITEM_ANTIDOTE) !== 0 || sv.party[1].hp !== 6) throw new Error('Antidote failed: '+JSON.stringify(poison));
    const count = H.countItem(C.ITEM_POTION), max = sv.party[1].stats[0];
    const potion = await H.useItem(C.ITEM_POTION, 1);
    // PokemonItemEffect C table: Potion restores 20; clip at the unchanged maxHP.
    if (!potion.ok || sv.party[1].hp !== Math.min(max, 26) || H.countItem(C.ITEM_POTION) !== count-1 || sv.party[0].hp !== leadHp) throw new Error('Wrong Potion target/effect: '+JSON.stringify(potion));
    if (JSON.stringify(sv.party.map(m=>[m.species,m.personality,m.otId])) !== JSON.stringify(original)) throw new Error('Identity changed');
    // PREPARED: a second injury tests refusal to spend the final reserve.
    sv.party[1].hp=6;
    const reserveCount=H.countItem(C.ITEM_POTION), position={x:H.st().x,y:H.st().y};
    const reserve=await H.prepareStep();
    if(reserve.ok||!reserve.note.includes('reserve')||H.countItem(C.ITEM_POTION)!==reserveCount||H.st().x!==position.x||H.st().y!==position.y)throw new Error('Reserve guard failed: '+JSON.stringify(reserve));
    // PREPARED exhausted attacking PP; status moves must not count as attacks.
    sv.party[0].pp[sv.party[0].moves.indexOf(C.MOVE_VINE_WHIP)]=0;
    const exhausted=await H.prepareStep();
    const blockedExit=await H.exit('D',1);
    if(!blockedExit.note?.includes('pp exhausted')||H.st().x!==position.x||H.st().y!==position.y)throw new Error('Exit bypassed PP guard');
    if(exhausted.ok||!exhausted.note.includes('pp exhausted'))throw new Error('PP guard failed');
    return {prepared,poison,potion,reserve,exhausted,free:H.fieldFree()};
  `);
  await ctx.loadSave('pewter');
  const nurse = await ctx.runEval(`
    const sv = frDebug.save.save, C=H.C, p=sv.party[0];
    p.hp -= 5; p.pp[0] -= 1; p.status=C.STATUS1_POISON;
    const prepared={hp:p.hp,pp:[...p.pp],status:p.status};
    const result = await H.heal({leave:false});
    // Independent fixture/source values: Tackle/Growl/Leech Seed/Vine Whip PP.
    if (!result.ok || p.hp!==33 || p.status!==0 || JSON.stringify([...p.pp])!=='[35,40,10,10]' || !H.fieldFree()) throw new Error('Nurse failed: '+JSON.stringify(result));
    const exit=await H.heal();
    if(!exit.ok||exit.exit.map!=='MAP_PEWTER_CITY')throw new Error('Nurse exit failed: '+JSON.stringify(exit));
    return {prepared,result,exit};
  `);
  if (ctx.errors().length) throw new Error(ctx.errors().join('; '));
  return {field,nurse,limits:['prepared inputs','no full route or save persistence validation']};
}
