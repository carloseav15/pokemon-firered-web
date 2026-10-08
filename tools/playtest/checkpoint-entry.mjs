import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

// Import saved bytes; this prepares the entry, never a battle result or story flag.
export async function loadCheckpointPath(ctx, path, base) {
  const absolute = resolve(path), raw = readFileSync(absolute, "utf8");
  const data = JSON.parse(raw);
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const provenancePath = absolute.replace(/\.json$/, ".provenance.json");
  if (provenancePath !== absolute && existsSync(provenancePath)) {
    const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
    if (provenance.sha256 !== sha256) throw new Error("checkpoint provenance hash differs: " + absolute);
  }
  if (!Array.isArray(data.party) || !data.location || !data.pos) throw new Error("invalid checkpoint: " + absolute);
  await ctx.page.goto(base, { waitUntil: "load" });
  await ctx.page.evaluate(async raw => {
    const S = await import("/src/fr/save.ts");
    localStorage.setItem(S.CANONICAL_STORAGE_KEY, raw);
  }, raw);
  await ctx.page.goto(`${base}?fr=continue`, { waitUntil: "load" });
  const ready = await ctx.runEval(`const { H } = await import("/tools/playtest/driver.js"); window.H = H; return await H.ready();`);
  if (!ready.ok || !ready.fieldFree) throw new Error("checkpoint did not return control: " + JSON.stringify(ready));
  const actual = await ctx.runEval(`return H.saveSnapshot();`);
  const expected = {
    x: data.pos.x, y: data.pos.y, money: data.money,
    party: data.party.filter(m => m.species).map(m => ({ species: m.species, personality: m.personality, otId: m.otId,
      level: m.level, exp: m.exp, hp: m.hp, status: m.status, moves: m.moves, pp: m.pp, heldItem: m.heldItem })),
    bag: data.bag, heal: data.lastHealLocation, escape: data.escapeWarp,
  };
  for (const [key, value] of Object.entries(expected)) if (JSON.stringify(actual[key]) !== JSON.stringify(value))
    throw new Error("continued checkpoint differs in " + key + ": " + absolute);
  const location = await ctx.runEval(`return {...frDebug.save.save.location};`);
  if (location.mapGroup !== data.location.mapGroup || location.mapNum !== data.location.mapNum)
    throw new Error("continued checkpoint map differs: " + absolute);
  return { ready, snapshot: actual, path: absolute, sha256 };
}
