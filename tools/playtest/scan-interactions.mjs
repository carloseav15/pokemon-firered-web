// Pre-flight for a route segment: list the interactions of the given maps (scripts.inc + map.json of the decomp)
// and whether the playtest driver can answer them, so a gap is found before a run, not in the middle of it.
// Usage: node tools/playtest/scan-interactions.mjs CeruleanCity Route24 Route25 ...   (decomp map folder names)
// Decomp: $POKEFIRERED, else ../pokefirered, else the pokefirered/ submodule (as tools/decomp/common.py).
// Exit code 1 when an interaction the driver does not support is found ("UNSUPPORTED"), 0 otherwise.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = [process.env.POKEFIRERED, "../pokefirered", "pokefirered"].filter(Boolean).map(p => resolve(p)).find(p => existsSync(join(p, "data/maps")));
if (!root) { console.error("decomp not found"); process.exit(2); }
const maps = process.argv.slice(2);
if (!maps.length) { console.error("usage: scan-interactions.mjs <MapFolder>..."); process.exit(2); }

// What the driver does with each command (driver.js / route jobs). Anything else under `special` is listed for review.
const RULES = [
  [/^msgbox .*MSGBOX_YESNO/, "input", "SUPPORTED", "H.answerYesNo(boolean) on the observed menu; the route must state the answer"],
  [/^yesnobox/, "input", "SUPPORTED", "H.answerYesNo(boolean)"],
  [/^(multichoice|multichoicedefault|multichoicegrid)\b/, "input", "UNSUPPORTED", "no multichoice helper; choose by cursor input in the route or add one"],
  [/^special (ListMenu|ChoosePartyMon|ChooseMonForMoveTutor|SelectMoveTutorMon|ChooseItemsToTossFromPyramidBag)\b/, "input", "UNSUPPORTED", "menu without a driver helper"],
  [/^pokemart\b/, "shop", "SUPPORTED", "H.buyItem(item, quantity)"],
  [/^trainerbattle_(single|no_intro|earlyrival|continue_script|continue_script_no_music)\b/, "battle", "SUPPORTED", "auto policy; check H.assessTrainer before mandatory ones"],
  [/^trainerbattle_double\b/, "battle", "UNSUPPORTED", "double battles stop the auto policy (battleDecision)"],
  [/^special (StartLegendaryBattle|StartOldManTutorialBattle|StartMarowakBattle|StartSouthernIslandBattle|StartGroudonKyogreBattle|StartRegiBattle)\b/, "battle", "REVIEW", "scripted battle: check format and whether it can be lost"],
  [/^setwildbattle\b|^dowildbattle\b/, "battle", "SUPPORTED", "wild battle: auto policy (catch is a separate decision)"],
  [/^givemon\b/, "gift", "REVIEW", "party full sends to PC; nickname prompt follows (answer it)"],
  [/^(checkitemspace|giveitem|giveitem_msg|finditem)\b/, "item", "INFO", "bag-full branch exists; normal case needs only A"],
  [/^waitbuttonpress\b/, "text", "SUPPORTED", "idle(…, tapA) presses A"],
  [/^showmoneybox\b/, "text", "INFO", "money box; no input"],
  [/^(warp|warpsilent|warpdoor|warphole|warpteleport|warpspinenter)\b/, "warp", "INFO", "scripted warp"],
  [/^setrespawn\b/, "warp", "INFO", "respawn point changes"],
  [/^special (HealPlayerParty|SetSeenMon|QuestLog_CutRecording|DrawWholeMapView|SpawnCameraObject|RemoveCameraObject|ShakeScreen|BufferMonNickname|AnimateTeleporterHousing|AnimateTeleporterCable)\b/, "special", "INFO", "no input"],
];

let unsupported = 0;
for (const name of maps) {
  const dir = join(root, "data/maps", name);
  if (!existsSync(dir)) { console.log(`\n## ${name}: not found`); unsupported++; continue; }
  const rows = [];
  const scripts = existsSync(join(dir, "scripts.inc")) ? readFileSync(join(dir, "scripts.inc"), "utf8").split("\n") : [];
  let label = "";
  scripts.forEach((raw, i) => {
    const line = raw.trim();
    if (/^[A-Za-z0-9_]+::$/.test(line)) { label = line.slice(0, -2); return; }
    const rule = RULES.find(([re]) => re.test(line));
    if (rule) rows.push({ kind: rule[1], support: rule[2], what: line.replace(/\s+/g, " ").slice(0, 90), where: `scripts.inc:${i + 1} ${label}`, note: rule[3] });
    else if (/^special /.test(line)) rows.push({ kind: "special", support: "REVIEW", what: line, where: `scripts.inc:${i + 1} ${label}`, note: "special not classified for the driver" });
  });
  const map = JSON.parse(readFileSync(join(dir, "map.json"), "utf8"));
  for (const c of map.coord_events ?? []) if (c.type === "trigger")
    rows.push({ kind: "trigger", support: "SUPPORTED", what: `coord (${c.x},${c.y}) ${c.var}=${c.var_value}`, where: `map.json ${c.script}`, note: "fires when stepped on; plan the path through or around it" });
  for (const o of map.object_events ?? []) if (o.trainer_type && o.trainer_type !== "TRAINER_TYPE_NONE")
    rows.push({ kind: "sight", support: "SUPPORTED", what: `${o.local_id ?? o.graphics_id} at (${o.x},${o.y}) range ${o.trainer_sight_or_berry_tree_id}`, where: `map.json ${o.script}`, note: "trainer sight starts a battle while walking" });
  for (const b of map.bg_events ?? []) if (b.type === "sign" && b.script && !/Sign|Text/.test(b.script))
    rows.push({ kind: "bg", support: "REVIEW", what: `bg_event (${b.x},${b.y})`, where: `map.json ${b.script}`, note: "interacted by facing it (H.talk from below); not a plain sign" });
  unsupported += rows.filter(r => r.support === "UNSUPPORTED").length;
  console.log(`\n## ${name} (${rows.length})`);
  for (const r of rows.sort((a, b) => ["UNSUPPORTED", "REVIEW", "SUPPORTED", "INFO"].indexOf(a.support) - ["UNSUPPORTED", "REVIEW", "SUPPORTED", "INFO"].indexOf(b.support)))
    console.log(`- ${r.support.padEnd(11)} ${r.kind.padEnd(8)} ${r.what} — ${r.where} — ${r.note}`);
}
console.log(`\n${unsupported ? `UNSUPPORTED: ${unsupported}` : "no unsupported interaction found"} (decomp ${root})`);
process.exitCode = unsupported ? 1 : 0;
