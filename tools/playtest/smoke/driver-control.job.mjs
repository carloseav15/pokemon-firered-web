// Contract diagnostics through the real field/menu/warp pipeline. No history,
// battle outcome or healed result is prepared by this job.
export default async function(ctx) {
  await ctx.loadSave('pewter-pc');
  const control = await ctx.runEval(`
    const before=H.observe();
    if(before.phase!=='field'||!before.fieldFree||before.battle)throw new Error('field state incorrect');
    const results=[];
    for(const speed of [0,1,2]) {
      frDebug.save.save.options.textSpeed=speed;
      const walk=await H.goto(7,4,{battle:'fight'});
      if(!walk.ok)throw new Error('counter unreachable');
      await H.face('U');
      if(!await H.until(()=>H.observe().phase==='choice','A',500))throw new Error('nurse choice missing');
      const choice=H.observe(),money=frDebug.save.save.money;
      const idle=await H.idle(100,true);
      if(idle.status!=='blocked'||idle.reason!=='input-required'||!H.hasTask('Task_MultichoiceMenu_HandleInput'))throw new Error('idle accepted choice');
      // Real NO selection, then explicit dialogue advancement back to the field.
      await H.tap(0x80,12);await H.tap(1,12);
      if(!await H.until(()=>H.fieldFree(),'A',500))throw new Error('NO did not return field');
      if(frDebug.save.save.money!==money)throw new Error('NO changed money');
      results.push({speed,choice,idle});
    }
    // A real pending warp leaves the old map visible; ready(0) must reject it.
    const ow=frGame.overworld,C=H.C;
    ow.setWarpDestination(C.MAP_ROUTE4>>8,C.MAP_ROUTE4&255,-1,32,6);
    ow.warpIntoMapAndLoad();
    const loading=H.observe();let timeout;
    try{await H.ready(0);}catch(e){timeout=e.result;}
    if(!timeout||timeout.reason!=='ready-timeout'||H.fieldFree())throw new Error('pending load accepted');
    const loaded=await H.ready();
    if(loaded.map!=='MAP_ROUTE4'||loaded.x!==32||loaded.y!==6||!loaded.fieldFree)throw new Error('warp not ready');
    return {before,results,loading,timeout,loaded};
  `);
  const jobs = await ctx.runEval(`
    const waitDone=async()=>{for(let i=0;i<300&&!H.jobStatus().done;i++)await new Promise(r=>setTimeout(r,5));if(!H.jobStatus().done)throw new Error('job did not stop');return H.jobStatus();};
    H.job(async()=>{await H.wait(100);return {ok:true};},{maxFrames:8});
    const budget=await waitDone();
    if(budget.out.reason!=='frame-budget'||budget.frames!==8)throw new Error('budget not enforced');
    H.job(async()=>{await H.wait(10000);return {ok:true};});
    const busy=H.job(async()=>({ok:true}));
    if(busy.reason!=='job-running')throw new Error('concurrent job accepted');
    const cancelled=H.cancelJob();const ended=await waitDone();
    if(!cancelled.ok||ended.out.reason!=='cancelled')throw new Error('cancel not propagated');
    const frames=ended.frames;await new Promise(r=>setTimeout(r,30));
    if(H.jobStatus().frames!==frames||frDebug.joy.held)throw new Error('cancelled job kept sending input');
    H.job(async()=>{await new Promise(r=>setTimeout(r,10));await H.tap(1);return {ok:true};},{timeoutMs:1});
    const timed=await waitDone();if(timed.out.reason!=='time-budget')throw new Error('time limit ignored');
    // Import a new driver instance while the previous instance still awaits:
    // it must not resume sending inputs into the new session's owner.
    const old=H;
    old.job(async()=>{await old.wait(10000);return {ok:true};});
    const fresh=await import('/tools/playtest/driver.js?sessionProbe='+Date.now());
    await fresh.H.init();
    for(let i=0;i<300&&!old.jobStatus().done;i++)await new Promise(r=>setTimeout(r,5));
    const replaced=old.jobStatus();
    if(!replaced.done||replaced.out.reason!=='session-changed')throw new Error('old driver resumed after replacement');
    return {budget,busy,cancelled,ended,timed,replaced,limits:['cooperative driver actions; direct frDebug inputs are outside H.job control']};
  `);
  if(ctx.errors().length)throw new Error(ctx.errors().join('; '));
  return {control,jobs};
}
