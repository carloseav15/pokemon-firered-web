// Route5 -> Underground Path -> Route6 -> Vermilion, by real inputs.
// Warp coordinates/connections: pokefirered/data/maps/{Route5,UndergroundPath_*,Route6}/map.json.
// Importing an existing checkpoint prepares the entry, not its historical provenance.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadCheckpointPath } from "../checkpoint-entry.mjs";
import { prelude } from "./lib.mjs";
import { routeHelpers, runJob, stopCheckpoint, writeEvidence } from "./route2-lib.mjs";

export default async function run(ctx) {
  const out = resolve(process.argv[3] ?? "tools/playtest/runs/vermilion");
  const base = process.env.PW_BASE ?? "http://localhost:5197/";
  const saves = join(out,"saves"), file = join(out,"evidence.json");
  mkdirSync(saves,{recursive:true});
  let entry = process.env.VERMILION_ENTRY_PATH;
  if(!entry && existsSync(file)) {
    const prior=JSON.parse(readFileSync(file,"utf8"));
    entry=[...(prior.checkpoints??[])].reverse().find(cp=>cp.verified?.continued)?.path;
  }
  entry ??= "tools/playtest/saves/route5-arrival.json";
  const evidence={status:"running",entry,legs:[],checkpoints:[]};
  const prefix=prelude+routeHelpers;
  const persist=()=>writeEvidence(out,evidence);
  const snapshot=()=>ctx.runEval(`${prefix} return {status:status(),reached:reached(status())};`);
  persist();
  try {
    evidence.loaded=await loadCheckpointPath(ctx,entry,base);
    evidence.before=await snapshot();
    if(!Object.values(evidence.before.reached).every(Boolean)) throw Error("entry lacks verified Cerulean milestones");
    const maps=["MAP_ROUTE5","MAP_UNDERGROUND_PATH_NORTH_ENTRANCE","MAP_UNDERGROUND_PATH_NORTH_SOUTH_TUNNEL","MAP_UNDERGROUND_PATH_SOUTH_ENTRANCE","MAP_ROUTE6","MAP_VERMILION_CITY"];
    if(!maps.includes(evidence.before.status.st.map)) throw Error("unsupported entry map "+evidence.before.status.st.map);
    if(evidence.before.status.st.map==="MAP_VERMILION_CITY") {
      evidence.status="passed";evidence.resumedCompleted=true;evidence.final=evidence.before;
      evidence.checkpoint={path:evidence.loaded.path,verified:{continued:true}};evidence.checkpoints.push(evidence.checkpoint);
      persist();return evidence;
    }
    if(evidence.before.status.st.map==="MAP_ROUTE5" && !(evidence.before.status.res?.items??[]).some(i=>i.item===22)) {
      // Entry has 1 non-healing item and a poisoned lead dies on Route 6: restock in Cerulean first (Mart sells Super Potion/Antidote).
      evidence.resupply=await runJob(ctx,`
        const C=H.C,opts={recovery:true,battle:"auto"};
        const ow=()=>frGame.overworld;
        const nearX=(w,y,x0)=>Array.from({length:w},(_,x)=>x).sort((a,b)=>Math.abs(a-x0)-Math.abs(b-x0)).find(x=>H.bfs(x+7,y+7)!==null);
        const x0=nearX(ow().loaded.layout.width,0,H.st().x);
        if(x0===undefined) return {ok:false,reason:"no reachable Route5 north edge"};
        let r=await H.goto(x0,0,opts); if(r.note&&r.note!=="map changed") return {ok:false,reason:"to Cerulean: "+r.note};
        await H.exit("U",2,opts);
        await H.until(()=>H.st().map==="MAP_CERULEAN_CITY"&&H.fieldFree(),null,1200);
        if(H.st().map!=="MAP_CERULEAN_CITY") return {ok:false,reason:"not in Cerulean",state:H.observe()};
        const heal=await H.healAtCenter(); if(!heal.ok) return {ok:false,reason:"center",heal};
        const e=await H.enter(29,28,"D",opts); if(e.note||H.st().map!=="MAP_CERULEAN_CITY_MART") return {ok:false,reason:"mart door",e};
        const buys=[];
        for(const [item,n] of [[C.ITEM_SUPER_POTION,8],[C.ITEM_ANTIDOTE,4],[C.ITEM_PARALYZE_HEAL,3]]) {
          const b=await H.buyItem(item,n); buys.push({item,n,ok:b.ok,paid:b.paid,note:b.note}); if(!b.ok) return {ok:false,reason:"buy",buys,b};
        }
        // Only the mat tile with a warp behavior triggers (MB_SOUTH_ARROW_WARP at (4,7)); the other two warp entries are inert, as in the C data.
        const mat=ow().loaded.header.warps.find(w=>w.destMap==="MAP_CERULEAN_CITY"&&ow().map.behaviorAt(w.x+7,w.y+7)===C.MB_SOUTH_ARROW_WARP);
        if(!mat) return {ok:false,reason:"no triggering mart warp",buys};
        const toMat=await walk(mat.x,mat.y-1,opts); if(toMat.note) return {ok:false,reason:"mart mat: "+toMat.note,buys};
        await H.exit("D",2,opts);
        await H.until(()=>H.st().map==="MAP_CERULEAN_CITY"&&H.fieldFree(),null,1200);
        if(H.st().map!=="MAP_CERULEAN_CITY") return {ok:false,reason:"left mart elsewhere",state:H.observe(),buys};
        // The central south passage is blocked by the Cut tree (26,32): go back through the robbed house's rear and the eastern corridor (as route2-lib does).
        r=await doorIn(30,11,opts); if(r.note&&r.note!=="map changed") return {ok:false,reason:"robbed house door: "+r.note,buys};
        await H.until(()=>H.st().map==="MAP_CERULEAN_CITY_HOUSE2"&&H.fieldFree(),null,1200);
        r=await doorIn(4,1,opts); if(r.note&&r.note!=="map changed") return {ok:false,reason:"robbed house rear: "+r.note,buys};
        await H.until(()=>H.st().map==="MAP_CERULEAN_CITY"&&H.fieldFree(),null,1200);
        r=await walk(40,33,opts); if(r.note&&r.note!=="map changed") return {ok:false,reason:"east corridor: "+r.note,buys};
        r=await edge("D",29,opts); if(r.note&&r.note!=="map changed") return {ok:false,reason:"to Route5: "+r.note,buys};
        await H.until(()=>H.st().map==="MAP_ROUTE5"&&H.fieldFree(),null,1200);
        return {ok:H.st().map==="MAP_ROUTE5"&&H.fieldFree(),buys,state:H.observe(),resources:H.resources()};
      `,{prefix,maxFrames:300000,timeoutMs:240000});
      persist();
      if(!evidence.resupply?.ok) throw Error("resupply failed: "+JSON.stringify(evidence.resupply).slice(0,1500));
    }
    for(let i=0;i<8;i++) {
      const leg=await runJob(ctx,`
        const from=H.st().map,mark=H.log.length;
        const opts={recovery:true,battle:"auto"};
        let target,expected,door=false;
        if(from==="MAP_ROUTE5") {target=[31,32];expected="MAP_UNDERGROUND_PATH_NORTH_ENTRANCE";door=true;}
        else if(from==="MAP_UNDERGROUND_PATH_NORTH_ENTRANCE") {target=[7,4];expected="MAP_UNDERGROUND_PATH_NORTH_SOUTH_TUNNEL";}
        else if(from==="MAP_UNDERGROUND_PATH_NORTH_SOUTH_TUNNEL") {target=[3,60];expected="MAP_UNDERGROUND_PATH_SOUTH_ENTRANCE";}
        else if(from==="MAP_UNDERGROUND_PATH_SOUTH_ENTRANCE") {target=[6,8];expected="MAP_ROUTE6";}
        else if(from==="MAP_ROUTE6") {
          const ow=frGame.overworld,y=ow.loaded.layout.height-1;
          const xs=Array.from({length:ow.loaded.layout.width},(_,x)=>x).sort((a,b)=>Math.abs(a-19)-Math.abs(b-19));
          const x=xs.find(x=>H.bfs(x+7,y+7)!==null);
          if(x===undefined) return {ok:false,reason:"no reachable Route6 south edge",state:H.observe()};
          target=[x,y];expected="MAP_VERMILION_CITY";
        } else return {ok:false,reason:"unexpected map "+from,state:H.observe()};
        const walk=await H.goto(...target,opts);
        if(walk.note && walk.note!=="map changed") return {ok:false,reason:walk.note,walk,state:H.observe()};
        if(door) await H.exit("U",1,opts);
        else if(from==="MAP_ROUTE6") await H.exit("D",2,opts);
        else if(H.st().map===from && H.fieldFree()) {
          const ow=frGame.overworld,p=ow.player.object.currentCoords;
          const behavior=ow.map.behaviorAt(p.x,p.y);
          const stair=[["L",H.C.DIR_WEST],["R",H.C.DIR_EAST]].find(([,dir])=>ow.player.IsDirectionalStairWarpMetatileBehavior(behavior,dir));
          // field_control_avatar.c TryArrowWarp / IsDirectionalStairWarpMetatileBehavior:
          // stairs are entered laterally while standing on the warp tile.
          if(stair) await H.exit(stair[0],1,opts);
          else if(from==="MAP_UNDERGROUND_PATH_SOUTH_ENTRANCE") await H.exit("D",1,opts);
        }
        // A stepped-on stair may start its asynchronous load after goto returns.
        // Wait for the destination itself, with no buttons, before declaring arrival.
        const arrived=await H.until(()=>H.st().map===expected&&H.fieldFree(),null,1200);
        const ok=arrived&&H.st().map===expected&&H.fieldFree();
        return {ok,reason:ok?"arrived":"map transition failed",from,expected,state:H.observe(),resources:H.resources(),battles:H.log.slice(mark).filter(e=>e.battle)};
      `,{prefix,maxFrames:500000,timeoutMs:240000});
      evidence.legs.push(leg);persist();
      if(!leg?.ok) throw Error("travel stopped: "+JSON.stringify(leg).slice(0,1500));
      if(leg.state.map==="MAP_VERMILION_CITY") break;
    }
    if((await snapshot()).status.st.map!=="MAP_VERMILION_CITY") throw Error("Vermilion not reached within leg budget");
    evidence.healing=await ctx.runEval("return await H.healAtCenter();");
    if(!evidence.healing.ok) throw Error("arrival healing failed: "+JSON.stringify(evidence.healing));
    const stamp=new Date().toISOString().replace(/[-:T]/g,"").slice(0,14);
    evidence.checkpoint=await stopCheckpoint(ctx,{name:`vermilion-arrival-${stamp}`,dir:saves,base,prefix,evidence,movementOptions:{recovery:true},kind:"Vermilion arrival; S.S.Anne/Cut/Surge not tested",provenance:{origin:evidence.loaded.path,originSha256:evidence.loaded.sha256,job:"tools/playtest/smoke/vermilion-progress.job.mjs",aids:"imported entry only; travel, battle and healing by UI; recovery walking skips field medicine policy"}});
    evidence.final=await snapshot();
    if(evidence.final.status.st.map!=="MAP_VERMILION_CITY"||!Object.values(evidence.final.reached).every(Boolean)||!evidence.final.status.st.free) throw Error("arrival or prior milestones lost after continue");
    if(ctx.errors().length) throw Error(ctx.errors().join("; "));
    evidence.status="passed";persist();return evidence;
  } catch(error) {
    evidence.status="blocked";evidence.error=String(error.stack??error);
    try {
      const stamp=new Date().toISOString().replace(/[-:T]/g,"").slice(0,14);
      evidence.stopCheckpoint=await stopCheckpoint(ctx,{name:`vermilion-stop-${stamp}`,dir:saves,base,prefix,evidence,movementOptions:{recovery:true},provenance:{origin:entry,job:"tools/playtest/smoke/vermilion-progress.job.mjs",stop:evidence.error.slice(0,500)}});
    } catch(stopError) {evidence.checkpointError=String(stopError);}
    persist();throw error;
  }
}
