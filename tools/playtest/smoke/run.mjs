import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const points = [
  ["C1", "C1-startup.job.mjs"], ["C2", "C2-new-game.job.mjs"],
  ["C3", "C3-save-continue.job.mjs"], ["C4", "C4-quest-log.job.mjs"],
  ["C5", "C5-wild-battle.job.mjs"], ["C6", "C6-trainer-battle.job.mjs"],
  ["C7", "C7-whiteout.job.mjs"], ["C8", "C8-pokemon-center-pc.job.mjs"],
  ["C9", "C9-shop.job.mjs"], ["C10", "C10-menus.job.mjs"],
  ["C11", "C11-evolution.job.mjs"], ["C12", "C12-maps.job.mjs"],
  ["C13", "C13-audio.job.mjs"], ["C14", "C14-weather.job.mjs"],
];
const reasons = {
  C1: "Intro/title/audio sequence is a long multi-screen flow; deferred for a dedicated guided smoke run.",
  C2: "Requires playing the Oak intro, starter selection and rival battle; no checkpoint captures the complete path.",
  C4: "Quest Log playback timing and final return need a dedicated state-aware scene driver.",
  C6: "Brock victory is covered by a supplied checkpoint only after the battle; battle-entry progression needs a dedicated route.",
  C11: "No supplied checkpoint is immediately before a deterministic level-up evolution.",
  C12: "Requires a full route through doors, connected maps, map labels and Mt. Moon entry.",
  C13: "Audio playback quality needs listening or dedicated audio-output measurements.",
  C14: "The requested weather outcome is visual; this pass checks game state without using captures as success evidence.",
};
let failed = false;
for (const [id, filename] of points) {
  const env = { ...process.env, PW_BASE: process.env.PW_BASE ?? "http://localhost:5174/" };
  if (reasons[id]) env.SMOKE_MANUAL_REASON = reasons[id];
  const result = spawnSync("node", ["tools/playtest/pw.mjs", resolve("tools/playtest/smoke", filename), resolve("/tmp/pw/smoke", id)], {
    cwd: process.cwd(), env, encoding: "utf8", timeout: 120000,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const jsonLine = output.split(/\r?\n/).reverse().find(line => line.trim().startsWith("{"));
  let payload;
  try { payload = JSON.parse(jsonLine); } catch { payload = { ok: false, error: output.slice(-700) }; }
  if (payload.ok && payload.result?.manual) {
    console.log(`${id} MANUAL — ${payload.result.manual}`);
  } else if (payload.ok && result.status === 0) {
    console.log(`${id} OK — ${JSON.stringify(payload.result)}`);
  } else {
    failed = true;
    const error = String(payload.error ?? result.error ?? `exit ${result.status}`).replace(/\s+/g, " ").slice(0, 420);
    console.log(`${id} FALLO — ${error}`);
  }
}
if (failed) process.exitCode = 1;
