import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("../..",import.meta.url));
if(process.argv.length>3) throw Error("usage: npm run play:vermilion -- [output-directory]");
const out=resolve(process.argv[2]??"tools/playtest/runs/vermilion");
const child=spawn(process.execPath,["tools/playtest/pw.mjs","tools/playtest/smoke/vermilion-progress.job.mjs",out],{cwd:root,stdio:"inherit",env:{...process.env,PW_BASE:process.env.PW_BASE??"http://localhost:5197/",PW_TIMEOUT_MS:process.env.PW_TIMEOUT_MS??"1800000"}});
child.on("error",error=>{console.error(String(error));process.exitCode=1;});
child.on("exit",(code,signal)=>{process.exitCode=signal?1:code??1;});
