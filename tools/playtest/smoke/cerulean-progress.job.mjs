// Natural training -> Cerulean rival -> Bill -> Misty -> Rocket -> Route 5.
// Each story milestone uses SAVE/continue/real movement; remaining story/options are not certified.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prelude } from "./lib.mjs";
import { routeHelpers, stopCheckpoint, runJob } from "./route2-lib.mjs";
import { loadCheckpointPath } from "../checkpoint-entry.mjs";

export default async function run(ctx) {
  const out = process.argv[3] ?? "tools/playtest/runs/cerulean";
  const base = process.env.PW_BASE ?? "http://localhost:5197/";
  const saves = join(out, "saves");
  mkdirSync(saves, { recursive: true });
  // Resume only records written after SAVE, export, continue and movement all passed.
  const progressPath = join(out, "progress.jsonl");
  if (!process.env.TRAIN_ENTRY_PATH && !process.env.TRAIN_ENTRY) {
    for (const file of [join(out,"route2","evidence.json"),join(out,"milestone.json")]) {
      if (!existsSync(file)) continue;
      const prior = JSON.parse(readFileSync(file,"utf8"));
      const checkpoint = [...(prior.checkpoints ?? []), ...(prior.checkpoint ? [prior.checkpoint] : [])].reverse()
        .find(record => record.verified?.continued);
      if(checkpoint) { process.env.TRAIN_ENTRY_PATH=checkpoint.path; break; }
    }
  }
  if (!process.env.TRAIN_ENTRY_PATH && !process.env.TRAIN_ENTRY && existsSync(progressPath)) {
    const lines = readFileSync(progressPath, "utf8").trim().split("\n");
    for (const line of lines.reverse()) {
      let record; try { record = JSON.parse(line); } catch { continue; }
      if (record.checkpoint && record.verified?.continued) {
        if (!existsSync(record.checkpoint)) throw new Error("verified resume checkpoint missing: " + record.checkpoint);
        process.env.TRAIN_ENTRY_PATH = record.checkpoint;
        break;
      }
    }
  }
  process.env.TRAIN_EXPORT_DIR = saves;
  process.env.TRAIN_ROUND_BATTLES ??= "5";
  process.env.TRAIN_MAX_ROUNDS ??= "30";
  const evidence = { status: "running", entry: process.env.TRAIN_ENTRY_PATH ?? process.env.TRAIN_ENTRY ?? "cerulean-arrival", legs: [], trained: null };
  const runPath = join(out, `run-${new Date().toISOString().replace(/[-:T.]/g, "")}-${process.pid}.json`);
  const persist = () => {
    const raw = JSON.stringify(evidence, null, 2) + "\n";
    writeFileSync(runPath, raw);
    writeFileSync(join(out, "milestone.json"), raw);
  };
  persist();
  try {
    const prefix = prelude + routeHelpers;
    let resumed = null;
    if(process.env.TRAIN_ENTRY_PATH) {
      const loaded = await loadCheckpointPath(ctx,process.env.TRAIN_ENTRY_PATH,base);
      const state = await ctx.runEval(`${prefix} return {status:status(),reached:reached(status())};`);
      if(state.reached.rival && state.status.rival.trainer.some(Boolean)) resumed={loaded,state};
      if(state.status.st.map==="MAP_ROUTE5" && Object.values(state.reached).every(Boolean)) {
        evidence.resume=loaded;
        evidence.final=state;
        evidence.checkpoint={path:loaded.path,verified:{continued:true},verification:"existing completed checkpoint reloaded and milestones asserted; no overwrite"};
        evidence.status="passed";
        persist();
        return {status:"success",resumedCompleted:true,checkpoint:evidence.checkpoint,final:state};
      }
    }
    if (!resumed) {
      const { default: train } = await import("./driver-train.job.mjs");
      evidence.trained = await train(ctx);
      persist();
      // Training ends in Route 4; walk across its actual east connection, then heal by UI.
      const approach = await ctx.runEval(`${prelude}
        if (H.st().map === "MAP_ROUTE4") {
          const ow=frGame.overworld, x=ow.loaded.layout.width-1;
          let target=null;
          for(let y=0;y<ow.loaded.layout.height;y++) if(H.bfs(x+7,y+7)!==null) {target=[x,y];break;}
          if(!target) throw Error("no reachable Route 4 east edge");
          const walk=await H.goto(...target,{recovery:true});
          if(walk.note) throw Error("training exit: "+JSON.stringify(walk));
          await H.exit("R",3,{recovery:true});
        }
        if(H.st().map!=="MAP_CERULEAN_CITY") throw Error("unexpected training exit map "+H.st().map);
        const healed=await H.healAtCenter();
        if(!healed.ok) throw Error("pre-rival healing failed "+JSON.stringify(healed));
        return {healed,assessment:await H.assessTrainer(H.C.TRAINER_RIVAL_CERULEAN_CHARMANDER)};`);
      if (approach.assessment.verdict !== "favorable") throw new Error("entry is not favorable after healing");
      evidence.approach = approach;
      for (let i=0; i<20; i++) {
        const state = await ctx.runEval(`${prefix} return {status:status(),reached:reached(status())};`);
        if (state.reached.rival) {
          if (!state.status.rival.trainer.some(Boolean)) throw new Error("rival rewards without defeated trainer flag");
          if (!state.status.st.free) throw new Error("rival milestone reached without field control");
          evidence.victory = state;
          break;
        }
        const leg = await runJob(ctx, `H.battleDefaults={mode:"auto",slot:0};return await window.__step();`, {prefix, timeoutMs:300000});
        evidence.legs.push(leg);
        persist();
        if (!leg || leg.ok===false || leg.bad) throw new Error("rival approach stopped: "+JSON.stringify(leg).slice(0,1200));
      }
      if (!evidence.victory) throw new Error("rival milestone not reached within action budget");
      // A victory may leave the lead fainted. The resource policy correctly refuses
      // ordinary walking then; recover by the Center's real UI before testing SAVE.
      evidence.postVictoryHeal = await ctx.runEval(`return await H.healAtCenter();`);
      if (!evidence.postVictoryHeal.ok) throw new Error("post-victory healing failed: "+JSON.stringify(evidence.postVictoryHeal));
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0,14);
      evidence.checkpoint = await stopCheckpoint(ctx, {name:`cerulean-rival-${stamp}`,dir:saves,base,prefix,evidence,
        kind:"Cerulean rival defeated; Fame Checker received; SAVE/continue/movement verified",
        provenance:{origin:evidence.entry,job:"tools/playtest/smoke/cerulean-progress.job.mjs",aids:"none: natural wild training, nurse healing, shop and trainer battle by UI"}});
      const final = await ctx.runEval(`${prefix} return {status:status(),reached:reached(status())};`);
      if(!final.reached.rival || !final.status.rival.trainer.some(Boolean) || !final.status.st.free || ctx.errors().length) throw new Error("rival milestone not preserved after continue");
      evidence.final=final;
      persist();
    } else {
      evidence.resume=resumed.loaded;
      evidence.victory=resumed.state;
      evidence.checkpoint={path:resumed.loaded.path,verified:{continued:true},verification:"existing saved bytes matched and field control returned; no new checkpoint exported"};
      persist();
    }
    process.env.ROUTE2_ENTRY_PATH=evidence.checkpoint.path;
    process.env.ROUTE2_OUT=join(out,"route2");
    process.env.ROUTE2_EXPORT_DIR=saves;
    const {default:route}=await import("./route2.job.mjs");
    evidence.route=await route(ctx);
    evidence.status="passed";
    persist();
    return {status:"success",checkpoint:evidence.route.checkpoint,trainingRounds:evidence.trained?.rounds??0,victory:evidence.victory,route:evidence.route};
  } catch(error) {
    evidence.status="blocked";
    evidence.error=String(error.stack??error);
    evidence.browserErrors=ctx.errors();
    persist();
    throw error;
  }
}
