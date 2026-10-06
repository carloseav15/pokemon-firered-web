import { readFileSync } from 'node:fs';
const BASE=process.env.PW_BASE??'http://localhost:5173/';
export default async function(ctx) {
  await ctx.loadSave('pewter-pc');
  const results=await ctx.runEval(`
    const results=[];
    for(const speed of [0,1,2]) {
      frDebug.save.save.options.textSpeed=speed;
      const checkpointName='driver-save-'+speed;
      const saved=await H.saveGame({checkpointName});
      if(!saved.ok||!H.fieldFree())throw new Error('save failed: '+JSON.stringify(saved));
      const data=await H.checkpointData(checkpointName);
      if(data.raw!==localStorage.getItem('pokemon-gba-web-lab.firered.v2')||data.provenance.source!=='in-game-SAVE')throw new Error('checkpoint did not copy menu save');
      const raw=data.raw;
      const rejected=await H.saveGame({checkpointName});
      if(rejected.reason!=='checkpoint-exists'||data.raw!==(await H.checkpointData(checkpointName)).raw||localStorage.getItem('pokemon-gba-web-lab.firered.v2')!==raw)throw new Error('duplicate checkpoint overwritten');
      await H.tap(8,60);
      const blocked=await H.saveGame();
      if(blocked.reason!=='field-not-free'||localStorage.getItem('pokemon-gba-web-lab.firered.v2')!==raw)throw new Error('save accepted while menu open');
      await H.tap(2,30);
      if(!await H.until(()=>H.fieldFree()))throw new Error('start menu did not close');
      results.push({speed,saved,rejected,blocked,sha256:data.sha256});
    }
    // PREPARED different-file input: the real overwrite prompt defaults to NO.
    frGame.differentSaveFile=true;
    const different=await H.saveGame({checkpointName:'driver-save-different'});
    if(!different.ok||different.prompts.length!==2)throw new Error('default NO overwrite not explicitly confirmed: '+JSON.stringify(different));
    results.push({different});
    const raw=localStorage.getItem('pokemon-gba-web-lab.firered.v2'),counter=frDebug.save.save.gameStats[H.C.GAME_STAT_SAVED_GAME];
    // Real cancel of the first save prompt: no write, no script resume, then close START.
    await H.tap(8,60);await H.tap(1,12); // cursor remains at SAVE
    if(!await H.until(()=>H.observe().phase==='save-choice'))throw new Error('cancel prompt unavailable');
    const stopped=await H.idle(60,true);
    if(stopped.status!=='blocked')throw new Error('idle confirmed SAVE');
    await H.tap(2,12);
    if(!await H.until(()=>H.observe().phase==='start-menu'))throw new Error('cancel did not return START');
    await H.tap(2,12);
    if(!await H.until(()=>H.fieldFree())||localStorage.getItem('pokemon-gba-web-lab.firered.v2')!==raw||frDebug.save.save.gameStats[H.C.GAME_STAT_SAVED_GAME]!==counter)throw new Error('cancel wrote save or lost field');
    results.push({cancelled:true,counter});
    let invalid=false;try{await H.importSave('../pewter');}catch{invalid=true;}
    if(!invalid)throw new Error('unsafe checkpoint name accepted');
    return results;
  `);
  const path='/tmp/sol-driver-save-'+Date.now()+'.json';
  const exported=await ctx.exportCheckpoint({name:'driver-save-different',path,provenance:{job:'driver-save',limits:['no dynamic NPC persistence claim']}});
  let protectedDestination=false;
  try{await ctx.exportCheckpoint({name:'driver-save-different',path});}catch(e){protectedDestination=/already exists/.test(String(e));}
  if(!protectedDestination)throw new Error('export overwrote existing destination');
  const raw=readFileSync(path,'utf8');
  const expected=await ctx.runEval('return H.saveSnapshot();');
  if(raw!==await ctx.runEval("return localStorage.getItem('pokemon-gba-web-lab.firered.v2');"))throw new Error('export differs from persisted bytes');
  await ctx.page.goto(BASE+'?fr=continue',{waitUntil:'load'});
  const continued=await ctx.runEval(`const {H}=await import('/tools/playtest/driver.js');await H.ready();return H.saveSnapshot();`);
  if(JSON.stringify(continued)!==JSON.stringify(expected))throw new Error('continued semantic state differs: '+JSON.stringify({expected,continued}));
  const moved=await ctx.runEval(`const s=H.st();const after=await H.goto(s.x,s.y+1);if(!after.ok||after.y!==s.y+1)throw new Error('continue movement failed');return after;`);
  if(ctx.errors().length)throw new Error(ctx.errors().join('; '));
  return {results,exported,protectedDestination,expected,continued,moved,limits:['UI save and exact exported bytes; dynamic NPC snapshot remains task 1.22']};
}
