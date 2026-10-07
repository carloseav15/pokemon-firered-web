// H.train toward TRAINER_RIVAL_CERULEAN_CHARMANDER: wild battles in the Route 4 grass west of Cerulean City
// (encounter tiles x 75-87, y 11-14 in the exported layout), healing at the Cerulean Pokémon Center. Real input only;
// nothing is written to the game.
// Runs in rounds of TRAIN_ROUND_BATTLES battles. After each round the game is saved, exported and reloaded through
// the verified flow (stopCheckpoint), so progress survives a stop or a time budget; the previous round's file (made by
// this job, uncommitted) is then removed. Each round appends a line to <outdir>/progress.jsonl. Resume with
// TRAIN_ENTRY=<checkpoint name>. A favorable estimate ends with the checkpoint cerulean-trained.
// Checks: the estimate starts unfavorable, medicine is kept, levels never drop and the field is free after each round.
import { appendFileSync, mkdirSync, rmSync } from "node:fs";
import { prelude } from "./lib.mjs";
import { runJob, stopCheckpoint } from "./son-mm-lib.mjs";

const outdir = process.argv[3] ?? "/tmp/pw/train";
const base = process.env.PW_BASE ?? "http://localhost:5173/";
const entry = process.env.TRAIN_ENTRY ?? "cerulean-arrival";
const roundBattles = Number(process.env.TRAIN_ROUND_BATTLES ?? 15);
const maxRounds = Number(process.env.TRAIN_MAX_ROUNDS ?? 12);
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

const trainBody = `
  const C = H.C;
  // Map edges are found with the driver's BFS (Route 4 has one-way ledges): the first reachable edge tile.
  const edge = (x) => { for (let y = 0; y < 40; y++) if (H.bfs(x + 7, y + 7) !== null) return [x, y]; return null; };
  const toRoute4 = async () => {
    if (H.st().map === "MAP_CERULEAN_CITY") {
      const e0 = edge(0); if (!e0) return { note: "no reachable west edge in Cerulean" };
      const w = await H.goto(...e0, { recovery: true }); if (w.note) return w;
      const e = await H.exit("L", 3, { recovery: true }); if (H.st().map !== "MAP_ROUTE4") return { note: "did not reach Route 4", e };
    }
    return { ok: true };
  };
  const heal = async () => {
    const e1 = edge(107); if (!e1) return { ok: false, note: "no reachable east edge on Route 4" };
    const g = await H.goto(...e1, { recovery: true });
    if (g.note) return { ok: false, note: "to Cerulean: " + g.note };
    await H.exit("R", 3, { recovery: true });
    if (H.st().map !== "MAP_CERULEAN_CITY") return { ok: false, note: "did not reach Cerulean" };
    const c = await H.healAtCenter();
    if (!c.ok) return c;
    const back = await toRoute4();
    return back.note ? { ok: false, note: back.note } : { ok: true };
  };
  const t0 = await toRoute4();
  if (t0.note) return { ok: false, reason: t0.note };
  return await H.train({ trainer: C.TRAINER_RIVAL_CERULEAN_CHARMANDER, between: [[80, 12], [80, 14]], maxBattles: ${roundBattles}, heal });
`;
const snapshot = `return { potions: H.countItem(H.C.ITEM_POTION), money: frDebug.save.save.money,
  party: H.resources().party.map(m => [m.species, m.level, m.hp + "/" + m.maxHP, [...m.moves]]), field: H.fieldFree(), st: H.st() };`;

export default async function run(ctx) {
  mkdirSync(outdir, { recursive: true });
  const log = (o) => appendFileSync(`${outdir}/progress.jsonl`, JSON.stringify({ t: new Date().toISOString(), ...o }) + "\n");
  await ctx.loadSave(entry);
  const first = await ctx.runEval(snapshot);
  log({ round: 0, entry, ...first });
  let previous = null, last = first, final = null;
  for (let round = 1; round <= maxRounds; round++) {
    const r = await runJob(ctx, trainBody, { prefix: prelude, maxFrames: 1500000, timeoutMs: 1500000 });
    const now = await ctx.runEval(snapshot);
    log({ round, train: r && { ok: r.ok, reason: r.reason, battles: r.battles, heals: r.heals?.length, evolutions: r.evolutions, start: r.start, end: r.end }, ...now });
    if (ctx.errors().length) throw new Error("browser errors: " + ctx.errors().join("; "));
    if (round === 1 && r?.start?.verdict === "favorable") throw new Error("estimate was already favorable: " + JSON.stringify(r.start));
    if (now.potions !== first.potions) throw new Error("medicine used while training: " + JSON.stringify([first.potions, now.potions]));
    if (now.party.some((m, i) => m[1] < last.party[i][1])) throw new Error("a level dropped: " + JSON.stringify([last.party, now.party]));
    if (!now.field) throw new Error("field not free after round " + round + ": " + JSON.stringify(now.st));
    if (!r || r.ok === false && r.reason !== "battle budget") throw new Error(`round ${round} stopped: ${JSON.stringify(r).slice(0, 1200)}`);
    const done = r.ok === true;
    const name = done ? "cerulean-trained" : `cerulean-training-${stamp}-r${round}`;
    const evidence = {};
    const cp = await stopCheckpoint(ctx, { name, dir: "tools/playtest/saves", evidence, base, prefix: prelude,
      kind: done ? "trained before the Cerulean rival by H.train (natural wild battles); route not PASS" : `training round ${round} (resume with TRAIN_ENTRY)`,
      provenance: { origin: `tools/playtest/saves/${entry}.json`, job: "tools/playtest/smoke/driver-train.job.mjs", round, aids: "none: wild battles with the auto policy, nurse heals" } });
    log({ round, checkpoint: cp.path, verified: cp.verified });
    if (previous) for (const f of [previous.path, previous.provenancePath]) rmSync(f, { force: true });
    previous = done ? null : cp;
    last = now;
    if (done) { final = { rounds: round, checkpoint: cp, train: r, party: now.party }; break; }
  }
  if (!final) throw new Error(`not favorable after ${maxRounds} rounds; resume with TRAIN_ENTRY=${previous?.path?.split("/").pop()?.replace(/\.json$/, "")}`);
  return { entry, first, ...final };
}
