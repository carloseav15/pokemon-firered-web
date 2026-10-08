// Regression: a real medicine turn heals, the foe then knocks the active out,
// and the driver must hand SEND_OUT to the battle loop instead of pressing B.
// PREPARED inputs: an able reserve, active injury, one Potion, foe level/stats
// and moves for lethal damage. No KO, replacement, item effect or outcome is written.
export default async function run(ctx) {
  await ctx.loadSave("gym-camper");
  const result = await ctx.runEval(`
    const C=H.C,sv=frDebug.save.save;
    const {drive}=await import("/tools/playtest/driver/loop.js");
    const reach=async screen=>{const r=await drive(H,{label:"medicine regression: "+screen,maxFrames:20000,
      state:{battle:{mode:"fight",slot:0,decision:null}},
      handlers:{"battle-action":async()=>({stop:"action-before-required-replacement"})},
      until:rec=>rec.screen===screen?"reached":false});return {ok:r.ok,reason:r.reason,frames:r.frames,screen:r.rec?.screen,details:r.rec?.details};};
    const P=await H.mod("/src/fr/pokemon/pokemon.ts");
    if(sv.party.filter(m=>m.species&&m.hp>0).length<2) sv.party.push(P.createMon(C.SPECIES_PIDGEY,12,{personality:123,fixedIV:10,otId:sv.trainerId}));
    const talked=await H.talk(6,5);
    const opening=talked.note?null:await reach("battle-action");
    if(talked.note||!opening?.ok) throw Error("no trainer action menu "+JSON.stringify({talked,opening}));
    const active=H.G.gBattlerPartyIndexes[0],mon=sv.party[active],foe=H.G.gBattleMons[1];
    mon.hp=1;H.G.gBattleMons[0].hp=1;
    sv.bag.items=[{item:C.ITEM_POTION,quantity:1}];
    foe.level=50;foe.attack=999;foe.spAttack=999;foe.speed=1;
    foe.moves.fill(C.MOVE_SWIFT);foe.pp.fill(20);
    if(![...foe.moves].every(move=>move===C.MOVE_SWIFT)) throw Error("prepared moves not installed");
    const prepared={opening,active,party:H.resources().party,foe:{level:foe.level,attack:foe.attack,spAttack:foe.spAttack,speed:foe.speed,moves:[...foe.moves]}};
    const used=await H.useItem(C.ITEM_POTION,active,{battle:true});
    const settled=await reach("party-menu");
    const after=H.observe();
    if(!settled.ok||!used.ok||H.countItem(C.ITEM_POTION)!==0||mon.hp!==0||after.screen!=="party-menu"||after.screenDetails.action!==C.PARTY_ACTION_SEND_OUT)
      throw Error("medicine KO handoff failed "+JSON.stringify({used,settled,after,localHp:mon.hp,liveHp:H.G.gBattleMons[0].hp,saveHp:sv.party[active].hp}));
    const reached=await reach("battle-action");
    const replacement=H.G.gBattlerPartyIndexes[0];
    if(!reached.ok||reached.reason!=="reached"||replacement===active||H.G.gBattleMons[0].hp<=0)
      throw Error("replacement failed "+JSON.stringify({reached,replacement}));
    return {prepared,used,settled,after,reached,replacement,limits:"focused PREPARED regression; stops before next action, no victory or natural story claim"};
  `);
  if(ctx.errors().length) throw Error(ctx.errors().join("; "));
  return result;
}
