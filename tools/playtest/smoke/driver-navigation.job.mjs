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
  await ctx.loadSave('mtmoon-1f');
  const optional=await ctx.runEval(`${position}
    const sv=frDebug.save.save;
    sv.party[1].pp[sv.party[1].moves.indexOf(C.MOVE_VINE_WHIP)]=0;
    sv.bag.items=[{item:C.ITEM_POTION,quantity:8}];
    await preparedWarp(C.MAP_MT_MOON_1F,14,18);
    await frDebug.walk('U',1);
    if(H.fieldFree())await H.face('L');
    await frDebug.press('A');
    for(let i=0;i<200&&!H.inBattle();i++)await frDebug.press('A',4);
    if(!H.inBattle())throw new Error('Josh did not start');
    const b=await H.battle('auto',0,500);
    if(!b.trace.some(t=>t.action==='cancel optional switch'&&t.menuAction===C.PARTY_ACTION_CHOOSE_MON&&t.liveHp>0))throw new Error('optional live switch not observed');
    const cancelled=b.trace.findIndex(t=>t.action==='cancel optional switch');
    if(!b.trace.some((t,i)=>i>cancelled&&t.action==='move'&&t.active===0))throw new Error('active never attacked after declining switch');
    if(b.stop==='no able replacement'&&(H.G.gBattleMons[0].hp!==0||H.PM.gPartyMenu.action!==C.PARTY_ACTION_SEND_OUT))throw new Error('optional menu still causes stop');
    return {b,limits:['cancel optional change and resume attack; no trainer victory claim']};
  `);
  await ctx.loadSave('mtmoon-1f');
  const forced=await ctx.runEval(`${position}
    const sv=frDebug.save.save;
    // PREPARED 1 HP lead: let the opponent cause the actual faint.
    sv.party[0].hp=1;sv.bag.items=[];
    await preparedWarp(C.MAP_MT_MOON_1F,14,18);
    await frDebug.walk('U',1);
    if(H.fieldFree())await H.face('L');
    await frDebug.press('A');
    if(!await H.until(()=>H.G.gBattlerControllerFuncs[0]?.name==='HandleInputChooseAction','A',500))throw new Error('action not ready');
    await H.tap(1,30);
    if(!await H.until(()=>H.G.gBattlerControllerFuncs[0]?.name==='HandleInputChooseMove'))throw new Error('move menu missing');
    for(let i=0;i<8&&H.G.gMoveSelectionCursor[0]!==2;i++)await H.tap(0x80);
    if(H.G.gMoveSelectionCursor[0]!==2)throw new Error('Gust cursor not reached');
    await frDebug.press('A',30);
    if(!await H.until(()=>H.G.gBattlerControllerFuncs[0]?.name==='WaitForMonSelection'&&H.hasTask('Task_HandleChooseMonInput'),'A',600))throw new Error('actual faint did not open party');
    const observed={liveHp:H.G.gBattleMons[0].hp,menuAction:H.PM.gPartyMenu.action};
    if(observed.liveHp!==0||observed.menuAction!==C.PARTY_ACTION_SEND_OUT)throw new Error('not a forced replacement: '+JSON.stringify(observed));
    const b=await H.battle('auto',0,500);
    if(b.trace.some(t=>t.action==='cancel optional switch'&&t.menuAction===C.PARTY_ACTION_SEND_OUT))throw new Error('forced switch failed: '+JSON.stringify(b));
    if(!b.trace.some(t=>t.action==='move'&&t.active===1))throw new Error('forced replacement did not attack');
    return {observed,b,limits:['actual faint, mandatory replacement and attack; no trainer victory claim']};
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
