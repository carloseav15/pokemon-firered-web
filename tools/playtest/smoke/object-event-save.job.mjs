import { readFileSync } from "node:fs";
// 1.22: PREPARED fixture/input, real held movement + in-game SAVE + cold continue.
// No restored coordinates are injected and the expected state comes from persisted bytes.
const BASE = process.env.PW_BASE ?? 'http://localhost:5173/';
const KEY = 'pokemon-gba-web-lab.firered.v2';
export default async function run(ctx) {
  await ctx.loadSave(process.env.OBJECT_SAVE_FIXTURE ?? 'pewter-pc');
  if(process.env.OBJECT_SAVE_PLAYBACK==='1') {
    // PREPARED input: replay the recorded scenes from the existing SON-PREP fixture.
    // Their historical maps differ from the live save, exposing a leaked playback snapshot.
    const fixture=JSON.parse(readFileSync('tools/playtest/saves/mtmoon-prepared.json','utf8'));
    await ctx.page.evaluate(({scenes,events,actions})=>{
      const s=frDebug.save.save;s.questLogScenes=scenes;s.questLogEvents=events;s.questLogPlayerGfxActions=actions;
    },{scenes:fixture.questLogScenes,events:fixture.questLogEvents,actions:fixture.questLogPlayerGfxActions});
  }
  const preparation = await ctx.runEval(`
    const ow = frGame.overworld;
    const candidates=ow.objects.list.filter(o=>!o.isPlayer&&!o.inanimate&&o.localId!==1);
    const directions=[[0,1,H.C.MOVEMENT_ACTION_WALK_NORMAL_DOWN],[0,-1,H.C.MOVEMENT_ACTION_WALK_NORMAL_UP],[1,0,H.C.MOVEMENT_ACTION_WALK_NORMAL_RIGHT],[-1,0,H.C.MOVEMENT_ACTION_WALK_NORMAL_LEFT]];
    let npc,target,action;
    search: for(const o of candidates) for(const [dx,dy,id] of directions) {
      const t={x:o.currentCoords.x+dx,y:o.currentCoords.y+dy};
      if(ow.map.collisionAt(t.x,t.y)===0&&!ow.objects.list.some(other=>other!==o&&other.currentCoords.x===t.x&&other.currentCoords.y===t.y)) {npc=o;target=t;action=id;break search;}
    }
    if(!npc)throw new Error('fixture has no NPC with a free adjacent tile: '+JSON.stringify(candidates.map(o=>({id:o.localId,pos:o.currentCoords}))));
    const before = {coords:{...npc.currentCoords},template:{x:npc.template.x,y:npc.template.y}};
    // PREPARED input: isolate a stationary NPC and ask the actual movement engine to walk.
    ow.objects.setTrainerMovementType(npc,H.C.MOVEMENT_TYPE_FACE_DOWN);
    ow.objects.setHeldMovement(npc,action);
    if(!await H.until(()=>npc.heldMovementFinished,null,120)) throw new Error('NPC walk did not complete');
    ow.objects.ObjectEventClearHeldMovementIfFinished(npc);
    if(npc.currentCoords.x!==target.x||npc.currentCoords.y!==target.y) throw new Error('NPC did not move');
    // Dynamic visibility and direction lock are source fields, not template fields.
    npc.invisible=true; npc.facingDirectionLocked=true;
    const slot=ow.objects.indexOf(npc);
    // PREPARED input: a runtime object absent from the map's saved templates.
    const dynamicSlot=ow.objects.SpawnSpecialObjectEvent({...npc.template,localId:200,graphicsId:H.C.OBJ_EVENT_GFX_ITEM_BALL,movementType:H.C.MOVEMENT_TYPE_NONE,x:before.coords.x-7,y:before.coords.y-7,flag:0,script:0});
    if(dynamicSlot>=H.C.OBJECT_EVENTS_COUNT)throw new Error('dynamic spawn failed');
    ow.syncObjectSprites();
    const saved=await H.saveGame();
    if(!saved.ok)throw new Error('real SAVE failed: '+JSON.stringify(saved));
    const raw=localStorage.getItem('${KEY}'),data=JSON.parse(raw);
    if(data.continueGameWarpActive)throw new Error('normal SAVE activated a special continue warp');
    const record=data.objectEvents[slot];
    if(data.objectEventsVersion!==1||record.currentCoords.y!==target.y||(record.currentCoords.y===before.template.y+7&&record.currentCoords.x===before.template.x+7)||!record.invisible||!record.facingDirectionLocked)throw new Error('SAVE missed dynamic NPC state');
    return {before,slot,dynamicSlot,dynamicRecord:data.objectEvents[dynamicSlot],record,raw,saved,scenes:data.questLogScenes?.length??0};
  `);
  if(process.env.OBJECT_SAVE_PLAYBACK==='1'&&preparation.scenes===0)throw new Error('prepared playback input has no scenes');
  await ctx.page.goto(BASE+'?fr=continue',{waitUntil:'load'});
  await ctx.page.waitForFunction(()=>window.frDebug&&window.frGame);
  const continued = await ctx.runEval(`
    const {H}=await import('/tools/playtest/driver.js');window.H=H;await H.init();
    const Q=await H.mod('/src/fr/questLogEvents.ts');
    const observed=[];
    for(let f=0;f<18000;f+=20) {
      if(!observed.includes(Q.gQuestLogState))observed.push(Q.gQuestLogState);
      if(Q.gQuestLogState!==H.C.QL_STATE_PLAYBACK&&Q.gQuestLogState!==H.C.QL_STATE_PLAYBACK_LAST&&H.fieldFree())break;
      await H.wait(20);
    }
    await H.ready();
    const ow=frGame.overworld,slot=${preparation.slot};
    const o=ow.objects.objects[slot],record=${JSON.stringify(preparation.record)};
    if(!o?.active||o.isPlayer)throw new Error('NPC slot was not restored');
    const keys=['localId','graphicsId','movementType','trainerType','mapNum','mapGroup','currentElevation','previousElevation','initialCoords','currentCoords','previousCoords','rangeX','rangeY','invisible','facingDirectionLocked','hideReflection'];
    for(const key of keys) if(JSON.stringify(o[key])!==JSON.stringify(record[key]))throw new Error('restored '+key+' differs: '+JSON.stringify({saved:record[key],actual:o[key]}));
    if(o.frozen||o.heldMovementActive||o.singleMovementActive)throw new Error('C return-to-field resets were not applied');
    if(!o.template?.script)throw new Error('restored NPC lost its script template');
    if(ow.sprites.getId(o.sprite)===255||ow.objects.objects[ow.player.objectEventId]!==ow.player.object)throw new Error('renderer/player registration lost');
    if(localStorage.getItem('${KEY}')!==${JSON.stringify(preparation.raw)})throw new Error('continue modified persisted bytes');
    const dynamic=ow.objects.objects[${preparation.dynamicSlot}],dynamicRecord=${JSON.stringify(preparation.dynamicRecord)};
    if(!dynamic?.active||dynamic.localId!==200||dynamic.graphicsId!==dynamicRecord.graphicsId||JSON.stringify(dynamic.currentCoords)!==JSON.stringify(dynamicRecord.currentCoords))throw new Error('runtime object was lost or moved');
    if(ow.objects.templates.some(t=>t.localId===200))throw new Error('test dynamic object unexpectedly exists in templates');
    if(ow.sprites.getId(dynamic.sprite)===255)throw new Error('runtime object has no renderer sprite');
    const state=H.st();
    const moved=await H.goto(state.x,state.y+1);
    if(!moved.ok||moved.y!==state.y+1)throw new Error('player cannot move after restore');
    return {observed,dynamic:{slot:${preparation.dynamicSlot},coords:dynamic.currentCoords},keys,coords:o.currentCoords,unfrozen:!o.frozen,spriteId:ow.sprites.getId(o.sprite),moved};
  `);
  if(process.env.OBJECT_SAVE_PLAYBACK==='1'&&!continued.observed.includes(2))throw new Error('Quest Log was not observed playing');
  if(ctx.errors().length)throw new Error(ctx.errors().join('; '));
  return {ok:true,preparation:{...preparation,raw:undefined},continued};
}
