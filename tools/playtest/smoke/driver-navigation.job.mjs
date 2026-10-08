// PREPARED diagnostic positions/PP/injury/stock, loaded through the normal warp
// pipeline. No trainer outcome, fossil or history flag is prepared. This verifies
// driver behavior and one map connection, not a completed story route.
const position = `
  const ow=frGame.overworld,C=H.C;
  const preparedWarp=async(id,x,y)=>{
    ow.setWarpDestination(id>>8,id&255,-1,x,y);ow.warpIntoMapAndLoad();
    if(H.fieldFree())throw new Error('load incorrectly declared free');
    if(!await H.until(()=>H.st().map===H.rom.mapIdByNum(id)&&H.fieldFree(),'A',800))throw new Error('prepared diagnostic position did not load');
  };
`;
export default async function(ctx){
  // The optional case depends on how the trainer's Pokemon happen to fight (damage rolls decide whether the lead has to heal
  // before it attacks again), so it is repeated from the same checkpoint up to 4 times; every attempt runs the same checks and
  // retries collect diagnostics only: any failed attempt still fails the gate.
  const attempts = []; let optional = null;
  for (let k = 0; k < 4 && !optional; k++) {
    await ctx.loadSave('mtmoon-1f');
    const r = await ctx.runEval(`${position}
    const sv=frDebug.save.save;
    sv.party[1].pp[sv.party[1].moves.indexOf(C.MOVE_VINE_WHIP)]=0;
    sv.bag.items=[{item:C.ITEM_POTION,quantity:8}];
    await preparedWarp(C.MAP_MT_MOON_1F,14,18);
    await frDebug.walk('U',1);
    if(H.fieldFree())await H.face('L');
    await frDebug.press('A');
    for(let i=0;i<200&&!H.inBattle();i++)await frDebug.press('A',4);
    if(!H.inBattle())throw new Error('Josh did not start');
    // The scenario under test is the optional party menu, so this case declares YES to the "will you switch?" prompt
    // (policy default is NO, which never opens the menu); the menu is then cancelled through the UI.
    H.policy.set({battleYesNo:{...H.policy.options.battleYesNo,Cmd_yesnobox:true}});
    const b=await H.battle('auto',0,500);
    const fails=[];
    if(!b.trace.some(t=>t.action==='cancel optional switch'&&t.menuAction===C.PARTY_ACTION_CHOOSE_MON&&t.liveHp>0))fails.push('optional live switch not observed');
    const cancelled=b.trace.findIndex(t=>t.action==='cancel optional switch');
    if(!b.trace.some((t,i)=>i>cancelled&&t.action==='move'&&t.active===0))fails.push('active never attacked after declining switch');
    if(b.stop==='no able replacement'&&(H.G.gBattleMons[0].hp!==0||H.PM.gPartyMenu.action!==C.PARTY_ACTION_SEND_OUT))fails.push('optional menu still causes stop');
    if(fails.length)return {fails,stop:b.stop,outcome:b.outcome,trace:b.trace.map(t=>t.action+(t.active!==undefined?':'+t.active+':'+t.hp:''))};
    return {b,limits:['cancel optional change and resume attack; no trainer victory claim']};
  `);
    if (r.fails) attempts.push(r); else optional = { ...r, attempt: k + 1, failedAttempts: attempts };
  }
  if (!optional) throw new Error('optional case failed in every attempt: ' + JSON.stringify(attempts));
  if (attempts.length) throw new Error('optional case is intermittent; retries are diagnostic, not PASS: ' + JSON.stringify(attempts));
  await ctx.loadSave('mtmoon-1f');
  const forced=await ctx.runEval(`${position}
    const sv=frDebug.save.save;
    // PREPARED 1 HP lead: let the opponent cause the actual faint.
    sv.party[0].hp=1;sv.bag.items=[];
    await preparedWarp(C.MAP_MT_MOON_1F,14,18);
    await frDebug.walk('U',1);
    if(H.fieldFree())await H.face('L');
    await frDebug.press('A');
    // The opponent may miss or use a move without damage: repeat the turn until the lead really faints (capped, recorded).
    const attempts=[];
    const chooseMon=()=>H.G.gBattlerControllerFuncs[0]?.name==='WaitForMonSelection'&&H.hasTask('Task_HandleChooseMonInput');
    const chooseAction=()=>H.G.gBattlerControllerFuncs[0]?.name==='HandleInputChooseAction';
    // If the opponent's Pokemon falls first, the game asks "will you switch?" and the A presses below answer YES, opening the
    // OPTIONAL party menu with the lead still alive. That is not the forced replacement under test: record it, back out with B
    // and play the next turn (the foe's next Pokemon is the one that can faint the 1 HP lead).
    const optionalMenu=()=>chooseMon()&&H.PM.gPartyMenu.action!==C.PARTY_ACTION_SEND_OUT&&H.G.gBattleMons[0].hp>0;
    const backOut=async(n)=>{attempts.push({turn:n+1,optionalMenu:true,liveHp:H.G.gBattleMons[0].hp});if(!await H.until(()=>!chooseMon(),'B',300))throw new Error('optional party menu did not close');};
    for(let n=0;n<12&&!(chooseMon()&&!optionalMenu());n++){
      if(!await H.until(()=>chooseAction()||chooseMon(),'A',500))throw new Error('action not ready');
      if(optionalMenu()){await backOut(n);continue;}
      if(chooseMon())break;
      await H.tap(1,30);
      if(!await H.until(()=>H.G.gBattlerControllerFuncs[0]?.name==='HandleInputChooseMove'))throw new Error('move menu missing');
      for(let i=0;i<8&&H.G.gMoveSelectionCursor[0]!==2;i++)await H.tap(0x80);
      if(H.G.gMoveSelectionCursor[0]!==2)throw new Error('Gust cursor not reached');
      await frDebug.press('A',30);
      await H.until(()=>chooseAction()||chooseMon(),'A',600);
      if(optionalMenu()){await backOut(n);continue;}
      attempts.push({turn:n+1,liveHp:H.G.gBattleMons[0].hp,faint:chooseMon()});
      if(!chooseMon()&&H.G.gBattleMons[1]?.hp===0)throw new Error('opponent fainted before the lead: '+JSON.stringify(attempts));
    }
    if(!chooseMon())throw new Error('actual faint did not open party after '+attempts.length+' turns: '+JSON.stringify(attempts));
    const observed={liveHp:H.G.gBattleMons[0].hp,menuAction:H.PM.gPartyMenu.action};
    if(observed.liveHp!==0||observed.menuAction!==C.PARTY_ACTION_SEND_OUT)throw new Error('not a forced replacement: '+JSON.stringify(observed));
    const b=await H.battle('auto',0,500);
    if(b.trace.some(t=>t.action==='cancel optional switch'&&t.menuAction===C.PARTY_ACTION_SEND_OUT))throw new Error('forced switch failed: '+JSON.stringify(b));
    if(!b.trace.some(t=>t.action==='move'&&t.active===1))throw new Error('forced replacement did not attack');
    return {observed,attempts,b,limits:['actual faint, mandatory replacement and attack; no trainer victory claim']};
  `);
  await ctx.loadSave('mtmoon-1f');
  const navigation=await ctx.runEval(`${position}
    await preparedWarp(C.MAP_MT_MOON_B1F,45,5);
    const ladder=await H.goto(45,4,{battle:'run'});
    if(ladder.note&&ladder.note!=='map changed')throw new Error('cannot reach east ladder: '+JSON.stringify(ladder));
    const settled=await H.idle(3000,false);
    if(settled.timeout)throw new Error('ladder load did not settle');
    const exited=H.st().map==='MAP_MT_MOON_B1F'?await H.exit('U',1,{recovery:true}):H.st();
    if(exited.note||exited.map!=='MAP_ROUTE4'||!H.fieldFree())throw new Error('warp did not settle: '+JSON.stringify(exited));
    const sv=frDebug.save.save,player=ow.player.object;
    const state=()=>JSON.stringify({coords:player.currentCoords,previous:player.previousCoords,elevation:player.currentElevation,behavior:player.currentMetatileBehavior,stats:sv.gameStats,party:sv.party});
    const before=state(),path=H.bfs(114,17);
    if(!path?.length)throw new Error('Route4 east path missing');
    if(state()!==before)throw new Error('route planning mutated player or statistics');
    const jumpsBefore=sv.gameStats[C.GAME_STAT_JUMPED_DOWN_LEDGES];
    const walked=await H.goto(107,10,{battle:'run'});
    if(walked.note||walked.x!==107||walked.y!==10)throw new Error('planned path was not walkable: '+JSON.stringify(walked));
    const jumpsAfter=sv.gameStats[C.GAME_STAT_JUMPED_DOWN_LEDGES];
    if(jumpsAfter<=jumpsBefore)throw new Error('east path did not execute a real ledge jump');
    const east=await H.exit('R',1,{recovery:true});
    if(east.note||east.map!=='MAP_CERULEAN_CITY'||!H.fieldFree())throw new Error('east connection failed: '+JSON.stringify(east));
    return {exited,pathLength:path.length,walked,jumpsBefore,jumpsAfter,east};
  `);
  if(ctx.errors().length)throw new Error(ctx.errors().join('; '));
  return {optional,forced,navigation,limits:['PREPARED diagnostic entry positions','no fossil/history/save validation','walking on foot and ledges; no Surf/bike claim']};
}
